# om-toolload

A small benchmark that asks whether Mastra's Observational Memory (OM) keeps exact facts
from tool-call outputs (order IDs, tracking numbers, amounts, addresses, dates), and what
that costs in tokens.

**Demo video (2:41):** https://youtu.be/xpHd0-6P4N8

Mastra's OM post reports 94.87% on LongMemEval and calls the 5-40x compression figure on
tool-heavy workloads anecdotal. LongMemEval has no tool outputs. This repo measures that
gap with 40 known-answer support-agent threads, six memory conditions, two scorers, an
audit of the scorers themselves, and two config-level fixes.

**Read the numbers at their real scale.** 40 cases gives 95% intervals of roughly
+/-10-15 points. Everything here runs on a local 8B model (llama3.1:8b via Ollama), not the
models behind Mastra's headline; see [Limitations](#limitations).

**Headline:** on 38 tool-heavy support threads with a local 8B Observer, OM's accuracy
gap to full context was not significant (17 vs 23 correct, -16 pts [-34, +0]), but OM
gave a confident wrong answer on 17 cases against full context's 4. Most of those were
tool values the Observer never wrote down, and in a 10-case check with
`claude-haiku-5-5` as Observer, OM answered all 10 correctly. The config-level fix,
pinning tool values verbatim through OM's transform hooks (C5), took OM from 17 to 29 of
38 correct (+32 pts [+13, +50], McNemar p = 0.008) for almost the same agent input
tokens as plain OM (median 2,266 against 2,168; full context reads 7,894). That is also
above full context's 23 of 38, though that difference is not significant (+16 pts [-3, +34]).

A follow-up added after these results were seen (exploratory, not pre-registered) reran
OM on all 38 cases with `claude-haiku-5-5` as Observer, agent still local. Plain OM then
answered 35 of 38, kept every checkable tool value (23 of 23), and beat full context
(+32 pts [+16, +47], p = 0.002), for $0.35 of Observer calls. Two caveats: the short logs
meant reflection fired in only 1 of 38 threads, so this says little about reflection; and
part of the gain over full context is likely the 8B agent reading a short clean log more
easily than 8k tokens of raw tool JSON. With a capable Observer, pinning added nothing (34
of 38).

Each condition ran once (pre-registered cut line 1). Two cases (`update-003`,
`update-004`) failed twice on a judge connection error in the C1-C4 run and are excluded
from every condition, as pre-registered. Retrieval mode (C6) did worse than plain OM: the
8B agent often wrote the `recall` call out as text instead of calling it.

Pre-registration: [PREREGISTRATION.md](PREREGISTRATION.md), committed in `9cfdf78`
before any main-run result existed.

<!-- report:start -->
### Results (38 cases, 1 run, scored by the judge scorer)

| Condition | Accuracy [95% CI] | Run SD | Silent failures | Abstained | Actor input tokens (median) | Input tokens per correct answer |
|---|---|---|---|---|---|---|
| C1 Full context | 61% [45%, 76%] | - | 11% | 29% | 7,894 | 12,856 |
| C2 Truncated (last 4) | 24% [11%, 37%] | - | 21% | 55% | 2,474 | 10,897 |
| C3 Semantic recall | 58% [42%, 74%] | - | 11% | 32% | 7,824 | 13,088 |
| C4 Observational Memory | 45% [29%, 61%] | - | 45% | 11% | 2,168 | 5,337 |
| C5 OM + pinned values | 76% [63%, 89%] | - | 18% | 5% | 2,266 | 3,394 |
| C6 OM + retrieval | 26% [13%, 39%] | - | 18% | 55% | 6,026 | 24,346 |

![Accuracy against the median actor input tokens per question, with 95% CIs](results/accuracy-vs-tokens.svg)

#### Accuracy by category

| Category | n | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|---|
| exact_value | 10 | 7 of 10 | 1 of 10 | 6 of 10 | 5 of 10 | 9 of 10 | 4 of 10 |
| multi_session | 8 | 1 of 8 | 0 of 8 | 0 of 8 | 2 of 8 | 3 of 8 | 0 of 8 |
| knowledge_update | 4 | 1 of 4 | 0 of 4 | 1 of 4 | 1 of 4 | 3 of 4 | 1 of 4 |
| temporal | 6 | 4 of 6 | 1 of 6 | 5 of 6 | 2 of 6 | 5 of 6 | 1 of 6 |
| distractor | 6 | 6 of 6 | 3 of 6 | 6 of 6 | 4 of 6 | 6 of 6 | 2 of 6 |
| abstention | 4 | 4 of 4 | 4 of 4 | 4 of 4 | 3 of 4 | 3 of 4 | 2 of 4 |

#### Scorer audit (40 planted answers with known labels)

