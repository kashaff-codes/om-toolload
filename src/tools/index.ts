// Deterministic mock tools built with Mastra createTool. They never compute anything:
// each call returns the next committed fixture queued for that tool, so every condition
// and every run sees byte-identical tool outputs.
import { readFileSync } from 'node:fs'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

export const toolInputSchemas = {
  getOrder: z.object({ orderId: z.string().describe('Order ID, e.g. ORD-4471') }),
  getShipment: z.object({ orderId: z.string() }),
  getCustomer: z.object({ customerId: z.string() }),
  searchTickets: z.object({ query: z.string() }),
} as const
export type ToolName = keyof typeof toolInputSchemas

export const loadFixture = (name: string): unknown => JSON.parse(readFileSync(`fixtures/${name}.json`, 'utf8'))

export class FixtureQueue {
  private queues = new Map<ToolName, string[]>()
  push(tool: ToolName, fixture: string) {
    const q = this.queues.get(tool) ?? []
    q.push(fixture)
    this.queues.set(tool, q)
  }
  next(tool: ToolName): unknown {
    const name = this.queues.get(tool)?.shift()
    if (!name) throw new Error(`no fixture queued for ${tool}`)
    return loadFixture(name)
  }
}

export function makeTools(queue: FixtureQueue) {
  const make = (id: ToolName, description: string) =>
    createTool({ id, description, inputSchema: toolInputSchemas[id], execute: async () => queue.next(id) as any })
  return {
    getOrder: make('getOrder', 'Look up an order by ID'),
    getShipment: make('getShipment', 'Look up shipment and tracking for an order'),
    getCustomer: make('getCustomer', 'Look up a customer profile'),
    searchTickets: make('searchTickets', 'Search support tickets and refunds'),
  }
}
