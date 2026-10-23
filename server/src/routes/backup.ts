import { Router } from "express"
import { z } from "zod"
import type { DB } from "../db"
import { userOf } from "../lib/auth"
import { HttpError } from "../lib/http"
import { newId } from "../lib/ids"
import { buildDashboard } from "../services/insights"
import { audit } from "../services/ledger"

const TABLES = [
  "accounts",
  "commitments",
  "goals",
  "imports",
  "transactions",
  "rules",
  "merchant_aliases",
  "budgets",
  "dismissed_flags",
  "balance_confirmations",
  "goal_allocations",
  "receivables",
  "bill_marks",
] as const

const REFERENCES = ["account_id", "counter_account_id", "commitment_id", "goal_id", "receivable_id", "refund_of_id", "import_id", "tx_id"]
const PROFILE_FIELDS = [
  "income_paise", "payday", "weekend_weighted", "weekend_weight", "as_of_date", "onboarded", "theme",
  "savings_target_paise", "buffer_paise", "tracking_since", "salary_delayed_for", "language",
]

const restoreSchema = z.object({
  app: z.literal("paydayly"),
  version: z.literal(1),
  profile: z.record(z.string(), z.unknown()),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown())).max(200_000)),
})

type Row = Record<string, unknown>

export function exportBackup(db: DB, userId: string) {
  const profile = db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(userId) as Row
  const tables: Record<string, Row[]> = {}
  for (const table of TABLES) {
    tables[table] = (db.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).all(userId) as Row[]).map(({ user_id: _owner, ...rest }) => rest)
  }
  const kept: Row = {}
  for (const field of PROFILE_FIELDS) kept[field] = profile[field]
  return { app: "paydayly", version: 1, exportedAt: new Date().toISOString(), profile: kept, tables }
}

export function restoreBackup(db: DB, userId: string, data: z.infer<typeof restoreSchema>): number {
  const columns = new Map<string, Set<string>>()
  for (const table of TABLES) {
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
    columns.set(table, new Set(info.map((item) => item.name)))
  }
  const ids = new Map<string, string>()
  for (const table of TABLES) {
    for (const row of data.tables[table] ?? []) {
      if (typeof row.id === "string") ids.set(row.id, newId(row.id.split("_")[0] || "id"))
    }
  }
  let count = 0
  db.transaction(() => {
    for (const table of [...TABLES].reverse()) db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId)
    db.prepare("DELETE FROM available_history WHERE user_id = ?").run(userId)
    for (const table of TABLES) {
      const allowed = columns.get(table)!
      for (const source of data.tables[table] ?? []) {
        const row: Row = {}
        for (const [key, value] of Object.entries(source)) {
          if (!allowed.has(key) || key === "user_id") continue
          if (value !== null && typeof value === "object") throw new HttpError(400, `The backup has an unexpected value in ${table}.`)
          row[key] = key === "id" || REFERENCES.includes(key) ? (typeof value === "string" ? ids.get(value) ?? value : value) : value
        }
        row.user_id = userId
        const keys = Object.keys(row)
        db.prepare(`INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`).run(...keys.map((key) => row[key] as never))
        count += 1
      }
    }
    for (const field of PROFILE_FIELDS) {
      if (!(field in data.profile)) continue
      const value = data.profile[field]
      if (value !== null && typeof value === "object") continue
      db.prepare(`UPDATE profiles SET ${field} = ? WHERE user_id = ?`).run(value as never, userId)
    }
  })()
  return count
}

export function backupRoutes(db: DB): Router {
  const router = Router()

  router.get("/backup", (req, res) => {
    const userId = userOf(req)
    res.setHeader("Content-Disposition", 'attachment; filename="paydayly-backup.json"')
    res.json(exportBackup(db, userId))
  })

  router.post("/restore", (req, res) => {
    const userId = userOf(req)
    const parsed = restoreSchema.safeParse(req.body)
    if (!parsed.success) throw new HttpError(400, "This does not look like a Paydayly backup file.")
    let restored: number
    try {
      restored = restoreBackup(db, userId, parsed.data)
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw new HttpError(400, "The backup could not be restored. Nothing was changed.")
    }
    audit(db, userId, "restore", `Restored ${restored} records from a backup`)
    buildDashboard(db, userId)
    res.json({ restored })
  })

  return router
}
