// Day-0 spike (PRD "Risks"): confirm the stored tool-message shape and that seeded
// messages are picked up by OM. Run: pnpm tsx scripts/spike.ts [--no-judge]
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { z } from 'zod'
import { actorModel, omModel, anthropicClient, env } from '../src/models.js'

mkdirSync('runs', { recursive: true })
rmSync('runs/spike.db', { force: true })

if (!process.argv.includes('--no-judge')) {
  const r = await anthropicClient().messages.create({
    model: env.judgeModel,
    max_tokens: 64,
    messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
  })
  console.log('anthropic ok:', r.content.map(b => (b.type === 'text' ? b.text : b.type)).join(' '), r.usage)
}

const getOrder = createTool({
  id: 'getOrder',
  description: 'Look up an order by ID',
  inputSchema: z.object({ orderId: z.string() }),
  execute: async ({ orderId }) => ({ orderId, status: 'shipped', total: '$42.10', tracking: 'JD014600006281' }),
})

const storage = new LibSQLStore({ id: 'spike', url: 'file:./runs/spike.db' })
const usage: unknown[] = []
const memory = new Memory({
  storage,
  options: {
    lastMessages: 40,
    observationalMemory: {
      model: omModel(),
      observation: { messageTokens: 2_000, bufferTokens: false },
      reflection: { observationTokens: 8_000 },
      hooks: { onObservationEnd: u => void usage.push(u), onReflectionEnd: u => void usage.push(u) },
    },
  },
})
const agent = new Agent({
  id: 'spike',
  name: 'spike',
  instructions: 'You are a support agent. Use tools to look up orders.',
  model: actorModel(),
  tools: { getOrder },
  memory,
})

await memory.createThread({ threadId: 'live', resourceId: 'u1' })
const t0 = Date.now()
const res = await agent.generate('Please look up order ORD-4471 for me.', { memory: { thread: 'live', resource: 'u1' } })
console.log('live answer (%dms):', Date.now() - t0, res.text)

const stored = await memory.recall({ threadId: 'live', resourceId: 'u1' })
writeFileSync('runs/spike-stored.json', JSON.stringify(stored.messages, null, 2))
console.log('stored %d messages -> runs/spike-stored.json', stored.messages.length)

const om = await memory.omEngine
const rec = await om!.observe({ threadId: 'live', resourceId: 'u1', force: true })
console.log('observed:', rec.observed, 'reflected:', rec.reflected)
console.log('observations:\n', await om!.getObservations('live', 'u1'))
console.log('usage events:', JSON.stringify(usage, null, 1).slice(0, 1500))
writeFileSync('runs/spike-record.json', JSON.stringify(rec.record, null, 2))
process.exit(0)
