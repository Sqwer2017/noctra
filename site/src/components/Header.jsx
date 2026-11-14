import { useEffect, useState } from 'react'
import { navLinks, SOCIALS } from '../data/content'
import { useDownloads } from '../lib/downloads'
import Icon from './Icon'
import Logo from './Logo'

export default function Header({ onOpenSettings, onOpenMenu, menuOpen }) {
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState('')
  const { primary, start } = useDownloads()

  useEffect(() => {
    const update = () => {
      setScrolled(window.scrollY > 12)
      const cursor = window.scrollY + 140
      let current = ''
      for (const link of navLinks) {
        const section = document.querySelector(link.href)
        if (!section) continue
        if (cursor >= section.offsetTop && cursor < section.offsetTop + section.offsetHeight) {
          current = link.href.slice(1)
          break
        }
      }
      setActiveSection(current)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  return (
    <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="container header-inner">
        <a className="brand-link" href="#top" aria-label="Noctra, на главную">
          <Logo size={30} />
        </a>

        <nav className="main-nav" aria-label="Основная навигация">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={activeSection === link.href.slice(1) ? 'is-active' : undefined}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <div className="header-socials">
            {SOCIALS.map((social) => (
              <a
                className="icon-btn"
                key={social.id}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                aria-label={`${social.name}: ${social.handle}`}
                title={`${social.name} · ${social.handle}`}
              >
                <Icon name={social.id} size={17} />
              </a>
            ))}
          </div>
          <button className="icon-btn header-settings" type="button" onClick={onOpenSettings} aria-label="Настроить сайт">
            <Icon name="sliders" size={17} />
          </button>
          <a
            className="btn btn-primary btn-header"
            href={primary.href}
            onClick={() => start(primary)}
            target={primary.external ? '_blank' : undefined}
            rel={primary.external ? 'noreferrer' : undefined}
            aria-label={primary.actionLabel}
          >
            <Icon name="download" size={16} />
            <span className="btn-header-label">Скачать</span>
          </a>
          <button
            className="icon-btn menu-btn"
            type="button"
            onClick={onOpenMenu}
            aria-label="Открыть меню"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            <Icon name="menu" size={19} />
          </button>
        </div>
      </div>
    </header>
  )
}
