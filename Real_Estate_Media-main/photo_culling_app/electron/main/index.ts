import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { discoverImages, type DiscoveredFile } from './scanner'
import { ensureCacheDirs, JsonMapStore, loadFlags, saveFlags, type CachedFileEntry } from './cache'
import { ImageWorkerPool } from './workerPool'
import { clusterSimilarImages, type ClusterInput } from './duplicates'
import { computeCompositeScore } from '../shared/scoring'
import { ASSET_SCHEME, fromAssetUrl } from '../shared/assetProtocol'
import type { ImageRecord, FlagState, ScanProgress, FaceMetrics, ExifSummary } from '../shared/types'

const isDev = !!process.env.ELECTRON_RENDERER_URL

protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_SCHEME,
    privileges: { standard: true, secure: true, corsEnabled: true, supportFetchAPI: true, stream: true }
  }
])

interface GroupInfo {
  groupId: string | null
  isRecommended: boolean
}

interface ScanSession {
  folderPath: string
  analysisStore: JsonMapStore<CachedFileEntry>
  flags: Record<string, FlagState>
  groupInfo: Map<string, GroupInfo>
  pool: ImageWorkerPool | null
}

let currentSession: ScanSession | null = null
let mainWindow: BrowserWindow | null = null

function safeCacheName(filePath: string): string {
  return crypto.createHash('sha1').update(filePath).digest('hex')
}

function emptyFaceMetrics(): FaceMetrics {
  return { score: 0, faces: [], analyzed: false }
}

function scoreFor(entry: CachedFileEntry, groupInfo: GroupInfo | undefined) {
  const faces = entry.faces ?? emptyFaceMetrics()
  return computeCompositeScore({
    sharpness: entry.sharpness.score,
    exposure: entry.exposure.score,
    composition: entry.composition.score,
    faces: { score: faces.score, analyzed: faces.analyzed, count: faces.faces.length },
    isDuplicateNonPick: !!groupInfo && groupInfo.groupId !== null && !groupInfo.isRecommended
  })
}

function buildRecord(
  file: DiscoveredFile,
  entry: CachedFileEntry,
  flag: FlagState,
  groupInfo: GroupInfo | undefined
): ImageRecord {
  return {
    id: file.filePath,
    filePath: file.filePath,
    fileName: file.fileName,
    dirPath: file.dirPath,
    kind: file.kind,
    ext: file.ext,
    size: file.size,
    mtimeMs: file.mtimeMs,
    thumbPath: entry.thumbPath,
    previewPath: entry.previewPath,
    width: entry.width,
    height: entry.height,
    status: 'ready',
    exif: entry.exif,
    sharpness: entry.sharpness,
    exposure: entry.exposure,
    composition: entry.composition,
    faces: entry.faces ?? null,
    hash: entry.hash,
    groupId: groupInfo?.groupId ?? null,
    isRecommended: groupInfo?.isRecommended ?? false,
    score: scoreFor(entry, groupInfo),
    flag
  }
}

function buildErrorRecord(file: DiscoveredFile, error: string, flag: FlagState): ImageRecord {
  return {
    id: file.filePath,
    filePath: file.filePath,
    fileName: file.fileName,
    dirPath: file.dirPath,
    kind: file.kind,
    ext: file.ext,
    size: file.size,
    mtimeMs: file.mtimeMs,
    thumbPath: null,
    previewPath: null,
    width: 0,
    height: 0,
    status: 'error',
    error,
    exif: {} as ExifSummary,
    sharpness: null,
    exposure: null,
    composition: null,
    faces: null,
    hash: null,
    groupId: null,
    isRecommended: false,
    score: null,
    flag
  }
}

