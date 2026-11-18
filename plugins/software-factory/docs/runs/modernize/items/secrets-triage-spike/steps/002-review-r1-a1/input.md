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
  "slug": "secrets-triage-spike",
  "kind": "fact-finder",
  "title": "Triage detect-secrets factory-journal flags",
  "assignment": "GOAL: Triage detect-secrets flags on clean checkout to define M1 lint-green for that tool (U4, TD2-B3). No repo edits; report only. STEPS: On clean checkout run declared lint gate and detect-secrets scan; capture every flagged file plus sha256 plus baseline entry. Verdict: environmental (only tracked factory runtime journals) vs real secret. If environmental: specify exact exclusion mechanism (engine config vs gate command flag) plus evidence hashes, and record operator and engine exclusion request as human-async; M1 dev acceptance does not wait on it. If real: specify redact and rotate follow-up. VERIFY: Report lists all flagged files with hashes, verdict with evidence, and exact next action; zero file writes. Feeds M1 acceptance.",
  "outlineRef": "secrets-triage-spike",
  "milestone": "M1",
  "wave": 2,
  "scenarioRefs": [
    "M1-1"
  ],
  "citations": [
    ".gitignore:243-244",
    "lint.baseline:1-1",
    "AGENTS.md:121-139"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/secrets-triage-spike/steps/001-research-r1-a1/input.md b/.factory/tasks/modernize/items/secrets-triage-spike/steps/001-research-r1-a1/input.md
new file mode 100644
index 0000000..bfdce8c
--- /dev/null
+++ b/.factory/tasks/modernize/items/secrets-triage-spike/steps/001-research-r1-a1/input.md
@@ -0,0 +1,63 @@
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
+  "slug": "secrets-triage-spike",
+  "kind": "fact-finder",
+  "title": "Triage detect-secrets factory-journal flags",
+  "assignment": "GOAL: Triage detect-secrets flags on clean checkout to define M1 lint-green for that tool (U4, TD2-B3). No repo edits; report only. STEPS: On clean checkout run declared lint gate and detect-secrets scan; capture every flagged file plus sha256 plus baseline entry. Verdict: environmental (only tracked factory runtime journals) vs real secret. If environmental: specify exact exclusion mechanism (engine config vs gate command flag) plus evidence hashes, and record operator and engine exclusion request as human-async; M1 dev acceptance does not wait on it. If real: specify redact and rotate follow-up. VERIFY: Report lists all flagged files with hashes, verdict with evidence, and exact next action; zero file writes. Feeds M1 acceptance.",
+  "outlineRef": "secrets-triage-spike",
+  "milestone": "M1",
+  "wave": 2,
+  "scenarioRefs": [
+    "M1-1"
+  ],
+  "citations": [
+    ".gitignore:243-244",
+    "lint.baseline:1-1",
+    "AGENTS.md:121-139"
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
+  ".gitignore:243-244",
+  "lint.baseline:1-1",
+  "AGENTS.md:121-139"
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
diff --git a/.factory/tasks/modernize/items/secrets-triage-spike/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/modernize/items/secrets-triage-spike/steps/001-research-r1-a1/meta.yaml
new file mode 100644
index 0000000..f18e0de
--- /dev/null
+++ b/.factory/tasks/modernize/items/secrets-triage-spike/steps/001-research-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T13:18:38.816Z
+session: 01a1bb4f-9eca-7770-bcaf-127033426536
+endedAt: 2026-11-08T13:35:19.942Z
+usage:
+  inputTokens: 123612
+  outputTokens: 59302
+  costUsd: 0.063014
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T13-18-39-818Z_01a1bb4f-9eca-7770-bcaf-127033426536.jsonl
diff --git a/.factory/tasks/modernize/items/secrets-triage-spike/steps/001-research-r1-a1/output.yaml b/.factory/tasks/modernize/items/secrets-triage-spike/steps/001-research-r1-a1/output.yaml
new file mode 100644
index 0000000..f68921b
--- /dev/null
+++ b/.factory/tasks/modernize/items/secrets-triage-spike/steps/001-research-r1-a1/output.yaml
@@ -0,0 +1,248 @@
+status: ok
+summary: "Verdict: ENVIRONMENTAL — all 8 detect-secrets findings on a clean
+  checkout of HEAD a7fad649 are false positives in tracked engine runtime
+  records under .factory/ (7 forty-char git commit SHAs in journal.ndjson, 1
+  KeywordDetector match on the prose literal 'detect-secrets:' inside a run
+  output YAML). No real credential was found; redaction/rotation is not
+  required. The declared lint gate (`uv run lint --tools '...'` from
+  .factory/tasks/modernize/infra.yaml:6-9) exits 123 with `[detect-secrets]
+  FAILED (exit=123)`; zero tracked files outside .factory/ are flagged. The
+  exact durable exclusion is a detect-secrets baseline filter
+  (`detect_secrets.filters.regex.should_exclude_file`, pattern `^\\\\.factory/`)
+  in .secrets.baseline — proven to make the exact gate body exit 0 with no
+  output, while a planted control secret still fails. A gate command flag is not
+  viable (`--exclude` is not forwarded to detect-secrets; `--baseline
+  lint.baseline` returns 0 only by masking all recordless-tool failures).
+  Operator and engine exclusion requests are recorded as human-async; M1 dev
+  acceptance need not wait on them."
+findings: |-
+  # Triage report — detect-secrets on clean checkout
+
+  ## 1. Probe provenance and no-write verification
+
+  - Repo/worktree: `/home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike`; branch `topic/modernize--secrets-triage-spike`; HEAD `a7fad649374335d5e967370064b449de31ff0c68`.
+  - `git status --porcelain` was empty before and after every probe. 567 tracked files total: 326 under `.factory/`, 241 outside.
+  - Running the gate required `uv sync --frozen --group dev`; it materialized gitignored `.venv/` plus gate caches (`.mypy_cache/`, `.ruff_cache/`, `.rumdl_cache/`, `__pycache__/`, `.pyrightconfig-composed.json`). No tracked file was created, modified, or deleted: `.secrets.baseline` stayed sha256 `055c7196c94e92718da36530f8b2e12a49fd55df0a21c94b7f43a00ef5ee5f63` and `lint.baseline` stayed `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` (content `[]`, lint.baseline:1). No repository source edits were made.
+  - Declared gate command (`.factory/tasks/modernize/infra.yaml:6-9`, identical to `.factory/tasks/modernize/gates-baseline.yaml:8-11`):
+    `uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty check,mypy.stubtest,pyright check,pyright verify types,pylint,pylint-pyi,pylint tests,detect-secrets'`
+  - Executed exactly. Result: `GATE_EXIT=123`, total wall 133.1 s. Per-tool: tach/rumdl/mypy/yamllint/ty/mypy.stubtest/pyright check/pyright verify types/pylint tests PASSED; ruff check FAILED (SIM102 `src/python_setup_lint/checkers/stub/coverage.py:196`), pylint and pylint-pyi FAILED (R0914 too-many-locals, `src/python_setup_lint/runner/cli.py:51`), and `[detect-secrets] FAILED (exit=123) [62.9s]`. The ruff/pylint failures are the separate `baseline-violations-fix` scope; they are not secret findings.
+  - Independent reproduction of the exact gate body: `git ls-files -z | xargs -0 .venv/bin/detect-secrets-hook --baseline .secrets.baseline` → exit 123, 63.5 s, the same 8 findings (33 output lines).
+
+  ## 2. Complete flag inventory (8 findings)
+
+  Flagged file hashes (sha256, whole file):
+
+  | File | sha256 | Git blob at HEAD |
+  |---|---|---|
+  | `.factory/tasks/modernize/journal.ndjson` (952 lines) | `1894aacd89836a36ea24de00c485db10a5a1a042dcfe5cdf351c07e645b471e3` | `4d8f68b9e18aef27113546546d602537425ccb53` |
+  | `.factory/tasks/modernize/runs/051-architect-revise-2-1-a1/output.yaml` (687 lines) | `744664c850a9f535cdba123f3c05622c9bac44e98c0c94413130d6151e63d509` | `969ad116993fdadc6aad38f10bd787c17563beb2` |
+
+  | # | File:line | Detector | Flagged line sha256 | Content / matched value | Baseline entry |
+  |---|---|---|---|---|---|
+  | 1 | `.factory/tasks/modernize/journal.ndjson:81` | Hex High Entropy String | `b5a7b39d753165d8d975ab2dceb30be654ce18fc349e4a46688a1fefeab52410` | `{"type":"item_merged",...,"sha":"406ab0167b235fd3adfab2c264d04c579db4ee9a",...}` | none (`.secrets.baseline:128` `results: {}`) |
+  | 2 | `.../journal.ndjson:83` | Hex High Entropy String | `6f80ae028f798b1c1b48e0d28953644cad907690efe4212e2c0bb810a72cd755` | `"sha":"4a722f4fbff68c8a47f472a6844d3aa0d78436ae"` | none |
+  | 3 | `.../journal.ndjson:204` | Hex High Entropy String | `d59dc1dcd0d5dc2d6b8d353cb9c10b3ce6f50e1f7731c53df83ca63108030731` | `"sha":"f9aafd99ac196559db77cd73d7b55d489dbda2f9"` | none |
+  | 4 | `.../journal.ndjson:328` | Hex High Entropy String | `b430d1b95f9380357064e08041d6a9a79ba9dce3302a5f0028418c46da80be43` | `"sha":"3635ed7d456024253b877aaa97a7d8f215ef75d5"` | none |
+  | 5 | `.../journal.ndjson:933` | Hex High Entropy String | `6d3a2eccb502bb57a623b2de56184c82116e91f146ac3bb1f36340c050b1654a` | `"sha":"8693aac1875a7a4c402951bc1f26cc6cf47e0485"` | none |
+  | 6 | `.../journal.ndjson:939` | Hex High Entropy String | `0825cd4664e0b7a0f468d4f1ccf6024e1a8ce282157882b5c8408ebd94343215` | `"sha":"78ee468dd1351f08a6e627e5be9b8f00deb77219"` | none |
+  | 7 | `.../journal.ndjson:945` | Hex High Entropy String | `2ffa573a6ebc7bc107e05ea5a6e5ddd5deee761abfd5b6940d162f9f340c337f` | `"sha":"9c36a975202c109f5d7f2a726089ade9726201d1"` | none |
+  | 8 | `.factory/tasks/modernize/runs/051-architect-revise-2-1-a1/output.yaml:230` | Secret Keyword | `d9baeef3630f44fc53b0a8bbe501611c53b51ea36487f9244f9515e5d0ee40e9` | YAML-transformed `description:` scalar; `hashed_secret` `43e65bf1414867b0fe6ada36116e53fc1521ec7c` = sha1 of the 358-char value starting `triage on clean checkout; if environmental ...` | none |
+
+  Baseline entries: `.secrets.baseline` is version 1.5.0 (`.secrets.baseline:129`), has 27 plugins including `HexHighEntropyString` at limit 3.0 (`.secrets.baseline:71-74`), and `"results": {}` (`.secrets.baseline:128`). `lint.baseline` is `[]` (lint.baseline:1). None of the 8 findings is recorded in either baseline. `detect-secrets` findings cannot be absorbed by `lint.baseline`: `_capture_one` emits records only for tools in `_RECORD_PARSERS`, which excludes detect-secrets (src/python_setup_lint/runner/baseline.py:116-158; src/python_setup_lint/runner/parsers.py:211-226,256; RECORDLESS_TOOLS at src/python_setup_lint/runner/dispatch.py:150-152).
+
+  ## 3. Per-finding verdict — all false positives
+
+  ### 3.1 Seven `Hex High Entropy String` hits = git commit SHAs (false positives)
+
+  Every flagged value is the `sha` field of an `item_merged` journal event. Each was resolved in this repository with `git cat-file -t <sha>` → `commit`, and `git log -1` returned the corresponding merge subject:
+
+  | Line | SHA | Verified commit subject |
+  |---|---|---|
+  | 81 | `406ab0167b235fd3adfab2c264d04c579db4ee9a` | `factory: merge item golden-determinism-probe` |
+  | 83 | `4a722f4fbff68c8a47f472a6844d3aa0d78436ae` | `factory: merge item third-party-assumption-tests` |
+  | 204 | `f9aafd99ac196559db77cd73d7b55d489dbda2f9` | `factory: merge item golden-helpers-unit` |
+  | 328 | `3635ed7d456024253b877aaa97a7d8f215ef75d5` | `factory: merge item golden-snapshot-wiring` |
+  | 933 | `8693aac1875a7a4c402951bc1f26cc6cf47e0485` | `factory: merge item runner-format-contract` |
+  | 939 | `78ee468dd1351f08a6e627e5be9b8f00deb77219` | `factory: merge item consolidate-integration-helpers-i2` |
+  | 945 | `9c36a975202c109f5d7f2a726089ade9726201d1` | `factory: merge item model-candidate-matrix` |
+
+  These are not credentials. They are 40-hex git object IDs that trip the entropy plugin at its configured 3.0 threshold (`.secrets.baseline:71-74`).
+
+  ### 3.2 One `Secret Keyword` hit = prose containing the literal `detect-secrets:` (false positive)
+
+  - `output.yaml:230` begins the YAML `description:` double-quoted scalar of the `baseline-violations-fix` story. YAML files are flattened by detect-secrets' YAML transformer, which preserves the starting line number (`.venv/lib/python3.14/site-packages/detect_secrets/transformers/yaml.py:27-36`).
+  - `KeywordDetector`'s denylist includes the bare substring `secret` (`.venv/lib/python3.14/site-packages/detect_secrets/plugins/keyword.py:43-59`), and its colon-following regex searches anywhere in the line. In the flattened scalar, `(4) Factory-journal detect-secrets: triage on clean checkout; ...` is parsed as `secret` + `:` + value.
+  - The matched value is 358 characters of English prose: `triage on clean checkout; if environmental (tracked runtime journals), record evidence + gate command showing clean, and file operator/engine exclusion request (no src workaround); if real secret, redact/rotate. Verify: lint gate green except operator-owned secrets exclusion (with evidence); pytest + integration show no new failures; golden byte-identical.` Its sha1 is exactly the reported `hashed_secret 43e65bf1414867b0fe6ada36116e53fc1521ec7c`.
+  - No credential, token, password, private key, or connection string is present. `is_verified` is false; no verification plugin applies.
+
+  ### 3.3 Coverage check
+
+  Scanning all 567 tracked files with the project's 27 configured plugins produced exactly these 8 hits and **zero hits outside `.factory/`**. No real secret exists in the checkout; therefore no redact/rotate follow-up is required.
+
+  ## 4. Root cause: detect-secrets is the only tool that does not exclude `.factory/`
+
+  - Every other configured tool already excludes the orchestration folder: `config/ruff.toml:3`, `config/rumdl.toml:3` (`.factory/**`), `config/tach.toml:9` (`**/.factory`), `config/ty.toml:12`, `config/pyrightconfig.json:19`, `config/mypy.ini:2`. detect-secrets has no shared config at all; it uses its per-repo baseline (`docs/overlays.md:62`).
+  - The shipped strategy scans the whole index: `_DetectSecretsLintTool` builds `git ls-files -z | xargs -0 detect-secrets-hook --baseline <secrets_baseline>` (src/python_setup_lint/runner/dispatch.py:261-291; baseline path default at src/python_setup_lint/runner/types.py:56). It explicitly discards `_path`, `_fix`, and `_exclude` (`dispatch.py:272`), and the detect-secrets `ToolSpec` declares only name+command (`dispatch.py:133-136`), so `supports_exclude` remains its default `False` (src/python_setup_lint/runner/types.py:17). `uv run lint --exclude ...` therefore cannot target it.
+  - The two flagged paths are tracked and not ignored: `git check-ignore -v` returns nothing for both; `.gitignore` has no `.factory` rule (only `.venv` at .gitignore:153 and the semantic cache cited at .gitignore:243-244). `.factory` alone accounts for 326 of 567 tracked files (57.5%).
+  - The condition is dynamic, not one-shot: earlier tracked gate records show the same tool failing with 2 hex findings, then 4 hex + this keyword finding, now 7 hex + keyword (`.factory/tasks/modernize/items/golden-helpers-unit/steps/001-develop-r1-a1/checks.yaml:96-104`; `.factory/tasks/modernize/items/consolidate-integration-helpers-i2/steps/001-develop-r1-a1/checks.yaml:94-111`; current run above). Each new `item_merged` journal line adds another commit SHA.
+  - The recorded `[detect-secrets] PASSED [7.7s]` in `.factory/tasks/modernize/gates-baseline.yaml:135` is stale: that baseline was captured at `2026-11-07T19:11:42.005Z` (`.factory/tasks/modernize/gates-baseline.yaml:1`), while flagged journal line 81 has `ts: 2026-11-08T02:00:28.651Z` and the flagged output.yaml was committed 2026-11-08 05:27:32 -0500. The `infra.yaml:43-51` note that "all other tools pass ... detect-secrets" is correspondingly outdated.
+
+  ## 5. Exact exclusion mechanism
+
+  ### 5.1 Recommended (config-only, no src change): detect-secrets baseline file filter
+
+  Insert into `.secrets.baseline` `filters_used` (after the last heuristic entry at line 40, before the closing `]` at line 41):
+
+  ```json
+      {
+        "path": "detect_secrets.filters.regex.should_exclude_file",
+        "pattern": ["^\\.factory/"]
+      }
+  ```
+
+  Mechanism and proof:
+
+  1. `detect-secrets-hook` loads the baseline and applies its `filters_used` (`core/usage/baseline.py:19-32` → `core/baseline.py:42-52` → `settings.py:24-34`). Installed version is 1.5.0, matching `.secrets.baseline:129`.
+  2. `scan_file` returns before scanning whenever a filename filter matches (`core/scan.py:140-150`); `should_exclude_file` reads the `pattern` list and applies `re.search` (`filters/regex.py:24-36`).
+  3. Empirical proof: with a temporary copy of `.secrets.baseline` containing the filter above, the exact gate body `git ls-files -z | xargs -0 detect-secrets-hook --baseline <tmp-baseline>` exited **0** with **zero output** over all 567 tracked files (9.5 s).
+  4. Detection is not globally disabled: the same filtered baseline still flagged a planted `/tmp/planted.py` containing `password = "correcthorsebatterystaple123"` (exit 1, Secret Keyword at line 1).
+  5. The filter is durable across journal growth and new run outputs; the runner's post-hook normalization only drops `generated_at` and re-dumps JSON, preserving `filters_used` (dispatch.py:279-280).
+  6. If the baseline is ever regenerated, use `detect-secrets scan --baseline .secrets.baseline` so the filter is imported; the runner's bootstrap branch `detect-secrets scan > .secrets.baseline` (dispatch.py:283-291) would drop it and must not be used for a filtered baseline.
+
+  ### 5.2 Engine-side alternative (preferred security posture)
+
+  Stop tracking engine runtime records: add `.factory/tasks/*/journal.ndjson` and `.factory/tasks/*/runs/` (optionally `.factory/tasks/*/items/*/steps/`) to `.gitignore`, `git rm --cached` them, and let the engine keep them local or redact at write time. Because the gate scans `git ls-files`, untracked journals are never scanned. This is an engine behavior change (this repo's `.gitignore` has no `.factory` entry today) and does not remove the records from existing git history. If the engine must keep committing journals for audit, it should seed the filter in 5.1 into `.secrets.baseline` at initialization/backfill.
+
+  ### 5.3 Why a gate command flag is not viable
+
+  - `uv run lint --exclude ...` is not forwarded: detects-secrets `ToolSpec` has `supports_exclude=False` by default (types.py:17) and the strategy discards `_exclude` (dispatch.py:272). Removing the tool from the `--tools` list would weaken the declared 14-tool gate.
+  - `uv run lint ... --baseline lint.baseline` exits **0** while `[detect-secrets] FAILED (exit=123)` is printed: `_capture_one` emits no records for recordless tools (baseline.py:116-158), `_diff_baseline` finds no new issues (baseline.py:262-279), and `_handle_baseline` resets `overall_rc` to 0 (`_cli_helpers.py:41-53`). This is masking, not exclusion — it would also hide a genuine new secret. Do not use it as M1 evidence, and note the pre-commit hook uses exactly this `--baseline` form (AGENTS.md:130-136).
+  - Regenerating `lint.baseline` (`--overwrite-baseline`) cannot absorb detect-secrets findings for the same recordless-tool reason.
+
+  ### 5.4 Narrow fallback (if whole-directory exclusion is rejected)
+
+  `detect_secrets.filters.regex.should_exclude_line` with patterns `["\\"sha\\":\\"[0-9a-f]{40}\\"", "detect-secrets: "]` was also empirically proven (hook exit 0). It keeps the rest of `.factory` scanned but is brittle: new prose keyword forms or journal schema changes can reintroduce failures, and it can hide a real 40-hex secret in a `sha` field.
+
+  ## 6. Human-async requests (do not block M1 dev acceptance)
+
+  1. **Operator (repo owner):** apply the exact `.secrets.baseline` filter in 5.1, commit it, then run `uv run lint --tools detect-secrets` and expect `PASSED` (exit 0). Evidence to attach: this report, the two file sha256s, and the eight line hashes above.
+  2. **Engine maintainers:** choose 5.2 (untrack runtime journals) or seed the 5.1 filter for repositories; fix the stale claim in `.factory/tasks/modernize/infra.yaml:43-51` and the stale `[detect-secrets] PASSED` record in `.factory/tasks/modernize/gates-baseline.yaml:135`.
+  3. **M1:** accept the detect-secrets tool as environmentally red on clean checkout with this evidence; M1-1 dev acceptance does not wait on the operator/engine action. The remaining full-gate red is unrelated (ruff SIM102 at `src/python_setup_lint/checkers/stub/coverage.py:196`; pylint/pylint-pyi R0914 at `src/python_setup_lint/runner/cli.py:51`).
+
+  ## 7. Residual risk
+
+  Excluding `.factory/` means a genuine secret later written into engine journals will not be caught by this gate. The engine should continue redacting sensitive values at write time (the runtime already emits placeholders such as `$$HASH$$`), and operators should use a filter-free baseline copy for periodic manual audits of `.factory`.
+contextPack: "FACTS FOR M1: HEAD a7fad649374335d5e967370064b449de31ff0c68, clean
+  worktree. Declared gate `uv run lint --tools 'tach check,ruff check,rumdl
+  check,mypy,yamllint,ty check,mypy.stubtest,pyright check,pyright verify
+  types,pylint,pylint-pyi,pylint tests,detect-secrets'` (infra.yaml:6-9) exits
+  123; detect-secrets FAILED (exit=123) with exactly 8 false positives, all
+  under tracked `.factory/`: journal.ndjson lines 81,83,204,328,933,939,945 (git
+  commit SHAs, each verified by `git cat-file -t` = commit) and
+  runs/051-architect-revise-2-1-a1/output.yaml:230 (KeywordDetector on prose
+  `detect-secrets: triage ...`, sha1 43e65bf1414867b0fe6ada36116e53fc1521ec7c).
+  Zero findings outside `.factory/` among 567 tracked files. `.secrets.baseline`
+  results {} and lint.baseline [] — nothing baselined; detect-secrets is
+  recordless and cannot be absorbed by lint.baseline. File sha256: journal
+  1894aacd89836a36ea24de00c485db10a5a1a042dcfe5cdf351c07e645b471e3; output.yaml
+  744664c850a9f535cdba123f3c05622c9bac44e98c0c94413130d6151e63d509. EXACT FIX:
+  add
+  `{\"path\":\"detect_secrets.filters.regex.should_exclude_file\",\"pattern\":[\
+  \"^\\\\.factory/\"]}` to `.secrets.baseline` filters_used; proven: full `git
+  ls-files -z | xargs -0 detect-secrets-hook --baseline <filtered-baseline>`
+  exit 0/no output, planted control secret still exit 1. Do NOT use `--baseline
+  lint.baseline` (returns 0 while masking every detect-secrets result). M1 dev
+  acceptance does not wait; operator/engine requests are human-async."
+sources:
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.factory/tasks/modernize/infra.yaml:6-9
+    (declared lint gate command)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.factory/tasks/modernize/infra.yaml:43-51
+    (stale note claiming detect-secrets passes)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.factory/tasks/modernize/infra.yaml:54-58
+    (existing .factory exclusions / --exclude limits)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.factory/tasks/modernize/gates-baseline.yaml:1,8-13,135
+    (baseline timestamp, lint status fail, stale detect-secrets PASSED 7.7s)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.factory/tasks/modernize/journal.ndjson:81,83,204,328,933,939,945
+    (7 Hex High Entropy findings)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.factory/tasks/modernize/runs/051-architect-revise-2-1-a1/output.yaml:230-243
+    (Secret Keyword finding on prose scalar)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.factory/tasks/modernize/items/consolidate-integration-helpers-i2/steps/001-develop-r1-a1/checks.yaml:94-111
+    (earlier 4-hex+keyword recurrence)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.factory/tasks/modernize/items/golden-helpers-unit/steps/001-develop-r1-a1/checks.yaml:96-104
+    (earlier 2-hex recurrence)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.secrets.baseline:2-41
+    (filters_used), :71-74 (HexHighEntropyString limit 3.0), :128 (results {}),
+    :129 (version 1.5.0)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/lint.baseline:1
+    ([])
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/src/python_setup_lint/runner/dispatch.py:133-136
+    (detect-secrets ToolSpec), :150-152 (RECORDLESS_TOOLS), :261-291 (git
+    ls-files scan pipeline; line 272 discards _exclude)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/src/python_setup_lint/runner/types.py:17,56
+    (supports_exclude default False; secrets_baseline default)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/src/python_setup_lint/runner/parsers.py:211-226,256
+    (detect-secrets has statistics parser only, no record parser)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/src/python_setup_lint/runner/baseline.py:116-158,262-279
+    (recordless tool yields no baseline records)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/src/python_setup_lint/runner/_cli_helpers.py:41-53
+    (baseline path resets overall_rc to 0)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/config/ruff.toml:3;
+    config/rumdl.toml:3; config/tach.toml:9; config/ty.toml:12;
+    config/pyrightconfig.json:19; config/mypy.ini:2 (all exclude .factory)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/docs/overlays.md:62
+    (detect-secrets uses its own baseline, not shared config)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/AGENTS.md:130-136
+    (pre-commit hook runs lint --fix --baseline lint.baseline)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.gitignore:153
+    (only .venv ignore; no .factory rule)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.venv/lib/python3.14/site-packages/detect_secrets/filters/regex.py:24-36
+    (should_exclude_file)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.venv/lib/python3.14/site-packages/detect_secrets/settings.py:24-34,247
+    (filters_used configuration and sorting)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.venv/lib/python3.14/site-packages/detect_secrets/core/baseline.py:42-52
+    (baseline load applies filters)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.venv/lib/python3.14/site-packages/detect_secrets/core/scan.py:140-150,240
+    (filename/line filter application)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.venv/lib/python3.14/site-packages/detect_secrets/core/usage/baseline.py:19-32
+    (hook parse_args loads baseline settings)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.venv/lib/python3.14/site-packages/detect_secrets/pre_commit_hook.py:32-41,47,70
+    (baseline subtraction, exit 1, baseline-update exit 3)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.venv/lib/python3.14/site-packages/detect_secrets/plugins/keyword.py:43-59,263,279
+    (denylist contains 'secret'; KeywordDetector)
+  - /home/slava/aiexp/python-setup.factory-wt/topic_modernize--secrets-triage-spike/.venv/lib/python3.14/site-packages/detect_secrets/transformers/yaml.py:27-36
+    (YAML flattening preserves source line number)
+  - https://github.com/Yelp/detect-secrets#--exclude-files (official
+    --exclude-files documentation)
+  - https://github.com/Yelp/detect-secrets#adding-new-secrets-to-baseline
+    (official note that scan --baseline imports baseline settings)
+  - https://github.com/Yelp/detect-secrets#filters (official filters/plugins
+    configuration documentation)
+recommendations:
+  - 'Operator: add `{"path": "detect_secrets.filters.regex.should_exclude_file",
+    "pattern": ["^\\.factory/"]}` to `.secrets.baseline` filters_used (after
+    line 40), commit it, then verify with `uv run lint --tools detect-secrets`
+    (expected `[detect-secrets] PASSED`, exit 0). This is the exact, config-only
+    exclusion; no src change is required.'
+  - "Do not use `uv run lint --baseline lint.baseline` as M1 green evidence: it
+    exits 0 while printing `[detect-secrets] FAILED (exit=123)` because
+    recordless tools produce no baseline records and `_handle_baseline` resets
+    overall_rc to 0. This masks real secrets too."
+  - Do not try to absorb these findings by regenerating `lint.baseline`;
+    detect-secrets has no record parser, so `--overwrite-baseline` cannot
+    represent its failures. The relevant baseline is `.secrets.baseline`.
+  - "Engine human-async request: stop committing
+    `.factory/tasks/*/journal.ndjson` and `.factory/tasks/*/runs/**` (add to
+    .gitignore and git rm --cached) or seed the 5.1 filter at repo/task
+    initialization. Update the stale `detect-secrets` PASSED claim in
+    infra.yaml:43-51 and gates-baseline.yaml:135."
+  - 'If a whole-directory exclusion is rejected, use the proven narrower
+    `detect_secrets.filters.regex.should_exclude_line` patterns
+    `["\\"sha\\":\\"[0-9a-f]{40}\\"", "detect-secrets: "]`; note this is brittle
+    to journal schema/prose changes.'
+  - "M1-1 dev acceptance: record this evidence (file sha256s and line hashes
+    above), accept detect-secrets as environmentally red on clean checkout, and
+    proceed without waiting for operator/engine action. Remaining full-gate red
+    is the separate ruff SIM102 and pylint R0914 scope."
+  - "Residual risk: excluding .factory removes secret scanning from engine
+    journals; keep engine-side redaction of sensitive values at write time and
+    use a filter-free baseline copy for periodic manual audits of .factory."

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
