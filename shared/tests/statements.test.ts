import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { applyMapping, checkFile, guessMapping, mappingConfidence, readCsvTable } from "../src/import/csv"
import { gridToCsv, sniffFormat, spreadsheetToGrid } from "../src/import/spreadsheet"

const dir = path.join(__dirname, "fixtures")
const expected = JSON.parse(fs.readFileSync(path.join(dir, "expected.json"), "utf8")) as { rows: number; opening: number; closing: number; debits: number }

function importFile(name: string) {
  const bytes = new Uint8Array(fs.readFileSync(path.join(dir, name)))
  const text = name.endsWith(".csv") ? new TextDecoder().decode(bytes) : gridToCsv(spreadsheetToGrid(bytes).grid)
  const table = readCsvTable(text)
  const mapping = guessMapping(table.headers)
  const parsed = applyMapping(table.records, mapping!, table.lines)
  return { bytes, table, mapping, ...parsed, check: checkFile(parsed.rows), confidence: mappingConfidence(table, mapping) }
}

describe("statement import from any bank layout", () => {
  for (const name of ["icici-style.xls", "html-disguised.xls", "preamble.csv", "signed-amount.xlsx"]) {
    it(`reads ${name} and reconciles to the closing balance`, () => {
      const result = importFile(name)
      expect(result.mapping).not.toBeNull()
      expect(result.rejected).toEqual([])
      expect(result.rows).toHaveLength(expected.rows)
      expect(result.rows.filter((row) => row.direction === "debit")).toHaveLength(expected.debits)
      expect(result.rows[0].date).toBe("2026-09-01")
      expect(result.check.balanceMatches).toBe(true)
      expect(result.check.openingPaise).toBe(expected.opening * 100)
      expect(result.check.closingPaise).toBe(Math.round(expected.closing * 100))
      expect(result.confidence.overall).toBe(1)
    })
  }

  it("sniffs the real format behind the file extension", () => {
    expect(sniffFormat(importFile("icici-style.xls").bytes)).toBe("xls")
    expect(sniffFormat(importFile("html-disguised.xls").bytes)).toBe("html")
    expect(sniffFormat(importFile("signed-amount.xlsx").bytes)).toBe("xlsx")
  })

  it("finds the header under bank info and prefers transaction date over value date", () => {
    const { table, mapping } = importFile("icici-style.xls")
    expect(table.headerLine).toBe(8)
    expect(mapping?.date).toBe("Transaction Date")
    expect(mapping?.debit).toBe("Withdrawal Amount(INR)")
    expect(table.joinedLines).toBe(2)
  })

  it("joins wrapped remarks back onto their row", () => {
    const { rows } = importFile("icici-style.xls")
    expect(rows[1].narration).toMatch(/^UPI\/BLINKIT\/blinki ?t@ybl\/Groceries$/)
  })

  it("leaves out opening, closing and summary lines", () => {
    const html = importFile("html-disguised.xls")
    expect(html.mapping?.type).toBe("Dr/Cr")
    expect(html.rows.some((row) => /balance/i.test(row.narration))).toBe(false)
    expect(importFile("preamble.csv").table.skippedLines).toBeGreaterThan(0)
  })

  it("reads month-name and US-style dates", () => {
    const table = readCsvTable("Date,Description,Debit,Credit\n\"Sep 5, 2026\",Tea,10,\n2026/09/06,Coffee,20,\n07-September-2026,Cake,30,")
    const parsed = applyMapping(table.records, guessMapping(table.headers)!, table.lines)
    expect(parsed.rows.map((row) => row.date)).toEqual(["2026-09-05", "2026-09-06", "2026-09-07"])
  })
})
