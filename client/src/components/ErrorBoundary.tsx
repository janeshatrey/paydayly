import { t } from "../lib/i18n"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Component, type ReactNode } from "react"
import { Button } from "./ui"

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-sm text-center">
          <AlertTriangle className="mx-auto size-10 text-accent" />
          <h1 className="mt-4 font-display text-xl font-bold">{t("Something broke on this screen")}</h1>
          <p className="mt-2 text-sm text-muted">{t("Your data is safe. Reloading usually fixes this.")}</p>
          <Button className="mt-6" icon={RefreshCw} onClick={() => window.location.reload()}>
            {t("Reload")}
          </Button>
        </div>
      </div>
    )
  }
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-sm py-16 text-center">
      <AlertTriangle className="mx-auto size-9 text-accent" />
      <p className="mt-3 font-display text-lg font-semibold">{t("Could not load this page")}</p>
      <p className="mt-1 text-sm text-muted">{(error as Error)?.message ?? t("Please try again.")}</p>
      <Button className="mt-5" variant="secondary" icon={RefreshCw} onClick={onRetry}>
        {t("Try again")}
      </Button>
    </div>
  )
}
