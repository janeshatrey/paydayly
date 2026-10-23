import type { Request, Response } from "express"
import type { DB } from "../db"
import { now } from "./ids"

function keyOf(req: Request): string | null {
  const raw = req.headers["idempotency-key"]
  const key = Array.isArray(raw) ? raw[0] : raw
  if (!key || key.length > 100) return null
  return `${req.method} ${req.path} ${key}`
}

export function replayed(db: DB, userId: string, req: Request, res: Response): boolean {
  const key = keyOf(req)
  if (!key) return false
  const row = db.prepare("SELECT status, response FROM idempotency WHERE user_id = ? AND key = ?").get(userId, key) as
    | { status: number; response: string }
    | undefined
  if (!row) return false
  res.status(row.status).setHeader("Idempotent-Replay", "true").json(JSON.parse(row.response))
  return true
}

export function respond(db: DB, userId: string, req: Request, res: Response, status: number, payload: unknown): void {
  const key = keyOf(req)
  if (key) {
    db.prepare("INSERT OR REPLACE INTO idempotency (user_id, key, status, response, created_at) VALUES (?, ?, ?, ?, ?)").run(
      userId, key, status, JSON.stringify(payload), now(),
    )
    db.prepare("DELETE FROM idempotency WHERE user_id = ? AND created_at < ?").run(userId, new Date(Date.now() - 86_400_000).toISOString())
  }
  res.status(status).json(payload)
}
