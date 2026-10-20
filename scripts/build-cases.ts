// Builds cases/*.json and fixtures/*.json from the authored case table below, with a
// fixed seed. Run once, inspect, commit. Re-running with the same seed is byte-identical.
//   pnpm build:cases
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { estimateTokenCount } from 'tokenx'
import { Case, type Category, type Expected, type Turn } from '../src/schema.js'
import {
  type Address, type Rng, type Size, type Ticket,
  customerFixture, fmtAddress, genTracking, int, mulberry32, nearMiss, orderFixture, pick, shipmentFixture, ticketsFixture,
} from '../src/tools/fixtures.js'

const SEED = 20261020
const MAX_THREAD_TOKENS = 11_000

const PRODUCTS = [
  ['headphones', 'wireless headphones', 'HD-220', 149.99], ['charger', '65W charger', 'CH-65W', 39.99],
  ['case', 'phone case', 'PC-11P', 24.99], ['keyboard', 'mechanical keyboard', 'KB-87T', 119.0],
  ['monitor', '27-inch monitor', 'MN-27Q', 329.0], ['backpack', 'travel backpack', 'BP-30L', 89.5],
  ['smartwatch', 'smartwatch', 'SW-44A', 249.0], ['webcam', '1080p webcam', 'WC-1080', 69.99],
  ['speaker', 'bluetooth speaker', 'SP-BT5', 59.95], ['mouse', 'ergonomic mouse', 'MS-ERG', 49.99],
  ['desk lamp', 'LED desk lamp', 'LP-LED', 34.5], ['tripod', 'aluminum tripod', 'TP-ALU', 45.0],
  ['SSD', '1TB portable SSD', 'SD-1TB', 109.99], ['router', 'wifi router', 'RT-AX6', 179.0],
  ['earbuds', 'noise-cancelling earbuds', 'EB-ANC', 199.0], ['power bank', '20000mAh power bank', 'PB-20K', 42.99],
] as const
// Filler sessions only ever mention these, so a key product is never ambiguous.
const FILLER_PRODUCTS = [
  ['HDMI cable', 'braided HDMI cable', 'HC-2M', 14.99], ['laptop stand', 'aluminum laptop stand', 'LS-ADJ', 39.0],
  ['USB-C hub', '7-port USB-C hub', 'UH-7P', 54.99], ['screen protector', 'tempered glass screen protector', 'SP-GL2', 12.99],
  ['desk mat', 'felt desk mat', 'DM-90', 29.0], ['water bottle', 'insulated water bottle', 'WB-1L', 27.5],
  ['coffee grinder', 'burr coffee grinder', 'CG-BR1', 89.0], ['cable organizer', 'cable organizer kit', 'CO-KIT', 18.0],
] as const
type Product = { short: string; full: string; sku: string; price: number }
const product = (i: number): Product => {
  const p = PRODUCTS[i % PRODUCTS.length]!
  return { short: p[0], full: p[1], sku: p[2], price: p[3] }
}

const NAMES = ['Maya Patel', 'Daniel Okafor', 'Sofia Rossi', 'Liam Chen', 'Aisha Rahman', 'Noah Fischer', 'Elena Petrova', 'Marcus Reed', 'Priya Nair', 'Tomas Garcia', 'Hannah Kim', 'Omar Haddad', 'Grace Mensah', 'Lucas Moreau', 'Yuki Tanaka', 'Zara Ahmed']
const STREETS = ['Maple Ave', 'Harbor St', 'Juniper Ln', 'Cedar Ridge Rd', 'Willow Ct', 'Lakeview Dr', 'Orchard Way', 'Granite Blvd', 'Sparrow Pl', 'Beacon St', 'Foxglove Ter', 'Copper Mill Rd']
const CITIES = [['Austin', 'TX', '787'], ['Denver', 'CO', '802'], ['Portland', 'OR', '972'], ['Raleigh', 'NC', '276'], ['Madison', 'WI', '537'], ['Tucson', 'AZ', '857'], ['Columbus', 'OH', '432'], ['Boise', 'ID', '837']] as const
const CARRIERS = ['DHL', 'UPS', 'USPS', 'FedEx'] as const
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const rng: Rng = mulberry32(SEED)
const fixtures = new Map<string, unknown>()
const usedOrderIds = new Set<string>()

function address(): Address {
  const c = pick(rng, CITIES)
  return { line1: `${int(rng, 100, 9899)} ${pick(rng, STREETS)}`, city: c[0], state: c[1], zip: `${c[2]}${int(rng, 10, 99)}` }
}
function orderId(): string {
  for (;;) {
    const id = `ORD-${int(rng, 1000, 9999)}`
    if (!usedOrderIds.has(id) && !usedOrderIds.has(nearMiss(id))) return usedOrderIds.add(id), id
  }
}
const addDays = (iso: string, d: number) => new Date(new Date(iso).getTime() + d * 864e5).toISOString()
const ymd = (iso: string) => iso.slice(0, 10)
const money = (n: number) => +n.toFixed(2)

