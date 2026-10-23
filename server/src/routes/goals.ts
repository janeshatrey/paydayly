import { Router } from "express"
import { z } from "zod"
import type { DB } from "../db"
import { userOf } from "../lib/auth"
import { body, HttpError, isoDate, paise } from "../lib/http"
import { newId, now } from "../lib/ids"
import { goalView } from "../services/insights"
import { asOfFor, audit, getProfile, listGoals } from "../services/ledger"

const goalSchema = z.object({
  name: z.string().trim().min(1, "Name your goal").max(60),
  targetPaise: paise.refine((value) => value > 0, "Target must be more than zero"),
  savedPaise: paise.default(0),
  monthlyPaise: paise.default(0),
  deadline: isoDate.nullable().default(null),
})

const contributionSchema = z.object({ amountPaise: z.number().int().min(-1_000_000_000).max(1_000_000_000), date: isoDate.optional() })

export function goalRoutes(db: DB): Router {
  const router = Router()
  const find = (userId: string, id: string) => listGoals(db, userId).find((goal) => goal.id === id)

  router.get("/goals", (req, res) => {
    res.json({ goals: listGoals(db, userOf(req)).map(goalView) })
  })

  router.post("/goals", (req, res) => {
    const userId = userOf(req)
    const input = body(goalSchema, req)
    const id = newId("gl")
    db.prepare(
      "INSERT INTO goals (id, user_id, name, target_paise, saved_paise, monthly_paise, deadline, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, userId, input.name, input.targetPaise, input.savedPaise, input.monthlyPaise, input.deadline, now())
    res.status(201).json({ goal: goalView(find(userId, id)!) })
  })

  router.put("/goals/:id", (req, res) => {
    const userId = userOf(req)
    const input = body(goalSchema, req)
    const result = db
      .prepare("UPDATE goals SET name = ?, target_paise = ?, saved_paise = ?, monthly_paise = ?, deadline = ? WHERE id = ? AND user_id = ?")
      .run(input.name, input.targetPaise, input.savedPaise, input.monthlyPaise, input.deadline, req.params.id, userId)
    if (result.changes === 0) throw new HttpError(404, "That goal was not found.")
    res.json({ goal: goalView(find(userId, String(req.params.id))!) })
  })

  router.post("/goals/:id/contributions", (req, res) => {
    const userId = userOf(req)
    const input = body(contributionSchema, req)
    const goal = find(userId, String(req.params.id))
    if (!goal) throw new HttpError(404, "That goal was not found.")
    const amount = Math.max(input.amountPaise, -goal.saved_paise)
    const date = input.date ?? asOfFor(getProfile(db, userId))
    db.transaction(() => {
      db.prepare("UPDATE goals SET saved_paise = saved_paise + ? WHERE id = ?").run(amount, goal.id)
      db.prepare("INSERT INTO goal_allocations (id, user_id, goal_id, date, amount_paise, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        newId("ga"), userId, goal.id, date, amount, now(),
      )
    })()
    audit(db, userId, "goal", `${amount >= 0 ? "Set aside" : "Took back"} ${Math.abs(amount)} paise for ${goal.name}`)
    res.json({ goal: goalView(find(userId, String(req.params.id))!) })
  })

  router.delete("/goals/:id", (req, res) => {
    const result = db.prepare("DELETE FROM goals WHERE id = ? AND user_id = ?").run(req.params.id, userOf(req))
    if (result.changes === 0) throw new HttpError(404, "That goal was not found.")
    res.status(204).end()
  })

  return router
}
