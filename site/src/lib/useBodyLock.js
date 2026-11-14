import { useEffect } from 'react'

let locks = 0
let savedOverflow = ''
let savedPadding = ''

export function useBodyLock(active) {
  useEffect(() => {
    if (!active) return undefined
    const body = document.body

    if (locks === 0) {
      savedOverflow = body.style.overflow
      savedPadding = body.style.paddingRight
      const scrollbar = window.innerWidth - document.documentElement.clientWidth
      body.style.overflow = 'hidden'
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
    }
    locks += 1

    return () => {
      locks = Math.max(0, locks - 1)
      if (locks === 0) {
        body.style.overflow = savedOverflow
        body.style.paddingRight = savedPadding
      }
    }
  }, [active])
}
