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
  "slug": "coding-rules-audit-i2",
  "kind": "fact-finder",
  "title": "Inventory CodingRules violations and ownership",
  "assignment": "GOAL: Inventory CodingRules violations and own unified disjoint file-ownership map on final HEAD containing M1 plus M2 merges (U3). Read-only; zero repo writes. STEPS: Audit src plus scripts vs CodingRules and AGENTS on final HEAD. Output in item report as engine-durable replan input: rows with module, section, evidence file:line, category, est LoC delta, owner, fix plus UNIFIED disjoint file-ownership map over ownership universe (src plus scripts plus tests minus tests/data; owner enum runner,checkers,setup-testing,semantic,root; stub follows .py; tests/data plus config plus docs as root-owned group) plus symbol-exclusion column (_base.py check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS, _semantic.py plus pyi) plus planned-path reservations for new backend and cache modules. Single owner of map; test audit aligns via inter-dep. Read final HEAD plus beartype report plus secrets-spike verdict. VERIFY: Every universe file appears exactly once with exactly one owner, root-owned group listed once, exclusions reference existing symbols, reservations name only planned paths. Per ADR-008 no committed map; escape hatch only if engine drops reports.",
  "outlineRef": "coding-rules-audit",
  "milestone": "M4",
  "wave": 3,
  "deps": [
    "runner-format-contract",
    "baseline-violations-fix",
    "consolidate-integration-helpers-i2",
    "golden-contract-hardening"
  ],
  "scenarioRefs": [
    "M4-1",
    "M4-3"
  ],
  "citations": [
    "CodingRules.md:90-107",
    "CodingRules.md:139-159",
    "CodingRules.md:230-306",
    "AGENTS.md:87-93",
    "AGENTS.md:121-139",
    "lint.baseline:1-1"
  ]
}

## Engine Checks