interface Customer { id: string; name: string; email: string; phone: string; address: Address }
function customer(name = pick(rng, NAMES)): Customer {
  const [first, last] = name.toLowerCase().split(' ')
  return {
    id: `CUS-${int(rng, 10000, 99999)}`,
    name,
    email: `${first}.${last}${int(rng, 1, 99)}@${pick(rng, ['gmail.com', 'outlook.com', 'proton.me', 'fastmail.com'])}`,
    phone: `+1-555-${int(rng, 100, 999)}-${int(rng, 1000, 9999)}`,
    address: address(),
  }
}

// One case under construction: sessions, fixtures and helpers that emit tool turns.
class B {
  sessions: { at: string; turns: Turn[] }[] = []
  private n = 0
  private fillerProducts: Product[] = FILLER_PRODUCTS.map(p => ({ short: p[0], full: p[1], sku: p[2], price: p[3] }))
  constructor(public id: string, public cust: Customer, public start: string) {}
  private fx(obj: unknown) {
    const name = `${this.id}-${String(++this.n).padStart(2, '0')}`
    fixtures.set(name, obj)
    return name
  }
  session(turns: Turn[]) {
    const prev = this.sessions.at(-1)?.at ?? this.start
    const at = this.sessions.length === 0 ? this.start : addDays(prev, int(rng, 2, 5))
    this.sessions.push({ at, turns })
    return at
  }
  get nextAt() {
    const prev = this.sessions.at(-1)?.at
    return prev ? addDays(prev, 3) : this.start
  }
  user = (text: string): Turn => ({ role: 'user', text })
  asst = (text: string): Turn => ({ role: 'assistant', text })
  order(o: { id: string; p: Product; placedAt: string; status: string; shipTo?: Address; qty?: number }, size: Size = 'small') {
    const { fixture, total } = orderFixture(rng, { orderId: o.id, customerId: this.cust.id, item: o.p.full, sku: o.p.sku, price: o.p.price, qty: o.qty ?? 1, placedAt: o.placedAt, status: o.status, shipTo: o.shipTo ?? this.cust.address }, size)
    const turn: Turn = { role: 'tool', name: 'getOrder', args: { orderId: o.id }, fixture: this.fx(fixture) }
    return { turn, total, subtotal: money(o.p.price * (o.qty ?? 1)) }
  }
  shipment(s: Parameters<typeof shipmentFixture>[1], size: Size = 'small'): Turn {
    return { role: 'tool', name: 'getShipment', args: { orderId: s.orderId }, fixture: this.fx(shipmentFixture(rng, s, size, this.nextAt)) }
  }
  customerLookup(c: Customer = this.cust, size: Size = 'small'): Turn {
    return { role: 'tool', name: 'getCustomer', args: { customerId: c.id }, fixture: this.fx(customerFixture(rng, { customerId: c.id, name: c.name, email: c.email, phone: c.phone, address: c.address, since: '2023-04-11' }, size, this.nextAt)) }
  }
  tickets(query: string, tickets: Ticket[], size: Size = 'small'): Turn {
    return { role: 'tool', name: 'searchTickets', args: { query }, fixture: this.fx(ticketsFixture(rng, { query, tickets }, size, this.nextAt)) }
  }
  ticketId = () => `TKT-${int(rng, 100000, 999999)}`
  // Filler sessions: unrelated but realistic support traffic, 2-3 tool calls each.
  filler(size: Size = 'small') {
    const kind = int(rng, 0, 2)
    const p = this.fillerProducts.splice(int(rng, 0, this.fillerProducts.length - 1), 1)[0]!
    const at = this.nextAt
    if (kind === 0) {
      const oid = orderId()
      const carrier = pick(rng, CARRIERS)
      this.session([
        this.user(`Hey, can you check where my ${p.short} order is?`),
        this.order({ id: oid, p, placedAt: addDays(at, -4), status: 'shipped' }, size).turn,
        this.shipment({ orderId: oid, carrier, tracking: genTracking(rng, carrier), status: 'in_transit', eta: addDays(at, 2), deliveredAt: null, destination: this.cust.address }),
        this.asst(`It shipped with ${carrier} and is on schedule for ${pick(rng, WEEKDAYS)}.`),
      ])
    } else if (kind === 1) {
      this.session([
        this.user('Can you make sure my account details are up to date? Also, do I have any open tickets?'),
        this.customerLookup(this.cust, size),
        this.tickets('open tickets', [{ id: this.ticketId(), orderId: '-', type: pick(rng, ['login_issue', 'address_book', 'newsletter']), status: 'open', refundAmount: null, createdAt: addDays(at, -6), summary: 'Customer reported a minor account issue.' }]),
        this.asst('Your profile looks current, and you have one open account ticket that our team is working on.'),
      ])
    } else {
      const oid = orderId()
      this.session([
        this.user(`I'm thinking of buying another ${p.short}. What did I order last time, and is it delivered?`),
        this.order({ id: oid, p, placedAt: addDays(at, -30), status: 'delivered' }, size).turn,
        this.tickets(`${p.short} order history`, []),
        this.asst(`Your last ${p.short} order was delivered without any issues, and there are no tickets on it.`),
      ])
    }
  }
  fillers(n: number, largeOne = false) {
    for (let i = 0; i < n; i++) this.filler(largeOne && i === 0 ? 'large' : 'small')
  }
}

