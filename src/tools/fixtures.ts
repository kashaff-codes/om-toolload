// Fixture builders: realistic e-commerce API payloads with seeded noise, padded to a
// target token size. Generated once by scripts/build-cases.ts and committed.
import { estimateTokenCount } from 'tokenx'

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!
export const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))
const hex = (rng: Rng, n: number) => Array.from({ length: n }, () => '0123456789abcdef'[int(rng, 0, 15)]).join('')
const digits = (rng: Rng, n: number) => Array.from({ length: n }, () => String(int(rng, 0, 9))).join('')

export const SIZE_TARGET = { small: 450, large: 2200 } as const
export type Size = keyof typeof SIZE_TARGET

const WAREHOUSES = ['RNO-2', 'EWR-1', 'DFW-4', 'ATL-3', 'SEA-1', 'ORD-7']
const SKUS = ['HD-220', 'CH-65W', 'PC-11P', 'KB-87T', 'MN-27Q', 'BP-30L', 'SW-44A', 'WC-1080', 'SP-BT5', 'MS-ERG', 'LP-LED', 'TP-ALU', 'SD-1TB', 'RT-AX6', 'EB-ANC', 'PB-20K']
const EVENTS = ['label_created', 'picked_up', 'arrived_at_facility', 'departed_facility', 'in_transit', 'out_for_delivery']
const ACTORS = ['svc-fulfillment', 'svc-billing', 'svc-routing', 'agent-portal', 'svc-fraud-check', 'svc-notify']

function isoAt(rng: Rng, base: string, spreadDays: number) {
  const d = new Date(base)
  d.setUTCMinutes(d.getUTCMinutes() - int(rng, 0, spreadDays * 24 * 60))
  return d.toISOString()
}

function auditLog(rng: Rng, base: string, n: number) {
  return Array.from({ length: n }, () => ({
    at: isoAt(rng, base, 6),
    actor: pick(rng, ACTORS),
    action: pick(rng, ['read', 'update', 'sync', 'reindex', 'webhook_sent', 'cache_refresh']),
    request_id: `req_${hex(rng, 16)}`,
    latency_ms: int(rng, 3, 900),
  }))
}

function inventory(rng: Rng, n: number) {
  return Array.from({ length: n }, () => ({
    sku: pick(rng, SKUS),
    warehouse: pick(rng, WAREHOUSES),
    on_hand: int(rng, 0, 4000),
    reserved: int(rng, 0, 300),
    bin: `${pick(rng, ['A', 'B', 'C', 'D'])}${int(rng, 1, 40)}-${int(rng, 1, 9)}`,
  }))
}

function meta(rng: Rng) {
  return {
    api_version: '2026-07-01',
    request_id: `req_${hex(rng, 20)}`,
    region: pick(rng, ['us-east-1', 'us-west-2', 'eu-west-1']),
    cache: { hit: rng() > 0.5, ttl_s: int(rng, 30, 600), shard: int(rng, 1, 64) },
    rate_limit: { limit: 1000, remaining: int(rng, 100, 999), reset_s: int(rng, 1, 60) },
  }
}

// Grow noise arrays until the payload reaches the target size (tokenx estimate).
function padTo<T extends Record<string, unknown>>(rng: Rng, core: T, size: Size, base: string): T & Record<string, unknown> {
  const target = SIZE_TARGET[size]
  const out: Record<string, unknown> = { ...core, _meta: meta(rng) }
  const audit: unknown[] = []
  const inv: unknown[] = []
  out.audit_log = audit
  if (size === 'large') out.inventory_snapshot = inv
  let guard = 0
  while (estimateTokenCount(JSON.stringify(out)) < target && guard++ < 500) {
    if (size === 'large' && rng() < 0.5) inv.push(...inventory(rng, 1))
    else audit.push(...auditLog(rng, base, 1))
  }
  return out as T & Record<string, unknown>
}

export interface Address { line1: string; city: string; state: string; zip: string }
export const fmtAddress = (a: Address) => `${a.line1}, ${a.city}, ${a.state} ${a.zip}`

