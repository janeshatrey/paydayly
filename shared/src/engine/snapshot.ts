import { gapPhrase, morningLine, nightLine } from "../copy"
import { formatExactINR, formatINR } from "../format"
import type { Commitment, MoneyContext, Settings, Transaction } from "../types"
import { EMPTY_CONTEXT } from "../types"
import { accountBalances, confirmedCash, suggestSettlements, summariseReceivables, type AccountBalance, type ConfirmedCash, type ReceivableSummary, type SettlementSuggestion } from "./balance"
import { computeBudget, naiveDailyDisplayRupees, type BudgetResult } from "./budget"
import { addDays, daysBetween, eachDate, formatDate, formatDateLong, previousCycle, type SalaryCycle } from "./dates"
import { forecastMonthEnd, type Forecast } from "./forecast"
import { projectGoal } from "./goal"
import { accountCycle, coverageStart, habitEffectPaise, roleOf, spendEffectPaise, type CommitmentLine, type CycleAccount, type SalaryStatus } from "./plan"
import { bucketOf, reconcile, type Recon } from "./reconcile"

export interface PoolItem {
  name: string
  amountPaise: number
}

export interface LedgerRow {
  tx: Transaction
  leftAfterPaise: number | null
}

export interface DrawerRow {
  label: string
  value: string
  note?: string
}

export interface Leak {
  label: string
  start: string
  end: string
  totalPaise: number
  orders: number
  perWeek: number
  averagePaise: number
  ids: string[]
}

export interface GoalView {
  name: string
  targetPaise: number
  deadline: string
  progressPaise: number
  monthlyPaise: number
  projectedDate: string | null
  months: number | null
}

export interface Comparison {
  days: number
  thisPaise: number
  previousPaise: number | null
  previousLabel: string
}

export interface Freshness {
  dataThrough: string | null
  stale: boolean
  note: string
  basis: "confirmed" | "estimate"
  balanceConfirmedOn: string | null
  balanceNote: string
}

export interface Headline {
  availablePaise: number
  basis: "confirmed" | "estimate"
  label: string
  lines: { label: string; paise: number; kind: "actual" | "planned" | "estimate" | "expected"; note?: string }[]
}

export interface Snapshot {
  asOf: string
  hasIncome: boolean
  incomePaise: number
  incomeNote: string
  salary: SalaryStatus
  expectedSalaryPaise: number | null
  cycle: SalaryCycle
  account: CycleAccount
  fixedItems: PoolItem[]
  savingsItems: PoolItem[]
  fixedPaise: number
  savingsPaise: number
  goalsPaise: number
  bufferPaise: number
  carryPaise: number
  estimatePaise: number
  safeToSpendPaise: number
  budget: BudgetResult
  naiveDisplayRupees: number
  movers: LedgerRow[]
  outsideToday: Transaction[]
  pendingToday: Transaction[]
  morning: string
  night: string | null
  reconciliation: Recon
  uncategorised: number
  drawer: { formula: string; rows: DrawerRow[]; assumptions: string[] }
  leak: Leak
  goal: GoalView | null
  forecast: Forecast | null
  forecastNote: string
  comparison: Comparison
  freshness: Freshness
  headline: Headline
  bills: CommitmentLine[]
  balances: AccountBalance[]
  confirmed: ConfirmedCash | null
  receivables: ReceivableSummary
  settlementSuggestions: SettlementSuggestion[]
}

const LEAK_CATEGORIES = new Set(["Quick commerce", "Food delivery"])

export function dataThrough(transactions: Transaction[]): string | null {
  let last: string | null = null
  for (const tx of transactions) if (!tx.pending && (!last || tx.date > last)) last = tx.date
  return last
}

