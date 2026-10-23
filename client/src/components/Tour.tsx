import clsx from "clsx"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, ArrowRight, X } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useLocation, useNavigate } from "react-router-dom"
import { useLang, type Lang } from "../lib/i18n"
import { LogoMark } from "./Logo"
import { Button } from "./ui"

/**
 * Live, annotated tour. Each step goes to a real screen, spotlights a real element and can act on it
 * (open the breakdown, type an example, run an affordability check) so the user sees the app working.
 */

type Text = Record<Lang, string>
interface Step {
  route?: string
  /** CSS selectors tried in order; the first visible match is spotlit. None = centred card. */
  target?: string[]
  title: Text
  body: Text
  /** Runs once the target is on screen. */
  action?: () => void | Promise<void>
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function visible(selector: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return el
  }
  return null
}

function typeInto(selector: string, value: string) {
  const el = visible(selector) as HTMLInputElement | null
  if (!el) return
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

function click(selector: string) {
  visible(selector)?.click()
}

const STEPS: Step[] = [
  {
    title: { en: "Welcome to Paydayly", hi: "Paydayly में आपका स्वागत है" },
    body: {
      en: "This live tour walks through the real app: it moves between screens, highlights what matters and clicks a few buttons for you. Nothing it does is saved. About a minute.",
      hi: "यह लाइव टूर असली ऐप में घुमाता है: स्क्रीन बदलता है, ज़रूरी चीज़ें दिखाता है और कुछ बटन खुद दबाता है। इसमें कुछ भी सेव नहीं होता। करीब एक मिनट।",
    },
  },
  {
    route: "/app",
    target: ['[data-tour="headline"]'],
    title: { en: "Your safe-to-spend number", hi: "खर्च करने लायक रकम" },
    body: {
      en: "The big figure is what is left for everyday spending until payday, after rent, EMIs, bills, SIPs, goals and a buffer. “Safe for today” spreads it over the days left.",
      hi: "बड़ी रकम वह है जो सैलरी तक रोज़ के खर्च के लिए बची है, किराया, EMI, बिल, SIP, लक्ष्य और बफ़र निकालने के बाद। “आज के लिए सुरक्षित” इसे बचे दिनों में बाँटता है।",
    },
  },
  {
    route: "/app",
    target: ['[data-tour="breakdown"]'],
    title: { en: "How we got this", hi: "यह कैसे निकला" },
    body: {
      en: "We opened the breakdown for you. Every line is shown: salary in, each commitment and savings out. Quarterly and yearly bills only set aside their monthly share.",
      hi: "हमने आपके लिए ब्रेकडाउन खोल दिया। हर लाइन दिखती है: सैलरी आई, हर तय खर्च और बचत गई। तिमाही और सालाना बिल का सिर्फ़ मासिक हिस्सा अलग रखा जाता है।",
    },
    action: () => {
      const toggle = visible('[data-tour="breakdown-toggle"]')
      if (toggle && toggle.getAttribute("aria-expanded") !== "true") toggle.click()
    },
  },
  {
    route: "/app",
    target: ['[data-tour="quick"]'],
    title: { en: "AI money helper: add spends the way you talk", hi: "AI मनी हेल्पर: जैसे बोलते हैं वैसे खर्च लिखें" },
    body: {
      en: "We typed an example in Hinglish. Press “Read it” and the AI money helper turns it into entries you check before saving. Dates like 22/10 or “22 Oct” work, and the mic lets you speak in Hindi or English.",
      hi: "हमने हिंग्लिश में एक उदाहरण लिख दिया है। “पढ़ें” दबाएं, AI मनी हेल्पर इसे एंट्री में बदल देगा जिन्हें आप सेव से पहले जाँचते हैं। 22/10 या “22 Oct” जैसी तारीखें चलती हैं, और माइक से हिंदी या अंग्रेज़ी में बोल सकते हैं।",
    },
    action: () => typeInto('[data-tour="quick-input"]', "kal chai pe 80 aur auto pe 150"),
  },
  {
    route: "/app",
    target: ['[data-tour="owed"]', '[data-tour="add"]', 'button[aria-label="Add transaction"]', 'button[aria-label="लेन-देन जोड़ें"]'],
    title: { en: "Money owed back", hi: "वापस मिलने वाला पैसा" },
    body: {
      en: "Paid for friends or an office claim? Mark “Someone owes me part of this” when adding or editing a payment, imported ones included. The full amount leaves today; their share counts only when it comes back.",
      hi: "दोस्तों का या ऑफिस का खर्च भरा? पेमेंट जोड़ते या बदलते समय (इम्पोर्ट वाले भी) “इसका कुछ हिस्सा कोई मुझे लौटाएगा” चुनें। पूरी रकम आज जाती है; उनका हिस्सा लौटने पर ही गिना जाता है।",
    },
  },
  {
    route: "/app/afford",
    target: ['[data-tour="afford-form"]'],
    title: { en: "Can I afford this?", hi: "क्या मैं यह ले सकता हूँ?" },
    body: {
      en: "Let's try ₹2,500. We filled the amount and pressed Check for you.",
      hi: "₹2,500 आज़माते हैं। हमने रकम भरकर “जाँचें” दबा दिया है।",
    },
    action: async () => {
      typeInto("#afford-amount", "2500")
      await wait(150)
      click('[data-tour="afford-check"]')
    },
  },
  {
    route: "/app/afford",
    target: ['[data-tour="afford-result"]'],
    title: { en: "The answer, with its working", hi: "जवाब, हिसाब के साथ" },
    body: {
      en: "What is left after the purchase, your new daily number, any bill it would squeeze, and the assumptions used. Toggle “payday 5 days late” to stress-test it.",
      hi: "खरीद के बाद कितना बचेगा, रोज़ का नया हिसाब, कौन सा बिल दबेगा, और कौन सी मान्यताएं लीं। “सैलरी 5 दिन देर से” चालू करके परखें।",
    },
  },
  {
    route: "/app/month",
    target: ['[data-tour="nav-month"]'],
    title: { en: "Month and Activity", hi: "महीना और गतिविधि" },
    body: {
      en: "Month shows each day's spending and the top categories. Activity lists every transaction, where you can fix a category or record money owed back.",
      hi: "महीना हर दिन का खर्च और टॉप कैटेगरी दिखाता है। गतिविधि में हर लेन-देन है, जहाँ कैटेगरी ठीक कर सकते हैं या वापस मिलने वाला पैसा दर्ज कर सकते हैं।",
    },
  },
  {
    route: "/app",
    target: ['[data-tour="import"]'],
    title: { en: "Import your bank statement", hi: "बैंक स्टेटमेंट इम्पोर्ट करें" },
    body: {
      en: "Upload the CSV, XLS or XLSX bank statement and review the detected rows. Paydayly finds the transactions, checks them against your balance, skips duplicates, and you can undo any import.",
      hi: "किसी भी बैंक का CSV, XLS या XLSX स्टेटमेंट अपलोड करें। Paydayly ट्रांज़ैक्शन ढूँढता है, बैलेंस से मिलाता है, डुप्लिकेट छोड़ता है, और किसी भी इम्पोर्ट को वापस ले सकते हैं।",
    },
  },
  {
    route: "/app",
    target: ['[data-tour="lang"]'],
    title: { en: "English or हिंदी", hi: "English या हिंदी" },
    body: {
      en: "Switch language here any time; it is saved on your profile. The ? button next to it replays this tour.",
      hi: "भाषा यहाँ कभी भी बदलें; यह आपकी प्रोफ़ाइल में सेव रहती है। पास वाला ? बटन यह टूर फिर से चलाता है।",
    },
  },
]

const UI = {
  next: { en: "Next", hi: "आगे" },
  back: { en: "Back", hi: "पीछे" },
  skip: { en: "Skip tour", hi: "टूर छोड़ें" },
  done: { en: "Finish", hi: "पूरा करें" },
  start: { en: "Start the tour", hi: "टूर शुरू करें" },
  step: { en: "Step", hi: "चरण" },
  of: { en: "of", hi: "में से" },
}

const tourKey = (userId: string) => `paydayly-tour-v1:${userId}`

export function tourSeen(userId: string): boolean {
  try {
    return localStorage.getItem(tourKey(userId)) === "1"
  } catch {
    return true
  }
}

type Rect = { top: number; left: number; width: number; height: number }
const PAD = 8

export function Tour({ userId, open, onClose }: { userId: string; open: boolean; onClose: () => void }) {
  const { lang } = useLang()
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [ready, setReady] = useState(false)
  const target = useRef<HTMLElement | null>(null)
  const selectors = useRef<string[] | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const step = STEPS[index]
  const last = index === STEPS.length - 1

  const finish = useCallback(() => {
    try {
      localStorage.setItem(tourKey(userId), "1")
    } catch {
      /* ignore */
    }
    setIndex(0)
    setRect(null)
    target.current = null
    onClose()
  }, [onClose, userId])

  const measure = useCallback(() => {
    let el = target.current
    // The page may re-render and replace the node (data arriving, a result appearing): find it again.
    if ((!el || !el.isConnected) && selectors.current) {
      for (const selector of selectors.current) {
        el = visible(selector)
        if (el) break
      }
      target.current = el
    }
    if (!el) return setRect(null)
    const r = el.getBoundingClientRect()
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
  }, [])

  // Go to the step's screen, wait for its element, scroll it into view and run its action.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setReady(false)
    target.current = null
    selectors.current = null
    setRect(null)
    ;(async () => {
      if (step.route && location.pathname !== step.route) navigate(step.route)
      if (!step.target) {
        setReady(true)
        return
      }
      let el: HTMLElement | null = null
      for (let tries = 0; tries < 40 && !cancelled; tries++) {
        for (const selector of step.target) {
          el = visible(selector)
          if (el) break
        }
        if (el) break
        await wait(100)
      }
      if (cancelled) return
      if (el) {
        el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
        await wait(350)
        if (cancelled) return
        target.current = el
        selectors.current = step.target
        measure()
        if (step.action) {
          await step.action()
          await wait(400)
          if (!cancelled) measure()
        }
      }
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index])

  useLayoutEffect(() => {
    if (!open) return
    const update = () => measure()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    const timer = window.setInterval(update, 500)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
      window.clearInterval(timer)
    }
  }, [open, measure])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") finish()
      if (event.key === "ArrowRight") setIndex((value) => Math.min(value + 1, STEPS.length - 1))
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(value - 1, 0))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, finish])

  if (!open) return null

  const mobile = typeof window !== "undefined" && window.innerWidth < 640
  const cardWidth = Math.min(360, window.innerWidth - 24)
  let cardStyle: React.CSSProperties
  if (!rect || mobile) {
    cardStyle = rect ? { left: 12, right: 12, bottom: 12 } : { left: 0, right: 0, top: 0, bottom: 0, margin: "auto", width: cardWidth, height: "fit-content" }
    if (rect && mobile && rect.top + rect.height > window.innerHeight * 0.55) cardStyle = { left: 12, right: 12, top: 12 }
  } else {
    const below = rect.top + rect.height + 12
    const fitsBelow = below + 240 < window.innerHeight
    const left = Math.min(Math.max(rect.left, 12), window.innerWidth - cardWidth - 12)
    cardStyle = fitsBelow ? { top: below, left, width: cardWidth } : { top: Math.max(rect.top - 12 - 230, 12), left, width: cardWidth }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Dim everything except the spotlight; clicks outside are blocked so the tour stays in control. */}
      {rect ? (
        <motion.div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-brand"
          initial={false}
          animate={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          transition={{ type: "spring", stiffness: 300, damping: 32 }}
          style={{ boxShadow: "0 0 0 9999px rgb(4 12 22 / 0.66)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgb(4_12_22/0.66)]" />
      )}
      <div className="absolute inset-0" onClick={(event) => event.stopPropagation()} />
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={cardStyle}
          className="absolute rounded-2xl border border-line bg-surface p-5 text-text shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <LogoMark className="size-6" />
              <span className="text-[12px] font-medium text-muted tabular">
                {UI.step[lang]} {index + 1} {UI.of[lang]} {STEPS.length}
              </span>
            </div>
            <button onClick={finish} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-text" aria-label={UI.skip[lang]}>
              <X className="size-4" />
            </button>
          </div>
          <h2 id="tour-title" className="mt-3 font-display text-[17px] font-bold">
            {step.title[lang]}
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{step.body[lang]}</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <motion.div className="h-full rounded-full bg-brand" initial={false} animate={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <button onClick={finish} className="text-[13px] text-muted hover:text-text">
              {UI.skip[lang]}
            </button>
            <div className="flex gap-2">
              {index > 0 && (
                <Button size="sm" variant="secondary" icon={ArrowLeft} onClick={() => setIndex(index - 1)}>
                  {UI.back[lang]}
                </Button>
              )}
              <Button size="sm" loading={!ready} onClick={() => (last ? finish() : setIndex(index + 1))}>
                {last ? UI.done[lang] : index === 0 ? UI.start[lang] : UI.next[lang]} {!last && <ArrowRight className="size-4" />}
              </Button>
            </div>
          </div>
          <div className={clsx("sr-only")} aria-live="polite">
            {step.title[lang]}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  )
}
