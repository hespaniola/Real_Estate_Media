import path from 'node:path'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import type { ExifSummary, ExposureMetrics, CompositionMetrics, SharpnessMetrics, FaceMetrics, FlagState } from '../shared/types'

export const CACHE_DIR_NAME = '.photo-culling-cache'

export interface CachedFileEntry {
  size: number
  mtimeMs: number
  thumbPath: string
  previewPath: string
  width: number
  height: number
  exif: ExifSummary
  sharpness: SharpnessMetrics
  exposure: ExposureMetrics
  composition: CompositionMetrics
  hash: string
  faces?: FaceMetrics
}

export interface FolderCachePaths {
  cacheDir: string
  thumbsDir: string
  previewsDir: string
  analysisFile: string
  flagsFile: string
}

export function getCachePaths(folderPath: string): FolderCachePaths {
  const cacheDir = path.join(folderPath, CACHE_DIR_NAME)
  return {
    cacheDir,
    thumbsDir: path.join(cacheDir, 'thumbs'),
    previewsDir: path.join(cacheDir, 'previews'),
    analysisFile: path.join(cacheDir, 'analysis.json'),
    flagsFile: path.join(cacheDir, 'flags.json')
  }
}

export async function ensureCacheDirs(folderPath: string): Promise<FolderCachePaths> {
  const paths = getCachePaths(folderPath)
  await mkdir(paths.thumbsDir, { recursive: true })
  await mkdir(paths.previewsDir, { recursive: true })
  return paths
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * A JSON-file-backed key/value map that debounces writes so bursts of
 * per-file updates during a scan don't hammer the disk with a full
 * rewrite each time.
 */
export class JsonMapStore<T> {
  private data: Record<string, T> = {}
  private dirty = false
  private flushTimer: NodeJS.Timeout | null = null
  private loaded: Promise<void>
  private filePath: string
  private debounceMs: number

  constructor(filePath: string, debounceMs = 400) {
    this.filePath = filePath
    this.debounceMs = debounceMs
    this.loaded = readJson<Record<string, T>>(filePath, {}).then((data) => {
      this.data = data
    })
  }

  async ready(): Promise<void> {
    await this.loaded
  }

  async all(): Promise<Record<string, T>> {
    await this.loaded
    return this.data
  }

  async get(key: string): Promise<T | undefined> {
    await this.loaded
    return this.data[key]
  }

  set(key: string, value: T): void {
    this.data[key] = value
    this.scheduleFlush()
  }

  delete(key: string): void {
    delete this.data[key]
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    this.dirty = true
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, this.debounceMs)
  }

  async flush(): Promise<void> {
    if (!this.dirty) return
    this.dirty = false
    const tmpPath = `${this.filePath}.tmp`
    await writeFile(tmpPath, JSON.stringify(this.data))
    await rename(tmpPath, this.filePath)
  }
}

export async function loadFlags(folderPath: string): Promise<Record<string, FlagState>> {
  const { flagsFile } = getCachePaths(folderPath)
  return readJson<Record<string, FlagState>>(flagsFile, {})
}

export async function saveFlags(folderPath: string, flags: Record<string, FlagState>): Promise<void> {
  const paths = await ensureCacheDirs(folderPath)
  const tmpPath = `${paths.flagsFile}.tmp`
  await writeFile(tmpPath, JSON.stringify(flags))
  await rename(tmpPath, paths.flagsFile)
}
