"use client"

import { useCallback, useEffect, useLayoutEffect, useState } from "react"
import { ArrowLeft, ArrowRight, Plane, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** A stop on the tour: what to highlight (one or more elements, unioned) and what to say. */
type Stop = { title: string; body: string; targets: () => (Element | null)[] }

const card = (el: Element | null) => el?.closest('[data-slot="card"]') ?? el

const STOPS: Stop[] = [
  {
    title: "Pick your dates",
    body: "Choose any month range, or a preset like Last 12 mo or YTD. Every number on the page follows.",
    targets: () => [document.querySelector('[data-slot="filter-chip"]')],
  },
  {
    title: "The map filters everything",
    body: "Click a state, then an airport. The whole page narrows to it, and the airport opens in 3D.",
    targets: () => [document.querySelector('section[aria-label="Network map"]')],
  },
  {
    title: "The headline numbers",
    body: "A plane taking off means the number rose, landing means it fell. Green is better, red is worse.",
    targets: () => [document.querySelector('section[aria-label="Key metrics"]')],
  },
  {
    title: "How the hubs compare",
    body: "Each plane is a hub this period; the ring is the same months a year before. Switch between on-time, delay and cancellations.",
    targets: () => [card(document.querySelector('[aria-label$="by hub"]'))],
  },
  {
    title: "When and why delays happen",
    body: "The heatmap shows the hours and days that run late; the bars show what caused the delay minutes.",
    targets: () => [card(document.querySelector('[role="grid"]')), card(document.querySelector('[aria-label="Delay minutes by cause"]'))],
  },
  {
    title: "That's the tour",
    body: "Replay it any time from the ? button up here.",
    targets: () => [document.querySelector('[data-tour="help"]') ?? document.querySelector('nav[aria-label="Dashboard view"]')],
  },
]

const SEEN_KEY = "aa-dashboard-tour-seen"
const PAD = 8 // px of breathing room around a highlighted element
const CARD_W = 340

type Rect = { top: number; left: number; width: number; height: number }

function unionRect(els: (Element | null)[]): Rect | null {
  const rects = els.filter(Boolean).map((e) => e!.getBoundingClientRect())
  if (!rects.length) return null
  const top = Math.min(...rects.map((r) => r.top)) - PAD
  const left = Math.min(...rects.map((r) => r.left)) - PAD
  const bottom = Math.max(...rects.map((r) => r.bottom)) + PAD
  const right = Math.max(...rects.map((r) => r.right)) + PAD
  return { top, left, width: right - left, height: bottom - top }
}

type Props = {
  /** Open regardless of whether this browser has seen the tour (the preview page uses this). */
  forceOpen?: boolean
}

/**
 * First-visit guided tour: a boarding-pass welcome, then six stops that spotlight the real page and
 * explain it in a line or two. It only points at things; it never changes filters or moves the map.
 */
export function DashboardTour({ forceOpen = false }: Props) {
  // -1: welcome card; 0..n-1: stops; null: closed.
  const [step, setStep] = useState<number | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)

  useEffect(() => {
    let seen = false
    try {
      seen = window.localStorage.getItem(SEEN_KEY) === "1"
    } catch {}
    // Let the dashboard draw first so the spotlight has something to land on.
    const t = window.setTimeout(() => (forceOpen || !seen) && setStep(-1), 900)
    const replay = () => setStep(-1)
    window.addEventListener("aa-tour:start", replay)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener("aa-tour:start", replay)
    }
  }, [forceOpen])

  const close = useCallback(() => {
    setStep(null)
    try {
      window.localStorage.setItem(SEEN_KEY, "1")
    } catch {}
  }, [])

  // Track the highlighted element(s); scroll them into view on the stacked (scrolling) layout.
  useLayoutEffect(() => {
    if (step === null || step < 0) return setRect(null)
    const stop = STOPS[step]
    const first = stop.targets().find(Boolean)
    first?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    const measure = () => setRect(unionRect(stop.targets()))
    measure()
    const id = window.setInterval(measure, 250) // follows layout shifts while panels load or resize
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    return () => {
      window.clearInterval(id)
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
    }
  }, [step])

  useEffect(() => {
    if (step === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
      else if (e.key === "ArrowRight") setStep((s) => (s === null ? s : s >= STOPS.length - 1 ? (close(), null) : s + 1))
      else if (e.key === "ArrowLeft") setStep((s) => (s === null || s <= 0 ? s : s - 1))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [step, close])

  if (step === null) return null

  if (step === -1) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgb(15_27_40/0.45)] p-4 animate-in fade-in-0">
        <BoardingPass onStart={() => setStep(0)} onSkip={close} />
      </div>
    )
  }

  const stop = STOPS[step]
  const last = step === STOPS.length - 1
  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* The spotlight: a clear window over the highlighted part, the rest dimmed by its huge shadow. */}
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-xl ring-2 ring-aa-blue transition-all duration-500 ease-[cubic-bezier(.3,.7,.2,1)] motion-reduce:transition-none"
          style={{ ...rect, boxShadow: "0 0 0 9999px rgb(15 27 40 / 0.45)" }}
        />
      )}
      {/* Clicks outside the card are swallowed rather than closing the tour, so nobody skips by accident. */}
      <div className="absolute inset-0" aria-hidden />
      <StopCard
        rect={rect}
        title={stop.title}
        body={stop.body}
        index={step}
        last={last}
        onBack={() => setStep(Math.max(0, step - 1))}
        onNext={() => (last ? close() : setStep(step + 1))}
        onClose={close}
      />
    </div>
  )
}