type Spec = {
  category: Category
  outputSize: Size
  position: 'pre_reflection' | 'post_reflection'
  userRepeated: boolean
  updateSource?: 'user' | 'tool'
  build: (b: B, ctx: Spec) => { question: string; expected: Expected; distractors: string[] }
}

const confirm = (b: B, value: string) => {
  b.session([b.user(`Quick check before I file this away: the reference is ${value}, right?`), b.asst('Yes, that matches what I have.')])
}

// ---- exact_value: one value from one earlier tool result ----
function exactTracking(b: B, s: Spec, p: Product) {
  const oid = orderId()
  const carrier = pick(rng, CARRIERS)
  const tracking = genTracking(rng, carrier)
  const keyAt = b.nextAt
  const key = (): Turn[] => [
    b.user(`Can you check on my ${p.short} order?`),
    b.order({ id: oid, p, placedAt: addDays(keyAt, -3), status: 'shipped' }).turn,
    b.shipment({ orderId: oid, carrier, tracking, status: 'in_transit', eta: addDays(keyAt, 3), deliveredAt: null, destination: b.cust.address }, s.outputSize),
    b.asst(`It's in transit with ${carrier}, arriving ${pick(rng, WEEKDAYS)}.`),
  ]
  placeKey(b, s, key, tracking)
  return { question: `What's the tracking number for my ${p.short}?`, expected: { type: 'exact', value: tracking } as Expected, distractors: [nearMiss(tracking)] }
}
function exactTotal(b: B, s: Spec, p: Product) {
  const oid = orderId()
  let total = 0, subtotal = 0
  const keyAt = b.nextAt
  const key = (): Turn[] => {
    const o = b.order({ id: oid, p, placedAt: addDays(keyAt, -2), status: 'processing', qty: 2 }, s.outputSize)
    total = o.total; subtotal = o.subtotal
    return [
      b.user(`I need to double-check what I was charged for the ${p.short}s I ordered.`),
      o.turn,
      b.tickets(`${p.short} billing`, []),
      b.asst('The payment was captured normally and there are no billing tickets on it.'),
    ]
  }
  placeKey(b, s, key, () => `$${total.toFixed(2)}`)
  return { question: `How much was I charged in total for the ${p.short} order?`, expected: { type: 'number', value: total } as Expected, distractors: [subtotal.toFixed(2)] }
}
function exactTicket(b: B, s: Spec, p: Product) {
  const oid = orderId()
  const tid = b.ticketId()
  const keyAt = b.nextAt
  const key = (): Turn[] => [
    b.user(`Did my refund request for the ${p.short} go through?`),
    b.tickets(`${p.short} refund`, [{ id: tid, orderId: oid, type: 'refund', status: 'approved', refundAmount: p.price, createdAt: addDays(keyAt, -1), summary: `Refund requested for ${p.full}, item returned unopened.` }], s.outputSize),
    b.order({ id: oid, p, placedAt: addDays(keyAt, -20), status: 'returned' }).turn,
    b.asst('Yes, it was approved and is being processed back to your card.'),
  ]
  placeKey(b, s, key, tid)
  return { question: `What's the ticket number for my ${p.short} refund?`, expected: { type: 'exact', value: tid } as Expected, distractors: [nearMiss(tid)] }
}
function exactStreet(b: B, s: Spec, p: Product) {
  const oid = orderId()
  const office = address()
  const carrier = pick(rng, CARRIERS)
  const keyAt = b.nextAt
  // the default address shows up in a profile lookup, so it is a real distractor
  b.session([b.user('Can you confirm my profile and any open tickets?'), b.customerLookup(), b.tickets('open tickets', []), b.asst('Your profile looks good and nothing is open.')])
  const key = (): Turn[] => [
    b.user(`Is my ${p.short} shipment on the way?`),
    b.order({ id: oid, p, placedAt: addDays(keyAt, -2), status: 'shipped', shipTo: office }).turn,
    b.shipment({ orderId: oid, carrier, tracking: genTracking(rng, carrier), status: 'in_transit', eta: addDays(keyAt, 2), deliveredAt: null, destination: office }, s.outputSize),
    b.asst(`Yes, it's on its way with ${carrier} and should arrive ${pick(rng, WEEKDAYS)}.`),
  ]
  placeKey(b, s, key, office.line1)
  return { question: `What street address is my ${p.short} being shipped to?`, expected: { type: 'exact', value: office.line1 } as Expected, distractors: [b.cust.address.line1] }
}
function exactOrderId(b: B, s: Spec, p: Product) {
  const oid = orderId()
  const keyAt = b.nextAt
  const key = (): Turn[] => [
    b.user(`I bought a ${p.short} a while back. Can you find that order and tell me if it's under warranty?`),
    b.order({ id: oid, p, placedAt: addDays(keyAt, -70), status: 'delivered' }, s.outputSize).turn,
    b.tickets(`${p.short} warranty`, []),
    b.asst("Found it. It was delivered about two months ago, so it's still inside the one-year warranty."),
  ]
  placeKey(b, s, key, oid)
  return { question: `What was the order number for my ${p.short}?`, expected: { type: 'exact', value: oid } as Expected, distractors: [nearMiss(oid)] }
}

