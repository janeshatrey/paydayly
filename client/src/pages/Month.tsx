import { t } from "../lib/i18n"
import { formatINR, weekday } from "@paydayly/shared"
import clsx from "clsx"
import { ChevronLeft, ChevronRight, Store } from "lucide-react"
import { useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { CategoryIcon } from "../components/CategoryIcon"
import { Card, CardHeader, PageHeader, Progress, Skeleton } from "../components/ui"
import { compactINR } from "../lib/money"
import { useMonth } from "../lib/queries"

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

export function MonthPage() {
  const [month, setMonth] = useState<string | null>(null)
  const { data, isLoading } = useMonth(month)

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  const current = data.month
  const isCurrent = current === data.asOf.slice(0, 7)
  const max = Math.max(...data.days.map((d) => d.flexiblePaise), 1)
  const leadBlank = (weekday(data.days[0].date) + 6) % 7
  const left = data.totals.poolPaise - data.totals.flexiblePaise
  const totals = [
    { label: "Money in", value: formatINR(data.totals.incomePaise) },
    { label: "Commitments paid", value: formatINR(data.totals.fixedSpentPaise), note: `of ${formatINR(data.totals.plannedFixedPaise + data.totals.plannedSavingsPaise)} planned` },
    { label: "Flexible spending", value: formatINR(data.totals.flexiblePaise), note: `of ${formatINR(data.totals.poolPaise)} pool` },
    { label: isCurrent ? "Pool left" : "Pool result", value: formatINR(left), tone: left < 0 ? "text-danger" : "text-ok" },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(data.label)}
        subtitle={t("How the month is going, day by day.")}
        action={
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
            <button onClick={() => setMonth(shiftMonth(current, -1))} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label={t("Previous month")}>
              <ChevronLeft className="size-4" />
            </button>
            <button onClick={() => setMonth(null)} disabled={isCurrent} className="rounded-lg px-2 py-1 text-[13px] font-medium text-muted hover:text-text disabled:opacity-40">
              {t("This month")}
            </button>
            <button onClick={() => setMonth(shiftMonth(current, 1))} disabled={isCurrent} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40" aria-label={t("Next month")}>
              <ChevronRight className="size-4" />
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {totals.map((item) => (
          <Card key={item.label} className="p-4">
            <p className="text-[12px] font-medium text-muted">{t(item.label)}</p>
            <p className={clsx("mt-1.5 font-display text-xl font-bold tabular", item.tone)}>{item.value}</p>
            {item.note && <p className="mt-1 text-[12px] text-muted">{t(item.note)}</p>}
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title={t("Daily flexible spend")} />
          <div className="h-64 px-2 pb-3 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.days} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(d: string) => String(Number(d.slice(8)))} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} interval={3} />
                <YAxis tickFormatter={(v: number) => compactINR(v)} tick={{ fill: "var(--muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  cursor={{ fill: "var(--surface-2)" }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-lg">
                        <p className="text-muted">{String(payload[0].payload.date)}</p>
                        <p className="font-semibold tabular">{formatINR(Number(payload[0].value))}</p>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="flexiblePaise" fill="var(--brand)" radius={[6, 6, 0, 0]} maxBarSize={18} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={t("Calendar")} subtitle={t("Darker days cost more")} />
          <div className="p-5">
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-muted">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
              {Array.from({ length: leadBlank }, (_, i) => (
                <span key={`b${i}`} />
              ))}
              {data.days.map((day) => {
                const intensity = day.flexiblePaise > 0 ? 0.15 + 0.85 * (day.flexiblePaise / max) : 0
                return (
                  <div
                    key={day.date}
                    title={`${day.date}: ${formatINR(day.flexiblePaise)}`}
                    className={clsx("grid aspect-square place-items-center rounded-lg text-[12px] font-medium", day.future ? "text-muted/40" : intensity > 0.55 ? "text-white" : "text-text", day.date === data.asOf && "ring-2 ring-accent")}
                    style={{ background: intensity ? `color-mix(in srgb, var(--brand) ${Math.round(intensity * 100)}%, transparent)` : "var(--surface-2)" }}
                  >
                    {Number(day.date.slice(8))}
                  </div>
                )
              })}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("Categories")} subtitle={t("Including fixed costs")} />
          {data.categories.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-muted">{t("No spending recorded in")} {t(data.label)}.</p>
          ) : (
            <ul className="space-y-4 p-5">
              {data.categories
                .slice()
                .sort((a, b) => b.paise - a.paise)
                .map((row) => {
                  const ratio = row.limitPaise ? row.paise / row.limitPaise : null
                  return (
                    <li key={row.category} className="flex items-center gap-3">
                      <CategoryIcon category={row.category} />
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between text-[13px]">
                          <span className="font-medium">{row.category}</span>
                          <span className="tabular font-semibold">{formatINR(row.paise)}</span>
                        </div>
                        {ratio !== null && (
                          <div className="mt-1.5">
                            <Progress value={ratio} tone={ratio > 1 ? "danger" : ratio > 0.8 ? "warn" : "brand"} />
                            <p className="mt-1 text-[11px] text-muted">{t("Limit")} {formatINR(row.limitPaise!)}</p>
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={t("Top places")} subtitle={t("Where flexible money went")} />
          {data.topMerchants.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-muted">{t("Nothing here yet.")}</p>
          ) : (
            <ul className="divide-y divide-line pt-2">
              {data.topMerchants.map((row, index) => (
                <li key={row.merchant} className="flex items-center gap-3 px-5 py-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-surface-2 text-[12px] font-semibold text-muted">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{row.merchant}</p>
                    <p className="text-[12px] text-muted">
                      {row.count} {row.count === 1 ? t("payment") : t("payments")}
                    </p>
                  </div>
                  <span className="text-[13px] font-semibold tabular">{formatINR(row.paise)}</span>
                </li>
              ))}
            </ul>
          )}
          {data.topMerchants.length > 0 && (
            <p className="flex items-center gap-1.5 px-5 pb-4 text-[12px] text-muted">
              <Store className="size-3.5" /> {t("Merchant names are cleaned up from your bank narration.")}
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
