// Scorer audit: grade the 40 planted answers with both scorers and compare with the labels
// we wrote. The known-answer method, applied to the measuring tool itself.
//   pnpm audit:scorers              both scorers (judge needs ANTHROPIC_API_KEY)
//   pnpm audit:scorers --exact-only exact scorer only; exits 1 on a regression (CI)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Case, type Label } from './schema.js'
import { scoreExact } from './scorers/exact.js'
import { judgeLabel, judgeVerdict, spend } from './scorers/judge.js'
import { env } from './models.js'

const exactOnly = process.argv.includes('--exact-only')
const planted: { id: string; caseId: string; set: string; answer: string; label: Label }[] = JSON.parse(readFileSync('audit/planted.json', 'utf8'))
const cases = new Map<string, Case>()
const getCase = (id: string) => cases.get(id) ?? cases.set(id, Case.parse(JSON.parse(readFileSync(`cases/${id}.json`, 'utf8')))).get(id)!

const SETS = ['correct_verbatim', 'correct_paraphrased', 'near_miss', 'hedged'] as const
const rows: { id: string; set: string; truth: Label; exact: Label; judge: Label | null }[] = []
for (const p of planted) {
  const c = getCase(p.caseId)
  const exact = scoreExact(p.answer, c.expected, c.distractors).label
  const judge = exactOnly || !env.anthropicKey ? null : judgeLabel(await judgeVerdict({ question: c.question, expected: c.expected }, p.answer), c.expected)
  rows.push({ id: p.id, set: p.set, truth: p.label, exact, judge })
}

const agree = (k: 'exact' | 'judge', set: string) => {
  const r = rows.filter(x => x.set === set && x[k] !== null)
  return r.length ? r.filter(x => x[k] === x.truth).length / r.length : null
}
const passRate = (k: 'exact' | 'judge', set: string) => {
  const r = rows.filter(x => x.set === set && x[k] !== null)
  return r.length ? r.filter(x => x[k] === 'correct').length / r.length : null
}
// share of the 20 truly-correct answers a scorer fails to pass
const falseFail = (k: 'exact' | 'judge') => {
  const r = rows.filter(x => x.truth === 'correct' && x[k] !== null)
  return r.length ? r.filter(x => x[k] !== 'correct').length / r.length : null
}
const summary = {
  bySet: Object.fromEntries(SETS.map(s => [s, { exactAgreement: agree('exact', s), judgeAgreement: agree('judge', s) }])),
  exactFalseFailRate: falseFail('exact'),
  judgeFalseFailRate: falseFail('judge'),
  exactFalsePassRate: passRate('exact', 'near_miss'),
  judgeFalsePassRate: passRate('judge', 'near_miss'),
  // pre-registered: if the judge passes more than 1 in 10 near-misses, exact is primary
  primaryScorer: (passRate('judge', 'near_miss') ?? 1) > 0.1 ? 'exact' : 'judge',
  judgeModel: rows.some(r => r.judge) ? env.judgeModel : null,
  judgeUsd: +spend.usd.toFixed(5),
  rows,
}
mkdirSync('results', { recursive: true })
if (!exactOnly) writeFileSync('results/audit.json', JSON.stringify(summary, null, 2) + '\n')

const pct = (x: number | null | undefined) => (x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`)
console.log('Planted set            exact agrees   judge agrees')
for (const s of SETS) console.log(`${s.padEnd(22)} ${pct(summary.bySet[s].exactAgreement).padStart(12)} ${pct(summary.bySet[s].judgeAgreement).padStart(14)}`)
console.log(`false-pass on near-misses: exact ${pct(summary.exactFalsePassRate)}, judge ${pct(summary.judgeFalsePassRate)}`)
console.log(`primary scorer by the pre-registered rule: ${summary.primaryScorer}${summary.judgeModel ? '' : ' (judge not run)'}`)

if (exactOnly) {
  // regression guard: verbatim must pass, near-misses must fail, hedges must count as abstained
  const bad = rows.filter(r => r.set !== 'correct_paraphrased' && r.exact !== r.truth)
  for (const r of bad) console.error(`exact scorer mislabels ${r.id}: got ${r.exact}, want ${r.truth}`)
  process.exit(bad.length ? 1 : 0)
}
