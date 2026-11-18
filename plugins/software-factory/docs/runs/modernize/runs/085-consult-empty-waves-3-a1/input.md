# Step: Architect Consult (Non-Item)

## Goal
Resolve an orchestration-level failure, close-up defect, or non-item seam blockage.

## Rules
- Exploration budget: evaluate the non-item issue using seam context, failure logs, and the prepared context pack (`# Context Pack — `modernize`

Repository: `python-setup` v1.2.10 (`pyproject.toml:1-4`), MIT (`pyproject.toml:19-20`), Python `>=3.14`. The repo is both a lint-tooling product and its own heaviest consumer: 14 built-in tools (`src/python_setup_lint/runner/dispatch.py:46-137`), an empty frozen baseline (`lint.baseline:1` = `[]`), a golden snapshot of 158 findings (`tests/data/golden/minimal_sample_project_findings.json`), and 18,671 test LOC against 9,005 src LOC.

## 0. Executive snapshot (measured 2026-11-08)

| Gate | Command | Result |
|---|---|---|
| Unit suite | `uv run pytest -q` | **1,357 passed, 4 skipped, 18 deselected, ~28–30 s**. The 4 skips are the `TestRerankerPairs` model tests (`tests/checkers/test_semantic_check.py:432,453,473,493`). |
| Integration | `uv run pytest tests/integration.py -q` | **9 passed, ~65 s** (AGENTS.md says 7 pass / ~30 s — stale). |
| Lint (all except detect-secrets) | `uv run lint --tools "tach check,ruff format,ruff check,rumdl check,mypy,yamllint,ty check,mypy.stubtest,pyright check,pyright verify types,pylint,pylint-pyi,pylint tests"` | **all 13 PASSED, ~61 s**. |
| Lint (full) | `uv run lint` | detect-secrets dies with `MemoryError` scanning very large tracked binary artifacts present in this worktree. This is environmental, not a product-code violation; re-validate on a clean checkout/scoped tree. Do not weaken the baseline in response. |
| Collection | `uv run pytest --collect-only -q` | 1,379 collected; 18 slow deselected by `addopts = "-m 'not slow'"` (`pyproject.toml:48-55`). |

Product tree: 75 `.py` src modules + 59 test modules; 54 `.pyi` stubs; 780 test definitions. Marker counts: 18 slow, 702 `no_external_api`, 1 `with_real_api`, **0 `implementation_detail`** (marker declared at `pyproject.toml:50-55` but unused).

The semantic path is effectively dormant in dev/CI: `sentence-transformers` is only an optional extra (`pyproject.toml:28-31`), not in the dev group (`pyproject.toml:58-85`); the 4 model-pair tests skip, the 2 reranker-pipeline tests are slow-deselected, and the golden capture explicitly sets `PYTHON_SETUP_LINT_SEMANTIC=0` (`tests/integration.py:112`). Any model swap therefore has **no existing deterministic test coverage**.

## 1. Module Map

### 1.1 Product source

| Area | Files / LOC | Responsibility |
|---|---|---|
| Shared checker utilities | `src/python_setup_lint/checkers/_base.py` (238) | `MessageDef`, `_msgs`, path/source-root helpers, `check_if_meaningful` + heuristic fallback. |
| Semantic scorer | `src/python_setup_lint/checkers/_semantic.py` (189) + `_semantic.pyi` | Lazy cross-encoder load, pair scoring, result cache. |
| W9704 checker | `src/python_setup_lint/checkers/conformance/suppression_justification_checker.py` (393) + `.pyi` | Raw-line suppression scan, `Any` param/return/annassign scan, justification call sites. |
| W9738 checker | `src/python_setup_lint/checkers/conformance/bare_except_comment_checker.py` (128) | Bare/`except Exception` comment justification; second consumer of `check_if_meaningful`. |
| Other conformance checkers | `src/python_setup_lint/checkers/conformance/*.py` | 16 checker modules (trivial-wrapper, generic-key-dict, unnamed-tuple-dict, structlog, silent-except, etc.). |
| Stub checkers | `src/python_setup_lint/checkers/stub/*.py` | `.pyi` fidelity, coverage, docstrings, import contract, normalizer. |
| Runner registry/strategies | `src/python_setup_lint/runner/dispatch.py` (542) | 14 `ToolSpec`s, 7 strategy subclasses, `EXPECTED_TOOL_NAMES`, `register_lint_tool`. |
| Runner CLI | `src/python_setup_lint/runner/cli.py` (413) | `main`, `run_lint`, `--tools`, `--path`, `--fix`, baseline flow. |
| Baseline | `src/python_setup_lint/runner/baseline.py` (303) | Violations-only diff, atomic baseline write, dead compat exports at `:20-42`. |
| Parsers | `src/python_setup_lint/runner/parsers.py` (290), `_record_parsers.py` (277), `_record_types.py` | Tool-output parsing and `Record` type. |
| Command building | `src/python_setup_lint/runner/cmd_build.py` (293) | Pylint file discovery, config flags, pyright/ruff composition. |
| Installer | `src/python_setup_lint/setup.py` (413), `_setup_precommit.py` (145), `_setup_update.py` (108) | `install`/`update`, shipped configs, pre-commit template. |
| Shipped test helpers | `src/python_setup_lint/testing.py` (196) | `_make_tc`, `_walk_and_release`, `FakeRunCmd`, `make_lint_result`, pre-commit validators. |
| Shipped configs | `config/.pylintrc`, `.pylintrc-tests`, `.pylintrc-pyi`, `ruff.toml`, `mypy.ini`, `pyrightconfig.json`, `rumdl.toml`, `tach.toml`, `ty.toml`, `.yamllint` | Enforced thresholds and rule selection. |

### 1.2 Semantic / justification subsystem

```text
suppression line or Any annotation
  └─ suppression_justification_checker.py  (W9704)
     or bare_except_comment_checker.py     (W9738)
        └─ check_if_meaningful()           _base.py:142-238
           ├─ if PYTHON_SETUP_LINT_SEMANTIC != "0":
           │    lazy import _semantic, call semantic_check_if_meaningful()
           │      ├─ load result cache            _semantic.py:55-68, 136-138
           │      ├─ cache lookup (64-bit key)    _semantic.py:143-157
           │      ├─ lazy model load              _semantic.py:93-122
           │      ├─ pair predict + score >= 0.5  _semantic.py:159-186
           │      └─ persist cache                _semantic.py:71-78, 187-188
           └─ result is None → exact-string heuristic  _base.py:160-238
```

### 1.3 Test / gate subsystem

| Area | Files | Notes |
|---|---|---|
| Checker unit tests | `tests/checkers/test_*.py` (26 files) + `_factories.py` (1,393) | Pylint `CheckerTestCase` via `python_setup_lint.testing._make_tc` / `_walk_and_release`. |
| Runner unit tests | `tests/runner/test_*.py` (30 files) + `_factories*.py` (1,114 total) + `_autofix_helpers.py` | Tool registry, command building, baseline diff, autofix, setup. |
| Golden helpers | `tests/_golden.py` (446), `tests/test_golden.py` (414) | Canonical finding serialization, multiset diff, coverage assertions. |
| Shared project helpers | `tests/_project_helpers.py` (204) | Sample-project copy, git staging, runner config, install idempotence. |
| Third-party assumption tests | `tests/assumptions/*.py` (393; 8 tests) | Pin astroid 4.0.4, beartype 0.22.9, pylint 4.0.6 contracts. |
| Integration | `tests/integration.py` (498; 9 tests) | Install → lint → golden → config overlay → pre-commit validation → tool parity. |
| Golden data | `tests/data/golden/*.json` | 158 findings, 51 unique rules, per-tool minimum counts. |
| Sample project | `tests/data/minimal_sample_project/` | Planted violations, `violations.txt` oracle, `mod.py:41-63` W9704 cases. |

### 1.4 Docs, ADRs, packaging

- `AGENTS.md:9-11` — stale quick-command counts (1,290 pass / 15 deselected / ~53 s; 7 integration pass / ~30 s).
- `AGENTS.md:79-85` — semantic pipeline described as cross-encoder reranker with `PYTHON_SETUP_LINT_RERANKER_MODEL`.
- `AGENTS.md:87-93` — testing strategy / 14-tool integration claim.
- `AGENTS.md:121-139` — pre-commit hooks; `lint --fix --baseline lint.baseline` on every commit.
- `CodingRules.md:9-16` — typing/beartype/suppression justification rules.
- `CodingRules.md:90-107` — simplification, wrappers, duplicated logic, redundant fallbacks.
- `CodingRules.md:139-159` — enforced R0912 ≤16 branches, R0915 ≤65 statements, C0302 ≤500 lines/module (split modules, never raise thresholds).
- `CodingRules.md:230-307` — test metrics, mocking at boundaries, categories, coverage, naming (`test_<method>_given_<condition>_then_<expected>`), isolation, fixture scope, conftest scope.
- `docs/semantic-justification.md:1-62` — full current semantic design and cache docs.
- `docs/troubleshooting.md:97-109` — cross-encoder download-failure fallback and cache location.
- `docs/custom-checks.md:53-55,97-104` — W9704 rules and `check_if_meaningful` contract.
- `docs/tutorials.md:12-15,87,121` — `[semantic]` install and guide links.
- `README.md:29,105` — `[semantic]` install line and semantic guide link.
- `docs/adr/ADR-001.md` … `ADR-008.md` — eight 1–3-line problem statements for the three workstreams (see §3.10).
- `uv.lock:980-1036` — project extras/dev deps; `:1552-1602` — torch 2.12.1 + CUDA/NVIDIA graph, transformers 5.12.1.

## 2. Key Interfaces & Signatures

### 2.1 `check_if_meaningful` — `src/python_setup_lint/checkers/_base.py:142-238`

```python
@beartype
def check_if_meaningful(
    text: str,
    *,
    rule: str | None = None,
    code_context: str | None = None,
    comment: str | None = None,
) -> bool:
```

- Env gate: `os.environ.get("PYTHON_SETUP_LINT_SEMANTIC", "1") == "1"` (`:151`). The module is imported lazily **inside** the function (`:152-154`), so heavy optional deps must never be imported at checker-module top level.
- If semantic returns non-`None`, that bool is returned (`:156-158`); otherwise the exact-string heuristic runs (`:160-238`).
- Heuristic contract: strip `comment or text`; reject empty/`<5` chars (`:161-163`); reject exact boilerplate tokens (large set at `:165-209`, includes `noqa`, `ignore`, `pre-existing`, `baseline`, `wip`, `temp`, `legacy`, `later`, `for now`, `carryover`); reject exact meaningless multi-word phrases (`:213-234`); reject a reason equal to the rule symbol (`:238`). Matching is exact-string/lowercase, **not semantic**.

### 2.2 `semantic_check_if_meaningful` — `src/python_setup_lint/checkers/_semantic.py:125-189`

```python
@beartype
def semantic_check_if_meaningful(
    text: str,
    *,
    rule: str | None = None,
    code_context: str | None = None,
    comment: str | None = None,
) -> bool | None:
```

- Tri-state contract: `True` = meaningful, `False` = reject, `None` = model unavailable/failed → caller falls back to heuristic.
- Primary text = `(comment or text).strip()`; empty → `False` without model (`:134,139-140`).
- Cache key = first 8 bytes of SHA-256 over `(text, rule, code_context, comment, _RERANKER_MODEL)`, converted to `int` (`:143-155`).
- Cache hit returns before model load (`:156-157`).
- Model load is a module-global singleton with a permanent failure sentinel (`:40-42,93-122`).
- Query construction: `rule: … | context: <first 200 chars>` when rule/context present; self-pair otherwise (`:164-176`).
- Score threshold is hard-coded `>= 0.5` (`:186`).
- New results are stored and the whole cache file is rewritten (`:187-188`).

### 2.3 Message definitions

W9704 — `suppression_justification_checker.py:31-41`:

```python
msgs = _msgs(
    W9704=MessageDef(
        message="Suppression comment without technical justification: %s",
        symbol="unjustified-suppression",
        description="Suppression comments ... must be accompanied by a technical reason ...",
    ),
)
```

W9738 — `bare_except_comment_checker.py:21-36` (message symbol `bare-except-comment`). Both checkers call the same `check_if_meaningful`; the model swap affects **both** rules.

### 2.4 Runner / registry

- `ToolSpec` — `src/python_setup_lint/runner/types.py:12-23` (`name`, `command`, `supports_fix/path/exclude`, `default_paths`, `fix_flags`, `exclude_flag`, `timeout`, `memory_limit_mb`).
- `TOOLS` — exactly 14 entries at `dispatch.py:46-137`: tach check, ruff format, ruff check, rumdl check, mypy, yamllint, ty check, mypy.stubtest, pyright check, pyright verify types, pylint, pylint-pyi, pylint tests, detect-secrets.
- `EXPECTED_TOOL_NAMES` derives from `TOOLS` (`dispatch.py:141-152`).
- `ruff format` is check-only on normal passes (`--check`) and mutates only in the fix phase (`dispatch.py:405-439`).
- `detect-secrets` command is `git ls-files -z | xargs -0 detect-secrets-hook --baseline .secrets.baseline …` (`dispatch.py:261-292`). Any git-tracked cache must remain tiny and text-safe.

### 2.5 Test helpers (shipped)

`src/python_setup_lint/testing.py`:

- `_make_tc(checker_class)` (`:18-22`) — builds a `CheckerTestCase`.
- `_walk_and_release(checker_class, code, file_path=...)` (`:25-38`) — parses source, walks checker, releases messages. Used directly by 6 test files and re-defined locally by 10 others.
- `make_lint_result(...)` (`:44-61`) — constructs `LintResult`.
- `FakeRunCmd` / `fake_run_cmd_factory` (`:64-103`) — injectable command runner.
- `test_checked_main`, `assert_precommit_config_valid`, `assert_precommit_hooks_shape` (`:106-196`).

## 3. Relevant Excerpts

### 3.1 Current semantic pipeline — `_semantic.py`

Header (`:1-12`) documents “Cross-encoder reranking (jina-reranker-v2-base-multilingual)” and the lazy-load/fallback contract. Cache/model globals (`:37-52`):

```python
_CACHE_DIR = Path.home() / ".cache" / "python-setup" / "semantic"
_RERANKER_INSTANCE: CrossEncoder | None = None
_RERANKER_UNAVAILABLE: bool = False
_RESULT_CACHE_FILE = _CACHE_DIR / "results.json"
_RESULT_CACHE: dict[int, bool] | None = None
_RERANKER_MODEL = os.environ.get(
    "PYTHON_SETUP_LINT_RERANKER_MODEL",
    "jina-reranker-v2-base-multilingual",
)
```

Lazy loader (`:93-122`): imports `sentence_transformers.CrossEncoder` only inside the call; on `ImportError` sets `_RERANKER_UNAVAILABLE = True` and returns `None`; on `OSError/RuntimeError/ValueError` logs warning and returns `None`; `CrossEncoder(_RERANKER_MODEL, cache_folder=str(cache))`.

Cache load/save/reset (`:55-90`):

```python
try:
    raw = _RESULT_CACHE_FILE.read_text()
    return {int(k): v for k, v in json.loads(raw).items()}
except FileNotFoundError:  # expected on first run
    return {}
except json.JSONDecodeError, OSError, ValueError:
    _LOG.warning("Failed to load result cache", exc_info=True)
    return {}
...
_CACHE_DIR.mkdir(parents=True, exist_ok=True)
assert _RESULT_CACHE is not None
_RESULT_CACHE_FILE.write_text(json.dumps({str(k): v for k, v in _RESULT_CACHE.items()}))
```

`_reset_cache()` (`:81-90`) is a test helper that clears memory and **deletes `~/.cache/python-setup/semantic/results.json`**.

Scoring (`:158-189`): pair `(primary, query)`, `score = float(scores[0])`, `result = score >= 0.5`, persist. Exceptions from `predict` (`OSError/RuntimeError/ValueError`) return `None`.

### 3.2 W9704 call sites

`suppression_justification_checker.py`:

- Raw-line scan: `visit_module` (`:43-61`) reads `node.stream()`, decodes, calls `_legacy_scan` (`:63-91`). Despite the name, `_legacy_scan` is the **only** scan path. It builds string-literal spans, skips matches inside strings, checks `_has_justification`, and emits W9704 (`:86-91`).
- `Any` in function params/return: `_check_function` (`:96-124`) collects annotations and calls `_emit_if_unjustified` per annotation line.
- `Any` in `AnnAssign`: `_check_any_annotation` (`:164-184`).
- `_emit_if_unjustified` (`:136-162`) extracts the source line, looks for a trailing `# <reason>`, and calls:

```python
if check_if_meaningful(
    reason, comment=reason, rule="unjustified-suppression",
    code_context=src_line.split("#", 1)[0].strip(),
):
    return
self.add_message("unjustified-suppression", line=lineno, node=annotation, args=(annotation.as_string(),))
```

- Trailing reason path (`:350-375`) checks every suppression match and calls the helper with `rule="unjustified-suppression"` and code before `#`.
- Preceding-comment path (`:377-386`) does the same with the previous line.
- Suppression patterns are `# pylint: disable=`, `# noqa`, `# type: ignore`, `# ty: ignore` (`:22-28`).

### 3.3 W9738 call sites

`bare_except_comment_checker.py:98-122`: trailing `# <comment>` calls `check_if_meaningful(text=comment_text, rule="bare-except-comment", code_context=line.strip(), comment=comment_text)`; preceding `#` comment does the same. So a model/cache/threshold change affects W9738 as well as W9704.

### 3.4 Gating and behavior contract

- Default is **on** (`"1"`), not opt-in (`_base.py:151`); docs say the same (`docs/semantic-justification.md:3,18`).
- If `sentence-transformers` is absent, `_load_reranker` returns `None`, so heuristic decides every case. This is the current dev/CI behavior.
- If `_semantic` module import itself fails, `check_if_meaningful` does **not** catch it; `TestImportErrorFallback` expects `ImportError` to propagate (`tests/checkers/test_semantic_check.py:20-42`).
- The model path never runs in the golden snapshot because `tests/integration.py:112` sets `SEMANTIC_ENV=0`; the snapshot is therefore a contract for the heuristic + non-semantic checkers only.

### 3.5 Golden contract — `tests/_golden.py`

- `SEMANTIC_ENV = "PYTHON_SETUP_LINT_SEMANTIC"` and `UPDATE_ENV = "PYTHON_SETUP_LINT_UPDATE_GOLDEN"` (`:53-58`).
- Canonical serialization: sorted findings, `json.dumps(..., indent=2, sort_keys=True) + "\n"` (`:156-172`); tool minimums use the same format (`:166-172`).
- `collect_findings` bypasses `run_lint` and uses `_run_tool_pipeline` + record parsers, selecting only tools in `_RECORD_PARSERS` (`:191-231`).
- `assert_matches_golden` rewrites only when `UPDATE_ENV=1` and refuses under `CI`/`GITHUB_ACTIONS` (`:374-390`).
- `assert_golden_byte_identical` hashes every serialized run (`:392-410`).
- Golden content: **158 findings, 51 unique rules, 18 `unjustified-suppression`, 2 `bare-except-comment`** (counted from `tests/data/golden/minimal_sample_project_findings.json`). Tool minimums at `tests/data/golden/minimal_sample_project_tool_counts.json`.
- Integration asserts the exact multiset and byte-identical replay (`tests/integration.py:114-122`), then specifically asserts `mod.py:49` (“pre-existing”) is flagged and `mod.py:56` (“carried from external library …”) is not (`:124-129`).

### 3.6 Config thresholds

- `.pylintrc:2` `max-module-lines=500`; `:22-27` `max-statements=65`, `max-branches=16`, `max-locals=20`, `max-nested-blocks=8`, `max-public-methods=30`, `max-attributes=15`.
- `.pylintrc-tests:20` `max-module-lines=500`; `:37-43` enables custom test rules (W9704, trivial-wrapper, redundant-type-guard, duplicate-code…) and disables production-only complexity/docstring/beartype rules. Tests are still subject to C0302.
- `config/tach.toml` declares only `python_setup_lint.checkers` and `python_setup_lint.runner` as modules with no dependencies; excludes `.omp`/`.factory` as orchestration.

### 3.7 ADRs — problem statements to reconcile

All eight files are short problem statements, not full ADRs:

| File | Statement |
|---|---|
| `docs/adr/ADR-001.md` | Golden findings snapshot as behavior-preservation contract; notes integration only checks rule-name presence. (Current integration now also asserts exact multiset — partly stale.) |
| `docs/adr/ADR-002.md` | `_semantic.py` misuses a sentence-transformers cross-encoder; dependency heavy; heuristic actually makes every decision today; intent wants CPU-friendly small decision model. |
| `docs/adr/ADR-003.md` | Results cached per-machine in `~/.cache`, unbounded, keyed by 64-bit truncated SHA-256 including code context; W9704 can differ by machine; intent requires git-stored cache with cleanup. |
| `docs/adr/ADR-004.md` | Three workstreams span ~28.6k LOC / 184 files; parallel edits to shared test infra conflict; test infrastructure/assumptions must be validated before debloat. |
| `docs/adr/ADR-005.md` | Ruff format contract: claims plain `ruff format` rewrites ~109 files with line-length 88; claims 13 tools while `TOOLS` has 14. (Current dispatch uses `--check` + shipped config — verify stale.) |
| `docs/adr/ADR-006.md` | Golden contract hardening: `collect_findings` uses private pipeline/record parsers; sorts only in serialize; no zero-crash assertion. (`slice_tool_section` is now used at `tests/integration.py:175` — partly stale.) |
| `docs/adr/ADR-007.md` | Read-only lint with explicit cache refresh; a git-tracked cache written on every run makes lint non-hermetic. |
| `docs/adr/ADR-008.md` | Progressive epic decomposition after audits; read final post-consolidation HEAD before decomposing. |

### 3.8 Documentation drift (semantic + counts)

- `AGENTS.md:82` still says `cross-encoder reranker`; `:85` says configurable via `PYTHON_SETUP_LINT_RERANKER_MODEL`.
- `docs/semantic-justification.md:9-14` describes reranker-first/heuristic-fallback; `:34-45` says model/result caches under `~/.cache/python-setup/semantic`; `:47-54` fallback table; `:56-62` test strategy/research status.
- `docs/custom-checks.md:97` documents 0.5 threshold, `PYTHON_SETUP_LINT_RERANKER_MODEL`, SHA-256 cache over `(text, rule, code_context, comment, model)`.
- `docs/troubleshooting.md:97-109` cross-encoder download failure + cache deletion.
- `README.md:29` `[semantic]` line says “sentence-transformer-powered”; `README.md:72` update example pins `v1.2.5`.
- `docs/tutorials.md:12-15` calls it a “rerunner”; `:87,121` links.
- `CHANGELOG.md:3` top entry is `v1.2.9` while `pyproject.toml:3` is `1.2.10`; `CHANGELOG.md:113` is historical reranker fix.
- `tests/checkers/test_semantic_check.py:1` says “504 lines” but file is 506; `tests/runner/_factories_extras.py:1` says “502 lines” but file is 511.

## 4. Existing Tests & Conventions

### 4.1 How checker tests are written

- Pylint `CheckerTestCase` via `python_setup_lint.testing._make_tc` (`testing.py:18-22`) or `_walk_and_release` (`:25-38`).
- Typical pattern: parse a code string with `astroid`, set `module.file`, `tc.walk(module)`, then assert `msg.msg_id` / `len(msgs)`. Examples: `tests/checkers/test_suppression_justification_checker.py:26-120`, `tests/checkers/test_bare_except_comment_checker.py:20-32`.
- `tests/checkers/_factories.py` (1,393 lines) holds parametrize tables and factory helpers; its docstring (`:1-15`) claims “data tables are free LOC” and disables `too-many-lines`.
- `tests/runner/_factories.py` (209), `_factories_baseline.py`, `_factories_extras.py` (511), `_factories_tables.py` (394) split runner data; `_factories_extras.py:1-8` has **two** duplicate `too-many-lines` disables.

### 4.2 Markers / selection

- `pyproject.toml:48-55`: `addopts = "-m 'not slow'"`; markers `slow`, `no_external_api`, `with_real_api`, `implementation_detail`.
- `slow` count 18; `no_external_api` 702; `with_real_api` 1; `implementation_detail` 0.
- Model tests: 4 `TestRerankerPairs` are **skipped** (importorskip) and not slow; 2 `TestSuppressionRerankerPipeline` are slow-deselected; 3 `TestSemanticCheck` methods are slow (`test_semantic_check.py:361,384,402`). `docs/semantic-justification.md:58` says network tests are slow — the 4 pair tests contradict this and would download on first run if `sentence-transformers` were installed.

### 4.3 Assumption / infra tests

`tests/assumptions/` (393 LOC, 8 tests) pins third-party contracts:

- `test_astroid_contracts.py` — `Module.stream()`, doc node shapes, `nodes_of_class`, `Const`/`JoinedStr` spans.
- `test_beartype_contracts.py` — `TYPE_CHECKING`-only forward refs raise at first call, not import/decoration.
- `test_pylint_contracts.py` — checker `open/close` order, `release_messages()` shape, `MessageDefinitionTuple` field order.

This is the model for “test infra/assumptions first” (ADR-004): any new model/runtime dependency should get a similar assumption test (CPU load, `decide`/`classify` contract, probability range, no network on cache hit).

### 4.4 Semantic tests — current coverage and gaps

`tests/checkers/test_semantic_check.py` (506 lines, 19 test defs):

| Class / lines | What it does | Gap |
|---|---|---|
| `TestImportErrorFallback` `:20-42` | `check_if_meaningful` propagates `ImportError` when `_semantic` import is blocked. | Tests an import failure path, not model behavior. |
| `TestDefaultUserFallback` `:48-77` | Patches `_load_reranker` → `None`, asserts heuristic fallback. | Good deterministic fallback coverage. |
| `TestRerankerImportFallback` `:83-153` | Sentinel set on ImportError; second call does not retry import. | Coupled to sentence-transformers internals. |
| `TestBrushOffPatterns` `:159-209` | 35 brush-off strings with env `SEMANTIC=0`. | Overlaps `test_semantic_threshold`; no model. |
| `TestMeaningfulPatterns` `:212-257` | 33 meaningful strings with env `SEMANTIC=0`. | 30/33 duplicated by `test_semantic_threshold`. |
| `TestSemanticCheck` `:263-422` | Model smoke tests; one cache-hit test; three slow tests; weak `is None or isinstance(bool)` assertions. | No deterministic score contract; cache-hit test recomputes the 64-bit key (`:338-347`). |
| `TestRerankerPairs` `:424-506` | Four model-pair tests with `importorskip`, unmarked slow, weak `True/False or None` assertions. | Skipped in CI; not a behavior contract. |

`tests/checkers/test_semantic_threshold.py` (135 lines): 30 meaningful + 50 meaningless comments with `SEMANTIC=0` (`:29-69,73-135`). The 30 meaningful cases are a **subset of** `TestMeaningfulPatterns` (30/30 overlap); only 3 of the 50 meaningless cases overlap the brush-off list. This is coverage-only duplication, not a new behavior.

`tests/checkers/test_suppression_justification_checker.py` (390 lines, 42 tests): 40 heuristic/W9704 tests + a slow `TestSuppressionRerankerPipeline` class (`:356-390`) with 2 tests that `importorskip` and reset the cache. The 40 heuristic tests do **not** set `PYTHON_SETUP_LINT_SEMANTIC=0`; they rely on `sentence-transformers` being absent. If `[semantic]` is installed, they may take the model path and change outcomes. Same for `tests/checkers/test_bare_except_comment_checker.py` (11 tests, no env guard).

### 4.5 Debloat evidence (concrete, citation-backed)

| Finding | Evidence |
|---|---|
| Test suite is 2× src size | 18,671 test LOC vs 9,005 src LOC (`find … wc -l`). |
| Over-C0302 modules with disables | `dispatch.py` 542 (`:1`), `tests/checkers/_factories.py` 1,393 (`:15`), `tests/runner/_factories_extras.py` 511 (`:1,6` duplicate disables), `tests/checkers/test_semantic_check.py` 506 (`:1`). 7 `too-many-lines` disables total in src/tests. |
| Trivial-wrapper suppressions | 60 `# pylint: disable` occurrences: 39 `trivial-wrapper` + 21 `W9728`, mostly tests; only 2 in src. |
| Duplicated local test helpers | `_walk_and_release` defined in 10 test files plus shipped `testing.py:25-38`; `_msg_ids` defined in 8 test files. |
| Redundant semantic tests | 30/30 meaningful cases duplicated between `test_semantic_check.py:212-257` and `test_semantic_threshold.py:29-69`; threshold test is 135 lines for 2 parametrized functions. |
| Unused factory helpers | `assert_violation_contains_any` (`tests/runner/_factories.py:167`) and `assert_r4_reason` (`:200`) have zero references. |
| Hardcoded checkout paths | 5 test files / 10 occurrences of `/home/slava/aiexp/python-setup`: `tests/conftest.py:86`, `tests/runner/test_setup.py:252,277`, `tests/runner/test_setup_install.py:265,274,284,288,350`, `tests/runner/test_autofix_conflict_integration.py:181`, `tests/runner/test_t9_7_compose_pyright_live.py:31,37`. |
| Always-skipped live test | `tests/runner/test_t9_7_compose_pyright_live.py:29-37` skipif on the hardcoded checkout; 2 tests, 197 lines. |
| Weak end-to-end smoke | `tests/runner/test_real_pipeline_smoke.py:26-40` asserts only `isinstance(rc, int)` and tool-name presence. |
| Self-lint / config meta-tests | `tests/runner/test_self_lint_clean.py` (59 lines) runs full lint on the repo; `tests/runner/test_config_consistency.py` (9 tests) checks config files; `tests/runner/test_pyright_noise_filter.py` (2 slow tests) checks runner output; `tests/runner/test_runner_private_imports.py` checks import hygiene. These are the “never test linting” candidates to adjudicate. |
| Legacy milestone naming | `tests/runner/test_t1b_self_discovery.py`, `test_t3_coverage.py` (390), `test_t5_compose_ruff.py` (366), `test_t9_7_compose_pyright.py`, `test_t9_7_compose_pyright_live.py`, `test_t11_health_checks.py` (383) retain milestone IDs. |
| Test naming rule gap | `CodingRules.md:290` requires `test_<method>_given_<condition>_then_<expected>`; AST scan of 780 test defs finds 488 with `_given_` (292 not), e.g. `tests/runner/test_setup.py:124` `test_cases`. |
| Dead compat shims | `src/python_setup_lint/runner/baseline.py:20-42`: `peek_fallback_tools()` always returns `frozenset()`; `_compare_sorted` only re-exports `_baseline_helpers._compare_sorted` “for backwards compat”. Tests still assert the empty shim (`tests/runner/test_baseline_diff_edge.py:229-236`). |
| Misnamed/dead names | `suppression_justification_checker.py:63` `_legacy_scan` is the only scan path; `trivial_wrapper_checker.py:33-36` exempts `_legacy_to_records`, `_legacy_current_output`, `_legacy_saved_output` which no longer exist. |
| Runner strategy duplication | `dispatch.py:155-260` base `LintTool` + 7 per-tool subclasses; several override only to append a handful of flags (`_PylintPyiLintTool`, `_PylintTestsLintTool`, `_RuffFormatLintTool` at `:342-439`). |
| Report/doc drift | `AGENTS.md:10-11` says 1,290 pass / 15 deselected / ~53 s and 7 integration pass / ~30 s; actual 1,357 / 18 / ~28 s and 9 / ~65 s. `CHANGELOG.md:3` v1.2.9 vs `pyproject.toml:3` 1.2.10. `README.md:72` pins v1.2.5. |

### 4.6 Coding-rule enforcement mapping

Mechanically enforced today:

- Complexity: R0912/R0915/C0302 from `.pylintrc:2,22-27`; custom `unjustified-suppression`, `trivial-wrapper`, `generic-key-dict`, `unnamed-tuple-dict-value`, `missing-return-annotation`, `docstring-in-impl`, `pyi-underscore-symbol`, stub fidelity, etc. from `.pylintrc:17`.
- Typing/beartype: custom `missing-beartype`, `missing-return-annotation`, `generic-key-dict`, `unnamed-tuple-dict-value`; `mypy`, `pyright`, `ty`, `mypy.stubtest`.
- Test-specific: `.pylintrc-tests:37-43` enables W9704, W9702, W9728, W9729, W9738, W9739, etc.

Not mechanically enforced (judgment/manual):

- `CodingRules.md:93-107` simplification/wrapper inlining/redundant fallbacks/over-engineering.
- `CodingRules.md:278-286` “optimize test LoC and complexity vigorously”, “prefer long end-to-end scenario tests”, “reuse test code”, “test data factories”.
- `CodingRules.md:290` test naming.
- `CodingRules.md:292-307` isolation/fixture scope/conftest scope.
- `CodingRules.md:66-68` comments must not duplicate signatures; `.py` implementation comments only.
- `CodingRules.md:81` CHANGELOG user-visible only.
- `CodingRules.md:87` `design/` ADR format (current ADRs live in `docs/adr/`).

## 5. External model research (for the semantic swap)

The intent names GLiDE-0.4B or smaller, with the Jev Decision Index as reference. Facts gathered from the model cards and package registries (2026-11-08).

| Candidate | Size / params | License | Runtime | CPU evidence | Risk / notes |
|---|---|---|---|---|---|
| **fastino/GLiDE-0.4B** | 394,781,696 BF16 params; 0.81 GB weights; 7,999-token context | **Fastino Community License** (custom): free use, but production commercial use by entities with annual revenue > **$10M** requires a separate agreement; commercial use must display “Built with Fastino GLiDE”; derivative works share-alike | Vendored `glide/` package (~56 KB) inside the model repo; `torch==2.14.0`, `transformers==5.17.0` pins; `Glide.from_pretrained(path, device="cuda")` defaults to CUDA but accepts a `device` argument; encoder path uses `.to(device=device, dtype=dtype)` | Card says tested on RTX PRO 6000; **no CPU benchmark** | Heavy 0.8 GB download; npm-style vendored code, not a normal PyPI dependency; `glide` on PyPI 0.4.1 is an unrelated ETL package; non-MIT model/code license in an MIT project; torch/transformers pin conflict with current lock (torch 2.12.1 / transformers 5.12.1) |
| **fastino/GLiNER2.5-Decide** | 340M English classifier; stored `model.safetensors` 1.95 GB (F32 metadata 486M tensors) | **Apache-2.0** | `pip install "gliner2[local]"` (gliner2 2.1.0: torch>=2.1, transformers>=4.43,<6, peft, safetensors); `AutoExtractor.from_pretrained(...)`; `classify_text(text, {label_set})` | No explicit CPU benchmark; torch CPU feasible; card emphasizes local shipping | Simpler API and permissive license, but 1.95 GB download and 340M inference; returns a label string for single-label tasks, so a probability threshold may need a custom head/API |
| **fastino/GLiNER2.5-multi-Decide** | 287M multilingual; 1.15 GB safetensors | **Apache-2.0** | Same `gliner2[local]` | Same | Smaller than English Decide, multilingual; same API trade-off |
| **hotchpotch/bekko-system-one-v0-17m** | 16.8M params; 67 MB `model.safetensors`; 29 MB ONNX browser export | Model card has **no license metadata**; base is `cross-encoder/ettin-reranker-17m-v1` (Ettin MIT line) | `BekkoSentenceTransformer` via `trust_remote_code=True`; requirements `torch>=2.10,<2.11`, `transformers==5.17.0`, `sentence-transformers==6.1.0`; `predict()` returns choice/noul/score probabilities | **Explicit CPU or CUDA** (`device="cpu"`); browser ONNX demo CPU/WebGPU | Truly small compute, but custom remote code, no license tag, and strict torch 2.10–2.11 pin; S1MB full task avg 27.57 vs Jev 59.59 (weak generalization); ONNX path would need tokenizer/head work |
| **Elfsong/jev-ettin-150m-v16** | 149.6M params; 598 MB FP32 | **Apache-2.0** | Custom `inference/decision_index_engine.py`; CUDA-oriented example (`device="cuda"`), FP32 weights + BF16 autocast; license requires supplying loader, not `AutoModelForSequenceClassification` | No CPU claim; CUDA B200 latency reported | Permissive and moderate size, but custom inference code and GPU-oriented validation |
| Other Decision Index sub-500M models | e.g. `tardellirs/crivo-17m/32m/68m/150m/400m`, `moganai/lavoir`, `Elfsong/jev-ettin-150m/400m` | Mixed: `crivo`/`lavoir` are **CC-BY-NC-4.0** (non-commercial); `jev-ettin` Apache-2.0 | Custom option-marker readout implementations | Varies | Non-commercial licenses are unsuitable for an MIT developer tool; evaluate case-by-case |

The Decision Index leaderboard (`https://huggingface.co/spaces/multimodalart/jev-decision-index`) lists ~200 models and includes many sub-500M entrants; the README is the authoritative candidate index. For a CPU-only tool, the practical shortlist is GLiDE-0.4B (0.81 GB, permissive-ish but custom license), GLiNER2.5-Decide (Apache-2.0, 1.95 GB), and bekko-17m (67 MB, CPU-explicit, but license/pin risk).

Environment feasibility facts:

- `torch 2.12.1` publishes cp314 manylinux wheels (532 MB x86_64 wheel) — Python 3.14 is supported.
- `onnxruntime 1.31.1` publishes cp314 manylinux wheels — an ONNX-only path is feasible and avoids torch (~532 MB + 18 CUDA/NVIDIA packages).
- Current `uv.lock` resolves `torch 2.12.1` with `cuda-bindings`, `cuda-toolkit`, `triton`, and 15 `nvidia-*` packages (`uv.lock:1552-1602`); there is no `[tool.uv.sources]` CPU index pin in `pyproject.toml`.
- `sentence-transformers` 6.2.0 requires `transformers>=5.0,<6` and `torch>=2.2`; the optional extra currently pins only `sentence-transformers>=3.0.0` (`pyproject.toml:28-31`).

## 6. Open Questions & Uncertainties (architect/spike framing)

1. **Model choice + license.** GLiDE-0.4B is the named example but its Fastino Community License imposes revenue/attribution/share-alike terms and its `glide/` code is vendored, not a PyPI package. GLiNER2.5-Decide is Apache-2.0 but 1.95 GB. bekko-17m is 67 MB/CPU-explicit but has no license metadata and strict pins. Decide whether a non-MIT model license is acceptable for `python-setup` (MIT, `pyproject.toml:19-20`) and whether the model is downloaded at runtime vs vendored.
2. **CPU latency/memory budget.** No candidate has a published CPU benchmark; GLiDE/GLiNER cards report GPU numbers only. W9704/W9738 can call the scorer for every suppression with a reason and every `Any` annotation; this repo alone has ~407 suppression-like comments. Measure cold/warm latency and peak RSS on representative comments; decide batching, max context, and whether to cap calls.
3. **Pipeline placement.** Current order is semantic-first, heuristic-fallback (`_base.py:150-158`). ADR-002’s title says “heuristic-gated local decision model”. Choose: model-first with heuristic fallback (current), heuristic-first then model only for borderline cases, or heuristic-veto + model-confirm. Each changes W9704/W9738 outcomes and cache requirements.
4. **Behavior-preservation contract.** Golden (158 findings) and integration (`mod.py:49` reject, `:56` accept) run with `SEMANTIC=0`. Define the contract for semantic-on: must the existing labeled corpora (`30` meaningful + `50` meaningless + `33` meaningful + `35` brush-off) keep their expected labels? Define precision/recall and a new deterministic contract test for the model path.
5. **Cache shape / key.** Current key is a 64-bit truncated SHA-256 over `(text, rule, code_context, comment, model)` (`_semantic.py:143-155`). For a git-stored cache, include model ID + revision/hash + prompt-template version + threshold + normalization version; use full SHA-256 hex, sorted keys, `indent=2`, trailing newline (repo convention at `tests/_golden.py:156-172`); store only hash→bool (no raw comments/PII). Decide max entries, expiry/prune policy, and whether cache entries for old model versions are deleted.
6. **Read-only lint / refresh.** ADR-007 requires lint to be read-only and cache refresh to be explicit. Current `_save_result_cache` writes on every new result (`_semantic.py:71-78,187-188`), which would dirty a tracked file. Decide: read-only cache with `--refresh-semantic-cache` (or env var), atomic tempfile+rename write (pattern at `runner/baseline.py:201-229`), file locking, and whether cache-miss lint falls back to heuristic or fails.
7. **Env/API compatibility.** Keep `PYTHON_SETUP_LINT_SEMANTIC` (default `"1"`) and `PYTHON_SETUP_LINT_RERANKER_MODEL` names, or introduce `PYTHON_SETUP_LINT_DECISION_MODEL` and deprecate the old name? Keep the extra name `[semantic]` or rename? Update `README.md:29`, `docs/tutorials.md:12-15`, `docs/custom-checks.md:97`, `docs/troubleshooting.md:97-109`, `docs/semantic-justification.md`, `AGENTS.md:79-85`.
8. **Test strategy for the model path.** No deterministic test exists. Options: inject a scorer via a private `_score` hook and monkeypatch it; commit a small decision cache for the existing labeled corpus and run cache-hit tests without a model; or use a tiny local model (bekko-17m ONNX) in a slow test. Also fix the existing test-isolation bugs: `TestRerankerPairs` not marked slow (`test_semantic_check.py:424-506`), semantic tests that delete `~/.cache` via `_reset_cache` (`_semantic.py:81-90`), and checker tests that rely on `sentence-transformers` being absent (`test_suppression_justification_checker.py`, `test_bare_except_comment_checker.py`).
9. **“Never test linting.”** Ambiguous in a linter product. Candidate removals: `tests/runner/test_self_lint_clean.py` (self-lint), `tests/runner/test_config_consistency.py` (config file consistency), `tests/runner/test_pyright_noise_filter.py` (runner display guard), `tests/runner/test_runner_private_imports.py` (import hygiene). Confirm the intended boundary: remove self-referential gates and rely on `uv run lint`, or keep them as gate evidence.
10. **Debloat scope / test-intent mapping.** The safe net is `tests/_golden.py` + `tests/assumptions/` + `tests/integration.py`; any deletion should map old test intent → retained scenario/assumption. Decide whether to split `tests/checkers/_factories.py` (1,393) and `tests/runner/_factories_extras.py` (511) by checker group, inline local `_walk_and_release`/`_msg_ids` helpers into `testing.py`, and remove unused `assert_violation_contains_any`/`assert_r4_reason`.
11. **Code debloat scope.** `dispatch.py` 542 lines with 7 strategy subclasses; `baseline.py` dead compat (`peek_fallback_tools`, `_compare_sorted`); `trivial_wrapper_checker` dead `_legacy_*` exemptions; `_legacy_scan` naming. Decide whether to delete compat shims and tests (behavior-preserving) or keep them for external consumers; if deleted, update `runner/__init__.py:17,22,62` and tests.
12. **Gate + golden process.** `lint.baseline` is empty; any new violation fails the self-lint/pre-commit gate. Golden regeneration is local-only via `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1` and refused under CI (`tests/_golden.py:374-390`); tool counts are rewritten atomically. Decide how to validate the final worktree given the detect-secrets MemoryError on large tracked artifacts (scope detect-secrets or clean the tree; do not edit the baseline).
13. **Doc/ADR reconciliation.** Eight ADRs are problem statements, some partly stale (ADR-001 exact multiset now exists; ADR-005 check-only format now exists; ADR-006 `slice_tool_section` now used). Decide whether to formalize them into Decision/Consequences ADRs, move them to `design/` per `CodingRules.md:87`, and update stale counts (`AGENTS.md:10-11`), version (`CHANGELOG.md:3` vs `pyproject.toml:3`), and README pin (`README.md:72`).

## 7. Likely touch map (for planning, not a decision)

| Workstream | Primary files | Contract tests / gates |
|---|---|---|
| Coding-rule enforcement | `src/python_setup_lint/runner/dispatch.py`, `baseline.py`, `testing.py`, checker modules; `config/.pylintrc*`; test helpers | `uv run lint` (13 tools pass, 61 s), `tests/runner/test_config_consistency.py`, `tests/runner/test_self_lint_clean.py` |
| Code/test debloat | `tests/checkers/_factories.py`, `tests/runner/_factories*.py`, `tests/_project_helpers.py`, duplicated `_walk_and_release`/`_msg_ids`, over-limit modules, dead compat shims | `uv run pytest -q` (1,357 pass), `tests/assumptions/`, `tests/integration.py` |
| Semantic swap | `checkers/_semantic.py` + `.pyi`, `checkers/_base.py`, W9704/W9738 checkers, `pyproject.toml` extra, `uv.lock`, `.gitignore:243-244`, semantic tests, docs/AGENTS/README | `uv run pytest -q` (4 model skips), `tests/integration.py` (semantic=0 golden), new deterministic model-path test + cache contract |

Key invariants to preserve:

- W9704 message text/ID and line/col behavior unchanged; W9738 unchanged.
- Heuristic fallback exact outcomes unchanged for the existing 30+50+33+35 labeled comments and for all currently passing checker tests.
- Golden 158 findings unchanged unless intentionally regenerated; `lint.baseline` stays `[]`.
- Default lint without `[semantic]` never imports heavy ML deps and remains fast.
- Heavy model imports stay lazy inside the scorer (`_base.py:150-156` pattern), so pylint plugin import remains cheap.
- Any git-stored cache is tiny, deterministic, sorted, and read-only during lint (ADR-007).
`). Read code ONLY to verify specific failure details (few targeted reads). Unknowns → `fix-item`, spike outline, or `human-async` instead of broad code exploration. Keep terse.
- Decision options (yield `decision` matching `decisions.schema.json` with `context: "non-item"`):
  - `fix-item`: specify an item outline to be scheduled via PM edits to resolve the defect.
  - `accept-with-debt`: accept current state; track defect as technical debt in subsequent waves/iterations.
  - `human-async`: route an ambiguous requirement or external dependency blocker to the human operator via `steer/tousertoreview/`.
  - `abort`: terminate the run if the task is fundamentally compromised or unachievable.
- Root cause diagnosis: identify why the non-item seam or close-up check failed and select the lowest-impact resolution.

## Task & Seam
Task: modernize
Context: Waves completed with no progress for 3 consecutive waves (latest wave 4). Blocked: (none).

## Failure / Review Findings
Decide: continue with direction (fix-item), end-iteration (accept-with-debt), escalate to operator (human-async), or abort.

## Tech Debt


## Context Pack
# Context Pack — `modernize`

Repository: `python-setup` v1.2.10 (`pyproject.toml:1-4`), MIT (`pyproject.toml:19-20`), Python `>=3.14`. The repo is both a lint-tooling product and its own heaviest consumer: 14 built-in tools (`src/python_setup_lint/runner/dispatch.py:46-137`), an empty frozen baseline (`lint.baseline:1` = `[]`), a golden snapshot of 158 findings (`tests/data/golden/minimal_sample_project_findings.json`), and 18,671 test LOC against 9,005 src LOC.

## 0. Executive snapshot (measured 2026-11-08)

| Gate | Command | Result |
|---|---|---|
| Unit suite | `uv run pytest -q` | **1,357 passed, 4 skipped, 18 deselected, ~28–30 s**. The 4 skips are the `TestRerankerPairs` model tests (`tests/checkers/test_semantic_check.py:432,453,473,493`). |
| Integration | `uv run pytest tests/integration.py -q` | **9 passed, ~65 s** (AGENTS.md says 7 pass / ~30 s — stale). |
| Lint (all except detect-secrets) | `uv run lint --tools "tach check,ruff format,ruff check,rumdl check,mypy,yamllint,ty check,mypy.stubtest,pyright check,pyright verify types,pylint,pylint-pyi,pylint tests"` | **all 13 PASSED, ~61 s**. |
| Lint (full) | `uv run lint` | detect-secrets dies with `MemoryError` scanning very large tracked binary artifacts present in this worktree. This is environmental, not a product-code violation; re-validate on a clean checkout/scoped tree. Do not weaken the baseline in response. |
| Collection | `uv run pytest --collect-only -q` | 1,379 collected; 18 slow deselected by `addopts = "-m 'not slow'"` (`pyproject.toml:48-55`). |

Product tree: 75 `.py` src modules + 59 test modules; 54 `.pyi` stubs; 780 test definitions. Marker counts: 18 slow, 702 `no_external_api`, 1 `with_real_api`, **0 `implementation_detail`** (marker declared at `pyproject.toml:50-55` but unused).

The semantic path is effectively dormant in dev/CI: `sentence-transformers` is only an optional extra (`pyproject.toml:28-31`), not in the dev group (`pyproject.toml:58-85`); the 4 model-pair tests skip, the 2 reranker-pipeline tests are slow-deselected, and the golden capture explicitly sets `PYTHON_SETUP_LINT_SEMANTIC=0` (`tests/integration.py:112`). Any model swap therefore has **no existing deterministic test coverage**.

## 1. Module Map

### 1.1 Product source

| Area | Files / LOC | Responsibility |
|---|---|---|
| Shared checker utilities | `src/python_setup_lint/checkers/_base.py` (238) | `MessageDef`, `_msgs`, path/source-root helpers, `check_if_meaningful` + heuristic fallback. |
| Semantic scorer | `src/python_setup_lint/checkers/_semantic.py` (189) + `_semantic.pyi` | Lazy cross-encoder load, pair scoring, result cache. |
| W9704 checker | `src/python_setup_lint/checkers/conformance/suppression_justification_checker.py` (393) + `.pyi` | Raw-line suppression scan, `Any` param/return/annassign scan, justification call sites. |
| W9738 checker | `src/python_setup_lint/checkers/conformance/bare_except_comment_checker.py` (128) | Bare/`except Exception` comment justification; second consumer of `check_if_meaningful`. |
| Other conformance checkers | `src/python_setup_lint/checkers/conformance/*.py` | 16 checker modules (trivial-wrapper, generic-key-dict, unnamed-tuple-dict, structlog, silent-except, etc.). |
| Stub checkers | `src/python_setup_lint/checkers/stub/*.py` | `.pyi` fidelity, coverage, docstrings, import contract, normalizer. |
| Runner registry/strategies | `src/python_setup_lint/runner/dispatch.py` (542) | 14 `ToolSpec`s, 7 strategy subclasses, `EXPECTED_TOOL_NAMES`, `register_lint_tool`. |
| Runner CLI | `src/python_setup_lint/runner/cli.py` (413) | `main`, `run_lint`, `--tools`, `--path`, `--fix`, baseline flow. |
| Baseline | `src/python_setup_lint/runner/baseline.py` (303) | Violations-only diff, atomic baseline write, dead compat exports at `:20-42`. |
| Parsers | `src/python_setup_lint/runner/parsers.py` (290), `_record_parsers.py` (277), `_record_types.py` | Tool-output parsing and `Record` type. |
| Command building | `src/python_setup_lint/runner/cmd_build.py` (293) | Pylint file discovery, config flags, pyright/ruff composition. |
| Installer | `src/python_setup_lint/setup.py` (413), `_setup_precommit.py` (145), `_setup_update.py` (108) | `install`/`update`, shipped configs, pre-commit template. |
| Shipped test helpers | `src/python_setup_lint/testing.py` (196) | `_make_tc`, `_walk_and_release`, `FakeRunCmd`, `make_lint_result`, pre-commit validators. |
| Shipped configs | `config/.pylintrc`, `.pylintrc-tests`, `.pylintrc-pyi`, `ruff.toml`, `mypy.ini`, `pyrightconfig.json`, `rumdl.toml`, `tach.toml`, `ty.toml`, `.yamllint` | Enforced thresholds and rule selection. |

### 1.2 Semantic / justification subsystem

```text
suppression line or Any annotation
  └─ suppression_justification_checker.py  (W9704)
     or bare_except_comment_checker.py     (W9738)
        └─ check_if_meaningful()           _base.py:142-238
           ├─ if PYTHON_SETUP_LINT_SEMANTIC != "0":
           │    lazy import _semantic, call semantic_check_if_meaningful()
           │      ├─ load result cache            _semantic.py:55-68, 136-138
           │      ├─ cache lookup (64-bit key)    _semantic.py:143-157
           │      ├─ lazy model load              _semantic.py:93-122
           │      ├─ pair predict + score >= 0.5  _semantic.py:159-186
           │      └─ persist cache                _semantic.py:71-78, 187-188
           └─ result is None → exact-string heuristic  _base.py:160-238
```

### 1.3 Test / gate subsystem

| Area | Files | Notes |
|---|---|---|
| Checker unit tests | `tests/checkers/test_*.py` (26 files) + `_factories.py` (1,393) | Pylint `CheckerTestCase` via `python_setup_lint.testing._make_tc` / `_walk_and_release`. |
| Runner unit tests | `tests/runner/test_*.py` (30 files) + `_factories*.py` (1,114 total) + `_autofix_helpers.py` | Tool registry, command building, baseline diff, autofix, setup. |
| Golden helpers | `tests/_golden.py` (446), `tests/test_golden.py` (414) | Canonical finding serialization, multiset diff, coverage assertions. |
| Shared project helpers | `tests/_project_helpers.py` (204) | Sample-project copy, git staging, runner config, install idempotence. |
| Third-party assumption tests | `tests/assumptions/*.py` (393; 8 tests) | Pin astroid 4.0.4, beartype 0.22.9, pylint 4.0.6 contracts. |
| Integration | `tests/integration.py` (498; 9 tests) | Install → lint → golden → config overlay → pre-commit validation → tool parity. |
| Golden data | `tests/data/golden/*.json` | 158 findings, 51 unique rules, per-tool minimum counts. |
| Sample project | `tests/data/minimal_sample_project/` | Planted violations, `violations.txt` oracle, `mod.py:41-63` W9704 cases. |

### 1.4 Docs, ADRs, packaging

- `AGENTS.md:9-11` — stale quick-command counts (1,290 pass / 15 deselected / ~53 s; 7 integration pass / ~30 s).
- `AGENTS.md:79-85` — semantic pipeline described as cross-encoder reranker with `PYTHON_SETUP_LINT_RERANKER_MODEL`.
- `AGENTS.md:87-93` — testing strategy / 14-tool integration claim.
- `AGENTS.md:121-139` — pre-commit hooks; `lint --fix --baseline lint.baseline` on every commit.
- `CodingRules.md:9-16` — typing/beartype/suppression justification rules.
- `CodingRules.md:90-107` — simplification, wrappers, duplicated logic, redundant fallbacks.
- `CodingRules.md:139-159` — enforced R0912 ≤16 branches, R0915 ≤65 statements, C0302 ≤500 lines/module (split modules, never raise thresholds).
- `CodingRules.md:230-307` — test metrics, mocking at boundaries, categories, coverage, naming (`test_<method>_given_<condition>_then_<expected>`), isolation, fixture scope, conftest scope.
- `docs/semantic-justification.md:1-62` — full current semantic design and cache docs.
- `docs/troubleshooting.md:97-109` — cross-encoder download-failure fallback and cache location.
- `docs/custom-checks.md:53-55,97-104` — W9704 rules and `check_if_meaningful` contract.
- `docs/tutorials.md:12-15,87,121` — `[semantic]` install and guide links.
- `README.md:29,105` — `[semantic]` install line and semantic guide link.
- `docs/adr/ADR-001.md` … `ADR-008.md` — eight 1–3-line problem statements for the three workstreams (see §3.10).
- `uv.lock:980-1036` — project extras/dev deps; `:1552-1602` — torch 2.12.1 + CUDA/NVIDIA graph, transformers 5.12.1.

## 2. Key Interfaces & Signatures

### 2.1 `check_if_meaningful` — `src/python_setup_lint/checkers/_base.py:142-238`

```python
@beartype
def check_if_meaningful(
    text: str,
    *,
    rule: str | None = None,
    code_context: str | None = None,
    comment: str | None = None,
) -> bool:
```

- Env gate: `os.environ.get("PYTHON_SETUP_LINT_SEMANTIC", "1") == "1"` (`:151`). The module is imported lazily **inside** the function (`:152-154`), so heavy optional deps must never be imported at checker-module top level.
- If semantic returns non-`None`, that bool is returned (`:156-158`); otherwise the exact-string heuristic runs (`:160-238`).
- Heuristic contract: strip `comment or text`; reject empty/`<5` chars (`:161-163`); reject exact boilerplate tokens (large set at `:165-209`, includes `noqa`, `ignore`, `pre-existing`, `baseline`, `wip`, `temp`, `legacy`, `later`, `for now`, `carryover`); reject exact meaningless multi-word phrases (`:213-234`); reject a reason equal to the rule symbol (`:238`). Matching is exact-string/lowercase, **not semantic**.

### 2.2 `semantic_check_if_meaningful` — `src/python_setup_lint/checkers/_semantic.py:125-189`

```python
@beartype
def semantic_check_if_meaningful(
    text: str,
    *,
    rule: str | None = None,
    code_context: str | None = None,
    comment: str | None = None,
) -> bool | None:
```

- Tri-state contract: `True` = meaningful, `False` = reject, `None` = model unavailable/failed → caller falls back to heuristic.
- Primary text = `(comment or text).strip()`; empty → `False` without model (`:134,139-140`).
- Cache key = first 8 bytes of SHA-256 over `(text, rule, code_context, comment, _RERANKER_MODEL)`, converted to `int` (`:143-155`).
- Cache hit returns before model load (`:156-157`).
- Model load is a module-global singleton with a permanent failure sentinel (`:40-42,93-122`).
- Query construction: `rule: … | context: <first 200 chars>` when rule/context present; self-pair otherwise (`:164-176`).
- Score threshold is hard-coded `>= 0.5` (`:186`).
- New results are stored and the whole cache file is rewritten (`:187-188`).

### 2.3 Message definitions

W9704 — `suppression_justification_checker.py:31-41`:

```python
msgs = _msgs(
    W9704=MessageDef(
        message="Suppression comment without technical justification: %s",
        symbol="unjustified-suppression",
        description="Suppression comments ... must be accompanied by a technical reason ...",
    ),
)
```

W9738 — `bare_except_comment_checker.py:21-36` (message symbol `bare-except-comment`). Both checkers call the same `check_if_meaningful`; the model swap affects **both** rules.

### 2.4 Runner / registry

- `ToolSpec` — `src/python_setup_lint/runner/types.py:12-23` (`name`, `command`, `supports_fix/path/exclude`, `default_paths`, `fix_flags`, `exclude_flag`, `timeout`, `memory_limit_mb`).
- `TOOLS` — exactly 14 entries at `dispatch.py:46-137`: tach check, ruff format, ruff check, rumdl check, mypy, yamllint, ty check, mypy.stubtest, pyright check, pyright verify types, pylint, pylint-pyi, pylint tests, detect-secrets.
- `EXPECTED_TOOL_NAMES` derives from `TOOLS` (`dispatch.py:141-152`).
- `ruff format` is check-only on normal passes (`--check`) and mutates only in the fix phase (`dispatch.py:405-439`).
- `detect-secrets` command is `git ls-files -z | xargs -0 detect-secrets-hook --baseline .secrets.baseline …` (`dispatch.py:261-292`). Any git-tracked cache must remain tiny and text-safe.

### 2.5 Test helpers (shipped)

`src/python_setup_lint/testing.py`:

- `_make_tc(checker_class)` (`:18-22`) — builds a `CheckerTestCase`.
- `_walk_and_release(checker_class, code, file_path=...)` (`:25-38`) — parses source, walks checker, releases messages. Used directly by 6 test files and re-defined locally by 10 others.
- `make_lint_result(...)` (`:44-61`) — constructs `LintResult`.
- `FakeRunCmd` / `fake_run_cmd_factory` (`:64-103`) — injectable command runner.
- `test_checked_main`, `assert_precommit_config_valid`, `assert_precommit_hooks_shape` (`:106-196`).

## 3. Relevant Excerpts

### 3.1 Current semantic pipeline — `_semantic.py`

Header (`:1-12`) documents “Cross-encoder reranking (jina-reranker-v2-base-multilingual)” and the lazy-load/fallback contract. Cache/model globals (`:37-52`):

```python
_CACHE_DIR = Path.home() / ".cache" / "python-setup" / "semantic"
_RERANKER_INSTANCE: CrossEncoder | None = None
_RERANKER_UNAVAILABLE: bool = False
_RESULT_CACHE_FILE = _CACHE_DIR / "results.json"
_RESULT_CACHE: dict[int, bool] | None = None
_RERANKER_MODEL = os.environ.get(
    "PYTHON_SETUP_LINT_RERANKER_MODEL",
    "jina-reranker-v2-base-multilingual",
)
```

Lazy loader (`:93-122`): imports `sentence_transformers.CrossEncoder` only inside the call; on `ImportError` sets `_RERANKER_UNAVAILABLE = True` and returns `None`; on `OSError/RuntimeError/ValueError` logs warning and returns `None`; `CrossEncoder(_RERANKER_MODEL, cache_folder=str(cache))`.

Cache load/save/reset (`:55-90`):

```python
try:
    raw = _RESULT_CACHE_FILE.read_text()
    return {int(k): v for k, v in json.loads(raw).items()}
except FileNotFoundError:  # expected on first run
    return {}
except json.JSONDecodeError, OSError, ValueError:
    _LOG.warning("Failed to load result cache", exc_info=True)
    return {}
...
_CACHE_DIR.mkdir(parents=True, exist_ok=True)
assert _RESULT_CACHE is not None
_RESULT_CACHE_FILE.write_text(json.dumps({str(k): v for k, v in _RESULT_CACHE.items()}))
```

`_reset_cache()` (`:81-90`) is a test helper that clears memory and **deletes `~/.cache/python-setup/semantic/results.json`**.

Scoring (`:158-189`): pair `(primary, query)`, `score = float(scores[0])`, `result = score >= 0.5`, persist. Exceptions from `predict` (`OSError/RuntimeError/ValueError`) return `None`.

### 3.2 W9704 call sites

`suppression_justification_checker.py`:

- Raw-line scan: `visit_module` (`:43-61`) reads `node.stream()`, decodes, calls `_legacy_scan` (`:63-91`). Despite the name, `_legacy_scan` is the **only** scan path. It builds string-literal spans, skips matches inside strings, checks `_has_justification`, and emits W9704 (`:86-91`).
- `Any` in function params/return: `_check_function` (`:96-124`) collects annotations and calls `_emit_if_unjustified` per annotation line.
- `Any` in `AnnAssign`: `_check_any_annotation` (`:164-184`).
- `_emit_if_unjustified` (`:136-162`) extracts the source line, looks for a trailing `# <reason>`, and calls:

```python
if check_if_meaningful(
    reason, comment=reason, rule="unjustified-suppression",
    code_context=src_line.split("#", 1)[0].strip(),
):
    return
self.add_message("unjustified-suppression", line=lineno, node=annotation, args=(annotation.as_string(),))
```

- Trailing reason path (`:350-375`) checks every suppression match and calls the helper with `rule="unjustified-suppression"` and code before `#`.
- Preceding-comment path (`:377-386`) does the same with the previous line.
- Suppression patterns are `# pylint: disable=`, `# noqa`, `# type: ignore`, `# ty: ignore` (`:22-28`).

### 3.3 W9738 call sites

`bare_except_comment_checker.py:98-122`: trailing `# <comment>` calls `check_if_meaningful(text=comment_text, rule="bare-except-comment", code_context=line.strip(), comment=comment_text)`; preceding `#` comment does the same. So a model/cache/threshold change affects W9738 as well as W9704.

### 3.4 Gating and behavior contract

- Default is **on** (`"1"`), not opt-in (`_base.py:151`); docs say the same (`docs/semantic-justification.md:3,18`).
- If `sentence-transformers` is absent, `_load_reranker` returns `None`, so heuristic decides every case. This is the current dev/CI behavior.
- If `_semantic` module import itself fails, `check_if_meaningful` does **not** catch it; `TestImportErrorFallback` expects `ImportError` to propagate (`tests/checkers/test_semantic_check.py:20-42`).
- The model path never runs in the golden snapshot because `tests/integration.py:112` sets `SEMANTIC_ENV=0`; the snapshot is therefore a contract for the heuristic + non-semantic checkers only.

### 3.5 Golden contract — `tests/_golden.py`

- `SEMANTIC_ENV = "PYTHON_SETUP_LINT_SEMANTIC"` and `UPDATE_ENV = "PYTHON_SETUP_LINT_UPDATE_GOLDEN"` (`:53-58`).
- Canonical serialization: sorted findings, `json.dumps(..., indent=2, sort_keys=True) + "\n"` (`:156-172`); tool minimums use the same format (`:166-172`).
- `collect_findings` bypasses `run_lint` and uses `_run_tool_pipeline` + record parsers, selecting only tools in `_RECORD_PARSERS` (`:191-231`).
- `assert_matches_golden` rewrites only when `UPDATE_ENV=1` and refuses under `CI`/`GITHUB_ACTIONS` (`:374-390`).
- `assert_golden_byte_identical` hashes every serialized run (`:392-410`).
- Golden content: **158 findings, 51 unique rules, 18 `unjustified-suppression`, 2 `bare-except-comment`** (counted from `tests/data/golden/minimal_sample_project_findings.json`). Tool minimums at `tests/data/golden/minimal_sample_project_tool_counts.json`.
- Integration asserts the exact multiset and byte-identical replay (`tests/integration.py:114-122`), then specifically asserts `mod.py:49` (“pre-existing”) is flagged and `mod.py:56` (“carried from external library …”) is not (`:124-129`).

### 3.6 Config thresholds

- `.pylintrc:2` `max-module-lines=500`; `:22-27` `max-statements=65`, `max-branches=16`, `max-locals=20`, `max-nested-blocks=8`, `max-public-methods=30`, `max-attributes=15`.
- `.pylintrc-tests:20` `max-module-lines=500`; `:37-43` enables custom test rules (W9704, trivial-wrapper, redundant-type-guard, duplicate-code…) and disables production-only complexity/docstring/beartype rules. Tests are still subject to C0302.
- `config/tach.toml` declares only `python_setup_lint.checkers` and `python_setup_lint.runner` as modules with no dependencies; excludes `.omp`/`.factory` as orchestration.

### 3.7 ADRs — problem statements to reconcile

All eight files are short problem statements, not full ADRs:

| File | Statement |
|---|---|
| `docs/adr/ADR-001.md` | Golden findings snapshot as behavior-preservation contract; notes integration only checks rule-name presence. (Current integration now also asserts exact multiset — partly stale.) |
| `docs/adr/ADR-002.md` | `_semantic.py` misuses a sentence-transformers cross-encoder; dependency heavy; heuristic actually makes every decision today; intent wants CPU-friendly small decision model. |
| `docs/adr/ADR-003.md` | Results cached per-machine in `~/.cache`, unbounded, keyed by 64-bit truncated SHA-256 including code context; W9704 can differ by machine; intent requires git-stored cache with cleanup. |
| `docs/adr/ADR-004.md` | Three workstreams span ~28.6k LOC / 184 files; parallel edits to shared test infra conflict; test infrastructure/assumptions must be validated before debloat. |
| `docs/adr/ADR-005.md` | Ruff format contract: claims plain `ruff format` rewrites ~109 files with line-length 88; claims 13 tools while `TOOLS` has 14. (Current dispatch uses `--check` + shipped config — verify stale.) |
| `docs/adr/ADR-006.md` | Golden contract hardening: `collect_findings` uses private pipeline/record parsers; sorts only in serialize; no zero-crash assertion. (`slice_tool_section` is now used at `tests/integration.py:175` — partly stale.) |
| `docs/adr/ADR-007.md` | Read-only lint with explicit cache refresh; a git-tracked cache written on every run makes lint non-hermetic. |
| `docs/adr/ADR-008.md` | Progressive epic decomposition after audits; read final post-consolidation HEAD before decomposing. |

### 3.8 Documentation drift (semantic + counts)

- `AGENTS.md:82` still says `cross-encoder reranker`; `:85` says configurable via `PYTHON_SETUP_LINT_RERANKER_MODEL`.
- `docs/semantic-justification.md:9-14` describes reranker-first/heuristic-fallback; `:34-45` says model/result caches under `~/.cache/python-setup/semantic`; `:47-54` fallback table; `:56-62` test strategy/research status.
- `docs/custom-checks.md:97` documents 0.5 threshold, `PYTHON_SETUP_LINT_RERANKER_MODEL`, SHA-256 cache over `(text, rule, code_context, comment, model)`.
- `docs/troubleshooting.md:97-109` cross-encoder download failure + cache deletion.
- `README.md:29` `[semantic]` line says “sentence-transformer-powered”; `README.md:72` update example pins `v1.2.5`.
- `docs/tutorials.md:12-15` calls it a “rerunner”; `:87,121` links.
- `CHANGELOG.md:3` top entry is `v1.2.9` while `pyproject.toml:3` is `1.2.10`; `CHANGELOG.md:113` is historical reranker fix.
- `tests/checkers/test_semantic_check.py:1` says “504 lines” but file is 506; `tests/runner/_factories_extras.py:1` says “502 lines” but file is 511.

## 4. Existing Tests & Conventions

### 4.1 How checker tests are written

- Pylint `CheckerTestCase` via `python_setup_lint.testing._make_tc` (`testing.py:18-22`) or `_walk_and_release` (`:25-38`).
- Typical pattern: parse a code string with `astroid`, set `module.file`, `tc.walk(module)`, then assert `msg.msg_id` / `len(msgs)`. Examples: `tests/checkers/test_suppression_justification_checker.py:26-120`, `tests/checkers/test_bare_except_comment_checker.py:20-32`.
- `tests/checkers/_factories.py` (1,393 lines) holds parametrize tables and factory helpers; its docstring (`:1-15`) claims “data tables are free LOC” and disables `too-many-lines`.
- `tests/runner/_factories.py` (209), `_factories_baseline.py`, `_factories_extras.py` (511), `_factories_tables.py` (394) split runner data; `_factories_extras.py:1-8` has **two** duplicate `too-many-lines` disables.

### 4.2 Markers / selection

- `pyproject.toml:48-55`: `addopts = "-m 'not slow'"`; markers `slow`, `no_external_api`, `with_real_api`, `implementation_detail`.
- `slow` count 18; `no_external_api` 702; `with_real_api` 1; `implementation_detail` 0.
- Model tests: 4 `TestRerankerPairs` are **skipped** (importorskip) and not slow; 2 `TestSuppressionRerankerPipeline` are slow-deselected; 3 `TestSemanticCheck` methods are slow (`test_semantic_check.py:361,384,402`). `docs/semantic-justification.md:58` says network tests are slow — the 4 pair tests contradict this and would download on first run if `sentence-transformers` were installed.

### 4.3 Assumption / infra tests

`tests/assumptions/` (393 LOC, 8 tests) pins third-party contracts:

- `test_astroid_contracts.py` — `Module.stream()`, doc node shapes, `nodes_of_class`, `Const`/`JoinedStr` spans.
- `test_beartype_contracts.py` — `TYPE_CHECKING`-only forward refs raise at first call, not import/decoration.
- `test_pylint_contracts.py` — checker `open/close` order, `release_messages()` shape, `MessageDefinitionTuple` field order.

This is the model for “test infra/assumptions first” (ADR-004): any new model/runtime dependency should get a similar assumption test (CPU load, `decide`/`classify` contract, probability range, no network on cache hit).

### 4.4 Semantic tests — current coverage and gaps

`tests/checkers/test_semantic_check.py` (506 lines, 19 test defs):

| Class / lines | What it does | Gap |
|---|---|---|
| `TestImportErrorFallback` `:20-42` | `check_if_meaningful` propagates `ImportError` when `_semantic` import is blocked. | Tests an import failure path, not model behavior. |
| `TestDefaultUserFallback` `:48-77` | Patches `_load_reranker` → `None`, asserts heuristic fallback. | Good deterministic fallback coverage. |
| `TestRerankerImportFallback` `:83-153` | Sentinel set on ImportError; second call does not retry import. | Coupled to sentence-transformers internals. |
| `TestBrushOffPatterns` `:159-209` | 35 brush-off strings with env `SEMANTIC=0`. | Overlaps `test_semantic_threshold`; no model. |
| `TestMeaningfulPatterns` `:212-257` | 33 meaningful strings with env `SEMANTIC=0`. | 30/33 duplicated by `test_semantic_threshold`. |
| `TestSemanticCheck` `:263-422` | Model smoke tests; one cache-hit test; three slow tests; weak `is None or isinstance(bool)` assertions. | No deterministic score contract; cache-hit test recomputes the 64-bit key (`:338-347`). |
| `TestRerankerPairs` `:424-506` | Four model-pair tests with `importorskip`, unmarked slow, weak `True/False or None` assertions. | Skipped in CI; not a behavior contract. |

`tests/checkers/test_semantic_threshold.py` (135 lines): 30 meaningful + 50 meaningless comments with `SEMANTIC=0` (`:29-69,73-135`). The 30 meaningful cases are a **subset of** `TestMeaningfulPatterns` (30/30 overlap); only 3 of the 50 meaningless cases overlap the brush-off list. This is coverage-only duplication, not a new behavior.

`tests/checkers/test_suppression_justification_checker.py` (390 lines, 42 tests): 40 heuristic/W9704 tests + a slow `TestSuppressionRerankerPipeline` class (`:356-390`) with 2 tests that `importorskip` and reset the cache. The 40 heuristic tests do **not** set `PYTHON_SETUP_LINT_SEMANTIC=0`; they rely on `sentence-transformers` being absent. If `[semantic]` is installed, they may take the model path and change outcomes. Same for `tests/checkers/test_bare_except_comment_checker.py` (11 tests, no env guard).

### 4.5 Debloat evidence (concrete, citation-backed)

| Finding | Evidence |
|---|---|
| Test suite is 2× src size | 18,671 test LOC vs 9,005 src LOC (`find … wc -l`). |
| Over-C0302 modules with disables | `dispatch.py` 542 (`:1`), `tests/checkers/_factories.py` 1,393 (`:15`), `tests/runner/_factories_extras.py` 511 (`:1,6` duplicate disables), `tests/checkers/test_semantic_check.py` 506 (`:1`). 7 `too-many-lines` disables total in src/tests. |
| Trivial-wrapper suppressions | 60 `# pylint: disable` occurrences: 39 `trivial-wrapper` + 21 `W9728`, mostly tests; only 2 in src. |
| Duplicated local test helpers | `_walk_and_release` defined in 10 test files plus shipped `testing.py:25-38`; `_msg_ids` defined in 8 test files. |
| Redundant semantic tests | 30/30 meaningful cases duplicated between `test_semantic_check.py:212-257` and `test_semantic_threshold.py:29-69`; threshold test is 135 lines for 2 parametrized functions. |
| Unused factory helpers | `assert_violation_contains_any` (`tests/runner/_factories.py:167`) and `assert_r4_reason` (`:200`) have zero references. |
| Hardcoded checkout paths | 5 test files / 10 occurrences of `/home/slava/aiexp/python-setup`: `tests/conftest.py:86`, `tests/runner/test_setup.py:252,277`, `tests/runner/test_setup_install.py:265,274,284,288,350`, `tests/runner/test_autofix_conflict_integration.py:181`, `tests/runner/test_t9_7_compose_pyright_live.py:31,37`. |
| Always-skipped live test | `tests/runner/test_t9_7_compose_pyright_live.py:29-37` skipif on the hardcoded checkout; 2 tests, 197 lines. |
| Weak end-to-end smoke | `tests/runner/test_real_pipeline_smoke.py:26-40` asserts only `isinstance(rc, int)` and tool-name presence. |
| Self-lint / config meta-tests | `tests/runner/test_self_lint_clean.py` (59 lines) runs full lint on the repo; `tests/runner/test_config_consistency.py` (9 tests) checks config files; `tests/runner/test_pyright_noise_filter.py` (2 slow tests) checks runner output; `tests/runner/test_runner_private_imports.py` checks import hygiene. These are the “never test linting” candidates to adjudicate. |
| Legacy milestone naming | `tests/runner/test_t1b_self_discovery.py`, `test_t3_coverage.py` (390), `test_t5_compose_ruff.py` (366), `test_t9_7_compose_pyright.py`, `test_t9_7_compose_pyright_live.py`, `test_t11_health_checks.py` (383) retain milestone IDs. |
| Test naming rule gap | `CodingRules.md:290` requires `test_<method>_given_<condition>_then_<expected>`; AST scan of 780 test defs finds 488 with `_given_` (292 not), e.g. `tests/runner/test_setup.py:124` `test_cases`. |
| Dead compat shims | `src/python_setup_lint/runner/baseline.py:20-42`: `peek_fallback_tools()` always returns `frozenset()`; `_compare_sorted` only re-exports `_baseline_helpers._compare_sorted` “for backwards compat”. Tests still assert the empty shim (`tests/runner/test_baseline_diff_edge.py:229-236`). |
| Misnamed/dead names | `suppression_justification_checker.py:63` `_legacy_scan` is the only scan path; `trivial_wrapper_checker.py:33-36` exempts `_legacy_to_records`, `_legacy_current_output`, `_legacy_saved_output` which no longer exist. |
| Runner strategy duplication | `dispatch.py:155-260` base `LintTool` + 7 per-tool subclasses; several override only to append a handful of flags (`_PylintPyiLintTool`, `_PylintTestsLintTool`, `_RuffFormatLintTool` at `:342-439`). |
| Report/doc drift | `AGENTS.md:10-11` says 1,290 pass / 15 deselected / ~53 s and 7 integration pass / ~30 s; actual 1,357 / 18 / ~28 s and 9 / ~65 s. `CHANGELOG.md:3` v1.2.9 vs `pyproject.toml:3` 1.2.10. `README.md:72` pins v1.2.5. |

### 4.6 Coding-rule enforcement mapping

Mechanically enforced today:

- Complexity: R0912/R0915/C0302 from `.pylintrc:2,22-27`; custom `unjustified-suppression`, `trivial-wrapper`, `generic-key-dict`, `unnamed-tuple-dict-value`, `missing-return-annotation`, `docstring-in-impl`, `pyi-underscore-symbol`, stub fidelity, etc. from `.pylintrc:17`.
- Typing/beartype: custom `missing-beartype`, `missing-return-annotation`, `generic-key-dict`, `unnamed-tuple-dict-value`; `mypy`, `pyright`, `ty`, `mypy.stubtest`.
- Test-specific: `.pylintrc-tests:37-43` enables W9704, W9702, W9728, W9729, W9738, W9739, etc.

Not mechanically enforced (judgment/manual):

- `CodingRules.md:93-107` simplification/wrapper inlining/redundant fallbacks/over-engineering.
- `CodingRules.md:278-286` “optimize test LoC and complexity vigorously”, “prefer long end-to-end scenario tests”, “reuse test code”, “test data factories”.
- `CodingRules.md:290` test naming.
- `CodingRules.md:292-307` isolation/fixture scope/conftest scope.
- `CodingRules.md:66-68` comments must not duplicate signatures; `.py` implementation comments only.
- `CodingRules.md:81` CHANGELOG user-visible only.
- `CodingRules.md:87` `design/` ADR format (current ADRs live in `docs/adr/`).

## 5. External model research (for the semantic swap)

The intent names GLiDE-0.4B or smaller, with the Jev Decision Index as reference. Facts gathered from the model cards and package registries (2026-11-08).

| Candidate | Size / params | License | Runtime | CPU evidence | Risk / notes |
|---|---|---|---|---|---|
| **fastino/GLiDE-0.4B** | 394,781,696 BF16 params; 0.81 GB weights; 7,999-token context | **Fastino Community License** (custom): free use, but production commercial use by entities with annual revenue > **$10M** requires a separate agreement; commercial use must display “Built with Fastino GLiDE”; derivative works share-alike | Vendored `glide/` package (~56 KB) inside the model repo; `torch==2.14.0`, `transformers==5.17.0` pins; `Glide.from_pretrained(path, device="cuda")` defaults to CUDA but accepts a `device` argument; encoder path uses `.to(device=device, dtype=dtype)` | Card says tested on RTX PRO 6000; **no CPU benchmark** | Heavy 0.8 GB download; npm-style vendored code, not a normal PyPI dependency; `glide` on PyPI 0.4.1 is an unrelated ETL package; non-MIT model/code license in an MIT project; torch/transformers pin conflict with current lock (torch 2.12.1 / transformers 5.12.1) |
| **fastino/GLiNER2.5-Decide** | 340M English classifier; stored `model.safetensors` 1.95 GB (F32 metadata 486M tensors) | **Apache-2.0** | `pip install "gliner2[local]"` (gliner2 2.1.0: torch>=2.1, transformers>=4.43,<6, peft, safetensors); `AutoExtractor.from_pretrained(...)`; `classify_text(text, {label_set})` | No explicit CPU benchmark; torch CPU feasible; card emphasizes local shipping | Simpler API and permissive license, but 1.95 GB download and 340M inference; returns a label string for single-label tasks, so a probability threshold may need a custom head/API |
| **fastino/GLiNER2.5-multi-Decide** | 287M multilingual; 1.15 GB safetensors | **Apache-2.0** | Same `gliner2[local]` | Same | Smaller than English Decide, multilingual; same API trade-off |
| **hotchpotch/bekko-system-one-v0-17m** | 16.8M params; 67 MB `model.safetensors`; 29 MB ONNX browser export | Model card has **no license metadata**; base is `cross-encoder/ettin-reranker-17m-v1` (Ettin MIT line) | `BekkoSentenceTransformer` via `trust_remote_code=True`; requirements `torch>=2.10,<2.11`, `transformers==5.17.0`, `sentence-transformers==6.1.0`; `predict()` returns choice/noul/score probabilities | **Explicit CPU or CUDA** (`device="cpu"`); browser ONNX demo CPU/WebGPU | Truly small compute, but custom remote code, no license tag, and strict torch 2.10–2.11 pin; S1MB full task avg 27.57 vs Jev 59.59 (weak generalization); ONNX path would need tokenizer/head work |
| **Elfsong/jev-ettin-150m-v16** | 149.6M params; 598 MB FP32 | **Apache-2.0** | Custom `inference/decision_index_engine.py`; CUDA-oriented example (`device="cuda"`), FP32 weights + BF16 autocast; license requires supplying loader, not `AutoModelForSequenceClassification` | No CPU claim; CUDA B200 latency reported | Permissive and moderate size, but custom inference code and GPU-oriented validation |
| Other Decision Index sub-500M models | e.g. `tardellirs/crivo-17m/32m/68m/150m/400m`, `moganai/lavoir`, `Elfsong/jev-ettin-150m/400m` | Mixed: `crivo`/`lavoir` are **CC-BY-NC-4.0** (non-commercial); `jev-ettin` Apache-2.0 | Custom option-marker readout implementations | Varies | Non-commercial licenses are unsuitable for an MIT developer tool; evaluate case-by-case |

The Decision Index leaderboard (`https://huggingface.co/spaces/multimodalart/jev-decision-index`) lists ~200 models and includes many sub-500M entrants; the README is the authoritative candidate index. For a CPU-only tool, the practical shortlist is GLiDE-0.4B (0.81 GB, permissive-ish but custom license), GLiNER2.5-Decide (Apache-2.0, 1.95 GB), and bekko-17m (67 MB, CPU-explicit, but license/pin risk).

Environment feasibility facts:

- `torch 2.12.1` publishes cp314 manylinux wheels (532 MB x86_64 wheel) — Python 3.14 is supported.
- `onnxruntime 1.31.1` publishes cp314 manylinux wheels — an ONNX-only path is feasible and avoids torch (~532 MB + 18 CUDA/NVIDIA packages).
- Current `uv.lock` resolves `torch 2.12.1` with `cuda-bindings`, `cuda-toolkit`, `triton`, and 15 `nvidia-*` packages (`uv.lock:1552-1602`); there is no `[tool.uv.sources]` CPU index pin in `pyproject.toml`.
- `sentence-transformers` 6.2.0 requires `transformers>=5.0,<6` and `torch>=2.2`; the optional extra currently pins only `sentence-transformers>=3.0.0` (`pyproject.toml:28-31`).

## 6. Open Questions & Uncertainties (architect/spike framing)

1. **Model choice + license.** GLiDE-0.4B is the named example but its Fastino Community License imposes revenue/attribution/share-alike terms and its `glide/` code is vendored, not a PyPI package. GLiNER2.5-Decide is Apache-2.0 but 1.95 GB. bekko-17m is 67 MB/CPU-explicit but has no license metadata and strict pins. Decide whether a non-MIT model license is acceptable for `python-setup` (MIT, `pyproject.toml:19-20`) and whether the model is downloaded at runtime vs vendored.
2. **CPU latency/memory budget.** No candidate has a published CPU benchmark; GLiDE/GLiNER cards report GPU numbers only. W9704/W9738 can call the scorer for every suppression with a reason and every `Any` annotation; this repo alone has ~407 suppression-like comments. Measure cold/warm latency and peak RSS on representative comments; decide batching, max context, and whether to cap calls.
3. **Pipeline placement.** Current order is semantic-first, heuristic-fallback (`_base.py:150-158`). ADR-002’s title says “heuristic-gated local decision model”. Choose: model-first with heuristic fallback (current), heuristic-first then model only for borderline cases, or heuristic-veto + model-confirm. Each changes W9704/W9738 outcomes and cache requirements.
4. **Behavior-preservation contract.** Golden (158 findings) and integration (`mod.py:49` reject, `:56` accept) run with `SEMANTIC=0`. Define the contract for semantic-on: must the existing labeled corpora (`30` meaningful + `50` meaningless + `33` meaningful + `35` brush-off) keep their expected labels? Define precision/recall and a new deterministic contract test for the model path.
5. **Cache shape / key.** Current key is a 64-bit truncated SHA-256 over `(text, rule, code_context, comment, model)` (`_semantic.py:143-155`). For a git-stored cache, include model ID + revision/hash + prompt-template version + threshold + normalization version; use full SHA-256 hex, sorted keys, `indent=2`, trailing newline (repo convention at `tests/_golden.py:156-172`); store only hash→bool (no raw comments/PII). Decide max entries, expiry/prune policy, and whether cache entries for old model versions are deleted.
6. **Read-only lint / refresh.** ADR-007 requires lint to be read-only and cache refresh to be explicit. Current `_save_result_cache` writes on every new result (`_semantic.py:71-78,187-188`), which would dirty a tracked file. Decide: read-only cache with `--refresh-semantic-cache` (or env var), atomic tempfile+rename write (pattern at `runner/baseline.py:201-229`), file locking, and whether cache-miss lint falls back to heuristic or fails.
7. **Env/API compatibility.** Keep `PYTHON_SETUP_LINT_SEMANTIC` (default `"1"`) and `PYTHON_SETUP_LINT_RERANKER_MODEL` names, or introduce `PYTHON_SETUP_LINT_DECISION_MODEL` and deprecate the old name? Keep the extra name `[semantic]` or rename? Update `README.md:29`, `docs/tutorials.md:12-15`, `docs/custom-checks.md:97`, `docs/troubleshooting.md:97-109`, `docs/semantic-justification.md`, `AGENTS.md:79-85`.
8. **Test strategy for the model path.** No deterministic test exists. Options: inject a scorer via a private `_score` hook and monkeypatch it; commit a small decision cache for the existing labeled corpus and run cache-hit tests without a model; or use a tiny local model (bekko-17m ONNX) in a slow test. Also fix the existing test-isolation bugs: `TestRerankerPairs` not marked slow (`test_semantic_check.py:424-506`), semantic tests that delete `~/.cache` via `_reset_cache` (`_semantic.py:81-90`), and checker tests that rely on `sentence-transformers` being absent (`test_suppression_justification_checker.py`, `test_bare_except_comment_checker.py`).
9. **“Never test linting.”** Ambiguous in a linter product. Candidate removals: `tests/runner/test_self_lint_clean.py` (self-lint), `tests/runner/test_config_consistency.py` (config file consistency), `tests/runner/test_pyright_noise_filter.py` (runner display guard), `tests/runner/test_runner_private_imports.py` (import hygiene). Confirm the intended boundary: remove self-referential gates and rely on `uv run lint`, or keep them as gate evidence.
10. **Debloat scope / test-intent mapping.** The safe net is `tests/_golden.py` + `tests/assumptions/` + `tests/integration.py`; any deletion should map old test intent → retained scenario/assumption. Decide whether to split `tests/checkers/_factories.py` (1,393) and `tests/runner/_factories_extras.py` (511) by checker group, inline local `_walk_and_release`/`_msg_ids` helpers into `testing.py`, and remove unused `assert_violation_contains_any`/`assert_r4_reason`.
11. **Code debloat scope.** `dispatch.py` 542 lines with 7 strategy subclasses; `baseline.py` dead compat (`peek_fallback_tools`, `_compare_sorted`); `trivial_wrapper_checker` dead `_legacy_*` exemptions; `_legacy_scan` naming. Decide whether to delete compat shims and tests (behavior-preserving) or keep them for external consumers; if deleted, update `runner/__init__.py:17,22,62` and tests.
12. **Gate + golden process.** `lint.baseline` is empty; any new violation fails the self-lint/pre-commit gate. Golden regeneration is local-only via `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1` and refused under CI (`tests/_golden.py:374-390`); tool counts are rewritten atomically. Decide how to validate the final worktree given the detect-secrets MemoryError on large tracked artifacts (scope detect-secrets or clean the tree; do not edit the baseline).
13. **Doc/ADR reconciliation.** Eight ADRs are problem statements, some partly stale (ADR-001 exact multiset now exists; ADR-005 check-only format now exists; ADR-006 `slice_tool_section` now used). Decide whether to formalize them into Decision/Consequences ADRs, move them to `design/` per `CodingRules.md:87`, and update stale counts (`AGENTS.md:10-11`), version (`CHANGELOG.md:3` vs `pyproject.toml:3`), and README pin (`README.md:72`).

## 7. Likely touch map (for planning, not a decision)

| Workstream | Primary files | Contract tests / gates |
|---|---|---|
| Coding-rule enforcement | `src/python_setup_lint/runner/dispatch.py`, `baseline.py`, `testing.py`, checker modules; `config/.pylintrc*`; test helpers | `uv run lint` (13 tools pass, 61 s), `tests/runner/test_config_consistency.py`, `tests/runner/test_self_lint_clean.py` |
| Code/test debloat | `tests/checkers/_factories.py`, `tests/runner/_factories*.py`, `tests/_project_helpers.py`, duplicated `_walk_and_release`/`_msg_ids`, over-limit modules, dead compat shims | `uv run pytest -q` (1,357 pass), `tests/assumptions/`, `tests/integration.py` |
| Semantic swap | `checkers/_semantic.py` + `.pyi`, `checkers/_base.py`, W9704/W9738 checkers, `pyproject.toml` extra, `uv.lock`, `.gitignore:243-244`, semantic tests, docs/AGENTS/README | `uv run pytest -q` (4 model skips), `tests/integration.py` (semantic=0 golden), new deterministic model-path test + cache contract |

Key invariants to preserve:

- W9704 message text/ID and line/col behavior unchanged; W9738 unchanged.
- Heuristic fallback exact outcomes unchanged for the existing 30+50+33+35 labeled comments and for all currently passing checker tests.
- Golden 158 findings unchanged unless intentionally regenerated; `lint.baseline` stays `[]`.
- Default lint without `[semantic]` never imports heavy ML deps and remains fast.
- Heavy model imports stay lazy inside the scorer (`_base.py:150-156` pattern), so pylint plugin import remains cheap.
- Any git-stored cache is tiny, deterministic, sorted, and read-only during lint (ADR-007).

## Output

Yield a structured JSON object matching this schema:
- id (string, optional): Unique identifier for this decision (assigned by engine if omitted)
- context (string, optional, enum: ["item","non-item","wave","plan-closeup"]): Decision context scope (item, non-item, wave, plan-closeup)
- decision (string, required, enum: ["retry-with-guidance","split","escalate","accept-with-debt","abandon","fix-item","human-async","abort","continue","amend","end-iteration","complete","next-iteration","blocked"]): Architect decision verdict
- rationale (string, optional): Technical justification for this decision
- text (string, optional): Concrete guidance or steering directives
- persist (boolean, optional): Whether guidance persists across subsequent attempts
- outlines (array of object, optional): Decomposed item outlines when decision is split, or new/replacement item outlines when decision is amend (PlanItemOutline shape: slug, kind, title, description?, milestoneId?, deps?, etc.)
- removeItemSlugs (array of string, optional): Slugs of pending items to remove / supersede when decision is amend
- outline (object, optional): Item outline to schedule when decision is fix-item
- debt (string, optional): Technical debt description when decision is accept-with-debt
- reason (string, optional): Reason for abandonment or abort
- question (string, optional): Specific question for human operator when decision is human-async or blocked
- planDelta (string, optional): Plan delta or amendment directives when decision is amend
- timestamp (string, optional): ISO timestamp (assigned by engine if omitted)
