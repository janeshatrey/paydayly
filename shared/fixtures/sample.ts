import { categorise } from "../src/engine/categorise"
import { addDays } from "../src/engine/dates"
import type { Settings, Transaction } from "../src/types"

export const SAMPLE_AS_OF = "2026-09-01"

interface Seed {
  date: string
  time: string
  narration: string
  rupees: number
  direction?: "debit" | "credit"
  oneOff?: boolean
  pending?: boolean
}

export function sampleSettings(): Settings {
  return {
    incomePaise: 10_000_000,
    payday: 1,
    savingsTargetPaise: 1_500_000,
    bufferPaise: 0,
    trackingSince: null,
  salaryDelayedFor: null,
    goals: [],
    commitments: [
      { id: "rent", name: "Rent", kind: "rent", amountPaise: 2_500_000 },
      { id: "emi", name: "Home EMI", kind: "emi", amountPaise: 800_000 },
      { id: "bills", name: "Bills and subscriptions", kind: "bills", amountPaise: 450_000 },
      { id: "sip", name: "SIP", kind: "sip", amountPaise: 1_000_000 },
      { id: "save", name: "Savings set aside", kind: "savings", amountPaise: 500_000 },
    ],
    weekendWeighted: false,
    weekendWeight: 1.3,
    goal: { name: "Emergency fund", targetPaise: 15_000_000, deadline: "2027-09-01" },
    dismissedFlagIds: [],
  }
}

