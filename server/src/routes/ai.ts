import { checkAffordability, formatINR, type AffordResult } from "@paydayly/shared"
import { Router } from "express"
import { z } from "zod"
import type { DB } from "../db"
import { userOf } from "../lib/auth"
import { body, HttpError } from "../lib/http"
import {
  askJson,
  draftsSchema,
  latinDigits,
  numbersAllowed,
  prose,
  questionSchema,
  ruleEntries,
  ruleQuestion,
  type AiConfig,
} from "../services/ai"
import { dashboardParts } from "../services/insights"

const askSchema = z.object({ question: z.string().trim().min(1).max(300) })
const parseSchema = z.object({ text: z.string().trim().min(1).max(500) })

interface Line {
  label: string
  paise: number
}

function rupees(paise: number): number {
  return Math.round(paise / 100)
}

function affordFigures(result: AffordResult): number[] {
  const values = [
    result.availableBeforePaise, result.availableAfterPaise, result.dailyBeforePaise, result.dailyAfterPaise,
    result.extraBillsPaise, result.goal?.reducedByPaise ?? 0, ...result.underfunded.map((item) => item.shortPaise),
  ]
  return [...values.map(rupees), ...values.map((value) => Math.abs(rupees(value))), result.daysLeft, result.goal?.monthsLater ?? 0]
}

export function describeChange(previous: { date: string; availablePaise: number; lines: Line[] } | null, current: { availablePaise: number; lines: Line[] }) {
  if (!previous) return { deltaPaise: 0, since: null, reasons: [] as { label: string; deltaPaise: number }[] }
  const before = new Map(previous.lines.map((line) => [line.label, line.paise]))
  const reasons: { label: string; deltaPaise: number }[] = []
  for (const line of current.lines) {
    const delta = line.paise - (before.get(line.label) ?? 0)
    before.delete(line.label)
    if (delta !== 0) reasons.push({ label: line.label, deltaPaise: delta })
  }
  for (const [label, paise] of before) if (paise !== 0) reasons.push({ label, deltaPaise: -paise })
  reasons.sort((a, b) => Math.abs(b.deltaPaise) - Math.abs(a.deltaPaise))
  return { deltaPaise: current.availablePaise - previous.availablePaise, since: previous.date, reasons: reasons.slice(0, 5) }
}

