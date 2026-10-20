// Builds audit/planted.json: 40 answers with labels we wrote ourselves, used to measure
// both scorers before any of their grades count.
//   pnpm build:audit
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Case, type Expected, type Label } from '../src/schema.js'
import { nearMiss } from '../src/tools/fixtures.js'

const CASES = ['exact-001', 'exact-002', 'exact-003', 'exact-004', 'exact-005', 'temporal-004', 'multi-001', 'update-001', 'distractor-001', 'distractor-005']

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
function words(n: number): string {
  if (n < 20) return ONES[n]!
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? `-${ONES[n % 10]}` : '')
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${words(n % 100)}` : ''}`
  return `${words(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${words(n % 1000)}` : ''}`
}
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth']
const ordinal = (d: number) => (d <= 20 ? ORD[d]! : d === 30 ? 'thirtieth' : `${TENS[Math.floor(d / 10)]}-${ORD[d % 10]}`)
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// paraphrase: semantically identifies the value but is not a verbatim copy
function paraphrase(e: Expected): string {
  if (e.type === 'number') {
    const d = Math.floor(e.value), c = Math.round((e.value - d) * 100)
    return `That came to ${words(d)} dollars${c ? ` and ${words(c)} cents` : ''}.`
  }
  if (e.type === 'date') {
    const [, m, d] = e.value.split('-').map(Number)
    return `It was delivered on the ${ordinal(d!)} of ${MONTH[m! - 1]}.`
  }
  if (e.type !== 'exact') throw new Error('unsupported')
  const v = e.value
  if (/^ORD-/.test(v)) return `It was order number ${v.slice(4)}.`
  if (/^TKT-/.test(v)) return `Your refund is ticket ${v.slice(4)}.`
  if (v.includes('@')) return `We have ${v.replace('@', ' at ').replace(/\./g, ' dot ')} on file.`
  if (/^\d+ /.test(v)) {
    const [num, ...street] = v.split(' ')
    return `It's going to number ${num} on ${street.join(' ')}.`
  }
  return `It's the one ending in ${v.slice(-4)}.`
}
function near(e: Expected): string {
  if (e.type === 'number') return `It was $${nearMiss(e.value.toFixed(2))}.`
  if (e.type === 'date') {
    const d = new Date(e.value + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    return `It was delivered on ${d.toISOString().slice(0, 10)}.`
  }
  if (e.type !== 'exact') throw new Error('unsupported')
  return `It's ${nearMiss(e.value)}.`
}
const verbatim = (e: Expected) =>
  e.type === 'number' ? `It was $${e.value.toFixed(2)}.` : e.type === 'date' ? `It was delivered on ${e.value}.` : `It's ${(e as { value: string }).value}.`

const planted: { id: string; caseId: string; set: string; answer: string; label: Label }[] = []
for (const id of CASES) {
  const c = Case.parse(JSON.parse(readFileSync(`cases/${id}.json`, 'utf8')))
  planted.push(
    { id: `${id}-verbatim`, caseId: id, set: 'correct_verbatim', answer: verbatim(c.expected), label: 'correct' },
    { id: `${id}-paraphrased`, caseId: id, set: 'correct_paraphrased', answer: paraphrase(c.expected), label: 'correct' },
    { id: `${id}-nearmiss`, caseId: id, set: 'near_miss', answer: near(c.expected), label: 'silent_failure' },
    { id: `${id}-hedged`, caseId: id, set: 'hedged', answer: "I'm not sure, possibly the one from the earlier lookup, but I can't confirm it.", label: 'abstained' },
  )
}
mkdirSync('audit', { recursive: true })
writeFileSync('audit/planted.json', JSON.stringify(planted, null, 2) + '\n')
console.log(`wrote ${planted.length} planted answers`)
