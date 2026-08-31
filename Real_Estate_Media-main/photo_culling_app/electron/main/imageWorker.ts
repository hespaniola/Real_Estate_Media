import { parentPort } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import exifr from 'exifr'
import type { ExifSummary } from '../shared/types'
import { computeExposure, computeComposition, computeDHash, computeSharpness } from './imageAnalysis'
import { extractLargestEmbeddedJpeg } from './rawPreview'
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

async function readExifSummary(filePath: string): Promise<ExifSummary> {
  try {
    const data = await exifr.parse(filePath, {
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

async function getPreviewSource(filePath: string, kind: WorkerTask['kind']): Promise<sharp.Sharp> {
  if (kind === 'raw') {
    const buffer = await readFile(filePath)
    const embedded = extractLargestEmbeddedJpeg(buffer)
    if (embedded) return sharp(embedded)
    const thumb = await exifr.thumbnail(filePath).catch(() => null)
    if (thumb) return sharp(Buffer.from(thumb))
    throw new Error('No embeddable preview found in RAW file')
  }
  return sharp(filePath)
}

async function processFile(task: WorkerTask): Promise<WorkerResult> {
  try {
    const source = await getPreviewSource(task.filePath, task.kind)
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

    const exif = await readExifSummary(task.filePath)

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

parentPort?.on('message', (task: WorkerTask) => {
  processFile(task).then((result) => parentPort?.postMessage(result))
})
