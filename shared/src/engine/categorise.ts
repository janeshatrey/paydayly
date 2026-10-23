import Fuse from "fuse.js"
import type { Category, Rule } from "../types"

export interface MerchantAlias {
  alias: string
  merchant: string
  category: Category
}

export const MERCHANTS: MerchantAlias[] = [
  { alias: "swiggy instamart", merchant: "Instamart", category: "Quick commerce" },
  { alias: "instamart", merchant: "Instamart", category: "Quick commerce" },
  { alias: "bigbasket", merchant: "BigBasket", category: "Quick commerce" },
  { alias: "blinkit", merchant: "Blinkit", category: "Quick commerce" },
  { alias: "zepto", merchant: "Zepto", category: "Quick commerce" },
  { alias: "zomato", merchant: "Zomato", category: "Food delivery" },
  { alias: "swiggy", merchant: "Swiggy", category: "Food delivery" },
  { alias: "amazon", merchant: "Amazon", category: "Shopping" },
  { alias: "flipkart", merchant: "Flipkart", category: "Shopping" },
  { alias: "myntra", merchant: "Myntra", category: "Shopping" },
  { alias: "croma", merchant: "Croma", category: "Shopping" },
  { alias: "uber", merchant: "Uber", category: "Transport" },
  { alias: "rapido", merchant: "Rapido", category: "Transport" },
  { alias: "irctc", merchant: "IRCTC", category: "Transport" },
  { alias: "ola", merchant: "Ola", category: "Transport" },
  { alias: "netflix", merchant: "Netflix", category: "Subscription" },
  { alias: "spotify", merchant: "Spotify", category: "Subscription" },
  { alias: "third wave", merchant: "Third Wave Coffee", category: "Coffee" },
  { alias: "blue tokai", merchant: "Blue Tokai", category: "Coffee" },
  { alias: "groww", merchant: "Groww", category: "SIP" },
  { alias: "truffles", merchant: "Truffles", category: "Eating out" },
  { alias: "hdfc home", merchant: "HDFC Home Loan", category: "EMI" },
]

const fuse = new Fuse(MERCHANTS, {
  keys: ["alias"],
  threshold: 0.34,
  ignoreLocation: true,
  includeScore: true,
})

export interface Categorisation {
  merchant: string
  category: Category
  categorySource: "user" | "dictionary" | "keyword" | "fuzzy" | "type" | "uncategorised"
  confidence: number
  transfer: boolean
  reason: string
}

function normalise(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()
}

function tokensOf(value: string): string[] {
  return normalise(value).split(" ").filter(Boolean)
}

function titleToken(token: string): string {
  return token.charAt(0) + token.slice(1).toLowerCase()
}

export function ruleMatches(pattern: string, narration: string): boolean {
  if (!pattern) return false
  return narration.toLowerCase().includes(pattern.toLowerCase()) || normalise(narration).includes(normalise(pattern))
}

export function similarPattern(narration: string, merchant: string): string {
  const alias = dictionaryMatch(normalise(narration), tokensOf(narration))
  if (alias) return alias.alias.toLowerCase()
  return merchant.toLowerCase()
}

