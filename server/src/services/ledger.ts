import crypto from "node:crypto"
import {
  categorise,
  indiaToday,
  ruleMatches,
  MAIN_ACCOUNT_ID,
  type Account,
  type MoneyContext,
  type Frequency,
  type Category,
  type Commitment,
  type CommitmentKind,
  type Rule,
  type Settings,
  type Transaction,
} from "@paydayly/shared"
import type { DB } from "../db"
import { newId, now } from "../lib/ids"

export interface ProfileRow {
  user_id: string
  income_paise: number | null
  payday: number
  weekend_weighted: number
  weekend_weight: number
  as_of_date: string | null
  onboarded: number
  theme: string
  savings_target_paise: number | null
  buffer_paise: number | null
  tracking_since: string | null
  salary_delayed_for: string | null
  language: string
}

export interface CommitmentRow {
  id: string
  name: string
  kind: CommitmentKind
  amount_paise: number
  due_day: number | null
  frequency: Frequency
  due_month: number | null
}

interface TransactionRow {
  id: string
  date: string
  time: string
  amount_paise: number
  direction: "debit" | "credit"
  narration: string
  merchant: string
  category: Category
  category_source: Transaction["categorySource"]
  confidence: number
  fixed_override: number | null
  transfer: number
  one_off: number
  pending: number
  source: string
  account_id: string | null
  counter_account_id: string | null
  commitment_id: string | null
  goal_id: string | null
  receivable_id: string | null
  refund_of_id: string | null
  own_share_paise: number | null
  import_id: string | null
}

export interface GoalRow {
  id: string
  name: string
  target_paise: number
  saved_paise: number
  monthly_paise: number
  deadline: string | null
  created_at: string
}

export function getProfile(db: DB, userId: string): ProfileRow {
  return db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(userId) as ProfileRow
}

export function asOfFor(profile: ProfileRow): string {
  return profile.as_of_date ?? indiaToday()
}

export function listCommitments(db: DB, userId: string): CommitmentRow[] {
  return db
    .prepare("SELECT id, name, kind, amount_paise, due_day, frequency, due_month FROM commitments WHERE user_id = ? ORDER BY created_at")
    .all(userId) as CommitmentRow[]
}

export function toCommitment(row: CommitmentRow): Commitment {
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

export function listGoals(db: DB, userId: string): GoalRow[] {
  return db.prepare("SELECT * FROM goals WHERE user_id = ? ORDER BY created_at").all(userId) as GoalRow[]
}

export function listRules(db: DB, userId: string): Rule[] {
  const rows = db
    .prepare("SELECT id, pattern, category, created_at FROM rules WHERE user_id = ? ORDER BY created_at")
    .all(userId) as { id: string; pattern: string; category: Category; created_at: string }[]
  return rows.map((row) => ({ id: row.id, pattern: row.pattern, category: row.category, createdAt: row.created_at }))
}

export function listAliases(db: DB, userId: string): { id: string; pattern: string; merchant: string }[] {
  return db.prepare("SELECT id, pattern, merchant FROM merchant_aliases WHERE user_id = ? ORDER BY created_at").all(userId) as {
    id: string
    pattern: string
    merchant: string
  }[]
}

export function categoriseRows(db: DB, userId: string, rows: { narration: string }[]) {
  const rules = listRules(db, userId)
  return rows.map((row) => categorise(row.narration, rules))
}

export function loadSettings(db: DB, userId: string): Settings {
  const profile = getProfile(db, userId)
  const goal = listGoals(db, userId).find((item) => item.deadline)
  const dismissed = db.prepare("SELECT flag_id FROM dismissed_flags WHERE user_id = ?").all(userId) as { flag_id: string }[]
  return {
    incomePaise: profile.income_paise,
    payday: profile.payday,
    savingsTargetPaise: profile.savings_target_paise,
    bufferPaise: profile.buffer_paise,
    trackingSince: profile.tracking_since,
    salaryDelayedFor: profile.salary_delayed_for,
    goals: listGoals(db, userId).map((item) => ({
      id: item.id,
      name: item.name,
      targetPaise: item.target_paise,
      savedPaise: item.saved_paise,
      monthlyPaise: item.monthly_paise,
      deadline: item.deadline,
    })),
    commitments: listCommitments(db, userId).map(toCommitment),
    weekendWeighted: profile.weekend_weighted === 1,
    weekendWeight: profile.weekend_weight,
    goal: goal ? { name: goal.name, targetPaise: goal.target_paise, deadline: goal.deadline! } : null,
    dismissedFlagIds: dismissed.map((row) => row.flag_id),
  }
}

function fromRow(row: TransactionRow): Transaction & { source: string; importId: string | null } {
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    amountPaise: row.amount_paise,
    direction: row.direction,
    narration: row.narration,
    merchant: row.merchant,
    category: row.category,
    categorySource: row.category_source,
    confidence: row.confidence,
    fixedOverride: row.fixed_override === null ? null : row.fixed_override === 1,
    transfer: row.transfer === 1,
    oneOff: row.one_off === 1,
    pending: row.pending === 1,
    source: row.source,
    accountId: row.account_id,
    counterAccountId: row.counter_account_id,
    commitmentId: row.commitment_id,
    goalId: row.goal_id,
    receivableId: row.receivable_id,
    refundOfId: row.refund_of_id,
    ownSharePaise: row.own_share_paise,
    importId: row.import_id,
  }
}

