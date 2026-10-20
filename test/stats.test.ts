import { describe, expect, it } from 'vitest'
import { bootstrapMean, mcnemar, median, pairedBootstrap, sd } from '../src/stats.js'

describe('bootstrap', () => {
  it('centres on the mean and brackets it', () => {
    const xs = Array.from({ length: 40 }, (_, i) => (i < 30 ? 1 : 0))
    const c = bootstrapMean(xs, 2000)
    expect(c.point).toBeCloseTo(0.75)
    expect(c.lo).toBeLessThan(0.75)
    expect(c.hi).toBeGreaterThan(0.75)
    // 40 cases gives wide intervals, roughly +/-13 points here
    expect(c.hi - c.lo).toBeGreaterThan(0.2)
  })
  it('is deterministic for a fixed seed', () => {
    const xs = [1, 0, 1, 1, 0, 1]
    expect(bootstrapMean(xs, 500, 9)).toEqual(bootstrapMean(xs, 500, 9))
  })
  it('a zero paired difference has a CI around zero', () => {
    const a = [1, 0, 1, 0, 1]
    const d = pairedBootstrap(a, a, 500)
    expect(d).toEqual({ point: 0, lo: 0, hi: 0 })
  })
})

describe('mcnemar', () => {
  it('returns p = 1 with no discordant pairs', () => {
    expect(mcnemar([true, false], [true, false]).p).toBe(1)
  })
  it('matches the exact binomial for 8 vs 1', () => {
    const a = [...Array(8).fill(true), false]
    const b = [...Array(8).fill(false), true]
    // two-sided exact p for b=8, c=1: 2 * (1 + 9) / 512
    expect(mcnemar(a, b).p).toBeCloseTo(20 / 512, 6)
  })
})

describe('descriptives', () => {
  it('median and sd', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3)
  })
})
