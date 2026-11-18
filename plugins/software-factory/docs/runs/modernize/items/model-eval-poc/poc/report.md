# CPU accuracy/latency evaluation over all matrix candidates (PoC)

Confined PoC for M3-1: decide whether a cross-encoder/decision model can gate or replace the
suppression-justification heuristic, and if so which candidate is the smallest compliant option.
All artifacts live under `poc/`; production code and tests were not modified.

## 1. Verdict

**No-go for the contracted evaluation.** The contracted corpus's heuristic-accepted stratum contains 215 items with **zero meaningless (negative) examples**, so the 95% meaningless-precision bar cannot be met or evaluated: any model that never emits `False` is vacuously perfect, and any model that emits `False` has an undefined denominator of one. The heuristic itself scores 100.0% accuracy / 100.0% meaningful recall on that stratum (labels are the heuristic's own test tables), so a model can only lose recall in veto mode. No candidate can be certified on the contracted data.

Sensitivity analysis on the augmented corpus also finds no compliant eligible candidate; see the compliance table below.

## 2. What was evaluated

| Candidate | Repo @ revision | Params | Weight bytes | CPU RSS | p50 | p95 | Prompt | Status |
|---|---|---:|---:|---:|---:|---:|---|---|
| GLiDE-0.4B | fastino/GLiDE-0.4B | 395,042,816 | 790,103,664 | 0 MB | n/a ms | n/a ms | `canonical` | eligible |
| tasksource-decider-nano | tasksource/tasksource-decider-nano | 149,015,041 | 298,044,578 | 1464 MB | 162 ms | 233 ms | `canonical` | eligible |
| bekko-system-one-v0-17m | hotchpotch/bekko-system-one-v0-17m | 16,798,211 | 67,198,244 | 624 MB | 34 ms | 45 ms | `canonical` | excluded: weights carry no declared license; scored but excluded from recommendation |
| ettin-reranker-150m-v1 | cross-encoder/ettin-reranker-150m-v1 | 149,606,401 | 598,439,036 | 991 MB | 439 ms | 1103 ms | `current` | eligible |
| all-MiniLM-L6-v2 | sentence-transformers/all-MiniLM-L6-v2 | 22,713,728 | 90,868,376 | 556 MB | 224 ms | 1341 ms | `current` | excluded: untrained CrossEncoder classifier head; accuracy row not comparable (latency/RSS only) |

Params and weight bytes are measured directly from the cached `*.safetensors` headers by `eval/model_stats.py` (`out/model_stats.json`); they supersede the hand-written adapter constants. Latency is single-request, float32, 10 torch threads, warmup on the first three items, on a 12th Gen Intel i7-12700H (20 logical / 10 physical cores, WSL2, 19 GiB RAM).

### Prompts and modes

- Decision models: `canonical`, `rubric`, `compact` (true/false `noul` question).
- Rerankers: `current` = production pair construction (`_semantic.py:168-176`: present fields only, self-pair when both rule and context are absent), `query_first` = same query/justification order swap, `rubric_query` = rubric-prefixed ablation.
- Modes: `veto` = heuristic AND model >= threshold (model can only flip True to False); `replace` = model >= threshold.
- Thresholds: 0.5, 0.6, 0.7. Bars: accuracy >= 90%, meaningless precision >= 95%, meaningful recall >= 85%.

## 3. Corpus

| Source | Raw rows | Post-dedup | Dedup-dropped |
|---|---:|---:|---:|
| brushoff_table | 35 | 32 | 3 |
| hard_negative | 40 | 39 | 1 |
| meaningful_table | 33 | 3 | 30 |
| repo_suppression | 370 | 183 | 187 |
| threshold_meaningful | 30 | 30 | 0 |
| threshold_meaningless | 50 | 49 | 1 |
| **total** | **558** | **336** | **222** |

Deduplication is first-wins on the normalized justification. The collapse is large and is disclosed per source above: `meaningful_table` contributes 33 raw rows but only 3 after 30 duplicates of `threshold_meaningful`; `repo_suppression` contributes 370 raw line-level rows but 183 after dedup. The contracted corpus is 297 items; the augmented corpus is 336 items.

### Stratification and the precision-bar problem

