"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  HUBS, loadAirportHeatmap, loadAirports, loadMonthly, loadNetworkHeatmap, loadRoutes, loadRouteSummary,
  type Airport, type HeatRow, type Measures, type MonthlyRow, type Route, type RouteMonthRow,
} from "@/lib/data"
import { byMonth, KPIS, sumMeasures } from "@/lib/kpi"
import { defaultPeriod, monthLabel, periodLabel, periodMonths, priorMonths, trendMonths } from "@/lib/period"
import { FilterBar, type Filters } from "./filter-bar"
import { HubLanes, type LaneGroup } from "./hub-lanes"
import { DashboardHeader } from "./header"
import { DelayCauses } from "./delay-causes"
import { DelayHeatmap } from "./delay-heatmap"
import { KpiCard } from "./kpi-card"
import { NetworkMap, type AirportStats, type NetworkMapHandle, type Place } from "./network-map"
import { loadStates } from "@/lib/us-states"

type MonthRows = (Measures & { month: string })[]
const isHub = (code: string) => (HUBS as readonly string[]).includes(code)
const LANES = 5 // lanes in the comparison chart
const MIN_LANE_FLIGHTS = 50 // flights in the period for a lane to show; fewer give a noisy rate

export function VpDashboard() {
  const [monthly, setMonthly] = useState<MonthlyRow[] | null>(null)
  const [routes, setRoutes] = useState<Route[]>([])
  const [airports, setAirports] = useState<Airport[]>([])
  const [routeRows, setRouteRows] = useState<RouteMonthRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters | null>(null)
  const mapHandle = useRef<NetworkMapHandle>(null)

  useEffect(() => {
    Promise.all([loadMonthly(), loadRoutes(), loadAirports()])
      .then(([m, r, a]) => {
        setMonthly(m)
        setRoutes(r)
        setAirports(a)
        const months = [...new Set(m.map((x) => x.month))].sort()
        setFilters({ period: defaultPeriod(months), state: null, airport: null, route: null })
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  // The route table is ~0.75 MB compressed, so it loads only once a place is picked: the
  // comparison lanes then split that place into its airports or routes.
  const needRouteRows = !!filters && (!!filters.route || !!filters.state || !!filters.airport)
  useEffect(() => {
    if (needRouteRows && !routeRows) loadRouteSummary().then(setRouteRows).catch((e: Error) => setError(e.message))
  }, [needRouteRows, routeRows])

  const originOf = useMemo(() => new Map(routes.map((r) => [r.route, r.origin])), [routes])
  const stateOf = useMemo(() => new Map(airports.map((a) => [a.code, a.state])), [airports])
  const stateNames = useMemo(() => new Map(loadStates().features.map((f) => [f.properties.postal, f.properties.name])), [])

  /**
   * Monthly rows for a place, narrowest first: a route, an airport's departures, a state's
   * departures, or the whole network. Null while the route table loads.
   */
  const rowsFor = useCallback(
    (place: { state: string | null; airport: string | null; route: string | null }): MonthRows | null => {
      if (!monthly) return null
      if (place.route) return routeRows?.filter((r) => r.route === place.route) ?? null
      if (place.airport) {
        if (isHub(place.airport)) return monthly.filter((r) => r.hub === place.airport)
        return routeRows?.filter((r) => originOf.get(r.route) === place.airport) ?? null
      }
      if (place.state) return routeRows?.filter((r) => stateOf.get(originOf.get(r.route) ?? "") === place.state) ?? null
      return monthly
    },
    [monthly, routeRows, originOf, stateOf],
  )

  const months = useMemo(() => (monthly ? [...new Set(monthly.map((x) => x.month))].sort() : []), [monthly])
  const available = useMemo(() => new Set(months), [months])

  const cards = useMemo(() => {
    if (!filters) return null
    const rows = rowsFor(filters)
    if (!rows) return null

    const cur = periodMonths(filters.period, available)
    const prev = priorMonths(cur)
    const hasPrev = prev.every((m) => available.has(m))
    const curTotal = sumMeasures(rows.filter((r) => cur.includes(r.month)))
    const prevTotal = sumMeasures(rows.filter((r) => prev.includes(r.month)))

    const tm = trendMonths(filters.period, available)
    const curByMonth = byMonth(rows, tm)
    const prevByMonth = byMonth(rows, priorMonths(tm))

    return KPIS.map((def) => ({
      def,
      value: def.compute(curTotal),
      prior: hasPrev ? def.compute(prevTotal) : null,
      trend: tm.map((m, i) => ({
        month: m,
        current: def.compute(curByMonth.get(m)!),
        prior: available.has(priorMonths(tm)[i]) ? def.compute(prevByMonth.get(priorMonths(tm)[i])!) : null,
      })),
    }))
  }, [rowsFor, filters, available])

  // The place currently filtering the page, as the charts name it.
  const placeLabel = filters ? (filters.route ?? filters.airport ?? (filters.state ? stateNames.get(filters.state) ?? filters.state : null)) : null

  // Heatmap rows for the place: the network file, or one file per origin airport (an airport, a
  // route's origin, or every airport in a state), loaded on demand and cached.
  const heatCodes = useMemo(() => {
    if (!filters) return null
    if (filters.route) return [originOf.get(filters.route) ?? ""]
    if (filters.airport) return [filters.airport]
    if (filters.state) return airports.filter((a) => a.state === filters.state).map((a) => a.code)
    return []
  }, [filters, originOf, airports])
  const heatCache = useRef(new Map<string, Promise<HeatRow[]>>())
  const [heat, setHeat] = useState<{ key: string; rows: HeatRow[] } | null>(null)
  // "*" is the whole network; "" means filters haven't loaded yet.
  const heatKey = heatCodes ? heatCodes.join(",") || "*" : ""
  useEffect(() => {
    if (!heatKey) return
    const load = (code: string) => {
      if (!heatCache.current.has(code)) {
        heatCache.current.set(code, code === "*" ? loadNetworkHeatmap() : loadAirportHeatmap(code).catch(() => []))
      }
      return heatCache.current.get(code)!
    }
    let live = true
    Promise.all(heatKey.split(",").map(load))
      .then((parts) => live && setHeat({ key: heatKey, rows: parts.flat() }))
      .catch((e: Error) => setError(e.message))
    return () => {
      live = false
    }
  }, [heatKey])
  const heatRows = heat && heat.key === heatKey ? heat.rows : null
  const heatPlace = filters?.route ? `${originOf.get(filters.route)} departures` : placeLabel

  // Delay minutes by cause for the selected period and place.
  const causeTotals = useMemo(() => {
    if (!filters) return null
    const rows = rowsFor(filters)
    if (!rows) return null
    const cur = new Set(periodMonths(filters.period, available))
    return sumMeasures(rows.filter((r) => cur.has(r.month)))
  }, [filters, rowsFor, available])

  // The selected period (and its year-before months, when they're in the data) for the hub lanes.
  const hubPeriod = useMemo(() => {
    if (!filters) return null
    const cur = periodMonths(filters.period, available)
    const prev = priorMonths(cur)
    return { cur, prev: prev.every((m) => available.has(m)) ? prev : [], label: periodLabel(filters.period, available) }
  }, [filters, available])

  // Comparison lanes for the selected place: the hubs for the whole network, a state's busiest
  // airports, or an airport's busiest routes (a picked route shows its origin's routes, highlighted).
  const airportBy = useMemo(() => new Map(airports.map((a) => [a.code, a])), [airports])
  const rowsByRoute = useMemo(() => {
    const out = new Map<string, RouteMonthRow[]>()
    for (const r of routeRows ?? []) out.set(r.route, [...(out.get(r.route) ?? []), r])
    return out
  }, [routeRows])
  const comparison = useMemo(() => {
    if (!monthly || !filters || !hubPeriod) return null
    const cur = new Set(hubPeriod.cur)
    const busiest = (groups: LaneGroup[], keep?: string | null) => {
      const flown = new Map(groups.map((g) => [g.id, g.rows.reduce((n, r) => (cur.has(r.month) ? n + r.flown : n), 0)]))
      // Too few flights make a noisy rate (6 flights at 100% on-time), so small lanes drop out.
      const top = groups
        .filter((g) => flown.get(g.id)! >= MIN_LANE_FLIGHTS || (g.id === keep && flown.get(g.id)! > 0))
        .sort((a, b) => flown.get(b.id)! - flown.get(a.id)!)
      const picked = top.slice(0, LANES)
      const kept = keep && !picked.some((g) => g.id === keep) ? top.find((g) => g.id === keep) : undefined
      return kept ? [...picked.slice(0, LANES - 1), kept] : picked
    }
    const city = (code: string) => airportBy.get(code)?.city ?? code
    const routesFrom = (code: string, keep: string | null) => {
      const groups = [...rowsByRoute.entries()]
        .filter(([route]) => originOf.get(route) === code)
        .map(([route, rows]) => {
          const dest = route.split("-")[1]
          return { id: route, name: `→ ${dest}`, sub: city(dest), rows }
        })
      return {
        title: `Routes from ${code}`,
        groups: busiest(groups, keep),
        reference: { label: code, rows: rowsFor({ state: null, airport: code, route: null }) ?? [] },
        selected: keep,
      }
    }

    if (!filters.state && !filters.airport && !filters.route) {
      return {
        title: "Hub comparison",
        groups: HUBS.map((hub) => ({ id: hub, name: hub, sub: city(hub), rows: monthly.filter((r) => r.hub === hub) })),
        reference: { label: "Network", rows: monthly },
        selected: null,
      }
    }
    if (!routeRows) return null
    const origin = filters.route ? originOf.get(filters.route) : filters.airport
    if (origin) return routesFrom(origin, filters.route)

    const inState = airports
      .filter((a) => a.state === filters.state)
      .map((a) => ({
        id: a.code,
        name: a.code,
        sub: a.city,
        rows: [...rowsByRoute.entries()].filter(([route]) => originOf.get(route) === a.code).flatMap(([, rows]) => rows),
      }))
    const groups = busiest(inState)
    // A state with one served airport has nothing to compare, so show that airport's routes.
    if (groups.length === 1) return routesFrom(groups[0].id, null)
    const name = stateNames.get(filters.state!) ?? filters.state!
    return {
      title: `Airports in ${name}`,
      groups,
      reference: { label: name, rows: rowsFor({ state: filters.state, airport: null, route: null }) ?? [] },
      selected: null,
    }
  }, [monthly, filters, hubPeriod, routeRows, rowsByRoute, originOf, airports, airportBy, stateNames, rowsFor])

  // Numbers for an airport's view: scheduled departures and arrivals at that airport in the
  // selected period and departures cancelled, vs the same months a year earlier.
  const statsFor = useCallback(
    (code: string): AirportStats | null => {
      if (!monthly || !filters || !routeRows) return null
      const rows = rowsFor({ state: null, airport: code, route: null })
      if (!rows) return null
      const arrivals = [...rowsByRoute.entries()].filter(([route]) => route.endsWith(`-${code}`)).flatMap(([, r]) => r)
      const cur = periodMonths(filters.period, available)
      const prev = priorMonths(cur)
      const hasPrev = prev.every((m) => available.has(m))
      const here = sumMeasures(rows.filter((r) => cur.includes(r.month)))
      const before = sumMeasures(rows.filter((r) => prev.includes(r.month)))
      const arrHere = sumMeasures(arrivals.filter((r) => cur.includes(r.month)))
      const arrBefore = sumMeasures(arrivals.filter((r) => prev.includes(r.month)))
      if (!here.flights) return null
      const airport = airports.find((a) => a.code === code)
      const prior = (v: number) => (hasPrev ? v : null)
      return {
        code,
        name: airport?.city ?? code,
        period: periodLabel(filters.period, available),
        onTime: KPIS[0].compute(here),
        networkOnTime: KPIS[0].compute(sumMeasures(monthly.filter((r) => cur.includes(r.month)))),
        callouts: [
          { key: "departures", label: "Departures", value: here.flights, prior: prior(before.flights), higherIsBetter: true },
          { key: "arrivals", label: "Arrivals", value: arrHere.flights, prior: prior(arrBefore.flights), higherIsBetter: true },
          { key: "cancelled", label: "Cancellations", value: here.cancelled, prior: prior(before.cancelled), higherIsBetter: false },
        ],
      }
    },
    [monthly, filters, available, airports, rowsFor, routeRows, rowsByRoute],
  )

  // Departures per airport in the selected period, for the map's airport list and tooltips.
  const departures = useMemo(() => {
    if (!routeRows || !filters) return null
    const cur = new Set(periodMonths(filters.period, available))
    const out = new Map<string, number>()
    for (const r of routeRows) {
      if (!cur.has(r.month)) continue
      const o = originOf.get(r.route)
      if (o) out.set(o, (out.get(o) ?? 0) + r.flights)
    }
    return out
  }, [routeRows, filters, available, originOf])


  return (
    // One screen at 1280 x 700 and up: the page is exactly the window's height and the map and charts
    // share it, growing with a bigger window. Smaller than that, sections stack and the page scrolls.
    // `overflow-y-auto` is a safety net so nothing is ever clipped if a panel hits its minimum size.
    <main className="flex w-full flex-col px-4 sm:px-6 lg:px-8 fit:h-dvh fit:overflow-y-auto 2xl:px-12">
      <div className="flex min-h-dvh flex-col gap-4 py-4 fit:h-full fit:min-h-0 short:gap-3 short:py-3 tiny:gap-2 tiny:py-2 2xl:gap-5 2xl:py-5">
        <DashboardHeader view="vp" dataThrough={months.length ? monthLabel(months.at(-1)!) : "…"}>
          {filters && (
            <FilterBar
              filters={filters}
              months={months}
              routes={routes}
              onChange={setFilters}
            />
          )}
        </DashboardHeader>

        {error && (
          <p role="alert" className="rounded-lg border border-worse/30 bg-worse/5 px-4 py-3 text-sm text-worse">
            {error}. Run <code className="font-mono">npm run sync-data</code> and reload.
          </p>
        )}

        <section aria-label="Key metrics" className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:gap-4">
          {cards
            ? cards.map((c) => <KpiCard key={c.def.key} {...c} />)
            : KPIS.map((d) => <div key={d.key} className="h-[118px] animate-pulse rounded-xl border bg-card short:h-[92px]" />)}
        </section>

        {/* Left three-fifths: the map with the hour-by-day heatmap beneath it. Right two-fifths: hub lanes
            and delay causes. Each panel takes a share of the window's height. */}
        <div className="grid grid-cols-1 gap-3 tiny:gap-2 fit:min-h-[500px] fit:flex-1 fit:grid-cols-5 2xl:gap-4">
          <div className="flex min-h-0 flex-col gap-3 tiny:gap-2 fit:col-span-3 2xl:gap-4">
            <NetworkMap
              ref={mapHandle}
              airports={airports}
              statsFor={statsFor}
              departures={departures}
              onPlaceChange={(place: Place) => setFilters((f) => (f ? { ...f, ...place } : f))}
              className="fit:min-h-[300px] fit:flex-[2]"
            />
            {filters && (
              <DelayHeatmap
                rows={heatRows}
                months={periodMonths(filters.period, available)}
                place={heatPlace}
                className="fit:h-auto fit:min-h-[180px] fit:flex-1"
              />
            )}
          </div>

          <div className="flex min-h-0 flex-col gap-3 tiny:gap-2 fit:col-span-2 2xl:gap-4">
            {comparison && hubPeriod ? (
              <HubLanes
                {...comparison}
                months={hubPeriod.cur}
                priorMonths={hubPeriod.prev}
                periodLabel={hubPeriod.label}
                className="fit:flex-[1.4]"
              />
            ) : (
              <div className="h-[340px] animate-pulse rounded-xl border bg-card fit:h-auto fit:flex-[1.4]" />
            )}
            {causeTotals ? (
              <DelayCauses totals={causeTotals} place={placeLabel} className="fit:min-h-[160px] fit:flex-1" />
            ) : (
              <div className="h-[280px] animate-pulse rounded-xl border bg-card fit:h-auto fit:flex-1" />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
