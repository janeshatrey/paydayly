import Papa from "papaparse"
import { isRealDate } from "../engine/dates"
import { CATEGORIES, type Category, type CsvMapping, type Transaction } from "../types"

export interface RejectedRow {
  line: number
  reason: string
}

export interface ImportedRow {
  date: string
  time: string
  narration: string
  amountPaise: number
  direction: "debit" | "credit"
  merchant?: string
  category?: Category
  oneOff?: boolean
  fixedOverride?: boolean | null
  transfer?: boolean
  uncertain?: string
  balancePaise?: number | null
  line?: number
}

export interface CsvTable {
  headers: string[]
  records: Record<string, string>[]
  /** Original 1-based line number in the file for each record. */
  lines?: number[]
  /** 1-based line of the detected header row. */
  headerLine?: number
  /** Non-transaction lines left out (bank info, summaries, legends, blank rows). */
  skippedLines?: number
  /** Wrapped descriptions joined back onto the row above. */
  joinedLines?: number
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

const ROLE_PATTERNS: Record<string, RegExp> = {
  date: /\b(date|dt)\b|^date|date$/i,
  narration: /narrat|description|particular|remark|detail|transaction info/i,
  debit: /debit|withdraw|money out|paid out|^\s*dr\.?\s*$|\(dr\)/i,
  credit: /credit|deposit|money in|paid in|^\s*cr\.?\s*$|\(cr\)/i,
  amount: /amount|^amt|\bamt\b/i,
  balance: /balance|^bal\.?$/i,
  ref: /chq|cheque|ref|utr/i,
  type: /^type$|dr\s*\/\s*cr|cr\s*\/\s*dr|txn type|transaction type/i,
}

function headerScore(row: string[]): number {
  const cells = row.map((cell) => cell.trim()).filter((cell) => cell.length > 0 && cell.length <= 60)
  if (cells.length < 3) return 0
  const roles = new Set<string>()
  for (const cell of cells) {
    if (/^[\d,.\s/-]+$/.test(cell)) continue
    for (const [role, pattern] of Object.entries(ROLE_PATTERNS)) if (pattern.test(cell)) roles.add(role)
  }
  const hasMoney = roles.has("debit") || roles.has("credit") || roles.has("amount")
  if (!roles.has("date") || !hasMoney) return 0
  return roles.size + (roles.has("narration") ? 2 : 0)
}

/** Finds the row that holds the column names, skipping bank info printed above the table. */
export function findHeaderRow(grid: string[][], scan = 80): number {
  let best = -1
  let bestScore = 0
  for (let index = 0; index < Math.min(grid.length, scan); index += 1) {
    const score = headerScore(grid[index] ?? [])
    if (score > bestScore) {
      best = index
      bestScore = score
    }
  }
  return best
}

const SUMMARY = /opening\s*bal|closing\s*bal|brought\s*forward|carried\s*forward|\bb\/f\b|\bc\/f\b|^total|grand total|statement summary|end of statement/i

function looksLikeAmount(cell: string): boolean {
  const value = cell.trim()
  return value.length > 0 && /\d/.test(value) && parseMoney(value) !== null
}

/** Turns a raw grid (CSV, XLS, XLSX or an HTML table) into a header plus transaction records. */
export function tableFromGrid(input: string[][]): CsvTable {
  const grid = input.map((row) => row.map((cell) => String(cell ?? "").replace(/\s+/g, " ").trim()))
  let headerIndex = findHeaderRow(grid)
  if (headerIndex < 0) headerIndex = grid.findIndex((row) => row.some((cell) => cell.length > 0))
  if (headerIndex < 0) return { headers: [], records: [], lines: [], headerLine: 0, skippedLines: 0, joinedLines: 0 }
  const rawHeaders = grid[headerIndex]
  const body = grid.slice(headerIndex + 1)
  const width = Math.max(rawHeaders.length, ...body.map((row) => row.length))
  const keep: number[] = []
  const seen = new Map<string, number>()
  const headers: string[] = []
  for (let column = 0; column < width; column += 1) {
    let name = rawHeaders[column] ?? ""
    const used = body.some((row) => (row[column] ?? "").length > 0)
    if (!name && !used) continue
    if (!name) name = `Column ${column + 1}`
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    if (count) name = `${name} (${count + 1})`
    keep.push(column)
    headers.push(name)
  }
  const mapping = guessMapping(headers)
  const at = (row: string[], header: string | undefined) => (header ? (row[keep[headers.indexOf(header)]] ?? "") : "")
  const headerKey = rawHeaders.join("|").toLowerCase()
  const records: Record<string, string>[] = []
  const lines: number[] = []
  const dated: boolean[] = []
  const afterBreak: boolean[] = []
  let broken = false
  let skippedLines = 0
  let joinedLines = 0
  body.forEach((row, offset) => {
    const line = headerIndex + offset + 2
    const filled = row.filter((cell) => cell.length > 0)
    if (filled.length === 0) {
      broken = true
      return void (skippedLines += 1)
    }
    if (row.join("|").toLowerCase() === headerKey) return void (skippedLines += 1)
    const dateCell = mapping ? at(row, mapping.date) : ""
    const hasDate = mapping ? parseDateCell(dateCell) !== null : true
    const moneyCells = mapping ? [mapping.debit, mapping.credit].filter((value, index, list) => value && list.indexOf(value) === index) : []
    const hasMoney = moneyCells.some((header) => looksLikeAmount(at(row, header)) && parseMoney(at(row, header))!.paise > 0)
    const text = row.join(" ")
    if (mapping && !hasDate) {
      if (!hasMoney && !dateCell && records.length > 0 && filled.length === 1 && at(row, mapping.narration) && !SUMMARY.test(text) && dated[dated.length - 1]) {
        const previous = records[records.length - 1]
        const extra = at(row, mapping.narration)
        const before = previous[mapping.narration] ?? ""
        const glue = /[/@\-_.]$/.test(before) || /^[/@\-_.]/.test(extra) || before.length >= 40 ? "" : " "
        previous[mapping.narration] = `${before}${glue}${extra}`.trim()
        joinedLines += 1
        return
      }
      if (!hasMoney || SUMMARY.test(text)) {
        broken = true
        return void (skippedLines += 1)
      }
    }
    if (mapping && hasDate && !hasMoney && SUMMARY.test(text)) return void (skippedLines += 1)
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header] = row[keep[index]] ?? ""
    })
    records.push(record)
    lines.push(line)
    dated.push(hasDate)
    afterBreak.push(broken)
    if (hasDate) broken = false
  })
  // Anything after the last dated row is footer material (legends, summaries), not transactions.
  const last = dated.lastIndexOf(true)
  const cut = mapping && last >= 0 ? afterBreak.findIndex((value, index) => index > last && value) : -1
  if (cut > 0) {
    skippedLines += records.length - cut
    records.length = cut
    lines.length = cut
  }
  return { headers, records, lines, headerLine: headerIndex + 1, skippedLines, joinedLines }
}