export function buildSnapshot(
  transactions: Transaction[],
  settings: Settings,
  asOf: string,
  context: MoneyContext = EMPTY_CONTEXT,
): Snapshot {
  const commitments = settings.commitments
  const account = accountCycle(transactions, settings, asOf, undefined, true, context)
  const cycle = account.cycle
  const estimatePaise = account.estimate?.paise ?? 0
  const today = transactions
    .filter((tx) => tx.date === asOf)
    .sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id))
  const pendingToday = today.filter((tx) => tx.pending)
  const postedToday = today.filter((tx) => !tx.pending)
  const confirmed = confirmedCash(transactions, context, asOf)
  const spentInCycle = account.spentBeforeTodayPaise + account.spentTodayPaise
  const confirmedLeft = confirmed ? leftFromBalance(account, confirmed, transactions, context, asOf) : null
  // Discretionary money is cycle-based: this cycle's salary plus any deficit carried in. Money saved in earlier
  // cycles shows up in a confirmed balance, but it is a cushion, not spending money. The balance can only lower the figure.
  const cyclePool = account.salary.paise + account.carryPaise + account.borrowedPaise - account.fixedPaise - account.savingsPaise
    - account.goalsPaise - account.bufferPaise - estimatePaise
  if (confirmedLeft) {
    const cushion = confirmedLeft.leftPaise + spentInCycle - cyclePool
    if (cushion > 0) {
      confirmedLeft.lines.push({ label: "Cushion from earlier cycles (savings, not spending money)", paise: -cushion, kind: "planned" })
      confirmedLeft.leftPaise -= cushion
    }
  }
  const budget = computeBudget({
    asOf,
    poolPaise: confirmedLeft ? confirmedLeft.leftPaise + spentInCycle : undefined,
    cycleEnd: cycle.end,
    incomePaise: account.salary.paise + account.carryPaise,
    fixedPaise: account.fixedPaise,
    savingsPaise: account.savingsPaise,
    otherReservedPaise: account.goalsPaise + account.bufferPaise + estimatePaise,
    spentBeforeTodayPaise: account.spentBeforeTodayPaise,
    spentTodayPaise: account.spentTodayPaise,
    weekendWeighted: settings.weekendWeighted,
    weekendWeight: settings.weekendWeight,
  })
  const fixedItems = account.fixed.map((line) => ({ name: line.name, amountPaise: line.reservedPaise }))
  if (account.unplannedFixedPaise > 0) fixedItems.push({ name: "Other fixed payments", amountPaise: account.unplannedFixedPaise })
  const savingsItems = account.savingsLines.map((line) => ({ name: line.name, amountPaise: line.reservedPaise }))
  const movers = runningLedger(postedToday.filter((tx) => roleOf(tx, commitments) === "spend"), budget.budgetPaise, commitments)
  const outsideToday = postedToday.filter((tx) => roleOf(tx, commitments) !== "spend")
  const morning = morningLine(formatINR(budget.budgetPaise), formatINR(Math.max(budget.poolLeftAtStartPaise, 0)))
  const night = budget.spentDisplayRupees === 0
    ? null
    : nightLine(
        formatINR(budget.spentTodayPaise),
        formatINR(budget.budgetPaise),
        gapPhrase(budget.gapDisplayRupees, (rupees) => formatINR(rupees * 100)),
        budget.tomorrow.cycleEnded ? null : formatINR(budget.tomorrow.budgetPaise),
      )
  const covered = coverageStart(transactions, settings)
  const { forecast, note: forecastNote } = buildForecast(transactions, commitments, covered, asOf, budget)
  const freshness = buildFreshness(transactions, asOf, confirmed, account)
  return {
    asOf,
    hasIncome: account.salary.paise > 0,
    incomePaise: account.salary.paise,
    incomeNote: account.salary.note,
    salary: account.salary,
    expectedSalaryPaise: settings.incomePaise,
    cycle,
    account,
    fixedItems,
    savingsItems,
    fixedPaise: account.fixedPaise,
    savingsPaise: account.savingsPaise,
    goalsPaise: account.goalsPaise,
    bufferPaise: account.bufferPaise,
    carryPaise: account.carryPaise,
    estimatePaise,
    safeToSpendPaise: Math.max(budget.leftInCyclePaise, 0),
    budget,
    naiveDisplayRupees: naiveDailyDisplayRupees(account.salary.paise, cycle.days),
    movers,
    outsideToday,
    pendingToday,
    morning,
    night,
    reconciliation: reconcile(transactions, commitments),
    uncategorised: transactions.filter((tx) => !tx.pending && tx.category === "Uncategorised").length,
    drawer: drawer(account, budget, settings, freshness),
    leak: buildLeak(transactions, commitments, cycle, asOf),
    goal: buildGoal(transactions, settings, account.savingsPaise, asOf),
    forecast,
    forecastNote,
    comparison: compareCycles(transactions, settings, covered, cycle, asOf),
    freshness,
    headline: buildHeadline(account, budget, confirmedLeft),
    bills: [...account.fixed, ...account.savingsLines],
    balances: accountBalances(transactions, context, asOf),
    confirmed,
    receivables: summariseReceivables(context.receivables),
    settlementSuggestions: suggestSettlements(transactions, context.receivables),
  }
}

