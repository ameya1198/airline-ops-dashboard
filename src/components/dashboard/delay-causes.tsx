"use client"

import { Bar, BarChart, LabelList, Rectangle, XAxis, YAxis } from "recharts"
import type { BarShapeProps } from "recharts/types/cartesian/Bar"
import type { YAxisTickContentProps } from "recharts/types/util/types"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { Measures } from "@/lib/data"
import { cn } from "@/lib/utils"

const CAUSES = [
  { key: "carrier", column: "carrier_min", label: "Carrier", color: "var(--chart-1)" },
  { key: "late_aircraft", column: "late_aircraft_min", label: "Late aircraft", color: "var(--chart-3)" },
  { key: "nas", column: "nas_min", label: "Air traffic", color: "var(--chart-4)" },
  { key: "weather", column: "weather_min", label: "Weather", color: "var(--chart-2)" },
  { key: "security", column: "security_min", label: "Security", color: "var(--chart-5)" },
] as const

const chartConfig = {
  share: { label: "Share of delay minutes" },
  ...Object.fromEntries(CAUSES.map((c) => [c.key, { label: c.label, color: c.color }])),
} satisfies ChartConfig

type Datum = { cause: string; share: number; minutes: number; fill: string }

type Props = {
  /** Summed measures for the selected period and place. */
  totals: Measures
  place: string | null
  className?: string
}

/** Where the delay minutes came from: each cause's share of the minutes BTS attributes to a cause. */
export function DelayCauses({ totals, place, className }: Props) {
  const all = CAUSES.reduce((s, c) => s + totals[c.column], 0)
  const data: Datum[] = CAUSES.map((c) => ({
    cause: c.key,
    minutes: totals[c.column],
    share: all ? (totals[c.column] / all) * 100 : 0,
    fill: `var(--color-${c.key})`,
  }))
  // The biggest cause is drawn as the active bar.
  const top = data.reduce((best, d, i) => (d.share > data[best].share ? i : best), 0)

  return (
    <Card className={cn("gap-0 rounded-xl border-border/80 py-0 shadow-none", className)}>
      <CardHeader className="px-5 pt-4 pb-0 short:pt-3">
        <CardTitle className="text-sm font-medium">
          Delay minutes by cause{place && <span className="text-muted-foreground"> · {place}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pt-2 pb-3 fit:min-h-0 fit:flex-1">
        <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full fit:h-full" aria-label="Delay minutes by cause">
          {/* Horizontal bars: the panel is short and wide, so the bars use the width. */}
          <BarChart accessibilityLayer data={data} layout="vertical" margin={{ top: 2, right: 44, bottom: 0, left: 4 }} barCategoryGap="22%">
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis
              type="category"
              dataKey="cause"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              width={88}
              interval={0}
              // Drawn as plain text so a two-word label ("Late aircraft") never wraps onto two lines.
              tick={({ x, y, payload }: YAxisTickContentProps) => (
                <text x={Number(x)} y={Number(y)} dy={4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
                  {chartConfig[String(payload.value) as keyof typeof chartConfig]?.label as string}
                </text>
              )}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(_, __, item) => {
                    const d = item.payload as Datum
                    return (
                      <div className="flex w-full flex-col gap-1">
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className="size-2.5 rounded-[2px]" style={{ background: d.fill }} />
                          {chartConfig[d.cause as keyof typeof chartConfig].label}
                        </span>
                        <span className="flex justify-between gap-4 text-muted-foreground">
                          Share <span className="font-mono tabular-nums text-foreground">{d.share.toFixed(1)}%</span>
                        </span>
                        <span className="flex justify-between gap-4 text-muted-foreground">
                          Delay minutes <span className="font-mono tabular-nums text-foreground">{Math.round(d.minutes).toLocaleString()}</span>
                        </span>
                      </div>
                    )
                  }}
                />
              }
            />
            <Bar
              dataKey="share"
              strokeWidth={2}
              radius={4}
              minPointSize={2}
              isAnimationActive={false}
              shape={({ index, ...props }: BarShapeProps) =>
                index === top ? (
                  <Rectangle
                    {...props}
                    fillOpacity={0.8}
                    stroke={props.payload.fill}
                    strokeDasharray={4}
                    strokeDashoffset={4}
                  />
                ) : (
                  <Rectangle {...props} />
                )
              }
            >
              <LabelList
                dataKey="share"
                position="right"
                offset={6}
                className="fill-foreground font-mono"
                fontSize={11}
                formatter={(v: unknown) => `${Number(v).toFixed(1)}%`}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
