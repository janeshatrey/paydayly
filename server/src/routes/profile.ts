import bcrypt from "bcryptjs"
import { CATEGORIES, COMMITMENT_KINDS, indiaToday } from "@paydayly/shared"
import { Router } from "express"
import { z } from "zod"
import type { DB } from "../db"
import { clearSession, userOf } from "../lib/auth"
import { body, HttpError, isoDate, paise } from "../lib/http"
import { newId, now } from "../lib/ids"
import { applyRule, audit, listCommitments, listRules } from "../services/ledger"
import { publicUser } from "./auth"

const kinds = COMMITMENT_KINDS.map((item) => item.kind) as [string, ...string[]]
const category = z.enum(CATEGORIES)

const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    incomePaise: paise.nullable(),
    payday: z.number().int().min(1).max(31),
    weekendWeighted: z.boolean(),
    weekendWeight: z.number().min(1).max(3),
    asOfDate: isoDate.nullable(),
    onboarded: z.boolean(),
    theme: z.enum(["light", "dark", "system"]),
    savingsTargetPaise: paise.nullable(),
    bufferPaise: paise.nullable(),
    salaryDelayedFor: isoDate.nullable(),
    language: z.enum(["en", "hi"]),
  })
  .partial()

const commitmentSchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(60),
  kind: z.enum(kinds),
  amountPaise: paise.refine((value) => value > 0, "Amount must be more than zero"),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  frequency: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  dueMonth: z.number().int().min(1).max(12).nullable().optional(),
})

const budgetsSchema = z.object({
  budgets: z.array(z.object({ category, limitPaise: paise })).max(CATEGORIES.length),
})

const ruleSchema = z.object({ pattern: z.string().trim().min(2).max(60), category })

function commitmentView(row: ReturnType<typeof listCommitments>[number]) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    amountPaise: row.amount_paise,
    dueDay: row.due_day,
    frequency: row.frequency,
    dueMonth: row.due_month,
  }
}

