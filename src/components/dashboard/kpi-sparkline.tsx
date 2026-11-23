"use client"

import { Line, LineChart, XAxis, YAxis } from "recharts"
import type { XAxisTickContentProps } from "recharts/types/util/types"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { monthLabel, monthShort } from "@/lib/period"
import { cn } from "@/lib/utils"

export type SparkPoint = { month: string; current: number | null; prior: number | null }

const chartConfig = {
  current: { label: "This period", color: "var(--chart-1)" },
  prior: { label: "Year before", color: "var(--chart-2)" },
} satisfies ChartConfig

type Props = {
  data: SparkPoint[]
  format: (v: number) => string
  label: string
  className?: string
}

/** This period vs the same months a year earlier, month by month. */
export function KpiSparkline({ data, format, label, className }: Props) {
  const values = data.flatMap((d) => [d.current, d.prior]).filter((v): v is number => v !== null)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo) * 0.12 || 1
  const ticks = data.length ? [data[0].month, data.at(-1)!.month] : []

  return (
    <ChartContainer config={chartConfig} className={cn("aspect-auto h-[68px] w-full 2xl:h-[88px]", className)} aria-label={`${label} by month`}>
      <LineChart accessibilityLayer data={data} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
        <XAxis
          dataKey="month"
          ticks={ticks}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          interval="preserveStartEnd"
          // First label anchored at its start and the last at its end, so neither is cut at the card edge.
          tick={({ x, y, payload, index }: XAxisTickContentProps) => (
            <text
              x={Number(x)}
              y={Number(y)}
              dy={8}
              textAnchor={index === 0 ? "start" : "end"}
              fontSize={10}
              fill="var(--muted-foreground)"
            >
              {monthShort(String(payload.value))}
            </text>
          )}
          height={18}
        />
        <YAxis hide domain={[lo - pad, hi + pad]} />
        <ChartTooltip
          cursor={{ strokeDasharray: "2 2" }}
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(_, payload) => monthLabel(String(payload?.[0]?.payload?.month ?? ""))}
              formatter={(value, name, item) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="h-0.5 w-3 rounded-full" style={{ background: item.color }} />
                    {chartConfig[name as keyof typeof chartConfig].label}
                  </span>
                  <span className="font-mono tabular-nums text-foreground">{format(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <Line
          dataKey="prior"
          type="monotone"
          stroke="var(--color-prior)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          activeDot={{ r: 2.5 }}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          dataKey="current"
          type="monotone"
          stroke="var(--color-current)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
          isAnimationActive={false}
          connectNulls
        />
      </LineChart>
    </ChartContainer>
  )
}