| Planted set | n | Exact scorer agrees | Judge agrees |
|---|---|---|---|
| correct verbatim | 10 | 100% | 100% |
| correct paraphrased | 10 | 0% | 80% |
| near miss | 10 | 100% | 100% |
| hedged | 10 | 100% | 100% |

Judge (claude-haiku-5-5) false-pass rate on near-misses: **0%**; false-fail rate on correct answers: 10%. Exact scorer false-fail rate: 50% (it cannot read paraphrases). Pre-registered rule: if the judge passes more than 1 in 10 near-misses, the exact scorer is primary. Primary here: **judge**.

On the 228 real answers, the two scorers agree on 95% of labels.

#### Compression on tool-heavy threads

Per-cycle ratio = tokens of messages handed to the Observer / tokens of observations it wrote (tokenx, the estimator OM uses). End-to-end ratio = thread tokens / tokens of the final observation log the actor read, after reflection.

| Condition | Per-cycle ratio: median (range) | End-to-end ratio: median (range) | Observation cycles (median) | Threads with a reflection | Observer + reflector tokens per thread (median) |
|---|---|---|---|---|---|
| C4 Observational Memory | 4.6x (0.7-13.8) | 9.0x (4.3-38.1) | 2 | 18/38 | 25,766 |
| C5 OM + pinned values | 3.8x (0.6-8.7) | 6.8x (3.2-14.8) | 2 | 21/38 | 26,359 |
| C6 OM + retrieval | 4.8x (0.7-14.6) | 9.1x (4.1-53.8) | 2 | 15/38 | 24,207 |

#### Where the value was lost

For OM conditions, each answer is checked for whether the expected value is literally in the thread, and whether it is still in the observation log the actor read (same normalizers as the exact scorer). "Kept in the log" is the share of answerable questions whose value survived observation and reflection. A non-correct answer is "dropped by OM" when the value is in the thread but not in the log, and "kept, actor missed" when it is in both. Sums of several refunds, choice and abstention cases have no single string to look for and are not attributed.

| Condition | Value kept in the log | Non-correct answers | Dropped by OM | Kept, actor missed | Not attributable |
|---|---|---|---|---|---|
| C4 Observational Memory | 61% (14/23) | 21 | 9 | 2 | 10 |
| C5 OM + pinned values | 91% (21/23) | 9 | 2 | 0 | 7 |
| C6 OM + retrieval | 74% (17/23) | 28 | 6 | 9 | 13 |

#### Fixes vs C4 (paired over the same cases)

| Fix | Accuracy delta [95% CI] | McNemar p | Silent-failure delta | End-to-end compression | Actor input tokens (median) | Recall calls / question | Latency (median) |
|---|---|---|---|---|---|---|---|
| C5 OM + pinned values | +32 pts [+13, +50] | 0.008 | -26 pts | 6.8x (C4 9.0x) | 2,266 (C4 2,168) | 0.00 | 2.6s |
| C6 OM + retrieval | -18 pts [-39, +3] | 0.143 | -26 pts | 9.1x (C4 9.0x) | 6,026 (C4 2,168) | 0.63 | 3.5s |

C4 vs C1 (RQ1): -16 pts [-34, +0], McNemar p = 0.146.

Silent failures, C4 vs C1 (exploratory): 17 vs 4 of 38 cases; C4 only 14, C1 only 1, McNemar p = 0.001.

C5 vs C1 (exploratory): +16 pts [-3, +34], McNemar p = 0.180.

C6 vs C1 (exploratory): -34 pts [-50, -18], McNemar p = 0.001.

#### C4 slices (hypotheses RQ1, RQ3, RQ4)

- Tool-output size: small 6 of 18, large 11 of 20
- Value restated by the user: false 3 of 7, true 2 of 3
- Update source (knowledge_update): user 1 of 2, tool 0 of 2
- Designed position of the fact: pre_reflection 15 of 32, post_reflection 2 of 6
- Threads where a reflection fired during ingestion: 18/38

#### Failure transcripts (C4 wrong, C1 right on the same run)

- [abstain-002](results/transcripts/2026-10-20T16-13-16-128Z/C4-abstain-002-r1.md) (abstention): asked "What gift message did I put on the speaker order?", expected `"I don't know"`, OM answered "According to your previous order, ORD-5547, the gift message you left for the recipient was: "Happy birthday, Mom! Love, Grace"." (silent failure)
- [distractor-003](results/transcripts/2026-10-20T16-13-16-128Z/C4-distractor-003-r1.md) (distractor): asked "How much was refunded on ORD-6893?", expected `44.75`, OM answered "ORD-6893's refund amount is the same as the order's total: $35.76." (silent failure)
- [exact-002](results/transcripts/2026-10-20T16-13-16-128Z/C4-exact-002-r1.md) (exact_value): asked "How much was I charged in total for the keyboard order?", expected `257.64`, OM answered "The order details show that you were charged $159.99 for the keyboard order, with the order ID "ORD-4802"." (silent failure)