export function orderFixture(
  rng: Rng,
  o: { orderId: string; customerId: string; item: string; sku: string; price: number; qty: number; placedAt: string; status: string; shipTo: Address },
  size: Size,
) {
  const subtotal = +(o.price * o.qty).toFixed(2)
  const tax = +(subtotal * 0.0825).toFixed(2)
  const shipping = subtotal > 50 ? 0 : 5.99
  const total = +(subtotal + tax + shipping).toFixed(2)
  const fx = padTo(
    rng,
    {
      order_id: o.orderId,
      customer_id: o.customerId,
      status: o.status,
      placed_at: o.placedAt,
      currency: 'USD',
      line_items: [{ sku: o.sku, name: o.item, qty: o.qty, unit_price: o.price, fulfillment_center: pick(rng, WAREHOUSES) }],
      amounts: { subtotal, tax, shipping, total },
      payment: { method: pick(rng, ['card', 'paypal', 'apple_pay']), last4: digits(rng, 4), captured: true },
      ship_to: o.shipTo,
      flags: { fraud_score: +(rng() * 0.2).toFixed(3), priority: rng() > 0.8 },
    },
    size,
    o.placedAt,
  )
  return { fixture: fx, total }
}

export function shipmentFixture(
  rng: Rng,
  s: { orderId: string; carrier: string; tracking: string; status: string; eta: string | null; deliveredAt: string | null; destination: Address; note?: string },
  size: Size,
  base: string,
) {
  const events = Array.from({ length: int(rng, 3, 6) }, (_, i) => ({
    code: EVENTS[Math.min(i, EVENTS.length - 1)],
    at: isoAt(rng, base, 5),
    facility: `${pick(rng, WAREHOUSES)}-HUB`,
  }))
  return padTo(
    rng,
    {
      order_id: s.orderId,
      carrier: s.carrier,
      tracking_number: s.tracking,
      service_level: pick(rng, ['ground', 'express', '2day']),
      status: s.status,
      estimated_delivery: s.eta,
      delivered_at: s.deliveredAt,
      destination: s.destination,
      ...(s.note ? { routing_note: s.note } : {}),
      package: { weight_kg: +(rng() * 4 + 0.2).toFixed(2), dims_cm: [int(rng, 10, 60), int(rng, 10, 40), int(rng, 3, 30)] },
      events,
    },
    size,
    base,
  )
}

export function customerFixture(
  rng: Rng,
  c: { customerId: string; name: string; email: string; phone: string; address: Address; since: string },
  size: Size,
  base: string,
) {
  return padTo(
    rng,
    {
      customer_id: c.customerId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      default_address: c.address,
      member_since: c.since,
      tier: pick(rng, ['standard', 'plus', 'pro']),
      preferences: { marketing_opt_in: rng() > 0.5, sms: rng() > 0.7, language: 'en-US' },
    },
    size,
    base,
  )
}

export interface Ticket { id: string; orderId: string; type: string; status: string; refundAmount: number | null; createdAt: string; summary: string }

export function ticketsFixture(rng: Rng, q: { query: string; tickets: Ticket[] }, size: Size, base: string) {
  return padTo(
    rng,
    {
      query: q.query,
      total: q.tickets.length,
      results: q.tickets.map(t => ({
        ticket_id: t.id,
        order_id: t.orderId,
        type: t.type,
        status: t.status,
        refund_amount: t.refundAmount,
        created_at: t.createdAt,
        summary: t.summary,
        assignee: pick(rng, ['tier1-queue', 'tier2-queue', 'billing-queue']),
      })),
    },
    size,
    base,
  )
}

export const genTracking = (rng: Rng, carrier: string) => {
  switch (carrier) {
    case 'DHL':
      return `JD0146${digits(rng, 8)}`
    case 'UPS':
      return `1Z${hex(rng, 6).toUpperCase()}${digits(rng, 10)}`
    case 'USPS':
      return `9400${digits(rng, 18)}`
    default:
      return digits(rng, 12)
  }
}

// Near-miss: swap the last two distinct digits (ORD-4471 -> ORD-4417 style).
export function nearMiss(value: string): string {
  const idx: number[] = []
  for (let i = value.length - 1; i >= 0 && idx.length < 2; i--) {
    if (/\d/.test(value[i]!) && (idx.length === 0 || value[i] !== value[idx[0]!])) idx.push(i)
  }
  if (idx.length < 2) return value + '0'
  const a = value.split('')
  ;[a[idx[0]!], a[idx[1]!]] = [a[idx[1]!]!, a[idx[0]!]!]
  return a.join('')
}