export function aiRoutes(db: DB, config: AiConfig | undefined): Router {
  const router = Router()
  // The AI money helper is available whenever the server has a key.
  const enabledFor = (_userId: string) => Boolean(config?.apiKey)

  router.get("/ai/status", (req, res) => {
    const userId = userOf(req)
    res.json({ available: Boolean(config?.apiKey), enabled: enabledFor(userId), model: config?.apiKey ? config.model : null })
  })

  router.post("/ai/ask", async (req, res) => {
    const userId = userOf(req)
    const input = body(askSchema, req)
    const { snapshot, settings, asOf } = dashboardParts(db, userId)
    let source: "ai" | "rules" = "rules"
    let parsed = ruleQuestion(input.question)
    let note: string | null = null
    if (enabledFor(userId)) {
      const outcome = await askJson(db, userId, config, "question",
        `You turn a personal-finance question from an Indian user into structured intent. Today is ${asOf}. ` +
          'Return {"intent":"afford"|"status"|"unknown","amountRupees":number|null,"date":"YYYY-MM-DD"|null,"item":string|null}. ' +
          "Use afford when they ask whether they can buy or spend something. Never invent an amount.",
        { question: input.question }, questionSchema)
      if (outcome.ok) {
        // Keep the simple reader's answer when the model shrugs but the rules understood.
        if (outcome.value.intent !== "unknown" || parsed.intent === "unknown") {
          parsed = outcome.value
          source = "ai"
        }
      } else if (outcome.reason === "limit") note = "The AI helper is resting for today, so this used the simple reader."
    }

    if (parsed.intent === "afford" && parsed.amountRupees) {
      const date = parsed.date && parsed.date > asOf ? parsed.date : asOf
      const result = checkAffordability(snapshot, settings, { amountPaise: Math.round(parsed.amountRupees * 100), date, goalId: null, paydayLateDays: 0 })
      let explanation = `${result.headline} ${result.assumptions[0] ?? ""}`.trim()
      if (enabledFor(userId)) {
        const figures = {
          item: parsed.item ?? null,
          verdict: result.verdict,
          amount: rupees(Math.round(parsed.amountRupees * 100)),
          leftBefore: rupees(result.availableBeforePaise),
          leftAfter: rupees(result.availableAfterPaise),
          dailyBefore: rupees(result.dailyBeforePaise),
          dailyAfter: rupees(result.dailyAfterPaise),
          daysLeft: result.daysLeft,
          underfunded: result.underfunded.map((item) => ({ name: item.name, short: rupees(item.shortPaise) })),
          goal: result.goal ? { name: result.goal.name, monthsLater: result.goal.monthsLater } : null,
          basis: snapshot.headline.basis,
        }
        const outcome = await askJson(db, userId, config, "explain-afford",
          "Explain this affordability result to the user in two short, plain sentences. Use only the numbers given, in rupees with the ₹ sign. " +
            'Do not do new arithmetic. If basis is "estimate", say it is an estimate. Only mention a savings goal if "goal" is not null. Return {"text": string}.',
          figures, prose)
        const allowed = [...affordFigures(result), figures.amount]
        // Drop replies that bring up a goal the user did not pick.
        const strayGoal = outcome.ok && settings.goals.some((goal) => goal.name !== figures.goal?.name && outcome.value.text.toLowerCase().includes(goal.name.toLowerCase()))
        if (outcome.ok && !strayGoal && numbersAllowed(outcome.value.text, allowed)) {
          explanation = outcome.value.text
          source = "ai"
        }
      }
      res.json({ intent: "afford", source, note, result, explanation })
      return
    }
    if (parsed.intent === "status") {
      res.json({
        intent: "status",
        source,
        note,
        explanation: `${snapshot.headline.basis === "estimate" ? "About" : "Exactly"} ${formatINR(snapshot.headline.availablePaise)} is left to spend this cycle. ${snapshot.freshness.balanceNote ?? ""}`.trim(),
      })
      return
    }
    res.json({ intent: "unknown", source, note, explanation: "Try something like “Can I afford ₹3,000 shoes on Saturday?”" })
  })

  router.post("/ai/parse", async (req, res) => {
    const userId = userOf(req)
    const input = body(parseSchema, req)
    const { asOf } = dashboardParts(db, userId)
    let entries = ruleEntries(input.text, asOf)
    let source: "ai" | "rules" = "rules"
    if (enabledFor(userId)) {
      const outcome = await askJson(db, userId, config, "parse",
        `Turn a short note about spending (English, Hindi or Hinglish) into separate entries. Today is ${asOf}; "kal" usually means yesterday for past spends, "aaj" today, "parso" two days ago. ` +
          'Return {"entries":[{"amountRupees":number,"description":string,"date":"YYYY-MM-DD","direction":"debit"|"credit"}]}. ' +
          "Use only amounts written in the note. Keep descriptions to two or three words.",
        { note: input.text }, draftsSchema)
      if (outcome.ok) {
        const written = ruleEntries(input.text, asOf).map((entry) => entry.amountRupees)
        const allowed = new Set((latinDigits(input.text).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((value) => Number(value.replace(/,/g, ""))))
        const trustworthy = outcome.value.entries.every((entry) => allowed.has(entry.amountRupees) || written.includes(entry.amountRupees))
        if (trustworthy && outcome.value.entries.length) {
          entries = outcome.value.entries.filter((entry) => entry.date <= asOf)
          source = "ai"
        }
      }
    }
    res.json({
      source,
      drafts: entries.map((entry) => ({
        date: entry.date,
        amountPaise: Math.round(entry.amountRupees * 100),
        narration: entry.description.charAt(0).toUpperCase() + entry.description.slice(1),
        direction: entry.direction,
      })),
    })
  })

  router.get("/ai/explain-change", async (req, res) => {
    const userId = userOf(req)
    const { snapshot } = dashboardParts(db, userId)
    const previous = db
      .prepare("SELECT date, available_paise, lines FROM available_history WHERE user_id = ? AND date < ? ORDER BY date DESC LIMIT 1")
      .get(userId, snapshot.asOf) as { date: string; available_paise: number; lines: string } | undefined
    const change = describeChange(
      previous ? { date: previous.date, availablePaise: previous.available_paise, lines: JSON.parse(previous.lines) as Line[] } : null,
      snapshot.headline,
    )
    const plain = change.since
      ? change.reasons.length
        ? `Since ${change.since}, available money moved by ${formatINR(change.deltaPaise)}. Biggest reason: ${change.reasons[0].label} (${formatINR(change.reasons[0].deltaPaise)}).`
        : `Nothing changed since ${change.since}.`
      : "There is no earlier day to compare with yet."
    let explanation = plain
    let source: "ai" | "rules" = "rules"
    if (change.since && change.reasons.length && enabledFor(userId)) {
      const figures = { since: change.since, change: rupees(change.deltaPaise), reasons: change.reasons.map((item) => ({ label: item.label, change: rupees(item.deltaPaise) })) }
      const outcome = await askJson(db, userId, config, "explain-change",
        'In one or two short sentences, explain why the user\'s available money changed. Use only these numbers, in rupees with ₹. Return {"text": string}.',
        figures, prose)
      const allowed = [figures.change, Math.abs(figures.change), ...figures.reasons.flatMap((item) => [item.change, Math.abs(item.change)])]
      if (outcome.ok && numbersAllowed(outcome.value.text.replace(/\d{4}-\d{2}-\d{2}/g, ""), allowed)) {
        explanation = outcome.value.text
        source = "ai"
      }
    }
    res.json({ ...change, explanation, source })
  })

  router.use("/ai", () => {
    throw new HttpError(404, "Not found.")
  })

  return router
}
