# Step: Review

## Goal
Conduct adversarial peer code review on completed changes, evaluating implementation quality against requested focus criteria.

## Rules
- SKEPTICAL SCRUTINY: base findings on actual git diff and codebase state, never developer summaries.
- Focus dimensions (see agent definition for the full philosophy and dispositions guide):
  - `code`: validate clarity, wrapper discipline, complexity limits, boundary validation, and error typing.
  - `security`: audit input sanitization, injection vectors, command execution boundaries, and secret exposure risks.
  - `consistency`: ensure conformance with established repository naming idioms, directory layouts, and design patterns.
  - `result`: for spikes (`fact-finder`, `poc`, `test-assumptions`), confirm findings answer the core uncertainty and code is properly isolated.
- Reviewer boundary: reviewers critique; reviewers NEVER write fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.

## Dispositions Criteria
Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async.
Use ONLY these dispositions; any other disposition value fails validation.
# Review Suggestion Dispositions

Criteria for assigning disposition to review findings:

| Disposition | When to Assign | Engine Action |
|---|---|---|
| `fix` | Concrete defect, failing gate, broken contract, missing test, or deviation from assignment. | Returns item to `fixLoopTo` step (bounded by `maxFixRounds`); developer must address. Non-item: triggers consult. |
| `optional` | Non-blocking polish, code style improvement, minor refactor opportunity, or deferred debt. | Passed to developer if another fix round occurs; otherwise recorded as tech debt for future iterations. |
| `architect` | Architectural contradiction, interface redesign, boundary breach, or uncertainty exceeding item scope. | Triggers immediate architect consult; architect's decision is binding and final. |
| `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
| `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |

## Rules
- Defect requiring code change MUST be `fix`.
- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
- Do NOT use `human-async` when repo context or architecture docs provide the answer.

