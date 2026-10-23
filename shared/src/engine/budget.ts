import { addDays, monthEnd, weekday } from "./dates"

export interface BudgetInput {
  asOf: string
  cycleEnd?: string
  incomePaise: number
  fixedPaise: number
  savingsPaise: number
  otherReservedPaise?: number
  poolPaise?: number
  spentBeforeTodayPaise: number
  spentTodayPaise: number
  weekendWeighted: boolean
  weekendWeight: number
}

export interface BudgetResult {
  cycleEnd: string
  daysLeft: number
  poolPaise: number
  poolLeftAtStartPaise: number
  budgetPaise: number
  displayRupees: number
  spentTodayPaise: number
  spentDisplayRupees: number
  remainingPaise: number
  leftInCyclePaise: number
  overByPaise: number
  gapDisplayRupees: number
  over: boolean
  usedUp: boolean
  tomorrow: {
    daysLeft: number
    budgetPaise: number
    displayRupees: number
    cycleEnded: boolean
  }
}

export function weightOf(iso: string, weekendWeighted: boolean, weekendWeight: number): number {
  if (!weekendWeighted) return 1
  const day = weekday(iso)
  return day === 0 || day === 6 ? weekendWeight : 1
}

export function remainingWeights(
  asOf: string,
  cycleEnd: string,
  weekendWeighted: boolean,
  weekendWeight: number,
): { today: number; total: number; daysLeft: number } {
  let total = 0
  let daysLeft = 0
  for (let day = asOf; day <= cycleEnd; day = addDays(day, 1)) {
    total += weightOf(day, weekendWeighted, weekendWeight)
    daysLeft += 1
  }
  return { today: weightOf(asOf, weekendWeighted, weekendWeight), total, daysLeft }
}

function sharePaise(poolLeft: number, weightToday: number, weightTotal: number, daysLeft: number, weighted: boolean): number {
  if (poolLeft <= 0 || weightTotal <= 0 || daysLeft <= 0) return 0
  const raw = weighted ? (poolLeft * weightToday) / weightTotal : poolLeft / daysLeft
  return Math.round(raw)
}

export function computeBudget(input: BudgetInput): BudgetResult {
  const cycleEnd = input.cycleEnd ?? monthEnd(input.asOf)
  const weights = remainingWeights(input.asOf, cycleEnd, input.weekendWeighted, input.weekendWeight)
  const poolPaise = input.poolPaise ?? input.incomePaise - input.fixedPaise - input.savingsPaise - (input.otherReservedPaise ?? 0)
  const poolLeftAtStartPaise = poolPaise - input.spentBeforeTodayPaise
  const leftInCyclePaise = poolLeftAtStartPaise - input.spentTodayPaise
  const budgetPaise = leftInCyclePaise <= 0 ? 0 : sharePaise(poolLeftAtStartPaise, weights.today, weights.total, weights.daysLeft, input.weekendWeighted)
  const displayRupees = Math.round(budgetPaise / 100)
  const spentDisplayRupees = Math.round(input.spentTodayPaise / 100)
  const gapDisplayRupees = spentDisplayRupees - displayRupees
  const tomorrowIso = addDays(input.asOf, 1)
  const cycleEnded = tomorrowIso > cycleEnd
  let tomorrowBudget = 0
  let tomorrowDays = 0
  if (!cycleEnded) {
    const next = remainingWeights(tomorrowIso, cycleEnd, input.weekendWeighted, input.weekendWeight)
    tomorrowDays = next.daysLeft
    tomorrowBudget = sharePaise(leftInCyclePaise, next.today, next.total, next.daysLeft, input.weekendWeighted)
  }
  return {
    cycleEnd,
    daysLeft: weights.daysLeft,
    poolPaise,
    poolLeftAtStartPaise,
    budgetPaise,
    displayRupees,
    spentTodayPaise: input.spentTodayPaise,
    spentDisplayRupees,
    remainingPaise: budgetPaise - input.spentTodayPaise,
    leftInCyclePaise,
    overByPaise: Math.max(-leftInCyclePaise, 0),
    gapDisplayRupees,
    over: gapDisplayRupees > 0,
    usedUp: leftInCyclePaise <= 0,
    tomorrow: {
      daysLeft: tomorrowDays,
      budgetPaise: tomorrowBudget,
      displayRupees: Math.round(tomorrowBudget / 100),
      cycleEnded,
    },
  }
}

export function naiveDailyDisplayRupees(incomePaise: number, days = 30): number {
  return Math.round(Math.round(incomePaise / Math.max(days, 1)) / 100)
}