/** The welcome card, drawn as a boarding pass with a tear-off stub. */
function BoardingPass({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-welcome"
      className="relative flex w-full max-w-[620px] overflow-hidden rounded-2xl bg-card shadow-[0_24px_60px_rgb(15_27_40/0.25)] animate-in zoom-in-95 fade-in-0"
    >
      <div className="flex-1 p-7">
        <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG */}
          <img src="/brand/aa-flight-symbol.svg" alt="" className="size-5" />
          AMERICAN AIRLINES OPERATIONS DASHBOARD
        </p>
        <h2 id="tour-welcome" className="mt-5 text-2xl font-medium tracking-tight">Welcome aboard</h2>
        <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
          A replay of American Airlines&apos; on-time performance, delays and cancellations from public BTS data, Jan 2023 – Sep 2026. A quick
          tour shows you where everything is.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={onStart} autoFocus className="cursor-pointer">
            Start the tour
            <ArrowRight className="size-4" aria-hidden />
          </Button>
          <button
            type="button"
            onClick={onSkip}
            className="cursor-pointer rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Skip, I&apos;ll explore
          </button>
        </div>
      </div>

      {/* Perforation: a dashed line with a notch cut from the top and bottom edges. */}
      <div aria-hidden className="relative w-0 border-l-2 border-dashed border-border">
        <span className="absolute -top-3 -left-3 size-6 rounded-full bg-[rgb(15_27_40/0.45)]" />
        <span className="absolute -bottom-3 -left-3 size-6 rounded-full bg-[rgb(15_27_40/0.45)]" />
      </div>

      <div className="flex w-40 flex-col justify-between bg-muted/60 p-5 font-mono text-[11px] tracking-[0.12em] text-muted-foreground">
        <div className="space-y-3">
          <p>
            TOUR
            <span className="mt-0.5 block text-lg tracking-normal text-foreground">6 stops</span>
          </p>
          <p>
            DURATION
            <span className="mt-0.5 block text-lg tracking-normal text-foreground">~40 sec</span>
          </p>
          <p>
            GATE
            <span className="mt-0.5 block text-lg tracking-normal text-foreground">1</span>
          </p>
        </div>
        {/* Barcode */}
        <div
          aria-hidden
          className="mt-4 h-9 w-full opacity-70"
          style={{
            background:
              "repeating-linear-gradient(90deg, var(--foreground) 0 2px, transparent 2px 4px, var(--foreground) 4px 5px, transparent 5px 8px, var(--foreground) 8px 11px, transparent 11px 13px)",
          }}
        />
      </div>
    </div>
  )
}

function StopCard({
  rect, title, body, index, last, onBack, onNext, onClose,
}: {
  rect: Rect | null; title: string; body: string; index: number; last: boolean
  onBack: () => void; onNext: () => void; onClose: () => void
}) {
  // Beside the highlight: below it if there's room, else above, else to its side; always on screen.
  const vw = typeof window === "undefined" ? 1920 : window.innerWidth
  const vh = typeof window === "undefined" ? 1080 : window.innerHeight
  const CARD_H = 190
  let top = vh / 2 - CARD_H / 2
  let left = vw / 2 - CARD_W / 2
  if (rect) {
    const below = rect.top + rect.height + 12
    const above = rect.top - CARD_H - 12
    if (below + CARD_H < vh - 8) top = below
    else if (above > 8) top = above
    else {
      // Tall target (the map): sit beside it, vertically centred.
      top = rect.top + rect.height / 2 - CARD_H / 2
      left = rect.left + rect.width + 12 + CARD_W < vw ? rect.left + rect.width + 12 : rect.left - CARD_W - 12
    }
    if (top === below || top === above) left = rect.left + rect.width / 2 - CARD_W / 2
  }
  left = Math.min(Math.max(left, 12), vw - CARD_W - 12)
  top = Math.min(Math.max(top, 12), vh - CARD_H - 12)

  return (
    <div
      className="fixed z-[101] rounded-xl border bg-card p-4 shadow-[0_16px_40px_rgb(15_27_40/0.22)] transition-[top,left] duration-500 ease-[cubic-bezier(.3,.7,.2,1)] motion-reduce:transition-none"
      style={{ top, left, width: CARD_W }}
    >
      <div className="flex items-start justify-between gap-3">
        <p id="tour-title" className="text-sm font-medium">
          <span className="mr-1.5 font-mono text-xs text-muted-foreground tabular-nums">
            {index + 1} / {STOPS.length}
          </span>
          {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the tour"
          className="-mt-1 -mr-1 cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <FlightPath index={index} />
        <div className="flex items-center gap-1.5">
          {index > 0 && (
            <Button variant="ghost" size="sm" onClick={onBack} className="cursor-pointer">
              <ArrowLeft className="size-3.5" aria-hidden />
              Back
            </Button>
          )}
          <Button size="sm" onClick={onNext} autoFocus className="cursor-pointer">
            {last ? "Done" : "Next"}
            {!last && <ArrowRight className="size-3.5" aria-hidden />}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Progress as a dotted flight path, with a plane at the current stop. */
function FlightPath({ index }: { index: number }) {
  return (
    <div className="flex items-center" aria-hidden>
      {STOPS.map((_, i) => (
        <div key={i} className="flex items-center">
          {i > 0 && <span className={cn("w-3 border-t border-dashed", i <= index ? "border-aa-blue" : "border-border")} />}
          {i === index ? (
            <Plane className="size-4 rotate-45 fill-aa-blue text-aa-blue transition-transform" />
          ) : (
            <span className={cn("size-1.5 rounded-full", i < index ? "bg-aa-blue" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  )
}
