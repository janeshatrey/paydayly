import type { Commitment, CommitmentKind, MoneyContext, Settings, Transaction } from "../types"
import { dueInMonth, EMPTY_CONTEXT, isSavingsKind, monthlyPaise, periodMonths } from "../types"
import { addDays, dateInCycle, daysBetween, previousCycle, salaryCycle, type SalaryCycle } from "./dates"
import { bucketOf } from "./reconcile"

export interface SavingsSplit {
  incomePaise: number
  needsPaise: number
  wantsPaise: number
  savingsPaise: number
  note: string
}

export function fiftyThirtyTwenty(incomePaise: number, needsPaise: number): SavingsSplit {
  if (incomePaise <= 0) {
    return { incomePaise, needsPaise, wantsPaise: 0, savingsPaise: 0, note: "Add your take-home salary to get a savings target." }
  }
  const floor = Math.round(incomePaise * 0.1)
  let savings = Math.round(incomePaise * 0.2)
  let wants = Math.round(incomePaise * 0.3)
  const excess = needsPaise - Math.round(incomePaise * 0.5)
  let note = "50% needs, 30% wants, 20% savings."
  if (excess > 0) {
    wants -= excess
    note = "Your fixed costs are above 50% of salary, so the extra comes out of wants first."
    if (wants < 0) {
      savings = Math.max(savings + wants, floor)
      wants = Math.max(incomePaise - needsPaise - savings, 0)
      note = "Your fixed costs are high, so savings drop below 20%, but never under 10%."
    }
  }
  return { incomePaise, needsPaise, wantsPaise: wants, savingsPaise: savings, note }
}

export function defaultBufferPaise(incomePaise: number): number {
  return Math.min(Math.round((incomePaise * 0.01) / 10_000) * 10_000, 200_000)
}

const KIND_OF: Partial<Record<Transaction["category"], CommitmentKind>> = {
  Rent: "rent",
  EMI: "emi",
  Bills: "bills",
  Subscription: "bills",
  SIP: "sip",
  Savings: "savings",
}

export interface CommitmentLine {
  id: string
  name: string
  kind: CommitmentKind
  plannedPaise: number
  actualPaise: number
  reservedPaise: number
  paid: boolean
  status: BillStatus
  dueDate: string | null
  periodic: boolean
}

export type BillStatus = "paid" | "skipped" | "due-today" | "overdue" | "upcoming"

export interface GoalLine {
  id: string
  name: string
  monthlyPaise: number
  contributedPaise: number
  reservedPaise: number
}

export interface SalaryStatus {
  paise: number
  expectedPaise: number
  status: "confirmed" | "expected" | "late" | "missing"
  note: string
}

export interface CycleAccount {
  cycle: SalaryCycle
  salary: SalaryStatus
  carryPaise: number
  fixed: CommitmentLine[]
  unplannedFixedPaise: number
  fixedPaise: number
  savingsLines: CommitmentLine[]
  savingsTargetPaise: number
  savingsAuto: boolean
  savingsSplit: SavingsSplit
  savingsPaise: number
  goals: GoalLine[]
  goalsPaise: number
  bufferPaise: number
  estimate: { paise: number; days: number } | null
  spentBeforeTodayPaise: number
  spentTodayPaise: number
  oneOffPaise: number
  borrowedPaise: number
}

export type Role = "skip" | "salary" | "fixed" | "savings" | "spend"

export function roleOf(tx: Transaction, commitments: Commitment[]): Role {
  const bucket = bucketOf(tx, commitments)
  if (bucket === "pending" || bucket === "transfer") return "skip"
  if (tx.category === "Card payment" || tx.category === "Loan") return "skip"
  const linked = tx.commitmentId ? commitments.find((item) => item.id === tx.commitmentId) : undefined
  if (linked && tx.direction === "debit") return isSavingsKind(linked.kind) ? "savings" : "fixed"
  if (tx.goalId && tx.direction === "debit") return "savings"
  if (bucket === "income") return tx.direction === "credit" ? "salary" : "spend"
  if (bucket === "fixed") return isSavingsKind(kindOf(tx)) ? "savings" : "fixed"
  if (bucket === "flexible" && tx.direction === "debit" && (tx.category === "SIP" || tx.category === "Savings")) return "savings"
  return "spend"
}

