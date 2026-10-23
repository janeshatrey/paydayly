import { t } from "../lib/i18n"
import { useQueryClient } from "@tanstack/react-query"
import clsx from "clsx"
import { formatDistanceToNowStrict } from "./time"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, Bell, CalendarClock, CheckCheck, Flag, Repeat, Wallet, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { api } from "../lib/api"
import { keys, useNotifications } from "../lib/queries"
import type { NotificationItem } from "../lib/types"

const ICONS = {
  overspend: { icon: AlertTriangle, tone: "text-danger bg-danger-soft" },
  pool: { icon: Wallet, tone: "text-danger bg-danger-soft" },
  bill: { icon: CalendarClock, tone: "text-[#9a6412] bg-accent-soft dark:text-accent" },
  budget: { icon: AlertTriangle, tone: "text-[#9a6412] bg-accent-soft dark:text-accent" },
  recurring: { icon: Repeat, tone: "text-brand bg-brand-soft" },
  flag: { icon: Flag, tone: "text-muted bg-surface-2" },
} satisfies Record<NotificationItem["kind"], unknown>

export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const { data } = useNotifications()
  const client = useQueryClient()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onClick)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  async function markAll() {
    await api.post("/notifications/read")
    client.invalidateQueries({ queryKey: keys.notifications })
  }

  async function markOne(id: string) {
    await api.post(`/notifications/${id}/read`)
    client.invalidateQueries({ queryKey: keys.notifications })
  }

  const unread = data?.unread ?? 0
  const items = data?.notifications ?? []

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="relative grid size-10 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-text"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-x-3 top-16 z-40 origin-top-right overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[380px]"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="font-display font-semibold">{t("Notifications")}</p>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button onClick={markAll} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-brand hover:bg-brand-soft">
                    <CheckCheck className="size-3.5" /> {t("Mark all read")}
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted hover:bg-surface-2 sm:hidden" aria-label={t("Close")}>
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto scroll-thin">
              {items.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <Bell className="mx-auto size-7 text-muted/60" />
                  <p className="mt-2 text-sm font-medium">{t("You're all caught up")}</p>
                  <p className="mt-1 text-[12px] text-muted">{t("Overspending, bills due soon and new recurring payments will show up here.")}</p>
                </div>
              ) : (
                items.map((item) => {
                  const style = ICONS[item.kind]
                  const Icon = style.icon
                  return (
                    <button
                      key={item.id}
                      onClick={() => !item.read && markOne(item.id)}
                      className={clsx("flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-surface-2", !item.read && "bg-brand-soft/40")}
                    >
                      <span className={clsx("grid size-8 shrink-0 place-items-center rounded-lg", style.tone)}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-[13px] font-medium">{t(item.title)}</span>
                          {!item.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-muted">{t(item.body)}</span>
                        <span className="mt-1 block text-[11px] text-muted/80">{formatDistanceToNowStrict(item.createdAt)}</span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