## Code Diff
diff --git a/.factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/input.md b/.factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/input.md
new file mode 100644
index 0000000..8e43ce9
--- /dev/null
+++ b/.factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/input.md
@@ -0,0 +1,76 @@
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
+  "slug": "coding-rules-audit-i2",
+  "kind": "fact-finder",
+  "title": "Inventory CodingRules violations and ownership",
+  "assignment": "GOAL: Inventory CodingRules violations and own unified disjoint file-ownership map on final HEAD containing M1 plus M2 merges (U3). Read-only; zero repo writes. STEPS: Audit src plus scripts vs CodingRules and AGENTS on final HEAD. Output in item report as engine-durable replan input: rows with module, section, evidence file:line, category, est LoC delta, owner, fix plus UNIFIED disjoint file-ownership map over ownership universe (src plus scripts plus tests minus tests/data; owner enum runner,checkers,setup-testing,semantic,root; stub follows .py; tests/data plus config plus docs as root-owned group) plus symbol-exclusion column (_base.py check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS, _semantic.py plus pyi) plus planned-path reservations for new backend and cache modules. Single owner of map; test audit aligns via inter-dep. Read final HEAD plus beartype report plus secrets-spike verdict. VERIFY: Every universe file appears exactly once with exactly one owner, root-owned group listed once, exclusions reference existing symbols, reservations name only planned paths. Per ADR-008 no committed map; escape hatch only if engine drops reports.",
+  "outlineRef": "coding-rules-audit",
+  "milestone": "M4",
+  "wave": 3,
+  "deps": [
+    "runner-format-contract",
+    "baseline-violations-fix",
+    "consolidate-integration-helpers-i2",
+    "golden-contract-hardening"
+  ],
+  "scenarioRefs": [
+    "M4-1",
+    "M4-3"
+  ],
+  "citations": [
+    "CodingRules.md:90-107",
+    "CodingRules.md:139-159",
+    "CodingRules.md:230-306",
+    "AGENTS.md:87-93",
+    "AGENTS.md:121-139",
+    "lint.baseline:1-1"
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
+  "CodingRules.md:90-107",
+  "CodingRules.md:139-159",
+  "CodingRules.md:230-306",
+  "AGENTS.md:87-93",
+  "AGENTS.md:121-139",
+  "lint.baseline:1-1"
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
diff --git a/.factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/meta.yaml
new file mode 100644
index 0000000..98d4361
--- /dev/null
+++ b/.factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/meta.yaml
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
+startedAt: 2026-11-08T15:24:57.245Z
+session: 01a1bbc3-ae70-7027-8803-fe5cba1346d7
+endedAt: 2026-11-08T15:38:38.157Z
+usage:
+  inputTokens: 211307
+  outputTokens: 94087
+  costUsd: 0.121337
+traceRef: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/sessions/2026-11-08T15-25-26-000Z_01a1bbc3-ae70-7027-8803-fe5cba1346d7.jsonl
diff --git a/.factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/output.yaml b/.factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/output.yaml
new file mode 100644
index 0000000..30332c8
--- /dev/null
+++ b/.factory/tasks/modernize/items/coding-rules-audit-i2/steps/001-research-r1-a1/output.yaml
@@ -0,0 +1,201 @@
+status: ok
+summary: "Audited final HEAD 5e466ac (M1+M2 merged) read-only. All 13 product
+  lint tools pass; detect-secrets times out (exit 124) only on tracked factory
+  journals, matching the environmental secrets-spike verdict, and lint.baseline
+  is still []. The audit found 40 rule deviations/suppression debts, dominated
+  by 205 private symbols in 29 .pyi stubs (uncaught because pylint resolves .pyi
+  modules to their .py impl, so W9707 never fires), 114 cross-module imports of
+  _-prefixed symbols, 95 lines of .pyi for pure __init__.py modules, 24
+  beartype-suppressed public functions (14 unnecessary; 7 fixable by runtime
+  imports; 3 real circular cases), 4 usage docstrings in .py, legacy
+  baseline/parsers stubs, duplicate symlink logic in
+  scripts/create_root_symlinks.py vs setup.py, and stale AGENTS/test counts. The
+  unified disjoint map covers all 184 tracked src+scripts+tests files minus
+  tests/data exactly once: runner 67, checkers 83, setup-testing 15, semantic 4,
+  root 15; the root-owned group (tests/data, config, docs, design) is listed
+  once. Symbol exclusions: _base.py::check_if_meaningful (+.pyi),
+  no_try_import_checker.py::_OPTIONAL_IMPORT_PATTERNS, and the whole
+  _semantic.py/.pyi (semantic owner). Planned reservations:
+  checkers/_decision_backend.py(+.pyi) and checkers/_decision_cache.py(+.pyi),
+  all absent at HEAD."
+findings: |-
+  # CodingRules audit — final HEAD 5e466ac
+
+  ## 0. Verification basis
+  - HEAD `5e466ac`; `git status --short` and `git diff --stat` are empty after all probes (no tracked writes).
+  - `uv run lint`: 13/14 tools PASSED (tach, ruff format, ruff check, rumdl, mypy, yamllint, ty, mypy.stubtest, pyright check, pyright verify types, pylint, pylint-pyi, pylint tests). detect-secrets FAILED exit=124 after 120.1s timeout. `lint.baseline:1` is `[]`.
+  - `uv run pytest -q` -> 1357 passed, 4 skipped, 18 deselected in 42.56s. `uv run pytest tests/integration.py -q` -> 9 passed in 106.61s. Both differ from AGENTS.md:10-11.
+  - Beartype report read: `.factory/tasks/modernize/items/third-party-assumption-tests/steps/001-develop-a1/output.yaml:55-68` — with beartype 0.22.9 + `from __future__ import annotations`, TYPE_CHECKING-only forward refs do not fail at decoration but raise `BeartypeCallHintForwardRefException` at call time. This matches the resolvability probe used below.
+  - Secrets verdict read: `.factory/tasks/modernize/steer/tousertoreview/q-secrets-triage-spike-operator-secrets-baseline-exclusion.yaml` and `q-secrets-triage-spike-engine-untrack-runtime-journals.yaml` — environmental, only tracked factory runtime journals; suggested `.factory/` should_exclude_file filter is an operator/engine action, not a product-code fix.
+  - TD-11 rumdl tests/data hack is resolved in runner code: no runner-side rumdl exclude exists; exclusion lives at `config/rumdl.toml:3` beside the other tools' config excludes.
+
+  ## 1. Audit rows
+
+  |ID|Module|Section|Evidence|Category|Est LoC|Owner|Fix|
+  |---|---|---|---|---|---|---|
+  |A1|runner/dispatch.py|CodingRules 139-159|`dispatch.py:1` module-level disable=too-many-lines; file is 542 lines; strategy classes at 155-510|C0302 masked by suppression|0 net|runner|Extract the 7 strategy subclasses into `runner/_strategies.py`; remove the module-wide disable.|
+  |A2|runner/baseline.py|CodingRules 139-159|`baseline.py:232` disable=too-many-locals on `_diff_baseline` (232-303)|too-many-locals masked|+8|runner|Split crash/add/remove/write paths into helpers; remove disable.|
+  |A3|scripts/create_root_symlinks.py|CodingRules 16; AGENTS 29|`create_root_symlinks.py:40` `main()` lacks @beartype; `runner/types.py:62-63` default dirs are `src`; `config/.pylintrc:5` source-roots=src; explicit pylint on the script reports W9740 at 76/85 while full lint never reaches it|scripts escape conformance scope|+2|setup-testing|Add @beartype and include `scripts/` in pylint scope (or a scripts rcfile); keep it out of source-roots only if a documented exception exists.|
+  |A4|scripts/create_root_symlinks.py|CodingRules 207-222|`create_root_symlinks.py:76` `except OSError: pass` with no comment/log; `:85-86` handled OSError not logged|silent except|+3|setup-testing|Comment the pass path per the no-re-raise rule and log the handled failure with structured fields.|
+  |A5|scripts/create_root_symlinks.py + setup.py|CodingRules 90-107|script `_CONFIG_FILES` 24-36 and `main` 40-90 duplicate `setup.py:37-48` `_BUNDLED_CONFIGS` and `setup.py:223-275` `_step_config_symlinks`; lists already drift (script lacks tach.toml)|duplicated logic|−35|setup-testing|Extract one symlink-or-copy helper and one config-file manifest used by both.|
+  |A6|checkers/__init__.py|CodingRules 61-68|`checkers/__init__.py:1-14` is only an Apache license header and has no module docstring|missing __init__ docs|−12|checkers|Replace the license header with a purpose/quick-start module docstring; no other file carries that header.|
+  |A7|4 pure __init__.pyi files|CodingRules 35-41|`checkers/__init__.pyi` 5 lines; `checkers/stub/__init__.pyi` 11; `runner/__init__.pyi` 63; `checkers/stub/fidelity/__init__.pyi` 16; none has __getattr__ or logic|.pyi for __init__|−95|checkers 32; runner 63|Delete all four; root __init__.pyi is allowed because `__init__.py:10-23` has structlog configuration logic, and conformance/__init__.py correctly has no stub.|
+  |A8|runner/*.pyi|CodingRules 57|97 private declarations outside TYPE_CHECKING in 18 runner stubs; examples `dispatch.pyi:128 _strategy_for`, `extra_tools.pyi:49 _ExtraToolRegistration`, `parsers.pyi` private dispatch tables|private symbols in .pyi|−80|runner|Rename cross-module helpers public; delete intra-module private declarations from stubs.|
+  |A9|checkers/**/*.pyi|CodingRules 57|63 private declarations outside TYPE_CHECKING; examples `_base.pyi:16-33`, `stub/coverage.pyi:13-97`, `conformance/suppression_justification_checker.pyi:21-45`|private symbols in .pyi|−50|checkers|Same fix; keep only public members in stubs.|
+  |A10|setup.pyi, _setup_*.pyi, testing.pyi|CodingRules 57|45 private declarations outside TYPE_CHECKING; examples `setup.pyi:15-19,46-52`, `_setup_pyproject.pyi:8-43`, `_setup_precommit.pyi:12-24`|private symbols in .pyi|−35|setup-testing|Rename cross-module symbols used by setup.py public; drop pure-internal declarations.|
+  |A11|checkers/stub/fidelity/__init__.py|CodingRules 30-33|`fidelity/__init__.py:31-32` cites old path `python_setup_lint.checkers.stub_fidelity`; 40-88 re-exports `_FidelityState`, `_compare_*`, `_is_classvar` etc via package __init__; `__all__` at 68 lists them|private re-exports through package init|−35|checkers|Have tests import from defining submodules; remove private re-exports and stale path text.|
+  |A12|runner/parsers.py|CodingRules 30-33, 90-107|`parsers.py:7-31` re-exports 8 private `_parse_*` functions for backward compat; parsers.pyi omits them; tests use type-ignore imports at `tests/runner/test_baseline_diff_parsers.py:18`|legacy private re-exports|−20|runner|Delete the re-export block; update tests to import `_record_parsers` directly.|
+  |A13|runner/baseline.py|CodingRules 90-107|`baseline.py:20-42` `_FALLBACK_TOOLS` always empty, `peek_fallback_tools` trivial, `_compare_sorted` compat wrapper; `.pyi:11-18`; `runner/__init__.py:22,62` exports peek_fallback_tools|legacy stubs|−25|runner|Remove the three legacy symbols, their stub declarations, public export, and tests.|
+  |A14|checkers/conformance/trivial_wrapper_checker.py|CodingRules 93|`trivial_wrapper_checker.py:24-39` hardcoded allowlist includes now-legacy `peek_fallback_tools`, `_legacy_*`, `fake_run_cmd_factory`|rule-exemption drift|−6|checkers|Shrink the allowlist after A13 and testing.py cleanup; keep only API-mandated names.|
+  |A15|runner production modules|CodingRules 30-33|56 cross-module `_` imports: `cli.py:14-32` 18; `dispatch.py:9-19` 10; `parsers.py:7-28` 8; `_cli_complexity.py:6-13` 7; `_autofix.py:11-13` 3; `_cli_helpers.py:38` 3|private symbols imported by production|0|runner|Rename cross-module helpers public or move them behind a public facade; update stubs and tests.|
+  |A16|checkers production modules|CodingRules 30-33|42 cross-module `_` imports: `stub/checker.py:12-28` 13; `fidelity/kind.py:8-12` 4; `fidelity/orchestrator.py:19-21` 3; conformance checkers import `_msgs`/`_matches_path`|private symbols imported by production|0|checkers|Same fix; `_msgs` and friends should become public once used cross-module, or move to an internal helpers module with a public name.|
+  |A17|setup.py, _setup_update.py, _setup_pyproject.py, testing.py|CodingRules 30-33|16 cross-module `_` imports: `setup.py:17-30` 9; `_setup_update.py:12,53,75` 6; `_setup_pyproject.py:6` 1; `testing.py:12` also has a false TYPE_CHECKING-only comment|private symbols imported by production|0|setup-testing|Rename the shared setup steps public, remove circular late imports, and correct the testing.py comment.|
+  |A18|runner/cli.py|CodingRules 30-33|`cli.py:43-48` `__all__` exports `_apply_autofix_conflict_aware` and `_autofix_target_paths`; `cli.pyi` public surface omits both|private symbols in public __all__|−2|runner|Remove both from __all__; tests import from `_autofix`.|
+  |A19|runner/cli.py, _autofix.py, dispatch.pyi|CodingRules 30-33|`cli.py:29` and `_autofix.py:13` import `_strategy_for` with comment 'private symbol removed from .pyi per M3(b)'; `dispatch.pyi:128` still declares `_strategy_for`|stale stub/private contract|−1|runner|Rename to public `strategy_for`, expose in dispatch.pyi, and delete the misleading comment.|
+  |A20|runner modules|CodingRules 92|7 false 'TYPE_CHECKING-only import' comments on runtime imports: `_autofix.py:6,7,15`, `_cli_complexity.py:3`, `_cli_helpers.py:5`, `cli.py:29`, plus the `_strategy_for` text|misleading comments|0|runner|Delete or correct every stale comment.|
+  |A21|checkers modules|CodingRules 92|16 false comments: `no_try_import_checker.py:6`, `pyi_underscore_checker.py:6`, `stub/checker.py:9`, `stub/coverage.py:4`, `stub/fidelity/__init__.py:42`, `fidelity/kind.py:8`, and 10 more conformance imports|misleading comments|0|checkers|Delete or correct; the imports are runtime imports.|
+  |A22|checkers mixins + 11 register functions|CodingRules 16|14 unnecessary missing-beartype suppressions: `_base.py:115,132,136` (open/visit_functiondef/visit_asyncfunctiondef); register at asyncio_timeout:99, generic_key:166, missing_error_chain:68, no_try_import:80, pyi_underscore:112, redundant_type_guard:145, structlog:149, tmp_path:96, trivial_wrapper:257, unnamed_tuple:118, stub/checker:376. `typing.get_type_hints` resolves all of them|unnecessary beartype suppression|0|checkers|Add @beartype and delete the disables; `_base.py:121` is a private helper, so its disable can simply be deleted.|
+  |A23|6 register functions|CodingRules 16|`bare_except_comment_checker.py:127`, `beartype_checker.py:75`, `missing_return_annotation_checker.py:49`, `silent_except_checker.py:76`, `suppression_justification_checker.py:391`, `stub/docstring_checker.py:236`; get_type_hints raises NameError PyLinter|TYPE_CHECKING-only beartype block|0|checkers|Move PyLinter to a runtime import as 10 other checkers already do; add @beartype.|
+  |A24|3 stub helpers|CodingRules 16|`stub/coverage.py:229-230 emit_coverage_violations`, `fidelity/orchestrator.py:29`, `import_contract.py:77`; get_type_hints raises NameError StubChecker|real circular TYPE_CHECKING block|+12|checkers|Break the cycle via a Protocol or a StubChecker method; then decorate.|
+  |A25|_setup_update.py|CodingRules 16|`_setup_update.py:85` update() suppresses missing-beartype; Path imported under TYPE_CHECKING at `:7-8`; get_type_hints raises NameError Path|TYPE_CHECKING-only beartype block|0|setup-testing|Import Path at runtime and add @beartype; delete the disable.|
+  |A26|setup.py, _setup_update.py, 2 conformance checkers|CodingRules 61-68|4 usage docstrings in .py: `setup.py:76-81` all_ok, 318-327 install, 398-403 main; `_setup_update.py:85-92` update. 3 stale docstring-in-impl disables with no docstring: `asyncio_timeout_checker.py:43,99`, `generic_key_dict_checker.py:166`|docstrings in implementation|−22|setup-testing 4; checkers 3|Move usage docs to the .pyi; delete the .py docstrings and all 7 disables.|
+  |A27|runner *.pyi|CodingRules 70-73|8 public generic-return functions lack a Returns clause: `baseline.pyi:14`, `cli.pyi:8,50`, `dispatch.pyi:71,72,80,88,89`|.pyi docstring gap|+12|runner|Add Returns/usage docs to the stub contract.|
+  |A28|setup.pyi|CodingRules 70-73|4 public generic-return functions lack a Returns clause: `setup.pyi:42 all_ok`, `:67 install`, `:77 main`, `:80 update`|.pyi docstring gap|+9|setup-testing|Add Returns clauses; also fix wording from 'Returns exit code' to a Returns: section.|
+  |A29|__main__.pyi|CodingRules 70-73|`__main__.pyi:8 main -> int` has no Returns clause or usage doc|.pyi docstring gap|+3|root|Add a minimal Returns clause or remove the stub if __main__ is treated as a script.|
+  |A30|pyi_underscore_checker + stub/docstring_checker|CodingRules 57|`pyi_underscore_checker.py:38-40` sets `_is_pyi` from `node.file.endswith('.pyi')`; pylint invoked on `dispatch.pyi` reports `VISIT .../dispatch.py` (debug), so `_is_pyi` is False. `pylint-pyi` PASSED despite 205 private stub symbols; the same path issue blinds .pyi Returns checks|.pyi enforcement gap|+6|checkers|Use the explicit linted path (`linter.current_file` / checker arg) instead of node.file; add a regression test that lints a real .pyi and expects W9707.|
+  |A31|checkers/stub state dicts|CodingRules 13-14|4 annotations / 7 occurrences of dict[str, tuple[...]]: `stub/checker.py:349`, `stub/coverage.py:29` + `.pyi:39`, `fidelity/_ast_helpers.py:26` + `.pyi:52`, `fidelity/annotation.py:177,181` + `.pyi:64`|unnamed tuple dict values|+16|checkers|Introduce NamedTuple/dataclass records for the node/annotation pairs.|
+  |A32|suppression_justification_checker.py|CodingRules 106-107|`suppression_justification_checker.py:252-273` keeps an astroid 3.x body[0] docstring fallback; `:295-299` catches AttributeError for nodes_of_class; pyproject pins astroid>=4.0.4 and assumptions pin 4.0.4|redundant astroid-3 fallback|−15|checkers|Delete the 3.x path and the broad AttributeError fallback; rely on the pinned astroid 4 API.|
+  |A33|42 in-scope silent excepts|CodingRules 215-222|43 `disable=W9740` suppressions: runner 21 (`_config.py:55`, `cmd_build.py:157`, `output.py:181`, ...), checkers 13 (`normalizer.py:54`, `_base.py:60,71`, ...), setup-testing 8 (`setup.py:108`, `_setup_update.py:27`, ...); 1 is in excluded _semantic.py|silent except policy|+40|root policy; file owners apply|Either log at debug with structured fields or narrow the helper to one documented best-effort function; do not just suppress W9740.|
+  |A34|runner/dispatch.py|CodingRules 90-107|`dispatch.py:93` 284-char and `:96` 689-char inline rationales; related long suppression comments at `_base.py:33` and `bare_except_comment_checker.py:65`|over-long comments|−2|runner|Move ty-scope rationale to design/ADR or docs/overlays.md and cite it.|
+  |A35|__init__.py, checkers/_base.py, runner/cli.py, dispatch.py|CodingRules 104|Four structlog configuration sites: `__init__.py:10-23`, `_base.py:19-21`, `cli.py:39-41`, `dispatch.py:317` subprocess init-hook|duplicated logging setup|−5|root|Centralize in one shared logging module; keep the subprocess hook only where isolation requires it.|
+  |A36|AGENTS.md|AGENTS 5-11|`AGENTS.md:10` says 1290 pass/4 skip/15 deselected; measured 1357/4/18 in 42.56s. `:11` says integration 7 pass/~30s; measured 9 pass/106.61s|stale docs counts|2|root|Update both rows after the final merge.|
+  |A37|AGENTS.md|AGENTS 16-32|`AGENTS.md:29` says pylint whole repo; `runner/types.py:62-63` defaults to `src`, `_PylintLintTool` uses it, tests run separately, and scripts are unlinted (explicit script pylint finds W9740 that full lint misses)|inaccurate tool scope|1|root|Say src/ for main pylint, tests/ for pylint tests, and scripts/ currently unlinted or add scripts/ to scope.|
+  |A38|AGENTS.md|AGENTS 121-139|AGENTS documents `uv run pre-commit install` and active hooks, but `git ls-files` contains no `.pre-commit-config.yaml`; only `_setup_precommit.py:89-122` writes it during install|missing pre-commit config|+30 or 1 doc line|root|Commit the self-repo config or mark the section consumer-only.|
+  |A39|AGENTS.md, docs/semantic-justification.md|AGENTS 79-85; task intent|AGENTS describes _semantic.py cross-encoder/reranker; docs/semantic-justification.md:9-43 documents sentence-transformers, ~/.cache, 0.5 threshold; intent replaces it with a CPU decision model + git cache|obsolete architecture docs|10|root with semantic epic|Semantic epic drafts the replacement; root owner updates AGENTS.md, docs/semantic-justification.md, and pyproject optional deps.|
+  |A40|lint.baseline|CodingRules/AGENTS lint gate|`lint.baseline:1` is `[]`; all product tools pass only because the deviations above are suppressed or unenforced; detect-secrets timeout is environmental|baseline governance|0|root|Do not add these rows to the baseline; fix them. Keep baseline empty as the invariant.|
+  |A41|testing.py, setup.py|CodingRules 15|5 suppressions lack a trailing reason: `setup.py:122 # noqa: S603`; `testing.py:73,101 # pylint: disable=generic-key-dict`; `testing.py:143 # noqa: S603`; `testing.py:145 # noqa: S607`|unjustified suppressions|0|setup-testing|Move the adjacent rationale to a trailing comment or delete the suppression.|
+
+  ## 2. Unified disjoint file-ownership map (single owner; authoritative for test-debloat-audit-i2)
+
+  Universe = all git-tracked files under `src/`, `scripts/`, `tests/` minus `tests/data/` = 184 files. Reproduce with `git ls-files`; owner counts below sum to 184 with no duplicates.
+
+  |Owner|Paths covered|Count|Symbol exclusions|
+  |---|---|---|---|
+  |runner|`src/python_setup_lint/runner/**` (34 files) + `tests/runner/**` except `test_setup.py` and `test_setup_install.py` (32) + `tests/fixtures/dogfood-extra/pyproject.toml` (1)|67|none|
+  |checkers|`src/python_setup_lint/checkers/**` except `_semantic.py` and `_semantic.pyi` (59) + `tests/checkers/**` except `test_semantic_check.py` and `test_semantic_threshold.py` (24)|83|`_base.py:143-238 check_if_meaningful` and `_base.pyi:69-96` (semantic); `conformance/no_try_import_checker.py:12 _OPTIONAL_IMPORT_PATTERNS` (semantic)|
+  |setup-testing|`scripts/create_root_symlinks.py`; `src/python_setup_lint/_setup_precommit.py(.pyi)`, `_setup_pyproject.py(.pyi)`, `_setup_update.py(.pyi)`, `setup.py(.pyi)`, `testing.py(.pyi)`; `tests/runner/test_setup.py`, `tests/runner/test_setup_install.py`, `tests/test_setup_config_symlinks.py`, `tests/test_setup_precommit.py`|15|none|
+  |semantic|`src/python_setup_lint/checkers/_semantic.py`, `_semantic.pyi`, `tests/checkers/test_semantic_check.py`, `tests/checkers/test_semantic_threshold.py`|4|whole-file exclusion from this audit; excluded symbol/planned owners listed below|
+  |root|`src/python_setup_lint/__init__.py(.pyi)`, `__main__.py(.pyi)`, `py.typed`; `tests/__init__.py`, `_golden.py`, `_project_helpers.py`, `conftest.py`, `integration.py`, `test_golden.py`, `assumptions/__init__.py`, `assumptions/test_astroid_contracts.py`, `assumptions/test_beartype_contracts.py`, `assumptions/test_pylint_contracts.py`|15|none|
+  |root-owned group (listed once)|`tests/data/**`, `config/**`, `docs/**`, `design/**`|group|n/a|
+
+  Stub rule applied: every `.pyi` has the same owner as its paired `.py`; `_semantic.pyi` is semantic, `dispatch.pyi` is runner, `_base.pyi` is checkers, `setup.pyi` is setup-testing. Root project files outside the declared universe (`pyproject.toml`, `AGENTS.md`, `CodingRules.md`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `lint.baseline`, `tach.toml`, `uv.lock`, `.secrets.baseline`) are root-owned.
+
+  ### 2.1 Symbol exclusions (must not be edited by the file owner)
+  |Symbol|Defining evidence|Owner|Reason|
+  |---|---|---|---|
+  |`check_if_meaningful`|`src/python_setup_lint/checkers/_base.py:143-238`; stub `_base.pyi:69-96`|semantic|Replaced by the decision-model path; checkers owner must not refactor it.|
+  |`_OPTIONAL_IMPORT_PATTERNS`|`src/python_setup_lint/checkers/conformance/no_try_import_checker.py:12` (not exposed in .pyi)|semantic|Must track the new optional model dependency name.|
+  |`_semantic.py` and `_semantic.pyi`|`src/python_setup_lint/checkers/_semantic.py:1-189`; `_semantic.pyi:1-42`|semantic|Whole-file exclusion from this audit.|
+
+  ### 2.2 Planned-path reservations (names only planned paths; all absent at HEAD)
+  |Reserved path|Owner|Purpose|
+  |---|---|---|
+  |`src/python_setup_lint/checkers/_decision_backend.py`|semantic|New CPU decision-model backend; pair with `_decision_backend.pyi`.|
+  |`src/python_setup_lint/checkers/_decision_backend.pyi`|semantic|Public contract for the backend.|
+  |`src/python_setup_lint/checkers/_decision_cache.py`|semantic|Git-stored cache + cleanup; pair with `_decision_cache.pyi`.|
+  |`src/python_setup_lint/checkers/_decision_cache.pyi`|semantic|Public cache contract.|
+
+  No other new paths are reserved. Checkers owner must not claim these four names.
+
+  ## 3. Non-findings and resolved items
+  - No bare `except:` in src/scripts; the only uncommented pass is A4.
+  - No public `Any` signature without justification; `extra_tools.py:178`, `testing.py:37-38`, `parsers.py:101`, and `generic_key_dict_checker.py:38` all carry trailing technical reasons.
+  - No duplicate-code messages and no unsuppressed R0912/R0915/R0914 hits; A1/A2 are the only complexity suppressions.
+  - `mypy.stubtest`, pyright verify types (completenessScore=1), and pylint-pyi pass; A30 explains why pylint-pyi passing is not evidence that .pyi rules hold.
+  - TD-11 rumdl tests/data-exclude hack is not present in runner code; the exclusion is config-level at `config/rumdl.toml:3`. Test audit may still review whether tests/data is the right exclusion set.
+  - `git status` clean; no tracked writes were made.
+
+  ## 4. Verification checklist for the map
+  - 184 tracked universe files; owner counts 67+83+15+4+15 = 184; no duplicate paths; every file matched exactly one rule above.
+  - Exclusions reference existing symbols: `_base.py:143` and `_base.pyi:69` exist; `no_try_import_checker.py:12` exists; `_semantic.py`/`.pyi` exist.
+  - Reservations name only four planned paths; `Path.exists()` is false for all four.
+  - Root-owned group listed once; tests/data is excluded from the 184 count but is covered by that group.
+
+  ## 5. Handoff notes
+  - `test-debloat-audit-i2` must consume this map unchanged: tests/runner/test_setup*.py are setup-testing, tests/checkers/test_semantic_*.py are semantic, tests/assumptions/** and tests/_golden.py/_project_helpers.py/conftest.py are root.
+  - The highest-leverage fix order is A30 (restore .pyi enforcement), A8-A10 (then bulk stub cleanup), A22-A25 (beartype), A11-A19 (private-symbol surface), A1/A2 (complexity), A5/A13 (duplication/legacy), A36-A39 (docs).
+  - Do not put any A-row in `lint.baseline`; the baseline is empty and should remain the fitness gate.
+contextPack: "HEAD 5e466ac; 184-file map: runner 67, checkers 83, setup-testing
+  15, semantic 4, root 15; root group (tests/data, config, docs, design) once.
+  40 audit rows A1-A41. Top debts: dispatch.py 542 lines with C0302 disable; 205
+  private .pyi symbols in 29 stubs (W9707 blind because pylint maps .pyi to
+  .py); 114 cross-module _ imports; 95 lines of pure-init .pyi; 24 beartype
+  suppressions (14 unnecessary, 7 runtime-import-fixable, 3 real circular); 4
+  .py docstrings; legacy baseline/parsers stubs; script/setup symlink
+  duplication; stale AGENTS counts (1357/4/18 vs 1290/4/15; integration
+  9/106.61s vs 7/30s). Exclusions: _base.py::check_if_meaningful (+pyi),
+  no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS, _semantic.py/.pyi.
+  Reservations: checkers/_decision_backend.py/.pyi and _decision_cache.py/.pyi.
+  Lint: 13/14 pass, detect-secrets timeout environmental; baseline []."
+sources:
+  - CodingRules.md:9-16
+  - CodingRules.md:30-41
+  - CodingRules.md:57
+  - CodingRules.md:61-73
+  - CodingRules.md:90-107
+  - CodingRules.md:139-159
+  - CodingRules.md:161-222
+  - CodingRules.md:230-307
+  - AGENTS.md:5-11
+  - AGENTS.md:16-32
+  - AGENTS.md:79-93
+  - AGENTS.md:121-139
+  - lint.baseline:1
+  - src/python_setup_lint/runner/dispatch.py:1
+  - src/python_setup_lint/runner/dispatch.py:93-96
+  - src/python_setup_lint/runner/baseline.py:20-42
+  - src/python_setup_lint/runner/baseline.py:232
+  - src/python_setup_lint/runner/cli.py:29
+  - src/python_setup_lint/runner/cli.py:43-48
+  - src/python_setup_lint/runner/parsers.py:7-31
+  - src/python_setup_lint/checkers/_base.py:143-238
+  - src/python_setup_lint/checkers/_base.pyi:69-96
+  - src/python_setup_lint/checkers/conformance/no_try_import_checker.py:12
+  - src/python_setup_lint/checkers/conformance/pyi_underscore_checker.py:38-40
+  - src/python_setup_lint/checkers/stub/fidelity/__init__.py:31-88
+  - scripts/create_root_symlinks.py:24-90
+  - src/python_setup_lint/setup.py:37-48
+  - src/python_setup_lint/setup.py:223-275
+  - src/python_setup_lint/testing.py:73-145
+  - .factory/tasks/modernize/items/third-party-assumption-tests/steps/001-develop-a1/output.yaml:55-68
+  - .factory/tasks/modernize/steer/tousertoreview/q-secrets-triage-spike-operator-secrets-baseline-exclusion.yaml
+  - .factory/tasks/modernize/steer/tousertoreview/q-secrets-triage-spike-engine-untrack-runtime-journals.yaml
+  - .factory/tasks/modernize/plan/plan-2.1.yaml:457-467
+recommendations:
+  - "Replan by owner using the map: runner fixes
+    A1/A2/A8/A12/A13/A15/A18/A19/A20; checkers fixes
+    A6/A7/A9/A11/A14/A16/A21-A24/A26/A30-A32/A34; setup-testing fixes
+    A3-A5/A10/A17/A25/A28/A41; semantic owns _semantic.py/.pyi and the four
+    reserved decision paths; root owns A33/A35-A40 and AGENTS/docs updates."
+  - "Fix A30 before bulk .pyi cleanup: make W9707 and StubDocstringChecker read
+    the linted path rather than node.file, and add a regression test that a real
+    .pyi with a private symbol produces W9707; otherwise every stub cleanup is
+    unguarded."
+  - Keep lint.baseline empty. Do not baseline A1-A41; the fact that all product
+    tools currently pass is exactly why the suppressed deviations need owner
+    fixes rather than baseline absorption.
+  - "Treat the 24 missing-beartype cases by category: add @beartype to the 14
+    resolvable ones now; move PyLinter/Path imports runtime for the 7 fixable
+    ones; break the 3 StubChecker circular cases with a Protocol or method
+    before decorating."
+  - Update AGENTS.md counts and tool scope only after the final merge, and have
+    the semantic epic supply the replacement text for AGENTS.md:79-85 and
+    docs/semantic-justification.md:9-43 plus pyproject optional deps.
+  - Test audit must not reassign tests/runner/test_setup*.py,
+    tests/checkers/test_semantic_*.py, tests/assumptions/**, tests/_golden.py,
+    tests/_project_helpers.py, tests/conftest.py, or
+    tests/fixtures/dogfood-extra/pyproject.toml; consume the map as
+    authoritative.
+  - Consider adding the scripts/ directory to pylint scope or a dedicated
+    scripts rcfile; currently A3/A4 are invisible to `uv run lint`, which is why
+    the script is the only unsuppressed missing-beartype case.

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
