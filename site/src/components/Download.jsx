import { RELEASES_URL } from '../data/content'
import { formatCount, useDownloads } from '../lib/downloads'
import { useAnimatedNumber } from '../lib/useAnimatedNumber'
import Icon from './Icon'

const deviceLines = {
  windows: 'Ты на Windows. Установщик уже готов.',
  android: 'Ты на Android. APK уже готов.',
  ios: 'Ты на iPhone или iPad. iOS-версии пока нет, но APK для Android доступен.',
  macos: 'Ты на macOS. Готовые сборки пока экспериментальные.',
  linux: 'Ты на Linux. Готовой AppImage пока нет, но плеер можно собрать из исходников.',
  unknown: 'Кнопка подберёт файл под твою систему.',
}

const notes = {
  windows:
    'Сборка пока без коммерческой подписи. SmartScreen может попросить «Подробнее → Выполнить». Исходники открыты для проверки.',
  android: 'APK устанавливается вручную. Разреши установку из этого источника в настройках Android.',
  ios: 'APK подходит только для Android. Версия для iOS пока в работе.',
  macos: 'DMG и ZIP-сборки экспериментальные. Актуальные файлы и инструкция — на GitHub.',
  linux: 'Готовой AppImage пока нет. Собери приложение из исходников по инструкции в README.',
  unknown: 'Если файл не подойдёт, выбери свою платформу в списке.',
}

export default function Download() {
  const { device, primary, targets, release, count, start } = useDownloads()
  const animatedCount = useAnimatedNumber(count)
  const note = notes[device] ?? notes.unknown

  return (
    <section className="section download" id="download">
      <div className="container">
        <div className="download-panel" data-reveal>
          <div className="download-main">
            <span className="eyebrow">Пора слушать</span>
            <h2>
              Одна кнопка. <em>Твой</em> формат.
            </h2>
            <p className="download-line">{deviceLines[device] ?? deviceLines.unknown}</p>

            <div className="download-device">
              <span className="download-device-icon">
                <Icon name={primary.id === 'ios' ? 'smartphone' : primary.icon} size={20} />
              </span>
              <span className="download-device-copy">
                <span>Определили устройство</span>
                <strong>{primary.id === 'ios' ? 'iPhone / iPad' : primary.label}</strong>
              </span>
              <span className={`tag tag--${primary.tone}`}>{primary.status}</span>
            </div>

            <a
              className="btn btn-primary btn-xl download-primary"
              data-tour="download"
              href={primary.href}
              onClick={() => start(primary)}
              target={primary.external ? '_blank' : undefined}
              rel={primary.external ? 'noreferrer' : undefined}
            >
              <Icon name="download" size={19} />
              {primary.actionLabel}
              <Icon name="arrowRight" size={17} className="btn-icon-end" />
            </a>

            <div className="download-meta">
              <span>
                {release.tag} · {primary.sub}
              </span>
              <span>
                <strong>{formatCount(animatedCount)}</strong> скачиваний
              </span>
            </div>

            <p className="download-note">
              <Icon name="info" size={14} />
              {note}
            </p>
          </div>

          <div className="download-side">
            <div className="download-side-head">
              <span>Все платформы</span>
              <span>статус</span>
            </div>
            <div className="platform-list">
              {targets.map((target) => (
                <a
                  className="platform-row"
                  key={target.id}
                  href={target.href}
                  onClick={() => start(target)}
                  target={target.external ? '_blank' : undefined}
                  rel={target.external ? 'noreferrer' : undefined}
                  data-active={target.id === primary.id}
                >
                  <span className="platform-icon">
                    <Icon name={target.icon} size={18} />
                  </span>
                  <span className="platform-copy">
                    <strong>{target.label}</strong>
                    <small>{target.sub}</small>
                  </span>
                  <span className={`tag tag--${target.tone}`}>{target.status}</span>
                  <Icon name={target.external ? 'arrowUpRight' : 'download'} size={15} />
                </a>
              ))}
            </div>

            <a className="download-all" href={RELEASES_URL} target="_blank" rel="noreferrer">
              Все релизы на GitHub
              <Icon name="arrowUpRight" size={15} />
            </a>

            <div className="download-side-foot">
              <span>
                <Icon name="shield" size={14} />
                Без рекламы и телеметрии
              </span>
              <span>MIT · open source</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