export function readCsvTable(text: string): CsvTable {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const parsed = Papa.parse<string[]>(source, { header: false, skipEmptyLines: false })
  return tableFromGrid(parsed.data.map((row) => row.map((cell) => String(cell ?? ""))))
}

export interface MappingConfidence {
  date: number
  narration: number
  amount: number
  overall: number
}

/** How sure the automatic column choice is: share of rows whose cells read cleanly. */
export function mappingConfidence(table: CsvTable, mapping: CsvMapping | null): MappingConfidence {
  if (!mapping || table.records.length === 0) return { date: 0, narration: 0, amount: 0, overall: 0 }
  const rows = table.records
  const share = (test: (record: Record<string, string>) => boolean) => rows.filter(test).length / rows.length
  const date = share((record) => parseDateCell(String(record[mapping.date] ?? "")) !== null)
  const narration = share((record) => /[a-z]/i.test(String(record[mapping.narration] ?? "")))
  const amount = share((record) =>
    [mapping.debit, mapping.credit].some((header) => header && looksLikeAmount(String(record[header] ?? ""))),
  )
  const round = (value: number) => Math.round(value * 100) / 100
  return { date: round(date), narration: round(narration), amount: round(amount), overall: round(Math.min(date, narration, amount)) }
}

export function guessMapping(headers: string[]): CsvMapping | null {
  const find = (...patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const hit = headers.find((header) => pattern.test(header.trim()))
      if (hit) return hit
    }
    return ""
  }
  const date = find(/^(txn|tran|transaction|posting|post|book)\.?\s*(date|dt)/i, /^date$/i, /^date\b/i, /\bdate\b|\bdt\b/i, /date/i)
  const narration = find(/narrat/i, /description/i, /particular/i, /remark/i, /detail/i, /transaction info/i)
  let debit = find(/withdraw/i, /debit/i, /money out|paid out/i, /^\s*dr\.?\s*$/i, /\(dr\)/i)
  let credit = find(/deposit/i, /credit/i, /money in|paid in/i, /^\s*cr\.?\s*$/i, /\(cr\)/i)
  if (debit && debit === credit) credit = ""
  const time = find(/^time$/i, /\btime\b/i)
  const balance = find(/closing balance/i, /balance/i, /^bal\.?$/i)
  let type = ""
  if (!debit && !credit) {
    const amount = find(/amount|^amt|\bamt\b/i)
    if (amount) {
      debit = amount
      credit = amount
      type = find(/^type$/i, /dr\s*\/\s*cr|cr\s*\/\s*dr|txn type|transaction type|^dr\s*cr$|^cr\s*dr$/i)
    }
  }
  if (!date || !narration || (!debit && !credit)) return null
  return { date, narration, debit, credit, time: time === date ? "" : time, type, balance }
}

