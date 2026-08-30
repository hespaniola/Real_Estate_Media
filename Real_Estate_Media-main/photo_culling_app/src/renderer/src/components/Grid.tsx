import type { ImageRecord } from '@shared/types'
import ImageCard from './ImageCard'

interface GridProps {
  records: ImageRecord[]
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenLoupe: () => void
}

export default function Grid({ records, selectedId, onSelect, onOpenLoupe }: GridProps): JSX.Element {
  if (records.length === 0) {
    return (
      <div className="grid-empty">
        <p>No photos match this filter yet.</p>
      </div>
    )
  }

  return (
    <div className="grid">
      {records.map((record) => (
        <ImageCard
          key={record.id}
          record={record}
          selected={record.id === selectedId}
          onSelect={() => onSelect(record.id)}
          onOpen={() => {
            onSelect(record.id)
            onOpenLoupe()
          }}
        />
      ))}
    </div>
  )
}
