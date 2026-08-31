import type { ScoreBreakdown } from './types'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export interface FaceComponentInput {
  score: number
  analyzed: boolean
  count: number
}

export interface CompositeScoreInput {
  sharpness: number
  exposure: number
  composition: number
  faces: FaceComponentInput
  isDuplicateNonPick: boolean
}

const WEIGHTS = {
  sharpness: 0.35,
  exposure: 0.25,
  composition: 0.15,
  faces: 0.25
} as const

const DUPLICATE_PENALTY = 8

/**
 * Combines the four analysis dimensions into a single 1-100 score.
 * The faces dimension only participates when at least one face was
 * actually detected — a room interior or landscape should never be
 * marked down for having "no face", so its weight is redistributed
 * proportionally across the remaining dimensions instead.
 */
export function computeCompositeScore(input: CompositeScoreInput): ScoreBreakdown {
  const includeFaces = input.faces.analyzed && input.faces.count > 0

  const dims: Array<{ value: number; weight: number }> = [
    { value: clamp(input.sharpness, 0, 100), weight: WEIGHTS.sharpness },
    { value: clamp(input.exposure, 0, 100), weight: WEIGHTS.exposure },
    { value: clamp(input.composition, 0, 100), weight: WEIGHTS.composition }
  ]
  if (includeFaces) {
    dims.push({ value: clamp(input.faces.score, 0, 100), weight: WEIGHTS.faces })
  }

  const weightSum = dims.reduce((sum, d) => sum + d.weight, 0)
  const weighted = dims.reduce((sum, d) => sum + d.value * (d.weight / weightSum), 0)

  const duplicatePenalty = input.isDuplicateNonPick ? DUPLICATE_PENALTY : 0
  const total = clamp(Math.round(weighted - duplicatePenalty), 1, 100)

  return {
    total,
    sharpness: Math.round(clamp(input.sharpness, 0, 100)),
    exposure: Math.round(clamp(input.exposure, 0, 100)),
    composition: Math.round(clamp(input.composition, 0, 100)),
    faces: includeFaces ? Math.round(clamp(input.faces.score, 0, 100)) : null,
    duplicatePenalty
  }
}

/** Hamming distance between two equal-length hex perceptual hashes. */
export function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER
  let distance = 0
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    distance += POPCOUNT_NIBBLE[x]
  }
  return distance
}

const POPCOUNT_NIBBLE = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]

/** Near-duplicate: essentially the same frame (burst/near-identical). */
export const NEAR_DUPLICATE_THRESHOLD = 6
/** Similar: related composition/subject worth grouping but not identical. */
export const SIMILAR_THRESHOLD = 12
