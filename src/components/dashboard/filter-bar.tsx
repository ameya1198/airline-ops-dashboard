"use client"

import { useMemo, useState } from "react"
import { Search, X } from "lucide-react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Route } from "@/lib/data"
import type { Period } from "@/lib/period"
import { cn } from "@/lib/utils"
import { PeriodFilter } from "./period-filter"

/**
 * What every section shows. Dates come from the period chip (a month range); the place comes from the map
 * (the airport you've flown into) or, more narrowly, a route.
 */
export type Filters = {
  period: Period
  state: string | null
  airport: string | null
  route: string | null
}

type Props = {
  filters: Filters
  months: string[]
  routes: Route[]
  onChange: (next: Filters) => void
}

const triggerClass =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm transition-colors duration-200 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"

export function FilterBar({ filters, months, routes, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 fit:flex-nowrap">
      <PeriodFilter months={months} period={filters.period} onChange={(period) => onChange({ ...filters, period })} />

      <RoutePicker routes={routes} route={filters.route} onChange={(route) => onChange({ ...filters, route })} />

      {/* Key for the KPI sparklines; wide screens only (the sparkline tooltips name both lines). */}
      <div className="ml-auto hidden shrink-0 items-center gap-4 pl-4 text-xs whitespace-nowrap text-muted-foreground 2xl:flex" aria-hidden>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="var(--chart-1)" strokeWidth="2" /></svg>
          This period
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="var(--chart-2)" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
          Year before
        </span>
      </div>
    </div>
  )
}

function RoutePicker({ routes, route, onChange }: { routes: Route[]; route: string | null; onChange: (r: string | null) => void }) {
  const [open, setOpen] = useState(false)
  // Busiest routes first so the useful ones are at the top before typing.
  const sorted = useMemo(() => [...routes].sort((a, b) => b.flights_total - a.flights_total), [routes])

  if (route) {
    return (
      <span className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-primary/30 bg-accent pr-1 pl-3 text-sm text-accent-foreground">
        <span className="font-mono text-[13px]">{route}</span>
        <button
          onClick={() => onChange(null)}
          aria-label="Clear route"
          className="cursor-pointer rounded-md p-1 hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </span>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(triggerClass, "text-muted-foreground")} aria-label="Choose route">
        <Search className="size-3.5" aria-hidden />
        Route
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="DFW-LAX, or an airport code" />
          <CommandList>
            <CommandEmpty>No route found.</CommandEmpty>
            <CommandGroup>
              {sorted.map((r) => (
                <CommandItem
                  key={r.route}
                  value={r.route}
                  onSelect={() => {
                    onChange(r.route)
                    setOpen(false)
                  }}
                  className="cursor-pointer"
                >
                  <span className="font-mono text-[13px]">{r.route}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
                    {r.flights_total.toLocaleString()} flights
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
