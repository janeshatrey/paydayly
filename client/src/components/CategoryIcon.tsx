import type { Category } from "@paydayly/shared"
import { CATEGORY_STYLE } from "../lib/categories"

export function CategoryIcon({ category, size = "md" }: { category: Category; size?: "sm" | "md" }) {
  const style = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.Uncategorised
  const Icon = style.icon
  return (
    <span
      className={size === "sm" ? "grid size-7 shrink-0 place-items-center rounded-lg" : "grid size-9 shrink-0 place-items-center rounded-xl"}
      style={{ background: `${style.color}1f`, color: style.color }}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
    </span>
  )
}
