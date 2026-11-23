"use client"

import Link from "next/link"
import { ArrowLeft, ArrowRightLeft, Gauge, Map, Plane, ShieldCheck } from "lucide-react"

import { DashboardHeader } from "./header"

const PLANNED = [
  { icon: Gauge, title: "OCC KPIs", body: "D0, A14, completion factor, first flight out, turn performance and taxi-out: the levers an operations centre manages." },
  { icon: Map, title: "Route map", body: "The routes most affected by weather and air-traffic control, highlighted on the network." },
  { icon: Plane, title: "The first flight sets the tone", body: "How an aircraft's late first flight of the day spreads delay to every flight after it." },
  { icon: ArrowRightLeft, title: "Turnarounds", body: "Whether a turn at the gate absorbs an inbound delay or passes it on to the next flight." },
  { icon: ShieldCheck, title: "Delay we control", body: "Delay minutes the airline causes (carrier, late aircraft) vs weather and air traffic, by airport." },
]

/** Placeholder for the OCC view: what it will show, while it's being built. */
export function OccComingSoon() {
  return (
    <main className="flex min-h-dvh w-full flex-col px-4 sm:px-6 lg:px-8 2xl:px-12">
      <div className="flex flex-1 flex-col gap-6 py-4 2xl:py-5">
        <DashboardHeader view="occ" dataThrough="Sep 2026" />

        <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-8">
          <p className="font-mono text-xs tracking-[0.14em] text-aa-blue">OCC VIEW · COMING SOON</p>
          <h2 className="mt-2 text-3xl font-medium tracking-tight">What drives the numbers</h2>
          <p className="mt-3 max-w-[62ch] text-muted-foreground">
            The VP view shows how the airline performed. The OCC view will show what an operations control centre
            manages behind those results, built from the same BTS flight data and filtered by period and place in the same
            way.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {PLANNED.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3 rounded-xl border bg-card p-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{body}</span>
                </span>
              </li>
            ))}
          </ul>

          <Link
            href="/"
            className="mt-8 inline-flex w-fit items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to the VP view
          </Link>
        </section>
      </div>
    </main>
  )
}