function structuredSeeds(): Seed[] {
  return [
    { date: "2026-07-01", time: "09:05", narration: "NEFT-CR-ACME PVT LTD-SALARY-JUL", rupees: 100000, direction: "credit" },
    { date: "2026-08-01", time: "09:05", narration: "NEFT-CR-ACME PVT LTD-SALARY-AUG", rupees: 100000, direction: "credit" },
    { date: "2026-09-01", time: "09:05", narration: "NEFT-CR-ACME PVT LTD-SALARY-SEP", rupees: 100000, direction: "credit" },
    { date: "2026-07-01", time: "09:20", narration: "UPI/DR/44021/RENT/LANDLORD", rupees: 25000 },
    { date: "2026-08-01", time: "09:20", narration: "UPI/DR/44022/RENT/LANDLORD", rupees: 25000 },
    { date: "2026-09-01", time: "09:20", narration: "UPI/DR/44023/RENT/LANDLORD", rupees: 25000 },
    { date: "2026-06-05", time: "10:00", narration: "ACH/DR/EMI/HDFC HOME LOAN", rupees: 8000 },
    { date: "2026-07-05", time: "10:00", narration: "ACH/DR/EMI/HDFC HOME LOAN", rupees: 8000 },
    { date: "2026-08-05", time: "10:00", narration: "ACH/DR/EMI/HDFC HOME LOAN", rupees: 8000 },
    { date: "2026-06-07", time: "10:15", narration: "NACH/DR/SIP/GROWW", rupees: 10000 },
    { date: "2026-07-07", time: "10:15", narration: "NACH/DR/SIP/GROWW", rupees: 10000 },
    { date: "2026-08-07", time: "10:15", narration: "NACH/DR/SIP/GROWW", rupees: 10000 },
    { date: "2026-06-12", time: "18:02", narration: "UPI/DR/NETFLIX/ENTERTAINMENT", rupees: 199 },
    { date: "2026-07-12", time: "18:02", narration: "UPI/DR/NETFLIX/ENTERTAINMENT", rupees: 199 },
    { date: "2026-08-12", time: "18:04", narration: "UPI/DR/NETFLIX/ENTERTAINMENT", rupees: 249 },
    { date: "2026-06-15", time: "18:10", narration: "UPI/DR/SPOTIFY/ENTERTAINMENT", rupees: 119 },
    { date: "2026-07-15", time: "18:10", narration: "UPI/DR/SPOTIFY/ENTERTAINMENT", rupees: 119 },
    { date: "2026-08-15", time: "18:11", narration: "UPI/DR/SPOTIFY/ENTERTAINMENT", rupees: 119 },
    { date: "2026-06-18", time: "11:00", narration: "UPI/DR/BESCOM/BILLPAY", rupees: 1820 },
    { date: "2026-07-19", time: "11:04", narration: "UPI/DR/BESCOM/BILLPAY", rupees: 2410 },
    { date: "2026-08-17", time: "11:12", narration: "UPI/DR/BESCOM/BILLPAY", rupees: 1980 },
    { date: "2026-06-20", time: "21:10", narration: "UPI/DR/TRUFFLES/INDUSIND", rupees: 860 },
    { date: "2026-07-22", time: "20:40", narration: "UPI/DR/TRUFFLES/INDUSIND", rupees: 1540 },
    { date: "2026-08-19", time: "21:05", narration: "UPI/DR/TRUFFLES/INDUSIND", rupees: 990 },
    { date: "2026-08-18", time: "21:04", narration: "UPI/DR/BLINKIT/PAYTM", rupees: 149 },
    { date: "2026-08-18", time: "21:09", narration: "UPI/DR/BLINKIT/PAYTM", rupees: 149 },
    { date: "2026-08-22", time: "16:40", narration: "UPI/DR/22910/CROMA/ELECTRONICS", rupees: 18400, oneOff: true },
    { date: "2026-08-25", time: "14:15", narration: "UPI/CR/AMAZON/REFUND", rupees: 499, direction: "credit" },
    { date: "2026-08-28", time: "19:00", narration: "UPI/DR/SELF TRANSFER/SAVINGS", rupees: 5000 },
    { date: "2026-08-09", time: "19:40", narration: "UPI/DR/99211/KIRANA NEAR HOME", rupees: 320 },
    { date: "2026-09-01", time: "08:12", narration: "UPI/DR/884211/THIRD WAVE COFFEE/OKICICI", rupees: 250, pending: true },
    { date: "2026-09-01", time: "10:46", narration: "UPI/DR/991002/BLINKIT/PAYTM", rupees: 600, pending: true },
    { date: "2026-09-01", time: "13:18", narration: "UPI/DR/102938/ZEPTO/YESBANK", rupees: 400, pending: true },
    { date: "2026-09-01", time: "15:52", narration: "UPI/DR/441287/SWIGGY/HDFC", rupees: 500, pending: true },
    { date: "2026-09-01", time: "17:41", narration: "UPI/DR/330191/AMAZON PAY/AXIS", rupees: 750, pending: true },
  ]
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function fillerSeeds(skip: Set<string>): Seed[] {
  const random = mulberry32(20260901)
  const merchants = [
    { narration: "UPI/DR/THIRD WAVE COFFEE/OKICICI", min: 40, max: 280 },
    { narration: "UPI/DR/BLINKIT/PAYTM", min: 120, max: 860 },
    { narration: "UPI/DR/ZEPTO/YESBANK", min: 110, max: 740 },
    { narration: "UPI/DR/SWIGGY INSTAMART/HDFC", min: 180, max: 920 },
    { narration: "UPI/DR/SWIGGY/HDFC", min: 160, max: 780 },
    { narration: "UPI/DR/ZOMATO/ICICI", min: 190, max: 860 },
    { narration: "UPI/DR/UBER/TRIP", min: 70, max: 420 },
    { narration: "UPI/DR/AMAZON PAY/AXIS", min: 220, max: 2100 },
  ]
  const seeds: Seed[] = []
  for (let date = "2026-06-02"; date <= "2026-08-31"; date = addDays(date, 1)) {
    if (skip.has(date)) continue
    const roll = random()
    const count = roll < 0.42 ? 0 : roll < 0.78 ? 1 : 2
    for (let index = 0; index < count; index += 1) {
      const merchant = merchants[Math.floor(random() * merchants.length)]
      const rupees = merchant.min + Math.floor(random() * (merchant.max - merchant.min + 1))
      const hour = 8 + Math.floor(random() * 13)
      const minute = Math.floor(random() * 60)
      seeds.push({
        date,
        time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        narration: merchant.narration,
        rupees,
      })
    }
  }
  return seeds
}

function toTransaction(seed: Seed, index: number): Transaction {
  const judged = categorise(seed.narration, [])
  return {
    id: `smp-${String(index + 1).padStart(3, "0")}`,
    date: seed.date,
    time: seed.time,
    amountPaise: Math.round(seed.rupees * 100),
    direction: seed.direction ?? "debit",
    narration: seed.narration,
    merchant: judged.merchant,
    category: judged.category,
    categorySource: judged.categorySource,
    confidence: judged.confidence,
    fixedOverride: null,
    transfer: judged.transfer,
    oneOff: seed.oneOff ?? false,
    pending: seed.pending ?? false,
  }
}

export function buildSample(): { settings: Settings; transactions: Transaction[] } {
  const structured = structuredSeeds()
  const skip = new Set(structured.map((seed) => seed.date))
  const seeds = [...structured, ...fillerSeeds(skip)].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.narration.localeCompare(b.narration),
  )
  return {
    settings: sampleSettings(),
    transactions: seeds.map(toTransaction),
  }
}
