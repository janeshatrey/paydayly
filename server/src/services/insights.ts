import {
  addDays,
  bucketOf,
  buildSnapshot,
  CATEGORIES,
  detectFlags,
  detectRecurring,
  eachDate,
  flexibleEffectPaise,
  formatDate,
  formatINR,
  isSavingsKind,
  monthlyPaise,
  monthEnd,
  monthStart,
  projectGoal,
  type Category,
  type Snapshot,
  type Transaction,
} from "@paydayly/shared"
import type { DB } from "../db"
import { newId, now } from "../lib/ids"
import { asOfFor, getProfile, listGoals, loadContext, loadSettings, loadTransactions } from "./ledger"

export interface Upcoming {
  id: string
  name: string
  kind: string
  amountPaise: number
  date: string
  daysAway: number
  source: "commitment" | "recurring"
  status: string
}

function budgetsFor(db: DB, userId: string): Map<string, number> {
  const rows = db.prepare("SELECT category, limit_paise FROM budgets WHERE user_id = ?").all(userId) as {
    category: string
    limit_paise: number
  }[]
  return new Map(rows.map((row) => [row.category, row.limit_paise]))
}

function categorySpend(transactions: Transaction[], from: string, to: string, commitments: ReturnType<typeof loadSettings>["commitments"]) {
  const totals = new Map<Category, number>()
  for (const tx of transactions) {
    if (tx.date < from || tx.date > to || tx.pending) continue
    const bucket = bucketOf(tx, commitments)
    if (bucket !== "flexible" && bucket !== "fixed" && bucket !== "refund") continue
    const signed = tx.direction === "credit" ? -tx.amountPaise : tx.amountPaise
    totals.set(tx.category, (totals.get(tx.category) ?? 0) + signed)
  }
  return CATEGORIES.filter((category) => (totals.get(category) ?? 0) > 0).map((category) => ({
    category,
    paise: totals.get(category) ?? 0,
  }))
}

function upcomingBills(snapshot: Snapshot, asOf: string, recurring: ReturnType<typeof detectRecurring>): Upcoming[] {
  const items: Upcoming[] = []
  for (const line of snapshot.bills) {
    if (!line.dueDate || line.status === "paid" || line.status === "skipped") continue
    const daysAway = Math.round((Date.parse(line.dueDate) - Date.parse(asOf)) / 86_400_000)
    items.push({
      id: line.id,
      name: line.name,
      kind: line.kind,
      amountPaise: line.reservedPaise || line.plannedPaise,
      date: line.dueDate,
      daysAway,
      source: "commitment",
      status: line.status,
    })
  }
  const named = new Set(snapshot.bills.map((item) => item.name.toLowerCase()))
  for (const series of recurring) {
    if (series.nextDate < asOf || named.has(series.merchant.toLowerCase())) continue
    if (series.nextDate > snapshot.cycle.end) continue
    const daysAway = Math.round((Date.parse(series.nextDate) - Date.parse(asOf)) / 86_400_000)
    items.push({
      id: `rec:${series.merchant}`,
      name: series.merchant,
      kind: "recurring",
      amountPaise: Math.round(series.medianPaise),
      date: series.nextDate,
      daysAway,
      source: "recurring",
      status: daysAway === 0 ? "due-today" : "upcoming",
    })
  }
  return items.sort((a, b) => a.date.localeCompare(b.date))
}

function recordAvailable(db: DB, userId: string, snapshot: Snapshot): void {
  db.prepare(
    `INSERT INTO available_history (user_id, date, available_paise, lines) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, date) DO UPDATE SET available_paise = excluded.available_paise, lines = excluded.lines`,
  ).run(userId, snapshot.asOf, snapshot.headline.availablePaise, JSON.stringify(snapshot.headline.lines))
}

export function dashboardParts(db: DB, userId: string) {
  const profile = getProfile(db, userId)
  const asOf = asOfFor(profile)
  const settings = loadSettings(db, userId)
  const transactions = loadTransactions(db, userId)
  const context = loadContext(db, userId)
  const snapshot = buildSnapshot(transactions, settings, asOf, context)
  return { asOf, settings, transactions, context, snapshot }
}