#### Observer-size check (10 cases, run 1)

Pre-registration amendment 1. The agent stays on llama3.1:8b; only the Observer and Reflector change, from the local model to anthropic/claude-haiku-5-5. If the C4 gap to C1 holds, the drops are OM's design on tool output; if it closes, retention depends on Observer size.

| Observer | Condition | Correct | Silent failures | Value kept in the log | Threads with a reflection | Ingestion (median) |
|---|---|---|---|---|---|---|
| (none) | C1 Full context | 8 of 10 | 1 | | | |
| llama3.1:8b | C4 Observational Memory | 6 of 10 | 4 | 7 of 9 | 4 of 10 | not recorded |
| anthropic/claude-haiku-5-5 | C4 Observational Memory | 10 of 10 | 0 | 9 of 9 | 1 of 10 | 11s |
| llama3.1:8b | C5 OM + pinned values | 8 of 10 | 1 | 8 of 9 | 5 of 10 | 101s |
| anthropic/claude-haiku-5-5 | C5 OM + pinned values | 9 of 10 | 0 | 9 of 9 | 6 of 10 | 12s |

#### Hosted Observer on all cases (exploratory) (38 cases, run 1)

Not pre-registered: added after the main results were seen, to test whether the 10-case check holds at full size. The agent stays on llama3.1:8b; only the Observer and Reflector change, from the local model to anthropic/claude-haiku-5-5. If the C4 gap to C1 holds, the drops are OM's design on tool output; if it closes, retention depends on Observer size.

| Observer | Condition | Correct | Silent failures | Value kept in the log | Threads with a reflection | Ingestion (median) |
|---|---|---|---|---|---|---|
| (none) | C1 Full context | 23 of 38 | 4 | | | |
| llama3.1:8b | C4 Observational Memory | 17 of 38 | 17 | 14 of 23 | 18 of 38 | not recorded |
| anthropic/claude-haiku-5-5 | C4 Observational Memory | 35 of 38 | 3 | 23 of 23 | 1 of 38 | 13s |
| llama3.1:8b | C5 OM + pinned values | 29 of 38 | 7 | 21 of 23 | 21 of 38 | 100s |
| anthropic/claude-haiku-5-5 | C5 OM + pinned values | 34 of 38 | 4 | 23 of 23 | 20 of 38 | 18s |

- Hosted-Observer C4 vs local-Observer C4: +47 pts [+32, +63], McNemar p < 0.001 (38 cases)
- Hosted-Observer C4 vs C1 full context: +32 pts [+16, +47], McNemar p = 0.002 (38 cases)

2 case runs failed twice and are missing from these tables (`results/errors.jsonl`): update-003 r1, update-004 r1.

Total Anthropic spend logged, all runs: $0.4605 (judge $0.0200, hosted Observer runs $0.4405). Everything else runs locally on Ollama.
<!-- report:end -->

## What's measured

Each case is a 4-6 session support thread, days apart, with 8-12 calls to mock
`getOrder`, `getShipment`, `getCustomer` and `searchTickets` tools. The fact the final
question needs sits inside one of those tool outputs, often among inventory arrays, audit
logs and request metadata. Every case has exactly one known answer.

| Category | n | Example question |
|---|---|---|
| exact_value | 10 | What's the tracking number for my headphones? |
| multi_session | 8 | How much have I been refunded in total so far? (one refund was denied) |
| knowledge_update | 6 | Where is my replacement shipping to? (3 user-stated, 3 visible only in a tool result) |
| temporal | 6 | Which arrived first, the charger or the case? |
| distractor | 6 | What's the tracking number for ORD-6247? (ORD-6274 also exists) |
| abstention | 4 | What discount code did I use? (never given) |

| ID | Condition | Role |
|---|---|---|
| C1 | Full context | Ceiling |
| C2 | Last 4 messages | Floor |
| C3 | Last 4 + semantic recall (topK 5) | Mastra's RAG option |
| C4 | Observational Memory | System under test |
| C5 | OM + pinned values (transform hooks) | Fix 1 |
| C6 | OM + retrieval mode (`recall` tool) | Fix 2 |

The seeder is the control. Every condition gets byte-identical threads, stored in the same
message shape a live tool-calling turn produces (checked by `pnpm spike`), so differences
in answers come from memory alone. C4 and C6 read copies of one ingestion, so the `recall`
tool is the only difference between them.

Every answer is graded by a deterministic exact scorer and by an LLM judge
(`claude-haiku-5-5`, a Mastra `createScorer`). The judge is audited first against 40
planted answers with known labels; a pre-registered rule picks the primary scorer.

