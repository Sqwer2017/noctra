import { useCallback, useEffect, useRef, useState } from 'react'
import BackToTop from './components/BackToTop'
import Community from './components/Community'
import Download from './components/Download'
import Faq from './components/Faq'
import Features from './components/Features'
import Footer from './components/Footer'
import Gallery from './components/Gallery'
import Header from './components/Header'
import Hero from './components/Hero'
import Intro from './components/Intro'
import MobileMenu from './components/MobileMenu'
import Mood from './components/Mood'
import Principles from './components/Principles'
import ScrollProgress from './components/ScrollProgress'
import Settings from './components/Settings'
import ShaderBackdrop from './components/ShaderBackdrop'
import SourcesStrip from './components/SourcesStrip'
import Ticker from './components/Ticker'
import Tour from './components/Tour'
import Welcome from './components/Welcome'
import { usePreferences } from './lib/preferences'
import { useReveal } from './lib/useReveal'

const INTRO_KEY = 'noctra:intro-seen'
const ONBOARDING_KEY = 'noctra:onboarded'

function readFlag(key) {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key) {
  try {
    window.localStorage.setItem(key, '1')
  } catch {
    // The flow still works for the current session without storage.
  }
}

function initialPhase() {
  if (readFlag(ONBOARDING_KEY)) return 'site'
  if (!readFlag(INTRO_KEY)) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    return reduced ? 'welcome' : 'intro'
  }
  return 'welcome'
}

export default function App() {
  const [phase, setPhase] = useState(initialPhase)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [tourMode, setTourMode] = useState('brief')
  const { preferences } = usePreferences()
  const tourTimer = useRef(null)

  useReveal(phase === 'site')

  useEffect(() => () => window.clearTimeout(tourTimer.current), [])

  const handleIntroDone = useCallback(() => {
    writeFlag(INTRO_KEY)
    setPhase(readFlag(ONBOARDING_KEY) ? 'site' : 'welcome')
  }, [])

  const handleWelcomeDone = useCallback(
    ({ tour }) => {
      writeFlag(INTRO_KEY)
      writeFlag(ONBOARDING_KEY)
      setPhase('site')
      if (!tour) return
      window.clearTimeout(tourTimer.current)
      tourTimer.current = window.setTimeout(() => {
        setTourMode(preferences.guide)
        setTourOpen(true)
      }, 560)
    },
    [preferences.guide],
  )

  const startTour = useCallback(
    (mode) => {
      const nextMode = mode || (preferences.guide === 'silent' ? 'brief' : preferences.guide)
      setSettingsOpen(false)
      setMenuOpen(false)
      window.clearTimeout(tourTimer.current)
      tourTimer.current = window.setTimeout(() => {
        setTourMode(nextMode)
        setTourOpen(true)
      }, 180)
    },
    [preferences.guide],
  )

  const closeTour = useCallback(() => setTourOpen(false), [])

  const replayIntro = useCallback(() => {
    setSettingsOpen(false)
    setMenuOpen(false)
    setTourOpen(false)
    window.scrollTo({ top: 0, behavior: 'auto' })
    setPhase('intro')
  }, [])

  const openSettings = useCallback(() => {
    setMenuOpen(false)
    setSettingsOpen(true)
  }, [])

  const siteInert = phase !== 'site' || settingsOpen || menuOpen || tourOpen

  return (
    <>
      <ShaderBackdrop />
      <ScrollProgress />

      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>

      <div className="site" inert={siteInert ? '' : undefined}>
        <Header
          menuOpen={menuOpen}
          onOpenSettings={openSettings}
          onOpenMenu={() => setMenuOpen(true)}
        />

        <main id="main">
          <Hero />
          <SourcesStrip />
          <Ticker />
          <Features />
          <Gallery />
          <Principles />
          <Mood onOpenSettings={openSettings} />
          <Download />
          <Faq />
          <Community />
        </main>

        <Footer
          onOpenSettings={openSettings}
          onStartTour={() => startTour()}
          onReplayIntro={replayIntro}
        />
      </div>

      <div className="grain-layer" aria-hidden="true" />
      <BackToTop />

      {phase === 'intro' ? <Intro onDone={handleIntroDone} /> : null}
      {phase === 'welcome' ? <Welcome onDone={handleWelcomeDone} /> : null}

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onReplayIntro={replayIntro}
        onStartTour={() => startTour()}
      />

      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenSettings={openSettings}
      />

      <Tour open={tourOpen} mode={tourMode} onClose={closeTour} />
    </>
  )
}
