export { formatExactINR, formatINR, parseRupeeInput, rupeeInputFromPaise } from "@paydayly/shared"

export function compactINR(paise: number): string {
  const rupees = Math.abs(paise) / 100
  const sign = paise < 0 ? "−" : ""
  if (rupees >= 1_00_00_000) return `${sign}₹${(rupees / 1_00_00_000).toFixed(1)}Cr`
  if (rupees >= 1_00_000) return `${sign}₹${(rupees / 1_00_000).toFixed(1)}L`
  if (rupees >= 1_000) return `${sign}₹${(rupees / 1_000).toFixed(1)}k`
  return `${sign}₹${Math.round(rupees)}`
}
