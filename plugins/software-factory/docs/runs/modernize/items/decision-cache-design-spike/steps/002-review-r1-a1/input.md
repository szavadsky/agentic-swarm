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
  "slug": "decision-cache-design-spike",
  "kind": "poc",
  "title": "Prototype tracked-cache schema and refresh",
  "assignment": "Prototype on tmp copies only; zero committed files. Validate the ADR-017 pinned contract (do not invent alternative): project-root = config.cwd with traversal guard; schema + array sort (rule, justification, model) + non-hex encoding (no bare hex>=20, detect-secrets clean, collision-safe); prune auto missing/stale; lint --refresh-decisions [--path ...]; CI-fail; DECISIONS_PATH test-only; files union POSIX; --path scoping; jobs==1 required; decisions-module placement (ADR-018); memory/time notes (2048 RLIMIT_AS, 3 pylint loads, ONNX vs torch). Consume test_pylint_cache_semantics.py writer-first verdict. Completeness gate: report {verdict: feasible|blocked}; feasible carries every field above + 4 tmp proofs (heuristic-rejected False without backend; accepted+hit==persisted; accepted+miss+absent==heuristic True; normal-lint zero writes by hash); blocked carries {blocker, evidence, I5 plan} and impls merge no-op attestations citing it. Feeds backend/cache impls.",
  "outlineRef": "decision-cache-design-spike",
  "milestone": "M4",
  "wave": 1,
  "scenarioRefs": [
    "M4: Veto backend without model",
    "M4: Cache read-only plus explicit refresh"
  ],
  "citations": [
    "src/python_setup_lint/checkers/_semantic.py:37-52",
    "src/python_setup_lint/checkers/_semantic.py:125-189",
    "docs/semantic-justification.md:5-14",
    "docs/semantic-justification.md:34-45",
    ".gitignore:243-244"
  ],
  "escalate": true
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/README.md b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/README.md
new file mode 100644
index 0000000..a9805b6
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/README.md
@@ -0,0 +1,247 @@
+# Decision-cache design spike — PoC report
+
+**Verdict: `feasible`.**
+
+Prototype of the ADR-017 tracked decision cache and ADR-018 placement, built on
+tmp copies only. No production path was modified (`contract_production_untouched`
+asserts no non-orchestration changes in `git status`/`git diff`). All artifacts
+live in this `poc/` folder.
+
+- Base HEAD: `8b7cd98dd059d79a4d9fe1270989cd709cb67934`
+- Machine-readable verdict: [`out/verdict.json`](out/verdict.json)
+- Contract/proof results: [`out/proofs.json`](out/proofs.json)
+- Memory/time results: [`out/memory_time.json`](out/memory_time.json)
+- Writer-first verdict: `tests/assumptions/test_pylint_cache_semantics.py`
+  (`21 passed`)
+
+## What was prototyped
+
+| File | Role |
+|---|---|
+| `decision_cache.py` | schema, normalization, dotted-base32 key encoding, root guard, test-only `DECISIONS_PATH`, load/serialize, merge/prune, lock + atomic replace |
+| `decision_pipeline.py` | heuristic-first veto pipeline over the cache (hits, misses, no-model fallback) |
+| `refresh_cli.py` | prototype `lint --refresh-decisions [--path ...]`: CI guard, jobs guard, three sequential pylint passes, read-only normal lint |
+| `run_proofs.py` | 26 checks: the four required proofs plus every ADR-017/018 field |
+| `measure_memory_time.py` | three real pylint loads under `RLIMIT_AS=2048 MB`; ML-runtime and model-eval memory notes |
+| `encoding_lab.py` | empirical detect-secrets comparison of candidate encodings |
+| `make_verdict.py` | assembles `out/verdict.json` from the proof outputs |
+
+Everything is recreated under `poc/tmp/` on every run and can be deleted safely.
+
+## ADR-017 contract validation
+
+| Contract field | Pinned value | PoC result | Evidence key |
+|---|---|---|---|
+| Project root | `config.cwd` | cache resolves to `<cwd>/.python-setup-decisions.json`; symlink, parent, absolute and mismatched-root-hint escapes rejected | `contract_root_guard`, `contract_checker_root_hint` |
+| `DECISIONS_PATH` | test-only, only under `PYTEST_CURRENT_TEST` | ignored in production (uses cwd); honored under pytest and writes only the override | `contract_decisions_path_test_only` |
+| Schema | JSON array; entries `{justification, rule, model, decision, files}` + `{version, prompt_hash, last_seen}` | implemented; `key` is an additional derived field | `contract_schema_sort` |
+| Sort | `(rule, justification, model)` | exactly that order; `key` is a deterministic tie-break | `contract_schema_sort` |
+| Serialization | `indent=2`, `sort_keys`, trailing newline | byte-identical double refresh | `contract_schema_sort`, `contract_determinism` |
+| Encoding | non-hex, no bare hex >= 20, detect-secrets clean, collision-safe | `dk1.` + dot-separated lowercase base32 groups of 8 over full SHA-256; 25 000-key probe had zero collisions; repo `.secrets.baseline` scan clean, full-hex negative control flagged | `contract_encoding_collision`, `contract_detect_secrets` |
+| Prune | automatic missing files + stale model; no `--prune` flag | both pruned; stale prompt hash also pruned | `contract_prune` |
+| `files` | sorted unique POSIX relpaths, union-merged | one key observed in three files produced `["src/a.py","src/b.py","src/c.py"]` | `contract_files_union_posix` |
+| `--path` scoping | scoped sweep, unscanned retained | unscanned existing and deleted files retained; full refresh prunes them; stale mixed entry keeps its unscanned share | `contract_path_scoping`, `contract_scoped_stale_mixed` |
+| Refresh shape | `lint --refresh-decisions [--path ...]` | prototype CLI, lock + merge + atomic replace; normal lint is a separate read-only path | `contract_determinism`, `contract_atomic_failure`, `contract_lock_contention` |
+| CI failure | `CI`/`GITHUB_ACTIONS` exit non-zero | exit 2 before any write, cache hash unchanged | `contract_ci_fail` |
+| jobs | must be exactly 1, fail loudly | `--jobs=2`, `--jobs=0` and an rcfile `jobs=2` all fail; HEAD's three rcfiles have no override | `contract_jobs_guard` |
+| Placement (ADR-018) | new `python_setup_lint/decisions/_decision_cache.py(+.pyi)`, checkers/runner depend on it, decisions depends on nothing | tach check passes the legal tree; `decisions -> checkers` negative control fails | `contract_tach_placement` |
+
+### Example entry
+
+Generated by the double-run determinism fixture:
+
+```json
+[
+  {
+    "decision": true,
+    "files": ["src/a.py"],
+    "justification": "a specific technical reason for retrying",
+    "key": "dk1.7slmqcwz.3uxhtzmb.pcuomhfv.dgqzmwkg.sfqkooqx.mttwjc2o.dv7q",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
+```
+
+`model` follows the pinned `'<id> rev <short12> prompt-vN'` shape
+(`fake-backend rev test prompt-v1`; a real revision becomes e.g. `b886a1f9b91f`).
+`last_seen` is a UTC date so a same-day double refresh is byte-identical; the
+PoC injects the date, and production should inject a clock in tests.
+
+### Encoding result
+
+`encoding_lab.py` scanned realistic cache lines with the repository's own
+plugins/filters:
+
+| Candidate | Findings |
+|---|---|
+| full 64-char hex digest | 1 (`Hex High Entropy String`) — rejected |
+| plain base32 | 0 for this digest, but entropy 4.36 is marginal against the 4.5 base64 limit |
+| base32 with `.` every 8 chars | 0 — neither quoted-string matcher can match through `.` |
+| base64url / base58 / base36 | flagged as `Base64 High Entropy String` |
+
+The dotted-base32 scheme is therefore chosen: it preserves the full 256-bit
+digest, has no contiguous hex run (groups of 8), and is robustly outside both
+quoted-string entropy matchers. It is not hex-only, satisfying "non-hex
+encoding"; the negative control confirms the secrets scan is live, not
+path-excluded.
+
+## Four required tmp proofs
+
+Run by `run_proofs.py` under `poc/tmp/proofs/`:
+
+1. **`proof_1_heuristic_rejected_without_backend`** — `"fix this"` returns
+   `False` from the heuristic path; the `FakeBackend` is never called; no cache
+   entry is created. A full refresh over the rejected fixture leaves `[]`.
+2. **`proof_2_accepted_hit_equals_persisted`** — a backend-rejected (`0.0`)
+   accepted justification is persisted as `False`; a later cache hit with a
+   backend that would return `1.0`, and with `NoBackend`, returns the persisted
+   `False` without a model call. `source == "cache-hit"`.
+3. **`proof_3_accepted_miss_absent_heuristic_true`** — accepted justification,
+   absent cache, `backend=None` returns `True` with `source == "heuristic-accept"`;
+   normal lint leaves the cache absent.
+4. **`proof_4_normal_lint_zero_writes_by_hash`** — a seeded cache plus normal
+   lint over a hit and a backend-computed miss leaves SHA-256, mtime and the
+   directory file set unchanged; an absent cache stays absent.
+
+## Writer-first verdict consumption
+
+`tests/assumptions/test_pylint_cache_semantics.py` passes unchanged
+(`21 passed`). The design consumes each verdict point:
+
+- **Writer identity / timing** — the checker call path is the writer, but only
+  in explicit refresh mode (`PYTHON_SETUP_LINT_DECISIONS_REFRESH=1`). Normal
+  lint never writes; the four-proof hash check proves the read-only path.
+- **`--path` scoping** — the current key is path-free, so the tracked schema
+  adds a per-entry sorted POSIX `files` list; union-merge and scoped prune
+  follow from that.
+- **Sweep implication** — path-free identity means a scoped run cannot partition
+  the cache; the PoC retains unscanned entries and only prunes what it scanned.
+- **Concurrency** — the single-writer claim holds only for `jobs == 1`; refresh
+  fails loudly on `jobs=0` auto-detect or `jobs>1` instead of adding sidecars.
+- **Crash safety** — the current non-atomic `Path.write_text` becomes
+  refresh-only lock + merge + `fsync` + atomic `os.replace`; failed
+  serialization leaves the previous cache byte-identical.
+
+## Memory / time notes
+
+Three real pylint loads under the runner's `RLIMIT_AS=2048 MB`, using the
+repository rcfiles on a tmp project (one representative run; wall time varies by
+±0.3 s on this host):
+
+| Load | Exit | Wall | Peak RSS |
+|---|---|---|---|
+| `pylint` | 0 | 1.328 s | 80.08 MB |
+| `pylint-pyi` | 0 | 1.170 s | 79.67 MB |
+| `pylint tests` | 0 | 0.617 s | 62.09 MB |
+| **total** | — | **3.115 s** | — |
+
+All three are far under 2048 MB; no `MemoryError`. The current dev environment
+has **no torch, onnxruntime, sentence-transformers or transformers**
+(`sentence_transformers` is the optional `[semantic]` extra). The sibling
+model-eval PoC measured torch-CPU backends:
+
+| Model | Params | Peak RSS | Load |
+|---|---|---|---|
+| minilm-l6-v2 | 22.7 M | 556 MB | 0.72 s |
+| bekko-17m | 16.8 M | 624 MB | 0.68 s |
+| ettin-reranker-150m | 149 M | 991 MB | 0.68 s |
+| decider-nano | 149 M | 1 464 MB | 12.9 s |
+| GLiDE | 395 M | **2 846 MB** | 33.9 s |
+
+Consequences for the backend/cache impls:
+
+- GLiDE exceeds the 2048 MB runner cap under torch; decider-nano is close.
+  The I5 bake-off must measure the chosen model **inside the pylint subprocess**
+  under the same cap, not standalone.
+- ONNX Runtime was not installed and could not be measured. The model-eval
+  research notes bekko's upstream ONNX browser model is ~29 MB versus 67 MB
+  safetensors, so an ONNX path is plausible; lower peak RSS is an expectation,
+  not a verified claim. Prefer ONNX only if an I5 subprocess benchmark under
+  `RLIMIT_AS=2048` fits without raising `tool_memory_limits`.
+- Pylint runs as three sequential subprocesses (`pylint`, `pylint-pyi`,
+  `pylint tests`). A lazily loaded backend can be loaded up to three times per
+  lint run unless every suppression is a cache hit; hits avoid model load
+  entirely. Refresh should populate the tracked cache before normal CI lint.
+
+## Tradeoffs and residual risks
+
+- **Lock artifact.** `fcntl.flock` is crash-safe but leaves a zero-byte
+  `.python-setup-decisions.lock` beside the cache. Production must ignore it
+  (or document it). `fcntl` is POSIX-only; a non-POSIX fallback
+  (`msvcrt.locking`) is needed if Windows is supported.
+- **`last_seen` determinism.** A UTC date gives byte-identical same-day
+  double runs; a cross-midnight run changes it. Tests should inject the date.
+  An age prune policy was deliberately not added (ADR-017 pins missing/stale
+  only).
+- **Long hex in user text.** The schema stores the normalized justification.
+  A 20+ hex run in a justification is redacted to `<hex:N>` before
+  persistence; the key is derived from the unredacted text, so distinct
+  justifications do not collapse. A file path containing a 20+ hex run fails
+  refresh loudly rather than committing a contract violation. This is safer
+  than storing raw hashes but changes the displayed justification for that
+  rare case.
+- **Context is not in the key.** Per ADR-014 the key is
+  `(justification, rule, model)`; `code_context` is model input only. Two
+  files with the same justification/rule can theoretically receive different
+  backend decisions; the refresh merge keeps the last observation in stable
+  sorted file order. This is a pinned consequence, not a hash collision.
+- **File associations are union-merged.** If a suppression disappears from an
+  existing file, its `files` entry remains until the file is missing or a full
+  refresh/model change prunes the entry. No age prune exists in I4.
+- **Corrupt cache.** Normal lint tolerates unreadable/invalid entries (returns
+  an empty/partial view and recomputes); refresh fails loudly and does not
+  clobber the corrupt file. This avoids silent data loss while keeping lint
+  resilient.
+- **Job guard scope.** The prototype checks an explicit `--jobs` value and
+  every rcfile it is given. The production runner must feed the guard the
+  three *resolved* rcfiles (including `pyproject.toml` config overrides and
+  extra-tool args), not a fixed `cwd/config` guess; the PoC's
+  `_default_rcfiles` is a simplification.
+- **`short12` model revision** is a 48-bit prefix. It fits the pinned format
+  and the no-bare-hex rule; it is an identifier, not a security boundary.
+- **Schema version migration.** Refresh treats an unsupported `version` as
+  corruption and fails loudly rather than silently dropping entries. A future
+  version bump must add a migration or decide a prune-old policy.
+- **Refresh rewrites even with no observations** (e.g. all hits), producing a
+  deterministic `[]` or unchanged array. This is acceptable for an explicit
+  refresh and keeps the writer path simple.
+
+## Recommendations for permanent implementation
+
+1. Add `python_setup_lint/decisions/_decision_cache.py` (+ `.pyi`) with this
+   schema/API; add exactly the two ADR-018 tach edges and leave
+   `_decision_backend.py` in checkers.
+2. Thread `RunnerConfig.refresh_decisions: bool = False` and the
+   `--refresh-decisions [--path ...]` CLI flag; guard CI before writes and
+   guard effective `jobs == 1` for all three pylint invocations.
+3. Have the checker derive
+   `key = sha256(normalized_justification, joined_rule, model)` and read the
+   cache on normal lint; only refresh mode emits observations and calls the
+   writer. Resolve the root from `config.cwd`/`Path.cwd()` with the guard.
+4. Serialize with dotted base32, `indent=2`, `sort_keys`, union `files`, prune
+   missing/stale automatically, and keep a runtime no-bare-hex guard.
+5. Rewrite `tests/assumptions/test_pylint_cache_semantics.py` deliberately for
+   the new writer/timing contract; add tmp round-trip, zero-write hash,
+   double-run determinism, prune, scoping, CI/jobs/isolation, and
+   detect-secrets tests.
+6. Add lock-file ignore rules and a non-POSIX fallback; inject the refresh
+   clock in tests.
+7. In I5, re-run the model memory/time benchmark under `RLIMIT_AS=2048` and
+   choose ONNX vs torch from measured RSS/latency, not expectations.
+
+## Reproduction
+
+```bash
+# from the worktree root
+uv run python .factory/tasks/modernize/items/decision-cache-design-spike/poc/run_proofs.py
+uv run python .factory/tasks/modernize/items/decision-cache-design-spike/poc/measure_memory_time.py
+uv run python .factory/tasks/modernize/items/decision-cache-design-spike/poc/make_verdict.py
+uv run pytest tests/assumptions/test_pylint_cache_semantics.py -q
+```
+
+`run_proofs.py` exits non-zero if any check fails; `out/proofs.json` records
+each check with its duration and detail.
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/decision_cache.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/decision_cache.py
new file mode 100644
index 0000000..32bcd83
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/decision_cache.py
@@ -0,0 +1,737 @@
+"""Prototype of the ADR-017/018 tracked decision cache (PoC only).
+
+This module is a confined feasibility prototype: it is never imported by the
+production package.  It pins the contract that `decision-cache-impl` must
+implement:
+
+* root = ``config.cwd`` with a traversal guard; test-only
+  ``PYTHON_SETUP_LINT_DECISIONS_PATH`` is honored only under
+  ``PYTEST_CURRENT_TEST``;
+* a tracked JSON array sorted by ``(rule, justification, model)``, rendered with
+  ``indent=2`` and ``sort_keys=True``;
+* a full-SHA-256 logical key encoded with a non-hex, dotted base32 alphabet
+  (no bare hex run >= 20, detect-secrets clean, collision-safe);
+* ``files`` = sorted unique POSIX relative paths, union-merged on refresh;
+* automatic prune of missing files and stale model / prompt entries, with
+  ``--path`` scoping that retains entries for unscanned files;
+* read-only normal lint: only :func:`refresh` writes, via lock + atomic
+  replace; and
+* ``jobs == 1`` is a caller precondition (enforced by the refresh CLI).
+
+The writer-first verdict in
+``tests/assumptions/test_pylint_cache_semantics.py`` is consumed here: the
+current cache identity is path-free, so a tracked schema needs per-entry
+``files``; the single-writer claim holds only while pylint jobs == 1; and the
+current non-atomic write becomes a refresh-only atomic replace.
+"""
+
+from __future__ import annotations
+
+import base64
+import contextlib
+import hashlib
+import json
+import os
+import re
+import tempfile
+from collections.abc import Generator, Iterable, Mapping
+from dataclasses import dataclass, replace
+from datetime import UTC, datetime
+from pathlib import Path
+from typing import Any, Final
+
+try:
+    import fcntl
+except ImportError:  # pragma: no cover - non-POSIX fallback
+    fcntl = None  # type: ignore[assignment]
+
+CACHE_FILENAME: Final = ".python-setup-decisions.json"
+LOCK_FILENAME: Final = ".python-setup-decisions.lock"
+SCHEMA_VERSION: Final = 1
+PROMPT_VERSION: Final = "prompt-v1"
+PROMPT_TEMPLATE: Final = "Rate whether the suppression justification is a specific technical reason."
+DECISION_THRESHOLD: Final = 0.5
+
+ENV_DECISIONS_PATH: Final = "PYTHON_SETUP_LINT_DECISIONS_PATH"
+ENV_REFRESH: Final = "PYTHON_SETUP_LINT_DECISIONS_REFRESH"
+ENV_ROOT: Final = "PYTHON_SETUP_LINT_DECISIONS_ROOT"
+ENV_PYTEST: Final = "PYTEST_CURRENT_TEST"
+
+_KEY_RE: Final = re.compile(r"^dk1(?:\.[a-z2-7]{1,8})+$")
+_BARE_HEX_RE: Final = re.compile(r"(?<![0-9a-fA-F])[0-9a-fA-F]{20,}(?![0-9a-fA-F])")
+_HEX_RUN_RE: Final = re.compile(r"(?<![0-9a-fA-F])[0-9a-fA-F]{20,}(?![0-9a-fA-F])")
+_ALLOWED_FILE_SUFFIXES: Final = frozenset({".py", ".pyi"})
+_EXCLUDED_DIRS: Final = frozenset(
+    {
+        ".git",
+        ".venv",
+        ".factory",
+        ".omp",
+        ".mypy_cache",
+        ".pytest_cache",
+        ".ruff_cache",
+        "__pycache__",
+        "build",
+        "dist",
+        "node_modules",
+    }
+)
+
+
+class DecisionCacheError(RuntimeError):
+    """Base class for tracked-cache failures."""
+
+
+class CachePathError(DecisionCacheError):
+    """The resolved cache path escaped the project root."""
+
+
+class CacheCorruptError(DecisionCacheError):
+    """The tracked cache is unreadable or violates the schema."""
+
+
+class RefreshLockError(DecisionCacheError):
+    """Another refresh already holds the cache lock."""
+
+
+@dataclass(frozen=True, slots=True)
+class CacheEntry:
+    """One tracked decision record."""
+
+    key: str
+    justification: str
+    rule: str
+    model: str
+    decision: bool
+    files: tuple[str, ...]
+    version: int
+    prompt_hash: str
+    last_seen: str
+
+    def to_json(self) -> dict[str, object]:
+        """Return the exact JSON object written to disk.
+
+        Returns:
+            A sortable mapping; ``json.dumps(sort_keys=True)`` orders keys.
+        """
+        return {
+            "decision": self.decision,
+            "files": list(self.files),
+            "justification": self.justification,
+            "key": self.key,
+            "last_seen": self.last_seen,
+            "model": self.model,
+            "prompt_hash": self.prompt_hash,
+            "rule": self.rule,
+            "version": self.version,
+        }
+
+
+@dataclass(frozen=True, slots=True)
+class Observation:
+    """A verdict produced by the checker call path during refresh."""
+
+    justification: str
+    rule: str
+    model: str
+    decision: bool
+    file: str
+
+
+def normalize_justification(text: str) -> str:
+    """Normalize a suppression justification for cache identity.
+
+    Args:
+        text: Raw comment/text after the checker's ``comment or text`` choice.
+
+    Returns:
+        Whitespace-collapsed, stripped text.  The contract stores normalized
+        justification text, so this is the single normalization used by both
+        key derivation and persistence.
+    """
+    return " ".join(text.split())
+
+
+def sanitize_tracked_text(text: str) -> str:
+    """Redact bare hex runs of length >= 20 from committed text.
+
+    ADR-010 forbids the tracked cache from containing bare hex strings of
+    length >= 20.  User-authored justifications can contain commit hashes, so
+    the prototype redacts them before persistence.  The cache key is derived
+    from the *unredacted* text, so two distinct redacted justifications never
+    collapse to one key.
+
+    Args:
+        text: Normalized text destined for the tracked file.
+
+    Returns:
+        Text with long hex runs replaced by ``<hex:N>``.
+    """
+    return _HEX_RUN_RE.sub(lambda match: f"<hex:{len(match.group(0))}>", text)
+
+
+def normalize_rule(rule: str | Iterable[str]) -> str:
+    """Normalize suppression codes exactly as ADR-014 pins.
+
+    Args:
+        rule: A raw ``disable=...`` payload or an iterable of symbols.
+
+    Returns:
+        Comma-joined, ASCII-sorted, de-duplicated symbols with no spaces.
+    """
+    parts = rule.split(",") if isinstance(rule, str) else list(rule)
+    return ",".join(sorted({part.strip() for part in parts if part.strip()}))
+
+
+def build_model_id(model_id: str, revision: str, prompt_version: str = PROMPT_VERSION) -> str:
+    """Build the pinned ``<id> rev <short12> prompt-vN`` model string.
+
+    Args:
+        model_id: Backend/model identifier, e.g. ``fake-backend``.
+        revision: Model revision or opaque test tag; truncated to 12 chars.
+        prompt_version: Prompt version tag.
+
+    Returns:
+        The model string stored per entry.
+    """
+    return f"{model_id} rev {revision[:12]} {prompt_version}"
+
+
+def prompt_hash(prompt: str = PROMPT_TEMPLATE) -> str:
+    """Return the non-hex prompt fingerprint stored per entry.
+
+    Args:
+        prompt: Prompt template text.
+
+    Returns:
+        Dotted-base32 SHA-256 digest.
+    """
+    return encode_digest(hashlib.sha256(prompt.encode("utf-8")).digest())
+
+
+def encode_digest(digest: bytes) -> str:
+    """Encode a full digest without bare hex.
+
+    The encoding keeps all 256 bits (no truncation) and uses ``.`` separators
+    so neither detect-secrets' hex nor base64 quoted-string matcher can match
+    the value as one token.  Group size 8 also guarantees no contiguous hex
+    run >= 20 even if the digest happened to contain only hex characters.
+
+    Args:
+        digest: Raw digest bytes.
+
+    Returns:
+        ``dk1.`` followed by dot-separated lowercase base32 groups.
+    """
+    encoded = base64.b32encode(digest).decode("ascii").rstrip("=").lower()
+    return "dk1." + ".".join(encoded[index : index + 8] for index in range(0, len(encoded), 8))
+
+
+def derive_key(justification: str, rule: str, model: str) -> str:
+    """Derive the collision-safe logical cache key.
+
+    Args:
+        justification: Unredacted normalized justification.
+        rule: Normalized joined rule symbols.
+        model: Model string.
+
+    Returns:
+        Full-SHA-256 digest encoded by :func:`encode_digest`.
+    """
+    material = "\x00".join((justification, rule, model)).encode("utf-8")
+    return encode_digest(hashlib.sha256(material).digest())
+
+
+def utc_today() -> str:
+    """Return the UTC ``last_seen`` date.
+
+    Returns:
+        ``YYYY-MM-DD`` in UTC.
+    """
+    return datetime.now(UTC).date().isoformat()
+
+
+def resolve_cache_path(cwd: Path | str, *, environ: Mapping[str, str] | None = None) -> Path:
+    """Resolve the tracked cache path under the ADR-017 root guard.
+
+    Production root is ``cwd`` (the runner launches pylint with
+    ``cwd=config.cwd``).  ``PYTHON_SETUP_LINT_DECISIONS_PATH`` is test-only and
+    honored only when ``PYTEST_CURRENT_TEST`` is present.
+
+    Args:
+        cwd: Linted project root.
+        environ: Environment mapping (tests inject a dict).
+
+    Returns:
+        Absolute, symlink-resolved cache path.
+
+    Raises:
+        CachePathError: The production path escapes ``cwd`` (parent traversal,
+            absolute outside, or a symlink pointing outside).
+    """
+    env = os.environ if environ is None else environ
+    root = Path(cwd).expanduser().resolve()
+    override = env.get(ENV_DECISIONS_PATH)
+    if override and env.get(ENV_PYTEST):
+        candidate = Path(override).expanduser()
+        return (candidate if candidate.is_absolute() else root / candidate).resolve()
+
+    candidate = root / CACHE_FILENAME
+    resolved = candidate.resolve()
+    try:
+        resolved.relative_to(root)
+    except ValueError as exc:
+        raise CachePathError(f"decision cache path escapes project root: {resolved} not under {root}") from exc
+    if resolved == root:
+        raise CachePathError(f"decision cache path resolves to the project root: {resolved}")
+    return resolved
+
+
+def checker_cache_path(*, cwd: Path | str | None = None, environ: Mapping[str, str] | None = None) -> Path:
+    """Resolve the cache path from the checker subprocess.
+
+    The runner launches pylint with ``cwd=config.cwd``; an optional
+    ``PYTHON_SETUP_LINT_DECISIONS_ROOT`` hint is accepted only when it resolves
+    to that same cwd, so it cannot redirect the tracked artifact.
+
+    Args:
+        cwd: Checker working directory; defaults to ``Path.cwd()``.
+        environ: Environment mapping (tests inject a dict).
+
+    Returns:
+        The guarded cache path.
+
+    Raises:
+        CachePathError: The root hint disagrees with the checker cwd, or the
+            resolved path escapes cwd.
+    """
+    env = os.environ if environ is None else environ
+    actual_root = Path(cwd if cwd is not None else Path.cwd()).expanduser().resolve()
+    hint = env.get(ENV_ROOT)
+    if hint and Path(hint).expanduser().resolve() != actual_root:
+        raise CachePathError(f"decision root hint {hint!r} does not match checker cwd {actual_root}")
+    return resolve_cache_path(actual_root, environ=env)
+
+
+def _python_files_under(base: Path, root: Path) -> set[str]:
+    files: set[str] = set()
+    for candidate in base.rglob("*"):
+        if candidate.suffix not in _ALLOWED_FILE_SUFFIXES:
+            continue
+        try:
+            relative = candidate.relative_to(root)
+        except ValueError:  # symlinked directory outside the project root
+            continue
+        if any(part in _EXCLUDED_DIRS for part in relative.parts):
+            continue
+        files.add(relative.as_posix())
+    return files
+
+
+def paths_in_scope(cwd: Path | str, path: str | None = None) -> set[str]:
+    """Return sorted POSIX project-relative Python paths selected by ``--path``.
+
+    Args:
+        cwd: Linted project root.
+        path: File or directory under the root; ``None`` means a full sweep.
+
+    Returns:
+        Set of POSIX relative paths.
+
+    Raises:
+        CachePathError: ``--path`` escapes the project root.
+    """
+    root = Path(cwd).expanduser().resolve()
+    if path is None:
+        return _python_files_under(root, root)
+    target = Path(path).expanduser()
+    target = (target if target.is_absolute() else root / target).resolve()
+    try:
+        target.relative_to(root)
+    except ValueError as exc:
+        raise CachePathError(f"--path escapes project root: {target} not under {root}") from exc
+    if not target.exists():
+        raise CachePathError(f"--path does not exist: {target}")
+    if target.is_file():
+        return {target.relative_to(root).as_posix()}
+    if not target.is_dir():
+        return set()
+    return _python_files_under(target, root)
+
+
+def source_relpath(cwd: Path | str, file: Path | str) -> str:
+    """Convert a linted file path to a POSIX project-relative path.
+
+    Args:
+        cwd: Linted project root.
+        file: File path reported by pylint/astroid.
+
+    Returns:
+        POSIX relative path.
+
+    Raises:
+        CachePathError: The file is outside the project root.
+    """
+    root = Path(cwd).expanduser().resolve()
+    candidate = Path(file).expanduser()
+    candidate = (candidate if candidate.is_absolute() else root / candidate).resolve()
+    try:
+        return candidate.relative_to(root).as_posix()
+    except ValueError as exc:
+        raise CachePathError(f"linted file escapes project root: {candidate} not under {root}") from exc
+
+
+def _as_str(raw: Any, field: str) -> str:
+    if not isinstance(raw, str):
+        raise CacheCorruptError(f"entry field {field!r} is not a string")
+    return raw
+
+
+def _as_version(raw: Any) -> int:
+    if not isinstance(raw, int) or isinstance(raw, bool):
+        raise CacheCorruptError("entry field 'version' is not an integer")
+    return raw
+
+
+def _as_files(raw: Any) -> tuple[str, ...]:
+    if not isinstance(raw, list) or not all(isinstance(item, str) for item in raw):
+        raise CacheCorruptError("entry field 'files' is not a list of strings")
+    return tuple(raw)
+
+
+def _as_decision(raw: Any) -> bool:
+    if not isinstance(raw, bool):
+        raise CacheCorruptError("entry field 'decision' is not a boolean")
+    return raw
+
+
+def _entry_from_json(raw: object) -> CacheEntry:
+    if not isinstance(raw, dict):
+        raise CacheCorruptError("cache entry is not an object")
+    entry = CacheEntry(
+        key=_as_str(raw.get("key"), "key"),
+        justification=_as_str(raw.get("justification"), "justification"),
+        rule=_as_str(raw.get("rule"), "rule"),
+        model=_as_str(raw.get("model"), "model"),
+        decision=_as_decision(raw.get("decision")),
+        files=_as_files(raw.get("files")),
+        version=_as_version(raw.get("version")),
+        prompt_hash=_as_str(raw.get("prompt_hash"), "prompt_hash"),
+        last_seen=_as_str(raw.get("last_seen"), "last_seen"),
+    )
+    _validate_entry(entry)
+    return entry
+
+
+def _validate_encoded(value: str, field: str) -> None:
+    if not _KEY_RE.match(value):
+        raise CacheCorruptError(f"malformed {field}: {value!r}")
+    payload = "".join(value.split(".")[1:])
+    if len(payload) != 52:
+        raise CacheCorruptError(f"{field} does not encode a full 256-bit digest")
+    try:
+        base64.b32decode(payload.upper() + "====")
+    except ValueError as exc:
+        raise CacheCorruptError(f"{field} is not valid base32: {exc}") from exc
+
+
+def _validate_entry(entry: CacheEntry) -> None:
+    _validate_encoded(entry.key, "cache key")
+    _validate_encoded(entry.prompt_hash, "prompt_hash")
+    if entry.version != SCHEMA_VERSION:
+        raise CacheCorruptError(f"unsupported cache entry version: {entry.version}")
+    if not entry.justification or not entry.model:
+        raise CacheCorruptError("empty justification or model")
+    if not entry.files:
+        raise CacheCorruptError("entry has no files")
+    if tuple(sorted(set(entry.files))) != entry.files:
+        raise CacheCorruptError(f"files must be sorted unique: {entry.files!r}")
+    for file in entry.files:
+        if Path(file).is_absolute() or ".." in Path(file).parts or "\\" in file:
+            raise CacheCorruptError(f"file must be a POSIX relative path: {file!r}")
+    if _BARE_HEX_RE.search(entry.justification):
+        raise CacheCorruptError("justification contains a bare hex run >= 20")
+    try:
+        datetime.strptime(entry.last_seen, "%Y-%m-%d")
+    except ValueError as exc:
+        raise CacheCorruptError(f"last_seen must be YYYY-MM-DD: {entry.last_seen!r}") from exc
+
+
+def load_entries(path: Path, *, strict: bool = False) -> list[CacheEntry]:
+    """Load and validate the tracked array.
+
+    Args:
+        path: Cache path.
+        strict: Raise on corrupt content (refresh) instead of returning an
+            empty list (normal lint must never break on a bad cache).
+
+    Returns:
+        Validated entries.
+
+    Raises:
+        CacheCorruptError: ``strict`` and the file is unreadable/schema-invalid.
+    """
+    try:
+        raw = json.loads(path.read_text(encoding="utf-8"))
+    except FileNotFoundError:
+        return []
+    except (OSError, ValueError) as exc:
+        if strict:
+            raise CacheCorruptError(f"cannot load decision cache {path}: {exc}") from exc
+        return []
+    if not isinstance(raw, list):
+        if strict:
+            raise CacheCorruptError(f"decision cache {path} must be a JSON array")
+        return []
+    entries: list[CacheEntry] = []
+    for item in raw:
+        try:
+            entries.append(_entry_from_json(item))
+        except (CacheCorruptError, TypeError, ValueError) as exc:
+            if strict:
+                raise CacheCorruptError(f"invalid decision cache entry: {exc}") from exc
+    return entries
+
+
+def dump_entries(entries: Iterable[CacheEntry]) -> str:
+    """Serialize entries deterministically.
+
+    Deduplicates by logical key (unioning files), sorts by
+    ``(rule, justification, model)``, and enforces the no-bare-hex contract.
+
+    Args:
+        entries: Entries to serialize.
+
+    Returns:
+        ``indent=2``, ``sort_keys=True`` JSON array with a trailing newline.
+
+    Raises:
+        CacheCorruptError: Duplicate key with conflicting decisions or bare hex
+            survived sanitization.
+    """
+    merged: dict[str, CacheEntry] = {}
+    for entry in entries:
+        existing = merged.get(entry.key)
+        if existing is None:
+            merged[entry.key] = entry
+            continue
+        if existing.decision != entry.decision:
+            raise CacheCorruptError(f"conflicting decisions for key {entry.key}")
+        merged[entry.key] = replace(
+            existing,
+            files=tuple(sorted(set(existing.files) | set(entry.files))),
+            last_seen=max(existing.last_seen, entry.last_seen),
+        )
+    ordered = sorted(merged.values(), key=lambda entry: (entry.rule, entry.justification, entry.model, entry.key))
+    rendered = json.dumps([entry.to_json() for entry in ordered], indent=2, sort_keys=True) + "\n"
+    if _BARE_HEX_RE.search(rendered):
+        raise CacheCorruptError("serialized cache contains a bare hex run >= 20")
+    return rendered
+
+
+def _target_mode(path: Path) -> int:
+    if path.exists():
+        return path.stat().st_mode & 0o777
+    current_umask = os.umask(0)
+    os.umask(current_umask)
+    return 0o666 & ~current_umask
+
+
+def _atomic_write(path: Path, text: str) -> None:
+    path.parent.mkdir(parents=True, exist_ok=True)
+    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
+    temporary_path = Path(temporary)
+    try:
+        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
+            handle.write(text)
+            handle.flush()
+            os.fsync(handle.fileno())
+        os.chmod(temporary_path, _target_mode(path))
+        os.replace(temporary_path, path)
+        directory = os.open(path.parent, os.O_RDONLY)
+        try:
+            os.fsync(directory)
+        finally:
+            os.close(directory)
+    except BaseException:
+        with contextlib.suppress(OSError):
+            temporary_path.unlink()
+        raise
+
+
+@contextlib.contextmanager
+def refresh_lock(cache_path: Path) -> Generator[None]:
+    """Hold an exclusive, crash-safe refresh lock beside the cache.
+
+    Args:
+        cache_path: Tracked cache path.
+
+    Yields:
+        ``None`` while the lock is held.
+
+    Raises:
+        RefreshLockError: Another refresh holds the lock.
+    """
+    lock_path = cache_path.with_name(LOCK_FILENAME)
+    lock_path.parent.mkdir(parents=True, exist_ok=True)
+    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
+    try:
+        if fcntl is not None:
+            try:
+                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
+            except OSError as exc:
+                raise RefreshLockError(f"another refresh holds {lock_path}") from exc
+        yield
+    finally:
+        if fcntl is not None:
+            with contextlib.suppress(OSError):
+                fcntl.flock(descriptor, fcntl.LOCK_UN)
+        os.close(descriptor)
+
+
+def _prune_files(
+    entry: CacheEntry,
+    *,
+    root: Path,
+    scope: set[str] | None,
+) -> tuple[str, ...] | None:
+    kept: list[str] = []
+    for file in entry.files:
+        if scope is not None and file not in scope:
+            kept.append(file)
+        elif (root / file).is_file():
+            kept.append(file)
+    return tuple(sorted(kept)) or None
+
+
+def merge_refresh(
+    existing: Iterable[CacheEntry],
+    observed: Iterable[Observation],
+    *,
+    cwd: Path | str,
+    current_model: str,
+    current_prompt_hash: str,
+    last_seen: str,
+    scope: set[str] | None = None,
+) -> list[CacheEntry]:
+    """Merge observed verdicts, union files, and prune missing/stale entries.
+
+    Args:
+        existing: Entries loaded from the tracked cache.
+        observed: Verdicts produced during this refresh sweep.
+        cwd: Project root used for existence checks.
+        current_model: Current model string.
+        current_prompt_hash: Current prompt fingerprint.
+        last_seen: Deterministic ``YYYY-MM-DD`` stamp for observed entries.
+        scope: Files selected by ``--path``; ``None`` means full sweep.
+
+    Returns:
+        Merged entries ready for :func:`dump_entries`.
+    """
+    root = Path(cwd).expanduser().resolve()
+    merged: dict[str, CacheEntry] = {entry.key: entry for entry in existing}
+    for observation in observed:
+        key = derive_key(observation.justification, observation.rule, observation.model)
+        stored_justification = sanitize_tracked_text(observation.justification)
+        files = {observation.file}
+        existing_entry = merged.get(key)
+        if existing_entry is not None:
+            files |= set(existing_entry.files)
+        merged[key] = CacheEntry(
+            key=key,
+            justification=stored_justification,
+            rule=observation.rule,
+            model=observation.model,
+            decision=observation.decision,
+            files=tuple(sorted(files)),
+            version=SCHEMA_VERSION,
+            prompt_hash=current_prompt_hash,
+            last_seen=last_seen,
+        )
+
+    result: list[CacheEntry] = []
+    for entry in merged.values():
+        if scope is not None and not set(entry.files) & scope:
+            # Nothing about this entry was swept: ADR-017 retains unscanned files.
+            result.append(entry)
+            continue
+        stale = entry.model != current_model or entry.prompt_hash != current_prompt_hash
+        # A scoped refresh cannot judge the out-of-scope share of an entry, so a
+        # stale mixed entry is retained (its old-model key is unreachable under
+        # the new model and a later full refresh prunes it).
+        fully_scanned = scope is None or set(entry.files) <= scope
+        if stale and fully_scanned:
+            continue
+        files = _prune_files(entry, root=root, scope=scope)
+        if files is None:
+            continue
+        result.append(replace(entry, files=files))
+    return result
+
+
+def refresh(
+    *,
+    cwd: Path | str,
+    observed: Iterable[Observation],
+    current_model: str,
+    current_prompt_hash: str,
+    last_seen: str,
+    path: str | None = None,
+    environ: Mapping[str, str] | None = None,
+) -> Path:
+    """Explicit refresh entry point: lock, load, merge, atomic replace.
+
+    Args:
+        cwd: Linted project root (runner ``config.cwd``).
+        observed: Verdicts collected by the refresh sweep.
+        current_model: Current model string.
+        current_prompt_hash: Current prompt fingerprint.
+        last_seen: Deterministic date stamp.
+        path: Optional ``--path`` scope.
+        environ: Environment mapping (tests inject a dict).
+
+    Returns:
+        The written cache path.
+    """
+    cache_path = resolve_cache_path(cwd, environ=environ)
+    scope = paths_in_scope(cwd, path) if path is not None else None
+    with refresh_lock(cache_path):
+        existing = load_entries(cache_path, strict=True)
+        merged = merge_refresh(
+            existing,
+            observed,
+            cwd=cwd,
+            current_model=current_model,
+            current_prompt_hash=current_prompt_hash,
+            last_seen=last_seen,
+            scope=scope,
+        )
+        _atomic_write(cache_path, dump_entries(merged))
+    return cache_path
+
+
+def find_entry(
+    entries: Iterable[CacheEntry],
+    *,
+    justification: str,
+    rule: str,
+    model: str,
+    current_prompt_hash: str,
+) -> CacheEntry | None:
+    """Read-path lookup used by normal lint (never writes).
+
+    Args:
+        entries: Loaded tracked entries.
+        justification: Unredacted normalized justification.
+        rule: Normalized rule string.
+        model: Current model string.
+        current_prompt_hash: Current prompt fingerprint.
+
+    Returns:
+        Matching entry for the current model/prompt, else ``None``.
+    """
+    key = derive_key(justification, rule, model)
+    for entry in entries:
+        if entry.key == key and entry.prompt_hash == current_prompt_hash:
+            return entry
+    return None
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/decision_pipeline.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/decision_pipeline.py
new file mode 100644
index 0000000..bccdc39
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/decision_pipeline.py
@@ -0,0 +1,259 @@
+"""Prototype of the heuristic-first veto pipeline over the tracked cache.
+
+Mirrors the ADR-014/017 decision shape without touching production code:
+
+1. heuristic rejects -> ``False`` immediately, no backend and no cache contact;
+2. cache hit (current model + prompt) -> persisted verdict wins;
+3. cache miss with no backend -> heuristic verdict stands (``True`` for an
+   accepted justification);
+4. cache miss with a backend -> ``score >= DECISION_THRESHOLD``;
+5. only refresh mode records an observation for the explicit refresh writer.
+
+Normal lint never calls :func:`decision_cache.refresh`.
+"""
+
+from __future__ import annotations
+
+import os
+from dataclasses import dataclass, field
+from pathlib import Path
+from typing import Protocol
+
+from decision_cache import (
+    DECISION_THRESHOLD,
+    CacheEntry,
+    Observation,
+    derive_key,
+    find_entry,
+    normalize_justification,
+    normalize_rule,
+)
+
+_BOILERPLATE = frozenset(
+    {
+        "noqa",
+        "ignore",
+        "suppress",
+        "disable",
+        "skip",
+        "todo",
+        "fixme",
+        "hack",
+        "fixed",
+        "works",
+        "broken",
+        "check",
+        "update",
+        "remove",
+        "change",
+        "improve",
+        "refactor",
+        "done",
+        "test",
+        "blank",
+        "empty",
+        "pre-existing",
+        "preexisting",
+        "baseline",
+        "base-line",
+        "wip",
+        "tbd",
+        "temp",
+        "temporary",
+        "existing",
+        "as-is",
+        "legacy",
+        "will fix",
+        "later",
+        "eventually",
+        "someday",
+        "placeholder",
+        "stub here",
+        "for now",
+        "to do",
+        "fixme later",
+        "carryover",
+    }
+)
+_MEANINGLESS_PHRASES = frozenset(
+    {
+        "fix this",
+        "need to check",
+        "maybe later",
+        "not sure",
+        "pre existing",
+        "in baseline",
+        "was already",
+        "not my code",
+        "carry over",
+        "from before",
+        "carry from",
+        "pre-existing issue",
+        "baseline issue",
+        "todo later",
+        "existing issue",
+        "will fix later",
+        "fix later",
+        "preexisting issue",
+    }
+)
+
+
+class DecisionBackend(Protocol):
+    """ADR-014 backend protocol."""
+
+    def decide(self, justification: str, rule: str, context: str) -> float:
+        """Return a probability in ``[0.0, 1.0]``."""
+        ...
+
+
+@dataclass
+class FakeBackend:
+    """Deterministic stand-in for a model."""
+
+    score: float
+    calls: list[tuple[str, str, str]] = field(default_factory=list)
+
+    def decide(self, justification: str, rule: str, context: str) -> float:
+        """Record the call and return the configured score."""
+        self.calls.append((justification, rule, context))
+        return self.score
+
+
+@dataclass
+class NoBackend:
+    """Explicit no-model backend (ADR-016 I4 posture)."""
+
+    calls: int = 0
+
+    def decide(self, justification: str, rule: str, context: str) -> float:  # pragma: no cover - never called
+        """Fail loudly if a caller reaches the model with no model configured."""
+        self.calls += 1
+        raise AssertionError("NoBackend must not be called; heuristic stands")
+
+
+def heuristic_accepts(text: str, *, rule: str | None = None) -> bool:
+    """Mirror the production heuristic gate from ``checkers/_base.py``.
+
+    Args:
+        text: Justification text (after ``comment or text`` selection).
+        rule: Suppression rule symbol.
+
+    Returns:
+        True when the justification is specific enough to be model-eligible.
+    """
+    primary = text.strip()
+    if not primary or len(primary) < 5:
+        return False
+    primary_lower = primary.lower()
+    if primary_lower in _BOILERPLATE or primary_lower in _MEANINGLESS_PHRASES:
+        return False
+    return not (rule and primary_lower == rule.lower())
+
+
+@dataclass
+class DecisionResult:
+    """Outcome of one prototype decision."""
+
+    decision: bool
+    source: str
+    backend_called: bool
+    observation: Observation | None
+
+
+def decide(
+    text: str,
+    *,
+    rule: str,
+    code_context: str,
+    file: str,
+    model: str,
+    current_prompt_hash: str,
+    entries: list[CacheEntry],
+    backend: DecisionBackend | None,
+    refresh_mode: bool,
+    comment: str | None = None,
+) -> DecisionResult:
+    """Apply the heuristic-first veto pipeline.
+
+    Args:
+        text: Raw justification text.
+        rule: Joined rule symbols.
+        code_context: Source context for the backend.
+        file: POSIX project-relative linted file.
+        model: Current model string.
+        current_prompt_hash: Current prompt fingerprint.
+        entries: Loaded tracked entries (read-only here).
+        backend: Model backend, or ``None`` when no model is configured.
+        refresh_mode: When true, return an observation for the refresh writer.
+        comment: Checker ``comment`` argument when it differs from ``text``.
+
+    Returns:
+        Decision plus provenance used by the four proofs.
+    """
+    raw = (comment or text).strip()
+    normalized = normalize_justification(raw)
+    if not heuristic_accepts(raw, rule=rule):
+        return DecisionResult(decision=False, source="heuristic-reject", backend_called=False, observation=None)
+
+    joined_rule = normalize_rule(rule)
+    hit = find_entry(
+        entries,
+        justification=normalized,
+        rule=joined_rule,
+        model=model,
+        current_prompt_hash=current_prompt_hash,
+    )
+    if hit is not None:
+        observation = (
+            Observation(
+                justification=normalized,
+                rule=joined_rule,
+                model=model,
+                decision=hit.decision,
+                file=file,
+            )
+            if refresh_mode
+            else None
+        )
+        return DecisionResult(
+            decision=hit.decision,
+            source="cache-hit",
+            backend_called=False,
+            observation=observation,
+        )
+
+    if backend is None:
+        return DecisionResult(decision=True, source="heuristic-accept", backend_called=False, observation=None)
+
+    score = backend.decide(normalized, joined_rule, code_context)
+    decision = score >= DECISION_THRESHOLD
+    observation = (
+        Observation(
+            justification=normalized,
+            rule=joined_rule,
+            model=model,
+            decision=decision,
+            file=file,
+        )
+        if refresh_mode
+        else None
+    )
+    return DecisionResult(decision=decision, source="backend", backend_called=True, observation=observation)
+
+
+def environment() -> dict[str, str]:
+    """Return the process environment as a plain mapping."""
+    return dict(os.environ)
+
+
+def posix_file(cwd: Path | str, file: str) -> str:
+    """Normalize a file argument to a POSIX project-relative path."""
+    from decision_cache import source_relpath
+
+    return source_relpath(cwd, file)
+
+
+def key_for(justification: str, rule: str, model: str) -> str:
+    """Expose key derivation for proof assertions."""
+    return derive_key(normalize_justification(justification), normalize_rule(rule), model)
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/encoding_lab.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/encoding_lab.py
new file mode 100644
index 0000000..adfae13
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/encoding_lab.py
@@ -0,0 +1,135 @@
+"""Empirically choose a non-hex, secrets-clean digest encoding for the tracked cache.
+
+Consumes the repository's own `.secrets.baseline` plugins/filters.  The
+`^\\.factory/` filename filter is avoided by scanning absolute paths; the
+eventual artifact lives at the consumer project root anyway, outside
+`.factory/`.  Every candidate encodes the same full 256-bit SHA-256 digest;
+truncation is rejected because cache identity must be collision-safe.
+"""
+
+from __future__ import annotations
+
+import base64
+import hashlib
+import json
+from pathlib import Path
+from typing import Callable
+
+from detect_secrets.core.scan import scan_file
+from detect_secrets.settings import transient_settings
+
+REPO_ROOT = Path(__file__).resolve().parents[6]
+BASELINE = REPO_ROOT / ".secrets.baseline"
+POC = Path(__file__).resolve().parent
+OUT = POC / "out"
+TMP = POC / "tmp" / "encoding_lab"
+
+DIGEST = hashlib.sha256(b"justification\x00W9704\x00fake-backend rev test prompt-v1").digest()
+
+
+def _b32(data: bytes) -> str:
+    return base64.b32encode(data).decode("ascii").rstrip("=").lower()
+
+
+def _b32_upper(data: bytes) -> str:
+    return base64.b32encode(data).decode("ascii").rstrip("=")
+
+
+def _b64url(data: bytes) -> str:
+    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")
+
+
+def _b58(data: bytes) -> str:
+    alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
+    number = int.from_bytes(data, "big")
+    encoded = ""
+    while number:
+        number, rem = divmod(number, 58)
+        encoded = alphabet[rem] + encoded
+    return encoded or "1"
+
+
+def _b36(data: bytes) -> str:
+    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
+    number = int.from_bytes(data, "big")
+    encoded = ""
+    while number:
+        number, rem = divmod(number, 36)
+        encoded = alphabet[rem] + encoded
+    return encoded or "0"
+
+
+def _decimal(data: bytes) -> str:
+    return str(int.from_bytes(data, "big"))
+
+
+def _group(text: str, size: int, sep: str) -> str:
+    return sep.join(text[i : i + size] for i in range(0, len(text), size))
+
+
+CANDIDATES: dict[str, Callable[[bytes], str]] = {
+    "hex_full": lambda d: d.hex(),
+    "hex_short12": lambda d: d.hex()[:12],
+    "hex_dashed8": lambda d: "d1-" + _group(d.hex(), 8, "-"),
+    "base32_lower": _b32,
+    "base32_lower_prefixed": lambda d: "dk1_" + _b32(d),
+    "base32_lower_dashed8": lambda d: "dk1-" + _group(_b32(d), 8, "-"),
+    "base32_lower_dotted8": lambda d: "dk1." + _group(_b32(d), 8, "."),
+    "base32_upper": _b32_upper,
+    "base32_upper_dashed8": lambda d: "DK1-" + _group(_b32_upper(d), 8, "-"),
+    "base32_upper_dotted8": lambda d: "DK1." + _group(_b32_upper(d), 8, "."),
+    "base64url": _b64url,
+    "base58": _b58,
+    "base36": _b36,
+    "decimal": _decimal,
+    "decimal_prefixed": lambda d: "dk1:" + _decimal(d),
+}
+
+
+def scan(path: Path) -> list[dict[str, str]]:
+    return [
+        {
+            "type": secret.type,
+            "line": secret.secret_value,
+        }
+        for secret in scan_file(str(path))
+    ]
+
+
+def make_entry(value: str) -> dict[str, object]:
+    return {
+        "decision": True,
+        "files": ["src/app.py"],
+        "justification": "retry loop must not swallow keyboard interrupt",
+        "last_seen": "2026-11-08",
+        "model": "fake-backend rev test prompt-v1",
+        "prompt_hash": value,
+        "rule": "W9704",
+        "version": 1,
+    }
+
+
+def main() -> None:
+    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
+    TMP.mkdir(parents=True, exist_ok=True)
+    results: dict[str, object] = {}
+    with transient_settings(baseline):
+        for name, encoder in CANDIDATES.items():
+            value = encoder(DIGEST)
+            path = TMP / f"{name}.json"
+            path.write_text(json.dumps(make_entry(value), indent=2, sort_keys=True) + "\n", encoding="utf-8")
+            results[name] = {
+                "length": len(value),
+                "value": value,
+                "filename_findings": scan(path),
+            }
+
+    OUT.mkdir(parents=True, exist_ok=True)
+    (OUT / "encoding_lab.json").write_text(json.dumps(results, indent=2, sort_keys=True) + "\n", encoding="utf-8")
+    for name, data in results.items():
+        findings = data["filename_findings"]  # type: ignore[index]
+        print(f"{name:26} len={data['length']:>3} findings={len(findings)} {findings}")  # type: ignore[index]
+
+
+if __name__ == "__main__":
+    main()
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/make_verdict.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/make_verdict.py
new file mode 100644
index 0000000..61da755
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/make_verdict.py
@@ -0,0 +1,132 @@
+"""Assemble the machine-readable spike verdict from the proof outputs."""
+
+from __future__ import annotations
+
+import json
+from pathlib import Path
+from typing import Any
+
+POC = Path(__file__).resolve().parent
+OUT = POC / "out"
+
+
+def load(name: str) -> dict[str, Any]:
+    """Load one proof output."""
+    return json.loads((OUT / name).read_text(encoding="utf-8"))
+
+
+def main() -> int:
+    """Write ``out/verdict.json``."""
+    proofs = load("proofs.json")
+    memory = load("memory_time.json")
+    required = ["proof_1_heuristic_rejected_without_backend", "proof_2_accepted_hit_equals_persisted", "proof_3_accepted_miss_absent_heuristic_true", "proof_4_normal_lint_zero_writes_by_hash"]
+    all_ok = proofs.get("verdict") == "feasible" and all(proofs.get(name, {}).get("ok") is True for name in required)
+    verdict = {
+        "verdict": "feasible" if all_ok else "blocked",
+        "contract": {
+            "project_root": {
+                "value": "config.cwd",
+                "guard": "resolved cache path must stay within cwd; symlink, parent and absolute escapes rejected",
+                "evidence": ["contract_root_guard", "contract_checker_root_hint"],
+            },
+            "schema": {
+                "top_level": "JSON array",
+                "entry_fields": ["decision", "files", "justification", "key", "last_seen", "model", "prompt_hash", "rule", "version"],
+                "sort_key": ["rule", "justification", "model"],
+                "indent": 2,
+                "sort_keys": True,
+                "trailing_newline": True,
+                "evidence": "contract_schema_sort",
+            },
+            "encoding": {
+                "scheme": "dk1 + dot-separated lowercase base32 groups of 8 over the full SHA-256 digest",
+                "bare_hex": "no contiguous run >= 20; groups cap at 8",
+                "detect_secrets": "clean against .secrets.baseline; full-hex negative control flagged",
+                "collision_safe": "full 256-bit digest; 25000-key probe had zero collisions",
+                "evidence": ["contract_encoding_collision", "contract_detect_secrets"],
+            },
+            "prune": {
+                "automatic_on_refresh": True,
+                "missing_files": True,
+                "stale_model": True,
+                "stale_prompt_hash": True,
+                "no_prune_flag": True,
+                "evidence": "contract_prune",
+            },
+            "refresh": {
+                "invocation": "lint --refresh-decisions [--path ...]",
+                "writer": "checker call path in refresh mode only",
+                "lock": "fcntl.flock on .python-setup-decisions.lock",
+                "atomic_replace": True,
+                "merge": "load + union files + prune + atomic replace",
+                "evidence": ["contract_determinism", "contract_atomic_failure", "contract_refresh_mode_env"],
+            },
+            "ci_fail": {
+                "variables": ["CI", "GITHUB_ACTIONS"],
+                "exit_code": 2,
+                "writes_nothing": True,
+                "evidence": "contract_ci_fail",
+            },
+            "decisions_path": {
+                "variable": "PYTHON_SETUP_LINT_DECISIONS_PATH",
+                "honored_only_under": "PYTEST_CURRENT_TEST",
+                "production": "ignored; root is config.cwd",
+                "evidence": "contract_decisions_path_test_only",
+            },
+            "files": {
+                "format": "sorted unique POSIX relative paths",
+                "merge": "union on refresh",
+                "cardinality": "one entry per (justification, rule, model) key",
+                "evidence": "contract_files_union_posix",
+            },
+            "path_scoping": {
+                "behavior": "scoped sweep and prune; entries for unscanned files retained; missing unscanned files retained",
+                "stale_mixed_entry": "retained while it has an unscanned share; full refresh prunes it",
+                "evidence": ["contract_path_scoping", "contract_scoped_stale_mixed"],
+            },
+            "jobs": {
+                "required": 1,
+                "guard": "explicit --jobs and every resolved rcfile; jobs=0 auto-detect and jobs>1 fail loudly",
+                "head_rcfiles": "no explicit jobs override",
+                "evidence": "contract_jobs_guard",
+            },
+            "placement": {
+                "module": "python_setup_lint/decisions/_decision_cache.py (+ .pyi)",
+                "edges": ["checkers -> decisions", "runner -> decisions"],
+                "decisions_depends_on": [],
+                "tach": "legal placement exit 0; decisions -> checkers negative control exit 1",
+                "evidence": "contract_tach_placement",
+            },
+            "memory_time": {
+                "rlimit_as_mb": memory["rlimit_as_mb"],
+                "three_pylint_loads": memory["loads"],
+                "model_eval_over_2048mb": memory["model_eval_over_2048mb"],
+                "ml_runtime": memory["ml_runtime"],
+                "note": memory["onnx_vs_torch_note"],
+                "three_load_note": memory["three_load_note"],
+            },
+        },
+        "required_proofs": {name: proofs.get(name) for name in required},
+        "writer_verdict": proofs.get("contract_writer_verdict"),
+        "evidence_files": {
+            "proofs": "out/proofs.json",
+            "memory_time": "out/memory_time.json",
+            "report": "README.md",
+        },
+        "recommendations": [
+            "Implement the cache in the new decisions module with the ADR-018 tach edges; keep _decision_backend.py in checkers.",
+            "Thread RunnerConfig.refresh_decisions and the --refresh-decisions flag; fail before writes under CI/GITHUB_ACTIONS and when effective pylint jobs != 1.",
+            "Use the checker call path as the refresh writer, gated by an internal refresh env flag; normal lint must only read the tracked cache.",
+            "Serialize with dotted base32, full SHA-256, sort_keys/indent=2, and a runtime no-bare-hex guard; redact long hex runs in justifications and fail loudly on hex file paths.",
+            "Rewrite tests/assumptions/test_pylint_cache_semantics.py deliberately for the tracked schema; add tmp round-trip, zero-write hash, double-run determinism, prune, scoping, CI/jobs/isolation and secrets tests.",
+            "Add .python-setup-decisions.lock to ignore rules or document it; provide a non-POSIX lock fallback.",
+            "In I5, benchmark the chosen model under RLIMIT_AS=2048 in the pylint subprocess (ONNX vs torch) before shipping a backend; GLiDE's 2846 MB torch peak exceeds the runner cap.",
+        ],
+    }
+    (OUT / "verdict.json").write_text(json.dumps(verdict, indent=2, sort_keys=True) + "\n", encoding="utf-8")
+    print(f"verdict: {verdict['verdict']} -> {OUT / 'verdict.json'}")
+    return 0 if all_ok else 1
+
+
+if __name__ == "__main__":
+    raise SystemExit(main())
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/measure_memory_time.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/measure_memory_time.py
new file mode 100644
index 0000000..735140f
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/measure_memory_time.py
@@ -0,0 +1,200 @@
+"""Measure the three pylint loads under the runner's 2048 MB RLIMIT_AS.
+
+Also records the ML runtime availability and the sibling model-eval PoC stats
+that inform the ONNX-vs-torch note.  Writes ``out/memory_time.json``.
+"""
+
+from __future__ import annotations
+
+import importlib.util
+import json
+import re
+import resource
+import shutil
+import subprocess
+import sys
+import time
+from pathlib import Path
+from typing import Any
+
+POC = Path(__file__).resolve().parent
+REPO_ROOT = Path(__file__).resolve().parents[6]
+TMP = POC / "tmp" / "memory_time"
+OUT = POC / "out"
+PROJECT = TMP / "project"
+MODEL_EVAL_OUT = POC.parents[1] / "model-eval-poc" / "poc" / "out"
+RLIMIT_AS_MB = 2048
+TIMEOUT_SECONDS = 120
+
+_ELAPSED_RE = re.compile(r"Elapsed \(wall clock\) time \(h:mm:ss or m:ss\): (?P<value>\S+)")
+_RSS_RE = re.compile(r"Maximum resident set size \(kbytes\): (?P<value>\d+)")
+
+
+def _limit() -> None:
+    if RLIMIT_AS_MB > 0:
+        limit = RLIMIT_AS_MB * 1024 * 1024
+        resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
+
+
+def _parse_elapsed(text: str) -> float | None:
+    match = _ELAPSED_RE.search(text)
+    if match is None:
+        return None
+    parts = match.group("value").split(":")
+    seconds = 0.0
+    for part in parts:
+        seconds = seconds * 60 + float(part)
+    return seconds
+
+
+def setup_project() -> None:
+    """Create a minimal project covering the three pylint scopes."""
+    shutil.rmtree(PROJECT, ignore_errors=True)
+    (PROJECT / "src").mkdir(parents=True)
+    (PROJECT / "tests").mkdir(parents=True)
+    (PROJECT / "src" / "app.py").write_text(
+        "from beartype import beartype\n\n\n"
+        "@beartype\ndef load() -> int:\n    return 1\n\n\nVALUE = load()\n",
+        encoding="utf-8",
+    )
+    (PROJECT / "src" / "app.pyi").write_text(
+        "from beartype import beartype\n\n\n"
+        "@beartype\ndef load() -> int: ...\n",
+        encoding="utf-8",
+    )
+    (PROJECT / "tests" / "test_app.py").write_text(
+        '"""Fixture test module."""\n\n\ndef test_value() -> None:\n    """Check a trivial assertion."""\n    value = 2\n    assert value == 2\n',
+        encoding="utf-8",
+    )
+
+
+def package_present(name: str) -> bool:
+    """Return whether *name* is importable without importing it."""
+    return importlib.util.find_spec(name) is not None
+
+
+def measure_load(name: str, rcfile: Path, target: str) -> dict[str, object]:
+    """Run one pylint invocation under RLIMIT_AS and parse time/RSS."""
+    command = [sys.executable, "-m", "pylint", f"--rcfile={rcfile}", target]
+    wrapped = ["/usr/bin/time", "-v", *command]
+    started = time.perf_counter()
+    try:
+        completed = subprocess.run(
+            wrapped,
+            cwd=PROJECT,
+            capture_output=True,
+            text=True,
+            timeout=TIMEOUT_SECONDS,
+            check=False,
+            preexec_fn=_limit,
+        )
+        timed_out = False
+        exit_code = completed.returncode
+        stdout, stderr = completed.stdout, completed.stderr
+    except subprocess.TimeoutExpired as exc:
+        timed_out = True
+        exit_code = -1
+        stdout = exc.stdout.decode() if isinstance(exc.stdout, bytes) else (exc.stdout or "")
+        stderr = exc.stderr.decode() if isinstance(exc.stderr, bytes) else (exc.stderr or "")
+    elapsed = time.perf_counter() - started
+    combined = stdout + stderr
+    return {
+        "name": name,
+        "command": command,
+        "rcfile": str(rcfile),
+        "target": target,
+        "exit_code": exit_code,
+        "timed_out": timed_out,
+        "elapsed_seconds": round(elapsed, 3),
+        "time_reported_seconds": _parse_elapsed(stderr),
+        "peak_rss_mb": round(int(match.group("value")) / 1024, 2) if (match := _RSS_RE.search(stderr)) else None,
+        "memory_error": "MemoryError" in combined,
+        "stdout_tail": stdout.strip().splitlines()[-2:],
+        "stderr_tail": stderr.strip().splitlines()[-2:],
+    }
+
+
+def model_eval_stats() -> dict[str, dict[str, Any]]:
+    """Read the sibling model-eval PoC's per-model resource stats."""
+    stats: dict[str, dict[str, Any]] = {}
+    if not MODEL_EVAL_OUT.is_dir():
+        return stats
+    for path in sorted(MODEL_EVAL_OUT.glob("meta__*.json")):
+        if "__canonical" not in path.name and "__current" not in path.name:
+            continue
+        try:
+            raw = json.loads(path.read_text(encoding="utf-8"))
+        except (OSError, ValueError):
+            continue
+        stats[str(raw.get("model", path.stem))] = {
+            "params": raw.get("params"),
+            "weights_bytes": raw.get("weights_bytes"),
+            "load_seconds": raw.get("load_seconds"),
+            "total_seconds": raw.get("total_seconds"),
+            "peak_rss_mb": raw.get("peak_rss_mb"),
+            "torch": raw.get("torch"),
+            "sentence_transformers": raw.get("sentence_transformers"),
+        }
+    return stats
+
+
+def main() -> int:
+    """Run measurements and write the JSON report."""
+    OUT.mkdir(parents=True, exist_ok=True)
+    setup_project()
+    rcfiles = {
+        "pylint": REPO_ROOT / "config" / ".pylintrc",
+        "pylint-pyi": REPO_ROOT / "config" / ".pylintrc-pyi",
+        "pylint tests": REPO_ROOT / "config" / ".pylintrc-tests",
+    }
+    targets = {"pylint": "src/app.py", "pylint-pyi": "src/app.pyi", "pylint tests": "tests/test_app.py"}
+    loads = [measure_load(name, rcfiles[name], targets[name]) for name in ("pylint", "pylint-pyi", "pylint tests")]
+    stats = model_eval_stats()
+    over_cap = {
+        name: data["peak_rss_mb"]
+        for name, data in stats.items()
+        if isinstance(data.get("peak_rss_mb"), (int, float)) and data["peak_rss_mb"] > RLIMIT_AS_MB
+    }
+    report = {
+        "rlimit_as_mb": RLIMIT_AS_MB,
+        "loads": loads,
+        "total_elapsed_seconds": round(sum(float(str(load["elapsed_seconds"])) for load in loads), 3),
+        "all_loads_under_rlimit": all(not load["memory_error"] and load["exit_code"] == 0 for load in loads),
+        "ml_runtime": {
+            name: "present" if package_present(name) else "absent"
+            for name in ("torch", "onnxruntime", "sentence_transformers", "transformers")
+        },
+        "model_eval_stats": stats,
+        "model_eval_over_2048mb": over_cap,
+        "onnx_vs_torch_note": (
+            "torch/onnxruntime are absent from this dev environment. The sibling model-eval PoC "
+            "(torch 2.10 CPU + sentence-transformers) measured peak RSS 556-2846 MB: minilm 556 MB, "
+            "bekko-17m 624 MB, ettin-150m 991 MB, decider-nano 1464 MB, GLiDE 2846 MB. GLiDE exceeds "
+            "the runner's 2048 MB RLIMIT_AS; decider-nano is close. The model-eval research also notes "
+            "bekko's upstream ONNX browser model is ~29 MB versus 67 MB safetensors, so an ONNX path "
+            "is plausible; however ONNX Runtime is expected to avoid torch's import/framework overhead "
+            "and lower peak RSS only as an unverified hypothesis. I5 must benchmark the chosen model "
+            "under RLIMIT_AS=2048 in the pylint subprocess and prefer ONNX only if it fits without "
+            "raising the runner cap."
+        ),
+        "three_load_note": (
+            "The runner invokes pylint, pylint-pyi and pylint tests as three sequential subprocesses. "
+            "A model backend is loaded lazily per process, so up to three model loads per lint run "
+            "unless every suppression is a cache hit. Cache hits avoid model load entirely; refresh "
+            "should populate the tracked cache before normal lint in CI."
+        ),
+    }
+    (OUT / "memory_time.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
+    for load in loads:
+        print(
+            f"{load['name']:14} exit={load['exit_code']} wall={load['elapsed_seconds']}s "
+            f"peak={load['peak_rss_mb']}MB memory_error={load['memory_error']}"
+        )
+    print(f"all under RLIMIT_AS={RLIMIT_AS_MB}MB: {report['all_loads_under_rlimit']}")
+    print(f"over cap (model-eval): {over_cap or 'none'}")
+    print(f"report: {OUT / 'memory_time.json'}")
+    return 0 if report["all_loads_under_rlimit"] else 1
+
+
+if __name__ == "__main__":
+    raise SystemExit(main())
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/out/encoding_lab.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/out/encoding_lab.json
new file mode 100644
index 0000000..b27bb09
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/out/encoding_lab.json
@@ -0,0 +1,97 @@
+{
+  "base32_lower": {
+    "filename_findings": [],
+    "length": 52,
+    "value": "ysebfby5usvamupsxwbz33bsaffw7m3dsa3pkljwige4rslr7yga"
+  },
+  "base32_lower_dashed8": {
+    "filename_findings": [],
+    "length": 62,
+    "value": "dk1-ysebfby5-usvamups-xwbz33bs-affw7m3d-sa3pkljw-ige4rslr-7yga"
+  },
+  "base32_lower_dotted8": {
+    "filename_findings": [],
+    "length": 62,
+    "value": "dk1.ysebfby5.usvamups.xwbz33bs.affw7m3d.sa3pkljw.ige4rslr.7yga"
+  },
+  "base32_lower_prefixed": {
+    "filename_findings": [],
+    "length": 56,
+    "value": "dk1_ysebfby5usvamupsxwbz33bsaffw7m3dsa3pkljwige4rslr7yga"
+  },
+  "base32_upper": {
+    "filename_findings": [],
+    "length": 52,
+    "value": "YSEBFBY5USVAMUPSXWBZ33BSAFFW7M3DSA3PKLJWIGE4RSLR7YGA"
+  },
+  "base32_upper_dashed8": {
+    "filename_findings": [],
+    "length": 62,
+    "value": "DK1-YSEBFBY5-USVAMUPS-XWBZ33BS-AFFW7M3D-SA3PKLJW-IGE4RSLR-7YGA"
+  },
+  "base32_upper_dotted8": {
+    "filename_findings": [],
+    "length": 62,
+    "value": "DK1.YSEBFBY5.USVAMUPS.XWBZ33BS.AFFW7M3D.SA3PKLJW.IGE4RSLR.7YGA"
+  },
+  "base36": {
+    "filename_findings": [
+      {
+        "line": "4wc8skxsqct44mpklxn9jqpslc44n30z5vx8rfb0te96uqgkjw",
+        "type": "Base64 High Entropy String"
+      }
+    ],
+    "length": 50,
+    "value": "4wc8skxsqct44mpklxn9jqpslc44n30z5vx8rfb0te96uqgkjw"
+  },
+  "base58": {
+    "filename_findings": [
+      {
+        "line": "EEBFcFfZuojZqEdMBAJehNEUTG51zsjbPnrUDm7rWamR",
+        "type": "Base64 High Entropy String"
+      }
+    ],
+    "length": 44,
+    "value": "EEBFcFfZuojZqEdMBAJehNEUTG51zsjbPnrUDm7rWamR"
+  },
+  "base64url": {
+    "filename_findings": [
+      {
+        "line": "xIgShx2kqgZR8r2DnewyAUtvs2OQNvUtNkGJyMlx_gw",
+        "type": "Base64 High Entropy String"
+      }
+    ],
+    "length": 43,
+    "value": "xIgShx2kqgZR8r2DnewyAUtvs2OQNvUtNkGJyMlx_gw"
+  },
+  "decimal": {
+    "filename_findings": [],
+    "length": 77,
+    "value": "88893737397278910049857236387336479879413594793538904991125363394996377615884"
+  },
+  "decimal_prefixed": {
+    "filename_findings": [],
+    "length": 81,
+    "value": "dk1:88893737397278910049857236387336479879413594793538904991125363394996377615884"
+  },
+  "hex_dashed8": {
+    "filename_findings": [],
+    "length": 74,
+    "value": "d1-c4881287-1da4aa06-51f2bd83-9dec3201-4b6fb363-9036f52d-364189c8-c971fe0c"
+  },
+  "hex_full": {
+    "filename_findings": [
+      {
+        "line": "c48812871da4aa0651f2bd839dec32014b6fb3639036f52d364189c8c971fe0c",
+        "type": "Hex High Entropy String"
+      }
+    ],
+    "length": 64,
+    "value": "c48812871da4aa0651f2bd839dec32014b6fb3639036f52d364189c8c971fe0c"
+  },
+  "hex_short12": {
+    "filename_findings": [],
+    "length": 12,
+    "value": "c48812871da4"
+  }
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/out/memory_time.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/out/memory_time.json
new file mode 100644
index 0000000..120d498
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/out/memory_time.json
@@ -0,0 +1,143 @@
+{
+  "all_loads_under_rlimit": true,
+  "loads": [
+    {
+      "command": [
+        "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/.venv/bin/python3",
+        "-m",
+        "pylint",
+        "--rcfile=/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/config/.pylintrc",
+        "src/app.py"
+      ],
+      "elapsed_seconds": 1.328,
+      "exit_code": 0,
+      "memory_error": false,
+      "name": "pylint",
+      "peak_rss_mb": 80.08,
+      "rcfile": "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/config/.pylintrc",
+      "stderr_tail": [
+        "\tPage size (bytes): 4096",
+        "\tExit status: 0"
+      ],
+      "stdout_tail": [
+        "    }",
+        "}"
+      ],
+      "target": "src/app.py",
+      "time_reported_seconds": 1.32,
+      "timed_out": false
+    },
+    {
+      "command": [
+        "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/.venv/bin/python3",
+        "-m",
+        "pylint",
+        "--rcfile=/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/config/.pylintrc-pyi",
+        "src/app.pyi"
+      ],
+      "elapsed_seconds": 1.17,
+      "exit_code": 0,
+      "memory_error": false,
+      "name": "pylint-pyi",
+      "peak_rss_mb": 79.67,
+      "rcfile": "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/config/.pylintrc-pyi",
+      "stderr_tail": [
+        "\tPage size (bytes): 4096",
+        "\tExit status: 0"
+      ],
+      "stdout_tail": [
+        "--------------------------------------------------------------------",
+        "Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)"
+      ],
+      "target": "src/app.pyi",
+      "time_reported_seconds": 1.16,
+      "timed_out": false
+    },
+    {
+      "command": [
+        "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/.venv/bin/python3",
+        "-m",
+        "pylint",
+        "--rcfile=/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/config/.pylintrc-tests",
+        "tests/test_app.py"
+      ],
+      "elapsed_seconds": 0.617,
+      "exit_code": 0,
+      "memory_error": false,
+      "name": "pylint tests",
+      "peak_rss_mb": 62.09,
+      "rcfile": "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/config/.pylintrc-tests",
+      "stderr_tail": [
+        "\tPage size (bytes): 4096",
+        "\tExit status: 0"
+      ],
+      "stdout_tail": [
+        "    }",
+        "}"
+      ],
+      "target": "tests/test_app.py",
+      "time_reported_seconds": 0.61,
+      "timed_out": false
+    }
+  ],
+  "ml_runtime": {
+    "onnxruntime": "absent",
+    "sentence_transformers": "absent",
+    "torch": "absent",
+    "transformers": "absent"
+  },
+  "model_eval_over_2048mb": {
+    "glide": 2845.5859375
+  },
+  "model_eval_stats": {
+    "bekko-17m": {
+      "load_seconds": 0.6837534769438207,
+      "params": 16800000,
+      "peak_rss_mb": 624.3125,
+      "sentence_transformers": "6.1.0",
+      "torch": "2.10.0+cpu",
+      "total_seconds": 11.765229595941491,
+      "weights_bytes": 67198244
+    },
+    "decider-nano": {
+      "load_seconds": 12.912264187005349,
+      "params": 149015041,
+      "peak_rss_mb": 1464.35546875,
+      "sentence_transformers": null,
+      "torch": "2.15.0+cpu",
+      "total_seconds": 57.87381588795688,
+      "weights_bytes": 298044578
+    },
+    "ettin-reranker-150m": {
+      "load_seconds": 0.6794025599956512,
+      "params": 149014272,
+      "peak_rss_mb": 990.9609375,
+      "sentence_transformers": "6.2.0",
+      "torch": "2.15.0+cpu",
+      "total_seconds": 175.06913636799436,
+      "weights_bytes": 598439036
+    },
+    "glide": {
+      "load_seconds": 33.91783796297386,
+      "params": 394781696,
+      "peak_rss_mb": 2845.5859375,
+      "sentence_transformers": null,
+      "torch": "2.14.0+cpu",
+      "total_seconds": 4.849025315023027,
+      "weights_bytes": 790103664
+    },
+    "minilm-l6-v2": {
+      "load_seconds": 0.7155748220393434,
+      "params": 22713728,
+      "peak_rss_mb": 556.390625,
+      "sentence_transformers": "6.2.0",
+      "torch": "2.15.0+cpu",
+      "total_seconds": 142.04959630093072,
+      "weights_bytes": 90868376
+    }
+  },
+  "onnx_vs_torch_note": "torch/onnxruntime are absent from this dev environment. The sibling model-eval PoC (torch 2.10 CPU + sentence-transformers) measured peak RSS 556-2846 MB: minilm 556 MB, bekko-17m 624 MB, ettin-150m 991 MB, decider-nano 1464 MB, GLiDE 2846 MB. GLiDE exceeds the runner's 2048 MB RLIMIT_AS; decider-nano is close. The model-eval research also notes bekko's upstream ONNX browser model is ~29 MB versus 67 MB safetensors, so an ONNX path is plausible; however ONNX Runtime is expected to avoid torch's import/framework overhead and lower peak RSS only as an unverified hypothesis. I5 must benchmark the chosen model under RLIMIT_AS=2048 in the pylint subprocess and prefer ONNX only if it fits without raising the runner cap.",
+  "rlimit_as_mb": 2048,
+  "three_load_note": "The runner invokes pylint, pylint-pyi and pylint tests as three sequential subprocesses. A model backend is loaded lazily per process, so up to three model loads per lint run unless every suppression is a cache hit. Cache hits avoid model load entirely; refresh should populate the tracked cache before normal lint in CI.",
+  "total_elapsed_seconds": 3.115
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/out/proofs.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/out/proofs.json
new file mode 100644
index 0000000..b96da67
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/out/proofs.json
@@ -0,0 +1,261 @@
+{
+  "contract_atomic_failure": {
+    "cache_unchanged": true,
+    "failed_loudly": true,
+    "ok": true,
+    "seconds": 0.0175
+  },
+  "contract_checker_root_hint": {
+    "matching": true,
+    "mismatched_blocked": true,
+    "ok": true,
+    "seconds": 0.0005
+  },
+  "contract_ci_fail": {
+    "cache_unchanged": true,
+    "exit_codes": {
+      "CI": 2,
+      "GITHUB_ACTIONS": 2
+    },
+    "ok": true,
+    "seconds": 0.1797
+  },
+  "contract_ci_guard_function": {
+    "guard": "CI/GITHUB_ACTIONS",
+    "ok": true,
+    "seconds": 0.0
+  },
+  "contract_corrupt_cache": {
+    "normal_tolerant": true,
+    "ok": true,
+    "refresh_failed_loudly": true,
+    "seconds": 0.0006
+  },
+  "contract_decisions_path_test_only": {
+    "ok": true,
+    "production_ignored": true,
+    "pytest_honored": true,
+    "seconds": 0.0196,
+    "written": "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/isolation_override/cache.json"
+  },
+  "contract_detect_secrets": {
+    "cache": "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/.python-setup-decisions.json",
+    "findings": 0,
+    "negative_control": [
+      "Hex High Entropy String"
+    ],
+    "ok": true,
+    "real_model_findings": [],
+    "seconds": 0.0798,
+    "sha256": "fbb3161a40f66a6f552902ef0b25d6ca3c9bb0b5705060e6f1bd81930d2b3633"
+  },
+  "contract_determinism": {
+    "byte_identical": true,
+    "bytes": 1255,
+    "ok": true,
+    "seconds": 0.042,
+    "sha256": "af120cc124c4b36f812cdbadf30d4409e6fcfeeb7f08be973df2f5f2f1294e24"
+  },
+  "contract_encoding_collision": {
+    "encoded_length": 62,
+    "ok": true,
+    "redacted": "see commit <hex:40> for the retry rationale",
+    "seconds": 0.174,
+    "unique_keys": 25000
+  },
+  "contract_files_union_posix": {
+    "files": [
+      "src/a.py",
+      "src/b.py",
+      "src/c.py"
+    ],
+    "ok": true,
+    "seconds": 0.0192
+  },
+  "contract_jobs_guard": {
+    "auto_blocked": true,
+    "checks": [
+      "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/config/.pylintrc: jobs=1",
+      "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/config/.pylintrc-pyi: jobs=1",
+      "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/config/.pylintrc-tests: jobs=1"
+    ],
+    "flag_blocked": true,
+    "ok": true,
+    "rcfile_blocked": true,
+    "repo_overrides": {
+      ".pylintrc": [],
+      ".pylintrc-pyi": [],
+      ".pylintrc-tests": []
+    },
+    "seconds": 0.0794
+  },
+  "contract_lock_contention": {
+    "cache_unchanged": true,
+    "lock_blocked": true,
+    "ok": true,
+    "seconds": 0.0176
+  },
+  "contract_model_string": {
+    "fake": "fake-backend rev test prompt-v1",
+    "ok": true,
+    "real": "jina-reranker-v2-base-multilingual rev b886a1f9b91f prompt-v1",
+    "seconds": 0.0,
+    "short12": "b886a1f9b91f"
+  },
+  "contract_path_scoping": {
+    "before": 2,
+    "full_entries": 1,
+    "ok": true,
+    "scoped_entries": 2,
+    "seconds": 0.0624
+  },
+  "contract_production_untouched": {
+    "diff": "",
+    "head": "8b7cd98dd059d79a4d9fe1270989cd709cb67934",
+    "ok": true,
+    "production_lines": [],
+    "seconds": 0.0129,
+    "status": "?? .factory/tasks/modernize/items/decision-cache-design-spike/poc/\n"
+  },
+  "contract_prune": {
+    "after_missing": [
+      [
+        "src/a.py"
+      ],
+      [
+        "src/b.py"
+      ]
+    ],
+    "after_stale": 0,
+    "ok": true,
+    "seconds": 0.0227
+  },
+  "contract_refresh_mode_env": {
+    "ok": true,
+    "schema_version": 1,
+    "seconds": 0.0,
+    "threshold": 0.5
+  },
+  "contract_root_guard": {
+    "cache": "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/root_guard/.python-setup-decisions.json",
+    "file_blocked": true,
+    "missing_blocked": true,
+    "ok": true,
+    "scope_blocked": true,
+    "seconds": 0.0013,
+    "symlink_blocked": true
+  },
+  "contract_schema_sort": {
+    "entry_count": 3,
+    "keys": [
+      "decision",
+      "files",
+      "justification",
+      "key",
+      "last_seen",
+      "model",
+      "prompt_hash",
+      "rule",
+      "version"
+    ],
+    "ok": true,
+    "order": [
+      [
+        "C0111",
+        "a justification",
+        "fake-backend rev test prompt-v1"
+      ],
+      [
+        "C0111",
+        "b justification",
+        "fake-backend rev test prompt-v1"
+      ],
+      [
+        "W9704",
+        "z justification",
+        "fake-backend rev other prompt-v1"
+      ]
+    ],
+    "seconds": 0.0009
+  },
+  "contract_scoped_stale_mixed": {
+    "files": [
+      "src/a.py",
+      "src/b.py"
+    ],
+    "full_entries": 1,
+    "ok": true,
+    "scoped_entries": 2,
+    "seconds": 0.0531
+  },
+  "contract_tach_placement": {
+    "negative_exit": 1,
+    "negative_output": [],
+    "ok": true,
+    "positive_exit": 0,
+    "seconds": 0.5797
+  },
+  "contract_writer_verdict": {
+    "consumed": "path-free key -> per-entry files; jobs==1 single writer; non-atomic write -> refresh-only atomic replace",
+    "markers": [
+      "Writer identity",
+      "Timing",
+      "scoping",
+      "Sweep implication",
+      "Concurrency",
+      "Crash safety"
+    ],
+    "ok": true,
+    "path": "tests/assumptions/test_pylint_cache_semantics.py",
+    "seconds": 0.0001,
+    "sha256": "795da78900ffba8e5cfa2456d3e261d738660d6c52ec3f8ada2423eab5b0d0cd"
+  },
+  "failed_checks": [],
+  "generated_at_unix": 1794185910,
+  "model_a": "fake-backend rev test prompt-v1",
+  "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+  "proof_1_heuristic_rejected_without_backend": {
+    "backend_calls": 0,
+    "cache_entries": 0,
+    "decision": false,
+    "no_backend_decision": false,
+    "ok": true,
+    "seconds": 0.0252,
+    "source": "heuristic-reject"
+  },
+  "proof_2_accepted_hit_equals_persisted": {
+    "backend_called": false,
+    "hit_decision": false,
+    "ok": true,
+    "persisted": false,
+    "seconds": 0.0198,
+    "source": "cache-hit"
+  },
+  "proof_3_accepted_miss_absent_heuristic_true": {
+    "cache_absent": true,
+    "decision": true,
+    "ok": true,
+    "seconds": 0.0011,
+    "source": "heuristic-accept"
+  },
+  "proof_4_normal_lint_zero_writes_by_hash": {
+    "absent_cache_still_absent": true,
+    "backend_calls": 1,
+    "files_before": [
+      ".python-setup-decisions.json",
+      ".python-setup-decisions.lock",
+      "src"
+    ],
+    "mtime_ns": 1794185910136955476,
+    "ok": true,
+    "seconds": 0.0183,
+    "sha256": "dd5f82803c0cbcd3e93413f24bc7a75e96691e13f27d2deafbed7f5db06a0fcd"
+  },
+  "required_proofs": {
+    "proof_1_heuristic_rejected_without_backend": true,
+    "proof_2_accepted_hit_equals_persisted": true,
+    "proof_3_accepted_miss_absent_heuristic_true": true,
+    "proof_4_normal_lint_zero_writes_by_hash": true
+  },
+  "verdict": "feasible"
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/out/verdict.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/out/verdict.json
new file mode 100644
index 0000000..e899298
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/out/verdict.json
@@ -0,0 +1,273 @@
+{
+  "contract": {
+    "ci_fail": {
+      "evidence": "contract_ci_fail",
+      "exit_code": 2,
+      "variables": [
+        "CI",
+        "GITHUB_ACTIONS"
+      ],
+      "writes_nothing": true
+    },
+    "decisions_path": {
+      "evidence": "contract_decisions_path_test_only",
+      "honored_only_under": "PYTEST_CURRENT_TEST",
+      "production": "ignored; root is config.cwd",
+      "variable": "PYTHON_SETUP_LINT_DECISIONS_PATH"
+    },
+    "encoding": {
+      "bare_hex": "no contiguous run >= 20; groups cap at 8",
+      "collision_safe": "full 256-bit digest; 25000-key probe had zero collisions",
+      "detect_secrets": "clean against .secrets.baseline; full-hex negative control flagged",
+      "evidence": [
+        "contract_encoding_collision",
+        "contract_detect_secrets"
+      ],
+      "scheme": "dk1 + dot-separated lowercase base32 groups of 8 over the full SHA-256 digest"
+    },
+    "files": {
+      "cardinality": "one entry per (justification, rule, model) key",
+      "evidence": "contract_files_union_posix",
+      "format": "sorted unique POSIX relative paths",
+      "merge": "union on refresh"
+    },
+    "jobs": {
+      "evidence": "contract_jobs_guard",
+      "guard": "explicit --jobs and every resolved rcfile; jobs=0 auto-detect and jobs>1 fail loudly",
+      "head_rcfiles": "no explicit jobs override",
+      "required": 1
+    },
+    "memory_time": {
+      "ml_runtime": {
+        "onnxruntime": "absent",
+        "sentence_transformers": "absent",
+        "torch": "absent",
+        "transformers": "absent"
+      },
+      "model_eval_over_2048mb": {
+        "glide": 2845.5859375
+      },
+      "note": "torch/onnxruntime are absent from this dev environment. The sibling model-eval PoC (torch 2.10 CPU + sentence-transformers) measured peak RSS 556-2846 MB: minilm 556 MB, bekko-17m 624 MB, ettin-150m 991 MB, decider-nano 1464 MB, GLiDE 2846 MB. GLiDE exceeds the runner's 2048 MB RLIMIT_AS; decider-nano is close. The model-eval research also notes bekko's upstream ONNX browser model is ~29 MB versus 67 MB safetensors, so an ONNX path is plausible; however ONNX Runtime is expected to avoid torch's import/framework overhead and lower peak RSS only as an unverified hypothesis. I5 must benchmark the chosen model under RLIMIT_AS=2048 in the pylint subprocess and prefer ONNX only if it fits without raising the runner cap.",
+      "rlimit_as_mb": 2048,
+      "three_load_note": "The runner invokes pylint, pylint-pyi and pylint tests as three sequential subprocesses. A model backend is loaded lazily per process, so up to three model loads per lint run unless every suppression is a cache hit. Cache hits avoid model load entirely; refresh should populate the tracked cache before normal lint in CI.",
+      "three_pylint_loads": [
+        {
+          "command": [
+            "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/.venv/bin/python3",
+            "-m",
+            "pylint",
+            "--rcfile=/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/config/.pylintrc",
+            "src/app.py"
+          ],
+          "elapsed_seconds": 1.328,
+          "exit_code": 0,
+          "memory_error": false,
+          "name": "pylint",
+          "peak_rss_mb": 80.08,
+          "rcfile": "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/config/.pylintrc",
+          "stderr_tail": [
+            "\tPage size (bytes): 4096",
+            "\tExit status: 0"
+          ],
+          "stdout_tail": [
+            "    }",
+            "}"
+          ],
+          "target": "src/app.py",
+          "time_reported_seconds": 1.32,
+          "timed_out": false
+        },
+        {
+          "command": [
+            "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/.venv/bin/python3",
+            "-m",
+            "pylint",
+            "--rcfile=/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/config/.pylintrc-pyi",
+            "src/app.pyi"
+          ],
+          "elapsed_seconds": 1.17,
+          "exit_code": 0,
+          "memory_error": false,
+          "name": "pylint-pyi",
+          "peak_rss_mb": 79.67,
+          "rcfile": "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/config/.pylintrc-pyi",
+          "stderr_tail": [
+            "\tPage size (bytes): 4096",
+            "\tExit status: 0"
+          ],
+          "stdout_tail": [
+            "--------------------------------------------------------------------",
+            "Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)"
+          ],
+          "target": "src/app.pyi",
+          "time_reported_seconds": 1.16,
+          "timed_out": false
+        },
+        {
+          "command": [
+            "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/.venv/bin/python3",
+            "-m",
+            "pylint",
+            "--rcfile=/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/config/.pylintrc-tests",
+            "tests/test_app.py"
+          ],
+          "elapsed_seconds": 0.617,
+          "exit_code": 0,
+          "memory_error": false,
+          "name": "pylint tests",
+          "peak_rss_mb": 62.09,
+          "rcfile": "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-cache-design-spike/config/.pylintrc-tests",
+          "stderr_tail": [
+            "\tPage size (bytes): 4096",
+            "\tExit status: 0"
+          ],
+          "stdout_tail": [
+            "    }",
+            "}"
+          ],
+          "target": "tests/test_app.py",
+          "time_reported_seconds": 0.61,
+          "timed_out": false
+        }
+      ]
+    },
+    "path_scoping": {
+      "behavior": "scoped sweep and prune; entries for unscanned files retained; missing unscanned files retained",
+      "evidence": [
+        "contract_path_scoping",
+        "contract_scoped_stale_mixed"
+      ],
+      "stale_mixed_entry": "retained while it has an unscanned share; full refresh prunes it"
+    },
+    "placement": {
+      "decisions_depends_on": [],
+      "edges": [
+        "checkers -> decisions",
+        "runner -> decisions"
+      ],
+      "evidence": "contract_tach_placement",
+      "module": "python_setup_lint/decisions/_decision_cache.py (+ .pyi)",
+      "tach": "legal placement exit 0; decisions -> checkers negative control exit 1"
+    },
+    "project_root": {
+      "evidence": [
+        "contract_root_guard",
+        "contract_checker_root_hint"
+      ],
+      "guard": "resolved cache path must stay within cwd; symlink, parent and absolute escapes rejected",
+      "value": "config.cwd"
+    },
+    "prune": {
+      "automatic_on_refresh": true,
+      "evidence": "contract_prune",
+      "missing_files": true,
+      "no_prune_flag": true,
+      "stale_model": true,
+      "stale_prompt_hash": true
+    },
+    "refresh": {
+      "atomic_replace": true,
+      "evidence": [
+        "contract_determinism",
+        "contract_atomic_failure",
+        "contract_refresh_mode_env"
+      ],
+      "invocation": "lint --refresh-decisions [--path ...]",
+      "lock": "fcntl.flock on .python-setup-decisions.lock",
+      "merge": "load + union files + prune + atomic replace",
+      "writer": "checker call path in refresh mode only"
+    },
+    "schema": {
+      "entry_fields": [
+        "decision",
+        "files",
+        "justification",
+        "key",
+        "last_seen",
+        "model",
+        "prompt_hash",
+        "rule",
+        "version"
+      ],
+      "evidence": "contract_schema_sort",
+      "indent": 2,
+      "sort_key": [
+        "rule",
+        "justification",
+        "model"
+      ],
+      "sort_keys": true,
+      "top_level": "JSON array",
+      "trailing_newline": true
+    }
+  },
+  "evidence_files": {
+    "memory_time": "out/memory_time.json",
+    "proofs": "out/proofs.json",
+    "report": "README.md"
+  },
+  "recommendations": [
+    "Implement the cache in the new decisions module with the ADR-018 tach edges; keep _decision_backend.py in checkers.",
+    "Thread RunnerConfig.refresh_decisions and the --refresh-decisions flag; fail before writes under CI/GITHUB_ACTIONS and when effective pylint jobs != 1.",
+    "Use the checker call path as the refresh writer, gated by an internal refresh env flag; normal lint must only read the tracked cache.",
+    "Serialize with dotted base32, full SHA-256, sort_keys/indent=2, and a runtime no-bare-hex guard; redact long hex runs in justifications and fail loudly on hex file paths.",
+    "Rewrite tests/assumptions/test_pylint_cache_semantics.py deliberately for the tracked schema; add tmp round-trip, zero-write hash, double-run determinism, prune, scoping, CI/jobs/isolation and secrets tests.",
+    "Add .python-setup-decisions.lock to ignore rules or document it; provide a non-POSIX lock fallback.",
+    "In I5, benchmark the chosen model under RLIMIT_AS=2048 in the pylint subprocess (ONNX vs torch) before shipping a backend; GLiDE's 2846 MB torch peak exceeds the runner cap."
+  ],
+  "required_proofs": {
+    "proof_1_heuristic_rejected_without_backend": {
+      "backend_calls": 0,
+      "cache_entries": 0,
+      "decision": false,
+      "no_backend_decision": false,
+      "ok": true,
+      "seconds": 0.0252,
+      "source": "heuristic-reject"
+    },
+    "proof_2_accepted_hit_equals_persisted": {
+      "backend_called": false,
+      "hit_decision": false,
+      "ok": true,
+      "persisted": false,
+      "seconds": 0.0198,
+      "source": "cache-hit"
+    },
+    "proof_3_accepted_miss_absent_heuristic_true": {
+      "cache_absent": true,
+      "decision": true,
+      "ok": true,
+      "seconds": 0.0011,
+      "source": "heuristic-accept"
+    },
+    "proof_4_normal_lint_zero_writes_by_hash": {
+      "absent_cache_still_absent": true,
+      "backend_calls": 1,
+      "files_before": [
+        ".python-setup-decisions.json",
+        ".python-setup-decisions.lock",
+        "src"
+      ],
+      "mtime_ns": 1794185910136955476,
+      "ok": true,
+      "seconds": 0.0183,
+      "sha256": "dd5f82803c0cbcd3e93413f24bc7a75e96691e13f27d2deafbed7f5db06a0fcd"
+    }
+  },
+  "verdict": "feasible",
+  "writer_verdict": {
+    "consumed": "path-free key -> per-entry files; jobs==1 single writer; non-atomic write -> refresh-only atomic replace",
+    "markers": [
+      "Writer identity",
+      "Timing",
+      "scoping",
+      "Sweep implication",
+      "Concurrency",
+      "Crash safety"
+    ],
+    "ok": true,
+    "path": "tests/assumptions/test_pylint_cache_semantics.py",
+    "seconds": 0.0001,
+    "sha256": "795da78900ffba8e5cfa2456d3e261d738660d6c52ec3f8ada2423eab5b0d0cd"
+  }
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/refresh_cli.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/refresh_cli.py
new file mode 100644
index 0000000..ed40e81
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/refresh_cli.py
@@ -0,0 +1,390 @@
+"""Prototype of ``lint --refresh-decisions [--path ...]`` (PoC only).
+
+The prototype threads the ADR-017 refresh contract without modifying the
+production runner:
+
+* CI/GITHUB_ACTIONS -> exit non-zero before any write;
+* effective pylint ``jobs`` must be 1 (explicit flag + every resolved rcfile);
+* ``--path`` narrows both the sweep and the prune scope;
+* each of the three pylint passes (``pylint``, ``pylint-pyi``,
+  ``pylint tests``) merges sequentially through the same lock/atomic writer;
+* ``PYTHON_SETUP_LINT_DECISIONS_PATH`` is honored only under
+  ``PYTEST_CURRENT_TEST`` (handled by :func:`decision_cache.resolve_cache_path`).
+"""
+
+from __future__ import annotations
+
+import argparse
+import configparser
+import hashlib
+import os
+import re
+import sys
+from collections.abc import Iterable, Mapping, Sequence
+from pathlib import Path
+
+from decision_cache import (
+    ENV_DECISIONS_PATH,
+    ENV_REFRESH,
+    ENV_ROOT,
+    CacheEntry,
+    Observation,
+    build_model_id,
+    load_entries,
+    normalize_rule,
+    paths_in_scope,
+    prompt_hash,
+    refresh,
+    resolve_cache_path,
+    utc_today,
+)
+from decision_pipeline import DecisionBackend, DecisionResult, FakeBackend, decide
+
+CI_ENV_VARS = ("CI", "GITHUB_ACTIONS")
+
+_JUSTIFICATION_RE = re.compile(r"^\s*#\s*justification:\s*(?P<text>.+?)\s*$")
+_SUPPRESSION_RE = re.compile(
+    r"#\s*(?:pylint:\s*disable=(?P<pylint>[A-Za-z0-9_,\s]+)|noqa(?::\s*(?P<noqa>[A-Za-z0-9_,\s]+))?|type:\s*ignore\[(?P<mypy>[A-Za-z0-9_,\s]+)\])"
+)
+
+
+class RefreshError(RuntimeError):
+    """Refresh guard failed before any cache write."""
+
+
+def ci_guard(environ: Mapping[str, str]) -> None:
+    """Refuse refresh under CI, mirroring the golden UPDATE_ENV guard.
+
+    Args:
+        environ: Process environment.
+
+    Raises:
+        RefreshError: A CI variable is set.
+    """
+    hit = next((name for name in CI_ENV_VARS if environ.get(name)), None)
+    if hit is not None:
+        raise RefreshError(f"refusing to refresh decisions under CI ({hit} is set)")
+
+
+def parse_jobs_overrides(rcfile: Path) -> list[tuple[str, int]]:
+    """Read explicit ``jobs`` overrides from a pylint rcfile.
+
+    Args:
+        rcfile: Candidate rcfile.
+
+    Returns:
+        ``(section, jobs)`` pairs for every explicit override.
+    """
+    parser = configparser.ConfigParser()
+    try:
+        parser.read(rcfile, encoding="utf-8")
+    except (OSError, configparser.Error):
+        return []
+    overrides: list[tuple[str, int]] = []
+    for section in parser.sections():
+        if parser.has_option(section, "jobs"):
+            try:
+                overrides.append((section, parser.getint(section, "jobs")))
+            except ValueError:
+                overrides.append((section, -1))
+    return overrides
+
+
+def jobs_guard(*, jobs_flag: int, rcfiles: Iterable[Path]) -> list[str]:
+    """Require effective pylint jobs == 1.
+
+    Args:
+        jobs_flag: Explicit ``--jobs`` value used by the refresh invocation.
+        rcfiles: Every rcfile that can affect the three pylint passes.
+
+    Returns:
+        Human-readable checks that passed.
+
+    Raises:
+        RefreshError: Any override or explicit flag is not exactly 1.
+    """
+    if jobs_flag != 1:
+        raise RefreshError(f"refresh requires pylint jobs==1, got --jobs={jobs_flag}")
+    checked: list[str] = []
+    for rcfile in rcfiles:
+        overrides = parse_jobs_overrides(rcfile)
+        bad = [(section, value) for section, value in overrides if value != 1]
+        if bad:
+            raise RefreshError(f"refresh requires pylint jobs==1; {rcfile} sets {bad}")
+        checked.append(f"{rcfile}: jobs=1" if not overrides else f"{rcfile}: explicit jobs=1")
+    return checked
+
+
+def checker_environment(*, cwd: Path, decisions_path: Path | None = None) -> dict[str, str]:
+    """Build the env the runner passes to each pylint subprocess during refresh.
+
+    Args:
+        cwd: Linted project root.
+        decisions_path: Test-only override, when applicable.
+
+    Returns:
+        Environment additions for the checker call path.
+    """
+    env = {ENV_REFRESH: "1", ENV_ROOT: str(Path(cwd).resolve())}
+    if decisions_path is not None:
+        env[ENV_DECISIONS_PATH] = str(decisions_path)
+    return env
+
+
+def is_refresh_mode(environ: Mapping[str, str]) -> bool:
+    """Return whether the checker call path is running under refresh.
+
+    Args:
+        environ: Environment passed to the checker subprocess.
+
+    Returns:
+        True when the runner asked this lint pass to write decisions.
+    """
+    return environ.get(ENV_REFRESH) == "1"
+
+
+def _suppressions(path: Path) -> list[tuple[str, str]]:
+    """Extract ``(rule, justification)`` pairs from a fixture file.
+
+    The production checker's astroid-based comment extraction is not the
+    subject of this spike; fixtures use an explicit preceding
+    ``# justification:`` line so the cache/refresh contract is isolated.
+
+    Args:
+        path: Python fixture file.
+
+    Returns:
+        Pairs in source order.
+    """
+    pairs: list[tuple[str, str]] = []
+    pending: str | None = None
+    for line in path.read_text(encoding="utf-8").splitlines():
+        justification_match = _JUSTIFICATION_RE.match(line)
+        if justification_match:
+            pending = justification_match.group("text")
+            continue
+        suppression_match = _SUPPRESSION_RE.search(line)
+        if suppression_match and pending is not None:
+            raw_rule = (
+                suppression_match.group("pylint")
+                or suppression_match.group("noqa")
+                or suppression_match.group("mypy")
+                or ""
+            )
+            pairs.append((normalize_rule(raw_rule or "unknown"), pending))
+            pending = None
+    return pairs
+
+
+def collect_observations(
+    cwd: Path,
+    files: Iterable[str],
+    *,
+    model: str,
+    current_prompt_hash: str,
+    backend: DecisionBackend | None,
+    entries: list[CacheEntry],
+) -> list[Observation]:
+    """Run the prototype decision path over every scoped suppression.
+
+    Args:
+        cwd: Project root.
+        files: POSIX relative files selected by this pass.
+        model: Current model string.
+        current_prompt_hash: Current prompt fingerprint.
+        backend: Backend or ``None``.
+        entries: Current cache entries (hits are not re-observed).
+
+    Returns:
+        Observations for cache misses in refresh mode.
+    """
+    observations: list[Observation] = []
+    for file in files:
+        full_path = cwd / file
+        for rule, justification in _suppressions(full_path):
+            result = decide(
+                justification,
+                rule=rule,
+                code_context=justification,
+                file=file,
+                model=model,
+                current_prompt_hash=current_prompt_hash,
+                entries=entries,
+                backend=backend,
+                refresh_mode=True,
+            )
+            if result.observation is not None:
+                observations.append(result.observation)
+    return observations
+
+
+def _pass_files(all_files: set[str], pass_name: str) -> set[str]:
+    src_py = {file for file in all_files if file.startswith("src/") and file.endswith(".py") and not file.endswith(".pyi")}
+    pyi = {file for file in all_files if file.endswith(".pyi")}
+    tests_py = {file for file in all_files if file.startswith("tests/") and file.endswith(".py")}
+    return {"pylint": src_py, "pylint-pyi": pyi, "pylint tests": tests_py}[pass_name]
+
+
+def run_refresh(
+    *,
+    cwd: Path,
+    path: str | None,
+    model: str,
+    current_prompt_hash: str,
+    last_seen: str,
+    jobs_flag: int,
+    rcfiles: Sequence[Path],
+    backend: DecisionBackend | None,
+    environ: Mapping[str, str] | None = None,
+) -> Path:
+    """Execute one explicit refresh over the three sequential pylint passes.
+
+    Args:
+        cwd: Linted project root.
+        path: Optional ``--path`` scope.
+        model: Current model string.
+        current_prompt_hash: Current prompt fingerprint.
+        last_seen: Deterministic date stamp.
+        jobs_flag: Explicit jobs value for the refresh invocation.
+        rcfiles: Resolved pylint rcfiles.
+        backend: Backend used for cache misses.
+        environ: Environment override for tests.
+
+    Returns:
+        Cache path written by the refresh.
+
+    Raises:
+        RefreshError: CI or jobs guard failed.
+    """
+    env = dict(os.environ if environ is None else environ)
+    ci_guard(env)
+    jobs_guard(jobs_flag=jobs_flag, rcfiles=rcfiles)
+    root = Path(cwd).resolve()
+    all_files = paths_in_scope(root, path)
+    cache_path = resolve_cache_path(root, environ=env)
+    for pass_name in ("pylint", "pylint-pyi", "pylint tests"):
+        entries = load_entries(cache_path, strict=True)
+        observations = collect_observations(
+            root,
+            sorted(_pass_files(all_files, pass_name)),
+            model=model,
+            current_prompt_hash=current_prompt_hash,
+            backend=backend,
+            entries=entries,
+        )
+        refresh(
+            cwd=root,
+            observed=observations,
+            current_model=model,
+            current_prompt_hash=current_prompt_hash,
+            last_seen=last_seen,
+            path=path,
+            environ=env,
+        )
+    return cache_path
+
+
+def run_normal_lint(
+    *,
+    cwd: Path,
+    path: str | None,
+    model: str,
+    current_prompt_hash: str,
+    backend: DecisionBackend | None,
+    environ: Mapping[str, str] | None = None,
+) -> list[DecisionResult]:
+    """Simulate the read-only normal lint path (never writes the cache).
+
+    Args:
+        cwd: Project root.
+        path: Optional ``--path`` scope.
+        model: Current model string.
+        current_prompt_hash: Current prompt fingerprint.
+        backend: Backend or ``None``.
+        environ: Environment override for tests.
+
+    Returns:
+        Decision results in source order.
+    """
+    env = dict(os.environ if environ is None else environ)
+    root = Path(cwd).resolve()
+    entries = load_entries(resolve_cache_path(root, environ=env))
+    results: list[DecisionResult] = []
+    for file in sorted(paths_in_scope(root, path)):
+        for rule, justification in _suppressions(root / file):
+            results.append(
+                decide(
+                    justification,
+                    rule=rule,
+                    code_context=justification,
+                    file=file,
+                    model=model,
+                    current_prompt_hash=current_prompt_hash,
+                    entries=entries,
+                    backend=backend,
+                    refresh_mode=False,
+                )
+            )
+    return results
+
+
+def _default_rcfiles(cwd: Path) -> list[Path]:
+    candidates = [cwd / "config" / f".pylintrc{suffix}" for suffix in ("", "-pyi", "-tests")]
+    return [candidate for candidate in candidates if candidate.is_file()]
+
+
+def build_parser() -> argparse.ArgumentParser:
+    """Build the prototype CLI parser.
+
+    Returns:
+        Parser with the pinned refresh flags.
+    """
+    parser = argparse.ArgumentParser(description="Prototype lint --refresh-decisions")
+    parser.add_argument("--refresh-decisions", action="store_true")
+    parser.add_argument("--path")
+    parser.add_argument("--cwd", default=".")
+    parser.add_argument("--model-id", default="fake-backend")
+    parser.add_argument("--revision", default="test")
+    parser.add_argument("--now", default=utc_today())
+    parser.add_argument("--jobs", type=int, default=1)
+    parser.add_argument("--score", type=float, default=1.0)
+    return parser
+
+
+def main(argv: Sequence[str] | None = None) -> int:
+    """Run the prototype CLI.
+
+    Args:
+        argv: Argument list (tests may pass one).
+
+    Returns:
+        Exit code.
+    """
+    args = build_parser().parse_args(argv)
+    if not args.refresh_decisions:
+        print("prototype: normal lint path is read-only; nothing written", file=sys.stderr)
+        return 0
+
+    cwd = Path(args.cwd).resolve()
+    model = build_model_id(args.model_id, args.revision)
+    try:
+        cache_path = run_refresh(
+            cwd=cwd,
+            path=args.path,
+            model=model,
+            current_prompt_hash=prompt_hash(),
+            last_seen=args.now,
+            jobs_flag=args.jobs,
+            rcfiles=_default_rcfiles(cwd),
+            backend=FakeBackend(score=args.score),
+        )
+    except Exception as exc:  # noqa: BLE001 - CLI boundary
+        print(f"refresh-decisions failed: {exc}", file=sys.stderr)
+        return 2
+    digest = hashlib.sha256(cache_path.read_bytes()).hexdigest()[:16]
+    print(f"refreshed {cache_path} sha256={digest}")
+    return 0
+
+
+if __name__ == "__main__":
+    raise SystemExit(main())
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/run_proofs.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/run_proofs.py
new file mode 100644
index 0000000..84f9ca9
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/run_proofs.py
@@ -0,0 +1,1195 @@
+"""Execute the decision-cache PoC proofs and contract checks on tmp copies.
+
+Run with::
+
+    uv run python .factory/tasks/modernize/items/decision-cache-design-spike/poc/run_proofs.py
+
+Every fixture lives under ``poc/tmp/`` and is recreated from scratch.  The
+script writes ``poc/out/proofs.json`` and exits non-zero if any check fails.
+"""
+
+from __future__ import annotations
+
+import base64
+import json
+import os
+import re
+import shutil
+import subprocess
+import sys
+import time
+from collections.abc import Callable
+from pathlib import Path
+from typing import Any
+
+from detect_secrets.core.scan import scan_file
+from detect_secrets.settings import transient_settings
+
+from decision_cache import (
+    CACHE_FILENAME,
+    DECISION_THRESHOLD,
+    LOCK_FILENAME,
+    ENV_DECISIONS_PATH,
+    ENV_PYTEST,
+    SCHEMA_VERSION,
+    CacheEntry,
+    CachePathError,
+    RefreshLockError,
+    build_model_id,
+    checker_cache_path,
+    derive_key,
+    dump_entries,
+    encode_digest,
+    load_entries,
+    merge_refresh,
+    paths_in_scope,
+    prompt_hash,
+    refresh,
+    resolve_cache_path,
+    sanitize_tracked_text,
+    source_relpath,
+)
+from decision_pipeline import FakeBackend, NoBackend, decide, heuristic_accepts
+from refresh_cli import (
+    RefreshError,
+    ci_guard,
+    is_refresh_mode,
+    jobs_guard,
+    parse_jobs_overrides,
+    run_normal_lint,
+    run_refresh,
+)
+
+POC = Path(__file__).resolve().parent
+REPO_ROOT = Path(__file__).resolve().parents[6]
+TMP = POC / "tmp" / "proofs"
+OUT = POC / "out"
+BASELINE = REPO_ROOT / ".secrets.baseline"
+MODEL_A = build_model_id("fake-backend", "test")
+MODEL_B = build_model_id("fake-backend", "other")
+PROMPT_HASH = prompt_hash()
+NOW = "2026-11-08"
+
+Results = dict[str, Any]
+
+
+class ProofFailure(AssertionError):
+    """A proof expectation failed."""
+
+
+def expect(condition: object, message: str) -> None:
+    """Raise :class:`ProofFailure` when *condition* is falsy."""
+    if not condition:
+        raise ProofFailure(message)
+
+
+def run_check(results: Results, name: str, function: Callable[[], dict[str, Any]]) -> None:
+    """Run one check and record pass/failure."""
+    started = time.perf_counter()
+    try:
+        detail = function()
+        results[name] = {"ok": True, "seconds": round(time.perf_counter() - started, 4), **detail}
+    except Exception as exc:  # noqa: BLE001 - proof harness records failures
+        results[name] = {
+            "ok": False,
+            "seconds": round(time.perf_counter() - started, 4),
+            "error": f"{type(exc).__name__}: {exc}",
+        }
+
+
+def fixture_file(root: Path, relative: str, justification: str, *, rule: str = "W9704", kind: str = "pylint") -> Path:
+    """Write a Python fixture with a recognizable suppression.
+
+    Args:
+        root: Fixture project root.
+        relative: POSIX relative file path.
+        justification: Preceding ``# justification:`` text.
+        rule: Suppression code.
+        kind: ``pylint``, ``noqa`` or ``mypy``.
+
+    Returns:
+        The written path.
+    """
+    path = root / relative
+    path.parent.mkdir(parents=True, exist_ok=True)
+    directive = {
+        "pylint": f"# pylint: disable={rule}",
+        "noqa": f"# noqa: {rule}",
+        "mypy": f"# type: ignore[{rule}]",
+    }[kind]
+    path.write_text(f"# justification: {justification}\nvalue = load()  {directive}\n", encoding="utf-8")
+    return path
+
+
+def make_project(name: str, files: dict[str, tuple[str, str]]) -> Path:
+    """Create a fixture project.
+
+    Args:
+        name: Directory name under ``poc/tmp/proofs``.
+        files: Map relative path to ``(justification, kind)``.
+
+    Returns:
+        Project root.
+    """
+    root = TMP / name
+    shutil.rmtree(root, ignore_errors=True)
+    root.mkdir(parents=True)
+    for relative, (justification, kind) in files.items():
+        fixture_file(root, relative, justification, kind=kind)
+    return root
+
+
+def _sha(path: Path) -> str:
+    return __import__("hashlib").sha256(path.read_bytes()).hexdigest()
+
+
+def _mtime(path: Path) -> int:
+    return path.stat().st_mtime_ns
+
+
+def _entry(justification: str, rule: str, model: str, decision: bool, files: tuple[str, ...]) -> CacheEntry:
+    return CacheEntry(
+        key=derive_key(justification, rule, model),
+        justification=sanitize_tracked_text(justification),
+        rule=rule,
+        model=model,
+        decision=decision,
+        files=files,
+        version=SCHEMA_VERSION,
+        prompt_hash=PROMPT_HASH,
+        last_seen=NOW,
+    )
+
+
+# --------------------------------------------------------------------------- #
+# Required four proofs
+# --------------------------------------------------------------------------- #
+def proof_1_heuristic_rejected_without_backend() -> dict[str, Any]:
+    """Heuristic-rejected justification is False with no backend/cache contact."""
+    root = make_project("proof1", {"src/app.py": ("fix this", "pylint")})
+    backend = FakeBackend(score=1.0)
+    entries: list[CacheEntry] = []
+    result = decide(
+        "fix this",
+        rule="W9704",
+        code_context="value = load()",
+        file="src/app.py",
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        entries=entries,
+        backend=backend,
+        refresh_mode=True,
+    )
+    expect(result.decision is False, "heuristic-rejected justification must be False")
+    expect(result.source == "heuristic-reject", f"unexpected source: {result.source}")
+    expect(result.backend_called is False, "backend must not be called")
+    expect(result.observation is None, "refreshed heuristic reject must not be recorded")
+    expect(backend.calls == [], "FakeBackend must stay untouched")
+    expect(not heuristic_accepts("fix this", rule="W9704"), "fixture must be heuristic-rejected")
+
+    no_backend = decide(
+        "fix this",
+        rule="W9704",
+        code_context="value = load()",
+        file="src/app.py",
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        entries=[],
+        backend=None,
+        refresh_mode=True,
+    )
+    expect(no_backend.decision is False, "heuristic-rejected must be False with no backend")
+    expect(no_backend.backend_called is False, "no-backend reject must not call a model")
+
+    cache_path = run_refresh(
+        cwd=root,
+        path=None,
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen=NOW,
+        jobs_flag=1,
+        rcfiles=[],
+        backend=FakeBackend(score=1.0),
+        environ={},
+    )
+    expect(load_entries(cache_path, strict=True) == [], "rejected justification must not create an entry")
+    return {
+        "decision": result.decision,
+        "no_backend_decision": no_backend.decision,
+        "source": result.source,
+        "backend_calls": 0,
+        "cache_entries": 0,
+    }
+
+
+def proof_2_accepted_hit_equals_persisted() -> dict[str, Any]:
+    """A cache hit returns the persisted verdict even when the backend disagrees."""
+    root = make_project("proof2", {"src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint")})
+    cache_path = run_refresh(
+        cwd=root,
+        path=None,
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen=NOW,
+        jobs_flag=1,
+        rcfiles=[],
+        backend=FakeBackend(score=0.0),
+        environ={},
+    )
+    entries = load_entries(cache_path, strict=True)
+    expect(len(entries) == 1, f"expected one persisted entry, got {len(entries)}")
+    persisted = entries[0]
+    expect(persisted.decision is False, "backend score 0.0 must persist False")
+    expect(heuristic_accepts(persisted.justification, rule="W9704"), "fixture must be heuristic-accepted")
+
+    backend = FakeBackend(score=1.0)
+    result = decide(
+        persisted.justification,
+        rule="W9704",
+        code_context="value = load()",
+        file="src/app.py",
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        entries=entries,
+        backend=backend,
+        refresh_mode=False,
+    )
+    expect(result.source == "cache-hit", f"expected cache-hit, got {result.source}")
+    expect(result.decision is persisted.decision, "hit must equal the persisted verdict")
+    expect(result.backend_called is False, "hit must not call the backend")
+    expect(backend.calls == [], "backend must stay untouched on a hit")
+
+    no_backend = decide(
+        persisted.justification,
+        rule="W9704",
+        code_context="value = load()",
+        file="src/app.py",
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        entries=entries,
+        backend=NoBackend(),
+        refresh_mode=False,
+    )
+    expect(no_backend.decision is False, "hit must return persisted False even with no model")
+    return {
+        "persisted": persisted.decision,
+        "hit_decision": result.decision,
+        "backend_called": result.backend_called,
+        "source": result.source,
+    }
+
+
+def proof_3_accepted_miss_absent_heuristic_true() -> dict[str, Any]:
+    """Heuristic-accepted + cache miss + absent backend yields heuristic True."""
+    root = make_project("proof3", {"src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint")})
+    cache_path = resolve_cache_path(root)
+    expect(not cache_path.exists(), "cache must start absent")
+    result = decide(
+        "retry loop must not swallow keyboard interrupt",
+        rule="W9704",
+        code_context="value = load()",
+        file="src/app.py",
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        entries=[],
+        backend=None,
+        refresh_mode=False,
+    )
+    expect(result.decision is True, "heuristic-accepted miss with no model must be True")
+    expect(result.source == "heuristic-accept", f"unexpected source: {result.source}")
+    expect(result.backend_called is False, "no backend means no model call")
+
+    normal_results = run_normal_lint(
+        cwd=root,
+        path=None,
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        backend=None,
+        environ={},
+    )
+    expect(len(normal_results) == 1, "one suppression expected")
+    expect(normal_results[0].decision is True, "normal lint must return heuristic True")
+    expect(not cache_path.exists(), "normal lint must not create the cache file")
+    return {"decision": result.decision, "source": result.source, "cache_absent": True}
+
+
+def proof_4_normal_lint_zero_writes_by_hash() -> dict[str, Any]:
+    """Normal lint never mutates the tracked cache (hash + mtime + file set)."""
+    root = make_project(
+        "proof4",
+        {
+            "src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint"),
+            "src/other.py": ("fix this", "pylint"),
+        },
+    )
+    cache_path = run_refresh(
+        cwd=root,
+        path=None,
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen=NOW,
+        jobs_flag=1,
+        rcfiles=[],
+        backend=FakeBackend(score=1.0),
+        environ={},
+    )
+    before_hash, before_mtime = _sha(cache_path), _mtime(cache_path)
+    before_files = sorted(path.name for path in root.iterdir())
+
+    # Include a cache miss that calls the backend: no-write must hold even then.
+    backend = FakeBackend(score=0.0)
+    results = run_normal_lint(
+        cwd=root,
+        path=None,
+        model=MODEL_B,  # different model -> every entry is a miss
+        current_prompt_hash=PROMPT_HASH,
+        backend=backend,
+        environ={},
+    )
+    expect(len(results) == 2, f"expected two lint results, got {len(results)}")
+    expect(any(call for call in backend.calls), "backend must be called on misses")
+    expect(_sha(cache_path) == before_hash, "cache bytes changed during normal lint")
+    expect(_mtime(cache_path) == before_mtime, "cache mtime changed during normal lint")
+    expect(sorted(path.name for path in root.iterdir()) == before_files, "normal lint created an artifact")
+
+    # Absent cache must stay absent even when the backend computes a verdict.
+    absent_root = make_project("proof4_absent", {"src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint")})
+    absent_path = resolve_cache_path(absent_root)
+    run_normal_lint(
+        cwd=absent_root,
+        path=None,
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        backend=FakeBackend(score=1.0),
+        environ={},
+    )
+    expect(not absent_path.exists(), "normal lint created a cache file on an absent cache")
+    return {
+        "sha256": before_hash,
+        "mtime_ns": before_mtime,
+        "files_before": before_files,
+        "backend_calls": len(backend.calls),
+        "absent_cache_still_absent": True,
+    }
+
+
+# --------------------------------------------------------------------------- #
+# ADR-017 contract checks
+# --------------------------------------------------------------------------- #
+def check_root_guard() -> dict[str, Any]:
+    """Project root = cwd, with parent/symlink escape rejected."""
+    root = TMP / "root_guard"
+    shutil.rmtree(root, ignore_errors=True)
+    root.mkdir(parents=True)
+    normal = resolve_cache_path(root)
+    expect(normal == (root / CACHE_FILENAME).resolve(), "cache must live at the project root")
+    expect(normal.parent == root.resolve(), "cache parent must be config.cwd")
+
+    outside = TMP / "root_guard_outside"
+    shutil.rmtree(outside, ignore_errors=True)
+    outside.mkdir(parents=True)
+    (root / CACHE_FILENAME).symlink_to(outside / "escaped.json")
+    try:
+        resolve_cache_path(root)
+    except CachePathError:
+        symlink_blocked = True
+    else:
+        raise ProofFailure("symlink escape was not rejected")
+    (root / CACHE_FILENAME).unlink()
+
+    try:
+        paths_in_scope(root, "../outside")
+    except CachePathError:
+        scope_blocked = True
+    else:
+        raise ProofFailure("--path parent escape was not rejected")
+    try:
+        source_relpath(root, outside / "x.py")
+    except CachePathError:
+        file_blocked = True
+    else:
+        raise ProofFailure("outside linted file was not rejected")
+    try:
+        paths_in_scope(root, "does-not-exist")
+    except CachePathError:
+        missing_blocked = True
+    else:
+        raise ProofFailure("missing --path was not rejected")
+    return {
+        "cache": str(normal),
+        "symlink_blocked": symlink_blocked,
+        "scope_blocked": scope_blocked,
+        "file_blocked": file_blocked,
+        "missing_blocked": missing_blocked,
+    }
+
+
+def check_checker_root_hint() -> dict[str, Any]:
+    """A mismatched root hint cannot redirect the checker's cache path."""
+    root = TMP / "root_hint"
+    shutil.rmtree(root, ignore_errors=True)
+    root.mkdir(parents=True)
+    matching = checker_cache_path(cwd=root, environ={"PYTHON_SETUP_LINT_DECISIONS_ROOT": str(root)})
+    expect(matching == (root / CACHE_FILENAME).resolve(), "matching root hint changed the path")
+    try:
+        checker_cache_path(cwd=root, environ={"PYTHON_SETUP_LINT_DECISIONS_ROOT": str(TMP / "elsewhere")})
+    except CachePathError:
+        blocked = True
+    else:
+        blocked = False
+    expect(blocked, "mismatched root hint was accepted")
+    return {"matching": True, "mismatched_blocked": True}
+
+
+def check_decisions_path_test_only() -> dict[str, Any]:
+    """DECISIONS_PATH is ignored outside pytest and honored under pytest."""
+    root = TMP / "isolation"
+    shutil.rmtree(root, ignore_errors=True)
+    root.mkdir(parents=True)
+    override = TMP / "isolation_override" / "cache.json"
+    shutil.rmtree(override.parent, ignore_errors=True)
+    production_env = {ENV_DECISIONS_PATH: str(override)}
+    test_env = {ENV_DECISIONS_PATH: str(override), ENV_PYTEST: "tests/test_x.py::test_y"}
+
+    production_path = resolve_cache_path(root, environ=production_env)
+    expect(production_path == (root / CACHE_FILENAME).resolve(), "production must ignore DECISIONS_PATH")
+    test_path = resolve_cache_path(root, environ=test_env)
+    expect(test_path == override.resolve(), "pytest must honor DECISIONS_PATH")
+
+    backend = FakeBackend(score=1.0)
+    fixture_file(root, "src/app.py", "retry loop must not swallow keyboard interrupt")
+    written = run_refresh(
+        cwd=root,
+        path=None,
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen=NOW,
+        jobs_flag=1,
+        rcfiles=[],
+        backend=backend,
+        environ=test_env,
+    )
+    expect(written == override.resolve(), "refresh must write the test-only override")
+    expect(not (root / CACHE_FILENAME).exists(), "cwd cache must remain absent under test override")
+    return {"production_ignored": True, "pytest_honored": True, "written": str(written)}
+
+
+def check_schema_sort() -> dict[str, Any]:
+    """Array sorted by (rule, justification, model), indent=2, sort_keys, round-trip."""
+    entries = [
+        _entry("z justification", "W9704", MODEL_B, True, ("src/z.py",)),
+        _entry("b justification", "C0111", MODEL_A, False, ("src/b.py",)),
+        _entry("a justification", "C0111", MODEL_A, True, ("src/a.py",)),
+    ]
+    rendered = dump_entries(entries)
+    parsed = json.loads(rendered)
+    expect(isinstance(parsed, list), "tracked cache must be a JSON array")
+    order = [(item["rule"], item["justification"], item["model"]) for item in parsed]
+    expect(order == sorted(order), f"entries not sorted by (rule, justification, model): {order}")
+    expect(rendered.startswith('[\n  {\n    "decision"'), "indent=2 object rendering expected")
+    expect('"decision"' in rendered and rendered.index('"decision"') < rendered.index('"files"'), "sort_keys not applied")
+    expect(rendered.endswith("\n"), "trailing newline expected")
+    path = TMP / "schema" / CACHE_FILENAME
+    path.parent.mkdir(parents=True, exist_ok=True)
+    path.write_text(rendered, encoding="utf-8")
+    expect(load_entries(path, strict=True) == sorted(entries, key=lambda e: (e.rule, e.justification, e.model)), "round-trip mismatch")
+    first_object = rendered.split("}")[0]
+    keys = re.findall(r'^    "([a-z_]+)":', first_object, flags=re.MULTILINE)
+    expect(keys == sorted(keys), f"object keys must be sorted, got {keys}")
+    return {"entry_count": len(parsed), "order": order, "keys": keys}
+
+
+def check_encoding_collision() -> dict[str, Any]:
+    """Key encoding is non-hex, full-SHA-256, collision-safe and secrets-clean."""
+    digest = __import__("hashlib").sha256(b"key material").digest()
+    encoded = encode_digest(digest)
+    payload = "".join(encoded.split(".")[1:]).upper()
+    decoded = base64.b32decode(payload + "=" * (-len(payload) % 8))
+    expect(decoded == digest, "encoding must preserve all 256 bits")
+    expect(not re.search(r"[0-9a-fA-F]{20,}", encoded), "key contains a bare hex run >= 20")
+    expect(not re.fullmatch(r"[0-9a-fA-F]+", encoded), "key must not be hex")
+
+    keys = {derive_key(f"justification {index}", "W9704", MODEL_A) for index in range(25_000)}
+    expect(len(keys) == 25_000, "key collision detected in 25k-symbol probe")
+
+    pathological = "see commit " + "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678" + " for the retry rationale"
+    sanitized = sanitize_tracked_text(pathological)
+    expect("<hex:40>" in sanitized, "long hex justification was not redacted")
+    entry = _entry(pathological, "W9704", MODEL_A, True, ("src/app.py",))
+    rendered = dump_entries([entry])
+    expect(not re.search(r"(?<![0-9a-fA-F])[0-9a-fA-F]{20,}(?![0-9a-fA-F])", rendered), "serialized cache has bare hex")
+    expect(entry.key == derive_key(pathological, "W9704", MODEL_A), "key must derive from unredacted text")
+    return {"encoded_length": len(encoded), "unique_keys": len(keys), "redacted": sanitized}
+
+
+def check_detect_secrets() -> dict[str, Any]:
+    """The generated cache passes the repository's own detect-secrets config."""
+    root = TMP / "secrets"
+    shutil.rmtree(root, ignore_errors=True)
+    root.mkdir(parents=True)
+    fixture_file(root, "src/app.py", "retry loop must not swallow keyboard interrupt")
+    fixture_file(root, "src/other.py", "see commit " + "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678" + " for rationale")
+    cache_path = run_refresh(
+        cwd=root,
+        path=None,
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen=NOW,
+        jobs_flag=1,
+        rcfiles=[],
+        backend=FakeBackend(score=1.0),
+        environ={},
+    )
+    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
+    bad_copy = cache_path.with_name("negative_control.json")
+    bad_entries = json.loads(cache_path.read_text(encoding="utf-8"))
+    bad_entries[0]["prompt_hash"] = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"
+    bad_copy.write_text(json.dumps(bad_entries, indent=2, sort_keys=True) + "\n", encoding="utf-8")
+    real_model = build_model_id("jina-reranker-v2-base-multilingual", "b886a1f9b91f4e8368d7830080d52d955e2c8dfa")
+    real_path = cache_path.with_name("real_model.json")
+    real_entry = _entry("retry loop must not swallow keyboard interrupt", "W9704", real_model, True, ("src/app.py",))
+    real_path.write_text(dump_entries([real_entry]), encoding="utf-8")
+    with transient_settings(baseline):
+        findings = [{"type": secret.type, "value": secret.secret_value} for secret in scan_file(str(cache_path))]
+        control = [secret.type for secret in scan_file(str(bad_copy))]
+        real_findings = [secret.type for secret in scan_file(str(real_path))]
+    expect(control, "negative control was not flagged; the scan path may be excluded")
+    expect(findings == [], f"detect-secrets findings: {findings}")
+    expect(real_findings == [], f"real-model cache flagged: {real_findings}")
+    rendered = cache_path.read_text(encoding="utf-8")
+    expect(not re.search(r"(?<![0-9a-fA-F])[0-9a-fA-F]{20,}(?![0-9a-fA-F])", rendered), "cache has bare hex >= 20")
+    return {
+        "cache": str(cache_path),
+        "findings": 0,
+        "negative_control": control,
+        "real_model_findings": real_findings,
+        "sha256": _sha(cache_path),
+    }
+
+
+def check_prune() -> dict[str, Any]:
+    """Refresh prunes missing files and stale model/prompt entries automatically."""
+    root = TMP / "prune"
+    shutil.rmtree(root, ignore_errors=True)
+    root.mkdir(parents=True)
+    for name in ("a", "b", "gone"):
+        fixture_file(root, f"src/{name}.py", f"{name} specific technical reason")
+    seeded = run_refresh(
+        cwd=root,
+        path=None,
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen=NOW,
+        jobs_flag=1,
+        rcfiles=[],
+        backend=FakeBackend(score=1.0),
+        environ={},
+    )
+    expect(len(load_entries(seeded, strict=True)) == 3, "seed must create three entries")
+    (root / "src/gone.py").unlink()
+
+    after_missing = merge_refresh(
+        load_entries(seeded, strict=True),
+        [],
+        cwd=root,
+        current_model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen=NOW,
+    )
+    files = {entry.files for entry in after_missing}
+    expect(len(after_missing) == 2, f"missing-file entry not pruned: {len(after_missing)}")
+    expect(("src/gone.py",) not in files, "deleted file entry survived")
+
+    stale = merge_refresh(
+        after_missing,
+        [],
+        cwd=root,
+        current_model=MODEL_B,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen=NOW,
+    )
+    expect(stale == [], f"stale model entries not pruned: {stale}")
+
+    prompt_stale = merge_refresh(
+        after_missing,
+        [],
+        cwd=root,
+        current_model=MODEL_A,
+        current_prompt_hash=prompt_hash("different prompt"),
+        last_seen=NOW,
+    )
+    expect(prompt_stale == [], f"stale prompt entries not pruned: {prompt_stale}")
+    return {"after_missing": [list(entry.files) for entry in after_missing], "after_stale": 0}
+
+
+def check_files_union_posix() -> dict[str, Any]:
+    """One logical key observed in several files unions sorted POSIX paths."""
+    root = make_project(
+        "union",
+        {
+            "src/a.py": ("retry loop must not swallow keyboard interrupt", "pylint"),
+            "src/b.py": ("retry loop must not swallow keyboard interrupt", "pylint"),
+            "src/c.py": ("retry loop must not swallow keyboard interrupt", "pylint"),
+        },
+    )
+    cache_path = run_refresh(
+        cwd=root,
+        path=None,
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen=NOW,
+        jobs_flag=1,
+        rcfiles=[],
+        backend=FakeBackend(score=1.0),
+        environ={},
+    )
+    entries = load_entries(cache_path, strict=True)
+    expect(len(entries) == 1, f"expected one deduplicated entry, got {len(entries)}")
+    expect(entries[0].files == ("src/a.py", "src/b.py", "src/c.py"), f"union mismatch: {entries[0].files}")
+    expect(all("\\" not in file for file in entries[0].files), "files must be POSIX")
+    return {"files": list(entries[0].files)}
+
+
+def check_path_scoping() -> dict[str, Any]:
+    """--path scopes the sweep and retains entries for unscanned files."""
+    root = make_project(
+        "scoping",
+        {
+            "src/a.py": ("a specific technical reason for retrying", "pylint"),
+            "src/b.py": ("b specific technical reason for retrying", "pylint"),
+        },
+    )
+    (root / "tests").mkdir(exist_ok=True)
+    (root / "tests" / "test_scope.py").write_text("VALUE = 1\n", encoding="utf-8")
+    expect(paths_in_scope(root, "src") == {"src/a.py", "src/b.py"}, "directory --path must select only its subtree")
+    cache_path = run_refresh(
+        cwd=root,
+        path=None,
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen="2026-11-01",
+        jobs_flag=1,
+        rcfiles=[],
+        backend=FakeBackend(score=1.0),
+        environ={},
+    )
+    before = {(entry.rule, entry.justification): entry for entry in load_entries(cache_path, strict=True)}
+    (root / "src/b.py").unlink()
+
+    run_refresh(
+        cwd=root,
+        path="src/a.py",
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen="2026-11-08",
+        jobs_flag=1,
+        rcfiles=[],
+        backend=FakeBackend(score=1.0),
+        environ={},
+    )
+    scoped = load_entries(cache_path, strict=True)
+    by_justification = {entry.justification: entry for entry in scoped}
+    expect(len(scoped) == 2, f"scoped refresh must retain unscanned entry, got {len(scoped)}")
+    expect(by_justification["b specific technical reason for retrying"].last_seen == "2026-11-01", "unscanned entry changed")
+    expect(by_justification["b specific technical reason for retrying"].files == ("src/b.py",), "unscanned files changed")
+    expect(by_justification["a specific technical reason for retrying"].last_seen == "2026-11-08", "scanned entry not updated")
+
+    run_refresh(
+        cwd=root,
+        path=None,
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen="2026-11-08",
+        jobs_flag=1,
+        rcfiles=[],
+        backend=FakeBackend(score=1.0),
+        environ={},
+    )
+    full = load_entries(cache_path, strict=True)
+    expect(len(full) == 1, f"full refresh must prune the missing unscanned entry, got {len(full)}")
+    return {"scoped_entries": len(scoped), "full_entries": len(full), "before": len(before)}
+
+
+def check_scoped_stale_mixed() -> dict[str, Any]:
+    """A scoped model change retains the unscanned share and prunes it on full refresh."""
+    root = make_project(
+        "scoped_stale",
+        {
+            "src/a.py": ("shared specific technical reason for retrying", "pylint"),
+            "src/b.py": ("shared specific technical reason for retrying", "pylint"),
+        },
+    )
+    cache_path = run_refresh(
+        cwd=root,
+        path=None,
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen="2026-11-01",
+        jobs_flag=1,
+        rcfiles=[],
+        backend=FakeBackend(score=1.0),
+        environ={},
+    )
+    seeded = load_entries(cache_path, strict=True)
+    expect(len(seeded) == 1 and seeded[0].files == ("src/a.py", "src/b.py"), f"seed mismatch: {seeded}")
+
+    run_refresh(
+        cwd=root,
+        path="src/a.py",
+        model=MODEL_B,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen="2026-11-08",
+        jobs_flag=1,
+        rcfiles=[],
+        backend=FakeBackend(score=1.0),
+        environ={},
+    )
+    scoped = load_entries(cache_path, strict=True)
+    expect(len(scoped) == 2, f"stale mixed entry must be retained, got {len(scoped)}")
+    old = next(entry for entry in scoped if entry.model == MODEL_A)
+    expect(old.files == ("src/a.py", "src/b.py"), f"unscanned share lost: {old.files}")
+    expect(old.last_seen == "2026-11-01", "unscanned entry was touched")
+
+    run_refresh(
+        cwd=root,
+        path=None,
+        model=MODEL_B,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen="2026-11-08",
+        jobs_flag=1,
+        rcfiles=[],
+        backend=FakeBackend(score=1.0),
+        environ={},
+    )
+    full = load_entries(cache_path, strict=True)
+    expect(len(full) == 1, f"full refresh must prune the stale model entry, got {len(full)}")
+    expect(full[0].model == MODEL_B, "full refresh kept the stale model")
+    expect(full[0].files == ("src/a.py", "src/b.py"), f"full refresh did not union files: {full[0].files}")
+    return {"scoped_entries": len(scoped), "full_entries": len(full), "files": list(full[0].files)}
+
+
+def check_ci_fail() -> dict[str, Any]:
+    """Refresh exits non-zero under CI/GITHUB_ACTIONS and writes nothing."""
+    root = make_project("ci", {"src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint")})
+    cache_path = run_refresh(
+        cwd=root,
+        path=None,
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen=NOW,
+        jobs_flag=1,
+        rcfiles=[],
+        backend=FakeBackend(score=1.0),
+        environ={},
+    )
+    before = _sha(cache_path)
+    outcomes: dict[str, int] = {}
+    for variable in ("CI", "GITHUB_ACTIONS"):
+        env = {**os.environ, variable: "1"}
+        completed = subprocess.run(
+            [sys.executable, str(POC / "refresh_cli.py"), "--refresh-decisions", "--cwd", str(root)],
+            cwd=POC,
+            env=env,
+            capture_output=True,
+            text=True,
+            check=False,
+        )
+        outcomes[variable] = completed.returncode
+        expect(completed.returncode != 0, f"refresh under {variable} must fail")
+        expect(_sha(cache_path) == before, f"refresh under {variable} changed the cache")
+    return {"exit_codes": outcomes, "cache_unchanged": True}
+
+
+def check_jobs_guard() -> dict[str, Any]:
+    """Refresh requires jobs==1 and fails loudly on rcfile or flag overrides."""
+    rcfile = TMP / "jobs" / ".pylintrc"
+    shutil.rmtree(rcfile.parent, ignore_errors=True)
+    rcfile.parent.mkdir(parents=True)
+    rcfile.write_text("[MAIN]\njobs=2\n", encoding="utf-8")
+    try:
+        jobs_guard(jobs_flag=1, rcfiles=[rcfile])
+    except RefreshError:
+        rcfile_blocked = True
+    else:
+        raise ProofFailure("rcfile jobs=2 was not rejected")
+    try:
+        jobs_guard(jobs_flag=2, rcfiles=[])
+    except RefreshError:
+        flag_blocked = True
+    else:
+        raise ProofFailure("--jobs=2 was not rejected")
+    try:
+        jobs_guard(jobs_flag=0, rcfiles=[])
+    except RefreshError:
+        auto_blocked = True
+    else:
+        raise ProofFailure("--jobs=0 auto-detect was not rejected")
+
+    repo_rcfiles = [REPO_ROOT / "config" / f".pylintrc{suffix}" for suffix in ("", "-pyi", "-tests")]
+    repo_overrides = {path.name: parse_jobs_overrides(path) for path in repo_rcfiles}
+    expect(all(not values for values in repo_overrides.values()), f"HEAD rcfiles set jobs: {repo_overrides}")
+    checks = jobs_guard(jobs_flag=1, rcfiles=repo_rcfiles)
+
+    root = make_project("jobs", {"src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint")})
+    cache_path = resolve_cache_path(root)
+    completed = subprocess.run(
+        [
+            sys.executable,
+            str(POC / "refresh_cli.py"),
+            "--refresh-decisions",
+            "--cwd",
+            str(root),
+            "--jobs",
+            "2",
+        ],
+        cwd=POC,
+        env={**os.environ, "PYTHON_SETUP_LINT_DECISIONS_PATH": str(TMP / "jobs" / "cache.json")},
+        capture_output=True,
+        text=True,
+        check=False,
+    )
+    expect(completed.returncode != 0, "--jobs=2 CLI must fail")
+    expect(not cache_path.exists(), "failed jobs guard must not write the cache")
+    return {
+        "rcfile_blocked": rcfile_blocked,
+        "flag_blocked": flag_blocked,
+        "auto_blocked": auto_blocked,
+        "repo_overrides": repo_overrides,
+        "checks": checks,
+    }
+
+
+def check_ci_guard_function() -> dict[str, Any]:
+    """The CI guard matches the golden UPDATE_ENV shape."""
+    ci_guard({})
+    for variable in ("CI", "GITHUB_ACTIONS"):
+        try:
+            ci_guard({variable: "1"})
+        except RefreshError:
+            continue
+        raise ProofFailure(f"{variable} did not trip the guard")
+    return {"guard": "CI/GITHUB_ACTIONS"}
+
+
+def check_determinism() -> dict[str, Any]:
+    """Double refresh with fixed inputs is byte-identical."""
+    root = make_project(
+        "determinism",
+        {
+            "src/b.py": ("b specific technical reason for retrying", "pylint"),
+            "src/a.py": ("a specific technical reason for retrying", "pylint"),
+            "tests/test_a.py": ("test specific technical reason for retrying", "noqa"),
+        },
+    )
+    kwargs = {
+        "cwd": root,
+        "path": None,
+        "model": MODEL_A,
+        "current_prompt_hash": PROMPT_HASH,
+        "last_seen": NOW,
+        "jobs_flag": 1,
+        "rcfiles": [],
+        "backend": FakeBackend(score=1.0),
+        "environ": {},
+    }
+    first = run_refresh(**kwargs)
+    first_bytes = first.read_bytes()
+    second = run_refresh(**kwargs)
+    second_bytes = second.read_bytes()
+    expect(first_bytes == second_bytes, "double refresh is not byte-identical")
+    expect(not list(first.parent.glob("*.tmp")), "atomic temp files leaked")
+    return {"sha256": _sha(first), "bytes": len(first_bytes), "byte_identical": True}
+
+
+def check_atomic_failure() -> dict[str, Any]:
+    """A failed serialization leaves the previous cache untouched."""
+    root = make_project("atomic", {"src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint")})
+    cache_path = run_refresh(
+        cwd=root,
+        path=None,
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen=NOW,
+        jobs_flag=1,
+        rcfiles=[],
+        backend=FakeBackend(score=1.0),
+        environ={},
+    )
+    before = _sha(cache_path)
+    hex_file = "src/" + "a1b2c3d4e5f60718293a4b5c6d7e8f90" + ".py"
+    (root / hex_file).parent.mkdir(parents=True, exist_ok=True)
+    fixture_file(root, hex_file, "hex path specific technical reason")
+    try:
+        run_refresh(
+            cwd=root,
+            path=None,
+            model=MODEL_A,
+            current_prompt_hash=PROMPT_HASH,
+            last_seen=NOW,
+            jobs_flag=1,
+            rcfiles=[],
+            backend=FakeBackend(score=1.0),
+            environ={},
+        )
+    except Exception:  # noqa: BLE001 - expected failure path
+        failed = True
+    else:
+        failed = False
+    expect(failed, "bare-hex file path should fail the no-bare-hex contract")
+    expect(_sha(cache_path) == before, "failed refresh clobbered the previous cache")
+    return {"failed_loudly": True, "cache_unchanged": True}
+
+
+def check_lock_contention() -> dict[str, Any]:
+    """A second refresh fails loudly on the lock and does not write."""
+    import fcntl
+
+    root = make_project("lock", {"src/app.py": ("retry loop must not swallow keyboard interrupt", "pylint")})
+    cache_path = run_refresh(
+        cwd=root,
+        path=None,
+        model=MODEL_A,
+        current_prompt_hash=PROMPT_HASH,
+        last_seen=NOW,
+        jobs_flag=1,
+        rcfiles=[],
+        backend=FakeBackend(score=1.0),
+        environ={},
+    )
+    before = _sha(cache_path)
+    lock_path = cache_path.with_name(LOCK_FILENAME)
+    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
+    try:
+        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
+        try:
+            refresh(
+                cwd=root,
+                observed=[],
+                current_model=MODEL_A,
+                current_prompt_hash=PROMPT_HASH,
+                last_seen=NOW,
+                environ={},
+            )
+        except RefreshLockError:
+            blocked = True
+        else:
+            blocked = False
+    finally:
+        fcntl.flock(descriptor, fcntl.LOCK_UN)
+        os.close(descriptor)
+    expect(blocked, "second refresh did not fail on the held lock")
+    expect(_sha(cache_path) == before, "blocked refresh changed the cache")
+    return {"lock_blocked": blocked, "cache_unchanged": True}
+
+
+def check_corrupt_cache() -> dict[str, Any]:
+    """Normal lint tolerates corruption; refresh fails without clobbering."""
+    root = TMP / "corrupt"
+    shutil.rmtree(root, ignore_errors=True)
+    root.mkdir(parents=True)
+    cache_path = resolve_cache_path(root)
+    cache_path.write_text("{not json", encoding="utf-8")
+    expect(load_entries(cache_path) == [], "normal lint must tolerate corrupt cache")
+    try:
+        refresh(
+            cwd=root,
+            observed=[],
+            current_model=MODEL_A,
+            current_prompt_hash=PROMPT_HASH,
+            last_seen=NOW,
+            environ={},
+        )
+    except Exception:  # noqa: BLE001 - expected
+        failed = True
+    else:
+        failed = False
+    expect(failed, "refresh must fail loudly on corrupt cache")
+    expect(cache_path.read_text(encoding="utf-8") == "{not json", "refresh clobbered corrupt cache")
+    return {"normal_tolerant": True, "refresh_failed_loudly": True}
+
+
+def check_model_string() -> dict[str, Any]:
+    """Model string follows ``<id> rev <short12> prompt-vN``."""
+    model = build_model_id("fake-backend", "test")
+    expect(model == "fake-backend rev test prompt-v1", f"unexpected fake model: {model}")
+    real = build_model_id("jina-reranker-v2-base-multilingual", "b886a1f9b91f4e8368d7830080d52d955e2c8dfa")
+    expect(real == "jina-reranker-v2-base-multilingual rev b886a1f9b91f prompt-v1", f"unexpected model: {real}")
+    revision = real.split(" rev ", 1)[1].split(" ", 1)[0]
+    expect(len(revision) == 12, "revision must be short12")
+    expect(not re.search(r"[0-9a-fA-F]{20,}", real), "model string contains bare hex >= 20")
+    return {"fake": model, "real": real, "short12": revision}
+
+
+def check_writer_verdict() -> dict[str, Any]:
+    """Consume the writer-first verdict from the assumption test."""
+    source = (REPO_ROOT / "tests/assumptions/test_pylint_cache_semantics.py").read_text(encoding="utf-8")
+    required = ("Writer identity", "Timing", "scoping", "Sweep implication", "Concurrency", "Crash safety")
+    missing = [marker for marker in required if marker not in source]
+    expect(not missing, f"writer verdict markers missing: {missing}")
+    expect("jobs" in source and "ProcessPoolExecutor" in source, "concurrency verdict not present")
+    return {
+        "path": "tests/assumptions/test_pylint_cache_semantics.py",
+        "sha256": __import__("hashlib").sha256(source.encode()).hexdigest(),
+        "markers": list(required),
+        "consumed": "path-free key -> per-entry files; jobs==1 single writer; non-atomic write -> refresh-only atomic replace",
+    }
+
+
+def check_production_untouched() -> dict[str, Any]:
+    """Production and test paths stay byte-identical (zero production changes)."""
+    status = subprocess.run(
+        ["git", "status", "--porcelain"],
+        cwd=REPO_ROOT,
+        capture_output=True,
+        text=True,
+        check=False,
+    )
+    diff = subprocess.run(
+        ["git", "diff", "--stat", "--", ".", ":(exclude).factory", ":(exclude).omp"],
+        cwd=REPO_ROOT,
+        capture_output=True,
+        text=True,
+        check=False,
+    )
+    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True, check=False)
+    production_lines = [line for line in status.stdout.splitlines() if ".factory/" not in line and ".omp/" not in line]
+    expect(not production_lines, f"production paths modified: {production_lines}")
+    expect(diff.stdout.strip() == "", f"production diff present: {diff.stdout}")
+    return {"status": status.stdout, "production_lines": production_lines, "diff": diff.stdout, "head": head.stdout.strip()}
+
+
+def check_tach_placement() -> dict[str, Any]:
+    """ADR-018 placement passes tach; an illegal decisions->checkers edge fails."""
+    root = TMP / "tach"
+    shutil.rmtree(root, ignore_errors=True)
+    (root / "src/python_setup_lint/decisions").mkdir(parents=True)
+    (root / "src/python_setup_lint/checkers").mkdir(parents=True)
+    (root / "src/python_setup_lint/runner").mkdir(parents=True)
+    for package in ("python_setup_lint", "python_setup_lint/decisions", "python_setup_lint/checkers", "python_setup_lint/runner"):
+        (root / "src" / package / "__init__.py").write_text("", encoding="utf-8")
+    (root / "src/python_setup_lint/decisions/_decision_cache.py").write_text(
+        "def load() -> bool:\n    return True\n", encoding="utf-8"
+    )
+    (root / "src/python_setup_lint/decisions/_decision_cache.pyi").write_text(
+        "def load() -> bool: ...\n", encoding="utf-8"
+    )
+    (root / "src/python_setup_lint/checkers/mod.py").write_text(
+        "from python_setup_lint.decisions._decision_cache import load\n\nVALUE = load()\n", encoding="utf-8"
+    )
+    (root / "src/python_setup_lint/runner/mod.py").write_text(
+        "from python_setup_lint.decisions._decision_cache import load\n\nVALUE = load()\n", encoding="utf-8"
+    )
+    config = """interfaces = []
+exclude = ["**/__pycache__"]
+source_roots = ["src"]
+
+[[modules]]
+path = "python_setup_lint.decisions"
+depends_on = []
+
+[[modules]]
+path = "python_setup_lint.checkers"
+depends_on = ["python_setup_lint.decisions"]
+
+[[modules]]
+path = "python_setup_lint.runner"
+depends_on = ["python_setup_lint.decisions"]
+"""
+    (root / "tach.toml").write_text(config, encoding="utf-8")
+    positive = subprocess.run(
+        ["uv", "run", "tach", "check"],
+        cwd=root,
+        capture_output=True,
+        text=True,
+        check=False,
+    )
+    expect(positive.returncode == 0, f"legal ADR-018 placement failed tach: {positive.stdout}{positive.stderr}")
+
+    (root / "src/python_setup_lint/decisions/bad.py").write_text(
+        "from python_setup_lint.checkers.mod import VALUE\n", encoding="utf-8"
+    )
+    negative = subprocess.run(
+        ["uv", "run", "tach", "check"],
+        cwd=root,
+        capture_output=True,
+        text=True,
+        check=False,
+    )
+    expect(negative.returncode != 0, "illegal decisions->checkers edge was not rejected")
+    (root / "src/python_setup_lint/decisions/bad.py").unlink()
+    return {
+        "positive_exit": positive.returncode,
+        "negative_exit": negative.returncode,
+        "negative_output": negative.stdout.strip().splitlines()[-3:],
+    }
+
+
+def check_refresh_mode_env() -> dict[str, Any]:
+    """The refresh env flag is the only switch that enables writer mode."""
+    expect(is_refresh_mode({}) is False, "normal lint must not be refresh mode")
+    expect(is_refresh_mode({"PYTHON_SETUP_LINT_DECISIONS_REFRESH": "1"}) is True, "refresh env flag not honored")
+    expect(DECISION_THRESHOLD == 0.5, "threshold pinned at 0.5")
+    expect(SCHEMA_VERSION == 1, "schema version pinned")
+    return {"threshold": DECISION_THRESHOLD, "schema_version": SCHEMA_VERSION}
+
+
+def main() -> int:
+    """Run every proof/check and write ``out/proofs.json``."""
+    shutil.rmtree(TMP, ignore_errors=True)
+    TMP.mkdir(parents=True)
+    OUT.mkdir(parents=True, exist_ok=True)
+    results: Results = {"generated_at_unix": int(time.time()), "model_a": MODEL_A, "prompt_hash": PROMPT_HASH}
+    checks: list[tuple[str, Callable[[], dict[str, Any]]]] = [
+        ("proof_1_heuristic_rejected_without_backend", proof_1_heuristic_rejected_without_backend),
+        ("proof_2_accepted_hit_equals_persisted", proof_2_accepted_hit_equals_persisted),
+        ("proof_3_accepted_miss_absent_heuristic_true", proof_3_accepted_miss_absent_heuristic_true),
+        ("proof_4_normal_lint_zero_writes_by_hash", proof_4_normal_lint_zero_writes_by_hash),
+        ("contract_root_guard", check_root_guard),
+        ("contract_checker_root_hint", check_checker_root_hint),
+        ("contract_decisions_path_test_only", check_decisions_path_test_only),
+        ("contract_schema_sort", check_schema_sort),
+        ("contract_encoding_collision", check_encoding_collision),
+        ("contract_detect_secrets", check_detect_secrets),
+        ("contract_prune", check_prune),
+        ("contract_files_union_posix", check_files_union_posix),
+        ("contract_path_scoping", check_path_scoping),
+        ("contract_scoped_stale_mixed", check_scoped_stale_mixed),
+        ("contract_ci_fail", check_ci_fail),
+        ("contract_ci_guard_function", check_ci_guard_function),
+        ("contract_jobs_guard", check_jobs_guard),
+        ("contract_determinism", check_determinism),
+        ("contract_atomic_failure", check_atomic_failure),
+        ("contract_lock_contention", check_lock_contention),
+        ("contract_corrupt_cache", check_corrupt_cache),
+        ("contract_model_string", check_model_string),
+        ("contract_writer_verdict", check_writer_verdict),
+        ("contract_refresh_mode_env", check_refresh_mode_env),
+        ("contract_tach_placement", check_tach_placement),
+        ("contract_production_untouched", check_production_untouched),
+    ]
+    for name, function in checks:
+        run_check(results, name, function)
+        state = "PASS" if results[name]["ok"] else "FAIL"
+        print(f"[{state}] {name} ({results[name]['seconds']}s)")
+        if not results[name]["ok"]:
+            print(f"       {results[name]['error']}")
+
+    required = [
+        "proof_1_heuristic_rejected_without_backend",
+        "proof_2_accepted_hit_equals_persisted",
+        "proof_3_accepted_miss_absent_heuristic_true",
+        "proof_4_normal_lint_zero_writes_by_hash",
+    ]
+    failed = [name for name, result in results.items() if isinstance(result, dict) and result.get("ok") is False]
+    verdict = "feasible" if not failed else "blocked"
+    results["verdict"] = verdict
+    results["required_proofs"] = {name: results[name]["ok"] for name in required}
+    results["failed_checks"] = failed
+    (OUT / "proofs.json").write_text(json.dumps(results, indent=2, sort_keys=True) + "\n", encoding="utf-8")
+    print(f"\nverdict: {verdict}; failed: {failed or 'none'}")
+    print(f"results: {OUT / 'proofs.json'}")
+    return 0 if not failed else 1
+
+
+if __name__ == "__main__":
+    raise SystemExit(main())
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_lower.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_lower.json
new file mode 100644
index 0000000..a3c5196
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_lower.json
@@ -0,0 +1,12 @@
+{
+  "decision": true,
+  "files": [
+    "src/app.py"
+  ],
+  "justification": "retry loop must not swallow keyboard interrupt",
+  "last_seen": "2026-11-08",
+  "model": "fake-backend rev test prompt-v1",
+  "prompt_hash": "ysebfby5usvamupsxwbz33bsaffw7m3dsa3pkljwige4rslr7yga",
+  "rule": "W9704",
+  "version": 1
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_lower_dashed8.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_lower_dashed8.json
new file mode 100644
index 0000000..942bf2e
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_lower_dashed8.json
@@ -0,0 +1,12 @@
+{
+  "decision": true,
+  "files": [
+    "src/app.py"
+  ],
+  "justification": "retry loop must not swallow keyboard interrupt",
+  "last_seen": "2026-11-08",
+  "model": "fake-backend rev test prompt-v1",
+  "prompt_hash": "dk1-ysebfby5-usvamups-xwbz33bs-affw7m3d-sa3pkljw-ige4rslr-7yga",
+  "rule": "W9704",
+  "version": 1
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_lower_dotted8.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_lower_dotted8.json
new file mode 100644
index 0000000..fa11006
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_lower_dotted8.json
@@ -0,0 +1,12 @@
+{
+  "decision": true,
+  "files": [
+    "src/app.py"
+  ],
+  "justification": "retry loop must not swallow keyboard interrupt",
+  "last_seen": "2026-11-08",
+  "model": "fake-backend rev test prompt-v1",
+  "prompt_hash": "dk1.ysebfby5.usvamups.xwbz33bs.affw7m3d.sa3pkljw.ige4rslr.7yga",
+  "rule": "W9704",
+  "version": 1
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_lower_prefixed.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_lower_prefixed.json
new file mode 100644
index 0000000..80ca280
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_lower_prefixed.json
@@ -0,0 +1,12 @@
+{
+  "decision": true,
+  "files": [
+    "src/app.py"
+  ],
+  "justification": "retry loop must not swallow keyboard interrupt",
+  "last_seen": "2026-11-08",
+  "model": "fake-backend rev test prompt-v1",
+  "prompt_hash": "dk1_ysebfby5usvamupsxwbz33bsaffw7m3dsa3pkljwige4rslr7yga",
+  "rule": "W9704",
+  "version": 1
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_upper.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_upper.json
new file mode 100644
index 0000000..bb8bc49
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_upper.json
@@ -0,0 +1,12 @@
+{
+  "decision": true,
+  "files": [
+    "src/app.py"
+  ],
+  "justification": "retry loop must not swallow keyboard interrupt",
+  "last_seen": "2026-11-08",
+  "model": "fake-backend rev test prompt-v1",
+  "prompt_hash": "YSEBFBY5USVAMUPSXWBZ33BSAFFW7M3DSA3PKLJWIGE4RSLR7YGA",
+  "rule": "W9704",
+  "version": 1
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_upper_dashed8.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_upper_dashed8.json
new file mode 100644
index 0000000..bd25c0e
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_upper_dashed8.json
@@ -0,0 +1,12 @@
+{
+  "decision": true,
+  "files": [
+    "src/app.py"
+  ],
+  "justification": "retry loop must not swallow keyboard interrupt",
+  "last_seen": "2026-11-08",
+  "model": "fake-backend rev test prompt-v1",
+  "prompt_hash": "DK1-YSEBFBY5-USVAMUPS-XWBZ33BS-AFFW7M3D-SA3PKLJW-IGE4RSLR-7YGA",
+  "rule": "W9704",
+  "version": 1
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_upper_dotted8.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_upper_dotted8.json
new file mode 100644
index 0000000..b7d3083
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base32_upper_dotted8.json
@@ -0,0 +1,12 @@
+{
+  "decision": true,
+  "files": [
+    "src/app.py"
+  ],
+  "justification": "retry loop must not swallow keyboard interrupt",
+  "last_seen": "2026-11-08",
+  "model": "fake-backend rev test prompt-v1",
+  "prompt_hash": "DK1.YSEBFBY5.USVAMUPS.XWBZ33BS.AFFW7M3D.SA3PKLJW.IGE4RSLR.7YGA",
+  "rule": "W9704",
+  "version": 1
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base36.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base36.json
new file mode 100644
index 0000000..1ea721d
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base36.json
@@ -0,0 +1,12 @@
+{
+  "decision": true,
+  "files": [
+    "src/app.py"
+  ],
+  "justification": "retry loop must not swallow keyboard interrupt",
+  "last_seen": "2026-11-08",
+  "model": "fake-backend rev test prompt-v1",
+  "prompt_hash": "4wc8skxsqct44mpklxn9jqpslc44n30z5vx8rfb0te96uqgkjw",
+  "rule": "W9704",
+  "version": 1
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base58.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base58.json
new file mode 100644
index 0000000..c8cb319
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base58.json
@@ -0,0 +1,12 @@
+{
+  "decision": true,
+  "files": [
+    "src/app.py"
+  ],
+  "justification": "retry loop must not swallow keyboard interrupt",
+  "last_seen": "2026-11-08",
+  "model": "fake-backend rev test prompt-v1",
+  "prompt_hash": "EEBFcFfZuojZqEdMBAJehNEUTG51zsjbPnrUDm7rWamR",
+  "rule": "W9704",
+  "version": 1
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base64url.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base64url.json
new file mode 100644
index 0000000..295ede9
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/base64url.json
@@ -0,0 +1,12 @@
+{
+  "decision": true,
+  "files": [
+    "src/app.py"
+  ],
+  "justification": "retry loop must not swallow keyboard interrupt",
+  "last_seen": "2026-11-08",
+  "model": "fake-backend rev test prompt-v1",
+  "prompt_hash": "xIgShx2kqgZR8r2DnewyAUtvs2OQNvUtNkGJyMlx_gw",
+  "rule": "W9704",
+  "version": 1
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/decimal.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/decimal.json
new file mode 100644
index 0000000..f4d87ff
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/decimal.json
@@ -0,0 +1,12 @@
+{
+  "decision": true,
+  "files": [
+    "src/app.py"
+  ],
+  "justification": "retry loop must not swallow keyboard interrupt",
+  "last_seen": "2026-11-08",
+  "model": "fake-backend rev test prompt-v1",
+  "prompt_hash": "88893737397278910049857236387336479879413594793538904991125363394996377615884",
+  "rule": "W9704",
+  "version": 1
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/decimal_prefixed.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/decimal_prefixed.json
new file mode 100644
index 0000000..3ee82f9
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/decimal_prefixed.json
@@ -0,0 +1,12 @@
+{
+  "decision": true,
+  "files": [
+    "src/app.py"
+  ],
+  "justification": "retry loop must not swallow keyboard interrupt",
+  "last_seen": "2026-11-08",
+  "model": "fake-backend rev test prompt-v1",
+  "prompt_hash": "dk1:88893737397278910049857236387336479879413594793538904991125363394996377615884",
+  "rule": "W9704",
+  "version": 1
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/hex_dashed8.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/hex_dashed8.json
new file mode 100644
index 0000000..1d50641
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/hex_dashed8.json
@@ -0,0 +1,12 @@
+{
+  "decision": true,
+  "files": [
+    "src/app.py"
+  ],
+  "justification": "retry loop must not swallow keyboard interrupt",
+  "last_seen": "2026-11-08",
+  "model": "fake-backend rev test prompt-v1",
+  "prompt_hash": "d1-c4881287-1da4aa06-51f2bd83-9dec3201-4b6fb363-9036f52d-364189c8-c971fe0c",
+  "rule": "W9704",
+  "version": 1
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/hex_full.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/hex_full.json
new file mode 100644
index 0000000..90aae6a
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/hex_full.json
@@ -0,0 +1,12 @@
+{
+  "decision": true,
+  "files": [
+    "src/app.py"
+  ],
+  "justification": "retry loop must not swallow keyboard interrupt",
+  "last_seen": "2026-11-08",
+  "model": "fake-backend rev test prompt-v1",
+  "prompt_hash": "c48812871da4aa0651f2bd839dec32014b6fb3639036f52d364189c8c971fe0c",
+  "rule": "W9704",
+  "version": 1
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/hex_short12.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/hex_short12.json
new file mode 100644
index 0000000..04da7a9
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/encoding_lab/hex_short12.json
@@ -0,0 +1,12 @@
+{
+  "decision": true,
+  "files": [
+    "src/app.py"
+  ],
+  "justification": "retry loop must not swallow keyboard interrupt",
+  "last_seen": "2026-11-08",
+  "model": "fake-backend rev test prompt-v1",
+  "prompt_hash": "c48812871da4",
+  "rule": "W9704",
+  "version": 1
+}
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/memory_time/project/src/app.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/memory_time/project/src/app.py
new file mode 100644
index 0000000..e75337b
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/memory_time/project/src/app.py
@@ -0,0 +1,9 @@
+from beartype import beartype
+
+
+@beartype
+def load() -> int:
+    return 1
+
+
+VALUE = load()
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/memory_time/project/src/app.pyi b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/memory_time/project/src/app.pyi
new file mode 100644
index 0000000..22fc7aa
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/memory_time/project/src/app.pyi
@@ -0,0 +1,5 @@
+from beartype import beartype
+
+
+@beartype
+def load() -> int: ...
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/memory_time/project/tests/test_app.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/memory_time/project/tests/test_app.py
new file mode 100644
index 0000000..567f22a
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/memory_time/project/tests/test_app.py
@@ -0,0 +1,7 @@
+"""Fixture test module."""
+
+
+def test_value() -> None:
+    """Check a trivial assertion."""
+    value = 2
+    assert value == 2
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/atomic/.python-setup-decisions.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/atomic/.python-setup-decisions.json
new file mode 100644
index 0000000..64ece89
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/atomic/.python-setup-decisions.json
@@ -0,0 +1,15 @@
+[
+  {
+    "decision": true,
+    "files": [
+      "src/app.py"
+    ],
+    "justification": "retry loop must not swallow keyboard interrupt",
+    "key": "dk1.rqe7hoh6.wtubtklk.wdme4ym5.2rmpzejw.r6abbzdo.b73dpz7a.pwxa",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/atomic/.python-setup-decisions.lock b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/atomic/.python-setup-decisions.lock
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/atomic/src/a1b2c3d4e5f60718293a4b5c6d7e8f90.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/atomic/src/a1b2c3d4e5f60718293a4b5c6d7e8f90.py
new file mode 100644
index 0000000..1814727
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/atomic/src/a1b2c3d4e5f60718293a4b5c6d7e8f90.py
@@ -0,0 +1,2 @@
+# justification: hex path specific technical reason
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/atomic/src/app.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/atomic/src/app.py
new file mode 100644
index 0000000..1bd8978
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/atomic/src/app.py
@@ -0,0 +1,2 @@
+# justification: retry loop must not swallow keyboard interrupt
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/ci/.python-setup-decisions.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/ci/.python-setup-decisions.json
new file mode 100644
index 0000000..64ece89
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/ci/.python-setup-decisions.json
@@ -0,0 +1,15 @@
+[
+  {
+    "decision": true,
+    "files": [
+      "src/app.py"
+    ],
+    "justification": "retry loop must not swallow keyboard interrupt",
+    "key": "dk1.rqe7hoh6.wtubtklk.wdme4ym5.2rmpzejw.r6abbzdo.b73dpz7a.pwxa",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/ci/.python-setup-decisions.lock b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/ci/.python-setup-decisions.lock
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/ci/src/app.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/ci/src/app.py
new file mode 100644
index 0000000..1bd8978
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/ci/src/app.py
@@ -0,0 +1,2 @@
+# justification: retry loop must not swallow keyboard interrupt
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/corrupt/.python-setup-decisions.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/corrupt/.python-setup-decisions.json
new file mode 100644
index 0000000..74d7b70
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/corrupt/.python-setup-decisions.json
@@ -0,0 +1 @@
+{not json
\ No newline at end of file
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/corrupt/.python-setup-decisions.lock b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/corrupt/.python-setup-decisions.lock
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/determinism/.python-setup-decisions.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/determinism/.python-setup-decisions.json
new file mode 100644
index 0000000..afa59b5
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/determinism/.python-setup-decisions.json
@@ -0,0 +1,41 @@
+[
+  {
+    "decision": true,
+    "files": [
+      "src/a.py"
+    ],
+    "justification": "a specific technical reason for retrying",
+    "key": "dk1.7slmqcwz.3uxhtzmb.pcuomhfv.dgqzmwkg.sfqkooqx.mttwjc2o.dv7q",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  },
+  {
+    "decision": true,
+    "files": [
+      "src/b.py"
+    ],
+    "justification": "b specific technical reason for retrying",
+    "key": "dk1.emkli25t.evbmnm2l.g4zks6so.ovrh3wnw.c7zt6fc6.trpuxult.o66a",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  },
+  {
+    "decision": true,
+    "files": [
+      "tests/test_a.py"
+    ],
+    "justification": "test specific technical reason for retrying",
+    "key": "dk1.gpn7tk67.ynk5kv2b.srctaek4.r6fhnh2h.s3crqhj4.3zbrtqsg.syja",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/determinism/.python-setup-decisions.lock b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/determinism/.python-setup-decisions.lock
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/determinism/src/a.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/determinism/src/a.py
new file mode 100644
index 0000000..56b78aa
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/determinism/src/a.py
@@ -0,0 +1,2 @@
+# justification: a specific technical reason for retrying
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/determinism/src/b.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/determinism/src/b.py
new file mode 100644
index 0000000..e917f23
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/determinism/src/b.py
@@ -0,0 +1,2 @@
+# justification: b specific technical reason for retrying
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/determinism/tests/test_a.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/determinism/tests/test_a.py
new file mode 100644
index 0000000..db5ff2f
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/determinism/tests/test_a.py
@@ -0,0 +1,2 @@
+# justification: test specific technical reason for retrying
+value = load()  # noqa: W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/isolation/src/app.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/isolation/src/app.py
new file mode 100644
index 0000000..1bd8978
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/isolation/src/app.py
@@ -0,0 +1,2 @@
+# justification: retry loop must not swallow keyboard interrupt
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/isolation_override/.python-setup-decisions.lock b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/isolation_override/.python-setup-decisions.lock
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/isolation_override/cache.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/isolation_override/cache.json
new file mode 100644
index 0000000..64ece89
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/isolation_override/cache.json
@@ -0,0 +1,15 @@
+[
+  {
+    "decision": true,
+    "files": [
+      "src/app.py"
+    ],
+    "justification": "retry loop must not swallow keyboard interrupt",
+    "key": "dk1.rqe7hoh6.wtubtklk.wdme4ym5.2rmpzejw.r6abbzdo.b73dpz7a.pwxa",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/jobs/src/app.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/jobs/src/app.py
new file mode 100644
index 0000000..1bd8978
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/jobs/src/app.py
@@ -0,0 +1,2 @@
+# justification: retry loop must not swallow keyboard interrupt
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/lock/.python-setup-decisions.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/lock/.python-setup-decisions.json
new file mode 100644
index 0000000..64ece89
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/lock/.python-setup-decisions.json
@@ -0,0 +1,15 @@
+[
+  {
+    "decision": true,
+    "files": [
+      "src/app.py"
+    ],
+    "justification": "retry loop must not swallow keyboard interrupt",
+    "key": "dk1.rqe7hoh6.wtubtklk.wdme4ym5.2rmpzejw.r6abbzdo.b73dpz7a.pwxa",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/lock/.python-setup-decisions.lock b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/lock/.python-setup-decisions.lock
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/lock/src/app.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/lock/src/app.py
new file mode 100644
index 0000000..1bd8978
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/lock/src/app.py
@@ -0,0 +1,2 @@
+# justification: retry loop must not swallow keyboard interrupt
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof1/.python-setup-decisions.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof1/.python-setup-decisions.json
new file mode 100644
index 0000000..fe51488
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof1/.python-setup-decisions.json
@@ -0,0 +1 @@
+[]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof1/.python-setup-decisions.lock b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof1/.python-setup-decisions.lock
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof1/src/app.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof1/src/app.py
new file mode 100644
index 0000000..d42d261
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof1/src/app.py
@@ -0,0 +1,2 @@
+# justification: fix this
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof2/.python-setup-decisions.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof2/.python-setup-decisions.json
new file mode 100644
index 0000000..1a90d56
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof2/.python-setup-decisions.json
@@ -0,0 +1,15 @@
+[
+  {
+    "decision": false,
+    "files": [
+      "src/app.py"
+    ],
+    "justification": "retry loop must not swallow keyboard interrupt",
+    "key": "dk1.rqe7hoh6.wtubtklk.wdme4ym5.2rmpzejw.r6abbzdo.b73dpz7a.pwxa",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof2/.python-setup-decisions.lock b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof2/.python-setup-decisions.lock
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof2/src/app.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof2/src/app.py
new file mode 100644
index 0000000..1bd8978
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof2/src/app.py
@@ -0,0 +1,2 @@
+# justification: retry loop must not swallow keyboard interrupt
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof3/src/app.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof3/src/app.py
new file mode 100644
index 0000000..1bd8978
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof3/src/app.py
@@ -0,0 +1,2 @@
+# justification: retry loop must not swallow keyboard interrupt
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof4/.python-setup-decisions.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof4/.python-setup-decisions.json
new file mode 100644
index 0000000..64ece89
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof4/.python-setup-decisions.json
@@ -0,0 +1,15 @@
+[
+  {
+    "decision": true,
+    "files": [
+      "src/app.py"
+    ],
+    "justification": "retry loop must not swallow keyboard interrupt",
+    "key": "dk1.rqe7hoh6.wtubtklk.wdme4ym5.2rmpzejw.r6abbzdo.b73dpz7a.pwxa",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof4/.python-setup-decisions.lock b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof4/.python-setup-decisions.lock
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof4/src/app.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof4/src/app.py
new file mode 100644
index 0000000..1bd8978
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof4/src/app.py
@@ -0,0 +1,2 @@
+# justification: retry loop must not swallow keyboard interrupt
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof4/src/other.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof4/src/other.py
new file mode 100644
index 0000000..d42d261
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof4/src/other.py
@@ -0,0 +1,2 @@
+# justification: fix this
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof4_absent/src/app.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof4_absent/src/app.py
new file mode 100644
index 0000000..1bd8978
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/proof4_absent/src/app.py
@@ -0,0 +1,2 @@
+# justification: retry loop must not swallow keyboard interrupt
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/prune/.python-setup-decisions.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/prune/.python-setup-decisions.json
new file mode 100644
index 0000000..e94d5d2
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/prune/.python-setup-decisions.json
@@ -0,0 +1,41 @@
+[
+  {
+    "decision": true,
+    "files": [
+      "src/a.py"
+    ],
+    "justification": "a specific technical reason",
+    "key": "dk1.krhts6fg.xkldl7nf.47rj3zrw.wkddixu3.o2g4o4qx.gqwfmec6.teqa",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  },
+  {
+    "decision": true,
+    "files": [
+      "src/b.py"
+    ],
+    "justification": "b specific technical reason",
+    "key": "dk1.avv5lkvs.si7ncdgm.4piv3qse.olyg2e4r.4uksmiwa.chpi3vp3.wlza",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  },
+  {
+    "decision": true,
+    "files": [
+      "src/gone.py"
+    ],
+    "justification": "gone specific technical reason",
+    "key": "dk1.tpafdl2i.liuuy4kj.gvyzgcek.g7wwhmd2.3bnlmgif.3wwrtxrj.hcuq",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/prune/.python-setup-decisions.lock b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/prune/.python-setup-decisions.lock
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/prune/src/a.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/prune/src/a.py
new file mode 100644
index 0000000..b942081
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/prune/src/a.py
@@ -0,0 +1,2 @@
+# justification: a specific technical reason
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/prune/src/b.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/prune/src/b.py
new file mode 100644
index 0000000..2229151
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/prune/src/b.py
@@ -0,0 +1,2 @@
+# justification: b specific technical reason
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/schema/.python-setup-decisions.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/schema/.python-setup-decisions.json
new file mode 100644
index 0000000..a461124
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/schema/.python-setup-decisions.json
@@ -0,0 +1,41 @@
+[
+  {
+    "decision": true,
+    "files": [
+      "src/a.py"
+    ],
+    "justification": "a justification",
+    "key": "dk1.fdg35o6q.jytuoa34.3tqmg5cu.oayjlpzv.hcupq3n3.6pne5rki.arzq",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "C0111",
+    "version": 1
+  },
+  {
+    "decision": false,
+    "files": [
+      "src/b.py"
+    ],
+    "justification": "b justification",
+    "key": "dk1.4obofpp4.mvq6ecbz.cds5jpix.dgindxmh.ucfzqlku.kxpiixik.kewq",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "C0111",
+    "version": 1
+  },
+  {
+    "decision": true,
+    "files": [
+      "src/z.py"
+    ],
+    "justification": "z justification",
+    "key": "dk1.f2kdtwnp.nvzqyvsh.bw6yfvyi.hqzu4ut5.p46w4rq5.di7mgkio.pzpq",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev other prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoped_stale/.python-setup-decisions.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoped_stale/.python-setup-decisions.json
new file mode 100644
index 0000000..7ca0924
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoped_stale/.python-setup-decisions.json
@@ -0,0 +1,16 @@
+[
+  {
+    "decision": true,
+    "files": [
+      "src/a.py",
+      "src/b.py"
+    ],
+    "justification": "shared specific technical reason for retrying",
+    "key": "dk1.dkca4eg3.gdxugnmy.wl5hxsqn.nwb25qos.pn7jxq27.ulb354x3.ivla",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev other prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoped_stale/.python-setup-decisions.lock b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoped_stale/.python-setup-decisions.lock
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoped_stale/src/a.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoped_stale/src/a.py
new file mode 100644
index 0000000..8ba5a92
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoped_stale/src/a.py
@@ -0,0 +1,2 @@
+# justification: shared specific technical reason for retrying
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoped_stale/src/b.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoped_stale/src/b.py
new file mode 100644
index 0000000..8ba5a92
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoped_stale/src/b.py
@@ -0,0 +1,2 @@
+# justification: shared specific technical reason for retrying
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoping/.python-setup-decisions.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoping/.python-setup-decisions.json
new file mode 100644
index 0000000..4413f51
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoping/.python-setup-decisions.json
@@ -0,0 +1,15 @@
+[
+  {
+    "decision": true,
+    "files": [
+      "src/a.py"
+    ],
+    "justification": "a specific technical reason for retrying",
+    "key": "dk1.7slmqcwz.3uxhtzmb.pcuomhfv.dgqzmwkg.sfqkooqx.mttwjc2o.dv7q",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoping/.python-setup-decisions.lock b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoping/.python-setup-decisions.lock
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoping/src/a.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoping/src/a.py
new file mode 100644
index 0000000..56b78aa
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoping/src/a.py
@@ -0,0 +1,2 @@
+# justification: a specific technical reason for retrying
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoping/tests/test_scope.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoping/tests/test_scope.py
new file mode 100644
index 0000000..b15b1b0
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/scoping/tests/test_scope.py
@@ -0,0 +1 @@
+VALUE = 1
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/.python-setup-decisions.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/.python-setup-decisions.json
new file mode 100644
index 0000000..f4af24f
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/.python-setup-decisions.json
@@ -0,0 +1,28 @@
+[
+  {
+    "decision": true,
+    "files": [
+      "src/app.py"
+    ],
+    "justification": "retry loop must not swallow keyboard interrupt",
+    "key": "dk1.rqe7hoh6.wtubtklk.wdme4ym5.2rmpzejw.r6abbzdo.b73dpz7a.pwxa",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  },
+  {
+    "decision": true,
+    "files": [
+      "src/other.py"
+    ],
+    "justification": "see commit <hex:40> for rationale",
+    "key": "dk1.fdnyhqyj.txdpvuuo.rxj2rr4z.dmoed62p.ks7bw27f.xmruq6bp.7efa",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/.python-setup-decisions.lock b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/.python-setup-decisions.lock
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/negative_control.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/negative_control.json
new file mode 100644
index 0000000..1ca38c3
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/negative_control.json
@@ -0,0 +1,28 @@
+[
+  {
+    "decision": true,
+    "files": [
+      "src/app.py"
+    ],
+    "justification": "retry loop must not swallow keyboard interrupt",
+    "key": "dk1.rqe7hoh6.wtubtklk.wdme4ym5.2rmpzejw.r6abbzdo.b73dpz7a.pwxa",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
+    "rule": "W9704",
+    "version": 1
+  },
+  {
+    "decision": true,
+    "files": [
+      "src/other.py"
+    ],
+    "justification": "see commit <hex:40> for rationale",
+    "key": "dk1.fdnyhqyj.txdpvuuo.rxj2rr4z.dmoed62p.ks7bw27f.xmruq6bp.7efa",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/real_model.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/real_model.json
new file mode 100644
index 0000000..612fddb
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/real_model.json
@@ -0,0 +1,15 @@
+[
+  {
+    "decision": true,
+    "files": [
+      "src/app.py"
+    ],
+    "justification": "retry loop must not swallow keyboard interrupt",
+    "key": "dk1.zjcqch6e.m7z4qlbe.p5gflhxv.x63z7lgf.wta337vd.2lxagukl.af7a",
+    "last_seen": "2026-11-08",
+    "model": "jina-reranker-v2-base-multilingual rev b886a1f9b91f prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/src/app.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/src/app.py
new file mode 100644
index 0000000..1bd8978
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/src/app.py
@@ -0,0 +1,2 @@
+# justification: retry loop must not swallow keyboard interrupt
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/src/other.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/src/other.py
new file mode 100644
index 0000000..1921a30
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/secrets/src/other.py
@@ -0,0 +1,2 @@
+# justification: see commit a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 for rationale
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/__init__.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/__init__.py
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/checkers/__init__.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/checkers/__init__.py
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/checkers/mod.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/checkers/mod.py
new file mode 100644
index 0000000..0aad7e6
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/checkers/mod.py
@@ -0,0 +1,3 @@
+from python_setup_lint.decisions._decision_cache import load
+
+VALUE = load()
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/decisions/__init__.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/decisions/__init__.py
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/decisions/_decision_cache.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/decisions/_decision_cache.py
new file mode 100644
index 0000000..7f99674
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/decisions/_decision_cache.py
@@ -0,0 +1,2 @@
+def load() -> bool:
+    return True
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/decisions/_decision_cache.pyi b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/decisions/_decision_cache.pyi
new file mode 100644
index 0000000..e26cd88
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/decisions/_decision_cache.pyi
@@ -0,0 +1 @@
+def load() -> bool: ...
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/runner/__init__.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/runner/__init__.py
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/runner/mod.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/runner/mod.py
new file mode 100644
index 0000000..0aad7e6
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/src/python_setup_lint/runner/mod.py
@@ -0,0 +1,3 @@
+from python_setup_lint.decisions._decision_cache import load
+
+VALUE = load()
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/tach.toml b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/tach.toml
new file mode 100644
index 0000000..647aa92
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/tach/tach.toml
@@ -0,0 +1,15 @@
+interfaces = []
+exclude = ["**/__pycache__"]
+source_roots = ["src"]
+
+[[modules]]
+path = "python_setup_lint.decisions"
+depends_on = []
+
+[[modules]]
+path = "python_setup_lint.checkers"
+depends_on = ["python_setup_lint.decisions"]
+
+[[modules]]
+path = "python_setup_lint.runner"
+depends_on = ["python_setup_lint.decisions"]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/union/.python-setup-decisions.json b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/union/.python-setup-decisions.json
new file mode 100644
index 0000000..fd08bc1
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/union/.python-setup-decisions.json
@@ -0,0 +1,17 @@
+[
+  {
+    "decision": true,
+    "files": [
+      "src/a.py",
+      "src/b.py",
+      "src/c.py"
+    ],
+    "justification": "retry loop must not swallow keyboard interrupt",
+    "key": "dk1.rqe7hoh6.wtubtklk.wdme4ym5.2rmpzejw.r6abbzdo.b73dpz7a.pwxa",
+    "last_seen": "2026-11-08",
+    "model": "fake-backend rev test prompt-v1",
+    "prompt_hash": "dk1.w7pwqwps.wha4vd4h.qu36v2gp.j3wnj7ry.yelfnocc.phnvns3m.jnhq",
+    "rule": "W9704",
+    "version": 1
+  }
+]
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/union/.python-setup-decisions.lock b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/union/.python-setup-decisions.lock
new file mode 100644
index 0000000..e69de29
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/union/src/a.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/union/src/a.py
new file mode 100644
index 0000000..1bd8978
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/union/src/a.py
@@ -0,0 +1,2 @@
+# justification: retry loop must not swallow keyboard interrupt
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/union/src/b.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/union/src/b.py
new file mode 100644
index 0000000..1bd8978
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/union/src/b.py
@@ -0,0 +1,2 @@
+# justification: retry loop must not swallow keyboard interrupt
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/union/src/c.py b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/union/src/c.py
new file mode 100644
index 0000000..1bd8978
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/poc/tmp/proofs/union/src/c.py
@@ -0,0 +1,2 @@
+# justification: retry loop must not swallow keyboard interrupt
+value = load()  # pylint: disable=W9704
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/decision-cache-design-spike/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..82941a4
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/steps/001-develop-r1-a1/checks.yaml
@@ -0,0 +1,4 @@
+checks:
+  - id: poc-scope
+    status: pass
+    message: "poc-scope satisfied: all changes confined to poc/"
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/decision-cache-design-spike/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..236c612
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/steps/001-develop-r1-a1/input.md
@@ -0,0 +1,57 @@
+# Step: PoC
+
+## Goal
+Implement a confined Proof of Concept (PoC) to validate feasibility, test experimental APIs, or compare technical approaches.
+
+## Rules
+- Strict folder isolation: ALL code, scripts, and temporary artifacts MUST be written inside the item's `poc/` folder (`{orchestrationFolder}/{task}/items/{item}/poc/`).
+- Zero production changes: production codebase paths (`paths.prod` and `paths.tests`) MUST remain completely untouched.
+- Feasibility report: document whether the evaluated approach is viable, what tradeoffs were discovered, and recommendations for permanent implementation.
+- Yield status: report `status: ok` with evidence of execution in `evidence` (array of strings) matching `developer-output.schema.json`.
+- Fix-round re-entry: when `Review Feedback` below is non-empty, address ONLY the listed concerns with targeted follow-up work; do NOT redo the PoC from scratch.
+
+## Assignment
+{
+  "slug": "decision-cache-design-spike",
+  "kind": "poc",
+  "title": "Prototype tracked-cache schema and refresh",
+  "assignment": "Prototype on tmp copies only; zero committed files. Validate the ADR-017 pinned contract (do not invent alternative): project-root = config.cwd with traversal guard; schema + array sort (rule, justification, model) + non-hex encoding (no bare hex>=20, detect-secrets clean, collision-safe); prune auto missing/stale; lint --refresh-decisions [--path ...]; CI-fail; DECISIONS_PATH test-only; files union POSIX; --path scoping; jobs==1 required; decisions-module placement (ADR-018); memory/time notes (2048 RLIMIT_AS, 3 pylint loads, ONNX vs torch). Consume test_pylint_cache_semantics.py writer-first verdict. Completeness gate: report {verdict: feasible|blocked}; feasible carries every field above + 4 tmp proofs (heuristic-rejected False without backend; accepted+hit==persisted; accepted+miss+absent==heuristic True; normal-lint zero writes by hash); blocked carries {blocker, evidence, I5 plan} and impls merge no-op attestations citing it. Feeds backend/cache impls.",
+  "outlineRef": "decision-cache-design-spike",
+  "milestone": "M4",
+  "wave": 1,
+  "scenarioRefs": [
+    "M4: Veto backend without model",
+    "M4: Cache read-only plus explicit refresh"
+  ],
+  "citations": [
+    "src/python_setup_lint/checkers/_semantic.py:37-52",
+    "src/python_setup_lint/checkers/_semantic.py:125-189",
+    "docs/semantic-justification.md:5-14",
+    "docs/semantic-justification.md:34-45",
+    ".gitignore:243-244"
+  ],
+  "escalate": true
+}
+
+## Context
+
+
+## Review Feedback
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+- summary (string, required): Concise summary of implementation actions and test results
+- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+  - Option 1:
+    - selectors (array of string, required)
+    - expectRed (array of string, required, minItems: 1)
+  - Option 2:
+    - gate (string, required)
+  - Option 3:
+    - command (string, required)
+    - customTarget (boolean, required)
+- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
+- notes (string, optional): Optional developer notes, implementation observations, or comments
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/decision-cache-design-spike/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..963531a
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/steps/001-develop-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 1
+name: develop
+attempt: 1
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-09T00:33:14.622Z
+session: 01a1bdb9-4254-76e0-b7f0-9574c6dc4e68
+endedAt: 2026-11-09T00:59:15.327Z
+usage:
+  inputTokens: 226626
+  outputTokens: 115308
+  costUsd: 0.156553
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-09T00-33-17-396Z_01a1bdb9-4254-76e0-b7f0-9574c6dc4e68.jsonl
diff --git a/.factory/tasks/modernize/items/decision-cache-design-spike/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/decision-cache-design-spike/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..d864663
--- /dev/null
+++ b/.factory/tasks/modernize/items/decision-cache-design-spike/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,95 @@
+status: ok
+summary: "PoC complete; verdict=feasible. Prototyped the ADR-017 tracked
+  decision cache and ADR-018 placement entirely in the item's poc folder on tmp
+  copies, with zero production changes. Validated: project root=config.cwd with
+  symlink/parent/absolute/mismatched-root-hint guards; test-only
+  PYTHON_SETUP_LINT_DECISIONS_PATH honored only under PYTEST_CURRENT_TEST;
+  tracked JSON array sorted by (rule, justification, model) with
+  indent=2/sort_keys/trailing newline; dotted-base32 full-SHA-256 key encoding
+  (no bare hex>=20, detect-secrets clean with a full-hex negative control, 25k
+  collision-free probe); union-merged sorted POSIX files; automatic
+  missing/stale-model/stale-prompt prune; --path scoping that retains unscanned
+  entries; lock+merge+atomic replace refresh CLI with CI-fail and jobs==1
+  guards; ADR-018 decisions-module placement accepted by tach while the reverse
+  edge is rejected. All four required proofs pass: heuristic-rejected=False
+  without backend, accepted+hit==persisted, accepted+miss+absent==heuristic
+  True, and normal-lint zero writes by SHA/mtime/file-set. Consumed the
+  writer-first verdict (21 assumption tests pass) and measured 3 real pylint
+  loads under RLIMIT_AS=2048 MB. Machine-readable contract is
+  poc/out/verdict.json; full report is poc/README.md."
+target:
+  command: uv run python
+    .factory/tasks/modernize/items/decision-cache-design-spike/poc/run_proofs.py
+  customTarget: true
+evidence:
+  - "ADR-017/018 PoC verdict=feasible: 26/26 checks pass, 0 failures
+    (poc/out/proofs.json, poc/out/verdict.json)."
+  - "Required proof 1 heuristic-rejected False without backend: decision=False,
+    no-backend decision=False, backend_calls=0, cache_entries=0."
+  - "Required proof 2 accepted+hit==persisted: persisted=False,
+    hit_decision=False, backend_called=False, source=cache-hit."
+  - "Required proof 3 accepted+miss+absent==heuristic True: decision=True,
+    source=heuristic-accept, cache_absent=True."
+  - "Required proof 4 normal-lint zero writes: seeded cache SHA-256, mtime and
+    directory file set unchanged through a hit plus a backend-computed miss;
+    absent cache stayed absent."
+  - "Schema/encoding: sorted (rule, justification, model), indent=2, sort_keys,
+    trailing newline; dotted-base32 full SHA-256 with 25,000-key collision
+    probe; repo .secrets.baseline scan 0 findings, full-hex negative control
+    flagged; no bare hex run >=20."
+  - "Refresh contract: lock + merge + atomic replace; held-lock contention fails
+    without writes; double refresh byte-identical; CI and GITHUB_ACTIONS exit 2
+    with no writes; jobs=0, jobs>1 and rcfile jobs=2 fail noisily;
+    DECISIONS_PATH honored only under PYTEST_CURRENT_TEST; --path scoping
+    retains unscanned and missing unscanned entries."
+  - "ADR-018 placement: tach check legal tree exit 0 (decisions depends_on=[],
+    checkers/runner -> decisions); decisions->checkers negative control exit 1."
+  - "Writer-first verdict consumed: uv run pytest
+    tests/assumptions/test_pylint_cache_semantics.py -q -> 21 passed."
+  - "Regression evidence: uv run pytest -q -> 1378 passed, 4 skipped, 18
+    deselected in 32.45s; targeted semantic tests 158 passed, 4 skipped, 3
+    deselected."
+  - "Memory/time: 3 real pylint loads under RLIMIT_AS=2048 MB -> exit 0, peak
+    RSS 80.08/79.67/62.09 MB, total 3.115 s; torch/onnxruntime absent, sibling
+    model-eval torch peaks 556-2846 MB with GLiDE over the 2048 MB cap; ONNX
+    benchmark deferred to I5."
+  - "Zero production changes: git status/diff show only the untracked poc/
+    folder; src/tests/config/docs/scripts/pyproject clean; ruff on the 7 PoC
+    modules: all checks passed."
+concerns:
+  - The .python-setup-decisions.lock artifact persists after refresh and fcntl
+    locking is POSIX-only; production needs an ignore rule and a non-POSIX
+    fallback.
+  - "last_seen is a UTC date: same-day double runs are byte-identical,
+    cross-midnight runs differ. The refresh clock should be injectable in
+    tests."
+  - Long hex runs in justifications are redacted to <hex:N>; the key is derived
+    from unredacted text so uniqueness is preserved, but stored/displayed
+    justification text differs. A file path containing 20+ hex chars fails
+    refresh loudly.
+  - The cache key is (justification, rule, model); code_context is model input
+    only, so two files can share one verdict and the last sorted observation
+    wins for conflicting decisions.
+  - The PoC jobs guard reads cwd/config rcfiles; production must feed it the
+    three runner-resolved rcfiles, including pyproject overrides and extra-tool
+    args.
+  - ONNX-vs-torch memory was not measured because torch/onnxruntime are absent;
+    model-eval torch peaks range 556-2846 MB and GLiDE exceeds the 2048 MB
+    runner cap. I5 must benchmark the chosen backend inside the pylint
+    subprocess.
+  - Refresh rewrites even when all verdicts are cache hits, and an unsupported
+    schema version fails loudly; a version-migration/prune-old policy is needed
+    before a version bump.
+  - Normal lint is read-only but can still call the backend on cache misses, so
+    up to three lazy model loads may occur per lint run; refresh should
+    prepopulate the cache in CI.
+notes: "Artifacts: poc/README.md (full feasibility report and tradeoffs),
+  poc/out/verdict.json (machine-readable contract), poc/out/proofs.json,
+  poc/out/memory_time.json, poc/out/encoding_lab.json; tmp fixtures under
+  poc/tmp. Reproduce with: uv run python
+  .factory/tasks/modernize/items/decision-cache-design-spike/poc/run_proofs.py
+  && uv run python
+  .factory/tasks/modernize/items/decision-cache-design-spike/poc/measure_memory\
+  _time.py && uv run python
+  .factory/tasks/modernize/items/decision-cache-design-spike/poc/make_verdict.p\
+  y. No production files were modified."

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
