// LLM judge: a Mastra createScorer whose analyze step asks Claude for a verdict.
// Kept cheap on purpose: Haiku, low effort, structured output, and a disk cache keyed by
// (question, expected, answer) so a rerun never pays for the same verdict twice.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { createScorer } from '@mastra/core/evals'
import { anthropicClient, env, usd } from '../models.js'
import type { Expected, Label } from '../schema.js'

export interface JudgeInput { question: string; expected: Expected }
export interface Verdict { verdict: 'correct' | 'wrong' | 'abstained'; valueStated: string | null }

const CACHE_FILE = 'results/judge-cache.json'
let cache: Record<string, Verdict> | undefined
const loadCache = () => (cache ??= existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {})
const saveCache = () => {
  mkdirSync('results', { recursive: true })
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1))
}

export const spend = { usd: 0, calls: 0, cached: 0 }

const describe = (e: Expected) =>
  e.type === 'abstain' ? 'The information is NOT in the conversation. The only correct answer says it does not know / cannot find it.'
    : e.type === 'choice' ? `${e.value} (choosing between: ${e.options.join(', ')})`
      : `${e.value}${e.type === 'number' ? ' (a number; formatting may differ)' : e.type === 'date' ? ' (a date; formatting may differ)' : ''}`

const SYSTEM = `You grade answers from a customer-support agent against a known reference answer.
Return verdict "correct" if the answer states the reference value (formatting, currency symbols, and date formats may differ).
Return "abstained" if the answer declines, says it does not know, or only hedges without committing to a value.
Return "wrong" if it commits to a different value, or a value that is close but not identical (one digit off, two characters swapped, a different order).
Set valueStated to the value the answer commits to, or null.`

const schema = {
  type: 'object',
  properties: { verdict: { type: 'string', enum: ['correct', 'wrong', 'abstained'] }, valueStated: { type: ['string', 'null'] } },
  required: ['verdict', 'valueStated'],
  additionalProperties: false,
}

export async function judgeVerdict(input: JudgeInput, answer: string): Promise<Verdict | null> {
  const key = createHash('sha256').update(JSON.stringify([env.judgeModel, input.question, input.expected, answer])).digest('hex')
  const hit = loadCache()[key]
  if (hit) return spend.cached++, hit
  if (spend.usd >= env.costCapUsd) return null // cost cap reached: leave the judge label empty

  const res = await anthropicClient().messages.create({
    model: env.judgeModel,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: `Question: ${input.question}\nReference answer: ${describe(input.expected)}\nAgent's answer: ${answer}` }],
  })
  spend.calls++
  spend.usd += usd(env.judgeModel, res.usage.input_tokens, res.usage.output_tokens)
  if (res.stop_reason === 'refusal') return null
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text
  if (!text) return null
  const v = JSON.parse(text) as Verdict
  cache![key] = v
  saveCache()
  return v
}

export const judgeScorer = createScorer<JudgeInput, string>({
  id: 'om-toolload-judge',
  description: 'LLM judge: does the answer state the known reference value?',
})
  .analyze(async ({ run }) => judgeVerdict(run.input!, run.output))
  .generateScore(({ results }) => ((results.analyzeStepResult as Verdict | null)?.verdict === 'correct' ? 1 : 0))

// correct / abstained / silent failure, same labels as the exact scorer
export function judgeLabel(v: Verdict | null, expected: Expected): Label | null {
  if (!v) return null
  if (expected.type === 'abstain') return v.verdict === 'correct' || v.verdict === 'abstained' ? 'correct' : 'silent_failure'
  return v.verdict === 'correct' ? 'correct' : v.verdict === 'abstained' ? 'abstained' : 'silent_failure'
}
