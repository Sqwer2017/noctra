import { useEffect, useRef, useState } from 'react'
import { usePreferences } from '../lib/preferences'
import { useBodyLock } from '../lib/useBodyLock'
import { useDialogFocus } from '../lib/useDialogFocus'
import Icon from './Icon'
import Logo from './Logo'
import { AccentPicker, AtmospherePicker, GuidePicker, MoodPreview } from './PreferencesControls'

const steps = [
  {
    kicker: '01 · знакомство',
    title: 'Сначала — как тебя вести.',
    text: 'Выбери сопровождение по сайту. Подсказки можно оставить короткими, включить полный тур или отключить совсем.',
  },
  {
    kicker: '02 · цвет',
    title: 'Какой у Noctra характер?',
    text: 'Выбери акцент. Он сразу появится на кнопках, ссылках и в плеере, а мы запомним выбор.',
  },
  {
    kicker: '03 · атмосфера',
    title: 'Последний штрих.',
    text: 'Настрой фон: тёплый туман, медленная аврора или полная тишина без движения.',
  },
]

export default function Welcome({ onDone }) {
  const [step, setStep] = useState(0)
  const { preferences } = usePreferences()
  const panelRef = useRef(null)
  const headingRef = useRef(null)

  useBodyLock(true)
  useDialogFocus(true, () => onDone({ tour: false }), panelRef, headingRef)

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [step])

  const finish = () => onDone({ tour: preferences.guide !== 'silent' })

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" ref={panelRef}>
      <div className="welcome-backdrop" aria-hidden="true" />
      <div className="welcome-top container">
        <Logo size={30} />
        <button className="welcome-skip" type="button" onClick={() => onDone({ tour: false })}>
          Пропустить знакомство
        </button>
      </div>

      <div className="welcome-shell container">
        <div className="welcome-copy">
          <span className="welcome-kicker">{steps[step].kicker}</span>
          <div className="welcome-step" key={step}>
            <h2 id="welcome-title" tabIndex={-1} ref={headingRef}>
              {steps[step].title}
            </h2>
            <p>{steps[step].text}</p>

            <div className="welcome-control">
              {step === 0 ? <GuidePicker /> : null}
              {step === 1 ? <AccentPicker /> : null}
              {step === 2 ? <AtmospherePicker /> : null}
            </div>
          </div>

          <div className="welcome-actions">
            <div className="welcome-progress" aria-label={`Шаг ${step + 1} из 3`}>
              {steps.map((item, index) => (
                <span key={item.kicker} data-active={index === step} data-done={index < step} />
              ))}
              <small>0{step + 1} / 03</small>
            </div>

            <div className="welcome-buttons">
              {step > 0 ? (
                <button className="btn btn-ghost" type="button" onClick={() => setStep(step - 1)}>
                  Назад
                </button>
              ) : null}
              {step < steps.length - 1 ? (
                <button className="btn btn-primary" type="button" onClick={() => setStep(step + 1)}>
                  Дальше
                  <Icon name="arrowRight" size={16} />
                </button>
              ) : (
                <button className="btn btn-primary" type="button" onClick={finish}>
                  Начать
                  <Icon name="arrowRight" size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="welcome-aside">
          <MoodPreview />
          <div className="welcome-aside-note">
            <Icon name="check" size={13} />
            Выбор можно изменить в любой момент
          </div>
        </div>
      </div>
    </div>
  )
}
