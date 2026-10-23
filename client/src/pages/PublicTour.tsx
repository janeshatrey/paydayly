import { useState } from "react"
import { Link } from "react-router-dom"
import { buildSnapshot, checkAffordability, EMPTY_SETTINGS, formatINR, parseRupeeInput } from "@paydayly/shared"
import { Logo } from "../components/Logo"
import { Breakdown } from "../components/Money"
import { Card, Field, Input } from "../components/ui"
import { useLang } from "../lib/i18n"

const settings = {
  ...EMPTY_SETTINGS, incomePaise: 5_000_000, payday: 1, savingsTargetPaise: 1_000_000, bufferPaise: 100_000,
  commitments: [{ id: "rent", name: "Rent", kind: "rent" as const, amountPaise: 1_500_000, dueDay: 5 }],
}
const snapshot = buildSnapshot([], settings, "2026-10-24")

/** Public, synthetic and entirely local: no account, API writes, or saved entries. */
export function PublicTourPage() {
  const { lang } = useLang()
  const hi = lang === "hi"
  const [amount, setAmount] = useState("2500")
  const paise = parseRupeeInput(amount)
  const result = paise !== null && paise > 0 ? checkAffordability(snapshot, settings, {
    amountPaise: paise, date: snapshot.asOf, goalId: null, paydayLateDays: 0,
  }) : null
  return <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
    <Link to="/" aria-label="Paydayly home"><Logo /></Link>
    <h1 className="font-display text-3xl font-bold">{hi ? "Paydayly का उदाहरण देखें" : "Try a Paydayly example"}</h1>
    <p className="rounded-xl bg-brand-soft p-4">{hi ? "केवल उदाहरण · 24 अक्टूबर 2026। कोई असली खाता या पैसा नहीं। कुछ भी सेव नहीं होगा।" : "Sample only · 24 October 2026. No real account or money. Nothing you enter here is saved."}</p>
    <Card className="space-y-4 p-6">
      <h2 className="text-lg font-semibold">{hi ? "1. पहले ज़रूरी खर्च अलग रखें" : "1. Protect the essentials first"}</h2>
      <p>{hi ? "₹50,000 वेतन − ₹15,000 किराया − ₹10,000 बचत − ₹1,000 बफर" : "₹50,000 salary − ₹15,000 rent − ₹10,000 savings − ₹1,000 buffer"}</p>
      <p className="text-3xl font-bold">{formatINR(snapshot.headline.availablePaise)}</p>
      <p>{hi ? "अनुमान: वेतन आने की पुष्टि और बैंक बैलेंस अभी बाकी हैं। असली उपयोग में अपने खर्च दर्ज करें।" : "Estimate: salary is assumed and the bank balance is not confirmed. In your own account, record spending and confirm a closing balance."}</p>
      <Breakdown snapshot={snapshot} />
    </Card>
    <Card className="space-y-4 p-6">
      <h2 className="text-lg font-semibold">{hi ? "2. खरीदने से पहले जाँचें" : "2. Check a purchase before spending"}</h2>
      <Field label={hi ? "खरीद की रकम" : "Purchase amount"} htmlFor="sample-amount">
        <Input id="sample-amount" prefix="₹" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
      </Field>
      <div aria-live="polite">
        {result ? <p>{hi ? "खरीद के बाद शेष:" : "Left after this purchase:"} <strong>{formatINR(result.availableAfterPaise)}</strong> · {hi ? "प्रतिदिन:" : "Per day:"} {formatINR(result.dailyAfterPaise)}</p> : <p>{hi ? "शून्य से अधिक वैध रकम डालें।" : "Enter a valid amount greater than zero."}</p>}
        {result?.verdict === "no" && <p className="text-danger">{hi ? "यह खरीद सुरक्षित रखे पैसे में जाएगी।" : "This purchase would use money already reserved."}</p>}
      </div>
    </Card>
    <p>{hi ? "3. अपना खाता बनाएं, सही खर्च जोड़ें और स्टेटमेंट का प्रीव्यू जाँचें।" : "3. Create your account, add your actual commitments, and review your statement before importing."}</p>
    <div className="flex gap-6"><Link to="/signup" className="font-semibold text-brand">{hi ? "खाता बनाएं" : "Create an account"}</Link><Link to="/">{hi ? "वापस जाएं" : "Back to home"}</Link></div>
  </main>
}
