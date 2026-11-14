import Icon from './Icon'
import { AccentPicker, AtmospherePicker, MoodPreview } from './PreferencesControls'

export default function Mood({ onOpenSettings }) {
  return (
    <section className="section mood" id="mood">
      <div className="container mood-grid">
        <div className="mood-copy" data-reveal>
          <span className="eyebrow">Подстрой под себя</span>
          <h2>
            Цвет <em>настроения</em>.
          </h2>
          <p>
            Выбери оттенок и атмосферу. Изменения применяются сразу и остаются на этом устройстве.
            Никаких аккаунтов и облачных профилей.
          </p>

          <div className="mood-controls" data-tour="mood">
            <AccentPicker />
            <AtmospherePicker />
          </div>

          <div className="mood-foot">
            <span className="mood-note">
              <Icon name="check" size={13} />
              Сохраняется автоматически
            </span>
            <button type="button" className="text-link" onClick={onOpenSettings}>
              Больше настроек
              <Icon name="arrowUpRight" size={15} />
            </button>
          </div>
        </div>

        <div className="mood-preview-wrap" data-reveal style={{ '--reveal-delay': '120ms' }}>
          <MoodPreview />
          <div className="mood-preview-caption">
            <span>
              <Icon name="info" size={14} />
              Так интерфейс выглядит в твоём настроении
            </span>
            <span>живой предпросмотр</span>
          </div>
        </div>
      </div>
    </section>
  )
}
