import type { Account, AffordResult, Category, CommitmentKind, Flag, Frequency, Receivable, Recurring, Snapshot, Transaction } from "@paydayly/shared"

export interface Profile {
  incomePaise: number | null
  payday: number
  weekendWeighted: boolean
  weekendWeight: number
  asOfDate: string | null
  onboarded: boolean
  theme: "light" | "dark" | "system"
  savingsTargetPaise: number | null
  bufferPaise: number | null
  trackingSince: string | null
  salaryDelayedFor: string | null
  language: "en" | "hi"
}

export interface User {
  id: string
  email: string
  name: string
  createdAt: string
  profile: Profile
}

export interface CommitmentItem {
  id: string
  name: string
  kind: CommitmentKind
  amountPaise: number
  dueDay: number | null
  frequency: Frequency
  dueMonth: number | null
}

export interface Goal {
  id: string
  name: string
  targetPaise: number
  savedPaise: number
  monthlyPaise: number
  deadline: string | null
  createdAt: string
  projectedDate?: string | null
  monthsLeft?: number | null
}

export interface Upcoming {
  id: string
  name: string
  kind: string
  amountPaise: number
  date: string
  daysAway: number
  source: "commitment" | "recurring"
  status?: string
}

export interface Dashboard {
  asOf: string
  empty: boolean
  transactionCount: number
  snapshot: Snapshot
  recurring: Recurring[]
  flags: Flag[]
  trend: { date: string; paise: number }[]
  categories: { category: Category; paise: number }[]
  budgets: { category: Category; limitPaise: number; spentPaise: number }[]
  upcoming: Upcoming[]
  goals: Goal[]
  accounts: Account[]
  receivables: Receivable[]
}

export interface ImportRecord {
  id: string
  filename: string
  added: number
  skipped: number
  rejected: number
  debitPaise: number | null
  creditPaise: number | null
  from: string | null
  to: string | null
  accountId: string | null
  createdAt: string
  undoneAt: string | null
}

export interface SessionItem {
  id: string
  createdAt: string
  lastSeenAt: string
  userAgent: string
  ip: string
  current: boolean
}

export interface AffordResponse {
  result: AffordResult
  basis: "confirmed" | "estimate"
}

export interface Draft {
  date: string
  amountPaise: number
  narration: string
  direction: "debit" | "credit"
}

export interface MonthView {
  month: string
  asOf: string
  label: string
  days: { date: string; flexiblePaise: number; count: number; future: boolean }[]
  totals: {
    incomePaise: number
    fixedSpentPaise: number
    flexiblePaise: number
    poolPaise: number
    plannedFixedPaise: number
    plannedSavingsPaise: number
  }
  categories: { category: Category; paise: number; limitPaise: number | null }[]
  topMerchants: { merchant: string; paise: number; count: number }[]
}

export type TxRow = Transaction & { bucket: string; source: string }

export interface NotificationItem {
  id: string
  kind: "overspend" | "bill" | "recurring" | "flag" | "budget" | "pool"
  title: string
  body: string
  createdAt: string
  read: boolean
}
