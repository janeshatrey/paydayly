import { t } from "../lib/i18n"
import { formatDate, formatINR } from "@paydayly/shared"
import { useQueryClient } from "@tanstack/react-query"
import clsx from "clsx"
import { motion } from "framer-motion"
import { FileUp, Flag, Plus, Repeat, Scale, Sparkles, Target, TrendingDown, TrendingUp, Wallet, X } from "lucide-react"
import { useState } from "react"
import { Link, useOutletContext } from "react-router-dom"
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { toast } from "sonner"
import { AnimatedRupees } from "../components/AnimatedNumber"
import type { ShellContext } from "../components/AppShell"
import { CategoryIcon } from "../components/CategoryIcon"
import { LoadError } from "../components/ErrorBoundary"
import { BillsCard, Breakdown, ConfirmBalanceDialog, QuickEntry, ReceivablesCard, WhyChanged } from "../components/Money"
import { Badge, Button, Card, CardHeader, EmptyState, Progress, Skeleton } from "../components/ui"
import { api } from "../lib/api"
import { CATEGORY_STYLE } from "../lib/categories"
import { compactINR } from "../lib/money"
import { keys, useDashboard, useMe } from "../lib/queries"
import type { Dashboard } from "../lib/types"

const rise = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } }),
}

function Section({ index, className, children }: { index: number; className?: string; children: React.ReactNode }) {
  return (
    <motion.div custom={index} variants={rise} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  )
}

export function DashboardPage() {
  const { data, isLoading, error, refetch } = useDashboard()
  const { data: user } = useMe()
  const shell = useOutletContext<ShellContext>()

  if (error && !data) return <LoadError error={error} onRetry={() => refetch()} />
  if (isLoading || !data) return <DashboardSkeleton />

  const firstName = user?.name.split(" ")[0] ?? ""
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()))
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {user?.profile.asOfDate ? `Reviewing as of ${formatDate(data.asOf)}` : `Here is where ${new Intl.DateTimeFormat("en-IN", { month: "long" }).format(new Date(data.asOf))} stands.`}
          </p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <Button variant="secondary" icon={Plus} onClick={shell.openAdd} data-tour="add">
            {t("Add")}
          </Button>
          <Button icon={FileUp} onClick={shell.openImport}>
            {t("Import")}
          </Button>
        </div>
      </div>

      <Section index={0}>
        <Hero data={data} />
      </Section>
      <Section index={1}>
        <QuickEntry />
      </Section>

      {data.empty ? (
        <Section index={1}>
          <Card>
            <EmptyState
              icon={FileUp}
              title={t("No transactions yet")}
              body="Import a bank statement (CSV, XLS or XLSX; review before importing), or add today's spends by hand. Charts, recurring payments and alerts appear as soon as there is data."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button icon={FileUp} onClick={shell.openImport}>
                    {t("Import statement")}
                  </Button>
                  <Button variant="secondary" icon={Plus} onClick={shell.openAdd}>
                    {t("Add a transaction")}
                  </Button>
                </div>
              }
            />
          </Card>
        </Section>
      ) : (
        <>
          <Section index={1}>
            <Stats data={data} />
          </Section>
          <div className="grid gap-6 lg:grid-cols-3">
            <Section index={2} className="lg:col-span-2">
              <TrendCard data={data} />
            </Section>
            <Section index={3}>
              <CategoryCard data={data} />
            </Section>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Section index={4}>
              <BillsCard data={data} />
            </Section>
            <Section index={5}>
              <FlagsCard data={data} />
            </Section>
            <Section index={6}>
              <BudgetsGoalsCard data={data} />
            </Section>
          </div>
          <Section index={7}>
            <ReceivablesCard data={data} />
          </Section>
          {data.recurring.length > 0 && (
            <Section index={7}>
              <RecurringCard data={data} />
            </Section>
          )}
        </>
      )}
    </div>
  )
}

