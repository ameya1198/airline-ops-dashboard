// KPI definitions and aggregation. Every KPI is computed from summed counts, never by averaging rates.

import type { Measures } from "./data"

export type KpiKey = "onTime" | "avgDelay" | "cancelRate" | "lateAircraftShare"

export type KpiDef = {
  key: KpiKey
  label: string
  definition: string
  unit: "%" | "min"
  /** True when an increase is an improvement. */
  higherIsBetter: boolean
  /** Decimals for the headline value and the change. */
  decimals: number
  compute: (m: Measures) => number | null
}

const CAUSES = ["carrier_min", "weather_min", "nas_min", "security_min", "late_aircraft_min"] as const

const ratio = (a: number, b: number) => (b > 0 ? a / b : null)

export const KPIS: KpiDef[] = [
  {
    key: "onTime",
    label: "On-time arrivals",
    definition: "Arrived less than 15 min late",
    unit: "%",
    higherIsBetter: true,
    decimals: 1,
    compute: (m) => mul(ratio(m.on_time, m.flown), 100),
  },
  {
    key: "avgDelay",
    label: "Average arrival delay",
    definition: "Early arrivals count as 0",
    unit: "min",
    higherIsBetter: false,
    decimals: 1,
    compute: (m) => ratio(m.arr_delay_min, m.flown),
  },
  {
    key: "cancelRate",
    label: "Cancellation rate",
    definition: "Share of scheduled flights",
    unit: "%",
    higherIsBetter: false,
    decimals: 2,
    compute: (m) => mul(ratio(m.cancelled, m.flights), 100),
  },
  {
    key: "lateAircraftShare",
    label: "Late-aircraft share",
    definition: "Share of reported delay minutes",
    unit: "%",
    higherIsBetter: false,
    decimals: 1,
    compute: (m) => mul(ratio(m.late_aircraft_min, CAUSES.reduce((s, c) => s + m[c], 0)), 100),
  },
]

function mul(v: number | null, k: number) {
  return v === null ? null : v * k
}

const EMPTY: Measures = {
  flights: 0, flown: 0, on_time: 0, cancelled: 0, diverted: 0, dep_late: 0, arr_delay_min: 0,
  carrier_min: 0, weather_min: 0, nas_min: 0, security_min: 0, late_aircraft_min: 0,
}

/** Sum the additive measures of a set of rows. */
export function sumMeasures(rows: Measures[]): Measures {
  const out = { ...EMPTY }
  for (const r of rows) for (const k of Object.keys(EMPTY) as (keyof Measures)[]) out[k] += r[k]
  return out
}

/** Sum rows per month, keeping only the given months (in order). */
export function byMonth<T extends Measures & { month: string }>(rows: T[], months: string[]): Map<string, Measures> {
  const groups = new Map<string, T[]>(months.map((m) => [m, []]))
  for (const r of rows) groups.get(r.month)?.push(r)
  return new Map(months.map((m) => [m, sumMeasures(groups.get(m)!)]))
}

export function formatValue(def: KpiDef, v: number | null): string {
  if (v === null) return "–"
  return v.toFixed(def.decimals)
}

/** A change in the KPI's own unit: "%" for % KPIs, " min" for delay. */
export const unitSuffix = (def: KpiDef) => (def.unit === "%" ? "%" : " min")

/** A signed change in the KPI's own unit, e.g. "−1.5%" or "+1.8 min". */
export function formatChange(def: KpiDef, delta: number): string {
  return `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta).toFixed(def.decimals)}${unitSuffix(def)}`
}
