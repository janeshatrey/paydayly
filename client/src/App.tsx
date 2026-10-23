import { LogoMark } from "./components/Logo"
import { Loader2 } from "lucide-react"
import type { ReactNode } from "react"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import { Toaster } from "sonner"
import { AppShell } from "./components/AppShell"
import { useMe } from "./lib/queries"
import { useTheme } from "./lib/theme"
import { ActivityPage } from "./pages/Activity"
import { AffordPage } from "./pages/Afford"
import { ForgotPage, LoginPage, ResetPage, SignupPage } from "./pages/Auth"
import { DashboardPage } from "./pages/Dashboard"
import { GoalsPage } from "./pages/Goals"
import { LandingPage } from "./pages/Landing"
import { MonthPage } from "./pages/Month"
import { NotFoundPage } from "./pages/NotFound"
import { OnboardingPage } from "./pages/Onboarding"
import { SettingsPage } from "./pages/Settings"

function FullScreenLoader() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label="Loading Paydayly">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="size-14 animate-pulse motion-reduce:animate-none" />
        <Loader2 className="size-5 animate-spin text-brand motion-reduce:animate-none" />
      </div>
    </div>
  )
}

function RequireAuth({ children, onboarding }: { children: ReactNode; onboarding?: boolean }) {
  const { data: user, isLoading } = useMe()
  const location = useLocation()
  if (isLoading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!onboarding && !user.profile.onboarded) return <Navigate to="/welcome" replace />
  return <>{children}</>
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useMe()
  if (isLoading) return <FullScreenLoader />
  if (user) return <Navigate to={user.profile.onboarded ? "/app" : "/welcome"} replace />
  return <>{children}</>
}

export function App() {
  const { resolved } = useTheme()
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/signup" element={<GuestOnly><SignupPage /></GuestOnly>} />
        <Route path="/forgot" element={<GuestOnly><ForgotPage /></GuestOnly>} />
        <Route path="/reset" element={<ResetPage />} />
        <Route path="/welcome" element={<RequireAuth onboarding><OnboardingPage /></RequireAuth>} />
        <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<DashboardPage />} />
          <Route path="afford" element={<AffordPage />} />
          <Route path="month" element={<MonthPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster theme={resolved} position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
    </>
  )
}
