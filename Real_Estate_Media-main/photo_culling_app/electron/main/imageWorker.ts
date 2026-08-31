import { parentPort } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import exifr from 'exifr'
import convertHeic from 'heic-convert'
import type { ExifSummary } from '../shared/types'
import { computeExposure, computeComposition, computeDHash, computeSharpness } from './imageAnalysis'
import { extractEmbeddedJpegCandidates } from './rawPreview'
import type { WorkerTask, WorkerResult } from './workerContract'

const ANALYSIS_SIZE = 1024
const THUMB_SIZE = 640
const PREVIEW_SIZE = 1920

const LAPLACIAN_KERNEL = { width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 }
const SOBEL_X_KERNEL = { width: 3, height: 3, kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1], offset: 128 }
const SOBEL_Y_KERNEL = { width: 3, height: 3, kernel: [-1, -2, -1, 0, 0, 0, 1, 2, 1], offset: 128 }

function toShutterSpeedString(exposureTime: number | undefined): string | undefined {
  if (!exposureTime || exposureTime <= 0) return undefined
  if (exposureTime >= 1) return `${exposureTime.toFixed(1)}s`
  const denominator = Math.round(1 / exposureTime)
  return `1/${denominator}`
}

/**
 * Reading a HEIC file by *path* trips a bug in exifr's chunked box reader
 * for at least some real HEIC files: it throws "bad seek" from a background
 * read that isn't tied to the awaited parse() promise, so it isn't caught
 * here and kills the whole worker thread instead. Passing an in-memory
 * Buffer instead avoids exifr's file I/O/seeking path entirely.
 */
async function readExifSummary(input: string | Buffer): Promise<ExifSummary> {
  try {
    const data = await exifr.parse(input, {
      tiff: true,
      exif: true,
      gps: false,
      interop: false,
      xmp: false,
      icc: false,
      iptc: false,
      mergeOutput: true,
      reviveValues: true,
      translateValues: true
    })
    if (!data) return {}
    const make = data.Make ?? data.make
    const model = data.Model ?? data.model
    const camera = [make, model].filter(Boolean).join(' ').trim() || undefined
    return {
      camera,
      lens: data.LensModel ?? data.LensMake ?? undefined,
      iso: data.ISO ?? data.ISOSpeedRatings ?? undefined,
      aperture: data.FNumber ?? data.ApertureValue ?? undefined,
      shutterSpeed: toShutterSpeedString(data.ExposureTime),
      focalLength: data.FocalLength ?? undefined,
      dateTimeOriginal: data.DateTimeOriginal
        ? new Date(data.DateTimeOriginal).toISOString()
        : undefined,
      width: data.ExifImageWidth ?? data.ImageWidth ?? undefined,
      height: data.ExifImageHeight ?? data.ImageHeight ?? undefined,
      orientation: typeof data.Orientation === 'number' ? data.Orientation : undefined
    }
  } catch {
    return {}
  }
}

const MAX_EMBEDDED_CANDIDATES = 5

/**
 * A byte span that merely *looks* like a JPEG (SOI...EOI landing inside
 * maker-note data, or — in a large RAW file — inside raw sensor data that
 * coincidentally contains those marker bytes) doesn't always decode. Try
 * candidates largest-first and keep the first one that actually decodes,
 * rather than trusting the biggest span outright.
 */
interface PreviewSource {
  image: sharp.Sharp
  /**
   * The original file's bytes, when already read into memory as part of
   * getting the preview (RAW/HEIF). Reused for EXIF parsing so exifr reads
   * the in-memory buffer instead of re-opening the file itself — see the
   * comment on readExifSummary's HEIF path for why that matters.
   */
  sourceBuffer: Buffer | null
}

async function getPreviewSource(filePath: string, kind: WorkerTask['kind']): Promise<PreviewSource> {
  if (kind === 'raw') {
    const buffer = await readFile(filePath)
    const candidates = extractEmbeddedJpegCandidates(buffer).slice(0, MAX_EMBEDDED_CANDIDATES)
    for (const candidate of candidates) {
      const image = sharp(candidate)
      const valid = await image
        .metadata()
        .then((m) => !!m.width && !!m.height)
        .catch(() => false)
      if (valid) return { image, sourceBuffer: buffer }
    }
    const thumb = await exifr.thumbnail(filePath).catch(() => null)
    if (thumb) return { image: sharp(Buffer.from(thumb)), sourceBuffer: buffer }
    throw new Error('No decodable embedded preview found in RAW file')
  }
  if (kind === 'heif') {
    // sharp's prebuilt libvips bundles libheif's AVIF (AV1) decode path but
    // not the HEVC one HEIC actually uses (HEVC's patent licensing keeps it
    // out of the prebuilt binaries), so sharp(filePath) fails on every
    // iPhone-style .heic/.heif photo. Decode via a WASM libheif build first.
    const buffer = await readFile(filePath)
    const jpeg = await convertHeic({ buffer, format: 'JPEG', quality: 0.92 })
    return { image: sharp(Buffer.from(jpeg)), sourceBuffer: buffer }
  }
  return { image: sharp(filePath), sourceBuffer: null }
}

