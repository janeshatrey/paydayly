import { t } from "../lib/i18n"
import { Link } from "react-router-dom"
import { Logo } from "../components/Logo"
import { Button } from "../components/ui"

export function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <Logo className="justify-center" />
        <p className="mt-10 font-display text-6xl font-bold text-brand">404</p>
        <h1 className="mt-3 font-display text-xl font-semibold">{t("This page does not exist")}</h1>
        <p className="mt-1 text-sm text-muted">{t("The link may be old, or the address has a typo.")}</p>
        <Link to="/" className="mt-6 inline-block">
          <Button>{t("Back to home")}</Button>
        </Link>
      </div>
    </div>
  )
}
