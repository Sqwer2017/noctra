import { useCallback, useEffect, useRef, useState } from 'react'
import { screenshots } from '../data/content'
import { useBodyLock } from '../lib/useBodyLock'
import { useDialogFocus } from '../lib/useDialogFocus'
import Icon from './Icon'

export default function Gallery() {
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const current = screenshots[active]

  const handleTabKey = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    let next = active
    if (event.key === 'ArrowLeft') next = (active - 1 + screenshots.length) % screenshots.length
    if (event.key === 'ArrowRight') next = (active + 1) % screenshots.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = screenshots.length - 1
    setActive(next)
    const tabs = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')
    tabs?.[next]?.focus()
  }

  return (
    <section className="section gallery" id="screens">
      <div className="container">
        <div className="section-head section-head--split" data-reveal>
          <div>
            <span className="eyebrow">Загляни внутрь</span>
            <h2>
              Тёмный, живой и <em>твой</em>.
            </h2>
          </div>
          <p>Пять состояний Noctra: от спокойной главной до полноэкранного плеера.</p>
        </div>

        <div className="gallery-shell" data-reveal>
          <div className="gallery-tabs" role="tablist" aria-label="Экраны Noctra" data-tour="screens">
            {screenshots.map((shot, index) => (
              <button
                key={shot.id}
                type="button"
                role="tab"
                id={`shot-tab-${shot.id}`}
                aria-selected={active === index}
                aria-controls={`shot-panel-${shot.id}`}
                tabIndex={active === index ? 0 : -1}
                onClick={() => setActive(index)}
                onKeyDown={handleTabKey}
              >
                {shot.label}
              </button>
            ))}
          </div>

          <div
            className="shot-panel"
            role="tabpanel"
            id={`shot-panel-${current.id}`}
            aria-labelledby={`shot-tab-${current.id}`}
          >
            <div className="shot-frame">
              <div className="shot-bar">
                <span className="shot-bar-title">
                  <span className="shot-bar-dot" />
                  Noctra
                </span>
                <span className="shot-bar-view">{current.label}</span>
              </div>
              <button type="button" className="shot-open" onClick={() => setLightbox(true)} aria-label={`Открыть скриншот: ${current.title}`}>
                <span className="shot-stage" key={current.id}>
                  <img src={current.image} width="1800" height="929" alt={current.alt} loading="lazy" />
                </span>
                <span className="shot-expand" aria-hidden="true">
                  <Icon name="expand" size={16} />
                </span>
              </button>
            </div>

            <div className="shot-caption">
              <div>
                <span className="shot-eyebrow">{current.label}</span>
                <h3>{current.title}</h3>
                <p>{current.caption}</p>
              </div>
              <span className="shot-index">
                0{active + 1} <span>/ 05</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {lightbox ? (
        <Lightbox
          index={active}
          onChange={setActive}
          onClose={() => setLightbox(false)}
        />
      ) : null}
    </section>
  )
}

function Lightbox({ index, onChange, onClose }) {
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const shot = screenshots[index]
  const close = useCallback(() => onClose(), [onClose])

  useBodyLock(true)
  useDialogFocus(true, close, panelRef, closeRef)

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'ArrowLeft') onChange((index - 1 + screenshots.length) % screenshots.length)
      if (event.key === 'ArrowRight') onChange((index + 1) % screenshots.length)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [index, onChange])

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Скриншот: ${shot.title}`} ref={panelRef}>
      <div className="lightbox-top">
        <span className="lightbox-count">
          0{index + 1} / 0{screenshots.length}
        </span>
        <span className="lightbox-title">{shot.title}</span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть" ref={closeRef}>
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="lightbox-stage">
        <button
          type="button"
          className="lightbox-nav lightbox-nav--prev"
          onClick={() => onChange((index - 1 + screenshots.length) % screenshots.length)}
          aria-label="Предыдущий скриншот"
        >
          <Icon name="chevronLeft" size={22} />
        </button>
        <img key={shot.id} src={shot.image} alt={shot.alt} />
        <button
          type="button"
          className="lightbox-nav lightbox-nav--next"
          onClick={() => onChange((index + 1) % screenshots.length)}
          aria-label="Следующий скриншот"
        >
          <Icon name="chevronRight" size={22} />
        </button>
      </div>

      <p className="lightbox-caption">{shot.caption}</p>
    </div>
  )
}