// Places the key session early (session 1) or last, padding with fillers to 5 sessions.
function placeKey(b: B, s: Spec, key: () => Turn[], value: string | (() => string)) {
  const v = () => (typeof value === 'function' ? value() : value)
  if (s.position === 'pre_reflection') {
    b.session(key())
    if (s.userRepeated) confirm(b, v())
    b.fillers(s.userRepeated ? 3 : 4, true)
  } else {
    b.fillers(3, true)
    b.session(key())
    if (s.userRepeated) confirm(b, v())
  }
}

// ---- multi_session: combine 2-3 values from different sessions ----
function refundSum(b: B, s: Spec, n: number, withDenied: boolean, ps: Product[]) {
  const approved: number[] = []
  let denied = 0
  for (let i = 0; i < n; i++) {
    const p = ps[i]!
    const oid = orderId()
    const amt = money(p.price)
    approved.push(amt)
    b.session([
      b.user(`I sent back the ${p.short}. Has the refund been issued?`),
      b.tickets(`${p.short} refund`, [{ id: b.ticketId(), orderId: oid, type: 'refund', status: 'approved', refundAmount: amt, createdAt: addDays(b.nextAt, -1), summary: `Refund for returned ${p.full}.` }], i === 0 ? s.outputSize : 'small'),
      b.order({ id: oid, p, placedAt: addDays(b.nextAt, -15), status: 'returned' }).turn,
      b.asst('Yes, that refund is approved and should reach your card in 3-5 business days.'),
    ])
    if (i === 0) b.filler()
  }
  if (withDenied) {
    const p = ps[n]!
    const oid = orderId()
    denied = money(p.price)
    b.session([
      b.user(`And the ${p.short} I returned, what happened with that one?`),
      b.tickets(`${p.short} refund`, [{ id: b.ticketId(), orderId: oid, type: 'refund', status: 'denied', refundAmount: denied, createdAt: addDays(b.nextAt, -1), summary: 'Return received outside the 30-day window; refund request denied.' }]),
      b.order({ id: oid, p, placedAt: addDays(b.nextAt, -60), status: 'delivered' }).turn,
      b.asst("Unfortunately that one arrived outside the return window, so it wasn't approved."),
    ])
  }
  b.filler()
  const total = money(approved.reduce((a, x) => a + x, 0))
  return {
    question: 'How much have I been refunded in total so far?',
    expected: { type: 'number', value: total } as Expected,
    distractors: withDenied ? [money(total + denied).toFixed(2)] : [money(total - approved.at(-1)!).toFixed(2)],
  }
}
function orderSum(b: B, s: Spec, pa: Product, pb: Product) {
  const totals: number[] = []
  const subs: number[] = []
  for (const [i, p] of [pa, pb].entries()) {
    const o = b.order({ id: orderId(), p, placedAt: addDays(b.nextAt, -5), status: 'delivered' }, i === 0 ? s.outputSize : 'small')
    totals.push(o.total); subs.push(o.subtotal)
    b.session([b.user(`Can you pull up my ${p.short} order? I'm doing my expense report.`), o.turn, b.tickets(`${p.short} invoice`, []), b.asst("Here it is. It's delivered and the invoice is attached to your account.")])
    b.filler(i === 0 ? 'large' : 'small')
  }
  return {
    question: `How much did I spend in total on the ${pa.short} and ${pb.short} orders combined?`,
    expected: { type: 'number', value: money(totals[0]! + totals[1]!) } as Expected,
    distractors: [money(subs[0]! + subs[1]!).toFixed(2)],
  }
}

