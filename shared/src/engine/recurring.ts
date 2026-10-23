import { addDays } from "./dates"
import type { Transaction } from "../types"

export interface Recurring {
  merchant: string
  cadenceDays: number
  cadenceLabel: string
  medianPaise: number
  monthlyPaise: number
  nextDate: string
  count: number
  confidence: number
  transactionIds: string[]
  priceRiseIds: string[]
}

const CADENCES = [7, 14, 30, 365]

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function dayGap(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T00:00:00Z`)
  const b = Date.parse(`${later}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

function cadenceLabel(days: number): string {
  if (days === 7) return "Weekly"
  if (days === 14) return "Every two weeks"
  if (days === 30) return "Monthly"
  return "Yearly"
}

export function detectRecurring(transactions: Transaction[], asOf: string): Recurring[] {
  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (tx.pending || tx.direction !== "debit" || tx.transfer || tx.category === "Income") continue
    if (!tx.merchant || tx.merchant === "Unknown") continue
    const key = tx.merchant.toLowerCase()
    const list = groups.get(key) ?? []
    list.push(tx)
    groups.set(key, list)
  }

  const found: Recurring[] = []
  for (const list of groups.values()) {
    if (list.length < 3) continue
    const ordered = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    const gaps: number[] = []
    for (let i = 1; i < ordered.length; i += 1) gaps.push(dayGap(ordered[i - 1].date, ordered[i].date))
    if (gaps.length === 0) continue
    let best: { cadence: number; hits: number } | null = null
    for (const cadence of CADENCES) {
      const hits = gaps.filter((gap) => Math.abs(gap - cadence) <= 3).length
      if (!best || hits > best.hits) best = { cadence, hits }
    }
    if (!best || best.hits / gaps.length < 2 / 3) continue
    const amounts = ordered.map((tx) => tx.amountPaise)
    const mid = median(amounts)
    if (mid <= 0) continue
    const close = amounts.filter((amount) => Math.abs(amount - mid) / mid <= 0.05).length
    if (close / amounts.length < 2 / 3) continue
    const priceRiseIds = ordered
      .filter((tx) => (tx.amountPaise - mid) / mid > 0.05)
      .map((tx) => tx.id)
    let next = addDays(ordered[ordered.length - 1].date, best.cadence)
    while (next < asOf) next = addDays(next, best.cadence)
    const gapFit = best.hits / gaps.length
    const confidence = Math.min(0.99, 0.5 + 0.08 * Math.min(ordered.length, 5) + 0.2 * gapFit)
    found.push({
      merchant: ordered[0].merchant,
      cadenceDays: best.cadence,
      cadenceLabel: cadenceLabel(best.cadence),
      medianPaise: Math.round(mid),
      monthlyPaise: Math.round(mid * (30 / best.cadence)),
      nextDate: next,
      count: ordered.length,
      confidence: Number(confidence.toFixed(2)),
      transactionIds: ordered.map((tx) => tx.id),
      priceRiseIds,
    })
  }
  return found.sort((a, b) => b.monthlyPaise - a.monthlyPaise)
}
