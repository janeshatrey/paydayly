import { t } from "../lib/i18n"
import { DateInput } from "../components/DateInput"
import { CATEGORIES, COMMITMENT_KINDS, formatINR, monthlyPaise, parseRupeeInput, type Category, type CommitmentKind, type Rule } from "@paydayly/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, Monitor, Moon, Plus, Sun, Trash2 } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { CategoryIcon } from "../components/CategoryIcon"
import { Button, Card, Field, Input, Modal, PageHeader, Select, Switch } from "../components/ui"
import { api } from "../lib/api"
import { KIND_ICON } from "../lib/categories"
import { keys, useCommitments, useMe, useProfileUpdate, useRefreshAll } from "../lib/queries"
import { useTheme, type ThemeChoice } from "../lib/theme"
import type { CommitmentItem } from "../lib/types"
import { AccountsSection, AiSection, BackupSection, HistorySection, ImportsSection, PlanSection, SessionsSection } from "./SettingsMore"

const BUDGETABLE: Category[] = ["Coffee", "Quick commerce", "Food delivery", "Shopping", "Transport", "Eating out", "Subscription", "Bills"]

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card className="grid gap-6 p-6 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="font-display text-[15px] font-semibold">{title}</h2>
        <p className="mt-1 text-[13px] text-muted">{description}</p>
      </div>
      <div>{children}</div>
    </Card>
  )
}

export function SettingsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title={t("Settings")} subtitle={t("Your income, commitments and preferences.")} />
      <ProfileSection />
      <CommitmentsSection />
      <PlanSection />
      <AccountsSection />
      <BudgetsSection />
      <PreferencesSection />
      <AiSection />
      <RulesSection />
      <ImportsSection />
      <BackupSection />
      <DataSection />
      <SessionsSection />
      <HistorySection />
    </div>
  )
}

function ProfileSection() {
  const { data: user } = useMe()
  const update = useProfileUpdate()
  const [name, setName] = useState("")
  const [income, setIncome] = useState("")
  const [payday, setPayday] = useState("1")

  useEffect(() => {
    if (!user) return
    setName(user.name)
    setIncome(user.profile.incomePaise ? String(user.profile.incomePaise / 100) : "")
    setPayday(String(user.profile.payday))
  }, [user])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    try {
      await update.mutateAsync({ name, incomePaise: parseRupeeInput(income), payday: Number(payday) })
      toast.success(t("Profile saved"))
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <Section title={t("Profile")} description={t("Your take-home pay drives the daily number.")}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Name")} htmlFor="s-name">
          <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("Email")}>
          <Input value={user?.email ?? ""} disabled />
        </Field>
        <Field label={t("Monthly take-home pay")} htmlFor="s-income" hint={t("Leave empty to use salary credits found in your statement.")}>
          <Input id="s-income" prefix="₹" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} />
        </Field>
        <Field label={t("Payday")}>
          <Select value={payday} onChange={(e) => setPayday(e.target.value)}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {t("Day")} {day}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={update.isPending}>
            {t("Save profile")}
          </Button>
        </div>
      </form>
    </Section>
  )
}

