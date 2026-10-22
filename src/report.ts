// Builds results/summary.json and results/report.md from the ledger, and regenerates the
// README section between the report markers.
//   pnpm report                    latest run id per condition
//   pnpm report --run <id>[,<id>]  specific run ids
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { CONDITION_LABELS, type ConditionId } from './conditions.js'
import { Case, type Category, type Label, LedgerRow } from './schema.js'
import { bootstrapMean, mcnemar, mean, median, pairedBootstrap, sd } from './stats.js'

const { values: args } = parseArgs({ options: { run: { type: 'string' } } })

const all = readFileSync('results/ledger.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(l => LedgerRow.parse(JSON.parse(l)))
const audit = existsSync('results/audit.json') ? JSON.parse(readFileSync('results/audit.json', 'utf8')) : null
const primary: 'exact' | 'judge' = audit?.primaryScorer ?? 'exact'

// latest run id per condition unless given
let rows = all
if (args.run) rows = all.filter(r => args.run!.split(',').includes(r.runId))
else {
  const latest = new Map<string, string>()
  for (const r of all) if (!latest.has(r.condition) || r.runId > latest.get(r.condition)!) latest.set(r.condition, r.runId)
  rows = all.filter(r => latest.get(r.condition) === r.runId)
}
// a case run that failed twice can leave rows for the conditions answered before the
// failure, and other runs may have answered it fine; drop the case everywhere so every
// condition is compared on the same cases
const runIds = new Set(rows.map(r => r.runId))
const failed = existsSync('results/errors.jsonl') ? readFileSync('results/errors.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => runIds.has(e.runId)) : []
rows = rows.filter(r => !failed.some(e => e.run === r.run && e.caseId === r.caseId))
const label = (r: LedgerRow): Label => (primary === 'judge' ? r.judgeLabel ?? r.exactLabel : r.exactLabel)
const conds = (['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] as ConditionId[]).filter(k => rows.some(r => r.condition === k))
const cases = new Map(readFileSyncCases().map(c => [c.id, c]))
function readFileSyncCases() {
  return [...new Set(all.map(r => r.caseId))].map(id => Case.parse(JSON.parse(readFileSync(`cases/${id}.json`, 'utf8'))))
}
const caseIdsFor = (k: ConditionId) => [...new Set(rows.filter(r => r.condition === k).map(r => r.caseId))].sort()
// cases every listed condition answered, so comparisons are paired
const common = (ks: ConditionId[]) => caseIdsFor(ks[0]!).filter(id => ks.every(k => rows.some(r => r.condition === k && r.caseId === id)))

const perCase = (k: ConditionId, ids: string[], what: Label = 'correct') =>
  ids.map(id => mean(rows.filter(r => r.condition === k && r.caseId === id).map(r => (label(r) === what ? 1 : 0))))
const runAcc = (k: ConditionId) => {
  const runs = [...new Set(rows.filter(r => r.condition === k).map(r => r.run))]
  return runs.map(run => mean(rows.filter(r => r.condition === k && r.run === run).map(r => (label(r) === 'correct' ? 1 : 0))))
}
// with one run each per-case score is 0 or 1, so small groups read better as counts
const nRunsAll = Math.max(1, ...[...new Set(rows.map(r => r.condition))].map(k => new Set(rows.filter(r => r.condition === k).map(r => r.run)).size))
const share = (xs: number[]) => (!xs.length ? 'n/a' : nRunsAll === 1 ? `${xs.filter(x => x === 1).length} of ${xs.length}` : pct(mean(xs)))
const pct = (x: number) => (Number.isNaN(x) ? 'n/a' : `${(x * 100).toFixed(0)}%`)
const ci = (c: { point: number; lo: number; hi: number }) => `${pct(c.point)} [${pct(c.lo)}, ${pct(c.hi)}]`
const signed = (c: { point: number; lo: number; hi: number }) => {
  const f = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}`
  return `${f(c.point)} pts [${f(c.lo)}, ${f(c.hi)}]`
}
const num = (x: number) => (Number.isNaN(x) ? 'n/a' : Math.round(x).toLocaleString('en-US'))
const kRows = (k: ConditionId) => rows.filter(r => r.condition === k)

const out: string[] = []
const summary: Record<string, unknown> = { primaryScorer: primary, runIds: [...new Set(rows.map(r => r.runId))], versions: rows[0]?.versions }

// ---- main table ----
const nRuns = Math.max(...conds.map(k => runAcc(k).length))
out.push(`### Results (${caseIdsFor(conds[0]!).length} cases, ${nRuns} run${nRuns > 1 ? 's' : ''}, scored by the ${primary} scorer)\n`)
out.push('| Condition | Accuracy [95% CI] | Run SD | Silent failures | Abstained | Actor input tokens (median) | Input tokens per correct answer |')
out.push('|---|---|---|---|---|---|---|')
const main: Record<string, unknown> = {}
for (const k of conds) {
  const ids = caseIdsFor(k)
  const acc = bootstrapMean(perCase(k, ids))
  const silent = mean(perCase(k, ids, 'silent_failure'))
  const abst = mean(perCase(k, ids, 'abstained'))
  const tok = median(kRows(k).map(r => r.actorInputTokens))
  const correct = kRows(k).filter(r => label(r) === 'correct').length
  const perCorrect = correct ? kRows(k).reduce((a, r) => a + r.actorInputTokens, 0) / correct : NaN
  main[k] = { accuracy: acc, runSd: sd(runAcc(k)), silentFailureRate: silent, abstentionRate: abst, medianActorInputTokens: tok, inputTokensPerCorrect: perCorrect, n: ids.length }
  out.push(`| ${k} ${CONDITION_LABELS[k]} | ${ci(acc)} | ${runAcc(k).length > 1 ? `${(sd(runAcc(k)) * 100).toFixed(1)} pts` : '-'} | ${pct(silent)} | ${pct(abst)} | ${num(tok)} | ${num(perCorrect)} |`)
}
summary.main = main
writeFileSync('results/accuracy-vs-tokens.svg', chartSvg(conds.map(k => ({ k, acc: (main[k] as any).accuracy, tokens: (main[k] as any).medianActorInputTokens }))))
out.push(`\n![Accuracy against the median actor input tokens per question, with 95% CIs](results/accuracy-vs-tokens.svg)`)

// ---- by category ----
const CATS: Category[] = ['exact_value', 'multi_session', 'knowledge_update', 'temporal', 'distractor', 'abstention']
out.push('\n#### Accuracy by category\n')
out.push(`| Category | n | ${conds.join(' | ')} |`)
out.push(`|---|---|${conds.map(() => '---').join('|')}|`)
const byCat: Record<string, unknown> = {}
for (const cat of CATS) {
  const ids = caseIdsFor(conds[0]!).filter(id => cases.get(id)?.category === cat)
  if (!ids.length) continue
  const cells = conds.map(k => {
    const xs = perCase(k, ids.filter(id => caseIdsFor(k).includes(id)))
    return share(xs)
  })
  byCat[cat] = Object.fromEntries(conds.map((k, i) => [k, cells[i]]))
  out.push(`| ${cat} | ${ids.length} | ${cells.join(' | ')} |`)
}
summary.byCategory = byCat

// ---- scorer audit ----
if (audit) {
  out.push('\n#### Scorer audit (40 planted answers with known labels)\n')
  out.push('| Planted set | n | Exact scorer agrees | Judge agrees |')
  out.push('|---|---|---|---|')
  for (const [s, v] of Object.entries(audit.bySet as Record<string, { exactAgreement: number; judgeAgreement: number | null }>))
    out.push(`| ${s.replace(/_/g, ' ')} | 10 | ${pct(v.exactAgreement)} | ${v.judgeAgreement === null ? 'n/a' : pct(v.judgeAgreement)} |`)
  out.push(`\nJudge (${audit.judgeModel ?? 'not run'}) false-pass rate on near-misses: **${audit.judgeFalsePassRate === null ? 'n/a' : pct(audit.judgeFalsePassRate)}**; false-fail rate on correct answers: ${audit.judgeFalseFailRate === null ? 'n/a' : pct(audit.judgeFalseFailRate)}. Exact scorer false-fail rate: ${pct(audit.exactFalseFailRate)} (it cannot read paraphrases). Pre-registered rule: if the judge passes more than 1 in 10 near-misses, the exact scorer is primary. Primary here: **${primary}**.`)
  // agreement on the real answers
  const both = rows.filter(r => r.judgeLabel)
  if (both.length) out.push(`\nOn the ${both.length} real answers, the two scorers agree on ${pct(mean(both.map(r => (r.judgeLabel === r.exactLabel ? 1 : 0))))} of labels.`)
}

// ---- compression ----
const omConds = conds.filter(k => ['C4', 'C5', 'C6'].includes(k))
if (omConds.length) {
  out.push('\n#### Compression on tool-heavy threads\n')
  out.push('Per-cycle ratio = tokens of messages handed to the Observer / tokens of observations it wrote (tokenx, the estimator OM uses). End-to-end ratio = thread tokens / tokens of the final observation log the actor read, after reflection.\n')
  out.push('| Condition | Per-cycle ratio: median (range) | End-to-end ratio: median (range) | Observation cycles (median) | Threads with a reflection | Observer + reflector tokens per thread (median) |')
  out.push('|---|---|---|---|---|---|')
  const comp: Record<string, unknown> = {}
  for (const k of omConds) {
    const r = kRows(k).filter(x => x.observationOutputTokens > 0)
    const perCycle = r.map(x => x.observedMessageTokens / x.observationOutputTokens)
    const e2e = r.filter(x => x.finalObservationTokens > 0).map(x => x.threadTokens / x.finalObservationTokens)
    const reflected = r.filter(x => x.reflectionCycles > 0).length
    const omTok = median(r.map(x => x.observerInputTokens + x.observerOutputTokens + x.reflectorInputTokens + x.reflectorOutputTokens))
    const rng = (xs: number[]) => (xs.length ? `${median(xs).toFixed(1)}x (${Math.min(...xs).toFixed(1)}-${Math.max(...xs).toFixed(1)})` : 'n/a')
    comp[k] = { perCycleMedian: median(perCycle), perCycleMin: Math.min(...perCycle), perCycleMax: Math.max(...perCycle), endToEndMedian: median(e2e), reflectedShare: r.length ? reflected / r.length : NaN }
    out.push(`| ${k} ${CONDITION_LABELS[k]} | ${rng(perCycle)} | ${rng(e2e)} | ${median(r.map(x => x.observationCycles))} | ${reflected}/${r.length} | ${num(omTok)} |`)
  }
  summary.compression = comp
}

// ---- loss attribution: did OM drop the value, or keep it and the actor missed it? ----
if (omConds.length) {
  out.push('\n#### Where the value was lost\n')
  out.push('For OM conditions, each answer is checked for whether the expected value is literally in the thread, and whether it is still in the observation log the actor read (same normalizers as the exact scorer). "Kept in the log" is the share of answerable questions whose value survived observation and reflection. A non-correct answer is "dropped by OM" when the value is in the thread but not in the log, and "kept, actor missed" when it is in both. Sums of several refunds, choice and abstention cases have no single string to look for and are not attributed.\n')
  out.push('| Condition | Value kept in the log | Non-correct answers | Dropped by OM | Kept, actor missed | Not attributable |')
  out.push('|---|---|---|---|---|---|')
  const loss: Record<string, unknown> = {}
  for (const k of omConds) {
    const answerable = kRows(k).filter(r => r.valueInThread === true && r.valueInObservations !== null)
    const kept = answerable.filter(r => r.valueInObservations).length
    const wrong = kRows(k).filter(r => label(r) !== 'correct')
    const dropped = wrong.filter(r => r.valueInThread === true && r.valueInObservations === false).length
    const missed = wrong.filter(r => r.valueInThread === true && r.valueInObservations === true).length
    loss[k] = { keptShare: answerable.length ? kept / answerable.length : NaN, answerable: answerable.length, nonCorrect: wrong.length, dropped, missed }
    out.push(`| ${k} ${CONDITION_LABELS[k]} | ${answerable.length ? `${pct(kept / answerable.length)} (${kept}/${answerable.length})` : 'n/a'} | ${wrong.length} | ${dropped} | ${missed} | ${wrong.length - dropped - missed} |`)
  }
  summary.lossAttribution = loss
}

// ---- fixes vs C4 ----
const fixes = (['C5', 'C6'] as ConditionId[]).filter(k => conds.includes(k) && conds.includes('C4'))
if (fixes.length) {
  out.push('\n#### Fixes vs C4 (paired over the same cases)\n')
  out.push('| Fix | Accuracy delta [95% CI] | McNemar p | Silent-failure delta | End-to-end compression | Actor input tokens (median) | Recall calls / question | Latency (median) |')
  out.push('|---|---|---|---|---|---|---|---|')
  const fx: Record<string, unknown> = {}
  for (const k of fixes) {
    const ids = common(['C4', k])
    const d = pairedBootstrap(perCase(k, ids), perCase('C4', ids))
    const majority = (c: ConditionId) => perCase(c, ids).map(x => x >= 0.5)
    const m = mcnemar(majority(k), majority('C4'))
    const sDelta = mean(perCase(k, ids, 'silent_failure')) - mean(perCase('C4', ids, 'silent_failure'))
    const e2e = (c: ConditionId) => median(kRows(c).filter(x => x.finalObservationTokens > 0).map(x => x.threadTokens / x.finalObservationTokens))
    fx[k] = { accuracyDelta: d, mcnemar: m, silentFailureDelta: sDelta }
    out.push(`| ${k} ${CONDITION_LABELS[k]} | ${signed(d)} | ${m.p.toFixed(3)} | ${sDelta >= 0 ? '+' : ''}${(sDelta * 100).toFixed(0)} pts | ${e2e(k).toFixed(1)}x (C4 ${e2e('C4').toFixed(1)}x) | ${num(median(kRows(k).map(r => r.actorInputTokens)))} (C4 ${num(median(kRows('C4').map(r => r.actorInputTokens)))}) | ${mean(kRows(k).map(r => r.recallCalls)).toFixed(2)} | ${(median(kRows(k).map(r => r.latencyMs)) / 1000).toFixed(1)}s |`)
  }
  summary.fixes = fx
}

// ---- C1 vs C4, and C4 slices for the hypotheses ----
if (conds.includes('C1') && conds.includes('C4')) {
  const ids = common(['C1', 'C4'])
  const d = pairedBootstrap(perCase('C4', ids), perCase('C1', ids))
  out.push(`\nC4 vs C1 (RQ1): ${signed(d)}, McNemar p = ${mcnemar(perCase('C4', ids).map(x => x >= 0.5), perCase('C1', ids).map(x => x >= 0.5)).p.toFixed(3)}.`)
  summary.c4VsC1 = d
  // not a pre-registered test: silent failures were pre-registered as a rate, not a comparison
  const s4 = perCase('C4', ids, 'silent_failure').map(x => x >= 0.5)
  const s1 = perCase('C1', ids, 'silent_failure').map(x => x >= 0.5)
  const sm = mcnemar(s4, s1)
  out.push(`\nSilent failures, C4 vs C1 (exploratory): ${s4.filter(Boolean).length} vs ${s1.filter(Boolean).length} of ${ids.length} cases; C4 only ${s4.filter((x, i) => x && !s1[i]).length}, C1 only ${s1.filter((x, i) => x && !s4[i]).length}, McNemar p = ${sm.p.toFixed(3)}.`)
  summary.c4VsC1Silent = { c4: s4.filter(Boolean).length, c1: s1.filter(Boolean).length, n: ids.length, mcnemar: sm }
}
// not pre-registered either: the fixes were pre-registered against C4 only
for (const k of fixes) {
  const ids = common(['C1', k])
  const d = pairedBootstrap(perCase(k, ids), perCase('C1', ids))
  out.push(`\n${k} vs C1 (exploratory): ${signed(d)}, McNemar p = ${mcnemar(perCase(k, ids).map(x => x >= 0.5), perCase('C1', ids).map(x => x >= 0.5)).p.toFixed(3)}.`)
}
if (conds.includes('C4')) {
  const ids = caseIdsFor('C4')
  const slice = (name: string, f: (c: Case) => string | undefined) => {
    const groups = new Map<string, string[]>()
    for (const id of ids) {
      const g = f(cases.get(id)!)
      if (g) groups.set(g, [...(groups.get(g) ?? []), id])
    }
    return `${name}: ${[...groups].map(([g, gi]) => `${g} ${share(perCase('C4', gi))}`).join(', ')}`
  }
  out.push('\n#### C4 slices (hypotheses RQ1, RQ3, RQ4)\n')
  out.push(`- ${slice('Tool-output size', c => c.tags.outputSize)}`)
  out.push(`- ${slice('Value restated by the user', c => (c.category === 'exact_value' ? String(c.tags.userRepeated) : undefined))}`)
  out.push(`- ${slice('Update source (knowledge_update)', c => c.tags.updateSource)}`)
  out.push(`- ${slice('Designed position of the fact', c => c.tags.position)}`)
  // actual position: did the key session come before the first reflection?
  const reflected = kRows('C4').filter(r => r.firstReflectionAfterSession !== null)
  out.push(`- Threads where a reflection fired during ingestion: ${reflected.length}/${kRows('C4').length}`)
}

// ---- failure transcripts: C4 wrong where C1 right ----
if (conds.includes('C4')) {
  const fails = kRows('C4').filter(r => label(r) !== 'correct' && rows.some(x => x.condition === 'C1' && x.caseId === r.caseId && x.run === r.run && label(x) === 'correct'))
  const pickCats = new Set<string>()
  const chosen = fails.filter(r => (pickCats.has(r.category) ? false : (pickCats.add(r.category), true))).slice(0, 3)
  if (chosen.length) {
    out.push('\n#### Failure transcripts (C4 wrong, C1 right on the same run)\n')
    for (const r of chosen) out.push(`- [${r.caseId}](results/transcripts/${r.runId}/C4-${r.caseId}-r${r.run}.md) (${r.category}): asked "${r.question}", expected \`${JSON.stringify(cases.get(r.caseId)!.expected.type === 'abstain' ? "I don't know" : (cases.get(r.caseId)!.expected as any).value)}\`, OM answered "${r.answer.replace(/\n/g, ' ').slice(0, 160)}" (${label(r).replace('_', ' ')})`)
  }
  summary.c4Failures = fails.map(r => ({ caseId: r.caseId, run: r.run, label: label(r) }))
}

// ---- Observer-size check (pre-registration amendment 1): same cases, hosted Observer ----
const OBS_CHECK = 'results/observer-check.jsonl'
if (existsSync(OBS_CHECK)) {
  const hosted = readFileSync(OBS_CHECK, 'utf8').trim().split('\n').filter(Boolean).map(l => LedgerRow.parse(JSON.parse(l)))
  const ids = [...new Set(hosted.map(r => r.caseId))].sort()
  const local = (k: string) => rows.filter(r => r.condition === k && r.run === 1 && ids.includes(r.caseId))
  const line = (who: string, k: string, rs: LedgerRow[]) => {
    const answerable = rs.filter(r => r.valueInThread === true && r.valueInObservations !== null)
    const ms = rs.map(r => r.ingestMs).filter((x): x is number => x !== null)
    return `| ${who} | ${k} ${CONDITION_LABELS[k as ConditionId]} | ${rs.filter(r => label(r) === 'correct').length} of ${rs.length} | ${rs.filter(r => label(r) === 'silent_failure').length} | ${answerable.length ? `${answerable.filter(r => r.valueInObservations).length} of ${answerable.length}` : 'n/a'} | ${rs.filter(r => r.reflectionCycles > 0).length} of ${rs.length} | ${ms.length ? `${(median(ms) / 1000).toFixed(0)}s` : 'not recorded'} |`
  }
  out.push(`\n#### Observer-size check (${ids.length} cases, run 1)\n`)
  out.push(`Pre-registration amendment 1. The agent stays on ${hosted[0]?.versions.actor}; only the Observer and Reflector change, from the local model to ${hosted[0]?.versions.observer}. If the C4 gap to C1 holds, the drops are OM's design on tool output; if it closes, retention depends on Observer size.\n`)
  out.push('| Observer | Condition | Correct | Silent failures | Value kept in the log | Threads with a reflection | Ingestion (median) |')
  out.push('|---|---|---|---|---|---|---|')
  const c1 = local('C1')
  if (c1.length) out.push(`| (none) | C1 ${CONDITION_LABELS.C1} | ${c1.filter(r => label(r) === 'correct').length} of ${c1.length} | ${c1.filter(r => label(r) === 'silent_failure').length} | | | |`)
  const check: Record<string, unknown> = {}
  for (const k of ['C4', 'C5']) {
    const h = hosted.filter(r => r.condition === k)
    if (!h.length) continue
    const l = local(k)
    if (l.length) out.push(line(l[0]!.versions.observer ?? 'local', k, l))
    out.push(line(h[0]!.versions.observer!, k, h))
    check[k] = { hostedCorrect: h.filter(r => label(r) === 'correct').length, localCorrect: l.filter(r => label(r) === 'correct').length, n: h.length, localN: l.length }
  }
  summary.observerCheck = { cases: ids, ...check }
}

const errors = existsSync('results/errors.jsonl') ? readFileSync('results/errors.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => summary.runIds instanceof Array && (summary.runIds as string[]).includes(e.runId)) : []
if (errors.length) out.push(`\n${errors.length} case run${errors.length > 1 ? 's' : ''} failed twice and ${errors.length > 1 ? 'are' : 'is'} missing from these tables (\`results/errors.jsonl\`): ${errors.map(e => `${e.caseId} r${e.run}`).join(', ')}.`)

const costs = existsSync('results/costs.jsonl') ? readFileSync('results/costs.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
const judgeUsd = costs.reduce((a, c) => a + c.judgeUsd, 0)
const observerUsd = costs.reduce((a, c) => a + (c.observerUsd ?? 0), 0)
out.push(`\nTotal Anthropic spend logged, all runs: $${(judgeUsd + observerUsd).toFixed(4)} (judge $${judgeUsd.toFixed(4)}${observerUsd ? `, hosted Observer in the Observer-size check $${observerUsd.toFixed(4)}` : ''}). Everything else runs locally on Ollama.`)

const md = out.join('\n')
writeFileSync('results/report.md', md + '\n')
writeFileSync('results/summary.json', JSON.stringify(summary, null, 2) + '\n')
if (existsSync('README.md')) {
  const readme = readFileSync('README.md', 'utf8')
  const re = /<!-- report:start -->[\s\S]*<!-- report:end -->/
  if (re.test(readme)) writeFileSync('README.md', readme.replace(re, `<!-- report:start -->\n${md}\n<!-- report:end -->`))
}
console.log(md)

// Accuracy against the actor's input tokens: one dot per condition with its 95% CI, so
// "how much context buys how much accuracy" reads at a glance. Static SVG for the README;
// colors are the first three slots of the reference categorical palette (validated
// all-pairs), and every dot carries a direct label.
function chartSvg(points: { k: ConditionId; acc: { point: number; lo: number; hi: number }; tokens: number }[]) {
  const W = 640, H = 380, L = 56, R = 150, T = 44, B = 52
  const step = (x: number) => [500, 1000, 2000, 2500, 5000, 10000].find(s => x / s <= 6) ?? 20000
  const xStep = step(Math.max(...points.map(p => p.tokens), 1))
  const xMax = Math.ceil((Math.max(...points.map(p => p.tokens), 1) * 1.05) / xStep) * xStep
  const x = (v: number) => L + (v / xMax) * (W - L - R)
  const y = (v: number) => T + (1 - v) * (H - T - B)
  const group = (k: ConditionId) => (k === 'C4' ? 'om' : k === 'C5' || k === 'C6' ? 'fix' : 'base')
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const g: string[] = []
  for (const v of [0, 0.25, 0.5, 0.75, 1]) g.push(`<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`)
  for (let v = 0; v <= xMax; v += xStep) g.push(`<text class="tick" x="${x(v)}" y="${H - B + 18}" text-anchor="middle">${v.toLocaleString('en-US')}</text>`)
  g.push(`<line class="axis" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`)
  // direct labels, nudged down until they don't overlap a placed label
  const placed: { x: number; y: number; w: number }[] = []
  const marks: string[] = []
  for (const p of [...points].sort((a, b) => b.acc.point - a.acc.point)) {
    const cx = x(p.tokens), cy = y(p.acc.point), cls = group(p.k)
    marks.push(`<g><title>${p.k} ${esc(CONDITION_LABELS[p.k])}: ${pct(p.acc.point)} [${pct(p.acc.lo)}, ${pct(p.acc.hi)}], ${num(p.tokens)} input tokens</title>` +
      `<line class="ci ${cls}" x1="${cx}" x2="${cx}" y1="${y(p.acc.lo)}" y2="${y(p.acc.hi)}"/>` +
      `<line class="ci ${cls}" x1="${cx - 4}" x2="${cx + 4}" y1="${y(p.acc.lo)}" y2="${y(p.acc.lo)}"/><line class="ci ${cls}" x1="${cx - 4}" x2="${cx + 4}" y1="${y(p.acc.hi)}" y2="${y(p.acc.hi)}"/>` +
      `<circle class="dot ${cls}" cx="${cx}" cy="${cy}" r="6"/></g>`)
    const text = `${p.k} ${CONDITION_LABELS[p.k]}`
    const w = text.length * 6.6
    let ly = cy + 4
    while (placed.some(q => Math.abs(q.y - ly) < 14 && cx + 10 < q.x + q.w && q.x < cx + 10 + w)) ly += 14
    placed.push({ x: cx + 10, y: ly, w })
    marks.push(`<text class="label" x="${cx + 10}" y="${ly}">${esc(text)}</text>`)
  }
  const legend = [['base', 'Baselines'], ['om', 'Observational Memory'], ['fix', 'OM fixes']]
    .map(([c, t], i) => `<circle class="dot ${c}" cx="${L + 6 + i * 150}" cy="20" r="5"/><text class="tick" x="${L + 16 + i * 150}" y="24">${t}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif">
<title>Accuracy against median actor input tokens per question</title>
<style>
  svg { --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --grid: #e4e3df; --base: #1baf7a; --om: #eb6834; --fix: #2a78d6; }
  @media (prefers-color-scheme: dark) { svg { --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --grid: #34332f; --base: #199e70; --om: #d95926; --fix: #3987e5; } }
  .bg { fill: var(--surface); } .grid { stroke: var(--grid); stroke-width: 1; } .axis { stroke: var(--ink-2); stroke-width: 1; }
  .tick { fill: var(--ink-2); font-size: 12px; } .label { fill: var(--ink); font-size: 12px; paint-order: stroke; stroke: var(--surface); stroke-width: 4px; stroke-linejoin: round; } .title { fill: var(--ink-2); font-size: 12px; }
  .ci { stroke-width: 2; stroke-linecap: round; } .dot { stroke: var(--surface); stroke-width: 2; }
  .ci.base { stroke: var(--base); } .ci.om { stroke: var(--om); } .ci.fix { stroke: var(--fix); }
  .dot.base { fill: var(--base); } .dot.om { fill: var(--om); } .dot.fix { fill: var(--fix); }
</style>
<rect class="bg" width="${W}" height="${H}" rx="8"/>
${legend}
${g.join('\n')}
${marks.join('\n')}
<text class="title" x="${(L + W - R) / 2}" y="${H - 12}" text-anchor="middle">Actor input tokens per question (median)</text>
<text class="title" transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">Accuracy, 95% CI</text>
</svg>
`
}