interface AccountRow {
  id: string
  name: string
  kind: Account["kind"]
  spending: number
  is_primary: number
}

export function ensureMainAccount(db: DB, userId: string): void {
  const any = db.prepare("SELECT 1 FROM accounts WHERE user_id = ? LIMIT 1").get(userId)
  if (any) return
  db.prepare("INSERT INTO accounts (id, user_id, name, kind, spending, is_primary, created_at) VALUES (?, ?, ?, 'bank', 1, 1, ?)").run(
    `${MAIN_ACCOUNT_ID}_${userId}`, userId, "Main account", now(),
  )
}

export function listAccounts(db: DB, userId: string): Account[] {
  ensureMainAccount(db, userId)
  const rows = db.prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY is_primary DESC, created_at").all(userId) as AccountRow[]
  return rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, spending: row.spending === 1, primary: row.is_primary === 1 }))
}

export function loadContext(db: DB, userId: string): MoneyContext {
  const accounts = listAccounts(db, userId)
  const confirmations = (db
    .prepare("SELECT account_id, date, balance_paise FROM balance_confirmations WHERE user_id = ? AND is_closing = 1 ORDER BY date, created_at, rowid")
    .all(userId) as { account_id: string; date: string; balance_paise: number }[])
    .map((row) => ({ accountId: row.account_id, date: row.date, balancePaise: row.balance_paise }))
  const allocations = (db
    .prepare("SELECT goal_id, date, amount_paise FROM goal_allocations WHERE user_id = ? ORDER BY date")
    .all(userId) as { goal_id: string; date: string; amount_paise: number }[])
    .map((row) => ({ goalId: row.goal_id, date: row.date, amountPaise: row.amount_paise }))
  const billMarks = (db
    .prepare("SELECT commitment_id, cycle_start, status FROM bill_marks WHERE user_id = ?")
    .all(userId) as { commitment_id: string; cycle_start: string; status: "paid" | "skipped" }[])
    .map((row) => ({ commitmentId: row.commitment_id, cycleStart: row.cycle_start, status: row.status }))
  return { accounts, confirmations, allocations, receivables: listReceivables(db, userId), billMarks }
}

export function listReceivables(db: DB, userId: string): MoneyContext["receivables"] {
  const rows = db.prepare("SELECT * FROM receivables WHERE user_id = ? ORDER BY date DESC, created_at DESC").all(userId) as {
    id: string
    tx_id: string | null
    kind: "friends" | "reimbursement" | "refund"
    counterparty: string
    amount_paise: number
    settled_paise: number
    status: "open" | "settled" | "written_off"
    date: string
    note: string
  }[]
  return rows.map((row) => ({
    id: row.id,
    txId: row.tx_id,
    kind: row.kind,
    counterparty: row.counterparty,
    amountPaise: row.amount_paise,
    settledPaise: row.settled_paise,
    status: row.status,
    date: row.date,
    note: row.note,
  }))
}

export function audit(db: DB, userId: string, action: string, detail: string): void {
  db.prepare("INSERT INTO change_log (id, user_id, at, action, detail) VALUES (?, ?, ?, ?, ?)").run(newId("lg"), userId, now(), action, detail)
}

export function loadTransactions(db: DB, userId: string): (Transaction & { source: string; importId: string | null })[] {
  const rows = db
    .prepare("SELECT * FROM transactions WHERE user_id = ? ORDER BY date, time, id")
    .all(userId) as TransactionRow[]
  return rows.map(fromRow)
}

export function getTransaction(db: DB, userId: string, id: string): Transaction | null {
  const row = db.prepare("SELECT * FROM transactions WHERE user_id = ? AND id = ?").get(userId, id) as TransactionRow | undefined
  return row ? fromRow(row) : null
}

export interface NewTransaction {
  date: string
  time: string
  amountPaise: number
  direction: "debit" | "credit"
  narration: string
  category?: Category
  oneOff?: boolean
  merchant?: string
  fixedOverride?: boolean | null
  transfer?: boolean
  accountId?: string | null
  counterAccountId?: string | null
  commitmentId?: string | null
  goalId?: string | null
  ownSharePaise?: number | null
}

