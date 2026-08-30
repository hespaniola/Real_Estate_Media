import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useStore, passesFilter, sortRecords } from './store'
import { processFaceQueue } from './lib/faceQueue'
import DropZone from './components/DropZone'
import TopBar from './components/TopBar'
import Grid from './components/Grid'
import Inspector from './components/Inspector'
import Loupe from './components/Loupe'
import type { FlagState } from '@shared/types'

export default function App(): JSX.Element {
  const folderPath = useStore((s) => s.folderPath)
  const records = useStore((s) => s.records)
  const order = useStore((s) => s.order)
  const filter = useStore((s) => s.filter)
  const sortMode = useStore((s) => s.sortMode)
  const selectedId = useStore((s) => s.selectedId)
  const loupeOpen = useStore((s) => s.loupeOpen)
  const select = useStore((s) => s.select)
  const setFlag = useStore((s) => s.setFlag)
  const setLoupeOpen = useStore((s) => s.setLoupeOpen)
  const beginScan = useStore((s) => s.beginScan)
  const ingestImage = useStore((s) => s.ingestImage)
  const setProgress = useStore((s) => s.setProgress)
  const finalizeScan = useStore((s) => s.finalizeScan)

  const cleanupRef = useRef<(() => void)[]>([])

  useEffect(() => {
    const offProgress = window.api.onScanProgress((progress) => setProgress(progress))
    const offImage = window.api.onScanImage((record) => ingestImage(record))
    const offComplete = window.api.onScanComplete((payload) => {
      finalizeScan(payload)
      void processFaceQueue()
    })
    cleanupRef.current = [offProgress, offImage, offComplete]
    return () => cleanupRef.current.forEach((fn) => fn())
  }, [setProgress, ingestImage, finalizeScan])

  const openFolder = useCallback(
    async (path: string) => {
      beginScan(path)
      await window.api.startScan(path)
    },
    [beginScan]
  )

  const handleChooseFolder = useCallback(async () => {
    const path = await window.api.selectFolder()
    if (path) await openFolder(path)
  }, [openFolder])

  const handleDropFolder = useCallback(
    async (path: string) => {
      await openFolder(path)
    },
    [openFolder]
  )

  const visibleRecords = useMemo(() => {
    const list = order.map((id) => records[id]).filter((r) => r && r.status === 'ready')
    const filtered = list.filter((r) => passesFilter(r, filter))
    return sortRecords(filtered, sortMode)
  }, [order, records, filter, sortMode])

  const visibleIds = useMemo(() => visibleRecords.map((r) => r.id), [visibleRecords])

  const moveSelection = useCallback(
    (delta: number) => {
      if (visibleIds.length === 0) return
      const currentIndex = selectedId ? visibleIds.indexOf(selectedId) : -1
      const nextIndex = currentIndex === -1 ? 0 : Math.min(visibleIds.length - 1, Math.max(0, currentIndex + delta))
      select(visibleIds[nextIndex])
    },
    [visibleIds, selectedId, select]
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!folderPath) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      switch (e.key) {
        case 'ArrowRight':
        case 'j':
          e.preventDefault()
          moveSelection(1)
          break
        case 'ArrowLeft':
        case 'k':
          e.preventDefault()
          moveSelection(-1)
          break
        case ' ':
        case 'Enter':
          e.preventDefault()
          if (selectedId) setLoupeOpen(true)
          break
        case 'Escape':
          setLoupeOpen(false)
          break
        case 'a':
        case 'A':
          if (selectedId) setFlag(selectedId, 'accepted' as FlagState)
          break
        case 'x':
        case 'X':
          if (selectedId) setFlag(selectedId, 'rejected' as FlagState)
          break
        case 'f':
        case 'F':
          if (selectedId) setFlag(selectedId, 'favorite' as FlagState)
          break
        case 'u':
        case 'U':
          if (selectedId) setFlag(selectedId, 'none' as FlagState)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [folderPath, selectedId, moveSelection, setFlag, setLoupeOpen])

  if (!folderPath) {
    return <DropZone onChooseFolder={handleChooseFolder} onDropFolder={handleDropFolder} />
  }

  const selectedRecord = selectedId ? records[selectedId] : null

  return (
    <div className="app-shell">
      <TopBar visibleCount={visibleRecords.length} totalCount={order.length} onChooseFolder={handleChooseFolder} />
      <div className="app-body">
        <Grid records={visibleRecords} selectedId={selectedId} onSelect={select} onOpenLoupe={() => setLoupeOpen(true)} />
        <Inspector record={selectedRecord ?? null} onOpenLoupe={() => setLoupeOpen(true)} />
      </div>
      {loupeOpen && selectedRecord && (
        <Loupe record={selectedRecord} onClose={() => setLoupeOpen(false)} onNavigate={moveSelection} />
      )}
    </div>
  )
}
