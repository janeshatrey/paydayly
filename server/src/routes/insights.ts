import { Router } from "express"
import { z } from "zod"
import type { DB } from "../db"
import { userOf } from "../lib/auth"
import { query } from "../lib/http"
import { buildDashboard, buildMonth } from "../services/insights"
import { asOfFor, getProfile } from "../services/ledger"

export function insightRoutes(db: DB): Router {
  const router = Router()

  router.get("/dashboard", (req, res) => {
    res.json(buildDashboard(db, userOf(req)))
  })

  router.get("/month", (req, res) => {
    const userId = userOf(req)
    const fallback = asOfFor(getProfile(db, userId)).slice(0, 7)
    const input = query(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }), req)
    res.json(buildMonth(db, userId, input.month ?? fallback))
  })

  router.post("/flags/:id/dismiss", (req, res) => {
    const userId = userOf(req)
    db.prepare("INSERT OR IGNORE INTO dismissed_flags (user_id, flag_id) VALUES (?, ?)").run(userId, req.params.id)
    db.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND key = ?").run(
      new Date().toISOString(), userId, req.params.id,
    )
    res.status(204).end()
  })

  return router
}