export function applyMapping(
  records: Record<string, string>[],
  mapping: CsvMapping,
  lines?: number[],
): { rows: ImportedRow[]; rejected: RejectedRow[] } {
  const rows: ImportedRow[] = []
  const rejected: RejectedRow[] = []
  const signed =
    Boolean(mapping.debit) &&
    mapping.debit === mapping.credit &&
    !mapping.type &&
    records.some((record) => /^\s*(-|\()/.test(String(record[mapping.debit] ?? "")))
  records.forEach((record, index) => {
    const line = lines?.[index] ?? index + 2
    const dateCell = String(record[mapping.date] ?? "")
    const parsedDate = parseDateCell(dateCell)
    if (!parsedDate) {
      rejected.push({ line, reason: "The date could not be read." })
      return
    }
    const narration = String(record[mapping.narration] ?? "").trim() || "Imported payment"
    const timeCell = mapping.time ? String(record[mapping.time] ?? "") : ""
    const time = parseTime(timeCell) ?? parsedDate.time
    const balanceRaw = mapping.balance ? blankDash(String(record[mapping.balance] ?? "")) : ""
    const balanceMoney = balanceRaw ? parseMoney(balanceRaw) : null
    const balancePaise = balanceMoney ? (balanceMoney.negative ? -balanceMoney.paise : balanceMoney.paise) : null
    if (mapping.debit && mapping.debit === mapping.credit) {
      const raw = blankDash(String(record[mapping.debit] ?? ""))
      const money = raw ? parseMoney(raw) : null
      if (!money || money.paise === 0) {
        rejected.push({ line, reason: raw ? "The amount could not be read." : "No amount on this row." })
        return
      }
      const typeCell = mapping.type ? String(record[mapping.type] ?? "").trim().toLowerCase() : ""
      let direction: "debit" | "credit" = "debit"
      let uncertain: string | undefined
      if (/^(cr|credit|c|deposit|in)\b/.test(typeCell)) direction = "credit"
      else if (/^(dr|debit|d|withdrawal|out)\b/.test(typeCell)) direction = "debit"
      else if (/\bcr\b/i.test(raw)) direction = "credit"
      else if (/\bdr\b/i.test(raw)) direction = "debit"
      else if (money.negative) direction = "debit"
      else if (signed) direction = "credit"
      else {
        direction = "debit"
        uncertain = "No Dr/Cr marker, so this was read as money out."
      }
      rows.push({
        date: parsedDate.date, time, narration, amountPaise: money.paise, direction, balancePaise, line,
        ...(uncertain ? { uncertain } : {}), ...userFields(record),
      })
      return
    }
    const debitRaw = mapping.debit ? blankDash(String(record[mapping.debit] ?? "")) : ""
    const creditRaw = mapping.credit ? blankDash(String(record[mapping.credit] ?? "")) : ""
    const debit = debitRaw ? parseMoney(debitRaw) : null
    const credit = creditRaw ? parseMoney(creditRaw) : null
    if (debitRaw && !debit) {
      rejected.push({ line, reason: "The money-out figure could not be read." })
      return
    }
    if (creditRaw && !credit) {
      rejected.push({ line, reason: "The money-in figure could not be read." })
      return
    }
    if (debit && credit && debit.paise > 0 && credit.paise > 0) {
      rejected.push({ line, reason: "Both money out and money in are filled." })
      return
    }
    if ((!debit || debit.paise === 0) && (!credit || credit.paise === 0)) {
      rejected.push({ line, reason: "No amount on this row." })
      return
    }
    let direction: "debit" | "credit" = debit && debit.paise > 0 ? "debit" : "credit"
    let amountPaise = direction === "debit" ? debit!.paise : credit!.paise
    const raw = direction === "debit" ? debitRaw : creditRaw
    const money = direction === "debit" ? debit! : credit!
    direction = directionFromCell(raw, direction, money.negative)
    if (amountPaise === 0) {
      rejected.push({ line, reason: "No amount on this row." })
      return
    }
    rows.push({ date: parsedDate.date, time, narration, amountPaise, direction, balancePaise, line, ...userFields(record) })
  })
  return { rows, rejected }
}

function blankDash(raw: string): string {
  const value = raw.trim()
  return /^[-–—]+$/.test(value) ? "" : value
}

function yesNo(raw: string | undefined): boolean | null {
  const value = (raw ?? "").trim().toLowerCase()
  if (value === "yes" || value === "true") return true
  if (value === "no" || value === "false") return false
  return null
}

function userFields(record: Record<string, string>): Partial<ImportedRow> {
  const fields: Partial<ImportedRow> = {}
  const merchant = (record.Merchant ?? "").trim()
  if (merchant) fields.merchant = merchant
  const category = (record.Category ?? "").trim()
  if ((CATEGORIES as readonly string[]).includes(category)) fields.category = category as Category
  if ("One-off" in record) fields.oneOff = yesNo(record["One-off"]) === true
  if ("Fixed" in record) fields.fixedOverride = yesNo(record.Fixed)
  if ("Transfer" in record) fields.transfer = yesNo(record.Transfer) === true
  return fields
}

function directionFromCell(raw: string, column: "debit" | "credit", negative: boolean): "debit" | "credit" {
  if (/\bcr\b/i.test(raw)) return "credit"
  if (/\bdr\b/i.test(raw)) return "debit"
  if (negative) return column === "debit" ? "credit" : "debit"
  return column
}

function parseMoney(raw: string): { paise: number; negative: boolean } | null {
  let source = raw.trim()
  if (!source) return null
  let negative = false
  if (/^\(.*\)$/.test(source)) {
    negative = true
    source = source.slice(1, -1)
  }
  source = source.replace(/₹/g, "").replace(/,/g, "").replace(/\s+/g, "")
  source = source.replace(/dr|cr/gi, "")
  if (!source) return null
  if (source.startsWith("-")) {
    negative = true
    source = source.slice(1)
  }
  if (!/^\d+(\.\d+)?$/.test(source)) return null
  return { paise: Math.round(Number(source) * 100), negative }
}

function parseTime(raw: string): string | null {
  const match = raw.trim().match(/(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function parseDateCell(raw: string): { date: string; time: string } | null {
  const value = raw.trim()
  if (!value) return null
  const time = parseTime(value) ?? ""
  const datePart = value
    .replace(/(\d{1,2}):(\d{2})(:\d{2})?(\s*[ap]\.?m\.?)?/i, "")
    .replace(/\s*\((mon|tue|wed|thu|fri|sat|sun)[a-z]*\)\s*$/i, "")
    .replace(/[T\s]+$/, "")
    .trim()
  const iso = datePart.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (iso) {
    const date = stamp(Number(iso[3]), Number(iso[2]), Number(iso[1]))
    return date && isRealDate(date) ? { date, time } : null
  }
  const monthFirst = datePart.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/)
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].slice(0, 3).toLowerCase()]
    if (!month) return null
    const date = stamp(Number(monthFirst[2]), month, expandYear(Number(monthFirst[3])))
    return date ? { date, time } : null
  }
  const named = datePart.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,9})\.?[-\s/,]+(\d{2,4})$/)
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()]
    if (!month) return null
    const date = stamp(Number(named[1]), month, expandYear(Number(named[3])))
    return date ? { date, time } : null
  }
  const numeric = datePart.match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2,4})$/)
  if (numeric) {
    const date = stamp(Number(numeric[1]), Number(numeric[2]), expandYear(Number(numeric[3])))
    return date ? { date, time } : null
  }
  return null
}