// ---- knowledge_update: a value that changed later ----
function addressUpdate(b: B, s: Spec, p: Product) {
  const oid = orderId()
  const carrier = pick(rng, CARRIERS)
  const tracking = genTracking(rng, carrier)
  const old = b.cust.address
  const neu = address()
  b.session([
    b.user(`My ${p.short} arrived broken. Can you set up a replacement?`),
    b.order({ id: oid, p, placedAt: b.nextAt, status: 'processing', shipTo: old }, s.outputSize).turn,
    b.shipment({ orderId: oid, carrier, tracking, status: 'label_created', eta: addDays(b.nextAt, 6), deliveredAt: null, destination: old }),
    b.asst("Done, the replacement is created and a shipping label is ready. It'll go out in a couple of days."),
  ])
  b.filler()
  if (s.updateSource === 'user') {
    b.session([
      b.user(`Can you pull up my replacement ${p.short} order?`),
      b.order({ id: oid, p, placedAt: addDays(b.nextAt, -7), status: 'processing', shipTo: old }).turn,
      b.asst("Found it. It hasn't left the warehouse yet."),
      b.user(`Good. I just moved, so please send it to ${fmtAddress(neu)} instead.`),
      b.asst("Done, I've updated the shipping address on the replacement."),
    ])
  } else {
    b.session([
      b.user(`Any update on my replacement ${p.short}?`),
      b.shipment({ orderId: oid, carrier, tracking, status: 'in_transit', eta: addDays(b.nextAt, 2), deliveredAt: null, destination: neu, note: 'Destination updated via carrier portal (customer-initiated redirect).' }, s.outputSize),
      b.tickets(`${p.short} replacement`, []),
      b.asst(`It's moving and should arrive ${pick(rng, WEEKDAYS)}.`),
    ])
  }
  b.fillers(2)
  return { question: `Where is my replacement ${p.short} shipping to? Just the street address.`, expected: { type: 'exact', value: neu.line1 } as Expected, distractors: [old.line1] }
}
function trackingUpdate(b: B, s: Spec, p: Product) {
  const oid = orderId()
  const carrier = pick(rng, CARRIERS)
  const t1 = genTracking(rng, carrier)
  const t2 = genTracking(rng, carrier)
  b.session([
    b.user(`Where's my ${p.short}?`),
    b.order({ id: oid, p, placedAt: addDays(b.nextAt, -2), status: 'shipped' }).turn,
    b.shipment({ orderId: oid, carrier, tracking: t1, status: 'in_transit', eta: addDays(b.nextAt, 3), deliveredAt: null, destination: b.cust.address }, s.outputSize),
    b.asst(`It's with ${carrier} and on its way.`),
  ])
  b.filler(s.outputSize === 'small' ? 'large' : 'small')
  if (s.updateSource === 'user') {
    b.session([b.user(`The carrier emailed me that my ${p.short} was relabeled. The new tracking number is ${t2}.`), b.shipment({ orderId: oid, carrier, tracking: t1, status: 'exception', eta: null, deliveredAt: null, destination: b.cust.address }), b.asst("Thanks, I've noted the new label. Our system still shows the exception on the old one, which is expected.")])
  } else {
    b.session([b.user(`Is the ${p.short} still delayed?`), b.shipment({ orderId: oid, carrier, tracking: t2, status: 'in_transit', eta: addDays(b.nextAt, 2), deliveredAt: null, destination: b.cust.address, note: `Package relabeled after damage at sort facility; previous label ${t1} voided.` }, s.outputSize), b.asst("It's moving again and should arrive soon.")])
  }
  b.fillers(2)
  return { question: `What's the current tracking number for my ${p.short}?`, expected: { type: 'exact', value: t2 } as Expected, distractors: [t1] }
}

