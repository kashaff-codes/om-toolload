# Pre-registration: Observational Memory under tool load

Written before the dry run and the main run. Commit this file before `pnpm bench`, and
link that commit hash from the README. Anything tested after the main results are in is
labelled exploratory.

What had been run before this was finalized: the day-0 spike (`scripts/spike.ts`: one
live tool-calling turn, one forced observation); a one-case smoke test on `exact-001` under
earlier thresholds (2,000 / 1,000), which is why the thresholds below were raised (at 1,000
observation tokens the Reflector looped on compression retries); and the 5-case dry run
(`exact-001`, `multi-001`, `update-004`, `distractor-001`, `abstain-001`, one run, all six
conditions), which led to the two calibrations marked below (C2/C3 window, bare tool-call
answers). Treat those 5 cases' results as seen before the main run.

## Research questions and hypotheses

| # | Question | Hypothesis |
|---|---|---|
| RQ1 | Does OM keep exact values from tool outputs as well as full context does? | OM (C4) trails full context (C1) on exact-value cases. Misses cluster on IDs and amounts the user never repeated. |
| RQ2 | What compression does OM achieve on tool-heavy threads? | Median per-cycle ratio falls inside 5-40x. Ratio rises with tool-output size. |
| RQ3 | Are updates seen only in a tool result tracked as well as updates the user states? | Tool-only updates are missed more often than user-stated ones. |
| RQ4 | Does accuracy drop for facts that passed through a reflection? | Facts observed before a reflection are lost more often than facts observed after it. |
| RQ5 | Does the judge catch near-miss answers? | The judge passes some near-misses, so its false-pass rate is above zero. |
| RQ6 | Does a config-level fix close the gap? | Pinned values (C5) raise exact-value accuracy at little compression cost. Retrieval mode (C6) raises it more but costs extra tool calls and tokens. |
| RQ7 | When OM answers wrong, was the value dropped from the observation log, or kept and missed by the actor? | Most C4 misses are drops (the value is in the thread but not in the log). C5 removes most drops, so its remaining misses are mostly actor misses. |

## Cases

40 cases in `cases/`, generated from the authored table in `scripts/build-cases.ts` with
seed `20261020`; fixtures in `fixtures/` are committed and byte-identical across runs.

| Category | n |
|---|---|
| exact_value | 10 |
| multi_session | 8 |
| knowledge_update | 6 (3 user-stated, 3 tool-only) |
| temporal | 6 |
| distractor | 6 |
| abstention | 4 |

Each thread has 4-6 sessions days apart, 8-12 tool calls, and 4.0k-8.5k tokens (median
6.7k). Tags: tool-output size (about 450 or 2,200 tokens), designed position (early
session vs final session), whether the user restated the value.

## Conditions

| ID | Condition | Memory config |
|---|---|---|
| C1 | Full context | `lastMessages: 1000` |
| C2 | Truncated | `lastMessages: 4` |
| C3 | Semantic recall | `lastMessages: 4`, `semanticRecall: { topK: 5, messageRange: 1, scope: 'thread' }`, LibSQL vector store, `nomic-embed-text` |
| C4 | Observational Memory | `observation.messageTokens: 3000`, `reflection.observationTokens: 1500`, `bufferTokens: false` |
| C5 | OM + pinned values | C4 plus `beforeObservation` / `afterObservation` / `afterReflection` hooks that copy IDs, amounts, addresses and dates from tool results verbatim into a "Pinned values" block |
| C6 | OM + retrieval | C4 plus `retrieval: { scope: 'thread' }` (the `recall` tool) |

C4 and C6 read copies of one ingestion (run with retrieval on, so observation groups
carry message ranges), so the recall tool is the only difference between them.

Observation runs at each session boundary through `om.observe()`, which observes only
once unobserved tokens cross the threshold, as a turn-synchronous run would.

## Held constant, and deviations from the PRD

| | PRD | This run | Why |
|---|---|---|---|
| Actor | openai/gpt-5-mini | llama3.1:8b on local Ollama | Local-first build; no OpenAI key |
| Observer / Reflector | google/gemini-2.5-flash | llama3.1:8b on local Ollama | Same |
| Judge | openai/gpt-4o | claude-haiku-5-5 (low effort, structured output) | Different family from the actor, cheap |
| Thread size | 20k-40k tokens | 4k-8.5k tokens | 12k context fits an 8 GB GPU |
| OM thresholds | 6,000 / 8,000 | 3,000 / 1,500 | Scaled until observation and reflection both fire on these threads |
| C5 | Schema-less Extractor | Transform-hook pinned values | Extracted values are stored in thread metadata, not guaranteed in the actor's context; the PRD's pre-registered fallback |
| Default-threshold check | 10 cases at 30k / 40k | Dropped | Threads are under 30k, so OM would never observe (PRD cut line 3) |
| C2 / C3 recent window | last 10 messages | last 4 messages | Mastra stores tool calls inside assistant messages, so threads are 8-12 messages (median 10); the 5-case dry run showed C1, C2 and C3 reading identical context at 10 |