function expandYear(year: number): number {
  if (year >= 100) return year
  return year <= 69 ? 2000 + year : 1900 + year
}

function stamp(day: number, month: number, year: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  const check = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(check.getTime())) return null
  if (check.getUTCDate() !== day || check.getUTCMonth() + 1 !== month) return null
  return date
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function transactionsToCsv(transactions: Transaction[]): string {
  const yes = (value: boolean) => (value ? "yes" : "no")
  const lines = [["Date", "Time", "Narration", "Debit", "Credit", "Balance", "Merchant", "Category", "One-off", "Fixed", "Transfer"]]
  for (const tx of [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))) {
    const rupees = (tx.amountPaise / 100).toFixed(2)
    lines.push([
      tx.date,
      tx.time,
      tx.narration,
      tx.direction === "debit" ? rupees : "",
      tx.direction === "credit" ? rupees : "",
      "",
      tx.merchant,
      tx.category,
      yes(tx.oneOff),
      tx.fixedOverride === null ? "" : yes(tx.fixedOverride),
      yes(tx.transfer),
    ])
  }
  return lines.map((row) => row.map(csvCell).join(",")).join("\r\n")
}

export interface FileCheck {
  debitPaise: number
  creditPaise: number
  netPaise: number
  from: string | null
  to: string | null
  openingPaise: number | null
  closingPaise: number | null
  balanceMatches: boolean | null
  mismatchLine: number | null
}

