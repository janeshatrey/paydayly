// Usage: node generate.mjs [end-date YYYY-MM-DD] [output file]
// Writes a realistic HDFC-style statement covering the month before end-date and the current month up to it.
import fs from "node:fs"

const end = process.argv[2] ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
const out = process.argv[3] ?? `statement-${end}.csv`

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = seeded(Number(end.replaceAll("-", "")))
const between = (min, max) => min + Math.floor(random() * (max - min + 1))
const ref = () => String(between(400000000000, 699999999999))

const [ey, em] = end.split("-").map(Number)
const start = new Date(Date.UTC(ey, em - 2, 1))
const last = new Date(`${end}T00:00:00Z`)

const daily = [
  { text: "UPI-THIRD WAVE COFFEE-thirdwave@okicici-ICIC0000104", min: 180, max: 320, weight: 3 },
  { text: "UPI-BLUE TOKAI COFFEE-bluetokai@ybl-YESB0000001", min: 220, max: 380, weight: 1 },
  { text: "UPI-BLINKIT-blinkit.payu@hdfcbank-HDFC0000499", min: 120, max: 890, weight: 4 },
  { text: "UPI-ZEPTO MARKETPLACE-zepto@ybl-YESB0000001", min: 140, max: 760, weight: 3 },
  { text: "UPI-SWIGGY INSTAMART-instamart@icici-ICIC0000001", min: 210, max: 940, weight: 2 },
  { text: "UPI-SWIGGY-swiggy@axisbank-UTIB0000100", min: 180, max: 690, weight: 3 },
  { text: "UPI-ZOMATO LTD-zomato@hdfcbank-HDFC0000001", min: 220, max: 820, weight: 3 },
  { text: "UPI-UBER INDIA-uber@axisbank-UTIB0000100", min: 90, max: 460, weight: 3 },
  { text: "UPI-RAPIDO-rapido@ybl-YESB0000001", min: 45, max: 160, weight: 2 },
  { text: "UPI-AMAZON PAY-amazonpay@apl-UTIB0000000", min: 299, max: 2400, weight: 2 },
  { text: "UPI-MYNTRA DESIGNS-myntra@icici-ICIC0000001", min: 599, max: 2800, weight: 1 },
  { text: "UPI-SHARMA KIRANA STORE-paytmqr2810@paytm-PYTM0123456", min: 60, max: 420, weight: 2 },
  { text: "UPI-TRUFFLES CAFE-truffles@ybl-YESB0000001", min: 650, max: 1900, weight: 1 },
]
const pool = daily.flatMap((item) => Array(item.weight).fill(item))

const rows = []
const add = (date, text, debit, credit) => rows.push({ date, text, debit, credit })

for (let d = new Date(start); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
  const iso = d.toISOString().slice(0, 10)
  const day = d.getUTCDate()
  const tag = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()
  if (day === 1) {
    add(iso, `NEFT CR-HDFC0000240-NORTHWIND TECHNOLOGIES PVT LTD-SALARY ${tag}`, 0, 85000)
    add(iso, `UPI-RAJESH KUMAR RENT-rajeshk@okhdfcbank-HDFC0000123-RENT ${tag}`, 22000, 0)
  }
  if (day === 5) add(iso, "ACH D- BAJAJ FINANCE LTD-EMI 4500219834", 6500, 0)
  if (day === 7) add(iso, "ACH D- GROWW INVEST TECH-SIP NIFTY INDEX FUND", 8000, 0)
  if (day === 8) add(iso, "UPI-SELF TRANSFER-OWN ACCOUNT-SAVINGS", 5000, 0)
  if (day === 10) add(iso, "UPI-BESCOM BILL PAYMENT-bescom@hdfcbank-ELECTRICITY", between(1400, 2300), 0)
  if (day === 12) add(iso, "UPI-AIRTEL PREPAID RECHARGE-airtel@ybl", 349, 0)
  if (day === 14) add(iso, "UPI-NETFLIX ENTERTAINMENT-netflix@hdfcbank", em - 1 === d.getUTCMonth() + 1 ? 649 : 499, 0)
  if (day === 15) add(iso, "UPI-SPOTIFY INDIA-spotify@icici", 119, 0)
  const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6
  const count = between(0, weekend ? 4 : 3)
  for (let i = 0; i < count; i += 1) {
    const pick = pool[Math.floor(random() * pool.length)]
    add(iso, pick.text, between(pick.min, pick.max), 0)
  }
}

const mid = rows.filter((row) => row.date.endsWith("-18"))[0]
if (mid) {
  add(mid.date, "UPI-BLINKIT-blinkit.payu@hdfcbank-HDFC0000499", 349, 0)
  add(mid.date, "UPI-BLINKIT-blinkit.payu@hdfcbank-HDFC0000499", 349, 0)
}
const refundDay = rows.find((row) => row.date.endsWith("-21"))
if (refundDay) add(refundDay.date, "UPI-AMAZON PAY-REFUND-amazonpay@apl", 0, 799)
const lastDay = last.toISOString().slice(0, 10)
const recent = (offset) => {
  const date = new Date(`${lastDay}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - offset)
  return date.toISOString().slice(0, 10)
}
add(recent(4), "UPI-TOIT BREWPUB-toit@okicici-ICIC0000104-GROUP DINNER", 2400, 0)
add(recent(2), "UPI-ARJUN MEHTA-arjunm@okaxis-DINNER SPLIT", 0, 800)
add(recent(3), "BILLDESK-HDFC CREDIT CARD PAYMENT-XX4417", 4200, 0)

rows.sort((a, b) => a.date.localeCompare(b.date))
let balance = 42350.75
const fmt = (n) => (n ? n.toFixed(2) : "")
const csvDate = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`
const lines = ["Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance"]
for (const row of rows) {
  balance += row.credit - row.debit
  const narration = row.text.includes(",") ? `"${row.text}"` : row.text
  lines.push([csvDate(row.date), narration, ref(), csvDate(row.date), fmt(row.debit), fmt(row.credit), balance.toFixed(2)].join(","))
}
fs.writeFileSync(out, lines.join("\r\n") + "\r\n", "utf8")
console.log(`Wrote ${rows.length} rows to ${out}`)
