import clsx from "clsx"

/** The Paydayly "P" mark, with a light-ink version for dark backgrounds. */
export function LogoMark({ className, onDark }: { className?: string; onDark?: boolean }) {
  const base = clsx("size-8 object-contain", className)
  if (onDark) return <img src="/logo-mark-light.png" alt="" aria-hidden="true" className={base} />
  return (
    <>
      <img src="/logo-mark.png" alt="" aria-hidden="true" className={clsx(base, "dark:hidden")} />
      <img src="/logo-mark-light.png" alt="" aria-hidden="true" className={clsx(base, "hidden dark:block")} />
    </>
  )
}

/** Full Paydayly wordmark from the brand logo. */
export function Logo({ className, onDark }: { className?: string; onDark?: boolean }) {
  const img = "h-8 w-auto object-contain"
  return (
    <span className={clsx("inline-flex items-center", className)} role="img" aria-label="Paydayly">
      {onDark ? (
        <img src="/logo-wordmark-light.png" alt="" className={img} />
      ) : (
        <>
          <img src="/logo-wordmark.png" alt="" className={clsx(img, "dark:hidden")} />
          <img src="/logo-wordmark-light.png" alt="" className={clsx(img, "hidden dark:block")} />
        </>
      )}
    </span>
  )
}
