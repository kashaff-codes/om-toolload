import { describe, expect, it } from 'vitest'
import { datesIn, isAbstention, normalizeId, numbersIn, scoreExact, valuePresent } from '../src/scorers/exact.js'

describe('normalizers', () => {
  it('normalizes IDs across case, spacing and punctuation', () => {
    expect(normalizeId('ord - 4471')).toBe(normalizeId('ORD-4471'))
    expect(normalizeId('JD 0146 0000 6281')).toBe('jd014600006281')
  })
  it('parses money, skipping digits inside IDs', () => {
    expect(numbersIn('Refunded $1,234.50 on ORD-4471 and TKT-123456')).toEqual([1234.5])
    expect(numbersIn('two refunds: 39.99 and $24.99')).toEqual([39.99, 24.99])
  })
  it('parses common date formats', () => {
    expect(datesIn('It arrived on 2026-09-14.')).toEqual(['2026-09-14'])
    expect(datesIn('Delivered September 14th, 2026')).toEqual(['2026-09-14'])
    expect(datesIn('on the 3rd of Oct')).toEqual(['2026-10-03'])
    expect(datesIn('on 9/14')).toEqual(['2026-09-14'])
  })
  it('detects abstention', () => {
    expect(isAbstention("I don't know the discount code.")).toBe(true)
    expect(isAbstention('There is no record of a gift message.')).toBe(true)
    expect(isAbstention('It was JD014600006281.')).toBe(false)
    expect(isAbstention('{"name": "searchTickets", "parameters": {"query":"refund amount"}}\n{"name": "getOrder", "parameters": {"orderId":"ORD-8952"}}')).toBe(true)
  })
})

describe('valuePresent', () => {
  it('finds values in observation text and tool JSON', () => {
    expect(valuePresent('- 🔴 Tracking JD 0146 0000 6281 (DHL)', { type: 'exact', value: 'JD014600006281' })).toBe(true)
    expect(valuePresent('- order in transit with FedEx', { type: 'exact', value: 'JD014600006281' })).toBe(false)
    expect(valuePresent('{"refund_amount":64.98,"order_id":"ORD-4471"}', { type: 'number', value: 64.98 })).toBe(true)
    expect(valuePresent('"delivered_at":"2026-09-14T15:02:00Z"', { type: 'date', value: '2026-09-14' })).toBe(true)
    expect(valuePresent('anything', { type: 'abstain' })).toBe(null)
  })
})

describe('scoreExact', () => {
  const tracking = { type: 'exact' as const, value: 'JD014600006281' }
  it('passes the verbatim value', () => {
    expect(scoreExact('Your tracking number is JD014600006281.', tracking, ['JD014600006218']).label).toBe('correct')
  })
  it('fails a near-miss as a silent failure', () => {
    expect(scoreExact('It is JD014600006218.', tracking, ['JD014600006218']).label).toBe('silent_failure')
  })
  it('fails when the distractor is also stated', () => {
    expect(scoreExact('Either JD014600006281 or JD014600006218.', tracking, ['JD014600006218']).label).toBe('silent_failure')
  })
  it('labels a hedged wrong answer as abstained, not silent', () => {
    expect(scoreExact("I'm not sure, possibly the DHL one.", tracking, []).label).toBe('abstained')
  })
  it('compares amounts as numbers', () => {
    const e = { type: 'number' as const, value: 64.98 }
    expect(scoreExact('You were refunded $64.98 in total.', e, ['89.97']).label).toBe('correct')
    expect(scoreExact('You were refunded $89.97 in total.', e, ['89.97']).label).toBe('silent_failure')
    expect(scoreExact('A total of 64.98 dollars.', e, []).label).toBe('correct')
  })
  it('compares dates after parsing', () => {
    const e = { type: 'date' as const, value: '2026-09-14' }
    expect(scoreExact('It was delivered on September 14.', e, ['2026-09-12']).label).toBe('correct')
    expect(scoreExact('It was delivered on 2026-09-12.', e, ['2026-09-12']).label).toBe('silent_failure')
  })
  it('takes the first option mentioned for choice questions', () => {
    const e = { type: 'choice' as const, value: 'charger', options: ['charger', 'case'] }
    expect(scoreExact('The charger arrived first, then the case.', e, []).label).toBe('correct')
    expect(scoreExact('The case came before the charger.', e, []).label).toBe('silent_failure')
  })
  it('passes abstention cases only on an explicit abstention', () => {
    const e = { type: 'abstain' as const }
    expect(scoreExact("I don't know which discount code you used.", e, []).label).toBe('correct')
    expect(scoreExact('You used the code SAVE10.', e, []).label).toBe('silent_failure')
  })
})
