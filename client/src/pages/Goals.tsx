import { t } from "../lib/i18n"
import { DateInput } from "../components/DateInput"
import { formatDate, formatINR, parseRupeeInput, projectGoal, indiaToday } from "@paydayly/shared"
import { useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Minus, Pencil, Plus, Target, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Skeleton } from "../components/ui"
import { api } from "../lib/api"
import { keys, useGoals, useMe, useRefreshAll } from "../lib/queries"
import type { Goal } from "../lib/types"

function Ring({ value }: { value: number }) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(1, value))
  return (
    <svg viewBox="0 0 80 80" className="size-20 -rotate-90">
      <circle cx="40" cy="40" r={radius} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
      <motion.circle
        cx="40"
        cy="40"
        r={radius}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference * (1 - pct) }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  )
}

export function GoalsPage() {
  const { data: goals, isLoading } = useGoals()
  const { data: user } = useMe()
  const [editing, setEditing] = useState<Goal | "new" | null>(null)
  const [contributing, setContributing] = useState<Goal | null>(null)
  const asOf = user?.profile.asOfDate ?? indiaToday()

  return (
    <div>
      <PageHeader title={t("Goals")} subtitle={t("Put money aside for the things that matter.")} action={<Button icon={Plus} onClick={() => setEditing("new")}>{t("New goal")}</Button>} />
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      ) : !goals?.length ? (
        <Card>
          <EmptyState icon={Target} title={t("No goals yet")} body="A trip, a new laptop, an emergency fund. Set a target and a monthly amount and Paydayly shows when you will get there." action={<Button icon={Plus} onClick={() => setEditing("new")}>{t("Create a goal")}</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((goal, index) => {
            const ratio = goal.savedPaise / goal.targetPaise
            const projection = projectGoal(goal.targetPaise - goal.savedPaise, goal.monthlyPaise, asOf)
            const late = goal.deadline && projection.date && projection.date > goal.deadline
            return (
              <motion.div key={goal.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                <Card className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <Ring value={ratio} />
                      <span className="absolute inset-0 grid place-items-center font-display text-sm font-bold">{Math.min(100, Math.round(ratio * 100))}%</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display text-base font-semibold">{t(goal.name)}</h3>
                        <div className="flex">
                          <button onClick={() => setEditing(goal)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label={t("Edit goal")}>
                            <Pencil className="size-4" />
                          </button>
                        </div>
                      </div>
                      <p className="mt-1 text-sm tabular">
                        <span className="font-semibold">{formatINR(goal.savedPaise)}</span>
                        <span className="text-muted"> {t("of")} {formatINR(goal.targetPaise)}</span>
                      </p>
                      <p className={`mt-1 text-[12px] ${late ? "text-danger" : "text-muted"}`}>
                        {ratio >= 1
                          ? t("Reached. Well done.")
                          : projection.date
                            ? `${formatINR(goal.monthlyPaise)} a month gets you there by ${formatDate(projection.date)}${late ? `, after your ${formatDate(goal.deadline!)} target` : ""}`
                            : t("Set a monthly amount to see a finish date")}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="secondary" icon={Plus} onClick={() => setContributing(goal)} className="flex-1">
                      {t("Add money")}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
      <GoalDialog goal={editing} onClose={() => setEditing(null)} />
      <ContributionDialog goal={contributing} onClose={() => setContributing(null)} />
    </div>
  )
}

function GoalDialog({ goal, onClose }: { goal: Goal | "new" | null; onClose: () => void }) {
  const [name, setName] = useState("")
  const [target, setTarget] = useState("")
  const [saved, setSaved] = useState("")
  const [monthly, setMonthly] = useState("")
  const [deadline, setDeadline] = useState("")
  const [busy, setBusy] = useState(false)
  const refresh = useRefreshAll()
  const existing = goal && goal !== "new" ? goal : null

  useEffect(() => {
    setName(existing?.name ?? "")
    setTarget(existing ? String(existing.targetPaise / 100) : "")
    setSaved(existing ? String(existing.savedPaise / 100) : "")
    setMonthly(existing ? String(existing.monthlyPaise / 100) : "")
    setDeadline(existing?.deadline ?? "")
  }, [goal])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const body = {
      name,
      targetPaise: parseRupeeInput(target) ?? 0,
      savedPaise: parseRupeeInput(saved) ?? 0,
      monthlyPaise: parseRupeeInput(monthly) ?? 0,
      deadline: deadline || null,
    }
    setBusy(true)
    try {
      if (existing) await api.put(`/goals/${existing.id}`, body)
      else await api.post("/goals", body)
      await refresh()
      toast.success(existing ? "Goal updated" : "Goal created")
      onClose()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!existing || !confirm(`Delete "${existing.name}"?`)) return
    await api.del(`/goals/${existing.id}`)
    await refresh()
    toast.success(t("Goal deleted"))
    onClose()
  }

  return (
    <Modal open={goal !== null} onClose={onClose} title={existing ? t("Edit goal") : t("New goal")}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("Name")} htmlFor="goal-name">
          <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Emergency fund")} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Target")} htmlFor="goal-target">
            <Input id="goal-target" prefix="₹" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} required />
          </Field>
          <Field label={t("Already saved")} htmlFor="goal-saved">
            <Input id="goal-saved" prefix="₹" inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0" />
          </Field>
          <Field label={t("Per month")} htmlFor="goal-monthly">
            <Input id="goal-monthly" prefix="₹" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="0" />
          </Field>
          <Field label={t("Target date")} htmlFor="goal-deadline">
            <DateInput id="goal-deadline" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center justify-between pt-2">
          {existing ? (
            <Button type="button" variant="ghost" icon={Trash2} onClick={remove} className="text-danger hover:bg-danger-soft hover:text-danger">
              {t("Delete")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" loading={busy}>
            {existing ? t("Save changes") : t("Create goal")}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ContributionDialog({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const [amount, setAmount] = useState("")
  const [busy, setBusy] = useState(false)
  const client = useQueryClient()

  async function send(sign: 1 | -1) {
    const paise = parseRupeeInput(amount)
    if (!goal || !paise || paise <= 0) {
      toast.error(t("Enter an amount above zero."))
      return
    }
    setBusy(true)
    try {
      await api.post(`/goals/${goal.id}/contributions`, { amountPaise: sign * paise })
      await Promise.all([client.invalidateQueries({ queryKey: keys.goals }), client.invalidateQueries({ queryKey: keys.dashboard })])
      toast.success(sign > 0 ? `Added ${formatINR(paise)} to ${goal.name}` : `Took ${formatINR(paise)} out of ${goal.name}`)
      setAmount("")
      onClose()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={goal !== null} onClose={onClose} title={goal ? `Update ${goal.name}` : ""} description={t("Record money you moved into or out of this goal.")}>
      <div className="space-y-4">
        <Input prefix="₹" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2,000" autoFocus aria-label={t("Amount")} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={Minus} onClick={() => send(-1)} disabled={busy}>
            {t("Withdraw")}
          </Button>
          <Button icon={Plus} onClick={() => send(1)} loading={busy}>
            {t("Add")}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
