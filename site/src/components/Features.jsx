import { features } from '../data/content'
import Icon from './Icon'

function FeatureVisual({ id }) {
  if (id === 'search') {
    return (
      <div className="mini-search" aria-hidden="true">
        <span className="mini-search-field">
          <Icon name="search" size={14} />
          трек, артист или альбом
        </span>
        <span className="mini-search-tags">
          <span>YouTube</span>
          <span>YT Music</span>
          <span>SoundCloud</span>
          <span>Deezer</span>
          <span>Apple Music</span>
          <span>Local</span>
        </span>
      </div>
    )
  }

  if (id === 'lyrics') {
    return (
      <div className="mini-lyrics" aria-hidden="true">
        <span>я оставлю свет в окне</span>
        <span className="mini-lyrics-active">и музыку на repeat</span>
        <span>город спит, а мы не спим</span>
      </div>
    )
  }

  if (id === 'profile') {
    return (
      <div className="mini-profile" aria-hidden="true">
        <span className="mini-level">6</span>
        <span className="mini-profile-copy">
          <span>Король</span>
          <span className="mini-progress">
            <i />
          </span>
        </span>
        <span className="mini-xp">906 / 1 100 XP</span>
      </div>
    )
  }

  if (id === 'sound') {
    return (
      <div className="mini-eq" aria-hidden="true">
        {[32, 62, 44, 78, 54, 88, 38, 68, 48, 72, 30, 58].map((height, index) => (
          <i key={index} style={{ '--bar': `${height}%`, '--delay': `${index * 70}ms` }} />
        ))}
      </div>
    )
  }

  if (id === 'privacy') {
    return (
      <div className="mini-privacy" aria-hidden="true">
        <Icon name="shield" size={20} />
        <span>0 телеметрии</span>
        <span className="mini-privacy-line" />
        <span>100% локально</span>
      </div>
    )
  }

  return (
    <div className="mini-moods" aria-hidden="true">
      <span className="mini-mood active">Карусель</span>
      <span className="mini-mood">Home</span>
      <span className="mini-mood-hint">фокус на треке</span>
    </div>
  )
}

export default function Features() {
  return (
    <section className="section features" id="features">
      <div className="container">
        <div className="section-head" data-reveal>
          <span className="eyebrow">Что внутри</span>
          <h2>
            Больше, чем <em>плеер</em>.
          </h2>
          <p>Всё, что нужно музыке, чтобы оставаться рядом. И ничего, что мешает.</p>
        </div>

        <div className="features-grid">
          {features.map((feature, index) => (
            <article
              className={`feature-card ${feature.wide ? 'feature-card--wide' : ''}`}
              key={feature.id}
              data-reveal
              style={{ '--reveal-delay': `${(index % 3) * 60}ms` }}
            >
              <div className="feature-head">
                <span className="feature-icon">
                  <Icon name={feature.icon} size={18} />
                </span>
                <span className="feature-id">0{index + 1}</span>
              </div>
              <div className="feature-body">
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </div>
              <FeatureVisual id={feature.id} />
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
