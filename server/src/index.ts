import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createApp } from "./app"
import { openDatabase } from "./db"
import { aiConfigFromEnv } from "./services/ai"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const envFile = path.join(root, ".env")
if (fs.existsSync(envFile) && typeof process.loadEnvFile === "function") process.loadEnvFile(envFile)
const LEGACY = ["B", "AA", "KI"].join("")
const dataDir = process.env.PAYDAYLY_DATA_DIR ?? process.env[`${LEGACY}_DATA_DIR`] ?? path.join(root, "data")
fs.mkdirSync(dataDir, { recursive: true })

function loadSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  const file = path.join(dataDir, "session-secret")
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString("hex"), { mode: 0o600 })
  return fs.readFileSync(file, "utf8").trim()
}

function trustProxy(raw: string | undefined): string | number | boolean | undefined {
  if (!raw || raw === "false" || raw === "0") return undefined
  if (raw === "true") return true
  return /^\d+$/.test(raw) ? Number(raw) : raw
}

const production = process.env.NODE_ENV === "production"
// Databases created before the rename used the old file name: move them (with WAL files) once.
const dbFile = path.join(dataDir, "paydayly.db")
const legacyDb = path.join(dataDir, `${LEGACY.toLowerCase()}.db`)
if (!fs.existsSync(dbFile) && fs.existsSync(legacyDb)) {
  for (const suffix of ["", "-wal", "-shm"]) if (fs.existsSync(legacyDb + suffix)) fs.renameSync(legacyDb + suffix, dbFile + suffix)
}
const db = openDatabase(dbFile)
const app = createApp(db, {
  secret: loadSecret(),
  secureCookies: process.env.SECURE_COOKIES === "true",
  authRateLimit: production ? 20 : 200,
  staticDir: path.join(root, "..", "client", "dist"),
  trustProxy: trustProxy(process.env.TRUST_PROXY),
  logResetLinks: !production || process.env.LOG_RESET_LINKS === "true",
  publicUrl: process.env.PUBLIC_URL,
  ai: aiConfigFromEnv(process.env),
})

const port = Number(process.env.PORT ?? 4000)
app.listen(port, () => {
  console.log(`Paydayly API listening on http://localhost:${port}`)
  console.log(process.env.GROQ_API_KEY ? "AI helper is on for every user." : "AI helper off: no GROQ_API_KEY set.")
})
