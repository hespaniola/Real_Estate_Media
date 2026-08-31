import type { ImageRecord } from '@shared/types'
import { scoreTier } from '../lib/scoreColor'

interface MetricsPanelProps {
  record: ImageRecord
}

function ScoreBar({ label, value }: { label: string; value: number | null }): JSX.Element {
  const display = value === null ? '—' : Math.round(value)
  const pct = value === null ? 0 : value
  return (
    <div className="metric-bar">
      <div className="metric-bar__label">
        <span>{label}</span>
        <span className="metric-bar__value">{display}</span>
      </div>
      <div className="metric-bar__track">
        <div
          className={`metric-bar__fill ${value === null ? 'metric-bar__fill--na' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function formatShutter(s?: string): string {
  return s ?? '—'
}

export default function MetricsPanel({ record }: MetricsPanelProps): JSX.Element {
  const score = record.score

  if (record.status === 'error') {
    return (
      <div className="metrics-panel">
        <div className="metrics-panel__error">
          <div className="metrics-panel__error-title">⚠ Analysis failed</div>
          <div className="metrics-panel__error-message">{record.error ?? 'Unknown error'}</div>
        </div>
        <div className="metrics-panel__section-title">Details</div>
        <dl className="metrics-panel__exif">
          <dt>File</dt>
          <dd>{(record.size / (1024 * 1024)).toFixed(1)} MB</dd>
          <dt>Path</dt>
          <dd className="metrics-panel__exif-path">{record.filePath}</dd>
        </dl>
      </div>
    )
  }

  return (
    <div className="metrics-panel">
      <div className="metrics-panel__score">
        <div className={`metrics-panel__score-value metrics-panel__score-value--${scoreTier(score?.total ?? 0)}`}>
          {score?.total ?? '—'}
        </div>
        <div className="metrics-panel__score-caption">overall score</div>
      </div>

      <div className="metrics-panel__bars">
        <ScoreBar label="Sharpness" value={score?.sharpness ?? null} />
        <ScoreBar label="Exposure" value={score?.exposure ?? null} />
        <ScoreBar label="Composition" value={score?.composition ?? null} />
        <ScoreBar label="Faces" value={score?.faces ?? null} />
      </div>

      {record.groupId && (
        <div className={`metrics-panel__group ${record.isRecommended ? 'metrics-panel__group--pick' : ''}`}>
          {record.isRecommended
            ? '★ Recommended pick for this group'
            : `Similar to another photo — best pick is scored higher`}
        </div>
      )}

      <div className="metrics-panel__section-title">Details</div>
      <dl className="metrics-panel__exif">
        <dt>Camera</dt>
        <dd>{record.exif.camera ?? '—'}</dd>
        <dt>Lens</dt>
        <dd>{record.exif.lens ?? '—'}</dd>
        <dt>Exposure</dt>
        <dd>
          {formatShutter(record.exif.shutterSpeed)} · f/{record.exif.aperture ?? '—'} · ISO {record.exif.iso ?? '—'}
        </dd>
        <dt>Focal Length</dt>
        <dd>{record.exif.focalLength ? `${record.exif.focalLength}mm` : '—'}</dd>
        <dt>Dimensions</dt>
        <dd>
          {record.width} × {record.height}
        </dd>
        <dt>Captured</dt>
        <dd>{record.exif.dateTimeOriginal ? new Date(record.exif.dateTimeOriginal).toLocaleString() : '—'}</dd>
        <dt>File</dt>
        <dd>{(record.size / (1024 * 1024)).toFixed(1)} MB</dd>
      </dl>
    </div>
  )
}
