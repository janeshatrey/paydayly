import type { Transaction } from "../types"
import { median, type Recurring } from "./recurring"

export interface Flag {
  id: string
  transactionId: string
  merchant: string
  amountPaise: number
  date: string
  reasons: string[]
}

function minutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number)
  return hour * 60 + minute
}

export function detectFlags(transactions: Transaction[], recurring: Recurring[], dismissed: string[]): Flag[] {
  const visible = transactions.filter((tx) => !tx.pending)
  const reasons = new Map<string, string[]>()
  const add = (tx: Transaction, reason: string) => {
    const list = reasons.get(tx.id) ?? []
    list.push(reason)
    reasons.set(tx.id, list)
  }

  const byMerchant = new Map<string, Transaction[]>()
  for (const tx of visible) {
    const key = tx.merchant.toLowerCase()
    const list = byMerchant.get(key) ?? []
    list.push(tx)
    byMerchant.set(key, list)
  }

  for (const list of byMerchant.values()) {
    const ordered = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    for (let i = 1; i < ordered.length; i += 1) {
      const prev = ordered[i - 1]
      const current = ordered[i]
      if (prev.direction !== "debit" || current.direction !== "debit") continue
      if (prev.date !== current.date) continue
      if (!prev.time || !current.time) continue
      if (minutes(current.time) - minutes(prev.time) <= 10) {
        add(current, `Second ${current.merchant} charge ${minutes(current.time) - minutes(prev.time)} minutes after another.`)
      }
    }
    const debits = ordered.filter((tx) => tx.direction === "debit" && !tx.transfer && tx.category !== "Transfer")
    const first = debits[0]
    if (first && first.amountPaise >= 500_000 && debits.length === 1) {
      add(first, `First payment to ${first.merchant}.`)
    }
  }

  for (const series of recurring) {
    for (const id of series.priceRiseIds) {
      const tx = visible.find((item) => item.id === id)
      if (!tx) continue
      const usual = Math.round(series.medianPaise / 100)
      const paid = Math.round(tx.amountPaise / 100)
      const pct = Math.round(((tx.amountPaise - series.medianPaise) / series.medianPaise) * 100)
      add(tx, `${tx.merchant} is ${pct}% above the usual ₹${usual.toLocaleString("en-IN")}. This one is ₹${paid.toLocaleString("en-IN")}.`)
    }
  }

  const byCategory = new Map<string, Transaction[]>()
  for (const tx of visible) {
    if (tx.direction !== "debit") continue
    const list = byCategory.get(tx.category) ?? []
    list.push(tx)
    byCategory.set(tx.category, list)
  }
  for (const [category, list] of byCategory) {
    if (list.length < 8) continue
    const amounts = list.map((tx) => tx.amountPaise)
    const mid = median(amounts)
    const mad = median(amounts.map((amount) => Math.abs(amount - mid)))
    if (mad === 0) continue
    for (const tx of list) {
      if (tx.amountPaise < 500_000) continue
      const score = (0.6745 * (tx.amountPaise - mid)) / mad
      if (score > 3.5) {
        add(tx, `This ${category} payment sits far from your usual ${category} amounts.`)
      }
    }
  }

  const flags: Flag[] = []
  for (const tx of visible) {
    const list = reasons.get(tx.id)
    if (!list || list.length === 0) continue
    const id = `flag:${tx.id}`
    if (dismissed.includes(id)) continue
    flags.push({
      id,
      transactionId: tx.id,
      merchant: tx.merchant,
      amountPaise: tx.amountPaise,
      date: tx.date,
      reasons: list,
    })
  }
  return flags.sort((a, b) => b.date.localeCompare(a.date) || b.amountPaise - a.amountPaise)
}
