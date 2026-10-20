// Model wiring. Actor, Observer and Reflector run on local Ollama; only the judge
// calls Anthropic, and only when it has to (results are cached on disk).
import { createOllama } from 'ollama-ai-provider-v2'
import Anthropic from '@anthropic-ai/sdk'

try {
  process.loadEnvFile('.env')
} catch {
  // no .env: rely on the real environment
}

export const env = {
  ollamaBaseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api',
  ollamaModel: process.env.OLLAMA_MODEL ?? 'llama3.1:8b',
  // Observer and Reflector. Local by default; a Mastra router id such as
  // 'anthropic/claude-haiku-5-5' runs them hosted (the Observer-size check).
  observerModel: process.env.OBSERVER_MODEL ?? '',
  numCtx: Number(process.env.OLLAMA_NUM_CTX ?? 12288),
  judgeModel: process.env.JUDGE_MODEL ?? 'claude-haiku-5-5',
  costCapUsd: Number(process.env.COST_CAP_USD ?? 2),
  anthropicKey: process.env.ANTHROPIC_API_KEY,
}

// Sampling seed for local models. Each run sets its own, so runs differ the way
// repeated API runs would, but any single run can be reproduced exactly.
export const sampling = { seed: 1 }

// Ollama defaults to a small context window. Inject num_ctx (and the run seed) into
// every /api/chat body so long threads are not silently truncated by the server.
const ollamaFetch: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === 'string') {
    const body = JSON.parse(init.body)
    body.options = { ...(body.options ?? {}), num_ctx: env.numCtx, seed: sampling.seed }
    init = { ...init, body: JSON.stringify(body) }
  }
  return fetch(input, init)
}

const ollama = createOllama({ baseURL: env.ollamaBaseURL, fetch: ollamaFetch })

export const actorModel = () => ollama(env.ollamaModel)
export const omModel = () => (env.observerModel ? env.observerModel : ollama(env.ollamaModel))
export const observerName = () => env.observerModel || env.ollamaModel

let anthropic: Anthropic | undefined
export const anthropicClient = () => {
  if (!env.anthropicKey) throw new Error('ANTHROPIC_API_KEY is not set; the judge needs it')
  anthropic ??= new Anthropic({ apiKey: env.anthropicKey })
  return anthropic
}

// USD per million tokens, for the cost ledger. Local models cost nothing.
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
}

export const usd = (model: string, input: number, output: number) => {
  const p = PRICES[model] ?? { input: 5, output: 25 } // unknown model: price high to stay safe
  return (input * p.input + output * p.output) / 1e6
}