## Assignment
{
  "slug": "model-candidate-matrix",
  "kind": "fact-finder",
  "title": "Decision-model candidate matrix",
  "assignment": "GOAL: Evidence matrix for decision-model candidates to feed eval-poc, cache spike, and runtime pinning (U1). No repo edits; report only. STEPS: Build table for GLiDE-0.4B, tasksource-decider-nano, bekko-17m, ettin-150m plus MiniLM baseline with columns: license, params and weights bytes, runtime stack, py3.14 CPU wheels for linux/mac/win, custom-code and vendoring burden, pinnable revision, offline behavior. Exclude CC-BY-NC; flag Fastino plus bekko-unclear-license for human review per assumption. Record model-id and rev format for cache spike. Output structured findings consumable by eval-poc without re-research. VERIFY: Every candidate has explicit include or exclude with reason; Fastino gating and Apache-first posture explicit; no file writes.",
  "outlineRef": "model-candidate-matrix",
  "milestone": "M3",
  "wave": 1,
  "scenarioRefs": [
    "M3-1"
  ],
  "citations": [
    "src/python_setup_lint/checkers/_semantic.py:1-12",
    "src/python_setup_lint/checkers/_semantic.py:37-52",
    "src/python_setup_lint/checkers/_semantic.py:93-122",
    "pyproject.toml:28-31",
    "docs/semantic-justification.md:5-14",
    "AGENTS.md:79-85"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/model-candidate-matrix/steps/001-research-r1-a1/input.md b/.factory/tasks/modernize/items/model-candidate-matrix/steps/001-research-r1-a1/input.md
new file mode 100644
index 0000000..ea28ee2
--- /dev/null
+++ b/.factory/tasks/modernize/items/model-candidate-matrix/steps/001-research-r1-a1/input.md
@@ -0,0 +1,69 @@
+# Step: Research
+
+## Goal
+Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.
+
+## Rules
+- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
+- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
+- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
+- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
+- Fix-round re-entry: when `Review Feedback` below is non-empty, this is a fix round. Address ONLY the listed concerns with targeted follow-up investigation; do NOT re-run the full probe from scratch.
+- Tool-call budget: aim to finish within ~60 tool calls (probes that re-read files run 60-90 calls and diverge). Batch reads, prefer `grep`/`ast_grep` over re-reading, and stop once findings answer the assignment.
+
+## Assignment
+{
+  "slug": "model-candidate-matrix",
+  "kind": "fact-finder",
+  "title": "Decision-model candidate matrix",
+  "assignment": "GOAL: Evidence matrix for decision-model candidates to feed eval-poc, cache spike, and runtime pinning (U1). No repo edits; report only. STEPS: Build table for GLiDE-0.4B, tasksource-decider-nano, bekko-17m, ettin-150m plus MiniLM baseline with columns: license, params and weights bytes, runtime stack, py3.14 CPU wheels for linux/mac/win, custom-code and vendoring burden, pinnable revision, offline behavior. Exclude CC-BY-NC; flag Fastino plus bekko-unclear-license for human review per assumption. Record model-id and rev format for cache spike. Output structured findings consumable by eval-poc without re-research. VERIFY: Every candidate has explicit include or exclude with reason; Fastino gating and Apache-first posture explicit; no file writes.",
+  "outlineRef": "model-candidate-matrix",
+  "milestone": "M3",
+  "wave": 1,
+  "scenarioRefs": [
+    "M3-1"
+  ],
+  "citations": [
+    "src/python_setup_lint/checkers/_semantic.py:1-12",
+    "src/python_setup_lint/checkers/_semantic.py:37-52",
+    "src/python_setup_lint/checkers/_semantic.py:93-122",
+    "pyproject.toml:28-31",
+    "docs/semantic-justification.md:5-14",
+    "AGENTS.md:79-85"
+  ]
+}
+
+## Task Intent
+# modernize
+
+Modernize the project while preserving every material lint/check behavior.
+- Enforce the project's coding rules (CodingRules.md, AGENTS.md) across the code base.
+- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
+- Remove redundant tests.
+- Replace the embedding/rerank based justification/comment check
+  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
+  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
+  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.
+
+
+## Context & Citations
+[
+  "src/python_setup_lint/checkers/_semantic.py:1-12",
+  "src/python_setup_lint/checkers/_semantic.py:37-52",
+  "src/python_setup_lint/checkers/_semantic.py:93-122",
+  "pyproject.toml:28-31",
+  "docs/semantic-justification.md:5-14",
+  "AGENTS.md:79-85"
+]
+
+## Review Feedback
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","inconclusive"])
+- summary (string, required)
+- findings (string, required)
+- contextPack (string, optional)
+- sources (array of string, optional)
+- recommendations (array of string, optional)
diff --git a/.factory/tasks/modernize/items/model-candidate-matrix/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/modernize/items/model-candidate-matrix/steps/001-research-r1-a1/meta.yaml
new file mode 100644
index 0000000..294e2aa
--- /dev/null
+++ b/.factory/tasks/modernize/items/model-candidate-matrix/steps/001-research-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 1
+name: research
+attempt: 1
+fixRound: 1
+agent: fact-finder
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 900
+status: ok
+startedAt: 2026-11-08T10:49:26.298Z
+session: 01a1bac7-0472-7062-814e-3e8922f68dbc
+endedAt: 2026-11-08T10:54:21.745Z
+usage:
+  inputTokens: 84302
+  outputTokens: 33376
+  costUsd: 0.036475
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T10-49-27-410Z_01a1bac7-0472-7062-814e-3e8922f68dbc.jsonl
diff --git a/.factory/tasks/modernize/items/model-candidate-matrix/steps/001-research-r1-a1/output.yaml b/.factory/tasks/modernize/items/model-candidate-matrix/steps/001-research-r1-a1/output.yaml
new file mode 100644
index 0000000..969b4d4
--- /dev/null
+++ b/.factory/tasks/modernize/items/model-candidate-matrix/steps/001-research-r1-a1/output.yaml
@@ -0,0 +1,304 @@
+status: ok
+summary: "Evidence matrix complete for all four named candidates plus the MiniLM
+  baseline, with two reference rows (the incumbent jina-reranker-v2 and the
+  Apache-2.0 parent reranker ettin-reranker-150m-v1). Verdicts: INCLUDED
+  tasksource/tasksource-decider-nano (Apache-2.0, 149.0M params, 298.0 MB bf16,
+  torch+transformers only, auto CPU fallback, revision-pinnable, no
+  trust_remote_code) as the primary; INCLUDED
+  sentence-transformers/all-MiniLM-L6-v2 (Apache-2.0, 22.7M, 90.9 MB) as
+  measurement baseline only; INCLUDED (fallback)
+  cross-encoder/ettin-reranker-150m-v1 (Apache-2.0, 149.0M, 596 MB) because it
+  is a zero-code-change CrossEncoder drop-in; FLAGGED fastino/GLiDE-0.4B for
+  human review (Fastino Community License, revenue threshold + attribution +
+  derivative copyleft; NOT gated on the Hub — gated:false — but hosted API
+  requires a key; 394.8M params / 789.6 MB, i.e. LARGER than the incumbent
+  278.4M / ~557 MB, so it also fails the intent's 'or smaller' premise) and
+  FLAGGED hotchpotch/bekko-system-one-v0-17m (card states no license is
+  assigned: 'The released-weight and bundled inference-code license declaration
+  remains to be finalized'); EXCLUDED jhu-clsp/ettin-encoder-150m (MIT but
+  ModernBertForMaskedLM with no decision head, fp32 pickle weights) and the
+  incumbent jinaai/jina-reranker-v2-base-multilingual (CC-BY-NC-4.0, 278.4M).
+  Python 3.14 CPU wheels verified from PyPI and from the repo's own uv.lock:
+  torch cp314 covers manylinux_2_28 x86_64/aarch64, macOS 14 arm64 and win_amd64
+  only (no macOS x86_64, no win_arm64); safetensors/tokenizers ship cp3x-abi3;
+  transformers and sentence-transformers are pure-Python. Runtime pinning
+  conflict quantified: uv.lock holds torch 2.12.1, transformers 5.12.1,
+  sentence-transformers 5.6.0, while GLiDE pins transformers==5.17.0 +
+  torch==2.14.0 and bekko pins transformers==5.17.0 +
+  sentence-transformers==6.1.0 + torch>=2.10,<2.11; tasksource-decider-nano pins
+  nothing and fits the existing lock unchanged."
+findings: |-
+  # Decision-model candidate matrix (U1)
+
+  Scope: replace the sentence-transformers cross-encoder used in `src/python_setup_lint/checkers/_semantic.py` with a CPU-friendly small decision model. Read-only research: no repository files were modified.
+
+  Ground truth for the integration point: `check_if_meaningful(text, *, rule, code_context, comment)` at `src/python_setup_lint/checkers/_base.py:143-158` calls `semantic_check_if_meaningful(...)`; the reranker returns `bool | None` where `None` means 'fall back to heuristic'. Latency budget is therefore one short binary classification per suppression comment, with a hard requirement that any model failure degrades to the heuristic.
+
+  ## 1. Master matrix
+
+  Legend: L/M/W = Linux x86_64 / macOS / Windows x86_64, at CPython 3.14. 'CPU wheels' means a cp314 (or cp3x-abi3) wheel exists on PyPI **and** the model's code path can run on CPU (vendor-validated vs. plausible-but-unvalidated is called out per row).
+
+  | Candidate | License | Params / weights on disk | Runtime stack | py3.14 CPU wheels L/M/W | Custom code & vendoring burden | Pinnable revision | Offline behaviour | Verdict |
+  |---|---|---|---|---|---|---|---|---|
+  | `tasksource/tasksource-decider-nano` | **Apache-2.0** (card frontmatter, `license:apache-2.0` tag, `cardData.license`) | 149,015,041 BF16 → `model.safetensors` 298.04 MB; repo 301.66 MB | torch + transformers (`AutoConfig`/`AutoModel`/`AutoTokenizer`) + safetensors + numpy + huggingface_hub | ✅ / arm64 only / ✅ (torch cp314) — pure-Python transformers | **Low-Med**: vendor `decider.py` (291 lines) + optional `decision_index_engine.py` (50 lines); **no** `trust_remote_code`; plain HF classes | ✅ `Decider.from_pretrained(repo, revision=<sha>)` → `snapshot_download(..., revision=...)` | Local dir bypasses Hub; else `HF_HUB_OFFLINE=1` | **INCLUDE — primary** (Apache-first) |
+  | `fastino/GLiDE-0.4B` | **Other / Fastino Community License** (`license_name: fastino-community`, LICENSE in repo). Not CC-BY-NC | 394,781,696 BF16 → 789.58 MB safetensors + 0.52 MB `readout.safetensors`; repo 812.36 MB | torch + transformers + **vendored `glide/` package** + safetensors + numpy + jinja2 + pillow | ✅ / arm64 only / ✅ wheels exist, **but** CPU runtime is vendor-unvalidated (card tests Python 3.12 + CUDA 13.0 + RTX PRO 6000; `GLIDE_DEVICE` defaults to `cuda`) | **High**: `glide/` ≈ 1,158 LOC (model 463, encoder 107, prompt 145, images 56, nvfp4 169, server 212, init 6) + `render_tokenizer/` chat template (20 MB tokenizer.json) + pillow | ✅ `Glide.from_pretrained(..., revision=)` (model.py:223-232) | Local dir → `os.path.isdir` short-circuit; else `HF_HUB_OFFLINE` | **FLAG → human review** (license); include in eval-poc only as accuracy ceiling |
+  | `hotchpotch/bekko-system-one-v0-17m` | **None declared.** Card 'License' section: 'The released-weight and bundled inference-code license declaration remains to be finalized. This card does not assign a license.' (GitHub code repo is MIT — code only) | 16.80M total / 4M non-embedding → `0_BekkoInference/model.safetensors` 67.20 MB fp32; ONNX 29.02 MB; repo 103.51 MB | torch>=2.10,<2.11 + transformers==5.17.0 + sentence-transformers==6.1.0 + safetensors + tqdm; **`trust_remote_code=True`** dynamic module `inference_v0.BekkoSentenceTransformer` | ✅ / arm64 only / ✅ in principle, but the pins (torch<2.11) force a downgrade from the lock's 2.12.1 | **High**: 1,702-line dynamic module executed from the Hub; separate `0_BekkoInference/` weight layout; both loads must share a revision | ✅ `get_class_from_dynamic_module(..., revision=)` + ctor `revision=`; card explicitly says 'pass the same revision="FULL_COMMIT_HASH" to both calls' | Weakest: needs snapshot **and** dynamic-module cache; network call at import unless `HF_HUB_OFFLINE=1` and module pre-cached | **FLAG → human review** (unassigned license); exclude from default |
+  | `jhu-clsp/ettin-encoder-150m` | **MIT** | ~149M, fp32 `pytorch_model.bin` **598.66 MB** (no safetensors in repo) | transformers only (ModernBertForMaskedLM) | ✅ / arm64 only / ✅ | **None** — but also **no decision/classification head**; scoring requires training a readout | ✅ `from_pretrained(..., revision=)` | Local dir / `HF_HUB_OFFLINE` | **EXCLUDE** — not a decision model (MLM backbone; fp32 pickle; superseded by its own reranker fine-tune) |
+  | `sentence-transformers/all-MiniLM-L6-v2` | **Apache-2.0** | 22,713,728 F32 → `model.safetensors` 90.87 MB; int8 ONNX 23.03 MB | torch + sentence-transformers `CrossEncoder` (the **current** code path) | ✅ / arm64 only / ✅ | **None** — zero integration change vs today | ✅ (pin via `snapshot_download(revision=)` + local path) | Local dir / `HF_HUB_OFFLINE` | **INCLUDE — baseline floor only** (unchanged API) |
+  | `cross-encoder/ettin-reranker-150m-v1` (bonus) | **Apache-2.0** | 149,014,272 F32 → `model.safetensors` 596.07 MB; int8 ONNX 150.63 MB | torch + sentence-transformers `CrossEncoder` (has `1_Pooling`/`2_Dense`/`3_LayerNorm`/`4_Dense` modules) | ✅ / arm64 only / ✅ | **None** — real CrossEncoder, drop-in | ✅ snapshot/revision | Local dir / `HF_HUB_OFFLINE` | **INCLUDE — zero-code-change fallback** |
+  | `jinaai/jina-reranker-v2-base-multilingual` (incumbent) | **CC-BY-NC-4.0** | 278,437,633 BF16 → ~557 MB (computed, params×2) | torch + transformers; `custom_code` tag | ✅ / arm64 only / ✅ | Medium (trust_remote_code tag) | ✅ | Hub cache | **EXCLUDE — CC-BY-NC policy** |
+
+  ### Byte/param arithmetic (cross-checks the vendor numbers)
+  - GLiDE: 394,781,696 × 2 B = 789.56 MB ≈ 789.58 MB file ✅ (bf16)
+  - decider-nano: 149,015,041 × 2 B = 298.03 MB ≈ 298.04 MB file ✅ (bf16)
+  - bekko-17m: 16.8M × 4 B = 67.2 MB ✅ (fp32)
+  - ettin-encoder-150m: ~149M × 4 B = 598.66 MB ✅ (fp32, `.bin`)
+  - MiniLM: 22,713,728 × 4 B = 90.85 MB ≈ 90.87 MB ✅ (fp32)
+
+  ## 2. Python 3.14 CPU wheel facts (verified, not assumed)
+
+  From PyPI JSON (`/pypi/<pkg>/json`, latest releases) and from the repo's own resolver output in `uv.lock`:
+
+  | Package | Version checked | CPython 3.14 coverage |
+  |---|---|---|
+  | `torch` | 2.12.1 (in `uv.lock:1552-1553`), 2.14.0, 2.15.0 | cp314 wheels: `manylinux_2_28_x86_64`, `manylinux_2_28_aarch64`, `macosx_14_0_arm64`, `win_amd64`. **No macOS x86_64 and no win_arm64.** `requires_python >=3.11` |
+  | `onnxruntime` | 1.31.1 | cp314: linux x86_64/aarch64, macosx_14_0_arm64, win_amd64, **win_arm64** |
+  | `safetensors` | 0.8.0 | `cp310-abi3-*` for linux/mac/win (abi3 ⇒ 3.14 OK) |
+  | `tokenizers` | 0.23.3 / lock 0.22.2 | `cp3xx-abi3-*` for linux/mac/win |
+  | `pillow` (GLiDE only) | 13.0.0 | cp314 incl. `macosx_10_15_x86_64`, `macosx_11_0_arm64`, manylinux x86_64/aarch64, win |
+  | `transformers` | 5.22.2 / lock 5.12.1 | `py3-none-any` (pure Python) |
+  | `sentence-transformers` | 6.2.0 / lock 5.6.0 | `py3-none-any` |
+
+  Consequences for the 'CPU wheels for linux/mac/win' column:
+  1. Any candidate that needs torch is **unsupported on Intel macOS** — no `macosx_*_x86_64` cp314 torch wheel exists for 2.12.1/2.14.0/2.15.0. Plan a heuristic-only fallback there (already the natural `None` path at `_base.py:157-158`).
+  2. Linux needs glibc ≥ 2.28 (manylinux_2_28).
+  3. Windows arm64 unsupported for torch (onnxruntime would be the only route).
+  4. The repo already resolves a 3.14-clean ML stack (`uv.lock` contains 284 `cp314` wheel URLs), so no packaging blocker exists for the torch-based candidates.
+
+  ## 3. Licensing posture (explicit)
+
+  **Apache-first ordering used:** Apache-2.0 → MIT → source-available community licence (flagged) → no licence (excluded).
+
+  - **`tasksource/tasksource-decider-nano` — Apache-2.0.** Satisfies the Apache-first posture directly; no attribution/notice burden beyond the licence text; commercial use unencumbered.
+  - **`sentence-transformers/all-MiniLM-L6-v2` — Apache-2.0.** Baseline is clean.
+  - **`cross-encoder/ettin-reranker-150m-v1` — Apache-2.0.** Parent of decider-nano (`base_model: cross-encoder/ettin-reranker-150m-v1`); cleanest zero-code fallback.
+  - **`jhu-clsp/ettin-encoder-150m` — MIT.** Permissive, second tier, but excluded for technical reasons (no head).
+  - **Fastino GLiDE — flagged, not excluded.** Exact obligations from `LICENSE` (fetched verbatim):
+    - §2: entities with **Annual Revenue > 10,000,000 USD** using it in **Production for Commercial Use** must obtain a separate written agreement (hello@fastino.ai).
+    - §4: **any** Commercial Use must prominently display **'Built with Fastino GLiDE'**.
+    - §5: derivative works must be distributed under the same licence and carry §§2–4 forward (copyleft-ish).
+    - §6(b): **'Production does not include evaluation, testing, benchmarking, or research, or a pilot lasting no more than ninety (90) days'** — an eval spike is expressly permitted; shipping it inside a lint tool that consumers run in CI is not obviously 'evaluation'.
+    - Base model is Ettin-encoder-400m under MIT; `licenses/Ettin-encoder-400m-LICENSE` is preserved in the repo.
+  - **Gating status (three distinct senses, all checked):**
+    1. Hub access: `gated: false` per `GET /api/models/fastino/GLiDE-0.4B` — **no click-through gate**, no token needed to download.
+    2. Hosted inference: gated behind an API key (`POST https://api.fastino.ai/v1/systemone`, model `fastino/GLiDE`, key from agent.fastino.ai).
+    3. Licence gate: revenue threshold + attribution (above).
+  - **bekko-17m — no licence.** Card text is unambiguous (verbatim): *'The released-weight and bundled inference-code license declaration remains to be finalized. This card does not assign a license.'* HF API returns `license: null`; no `license:*` tag; the GitHub training/inference repo is MIT but that covers code, not weights. **Cannot be adopted without a written clarification.**
+  - **CC-BY-NC exclusions (policy):** the incumbent `jinaai/jina-reranker-v2-base-multilingual` is **CC-BY-NC-4.0** (plus `custom_code`), so today's default already violates the exclusion rule — this is the strongest single justification for the swap. Other CC-BY-NC models in this family were rejected on sight: `pngwn/system-one-qwen3.5-4b-scorer`, `jiazhengli/edu_jev-0.8B`, `ABLingss/MUQ-JEV`.
+
+  ## 4. Size reality check vs. the intent ('GLiDE-0.4B or smaller')
+
+  The incumbent is 278.4M params (~557 MB bf16). **GLiDE is 394.8M params / 789.58 MB — larger**, and its repo pull is 812 MB. Only two candidates actually shrink the footprint:
+  - `tasksource/tasksource-decider-nano`: 149.0M / 298.04 MB (−46% params, −47% bytes vs incumbent).
+  - `bekko-system-one-v0-17m`: 16.8M / 67.20 MB (−94% params) — but unlicensed.
+
+  Quality signals are **not directly comparable** and must not be used to rank: decider-nano reports Decision Index 0.4 Full = 19.85 (ranked #1 under 300M, Oct 2026) and Decision Index 0.3 public = 33.51; GLiDE reports 51.10 on *Decision Index 0.3.1* public with the official kit on an RTX PRO 6000. Different index versions ⇒ eval-poc must score every candidate with one harness on one prompt set rather than copy vendor numbers.
+
+  ## 5. Decision-API fit (what eval-poc must write)
+
+  | Candidate | Call surface | Mapping to the justification task |
+  |---|---|---|
+  | tasksource-decider-nano | `Decider.from_pretrained(repo, revision=...)`; `Decider.score_many([(state, instructions, option_texts)])` → list of logit arrays; `answer(state=..., questions={'q': {'type': 'choice'|'noul', 'instructions': ..., 'criteria': {...}}})` → probabilities | `state` = rule + truncated code context; `instructions` = 'Does this comment give a specific technical reason for the suppression?'; options = `['specific technical reason', 'boilerplate or restates the rule']`; `noul` gives P(yes) for a binary gate |
+  | GLiDE-0.4B | `Glide.from_pretrained(path_or_repo_id, device='cpu', revision=...)`; `model.decide(state=..., questions={'intent': {'type': 'choice'|'noul'|'score', 'instructions': ..., 'criteria': {...}}})` | Same shape; `noul` returns P(yes); 255-way readout, temperature in `decision_config.json` |
+  | bekko-17m | `get_class_from_dynamic_module('inference_v0.BekkoSentenceTransformer', repo)(repo, trust_remote_code=True, device='cpu')`; `model.predict(inputs)` with `state_json` + `decisions[{type: 'choice'|'noul'|'score'}]` | Same shape; returns `selected_id` + `probabilities` |
+  | MiniLM / ettin-reranker | `CrossEncoder(model, cache_folder=...).predict([(primary, query)])` → score, threshold 0.5 (current code, `_semantic.py:178-186`) | Today's (mis)use: self-pair or 'rule: … | context: …' query. Preserved only as a baseline measurement |
+
+  Constraint that shapes eval-poc: all three decision models need a rendered *prompt template* (state/question/option formatting) that does not exist yet; the template version must be part of the cache key (see §6). Current call site supplies only `text`, `rule`, `code_context` (already truncated to 200 chars at `_semantic.py:173`) and `comment`.
+
+  ## 6. Cache-spike handoff (model-id + rev format, gaps)
+
+  **Canonical key string format:** `f"{repo_id}@{revision}"` where `revision` is the 40-hex commit SHA returned as `sha` by `GET https://huggingface.co/api/models/{repo_id}` (and accepted by `snapshot_download(..., revision=)` — branch, tag, PR ref or commit hash, per https://huggingface.co/docs/huggingface_hub/guides/download).
+
+  Pinned values captured today (main-branch HEAD at research time — **re-resolve and freeze at implementation time**):
+
+  ```
+  tasksource/tasksource-decider-nano@2c7c01ffe5aba74dd15968cf38b0fdc83d1f3810   # Apache-2.0, PRIMARY
+  fastino/GLiDE-0.4B@6bda7ab91aeb36dcad6d27828a8871e548c7fc71                     # Fastino Community, FLAGGED
+  hotchpotch/bekko-system-one-v0-17m@b886a1f9b91f4e8368d7830080d52d955e2c8dfa     # unlicensed, FLAGGED
+  cross-encoder/ettin-reranker-150m-v1@025501c4e0f9bbeb4c5b198318e0089ff061cc14   # Apache-2.0, fallback
+  jhu-clsp/ettin-encoder-150m@45d08642849e5c5701b162671ac811b7654bfd9f           # MIT, excluded	sentence-transformers/all-MiniLM-L6-v2@1110a243fdf4706b3f48f1d95db1a4f5529b4d41
+  jinaai/jina-reranker-v2-base-multilingual@9cfeff2df7d40d1b78e75e5e9cebec92a99813c9  # CC-BY-NC, incumbent
+  ```
+
+  Existing cache defects the spike must fix (all verified in code):
+  1. **Model identity is an unpinned env string.** `_RERANKER_MODEL = os.environ.get('PYTHON_SETUP_LINT_RERANKER_MODEL', 'jina-reranker-v2-base-multilingual')` (`_semantic.py:49-52`) — no revision; a re-tagged repo silently changes verdicts.
+  2. **Key is a 64-bit truncation.** `hashlib.sha256(...).digest()[:8]` → `int.from_bytes(...)` (`_semantic.py:143-155`). 64 bits invites collisions once the cache is shared/committed; also no `format_version`, no prompt-template id, no dtype/quantization id (only `text|rule|code_context|comment|model`).
+  3. **Unbounded, per-machine, gitignored file.** `~/.cache/python-setup/semantic/results.json` (`_semantic.py:38,45`), rewritten wholesale on every new entry (`_semantic.py:71-78`), no eviction — the exact defects recorded in `docs/adr/ADR-003.md:1-3` and `docs/adr/ADR-007.md:1-3`, which mandate a **git-stored, self-cleaning cache** and **read-only lint with explicit cache refresh**.
+  4. **Cross-machine verdict divergence.** Because `sentence-transformers` is absent from dev/CI (`pyproject.toml:28-31` optional extra only; local probe: torch/transformers/sentence_transformers/safetensors all MISSING), `_load_reranker()` returns `None` and the heuristic decides — so W9704 outcomes differ by machine (`docs/adr/ADR-002.md:1-3`).
+
+  Recommended key composition for the spike: `sha256(format_version | model_id@revision | prompt_template_version | dtype | rule | normalized_text | code_context)[:16]` stored as a hex string (not an int), payload `{verdict, score, model, prompt_version, rule}`, JSON keys sorted, entries capped with LRU eviction, and written only on explicit `--refresh-cache` (ADR-007).
+
+  ## 7. Runtime pinning (U1)
+
+  | Item | `uv.lock` today | GLiDE needs | bekko needs | decider-nano needs |
+  |---|---|---|---|---|
+  | torch | **2.12.1** (`uv.lock:1552-1553`) | 2.14.0 | `>=2.10,<2.11` (**downgrade**) | any recent (no pin) |
+  | transformers | **5.12.1** (`uv.lock:1596-1597`) | `==5.17.0` | `==5.17.0` | no pin |
+  | sentence-transformers | **5.6.0** (`uv.lock:1363-1364`) | not needed | `==6.1.0` | not needed |
+  | extras | `semantic = ['sentence-transformers>=3.0.0']` (`pyproject.toml:28-31`) | new `glide` extra + torch | new extra + downgraded torch | new `decision` extra (torch+transformers+safetensors+numpy) |
+
+  Implication: **adopting GLiDE or bekko forces the whole dev environment onto new pins** (and, for bekko, a torch downgrade below the currently locked 2.12.1). `tasksource-decider-nano` is the only candidate that can be added as an optional extra **without touching existing pins** — decisive for the 'runtime pinning' workstream. Also note `requires-python = '>=3.14'` (`pyproject.toml:4`) means every candidate must ship cp314-compatible wheels, which rules out any pure-`.bin`-only stack on Intel macOS and makes the `safetensors`-only candidates preferable.
+
+  Declaration hygiene: `pyproject.toml:28-31` currently declares `sentence-transformers>=3.0.0` with no upper bound; if a decision-model extra is added, pin the real transitive floor (`torch`, `transformers`) rather than inheriting an unpinned MTEB stack.
+
+  ## 8. Offline behaviour
+
+  - Documented contract: `HF_HUB_OFFLINE=1` makes no HTTP calls; only cached files are read, and an error is raised if absent (https://huggingface.co/docs/huggingface_hub/package_reference/environment_variables#hfhuboffline). `snapshot_download()` defaults to the latest revision and must be given `revision=` to be reproducible (https://huggingface.co/docs/huggingface_hub/guides/download).
+  - **Strongest offline posture: `tasksource-decider-nano` and `GLiDE`.** Both short-circuit to a local directory without touching the Hub (`decider.py:78-83` `if p.is_dir(): return p`; `glide/model.py:230-232` `if not os.path.isdir(path): snapshot_download(...)`). A vendored snapshot directory (wheel data + `importlib.resources`) therefore gives fully hermetic, network-free lint.
+  - **Weakest: `bekko-17m`.** `trust_remote_code=True` executes repository Python at load and uses the *separate* dynamic-module cache; offline operation requires both the snapshot and that module cache to be warm, and it is the only candidate that executes third-party code as part of a lint run.
+  - MiniLM and `ettin-reranker-150m-v1` sit on the existing `CrossEncoder(cache_folder=...)` path (`_semantic.py:111-118`), which already works with a pre-populated cache dir — offline behaviour is unchanged from today.
+
+  ## 9. Explicit include/exclude ledger
+
+  | Candidate | Verdict | Reason (one line) |
+  |---|---|---|
+  | `tasksource/tasksource-decider-nano` | **INCLUDE (primary)** | Apache-2.0; 149.0M / 298.0 MB bf16; torch+transformers only; CPU default when no GPU (`decider.py:105`); vendored 291-line helper, no `trust_remote_code`; `revision=` pinning; fits existing lock |
+  | `sentence-transformers/all-MiniLM-L6-v2` | **INCLUDE (baseline)** | Apache-2.0; 22.7M / 90.9 MB; identical `CrossEncoder` API so it measures the 'no change' floor; not a decision head, so not a destination |
+  | `cross-encoder/ettin-reranker-150m-v1` | **INCLUDE (fallback)** | Apache-2.0; 149.0M / 596.1 MB fp32; genuine CrossEncoder with pooling/dense modules ⇒ zero code change if the decision-model route is rejected |
+  | `fastino/GLiDE-0.4B` | **FLAG → human review** (eval-only) | Fastino Community License: >$10M revenue written agreement, 'Built with Fastino GLiDE' attribution, derivative copyleft; evaluation is expressly allowed (§6b) but shipping is not; not gated on the Hub (`gated:false`), hosted API needs a key; also 394.8M / 789.6 MB — **larger** than the incumbent |
+  | `hotchpotch/bekko-system-one-v0-17m` | **FLAG → human review** (exclude from default) | No licence assigned in the card; 1,702-line `trust_remote_code` module; pins torch<2.11 (downgrade); attractive size (16.8M / 67.2 MB) makes it worth revisiting *after* licence clarification |
+  | `jhu-clsp/ettin-encoder-150m` | **EXCLUDE** | MIT, but `ModernBertForMaskedLM` — no decision/classification head, fp32 `pytorch_model.bin` only (598.66 MB, pickle); would require training + a new eval, out of scope for a drop-in swap |
+  | `jinaai/jina-reranker-v2-base-multilingual` (incumbent) | **EXCLUDE** | CC-BY-NC-4.0 — policy exclusion; 278.4M / ~557 MB bf16; `custom_code`; also the model being replaced |
+
+  ## 10. Open risks for eval-poc / cache spike / runtime pinning
+
+  1. **CPU validation for GLiDE is absent**, not disproven: `EncoderNetwork` is plain `ModernBertModel` + `sdpa` + `nn.Linear` readout and `device` is a parameter, so `device='cpu'` should work — but `Glide.from_pretrained` unconditionally calls `torch.backends.cuda.enable_cudnn_sdp(False)` (model.py:233) and defaults `device='cuda'`; the card only validates CUDA. Treat CPU as a spike item, not a fact.
+  2. **bf16 on CPU.** decider-nano disables autocast unless CUDA (`decider.py:141`), so CPU inference is fp32 and ~2× the bf16 memory/streaming cost; budget accordingly (a 149M model is still ~0.6 GB RSS in fp32).
+  3. **`ettin-encoder-150m` loads via `torch.load` pickle** (no safetensors) — supply-chain and `weights_only` friction; another reason it is excluded.
+  4. **Vendor scores are not comparable** (Decision Index 0.3.1 vs 0.4 vs S1MB); the only ranking that counts is eval-poc's own corpus.
+  5. **No OS CI matrix exists in the repo** (no `.github/workflows` present), so cross-platform claims can only rest on wheel availability; if macOS/Windows support is material, add a smoke test that asserts graceful `None` fallback where torch wheels are unavailable (Intel macOS).
+contextPack: |-
+  # Model candidate matrix — condensed handoff
+
+  ## Chosen stack (recommended)
+  - **Primary:** `tasksource/tasksource-decider-nano` pinned at `@2c7c01ffe5aba74dd15968cf38b0fdc83d1f3810`, Apache-2.0, 149.0M params, 298.04 MB `model.safetensors` (bf16), load via vendored `decider.py` (291 lines) using torch+transformers+safetensors+numpy only. API: `Decider.from_pretrained(repo_or_dir, revision=<sha>)` then `score_many([(state, instructions, [opt1, opt2])])` or `answer(state=..., questions={'q': {'type':'noul', ...}})`. `device` defaults to cuda-if-available else **cpu** (decider.py:105).
+  - **Baseline (do not ship):** `sentence-transformers/all-MiniLM-L6-v2@1110a243fdf4706b3f48f1d95db1a4f5529b4d41`, Apache-2.0, 22.7M / 90.87 MB, same `CrossEncoder.predict` + 0.5 threshold as today.
+  - **Zero-code fallback:** `cross-encoder/ettin-reranker-150m-v1@025501c4e0f9bbeb4c5b198318e0089ff061cc14`, Apache-2.0, 149.0M / 596.07 MB fp32, real CrossEncoder layout.
+  - **Flagged (legal):** `fastino/GLiDE-0.4B@6bda7ab91aeb36dcad6d27828a8871e548c7fc71` (Fastino Community License; eval allowed, shipping needs review; 394.8M / 789.58 MB — bigger than the 278.4M incumbent) and `hotchpotch/bekko-system-one-v0-17m@b886a1f9b91f4e8368d7830080d52d955e2c8dfa` (no licence assigned; 1,702-line trust_remote_code module; torch<2.11 pin).
+  - **Excluded:** `jhu-clsp/ettin-encoder-150m` (MIT but MLM backbone, no head, 598.66 MB pickle), `jinaai/jina-reranker-v2-base-multilingual` (CC-BY-NC-4.0, the incumbent).
+
+  ## Cache key contract
+  `f"{repo_id}@{40-hex-sha}"`, where sha = `GET /api/models/{repo_id}` → `sha`, passed as `revision=` to `snapshot_download`/`from_pretrained`. Hash over `format_version | model_id@revision | prompt_template_version | dtype | rule | normalized_text | code_context`, digest `[:16]` hex. Payload `{verdict, score, model, prompt_version, rule}`, sorted JSON, LRU-capped, written only on explicit refresh (ADR-003/ADR-007).
+
+  ## Runtime
+  Existing lock: torch 2.12.1 / transformers 5.12.1 / sentence-transformers 5.6.0, all cp314-clean. decider-nano needs no pin changes; GLiDE (torch 2.14.0, transformers 5.17.0) and bekko (torch<2.11, transformers 5.17.0, ST 6.1.0) each force a lock migration.
+
+  ## Wheel reality
+  cp314 torch wheels: manylinux_2_28 x86_64/aarch64, macosx_14_0_arm64, win_amd64. **No macOS Intel, no win_arm64.** safetensors/tokenizers are cp3x-abi3 (3.14 OK); transformers/sentence-transformers pure-Python.
+
+  ## Offline
+  `HF_HUB_OFFLINE=1` (docs) + a local snapshot dir is best; GLiDE and decider-nano short-circuit on `os.path.isdir`; bekko needs the dynamic-module cache and executes Hub Python (`trust_remote_code=True`).
+
+  ## Cite map
+  `src/python_setup_lint/checkers/_semantic.py:37-52,93-122,143-155,159-188`; `src/python_setup_lint/checkers/_base.py:143-158`; `pyproject.toml:4,28-31`; `docs/semantic-justification.md:5-14,34-45`; `docs/adr/ADR-002.md:1-3`, `ADR-003.md:1-3`, `ADR-007.md:1-3`; `uv.lock:1363-1364,1552-1553,1596-1597`.
+sources:
+  - src/python_setup_lint/checkers/_semantic.py (lines 1-12, 37-52, 93-122,
+    143-155, 159-188)
+  - src/python_setup_lint/checkers/_base.py:143-158
+  - pyproject.toml:4,28-31
+  - docs/semantic-justification.md:5-14,34-45
+  - docs/custom-checks.md:97
+  - docs/adr/ADR-002.md:1-3
+  - docs/adr/ADR-003.md:1-3
+  - docs/adr/ADR-007.md:1-3
+  - uv.lock:1363-1364 (sentence-transformers 5.6.0), 1552-1553 (torch 2.12.1),
+    1596-1597 (transformers 5.12.1)
+  - AGENTS.md:79-85
+  - https://huggingface.co/tasksource/tasksource-decider-nano (README,
+    decider.py, decider_config.json, config.json; sha
+    2c7c01ffe5aba74dd15968cf38b0fdc83d1f3810)
+  - https://huggingface.co/fastino/GLiDE-0.4B (README, LICENSE, NOTICE,
+    requirements.txt, glide/model.py, glide/encoder.py, glide/prompt.py; sha
+    6bda7ab91aeb36dcad6d27828a8871e548c7fc71)
+  - https://huggingface.co/hotchpotch/bekko-system-one-v0-17m (README incl.
+    License section, requirements.txt, inference_v0.py,
+    0_BekkoInference/inference_config.json; sha
+    b886a1f9b91f4e8368d7830080d52d955e2c8dfa)
+  - https://huggingface.co/jhu-clsp/ettin-encoder-150m (sha
+    45d08642849e5c5701b162671ac811b7654bfd9f)
+  - https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 (sha
+    1110a243fdf4706b3f48f1d95db1a4f5529b4d41)
+  - https://huggingface.co/cross-encoder/ettin-reranker-150m-v1 (sha
+    025501c4e0f9bbeb4c5b198318e0089ff061cc14)
+  - https://huggingface.co/jinaai/jina-reranker-v2-base-multilingual (license
+    cc-by-nc-4.0; sha 9cfeff2df7d40d1b78e75e5e9cebec92a99813c9)
+  - https://huggingface.co/docs/huggingface_hub/guides/download (revision
+    parameter accepts branch/tag/PR/commit hash)
+  - https://huggingface.co/docs/huggingface_hub/package_reference/environment_variables#hfhuboffline
+    (HF_HUB_OFFLINE=1)
+  - https://pypi.org/pypi/torch/json (2.12.1/2.14.0/2.15.0 cp314 wheel matrix)
+  - https://pypi.org/pypi/onnxruntime/json (1.31.1 cp314)
+  - https://pypi.org/pypi/safetensors/json (0.8.0 cp310-abi3)
+  - https://pypi.org/pypi/tokenizers/json (0.23.3 cp3x-abi3)
+  - https://pypi.org/pypi/pillow/json (13.0.0 cp314)
+  - https://pypi.org/pypi/transformers/json,
+    https://pypi.org/pypi/sentence-transformers/json (pure-Python wheels)
+recommendations:
+  - "Adopt tasksource/tasksource-decider-nano as the default decision model:
+    Apache-2.0, 149.0M params / 298.04 MB bf16,
+    torch+transformers+safetensors+numpy only, auto CPU fallback, `revision=`
+    pinning, and no changes to the existing torch/transformers pins in uv.lock.
+    Vendor decider.py (291 lines) into the package rather than relying on the
+    Hub copy."
+  - "Keep sentence-transformers/all-MiniLM-L6-v2 and
+    cross-encoder/ettin-reranker-150m-v1 as measured baselines/fallbacks only:
+    both are Apache-2.0 and need zero code change, so they give a clean
+    'unchanged API' floor for eval-poc and an escape hatch if the decision-model
+    pipeline underperforms."
+  - "Send fastino/GLiDE-0.4B to human review before any default adoption. Record
+    explicitly: Hub access is not gated (`gated:false`), hosted inference needs
+    an API key, and the Fastino Community License imposes a >$10M-revenue
+    written agreement, a 'Built with Fastino GLiDE' attribution, and derivative
+    copyleft; evaluation/testing/benchmarking is expressly permitted (§6b). Note
+    it is 394.8M params / 789.58 MB — larger than the 278.4M / ~557 MB
+    incumbent, so it cannot be justified as a size reduction."
+  - "Hold hotchpotch/bekko-system-one-v0-17m pending a written licence: the
+    model card states 'the released-weight and bundled inference-code license
+    declaration remains to be finalized. This card does not assign a license.'
+    It also requires a 1,702-line trust_remote_code dynamic module and pins
+    torch<2.11, which would downgrade the lock from 2.12.1; revisit only if the
+    primary candidate misses the accuracy bar and the licence is clarified."
+  - "Exclude jhu-clsp/ettin-encoder-150m from the matrix as a decision model:
+    MIT-licensed but ModernBertForMaskedLM with no classification head and only
+    fp32 pytorch_model.bin (598.66 MB); it is the backbone lineage, not a usable
+    judge. Exclude the incumbent jinaai/jina-reranker-v2-base-multilingual
+    outright — it is CC-BY-NC-4.0."
+  - Freeze cache identities as `repo_id@<40-hex sha>` (captured in findings §6)
+    and re-resolve the SHAs at implementation time. Extend the key with
+    format_version, prompt_template_version, dtype, rule and a 128-bit hex
+    digest (replacing the current 64-bit int at _semantic.py:143-155); store
+    score+verdict and cap entries with LRU eviction; write the git-tracked cache
+    only on explicit refresh per ADR-003/ADR-007.
+  - Do not adopt the vendors' version pins wholesale. Keep torch 2.12.1 /
+    transformers 5.12.1 / sentence-transformers 5.6.0 (all cp314-resolved) and
+    add the decision model as a separate opt-in extra; if GLiDE is ever
+    promoted, its torch 2.14.0 / transformers 5.17.0 pins must live in that
+    extra, not in the main dependency set.
+  - "Document the wheel boundary: cp314 torch exists only for manylinux_2_28
+    (x86_64/aarch64), macOS 14 arm64 and win_amd64 — no macOS Intel and no
+    win_arm64. Add a smoke test that asserts graceful `None` → heuristic
+    fallback on platforms without a torch wheel, and keep the heuristic path
+    (already present at _base.py:157-158) as the supported degraded mode on
+    Intel macOS."
+  - For offline/hermetic lint, ship a vendored snapshot directory and load by
+    local path (both GLiDE and decider-nano short-circuit on os.path.isdir),
+    with HF_HUB_OFFLINE=1 as belt-and-braces. Avoid trust_remote_code entirely
+    in the shipped path, since it executes Hub-supplied Python during a lint run
+    and depends on a separate module cache.
+  - "Have eval-poc score every candidate on one shared corpus and one prompt
+    template instead of citing vendor numbers: GLiDE reports Decision Index
+    0.3.1 (51.10), decider-nano reports 0.4 Full (19.85) and 0.3 public (33.51),
+    and bekko reports S1MB — none are comparable. Include the existing brush-off
+    parametrization in tests/checkers/test_semantic_check.py (lines ~155-210)
+    and the current truncation of code_context to 200 chars (_semantic.py:173)
+    as fixed eval conditions."

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["approved","changes_requested"])
- summary (string, required)
- suggestions (array of object, required)
  - id (string, required)
  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async"])
  - summary (string, required)
  - detail (string, optional)
  - location (object, optional)
    - file (string, required)
    - line (integer, optional)