interface BalanceLeft {
  leftPaise: number
  lines: Headline["lines"]
}

function leftFromBalance(
  account: CycleAccount,
  confirmed: ConfirmedCash,
  transactions: Transaction[],
  context: MoneyContext,
  asOf: string,
): BalanceLeft {
  const lines: Headline["lines"] = [
    { label: `Balance in ${confirmed.accounts.join(", ")}`, paise: confirmed.cashPaise, kind: "actual", note: `Confirmed ${formatDate(confirmed.confirmedOn)}, plus every transaction since` },
  ]
  const salaryLanded = transactions.some((tx) => tx.date > confirmed.confirmedOn && tx.date <= asOf && tx.category === "Income" && tx.direction === "credit")
  if (account.salary.status === "expected" && confirmed.confirmedOn < account.cycle.start && !salaryLanded) {
    lines.push({ label: "Salary assumed on payday", paise: account.salary.paise, kind: "estimate", note: "Not in your data yet" })
  }
  for (const line of account.fixed) {
    if (line.status === "paid" || line.status === "skipped") continue
    lines.push({ label: line.periodic ? `Setting aside for ${line.name}` : `${line.name}, not paid yet`, paise: -Math.max(line.reservedPaise - line.actualPaise, 0), kind: "planned" })
  }
  const savingsDone = account.savingsLines.reduce((sum, line) => sum + Math.max(line.actualPaise, 0), 0)
  const savingsLeft = Math.max(account.savingsPaise - savingsDone, 0)
  if (savingsLeft) lines.push({ label: "Savings still to move", paise: -savingsLeft, kind: "planned" })
  const held = context.allocations.filter((item) => item.date <= asOf).reduce((sum, item) => sum + item.amountPaise, 0)
  if (held) lines.push({ label: "Goal money kept in this account", paise: -held, kind: "actual" })
  const goalsLeft = account.goals.reduce((sum, goal) => sum + Math.max(goal.monthlyPaise - goal.contributedPaise, 0), 0)
  if (goalsLeft) lines.push({ label: "Goal contributions still due", paise: -goalsLeft, kind: "planned" })
  if (confirmed.cardOwedPaise) lines.push({ label: "Credit card to repay", paise: -confirmed.cardOwedPaise, kind: "actual" })
  if (account.bufferPaise) lines.push({ label: "Buffer", paise: -account.bufferPaise, kind: "planned" })
  return { leftPaise: lines.reduce((sum, line) => sum + line.paise, 0), lines }
}

