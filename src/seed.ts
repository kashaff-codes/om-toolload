// Thread seeder: turns a case into stored Mastra messages, in the exact shape a live
// tool-calling turn produces (see scripts/spike.ts, runs/spike-stored.json). Tool results
// come from the deterministic mock tools, so every condition gets byte-identical threads.
import type { MastraDBMessage } from '@mastra/core/agent'
import type { Case } from './schema.js'
import { FixtureQueue, makeTools } from './tools/index.js'

export const RESOURCE = 'om-toolload-user'

export async function sessionMessages(c: Case, threadId = c.id): Promise<MastraDBMessage[][]> {
  const queue = new FixtureQueue()
  for (const s of c.sessions) for (const t of s.turns) if (t.role === 'tool') queue.push(t.name, t.fixture)
  const tools = makeTools(queue)

  const out: MastraDBMessage[][] = []
  for (const [si, s] of c.sessions.entries()) {
    const msgs: MastraDBMessage[] = []
    const base = new Date(s.at).getTime()
    let minute = 0
    let pending: any[] = [] // tool-invocation parts waiting for the assistant's text
    const at = () => new Date(base + minute++ * 60_000)
    for (const [ti, t] of s.turns.entries()) {
      const id = `${c.id}-s${si}-t${ti}`
      if (t.role === 'user') {
        msgs.push({ id, role: 'user', createdAt: at(), threadId, resourceId: RESOURCE, content: { format: 2, parts: [{ type: 'text', text: t.text }], content: t.text } })
      } else if (t.role === 'tool') {
        const result = await (tools[t.name] as any).execute(t.args, {})
        pending.push({ type: 'tool-invocation', toolInvocation: { state: 'result', toolCallId: `call_${id}`, toolName: t.name, args: t.args, result } })
      } else {
        msgs.push({ id, role: 'assistant', createdAt: at(), threadId, resourceId: RESOURCE, content: { format: 2, parts: [...pending, { type: 'text', text: t.text }], content: t.text } })
        pending = []
      }
    }
    if (pending.length) throw new Error(`${c.id} session ${si}: tool calls without an assistant reply`)
    out.push(msgs)
  }
  return out
}

// Plain-text rendering of a message for token counting (what the model actually reads).
export function messageText(m: MastraDBMessage): string {
  const parts = (m.content as any).parts ?? []
  return parts
    .map((p: any) =>
      p.type === 'text' ? p.text : p.type === 'tool-invocation' ? `${p.toolInvocation.toolName}(${JSON.stringify(p.toolInvocation.args)}) -> ${JSON.stringify(p.toolInvocation.result)}` : '',
    )
    .join('\n')
}
