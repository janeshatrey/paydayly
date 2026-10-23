import { checkAffordability, salaryCycle, type Category, type CommitmentKind } from "@paydayly/shared"
import { Router } from "express"
import { z } from "zod"
import type { DB } from "../db"
import { userOf } from "../lib/auth"
import { body, HttpError, isoDate, paise } from "../lib/http"
import { newId, now } from "../lib/ids"
import { replayed, respond } from "../lib/idempotency"
import { buildDashboard, dashboardParts } from "../services/insights"
import { audit, getTransaction, insertTransactions, listAccounts, listCommitments, listReceivables } from "../services/ledger"

const accountSchema = z.object({
  name: z.string().trim().min(1, "Name the account").max(60),
  kind: z.enum(["bank", "cash", "card", "loan"]),
  spending: z.boolean().default(true),
})

const confirmSchema = z.object({
  balancePaise: z.number().int().min(-1_000_000_000_00).max(1_000_000_000_00),
  date: isoDate.optional(),
})

const markSchema = z.object({
  status: z.enum(["paid", "skipped", "unpaid"]),
  amountPaise: paise.optional(),
  date: isoDate.optional(),
  accountId: z.string().max(80).nullable().optional(),
})

const receivableSchema = z.object({
  txId: z.string().max(80).nullable().default(null),
  kind: z.enum(["friends", "reimbursement", "refund"]),
  counterparty: z.string().trim().min(1, "Who owes you?").max(60),
  amountPaise: paise.refine((value) => value > 0, "Amount must be more than zero"),
  date: isoDate.optional(),
  note: z.string().trim().max(200).default(""),
})

const settleSchema = z.object({
  txId: z.string().max(80).nullable().default(null),
  amountPaise: paise.optional(),
})

const affordSchema = z.object({
  amountPaise: paise.refine((value) => value > 0, "Amount must be more than zero"),
  date: isoDate.optional(),
  goalId: z.string().max(80).nullable().default(null),
  paydayLateDays: z.number().int().min(0).max(31).default(0),
})

const BILL_CATEGORY: Record<CommitmentKind, Category> = {
  rent: "Rent",
  emi: "EMI",
  bills: "Bills",
  other: "Bills",
  sip: "SIP",
  investment: "SIP",
  savings: "Savings",
  irregular: "Bills",
}