async function processFile(task: WorkerTask): Promise<WorkerResult> {
  try {
    const { image: source, sourceBuffer } = await getPreviewSource(task.filePath, task.kind)
    const base = source.rotate()
    // sharp's metadata() reports the *pre-pipeline* input, but the
    // orientation tag it reads is accurate — use it to report the true
    // post-rotation (displayed) dimensions without a second full decode.
    const meta = await base.clone().metadata()
    const swapped = !!meta.orientation && meta.orientation >= 5 && meta.orientation <= 8
    const width = swapped ? meta.height ?? 0 : meta.width ?? 0
    const height = swapped ? meta.width ?? 0 : meta.height ?? 0

    const analysis = base.clone().resize({
      width: ANALYSIS_SIZE,
      height: ANALYSIS_SIZE,
      fit: 'inside',
      withoutEnlargement: true
    })

    // Note: sharp's .stats()/.metadata() report input-level info even when
    // chained after resize/convolve — only materializing via .raw().toBuffer()
    // (or .toFile()) reliably reflects the pipeline's actual output, so every
    // metric below is derived from a materialized raw buffer rather than
    // sharp's built-in stats().
    const [{ data: lumData, info: lumInfo }, dHashRaw] = await Promise.all([
      analysis.clone().greyscale().raw().toBuffer({ resolveWithObject: true }),
      analysis
        .clone()
        .resize(9, 8, { fit: 'fill' })
        .greyscale()
        .raw()
        .toBuffer()
    ])

    const [laplacianBuf, gxBuf, gyBuf] = await Promise.all([
      sharp(lumData, { raw: { width: lumInfo.width, height: lumInfo.height, channels: 1 } })
        .convolve(LAPLACIAN_KERNEL)
        .raw()
        .toBuffer(),
      sharp(lumData, { raw: { width: lumInfo.width, height: lumInfo.height, channels: 1 } })
        .convolve(SOBEL_X_KERNEL)
        .raw()
        .toBuffer(),
      sharp(lumData, { raw: { width: lumInfo.width, height: lumInfo.height, channels: 1 } })
        .convolve(SOBEL_Y_KERNEL)
        .raw()
        .toBuffer()
    ])

    const exposure = computeExposure({ data: lumData, width: lumInfo.width, height: lumInfo.height })
    const composition = computeComposition(
      { data: gxBuf, width: lumInfo.width, height: lumInfo.height },
      { data: gyBuf, width: lumInfo.width, height: lumInfo.height }
    )
    const hash = computeDHash({ data: dHashRaw, width: 9, height: 8 })
    const sharpness = computeSharpness({ data: laplacianBuf, width: lumInfo.width, height: lumInfo.height })

    await Promise.all([
      base
        .clone()
        .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toFile(task.thumbPath),
      base
        .clone()
        .resize({ width: PREVIEW_SIZE, height: PREVIEW_SIZE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toFile(task.previewPath)
    ])

    // For HEIF, parse EXIF from the buffer already in memory rather than
    // handing exifr the file path — see readExifSummary's comment.
    const exif = await readExifSummary(task.kind === 'heif' && sourceBuffer ? sourceBuffer : task.filePath)

    return {
      id: task.id,
      ok: true,
      thumbPath: task.thumbPath,
      previewPath: task.previewPath,
      width: width || exif.width || 0,
      height: height || exif.height || 0,
      exif,
      sharpness,
      exposure,
      composition,
      hash
    }
  } catch (err) {
    return { id: task.id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

let currentTaskId: number | null = null

// This worker is long-lived and handles many tasks over its lifetime. A
// stray unhandled rejection from a third-party library (exifr's HEIC reader
// has one — see readExifSummary above) would otherwise kill the whole
// worker thread and silently strand every task still queued behind it. Fail
// just the in-flight task instead of taking the worker down with it.
function handleFatal(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  console.error('[imageWorker] non-fatal to the pool, failing current task:', message)
  if (currentTaskId !== null) {
    parentPort?.postMessage({ id: currentTaskId, ok: false, error: message })
    currentTaskId = null
  }
}
process.on('uncaughtException', handleFatal)
process.on('unhandledRejection', handleFatal)

parentPort?.on('message', (task: WorkerTask) => {
  currentTaskId = task.id
  processFile(task).then((result) => {
    // A handleFatal() call for this same task may have already answered it.
    if (currentTaskId !== task.id) return
    currentTaskId = null
    parentPort?.postMessage(result)
  })
})
