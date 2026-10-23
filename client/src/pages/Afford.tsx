import { t } from "../lib/i18n"
import { DateInput } from "../components/DateInput"
import { formatDate, formatINR, parseRupeeInput } from "@paydayly/shared"
import clsx from "clsx"
import { AlertTriangle, CheckCircle2, CircleSlash, Info, MessageCircleQuestion, Scale } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Switch } from "../components/ui"
import { api } from "../lib/api"
import { useAiStatus, useDashboard, useGoals } from "../lib/queries"
import type { AffordResponse } from "../lib/types"

const VERDICT = {
  yes: { icon: CheckCircle2, tone: "text-ok", ring: "border-ok/30 bg-ok/5" },
  tight: { icon: AlertTriangle, tone: "text-[#b7791f]", ring: "border-accent/40 bg-accent-soft" },
  no: { icon: CircleSlash, tone: "text-danger", ring: "border-danger/30 bg-danger-soft" },
} as const

export function AffordPage() {
  const { data: dashboard } = useDashboard()
  const { data: goals } = useGoals()
  const { data: ai } = useAiStatus()
  const asOf = dashboard?.asOf ?? ""
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState("")
  const [goalId, setGoalId] = useState("")
  const [late, setLate] = useState(false)
  const [answer, setAnswer] = useState<AffordResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [question, setQuestion] = useState("")
  const [reply, setReply] = useState<{ explanation: string; source: string; note: string | null } | null>(null)

  useEffect(() => {
    if (asOf && !date) setDate(asOf)
  }, [asOf, date])

  async function check(options?: { late?: boolean }) {
    const amountPaise = parseRupeeInput(amount)
    if (!amountPaise || amountPaise <= 0) {
      toast.error(t("Enter what it costs."))
      return
    }
    setBusy(true)
    try {
      setAnswer(
        await api.post<AffordResponse>("/afford", {
          amountPaise,
          date: date || undefined,
          goalId: goalId || null,
          paydayLateDays: (options?.late ?? late) ? 5 : 0,
        }),
      )
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function ask(event: React.FormEvent) {
    event.preventDefault()
    if (!question.trim()) return
    setBusy(true)
    try {
      const res = await api.post<{ intent: string; explanation: string; source: string; note: string | null; result?: AffordResponse["result"] }>("/ai/ask", { question })
      setReply(res)
      if (res.result) {
        setAnswer({ result: res.result, basis: dashboard?.snapshot.headline.basis ?? "estimate" })
        setAmount(String(Math.round((res.result.availableBeforePaise - res.result.availableAfterPaise - res.result.extraBillsPaise) / 100) || ""))
      }
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const result = answer?.result
  const verdict = result ? VERDICT[result.verdict] : null

  return (
    <div className="space-y-6">
      <PageHeader title={t("Can I afford this?")} subtitle={t("Check a purchase against bills, savings and goals before payday.")} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <Card className="p-5" data-tour="afford-form">
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                check()
              }}
            >
              <Field label={t("What does it cost?")} htmlFor="afford-amount">
                <Input id="afford-amount" prefix="₹" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="3,000" autoFocus />
              </Field>
              <Field label={t("When would you pay?")} hint={t("Bills due before that date are counted first.")}>
                <DateInput value={date} min={asOf} onChange={(event) => setDate(event.target.value)} />
              </Field>
              {goals && goals.length > 0 && (
                <Field label={t("Take it from a goal instead?")} hint={t("Shows how much later the goal finishes.")}>
                  <Select value={goalId} onChange={(event) => setGoalId(event.target.value)}>
                    <option value="">{t("No, from spending money")}</option>
                    {goals.map((goal) => (
                      <option key={goal.id} value={goal.id}>
                        {t(goal.name)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3">
                <div>
                  <p className="text-[13px] font-medium">{t("What if payday is 5 days late?")}</p>
                  <p className="text-[12px] text-muted">{t("Stretches this cycle's money over more days.")}</p>
                </div>
                <Switch
                  checked={late}
                  label={t("Payday 5 days late")}
                  onChange={(value) => {
                    setLate(value)
                    if (answer) check({ late: value })
                  }}
                />
              </div>
              <Button type="submit" className="w-full" icon={Scale} loading={busy} data-tour="afford-check">
                {t("Check")}
              </Button>
            </form>
          </Card>
          <Card className="p-5">
            <form onSubmit={ask} className="space-y-3">
              <Field label={t("Or just ask")} hint={ai?.enabled ? t("The AI helper reads your question. Paydayly's own maths gives the numbers.") : t("Simple rules read your question.")}>
                <Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t("Can I buy ₹2,500 shoes on Saturday?")} />
              </Field>
              <Button type="submit" variant="secondary" icon={MessageCircleQuestion} loading={busy}>
                {t("Ask")}
              </Button>
              {reply && (
                <div className="rounded-2xl bg-surface-2 p-3 text-[13px]">
                  <p>{reply.explanation}</p>
                  <p className="mt-2 flex items-center gap-2">
                    <Badge tone={reply.source === "ai" ? "brand" : "neutral"}>{reply.source === "ai" ? t("Explained by AI helper") : t("Simple rules")}</Badge>
                    {reply.note && <span className="text-[12px] text-muted">{t(reply.note)}</span>}
                  </p>
                </div>
              )}
            </form>
          </Card>
        </div>

        <Card className={clsx("p-6", verdict?.ring)} data-tour="afford-result">
          {!result || !verdict ? (
            <div className="flex h-full flex-col items-center justify-center py-12 text-center text-muted">
              <Scale className="mb-3 size-8 text-brand" />
              <p className="max-w-xs text-[14px]">{t("Enter an amount to see what is left after it, which bills it would squeeze and what happens to your daily number.")}</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <verdict.icon className={clsx("mt-0.5 size-7 shrink-0", verdict.tone)} />
                <div>
                  <p className="font-display text-xl font-bold">{t(result.headline)}</p>
                  {answer?.basis === "estimate" && <p className="mt-1 text-[12px] text-muted">{t("Estimate. Confirm your balance on the dashboard for an exact answer.")}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Figure label={t("Available now")} value={formatINR(result.availableBeforePaise)} />
                <Figure label={t("Available after")} value={formatINR(result.availableAfterPaise)} danger={result.availableAfterPaise < 0} />
                <Figure label={t("Per day now")} value={formatINR(result.dailyBeforePaise)} />
                <Figure label={`Per day after, ${result.daysLeft} days`} value={formatINR(result.dailyAfterPaise)} danger={result.dailyAfterPaise <= 0} />
              </div>
              {result.extraBillsPaise > 0 && <p className="text-[13px] text-muted">{t("Includes")} {formatINR(result.extraBillsPaise)} {t("of bills due before that date.")}</p>}
              {result.underfunded.length > 0 && (
                <div>
                  <CardHeader title={t("Would leave these short")} />
                  <ul className="mt-2 space-y-1.5 text-[13px]">
                    {result.underfunded.map((item) => (
                      <li key={item.name} className="flex justify-between rounded-xl bg-danger-soft px-3 py-2 text-danger">
                        <span>
                          {t(item.name)}
                          {item.dueDate ? `, due ${formatDate(item.dueDate)}` : ""}
                        </span>
                        <span className="tabular">{formatINR(item.shortPaise)} {t("short")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.goal && result.goal.reducedByPaise > 0 && (
                <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13px]">
                  {goalId ? "" : t("This would dip into goal money: ")}
                  {t(result.goal.name)} {t("goes down by")} {formatINR(result.goal.reducedByPaise)}
                  {result.goal.monthsLater > 0 ? ` and finishes about ${result.goal.monthsLater} month${result.goal.monthsLater === 1 ? "" : "s"} later.` : "."}
                </p>
              )}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wider text-muted">
                  <Info className="size-3.5" /> {t("Assumptions")}
                </p>
                <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">
                  {result.assumptions.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function Figure({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-[12px] text-muted">{label}</p>
      <p className={clsx("mt-1 font-display text-lg font-semibold tabular", danger && "text-danger")}>{value}</p>
    </div>
  )
}
