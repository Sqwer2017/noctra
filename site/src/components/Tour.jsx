import { useEffect, useMemo, useRef, useState } from 'react'
import { tourSteps } from '../data/content'
import { useDialogFocus } from '../lib/useDialogFocus'
import { useMediaQuery } from '../lib/useMediaQuery'
import Icon from './Icon'

export default function Tour({ open, mode = 'brief', onClose }) {
  const steps = useMemo(() => (mode === 'detailed' ? tourSteps : [tourSteps[0], tourSteps[3]]), [mode])
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState(null)
  const [cardHeight, setCardHeight] = useState(196)
  const cardRef = useRef(null)
  const panelRef = useRef(null)
  const actionRef = useRef(null)
  const mobile = useMediaQuery('(max-width: 720px)')
  const safeIndex = Math.min(index, steps.length - 1)
  const current = steps[safeIndex]

  useDialogFocus(open, onClose, panelRef, actionRef)

  useEffect(() => {
    setIndex(0)
    setRect(null)
  }, [mode])

  useEffect(() => {
    if (!open) return
    setIndex(0)
    setRect(null)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const target = document.querySelector(current.selector)
    if (!target) {
      onClose()
      return undefined
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setRect(null)

    const top = target.getBoundingClientRect().top + window.scrollY
    const viewportOffset = mobile ? 96 : Math.min(window.innerHeight * 0.22, 180)
    window.scrollTo({ top: Math.max(0, top - viewportOffset), behavior: reduced ? 'auto' : 'smooth' })

    let frame = 0
    const measure = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const node = document.querySelector(current.selector)
        if (!node) return
        setRect(node.getBoundingClientRect())
      })
    }

    const timer = window.setTimeout(
      () => {
        measure()
        window.requestAnimationFrame(() => actionRef.current?.focus())
      },
      reduced ? 60 : 520,
    )

    const handleResize = () => measure()
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', measure, { passive: true })

    return () => {
      window.clearTimeout(timer)
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', measure)
    }
  }, [open, safeIndex, current.selector, mobile, onClose])

  useEffect(() => {
    if (!rect || !cardRef.current) return
    const update = () => setCardHeight(cardRef.current?.offsetHeight || 196)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(cardRef.current)
    return () => observer.disconnect()
  }, [rect, safeIndex])

  if (!open) return null

  const finish = () => {
    if (safeIndex === steps.length - 1) {
      onClose()
      return
    }
    setIndex(safeIndex + 1)
  }

  const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight
  const tooltip = getTooltipPosition(rect, cardHeight, viewportWidth, viewportHeight, mobile)

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Тур по сайту" ref={panelRef}>
      {rect ? (
        <>
          <Shade style={{ left: 0, top: 0, width: '100%', height: Math.max(0, rect.top) }} />
          <Shade
            style={{
              left: 0,
              top: Math.max(0, rect.bottom),
              width: '100%',
              height: Math.max(0, viewportHeight - rect.bottom),
            }}
          />
          <Shade
            style={{
              left: 0,
              top: Math.max(0, rect.top),
              width: Math.max(0, rect.left),
              height: Math.max(0, rect.height),
            }}
          />
          <Shade
            style={{
              left: Math.max(0, rect.right),
              top: Math.max(0, rect.top),
              width: Math.max(0, viewportWidth - rect.right),
              height: Math.max(0, rect.height),
            }}
          />
          <span
            className="tour-ring"
            aria-hidden="true"
            style={{
              left: rect.left - 6,
              top: rect.top - 6,
              width: rect.width + 12,
              height: rect.height + 12,
            }}
          />

          <div
            className={`tour-card ${mobile ? 'tour-card--mobile' : ''}`}
            style={mobile ? undefined : { left: tooltip.left, top: tooltip.top }}
            ref={cardRef}
          >
            <div className="tour-card-top">
              <span className="tour-kicker">
                Тур · 0{safeIndex + 1} / 0{steps.length}
              </span>
              <button className="icon-btn icon-btn--small" type="button" onClick={onClose} aria-label="Закрыть тур">
                <Icon name="close" size={16} />
              </button>
            </div>
            <h3>{current.title}</h3>
            <p>{current.text}</p>
            <div className="tour-actions">
              <button className="tour-skip" type="button" onClick={onClose}>
                Пропустить
              </button>
              <button className="btn btn-primary btn-sm" type="button" onClick={finish} ref={actionRef}>
                {safeIndex === steps.length - 1 ? 'Готово' : 'Дальше'}
                <Icon name="arrowRight" size={15} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="tour-curtain" aria-hidden="true" />
      )}
    </div>
  )
}

function Shade({ style }) {
  return <div className="tour-shade" style={style} aria-hidden="true" />
}

function getTooltipPosition(rect, height, viewportWidth, viewportHeight, mobile) {
  if (!rect || mobile) return { left: 0, top: 0 }
  const width = 348
  const margin = 18
  const gap = 18
  const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, margin), viewportWidth - width - margin)
  const roomBelow = viewportHeight - rect.bottom
  const roomAbove = rect.top

  if (roomBelow >= height + gap + margin) {
    return { left, top: rect.bottom + gap }
  }
  if (roomAbove >= height + gap + margin) {
    return { left, top: rect.top - height - gap }
  }
  return { left, top: Math.max(margin, (viewportHeight - height) / 2) }
}
