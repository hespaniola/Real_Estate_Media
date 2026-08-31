import type { ExifSummary, ExposureMetrics, CompositionMetrics, SharpnessMetrics, FileKind } from '../shared/types'

export interface WorkerTask {
  id: number
  filePath: string
  kind: FileKind
  thumbPath: string
  previewPath: string
}

export interface WorkerSuccess {
  id: number
  ok: true
  thumbPath: string
  previewPath: string
  width: number
  height: number
  exif: ExifSummary
  sharpness: SharpnessMetrics
  exposure: ExposureMetrics
  composition: CompositionMetrics
  hash: string
}

export interface WorkerFailure {
  id: number
  ok: false
  error: string
}

export type WorkerResult = WorkerSuccess | WorkerFailure
