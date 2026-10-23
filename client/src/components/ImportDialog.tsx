import { t } from "../lib/i18n"
import { formatDate, formatExactINR, type CsvMapping, type FileCheck, type ImportedRow } from "@paydayly/shared"
import clsx from "clsx"
import { AlertTriangle, CheckCircle2, FileSpreadsheet, UploadCloud } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "../lib/api"
import { useDashboard, useRefreshAll } from "../lib/queries"
import { Badge, Button, Field, Modal, Select } from "./ui"

interface Preview {
  headers: string[]
  mapping: CsvMapping | null
  rowCount: number
  preview: ImportedRow[]
  readable: number
  rejected: { line: number; reason: string }[]
  review: { line: number | null; date: string; narration: string; amountPaise: number; direction: "debit" | "credit"; category: string; reason: string }[]
  duplicates: number
  check: FileCheck
  confidence?: { date: number; narration: number; amount: number; overall: number }
  headerLine?: number
  skippedLines?: number
  joinedLines?: number
}

interface Reconciliation {
  fileDebitPaise: number
  fileCreditPaise: number
  addedDebitPaise: number
  addedCreditPaise: number
  skippedDebitPaise: number
  skippedCreditPaise: number
  ok: boolean
  openingPaise: number | null
  closingPaise: number | null
  balanceMatches: boolean | null
  mismatchLine: number | null
}

interface Result {
  importId: string
  excluded: number
  reconciliation: Reconciliation
  added: number
  skipped: number
  rejected: { line: number; reason: string }[]
  range: { from: string; to: string } | null
}

const EMPTY_MAPPING: CsvMapping = { date: "", narration: "", debit: "", credit: "", time: "", type: "", balance: "" }

