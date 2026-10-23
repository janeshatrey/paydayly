import type { Commitment, CommitmentKind, Transaction } from "../types"

const FIXED_KIND: Partial<Record<Transaction["category"], CommitmentKind>> = {
  Rent: "rent",
  EMI: "emi",
  Bills: "bills",
  Subscription: "bills",
  SIP: "sip",
  Savings: "savings",
}

export type Bucket = "pending" | "income" | "transfer" | "one-off" | "fixed" | "refund" | "flexible"

export function resolveFixed(tx: Transaction, commitments: Commitment[]): boolean {
  if (tx.fixedOverride !== null) return tx.fixedOverride
  const kind = FIXED_KIND[tx.category]
  if (!kind) return false
  return commitments.some((item) => item.kind === kind)
}

export function bucketOf(tx: Transaction, commitments: Commitment[]): Bucket {
  if (tx.pending) return "pending"
  if (tx.transfer || tx.category === "Transfer") return "transfer"
  if (tx.category === "Income") return "income"
  if (tx.oneOff) return "one-off"
  if (resolveFixed(tx, commitments)) return "fixed"
  if (tx.direction === "credit" || tx.category === "Refund") return "refund"
  return "flexible"
}

export function flexibleEffectPaise(tx: Transaction, commitments: Commitment[]): number {
  const bucket = bucketOf(tx, commitments)
  if (bucket === "flexible") return tx.amountPaise
  if (bucket === "refund") return -tx.amountPaise
  return 0
}

export interface Recon {
  ok: boolean
  rawPaise: number
  classifiedPaise: number
  gapPaise: number
  count: number
}

export function reconcile(transactions: Transaction[], commitments: Commitment[]): Recon {
  const rawPaise = transactions.reduce((sum, tx) => sum + tx.amountPaise, 0)
  const byCategory = new Map<string, number>()
  const byBucket = new Map<Bucket, number>()
  for (const tx of transactions) {
    byCategory.set(tx.category, (byCategory.get(tx.category) ?? 0) + tx.amountPaise)
    const bucket = bucketOf(tx, commitments)
    byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + tx.amountPaise)
  }
  let classifiedPaise = 0
  for (const value of byCategory.values()) classifiedPaise += value
  let bucketPaise = 0
  for (const value of byBucket.values()) bucketPaise += value
  const gapPaise = rawPaise - classifiedPaise
  return {
    ok: gapPaise === 0 && bucketPaise === rawPaise && transactions.every((tx) => tx.amountPaise >= 0),
    rawPaise,
    classifiedPaise,
    gapPaise,
    count: transactions.length,
  }
}
