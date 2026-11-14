import logo from '../assets/media/noctra-logo.png'

export default function Logo({ size = 32, word = true, className = '' }) {
  return (
    <span className={`brand ${className}`.trim()}>
      <span className="brand-mark" style={{ '--mark-size': `${size}px` }}>
        <img src={logo} alt={word ? '' : 'Noctra'} />
      </span>
      {word ? <span className="brand-word">Noctra</span> : null}
    </span>
  )
}
