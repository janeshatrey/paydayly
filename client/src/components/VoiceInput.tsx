import { t } from "../lib/i18n"
import clsx from "clsx"
import { Mic, Square } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

type Lang = "hi-IN" | "en-IN"

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

const Ctor = (): (new () => Recognition) | undefined => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

const LANG_KEY = "paydayly-voice-lang"

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser and try again. / माइक्रोफ़ोन की अनुमति दें।",
  "service-not-allowed": "Microphone access is blocked. Allow it in your browser and try again. / माइक्रोफ़ोन की अनुमति दें।",
  "no-speech": "Did not hear anything. Try again. / कुछ सुनाई नहीं दिया, दोबारा बोलें।",
  network: "Speech recognition needs an internet connection. / इंटरनेट कनेक्शन चाहिए।",
}

export function VoiceInput({ onTranscript, disabled }: { onTranscript: (text: string) => void; disabled?: boolean }) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return localStorage.getItem(LANG_KEY) === "en-IN" ? "en-IN" : "hi-IN"
    } catch {
      return "hi-IN"
    }
  })
  const [listening, setListening] = useState(false)
  const recognition = useRef<Recognition | null>(null)
  const supported = typeof window !== "undefined" && Boolean(Ctor())

  useEffect(() => () => recognition.current?.stop(), [])

  if (!supported) return null

  function pick(next: Lang) {
    setLang(next)
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {}
  }

  function toggle() {
    if (listening) {
      recognition.current?.stop()
      return
    }
    const Recognizer = Ctor()
    if (!Recognizer) return
    const rec = new Recognizer()
    rec.lang = lang
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = (event) => {
      const text = Array.from(event.results, (result) => result[0].transcript).join(" ").trim()
      if (text) onTranscript(text)
    }
    rec.onerror = (event) => {
      if (event.error !== "aborted") toast.error(ERRORS[event.error] ?? "Could not use the microphone. / माइक्रोफ़ोन काम नहीं कर रहा।")
    }
    rec.onend = () => setListening(false)
    recognition.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? t("Stop listening") : t("Speak your spends")}
        title={listening ? t("Stop / रोकें") : t("Speak / बोलकर जोड़ें")}
        className={clsx(
          "grid size-11 shrink-0 place-items-center rounded-xl border transition-colors disabled:opacity-60",
          listening ? "animate-pulse border-danger bg-danger-soft text-danger" : "border-line bg-surface text-muted hover:bg-surface-2 hover:text-text",
        )}
      >
        {listening ? <Square className="size-4" /> : <Mic className="size-[18px]" />}
      </button>
      <select
        value={lang}
        onChange={(event) => pick(event.target.value as Lang)}
        disabled={listening}
        aria-label={t("Speaking language")}
        className="h-11 rounded-xl border border-line bg-surface px-2 text-[13px] text-text disabled:opacity-60"
      >
        <option value="hi-IN">हिन्दी</option>
        <option value="en-IN">{t("English")}</option>
      </select>
    </div>
  )
}
