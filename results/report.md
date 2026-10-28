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
