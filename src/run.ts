// Benchmark runner: seed each case, ask the question under each condition, grade twice,
// append a ledger row.
//   pnpm bench                     all cases, C1-C4, 3 runs
//   pnpm bench --dry               5 cases, 1 run
//   pnpm bench --conditions C4,C5,C6 --runs 3
//   pnpm bench --resume <runId>    skip rows already in the ledger for that run id
//   pnpm bench:observer            Observer-size check: C4, C5 with a hosted Observer
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { Agent } from '@mastra/core/agent'
import { estimateTokenCount } from 'tokenx'
import { ALL_CONDITIONS, type ConditionId, INGEST_GROUP, MAIN_CONDITIONS, OM_THRESHOLDS, RECENT_MESSAGES, buildMemory, emptyStats, type OMStats } from './conditions.js'
import { actorModel, env, observerName, sampling, usd } from './models.js'
import { Case, LedgerRow } from './schema.js'
import { judgeLabel, judgeScorer, spend } from './scorers/judge.js'
import { scoreExact, valuePresent } from './scorers/exact.js'
import { RESOURCE, messageText, sessionMessages } from './seed.js'

export const ACTOR_INSTRUCTIONS = `You are a customer support agent for an online electronics store.
Answer the customer's question from what you remember of your earlier conversations with them, including the results of the order, shipment, customer and ticket lookups you ran then. You cannot run new lookups.
Reply in one or two sentences. State the exact value first (IDs, tracking numbers, amounts, dates, addresses), copied exactly.
If the answer is not in your memory, say "I don't know" instead of guessing.`

export const DRY_CASES = ['exact-001', 'multi-001', 'update-004', 'distractor-001', 'abstain-001']

const { values: args } = parseArgs({
  options: {
    dry: { type: 'boolean', default: false },
    runs: { type: 'string' },
    conditions: { type: 'string' },
    cases: { type: 'string' },
    resume: { type: 'string' },
    'no-judge': { type: 'boolean', default: false },
    // Observer + Reflector model (a Mastra router id); the agent stays local
    observer: { type: 'string' },
    ledger: { type: 'string', default: 'results/ledger.jsonl' },
  },
})
if (args.observer) env.observerModel = args.observer

const loadCases = () => readdirSync('cases').filter(f => f.endsWith('.json')).sort().map(f => Case.parse(JSON.parse(readFileSync(`cases/${f}`, 'utf8'))))

function versions(): Record<string, string> {
  const v = (p: string) => JSON.parse(readFileSync(`node_modules/${p}/package.json`, 'utf8')).version as string
  return {
    '@mastra/core': v('@mastra/core'), '@mastra/memory': v('@mastra/memory'), '@mastra/libsql': v('@mastra/libsql'),
    actor: env.ollamaModel, observer: observerName(), judge: env.judgeModel, numCtx: String(env.numCtx),
    omMessageTokens: String(OM_THRESHOLDS.messageTokens), omObservationTokens: String(OM_THRESHOLDS.observationTokens), recentMessages: String(RECENT_MESSAGES),
  }
}

const usesOM = (c: ConditionId) => c === 'C4' || c === 'C5' || c === 'C6'
const INGEST_AS: Record<string, ConditionId> = { plain: 'C1', vector: 'C3', om: 'C4', 'om-pinned': 'C5' }

async function ingest(group: string, c: Case, sessions: Awaited<ReturnType<typeof sessionMessages>>, dir: string) {
  const cond = INGEST_AS[group]!
  const file = `${dir}/${group}-${c.id}.db`
  const stats = emptyStats()
  const t0 = Date.now()
  const { storage, memory } = buildMemory(cond, file, stats, 'ingest')
  await memory.createThread({ threadId: c.id, resourceId: RESOURCE, title: c.id })
  const om = usesOM(cond) ? await memory.omEngine : null
  let firstReflectionAfterSession: number | null = null
  for (const [i, msgs] of sessions.entries()) {
    await memory.saveMessages({ messages: msgs })
    // observe at each session boundary, as a turn-synchronous run would; OM only
    // observes once unobserved tokens cross the threshold
    if (om) {
      const r = await om.observe({ threadId: c.id, resourceId: RESOURCE })
      if (r.reflected && firstReflectionAfterSession === null) firstReflectionAfterSession = i
    }
  }
  await storage.close()
  return { file, stats, firstReflectionAfterSession, ingestMs: Date.now() - t0 }
}

