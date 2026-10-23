import { describe, expect, it } from "vitest"
import { previousCycle, salaryCycle } from "../src/engine/dates"
import { similarPattern } from "../src/engine/categorise"
import { detectFlags } from "../src/engine/flags"
import { fiftyThirtyTwenty } from "../src/engine/plan"
import { detectRecurring } from "../src/engine/recurring"
import { buildSnapshot } from "../src/engine/snapshot"
import { applyMapping, readCsvTable, transactionsToCsv } from "../src/import/csv"
import type { Category, Settings, Transaction } from "../src/types"
import { EMPTY_CONTEXT, EMPTY_SETTINGS } from "../src/types"

let counter = 0

function tx(date: string, rupees: number, category: Category, extra: Partial<Transaction> = {}): Transaction {
  counter += 1
  return {
    id: `t${counter}`,
    date,
    time: "10:00",
    amountPaise: rupees * 100,
    direction: category === "Income" || category === "Refund" ? "credit" : "debit",
    narration: category,
    merchant: category,
    category,
    categorySource: "user",
    confidence: 1,
    fixedOverride: null,
    transfer: false,
    oneOff: false,
    pending: false,
    ...extra,
  }
}

function settings(extra: Partial<Settings> = {}): Settings {
  return { ...EMPTY_SETTINGS, incomePaise: 5_000_000, savingsTargetPaise: 0, bufferPaise: 0, ...extra }
}

const salary = (date: string) => tx(date, 50_000, "Income")

describe("money model", () => {
  it("takes a one-off purchase out of the pool and counts it as spent today", () => {
    const rows = [salary("2026-09-01"), tx("2026-09-10", 30_000, "Shopping", { oneOff: true })]
    const snap = buildSnapshot(rows, settings(), "2026-09-10")
    expect(snap.budget.poolPaise).toBe(5_000_000)
    expect(snap.budget.spentTodayPaise).toBe(3_000_000)
    expect(snap.budget.leftInCyclePaise).toBe(2_000_000)
    expect(snap.comparison.thisPaise).toBe(0)
  })

  it("reserves what a fixed cost actually cost when it runs over", () => {
    const plan = settings({ commitments: [{ id: "b", name: "Electricity", kind: "bills", amountPaise: 100_000 }] })
    const rows = [salary("2026-09-01"), tx("2026-09-05", 9_000, "Bills")]
    const snap = buildSnapshot(rows, plan, "2026-09-06")
    expect(snap.fixedPaise).toBe(900_000)
    expect(snap.budget.leftInCyclePaise).toBe(4_100_000)
  })

  it("runs the budget from payday to payday", () => {
    const rows = [salary("2026-08-25"), salary("2026-09-25")]
    const first = buildSnapshot(rows, settings({ payday: 1 }), "2026-09-26")
    const late = buildSnapshot(rows, settings({ payday: 25 }), "2026-09-26")
    expect(first.cycle.start).toBe("2026-09-01")
    expect(late.cycle.start).toBe("2026-09-25")
    expect(late.cycle.end).toBe("2026-10-24")
    expect(late.budget.daysLeft).toBe(29)
    expect(late.budget.budgetPaise).not.toBe(first.budget.budgetPaise)
    expect(salaryCycle("2026-02-28", 31).nextPayday).toBe("2026-03-31")
    expect(salaryCycle("2026-03-15", 30).start).toBe("2026-02-28")
    expect(previousCycle(salaryCycle("2026-03-31", 31), 31).start).toBe("2026-02-28")
  })

  it("reserves goal money once, even after a contribution", () => {
    const goal = { id: "g", name: "Trip", targetPaise: 5_000_000, savedPaise: 0, monthlyPaise: 1_000_000, deadline: null }
    const half = { ...EMPTY_CONTEXT, allocations: [{ goalId: "g", date: "2026-09-03", amountPaise: 500_000 }] }
    const snap = buildSnapshot([salary("2026-09-01")], settings({ goals: [goal] }), "2026-09-05", half)
    expect(snap.goalsPaise).toBe(1_000_000)
    expect(snap.budget.leftInCyclePaise).toBe(4_000_000)
    const more = { ...EMPTY_CONTEXT, allocations: [{ goalId: "g", date: "2026-09-03", amountPaise: 1_500_000 }] }
    expect(buildSnapshot([salary("2026-09-01")], settings({ goals: [goal] }), "2026-09-05", more).goalsPaise).toBe(1_500_000)
  })

  it("shows zero safe to spend and carries an overspend into the next cycle", () => {
    const rows = [salary("2026-08-01"), tx("2026-08-20", 60_000, "Shopping"), salary("2026-09-01")]
    const august = buildSnapshot(rows, settings(), "2026-08-20")
    expect(august.budget.overByPaise).toBe(1_000_000)
    expect(august.safeToSpendPaise).toBe(0)
    expect(august.budget.budgetPaise).toBe(0)
    const september = buildSnapshot(rows, settings(), "2026-09-02")
    expect(september.carryPaise).toBe(-1_000_000)
    expect(september.budget.poolPaise).toBe(4_000_000)
  })

  it("estimates the days before signup when no statement covers them", () => {
    const plan = settings({ trackingSince: "2026-09-16" })
    const snap = buildSnapshot([tx("2026-09-17", 100, "Coffee")], plan, "2026-09-20")
    expect(snap.salary.status).toBe("expected")
    expect(snap.account.estimate?.days).toBe(15)
    expect(snap.estimatePaise).toBe(2_500_000)
    const imported = buildSnapshot([salary("2026-09-01"), tx("2026-09-17", 100, "Coffee")], plan, "2026-09-20")
    expect(imported.account.estimate).toBeNull()
  })

  it("picks a 50/30/20 savings target with a 10% floor", () => {
    expect(fiftyThirtyTwenty(10_000_000, 4_000_000).savingsPaise).toBe(2_000_000)
    expect(fiftyThirtyTwenty(10_000_000, 6_000_000).savingsPaise).toBe(2_000_000)
    expect(fiftyThirtyTwenty(10_000_000, 8_500_000).savingsPaise).toBe(1_500_000)
    expect(fiftyThirtyTwenty(10_000_000, 9_500_000).savingsPaise).toBe(1_000_000)
  })

  it("does not invent forecast history", () => {
    const rows = [salary("2026-09-01"), tx("2026-09-02", 500, "Coffee")]
    const snap = buildSnapshot(rows, settings(), "2026-09-04")
    expect(snap.forecast).toBeNull()
    expect(snap.forecastNote).toContain("Not enough data")
  })

  it("compares the same number of days of the previous cycle", () => {
    const rows = [
      salary("2026-08-01"),
      tx("2026-08-02", 1_000, "Coffee"),
      tx("2026-08-20", 9_000, "Coffee"),
      salary("2026-09-01"),
      tx("2026-09-03", 2_000, "Coffee"),
    ]
    const snap = buildSnapshot(rows, settings(), "2026-09-05")
    expect(snap.comparison.days).toBe(5)
    expect(snap.comparison.thisPaise).toBe(200_000)
    expect(snap.comparison.previousPaise).toBe(100_000)
  })

  it("flags stale data", () => {
    const snap = buildSnapshot([salary("2026-09-01")], settings(), "2026-09-10")
    expect(snap.freshness.stale).toBe(true)
    expect(snap.freshness.note).toContain("Update needed")
  })
})

