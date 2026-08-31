import { useStore } from '../store'
import { detectFaces } from './faceDetector'

const CONCURRENCY = 2
let running = false

export async function processFaceQueue(): Promise<void> {
  if (running) return
  running = true
  try {
    const ids = [...useStore.getState().order]
    let cursor = 0

    async function worker(): Promise<void> {
      for (;;) {
        const idx = cursor++
        if (idx >= ids.length) return
        const id = ids[idx]
        const record = useStore.getState().records[id]
        if (!record || record.status !== 'ready' || !record.thumbPath || record.faces?.analyzed) continue

        try {
          const faces = await detectFaces(record.thumbPath)
          const folderPath = useStore.getState().folderPath
          const score = folderPath ? await window.api.reportFaces(folderPath, record.filePath, faces) : record.score
          useStore.getState().patchFaces(id, faces, score)
        } catch {
          // Non-fatal: leave this image without a face component rather than
          // stalling the rest of the queue.
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  } finally {
    running = false
  }
}
