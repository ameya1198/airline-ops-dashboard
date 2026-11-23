"use client"

import { useMemo, type KeyboardEvent } from "react"
import { CalendarRange } from "lucide-react"

import { Filters } from "@/components/reui/filters/filters"
import { createFilterQuery, createFilterRule, flattenFilterRules } from "@/components/reui/filters/filters-query"
import type {
  FilterEditorProps,
  FilterField,
  FilterOperator,
  FilterValueDisplayContext,
} from "@/components/reui/filters/filters-types"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { monthLabel, periodPresets, type Period } from "@/lib/period"
import { cn } from "@/lib/utils"

/** The chip's value: indexes into the list of months in the data, [from, to]. */
type Span = [number, number]

const OPERATORS: FilterOperator[] = [{ value: "between", label: "between", arity: "range" }]

type Props = {
  /** Every month in the data, oldest first ("YYYY-MM"). */
  months: string[]
  period: Period
  onChange: (period: Period) => void
}

/**
 * The page's date filter: one permanent ReUI filter chip ("Period · Oct 2025 – Sep 2026") whose
 * editor is a two-thumb month slider with one-click presets. Built on the c-filters-6 slider pattern.
 */
export function PeriodFilter({ months, period, onChange }: Props) {
  const fields = useMemo<FilterField[]>(() => [periodField(months)], [months])
  const query = useMemo(
    () =>
      createFilterQuery<unknown>([
        createFilterRule({
          id: "period",
          path: ["period"],
          operator: "between",
          value: [Math.max(0, months.indexOf(period.from)), Math.max(0, months.indexOf(period.to))] as Span,
        }),
      ]),
    [months, period],
  )

  return (
    <Filters
      fields={fields}
      query={query}
      size="sm"
      labels={{ apply: "Apply", discard: "Cancel" }}
      // The chip is permanent: only its value can change. Remove, duplicate, negate and clear are refused.
      onBeforeQueryChange={(_, details) => details.reason === "update"}
      onQueryChange={(next) => {
        const value = flattenFilterRules(next)[0]?.value
        if (!Array.isArray(value)) return
        const [a, b] = [Number(value[0]), Number(value[1])].sort((x, y) => x - y)
        if (months[a] && months[b]) onChange({ from: months[a], to: months[b] })
      }}
      // No "Add filter" button: dates are the only thing this bar filters.
      trigger={<span hidden />}
      className={cn(
        "w-auto",
        // A single fixed operator, so its segment and the chip's kebab menu are hidden; the value
        // segment then closes the pill.
        "[&_[data-slot=filter-chip]>*:nth-child(2)]:hidden [&_[data-slot=filter-chip]>[aria-haspopup=menu]]:hidden",
        "[&_[data-slot=filter-chip]>*:nth-child(3)]:!rounded-r-lg [&_[data-slot=filter-chip]>*:first-child]:!rounded-l-lg",
        // Same height and type size as the place chip and Route button beside it.
        "shrink-0 [&_[data-slot=filter-chip]>*]:!h-9 [&_[data-slot=filter-chip]>*]:text-sm [&_[data-slot=filter-chip]>*]:px-3",
        // And the same type: the regular sans at normal weight, not the chip's medium label.
        "[&_[data-slot=filter-chip]>*]:font-sans [&_[data-slot=filter-chip]>*]:!font-normal",
      )}
    />
  )
}

function periodField(months: string[]): FilterField {
  const last = months.length - 1
  const format = (i: number) => (months[i] ? monthLabel(months[i]) : "")
  const read = (value: unknown): Span | null =>
    Array.isArray(value) ? ([Number(value[0]), Number(value[1])] as Span) : null
  const text = (s: Span) => (s[0] === s[1] ? format(s[0]) : `${format(s[0])} – ${format(s[1])}`)

  function PeriodEditor({ value, onValueChange, commit, cancel, autoFocusProps }: FilterEditorProps<unknown>) {
    const current = read(value) ?? [Math.max(0, last - 11), last]
    const presets = periodPresets(months).map((p) => ({
      label: p.label,
      span: [months.indexOf(p.period.from), months.indexOf(p.period.to)] as Span,
    }))
    // Arrows belong to the thumbs; Enter applies and Escape cancels without closing anything around it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault()
        commit(current)
      } else if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        cancel()
      }
    }
    const januaries = months.map((m, i) => ({ m, i })).filter(({ m, i }) => m.endsWith("-01") || i === 0)

    return (
      <div className="flex w-[22rem] flex-col gap-3 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Period</span>
          <span className="text-sm font-medium tabular-nums">{text(current)}</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const on = p.span[0] === current[0] && p.span[1] === current[1]
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onValueChange(p.span)}
                aria-pressed={on}
                className={cn(
                  "cursor-pointer rounded-md border px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on ? "border-primary/30 bg-accent font-medium text-accent-foreground" : "hover:bg-secondary",
                )}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        <div className="px-1 pt-1">
          <Slider
            {...autoFocusProps}
            value={current}
            min={0}
            max={last}
            step={1}
            minStepsBetweenThumbs={0}
            onValueChange={(next) => onValueChange(next as Span)}
            onKeyDown={onKeyDown}
            aria-label="Period"
            className="[&_[data-slot=slider-thumb]]:cursor-grab"
          />
          {/* Year marks under the track, at each January. */}
          <div className="relative mt-2 h-4">
            {januaries.map(({ m, i }) => (
              <span
                key={m}
                className="absolute -translate-x-1/2 font-mono text-[10px] text-muted-foreground"
                style={{ left: `${(i / last) * 100}%` }}
              >
                {i === 0 && !m.endsWith("-01") ? monthLabel(m) : m.slice(0, 4)}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <span className="text-[11px] text-muted-foreground">
            {current[1] - current[0] + 1} month{current[1] === current[0] ? "" : "s"}
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={cancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => commit(current)}>
              Apply
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return {
    id: "period",
    label: "Period",
    type: "range",
    operators: OPERATORS,
    defaultOperator: "between",
    editor: PeriodEditor,
    icon: <CalendarRange className="size-3.5" />,
    renderValue: ({ value }: FilterValueDisplayContext) => {
      const s = read(value)
      if (!s) return "any"
      // The selected span as a small rail against the whole data range, then the months.
      const at = (i: number) => (last ? i / last : 0)
      return (
        <span className="flex items-center gap-2">
          <span aria-hidden className="relative inline-block h-1 w-10 shrink-0 rounded-full bg-muted">
            <span
              className="absolute inset-y-0 rounded-full bg-primary"
              style={{ left: `${at(s[0]) * 100}%`, right: `${(1 - at(s[1])) * 100}%`, minWidth: 3 }}
            />
          </span>
          <span className="tabular-nums">{text(s)}</span>
        </span>
      )
    },
    valueText: ({ value }: FilterValueDisplayContext) => {
      const s = read(value)
      return s ? text(s) : "any"
    },
  }
}
