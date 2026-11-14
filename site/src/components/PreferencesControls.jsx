import { useId } from 'react'
import { ACCENTS, ATMOSPHERES, GUIDES, usePreferences } from '../lib/preferences'
import Icon from './Icon'
import Logo from './Logo'

export function AccentPicker({ compact = false }) {
  const { preferences, update } = usePreferences()
  const name = useId()

  return (
    <fieldset className={`picker ${compact ? 'picker--compact' : ''}`}>
      <legend className="picker-legend">Акцент</legend>
      <div className="accent-options">
        {ACCENTS.map((accent) => {
          const selected = preferences.accent === accent.id
          return (
            <label className="accent-option" data-selected={selected} key={accent.id}>
              <input
                type="radio"
                name={name}
                value={accent.id}
                checked={selected}
                onChange={() => update({ accent: accent.id })}
              />
              <span className="accent-dot" style={{ '--swatch': accent.color }} aria-hidden="true">
                <Icon name="check" size={12} />
              </span>
              <span className="accent-name">{accent.name}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function AtmospherePicker({ compact = false }) {
  const { preferences, update } = usePreferences()
  const name = useId()

  return (
    <fieldset className={`picker ${compact ? 'picker--compact' : ''}`}>
      <legend className="picker-legend">Атмосфера</legend>
      <div className="atmo-options">
        {ATMOSPHERES.map((atmosphere) => {
          const selected = preferences.atmosphere === atmosphere.id
          return (
            <label className="atmo-option" data-selected={selected} key={atmosphere.id}>
              <input
                type="radio"
                name={name}
                value={atmosphere.id}
                checked={selected}
                onChange={() => update({ atmosphere: atmosphere.id })}
              />
              <span className="atmo-thumb" data-atmo={atmosphere.id} aria-hidden="true" />
              <span className="atmo-copy">
                <strong>{atmosphere.name}</strong>
                <small>{atmosphere.hint}</small>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function GuidePicker() {
  const { preferences, update } = usePreferences()
  const name = useId()

  return (
    <fieldset className="picker">
      <legend className="picker-legend">Сопровождение</legend>
      <div className="guide-options">
        {GUIDES.map((guide, index) => {
          const selected = preferences.guide === guide.id
          return (
            <label className="guide-option" data-selected={selected} key={guide.id}>
              <input
                type="radio"
                name={name}
                value={guide.id}
                checked={selected}
                onChange={() => update({ guide: guide.id })}
              />
              <span className="guide-index">0{index + 1}</span>
              <span className="guide-copy">
                <strong>{guide.name}</strong>
                <small>{guide.hint}</small>
              </span>
              <span className="guide-check" aria-hidden="true">
                <Icon name="check" size={12} />
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function MoodPreview({ compact = false }) {
  const { accent, preferences } = usePreferences()

  return (
    <div
      className={`mood-preview ${compact ? 'mood-preview--compact' : ''}`}
      data-atmosphere={preferences.atmosphere}
      aria-label="Предпросмотр оформления"
    >
      <div className="preview-head">
        <Logo size={compact ? 18 : 22} />
        <span className="preview-chip">Предпросмотр</span>
      </div>

      <div className="preview-cover" aria-hidden="true">
        <span className="preview-orbit preview-orbit--one" />
        <span className="preview-orbit preview-orbit--two" />
        <span className="preview-moon">
          <Icon name="moon" size={compact ? 44 : 64} />
        </span>
        <span className="preview-cover-meta">NCT · 01</span>
      </div>

      <div className="preview-meta">
        <div className="preview-track">
          <strong>Nightfall</strong>
          <span>Noctra Sessions</span>
        </div>
        <div className="preview-actions">
          <span className="preview-eq" aria-hidden="true">
            {[44, 76, 52, 88].map((height, index) => (
              <i
                key={height}
                style={{ '--preview-bar': `${height}%`, '--preview-delay': `${index * 120}ms` }}
              />
            ))}
          </span>
          <span className="preview-play" aria-hidden="true">
            <Icon name="play" size={14} />
          </span>
        </div>
      </div>

      <div className="preview-progress" aria-hidden="true">
        <span style={{ width: '36%' }} />
      </div>
      <div className="preview-times" aria-hidden="true">
        <span>1:04</span>
        <span>3:12</span>
      </div>

      <div className="preview-footer">
        <span className="preview-accent" style={{ '--swatch': accent.color }} />
        <span>{accent.name}</span>
      </div>
    </div>
  )
}
