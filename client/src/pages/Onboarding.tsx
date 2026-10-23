import { t } from "../lib/i18n"
import { DateInput } from "../components/DateInput"
import { COMMITMENT_KINDS, fiftyThirtyTwenty, formatINR, isSavingsKind, monthlyPaise, parseRupeeInput, type CommitmentKind } from "@paydayly/shared"
import { useQueryClient } from "@tanstack/react-query"
import clsx from "clsx"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, ArrowRight, Check, FileUp, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { ImportDialog } from "../components/ImportDialog"
import { Logo } from "../components/Logo"
import { Button, Card, Field, Input, Select } from "../components/ui"
import { api } from "../lib/api"
import { KIND_ICON } from "../lib/categories"
import { keys, useCommitments, useMe, useProfileUpdate } from "../lib/queries"

const STEPS = ["Income", "Commitments", "Goal", "Transactions"]

const SUGGESTIONS: { name: string; kind: CommitmentKind }[] = [
  { name: "Rent", kind: "rent" },
  { name: "Home loan EMI", kind: "emi" },
  { name: "Electricity and internet", kind: "bills" },
  { name: "Mutual fund SIP", kind: "sip" },
  { name: "Emergency fund", kind: "savings" },
]

export function OnboardingPage() {
  const { data: user } = useMe()
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const update = useProfileUpdate()

  async function finish() {
    await update.mutateAsync({ onboarded: true })
    toast.success(t("You're all set"))
    navigate("/app", { replace: true })
  }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Logo />
        <button onClick={finish} className="text-[13px] font-medium text-muted hover:text-text">
          {t("Skip setup")}
        </button>
      </header>
      <div className="mx-auto max-w-xl px-6 pb-16">
        <ol className="mb-8 flex items-center gap-2">
          {STEPS.map((label, index) => (
            <li key={label} className="flex flex-1 flex-col gap-2">
              <span className={clsx("h-1.5 rounded-full transition-colors duration-500", index <= step ? "bg-brand" : "bg-line")} />
              <span className={clsx("hidden text-[12px] font-medium sm:block", index === step ? "text-text" : "text-muted")}>{label}</span>
            </li>
          ))}
        </ol>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
            {step === 0 && <IncomeStep name={user?.name ?? ""} onNext={() => setStep(1)} />}
            {step === 1 && <CommitmentsStep onBack={() => setStep(0)} onNext={() => setStep(2)} />}
            {step === 2 && <GoalStep onBack={() => setStep(1)} onNext={() => setStep(3)} />}
            {step === 3 && <ImportStep onBack={() => setStep(2)} onFinish={finish} finishing={update.isPending} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function StepTitle({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-sm text-muted">{body}</p>
    </div>
  )
}

function IncomeStep({ name, onNext }: { name: string; onNext: () => void }) {
  const { data: user } = useMe()
  const [income, setIncome] = useState(user?.profile.incomePaise ? String(user.profile.incomePaise / 100) : "")
  const [payday, setPayday] = useState(String(user?.profile.payday ?? 1))
  const update = useProfileUpdate()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const incomePaise = parseRupeeInput(income)
    if (!incomePaise || incomePaise <= 0) {
      toast.error(t("Enter your monthly take-home pay."))
      return
    }
    try {
      await update.mutateAsync({ incomePaise, payday: Number(payday) })
      onNext()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <form onSubmit={submit}>
      <StepTitle title={`Hi ${name.split(" ")[0] || "there"}, let's set up your month`} body="Start with what lands in your account each month, after tax." />
      <Card className="space-y-5 p-6">
        <Field label={t("Monthly take-home pay")} htmlFor="income" hint={t("You can change this any time in Settings.")}>
          <Input id="income" prefix="₹" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="85,000" autoFocus />
        </Field>
        <Field label={t("Salary usually arrives on")} htmlFor="payday">
          <Select id="payday" value={payday} onChange={(e) => setPayday(e.target.value)}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {t("Day")} {day} {t("of the month")}
              </option>
            ))}
          </Select>
        </Field>
      </Card>
      <div className="mt-6 flex justify-end">
        <Button type="submit" size="lg" loading={update.isPending}>
          {t("Continue")} <ArrowRight className="size-4" />
        </Button>
      </div>
    </form>
  )
}

function CommitmentsStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { data: commitments = [] } = useCommitments()
  const client = useQueryClient()
  const [name, setName] = useState("")
  const [kind, setKind] = useState<CommitmentKind>("rent")
  const [amount, setAmount] = useState("")
  const [dueDay, setDueDay] = useState("")
  const [busy, setBusy] = useState(false)

  async function save(): Promise<boolean> {
    const amountPaise = parseRupeeInput(amount)
    if (!name.trim() || !amountPaise || amountPaise <= 0) {
      toast.error(t("Add a name and an amount."))
      return false
    }
    setBusy(true)
    try {
      await api.post("/commitments", { name, kind, amountPaise, dueDay: dueDay ? Number(dueDay) : null })
      await client.invalidateQueries({ queryKey: keys.commitments })
      setName("")
      setAmount("")
      setDueDay("")
      return true
    } catch (error) {
      toast.error((error as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault()
    await save()
  }

  // Someone who typed a bill but pressed Continue instead of Add should not lose it.
  async function next() {
    if (name.trim() && parseRupeeInput(amount) && !(await save())) return
    onNext()
  }

  async function remove(id: string) {
    await api.del(`/commitments/${id}`)
    client.invalidateQueries({ queryKey: keys.commitments })
  }

  const total = commitments.reduce((sum, item) => sum + monthlyPaise(item), 0)

  return (
    <div>
      <StepTitle title={t("What leaves your account every month?")} body="Rent, EMIs, bills and the money you invest or save first. Paydayly keeps these aside before telling you what is free to spend." />
      <div className="mb-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((item) => (
          <button
            key={item.name}
            type="button"
            onClick={() => {
              setName(item.name)
              setKind(item.kind)
            }}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-muted transition-colors hover:border-brand hover:text-brand"
          >
            + {t(item.name)}
          </button>
        ))}
      </div>
      <Card className="p-5">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
          <Field label={t("Name")} htmlFor="c-name">
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Rent")} />
          </Field>
          <Field label={t("Type")}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as CommitmentKind)}>
              {COMMITMENT_KINDS.map((item) => (
                <option key={item.kind} value={item.kind}>
                  {t(item.label)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Amount per month")} htmlFor="c-amount">
            <Input id="c-amount" prefix="₹" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="22,000" />
          </Field>
          <Field label={t("Due on (optional)")}>
            <Select value={dueDay} onChange={(e) => setDueDay(e.target.value)}>
              <option value="">{t("No fixed date")}</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {t("Day")} {day}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" icon={Plus} loading={busy} className="w-full">
              {t("Add commitment")}
            </Button>
          </div>
        </form>
      </Card>

      {commitments.length > 0 && (
        <Card className="mt-4 divide-y divide-line">
          {commitments.map((item) => {
            const Icon = KIND_ICON[item.kind]
            return (
              <motion.div layout key={item.id} className="flex items-center gap-3 px-5 py-3">
                <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t(item.name)}</p>
                  <p className="text-[12px] text-muted">
                    {t(COMMITMENT_KINDS.find((k) => k.kind === item.kind)?.label)}
                    {item.dueDay ? ` - due on day ${item.dueDay}` : ""}
                  </p>
                </div>
                <span className="tabular text-sm font-semibold">{formatINR(item.amountPaise)}</span>
                <button onClick={() => remove(item.id)} className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger" aria-label={`Remove ${item.name}`}>
                  <Trash2 className="size-4" />
                </button>
              </motion.div>
            )
          })}
          <div className="flex justify-between px-5 py-3 text-sm">
            <span className="text-muted">{t("Set aside each month")}</span>
            <span className="tabular font-semibold">{formatINR(total)}</span>
          </div>
        </Card>
      )}

      <SavingsNote commitments={commitments} />

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" /> {t("Back")}
        </Button>
        <Button size="lg" onClick={next} loading={busy}>
          {commitments.length || (name.trim() && parseRupeeInput(amount)) ? t("Continue") : t("Skip for now")} <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function SavingsNote({ commitments }: { commitments: { kind: CommitmentKind; amountPaise: number }[] }) {
  const { data: user } = useMe()
  const income = user?.profile.incomePaise ?? 0
  if (!income) return null
  const needs = commitments.filter((item) => !isSavingsKind(item.kind)).reduce((sum, item) => sum + monthlyPaise(item), 0)
  const split = fiftyThirtyTwenty(income, needs)
  return (
    <p className="mt-4 rounded-xl bg-brand-soft px-4 py-3 text-[13px]">
      {t("Paydayly will keep")} {formatINR(split.savingsPaise)} {t("a month aside for savings, including any SIPs above.")} {t(split.note)} {t("You can change this in Settings.")}
    </p>
  )
}

function GoalStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const client = useQueryClient()
  const [name, setName] = useState("")
  const [target, setTarget] = useState("")
  const [monthly, setMonthly] = useState("")
  const [deadline, setDeadline] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return onNext()
    const targetPaise = parseRupeeInput(target)
    if (!targetPaise) {
      toast.error(t("Add a target amount, or leave the name empty to skip."))
      return
    }
    setBusy(true)
    try {
      await api.post("/goals", { name, targetPaise, monthlyPaise: parseRupeeInput(monthly) ?? 0, deadline: deadline || null })
      client.invalidateQueries({ queryKey: keys.goals })
      toast.success(t("Goal saved"))
      onNext()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <StepTitle title={t("Saving up for something?")} body="Optional. A goal shows you how today's choices move the finish line." />
      <Card className="grid gap-4 p-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={t("Goal")} htmlFor="g-name">
            <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Goa trip in March")} />
          </Field>
        </div>
        <Field label={t("Target")} htmlFor="g-target">
          <Input id="g-target" prefix="₹" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="40,000" />
        </Field>
        <Field label={t("Saving per month")} htmlFor="g-monthly">
          <Input id="g-monthly" prefix="₹" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="5,000" />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("Target date (optional)")} htmlFor="g-deadline">
            <DateInput id="g-deadline" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
      </Card>
      <div className="mt-6 flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" /> {t("Back")}
        </Button>
        <Button type="submit" size="lg" loading={busy}>
          {name.trim() ? t("Save goal") : t("Skip for now")} <ArrowRight className="size-4" />
        </Button>
      </div>
    </form>
  )
}

function ImportStep({ onBack, onFinish, finishing }: { onBack: () => void; onFinish: () => void; finishing: boolean }) {
  const [open, setOpen] = useState(false)
  const [imported, setImported] = useState<number | null>(null)
  return (
    <div>
      <StepTitle title={t("Bring in your transactions")} body="Download your statement from net banking (CSV, XLS or XLSX, any bank) and drop it here. Paydayly sorts spends into categories and spots recurring payments." />
      <Card className="p-6">
        {imported !== null ? (
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-brand-soft text-brand">
              <Check className="size-5" />
            </span>
            <div>
              <p className="font-medium">{imported} {t("transactions imported")}</p>
              <p className="text-[13px] text-muted">{t("You can import more statements later from any page.")}</p>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <FileUp className="mx-auto size-9 text-brand" />
            <p className="mt-3 font-medium">{t("Import a bank statement")}</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">{t("No statement handy? Skip this. You can also add spends by hand. A sample statement ships in the sample-data folder.")}</p>
            <Button className="mt-5" onClick={() => setOpen(true)} icon={FileUp}>
              {t("Choose file")}
            </Button>
          </div>
        )}
      </Card>
      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" /> {t("Back")}
        </Button>
        <Button size="lg" onClick={onFinish} loading={finishing}>
          {imported !== null ? t("Go to my dashboard") : t("Finish without importing")} <ArrowRight className="size-4" />
        </Button>
      </div>
      <ImportDialog open={open} onClose={() => setOpen(false)} onImported={(result) => setImported((n) => (n ?? 0) + result.added)} />
    </div>
  )
}
