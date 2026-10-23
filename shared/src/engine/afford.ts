import { formatINR } from "../format"
import type { Settings } from "../types"
import { dueInMonth, isSavingsKind, monthlyPaise } from "../types"
import { addDays, dateInCycle, daysBetween, formatDate, salaryCycle } from "./dates"
import type { Snapshot } from "./snapshot"

export interface AffordInput {
  amountPaise: number
  date: string
  goalId: string | null
  paydayLateDays: number
}

export interface Shortfall {
  name: string
  duePaise: number
  shortPaise: number
  dueDate: string | null
}

export interface AffordResult {
  verdict: "yes" | "tight" | "no"
  headline: string
  availableBeforePaise: number
  availableAfterPaise: number
  dailyBeforePaise: number
  dailyAfterPaise: number
  daysLeft: number
  extraBillsPaise: number
  underfunded: Shortfall[]
  goal: { name: string; reducedByPaise: number; monthsLater: number } | null
  nextCycle: boolean
  assumptions: string[]
}

export function checkAffordability(snapshot: Snapshot, settings: Settings, input: AffordInput): AffordResult {
  const { cycle } = snapshot
  const late = Math.max(0, Math.min(input.paydayLateDays, 15))
  const nextCycle = input.date > cycle.end
  const assumptions: string[] = []
  let available = snapshot.budget.leftInCyclePaise
  let daysLeft = Math.max(daysBetween(snapshot.asOf, cycle.nextPayday), 1)

  if (nextCycle) {
    const next = salaryCycle(input.date, settings.payday)
    // Savings commitments are already inside snapshot.savingsPaise, so only bills count here.
    const planned = settings.commitments.filter((item) => !isSavingsKind(item.kind)).reduce((sum, item) => sum + monthlyPaise(item), 0)
    const carry = Math.min(available, 0)
    available = (settings.incomePaise ?? 0) + carry - planned - snapshot.savingsPaise - snapshot.goalsPaise - snapshot.bufferPaise
    daysLeft = Math.max(daysBetween(input.date, next.nextPayday), 1)
    assumptions.push(`${formatDate(input.date)} falls in the next cycle, so this uses next month's planned salary and costs.`)
  }

  let extraBills = 0
  const lateBills: Shortfall[] = []
  if (late > 0) {
    const following = salaryCycle(cycle.nextPayday, settings.payday)
    const lateUntil = addDays(cycle.nextPayday, late)
    for (const item of settings.commitments) {
      if (!item.dueDay) continue
      const due = dateInCycle(following, item.dueDay)
      if (!dueInMonth(item, Number(due.slice(5, 7)))) continue
      if (due < lateUntil) {
        // A periodic bill already has this cycle's share kept aside; the rest has to come from what is left.
        const extra = item.amountPaise - (item.frequency && item.frequency !== "monthly" ? monthlyPaise(item) : 0)
        extraBills += extra
        lateBills.push({ name: item.name, duePaise: extra, shortPaise: 0, dueDate: due })
      }
    }
    daysLeft += late
    assumptions.push(`Salary arrives ${late} days after ${formatDate(cycle.nextPayday)}, so this cycle stretches to ${daysLeft} days.`)
    if (extraBills) assumptions.push(`${lateBills.map((bill) => bill.name).join(", ")} ${lateBills.length === 1 ? "falls due before the late salary and is" : "fall due before the late salary and are"} paid from what is left.`)
  }

  const dailyBefore = Math.max(Math.round(available / daysLeft), 0)
  const after = available - input.amountPaise - extraBills
  const dailyAfter = Math.max(Math.round(after / daysLeft), 0)

  let gap = Math.max(-after, 0)
  const take = (amount: number) => {
    const used = Math.min(gap, amount)
    gap -= used
    return used
  }
  take(snapshot.bufferPaise)
  let goal: AffordResult["goal"] = null
  // Only talk about a goal the user picked; never tie a purchase to one they did not choose.
  const target = input.goalId ? settings.goals.find((item) => item.id === input.goalId) : undefined
  const goalLine = target ? snapshot.account.goals.find((line) => line.id === target.id) : undefined
  if (target && goalLine) {
    const used = take(goalLine.reservedPaise)
    goal = { name: target.name, reducedByPaise: used, monthsLater: target.monthlyPaise > 0 ? Math.ceil(used / target.monthlyPaise) : 0 }
  }
  take(snapshot.savingsPaise)
  const underfunded: Shortfall[] = []
  const unpaid = snapshot.bills
    .filter((line) => line.status !== "paid" && line.status !== "skipped")
    .map((line) => ({ name: line.name, duePaise: line.reservedPaise, shortPaise: 0, dueDate: line.dueDate }))
  for (const bill of [...unpaid, ...lateBills].sort((a, b) => (b.dueDate ?? "9999").localeCompare(a.dueDate ?? "9999"))) {
    const short = take(bill.duePaise)
    if (short > 0) underfunded.push({ ...bill, shortPaise: short })
  }

  if (snapshot.headline.basis === "estimate") assumptions.push("Your balance is not confirmed, so this is an estimate.")
  if (snapshot.salary.status === "late") assumptions.push("This cycle's salary has not arrived and is not counted.")
  if (snapshot.freshness.stale) assumptions.push(snapshot.freshness.note)
  assumptions.push("Bills, savings and goal money are kept aside before anything is called available.")

  let verdict: AffordResult["verdict"] = "yes"
  if (after < 0) verdict = "no"
  else if (dailyAfter < dailyBefore * 0.5 || dailyAfter < 20_000) verdict = "tight"

  const amount = formatINR(input.amountPaise)
  const headline = verdict === "yes"
    ? `Yes. After ${amount} you still have ${formatINR(after)}, about ${formatINR(dailyAfter)} a day.`
    : verdict === "tight"
      ? `You can, but it is tight. ${formatINR(dailyAfter)} a day until payday instead of ${formatINR(dailyBefore)}.`
      : `Not without dipping into money already promised. You would be ${formatINR(-after)} short.`

  return {
    verdict,
    headline,
    availableBeforePaise: available,
    availableAfterPaise: after,
    dailyBeforePaise: dailyBefore,
    dailyAfterPaise: dailyAfter,
    daysLeft,
    extraBillsPaise: extraBills,
    underfunded,
    goal,
    nextCycle,
    assumptions,
  }
}
