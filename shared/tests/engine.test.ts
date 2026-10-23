import { describe, expect, it } from "vitest"
import { buildSample, SAMPLE_AS_OF } from "../fixtures/sample"
import { computeBudget } from "../src/engine/budget"
import { categorise } from "../src/engine/categorise"
import { daysInMonth } from "../src/engine/dates"
import { detectFlags } from "../src/engine/flags"
import { detectRecurring } from "../src/engine/recurring"
import { reconcile } from "../src/engine/reconcile"
import { buildSnapshot } from "../src/engine/snapshot"
import { applyMapping, guessMapping, readCsvTable } from "../src/import/csv"
import { gapPhrase, nightLine } from "../src/copy"
import { formatINR } from "../src/format"
import type { Commitment, Transaction } from "../src/types"

const baseBudget = {
  asOf: "2026-09-01",
  incomePaise: 10_000_000,
  fixedPaise: 3_750_000,
  savingsPaise: 1_500_000,
  spentBeforeTodayPaise: 0,
  spentTodayPaise: 0,
  weekendWeighted: false,
  weekendWeight: 1.3,
}

describe("safe to spend", () => {
  it("matches the worked example on day 1", () => {
    const day = computeBudget(baseBudget)
    expect(day.poolPaise).toBe(4_750_000)
    expect(day.daysLeft).toBe(30)
    expect(day.displayRupees).toBe(1583)
    expect(day.budgetPaise).toBe(158333)
  })

  it("shows the day over by 917 and tomorrow at 1552", () => {
    const day = computeBudget({ ...baseBudget, spentTodayPaise: 250_000 })
    expect(day.spentDisplayRupees).toBe(2500)
    expect(day.gapDisplayRupees).toBe(917)
    expect(day.over).toBe(true)
    expect(day.tomorrow.displayRupees).toBe(1552)
    expect(day.usedUp).toBe(false)
  })

  it("raises the next day after an under-spend", () => {
    const day = computeBudget({
      ...baseBudget,
      asOf: "2026-09-02",
      spentBeforeTodayPaise: 250_000,
      spentTodayPaise: 60_000,
    })
    expect(day.displayRupees).toBe(1552)
    expect(day.gapDisplayRupees).toBe(600 - 1552)
    expect(day.tomorrow.displayRupees).toBe(1586)
  })

  it("covers 28, 29, 30 and 31 day months and the last day", () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 9)).toBe(30)
    expect(daysInMonth(2026, 10)).toBe(31)
    expect(computeBudget({ ...baseBudget, asOf: "2026-02-01" }).daysLeft).toBe(28)
    expect(computeBudget({ ...baseBudget, asOf: "2028-02-01" }).daysLeft).toBe(29)
    expect(computeBudget({ ...baseBudget, asOf: "2026-10-01" }).daysLeft).toBe(31)
    const last = computeBudget({ ...baseBudget, asOf: "2026-09-30", fixedPaise: 0, savingsPaise: 0 })
    expect(last.daysLeft).toBe(1)
    expect(last.budgetPaise).toBe(10_000_000)
    expect(last.tomorrow.cycleEnded).toBe(true)
  })

  it("never shows a negative daily limit", () => {
    const day = computeBudget({ ...baseBudget, fixedPaise: 12_000_000, savingsPaise: 0 })
    expect(day.budgetPaise).toBe(0)
    expect(day.usedUp).toBe(true)
    expect(day.displayRupees).toBe(0)
  })
})

describe("sample month", () => {
  const sample = buildSample()
  const snap = buildSnapshot(sample.transactions, sample.settings, SAMPLE_AS_OF)

  it("opens on 1583 before the five payments are added", () => {
    expect(snap.budget.displayRupees).toBe(1583)
    expect(snap.pendingToday).toHaveLength(5)
    expect(snap.pendingToday.reduce((sum, tx) => sum + tx.amountPaise, 0)).toBe(250_000)
    expect(snap.budget.spentTodayPaise).toBe(0)
    expect(snap.morning).toContain("1,583")
    expect(snap.morning).toContain("47,500")
  })

  it("lands on the night line after those payments", () => {
    const posted = sample.transactions.map((tx) => ({ ...tx, pending: false }))
    const after = buildSnapshot(posted, sample.settings, SAMPLE_AS_OF)
    expect(after.budget.spentDisplayRupees).toBe(2500)
    expect(after.budget.gapDisplayRupees).toBe(917)
    expect(after.night).toBe(
      nightLine(formatINR(250_000), formatINR(158_333), gapPhrase(917, (rupees) => formatINR(rupees * 100)), formatINR(155_172)),
    )
    expect(after.night).toContain("2,500")
    expect(after.night).toContain("917")
    expect(after.night).toContain("1,552")
  })

  it("reconciles and keeps rent out of the daily pool", () => {
    expect(snap.reconciliation.ok).toBe(true)
    const rent = sample.transactions.find((tx) => tx.narration.includes("44023"))
    expect(rent?.category).toBe("Rent")
    expect(snap.movers.some((row) => row.tx.category === "Rent")).toBe(false)
    expect(sample.transactions.some((tx) => tx.category === "Uncategorised")).toBe(true)
    expect(snap.leak.totalPaise).toBeGreaterThan(0)
    expect(snap.leak.orders).toBeGreaterThan(5)
  })

  it("finds rent, the price rise, the duplicate, and the one-off", () => {
    const recurring = detectRecurring(sample.transactions, SAMPLE_AS_OF)
    expect(recurring.some((item) => item.merchant === "Rent")).toBe(true)
    expect(recurring.some((item) => item.merchant === "Truffles")).toBe(false)
    const netflix = recurring.find((item) => item.merchant === "Netflix")
    expect(netflix?.priceRiseIds.length).toBe(1)
    const flags = detectFlags(sample.transactions, recurring, [])
    expect(flags.some((flag) => flag.merchant === "Blinkit")).toBe(true)
    expect(flags.some((flag) => flag.merchant === "Croma")).toBe(true)
    expect(flags.some((flag) => flag.merchant === "Netflix")).toBe(true)
    expect(flags.some((flag) => flag.merchant === "Self")).toBe(false)
  })
})

