import { SOCIALS } from '../data/content'
import Icon from './Icon'

export default function Community() {
  return (
    <section className="section community" id="community">
      <div className="container">
        <div className="section-head section-head--split" data-reveal>
          <div>
            <span className="eyebrow">Noctra в сети</span>
            <h2>
              Следи за <em>Noctra</em>.
            </h2>
          </div>
          <p>Новости, беты и всё, что не влезло на сайт. Без спама.</p>
        </div>

        <div className="community-grid">
          {SOCIALS.map((social, index) => (
            <a
              className="social-card"
              key={social.id}
              href={social.href}
              target="_blank"
              rel="noreferrer"
              data-reveal
              style={{ '--reveal-delay': `${index * 70}ms` }}
            >
              <span className="social-card-top">
                <span className="social-icon">
                  <Icon name={social.id} size={20} />
                </span>
                <Icon name="arrowUpRight" size={16} />
              </span>
              <span className="social-name">{social.name}</span>
              <span className="social-handle">{social.handle}</span>
              <span className="social-desc">{social.description}</span>
            </a>
          ))}
        </div>

        <p className="community-note" data-reveal>
          <Icon name="shield" size={14} />
          Открытый код. Живые беты. Ни одного спама.
        </p>
      </div>
    </section>
  )
}
