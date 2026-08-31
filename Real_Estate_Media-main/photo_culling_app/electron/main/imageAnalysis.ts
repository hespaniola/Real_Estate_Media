/**
 * Pure, dependency-free pixel analysis. Operates on raw 8-bit single or
 * multi-channel buffers produced by sharp so it can be unit tested without
 * touching the filesystem or worker_threads.
 */

export interface GreyBuffer {
  data: Buffer | Uint8Array
  width: number
  height: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Soft diminishing-returns curve: 0 at metric=0, approaches 100 as metric grows past k. */
export function normalizeToScore(metric: number, k: number): number {
  return clamp(100 * (1 - Math.exp(-Math.max(0, metric) / k)), 0, 100)
}

// Empirically chosen so a tack-sharp analysis-resolution (~1024px) frame
// lands near 90-100 and a soft/blurred one lands under 30. Tunable if the
// analysis resize dimension changes.
const SHARPNESS_K_VARIANCE = 900
// sharp's built-in stats().sharpness is a Laplacian *stdev* (sqrt-scale of
// the variance above), so it needs its own, smaller constant.
export const SHARPNESS_K_STDEV = 30

export function computeSharpness(laplacian: GreyBuffer): { rawVariance: number; score: number } {
  const { data } = laplacian
  const n = data.length
  let sum = 0
  let sumSq = 0
  for (let i = 0; i < n; i++) {
    const v = data[i] - 128
    sum += v
    sumSq += v * v
  }
  const mean = sum / n
  const variance = Math.max(0, sumSq / n - mean * mean)
  return { rawVariance: variance, score: normalizeToScore(variance, SHARPNESS_K_VARIANCE) }
}

export interface ExposureResult {
  score: number
  meanBrightness: number
  shadowClipPct: number
  highlightClipPct: number
  contrast: number
}

export function computeExposure(luminance: GreyBuffer): ExposureResult {
  const { data } = luminance
  const n = data.length
  let sum = 0
  let sumSq = 0
  let shadowClip = 0
  let highlightClip = 0
  for (let i = 0; i < n; i++) {
    const v = data[i]
    sum += v
    sumSq += v * v
    if (v <= 2) shadowClip++
    if (v >= 253) highlightClip++
  }
  const mean = sum / n
  const variance = Math.max(0, sumSq / n - mean * mean)
  const stdev = Math.sqrt(variance)
  const shadowClipPct = (shadowClip / n) * 100
  const highlightClipPct = (highlightClip / n) * 100

  // Peak reward around a mid-range, well-exposed mean and healthy contrast;
  // clipped shadows/highlights are docked directly.
  const meanScore = 100 * Math.exp(-((mean - 130) ** 2) / (2 * 70 * 70))
  const contrastScore = 100 * Math.exp(-((stdev - 55) ** 2) / (2 * 45 * 45))
  const clipPenalty = Math.min(40, (shadowClipPct + highlightClipPct) * 2)
  const score = clamp(0.6 * meanScore + 0.4 * contrastScore - clipPenalty, 0, 100)

  return { score, meanBrightness: mean, shadowClipPct, highlightClipPct, contrast: stdev }
}

export interface CompositionResult {
  score: number
  ruleOfThirdsStrength: number
  centeredness: number
  horizonTilt: number | null
}

const POWER_POINTS: Array<[number, number]> = [
  [1 / 3, 1 / 3],
  [2 / 3, 1 / 3],
  [1 / 3, 2 / 3],
  [2 / 3, 2 / 3]
]
const MAX_DIST = Math.hypot(0.5, 0.5)

/**
 * Uses Sobel gradient energy as a cheap saliency proxy: where the edge
 * energy concentrates relative to the rule-of-thirds intersections, and
 * whether a dominant near-horizontal edge (a horizon/architecture line)
 * is tilted.
 */
export function computeComposition(gx: GreyBuffer, gy: GreyBuffer): CompositionResult {
  const { width, height } = gx
  const n = width * height
  const mag = new Float32Array(n)
  let sumMag = 0
  let sumMagSq = 0

  for (let i = 0; i < n; i++) {
    const dx = gx.data[i] - 128
    const dy = gy.data[i] - 128
    const m = Math.sqrt(dx * dx + dy * dy)
    mag[i] = m
    sumMag += m
    sumMagSq += m * m
  }

  let cx = 0
  let cy = 0
  let wsum = 0
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const w = mag[row + x]
      cx += w * x
      cy += w * y
      wsum += w
    }
  }
  const centroidX = wsum > 0 ? cx / wsum / width : 0.5
  const centroidY = wsum > 0 ? cy / wsum / height : 0.5

  let minDist = Infinity
  for (const [px, py] of POWER_POINTS) {
    const d = Math.hypot(centroidX - px, centroidY - py)
    if (d < minDist) minDist = d
  }
  const ruleOfThirdsStrength = clamp(100 * (1 - minDist / MAX_DIST), 0, 100)
  const centeredDist = Math.hypot(centroidX - 0.5, centroidY - 0.5)
  const centeredness = clamp(100 * (1 - centeredDist / MAX_DIST), 0, 100)

  const meanMag = sumMag / n
  const stdMag = Math.sqrt(Math.max(0, sumMagSq / n - meanMag * meanMag))
  const threshold = meanMag + 1.5 * stdMag

  const bins = new Float64Array(181) // index = round(edgeAngleDeg) + 90
  let strongCount = 0
  for (let i = 0; i < n; i++) {
    if (mag[i] < threshold) continue
    const dx = gx.data[i] - 128
    const dy = gy.data[i] - 128
    if (dx === 0 && dy === 0) continue
    const gradAngle = (Math.atan2(dy, dx) * 180) / Math.PI
    let edgeAngle = gradAngle - 90
    while (edgeAngle <= -90) edgeAngle += 180
    while (edgeAngle > 90) edgeAngle -= 180
    const bin = clamp(Math.round(edgeAngle) + 90, 0, 180)
    bins[bin]++
    strongCount++
  }

  let horizonTilt: number | null = null
  if (strongCount > 200) {
    let total = 0
    for (let b = 70; b <= 110; b++) total += bins[b]
    const avgInRange = total / 41
    let bestBin = -1
    let bestVal = 0
    for (let b = 70; b <= 110; b++) {
      if (bins[b] > bestVal) {
        bestVal = bins[b]
        bestBin = b
      }
    }
    if (bestBin >= 0 && bestVal > avgInRange * 3 && bestVal > strongCount * 0.02) {
      horizonTilt = bestBin - 90
    }
  }

  const tiltPenalty = horizonTilt !== null ? Math.min(30, Math.abs(horizonTilt) * 4) : 0
  const score = clamp(ruleOfThirdsStrength - tiltPenalty, 0, 100)

  return { score, ruleOfThirdsStrength, centeredness, horizonTilt }
}

/** 64-bit difference hash from a 9x8 greyscale buffer, returned as 16 hex chars. */
export function computeDHash(buf: GreyBuffer): string {
  const { data, width, height } = buf
  const bits: number[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const left = data[y * width + x]
      const right = data[y * width + x + 1]
      bits.push(left > right ? 1 : 0)
    }
  }
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]
    hex += nibble.toString(16)
  }
  return hex
}
