import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  const notify = useCallback((payload) => {
    window.clearTimeout(timer.current)
    setToast({ id: Date.now(), title: payload.title, text: payload.text })
    timer.current = window.setTimeout(() => setToast(null), 4200)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-atomic="true">
        {toast ? (
          <div className="toast" key={toast.id} role="status">
            <span className="toast-icon">
              <Icon name="check" size={14} />
            </span>
            <span className="toast-copy">
              <strong>{toast.title}</strong>
              {toast.text ? <span>{toast.text}</span> : null}
            </span>
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
