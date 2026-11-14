import { Component, Suspense, lazy } from 'react'
import { usePreferences } from '../lib/preferences'
import { useMediaQuery } from '../lib/useMediaQuery'

const ShaderScene = lazy(() => import('./ShaderScene'))

class SceneBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

export default function ShaderBackdrop() {
  const { preferences } = usePreferences()
  const wide = useMediaQuery('(min-width: 768px)')
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const animated = wide && !reduced && preferences.atmosphere !== 'quiet'

  return (
    <div className={`backdrop backdrop--${preferences.atmosphere}`} aria-hidden="true">
      <div className="backdrop-base" />
      {animated ? (
        <Suspense fallback={null}>
          <SceneBoundary>
            <ShaderScene atmosphere={preferences.atmosphere} />
          </SceneBoundary>
        </Suspense>
      ) : null}
      <div className="backdrop-veil" />
    </div>
  )
}