export function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported?: (result: Result) => void }) {
  const [file, setFile] = useState<{ name: string; text: string; format?: string } | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<CsvMapping>(EMPTY_MAPPING)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [exclude, setExclude] = useState<number[]>([])
  const [accountId, setAccountId] = useState("")
  const [key, setKey] = useState(() => crypto.randomUUID())
  const { data: dashboard } = useDashboard()
  const accounts = dashboard?.accounts ?? []
  const inputRef = useRef<HTMLInputElement>(null)
  const refresh = useRefreshAll()

  function reset() {
    setFile(null)
    setPreview(null)
    setMapping(EMPTY_MAPPING)
    setResult(null)
    setExclude([])
    setKey(crypto.randomUUID())
  }

  function close() {
    onClose()
    setTimeout(reset, 250)
  }

  async function readFile(picked: File) {
    const isCsv = /\.(csv|txt)$/i.test(picked.name) || picked.type === "text/csv"
    const isSheet = /\.(xlsx?|xlsm|html?)$/i.test(picked.name)
    if (!isCsv && !isSheet) {
      toast.error(t("Please choose a CSV, XLS or XLSX statement from your bank."))
      return
    }
    if (picked.size > 5_000_000) {
      toast.error(t("That file is larger than 5 MB."))
      return
    }
    setBusy(true)
    try {
      let text: string
      let format = "CSV"
      if (isSheet) {
        const { spreadsheetToGrid, gridToCsv } = await import("@paydayly/shared/spreadsheet")
        const sheet = spreadsheetToGrid(new Uint8Array(await picked.arrayBuffer()))
        text = gridToCsv(sheet.grid)
        format = sheet.format === "html" ? "XLS (HTML)" : sheet.format.toUpperCase()
      } else {
        text = await picked.text()
      }
      const data = await api.post<Preview>("/import/preview", { csv: text })
      setFile({ name: picked.name, text, format })
      setPreview(data)
      setMapping({ ...EMPTY_MAPPING, ...(data.mapping ?? {}) })
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function runImport() {
    if (!file) return
    if (!mapping.date || !mapping.narration || (!mapping.debit && !mapping.credit)) {
      toast.error(t("Pick the date, description and at least one amount column."))
      return
    }
    setBusy(true)
    try {
      const data = await api.postOnce<Result>(
        "/import",
        { csv: file.text, filename: file.name, mapping: clean(mapping), exclude, accountId: accountId || null },
        key,
      )
      setResult(data)
      await refresh()
      onImported?.(data)
      toast.success(data.added ? `Imported ${data.added} transactions` : "Nothing new in that file", {
        description: data.skipped ? `${data.skipped} already in Paydayly were skipped.` : undefined,
      })
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remap(next: CsvMapping) {
    setMapping(next)
    if (!file || !next.date || !next.narration || (!next.debit && !next.credit)) return
    try {
      const data = await api.post<Preview>("/import/preview", { csv: file.text, mapping: clean(next) })
      setPreview(data)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const columns = preview?.headers ?? []
  const pick = (key: keyof CsvMapping, label: string, optional = false) => (
    <Field label={label}>
      <Select value={mapping[key]} onChange={(event) => remap({ ...mapping, [key]: event.target.value })}>
        <option value="">{optional ? t("Not in this file") : t("Choose a column")}</option>
        {columns.map((column) => (
          <option key={column} value={column}>
            {column}
          </option>
        ))}
      </Select>
    </Field>
  )

  return (
    <Modal open={open} onClose={close} title={t("Import a bank statement")} description={t("Upload the CSV, XLS or XLSX statement from any bank's net banking.")} wide>
      {result ? (
        <div className="py-4 text-center">
          <CheckCircle2 className="mx-auto size-12 text-ok" />
          <h3 className="mt-3 font-display text-lg font-semibold">{result.added ? `${result.added} transactions added` : t("No new transactions")}</h3>
          <p className="mt-1 text-sm text-muted">
            {result.range ? `From ${formatDate(result.range.from)} to ${formatDate(result.range.to)}. ` : ""}
            {result.skipped ? `${result.skipped} duplicates skipped. ` : ""}
            {result.rejected.length ? `${result.rejected.length} rows could not be read. ` : ""}
            {result.excluded ? `${result.excluded} rows left out by you.` : ""}
          </p>
          <ReconciliationBox value={result.reconciliation} />
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="secondary" onClick={reset}>
              {t("Import another")}
            </Button>
            <Button onClick={close}>{t("Done")}</Button>
          </div>
        </div>
      ) : !preview ? (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const picked = event.dataTransfer.files[0]
            if (picked) readFile(picked)
          }}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            "flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
            dragging ? "border-brand bg-brand-soft" : "border-line hover:border-brand/50 hover:bg-surface-2",
          )}
        >
          <UploadCloud className="size-10 text-brand" />
          <p className="mt-3 font-medium">{busy ? t("Reading file...") : t("Drop your statement here (CSV, XLS or XLSX), or click to browse")}</p>
          <p className="mt-1 text-[13px] text-muted">{t("Your file is read securely, kept private to your account and never shared.")}</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xls,.xlsx,.txt,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              const picked = event.target.files?.[0]
              if (picked) readFile(picked)
              event.target.value = ""
            }}
          />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
            <FileSpreadsheet className="size-5 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{t(file?.name)}</p>
              <p className="text-[12px] text-muted">
                {preview.rowCount} {t("rows,")} {preview.readable} {t("readable")}
                {preview.rejected.length ? `, ${preview.rejected.length} with problems` : ""}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              {t("Change")}
            </Button>
          </div>

          {preview.confidence && (
            <div
              data-testid="import-detect"
              className={clsx(
                "rounded-xl px-4 py-3 text-[13px]",
                preview.confidence.overall >= 0.8 ? "bg-ok/10 text-ok" : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
              )}
            >
              <p className="font-medium">
                {preview.confidence.overall >= 0.8 ? t("Columns matched automatically") : t("Check the columns below")} ·{" "}
                {Math.round(preview.confidence.overall * 100)}% {t("confidence")}
              </p>
              <p className="mt-0.5 text-muted">
                {file?.format ? `${file.format}. ` : ""}
                {preview.headerLine ? `${t("Header found on line")} ${preview.headerLine}. ` : ""}
                {preview.skippedLines ? `${preview.skippedLines} ${t("bank info and summary lines left out")}. ` : ""}
                {preview.joinedLines ? `${preview.joinedLines} ${t("wrapped descriptions joined")}.` : ""}
              </p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {pick("date", "Date")}
            {pick("narration", "Description")}
            {pick("debit", "Money out (debit)", true)}
            {pick("credit", "Money in (credit)", true)}
            {pick("type", "Debit/credit marker", true)}
            {pick("balance", "Running balance", true)}
          </div>
          {accounts.length > 0 && (
            <Field label={t("Which account is this statement for?")}>
              <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                <option value="">{t("Not sure")}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {t(account.name)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="flex flex-wrap gap-2 text-[12px]">
            <Badge tone="neutral">{t("Out")} {formatExactINR(preview.check.debitPaise)}</Badge>
            <Badge tone="neutral">{t("In")} {formatExactINR(preview.check.creditPaise)}</Badge>
            {preview.check.from && preview.check.to && <Badge tone="neutral">{formatDate(preview.check.from)} {t("to")} {formatDate(preview.check.to)}</Badge>}
            {preview.duplicates > 0 && <Badge tone="warn">{preview.duplicates} {t("already in Paydayly, will be skipped")}</Badge>}
            {preview.check.balanceMatches === false && <Badge tone="danger">{t("Running balance breaks at line")} {preview.check.mismatchLine}</Badge>}
            {preview.check.balanceMatches === true && <Badge tone="brand">{t("Running balance adds up")}</Badge>}
          </div>

          {preview.preview.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-[13px]">
                <tbody>
                  {preview.preview.slice(0, 5).map((row, index) => (
                    <tr key={index} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDate(row.date)}</td>
                      <td className="max-w-[260px] truncate px-3 py-2">{row.narration}</td>
                      <td className={clsx("whitespace-nowrap px-3 py-2 text-right tabular font-medium", row.direction === "credit" && "text-ok")}>
                        {row.direction === "credit" ? "+" : ""}
                        {formatExactINR(row.amountPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.review.length > 0 && (
            <div className="space-y-1.5">
              <Badge tone="warn">{t("Check these before importing")}</Badge>
              <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-xl border border-line text-[13px] scroll-thin">
                {preview.review.map((row, index) => {
                  const line = row.line
                  const left = line !== null && exclude.includes(line)
                  return (
                    <li key={`${line}-${index}`} className={clsx("flex items-center gap-3 px-3 py-2", left && "opacity-50")}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{row.narration}</p>
                        <p className="text-[12px] text-muted">
                          {formatDate(row.date)} · {row.category} · {t(row.reason)}
                        </p>
                      </div>
                      <span className="tabular">{formatExactINR(row.amountPaise)}</span>
                      {line !== null && (
                        <button
                          type="button"
                          onClick={() => setExclude(left ? exclude.filter((item) => item !== line) : [...exclude, line])}
                          className="text-[12px] font-medium text-brand hover:underline"
                        >
                          {left ? t("Include") : t("Leave out")}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {preview.rejected.length > 0 && (
            <div className="space-y-1">
              <Badge tone="warn">{t("Rows we will skip")}</Badge>
              <ul className="max-h-24 overflow-y-auto text-[12px] text-muted scroll-thin">
                {preview.rejected.slice(0, 6).map((row) => (
                  <li key={row.line}>
                    {t("Line")} {row.line}: {t(row.reason)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              {t("Cancel")}
            </Button>
            <Button onClick={runImport} loading={busy}>
              {t("Import")} {preview.readable - exclude.length} {t("rows")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function clean(mapping: CsvMapping): CsvMapping {
  return { ...mapping, type: mapping.type || undefined, balance: mapping.balance || undefined }
}

function ReconciliationBox({ value }: { value: Reconciliation }) {
  return (
    <div className="mx-auto mt-5 max-w-sm rounded-2xl bg-surface-2 p-4 text-left text-[13px]">
      <p className="mb-2 flex items-center gap-1.5 font-medium">
        {value.ok ? <CheckCircle2 className="size-4 text-ok" /> : <AlertTriangle className="size-4 text-danger" />}
        {value.ok ? t("Totals match the file") : t("Totals do not match the file")}
      </p>
      <dl className="grid grid-cols-2 gap-y-1 text-muted">
        <dt>{t("Money out in file")}</dt>
        <dd className="text-right tabular">{formatExactINR(value.fileDebitPaise)}</dd>
        <dt>{t("Added + skipped")}</dt>
        <dd className="text-right tabular">{formatExactINR(value.addedDebitPaise + value.skippedDebitPaise)}</dd>
        <dt>{t("Money in in file")}</dt>
        <dd className="text-right tabular">{formatExactINR(value.fileCreditPaise)}</dd>
        <dt>{t("Added + skipped")}</dt>
        <dd className="text-right tabular">{formatExactINR(value.addedCreditPaise + value.skippedCreditPaise)}</dd>
        {value.closingPaise !== null && (
          <>
            <dt>{t("Closing balance")}</dt>
            <dd className="text-right tabular">{formatExactINR(value.closingPaise)}</dd>
          </>
        )}
      </dl>
      {value.balanceMatches === false && <p className="mt-2 text-danger">{t("The running balance in the file breaks at line")} {value.mismatchLine}.</p>}
    </div>
  )
}
