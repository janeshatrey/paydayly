import { animate, motion, useInView, useReducedMotion } from "framer-motion"
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  ChevronDown,
  CircleHelp,
  Database,
  FileSpreadsheet,
  HandCoins,
  KeyRound,
  Lock,
  Mic,
  Moon,
  PieChart,
  Repeat,
  Scale,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Wallet,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Logo } from "../components/Logo"
import { Button } from "../components/ui"
import { LanguageToggle, useLang } from "../lib/i18n"
import { useMe } from "../lib/queries"
import { useTheme } from "../lib/theme"

const COPY = {
  en: {
    features: "Features",
    how: "How it works",
    faq: "FAQ",
    openApp: "Open app",
    login: "Log in",
    start: "Get started",
    badge: "Built for salaried India · paise-accurate maths",
    h1a: "Know what you can",
    h1b: "afford before payday.",
    lead: "Paydayly works out what is safe to spend from salary to salary. Rent, EMIs, bills, SIPs and goals come first, every rupee is shown with its working, and it tells you plainly when it does not have enough information.",
    ctaUser: "Go to dashboard",
    ctaGuest: "Create free account",
    tour: "Take the tour",
    trust: ["No bank login or screen scraping", "Your data is private to your account", "We never sell your data"],
    statsTitle: "What Paydayly keeps track of",
    stats: [
      { value: 3, suffix: "", label: "statement formats: CSV, XLS and XLSX from any bank" },
      { value: 3, suffix: "", label: "commitment cycles: monthly, quarterly, yearly" },
      { value: 100, suffix: "%", label: "of figures computed by Paydayly's own engine" },
      { value: 2, suffix: "", label: "languages: English and Hindi" },
    ],
    featTitle: "Everything you need to stop guessing.",
    featLead: "Paydayly does the maths in the open: every figure comes with how it was worked out and how fresh it is.",
    feats: [
      { icon: Wallet, title: "Available until payday", body: "Salary minus rent, EMIs, bills, SIPs and goal money, with every line shown. Marked as an estimate until you confirm your balance." },
      { icon: Scale, title: "Can I afford this?", body: "Type an amount and a date. See what is left, which bill it squeezes, your new daily number and what happens if payday is late." },
      { icon: HandCoins, title: "Money owed back", body: "Paid for the group? The full amount leaves your account, and what friends owe only counts once it arrives." },
      { icon: FileSpreadsheet, title: "Statements from any bank", body: "Upload the CSV, XLS or XLSX your bank gives you. Paydayly finds the transaction table, skips the bank info and totals, and checks every row against your closing balance." },
      { icon: Repeat, title: "Quarterly and yearly bills", body: "Insurance, school fees or a yearly subscription get a monthly share set aside, and are only due in the month you pick." },
      { icon: PieChart, title: "Sorted for Indian spending", body: "Swiggy, Zomato, Blinkit, Zepto, Uber, Ola and hundreds of UPI merchants are categorised for you." },
      { icon: BellRing, title: "Alerts that matter", body: "Bills due in the next three days, crossing a category limit, or a charge that looks like a duplicate." },
      { icon: Target, title: "Goals with a finish date", body: "Goal money is kept out of what you can spend, and you see exactly when you will get there." },
      { icon: Mic, title: "AI money helper", body: "Ask in plain English or Hinglish, or say “kal chai pe 80”. The AI understands what you mean; Paydayly's own maths makes every number." },
    ],
    howTitle: "Set up in about two minutes.",
    steps: [
      { title: "Tell us your take-home pay and payday", body: "And what goes out first: rent, EMIs, bills, SIPs. Nothing about your savings or wealth." },
      { title: "Import a statement", body: "Download your statement from net banking (CSV, XLS or XLSX) and upload it. Or add spends by typing or speaking." },
      { title: "Ask before you spend", body: "Check what is available, or ask if something fits before payday." },
    ],
    securityTitle: "Private by design",
    security: [
      { icon: Database, title: "Private to your account", body: "Your transactions are visible only when you are signed in. We never sell your data or show you ads based on it, and you can export or delete everything from Settings." },
      { icon: KeyRound, title: "No bank login needed", body: "You upload a statement you downloaded yourself. Paydayly never asks for your net-banking password or reads your SMS." },
      { icon: Lock, title: "Secure sign-in", body: "Passwords are stored only as bcrypt hashes, sessions use secure httpOnly cookies over HTTPS, and you can sign out any device from Settings." },
      { icon: Sparkles, title: "What the AI sees", body: "Only the sentence you type or say, plus the few figures needed to answer. Never your full statement, name or email." },
    ],
    faqTitle: "Questions people ask",
    faqs: [
      { q: "What can the AI money helper do?", a: "Ask things like “can I buy a ₹3,000 jacket this week?” or type “kal raat dominos 640, aaj rapido 85” and it turns them into entries for you to check. If the AI is ever unavailable, Paydayly falls back to its own rules so nothing breaks." },
      { q: "Does the AI decide how much I can spend?", a: "No. Every number comes from Paydayly's own engine. The AI only reads loosely worded questions and entries, and an answer containing a figure Paydayly did not produce is thrown away." },
      { q: "How are quarterly or yearly bills handled?", a: "Paydayly sets aside one-third or one-twelfth each month and only treats the bill as due in the month you choose, so a yearly premium does not wreck one month." },
      { q: "What if my salary is late?", a: "The Afford screen can show what happens if payday slips by five days, and bills due in that gap are counted." },
      { q: "Which banks are supported?", a: "Any bank. Upload the CSV, XLS or XLSX statement from net banking, even ones with bank details above the table or totals below it. If a column is not recognised, you can pick it yourself before importing." },
      { q: "Is my data safe?", a: "Your data is private to your account and we never sell it. Passwords are stored as bcrypt hashes, sessions use httpOnly cookies over HTTPS, and Paydayly never asks for bank logins." },
      { q: "Is this financial advice?", a: "No. Paydayly is a budgeting aid that shows its working. Decisions are yours." },
    ],
    finalTitle: "Start your month with a plan.",
    finalBody: "Free to start. Sign up in a minute on the web, with the mobile app on the way.",
    finalUser: "Open Paydayly",
    finalGuest: "Create your account",
    footer:
      "Paydayly is a budgeting aid, not financial advice. Your data is private to your account and never sold. For the AI money helper, only the sentence you type or say and a few already-computed figures are sent to our AI provider; never your full statement, name or email.",
    preview: {
      label: "Available for discretionary spending",
      note: "Until payday. Rent, EMI, SIP and goals already kept aside.",
      safe: "Safe today",
      days: "Days to payday",
      bill: "Airtel postpaid due tomorrow",
      billSub: "₹349 on 12 Oct",
      up: "Netflix went up",
      upSub: "₹499 to ₹649 a month",
      sample: "Sample figures",
    },
  },
  hi: {
    features: "फ़ीचर",
    how: "कैसे काम करता है",
    faq: "सवाल",
    openApp: "ऐप खोलें",
    login: "लॉग इन",
    start: "शुरू करें",
    badge: "नौकरीपेशा भारत के लिए · पैसे-पैसे का सही हिसाब",
    h1a: "सैलरी से पहले जानें",
    h1b: "कितना खर्च कर सकते हैं।",
    lead: "Paydayly एक सैलरी से अगली सैलरी तक का सुरक्षित खर्च निकालता है। किराया, EMI, बिल, SIP और लक्ष्य पहले, हर रुपये का हिसाब साथ में, और जानकारी कम हो तो साफ़ बताता है।",
    ctaUser: "डैशबोर्ड पर चलें",
    ctaGuest: "मुफ़्त अकाउंट बनाएं",
    tour: "टूर देखें",
    trust: ["बैंक लॉगिन की ज़रूरत नहीं", "आपका डेटा सिर्फ़ आपके अकाउंट में", "हम आपका डेटा कभी नहीं बेचते"],
    statsTitle: "Paydayly किन चीज़ों का ध्यान रखता है",
    stats: [
      { value: 3, suffix: "", label: "स्टेटमेंट फ़ॉर्मेट: किसी भी बैंक की CSV, XLS और XLSX" },
      { value: 3, suffix: "", label: "खर्च के चक्र: मासिक, तिमाही, सालाना" },
      { value: 100, suffix: "%", label: "आंकड़े Paydayly के अपने इंजन से" },
      { value: 2, suffix: "", label: "भाषाएं: अंग्रेज़ी और हिंदी" },
    ],
    featTitle: "अंदाज़ा लगाना बंद करें।",
    featLead: "Paydayly खुला हिसाब करता है: हर आंकड़े के साथ बताता है कि वह कैसे निकला और कितना ताज़ा है।",
    feats: [
      { icon: Wallet, title: "सैलरी तक उपलब्ध", body: "सैलरी में से किराया, EMI, बिल, SIP और लक्ष्य का पैसा, हर लाइन के साथ। बैलेंस कन्फर्म करने तक इसे अंदाज़ा बताया जाता है।" },
      { icon: Scale, title: "क्या मैं यह ले सकता हूँ?", body: "रकम और तारीख डालें। देखें कितना बचेगा, कौन सा बिल दबेगा, रोज़ का नया हिसाब और सैलरी देर से आए तो क्या होगा।" },
      { icon: HandCoins, title: "वापस मिलने वाला पैसा", body: "ग्रुप का बिल भरा? पूरी रकम खाते से जाती है, दोस्तों का हिस्सा लौटने पर ही गिना जाता है।" },
      { icon: FileSpreadsheet, title: "किसी भी बैंक का स्टेटमेंट", body: "बैंक से मिली CSV, XLS या XLSX अपलोड करें। Paydayly ट्रांज़ैक्शन टेबल खुद ढूँढता है, बैंक की जानकारी और टोटल छोड़ता है, और हर लाइन को क्लोज़िंग बैलेंस से मिलाता है।" },
      { icon: Repeat, title: "तिमाही और सालाना बिल", body: "बीमा, स्कूल फ़ीस या सालाना सब्सक्रिप्शन का हर महीने हिस्सा अलग रखा जाता है, और बिल सिर्फ़ चुने हुए महीने में देय होता है।" },
      { icon: PieChart, title: "भारतीय खर्चों के हिसाब से", body: "Swiggy, Zomato, Blinkit, Zepto, Uber, Ola और सैकड़ों UPI मर्चेंट अपने आप कैटेगरी में।" },
      { icon: BellRing, title: "काम की सूचनाएं", body: "तीन दिन में आने वाले बिल, कैटेगरी की सीमा पार, या डुप्लिकेट लगने वाला चार्ज।" },
      { icon: Target, title: "लक्ष्य, पूरा होने की तारीख के साथ", body: "लक्ष्य का पैसा खर्च से बाहर रहता है, और आप देखते हैं कि कब पहुँचेंगे।" },
      { icon: Mic, title: "AI मनी हेल्पर", body: "सीधी अंग्रेज़ी, हिंदी या हिंग्लिश में पूछें, या “kal chai pe 80” बोलें। AI आपकी बात समझता है; हर नंबर Paydayly का अपना हिसाब बनाता है।" },
    ],
    howTitle: "लगभग दो मिनट में तैयार।",
    steps: [
      { title: "अपनी टेक-होम सैलरी और सैलरी का दिन बताएं", body: "और पहले क्या जाता है: किराया, EMI, बिल, SIP। आपकी बचत या संपत्ति के बारे में कुछ नहीं।" },
      { title: "स्टेटमेंट इम्पोर्ट करें", body: "नेट बैंकिंग से स्टेटमेंट (CSV, XLS या XLSX) डाउनलोड करके अपलोड करें। या खर्च लिखकर या बोलकर जोड़ें।" },
      { title: "खर्च से पहले पूछें", body: "देखें कितना उपलब्ध है, या पूछें कि सैलरी से पहले कुछ फ़िट होता है या नहीं।" },
    ],
    securityTitle: "शुरू से प्राइवेट",
    security: [
      { icon: Database, title: "सिर्फ़ आपके अकाउंट में", body: "आपके ट्रांज़ैक्शन सिर्फ़ साइन इन करने पर आपको दिखते हैं। हम आपका डेटा कभी नहीं बेचते, और आप सेटिंग्स से सब एक्सपोर्ट या डिलीट कर सकते हैं।" },
      { icon: KeyRound, title: "बैंक लॉगिन की ज़रूरत नहीं", body: "आप खुद डाउनलोड किया स्टेटमेंट अपलोड करते हैं। Paydayly कभी नेट-बैंकिंग पासवर्ड नहीं माँगता, न आपके SMS पढ़ता है।" },
      { icon: Lock, title: "सुरक्षित साइन-इन", body: "पासवर्ड सिर्फ़ bcrypt हैश के रूप में रखे जाते हैं, सेशन HTTPS पर सुरक्षित httpOnly कुकी से चलते हैं, और किसी भी डिवाइस को सेटिंग्स से साइन आउट कर सकते हैं।" },
      { icon: Sparkles, title: "AI क्या देखता है", body: "सिर्फ़ आपका लिखा या बोला वाक्य, और जवाब के लिए ज़रूरी कुछ आंकड़े। आपका पूरा स्टेटमेंट, नाम या ईमेल कभी नहीं।" },
    ],
    faqTitle: "लोग जो पूछते हैं",
    faqs: [
      { q: "AI मनी हेल्पर क्या करता है?", a: "पूछें “क्या मैं इस हफ़्ते ₹3,000 की जैकेट ले सकता हूँ?” या लिखें “kal raat dominos 640, aaj rapido 85”, और वह इन्हें आपके चेक करने के लिए एंट्री बना देता है। AI कभी उपलब्ध न हो तो Paydayly अपने नियमों से काम चलाता है, कुछ नहीं टूटता।" },
      { q: "क्या AI तय करता है कि मैं कितना खर्च कर सकता हूँ?", a: "नहीं। हर नंबर Paydayly के अपने इंजन से आता है। AI सिर्फ़ ढीले-ढाले सवाल और एंट्री पढ़ता है, और जिस जवाब में Paydayly का न बनाया आंकड़ा हो वह हटा दिया जाता है।" },
      { q: "तिमाही या सालाना बिल कैसे संभलते हैं?", a: "Paydayly हर महीने एक-तिहाई या बारहवाँ हिस्सा अलग रखता है और बिल सिर्फ़ आपके चुने महीने में देय मानता है, ताकि सालाना प्रीमियम एक महीना न बिगाड़े।" },
      { q: "अगर सैलरी देर से आए?", a: "Afford स्क्रीन दिखा सकती है कि सैलरी पाँच दिन खिसके तो क्या होगा, और उस बीच के बिल गिने जाते हैं।" },
      { q: "कौन से बैंक चलते हैं?", a: "कोई भी बैंक। नेट बैंकिंग से मिली CSV, XLS या XLSX अपलोड करें, ऊपर बैंक की जानकारी या नीचे टोटल हों तब भी। कोई कॉलम न पहचाना जाए तो इम्पोर्ट से पहले खुद चुन सकते हैं।" },
      { q: "क्या मेरा डेटा सुरक्षित है?", a: "आपका डेटा सिर्फ़ आपके अकाउंट में है और हम उसे कभी नहीं बेचते। पासवर्ड bcrypt हैश के रूप में रखे जाते हैं, सेशन HTTPS पर httpOnly कुकी से चलते हैं, और Paydayly कभी बैंक लॉगिन नहीं माँगता।" },
      { q: "क्या यह वित्तीय सलाह है?", a: "नहीं। Paydayly बजट में मदद करता है और अपना हिसाब दिखाता है। फ़ैसले आपके।" },
    ],
    finalTitle: "महीने की शुरुआत प्लान के साथ करें।",
    finalBody: "शुरुआत मुफ़्त। वेब पर एक मिनट में साइन अप करें, मोबाइल ऐप जल्द आ रहा है।",
    finalUser: "Paydayly खोलें",
    finalGuest: "अपना अकाउंट बनाएं",
    footer:
      "Paydayly बजट में मदद करता है, वित्तीय सलाह नहीं देता। आपका डेटा सिर्फ़ आपके अकाउंट में रहता है और कभी बेचा नहीं जाता। AI मनी हेल्पर के लिए सिर्फ़ आपका लिखा या बोला वाक्य और पहले से निकाले कुछ आंकड़े हमारे AI प्रोवाइडर को जाते हैं; आपका पूरा स्टेटमेंट, नाम या ईमेल कभी नहीं।",
    preview: {
      label: "खुले खर्च के लिए उपलब्ध",
      note: "सैलरी तक। किराया, EMI, SIP और लक्ष्य पहले ही अलग।",
      safe: "आज सुरक्षित",
      days: "सैलरी में दिन",
      bill: "Airtel पोस्टपेड कल देय",
      billSub: "₹349, 12 अक्टूबर",
      up: "Netflix महंगा हुआ",
      upSub: "₹499 से ₹649 महीना",
      sample: "सैंपल आंकड़े",
    },
  },
} as const

