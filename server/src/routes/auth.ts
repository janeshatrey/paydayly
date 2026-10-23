import bcrypt from "bcryptjs"
import crypto from "node:crypto"
import { Router } from "express"
import rateLimit from "express-rate-limit"
import { z } from "zod"
import type { DB } from "../db"
import { clearSession, issueSession, readSession, requireAuth, revokeAllSessions, revokeSession, userOf } from "../lib/auth"
import { body, HttpError } from "../lib/http"
import { newId, now } from "../lib/ids"
import type { AppConfig } from "../app"
import { ensureMainAccount } from "../services/ledger"

const signupSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(80),
  email: z.email("Enter a valid email").max(160),
  password: z.string().min(8, "Use at least 8 characters").max(200),
})

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
})

const forgotSchema = z.object({ email: z.email("Enter a valid email") })

const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8, "Use at least 8 characters").max(200),
})

const RESET_TTL_MS = 30 * 60 * 1000

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

interface UserRow {
  id: string
  email: string
  name: string
  password_hash: string
  created_at: string
}

export function publicUser(db: DB, userId: string) {
  const user = db.prepare("SELECT id, email, name, created_at FROM users WHERE id = ?").get(userId) as Omit<UserRow, "password_hash"> | undefined
  if (!user) return null
  const profile = db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(userId) as Record<string, unknown>
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.created_at,
    profile: {
      incomePaise: profile.income_paise as number | null,
      payday: profile.payday as number,
      weekendWeighted: profile.weekend_weighted === 1,
      weekendWeight: profile.weekend_weight as number,
      asOfDate: profile.as_of_date as string | null,
      onboarded: profile.onboarded === 1,
      theme: profile.theme as string,
      savingsTargetPaise: profile.savings_target_paise as number | null,
      bufferPaise: profile.buffer_paise as number | null,
      trackingSince: profile.tracking_since as string | null,
      salaryDelayedFor: profile.salary_delayed_for as string | null,
      language: (profile.language === "hi" ? "hi" : "en") as "en" | "hi",
    },
  }
}

export function authRoutes(db: DB, config: AppConfig): Router {
  const router = Router()
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.authRateLimit, standardHeaders: true, legacyHeaders: false })

  router.post("/signup", limiter, async (req, res) => {
    const input = body(signupSchema, req)
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(input.email)
    if (existing) throw new HttpError(409, "An account with this email already exists.")
    const hash = await bcrypt.hash(input.password, 12)
    const id = newId("usr")
    db.transaction(() => {
      db.prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
        id, input.email.toLowerCase(), input.name, hash, now(),
      )
      db.prepare("INSERT INTO profiles (user_id) VALUES (?)").run(id)
      ensureMainAccount(db, id)
    })()
    issueSession(db, req, res, id, config.secret, config.secureCookies)
    res.status(201).json({ user: publicUser(db, id) })
  })

  router.post("/login", limiter, async (req, res) => {
    const input = body(loginSchema, req)
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(input.email.toLowerCase()) as UserRow | undefined
    const valid = user ? await bcrypt.compare(input.password, user.password_hash) : false
    if (!user || !valid) throw new HttpError(401, "That email and password do not match.")
    issueSession(db, req, res, user.id, config.secret, config.secureCookies)
    res.json({ user: publicUser(db, user.id) })
  })

  router.post("/logout", (req, res) => {
    revokeSession(db, readSession(db, req, config.secret)?.sessionId)
    clearSession(res)
    res.status(204).end()
  })

  router.get("/me", (req, res) => {
    const session = readSession(db, req, config.secret)
    const user = session ? publicUser(db, session.userId) : null
    if (!user) throw new HttpError(401, "Not signed in.")
    res.json({ user })
  })

  router.post("/forgot", limiter, async (req, res) => {
    const input = body(forgotSchema, req)
    if (!config.onResetToken && !config.logResetLinks) throw new HttpError(503, "Password recovery is not configured yet. Please contact the site owner.")
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(input.email.toLowerCase()) as { id: string } | undefined
    if (user) {
      const token = crypto.randomBytes(32).toString("base64url")
      db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
        hashToken(token), user.id, new Date(Date.now() + RESET_TTL_MS).toISOString(),
      )
      if (config.logResetLinks) {
        console.log(`Password reset link for ${input.email.toLowerCase()}: ${config.publicUrl ?? "http://localhost:5173"}/reset?token=${token}`)
      }
      try {
        await config.onResetToken?.(input.email.toLowerCase(), token)
      } catch {
        db.prepare("DELETE FROM password_resets WHERE token_hash = ?").run(hashToken(token))
        // Do not expose account existence or provider details in the response.
        console.error("Password reset email could not be delivered. Check mail provider configuration.")
      }
    }
    res.status(202).json({ ok: true })
  })

  router.post("/reset", limiter, async (req, res) => {
    const input = body(resetSchema, req)
    const row = db.prepare("SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?").get(hashToken(input.token)) as
      | { user_id: string; expires_at: string; used_at: string | null }
      | undefined
    if (!row || row.used_at || Date.parse(row.expires_at) < Date.now()) {
      throw new HttpError(400, "This reset link has expired or was already used. Ask for a new one.")
    }
    const hash = await bcrypt.hash(input.password, 12)
    db.transaction(() => {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, row.user_id)
      db.prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ?").run(now(), hashToken(input.token))
      revokeAllSessions(db, row.user_id)
    })()
    res.json({ ok: true })
  })

  const auth = requireAuth(db, config.secret)

  router.get("/sessions", auth, (req, res) => {
    const rows = db
      .prepare("SELECT id, created_at, last_seen_at, user_agent, ip FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC")
      .all(userOf(req)) as { id: string; created_at: string; last_seen_at: string; user_agent: string; ip: string }[]
    res.json({
      sessions: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        userAgent: row.user_agent,
        ip: row.ip,
        current: row.id === req.sessionId,
      })),
    })
  })

  router.post("/sessions/others/revoke", auth, (req, res) => {
    res.json({ revoked: revokeAllSessions(db, userOf(req), req.sessionId) })
  })

  router.delete("/sessions/:id", auth, (req, res) => {
    db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL").run(now(), String(req.params.id), userOf(req))
    res.status(204).end()
  })

  return router
}
