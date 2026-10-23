import { LogoMark } from "./components/Logo"
import { Loader2 } from "lucide-react"
import { lazy, Suspense, type ReactNode } from "react"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import { Toaster } from "sonner"
import { AppShell } from "./components/AppShell"
import { useMe } from "./lib/queries"
import { useTheme } from "./lib/theme"
import { ForgotPage, LoginPage, ResetPage, SignupPage } from "./pages/Auth"
import { LandingPage } from "./pages/Landing"
import { NotFoundPage } from "./pages/NotFound"
const ActivityPage = lazy(() => import("./pages/Activity").then((module) => ({ default: module.ActivityPage })))
const AffordPage = lazy(() => import("./pages/Afford").then((module) => ({ default: module.AffordPage })))
const DashboardPage = lazy(() => import("./pages/Dashboard").then((module) => ({ default: module.DashboardPage })))
const GoalsPage = lazy(() => import("./pages/Goals").then((module) => ({ default: module.GoalsPage })))
const MonthPage = lazy(() => import("./pages/Month").then((module) => ({ default: module.MonthPage })))
const OnboardingPage = lazy(() => import("./pages/Onboarding").then((module) => ({ default: module.OnboardingPage })))
const SettingsPage = lazy(() => import("./pages/Settings").then((module) => ({ default: module.SettingsPage })))

const PublicTourPage = lazy(() => import("./pages/PublicTour").then((module) => ({ default: module.PublicTourPage })))

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
      <Suspense fallback={<FullScreenLoader />}><Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/tour" element={<PublicTourPage />} />
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
      </Routes></Suspense>
      <Toaster theme={resolved} position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
    </>
  )
}
