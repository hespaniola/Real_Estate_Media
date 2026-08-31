export type FileKind = 'raw' | 'jpeg' | 'heif' | 'other'

export type FlagState = 'none' | 'accepted' | 'rejected' | 'favorite'

export interface ExifSummary {
  camera?: string
  lens?: string
  iso?: number
  aperture?: number
  shutterSpeed?: string
  focalLength?: number
  dateTimeOriginal?: string
  width?: number
  height?: number
  orientation?: number
}

export interface SharpnessMetrics {
  /** 0-100, Laplacian-variance based, normalized against the batch */
  score: number
  /** raw Laplacian variance, kept for debugging/re-normalization */
  rawVariance: number
}

export interface ExposureMetrics {
  score: number
  meanBrightness: number
  shadowClipPct: number
  highlightClipPct: number
  contrast: number
}

export interface CompositionMetrics {
  score: number
  ruleOfThirdsStrength: number
  centeredness: number
  horizonTilt: number | null
}

/** x/y/width/height are normalized 0-1 fractions of the analyzed frame. */
export interface FaceBox {
  x: number
  y: number
  width: number
  height: number
  confidence: number
  sharpness: number
}

export interface FaceMetrics {
  score: number
  faces: FaceBox[]
  analyzed: boolean
}

export interface ScoreBreakdown {
  total: number
  sharpness: number
  exposure: number
  composition: number
  /** null when the face dimension does not apply (no faces detected / not analyzed) */
  faces: number | null
  duplicatePenalty: number
}

export interface ImageRecord {
  id: string
  filePath: string
  fileName: string
  dirPath: string
  kind: FileKind
  ext: string
  size: number
  mtimeMs: number
  thumbPath: string | null
  previewPath: string | null
  width: number
  height: number
  status: 'pending' | 'processing' | 'ready' | 'error'
  error?: string
  exif: ExifSummary
  sharpness: SharpnessMetrics | null
  exposure: ExposureMetrics | null
  composition: CompositionMetrics | null
  faces: FaceMetrics | null
  hash: string | null
  groupId: string | null
  isRecommended: boolean
  score: ScoreBreakdown | null
  flag: FlagState
}

export interface DuplicateGroup {
  id: string
  memberIds: string[]
  recommendedId: string | null
}

export interface ScanProgress {
  total: number
  completed: number
  cached: number
  currentFile: string | null
}

export const RAW_EXTENSIONS = new Set([
  '.cr2', '.cr3', '.crw', '.nef', '.nrw', '.arw', '.srf', '.sr2',
  '.raf', '.rw2', '.orf', '.pef', '.ptx', '.dng', '.raw', '.rwl',
  '.iiq', '.3fr', '.fff', '.mrw', '.x3f', '.srw'
])

export const JPEG_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp'])

// HEIC/HEIF (the default iPhone camera format) is a distinct container
// libvips' prebuilt binaries can't decode directly — sharp bundles libheif's
// AVIF decode path but not the HEVC one HEIC actually uses — so it gets
// converted to JPEG first rather than handed to sharp() like a plain JPEG.
export const HEIF_EXTENSIONS = new Set(['.heic', '.heif'])

export function classifyExtension(ext: string): FileKind {
  const lower = ext.toLowerCase()
  if (RAW_EXTENSIONS.has(lower)) return 'raw'
  if (HEIF_EXTENSIONS.has(lower)) return 'heif'
  if (JPEG_EXTENSIONS.has(lower)) return 'jpeg'
  return 'other'
}
