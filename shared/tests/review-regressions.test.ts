import { describe, expect, it } from "vitest"
import { buildSnapshot, EMPTY_CONTEXT, EMPTY_SETTINGS, type MoneyContext, type Transaction } from "../src"

const plan = { ...EMPTY_SETTINGS, incomePaise: 5_000_000, savingsTargetPaise: 0, bufferPaise: 0 }
const bank = { id: "main", name: "Bank", kind: "bank" as const, spending: true, primary: true }
const card = { id: "card", name: "Card", kind: "card" as const, spending: true, primary: false }
const context = (extra: Partial<MoneyContext> = {}): MoneyContext => ({ ...EMPTY_CONTEXT, accounts: [bank, card],
  confirmations: [{ accountId: "main", date: "2026-10-23", balancePaise: 1_000_000 }, { accountId: "card", date: "2026-10-23", balancePaise: 500_000 }], ...extra })
function tx(extra: Partial<Transaction>): Transaction {
  return { id: "t", date: "2026-10-24", time: "12:00", amountPaise: 200_000, direction: "debit", narration: "Purchase", merchant: "Shop",
    category: "Shopping", categorySource: "user", confidence: 1, fixedOverride: null, transfer: false, oneOff: false, pending: false, ...extra }
}

describe("review accounting regressions", () => {
  it("reduces cash available for a card purchase and counts repayment only once", () => {
    const purchase = tx({ accountId: "card" })
    expect(buildSnapshot([], plan, "2026-10-24", context()).headline.availablePaise).toBe(500_000)
    expect(buildSnapshot([purchase], plan, "2026-10-24", context()).headline.availablePaise).toBe(300_000)
    const payment = tx({ id: "repay", amountPaise: 700_000, category: "Card payment", counterAccountId: "card" })
    const result = buildSnapshot([purchase, payment], plan, "2026-10-24", context())
    expect(result.headline.availablePaise).toBe(300_000)
    expect(result.confirmed?.cardOwedPaise).toBe(0)
  })

  it("does not call a credit balance on a card spendable bank cash", () => {
    const ctx = context({ confirmations: [{ accountId: "main", date: "2026-10-23", balancePaise: 1_000_000 }, { accountId: "card", date: "2026-10-23", balancePaise: -100_000 }] })
    expect(buildSnapshot([], plan, "2026-10-24", ctx).headline.availablePaise).toBe(1_000_000)
    expect(buildSnapshot([tx({ accountId: "card", amountPaise: 50_000 })], plan, "2026-10-24", ctx).confirmed?.cardOwedPaise).toBe(0)
  })

  it("protects unpaid rent after an instalment in both estimate and confirmed modes", () => {
    const settings = { ...plan, commitments: [{ id: "r", name: "Rent", kind: "rent" as const, dueDay: 25, amountPaise: 1_000_000 }] }
    const rent = tx({ category: "Rent", commitmentId: "r", amountPaise: 100_000 })
    const estimated = buildSnapshot([rent], settings, "2026-10-24")
    expect(estimated.bills[0].paid).toBe(false)
    expect(estimated.headline.availablePaise).toBe(4_000_000)
    const ctx = context({ accounts: [bank], confirmations: [{ accountId: "main", date: "2026-10-23", balancePaise: 2_000_000 }] })
    expect(buildSnapshot([rent], settings, "2026-10-24", ctx).headline.availablePaise).toBe(1_000_000)
  })

  it("uses the last correction and applies subsequent days without duplicating closing-day transactions", () => {
    const ctx = context({ accounts: [bank], confirmations: [
      { accountId: "main", date: "2026-10-23", balancePaise: 1_000_000 },
      { accountId: "main", date: "2026-10-23", balancePaise: 800_000 },
    ] })
    const rows = [tx({ date: "2026-10-23", category: "Transfer", transfer: true }), tx({ id: "new", category: "Transfer", transfer: true })]
    expect(buildSnapshot(rows, plan, "2026-10-24", ctx).headline.availablePaise).toBe(600_000)
  })

  it("stops a completed goal and caps a nearly completed goal", () => {
    const goal = { id: "g", name: "Trip", targetPaise: 100_000, savedPaise: 100_000, monthlyPaise: 50_000, deadline: null }
    expect(buildSnapshot([], { ...plan, goals: [goal] }, "2026-10-24").goalsPaise).toBe(0)
    expect(buildSnapshot([], { ...plan, goals: [{ ...goal, savedPaise: 90_000 }] }, "2026-10-24").goalsPaise).toBe(10_000)
  })

  it("keeps this cycle's completed contribution reserved", () => {
    const goal = { id: "g", name: "Trip", targetPaise: 100_000, savedPaise: 100_000, monthlyPaise: 50_000, deadline: null }
    const result = buildSnapshot([], { ...plan, goals: [goal] }, "2026-10-24", context({ accounts: [bank], allocations: [{ goalId: "g", date: "2026-10-24", amountPaise: 50_000 }] }))
    expect(result.goalsPaise).toBe(50_000)
  })

  it("protects the full unpaid yearly bill in its due month", () => {
    const settings = { ...plan, commitments: [{ id: "annual", name: "Insurance", kind: "bills" as const, dueDay: 25, dueMonth: 10, frequency: "yearly" as const, amountPaise: 1_200_000 }] }
    const payment = tx({ category: "Bills", commitmentId: "annual", amountPaise: 100_000 })
    const result = buildSnapshot([payment], settings, "2026-10-24")
    expect(result.bills[0].paid).toBe(false)
    expect(result.headline.availablePaise).toBe(3_800_000)
  })
})