| Scope | Stratum | Meaningful | Meaningless |
|---|---|---:|---:|
| contracted | heuristic_accepted | 215 | 0 |
| contracted | heuristic_rejected | 0 | 82 |
| contracted | overall | 215 | 82 |
| augmented | heuristic_accepted | 215 | 39 |
| augmented | heuristic_rejected | 0 | 82 |
| augmented | overall | 215 | 121 |

The contracted corpus has **no heuristic-accepted negative** (`repo_suppression` false rows are all in the heuristic-rejected stratum; the test-table labels are the heuristic's own outputs). Therefore the 95% meaningless-precision bar is vacuous on the contract's primary stratum. The 39 synthetic `hard_negative` rows (all heuristic-accepted, all labelled meaningless) are reported **separately as a sensitivity analysis**, never mixed into the contracted compliance claim.

### Label/protocol fixes applied in this round

- Real suppressions are now **one item per suppression line**; all codes on the line are joined into `rule` (e.g. `SIM115,consider-using-with`, `arg-type,invalid-argument-type`), mirroring production `_has_justification` (one boolean per line). This removes the double-counted second suppression that produced contradictory labels (`c149` true vs `c165` false); both lines now yield one true item with the real same-line reason.
- Synthetic rows use a single rule convention: `rule = None` for both the test tables and the hard negatives (no fabricated `W9704` code).
- Real-repo labels are single-adjudicator rubric labels recorded in `data/repo_labels.json`; borderline terse reasons (`planted violation`, `usage docs in .pyi`, `test helper for readability`) are labelled meaningful because they state a concrete purpose. No second rater was available.

## 4. Results

### 4.1 Heuristic baseline (no model)

| Scope / stratum | n | Accuracy | Meaningless precision | Meaningful recall | tp/tn/fp/fn |
|---|---:|---:|---:|---:|---|
| contracted / heuristic_accepted | 215 | 100.0% | n/a | 100.0% | 215/0/0/0 |
| contracted / heuristic_rejected | 82 | 100.0% | 100.0% | n/a | 0/82/0/0 |
| contracted / overall | 297 | 100.0% | 100.0% | 100.0% | 215/82/0/0 |
| augmented / heuristic_accepted | 254 | 84.6% | n/a | 100.0% | 215/0/39/0 |
| augmented / heuristic_rejected | 82 | 100.0% | 100.0% | n/a | 0/82/0/0 |
| augmented / overall | 336 | 88.4% | 100.0% | 100.0% | 215/82/39/0 |

### 4.2 Production-prompt matrix

Each block is one candidate at its production prompt. `accepted` is the contract stratum; `overall` adds the heuristic-rejected easy negatives. Contract compliance is judged only on the accepted rows.

#### GLiDE-0.4B (`canonical`)

Not scored: incomplete (6/336 rows).

#### tasksource-decider-nano (`canonical`)

| Scope / stratum | Threshold / mode | n | Accuracy | Meaningless precision | Meaningful recall | tp/tn/fp/fn |
|---|---|---:|---:|---:|---:|---|
| contracted / accepted | 0.5/veto | 215 | 26.5% | 0.0% | 26.5% | 57/0/0/158 |
| contracted / overall | 0.5/veto | 297 | 46.8% | 34.2% | 26.5% | 57/82/0/158 |
| contracted / accepted | 0.5/replace | 215 | 26.5% | 0.0% | 26.5% | 57/0/0/158 |
| contracted / overall | 0.5/replace | 297 | 46.8% | 34.2% | 26.5% | 57/82/0/158 |
| contracted / accepted | 0.6/veto | 215 | 8.8% | 0.0% | 8.8% | 19/0/0/196 |
| contracted / overall | 0.6/veto | 297 | 34.0% | 29.5% | 8.8% | 19/82/0/196 |
| contracted / accepted | 0.6/replace | 215 | 8.8% | 0.0% | 8.8% | 19/0/0/196 |
| contracted / overall | 0.6/replace | 297 | 34.0% | 29.5% | 8.8% | 19/82/0/196 |
| contracted / accepted | 0.7/veto | 215 | 0.9% | 0.0% | 0.9% | 2/0/0/213 |
| contracted / overall | 0.7/veto | 297 | 28.3% | 27.8% | 0.9% | 2/82/0/213 |
| contracted / accepted | 0.7/replace | 215 | 0.9% | 0.0% | 0.9% | 2/0/0/213 |
| contracted / overall | 0.7/replace | 297 | 28.3% | 27.8% | 0.9% | 2/82/0/213 |
| augmented / accepted | 0.5/veto | 254 | 37.0% | 19.0% | 26.5% | 57/37/2/158 |
| augmented / overall | 0.5/veto | 336 | 52.4% | 43.0% | 26.5% | 57/119/2/158 |
| augmented / accepted | 0.5/replace | 254 | 37.0% | 19.0% | 26.5% | 57/37/2/158 |
| augmented / overall | 0.5/replace | 336 | 52.4% | 43.0% | 26.5% | 57/119/2/158 |
| augmented / accepted | 0.6/veto | 254 | 22.8% | 16.6% | 8.8% | 19/39/0/196 |
| augmented / overall | 0.6/veto | 336 | 41.7% | 38.2% | 8.8% | 19/121/0/196 |
| augmented / accepted | 0.6/replace | 254 | 22.8% | 16.6% | 8.8% | 19/39/0/196 |
| augmented / overall | 0.6/replace | 336 | 41.7% | 38.2% | 8.8% | 19/121/0/196 |
| augmented / accepted | 0.7/veto | 254 | 16.1% | 15.5% | 0.9% | 2/39/0/213 |
| augmented / overall | 0.7/veto | 336 | 36.6% | 36.2% | 0.9% | 2/121/0/213 |
| augmented / accepted | 0.7/replace | 254 | 16.1% | 15.5% | 0.9% | 2/39/0/213 |
| augmented / overall | 0.7/replace | 336 | 36.6% | 36.2% | 0.9% | 2/121/0/213 |

#### bekko-system-one-v0-17m (`canonical`)

| Scope / stratum | Threshold / mode | n | Accuracy | Meaningless precision | Meaningful recall | tp/tn/fp/fn |
|---|---|---:|---:|---:|---:|---|
| contracted / accepted | 0.5/veto | 215 | 22.3% | 0.0% | 22.3% | 48/0/0/167 |
| contracted / overall | 0.5/veto | 297 | 43.8% | 32.9% | 22.3% | 48/82/0/167 |
| contracted / accepted | 0.5/replace | 215 | 22.3% | 0.0% | 22.3% | 48/0/0/167 |
| contracted / overall | 0.5/replace | 297 | 41.1% | 30.7% | 22.3% | 48/74/8/167 |
| contracted / accepted | 0.6/veto | 215 | 2.3% | 0.0% | 2.3% | 5/0/0/210 |
| contracted / overall | 0.6/veto | 297 | 29.3% | 28.1% | 2.3% | 5/82/0/210 |
| contracted / accepted | 0.6/replace | 215 | 2.3% | 0.0% | 2.3% | 5/0/0/210 |
| contracted / overall | 0.6/replace | 297 | 29.3% | 28.1% | 2.3% | 5/82/0/210 |
| contracted / accepted | 0.7/veto | 215 | 0.0% | 0.0% | 0.0% | 0/0/0/215 |
| contracted / overall | 0.7/veto | 297 | 27.6% | 27.6% | 0.0% | 0/82/0/215 |
| contracted / accepted | 0.7/replace | 215 | 0.0% | 0.0% | 0.0% | 0/0/0/215 |
| contracted / overall | 0.7/replace | 297 | 27.6% | 27.6% | 0.0% | 0/82/0/215 |
| augmented / accepted | 0.5/veto | 254 | 32.3% | 16.9% | 22.3% | 48/34/5/167 |
| augmented / overall | 0.5/veto | 336 | 48.8% | 41.0% | 22.3% | 48/116/5/167 |
| augmented / accepted | 0.5/replace | 254 | 32.3% | 16.9% | 22.3% | 48/34/5/167 |
| augmented / overall | 0.5/replace | 336 | 46.4% | 39.3% | 22.3% | 48/108/13/167 |
| augmented / accepted | 0.6/veto | 254 | 17.3% | 15.7% | 2.3% | 5/39/0/210 |
| augmented / overall | 0.6/veto | 336 | 37.5% | 36.6% | 2.3% | 5/121/0/210 |
| augmented / accepted | 0.6/replace | 254 | 17.3% | 15.7% | 2.3% | 5/39/0/210 |
| augmented / overall | 0.6/replace | 336 | 37.5% | 36.6% | 2.3% | 5/121/0/210 |
| augmented / accepted | 0.7/veto | 254 | 15.4% | 15.4% | 0.0% | 0/39/0/215 |
| augmented / overall | 0.7/veto | 336 | 36.0% | 36.0% | 0.0% | 0/121/0/215 |
| augmented / accepted | 0.7/replace | 254 | 15.4% | 15.4% | 0.0% | 0/39/0/215 |
| augmented / overall | 0.7/replace | 336 | 36.0% | 36.0% | 0.0% | 0/121/0/215 |

#### ettin-reranker-150m-v1 (`current`)

| Scope / stratum | Threshold / mode | n | Accuracy | Meaningless precision | Meaningful recall | tp/tn/fp/fn |
|---|---|---:|---:|---:|---:|---|
| contracted / accepted | 0.5/veto | 215 | 100.0% | n/a | 100.0% | 215/0/0/0 |
| contracted / overall | 0.5/veto | 297 | 100.0% | 100.0% | 100.0% | 215/82/0/0 |
| contracted / accepted | 0.5/replace | 215 | 100.0% | n/a | 100.0% | 215/0/0/0 |
| contracted / overall | 0.5/replace | 297 | 72.4% | n/a | 100.0% | 215/0/82/0 |
| contracted / accepted | 0.6/veto | 215 | 100.0% | n/a | 100.0% | 215/0/0/0 |
| contracted / overall | 0.6/veto | 297 | 100.0% | 100.0% | 100.0% | 215/82/0/0 |
| contracted / accepted | 0.6/replace | 215 | 100.0% | n/a | 100.0% | 215/0/0/0 |
| contracted / overall | 0.6/replace | 297 | 72.4% | n/a | 100.0% | 215/0/82/0 |
| contracted / accepted | 0.7/veto | 215 | 100.0% | n/a | 100.0% | 215/0/0/0 |
| contracted / overall | 0.7/veto | 297 | 100.0% | 100.0% | 100.0% | 215/82/0/0 |
| contracted / accepted | 0.7/replace | 215 | 100.0% | n/a | 100.0% | 215/0/0/0 |
| contracted / overall | 0.7/replace | 297 | 72.4% | n/a | 100.0% | 215/0/82/0 |
| augmented / accepted | 0.5/veto | 254 | 84.6% | n/a | 100.0% | 215/0/39/0 |
| augmented / overall | 0.5/veto | 336 | 88.4% | 100.0% | 100.0% | 215/82/39/0 |
| augmented / accepted | 0.5/replace | 254 | 84.6% | n/a | 100.0% | 215/0/39/0 |
| augmented / overall | 0.5/replace | 336 | 64.0% | n/a | 100.0% | 215/0/121/0 |
| augmented / accepted | 0.6/veto | 254 | 84.6% | n/a | 100.0% | 215/0/39/0 |
| augmented / overall | 0.6/veto | 336 | 88.4% | 100.0% | 100.0% | 215/82/39/0 |
| augmented / accepted | 0.6/replace | 254 | 84.6% | n/a | 100.0% | 215/0/39/0 |
| augmented / overall | 0.6/replace | 336 | 64.0% | n/a | 100.0% | 215/0/121/0 |
| augmented / accepted | 0.7/veto | 254 | 84.6% | n/a | 100.0% | 215/0/39/0 |
| augmented / overall | 0.7/veto | 336 | 88.4% | 100.0% | 100.0% | 215/82/39/0 |
| augmented / accepted | 0.7/replace | 254 | 84.6% | n/a | 100.0% | 215/0/39/0 |
| augmented / overall | 0.7/replace | 336 | 64.0% | n/a | 100.0% | 215/0/121/0 |

#### all-MiniLM-L6-v2 (`current`)

| Scope / stratum | Threshold / mode | n | Accuracy | Meaningless precision | Meaningful recall | tp/tn/fp/fn |
|---|---|---:|---:|---:|---:|---|
| contracted / accepted | 0.5/veto | 215 | 100.0% | n/a | 100.0% | 215/0/0/0 |
| contracted / overall | 0.5/veto | 297 | 100.0% | 100.0% | 100.0% | 215/82/0/0 |
| contracted / accepted | 0.5/replace | 215 | 100.0% | n/a | 100.0% | 215/0/0/0 |
| contracted / overall | 0.5/replace | 297 | 72.4% | n/a | 100.0% | 215/0/82/0 |
| contracted / accepted | 0.6/veto | 215 | 100.0% | n/a | 100.0% | 215/0/0/0 |
| contracted / overall | 0.6/veto | 297 | 100.0% | 100.0% | 100.0% | 215/82/0/0 |
| contracted / accepted | 0.6/replace | 215 | 100.0% | n/a | 100.0% | 215/0/0/0 |
| contracted / overall | 0.6/replace | 297 | 72.4% | n/a | 100.0% | 215/0/82/0 |
| contracted / accepted | 0.7/veto | 215 | 0.0% | 0.0% | 0.0% | 0/0/0/215 |
| contracted / overall | 0.7/veto | 297 | 27.6% | 27.6% | 0.0% | 0/82/0/215 |
| contracted / accepted | 0.7/replace | 215 | 0.0% | 0.0% | 0.0% | 0/0/0/215 |
| contracted / overall | 0.7/replace | 297 | 27.6% | 27.6% | 0.0% | 0/82/0/215 |
| augmented / accepted | 0.5/veto | 254 | 84.6% | n/a | 100.0% | 215/0/39/0 |
| augmented / overall | 0.5/veto | 336 | 88.4% | 100.0% | 100.0% | 215/82/39/0 |
| augmented / accepted | 0.5/replace | 254 | 84.6% | n/a | 100.0% | 215/0/39/0 |
| augmented / overall | 0.5/replace | 336 | 64.0% | n/a | 100.0% | 215/0/121/0 |
| augmented / accepted | 0.6/veto | 254 | 84.6% | n/a | 100.0% | 215/0/39/0 |
| augmented / overall | 0.6/veto | 336 | 88.4% | 100.0% | 100.0% | 215/82/39/0 |
| augmented / accepted | 0.6/replace | 254 | 84.6% | n/a | 100.0% | 215/0/39/0 |
| augmented / overall | 0.6/replace | 336 | 64.0% | n/a | 100.0% | 215/0/121/0 |
| augmented / accepted | 0.7/veto | 254 | 15.4% | 15.4% | 0.0% | 0/39/0/215 |
| augmented / overall | 0.7/veto | 336 | 36.0% | 36.0% | 0.0% | 0/121/0/215 |
| augmented / accepted | 0.7/replace | 254 | 15.4% | 15.4% | 0.0% | 0/39/0/215 |
| augmented / overall | 0.7/replace | 336 | 36.0% | 36.0% | 0.0% | 0/121/0/215 |

### 4.3 Prompt ablation

| Candidate | Prompt | Best augmented accepted cell | Accuracy | Precision | Recall | Contracted accepted recall |
|---|---|---|---:|---:|---:|---:|
| GLiDE-0.4B | `canonical` | not scored (incomplete) | n/a | n/a | n/a | n/a |
| GLiDE-0.4B | `rubric` | not scored (incomplete) | n/a | n/a | n/a | n/a |
| GLiDE-0.4B | `compact` | not scored (incomplete) | n/a | n/a | n/a | n/a |
| tasksource-decider-nano | `canonical` | 0.5/veto | 37.0% | 19.0% | 26.5% | 26.5% |
| tasksource-decider-nano | `rubric` | 0.5/veto | 25.6% | 3.1% | 27.9% | 27.9% |
| tasksource-decider-nano | `compact` | 0.5/veto | 39.4% | 15.2% | 34.9% | 34.9% |
| bekko-system-one-v0-17m | `canonical` | 0.5/veto | 32.3% | 16.9% | 22.3% | 22.3% |
| bekko-system-one-v0-17m | `rubric` | 0.5/veto | 39.0% | 11.8% | 37.7% | 37.7% |
| bekko-system-one-v0-17m | `compact` | 0.5/veto | 16.5% | 15.5% | 1.4% | 1.4% |
| ettin-reranker-150m-v1 | `current` | 0.5/veto | 84.6% | n/a | 100.0% | 100.0% |
| ettin-reranker-150m-v1 | `query_first` | not scored (missing) | n/a | n/a | n/a | n/a |
| ettin-reranker-150m-v1 | `rubric_query` | not scored (missing) | n/a | n/a | n/a | n/a |
| all-MiniLM-L6-v2 | `current` | 0.5/veto | 84.6% | n/a | 100.0% | 100.0% |
| all-MiniLM-L6-v2 | `query_first` | not scored (missing) | n/a | n/a | n/a | n/a |
| all-MiniLM-L6-v2 | `rubric_query` | not scored (missing) | n/a | n/a | n/a | n/a |

### 4.4 Compliance table

| Candidate | Prompt | Threshold / mode | Contracted accepted (acc/prec/rec) | Augmented accepted (acc/prec/rec) | Compliant contracted | Compliant augmented |
|---|---|---|---|---|---|---|
| tasksource-decider-nano | `canonical` | 0.5/veto | 26.5% / 0.0% / 26.5% | 37.0% / 19.0% / 26.5% | no | no |
| tasksource-decider-nano | `canonical` | 0.5/replace | 26.5% / 0.0% / 26.5% | 37.0% / 19.0% / 26.5% | no | no |
| tasksource-decider-nano | `canonical` | 0.6/veto | 8.8% / 0.0% / 8.8% | 22.8% / 16.6% / 8.8% | no | no |
| tasksource-decider-nano | `canonical` | 0.6/replace | 8.8% / 0.0% / 8.8% | 22.8% / 16.6% / 8.8% | no | no |
| tasksource-decider-nano | `canonical` | 0.7/veto | 0.9% / 0.0% / 0.9% | 16.1% / 15.5% / 0.9% | no | no |
| tasksource-decider-nano | `canonical` | 0.7/replace | 0.9% / 0.0% / 0.9% | 16.1% / 15.5% / 0.9% | no | no |
| tasksource-decider-nano | `rubric` | 0.5/veto | 27.9% / 0.0% / 27.9% | 25.6% / 3.1% / 27.9% | no | no |
| tasksource-decider-nano | `rubric` | 0.5/replace | 27.9% / 0.0% / 27.9% | 25.6% / 3.1% / 27.9% | no | no |
| tasksource-decider-nano | `rubric` | 0.6/veto | 16.7% / 0.0% / 16.7% | 18.9% / 6.3% / 16.7% | no | no |
| tasksource-decider-nano | `rubric` | 0.6/replace | 16.7% / 0.0% / 16.7% | 18.9% / 6.3% / 16.7% | no | no |
| tasksource-decider-nano | `rubric` | 0.7/veto | 10.7% / 0.0% / 10.7% | 18.1% / 10.7% / 10.7% | no | no |
| tasksource-decider-nano | `rubric` | 0.7/replace | 10.7% / 0.0% / 10.7% | 18.1% / 10.7% / 10.7% | no | no |
| tasksource-decider-nano | `compact` | 0.5/veto | 34.9% / 0.0% / 34.9% | 39.4% / 15.2% / 34.9% | no | no |
| tasksource-decider-nano | `compact` | 0.5/replace | 34.9% / 0.0% / 34.9% | 39.4% / 15.2% / 34.9% | no | no |
| tasksource-decider-nano | `compact` | 0.6/veto | 19.1% / 0.0% / 19.1% | 29.1% / 15.9% / 19.1% | no | no |
| tasksource-decider-nano | `compact` | 0.6/replace | 19.1% / 0.0% / 19.1% | 29.1% / 15.9% / 19.1% | no | no |
| tasksource-decider-nano | `compact` | 0.7/veto | 8.4% / 0.0% / 8.4% | 22.0% / 16.2% / 8.4% | no | no |
| tasksource-decider-nano | `compact` | 0.7/replace | 8.4% / 0.0% / 8.4% | 22.0% / 16.2% / 8.4% | no | no |
| ettin-reranker-150m-v1 | `current` | 0.5/veto | 100.0% / n/a / 100.0% | 84.6% / n/a / 100.0% | no | no |
| ettin-reranker-150m-v1 | `current` | 0.5/replace | 100.0% / n/a / 100.0% | 84.6% / n/a / 100.0% | no | no |
| ettin-reranker-150m-v1 | `current` | 0.6/veto | 100.0% / n/a / 100.0% | 84.6% / n/a / 100.0% | no | no |
| ettin-reranker-150m-v1 | `current` | 0.6/replace | 100.0% / n/a / 100.0% | 84.6% / n/a / 100.0% | no | no |
| ettin-reranker-150m-v1 | `current` | 0.7/veto | 100.0% / n/a / 100.0% | 84.6% / n/a / 100.0% | no | no |
| ettin-reranker-150m-v1 | `current` | 0.7/replace | 100.0% / n/a / 100.0% | 84.6% / n/a / 100.0% | no | no |

## 5. Per-source breakdown

Per-source cells at threshold 0.5 are shown for the heuristic baseline and for each eligible production prompt; the full matrix (all thresholds and modes, both scopes) is in `out/metrics.json`.

| Scope / source | n (pos/neg) | Heuristic accuracy | Model | Accuracy | Precision | Recall |
|---|---:|---:|---|---:|---:|---:|
| contracted / brushoff_table | 0/32 | 100.0% | heuristic baseline | 100.0% | n/a | n/a |
| contracted / meaningful_table | 3/0 | 100.0% | heuristic baseline | 100.0% | n/a | n/a |
| contracted / repo_suppression | 182/1 | 100.0% | heuristic baseline | 100.0% | n/a | n/a |
| contracted / threshold_meaningful | 30/0 | 100.0% | heuristic baseline | 100.0% | n/a | n/a |
| contracted / threshold_meaningless | 0/49 | 100.0% | heuristic baseline | 100.0% | n/a | n/a |
| augmented / brushoff_table | 0/32 | 100.0% | heuristic baseline | 100.0% | n/a | n/a |
| augmented / hard_negative | 0/39 | 0.0% | heuristic baseline | 0.0% | n/a | n/a |
| augmented / meaningful_table | 3/0 | 100.0% | heuristic baseline | 100.0% | n/a | n/a |
| augmented / repo_suppression | 182/1 | 100.0% | heuristic baseline | 100.0% | n/a | n/a |
| augmented / threshold_meaningful | 30/0 | 100.0% | heuristic baseline | 100.0% | n/a | n/a |
| augmented / threshold_meaningless | 0/49 | 100.0% | heuristic baseline | 100.0% | n/a | n/a |
| contracted / brushoff_table | 0/32 | — | tasksource-decider-nano | 100.0% | 100.0% | n/a |
| contracted / meaningful_table | 3/0 | — | tasksource-decider-nano | 0.0% | 0.0% | 0.0% |
| contracted / repo_suppression | 182/1 | — | tasksource-decider-nano | 24.6% | 0.7% | 24.2% |
| contracted / threshold_meaningful | 30/0 | — | tasksource-decider-nano | 43.3% | 0.0% | 43.3% |
| contracted / threshold_meaningless | 0/49 | — | tasksource-decider-nano | 100.0% | 100.0% | n/a |
| augmented / brushoff_table | 0/32 | — | tasksource-decider-nano | 100.0% | 100.0% | n/a |
| augmented / hard_negative | 0/39 | — | tasksource-decider-nano | 94.9% | 100.0% | n/a |
| augmented / meaningful_table | 3/0 | — | tasksource-decider-nano | 0.0% | 0.0% | 0.0% |
| augmented / repo_suppression | 182/1 | — | tasksource-decider-nano | 24.6% | 0.7% | 24.2% |
| augmented / threshold_meaningful | 30/0 | — | tasksource-decider-nano | 43.3% | 0.0% | 43.3% |
| augmented / threshold_meaningless | 0/49 | — | tasksource-decider-nano | 100.0% | 100.0% | n/a |
| contracted / brushoff_table | 0/32 | — | ettin-reranker-150m-v1 | 100.0% | 100.0% | n/a |
| contracted / meaningful_table | 3/0 | — | ettin-reranker-150m-v1 | 100.0% | n/a | 100.0% |
| contracted / repo_suppression | 182/1 | — | ettin-reranker-150m-v1 | 100.0% | 100.0% | 100.0% |
| contracted / threshold_meaningful | 30/0 | — | ettin-reranker-150m-v1 | 100.0% | n/a | 100.0% |
| contracted / threshold_meaningless | 0/49 | — | ettin-reranker-150m-v1 | 100.0% | 100.0% | n/a |
| augmented / brushoff_table | 0/32 | — | ettin-reranker-150m-v1 | 100.0% | 100.0% | n/a |
| augmented / hard_negative | 0/39 | — | ettin-reranker-150m-v1 | 0.0% | n/a | n/a |
| augmented / meaningful_table | 3/0 | — | ettin-reranker-150m-v1 | 100.0% | n/a | 100.0% |
| augmented / repo_suppression | 182/1 | — | ettin-reranker-150m-v1 | 100.0% | 100.0% | 100.0% |
| augmented / threshold_meaningful | 30/0 | — | ettin-reranker-150m-v1 | 100.0% | n/a | 100.0% |
| augmented / threshold_meaningless | 0/49 | — | ettin-reranker-150m-v1 | 100.0% | 100.0% | n/a |

## 6. Deviations, exclusions, and risks

- MiniLM-L6-v2 accuracy is explicitly excluded: its CrossEncoder classifier head was newly initialised (transformers LOAD REPORT), so only its latency/RSS rows are comparable.
- bekko-17m is scored but excluded from all recommendations: the weights carry no declared license.
- GLiDE-0.4B is explicitly excluded from the compliance matrix: the full canonical run did not complete within the PoC CPU budget (0.4B params, ~0.8-1.1 s/item; 6-item smoke only). It is the largest candidate (395M params) and cannot be the smallest compliant option; the model loads and scores on CPU, so the exclusion is a compute-budget exclusion, not a feasibility failure.
- GLiDE-0.4B prompt `canonical` is explicitly excluded: run status incomplete (6/336 rows).
- GLiDE-0.4B prompt `rubric` is explicitly excluded: run status incomplete (6/336 rows).
- GLiDE-0.4B prompt `compact` is explicitly excluded: run status incomplete (6/336 rows).
- ettin-reranker-150m-v1 prompt `query_first` is explicitly excluded: run status missing (?/? rows).
- ettin-reranker-150m-v1 prompt `rubric_query` is explicitly excluded: run status missing (?/? rows).
- all-MiniLM-L6-v2 prompt `query_first` is explicitly excluded: run status missing (?/? rows).
- all-MiniLM-L6-v2 prompt `rubric_query` is explicitly excluded: run status missing (?/? rows).
- Latency is a single-request measurement on this WSL2 CPU (`10` torch threads, float32). The 0.4B GLiDE model is compute-bound at ~0.8-1.1 s/item; the other candidates are 15-180 ms/item. The bekko/ettin/minilm runs overlapped the GLiDE canonical run, so their p50/p95 (and GLiDE's) are upper bounds under CPU contention; decider runs were measured alone. Accuracy and compliance are unaffected by the overlap.
- The corpus labels are not an independent ground truth: threshold/table labels assert the heuristic's own behaviour (so heuristic accuracy is 100% on the contracted corpus by construction), and repo labels were adjudicated by one author. A defensible production decision needs an independent, double-rated sample of real suppressions, including real heuristic-accepted brush-offs.
- Reranker probabilities are sigmoid(relevance logit) and are not calibrated decision probabilities; the 0.5/0.6/0.7 sweep is therefore a ranking-threshold sweep, not a calibrated operating point.
- MiniLM-L6-v2 is explicitly excluded from accuracy comparison: the CrossEncoder classifier head is newly initialised (transformers LOAD REPORT), so only its latency/RSS rows are meaningful.
- bekko-17m has no declared weight license; it is scored but excluded from any recommendation.
- Decision-model states omit rule/context lines when the item has no rule or context instead of injecting `(unknown)`/`(none)` literals. A placeholder-vs-omitted ablation was not run; the reranker `current` prompt, by contrast, exactly mirrors production query construction.

