import { t } from "../lib/i18n"
import { DateInput } from "./DateInput"
import { CATEGORIES, indiaToday, parseRupeeInput, type Category } from "@paydayly/shared"
import { useState } from "react"
import { toast } from "sonner"
import { api } from "../lib/api"
import { useRefreshAll } from "../lib/queries"
import { OwedFields } from "./Money"
import { Button, Field, Input, Modal, Segmented, Select } from "./ui"

export function AddTransactionDialog({ open, onClose, asOf }: { open: boolean; onClose: () => void; asOf?: string }) {
  const today = asOf ?? indiaToday()
  const [direction, setDirection] = useState<"debit" | "credit">("debit")
  const [narration, setNarration] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(today)
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5))
  const [category, setCategory] = useState<Category | "">("")
  const [busy, setBusy] = useState(false)
  const [owed, setOwed] = useState({ on: false, who: "", amount: "", kind: "friends" as "friends" | "reimbursement" })
  const [key, setKey] = useState(() => crypto.randomUUID())
  const refresh = useRefreshAll()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const amountPaise = parseRupeeInput(amount)
    if (!amountPaise || amountPaise <= 0) {
      toast.error(t("Enter an amount above zero."))
      return
    }
    setBusy(true)
    try {
      const owedPaise = owed.on ? parseRupeeInput(owed.amount) : null
      if (owed.on && (!owedPaise || owedPaise <= 0 || owedPaise > amountPaise || !owed.who.trim())) {
        toast.error(t("Say who owes you and how much, up to the full amount."))
        return
      }
      const created = await api.postOnce<{ transaction: { id: string } }>(
        "/transactions",
        { direction, narration, amountPaise, date, time, ...(category ? { category } : {}) },
        key,
      )
      if (owed.on && owedPaise) {
        await api.post("/receivables", { txId: created.transaction.id, kind: owed.kind, counterparty: owed.who.trim(), amountPaise: owedPaise, date })
      }
      setKey(crypto.randomUUID())
      setOwed({ on: false, who: "", amount: "", kind: "friends" })
      await refresh()
      toast.success(t("Transaction added"))
      setNarration("")
      setAmount("")
      setCategory("")
      onClose()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("Add a transaction")} description={t("For cash spends or anything not in your statement yet.")}>
      <form onSubmit={submit} className="space-y-4">
        <Segmented
          value={direction}
          onChange={setDirection}
          options={[
            { value: "debit", label: "Money out" },
            { value: "credit", label: "Money in" },
          ]}
        />
        <Field label={t("Description")} htmlFor="tx-narration">
          <Input id="tx-narration" value={narration} onChange={(e) => setNarration(e.target.value)} placeholder={t("Chai at the office canteen")} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Amount")} htmlFor="tx-amount">
            <Input id="tx-amount" prefix="₹" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" required />
          </Field>
          <Field label={t("Category")}>
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              <option value="">{t("Detect for me")}</option>
              {CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("Date")} htmlFor="tx-date">
            <DateInput id="tx-date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label={t("Time")} htmlFor="tx-time">
            <Input id="tx-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
        </div>
        {direction === "debit" && <OwedFields value={owed} onChange={setOwed} />}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button type="submit" loading={busy}>
            {t("Add transaction")}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