function CommitmentsSection() {
  const { data: commitments = [] } = useCommitments()
  const [editing, setEditing] = useState<CommitmentItem | "new" | null>(null)
  const total = commitments.reduce((sum, item) => sum + monthlyPaise(item), 0)
  return (
    <Section title={t("Commitments")} description={t("Fixed costs and savings that come out before anything else.")}>
      <div className="overflow-hidden rounded-xl border border-line">
        {commitments.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted">{t("No commitments yet. Add rent, EMIs, bills and SIPs.")}</p>
        ) : (
          commitments.map((item) => {
            const Icon = KIND_ICON[item.kind]
            return (
              <button key={item.id} onClick={() => setEditing(item)} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-surface-2">
                <span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-brand">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{t(item.name)}</span>
                  <span className="text-[12px] text-muted">
                    {t(COMMITMENT_KINDS.find((k) => k.kind === item.kind)?.label)}
                    {item.dueDay ? ` - day ${item.dueDay}` : ""}
                  </span>
                </span>
                <span className="text-[13px] font-semibold tabular">{formatINR(item.amountPaise)}</span>
              </button>
            )
          })
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Button size="sm" variant="secondary" icon={Plus} onClick={() => setEditing("new")}>
          {t("Add commitment")}
        </Button>
        {commitments.length > 0 && <span className="text-[13px] text-muted">{t("Total")} {formatINR(total)} {t("a month")}</span>}
      </div>
      <CommitmentDialog item={editing} onClose={() => setEditing(null)} />
    </Section>
  )
}

function CommitmentDialog({ item, onClose }: { item: CommitmentItem | "new" | null; onClose: () => void }) {
  const existing = item && item !== "new" ? item : null
  const [name, setName] = useState("")
  const [kind, setKind] = useState<CommitmentKind>("rent")
  const [amount, setAmount] = useState("")
  const [dueDay, setDueDay] = useState("")
  const [frequency, setFrequency] = useState<"monthly" | "quarterly" | "yearly">("monthly")
  const [dueMonth, setDueMonth] = useState("")
  const [busy, setBusy] = useState(false)
  const refresh = useRefreshAll()

  useEffect(() => {
    setFrequency(existing?.frequency ?? "monthly")
    setDueMonth(existing?.dueMonth ? String(existing.dueMonth) : "")
    setName(existing?.name ?? "")
    setKind(existing?.kind ?? "rent")
    setAmount(existing ? String(existing.amountPaise / 100) : "")
    setDueDay(existing?.dueDay ? String(existing.dueDay) : "")
  }, [item])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const body = { name, kind, amountPaise: parseRupeeInput(amount) ?? 0, dueDay: dueDay ? Number(dueDay) : null, frequency, dueMonth: frequency === "monthly" || !dueMonth ? null : Number(dueMonth) }
    setBusy(true)
    try {
      if (existing) await api.put(`/commitments/${existing.id}`, body)
      else await api.post("/commitments", body)
      await refresh()
      toast.success(t("Commitment saved"))
      onClose()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!existing) return
    await api.del(`/commitments/${existing.id}`)
    await refresh()
    toast.success(t("Commitment removed"))
    onClose()
  }

  return (
    <Modal open={item !== null} onClose={onClose} title={existing ? t("Edit commitment") : t("Add commitment")}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("Name")} htmlFor="cm-name">
          <Input id="cm-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Type")}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as CommitmentKind)}>
              {COMMITMENT_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {t(k.label)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Amount")} htmlFor="cm-amount">
            <Input id="cm-amount" prefix="₹" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("How often")} hint={frequency === "monthly" ? undefined : t("Paydayly sets a share aside every month.")}>
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
              <option value="monthly">{t("Every month")}</option>
              <option value="quarterly">{t("Every 3 months")}</option>
              <option value="yearly">{t("Once a year")}</option>
            </Select>
          </Field>
          {frequency !== "monthly" && (
            <Field label={t("Next due in")}>
              <Select value={dueMonth} onChange={(e) => setDueMonth(e.target.value)}>
                <option value="">{t("Not sure")}</option>
                {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((month, index) => (
                  <option key={month} value={index + 1}>
                    {month}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label={t("Due day")} hint={t("Used for bill reminders.")}>
          <Select value={dueDay} onChange={(e) => setDueDay(e.target.value)}>
            <option value="">{t("No fixed date")}</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {t("Day")} {day}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center justify-between pt-2">
          {existing ? (
            <Button type="button" variant="ghost" icon={Trash2} onClick={remove} className="text-danger hover:bg-danger-soft hover:text-danger">
              {t("Remove")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" loading={busy}>
            {t("Save")}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function BudgetsSection() {
  const { data } = useQuery({ queryKey: keys.budgets, queryFn: () => api.get<{ budgets: { category: Category; limitPaise: number }[] }>("/budgets") })
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const refresh = useRefreshAll()
  const client = useQueryClient()

  useEffect(() => {
    if (!data) return
    setValues(Object.fromEntries(data.budgets.map((b) => [b.category, String(b.limitPaise / 100)])))
  }, [data])

  async function save() {
    const budgets = BUDGETABLE.map((category) => ({ category, limitPaise: parseRupeeInput(values[category] ?? "") ?? 0 })).filter((b) => b.limitPaise > 0)
    setBusy(true)
    try {
      await api.put("/budgets", { budgets })
      await Promise.all([client.invalidateQueries({ queryKey: keys.budgets }), refresh()])
      toast.success(t("Budgets saved"))
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title={t("Category limits")} description={t("Optional monthly caps. You get a notification when one is crossed.")}>
      <div className="grid gap-3 sm:grid-cols-2">
        {BUDGETABLE.map((category) => (
          <div key={category} className="flex items-center gap-3">
            <CategoryIcon category={category} size="sm" />
            <span className="w-28 shrink-0 text-[13px]">{category}</span>
            <Input prefix="₹" inputMode="decimal" placeholder={t("No limit")} value={values[category] ?? ""} onChange={(e) => setValues({ ...values, [category]: e.target.value })} className="h-9" aria-label={`${category} limit`} />
          </div>
        ))}
      </div>
      <Button className="mt-4" onClick={save} loading={busy}>
        {t("Save limits")}
      </Button>
    </Section>
  )
}

function PreferencesSection() {
  const { data: user } = useMe()
  const update = useProfileUpdate()
  const { theme, setTheme } = useTheme()
  const [reviewDate, setReviewDate] = useState("")

  useEffect(() => setReviewDate(user?.profile.asOfDate ?? ""), [user])

  if (!user) return null
  const profile = user.profile

  function changeTheme(value: ThemeChoice) {
    setTheme(value)
    update.mutate({ theme: value })
  }

  return (
    <Section title={t("Preferences")} description={t("How Paydayly looks and how it spreads your money.")}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium">{t("Appearance")}</p>
            <p className="text-[12px] text-muted">{t("Follow your device, or pick one.")}</p>
          </div>
          <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
            {[
              { value: "light" as const, icon: Sun, label: "Light" },
              { value: "dark" as const, icon: Moon, label: "Dark" },
              { value: "system" as const, icon: Monitor, label: "System" },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => changeTheme(option.value)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${theme === option.value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}
              >
                <option.icon className="size-3.5" /> {t(option.label)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
          <div>
            <p className="text-[13px] font-medium">{t("Give weekends more room")}</p>
            <p className="text-[12px] text-muted">{t("Saturdays and Sundays get a bigger share of the pool.")}</p>
          </div>
          <Switch checked={profile.weekendWeighted} onChange={(value) => update.mutate({ weekendWeighted: value })} label={t("Weekend weighting")} />
        </div>
        {profile.weekendWeighted && (
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1.1}
              max={2}
              step={0.1}
              defaultValue={profile.weekendWeight}
              onMouseUp={(e) => update.mutate({ weekendWeight: Number((e.target as HTMLInputElement).value) })}
              onTouchEnd={(e) => update.mutate({ weekendWeight: Number((e.target as HTMLInputElement).value) })}
              onKeyUp={(e) => update.mutate({ weekendWeight: Number((e.target as HTMLInputElement).value) })}
              className="flex-1 accent-[var(--brand)]"
              aria-label={t("Weekend weight")}
            />
            <span className="w-24 text-right text-[13px] tabular text-muted">{profile.weekendWeight.toFixed(1)}{t("x a weekday")}</span>
          </div>
        )}

        <div className="border-t border-line pt-5">
          <p className="text-[13px] font-medium">{t("Review a past date")}</p>
          <p className="text-[12px] text-muted">{t("Shows every screen as if today were this date. Handy after importing an older statement.")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <DateInput value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} className="w-44" aria-label={t("Review date")} />
            <Button variant="secondary" onClick={() => update.mutate({ asOfDate: reviewDate || null }, { onSuccess: () => toast.success(reviewDate ? "Review date set" : "Using today") })}>
              {t("Apply")}
            </Button>
            {profile.asOfDate && (
              <Button variant="ghost" onClick={() => update.mutate({ asOfDate: null }, { onSuccess: () => toast.success(t("Back to today")) })}>
                {t("Use today")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Section>
  )
}

function RulesSection() {
  const { data } = useQuery({ queryKey: keys.rules, queryFn: () => api.get<{ rules: Rule[] }>("/rules") })
  const client = useQueryClient()
  const [pattern, setPattern] = useState("")
  const [category, setCategory] = useState<Category>("Eating out")

  async function add(event: React.FormEvent) {
    event.preventDefault()
    try {
      const result = await api.post<{ updated: number }>("/rules", { pattern, category })
      setPattern("")
      client.invalidateQueries({ queryKey: keys.rules })
      client.invalidateQueries({ queryKey: ["transactions"] })
      client.invalidateQueries({ queryKey: keys.dashboard })
      toast.success(result.updated ? `Rule added and applied to ${result.updated} transactions` : "Rule added")
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  async function remove(id: string) {
    await api.del(`/rules/${id}`)
    client.invalidateQueries({ queryKey: keys.rules })
  }

  return (
    <Section title={t("Category rules")} description={t("When a narration contains this text, Paydayly uses your category. Rules are also created when you recategorise with 'apply to similar'.")}>
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder={t("e.g. THIRD WAVE")} aria-label={t("Text to match")} />
        <Select value={category} onChange={(e) => setCategory(e.target.value as Category)} className="sm:w-48" aria-label={t("Category")}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" icon={Plus} disabled={pattern.trim().length < 2}>
          {t("Add")}
        </Button>
      </form>
      {data?.rules.length ? (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {data.rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[12px]">{rule.pattern}</code>
              <span className="text-muted">{t("becomes")}</span>
              <span className="flex-1 font-medium">{rule.category}</span>
              <button onClick={() => remove(rule.id)} className="rounded-lg p-1 text-muted hover:bg-danger-soft hover:text-danger" aria-label={t("Delete rule")}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  )
}

function DataSection() {
  const [clearOpen, setClearOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const refresh = useRefreshAll()
  const client = useQueryClient()
  const navigate = useNavigate()

  async function clearData() {
    setBusy(true)
    try {
      await api.del("/data")
      await refresh()
      toast.success(t("All transactions removed"))
      setClearOpen(false)
    } finally {
      setBusy(false)
    }
  }

  async function deleteAccount(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await api.del("/account", { password })
      client.clear()
      toast.success(t("Your account has been deleted"))
      navigate("/", { replace: true })
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title={t("Your data")} description={t("Everything is stored in your own Paydayly database.")}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
          <div>
            <p className="text-[13px] font-medium">{t("Export transactions")}</p>
            <p className="text-[12px] text-muted">{t("Download everything as a CSV file.")}</p>
          </div>
          <a href="/api/transactions/export" download="paydayly-transactions.csv">
            <Button size="sm" variant="secondary" icon={Download}>
              {t("Export")}
            </Button>
          </a>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
          <div>
            <p className="text-[13px] font-medium">{t("Clear transactions")}</p>
            <p className="text-[12px] text-muted">{t("Removes imported and added transactions. Settings and goals stay.")}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setClearOpen(true)}>
            {t("Clear")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger-soft/40 px-4 py-3">
          <div>
            <p className="text-[13px] font-medium text-danger">{t("Delete account")}</p>
            <p className="text-[12px] text-muted">{t("Permanently removes your account and all data.")}</p>
          </div>
          <Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}>
            {t("Delete account")}
          </Button>
        </div>
      </div>

      <Modal open={clearOpen} onClose={() => setClearOpen(false)} title={t("Clear all transactions?")} description={t("This cannot be undone. You can re-import your statements afterwards.")}>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setClearOpen(false)}>
            {t("Cancel")}
          </Button>
          <Button variant="danger" onClick={clearData} loading={busy}>
            {t("Clear transactions")}
          </Button>
        </div>
      </Modal>
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t("Delete your account?")} description={t("Enter your password to confirm. Everything will be erased.")}>
        <form onSubmit={deleteAccount} className="space-y-4">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("Password")} autoComplete="current-password" required aria-label={t("Password")} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              {t("Delete forever")}
            </Button>
          </div>
        </form>
      </Modal>
    </Section>
  )
}
