import { principles } from '../data/content'
import { useAnimatedNumber } from '../lib/useAnimatedNumber'
import { useInView } from '../lib/useInView'

function Stat({ stat, index }) {
  const [ref, inView] = useInView(0.4)
  const value = useAnimatedNumber(inView ? stat.value ?? 0 : 0, 1200)
  const isText = typeof stat.text === 'string'

  return (
    <div
      className="principle"
      ref={ref}
      data-reveal
      style={{ '--reveal-delay': `${index * 70}ms` }}
    >
      <span className={`principle-value ${isText ? 'principle-value--text' : ''}`}>
        {isText ? stat.text : `${value}${stat.suffix ?? ''}`}
      </span>
      <span className="principle-label">{stat.label}</span>
      <span className="principle-note">{stat.note}</span>
    </div>
  )
}

export default function Principles() {
  return (
    <section className="section principles" id="principles">
      <div className="container">
        <div className="principles-head" data-reveal>
          <span className="eyebrow">Принципы</span>
          <h2>
            Меньше шума.
            <br />
            <em>Больше</em> музыки.
          </h2>
          <p>
            Noctra не борется за твоё внимание. Он просто играет музыку — и оставляет тебя наедине
            с тем, что ты слушаешь.
          </p>
        </div>

        <div className="principles-stats">
          {principles.map((stat, index) => (
            <Stat key={stat.label} stat={stat} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}