export function spendEffectPaise(tx: Transaction, commitments: Commitment[]): number {
  if (roleOf(tx, commitments) !== "spend") return 0
  return tx.direction === "credit" ? -tx.amountPaise : tx.amountPaise
}

export function habitEffectPaise(tx: Transaction, commitments: Commitment[]): number {
  if (tx.oneOff || tx.category === "Settlement" || tx.receivableId) return 0
  const effect = spendEffectPaise(tx, commitments)
  if (effect > 0 && tx.ownSharePaise !== null && tx.ownSharePaise !== undefined) return Math.min(tx.ownSharePaise, effect)
  return effect
}

function kindOf(tx: Transaction): CommitmentKind {
  return KIND_OF[tx.category] ?? "other"
}

function nameHit(item: Commitment, tx: Transaction): boolean {
  const text = `${tx.narration} ${tx.merchant}`.toLowerCase()
  return item.name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3)
    .some((word) => text.includes(word))
}

function cycleShare(item: Commitment): { planned: number; periodic: boolean } {
  const months = periodMonths(item.frequency)
  return { planned: monthlyPaise(item), periodic: months !== 1 }
}

function matchCommitments(
  rows: Transaction[],
  items: Commitment[],
  cycle: SalaryCycle,
  asOf: string,
  context: MoneyContext,
  assumedPaidBefore: string | null,
): { lines: CommitmentLine[]; unmatchedPaise: number } {
  const actual = new Map<string, number>()
  let unmatchedPaise = 0
  for (const tx of rows) {
    const signed = tx.direction === "credit" ? -tx.amountPaise : tx.amountPaise
    const linked = tx.commitmentId ? items.find((item) => item.id === tx.commitmentId) : undefined
    if (linked) {
      actual.set(linked.id, (actual.get(linked.id) ?? 0) + signed)
      continue
    }
    const sameKind = items.filter((item) => item.kind === kindOf(tx))
    const pool = sameKind.length ? sameKind : items.filter((item) => item.kind === "other")
    const matches = pool.filter((item) => nameHit(item, tx))
    const target = matches.length === 1 ? matches[0] : pool.length === 1 ? pool[0] : undefined
    if (!target) unmatchedPaise += signed
    else actual.set(target.id, (actual.get(target.id) ?? 0) + signed)
  }
  const lines = items.map((item): CommitmentLine => {
    const spent = actual.get(item.id) ?? 0
    const { planned, periodic } = cycleShare(item)
    const candidate = item.dueDay ? dateInCycle(cycle, item.dueDay) : null
    // Quarterly and yearly bills only fall due in their due month; other cycles just set a share aside.
    const dueDate = candidate && (!periodic || dueInMonth(item, Number(candidate.slice(5, 7)))) ? candidate : null
    const mark = context.billMarks.find((entry) => entry.commitmentId === item.id && entry.cycleStart === cycle.start)
    let status: BillStatus
    if (spent >= item.amountPaise || mark?.status === "paid") status = "paid"
    else if (mark?.status === "skipped") status = "skipped"
    else if (spent === 0 && !periodic && dueDate && assumedPaidBefore && dueDate < assumedPaidBefore) status = "paid"
    else if (dueDate === asOf) status = "due-today"
    else if (dueDate && dueDate < asOf) status = "overdue"
    else status = "upcoming"
    const assumed = status === "paid" && spent === 0 && mark?.status !== "paid"
    const dueThisCycle = periodic && dueDate ? item.amountPaise : planned
    const reservedPaise = status === "skipped" ? Math.max(spent, 0) : status === "paid" ? (assumed ? planned : spent) : Math.max(dueThisCycle, spent)
    return {
      id: item.id,
      name: item.name,
      kind: item.kind,
      plannedPaise: planned,
      actualPaise: assumed ? planned : spent,
      reservedPaise,
      paid: status === "paid",
      status,
      dueDate,
      periodic,
    }
  })
  return { lines, unmatchedPaise: Math.max(unmatchedPaise, 0) }
}

