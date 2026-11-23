// Period selection: a range of whole months, the comparison year before, and the months drawn
// in each KPI card's trend line.

/** Inclusive range of "YYYY-MM" months. */
export type Period = { from: string; to: string }

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export const monthLabel = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
export const monthShort = (m: string) => MONTH_NAMES[Number(m.slice(5, 7)) - 1]

/** Shift a "YYYY-MM" month by n months. */
export function addMonths(m: string, n: number): string {
  const total = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`
}

function range(end: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonths(end, i - count + 1))
}

/** Months covered by the selected period, limited to months that exist in the data. */
export function periodMonths(p: Period, available: Set<string>): string[] {
  const out: string[] = []
  for (let m = p.from; m <= p.to; m = addMonths(m, 1)) if (available.has(m)) out.push(m)
  return out
}

/** The same months one year earlier. */
export const priorMonths = (months: string[]) => months.map((m) => addMonths(m, -12))

/**
 * The months drawn in the KPI trend lines: the selected months when there are enough to make a
 * line (3 or more), otherwise the 12 months ending with the period.
 */
export function trendMonths(p: Period, available: Set<string>): string[] {
  const months = periodMonths(p, available)
  if (months.length >= 3) return months
  return range(p.to, 12).filter((m) => available.has(m))
}

export function periodLabel(p: Period, available: Set<string>): string {
  const months = periodMonths(p, available)
  if (!months.length) return "No data"
  if (months.length === 1) return monthLabel(months[0])
  return `${monthLabel(months[0])} – ${monthLabel(months.at(-1)!)}`
}

/** The default view: the latest 12 months in the data. */
export function defaultPeriod(months: string[]): Period {
  const to = months.at(-1)!
  const from = addMonths(to, -11)
  return { from: from < months[0] ? months[0] : from, to }
}

/** One-click ranges offered in the period picker, all ending at the latest month in the data. */
export function periodPresets(months: string[]): { label: string; period: Period }[] {
  const last = months.at(-1)!
  const first = months[0]
  const clamp = (m: string) => (m < first ? first : m)
  const quarterEnd = (() => {
    // The latest complete calendar quarter.
    const mm = Number(last.slice(5, 7))
    return mm % 3 === 0 ? last : addMonths(last, -(mm % 3))
  })()
  return [
    { label: "Last 12 mo", period: defaultPeriod(months) },
    { label: "YTD", period: { from: clamp(`${last.slice(0, 4)}-01`), to: last } },
    { label: "Last quarter", period: { from: clamp(addMonths(quarterEnd, -2)), to: quarterEnd } },
    { label: "Last month", period: { from: last, to: last } },
  ]
}
