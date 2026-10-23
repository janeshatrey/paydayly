import { t } from "../lib/i18n"
import { DateInput } from "./DateInput"
import { formatDate, formatINR, parseRupeeInput, type Snapshot } from "@paydayly/shared"
import clsx from "clsx"
import { Check, ChevronDown, HandCoins, Landmark, Loader2, MessageSquareText, SkipForward, Sparkles, Undo2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { api } from "../lib/api"
import { KIND_ICON } from "../lib/categories"
import { useAiStatus, useRefreshAll } from "../lib/queries"
import type { Dashboard, Draft } from "../lib/types"
import { VoiceInput } from "./VoiceInput"
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Segmented, Select } from "./ui"

const KIND_NOTE = {
  actual: "Actual",
  planned: "Kept aside",
  estimate: "Estimate",
  expected: "Expected",
} as const

export function Breakdown({ snapshot, dark }: { snapshot: Snapshot; dark?: boolean }) {
  const [open, setOpen] = useState(false)
  const { headline } = snapshot
  return (
    <div data-tour="breakdown">
      <button
        type="button"
        aria-expanded={open}
        data-tour="breakdown-toggle"
        onClick={() => setOpen((value) => !value)}
        className={clsx("inline-flex items-center gap-1 text-[13px] font-medium", dark ? "text-white/80 hover:text-white" : "text-brand")}
      >
        {t("How we got this")} <ChevronDown className={clsx("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className={clsx("mt-3 space-y-1.5 rounded-2xl p-3 text-[13px]", dark ? "bg-white/[0.06]" : "bg-surface-2")}>
          {headline.lines.map((line) => (
            <li key={line.label} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                {t(line.label)}
                <span className={clsx("ml-2 text-[11px]", dark ? "text-white/50" : "text-muted")}>{line.note ?? KIND_NOTE[line.kind]}</span>
              </span>
              <span className="shrink-0 tabular">{line.paise < 0 ? `− ${formatINR(-line.paise)}` : formatINR(line.paise)}</span>
            </li>
          ))}
          <li className={clsx("flex justify-between border-t pt-1.5 font-semibold", dark ? "border-white/10" : "border-line")}>
            <span>{t("Available for discretionary spending")}</span>
            <span className="tabular">{formatINR(headline.availablePaise)}</span>
          </li>
        </ul>
      )}
    </div>
  )
}

