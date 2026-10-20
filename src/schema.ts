import { z } from 'zod'

export const Category = z.enum(['exact_value', 'multi_session', 'knowledge_update', 'temporal', 'distractor', 'abstention'])
export type Category = z.infer<typeof Category>

export const Turn = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), text: z.string() }),
  z.object({ role: z.literal('assistant'), text: z.string() }),
  z.object({
    role: z.literal('tool'),
    name: z.enum(['getOrder', 'getShipment', 'getCustomer', 'searchTickets']),
    args: z.record(z.string(), z.unknown()),
    fixture: z.string(),
  }),
])
export type Turn = z.infer<typeof Turn>

export const Expected = z.discriminatedUnion('type', [
  // a literal string (ID, tracking number, email, address) that must appear verbatim after normalization
  z.object({ type: z.literal('exact'), value: z.string() }),
  // a money amount or count, compared as a number
  z.object({ type: z.literal('number'), value: z.number() }),
  // a calendar date (YYYY-MM-DD), compared after parsing
  z.object({ type: z.literal('date'), value: z.string() }),
  // one of several named options; the first option mentioned in the answer is the pick
  z.object({ type: z.literal('choice'), value: z.string(), options: z.array(z.string()) }),
  // the answer is not in the thread
  z.object({ type: z.literal('abstain') }),
])
export type Expected = z.infer<typeof Expected>

export const Case = z.object({
  id: z.string(),
  category: Category,
  tags: z.object({
    outputSize: z.enum(['small', 'large']),
    // designed position of the key fact: early sessions (likely reflected away) or the final session
    position: z.enum(['pre_reflection', 'post_reflection']),
    userRepeated: z.boolean(),
    // knowledge_update only: who stated the new value
    updateSource: z.enum(['user', 'tool']).optional(),
  }),
  sessions: z.array(z.object({ at: z.string(), turns: z.array(Turn) })).min(1),
  question: z.string(),
  expected: Expected,
  distractors: z.array(z.string()),
  abstainIsCorrect: z.boolean(),
})
export type Case = z.infer<typeof Case>

export const Label = z.enum(['correct', 'abstained', 'silent_failure'])
export type Label = z.infer<typeof Label>

export const LedgerRow = z.object({
  runId: z.string(),
  run: z.number(),
  condition: z.string(),
  caseId: z.string(),
  category: Category,
  question: z.string(),
  answer: z.string(),
  exactLabel: Label,
  judgeLabel: Label.nullable(),
  judgeValueStated: z.string().nullable(),
  threadTokens: z.number(),
  actorInputTokens: z.number(),
  actorOutputTokens: z.number(),
  observerInputTokens: z.number(),
  observerOutputTokens: z.number(),
  reflectorInputTokens: z.number(),
  reflectorOutputTokens: z.number(),
  observationCycles: z.number(),
  reflectionCycles: z.number(),
  // tokens of messages handed to the Observer / tokens of observations it produced, summed over cycles
  observedMessageTokens: z.number(),
  observationOutputTokens: z.number(),
  // tokens of the final observation log the actor read (after any reflection)
  finalObservationTokens: z.number(),
  firstReflectionAfterSession: z.number().nullable(),
  // loss attribution: is the expected value literally in the thread, and in the
  // observation log the actor read? Null when not applicable (no single value, or no OM).
  valueInThread: z.boolean().nullable().default(null),
  valueInObservations: z.boolean().nullable().default(null),
  // wall time to seed and observe this condition's database (shared by C4 and C6)
  ingestMs: z.number().nullable().default(null),
  recallCalls: z.number(),
  latencyMs: z.number(),
  judgeUsd: z.number(),
  versions: z.record(z.string(), z.string()),
  seed: z.number(),
  at: z.string(),
})
export type LedgerRow = z.infer<typeof LedgerRow>
