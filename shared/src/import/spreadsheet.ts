import * as XLSX from "xlsx"
import { findHeaderRow, tableFromGrid, type CsvTable } from "./csv"

const pad = (value: number) => String(value).padStart(2, "0")

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return ""
  if (cell.t === "n" && typeof cell.v === "number") {
    const format = typeof cell.z === "string" ? cell.z : ""
    if (format && XLSX.SSF.is_date(format)) {
      const parts = XLSX.SSF.parse_date_code(cell.v)
      if (parts) {
        const date = `${parts.y}-${pad(parts.m)}-${pad(parts.d)}`
        return parts.H || parts.M ? `${date} ${pad(parts.H)}:${pad(parts.M)}` : date
      }
    }
    return String(cell.v)
  }
  if (cell.t === "d" && cell.v instanceof Date) {
    const d = cell.v
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  return String(cell.w ?? cell.v)
}

function sheetGrid(sheet: XLSX.WorkSheet): string[][] {
  const ref = sheet["!ref"]
  if (!ref) return []
  const range = XLSX.utils.decode_range(ref)
  const grid: string[][] = []
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row: string[] = []
    for (let c = range.s.c; c <= range.e.c; c += 1) row.push(cellText(sheet[XLSX.utils.encode_cell({ r, c })]).trim())
    grid.push(row)
  }
  return grid
}

/** What kind of file the bytes really are; many Indian banks send HTML or text saved as .xls. */
export function sniffFormat(data: Uint8Array): "xlsx" | "xls" | "html" | "text" {
  if (data[0] === 0x50 && data[1] === 0x4b) return "xlsx"
  if (data[0] === 0xd0 && data[1] === 0xcf && data[2] === 0x11 && data[3] === 0xe0) return "xls"
  const head = new TextDecoder("utf-8", { fatal: false }).decode(data.slice(0, 2048)).toLowerCase()
  if (/<(html|table|\?xml|workbook|tr)\b/.test(head)) return "html"
  return "text"
}

/** Reads any spreadsheet a bank might send and returns the grid of the sheet that holds transactions. */
export function spreadsheetToGrid(data: Uint8Array): { grid: string[][]; format: ReturnType<typeof sniffFormat>; sheet: string } {
  const format = sniffFormat(data)
  const workbook =
    format === "html" || format === "text"
      ? XLSX.read(new TextDecoder("utf-8").decode(data), { type: "string", raw: true })
      : XLSX.read(data, { type: "array", cellDates: false, cellNF: true })
  let best = { grid: [] as string[][], sheet: workbook.SheetNames[0] ?? "", found: false }
  for (const name of workbook.SheetNames) {
    const grid = sheetGrid(workbook.Sheets[name])
    const found = findHeaderRow(grid) >= 0
    if (found && !best.found) best = { grid, sheet: name, found }
    else if (!best.found && grid.length > best.grid.length) best = { grid, sheet: name, found }
  }
  return { grid: best.grid, format, sheet: best.sheet }
}

/** Grid back to CSV text so the server sees one format whatever the bank sent. */
export function gridToCsv(grid: string[][]): string {
  const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  return grid.map((row) => row.map(cell).join(",")).join("\r\n")
}

export function readSpreadsheetTable(data: Uint8Array): CsvTable & { format: string } {
  const { grid, format } = spreadsheetToGrid(data)
  return { ...tableFromGrid(grid), format }
}
