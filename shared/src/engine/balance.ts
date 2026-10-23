import type { Account, MoneyContext, Receivable, Transaction } from "../types"

export const MAIN_ACCOUNT_ID = "main"

export function primaryAccountId(accounts: Account[]): string {
  return accounts.find((account) => account.primary)?.id ?? accounts.find((account) => account.spending)?.id ?? MAIN_ACCOUNT_ID
}

export function accountOf(tx: Transaction, primary: string): string {
  return tx.accountId || primary
}

function effectOn(tx: Transaction, accountId: string, primary: string): number {
  if (tx.pending) return 0
  const signed = tx.direction === "credit" ? tx.amountPaise : -tx.amountPaise
  if (accountOf(tx, primary) === accountId) return signed
  if (tx.counterAccountId === accountId) return -signed
  return 0
}

export interface AccountBalance {
  account: Account
  confirmed: { date: string; balancePaise: number } | null
  balancePaise: number | null
}

export function accountBalances(transactions: Transaction[], context: MoneyContext, asOf: string): AccountBalance[] {
  const primary = primaryAccountId(context.accounts)
  return context.accounts.map((account) => {
    const latest = context.confirmations
      .filter((entry) => entry.accountId === account.id && entry.date <= asOf)
      .reverse()
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    if (!latest) {
      if (account.kind === "card" || account.kind === "loan") {
        const owed = -transactions.filter((tx) => tx.date <= asOf).reduce((sum, tx) => sum + effectOn(tx, account.id, primary), 0)
        return { account, confirmed: null, balancePaise: owed }
      }
      return { account, confirmed: null, balancePaise: null }
    }
    const moved = transactions
      .filter((tx) => tx.date > latest.date && tx.date <= asOf)
      .reduce((sum, tx) => sum + effectOn(tx, account.id, primary), 0)
    const liability = account.kind === "card" || account.kind === "loan"
    return {
      account,
      confirmed: { date: latest.date, balancePaise: latest.balancePaise },
      balancePaise: liability ? latest.balancePaise - moved : latest.balancePaise + moved,
    }
  })
}

export interface ConfirmedCash {
  cashPaise: number
  confirmedOn: string
  accounts: string[]
  cardOwedPaise: number
  loanOwedPaise: number
}

export function confirmedCash(transactions: Transaction[], context: MoneyContext, asOf: string): ConfirmedCash | null {
  const balances = accountBalances(transactions, context, asOf)
  const primary = primaryAccountId(context.accounts)
  const main = balances.find((entry) => entry.account.id === primary)
  if (!main?.confirmed) return null
  const spending = balances.filter((entry) => (entry.account.kind === "bank" || entry.account.kind === "cash") && entry.account.spending && entry.confirmed && entry.balancePaise !== null)
  return {
    cashPaise: spending.reduce((sum, entry) => sum + (entry.balancePaise ?? 0), 0),
    confirmedOn: spending.reduce((oldest, entry) => (entry.confirmed!.date < oldest ? entry.confirmed!.date : oldest), main.confirmed.date),
    accounts: spending.map((entry) => entry.account.name),
    cardOwedPaise: balances.filter((entry) => entry.account.kind === "card").reduce((sum, entry) => sum + Math.max(entry.balancePaise ?? 0, 0), 0),
    loanOwedPaise: balances.filter((entry) => entry.account.kind === "loan").reduce((sum, entry) => sum + Math.max(entry.balancePaise ?? 0, 0), 0),
  }
}

export interface ReceivableSummary {
  openPaise: number
  pendingRefundPaise: number
  open: Receivable[]
}

export function summariseReceivables(receivables: Receivable[]): ReceivableSummary {
  const open = receivables.filter((item) => item.status === "open")
  const left = (item: Receivable) => Math.max(item.amountPaise - item.settledPaise, 0)
  return {
    openPaise: open.filter((item) => item.kind !== "refund").reduce((sum, item) => sum + left(item), 0),
    pendingRefundPaise: open.filter((item) => item.kind === "refund").reduce((sum, item) => sum + left(item), 0),
    open,
  }
}

export interface SettlementSuggestion {
  txId: string
  receivableId: string
  counterparty: string
  amountPaise: number
  reason: string
}

export function suggestSettlements(transactions: Transaction[], receivables: Receivable[]): SettlementSuggestion[] {
  const open = receivables.filter((item) => item.status === "open")
  const suggestions: SettlementSuggestion[] = []
  const used = new Set<string>()
  const credits = transactions
    .filter((tx) => tx.direction === "credit" && !tx.pending && !tx.receivableId && tx.category !== "Income" && !tx.transfer)
    .sort((a, b) => a.date.localeCompare(b.date))
  for (const item of open) {
    const left = item.amountPaise - item.settledPaise
    const name = item.counterparty.toLowerCase().split(/\s+/).filter((word) => word.length >= 3)
    const match = credits.find((tx) => {
      if (used.has(tx.id) || tx.date < item.date) return false
      const text = `${tx.narration} ${tx.merchant}`.toLowerCase()
      const named = name.some((word) => text.includes(word))
      return (named && tx.amountPaise <= left) || tx.amountPaise === left
    })
    if (!match) continue
    used.add(match.id)
    const named = name.some((word) => `${match.narration} ${match.merchant}`.toLowerCase().includes(word))
    suggestions.push({
      txId: match.id,
      receivableId: item.id,
      counterparty: item.counterparty,
      amountPaise: match.amountPaise,
      reason: named ? `Credit mentions ${item.counterparty}` : "Same amount as what is owed",
    })
  }
  return suggestions
}