async function ask(cond: ConditionId, c: Case, file: string) {
  const stats = emptyStats()
  const { storage, memory } = buildMemory(cond, file, stats, 'ask')
  const agent = new Agent({ id: `actor-${cond}`, name: 'actor', instructions: ACTOR_INSTRUCTIONS, model: actorModel(), memory })
  const t0 = Date.now()
  const res: any = await agent.generate(c.question, { memory: { thread: c.id, resource: RESOURCE }, maxSteps: cond === 'C6' ? 5 : 1 })
  const latencyMs = Date.now() - t0
  const usage = res.totalUsage ?? res.usage ?? {}
  const calls = (res.steps ?? []).flatMap((s: any) => s.toolCalls ?? []).map((t: any) => t.payload ?? t)
  const results = (res.steps ?? []).flatMap((s: any) => s.toolResults ?? []).map((t: any) => t.payload ?? t)
  const recallCalls = calls.filter((t: any) => t.toolName === 'recall').length
  const toolLog = calls.map((t: any, i: number) => `- ${t.toolName}(${JSON.stringify(t.args)}) -> ${JSON.stringify(results[i]?.result ?? null).slice(0, 600)}`).join('\n')
  const observations = usesOM(cond) ? ((await (await memory.omEngine)!.getObservations(c.id, RESOURCE)) ?? '') : null
  await storage.close()
  return { answer: String(res.text ?? '').trim(), inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0, recallCalls, toolLog, latencyMs, observations, stats }
}

// Windows keeps libsql files locked until the process exits; cleanup is best-effort.
const tryRm = (p: string) => {
  try {
    rmSync(p, { recursive: true, force: true })
  } catch {}
}

// Fail in seconds, not hours in: Ollama must be up with every model this run needs.
async function preflight(conds: ConditionId[]) {
  const need = [env.ollamaModel, ...(conds.includes('C3') ? ['nomic-embed-text'] : [])]
  let have: string[]
  try {
    const res = await fetch(`${env.ollamaBaseURL}/tags`)
    have = ((await res.json()) as { models: { name: string }[] }).models.map(m => m.name)
  } catch {
    throw new Error(`Ollama is not reachable at ${env.ollamaBaseURL}. Start it with \`ollama serve\`.`)
  }
  const missing = need.filter(n => !have.some(h => h === n || h === `${n}:latest`))
  if (missing.length) throw new Error(`Ollama is missing ${missing.join(', ')}. Run \`ollama pull ${missing.join(' && ollama pull ')}\`.`)
}