export function ConfirmBalanceDialog({ open, onClose, data }: { open: boolean; onClose: () => void; data: Dashboard }) {
  const spending = data.accounts.filter((account) => account.kind !== "loan")
  const [accountId, setAccountId] = useState(spending.find((account) => account.primary)?.id ?? spending[0]?.id ?? "")
  const [amount, setAmount] = useState("")
  const [busy, setBusy] = useState(false)
  const refresh = useRefreshAll()
  const account = spending.find((item) => item.id === accountId)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const paise = parseRupeeInput(amount)
    if (paise === null) {
      toast.error(t("Enter the balance your bank app shows."))
      return
    }
    setBusy(true)
    try {
      await api.post(`/accounts/${accountId}/confirm`, { balancePaise: account?.kind === "card" ? -Math.abs(paise) : paise })
      await refresh()
      toast.success(t("Balance confirmed. Figures now start from it."))
      setAmount("")
      onClose()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("Confirm your balance")} description={t("Optional. Type what your bank app shows right now and Paydayly will work from real money instead of an estimate.")}>
      <form onSubmit={submit} className="space-y-4">
        {spending.length > 1 && (
          <Field label={t("Account")}>
            <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {spending.map((item) => (
                <option key={item.id} value={item.id}>
                  {t(item.name)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={account?.kind === "card" ? t("Amount you owe on the card") : t("Balance today")} hint={t("Payments already in Paydayly after today are added on top automatically.")}>
          <Input prefix="₹" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("Not now")}
          </Button>
          <Button type="submit" loading={busy}>
            {t("Confirm balance")}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

const STATUS_TONE: Record<string, "neutral" | "brand" | "warn" | "danger"> = {
  paid: "brand",
  skipped: "neutral",
  "due-today": "warn",
  overdue: "danger",
  upcoming: "neutral",
}

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  skipped: "Skipped",
  "due-today": "Due today",
  overdue: "Looks overdue",
  upcoming: "Upcoming",
}

export function BillsCard({ data }: { data: Dashboard }) {
  const refresh = useRefreshAll()
  const [busy, setBusy] = useState<string | null>(null)
  const bills = data.snapshot.bills
  const recurring = data.upcoming.filter((item) => item.source === "recurring").slice(0, 3)

  async function mark(id: string, status: "paid" | "skipped" | "unpaid") {
    setBusy(id)
    try {
      await api.post(`/bills/${id}/mark`, { status })
      await refresh()
      toast.success(status === "paid" ? "Marked as paid" : status === "skipped" ? "Skipped for this cycle" : "Back to unpaid")
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="h-full">
      <CardHeader title={t("Bills this cycle")} subtitle={t("Payday to payday. Mark one paid if your statement has not caught up.")} />
      {bills.length === 0 && recurring.length === 0 ? (
        <p className="px-5 py-8 text-[13px] text-muted">{t("Add rent, EMIs, SIPs and bills in Settings to track them here.")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {bills.map((bill) => {
            const Icon = KIND_ICON[bill.kind] ?? Landmark
            const done = bill.status === "paid" || bill.status === "skipped"
            return (
              <li key={bill.id} className="flex items-center gap-3 px-5 py-3">
                <span className="grid size-9 place-items-center rounded-xl bg-surface-2 text-muted">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{t(bill.name)}</p>
                  <p className="text-[12px] text-muted">
                    {formatINR(bill.status === "paid" && bill.actualPaise ? bill.actualPaise : bill.plannedPaise)}
                    {bill.dueDate ? ` · ${formatDate(bill.dueDate)}` : ""}
                    {bill.periodic ? ` · setting aside ${formatINR(bill.reservedPaise)}` : ""}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[bill.status]}>{STATUS_LABEL[bill.status]}</Badge>
                <div className="flex gap-1">
                  {busy === bill.id ? (
                    <Loader2 className="size-4 animate-spin text-muted" />
                  ) : done ? (
                    <IconButton label={t("Undo")} icon={Undo2} onClick={() => mark(bill.id, "unpaid")} />
                  ) : (
                    <>
                      <IconButton label={t("Mark paid")} icon={Check} onClick={() => mark(bill.id, "paid")} />
                      <IconButton label={t("Skip this cycle")} icon={SkipForward} onClick={() => mark(bill.id, "skipped")} />
                    </>
                  )}
                </div>
              </li>
            )
          })}
          {recurring.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
              <span className="min-w-0 flex-1 truncate">{t(item.name)}</span>
              <span className="text-muted">{formatDate(item.date)}</span>
              <span className="font-medium tabular">{formatINR(item.amountPaise)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function IconButton({ label, icon: Icon, onClick }: { label: string; icon: typeof Check; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text">
      <Icon className="size-4" />
    </button>
  )
}

export function ReceivablesCard({ data }: { data: Dashboard }) {
  const refresh = useRefreshAll()
  const { receivables, settlementSuggestions } = data.snapshot
  const open = receivables.open
  if (open.length === 0 && settlementSuggestions.length === 0) return null

  async function settle(receivableId: string, txId: string | null) {
    try {
      await api.post(`/receivables/${receivableId}/settle`, { txId })
      await refresh()
      toast.success(t("Settled. It now counts as money you have."))
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  async function writeOff(receivableId: string) {
    try {
      await api.post(`/receivables/${receivableId}/write-off`)
      await refresh()
      toast(t("Written off"))
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <Card data-tour="owed">
      <CardHeader
        title={t("Money owed back to you")}
        subtitle={`${formatINR(receivables.openPaise)} expected${receivables.pendingRefundPaise ? `, plus ${formatINR(receivables.pendingRefundPaise)} in refunds` : ""}. Not counted as available until it arrives.`}
        action={<HandCoins className="size-4 text-muted" />}
      />
      {settlementSuggestions.length > 0 && (
        <div className="mx-5 mt-4 space-y-2 rounded-2xl bg-brand-soft p-3">
          {settlementSuggestions.map((item) => (
            <div key={`${item.receivableId}-${item.txId}`} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span>
                <Sparkles className="mr-1 inline size-3.5 text-brand" />
                {t(item.reason)}
              </span>
              <Button size="sm" onClick={() => settle(item.receivableId, item.txId)}>
                {t("Yes, that is")} {item.counterparty}
              </Button>
            </div>
          ))}
        </div>
      )}
      <ul className="mt-3 divide-y divide-line">
        {open.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.counterparty}</p>
              <p className="text-[12px] text-muted">
                {item.kind === "refund" ? t("Refund") : item.kind === "reimbursement" ? t("Reimbursement") : t("Split with friends")} · {formatDate(item.date)}
              </p>
            </div>
            <span className="font-semibold tabular">{formatINR(item.amountPaise - item.settledPaise)}</span>
            <Button size="sm" variant="secondary" onClick={() => settle(item.id, null)}>
              {t("Received")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => writeOff(item.id)}>
              {t("Write off")}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function QuickEntry() {
  const refresh = useRefreshAll()
  const { data: ai } = useAiStatus()
  const [text, setText] = useState("")
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [source, setSource] = useState<"ai" | "rules">("rules")
  const [busy, setBusy] = useState(false)
  // One key per batch of drafts: stops a double tap from adding twice without blocking two genuine "chai 80" entries.
  const [batch, setBatch] = useState(() => crypto.randomUUID())

  async function read(event: React.FormEvent | null, spoken?: string) {
    event?.preventDefault()
    const note = (spoken ?? text).trim()
    if (!note) return
    setBusy(true)
    try {
      const res = await api.post<{ drafts: Draft[]; source: "ai" | "rules" }>("/ai/parse", { text: note })
      if (res.drafts.length === 0) toast(t("No amounts found. Try “chai 80, auto 150”."))
      setDrafts(res.drafts)
      setSource(res.source)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!drafts?.length) return
    setBusy(true)
    try {
      for (const [index, draft] of drafts.entries()) {
        await api.postOnce("/transactions", { ...draft, time: "12:00" }, `${batch}-${index}`)
      }
      await refresh()
      toast.success(`Added ${drafts.length} ${drafts.length === 1 ? "entry" : "entries"}`)
      setDrafts(null)
      setText("")
      setBatch(crypto.randomUUID())
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5" data-tour="quick">
      <form onSubmit={(event) => read(event)} className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <Input data-tour="quick-input" value={text} onChange={(event) => setText(event.target.value)} placeholder={t("Kal chai pe 80 aur auto pe 150")} aria-label={t("Quick add spends")} />
        </div>
        <VoiceInput
          disabled={busy}
          onTranscript={(spoken) => {
            setText(spoken)
            void read(null, spoken)
          }}
        />
        <Button type="submit" variant="secondary" icon={MessageSquareText} loading={busy && !drafts}>
          {t("Read it")}
        </Button>
      </form>
      <p className="mt-2 text-[12px] text-muted">
        {t("Type or speak your spends the way you would say them, in English or Hindi. Nothing is saved until you check it.")}
        {ai?.enabled ? t(" The AI helper reads it; amounts must match what you typed.") : ""}
      </p>
      {drafts && drafts.length > 0 && (
        <div className="mt-4 space-y-2">
          {drafts.map((draft, index) => (
            <div key={index} className="grid grid-cols-[1fr_7rem_8rem_auto] items-center gap-2">
              <Input value={draft.narration} onChange={(event) => setDrafts(drafts.map((item, i) => (i === index ? { ...item, narration: event.target.value } : item)))} />
              <Input
                prefix="₹"
                value={String(draft.amountPaise / 100)}
                onChange={(event) => setDrafts(drafts.map((item, i) => (i === index ? { ...item, amountPaise: parseRupeeInput(event.target.value) ?? 0 } : item)))}
              />
              <DateInput value={draft.date} onChange={(event) => setDrafts(drafts.map((item, i) => (i === index ? { ...item, date: event.target.value } : item)))} />
              <button className="text-[12px] text-muted hover:text-danger" onClick={() => setDrafts(drafts.filter((_, i) => i !== index))}>
                {t("Remove")}
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <Badge tone={source === "ai" ? "brand" : "neutral"}>{source === "ai" ? t("Read by AI helper") : t("Read by simple rules")}</Badge>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setDrafts(null)}>
                {t("Cancel")}
              </Button>
              <Button size="sm" loading={busy} onClick={save}>
                {t("Add")} {drafts.length}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

export function WhyChanged() {
  const [state, setState] = useState<{ explanation: string; source: string } | null>(null)
  const [busy, setBusy] = useState(false)
  async function ask() {
    setBusy(true)
    try {
      setState(await api.get<{ explanation: string; source: string }>("/ai/explain-change"))
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="text-[13px]">
      {state ? (
        <p className="text-white/80">{state.explanation}</p>
      ) : (
        <button onClick={ask} className="font-medium text-white/80 hover:text-white" disabled={busy}>
          {busy ? t("Checking…") : t("Why did this change?")}
        </button>
      )}
    </div>
  )
}

export function OwedFields({
  value,
  onChange,
}: {
  value: { on: boolean; who: string; amount: string; kind: "friends" | "reimbursement" }
  onChange: (value: { on: boolean; who: string; amount: string; kind: "friends" | "reimbursement" }) => void
}) {
  return (
    <div className="rounded-2xl border border-line p-3">
      <label className="flex items-center gap-2 text-[13px] font-medium" data-tour="owed-toggle">
        <input type="checkbox" checked={value.on} onChange={(event) => onChange({ ...value, on: event.target.checked })} />
        {t("Someone owes me part of this")}
      </label>
      {value.on && (
        <div className="mt-3 space-y-3">
          <Segmented
            value={value.kind}
            onChange={(kind) => onChange({ ...value, kind })}
            options={[
              { value: "friends", label: "Friends split" },
              { value: "reimbursement", label: "Office claim" },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input value={value.who} onChange={(event) => onChange({ ...value, who: event.target.value })} placeholder={t("Who")} />
            <Input prefix="₹" inputMode="decimal" value={value.amount} onChange={(event) => onChange({ ...value, amount: event.target.value })} placeholder={t("Their share")} />
          </div>
          <p className="text-[12px] text-muted">{t("The full amount still leaves your account today. Their share only counts once it comes back.")}</p>
        </div>
      )}
    </div>
  )
}