function buildHeadline(account: CycleAccount, budget: BudgetResult, confirmedLeft: BalanceLeft | null): Headline {
  if (confirmedLeft) {
    const estimated = confirmedLeft.lines.some((line) => line.kind === "estimate")
    return {
      availablePaise: budget.leftInCyclePaise,
      basis: estimated ? "estimate" : "confirmed",
      label: estimated ? "Estimate" : "From your confirmed balance",
      lines: confirmedLeft.lines,
    }
  }
  const lines: Headline["lines"] = []
  if (account.salary.status === "confirmed") lines.push({ label: "Salary received", paise: account.salary.paise, kind: "actual" })
  else if (account.salary.status === "expected") lines.push({ label: "Salary assumed on payday", paise: account.salary.paise, kind: "estimate", note: account.salary.note })
  else if (account.salary.status === "late") lines.push({ label: "Salary expected, not counted", paise: 0, kind: "expected", note: account.salary.note })
  if (account.carryPaise) lines.push({ label: "Overspend from last cycle", paise: account.carryPaise, kind: "actual" })
  if (account.borrowedPaise) lines.push({ label: "Borrowed this cycle (not income)", paise: account.borrowedPaise, kind: "actual" })
  for (const line of account.fixed) {
    if (line.status === "skipped") continue
    const kind = line.status === "paid" ? "actual" : "planned"
    lines.push({ label: line.status === "paid" ? `${line.name}, paid` : `${line.name}, kept aside`, paise: -line.reservedPaise, kind })
  }
  if (account.unplannedFixedPaise) lines.push({ label: "Other fixed payments", paise: -account.unplannedFixedPaise, kind: "actual" })
  lines.push({ label: "Savings", paise: -account.savingsPaise, kind: "planned" })
  for (const goal of account.goals) lines.push({ label: `Goal: ${goal.name}`, paise: -goal.reservedPaise, kind: "planned" })
  if (account.bufferPaise) lines.push({ label: "Buffer", paise: -account.bufferPaise, kind: "planned" })
  if (account.estimate) lines.push({ label: `Estimated spend, ${account.estimate.days} days before you joined`, paise: -account.estimate.paise, kind: "estimate" })
  lines.push({ label: "Spent this cycle", paise: -(account.spentBeforeTodayPaise + account.spentTodayPaise), kind: "actual" })
  const estimated = lines.some((line) => line.kind === "estimate")
  return {
    availablePaise: budget.leftInCyclePaise,
    basis: estimated ? "estimate" : "confirmed",
    label: estimated ? "Estimate. Confirm a closing balance and record missing payments" : "From your statement",
    lines,
  }
}

function buildForecast(
  transactions: Transaction[],
  commitments: Commitment[],
  covered: string | null,
  asOf: string,
  budget: BudgetResult,
): { forecast: Forecast | null; note: string } {
  if (!covered || covered >= asOf) return { forecast: null, note: "Not enough data yet. Import a statement to see a forecast." }
  const from = covered > addDays(asOf, -60) ? covered : addDays(asOf, -60)
  const daily = eachDate(from, addDays(asOf, -1)).map((date) =>
    transactions.filter((tx) => tx.date === date).reduce((sum, tx) => sum + habitEffectPaise(tx, commitments), 0),
  )
  const forecast = forecastMonthEnd(daily, budget.leftInCyclePaise, Math.max(budget.daysLeft - 1, 0))
  if (!forecast) return { forecast: null, note: `Not enough data yet. ${daily.length} of 7 days recorded.` }
  return { forecast, note: `Based on ${daily.length} recorded days. One-off payments are left out.` }
}

