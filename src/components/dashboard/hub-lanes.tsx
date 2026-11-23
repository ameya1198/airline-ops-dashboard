"use client"

import { useEffect, useMemo, useState } from "react"
import { Info } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Measures } from "@/lib/data"
import { formatChange, KPIS, sumMeasures, type KpiDef } from "@/lib/kpi"
import { cn } from "@/lib/utils"

const MEASURES = KPIS.slice(0, 3)
const NAME_COL = 136 // px, code and city
// Short names for the measure switch, which has to fit a one-third-width column.
const SHORT_LABEL: Record<string, string> = { onTime: "On-time", avgDelay: "Avg delay", cancelRate: "Cancellations" }
const END_PAD = 34 // px kept clear at each end of a strip for the threshold markings
export const LANES = 5 // lanes shown at once
export const MIN_LANE_FLIGHTS = 50 // flights in the period for a lane to count; fewer give a noisy rate

type MonthRows = (Measures & { month: string })[]

/** One lane: a hub, an airport or a route, with its monthly rows. */
export type LaneGroup = { id: string; name: string; sub: string; rows: MonthRows }

type Lane = { id: string; name: string; sub: string; value: number | null; prior: number | null; flown: number }

type Props = {
  title: string
  /** What the lanes are, plural: "hubs", "airports", "routes". */
  noun: string
  /** Every candidate; the chart picks which ones get a lane. */
  groups: LaneGroup[]
  /** What the dashed line shows: the place the lanes split up (the network, a state, an airport). */
  reference: { label: string; rows: MonthRows }
  /** Months of the selected period, and the same months a year earlier (empty when not in the data). */
  months: string[]
  priorMonths: string[]
  periodLabel: string
  /** Lane to highlight (a picked route); null shows every lane in AA blue. */
  selected: string | null
  className?: string
}

/**
 * Comparison as runway lanes: each hub, airport or route is a strip with a plane at this period's
 * value, a ring at the same months a year before, and a trail between them (green if better, red
 * if worse). The dashed line is the place they belong to.
 */
