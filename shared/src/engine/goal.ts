import { addMonths } from "./dates"

export function projectGoal(
  remainingPaise: number,
  monthlyPaise: number,
  from: string,
): { months: number | null; date: string | null } {
  if (remainingPaise <= 0) return { months: 0, date: from }
  if (monthlyPaise <= 0) return { months: null, date: null }
  const months = Math.ceil(remainingPaise / monthlyPaise)
  return { months, date: addMonths(from, months) }
}
