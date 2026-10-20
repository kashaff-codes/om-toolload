// Dataset integrity: the known answers really are in each thread, the abstention answers
// really are not, and the seeder replays the committed fixtures byte for byte.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Case } from '../src/schema.js'
import { normalizeId } from '../src/scorers/exact.js'
import { messageText, sessionMessages } from '../src/seed.js'
import { loadFixture } from '../src/tools/index.js'
import { nearMiss } from '../src/tools/fixtures.js'

const cases = readdirSync('cases').filter(f => f.endsWith('.json')).map(f => Case.parse(JSON.parse(readFileSync(`cases/${f}`, 'utf8'))))
const threadText = (c: Case) =>
  c.sessions.flatMap(s => s.turns.map(t => (t.role === 'tool' ? JSON.stringify(t.args) + JSON.stringify(loadFixture(t.fixture)) : t.text))).join('\n')

describe('case set', () => {
  it('has the pre-registered category counts', () => {
    const n = (cat: string) => cases.filter(c => c.category === cat).length
    expect(cases).toHaveLength(40)
    expect([n('exact_value'), n('multi_session'), n('knowledge_update'), n('temporal'), n('distractor'), n('abstention')]).toEqual([10, 8, 6, 6, 6, 4])
  })
  it('every thread has 4-6 sessions', () => {
    for (const c of cases) expect(c.sessions.length, c.id).toBeGreaterThanOrEqual(4)
    for (const c of cases) expect(c.sessions.length, c.id).toBeLessThanOrEqual(6)
  })
  it('every exact expected value appears in the thread', () => {
    for (const c of cases) {
      if (c.expected.type !== 'exact') continue
      expect(normalizeId(threadText(c)).includes(normalizeId(c.expected.value)), c.id).toBe(true)
    }
  })
  it('exact_value answers live in a tool output, and in chat only when the user restated them', () => {
    for (const c of cases.filter(x => x.category === 'exact_value' && x.expected.type === 'exact')) {
      const v = (c.expected as { value: string }).value
      const chat = c.sessions.flatMap(s => s.turns.filter(t => t.role !== 'tool').map(t => (t as { text: string }).text)).join('\n')
      expect(chat.includes(v), c.id).toBe(c.tags.userRepeated)
    }
  })
  it('date answers appear as delivered_at in a tool output', () => {
    for (const c of cases.filter(x => x.expected.type === 'date')) expect(threadText(c).includes(`"delivered_at":"${(c.expected as { value: string }).value}`), c.id).toBe(true)
  })
  it('near-miss distractor IDs exist in the thread for near-duplicate cases', () => {
    for (const c of cases.filter(x => x.category === 'distractor' && x.question.includes('ORD-'))) {
      const id = c.question.match(/ORD-\d{4}/)![0]
      expect(threadText(c).includes(nearMiss(id)), c.id).toBe(true)
    }
  })
  it('abstention cases contain no field that answers the question', () => {
    for (const c of cases.filter(x => x.category === 'abstention')) expect(/discount|gift|driver|warranty_reg|registration/i.test(threadText(c).replace(c.question, '')), c.id).toBe(false)
  })
})

describe('seeder', () => {
  it('replays byte-identical threads', async () => {
    const c = cases[0]!
    const a = await sessionMessages(c)
    const b = await sessionMessages(c)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
  it('stores tool calls the way a live turn does', async () => {
    const msgs = (await sessionMessages(cases[0]!)).flat()
    const asst = msgs.find(m => m.role === 'assistant')!
    const parts = (asst.content as any).parts
    expect(parts[0].type).toBe('tool-invocation')
    expect(parts[0].toolInvocation.state).toBe('result')
    expect(parts.at(-1).type).toBe('text')
    expect(messageText(asst)).toContain('->')
  })
})