export function fingerprintKey(tx: NewTransaction, primary: string): string {
  return JSON.stringify([tx.accountId || primary, tx.date, tx.time, tx.amountPaise, tx.direction, tx.narration.trim().toUpperCase()])
}

export function importDuplicateCounts(db: DB, userId: string, primary: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const tx of loadTransactions(db, userId)) {
    if (tx.source !== "import" && tx.source !== "restore") continue
    const key = fingerprintKey(tx, primary)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function fingerprint(key: string, occurrence: number): string {
  return crypto.createHash("sha1").update(`${key}|${occurrence}`).digest("hex")
}

export function insertTransactions(
  db: DB,
  userId: string,
  rows: NewTransaction[],
  source: "manual" | "import" | "bill" | "restore",
  importId: string | null = null,
): { added: Transaction[]; skipped: number; skippedRows: NewTransaction[] } {
  const rules = listRules(db, userId)
  const aliases = listAliases(db, userId)
  const primary = listAccounts(db, userId).find((account) => account.primary)!.id
  const existing = importDuplicateCounts(db, userId, primary)
  const insert = db.prepare(`
    INSERT OR IGNORE INTO transactions
      (id, user_id, date, time, amount_paise, direction, narration, merchant, category, category_source,
       confidence, fixed_override, transfer, one_off, pending, source, fingerprint, created_at,
       account_id, counter_account_id, commitment_id, goal_id, own_share_paise, import_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const added: Transaction[] = []
  const skippedRows: NewTransaction[] = []
  const seen = new Map<string, number>()
  let skipped = 0
  db.transaction(() => {
    for (const row of rows) {
      const key = fingerprintKey(row, primary)
      const occurrence = seen.get(key) ?? 0
      seen.set(key, occurrence + 1)
      if (source === "import" && occurrence < (existing.get(key) ?? 0)) {
        skipped += 1
        skippedRows.push(row)
        continue
      }
      const judged = categorise(row.narration, rules)
      const category = row.category ?? judged.category
      const tx: Transaction = {
        id: newId("tx"),
        date: row.date,
        time: row.time,
        amountPaise: row.amountPaise,
        direction: row.direction,
        narration: row.narration.trim(),
        merchant: row.merchant ?? aliases.find((alias) => ruleMatches(alias.pattern, row.narration))?.merchant ?? (judged.merchant === "Unknown" ? merchantFromNarration(row.narration) : judged.merchant),
        category,
        categorySource: row.category ? "user" : judged.categorySource,
        confidence: row.category ? 1 : judged.confidence,
        fixedOverride: row.fixedOverride ?? null,
        transfer: row.transfer ?? (row.category ? row.category === "Transfer" : judged.transfer),
        oneOff: row.oneOff ?? false,
        pending: false,
        accountId: row.accountId ?? null,
        counterAccountId: row.counterAccountId ?? null,
        commitmentId: row.commitmentId ?? null,
        goalId: row.goalId ?? null,
        ownSharePaise: row.ownSharePaise ?? null,
      }
      const fixed = tx.fixedOverride === null ? null : Number(tx.fixedOverride)
      const result = insert.run(
        tx.id, userId, tx.date, tx.time, tx.amountPaise, tx.direction, tx.narration, tx.merchant, tx.category,
        tx.categorySource, tx.confidence, fixed, tx.transfer ? 1 : 0, tx.oneOff ? 1 : 0, source, source === "manual" || source === "import" ? newId("fp") : fingerprint(key, occurrence), now(),
        tx.accountId, tx.counterAccountId, tx.commitmentId, tx.goalId, tx.ownSharePaise, importId,
      )
      if (result.changes === 0) {
        skipped += 1
        skippedRows.push(row)
      } else added.push(tx)
    }
  })()
  return { added, skipped, skippedRows }
}

function merchantFromNarration(narration: string): string {
  const parts = narration
    .split(/[/\-|]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 2 && !/^\d+$/.test(part) && !/^(UPI|DR|CR|NEFT|IMPS|ACH|NACH|POS)$/i.test(part))
  const pick = parts[0] ?? "Unknown"
  return pick
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .slice(0, 40)
}

export function applyRule(db: DB, userId: string, pattern: string, category: Category): number {
  const needle = pattern.toLowerCase()
  const squashed = needle.replace(/[^a-z0-9]/g, "")
  const result = db
    .prepare(
      `UPDATE transactions SET category = ?, category_source = 'user', confidence = 1, transfer = ?
       WHERE user_id = ? AND (instr(lower(narration), ?) > 0 OR instr(lower(merchant), ?) > 0
         OR (length(?) >= 4 AND instr(replace(replace(replace(lower(narration), ' ', ''), '/', ''), '-', ''), ?) > 0))`,
    )
    .run(category, category === "Transfer" ? 1 : 0, userId, needle, needle, squashed, squashed)
  return result.changes
}
