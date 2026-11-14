import { useRef } from 'react'
import { navLinks, SOCIALS } from '../data/content'
import { useDownloads } from '../lib/downloads'
import { useBodyLock } from '../lib/useBodyLock'
import { useDialogFocus } from '../lib/useDialogFocus'
import Icon from './Icon'
import Logo from './Logo'

export default function MobileMenu({ open, onClose, onOpenSettings }) {
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const { primary, count, start } = useDownloads()

  useBodyLock(open)
  useDialogFocus(open, onClose, panelRef, closeRef)

  if (!open) return null

  const jump = (event, href) => {
    event.preventDefault()
    onClose()
    window.setTimeout(() => {
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  return (
    <div className="menu-sheet" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Меню сайта" ref={panelRef}>
      <div className="menu-top container">
        <Logo size={30} />
        <button className="icon-btn" type="button" onClick={onClose} aria-label="Закрыть меню" ref={closeRef}>
          <Icon name="close" size={20} />
        </button>
      </div>

      <nav className="menu-nav container" aria-label="Мобильная навигация">
        {navLinks.map((link, index) => (
          <a key={link.href} href={link.href} onClick={(event) => jump(event, link.href)}>
            <span className="menu-index">0{index + 1}</span>
            <span>{link.label}</span>
            <Icon name="arrowRight" size={18} />
          </a>
        ))}
      </nav>

      <div className="menu-bottom container">
        <a
          className="btn btn-primary btn-lg menu-download"
          href={primary.href}
          onClick={() => {
            start(primary)
            onClose()
          }}
          target={primary.external ? '_blank' : undefined}
          rel={primary.external ? 'noreferrer' : undefined}
        >
          <Icon name="download" size={17} />
          {primary.actionLabel}
        </a>
        <p className="menu-count">{count.toLocaleString('ru-RU')} скачиваний · открытый код</p>

        <div className="menu-socials">
          {SOCIALS.map((social) => (
            <a
              key={social.id}
              href={social.href}
              target="_blank"
              rel="noreferrer"
              aria-label={`${social.name}: ${social.handle}`}
            >
              <Icon name={social.id} size={18} />
              <span>{social.name}</span>
            </a>
          ))}
        </div>

        <button
          className="menu-utility-link menu-settings"
          type="button"
          onClick={() => {
            onClose()
            window.setTimeout(onOpenSettings, 80)
          }}
        >
          <Icon name="sliders" size={17} />
          Настроить сайт
        </button>
      </div>
    </div>
  )
}
