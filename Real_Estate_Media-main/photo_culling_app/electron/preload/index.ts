import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { FaceMetrics, FlagState, ImageRecord, ScanProgress, DuplicateGroup } from '../shared/types'

const api = {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:selectFolder'),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  startScan: (folderPath: string): Promise<void> => ipcRenderer.invoke('scan:start', folderPath),
  setFlag: (folderPath: string, filePath: string, flag: FlagState): Promise<void> =>
    ipcRenderer.invoke('flag:set', { folderPath, filePath, flag }),
  reportFaces: (
    folderPath: string,
    filePath: string,
    faces: FaceMetrics
  ): Promise<ImageRecord['score']> => ipcRenderer.invoke('faces:report', { folderPath, filePath, faces }),
  openInFolder: (filePath: string): Promise<void> => ipcRenderer.invoke('shell:openInFolder', filePath),

  onScanProgress: (callback: (progress: ScanProgress) => void): (() => void) => {
    const listener = (_evt: Electron.IpcRendererEvent, progress: ScanProgress): void => callback(progress)
    ipcRenderer.on('scan:progress', listener)
    return () => ipcRenderer.removeListener('scan:progress', listener)
  },
  onScanImage: (callback: (record: ImageRecord) => void): (() => void) => {
    const listener = (_evt: Electron.IpcRendererEvent, record: ImageRecord): void => callback(record)
    ipcRenderer.on('scan:image', listener)
    return () => ipcRenderer.removeListener('scan:image', listener)
  },
  onScanComplete: (
    callback: (payload: { groups: DuplicateGroup[]; records: ImageRecord[] }) => void
  ): (() => void) => {
    const listener = (
      _evt: Electron.IpcRendererEvent,
      payload: { groups: DuplicateGroup[]; records: ImageRecord[] }
    ): void => callback(payload)
    ipcRenderer.on('scan:complete', listener)
    return () => ipcRenderer.removeListener('scan:complete', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type PhotoCullingApi = typeof api
