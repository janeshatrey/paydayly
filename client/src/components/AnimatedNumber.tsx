import { animate, useMotionValue, useTransform, motion } from "framer-motion"
import { useEffect } from "react"

export function AnimatedRupees({ value, className }: { value: number; className?: string }) {
  const motionValue = useMotionValue(0)
  const text = useTransform(motionValue, (latest) => {
    const rounded = Math.round(Math.abs(latest))
    const body = new Intl.NumberFormat("en-IN").format(rounded)
    return `${latest < 0 ? "−" : ""}₹${body}`
  })
  useEffect(() => {
    const controls = animate(motionValue, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] })
    return () => controls.stop()
  }, [value, motionValue])
  return <motion.span className={className}>{text}</motion.span>
}
