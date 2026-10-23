import { t } from "../lib/i18n"
import { defaultBufferPaise, fiftyThirtyTwenty, formatDate, formatExactINR, formatINR, isSavingsKind, monthlyPaise, parseRupeeInput, type AccountKind } from "@paydayly/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, LogOut, Plus, RotateCcw, Trash2, Upload } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Badge, Button, Card, Field, Input, Select } from "../components/ui"
import { api } from "../lib/api"
import { keys, useAiStatus, useCommitments, useDashboard, useImports, useMe, useProfileUpdate, useRefreshAll, useSessions } from "../lib/queries"

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

export function PlanSection() {
  const { data: user } = useMe()
  const { data: commitments } = useCommitments()
  const update = useProfileUpdate()
  const [savings, setSavings] = useState("")
  const [buffer, setBuffer] = useState("")
  const income = user?.profile.incomePaise ?? 0
  const needs = (commitments ?? []).filter((item) => !isSavingsKind(item.kind)).reduce((sum, item) => sum + monthlyPaise(item), 0)
  const split = fiftyThirtyTwenty(income, needs)

  useEffect(() => {
    if (!user) return
    setSavings(user.profile.savingsTargetPaise === null ? "" : String(user.profile.savingsTargetPaise / 100))
    setBuffer(user.profile.bufferPaise === null ? "" : String(user.profile.bufferPaise / 100))
  }, [user])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    try {
      await update.mutateAsync({
        savingsTargetPaise: savings.trim() === "" ? null : parseRupeeInput(savings),
        bufferPaise: buffer.trim() === "" ? null : parseRupeeInput(buffer),
      })
      toast.success(t("Plan saved"))
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <Section title={t("Savings and buffer")} description={t("Kept aside before anything counts as available. Leave blank to use the suggestion.")}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("Save each month")} hint={`Suggested ${formatINR(split.savingsPaise)}. ${split.note}`}>
            <Input prefix="₹" inputMode="decimal" value={savings} placeholder={String(split.savingsPaise / 100)} onChange={(e) => setSavings(e.target.value)} />
          </Field>
          <Field label={t("Safety buffer")} hint={`Suggested ${formatINR(defaultBufferPaise(income))}, about 1% of salary.`}>
            <Input prefix="₹" inputMode="decimal" value={buffer} placeholder={String(defaultBufferPaise(income) / 100)} onChange={(e) => setBuffer(e.target.value)} />
          </Field>
        </div>
        <p className="text-[12px] text-muted">{t("SIPs and savings commitments count towards the savings amount, not on top of it.")}</p>
        <Button type="submit" loading={update.isPending}>
          {t("Save plan")}
        </Button>
      </form>
    </Section>
  )
}

const ACCOUNT_KINDS: { kind: AccountKind; label: string }[] = [
  { kind: "bank", label: "Bank account" },
  { kind: "cash", label: "Cash" },
  { kind: "card", label: "Credit card" },
  { kind: "loan", label: "Loan" },
]