When OM gets an answer wrong, the report also says where the value went: each answer
records whether the expected value is in the thread and whether it survived into the
observation log the actor read. That separates "the Observer never wrote it down" from
"OM kept it and the actor still missed it", which call for different fixes.

## Reproduce

Needs Node 20+, pnpm, and Ollama with `llama3.1:8b` and `nomic-embed-text` pulled. An
Anthropic key is optional and only used by the judge. Without one, the exact scorer
grades everything.

```bash
pnpm install
```

```bash
cp .env.example .env
```

| Command | What it does |
|---|---|
| `pnpm test` | Scorers, normalizers, bootstrap, dataset integrity, seeder determinism |
| `pnpm audit:scorers` | Scorer audit on the 40 planted answers (`--exact-only` needs no key) |
| `pnpm bench --dry` | 5 cases, 1 run, C1-C4 (add `--conditions C1,C2,C3,C4,C5,C6` for all) |
| `pnpm bench` | All 40 cases, C1-C4, 3 runs |
| `pnpm bench:fix` | C5 and C6, 3 runs |
| `pnpm bench:observer` | Observer-size check: C4 and C5 on 10 cases with `claude-haiku-5-5` as Observer, agent still local (about $0.15) |
| `pnpm report` | Tables into `results/` and this README |
| `pnpm build:cases` | Regenerates `cases/` and `fixtures/` (same seed, same bytes) |

`--runs N`, `--cases id1,id2` and `--resume <runId>` are also accepted. The ledger
(`results/ledger.jsonl`) has one row per answer, with tokens, OM cycles, latency, judge spend
and package versions. Transcripts, including the observation log the actor read, are under
`results/transcripts/`. `pnpm report` also draws `results/accuracy-vs-tokens.svg`.

The runner checks that Ollama is up with the needed models before it starts, prints a
time-left estimate after each case, and retries a failed case once. A case that fails twice
goes to `results/errors.jsonl` and is listed in the report. The 5-case dry run that shaped
the pre-registration is kept in `results/dry-run/`.

**Runtime.** On an 8 GB RTX 4070 laptop GPU, one OM ingestion takes 1-5 minutes, because the
local Observer and Reflector process about 25-45k tokens per thread. A full run of C1-C6 is
several hours. If your GPU can't hold the model at a 12k context (`ollama ps` shows a CPU
share), Ollama's `OLLAMA_FLASH_ATTENTION=1` and `OLLAMA_KV_CACHE_TYPE=q8_0` server settings
shrink the KV cache.

**Cost.** Only the judge (and, in the Observer-size check, the hosted Observer) calls a paid API. Verdicts are cached by (question, expected,
answer), and the runner stops judging once `COST_CAP_USD` (default $2) is spent. The
scorer audit costs under a cent.

## Limitations

- 40 cases is a probe. Intervals are wide, and results don't generalize to all tool-heavy
  agents.
- One domain (e-commerce support), one actor model, one observer model, and both are a
  local 8B model, much weaker than the gpt-5-mini / gemini-2.5-flash pair Mastra
  benchmarked. Some of what this repo measures is the 8B Observer's summarizing, not OM's
  design. The Observer-size check (10 cases, pre-registered) and the exploratory rerun on
  all 38 cases both say most of it is: with `claude-haiku-5-5` as Observer, no checkable
  value was dropped. With that Observer, reflection fired in only 1 of 38 C4 threads, so
  neither run says much about reflection.
- One run, not three, so there is no run-to-run spread; CIs resample cases only.
- Local OM ingestion took under 8 minutes for 37 of 40 cases (median about 2.5), but three
  took 30 minutes to 20 hours, most likely while the laptop slept. Wall-clock totals from
  this run are not representative.
- Threads are 4k-8.5k tokens with OM thresholds scaled to 3,000 / 1,500 so that observation
  and reflection both fire. OM's defaults (30k / 40k) never trigger on threads this short,
  so the default-threshold check was dropped.
- Threads are only 8-12 stored messages, because Mastra keeps tool calls inside assistant
  messages, so C2/C3 use a 4-message recent window instead of the PRD's 10. Even so, C3's
  semantic recall (topK 5, range 1) usually pulls in most of a thread this short.
- Cases are generated from an authored template table and may share the author's blind
  spots.
- Thread scope only; cross-thread memory is out of scope.
- The judge is a different model family from the actor, but it is still an LLM. Its audit
  numbers come from 40 planted answers.

## Security and data

- The only secret is `ANTHROPIC_API_KEY`, read from `.env`, which is gitignored. CI runs
  with no secrets and a read-only token.
- Every customer, order, address and email in `cases/` and `fixtures/` is generated by
  `scripts/build-cases.ts`. None of it is real.
- Dependencies are pinned by `pnpm-lock.yaml` to the versions the results were measured
  with (recorded in every ledger row). `pnpm audit` reported no known vulnerabilities on
  2026-10-29.

MIT licensed.