// ---- temporal: dates and ordering across sessions ----
function arrivalOrder(b: B, s: Spec, pa: Product, pb: Product, reverse: boolean) {
  // pa is discussed first; when reverse, pb was actually delivered earlier
  const first = b.nextAt
  const da = addDays(first, reverse ? -1 : -6)
  const db = addDays(first, reverse ? -9 : 2)
  for (const [i, [p, d]] of ([[pa, da], [pb, db]] as const).entries()) {
    const oid = orderId()
    const carrier = pick(rng, CARRIERS)
    b.session([
      b.user(`Did my ${p.short} get delivered?`),
      b.order({ id: oid, p, placedAt: addDays(d, -4), status: 'delivered' }).turn,
      b.shipment({ orderId: oid, carrier, tracking: genTracking(rng, carrier), status: 'delivered', eta: d, deliveredAt: d, destination: b.cust.address }, i === 0 ? s.outputSize : 'small'),
      b.asst('Yes, the carrier shows it as delivered to your front door.'),
    ])
    b.filler(i === 0 ? 'large' : 'small')
  }
  b.filler()
  const winner = new Date(da) < new Date(db) ? pa.short : pb.short
  return { question: `Which arrived first, the ${pa.short} or the ${pb.short}?`, expected: { type: 'choice', value: winner, options: [pa.short, pb.short] } as Expected, distractors: [] }
}
function deliveryDate(b: B, s: Spec, p: Product) {
  const oid = orderId()
  const carrier = pick(rng, CARRIERS)
  const at = b.nextAt
  const delivered = addDays(at, -int(rng, 2, 4))
  const eta = addDays(delivered, -2)
  const key = (): Turn[] => [
    b.user(`My ${p.short} took a while. Did it finally arrive?`),
    b.shipment({ orderId: oid, carrier, tracking: genTracking(rng, carrier), status: 'delivered', eta, deliveredAt: delivered, destination: b.cust.address }, s.outputSize),
    b.order({ id: oid, p, placedAt: addDays(eta, -5), status: 'delivered' }).turn,
    b.asst("Yes, it was delivered, a little later than the original estimate. Sorry about the delay."),
  ]
  placeKey(b, s, key, ymd(delivered))
  return { question: `On what date was my ${p.short} delivered?`, expected: { type: 'date', value: ymd(delivered) } as Expected, distractors: [ymd(eta)] }
}

// ---- distractor: near-duplicate IDs, similar names ----
function nearDupTracking(b: B, s: Spec, pa: Product, pb: Product) {
  const ida = orderId()
  const idb = nearMiss(ida)
  usedOrderIds.add(idb)
  const carrier = pick(rng, CARRIERS)
  const ta = genTracking(rng, carrier)
  const tb = genTracking(rng, carrier)
  const [askA] = [rng() > 0.5]
  for (const [i, [id, p, t]] of ([[ida, pa, ta], [idb, pb, tb]] as const).entries()) {
    b.session([
      b.user(`Can you check ${id}? That's my ${p.short}.`),
      b.order({ id, p, placedAt: addDays(b.nextAt, -3), status: 'shipped' }).turn,
      b.shipment({ orderId: id, carrier, tracking: t, status: 'in_transit', eta: addDays(b.nextAt, 2), deliveredAt: null, destination: b.cust.address }, i === 0 ? s.outputSize : 'small'),
      b.asst(`${id} is in transit with ${carrier}.`),
    ])
    b.filler()
  }
  const [qid, exp, other] = askA ? [ida, ta, tb] : [idb, tb, ta]
  return { question: `What's the tracking number for ${qid}?`, expected: { type: 'exact', value: exp } as Expected, distractors: [other, nearMiss(exp)] }
}
function nearDupRefund(b: B, s: Spec, pa: Product, pb: Product) {
  const ida = orderId()
  const idb = nearMiss(ida)
  usedOrderIds.add(idb)
  const amounts = [money(pa.price), money(pb.price * 0.5)]
  for (const [i, [id, p, amt]] of ([[ida, pa, amounts[0]!], [idb, pb, amounts[1]!]] as const).entries()) {
    b.session([
      b.user(`What's the status of the refund on ${id}?`),
      b.tickets(`refund ${id}`, [{ id: b.ticketId(), orderId: id, type: 'refund', status: 'approved', refundAmount: amt, createdAt: addDays(b.nextAt, -2), summary: i === 0 ? `Full refund for ${p.full}.` : `Partial refund for ${p.full} (cosmetic damage).` }], i === 0 ? s.outputSize : 'small'),
      b.order({ id, p, placedAt: addDays(b.nextAt, -14), status: 'returned' }).turn,
      b.asst('That refund is approved and on its way back to your card.'),
    ])
    b.filler()
  }
  return { question: `How much was refunded on ${idb}?`, expected: { type: 'number', value: amounts[1]! } as Expected, distractors: [amounts[0]!.toFixed(2)] }
}
function similarName(b: B, s: Spec, pair: [string, string]) {
  const target = customer(pair[0])
  const other = customer(pair[1])
  b.cust = other // the person writing in is the similar-named relative
  b.session([b.user(`I help manage my relative's account. Can you pull up ${target.name}, customer ID ${target.id}?`), b.customerLookup(target, s.outputSize), b.tickets(`${target.id} open tickets`, []), b.asst(`Got it, ${target.name}'s profile is active and there are no open tickets.`)])
  b.filler()
  b.session([b.user(`And can you check my own profile too? I'm ${other.name}, ${other.id}.`), b.customerLookup(other), b.tickets(`${other.id} open tickets`, []), b.asst('Your profile is active as well, nothing open.')])
  b.fillers(2)
  return { question: `What email address do you have on file for ${target.name}?`, expected: { type: 'exact', value: target.email } as Expected, distractors: [other.email] }
}

