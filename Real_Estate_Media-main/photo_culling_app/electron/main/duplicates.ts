import type { DuplicateGroup } from '../shared/types'
import { hammingDistanceHex, SIMILAR_THRESHOLD } from '../shared/scoring'

export interface ClusterInput {
  id: string
  hash: string | null
  score: number
  width: number
  height: number
  sharpness: number
}

/**
 * Union-find clustering over perceptual-hash Hamming distance. O(n^2)
 * comparisons, which is fine at the hundreds-to-low-thousands scale this
 * app targets; each comparison is a 16-hex-char popcount lookup.
 */
export function clusterSimilarImages(items: ClusterInput[], threshold = SIMILAR_THRESHOLD): DuplicateGroup[] {
  const n = items.length
  const parent = Array.from({ length: n }, (_, i) => i)

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  function union(a: number, b: number): void {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  for (let i = 0; i < n; i++) {
    if (!items[i].hash) continue
    for (let j = i + 1; j < n; j++) {
      if (!items[j].hash) continue
      if (hammingDistanceHex(items[i].hash!, items[j].hash!) <= threshold) union(i, j)
    }
  }

  const clusters = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    const list = clusters.get(root)
    if (list) list.push(i)
    else clusters.set(root, [i])
  }

  const groups: DuplicateGroup[] = []
  for (const indices of clusters.values()) {
    if (indices.length < 2) continue

    let bestIdx = indices[0]
    for (const idx of indices) {
      const a = items[idx]
      const b = items[bestIdx]
      if (a.score > b.score) {
        bestIdx = idx
      } else if (a.score === b.score) {
        const areaA = a.width * a.height
        const areaB = b.width * b.height
        if (areaA > areaB || (areaA === areaB && a.sharpness > b.sharpness)) bestIdx = idx
      }
    }

    groups.push({
      id: `group-${items[bestIdx].id}`,
      memberIds: indices.map((i) => items[i].id),
      recommendedId: items[bestIdx].id
    })
  }

  return groups
}