describe("categories", () => {
  const cases: [string, string][] = [
    ["UPI/DR/884211/THIRD WAVE COFFEE/OKICICI", "Coffee"],
    ["UPI/DR/991002/BLINKIT/PAYTM", "Quick commerce"],
    ["UPI/DR/102938/ZEPTO/YESBANK", "Quick commerce"],
    ["UPI/DR/441287/SWIGGY/HDFC", "Food delivery"],
    ["UPI/DR/SWIGGY INSTAMART/HDFC", "Quick commerce"],
    ["UPI/DR/330191/AMAZON PAY/AXIS", "Shopping"],
    ["UPI/CR/AMAZON/REFUND", "Refund"],
    ["NEFT-CR-ACME PVT LTD-SALARY-SEP", "Income"],
    ["UPI/DR/44023/RENT/LANDLORD", "Rent"],
    ["ACH/DR/EMI/HDFC HOME LOAN", "EMI"],
    ["NACH/DR/SIP/GROWW", "SIP"],
    ["UPI/DR/SELF TRANSFER/SAVINGS", "Transfer"],
    ["UPI/DR/BLNKIT/PAYTM", "Quick commerce"],
  ]

  it("reads the sample narrations", () => {
    for (const [narration, category] of cases) {
      expect(categorise(narration, []).category, narration).toBe(category)
    }
  })

  it("lets a saved rule win", () => {
    const judged = categorise("UPI/DR/AMAZON PAY/AXIS", [
      { id: "1", pattern: "amazon", category: "Bills", createdAt: "2026-09-01" },
    ])
    expect(judged.category).toBe("Bills")
    expect(judged.categorySource).toBe("user")
  })
})

describe("csv", () => {
  const text = [
    "Date,Narration,Debit,Credit,Balance",
    "01/09/2026,UPI/DR/BLINKIT/PAYTM,600.50,,",
    "\"01-Sep-26\",\"UPI/DR/ZEPTO, GROCERY\",,\"1,200.00\",",
    "2026-09-03,Salary credit,,100000,",
    "32/09/2026,Bad date,10,,",
    "04/09/2026,No amount,,,",
    "05-09-2026,250 Dr,250 Dr,,",
  ].join("\n")

  it("maps columns and keeps the rejected rows visible", () => {
    const table = readCsvTable(text)
    const mapping = guessMapping(table.headers)
    expect(mapping?.date).toBe("Date")
    expect(mapping?.debit).toBe("Debit")
    const parsed = applyMapping(table.records, mapping!)
    expect(parsed.rows.map((row) => [row.date, row.amountPaise, row.direction])).toEqual([
      ["2026-09-01", 60050, "debit"],
      ["2026-09-01", 120000, "credit"],
      ["2026-09-03", 10_000_000, "credit"],
      ["2026-09-05", 25000, "debit"],
    ])
    expect(parsed.rejected).toHaveLength(2)
  })
})

describe("reconciliation", () => {
  it("holds for random ledgers", () => {
    let seed = 7
    const next = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let round = 0; round < 30; round += 1) {
      const transactions: Transaction[] = []
      for (let index = 0; index < 40; index += 1) {
        transactions.push({
          id: `t-${round}-${index}`,
          date: "2026-09-01",
          time: "12:00",
          amountPaise: Math.round(next() * 50_000),
          direction: next() > 0.7 ? "credit" : "debit",
          narration: "X",
          merchant: "Shop",
          category: next() > 0.5 ? "Shopping" : "Rent",
          categorySource: "dictionary",
          confidence: 1,
          fixedOverride: null,
          transfer: false,
          oneOff: false,
          pending: next() > 0.9,
        })
      }
      const commitments: Commitment[] = [{ id: "rent", name: "Rent", kind: "rent", amountPaise: 100 }]
      expect(reconcile(transactions, commitments).ok).toBe(true)
    }
  })
})