export function categorise(narration: string, rules: Rule[]): Categorisation {
  const norm = normalise(narration)
  const tokens = tokensOf(narration)

  const rule = rules.find((item) => ruleMatches(item.pattern, narration))
  if (rule) {
    return {
      merchant: merchantFromDictionary(norm, tokens) ?? titleToken(rule.pattern),
      category: rule.category,
      categorySource: "user",
      confidence: 1,
      transfer: rule.category === "Transfer",
      reason: `Your rule: ${rule.pattern}`,
    }
  }

  if (/\bREFUND\b|\bREVERSAL\b|\bREVERSED\b/.test(norm)) {
    return typed(merchantFromDictionary(norm, tokens) ?? "Refund", "Refund", "Marked refund from the narration.")
  }
  if (/\bSELF TRANSFER\b|\bTRANSFER TO SELF\b|\bOWN ACCOUNT\b/.test(norm)) {
    return { ...typed("Self", "Transfer", "Marked as a transfer to your own account."), transfer: true }
  }
  if (/\bSALARY\b|\bPAYROLL\b/.test(norm)) {
    return typed("Salary", "Income", "Marked income because the narration says salary.")
  }

  const dict = dictionaryMatch(norm, tokens)
  if (dict) {
    return {
      merchant: dict.merchant,
      category: dict.category,
      categorySource: "dictionary",
      confidence: 0.95,
      transfer: false,
      reason: `Matched merchant alias: ${dict.merchant}`,
    }
  }

  const keyword = keywordMatch(norm, tokens)
  if (keyword) return keyword

  const fuzzy = fuzzyMatch(tokens)
  if (fuzzy) return fuzzy

  return {
    merchant: "Unknown",
    category: "Uncategorised",
    categorySource: "uncategorised",
    confidence: 0,
    transfer: false,
    reason: "No merchant or keyword matched.",
  }
}

function typed(merchant: string, category: Category, reason: string): Categorisation {
  return {
    merchant,
    category,
    categorySource: "type",
    confidence: 0.98,
    transfer: category === "Transfer",
    reason,
  }
}

function dictionaryMatch(norm: string, tokens: string[]): MerchantAlias | null {
  const ordered = [...MERCHANTS].sort((a, b) => b.alias.length - a.alias.length)
  for (const entry of ordered) {
    const aliasNorm = normalise(entry.alias)
    if (aliasNorm.includes(" ")) {
      if (norm.includes(aliasNorm)) return entry
      continue
    }
    if (tokens.includes(aliasNorm)) return entry
  }
  return null
}

function merchantFromDictionary(norm: string, tokens: string[]): string | null {
  return dictionaryMatch(norm, tokens)?.merchant ?? null
}

function keywordMatch(norm: string, tokens: string[]): Categorisation | null {
  const rules: { test: RegExp; category: Category; merchant: string; reason: string }[] = [
    { test: /\bRENT\b/, category: "Rent", merchant: "Rent", reason: "Keyword in the narration: rent" },
    { test: /\bEMI\b/, category: "EMI", merchant: "EMI", reason: "Keyword in the narration: EMI" },
    { test: /\bSIP\b/, category: "SIP", merchant: "SIP", reason: "Keyword in the narration: SIP" },
    { test: /\bBESCOM\b|\bELECTRICITY\b|\bRECHARGE\b|\bAIRTEL\b|\bJIO\b/, category: "Bills", merchant: "Bill", reason: "Keyword in the narration: bill or recharge" },
    { test: /\bCOFFEE\b|\bCHAI\b|\bCAFE\b/, category: "Coffee", merchant: "Coffee", reason: "Keyword in the narration: coffee" },
  ]
  for (const rule of rules) {
    if (!rule.test.test(norm)) continue
    const named = tokens.find((token) => token.length > 3 && !["UPI", "NEFT", "NACH", "PAYTM", "OKICICI", "YESBANK", "HDFC", "AXIS"].includes(token))
    return {
      merchant: rule.category === "Coffee" && named ? titleToken(named) : rule.merchant,
      category: rule.category,
      categorySource: "keyword",
      confidence: 0.8,
      transfer: false,
      reason: rule.reason,
    }
  }
  return null
}

function fuzzyMatch(tokens: string[]): Categorisation | null {
  let best: { item: MerchantAlias; score: number } | null = null
  for (const token of tokens) {
    if (token.length < 5) continue
    const hit = fuse.search(token)[0]
    if (!hit || hit.score === undefined) continue
    if (!best || hit.score < best.score) best = { item: hit.item, score: hit.score }
  }
  if (!best || best.score > 0.34) return null
  return {
    merchant: best.item.merchant,
    category: best.item.category,
    categorySource: "fuzzy",
    confidence: Number((1 - best.score).toFixed(2)),
    transfer: false,
    reason: `Close spelling of ${best.item.merchant}`,
  }
}
