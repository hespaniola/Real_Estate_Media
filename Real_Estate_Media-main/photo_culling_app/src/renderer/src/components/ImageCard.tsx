import { toAssetUrl } from '@shared/assetProtocol'
import type { FlagState, ImageRecord } from '@shared/types'
import { useStore } from '../store'
import { scoreTier } from '../lib/scoreColor'

interface ImageCardProps {
  record: ImageRecord
  selected: boolean
  onSelect: () => void
  onOpen: () => void
}

export default function ImageCard({ record, selected, onSelect, onOpen }: ImageCardProps): JSX.Element {
  const setFlag = useStore((s) => s.setFlag)
  const score = record.score?.total ?? 0
  const failed = record.status === 'error'

  function flagClick(e: React.MouseEvent, flag: FlagState): void {
    e.stopPropagation()
    setFlag(record.id, record.flag === flag ? 'none' : flag)
  }

  return (
    <div
      className={`card ${selected ? 'card--selected' : ''} ${record.flag === 'rejected' ? 'card--rejected' : ''} ${failed ? 'card--failed' : ''}`}
      onClick={onSelect}
      onDoubleClick={onOpen}
      title={failed ? record.error : undefined}
    >
      <div className="card__thumb-wrap">
        {failed ? (
          <div className="card__thumb card__thumb--failed">
            <span className="card__failed-icon">⚠</span>
            <span className="card__failed-label">Failed to analyze</span>
          </div>
        ) : record.thumbPath ? (
          <img className="card__thumb" src={toAssetUrl(record.thumbPath)} loading="lazy" alt={record.fileName} />
        ) : (
          <div className="card__thumb card__thumb--missing">No preview</div>
        )}

        {!failed && <div className={`card__score card__score--${scoreTier(score)}`}>{score}</div>}

        {record.groupId && (
          <div className={`card__group-badge ${record.isRecommended ? 'card__group-badge--pick' : ''}`}>
            {record.isRecommended ? '★ Pick' : 'Similar'}
          </div>
        )}

        {(record.kind === 'raw' || record.kind === 'heif') && (
          <div className="card__raw-badge">{record.kind === 'raw' ? 'RAW' : 'HEIC'}</div>
        )}

        <div className="card__flags">
          <button
            className={`flag-btn flag-btn--accept ${record.flag === 'accepted' ? 'flag-btn--active' : ''}`}
            onClick={(e) => flagClick(e, 'accepted')}
            title="Accept (A)"
          >
            ✓
          </button>
          <button
            className={`flag-btn flag-btn--favorite ${record.flag === 'favorite' ? 'flag-btn--active' : ''}`}
            onClick={(e) => flagClick(e, 'favorite')}
            title="Favorite (F)"
          >
            ★
          </button>
          <button
            className={`flag-btn flag-btn--reject ${record.flag === 'rejected' ? 'flag-btn--active' : ''}`}
            onClick={(e) => flagClick(e, 'rejected')}
            title="Reject (X)"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="card__name">{record.fileName}</div>
    </div>
  )
}