function buildFreshness(transactions: Transaction[], asOf: string, confirmed: ConfirmedCash | null, account: CycleAccount): Freshness {
  const last = dataThrough(transactions)
  const estimated = !confirmed || account.salary.status === "expected" || account.estimate !== null
  const balance = {
    basis: (estimated ? "estimate" : "confirmed") as Freshness["basis"],
    balanceConfirmedOn: confirmed?.confirmedOn ?? null,
    balanceNote: confirmed ? `Balance confirmed ${formatDate(confirmed.confirmedOn)}.` : "Balance not confirmed. Figures are estimates.",
  }
  if (!last) return { dataThrough: null, stale: true, note: "No statement imported yet. Update needed.", ...balance }
  const gap = daysBetween(last, asOf)
  if (gap > 3) return { dataThrough: last, stale: true, note: `Data updated through ${formatDate(last)}. Update needed.`, ...balance }
  return { dataThrough: last, stale: false, note: `Data updated through ${formatDate(last)}.`, ...balance }
}

function compareCycles(
  transactions: Transaction[],
  settings: Settings,
  covered: string | null,
  cycle: SalaryCycle,
  asOf: string,
): Comparison {
  const days = cycle.daysElapsed
  const habit = (from: string, to: string) =>
    transactions
      .filter((tx) => tx.date >= from && tx.date <= to)
      .reduce((sum, tx) => sum + habitEffectPaise(tx, settings.commitments), 0)
  const thisPaise = habit(cycle.start, asOf)
  const prev = previousCycle(cycle, settings.payday)
  const prevTo = addDays(prev.start, days - 1) < prev.end ? addDays(prev.start, days - 1) : prev.end
  const previousLabel = `${formatDate(prev.start)} to ${formatDate(prevTo)}`
  if (!covered || covered > prev.start) return { days, thisPaise, previousPaise: null, previousLabel }
  return { days, thisPaise, previousPaise: habit(prev.start, prevTo), previousLabel }
}

function runningLedger(rows: Transaction[], openingPaise: number, commitments: Commitment[]): LedgerRow[] {
  let left = openingPaise
  return rows.map((tx) => {
    left -= spendEffectPaise(tx, commitments)
    return { tx, leftAfterPaise: left }
  })
}

function buildLeak(transactions: Transaction[], commitments: Commitment[], cycle: SalaryCycle, asOf: string): Leak {
  const early = cycle.daysElapsed <= 2
  const start = early ? addDays(asOf, -29) : cycle.start
  const label = early ? `Last 30 days, ${formatDate(start)} to ${formatDate(asOf)}` : "This salary cycle"
  const rows = transactions.filter(
    (tx) =>
      !tx.pending &&
      tx.date >= start &&
      tx.date <= asOf &&
      LEAK_CATEGORIES.has(tx.category) &&
      bucketOf(tx, commitments) === "flexible",
  )
  const totalPaise = rows.reduce((sum, tx) => sum + tx.amountPaise, 0)
  const span = Math.max(daysBetween(start, asOf) + 1, 1)
  return {
    label,
    start,
    end: asOf,
    totalPaise,
    orders: rows.length,
    perWeek: rows.length / (span / 7),
    averagePaise: rows.length ? Math.round(totalPaise / rows.length) : 0,
    ids: rows.map((tx) => tx.id),
  }
}

function buildGoal(transactions: Transaction[], settings: Settings, savingsPaise: number, asOf: string): GoalView | null {
  if (!settings.goal) return null
  const progressPaise = transactions
    .filter((tx) => !tx.pending && tx.direction === "debit" && (tx.category === "SIP" || tx.category === "Savings" || (tx.transfer && /sav/i.test(tx.narration))))
    .reduce((sum, tx) => sum + tx.amountPaise, 0)
  const projected = projectGoal(settings.goal.targetPaise - progressPaise, savingsPaise, asOf)
  return {
    name: settings.goal.name,
    targetPaise: settings.goal.targetPaise,
    deadline: settings.goal.deadline,
    progressPaise,
    monthlyPaise: savingsPaise,
    projectedDate: projected.date,
    months: projected.months,
  }
}

function money(paise: number): string {
  return formatExactINR(paise)
}

