"use client"

import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils"

const DRUM = " 0123456789.-–"

/** A value shown on split-flap tiles that spin into place, like an airport departures board. */
export function SplitFlap({ text, label }: { text: string; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex gap-[3px]">
      {[...text].map((ch, i) => (
        <FlapTile key={`${i}-${ch === "."}`} ch={ch} delay={i * 70} />
      ))}
    </span>
  )
}

function FlapTile({ ch, delay }: { ch: string; delay: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef(" ")

  useEffect(() => {
    const el = ref.current!
    let cancelled = false
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const parts = {
      top: el.querySelector<HTMLSpanElement>(".top span")!,
      bottom: el.querySelector<HTMLSpanElement>(".bottom span")!,
      leafTop: el.querySelector<HTMLSpanElement>(".leaf-top")!,
      leafBottom: el.querySelector<HTMLSpanElement>(".leaf-bottom")!,
    }

    const setFace = (c: string) => {
      parts.top.textContent = c
      parts.bottom.textContent = c
      parts.leafTop.firstElementChild!.textContent = c
      shown.current = c
    }

    // One flip: the top leaf falls showing the old character, then the bottom leaf lands with the new one.
    const flipOnce = async (next: string, ms: number) => {
      const prev = shown.current
      parts.leafTop.getAnimations().forEach((a) => a.cancel())
      parts.leafBottom.getAnimations().forEach((a) => a.cancel())
      parts.leafTop.firstElementChild!.textContent = prev
      parts.leafBottom.firstElementChild!.textContent = next
      parts.top.textContent = next
      parts.bottom.textContent = prev
      const half = ms / 2
      parts.leafTop.animate([{ transform: "rotateX(0deg)" }, { transform: "rotateX(-90deg)" }], { duration: half, easing: "ease-in", fill: "forwards" })
      await parts.leafBottom
        .animate([{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }], { duration: half, delay: half, easing: "ease-out", fill: "forwards" })
        .finished.catch(() => {})
      parts.bottom.textContent = next
      parts.leafTop.firstElementChild!.textContent = next
      shown.current = next
    }

    const run = async () => {
      if (reduce || ch === shown.current) return setFace(ch)
      await new Promise((r) => setTimeout(r, delay))
      if (ch === ".") {
        if (!cancelled) setFace(ch)
        return
      }
      // Spin through the drum a few times before landing, slowing for the last flips.
      let i = Math.max(0, DRUM.indexOf(shown.current))
      const spins = 6 + Math.floor(Math.random() * 5)
      for (let s = 0; s < spins && !cancelled; s++) {
        i = (i + 1) % DRUM.length
        const next = s === spins - 1 ? ch : DRUM[i] === ch ? DRUM[(i + 1) % DRUM.length] : DRUM[i]
        await flipOnce(next, s > spins - 3 ? 150 : 90)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [ch, delay])

  return (
    <span ref={ref} aria-hidden className={cn("flap", ch === "." && "narrow")}>
      <span className="half top"><span /></span>
      <span className="half bottom"><span /></span>
      <span className="leaf leaf-top"><span /></span>
      <span className="leaf leaf-bottom"><span /></span>
      <i className="hinge l" />
      <i className="hinge r" />
    </span>
  )
}