export function AccountsSection() {
  const { data } = useDashboard()
  const refresh = useRefreshAll()
  const [name, setName] = useState("")
  const [kind, setKind] = useState<AccountKind>("bank")
  const [busy, setBusy] = useState(false)
  const accounts = data?.accounts ?? []

  async function add(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await api.post("/accounts", { name, kind, spending: kind !== "loan" })
      setName("")
      await refresh()
      toast.success(t("Account added"))
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    try {
      await api.del(`/accounts/${id}`)
      await refresh()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <Section title={t("Accounts")} description={t("Moving money between these is a transfer, not spending. Card bills count once, when you spend.")}>
      <ul className="mb-4 divide-y divide-line rounded-xl border border-line">
        {accounts.map((account) => {
          const balance = data?.snapshot.balances.find((item) => item.account.id === account.id)
          return (
            <li key={account.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {t(account.name)} {account.primary && <Badge tone="brand">{t("Main")}</Badge>}
                </p>
                <p className="text-[12px] text-muted">
                  {t(ACCOUNT_KINDS.find((item) => item.kind === account.kind)?.label)}
                  {balance?.confirmed ? ` · confirmed ${formatDate(balance.confirmed.date)}` : t(" · balance not confirmed")}
                </p>
              </div>
              {balance?.balancePaise != null && balance.confirmed && <span className="tabular">{formatExactINR(balance.balancePaise)}</span>}
              {!account.primary && (
                <button onClick={() => remove(account.id)} className="text-muted hover:text-danger" aria-label={`Remove ${account.name}`}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <Field label={t("Name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("HDFC credit card")} required />
        </Field>
        <Field label={t("Type")}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
            {ACCOUNT_KINDS.map((item) => (
              <option key={item.kind} value={item.kind}>
                {t(item.label)}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary" icon={Plus} loading={busy}>
          {t("Add")}
        </Button>
      </form>
    </Section>
  )
}

export function SessionsSection() {
  const { data: sessions } = useSessions()
  const client = useQueryClient()

  async function signOutOthers() {
    const { revoked } = await api.post<{ revoked: number }>("/auth/sessions/others/revoke")
    await client.invalidateQueries({ queryKey: keys.sessions })
    toast.success(revoked ? `Signed out ${revoked} other device${revoked === 1 ? "" : "s"}` : "No other devices were signed in")
  }

  async function revoke(id: string) {
    await api.del(`/auth/sessions/${id}`)
    await client.invalidateQueries({ queryKey: keys.sessions })
  }

  return (
    <Section title={t("Signed-in devices")} description={t("Signing a device out takes effect on its next request.")}>
      <ul className="mb-3 divide-y divide-line rounded-xl border border-line">
        {(sessions ?? []).map((session) => (
          <li key={session.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{deviceName(session.userAgent)}</p>
              <p className="text-[12px] text-muted">
                {session.ip || t("Unknown address")} {t("· last used")} {formatDate(session.lastSeenAt.slice(0, 10))}
              </p>
            </div>
            {session.current ? (
              <Badge tone="brand">{t("This device")}</Badge>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => revoke(session.id)}>
                {t("Sign out")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button size="sm" variant="secondary" icon={LogOut} onClick={signOutOthers}>
        {t("Sign out all other devices")}
      </Button>
    </Section>
  )
}

function deviceName(agent: string) {
  if (!agent) return "Unknown device"
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "Browser"
  const os = /Windows/.test(agent) ? "Windows" : /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Mac OS/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : ""
  return os ? `${browser} on ${os}` : browser
}

export function AiSection() {
  const { data: status } = useAiStatus()
  return (
    <Section title={t("AI money helper")} description={t("Ask in plain English or Hinglish, or type entries like “kal chai pe 80”. Paydayly's own maths makes every number.")}>
      <p className="rounded-xl bg-surface-2 px-3 py-2 text-[12px] text-muted">
        {status?.available
          ? t("Paydayly sends only the sentence you typed, or a short list of figures it already worked out, to our AI provider. ")
          : t("The AI money helper is unavailable right now, so Paydayly is using its own rules. ")}
        {t("Your statement, name, email and transaction history are never sent. The AI never changes your data or does the maths; if its answer contains a number Paydayly did not produce, the answer is thrown away.")}
      </p>
    </Section>
  )
}

export function BackupSection() {
  const refresh = useRefreshAll()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function restore(file: File) {
    if (!window.confirm("Restoring replaces everything in this account with the backup. Continue?")) return
    setBusy(true)
    try {
      const data = JSON.parse(await file.text())
      const { restored } = await api.post<{ restored: number }>("/restore", data)
      await refresh()
      toast.success(`Restored ${restored} records`)
    } catch (error) {
      toast.error(error instanceof SyntaxError ? "That file is not valid JSON." : (error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title={t("Backup")} description={t("A full copy of your account as JSON, including settings, goals and bills.")}>
      <div className="flex flex-wrap gap-2">
        <a href="/api/backup" download="paydayly-backup.json">
          <Button size="sm" variant="secondary" icon={Download}>
            {t("Download backup")}
          </Button>
        </a>
        <Button size="sm" variant="secondary" icon={Upload} loading={busy} onClick={() => inputRef.current?.click()}>
          {t("Restore from file")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) restore(file)
            event.target.value = ""
          }}
        />
      </div>
    </Section>
  )
}

export function ImportsSection() {
  const { data: imports } = useImports()
  const refresh = useRefreshAll()

  async function undo(id: string, filename: string) {
    if (!window.confirm(`Remove every transaction that came from ${filename}?`)) return
    try {
      const { removed } = await api.post<{ removed: number }>(`/imports/${id}/undo`)
      await refresh()
      toast.success(`Removed ${removed} transactions`)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  if (!imports?.length) return null
  return (
    <Section title={t("Import history")} description={t("Undo removes only the rows that file added.")}>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {imports.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.filename}</p>
              <p className="text-[12px] text-muted">
                {formatDate(item.createdAt.slice(0, 10))} · {item.added} {t("added,")} {item.skipped} {t("skipped")}
                {item.from && item.to ? ` · ${formatDate(item.from)} to ${formatDate(item.to)}` : ""}
              </p>
            </div>
            {item.undoneAt ? (
              <Badge tone="neutral">{t("Undone")}</Badge>
            ) : (
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => undo(item.id, item.filename)}>
                {t("Undo")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}

export function HistorySection() {
  const { data } = useQuery({
    queryKey: ["history"],
    queryFn: () => api.get<{ changes: { at: string; action: string; detail: string }[] }>("/history"),
  })
  const [all, setAll] = useState(false)
  const changes = data?.changes ?? []
  if (!changes.length) return null
  return (
    <Section title={t("Change history")} description={t("Every edit that can move your available amount.")}>
      <ul className="space-y-1.5 text-[13px]">
        {(all ? changes : changes.slice(0, 8)).map((change, index) => (
          <li key={`${change.at}-${index}`} className="flex gap-3">
            <span className="w-24 shrink-0 text-muted">{formatDate(change.at.slice(0, 10))}</span>
            <span>{t(change.detail)}</span>
          </li>
        ))}
      </ul>
      {changes.length > 8 && (
        <button onClick={() => setAll(!all)} className="mt-2 text-[12px] font-medium text-brand hover:underline">
          {all ? t("Show less") : `Show all ${changes.length}`}
        </button>
      )}
    </Section>
  )
}