function drawer(
  account: CycleAccount,
  budget: BudgetResult,
  settings: Settings,
  freshness: Freshness,
): Snapshot["drawer"] {
  const { cycle, salary } = account
  const rows: DrawerRow[] = [
    { label: salary.status === "confirmed" ? "Salary, confirmed" : "Salary, expected", value: money(salary.paise), note: salary.note },
  ]
  if (account.carryPaise < 0) rows.push({ label: "Deficit from last cycle", value: money(account.carryPaise), note: "Overspend carried forward" })
  for (const line of account.fixed) {
    const note = line.actualPaise > line.plannedPaise
      ? `Planned ${money(line.plannedPaise)}, paid ${money(line.actualPaise)}. The larger amount is kept aside.`
      : line.paid ? `Paid ${money(line.actualPaise)}` : "Not paid yet, kept aside"
    rows.push({ label: line.name, value: money(line.reservedPaise), note })
  }
  if (account.unplannedFixedPaise > 0) rows.push({ label: "Other fixed payments", value: money(account.unplannedFixedPaise), note: "Marked fixed, no matching commitment" })
  rows.push({ label: "Fixed total", value: money(account.fixedPaise) })
  rows.push({
    label: "Savings and SIPs",
    value: money(account.savingsPaise),
    note: account.savingsAuto ? `Auto target ${money(account.savingsTargetPaise)}. ${account.savingsSplit.note}` : `Your target ${money(account.savingsTargetPaise)}`,
  })
  for (const goal of account.goals) {
    rows.push({
      label: `Goal: ${goal.name}`,
      value: money(goal.reservedPaise),
      note: `${money(goal.monthlyPaise)} a month, ${money(goal.contributedPaise)} added this cycle. Counted once.`,
    })
  }
  rows.push({ label: "Buffer", value: money(account.bufferPaise), note: "A small cushion for surprises" })
  if (account.estimate) {
    rows.push({
      label: "Estimated spend before you joined",
      value: money(account.estimate.paise),
      note: `${account.estimate.days} days not covered. Import a statement from ${formatDate(cycle.start)} for the real number.`,
    })
  }
  rows.push(
    { label: "Spendable this cycle", value: money(budget.poolPaise), note: "Salary minus everything kept aside" },
    { label: "Spent before today", value: money(account.spentBeforeTodayPaise), note: account.oneOffPaise ? `Includes ${money(account.oneOffPaise)} of one-off payments` : undefined },
    { label: "Spent today", value: money(budget.spentTodayPaise) },
    { label: "Left this cycle", value: money(budget.leftInCyclePaise), note: budget.overByPaise ? `Over by ${money(budget.overByPaise)}. Carries into the next cycle.` : undefined },
    { label: "Days left, including today", value: String(budget.daysLeft) },
    { label: "Safe to spend today", value: formatINR(budget.budgetPaise) },
  )
  const assumptions = [
    `This cycle runs ${formatDateLong(cycle.start)} to ${formatDateLong(cycle.end)}, payday to payday.`,
    "Each fixed cost keeps aside the larger of what you planned and what you actually paid.",
    "Every payment counts against the cycle, one-offs included. Marking a payment one-off only keeps it out of habits and forecasts.",
    "Transfers between your own accounts are ignored. Refunds add money back.",
    freshness.note,
    freshness.balanceNote,
  ]
  if (settings.weekendWeighted) {
    assumptions.push(`Weekend days carry weight ${settings.weekendWeight}. Other days carry weight 1.`)
  }
  const reserved = account.fixedPaise + account.savingsPaise + account.goalsPaise + account.bufferPaise + (account.estimate?.paise ?? 0)
  const spent = account.spentBeforeTodayPaise + budget.spentTodayPaise
  const formula = `${formatINR(salary.paise + account.carryPaise)} − ${formatINR(reserved)} kept aside − ${formatINR(spent)} spent = ${formatINR(budget.leftInCyclePaise)}, spread over ${budget.daysLeft} days.`
  return { formula, rows, assumptions }
}