export function HubLanes({ title, noun, groups, reference, months, priorMonths, periodLabel, selected, className }: Props) {
  const [measureKey, setMeasureKey] = useState(MEASURES[0].key)
  const def = MEASURES.find((m) => m.key === measureKey)!
  const [pick, setPick] = useState<"busiest" | "worst">("busiest")

  const { lanes, network, scale, eligible } = useMemo(() => {
    const cur = new Set(months)
    const prev = new Set(priorMonths)
    const network = def.compute(sumMeasures(reference.rows.filter((r) => cur.has(r.month))))
    const all: Lane[] = groups.map(({ id, name, sub, rows }) => {
      const now = sumMeasures(rows.filter((r) => cur.has(r.month)))
      const before = sumMeasures(rows.filter((r) => prev.has(r.month)))
      return { id, name, sub, value: def.compute(now), prior: prev.size ? def.compute(before) : null, flown: now.flown }
    })
    // Too few flights make a noisy rate (6 flights at 100% on-time), so those can't take a lane,
    // unless it's the route picked in the filter.
    const eligible = all.filter((l) => l.value !== null && (l.flown >= MIN_LANE_FLIGHTS || l.id === selected))
    const bestFirst = (a: Lane, b: Lane) => (def.higherIsBetter ? b.value! - a.value! : a.value! - b.value!)
    // Busiest: most flights operated. Worst: furthest the wrong way on the chosen measure.
    let chosen = [...eligible]
      .sort(pick === "worst" ? (a, b) => bestFirst(b, a) : (a, b) => b.flown - a.flown)
      .slice(0, LANES)
    const pinned = eligible.find((l) => l.id === selected)
    if (pinned && !chosen.includes(pinned)) chosen = [...chosen.slice(0, LANES - 1), pinned]
    const lanes = chosen.sort(bestFirst)
    const values = lanes.flatMap((l) => [l.value, l.prior]).concat(network).filter((v): v is number => v !== null)
    return { lanes, network, eligible: eligible.length, scale: niceScale(Math.min(...values), Math.max(...values)) }
  }, [groups, reference, months, priorMonths, def, pick, selected])
  const canPick = eligible > LANES

  // The selection rule in words: a short line on the chart, the full version behind the (i).
  const label = def.label.toLowerCase()
  const worstBy = def.higherIsBetter ? `lowest ${label}` : `highest ${label}`
  const minNote = noun === "hubs" ? "" : ` with ${MIN_LANE_FLIGHTS}+ flights`
  const selectionText = canPick
    ? `${lanes.length} of ${eligible} ${noun}${minNote}, by ${pick === "busiest" ? "most flights operated" : worstBy}`
    : `All ${eligible} ${noun}${minNote}`
  const selectionHelp =
    noun === "hubs"
      ? `American's five hubs, each compared with the whole network (dashed line) for ${periodLabel}. Lanes are ordered best to worst on the chosen measure.`
      : `${title} in ${periodLabel}. Busiest shows the ${LANES} with the most flights operated; Worst shows the ${LANES} with the ${worstBy}, and changes with the measure. ` +
        `${noun[0].toUpperCase() + noun.slice(1)} with fewer than ${MIN_LANE_FLIGHTS} flights are left out, because a handful of flights gives an unreliable rate` +
        `${noun === "routes" ? "; a route picked in the Route filter always gets a lane" : ""}. ` +
        `The dashed line is ${reference.label} overall, and lanes are ordered best to worst.`

  // Taxi: planes start where each lane was a year ago and roll to where it is now.
  const dataKey = `${def.key}|${months.join()}|${lanes.map((l) => l.id).join()}`
  const [arrivedKey, setArrivedKey] = useState("")
  useEffect(() => {
    let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(() => setArrivedKey(dataKey))))
    return () => cancelAnimationFrame(raf)
  }, [dataKey])
  const arrived = arrivedKey === dataKey

  // Tagged with the data it was drawn for, so a lane that drops out on a new selection loses its tooltip.
  const [hoverState, setHover] = useState<{ lane: Lane; x: number; y: number; key: string } | null>(null)
  const hover = hoverState?.key === dataKey ? hoverState : null
  const frac = (v: number) => (v - scale.start) / (scale.end - scale.start)
  const pos = (v: number) => `calc(${END_PAD}px + (100% - ${2 * END_PAD}px) * ${frac(v)})`
  const unit = def.unit === "%" ? "%" : " min"
  const fmt = (v: number | null) => (v === null ? "–" : `${v.toFixed(def.decimals)}${unit}`)

  return (
    <Card className={cn("gap-0 rounded-xl border-border/80 py-0 shadow-none", className)}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-0 short:pt-3">
        <CardTitle className="text-sm font-medium">
          {title} <span className="text-muted-foreground">· {periodLabel}</span>
        </CardTitle>
        <ToggleGroup
          type="single"
          value={measureKey}
          onValueChange={(v) => v && setMeasureKey(v as typeof measureKey)}
          variant="outline"
          size="sm"
          aria-label="Measure"
        >
          {MEASURES.map((m) => (
            <ToggleGroupItem
              key={m.key}
              value={m.key}
              className="cursor-pointer px-3 text-xs data-[state=on]:bg-accent data-[state=on]:font-medium data-[state=on]:text-accent-foreground"
            >
              {SHORT_LABEL[m.key] ?? m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>

      {/* How the lanes were picked, in words, with the switch between busiest and worst. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-2 text-[11px] text-muted-foreground">
        {canPick && (
          <ToggleGroup
            type="single"
            value={pick}
            onValueChange={(v) => v && setPick(v as typeof pick)}
            variant="outline"
            size="sm"
            aria-label={`Which ${noun} to show`}
            className="h-7"
          >
            {(["busiest", "worst"] as const).map((p) => (
              <ToggleGroupItem
                key={p}
                value={p}
                className="h-7 cursor-pointer px-2.5 text-[11px] capitalize data-[state=on]:bg-accent data-[state=on]:font-medium data-[state=on]:text-accent-foreground"
              >
                {p}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <span>{selectionText}</span>
        <Tooltip>
          <TooltipTrigger
            aria-label={`How these ${noun} are chosen`}
            className="-ml-1.5 cursor-help rounded-full hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Info className="size-3.5" aria-hidden />
          </TooltipTrigger>
          <TooltipContent className="max-w-80 text-xs leading-relaxed">{selectionHelp}</TooltipContent>
        </Tooltip>
      </div>

      {/* No min-h-0 here: the card never shrinks below what its five lanes need. */}
      <CardContent className="flex flex-1 flex-col px-5 pt-1 pb-3">
        {/* Rows share the card's height in the one-screen layout; fixed 50px when the page stacks. */}
        <div className="relative mt-8 flex flex-1 flex-col short:mt-6" role="list" aria-label={`${title}: ${def.label}`}>
          {lanes.map((l) => {
            const moved = l.prior === null ? 0 : l.value! - l.prior
            const better = moved > 0 === def.higherIsBetter
            const lo = Math.min(l.value!, l.prior ?? l.value!)
            const hi = Math.max(l.value!, l.prior ?? l.value!)
            const f = frac(l.value!)
            // Value label on the side away from the trail; inward near the strip ends.
            const labelRight = f > 0.85 ? false : f < 0.15 ? true : moved >= 0
            const isSel = selected === l.id
            const blue = !selected || isSel
            return (
              <div
                key={l.id}
                role="listitem"
                aria-label={`${l.name}: ${fmt(l.value)}, year before ${fmt(l.prior)}`}
                className="grid h-[50px] items-center fit:h-auto fit:max-h-[64px] fit:min-h-[34px] fit:flex-1"
                style={{ gridTemplateColumns: `${NAME_COL}px 1fr` }}
                onMouseMove={(e) => setHover({ lane: l, x: e.clientX, y: e.clientY, key: dataKey })}
                onMouseLeave={() => setHover(null)}
              >
                <div className="min-w-0 pr-2 pl-1 leading-tight">
                  <p className={cn("font-mono text-sm font-semibold", isSel && "text-aa-blue")}>{l.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground" title={l.sub}>{l.sub}</p>
                </div>
                <div className="relative h-full">
                  {/* Runway strip: threshold markings at both ends and a dashed centreline. */}
                  <div className={cn("absolute inset-x-0 top-1/2 h-[18px] -translate-y-1/2 rounded-[3px] transition-colors short:h-[14px]", isSel ? "bg-accent" : "bg-muted")}>
                    <span className="absolute inset-x-[34px] top-1/2 -translate-y-1/2 border-t-2 border-dashed border-white" />
                    <span className="absolute inset-y-1 left-2 w-4 bg-[repeating-linear-gradient(to_bottom,#fff_0_2px,transparent_2px_4px)]" />
                    <span className="absolute inset-y-1 right-2 w-4 bg-[repeating-linear-gradient(to_bottom,#fff_0_2px,transparent_2px_4px)]" />
                  </div>
                  {l.prior !== null && (
                    <>
                      <span
                        className="absolute top-1/2 z-[1] h-0.5 -translate-y-1/2 rounded-full"
                        style={{
                          left: pos(lo),
                          width: `calc(${pos(hi)} - ${pos(lo)})`,
                          background: moved === 0 ? "var(--aa-silver)" : better ? "var(--status-better)" : "var(--status-worse)",
                        }}
                      />
                      <span
                        className="absolute top-1/2 z-[2] size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-aa-silver bg-card"
                        style={{ left: pos(l.prior) }}
                      />
                    </>
                  )}
                  <span
                    className={cn(
                      "absolute top-1/2 z-[3] size-8 -translate-x-1/2 short:size-7 -translate-y-1/2 transition-[left,color] duration-[1100ms] ease-[cubic-bezier(.3,.7,.2,1)] motion-reduce:transition-none",
                      blue ? "text-aa-blue" : "text-aa-silver",
                    )}
                    style={{ left: pos(arrived || l.prior === null ? l.value! : l.prior) }}
                  >
                    <Airliner className={cn("size-full drop-shadow-[0_1px_1px_rgb(0_0_0/0.2)]", moved < 0 && "-scale-x-100")} />
                  </span>
                  <span
                    className={cn(
                      "absolute top-1/2 z-[3] rounded-[3px] bg-card/85 px-1 font-mono text-xs whitespace-nowrap tabular-nums",
                      labelRight ? "-translate-y-1/2" : "-translate-x-full -translate-y-1/2",
                      selected && !isSel && "text-muted-foreground",
                    )}
                    style={{ left: `calc(${pos(l.value!)} ${labelRight ? "+ 24px" : "- 24px"})` }}
                  >
                    {fmt(l.value)}
                  </span>
                </div>
              </div>
            )
          })}

          {network !== null && (
            <div
              className="pointer-events-none absolute -top-5 bottom-0 z-[4] border-l-[1.5px] border-dashed border-aa-slate"
              style={{ left: `calc(${NAME_COL + END_PAD}px + (100% - ${NAME_COL + 2 * END_PAD}px) * ${frac(network)})` }}
            >
              {/* Centred on the line, but kept inside the card when the line sits near either end. */}
              <span
                className={cn(
                  "absolute -top-2 bg-card px-1 font-mono text-[11px] whitespace-nowrap text-aa-slate",
                  frac(network) > 0.8 ? "-translate-x-full" : frac(network) < 0.2 ? "" : "-translate-x-1/2",
                )}
              >
                {reference.label} {fmt(network)}
              </span>
            </div>
          )}
        </div>

        <div className="relative h-6 border-t" style={{ marginLeft: NAME_COL }}>
          {scale.ticks.map((t) => (
            <span key={t} className="absolute top-1.5 -translate-x-1/2 font-mono text-[11px] text-muted-foreground" style={{ left: pos(t) }}>
              {t.toFixed(Number.isInteger(scale.step) ? 0 : 1)}
              {def.unit === "%" ? "%" : ""}
            </span>
          ))}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><Airliner className="size-4 text-aa-blue" />This period</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-aa-silver" />Year before</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 bg-better" />Better</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 bg-worse" />Worse</span>
          <span className="flex items-center gap-1.5"><span className="h-3 border-l-[1.5px] border-dashed border-aa-slate" />{reference.label}</span>
        </div>
      </CardContent>

      {hover && <LaneTooltip {...hover} def={def} network={network} referenceLabel={reference.label} periodLabel={periodLabel} fmt={fmt} />}
    </Card>
  )
}

function LaneTooltip({ lane, x, y, def, network, referenceLabel, periodLabel, fmt }: {
  lane: Lane; x: number; y: number; def: KpiDef; network: number | null; referenceLabel: string; periodLabel: string
  fmt: (v: number | null) => string
}) {
  const change = lane.prior === null ? null : lane.value! - lane.prior
  const rows: [string, string, string?][] = [
    [periodLabel, fmt(lane.value)],
    ["Year before", fmt(lane.prior)],
    [
      "Change",
      change === null ? "–" : formatChange(def, change),
      change === null || change === 0 ? undefined : change > 0 === def.higherIsBetter ? "text-better" : "text-worse",
    ],
    [referenceLabel, fmt(network)],
    ["Flights flown", lane.flown.toLocaleString()],
  ]
  return (
    <div
      className="pointer-events-none fixed z-50 min-w-[200px] rounded-lg border bg-card px-2.5 py-2 text-xs shadow-lg"
      style={{ left: Math.min(x + 14, window.innerWidth - 230), top: y + 14 }}
    >
      <p className="mb-1 font-medium">{lane.name} · {lane.sub}</p>
      {rows.map(([k, v, cls]) => (
        <p key={k} className="flex justify-between gap-4 text-muted-foreground">
          {k}
          <span className={cn("font-mono tabular-nums text-foreground", cls)}>{v}</span>
        </p>
      ))}
    </div>
  )
}

/** Top-down airliner, nose to the right: fuselage, swept wings with engine pods, tailplane, cockpit glass. */
function Airliner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className}>
      <g fill="currentColor">
        <path d="M28.6 22.3 15.4 4.6c-.3-.4-.7-.6-1.2-.6h-1.9l6.4 18.3z" />
        <path d="M28.6 25.7 15.4 43.4c-.3.4-.7.6-1.2.6h-1.9l6.4-18.3z" />
        <rect x="19.6" y="12.9" width="7.2" height="3.4" rx="1.7" />
        <rect x="19.6" y="31.7" width="7.2" height="3.4" rx="1.7" />
        <path d="M9.6 22.6 5.2 15.6c-.2-.3-.5-.5-.9-.5H3l2.6 7.5z" />
        <path d="M9.6 25.4 5.2 32.4c-.2.3-.5.5-.9.5H3l2.6-7.5z" />
        <path d="M6.2 22.1h33.6c3.4 0 6.2.8 7.2 1.9-1 1.1-3.8 1.9-7.2 1.9H6.2c-1.4 0-2.4-.9-2.4-1.9s1-1.9 2.4-1.9z" />
      </g>
      <path d="M7 23.3h31.5" stroke="#fff" strokeOpacity=".35" strokeWidth=".8" strokeLinecap="round" />
      <path d="M42.9 23.1c1.4.2 2.4.5 2.9.9-.5.4-1.5.7-2.9.9z" fill="#fff" fillOpacity=".75" />
      <path d="M21 14.6h4.6M21 33.4h4.6" stroke="#fff" strokeOpacity=".3" strokeWidth=".7" strokeLinecap="round" />
    </svg>
  )
}

/** Round axis bounds and about four evenly spaced ticks on 1 / 2 / 2.5 / 5 steps. */
function niceScale(lo: number, hi: number) {
  const raw = (hi - lo || 1) / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= raw)!
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const ticks = Array.from({ length: Math.round((end - start) / step) + 1 }, (_, i) => +(start + i * step).toFixed(6))
  return { start, end, step, ticks }
}