describe("recurring and flags", () => {
  it("keeps a payment due today due today", () => {
    const rows = ["2026-07-05", "2026-08-05", "2026-09-05"].map((date) => tx(date, 499, "Subscription", { merchant: "Netflix" }))
    expect(detectRecurring(rows, "2026-10-05")[0].nextDate).toBe("2026-10-05")
  })

  it("does not call rows without a time minutes apart", () => {
    const rows = [tx("2026-09-05", 300, "Coffee", { time: "" }), tx("2026-09-05", 300, "Coffee", { time: "" })]
    expect(detectFlags(rows, [], [])).toHaveLength(0)
  })
})

describe("import", () => {
  it("treats dashes as empty and rejects impossible dates", () => {
    const text = ["Date,Narration,Debit,Credit", "2026-09-01,Coffee,-,250", "2026-09-02,Tea,120,--", "2026-02-30,Bad,10,"].join("\n")
    const table = readCsvTable(text)
    const parsed = applyMapping(table.records, { date: "Date", narration: "Narration", debit: "Debit", credit: "Credit", time: "" })
    expect(parsed.rows.map((row) => [row.date, row.amountPaise, row.direction, row.time])).toEqual([
      ["2026-09-01", 25_000, "credit", ""],
      ["2026-09-02", 12_000, "debit", ""],
    ])
    expect(parsed.rejected).toEqual([{ line: 4, reason: "The date could not be read." }])
  })

  it("uses the merchant alias for apply to similar", () => {
    expect(similarPattern("UPI/DR/884211/THIRD WAVE COFFEE/OKICICI", "Third Wave Coffee")).toBe("third wave")
  })

  it("round-trips the fields you edited through export", () => {
    const original = tx("2026-09-04", 1_234, "Shopping", { merchant: "Croma", oneOff: true, fixedOverride: false, narration: "UPI/DR/CROMA, STORE" })
    const table = readCsvTable(transactionsToCsv([original]))
    const parsed = applyMapping(table.records, { date: "Date", narration: "Narration", debit: "Debit", credit: "Credit", time: "Time" })
    expect(parsed.rows[0]).toMatchObject({
      date: "2026-09-04",
      time: "10:00",
      narration: "UPI/DR/CROMA, STORE",
      amountPaise: 123_400,
      merchant: "Croma",
      category: "Shopping",
      oneOff: true,
      fixedOverride: false,
      transfer: false,
    })
  })
})
