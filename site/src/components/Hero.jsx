import { useRef } from 'react'
import homeShot from '../assets/media/home.webp'
import { sourcePlatforms } from '../data/content'
import { formatCount, useDownloads } from '../lib/downloads'
import { useAnimatedNumber } from '../lib/useAnimatedNumber'
import { useMediaQuery } from '../lib/useMediaQuery'
import Icon from './Icon'
import NowPlaying from './NowPlaying'

export default function Hero() {
  const { primary, deviceMeta, release, count, start } = useDownloads()
  const animatedCount = useAnimatedNumber(count)
  const deviceIcon = primary.id === 'ios' ? 'smartphone' : deviceMeta.icon
  const visualRef = useRef(null)
  const finePointer = useMediaQuery('(pointer: fine)')
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  const handlePointerMove = (event) => {
    if (!finePointer || reducedMotion || !visualRef.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    visualRef.current.style.setProperty('--tilt-x', `${((0.5 - y) * 3.2).toFixed(2)}deg`)
    visualRef.current.style.setProperty('--tilt-y', `${((x - 0.5) * 4).toFixed(2)}deg`)
    visualRef.current.style.setProperty('--glare-x', `${(x * 100).toFixed(1)}%`)
    visualRef.current.style.setProperty('--glare-y', `${(y * 100).toFixed(1)}%`)
    visualRef.current.style.setProperty('--glare-opacity', '0.9')
  }

  const resetTilt = () => {
    if (!visualRef.current) return
    visualRef.current.style.setProperty('--tilt-x', '0deg')
    visualRef.current.style.setProperty('--tilt-y', '0deg')
    visualRef.current.style.setProperty('--glare-x', '50%')
    visualRef.current.style.setProperty('--glare-y', '50%')
    visualRef.current.style.setProperty('--glare-opacity', '0')
  }

  return (
    <section className="hero" id="top">
      <div className="container hero-grid">
        <div className="hero-copy">
          <div className="hero-eyebrow" data-reveal>
            <span className="status-dot" />
            <span>Независимый музыкальный плеер</span>
            <span className="eyebrow-divider" aria-hidden="true" />
            <span className="eyebrow-soft">open source</span>
          </div>

          <h1 data-reveal style={{ '--reveal-delay': '60ms' }}>
            <span>Музыка,</span>
            <span>
              которая <em>остаётся</em>
            </span>
            <span>твоей.</span>
          </h1>

          <p className="hero-lead" data-reveal style={{ '--reveal-delay': '120ms' }}>
            Все источники, тексты и твой прогресс в одном тихом окне. Без подписки, рекламы и облачной привязки.
          </p>

          <div className="hero-actions" data-tour="hero-download" data-reveal style={{ '--reveal-delay': '180ms' }}>
            <a
              className="btn btn-primary btn-lg"
              href={primary.href}
              onClick={() => start(primary)}
              target={primary.external ? '_blank' : undefined}
              rel={primary.external ? 'noreferrer' : undefined}
            >
              <Icon name={deviceIcon} size={18} />
              <span>{primary.actionLabel}</span>
              <Icon name="download" size={16} className="btn-icon-end" />
            </a>
            <a className="btn btn-ghost btn-lg" href="#screens">
              Смотреть интерфейс
              <Icon name="arrowDown" size={16} className="btn-icon-end" />
            </a>
          </div>

          <div className="hero-meta" data-reveal style={{ '--reveal-delay': '240ms' }}>
            <span className="hero-device">
              <Icon name={deviceMeta.icon} size={15} />
              {deviceMeta.detail}
            </span>
            <span className="meta-dot" aria-hidden="true" />
            <span>{primary.direct ? primary.sub : 'откроется GitHub'}</span>
            <span className="meta-dot meta-dot--before-count" aria-hidden="true" />
            <span className="hero-count">
              <strong>{formatCount(animatedCount)}</strong> скачиваний
            </span>
            <span className="meta-dot" aria-hidden="true" />
            <span>бесплатно</span>
          </div>
        </div>

        <div
          className="hero-visual"
          data-reveal
          style={{ '--reveal-delay': '160ms' }}
          ref={visualRef}
          onPointerMove={handlePointerMove}
          onPointerLeave={resetTilt}
        >
          <div className="hero-orbits" aria-hidden="true">
            <span className="hero-orbit hero-orbit--one" />
            <span className="hero-orbit hero-orbit--two" />
            <span className="hero-orbit hero-orbit--three" />
            <span className="hero-orbit-dot" />
          </div>

          <div className="app-frame">
            <div className="app-frame-bar">
              <span className="app-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="app-frame-name">
                Noctra <span>· {release.tag}</span>
              </span>
              <span className="app-frame-status">
                <span className="live-dot" />
                твоя музыка
              </span>
            </div>
            <div className="app-frame-screen">
              <img
                src={homeShot}
                width="1800"
                height="929"
                alt="Главный экран Noctra: подборки, недавние треки и панель плеера"
              />
            </div>
          </div>

          <NowPlaying />

          <div className="hero-frame-foot">
            <span className="hero-frame-sources">
              {sourcePlatforms.slice(0, 3).map((platform) => (
                <img key={platform.id} src={platform.logo} alt="" />
              ))}
              <span>6 источников</span>
            </span>
            <span>{primary.sub}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