function within(tx: Transaction, start: string, end: string): boolean {
  return tx.date >= start && tx.date <= end
}

export function earliestDate(transactions: Transaction[]): string | null {
  let first: string | null = null
  for (const tx of transactions) if (!tx.pending && (!first || tx.date < first)) first = tx.date
  return first
}

export function coverageStart(transactions: Transaction[], settings: Settings): string | null {
  const first = earliestDate(transactions)
  if (!first) return null
  if (settings.trackingSince && settings.trackingSince < first) return settings.trackingSince
  return first
}

export function accountCycle(
  transactions: Transaction[],
  settings: Settings,
  asOf: string,
  cycle: SalaryCycle = salaryCycle(asOf, settings.payday),
  withCarry = true,
  context: MoneyContext = EMPTY_CONTEXT,
): CycleAccount {
  const { commitments } = settings
  const inCycle = transactions.filter((tx) => within(tx, cycle.start, cycle.end) && tx.date <= asOf)

  const salaryRows = transactions.filter(
    (tx) => tx.date <= asOf && within(tx, addDays(cycle.start, -3), addDays(cycle.nextPayday, -4)) && roleOf(tx, commitments) === "salary",
  )
  const creditedPaise = salaryRows.reduce((sum, tx) => sum + tx.amountPaise, 0)
  const expectedPaise = settings.incomePaise ?? 0
  const statementPastPayday = transactions.some((tx) => !tx.pending && tx.date >= addDays(cycle.start, 3) && tx.date <= asOf)
    && transactions.some((tx) => !tx.pending && tx.date <= cycle.start)
  const markedLate = settings.salaryDelayedFor === cycle.start
  let salary: SalaryStatus
  if (creditedPaise > 0) salary = { paise: creditedPaise, expectedPaise, status: "confirmed", note: "Salary credit seen in your statement." }
  else if (!settings.incomePaise) salary = { paise: 0, expectedPaise, status: "missing", note: "Add your take-home salary in Settings." }
  else if (markedLate || statementPastPayday) {
    salary = {
      paise: 0,
      expectedPaise,
      status: "late",
      note: markedLate
        ? "You marked this salary as delayed. It is expected, not available, until it arrives."
        : "Your statement runs past payday without a salary credit. Counted as expected, not available.",
    }
  } else salary = { paise: settings.incomePaise, expectedPaise, status: "expected", note: "Assumed paid on payday. Import a statement to confirm." }

  const fixedItems = commitments.filter((item) => !isSavingsKind(item.kind))
  const savingsItems = commitments.filter((item) => isSavingsKind(item.kind))
  const firstSeen = inCycle.reduce<string | null>((first, tx) => (!first || tx.date < first ? tx.date : first), null)
  const assumedPaidBefore = settings.trackingSince && settings.trackingSince > cycle.start
    ? (firstSeen && firstSeen < settings.trackingSince ? firstSeen : settings.trackingSince)
    : null
  const fixedMatch = matchCommitments(inCycle.filter((tx) => roleOf(tx, commitments) === "fixed"), fixedItems, cycle, asOf, context, assumedPaidBefore)
  const savingsMatch = matchCommitments(
    inCycle.filter((tx) => roleOf(tx, commitments) === "savings" && !tx.goalId),
    savingsItems,
    cycle,
    asOf,
    context,
    assumedPaidBefore,
  )
  const fixedPaise = fixedMatch.lines.reduce((sum, line) => sum + line.reservedPaise, 0) + fixedMatch.unmatchedPaise

  const plannedNeeds = fixedItems.reduce((sum, item) => sum + cycleShare(item).planned, 0)
  const baseIncome = settings.incomePaise ?? salary.paise
  const split = fiftyThirtyTwenty(baseIncome, plannedNeeds)
  const savingsAuto = settings.savingsTargetPaise === null
  const savingsTargetPaise = savingsAuto ? split.savingsPaise : settings.savingsTargetPaise!
  const savingsCommitted = savingsMatch.lines.reduce((sum, line) => sum + line.reservedPaise, 0) + savingsMatch.unmatchedPaise
  const savingsPaise = Math.max(savingsTargetPaise, savingsCommitted)

  const goals = settings.goals.map((goal) => {
    const inRange = (date: string) => date >= cycle.start && date <= cycle.end && date <= asOf
    const contributedPaise = context.allocations
      .filter((item) => item.goalId === goal.id && inRange(item.date))
      .reduce((sum, item) => sum + item.amountPaise, 0)
      + inCycle.filter((tx) => tx.goalId === goal.id && tx.direction === "debit").reduce((sum, tx) => sum + tx.amountPaise, 0)
    const remaining = Math.max(goal.targetPaise - goal.savedPaise, 0)
    // savedPaise already includes this cycle's allocations. Preserve money contributed
    // this cycle, but do not promise another contribution after the target is reached.
    const monthlyPaise = Math.min(goal.monthlyPaise, remaining + Math.max(contributedPaise, 0))
    return {
      id: goal.id,
      name: goal.name,
      monthlyPaise,
      contributedPaise,
      reservedPaise: Math.max(monthlyPaise, contributedPaise),
    }
  })
  const goalsPaise = goals.reduce((sum, goal) => sum + goal.reservedPaise, 0)
  const bufferPaise = settings.bufferPaise ?? defaultBufferPaise(baseIncome)

  let carryPaise = 0
  if (withCarry) {
    const prev = previousCycle(cycle, settings.payday)
    const start = coverageStart(transactions, settings)
    const prevHasData = transactions.some((tx) => !tx.pending && within(tx, prev.start, prev.end))
    if (start && start <= prev.start && prevHasData) {
      const before = accountCycle(transactions, settings, prev.end, prev, false, context)
      if (before.salary.status === "confirmed") {
        const left = before.salary.paise - before.fixedPaise - before.savingsPaise - before.goalsPaise - before.bufferPaise
          - before.spentBeforeTodayPaise - before.spentTodayPaise - (before.estimate?.paise ?? 0)
        carryPaise = Math.min(left, 0)
      }
    }
  }

  const spentBeforeTodayPaise = inCycle.filter((tx) => tx.date < asOf).reduce((sum, tx) => sum + spendEffectPaise(tx, commitments), 0)
  const spentTodayPaise = inCycle.filter((tx) => tx.date === asOf).reduce((sum, tx) => sum + spendEffectPaise(tx, commitments), 0)
  const oneOffPaise = inCycle.filter((tx) => tx.oneOff).reduce((sum, tx) => sum + spendEffectPaise(tx, commitments), 0)

  let estimate: CycleAccount["estimate"] = null
  if (settings.trackingSince && settings.trackingSince > cycle.start) {
    const statementFromPayday = inCycle.some((tx) => !tx.pending && tx.date <= addDays(cycle.start, 2)) || creditedPaise > 0
    if (!statementFromPayday) {
      const days = Math.min(daysBetween(cycle.start, assumedPaidBefore ?? settings.trackingSince), cycle.days)
      const wants = salary.paise + carryPaise - fixedPaise - savingsPaise - goalsPaise - bufferPaise
      if (days > 0 && wants > 0) estimate = { paise: Math.round((wants * days) / cycle.days), days }
    }
  }

  const borrowedPaise = inCycle
    .filter((tx) => !tx.pending && tx.category === "Loan" && tx.direction === "credit")
    .reduce((sum, tx) => sum + tx.amountPaise, 0)

  return {
    cycle,
    salary,
    carryPaise,
    fixed: fixedMatch.lines,
    unplannedFixedPaise: fixedMatch.unmatchedPaise,
    fixedPaise,
    savingsLines: savingsMatch.lines,
    savingsTargetPaise,
    savingsAuto,
    savingsSplit: split,
    savingsPaise,
    goals,
    goalsPaise,
    bufferPaise,
    estimate,
    spentBeforeTodayPaise,
    spentTodayPaise,
    oneOffPaise,
    borrowedPaise,
  }
}
