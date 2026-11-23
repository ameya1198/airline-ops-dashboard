// Loaders and types for the summary tables in public/data (built by pipeline/build_summaries.py).

export const HUBS = ["DFW", "CLT", "PHX", "MIA", "ORD"] as const
export type HubGroup = (typeof HUBS)[number] | "Other"
export const HUB_GROUPS: HubGroup[] = [...HUBS, "Other"]

/** Additive measures shared by the monthly and route tables. Rates are computed after summing. */
export type Measures = {
  flights: number
  flown: number
  on_time: number
  cancelled: number
  diverted: number
  dep_late: number
  arr_delay_min: number
  carrier_min: number
  weather_min: number
  nas_min: number
  security_min: number
  late_aircraft_min: number
}

export type MonthlyRow = Measures & {
  month: string
  hub: HubGroup
  arr_early: number
  arr_0_14: number
  arr_15_59: number
  arr_60_179: number
  arr_180_plus: number
}

export type RouteMonthRow = Measures & { month: string; route: string }

export type Route = {
  route: string
  origin: string
  dest: string
  hub: HubGroup
  distance: number
  flights_total: number
}

type Compact = { columns: string[]; rows: unknown[][] }

/** Expand the compact {columns, rows} layout into objects. */
function expand<T>(data: Compact): T[] {
  return data.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    data.columns.forEach((col, i) => (obj[col] = row[i]))
    return obj as T
  })
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`/data/${path}`)
  if (!res.ok) throw new Error(`Couldn't load ${path} (${res.status})`)
  return res.json() as Promise<T>
}

export const loadMonthly = async () => expand<MonthlyRow>(await getJson<Compact>("monthly_kpis.json"))
export const loadRouteSummary = async () => expand<RouteMonthRow>(await getJson<Compact>("route_summary.json"))
export const loadRoutes = () => getJson<Route[]>("routes.json")

export type Airport = {
  code: string
  name: string
  city: string
  state: string
  lat: number
  lon: number
  timezone: string
  is_hub: boolean
  departures: number
}

export const loadAirports = () => getJson<Airport[]>("airports.json")

/** Airports with an outline file in public/data/outlines (built by pipeline/build_airport_outlines.py). */
export const loadOutlineCodes = async () =>
  new Set((await getJson<{ code: string }[]>("outlines/index.json")).map((r) => r.code))

/** Flights by scheduled departure hour (local time at the origin) and day of week (1 = Monday). */
export type HeatRow = { month: string; hour: number; dow: number; flown: number; late: number; arr_delay_min: number }

/** Whole network, split by hub group. */
export const loadNetworkHeatmap = async () => expand<HeatRow & { hub: HubGroup }>(await getJson<Compact>("hour_weekday_heatmap.json"))
/** One origin airport (data/summary/heatmap/<CODE>.json). */
export const loadAirportHeatmap = async (code: string) => expand<HeatRow>(await getJson<Compact>(`heatmap/${code}.json`))
