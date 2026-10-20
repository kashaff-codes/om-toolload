### Results (5 cases, 1 run, scored by the judge scorer)

| Condition | Accuracy [95% CI] | Run SD | Silent failures | Abstained | Actor input tokens (median) | Input tokens per correct answer |
|---|---|---|---|---|---|---|
| C1 Full context | 60% [20%, 100%] | 0.0 pts | 20% | 20% | 7,882 | 12,072 |
| C2 Truncated (last 10) | 60% [20%, 100%] | 0.0 pts | 20% | 20% | 7,882 | 12,072 |
| C3 Semantic recall | 60% [20%, 100%] | 0.0 pts | 20% | 20% | 7,882 | 12,072 |
| C4 Observational Memory | 40% [0%, 80%] | 0.0 pts | 60% | 0% | 1,798 | 4,421 |
| C5 OM + pinned values | 80% [40%, 100%] | 0.0 pts | 20% | 0% | 2,016 | 2,937 |
| C6 OM + retrieval | 40% [0%, 80%] | 0.0 pts | 0% | 60% | 7,154 | 17,300 |

#### Accuracy by category

| Category | n | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---|---|---|---|---|---|---|
| exact_value | 1 | 100% | 100% | 100% | 100% | 100% | 100% |
| multi_session | 1 | 0% | 0% | 0% | 100% | 100% | 0% |
| knowledge_update | 1 | 0% | 0% | 0% | 0% | 0% | 0% |
| distractor | 1 | 100% | 100% | 100% | 0% | 100% | 0% |
| abstention | 1 | 100% | 100% | 100% | 0% | 100% | 100% |

#### Scorer audit (40 planted answers with known labels)

| Planted set | n | Exact scorer agrees | Judge agrees |
|---|---|---|---|
| correct verbatim | 10 | 100% | 100% |
| correct paraphrased | 10 | 0% | 80% |
| near miss | 10 | 100% | 100% |
| hedged | 10 | 100% | 100% |

Judge (claude-haiku-5-5) false-pass rate on near-misses: **0%**; false-fail rate on correct answers: 10%. Exact scorer false-fail rate: 50% (it cannot read paraphrases). Pre-registered rule: if the judge passes more than 1 in 10 near-misses, the exact scorer is primary. Primary here: **judge**.

On the 30 real answers, the two scorers agree on 93% of labels.

#### Compression on tool-heavy threads

Per-cycle ratio = tokens of messages handed to the Observer / tokens of observations it wrote (tokenx, the estimator OM uses). End-to-end ratio = thread tokens / tokens of the final observation log the actor read, after reflection.

| Condition | Per-cycle ratio: median (range) | End-to-end ratio: median (range) | Observation cycles (median) | Threads with a reflection | Observer + reflector tokens per thread (median) |
|---|---|---|---|---|---|
| C4 Observational Memory | 4.1x (0.7-12.7) | 12.4x (8.2-23.1) | 2 | 4/5 | 28,069 |
| C5 OM + pinned values | 3.3x (1.7-3.9) | 5.5x (4.4-7.8) | 2 | 4/5 | 30,719 |
| C6 OM + retrieval | 4.1x (0.7-12.7) | 12.4x (8.2-23.1) | 2 | 4/5 | 28,069 |

#### Fixes vs C4 (paired over the same cases)

| Fix | Accuracy delta [95% CI] | McNemar p | Silent-failure delta | End-to-end compression | Actor input tokens (median) | Recall calls / question | Latency (median) |
|---|---|---|---|---|---|---|---|
| C5 OM + pinned values | +40 pts [+0, +80] | 0.500 | -40 pts | 5.5x (C4 12.4x) | 2,016 (C4 1,798) | 0.00 | 2.8s |
| C6 OM + retrieval | +0 pts [-60, +60] | 1.000 | -60 pts | 12.4x (C4 12.4x) | 7,154 (C4 1,798) | 1.00 | 14.9s |

C4 vs C1 (RQ1): -20 pts [-80, +40], McNemar p = 1.000.

#### C4 slices (hypotheses RQ1, RQ3, RQ4)

- Tool-output size: small 0% (n=3), large 100% (n=2)
- Value restated by the user: false 100% (n=1)
- Update source (knowledge_update): tool 0% (n=1)
- Designed position of the fact: pre_reflection 40% (n=5)
- Threads where a reflection fired during ingestion: 4/5

#### Failure transcripts (C4 wrong, C1 right on the same run)

- [abstain-001](results/transcripts/2026-10-20T14-01-51-691Z/C4-abstain-001-r1.md) (abstention): asked "What discount code did I use on my backpack order?", expected `"I don't know"`, OM answered "The order details indicate that you used the COUPON15 code, which offered a 15% discount on the subtotal. The amount of the discount was $2.70." (silent failure)
- [distractor-001](results/transcripts/2026-10-20T14-01-51-691Z/C4-distractor-001-r1.md) (distractor): asked "What's the tracking number for ORD-5634?", expected `"075250669204"`, OM answered "Tracking number for ORD-5634 is Z123456789US." (silent failure)

Total Anthropic spend logged (judge only, all runs): $0.0025. Actor, Observer and Reflector run locally on Ollama.
