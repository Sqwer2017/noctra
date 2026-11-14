import { useEffect, useState } from 'react'
import Icon from './Icon'

export default function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 900)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  const handleClick = () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
  }

  return (
    <button
      className={`to-top ${visible ? 'is-visible' : ''}`}
      type="button"
      onClick={handleClick}
      aria-label="Наверх"
      tabIndex={visible ? 0 : -1}
    >
      <Icon name="arrowUp" size={17} />
    </button>
  )
}
