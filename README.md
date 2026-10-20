# om-toolload

A small benchmark that asks whether Mastra's Observational Memory (OM) keeps exact facts
from tool-call outputs (order IDs, tracking numbers, amounts, addresses, dates), and what
that costs in tokens.

Mastra's OM post reports 94.87% on LongMemEval and calls the 5-40x compression figure on
tool-heavy workloads anecdotal. LongMemEval has no tool outputs. This repo measures that
gap with 40 known-answer support-agent threads, six memory conditions, two scorers, an
audit of the scorers themselves, and two config-level fixes.

**Read the numbers at their real scale.** 40 cases gives 95% intervals of roughly
+/-10-15 points. Everything here runs on a local 8B model (llama3.1:8b via Ollama), not the
models behind Mastra's headline; see [Limitations](#limitations).

**Headline:** _filled in after the main run._ <!-- one sentence, sized to 40 cases -->

Pre-registration: [PREREGISTRATION.md](PREREGISTRATION.md) (commit: _link the hash of
the commit that added it_).

<!-- report:start -->
_Run `pnpm bench` then `pnpm report` to fill this section._
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

**Cost.** Only the judge calls a paid API. Verdicts are cached by (question, expected,
answer), and the runner stops judging once `COST_CAP_USD` (default $2) is spent. The
scorer audit costs under a cent.

## Limitations

- 40 cases is a probe. Intervals are wide, and results don't generalize to all tool-heavy
  agents.
- One domain (e-commerce support), one actor model, one observer model, and both are a
  local 8B model, much weaker than the gpt-5-mini / gemini-2.5-flash pair Mastra
  benchmarked. Some of what this repo measures is the 8B Observer's summarizing, not OM's
  design.
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

MIT licensed.
