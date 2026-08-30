export function scoreTier(score: number): 'high' | 'mid' | 'low' {
  if (score >= 80) return 'high'
  if (score >= 55) return 'mid'
  return 'low'
}
