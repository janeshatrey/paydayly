import cookieParser from "cookie-parser"
import express from "express"
import helmet from "helmet"
import fs from "node:fs"
import path from "node:path"
import type { DB } from "./db"
import type { AiConfig } from "./services/ai"
import { requireAuth } from "./lib/auth"
import { errorHandler, HttpError } from "./lib/http"
import { aiRoutes } from "./routes/ai"
import { authRoutes } from "./routes/auth"
import { backupRoutes } from "./routes/backup"
import { moneyRoutes } from "./routes/money"
import { goalRoutes } from "./routes/goals"
import { insightRoutes } from "./routes/insights"
import { notificationRoutes } from "./routes/notifications"
import { profileRoutes } from "./routes/profile"
import { transactionRoutes } from "./routes/transactions"

export interface AppConfig {
  secret: string
  secureCookies: boolean
  authRateLimit: number
  staticDir?: string
  trustProxy?: string | number | boolean
  logResetLinks?: boolean
  publicUrl?: string
  onResetToken?: (email: string, token: string) => void
  ai?: AiConfig
}

export function createApp(db: DB, config: AppConfig) {
  const app = express()
  app.disable("x-powered-by")
  if (config.trustProxy !== undefined && config.trustProxy !== false) app.set("trust proxy", config.trustProxy)
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(express.json({ limit: "20mb" }))
  app.use(cookieParser())

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true })
  })
  app.use("/api/auth", authRoutes(db, config))

  const auth = requireAuth(db, config.secret)
  const userExists = db.prepare("SELECT 1 FROM users WHERE id = ?")
  app.use("/api", auth, (req, _res, next) => {
    if (!userExists.get(req.userId)) throw new HttpError(401, "Please sign in to continue.")
    next()
  })
  app.use("/api", profileRoutes(db))
  app.use("/api", transactionRoutes(db))
  app.use("/api", goalRoutes(db))
  app.use("/api", insightRoutes(db))
  app.use("/api", notificationRoutes(db))
  app.use("/api", moneyRoutes(db))
  app.use("/api", backupRoutes(db))
  app.use("/api", aiRoutes(db, config.ai))
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found.")))

  if (config.staticDir && fs.existsSync(config.staticDir)) {
    const dir = config.staticDir
    // Digital Asset Links for the Android app (dot-directories are skipped by default).
    app.use("/.well-known", express.static(path.join(dir, ".well-known"), { dotfiles: "allow", maxAge: 0 }))
    app.get("/sw.js", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache")
      res.sendFile(path.join(dir, "sw.js"))
    })
    app.use(express.static(dir, { index: false, maxAge: "1h" }))
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dir, "index.html")))
  }

  app.use(errorHandler)
  return app
}
