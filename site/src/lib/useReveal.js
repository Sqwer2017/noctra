import { useEffect } from 'react'

export function useReveal(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined
    const elements = Array.from(document.querySelectorAll('[data-reveal]'))
    if (!elements.length) return undefined

    if (!('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'))
      return undefined
    }

    const pending = new Set(elements)
    let observer

    const reveal = (element) => {
      if (!pending.delete(element)) return
      element.classList.add('is-visible')
      observer?.unobserve(element)
    }

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) reveal(entry.target)
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )

    elements.forEach((element) => observer.observe(element))

    let frame = 0
    const revealVisible = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const cutoff = window.innerHeight * 0.95
        pending.forEach((element) => {
          if (element.getBoundingClientRect().top < cutoff) reveal(element)
        })
      })
    }

    revealVisible()
    window.addEventListener('scroll', revealVisible, { passive: true })
    window.addEventListener('resize', revealVisible)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', revealVisible)
      window.removeEventListener('resize', revealVisible)
      observer.disconnect()
    }
  }, [enabled])
}