async function runScan(folderPath: string, win: BrowserWindow): Promise<void> {
  currentSession?.pool?.destroy()

  const paths = await ensureCacheDirs(folderPath)
  const analysisStore = new JsonMapStore<CachedFileEntry>(paths.analysisFile)
  await analysisStore.ready()
  const flags = await loadFlags(folderPath)
  const workerScriptPath = path.join(__dirname, 'imageWorker.js')
  const pool = new ImageWorkerPool(workerScriptPath)

  const session: ScanSession = { folderPath, analysisStore, flags, groupInfo: new Map(), pool }
  currentSession = session

  const files = await discoverImages(folderPath)
  const total = files.length
  let completed = 0
  let cached = 0

  const sendProgress = (currentFile: string | null): void => {
    const progress: ScanProgress = { total, completed, cached, currentFile }
    win.webContents.send('scan:progress', progress)
  }
  sendProgress(null)

  const records: ImageRecord[] = []

  await Promise.all(
    files.map(async (file) => {
      if (currentSession !== session) return // superseded by a newer scan

      const existing = await analysisStore.get(file.filePath)
      let entry: CachedFileEntry

      if (existing && existing.size === file.size && existing.mtimeMs === file.mtimeMs) {
        entry = existing
        cached++
      } else {
        const thumbName = `${safeCacheName(file.filePath)}.jpg`
        const thumbPath = path.join(paths.thumbsDir, thumbName)
        const previewPath = path.join(paths.previewsDir, thumbName)
        const result = await pool.run({ filePath: file.filePath, kind: file.kind, thumbPath, previewPath })

        if (currentSession !== session) return

        if (!result.ok) {
          completed++
          sendProgress(file.fileName)
          const record = buildErrorRecord(file, result.error, flags[file.filePath] ?? 'none')
          records.push(record)
          win.webContents.send('scan:image', record)
          return
        }

        entry = {
          size: file.size,
          mtimeMs: file.mtimeMs,
          thumbPath: result.thumbPath,
          previewPath: result.previewPath,
          width: result.width,
          height: result.height,
          exif: result.exif,
          sharpness: result.sharpness,
          exposure: result.exposure,
          composition: result.composition,
          hash: result.hash
        }
        analysisStore.set(file.filePath, entry)
      }

      completed++
      sendProgress(file.fileName)
      const record = buildRecord(file, entry, flags[file.filePath] ?? 'none', undefined)
      records.push(record)
      win.webContents.send('scan:image', record)
    })
  )

  if (currentSession !== session) return
  await analysisStore.flush()

  const readyRecords = records.filter((r) => r.status === 'ready')
  const clusterInputs: ClusterInput[] = readyRecords.map((r) => ({
    id: r.id,
    hash: r.hash,
    score: r.score!.total,
    width: r.width,
    height: r.height,
    sharpness: r.sharpness!.score
  }))
  const groups = clusterSimilarImages(clusterInputs)

  for (const group of groups) {
    for (const memberId of group.memberIds) {
      session.groupInfo.set(memberId, { groupId: group.id, isRecommended: memberId === group.recommendedId })
    }
  }

  const updatedRecords = readyRecords.map((r) => {
    const gi = session.groupInfo.get(r.id)
    const rebuilt: ImageRecord = {
      ...r,
      groupId: gi?.groupId ?? null,
      isRecommended: gi?.isRecommended ?? false,
      score: scoreFor(
        {
          size: r.size,
          mtimeMs: r.mtimeMs,
          thumbPath: r.thumbPath ?? '',
          previewPath: r.previewPath ?? '',
          width: r.width,
          height: r.height,
          exif: r.exif,
          sharpness: r.sharpness!,
          exposure: r.exposure!,
          composition: r.composition!,
          hash: r.hash ?? '',
          faces: r.faces ?? undefined
        },
        gi
      )
    }
    return rebuilt
  })

  win.webContents.send('scan:complete', { groups, records: updatedRecords })
}

function registerIpcHandlers(): void {
  ipcMain.handle('dialog:selectFolder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('scan:start', async (_evt, folderPath: string) => {
    if (!mainWindow) return
    await runScan(folderPath, mainWindow)
  })

  ipcMain.handle('flag:set', async (_evt, args: { folderPath: string; filePath: string; flag: FlagState }) => {
    const { folderPath, filePath, flag } = args
    if (currentSession && currentSession.folderPath === folderPath) {
      currentSession.flags[filePath] = flag
      await saveFlags(folderPath, currentSession.flags)
    } else {
      const flags = await loadFlags(folderPath)
      flags[filePath] = flag
      await saveFlags(folderPath, flags)
    }
  })

  ipcMain.handle(
    'faces:report',
    async (_evt, args: { folderPath: string; filePath: string; faces: FaceMetrics }): Promise<ImageRecord['score']> => {
      const { folderPath, filePath, faces } = args
      if (!currentSession || currentSession.folderPath !== folderPath) return null
      const entry = await currentSession.analysisStore.get(filePath)
      if (!entry) return null
      entry.faces = faces
      currentSession.analysisStore.set(filePath, entry)
      const groupInfo = currentSession.groupInfo.get(filePath)
      return scoreFor(entry, groupInfo)
    }
  )

  ipcMain.handle('shell:openInFolder', async (_evt, filePath: string) => {
    shell.showItemInFolder(filePath)
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#15161a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (isDev) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function registerAssetProtocol(): void {
  protocol.handle(ASSET_SCHEME, (request) => {
    const filePath = fromAssetUrl(request.url)
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

app.whenReady().then(() => {
  registerAssetProtocol()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  currentSession?.pool?.destroy()
  if (process.platform !== 'darwin') app.quit()
})
