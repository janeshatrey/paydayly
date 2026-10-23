import { formatIndianDate, parseIndianDate } from "@paydayly/shared"
import clsx from "clsx"
import { CalendarDays } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { t } from "../lib/i18n"

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())
}

/**
 * Day-first date field. Shows DD/MM/YYYY and accepts "22/10", "22-10-2026", "22 Oct" or "Oct 22".
 * The value in and out is always an ISO date (YYYY-MM-DD), so it drops in where <Input type="date"> was.
 */
export function DateInput({
  value,
  onChange,
  min,
  max,
  id,
  className,
  required,
  "aria-label": ariaLabel,
}: {
  value: string
  onChange: (event: { target: { value: string } }) => void
  min?: string
  max?: string
  id?: string
  className?: string
  required?: boolean
  "aria-label"?: string
}) {
  const [text, setText] = useState(value ? formatIndianDate(value) : "")
  const [bad, setBad] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setText(value ? formatIndianDate(value) : "")
  }, [value])

  function commit(raw: string) {
    if (!raw.trim()) {
      setBad(false)
      onChange({ target: { value: "" } })
      return
    }
    const today = todayIso()
    let parsed = parseIndianDate(raw, max ?? today)
    const hasYear = /\b\d{4}\b|[/.-]\d{1,2}[/.-]\d{2}\b/.test(raw)
    if (min && !hasYear) {
      // Future-facing fields (a purchase date, a deadline): read "5 Nov" as the next 5 Nov.
      const thisYear = parseIndianDate(raw, `${today.slice(0, 4)}-12-31`)
      parsed = thisYear && thisYear < min ? `${Number(thisYear.slice(0, 4)) + 1}${thisYear.slice(4)}` : thisYear
    }
    const ok = !!parsed && (!min || parsed >= min) && (!max || parsed <= max)
    setBad(!ok)
    if (ok && parsed) {
      onChange({ target: { value: parsed } })
      setText(formatIndianDate(parsed))
    }
  }

  return (
    <div className={clsx("relative", className)}>
      <input
        id={id}
        inputMode="text"
        autoComplete="off"
        required={required}
        aria-label={ariaLabel}
        aria-invalid={bad || undefined}
        placeholder={t("DD/MM/YYYY")}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setBad(false)
        }}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit((event.target as HTMLInputElement).value)
        }}
        className={clsx(
          "h-11 w-full rounded-xl border bg-surface pl-3.5 pr-10 text-sm tabular text-text placeholder:text-muted/70 transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15",
          bad ? "border-danger" : "border-line",
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={() => picker.current?.showPicker?.()}
        className="absolute inset-y-0 right-2 grid w-8 place-items-center text-muted hover:text-text"
      >
        <CalendarDays className="size-4" />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        min={min}
        max={max}
        value={value}
        onChange={(event) => event.target.value && onChange({ target: { value: event.target.value } })}
        className="pointer-events-none absolute bottom-0 right-2 h-0 w-0 opacity-0"
      />
    </div>
  )
}
