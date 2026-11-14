import {
  ISSUES_URL,
  LICENSE_URL,
  NOTICE_URL,
  PRIVACY_URL,
  RELEASES_URL,
  REPO_URL,
  SOCIALS,
  navLinks,
} from '../data/content'
import Icon from './Icon'
import Logo from './Logo'

export default function Footer({ onOpenSettings, onStartTour, onReplayIntro }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand" data-reveal>
            <Logo size={38} />
            <p>Музыка после шума.</p>
            <span className="footer-brand-desc">
              Независимый плеер для Windows и Android. Открытый код, локальные данные, никакой рекламы.
            </span>
            <div className="footer-socials">
              {SOCIALS.map((social) => (
                <a
                  key={social.id}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${social.name}: ${social.handle}`}
                  title={`${social.name} · ${social.handle}`}
                >
                  <Icon name={social.id} size={16} />
                </a>
              ))}
            </div>
          </div>

          <div className="footer-cols">
            <div className="footer-col">
              <h3>Продукт</h3>
              {navLinks.slice(0, 4).map((link) => (
                <a key={link.href} href={link.href}>
                  {link.label}
                </a>
              ))}
              <a href={RELEASES_URL} target="_blank" rel="noreferrer">
                Все релизы
              </a>
            </div>

            <div className="footer-col">
              <h3>Проект</h3>
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                GitHub
              </a>
              <a href={ISSUES_URL} target="_blank" rel="noreferrer">
                Issues
              </a>
              <a href={LICENSE_URL} target="_blank" rel="noreferrer">
                Лицензия MIT
              </a>
              <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
                Приватность
              </a>
            </div>

            <div className="footer-col">
              <h3>Настроить</h3>
              <button type="button" onClick={onOpenSettings}>
                Внешний вид
              </button>
              <button type="button" onClick={onStartTour}>
                Пройти тур
              </button>
              <button type="button" onClick={onReplayIntro}>
                Заставка
              </button>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 Noctra · MIT</span>
          <span className="footer-credit">
            Сделано на базе{' '}
            <a href="https://github.com/rootscripts/riff" target="_blank" rel="noreferrer">
              Riff
            </a>{' '}
            ·{' '}
            <a href={NOTICE_URL} target="_blank" rel="noreferrer">
              NOTICE
            </a>
          </span>
          <span>Все товарные знаки принадлежат их владельцам</span>
        </div>

        <div className="footer-wordmark" aria-hidden="true">
          noctra
        </div>
      </div>
    </footer>
  )
}