export function buildDashboard(db: DB, userId: string) {
  const { asOf, settings, transactions, context, snapshot } = dashboardParts(db, userId)
  recordAvailable(db, userId, snapshot)
  const recurring = detectRecurring(transactions, asOf)
  const flags = detectFlags(transactions, recurring, settings.dismissedFlagIds)
  const start = monthStart(asOf)

  const trend = eachDate(addDays(asOf, -29), asOf).map((date) => ({
    date,
    paise: transactions
      .filter((tx) => tx.date === date)
      .reduce((sum, tx) => sum + Math.max(flexibleEffectPaise(tx, settings.commitments), 0), 0),
  }))

  const limits = budgetsFor(db, userId)
  const categories = categorySpend(transactions, start, asOf, settings.commitments)
  const budgets = [...limits.entries()].map(([category, limitPaise]) => ({
    category,
    limitPaise,
    spentPaise: categories.find((row) => row.category === category)?.paise ?? 0,
  }))

  const upcoming = upcomingBills(snapshot, asOf, recurring)
  const goals = listGoals(db, userId).map((goal) => {
    const projection = projectGoal(goal.target_paise - goal.saved_paise, goal.monthly_paise, asOf)
    return { ...goalView(goal), projectedDate: projection.date, monthsLeft: projection.months }
  })

  const result = {
    asOf,
    empty: transactions.length === 0,
    transactionCount: transactions.length,
    snapshot,
    recurring,
    flags,
    trend,
    categories,
    budgets,
    upcoming,
    goals,
    accounts: context.accounts,
    receivables: context.receivables,
    commitments: { fixedPaise: snapshot.fixedPaise, savingsPaise: snapshot.savingsPaise },
  }
  syncNotifications(db, userId, result)
  return result
}

export function goalView(goal: ReturnType<typeof listGoals>[number]) {
  return {
    id: goal.id,
    name: goal.name,
    targetPaise: goal.target_paise,
    savedPaise: goal.saved_paise,
    monthlyPaise: goal.monthly_paise,
    deadline: goal.deadline,
    createdAt: goal.created_at,
  }
}

