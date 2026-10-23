import { t } from "../lib/i18n"
import { useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Eye, EyeOff, ShieldCheck } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { Logo } from "../components/Logo"
import { Button, Field, Input } from "../components/ui"
import { api } from "../lib/api"
import { keys } from "../lib/queries"
import type { User } from "../lib/types"

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,520px)]">
      <div className="relative hidden overflow-hidden bg-[#0b1f33] p-12 text-white lg:flex lg:flex-col">
        <Link to="/">
          <span className="inline-flex items-center gap-2.5">
            <Logo onDark />
          </span>
        </Link>
        <div className="my-auto max-w-md">
          <p className="font-display text-4xl font-bold leading-tight">{t("Know what you can afford before payday.")}</p>
          <p className="mt-4 text-[15px] text-white/70">
            {t("Paydayly explains what you can afford before payday, and tells you when it doesn't have enough information.")}
          </p>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <p className="text-[12px] uppercase tracking-wider text-white/60">{t("Available for discretionary spending")}</p>
            <p className="mt-1 font-display text-4xl font-bold">₹14,860</p>
            <div className="mt-4 h-2 rounded-full bg-white/10">
              <div className="h-full w-[38%] rounded-full bg-[#e8a33d]" />
            </div>
            <p className="mt-2 text-[12px] text-white/60">{t("After rent, EMI, SIP and your Goa goal · 12 days to payday")}</p>
          </div>
        </div>
        <p className="flex items-center gap-2 text-[12px] text-white/50">
          <ShieldCheck className="size-4" /> {t("Passwords are stored as bcrypt hashes. Your data is private to your account.")}
        </p>
        <div className="pointer-events-none absolute -right-40 -top-40 size-[480px] rounded-full bg-[#0f7a5f]/40 blur-3xl" />
      </div>
      <div className="flex flex-col px-6 py-10 sm:px-12">
        <Link to="/" className="lg:hidden">
          <Logo />
        </Link>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto my-auto w-full max-w-sm py-10">
          <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-6 text-center text-sm text-muted">{footer}</p>
        </motion.div>
      </div>
    </div>
  )
}

function PasswordInput({ value, onChange, autoComplete, id }: { value: string; onChange: (v: string) => void; autoComplete: string; id: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required className="pr-11" />
      <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-text" aria-label={show ? t("Hide password") : t("Show password")}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

function useAuthSubmit(path: string) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit(payload: Record<string, string>) {
    setBusy(true)
    setError("")
    try {
      const { user } = await api.post<{ user: User }>(path, payload)
      client.setQueryData(keys.me, user)
      const from = (location.state as { from?: string } | null)?.from
      navigate(user.profile.onboarded ? from ?? "/app" : "/welcome", { replace: true })
      if (path.endsWith("signup")) toast.success(`Welcome to Paydayly, ${user.name.split(" ")[0]}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { submit, busy, error }
}

export function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const { submit, busy, error } = useAuthSubmit("/auth/login")
  return (
    <AuthLayout
      title={t("Welcome back")}
      subtitle={t("Log in to see what you can spend today.")}
      footer={
        <>
          {t("New to Paydayly?")}{" "}
          <Link to="/signup" className="font-medium text-brand hover:underline">
            {t("Create an account")}
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          submit({ email, password })
        }}
      >
        <Field label={t("Email")} htmlFor="email">
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
        </Field>
        <Field label={t("Password")} htmlFor="password">
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
          <Link to="/forgot" className="mt-1.5 inline-block text-[12px] font-medium text-brand hover:underline">
            {t("Forgot password?")}
          </Link>
        </Field>
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {t("Log in")}
        </Button>
      </form>
    </AuthLayout>
  )
}

export function SignupPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const { submit, busy, error } = useAuthSubmit("/auth/signup")
  const strength = password.length === 0 ? 0 : password.length < 8 ? 1 : /[^a-zA-Z]/.test(password) && password.length >= 10 ? 3 : 2
  return (
    <AuthLayout
      title={t("Create your account")}
      subtitle={t("Free, private, and set up in about two minutes.")}
      footer={
        <>
          {t("Already have an account?")}{" "}
          <Link to="/login" className="font-medium text-brand hover:underline">
            {t("Log in")}
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          submit({ name, email, password })
        }}
      >
        <Field label={t("Your name")} htmlFor="name">
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus />
        </Field>
        <Field label={t("Email")} htmlFor="email">
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </Field>
        <Field label={t("Password")} htmlFor="password" hint={t("At least 8 characters.")}>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" />
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[1, 2, 3].map((level) => (
              <span key={level} className={`h-1 rounded-full transition-colors ${strength >= level ? (strength === 1 ? "bg-danger" : strength === 2 ? "bg-accent" : "bg-ok") : "bg-line"}`} />
            ))}
          </div>
        </Field>
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {t("Create account")}
        </Button>
      </form>
    </AuthLayout>
  )
}

export function ForgotPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  return (
    <AuthLayout
      title={t("Reset your password")}
      subtitle={t("Request a password reset link, valid for 30 minutes.")}
      footer={
        <Link to="/login" className="font-medium text-brand hover:underline">
          {t("Back to log in")}
        </Link>
      }
    >
      {sent ? (
        <p className="rounded-xl bg-brand-soft px-4 py-3 text-[14px]">
          {t("If an account exists for")} {email}{t(", a reset link has been requested. Check your inbox and spam folder. If it does not arrive, try again or contact the site owner.")}
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault()
            setBusy(true)
            setError("")
            try {
              await api.post("/auth/forgot", { email })
              setSent(true)
            } catch (err) {
              setError((err as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          <Field label={t("Email")} htmlFor="email">
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
          </Field>
          {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {t("Send reset link")}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

export function ResetPage() {
  const [params] = useSearchParams()
  const token = params.get("token") ?? ""
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const navigate = useNavigate()
  const client = useQueryClient()
  return (
    <AuthLayout
      title={t("Choose a new password")}
      subtitle={t("Every device signed in to this account will be signed out.")}
      footer={
        <Link to="/login" className="font-medium text-brand hover:underline">
          {t("Back to log in")}
        </Link>
      }
    >
      {!token ? (
        <p className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{t("This link is missing its token. Ask for a new one.")}</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault()
            setBusy(true)
            setError("")
            try {
              await api.post("/auth/reset", { token, password })
              client.clear()
              toast.success(t("Password changed. Log in with the new one."))
              navigate("/login", { replace: true })
            } catch (err) {
              setError((err as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          <Field label={t("New password")} htmlFor="password" hint={t("At least 8 characters.")}>
            <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" />
          </Field>
          {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {t("Save new password")}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
