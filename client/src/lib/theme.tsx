import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

export type ThemeChoice = "light" | "dark" | "system"

const ThemeContext = createContext<{ theme: ThemeChoice; resolved: "light" | "dark"; setTheme: (t: ThemeChoice) => void }>({
  theme: "system",
  resolved: "light",
  setTheme: () => {},
})

function systemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeChoice>(() => (localStorage.getItem("paydayly-theme") as ThemeChoice) || "system")
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    theme === "dark" || (theme === "system" && systemDark()) ? "dark" : "light",
  )

  useEffect(() => {
    const apply = () => {
      const next = theme === "dark" || (theme === "system" && systemDark()) ? "dark" : "light"
      document.documentElement.classList.toggle("dark", next === "dark")
      setResolved(next)
    }
    apply()
    localStorage.setItem("paydayly-theme", theme)
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [theme])

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
