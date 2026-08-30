import { useMemo, useState } from 'react'
import { useStore, type FilterMode, type SortMode } from '../store'
import ShortcutsHelp from './ShortcutsHelp'

interface TopBarProps {
  visibleCount: number
  totalCount: number
  onChooseFolder: () => void
}

const FILTERS: Array<{ key: FilterMode; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'recommended', label: 'Picks' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'favorite', label: 'Favorites' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'unflagged', label: 'Unflagged' }
]

function basename(p: string): string {
  return p.split(/[/\\]/).filter(Boolean).pop() ?? p
}

export default function TopBar({ visibleCount, totalCount, onChooseFolder }: TopBarProps): JSX.Element {
  const folderPath = useStore((s) => s.folderPath)
  const progress = useStore((s) => s.progress)
  const scanning = useStore((s) => s.scanning)
  const filter = useStore((s) => s.filter)
  const setFilter = useStore((s) => s.setFilter)
  const sortMode = useStore((s) => s.sortMode)
  const setSortMode = useStore((s) => s.setSortMode)
  const groups = useStore((s) => s.groups)
  const records = useStore((s) => s.records)
  const [helpOpen, setHelpOpen] = useState(false)

  const stats = useMemo(() => {
    const list = Object.values(records)
    const accepted = list.filter((r) => r.flag === 'accepted').length
    const favorite = list.filter((r) => r.flag === 'favorite').length
    const rejected = list.filter((r) => r.flag === 'rejected').length
    return { accepted, favorite, rejected, groups: groups.length }
  }, [records, groups])

  const pct = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0

  return (
    <header className="topbar">
      <div className="topbar__row">
        <div className="topbar__identity">
          <span className="topbar__mark">PCS</span>
          <div className="topbar__folder">
            <span className="topbar__folder-name">{folderPath ? basename(folderPath) : 'No folder'}</span>
            <span className="topbar__folder-count">
              {visibleCount}/{totalCount} shown · {stats.groups} groups
            </span>
          </div>
        </div>

        <div className="topbar__filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip ${filter === f.key ? 'chip--active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="topbar__actions">
          <span className="stat stat--accept">{stats.accepted} accepted</span>
          <span className="stat stat--favorite">{stats.favorite} favorite</span>
          <span className="stat stat--reject">{stats.rejected} rejected</span>
          <select className="select" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
            <option value="score">Sort: Score</option>
            <option value="name">Sort: Name</option>
            <option value="date">Sort: Date</option>
            <option value="group">Sort: Group</option>
          </select>
          <button className="btn btn--ghost" onClick={() => setHelpOpen(true)}>
            ?
          </button>
          <button className="btn" onClick={onChooseFolder}>
            Open Folder
          </button>
        </div>
      </div>

      {scanning && (
        <div className="progressbar">
          <div className="progressbar__fill" style={{ width: `${pct}%` }} />
          <span className="progressbar__label">
            Analyzing {progress?.completed ?? 0}/{progress?.total ?? 0}
            {progress?.cached ? ` · ${progress.cached} cached` : ''}
            {progress?.currentFile ? ` · ${progress.currentFile}` : ''}
          </span>
        </div>
      )}

      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </header>
  )
}
