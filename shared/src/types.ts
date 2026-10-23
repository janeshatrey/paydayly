export const CATEGORIES = [
  "Income",
  "Rent",
  "EMI",
  "Bills",
  "Subscription",
  "SIP",
  "Savings",
  "Coffee",
  "Quick commerce",
  "Food delivery",
  "Shopping",
  "Transport",
  "Eating out",
  "Refund",
  "Transfer",
  "Card payment",
  "Loan",
  "Settlement",
  "Uncategorised",
] as const

export type Category = (typeof CATEGORIES)[number]

export const COMMITMENT_KINDS = [
  { kind: "rent", label: "Rent", group: "fixed" },
  { kind: "emi", label: "EMI", group: "fixed" },
  { kind: "bills", label: "Bills and subscriptions", group: "fixed" },
  { kind: "other", label: "Other fixed cost", group: "fixed" },
  { kind: "sip", label: "SIP", group: "savings" },
  { kind: "investment", label: "Monthly investment", group: "savings" },
  { kind: "savings", label: "Savings set aside", group: "savings" },
  { kind: "irregular", label: "Yearly or quarterly expense", group: "fixed" },
] as const

export type CommitmentKind = (typeof COMMITMENT_KINDS)[number]["kind"]

export type Frequency = "monthly" | "quarterly" | "yearly"

export interface Commitment {
  id: string
  name: string
  kind: CommitmentKind
  amountPaise: number
  dueDay?: number | null
  frequency?: Frequency
  dueMonth?: number | null
}

export type AccountKind = "bank" | "cash" | "card" | "loan"

export interface Account {
  id: string
  name: string
  kind: AccountKind
  spending: boolean
  primary: boolean
}

export interface BalanceConfirmation {
  accountId: string
  date: string
  balancePaise: number
}

export interface GoalAllocation {
  goalId: string
  date: string
  amountPaise: number
}

export interface GoalPlan {
  id: string
  name: string
  targetPaise: number
  savedPaise: number
  monthlyPaise: number
  deadline: string | null
}

export type ReceivableKind = "friends" | "reimbursement" | "refund"

export interface Receivable {
  id: string
  txId: string | null
  kind: ReceivableKind
  counterparty: string
  amountPaise: number
  settledPaise: number
  status: "open" | "settled" | "written_off"
  date: string
  note: string
}

export interface BillMark {
  commitmentId: string
  cycleStart: string
  status: "paid" | "skipped"
}

export interface CoverageRange {
  from: string
  to: string
}

export interface Transaction {
  id: string
  date: string
  time: string
  amountPaise: number
  direction: "debit" | "credit"
  narration: string
  merchant: string
  category: Category
  categorySource: "user" | "dictionary" | "keyword" | "fuzzy" | "type" | "uncategorised"
  confidence: number
  fixedOverride: boolean | null
  transfer: boolean
  oneOff: boolean
  pending: boolean
  accountId?: string | null
  counterAccountId?: string | null
  commitmentId?: string | null
  goalId?: string | null
  receivableId?: string | null
  refundOfId?: string | null
  ownSharePaise?: number | null
}

export interface Rule {
  id: string
  pattern: string
  category: Category
  createdAt: string
}

export interface AuditEntry {
  id: string
  at: string
  action: string
  detail: string
}

export interface CsvMapping {
  date: string
  narration: string
  debit: string
  credit: string
  time: string
  type?: string
  balance?: string
}

export interface Settings {
  incomePaise: number | null
  payday: number
  savingsTargetPaise: number | null
  bufferPaise: number | null
  trackingSince: string | null
  commitments: Commitment[]
  goals: GoalPlan[]
  weekendWeighted: boolean
  weekendWeight: number
  goal: { name: string; targetPaise: number; deadline: string } | null
  dismissedFlagIds: string[]
  salaryDelayedFor: string | null
}

export const EMPTY_SETTINGS: Settings = {
  incomePaise: null,
  payday: 1,
  savingsTargetPaise: null,
  bufferPaise: null,
  trackingSince: null,
  commitments: [],
  goals: [],
  weekendWeighted: false,
  weekendWeight: 1.3,
  goal: null,
  dismissedFlagIds: [],
  salaryDelayedFor: null,
}

export function isSavingsKind(kind: CommitmentKind): boolean {
  return kind === "sip" || kind === "investment" || kind === "savings"
}

export interface MoneyContext {
  accounts: Account[]
  confirmations: BalanceConfirmation[]
  allocations: GoalAllocation[]
  receivables: Receivable[]
  billMarks: BillMark[]
}

export const EMPTY_CONTEXT: MoneyContext = {
  accounts: [],
  confirmations: [],
  allocations: [],
  receivables: [],
  billMarks: [],
}

/** Monthly share of a commitment: a ₹12,000 yearly bill counts as ₹1,000 a month. */
export function monthlyPaise(item: { amountPaise: number; frequency?: Frequency }): number {
  return Math.round(item.amountPaise / periodMonths(item.frequency))
}

/** Whether a quarterly or yearly bill falls due in a given calendar month (1-12). Monthly bills are due every month. */
export function dueInMonth(item: { frequency?: Frequency; dueMonth?: number | null }, month: number): boolean {
  const months = periodMonths(item.frequency)
  if (months === 1) return true
  if (!item.dueMonth) return false
  return (((month - item.dueMonth) % months) + months) % months === 0
}

export function periodMonths(frequency: Frequency | undefined): number {
  if (frequency === "yearly") return 12
  if (frequency === "quarterly") return 3
  return 1
}
