import { useEffect } from 'react'
import { toAssetUrl } from '@shared/assetProtocol'
import type { FlagState, ImageRecord } from '@shared/types'
import { useStore } from '../store'
import MetricsPanel from './MetricsPanel'

interface LoupeProps {
  record: ImageRecord
  onClose: () => void
  onNavigate: (delta: number) => void
}

export default function Loupe({ record, onClose, onNavigate }: LoupeProps): JSX.Element {
  const setFlag = useStore((s) => s.setFlag)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'ArrowRight') onNavigate(1)
      if (e.key === 'ArrowLeft') onNavigate(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onNavigate])

  function setFlagTo(flag: FlagState): void {
    setFlag(record.id, record.flag === flag ? 'none' : flag)
  }

  return (
    <div className="loupe">
      <button className="loupe__close" onClick={onClose}>
        ✕
      </button>
      <button className="loupe__nav loupe__nav--prev" onClick={() => onNavigate(-1)}>
        ‹
      </button>
      <button className="loupe__nav loupe__nav--next" onClick={() => onNavigate(1)}>
        ›
      </button>

      <div className="loupe__stage">
        {record.previewPath && (
          <div className="loupe__image-wrap">
            <img src={toAssetUrl(record.previewPath)} alt={record.fileName} />
            {record.faces?.faces.map((f, i) => (
              <div
                key={i}
                className="loupe__face-box"
                style={{
                  left: `${f.x * 100}%`,
                  top: `${f.y * 100}%`,
                  width: `${f.width * 100}%`,
                  height: `${f.height * 100}%`
                }}
              />
            ))}
          </div>
        )}
        <div className="loupe__filename">{record.fileName}</div>
      </div>

      <div className="loupe__side">
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
      </div>
    </div>
  )
}
