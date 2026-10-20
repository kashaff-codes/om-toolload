// Uncertainty: case-level bootstrap (runs of a case stay together), paired bootstrap for
// condition differences, exact McNemar as a cross-check, and run-to-run spread.
import { mulberry32 } from './tools/fixtures.js'

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
export const sd = (xs: number[]) => {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1))
}
export const median = (xs: number[]) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const h = Math.floor(s.length / 2)
  return s.length % 2 ? s[h]! : (s[h - 1]! + s[h]!) / 2
}
const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))]!

export interface CI { point: number; lo: number; hi: number }

// perCase: one value per case (the mean of that case's runs). Resamples cases.
export function bootstrapMean(perCase: number[], resamples = 10_000, seed = 1): CI {
  const rng = mulberry32(seed)
  const n = perCase.length
  const stats = new Array<number>(resamples)
  for (let b = 0; b < resamples; b++) {
    let s = 0
    for (let i = 0; i < n; i++) s += perCase[Math.floor(rng() * n)]!
    stats[b] = s / n
  }
  stats.sort((a, b) => a - b)
  return { point: mean(perCase), lo: quantile(stats, 0.025), hi: quantile(stats, 0.975) }
}

// paired: a[i] and b[i] are the same case under two conditions
export const pairedBootstrap = (a: number[], b: number[], resamples = 10_000, seed = 2): CI => bootstrapMean(a.map((x, i) => x - b[i]!), resamples, seed)

const logChoose = (n: number, k: number) => {
  let s = 0
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i)
  return s
}
// exact two-sided McNemar on discordant pairs: b = A right / B wrong, c = A wrong / B right
export function mcnemar(aCorrect: boolean[], bCorrect: boolean[]) {
  let b = 0, c = 0
  aCorrect.forEach((x, i) => {
    if (x && !bCorrect[i]) b++
    else if (!x && bCorrect[i]) c++
  })
  const n = b + c
  if (n === 0) return { b, c, p: 1 }
  const k = Math.min(b, c)
  let tail = 0
  for (let i = 0; i <= k; i++) tail += Math.exp(logChoose(n, i) - n * Math.LN2)
  return { b, c, p: Math.min(1, 2 * tail) }
}
