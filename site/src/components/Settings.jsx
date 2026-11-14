import { useRef } from 'react'
import { usePreferences } from '../lib/preferences'
import { useBodyLock } from '../lib/useBodyLock'
import { useDialogFocus } from '../lib/useDialogFocus'
import { useToast } from '../lib/toast'
import Icon from './Icon'
import { AccentPicker, AtmospherePicker, GuidePicker, MoodPreview } from './PreferencesControls'

export default function Settings({ open, onClose, onReplayIntro, onStartTour }) {
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const { reset } = usePreferences()
  const toast = useToast()

  useBodyLock(open)
  useDialogFocus(open, onClose, panelRef, closeRef)

  if (!open) return null

  const handleReset = () => {
    reset()
    toast({ title: 'Настройки сброшены', text: 'Вернули фиалковый акцент и спокойный туман.' })
  }

  return (
    <div className="drawer">
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />

      <aside className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" ref={panelRef}>
        <div className="settings-head">
          <span className="settings-heading">
            <span className="eyebrow">Настройки</span>
            <h2 id="settings-title">Твой Noctra.</h2>
          </span>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Закрыть настройки" ref={closeRef}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="settings-scroll">
          <div className="settings-preview">
            <MoodPreview compact />
          </div>

          <GuidePicker />
          <AccentPicker compact />
          <AtmospherePicker compact />

          <div className="settings-links">
            <button type="button" onClick={onStartTour}>
              <span>
                <Icon name="sparkle" size={17} />
                Пройти тур по сайту
              </span>
              <Icon name="arrowRight" size={16} />
            </button>
            <button type="button" onClick={onReplayIntro}>
              <span>
                <Icon name="play" size={17} />
                Повторить заставку
              </span>
              <Icon name="arrowRight" size={16} />
            </button>
          </div>
        </div>

        <div className="settings-foot">
          <button className="settings-reset" type="button" onClick={handleReset}>
            <Icon name="refresh" size={15} />
            Сбросить
          </button>
          <button className="btn btn-primary" type="button" onClick={onClose}>
            Готово
          </button>
        </div>
      </aside>
    </div>
  )
}