Context window `num_ctx 12288`; sampling seed = run number; storage `@mastra/libsql`, one
file per case per condition per run, deleted after the run. Package versions are recorded
in every ledger row.

## Scoring

Every answer is graded twice:

1. Exact scorer (`src/scorers/exact.ts`): normalized substring for IDs, numeric match for
   amounts, parsed dates, first-mentioned option for choice questions, phrase list for
   abstention and hedging. Correct means the expected value is present and no distractor is.
2. Judge (`src/scorers/judge.ts`): a Mastra `createScorer` returning
   `correct | wrong | abstained` plus the value stated.

Labels: correct, abstained (declined or hedged), silent failure (wrong and stated without
hedging). An answer that is only an attempted tool call (the 8B actor sometimes emits
`{"name": "getOrder", "parameters": ...}` as text) makes no claim and is labelled
abstained. This rule was added after the 5-case dry run, before the main run.

**Scorer audit rule:** both scorers grade 40 planted answers (`audit/planted.json`: 10
verbatim, 10 paraphrased, 10 near-miss, 10 hedged) before the main run. If the judge passes
more than 1 in 10 near-misses, the exact scorer becomes the primary metric and the judge is
secondary. The audit table ships either way.

## Analysis

- Accuracy per condition and category, 95% bootstrap CI (10,000 resamples over cases, a
  case's runs resampled together), run-to-run SD beside every CI.
- Comparisons: paired bootstrap on per-case differences; exact McNemar on per-case
  majority correctness as a cross-check.
- Compression: per-cycle (observed message tokens / observation tokens) and end-to-end
  (thread tokens / final observation tokens), median and range.
- Silent-failure rate counted separately from abstention.
- Loss attribution (RQ7): for OM conditions, whether the expected value is literally in
  the thread and in the observation log the actor read, using the exact scorer's
  normalizers. Reported as the share of answerable questions whose value was kept, and
  non-correct answers split into dropped by OM / kept but missed by the actor. Sums,
  choice and abstention cases are not attributed. Added before the main run.
- Robustness: a case whose run throws (an Ollama error, say) is retried once; if it fails
  again it is logged to `results/errors.jsonl`, listed under the report, and not rerun
  selectively after results are seen.
- With 40 cases, intervals are wide (roughly +/-10-15 points). Results are a probe of
  this case set, not a census of tool-heavy agents.

## Fix decision rule

- If exact-value or distractor misses dominate C4's failures, lead with C5.
- If multi-session or update misses dominate, lead with C6.
- Run both either way. The headline fix is whichever wins on accuracy per actor input token.

## Amendment 1: Observer-size check (2026-10-20)

Added while the C1-C4 main run was in progress (17 of 40 cases logged, none analysed),
after an outside review of the pilot asked whether OM's dropped values come from OM's design
or from a small local Observer. Mastra's reported numbers use gemini-2.5-flash as Observer.

- Cases: the 10 cases the scorer audit uses (`exact-001` to `exact-005`, `temporal-004`,
  `multi-001`, `update-001`, `distractor-001`, `distractor-005`), chosen before this check.
- Conditions: C4 and C5, one run, seed 1, the same thresholds and hooks as the main run.
- Change: Observer and Reflector on `claude-haiku-5-5` (Mastra router id
  `anthropic/claude-haiku-5-5`); the agent stays on local llama3.1:8b. Ledger:
  `results/observer-check.jsonl`, compared case by case with run 1 of the main run.
- Reported: correct and silent-failure counts, how often the value was kept in the log,
  how many threads reflected, and ingestion time, per Observer.
- Reading rule: if C4 with the hosted Observer still trails C1 on these cases by at least
  half the gap the local Observer shows, the drops are attributed mainly to OM's design on
  tool output; otherwise, mainly to Observer size. With 10 cases this is a check, not a
  test; it is reported beside the main results, never in place of them.
- A one-case smoke test (`exact-001`, C4) was run to confirm the setup before this was
  written; its result is not part of the check.

## Exploratory follow-up: hosted Observer on all cases (2026-10-28)

Not pre-registered. Added after every main result above was seen, to test whether the
10-case Observer-size check holds at full size. C4 and C5 rerun on the 38 cases that
completed in the main run, one run, seed 1, with `claude-haiku-5-5` as Observer and
Reflector and the agent on local llama3.1:8b, as in amendment 1. Ledger:
`results/observer-full.jsonl`. Reported beside the main results as exploratory, with the
same tables, and never used to replace them.

## Cut lines, if compute runs short

1. Run C1-C4 once before running them three times.
2. Drop C6 and ship one fix.
3. Never cut the scorer audit or this pre-registration.
