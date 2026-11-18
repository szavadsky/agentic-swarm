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
  "slug": "golden-helpers-unit",
  "kind": "test-only",
  "title": "Golden helpers module with synthetic unit tests",
  "assignment": "Create tests/_golden.py as SOLE golden owner (no pipeline run in this item). Implement: UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN', SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool:str, file:str|None, line:int|None, col:int|None, rule:str}; finding_key(f) None-safe (tool, file or '', line if int else -1, col if int else -1, rule) mirroring _violation_sort_key; normalize_record (drop msg, relativize vs project, strip './', backslash->'/', as_posix, assert non-absolute); serialize via json.dump(indent=2, sort_keys=True)+trailing newline; assert_matches_golden (Counter multiset diff, sorted added/removed; UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if CI/GITHUB_ACTIONS else warn+rewrite golden+counts together); read_oracle_rules, slice_tool_section, assert_oracle_coverage, assert_tool_coverage. Consume golden-determinism-probe report normalization spec. Add tests/test_golden.py with synthetic Finding lists ONLY (no run_lint, no pipeline): finding_key None vs str/int ordering, POSIX normalization, multiset diff exact added/removed, CI-guard fail, coverage asserts, serialization byte-format. Constraints: no src/ changes, no golden files yet, module <=500 lines, formatted. Acceptance: `uv run pytest tests/test_golden.py -q` passes.",
  "outlineRef": "golden-helpers-unit",
  "milestone": "M1",
  "wave": 6,
  "deps": [
    "golden-determinism-probe"
  ],
  "scenarioRefs": [
    "M1: Golden snapshot pins current behavior",
    "M1: Behavior drift is reported precisely",
    "M1: Deterministic regeneration"
  ],
  "citations": [
    "tests/_golden.py",
    "tests/test_golden.py",
    "ADR-001"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/golden-helpers-unit/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/modernize/items/golden-helpers-unit/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..917d9d1
--- /dev/null
+++ b/.factory/tasks/modernize/items/golden-helpers-unit/steps/001-develop-r1-a1/checks.yaml
@@ -0,0 +1,157 @@
+checks:
+  - id: gates
+    status: pass
+    message: Gates passed (4 gates)
+    details:
+      - id: format
+        command: uv run ruff format --check --config config/ruff.toml src tests
+        status: pass
+        durationMs: 343
+        details: 179 files already formatted
+      - id: lint
+        command: uv run lint --tools 'tach check,ruff check,rumdl check,mypy,yamllint,ty
+          check,mypy.stubtest,pyright check,pyright verify
+          types,pylint,pylint-pyi,pylint tests,detect-secrets'
+        status: fail
+        durationMs: 176325
+        details: |-
+          ============================================================
+          [tach check] PASSED [0.2s]
+          ============================================================
+          Configuration
+          [WARN] Warning: No first-party imports were found. You may need to use 'tach mod' to update your Python source roots. Docs: https://docs.gauge.sh/usage/configuration#source-roots
+          ✅ All modules validated!
+
+          ============================================================
+          [ruff check] FAILED (exit=1) [0.0s]
+          ============================================================
+          src/python_setup_lint/checkers/stub/coverage.py:196:5: SIM102 Use a single `if` statement instead of nested `if` statements
+          Found 1 error.
+          No fixes available (1 hidden fix can be enabled with the `--unsafe-fixes` option).
+
+          ============================================================
+          [rumdl check] PASSED [0.0s]
+          ============================================================
+
+          Success: No issues found in 16 files (12ms)
+
+          ============================================================
+          [mypy] PASSED [4.6s]
+          ============================================================
+          Success: no issues found in 56 source files
+
+          ============================================================
+          [yamllint] PASSED [0.1s]
+          ============================================================
+
+          =================================================
+          ... [truncated 1977 bytes] ...
+
+          ============================================================
+          [pylint-pyi] FAILED (exit=8) [15.8s]
+          ============================================================
+          ************* Module python_setup_lint.runner.cli
+          src/python_setup_lint/runner/cli.py:50:0: R0914: Too many local variables (23/20) (too-many-locals)
+
+          --------------------------------------------------------------------
+          Your code has been rated at 10.00/10 (previous run: 10.00/10, +0.00)
+
+
+          ============================================================
+          [pylint tests] FAILED (exit=16) [13.2s]
+          ============================================================
+          {
+              "messages": [
+                  {
+                      "type": "convention",
+                      "symbol": "use-sequence-for-iteration",
+                      "message": "Use a sequence type when iterating over values",
+                      "messageId": "C0208",
+                      "confidence": "HIGH",
+                      "module": "tests.runner._factories_extras",
+                      "obj": "<lambda>",
+                      "line": 383,
+                      "column": 82,
+                      "endLine": 383,
+                      "endColumn": 123,
+                      "path": "tests/runner/_factories_extras.py",
+                      "absolutePath": "/home/slava/aiexp/python-setup.factory-wt/topic_modernize--golden-helpers-unit/tests/runner/_factories_extras.py"
+                  }
+              ],
+              "statistics": {
+                  "messageTypeCount": {
+                      "fatal": 0,
+                      "error": 0,
+                      "warning": 0,
+                      "refactor": 0,
+                      "convention": 1,
+                      "info": 0
+                  },
+                  "modulesLinted": 73,
+                  "score": 9.998396922090414
+              }
+          }
+
+          ============================================================
+          [detect-secrets] FAILED (exit=123) [19.8s]
+          ============================================================
+          ERROR: Potential secrets about to be committed to git repo!
+
+          Secret Type: Hex High Entropy String
+          Location:    .factory/tasks/modernize/journal.ndjson:81
+
+          Secret Type: Hex High Entropy String
+          Location:    .factory/tasks/modernize/journal.ndjson:83
+
+          Possible mitigations:
+            - For information about putting your secrets in a safer place, please ask in
+              #security
+            - Mark false positives with an inline `pragma: allowlist secret` comment
+
+          If a secret has already been committed, visit
+          https://help.github.com/articles/removing-sensitive-data-from-a-repository
+
+          [pylint] Using rcfile: /home/slava/aiexp/python-setup.factory-wt/topic_modernize--golden-helpers-unit/config/.pylintrc
+      - id: test
+        command: uv run pytest -q
+        status: pass
+        durationMs: 63446
+        details: |-
+          [Tach] 1362 tests in 58 files unaffected by changes (~25.4s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          ........................................................................ [  5%]
+          ........................................................................ [ 10%]
+          ......................................................................ss [ 16%]
+          ss...................................................................... [ 21%]
+          ........................................................................ [ 26%]
+          ........................................................................ [ 32%]
+          ........................................................................ [ 37%]
+          ........................................................................ [ 42%]
+          ........................................................................ [ 48%]
+          ........................................................................ [ 53%]
+          ........................................................................ [ 58%]
+          ...................................................................FF... [ 64%]
+          ........................................................................ [ 69%]
+          ......................................................................F. [ 75%]
+          ..
+          ... [truncated 17157 bytes] ...
+          6 failed, 1334 passed, 4 skipped, 18 deselected, 4 warnings in 28.39s
+        failingTests:
+          - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_known_tools_then_present
+          - tests.runner.test_lint_runner.TestToolSpec.test_tool_spec_given_tools_then_autofix_and_no_duplicates
+          - tests.runner.test_lint_runner_stats.test_statistics_parsers_given_all_tools_then_covered
+          - tests.runner.test_t3_coverage.TestParserCompleteness.test_parser_completeness_given_all_tools_then_have_parser
+          - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched]
+          - tests.runner.test_testing_fakes.test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]
+      - id: test-integration
+        command: uv run pytest tests/integration.py -q
+        status: pass
+        durationMs: 45538
+        details: |-
+          [Tach] 9 tests in 4 files unaffected by changes (~0.1s could be saved). Skip with: pytest --tach
+          [Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)
+          .........                                                                [100%]
+          9 passed in 44.22s
+  - id: tests-only
+    status: pass
+    message: tests-only passed (2 test files changed)
diff --git a/.factory/tasks/modernize/items/golden-helpers-unit/steps/001-develop-r1-a1/input.md b/.factory/tasks/modernize/items/golden-helpers-unit/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..b55adcd
--- /dev/null
+++ b/.factory/tasks/modernize/items/golden-helpers-unit/steps/001-develop-r1-a1/input.md
@@ -0,0 +1,65 @@
+# Step: Develop
+
+## Goal
+Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
+
+## Rules
+- Target green: every test selector and case identified in `target` MUST pass cleanly.
+- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
+- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
+- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
+- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
+
+## Assignment
+{
+  "slug": "golden-helpers-unit",
+  "kind": "test-only",
+  "title": "Golden helpers module with synthetic unit tests",
+  "assignment": "Create tests/_golden.py as SOLE golden owner (no pipeline run in this item). Implement: UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN', SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool:str, file:str|None, line:int|None, col:int|None, rule:str}; finding_key(f) None-safe (tool, file or '', line if int else -1, col if int else -1, rule) mirroring _violation_sort_key; normalize_record (drop msg, relativize vs project, strip './', backslash->'/', as_posix, assert non-absolute); serialize via json.dump(indent=2, sort_keys=True)+trailing newline; assert_matches_golden (Counter multiset diff, sorted added/removed; UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if CI/GITHUB_ACTIONS else warn+rewrite golden+counts together); read_oracle_rules, slice_tool_section, assert_oracle_coverage, assert_tool_coverage. Consume golden-determinism-probe report normalization spec. Add tests/test_golden.py with synthetic Finding lists ONLY (no run_lint, no pipeline): finding_key None vs str/int ordering, POSIX normalization, multiset diff exact added/removed, CI-guard fail, coverage asserts, serialization byte-format. Constraints: no src/ changes, no golden files yet, module <=500 lines, formatted. Acceptance: `uv run pytest tests/test_golden.py -q` passes.",
+  "outlineRef": "golden-helpers-unit",
+  "milestone": "M1",
+  "wave": 6,
+  "deps": [
+    "golden-determinism-probe"
+  ],
+  "scenarioRefs": [
+    "M1: Golden snapshot pins current behavior",
+    "M1: Behavior drift is reported precisely",
+    "M1: Deterministic regeneration"
+  ],
+  "citations": [
+    "tests/_golden.py",
+    "tests/test_golden.py",
+    "ADR-001"
+  ]
+}
+
+## Target
+tests
+
+## Context & Citations
+[
+  "tests/_golden.py",
+  "tests/test_golden.py",
+  "ADR-001"
+]
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
diff --git a/.factory/tasks/modernize/items/golden-helpers-unit/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/modernize/items/golden-helpers-unit/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..d5dc603
--- /dev/null
+++ b/.factory/tasks/modernize/items/golden-helpers-unit/steps/001-develop-r1-a1/meta.yaml
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
+timeoutSec: 1200
+status: ok
+startedAt: 2026-11-08T04:53:49.274Z
+session: 01a1b981-6e43-7214-bb58-6da1ac694e56
+endedAt: 2026-11-08T05:06:47.754Z
+usage:
+  inputTokens: 102897
+  outputTokens: 45995
+  costUsd: 0.049907
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T04-53-49-763Z_01a1b981-6e43-7214-bb58-6da1ac694e56.jsonl
diff --git a/.factory/tasks/modernize/items/golden-helpers-unit/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/modernize/items/golden-helpers-unit/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..708be94
--- /dev/null
+++ b/.factory/tasks/modernize/items/golden-helpers-unit/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,39 @@
+status: ok
+summary: Created tests/_golden.py as the sole golden-snapshot owner (env
+  constants, Finding TypedDict, None-safe finding_key mirroring
+  _violation_sort_key, POSIX/relative normalize_record with msg drop, canonical
+  sorting/serialization with indent=2/sort_keys/trailing newline, tool counts,
+  multiset-diff assert_matches_golden with CI-guarded UPDATE regeneration,
+  oracle-rule and per-tool coverage asserts, tool-section slicing) and
+  tests/test_golden.py with 26 synthetic unit tests (no run_lint/pipeline). No
+  src changes and no golden artifacts added.
+target:
+  command: uv run pytest tests/test_golden.py -q
+  customTarget: true
+evidence:
+  - "`uv run pytest tests/test_golden.py -q` -> 26 passed in 0.14s."
+  - "`uv run ruff format --check --config config/ruff.toml tests/_golden.py
+    tests/test_golden.py` -> 2 files already formatted."
+  - "`uv run ruff check --config config/ruff.toml tests/_golden.py
+    tests/test_golden.py` -> All checks passed."
+  - "`PYTHONPATH=src uv run pylint --rcfile=config/.pylintrc-tests
+    tests/_golden.py tests/test_golden.py` -> 0 messages, score 10.0."
+  - "`uv run tach check` -> All modules validated (exit 0)."
+  - "`uv run pytest -q` -> 1334 passed, 4 skipped, 26 new golden tests included;
+    6 failures are the documented pre-existing 13-vs-14 tool-count failures
+    (ruff format) unrelated to this test-only change."
+  - "`wc -l` -> tests/_golden.py 313 lines, tests/test_golden.py 341 lines (both
+    under the 500-line cap)."
+  - "`git status --porcelain` -> only ?? tests/_golden.py and ??
+    tests/test_golden.py; no src/ edits and no tests/data/golden files."
+concerns:
+  - Full-suite `uv run pytest -q` still reports the six pre-existing 13-vs-14
+    tool-count failures (ruff format) documented in the task context; they are
+    untouched by this test-only item.
+  - "`collect_findings` (run_lint capture) is intentionally deferred to the
+    golden-snapshot-wiring item, and no pipeline code is present or executed
+    here."
+notes: Counts file naming maps `*_findings.json` to `*_tool_counts.json`;
+  tool_minimums includes every registered TOOLS entry with zero for uncaptured
+  tools so downstream coverage checks see the full tool set. UPDATE regeneration
+  writes golden and counts together and refuses under CI/GITHUB_ACTIONS.
diff --git a/tests/_golden.py b/tests/_golden.py
new file mode 100644
index 0000000..91e20b8
--- /dev/null
+++ b/tests/_golden.py
@@ -0,0 +1,313 @@
+"""Sole owner of the lint golden snapshot: normalization, serialization, assertions.
+
+The golden payload is a sorted ``Finding`` array.  A ``Finding`` is one lint
+record reduced to ``(tool, file, line, col, rule)``: the volatile ``msg`` field
+is dropped and file paths are normalized to relative POSIX form.  Comparison is
+a multiset (``Counter``) diff, so duplicates, moved lines, new false positives
+and dropped findings all fail precisely.
+
+Regeneration is opt-in via ``PYTHON_SETUP_LINT_UPDATE_GOLDEN=1`` and is refused
+under CI.  Regeneration rewrites the golden and its per-tool minimum counts
+together so the two artifacts can never disagree.
+"""
+
+from __future__ import annotations
+
+import json
+import os
+import warnings
+from collections import Counter
+from collections.abc import Iterable, Mapping, Sequence
+from pathlib import Path, PurePosixPath
+from typing import TypedDict
+
+import pytest
+
+__all__ = [
+    "SEMANTIC_ENV",
+    "UPDATE_ENV",
+    "Finding",
+    "assert_matches_golden",
+    "assert_oracle_coverage",
+    "assert_tool_coverage",
+    "finding_key",
+    "normalize_record",
+    "read_golden",
+    "read_oracle_rules",
+    "serialize_findings",
+    "serialize_tool_minimums",
+    "slice_tool_section",
+    "tool_counts_path",
+    "tool_minimums",
+    "write_golden_files",
+]
+
+UPDATE_ENV = "PYTHON_SETUP_LINT_UPDATE_GOLDEN"
+SEMANTIC_ENV = "PYTHON_SETUP_LINT_SEMANTIC"
+
+_ORACLE_RULES_PATH = Path(__file__).resolve().parent / "data" / "minimal_sample_project" / "violations.txt"
+
+
+class Finding(TypedDict):
+    """One normalized finding pinned by the golden snapshot."""
+
+    tool: str
+    file: str | None
+    line: int | None
+    col: int | None
+    rule: str
+
+
+FindingKey = tuple[str, str, int, int, str]
+
+
+def finding_key(finding: Finding) -> FindingKey:
+    """Return the None-safe sort/diff key for *finding*.
+
+    Mirrors ``runner.baseline._violation_sort_key``: a ``None`` file sorts as
+    ``""`` and ``None`` line/col sort as ``-1``.
+
+    Returns:
+        A ``(tool, file, line, col, rule)`` tuple.
+    """
+    return (
+        finding["tool"],
+        finding["file"] or "",
+        finding["line"] if isinstance(finding["line"], int) else -1,
+        finding["col"] if isinstance(finding["col"], int) else -1,
+        finding["rule"],
+    )
+
+
+def _normalize_path(value: object, project: Path) -> str | None:
+    """Return *value* as a project-relative POSIX path (``None`` passes through)."""
+    if value is None:
+        return None
+    if not isinstance(value, str):
+        raise TypeError(f"expected file path str or None, got {type(value).__name__}")
+    posix = PurePosixPath(value.replace("\\", "/"))
+    if posix.is_absolute():
+        try:
+            posix = posix.relative_to(PurePosixPath(project.as_posix()))
+        except ValueError as exc:
+            raise AssertionError(f"absolute finding path outside project: {value!r}") from exc
+    parts = tuple(part for part in posix.parts if part not in (".", ""))
+    if not parts:
+        return ""
+    out = PurePosixPath(*parts).as_posix()
+    assert not PurePosixPath(out).is_absolute(), f"expected a relative POSIX path, got {out!r}"
+    return out
+
+
+def normalize_record(record: Mapping[str, object], project: Path) -> Finding:
+    """Reduce one capture record to a golden ``Finding``.
+
+    Drops ``msg``, relativizes absolute file paths against *project*, strips
+    ``./``, converts backslashes to ``/`` and returns a POSIX path.
+
+    Args:
+        record: Capture record with ``tool``, ``file``, ``line``, ``col``,
+            ``rule`` (and possibly ``msg``) keys.
+        project: Project root absolute paths are relativized against.
+
+    Returns:
+        A ``Finding`` with exactly the five golden keys.
+    """
+    tool = record.get("tool")
+    rule = record.get("rule")
+    if not isinstance(tool, str) or not isinstance(rule, str):
+        raise TypeError(f"record tool/rule must be strings, got tool={tool!r} rule={rule!r}")
+    line = record.get("line")
+    col = record.get("col")
+    if line is not None and not isinstance(line, int):
+        raise TypeError(f"record line must be int or None, got {line!r}")
+    if col is not None and not isinstance(col, int):
+        raise TypeError(f"record col must be int or None, got {col!r}")
+    return Finding(
+        tool=tool,
+        file=_normalize_path(record.get("file"), project),
+        line=line,
+        col=col,
+        rule=rule,
+    )
+
+
+def _finding_row(finding: Finding) -> dict[str, object]:
+    """Project a finding onto the five golden fields (dropping any extras)."""
+    return {
+        "tool": finding["tool"],
+        "file": finding["file"],
+        "line": finding["line"],
+        "col": finding["col"],
+        "rule": finding["rule"],
+    }
+
+
+def serialize_findings(findings: Iterable[Finding]) -> str:
+    """Serialize findings as canonical JSON text: sorted, indent=2, trailing newline.
+
+    Returns:
+        The JSON text with ``sort_keys=True`` and exactly one trailing newline.
+    """
+    rows = [_finding_row(finding) for finding in sorted(findings, key=finding_key)]
+    return json.dumps(rows, indent=2, sort_keys=True) + "\n"
+
+
+def serialize_tool_minimums(minimums: Mapping[str, int]) -> str:
+    """Serialize per-tool minimum counts with the same canonical JSON format.
+
+    Returns:
+        The JSON text with ``sort_keys=True`` and exactly one trailing newline.
+    """
+    return json.dumps(dict(minimums), indent=2, sort_keys=True) + "\n"
+
+
+def tool_minimums(findings: Iterable[Finding]) -> dict[str, int]:
+    """Return ``{tool: min_count}`` covering every registered tool.
+
+    Tools with no captured findings get a minimum of ``0``; their coverage
+    remains guarded by the first-run tool-section assertions.
+
+    Returns:
+        Sorted ``{tool_name: observed_finding_count}`` mapping.
+    """
+    from python_setup_lint.runner import TOOLS  # local import keeps synthetic tests free of runner setup
+
+    counts = Counter(finding["tool"] for finding in findings)
+    names = {spec.name for spec in TOOLS} | set(counts)
+    return {name: counts.get(name, 0) for name in sorted(names)}
+
+
+def tool_counts_path(golden_path: Path) -> Path:
+    """Return the sibling counts path for *golden_path*.
+
+    ``..._findings.json`` maps to ``..._tool_counts.json``; any other name gets
+    a ``_tool_counts.json`` suffix.
+
+    Returns:
+        Sibling path for the per-tool minimum counts artifact.
+    """
+    base = golden_path.name.removesuffix("_findings.json") if golden_path.name.endswith("_findings.json") else golden_path.stem
+    return golden_path.with_name(f"{base}_tool_counts.json")
+
+
+def write_golden_files(golden_path: Path, findings: Iterable[Finding]) -> None:
+    """Write the golden and its per-tool counts together.
+
+    Both files use the canonical JSON serialization so repeated runs are
+    byte-identical.
+    """
+    materialized = list(findings)
+    golden_path.parent.mkdir(parents=True, exist_ok=True)
+    golden_path.write_text(serialize_findings(materialized), encoding="utf-8")
+    counts_path = tool_counts_path(golden_path)
+    counts_path.write_text(serialize_tool_minimums(tool_minimums(materialized)), encoding="utf-8")
+
+
+def _coerce_finding(value: object, golden_path: Path) -> Finding:
+    """Validate one JSON element read from a golden file."""
+    if not isinstance(value, Mapping):
+        pytest.fail(f"golden entry must be a JSON object in {golden_path}: {value!r}")
+    tool = value.get("tool")
+    file = value.get("file")
+    line = value.get("line")
+    col = value.get("col")
+    rule = value.get("rule")
+    if not isinstance(tool, str) or not isinstance(rule, str):
+        pytest.fail(f"golden entry must have string tool/rule in {golden_path}: {value!r}")
+    if file is not None and not isinstance(file, str):
+        pytest.fail(f"golden entry must have str/None file in {golden_path}: {value!r}")
+    if line is not None and not isinstance(line, int):
+        pytest.fail(f"golden entry must have int/None line in {golden_path}: {value!r}")
+    if col is not None and not isinstance(col, int):
+        pytest.fail(f"golden entry must have int/None col in {golden_path}: {value!r}")
+    return Finding(tool=tool, file=file, line=line, col=col, rule=rule)
+
+
+def read_golden(golden_path: Path) -> list[Finding]:
+    """Read and validate a committed golden file.
+
+    Returns:
+        The golden findings in file order.
+    """
+    if not golden_path.is_file():
+        pytest.fail(f"golden file not found: {golden_path}; run with {UPDATE_ENV}=1 to create it")
+    raw: object = json.loads(golden_path.read_text(encoding="utf-8"))
+    if not isinstance(raw, list):
+        pytest.fail(f"golden file must contain a JSON array: {golden_path}")
+    return [_coerce_finding(entry, golden_path) for entry in raw]
+
+
+def _diff_keys(actual: Sequence[Finding], golden: Sequence[Finding]) -> tuple[list[FindingKey], list[FindingKey]]:
+    """Return sorted ``(added, removed)`` key lists for the two multisets."""
+    actual_counts = Counter(finding_key(finding) for finding in actual)
+    golden_counts = Counter(finding_key(finding) for finding in golden)
+    added = sorted((actual_counts - golden_counts).elements())
+    removed = sorted((golden_counts - actual_counts).elements())
+    return added, removed
+
+
+def _format_drift(added: Sequence[FindingKey], removed: Sequence[FindingKey], golden_path: Path) -> str:
+    """Build the failure message naming every added and removed key."""
+    lines = [f"golden mismatch for {golden_path}"]
+    if added:
+        lines.append(f"added ({len(added)}):")
+        lines.extend(f"  {key!r}" for key in added)
+    if removed:
+        lines.append(f"removed ({len(removed)}):")
+        lines.extend(f"  {key!r}" for key in removed)
+    return "\n".join(lines)
+
+
+def assert_matches_golden(findings: Sequence[Finding], *, golden_path: Path) -> None:
+    """Assert *findings* equal the committed golden as a multiset.
+
+    With ``PYTHON_SETUP_LINT_UPDATE_GOLDEN=1`` this rewrites the golden and its
+    counts instead of comparing.  Under CI it fails rather than rewriting.
+    """
+    if os.environ.get(UPDATE_ENV) == "1":
+        if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
+            pytest.fail(f"refusing to rewrite golden under CI; unset {UPDATE_ENV} or run locally to regenerate {golden_path}")
+        warnings.warn(f"updating golden files for {golden_path}", stacklevel=2)
+        write_golden_files(golden_path, findings)
+        return
+    committed = read_golden(golden_path)
+    added, removed = _diff_keys(findings, committed)
+    if added or removed:
+        pytest.fail(_format_drift(added, removed, golden_path))
+
+
+def read_oracle_rules() -> list[str]:
+    """Read planted violation rule names from the retained ``violations.txt`` oracle.
+
+    Returns:
+        Non-comment, non-blank rule symbols in file order.
+    """
+    lines = _ORACLE_RULES_PATH.read_text(encoding="utf-8").splitlines()
+    return [stripped for line in lines if (stripped := line.strip()) and not stripped.startswith("#")]
+
+
+def slice_tool_section(output: str, start: str, end: str) -> str:
+    """Return the text from *start* (inclusive) up to *end* (exclusive).
+
+    Both markers are literal strings; *end* is searched only after *start*.
+    """
+    begin = output.find(start)
+    assert begin != -1, f"section start marker not found: {start!r}"
+    finish = output.find(end, begin + len(start))
+    assert finish != -1, f"section end marker not found after {start!r}: {end!r}"
+    return output[begin:finish]
+
+
+def assert_oracle_coverage(findings: Iterable[Finding], rules: Iterable[str]) -> None:
+    """Assert every oracle rule appears among *findings*."""
+    present = {finding["rule"] for finding in findings}
+    missing = sorted(set(rules) - present)
+    assert not missing, f"oracle rules missing from golden findings: {missing}"
+
+
+def assert_tool_coverage(findings: Iterable[Finding], minimums: Mapping[str, int]) -> None:
+    """Assert each tool in *minimums* produced at least its minimum finding count."""
+    counts = Counter(finding["tool"] for finding in findings)
+    below = [(tool, minimums[tool], counts.get(tool, 0)) for tool in sorted(minimums) if counts.get(tool, 0) < minimums[tool]]
+    assert not below, f"tool finding counts below minimum: {below}"
diff --git a/tests/test_golden.py b/tests/test_golden.py
new file mode 100644
index 0000000..a6c067f
--- /dev/null
+++ b/tests/test_golden.py
@@ -0,0 +1,341 @@
+"""Synthetic unit tests for the golden snapshot helpers.
+
+No lint pipeline runs here: every ``Finding`` list is built in memory and every
+file is a ``tmp_path`` artifact.
+"""
+
+from __future__ import annotations
+
+import json
+from pathlib import Path
+
+import pytest
+
+from tests._golden import (
+    SEMANTIC_ENV,
+    UPDATE_ENV,
+    Finding,
+    assert_matches_golden,
+    assert_oracle_coverage,
+    assert_tool_coverage,
+    finding_key,
+    normalize_record,
+    read_oracle_rules,
+    serialize_findings,
+    serialize_tool_minimums,
+    slice_tool_section,
+    tool_counts_path,
+    tool_minimums,
+    write_golden_files,
+)
+
+
+@pytest.fixture(autouse=True)
+def _isolate_golden_env(monkeypatch: pytest.MonkeyPatch) -> None:
+    """Keep host CI/update environment from influencing assertions."""
+    monkeypatch.delenv(UPDATE_ENV, raising=False)
+    monkeypatch.delenv("CI", raising=False)
+    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
+
+
+def _finding(
+    tool: str = "ruff check",
+    file: str | None = "src/mod.py",
+    line: int | None = 1,
+    col: int | None = 1,
+    rule: str = "F401",
+) -> Finding:
+    return {
+        "tool": tool,
+        "file": file,
+        "line": line,
+        "col": col,
+        "rule": rule,
+    }
+
+
+def test_constants_expose_contract_env_names() -> None:
+    assert UPDATE_ENV == "PYTHON_SETUP_LINT_UPDATE_GOLDEN"
+    assert SEMANTIC_ENV == "PYTHON_SETUP_LINT_SEMANTIC"
+
+
+def test_finding_key_given_none_fields_then_sorts_before_strings_and_numbers() -> None:
+    none_key = finding_key(_finding(file=None, line=None, col=None))
+    empty_key = finding_key(_finding(file="", line=-1, col=-1))
+    zero_key = finding_key(_finding(file="a.py", line=0, col=0))
+
+    assert none_key == ("ruff check", "", -1, -1, "F401")
+    assert none_key == empty_key
+    assert none_key < zero_key
+
+
+def test_finding_key_given_mixed_files_then_full_none_safe_order() -> None:
+    findings = [
+        _finding(file="b.py", line=2, col=1),
+        _finding(file=None, line=None, col=None),
+        _finding(file="a.py", line=0, col=0),
+        _finding(file="a.py", line=None, col=None),
+    ]
+
+    ordered = sorted(findings, key=finding_key)
+
+    assert [(finding["file"], finding["line"]) for finding in ordered] == [
+        (None, None),
+        ("a.py", None),
+        ("a.py", 0),
+        ("b.py", 2),
+    ]
+
+
+def test_normalize_record_given_relative_backslash_path_then_posix(tmp_path: Path) -> None:
+    record = {
+        "tool": "ruff check",
+        "file": "./src\\pkg\\mod.py",
+        "line": 3,
+        "col": 7,
+        "rule": "F401",
+        "msg": "unused import",
+    }
+
+    result = normalize_record(record, tmp_path / "project")
+
+    assert result == {
+        "tool": "ruff check",
+        "file": "src/pkg/mod.py",
+        "line": 3,
+        "col": 7,
+        "rule": "F401",
+    }
+    assert "msg" not in result
+
+
+def test_normalize_record_given_absolute_path_then_relativized(tmp_path: Path) -> None:
+    project = tmp_path / "project"
+    record = {
+        "tool": "pyright check",
+        "file": str(project / "src" / "mod.py"),
+        "line": 4,
+        "col": 2,
+        "rule": "reportMissingImports",
+    }
+
+    result = normalize_record(record, project)
+
+    assert result["file"] == "src/mod.py"
+
+
+def test_normalize_record_given_none_fields_then_preserved(tmp_path: Path) -> None:
+    record = {"tool": "pylint", "file": None, "line": None, "col": None, "rule": "R0801"}
+
+    result = normalize_record(record, tmp_path)
+
+    assert result == {"tool": "pylint", "file": None, "line": None, "col": None, "rule": "R0801"}
+
+
+def test_normalize_record_given_absolute_outside_project_then_asserts(tmp_path: Path) -> None:
+    record = {
+        "tool": "pyright check",
+        "file": str(tmp_path / "elsewhere" / "mod.py"),
+        "line": 1,
+        "col": 1,
+        "rule": "reportMissingImports",
+    }
+
+    with pytest.raises(AssertionError, match="outside project"):
+        normalize_record(record, tmp_path / "project")
+
+
+def test_serialize_findings_given_unsorted_then_sorted_canonical_json() -> None:
+    findings = [
+        _finding(tool="z", file="b.py", line=2, rule="R2"),
+        _finding(tool="a", file="a.py", line=1, rule="R1"),
+    ]
+
+    text = serialize_findings(findings)
+
+    expected_rows = [
+        {
+            "tool": finding["tool"],
+            "file": finding["file"],
+            "line": finding["line"],
+            "col": finding["col"],
+            "rule": finding["rule"],
+        }
+        for finding in sorted(findings, key=finding_key)
+    ]
+    assert text == json.dumps(expected_rows, indent=2, sort_keys=True) + "\n"
+    assert text.endswith("]\n")
+    assert not text.endswith("\n\n")
+    assert text.index('"col"') < text.index('"file"') < text.index('"line"') < text.index('"rule"') < text.index('"tool"')
+
+
+def test_serialize_tool_minimums_given_mapping_then_sorted_canonical_json() -> None:
+    text = serialize_tool_minimums({"ruff check": 2, "mypy": 1})
+
+    assert text == json.dumps({"ruff check": 2, "mypy": 1}, indent=2, sort_keys=True) + "\n"
+    assert text.index('"mypy"') < text.index('"ruff check"')
+
+
+def test_tool_counts_path_given_findings_name_then_sibling_tool_counts() -> None:
+    assert tool_counts_path(Path("/x/minimal_sample_project_findings.json")) == Path("/x/minimal_sample_project_tool_counts.json")
+    assert tool_counts_path(Path("/x/snapshot.json")) == Path("/x/snapshot_tool_counts.json")
+
+
+def test_assert_matches_golden_given_identical_multiset_then_passes(tmp_path: Path) -> None:
+    golden = tmp_path / "minimal_sample_project_findings.json"
+    findings = [_finding(rule="R1"), _finding(rule="R2", line=2)]
+    write_golden_files(golden, findings)
+
+    assert_matches_golden(list(reversed(findings)), golden_path=golden)
+
+
+def test_assert_matches_golden_given_missing_golden_then_fails_with_update_hint(tmp_path: Path) -> None:
+    golden = tmp_path / "missing_findings.json"
+
+    with pytest.raises(pytest.fail.Exception, match=UPDATE_ENV):
+        assert_matches_golden([_finding()], golden_path=golden)
+
+
+def test_assert_matches_golden_given_dropped_finding_then_reports_removed_key(tmp_path: Path) -> None:
+    golden = tmp_path / "minimal_sample_project_findings.json"
+    kept = _finding(rule="R1")
+    dropped = _finding(rule="R2", line=2)
+    write_golden_files(golden, [kept, dropped])
+
+    with pytest.raises(pytest.fail.Exception) as excinfo:
+        assert_matches_golden([kept], golden_path=golden)
+
+    message = str(excinfo.value)
+    assert "removed (1):" in message
+    assert repr(finding_key(dropped)) in message
+    assert "added" not in message
+
+
+def test_assert_matches_golden_given_extra_findings_then_reports_sorted_added_keys(tmp_path: Path) -> None:
+    golden = tmp_path / "minimal_sample_project_findings.json"
+    write_golden_files(golden, [_finding(rule="BASE")])
+    added_b = _finding(rule="B", line=2)
+    added_a = _finding(rule="A", line=1)
+
+    with pytest.raises(pytest.fail.Exception) as excinfo:
+        assert_matches_golden([_finding(rule="BASE"), added_b, added_a], golden_path=golden)
+
+    message = str(excinfo.value)
+    assert "added (2):" in message
+    assert "removed" not in message
+    assert message.index(repr(finding_key(added_a))) < message.index(repr(finding_key(added_b)))
+
+
+def test_assert_matches_golden_given_duplicate_golden_entry_then_reports_one_removed(tmp_path: Path) -> None:
+    golden = tmp_path / "minimal_sample_project_findings.json"
+    duplicate = _finding(rule="DUP")
+    write_golden_files(golden, [duplicate, duplicate])
+
+    with pytest.raises(pytest.fail.Exception) as excinfo:
+        assert_matches_golden([duplicate], golden_path=golden)
+
+    message = str(excinfo.value)
+    assert "removed (1):" in message
+    assert message.count(repr(finding_key(duplicate))) == 1
+
+
+@pytest.mark.parametrize("ci_var", ["CI", "GITHUB_ACTIONS"])
+def test_assert_matches_golden_given_update_under_ci_then_refuses_and_keeps_golden(
+    tmp_path: Path,
+    monkeypatch: pytest.MonkeyPatch,
+    ci_var: str,
+) -> None:
+    golden = tmp_path / "minimal_sample_project_findings.json"
+    write_golden_files(golden, [_finding(rule="R1")])
+    before = golden.read_bytes()
+    counts_before = tool_counts_path(golden).read_bytes()
+    monkeypatch.setenv(UPDATE_ENV, "1")
+    monkeypatch.setenv(ci_var, "true")
+
+    with pytest.raises(pytest.fail.Exception, match="refusing to rewrite golden under CI"):
+        assert_matches_golden([_finding(rule="CHANGED")], golden_path=golden)
+
+    assert golden.read_bytes() == before
+    assert tool_counts_path(golden).read_bytes() == counts_before
+
+
+def test_assert_matches_golden_given_update_locally_then_rewrites_both_byte_identically(
+    tmp_path: Path,
+    monkeypatch: pytest.MonkeyPatch,
+) -> None:
+    golden = tmp_path / "minimal_sample_project_findings.json"
+    findings = [_finding(rule="R2", line=2), _finding(rule="R1")]
+    monkeypatch.setenv(UPDATE_ENV, "1")
+
+    with pytest.warns(UserWarning, match="updating golden"):
+        assert_matches_golden(findings, golden_path=golden)
+
+    counts_path = tool_counts_path(golden)
+    assert golden.read_text(encoding="utf-8") == serialize_findings(findings)
+    assert counts_path.read_text(encoding="utf-8") == serialize_tool_minimums(tool_minimums(findings))
+    first_golden = golden.read_bytes()
+    first_counts = counts_path.read_bytes()
+
+    with pytest.warns(UserWarning, match="updating golden"):
+        assert_matches_golden(list(reversed(findings)), golden_path=golden)
+
+    assert golden.read_bytes() == first_golden
+    assert counts_path.read_bytes() == first_counts
+
+
+def test_read_oracle_rules_given_violations_file_then_returns_rule_symbols() -> None:
+    rules = read_oracle_rules()
+
+    assert "unjustified-suppression" in rules
+    assert "duplicate-code" in rules
+    assert "MD072" in rules
+    assert all(rule == rule.strip() and rule and not rule.startswith("#") for rule in rules)
+
+
+def test_assert_oracle_coverage_given_all_rules_present_then_passes() -> None:
+    findings = [_finding(rule="unjustified-suppression"), _finding(rule="duplicate-code")]
+
+    assert_oracle_coverage(findings, ["unjustified-suppression", "duplicate-code"])
+
+
+def test_assert_oracle_coverage_given_missing_rule_then_names_it() -> None:
+    with pytest.raises(AssertionError, match="oracle rules missing") as excinfo:
+        assert_oracle_coverage([_finding(rule="present")], ["present", "absent"])
+
+    assert "absent" in str(excinfo.value)
+
+
+def test_assert_tool_coverage_given_met_minimums_then_passes() -> None:
+    findings = [_finding(tool="ruff check"), _finding(tool="ruff check"), _finding(tool="mypy")]
+
+    assert_tool_coverage(findings, {"ruff check": 2, "mypy": 1, "tach": 0})
+
+
+def test_assert_tool_coverage_given_below_minimum_then_names_tool_and_counts() -> None:
+    with pytest.raises(AssertionError, match="ruff check") as excinfo:
+        assert_tool_coverage([_finding(tool="ruff check")], {"ruff check": 2})
+
+    assert ", 2, 1)" in str(excinfo.value)
+
+
+def test_tool_minimums_given_findings_then_includes_zero_count_registered_tools() -> None:
+    minimums = tool_minimums([_finding(tool="ruff check"), _finding(tool="ruff check"), _finding(tool="mypy")])
+
+    assert minimums["ruff check"] == 2
+    assert minimums["mypy"] == 1
+    assert minimums["tach check"] == 0
+    assert list(minimums) == sorted(minimums)
+
+
+def test_slice_tool_section_given_bracketed_markers_then_returns_inner_section() -> None:
+    output = "preamble\n[pylint] FAILED\nmod.py:49\n[pylint-pyi] FAILED\nstub.py:1\n"
+
+    assert slice_tool_section(output, "[pylint]", "[pylint-pyi]") == "[pylint] FAILED\nmod.py:49\n"
+
+
+def test_slice_tool_section_given_missing_marker_then_asserts() -> None:
+    with pytest.raises(AssertionError, match="start marker"):
+        slice_tool_section("no sections", "[pylint]", "[mypy]")
+
+    with pytest.raises(AssertionError, match="end marker"):
+        slice_tool_section("[pylint] only", "[pylint]", "[mypy]")

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
