// Deterministic scorer. Pure function, no LLM. Correct means the expected value is
// present and no distractor is; abstention and hedging are detected by phrase lists.
import type { Expected, Label } from '../schema.js'

export const normalizeId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const ABSTAIN = [
  /\bi (?:do not|don't|dont) know\b/, /\bnot sure\b/, /\bunsure\b/, /\b(?:do not|don't|dont) have (?:that|this|any|the|a record|information|details)\b/,
  /\bno (?:record|information|details|mention|data)\b/, /\b(?:not|isn't|wasn't) (?:available|mentioned|recorded|provided|specified|included|shown|listed)\b/,
  /\b(?:unable|not able) to (?:find|locate|see|determine|confirm)\b/, /\b(?:can't|cannot|couldn't|could not) (?:find|locate|see|determine|confirm|tell)\b/,
  /\bi (?:don't|do not) see\b/, /\bno way to (?:know|tell)\b/, /\bdoesn't (?:say|mention|include|show)\b/, /\bdon't recall\b/, /\bno .{0,30} (?:on file|on record)\b/,
]
const HEDGE = [/\bpossibly\b/, /\bmight be\b/, /\bmay be\b/, /\bi think\b/, /\bi believe\b/, /\bprobably\b/, /\bperhaps\b/, /\bif i recall\b/, /\bmaybe\b/]

// An answer that is only an attempted tool call ({"name": "getOrder", "parameters": ...})
// makes no claim; seen from the 8B actor in the dry run.
const isBareToolCall = (answer: string) => /^\s*(\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"parameters"\s*:[^\n]*\}\s*)+$/.test(answer)

export const isAbstention = (answer: string) => isBareToolCall(answer) || ABSTAIN.some(r => r.test(answer.toLowerCase()))
export const isHedged = (answer: string) => isAbstention(answer) || HEDGE.some(r => r.test(answer.toLowerCase()))

export function numbersIn(text: string): number[] {
  const out: number[] = []
  // skip digits glued to letters or ID dashes (ORD-4471, TKT-123456, JD0146...)
  for (const m of text.matchAll(/(?<![A-Za-z0-9-])\$?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(?![A-Za-z0-9])/g)) {
    out.push(parseFloat(m[1]!.replace(/,/g, '') + (m[2] ?? '')))
  }
  return out
}
const sameNumber = (a: number, b: number) => Math.abs(a - b) < 0.006

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
export function datesIn(text: string, defaultYear = 2026): string[] {
  const t = text.toLowerCase()
  const out = new Set<string>()
  const fmt = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null)
  const add = (s: string | null) => s && out.add(s)
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})/g)) add(fmt(+m[1]!, +m[2]!, +m[3]!))
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) add(fmt(m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : defaultYear, +m[1]!, +m[2]!))
  const mon = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?'
  for (const m of t.matchAll(new RegExp(`\\b${mon}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'g')))
    add(fmt(m[3] ? +m[3] : defaultYear, MONTHS.findIndex(x => x.startsWith(m[1]!.slice(0, 3))) + 1, +m[2]!))
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${mon}(?:,?\\s+(\\d{4}))?`, 'g')))
    add(fmt(m[3] ? +m[3] : defaultYear, MONTHS.findIndex(x => x.startsWith(m[2]!.slice(0, 3))) + 1, +m[1]!))
  return [...out]
}

// Whether a text (the thread, or the observation log the actor read) contains the expected
// value, by the same normalizers the scorer uses. Null for choice and abstention cases,
// which have no single value to look for.
export function valuePresent(text: string, expected: Expected): boolean | null {
  switch (expected.type) {
    case 'exact':
      return normalizeId(text).includes(normalizeId(expected.value))
    case 'number':
      return numbersIn(text).some(x => sameNumber(x, expected.value))
    case 'date':
      return datesIn(text).includes(expected.value)
    default:
      return null
  }
}

export interface ExactResult { label: Label; matched: boolean; distractorHit: boolean }

export function scoreExact(answer: string, expected: Expected, distractors: string[]): ExactResult {
  const a = answer ?? ''
  const fallback = (matched: boolean, distractorHit: boolean): ExactResult =>
    matched && !distractorHit ? { label: 'correct', matched, distractorHit } : { label: isHedged(a) ? 'abstained' : 'silent_failure', matched, distractorHit }

  switch (expected.type) {
    case 'abstain':
      return { label: isAbstention(a) ? 'correct' : 'silent_failure', matched: isAbstention(a), distractorHit: false }
    case 'exact': {
      const n = normalizeId(a)
      return fallback(n.includes(normalizeId(expected.value)), distractors.some(d => n.includes(normalizeId(d))))
    }
    case 'number': {
      const nums = numbersIn(a)
      return fallback(nums.some(x => sameNumber(x, expected.value)), distractors.some(d => nums.some(x => sameNumber(x, parseFloat(d)))))
    }
    case 'date': {
      const ds = datesIn(a)
      return fallback(ds.includes(expected.value), distractors.some(d => ds.includes(d)))
    }
    case 'choice': {
      // the first option mentioned is the pick ("The charger arrived first, then the case")
      const lower = a.toLowerCase()
      const hits = expected.options.map(o => ({ o, i: lower.search(new RegExp(`\\b${o.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)) })).filter(h => h.i >= 0).sort((x, y) => x.i - y.i)
      return fallback(hits[0]?.o === expected.value, hits.length > 0 && hits[0]!.o !== expected.value)
    }
  }
}
