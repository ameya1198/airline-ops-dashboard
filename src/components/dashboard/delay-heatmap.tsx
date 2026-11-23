"use client"

import { useMemo, useState } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { HeatRow } from "@/lib/data"
import { cn } from "@/lib/utils"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
// The operating day starts around 4 am, so late-night departures (00–03) sit at the right end.
const dayOrder = (h: number) => (h + 20) % 24
const MIN_FLIGHTS = 20 // fewer than this and a cell's % is noise; it's drawn as a blank

type Cell = { dow: number; hour: number; flown: number; late: number; delay: number }

type Props = {
  /** Rows for the selected place (already narrowed to it); null while loading. */
  rows: HeatRow[] | null
  months: string[]
  place: string | null
  className?: string
}

/**
 * Share of flights arriving 15+ min late by scheduled departure hour and weekday, coloured against
 * the place's own average for the period: AA blue where a slot does better, AA red where it does worse.
 */
export function DelayHeatmap({ rows, months, place, className }: Props) {
  const [hover, setHover] = useState<{ cell: Cell; x: number; y: number } | null>(null)

  const grid = useMemo(() => {
    if (!rows) return null
    const cur = new Set(months)
    const cells = new Map<string, Cell>()
    for (const r of rows) {
      if (!cur.has(r.month)) continue
      const k = `${r.dow}-${r.hour}`
      const c = cells.get(k) ?? { dow: r.dow, hour: r.hour, flown: 0, late: 0, delay: 0 }
      c.flown += r.flown
      c.late += r.late
      c.delay += r.arr_delay_min
      cells.set(k, c)
    }
    const all = [...cells.values()]
    const flown = all.reduce((s, c) => s + c.flown, 0)
    const avg = flown ? all.reduce((s, c) => s + c.late, 0) / flown : 0
    // Hours with a meaningful number of flights across the week.
    const byHour = new Map<number, number>()
    for (const c of all) byHour.set(c.hour, (byHour.get(c.hour) ?? 0) + c.flown)
    const hours = [...byHour].filter(([, n]) => n >= MIN_FLIGHTS).map(([h]) => h).sort((a, b) => dayOrder(a) - dayOrder(b))
    // Symmetric colour range around the average, set by the 95th-percentile gap so one odd slot
    // doesn't wash out the rest.
    const gaps = all.filter((c) => c.flown >= MIN_FLIGHTS).map((c) => Math.abs(c.late / c.flown - avg)).sort((a, b) => a - b)
    const range = gaps[Math.floor(gaps.length * 0.95)] || 0.05
    return { cells, avg, hours, range, flown }
  }, [rows, months])

  const color = (c: Cell | undefined) => {
    if (!grid || !c || c.flown < MIN_FLIGHTS) return undefined
    const t = Math.max(-1, Math.min(1, (c.late / c.flown - grid.avg) / grid.range))
    const pct = Math.round(Math.abs(t) * 100)
    return `color-mix(in oklab, var(${t < 0 ? "--aa-blue" : "--aa-red"}) ${pct}%, var(--muted))`
  }

  return (
    <Card className={cn("h-full gap-0 rounded-xl border-border/80 py-0 shadow-none", className)}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 pt-4 pb-0 short:pt-3">
        <CardTitle className="text-sm font-medium">
          Late arrivals by hour &amp; day{place && <span className="text-muted-foreground"> · {place}</span>}
        </CardTitle>
        {grid && grid.flown > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Better</span>
            <span
              className="h-2 w-16 rounded-full"
              style={{ background: "linear-gradient(to right, var(--aa-blue), var(--muted), var(--aa-red))" }}
            />
            <span>Worse</span>
            <span className="ml-1 font-mono text-foreground tabular-nums">avg {(grid.avg * 100).toFixed(1)}% late</span>
          </div>
        )}
      </CardHeader>

      <CardContent className="px-5 pt-3 pb-3 fit:min-h-0 fit:flex-1">
        {!grid ? (
          <div className="h-[260px] animate-pulse rounded-lg bg-muted fit:h-full" />
        ) : grid.flown === 0 ? (
          <p className="flex h-[260px] items-center justify-center text-sm text-muted-foreground fit:h-full">No flights in this period</p>
        ) : (
          <div
            role="grid"
            aria-label="Share of flights arriving 15+ minutes late by departure hour and weekday"
            className="grid gap-[3px] fit:h-full"
            // In the one-screen layout the seven day rows share the panel's height.
            style={{
              gridTemplateColumns: `32px repeat(${grid.hours.length}, minmax(0, 1fr))`,
              gridTemplateRows: "repeat(7, minmax(12px, 1fr)) auto",
            }}
            onMouseLeave={() => setHover(null)}
          >
            {DAYS.map((day, d) => (
              <div key={day} role="row" className="contents">
                <span role="rowheader" className="flex items-center text-[11px] text-muted-foreground">{day}</span>
                {grid.hours.map((h) => {
                  const c = grid.cells.get(`${d + 1}-${h}`)
                  const ok = c && c.flown >= MIN_FLIGHTS
                  return (
                    <span
                      key={h}
                      role="gridcell"
                      aria-label={ok ? `${day} ${String(h).padStart(2, "0")}:00, ${((c.late / c.flown) * 100).toFixed(0)}% late` : `${day} ${h}:00, too few flights`}
                      className={cn(
                        "h-[34px] rounded-[3px] transition-colors duration-300 2xl:h-[40px] fit:!h-auto",
                        ok ? "cursor-default" : "bg-[repeating-linear-gradient(135deg,var(--muted)_0_3px,transparent_3px_6px)]",
                      )}
                      style={{ background: color(c) }}
                      onMouseMove={(e) => (ok ? setHover({ cell: c, x: e.clientX, y: e.clientY }) : setHover(null))}
                    />
                  )
                })}
              </div>
            ))}
            <span />
            {grid.hours.map((h) => (
              <span key={h} className="pt-1 text-center font-mono text-[10px] text-muted-foreground">
                {String(h).padStart(2, "0")}
              </span>
            ))}
          </div>
        )}
      </CardContent>

      {hover && grid && <HeatTooltip {...hover} avg={grid.avg} />}
    </Card>
  )
}

function HeatTooltip({ cell, x, y, avg }: { cell: Cell; x: number; y: number; avg: number }) {
  const share = cell.late / cell.flown
  const gap = (share - avg) * 100
  const hh = String(cell.hour).padStart(2, "0")
  return (
    <div
      className="pointer-events-none fixed z-50 min-w-[190px] rounded-lg border bg-card px-2.5 py-2 text-xs shadow-lg"
      style={{ left: Math.min(x + 14, window.innerWidth - 220), top: y + 14 }}
    >
      <p className="mb-1 font-medium">
        {DAYS[cell.dow - 1]} · {hh}:00–{hh}:59 <span className="font-normal text-muted-foreground">local</span>
      </p>
      <Row k="Arrived 15+ min late" v={`${(share * 100).toFixed(1)}%`} />
      <Row
        k="vs average"
        v={`${gap > 0 ? "+" : "−"}${Math.abs(gap).toFixed(1)}%`}
        cls={Math.abs(gap) < 0.05 ? undefined : gap > 0 ? "text-worse" : "text-better"}
      />
      <Row k="Avg arrival delay" v={`${(cell.delay / cell.flown).toFixed(1)} min`} />
      <Row k="Flights flown" v={cell.flown.toLocaleString()} />
    </div>
  )
}

function Row({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <p className="flex justify-between gap-4 text-muted-foreground">
      {k}
      <span className={cn("font-mono tabular-nums text-foreground", cls)}>{v}</span>
    </p>
  )
}