export function buildMonth(db: DB, userId: string, month: string) {
  const profile = getProfile(db, userId)
  const asOf = asOfFor(profile)
  const settings = loadSettings(db, userId)
  const transactions = loadTransactions(db, userId)
  const start = `${month}-01`
  const end = monthEnd(start)
  const inMonth = transactions.filter((tx) => tx.date >= start && tx.date <= end && !tx.pending)

  const days = eachDate(start, end).map((date) => {
    const rows = inMonth.filter((tx) => tx.date === date)
    return {
      date,
      flexiblePaise: rows.reduce((sum, tx) => sum + flexibleEffectPaise(tx, settings.commitments), 0),
      count: rows.length,
      future: date > asOf,
    }
  })

  const income = inMonth.filter((tx) => bucketOf(tx, settings.commitments) === "income").reduce((sum, tx) => sum + tx.amountPaise, 0)
  const fixedSpent = inMonth
    .filter((tx) => bucketOf(tx, settings.commitments) === "fixed")
    .reduce((sum, tx) => sum + tx.amountPaise, 0)
  const flexible = days.reduce((sum, day) => sum + day.flexiblePaise, 0)
  const plannedFixed = settings.commitments.filter((item) => !isSavingsKind(item.kind)).reduce((sum, item) => sum + monthlyPaise(item), 0)
  const plannedSavings = settings.commitments.filter((item) => isSavingsKind(item.kind)).reduce((sum, item) => sum + monthlyPaise(item), 0)
  const pool = (settings.incomePaise ?? income) - plannedFixed - plannedSavings

  const merchants = new Map<string, { merchant: string; paise: number; count: number }>()
  for (const tx of inMonth) {
    if (bucketOf(tx, settings.commitments) !== "flexible") continue
    const entry = merchants.get(tx.merchant) ?? { merchant: tx.merchant, paise: 0, count: 0 }
    entry.paise += tx.amountPaise
    entry.count += 1
    merchants.set(tx.merchant, entry)
  }

  const limits = budgetsFor(db, userId)
  const categories = categorySpend(transactions, start, end, settings.commitments).map((row) => ({
    ...row,
    limitPaise: limits.get(row.category) ?? null,
  }))

  return {
    month,
    asOf,
    label: new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${start}T00:00:00Z`)),
    days,
    totals: { incomePaise: income, fixedSpentPaise: fixedSpent, flexiblePaise: flexible, poolPaise: pool, plannedFixedPaise: plannedFixed, plannedSavingsPaise: plannedSavings },
    categories,
    topMerchants: [...merchants.values()].sort((a, b) => b.paise - a.paise).slice(0, 6),
  }
}

type Dashboard = Omit<ReturnType<typeof buildDashboard>, never>

interface Alert {
  key: string
  kind: "overspend" | "bill" | "recurring" | "flag" | "budget" | "pool"
  title: string
  body: string
}

function alertsFrom(data: Pick<Dashboard, "asOf" | "snapshot" | "recurring" | "flags" | "budgets" | "upcoming">): Alert[] {
  const alerts: Alert[] = []
  const { snapshot, asOf } = data
  if (snapshot.hasIncome && snapshot.budget.over) {
    alerts.push({
      key: `over:${asOf}`,
      kind: "overspend",
      title: "Over today's safe amount",
      body: `You have spent ${formatINR(snapshot.budget.spentTodayPaise)} against ${formatINR(snapshot.budget.budgetPaise)} today.`,
    })
  }
  if (snapshot.hasIncome && snapshot.budget.usedUp) {
    alerts.push({
      key: `pool:${snapshot.cycle.start}`,
      kind: "pool",
      title: "Nothing left for discretionary spending",
      body: "Anything you spend before payday now comes out of savings, a goal or the next cycle.",
    })
  }
  for (const item of data.upcoming) {
    if (item.daysAway > 3) continue
    alerts.push({
      key: `bill:${item.id}:${item.date}`,
      kind: "bill",
      title:
        item.daysAway < 0
          ? `${item.name} looks overdue`
          : item.daysAway === 0
            ? `${item.name} is due today`
            : `${item.name} is due in ${item.daysAway} day${item.daysAway === 1 ? "" : "s"}`,
      body: `${formatINR(item.amountPaise)} on ${formatDate(item.date)}.`,
    })
  }
  for (const series of data.recurring) {
    alerts.push({
      key: `recurring:${series.merchant.toLowerCase()}`,
      kind: "recurring",
      title: `Recurring payment found: ${series.merchant}`,
      body: `${series.cadenceLabel}, usually ${formatINR(series.medianPaise)}. Next expected ${formatDate(series.nextDate)}.`,
    })
  }
  for (const flag of data.flags) {
    alerts.push({
      key: flag.id,
      kind: "flag",
      title: `Worth a look: ${flag.merchant}`,
      body: flag.reasons[0],
    })
  }
  for (const budget of data.budgets) {
    if (budget.spentPaise <= budget.limitPaise) continue
    alerts.push({
      key: `budget:${budget.category}:${monthStart(asOf)}`,
      kind: "budget",
      title: `${budget.category} budget passed`,
      body: `${formatINR(budget.spentPaise)} spent against a ${formatINR(budget.limitPaise)} limit this month.`,
    })
  }
  return alerts
}

export function syncNotifications(db: DB, userId: string, data: Parameters<typeof alertsFrom>[0]): number {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO notifications (id, user_id, kind, title, body, key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
  let created = 0
  db.transaction(() => {
    for (const alert of alertsFrom(data)) {
      created += insert.run(newId("nt"), userId, alert.kind, alert.title, alert.body, alert.key, now()).changes
    }
  })()
  return created
}
