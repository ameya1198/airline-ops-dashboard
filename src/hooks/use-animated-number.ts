"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Count smoothly to a new value. `from` sets the starting value on first render (e.g. 0 for a
 * count-up on appear); `delay` waits before starting. Skipped when the user prefers reduced motion.
 */
export function useAnimatedNumber(
  target: number | null,
  { duration = 450, from, delay = 0 }: { duration?: number; from?: number; delay?: number } = {},
) {
  const [shown, setShown] = useState<number | null>(from ?? target)
  const current = useRef<number | null>(from ?? target)

  useEffect(() => {
    if (target === null || current.current === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.current = target
      setShown(target)
      return
    }
    const a = current.current
    let raf = 0
    let start = 0
    const tick = (now: number) => {
      if (!start) start = now + delay
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      const v = a + (target - a) * (1 - Math.pow(1 - t, 3))
      current.current = v
      setShown(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, delay])

  return shown
}
