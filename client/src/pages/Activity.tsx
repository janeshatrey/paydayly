import { t } from "../lib/i18n"
import { parseRupeeInput } from "../lib/money"
import { OwedFields } from "../components/Money"
import { DateInput } from "../components/DateInput"
import { CATEGORIES, formatDateLong, formatExactINR, type Category } from "@paydayly/shared"
import { useQuery } from "@tanstack/react-query"
import clsx from "clsx"
import { motion } from "framer-motion"
import { Download, FileUp, Plus, Search, SearchX, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useOutletContext } from "react-router-dom"
import { toast } from "sonner"
import type { ShellContext } from "../components/AppShell"
import { CategoryIcon } from "../components/CategoryIcon"
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Segmented, Select, Skeleton, Switch } from "../components/ui"
import { api } from "../lib/api"
import { keys, useRefreshAll } from "../lib/queries"
import type { TxRow } from "../lib/types"

const BUCKET_LABEL: Record<string, string> = {
  fixed: "Fixed",
  income: "Income",
  transfer: "Transfer",
  "one-off": "One-off",
  refund: "Refund",
  pending: "Pending",
}

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

export function ActivityPage() {
  const shell = useOutletContext<ShellContext>()
  const [q, setQ] = useState("")
  const [category, setCategory] = useState<Category | "">("")
  const [direction, setDirection] = useState<"all" | "debit" | "credit">("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [limit, setLimit] = useState(100)
  const [editing, setEditing] = useState<TxRow | null>(null)
  const search = useDebounced(q)

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (search.trim()) p.set("q", search.trim())
    if (category) p.set("category", category)
    if (direction !== "all") p.set("direction", direction)
    if (from) p.set("from", from)
    if (to) p.set("to", to)
    p.set("limit", String(limit))
    return p.toString()
  }, [search, category, direction, from, to, limit])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: keys.transactions(params),
    queryFn: () => api.get<{ transactions: TxRow[]; total: number }>(`/transactions?${params}`),
    placeholderData: (previous) => previous,
  })

  const groups = useMemo(() => {
    const map = new Map<string, TxRow[]>()
    for (const tx of data?.transactions ?? []) {
      const list = map.get(tx.date) ?? []
      list.push(tx)
      map.set(tx.date, list)
    }
    return [...map.entries()]
  }, [data])

  const filtered = Boolean(search || category || direction !== "all" || from || to)

  return (
    <div>
      <PageHeader
        title={t("Activity")}
        subtitle={data ? `${data.total} transactions${filtered ? " match your filters" : ""}` : t("Every transaction you have imported or added.")}
        action={
          <>
            <a href="/api/transactions/export" download>
              <Button variant="secondary" icon={Download} size="sm">
                {t("Export CSV")}
              </Button>
            </a>
            <Button size="sm" icon={Plus} onClick={shell.openAdd} className="hidden sm:inline-flex">
              {t("Add")}
            </Button>
          </>
        }
      />

      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search merchant or narration")} className="pl-10" aria-label={t("Search transactions")} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category)} className="sm:w-44" aria-label={t("Category")}>
              <option value="">{t("All categories")}</option>
              {CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
            <DateInput value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("From date")} className="sm:w-40" />
            <DateInput value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("To date")} className="sm:w-40" />
            <div className="col-span-2 sm:col-span-1">
              <Segmented
                value={direction}
                onChange={setDirection}
                options={[
                  { value: "all", label: "All" },
                  { value: "debit", label: "Out" },
                  { value: "credit", label: "In" },
                ]}
              />
            </div>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Card className="divide-y divide-line">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4">
              <Skeleton className="size-9 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState icon={SearchX} title={t("No matches")} body="Try a different search or clear the filters." action={<Button variant="secondary" onClick={() => { setQ(""); setCategory(""); setDirection("all"); setFrom(""); setTo("") }}>{t("Clear filters")}</Button>} />
          ) : (
            <EmptyState
              icon={FileUp}
              title={t("Your activity is empty")}
              body="Import a bank statement to see every spend sorted and searchable."
              action={
                <Button icon={FileUp} onClick={shell.openImport}>
                  {t("Import statement")}
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <div className={clsx("space-y-4 transition-opacity", isFetching && "opacity-70")}>
          {groups.map(([date, rows]) => {
            const out = rows.filter((r) => r.direction === "debit").reduce((s, r) => s + r.amountPaise, 0)
            return (
              <div key={date}>
                <div className="mb-2 flex items-center justify-between px-1 text-[12px] font-medium text-muted">
                  <span>{formatDateLong(date)}</span>
                  {out > 0 && <span className="tabular">{formatExactINR(out)} {t("out")}</span>}
                </div>
                <Card className="divide-y divide-line overflow-hidden">
                  {rows.map((tx) => (
                    <motion.button
                      layout="position"
                      key={tx.id}
                      onClick={() => setEditing(tx)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 sm:px-5"
                    >
                      <CategoryIcon category={tx.category} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium">{tx.merchant}</p>
                        <p className="flex items-center gap-1.5 truncate text-[12px] text-muted">
                          <span>{tx.category}</span>
                          {BUCKET_LABEL[tx.bucket] && tx.bucket !== "income" && <Badge>{BUCKET_LABEL[tx.bucket]}</Badge>}
                          {tx.category === "Uncategorised" && <Badge tone="warn">{t("Needs a category")}</Badge>}
                        </p>
                      </div>
                      <span className={clsx("text-[14px] font-semibold tabular", tx.direction === "credit" && "text-ok")}>
                        {tx.direction === "credit" ? "+" : "−"}
                        {formatExactINR(tx.amountPaise)}
                      </span>
                    </motion.button>
                  ))}
                </Card>
              </div>
            )
          })}
          {data && data.total > data.transactions.length && (
            <div className="flex justify-center pt-2">
              <Button variant="secondary" onClick={() => setLimit((n) => Math.min(n + 100, 500))} loading={isFetching} disabled={limit >= 500}>
                {limit >= 500 ? t("Narrow the filters to see older items") : t("Show more")}
              </Button>
            </div>
          )}
        </div>
      )}

      <EditDialog tx={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function EditDialog({ tx, onClose }: { tx: TxRow | null; onClose: () => void }) {
  const [category, setCategory] = useState<Category>("Uncategorised")
  const [merchant, setMerchant] = useState("")
  const [oneOff, setOneOff] = useState(false)
  const [similar, setSimilar] = useState(true)
  const [busy, setBusy] = useState(false)
  const [owed, setOwed] = useState({ on: false, who: "", amount: "", kind: "friends" as "friends" | "reimbursement" })
  const refresh = useRefreshAll()

  useEffect(() => {
    if (!tx) return
    setOwed({ on: false, who: "", amount: "", kind: "friends" })
    setCategory(tx.category)
    setMerchant(tx.merchant)
    setOneOff(tx.oneOff)
    setSimilar(true)
  }, [tx])

  async function save() {
    if (!tx) return
    setBusy(true)
    try {
      const patch: Record<string, unknown> = {}
      if (category !== tx.category) {
        patch.category = category
        patch.applyToSimilar = similar
      }
      if (merchant.trim() && merchant !== tx.merchant) patch.merchant = merchant.trim()
      if (oneOff !== tx.oneOff) patch.oneOff = oneOff
      // Money owed back works on imported payments too: the full debit stays, their share is tracked until it arrives.
      let owedPaise = 0
      if (tx.direction === "debit" && owed.on) {
        owedPaise = parseRupeeInput(owed.amount) ?? 0
        if (!owed.who.trim() || owedPaise <= 0 || owedPaise > tx.amountPaise) {
          toast.error(t("Say who owes you and how much, up to the full amount."))
          return
        }
      }
      if (owedPaise > 0) {
        await api.post("/receivables", { txId: tx.id, kind: owed.kind, counterparty: owed.who.trim(), amountPaise: owedPaise, date: tx.date })
        if (!Object.keys(patch).length) {
          await refresh()
          toast.success(t("Saved"))
        }
      }
      if (Object.keys(patch).length) {
        const result = await api.patch<{ updated?: number }>(`/transactions/${tx.id}`, patch)
        await refresh()
        toast.success(result.updated && result.updated > 1 ? `Updated ${result.updated} transactions` : "Saved")
      }
      onClose()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!tx || !confirm("Delete this transaction?")) return
    await api.del(`/transactions/${tx.id}`)
    await refresh()
    toast.success(t("Transaction deleted"))
    onClose()
  }

  return (
    <Modal open={Boolean(tx)} onClose={onClose} title={tx?.merchant ?? ""} description={tx ? `${formatDateLong(tx.date)} at ${tx.time}` : undefined}>
      {tx && (
        <div className="space-y-4">
          <div className="rounded-xl bg-surface-2 p-4">
            <p className={clsx("font-display text-2xl font-bold tabular", tx.direction === "credit" && "text-ok")}>
              {tx.direction === "credit" ? "+" : "−"}
              {formatExactINR(tx.amountPaise)}
            </p>
            <p className="mt-1 break-all text-[12px] text-muted">{tx.narration}</p>
          </div>
          <Field label={t("Merchant name")} htmlFor="edit-merchant">
            <Input id="edit-merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
          </Field>
          <Field label={t("Category")}>
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          {category !== tx.category && (
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-[13px]">
              <span>{t("Also apply to every")} {tx.merchant} {t("transaction, and remember it for future imports")}</span>
              <Switch checked={similar} onChange={setSimilar} label={t("Apply to similar")} />
            </label>
          )}
          {tx.direction === "debit" && (
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-[13px]">
              <span>
                <span className="block font-medium">{t("One-off expense")}</span>
                <span className="text-muted">{t("Keep a big purchase out of your daily number")}</span>
              </span>
              <Switch checked={oneOff} onChange={setOneOff} label={t("One-off")} />
            </label>
          )}
          {tx.direction === "debit" && <OwedFields value={owed} onChange={setOwed} />}
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" icon={Trash2} onClick={remove} className="text-danger hover:bg-danger-soft hover:text-danger">
              {t("Delete")}
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                {t("Cancel")}
              </Button>
              <Button onClick={save} loading={busy}>
                {t("Save")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
