import { LanguageToggle, t } from "../lib/i18n"
import { useQueryClient } from "@tanstack/react-query"
import clsx from "clsx"
import { AnimatePresence, motion } from "framer-motion"
import { CalendarDays, CircleHelp, Goal, Scale, LayoutDashboard, ListFilter, LogOut, Moon, Plus, Settings, Sun, Upload } from "lucide-react"
import { useEffect, useState } from "react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { api } from "../lib/api"
import { useMe } from "../lib/queries"
import { useTheme } from "../lib/theme"
import { AddTransactionDialog } from "./AddTransactionDialog"
import { ImportDialog } from "./ImportDialog"
import { Logo } from "./Logo"
import { NotificationCenter } from "./NotificationCenter"
import { Tour, tourSeen } from "./Tour"
import { Button } from "./ui"

const NAV = [
  { to: "/app", label: "Today", icon: LayoutDashboard, end: true },
  { to: "/app/afford", label: "Afford?", icon: Scale },
  { to: "/app/month", label: "Month", icon: CalendarDays },
  { to: "/app/activity", label: "Activity", icon: ListFilter },
  { to: "/app/goals", label: "Goals", icon: Goal },
  { to: "/app/settings", label: "Settings", icon: Settings },
]

export interface ShellContext {
  openImport: () => void
  openAdd: () => void
}

export function AppShell() {
  const { data: user } = useMe()
  const { resolved, setTheme } = useTheme()
  const [importing, setImporting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [touring, setTouring] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const client = useQueryClient()

  // First visit after login: walk the user through the app.
  useEffect(() => {
    if (!user) return
    let pending = false
    try {
      pending = sessionStorage.getItem("paydayly-tour-pending") === "1"
      sessionStorage.removeItem("paydayly-tour-pending")
    } catch {
      /* ignore */
    }
    if (pending || !tourSeen(user.id)) setTouring(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function logout() {
    await api.post("/auth/logout").catch(() => undefined)
    client.clear()
    navigate("/login")
  }

  const initials = (user?.name ?? "")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const context: ShellContext = { openImport: () => setImporting(true), openAdd: () => setAdding(true) }

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
        <NavLink to="/app" className="px-2">
          <Logo />
        </NavLink>
        <nav className="mt-8 space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-tour={`nav-${item.to.split("/")[2] ?? "today"}`}
              className={({ isActive }) =>
                clsx(
                  "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "text-brand" : "text-muted hover:bg-surface-2 hover:text-text",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-brand-soft" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  <item.icon className="relative size-[18px]" />
                  <span className="relative">{t(item.label)}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 space-y-2">
          <Button className="w-full" icon={Upload} onClick={context.openImport} data-tour="import">
            {t("Import statement")}
          </Button>
          <Button className="w-full" variant="secondary" icon={Plus} onClick={context.openAdd} data-tour="add">
            {t("Add transaction")}
          </Button>
        </div>
        <div className="mt-auto flex items-center gap-3 rounded-xl border border-line p-3">
          <span className="grid size-9 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand">{initials || "B"}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{t(user?.name)}</p>
            <p className="truncate text-[12px] text-muted">{user?.email}</p>
          </div>
          <button onClick={logout} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label={t("Log out")} title={t("Log out")}>
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-md sm:px-6 lg:px-10">
        <NavLink to="/app" className="lg:hidden">
          <Logo />
        </NavLink>
        <div className="hidden text-sm text-muted lg:block">
          {new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date())}
        </div>
        <div className="flex items-center gap-1">
          <LanguageToggle className="h-10 rounded-xl" />
          <button
            onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
            className="grid size-10 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-text"
            aria-label={t("Toggle dark mode")}
          >
            {resolved === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>
          <button
            onClick={() => setTouring(true)}
            className="grid size-10 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-text"
            aria-label={t("Take the tour")}
            title={t("Take the tour")}
          >
            <CircleHelp className="size-[18px]" />
          </button>
          <NotificationCenter />
          <button onClick={context.openImport} data-tour="import" className="grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-text lg:hidden" aria-label={t("Import statement")}>
            <Upload className="size-[18px]" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12">
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
            <Outlet context={context} />
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="relative mx-auto grid max-w-lg grid-cols-6">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-tour={`nav-${item.to.split("/")[2] ?? "today"}`}
              className={({ isActive }) => clsx("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", isActive ? "text-brand" : "text-muted")}
            >
              <item.icon className="size-5" />
              {t(item.label)}
            </NavLink>
          ))}
        </div>
      </nav>
      <button
        onClick={context.openAdd}
        data-tour="add"
        className="fixed bottom-20 right-4 z-30 grid size-14 place-items-center rounded-2xl bg-brand text-white shadow-xl shadow-brand/30 dark:text-[#0b1f33] lg:hidden"
        aria-label={t("Add transaction")}
      >
        <Plus className="size-6" />
      </button>

      {user && <Tour userId={user.id} open={touring} onClose={() => setTouring(false)} />}
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      <AddTransactionDialog open={adding} onClose={() => setAdding(false)} asOf={user?.profile.asOfDate ?? undefined} />
    </div>
  )
}
