import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'
import { toAssetUrl } from '@shared/assetProtocol'
import type { FaceBox, FaceMetrics } from '@shared/types'

let detectorPromise: Promise<FaceDetector> | null = null

function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const wasmBase = `${import.meta.env.BASE_URL}mediapipe/wasm`
      const modelPath = `${import.meta.env.BASE_URL}mediapipe/models/blaze_face_short_range.tflite`
      const fileset = await FilesetResolver.forVisionTasks(wasmBase)
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5
      })
    })()
  }
  return detectorPromise
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

/** Cheap per-face-crop Laplacian-variance sharpness, 0-100. */
function estimateFaceSharpness(
  img: HTMLImageElement,
  box: { x: number; y: number; width: number; height: number }
): number {
  const w = Math.max(8, Math.round(box.width))
  const h = Math.max(8, Math.round(box.height))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 50
  ctx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const grey = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    grey[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  }

  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x
      const lap = grey[idx - 1] + grey[idx + 1] + grey[idx - w] + grey[idx + w] - 4 * grey[idx]
      sum += lap
      sumSq += lap * lap
      n++
    }
  }
  if (n === 0) return 50
  const mean = sum / n
  const variance = Math.max(0, sumSq / n - mean * mean)
  return Math.min(100, 100 * (1 - Math.exp(-variance / 300)))
}

/** faces here use normalized (0-1) coordinates — see detectFaces(). */
function computeFaceScore(faces: FaceBox[]): number {
  if (faces.length === 0) return 0
  let weightedSum = 0
  let totalWeight = 0
  for (const f of faces) {
    const area = f.width * f.height // already a 0-1 fraction of the frame
    const sizeScore = Math.min(100, area * 600)
    const cx = f.x + f.width / 2
    const cy = f.y + f.height / 2
    const centerDist = Math.hypot(cx - 0.5, cy - 0.5)
    const centerScore = Math.max(0, 100 * (1 - centerDist / 0.7))
    const perFace = 0.45 * f.sharpness + 0.35 * sizeScore + 0.1 * centerScore + 0.1 * (f.confidence * 100)
    weightedSum += perFace * area
    totalWeight += area
  }
  return totalWeight > 0 ? Math.min(100, Math.max(0, weightedSum / totalWeight)) : 0
}

/**
 * Runs face detection on the (already-generated) grid thumbnail. FaceBox
 * coordinates are returned normalized to 0-1 so the UI can position boxes
 * over the thumbnail, the loupe preview, or anything else sharing the same
 * aspect ratio without needing to know pixel dimensions.
 */
export async function detectFaces(thumbAbsolutePath: string): Promise<FaceMetrics> {
  const detector = await getDetector()
  const img = await loadImage(toAssetUrl(thumbAbsolutePath))
  const result = detector.detect(img)
  const w = img.naturalWidth || 1
  const h = img.naturalHeight || 1

  const faces: FaceBox[] = result.detections.map((d) => {
    const box = d.boundingBox ?? { originX: 0, originY: 0, width: 0, height: 0 }
    const confidence = d.categories[0]?.score ?? 0
    const sharpness = estimateFaceSharpness(img, {
      x: box.originX,
      y: box.originY,
      width: box.width,
      height: box.height
    })
    return { x: box.originX / w, y: box.originY / h, width: box.width / w, height: box.height / h, confidence, sharpness }
  })

  return { score: computeFaceScore(faces), faces, analyzed: true }
}
