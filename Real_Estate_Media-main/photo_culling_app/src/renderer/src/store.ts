import { create } from 'zustand'
import type { DuplicateGroup, FaceMetrics, FlagState, ImageRecord, ScanProgress, ScoreBreakdown } from '@shared/types'

export type FilterMode = 'all' | 'unflagged' | 'accepted' | 'rejected' | 'favorite' | 'recommended' | 'failed'
export type SortMode = 'score' | 'name' | 'date' | 'group'

interface AppState {
  folderPath: string | null
  records: Record<string, ImageRecord>
  order: string[]
  groups: DuplicateGroup[]
  progress: ScanProgress | null
  scanning: boolean
  selectedId: string | null
  filter: FilterMode
  sortMode: SortMode
  loupeOpen: boolean
  facesQueued: boolean

  beginScan: (folderPath: string) => void
  ingestImage: (record: ImageRecord) => void
  setProgress: (progress: ScanProgress) => void
  finalizeScan: (payload: { groups: DuplicateGroup[]; records: ImageRecord[] }) => void
  setFlag: (id: string, flag: FlagState) => void
  select: (id: string | null) => void
  setFilter: (filter: FilterMode) => void
  setSortMode: (mode: SortMode) => void
  setLoupeOpen: (open: boolean) => void
  patchFaces: (id: string, faces: FaceMetrics, score: ScoreBreakdown | null) => void
  markFacesQueued: () => void
}

export const useStore = create<AppState>((set, get) => ({
  folderPath: null,
  records: {},
  order: [],
  groups: [],
  progress: null,
  scanning: false,
  selectedId: null,
  filter: 'all',
  sortMode: 'score',
  loupeOpen: false,
  facesQueued: false,

  beginScan: (folderPath) =>
    set({
      folderPath,
      records: {},
      order: [],
      groups: [],
      progress: { total: 0, completed: 0, cached: 0, currentFile: null },
      scanning: true,
      selectedId: null,
      facesQueued: false
    }),

  ingestImage: (record) =>
    set((state) => {
      const isNew = !(record.id in state.records)
      return {
        records: { ...state.records, [record.id]: record },
        order: isNew ? [...state.order, record.id] : state.order
      }
    }),

  setProgress: (progress) => set({ progress }),

  finalizeScan: (payload) =>
    set((state) => {
      const records = { ...state.records }
      for (const r of payload.records) records[r.id] = r
      const firstId = state.order[0] ?? null
      return { records, groups: payload.groups, scanning: false, selectedId: state.selectedId ?? firstId }
    }),

  setFlag: (id, flag) => {
    const { folderPath, records } = get()
    const record = records[id]
    if (!record || !folderPath) return
    set({ records: { ...records, [id]: { ...record, flag } } })
    void window.api.setFlag(folderPath, record.filePath, flag)
  },

  select: (id) => set({ selectedId: id }),
  setFilter: (filter) => set({ filter }),
  setSortMode: (mode) => set({ sortMode: mode }),
  setLoupeOpen: (open) => set({ loupeOpen: open }),
  markFacesQueued: () => set({ facesQueued: true }),

  patchFaces: (id, faces, score) =>
    set((state) => {
      const record = state.records[id]
      if (!record) return {}
      return { records: { ...state.records, [id]: { ...record, faces, score: score ?? record.score } } }
    })
}))

export function passesFilter(record: ImageRecord, filter: FilterMode): boolean {
  if (filter === 'failed') return record.status === 'error'
  if (filter === 'all') return true
  // Every other filter is a judgment about a successfully analyzed photo —
  // a failed one has no flag/score/group worth judging, so it only ever
  // shows under "All" or "Failed".
  if (record.status !== 'ready') return false

  switch (filter) {
    case 'unflagged':
      return record.flag === 'none'
    case 'accepted':
      return record.flag === 'accepted'
    case 'rejected':
      return record.flag === 'rejected'
    case 'favorite':
      return record.flag === 'favorite'
    case 'recommended':
      return record.isRecommended || !record.groupId
    default:
      return true
  }
}

export function sortRecords(records: ImageRecord[], mode: SortMode): ImageRecord[] {
  const copy = [...records]
  switch (mode) {
    case 'score':
      return copy.sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))
    case 'name':
      return copy.sort((a, b) => a.fileName.localeCompare(b.fileName))
    case 'date':
      return copy.sort((a, b) => (a.exif.dateTimeOriginal ?? '').localeCompare(b.exif.dateTimeOriginal ?? ''))
    case 'group':
      return copy.sort((a, b) => {
        const ga = a.groupId ?? ''
        const gb = b.groupId ?? ''
        if (ga !== gb) return ga.localeCompare(gb)
        return (b.score?.total ?? 0) - (a.score?.total ?? 0)
      })
    default:
      return copy
  }
}