// ---- abstention: the answer is not in the thread ----
function abstain(b: B, s: Spec, p: Product, question: string) {
  const oid = orderId()
  b.session([
    b.user(`Can you look at my ${p.short} order?`),
    b.order({ id: oid, p, placedAt: addDays(b.nextAt, -10), status: 'delivered' }, s.outputSize).turn,
    b.shipment({ orderId: oid, carrier: 'UPS', tracking: genTracking(rng, 'UPS'), status: 'delivered', eta: addDays(b.nextAt, -6), deliveredAt: addDays(b.nextAt, -6), destination: b.cust.address }),
    b.asst('It was delivered last week. Let me know if anything is wrong with it.'),
  ])
  b.fillers(4, true)
  return { question: question.replace('{p}', p.short), expected: { type: 'abstain' } as Expected, distractors: [] }
}

// ---- the authored case table ----
const S = (category: Category, outputSize: Size, position: Spec['position'], userRepeated: boolean, build: Spec['build'], updateSource?: 'user' | 'tool'): Spec => ({ category, outputSize, position, userRepeated, build, updateSource })
const P = product
const SPECS: Spec[] = [
  // exact_value (10): 5 small / 5 large, 6 early / 4 late, 3 restated by the user
  S('exact_value', 'large', 'pre_reflection', false, (b, s) => exactTracking(b, s, P(0))),
  S('exact_value', 'small', 'pre_reflection', false, (b, s) => exactTotal(b, s, P(3))),
  S('exact_value', 'large', 'pre_reflection', true, (b, s) => exactTicket(b, s, P(5))),
  S('exact_value', 'small', 'pre_reflection', false, (b, s) => exactStreet(b, s, P(4))),
  S('exact_value', 'large', 'pre_reflection', false, (b, s) => exactOrderId(b, s, P(6))),
  S('exact_value', 'small', 'pre_reflection', true, (b, s) => exactTracking(b, s, P(9))),
  S('exact_value', 'large', 'post_reflection', false, (b, s) => exactTotal(b, s, P(12))),
  S('exact_value', 'small', 'post_reflection', false, (b, s) => exactTicket(b, s, P(14))),
  S('exact_value', 'large', 'post_reflection', true, (b, s) => exactStreet(b, s, P(13))),
  S('exact_value', 'small', 'post_reflection', false, (b, s) => exactOrderId(b, s, P(11))),
  // multi_session (8)
  S('multi_session', 'large', 'pre_reflection', false, (b, s) => refundSum(b, s, 2, true, [P(1), P(2), P(8)])),
  S('multi_session', 'small', 'pre_reflection', false, (b, s) => refundSum(b, s, 2, false, [P(7), P(10)])),
  S('multi_session', 'large', 'pre_reflection', false, (b, s) => refundSum(b, s, 3, true, [P(2), P(9), P(15), P(11)])),
  S('multi_session', 'small', 'pre_reflection', false, (b, s) => refundSum(b, s, 3, false, [P(1), P(5), P(8)])),
  S('multi_session', 'large', 'pre_reflection', false, (b, s) => refundSum(b, s, 2, true, [P(15), P(10), P(3)])),
  S('multi_session', 'small', 'pre_reflection', false, (b, s) => orderSum(b, s, P(4), P(7))),
  S('multi_session', 'large', 'pre_reflection', false, (b, s) => orderSum(b, s, P(13), P(1))),
  S('multi_session', 'small', 'pre_reflection', false, (b, s) => orderSum(b, s, P(6), P(12))),
  // knowledge_update (6): 3 user-stated, 3 tool-only
  S('knowledge_update', 'small', 'pre_reflection', false, (b, s) => addressUpdate(b, s, P(0)), 'user'),
  S('knowledge_update', 'large', 'pre_reflection', false, (b, s) => addressUpdate(b, s, P(4)), 'user'),
  S('knowledge_update', 'small', 'pre_reflection', false, (b, s) => trackingUpdate(b, s, P(6)), 'user'),
  S('knowledge_update', 'small', 'pre_reflection', false, (b, s) => addressUpdate(b, s, P(9)), 'tool'),
  S('knowledge_update', 'large', 'pre_reflection', false, (b, s) => addressUpdate(b, s, P(14)), 'tool'),
  S('knowledge_update', 'large', 'pre_reflection', false, (b, s) => trackingUpdate(b, s, P(12)), 'tool'),
  // temporal (6)
  S('temporal', 'small', 'pre_reflection', false, (b, s) => arrivalOrder(b, s, P(1), P(2), true)),
  S('temporal', 'large', 'pre_reflection', false, (b, s) => arrivalOrder(b, s, P(9), P(10), false)),
  S('temporal', 'small', 'pre_reflection', false, (b, s) => arrivalOrder(b, s, P(7), P(15), true)),
  S('temporal', 'large', 'pre_reflection', false, (b, s) => deliveryDate(b, s, P(3))),
  S('temporal', 'small', 'post_reflection', false, (b, s) => deliveryDate(b, s, P(8))),
  S('temporal', 'large', 'post_reflection', false, (b, s) => deliveryDate(b, s, P(11))),
  // distractor (6)
  S('distractor', 'small', 'pre_reflection', false, (b, s) => nearDupTracking(b, s, P(0), P(14))),
  S('distractor', 'large', 'pre_reflection', false, (b, s) => nearDupTracking(b, s, P(6), P(13))),
  S('distractor', 'small', 'pre_reflection', false, (b, s) => nearDupRefund(b, s, P(4), P(5))),
  S('distractor', 'large', 'pre_reflection', false, (b, s) => nearDupRefund(b, s, P(12), P(3))),
  S('distractor', 'small', 'pre_reflection', false, (b, s) => similarName(b, s, ['Jon Smyth', 'John Smith'])),
  S('distractor', 'large', 'pre_reflection', false, (b, s) => similarName(b, s, ['Katherine Lee', 'Catherine Leigh'])),
  // abstention (4)
  S('abstention', 'small', 'pre_reflection', false, (b, s) => abstain(b, s, P(5), 'What discount code did I use on my {p} order?')),
  S('abstention', 'large', 'pre_reflection', false, (b, s) => abstain(b, s, P(8), 'What gift message did I put on the {p} order?')),
  S('abstention', 'small', 'pre_reflection', false, (b, s) => abstain(b, s, P(10), "What was the delivery driver's name for my {p}?")),
  S('abstention', 'large', 'pre_reflection', false, (b, s) => abstain(b, s, P(2), 'What is the warranty registration number for my {p}?')),
]

