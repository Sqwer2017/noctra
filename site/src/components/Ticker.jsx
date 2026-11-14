import { tickerPhrases } from '../data/content'

function TickerGroup() {
  return (
    <div className="ticker-group">
      {tickerPhrases.map((phrase) => (
        <span className="ticker-item" key={phrase.text}>
          {phrase.em ? <em>{phrase.text}</em> : phrase.text}
          <span className="ticker-dot" aria-hidden="true" />
        </span>
      ))}
    </div>
  )
}

export default function Ticker() {
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        <TickerGroup />
        <TickerGroup />
      </div>
    </div>
  )
}
