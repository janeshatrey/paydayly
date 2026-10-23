export function parseISODate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number)
  return { y, m, d }
}

export function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function addDays(iso: string, n: number): string {
  const { y, m, d } = parseISODate(iso)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

export function addMonths(iso: string, n: number): string {
  const { y, m, d } = parseISODate(iso)
  const anchor = new Date(Date.UTC(y, m - 1 + n, 1))
  const year = anchor.getUTCFullYear()
  const month = anchor.getUTCMonth() + 1
  const day = Math.min(d, daysInMonth(year, month))
  return isoDate(year, month, day)
}

export function weekday(iso: string): number {
  const { y, m, d } = parseISODate(iso)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function monthStart(iso: string): string {
  const { y, m } = parseISODate(iso)
  return isoDate(y, m, 1)
}

export function monthEnd(iso: string): string {
  const { y, m } = parseISODate(iso)
  return isoDate(y, m, daysInMonth(y, m))
}

export function previousMonth(iso: string): string {
  return addDays(monthStart(iso), -1)
}

export function indiaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? ""
  return `${pick("year")}-${pick("month")}-${pick("day")}`
}

export function formatDate(iso: string): string {
  const { y, m, d } = parseISODate(iso)
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

export function formatDateLong(iso: string): string {
  const { y, m, d } = parseISODate(iso)
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

export function daysBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

export function eachDate(start: string, end: string): string[] {
  const dates: string[] = []
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) dates.push(cursor)
  return dates
}

export function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const { y, m, d } = parseISODate(iso)
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
}

export interface SalaryCycle {
  start: string
  end: string
  nextPayday: string
  days: number
  daysElapsed: number
  daysLeft: number
}

function paydayIn(year: number, month: number, payday: number): string {
  return isoDate(year, month, Math.min(Math.max(payday, 1), daysInMonth(year, month)))
}

export function salaryCycle(asOf: string, payday: number): SalaryCycle {
  const { y, m } = parseISODate(asOf)
  let start = paydayIn(y, m, payday)
  if (start > asOf) {
    const prev = parseISODate(addMonths(isoDate(y, m, 1), -1))
    start = paydayIn(prev.y, prev.m, payday)
  }
  const after = parseISODate(addMonths(isoDate(parseISODate(start).y, parseISODate(start).m, 1), 1))
  const nextPayday = paydayIn(after.y, after.m, payday)
  const end = addDays(nextPayday, -1)
  return {
    start,
    end,
    nextPayday,
    days: daysBetween(start, nextPayday),
    daysElapsed: daysBetween(start, asOf) + 1,
    daysLeft: daysBetween(asOf, nextPayday),
  }
}

export function previousCycle(cycle: SalaryCycle, payday: number): SalaryCycle {
  const prev = salaryCycle(addDays(cycle.start, -1), payday)
  return { ...prev, daysElapsed: prev.days, daysLeft: 0 }
}

export function dateInCycle(cycle: SalaryCycle, dayOfMonth: number): string {
  const { y, m } = parseISODate(cycle.start)
  let candidate = isoDate(y, m, Math.min(dayOfMonth, daysInMonth(y, m)))
  if (candidate < cycle.start) {
    const next = parseISODate(addDays(monthEnd(cycle.start), 1))
    candidate = isoDate(next.y, next.m, Math.min(dayOfMonth, daysInMonth(next.y, next.m)))
  }
  return candidate
}
