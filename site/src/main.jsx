import '@fontsource-variable/manrope'
import '@fontsource/cormorant-garamond/400-italic.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DownloadsProvider } from './lib/downloads'
import { PreferencesProvider } from './lib/preferences'
import { ToastProvider } from './lib/toast'
import './styles/base.css'
import './styles/app.css'
import './styles/overlays.css'
import './styles/responsive.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PreferencesProvider>
      <ToastProvider>
        <DownloadsProvider>
          <App />
        </DownloadsProvider>
      </ToastProvider>
    </PreferencesProvider>
  </StrictMode>,
)
