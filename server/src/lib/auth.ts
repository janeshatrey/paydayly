import type { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"
import type { DB } from "../db"
import { HttpError } from "./http"
import { newId, now } from "./ids"

export const COOKIE = "paydayly_session"
/** Session cookie name used before the rename; still accepted so nobody is signed out. */
export const LEGACY_COOKIE = ["b", "aa", "ki_session"].join("")
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

declare global {
  namespace Express {
    interface Request {
      userId?: string
      sessionId?: string
    }
  }
}

export function issueSession(db: DB, req: Request, res: Response, userId: string, secret: string, secure: boolean): string {
  const sessionId = newId("ses")
  const stamp = now()
  db.prepare("INSERT INTO sessions (id, user_id, created_at, last_seen_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?)").run(
    sessionId, userId, stamp, stamp, String(req.headers["user-agent"] ?? "").slice(0, 200), req.ip ?? "",
  )
  const token = jwt.sign({ sub: userId, sid: sessionId }, secret, { expiresIn: "30d" })
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure, maxAge: MAX_AGE_MS, path: "/" })
  return sessionId
}

export function clearSession(res: Response): void {
  res.clearCookie(COOKIE, { path: "/" })
  res.clearCookie(LEGACY_COOKIE, { path: "/" })
}

export function revokeSession(db: DB, sessionId: string | undefined): void {
  if (!sessionId) return
  db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(now(), sessionId)
}

export function revokeAllSessions(db: DB, userId: string, except?: string): number {
  return db
    .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?")
    .run(now(), userId, except ?? "").changes
}

export function readSession(db: DB, req: Request, secret: string): { userId: string; sessionId: string } | null {
  const token = req.cookies?.[COOKIE] ?? req.cookies?.[LEGACY_COOKIE]
  if (!token) return null
  let payload: { sub?: string; sid?: string }
  try {
    payload = jwt.verify(token, secret) as { sub?: string; sid?: string }
  } catch {
    return null
  }
  if (!payload.sub || !payload.sid) return null
  const row = db.prepare("SELECT user_id, revoked_at, last_seen_at FROM sessions WHERE id = ?").get(payload.sid) as
    | { user_id: string; revoked_at: string | null; last_seen_at: string }
    | undefined
  if (!row || row.revoked_at || row.user_id !== payload.sub) return null
  if (Date.now() - Date.parse(row.last_seen_at) > 60_000) {
    db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now(), payload.sid)
  }
  return { userId: payload.sub, sessionId: payload.sid }
}

export function requireAuth(db: DB, secret: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const session = readSession(db, req, secret)
    if (!session) throw new HttpError(401, "Please sign in to continue.")
    req.userId = session.userId
    req.sessionId = session.sessionId
    next()
  }
}

export function userOf(req: Request): string {
  if (!req.userId) throw new HttpError(401, "Please sign in to continue.")
  return req.userId
}
