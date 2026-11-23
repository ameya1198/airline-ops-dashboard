"use client"

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
  callout: AirportCallout
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

/** A big-number speech bubble pinned to a runway, with a tail down to a dot on the runway. */
export function RunwayCallout({ callout, side, index, stem = 28, shift = 0, onHover }: Props) {
  const delay = 160 * index
  const shown = useAnimatedNumber(callout.value, { from: 0, duration: 900, delay: delay + 120 })
  const change = callout.prior ? ((callout.value - callout.prior) / callout.prior) * 100 : null
  const rose = change !== null && change > 0
  const better = change !== null && rose === callout.higherIsBetter
  const Icon = rose ? PlaneTakeoff : PlaneLanding

  const bubble = (
    <div
      className="relative min-w-[150px] rounded-xl border bg-card px-3.5 pt-2.5 pb-2 shadow-[0_6px_20px_rgb(15_27_40/0.10)]"
      style={shift ? { transform: `translateX(${shift}px)` } : undefined}
    >
      <p className="text-xs text-muted-foreground">{callout.label}</p>
      <p className="text-[28px] leading-tight font-medium tracking-tight tabular-nums">
        {Math.round(shown ?? 0).toLocaleString()}
      </p>
      {change !== null && Math.abs(change) >= 0.05 && (
        <p className={cn("mt-0.5 flex items-center gap-1 text-[11px]", better ? "text-better" : "text-worse")}>
          <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
          <span className="font-mono tabular-nums">
            {rose ? "+" : "−"}
            {Math.abs(change).toFixed(1)}%
          </span>
          <span className="text-muted-foreground">vs year before</span>
        </p>
      )}
      {/* Speech-bubble notch pointing at the tail. */}
      <span
        aria-hidden
        className={cn(
          "absolute left-1/2 size-2.5 -translate-x-1/2 rotate-45 bg-card",
          side === "up" ? "-bottom-[5.5px] border-r border-b" : "-top-[5.5px] border-t border-l",
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
      aria-label={`${callout.label}: ${callout.value.toLocaleString()}`}
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
