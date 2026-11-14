import { useEffect, useRef, useState } from 'react'
import logo from '../assets/media/noctra-logo.png'
import { platforms } from '../data/content'
import { useBodyLock } from '../lib/useBodyLock'
import { useDialogFocus } from '../lib/useDialogFocus'

export default function Intro({ onDone }) {
  const [leaving, setLeaving] = useState(false)
  const panelRef = useRef(null)
  const skipRef = useRef(null)

  useBodyLock(true)
  useDialogFocus(true, onDone, panelRef, skipRef)

  useEffect(() => {
    const leaveTimer = window.setTimeout(() => setLeaving(true), 3150)
    const doneTimer = window.setTimeout(onDone, 3850)
    return () => {
      window.clearTimeout(leaveTimer)
      window.clearTimeout(doneTimer)
    }
  }, [onDone])

  return (
    <div
      className={`intro ${leaving ? 'is-leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Заставка Noctra"
      ref={panelRef}
    >
      <div className="intro-wash intro-wash--one" aria-hidden="true" />
      <div className="intro-wash intro-wash--two" aria-hidden="true" />
      <div className="intro-grain" aria-hidden="true" />

      <button className="intro-skip" type="button" onClick={onDone} ref={skipRef}>
        Пропустить
        <span>Esc</span>
      </button>

      <div className="intro-stage">
        <div className="intro-rings" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div className="intro-tiles" aria-hidden="true">
          {platforms.map((platform, index) => (
            <span
              className="intro-tile"
              key={platform.id}
              style={{ '--i': index, '--angle': `${index * 60}deg` }}
            >
              <img src={platform.logo} alt="" />
            </span>
          ))}
        </div>

        <div className="intro-brand">
          <span className="intro-mark">
            <img src={logo} alt="" />
          </span>
          <span className="intro-word">Noctra</span>
          <span className="intro-tagline">музыка, которая остаётся твоей</span>
        </div>
      </div>

      <div className="intro-foot">
        <span>Открытый код · MIT</span>
        <span>Собираем твою музыку в одном окне</span>
      </div>
    </div>
  )
}