const inr = (value: number) => `₹${new Intl.NumberFormat("en-IN").format(value)}`

function Counter({ to, prefix = "", suffix = "", format = (v: number) => String(v) }: { to: number; prefix?: string; suffix?: string; format?: (v: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  const reduce = useReducedMotion()
  const [value, setValue] = useState(reduce ? to : 0)
  useEffect(() => {
    if (!inView || reduce) return
    const controls = animate(0, to, { duration: 1.2, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setValue(Math.round(v)) })
    return () => controls.stop()
  }, [inView, to, reduce])
  return (
    <span ref={ref} className="tabular">
      {prefix}
      {format(value)}
      {suffix}
    </span>
  )
}

function HeroVideo() {
  const reduce = useReducedMotion()
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {reduce ? (
        <img src="/paydayly-intro-poster.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 dark:opacity-85" />
      ) : (
        <video
          className="absolute inset-0 h-full w-full object-cover opacity-35 dark:opacity-85"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          poster="/paydayly-intro-poster.jpg"
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src="/paydayly-intro.webm" type="video/webm" />
          <source src="/paydayly-intro.mp4" type="video/mp4" />
        </video>
      )}
      {/* Keeps text readable over the video in both themes. */}
      <div className="absolute inset-0 bg-gradient-to-b from-bg/70 via-bg/40 to-bg" />
      <div className="absolute inset-0 bg-gradient-to-r from-bg/80 via-bg/30 to-transparent" />
    </div>
  )
}

export function LandingPage() {
  const { data: user } = useMe()
  const { resolved, setTheme } = useTheme()
  const { lang } = useLang()
  const c = COPY[lang]
  const navigate = useNavigate()
  const appLink = user ? (user.profile.onboarded ? "/app" : "/welcome") : "/signup"
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  function startTour() {
    try {
      sessionStorage.setItem("paydayly-tour-pending", "1")
    } catch {
      /* ignore */
    }
    navigate(user ? (user.profile.onboarded ? "/app" : "/welcome") : "/login")
  }

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/75 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#features" className="hidden rounded-lg px-3 py-2 text-sm text-muted hover:text-text md:block">
              {c.features}
            </a>
            <a href="#how" className="hidden rounded-lg px-3 py-2 text-sm text-muted hover:text-text md:block">
              {c.how}
            </a>
            <a href="#faq" className="hidden rounded-lg px-3 py-2 text-sm text-muted hover:text-text md:block">
              {c.faq}
            </a>
            <LanguageToggle />
            <button
              onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
              className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
              aria-label={lang === "hi" ? "डार्क मोड बदलें" : "Toggle dark mode"}
            >
              {resolved === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            {user ? (
              <Link to={appLink}>
                <Button size="sm">{c.openApp}</Button>
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-text hover:bg-surface-2 sm:block">
                  {c.login}
                </Link>
                <Link to="/signup">
                  <Button size="sm">{c.start}</Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="relative isolate">
        <HeroVideo />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-24 pt-14 md:grid-cols-[1.1fr_1fr] md:pt-24">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 text-[12px] font-medium text-muted backdrop-blur">
              <span className="size-1.5 rounded-full bg-accent" /> {c.badge}
            </span>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              {c.h1a} <span className="bg-gradient-to-r from-brand to-[#3cc9a2] bg-clip-text text-transparent">{c.h1b}</span>
            </h1>
            <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-muted">{c.lead}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={appLink}>
                <Button size="lg">
                  {user ? c.ctaUser : c.ctaGuest} <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Button size="lg" variant="secondary" icon={CircleHelp} onClick={startTour}>
                {c.tour}
              </Button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted">
              {c.trust.map((item, index) => {
                const Icon = [ShieldCheck, Lock, Sparkles][index]
                return (
                  <li key={item} className="inline-flex items-center gap-1.5">
                    <Icon className="size-4 text-brand" /> {item}
                  </li>
                )
              })}
            </ul>
          </motion.div>
          <HeroPreview copy={c.preview} />
        </div>
      </section>

      <section aria-label={c.statsTitle} className="border-y border-line bg-surface/70">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-10 md:grid-cols-4">
          {c.stats.map((stat) => (
            <div key={stat.label}>
              <p className="font-display text-3xl font-bold text-brand">
                <Counter to={stat.value} suffix={stat.suffix} />
              </p>
              <p className="mt-1 text-[13px] text-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="max-w-xl font-display text-3xl font-bold tracking-tight">{c.featTitle}</h2>
          <p className="mt-3 max-w-xl text-muted">{c.featLead}</p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.feats.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: (index % 3) * 0.06 }}
                whileHover={{ y: -3 }}
                className="group rounded-2xl border border-line bg-surface p-6 shadow-card transition-colors hover:border-brand/40"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand transition-transform group-hover:scale-110">
                  <feature.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-display text-[16px] font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-[14px] text-muted">{feature.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="border-t border-line bg-surface/50 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="font-display text-3xl font-bold tracking-tight">{c.howTitle}</h2>
          <ol className="relative mt-10 grid gap-6 md:grid-cols-3">
            {c.steps.map((step, index) => (
              <motion.li
                key={step.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative rounded-2xl border border-line bg-surface p-6"
              >
                <span className="grid size-10 place-items-center rounded-full bg-brand font-display text-[15px] font-bold text-white dark:text-[#0b1f33]">{index + 1}</span>
                <h3 className="mt-4 font-display text-[16px] font-semibold">{step.title}</h3>
                <p className="mt-1 text-[14px] text-muted">{step.body}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="font-display text-3xl font-bold tracking-tight">{c.securityTitle}</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {c.security.map((item) => (
              <div key={item.title} className="rounded-2xl border border-line bg-surface p-5">
                <item.icon className="size-5 text-brand" />
                <h3 className="mt-3 text-[15px] font-semibold">{item.title}</h3>
                <p className="mt-1 text-[13px] text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-line bg-surface/50 py-20">
        <div className="mx-auto max-w-3xl px-5">
          <h2 className="font-display text-3xl font-bold tracking-tight">{c.faqTitle}</h2>
          <div className="mt-8 divide-y divide-line rounded-2xl border border-line bg-surface">
            {c.faqs.map((item, index) => {
              const open = openFaq === index
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenFaq(open ? null : index)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium"
                  >
                    {item.q}
                    <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  <motion.div initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} className="overflow-hidden">
                    <p className="px-5 pb-4 text-[14px] text-muted">{item.a}</p>
                  </motion.div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="relative overflow-hidden rounded-3xl bg-[#0b1f33] px-8 py-14 text-center text-white">
            <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-[#2bb894]/50 blur-3xl" />
            <h2 className="relative font-display text-3xl font-bold">{c.finalTitle}</h2>
            <p className="relative mx-auto mt-3 max-w-md text-white/70">{c.finalBody}</p>
            <Link to={appLink} className="relative mt-7 inline-block">
              <Button size="lg" className="bg-white !text-[#0b1f33] hover:bg-white/90">
                {user ? c.finalUser : c.finalGuest} <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line py-10">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 text-[13px] text-muted md:grid-cols-[auto_1fr_auto] md:items-start">
          <Logo />
          <p className="max-w-2xl">{c.footer}</p>
          <nav className="flex gap-4">
            <a href="#features" className="hover:text-text">
              {c.features}
            </a>
            <a href="#faq" className="hover:text-text">
              {c.faq}
            </a>
            <Link to="/login" className="hover:text-text">
              {c.login}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

function HeroPreview({ copy }: { copy: (typeof COPY)["en"]["preview"] | (typeof COPY)["hi"]["preview"] }) {
  const bars = [42, 65, 30, 78, 52, 24, 60]
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="relative mx-auto w-full max-w-md">
      <div className="rounded-3xl border border-white/10 bg-[#0b1f33]/95 p-7 text-white shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between">
          <p className="text-[12px] uppercase tracking-wider text-white/60">{copy.label}</p>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">{copy.sample}</span>
        </div>
        <p className="mt-2 font-display text-5xl font-bold">
          <Counter to={11780} format={inr} />
        </p>
        <p className="mt-2 text-[13px] text-white/70">{copy.note}</p>
        <div className="mt-5 h-2.5 rounded-full bg-white/10">
          <motion.div className="h-full rounded-full bg-[#6fdcbc]" initial={{ width: 0 }} animate={{ width: "38%" }} transition={{ delay: 0.6, duration: 1 }} />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-white/55">{copy.safe}</p>
            <p className="mt-1 font-display text-lg font-semibold">
              <Counter to={1240} format={inr} />
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-white/55">{copy.days}</p>
            <p className="mt-1 font-display text-lg font-semibold">
              <Counter to={9} />
            </p>
          </div>
        </div>
        <div className="mt-5 flex h-16 items-end gap-2" aria-hidden="true">
          {bars.map((height, index) => (
            <motion.span
              key={index}
              className="flex-1 rounded-t-md bg-gradient-to-t from-[#2bb894] to-[#6fdcbc]"
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{ delay: 0.8 + index * 0.07, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          ))}
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0, y: [0, -4, 0] }}
        transition={{ delay: 0.5, y: { repeat: Infinity, duration: 4, ease: "easeInOut" } }}
        className="absolute -bottom-6 -left-4 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-xl sm:-left-10"
      >
        <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-[#9a6412] dark:text-accent">
          <CalendarClock className="size-4" />
        </span>
        <div>
          <p className="text-[13px] font-medium">{copy.bill}</p>
          <p className="text-[12px] text-muted">{copy.billSub}</p>
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0, y: [0, 4, 0] }}
        transition={{ delay: 0.7, y: { repeat: Infinity, duration: 5, ease: "easeInOut" } }}
        className="absolute -right-3 -top-6 hidden items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-xl sm:flex"
      >
        <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand">
          <Repeat className="size-4" />
        </span>
        <div>
          <p className="text-[13px] font-medium">{copy.up}</p>
          <p className="text-[12px] text-muted">{copy.upSub}</p>
        </div>
      </motion.div>
    </motion.div>
  )
}
