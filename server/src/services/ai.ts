import crypto from "node:crypto"
import { z, type ZodType } from "zod"
import { INDIAN_DATE_IN_TEXT, parseIndianDate } from "@paydayly/shared"
import type { DB } from "../db"
import { now } from "../lib/ids"

export interface AiConfig {
  apiKey?: string
  model: string
  baseUrl: string
  dailyLimit: number
  timeoutMs: number
  fetchImpl?: typeof fetch
}

export function aiConfigFromEnv(env: NodeJS.ProcessEnv): AiConfig {
  return {
    apiKey: env.GROQ_API_KEY?.trim() || undefined,
    model: env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
    baseUrl: env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1",
    dailyLimit: Number(env.AI_DAILY_LIMIT ?? 40),
    timeoutMs: 12_000,
  }
}

export type AiOutcome<T> = { ok: true; value: T; cached: boolean } | { ok: false; reason: "off" | "limit" | "error" | "invalid" }

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function takeQuota(db: DB, userId: string, limit: number): boolean {
  const day = today()
  const row = db.prepare("SELECT count FROM ai_usage WHERE user_id = ? AND day = ?").get(userId, day) as { count: number } | undefined
  if ((row?.count ?? 0) >= limit) return false
  db.prepare("INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1").run(userId, day)
  return true
}

export async function askJson<T>(
  db: DB,
  userId: string,
  config: AiConfig | undefined,
  feature: string,
  system: string,
  payload: unknown,
  schema: ZodType<T>,
): Promise<AiOutcome<T>> {
  if (!config?.apiKey) return { ok: false, reason: "off" }
  const user = JSON.stringify(payload)
  const key = crypto.createHash("sha256").update(`${config.model}|${feature}|${system}|${user}`).digest("hex")
  const hit = db.prepare("SELECT response, created_at FROM ai_cache WHERE user_id = ? AND key = ?").get(userId, key) as
    | { response: string; created_at: string }
    | undefined
  if (hit && Date.now() - Date.parse(hit.created_at) < 6 * 3_600_000) {
    const cached = schema.safeParse(JSON.parse(hit.response))
    if (cached.success) return { ok: true, value: cached.data, cached: true }
  }
  if (!takeQuota(db, userId, config.dailyLimit)) return { ok: false, reason: "limit" }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await (config.fetchImpl ?? fetch)(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 1200,
        ...(config.model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${system}\nReply with a single JSON object and nothing else.` },
          { role: "user", content: user },
        ],
      }),
    })
    if (response.status === 429) return { ok: false, reason: "limit" }
    if (!response.ok) return { ok: false, reason: "error" }
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
    const text = data.choices?.[0]?.message?.content ?? ""
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return { ok: false, reason: "invalid" }
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) return { ok: false, reason: "invalid" }
    db.prepare("INSERT OR REPLACE INTO ai_cache (user_id, key, response, created_at) VALUES (?, ?, ?, ?)").run(userId, key, JSON.stringify(parsed.data), now())
    return { ok: true, value: parsed.data, cached: false }
  } catch {
    return { ok: false, reason: "error" }
  } finally {
    clearTimeout(timer)
  }
}

export const questionSchema = z.object({
  intent: z.enum(["afford", "status", "unknown"]),
  amountRupees: z.number().nonnegative().max(100_000_000).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  item: z.string().max(80).nullable().optional(),
})

export const draftsSchema = z.object({
  entries: z
    .array(
      z.object({
        amountRupees: z.number().positive().max(10_000_000),
        description: z.string().min(1).max(80),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        direction: z.enum(["debit", "credit"]).default("debit"),
      }),
    )
    .max(20),
})

export const prose = z.object({ text: z.string().min(1).max(700) })

const AMOUNT = /(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(k|thousand|hazaar|hazar)?/i

function rupeesFrom(raw: string, suffix?: string): number {
  const value = Number(raw.replace(/,/g, ""))
  return suffix ? value * 1000 : value
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function ruleQuestion(text: string): z.infer<typeof questionSchema> {
  const match = text.match(AMOUNT)
  const lower = text.toLowerCase()
  const affordWords = /afford|buy|spend|purchase|le sak|kharid|lu |lun|book|order/.test(lower)
  if (match && (affordWords || /\?$/.test(text.trim()))) {
    return { intent: "afford", amountRupees: rupeesFrom(match[1], match[2]), date: null, item: null }
  }
  if (/left|paydayly|bacha|available|how much|kitna/.test(lower)) return { intent: "status" }
  return { intent: "unknown" }
}

// \b does not work around Devanagari letters, so the Hindi words use explicit spacing.
const DAY_WORDS: [RegExp, number][] = [
  [/\b(parso|parson)\b|(^|\s)(परसों|परसो)(?=\s|$)/i, -2],
  [/\b(kal|yesterday)\b|(^|\s)कल(?=\s|$)/i, -1],
  [/\b(aaj|today)\b|(^|\s)आज(?=\s|$)/i, 0],
]

export function latinDigits(text: string): string {
  return text.replace(/[०-९]/g, (digit) => String("०१२३४५६७८९".indexOf(digit)))
}

export function ruleEntries(text: string, asOf: string): z.infer<typeof draftsSchema>["entries"] {
  text = latinDigits(text)
  let offset = 0
  for (const [pattern, days] of DAY_WORDS) {
    if (pattern.test(text)) {
      offset = days
      break
    }
  }
  let date = shiftDate(asOf, offset)
  // An explicit Indian-style date ("22/10", "22 Oct") wins over day words.
  const explicit = text.match(INDIAN_DATE_IN_TEXT)
  if (explicit) {
    const parsed = parseIndianDate(explicit[0], asOf)
    if (parsed) {
      date = parsed
      text = text.replace(explicit[0], " ")
    }
  }
  const cleaned = text.replace(/\b(parso|parson|kal|yesterday|aaj|today)\b|(^|\s)(परसों|परसो|कल|आज)(?=\s|$)/gi, " ")
  const parts = cleaned.split(/\s*(?:,|;|\band\b|\baur\b|\bplus\b|&|\n)\s*|\s+(?:और|तथा)\s+/i).filter((part) => part.trim())
  const entries: z.infer<typeof draftsSchema>["entries"] = []
  for (const part of parts) {
    const match = part.match(AMOUNT)
    if (!match) continue
    const amountRupees = rupeesFrom(match[1], match[2])
    if (!(amountRupees > 0)) continue
    const description = part
      .replace(match[0], " ")
      .replace(/\b(pe|par|on|for|ke liye|ka|ki|ke|mein|me|in|spent|diye|kharch|rupees|rupaye|rs)\b|(^|\s)(पे|पर|के लिए|का|की|के|में|रुपये|रुपए|खर्च)(?=\s|$)/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
    const credit = /\b(got|received|mila|mile|aaya|refund)\b/i.test(part)
    entries.push({ amountRupees, description: description ? description[0].toUpperCase() + description.slice(1) : "Cash spend", date, direction: credit ? "credit" : "debit" })
  }
  return entries
}

export function numbersAllowed(text: string, allowed: number[]): boolean {
  const figures = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []
  const set = new Set(allowed.map((value) => Math.round(value)))
  return figures.every((figure) => {
    const value = Math.round(Number(figure.replace(/,/g, "")))
    return set.has(value) || value <= 31
  })
}