export function checkFile(rows: ImportedRow[]): FileCheck {
  const debitPaise = rows.filter((row) => row.direction === "debit").reduce((sum, row) => sum + row.amountPaise, 0)
  const creditPaise = rows.filter((row) => row.direction === "credit").reduce((sum, row) => sum + row.amountPaise, 0)
  const dates = rows.map((row) => row.date).sort()
  const withBalance = rows.filter((row) => typeof row.balancePaise === "number")
  let openingPaise: number | null = null
  let closingPaise: number | null = null
  let balanceMatches: boolean | null = null
  let mismatchLine: number | null = null
  if (withBalance.length === rows.length && rows.length > 0) {
    const signed = (row: ImportedRow) => (row.direction === "credit" ? row.amountPaise : -row.amountPaise)
    const forward = rows.slice(1).every((row, index) => rows[index].balancePaise! + signed(row) === row.balancePaise)
    const ordered = forward ? rows : [...rows].reverse()
    openingPaise = ordered[0].balancePaise! - signed(ordered[0])
    closingPaise = ordered[ordered.length - 1].balancePaise!
    let running = openingPaise
    balanceMatches = true
    for (const row of ordered) {
      running += signed(row)
      if (running !== row.balancePaise) {
        balanceMatches = false
        mismatchLine = row.line ?? null
        break
      }
    }
  }
  return {
    debitPaise,
    creditPaise,
    netPaise: creditPaise - debitPaise,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    openingPaise,
    closingPaise,
    balanceMatches,
    mismatchLine,
  }
}
