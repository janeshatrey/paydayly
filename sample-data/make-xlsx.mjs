// Builds a synthetic Excel statement (bank info preamble, real date cells, single Amount + Dr/Cr column,
// summary footer) from the sample CSV, to show that Paydayly reads any bank's .xlsx layout.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import * as XLSX from "xlsx"
XLSX.set_fs(fs)
const here = path.dirname(fileURLToPath(import.meta.url))
const lines = fs.readFileSync(path.join(here, "hdfc-statement-sep-oct-2026.csv"), "utf8").trim().split(/\r?\n/).slice(1)
const split = (l) => { const out = []; let cur = "", q = false; for (const c of l) { if (c === '"') q = !q; else if (c === "," && !q) { out.push(cur); cur = "" } else cur += c } out.push(cur); return out }
const rows = lines.map(split).map(([d, n, ref, , w, dep, bal]) => {
  const [dd, mm, yy] = d.split("/").map(Number)
  return [new Date(Date.UTC(2000 + yy, mm - 1, dd)), n, ref, Number(w || dep), w ? "Dr" : "Cr", Number(bal)]
})
const first = rows[0]
const opening = first[5] + (first[4] === "Dr" ? first[3] : -first[3])
const debits = rows.filter((r) => r[4] === "Dr").reduce((s, r) => s + r[3], 0)
const credits = rows.filter((r) => r[4] === "Cr").reduce((s, r) => s + r[3], 0)
const aoa = [
  ["Sample Bank Ltd. Account Statement"], ["Account holder", "DEMO USER"], ["Account number", "XXXXXXXX0000"],
  ["Period", "01 Sep 2026 to 22 Oct 2026"], [],
  ["Txn Date", "Particulars", "Reference", "Amount (INR)", "Dr/Cr", "Balance"],
  ["", "Opening Balance", "", "", "", Math.round(opening * 100) / 100],
  ...rows,
  [], ["Total Debits", "", "", Math.round(debits * 100) / 100], ["Total Credits", "", "", Math.round(credits * 100) / 100],
  ["Closing Balance", "", "", "", "", rows.at(-1)[5]], ["This is a computer generated statement."],
]
const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: "dd-mmm-yyyy" })
ws["!cols"] = [{ wch: 12 }, { wch: 60 }, { wch: 14 }, { wch: 14 }, { wch: 6 }, { wch: 14 }]
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, "Statement")
XLSX.writeFile(wb, path.join(here, "sample-bank-statement-sep-oct-2026.xlsx"))
console.log(`${rows.length} rows written`)
