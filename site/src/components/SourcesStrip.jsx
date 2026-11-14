import { sourcePlatforms } from '../data/content'
import Icon from './Icon'

export default function SourcesStrip() {
  return (
    <div className="container">
      <div className="sources" data-tour="sources" data-reveal>
        <span className="sources-label">Работает с твоими сервисами</span>
        <div className="sources-row">
          {sourcePlatforms.map((platform) => (
            <span className="source-item" key={platform.id}>
              <span className="source-logo">
                <img src={platform.logo} alt={platform.name} loading="lazy" />
              </span>
              <span>{platform.name}</span>
            </span>
          ))}
          <span className="source-item source-item--local">
            <span className="source-logo source-logo--local">
              <Icon name="folder" size={18} />
            </span>
            <span>Локальные файлы</span>
          </span>
        </div>
      </div>
    </div>
  )
}
