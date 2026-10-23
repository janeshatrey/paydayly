import { formatIndianDate, parseIndianDate } from "../src/format"
import { describe, expect, it } from "vitest"
import { checkAffordability } from "../src/engine/afford"
import { buildSnapshot } from "../src/engine/snapshot"
import type { Commitment, Settings, Transaction } from "../src/types"
import { dueInMonth, EMPTY_SETTINGS, monthlyPaise } from "../src/types"

const income: Transaction = {
  id: "s1", date: "2026-09-01", time: "09:00", amountPaise: 5_000_000, direction: "credit", narration: "Salary", merchant: "Salary",
  category: "Income", categorySource: "user", confidence: 1, fixedOverride: null, transfer: false, oneOff: false, pending: false,
}
const insurance: Commitment = { id: "ins", name: "Insurance", kind: "bills", amountPaise: 1_200_000, dueDay: 10, frequency: "yearly", dueMonth: 3 }
const sip: Commitment = { id: "sip", name: "Index SIP", kind: "sip", amountPaise: 500_000, dueDay: 5 }
const rent: Commitment = { id: "rent", name: "Rent", kind: "rent", amountPaise: 1_500_000, dueDay: 5 }

const settings = (extra: Partial<Settings> = {}): Settings => ({ ...EMPTY_SETTINGS, incomePaise: 5_000_000, savingsTargetPaise: 0, bufferPaise: 0, ...extra })

describe("quarterly and yearly commitments", () => {
  it("count a monthly share everywhere: ₹12,000 a year is ₹1,000 a month", () => {
    expect(monthlyPaise(insurance)).toBe(100_000)
    expect(monthlyPaise({ amountPaise: 300_000, frequency: "quarterly" })).toBe(100_000)
    expect(monthlyPaise(rent)).toBe(1_500_000)
  })

  it("only fall due in their due month", () => {
    expect(dueInMonth(insurance, 3)).toBe(true)
    expect(dueInMonth(insurance, 9)).toBe(false)
    const quarterly = { frequency: "quarterly" as const, dueMonth: 2 }
    expect([1, 2, 5, 8, 11, 12].map((m) => dueInMonth(quarterly, m))).toEqual([false, true, true, true, true, false])
  })

  it("sets a share aside but shows no due date outside the due month", () => {
    const snap = buildSnapshot([income], settings({ commitments: [insurance] }), "2026-09-02")
    const line = snap.bills.find((bill) => bill.id === "ins")!
    expect(line.reservedPaise).toBe(100_000)
    expect(line.dueDate).toBeNull()
    expect(line.status).toBe("upcoming")
  })

  it("shows the due date in the due month", () => {
    const march: Transaction = { ...income, date: "2026-03-01" }
    const snap = buildSnapshot([march], settings({ commitments: [insurance] }), "2026-03-02")
    expect(snap.bills.find((bill) => bill.id === "ins")!.dueDate).toBe("2026-03-10")
  })
})

describe("next-cycle affordability", () => {
  it("does not subtract SIPs twice", () => {
    const plan = settings({ commitments: [rent, sip] })
    const snap = buildSnapshot([income], plan, "2026-09-02")
    const result = checkAffordability(snap, plan, { amountPaise: 100_000, date: "2026-10-03", goalId: null, paydayLateDays: 0 })
    expect(result.nextCycle).toBe(true)
    // 50,000 salary − 15,000 rent − 5,000 SIP (once) = 30,000
    expect(result.availableBeforePaise).toBe(3_000_000)
  })

  it("never ties a purchase to a goal the user did not pick", () => {
    const plan = settings({ goals: [{ id: "goa", name: "Goa trip", targetPaise: 3_000_000, savedPaise: 0, deadline: "2027-03-01", monthlyPaise: 500_000 }] })
    const snap = buildSnapshot([income], plan, "2026-09-02")
    const result = checkAffordability(snap, plan, { amountPaise: 6_000_000, date: "2026-09-05", goalId: null, paydayLateDays: 0 })
    expect(result.goal).toBeNull()
  })
})

describe("Indian dates", () => {
  it("reads day-first dates", () => {
    expect(parseIndianDate("22/10/2026", "2026-10-23")).toBe("2026-10-22")
    expect(parseIndianDate("05-03-26", "2026-10-23")).toBe("2026-03-05")
    expect(parseIndianDate("22 Oct", "2026-10-23")).toBe("2026-10-22")
    expect(parseIndianDate("3rd March 2025", "2026-10-23")).toBe("2025-03-03")
    expect(parseIndianDate("Oct 22", "2026-10-23")).toBe("2026-10-22")
  })
  it("never reads a yearless date into the future", () => {
    expect(parseIndianDate("25/12", "2026-10-23")).toBe("2025-12-25")
  })
  it("rejects impossible dates", () => {
    expect(parseIndianDate("31/02/2026", "2026-10-23")).toBeNull()
    expect(parseIndianDate("hello", "2026-10-23")).toBeNull()
  })
  it("formats as DD/MM/YYYY", () => {
    expect(formatIndianDate("2026-10-05")).toBe("05/10/2026")
  })
})
