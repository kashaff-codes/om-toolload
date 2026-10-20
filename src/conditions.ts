// C1-C6 memory configurations. Only the Memory config changes between conditions; the
// actor model, instructions and seeded threads are identical.
import { LibSQLStore, LibSQLVector } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { estimateTokenCount } from 'tokenx'
import { env, omModel } from './models.js'
import { messageText } from './seed.js'

export type ConditionId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6'
export const ALL_CONDITIONS: ConditionId[] = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']
export const MAIN_CONDITIONS: ConditionId[] = ['C1', 'C2', 'C3', 'C4']

export const CONDITION_LABELS: Record<ConditionId, string> = {
  C1: 'Full context',
  C2: 'Truncated (last 4)',
  C3: 'Semantic recall',
  C4: 'Observational Memory',
  C5: 'OM + pinned values',
  C6: 'OM + retrieval',
}

// OM defaults are 30k/40k. Threads here are ~4-9k tokens (sized for a 16k local context),
// so thresholds are scaled down until both observation and reflection fire. Recorded in
// every ledger row and in the README.
export const OM_THRESHOLDS = { messageTokens: 3_000, observationTokens: 1_500 }

// Tool calls are stored inside assistant messages, so a thread is only 8-12 messages
// (median 10). The PRD's "last 10" would be full context here; 4 is about the last one
// or two sessions, which keeps C2 a floor and makes C3's recall do work.
export const RECENT_MESSAGES = 4

// Which seeded database a condition reads. C4 and C6 read copies of one ingestion, so the
// recall tool is the only difference between them.
export const INGEST_GROUP: Record<ConditionId, string> = { C1: 'plain', C2: 'plain', C3: 'vector', C4: 'om', C5: 'om-pinned', C6: 'om' }

export interface OMStats {
  observerInputTokens: number
  observerOutputTokens: number
  reflectorInputTokens: number
  reflectorOutputTokens: number
  observationCycles: number
  reflectionCycles: number
  observedMessageTokens: number
  observationOutputTokens: number
}
export const emptyStats = (): OMStats => ({ observerInputTokens: 0, observerOutputTokens: 0, reflectorInputTokens: 0, reflectorOutputTokens: 0, observationCycles: 0, reflectionCycles: 0, observedMessageTokens: 0, observationOutputTokens: 0 })

// ---- C5: pinned values. beforeObservation copies identifiers, amounts, addresses and
// dates out of tool results verbatim; afterObservation appends them to the observation
// text; afterReflection re-appends every pinned line, since a reflection rewrites the log.
// Deterministic, no extra model calls (the PRD's pre-registered fallback for C5).
const PIN_FIELDS = ['order_id', 'tracking_number', 'status', 'ticket_id', 'refund_amount', 'total', 'delivered_at', 'estimated_delivery', 'placed_at', 'email', 'customer_id', 'name']
function pinLines(messages: any[]): string[] {
  const lines: string[] = []
  for (const m of messages) for (const p of m.content?.parts ?? []) {
    if (p.type !== 'tool-invocation') continue
    const { toolName, args, result } = p.toolInvocation
    const rows: Record<string, unknown>[] = Array.isArray(result?.results) ? result.results : [result]
    for (const r of rows) {
      const kv: string[] = []
      const visit = (o: any, prefix = '') => {
        if (!o || typeof o !== 'object') return
        for (const [k, v] of Object.entries(o)) {
          if (k.startsWith('_') || k === 'audit_log' || k === 'inventory_snapshot' || k === 'events') continue
          if (PIN_FIELDS.includes(k) && v !== null && typeof v !== 'object') kv.push(`${prefix}${k}=${v}`)
          else if ((k === 'destination' || k === 'ship_to' || k === 'default_address') && v && typeof v === 'object') {
            const a = v as any
            kv.push(`${k}=${a.line1}, ${a.city}, ${a.state} ${a.zip}`)
          } else if (k === 'amounts' || k === 'line_items') visit(Array.isArray(v) ? v[0] : v, '')
        }
      }
      visit(r)
      if (kv.length) lines.push(`- ${toolName}(${Object.values(args ?? {}).join(', ')}): ${kv.join('; ')}`)
    }
  }
  return lines
}

