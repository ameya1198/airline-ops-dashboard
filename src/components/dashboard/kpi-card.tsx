"use client"

import { Minus, PlaneLanding, PlaneTakeoff } from "lucide-react"

import { Card } from "@/components/ui/card"
import { formatChange, formatValue, type KpiDef } from "@/lib/kpi"
import { cn } from "@/lib/utils"
import { KpiSparkline, type SparkPoint } from "./kpi-sparkline"
import { SplitFlap } from "./split-flap"

type Props = {
  def: KpiDef
  value: number | null
  prior: number | null
  trend: SparkPoint[]
}

/** Compact KPI: label, split-flap value and its change on the left, the 12-month trend on the right. */
export function KpiCard({ def, value, prior, trend }: Props) {
  const unit = def.unit === "%" ? "%" : " min"

  return (
    <Card className="flex-row items-stretch gap-3 rounded-xl border-border/80 px-4 py-3 shadow-none short:py-2">
      <div className="flex min-w-0 shrink-0 flex-col">
        <p className="text-[13px] text-muted-foreground 2xl:text-sm" title={def.definition}>
          {def.label}
        </p>
        <p className="mt-2 flex items-end gap-1 short:mt-1">
          <SplitFlap text={formatValue(def, value)} label={`${def.label}: ${formatValue(def, value)}${unit}`} />
          <span className="pb-0.5 text-sm text-muted-foreground">{def.unit === "%" ? "%" : "min"}</span>
        </p>
        <Change def={def} value={value} prior={prior} />
      </div>
      <div className="min-w-0 flex-1 self-end">
        <KpiSparkline
          data={trend}
          label={def.label}
          format={(v) => `${v.toFixed(def.decimals)}${unit}`}
          className="h-[64px] short:!h-[50px] 2xl:h-[76px]"
        />
      </div>
    </Card>
  )
}

/** Change vs the same months a year before: a plane taking off when the KPI rose, landing when it fell. */
function Change({ def, value, prior }: { def: KpiDef; value: number | null; prior: number | null }) {
  if (value === null || prior === null) {
    return <p className="mt-2 h-5 text-xs short:mt-1 text-muted-foreground">No prior year</p>
  }
  const delta = Number((value - prior).toFixed(def.decimals))
  if (delta === 0) {
    return (
      <p className="mt-2 flex h-5 items-center short:mt-1 gap-1.5 text-xs text-muted-foreground">
        <Minus className="size-3.5" aria-hidden />
        <span className="font-mono">{formatChange(def, 0)}</span> YoY
      </p>
    )
  }
  const rose = delta > 0
  const better = rose === def.higherIsBetter
  const Icon = rose ? PlaneTakeoff : PlaneLanding

  return (
    <p
      className={cn("mt-2 flex h-5 items-center short:mt-1 gap-1.5 text-xs", better ? "text-better" : "text-worse")}
      title="Change vs the same months a year before"
    >
      <Icon
        key={`${rose}-${value}`}
        className={cn("size-4 shrink-0", rose ? "animate-takeoff" : "animate-landing")}
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="font-mono tabular-nums">{formatChange(def, delta)}</span>
      <span className="text-muted-foreground">YoY</span>
      <span className="sr-only">{better ? "better" : "worse"}</span>
    </p>
  )
}
