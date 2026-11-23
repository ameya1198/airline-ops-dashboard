"use client"

import { Fragment } from "react"
import { PlaneLanding, PlaneTakeoff } from "lucide-react"

import { useAnimatedNumber } from "@/hooks/use-animated-number"
import { cn } from "@/lib/utils"

export type AirportCallout = {
  key: string
  label: string
  value: number
  prior: number | null
  /** True when an increase is good news (more flights flown), false when it's bad (more cancellations). */
  higherIsBetter: boolean
}

type Props = {
  /** One callout per bubble; several share one card when the bubbles wouldn't fit side by side. */
  callouts: AirportCallout[]
  /** "up": bubble above its runway point; "down": below it. */
  side: "up" | "down"
  /** Position in the entrance sequence. */
  index: number
  /** Tail length in px (taller when the bubble stands on a 3D building). */
  stem?: number
  /** Sideways offset of the bubble (px) over its stem, to keep clear of a neighbour. */
  shift?: number
  onHover: (on: boolean) => void
}

/** A big-number speech bubble pinned to a runway or terminal, with a tail down to a dot. */
export function RunwayCallout({ callouts, side, index, stem = 28, shift = 0, onHover }: Props) {
  const delay = 160 * index
  const combined = callouts.length > 1

  const bubble = (
    <div
      className={cn(
        "relative rounded-lg border bg-card shadow-[0_4px_14px_rgb(15_27_40/0.10)]",
        combined ? "px-3 py-2" : "min-w-[112px] px-3 pt-1.5 pb-1.5",
      )}
      style={shift ? { transform: `translateX(${shift}px)` } : undefined}
    >
      {combined ? (
        <div className="grid grid-cols-[auto_auto_auto] items-baseline gap-x-3 gap-y-0.5">
          {callouts.map((c, i) => (
            <Fragment key={c.key}>
              <span className="text-[11px] text-muted-foreground">{c.label}</span>
              <Value callout={c} delay={delay + 120 + 120 * i} className="justify-self-end text-base font-medium" />
              <Change callout={c} />
            </Fragment>
          ))}
        </div>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">{callouts[0].label}</p>
          <Value callout={callouts[0]} delay={delay + 120} className="block text-xl leading-tight font-medium tracking-tight" />
          <Change callout={callouts[0]} />
        </>
      )}
      {/* Speech-bubble notch pointing at the tail. */}
      <span
        aria-hidden
        className={cn(
          "absolute left-1/2 size-2 -translate-x-1/2 rotate-45 bg-card",
          side === "up" ? "-bottom-[4.5px] border-r border-b" : "-top-[4.5px] border-t border-l",
        )}
        style={shift ? { left: `calc(50% - ${shift}px)` } : undefined}
      />
    </div>
  )
  const tail = <span aria-hidden className="w-px bg-foreground/50" style={{ height: stem }} />
  const dot = <span aria-hidden className="size-2.5 rounded-full bg-aa-blue ring-2 ring-white" />

  return (
    <div
      className="runway-callout flex cursor-default flex-col items-center"
      style={{ animationDelay: `${delay}ms` }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      role="group"
      aria-label={callouts.map((c) => `${c.label}: ${c.value.toLocaleString()}`).join(", ")}
    >
      {side === "up" ? (
        <>
          {bubble}
          {tail}
          {dot}
        </>
      ) : (
        <>
          {dot}
          {tail}
          {bubble}
        </>
      )}
    </div>
  )
}

/** The number, counting up from zero when the bubble appears. */
function Value({ callout, delay, className }: { callout: AirportCallout; delay: number; className?: string }) {
  const shown = useAnimatedNumber(callout.value, { from: 0, duration: 900, delay })
  return <span className={cn("tabular-nums", className)}>{Math.round(shown ?? 0).toLocaleString()}</span>
}

/** Change vs the same months a year before, coloured by whether it's good news. */
function Change({ callout }: { callout: AirportCallout }) {
  const change = callout.prior ? ((callout.value - callout.prior) / callout.prior) * 100 : null
  if (change === null || Math.abs(change) < 0.05) return <span />
  const rose = change > 0
  const better = rose === callout.higherIsBetter
  const Icon = rose ? PlaneTakeoff : PlaneLanding
  return (
    <span className={cn("flex items-center gap-1 text-[11px]", better ? "text-better" : "text-worse")}>
      <Icon className="size-3" strokeWidth={1.75} aria-hidden />
      <span className="font-mono tabular-nums">
        {rose ? "+" : "−"}
        {Math.abs(change).toFixed(1)}%
      </span>
      <span className="text-muted-foreground">YoY</span>
    </span>
  )
}
