import { applyMapping, bucketOf, mappingConfidence, CATEGORIES, checkFile, guessMapping, readCsvTable, similarPattern, transactionsToCsv, type ImportedRow } from "@paydayly/shared"
import { Router } from "express"
import { z } from "zod"
import type { DB } from "../db"
import { userOf } from "../lib/auth"
import { body, HttpError, isoDate, paise, query } from "../lib/http"
import { newId, now } from "../lib/ids"
import { buildDashboard } from "../services/insights"
import { replayed, respond } from "../lib/idempotency"
import { applyRule, audit, categoriseRows, fingerprintKey, importDuplicateCounts, getTransaction, insertTransactions, listAccounts, loadSettings, loadTransactions } from "../services/ledger"

const category = z.enum(CATEGORIES)
const time = z.string().regex(/^\d{2}:\d{2}$/, "Use the format HH:MM")

const listSchema = z.object({
  q: z.string().max(80).optional(),
  category: category.optional(),
  direction: z.enum(["debit", "credit"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

const createSchema = z.object({
  date: isoDate,
  time: time.default("12:00"),
  amountPaise: paise.refine((value) => value > 0, "Amount must be more than zero"),
  direction: z.enum(["debit", "credit"]).default("debit"),
  narration: z.string().trim().min(1, "Add a short description").max(200),
  category: category.optional(),
  oneOff: z.boolean().optional(),
  accountId: z.string().max(80).nullable().optional(),
  counterAccountId: z.string().max(80).nullable().optional(),
  goalId: z.string().max(80).nullable().optional(),
  commitmentId: z.string().max(80).nullable().optional(),
})

const patchSchema = z.object({
  category: category.optional(),
  oneOff: z.boolean().optional(),
  fixedOverride: z.boolean().nullable().optional(),
  merchant: z.string().trim().min(1).max(60).optional(),
  accountId: z.string().max(80).nullable().optional(),
  counterAccountId: z.string().max(80).nullable().optional(),
  commitmentId: z.string().max(80).nullable().optional(),
  goalId: z.string().max(80).nullable().optional(),
  refundOfId: z.string().max(80).nullable().optional(),
  applyToSimilar: z.boolean().optional(),
})

const mappingSchema = z.object({
  date: z.string().min(1),
  narration: z.string().min(1),
  debit: z.string(),
  credit: z.string(),
  time: z.string(),
  type: z.string().optional(),
  balance: z.string().optional(),
})

const previewSchema = z.object({ csv: z.string().min(1, "The file is empty").max(5_000_000) })
const importSchema = previewSchema.extend({
  filename: z.string().max(200).default("statement.csv"),
  mapping: mappingSchema.optional(),
  accountId: z.string().max(80).nullable().optional(),
  exclude: z.array(z.number().int()).max(5000).optional(),
})

const previewWithMapping = previewSchema.extend({ mapping: mappingSchema.optional(), accountId: z.string().max(80).nullable().optional() })

function reviewList(rows: ImportedRow[], judged: { confidence: number; category: string }[]) {
  return rows
    .map((row, index) => ({ row, judged: judged[index] }))
    .filter(({ row, judged }) => row.uncertain || judged.category === "Uncategorised" || judged.confidence < 0.6)
    .slice(0, 50)
    .map(({ row, judged }) => ({
      line: row.line ?? null,
      date: row.date,
      narration: row.narration,
      amountPaise: row.amountPaise,
      direction: row.direction,
      category: judged.category,
      reason: row.uncertain ?? (judged.category === "Uncategorised" ? "We could not tell what this was." : "Category is a guess."),
    }))
}

export function transactionRoutes(db: DB): Router {
  const router = Router()

  const owns = (table: string, userId: string, id: string) => Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND user_id = ?`).get(id, userId))

  function checkLinks(userId: string, input: { accountId?: string | null; counterAccountId?: string | null; goalId?: string | null; commitmentId?: string | null; refundOfId?: string | null }) {
    if (input.accountId && !owns("accounts", userId, input.accountId)) throw new HttpError(400, "That account was not found.")
    if (input.counterAccountId && !owns("accounts", userId, input.counterAccountId)) throw new HttpError(400, "That account was not found.")
    if (input.goalId && !owns("goals", userId, input.goalId)) throw new HttpError(400, "That goal was not found.")
    if (input.commitmentId && !owns("commitments", userId, input.commitmentId)) throw new HttpError(400, "That bill was not found.")
    if (input.refundOfId && !owns("transactions", userId, input.refundOfId)) throw new HttpError(400, "That purchase was not found.")
  }

  router.get("/transactions", (req, res) => {
    const userId = userOf(req)
    const filters = query(listSchema, req)
    const settings = loadSettings(db, userId)
    const needle = filters.q?.trim().toLowerCase()
    const rows = loadTransactions(db, userId)
      .filter((tx) => !filters.category || tx.category === filters.category)
      .filter((tx) => !filters.direction || tx.direction === filters.direction)
      .filter((tx) => !filters.from || tx.date >= filters.from)
      .filter((tx) => !filters.to || tx.date <= filters.to)
      .filter((tx) => !needle || tx.narration.toLowerCase().includes(needle) || tx.merchant.toLowerCase().includes(needle))
      .reverse()
    const page = rows.slice(filters.offset, filters.offset + filters.limit).map((tx) => ({
      ...tx,
      bucket: bucketOf(tx, settings.commitments),
    }))
    res.json({ transactions: page, total: rows.length })
  })

  router.post("/transactions", (req, res) => {
    const userId = userOf(req)
    if (replayed(db, userId, req, res)) return
    const input = body(createSchema, req)
    checkLinks(userId, input)
    const { added, skipped } = insertTransactions(db, userId, [input], "manual")
    if (skipped) throw new HttpError(409, "This exact payment is already recorded.")
    audit(db, userId, "transaction", `Added ${input.narration}`)
    buildDashboard(db, userId)
    respond(db, userId, req, res, 201, { transaction: added[0] })
  })

  router.patch("/transactions/:id", (req, res) => {
    const userId = userOf(req)
    const input = body(patchSchema, req)
    const tx = getTransaction(db, userId, String(req.params.id))
    if (!tx) throw new HttpError(404, "That transaction was not found.")
    checkLinks(userId, input)
    if (input.refundOfId === tx.id) throw new HttpError(400, "A refund cannot point at itself.")
    let updated = 1
    db.transaction(() => {
      if (input.category) {
        db.prepare("UPDATE transactions SET category = ?, category_source = 'user', confidence = 1, transfer = ? WHERE id = ?").run(
          input.category, input.category === "Transfer" ? 1 : 0, tx.id,
        )
        if (input.applyToSimilar && tx.merchant !== "Unknown") {
          const pattern = similarPattern(tx.narration, tx.merchant)
          db.prepare(
            "INSERT INTO rules (id, user_id, pattern, category, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, pattern) DO UPDATE SET category = excluded.category",
          ).run(newId("rl"), userId, pattern, input.category, now())
          updated = Math.max(applyRule(db, userId, pattern, input.category), 1)
        }
      }
      if (input.oneOff !== undefined) db.prepare("UPDATE transactions SET one_off = ? WHERE id = ?").run(Number(input.oneOff), tx.id)
      if (input.fixedOverride !== undefined) {
        db.prepare("UPDATE transactions SET fixed_override = ? WHERE id = ?").run(
          input.fixedOverride === null ? null : Number(input.fixedOverride), tx.id,
        )
      }
      if (input.merchant) {
        db.prepare("UPDATE transactions SET merchant = ? WHERE id = ?").run(input.merchant, tx.id)
        if (input.applyToSimilar) {
          const pattern = similarPattern(tx.narration, tx.merchant === "Unknown" ? input.merchant : tx.merchant)
          db.prepare("UPDATE transactions SET merchant = ? WHERE user_id = ? AND (lower(merchant) = ? OR instr(lower(narration), ?) > 0)").run(
            input.merchant, userId, tx.merchant.toLowerCase(), pattern,
          )
          db.prepare(
            "INSERT INTO merchant_aliases (id, user_id, pattern, merchant, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, pattern) DO UPDATE SET merchant = excluded.merchant",
          ).run(newId("ma"), userId, pattern, input.merchant, now())
        }
      }
      const links: [keyof typeof input, string][] = [
        ["accountId", "account_id"],
        ["counterAccountId", "counter_account_id"],
        ["commitmentId", "commitment_id"],
        ["goalId", "goal_id"],
        ["refundOfId", "refund_of_id"],
      ]
      for (const [key, column] of links) {
        if (input[key] !== undefined) db.prepare(`UPDATE transactions SET ${column} = ? WHERE id = ?`).run(input[key] as string | null, tx.id)
      }
    })()
    audit(db, userId, "transaction", `Edited ${tx.narration}`)
    res.json({ transaction: getTransaction(db, userId, tx.id), updated })
  })

  router.delete("/transactions/:id", (req, res) => {
    const userId = userOf(req)
    const tx = getTransaction(db, userId, String(req.params.id))
    if (!tx) throw new HttpError(404, "That transaction was not found.")
    db.prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?").run(tx.id, userId)
    audit(db, userId, "transaction", `Deleted ${tx.narration} (${tx.amountPaise} paise, ${tx.date})`)
    res.status(204).end()
  })

  router.get("/transactions/export", (req, res) => {
    const csv = transactionsToCsv(loadTransactions(db, userOf(req)))
    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", 'attachment; filename="paydayly-transactions.csv"')
    res.send(`\uFEFF${csv}`)
  })

  router.post("/import/preview", (req, res) => {
    const userId = userOf(req)
    const input = body(previewWithMapping, req)
    const table = readCsvTable(input.csv)
    if (table.headers.length === 0) throw new HttpError(400, "We could not find a header row in this file.")
    const mapping = input.mapping ?? guessMapping(table.headers)
    const parsed = mapping ? applyMapping(table.records, mapping, table.lines) : { rows: [], rejected: [] }
    const judged = categoriseRows(db, userId, parsed.rows)
    checkLinks(userId, input)
    const primary = listAccounts(db, userId).find((account) => account.primary)!.id
    const existing = importDuplicateCounts(db, userId, primary)
    const duplicates = parsed.rows.filter((row) => {
      const key = fingerprintKey({ ...row, accountId: input.accountId }, primary)
      const left = existing.get(key) ?? 0
      existing.set(key, Math.max(left - 1, 0))
      return left > 0
    }).length
    res.json({
      headers: table.headers,
      mapping,
      mappingGuessed: !input.mapping,
      confidence: mappingConfidence(table, mapping),
      headerLine: table.headerLine ?? 1,
      skippedLines: table.skippedLines ?? 0,
      joinedLines: table.joinedLines ?? 0,
      rowCount: table.records.length,
      preview: parsed.rows.slice(0, 8),
      readable: parsed.rows.length,
      rejected: parsed.rejected.slice(0, 20),
      review: reviewList(parsed.rows, judged),
      duplicates,
      check: checkFile(parsed.rows),
    })
  })

  router.post("/import", (req, res) => {
    const userId = userOf(req)
    if (replayed(db, userId, req, res)) return
    const input = body(importSchema, req)
    const table = readCsvTable(input.csv)
    const mapping = input.mapping ?? guessMapping(table.headers)
    if (!mapping) throw new HttpError(400, "Choose which columns hold the date, description and amounts.")
    for (const column of [mapping.date, mapping.narration, mapping.debit, mapping.credit, mapping.time, mapping.type, mapping.balance]) {
      if (column && !table.headers.includes(column)) throw new HttpError(400, `The column "${column}" is not in this file.`)
    }
    if (input.accountId && !listAccounts(db, userId).some((account) => account.id === input.accountId)) {
      throw new HttpError(400, "That account was not found.")
    }
    const parsed = applyMapping(table.records, mapping, table.lines)
    const excluded = new Set(input.exclude ?? [])
    const rows = parsed.rows.filter((row) => !excluded.has(row.line ?? -1)).map((row) => ({ ...row, accountId: input.accountId ?? null }))
    const check = checkFile(rows)
    const importId = newId("im")
    const outcome = db.transaction(() => {
      const result = insertTransactions(db, userId, rows, "import", importId)
      const addedDebit = result.added.filter((tx) => tx.direction === "debit").reduce((sum, tx) => sum + tx.amountPaise, 0)
      const addedCredit = result.added.filter((tx) => tx.direction === "credit").reduce((sum, tx) => sum + tx.amountPaise, 0)
      const skippedDebit = result.skippedRows.filter((tx) => tx.direction === "debit").reduce((sum, tx) => sum + tx.amountPaise, 0)
      const skippedCredit = result.skippedRows.filter((tx) => tx.direction === "credit").reduce((sum, tx) => sum + tx.amountPaise, 0)
      db.prepare(
        `INSERT INTO imports (id, user_id, filename, added, skipped, rejected, created_at, debit_paise, credit_paise, from_date, to_date, account_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(importId, userId, input.filename, result.added.length, result.skipped, parsed.rejected.length, now(), addedDebit, addedCredit, check.from, check.to, input.accountId ?? null)
      audit(db, userId, "import", `Imported ${result.added.length} rows from ${input.filename}`)
      return { result, addedDebit, addedCredit, skippedDebit, skippedCredit }
    })()
    buildDashboard(db, userId)
    const dates = outcome.result.added.map((tx) => tx.date).sort()
    respond(db, userId, req, res, 201, {
      importId,
      added: outcome.result.added.length,
      skipped: outcome.result.skipped,
      excluded: parsed.rows.length - rows.length,
      rejected: parsed.rejected,
      range: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
      reconciliation: {
        fileDebitPaise: check.debitPaise,
        fileCreditPaise: check.creditPaise,
        addedDebitPaise: outcome.addedDebit,
        addedCreditPaise: outcome.addedCredit,
        skippedDebitPaise: outcome.skippedDebit,
        skippedCreditPaise: outcome.skippedCredit,
        ok: outcome.addedDebit + outcome.skippedDebit === check.debitPaise && outcome.addedCredit + outcome.skippedCredit === check.creditPaise,
        openingPaise: check.openingPaise,
        closingPaise: check.closingPaise,
        balanceMatches: check.balanceMatches,
        mismatchLine: check.mismatchLine,
      },
    })
  })

  router.get("/imports", (req, res) => {
    const rows = db
      .prepare("SELECT * FROM imports WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
      .all(userOf(req)) as Record<string, unknown>[]
    res.json({
      imports: rows.map((row) => ({
        id: row.id,
        filename: row.filename,
        added: row.added,
        skipped: row.skipped,
        rejected: row.rejected,
        debitPaise: row.debit_paise,
        creditPaise: row.credit_paise,
        from: row.from_date,
        to: row.to_date,
        accountId: row.account_id,
        createdAt: row.created_at,
        undoneAt: row.undone_at,
      })),
    })
  })

  router.post("/imports/:id/undo", (req, res) => {
    const userId = userOf(req)
    const row = db.prepare("SELECT id, filename, undone_at FROM imports WHERE id = ? AND user_id = ?").get(String(req.params.id), userId) as
      | { id: string; filename: string; undone_at: string | null }
      | undefined
    if (!row) throw new HttpError(404, "That import was not found.")
    if (row.undone_at) throw new HttpError(409, "This import was already undone.")
    const removed = db.transaction(() => {
      const ids = (db.prepare("SELECT id FROM transactions WHERE user_id = ? AND import_id = ?").all(userId, row.id) as { id: string }[]).map((item) => item.id)
      for (const id of ids) {
        db.prepare("UPDATE receivables SET tx_id = NULL WHERE user_id = ? AND tx_id = ?").run(userId, id)
        db.prepare("UPDATE transactions SET refund_of_id = NULL WHERE user_id = ? AND refund_of_id = ?").run(userId, id)
      }
      const count = db.prepare("DELETE FROM transactions WHERE user_id = ? AND import_id = ?").run(userId, row.id).changes
      db.prepare("UPDATE imports SET undone_at = ? WHERE id = ?").run(now(), row.id)
      audit(db, userId, "import", `Undid import of ${row.filename} (${count} rows removed)`)
      return count
    })()
    buildDashboard(db, userId)
    res.json({ removed })
  })

  return router
}
