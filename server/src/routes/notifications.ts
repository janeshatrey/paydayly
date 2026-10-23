import { Router } from "express"
import type { DB } from "../db"
import { userOf } from "../lib/auth"
import { now } from "../lib/ids"

export function notificationRoutes(db: DB): Router {
  const router = Router()

  router.get("/notifications", (req, res) => {
    const userId = userOf(req)
    const rows = db
      .prepare("SELECT id, kind, title, body, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 60")
      .all(userId) as { id: string; kind: string; title: string; body: string; created_at: string; read_at: string | null }[]
    const unread = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").get(userId) as { n: number }
    res.json({
      unread: unread.n,
      notifications: rows.map((row) => ({ id: row.id, kind: row.kind, title: row.title, body: row.body, createdAt: row.created_at, read: row.read_at !== null })),
    })
  })

  router.post("/notifications/read", (req, res) => {
    db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").run(now(), userOf(req))
    res.status(204).end()
  })

  router.post("/notifications/:id/read", (req, res) => {
    db.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND id = ?").run(now(), userOf(req), req.params.id)
    res.status(204).end()
  })

  return router
}
