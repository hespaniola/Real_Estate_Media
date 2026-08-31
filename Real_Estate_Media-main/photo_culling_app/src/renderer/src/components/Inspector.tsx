import { toAssetUrl } from '@shared/assetProtocol'
import type { ImageRecord, FlagState } from '@shared/types'
import { useStore } from '../store'
import MetricsPanel from './MetricsPanel'

interface InspectorProps {
  record: ImageRecord | null
  onOpenLoupe: () => void
}

export default function Inspector({ record, onOpenLoupe }: InspectorProps): JSX.Element {
  const setFlag = useStore((s) => s.setFlag)

  if (!record) {
    return (
      <aside className="inspector inspector--empty">
        <p>Select a photo to see its analysis.</p>
      </aside>
    )
  }

  function setFlagTo(flag: FlagState): void {
    if (!record) return
    setFlag(record.id, record.flag === flag ? 'none' : flag)
  }

  return (
    <aside className="inspector">
      <div className="inspector__preview" onDoubleClick={onOpenLoupe}>
        {record.previewPath ? (
          <img src={toAssetUrl(record.previewPath)} alt={record.fileName} />
        ) : (
          <div className="inspector__preview-empty">No preview available</div>
        )}
      </div>

      <div className="inspector__flagbar">
        <button
          className={`btn btn--flag ${record.flag === 'accepted' ? 'btn--accept-active' : ''}`}
          onClick={() => setFlagTo('accepted')}
        >
          ✓ Accept
        </button>
        <button
          className={`btn btn--flag ${record.flag === 'favorite' ? 'btn--favorite-active' : ''}`}
          onClick={() => setFlagTo('favorite')}
        >
          ★ Favorite
        </button>
        <button
          className={`btn btn--flag ${record.flag === 'rejected' ? 'btn--reject-active' : ''}`}
          onClick={() => setFlagTo('rejected')}
        >
          ✕ Reject
        </button>
      </div>

      <MetricsPanel record={record} />
    </aside>
  )
}
