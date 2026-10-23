import { describe, expect, it } from "vitest"
import { checkAffordability } from "../src/engine/afford"
import { suggestSettlements } from "../src/engine/balance"
import { buildSnapshot } from "../src/engine/snapshot"
import type { Account, Category, MoneyContext, Settings, Transaction } from "../src/types"
import { EMPTY_CONTEXT, EMPTY_SETTINGS } from "../src/types"

let counter = 0

function tx(date: string, rupees: number, category: Category, extra: Partial<Transaction> = {}): Transaction {
  counter += 1
  return {
    id: `a${counter}`,
    date,
    time: "10:00",
    amountPaise: rupees * 100,
    direction: ["Income", "Refund", "Settlement"].includes(category) ? "credit" : "debit",
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

const settings = (extra: Partial<Settings> = {}): Settings => ({
  ...EMPTY_SETTINGS,
  incomePaise: 5_000_000,
  savingsTargetPaise: 0,
  bufferPaise: 0,
  ...extra,
})

const bank: Account = { id: "main", name: "Main account", kind: "bank", spending: true, primary: true }
const savingsAccount: Account = { id: "sav", name: "Savings", kind: "bank", spending: false, primary: false }
const card: Account = { id: "card", name: "Credit card", kind: "card", spending: false, primary: false }
const loan: Account = { id: "loan", name: "Personal loan", kind: "loan", spending: false, primary: false }

function context(extra: Partial<MoneyContext> = {}): MoneyContext {
  return { ...EMPTY_CONTEXT, accounts: [bank, savingsAccount, card, loan], ...extra }
}

const confirmedAt = (date: string, rupees: number) => [{ accountId: "main", date, balancePaise: rupees * 100 }]

describe("confirmed balance", () => {
  it("takes a one-off purchase out of a confirmed balance", () => {
    const ctx = context({ confirmations: confirmedAt("2026-09-05", 50_000) })
    const rows = [tx("2026-09-01", 50_000, "Income"), tx("2026-09-08", 30_000, "Shopping", { oneOff: true })]
    const snap = buildSnapshot(rows, settings(), "2026-09-08", ctx)
    expect(snap.headline.availablePaise).toBe(2_000_000)
    expect(snap.headline.basis).toBe("confirmed")
  })

  it("subtracts the bill as actually paid and releases the reservation", () => {
    const plan = settings({ commitments: [{ id: "e", name: "Electricity", kind: "bills", amountPaise: 100_000, dueDay: 10 }] })
    const ctx = context({ confirmations: confirmedAt("2026-09-02", 50_000) })
    const before = buildSnapshot([tx("2026-09-01", 50_000, "Income")], plan, "2026-09-04", ctx)
    expect(before.headline.availablePaise).toBe(4_900_000)
    const paid = buildSnapshot([tx("2026-09-01", 50_000, "Income"), tx("2026-09-05", 9_000, "Bills", { commitmentId: "e" })], plan, "2026-09-06", ctx)
    expect(paid.headline.availablePaise).toBe(4_100_000)
    expect(paid.bills[0].status).toBe("paid")
  })

  it("moves money between own accounts without changing what you have overall", () => {
    const ctx = context({ confirmations: confirmedAt("2026-09-02", 50_000) })
    const rows = [tx("2026-09-04", 10_000, "Transfer", { transfer: true, counterAccountId: "sav" })]
    const snap = buildSnapshot(rows, settings(), "2026-09-05", ctx)
    expect(snap.headline.availablePaise).toBe(4_000_000)
    expect(snap.balances.find((entry) => entry.account.id === "sav")?.balancePaise).toBeNull()
    expect(snap.budget.spentTodayPaise + snap.account.spentBeforeTodayPaise).toBe(0)
  })

  it("counts a card purchase once and the repayment only settles the card", () => {
    const ctx = context({ confirmations: confirmedAt("2026-09-02", 50_000) })
    const purchase = tx("2026-09-04", 5_000, "Shopping", { accountId: "card" })
    const afterPurchase = buildSnapshot([purchase], settings(), "2026-09-05", ctx)
    expect(afterPurchase.confirmed?.cardOwedPaise).toBe(500_000)
    expect(afterPurchase.headline.availablePaise).toBe(4_500_000)
    const repay = tx("2026-09-06", 5_000, "Card payment", { counterAccountId: "card" })
    const afterRepay = buildSnapshot([purchase, repay], settings(), "2026-09-07", ctx)
    expect(afterRepay.confirmed?.cardOwedPaise).toBe(0)
    expect(afterRepay.headline.availablePaise).toBe(4_500_000)
  })

  it("treats a loan as cash plus a debt, not income", () => {
    const ctx = context({ confirmations: confirmedAt("2026-09-02", 50_000) })
    const rows = [tx("2026-09-04", 20_000, "Loan", { direction: "credit", counterAccountId: "loan" })]
    const snap = buildSnapshot(rows, settings(), "2026-09-05", ctx)
    expect(snap.headline.availablePaise).toBe(7_000_000)
    expect(snap.confirmed?.loanOwedPaise).toBe(2_000_000)
    expect(snap.salary.status).toBe("expected")
    const estimate = buildSnapshot([tx("2026-09-01", 50_000, "Income"), ...rows], settings(), "2026-09-05")
    expect(estimate.account.borrowedPaise).toBe(2_000_000)
    expect(estimate.incomePaise).toBe(5_000_000)
  })

  it("keeps money left from earlier cycles as a cushion, not spending money", () => {
    const plan = settings({ commitments: [{ id: "r", name: "Rent", kind: "rent", amountPaise: 2_000_000, dueDay: 5 }] })
    const ctx = context({ confirmations: confirmedAt("2026-08-20", 10_000) })
    const snap = buildSnapshot([tx("2026-09-01", 50_000, "Income")], plan, "2026-09-02", ctx)
    expect(snap.headline.availablePaise).toBe(5_000_000 - 2_000_000)
    expect(snap.headline.lines.find((line) => line.label.startsWith("Cushion"))?.paise).toBe(-1_000_000)
  })

  it("does not jump when a large balance is confirmed (demo regression: ₹10,915 → ₹61,707)", () => {
    const plan = settings({ commitments: [{ id: "r", name: "Rent", kind: "rent", amountPaise: 2_000_000, dueDay: 5 }] })
    const rows = [tx("2026-09-01", 50_000, "Income"), tx("2026-09-03", 2_000, "Shopping")]
    const before = buildSnapshot(rows, plan, "2026-09-04", context())
    const after = buildSnapshot(rows, plan, "2026-09-04", context({ confirmations: confirmedAt("2026-09-04", 260_000) }))
    expect(after.headline.availablePaise).toBe(before.headline.availablePaise)
    expect(after.headline.basis).toBe("confirmed")
  })

  it("still lowers the figure when the confirmed balance is below the plan", () => {
    const rows = [tx("2026-09-01", 50_000, "Income")]
    const snap = buildSnapshot(rows, settings(), "2026-09-04", context({ confirmations: confirmedAt("2026-09-04", 12_000) }))
    expect(snap.headline.availablePaise).toBe(1_200_000)
  })
})

describe("salary", () => {
  it("keeps a delayed salary expected, not available", () => {
    const late = buildSnapshot([tx("2026-08-30", 200, "Coffee"), tx("2026-09-05", 100, "Coffee")], settings(), "2026-09-05")
    expect(late.salary.status).toBe("late")
    expect(late.incomePaise).toBe(0)
    expect(late.salary.expectedPaise).toBe(5_000_000)
    const flagged = buildSnapshot([], settings({ salaryDelayedFor: "2026-09-01" }), "2026-09-02")
    expect(flagged.salary.status).toBe("late")
    expect(flagged.headline.availablePaise).toBeLessThanOrEqual(0)
  })

  it("gives different cycles for payday on the 1st and the 28th", () => {
    const rows = [tx("2026-08-28", 50_000, "Income"), tx("2026-09-01", 50_000, "Income"), tx("2026-09-10", 1_000, "Shopping")]
    const first = buildSnapshot(rows, settings({ payday: 1 }), "2026-09-10")
    const late = buildSnapshot(rows, settings({ payday: 28 }), "2026-09-10")
    expect(first.cycle.nextPayday).toBe("2026-10-01")
    expect(late.cycle.nextPayday).toBe("2026-09-28")
    expect(first.budget.daysLeft).not.toBe(late.budget.daysLeft)
    expect(first.budget.budgetPaise).not.toBe(late.budget.budgetPaise)
  })
})

describe("bills", () => {
  const plan = settings({ commitments: [{ id: "n", name: "Netflix", kind: "bills", amountPaise: 64_900, dueDay: 10 }] })

  it("keeps a bill due today due, and paid once it is paid", () => {
    expect(buildSnapshot([], plan, "2026-09-10").bills[0].status).toBe("due-today")
    expect(buildSnapshot([], plan, "2026-09-11").bills[0].status).toBe("overdue")
    const paid = buildSnapshot([tx("2026-09-10", 649, "Subscription", { merchant: "Netflix" })], plan, "2026-09-10")
    expect(paid.bills[0].status).toBe("paid")
  })

  it("honours a skipped mark", () => {
    const ctx = { ...EMPTY_CONTEXT, billMarks: [{ commitmentId: "n", cycleStart: "2026-09-01", status: "skipped" as const }] }
    const snap = buildSnapshot([], plan, "2026-09-12", ctx)
    expect(snap.bills[0].status).toBe("skipped")
    expect(snap.bills[0].reservedPaise).toBe(0)
  })

  it("sets aside a share of a yearly expense each cycle", () => {
    const yearly = settings({ commitments: [{ id: "i", name: "Car insurance", kind: "irregular", amountPaise: 1_200_000, frequency: "yearly", dueMonth: 3 }] })
    const snap = buildSnapshot([tx("2026-09-01", 50_000, "Income")], yearly, "2026-09-02")
    expect(snap.bills[0].reservedPaise).toBe(100_000)
    expect(snap.bills[0].periodic).toBe(true)
  })
})

describe("money owed back", () => {
  const dinner = tx("2026-09-04", 2_400, "Eating out", { ownSharePaise: 60_000, receivableId: null })
  const receivable = {
    id: "rv",
    txId: dinner.id,
    kind: "friends" as const,
    counterparty: "Rohan",
    amountPaise: 180_000,
    settledPaise: 0,
    status: "open" as const,
    date: "2026-09-04",
    note: "",
  }

  it("counts the full outflow and keeps the receivable out of available", () => {
    const rows = [tx("2026-09-01", 50_000, "Income"), dinner]
    const snap = buildSnapshot(rows, settings(), "2026-09-05", { ...EMPTY_CONTEXT, receivables: [receivable] })
    expect(snap.headline.availablePaise).toBe(5_000_000 - 240_000)
    expect(snap.receivables.openPaise).toBe(180_000)
  })

  it("suggests an incoming payment as a settlement", () => {
    const credit = tx("2026-09-07", 1_800, "Uncategorised", { direction: "credit", narration: "UPI/CR/ROHAN SHARMA" })
    const suggestions = suggestSettlements([dinner, credit], [receivable])
    expect(suggestions).toEqual([expect.objectContaining({ txId: credit.id, receivableId: "rv", amountPaise: 180_000 })])
  })
})

describe("can I afford this", () => {
  const plan = settings({
    commitments: [{ id: "r", name: "Rent", kind: "rent", amountPaise: 2_000_000, dueDay: 3 }],
    goals: [{ id: "g", name: "Goa trip", targetPaise: 3_000_000, savedPaise: 0, monthlyPaise: 500_000, deadline: null }],
  })
  const rows = [tx("2026-09-01", 50_000, "Income")]

  it("shows what is left and the daily allowance after the purchase", () => {
    const snap = buildSnapshot(rows, plan, "2026-09-02")
    const result = checkAffordability(snap, plan, { amountPaise: 1_200_000, date: "2026-09-02", goalId: "g", paydayLateDays: 0 })
    expect(result.availableBeforePaise).toBe(2_500_000)
    expect(result.availableAfterPaise).toBe(1_300_000)
    expect(result.dailyAfterPaise).toBe(Math.round(1_300_000 / 29))
    expect(result.underfunded).toHaveLength(0)
    expect(result.goal?.reducedByPaise).toBe(0)
  })

  it("names the goal and bill that a too-big purchase would eat into", () => {
    const snap = buildSnapshot(rows, plan, "2026-09-02")
    const result = checkAffordability(snap, plan, { amountPaise: 4_000_000, date: "2026-09-02", goalId: "g", paydayLateDays: 0 })
    expect(result.verdict).toBe("no")
    expect(result.goal?.reducedByPaise).toBe(500_000)
    expect(result.underfunded[0]).toMatchObject({ name: "Rent", shortPaise: 1_000_000 })
  })

  it("stretches the cycle and adds early bills when payday is late", () => {
    const snap = buildSnapshot(rows, plan, "2026-09-02")
    const result = checkAffordability(snap, plan, { amountPaise: 0, date: "2026-09-02", goalId: null, paydayLateDays: 5 })
    expect(result.daysLeft).toBe(34)
    expect(result.extraBillsPaise).toBe(2_000_000)
    expect(result.availableAfterPaise).toBe(500_000)
  })
})
