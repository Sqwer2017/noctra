import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export const ACCENTS = [
  { id: 'violet', name: 'Фиалка', color: '#b6a7ff' },
  { id: 'sage', name: 'Шалфей', color: '#a9c8b1' },
  { id: 'amber', name: 'Янтарь', color: '#e0bd91' },
  { id: 'rose', name: 'Роза', color: '#e2a7b2' },
  { id: 'ice', name: 'Лёд', color: '#a9c9d9' },
]

export const ATMOSPHERES = [
  { id: 'fog', name: 'Туман', hint: 'Тёплый полумрак' },
  { id: 'aurora', name: 'Аврора', hint: 'Медленное течение' },
  { id: 'quiet', name: 'Тишина', hint: 'Статичный фон' },
]

export const GUIDES = [
  { id: 'silent', name: 'Сам', hint: 'Без подсказок' },
  { id: 'brief', name: 'Коротко', hint: 'Две подсказки' },
  { id: 'detailed', name: 'Подробно', hint: 'Полный тур' },
]

const STORAGE_KEY = 'noctra:preferences'
const DEFAULT_PREFERENCES = { accent: 'violet', atmosphere: 'fog', guide: 'brief' }

const PreferencesContext = createContext(null)

function loadPreferences() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const saved = JSON.parse(raw)
    return {
      accent: ACCENTS.some((item) => item.id === saved.accent) ? saved.accent : DEFAULT_PREFERENCES.accent,
      atmosphere: ATMOSPHERES.some((item) => item.id === saved.atmosphere)
        ? saved.atmosphere
        : DEFAULT_PREFERENCES.atmosphere,
      guide: GUIDES.some((item) => item.id === saved.guide) ? saved.guide : DEFAULT_PREFERENCES.guide,
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(loadPreferences)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.accent = preferences.accent
    root.dataset.atmosphere = preferences.atmosphere
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
    } catch {
      // Storage can be unavailable in private mode; preferences still work for the session.
    }
  }, [preferences])

  const update = useCallback((patch) => {
    setPreferences((current) => ({ ...current, ...patch }))
  }, [])

  const reset = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES)
  }, [])

  const value = useMemo(
    () => ({ preferences, update, reset, accent: currentAccent(preferences.accent) }),
    [preferences, update, reset],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

function currentAccent(id) {
  return ACCENTS.find((accent) => accent.id === id) ?? ACCENTS[0]
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider')
  return context
}