export function profileRoutes(db: DB): Router {
  const router = Router()

  router.get("/me", (req, res) => {
    res.json({ user: publicUser(db, userOf(req)) })
  })

  router.patch("/profile", (req, res) => {
    const userId = userOf(req)
    const input = body(profileSchema, req)
    const columns: Record<string, string> = {
      incomePaise: "income_paise",
      payday: "payday",
      weekendWeighted: "weekend_weighted",
      weekendWeight: "weekend_weight",
      asOfDate: "as_of_date",
      onboarded: "onboarded",
      theme: "theme",
      savingsTargetPaise: "savings_target_paise",
      bufferPaise: "buffer_paise",
      salaryDelayedFor: "salary_delayed_for",
      language: "language",
    }
    db.transaction(() => {
      if (input.name) db.prepare("UPDATE users SET name = ? WHERE id = ?").run(input.name, userId)
      for (const [key, column] of Object.entries(columns)) {
        const value = input[key as keyof typeof input]
        if (value === undefined) continue
        const stored = typeof value === "boolean" ? Number(value) : value
        db.prepare(`UPDATE profiles SET ${column} = ? WHERE user_id = ?`).run(stored, userId)
      }
      if (input.onboarded) {
        const start = input.asOfDate ?? (db.prepare("SELECT as_of_date FROM profiles WHERE user_id = ?").get(userId) as { as_of_date: string | null }).as_of_date ?? indiaToday()
        db.prepare("UPDATE profiles SET tracking_since = COALESCE(tracking_since, ?) WHERE user_id = ?").run(start, userId)
      }
      const changed = Object.keys(input).filter((key) => key !== "theme" && key !== "language")
      if (changed.length) audit(db, userId, "profile", `Updated ${changed.join(", ")}`)
    })()
    res.json({ user: publicUser(db, userId) })
  })

  router.get("/commitments", (req, res) => {
    res.json({ commitments: listCommitments(db, userOf(req)).map(commitmentView) })
  })

  router.post("/commitments", (req, res) => {
    const userId = userOf(req)
    const input = body(commitmentSchema, req)
    const id = newId("cm")
    db.prepare(
      "INSERT INTO commitments (id, user_id, name, kind, amount_paise, due_day, frequency, due_month, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, userId, input.name, input.kind, input.amountPaise, input.dueDay ?? null, input.frequency ?? "monthly", input.dueMonth ?? null, now())
    audit(db, userId, "commitment", `Added ${input.name}`)
    const row = listCommitments(db, userId).find((item) => item.id === id)!
    res.status(201).json({ commitment: commitmentView(row) })
  })

  router.put("/commitments/:id", (req, res) => {
    const userId = userOf(req)
    const input = body(commitmentSchema, req)
    const result = db
      .prepare("UPDATE commitments SET name = ?, kind = ?, amount_paise = ?, due_day = ?, frequency = ?, due_month = ? WHERE id = ? AND user_id = ?")
      .run(input.name, input.kind, input.amountPaise, input.dueDay ?? null, input.frequency ?? "monthly", input.dueMonth ?? null, String(req.params.id), userId)
    if (result.changes) audit(db, userId, "commitment", `Changed ${input.name}`)
    if (result.changes === 0) throw new HttpError(404, "That commitment was not found.")
    const row = listCommitments(db, userId).find((item) => item.id === req.params.id)!
    res.json({ commitment: commitmentView(row) })
  })

  router.delete("/commitments/:id", (req, res) => {
    const result = db.prepare("DELETE FROM commitments WHERE id = ? AND user_id = ?").run(req.params.id, userOf(req))
    if (result.changes === 0) throw new HttpError(404, "That commitment was not found.")
    res.status(204).end()
  })

  router.get("/budgets", (req, res) => {
    const rows = db.prepare("SELECT category, limit_paise FROM budgets WHERE user_id = ? ORDER BY category").all(userOf(req)) as {
      category: string
      limit_paise: number
    }[]
    res.json({ budgets: rows.map((row) => ({ category: row.category, limitPaise: row.limit_paise })) })
  })

  router.put("/budgets", (req, res) => {
    const userId = userOf(req)
    const input = body(budgetsSchema, req)
    db.transaction(() => {
      db.prepare("DELETE FROM budgets WHERE user_id = ?").run(userId)
      const insert = db.prepare("INSERT INTO budgets (user_id, category, limit_paise) VALUES (?, ?, ?)")
      for (const item of input.budgets) if (item.limitPaise > 0) insert.run(userId, item.category, item.limitPaise)
    })()
    res.json({ budgets: input.budgets.filter((item) => item.limitPaise > 0) })
  })

  router.get("/categories", (_req, res) => {
    res.json({ categories: CATEGORIES, commitmentKinds: COMMITMENT_KINDS })
  })

  router.get("/rules", (req, res) => {
    res.json({ rules: listRules(db, userOf(req)) })
  })

  router.post("/rules", (req, res) => {
    const userId = userOf(req)
    const input = body(ruleSchema, req)
    const pattern = input.pattern.toLowerCase()
    db.prepare(
      "INSERT INTO rules (id, user_id, pattern, category, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, pattern) DO UPDATE SET category = excluded.category",
    ).run(newId("rl"), userId, pattern, input.category, now())
    const updated = applyRule(db, userId, pattern, input.category)
    res.status(201).json({ rules: listRules(db, userId), updated })
  })

  router.delete("/rules/:id", (req, res) => {
    db.prepare("DELETE FROM rules WHERE id = ? AND user_id = ?").run(req.params.id, userOf(req))
    res.status(204).end()
  })

  router.delete("/account", async (req, res) => {
    const userId = userOf(req)
    const input = body(z.object({ password: z.string().min(1, "Enter your password") }), req)
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as { password_hash: string }
    if (!(await bcrypt.compare(input.password, row.password_hash))) throw new HttpError(403, "That password is not right.")
    db.prepare("DELETE FROM users WHERE id = ?").run(userId)
    clearSession(res)
    res.status(204).end()
  })

  router.delete("/data", (req, res) => {
    const userId = userOf(req)
    db.transaction(() => {
      for (const table of [
        "transactions", "rules", "dismissed_flags", "notifications", "imports", "receivables", "balance_confirmations",
        "goal_allocations", "bill_marks", "available_history", "ai_cache",
      ]) {
        db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId)
      }
    })()
    res.status(204).end()
  })

  return router
}