export function moneyRoutes(db: DB): Router {
  const router = Router()

  router.get("/accounts", (req, res) => {
    const { snapshot } = dashboardParts(db, userOf(req))
    res.json({ accounts: snapshot.balances, confirmed: snapshot.confirmed })
  })

  router.post("/accounts", (req, res) => {
    const userId = userOf(req)
    const input = body(accountSchema, req)
    listAccounts(db, userId)
    const id = newId("ac")
    const spending = input.kind === "loan" ? false : input.spending
    db.prepare("INSERT INTO accounts (id, user_id, name, kind, spending, is_primary, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)").run(
      id, userId, input.name, input.kind, Number(spending), now(),
    )
    audit(db, userId, "account", `Added ${input.kind} account ${input.name}`)
    res.status(201).json({ account: listAccounts(db, userId).find((item) => item.id === id) })
  })

  router.put("/accounts/:id", (req, res) => {
    const userId = userOf(req)
    const input = body(accountSchema, req)
    const result = db
      .prepare("UPDATE accounts SET name = ?, kind = CASE WHEN is_primary = 1 THEN kind ELSE ? END, spending = ? WHERE id = ? AND user_id = ?")
      .run(input.name, input.kind, Number(input.spending), String(req.params.id), userId)
    if (result.changes === 0) throw new HttpError(404, "That account was not found.")
    res.json({ account: listAccounts(db, userId).find((item) => item.id === req.params.id) })
  })

  router.delete("/accounts/:id", (req, res) => {
    const userId = userOf(req)
    const account = listAccounts(db, userId).find((item) => item.id === req.params.id)
    if (!account) throw new HttpError(404, "That account was not found.")
    if (account.primary) throw new HttpError(400, "Your main account cannot be removed.")
    const used = db.prepare("SELECT 1 FROM transactions WHERE user_id = ? AND (account_id = ? OR counter_account_id = ?) LIMIT 1").get(userId, account.id, account.id)
    if (used) throw new HttpError(409, "Payments still point at this account. Move or delete them first.")
    db.prepare("DELETE FROM accounts WHERE id = ? AND user_id = ?").run(account.id, userId)
    audit(db, userId, "account", `Removed ${account.name}`)
    res.status(204).end()
  })

  router.post("/accounts/:id/confirm", (req, res) => {
    const userId = userOf(req)
    const input = body(confirmSchema, req)
    const account = listAccounts(db, userId).find((item) => item.id === req.params.id)
    if (!account) throw new HttpError(404, "That account was not found.")
    const { asOf } = dashboardParts(db, userId)
    const date = input.date ?? asOf
    db.prepare("INSERT INTO balance_confirmations (id, user_id, account_id, date, balance_paise, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      newId("bc"), userId, account.id, date, input.balancePaise, now(),
    )
    audit(db, userId, "balance", `Confirmed ${account.name} at ${input.balancePaise} paise on ${date}`)
    const dashboard = buildDashboard(db, userId)
    res.status(201).json({ headline: dashboard.snapshot.headline, confirmed: dashboard.snapshot.confirmed })
  })

  router.post("/bills/:id/mark", (req, res) => {
    const userId = userOf(req)
    if (replayed(db, userId, req, res)) return
    const input = body(markSchema, req)
    const bill = listCommitments(db, userId).find((item) => item.id === req.params.id)
    if (!bill) throw new HttpError(404, "That bill was not found.")
    const { asOf, settings } = dashboardParts(db, userId)
    const cycle = salaryCycle(asOf, settings.payday)
    let created = null
    db.transaction(() => {
      db.prepare("DELETE FROM bill_marks WHERE user_id = ? AND commitment_id = ? AND cycle_start = ?").run(userId, bill.id, cycle.start)
      if (input.status === "unpaid") {
        db.prepare("DELETE FROM transactions WHERE user_id = ? AND commitment_id = ? AND source = 'bill' AND date >= ? AND date <= ?").run(
          userId, bill.id, cycle.start, cycle.end,
        )
        return
      }
      db.prepare("INSERT INTO bill_marks (user_id, commitment_id, cycle_start, status) VALUES (?, ?, ?, ?)").run(userId, bill.id, cycle.start, input.status)
      if (input.status === "paid") {
        const already = db.prepare("SELECT 1 FROM transactions WHERE user_id = ? AND commitment_id = ? AND date >= ? AND date <= ? LIMIT 1").get(
          userId, bill.id, cycle.start, cycle.end,
        )
        if (!already) {
          const { added } = insertTransactions(
            db,
            userId,
            [{
              date: input.date ?? asOf,
              time: "09:00",
              amountPaise: input.amountPaise ?? bill.amount_paise,
              direction: "debit",
              narration: `${bill.name} (marked paid)`,
              merchant: bill.name,
              category: BILL_CATEGORY[bill.kind],
              commitmentId: bill.id,
              accountId: input.accountId ?? null,
            }],
            "bill",
          )
          created = added[0] ?? null
        }
      }
    })()
    audit(db, userId, "bill", `${bill.name} marked ${input.status} for cycle starting ${cycle.start}`)
    const dashboard = buildDashboard(db, userId)
    respond(db, userId, req, res, 200, { bills: dashboard.snapshot.bills, transaction: created })
  })

  router.get("/receivables", (req, res) => {
    const { snapshot } = dashboardParts(db, userOf(req))
    res.json({ receivables: listReceivables(db, userOf(req)), summary: snapshot.receivables, suggestions: snapshot.settlementSuggestions })
  })

  router.post("/receivables", (req, res) => {
    const userId = userOf(req)
    if (replayed(db, userId, req, res)) return
    const input = body(receivableSchema, req)
    const tx = input.txId ? getTransaction(db, userId, input.txId) : null
    if (input.txId && !tx) throw new HttpError(404, "That payment was not found.")
    if (tx && tx.direction !== "debit") throw new HttpError(400, "Money owed back has to hang off a payment you made.")
    if (tx && input.amountPaise > tx.amountPaise) throw new HttpError(400, "You cannot be owed more than you paid.")
    const id = newId("rc")
    const { asOf } = dashboardParts(db, userId)
    db.transaction(() => {
      db.prepare(
        "INSERT INTO receivables (id, user_id, tx_id, kind, counterparty, amount_paise, date, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(id, userId, tx?.id ?? null, input.kind, input.counterparty, input.amountPaise, input.date ?? tx?.date ?? asOf, input.note, now())
      if (tx && input.kind !== "refund") {
        const owed = (db.prepare("SELECT COALESCE(SUM(amount_paise), 0) AS total FROM receivables WHERE user_id = ? AND tx_id = ? AND kind != 'refund' AND status != 'written_off'").get(userId, tx.id) as { total: number }).total
        db.prepare("UPDATE transactions SET own_share_paise = ? WHERE id = ?").run(Math.max(tx.amountPaise - owed, 0), tx.id)
      }
    })()
    audit(db, userId, "receivable", `${input.counterparty} owes ${input.amountPaise} paise`)
    respond(db, userId, req, res, 201, { receivable: listReceivables(db, userId).find((item) => item.id === id) })
  })

  router.post("/receivables/:id/settle", (req, res) => {
    const userId = userOf(req)
    if (replayed(db, userId, req, res)) return
    const input = body(settleSchema, req)
    const item = listReceivables(db, userId).find((entry) => entry.id === req.params.id)
    if (!item) throw new HttpError(404, "That item was not found.")
    if (item.status !== "open") throw new HttpError(409, "This is already closed.")
    const credit = input.txId ? getTransaction(db, userId, input.txId) : null
    if (input.txId && !credit) throw new HttpError(404, "That payment was not found.")
    if (credit && credit.direction !== "credit") throw new HttpError(400, "Pick the money that came in.")
    if (credit?.receivableId) throw new HttpError(409, "That payment already settles something else.")
    const amount = Math.min(input.amountPaise ?? credit?.amountPaise ?? item.amountPaise - item.settledPaise, item.amountPaise - item.settledPaise)
    db.transaction(() => {
      if (credit) {
        db.prepare("UPDATE transactions SET receivable_id = ?, category = ?, category_source = 'user', confidence = 1, transfer = 0, refund_of_id = ? WHERE id = ?").run(
          item.id, item.kind === "refund" ? "Refund" : "Settlement", item.kind === "refund" ? item.txId : null, credit.id,
        )
      }
      const settled = item.settledPaise + amount
      db.prepare("UPDATE receivables SET settled_paise = ?, status = ? WHERE id = ?").run(settled, settled >= item.amountPaise ? "settled" : "open", item.id)
    })()
    audit(db, userId, "receivable", `${item.counterparty} paid back ${amount} paise`)
    buildDashboard(db, userId)
    respond(db, userId, req, res, 200, { receivable: listReceivables(db, userId).find((entry) => entry.id === item.id) })
  })

  router.post("/receivables/:id/write-off", (req, res) => {
    const userId = userOf(req)
    const item = listReceivables(db, userId).find((entry) => entry.id === req.params.id)
    if (!item) throw new HttpError(404, "That item was not found.")
    db.transaction(() => {
      db.prepare("UPDATE receivables SET status = 'written_off' WHERE id = ?").run(item.id)
      if (item.txId && item.kind !== "refund") {
        const tx = getTransaction(db, userId, item.txId)
        if (tx) {
          const owed = (db.prepare("SELECT COALESCE(SUM(amount_paise), 0) AS total FROM receivables WHERE user_id = ? AND tx_id = ? AND kind != 'refund' AND status != 'written_off'").get(userId, tx.id) as { total: number }).total
          db.prepare("UPDATE transactions SET own_share_paise = ? WHERE id = ?").run(owed > 0 ? tx.amountPaise - owed : null, tx.id)
        }
      }
    })()
    audit(db, userId, "receivable", `Wrote off ${item.counterparty}`)
    res.json({ receivable: listReceivables(db, userId).find((entry) => entry.id === item.id) })
  })

  router.post("/afford", (req, res) => {
    const userId = userOf(req)
    const input = body(affordSchema, req)
    const { snapshot, settings, asOf } = dashboardParts(db, userId)
    if (input.goalId && !settings.goals.some((goal) => goal.id === input.goalId)) throw new HttpError(400, "That goal was not found.")
    const date = input.date && input.date > asOf ? input.date : asOf
    res.json({ result: checkAffordability(snapshot, settings, { ...input, date }), basis: snapshot.headline.basis })
  })

  router.get("/history", (req, res) => {
    const userId = userOf(req)
    const changes = db.prepare("SELECT at, action, detail FROM change_log WHERE user_id = ? ORDER BY at DESC LIMIT 100").all(userId)
    const available = db.prepare("SELECT date, available_paise FROM available_history WHERE user_id = ? ORDER BY date DESC LIMIT 60").all(userId) as {
      date: string
      available_paise: number
    }[]
    res.json({ changes, available: available.map((row) => ({ date: row.date, availablePaise: row.available_paise })) })
  })

  return router
}