const PREFIX: Record<Category, string> = { exact_value: 'exact', multi_session: 'multi', knowledge_update: 'update', temporal: 'temporal', distractor: 'distractor', abstention: 'abstain' }

rmSync('cases', { recursive: true, force: true })
rmSync('fixtures', { recursive: true, force: true })
mkdirSync('cases')
mkdirSync('fixtures')

const counts: Partial<Record<Category, number>> = {}
const stats: { id: string; sessions: number; tokens: number; tools: number }[] = []
SPECS.forEach((spec, i) => {
  counts[spec.category] = (counts[spec.category] ?? 0) + 1
  const id = `${PREFIX[spec.category]}-${String(counts[spec.category]).padStart(3, '0')}`
  const start = addDays('2026-09-01T15:00:00.000Z', i % 9)
  const b = new B(id, customer(), start)
  const { question, expected, distractors } = spec.build(b, spec)
  const c = Case.parse({
    id,
    category: spec.category,
    tags: { outputSize: spec.outputSize, position: spec.position, userRepeated: spec.userRepeated, ...(spec.updateSource ? { updateSource: spec.updateSource } : {}) },
    sessions: b.sessions,
    question,
    expected,
    distractors,
    abstainIsCorrect: expected.type === 'abstain',
  })
  // token count of everything the full-context condition will see
  let tokens = 0, tools = 0
  for (const s of c.sessions) for (const t of s.turns) {
    if (t.role === 'tool') { tools++; tokens += estimateTokenCount(JSON.stringify(fixtures.get(t.fixture)) + JSON.stringify(t.args)) }
    else tokens += estimateTokenCount(t.text)
  }
  if (tokens > MAX_THREAD_TOKENS) throw new Error(`${id} is ${tokens} tokens, over the ${MAX_THREAD_TOKENS} cap`)
  stats.push({ id, sessions: c.sessions.length, tokens, tools })
  writeFileSync(`cases/${id}.json`, JSON.stringify(c, null, 2) + '\n')
})
for (const [name, fx] of fixtures) writeFileSync(`fixtures/${name}.json`, JSON.stringify(fx, null, 2) + '\n')

const tok = stats.map(s => s.tokens).sort((a, b) => a - b)
console.log(`wrote ${stats.length} cases, ${fixtures.size} fixtures`)
console.log('by category:', counts)
console.log(`thread tokens: min ${tok[0]} median ${tok[Math.floor(tok.length / 2)]} max ${tok.at(-1)}`)
console.log(`sessions: ${Math.min(...stats.map(s => s.sessions))}-${Math.max(...stats.map(s => s.sessions))}, tool calls/thread: ${Math.min(...stats.map(s => s.tools))}-${Math.max(...stats.map(s => s.tools))}`)
