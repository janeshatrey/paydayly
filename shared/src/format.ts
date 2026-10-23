export function formatINR(paise: number): string {
  const negative = paise < 0
  const rupees = Math.round(Math.abs(paise) / 100)
  const body = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees)
  return negative ? body.replace("₹", "−₹") : body
}

export function formatExactINR(paise: number): string {
  const negative = paise < 0
  const body = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(paise) / 100)
  return negative ? body.replace("₹", "−₹") : body
}

export function parseRupeeInput(raw: string): number | null {
  const cleaned = raw.replace(/₹/g, "").replace(/,/g, "").replace(/\s/g, "").replace(/dr|cr/gi, "")
  if (!cleaned || cleaned === "-" || cleaned === ".") return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

export function rupeeInputFromPaise(paise: number): string {
  const rupees = paise / 100
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2)
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
/** Matches Indian-style dates inside free text: 22/10, 22-10-2026, 22 Oct, 22nd October 2026, Oct 22. */
export const INDIAN_DATE_IN_TEXT = new RegExp(
  `\\b(\\d{1,2})[/.-](\\d{1,2})(?:[/.-](\\d{2}|\\d{4}))?\\b|\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\b(?:,?\\s+(\\d{4}))?|\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`,
  "i",
)

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const value = new Date(Date.UTC(year, month - 1, day))
  if (value.getUTCMonth() !== month - 1) return null
  return value.toISOString().slice(0, 10)
}

/**
 * Read a date the way people in India write it: day first. "22/10", "22/10/2026", "22-10-26", "22 Oct", "Oct 22".
 * A date with no year that would land after `today` is taken as last year (you log past spends, not future ones).
 * Returns an ISO date or null.
 */
export function parseIndianDate(text: string, today: string): string | null {
  const match = text.trim().match(INDIAN_DATE_IN_TEXT)
  if (!match) {
    return /^\d{4}-\d{2}-\d{2}$/.test(text.trim()) ? text.trim() : null
  }
  const [, d1, m1, y1, d2, mon2, y2, mon3, d3, y3] = match
  let day: number, month: number, yearText: string | undefined
  if (d1) {
    day = Number(d1)
    month = Number(m1)
    yearText = y1
  } else if (d2) {
    day = Number(d2)
    month = MONTHS.indexOf(mon2.slice(0, 3).toLowerCase()) + 1
    yearText = y2
  } else {
    day = Number(d3)
    month = MONTHS.indexOf(mon3.slice(0, 3).toLowerCase()) + 1
    yearText = y3
  }
  const thisYear = Number(today.slice(0, 4))
  if (yearText) {
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)
    return iso(year, month, day)
  }
  const guess = iso(thisYear, month, day)
  if (guess && guess > today) return iso(thisYear - 1, month, day)
  return guess
}

/** ISO date to DD/MM/YYYY. */
export function formatIndianDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-")
  return y && m && d ? `${d}/${m}/${y}` : isoDate
}
