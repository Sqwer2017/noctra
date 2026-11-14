import { useEffect, useState } from 'react'
import { useMediaQuery } from '../lib/useMediaQuery'
import Icon from './Icon'

const tracks = [
  { title: 'Nightfall', artist: 'Noctra Sessions', tone: 'violet' },
  { title: 'After Hours', artist: 'Noctra Sessions', tone: 'rose' },
  { title: 'Slow Motion', artist: 'Noctra Sessions', tone: 'amber' },
]

const bars = [38, 72, 52, 86, 46]

export default function NowPlaying() {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (reduced) return undefined
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % tracks.length)
    }, 5600)
    return () => window.clearInterval(timer)
  }, [reduced])

  const track = tracks[index]

  return (
    <div className="now-dock" aria-label="Демо-плеер Noctra">
      <span className="now-cover" data-tone={track.tone} aria-hidden="true">
        <Icon name="moon" size={17} />
      </span>
      <span className="now-copy">
        <span className="now-label">Сейчас в Noctra</span>
        <span className="now-track" key={`${track.title}-title`}>
          {track.title}
        </span>
        <span className="now-artist">{track.artist}</span>
      </span>
      <span className="now-eq" aria-hidden="true">
        {bars.map((height, barIndex) => (
          <i
            key={barIndex}
            style={{ '--bar-height': `${height}%`, '--bar-delay': `${barIndex * 110}ms` }}
          />
        ))}
      </span>
      <span className="now-progress" aria-hidden="true" key={`${track.title}-bar`}>
        <i />
      </span>
    </div>
  )
}