const fmtDuration = (ms: number) => {
  const m = Math.round(ms / 60_000)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

const add = (a: OMStats, b: OMStats): OMStats => Object.fromEntries(Object.keys(a).map(k => [k, (a as any)[k] + (b as any)[k]])) as unknown as OMStats

async function main() {
  const all = loadCases()
  const caseFilter = args.cases?.split(',') ?? (args.dry ? DRY_CASES : null)
  const cases = caseFilter ? all.filter(c => caseFilter.includes(c.id)) : all
  const conds = (args.conditions?.split(',') as ConditionId[] | undefined) ?? MAIN_CONDITIONS
  for (const k of conds) if (!ALL_CONDITIONS.includes(k)) throw new Error(`unknown condition ${k}`)
  const runs = Number(args.runs ?? (args.dry ? 1 : 3))
  const runId = args.resume ?? new Date().toISOString().replace(/[:.]/g, '-')
  const judge = !args['no-judge'] && !!env.anthropicKey
  const ver = versions()

  mkdirSync('results/transcripts', { recursive: true })
  const LEDGER = args.ledger!
  // hosted Observer spend, capped like the judge's
  let observerUsd = 0
  const hostedObserver = env.observerModel.startsWith('anthropic/') ? env.observerModel.slice('anthropic/'.length) : null
  const done = new Set<string>()
  if (args.resume && existsSync(LEDGER))
    for (const line of readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean)) {
      const r = JSON.parse(line)
      if (r.runId === runId) done.add(`${r.run}|${r.condition}|${r.caseId}`)
    }

  await preflight(conds)
  console.log(`run ${runId}: ${cases.length} cases x ${conds.join(',')} x ${runs} runs; judge ${judge ? env.judgeModel : 'off'}`)
  const units = runs * cases.length
  let unitsDone = 0
  let busyMs = 0
  let unitsTimed = 0
  for (let run = 1; run <= runs; run++) {
    sampling.seed = run
    for (const c of cases) {
      if (hostedObserver && observerUsd >= env.costCapUsd) {
        console.error(`observer spend $${observerUsd.toFixed(4)} reached COST_CAP_USD; stopping`)
        break
      }
      unitsDone++
      if (!conds.some(k => !done.has(`${run}|${k}|${c.id}`))) continue
      const t0 = Date.now()
      // An unattended run of several hours should survive one bad Ollama call: retry the
      // case once (conditions already in the ledger are skipped), then log it and move on.
      for (let attempt = 1; ; attempt++) {
        try {
          await runCase(run, c)
          break
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error(`  [r${run} ${c.id}] attempt ${attempt} failed: ${msg}`)
          if (attempt === 2) {
            appendFileSync('results/errors.jsonl', JSON.stringify({ runId, run, caseId: c.id, error: msg, at: new Date().toISOString() }) + '\n')
            break
          }
        }
      }
      busyMs += Date.now() - t0
      unitsTimed++
      console.log(`  -- ${unitsDone}/${units} cases done, about ${fmtDuration((busyMs / unitsTimed) * (units - unitsDone))} left`)
    }
    tryRm(`runs/${runId}/r${run}`)
  }
  appendFileSync('results/costs.jsonl', JSON.stringify({ runId, judgeCalls: spend.calls, judgeCached: spend.cached, judgeUsd: +spend.usd.toFixed(4), ...(hostedObserver ? { observer: env.observerModel, observerUsd: +observerUsd.toFixed(4) } : {}), at: new Date().toISOString() }) + '\n')
  console.log(`done. judge: ${spend.calls} calls, ${spend.cached} cached, $${spend.usd.toFixed(4)}${hostedObserver ? `; observer $${observerUsd.toFixed(4)}` : ''}`)
  process.exit(0)

  async function runCase(run: number, c: Case) {
    const todo = conds.filter(k => !done.has(`${run}|${k}|${c.id}`))
    const dir = `runs/${runId}/r${run}/${c.id}`
    tryRm(dir)
    mkdirSync(dir, { recursive: true })
    const sessions = await sessionMessages(c)
    const threadTokens = sessions.flat().reduce((n, m) => n + estimateTokenCount(messageText(m)), 0)
    const valueInThread = valuePresent(sessions.flat().map(messageText).join('\n'), c.expected)

    const ingested = new Map<string, Awaited<ReturnType<typeof ingest>>>()
    for (const g of new Set(todo.map(k => INGEST_GROUP[k]))) {
      const t0 = Date.now()
      const ing = await ingest(g, c, sessions, dir)
      ingested.set(g, ing)
      if (hostedObserver) observerUsd += usd(hostedObserver, ing.stats.observerInputTokens + ing.stats.reflectorInputTokens, ing.stats.observerOutputTokens + ing.stats.reflectorOutputTokens)
      console.log(`  [r${run} ${c.id}] ingested ${g} in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    }

    for (const k of todo) {
      const ing = ingested.get(INGEST_GROUP[k])!
      // every condition answers on its own copy, so no condition sees another's question
      let file = ing.file
      if (INGEST_GROUP[k] !== 'vector') {
        file = `${dir}/${k}-${c.id}.db`
        for (const ext of ['', '-wal', '-shm']) if (existsSync(ing.file + ext)) copyFileSync(ing.file + ext, file + ext)
      }
      const a = await ask(k, c, file)
      const exact = scoreExact(a.answer, c.expected, c.distractors)
      const judged = judge ? await judgeScorer.run({ input: { question: c.question, expected: c.expected }, output: a.answer }) : null
      const verdict = (judged?.analyzeStepResult as any) ?? null
      const om = add(ing.stats, a.stats)
      const row = LedgerRow.parse({
        runId, run, condition: k, caseId: c.id, category: c.category, question: c.question, answer: a.answer,
        exactLabel: exact.label, judgeLabel: judgeLabel(verdict, c.expected), judgeValueStated: verdict?.valueStated ?? null,
        threadTokens, actorInputTokens: a.inputTokens, actorOutputTokens: a.outputTokens,
        ...om,
        finalObservationTokens: a.observations ? estimateTokenCount(a.observations) : 0,
        firstReflectionAfterSession: usesOM(k) ? ing.firstReflectionAfterSession : null,
        valueInThread,
        ingestMs: ing.ingestMs,
        valueInObservations: a.observations !== null ? valuePresent(a.observations, c.expected) : null,
        recallCalls: a.recallCalls, latencyMs: a.latencyMs, judgeUsd: +spend.usd.toFixed(6),
        versions: ver, seed: run, at: new Date().toISOString(),
      })
      appendFileSync(LEDGER, JSON.stringify(row) + '\n')
      done.add(`${run}|${k}|${c.id}`)
      mkdirSync(`results/transcripts/${runId}`, { recursive: true })
      writeFileSync(
        `results/transcripts/${runId}/${k}-${c.id}-r${run}.md`,
        `# ${k} ${c.id} run ${run}\n\n**Q:** ${c.question}\n\n**Expected:** ${JSON.stringify(c.expected)}\n\n**Answer:** ${a.answer}\n\n**Exact:** ${exact.label} · **Judge:** ${row.judgeLabel ?? 'n/a'}\n` +
          (a.toolLog ? `\n## Tool calls at question time\n\n${a.toolLog}\n` : '') +
          (a.observations !== null ? `\n## Observations the actor read (${row.finalObservationTokens} tokens)\n\n\`\`\`\n${a.observations}\n\`\`\`\n` : ''),
      )
      console.log(`  [r${run} ${c.id}] ${k}: exact=${exact.label} judge=${row.judgeLabel ?? '-'} (${(a.latencyMs / 1000).toFixed(1)}s) "${a.answer.slice(0, 90).replace(/\n/g, ' ')}"`)
    }
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