function hooks(stats: OMStats, pin: boolean) {
  const pending = new Map<string, string[]>()
  const all = new Map<string, string[]>()
  const block = (lines: string[]) => `\n\nPinned values (copied verbatim from tool results):\n${lines.join('\n')}`
  return {
    onObservationEnd: ({ usage }: any) => {
      stats.observationCycles++
      stats.observerInputTokens += usage?.inputTokens ?? 0
      stats.observerOutputTokens += usage?.outputTokens ?? 0
    },
    onReflectionEnd: ({ usage }: any) => {
      stats.reflectionCycles++
      stats.reflectorInputTokens += usage?.inputTokens ?? 0
      stats.reflectorOutputTokens += usage?.outputTokens ?? 0
    },
    beforeObservation: ({ messages, threadId }: any) => {
      stats.observedMessageTokens += messages.reduce((n: number, m: any) => n + estimateTokenCount(messageText(m)), 0)
      if (pin) {
        const lines = pinLines(messages)
        pending.set(threadId, lines)
        all.set(threadId, [...(all.get(threadId) ?? []), ...lines])
      }
    },
    afterObservation: ({ observations, threadId }: any) => {
      let text: string = observations
      if (pin) {
        const lines = pending.get(threadId) ?? []
        pending.delete(threadId)
        if (lines.length) text += block(lines)
      }
      stats.observationOutputTokens += estimateTokenCount(text)
      return pin ? { observations: text } : undefined
    },
    afterReflection: ({ observations, threadId }: any) => {
      const lines = all.get(threadId) ?? []
      return pin && lines.length ? { observations: observations + block(lines) } : undefined
    },
  }
}

// Mastra memory embeds through AI SDK v2/v3 embedding models; the Ollama provider ships
// v4, so this is a minimal v2 adapter over Ollama's /api/embed.
const embedder = () => ({
  specificationVersion: 'v2' as const,
  provider: 'ollama',
  modelId: 'nomic-embed-text',
  maxEmbeddingsPerCall: 64,
  supportsParallelCalls: false,
  async doEmbed({ values }: { values: string[] }) {
    const res = await fetch(`${env.ollamaBaseURL}/embed`, { method: 'POST', body: JSON.stringify({ model: 'nomic-embed-text', input: values }) })
    if (!res.ok) throw new Error(`ollama embed failed: ${res.status} ${await res.text()}`)
    const json = (await res.json()) as { embeddings: number[][]; prompt_eval_count?: number }
    return { embeddings: json.embeddings, usage: { tokens: json.prompt_eval_count ?? 0 } }
  },
})

export function buildMemory(cond: ConditionId, dbFile: string, stats: OMStats, phase: 'ingest' | 'ask') {
  const storage = new LibSQLStore({ id: `om-${cond}-${phase}`, url: `file:${dbFile}` })
  if (cond === 'C1') return { storage, memory: new Memory({ storage, options: { lastMessages: 1000 } }) }
  if (cond === 'C2') return { storage, memory: new Memory({ storage, options: { lastMessages: RECENT_MESSAGES } }) }
  if (cond === 'C3') {
    const vector = new LibSQLVector({ id: `vec-${phase}`, url: `file:${dbFile}` })
    return {
      storage,
      memory: new Memory({ storage, vector, embedder: embedder() as any, options: { lastMessages: RECENT_MESSAGES, semanticRecall: { topK: 5, messageRange: 1, scope: 'thread' } } }),
    }
  }
  // C4 / C5 / C6. Ingestion for the shared C4/C6 database runs with retrieval on, so
  // observation groups carry message ranges; C4 then asks without the recall tool.
  const retrieval = cond === 'C6' || (cond === 'C4' && phase === 'ingest')
  return {
    storage,
    memory: new Memory({
      storage,
      options: {
        observationalMemory: {
          model: omModel(),
          observation: { messageTokens: OM_THRESHOLDS.messageTokens, bufferTokens: false },
          reflection: { observationTokens: OM_THRESHOLDS.observationTokens },
          ...(retrieval ? { retrieval: { scope: 'thread' as const } } : {}),
          hooks: hooks(stats, cond === 'C5'),
        },
      },
    }),
  }
}
