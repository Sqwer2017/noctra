import { useEffect, useRef, useState } from 'react'

export function useAnimatedNumber(value, duration = 550) {
  const [display, setDisplay] = useState(value)
  const displayed = useRef(value)

  useEffect(() => {
    const from = displayed.current
    const to = value
    if (from === to) return undefined

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      displayed.current = to
      setDisplay(to)
      return undefined
    }

    const started = performance.now()
    let frame = 0

    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const next = Math.round(from + (to - from) * eased)
      displayed.current = next
      setDisplay(next)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return display
}
