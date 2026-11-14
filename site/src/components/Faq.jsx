import { faqs, ISSUES_URL } from '../data/content'
import Icon from './Icon'

export default function Faq() {
  return (
    <section className="section faq" id="faq">
      <div className="container faq-grid">
        <div className="faq-intro" data-reveal>
          <span className="eyebrow">FAQ</span>
          <h2>
            Коротко о <em>важном</em>.
          </h2>
          <p>Если чего-то не хватает, вопрос можно задать прямо на GitHub.</p>
          <a className="text-link" href={ISSUES_URL} target="_blank" rel="noreferrer">
            Задать вопрос
            <Icon name="arrowUpRight" size={15} />
          </a>
        </div>

        <div className="faq-list">
          {faqs.map((item, index) => (
            <details
              className="faq-item"
              key={item.q}
              name="noctra-faq"
              open={index === 0}
              data-reveal
              style={{ '--reveal-delay': `${Math.min(index, 4) * 40}ms` }}
            >
              <summary>
                <span>{item.q}</span>
                <span className="faq-plus" aria-hidden="true">
                  <Icon name="plus" size={16} />
                </span>
              </summary>
              <div className="faq-answer">
                <p>{item.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