function Hero({ data }: { data: Dashboard }) {
  const { snapshot } = data
  const { budget, headline, freshness } = snapshot
  const [confirming, setConfirming] = useState(false)
  if (!snapshot.hasIncome && !snapshot.confirmed) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={Wallet}
          title={snapshot.salary.status === "late" ? t("Payday has passed but no salary is in your data yet") : t("Add your monthly income to get started")}
          body={snapshot.salary.status === "late" ? snapshot.salary.note : "Paydayly needs your take-home pay to work out what you can spend before payday."}
          action={
            <Link to="/app/settings">
              <Button>{t("Check income")}</Button>
            </Link>
          }
        />
      </Card>
    )
  }

  const estimate = headline.basis === "estimate"
  const used = budget.budgetPaise > 0 ? budget.spentTodayPaise / budget.budgetPaise : budget.spentTodayPaise > 0 ? 1 : 0
  const tone = budget.over ? "danger" : used > 0.75 ? "warn" : "brand"

  return (
    <div data-tour="headline" className="relative overflow-hidden rounded-3xl bg-[#0b1f33] p-6 text-white shadow-xl sm:p-8 dark:bg-[#102a44]">
      <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-[#2bb894]/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-[#e8a33d]/15 blur-3xl" />
      <div className="relative grid gap-8 md:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-medium uppercase tracking-wider text-white/60">{t("Available for discretionary spending")}</p>
            {estimate && <span className="rounded-full bg-[#e8a33d]/20 px-2 py-0.5 text-[11px] font-medium text-[#f5c77e]">{t("Estimate")}</span>}
          </div>
          <AnimatedRupees value={Math.max(Math.round(headline.availablePaise / 100), 0)} className="mt-2 block font-display text-5xl font-bold tracking-tight tabular sm:text-6xl" />
          <p className="mt-2 text-[13px] text-white/60">
            {t("Until payday on")} {formatDate(snapshot.cycle.nextPayday)}. {t(freshness.note)} {freshness.balanceNote}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Breakdown snapshot={snapshot} dark />
            <WhyChanged />
          </div>
          {!snapshot.confirmed && data.accounts.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-[13px]">
              <span className="flex-1 text-white/80">{t("Confirm yesterday's closing balance and keep your payments up to date.")}</span>
              <button onClick={() => setConfirming(true)} className="rounded-xl bg-white px-3 py-1.5 text-[13px] font-semibold text-[#0b1f33] hover:bg-white/90">
                {t("Confirm balance")}
              </button>
            </div>
          )}
          {snapshot.confirmed && (
            <button onClick={() => setConfirming(true)} className="mt-3 text-[12px] text-white/60 underline-offset-2 hover:underline">
              {t("Update balance")}
            </button>
          )}
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <p className="text-[11px] uppercase tracking-wider text-white/55">{t("Safe for today")}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular">{formatINR(budget.usedUp ? 0 : budget.budgetPaise)}</p>
            <p className="mt-1 text-[12px] text-white/65">{budget.usedUp ? t("Nothing left for discretionary spending this cycle.") : snapshot.night ?? snapshot.morning}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className={clsx("h-full rounded-full", tone === "danger" ? "bg-[#ef6f68]" : tone === "warn" ? "bg-[#e8a33d]" : "bg-[#6fdcbc]")}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(used, 1) * 100}%` }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[12px] text-white/60">
              <span>{formatINR(budget.spentTodayPaise)} {t("spent today")}</span>
              <span>{budget.over ? `${formatINR(-budget.remainingPaise)} over` : `${formatINR(budget.remainingPaise)} left`}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HeroStat label={t("Days to payday")} value={String(budget.daysLeft)} />
            <HeroStat label={t("Tomorrow")} value={budget.tomorrow.cycleEnded ? "Payday" : formatINR(budget.tomorrow.budgetPaise)} />
          </div>
          <Link to="/app/afford" className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-[14px] font-semibold text-[#0b1f33] hover:bg-white/90">
            {t("Can I afford this?")} <Scale className="size-4" />
          </Link>
        </div>
      </div>
      <ConfirmBalanceDialog open={confirming} onClose={() => setConfirming(false)} data={data} />
    </div>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur">
      <p className="text-[11px] uppercase tracking-wider text-white/55">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold tabular">{value}</p>
    </div>
  )
}

function Stats({ data }: { data: Dashboard }) {
  const { snapshot } = data
  const { comparison } = snapshot
  const change = comparison.previousPaise && comparison.previousPaise > 0 ? (comparison.thisPaise - comparison.previousPaise) / comparison.previousPaise : null
  const items = [
    { label: "Salary this cycle", value: formatINR(snapshot.incomePaise), note: snapshot.salary.note || snapshot.incomeNote },
    { label: "Kept aside", value: formatINR(snapshot.fixedPaise + snapshot.savingsPaise + snapshot.goalsPaise + snapshot.bufferPaise), note: "Bills, savings, goals and buffer" },
    {
      label: "Spent so far",
      value: formatINR(comparison.thisPaise),
      note: change === null ? "Day-to-day spending this cycle" : `${change > 0 ? "Up" : "Down"} ${Math.abs(Math.round(change * 100))}% on ${comparison.previousLabel}`,
      trend: change === null ? null : change > 0 ? "up" : "down",
    },
    {
      label: "Projected at payday",
      value: snapshot.forecast ? formatINR(snapshot.forecast.medianPaise) : "Not enough data",
      note: snapshot.forecast ? `Likely ${compactINR(snapshot.forecast.p10Paise)} to ${compactINR(snapshot.forecast.p90Paise)}` : snapshot.forecastNote,
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="p-4">
          <p className="text-[12px] font-medium text-muted">{t(item.label)}</p>
          <p className="mt-1.5 font-display text-xl font-bold tabular">{item.value}</p>
          <p className={clsx("mt-1 flex items-center gap-1 text-[12px]", item.trend === "up" ? "text-danger" : item.trend === "down" ? "text-ok" : "text-muted")}>
            {item.trend === "up" && <TrendingUp className="size-3.5" />}
            {item.trend === "down" && <TrendingDown className="size-3.5" />}
            <span className="line-clamp-1">{t(item.note)}</span>
          </p>
        </Card>
      ))}
    </div>
  )
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-lg">
      <p className="text-muted">{label ? formatDate(label) : ""}</p>
      <p className="font-semibold tabular">{formatINR(payload[0].value)}</p>
    </div>
  )
}

function TrendCard({ data }: { data: Dashboard }) {
  const total = data.trend.reduce((sum, day) => sum + day.paise, 0)
  const average = total / data.trend.length
  return (
    <Card className="h-full">
      <CardHeader title={t("Daily spending")} subtitle={`Last 30 days - average ${formatINR(average)} a day`} />
      <div className="h-64 px-2 pb-3 pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(d: string) => String(Number(d.slice(8)))} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} interval={4} />
            <YAxis tickFormatter={(v: number) => compactINR(v)} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--line)" }} />
            {data.snapshot.hasIncome && data.snapshot.budget.budgetPaise > 0 && (
              <ReferenceLine y={data.snapshot.budget.budgetPaise} stroke="var(--accent)" strokeDasharray="4 4" label={{ value: "Today's safe amount", fill: "var(--muted)", fontSize: 11, position: "insideTopRight" }} />
            )}
            <Area type="monotone" dataKey="paise" stroke="var(--brand)" strokeWidth={2} fill="url(#spendFill)" animationDuration={900} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function CategoryCard({ data }: { data: Dashboard }) {
  const flexible = data.categories.filter((row) => !["Rent", "EMI", "SIP", "Savings"].includes(row.category))
  const total = flexible.reduce((sum, row) => sum + row.paise, 0)
  return (
    <Card className="h-full">
      <CardHeader title={t("Where it went")} subtitle={t("This month, excluding rent, EMIs and savings")} />
      {flexible.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-muted">{t("No spending this month yet.")}</p>
      ) : (
        <div className="px-5 pb-5">
          <div className="relative mx-auto h-40 w-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={flexible} dataKey="paise" nameKey="category" innerRadius={52} outerRadius={76} paddingAngle={2} stroke="none" animationDuration={800}>
                  {flexible.map((row) => (
                    <Cell key={row.category} fill={CATEGORY_STYLE[row.category].color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-[11px] text-muted">{t("Total")}</p>
                <p className="font-display text-base font-bold tabular">{compactINR(total)}</p>
              </div>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {flexible
              .slice()
              .sort((a, b) => b.paise - a.paise)
              .slice(0, 5)
              .map((row) => (
                <li key={row.category} className="flex items-center gap-2.5 text-[13px]">
                  <span className="size-2.5 rounded-full" style={{ background: CATEGORY_STYLE[row.category].color }} />
                  <span className="flex-1 truncate">{row.category}</span>
                  <span className="text-muted tabular">{Math.round((row.paise / total) * 100)}%</span>
                  <span className="w-20 text-right font-medium tabular">{formatINR(row.paise)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function FlagsCard({ data }: { data: Dashboard }) {
  const client = useQueryClient()
  async function dismiss(id: string) {
    await api.post(`/flags/${encodeURIComponent(id)}/dismiss`)
    client.invalidateQueries({ queryKey: keys.dashboard })
    client.invalidateQueries({ queryKey: keys.notifications })
    toast(t("Marked as fine"))
  }
  return (
    <Card className="h-full">
      <CardHeader title={t("Worth a look")} subtitle={t("Possible duplicates and unusual charges")} action={<Flag className="size-4 text-muted" />} />
      {data.flags.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-8 text-[13px] text-muted">
          <Sparkles className="size-4 text-brand" /> {t("Nothing unusual. Nice.")}
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {data.flags.slice(0, 4).map((flag) => (
            <li key={flag.id} className="flex items-start gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] font-medium">{flag.merchant}</p>
                  <p className="text-[13px] font-semibold tabular">{formatINR(flag.amountPaise)}</p>
                </div>
                <p className="mt-0.5 text-[12px] text-muted">
                  {formatDate(flag.date)} - {flag.reasons[0]}
                </p>
              </div>
              <button onClick={() => dismiss(flag.id)} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label={t("Dismiss")} title={t("This is fine")}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function BudgetsGoalsCard({ data }: { data: Dashboard }) {
  return (
    <Card className="h-full">
      <CardHeader title={t("Budgets and goals")} action={<Target className="size-4 text-muted" />} />
      <div className="space-y-4 px-5 pb-5 pt-4">
        {data.budgets.length === 0 && data.goals.length === 0 && (
          <p className="text-[13px] text-muted">
            {t("Set category limits in")}{" "}
            <Link to="/app/settings" className="font-medium text-brand">
              {t("Settings")}
            </Link>{" "}
            {t("or start a")}{" "}
            <Link to="/app/goals" className="font-medium text-brand">
              {t("savings goal")}
            </Link>
            .
          </p>
        )}
        {data.budgets.map((budget) => {
          const ratio = budget.spentPaise / budget.limitPaise
          return (
            <div key={budget.category}>
              <div className="mb-1.5 flex items-center gap-2 text-[13px]">
                <CategoryIcon category={budget.category} size="sm" />
                <span className="flex-1 font-medium">{budget.category}</span>
                <span className={clsx("tabular", ratio > 1 ? "text-danger" : "text-muted")}>
                  {formatINR(budget.spentPaise)} / {formatINR(budget.limitPaise)}
                </span>
              </div>
              <Progress value={ratio} tone={ratio > 1 ? "danger" : ratio > 0.8 ? "warn" : "brand"} />
            </div>
          )
        })}
        {data.goals.slice(0, 2).map((goal) => (
          <div key={goal.id}>
            <div className="mb-1.5 flex items-center justify-between text-[13px]">
              <span className="font-medium">{t(goal.name)}</span>
              <span className="text-muted tabular">{Math.round((goal.savedPaise / goal.targetPaise) * 100)}%</span>
            </div>
            <Progress value={goal.savedPaise / goal.targetPaise} />
            <p className="mt-1 text-[12px] text-muted">{goal.projectedDate ? `On track for ${formatDate(goal.projectedDate)}` : t("Add a monthly amount to see a finish date")}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function RecurringCard({ data }: { data: Dashboard }) {
  const monthly = data.recurring.reduce((sum, item) => sum + item.monthlyPaise, 0)
  return (
    <Card>
      <CardHeader title={t("Recurring payments we found")} subtitle={`About ${formatINR(monthly)} a month across ${data.recurring.length} payments`} action={<Repeat className="size-4 text-muted" />} />
      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {data.recurring.map((item) => (
          <div key={item.merchant} className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[13px] font-medium">{item.merchant}</p>
              {item.priceRiseIds.length > 0 && <Badge tone="warn">{t("Price up")}</Badge>}
            </div>
            <p className="mt-1 font-display text-lg font-semibold tabular">{formatINR(item.medianPaise)}</p>
            <p className="text-[12px] text-muted">
              {item.cadenceLabel} {t("- next")} {formatDate(item.nextDate)}
            </p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 w-full rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  )
}
