import { useQueryClient } from "@tanstack/react-query"
import { Fragment, createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { api } from "./api"
import { HI } from "./i18n-hi"

export type Lang = "en" | "hi"
const STORAGE_KEY = "paydayly-lang"

function initial(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "hi" ? "hi" : "en"
  } catch {
    return "en"
  }
}

let current: Lang = initial()

/** Translate a UI string. Anything that is not a known English string passes through untouched. */
export function t<T>(value: T): T {
  if (current !== "hi" || typeof value !== "string") return value
  const hit = HI[value] ?? HI[value.trim()]
  return (hit ?? value) as T
}

/** Pick between two inline strings by language (for sentences with numbers inside). */
export function tr(en: string, hi: string) {
  return current === "hi" ? hi : en
}

export function currentLang() {
  return current
}

type Ctx = { lang: Lang; setLang: (lang: Lang) => void; toggle: () => void }
const LangContext = createContext<Ctx>({ lang: "en", setLang: () => {}, toggle: () => {} })

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setState] = useState<Lang>(current)
  const client = useQueryClient()

  useEffect(() => {
    document.documentElement.lang = lang === "hi" ? "hi" : "en-IN"
  }, [lang])

  const setLang = useCallback(
    (next: Lang) => {
      current = next
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* private mode */
      }
      setState(next)
      // Save on the profile too when signed in; ignore failures (logged out, offline).
      const me = client.getQueryData<{ profile?: { language?: Lang } } | null>(["me"])
      if (me && me.profile && me.profile.language !== next) {
        api
          .patch<{ user: unknown }>("/profile", { language: next })
          .then((data) => client.setQueryData(["me"], data.user))
          .catch(() => {})
      }
    },
    [client],
  )

  // A signed-in user with no local choice yet gets the language saved on their profile.
  useEffect(() => {
    return client.getQueryCache().subscribe(() => {
      const me = client.getQueryData<{ profile?: { language?: Lang } } | null>(["me"])
      const saved = me?.profile?.language
      let local: string | null = null
      try {
        local = localStorage.getItem(STORAGE_KEY)
      } catch {
        /* ignore */
      }
      if (saved && !local && saved !== current) {
        current = saved
        try {
          localStorage.setItem(STORAGE_KEY, saved)
        } catch {
          /* ignore */
        }
        setState(saved)
      }
    })
  }, [client])

  const toggle = useCallback(() => setLang(current === "hi" ? "en" : "hi"), [setLang])
  return (
    <LangContext.Provider value={{ lang, setLang, toggle }}>
      {/* Re-render the whole tree with the new dictionary. Query cache lives above, so no data is refetched. */}
      <Fragment key={lang}>{children}</Fragment>
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, toggle } = useLang()
  return (
    <button
      type="button"
      onClick={toggle}
      data-tour="lang"
      className={`inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-muted hover:bg-surface-2 hover:text-text ${className}`}
      aria-label={lang === "hi" ? "Switch to English" : "हिंदी में बदलें"}
      title={lang === "hi" ? "Switch to English" : "हिंदी में बदलें"}
    >
      <span aria-hidden>{lang === "hi" ? "EN" : "हि"}</span>
    </button>
  )
}
