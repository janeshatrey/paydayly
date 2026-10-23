export function morningLine(safe: string, pool: string): string {
  return `Good morning. Safe to spend today: ${safe}. Flexible pool left: ${pool}.`
}

export function nightLine(spent: string, safe: string, gap: string, tomorrow: string | null): string {
  const next = tomorrow ? ` Tomorrow's safe amount is ${tomorrow}.` : " This is the last day of the month."
  return `You spent ${spent} against ${safe}, ${gap}.${next}`
}

export function gapPhrase(gapDisplayRupees: number, format: (rupees: number) => string): string {
  if (gapDisplayRupees > 0) return `over by ${format(gapDisplayRupees)}`
  if (gapDisplayRupees < 0) return `under by ${format(-gapDisplayRupees)}`
  return "right on the day's amount"
}
