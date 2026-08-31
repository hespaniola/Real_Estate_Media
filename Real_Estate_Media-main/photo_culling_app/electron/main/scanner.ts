import path from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import { classifyExtension } from '../shared/types'
import { CACHE_DIR_NAME } from './cache'

export interface DiscoveredFile {
  filePath: string
  fileName: string
  dirPath: string
  ext: string
  kind: 'raw' | 'jpeg'
  size: number
  mtimeMs: number
}

const IGNORED_DIRS = new Set([CACHE_DIR_NAME, '.git', '.DS_Store', '$RECYCLE.BIN', 'System Volume Information'])

export async function discoverImages(rootPath: string): Promise<DiscoveredFile[]> {
  const results: DiscoveredFile[] = []

  async function walk(dirPath: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dirPath, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name)
      const kind = classifyExtension(ext)
      if (kind === 'other') continue
      try {
        const stats = await stat(fullPath)
        results.push({
          filePath: fullPath,
          fileName: entry.name,
          dirPath,
          ext,
          kind,
          size: stats.size,
          mtimeMs: stats.mtimeMs
        })
      } catch {
        // Unreadable/vanished file — skip it rather than aborting the scan.
      }
    }
  }

  await walk(rootPath)
  return results
}
