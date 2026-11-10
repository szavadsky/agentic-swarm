# Step: Architect Wave Report

## Goal
Evaluate the results of a completed execution wave, assess spike findings and accumulated debt, and decide the iteration path.

## Rules
- Exploration budget: evaluate wave progress from the current plan, wave report, spike findings, and the prepared context pack (`# Context Pack — `modernize`

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
`). Read code ONLY to verify a specific integration decision (few targeted reads, never broad scans). Translate new unknowns into spike outlines or plan amendments instead of in-turn investigation. Keep terse.
- Outcome options (yield `decision` matching `decisions.schema.json` with `context: "wave"`):
  - `continue`: wave succeeded; proceed to the next scheduled wave.
  - `amend`: revise remaining plan items based on wave learnings or spike results. Yield `outlines` = the NEW or REPLACEMENT PlanItemOutline entries for the amendment (same shape as plan `itemOutlines`: slug, kind, title, description?, milestoneId?, deps?, escalate?), PLUS optional `removeItemSlugs` naming PENDING (never merged/running) items the new items replace, PLUS `planDelta` prose describing the change for the PM. NEVER yield `amend` without `outlines`: an amendment with no new outlines is `continue`.
  - `end-iteration`: halt remaining waves early and transition directly to plan close-up (e.g. goal accomplished early or severe pivot required).
- When an amendment versions or replaces an item (for example a *-v2 copy superseding the original), include the stale original slug in `removeItemSlugs` so the pending original does not linger and run redundantly.
- Integrate spike findings: use `findings.md` and PoC results from finished spikes to inform subsequent item outlines.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.

## Current Plan
{
  "iteration": 3,
  "milestones": [
    {
      "directionalInterfaces": [
        "Validated unified map: owner enum {runner,checkers,setup-testing,semantic,root} with counts 67/83/15/4/15 (±5 drift budget per owner, total equal to the git-ls-files recount); epic assignment maps setup-testing files to epic-runner-modernize; ownership universe = src/** + scripts/** + tests/** EXCLUDING tests/data/**; root-owned group (tests/data, config, docs, repo-root files, epics read-only except enumerated packaging exception); symbol-exclusion column (incl. _base.py:238 rule-echo line and no_try_import register line as semantic-owned); planned-path reservations (incl. tests/checkers/conftest.py as reservation); drift list in {path, auditRef, headEvidence, disposition: confirmed|corrected|disputed}. Artifact = item-report tables with revision map-<HEAD short SHA> (durable orchestration records).",
        ".secrets.baseline filters_used gains the ^\\.factory/ should_exclude_file entry in the version-correct form (schema pre-validated against installed detect-secrets); journals stay committed; M1 acceptance cites mechanism + pinned HEAD, not finding counts.",
        "Pylint writer-first verdict (writer + timing + --path scoping) readable from tests/assumptions/test_pylint_cache_semantics.py report; cache-design-spike input satisfied.",
        "AGENTS.md split by exact rows with engine wave order: runner-owned (if assigned at re-glob) = ## Quick Commands rows (:9-11) + ## Tool Scope table (add ruff format row); semantic-owned = ### Semantic justification pipeline subsection only; checkers never touches AGENTS.md; the engine schedules the runner AGENTS.md item in an earlier wave than the semantic pipeline item (order recorded at kickoff with post-kickoff HEAD); semantic verifies read-only via git merge-base that its base contains the runner merge when runner was assigned, else waits. Agents perform zero git writes.",
        "Docs-row assignment rule: kickoff gate assigns TD3-A1 rows from the drift list; defaults = runner owns counts/scope/version/pin rows, semantic owns pipeline subsection, root owns ADR reconciliation via adr-formalization. Shared-file single-writer table: checkers/_base.py = semantic only; _source_stream.py = checkers (new file); no_try_import register line + patterns = semantic; test_suppression class block = semantic, rest = checkers; trivial_wrapper peek line preconditioned on runner close-up."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Ownership map validated\n  Given iteration-2 audit reports plus HEAD\n  When ownership-map-revalidation re-globs via git ls-files and recounts\n  Then owner counts match 67/83/15/4/15 within ±5 per owner with total equal to the recount, exclusions (incl. the rule-echo line and no_try_import register line) reference existing symbols, reservations (incl. the conftest reservation) name only planned paths, docs rows and the stream-block list are in drift scope, stale rows follow the drift schema under revision map-<HEAD short SHA>",
        "Scenario: Secrets gate green by mechanism\n  Given the schema pre-validation plus the .factory/ exclusion merged\n  When detect-secrets scans git ls-files on a clean checkout\n  Then it exits 0 while a planted control secret still exits 1; finding counts are cited with pinned HEAD only",
        "Scenario: Epic kickoff gated on validated artifacts\n  Given the validated-map report, the pylint verdict file, and the merged .secrets.baseline exclusion\n  When epic-kickoff-gate completes\n  Then its gate report records the consumed map revision ID, the universe file count with 5-owner counts, the drift-list row count with corrected file:line per row, each epic's ownership table referencing that revision, AGENTS.md section assignments by exact rows with engine wave order, post-kickoff HEAD and the merge-base verification rule, the shared-file single-writer table, docs-row assignments per the decision rule, and zero unresolved disputes (each resolved dispute cites its amended assignment reference)"
      ],
      "title": "Validated decomposition and green-gate preconditions"
    },
    {
      "directionalInterfaces": [
        "Epic runner (owns runner/** + setup-testing files): dispatch.py split into modules each ≤500 lines with zero too-many-lines/complexity suppressions; EXPECTED_TOOL_NAMES derives from TOOLS (single-sourced re-exports); baseline.py compat shims deleted (or kept with in-repo consumer evidence + debt note); tests/runner/_factories_extras.py split with duplicate disables collapsed; each test removal/merge names its survivor; shift report or no-shift declaration emitted in the epic close-up.",
        "Epic checkers: shared stream helper in NEW checkers-owned _source_stream.py replacing the drift-list-pinned block list (grep-verified zero remaining copies), ZERO _base.py diff from this epic; register() keeps only the ADR-012 missing-beartype justification with no @beartype added (no_try_import register line skipped — semantic-owned); type-ignore[misc] removal attempted via shared typed base with retain-and-report fallback; _legacy_scan renamed with all call sites updated; trivial_wrapper dead _legacy_* exemptions removed + peek line preconditioned on runner close-up; tests/checkers/_factories.py split by checker group with ParameterSet typing; W9704/W9738 callers emit joined sorted codes; SEMANTIC=0 guards on the 40+11 heuristic tests; 40 W9704 + 11 W9738 heuristic outcomes pinned.",
        "Epic semantic (sole _base.py writer): DecisionBackend Protocol decide()->float + DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1' with FakeBackend kwarg/env injection tests; dotted-path honored only under PYTEST_CURRENT_TEST with loader test pinning both behaviors; .python-setup-decisions.json schema (sorted, indent=2, sort_keys, no bare hex>=20, secrets-clean); read-only lint proven by hash-asserted zero writes; explicit CI-guarded refresh tested on tmp; [semantic] extra without sentence-transformers with loader-returns-None + one-warning proof (no hatch entry, .gitignore untouched); rule-echo on-any-element change at _base.py:238 with joined cache keys; merged deduped heuristic table; docs state backend + cache + no-go."
      ],
      "id": "M2",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Runner modernized without behavior drift\n  Given the runner + setup-testing scope from the validated map\n  When its items merge\n  Then dispatch.py has no too-many-lines disable with every split module ≤500 lines, EXPECTED_TOOL_NAMES still derives from TOOLS (registry test passes), baseline.py compat shims are deleted (or kept with in-repo consumer evidence + debt note), _factories_extras.py is split with one disable at most, every removed/merged runner test names its survivor in the epic report, gates (format exit 0, scoped lint zero violations, pytest -q green, integration 9-collected-0-failed with env pinned) pass, and golden is byte-identical or covered by a shift report in the handoff record",
        "Scenario: Checkers modernized without behavior drift\n  Given the checkers epic scope with semantic exclusions\n  When its items merge\n  Then every drift-listed stream block calls the shared _source_stream.py helper (grep shows zero local copies outside it) with zero _base.py diff from this epic, register() functions carry only the ADR-012 missing-beartype justification with no @beartype added, each mixin misc suppression is removed via the shared base or retained with the standardized justification cited in the report, _legacy_scan is renamed with all call sites updated, trivial_wrapper dead exemptions are removed with the peek line matching the runner close-up outcome, tests/checkers/_factories.py is split by checker group, callers emit joined sorted codes, the 40 W9704 + 11 W9738 heuristic tests pass with SEMANTIC=0 guards, gates pass, and golden is byte-identical or shift-reported",
        "Scenario: Semantic infrastructure ready for a future model\n  Given the ADR-009 no-go verdict\n  When the semantic epic merges\n  Then DecisionBackend + threshold + prompt version work against FakeBackend with kwarg/env injection tests passing, the dotted-path loader test pins honored-under-pytest and ignored-otherwise, cache round-trip/cleanup/concurrency + hypothesis format tests pass, read-only lint is proven by hash-asserted zero writes, explicit refresh is tested on tmp with CI guard, the [semantic] extra contains no sentence-transformers with loader-returns-None + one warning proven, the merged heuristic table pins exact outcomes, docs (semantic-justification.md, custom-checks bullet, troubleshooting section, AGENTS.md pipeline subsection, CHANGELOG) state the backend + cache + no-go status, gates pass, and golden is byte-identical or shift-reported"
      ],
      "title": "Subsystem modernization via three epics"
    },
    {
      "directionalInterfaces": [
        "Shift-report handoff contract: each epic emits a shift-report section or explicit no-shift declaration in its close-up report with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line}; M2 replanAfter:true is the enforceable gate (the engine schedules no M3 item until the replan after M2 epic close-ups); epic-shift-report-collection is the first post-replan item and stays pending unless all three close-ups exist (fails open, never fabricates); golden-regen-hatch consumes only the handoff record; review record = regen-hatch report with key-by-key diff (or no-op attestation).",
        "Golden regen protocol: PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally only (pytest.fail under CI/GITHUB_ACTIONS); byte-identical double run; key-by-key diff review against the handoff shift report; golden + tool counts committed together; no blind regen ever.",
        "Final gate table: format exit code; lint per-tool results on scoped checkout; pytest counts (pass/skip/deselect); integration 9-collected-0-failed with pre-commit env pinned (9 passed with it, 7 passed + 2 skipped without); golden hash equality or regen diff; lint.baseline []; docs reconciliation checklist with must-contain strings (semantic-justification.md: DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] + no-go; AGENTS.md counts reconciled to the 9-collected contract + ruff-format scope row; CHANGELOG version; README pin; ADR staleness notes per kickoff assignment). Red-cell routing: red cells route back via new root items (root-owned files) or epic follow-up items (epic-owned files), never baseline edits."
      ],
      "id": "M3",
      "scenarios": [
        "Scenario: Golden integrity preserved\n  Given the consolidated shift-report handoff record (three epic sections, each either a shift report or a no-shift declaration)\n  When golden-regen-hatch runs\n  Then golden is byte-identical if all three declare no-shift, or regenerated locally (never under CI) with byte-identical double run and a key-by-key diff review matching the shift report, committed golden + tool counts together; no blind regen ever occurs",
        "Scenario: Iteration closes with evidence\n  Given all epic merges via the handoff record\n  When final-gate-validation completes\n  Then the gate table records format exit 0, scoped lint per-tool results, pytest counts, integration 9-collected-0-failed with pre-commit env pinned, golden hash equality or regen diff, lint.baseline [], and the docs checklist with must-contain strings per kickoff assignment; any red cell routes to a new root or epic follow-up item, never to a baseline edit"
      ],
      "title": "Behavior-preservation close-out and gate evidence"
    }
  ],
  "uncertainties": [
    {
      "description": "Audit evidence may have drifted since iteration 2 (file:line moves, renames, merged items). Epic scopes built on stale rows would misfire.",
      "id": "U1",
      "spikeOutlines": [
        "ownership-map-revalidation (fact-finder, zero writes): re-glob HEAD, confirm 5-owner counts + exclusions + reservations, emit drift list"
      ]
    },
    {
      "description": "Whether any compliant decision model exists is unknown (corpus-construction defect 215/0 blocks the 95% bar; GLiDE needs Fastino review; no CPU benchmark). RESOLVED for iteration 3 by ADR-009 deferral — no in-iteration spike; follow-up triggers in TD3-B1 (double-rated sample, license decision, CPU benchmark).",
      "id": "U2"
    },
    {
      "description": "Cache concurrency semantics (writer identity/timing, --path scoping) depend on the pylint verdict file, which may still be unmerged.",
      "id": "U3",
      "spikeOutlines": [
        "pylint-cache-semantics-closure (test-assumptions): land or verify the single verdict file; epic consumes it, never invents"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Validate ADR-008 durability at iteration-3 start: re-glob HEAD for the ownership universe via git ls-files filtered to src+scripts+tests minus tests/data; recount and confirm 67/83/15/4/15 within ±5 per owner with total equal to the recount. Confirm symbol exclusions (_semantic.py+.pyi, _base.py::check_if_meaningful including :238 rule-echo line, _OPTIONAL_IMPORT_PATTERNS + that file's register line, semantic test modules + TestSuppressionRerankerPipeline class block), planned-path reservations (incl. tests/checkers/conftest.py as reservation, not an owned file), root-owned group, TD3-A1 docs rows in drift scope, and pin the exact stream read/decode block list + helper signature for the checkers epic. Output: validated map with revision map-<HEAD short SHA> + drift list in {path, auditRef, headEvidence, disposition: confirmed|corrected|disputed} consumed by all three epics. Zero repo writes.",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "ownership-map-revalidation",
      "title": "Re-validate unified ownership map at HEAD"
    },
    {
      "deps": [],
      "description": "Land the operator-approved exclusion so the lint gate is green on clean checkouts. Pre-validate the filters_used schema against the installed detect-secrets version first (should_exclude_file signature; list-pattern vs scalar form) and use the version-correct form; then insert the ^\\.factory/ entry into .secrets.baseline filters_used (after ~line 40), keeping journals committed. Verify: full git-ls-files detect-secrets scan exits 0 on clean checkout while a planted control secret still exits 1 (reviewer-replicated procedure). Task-branch commit; keep residual-risk caveat (write-time redaction + periodic unfiltered audits). No other baseline edits.",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "secrets-baseline-exclusion",
      "title": "Add .factory/ exclusion to .secrets.baseline"
    },
    {
      "deps": [],
      "description": "Close the iteration-2 M3 gap if still unmerged at iteration-3 start: EXACTLY ONE new file tests/assumptions/test_pylint_cache_semantics.py (no_external_api, test_<api>_given_<condition>_then_<expected>, offline, no src writes). Writer-first: writer + timing + --path scoping verdict (crash-safe lock vs runner post-merge vs jobs=1/sidecars-if--j). If the iteration-2 item already merged, this item verifies the verdict exists and is readable; otherwise it lands the file. Verdict feeds epic-semantic-infrastructure cache concurrency (epic must not invent semantics).",
      "kind": "test-assumptions",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "pylint-cache-semantics-closure",
      "title": "Land or verify pylint writer/timing verdict"
    },
    {
      "deps": [
        "ownership-map-revalidation",
        "pylint-cache-semantics-closure",
        "secrets-baseline-exclusion"
      ],
      "description": "Root-owned coordination checkpoint (report-only, zero repo writes). Confirm the three epics consumed the validated map revision + drift list, the pylint verdict is readable, and the .secrets.baseline exclusion is merged. Record post-kickoff HEAD, the AGENTS.md engine wave order (runner item in an earlier wave than the semantic pipeline item when runner is assigned, with the read-only merge-base verification rule), the shared-file single-writer table, and docs-row assignments from the drift list (defaults: runner owns AGENTS.md counts/scope rows + CHANGELOG version + README pin; semantic owns pipeline subsection; root owns ADR reconciliation via adr-formalization). Resolve any ownership dispute by amended assignment before epic waves scale. Output: gate report with consumed revision ID, per-epic ownership tables, wave order, docs assignments, and zero unresolved disputes (each resolved dispute cites its amended assignment reference).",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "epic-kickoff-gate",
      "title": "Epic kickoff and ownership-dispute gate"
    },
    {
      "deps": [],
      "description": "Root-owned ADR lifecycle (docs only, root-owned files): overwrite the docs/adr/ADR-009/010/011 problem-statement stubs with full Context/Decision/Consequences ADRs matching this plan, create docs/adr/ADR-012.md for the register() exemption, add staleness notes to ADR-001/005/006, and add a locations cross-reference (docs/adr/README.md pointer to design/ per CodingRules). Verify: 12 ADR files each carry Context/Decision/Consequences or an explicit staleness note; rumdl clean; no other docs touched (AGENTS.md/CHANGELOG/README rows per kickoff docs assignment).",
      "kind": "story",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "adr-formalization",
      "title": "Formalize ADRs 009-012 and reconcile stale ADRs"
    },
    {
      "deps": [
        "epic-kickoff-gate"
      ],
      "description": "Root-owned fan-in (report-only, zero repo writes). M2 replanAfter:true is the enforceable gate: the engine schedules this item only in a post-replan wave after M2 epic close-ups exist. Read the three epic close-up reports; extract each epic's shift-report section (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line}; consolidate into one handoff record with exactly 3 epic sections. If any close-up is missing, the item stays pending (fails open — never fabricates). Output feeds golden-regen-hatch exclusively. Verify: handoff record has exactly 3 epic sections, each either a shift report or an explicit no-shift declaration.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "epic-shift-report-collection",
      "title": "Consolidate epic shift reports into handoff record"
    },
    {
      "deps": [
        "epic-shift-report-collection"
      ],
      "description": "Root-owned regen hatch, executed ONLY on a reviewed shift report in the handoff record (heuristic outcome change, e.g. joined-rule encoding): run PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally (never under CI), verify byte-identical double run, review the added/removed diff key-by-key against the shift report's justification-class description, commit golden + tool counts together. If all three handoff sections declare no-shift, this item is a no-op verification (golden byte-identical). NEVER blind-regen. Output: regen report with key-by-key diff review (or no-op attestation) consumed by final-gate-validation.",
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "golden-regen-hatch",
      "title": "Conditional golden regen on reviewed shift report"
    },
    {
      "deps": [
        "golden-regen-hatch"
      ],
      "description": "Root-owned final validation (report-only, zero repo writes): format gate exit 0; lint gate green on scoped clean checkout for detect-secrets MemoryError (cite mechanism + HEAD); `pytest -q` green (count + skips recorded); integration 9-collected-0-failed with pre-commit env pinned (9 passed with it installed, 7 passed + 2 skipped without); golden byte-identical or regen-with-reviewed-diff per the hatch report; lint.baseline []; docs reconciliation verified with must-contain strings (semantic-justification.md: DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1; custom-checks.md: DecisionBackend; troubleshooting.md: DECISION_MODEL + RERANKER deprecated; AGENTS.md pipeline: DecisionBackend; CHANGELOG: [semantic] + no-go; AGENTS.md counts reconciled to the 9-collected contract + ruff-format scope row; CHANGELOG version; README pin; ADR staleness notes per kickoff assignment). Record final gate table for close-up. Red-cell routing: red cells route back via new root items (root-owned files) or epic follow-up items (epic-owned files) — fixes go back to items, never to baseline edits.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "final-gate-validation",
      "title": "Final gate table and docs reconciliation check"
    }
  ],
  "assumptions": [
    {
      "assumption": "Material behavior = golden 158 findings (SEMANTIC=0) + checker unit tests + CLI flags/exit codes + baseline/autofix semantics + shipped configs/scopes. Heuristic rejections are material; model accept/reject was never material (dormant path). Tightening remains intentional when a model eventually ships.",
      "disposition": "confirm with human",
      "why": "Preserves the iteration-1/2 operator-approved boundary; golden stays the mechanical contract."
    },
    {
      "assumption": "Iteration-2 spike reports (candidate matrix, CPU eval no-go, runtime-pinning skip, pylint writer verdict if merged, coding-rules + test-debloat audits) are durable and readable at replan per ADR-008; validation re-globs HEAD.",
      "why": "Plan-2 ADR-008 durability decision; verified pattern for both audits."
    },
    {
      "assumption": "Dev/CI do not install the `semantic` extra; gates run heuristic + cache hits. Any real-model test is slow + with_real_api, never in the default suite.",
      "why": "Matches current venv and keeps gates offline, fast, deterministic."
    },
    {
      "assumption": "'Never test linting' bans pytest asserting this repo passes its own gates (subprocess re-lint, AST re-implementation, config re-checks). Golden/integration contracts are retained.",
      "disposition": "confirm with human",
      "why": "Operator-approved in iteration 1; removes gate-duplicating tests without deleting the fit-for-purpose contract."
    },
    {
      "assumption": "detect-secrets MemoryError on huge tracked artifacts is environmental (worktree state), not a product violation; validate on clean/scoped checkout; never weaken baseline or exclude product paths.",
      "why": "Context-pack measurement; baseline stays [] by design."
    },
    {
      "assumption": "Operator's secrets answers stand: journals stay committed; ^\\.factory/ filter lands in .secrets.baseline filters_used (task-branch commit); harness filter-seeding is a follow-up outside this task.",
      "why": "Steering directive 1794158471467; M1 acceptance cites mechanism + pinned HEAD."
    },
    {
      "assumption": "Integration gate contract is 9 collected, 0 failed with pre-commit env pinned (9 passed where pre-commit is installed; 7 passed + 2 skipped via ensure_precommit_or_skip where missing). AGENTS.md Quick Commands integration row is reconciled to this contract, not unconditional 9/9 or stale 7 pass.",
      "why": "tests/integration.py:197-257 skip 2 tests without pre-commit; unconditional 9/9 fails on minimal envs while stale 7 pass under-reports."
    },
    {
      "assumption": "Iteration 3 ships semantic infrastructure only (DecisionBackend, tracked cache, FakeBackend, docs); the headline model swap is NOT complete at close-up and must not be claimed as such. Follow-up triggers: double-rated real brush-off sample repairing the 215/0 corpus defect, human Fastino license decision if GLiDE is recommended, CPU latency/RSS benchmark on the chosen runtime.",
      "disposition": "confirm with human",
      "why": "ADR-009 no-go gating; operator must approve infra-only close-up per review human-awareness item."
    },
    {
      "assumption": "Epics are first-class plan output for root tasks (same model as iterations 1-2); the maxItemsPerPlan cap counts root itemOutlines only (8 in iteration 3). Advisory per-epic budgets (runner ≤12, checkers ≤12, semantic ≤10 items) are enforced when each epic's own plan is reviewed.",
      "why": "The plan schema defines child-epic spawning for root tasks; epic-internal items live in child plans with their own review, not in the root item list."
    }
  ],
  "epics": [
    {
      "intent": "# epic-runner-modernize\n\nChild epic of `modernize`. Own per validated map: runner/** (src + tests + stubs) PLUS setup-testing files (setup.py, _setup_*.py, testing.py, setup/install tests). Out of scope: checkers/**, semantic symbols, tests/data/** (read golden for verification only; NEVER write — regen is a root item), tests/checkers/**. Advisory budget: ≤12 items.\n\n## Requirements\n1. CodingRules enforcement: remove all complexity suppressions by refactoring (dispatch.py 542-line disable -> split registry/strategies/parser-sets into modules each <=500 with single-source re-exports; no threshold raises). Delete dead compat (baseline.py peek_fallback_tools/_FALLBACK_TOOLS/_compare_sorted shim + the asserting tests) unless external-consumer evidence is found in-repo (then record and keep). Remove redundant wrappers/fallbacks per audit rows. Split tests/runner/_factories_extras.py (511 lines; collapse the duplicate disables) by group.\n2. Test debloat per test-debloat-audit rows: merge overlapping baseline-diff/runner-stats/t3 parser-completeness coverage (exact duplicate t3:35-45 vs stats:72-77 -> one), remove never-testing-linting groups owned by runner (self-lint, config-consistency, noise-filter, private-imports scan, hardcoded-checkout live test) mapping each intent to golden/assumption/unit survivor, fix hardcoded /home/slava paths, rename milestone-ID test files by behavior (keep class/function contract names where gates reference them).\n3. Keep test intent: every removal/merge names its survivor (golden scenario, assumption test, or retained unit test); default suite keeps a full-pipeline pin (test_real_pipeline_smoke.py kept or default-collected survivor named).\n4. AGENTS.md (only if assigned at re-glob): edit ONLY ## Quick Commands rows (:9-11) + ## Tool Scope table (add ruff format row); the engine schedules this item in an earlier wave than the semantic pipeline item (order in kickoff report); record the merge HEAD for semantic's read-only merge-base verification. If unassigned, propose count/scope diffs in the close-up report for the root docs follow-up; never touch other sections.\n5. Shift reports: emit a shift-report section in the epic close-up (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line} for the root handoff record.\n6. Contracts: golden 158 findings + tool counts byte-identical unless a reviewed regen is requested via shift report (root regenerates); lint.baseline stays [].\n\n## Acceptance\n- runner/** + setup-testing files have zero too-many-lines/complexity suppressions; all modules <=500 lines; dispatch registry still single-sourced (EXPECTED_TOOL_NAMES derives from TOOLS).\n- Compat shims deleted (or kept with in-repo consumer evidence + debt note).\n- Removed tests each map to a survivor; blocking-debt limbs from the audit either pinned by new tests or explicitly flagged.\n- Gates: format exit 0, scoped lint zero violations, `pytest -q` green, integration 9-collected-0-failed with env pinned; golden byte-identical or shift-reported.",
      "slug": "epic-runner-modernize"
    },
    {
      "intent": "# epic-checkers-modernize\n\nChild epic of `modernize`. Own per validated map: checkers/** (src + tests + stubs, EXCEPT semantic-owned symbols). Semantic exclusions (never touch, zero diff from this epic): checkers/_semantic.py+.pyi, _base.py::check_if_meaningful body INCLUDING the _base.py:238 rule-echo line (this epic makes ZERO _base.py edits — its stream helper lives in new checkers-owned _source_stream.py), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS AND that file's register() disable line (semantic standardizes it alongside the patterns), tests/checkers/test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline class block. Planned-path reservations for semantic modules are read-only. Out of scope: runner/**, tests/data/** (read-only), other test dirs, AGENTS.md (never touch). Advisory budget: ≤12 items.\n\n## Requirements\n1. CodingRules enforcement on checkers/**: shared stream read/decode helper in NEW _source_stream.py replacing the drift-list-pinned block list (audit-estimated ~15; exact list + helper signature pinned at re-glob; grep-verified zero remaining copies); register() keeps the ADR-012 missing-beartype justification (no @beartype added; skip no_try_import_checker.py's register line — semantic-owned); type-ignore[misc] on mixin classes: attempt removal via a shared typed base, fallback retain with standardized justification + reported blocker (both satisfy per ADR-012); rename _legacy_scan (it is the only scan path) with all call sites updated; trivial_wrapper_checker: remove dead _legacy_* exemptions unconditionally, remove the peek_fallback_tools exemption ONLY after reading the runner close-up confirming shim deletion (if runner kept it, keep the exemption); split or slim over-limit modules (never raise thresholds); fix .pyi fidelity/private-symbol rows from the audit.\n2. Test debloat per test-debloat-audit rows: split tests/checkers/_factories.py (1,393 lines) by checker group with ParameterSet typing and cases next to tests; inline the 10 local _walk_and_release / 8 _msg_ids duplicates into testing.py single helpers; remove unused factory helpers; fix test naming toward test_<method>_given_<condition>_then_<expected> for touched files; remove never-testing-linting checker tests only if the audit lists them (with survivors).\n3. Joined-code extraction at W9704/W9738 call sites (this epic owns the caller files): extract all suppressed codes via existing patterns, normalize/sort/join ',' as the rule argument (bare-except keeps single symbol). The on-any-element matching lives in the semantic-owned body; either merge order converges to the same final state (extraction alone is echo-neutral under exact match; matching alone is a no-op for single codes), so no cross-epic ordering is needed — if outcomes shift, emit a shift report. Never edit check_if_meaningful itself.\n4. SEMANTIC isolation for checkers-owned heuristic tests: add SEMANTIC=0 guards (monkeypatch) to the 40 W9704 + 11 W9738 heuristic tests (except the semantic-owned pipeline class block, which this epic does not touch).\n5. Shift reports: emit a shift-report section in the epic close-up (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line} for the root handoff record.\n6. Contracts: W9704/W9738 message text/ID and line/col behavior unchanged on SEMANTIC=0; heuristic exact outcomes unchanged for existing labeled corpora; lint.baseline stays [].\n\n## Acceptance\n- Zero copied stream blocks outside _source_stream.py; zero _base.py diff; register() functions carry only the ADR-012 justification; mixin misc suppressions removed or retained-with-justification per the attempt rule; no over-limit checker module with a disable.\n- _factories.py split with no behavior change; local helper duplicates eliminated; callers emit joined codes.\n- All 40 heuristic W9704 + 11 W9738 tests pass with SEMANTIC=0 guards (or with reviewed shift report + root regen).\n- Gates: format exit 0, scoped lint zero violations, `pytest -q` green, integration 9-collected-0-failed with env pinned; golden byte-identical or shift-reported.",
      "slug": "epic-checkers-modernize"
    },
    {
      "intent": "# epic-semantic-infrastructure\n\nChild epic of `modernize`. Implement the model-INDEPENDENT semantic infrastructure now; model wiring waits on the corpus-repair + license verdicts (ADR-009). Advisory budget: ≤10 items. Owned symbols/files: checkers/_semantic.py+.pyi (rewrite, no sentence-transformers), new private _decision_backend.py+.pyi and _decision_cache.py+.pyi (@beartype, structlog kwargs, tach-clean, each <=500 lines); check_if_meaningful in checkers/_base.py+.pyi — SOLE _base.py writer (heuristic-first gate + backend injection + rule-echo on-any-element matching for joined codes: _base.py:238 exact-match becomes any-element match over comma-joined sorted codes; backward-compatible no-op for single codes); _OPTIONAL_IMPORT_PATTERNS + that file's register() disable line in no_try_import_checker.py; pyproject [semantic] extra block + uv.lock regeneration (enumerated packaging exception, single writer; .gitignore untouched — legacy .cache lines stay, decisions file committed; NO hatch entry — tracked cache is consumer-runtime data, not wheel payload); docs (semantic-justification.md rewrite, custom-checks.md bullet, troubleshooting.md section, AGENTS.md pipeline subsection ONLY, CHANGELOG user-visible); tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline class block, new runtime-assumption modules under tests/assumptions/ (append-only; never touch root __init__ + 3 contract modules + test_pylint_cache_semantics.py). tests/checkers/conftest.py is a PLANNED-PATH RESERVATION (file does not exist at HEAD; create it only if needed for SEMANTIC isolation fixtures).\n\nProtocol with root: NEVER write tests/data/** (read golden for verification only); on heuristic shift emit shift report + CHANGELOG behavior description (root regenerates). AGENTS.md: ### Semantic justification pipeline subsection ONLY; verify read-only via git merge-base that its base contains the runner AGENTS.md merge when runner was assigned (else wait for the earlier engine wave); never touch Quick Commands/Tool Scope rows. No edits to tests/integration.py, tests/conftest.py. Runner touch: none. Emit a shift-report section in the epic close-up (or explicit no-shift declaration) with {justification-class description, added/removed finding keys, CHANGELOG snippet, evidence file:line} for the root handoff record.\n\n## Requirements\n1. Contracts (ADR-010): keep check_if_meaningful signature + PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported). Heuristic-first hard gate (rejections never reach backend). semantic_check_if_meaningful keeps bool|None (None=unavailable, heuristic stands). Public DecisionBackend Protocol decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional backend kwarg (public in .pyi) + test-only PYTHON_SETUP_LINT_DECISION_BACKEND dotted path honored ONLY when PYTEST_CURRENT_TEST is set (production lint ignores it; loader test pins both). No patching globals/imports, no private imports.\n2. Cache (.python-setup-decisions.json at linted root): JSON array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry {justification normalized, rule joined codes, model '<id> rev <short12> prompt-vN' (no bare hex>=20), decision, files sorted POSIX} + spike-decided {version, prompt hash, last-seen}. Key (justification,rule,model), secrets-clean encoding. Normal lint read-only (hash-asserted zero writes); explicit refresh only (lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH isolation). Sweep scoped to linted files; drop empty-files + stale-model. Concurrency per pylint writer-first verdict (read the merged verdict; if pylint-cache-assumptions unmerged, root item lands first — do not invent semantics). Must pass all tools incl. detect-secrets.\n3. Backend WITHOUT a model: ship FakeBackend + NoBackend sentinel behind get_backend(); PYTHON_SETUP_LINT_DECISION_MODEL parses model@revision but with no compliant model available the loader returns None (one warning, sentinel, heuristic stands). sentence-transformers dropped from [semantic] (proven: extra contains no sentence-transformers; uv.lock has no such edge for the extra); PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Joined-rule cache keys + on-any-element matching owned here (extraction at call sites owned by checkers epic; either order converges). On shift: shift report + CHANGELOG, root regenerates.\n4. Tests (semantic-owned files only): merge brush-off/meaningful/threshold tables into one deduped parametrized table (heuristic outcomes pinned); FakeBackend via kwarg + env; cache round-trip/cleanup/concurrency on tmp + hypothesis format round-trip; delete vacuous `is None or ...` + ImportError-propagation test; mark the 4 pair tests slow (or delete with the reranker); modules <=500, no suppressions; never test linting. (SEMANTIC=0 guards in checkers-owned test files are the checkers epic's work.) Exactly one slow+with_real_api e2e SKELETON (skipped until a model ships) is allowed, not required.\n5. Docs: rewrite semantic-justification.md (heuristic-gated backend + tracked cache + no-go status), custom-checks bullet, troubleshooting section, AGENTS.md pipeline subsection only, CHANGELOG (extra contents, new/deprecated vars, cache file, no-go note).\n\n## Acceptance\n- SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit without model emits persisted verdict with no load. Brush-off never reaches backend; one call per unique pair; scoped cleanup; no retry storm.\n- Heuristic exact outcomes unchanged for existing 30+50+33+35 labeled comments (or shift report + root regen).\n- Gates: format exit 0, scoped lint zero violations, `pytest -q` green, integration 9-collected-0-failed with env pinned, empty baseline.",
      "slug": "epic-semantic-infrastructure"
    }
  ],
  "techDebt": [
    {
      "category": "blocking",
      "description": "Iteration-2 eval structural no-go: contracted accepted stratum 215/0 makes 95% meaningless-precision unevaluable; all 183 repo labels single-author with terse borderlines all True. No model meets the bar by construction.",
      "id": "TD3-B1",
      "resolution": "ADR-009: no model ships in iteration 3. Follow-up (outside this iteration): double-rated real brush-off sample repairing corpus construction + human Fastino license decision; epic-semantic-infrastructure builds backend/cache against FakeBackend so a compliant model plugs in via get_backend()."
    },
    {
      "category": "blocking",
      "description": "M4 audit report completeness + unified-map drift: reports live in orchestration records; evidence lines may be stale at iteration-3 HEAD.",
      "id": "TD3-B2",
      "resolution": "ownership-map-revalidation re-globs HEAD and produces the validated map + drift list; epic-kickoff-gate resolves disputes before epic waves scale."
    },
    {
      "category": "impacting",
      "description": "Pylint writer/timing verdict may still be unmerged (iteration-2 pylint-cache-assumptions running at close-up); cache concurrency design cannot be invented.",
      "id": "TD3-I1",
      "resolution": "pylint-cache-semantics-closure lands or verifies the single verdict file first; epic-semantic-infrastructure consumes it and must not invent lock/merge semantics."
    },
    {
      "category": "impacting",
      "description": "detect-secrets gate red on factory journals (environmental) + MemoryError on huge tracked artifacts in dirty worktrees.",
      "id": "TD3-I2",
      "resolution": "secrets-baseline-exclusion lands the approved ^\\.factory/ filter in version-correct form after schema pre-validation (journals stay committed); final validation runs on scoped/clean checkout and cites mechanism + HEAD."
    },
    {
      "category": "adjacent",
      "description": "Docs/ADR drift: AGENTS.md stale counts + missing ruff-format scope row; CHANGELOG v1.2.9 vs pyproject 1.2.10; README v1.2.5 pin; 8 problem-statement ADRs partly stale; design/ vs docs/adr location split.",
      "id": "TD3-A1",
      "resolution": "Decision rule applied at epic-kickoff-gate from the drift list; defaults: runner owns AGENTS.md counts/scope rows + CHANGELOG version + README pin, semantic owns pipeline subsection, root owns ADR reconciliation via the adr-formalization item (overwrite 009/010/011 stubs with full ADRs, create ADR-012.md, staleness notes on 001/005/006, docs/adr location cross-reference). Kickoff records assignments; unassigned rows stay with root."
    },
    {
      "category": "adjacent",
      "description": "Over-limit modules with disables, dead compat shims, duplicated test helpers, milestone-ID test names, hardcoded checkout paths — split by owner: runner owns dispatch.py (542) + tests/runner/_factories_extras.py (511, incl. duplicate-disable collapse); checkers owns tests/checkers/_factories.py (1393); semantic owns tests/checkers/test_semantic_check.py (506).",
      "id": "TD3-A2",
      "resolution": "Each epic resolves its owned rows per audit (register() disables exempt per ADR-012; mixin misc per attempt-with-fallback rule); each removal names a survivor; blocking-debt limbs pinned or explicitly flagged."
    }
  ],
  "adrs": [
    {
      "consequences": "No model ships in iteration 3; intent's swap clause is deferred until a compliant model is proven. Epics build backend/cache infrastructure against FakeBackend + tracked cache; model wiring is a bounded follow-up once the verdict lands. Close-up must not claim the swap complete.",
      "context": "Iteration-2 eval returned a structural no-go: contracted accepted stratum 215 meaningful / 0 meaningless makes 95% meaningless-precision unevaluable by construction; all 183 repo labels single-author with terse borderlines all True. GLiDE-0.4B also needs Fastino license review; no candidate is proven compliant.",
      "decision": "Defer model implementation to a follow-up contingent on (a) double-rated real brush-off sample resolving the corpus-construction defect and (b) human Fastino license decision if GLiDE is recommended. Iteration 3 delivers everything model-independent: heuristic-first DecisionBackend + tracked cache infrastructure, runner/checkers debloat, docs reconciliation.",
      "id": "ADR-009",
      "title": "No-go-gated semantic implementation with infrastructure-first delivery"
    },
    {
      "consequences": "Backend/cache work proceeds against pinned contracts without waiting for the model verdict; a compliant model plugs in via get_backend() + DECISION_MODEL with no pipeline refactor. The dotted-path surface is test-only by construction, verified by a loader test.",
      "context": "Cache schema, key encoding, prune policy, refresh command, writer identity/timing, and --path scoping were designed by iteration-2 spikes but the pylint writer verdict (cache-design-spike input) is still pending. The test-only dotted-path backend import would be an arbitrary-code-execution surface if honored in production lint.",
      "decision": "Adopt iteration-2 spike contracts as authoritative unless contradicted at HEAD: DecisionBackend Protocol decide(justification,rule,context)->float in [0,1] with heuristic-first hard gate; tracked JSON array .python-setup-decisions.json at linted root (sorted, indent=2, sort_keys, no bare hex>=20, secrets-clean); normal lint read-only with hash-asserted zero writes; explicit CI-guarded refresh (lockfile + merge + atomic); prune empty-files + stale-model; writer-first concurrency verdict from pylint-cache-assumptions (merge pending item first if unmerged). PYTHON_SETUP_LINT_DECISION_BACKEND is honored ONLY when PYTEST_CURRENT_TEST is set (pytest-managed runs); production lint ignores it. A loader test pins both behaviors (honored under pytest; ignored with the marker removed).",
      "id": "ADR-010",
      "title": "Adopt iteration-2 semantic spike contracts as build baseline"
    },
    {
      "consequences": "Subsystem epics start with dispute-free ownership; no concurrent shared-file edits (single-writer table); AGENTS.md conflicts avoided by heading split + engine wave order; M3 close-out consumes a single handoff record gated by the M2 replan.",
      "context": "M4 audits merged with the unified 5-owner map but report completeness validates at iteration-3 replan via HEAD re-glob; AGENTS.md section split, shared-file edits, packaging exceptions, and the epic-to-root shift-report handoff need machine-checkable definitions because no cross-epic dependency edges exist and agents must never run git writes.",
      "decision": "Re-validate the unified map at iteration-3 start (counts 67/83/15/4/15, ±5 drift budget), then spawn runner, checkers, and semantic epics in one wave. Epic assignment maps setup-testing files to epic-runner-modernize (runner/** + setup.py/_setup_*.py/testing.py + setup/install tests). AGENTS.md split by exact rows with engine-enforced wave order: runner-owned (if assigned) = ## Quick Commands rows (:9-11) + ## Tool Scope table (add ruff format row); semantic-owned = ### Semantic justification pipeline subsection only; checkers never touches AGENTS.md; the engine schedules the runner AGENTS.md item in an earlier wave than the semantic pipeline item (order recorded at kickoff); semantic verifies read-only via git merge-base that its base contains the runner merge when runner was assigned, else waits. Shared-file single-writer table (no concurrent edits): checkers/_base.py = semantic only (checkers puts its stream helper in new checkers-owned _source_stream.py, zero _base.py diff); no_try_import_checker.py register() disable line + _OPTIONAL_IMPORT_PATTERNS = semantic only (checkers skips that line); test_suppression file = checkers owns all lines except the TestSuppressionRerankerPipeline class block (semantic); trivial_wrapper exemption list = checkers, with the peek_fallback_tools line preconditioned on reading the runner close-up (deleted iff runner confirms shim deletion). Packaging exception: semantic solely owns the pyproject [semantic] extra block + uv.lock regeneration (single writer, enumerated exception to root-owned repo-root files); .gitignore untouched (legacy .cache lines stay; decisions file committed); no hatch entry (tracked cache is consumer-runtime data, not wheel payload). Shift-report handoff: each epic emits a shift-report section or explicit no-shift declaration in its close-up report; M2 replanAfter:true is the enforceable gate (the engine schedules no M3 item until the replan after M2 epic close-ups); root epic-shift-report-collection is the first post-replan item, stays pending unless all three close-ups exist, and consolidates the handoff record that golden-regen-hatch consumes.",
      "id": "ADR-011",
      "title": "Validated-map epic decomposition with defined AGENTS split and shift handoff"
    },
    {
      "consequences": "register() disables remain as documented exemptions counted as exempt in epic acceptance, not violations. Mixin type-ignore[misc] removal is attempt-with-fallback: either clean removal or a standardized retained justification, both verifiable.",
      "context": "Every checker register(linter: PyLinter) omits @beartype with a missing-beartype disable citing PyLinter runtime-unavailability / circular import (e.g. no_try_import_checker.py:80). Adding @beartype breaks import; dropping the disable retriggers the custom missing-beartype checker. Separately, 4 mixin checkers suppress a SourceRootMixin.options vs BaseChecker.options conflict (e.g. beartype_checker.py:21) whose removability via a shared typed base is unproven and may be blocked by pylint typing.",
      "decision": "Retain the missing-beartype disable on all register() functions with a standardized justification (PyLinter is a pylint internal type unavailable at runtime for beartype; circular import). Annotation stays PyLinter under TYPE_CHECKING. No @beartype is added to register(). type-ignore[misc] on mixin classes is attempted via a shared typed base; if pylint typing blocks removal, retain with the standardized justification and report the blocker — both outcomes satisfy the epic.",
      "id": "ADR-012",
      "title": "register() missing-beartype exemption for PyLinter circular import"
    }
  ]
}

## Wave Report
{
  "blockedItems": [],
  "debt": [
    "Operator action still open: `ruff format` ToolSpec in src/python_setup_lint/runner/dispatch.py runs plain `ruff format` without --check/--config and mutates worktrees; declared gates work around it by splitting format/lint"
  ],
  "failedItems": [],
  "iteration": 1,
  "mergedItems": [
    "secrets-baseline-exclusion",
    "pylint-cache-semantics-closure",
    "adr-formalization"
  ],
  "recommendations": [
    "Add --check (+ --config config/ruff.toml) to the `ruff format` ToolSpec or drop it from TOOLS so `uv run lint` is check-only as documented",
    "Keep declared split gates (format + 13-tool lint) until the ToolSpec fix lands"
  ],
  "status": "complete",
  "summary": "Wave 1 complete: all 3 items merged (secrets-baseline-exclusion, pylint-cache-semantics-closure, adr-formalization). Tree hygiene clean: no untracked junk, no stray temp/build artifacts, no conflict markers in src/tests/config/docs/design; only engine-managed orchestration journal churn observed (ignored). Gate Diff shows zero regressions: format pass->pass, test-integration pass->pass, lint fail->pass (IMPROVED), test fail->pass (IMPROVED). All 4 gates now green.",
  "wave": 1
}

## Tech Debt
--- Prior Plan plan-1.1.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
      invocations sharing one project."
    id: U2
    spikeOutlines:
      - "semantic epic test-assumptions: pin pylint 4.x invocation/hook
        semantics; lock/merge/sweep design conditional on result (else jobs=1 or
        sidecars, recorded in ADR-CACHE-01)"
  - description: "Golden must be deterministic across runs/machines. Risks:
      duplicate-code ordering, detect-secrets over ls-files, pyright/mypy churn,
      absolute-path leakage."
    id: U3
    spikeOutlines:
      - "golden-determinism-probe (test-assumptions, pre-story): capture twice
        on temp copies, diff raw captures, report unstable fields + verdict +
        normalization spec"
      - golden-findings-snapshot implements probe's test-side normalization;
        bounded src allowance (baseline relativize/sort, parser ordering only,
        <=40 lines, determinism-only) applies ONLY if the probe proves test-side
        insufficient. Excluding any field that drops a planted oracle rule is
        forbidden without an ADR.
  - description: Size/shape of coding-rules debt in src/ and redundant/lint-testing
      tests in tests/ (~28.6k LOC) unknown; subsystem epics cannot be scoped
      yet.
    id: U4
    spikeOutlines:
      - coding-rules-audit (fact-finder)
      - test-debloat-audit (fact-finder)
itemOutlines:
  - description: "Probe golden determinism BEFORE the snapshot story (resolves U3).
      On two fresh temp copies (copy+git-init+_make_config, monkeypatched
      PYTHON_SETUP_LINT_SEMANTIC=0) run run_lint capture twice; diff raw
      captures field-by-field. Report: unstable fields (ordering, absolute
      paths, timestamps, churn), verdict (test-side normalization sufficient vs
      bounded src fix needed with exact scope), and the normalization spec the
      snapshot story implements. Runs captures on temp copies only — never bare
      `uv run lint` on the repo (ruff-format write hazard). No committed files;
      output is the item report consumed by golden-findings-snapshot."
    kind: test-assumptions
    milestoneId: M1
    slug: golden-determinism-probe
    title: Probe capture determinism on temp copies
  - description: "Make the integration gate pin exact behavior per the probe report.
      Dedicated capture run separate from the rc!=0 first run: caller owns tmp
      dir, copy_sample, git-init, _make_config (package_name + rumdl override),
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0; tests/_golden.py owns Finding,
      None-safe finding_key, collect_findings(config, capture_path) (run_lint +
      read capture + normalize + sort + assert len!=0), assert_matches_golden
      (Counter multiset diff, sorted added/removed;
      PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 pytest.fails under CI/GITHUB_ACTIONS,
      else warns + rewrites golden+counts; reviewed diff required),
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Serialization indent=2/sort_keys/trailing-newline.
      First run keeps rc!=0 AND retains tool-section/SKIPPED/[CRASH]/W9705
      assertions (positive-exit failures surface there, not in golden). Replace
      substring loop with golden equality + oracle/tool coverage (violations.txt
      RETAINED). Brush-off/carry as tool-qualified lookups (tool='pylint',
      mod.py:49 present / :56 absent). Drift injection on in-memory list copies.
      If probe proves test-side insufficient: bounded src allowance ONLY in
      runner/baseline.py (relativize/POSIX/sort) and
      runner/parsers.py|_record_parsers.py (ordering), <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: integration, `pytest -q`, `lint` pass, empty lint.baseline."
    kind: story
    milestoneId: M1
    slug: golden-findings-snapshot
    title: Golden snapshot of normalized lint findings
    deps:
      - golden-determinism-probe
  - description: "Create tests/assumptions/__init__.py + 3 modules with distinct
      classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts
      (pytestmark no_external_api), tests named
      test_<api>_given_<condition>_then_<expected>, asserting observed behavior
      at pinned versions. astroid: Module.stream().read() returns bytes|str
      (product decodes-if-bytes); doc_node is Const/JoinedStr when docstring
      present else None for module/class/function; nodes_of_class accepts a
      tuple and returns union in document order; Const/JoinedStr string nodes
      expose int fromlineno/end_lineno/col_offset/end_col_offset (asserted on a
      sample literal). pylint (third-party side, not first-party register):
      PyLinter.register_checker(checker) lifecycle incl. open()/close() call
      order (record observed); CheckerTestCase/UnittestLinter capture
      add_message output into release_messages (assert observed MessageTest
      shape); MessageDefinitionTuple leading fields (msgid, symbol, description)
      + record full arity. beartype: discovery contract — decorate a function
      with a TYPE_CHECKING-only forward-ref annotation, assert the OBSERVED
      outcome (call-time vs import-time vs checker-only), record in item report
      for M3. No src/ changes. Must NOT touch AGENTS.md (consolidate is sole
      counts owner)."
    kind: test-assumptions
    milestoneId: M2
    slug: third-party-assumption-tests
    title: Pin astroid/pylint/beartype contracts
  - description: "Extract into tests/_project_helpers.py: copy_sample_project,
      git_init_and_stage (init+config user test/test@test + `git add .`,
      integration/detect-secrets semantics), git_init_bare (init -q + config
      Test/test@example.com, no add, autofix semantics — identities NOT
      unified), stage_file, commit_all, shipped_config_paths, make_runner_config
      (package_name + rumdl override, preserving _make_config side-effect
      contract incl. idempotent overwrite and no-op when shipped rumdl missing),
      build_pylint_overlay_config(project, disable_rule)->Path,
      ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project,
      monkeypatch)->None. Delete duplicate defs in conftest.py and
      _autofix_helpers.py (import instead); integration.py imports only what it
      uses; test_self_lint_clean.py and autofix tests switch imports.
      Per-consumer map: integration->{copy, git_init_and_stage,
      make_runner_config, build_overlay, ensure_precommit, install_twice};
      conftest->{shipped_config_paths} only; _autofix->{git_init_bare,
      stage_file, commit_all} only. Line budget (must remove >=127, target
      <=490): helpers ~58 + oracle reader ~8 + overlay rewrite ~21 + setup
      scaffolding (fake _run_uv/install-twice) ~20 + precommit scaffolding
      (probe + validate/config blocks) ~25 + M1 loop/lookup net ~5 +
      section-slice ~3 + import/docstring trim ~4. integration.py keeps
      path/class/function names; golden+counts byte-identical; sole AGENTS.md
      counts owner (update counts incl. new assumption tests). Acceptance:
      integration, `pytest -q`, `lint` pass."
    kind: story
    milestoneId: M2
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
  - description: "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS.
      Semantic exclusions are symbol/file-level (mark skipped, audit rest
      normally): checkers/_semantic.py+.pyi, new
      _decision_backend/_decision_cache modules (+.pyi),
      _base.py::check_if_meaningful (+stub section),
      no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi
      fidelity/private symbols, @beartype + structural suppressions, trivial
      wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs
      (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export),
      over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules,
      rumdl tests/data-exclude hack (TD-11). Output: rows {module, section,
      evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED
      disjoint-ownership map (this audit is single owner; test-debloat-audit
      consumes it via inter-dep). Reads final state
      (post-golden/assumptions/consolidate) + beartype report."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: coding-rules-audit
    title: Inventory CodingRules violations
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
      - consolidate-integration-helpers
  - description: "Read-only audit of tests/**. Semantic exclusions (mark skipped):
      tests/checkers/test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline class, tests/checkers/conftest.py
      (epic-created), tests/assumptions runtime/decision/cache modules
      (epic-created). Per module: behaviors protected; duplicates (incl.
      golden-covered); CodingRules-Tests violations (first-party mocking,
      naming, markers, in-file fixtures, _factories.py list[Any] tables, far
      cases); repo-self-lint tests for removal (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks); slow/benchmark; task-ID
      names. Output: rows {module, behaviors, duplicate-of, recommendation
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag).
      Owner column aligned to coding-rules-audit's unified map (read via
      inter-dep)."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: test-debloat-audit
    title: Inventory redundant and lint-testing tests
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
      - consolidate-integration-helpers
      - coding-rules-audit
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe (tool,
      file or '', line if int else -1, col if int else -1, rule) mirroring
      _violation_sort_key; normalize_record (drop msg, relativize vs project,
      strip ./, backslash->/, as_posix, assert non-absolute); serialize via
      json.dump(indent=2, sort_keys=True) + trailing newline;
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn + rewrite golden+counts together);
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Add tests/test_golden.py (synthetic Finding lists
      ONLY, no run_lint, no pipeline): finding_key None vs str/int ordering,
      POSIX normalization, multiset diff exact added/removed, CI-guard fail,
      coverage asserts, serialization byte-format. Acceptance: `uv run pytest
      tests/test_golden.py -q` passes; module <=500 lines, formatted. Consumes
      probe normalization spec; no src/ changes; no golden files yet."
    kind: story
    milestoneId: M1
    slug: golden-helpers-unit
    title: Golden helpers module with synthetic unit tests
  - deps:
      - golden-determinism-probe
      - golden-helpers-unit
    description: "Using tests/_golden.py from golden-helpers-unit and the probe
      report verdict. (1) Commit
      tests/data/golden/minimal_sample_project_findings.json +
      ..._tool_counts.json via the helper serialization, outside sample dir,
      never copied/linted; violations.txt RETAINED as oracle. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo
      (ruff-format write hazard). Bounded src allowance ONLY if probe proved
      test-side insufficient: runner/baseline.py relativize/sort +
      runner/parsers.py|_record_parsers.py ordering, <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest
      tests/test_golden.py -q` pass; regen twice byte-identical; golden+counts
      byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture
assumptions:
  - assumption: "'Material lint/check behavior' = findings {tool,file,line,col,rule}
      pinned by golden (PYTHON_SETUP_LINT_SEMANTIC=0) + checker unit tests; CLI
      flags/exit codes; baseline/autofix semantics; shipped configs/scopes.
      Other three limbs are pinned by surviving tests inventoried in M3 (CLI:
      tests/runner/test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*;
      configs/scopes: overlay + config tests) — if a limb has no surviving test
      the audit flags blocking debt. Reranker accept/reject decisions are not
      material; heuristic rejections (empty, boilerplate, brush-off, rule-echo)
      are material."
    disposition: confirm with human
    why: Intent replaces the model yet demands preservation; this boundary makes
      'preserve' mechanically testable per limb.
  - assumption: The git-stored decision cache belongs to the repo being linted
      (python-setup itself and consumers alike), at .python-setup-decisions.json
      next to lint.baseline. Only decisions committed; weights (0.03-0.8 GB, own
      licenses) stay in the user model cache.
    disposition: confirm with human
    why: Decisions depend on project content and must reproduce in that project's CI
      without the model.
  - assumption: Dev and CI do not install the `semantic` extra;
      sentence-transformers absent from .venv today. Gates run heuristic + cache
      hits; real-model tests are slow + with_real_api.
    why: Matches current .venv; keeps gates offline, fast, deterministic.
  - assumption: "tests/integration.py, `uv run pytest -q`, `uv run pytest
      tests/integration.py` and `uv run lint` are gate contracts: paths and
      commands do not change."
    why: Infra gates and AGENTS.md reference them; renaming silently breaks gating.
  - assumption: "'Never test linting' means pytest must not assert this repository
      passes its own lint gates — whether by re-running tools in subprocess, by
      AST/source scanning that re-implements a gate, or by config-consistency
      checks that re-lint the repo. `uv run lint` and pre-commit enforce that.
      Tests exercise logic on synthetic inputs and the sample project."
    disposition: confirm with human
    why: AST guards and config re-checks duplicate the gate and rot with rule churn;
      broadening the definition removes them with rationale.
  - assumption: "Only semantic-decision-model starts now;
      runner/checkers/setup-testing-scripts spawn at iteration-2 replan from M3
      audits. Root/epic sharing is narrowed: epic never writes tests/data (regen
      is a root iteration-2 item), AGENTS.md is split by section with a rebase
      prerequisite, tests/assumptions is append-only."
    why: No cross-epic machine edges exist; narrowing removes the write/write races
      by construction.
  - assumption: At least one model among GLiDE-0.4B and smaller Decision-Index
      models has compatible license, Python 3.14 CPU wheels and pinnable
      revision. Else the semantic epic escalates instead of shipping
      non-compliant.
    disposition: verify via semantic-decision-model spikes
    why: GLiDE uses a custom community license, tested on 3.12; smaller candidates
      vary.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker behind suppression-justification with a
      CPU-friendly small decision model plus a git-stored self-cleaning decision
      cache. Preserve every material behavior. Child epic of `modernize`.


      ## Scope (symbol-level; narrowed cross-epic protocol)

      Owned symbols/files: checkers/_semantic.py+.pyi and new private
      backend/cache modules (+.pyi each, @beartype, structlog kwargs,
      tach-clean); check_if_meaningful in checkers/_base.py+.pyi;
      _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject
      [semantic] extra + uv.lock + .gitignore semantic entries; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache modules,
      tests/checkers/conftest.py, new runtime-assumption modules under
      tests/assumptions/.

      Protocol with root: (a) NEVER write tests/data/** (no exception) — read
      golden for verification only; if heuristic outcomes shift, emit a shift
      report (which justification classes flip) + CHANGELOG behavior
      description, and root regenerates golden as an iteration-2 item; (b)
      AGENTS.md pipeline section only, applied onto HEAD containing root M2's
      merge (prerequisite), never touch count lines; (c) shared .py files:
      symbol ownership only; (d) tests/assumptions: append runtime modules only,
      never touch root's __init__ + 3 contract modules. Out of scope: other
      checkers/runner; tests/integration.py, tests/conftest.py (no edits). Any
      runner touch stays minimal + ADR.


      ## Requirements

      1. Spikes before design: (a) fact-finder candidate matrix (GLiDE-0.4B +
      Decision-Index smalls): license (exclude non-commercial), params/size,
      runtime with py3.14 CPU wheels linux/mac/win, vendored/pinned custom code
      (never unpinned trust_remote_code), offline behavior. (b) poc CPU-only:
      cold-load, warm latency, accuracy on labeled corpus (repo's real
      justifications + today's brush-off/meaningful tables); bar: >=90%
      accuracy, >=95% precision on meaningless, >=85% recall on meaningful;
      choose smallest model/prompt/threshold meeting bar, record in ADR. (c)
      test-assumptions: pylint 4.x invocation semantics; cache lock/merge/sweep
      conditional on result — if jobs>1 violates partial-run guarantee,
      constrain to jobs=1 (pinned by test) or per-worker sidecars, recorded in
      cache-design ADR (ADR-CACHE-01).

      2. Decision contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool and
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None
      (None=unavailable, heuristic stands). Public DecisionBackend Protocol
      decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD +
      PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional
      backend kwarg (public in .pyi); get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra or on failure: heuristic + cache
      hits, one warning, sentinel. Weights in user model cache, never git.
      PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root, definitive): JSON
      array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized (strip+collapse ws, keep case), rule (joined
      codes), model ('<id> rev <short12> prompt-vN', no bare hex>=20), decision,
      files (sorted POSIX relpaths)}. Key (justification,rule,model); context is
      model input only. Hits need no model. Writes: lockfile (O_CREAT|O_EXCL
      retry 5s) + merge + atomic temp+move. Sweep scoped to linted files; drop
      empty-files + stale-model entries. Isolation:
      PYTHON_SETUP_LINT_DECISIONS_PATH (tests->tmp, never repo cache). Must pass
      all tools incl. detect-secrets.

      5. Real suppressed codes: extract all codes from
      disable=/noqa:/ignore[...] via existing patterns; normalize (strip, split
      comma), sort, join ','; pass joined string as rule (bare-except keeps
      single 'bare-except-comment'). Rule-echo rejects if primary (lower,
      stripped) equals any element (lower). Cache key uses joined rule. If any
      heuristic outcome on the sample changes: do NOT touch golden; emit shift
      report + CHANGELOG behavior-change description (which justification
      classes flip, not the raw diff); root iteration-2 item regenerates.

      6. Tests: merge brush-off/meaningful/threshold tables into one
      parametrized table; FakeBackend via direct kwarg (units) and env-var
      (check_if_meaningful path); cache round-trip/cleanup/concurrency on tmp +
      hypothesis format round-trip; exactly one slow+with_real_api e2e; delete
      vacuous `is None or ...` assertions; modules <=500 lines, no suppressions;
      never test linting.

      7. Docs: update Scope list + CHANGELOG (user-visible only: extra contents,
      new/deprecated vars, cache file, behavior-change descriptions).


      ## Acceptance

      - Heuristic path unchanged: PYTHON_SETUP_LINT_SEMANTIC=0 sample lint
      equals golden (read-only verification).

      - Cache without model: no extra + cached false decision => W9704 emitted,
      no model load.

      - Brush-off never reaches model: 'pre-existing' + fake backend => False,
      backend uncalled.

      - One call per unique pair: miss + backend => exactly one call per unique
      (justification,rule), persisted sorted.

      - Scoped cleanup: suppression deleted from a.py => linting a.py removes
      entry; linting only b.py keeps it.

      - No retry storm: load fails => one attempt per process, heuristic
      results.

      - Gates: `uv run pytest -q`, `uv run pytest tests/integration.py -v`, `uv
      run lint` pass with empty lint.baseline.
    slug: semantic-decision-model
techDebt:
  - category: impacting
    description: Suppression/bare-except checkers pass their own symbol as `rule`;
      the rule-echo heuristic and model never see the actually-suppressed codes.
    id: TD-1
    resolution: "Semantic req5: extract all codes, pass comma-joined sorted string;
      echo matches any element; epic emits shift report + CHANGELOG behavior
      description, root iteration-2 item regenerates golden."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore; several assertions vacuous (`is None or ...`).
    id: TD-2
    resolution: "Semantic req6: FakeBackend via public Protocol (direct kwarg +
      dotted-path env injection); delete vacuous tests."
  - category: impacting
    description: tests/integration.py 627 lines + too-many-lines suppression;
      duplicates conftest/_autofix helpers; substring-only assertions miss
      drift.
    id: TD-3
    resolution: Probe + M1 pin exact findings with per-tool minimums; M2
      single-sources 10 helpers, moves overlay/setup/precommit scaffolding per
      budget, reaches <=500 without suppression.
  - category: impacting
    description: test_semantic_check.py 506 lines + suppression; heuristic tables
      duplicate test_semantic_threshold.py.
    id: TD-4
    resolution: "Semantic req6: one merged parametrized table; modules <=500."
  - category: adjacent
    description: ~15 checkers repeat structural suppressions (missing-beartype on
      register(), type:ignore[misc] on mixin classes) + copied stream
      read/decode.
    id: TD-5
    resolution: coding-rules-audit inventories; iteration-2 checkers epic fixes
      (base class, shared helper, typed register).
  - category: adjacent
    description: "Legacy/compat: baseline._FALLBACK_TOOLS/peek_fallback_tools,
      _compare_sorted re-export, astroid 3.x docstring fallback despite
      astroid>=4.0.4."
    id: TD-6
    resolution: Iteration-2 runner/checkers epics remove, guarded by golden.
  - category: adjacent
    description: "dispatch.py 500+ char rationale comment ending in `# pylint:
      disable=unjustified-suppression` suppresses the justification checker
      itself."
    id: TD-7
    resolution: "Iteration-2 runner epic: move rationale to design/0002, leave short
      justified comment."
  - category: adjacent
    description: tests/checkers/_factories.py ~1400 lines; ~40 pytest.param tables
      typed list[Any] with pasted justifications; cases far from tests.
    id: TD-8
    resolution: "Iteration-2 checkers epic per test-debloat-audit: ParameterSet
      typing, cases next to tests, split per checker."
  - category: adjacent
    description: Task-ID test names (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*,
      test_t3_*); repo-self-lint tests (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks) duplicate the `uv run lint`
      gate.
    id: TD-9
    resolution: "Iteration-2 epics per test-debloat-audit: rename by behavior;
      remove self-lint tests (broadened never-linting definition)."
  - category: adjacent
    description: "ADR locations disagree: CodingRules requires design/, factory ADRs
      go to docs/adr."
    id: TD-10
    resolution: "Iteration-2 replan: cross-reference (design/README or AGENTS.md
      index). No engine change."
  - category: adjacent
    description: Shipped rumdl.toml excludes tests/data, forcing the integration
      per-run rewrite to lint the sample AGENTS.md; affects golden determinism.
    id: TD-11
    resolution: coding-rules-audit inventories; iteration-2 runner epic fixes (e.g.
      narrow exclude); M1/M2 retain the override.
adrs:
  - consequences: Exact cheap regression detection; golden updates are explicit
      reviewed diffs. Message text not snapshotted. Tool upgrades may require
      reviewed regen. CI cannot silently rewrite. Positive-exit tool failures
      still surface via retained section/SKIPPED assertions, not via golden.
    context: Modernization enforces rules, debloats, swaps the semantic model while
      preserving material behavior. lint.baseline is empty; integration only
      checks planted rule-name presence, missing duplicates, moves, new false
      positives. violations.txt covers only pylint-custom + MD + duplicate-code
      rules.
    decision: "Commit Finding {tool,file?,line?,col?,rule} snapshot at
      tests/data/golden/minimal_sample_project_findings.json plus per-tool
      minimums at ..._tool_counts.json {tool: min_count}. Serialization:
      json.dump(indent=2, sort_keys=True) + trailing newline. Dedicated second
      run_lint capture (baseline=<tmp>/capture.json, overwrite) under
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0 with make_runner_config
      semantics; first run keeps rc!=0 and retains
      tool-section/SKIPPED/[CRASH]/W9705 assertions. Test-side normalize: drop
      msg, relativize vs project, strip './', backslash->'/', as_posix, assert
      non-absolute; sort/diff by None-safe finding_key mirroring
      _violation_sort_key (None file->'', None line/col->-1); Counter-multiset
      diff with sorted added/removed. Golden holds zero __CRASH__; any crash
      fails naming the tool. violations.txt retained as oracle; coverage = every
      oracle rule in golden AND every TOOLS entry meets its minimum count. Regen
      only via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1: pytest.fail under
      CI/GITHUB_ACTIONS ('refusing to rewrite golden under CI...'), warn +
      rewrite golden+counts otherwise, byte-identical across two runs, reviewed
      diff required. Drift injection = synthetic add/drop on in-memory list
      copies. Brush-off/carry are tool-qualified lookups (tool='pylint',
      file='src/minimal_sample/mod.py', line 49 present / line 56 absent)."
    id: ADR-001
    title: Golden findings snapshot as the behavior-preservation contract
  - consequences: Brush-off rejections guaranteed regardless of model; model can
      only tighten acceptance. sentence-transformers dropped; no-try-import
      patterns list the new runtime. Real-model coverage is one slow +
      with_real_api test. Old env var warns via CHANGELOG-documented
      deprecation.
    context: _semantic.py misuses a sentence-transformers cross-encoder as a quality
      judge. The dependency is heavy and absent in dev/CI, so the heuristic
      decides everything today. The intent asks for a CPU-friendly small
      decision model.
    decision: "Keep check_if_meaningful signature and PYTHON_SETUP_LINT_SEMANTIC.
      Heuristic runs first as a hard gate; rejections never reach the model.
      Accepted text goes to cache, then to a local decision model behind a
      public DecisionBackend Protocol decide(justification, rule, context) ->
      float P(meaningful) in [0,1]; decision = prob >= DECISION_THRESHOLD with
      PROMPT_VERSION='prompt-v1'. Injection without patching:
      semantic_check_if_meaningful gains optional backend kwarg (public in
      .pyi), and get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. Model/prompt/threshold
      chosen by spike under compatible license, Python 3.14 CPU wheels, pinned
      revision, no unpinned remote code, meeting bar: >=90% accuracy, >=95%
      precision on meaningless, >=85% recall on meaningful. Ships via `semantic`
      extra, configured by PYTHON_SETUP_LINT_DECISION_MODEL;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Backend
      unavailable returns None; heuristic stands."
    id: ADR-002
    title: Heuristic-gated local decision model for justification checks
  - consequences: W9704 reproducible across machines without the extra; decision
      changes are reviewable diffs. Small line-local merge conflicts possible.
      Consumer repos gain one committed file (install docs mention it); the file
      must pass all tools and not trip detect-secrets.
    context: Results cached in gitignored ~/.cache per-machine file, unbounded,
      keyed by 64-bit truncated SHA-256 including code context. Outcomes diverge
      across machines; stale entries never removed. Intent requires git-stored
      cache with cleanup.
    decision: "Store decisions in committed .python-setup-decisions.json at the
      linted project root (definitive, next to lint.baseline). Format: JSON
      array sorted by (rule, justification, model), indent=2, sort_keys=True.
      Entry {justification (normalized: strip + collapse whitespace, preserve
      case), rule (comma-joined sorted codes), model ('<id> rev <short12>
      prompt-vN', no bare hex >=20 chars), decision: bool, files: sorted POSIX
      relpaths}. Key is (justification, rule, model); context is model input
      only. Reads need no model. Writes: lockfile + merge-on-write + atomic
      temp+move (baseline pattern). Cleanup: mark-and-sweep scoped to linted
      files + drop empty-files and stale-model entries. Isolation via
      PYTHON_SETUP_LINT_DECISIONS_PATH. Lock/merge/sweep is conditional on the
      pylint-semantics spike; if jobs>1 violates the partial-run guarantee, the
      epic constrains to jobs=1 (pinned by test) or per-worker sidecars — the
      choice is recorded in the epic's cache-design ADR (ADR-CACHE-01). Weights
      stay in user model cache."
    id: ADR-003
    title: Git-stored, self-cleaning decision cache
  - consequences: Shared test infra never edited concurrently; debloat runs behind
      golden + assumptions. No machine-checkable cross-epic edges exist, so
      epic/root sharing is narrowed to non-write or prerequisite form; residual
      AGENTS.md/_base.py concurrent-edit risk is accepted with rebase
      discipline. Subsystem epics start one iteration later but scoped from
      evidence.
    context: Three workstreams span ~28.6k LOC. Parallel edits to shared test infra
      would conflict. Intent requires test infra/assumptions before debloat. The
      semantic epic shares surfaces with root (AGENTS.md, _base.py symbols,
      tests/assumptions, golden dir) but the engine has no cross-epic dependency
      edges.
    decision: "Iteration 1: root delivers golden net, test-infra consolidation,
      third-party assumption tests, read-only audits, and spawns
      semantic-decision-model now under a narrowed protocol: (a) the epic NEVER
      writes tests/data/** — golden regen after a semantic heuristic shift is a
      root iteration-2 item planned at replan from the epic's shift report (epic
      reads golden for verification only); (b) AGENTS.md: root M2 solely owns
      count lines, epic solely owns the pipeline section, and the epic's edit
      has prerequisite 'applies onto HEAD containing M2's merge' (epic never
      touches count lines); (c) shared .py files: symbol-level ownership, rest
      auditable; (d) tests/assumptions: root owns __init__ + 3 contract modules,
      epic appends runtime modules only. Iteration 2 (replan): re-glob HEAD,
      re-validate the unified ownership map (catches epic-created modules), then
      spawn runner/checkers/setup-testing-scripts epics. Policy: pytest never
      asserts this repo passes its own lint gates (no subprocess re-lint, no AST
      re-implementation, no config re-checks); `uv run lint` does that."
    id: ADR-004
    title: Progressive saga decomposition with narrowed cross-epic protocol


--- Prior Plan plan-1.2.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
      invocations sharing one project."
    id: U2
    spikeOutlines:
      - "semantic epic test-assumptions: pin pylint 4.x invocation/hook
        semantics; lock/merge/sweep design conditional on result (else jobs=1 or
        sidecars, recorded in ADR-CACHE-01)"
  - description: "Golden must be deterministic across runs/machines. Risks:
      duplicate-code ordering, detect-secrets over ls-files, pyright/mypy churn,
      absolute-path leakage."
    id: U3
    spikeOutlines:
      - "golden-determinism-probe (test-assumptions, pre-story): capture twice
        on temp copies, diff raw captures, report unstable fields + verdict +
        normalization spec"
      - golden-findings-snapshot implements probe's test-side normalization;
        bounded src allowance (baseline relativize/sort, parser ordering only,
        <=40 lines, determinism-only) applies ONLY if the probe proves test-side
        insufficient. Excluding any field that drops a planted oracle rule is
        forbidden without an ADR.
  - description: Size/shape of coding-rules debt in src/ and redundant/lint-testing
      tests in tests/ (~28.6k LOC) unknown; subsystem epics cannot be scoped
      yet.
    id: U4
    spikeOutlines:
      - coding-rules-audit (fact-finder)
      - test-debloat-audit (fact-finder)
itemOutlines:
  - description: "Probe golden determinism BEFORE the snapshot story (resolves U3).
      On two fresh temp copies (copy+git-init+_make_config, monkeypatched
      PYTHON_SETUP_LINT_SEMANTIC=0) run run_lint capture twice; diff raw
      captures field-by-field. Report: unstable fields (ordering, absolute
      paths, timestamps, churn), verdict (test-side normalization sufficient vs
      bounded src fix needed with exact scope), and the normalization spec the
      snapshot story implements. Runs captures on temp copies only — never bare
      `uv run lint` on the repo (ruff-format write hazard). No committed files;
      output is the item report consumed by golden-findings-snapshot."
    kind: test-assumptions
    milestoneId: M1
    slug: golden-determinism-probe
    title: Probe capture determinism on temp copies
  - description: "Make the integration gate pin exact behavior per the probe report.
      Dedicated capture run separate from the rc!=0 first run: caller owns tmp
      dir, copy_sample, git-init, _make_config (package_name + rumdl override),
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0; tests/_golden.py owns Finding,
      None-safe finding_key, collect_findings(config, capture_path) (run_lint +
      read capture + normalize + sort + assert len!=0), assert_matches_golden
      (Counter multiset diff, sorted added/removed;
      PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 pytest.fails under CI/GITHUB_ACTIONS,
      else warns + rewrites golden+counts; reviewed diff required),
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Serialization indent=2/sort_keys/trailing-newline.
      First run keeps rc!=0 AND retains tool-section/SKIPPED/[CRASH]/W9705
      assertions (positive-exit failures surface there, not in golden). Replace
      substring loop with golden equality + oracle/tool coverage (violations.txt
      RETAINED). Brush-off/carry as tool-qualified lookups (tool='pylint',
      mod.py:49 present / :56 absent). Drift injection on in-memory list copies.
      If probe proves test-side insufficient: bounded src allowance ONLY in
      runner/baseline.py (relativize/POSIX/sort) and
      runner/parsers.py|_record_parsers.py (ordering), <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: integration, `pytest -q`, `lint` pass, empty lint.baseline."
    kind: story
    milestoneId: M1
    slug: golden-findings-snapshot
    title: Golden snapshot of normalized lint findings
    deps:
      - golden-determinism-probe
  - description: "Create tests/assumptions/__init__.py + 3 modules with distinct
      classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts
      (pytestmark no_external_api), tests named
      test_<api>_given_<condition>_then_<expected>, asserting observed behavior
      at pinned versions. astroid: Module.stream().read() returns bytes|str
      (product decodes-if-bytes); doc_node is Const/JoinedStr when docstring
      present else None for module/class/function; nodes_of_class accepts a
      tuple and returns union in document order; Const/JoinedStr string nodes
      expose int fromlineno/end_lineno/col_offset/end_col_offset (asserted on a
      sample literal). pylint (third-party side, not first-party register):
      PyLinter.register_checker(checker) lifecycle incl. open()/close() call
      order (record observed); CheckerTestCase/UnittestLinter capture
      add_message output into release_messages (assert observed MessageTest
      shape); MessageDefinitionTuple leading fields (msgid, symbol, description)
      + record full arity. beartype: discovery contract — decorate a function
      with a TYPE_CHECKING-only forward-ref annotation, assert the OBSERVED
      outcome (call-time vs import-time vs checker-only), record in item report
      for M3. No src/ changes. Must NOT touch AGENTS.md (consolidate is sole
      counts owner)."
    kind: test-assumptions
    milestoneId: M2
    slug: third-party-assumption-tests
    title: Pin astroid/pylint/beartype contracts
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
    description: "Extract into tests/_project_helpers.py: copy_sample_project,
      git_init_and_stage (init+config user test/test@test + `git add .`,
      integration/detect-secrets semantics), git_init_bare (init -q + config
      Test/test@example.com, no add, autofix semantics — identities NOT
      unified), stage_file, commit_all, shipped_config_paths, make_runner_config
      (package_name + rumdl override, preserving _make_config side-effect
      contract incl. idempotent overwrite and no-op when shipped rumdl missing),
      build_pylint_overlay_config(project, disable_rule)->Path,
      ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project,
      monkeypatch)->None. Delete duplicate defs in conftest.py and
      _autofix_helpers.py (import instead); integration.py imports only what it
      uses; test_self_lint_clean.py and autofix tests switch imports.
      Per-consumer map: integration->{copy, git_init_and_stage,
      make_runner_config, build_overlay, ensure_precommit, install_twice};
      conftest->{shipped_config_paths} only; _autofix->{git_init_bare,
      stage_file, commit_all} only. Line budget (must remove >=127, target
      <=490): helpers ~58 + oracle reader ~8 + overlay rewrite ~21 + setup
      scaffolding (fake _run_uv/install-twice) ~20 + precommit scaffolding
      (probe + validate/config blocks) ~25 + M1 loop/lookup net ~5 +
      section-slice ~3 + import/docstring trim ~4. integration.py keeps
      path/class/function names; golden+counts byte-identical; sole AGENTS.md
      counts owner (update counts incl. new assumption tests). Acceptance:
      integration, `pytest -q`, `lint` pass."
    kind: story
    milestoneId: M2
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
    description: "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS.
      Semantic exclusions are symbol/file-level (mark skipped, audit rest
      normally): checkers/_semantic.py+.pyi, new
      _decision_backend/_decision_cache modules (+.pyi),
      _base.py::check_if_meaningful (+stub section),
      no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi
      fidelity/private symbols, @beartype + structural suppressions, trivial
      wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs
      (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export),
      over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules,
      rumdl tests/data-exclude hack (TD-11). Output: rows {module, section,
      evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED
      disjoint-ownership map (this audit is single owner; test-debloat-audit
      consumes it via inter-dep). Reads final state
      (post-golden/assumptions/consolidate) + beartype report."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: coding-rules-audit
    title: Inventory CodingRules violations
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
      - coding-rules-audit
    description: "Read-only audit of tests/**. Semantic exclusions (mark skipped):
      tests/checkers/test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline class, tests/checkers/conftest.py
      (epic-created), tests/assumptions runtime/decision/cache modules
      (epic-created). Per module: behaviors protected; duplicates (incl.
      golden-covered); CodingRules-Tests violations (first-party mocking,
      naming, markers, in-file fixtures, _factories.py list[Any] tables, far
      cases); repo-self-lint tests for removal (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks); slow/benchmark; task-ID
      names. Output: rows {module, behaviors, duplicate-of, recommendation
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag).
      Owner column aligned to coding-rules-audit's unified map (read via
      inter-dep)."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: test-debloat-audit
    title: Inventory redundant and lint-testing tests
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe (tool,
      file or '', line if int else -1, col if int else -1, rule) mirroring
      _violation_sort_key; normalize_record (drop msg, relativize vs project,
      strip ./, backslash->/, as_posix, assert non-absolute); serialize via
      json.dump(indent=2, sort_keys=True) + trailing newline;
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn + rewrite golden+counts together);
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Add tests/test_golden.py (synthetic Finding lists
      ONLY, no run_lint, no pipeline): finding_key None vs str/int ordering,
      POSIX normalization, multiset diff exact added/removed, CI-guard fail,
      coverage asserts, serialization byte-format. Acceptance: `uv run pytest
      tests/test_golden.py -q` passes; module <=500 lines, formatted. Consumes
      probe normalization spec; no src/ changes; no golden files yet."
    kind: story
    milestoneId: M1
    slug: golden-helpers-unit
    title: Golden helpers module with synthetic unit tests
  - deps:
      - golden-determinism-probe
      - golden-helpers-unit
    description: "Using tests/_golden.py from golden-helpers-unit and the probe
      report verdict. (1) Commit
      tests/data/golden/minimal_sample_project_findings.json +
      ..._tool_counts.json via the helper serialization, outside sample dir,
      never copied/linted; violations.txt RETAINED as oracle. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo
      (ruff-format write hazard). Bounded src allowance ONLY if probe proved
      test-side insufficient: runner/baseline.py relativize/sort +
      runner/parsers.py|_record_parsers.py ordering, <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest
      tests/test_golden.py -q` pass; regen twice byte-identical; golden+counts
      byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture
assumptions:
  - assumption: "'Material lint/check behavior' = findings {tool,file,line,col,rule}
      pinned by golden (PYTHON_SETUP_LINT_SEMANTIC=0) + checker unit tests; CLI
      flags/exit codes; baseline/autofix semantics; shipped configs/scopes.
      Other three limbs are pinned by surviving tests inventoried in M3 (CLI:
      tests/runner/test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*;
      configs/scopes: overlay + config tests) — if a limb has no surviving test
      the audit flags blocking debt. Reranker accept/reject decisions are not
      material; heuristic rejections (empty, boilerplate, brush-off, rule-echo)
      are material."
    disposition: confirm with human
    why: Intent replaces the model yet demands preservation; this boundary makes
      'preserve' mechanically testable per limb.
  - assumption: The git-stored decision cache belongs to the repo being linted
      (python-setup itself and consumers alike), at .python-setup-decisions.json
      next to lint.baseline. Only decisions committed; weights (0.03-0.8 GB, own
      licenses) stay in the user model cache.
    disposition: confirm with human
    why: Decisions depend on project content and must reproduce in that project's CI
      without the model.
  - assumption: Dev and CI do not install the `semantic` extra;
      sentence-transformers absent from .venv today. Gates run heuristic + cache
      hits; real-model tests are slow + with_real_api.
    why: Matches current .venv; keeps gates offline, fast, deterministic.
  - assumption: "tests/integration.py, `uv run pytest -q`, `uv run pytest
      tests/integration.py` and `uv run lint` are gate contracts: paths and
      commands do not change."
    why: Infra gates and AGENTS.md reference them; renaming silently breaks gating.
  - assumption: "'Never test linting' means pytest must not assert this repository
      passes its own lint gates — whether by re-running tools in subprocess, by
      AST/source scanning that re-implements a gate, or by config-consistency
      checks that re-lint the repo. `uv run lint` and pre-commit enforce that.
      Tests exercise logic on synthetic inputs and the sample project."
    disposition: confirm with human
    why: AST guards and config re-checks duplicate the gate and rot with rule churn;
      broadening the definition removes them with rationale.
  - assumption: "Only semantic-decision-model starts now;
      runner/checkers/setup-testing-scripts spawn at iteration-2 replan from M3
      audits. Root/epic sharing is narrowed: epic never writes tests/data (regen
      is a root iteration-2 item), AGENTS.md is split by section with a rebase
      prerequisite, tests/assumptions is append-only."
    why: No cross-epic machine edges exist; narrowing removes the write/write races
      by construction.
  - assumption: At least one model among GLiDE-0.4B and smaller Decision-Index
      models has compatible license, Python 3.14 CPU wheels and pinnable
      revision. Else the semantic epic escalates instead of shipping
      non-compliant.
    disposition: verify via semantic-decision-model spikes
    why: GLiDE uses a custom community license, tested on 3.12; smaller candidates
      vary.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker behind suppression-justification with a
      CPU-friendly small decision model plus a git-stored self-cleaning decision
      cache. Preserve every material behavior. Child epic of `modernize`.


      ## Scope (symbol-level; narrowed cross-epic protocol)

      Owned symbols/files: checkers/_semantic.py+.pyi and new private
      backend/cache modules (+.pyi each, @beartype, structlog kwargs,
      tach-clean); check_if_meaningful in checkers/_base.py+.pyi;
      _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject
      [semantic] extra + uv.lock + .gitignore semantic entries; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache modules,
      tests/checkers/conftest.py, new runtime-assumption modules under
      tests/assumptions/.

      Protocol with root: (a) NEVER write tests/data/** (no exception) — read
      golden for verification only; if heuristic outcomes shift, emit a shift
      report (which justification classes flip) + CHANGELOG behavior
      description, and root regenerates golden as an iteration-2 item; (b)
      AGENTS.md pipeline section only, applied onto HEAD containing root M2's
      merge (prerequisite), never touch count lines; (c) shared .py files:
      symbol ownership only; (d) tests/assumptions: append runtime modules only,
      never touch root's __init__ + 3 contract modules. Out of scope: other
      checkers/runner; tests/integration.py, tests/conftest.py (no edits). Any
      runner touch stays minimal + ADR.


      ## Requirements

      1. Spikes before design: (a) fact-finder candidate matrix (GLiDE-0.4B +
      Decision-Index smalls): license (exclude non-commercial), params/size,
      runtime with py3.14 CPU wheels linux/mac/win, vendored/pinned custom code
      (never unpinned trust_remote_code), offline behavior. (b) poc CPU-only:
      cold-load, warm latency, accuracy on labeled corpus (repo's real
      justifications + today's brush-off/meaningful tables); bar: >=90%
      accuracy, >=95% precision on meaningless, >=85% recall on meaningful;
      choose smallest model/prompt/threshold meeting bar, record in ADR. (c)
      test-assumptions: pylint 4.x invocation semantics; cache lock/merge/sweep
      conditional on result — if jobs>1 violates partial-run guarantee,
      constrain to jobs=1 (pinned by test) or per-worker sidecars, recorded in
      cache-design ADR (ADR-CACHE-01).

      2. Decision contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool and
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None
      (None=unavailable, heuristic stands). Public DecisionBackend Protocol
      decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD +
      PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional
      backend kwarg (public in .pyi); get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra or on failure: heuristic + cache
      hits, one warning, sentinel. Weights in user model cache, never git.
      PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root, definitive): JSON
      array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized (strip+collapse ws, keep case), rule (joined
      codes), model ('<id> rev <short12> prompt-vN', no bare hex>=20), decision,
      files (sorted POSIX relpaths)}. Key (justification,rule,model); context is
      model input only. Hits need no model. Writes: lockfile (O_CREAT|O_EXCL
      retry 5s) + merge + atomic temp+move. Sweep scoped to linted files; drop
      empty-files + stale-model entries. Isolation:
      PYTHON_SETUP_LINT_DECISIONS_PATH (tests->tmp, never repo cache). Must pass
      all tools incl. detect-secrets.

      5. Real suppressed codes: extract all codes from
      disable=/noqa:/ignore[...] via existing patterns; normalize (strip, split
      comma), sort, join ','; pass joined string as rule (bare-except keeps
      single 'bare-except-comment'). Rule-echo rejects if primary (lower,
      stripped) equals any element (lower). Cache key uses joined rule. If any
      heuristic outcome on the sample changes: do NOT touch golden; emit shift
      report + CHANGELOG behavior-change description (which justification
      classes flip, not the raw diff); root iteration-2 item regenerates.

      6. Tests: merge brush-off/meaningful/threshold tables into one
      parametrized table; FakeBackend via direct kwarg (units) and env-var
      (check_if_meaningful path); cache round-trip/cleanup/concurrency on tmp +
      hypothesis format round-trip; exactly one slow+with_real_api e2e; delete
      vacuous `is None or ...` assertions; modules <=500 lines, no suppressions;
      never test linting.

      7. Docs: update Scope list + CHANGELOG (user-visible only: extra contents,
      new/deprecated vars, cache file, behavior-change descriptions).


      ## Acceptance

      - Heuristic path unchanged: PYTHON_SETUP_LINT_SEMANTIC=0 sample lint
      equals golden (read-only verification).

      - Cache without model: no extra + cached false decision => W9704 emitted,
      no model load.

      - Brush-off never reaches model: 'pre-existing' + fake backend => False,
      backend uncalled.

      - One call per unique pair: miss + backend => exactly one call per unique
      (justification,rule), persisted sorted.

      - Scoped cleanup: suppression deleted from a.py => linting a.py removes
      entry; linting only b.py keeps it.

      - No retry storm: load fails => one attempt per process, heuristic
      results.

      - Gates: `uv run pytest -q`, `uv run pytest tests/integration.py -v`, `uv
      run lint` pass with empty lint.baseline.
    slug: semantic-decision-model
techDebt:
  - category: impacting
    description: Suppression/bare-except checkers pass their own symbol as `rule`;
      the rule-echo heuristic and model never see the actually-suppressed codes.
    id: TD-1
    resolution: "Semantic req5: extract all codes, pass comma-joined sorted string;
      echo matches any element; epic emits shift report + CHANGELOG behavior
      description, root iteration-2 item regenerates golden."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore; several assertions vacuous (`is None or ...`).
    id: TD-2
    resolution: "Semantic req6: FakeBackend via public Protocol (direct kwarg +
      dotted-path env injection); delete vacuous tests."
  - category: impacting
    description: tests/integration.py 627 lines + too-many-lines suppression;
      duplicates conftest/_autofix helpers; substring-only assertions miss
      drift.
    id: TD-3
    resolution: Probe + M1 pin exact findings with per-tool minimums; M2
      single-sources 10 helpers, moves overlay/setup/precommit scaffolding per
      budget, reaches <=500 without suppression.
  - category: impacting
    description: test_semantic_check.py 506 lines + suppression; heuristic tables
      duplicate test_semantic_threshold.py.
    id: TD-4
    resolution: "Semantic req6: one merged parametrized table; modules <=500."
  - category: adjacent
    description: ~15 checkers repeat structural suppressions (missing-beartype on
      register(), type:ignore[misc] on mixin classes) + copied stream
      read/decode.
    id: TD-5
    resolution: coding-rules-audit inventories; iteration-2 checkers epic fixes
      (base class, shared helper, typed register).
  - category: adjacent
    description: "Legacy/compat: baseline._FALLBACK_TOOLS/peek_fallback_tools,
      _compare_sorted re-export, astroid 3.x docstring fallback despite
      astroid>=4.0.4."
    id: TD-6
    resolution: Iteration-2 runner/checkers epics remove, guarded by golden.
  - category: adjacent
    description: "dispatch.py 500+ char rationale comment ending in `# pylint:
      disable=unjustified-suppression` suppresses the justification checker
      itself."
    id: TD-7
    resolution: "Iteration-2 runner epic: move rationale to design/0002, leave short
      justified comment."
  - category: adjacent
    description: tests/checkers/_factories.py ~1400 lines; ~40 pytest.param tables
      typed list[Any] with pasted justifications; cases far from tests.
    id: TD-8
    resolution: "Iteration-2 checkers epic per test-debloat-audit: ParameterSet
      typing, cases next to tests, split per checker."
  - category: adjacent
    description: Task-ID test names (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*,
      test_t3_*); repo-self-lint tests (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks) duplicate the `uv run lint`
      gate.
    id: TD-9
    resolution: "Iteration-2 epics per test-debloat-audit: rename by behavior;
      remove self-lint tests (broadened never-linting definition)."
  - category: adjacent
    description: "ADR locations disagree: CodingRules requires design/, factory ADRs
      go to docs/adr."
    id: TD-10
    resolution: "Iteration-2 replan: cross-reference (design/README or AGENTS.md
      index). No engine change."
  - category: adjacent
    description: Shipped rumdl.toml excludes tests/data, forcing the integration
      per-run rewrite to lint the sample AGENTS.md; affects golden determinism.
    id: TD-11
    resolution: coding-rules-audit inventories; iteration-2 runner epic fixes (e.g.
      narrow exclude); M1/M2 retain the override.
adrs:
  - consequences: Exact cheap regression detection; golden updates are explicit
      reviewed diffs. Message text not snapshotted. Tool upgrades may require
      reviewed regen. CI cannot silently rewrite. Positive-exit tool failures
      still surface via retained section/SKIPPED assertions, not via golden.
    context: Modernization enforces rules, debloats, swaps the semantic model while
      preserving material behavior. lint.baseline is empty; integration only
      checks planted rule-name presence, missing duplicates, moves, new false
      positives. violations.txt covers only pylint-custom + MD + duplicate-code
      rules.
    decision: "Commit Finding {tool,file?,line?,col?,rule} snapshot at
      tests/data/golden/minimal_sample_project_findings.json plus per-tool
      minimums at ..._tool_counts.json {tool: min_count}. Serialization:
      json.dump(indent=2, sort_keys=True) + trailing newline. Dedicated second
      run_lint capture (baseline=<tmp>/capture.json, overwrite) under
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0 with make_runner_config
      semantics; first run keeps rc!=0 and retains
      tool-section/SKIPPED/[CRASH]/W9705 assertions. Test-side normalize: drop
      msg, relativize vs project, strip './', backslash->'/', as_posix, assert
      non-absolute; sort/diff by None-safe finding_key mirroring
      _violation_sort_key (None file->'', None line/col->-1); Counter-multiset
      diff with sorted added/removed. Golden holds zero __CRASH__; any crash
      fails naming the tool. violations.txt retained as oracle; coverage = every
      oracle rule in golden AND every TOOLS entry meets its minimum count. Regen
      only via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1: pytest.fail under
      CI/GITHUB_ACTIONS ('refusing to rewrite golden under CI...'), warn +
      rewrite golden+counts otherwise, byte-identical across two runs, reviewed
      diff required. Drift injection = synthetic add/drop on in-memory list
      copies. Brush-off/carry are tool-qualified lookups (tool='pylint',
      file='src/minimal_sample/mod.py', line 49 present / line 56 absent)."
    id: ADR-001
    title: Golden findings snapshot as the behavior-preservation contract
  - consequences: Brush-off rejections guaranteed regardless of model; model can
      only tighten acceptance. sentence-transformers dropped; no-try-import
      patterns list the new runtime. Real-model coverage is one slow +
      with_real_api test. Old env var warns via CHANGELOG-documented
      deprecation.
    context: _semantic.py misuses a sentence-transformers cross-encoder as a quality
      judge. The dependency is heavy and absent in dev/CI, so the heuristic
      decides everything today. The intent asks for a CPU-friendly small
      decision model.
    decision: "Keep check_if_meaningful signature and PYTHON_SETUP_LINT_SEMANTIC.
      Heuristic runs first as a hard gate; rejections never reach the model.
      Accepted text goes to cache, then to a local decision model behind a
      public DecisionBackend Protocol decide(justification, rule, context) ->
      float P(meaningful) in [0,1]; decision = prob >= DECISION_THRESHOLD with
      PROMPT_VERSION='prompt-v1'. Injection without patching:
      semantic_check_if_meaningful gains optional backend kwarg (public in
      .pyi), and get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. Model/prompt/threshold
      chosen by spike under compatible license, Python 3.14 CPU wheels, pinned
      revision, no unpinned remote code, meeting bar: >=90% accuracy, >=95%
      precision on meaningless, >=85% recall on meaningful. Ships via `semantic`
      extra, configured by PYTHON_SETUP_LINT_DECISION_MODEL;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Backend
      unavailable returns None; heuristic stands."
    id: ADR-002
    title: Heuristic-gated local decision model for justification checks
  - consequences: W9704 reproducible across machines without the extra; decision
      changes are reviewable diffs. Small line-local merge conflicts possible.
      Consumer repos gain one committed file (install docs mention it); the file
      must pass all tools and not trip detect-secrets.
    context: Results cached in gitignored ~/.cache per-machine file, unbounded,
      keyed by 64-bit truncated SHA-256 including code context. Outcomes diverge
      across machines; stale entries never removed. Intent requires git-stored
      cache with cleanup.
    decision: "Store decisions in committed .python-setup-decisions.json at the
      linted project root (definitive, next to lint.baseline). Format: JSON
      array sorted by (rule, justification, model), indent=2, sort_keys=True.
      Entry {justification (normalized: strip + collapse whitespace, preserve
      case), rule (comma-joined sorted codes), model ('<id> rev <short12>
      prompt-vN', no bare hex >=20 chars), decision: bool, files: sorted POSIX
      relpaths}. Key is (justification, rule, model); context is model input
      only. Reads need no model. Writes: lockfile + merge-on-write + atomic
      temp+move (baseline pattern). Cleanup: mark-and-sweep scoped to linted
      files + drop empty-files and stale-model entries. Isolation via
      PYTHON_SETUP_LINT_DECISIONS_PATH. Lock/merge/sweep is conditional on the
      pylint-semantics spike; if jobs>1 violates the partial-run guarantee, the
      epic constrains to jobs=1 (pinned by test) or per-worker sidecars — the
      choice is recorded in the epic's cache-design ADR (ADR-CACHE-01). Weights
      stay in user model cache."
    id: ADR-003
    title: Git-stored, self-cleaning decision cache
  - consequences: Shared test infra never edited concurrently; debloat runs behind
      golden + assumptions. No machine-checkable cross-epic edges exist, so
      epic/root sharing is narrowed to non-write or prerequisite form; residual
      AGENTS.md/_base.py concurrent-edit risk is accepted with rebase
      discipline. Subsystem epics start one iteration later but scoped from
      evidence.
    context: Three workstreams span ~28.6k LOC. Parallel edits to shared test infra
      would conflict. Intent requires test infra/assumptions before debloat. The
      semantic epic shares surfaces with root (AGENTS.md, _base.py symbols,
      tests/assumptions, golden dir) but the engine has no cross-epic dependency
      edges.
    decision: "Iteration 1: root delivers golden net, test-infra consolidation,
      third-party assumption tests, read-only audits, and spawns
      semantic-decision-model now under a narrowed protocol: (a) the epic NEVER
      writes tests/data/** — golden regen after a semantic heuristic shift is a
      root iteration-2 item planned at replan from the epic's shift report (epic
      reads golden for verification only); (b) AGENTS.md: root M2 solely owns
      count lines, epic solely owns the pipeline section, and the epic's edit
      has prerequisite 'applies onto HEAD containing M2's merge' (epic never
      touches count lines); (c) shared .py files: symbol-level ownership, rest
      auditable; (d) tests/assumptions: root owns __init__ + 3 contract modules,
      epic appends runtime modules only. Iteration 2 (replan): re-glob HEAD,
      re-validate the unified ownership map (catches epic-created modules), then
      spawn runner/checkers/setup-testing-scripts epics. Policy: pytest never
      asserts this repo passes its own lint gates (no subprocess re-lint, no AST
      re-implementation, no config re-checks); `uv run lint` does that."
    id: ADR-004
    title: Progressive saga decomposition with narrowed cross-epic protocol


--- Prior Plan plan-1.3.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
      invocations sharing one project."
    id: U2
    spikeOutlines:
      - "semantic epic test-assumptions: pin pylint 4.x invocation/hook
        semantics; lock/merge/sweep design conditional on result (else jobs=1 or
        sidecars, recorded in ADR-CACHE-01)"
  - description: "Golden must be deterministic across runs/machines. Risks:
      duplicate-code ordering, detect-secrets over ls-files, pyright/mypy churn,
      absolute-path leakage."
    id: U3
    spikeOutlines:
      - "golden-determinism-probe (test-assumptions, pre-story): capture twice
        on temp copies, diff raw captures, report unstable fields + verdict +
        normalization spec"
      - golden-findings-snapshot implements probe's test-side normalization;
        bounded src allowance (baseline relativize/sort, parser ordering only,
        <=40 lines, determinism-only) applies ONLY if the probe proves test-side
        insufficient. Excluding any field that drops a planted oracle rule is
        forbidden without an ADR.
  - description: Size/shape of coding-rules debt in src/ and redundant/lint-testing
      tests in tests/ (~28.6k LOC) unknown; subsystem epics cannot be scoped
      yet.
    id: U4
    spikeOutlines:
      - coding-rules-audit (fact-finder)
      - test-debloat-audit (fact-finder)
itemOutlines:
  - description: "Probe golden determinism BEFORE the snapshot story (resolves U3).
      On two fresh temp copies (copy+git-init+_make_config, monkeypatched
      PYTHON_SETUP_LINT_SEMANTIC=0) run run_lint capture twice; diff raw
      captures field-by-field. Report: unstable fields (ordering, absolute
      paths, timestamps, churn), verdict (test-side normalization sufficient vs
      bounded src fix needed with exact scope), and the normalization spec the
      snapshot story implements. Runs captures on temp copies only — never bare
      `uv run lint` on the repo (ruff-format write hazard). No committed files;
      output is the item report consumed by golden-findings-snapshot."
    kind: test-assumptions
    milestoneId: M1
    slug: golden-determinism-probe
    title: Probe capture determinism on temp copies
  - description: "Make the integration gate pin exact behavior per the probe report.
      Dedicated capture run separate from the rc!=0 first run: caller owns tmp
      dir, copy_sample, git-init, _make_config (package_name + rumdl override),
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0; tests/_golden.py owns Finding,
      None-safe finding_key, collect_findings(config, capture_path) (run_lint +
      read capture + normalize + sort + assert len!=0), assert_matches_golden
      (Counter multiset diff, sorted added/removed;
      PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 pytest.fails under CI/GITHUB_ACTIONS,
      else warns + rewrites golden+counts; reviewed diff required),
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Serialization indent=2/sort_keys/trailing-newline.
      First run keeps rc!=0 AND retains tool-section/SKIPPED/[CRASH]/W9705
      assertions (positive-exit failures surface there, not in golden). Replace
      substring loop with golden equality + oracle/tool coverage (violations.txt
      RETAINED). Brush-off/carry as tool-qualified lookups (tool='pylint',
      mod.py:49 present / :56 absent). Drift injection on in-memory list copies.
      If probe proves test-side insufficient: bounded src allowance ONLY in
      runner/baseline.py (relativize/POSIX/sort) and
      runner/parsers.py|_record_parsers.py (ordering), <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: integration, `pytest -q`, `lint` pass, empty lint.baseline."
    kind: story
    milestoneId: M1
    slug: golden-findings-snapshot
    title: Golden snapshot of normalized lint findings
    deps:
      - golden-determinism-probe
  - description: "Create tests/assumptions/__init__.py + 3 modules with distinct
      classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts
      (pytestmark no_external_api), tests named
      test_<api>_given_<condition>_then_<expected>, asserting observed behavior
      at pinned versions. astroid: Module.stream().read() returns bytes|str
      (product decodes-if-bytes); doc_node is Const/JoinedStr when docstring
      present else None for module/class/function; nodes_of_class accepts a
      tuple and returns union in document order; Const/JoinedStr string nodes
      expose int fromlineno/end_lineno/col_offset/end_col_offset (asserted on a
      sample literal). pylint (third-party side, not first-party register):
      PyLinter.register_checker(checker) lifecycle incl. open()/close() call
      order (record observed); CheckerTestCase/UnittestLinter capture
      add_message output into release_messages (assert observed MessageTest
      shape); MessageDefinitionTuple leading fields (msgid, symbol, description)
      + record full arity. beartype: discovery contract — decorate a function
      with a TYPE_CHECKING-only forward-ref annotation, assert the OBSERVED
      outcome (call-time vs import-time vs checker-only), record in item report
      for M3. No src/ changes. Must NOT touch AGENTS.md (consolidate is sole
      counts owner)."
    kind: test-assumptions
    milestoneId: M2
    slug: third-party-assumption-tests
    title: Pin astroid/pylint/beartype contracts
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
    description: "Extract into tests/_project_helpers.py: copy_sample_project,
      git_init_and_stage (init+config user test/test@test + `git add .`,
      integration/detect-secrets semantics), git_init_bare (init -q + config
      Test/test@example.com, no add, autofix semantics — identities NOT
      unified), stage_file, commit_all, shipped_config_paths, make_runner_config
      (package_name + rumdl override, preserving _make_config side-effect
      contract incl. idempotent overwrite and no-op when shipped rumdl missing),
      build_pylint_overlay_config(project, disable_rule)->Path,
      ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project,
      monkeypatch)->None. Delete duplicate defs in conftest.py and
      _autofix_helpers.py (import instead); integration.py imports only what it
      uses; test_self_lint_clean.py and autofix tests switch imports.
      Per-consumer map: integration->{copy, git_init_and_stage,
      make_runner_config, build_overlay, ensure_precommit, install_twice};
      conftest->{shipped_config_paths} only; _autofix->{git_init_bare,
      stage_file, commit_all} only. Line budget (must remove >=127, target
      <=490): helpers ~58 + oracle reader ~8 + overlay rewrite ~21 + setup
      scaffolding (fake _run_uv/install-twice) ~20 + precommit scaffolding
      (probe + validate/config blocks) ~25 + M1 loop/lookup net ~5 +
      section-slice ~3 + import/docstring trim ~4. integration.py keeps
      path/class/function names; golden+counts byte-identical; MUST NOT touch
      AGENTS.md, docs/**, or src/** (test-only enforcement) — AGENTS.md counts +
      cli.py help sync moved to docs-counts-sync follow-up, leave stale by
      design. Acceptance: integration, `pytest -q` pass; golden+counts
      byte-identical; no new lint violations in touched files (pre-existing
      SIM102/R0914/C0208 persist)."
    kind: story
    milestoneId: M2
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
    description: "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS.
      Semantic exclusions are symbol/file-level (mark skipped, audit rest
      normally): checkers/_semantic.py+.pyi, new
      _decision_backend/_decision_cache modules (+.pyi),
      _base.py::check_if_meaningful (+stub section),
      no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi
      fidelity/private symbols, @beartype + structural suppressions, trivial
      wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs
      (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export),
      over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules,
      rumdl tests/data-exclude hack (TD-11). Output: rows {module, section,
      evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED
      disjoint-ownership map (this audit is single owner; test-debloat-audit
      consumes it via inter-dep). Reads final state
      (post-golden/assumptions/consolidate) + beartype report."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: coding-rules-audit
    title: Inventory CodingRules violations
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
      - coding-rules-audit
    description: "Read-only audit of tests/**. Semantic exclusions (mark skipped):
      tests/checkers/test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline class, tests/checkers/conftest.py
      (epic-created), tests/assumptions runtime/decision/cache modules
      (epic-created). Per module: behaviors protected; duplicates (incl.
      golden-covered); CodingRules-Tests violations (first-party mocking,
      naming, markers, in-file fixtures, _factories.py list[Any] tables, far
      cases); repo-self-lint tests for removal (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks); slow/benchmark; task-ID
      names. Output: rows {module, behaviors, duplicate-of, recommendation
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag).
      Owner column aligned to coding-rules-audit's unified map (read via
      inter-dep)."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: test-debloat-audit
    title: Inventory redundant and lint-testing tests
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe (tool,
      file or '', line if int else -1, col if int else -1, rule) mirroring
      _violation_sort_key; normalize_record (drop msg, relativize vs project,
      strip ./, backslash->/, as_posix, assert non-absolute); serialize via
      json.dump(indent=2, sort_keys=True) + trailing newline;
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn + rewrite golden+counts together);
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Add tests/test_golden.py (synthetic Finding lists
      ONLY, no run_lint, no pipeline): finding_key None vs str/int ordering,
      POSIX normalization, multiset diff exact added/removed, CI-guard fail,
      coverage asserts, serialization byte-format. Acceptance: `uv run pytest
      tests/test_golden.py -q` passes; module <=500 lines, formatted. Consumes
      probe normalization spec; no src/ changes; no golden files yet."
    kind: story
    milestoneId: M1
    slug: golden-helpers-unit
    title: Golden helpers module with synthetic unit tests
  - deps:
      - golden-determinism-probe
      - golden-helpers-unit
    description: "Using tests/_golden.py from golden-helpers-unit and the probe
      report verdict. (1) Commit
      tests/data/golden/minimal_sample_project_findings.json +
      ..._tool_counts.json via the helper serialization, outside sample dir,
      never copied/linted; violations.txt RETAINED as oracle. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo
      (ruff-format write hazard). Bounded src allowance ONLY if probe proved
      test-side insufficient: runner/baseline.py relativize/sort +
      runner/parsers.py|_record_parsers.py ordering, <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest
      tests/test_golden.py -q` pass; regen twice byte-identical; golden+counts
      byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
    description: "Follow-up to consolidate (test-only, cannot touch docs/prod).
      Update AGENTS.md test/tool counts from stale base (1290 pass / 13 tools)
      to runtime actuals (verify: `uv run pytest --collect-only -q` count incl.
      new assumption/golden tests + len(TOOLS)==14), count lines only (epic owns
      AGENTS.md pipeline section, never touch); and
      src/python_setup_lint/runner/cli.py:314 help text ('all 13 tools' → 'all
      14 tools'). Prod scope strictly bounded to that one help string (no
      behavior change). No test changes; golden+counts byte-identical.
      Acceptance: counts match runtime; `uv run pytest tests/integration.py -v`
      passes; no new lint violations in touched lines."
    kind: dev
    milestoneId: M2
    slug: docs-counts-sync
    title: Sync AGENTS.md counts and cli help to 14-tool world
assumptions:
  - assumption: "'Material lint/check behavior' = findings {tool,file,line,col,rule}
      pinned by golden (PYTHON_SETUP_LINT_SEMANTIC=0) + checker unit tests; CLI
      flags/exit codes; baseline/autofix semantics; shipped configs/scopes.
      Other three limbs are pinned by surviving tests inventoried in M3 (CLI:
      tests/runner/test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*;
      configs/scopes: overlay + config tests) — if a limb has no surviving test
      the audit flags blocking debt. Reranker accept/reject decisions are not
      material; heuristic rejections (empty, boilerplate, brush-off, rule-echo)
      are material."
    disposition: confirm with human
    why: Intent replaces the model yet demands preservation; this boundary makes
      'preserve' mechanically testable per limb.
  - assumption: The git-stored decision cache belongs to the repo being linted
      (python-setup itself and consumers alike), at .python-setup-decisions.json
      next to lint.baseline. Only decisions committed; weights (0.03-0.8 GB, own
      licenses) stay in the user model cache.
    disposition: confirm with human
    why: Decisions depend on project content and must reproduce in that project's CI
      without the model.
  - assumption: Dev and CI do not install the `semantic` extra;
      sentence-transformers absent from .venv today. Gates run heuristic + cache
      hits; real-model tests are slow + with_real_api.
    why: Matches current .venv; keeps gates offline, fast, deterministic.
  - assumption: "tests/integration.py, `uv run pytest -q`, `uv run pytest
      tests/integration.py` and `uv run lint` are gate contracts: paths and
      commands do not change."
    why: Infra gates and AGENTS.md reference them; renaming silently breaks gating.
  - assumption: "'Never test linting' means pytest must not assert this repository
      passes its own lint gates — whether by re-running tools in subprocess, by
      AST/source scanning that re-implements a gate, or by config-consistency
      checks that re-lint the repo. `uv run lint` and pre-commit enforce that.
      Tests exercise logic on synthetic inputs and the sample project."
    disposition: confirm with human
    why: AST guards and config re-checks duplicate the gate and rot with rule churn;
      broadening the definition removes them with rationale.
  - assumption: "Only semantic-decision-model starts now;
      runner/checkers/setup-testing-scripts spawn at iteration-2 replan from M3
      audits. Root/epic sharing is narrowed: epic never writes tests/data (regen
      is a root iteration-2 item), AGENTS.md is split by section with a rebase
      prerequisite, tests/assumptions is append-only."
    why: No cross-epic machine edges exist; narrowing removes the write/write races
      by construction.
  - assumption: At least one model among GLiDE-0.4B and smaller Decision-Index
      models has compatible license, Python 3.14 CPU wheels and pinnable
      revision. Else the semantic epic escalates instead of shipping
      non-compliant.
    disposition: verify via semantic-decision-model spikes
    why: GLiDE uses a custom community license, tested on 3.12; smaller candidates
      vary.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker behind suppression-justification with a
      CPU-friendly small decision model plus a git-stored self-cleaning decision
      cache. Preserve every material behavior. Child epic of `modernize`.


      ## Scope (symbol-level; narrowed cross-epic protocol)

      Owned symbols/files: checkers/_semantic.py+.pyi and new private
      backend/cache modules (+.pyi each, @beartype, structlog kwargs,
      tach-clean); check_if_meaningful in checkers/_base.py+.pyi;
      _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject
      [semantic] extra + uv.lock + .gitignore semantic entries; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache modules,
      tests/checkers/conftest.py, new runtime-assumption modules under
      tests/assumptions/.

      Protocol with root: (a) NEVER write tests/data/** (no exception) — read
      golden for verification only; if heuristic outcomes shift, emit a shift
      report (which justification classes flip) + CHANGELOG behavior
      description, and root regenerates golden as an iteration-2 item; (b)
      AGENTS.md pipeline section only, applied onto HEAD containing root M2's
      merge (prerequisite), never touch count lines; (c) shared .py files:
      symbol ownership only; (d) tests/assumptions: append runtime modules only,
      never touch root's __init__ + 3 contract modules. Out of scope: other
      checkers/runner; tests/integration.py, tests/conftest.py (no edits). Any
      runner touch stays minimal + ADR.


      ## Requirements

      1. Spikes before design: (a) fact-finder candidate matrix (GLiDE-0.4B +
      Decision-Index smalls): license (exclude non-commercial), params/size,
      runtime with py3.14 CPU wheels linux/mac/win, vendored/pinned custom code
      (never unpinned trust_remote_code), offline behavior. (b) poc CPU-only:
      cold-load, warm latency, accuracy on labeled corpus (repo's real
      justifications + today's brush-off/meaningful tables); bar: >=90%
      accuracy, >=95% precision on meaningless, >=85% recall on meaningful;
      choose smallest model/prompt/threshold meeting bar, record in ADR. (c)
      test-assumptions: pylint 4.x invocation semantics; cache lock/merge/sweep
      conditional on result — if jobs>1 violates partial-run guarantee,
      constrain to jobs=1 (pinned by test) or per-worker sidecars, recorded in
      cache-design ADR (ADR-CACHE-01).

      2. Decision contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool and
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None
      (None=unavailable, heuristic stands). Public DecisionBackend Protocol
      decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD +
      PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional
      backend kwarg (public in .pyi); get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra or on failure: heuristic + cache
      hits, one warning, sentinel. Weights in user model cache, never git.
      PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root, definitive): JSON
      array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized (strip+collapse ws, keep case), rule (joined
      codes), model ('<id> rev <short12> prompt-vN', no bare hex>=20), decision,
      files (sorted POSIX relpaths)}. Key (justification,rule,model); context is
      model input only. Hits need no model. Writes: lockfile (O_CREAT|O_EXCL
      retry 5s) + merge + atomic temp+move. Sweep scoped to linted files; drop
      empty-files + stale-model entries. Isolation:
      PYTHON_SETUP_LINT_DECISIONS_PATH (tests->tmp, never repo cache). Must pass
      all tools incl. detect-secrets.

      5. Real suppressed codes: extract all codes from
      disable=/noqa:/ignore[...] via existing patterns; normalize (strip, split
      comma), sort, join ','; pass joined string as rule (bare-except keeps
      single 'bare-except-comment'). Rule-echo rejects if primary (lower,
      stripped) equals any element (lower). Cache key uses joined rule. If any
      heuristic outcome on the sample changes: do NOT touch golden; emit shift
      report + CHANGELOG behavior-change description (which justification
      classes flip, not the raw diff); root iteration-2 item regenerates.

      6. Tests: merge brush-off/meaningful/threshold tables into one
      parametrized table; FakeBackend via direct kwarg (units) and env-var
      (check_if_meaningful path); cache round-trip/cleanup/concurrency on tmp +
      hypothesis format round-trip; exactly one slow+with_real_api e2e; delete
      vacuous `is None or ...` assertions; modules <=500 lines, no suppressions;
      never test linting.

      7. Docs: update Scope list + CHANGELOG (user-visible only: extra contents,
      new/deprecated vars, cache file, behavior-change descriptions).


      ## Acceptance

      - Heuristic path unchanged: PYTHON_SETUP_LINT_SEMANTIC=0 sample lint
      equals golden (read-only verification).

      - Cache without model: no extra + cached false decision => W9704 emitted,
      no model load.

      - Brush-off never reaches model: 'pre-existing' + fake backend => False,
      backend uncalled.

      - One call per unique pair: miss + backend => exactly one call per unique
      (justification,rule), persisted sorted.

      - Scoped cleanup: suppression deleted from a.py => linting a.py removes
      entry; linting only b.py keeps it.

      - No retry storm: load fails => one attempt per process, heuristic
      results.

      - Gates: `uv run pytest -q`, `uv run pytest tests/integration.py -v`, `uv
      run lint` pass with empty lint.baseline.
    slug: semantic-decision-model
techDebt:
  - category: impacting
    description: Suppression/bare-except checkers pass their own symbol as `rule`;
      the rule-echo heuristic and model never see the actually-suppressed codes.
    id: TD-1
    resolution: "Semantic req5: extract all codes, pass comma-joined sorted string;
      echo matches any element; epic emits shift report + CHANGELOG behavior
      description, root iteration-2 item regenerates golden."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore; several assertions vacuous (`is None or ...`).
    id: TD-2
    resolution: "Semantic req6: FakeBackend via public Protocol (direct kwarg +
      dotted-path env injection); delete vacuous tests."
  - category: impacting
    description: tests/integration.py 627 lines + too-many-lines suppression;
      duplicates conftest/_autofix helpers; substring-only assertions miss
      drift.
    id: TD-3
    resolution: Probe + M1 pin exact findings with per-tool minimums; M2
      single-sources 10 helpers, moves overlay/setup/precommit scaffolding per
      budget, reaches <=500 without suppression.
  - category: impacting
    description: test_semantic_check.py 506 lines + suppression; heuristic tables
      duplicate test_semantic_threshold.py.
    id: TD-4
    resolution: "Semantic req6: one merged parametrized table; modules <=500."
  - category: adjacent
    description: ~15 checkers repeat structural suppressions (missing-beartype on
      register(), type:ignore[misc] on mixin classes) + copied stream
      read/decode.
    id: TD-5
    resolution: coding-rules-audit inventories; iteration-2 checkers epic fixes
      (base class, shared helper, typed register).
  - category: adjacent
    description: "Legacy/compat: baseline._FALLBACK_TOOLS/peek_fallback_tools,
      _compare_sorted re-export, astroid 3.x docstring fallback despite
      astroid>=4.0.4."
    id: TD-6
    resolution: Iteration-2 runner/checkers epics remove, guarded by golden.
  - category: adjacent
    description: "dispatch.py 500+ char rationale comment ending in `# pylint:
      disable=unjustified-suppression` suppresses the justification checker
      itself."
    id: TD-7
    resolution: "Iteration-2 runner epic: move rationale to design/0002, leave short
      justified comment."
  - category: adjacent
    description: tests/checkers/_factories.py ~1400 lines; ~40 pytest.param tables
      typed list[Any] with pasted justifications; cases far from tests.
    id: TD-8
    resolution: "Iteration-2 checkers epic per test-debloat-audit: ParameterSet
      typing, cases next to tests, split per checker."
  - category: adjacent
    description: Task-ID test names (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*,
      test_t3_*); repo-self-lint tests (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks) duplicate the `uv run lint`
      gate.
    id: TD-9
    resolution: "Iteration-2 epics per test-debloat-audit: rename by behavior;
      remove self-lint tests (broadened never-linting definition)."
  - category: adjacent
    description: "ADR locations disagree: CodingRules requires design/, factory ADRs
      go to docs/adr."
    id: TD-10
    resolution: "Iteration-2 replan: cross-reference (design/README or AGENTS.md
      index). No engine change."
  - category: adjacent
    description: Shipped rumdl.toml excludes tests/data, forcing the integration
      per-run rewrite to lint the sample AGENTS.md; affects golden determinism.
    id: TD-11
    resolution: coding-rules-audit inventories; iteration-2 runner epic fixes (e.g.
      narrow exclude); M1/M2 retain the override.
adrs:
  - consequences: Exact cheap regression detection; golden updates are explicit
      reviewed diffs. Message text not snapshotted. Tool upgrades may require
      reviewed regen. CI cannot silently rewrite. Positive-exit tool failures
      still surface via retained section/SKIPPED assertions, not via golden.
    context: Modernization enforces rules, debloats, swaps the semantic model while
      preserving material behavior. lint.baseline is empty; integration only
      checks planted rule-name presence, missing duplicates, moves, new false
      positives. violations.txt covers only pylint-custom + MD + duplicate-code
      rules.
    decision: "Commit Finding {tool,file?,line?,col?,rule} snapshot at
      tests/data/golden/minimal_sample_project_findings.json plus per-tool
      minimums at ..._tool_counts.json {tool: min_count}. Serialization:
      json.dump(indent=2, sort_keys=True) + trailing newline. Dedicated second
      run_lint capture (baseline=<tmp>/capture.json, overwrite) under
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0 with make_runner_config
      semantics; first run keeps rc!=0 and retains
      tool-section/SKIPPED/[CRASH]/W9705 assertions. Test-side normalize: drop
      msg, relativize vs project, strip './', backslash->'/', as_posix, assert
      non-absolute; sort/diff by None-safe finding_key mirroring
      _violation_sort_key (None file->'', None line/col->-1); Counter-multiset
      diff with sorted added/removed. Golden holds zero __CRASH__; any crash
      fails naming the tool. violations.txt retained as oracle; coverage = every
      oracle rule in golden AND every TOOLS entry meets its minimum count. Regen
      only via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1: pytest.fail under
      CI/GITHUB_ACTIONS ('refusing to rewrite golden under CI...'), warn +
      rewrite golden+counts otherwise, byte-identical across two runs, reviewed
      diff required. Drift injection = synthetic add/drop on in-memory list
      copies. Brush-off/carry are tool-qualified lookups (tool='pylint',
      file='src/minimal_sample/mod.py', line 49 present / line 56 absent)."
    id: ADR-001
    title: Golden findings snapshot as the behavior-preservation contract
  - consequences: Brush-off rejections guaranteed regardless of model; model can
      only tighten acceptance. sentence-transformers dropped; no-try-import
      patterns list the new runtime. Real-model coverage is one slow +
      with_real_api test. Old env var warns via CHANGELOG-documented
      deprecation.
    context: _semantic.py misuses a sentence-transformers cross-encoder as a quality
      judge. The dependency is heavy and absent in dev/CI, so the heuristic
      decides everything today. The intent asks for a CPU-friendly small
      decision model.
    decision: "Keep check_if_meaningful signature and PYTHON_SETUP_LINT_SEMANTIC.
      Heuristic runs first as a hard gate; rejections never reach the model.
      Accepted text goes to cache, then to a local decision model behind a
      public DecisionBackend Protocol decide(justification, rule, context) ->
      float P(meaningful) in [0,1]; decision = prob >= DECISION_THRESHOLD with
      PROMPT_VERSION='prompt-v1'. Injection without patching:
      semantic_check_if_meaningful gains optional backend kwarg (public in
      .pyi), and get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. Model/prompt/threshold
      chosen by spike under compatible license, Python 3.14 CPU wheels, pinned
      revision, no unpinned remote code, meeting bar: >=90% accuracy, >=95%
      precision on meaningless, >=85% recall on meaningful. Ships via `semantic`
      extra, configured by PYTHON_SETUP_LINT_DECISION_MODEL;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Backend
      unavailable returns None; heuristic stands."
    id: ADR-002
    title: Heuristic-gated local decision model for justification checks
  - consequences: W9704 reproducible across machines without the extra; decision
      changes are reviewable diffs. Small line-local merge conflicts possible.
      Consumer repos gain one committed file (install docs mention it); the file
      must pass all tools and not trip detect-secrets.
    context: Results cached in gitignored ~/.cache per-machine file, unbounded,
      keyed by 64-bit truncated SHA-256 including code context. Outcomes diverge
      across machines; stale entries never removed. Intent requires git-stored
      cache with cleanup.
    decision: "Store decisions in committed .python-setup-decisions.json at the
      linted project root (definitive, next to lint.baseline). Format: JSON
      array sorted by (rule, justification, model), indent=2, sort_keys=True.
      Entry {justification (normalized: strip + collapse whitespace, preserve
      case), rule (comma-joined sorted codes), model ('<id> rev <short12>
      prompt-vN', no bare hex >=20 chars), decision: bool, files: sorted POSIX
      relpaths}. Key is (justification, rule, model); context is model input
      only. Reads need no model. Writes: lockfile + merge-on-write + atomic
      temp+move (baseline pattern). Cleanup: mark-and-sweep scoped to linted
      files + drop empty-files and stale-model entries. Isolation via
      PYTHON_SETUP_LINT_DECISIONS_PATH. Lock/merge/sweep is conditional on the
      pylint-semantics spike; if jobs>1 violates the partial-run guarantee, the
      epic constrains to jobs=1 (pinned by test) or per-worker sidecars — the
      choice is recorded in the epic's cache-design ADR (ADR-CACHE-01). Weights
      stay in user model cache."
    id: ADR-003
    title: Git-stored, self-cleaning decision cache
  - consequences: Shared test infra never edited concurrently; debloat runs behind
      golden + assumptions. No machine-checkable cross-epic edges exist, so
      epic/root sharing is narrowed to non-write or prerequisite form; residual
      AGENTS.md/_base.py concurrent-edit risk is accepted with rebase
      discipline. Subsystem epics start one iteration later but scoped from
      evidence.
    context: Three workstreams span ~28.6k LOC. Parallel edits to shared test infra
      would conflict. Intent requires test infra/assumptions before debloat. The
      semantic epic shares surfaces with root (AGENTS.md, _base.py symbols,
      tests/assumptions, golden dir) but the engine has no cross-epic dependency
      edges.
    decision: "Iteration 1: root delivers golden net, test-infra consolidation,
      third-party assumption tests, read-only audits, and spawns
      semantic-decision-model now under a narrowed protocol: (a) the epic NEVER
      writes tests/data/** — golden regen after a semantic heuristic shift is a
      root iteration-2 item planned at replan from the epic's shift report (epic
      reads golden for verification only); (b) AGENTS.md: root M2 solely owns
      count lines, epic solely owns the pipeline section, and the epic's edit
      has prerequisite 'applies onto HEAD containing M2's merge' (epic never
      touches count lines); (c) shared .py files: symbol-level ownership, rest
      auditable; (d) tests/assumptions: root owns __init__ + 3 contract modules,
      epic appends runtime modules only. Iteration 2 (replan): re-glob HEAD,
      re-validate the unified ownership map (catches epic-created modules), then
      spawn runner/checkers/setup-testing-scripts epics. Policy: pytest never
      asserts this repo passes its own lint gates (no subprocess re-lint, no AST
      re-implementation, no config re-checks); `uv run lint` does that."
    id: ADR-004
    title: Progressive saga decomposition with narrowed cross-epic protocol


--- Prior Plan plan-1.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
      invocations sharing one project."
    id: U2
    spikeOutlines:
      - "semantic epic test-assumptions: pin pylint 4.x invocation/hook
        semantics; lock/merge/sweep design conditional on result (else jobs=1 or
        sidecars, recorded in ADR-CACHE-01)"
  - description: "Golden must be deterministic across runs/machines. Risks:
      duplicate-code ordering, detect-secrets over ls-files, pyright/mypy churn,
      absolute-path leakage."
    id: U3
    spikeOutlines:
      - "golden-determinism-probe (test-assumptions, pre-story): capture twice
        on temp copies, diff raw captures, report unstable fields + verdict +
        normalization spec"
      - golden-findings-snapshot implements probe's test-side normalization;
        bounded src allowance (baseline relativize/sort, parser ordering only,
        <=40 lines, determinism-only) applies ONLY if the probe proves test-side
        insufficient. Excluding any field that drops a planted oracle rule is
        forbidden without an ADR.
  - description: Size/shape of coding-rules debt in src/ and redundant/lint-testing
      tests in tests/ (~28.6k LOC) unknown; subsystem epics cannot be scoped
      yet.
    id: U4
    spikeOutlines:
      - coding-rules-audit (fact-finder)
      - test-debloat-audit (fact-finder)
itemOutlines:
  - description: "Probe golden determinism BEFORE the snapshot story (resolves U3).
      On two fresh temp copies (copy+git-init+_make_config, monkeypatched
      PYTHON_SETUP_LINT_SEMANTIC=0) run run_lint capture twice; diff raw
      captures field-by-field. Report: unstable fields (ordering, absolute
      paths, timestamps, churn), verdict (test-side normalization sufficient vs
      bounded src fix needed with exact scope), and the normalization spec the
      snapshot story implements. Runs captures on temp copies only — never bare
      `uv run lint` on the repo (ruff-format write hazard). No committed files;
      output is the item report consumed by golden-findings-snapshot."
    kind: test-assumptions
    milestoneId: M1
    slug: golden-determinism-probe
    title: Probe capture determinism on temp copies
  - description: "Make the integration gate pin exact behavior per the probe report.
      Dedicated capture run separate from the rc!=0 first run: caller owns tmp
      dir, copy_sample, git-init, _make_config (package_name + rumdl override),
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0; tests/_golden.py owns Finding,
      None-safe finding_key, collect_findings(config, capture_path) (run_lint +
      read capture + normalize + sort + assert len!=0), assert_matches_golden
      (Counter multiset diff, sorted added/removed;
      PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 pytest.fails under CI/GITHUB_ACTIONS,
      else warns + rewrites golden+counts; reviewed diff required),
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Serialization indent=2/sort_keys/trailing-newline.
      First run keeps rc!=0 AND retains tool-section/SKIPPED/[CRASH]/W9705
      assertions (positive-exit failures surface there, not in golden). Replace
      substring loop with golden equality + oracle/tool coverage (violations.txt
      RETAINED). Brush-off/carry as tool-qualified lookups (tool='pylint',
      mod.py:49 present / :56 absent). Drift injection on in-memory list copies.
      If probe proves test-side insufficient: bounded src allowance ONLY in
      runner/baseline.py (relativize/POSIX/sort) and
      runner/parsers.py|_record_parsers.py (ordering), <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: integration, `pytest -q`, `lint` pass, empty lint.baseline."
    kind: story
    milestoneId: M1
    slug: golden-findings-snapshot
    title: Golden snapshot of normalized lint findings
    deps:
      - golden-determinism-probe
  - description: "Create tests/assumptions/__init__.py + 3 modules with distinct
      classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts
      (pytestmark no_external_api), tests named
      test_<api>_given_<condition>_then_<expected>, asserting observed behavior
      at pinned versions. astroid: Module.stream().read() returns bytes|str
      (product decodes-if-bytes); doc_node is Const/JoinedStr when docstring
      present else None for module/class/function; nodes_of_class accepts a
      tuple and returns union in document order; Const/JoinedStr string nodes
      expose int fromlineno/end_lineno/col_offset/end_col_offset (asserted on a
      sample literal). pylint (third-party side, not first-party register):
      PyLinter.register_checker(checker) lifecycle incl. open()/close() call
      order (record observed); CheckerTestCase/UnittestLinter capture
      add_message output into release_messages (assert observed MessageTest
      shape); MessageDefinitionTuple leading fields (msgid, symbol, description)
      + record full arity. beartype: discovery contract — decorate a function
      with a TYPE_CHECKING-only forward-ref annotation, assert the OBSERVED
      outcome (call-time vs import-time vs checker-only), record in item report
      for M3. No src/ changes. Must NOT touch AGENTS.md (consolidate is sole
      counts owner)."
    kind: test-assumptions
    milestoneId: M2
    slug: third-party-assumption-tests
    title: Pin astroid/pylint/beartype contracts
  - description: "Extract into tests/_project_helpers.py: copy_sample_project,
      git_init_and_stage (init+config user test/test@test + `git add .`,
      integration/detect-secrets semantics), git_init_bare (init -q + config
      Test/test@example.com, no add, autofix semantics — identities NOT
      unified), stage_file, commit_all, shipped_config_paths, make_runner_config
      (package_name + rumdl override, preserving _make_config side-effect
      contract incl. idempotent overwrite and no-op when shipped rumdl missing),
      build_pylint_overlay_config(project, disable_rule)->Path,
      ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project,
      monkeypatch)->None. Delete duplicate defs in conftest.py and
      _autofix_helpers.py (import instead); integration.py imports only what it
      uses; test_self_lint_clean.py and autofix tests switch imports.
      Per-consumer map: integration->{copy, git_init_and_stage,
      make_runner_config, build_overlay, ensure_precommit, install_twice};
      conftest->{shipped_config_paths} only; _autofix->{git_init_bare,
      stage_file, commit_all} only. Line budget (must remove >=127, target
      <=490): helpers ~58 + oracle reader ~8 + overlay rewrite ~21 + setup
      scaffolding (fake _run_uv/install-twice) ~20 + precommit scaffolding
      (probe + validate/config blocks) ~25 + M1 loop/lookup net ~5 +
      section-slice ~3 + import/docstring trim ~4. integration.py keeps
      path/class/function names; golden+counts byte-identical; sole AGENTS.md
      counts owner (update counts incl. new assumption tests). Acceptance:
      integration, `pytest -q`, `lint` pass."
    kind: story
    milestoneId: M2
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
  - description: "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS.
      Semantic exclusions are symbol/file-level (mark skipped, audit rest
      normally): checkers/_semantic.py+.pyi, new
      _decision_backend/_decision_cache modules (+.pyi),
      _base.py::check_if_meaningful (+stub section),
      no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi
      fidelity/private symbols, @beartype + structural suppressions, trivial
      wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs
      (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export),
      over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules,
      rumdl tests/data-exclude hack (TD-11). Output: rows {module, section,
      evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED
      disjoint-ownership map (this audit is single owner; test-debloat-audit
      consumes it via inter-dep). Reads final state
      (post-golden/assumptions/consolidate) + beartype report."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: coding-rules-audit
    title: Inventory CodingRules violations
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
      - consolidate-integration-helpers
  - description: "Read-only audit of tests/**. Semantic exclusions (mark skipped):
      tests/checkers/test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline class, tests/checkers/conftest.py
      (epic-created), tests/assumptions runtime/decision/cache modules
      (epic-created). Per module: behaviors protected; duplicates (incl.
      golden-covered); CodingRules-Tests violations (first-party mocking,
      naming, markers, in-file fixtures, _factories.py list[Any] tables, far
      cases); repo-self-lint tests for removal (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks); slow/benchmark; task-ID
      names. Output: rows {module, behaviors, duplicate-of, recommendation
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag).
      Owner column aligned to coding-rules-audit's unified map (read via
      inter-dep)."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: test-debloat-audit
    title: Inventory redundant and lint-testing tests
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
      - consolidate-integration-helpers
      - coding-rules-audit
assumptions:
  - assumption: "'Material lint/check behavior' = findings {tool,file,line,col,rule}
      pinned by golden (PYTHON_SETUP_LINT_SEMANTIC=0) + checker unit tests; CLI
      flags/exit codes; baseline/autofix semantics; shipped configs/scopes.
      Other three limbs are pinned by surviving tests inventoried in M3 (CLI:
      tests/runner/test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*;
      configs/scopes: overlay + config tests) — if a limb has no surviving test
      the audit flags blocking debt. Reranker accept/reject decisions are not
      material; heuristic rejections (empty, boilerplate, brush-off, rule-echo)
      are material."
    disposition: confirm with human
    why: Intent replaces the model yet demands preservation; this boundary makes
      'preserve' mechanically testable per limb.
  - assumption: The git-stored decision cache belongs to the repo being linted
      (python-setup itself and consumers alike), at .python-setup-decisions.json
      next to lint.baseline. Only decisions committed; weights (0.03-0.8 GB, own
      licenses) stay in the user model cache.
    disposition: confirm with human
    why: Decisions depend on project content and must reproduce in that project's CI
      without the model.
  - assumption: Dev and CI do not install the `semantic` extra;
      sentence-transformers absent from .venv today. Gates run heuristic + cache
      hits; real-model tests are slow + with_real_api.
    why: Matches current .venv; keeps gates offline, fast, deterministic.
  - assumption: "tests/integration.py, `uv run pytest -q`, `uv run pytest
      tests/integration.py` and `uv run lint` are gate contracts: paths and
      commands do not change."
    why: Infra gates and AGENTS.md reference them; renaming silently breaks gating.
  - assumption: "'Never test linting' means pytest must not assert this repository
      passes its own lint gates — whether by re-running tools in subprocess, by
      AST/source scanning that re-implements a gate, or by config-consistency
      checks that re-lint the repo. `uv run lint` and pre-commit enforce that.
      Tests exercise logic on synthetic inputs and the sample project."
    disposition: confirm with human
    why: AST guards and config re-checks duplicate the gate and rot with rule churn;
      broadening the definition removes them with rationale.
  - assumption: "Only semantic-decision-model starts now;
      runner/checkers/setup-testing-scripts spawn at iteration-2 replan from M3
      audits. Root/epic sharing is narrowed: epic never writes tests/data (regen
      is a root iteration-2 item), AGENTS.md is split by section with a rebase
      prerequisite, tests/assumptions is append-only."
    why: No cross-epic machine edges exist; narrowing removes the write/write races
      by construction.
  - assumption: At least one model among GLiDE-0.4B and smaller Decision-Index
      models has compatible license, Python 3.14 CPU wheels and pinnable
      revision. Else the semantic epic escalates instead of shipping
      non-compliant.
    disposition: verify via semantic-decision-model spikes
    why: GLiDE uses a custom community license, tested on 3.12; smaller candidates
      vary.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker behind suppression-justification with a
      CPU-friendly small decision model plus a git-stored self-cleaning decision
      cache. Preserve every material behavior. Child epic of `modernize`.


      ## Scope (symbol-level; narrowed cross-epic protocol)

      Owned symbols/files: checkers/_semantic.py+.pyi and new private
      backend/cache modules (+.pyi each, @beartype, structlog kwargs,
      tach-clean); check_if_meaningful in checkers/_base.py+.pyi;
      _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject
      [semantic] extra + uv.lock + .gitignore semantic entries; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache modules,
      tests/checkers/conftest.py, new runtime-assumption modules under
      tests/assumptions/.

      Protocol with root: (a) NEVER write tests/data/** (no exception) — read
      golden for verification only; if heuristic outcomes shift, emit a shift
      report (which justification classes flip) + CHANGELOG behavior
      description, and root regenerates golden as an iteration-2 item; (b)
      AGENTS.md pipeline section only, applied onto HEAD containing root M2's
      merge (prerequisite), never touch count lines; (c) shared .py files:
      symbol ownership only; (d) tests/assumptions: append runtime modules only,
      never touch root's __init__ + 3 contract modules. Out of scope: other
      checkers/runner; tests/integration.py, tests/conftest.py (no edits). Any
      runner touch stays minimal + ADR.


      ## Requirements

      1. Spikes before design: (a) fact-finder candidate matrix (GLiDE-0.4B +
      Decision-Index smalls): license (exclude non-commercial), params/size,
      runtime with py3.14 CPU wheels linux/mac/win, vendored/pinned custom code
      (never unpinned trust_remote_code), offline behavior. (b) poc CPU-only:
      cold-load, warm latency, accuracy on labeled corpus (repo's real
      justifications + today's brush-off/meaningful tables); bar: >=90%
      accuracy, >=95% precision on meaningless, >=85% recall on meaningful;
      choose smallest model/prompt/threshold meeting bar, record in ADR. (c)
      test-assumptions: pylint 4.x invocation semantics; cache lock/merge/sweep
      conditional on result — if jobs>1 violates partial-run guarantee,
      constrain to jobs=1 (pinned by test) or per-worker sidecars, recorded in
      cache-design ADR (ADR-CACHE-01).

      2. Decision contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool and
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None
      (None=unavailable, heuristic stands). Public DecisionBackend Protocol
      decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD +
      PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional
      backend kwarg (public in .pyi); get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra or on failure: heuristic + cache
      hits, one warning, sentinel. Weights in user model cache, never git.
      PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root, definitive): JSON
      array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized (strip+collapse ws, keep case), rule (joined
      codes), model ('<id> rev <short12> prompt-vN', no bare hex>=20), decision,
      files (sorted POSIX relpaths)}. Key (justification,rule,model); context is
      model input only. Hits need no model. Writes: lockfile (O_CREAT|O_EXCL
      retry 5s) + merge + atomic temp+move. Sweep scoped to linted files; drop
      empty-files + stale-model entries. Isolation:
      PYTHON_SETUP_LINT_DECISIONS_PATH (tests->tmp, never repo cache). Must pass
      all tools incl. detect-secrets.

      5. Real suppressed codes: extract all codes from
      disable=/noqa:/ignore[...] via existing patterns; normalize (strip, split
      comma), sort, join ','; pass joined string as rule (bare-except keeps
      single 'bare-except-comment'). Rule-echo rejects if primary (lower,
      stripped) equals any element (lower). Cache key uses joined rule. If any
      heuristic outcome on the sample changes: do NOT touch golden; emit shift
      report + CHANGELOG behavior-change description (which justification
      classes flip, not the raw diff); root iteration-2 item regenerates.

      6. Tests: merge brush-off/meaningful/threshold tables into one
      parametrized table; FakeBackend via direct kwarg (units) and env-var
      (check_if_meaningful path); cache round-trip/cleanup/concurrency on tmp +
      hypothesis format round-trip; exactly one slow+with_real_api e2e; delete
      vacuous `is None or ...` assertions; modules <=500 lines, no suppressions;
      never test linting.

      7. Docs: update Scope list + CHANGELOG (user-visible only: extra contents,
      new/deprecated vars, cache file, behavior-change descriptions).


      ## Acceptance

      - Heuristic path unchanged: PYTHON_SETUP_LINT_SEMANTIC=0 sample lint
      equals golden (read-only verification).

      - Cache without model: no extra + cached false decision => W9704 emitted,
      no model load.

      - Brush-off never reaches model: 'pre-existing' + fake backend => False,
      backend uncalled.

      - One call per unique pair: miss + backend => exactly one call per unique
      (justification,rule), persisted sorted.

      - Scoped cleanup: suppression deleted from a.py => linting a.py removes
      entry; linting only b.py keeps it.

      - No retry storm: load fails => one attempt per process, heuristic
      results.

      - Gates: `uv run pytest -q`, `uv run pytest tests/integration.py -v`, `uv
      run lint` pass with empty lint.baseline.
    slug: semantic-decision-model
techDebt:
  - category: impacting
    description: Suppression/bare-except checkers pass their own symbol as `rule`;
      the rule-echo heuristic and model never see the actually-suppressed codes.
    id: TD-1
    resolution: "Semantic req5: extract all codes, pass comma-joined sorted string;
      echo matches any element; epic emits shift report + CHANGELOG behavior
      description, root iteration-2 item regenerates golden."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore; several assertions vacuous (`is None or ...`).
    id: TD-2
    resolution: "Semantic req6: FakeBackend via public Protocol (direct kwarg +
      dotted-path env injection); delete vacuous tests."
  - category: impacting
    description: tests/integration.py 627 lines + too-many-lines suppression;
      duplicates conftest/_autofix helpers; substring-only assertions miss
      drift.
    id: TD-3
    resolution: Probe + M1 pin exact findings with per-tool minimums; M2
      single-sources 10 helpers, moves overlay/setup/precommit scaffolding per
      budget, reaches <=500 without suppression.
  - category: impacting
    description: test_semantic_check.py 506 lines + suppression; heuristic tables
      duplicate test_semantic_threshold.py.
    id: TD-4
    resolution: "Semantic req6: one merged parametrized table; modules <=500."
  - category: adjacent
    description: ~15 checkers repeat structural suppressions (missing-beartype on
      register(), type:ignore[misc] on mixin classes) + copied stream
      read/decode.
    id: TD-5
    resolution: coding-rules-audit inventories; iteration-2 checkers epic fixes
      (base class, shared helper, typed register).
  - category: adjacent
    description: "Legacy/compat: baseline._FALLBACK_TOOLS/peek_fallback_tools,
      _compare_sorted re-export, astroid 3.x docstring fallback despite
      astroid>=4.0.4."
    id: TD-6
    resolution: Iteration-2 runner/checkers epics remove, guarded by golden.
  - category: adjacent
    description: "dispatch.py 500+ char rationale comment ending in `# pylint:
      disable=unjustified-suppression` suppresses the justification checker
      itself."
    id: TD-7
    resolution: "Iteration-2 runner epic: move rationale to design/0002, leave short
      justified comment."
  - category: adjacent
    description: tests/checkers/_factories.py ~1400 lines; ~40 pytest.param tables
      typed list[Any] with pasted justifications; cases far from tests.
    id: TD-8
    resolution: "Iteration-2 checkers epic per test-debloat-audit: ParameterSet
      typing, cases next to tests, split per checker."
  - category: adjacent
    description: Task-ID test names (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*,
      test_t3_*); repo-self-lint tests (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks) duplicate the `uv run lint`
      gate.
    id: TD-9
    resolution: "Iteration-2 epics per test-debloat-audit: rename by behavior;
      remove self-lint tests (broadened never-linting definition)."
  - category: adjacent
    description: "ADR locations disagree: CodingRules requires design/, factory ADRs
      go to docs/adr."
    id: TD-10
    resolution: "Iteration-2 replan: cross-reference (design/README or AGENTS.md
      index). No engine change."
  - category: adjacent
    description: Shipped rumdl.toml excludes tests/data, forcing the integration
      per-run rewrite to lint the sample AGENTS.md; affects golden determinism.
    id: TD-11
    resolution: coding-rules-audit inventories; iteration-2 runner epic fixes (e.g.
      narrow exclude); M1/M2 retain the override.
adrs:
  - consequences: Exact cheap regression detection; golden updates are explicit
      reviewed diffs. Message text not snapshotted. Tool upgrades may require
      reviewed regen. CI cannot silently rewrite. Positive-exit tool failures
      still surface via retained section/SKIPPED assertions, not via golden.
    context: Modernization enforces rules, debloats, swaps the semantic model while
      preserving material behavior. lint.baseline is empty; integration only
      checks planted rule-name presence, missing duplicates, moves, new false
      positives. violations.txt covers only pylint-custom + MD + duplicate-code
      rules.
    decision: "Commit Finding {tool,file?,line?,col?,rule} snapshot at
      tests/data/golden/minimal_sample_project_findings.json plus per-tool
      minimums at ..._tool_counts.json {tool: min_count}. Serialization:
      json.dump(indent=2, sort_keys=True) + trailing newline. Dedicated second
      run_lint capture (baseline=<tmp>/capture.json, overwrite) under
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0 with make_runner_config
      semantics; first run keeps rc!=0 and retains
      tool-section/SKIPPED/[CRASH]/W9705 assertions. Test-side normalize: drop
      msg, relativize vs project, strip './', backslash->'/', as_posix, assert
      non-absolute; sort/diff by None-safe finding_key mirroring
      _violation_sort_key (None file->'', None line/col->-1); Counter-multiset
      diff with sorted added/removed. Golden holds zero __CRASH__; any crash
      fails naming the tool. violations.txt retained as oracle; coverage = every
      oracle rule in golden AND every TOOLS entry meets its minimum count. Regen
      only via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1: pytest.fail under
      CI/GITHUB_ACTIONS ('refusing to rewrite golden under CI...'), warn +
      rewrite golden+counts otherwise, byte-identical across two runs, reviewed
      diff required. Drift injection = synthetic add/drop on in-memory list
      copies. Brush-off/carry are tool-qualified lookups (tool='pylint',
      file='src/minimal_sample/mod.py', line 49 present / line 56 absent)."
    id: ADR-001
    title: Golden findings snapshot as the behavior-preservation contract
  - consequences: Brush-off rejections guaranteed regardless of model; model can
      only tighten acceptance. sentence-transformers dropped; no-try-import
      patterns list the new runtime. Real-model coverage is one slow +
      with_real_api test. Old env var warns via CHANGELOG-documented
      deprecation.
    context: _semantic.py misuses a sentence-transformers cross-encoder as a quality
      judge. The dependency is heavy and absent in dev/CI, so the heuristic
      decides everything today. The intent asks for a CPU-friendly small
      decision model.
    decision: "Keep check_if_meaningful signature and PYTHON_SETUP_LINT_SEMANTIC.
      Heuristic runs first as a hard gate; rejections never reach the model.
      Accepted text goes to cache, then to a local decision model behind a
      public DecisionBackend Protocol decide(justification, rule, context) ->
      float P(meaningful) in [0,1]; decision = prob >= DECISION_THRESHOLD with
      PROMPT_VERSION='prompt-v1'. Injection without patching:
      semantic_check_if_meaningful gains optional backend kwarg (public in
      .pyi), and get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. Model/prompt/threshold
      chosen by spike under compatible license, Python 3.14 CPU wheels, pinned
      revision, no unpinned remote code, meeting bar: >=90% accuracy, >=95%
      precision on meaningless, >=85% recall on meaningful. Ships via `semantic`
      extra, configured by PYTHON_SETUP_LINT_DECISION_MODEL;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Backend
      unavailable returns None; heuristic stands."
    id: ADR-002
    title: Heuristic-gated local decision model for justification checks
  - consequences: W9704 reproducible across machines without the extra; decision
      changes are reviewable diffs. Small line-local merge conflicts possible.
      Consumer repos gain one committed file (install docs mention it); the file
      must pass all tools and not trip detect-secrets.
    context: Results cached in gitignored ~/.cache per-machine file, unbounded,
      keyed by 64-bit truncated SHA-256 including code context. Outcomes diverge
      across machines; stale entries never removed. Intent requires git-stored
      cache with cleanup.
    decision: "Store decisions in committed .python-setup-decisions.json at the
      linted project root (definitive, next to lint.baseline). Format: JSON
      array sorted by (rule, justification, model), indent=2, sort_keys=True.
      Entry {justification (normalized: strip + collapse whitespace, preserve
      case), rule (comma-joined sorted codes), model ('<id> rev <short12>
      prompt-vN', no bare hex >=20 chars), decision: bool, files: sorted POSIX
      relpaths}. Key is (justification, rule, model); context is model input
      only. Reads need no model. Writes: lockfile + merge-on-write + atomic
      temp+move (baseline pattern). Cleanup: mark-and-sweep scoped to linted
      files + drop empty-files and stale-model entries. Isolation via
      PYTHON_SETUP_LINT_DECISIONS_PATH. Lock/merge/sweep is conditional on the
      pylint-semantics spike; if jobs>1 violates the partial-run guarantee, the
      epic constrains to jobs=1 (pinned by test) or per-worker sidecars — the
      choice is recorded in the epic's cache-design ADR (ADR-CACHE-01). Weights
      stay in user model cache."
    id: ADR-003
    title: Git-stored, self-cleaning decision cache
  - consequences: Shared test infra never edited concurrently; debloat runs behind
      golden + assumptions. No machine-checkable cross-epic edges exist, so
      epic/root sharing is narrowed to non-write or prerequisite form; residual
      AGENTS.md/_base.py concurrent-edit risk is accepted with rebase
      discipline. Subsystem epics start one iteration later but scoped from
      evidence.
    context: Three workstreams span ~28.6k LOC. Parallel edits to shared test infra
      would conflict. Intent requires test infra/assumptions before debloat. The
      semantic epic shares surfaces with root (AGENTS.md, _base.py symbols,
      tests/assumptions, golden dir) but the engine has no cross-epic dependency
      edges.
    decision: "Iteration 1: root delivers golden net, test-infra consolidation,
      third-party assumption tests, read-only audits, and spawns
      semantic-decision-model now under a narrowed protocol: (a) the epic NEVER
      writes tests/data/** — golden regen after a semantic heuristic shift is a
      root iteration-2 item planned at replan from the epic's shift report (epic
      reads golden for verification only); (b) AGENTS.md: root M2 solely owns
      count lines, epic solely owns the pipeline section, and the epic's edit
      has prerequisite 'applies onto HEAD containing M2's merge' (epic never
      touches count lines); (c) shared .py files: symbol-level ownership, rest
      auditable; (d) tests/assumptions: root owns __init__ + 3 contract modules,
      epic appends runtime modules only. Iteration 2 (replan): re-glob HEAD,
      re-validate the unified ownership map (catches epic-created modules), then
      spawn runner/checkers/setup-testing-scripts epics. Policy: pytest never
      asserts this repo passes its own lint gates (no subprocess re-lint, no AST
      re-implementation, no config re-checks); `uv run lint` does that."
    id: ADR-004
    title: Progressive saga decomposition with narrowed cross-epic protocol


--- Prior Plan plan-2.1.yaml ---
iteration: 2
milestones:
  - directionalInterfaces:
      - "_RuffFormatLintTool(LintTool) in runner/dispatch.py:
        build_command(config,_path,_exclude)->check mode
        ['ruff','format','--check','--config',<resolved ruff.toml>,...paths]
        (default); build_format_command(...)->mutating mode without --check.
        cli.py phase-1a calls build_format_command (fix-only), normal pass calls
        build_command. runner/_config.py maps 'ruff format'->ruff.toml;
        _config_flag_for handles it. No if-spec.name in _build_command."
      - "Registry invariants owned by runner/dispatch.py, re-exported via
        runner/__init__.py: EXPECTED_TOOL_NAMES (14); FORMATTER_ONLY={'ruff
        format'} (statistics-exempt); STATISTICS_PARSER_TOOLS (13);
        RECORD_PARSER_TOOLS (9); RECORDLESS_TOOLS={tach
        check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
        intentional. Tests import from python_setup_lint.runner. Migration:
        test_lint_runner set+count 13->14; _factories_extras 13->14; stats + t3
        assert STATISTICS set; fakes invariants assert EXPECTED set."
      - "Docs contract: every in-scope tool-count site -> 14 by grep `13[
        -]?tools?|all_13|== 13` with per-hit disposition:
        AGENTS.md:9,43,63,92,93 + counts table :10-11; README.md:17,58;
        docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
        runner/__init__.py:3; cli.py:314; tests/runner/_factories.py:46;
        _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
        test_extra_tools.py:237; test_self_lint_clean.py:3;
        test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
        test_testing_fakes.py:137,165; plus any further tool-count grep hit.
        EXCLUDED (stays 13): CHANGELOG.md:104 historical. Allowlist:
        MD013/130/v0.13 and other non-tool-count 13s. tool_counts.json asserted
        14 keys incl 'ruff format':0 (verify, not rewrite)."
    id: M1
    scenarios:
      - >-
        Scenario: Gates green per-gate
          Given clean HEAD with empty lint.baseline
          When format gate exits 0 (all files formatted; set derived via git ls-files, count not pinned), lint gate reports zero violations in src/** and tests/**, `pytest -q` exits 0, integration exits 0, and secrets-triage-spike records its verdict
          Then all gates pass: the 6 named tool-count tests fixed (test_tool_spec_given_known_tools_then_present, test_tool_spec_given_tools_then_autofix_and_no_duplicates, test_statistics_parsers_given_all_tools_then_covered, test_parser_completeness_given_all_tools_then_have_parser, test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched], test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]), SIM102/R0914/C0208 fixed with no new violations, lint.baseline stays [], and factory-journal secrets are owned by the spike verdict (human-async), not dev acceptance
      - >-
        Scenario: Lint check-only without --fix
          Given a clean worktree
          When `uv run lint` runs without --fix
          Then `git status --porcelain` is empty; a command spy shows the normal-pass ruff-format cmd contains --check and --config with a resolved existing path (composed temp accepted, no literal match), and the mutating format cmd (phase-1a) runs only under --fix without --check
      - >-
        Scenario: Registry single-sourced
          Given the TOOLS table
          When tests and docs read the tool count
          Then every in-scope tool-count assertion reads 14 from EXPECTED_TOOL_NAMES with FORMATTER_ONLY/RECORDLESS exemptions explicit; verification is the tool-count grep with per-hit disposition and allowlist; no in-scope hit remains 13
    title: Green baseline and 14-tool runner contract
  - directionalInterfaces:
      - "tests/_project_helpers.py sole site, 11 helpers with pinned
        names/signatures: copy_sample_project(dest_parent: Path)->Path
        (dest_parent.mkdir(parents=True, exist_ok=True); copytree
        tests/data/minimal_sample_project -> dest_parent/'project'; returns
        project path); git_init_and_stage(project: Path)->None (test/test@test +
        add .); shipped_config_paths()->dict[str,Path];
        make_runner_config(project: Path)->RunnerConfig (minimal_sample + rumdl
        override idempotent, no-op if shipped rumdl missing); git_init_bare(cwd:
        Path)->None (Test/test@example.com, -q, no add);
        write_project_file(cwd,rel,content)->Path; stage_file(cwd,rel)->None;
        commit_all(cwd,msg='init')->None; build_pylint_overlay_config(project:
        Path, disable_rule: str)->Path; ensure_precommit_or_skip()->None;
        install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
        _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
        _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
        shipped_config_paths def entirely (no re-export); rewrite
        test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
        tests._project_helpers import ...`; integration.py consumes
        make_runner_config + mapped subset. Cycle guard: _project_helpers
        imports stdlib + python_setup_lint.runner/setup/testing only, never
        tests.conftest/tests.integration. Test class/function names unchanged;
        helper renames per matrix only."
      - "tests/_golden.py: collect_findings(project,*,config)->list[Finding]
        keeps tool order (no sort, synthetic-empty safe); sorting in
        serialize_write + _diff_keys; caller test_setup_new_and_lint asserts
        len(findings)!=0 post-collect and retains first-run [CRASH]-absent +
        SKIPPED-only-package_name asserts; no Finding __CRASH__ sentinel;
        assert_matches_golden Counter-multiset + UPDATE guard (fail under
        CI/GITHUB_ACTIONS); slice_tool_section(output,'[pylint]','[pylint-pyi]')
        used by overlay test; read_oracle_rules, assert_oracle_coverage,
        assert_tool_coverage retained. Determinism proven by temp-copy
        double-collect (two fresh temp copies, sha256 of serialized findings
        equal each other and equal committed golden hash); UPDATE_GOLDEN=1 never
        touches committed files except reviewed regen."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once per matrix
          Given tests/_project_helpers.py
          When tests/ is searched
          Then each of the 11 helpers is defined exactly once there (copy with mkdir-parents), duplicates in conftest.py and _autofix_helpers.py are deleted, the 2 conftest importers are rewritten to _project_helpers, each consumer imports only its mapped subset, _project_helpers imports nothing from tests.conftest/tests.integration, and stay-symbols are untouched
      - >-
        Scenario: Integration gate within single limit
          Given >=161 lines removed (661-><=500: helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with :12 too-many-lines removed via extraction and :202 stale too-many-locals disable deleted directly (globally disabled in config/.pylintrc-tests:39; verify pylint tests + W9704 clean), test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Golden hardening via caller asserts
          Given the committed golden
          When integration runs plus synthetic drift injection plus temp-copy double-collect
          Then findings serialize sorted with caller len!=0, zero [CRASH], SKIPPED only package_name, drift names exact added/removed keys, oracle + per-tool coverage hold, both temp-copy hashes equal the committed hash without mutating committed files, and the overlay test uses the shared slicer
    title: Test infra consolidation and golden hardening
  - directionalInterfaces:
      - "Eval contract: decide(justification,rule,context)->float P(meaningful)
        in [0,1]; mapping: justification=primary=(comment or text).strip(),
        rule=joined suppressed codes (spike uses current rule symbol where codes
        unavailable, recorded), context=code_context (None allowed);
        decision=prob>=threshold. Modes: veto: final=heuristic(text) AND
        (prob>=threshold) (model only flips True->False; heuristic-False never
        reaches model); replace: final=(prob>=threshold), heuristic deleted.
        Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency).
        Corpus: threshold 30+50 + brush-off/meaningful tables + N real repo
        suppressions, DEDUPED by normalized justification (target >=100
        post-dedup), stratified heuristic-rejected (easy) vs heuristic-accepted
        (model-decides); rubric (specific technical justification vs
        placeholder/deferral/brush-off); per-source + per-stratum breakdown.
        Bars >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall
        apply to the heuristic-accepted stratum (overall also reported). Report
        per-candidate at 0.5/0.6/0.7 in both modes; all matrix candidates scored
        or explicitly excluded."
      - "Cache contract (spike-chosen): tracked JSON array sorted by
        (rule,justification,model), indent=2 sort_keys=True; unified entry
        {justification, rule, model '<id> rev <short12> prompt-vN', decision,
        files sorted POSIX} + spike-decided {version, prompt hash, last-seen?};
        key (justification,rule,model) with secrets-clean encoding (no bare
        hex>=20, detect-secrets clean); normal lint zero writes (hash/mtime
        assert); refresh command/flag only (lockfile + merge + atomic,
        CI-guarded, DECISIONS_PATH isolation); prune empty-files + stale-model."
      - "Pylint/concurrency contract (writer-first): identify writer (checker
        open/close vs runner post-process) + write timing (per-visit vs
        end-of-run) + --path scoping across 3 sequential pylint invocations (no
        -j, no contention); verdict derives crash-safe lock/merge/atomic vs
        no-lock runner merge vs jobs=1/sidecars-if--j."
    id: M3
    scenarios:
      - >-
        Scenario: Model choice is evidence-based over all candidates
          Given the deduped labelled corpus (>=100 post-dedup, rubric + per-source + per-stratum split)
          When the poc scores GLiDE, decider-nano, bekko-17m, ettin-150m, MiniLM at 0.5/0.6/0.7 in veto and replace modes (or records explicit exclusion)
          Then the report cites the 90/95/85 bars per threshold per stratum (compliance on heuristic-accepted stratum) and recommends the smallest compliant model+prompt+threshold+mode or a no-go with evidence
      - >-
        Scenario: Cache deterministic-given-cache+model
          Given the proposed schema on a temp copy
          When W9704 runs with model absent, present-miss, and cache-hit
          Then heuristic-rejected verdicts are identically False without model contact, accepted+hit equals the persisted model verdict, accepted+miss+absent equals heuristic True, prune drops stale/deleted entries, and normal lint shows zero writes by hash
      - >-
        Scenario: Writer and timing pinned before lock design
          Given pylint 4.x invocation tests
          When writer + timing + --path scoping are pinned
          Then the cache lock/merge/sweep design is derived (crash-safe atomic vs runner merge vs jobs=1/sidecars-if--j) with --path-scoped sweep
    title: Decision-model and git-cache design spikes
  - directionalInterfaces:
      - "Replan input contract: audits emit structured tables in item reports
        (engine-durable orchestration records: items/*/assignment + wave reports
        + decisions/, readable at replan per the task status contract);
        iteration-3 replan consumes reports + re-globs HEAD for validation only
        (no committed map; fact-finders write nothing; escape hatch = kind
        change to committed artifact if the engine ever drops reports). Owner
        enum {runner,checkers,setup-testing,semantic,root}. Ownership universe =
        src/** + scripts/** + tests/** EXCLUDING tests/data/**
        (stubs/conftest/__init__/_factories included; stub follows .py).
        Root-owned group (epics read-only): tests/data/** (golden,
        minimal_sample, oracles; golden regen only by root item), config/**,
        docs/**, repo-root files. Every universe file appears exactly once with
        exactly one owner; root-owned listed as a group."
      - "File ownership separate from symbol exclusions: ownership is
        whole-file; skips live in an exclusion column (src: _semantic.py+.pyi,
        _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS; tests:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline). Planned-path reservations (new
        backend/cache modules, epic conftest/runtime modules) listed separately,
        not globbed."
    id: M4
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried with disjoint ownership
          Given CodingRules.md and AGENTS.md
          When the audit completes on final HEAD (M1+M2 merged)
          Then every ownership-universe file is listed with violations plus exactly-once owner, the root-owned group (tests/data, config, docs) is listed once, semantic symbols are marked skipped in the exclusion column, and planned paths are reserved
      - >-
        Scenario: Test redundancy inventoried with pinning limbs
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, repo-self-lint tests are listed for removal, each material limb names pinning tests or blocking debt, and owners align to the unified map
      - >-
        Scenario: Replan input is complete and validatable
          Given both audit reports plus HEAD
          When the iteration-3 replan re-globs HEAD
          Then every universe file validates against exactly one owner, the root-owned group matches, exclusions reference existing symbols, and reservations name only planned paths
    title: Debloat inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model (if any) meets license + CPU + py3.14 +
      90/95/85 bars on the heuristic-accepted stratum is unknown. GLiDE-0.4B:
      Fastino license, 0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17.
      Apache alternatives vary in accuracy/license/CPU proof. No CPU benchmark
      exists here; mapping/modes/metric now pinned, corpus deduped + stratified
      by the spike."
    id: U1
    spikeOutlines:
      - "model-candidate-matrix (fact-finder): license, params/size, runtime,
        py3.14 wheels, custom-code, pinnable revision; excludes CC-BY-NC, flags
        Fastino/unclear"
      - "model-eval-poc (poc, CPU-only): ALL candidates at 0.5/0.6/0.7 in veto +
        replace modes on >=100 deduped corpus with rubric; compliance on
        heuristic-accepted stratum; smallest compliant
        model/prompt/threshold+mode or no-go"
      - "decision-runtime-pinning (test-assumptions, conditional on eval):
        py3.14 CPU wheels + import/device/offline + custom-code pinning for the
        chosen runtime (skip on no-go)"
  - description: "Cache key encoding, schema extras, prune/update semantics, writer
      identity/timing, and --path scoping are unknown. Open: secrets-clean
      encoding (not full hex), version/prompt-hash/last-seen fields, refresh
      command, CI guard, checker- vs runner-side writer, write timing, sweep
      scope."
    id: U2
    spikeOutlines:
      - "pylint-cache-assumptions (test-assumptions, writer-first): pin writer +
        timing + --path scoping across sequential invocations; verdict derives
        lock/merge/atomic vs runner merge vs jobs=1/sidecars-if--j"
      - "cache-design-spike (poc on temp copies, consumes writer verdict):
        unified schema + spike-chosen encoding + prune + refresh/CI/isolation +
        deterministic-given-cache+model proof with hash-asserted zero
        normal-lint writes"
  - description: Size/shape of coding-rules debt (~8.9k src LOC) and
      redundant/lint-testing tests (~18.4k test LOC, 772 tests) unmeasured;
      subsystem epics need the unified map with file-vs-symbol separation,
      root-owned groups, and planned-path reservations.
    id: U3
    spikeOutlines:
      - coding-rules-audit (fact-finder on final M1+M2 HEAD, single owner of
        unified map + exclusion column + reservations)
      - test-debloat-audit (fact-finder, aligned via inter-dep; per-limb pinning
        inventory)
  - description: "detect-secrets flags on clean checkout are of unknown source:
      tracked factory runtime journals (environmental) vs a real secret. The
      exclusion mechanism (engine config vs gate flag) is also unknown, so M1
      lint-green cannot be defined for that tool until triaged."
    id: U4
    spikeOutlines:
      - "secrets-triage-spike (fact-finder, no repo writes): clean-checkout
        scan, flagged files + sha256 + verdict environmental-vs-real + exact
        exclusion mechanism; human-async operator request if environmental"
itemOutlines:
  - deps: []
    description: "Retain 14. (1) Add _RuffFormatLintTool(LintTool) in dispatch.py:
      build_command -> check mode (--check + --config resolved ruff.toml);
      build_format_command -> mutating mode; register in _strategy_for; map
      'ruff format'->ruff.toml in _config.py + _config_flag_for. cli.py phase-1a
      calls build_format_command, normal pass calls build_command. No
      if-spec.name in _build_command. (2) Registry: EXPECTED_TOOL_NAMES +
      FORMATTER_ONLY + STATISTICS/RECORD/RECORDLESS sets owned by dispatch.py,
      re-exported via runner/__init__; migrate the 6 named tests
      (test_lint_runner set+count; _factories_extras len+id; stats + t3 to
      STATISTICS set with FORMATTER_ONLY exemption; fakes invariants to EXPECTED
      set). (3) Docs: migrate every in-scope tool-count site to 14 with per-hit
      report (AGENTS.md:9,43,63,92,93 + counts :10-11; README.md:17,58;
      docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
      runner/__init__.py:3; cli.py:314; _factories.py:46;
      _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
      test_extra_tools.py:237; test_self_lint_clean.py:3;
      test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
      test_testing_fakes.py:137,165; plus any further tool-count grep hit).
      CHANGELOG.md:104 stays 13 (historical); MD013/130/v0.13 allowlisted.
      Assert tool_counts.json already 14 keys (not rewrite). Verify:
      format/lint/pytest/integration exit 0; git status --porcelain empty after
      `uv run lint` (no --fix); spy asserts normal-pass cmd has --check +
      --config with resolved existing path (composed temp accepted) and phase-1a
      omits --check (fix-only); golden byte-identical; baseline []."
    kind: story
    milestoneId: M1
    prodBudgetHint: 60
    slug: runner-format-contract
    title: Ruff format strategy and 14-tool registry fix
  - deps:
      - runner-format-contract
    description: "Serialized after runner-format-contract (shared cli.py ownership;
      applies onto the phase-1a call-site shape). Behavior-preserving refactors,
      baseline stays []: (1)
      src/python_setup_lint/checkers/stub/coverage.py:196-198 SIM102 (elif
      TypeAlias + nested if AssignName) -> single combined condition. (2)
      cli.py:50 _run_tool_pipeline 23-><=20 locals by extracting phase/select
      helpers (no pipeline semantics change). (3)
      tests/runner/_factories_extras.py:383 C0208 set-iteration -> sequence
      type. Secrets explicitly OUT of scope (owned by secrets-triage-spike).
      Verify: lint gate reports zero violations in src/** and tests/**; pytest +
      integration show no new failures; golden byte-identical."
    kind: story
    milestoneId: M1
    prodBudgetHint: 35
    slug: baseline-violations-fix
    title: Fix SIM102, too-many-locals, C0208
  - deps: []
    description: "No repo edits; report only. On clean checkout run the declared
      lint gate / detect-secrets scan; capture every flagged file + sha256 +
      baseline entry. Verdict: environmental (only tracked factory runtime
      journals) vs real secret. If environmental: specify the exact exclusion
      mechanism (engine config vs gate command flag) + evidence hashes, and
      record the operator/engine exclusion request as human-async (M1 dev
      acceptance does not wait on it). If real: specify redact/rotate follow-up.
      Output feeds M1 acceptance + U4."
    kind: fact-finder
    milestoneId: M1
    prodBudgetHint: 0
    slug: secrets-triage-spike
    title: Triage detect-secrets factory-journal flags
  - deps: []
    description: "Tests-only (tests/** ONLY; FORBIDDEN lint.baseline, AGENTS.md,
      docs/**, src/**). Red-test-exempt. Create tests/_project_helpers.py per
      matrix (11 helpers): copy_sample_project(dest_parent)->Path [mkdir
      parents, copytree tests/data/minimal_sample_project ->
      dest_parent/'project', ex _copy_sample]; git_init_and_stage(project)->None
      [test/test@test + add ., ex _init_git]; shipped_config_paths()->dict [ex
      _shipped_config_paths]; make_runner_config(project)->RunnerConfig
      [minimal_sample + rumdl override idempotent, no-op if shipped rumdl
      missing, ex _make_config]; git_init_bare(cwd)->None [Test/test@example.com
      -q no add, ex _git_init]; write_project_file(cwd,rel,content)->Path [ex
      _write_file]; stage_file(cwd,rel)->None [ex _stage];
      commit_all(cwd,msg)->None [ex _commit_all];
      build_pylint_overlay_config(project,disable_rule)->Path [extract overlay
      217-240]; ensure_precommit_or_skip()->None;
      install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
      _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
      _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
      shipped_config_paths def entirely (no re-export); rewrite
      test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
      tests._project_helpers import ...`; integration.py uses make_runner_config
      + mapped subset. Cycle guard: _project_helpers imports stdlib +
      python_setup_lint.runner/setup/testing only, never
      tests.conftest/tests.integration. Test class/function names unchanged.
      Budget: >=161 removed (661-><=500): helpers 57 + overlay 28 +
      setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 +
      import/trim 8 = 163. Remove :12 too-many-lines via extraction; delete :202
      stale too-many-locals disable directly (globally disabled in
      config/.pylintrc-tests:39; verify pylint tests + W9704 clean). Verify:
      diff stat tests/** only; golden diff empty; integration + test_golden
      pass; touched files format-clean."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
  - deps:
      - consolidate-integration-helpers
    description: "Tests-only hardening, committed files never mutated by proofs. No
      __CRASH__ sentinel and no sort-in-collect: keep collect tool-order;
      sorting stays in serialize_write + _diff_keys; add caller asserts in
      test_setup_new_and_lint (len(findings)!=0 post-collect; first-run [CRASH]
      absent + SKIPPED only package_name retained); keep Counter-multiset diff +
      UPDATE guard + oracle/tool coverage; use
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test;
      extend tests/test_golden.py synthetic coverage (ordering, POSIX, diff
      keys, CI-guard, coverage, byte-format, empty-list safe). Determinism via
      temp-copy double-collect: collect+serialize on two fresh temp copies,
      sha256 hashes equal each other and equal committed golden hash.
      UPDATE_GOLDEN=1 never touches committed files except reviewed regen.
      Verify: integration + test_golden pass; golden+counts byte-identical."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: golden-contract-hardening
    title: Harden golden via caller asserts and shared slicer
  - deps: []
    description: "No repo edits; report only. Matrix for GLiDE-0.4B,
      tasksource-decider-nano, bekko-17m, ettin-150m + MiniLM baseline: license,
      params/weights, runtime stack, py3.14 CPU wheels (linux/mac/win),
      custom-code/vendoring burden, pinnable revision, offline behavior. Exclude
      CC-BY-NC; flag Fastino + bekko-unclear-license for human review. Output
      feeds eval-poc (all candidates) + cache spike (model-id/rev format) +
      runtime pinning."
    kind: fact-finder
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-candidate-matrix
    title: Decision-model candidate matrix
  - deps:
      - model-candidate-matrix
    description: "No committed code; report only (temp venv/copy permitted, network
      inside spike only). Mapping: justification=primary=(comment or
      text).strip(), rule=joined suppressed codes (current rule symbol where
      codes unavailable, recorded), context=code_context (None allowed);
      decision=prob>=threshold. Modes: veto final=heuristic AND
      (prob>=threshold); replace final=(prob>=threshold). Smallest=lexicographic
      (params, weights bytes, CPU RSS, p50 latency). Corpus: threshold 30+50 +
      brush-off/meaningful tables + N real repo suppressions, DEDUPED by
      normalized justification (target >=100 post-dedup), stratified
      heuristic-rejected (easy) vs heuristic-accepted (model-decides); rubric:
      specific technical justification vs placeholder/deferral/brush-off;
      per-source + per-stratum breakdown. Score ALL matrix candidates at
      0.5/0.6/0.7 in BOTH modes (or record explicit exclusion): accuracy,
      meaningless-precision, meaningful-recall, CPU p50/p95 + RSS. Compliance
      bars (>=90% acc / >=95% meaningless-precision / >=85% meaningful-recall)
      apply to the heuristic-accepted stratum (overall also reported). Recommend
      smallest compliant model+prompt+threshold+mode, or no-go with evidence."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-eval-poc
    title: CPU accuracy/latency evaluation over all candidates
  - deps:
      - model-candidate-matrix
      - pylint-cache-assumptions
    description: "Prototype on temp copies only; no committed files. Consumes
      writer-first verdict. Design unified tracked schema: JSON array sorted by
      (rule,justification,model), indent=2 sort_keys; entry {justification,
      rule, model '<id> rev <short12> prompt-vN', decision, files sorted POSIX}
      + spike-decided {version, prompt hash, last-seen?}; key
      (justification,rule,model) with spike-chosen secrets-clean encoding (no
      bare hex>=20, detect-secrets clean, collision-safe). Refresh via explicit
      command/flag only (lockfile + merge + atomic, CI-guarded, DECISIONS_PATH
      isolation). Prune: drop empty-files + stale-model (+age policy if
      defined). Prove deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit == persisted verdict; accepted+miss+absent
      == heuristic True; normal lint zero writes (hash/mtime assert)."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: cache-design-spike
    title: Tracked cache schema and determinism prototype
  - deps: []
    description: "Writer-first reframing (runner is sequential, pylint specs pass no
      -j: no contention today). Identify FIRST: writer (checker open()/close()
      during pylint subprocess vs runner post-process merge) + write timing
      (per-visit vs end-of-run) + --path scoping across
      pylint/pylint-pyi/pylint-tests sequential invocations. Then derive:
      lockfile+merge+atomic needed for crash-safety vs unnecessary (runner-side
      post-merge) vs jobs=1/sidecars only if -j introduced. Add
      tests/assumptions/test_pylint_cache_semantics.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Verdict
      feeds cache-design-spike."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: pylint-cache-assumptions
    title: Pin pylint writer, timing, and path scoping
  - deps:
      - model-eval-poc
    description: "Conditional on eval recommendation (no-go -> report-only skip, no
      file). For the chosen runtime only: verify py3.14 CPU wheels
      (linux/mac/win), import/device/offline contract (CPU fallback, no network
      on hit), and custom-code pinning (vendored revision, never unpinned
      trust_remote_code). Add
      tests/assumptions/test_decision_runtime_contracts.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Acceptance:
      wheels/APIs pinned or explicit blocker recorded for iteration-3 epic."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: decision-runtime-pinning
    title: Pin chosen runtime wheels and API contracts
  - deps:
      - baseline-violations-fix
      - consolidate-integration-helpers
      - golden-contract-hardening
      - runner-format-contract
    description: "Read-only; zero repo writes. Audit src/** + scripts/** vs
      CodingRules/AGENTS on final HEAD (contains M1 + M2 merges). Output in item
      report (engine-durable replan input): rows {module, section, evidence
      file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint
      file-ownership map over the ownership universe (src+scripts+tests minus
      tests/data; owner enum {runner,checkers,setup-testing,semantic,root}; stub
      follows .py; tests/data + config + docs as root-owned group) +
      symbol-exclusion column (_base.py::check_if_meaningful,
      _OPTIONAL_IMPORT_PATTERNS, _semantic.py+.pyi) + planned-path reservations
      (new backend/cache modules). Single owner of the map; test audit aligns
      via inter-dep. Reads final HEAD + beartype report + secrets-spike
      verdict."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: coding-rules-audit
    title: Inventory CodingRules violations and ownership
  - deps:
      - coding-rules-audit
      - consolidate-integration-helpers
      - golden-contract-hardening
    description: "Read-only; zero repo writes. Audit tests/** (minus tests/data,
      root-owned). Output in item report: rows {module, behaviors, duplicate-of,
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      LoC/runtime estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag) +
      symbol exclusions (test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline) + planned-path reservations (epic
      conftest/runtime modules). Owner column aligned to coding audit's unified
      map via inter-dep (file ownership separate from symbol skips). Iteration-3
      replan consumes both reports + HEAD re-glob validation."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: test-debloat-audit
    title: Inventory redundant tests and pinning limbs
  - deps:
      - baseline-violations-fix
    description: "Close the M1 green-baseline tail: wave-2 report lists lint still
      red, and the two W9704 sites from infra notes
      (src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py
      options-Any site, src/python_setup_lint/testing.py list[Any]/type-ignore
      site) were never owned by any item (TD2-B2 omitted them). Steps: (1)
      Reproduce current failures via the declared gates (format check + 13-tool
      lint) or scoped pylint/pylint-pyi/pylint-tests on src/** and tests/**;
      capture exact remaining violations. (2) Fix with
      justification-comment-only edits (no behavior change; red-test-exempt like
      baseline-violations-fix): strengthen trailing justifications so the
      justification checker accepts. If additional violations appear, fix only
      if trivially behavior-preserving, else record as debt in the report — do
      not balloon scope. FORBIDDEN: lint.baseline edits (stays []),
      tests/data/** changes, golden regen, unrelated refactors,
      .secrets.baseline, factory records. Secrets-triage verdict is human-async
      and out of scope. Verify: lint gate zero violations in src/** and
      tests/**; `pytest -q` + integration show no new failures; golden
      byte-identical; touched files format-clean."
    kind: story
    milestoneId: M1
    prodBudgetHint: 5
    slug: remaining-lint-violations-fix
    title: Fix remaining src/tests lint violations (W9704 tail)
assumptions:
  - assumption: Material behavior = golden findings (SEMANTIC=0) + checker unit
      tests + CLI flags/exit codes + baseline/autofix semantics + shipped
      configs/scopes. Reranker accept/reject is not material; heuristic
      rejections (empty, boilerplate, brush-off, rule-echo) are material. Model
      may tighten acceptance (new W9704 under SEMANTIC=1 vs heuristic-only
      today) by design; SEMANTIC=1 golden will shift with shift report +
      CHANGELOG + root regen.
    disposition: confirm with human
    why: Makes preservation mechanically testable while allowing the swap;
      tightening must be operator-visible, not mistaken for regression.
  - assumption: Git-stored decision cache lives in the linted repo (proposed
      .python-setup-decisions.json next to lint.baseline); weights stay in user
      model cache, never git. Spikes assume this path with DECISIONS_PATH
      isolation; operator confirms filename/location before iteration-3
      implementation.
    disposition: confirm with human
    why: Decisions must reproduce in CI without the model; weights are 0.03-0.8GB
      with own licenses; committed file affects
      gitignore/hatch/consumers/secrets.
  - assumption: Dev/CI do not install the `semantic` extra; gates run heuristic +
      cache hits. Real-model tests are slow + with_real_api, never in the
      default suite.
    why: Matches current venv (no torch/transformers); keeps gates offline, fast,
      deterministic.
  - assumption: "'Never test linting' bans pytest asserting this repo passes its own
      gates (subprocess re-lint, AST re-implementation, config re-checks).
      Golden/integration behavior contracts are retained, not removed."
    disposition: confirm with human
    why: Removes gate-duplicating tests without deleting the fit-for-purpose
      contract.
  - assumption: GLiDE-0.4B Fastino Community License is not accepted until human
      review; spikes proceed Apache-first (flag Fastino + bekko-unclear) and
      exclude CC-BY-NC. If eval recommends GLiDE, implementation pauses for
      approval; if no candidate meets license + CPU + py3.14 + bars, the epic
      escalates.
    disposition: confirm with human
    why: MIT package cannot absorb unclear/non-commercial licensing by default;
      operator must see the gating criterion before the eval verdict.
  - assumption: "Gate contracts (paths/commands) do not change:
      tests/integration.py, `pytest -q`, integration, split format/lint gates
      until M1 merges, then reunify. Never run bare `uv run lint` (pre-M1
      mutation hazard) or --overwrite-baseline; captures run on temp copies
      only."
    why: Bare lint mutates pre-M1; split gates are the check-only workaround.
  - assumption: Semantic epic record spawns in iteration 2; its implementation runs
      in iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at
      the iteration-3 replan from M4 audits. Single replanAfter on M4; M3 spikes
      report without replanning.
    why: Parallel M3/M4 with one replan gate avoids premature/deadlocked replans and
      pins the spawn wave.
  - assumption: Factory-journal detect-secrets hits are triaged by
      secrets-triage-spike (environmental vs real with hash evidence). M1 dev
      acceptance is zero violations in src/** and tests/**; any factory-journal
      exclusion is operator/engine action tracked as human-async and never
      blocks dev items.
    disposition: verify via secrets-triage-spike
    why: Isolates the environmental unknown from dev stories per uncertainty
      containment; M1 green must not depend on out-of-band operator action.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker with a CPU-friendly small decision
      model + git-stored self-cleaning cache. Child epic of `modernize`. Record
      spawns iteration 2; implementation runs iteration 3 consuming spikes
      (candidate matrix, CPU eval, cache design, pylint semantics, runtime
      pinning).


      ## Scope (symbol-level)

      Owned: checkers/_semantic.py+.pyi + new private backend/cache modules
      (+.pyi, @beartype, structlog kwargs, tach-clean); check_if_meaningful in
      _base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py;
      pyproject [semantic] extra + uv.lock + .gitignore + hatch inclusion; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section only, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache tests,
      tests/checkers/conftest.py, runtime modules under tests/assumptions/.
      Protocol: NEVER write tests/data/** (read golden for verification; on
      heuristic shift emit shift report + CHANGELOG description, root
      regenerates). AGENTS.md pipeline section ONLY (Semantic justification
      pipeline, ~AGENTS.md:79-85), applied onto HEAD containing M1's merge (M1
      owns all count lines); never touch count lines (:9,43,63,92,93) or counts
      table (:10-11). tests/assumptions append-only. No edits to
      tests/integration.py, tests/conftest.py. Runner touch minimal + ADR.


      ## Requirements

      1. Implement spike verdict: chosen model id/revision, noul prompt +
      criteria, threshold meeting >=90% acc / >=95% meaningless-precision /
      >=85% meaningful-recall on the heuristic-accepted stratum, in the
      recommended mode (veto vs replace), or escalate on no-go. No unpinned
      trust_remote_code; exclude non-commercial; Fastino needs human approval.

      2. Contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool +
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None.
      Public DecisionBackend Protocol decide(justification,rule,context)->float
      with spike-pinned mapping (justification=primary, rule=joined codes,
      context=code_context); DECISION_THRESHOLD + PROMPT_VERSION. Injection:
      optional backend kwarg (public in .pyi) + test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND dotted path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra/failure: heuristic + cache hits, one
      warning, sentinel. Weights in user cache. PYTHON_SETUP_LINT_DECISION_MODEL
      selects model@revision; RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root): JSON array sorted
      by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized, rule joined codes, model '<id> rev <short12>
      prompt-vN' (no bare hex>=20), decision, files sorted POSIX} +
      spike-decided {version, prompt hash, last-seen}. Key
      (justification,rule,model) with spike-chosen secrets-clean encoding.
      Normal lint read-only (hash-asserted zero writes); explicit refresh writes
      via lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH
      isolation. Sweep scoped to linted files; drop empty-files + stale-model.
      Must pass all tools incl. detect-secrets. Concurrency per writer-first
      verdict.

      5. Real suppressed codes: extract all codes, normalize/sort/join ',' as
      rule (bare-except keeps single symbol). Rule-echo rejects on any element.
      On shift: shift report + CHANGELOG, root regenerates golden.

      6. Tests: merge brush-off/meaningful/threshold tables into one deduped
      parametrized table; FakeBackend via kwarg + env; cache
      round-trip/cleanup/concurrency on tmp + hypothesis format round-trip;
      exactly one slow+with_real_api e2e; delete vacuous `is None or ...` +
      ImportError-propagation test; modules <=500, no suppressions; never test
      linting.

      7. Docs: Scope list + CHANGELOG (user-visible only).


      ## Acceptance

      - SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit
      without model emits persisted verdict with no load. Brush-off never
      reaches model; one call per unique pair; scoped cleanup; no retry storm.
      Format/lint/pytest/integration green with empty baseline.
    slug: semantic-decision-model
techDebt:
  - category: blocking
    description: "`ruff format` ToolSpec mutates the worktree (plain `ruff format`,
      no --check/--config, default 88 vs shipped 130); phase-1a vs normal pass
      indistinguishable at _fix=False."
    id: TD2-B1
    resolution: "Resolved by runner-format-contract: _RuffFormatLintTool with check
      vs format modes, phase-1a mutates (fix-only), normal pass checks with
      shipped config, registry single-sourced."
  - category: blocking
    description: "Red baseline: 6 named tests assert 13 vs 14 tools; SIM102
      src/python_setup_lint/checkers/stub/coverage.py:196-198; R0914 cli.py:50
      (23/20); C0208 _factories_extras.py:383 set-iteration. Empty baseline
      masks real violations."
    id: TD2-B2
    resolution: Resolved by runner-format-contract (14-tool migration + docs
      enumeration with grep disposition) + baseline-violations-fix serialized
      after it (SIM102 + locals split + C0208 sequence fix). Baseline stays [].
  - category: blocking
    description: detect-secrets flags factory-journal files on clean checkout;
      environmental vs real unverified, so M1 lint-green is undefined for that
      tool.
    id: TD2-B3
    resolution: Owned by secrets-triage-spike (fact-finder, report with file hashes
      + verdict + exclusion mechanism). Environmental -> operator/engine
      exclusion as human-async (M1 dev acceptance does not wait); real ->
      redact/rotate follow-up. M1 dev acceptance is zero violations in src/**
      and tests/**.
  - category: impacting
    description: tests/integration.py 661 lines with too-many-lines (:12) + stale
      too-many-locals (:202, globally disabled in .pylintrc-tests:39)
      suppressions; helpers duplicated across
      integration/conftest/_autofix_helpers; nested tmp_path/golden copy needs
      mkdir-parents.
    id: TD2-I1
    resolution: Resolved by consolidate-integration-helpers retry (tests-only,
      11-helper matrix incl mkdir-parents copy, conftest def deleted with 2
      import rewrites + cycle guard, >=161 removed to <=500, :12 via extraction
      + :202 stale deleted directly, golden byte-identical).
  - category: impacting
    description: "Golden drift: tool-order vs sort placement, len!=0/crash asserts
      unplaced, unused slice_tool_section with unpinned markers, regen-twice
      would mutate committed files."
    id: TD2-I2
    resolution: "Resolved by golden-contract-hardening: tool-order collect,
      serialize/diff sorting, caller len/crash asserts, no sentinel,
      slicer('[pylint]','[pylint-pyi]') in overlay test, temp-copy
      double-collect determinism proof, UPDATE_GOLDEN never touches committed
      files except reviewed regen."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore, carry vacuous `is None or ...` asserts +
      ImportError-propagation test; heuristic tables duplicated across two
      modules.
    id: TD2-I3
    resolution: Resolved by semantic epic iteration-3 implementation (FakeBackend
      injection, deduped merged table, modules <=500, vacuous tests deleted).
  - category: impacting
    description: W9704/W9738 pass their own symbol as `rule`; rule-echo heuristic
      and future model never see actually-suppressed codes.
    id: TD2-I4
    resolution: Resolved by semantic epic req5 (joined suppressed codes, echo on any
      element, shift report + root regen).
  - category: adjacent
    description: "Over-limit/duplicated test infra: _factories.py 1393 lines,
      _factories_extras.py 502 lines with duplicate disables, 3 baseline-diff +
      3 runner files overlapping, test_golden.py 341 lines of helper-unit
      tests."
    id: TD2-A1
    resolution: Inventoried by test-debloat-audit; iteration-3 checkers/runner epics
      merge/split per CodingRules.
  - category: adjacent
    description: "Legacy/compat and docs drift:
      _FALLBACK_TOOLS/peek/_compare_sorted, astroid 3.x fallback, dispatch.py
      500+ char rationale with self-suppression, rumdl tests/data-exclude hack,
      ADR design/ vs docs/adr split."
    id: TD2-A2
    resolution: Inventoried by audits; iteration-3 epics remove/fix.
adrs:
  - consequences: "`uv run lint` without --fix is check-only (not hermetic:
      subprocesses/caches exist; --fix mutates by design in phase 1a/1b). Split
      format/lint gates reunify after merge. 14-tool docs/tests stabilize on one
      registry with historical CHANGELOG preserved."
    context: "`ruff format` ToolSpec runs plain `ruff format` without
      --check/--config (default 88 vs shipped 130), dirtying ~109 files;
      phase-1a (mutate) and normal pass (check) both call build_command with
      _fix=False; 6 tests + ~20 docs/test sites assert 13 vs 14-entry TOOLS;
      _compose_ruff_config may return a temp path so spies must not match
      literals."
    decision: "Retain 14. Add _RuffFormatLintTool(LintTool) per dispatch strategy
      pattern: build_command emits check mode (ruff format --check --config
      <resolved ruff.toml>) by default; build_format_command emits mutating
      mode. cli.py phase-1a calls build_format_command, normal pass calls
      build_command. Map 'ruff format'->ruff.toml in runner/_config.py +
      _config_flag_for. Registry invariants owned by runner/dispatch.py,
      re-exported via runner/__init__: EXPECTED_TOOL_NAMES (14),
      FORMATTER_ONLY={'ruff format'}, STATISTICS_PARSER_TOOLS (13),
      RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS={tach
      check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
      documented intentional. Tests import from python_setup_lint.runner.
      Tool-count migration verified by grep with per-hit disposition, CHANGELOG
      historical exclusion, and MD013/130 allowlist."
    id: ADR-005
    title: Ruff format strategy with explicit check vs format modes
  - consequences: Golden stays byte-identical; crash/empty sensitivity explicit in
      caller; overlay uses shared slicer; no invented sentinel; committed files
      never mutated by determinism proofs.
    context: Merged collect_findings runs a second pipeline on the private
      record-parser subset (avoids formatter pollution and baseline capture). It
      returns tool-order, sorts only in serialize, and no code emits __CRASH__
      (crashes surface as [CRASH] text; parsers return [] on garbage).
      UPDATE_GOLDEN=1 rewrites committed files, so regen-twice must not target
      them.
    decision: "Ratify private-subset second run as intentional. No Finding-level
      __CRASH__ sentinel: crash sensitivity stays in caller first-run asserts
      ([CRASH] absent, SKIPPED only package_name). Keep collect in tool order
      (synthetic-empty safe); sorting lives in serialize_write + _diff_keys.
      len(findings)!=0 asserted by the caller after collect.
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test.
      Determinism proven by temp-copy double-collect (two fresh temp copies,
      sha256 of serialized findings equal each other and equal committed golden
      hash); UPDATE_GOLDEN=1 never touches committed files except reviewed
      regen."
    id: ADR-006
    title: Golden hardening via caller asserts, no crash sentinel
  - consequences: "Lint deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit equals persisted model verdict;
      accepted+miss+absent equals heuristic True. Cache updates explicit,
      reviewable, CI-guarded. Iteration 3 implements against spike verdict."
    context: Current cache is per-machine, gitignored, unbounded, 64-bit truncated
      keys, no cleanup. A lint-written tracked cache would be non-hermetic;
      full-hex keys would trip detect-secrets.
    decision: "Tracked cache is source of truth; normal lint is read-only (cache-hit
      + heuristic), zero writes asserted by file hash/mtime. Writes only via
      explicit refresh command/flag (lockfile + merge + atomic temp+move,
      CI-guarded, DECISIONS_PATH isolation). Key encoding is spike-chosen
      subject to: no bare hex>=20, passes detect-secrets, collision-safe. Schema
      unified with epic (justification,rule,model,decision,files + spike-decided
      version/prompt-hash/last-seen). Prune drops empty-files + stale-model
      (+age policy if spike defines)."
    id: ADR-007
    title: Read-only lint with spike-chosen secrets-clean cache
  - consequences: One replan point (M4) consumes durable report tables + HEAD
      validation; subsystem epics spawn in iteration 3 with disjoint ownership;
      semantic implementation follows spike verdicts. No concurrent shared-infra
      edits. No committed map to maintain; audits stay zero-write.
    context: Remaining scope spans runner/checkers/setup plus semantic swap. Audits
      must read final post-M1+M2 HEAD; M3 spikes and M4 audits run in parallel
      with one replan gate. Review questioned whether item-report tables are
      durable enough to feed iteration-3 replan.
    decision: "Iteration 2: green baseline, infra completion, spikes, audits.
      Semantic epic record spawns now; its implementation is scheduled iteration
      3 after spikes. Runner/checkers/setup-testing epics spawn at the
      iteration-3 replan from the unified map. ARCHITECT DECISION on durability:
      item reports persist as engine-durable orchestration records
      (items/*/assignment + wave reports + decisions/), readable at replan per
      the task status contract; validation re-globs HEAD. No committed map;
      fact-finders stay zero-repo-write. Escape hatch (not default): if the
      engine ever drops reports, replan re-runs the audit queries or the kind
      changes to a committed artifact."
    id: ADR-008
    title: Single-replan progressive decomposition with report-fed replan


--- Prior Plan plan-2.yaml ---
iteration: 2
milestones:
  - directionalInterfaces:
      - "_RuffFormatLintTool(LintTool) in runner/dispatch.py:
        build_command(config,_path,_exclude)->check mode
        ['ruff','format','--check','--config',<resolved ruff.toml>,...paths]
        (default); build_format_command(...)->mutating mode without --check.
        cli.py phase-1a calls build_format_command (fix-only), normal pass calls
        build_command. runner/_config.py maps 'ruff format'->ruff.toml;
        _config_flag_for handles it. No if-spec.name in _build_command."
      - "Registry invariants owned by runner/dispatch.py, re-exported via
        runner/__init__.py: EXPECTED_TOOL_NAMES (14); FORMATTER_ONLY={'ruff
        format'} (statistics-exempt); STATISTICS_PARSER_TOOLS (13);
        RECORD_PARSER_TOOLS (9); RECORDLESS_TOOLS={tach
        check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
        intentional. Tests import from python_setup_lint.runner. Migration:
        test_lint_runner set+count 13->14; _factories_extras 13->14; stats + t3
        assert STATISTICS set; fakes invariants assert EXPECTED set."
      - "Docs contract: every in-scope tool-count site -> 14 by grep `13[
        -]?tools?|all_13|== 13` with per-hit disposition:
        AGENTS.md:9,43,63,92,93 + counts table :10-11; README.md:17,58;
        docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
        runner/__init__.py:3; cli.py:314; tests/runner/_factories.py:46;
        _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
        test_extra_tools.py:237; test_self_lint_clean.py:3;
        test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
        test_testing_fakes.py:137,165; plus any further tool-count grep hit.
        EXCLUDED (stays 13): CHANGELOG.md:104 historical. Allowlist:
        MD013/130/v0.13 and other non-tool-count 13s. tool_counts.json asserted
        14 keys incl 'ruff format':0 (verify, not rewrite)."
    id: M1
    scenarios:
      - >-
        Scenario: Gates green per-gate
          Given clean HEAD with empty lint.baseline
          When format gate exits 0 (all files formatted; set derived via git ls-files, count not pinned), lint gate reports zero violations in src/** and tests/**, `pytest -q` exits 0, integration exits 0, and secrets-triage-spike records its verdict
          Then all gates pass: the 6 named tool-count tests fixed (test_tool_spec_given_known_tools_then_present, test_tool_spec_given_tools_then_autofix_and_no_duplicates, test_statistics_parsers_given_all_tools_then_covered, test_parser_completeness_given_all_tools_then_have_parser, test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched], test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]), SIM102/R0914/C0208 fixed with no new violations, lint.baseline stays [], and factory-journal secrets are owned by the spike verdict (human-async), not dev acceptance
      - >-
        Scenario: Lint check-only without --fix
          Given a clean worktree
          When `uv run lint` runs without --fix
          Then `git status --porcelain` is empty; a command spy shows the normal-pass ruff-format cmd contains --check and --config with a resolved existing path (composed temp accepted, no literal match), and the mutating format cmd (phase-1a) runs only under --fix without --check
      - >-
        Scenario: Registry single-sourced
          Given the TOOLS table
          When tests and docs read the tool count
          Then every in-scope tool-count assertion reads 14 from EXPECTED_TOOL_NAMES with FORMATTER_ONLY/RECORDLESS exemptions explicit; verification is the tool-count grep with per-hit disposition and allowlist; no in-scope hit remains 13
    title: Green baseline and 14-tool runner contract
  - directionalInterfaces:
      - "tests/_project_helpers.py sole site, 11 helpers with pinned
        names/signatures: copy_sample_project(dest_parent: Path)->Path
        (dest_parent.mkdir(parents=True, exist_ok=True); copytree
        tests/data/minimal_sample_project -> dest_parent/'project'; returns
        project path); git_init_and_stage(project: Path)->None (test/test@test +
        add .); shipped_config_paths()->dict[str,Path];
        make_runner_config(project: Path)->RunnerConfig (minimal_sample + rumdl
        override idempotent, no-op if shipped rumdl missing); git_init_bare(cwd:
        Path)->None (Test/test@example.com, -q, no add);
        write_project_file(cwd,rel,content)->Path; stage_file(cwd,rel)->None;
        commit_all(cwd,msg='init')->None; build_pylint_overlay_config(project:
        Path, disable_rule: str)->Path; ensure_precommit_or_skip()->None;
        install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
        _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
        _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
        shipped_config_paths def entirely (no re-export); rewrite
        test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
        tests._project_helpers import ...`; integration.py consumes
        make_runner_config + mapped subset. Cycle guard: _project_helpers
        imports stdlib + python_setup_lint.runner/setup/testing only, never
        tests.conftest/tests.integration. Test class/function names unchanged;
        helper renames per matrix only."
      - "tests/_golden.py: collect_findings(project,*,config)->list[Finding]
        keeps tool order (no sort, synthetic-empty safe); sorting in
        serialize_write + _diff_keys; caller test_setup_new_and_lint asserts
        len(findings)!=0 post-collect and retains first-run [CRASH]-absent +
        SKIPPED-only-package_name asserts; no Finding __CRASH__ sentinel;
        assert_matches_golden Counter-multiset + UPDATE guard (fail under
        CI/GITHUB_ACTIONS); slice_tool_section(output,'[pylint]','[pylint-pyi]')
        used by overlay test; read_oracle_rules, assert_oracle_coverage,
        assert_tool_coverage retained. Determinism proven by temp-copy
        double-collect (two fresh temp copies, sha256 of serialized findings
        equal each other and equal committed golden hash); UPDATE_GOLDEN=1 never
        touches committed files except reviewed regen."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once per matrix
          Given tests/_project_helpers.py
          When tests/ is searched
          Then each of the 11 helpers is defined exactly once there (copy with mkdir-parents), duplicates in conftest.py and _autofix_helpers.py are deleted, the 2 conftest importers are rewritten to _project_helpers, each consumer imports only its mapped subset, _project_helpers imports nothing from tests.conftest/tests.integration, and stay-symbols are untouched
      - >-
        Scenario: Integration gate within single limit
          Given >=161 lines removed (661-><=500: helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with :12 too-many-lines removed via extraction and :202 stale too-many-locals disable deleted directly (globally disabled in config/.pylintrc-tests:39; verify pylint tests + W9704 clean), test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Golden hardening via caller asserts
          Given the committed golden
          When integration runs plus synthetic drift injection plus temp-copy double-collect
          Then findings serialize sorted with caller len!=0, zero [CRASH], SKIPPED only package_name, drift names exact added/removed keys, oracle + per-tool coverage hold, both temp-copy hashes equal the committed hash without mutating committed files, and the overlay test uses the shared slicer
    title: Test infra consolidation and golden hardening
  - directionalInterfaces:
      - "Eval contract: decide(justification,rule,context)->float P(meaningful)
        in [0,1]; mapping: justification=primary=(comment or text).strip(),
        rule=joined suppressed codes (spike uses current rule symbol where codes
        unavailable, recorded), context=code_context (None allowed);
        decision=prob>=threshold. Modes: veto: final=heuristic(text) AND
        (prob>=threshold) (model only flips True->False; heuristic-False never
        reaches model); replace: final=(prob>=threshold), heuristic deleted.
        Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency).
        Corpus: threshold 30+50 + brush-off/meaningful tables + N real repo
        suppressions, DEDUPED by normalized justification (target >=100
        post-dedup), stratified heuristic-rejected (easy) vs heuristic-accepted
        (model-decides); rubric (specific technical justification vs
        placeholder/deferral/brush-off); per-source + per-stratum breakdown.
        Bars >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall
        apply to the heuristic-accepted stratum (overall also reported). Report
        per-candidate at 0.5/0.6/0.7 in both modes; all matrix candidates scored
        or explicitly excluded."
      - "Cache contract (spike-chosen): tracked JSON array sorted by
        (rule,justification,model), indent=2 sort_keys=True; unified entry
        {justification, rule, model '<id> rev <short12> prompt-vN', decision,
        files sorted POSIX} + spike-decided {version, prompt hash, last-seen?};
        key (justification,rule,model) with secrets-clean encoding (no bare
        hex>=20, detect-secrets clean); normal lint zero writes (hash/mtime
        assert); refresh command/flag only (lockfile + merge + atomic,
        CI-guarded, DECISIONS_PATH isolation); prune empty-files + stale-model."
      - "Pylint/concurrency contract (writer-first): identify writer (checker
        open/close vs runner post-process) + write timing (per-visit vs
        end-of-run) + --path scoping across 3 sequential pylint invocations (no
        -j, no contention); verdict derives crash-safe lock/merge/atomic vs
        no-lock runner merge vs jobs=1/sidecars-if--j."
    id: M3
    scenarios:
      - >-
        Scenario: Model choice is evidence-based over all candidates
          Given the deduped labelled corpus (>=100 post-dedup, rubric + per-source + per-stratum split)
          When the poc scores GLiDE, decider-nano, bekko-17m, ettin-150m, MiniLM at 0.5/0.6/0.7 in veto and replace modes (or records explicit exclusion)
          Then the report cites the 90/95/85 bars per threshold per stratum (compliance on heuristic-accepted stratum) and recommends the smallest compliant model+prompt+threshold+mode or a no-go with evidence
      - >-
        Scenario: Cache deterministic-given-cache+model
          Given the proposed schema on a temp copy
          When W9704 runs with model absent, present-miss, and cache-hit
          Then heuristic-rejected verdicts are identically False without model contact, accepted+hit equals the persisted model verdict, accepted+miss+absent equals heuristic True, prune drops stale/deleted entries, and normal lint shows zero writes by hash
      - >-
        Scenario: Writer and timing pinned before lock design
          Given pylint 4.x invocation tests
          When writer + timing + --path scoping are pinned
          Then the cache lock/merge/sweep design is derived (crash-safe atomic vs runner merge vs jobs=1/sidecars-if--j) with --path-scoped sweep
    title: Decision-model and git-cache design spikes
  - directionalInterfaces:
      - "Replan input contract: audits emit structured tables in item reports
        (engine-durable orchestration records: items/*/assignment + wave reports
        + decisions/, readable at replan per the task status contract);
        iteration-3 replan consumes reports + re-globs HEAD for validation only
        (no committed map; fact-finders write nothing; escape hatch = kind
        change to committed artifact if the engine ever drops reports). Owner
        enum {runner,checkers,setup-testing,semantic,root}. Ownership universe =
        src/** + scripts/** + tests/** EXCLUDING tests/data/**
        (stubs/conftest/__init__/_factories included; stub follows .py).
        Root-owned group (epics read-only): tests/data/** (golden,
        minimal_sample, oracles; golden regen only by root item), config/**,
        docs/**, repo-root files. Every universe file appears exactly once with
        exactly one owner; root-owned listed as a group."
      - "File ownership separate from symbol exclusions: ownership is
        whole-file; skips live in an exclusion column (src: _semantic.py+.pyi,
        _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS; tests:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline). Planned-path reservations (new
        backend/cache modules, epic conftest/runtime modules) listed separately,
        not globbed."
    id: M4
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried with disjoint ownership
          Given CodingRules.md and AGENTS.md
          When the audit completes on final HEAD (M1+M2 merged)
          Then every ownership-universe file is listed with violations plus exactly-once owner, the root-owned group (tests/data, config, docs) is listed once, semantic symbols are marked skipped in the exclusion column, and planned paths are reserved
      - >-
        Scenario: Test redundancy inventoried with pinning limbs
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, repo-self-lint tests are listed for removal, each material limb names pinning tests or blocking debt, and owners align to the unified map
      - >-
        Scenario: Replan input is complete and validatable
          Given both audit reports plus HEAD
          When the iteration-3 replan re-globs HEAD
          Then every universe file validates against exactly one owner, the root-owned group matches, exclusions reference existing symbols, and reservations name only planned paths
    title: Debloat inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model (if any) meets license + CPU + py3.14 +
      90/95/85 bars on the heuristic-accepted stratum is unknown. GLiDE-0.4B:
      Fastino license, 0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17.
      Apache alternatives vary in accuracy/license/CPU proof. No CPU benchmark
      exists here; mapping/modes/metric now pinned, corpus deduped + stratified
      by the spike."
    id: U1
    spikeOutlines:
      - "model-candidate-matrix (fact-finder): license, params/size, runtime,
        py3.14 wheels, custom-code, pinnable revision; excludes CC-BY-NC, flags
        Fastino/unclear"
      - "model-eval-poc (poc, CPU-only): ALL candidates at 0.5/0.6/0.7 in veto +
        replace modes on >=100 deduped corpus with rubric; compliance on
        heuristic-accepted stratum; smallest compliant
        model/prompt/threshold+mode or no-go"
      - "decision-runtime-pinning (test-assumptions, conditional on eval):
        py3.14 CPU wheels + import/device/offline + custom-code pinning for the
        chosen runtime (skip on no-go)"
  - description: "Cache key encoding, schema extras, prune/update semantics, writer
      identity/timing, and --path scoping are unknown. Open: secrets-clean
      encoding (not full hex), version/prompt-hash/last-seen fields, refresh
      command, CI guard, checker- vs runner-side writer, write timing, sweep
      scope."
    id: U2
    spikeOutlines:
      - "pylint-cache-assumptions (test-assumptions, writer-first): pin writer +
        timing + --path scoping across sequential invocations; verdict derives
        lock/merge/atomic vs runner merge vs jobs=1/sidecars-if--j"
      - "cache-design-spike (poc on temp copies, consumes writer verdict):
        unified schema + spike-chosen encoding + prune + refresh/CI/isolation +
        deterministic-given-cache+model proof with hash-asserted zero
        normal-lint writes"
  - description: Size/shape of coding-rules debt (~8.9k src LOC) and
      redundant/lint-testing tests (~18.4k test LOC, 772 tests) unmeasured;
      subsystem epics need the unified map with file-vs-symbol separation,
      root-owned groups, and planned-path reservations.
    id: U3
    spikeOutlines:
      - coding-rules-audit (fact-finder on final M1+M2 HEAD, single owner of
        unified map + exclusion column + reservations)
      - test-debloat-audit (fact-finder, aligned via inter-dep; per-limb pinning
        inventory)
  - description: "detect-secrets flags on clean checkout are of unknown source:
      tracked factory runtime journals (environmental) vs a real secret. The
      exclusion mechanism (engine config vs gate flag) is also unknown, so M1
      lint-green cannot be defined for that tool until triaged."
    id: U4
    spikeOutlines:
      - "secrets-triage-spike (fact-finder, no repo writes): clean-checkout
        scan, flagged files + sha256 + verdict environmental-vs-real + exact
        exclusion mechanism; human-async operator request if environmental"
itemOutlines:
  - deps: []
    description: "Retain 14. (1) Add _RuffFormatLintTool(LintTool) in dispatch.py:
      build_command -> check mode (--check + --config resolved ruff.toml);
      build_format_command -> mutating mode; register in _strategy_for; map
      'ruff format'->ruff.toml in _config.py + _config_flag_for. cli.py phase-1a
      calls build_format_command, normal pass calls build_command. No
      if-spec.name in _build_command. (2) Registry: EXPECTED_TOOL_NAMES +
      FORMATTER_ONLY + STATISTICS/RECORD/RECORDLESS sets owned by dispatch.py,
      re-exported via runner/__init__; migrate the 6 named tests
      (test_lint_runner set+count; _factories_extras len+id; stats + t3 to
      STATISTICS set with FORMATTER_ONLY exemption; fakes invariants to EXPECTED
      set). (3) Docs: migrate every in-scope tool-count site to 14 with per-hit
      report (AGENTS.md:9,43,63,92,93 + counts :10-11; README.md:17,58;
      docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
      runner/__init__.py:3; cli.py:314; _factories.py:46;
      _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
      test_extra_tools.py:237; test_self_lint_clean.py:3;
      test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
      test_testing_fakes.py:137,165; plus any further tool-count grep hit).
      CHANGELOG.md:104 stays 13 (historical); MD013/130/v0.13 allowlisted.
      Assert tool_counts.json already 14 keys (not rewrite). Verify:
      format/lint/pytest/integration exit 0; git status --porcelain empty after
      `uv run lint` (no --fix); spy asserts normal-pass cmd has --check +
      --config with resolved existing path (composed temp accepted) and phase-1a
      omits --check (fix-only); golden byte-identical; baseline []."
    kind: story
    milestoneId: M1
    prodBudgetHint: 60
    slug: runner-format-contract
    title: Ruff format strategy and 14-tool registry fix
  - deps:
      - runner-format-contract
    description: "Serialized after runner-format-contract (shared cli.py ownership;
      applies onto the phase-1a call-site shape). Behavior-preserving refactors,
      baseline stays []: (1)
      src/python_setup_lint/checkers/stub/coverage.py:196-198 SIM102 (elif
      TypeAlias + nested if AssignName) -> single combined condition. (2)
      cli.py:50 _run_tool_pipeline 23-><=20 locals by extracting phase/select
      helpers (no pipeline semantics change). (3)
      tests/runner/_factories_extras.py:383 C0208 set-iteration -> sequence
      type. Secrets explicitly OUT of scope (owned by secrets-triage-spike).
      Verify: lint gate reports zero violations in src/** and tests/**; pytest +
      integration show no new failures; golden byte-identical."
    kind: story
    milestoneId: M1
    prodBudgetHint: 35
    slug: baseline-violations-fix
    title: Fix SIM102, too-many-locals, C0208
  - deps: []
    description: "No repo edits; report only. On clean checkout run the declared
      lint gate / detect-secrets scan; capture every flagged file + sha256 +
      baseline entry. Verdict: environmental (only tracked factory runtime
      journals) vs real secret. If environmental: specify the exact exclusion
      mechanism (engine config vs gate command flag) + evidence hashes, and
      record the operator/engine exclusion request as human-async (M1 dev
      acceptance does not wait on it). If real: specify redact/rotate follow-up.
      Output feeds M1 acceptance + U4."
    kind: fact-finder
    milestoneId: M1
    prodBudgetHint: 0
    slug: secrets-triage-spike
    title: Triage detect-secrets factory-journal flags
  - deps: []
    description: "Tests-only (tests/** ONLY; FORBIDDEN lint.baseline, AGENTS.md,
      docs/**, src/**). Red-test-exempt. Create tests/_project_helpers.py per
      matrix (11 helpers): copy_sample_project(dest_parent)->Path [mkdir
      parents, copytree tests/data/minimal_sample_project ->
      dest_parent/'project', ex _copy_sample]; git_init_and_stage(project)->None
      [test/test@test + add ., ex _init_git]; shipped_config_paths()->dict [ex
      _shipped_config_paths]; make_runner_config(project)->RunnerConfig
      [minimal_sample + rumdl override idempotent, no-op if shipped rumdl
      missing, ex _make_config]; git_init_bare(cwd)->None [Test/test@example.com
      -q no add, ex _git_init]; write_project_file(cwd,rel,content)->Path [ex
      _write_file]; stage_file(cwd,rel)->None [ex _stage];
      commit_all(cwd,msg)->None [ex _commit_all];
      build_pylint_overlay_config(project,disable_rule)->Path [extract overlay
      217-240]; ensure_precommit_or_skip()->None;
      install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
      _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
      _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
      shipped_config_paths def entirely (no re-export); rewrite
      test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
      tests._project_helpers import ...`; integration.py uses make_runner_config
      + mapped subset. Cycle guard: _project_helpers imports stdlib +
      python_setup_lint.runner/setup/testing only, never
      tests.conftest/tests.integration. Test class/function names unchanged.
      Budget: >=161 removed (661-><=500): helpers 57 + overlay 28 +
      setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 +
      import/trim 8 = 163. Remove :12 too-many-lines via extraction; delete :202
      stale too-many-locals disable directly (globally disabled in
      config/.pylintrc-tests:39; verify pylint tests + W9704 clean). Verify:
      diff stat tests/** only; golden diff empty; integration + test_golden
      pass; touched files format-clean."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
  - deps:
      - consolidate-integration-helpers
    description: "Tests-only hardening, committed files never mutated by proofs. No
      __CRASH__ sentinel and no sort-in-collect: keep collect tool-order;
      sorting stays in serialize_write + _diff_keys; add caller asserts in
      test_setup_new_and_lint (len(findings)!=0 post-collect; first-run [CRASH]
      absent + SKIPPED only package_name retained); keep Counter-multiset diff +
      UPDATE guard + oracle/tool coverage; use
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test;
      extend tests/test_golden.py synthetic coverage (ordering, POSIX, diff
      keys, CI-guard, coverage, byte-format, empty-list safe). Determinism via
      temp-copy double-collect: collect+serialize on two fresh temp copies,
      sha256 hashes equal each other and equal committed golden hash.
      UPDATE_GOLDEN=1 never touches committed files except reviewed regen.
      Verify: integration + test_golden pass; golden+counts byte-identical."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: golden-contract-hardening
    title: Harden golden via caller asserts and shared slicer
  - deps: []
    description: "No repo edits; report only. Matrix for GLiDE-0.4B,
      tasksource-decider-nano, bekko-17m, ettin-150m + MiniLM baseline: license,
      params/weights, runtime stack, py3.14 CPU wheels (linux/mac/win),
      custom-code/vendoring burden, pinnable revision, offline behavior. Exclude
      CC-BY-NC; flag Fastino + bekko-unclear-license for human review. Output
      feeds eval-poc (all candidates) + cache spike (model-id/rev format) +
      runtime pinning."
    kind: fact-finder
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-candidate-matrix
    title: Decision-model candidate matrix
  - deps:
      - model-candidate-matrix
    description: "No committed code; report only (temp venv/copy permitted, network
      inside spike only). Mapping: justification=primary=(comment or
      text).strip(), rule=joined suppressed codes (current rule symbol where
      codes unavailable, recorded), context=code_context (None allowed);
      decision=prob>=threshold. Modes: veto final=heuristic AND
      (prob>=threshold); replace final=(prob>=threshold). Smallest=lexicographic
      (params, weights bytes, CPU RSS, p50 latency). Corpus: threshold 30+50 +
      brush-off/meaningful tables + N real repo suppressions, DEDUPED by
      normalized justification (target >=100 post-dedup), stratified
      heuristic-rejected (easy) vs heuristic-accepted (model-decides); rubric:
      specific technical justification vs placeholder/deferral/brush-off;
      per-source + per-stratum breakdown. Score ALL matrix candidates at
      0.5/0.6/0.7 in BOTH modes (or record explicit exclusion): accuracy,
      meaningless-precision, meaningful-recall, CPU p50/p95 + RSS. Compliance
      bars (>=90% acc / >=95% meaningless-precision / >=85% meaningful-recall)
      apply to the heuristic-accepted stratum (overall also reported). Recommend
      smallest compliant model+prompt+threshold+mode, or no-go with evidence."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-eval-poc
    title: CPU accuracy/latency evaluation over all candidates
  - deps:
      - model-candidate-matrix
      - pylint-cache-assumptions
    description: "Prototype on temp copies only; no committed files. Consumes
      writer-first verdict. Design unified tracked schema: JSON array sorted by
      (rule,justification,model), indent=2 sort_keys; entry {justification,
      rule, model '<id> rev <short12> prompt-vN', decision, files sorted POSIX}
      + spike-decided {version, prompt hash, last-seen?}; key
      (justification,rule,model) with spike-chosen secrets-clean encoding (no
      bare hex>=20, detect-secrets clean, collision-safe). Refresh via explicit
      command/flag only (lockfile + merge + atomic, CI-guarded, DECISIONS_PATH
      isolation). Prune: drop empty-files + stale-model (+age policy if
      defined). Prove deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit == persisted verdict; accepted+miss+absent
      == heuristic True; normal lint zero writes (hash/mtime assert)."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: cache-design-spike
    title: Tracked cache schema and determinism prototype
  - deps: []
    description: "Writer-first reframing (runner is sequential, pylint specs pass no
      -j: no contention today). Identify FIRST: writer (checker open()/close()
      during pylint subprocess vs runner post-process merge) + write timing
      (per-visit vs end-of-run) + --path scoping across
      pylint/pylint-pyi/pylint-tests sequential invocations. Then derive:
      lockfile+merge+atomic needed for crash-safety vs unnecessary (runner-side
      post-merge) vs jobs=1/sidecars only if -j introduced. Add
      tests/assumptions/test_pylint_cache_semantics.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Verdict
      feeds cache-design-spike."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: pylint-cache-assumptions
    title: Pin pylint writer, timing, and path scoping
  - deps:
      - model-eval-poc
    description: "Conditional on eval recommendation (no-go -> report-only skip, no
      file). For the chosen runtime only: verify py3.14 CPU wheels
      (linux/mac/win), import/device/offline contract (CPU fallback, no network
      on hit), and custom-code pinning (vendored revision, never unpinned
      trust_remote_code). Add
      tests/assumptions/test_decision_runtime_contracts.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Acceptance:
      wheels/APIs pinned or explicit blocker recorded for iteration-3 epic."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: decision-runtime-pinning
    title: Pin chosen runtime wheels and API contracts
  - deps:
      - baseline-violations-fix
      - consolidate-integration-helpers
      - golden-contract-hardening
      - runner-format-contract
    description: "Read-only; zero repo writes. Audit src/** + scripts/** vs
      CodingRules/AGENTS on final HEAD (contains M1 + M2 merges). Output in item
      report (engine-durable replan input): rows {module, section, evidence
      file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint
      file-ownership map over the ownership universe (src+scripts+tests minus
      tests/data; owner enum {runner,checkers,setup-testing,semantic,root}; stub
      follows .py; tests/data + config + docs as root-owned group) +
      symbol-exclusion column (_base.py::check_if_meaningful,
      _OPTIONAL_IMPORT_PATTERNS, _semantic.py+.pyi) + planned-path reservations
      (new backend/cache modules). Single owner of the map; test audit aligns
      via inter-dep. Reads final HEAD + beartype report + secrets-spike
      verdict."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: coding-rules-audit
    title: Inventory CodingRules violations and ownership
  - deps:
      - coding-rules-audit
      - consolidate-integration-helpers
      - golden-contract-hardening
    description: "Read-only; zero repo writes. Audit tests/** (minus tests/data,
      root-owned). Output in item report: rows {module, behaviors, duplicate-of,
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      LoC/runtime estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag) +
      symbol exclusions (test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline) + planned-path reservations (epic
      conftest/runtime modules). Owner column aligned to coding audit's unified
      map via inter-dep (file ownership separate from symbol skips). Iteration-3
      replan consumes both reports + HEAD re-glob validation."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: test-debloat-audit
    title: Inventory redundant tests and pinning limbs
assumptions:
  - assumption: Material behavior = golden findings (SEMANTIC=0) + checker unit
      tests + CLI flags/exit codes + baseline/autofix semantics + shipped
      configs/scopes. Reranker accept/reject is not material; heuristic
      rejections (empty, boilerplate, brush-off, rule-echo) are material. Model
      may tighten acceptance (new W9704 under SEMANTIC=1 vs heuristic-only
      today) by design; SEMANTIC=1 golden will shift with shift report +
      CHANGELOG + root regen.
    disposition: confirm with human
    why: Makes preservation mechanically testable while allowing the swap;
      tightening must be operator-visible, not mistaken for regression.
  - assumption: Git-stored decision cache lives in the linted repo (proposed
      .python-setup-decisions.json next to lint.baseline); weights stay in user
      model cache, never git. Spikes assume this path with DECISIONS_PATH
      isolation; operator confirms filename/location before iteration-3
      implementation.
    disposition: confirm with human
    why: Decisions must reproduce in CI without the model; weights are 0.03-0.8GB
      with own licenses; committed file affects
      gitignore/hatch/consumers/secrets.
  - assumption: Dev/CI do not install the `semantic` extra; gates run heuristic +
      cache hits. Real-model tests are slow + with_real_api, never in the
      default suite.
    why: Matches current venv (no torch/transformers); keeps gates offline, fast,
      deterministic.
  - assumption: "'Never test linting' bans pytest asserting this repo passes its own
      gates (subprocess re-lint, AST re-implementation, config re-checks).
      Golden/integration behavior contracts are retained, not removed."
    disposition: confirm with human
    why: Removes gate-duplicating tests without deleting the fit-for-purpose
      contract.
  - assumption: GLiDE-0.4B Fastino Community License is not accepted until human
      review; spikes proceed Apache-first (flag Fastino + bekko-unclear) and
      exclude CC-BY-NC. If eval recommends GLiDE, implementation pauses for
      approval; if no candidate meets license + CPU + py3.14 + bars, the epic
      escalates.
    disposition: confirm with human
    why: MIT package cannot absorb unclear/non-commercial licensing by default;
      operator must see the gating criterion before the eval verdict.
  - assumption: "Gate contracts (paths/commands) do not change:
      tests/integration.py, `pytest -q`, integration, split format/lint gates
      until M1 merges, then reunify. Never run bare `uv run lint` (pre-M1
      mutation hazard) or --overwrite-baseline; captures run on temp copies
      only."
    why: Bare lint mutates pre-M1; split gates are the check-only workaround.
  - assumption: Semantic epic record spawns in iteration 2; its implementation runs
      in iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at
      the iteration-3 replan from M4 audits. Single replanAfter on M4; M3 spikes
      report without replanning.
    why: Parallel M3/M4 with one replan gate avoids premature/deadlocked replans and
      pins the spawn wave.
  - assumption: Factory-journal detect-secrets hits are triaged by
      secrets-triage-spike (environmental vs real with hash evidence). M1 dev
      acceptance is zero violations in src/** and tests/**; any factory-journal
      exclusion is operator/engine action tracked as human-async and never
      blocks dev items.
    disposition: verify via secrets-triage-spike
    why: Isolates the environmental unknown from dev stories per uncertainty
      containment; M1 green must not depend on out-of-band operator action.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker with a CPU-friendly small decision
      model + git-stored self-cleaning cache. Child epic of `modernize`. Record
      spawns iteration 2; implementation runs iteration 3 consuming spikes
      (candidate matrix, CPU eval, cache design, pylint semantics, runtime
      pinning).


      ## Scope (symbol-level)

      Owned: checkers/_semantic.py+.pyi + new private backend/cache modules
      (+.pyi, @beartype, structlog kwargs, tach-clean); check_if_meaningful in
      _base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py;
      pyproject [semantic] extra + uv.lock + .gitignore + hatch inclusion; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section only, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache tests,
      tests/checkers/conftest.py, runtime modules under tests/assumptions/.
      Protocol: NEVER write tests/data/** (read golden for verification; on
      heuristic shift emit shift report + CHANGELOG description, root
      regenerates). AGENTS.md pipeline section ONLY (Semantic justification
      pipeline, ~AGENTS.md:79-85), applied onto HEAD containing M1's merge (M1
      owns all count lines); never touch count lines (:9,43,63,92,93) or counts
      table (:10-11). tests/assumptions append-only. No edits to
      tests/integration.py, tests/conftest.py. Runner touch minimal + ADR.


      ## Requirements

      1. Implement spike verdict: chosen model id/revision, noul prompt +
      criteria, threshold meeting >=90% acc / >=95% meaningless-precision /
      >=85% meaningful-recall on the heuristic-accepted stratum, in the
      recommended mode (veto vs replace), or escalate on no-go. No unpinned
      trust_remote_code; exclude non-commercial; Fastino needs human approval.

      2. Contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool +
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None.
      Public DecisionBackend Protocol decide(justification,rule,context)->float
      with spike-pinned mapping (justification=primary, rule=joined codes,
      context=code_context); DECISION_THRESHOLD + PROMPT_VERSION. Injection:
      optional backend kwarg (public in .pyi) + test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND dotted path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra/failure: heuristic + cache hits, one
      warning, sentinel. Weights in user cache. PYTHON_SETUP_LINT_DECISION_MODEL
      selects model@revision; RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root): JSON array sorted
      by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized, rule joined codes, model '<id> rev <short12>
      prompt-vN' (no bare hex>=20), decision, files sorted POSIX} +
      spike-decided {version, prompt hash, last-seen}. Key
      (justification,rule,model) with spike-chosen secrets-clean encoding.
      Normal lint read-only (hash-asserted zero writes); explicit refresh writes
      via lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH
      isolation. Sweep scoped to linted files; drop empty-files + stale-model.
      Must pass all tools incl. detect-secrets. Concurrency per writer-first
      verdict.

      5. Real suppressed codes: extract all codes, normalize/sort/join ',' as
      rule (bare-except keeps single symbol). Rule-echo rejects on any element.
      On shift: shift report + CHANGELOG, root regenerates golden.

      6. Tests: merge brush-off/meaningful/threshold tables into one deduped
      parametrized table; FakeBackend via kwarg + env; cache
      round-trip/cleanup/concurrency on tmp + hypothesis format round-trip;
      exactly one slow+with_real_api e2e; delete vacuous `is None or ...` +
      ImportError-propagation test; modules <=500, no suppressions; never test
      linting.

      7. Docs: Scope list + CHANGELOG (user-visible only).


      ## Acceptance

      - SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit
      without model emits persisted verdict with no load. Brush-off never
      reaches model; one call per unique pair; scoped cleanup; no retry storm.
      Format/lint/pytest/integration green with empty baseline.
    slug: semantic-decision-model
techDebt:
  - category: blocking
    description: "`ruff format` ToolSpec mutates the worktree (plain `ruff format`,
      no --check/--config, default 88 vs shipped 130); phase-1a vs normal pass
      indistinguishable at _fix=False."
    id: TD2-B1
    resolution: "Resolved by runner-format-contract: _RuffFormatLintTool with check
      vs format modes, phase-1a mutates (fix-only), normal pass checks with
      shipped config, registry single-sourced."
  - category: blocking
    description: "Red baseline: 6 named tests assert 13 vs 14 tools; SIM102
      src/python_setup_lint/checkers/stub/coverage.py:196-198; R0914 cli.py:50
      (23/20); C0208 _factories_extras.py:383 set-iteration. Empty baseline
      masks real violations."
    id: TD2-B2
    resolution: Resolved by runner-format-contract (14-tool migration + docs
      enumeration with grep disposition) + baseline-violations-fix serialized
      after it (SIM102 + locals split + C0208 sequence fix). Baseline stays [].
  - category: blocking
    description: detect-secrets flags factory-journal files on clean checkout;
      environmental vs real unverified, so M1 lint-green is undefined for that
      tool.
    id: TD2-B3
    resolution: Owned by secrets-triage-spike (fact-finder, report with file hashes
      + verdict + exclusion mechanism). Environmental -> operator/engine
      exclusion as human-async (M1 dev acceptance does not wait); real ->
      redact/rotate follow-up. M1 dev acceptance is zero violations in src/**
      and tests/**.
  - category: impacting
    description: tests/integration.py 661 lines with too-many-lines (:12) + stale
      too-many-locals (:202, globally disabled in .pylintrc-tests:39)
      suppressions; helpers duplicated across
      integration/conftest/_autofix_helpers; nested tmp_path/golden copy needs
      mkdir-parents.
    id: TD2-I1
    resolution: Resolved by consolidate-integration-helpers retry (tests-only,
      11-helper matrix incl mkdir-parents copy, conftest def deleted with 2
      import rewrites + cycle guard, >=161 removed to <=500, :12 via extraction
      + :202 stale deleted directly, golden byte-identical).
  - category: impacting
    description: "Golden drift: tool-order vs sort placement, len!=0/crash asserts
      unplaced, unused slice_tool_section with unpinned markers, regen-twice
      would mutate committed files."
    id: TD2-I2
    resolution: "Resolved by golden-contract-hardening: tool-order collect,
      serialize/diff sorting, caller len/crash asserts, no sentinel,
      slicer('[pylint]','[pylint-pyi]') in overlay test, temp-copy
      double-collect determinism proof, UPDATE_GOLDEN never touches committed
      files except reviewed regen."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore, carry vacuous `is None or ...` asserts +
      ImportError-propagation test; heuristic tables duplicated across two
      modules.
    id: TD2-I3
    resolution: Resolved by semantic epic iteration-3 implementation (FakeBackend
      injection, deduped merged table, modules <=500, vacuous tests deleted).
  - category: impacting
    description: W9704/W9738 pass their own symbol as `rule`; rule-echo heuristic
      and future model never see actually-suppressed codes.
    id: TD2-I4
    resolution: Resolved by semantic epic req5 (joined suppressed codes, echo on any
      element, shift report + root regen).
  - category: adjacent
    description: "Over-limit/duplicated test infra: _factories.py 1393 lines,
      _factories_extras.py 502 lines with duplicate disables, 3 baseline-diff +
      3 runner files overlapping, test_golden.py 341 lines of helper-unit
      tests."
    id: TD2-A1
    resolution: Inventoried by test-debloat-audit; iteration-3 checkers/runner epics
      merge/split per CodingRules.
  - category: adjacent
    description: "Legacy/compat and docs drift:
      _FALLBACK_TOOLS/peek/_compare_sorted, astroid 3.x fallback, dispatch.py
      500+ char rationale with self-suppression, rumdl tests/data-exclude hack,
      ADR design/ vs docs/adr split."
    id: TD2-A2
    resolution: Inventoried by audits; iteration-3 epics remove/fix.
adrs:
  - consequences: "`uv run lint` without --fix is check-only (not hermetic:
      subprocesses/caches exist; --fix mutates by design in phase 1a/1b). Split
      format/lint gates reunify after merge. 14-tool docs/tests stabilize on one
      registry with historical CHANGELOG preserved."
    context: "`ruff format` ToolSpec runs plain `ruff format` without
      --check/--config (default 88 vs shipped 130), dirtying ~109 files;
      phase-1a (mutate) and normal pass (check) both call build_command with
      _fix=False; 6 tests + ~20 docs/test sites assert 13 vs 14-entry TOOLS;
      _compose_ruff_config may return a temp path so spies must not match
      literals."
    decision: "Retain 14. Add _RuffFormatLintTool(LintTool) per dispatch strategy
      pattern: build_command emits check mode (ruff format --check --config
      <resolved ruff.toml>) by default; build_format_command emits mutating
      mode. cli.py phase-1a calls build_format_command, normal pass calls
      build_command. Map 'ruff format'->ruff.toml in runner/_config.py +
      _config_flag_for. Registry invariants owned by runner/dispatch.py,
      re-exported via runner/__init__: EXPECTED_TOOL_NAMES (14),
      FORMATTER_ONLY={'ruff format'}, STATISTICS_PARSER_TOOLS (13),
      RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS={tach
      check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
      documented intentional. Tests import from python_setup_lint.runner.
      Tool-count migration verified by grep with per-hit disposition, CHANGELOG
      historical exclusion, and MD013/130 allowlist."
    id: ADR-005
    title: Ruff format strategy with explicit check vs format modes
  - consequences: Golden stays byte-identical; crash/empty sensitivity explicit in
      caller; overlay uses shared slicer; no invented sentinel; committed files
      never mutated by determinism proofs.
    context: Merged collect_findings runs a second pipeline on the private
      record-parser subset (avoids formatter pollution and baseline capture). It
      returns tool-order, sorts only in serialize, and no code emits __CRASH__
      (crashes surface as [CRASH] text; parsers return [] on garbage).
      UPDATE_GOLDEN=1 rewrites committed files, so regen-twice must not target
      them.
    decision: "Ratify private-subset second run as intentional. No Finding-level
      __CRASH__ sentinel: crash sensitivity stays in caller first-run asserts
      ([CRASH] absent, SKIPPED only package_name). Keep collect in tool order
      (synthetic-empty safe); sorting lives in serialize_write + _diff_keys.
      len(findings)!=0 asserted by the caller after collect.
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test.
      Determinism proven by temp-copy double-collect (two fresh temp copies,
      sha256 of serialized findings equal each other and equal committed golden
      hash); UPDATE_GOLDEN=1 never touches committed files except reviewed
      regen."
    id: ADR-006
    title: Golden hardening via caller asserts, no crash sentinel
  - consequences: "Lint deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit equals persisted model verdict;
      accepted+miss+absent equals heuristic True. Cache updates explicit,
      reviewable, CI-guarded. Iteration 3 implements against spike verdict."
    context: Current cache is per-machine, gitignored, unbounded, 64-bit truncated
      keys, no cleanup. A lint-written tracked cache would be non-hermetic;
      full-hex keys would trip detect-secrets.
    decision: "Tracked cache is source of truth; normal lint is read-only (cache-hit
      + heuristic), zero writes asserted by file hash/mtime. Writes only via
      explicit refresh command/flag (lockfile + merge + atomic temp+move,
      CI-guarded, DECISIONS_PATH isolation). Key encoding is spike-chosen
      subject to: no bare hex>=20, passes detect-secrets, collision-safe. Schema
      unified with epic (justification,rule,model,decision,files + spike-decided
      version/prompt-hash/last-seen). Prune drops empty-files + stale-model
      (+age policy if spike defines)."
    id: ADR-007
    title: Read-only lint with spike-chosen secrets-clean cache
  - consequences: One replan point (M4) consumes durable report tables + HEAD
      validation; subsystem epics spawn in iteration 3 with disjoint ownership;
      semantic implementation follows spike verdicts. No concurrent shared-infra
      edits. No committed map to maintain; audits stay zero-write.
    context: Remaining scope spans runner/checkers/setup plus semantic swap. Audits
      must read final post-M1+M2 HEAD; M3 spikes and M4 audits run in parallel
      with one replan gate. Review questioned whether item-report tables are
      durable enough to feed iteration-3 replan.
    decision: "Iteration 2: green baseline, infra completion, spikes, audits.
      Semantic epic record spawns now; its implementation is scheduled iteration
      3 after spikes. Runner/checkers/setup-testing epics spawn at the
      iteration-3 replan from the unified map. ARCHITECT DECISION on durability:
      item reports persist as engine-durable orchestration records
      (items/*/assignment + wave reports + decisions/), readable at replan per
      the task status contract; validation re-globs HEAD. No committed map;
      fact-finders stay zero-repo-write. Escape hatch (not default): if the
      engine ever drops reports, replan re-runs the audit queries or the kind
      changes to a committed artifact."
    id: ADR-008
    title: Single-replan progressive decomposition with report-fed replan


--- Prior Close-up closeup-1.yaml ---
iteration: 1
status: next-iteration
summary: "Iteration 1 partially delivered: M1 golden safety net confirmed
  functional (golden+counts committed, oracle/tool coverage, drift/regen
  helpers, 8 assumption tests pinned). M2 helper consolidation unmerged (no
  tests/_project_helpers.py; integration.py 661 lines with suppression vs <=500)
  and M3 audits lack committed evidence; these plus the audit-flagged M1
  interface drift fixes carry to iteration 2. Semantic epic not started by
  design (spawns on narrowed protocol once M2/M3 land). Task intent (rule
  enforcement, debloat, model swap) remains future scope. No operator blocker:
  remaining work is planned, sequenced, and resourced for next iteration."


--- Prior Close-up closeup-2.yaml ---
iteration: 2
status: next-iteration
summary: "Iteration 2 delivered the verifiable repo scope: M1 green baseline +
  14-tool contract (check-only ruff format strategy, single-sourced registry,
  14-site docs migration, SIM102/R0914/C0208/W9704-tail fixes, baseline []) and
  M2 test-infra consolidation + golden hardening (11 helpers single-sourced,
  integration.py 498 lines, caller asserts, shared slicer, golden
  byte-identical) — both verified at HEAD by the close-up audit. M3 partial:
  model matrix + CPU eval (structural no-go with disclosed single-adjudicator
  limits) + runtime-pinning no-go skip merged; test_pylint_cache_semantics.py
  still missing (pylint-cache-assumptions running, cache-design-spike pending on
  its verdict). M4: both audits merged per engine records; report completeness
  validates at the iteration-3 replan via HEAD re-glob per ADR-008. Secrets
  verdict is human-async and does not block dev acceptance. Task intent (rule
  enforcement, debloat, semantic swap) remains iteration-3 scope per plan; no
  operator blocker."


--- Steering Directive/Answer (1794100866341.md) ---
Operator acknowledges all plan-1 awareness items: (1) material definition and its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is intentional, not a regression. (2) git-stored cache file at the linted repo root: OK as required by INTENT; document it in install docs, keep it detect-secrets clean, and note model weight licenses. (3) never-test-linting broadening and removing the pytest self-lint guard: OK, it matches the project's coding rules; the lint gate is the guard. No further action needed on these.


--- Steering Directive/Answer (1794128584028.md) ---
Operator acknowledges awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup: restoring AGENTS.md + cli.py:314 to base inside a test-only story was correct (kind forbids non-test paths). The follow-up docs/prod story to sync AGENTS.md counts and the cli help text is approved — add it (small dev kind, depends on the v3 line) when the wave-report next amends, or fold the two-line sync into the docs-counts-sync story if it is still pending. Pre-existing red lint/test baseline items stay out of story budgets. No other action.


--- Steering Directive/Answer (1794158471467.md) ---
Answers to secrets-triage-spike questions: (1) q-secrets-triage-spike-engine-untrack-runtime-journals: do NOT untrack journals — journal.ndjson and runs/ are audit records and must stay committed. Instead seed the should_exclude_file filter at factory init/backfill so fresh checkouts exclude .factory/ from secret scanning by default. Also fix the two stale claims (infra.yaml note that detect-secrets passes; gates-baseline [detect-secrets] PASSED line) to reflect that the baseline predates the flagged journal lines. File the filter-seeding as a harness follow-up item. (2) q-secrets-triage-spike-operator-secrets-baseline-exclusion: YES, add the ^\.factory/ pattern to .secrets.baseline filters_used after line 40 in the python-setup repo (task-branch commit), keeping the awareness residual-risk caveat (write-time redaction + periodic unfiltered audits). M1 acceptance cites the mechanism + pinned HEAD, not the finding count.


--- Decision 001-item-golden-findings-snapshot.yaml ---
id: decision-golden-findings-snapshot-1794105920421
context: item
item: golden-findings-snapshot
afterRecord: 002-test-first-a2
decision: split
timestamp: 2026-11-08T02:45:20.421Z
rationale: "3/3 test-first attempts exhausted with empty diff and no failure
  log: item couples deterministic unit-testable helpers (None-safe key, POSIX
  normalize, Counter diff, CI guard) with a heavy 2x14-tool pipeline capture +
  golden commit + integration rewiring. Test-first cannot progress on the
  combined scope. Split isolates the pure-logic module with fast synthetic tests
  from the heavy integration wiring, each independently verifiable; preserves
  probe dep and bounded-src discipline."
text: Schedule golden-helpers-unit first (fast, no pipeline);
  golden-snapshot-wiring consumes it plus the probe spec. Wiring acceptance is
  baseline-relative (6 pre-existing 13-vs-14 failures persist; no new failures).
  Do not touch .factory records.
outlines:
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe
      mirroring _violation_sort_key; normalize_record (drop msg, relativize vs
      project, strip ./, backslash->/, as_posix, assert non-absolute); serialize
      (json.dump indent=2 sort_keys=True + trailing newline);
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn+rewrite golden+counts together);
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Add tests/test_golden.py (synthetic Finding lists
      ONLY, no run_lint, no pipeline): finding_key None vs str/int ordering,
      POSIX normalization, multiset diff exact added/removed, CI-guard fail,
      coverage asserts, serialization byte-format. Acceptance: `uv run pytest
      tests/test_golden.py -q` passes; module <=500 lines, formatted. Consumes
      probe normalization spec; no src/ changes; no golden files yet."
    kind: story
    milestoneId: M1
    slug: golden-helpers-unit
    title: Golden helpers module with synthetic unit tests
  - deps:
      - golden-determinism-probe
      - golden-helpers-unit
    description: "Using tests/_golden.py from golden-helpers-unit and the probe
      report verdict. (1) Commit
      tests/data/golden/minimal_sample_project_findings.json +
      ..._tool_counts.json via the helper serialization, outside sample dir,
      never copied/linted; violations.txt RETAINED. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo.
      Bounded src allowance ONLY if probe proved test-side insufficient:
      baseline.py relativize/sort + parsers.py|_record_parsers.py ordering, <=40
      added lines, determinism-only, reviewed diff in report. Acceptance: `uv
      run pytest tests/integration.py -v`, `uv run pytest tests/test_golden.py
      -q` pass; regen twice byte-identical; golden+counts byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture


--- Decision 002-item-golden-snapshot-wiring.yaml ---
id: decision-golden-snapshot-wiring-1794117253013
context: item
item: golden-snapshot-wiring
afterRecord: 004-qa-r1-a2
decision: accept-with-debt
timestamp: 2026-11-08T05:54:13.013Z
rationale: "QA rejected twice on red-test alone: test_setup_new_and_lint passes
  'without production code changes'. That is the CORRECT outcome here, not a
  defect — the probe verdict was test-side sufficient, so the item intentionally
  makes zero src/ changes (diff: tests/_golden.py +111, integration.py +61/-27,
  two new golden JSONs, violations.txt retained). No developer retry can satisfy
  fail-then-pass without fabricating a gratuitous src change, which the plan
  forbids. The item's sensitivity is proven instead by in-memory drift injection
  and golden equality. Split/escalate/abandon all wrong: scope is correct,
  implementation passed every other gate, and M1 is the iteration's critical
  path."
text: Merge golden-snapshot-wiring as-is. Do not add src changes to satisfy
  red-test. Downstream items (consolidate-v2, audits-v2) proceed against the
  committed golden; consolidate must keep golden+counts byte-identical. Future
  tests-only contract items should be flagged red-test-exempt at assignment.
debt: "RED-TEST WAIVED (gate inapplicable by design): golden-snapshot-wiring is
  a tests-only M1 contract item — probe verdict was test-side normalization
  sufficient, so the bounded src allowance was correctly NOT used and the diff
  touches only tests/_golden.py (+collect_findings), tests/integration.py
  wiring, and the two committed golden JSON files. Red-test (test must fail
  without src changes) cannot hold when zero src changes are the correct
  outcome. Compensating verification already in the item: drift injection on
  in-memory list copies proves assert_matches_golden detects add/drop drift;
  PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 regen-twice byte-identical proves
  determinism; oracle + per-tool coverage + tool-qualified brush-off/carry
  lookups prove sensitivity. QA rejected 2/2 solely on red-test; all other
  checks passed. No src follow-up required."


--- Decision 003-amend-remove-consolidate-integration-helpers.yaml ---
id: decision-amend-remove-consolidate-integration-helpers
context: wave
item: consolidate-integration-helpers
decision: split
rationale: Amendment removed pending item consolidate-integration-helpers
timestamp: 2026-11-08T07:19:12.494Z


--- Decision 004-item-consolidate-integration-helpers-v3.yaml ---
id: decision-consolidate-integration-helpers-v3-1794126299869
context: item
item: consolidate-integration-helpers-v3
afterRecord: 002-develop-r1-a2
decision: retry-with-guidance
timestamp: 2026-11-08T08:24:59.869Z
rationale: "Both develop attempts rejected solely on tests-only: diff touches
  lint.baseline (+18/-1) outside test paths. Test work itself matches the
  outline (_project_helpers.py +210, integration.py +43/-218, conftest/_autofix
  import switches). Baseline edit is never valid here — lint.baseline stays []
  and acceptance is baseline-relative. Reverting that one file plus any
  unrelated test edits unblocks merge; no split/escalate needed."
text: "Retry granted. Fix in this order: (1) Revert lint.baseline to HEAD
  exactly (must read `[]`, `git diff -- lint.baseline` empty). NEVER run `uv run
  lint --overwrite-baseline` or bare `uv run lint` (ruff-format write hazard).
  (2) Restrict diff to tests/** only: keep _project_helpers.py (10 helpers),
  conftest.py/_autofix_helpers.py/integration.py per-consumer import switches,
  and integration.py line-budget moves (>=127 removed, <=500, no suppression).
  Revert any unrelated edits — especially tests/_golden.py behavior, tool-count
  assertions (test_lint_runner*, test_t3_coverage), factory logic, or anything
  beyond import migration. (3) Verify: `git diff --stat` shows only tests/**;
  `git diff -- tests/data/golden/` empty (byte-identical); `uv run pytest
  tests/integration.py -v` and `uv run pytest tests/test_golden.py -q` pass;
  touched files ruff/format clean; pre-existing SIM102/R0914/C0208 + 6
  tool-count failures persist by design (do not fix, do not baseline). Record
  the golden diff check in the report."
persist: true


--- Decision 005-item-pylint-cache-assumptions.yaml ---
id: decision-pylint-cache-assumptions-1794139485507
context: item
item: pylint-cache-assumptions
afterRecord: 003-develop-r1-a2
decision: retry-with-guidance
timestamp: 2026-11-08T12:04:45.507Z
rationale: "Both develop attempts rejected solely on scope creep, not on the
  assumption tests themselves: diff leaked into M1-owned files (src
  stub/coverage.py SIM102 fix, src runner/cli.py locals, 6 tests/runner 13->14
  migrations) plus a .secrets.baseline side-effect write. The item's contract is
  one new file, tests/assumptions/test_pylint_cache_semantics.py, zero src
  changes. Reverting the out-of-scope files unblocks merge; no split/escalate
  needed."
text: "Retry granted. Fix in this order: (1) Revert to HEAD exactly:
  .secrets.baseline, src/python_setup_lint/checkers/stub/coverage.py,
  src/python_setup_lint/runner/cli.py (`git diff --` on each must be empty).
  NEVER run bare `uv run lint` or any detect-secrets scan that rewrites
  .secrets.baseline (run only `uv run pytest
  tests/assumptions/test_pylint_cache_semantics.py -q`). (2) Revert all
  tests/runner/** edits (factories, extra_tools, lint_runner, stats, t3, fakes)
  — owned by runner-format-contract, parallel race. (3) Diff must contain
  exactly ONE file: tests/assumptions/test_pylint_cache_semantics.py
  (writer-first: writer + timing + --path scoping verdict, no_external_api
  marker, test_<api>_given_<condition>_then_<expected> names, offline, no src
  imports beyond reading). (4) Verify: `git diff --stat` shows only that file;
  new tests pass; touched file ruff/format clean. Pre-existing SIM102/R0914/6
  tool-count failures persist by design — do not fix, do not baseline. Record
  the writer/timing verdict (crash-safe lock vs runner post-merge vs
  jobs=1/sidecars-if--j) plus --path sweep scope in the report for
  cache-design-spike."
persist: true


--- Decision 006-item-model-eval-poc.yaml ---
id: decision-model-eval-poc-1794148393249
context: item
item: model-eval-poc
afterRecord: 004-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T14:33:13.249Z
rationale: "Single display bug blocks approval: report.py:250 renders Recall
  column from precision instead of meaningful_recall. Metrics, best-cell
  selection (lines 240-244), compliance table 4.4, and verdict are already
  correct, so a one-line render fix plus report.md regeneration unblocks merge;
  no split/escalate needed."
text: "Fix exactly one line in the poc folder (production paths untouched):
  report.py:250 change pct(precision and precision) to
  pct(accepted['meaningful_recall']). Regenerate report.md section 4.3 (lines
  209-215) from metrics.json. Verify displayed values: decider-nano rubric
  0.5/veto Recall 27.9% (not 3.1%), bekko rubric 37.7% (not 11.8%), ettin/minilm
  100% (not n/a). Confirm best-cell selection and compliance table 4.4 unchanged
  and verdict unaffected. Do not touch metrics computation, corpus, or selection
  logic."
persist: false


--- Decision 007-item-test-debloat-audit-i2.yaml ---
id: decision-test-debloat-audit-i2-1794158623946
context: item
item: test-debloat-audit-i2
afterRecord: 004-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T17:23:43.946Z
rationale: "All 10 fix requests verified as factual regressions from r1 to r2
  (spot-checked: cli.py:292-367 has force-fix/format/cwd/config-status beyond
  MAIN_ARGPARSE_CASES; _SHIPPED_CONFIG_FILES has 11 labels; smoke test is the
  sole default full-pipeline pin). Root cause is methodological: r2 counted defs
  not collected tests, invented owner tokens, and dropped r1
  clusters/limbs/reservations. The unified-map inter-dep file exists in-repo, so
  alignment is mechanical. One guided rewrite of the report (zero repo writes)
  unblocks merge; no split/escalate needed."
text: "Retry granted. Rewrite the report (report-only, zero repo writes) fixing
  all 10 in this order: (1) Owners: restore the unified-map 5-owner scheme
  exactly (runner/checkers/setup-testing/semantic/root, counts 67/83/15/4/15)
  from coding-rules-audit-i2 output.yaml:82-88; delete the 10 invented tokens;
  test_suppression file stays checkers-file with
  TestSuppressionRerankerPipeline:357-390 as the semantic symbol skip. (2) N|S
  counts: re-derive EVERY row from per-file `pytest --collect-only` truth
  (default|slow), never def counts; fix the ~25 listed files (e.g.
  semantic-check 82|3, threshold 80, lint-runner 58, stats 87). (3) Pinning:
  restore all ~15 blocking-debt limbs from r1 (cli --force-fix+env, --format,
  --cwd, --config-status; 11-label vs 7-label config gap; mypy/rumdl/ty
  _config_flag_for branches; dispatch scopes
  ty-src/pylint-pyi-src/pylint-tests-tests/tach-whole-repo; pyright tests/** and
  rumdl tests/data exclusions) — grep-verify each has zero pins. (4) Self-lint
  removals: list all six groups (noise-filter, TestModuleSizeGates,
  private-imports AST scan, autofix-conflict slow, downstream-integration
  home-write, t9_7 hardcoded checkout) with surviving gates. (5) Reservations:
  restore epic verbatim (tests/checkers/conftest.py, tests/assumptions
  runtime/decision/cache, _decision_backend/_decision_cache); delete invented
  runner/runtime paths; tests/conftest.py is root-owned. (6) Symbols: restore
  _base.py:143-238 check_if_meaningful (+pyi) and no_try_import
  _OPTIONAL_IMPORT_PATTERNS exclusions. (7) Duplicates: restore duplicate-of for
  _make_tc x13, _walk_and_release x10, _msg_ids x8, t3-vs-stats
  parser-completeness exact dup, autofix fake-vs-git, setup 6x install,
  _UvCallRecorder x2 — or explicitly justify each drop. (8) Keep
  test_real_pipeline_smoke.py (sole default full-pipeline pin; integration.py is
  explicit-only) or name a default-collected survivor. (9) Slow budget:
  recompute from truth (baseline-edge 16|2 both in TestPerfBenchmark,
  suppression 40|2) — 18->13 not 14. (10) Runtime: restore integration 65-107s
  with conditions (WSL2/py3.14.4/warm-cache ±30%). Verify: owners match unified
  map exactly; every N|S matches --collect-only; every limb/gap above named."
persist: true


## Steering Directives
--- Prior Plan plan-1.1.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
      invocations sharing one project."
    id: U2
    spikeOutlines:
      - "semantic epic test-assumptions: pin pylint 4.x invocation/hook
        semantics; lock/merge/sweep design conditional on result (else jobs=1 or
        sidecars, recorded in ADR-CACHE-01)"
  - description: "Golden must be deterministic across runs/machines. Risks:
      duplicate-code ordering, detect-secrets over ls-files, pyright/mypy churn,
      absolute-path leakage."
    id: U3
    spikeOutlines:
      - "golden-determinism-probe (test-assumptions, pre-story): capture twice
        on temp copies, diff raw captures, report unstable fields + verdict +
        normalization spec"
      - golden-findings-snapshot implements probe's test-side normalization;
        bounded src allowance (baseline relativize/sort, parser ordering only,
        <=40 lines, determinism-only) applies ONLY if the probe proves test-side
        insufficient. Excluding any field that drops a planted oracle rule is
        forbidden without an ADR.
  - description: Size/shape of coding-rules debt in src/ and redundant/lint-testing
      tests in tests/ (~28.6k LOC) unknown; subsystem epics cannot be scoped
      yet.
    id: U4
    spikeOutlines:
      - coding-rules-audit (fact-finder)
      - test-debloat-audit (fact-finder)
itemOutlines:
  - description: "Probe golden determinism BEFORE the snapshot story (resolves U3).
      On two fresh temp copies (copy+git-init+_make_config, monkeypatched
      PYTHON_SETUP_LINT_SEMANTIC=0) run run_lint capture twice; diff raw
      captures field-by-field. Report: unstable fields (ordering, absolute
      paths, timestamps, churn), verdict (test-side normalization sufficient vs
      bounded src fix needed with exact scope), and the normalization spec the
      snapshot story implements. Runs captures on temp copies only — never bare
      `uv run lint` on the repo (ruff-format write hazard). No committed files;
      output is the item report consumed by golden-findings-snapshot."
    kind: test-assumptions
    milestoneId: M1
    slug: golden-determinism-probe
    title: Probe capture determinism on temp copies
  - description: "Make the integration gate pin exact behavior per the probe report.
      Dedicated capture run separate from the rc!=0 first run: caller owns tmp
      dir, copy_sample, git-init, _make_config (package_name + rumdl override),
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0; tests/_golden.py owns Finding,
      None-safe finding_key, collect_findings(config, capture_path) (run_lint +
      read capture + normalize + sort + assert len!=0), assert_matches_golden
      (Counter multiset diff, sorted added/removed;
      PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 pytest.fails under CI/GITHUB_ACTIONS,
      else warns + rewrites golden+counts; reviewed diff required),
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Serialization indent=2/sort_keys/trailing-newline.
      First run keeps rc!=0 AND retains tool-section/SKIPPED/[CRASH]/W9705
      assertions (positive-exit failures surface there, not in golden). Replace
      substring loop with golden equality + oracle/tool coverage (violations.txt
      RETAINED). Brush-off/carry as tool-qualified lookups (tool='pylint',
      mod.py:49 present / :56 absent). Drift injection on in-memory list copies.
      If probe proves test-side insufficient: bounded src allowance ONLY in
      runner/baseline.py (relativize/POSIX/sort) and
      runner/parsers.py|_record_parsers.py (ordering), <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: integration, `pytest -q`, `lint` pass, empty lint.baseline."
    kind: story
    milestoneId: M1
    slug: golden-findings-snapshot
    title: Golden snapshot of normalized lint findings
    deps:
      - golden-determinism-probe
  - description: "Create tests/assumptions/__init__.py + 3 modules with distinct
      classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts
      (pytestmark no_external_api), tests named
      test_<api>_given_<condition>_then_<expected>, asserting observed behavior
      at pinned versions. astroid: Module.stream().read() returns bytes|str
      (product decodes-if-bytes); doc_node is Const/JoinedStr when docstring
      present else None for module/class/function; nodes_of_class accepts a
      tuple and returns union in document order; Const/JoinedStr string nodes
      expose int fromlineno/end_lineno/col_offset/end_col_offset (asserted on a
      sample literal). pylint (third-party side, not first-party register):
      PyLinter.register_checker(checker) lifecycle incl. open()/close() call
      order (record observed); CheckerTestCase/UnittestLinter capture
      add_message output into release_messages (assert observed MessageTest
      shape); MessageDefinitionTuple leading fields (msgid, symbol, description)
      + record full arity. beartype: discovery contract — decorate a function
      with a TYPE_CHECKING-only forward-ref annotation, assert the OBSERVED
      outcome (call-time vs import-time vs checker-only), record in item report
      for M3. No src/ changes. Must NOT touch AGENTS.md (consolidate is sole
      counts owner)."
    kind: test-assumptions
    milestoneId: M2
    slug: third-party-assumption-tests
    title: Pin astroid/pylint/beartype contracts
  - description: "Extract into tests/_project_helpers.py: copy_sample_project,
      git_init_and_stage (init+config user test/test@test + `git add .`,
      integration/detect-secrets semantics), git_init_bare (init -q + config
      Test/test@example.com, no add, autofix semantics — identities NOT
      unified), stage_file, commit_all, shipped_config_paths, make_runner_config
      (package_name + rumdl override, preserving _make_config side-effect
      contract incl. idempotent overwrite and no-op when shipped rumdl missing),
      build_pylint_overlay_config(project, disable_rule)->Path,
      ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project,
      monkeypatch)->None. Delete duplicate defs in conftest.py and
      _autofix_helpers.py (import instead); integration.py imports only what it
      uses; test_self_lint_clean.py and autofix tests switch imports.
      Per-consumer map: integration->{copy, git_init_and_stage,
      make_runner_config, build_overlay, ensure_precommit, install_twice};
      conftest->{shipped_config_paths} only; _autofix->{git_init_bare,
      stage_file, commit_all} only. Line budget (must remove >=127, target
      <=490): helpers ~58 + oracle reader ~8 + overlay rewrite ~21 + setup
      scaffolding (fake _run_uv/install-twice) ~20 + precommit scaffolding
      (probe + validate/config blocks) ~25 + M1 loop/lookup net ~5 +
      section-slice ~3 + import/docstring trim ~4. integration.py keeps
      path/class/function names; golden+counts byte-identical; sole AGENTS.md
      counts owner (update counts incl. new assumption tests). Acceptance:
      integration, `pytest -q`, `lint` pass."
    kind: story
    milestoneId: M2
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
  - description: "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS.
      Semantic exclusions are symbol/file-level (mark skipped, audit rest
      normally): checkers/_semantic.py+.pyi, new
      _decision_backend/_decision_cache modules (+.pyi),
      _base.py::check_if_meaningful (+stub section),
      no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi
      fidelity/private symbols, @beartype + structural suppressions, trivial
      wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs
      (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export),
      over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules,
      rumdl tests/data-exclude hack (TD-11). Output: rows {module, section,
      evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED
      disjoint-ownership map (this audit is single owner; test-debloat-audit
      consumes it via inter-dep). Reads final state
      (post-golden/assumptions/consolidate) + beartype report."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: coding-rules-audit
    title: Inventory CodingRules violations
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
      - consolidate-integration-helpers
  - description: "Read-only audit of tests/**. Semantic exclusions (mark skipped):
      tests/checkers/test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline class, tests/checkers/conftest.py
      (epic-created), tests/assumptions runtime/decision/cache modules
      (epic-created). Per module: behaviors protected; duplicates (incl.
      golden-covered); CodingRules-Tests violations (first-party mocking,
      naming, markers, in-file fixtures, _factories.py list[Any] tables, far
      cases); repo-self-lint tests for removal (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks); slow/benchmark; task-ID
      names. Output: rows {module, behaviors, duplicate-of, recommendation
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag).
      Owner column aligned to coding-rules-audit's unified map (read via
      inter-dep)."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: test-debloat-audit
    title: Inventory redundant and lint-testing tests
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
      - consolidate-integration-helpers
      - coding-rules-audit
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe (tool,
      file or '', line if int else -1, col if int else -1, rule) mirroring
      _violation_sort_key; normalize_record (drop msg, relativize vs project,
      strip ./, backslash->/, as_posix, assert non-absolute); serialize via
      json.dump(indent=2, sort_keys=True) + trailing newline;
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn + rewrite golden+counts together);
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Add tests/test_golden.py (synthetic Finding lists
      ONLY, no run_lint, no pipeline): finding_key None vs str/int ordering,
      POSIX normalization, multiset diff exact added/removed, CI-guard fail,
      coverage asserts, serialization byte-format. Acceptance: `uv run pytest
      tests/test_golden.py -q` passes; module <=500 lines, formatted. Consumes
      probe normalization spec; no src/ changes; no golden files yet."
    kind: story
    milestoneId: M1
    slug: golden-helpers-unit
    title: Golden helpers module with synthetic unit tests
  - deps:
      - golden-determinism-probe
      - golden-helpers-unit
    description: "Using tests/_golden.py from golden-helpers-unit and the probe
      report verdict. (1) Commit
      tests/data/golden/minimal_sample_project_findings.json +
      ..._tool_counts.json via the helper serialization, outside sample dir,
      never copied/linted; violations.txt RETAINED as oracle. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo
      (ruff-format write hazard). Bounded src allowance ONLY if probe proved
      test-side insufficient: runner/baseline.py relativize/sort +
      runner/parsers.py|_record_parsers.py ordering, <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest
      tests/test_golden.py -q` pass; regen twice byte-identical; golden+counts
      byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture
assumptions:
  - assumption: "'Material lint/check behavior' = findings {tool,file,line,col,rule}
      pinned by golden (PYTHON_SETUP_LINT_SEMANTIC=0) + checker unit tests; CLI
      flags/exit codes; baseline/autofix semantics; shipped configs/scopes.
      Other three limbs are pinned by surviving tests inventoried in M3 (CLI:
      tests/runner/test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*;
      configs/scopes: overlay + config tests) — if a limb has no surviving test
      the audit flags blocking debt. Reranker accept/reject decisions are not
      material; heuristic rejections (empty, boilerplate, brush-off, rule-echo)
      are material."
    disposition: confirm with human
    why: Intent replaces the model yet demands preservation; this boundary makes
      'preserve' mechanically testable per limb.
  - assumption: The git-stored decision cache belongs to the repo being linted
      (python-setup itself and consumers alike), at .python-setup-decisions.json
      next to lint.baseline. Only decisions committed; weights (0.03-0.8 GB, own
      licenses) stay in the user model cache.
    disposition: confirm with human
    why: Decisions depend on project content and must reproduce in that project's CI
      without the model.
  - assumption: Dev and CI do not install the `semantic` extra;
      sentence-transformers absent from .venv today. Gates run heuristic + cache
      hits; real-model tests are slow + with_real_api.
    why: Matches current .venv; keeps gates offline, fast, deterministic.
  - assumption: "tests/integration.py, `uv run pytest -q`, `uv run pytest
      tests/integration.py` and `uv run lint` are gate contracts: paths and
      commands do not change."
    why: Infra gates and AGENTS.md reference them; renaming silently breaks gating.
  - assumption: "'Never test linting' means pytest must not assert this repository
      passes its own lint gates — whether by re-running tools in subprocess, by
      AST/source scanning that re-implements a gate, or by config-consistency
      checks that re-lint the repo. `uv run lint` and pre-commit enforce that.
      Tests exercise logic on synthetic inputs and the sample project."
    disposition: confirm with human
    why: AST guards and config re-checks duplicate the gate and rot with rule churn;
      broadening the definition removes them with rationale.
  - assumption: "Only semantic-decision-model starts now;
      runner/checkers/setup-testing-scripts spawn at iteration-2 replan from M3
      audits. Root/epic sharing is narrowed: epic never writes tests/data (regen
      is a root iteration-2 item), AGENTS.md is split by section with a rebase
      prerequisite, tests/assumptions is append-only."
    why: No cross-epic machine edges exist; narrowing removes the write/write races
      by construction.
  - assumption: At least one model among GLiDE-0.4B and smaller Decision-Index
      models has compatible license, Python 3.14 CPU wheels and pinnable
      revision. Else the semantic epic escalates instead of shipping
      non-compliant.
    disposition: verify via semantic-decision-model spikes
    why: GLiDE uses a custom community license, tested on 3.12; smaller candidates
      vary.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker behind suppression-justification with a
      CPU-friendly small decision model plus a git-stored self-cleaning decision
      cache. Preserve every material behavior. Child epic of `modernize`.


      ## Scope (symbol-level; narrowed cross-epic protocol)

      Owned symbols/files: checkers/_semantic.py+.pyi and new private
      backend/cache modules (+.pyi each, @beartype, structlog kwargs,
      tach-clean); check_if_meaningful in checkers/_base.py+.pyi;
      _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject
      [semantic] extra + uv.lock + .gitignore semantic entries; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache modules,
      tests/checkers/conftest.py, new runtime-assumption modules under
      tests/assumptions/.

      Protocol with root: (a) NEVER write tests/data/** (no exception) — read
      golden for verification only; if heuristic outcomes shift, emit a shift
      report (which justification classes flip) + CHANGELOG behavior
      description, and root regenerates golden as an iteration-2 item; (b)
      AGENTS.md pipeline section only, applied onto HEAD containing root M2's
      merge (prerequisite), never touch count lines; (c) shared .py files:
      symbol ownership only; (d) tests/assumptions: append runtime modules only,
      never touch root's __init__ + 3 contract modules. Out of scope: other
      checkers/runner; tests/integration.py, tests/conftest.py (no edits). Any
      runner touch stays minimal + ADR.


      ## Requirements

      1. Spikes before design: (a) fact-finder candidate matrix (GLiDE-0.4B +
      Decision-Index smalls): license (exclude non-commercial), params/size,
      runtime with py3.14 CPU wheels linux/mac/win, vendored/pinned custom code
      (never unpinned trust_remote_code), offline behavior. (b) poc CPU-only:
      cold-load, warm latency, accuracy on labeled corpus (repo's real
      justifications + today's brush-off/meaningful tables); bar: >=90%
      accuracy, >=95% precision on meaningless, >=85% recall on meaningful;
      choose smallest model/prompt/threshold meeting bar, record in ADR. (c)
      test-assumptions: pylint 4.x invocation semantics; cache lock/merge/sweep
      conditional on result — if jobs>1 violates partial-run guarantee,
      constrain to jobs=1 (pinned by test) or per-worker sidecars, recorded in
      cache-design ADR (ADR-CACHE-01).

      2. Decision contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool and
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None
      (None=unavailable, heuristic stands). Public DecisionBackend Protocol
      decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD +
      PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional
      backend kwarg (public in .pyi); get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra or on failure: heuristic + cache
      hits, one warning, sentinel. Weights in user model cache, never git.
      PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root, definitive): JSON
      array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized (strip+collapse ws, keep case), rule (joined
      codes), model ('<id> rev <short12> prompt-vN', no bare hex>=20), decision,
      files (sorted POSIX relpaths)}. Key (justification,rule,model); context is
      model input only. Hits need no model. Writes: lockfile (O_CREAT|O_EXCL
      retry 5s) + merge + atomic temp+move. Sweep scoped to linted files; drop
      empty-files + stale-model entries. Isolation:
      PYTHON_SETUP_LINT_DECISIONS_PATH (tests->tmp, never repo cache). Must pass
      all tools incl. detect-secrets.

      5. Real suppressed codes: extract all codes from
      disable=/noqa:/ignore[...] via existing patterns; normalize (strip, split
      comma), sort, join ','; pass joined string as rule (bare-except keeps
      single 'bare-except-comment'). Rule-echo rejects if primary (lower,
      stripped) equals any element (lower). Cache key uses joined rule. If any
      heuristic outcome on the sample changes: do NOT touch golden; emit shift
      report + CHANGELOG behavior-change description (which justification
      classes flip, not the raw diff); root iteration-2 item regenerates.

      6. Tests: merge brush-off/meaningful/threshold tables into one
      parametrized table; FakeBackend via direct kwarg (units) and env-var
      (check_if_meaningful path); cache round-trip/cleanup/concurrency on tmp +
      hypothesis format round-trip; exactly one slow+with_real_api e2e; delete
      vacuous `is None or ...` assertions; modules <=500 lines, no suppressions;
      never test linting.

      7. Docs: update Scope list + CHANGELOG (user-visible only: extra contents,
      new/deprecated vars, cache file, behavior-change descriptions).


      ## Acceptance

      - Heuristic path unchanged: PYTHON_SETUP_LINT_SEMANTIC=0 sample lint
      equals golden (read-only verification).

      - Cache without model: no extra + cached false decision => W9704 emitted,
      no model load.

      - Brush-off never reaches model: 'pre-existing' + fake backend => False,
      backend uncalled.

      - One call per unique pair: miss + backend => exactly one call per unique
      (justification,rule), persisted sorted.

      - Scoped cleanup: suppression deleted from a.py => linting a.py removes
      entry; linting only b.py keeps it.

      - No retry storm: load fails => one attempt per process, heuristic
      results.

      - Gates: `uv run pytest -q`, `uv run pytest tests/integration.py -v`, `uv
      run lint` pass with empty lint.baseline.
    slug: semantic-decision-model
techDebt:
  - category: impacting
    description: Suppression/bare-except checkers pass their own symbol as `rule`;
      the rule-echo heuristic and model never see the actually-suppressed codes.
    id: TD-1
    resolution: "Semantic req5: extract all codes, pass comma-joined sorted string;
      echo matches any element; epic emits shift report + CHANGELOG behavior
      description, root iteration-2 item regenerates golden."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore; several assertions vacuous (`is None or ...`).
    id: TD-2
    resolution: "Semantic req6: FakeBackend via public Protocol (direct kwarg +
      dotted-path env injection); delete vacuous tests."
  - category: impacting
    description: tests/integration.py 627 lines + too-many-lines suppression;
      duplicates conftest/_autofix helpers; substring-only assertions miss
      drift.
    id: TD-3
    resolution: Probe + M1 pin exact findings with per-tool minimums; M2
      single-sources 10 helpers, moves overlay/setup/precommit scaffolding per
      budget, reaches <=500 without suppression.
  - category: impacting
    description: test_semantic_check.py 506 lines + suppression; heuristic tables
      duplicate test_semantic_threshold.py.
    id: TD-4
    resolution: "Semantic req6: one merged parametrized table; modules <=500."
  - category: adjacent
    description: ~15 checkers repeat structural suppressions (missing-beartype on
      register(), type:ignore[misc] on mixin classes) + copied stream
      read/decode.
    id: TD-5
    resolution: coding-rules-audit inventories; iteration-2 checkers epic fixes
      (base class, shared helper, typed register).
  - category: adjacent
    description: "Legacy/compat: baseline._FALLBACK_TOOLS/peek_fallback_tools,
      _compare_sorted re-export, astroid 3.x docstring fallback despite
      astroid>=4.0.4."
    id: TD-6
    resolution: Iteration-2 runner/checkers epics remove, guarded by golden.
  - category: adjacent
    description: "dispatch.py 500+ char rationale comment ending in `# pylint:
      disable=unjustified-suppression` suppresses the justification checker
      itself."
    id: TD-7
    resolution: "Iteration-2 runner epic: move rationale to design/0002, leave short
      justified comment."
  - category: adjacent
    description: tests/checkers/_factories.py ~1400 lines; ~40 pytest.param tables
      typed list[Any] with pasted justifications; cases far from tests.
    id: TD-8
    resolution: "Iteration-2 checkers epic per test-debloat-audit: ParameterSet
      typing, cases next to tests, split per checker."
  - category: adjacent
    description: Task-ID test names (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*,
      test_t3_*); repo-self-lint tests (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks) duplicate the `uv run lint`
      gate.
    id: TD-9
    resolution: "Iteration-2 epics per test-debloat-audit: rename by behavior;
      remove self-lint tests (broadened never-linting definition)."
  - category: adjacent
    description: "ADR locations disagree: CodingRules requires design/, factory ADRs
      go to docs/adr."
    id: TD-10
    resolution: "Iteration-2 replan: cross-reference (design/README or AGENTS.md
      index). No engine change."
  - category: adjacent
    description: Shipped rumdl.toml excludes tests/data, forcing the integration
      per-run rewrite to lint the sample AGENTS.md; affects golden determinism.
    id: TD-11
    resolution: coding-rules-audit inventories; iteration-2 runner epic fixes (e.g.
      narrow exclude); M1/M2 retain the override.
adrs:
  - consequences: Exact cheap regression detection; golden updates are explicit
      reviewed diffs. Message text not snapshotted. Tool upgrades may require
      reviewed regen. CI cannot silently rewrite. Positive-exit tool failures
      still surface via retained section/SKIPPED assertions, not via golden.
    context: Modernization enforces rules, debloats, swaps the semantic model while
      preserving material behavior. lint.baseline is empty; integration only
      checks planted rule-name presence, missing duplicates, moves, new false
      positives. violations.txt covers only pylint-custom + MD + duplicate-code
      rules.
    decision: "Commit Finding {tool,file?,line?,col?,rule} snapshot at
      tests/data/golden/minimal_sample_project_findings.json plus per-tool
      minimums at ..._tool_counts.json {tool: min_count}. Serialization:
      json.dump(indent=2, sort_keys=True) + trailing newline. Dedicated second
      run_lint capture (baseline=<tmp>/capture.json, overwrite) under
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0 with make_runner_config
      semantics; first run keeps rc!=0 and retains
      tool-section/SKIPPED/[CRASH]/W9705 assertions. Test-side normalize: drop
      msg, relativize vs project, strip './', backslash->'/', as_posix, assert
      non-absolute; sort/diff by None-safe finding_key mirroring
      _violation_sort_key (None file->'', None line/col->-1); Counter-multiset
      diff with sorted added/removed. Golden holds zero __CRASH__; any crash
      fails naming the tool. violations.txt retained as oracle; coverage = every
      oracle rule in golden AND every TOOLS entry meets its minimum count. Regen
      only via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1: pytest.fail under
      CI/GITHUB_ACTIONS ('refusing to rewrite golden under CI...'), warn +
      rewrite golden+counts otherwise, byte-identical across two runs, reviewed
      diff required. Drift injection = synthetic add/drop on in-memory list
      copies. Brush-off/carry are tool-qualified lookups (tool='pylint',
      file='src/minimal_sample/mod.py', line 49 present / line 56 absent)."
    id: ADR-001
    title: Golden findings snapshot as the behavior-preservation contract
  - consequences: Brush-off rejections guaranteed regardless of model; model can
      only tighten acceptance. sentence-transformers dropped; no-try-import
      patterns list the new runtime. Real-model coverage is one slow +
      with_real_api test. Old env var warns via CHANGELOG-documented
      deprecation.
    context: _semantic.py misuses a sentence-transformers cross-encoder as a quality
      judge. The dependency is heavy and absent in dev/CI, so the heuristic
      decides everything today. The intent asks for a CPU-friendly small
      decision model.
    decision: "Keep check_if_meaningful signature and PYTHON_SETUP_LINT_SEMANTIC.
      Heuristic runs first as a hard gate; rejections never reach the model.
      Accepted text goes to cache, then to a local decision model behind a
      public DecisionBackend Protocol decide(justification, rule, context) ->
      float P(meaningful) in [0,1]; decision = prob >= DECISION_THRESHOLD with
      PROMPT_VERSION='prompt-v1'. Injection without patching:
      semantic_check_if_meaningful gains optional backend kwarg (public in
      .pyi), and get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. Model/prompt/threshold
      chosen by spike under compatible license, Python 3.14 CPU wheels, pinned
      revision, no unpinned remote code, meeting bar: >=90% accuracy, >=95%
      precision on meaningless, >=85% recall on meaningful. Ships via `semantic`
      extra, configured by PYTHON_SETUP_LINT_DECISION_MODEL;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Backend
      unavailable returns None; heuristic stands."
    id: ADR-002
    title: Heuristic-gated local decision model for justification checks
  - consequences: W9704 reproducible across machines without the extra; decision
      changes are reviewable diffs. Small line-local merge conflicts possible.
      Consumer repos gain one committed file (install docs mention it); the file
      must pass all tools and not trip detect-secrets.
    context: Results cached in gitignored ~/.cache per-machine file, unbounded,
      keyed by 64-bit truncated SHA-256 including code context. Outcomes diverge
      across machines; stale entries never removed. Intent requires git-stored
      cache with cleanup.
    decision: "Store decisions in committed .python-setup-decisions.json at the
      linted project root (definitive, next to lint.baseline). Format: JSON
      array sorted by (rule, justification, model), indent=2, sort_keys=True.
      Entry {justification (normalized: strip + collapse whitespace, preserve
      case), rule (comma-joined sorted codes), model ('<id> rev <short12>
      prompt-vN', no bare hex >=20 chars), decision: bool, files: sorted POSIX
      relpaths}. Key is (justification, rule, model); context is model input
      only. Reads need no model. Writes: lockfile + merge-on-write + atomic
      temp+move (baseline pattern). Cleanup: mark-and-sweep scoped to linted
      files + drop empty-files and stale-model entries. Isolation via
      PYTHON_SETUP_LINT_DECISIONS_PATH. Lock/merge/sweep is conditional on the
      pylint-semantics spike; if jobs>1 violates the partial-run guarantee, the
      epic constrains to jobs=1 (pinned by test) or per-worker sidecars — the
      choice is recorded in the epic's cache-design ADR (ADR-CACHE-01). Weights
      stay in user model cache."
    id: ADR-003
    title: Git-stored, self-cleaning decision cache
  - consequences: Shared test infra never edited concurrently; debloat runs behind
      golden + assumptions. No machine-checkable cross-epic edges exist, so
      epic/root sharing is narrowed to non-write or prerequisite form; residual
      AGENTS.md/_base.py concurrent-edit risk is accepted with rebase
      discipline. Subsystem epics start one iteration later but scoped from
      evidence.
    context: Three workstreams span ~28.6k LOC. Parallel edits to shared test infra
      would conflict. Intent requires test infra/assumptions before debloat. The
      semantic epic shares surfaces with root (AGENTS.md, _base.py symbols,
      tests/assumptions, golden dir) but the engine has no cross-epic dependency
      edges.
    decision: "Iteration 1: root delivers golden net, test-infra consolidation,
      third-party assumption tests, read-only audits, and spawns
      semantic-decision-model now under a narrowed protocol: (a) the epic NEVER
      writes tests/data/** — golden regen after a semantic heuristic shift is a
      root iteration-2 item planned at replan from the epic's shift report (epic
      reads golden for verification only); (b) AGENTS.md: root M2 solely owns
      count lines, epic solely owns the pipeline section, and the epic's edit
      has prerequisite 'applies onto HEAD containing M2's merge' (epic never
      touches count lines); (c) shared .py files: symbol-level ownership, rest
      auditable; (d) tests/assumptions: root owns __init__ + 3 contract modules,
      epic appends runtime modules only. Iteration 2 (replan): re-glob HEAD,
      re-validate the unified ownership map (catches epic-created modules), then
      spawn runner/checkers/setup-testing-scripts epics. Policy: pytest never
      asserts this repo passes its own lint gates (no subprocess re-lint, no AST
      re-implementation, no config re-checks); `uv run lint` does that."
    id: ADR-004
    title: Progressive saga decomposition with narrowed cross-epic protocol


--- Prior Plan plan-1.2.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
      invocations sharing one project."
    id: U2
    spikeOutlines:
      - "semantic epic test-assumptions: pin pylint 4.x invocation/hook
        semantics; lock/merge/sweep design conditional on result (else jobs=1 or
        sidecars, recorded in ADR-CACHE-01)"
  - description: "Golden must be deterministic across runs/machines. Risks:
      duplicate-code ordering, detect-secrets over ls-files, pyright/mypy churn,
      absolute-path leakage."
    id: U3
    spikeOutlines:
      - "golden-determinism-probe (test-assumptions, pre-story): capture twice
        on temp copies, diff raw captures, report unstable fields + verdict +
        normalization spec"
      - golden-findings-snapshot implements probe's test-side normalization;
        bounded src allowance (baseline relativize/sort, parser ordering only,
        <=40 lines, determinism-only) applies ONLY if the probe proves test-side
        insufficient. Excluding any field that drops a planted oracle rule is
        forbidden without an ADR.
  - description: Size/shape of coding-rules debt in src/ and redundant/lint-testing
      tests in tests/ (~28.6k LOC) unknown; subsystem epics cannot be scoped
      yet.
    id: U4
    spikeOutlines:
      - coding-rules-audit (fact-finder)
      - test-debloat-audit (fact-finder)
itemOutlines:
  - description: "Probe golden determinism BEFORE the snapshot story (resolves U3).
      On two fresh temp copies (copy+git-init+_make_config, monkeypatched
      PYTHON_SETUP_LINT_SEMANTIC=0) run run_lint capture twice; diff raw
      captures field-by-field. Report: unstable fields (ordering, absolute
      paths, timestamps, churn), verdict (test-side normalization sufficient vs
      bounded src fix needed with exact scope), and the normalization spec the
      snapshot story implements. Runs captures on temp copies only — never bare
      `uv run lint` on the repo (ruff-format write hazard). No committed files;
      output is the item report consumed by golden-findings-snapshot."
    kind: test-assumptions
    milestoneId: M1
    slug: golden-determinism-probe
    title: Probe capture determinism on temp copies
  - description: "Make the integration gate pin exact behavior per the probe report.
      Dedicated capture run separate from the rc!=0 first run: caller owns tmp
      dir, copy_sample, git-init, _make_config (package_name + rumdl override),
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0; tests/_golden.py owns Finding,
      None-safe finding_key, collect_findings(config, capture_path) (run_lint +
      read capture + normalize + sort + assert len!=0), assert_matches_golden
      (Counter multiset diff, sorted added/removed;
      PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 pytest.fails under CI/GITHUB_ACTIONS,
      else warns + rewrites golden+counts; reviewed diff required),
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Serialization indent=2/sort_keys/trailing-newline.
      First run keeps rc!=0 AND retains tool-section/SKIPPED/[CRASH]/W9705
      assertions (positive-exit failures surface there, not in golden). Replace
      substring loop with golden equality + oracle/tool coverage (violations.txt
      RETAINED). Brush-off/carry as tool-qualified lookups (tool='pylint',
      mod.py:49 present / :56 absent). Drift injection on in-memory list copies.
      If probe proves test-side insufficient: bounded src allowance ONLY in
      runner/baseline.py (relativize/POSIX/sort) and
      runner/parsers.py|_record_parsers.py (ordering), <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: integration, `pytest -q`, `lint` pass, empty lint.baseline."
    kind: story
    milestoneId: M1
    slug: golden-findings-snapshot
    title: Golden snapshot of normalized lint findings
    deps:
      - golden-determinism-probe
  - description: "Create tests/assumptions/__init__.py + 3 modules with distinct
      classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts
      (pytestmark no_external_api), tests named
      test_<api>_given_<condition>_then_<expected>, asserting observed behavior
      at pinned versions. astroid: Module.stream().read() returns bytes|str
      (product decodes-if-bytes); doc_node is Const/JoinedStr when docstring
      present else None for module/class/function; nodes_of_class accepts a
      tuple and returns union in document order; Const/JoinedStr string nodes
      expose int fromlineno/end_lineno/col_offset/end_col_offset (asserted on a
      sample literal). pylint (third-party side, not first-party register):
      PyLinter.register_checker(checker) lifecycle incl. open()/close() call
      order (record observed); CheckerTestCase/UnittestLinter capture
      add_message output into release_messages (assert observed MessageTest
      shape); MessageDefinitionTuple leading fields (msgid, symbol, description)
      + record full arity. beartype: discovery contract — decorate a function
      with a TYPE_CHECKING-only forward-ref annotation, assert the OBSERVED
      outcome (call-time vs import-time vs checker-only), record in item report
      for M3. No src/ changes. Must NOT touch AGENTS.md (consolidate is sole
      counts owner)."
    kind: test-assumptions
    milestoneId: M2
    slug: third-party-assumption-tests
    title: Pin astroid/pylint/beartype contracts
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
    description: "Extract into tests/_project_helpers.py: copy_sample_project,
      git_init_and_stage (init+config user test/test@test + `git add .`,
      integration/detect-secrets semantics), git_init_bare (init -q + config
      Test/test@example.com, no add, autofix semantics — identities NOT
      unified), stage_file, commit_all, shipped_config_paths, make_runner_config
      (package_name + rumdl override, preserving _make_config side-effect
      contract incl. idempotent overwrite and no-op when shipped rumdl missing),
      build_pylint_overlay_config(project, disable_rule)->Path,
      ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project,
      monkeypatch)->None. Delete duplicate defs in conftest.py and
      _autofix_helpers.py (import instead); integration.py imports only what it
      uses; test_self_lint_clean.py and autofix tests switch imports.
      Per-consumer map: integration->{copy, git_init_and_stage,
      make_runner_config, build_overlay, ensure_precommit, install_twice};
      conftest->{shipped_config_paths} only; _autofix->{git_init_bare,
      stage_file, commit_all} only. Line budget (must remove >=127, target
      <=490): helpers ~58 + oracle reader ~8 + overlay rewrite ~21 + setup
      scaffolding (fake _run_uv/install-twice) ~20 + precommit scaffolding
      (probe + validate/config blocks) ~25 + M1 loop/lookup net ~5 +
      section-slice ~3 + import/docstring trim ~4. integration.py keeps
      path/class/function names; golden+counts byte-identical; sole AGENTS.md
      counts owner (update counts incl. new assumption tests). Acceptance:
      integration, `pytest -q`, `lint` pass."
    kind: story
    milestoneId: M2
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
    description: "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS.
      Semantic exclusions are symbol/file-level (mark skipped, audit rest
      normally): checkers/_semantic.py+.pyi, new
      _decision_backend/_decision_cache modules (+.pyi),
      _base.py::check_if_meaningful (+stub section),
      no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi
      fidelity/private symbols, @beartype + structural suppressions, trivial
      wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs
      (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export),
      over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules,
      rumdl tests/data-exclude hack (TD-11). Output: rows {module, section,
      evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED
      disjoint-ownership map (this audit is single owner; test-debloat-audit
      consumes it via inter-dep). Reads final state
      (post-golden/assumptions/consolidate) + beartype report."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: coding-rules-audit
    title: Inventory CodingRules violations
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
      - coding-rules-audit
    description: "Read-only audit of tests/**. Semantic exclusions (mark skipped):
      tests/checkers/test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline class, tests/checkers/conftest.py
      (epic-created), tests/assumptions runtime/decision/cache modules
      (epic-created). Per module: behaviors protected; duplicates (incl.
      golden-covered); CodingRules-Tests violations (first-party mocking,
      naming, markers, in-file fixtures, _factories.py list[Any] tables, far
      cases); repo-self-lint tests for removal (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks); slow/benchmark; task-ID
      names. Output: rows {module, behaviors, duplicate-of, recommendation
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag).
      Owner column aligned to coding-rules-audit's unified map (read via
      inter-dep)."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: test-debloat-audit
    title: Inventory redundant and lint-testing tests
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe (tool,
      file or '', line if int else -1, col if int else -1, rule) mirroring
      _violation_sort_key; normalize_record (drop msg, relativize vs project,
      strip ./, backslash->/, as_posix, assert non-absolute); serialize via
      json.dump(indent=2, sort_keys=True) + trailing newline;
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn + rewrite golden+counts together);
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Add tests/test_golden.py (synthetic Finding lists
      ONLY, no run_lint, no pipeline): finding_key None vs str/int ordering,
      POSIX normalization, multiset diff exact added/removed, CI-guard fail,
      coverage asserts, serialization byte-format. Acceptance: `uv run pytest
      tests/test_golden.py -q` passes; module <=500 lines, formatted. Consumes
      probe normalization spec; no src/ changes; no golden files yet."
    kind: story
    milestoneId: M1
    slug: golden-helpers-unit
    title: Golden helpers module with synthetic unit tests
  - deps:
      - golden-determinism-probe
      - golden-helpers-unit
    description: "Using tests/_golden.py from golden-helpers-unit and the probe
      report verdict. (1) Commit
      tests/data/golden/minimal_sample_project_findings.json +
      ..._tool_counts.json via the helper serialization, outside sample dir,
      never copied/linted; violations.txt RETAINED as oracle. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo
      (ruff-format write hazard). Bounded src allowance ONLY if probe proved
      test-side insufficient: runner/baseline.py relativize/sort +
      runner/parsers.py|_record_parsers.py ordering, <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest
      tests/test_golden.py -q` pass; regen twice byte-identical; golden+counts
      byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture
assumptions:
  - assumption: "'Material lint/check behavior' = findings {tool,file,line,col,rule}
      pinned by golden (PYTHON_SETUP_LINT_SEMANTIC=0) + checker unit tests; CLI
      flags/exit codes; baseline/autofix semantics; shipped configs/scopes.
      Other three limbs are pinned by surviving tests inventoried in M3 (CLI:
      tests/runner/test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*;
      configs/scopes: overlay + config tests) — if a limb has no surviving test
      the audit flags blocking debt. Reranker accept/reject decisions are not
      material; heuristic rejections (empty, boilerplate, brush-off, rule-echo)
      are material."
    disposition: confirm with human
    why: Intent replaces the model yet demands preservation; this boundary makes
      'preserve' mechanically testable per limb.
  - assumption: The git-stored decision cache belongs to the repo being linted
      (python-setup itself and consumers alike), at .python-setup-decisions.json
      next to lint.baseline. Only decisions committed; weights (0.03-0.8 GB, own
      licenses) stay in the user model cache.
    disposition: confirm with human
    why: Decisions depend on project content and must reproduce in that project's CI
      without the model.
  - assumption: Dev and CI do not install the `semantic` extra;
      sentence-transformers absent from .venv today. Gates run heuristic + cache
      hits; real-model tests are slow + with_real_api.
    why: Matches current .venv; keeps gates offline, fast, deterministic.
  - assumption: "tests/integration.py, `uv run pytest -q`, `uv run pytest
      tests/integration.py` and `uv run lint` are gate contracts: paths and
      commands do not change."
    why: Infra gates and AGENTS.md reference them; renaming silently breaks gating.
  - assumption: "'Never test linting' means pytest must not assert this repository
      passes its own lint gates — whether by re-running tools in subprocess, by
      AST/source scanning that re-implements a gate, or by config-consistency
      checks that re-lint the repo. `uv run lint` and pre-commit enforce that.
      Tests exercise logic on synthetic inputs and the sample project."
    disposition: confirm with human
    why: AST guards and config re-checks duplicate the gate and rot with rule churn;
      broadening the definition removes them with rationale.
  - assumption: "Only semantic-decision-model starts now;
      runner/checkers/setup-testing-scripts spawn at iteration-2 replan from M3
      audits. Root/epic sharing is narrowed: epic never writes tests/data (regen
      is a root iteration-2 item), AGENTS.md is split by section with a rebase
      prerequisite, tests/assumptions is append-only."
    why: No cross-epic machine edges exist; narrowing removes the write/write races
      by construction.
  - assumption: At least one model among GLiDE-0.4B and smaller Decision-Index
      models has compatible license, Python 3.14 CPU wheels and pinnable
      revision. Else the semantic epic escalates instead of shipping
      non-compliant.
    disposition: verify via semantic-decision-model spikes
    why: GLiDE uses a custom community license, tested on 3.12; smaller candidates
      vary.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker behind suppression-justification with a
      CPU-friendly small decision model plus a git-stored self-cleaning decision
      cache. Preserve every material behavior. Child epic of `modernize`.


      ## Scope (symbol-level; narrowed cross-epic protocol)

      Owned symbols/files: checkers/_semantic.py+.pyi and new private
      backend/cache modules (+.pyi each, @beartype, structlog kwargs,
      tach-clean); check_if_meaningful in checkers/_base.py+.pyi;
      _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject
      [semantic] extra + uv.lock + .gitignore semantic entries; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache modules,
      tests/checkers/conftest.py, new runtime-assumption modules under
      tests/assumptions/.

      Protocol with root: (a) NEVER write tests/data/** (no exception) — read
      golden for verification only; if heuristic outcomes shift, emit a shift
      report (which justification classes flip) + CHANGELOG behavior
      description, and root regenerates golden as an iteration-2 item; (b)
      AGENTS.md pipeline section only, applied onto HEAD containing root M2's
      merge (prerequisite), never touch count lines; (c) shared .py files:
      symbol ownership only; (d) tests/assumptions: append runtime modules only,
      never touch root's __init__ + 3 contract modules. Out of scope: other
      checkers/runner; tests/integration.py, tests/conftest.py (no edits). Any
      runner touch stays minimal + ADR.


      ## Requirements

      1. Spikes before design: (a) fact-finder candidate matrix (GLiDE-0.4B +
      Decision-Index smalls): license (exclude non-commercial), params/size,
      runtime with py3.14 CPU wheels linux/mac/win, vendored/pinned custom code
      (never unpinned trust_remote_code), offline behavior. (b) poc CPU-only:
      cold-load, warm latency, accuracy on labeled corpus (repo's real
      justifications + today's brush-off/meaningful tables); bar: >=90%
      accuracy, >=95% precision on meaningless, >=85% recall on meaningful;
      choose smallest model/prompt/threshold meeting bar, record in ADR. (c)
      test-assumptions: pylint 4.x invocation semantics; cache lock/merge/sweep
      conditional on result — if jobs>1 violates partial-run guarantee,
      constrain to jobs=1 (pinned by test) or per-worker sidecars, recorded in
      cache-design ADR (ADR-CACHE-01).

      2. Decision contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool and
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None
      (None=unavailable, heuristic stands). Public DecisionBackend Protocol
      decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD +
      PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional
      backend kwarg (public in .pyi); get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra or on failure: heuristic + cache
      hits, one warning, sentinel. Weights in user model cache, never git.
      PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root, definitive): JSON
      array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized (strip+collapse ws, keep case), rule (joined
      codes), model ('<id> rev <short12> prompt-vN', no bare hex>=20), decision,
      files (sorted POSIX relpaths)}. Key (justification,rule,model); context is
      model input only. Hits need no model. Writes: lockfile (O_CREAT|O_EXCL
      retry 5s) + merge + atomic temp+move. Sweep scoped to linted files; drop
      empty-files + stale-model entries. Isolation:
      PYTHON_SETUP_LINT_DECISIONS_PATH (tests->tmp, never repo cache). Must pass
      all tools incl. detect-secrets.

      5. Real suppressed codes: extract all codes from
      disable=/noqa:/ignore[...] via existing patterns; normalize (strip, split
      comma), sort, join ','; pass joined string as rule (bare-except keeps
      single 'bare-except-comment'). Rule-echo rejects if primary (lower,
      stripped) equals any element (lower). Cache key uses joined rule. If any
      heuristic outcome on the sample changes: do NOT touch golden; emit shift
      report + CHANGELOG behavior-change description (which justification
      classes flip, not the raw diff); root iteration-2 item regenerates.

      6. Tests: merge brush-off/meaningful/threshold tables into one
      parametrized table; FakeBackend via direct kwarg (units) and env-var
      (check_if_meaningful path); cache round-trip/cleanup/concurrency on tmp +
      hypothesis format round-trip; exactly one slow+with_real_api e2e; delete
      vacuous `is None or ...` assertions; modules <=500 lines, no suppressions;
      never test linting.

      7. Docs: update Scope list + CHANGELOG (user-visible only: extra contents,
      new/deprecated vars, cache file, behavior-change descriptions).


      ## Acceptance

      - Heuristic path unchanged: PYTHON_SETUP_LINT_SEMANTIC=0 sample lint
      equals golden (read-only verification).

      - Cache without model: no extra + cached false decision => W9704 emitted,
      no model load.

      - Brush-off never reaches model: 'pre-existing' + fake backend => False,
      backend uncalled.

      - One call per unique pair: miss + backend => exactly one call per unique
      (justification,rule), persisted sorted.

      - Scoped cleanup: suppression deleted from a.py => linting a.py removes
      entry; linting only b.py keeps it.

      - No retry storm: load fails => one attempt per process, heuristic
      results.

      - Gates: `uv run pytest -q`, `uv run pytest tests/integration.py -v`, `uv
      run lint` pass with empty lint.baseline.
    slug: semantic-decision-model
techDebt:
  - category: impacting
    description: Suppression/bare-except checkers pass their own symbol as `rule`;
      the rule-echo heuristic and model never see the actually-suppressed codes.
    id: TD-1
    resolution: "Semantic req5: extract all codes, pass comma-joined sorted string;
      echo matches any element; epic emits shift report + CHANGELOG behavior
      description, root iteration-2 item regenerates golden."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore; several assertions vacuous (`is None or ...`).
    id: TD-2
    resolution: "Semantic req6: FakeBackend via public Protocol (direct kwarg +
      dotted-path env injection); delete vacuous tests."
  - category: impacting
    description: tests/integration.py 627 lines + too-many-lines suppression;
      duplicates conftest/_autofix helpers; substring-only assertions miss
      drift.
    id: TD-3
    resolution: Probe + M1 pin exact findings with per-tool minimums; M2
      single-sources 10 helpers, moves overlay/setup/precommit scaffolding per
      budget, reaches <=500 without suppression.
  - category: impacting
    description: test_semantic_check.py 506 lines + suppression; heuristic tables
      duplicate test_semantic_threshold.py.
    id: TD-4
    resolution: "Semantic req6: one merged parametrized table; modules <=500."
  - category: adjacent
    description: ~15 checkers repeat structural suppressions (missing-beartype on
      register(), type:ignore[misc] on mixin classes) + copied stream
      read/decode.
    id: TD-5
    resolution: coding-rules-audit inventories; iteration-2 checkers epic fixes
      (base class, shared helper, typed register).
  - category: adjacent
    description: "Legacy/compat: baseline._FALLBACK_TOOLS/peek_fallback_tools,
      _compare_sorted re-export, astroid 3.x docstring fallback despite
      astroid>=4.0.4."
    id: TD-6
    resolution: Iteration-2 runner/checkers epics remove, guarded by golden.
  - category: adjacent
    description: "dispatch.py 500+ char rationale comment ending in `# pylint:
      disable=unjustified-suppression` suppresses the justification checker
      itself."
    id: TD-7
    resolution: "Iteration-2 runner epic: move rationale to design/0002, leave short
      justified comment."
  - category: adjacent
    description: tests/checkers/_factories.py ~1400 lines; ~40 pytest.param tables
      typed list[Any] with pasted justifications; cases far from tests.
    id: TD-8
    resolution: "Iteration-2 checkers epic per test-debloat-audit: ParameterSet
      typing, cases next to tests, split per checker."
  - category: adjacent
    description: Task-ID test names (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*,
      test_t3_*); repo-self-lint tests (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks) duplicate the `uv run lint`
      gate.
    id: TD-9
    resolution: "Iteration-2 epics per test-debloat-audit: rename by behavior;
      remove self-lint tests (broadened never-linting definition)."
  - category: adjacent
    description: "ADR locations disagree: CodingRules requires design/, factory ADRs
      go to docs/adr."
    id: TD-10
    resolution: "Iteration-2 replan: cross-reference (design/README or AGENTS.md
      index). No engine change."
  - category: adjacent
    description: Shipped rumdl.toml excludes tests/data, forcing the integration
      per-run rewrite to lint the sample AGENTS.md; affects golden determinism.
    id: TD-11
    resolution: coding-rules-audit inventories; iteration-2 runner epic fixes (e.g.
      narrow exclude); M1/M2 retain the override.
adrs:
  - consequences: Exact cheap regression detection; golden updates are explicit
      reviewed diffs. Message text not snapshotted. Tool upgrades may require
      reviewed regen. CI cannot silently rewrite. Positive-exit tool failures
      still surface via retained section/SKIPPED assertions, not via golden.
    context: Modernization enforces rules, debloats, swaps the semantic model while
      preserving material behavior. lint.baseline is empty; integration only
      checks planted rule-name presence, missing duplicates, moves, new false
      positives. violations.txt covers only pylint-custom + MD + duplicate-code
      rules.
    decision: "Commit Finding {tool,file?,line?,col?,rule} snapshot at
      tests/data/golden/minimal_sample_project_findings.json plus per-tool
      minimums at ..._tool_counts.json {tool: min_count}. Serialization:
      json.dump(indent=2, sort_keys=True) + trailing newline. Dedicated second
      run_lint capture (baseline=<tmp>/capture.json, overwrite) under
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0 with make_runner_config
      semantics; first run keeps rc!=0 and retains
      tool-section/SKIPPED/[CRASH]/W9705 assertions. Test-side normalize: drop
      msg, relativize vs project, strip './', backslash->'/', as_posix, assert
      non-absolute; sort/diff by None-safe finding_key mirroring
      _violation_sort_key (None file->'', None line/col->-1); Counter-multiset
      diff with sorted added/removed. Golden holds zero __CRASH__; any crash
      fails naming the tool. violations.txt retained as oracle; coverage = every
      oracle rule in golden AND every TOOLS entry meets its minimum count. Regen
      only via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1: pytest.fail under
      CI/GITHUB_ACTIONS ('refusing to rewrite golden under CI...'), warn +
      rewrite golden+counts otherwise, byte-identical across two runs, reviewed
      diff required. Drift injection = synthetic add/drop on in-memory list
      copies. Brush-off/carry are tool-qualified lookups (tool='pylint',
      file='src/minimal_sample/mod.py', line 49 present / line 56 absent)."
    id: ADR-001
    title: Golden findings snapshot as the behavior-preservation contract
  - consequences: Brush-off rejections guaranteed regardless of model; model can
      only tighten acceptance. sentence-transformers dropped; no-try-import
      patterns list the new runtime. Real-model coverage is one slow +
      with_real_api test. Old env var warns via CHANGELOG-documented
      deprecation.
    context: _semantic.py misuses a sentence-transformers cross-encoder as a quality
      judge. The dependency is heavy and absent in dev/CI, so the heuristic
      decides everything today. The intent asks for a CPU-friendly small
      decision model.
    decision: "Keep check_if_meaningful signature and PYTHON_SETUP_LINT_SEMANTIC.
      Heuristic runs first as a hard gate; rejections never reach the model.
      Accepted text goes to cache, then to a local decision model behind a
      public DecisionBackend Protocol decide(justification, rule, context) ->
      float P(meaningful) in [0,1]; decision = prob >= DECISION_THRESHOLD with
      PROMPT_VERSION='prompt-v1'. Injection without patching:
      semantic_check_if_meaningful gains optional backend kwarg (public in
      .pyi), and get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. Model/prompt/threshold
      chosen by spike under compatible license, Python 3.14 CPU wheels, pinned
      revision, no unpinned remote code, meeting bar: >=90% accuracy, >=95%
      precision on meaningless, >=85% recall on meaningful. Ships via `semantic`
      extra, configured by PYTHON_SETUP_LINT_DECISION_MODEL;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Backend
      unavailable returns None; heuristic stands."
    id: ADR-002
    title: Heuristic-gated local decision model for justification checks
  - consequences: W9704 reproducible across machines without the extra; decision
      changes are reviewable diffs. Small line-local merge conflicts possible.
      Consumer repos gain one committed file (install docs mention it); the file
      must pass all tools and not trip detect-secrets.
    context: Results cached in gitignored ~/.cache per-machine file, unbounded,
      keyed by 64-bit truncated SHA-256 including code context. Outcomes diverge
      across machines; stale entries never removed. Intent requires git-stored
      cache with cleanup.
    decision: "Store decisions in committed .python-setup-decisions.json at the
      linted project root (definitive, next to lint.baseline). Format: JSON
      array sorted by (rule, justification, model), indent=2, sort_keys=True.
      Entry {justification (normalized: strip + collapse whitespace, preserve
      case), rule (comma-joined sorted codes), model ('<id> rev <short12>
      prompt-vN', no bare hex >=20 chars), decision: bool, files: sorted POSIX
      relpaths}. Key is (justification, rule, model); context is model input
      only. Reads need no model. Writes: lockfile + merge-on-write + atomic
      temp+move (baseline pattern). Cleanup: mark-and-sweep scoped to linted
      files + drop empty-files and stale-model entries. Isolation via
      PYTHON_SETUP_LINT_DECISIONS_PATH. Lock/merge/sweep is conditional on the
      pylint-semantics spike; if jobs>1 violates the partial-run guarantee, the
      epic constrains to jobs=1 (pinned by test) or per-worker sidecars — the
      choice is recorded in the epic's cache-design ADR (ADR-CACHE-01). Weights
      stay in user model cache."
    id: ADR-003
    title: Git-stored, self-cleaning decision cache
  - consequences: Shared test infra never edited concurrently; debloat runs behind
      golden + assumptions. No machine-checkable cross-epic edges exist, so
      epic/root sharing is narrowed to non-write or prerequisite form; residual
      AGENTS.md/_base.py concurrent-edit risk is accepted with rebase
      discipline. Subsystem epics start one iteration later but scoped from
      evidence.
    context: Three workstreams span ~28.6k LOC. Parallel edits to shared test infra
      would conflict. Intent requires test infra/assumptions before debloat. The
      semantic epic shares surfaces with root (AGENTS.md, _base.py symbols,
      tests/assumptions, golden dir) but the engine has no cross-epic dependency
      edges.
    decision: "Iteration 1: root delivers golden net, test-infra consolidation,
      third-party assumption tests, read-only audits, and spawns
      semantic-decision-model now under a narrowed protocol: (a) the epic NEVER
      writes tests/data/** — golden regen after a semantic heuristic shift is a
      root iteration-2 item planned at replan from the epic's shift report (epic
      reads golden for verification only); (b) AGENTS.md: root M2 solely owns
      count lines, epic solely owns the pipeline section, and the epic's edit
      has prerequisite 'applies onto HEAD containing M2's merge' (epic never
      touches count lines); (c) shared .py files: symbol-level ownership, rest
      auditable; (d) tests/assumptions: root owns __init__ + 3 contract modules,
      epic appends runtime modules only. Iteration 2 (replan): re-glob HEAD,
      re-validate the unified ownership map (catches epic-created modules), then
      spawn runner/checkers/setup-testing-scripts epics. Policy: pytest never
      asserts this repo passes its own lint gates (no subprocess re-lint, no AST
      re-implementation, no config re-checks); `uv run lint` does that."
    id: ADR-004
    title: Progressive saga decomposition with narrowed cross-epic protocol


--- Prior Plan plan-1.3.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
      invocations sharing one project."
    id: U2
    spikeOutlines:
      - "semantic epic test-assumptions: pin pylint 4.x invocation/hook
        semantics; lock/merge/sweep design conditional on result (else jobs=1 or
        sidecars, recorded in ADR-CACHE-01)"
  - description: "Golden must be deterministic across runs/machines. Risks:
      duplicate-code ordering, detect-secrets over ls-files, pyright/mypy churn,
      absolute-path leakage."
    id: U3
    spikeOutlines:
      - "golden-determinism-probe (test-assumptions, pre-story): capture twice
        on temp copies, diff raw captures, report unstable fields + verdict +
        normalization spec"
      - golden-findings-snapshot implements probe's test-side normalization;
        bounded src allowance (baseline relativize/sort, parser ordering only,
        <=40 lines, determinism-only) applies ONLY if the probe proves test-side
        insufficient. Excluding any field that drops a planted oracle rule is
        forbidden without an ADR.
  - description: Size/shape of coding-rules debt in src/ and redundant/lint-testing
      tests in tests/ (~28.6k LOC) unknown; subsystem epics cannot be scoped
      yet.
    id: U4
    spikeOutlines:
      - coding-rules-audit (fact-finder)
      - test-debloat-audit (fact-finder)
itemOutlines:
  - description: "Probe golden determinism BEFORE the snapshot story (resolves U3).
      On two fresh temp copies (copy+git-init+_make_config, monkeypatched
      PYTHON_SETUP_LINT_SEMANTIC=0) run run_lint capture twice; diff raw
      captures field-by-field. Report: unstable fields (ordering, absolute
      paths, timestamps, churn), verdict (test-side normalization sufficient vs
      bounded src fix needed with exact scope), and the normalization spec the
      snapshot story implements. Runs captures on temp copies only — never bare
      `uv run lint` on the repo (ruff-format write hazard). No committed files;
      output is the item report consumed by golden-findings-snapshot."
    kind: test-assumptions
    milestoneId: M1
    slug: golden-determinism-probe
    title: Probe capture determinism on temp copies
  - description: "Make the integration gate pin exact behavior per the probe report.
      Dedicated capture run separate from the rc!=0 first run: caller owns tmp
      dir, copy_sample, git-init, _make_config (package_name + rumdl override),
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0; tests/_golden.py owns Finding,
      None-safe finding_key, collect_findings(config, capture_path) (run_lint +
      read capture + normalize + sort + assert len!=0), assert_matches_golden
      (Counter multiset diff, sorted added/removed;
      PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 pytest.fails under CI/GITHUB_ACTIONS,
      else warns + rewrites golden+counts; reviewed diff required),
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Serialization indent=2/sort_keys/trailing-newline.
      First run keeps rc!=0 AND retains tool-section/SKIPPED/[CRASH]/W9705
      assertions (positive-exit failures surface there, not in golden). Replace
      substring loop with golden equality + oracle/tool coverage (violations.txt
      RETAINED). Brush-off/carry as tool-qualified lookups (tool='pylint',
      mod.py:49 present / :56 absent). Drift injection on in-memory list copies.
      If probe proves test-side insufficient: bounded src allowance ONLY in
      runner/baseline.py (relativize/POSIX/sort) and
      runner/parsers.py|_record_parsers.py (ordering), <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: integration, `pytest -q`, `lint` pass, empty lint.baseline."
    kind: story
    milestoneId: M1
    slug: golden-findings-snapshot
    title: Golden snapshot of normalized lint findings
    deps:
      - golden-determinism-probe
  - description: "Create tests/assumptions/__init__.py + 3 modules with distinct
      classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts
      (pytestmark no_external_api), tests named
      test_<api>_given_<condition>_then_<expected>, asserting observed behavior
      at pinned versions. astroid: Module.stream().read() returns bytes|str
      (product decodes-if-bytes); doc_node is Const/JoinedStr when docstring
      present else None for module/class/function; nodes_of_class accepts a
      tuple and returns union in document order; Const/JoinedStr string nodes
      expose int fromlineno/end_lineno/col_offset/end_col_offset (asserted on a
      sample literal). pylint (third-party side, not first-party register):
      PyLinter.register_checker(checker) lifecycle incl. open()/close() call
      order (record observed); CheckerTestCase/UnittestLinter capture
      add_message output into release_messages (assert observed MessageTest
      shape); MessageDefinitionTuple leading fields (msgid, symbol, description)
      + record full arity. beartype: discovery contract — decorate a function
      with a TYPE_CHECKING-only forward-ref annotation, assert the OBSERVED
      outcome (call-time vs import-time vs checker-only), record in item report
      for M3. No src/ changes. Must NOT touch AGENTS.md (consolidate is sole
      counts owner)."
    kind: test-assumptions
    milestoneId: M2
    slug: third-party-assumption-tests
    title: Pin astroid/pylint/beartype contracts
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
    description: "Extract into tests/_project_helpers.py: copy_sample_project,
      git_init_and_stage (init+config user test/test@test + `git add .`,
      integration/detect-secrets semantics), git_init_bare (init -q + config
      Test/test@example.com, no add, autofix semantics — identities NOT
      unified), stage_file, commit_all, shipped_config_paths, make_runner_config
      (package_name + rumdl override, preserving _make_config side-effect
      contract incl. idempotent overwrite and no-op when shipped rumdl missing),
      build_pylint_overlay_config(project, disable_rule)->Path,
      ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project,
      monkeypatch)->None. Delete duplicate defs in conftest.py and
      _autofix_helpers.py (import instead); integration.py imports only what it
      uses; test_self_lint_clean.py and autofix tests switch imports.
      Per-consumer map: integration->{copy, git_init_and_stage,
      make_runner_config, build_overlay, ensure_precommit, install_twice};
      conftest->{shipped_config_paths} only; _autofix->{git_init_bare,
      stage_file, commit_all} only. Line budget (must remove >=127, target
      <=490): helpers ~58 + oracle reader ~8 + overlay rewrite ~21 + setup
      scaffolding (fake _run_uv/install-twice) ~20 + precommit scaffolding
      (probe + validate/config blocks) ~25 + M1 loop/lookup net ~5 +
      section-slice ~3 + import/docstring trim ~4. integration.py keeps
      path/class/function names; golden+counts byte-identical; MUST NOT touch
      AGENTS.md, docs/**, or src/** (test-only enforcement) — AGENTS.md counts +
      cli.py help sync moved to docs-counts-sync follow-up, leave stale by
      design. Acceptance: integration, `pytest -q` pass; golden+counts
      byte-identical; no new lint violations in touched files (pre-existing
      SIM102/R0914/C0208 persist)."
    kind: story
    milestoneId: M2
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
    description: "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS.
      Semantic exclusions are symbol/file-level (mark skipped, audit rest
      normally): checkers/_semantic.py+.pyi, new
      _decision_backend/_decision_cache modules (+.pyi),
      _base.py::check_if_meaningful (+stub section),
      no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi
      fidelity/private symbols, @beartype + structural suppressions, trivial
      wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs
      (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export),
      over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules,
      rumdl tests/data-exclude hack (TD-11). Output: rows {module, section,
      evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED
      disjoint-ownership map (this audit is single owner; test-debloat-audit
      consumes it via inter-dep). Reads final state
      (post-golden/assumptions/consolidate) + beartype report."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: coding-rules-audit
    title: Inventory CodingRules violations
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
      - coding-rules-audit
    description: "Read-only audit of tests/**. Semantic exclusions (mark skipped):
      tests/checkers/test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline class, tests/checkers/conftest.py
      (epic-created), tests/assumptions runtime/decision/cache modules
      (epic-created). Per module: behaviors protected; duplicates (incl.
      golden-covered); CodingRules-Tests violations (first-party mocking,
      naming, markers, in-file fixtures, _factories.py list[Any] tables, far
      cases); repo-self-lint tests for removal (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks); slow/benchmark; task-ID
      names. Output: rows {module, behaviors, duplicate-of, recommendation
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag).
      Owner column aligned to coding-rules-audit's unified map (read via
      inter-dep)."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: test-debloat-audit
    title: Inventory redundant and lint-testing tests
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe (tool,
      file or '', line if int else -1, col if int else -1, rule) mirroring
      _violation_sort_key; normalize_record (drop msg, relativize vs project,
      strip ./, backslash->/, as_posix, assert non-absolute); serialize via
      json.dump(indent=2, sort_keys=True) + trailing newline;
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn + rewrite golden+counts together);
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Add tests/test_golden.py (synthetic Finding lists
      ONLY, no run_lint, no pipeline): finding_key None vs str/int ordering,
      POSIX normalization, multiset diff exact added/removed, CI-guard fail,
      coverage asserts, serialization byte-format. Acceptance: `uv run pytest
      tests/test_golden.py -q` passes; module <=500 lines, formatted. Consumes
      probe normalization spec; no src/ changes; no golden files yet."
    kind: story
    milestoneId: M1
    slug: golden-helpers-unit
    title: Golden helpers module with synthetic unit tests
  - deps:
      - golden-determinism-probe
      - golden-helpers-unit
    description: "Using tests/_golden.py from golden-helpers-unit and the probe
      report verdict. (1) Commit
      tests/data/golden/minimal_sample_project_findings.json +
      ..._tool_counts.json via the helper serialization, outside sample dir,
      never copied/linted; violations.txt RETAINED as oracle. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo
      (ruff-format write hazard). Bounded src allowance ONLY if probe proved
      test-side insufficient: runner/baseline.py relativize/sort +
      runner/parsers.py|_record_parsers.py ordering, <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest
      tests/test_golden.py -q` pass; regen twice byte-identical; golden+counts
      byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture
  - deps:
      - golden-snapshot-wiring
      - third-party-assumption-tests
      - consolidate-integration-helpers
    description: "Follow-up to consolidate (test-only, cannot touch docs/prod).
      Update AGENTS.md test/tool counts from stale base (1290 pass / 13 tools)
      to runtime actuals (verify: `uv run pytest --collect-only -q` count incl.
      new assumption/golden tests + len(TOOLS)==14), count lines only (epic owns
      AGENTS.md pipeline section, never touch); and
      src/python_setup_lint/runner/cli.py:314 help text ('all 13 tools' → 'all
      14 tools'). Prod scope strictly bounded to that one help string (no
      behavior change). No test changes; golden+counts byte-identical.
      Acceptance: counts match runtime; `uv run pytest tests/integration.py -v`
      passes; no new lint violations in touched lines."
    kind: dev
    milestoneId: M2
    slug: docs-counts-sync
    title: Sync AGENTS.md counts and cli help to 14-tool world
assumptions:
  - assumption: "'Material lint/check behavior' = findings {tool,file,line,col,rule}
      pinned by golden (PYTHON_SETUP_LINT_SEMANTIC=0) + checker unit tests; CLI
      flags/exit codes; baseline/autofix semantics; shipped configs/scopes.
      Other three limbs are pinned by surviving tests inventoried in M3 (CLI:
      tests/runner/test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*;
      configs/scopes: overlay + config tests) — if a limb has no surviving test
      the audit flags blocking debt. Reranker accept/reject decisions are not
      material; heuristic rejections (empty, boilerplate, brush-off, rule-echo)
      are material."
    disposition: confirm with human
    why: Intent replaces the model yet demands preservation; this boundary makes
      'preserve' mechanically testable per limb.
  - assumption: The git-stored decision cache belongs to the repo being linted
      (python-setup itself and consumers alike), at .python-setup-decisions.json
      next to lint.baseline. Only decisions committed; weights (0.03-0.8 GB, own
      licenses) stay in the user model cache.
    disposition: confirm with human
    why: Decisions depend on project content and must reproduce in that project's CI
      without the model.
  - assumption: Dev and CI do not install the `semantic` extra;
      sentence-transformers absent from .venv today. Gates run heuristic + cache
      hits; real-model tests are slow + with_real_api.
    why: Matches current .venv; keeps gates offline, fast, deterministic.
  - assumption: "tests/integration.py, `uv run pytest -q`, `uv run pytest
      tests/integration.py` and `uv run lint` are gate contracts: paths and
      commands do not change."
    why: Infra gates and AGENTS.md reference them; renaming silently breaks gating.
  - assumption: "'Never test linting' means pytest must not assert this repository
      passes its own lint gates — whether by re-running tools in subprocess, by
      AST/source scanning that re-implements a gate, or by config-consistency
      checks that re-lint the repo. `uv run lint` and pre-commit enforce that.
      Tests exercise logic on synthetic inputs and the sample project."
    disposition: confirm with human
    why: AST guards and config re-checks duplicate the gate and rot with rule churn;
      broadening the definition removes them with rationale.
  - assumption: "Only semantic-decision-model starts now;
      runner/checkers/setup-testing-scripts spawn at iteration-2 replan from M3
      audits. Root/epic sharing is narrowed: epic never writes tests/data (regen
      is a root iteration-2 item), AGENTS.md is split by section with a rebase
      prerequisite, tests/assumptions is append-only."
    why: No cross-epic machine edges exist; narrowing removes the write/write races
      by construction.
  - assumption: At least one model among GLiDE-0.4B and smaller Decision-Index
      models has compatible license, Python 3.14 CPU wheels and pinnable
      revision. Else the semantic epic escalates instead of shipping
      non-compliant.
    disposition: verify via semantic-decision-model spikes
    why: GLiDE uses a custom community license, tested on 3.12; smaller candidates
      vary.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker behind suppression-justification with a
      CPU-friendly small decision model plus a git-stored self-cleaning decision
      cache. Preserve every material behavior. Child epic of `modernize`.


      ## Scope (symbol-level; narrowed cross-epic protocol)

      Owned symbols/files: checkers/_semantic.py+.pyi and new private
      backend/cache modules (+.pyi each, @beartype, structlog kwargs,
      tach-clean); check_if_meaningful in checkers/_base.py+.pyi;
      _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject
      [semantic] extra + uv.lock + .gitignore semantic entries; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache modules,
      tests/checkers/conftest.py, new runtime-assumption modules under
      tests/assumptions/.

      Protocol with root: (a) NEVER write tests/data/** (no exception) — read
      golden for verification only; if heuristic outcomes shift, emit a shift
      report (which justification classes flip) + CHANGELOG behavior
      description, and root regenerates golden as an iteration-2 item; (b)
      AGENTS.md pipeline section only, applied onto HEAD containing root M2's
      merge (prerequisite), never touch count lines; (c) shared .py files:
      symbol ownership only; (d) tests/assumptions: append runtime modules only,
      never touch root's __init__ + 3 contract modules. Out of scope: other
      checkers/runner; tests/integration.py, tests/conftest.py (no edits). Any
      runner touch stays minimal + ADR.


      ## Requirements

      1. Spikes before design: (a) fact-finder candidate matrix (GLiDE-0.4B +
      Decision-Index smalls): license (exclude non-commercial), params/size,
      runtime with py3.14 CPU wheels linux/mac/win, vendored/pinned custom code
      (never unpinned trust_remote_code), offline behavior. (b) poc CPU-only:
      cold-load, warm latency, accuracy on labeled corpus (repo's real
      justifications + today's brush-off/meaningful tables); bar: >=90%
      accuracy, >=95% precision on meaningless, >=85% recall on meaningful;
      choose smallest model/prompt/threshold meeting bar, record in ADR. (c)
      test-assumptions: pylint 4.x invocation semantics; cache lock/merge/sweep
      conditional on result — if jobs>1 violates partial-run guarantee,
      constrain to jobs=1 (pinned by test) or per-worker sidecars, recorded in
      cache-design ADR (ADR-CACHE-01).

      2. Decision contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool and
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None
      (None=unavailable, heuristic stands). Public DecisionBackend Protocol
      decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD +
      PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional
      backend kwarg (public in .pyi); get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra or on failure: heuristic + cache
      hits, one warning, sentinel. Weights in user model cache, never git.
      PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root, definitive): JSON
      array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized (strip+collapse ws, keep case), rule (joined
      codes), model ('<id> rev <short12> prompt-vN', no bare hex>=20), decision,
      files (sorted POSIX relpaths)}. Key (justification,rule,model); context is
      model input only. Hits need no model. Writes: lockfile (O_CREAT|O_EXCL
      retry 5s) + merge + atomic temp+move. Sweep scoped to linted files; drop
      empty-files + stale-model entries. Isolation:
      PYTHON_SETUP_LINT_DECISIONS_PATH (tests->tmp, never repo cache). Must pass
      all tools incl. detect-secrets.

      5. Real suppressed codes: extract all codes from
      disable=/noqa:/ignore[...] via existing patterns; normalize (strip, split
      comma), sort, join ','; pass joined string as rule (bare-except keeps
      single 'bare-except-comment'). Rule-echo rejects if primary (lower,
      stripped) equals any element (lower). Cache key uses joined rule. If any
      heuristic outcome on the sample changes: do NOT touch golden; emit shift
      report + CHANGELOG behavior-change description (which justification
      classes flip, not the raw diff); root iteration-2 item regenerates.

      6. Tests: merge brush-off/meaningful/threshold tables into one
      parametrized table; FakeBackend via direct kwarg (units) and env-var
      (check_if_meaningful path); cache round-trip/cleanup/concurrency on tmp +
      hypothesis format round-trip; exactly one slow+with_real_api e2e; delete
      vacuous `is None or ...` assertions; modules <=500 lines, no suppressions;
      never test linting.

      7. Docs: update Scope list + CHANGELOG (user-visible only: extra contents,
      new/deprecated vars, cache file, behavior-change descriptions).


      ## Acceptance

      - Heuristic path unchanged: PYTHON_SETUP_LINT_SEMANTIC=0 sample lint
      equals golden (read-only verification).

      - Cache without model: no extra + cached false decision => W9704 emitted,
      no model load.

      - Brush-off never reaches model: 'pre-existing' + fake backend => False,
      backend uncalled.

      - One call per unique pair: miss + backend => exactly one call per unique
      (justification,rule), persisted sorted.

      - Scoped cleanup: suppression deleted from a.py => linting a.py removes
      entry; linting only b.py keeps it.

      - No retry storm: load fails => one attempt per process, heuristic
      results.

      - Gates: `uv run pytest -q`, `uv run pytest tests/integration.py -v`, `uv
      run lint` pass with empty lint.baseline.
    slug: semantic-decision-model
techDebt:
  - category: impacting
    description: Suppression/bare-except checkers pass their own symbol as `rule`;
      the rule-echo heuristic and model never see the actually-suppressed codes.
    id: TD-1
    resolution: "Semantic req5: extract all codes, pass comma-joined sorted string;
      echo matches any element; epic emits shift report + CHANGELOG behavior
      description, root iteration-2 item regenerates golden."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore; several assertions vacuous (`is None or ...`).
    id: TD-2
    resolution: "Semantic req6: FakeBackend via public Protocol (direct kwarg +
      dotted-path env injection); delete vacuous tests."
  - category: impacting
    description: tests/integration.py 627 lines + too-many-lines suppression;
      duplicates conftest/_autofix helpers; substring-only assertions miss
      drift.
    id: TD-3
    resolution: Probe + M1 pin exact findings with per-tool minimums; M2
      single-sources 10 helpers, moves overlay/setup/precommit scaffolding per
      budget, reaches <=500 without suppression.
  - category: impacting
    description: test_semantic_check.py 506 lines + suppression; heuristic tables
      duplicate test_semantic_threshold.py.
    id: TD-4
    resolution: "Semantic req6: one merged parametrized table; modules <=500."
  - category: adjacent
    description: ~15 checkers repeat structural suppressions (missing-beartype on
      register(), type:ignore[misc] on mixin classes) + copied stream
      read/decode.
    id: TD-5
    resolution: coding-rules-audit inventories; iteration-2 checkers epic fixes
      (base class, shared helper, typed register).
  - category: adjacent
    description: "Legacy/compat: baseline._FALLBACK_TOOLS/peek_fallback_tools,
      _compare_sorted re-export, astroid 3.x docstring fallback despite
      astroid>=4.0.4."
    id: TD-6
    resolution: Iteration-2 runner/checkers epics remove, guarded by golden.
  - category: adjacent
    description: "dispatch.py 500+ char rationale comment ending in `# pylint:
      disable=unjustified-suppression` suppresses the justification checker
      itself."
    id: TD-7
    resolution: "Iteration-2 runner epic: move rationale to design/0002, leave short
      justified comment."
  - category: adjacent
    description: tests/checkers/_factories.py ~1400 lines; ~40 pytest.param tables
      typed list[Any] with pasted justifications; cases far from tests.
    id: TD-8
    resolution: "Iteration-2 checkers epic per test-debloat-audit: ParameterSet
      typing, cases next to tests, split per checker."
  - category: adjacent
    description: Task-ID test names (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*,
      test_t3_*); repo-self-lint tests (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks) duplicate the `uv run lint`
      gate.
    id: TD-9
    resolution: "Iteration-2 epics per test-debloat-audit: rename by behavior;
      remove self-lint tests (broadened never-linting definition)."
  - category: adjacent
    description: "ADR locations disagree: CodingRules requires design/, factory ADRs
      go to docs/adr."
    id: TD-10
    resolution: "Iteration-2 replan: cross-reference (design/README or AGENTS.md
      index). No engine change."
  - category: adjacent
    description: Shipped rumdl.toml excludes tests/data, forcing the integration
      per-run rewrite to lint the sample AGENTS.md; affects golden determinism.
    id: TD-11
    resolution: coding-rules-audit inventories; iteration-2 runner epic fixes (e.g.
      narrow exclude); M1/M2 retain the override.
adrs:
  - consequences: Exact cheap regression detection; golden updates are explicit
      reviewed diffs. Message text not snapshotted. Tool upgrades may require
      reviewed regen. CI cannot silently rewrite. Positive-exit tool failures
      still surface via retained section/SKIPPED assertions, not via golden.
    context: Modernization enforces rules, debloats, swaps the semantic model while
      preserving material behavior. lint.baseline is empty; integration only
      checks planted rule-name presence, missing duplicates, moves, new false
      positives. violations.txt covers only pylint-custom + MD + duplicate-code
      rules.
    decision: "Commit Finding {tool,file?,line?,col?,rule} snapshot at
      tests/data/golden/minimal_sample_project_findings.json plus per-tool
      minimums at ..._tool_counts.json {tool: min_count}. Serialization:
      json.dump(indent=2, sort_keys=True) + trailing newline. Dedicated second
      run_lint capture (baseline=<tmp>/capture.json, overwrite) under
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0 with make_runner_config
      semantics; first run keeps rc!=0 and retains
      tool-section/SKIPPED/[CRASH]/W9705 assertions. Test-side normalize: drop
      msg, relativize vs project, strip './', backslash->'/', as_posix, assert
      non-absolute; sort/diff by None-safe finding_key mirroring
      _violation_sort_key (None file->'', None line/col->-1); Counter-multiset
      diff with sorted added/removed. Golden holds zero __CRASH__; any crash
      fails naming the tool. violations.txt retained as oracle; coverage = every
      oracle rule in golden AND every TOOLS entry meets its minimum count. Regen
      only via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1: pytest.fail under
      CI/GITHUB_ACTIONS ('refusing to rewrite golden under CI...'), warn +
      rewrite golden+counts otherwise, byte-identical across two runs, reviewed
      diff required. Drift injection = synthetic add/drop on in-memory list
      copies. Brush-off/carry are tool-qualified lookups (tool='pylint',
      file='src/minimal_sample/mod.py', line 49 present / line 56 absent)."
    id: ADR-001
    title: Golden findings snapshot as the behavior-preservation contract
  - consequences: Brush-off rejections guaranteed regardless of model; model can
      only tighten acceptance. sentence-transformers dropped; no-try-import
      patterns list the new runtime. Real-model coverage is one slow +
      with_real_api test. Old env var warns via CHANGELOG-documented
      deprecation.
    context: _semantic.py misuses a sentence-transformers cross-encoder as a quality
      judge. The dependency is heavy and absent in dev/CI, so the heuristic
      decides everything today. The intent asks for a CPU-friendly small
      decision model.
    decision: "Keep check_if_meaningful signature and PYTHON_SETUP_LINT_SEMANTIC.
      Heuristic runs first as a hard gate; rejections never reach the model.
      Accepted text goes to cache, then to a local decision model behind a
      public DecisionBackend Protocol decide(justification, rule, context) ->
      float P(meaningful) in [0,1]; decision = prob >= DECISION_THRESHOLD with
      PROMPT_VERSION='prompt-v1'. Injection without patching:
      semantic_check_if_meaningful gains optional backend kwarg (public in
      .pyi), and get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. Model/prompt/threshold
      chosen by spike under compatible license, Python 3.14 CPU wheels, pinned
      revision, no unpinned remote code, meeting bar: >=90% accuracy, >=95%
      precision on meaningless, >=85% recall on meaningful. Ships via `semantic`
      extra, configured by PYTHON_SETUP_LINT_DECISION_MODEL;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Backend
      unavailable returns None; heuristic stands."
    id: ADR-002
    title: Heuristic-gated local decision model for justification checks
  - consequences: W9704 reproducible across machines without the extra; decision
      changes are reviewable diffs. Small line-local merge conflicts possible.
      Consumer repos gain one committed file (install docs mention it); the file
      must pass all tools and not trip detect-secrets.
    context: Results cached in gitignored ~/.cache per-machine file, unbounded,
      keyed by 64-bit truncated SHA-256 including code context. Outcomes diverge
      across machines; stale entries never removed. Intent requires git-stored
      cache with cleanup.
    decision: "Store decisions in committed .python-setup-decisions.json at the
      linted project root (definitive, next to lint.baseline). Format: JSON
      array sorted by (rule, justification, model), indent=2, sort_keys=True.
      Entry {justification (normalized: strip + collapse whitespace, preserve
      case), rule (comma-joined sorted codes), model ('<id> rev <short12>
      prompt-vN', no bare hex >=20 chars), decision: bool, files: sorted POSIX
      relpaths}. Key is (justification, rule, model); context is model input
      only. Reads need no model. Writes: lockfile + merge-on-write + atomic
      temp+move (baseline pattern). Cleanup: mark-and-sweep scoped to linted
      files + drop empty-files and stale-model entries. Isolation via
      PYTHON_SETUP_LINT_DECISIONS_PATH. Lock/merge/sweep is conditional on the
      pylint-semantics spike; if jobs>1 violates the partial-run guarantee, the
      epic constrains to jobs=1 (pinned by test) or per-worker sidecars — the
      choice is recorded in the epic's cache-design ADR (ADR-CACHE-01). Weights
      stay in user model cache."
    id: ADR-003
    title: Git-stored, self-cleaning decision cache
  - consequences: Shared test infra never edited concurrently; debloat runs behind
      golden + assumptions. No machine-checkable cross-epic edges exist, so
      epic/root sharing is narrowed to non-write or prerequisite form; residual
      AGENTS.md/_base.py concurrent-edit risk is accepted with rebase
      discipline. Subsystem epics start one iteration later but scoped from
      evidence.
    context: Three workstreams span ~28.6k LOC. Parallel edits to shared test infra
      would conflict. Intent requires test infra/assumptions before debloat. The
      semantic epic shares surfaces with root (AGENTS.md, _base.py symbols,
      tests/assumptions, golden dir) but the engine has no cross-epic dependency
      edges.
    decision: "Iteration 1: root delivers golden net, test-infra consolidation,
      third-party assumption tests, read-only audits, and spawns
      semantic-decision-model now under a narrowed protocol: (a) the epic NEVER
      writes tests/data/** — golden regen after a semantic heuristic shift is a
      root iteration-2 item planned at replan from the epic's shift report (epic
      reads golden for verification only); (b) AGENTS.md: root M2 solely owns
      count lines, epic solely owns the pipeline section, and the epic's edit
      has prerequisite 'applies onto HEAD containing M2's merge' (epic never
      touches count lines); (c) shared .py files: symbol-level ownership, rest
      auditable; (d) tests/assumptions: root owns __init__ + 3 contract modules,
      epic appends runtime modules only. Iteration 2 (replan): re-glob HEAD,
      re-validate the unified ownership map (catches epic-created modules), then
      spawn runner/checkers/setup-testing-scripts epics. Policy: pytest never
      asserts this repo passes its own lint gates (no subprocess re-lint, no AST
      re-implementation, no config re-checks); `uv run lint` does that."
    id: ADR-004
    title: Progressive saga decomposition with narrowed cross-epic protocol


--- Prior Plan plan-1.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "tests/data/golden/minimal_sample_project_findings.json (sorted Finding
        array) + minimal_sample_project_tool_counts.json ({tool: min_count}).
        Serialization: json.dump(indent=2, sort_keys=True) + trailing newline.
        Outside sample dir, never copied/linted. violations.txt RETAINED as
        planted-rule oracle."
      - "tests/_golden.py (sole golden owner):
        UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN',
        SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str,
        file: str|None, line: int|None, col: int|None, rule: str};
        finding_key(f) None-safe (tool, file or '', line if int else -1, col if
        int else -1, rule) mirroring _violation_sort_key;
        collect_findings(config: RunnerConfig, capture_path:
        Path)->list[Finding] (run_lint with baseline=capture_path/overwrite,
        read JSON, normalize per record: drop msg, relativize vs project, strip
        './', backslash->'/', as_posix, assert non-absolute, sort by
        finding_key, assert len!=0); assert_matches_golden(findings,
        golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted
        added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden
        under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite
        golden+counts together); read_oracle_rules()->list[str];
        slice_tool_section(output, start, end)->str;
        assert_oracle_coverage(findings, rules)->None;
        assert_tool_coverage(findings, minimums)->None."
      - "Config side-effect contract: _make_config (M1) / make_runner_config
        (M2, identical) writes/overwrites <project>/rumdl.toml derived from
        config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same
        bytes on repeat); no-op when shipped rumdl.toml missing; OSError
        propagates. Caller (test) owns tmp dir, copy_sample, git-init, config
        build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0."
      - "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched
        AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions:
        __CRASH__/exit<0 records must be zero in golden; positive-exit tool
        failures with zero parsed records surface via section/SKIPPED
        assertions, not via golden."
    id: M1
    scenarios:
      - >-
        Scenario: Golden snapshot pins current behavior
          Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0
          When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)
          Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist
      - >-
        Scenario: Behavior drift is reported precisely
          Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)
          When `uv run pytest tests/integration.py -v` runs
          Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)
      - >-
        Scenario: Deterministic regeneration
          Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')
          When the golden test runs twice
          Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff
      - >-
        Scenario: Planted-rule and per-tool coverage preserved
          Given the golden, tool-counts, and violations.txt as oracle
          When coverage is checked
          Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists
      - >-
        Scenario: Crash/skip coverage retained outside golden
          Given the first run's output
          When checked
          Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears
    title: Golden lint-findings safety net (behavior-preservation contract)
  - directionalInterfaces:
      - "tests/_project_helpers.py (sole definition site): copy_sample_project,
        git_init_and_stage (test/test@test + add .), git_init_bare
        (Test/test@example.com, -q, no add), stage_file, commit_all,
        shipped_config_paths, make_runner_config,
        build_pylint_overlay_config(project, disable_rule)->Path,
        ensure_precommit_or_skip()->None,
        install_twice_assert_idempotent(project, monkeypatch)->None.
        Per-consumer imports: integration.py->{copy, git_init_and_stage,
        make_runner_config, build_overlay, ensure_precommit, install_twice};
        conftest.py->{shipped_config_paths} only;
        _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests
        outside tach bounds."
      - "tests/assumptions/__init__.py +
        {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contr\
        acts.py}: distinct classes
        TestAstroidContracts/TestPylintContracts/TestBeartypeContracts;
        pytestmark no_external_api. Root owns __init__ + these 3; semantic epic
        appends runtime modules only."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once
          Given tests/_project_helpers.py defining the helpers
          When tests/ is searched
          Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset
      - >-
        Scenario: Integration gate module within limits
          Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Third-party contracts pinned
          Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)
          When `uv run pytest tests/assumptions -q` runs
          Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api
      - >-
        Scenario: Assumption failures diagnose at the source
          Given assumption modules as sole pinning location
          When checker tests are searched
          Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place
    title: Test infrastructure and third-party assumptions baseline
  - directionalInterfaces:
      - "Row schemas: coding-rules {module, section, evidence file:line,
        category, est. LoC delta, owner, fix}; test-debloat {module, behaviors,
        duplicate-of, recommendation, surviving coverage, reason, owner}.
        Artifact = structured item-report tables (durable in orchestration
        records; no committed file); coding-rules-audit owns the unified
        disjoint-ownership map; test-debloat-audit reads it via inter-dep and
        aligns its owner column; iteration-2 replan re-globs HEAD (catching
        epic-created modules) and re-validates the map before spawning subsystem
        epics."
      - "Exclusions (marked skipped, everything else audited): src side:
        checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache
        modules (+.pyi), _base.py::check_if_meaningful (+stub section),
        no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline, tests/checkers/conftest.py
        (epic-created), tests/assumptions runtime/decision/cache modules
        (epic-created)."
    id: M3
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried
          Given CodingRules.md and AGENTS.md
          When the audit completes
          Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited
      - >-
        Scenario: Test redundancy inventoried
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map
      - >-
        Scenario: Ownership map is complete and disjoint
          Given both audit item reports
          When the unified map is checked
          Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners
    title: Modernization debt inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model meets all constraints (CPU-friendly,
      MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote
      code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community
      license, 0.81GB bf16, bundled `glide` pkg, tested on
      3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g.
      cc-by-nc-4.0 vs apache-2.0, ONNX exports)."
    id: U1
    spikeOutlines:
      - "semantic epic fact-finder: candidate matrix (license, params/size,
        runtime, py3.14 wheels, custom-code, pinnable revision)"
      - "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled
        corpus (repo justifications + test tables); smallest
        model/prompt/threshold meeting bar (>=90% acc, >=95%
        meaningless-precision, >=85% meaningful-recall)"
      - "semantic epic test-assumptions: install chosen runtime via `semantic`
        extra on 3.14, pin loader/inference API in tests/assumptions/"
  - description: "Git-stored cache behavior under concurrency/cleanup from inside
      pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint
      invocations sharing one project."
    id: U2
    spikeOutlines:
      - "semantic epic test-assumptions: pin pylint 4.x invocation/hook
        semantics; lock/merge/sweep design conditional on result (else jobs=1 or
        sidecars, recorded in ADR-CACHE-01)"
  - description: "Golden must be deterministic across runs/machines. Risks:
      duplicate-code ordering, detect-secrets over ls-files, pyright/mypy churn,
      absolute-path leakage."
    id: U3
    spikeOutlines:
      - "golden-determinism-probe (test-assumptions, pre-story): capture twice
        on temp copies, diff raw captures, report unstable fields + verdict +
        normalization spec"
      - golden-findings-snapshot implements probe's test-side normalization;
        bounded src allowance (baseline relativize/sort, parser ordering only,
        <=40 lines, determinism-only) applies ONLY if the probe proves test-side
        insufficient. Excluding any field that drops a planted oracle rule is
        forbidden without an ADR.
  - description: Size/shape of coding-rules debt in src/ and redundant/lint-testing
      tests in tests/ (~28.6k LOC) unknown; subsystem epics cannot be scoped
      yet.
    id: U4
    spikeOutlines:
      - coding-rules-audit (fact-finder)
      - test-debloat-audit (fact-finder)
itemOutlines:
  - description: "Probe golden determinism BEFORE the snapshot story (resolves U3).
      On two fresh temp copies (copy+git-init+_make_config, monkeypatched
      PYTHON_SETUP_LINT_SEMANTIC=0) run run_lint capture twice; diff raw
      captures field-by-field. Report: unstable fields (ordering, absolute
      paths, timestamps, churn), verdict (test-side normalization sufficient vs
      bounded src fix needed with exact scope), and the normalization spec the
      snapshot story implements. Runs captures on temp copies only — never bare
      `uv run lint` on the repo (ruff-format write hazard). No committed files;
      output is the item report consumed by golden-findings-snapshot."
    kind: test-assumptions
    milestoneId: M1
    slug: golden-determinism-probe
    title: Probe capture determinism on temp copies
  - description: "Make the integration gate pin exact behavior per the probe report.
      Dedicated capture run separate from the rc!=0 first run: caller owns tmp
      dir, copy_sample, git-init, _make_config (package_name + rumdl override),
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0; tests/_golden.py owns Finding,
      None-safe finding_key, collect_findings(config, capture_path) (run_lint +
      read capture + normalize + sort + assert len!=0), assert_matches_golden
      (Counter multiset diff, sorted added/removed;
      PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 pytest.fails under CI/GITHUB_ACTIONS,
      else warns + rewrites golden+counts; reviewed diff required),
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Serialization indent=2/sort_keys/trailing-newline.
      First run keeps rc!=0 AND retains tool-section/SKIPPED/[CRASH]/W9705
      assertions (positive-exit failures surface there, not in golden). Replace
      substring loop with golden equality + oracle/tool coverage (violations.txt
      RETAINED). Brush-off/carry as tool-qualified lookups (tool='pylint',
      mod.py:49 present / :56 absent). Drift injection on in-memory list copies.
      If probe proves test-side insufficient: bounded src allowance ONLY in
      runner/baseline.py (relativize/POSIX/sort) and
      runner/parsers.py|_record_parsers.py (ordering), <=40 added lines,
      determinism-only (no finding added/removed), reviewed diff in report.
      Acceptance: integration, `pytest -q`, `lint` pass, empty lint.baseline."
    kind: story
    milestoneId: M1
    slug: golden-findings-snapshot
    title: Golden snapshot of normalized lint findings
    deps:
      - golden-determinism-probe
  - description: "Create tests/assumptions/__init__.py + 3 modules with distinct
      classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts
      (pytestmark no_external_api), tests named
      test_<api>_given_<condition>_then_<expected>, asserting observed behavior
      at pinned versions. astroid: Module.stream().read() returns bytes|str
      (product decodes-if-bytes); doc_node is Const/JoinedStr when docstring
      present else None for module/class/function; nodes_of_class accepts a
      tuple and returns union in document order; Const/JoinedStr string nodes
      expose int fromlineno/end_lineno/col_offset/end_col_offset (asserted on a
      sample literal). pylint (third-party side, not first-party register):
      PyLinter.register_checker(checker) lifecycle incl. open()/close() call
      order (record observed); CheckerTestCase/UnittestLinter capture
      add_message output into release_messages (assert observed MessageTest
      shape); MessageDefinitionTuple leading fields (msgid, symbol, description)
      + record full arity. beartype: discovery contract — decorate a function
      with a TYPE_CHECKING-only forward-ref annotation, assert the OBSERVED
      outcome (call-time vs import-time vs checker-only), record in item report
      for M3. No src/ changes. Must NOT touch AGENTS.md (consolidate is sole
      counts owner)."
    kind: test-assumptions
    milestoneId: M2
    slug: third-party-assumption-tests
    title: Pin astroid/pylint/beartype contracts
  - description: "Extract into tests/_project_helpers.py: copy_sample_project,
      git_init_and_stage (init+config user test/test@test + `git add .`,
      integration/detect-secrets semantics), git_init_bare (init -q + config
      Test/test@example.com, no add, autofix semantics — identities NOT
      unified), stage_file, commit_all, shipped_config_paths, make_runner_config
      (package_name + rumdl override, preserving _make_config side-effect
      contract incl. idempotent overwrite and no-op when shipped rumdl missing),
      build_pylint_overlay_config(project, disable_rule)->Path,
      ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project,
      monkeypatch)->None. Delete duplicate defs in conftest.py and
      _autofix_helpers.py (import instead); integration.py imports only what it
      uses; test_self_lint_clean.py and autofix tests switch imports.
      Per-consumer map: integration->{copy, git_init_and_stage,
      make_runner_config, build_overlay, ensure_precommit, install_twice};
      conftest->{shipped_config_paths} only; _autofix->{git_init_bare,
      stage_file, commit_all} only. Line budget (must remove >=127, target
      <=490): helpers ~58 + oracle reader ~8 + overlay rewrite ~21 + setup
      scaffolding (fake _run_uv/install-twice) ~20 + precommit scaffolding
      (probe + validate/config blocks) ~25 + M1 loop/lookup net ~5 +
      section-slice ~3 + import/docstring trim ~4. integration.py keeps
      path/class/function names; golden+counts byte-identical; sole AGENTS.md
      counts owner (update counts incl. new assumption tests). Acceptance:
      integration, `pytest -q`, `lint` pass."
    kind: story
    milestoneId: M2
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
  - description: "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS.
      Semantic exclusions are symbol/file-level (mark skipped, audit rest
      normally): checkers/_semantic.py+.pyi, new
      _decision_backend/_decision_cache modules (+.pyi),
      _base.py::check_if_meaningful (+stub section),
      no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi
      fidelity/private symbols, @beartype + structural suppressions, trivial
      wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs
      (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export),
      over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules,
      rumdl tests/data-exclude hack (TD-11). Output: rows {module, section,
      evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED
      disjoint-ownership map (this audit is single owner; test-debloat-audit
      consumes it via inter-dep). Reads final state
      (post-golden/assumptions/consolidate) + beartype report."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: coding-rules-audit
    title: Inventory CodingRules violations
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
      - consolidate-integration-helpers
  - description: "Read-only audit of tests/**. Semantic exclusions (mark skipped):
      tests/checkers/test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline class, tests/checkers/conftest.py
      (epic-created), tests/assumptions runtime/decision/cache modules
      (epic-created). Per module: behaviors protected; duplicates (incl.
      golden-covered); CodingRules-Tests violations (first-party mocking,
      naming, markers, in-file fixtures, _factories.py list[Any] tables, far
      cases); repo-self-lint tests for removal (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks); slow/benchmark; task-ID
      names. Output: rows {module, behaviors, duplicate-of, recommendation
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag).
      Owner column aligned to coding-rules-audit's unified map (read via
      inter-dep)."
    kind: fact-finder
    milestoneId: M3
    replanAfter: true
    slug: test-debloat-audit
    title: Inventory redundant and lint-testing tests
    deps:
      - golden-findings-snapshot
      - third-party-assumption-tests
      - consolidate-integration-helpers
      - coding-rules-audit
assumptions:
  - assumption: "'Material lint/check behavior' = findings {tool,file,line,col,rule}
      pinned by golden (PYTHON_SETUP_LINT_SEMANTIC=0) + checker unit tests; CLI
      flags/exit codes; baseline/autofix semantics; shipped configs/scopes.
      Other three limbs are pinned by surviving tests inventoried in M3 (CLI:
      tests/runner/test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*;
      configs/scopes: overlay + config tests) — if a limb has no surviving test
      the audit flags blocking debt. Reranker accept/reject decisions are not
      material; heuristic rejections (empty, boilerplate, brush-off, rule-echo)
      are material."
    disposition: confirm with human
    why: Intent replaces the model yet demands preservation; this boundary makes
      'preserve' mechanically testable per limb.
  - assumption: The git-stored decision cache belongs to the repo being linted
      (python-setup itself and consumers alike), at .python-setup-decisions.json
      next to lint.baseline. Only decisions committed; weights (0.03-0.8 GB, own
      licenses) stay in the user model cache.
    disposition: confirm with human
    why: Decisions depend on project content and must reproduce in that project's CI
      without the model.
  - assumption: Dev and CI do not install the `semantic` extra;
      sentence-transformers absent from .venv today. Gates run heuristic + cache
      hits; real-model tests are slow + with_real_api.
    why: Matches current .venv; keeps gates offline, fast, deterministic.
  - assumption: "tests/integration.py, `uv run pytest -q`, `uv run pytest
      tests/integration.py` and `uv run lint` are gate contracts: paths and
      commands do not change."
    why: Infra gates and AGENTS.md reference them; renaming silently breaks gating.
  - assumption: "'Never test linting' means pytest must not assert this repository
      passes its own lint gates — whether by re-running tools in subprocess, by
      AST/source scanning that re-implements a gate, or by config-consistency
      checks that re-lint the repo. `uv run lint` and pre-commit enforce that.
      Tests exercise logic on synthetic inputs and the sample project."
    disposition: confirm with human
    why: AST guards and config re-checks duplicate the gate and rot with rule churn;
      broadening the definition removes them with rationale.
  - assumption: "Only semantic-decision-model starts now;
      runner/checkers/setup-testing-scripts spawn at iteration-2 replan from M3
      audits. Root/epic sharing is narrowed: epic never writes tests/data (regen
      is a root iteration-2 item), AGENTS.md is split by section with a rebase
      prerequisite, tests/assumptions is append-only."
    why: No cross-epic machine edges exist; narrowing removes the write/write races
      by construction.
  - assumption: At least one model among GLiDE-0.4B and smaller Decision-Index
      models has compatible license, Python 3.14 CPU wheels and pinnable
      revision. Else the semantic epic escalates instead of shipping
      non-compliant.
    disposition: verify via semantic-decision-model spikes
    why: GLiDE uses a custom community license, tested on 3.12; smaller candidates
      vary.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker behind suppression-justification with a
      CPU-friendly small decision model plus a git-stored self-cleaning decision
      cache. Preserve every material behavior. Child epic of `modernize`.


      ## Scope (symbol-level; narrowed cross-epic protocol)

      Owned symbols/files: checkers/_semantic.py+.pyi and new private
      backend/cache modules (+.pyi each, @beartype, structlog kwargs,
      tach-clean); check_if_meaningful in checkers/_base.py+.pyi;
      _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject
      [semantic] extra + uv.lock + .gitignore semantic entries; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache modules,
      tests/checkers/conftest.py, new runtime-assumption modules under
      tests/assumptions/.

      Protocol with root: (a) NEVER write tests/data/** (no exception) — read
      golden for verification only; if heuristic outcomes shift, emit a shift
      report (which justification classes flip) + CHANGELOG behavior
      description, and root regenerates golden as an iteration-2 item; (b)
      AGENTS.md pipeline section only, applied onto HEAD containing root M2's
      merge (prerequisite), never touch count lines; (c) shared .py files:
      symbol ownership only; (d) tests/assumptions: append runtime modules only,
      never touch root's __init__ + 3 contract modules. Out of scope: other
      checkers/runner; tests/integration.py, tests/conftest.py (no edits). Any
      runner touch stays minimal + ADR.


      ## Requirements

      1. Spikes before design: (a) fact-finder candidate matrix (GLiDE-0.4B +
      Decision-Index smalls): license (exclude non-commercial), params/size,
      runtime with py3.14 CPU wheels linux/mac/win, vendored/pinned custom code
      (never unpinned trust_remote_code), offline behavior. (b) poc CPU-only:
      cold-load, warm latency, accuracy on labeled corpus (repo's real
      justifications + today's brush-off/meaningful tables); bar: >=90%
      accuracy, >=95% precision on meaningless, >=85% recall on meaningful;
      choose smallest model/prompt/threshold meeting bar, record in ADR. (c)
      test-assumptions: pylint 4.x invocation semantics; cache lock/merge/sweep
      conditional on result — if jobs>1 violates partial-run guarantee,
      constrain to jobs=1 (pinned by test) or per-worker sidecars, recorded in
      cache-design ADR (ADR-CACHE-01).

      2. Decision contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool and
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None
      (None=unavailable, heuristic stands). Public DecisionBackend Protocol
      decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD +
      PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional
      backend kwarg (public in .pyi); get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra or on failure: heuristic + cache
      hits, one warning, sentinel. Weights in user model cache, never git.
      PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root, definitive): JSON
      array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized (strip+collapse ws, keep case), rule (joined
      codes), model ('<id> rev <short12> prompt-vN', no bare hex>=20), decision,
      files (sorted POSIX relpaths)}. Key (justification,rule,model); context is
      model input only. Hits need no model. Writes: lockfile (O_CREAT|O_EXCL
      retry 5s) + merge + atomic temp+move. Sweep scoped to linted files; drop
      empty-files + stale-model entries. Isolation:
      PYTHON_SETUP_LINT_DECISIONS_PATH (tests->tmp, never repo cache). Must pass
      all tools incl. detect-secrets.

      5. Real suppressed codes: extract all codes from
      disable=/noqa:/ignore[...] via existing patterns; normalize (strip, split
      comma), sort, join ','; pass joined string as rule (bare-except keeps
      single 'bare-except-comment'). Rule-echo rejects if primary (lower,
      stripped) equals any element (lower). Cache key uses joined rule. If any
      heuristic outcome on the sample changes: do NOT touch golden; emit shift
      report + CHANGELOG behavior-change description (which justification
      classes flip, not the raw diff); root iteration-2 item regenerates.

      6. Tests: merge brush-off/meaningful/threshold tables into one
      parametrized table; FakeBackend via direct kwarg (units) and env-var
      (check_if_meaningful path); cache round-trip/cleanup/concurrency on tmp +
      hypothesis format round-trip; exactly one slow+with_real_api e2e; delete
      vacuous `is None or ...` assertions; modules <=500 lines, no suppressions;
      never test linting.

      7. Docs: update Scope list + CHANGELOG (user-visible only: extra contents,
      new/deprecated vars, cache file, behavior-change descriptions).


      ## Acceptance

      - Heuristic path unchanged: PYTHON_SETUP_LINT_SEMANTIC=0 sample lint
      equals golden (read-only verification).

      - Cache without model: no extra + cached false decision => W9704 emitted,
      no model load.

      - Brush-off never reaches model: 'pre-existing' + fake backend => False,
      backend uncalled.

      - One call per unique pair: miss + backend => exactly one call per unique
      (justification,rule), persisted sorted.

      - Scoped cleanup: suppression deleted from a.py => linting a.py removes
      entry; linting only b.py keeps it.

      - No retry storm: load fails => one attempt per process, heuristic
      results.

      - Gates: `uv run pytest -q`, `uv run pytest tests/integration.py -v`, `uv
      run lint` pass with empty lint.baseline.
    slug: semantic-decision-model
techDebt:
  - category: impacting
    description: Suppression/bare-except checkers pass their own symbol as `rule`;
      the rule-echo heuristic and model never see the actually-suppressed codes.
    id: TD-1
    resolution: "Semantic req5: extract all codes, pass comma-joined sorted string;
      echo matches any element; epic emits shift report + CHANGELOG behavior
      description, root iteration-2 item regenerates golden."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore; several assertions vacuous (`is None or ...`).
    id: TD-2
    resolution: "Semantic req6: FakeBackend via public Protocol (direct kwarg +
      dotted-path env injection); delete vacuous tests."
  - category: impacting
    description: tests/integration.py 627 lines + too-many-lines suppression;
      duplicates conftest/_autofix helpers; substring-only assertions miss
      drift.
    id: TD-3
    resolution: Probe + M1 pin exact findings with per-tool minimums; M2
      single-sources 10 helpers, moves overlay/setup/precommit scaffolding per
      budget, reaches <=500 without suppression.
  - category: impacting
    description: test_semantic_check.py 506 lines + suppression; heuristic tables
      duplicate test_semantic_threshold.py.
    id: TD-4
    resolution: "Semantic req6: one merged parametrized table; modules <=500."
  - category: adjacent
    description: ~15 checkers repeat structural suppressions (missing-beartype on
      register(), type:ignore[misc] on mixin classes) + copied stream
      read/decode.
    id: TD-5
    resolution: coding-rules-audit inventories; iteration-2 checkers epic fixes
      (base class, shared helper, typed register).
  - category: adjacent
    description: "Legacy/compat: baseline._FALLBACK_TOOLS/peek_fallback_tools,
      _compare_sorted re-export, astroid 3.x docstring fallback despite
      astroid>=4.0.4."
    id: TD-6
    resolution: Iteration-2 runner/checkers epics remove, guarded by golden.
  - category: adjacent
    description: "dispatch.py 500+ char rationale comment ending in `# pylint:
      disable=unjustified-suppression` suppresses the justification checker
      itself."
    id: TD-7
    resolution: "Iteration-2 runner epic: move rationale to design/0002, leave short
      justified comment."
  - category: adjacent
    description: tests/checkers/_factories.py ~1400 lines; ~40 pytest.param tables
      typed list[Any] with pasted justifications; cases far from tests.
    id: TD-8
    resolution: "Iteration-2 checkers epic per test-debloat-audit: ParameterSet
      typing, cases next to tests, split per checker."
  - category: adjacent
    description: Task-ID test names (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*,
      test_t3_*); repo-self-lint tests (test_self_lint_clean.py,
      AST/source-scanning guards, config re-checks) duplicate the `uv run lint`
      gate.
    id: TD-9
    resolution: "Iteration-2 epics per test-debloat-audit: rename by behavior;
      remove self-lint tests (broadened never-linting definition)."
  - category: adjacent
    description: "ADR locations disagree: CodingRules requires design/, factory ADRs
      go to docs/adr."
    id: TD-10
    resolution: "Iteration-2 replan: cross-reference (design/README or AGENTS.md
      index). No engine change."
  - category: adjacent
    description: Shipped rumdl.toml excludes tests/data, forcing the integration
      per-run rewrite to lint the sample AGENTS.md; affects golden determinism.
    id: TD-11
    resolution: coding-rules-audit inventories; iteration-2 runner epic fixes (e.g.
      narrow exclude); M1/M2 retain the override.
adrs:
  - consequences: Exact cheap regression detection; golden updates are explicit
      reviewed diffs. Message text not snapshotted. Tool upgrades may require
      reviewed regen. CI cannot silently rewrite. Positive-exit tool failures
      still surface via retained section/SKIPPED assertions, not via golden.
    context: Modernization enforces rules, debloats, swaps the semantic model while
      preserving material behavior. lint.baseline is empty; integration only
      checks planted rule-name presence, missing duplicates, moves, new false
      positives. violations.txt covers only pylint-custom + MD + duplicate-code
      rules.
    decision: "Commit Finding {tool,file?,line?,col?,rule} snapshot at
      tests/data/golden/minimal_sample_project_findings.json plus per-tool
      minimums at ..._tool_counts.json {tool: min_count}. Serialization:
      json.dump(indent=2, sort_keys=True) + trailing newline. Dedicated second
      run_lint capture (baseline=<tmp>/capture.json, overwrite) under
      monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0 with make_runner_config
      semantics; first run keeps rc!=0 and retains
      tool-section/SKIPPED/[CRASH]/W9705 assertions. Test-side normalize: drop
      msg, relativize vs project, strip './', backslash->'/', as_posix, assert
      non-absolute; sort/diff by None-safe finding_key mirroring
      _violation_sort_key (None file->'', None line/col->-1); Counter-multiset
      diff with sorted added/removed. Golden holds zero __CRASH__; any crash
      fails naming the tool. violations.txt retained as oracle; coverage = every
      oracle rule in golden AND every TOOLS entry meets its minimum count. Regen
      only via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1: pytest.fail under
      CI/GITHUB_ACTIONS ('refusing to rewrite golden under CI...'), warn +
      rewrite golden+counts otherwise, byte-identical across two runs, reviewed
      diff required. Drift injection = synthetic add/drop on in-memory list
      copies. Brush-off/carry are tool-qualified lookups (tool='pylint',
      file='src/minimal_sample/mod.py', line 49 present / line 56 absent)."
    id: ADR-001
    title: Golden findings snapshot as the behavior-preservation contract
  - consequences: Brush-off rejections guaranteed regardless of model; model can
      only tighten acceptance. sentence-transformers dropped; no-try-import
      patterns list the new runtime. Real-model coverage is one slow +
      with_real_api test. Old env var warns via CHANGELOG-documented
      deprecation.
    context: _semantic.py misuses a sentence-transformers cross-encoder as a quality
      judge. The dependency is heavy and absent in dev/CI, so the heuristic
      decides everything today. The intent asks for a CPU-friendly small
      decision model.
    decision: "Keep check_if_meaningful signature and PYTHON_SETUP_LINT_SEMANTIC.
      Heuristic runs first as a hard gate; rejections never reach the model.
      Accepted text goes to cache, then to a local decision model behind a
      public DecisionBackend Protocol decide(justification, rule, context) ->
      float P(meaningful) in [0,1]; decision = prob >= DECISION_THRESHOLD with
      PROMPT_VERSION='prompt-v1'. Injection without patching:
      semantic_check_if_meaningful gains optional backend kwarg (public in
      .pyi), and get_backend() honors test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. Model/prompt/threshold
      chosen by spike under compatible license, Python 3.14 CPU wheels, pinned
      revision, no unpinned remote code, meeting bar: >=90% accuracy, >=95%
      precision on meaningless, >=85% recall on meaningful. Ships via `semantic`
      extra, configured by PYTHON_SETUP_LINT_DECISION_MODEL;
      PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Backend
      unavailable returns None; heuristic stands."
    id: ADR-002
    title: Heuristic-gated local decision model for justification checks
  - consequences: W9704 reproducible across machines without the extra; decision
      changes are reviewable diffs. Small line-local merge conflicts possible.
      Consumer repos gain one committed file (install docs mention it); the file
      must pass all tools and not trip detect-secrets.
    context: Results cached in gitignored ~/.cache per-machine file, unbounded,
      keyed by 64-bit truncated SHA-256 including code context. Outcomes diverge
      across machines; stale entries never removed. Intent requires git-stored
      cache with cleanup.
    decision: "Store decisions in committed .python-setup-decisions.json at the
      linted project root (definitive, next to lint.baseline). Format: JSON
      array sorted by (rule, justification, model), indent=2, sort_keys=True.
      Entry {justification (normalized: strip + collapse whitespace, preserve
      case), rule (comma-joined sorted codes), model ('<id> rev <short12>
      prompt-vN', no bare hex >=20 chars), decision: bool, files: sorted POSIX
      relpaths}. Key is (justification, rule, model); context is model input
      only. Reads need no model. Writes: lockfile + merge-on-write + atomic
      temp+move (baseline pattern). Cleanup: mark-and-sweep scoped to linted
      files + drop empty-files and stale-model entries. Isolation via
      PYTHON_SETUP_LINT_DECISIONS_PATH. Lock/merge/sweep is conditional on the
      pylint-semantics spike; if jobs>1 violates the partial-run guarantee, the
      epic constrains to jobs=1 (pinned by test) or per-worker sidecars — the
      choice is recorded in the epic's cache-design ADR (ADR-CACHE-01). Weights
      stay in user model cache."
    id: ADR-003
    title: Git-stored, self-cleaning decision cache
  - consequences: Shared test infra never edited concurrently; debloat runs behind
      golden + assumptions. No machine-checkable cross-epic edges exist, so
      epic/root sharing is narrowed to non-write or prerequisite form; residual
      AGENTS.md/_base.py concurrent-edit risk is accepted with rebase
      discipline. Subsystem epics start one iteration later but scoped from
      evidence.
    context: Three workstreams span ~28.6k LOC. Parallel edits to shared test infra
      would conflict. Intent requires test infra/assumptions before debloat. The
      semantic epic shares surfaces with root (AGENTS.md, _base.py symbols,
      tests/assumptions, golden dir) but the engine has no cross-epic dependency
      edges.
    decision: "Iteration 1: root delivers golden net, test-infra consolidation,
      third-party assumption tests, read-only audits, and spawns
      semantic-decision-model now under a narrowed protocol: (a) the epic NEVER
      writes tests/data/** — golden regen after a semantic heuristic shift is a
      root iteration-2 item planned at replan from the epic's shift report (epic
      reads golden for verification only); (b) AGENTS.md: root M2 solely owns
      count lines, epic solely owns the pipeline section, and the epic's edit
      has prerequisite 'applies onto HEAD containing M2's merge' (epic never
      touches count lines); (c) shared .py files: symbol-level ownership, rest
      auditable; (d) tests/assumptions: root owns __init__ + 3 contract modules,
      epic appends runtime modules only. Iteration 2 (replan): re-glob HEAD,
      re-validate the unified ownership map (catches epic-created modules), then
      spawn runner/checkers/setup-testing-scripts epics. Policy: pytest never
      asserts this repo passes its own lint gates (no subprocess re-lint, no AST
      re-implementation, no config re-checks); `uv run lint` does that."
    id: ADR-004
    title: Progressive saga decomposition with narrowed cross-epic protocol


--- Prior Plan plan-2.1.yaml ---
iteration: 2
milestones:
  - directionalInterfaces:
      - "_RuffFormatLintTool(LintTool) in runner/dispatch.py:
        build_command(config,_path,_exclude)->check mode
        ['ruff','format','--check','--config',<resolved ruff.toml>,...paths]
        (default); build_format_command(...)->mutating mode without --check.
        cli.py phase-1a calls build_format_command (fix-only), normal pass calls
        build_command. runner/_config.py maps 'ruff format'->ruff.toml;
        _config_flag_for handles it. No if-spec.name in _build_command."
      - "Registry invariants owned by runner/dispatch.py, re-exported via
        runner/__init__.py: EXPECTED_TOOL_NAMES (14); FORMATTER_ONLY={'ruff
        format'} (statistics-exempt); STATISTICS_PARSER_TOOLS (13);
        RECORD_PARSER_TOOLS (9); RECORDLESS_TOOLS={tach
        check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
        intentional. Tests import from python_setup_lint.runner. Migration:
        test_lint_runner set+count 13->14; _factories_extras 13->14; stats + t3
        assert STATISTICS set; fakes invariants assert EXPECTED set."
      - "Docs contract: every in-scope tool-count site -> 14 by grep `13[
        -]?tools?|all_13|== 13` with per-hit disposition:
        AGENTS.md:9,43,63,92,93 + counts table :10-11; README.md:17,58;
        docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
        runner/__init__.py:3; cli.py:314; tests/runner/_factories.py:46;
        _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
        test_extra_tools.py:237; test_self_lint_clean.py:3;
        test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
        test_testing_fakes.py:137,165; plus any further tool-count grep hit.
        EXCLUDED (stays 13): CHANGELOG.md:104 historical. Allowlist:
        MD013/130/v0.13 and other non-tool-count 13s. tool_counts.json asserted
        14 keys incl 'ruff format':0 (verify, not rewrite)."
    id: M1
    scenarios:
      - >-
        Scenario: Gates green per-gate
          Given clean HEAD with empty lint.baseline
          When format gate exits 0 (all files formatted; set derived via git ls-files, count not pinned), lint gate reports zero violations in src/** and tests/**, `pytest -q` exits 0, integration exits 0, and secrets-triage-spike records its verdict
          Then all gates pass: the 6 named tool-count tests fixed (test_tool_spec_given_known_tools_then_present, test_tool_spec_given_tools_then_autofix_and_no_duplicates, test_statistics_parsers_given_all_tools_then_covered, test_parser_completeness_given_all_tools_then_have_parser, test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched], test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]), SIM102/R0914/C0208 fixed with no new violations, lint.baseline stays [], and factory-journal secrets are owned by the spike verdict (human-async), not dev acceptance
      - >-
        Scenario: Lint check-only without --fix
          Given a clean worktree
          When `uv run lint` runs without --fix
          Then `git status --porcelain` is empty; a command spy shows the normal-pass ruff-format cmd contains --check and --config with a resolved existing path (composed temp accepted, no literal match), and the mutating format cmd (phase-1a) runs only under --fix without --check
      - >-
        Scenario: Registry single-sourced
          Given the TOOLS table
          When tests and docs read the tool count
          Then every in-scope tool-count assertion reads 14 from EXPECTED_TOOL_NAMES with FORMATTER_ONLY/RECORDLESS exemptions explicit; verification is the tool-count grep with per-hit disposition and allowlist; no in-scope hit remains 13
    title: Green baseline and 14-tool runner contract
  - directionalInterfaces:
      - "tests/_project_helpers.py sole site, 11 helpers with pinned
        names/signatures: copy_sample_project(dest_parent: Path)->Path
        (dest_parent.mkdir(parents=True, exist_ok=True); copytree
        tests/data/minimal_sample_project -> dest_parent/'project'; returns
        project path); git_init_and_stage(project: Path)->None (test/test@test +
        add .); shipped_config_paths()->dict[str,Path];
        make_runner_config(project: Path)->RunnerConfig (minimal_sample + rumdl
        override idempotent, no-op if shipped rumdl missing); git_init_bare(cwd:
        Path)->None (Test/test@example.com, -q, no add);
        write_project_file(cwd,rel,content)->Path; stage_file(cwd,rel)->None;
        commit_all(cwd,msg='init')->None; build_pylint_overlay_config(project:
        Path, disable_rule: str)->Path; ensure_precommit_or_skip()->None;
        install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
        _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
        _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
        shipped_config_paths def entirely (no re-export); rewrite
        test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
        tests._project_helpers import ...`; integration.py consumes
        make_runner_config + mapped subset. Cycle guard: _project_helpers
        imports stdlib + python_setup_lint.runner/setup/testing only, never
        tests.conftest/tests.integration. Test class/function names unchanged;
        helper renames per matrix only."
      - "tests/_golden.py: collect_findings(project,*,config)->list[Finding]
        keeps tool order (no sort, synthetic-empty safe); sorting in
        serialize_write + _diff_keys; caller test_setup_new_and_lint asserts
        len(findings)!=0 post-collect and retains first-run [CRASH]-absent +
        SKIPPED-only-package_name asserts; no Finding __CRASH__ sentinel;
        assert_matches_golden Counter-multiset + UPDATE guard (fail under
        CI/GITHUB_ACTIONS); slice_tool_section(output,'[pylint]','[pylint-pyi]')
        used by overlay test; read_oracle_rules, assert_oracle_coverage,
        assert_tool_coverage retained. Determinism proven by temp-copy
        double-collect (two fresh temp copies, sha256 of serialized findings
        equal each other and equal committed golden hash); UPDATE_GOLDEN=1 never
        touches committed files except reviewed regen."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once per matrix
          Given tests/_project_helpers.py
          When tests/ is searched
          Then each of the 11 helpers is defined exactly once there (copy with mkdir-parents), duplicates in conftest.py and _autofix_helpers.py are deleted, the 2 conftest importers are rewritten to _project_helpers, each consumer imports only its mapped subset, _project_helpers imports nothing from tests.conftest/tests.integration, and stay-symbols are untouched
      - >-
        Scenario: Integration gate within single limit
          Given >=161 lines removed (661-><=500: helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with :12 too-many-lines removed via extraction and :202 stale too-many-locals disable deleted directly (globally disabled in config/.pylintrc-tests:39; verify pylint tests + W9704 clean), test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Golden hardening via caller asserts
          Given the committed golden
          When integration runs plus synthetic drift injection plus temp-copy double-collect
          Then findings serialize sorted with caller len!=0, zero [CRASH], SKIPPED only package_name, drift names exact added/removed keys, oracle + per-tool coverage hold, both temp-copy hashes equal the committed hash without mutating committed files, and the overlay test uses the shared slicer
    title: Test infra consolidation and golden hardening
  - directionalInterfaces:
      - "Eval contract: decide(justification,rule,context)->float P(meaningful)
        in [0,1]; mapping: justification=primary=(comment or text).strip(),
        rule=joined suppressed codes (spike uses current rule symbol where codes
        unavailable, recorded), context=code_context (None allowed);
        decision=prob>=threshold. Modes: veto: final=heuristic(text) AND
        (prob>=threshold) (model only flips True->False; heuristic-False never
        reaches model); replace: final=(prob>=threshold), heuristic deleted.
        Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency).
        Corpus: threshold 30+50 + brush-off/meaningful tables + N real repo
        suppressions, DEDUPED by normalized justification (target >=100
        post-dedup), stratified heuristic-rejected (easy) vs heuristic-accepted
        (model-decides); rubric (specific technical justification vs
        placeholder/deferral/brush-off); per-source + per-stratum breakdown.
        Bars >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall
        apply to the heuristic-accepted stratum (overall also reported). Report
        per-candidate at 0.5/0.6/0.7 in both modes; all matrix candidates scored
        or explicitly excluded."
      - "Cache contract (spike-chosen): tracked JSON array sorted by
        (rule,justification,model), indent=2 sort_keys=True; unified entry
        {justification, rule, model '<id> rev <short12> prompt-vN', decision,
        files sorted POSIX} + spike-decided {version, prompt hash, last-seen?};
        key (justification,rule,model) with secrets-clean encoding (no bare
        hex>=20, detect-secrets clean); normal lint zero writes (hash/mtime
        assert); refresh command/flag only (lockfile + merge + atomic,
        CI-guarded, DECISIONS_PATH isolation); prune empty-files + stale-model."
      - "Pylint/concurrency contract (writer-first): identify writer (checker
        open/close vs runner post-process) + write timing (per-visit vs
        end-of-run) + --path scoping across 3 sequential pylint invocations (no
        -j, no contention); verdict derives crash-safe lock/merge/atomic vs
        no-lock runner merge vs jobs=1/sidecars-if--j."
    id: M3
    scenarios:
      - >-
        Scenario: Model choice is evidence-based over all candidates
          Given the deduped labelled corpus (>=100 post-dedup, rubric + per-source + per-stratum split)
          When the poc scores GLiDE, decider-nano, bekko-17m, ettin-150m, MiniLM at 0.5/0.6/0.7 in veto and replace modes (or records explicit exclusion)
          Then the report cites the 90/95/85 bars per threshold per stratum (compliance on heuristic-accepted stratum) and recommends the smallest compliant model+prompt+threshold+mode or a no-go with evidence
      - >-
        Scenario: Cache deterministic-given-cache+model
          Given the proposed schema on a temp copy
          When W9704 runs with model absent, present-miss, and cache-hit
          Then heuristic-rejected verdicts are identically False without model contact, accepted+hit equals the persisted model verdict, accepted+miss+absent equals heuristic True, prune drops stale/deleted entries, and normal lint shows zero writes by hash
      - >-
        Scenario: Writer and timing pinned before lock design
          Given pylint 4.x invocation tests
          When writer + timing + --path scoping are pinned
          Then the cache lock/merge/sweep design is derived (crash-safe atomic vs runner merge vs jobs=1/sidecars-if--j) with --path-scoped sweep
    title: Decision-model and git-cache design spikes
  - directionalInterfaces:
      - "Replan input contract: audits emit structured tables in item reports
        (engine-durable orchestration records: items/*/assignment + wave reports
        + decisions/, readable at replan per the task status contract);
        iteration-3 replan consumes reports + re-globs HEAD for validation only
        (no committed map; fact-finders write nothing; escape hatch = kind
        change to committed artifact if the engine ever drops reports). Owner
        enum {runner,checkers,setup-testing,semantic,root}. Ownership universe =
        src/** + scripts/** + tests/** EXCLUDING tests/data/**
        (stubs/conftest/__init__/_factories included; stub follows .py).
        Root-owned group (epics read-only): tests/data/** (golden,
        minimal_sample, oracles; golden regen only by root item), config/**,
        docs/**, repo-root files. Every universe file appears exactly once with
        exactly one owner; root-owned listed as a group."
      - "File ownership separate from symbol exclusions: ownership is
        whole-file; skips live in an exclusion column (src: _semantic.py+.pyi,
        _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS; tests:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline). Planned-path reservations (new
        backend/cache modules, epic conftest/runtime modules) listed separately,
        not globbed."
    id: M4
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried with disjoint ownership
          Given CodingRules.md and AGENTS.md
          When the audit completes on final HEAD (M1+M2 merged)
          Then every ownership-universe file is listed with violations plus exactly-once owner, the root-owned group (tests/data, config, docs) is listed once, semantic symbols are marked skipped in the exclusion column, and planned paths are reserved
      - >-
        Scenario: Test redundancy inventoried with pinning limbs
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, repo-self-lint tests are listed for removal, each material limb names pinning tests or blocking debt, and owners align to the unified map
      - >-
        Scenario: Replan input is complete and validatable
          Given both audit reports plus HEAD
          When the iteration-3 replan re-globs HEAD
          Then every universe file validates against exactly one owner, the root-owned group matches, exclusions reference existing symbols, and reservations name only planned paths
    title: Debloat inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model (if any) meets license + CPU + py3.14 +
      90/95/85 bars on the heuristic-accepted stratum is unknown. GLiDE-0.4B:
      Fastino license, 0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17.
      Apache alternatives vary in accuracy/license/CPU proof. No CPU benchmark
      exists here; mapping/modes/metric now pinned, corpus deduped + stratified
      by the spike."
    id: U1
    spikeOutlines:
      - "model-candidate-matrix (fact-finder): license, params/size, runtime,
        py3.14 wheels, custom-code, pinnable revision; excludes CC-BY-NC, flags
        Fastino/unclear"
      - "model-eval-poc (poc, CPU-only): ALL candidates at 0.5/0.6/0.7 in veto +
        replace modes on >=100 deduped corpus with rubric; compliance on
        heuristic-accepted stratum; smallest compliant
        model/prompt/threshold+mode or no-go"
      - "decision-runtime-pinning (test-assumptions, conditional on eval):
        py3.14 CPU wheels + import/device/offline + custom-code pinning for the
        chosen runtime (skip on no-go)"
  - description: "Cache key encoding, schema extras, prune/update semantics, writer
      identity/timing, and --path scoping are unknown. Open: secrets-clean
      encoding (not full hex), version/prompt-hash/last-seen fields, refresh
      command, CI guard, checker- vs runner-side writer, write timing, sweep
      scope."
    id: U2
    spikeOutlines:
      - "pylint-cache-assumptions (test-assumptions, writer-first): pin writer +
        timing + --path scoping across sequential invocations; verdict derives
        lock/merge/atomic vs runner merge vs jobs=1/sidecars-if--j"
      - "cache-design-spike (poc on temp copies, consumes writer verdict):
        unified schema + spike-chosen encoding + prune + refresh/CI/isolation +
        deterministic-given-cache+model proof with hash-asserted zero
        normal-lint writes"
  - description: Size/shape of coding-rules debt (~8.9k src LOC) and
      redundant/lint-testing tests (~18.4k test LOC, 772 tests) unmeasured;
      subsystem epics need the unified map with file-vs-symbol separation,
      root-owned groups, and planned-path reservations.
    id: U3
    spikeOutlines:
      - coding-rules-audit (fact-finder on final M1+M2 HEAD, single owner of
        unified map + exclusion column + reservations)
      - test-debloat-audit (fact-finder, aligned via inter-dep; per-limb pinning
        inventory)
  - description: "detect-secrets flags on clean checkout are of unknown source:
      tracked factory runtime journals (environmental) vs a real secret. The
      exclusion mechanism (engine config vs gate flag) is also unknown, so M1
      lint-green cannot be defined for that tool until triaged."
    id: U4
    spikeOutlines:
      - "secrets-triage-spike (fact-finder, no repo writes): clean-checkout
        scan, flagged files + sha256 + verdict environmental-vs-real + exact
        exclusion mechanism; human-async operator request if environmental"
itemOutlines:
  - deps: []
    description: "Retain 14. (1) Add _RuffFormatLintTool(LintTool) in dispatch.py:
      build_command -> check mode (--check + --config resolved ruff.toml);
      build_format_command -> mutating mode; register in _strategy_for; map
      'ruff format'->ruff.toml in _config.py + _config_flag_for. cli.py phase-1a
      calls build_format_command, normal pass calls build_command. No
      if-spec.name in _build_command. (2) Registry: EXPECTED_TOOL_NAMES +
      FORMATTER_ONLY + STATISTICS/RECORD/RECORDLESS sets owned by dispatch.py,
      re-exported via runner/__init__; migrate the 6 named tests
      (test_lint_runner set+count; _factories_extras len+id; stats + t3 to
      STATISTICS set with FORMATTER_ONLY exemption; fakes invariants to EXPECTED
      set). (3) Docs: migrate every in-scope tool-count site to 14 with per-hit
      report (AGENTS.md:9,43,63,92,93 + counts :10-11; README.md:17,58;
      docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
      runner/__init__.py:3; cli.py:314; _factories.py:46;
      _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
      test_extra_tools.py:237; test_self_lint_clean.py:3;
      test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
      test_testing_fakes.py:137,165; plus any further tool-count grep hit).
      CHANGELOG.md:104 stays 13 (historical); MD013/130/v0.13 allowlisted.
      Assert tool_counts.json already 14 keys (not rewrite). Verify:
      format/lint/pytest/integration exit 0; git status --porcelain empty after
      `uv run lint` (no --fix); spy asserts normal-pass cmd has --check +
      --config with resolved existing path (composed temp accepted) and phase-1a
      omits --check (fix-only); golden byte-identical; baseline []."
    kind: story
    milestoneId: M1
    prodBudgetHint: 60
    slug: runner-format-contract
    title: Ruff format strategy and 14-tool registry fix
  - deps:
      - runner-format-contract
    description: "Serialized after runner-format-contract (shared cli.py ownership;
      applies onto the phase-1a call-site shape). Behavior-preserving refactors,
      baseline stays []: (1)
      src/python_setup_lint/checkers/stub/coverage.py:196-198 SIM102 (elif
      TypeAlias + nested if AssignName) -> single combined condition. (2)
      cli.py:50 _run_tool_pipeline 23-><=20 locals by extracting phase/select
      helpers (no pipeline semantics change). (3)
      tests/runner/_factories_extras.py:383 C0208 set-iteration -> sequence
      type. Secrets explicitly OUT of scope (owned by secrets-triage-spike).
      Verify: lint gate reports zero violations in src/** and tests/**; pytest +
      integration show no new failures; golden byte-identical."
    kind: story
    milestoneId: M1
    prodBudgetHint: 35
    slug: baseline-violations-fix
    title: Fix SIM102, too-many-locals, C0208
  - deps: []
    description: "No repo edits; report only. On clean checkout run the declared
      lint gate / detect-secrets scan; capture every flagged file + sha256 +
      baseline entry. Verdict: environmental (only tracked factory runtime
      journals) vs real secret. If environmental: specify the exact exclusion
      mechanism (engine config vs gate command flag) + evidence hashes, and
      record the operator/engine exclusion request as human-async (M1 dev
      acceptance does not wait on it). If real: specify redact/rotate follow-up.
      Output feeds M1 acceptance + U4."
    kind: fact-finder
    milestoneId: M1
    prodBudgetHint: 0
    slug: secrets-triage-spike
    title: Triage detect-secrets factory-journal flags
  - deps: []
    description: "Tests-only (tests/** ONLY; FORBIDDEN lint.baseline, AGENTS.md,
      docs/**, src/**). Red-test-exempt. Create tests/_project_helpers.py per
      matrix (11 helpers): copy_sample_project(dest_parent)->Path [mkdir
      parents, copytree tests/data/minimal_sample_project ->
      dest_parent/'project', ex _copy_sample]; git_init_and_stage(project)->None
      [test/test@test + add ., ex _init_git]; shipped_config_paths()->dict [ex
      _shipped_config_paths]; make_runner_config(project)->RunnerConfig
      [minimal_sample + rumdl override idempotent, no-op if shipped rumdl
      missing, ex _make_config]; git_init_bare(cwd)->None [Test/test@example.com
      -q no add, ex _git_init]; write_project_file(cwd,rel,content)->Path [ex
      _write_file]; stage_file(cwd,rel)->None [ex _stage];
      commit_all(cwd,msg)->None [ex _commit_all];
      build_pylint_overlay_config(project,disable_rule)->Path [extract overlay
      217-240]; ensure_precommit_or_skip()->None;
      install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
      _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
      _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
      shipped_config_paths def entirely (no re-export); rewrite
      test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
      tests._project_helpers import ...`; integration.py uses make_runner_config
      + mapped subset. Cycle guard: _project_helpers imports stdlib +
      python_setup_lint.runner/setup/testing only, never
      tests.conftest/tests.integration. Test class/function names unchanged.
      Budget: >=161 removed (661-><=500): helpers 57 + overlay 28 +
      setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 +
      import/trim 8 = 163. Remove :12 too-many-lines via extraction; delete :202
      stale too-many-locals disable directly (globally disabled in
      config/.pylintrc-tests:39; verify pylint tests + W9704 clean). Verify:
      diff stat tests/** only; golden diff empty; integration + test_golden
      pass; touched files format-clean."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
  - deps:
      - consolidate-integration-helpers
    description: "Tests-only hardening, committed files never mutated by proofs. No
      __CRASH__ sentinel and no sort-in-collect: keep collect tool-order;
      sorting stays in serialize_write + _diff_keys; add caller asserts in
      test_setup_new_and_lint (len(findings)!=0 post-collect; first-run [CRASH]
      absent + SKIPPED only package_name retained); keep Counter-multiset diff +
      UPDATE guard + oracle/tool coverage; use
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test;
      extend tests/test_golden.py synthetic coverage (ordering, POSIX, diff
      keys, CI-guard, coverage, byte-format, empty-list safe). Determinism via
      temp-copy double-collect: collect+serialize on two fresh temp copies,
      sha256 hashes equal each other and equal committed golden hash.
      UPDATE_GOLDEN=1 never touches committed files except reviewed regen.
      Verify: integration + test_golden pass; golden+counts byte-identical."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: golden-contract-hardening
    title: Harden golden via caller asserts and shared slicer
  - deps: []
    description: "No repo edits; report only. Matrix for GLiDE-0.4B,
      tasksource-decider-nano, bekko-17m, ettin-150m + MiniLM baseline: license,
      params/weights, runtime stack, py3.14 CPU wheels (linux/mac/win),
      custom-code/vendoring burden, pinnable revision, offline behavior. Exclude
      CC-BY-NC; flag Fastino + bekko-unclear-license for human review. Output
      feeds eval-poc (all candidates) + cache spike (model-id/rev format) +
      runtime pinning."
    kind: fact-finder
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-candidate-matrix
    title: Decision-model candidate matrix
  - deps:
      - model-candidate-matrix
    description: "No committed code; report only (temp venv/copy permitted, network
      inside spike only). Mapping: justification=primary=(comment or
      text).strip(), rule=joined suppressed codes (current rule symbol where
      codes unavailable, recorded), context=code_context (None allowed);
      decision=prob>=threshold. Modes: veto final=heuristic AND
      (prob>=threshold); replace final=(prob>=threshold). Smallest=lexicographic
      (params, weights bytes, CPU RSS, p50 latency). Corpus: threshold 30+50 +
      brush-off/meaningful tables + N real repo suppressions, DEDUPED by
      normalized justification (target >=100 post-dedup), stratified
      heuristic-rejected (easy) vs heuristic-accepted (model-decides); rubric:
      specific technical justification vs placeholder/deferral/brush-off;
      per-source + per-stratum breakdown. Score ALL matrix candidates at
      0.5/0.6/0.7 in BOTH modes (or record explicit exclusion): accuracy,
      meaningless-precision, meaningful-recall, CPU p50/p95 + RSS. Compliance
      bars (>=90% acc / >=95% meaningless-precision / >=85% meaningful-recall)
      apply to the heuristic-accepted stratum (overall also reported). Recommend
      smallest compliant model+prompt+threshold+mode, or no-go with evidence."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-eval-poc
    title: CPU accuracy/latency evaluation over all candidates
  - deps:
      - model-candidate-matrix
      - pylint-cache-assumptions
    description: "Prototype on temp copies only; no committed files. Consumes
      writer-first verdict. Design unified tracked schema: JSON array sorted by
      (rule,justification,model), indent=2 sort_keys; entry {justification,
      rule, model '<id> rev <short12> prompt-vN', decision, files sorted POSIX}
      + spike-decided {version, prompt hash, last-seen?}; key
      (justification,rule,model) with spike-chosen secrets-clean encoding (no
      bare hex>=20, detect-secrets clean, collision-safe). Refresh via explicit
      command/flag only (lockfile + merge + atomic, CI-guarded, DECISIONS_PATH
      isolation). Prune: drop empty-files + stale-model (+age policy if
      defined). Prove deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit == persisted verdict; accepted+miss+absent
      == heuristic True; normal lint zero writes (hash/mtime assert)."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: cache-design-spike
    title: Tracked cache schema and determinism prototype
  - deps: []
    description: "Writer-first reframing (runner is sequential, pylint specs pass no
      -j: no contention today). Identify FIRST: writer (checker open()/close()
      during pylint subprocess vs runner post-process merge) + write timing
      (per-visit vs end-of-run) + --path scoping across
      pylint/pylint-pyi/pylint-tests sequential invocations. Then derive:
      lockfile+merge+atomic needed for crash-safety vs unnecessary (runner-side
      post-merge) vs jobs=1/sidecars only if -j introduced. Add
      tests/assumptions/test_pylint_cache_semantics.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Verdict
      feeds cache-design-spike."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: pylint-cache-assumptions
    title: Pin pylint writer, timing, and path scoping
  - deps:
      - model-eval-poc
    description: "Conditional on eval recommendation (no-go -> report-only skip, no
      file). For the chosen runtime only: verify py3.14 CPU wheels
      (linux/mac/win), import/device/offline contract (CPU fallback, no network
      on hit), and custom-code pinning (vendored revision, never unpinned
      trust_remote_code). Add
      tests/assumptions/test_decision_runtime_contracts.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Acceptance:
      wheels/APIs pinned or explicit blocker recorded for iteration-3 epic."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: decision-runtime-pinning
    title: Pin chosen runtime wheels and API contracts
  - deps:
      - baseline-violations-fix
      - consolidate-integration-helpers
      - golden-contract-hardening
      - runner-format-contract
    description: "Read-only; zero repo writes. Audit src/** + scripts/** vs
      CodingRules/AGENTS on final HEAD (contains M1 + M2 merges). Output in item
      report (engine-durable replan input): rows {module, section, evidence
      file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint
      file-ownership map over the ownership universe (src+scripts+tests minus
      tests/data; owner enum {runner,checkers,setup-testing,semantic,root}; stub
      follows .py; tests/data + config + docs as root-owned group) +
      symbol-exclusion column (_base.py::check_if_meaningful,
      _OPTIONAL_IMPORT_PATTERNS, _semantic.py+.pyi) + planned-path reservations
      (new backend/cache modules). Single owner of the map; test audit aligns
      via inter-dep. Reads final HEAD + beartype report + secrets-spike
      verdict."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: coding-rules-audit
    title: Inventory CodingRules violations and ownership
  - deps:
      - coding-rules-audit
      - consolidate-integration-helpers
      - golden-contract-hardening
    description: "Read-only; zero repo writes. Audit tests/** (minus tests/data,
      root-owned). Output in item report: rows {module, behaviors, duplicate-of,
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      LoC/runtime estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag) +
      symbol exclusions (test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline) + planned-path reservations (epic
      conftest/runtime modules). Owner column aligned to coding audit's unified
      map via inter-dep (file ownership separate from symbol skips). Iteration-3
      replan consumes both reports + HEAD re-glob validation."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: test-debloat-audit
    title: Inventory redundant tests and pinning limbs
  - deps:
      - baseline-violations-fix
    description: "Close the M1 green-baseline tail: wave-2 report lists lint still
      red, and the two W9704 sites from infra notes
      (src/python_setup_lint/checkers/conformance/generic_key_dict_checker.py
      options-Any site, src/python_setup_lint/testing.py list[Any]/type-ignore
      site) were never owned by any item (TD2-B2 omitted them). Steps: (1)
      Reproduce current failures via the declared gates (format check + 13-tool
      lint) or scoped pylint/pylint-pyi/pylint-tests on src/** and tests/**;
      capture exact remaining violations. (2) Fix with
      justification-comment-only edits (no behavior change; red-test-exempt like
      baseline-violations-fix): strengthen trailing justifications so the
      justification checker accepts. If additional violations appear, fix only
      if trivially behavior-preserving, else record as debt in the report — do
      not balloon scope. FORBIDDEN: lint.baseline edits (stays []),
      tests/data/** changes, golden regen, unrelated refactors,
      .secrets.baseline, factory records. Secrets-triage verdict is human-async
      and out of scope. Verify: lint gate zero violations in src/** and
      tests/**; `pytest -q` + integration show no new failures; golden
      byte-identical; touched files format-clean."
    kind: story
    milestoneId: M1
    prodBudgetHint: 5
    slug: remaining-lint-violations-fix
    title: Fix remaining src/tests lint violations (W9704 tail)
assumptions:
  - assumption: Material behavior = golden findings (SEMANTIC=0) + checker unit
      tests + CLI flags/exit codes + baseline/autofix semantics + shipped
      configs/scopes. Reranker accept/reject is not material; heuristic
      rejections (empty, boilerplate, brush-off, rule-echo) are material. Model
      may tighten acceptance (new W9704 under SEMANTIC=1 vs heuristic-only
      today) by design; SEMANTIC=1 golden will shift with shift report +
      CHANGELOG + root regen.
    disposition: confirm with human
    why: Makes preservation mechanically testable while allowing the swap;
      tightening must be operator-visible, not mistaken for regression.
  - assumption: Git-stored decision cache lives in the linted repo (proposed
      .python-setup-decisions.json next to lint.baseline); weights stay in user
      model cache, never git. Spikes assume this path with DECISIONS_PATH
      isolation; operator confirms filename/location before iteration-3
      implementation.
    disposition: confirm with human
    why: Decisions must reproduce in CI without the model; weights are 0.03-0.8GB
      with own licenses; committed file affects
      gitignore/hatch/consumers/secrets.
  - assumption: Dev/CI do not install the `semantic` extra; gates run heuristic +
      cache hits. Real-model tests are slow + with_real_api, never in the
      default suite.
    why: Matches current venv (no torch/transformers); keeps gates offline, fast,
      deterministic.
  - assumption: "'Never test linting' bans pytest asserting this repo passes its own
      gates (subprocess re-lint, AST re-implementation, config re-checks).
      Golden/integration behavior contracts are retained, not removed."
    disposition: confirm with human
    why: Removes gate-duplicating tests without deleting the fit-for-purpose
      contract.
  - assumption: GLiDE-0.4B Fastino Community License is not accepted until human
      review; spikes proceed Apache-first (flag Fastino + bekko-unclear) and
      exclude CC-BY-NC. If eval recommends GLiDE, implementation pauses for
      approval; if no candidate meets license + CPU + py3.14 + bars, the epic
      escalates.
    disposition: confirm with human
    why: MIT package cannot absorb unclear/non-commercial licensing by default;
      operator must see the gating criterion before the eval verdict.
  - assumption: "Gate contracts (paths/commands) do not change:
      tests/integration.py, `pytest -q`, integration, split format/lint gates
      until M1 merges, then reunify. Never run bare `uv run lint` (pre-M1
      mutation hazard) or --overwrite-baseline; captures run on temp copies
      only."
    why: Bare lint mutates pre-M1; split gates are the check-only workaround.
  - assumption: Semantic epic record spawns in iteration 2; its implementation runs
      in iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at
      the iteration-3 replan from M4 audits. Single replanAfter on M4; M3 spikes
      report without replanning.
    why: Parallel M3/M4 with one replan gate avoids premature/deadlocked replans and
      pins the spawn wave.
  - assumption: Factory-journal detect-secrets hits are triaged by
      secrets-triage-spike (environmental vs real with hash evidence). M1 dev
      acceptance is zero violations in src/** and tests/**; any factory-journal
      exclusion is operator/engine action tracked as human-async and never
      blocks dev items.
    disposition: verify via secrets-triage-spike
    why: Isolates the environmental unknown from dev stories per uncertainty
      containment; M1 green must not depend on out-of-band operator action.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker with a CPU-friendly small decision
      model + git-stored self-cleaning cache. Child epic of `modernize`. Record
      spawns iteration 2; implementation runs iteration 3 consuming spikes
      (candidate matrix, CPU eval, cache design, pylint semantics, runtime
      pinning).


      ## Scope (symbol-level)

      Owned: checkers/_semantic.py+.pyi + new private backend/cache modules
      (+.pyi, @beartype, structlog kwargs, tach-clean); check_if_meaningful in
      _base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py;
      pyproject [semantic] extra + uv.lock + .gitignore + hatch inclusion; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section only, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache tests,
      tests/checkers/conftest.py, runtime modules under tests/assumptions/.
      Protocol: NEVER write tests/data/** (read golden for verification; on
      heuristic shift emit shift report + CHANGELOG description, root
      regenerates). AGENTS.md pipeline section ONLY (Semantic justification
      pipeline, ~AGENTS.md:79-85), applied onto HEAD containing M1's merge (M1
      owns all count lines); never touch count lines (:9,43,63,92,93) or counts
      table (:10-11). tests/assumptions append-only. No edits to
      tests/integration.py, tests/conftest.py. Runner touch minimal + ADR.


      ## Requirements

      1. Implement spike verdict: chosen model id/revision, noul prompt +
      criteria, threshold meeting >=90% acc / >=95% meaningless-precision /
      >=85% meaningful-recall on the heuristic-accepted stratum, in the
      recommended mode (veto vs replace), or escalate on no-go. No unpinned
      trust_remote_code; exclude non-commercial; Fastino needs human approval.

      2. Contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool +
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None.
      Public DecisionBackend Protocol decide(justification,rule,context)->float
      with spike-pinned mapping (justification=primary, rule=joined codes,
      context=code_context); DECISION_THRESHOLD + PROMPT_VERSION. Injection:
      optional backend kwarg (public in .pyi) + test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND dotted path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra/failure: heuristic + cache hits, one
      warning, sentinel. Weights in user cache. PYTHON_SETUP_LINT_DECISION_MODEL
      selects model@revision; RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root): JSON array sorted
      by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized, rule joined codes, model '<id> rev <short12>
      prompt-vN' (no bare hex>=20), decision, files sorted POSIX} +
      spike-decided {version, prompt hash, last-seen}. Key
      (justification,rule,model) with spike-chosen secrets-clean encoding.
      Normal lint read-only (hash-asserted zero writes); explicit refresh writes
      via lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH
      isolation. Sweep scoped to linted files; drop empty-files + stale-model.
      Must pass all tools incl. detect-secrets. Concurrency per writer-first
      verdict.

      5. Real suppressed codes: extract all codes, normalize/sort/join ',' as
      rule (bare-except keeps single symbol). Rule-echo rejects on any element.
      On shift: shift report + CHANGELOG, root regenerates golden.

      6. Tests: merge brush-off/meaningful/threshold tables into one deduped
      parametrized table; FakeBackend via kwarg + env; cache
      round-trip/cleanup/concurrency on tmp + hypothesis format round-trip;
      exactly one slow+with_real_api e2e; delete vacuous `is None or ...` +
      ImportError-propagation test; modules <=500, no suppressions; never test
      linting.

      7. Docs: Scope list + CHANGELOG (user-visible only).


      ## Acceptance

      - SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit
      without model emits persisted verdict with no load. Brush-off never
      reaches model; one call per unique pair; scoped cleanup; no retry storm.
      Format/lint/pytest/integration green with empty baseline.
    slug: semantic-decision-model
techDebt:
  - category: blocking
    description: "`ruff format` ToolSpec mutates the worktree (plain `ruff format`,
      no --check/--config, default 88 vs shipped 130); phase-1a vs normal pass
      indistinguishable at _fix=False."
    id: TD2-B1
    resolution: "Resolved by runner-format-contract: _RuffFormatLintTool with check
      vs format modes, phase-1a mutates (fix-only), normal pass checks with
      shipped config, registry single-sourced."
  - category: blocking
    description: "Red baseline: 6 named tests assert 13 vs 14 tools; SIM102
      src/python_setup_lint/checkers/stub/coverage.py:196-198; R0914 cli.py:50
      (23/20); C0208 _factories_extras.py:383 set-iteration. Empty baseline
      masks real violations."
    id: TD2-B2
    resolution: Resolved by runner-format-contract (14-tool migration + docs
      enumeration with grep disposition) + baseline-violations-fix serialized
      after it (SIM102 + locals split + C0208 sequence fix). Baseline stays [].
  - category: blocking
    description: detect-secrets flags factory-journal files on clean checkout;
      environmental vs real unverified, so M1 lint-green is undefined for that
      tool.
    id: TD2-B3
    resolution: Owned by secrets-triage-spike (fact-finder, report with file hashes
      + verdict + exclusion mechanism). Environmental -> operator/engine
      exclusion as human-async (M1 dev acceptance does not wait); real ->
      redact/rotate follow-up. M1 dev acceptance is zero violations in src/**
      and tests/**.
  - category: impacting
    description: tests/integration.py 661 lines with too-many-lines (:12) + stale
      too-many-locals (:202, globally disabled in .pylintrc-tests:39)
      suppressions; helpers duplicated across
      integration/conftest/_autofix_helpers; nested tmp_path/golden copy needs
      mkdir-parents.
    id: TD2-I1
    resolution: Resolved by consolidate-integration-helpers retry (tests-only,
      11-helper matrix incl mkdir-parents copy, conftest def deleted with 2
      import rewrites + cycle guard, >=161 removed to <=500, :12 via extraction
      + :202 stale deleted directly, golden byte-identical).
  - category: impacting
    description: "Golden drift: tool-order vs sort placement, len!=0/crash asserts
      unplaced, unused slice_tool_section with unpinned markers, regen-twice
      would mutate committed files."
    id: TD2-I2
    resolution: "Resolved by golden-contract-hardening: tool-order collect,
      serialize/diff sorting, caller len/crash asserts, no sentinel,
      slicer('[pylint]','[pylint-pyi]') in overlay test, temp-copy
      double-collect determinism proof, UPDATE_GOLDEN never touches committed
      files except reviewed regen."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore, carry vacuous `is None or ...` asserts +
      ImportError-propagation test; heuristic tables duplicated across two
      modules.
    id: TD2-I3
    resolution: Resolved by semantic epic iteration-3 implementation (FakeBackend
      injection, deduped merged table, modules <=500, vacuous tests deleted).
  - category: impacting
    description: W9704/W9738 pass their own symbol as `rule`; rule-echo heuristic
      and future model never see actually-suppressed codes.
    id: TD2-I4
    resolution: Resolved by semantic epic req5 (joined suppressed codes, echo on any
      element, shift report + root regen).
  - category: adjacent
    description: "Over-limit/duplicated test infra: _factories.py 1393 lines,
      _factories_extras.py 502 lines with duplicate disables, 3 baseline-diff +
      3 runner files overlapping, test_golden.py 341 lines of helper-unit
      tests."
    id: TD2-A1
    resolution: Inventoried by test-debloat-audit; iteration-3 checkers/runner epics
      merge/split per CodingRules.
  - category: adjacent
    description: "Legacy/compat and docs drift:
      _FALLBACK_TOOLS/peek/_compare_sorted, astroid 3.x fallback, dispatch.py
      500+ char rationale with self-suppression, rumdl tests/data-exclude hack,
      ADR design/ vs docs/adr split."
    id: TD2-A2
    resolution: Inventoried by audits; iteration-3 epics remove/fix.
adrs:
  - consequences: "`uv run lint` without --fix is check-only (not hermetic:
      subprocesses/caches exist; --fix mutates by design in phase 1a/1b). Split
      format/lint gates reunify after merge. 14-tool docs/tests stabilize on one
      registry with historical CHANGELOG preserved."
    context: "`ruff format` ToolSpec runs plain `ruff format` without
      --check/--config (default 88 vs shipped 130), dirtying ~109 files;
      phase-1a (mutate) and normal pass (check) both call build_command with
      _fix=False; 6 tests + ~20 docs/test sites assert 13 vs 14-entry TOOLS;
      _compose_ruff_config may return a temp path so spies must not match
      literals."
    decision: "Retain 14. Add _RuffFormatLintTool(LintTool) per dispatch strategy
      pattern: build_command emits check mode (ruff format --check --config
      <resolved ruff.toml>) by default; build_format_command emits mutating
      mode. cli.py phase-1a calls build_format_command, normal pass calls
      build_command. Map 'ruff format'->ruff.toml in runner/_config.py +
      _config_flag_for. Registry invariants owned by runner/dispatch.py,
      re-exported via runner/__init__: EXPECTED_TOOL_NAMES (14),
      FORMATTER_ONLY={'ruff format'}, STATISTICS_PARSER_TOOLS (13),
      RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS={tach
      check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
      documented intentional. Tests import from python_setup_lint.runner.
      Tool-count migration verified by grep with per-hit disposition, CHANGELOG
      historical exclusion, and MD013/130 allowlist."
    id: ADR-005
    title: Ruff format strategy with explicit check vs format modes
  - consequences: Golden stays byte-identical; crash/empty sensitivity explicit in
      caller; overlay uses shared slicer; no invented sentinel; committed files
      never mutated by determinism proofs.
    context: Merged collect_findings runs a second pipeline on the private
      record-parser subset (avoids formatter pollution and baseline capture). It
      returns tool-order, sorts only in serialize, and no code emits __CRASH__
      (crashes surface as [CRASH] text; parsers return [] on garbage).
      UPDATE_GOLDEN=1 rewrites committed files, so regen-twice must not target
      them.
    decision: "Ratify private-subset second run as intentional. No Finding-level
      __CRASH__ sentinel: crash sensitivity stays in caller first-run asserts
      ([CRASH] absent, SKIPPED only package_name). Keep collect in tool order
      (synthetic-empty safe); sorting lives in serialize_write + _diff_keys.
      len(findings)!=0 asserted by the caller after collect.
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test.
      Determinism proven by temp-copy double-collect (two fresh temp copies,
      sha256 of serialized findings equal each other and equal committed golden
      hash); UPDATE_GOLDEN=1 never touches committed files except reviewed
      regen."
    id: ADR-006
    title: Golden hardening via caller asserts, no crash sentinel
  - consequences: "Lint deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit equals persisted model verdict;
      accepted+miss+absent equals heuristic True. Cache updates explicit,
      reviewable, CI-guarded. Iteration 3 implements against spike verdict."
    context: Current cache is per-machine, gitignored, unbounded, 64-bit truncated
      keys, no cleanup. A lint-written tracked cache would be non-hermetic;
      full-hex keys would trip detect-secrets.
    decision: "Tracked cache is source of truth; normal lint is read-only (cache-hit
      + heuristic), zero writes asserted by file hash/mtime. Writes only via
      explicit refresh command/flag (lockfile + merge + atomic temp+move,
      CI-guarded, DECISIONS_PATH isolation). Key encoding is spike-chosen
      subject to: no bare hex>=20, passes detect-secrets, collision-safe. Schema
      unified with epic (justification,rule,model,decision,files + spike-decided
      version/prompt-hash/last-seen). Prune drops empty-files + stale-model
      (+age policy if spike defines)."
    id: ADR-007
    title: Read-only lint with spike-chosen secrets-clean cache
  - consequences: One replan point (M4) consumes durable report tables + HEAD
      validation; subsystem epics spawn in iteration 3 with disjoint ownership;
      semantic implementation follows spike verdicts. No concurrent shared-infra
      edits. No committed map to maintain; audits stay zero-write.
    context: Remaining scope spans runner/checkers/setup plus semantic swap. Audits
      must read final post-M1+M2 HEAD; M3 spikes and M4 audits run in parallel
      with one replan gate. Review questioned whether item-report tables are
      durable enough to feed iteration-3 replan.
    decision: "Iteration 2: green baseline, infra completion, spikes, audits.
      Semantic epic record spawns now; its implementation is scheduled iteration
      3 after spikes. Runner/checkers/setup-testing epics spawn at the
      iteration-3 replan from the unified map. ARCHITECT DECISION on durability:
      item reports persist as engine-durable orchestration records
      (items/*/assignment + wave reports + decisions/), readable at replan per
      the task status contract; validation re-globs HEAD. No committed map;
      fact-finders stay zero-repo-write. Escape hatch (not default): if the
      engine ever drops reports, replan re-runs the audit queries or the kind
      changes to a committed artifact."
    id: ADR-008
    title: Single-replan progressive decomposition with report-fed replan


--- Prior Plan plan-2.yaml ---
iteration: 2
milestones:
  - directionalInterfaces:
      - "_RuffFormatLintTool(LintTool) in runner/dispatch.py:
        build_command(config,_path,_exclude)->check mode
        ['ruff','format','--check','--config',<resolved ruff.toml>,...paths]
        (default); build_format_command(...)->mutating mode without --check.
        cli.py phase-1a calls build_format_command (fix-only), normal pass calls
        build_command. runner/_config.py maps 'ruff format'->ruff.toml;
        _config_flag_for handles it. No if-spec.name in _build_command."
      - "Registry invariants owned by runner/dispatch.py, re-exported via
        runner/__init__.py: EXPECTED_TOOL_NAMES (14); FORMATTER_ONLY={'ruff
        format'} (statistics-exempt); STATISTICS_PARSER_TOOLS (13);
        RECORD_PARSER_TOOLS (9); RECORDLESS_TOOLS={tach
        check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
        intentional. Tests import from python_setup_lint.runner. Migration:
        test_lint_runner set+count 13->14; _factories_extras 13->14; stats + t3
        assert STATISTICS set; fakes invariants assert EXPECTED set."
      - "Docs contract: every in-scope tool-count site -> 14 by grep `13[
        -]?tools?|all_13|== 13` with per-hit disposition:
        AGENTS.md:9,43,63,92,93 + counts table :10-11; README.md:17,58;
        docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
        runner/__init__.py:3; cli.py:314; tests/runner/_factories.py:46;
        _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
        test_extra_tools.py:237; test_self_lint_clean.py:3;
        test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
        test_testing_fakes.py:137,165; plus any further tool-count grep hit.
        EXCLUDED (stays 13): CHANGELOG.md:104 historical. Allowlist:
        MD013/130/v0.13 and other non-tool-count 13s. tool_counts.json asserted
        14 keys incl 'ruff format':0 (verify, not rewrite)."
    id: M1
    scenarios:
      - >-
        Scenario: Gates green per-gate
          Given clean HEAD with empty lint.baseline
          When format gate exits 0 (all files formatted; set derived via git ls-files, count not pinned), lint gate reports zero violations in src/** and tests/**, `pytest -q` exits 0, integration exits 0, and secrets-triage-spike records its verdict
          Then all gates pass: the 6 named tool-count tests fixed (test_tool_spec_given_known_tools_then_present, test_tool_spec_given_tools_then_autofix_and_no_duplicates, test_statistics_parsers_given_all_tools_then_covered, test_parser_completeness_given_all_tools_then_have_parser, test_run_lint_with_fake_dispatch_invariants[all_13_tools_dispatched], test_run_lint_with_fake_dispatch_invariants[package_name_none_skips_stubtest_verifytypes]), SIM102/R0914/C0208 fixed with no new violations, lint.baseline stays [], and factory-journal secrets are owned by the spike verdict (human-async), not dev acceptance
      - >-
        Scenario: Lint check-only without --fix
          Given a clean worktree
          When `uv run lint` runs without --fix
          Then `git status --porcelain` is empty; a command spy shows the normal-pass ruff-format cmd contains --check and --config with a resolved existing path (composed temp accepted, no literal match), and the mutating format cmd (phase-1a) runs only under --fix without --check
      - >-
        Scenario: Registry single-sourced
          Given the TOOLS table
          When tests and docs read the tool count
          Then every in-scope tool-count assertion reads 14 from EXPECTED_TOOL_NAMES with FORMATTER_ONLY/RECORDLESS exemptions explicit; verification is the tool-count grep with per-hit disposition and allowlist; no in-scope hit remains 13
    title: Green baseline and 14-tool runner contract
  - directionalInterfaces:
      - "tests/_project_helpers.py sole site, 11 helpers with pinned
        names/signatures: copy_sample_project(dest_parent: Path)->Path
        (dest_parent.mkdir(parents=True, exist_ok=True); copytree
        tests/data/minimal_sample_project -> dest_parent/'project'; returns
        project path); git_init_and_stage(project: Path)->None (test/test@test +
        add .); shipped_config_paths()->dict[str,Path];
        make_runner_config(project: Path)->RunnerConfig (minimal_sample + rumdl
        override idempotent, no-op if shipped rumdl missing); git_init_bare(cwd:
        Path)->None (Test/test@example.com, -q, no add);
        write_project_file(cwd,rel,content)->Path; stage_file(cwd,rel)->None;
        commit_all(cwd,msg='init')->None; build_pylint_overlay_config(project:
        Path, disable_rule: str)->Path; ensure_precommit_or_skip()->None;
        install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
        _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
        _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
        shipped_config_paths def entirely (no re-export); rewrite
        test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
        tests._project_helpers import ...`; integration.py consumes
        make_runner_config + mapped subset. Cycle guard: _project_helpers
        imports stdlib + python_setup_lint.runner/setup/testing only, never
        tests.conftest/tests.integration. Test class/function names unchanged;
        helper renames per matrix only."
      - "tests/_golden.py: collect_findings(project,*,config)->list[Finding]
        keeps tool order (no sort, synthetic-empty safe); sorting in
        serialize_write + _diff_keys; caller test_setup_new_and_lint asserts
        len(findings)!=0 post-collect and retains first-run [CRASH]-absent +
        SKIPPED-only-package_name asserts; no Finding __CRASH__ sentinel;
        assert_matches_golden Counter-multiset + UPDATE guard (fail under
        CI/GITHUB_ACTIONS); slice_tool_section(output,'[pylint]','[pylint-pyi]')
        used by overlay test; read_oracle_rules, assert_oracle_coverage,
        assert_tool_coverage retained. Determinism proven by temp-copy
        double-collect (two fresh temp copies, sha256 of serialized findings
        equal each other and equal committed golden hash); UPDATE_GOLDEN=1 never
        touches committed files except reviewed regen."
    id: M2
    scenarios:
      - >-
        Scenario: Shared helpers exist once per matrix
          Given tests/_project_helpers.py
          When tests/ is searched
          Then each of the 11 helpers is defined exactly once there (copy with mkdir-parents), duplicates in conftest.py and _autofix_helpers.py are deleted, the 2 conftest importers are rewritten to _project_helpers, each consumer imports only its mapped subset, _project_helpers imports nothing from tests.conftest/tests.integration, and stay-symbols are untouched
      - >-
        Scenario: Integration gate within single limit
          Given >=161 lines removed (661-><=500: helpers 57 + overlay 28 + setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 + import/trim 8 = 163)
          When `uv run pytest tests/integration.py -v` runs
          Then tests/integration.py is <=500 lines with :12 too-many-lines removed via extraction and :202 stale too-many-locals disable deleted directly (globally disabled in config/.pylintrc-tests:39; verify pylint tests + W9704 clean), test names unchanged, all pass, golden+counts byte-identical
      - >-
        Scenario: Golden hardening via caller asserts
          Given the committed golden
          When integration runs plus synthetic drift injection plus temp-copy double-collect
          Then findings serialize sorted with caller len!=0, zero [CRASH], SKIPPED only package_name, drift names exact added/removed keys, oracle + per-tool coverage hold, both temp-copy hashes equal the committed hash without mutating committed files, and the overlay test uses the shared slicer
    title: Test infra consolidation and golden hardening
  - directionalInterfaces:
      - "Eval contract: decide(justification,rule,context)->float P(meaningful)
        in [0,1]; mapping: justification=primary=(comment or text).strip(),
        rule=joined suppressed codes (spike uses current rule symbol where codes
        unavailable, recorded), context=code_context (None allowed);
        decision=prob>=threshold. Modes: veto: final=heuristic(text) AND
        (prob>=threshold) (model only flips True->False; heuristic-False never
        reaches model); replace: final=(prob>=threshold), heuristic deleted.
        Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency).
        Corpus: threshold 30+50 + brush-off/meaningful tables + N real repo
        suppressions, DEDUPED by normalized justification (target >=100
        post-dedup), stratified heuristic-rejected (easy) vs heuristic-accepted
        (model-decides); rubric (specific technical justification vs
        placeholder/deferral/brush-off); per-source + per-stratum breakdown.
        Bars >=90% acc / >=95% meaningless-precision / >=85% meaningful-recall
        apply to the heuristic-accepted stratum (overall also reported). Report
        per-candidate at 0.5/0.6/0.7 in both modes; all matrix candidates scored
        or explicitly excluded."
      - "Cache contract (spike-chosen): tracked JSON array sorted by
        (rule,justification,model), indent=2 sort_keys=True; unified entry
        {justification, rule, model '<id> rev <short12> prompt-vN', decision,
        files sorted POSIX} + spike-decided {version, prompt hash, last-seen?};
        key (justification,rule,model) with secrets-clean encoding (no bare
        hex>=20, detect-secrets clean); normal lint zero writes (hash/mtime
        assert); refresh command/flag only (lockfile + merge + atomic,
        CI-guarded, DECISIONS_PATH isolation); prune empty-files + stale-model."
      - "Pylint/concurrency contract (writer-first): identify writer (checker
        open/close vs runner post-process) + write timing (per-visit vs
        end-of-run) + --path scoping across 3 sequential pylint invocations (no
        -j, no contention); verdict derives crash-safe lock/merge/atomic vs
        no-lock runner merge vs jobs=1/sidecars-if--j."
    id: M3
    scenarios:
      - >-
        Scenario: Model choice is evidence-based over all candidates
          Given the deduped labelled corpus (>=100 post-dedup, rubric + per-source + per-stratum split)
          When the poc scores GLiDE, decider-nano, bekko-17m, ettin-150m, MiniLM at 0.5/0.6/0.7 in veto and replace modes (or records explicit exclusion)
          Then the report cites the 90/95/85 bars per threshold per stratum (compliance on heuristic-accepted stratum) and recommends the smallest compliant model+prompt+threshold+mode or a no-go with evidence
      - >-
        Scenario: Cache deterministic-given-cache+model
          Given the proposed schema on a temp copy
          When W9704 runs with model absent, present-miss, and cache-hit
          Then heuristic-rejected verdicts are identically False without model contact, accepted+hit equals the persisted model verdict, accepted+miss+absent equals heuristic True, prune drops stale/deleted entries, and normal lint shows zero writes by hash
      - >-
        Scenario: Writer and timing pinned before lock design
          Given pylint 4.x invocation tests
          When writer + timing + --path scoping are pinned
          Then the cache lock/merge/sweep design is derived (crash-safe atomic vs runner merge vs jobs=1/sidecars-if--j) with --path-scoped sweep
    title: Decision-model and git-cache design spikes
  - directionalInterfaces:
      - "Replan input contract: audits emit structured tables in item reports
        (engine-durable orchestration records: items/*/assignment + wave reports
        + decisions/, readable at replan per the task status contract);
        iteration-3 replan consumes reports + re-globs HEAD for validation only
        (no committed map; fact-finders write nothing; escape hatch = kind
        change to committed artifact if the engine ever drops reports). Owner
        enum {runner,checkers,setup-testing,semantic,root}. Ownership universe =
        src/** + scripts/** + tests/** EXCLUDING tests/data/**
        (stubs/conftest/__init__/_factories included; stub follows .py).
        Root-owned group (epics read-only): tests/data/** (golden,
        minimal_sample, oracles; golden regen only by root item), config/**,
        docs/**, repo-root files. Every universe file appears exactly once with
        exactly one owner; root-owned listed as a group."
      - "File ownership separate from symbol exclusions: ownership is
        whole-file; skips live in an exclusion column (src: _semantic.py+.pyi,
        _base.py::check_if_meaningful, _OPTIONAL_IMPORT_PATTERNS; tests:
        test_semantic_check.py, test_semantic_threshold.py,
        TestSuppressionRerankerPipeline). Planned-path reservations (new
        backend/cache modules, epic conftest/runtime modules) listed separately,
        not globbed."
    id: M4
    replanAfter: true
    scenarios:
      - >-
        Scenario: Coding-rules debt inventoried with disjoint ownership
          Given CodingRules.md and AGENTS.md
          When the audit completes on final HEAD (M1+M2 merged)
          Then every ownership-universe file is listed with violations plus exactly-once owner, the root-owned group (tests/data, config, docs) is listed once, semantic symbols are marked skipped in the exclusion column, and planned paths are reserved
      - >-
        Scenario: Test redundancy inventoried with pinning limbs
          Given tests/ and the golden
          When the audit completes
          Then each module has keep|merge|rewrite|remove with surviving coverage, repo-self-lint tests are listed for removal, each material limb names pinning tests or blocking debt, and owners align to the unified map
      - >-
        Scenario: Replan input is complete and validatable
          Given both audit reports plus HEAD
          When the iteration-3 replan re-globs HEAD
          Then every universe file validates against exactly one owner, the root-owned group matches, exclusions reference existing symbols, and reservations name only planned paths
    title: Debloat inventory and subsystem epic decomposition
uncertainties:
  - description: "Which decision model (if any) meets license + CPU + py3.14 +
      90/95/85 bars on the heuristic-accepted stratum is unknown. GLiDE-0.4B:
      Fastino license, 0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17.
      Apache alternatives vary in accuracy/license/CPU proof. No CPU benchmark
      exists here; mapping/modes/metric now pinned, corpus deduped + stratified
      by the spike."
    id: U1
    spikeOutlines:
      - "model-candidate-matrix (fact-finder): license, params/size, runtime,
        py3.14 wheels, custom-code, pinnable revision; excludes CC-BY-NC, flags
        Fastino/unclear"
      - "model-eval-poc (poc, CPU-only): ALL candidates at 0.5/0.6/0.7 in veto +
        replace modes on >=100 deduped corpus with rubric; compliance on
        heuristic-accepted stratum; smallest compliant
        model/prompt/threshold+mode or no-go"
      - "decision-runtime-pinning (test-assumptions, conditional on eval):
        py3.14 CPU wheels + import/device/offline + custom-code pinning for the
        chosen runtime (skip on no-go)"
  - description: "Cache key encoding, schema extras, prune/update semantics, writer
      identity/timing, and --path scoping are unknown. Open: secrets-clean
      encoding (not full hex), version/prompt-hash/last-seen fields, refresh
      command, CI guard, checker- vs runner-side writer, write timing, sweep
      scope."
    id: U2
    spikeOutlines:
      - "pylint-cache-assumptions (test-assumptions, writer-first): pin writer +
        timing + --path scoping across sequential invocations; verdict derives
        lock/merge/atomic vs runner merge vs jobs=1/sidecars-if--j"
      - "cache-design-spike (poc on temp copies, consumes writer verdict):
        unified schema + spike-chosen encoding + prune + refresh/CI/isolation +
        deterministic-given-cache+model proof with hash-asserted zero
        normal-lint writes"
  - description: Size/shape of coding-rules debt (~8.9k src LOC) and
      redundant/lint-testing tests (~18.4k test LOC, 772 tests) unmeasured;
      subsystem epics need the unified map with file-vs-symbol separation,
      root-owned groups, and planned-path reservations.
    id: U3
    spikeOutlines:
      - coding-rules-audit (fact-finder on final M1+M2 HEAD, single owner of
        unified map + exclusion column + reservations)
      - test-debloat-audit (fact-finder, aligned via inter-dep; per-limb pinning
        inventory)
  - description: "detect-secrets flags on clean checkout are of unknown source:
      tracked factory runtime journals (environmental) vs a real secret. The
      exclusion mechanism (engine config vs gate flag) is also unknown, so M1
      lint-green cannot be defined for that tool until triaged."
    id: U4
    spikeOutlines:
      - "secrets-triage-spike (fact-finder, no repo writes): clean-checkout
        scan, flagged files + sha256 + verdict environmental-vs-real + exact
        exclusion mechanism; human-async operator request if environmental"
itemOutlines:
  - deps: []
    description: "Retain 14. (1) Add _RuffFormatLintTool(LintTool) in dispatch.py:
      build_command -> check mode (--check + --config resolved ruff.toml);
      build_format_command -> mutating mode; register in _strategy_for; map
      'ruff format'->ruff.toml in _config.py + _config_flag_for. cli.py phase-1a
      calls build_format_command, normal pass calls build_command. No
      if-spec.name in _build_command. (2) Registry: EXPECTED_TOOL_NAMES +
      FORMATTER_ONLY + STATISTICS/RECORD/RECORDLESS sets owned by dispatch.py,
      re-exported via runner/__init__; migrate the 6 named tests
      (test_lint_runner set+count; _factories_extras len+id; stats + t3 to
      STATISTICS set with FORMATTER_ONLY exemption; fakes invariants to EXPECTED
      set). (3) Docs: migrate every in-scope tool-count site to 14 with per-hit
      report (AGENTS.md:9,43,63,92,93 + counts :10-11; README.md:17,58;
      docs/overlays.md:3; docs/tutorials.md:26; docs/troubleshooting.md:155;
      runner/__init__.py:3; cli.py:314; _factories.py:46;
      _factories_extras.py:1,377-378; test_lint_runner.py:50,76;
      test_extra_tools.py:237; test_self_lint_clean.py:3;
      test_bench_runner_overhead.py:5,224; test_real_pipeline_smoke.py:24;
      test_testing_fakes.py:137,165; plus any further tool-count grep hit).
      CHANGELOG.md:104 stays 13 (historical); MD013/130/v0.13 allowlisted.
      Assert tool_counts.json already 14 keys (not rewrite). Verify:
      format/lint/pytest/integration exit 0; git status --porcelain empty after
      `uv run lint` (no --fix); spy asserts normal-pass cmd has --check +
      --config with resolved existing path (composed temp accepted) and phase-1a
      omits --check (fix-only); golden byte-identical; baseline []."
    kind: story
    milestoneId: M1
    prodBudgetHint: 60
    slug: runner-format-contract
    title: Ruff format strategy and 14-tool registry fix
  - deps:
      - runner-format-contract
    description: "Serialized after runner-format-contract (shared cli.py ownership;
      applies onto the phase-1a call-site shape). Behavior-preserving refactors,
      baseline stays []: (1)
      src/python_setup_lint/checkers/stub/coverage.py:196-198 SIM102 (elif
      TypeAlias + nested if AssignName) -> single combined condition. (2)
      cli.py:50 _run_tool_pipeline 23-><=20 locals by extracting phase/select
      helpers (no pipeline semantics change). (3)
      tests/runner/_factories_extras.py:383 C0208 set-iteration -> sequence
      type. Secrets explicitly OUT of scope (owned by secrets-triage-spike).
      Verify: lint gate reports zero violations in src/** and tests/**; pytest +
      integration show no new failures; golden byte-identical."
    kind: story
    milestoneId: M1
    prodBudgetHint: 35
    slug: baseline-violations-fix
    title: Fix SIM102, too-many-locals, C0208
  - deps: []
    description: "No repo edits; report only. On clean checkout run the declared
      lint gate / detect-secrets scan; capture every flagged file + sha256 +
      baseline entry. Verdict: environmental (only tracked factory runtime
      journals) vs real secret. If environmental: specify the exact exclusion
      mechanism (engine config vs gate command flag) + evidence hashes, and
      record the operator/engine exclusion request as human-async (M1 dev
      acceptance does not wait on it). If real: specify redact/rotate follow-up.
      Output feeds M1 acceptance + U4."
    kind: fact-finder
    milestoneId: M1
    prodBudgetHint: 0
    slug: secrets-triage-spike
    title: Triage detect-secrets factory-journal flags
  - deps: []
    description: "Tests-only (tests/** ONLY; FORBIDDEN lint.baseline, AGENTS.md,
      docs/**, src/**). Red-test-exempt. Create tests/_project_helpers.py per
      matrix (11 helpers): copy_sample_project(dest_parent)->Path [mkdir
      parents, copytree tests/data/minimal_sample_project ->
      dest_parent/'project', ex _copy_sample]; git_init_and_stage(project)->None
      [test/test@test + add ., ex _init_git]; shipped_config_paths()->dict [ex
      _shipped_config_paths]; make_runner_config(project)->RunnerConfig
      [minimal_sample + rumdl override idempotent, no-op if shipped rumdl
      missing, ex _make_config]; git_init_bare(cwd)->None [Test/test@example.com
      -q no add, ex _git_init]; write_project_file(cwd,rel,content)->Path [ex
      _write_file]; stage_file(cwd,rel)->None [ex _stage];
      commit_all(cwd,msg)->None [ex _commit_all];
      build_pylint_overlay_config(project,disable_rule)->Path [extract overlay
      217-240]; ensure_precommit_or_skip()->None;
      install_twice_assert_idempotent(project,monkeypatch)->None. STAY in
      _autofix_helpers.py: _make_canned_fix_results, _PostFixFakeRunCmd,
      _CANARY_LABEL, _FIX_TOOL_NAMES+assert. conftest.py: delete
      shipped_config_paths def entirely (no re-export); rewrite
      test_pyright_noise_filter.py:15 + test_self_lint_clean.py:15 to `from
      tests._project_helpers import ...`; integration.py uses make_runner_config
      + mapped subset. Cycle guard: _project_helpers imports stdlib +
      python_setup_lint.runner/setup/testing only, never
      tests.conftest/tests.integration. Test class/function names unchanged.
      Budget: >=161 removed (661-><=500): helpers 57 + overlay 28 +
      setup/idempotent 32 + precommit 30 + loop/lookup 5 + slicer 3 +
      import/trim 8 = 163. Remove :12 too-many-lines via extraction; delete :202
      stale too-many-locals disable directly (globally disabled in
      config/.pylintrc-tests:39; verify pylint tests + W9704 clean). Verify:
      diff stat tests/** only; golden diff empty; integration + test_golden
      pass; touched files format-clean."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: consolidate-integration-helpers
    title: Single-source helpers; integration.py under 500 lines
  - deps:
      - consolidate-integration-helpers
    description: "Tests-only hardening, committed files never mutated by proofs. No
      __CRASH__ sentinel and no sort-in-collect: keep collect tool-order;
      sorting stays in serialize_write + _diff_keys; add caller asserts in
      test_setup_new_and_lint (len(findings)!=0 post-collect; first-run [CRASH]
      absent + SKIPPED only package_name retained); keep Counter-multiset diff +
      UPDATE guard + oracle/tool coverage; use
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test;
      extend tests/test_golden.py synthetic coverage (ordering, POSIX, diff
      keys, CI-guard, coverage, byte-format, empty-list safe). Determinism via
      temp-copy double-collect: collect+serialize on two fresh temp copies,
      sha256 hashes equal each other and equal committed golden hash.
      UPDATE_GOLDEN=1 never touches committed files except reviewed regen.
      Verify: integration + test_golden pass; golden+counts byte-identical."
    kind: story
    milestoneId: M2
    prodBudgetHint: 0
    slug: golden-contract-hardening
    title: Harden golden via caller asserts and shared slicer
  - deps: []
    description: "No repo edits; report only. Matrix for GLiDE-0.4B,
      tasksource-decider-nano, bekko-17m, ettin-150m + MiniLM baseline: license,
      params/weights, runtime stack, py3.14 CPU wheels (linux/mac/win),
      custom-code/vendoring burden, pinnable revision, offline behavior. Exclude
      CC-BY-NC; flag Fastino + bekko-unclear-license for human review. Output
      feeds eval-poc (all candidates) + cache spike (model-id/rev format) +
      runtime pinning."
    kind: fact-finder
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-candidate-matrix
    title: Decision-model candidate matrix
  - deps:
      - model-candidate-matrix
    description: "No committed code; report only (temp venv/copy permitted, network
      inside spike only). Mapping: justification=primary=(comment or
      text).strip(), rule=joined suppressed codes (current rule symbol where
      codes unavailable, recorded), context=code_context (None allowed);
      decision=prob>=threshold. Modes: veto final=heuristic AND
      (prob>=threshold); replace final=(prob>=threshold). Smallest=lexicographic
      (params, weights bytes, CPU RSS, p50 latency). Corpus: threshold 30+50 +
      brush-off/meaningful tables + N real repo suppressions, DEDUPED by
      normalized justification (target >=100 post-dedup), stratified
      heuristic-rejected (easy) vs heuristic-accepted (model-decides); rubric:
      specific technical justification vs placeholder/deferral/brush-off;
      per-source + per-stratum breakdown. Score ALL matrix candidates at
      0.5/0.6/0.7 in BOTH modes (or record explicit exclusion): accuracy,
      meaningless-precision, meaningful-recall, CPU p50/p95 + RSS. Compliance
      bars (>=90% acc / >=95% meaningless-precision / >=85% meaningful-recall)
      apply to the heuristic-accepted stratum (overall also reported). Recommend
      smallest compliant model+prompt+threshold+mode, or no-go with evidence."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: model-eval-poc
    title: CPU accuracy/latency evaluation over all candidates
  - deps:
      - model-candidate-matrix
      - pylint-cache-assumptions
    description: "Prototype on temp copies only; no committed files. Consumes
      writer-first verdict. Design unified tracked schema: JSON array sorted by
      (rule,justification,model), indent=2 sort_keys; entry {justification,
      rule, model '<id> rev <short12> prompt-vN', decision, files sorted POSIX}
      + spike-decided {version, prompt hash, last-seen?}; key
      (justification,rule,model) with spike-chosen secrets-clean encoding (no
      bare hex>=20, detect-secrets clean, collision-safe). Refresh via explicit
      command/flag only (lockfile + merge + atomic, CI-guarded, DECISIONS_PATH
      isolation). Prune: drop empty-files + stale-model (+age policy if
      defined). Prove deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit == persisted verdict; accepted+miss+absent
      == heuristic True; normal lint zero writes (hash/mtime assert)."
    escalate: true
    kind: poc
    milestoneId: M3
    prodBudgetHint: 0
    slug: cache-design-spike
    title: Tracked cache schema and determinism prototype
  - deps: []
    description: "Writer-first reframing (runner is sequential, pylint specs pass no
      -j: no contention today). Identify FIRST: writer (checker open()/close()
      during pylint subprocess vs runner post-process merge) + write timing
      (per-visit vs end-of-run) + --path scoping across
      pylint/pylint-pyi/pylint-tests sequential invocations. Then derive:
      lockfile+merge+atomic needed for crash-safety vs unnecessary (runner-side
      post-merge) vs jobs=1/sidecars only if -j introduced. Add
      tests/assumptions/test_pylint_cache_semantics.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Verdict
      feeds cache-design-spike."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: pylint-cache-assumptions
    title: Pin pylint writer, timing, and path scoping
  - deps:
      - model-eval-poc
    description: "Conditional on eval recommendation (no-go -> report-only skip, no
      file). For the chosen runtime only: verify py3.14 CPU wheels
      (linux/mac/win), import/device/offline contract (CPU fallback, no network
      on hit), and custom-code pinning (vendored revision, never unpinned
      trust_remote_code). Add
      tests/assumptions/test_decision_runtime_contracts.py (no_external_api,
      test_<api>_given_<condition>_then_<expected>). No src changes. Acceptance:
      wheels/APIs pinned or explicit blocker recorded for iteration-3 epic."
    kind: test-assumptions
    milestoneId: M3
    prodBudgetHint: 0
    slug: decision-runtime-pinning
    title: Pin chosen runtime wheels and API contracts
  - deps:
      - baseline-violations-fix
      - consolidate-integration-helpers
      - golden-contract-hardening
      - runner-format-contract
    description: "Read-only; zero repo writes. Audit src/** + scripts/** vs
      CodingRules/AGENTS on final HEAD (contains M1 + M2 merges). Output in item
      report (engine-durable replan input): rows {module, section, evidence
      file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint
      file-ownership map over the ownership universe (src+scripts+tests minus
      tests/data; owner enum {runner,checkers,setup-testing,semantic,root}; stub
      follows .py; tests/data + config + docs as root-owned group) +
      symbol-exclusion column (_base.py::check_if_meaningful,
      _OPTIONAL_IMPORT_PATTERNS, _semantic.py+.pyi) + planned-path reservations
      (new backend/cache modules). Single owner of the map; test audit aligns
      via inter-dep. Reads final HEAD + beartype report + secrets-spike
      verdict."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: coding-rules-audit
    title: Inventory CodingRules violations and ownership
  - deps:
      - coding-rules-audit
      - consolidate-integration-helpers
      - golden-contract-hardening
    description: "Read-only; zero repo writes. Audit tests/** (minus tests/data,
      root-owned). Output in item report: rows {module, behaviors, duplicate-of,
      keep|merge|rewrite|remove, surviving coverage, reason, owner} +
      LoC/runtime estimates + per-limb pinning inventory (CLI/exit,
      baseline/autofix, configs/scopes: surviving test or blocking-debt flag) +
      symbol exclusions (test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline) + planned-path reservations (epic
      conftest/runtime modules). Owner column aligned to coding audit's unified
      map via inter-dep (file ownership separate from symbol skips). Iteration-3
      replan consumes both reports + HEAD re-glob validation."
    kind: fact-finder
    milestoneId: M4
    prodBudgetHint: 0
    slug: test-debloat-audit
    title: Inventory redundant tests and pinning limbs
assumptions:
  - assumption: Material behavior = golden findings (SEMANTIC=0) + checker unit
      tests + CLI flags/exit codes + baseline/autofix semantics + shipped
      configs/scopes. Reranker accept/reject is not material; heuristic
      rejections (empty, boilerplate, brush-off, rule-echo) are material. Model
      may tighten acceptance (new W9704 under SEMANTIC=1 vs heuristic-only
      today) by design; SEMANTIC=1 golden will shift with shift report +
      CHANGELOG + root regen.
    disposition: confirm with human
    why: Makes preservation mechanically testable while allowing the swap;
      tightening must be operator-visible, not mistaken for regression.
  - assumption: Git-stored decision cache lives in the linted repo (proposed
      .python-setup-decisions.json next to lint.baseline); weights stay in user
      model cache, never git. Spikes assume this path with DECISIONS_PATH
      isolation; operator confirms filename/location before iteration-3
      implementation.
    disposition: confirm with human
    why: Decisions must reproduce in CI without the model; weights are 0.03-0.8GB
      with own licenses; committed file affects
      gitignore/hatch/consumers/secrets.
  - assumption: Dev/CI do not install the `semantic` extra; gates run heuristic +
      cache hits. Real-model tests are slow + with_real_api, never in the
      default suite.
    why: Matches current venv (no torch/transformers); keeps gates offline, fast,
      deterministic.
  - assumption: "'Never test linting' bans pytest asserting this repo passes its own
      gates (subprocess re-lint, AST re-implementation, config re-checks).
      Golden/integration behavior contracts are retained, not removed."
    disposition: confirm with human
    why: Removes gate-duplicating tests without deleting the fit-for-purpose
      contract.
  - assumption: GLiDE-0.4B Fastino Community License is not accepted until human
      review; spikes proceed Apache-first (flag Fastino + bekko-unclear) and
      exclude CC-BY-NC. If eval recommends GLiDE, implementation pauses for
      approval; if no candidate meets license + CPU + py3.14 + bars, the epic
      escalates.
    disposition: confirm with human
    why: MIT package cannot absorb unclear/non-commercial licensing by default;
      operator must see the gating criterion before the eval verdict.
  - assumption: "Gate contracts (paths/commands) do not change:
      tests/integration.py, `pytest -q`, integration, split format/lint gates
      until M1 merges, then reunify. Never run bare `uv run lint` (pre-M1
      mutation hazard) or --overwrite-baseline; captures run on temp copies
      only."
    why: Bare lint mutates pre-M1; split gates are the check-only workaround.
  - assumption: Semantic epic record spawns in iteration 2; its implementation runs
      in iteration 3 after spikes. Runner/checkers/setup-testing epics spawn at
      the iteration-3 replan from M4 audits. Single replanAfter on M4; M3 spikes
      report without replanning.
    why: Parallel M3/M4 with one replan gate avoids premature/deadlocked replans and
      pins the spawn wave.
  - assumption: Factory-journal detect-secrets hits are triaged by
      secrets-triage-spike (environmental vs real with hash evidence). M1 dev
      acceptance is zero violations in src/** and tests/**; any factory-journal
      exclusion is operator/engine action tracked as human-async and never
      blocks dev items.
    disposition: verify via secrets-triage-spike
    why: Isolates the environmental unknown from dev stories per uncertainty
      containment; M1 green must not depend on out-of-band operator action.
epics:
  - intent: >-
      # semantic-decision-model


      Replace the cross-encoder reranker with a CPU-friendly small decision
      model + git-stored self-cleaning cache. Child epic of `modernize`. Record
      spawns iteration 2; implementation runs iteration 3 consuming spikes
      (candidate matrix, CPU eval, cache design, pylint semantics, runtime
      pinning).


      ## Scope (symbol-level)

      Owned: checkers/_semantic.py+.pyi + new private backend/cache modules
      (+.pyi, @beartype, structlog kwargs, tach-clean); check_if_meaningful in
      _base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py;
      pyproject [semantic] extra + uv.lock + .gitignore + hatch inclusion; docs
      (semantic-justification.md, custom-checks.md bullet, troubleshooting.md
      section, AGENTS.md pipeline section only, CHANGELOG); tests:
      test_semantic_check.py, test_semantic_threshold.py,
      TestSuppressionRerankerPipeline, new decision/cache tests,
      tests/checkers/conftest.py, runtime modules under tests/assumptions/.
      Protocol: NEVER write tests/data/** (read golden for verification; on
      heuristic shift emit shift report + CHANGELOG description, root
      regenerates). AGENTS.md pipeline section ONLY (Semantic justification
      pipeline, ~AGENTS.md:79-85), applied onto HEAD containing M1's merge (M1
      owns all count lines); never touch count lines (:9,43,63,92,93) or counts
      table (:10-11). tests/assumptions append-only. No edits to
      tests/integration.py, tests/conftest.py. Runner touch minimal + ADR.


      ## Requirements

      1. Implement spike verdict: chosen model id/revision, noul prompt +
      criteria, threshold meeting >=90% acc / >=95% meaningless-precision /
      >=85% meaningful-recall on the heuristic-accepted stratum, in the
      recommended mode (veto vs replace), or escalate on no-go. No unpinned
      trust_remote_code; exclude non-commercial; Fastino needs human approval.

      2. Contract: keep
      check_if_meaningful(text,*,rule,code_context,comment)->bool +
      PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported).
      Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None.
      Public DecisionBackend Protocol decide(justification,rule,context)->float
      with spike-pinned mapping (justification=primary, rule=joined codes,
      context=code_context); DECISION_THRESHOLD + PROMPT_VERSION. Injection:
      optional backend kwarg (public in .pyi) + test-only
      PYTHON_SETUP_LINT_DECISION_BACKEND dotted path. No patching
      globals/imports, no private imports.

      3. Packaging: `semantic` extra ships chosen runtime (drop
      sentence-transformers). Without extra/failure: heuristic + cache hits, one
      warning, sentinel. Weights in user cache. PYTHON_SETUP_LINT_DECISION_MODEL
      selects model@revision; RERANKER_MODEL deprecated (warn + ignore).

      4. Cache (.python-setup-decisions.json at linted root): JSON array sorted
      by (rule,justification,model), indent=2 sort_keys=True. Entry
      {justification normalized, rule joined codes, model '<id> rev <short12>
      prompt-vN' (no bare hex>=20), decision, files sorted POSIX} +
      spike-decided {version, prompt hash, last-seen}. Key
      (justification,rule,model) with spike-chosen secrets-clean encoding.
      Normal lint read-only (hash-asserted zero writes); explicit refresh writes
      via lockfile + merge + atomic temp+move, CI-guarded, DECISIONS_PATH
      isolation. Sweep scoped to linted files; drop empty-files + stale-model.
      Must pass all tools incl. detect-secrets. Concurrency per writer-first
      verdict.

      5. Real suppressed codes: extract all codes, normalize/sort/join ',' as
      rule (bare-except keeps single symbol). Rule-echo rejects on any element.
      On shift: shift report + CHANGELOG, root regenerates golden.

      6. Tests: merge brush-off/meaningful/threshold tables into one deduped
      parametrized table; FakeBackend via kwarg + env; cache
      round-trip/cleanup/concurrency on tmp + hypothesis format round-trip;
      exactly one slow+with_real_api e2e; delete vacuous `is None or ...` +
      ImportError-propagation test; modules <=500, no suppressions; never test
      linting.

      7. Docs: Scope list + CHANGELOG (user-visible only).


      ## Acceptance

      - SEMANTIC=0 sample lint equals golden (read-only verification). Cache-hit
      without model emits persisted verdict with no load. Brush-off never
      reaches model; one call per unique pair; scoped cleanup; no retry storm.
      Format/lint/pytest/integration green with empty baseline.
    slug: semantic-decision-model
techDebt:
  - category: blocking
    description: "`ruff format` ToolSpec mutates the worktree (plain `ruff format`,
      no --check/--config, default 88 vs shipped 130); phase-1a vs normal pass
      indistinguishable at _fix=False."
    id: TD2-B1
    resolution: "Resolved by runner-format-contract: _RuffFormatLintTool with check
      vs format modes, phase-1a mutates (fix-only), normal pass checks with
      shipped config, registry single-sourced."
  - category: blocking
    description: "Red baseline: 6 named tests assert 13 vs 14 tools; SIM102
      src/python_setup_lint/checkers/stub/coverage.py:196-198; R0914 cli.py:50
      (23/20); C0208 _factories_extras.py:383 set-iteration. Empty baseline
      masks real violations."
    id: TD2-B2
    resolution: Resolved by runner-format-contract (14-tool migration + docs
      enumeration with grep disposition) + baseline-violations-fix serialized
      after it (SIM102 + locals split + C0208 sequence fix). Baseline stays [].
  - category: blocking
    description: detect-secrets flags factory-journal files on clean checkout;
      environmental vs real unverified, so M1 lint-green is undefined for that
      tool.
    id: TD2-B3
    resolution: Owned by secrets-triage-spike (fact-finder, report with file hashes
      + verdict + exclusion mechanism). Environmental -> operator/engine
      exclusion as human-async (M1 dev acceptance does not wait); real ->
      redact/rotate follow-up. M1 dev acceptance is zero violations in src/**
      and tests/**.
  - category: impacting
    description: tests/integration.py 661 lines with too-many-lines (:12) + stale
      too-many-locals (:202, globally disabled in .pylintrc-tests:39)
      suppressions; helpers duplicated across
      integration/conftest/_autofix_helpers; nested tmp_path/golden copy needs
      mkdir-parents.
    id: TD2-I1
    resolution: Resolved by consolidate-integration-helpers retry (tests-only,
      11-helper matrix incl mkdir-parents copy, conftest def deleted with 2
      import rewrites + cycle guard, >=161 removed to <=500, :12 via extraction
      + :202 stale deleted directly, golden byte-identical).
  - category: impacting
    description: "Golden drift: tool-order vs sort placement, len!=0/crash asserts
      unplaced, unused slice_tool_section with unpinned markers, regen-twice
      would mutate committed files."
    id: TD2-I2
    resolution: "Resolved by golden-contract-hardening: tool-order collect,
      serialize/diff sorting, caller len/crash asserts, no sentinel,
      slicer('[pylint]','[pylint-pyi]') in overlay test, temp-copy
      double-collect determinism proof, UPDATE_GOLDEN never touches committed
      files except reviewed regen."
  - category: impacting
    description: Semantic tests patch module globals and builtins.__import__, import
      privates under type:ignore, carry vacuous `is None or ...` asserts +
      ImportError-propagation test; heuristic tables duplicated across two
      modules.
    id: TD2-I3
    resolution: Resolved by semantic epic iteration-3 implementation (FakeBackend
      injection, deduped merged table, modules <=500, vacuous tests deleted).
  - category: impacting
    description: W9704/W9738 pass their own symbol as `rule`; rule-echo heuristic
      and future model never see actually-suppressed codes.
    id: TD2-I4
    resolution: Resolved by semantic epic req5 (joined suppressed codes, echo on any
      element, shift report + root regen).
  - category: adjacent
    description: "Over-limit/duplicated test infra: _factories.py 1393 lines,
      _factories_extras.py 502 lines with duplicate disables, 3 baseline-diff +
      3 runner files overlapping, test_golden.py 341 lines of helper-unit
      tests."
    id: TD2-A1
    resolution: Inventoried by test-debloat-audit; iteration-3 checkers/runner epics
      merge/split per CodingRules.
  - category: adjacent
    description: "Legacy/compat and docs drift:
      _FALLBACK_TOOLS/peek/_compare_sorted, astroid 3.x fallback, dispatch.py
      500+ char rationale with self-suppression, rumdl tests/data-exclude hack,
      ADR design/ vs docs/adr split."
    id: TD2-A2
    resolution: Inventoried by audits; iteration-3 epics remove/fix.
adrs:
  - consequences: "`uv run lint` without --fix is check-only (not hermetic:
      subprocesses/caches exist; --fix mutates by design in phase 1a/1b). Split
      format/lint gates reunify after merge. 14-tool docs/tests stabilize on one
      registry with historical CHANGELOG preserved."
    context: "`ruff format` ToolSpec runs plain `ruff format` without
      --check/--config (default 88 vs shipped 130), dirtying ~109 files;
      phase-1a (mutate) and normal pass (check) both call build_command with
      _fix=False; 6 tests + ~20 docs/test sites assert 13 vs 14-entry TOOLS;
      _compose_ruff_config may return a temp path so spies must not match
      literals."
    decision: "Retain 14. Add _RuffFormatLintTool(LintTool) per dispatch strategy
      pattern: build_command emits check mode (ruff format --check --config
      <resolved ruff.toml>) by default; build_format_command emits mutating
      mode. cli.py phase-1a calls build_format_command, normal pass calls
      build_command. Map 'ruff format'->ruff.toml in runner/_config.py +
      _config_flag_for. Registry invariants owned by runner/dispatch.py,
      re-exported via runner/__init__: EXPECTED_TOOL_NAMES (14),
      FORMATTER_ONLY={'ruff format'}, STATISTICS_PARSER_TOOLS (13),
      RECORD_PARSER_TOOLS (9), RECORDLESS_TOOLS={tach
      check,mypy.stubtest,pyright verify types,detect-secrets,ruff format}
      documented intentional. Tests import from python_setup_lint.runner.
      Tool-count migration verified by grep with per-hit disposition, CHANGELOG
      historical exclusion, and MD013/130 allowlist."
    id: ADR-005
    title: Ruff format strategy with explicit check vs format modes
  - consequences: Golden stays byte-identical; crash/empty sensitivity explicit in
      caller; overlay uses shared slicer; no invented sentinel; committed files
      never mutated by determinism proofs.
    context: Merged collect_findings runs a second pipeline on the private
      record-parser subset (avoids formatter pollution and baseline capture). It
      returns tool-order, sorts only in serialize, and no code emits __CRASH__
      (crashes surface as [CRASH] text; parsers return [] on garbage).
      UPDATE_GOLDEN=1 rewrites committed files, so regen-twice must not target
      them.
    decision: "Ratify private-subset second run as intentional. No Finding-level
      __CRASH__ sentinel: crash sensitivity stays in caller first-run asserts
      ([CRASH] absent, SKIPPED only package_name). Keep collect in tool order
      (synthetic-empty safe); sorting lives in serialize_write + _diff_keys.
      len(findings)!=0 asserted by the caller after collect.
      slice_tool_section(output,'[pylint]','[pylint-pyi]') in overlay test.
      Determinism proven by temp-copy double-collect (two fresh temp copies,
      sha256 of serialized findings equal each other and equal committed golden
      hash); UPDATE_GOLDEN=1 never touches committed files except reviewed
      regen."
    id: ADR-006
    title: Golden hardening via caller asserts, no crash sentinel
  - consequences: "Lint deterministic-given-cache+model: heuristic-rejected
      identical False; accepted+hit equals persisted model verdict;
      accepted+miss+absent equals heuristic True. Cache updates explicit,
      reviewable, CI-guarded. Iteration 3 implements against spike verdict."
    context: Current cache is per-machine, gitignored, unbounded, 64-bit truncated
      keys, no cleanup. A lint-written tracked cache would be non-hermetic;
      full-hex keys would trip detect-secrets.
    decision: "Tracked cache is source of truth; normal lint is read-only (cache-hit
      + heuristic), zero writes asserted by file hash/mtime. Writes only via
      explicit refresh command/flag (lockfile + merge + atomic temp+move,
      CI-guarded, DECISIONS_PATH isolation). Key encoding is spike-chosen
      subject to: no bare hex>=20, passes detect-secrets, collision-safe. Schema
      unified with epic (justification,rule,model,decision,files + spike-decided
      version/prompt-hash/last-seen). Prune drops empty-files + stale-model
      (+age policy if spike defines)."
    id: ADR-007
    title: Read-only lint with spike-chosen secrets-clean cache
  - consequences: One replan point (M4) consumes durable report tables + HEAD
      validation; subsystem epics spawn in iteration 3 with disjoint ownership;
      semantic implementation follows spike verdicts. No concurrent shared-infra
      edits. No committed map to maintain; audits stay zero-write.
    context: Remaining scope spans runner/checkers/setup plus semantic swap. Audits
      must read final post-M1+M2 HEAD; M3 spikes and M4 audits run in parallel
      with one replan gate. Review questioned whether item-report tables are
      durable enough to feed iteration-3 replan.
    decision: "Iteration 2: green baseline, infra completion, spikes, audits.
      Semantic epic record spawns now; its implementation is scheduled iteration
      3 after spikes. Runner/checkers/setup-testing epics spawn at the
      iteration-3 replan from the unified map. ARCHITECT DECISION on durability:
      item reports persist as engine-durable orchestration records
      (items/*/assignment + wave reports + decisions/), readable at replan per
      the task status contract; validation re-globs HEAD. No committed map;
      fact-finders stay zero-repo-write. Escape hatch (not default): if the
      engine ever drops reports, replan re-runs the audit queries or the kind
      changes to a committed artifact."
    id: ADR-008
    title: Single-replan progressive decomposition with report-fed replan


--- Prior Close-up closeup-1.yaml ---
iteration: 1
status: next-iteration
summary: "Iteration 1 partially delivered: M1 golden safety net confirmed
  functional (golden+counts committed, oracle/tool coverage, drift/regen
  helpers, 8 assumption tests pinned). M2 helper consolidation unmerged (no
  tests/_project_helpers.py; integration.py 661 lines with suppression vs <=500)
  and M3 audits lack committed evidence; these plus the audit-flagged M1
  interface drift fixes carry to iteration 2. Semantic epic not started by
  design (spawns on narrowed protocol once M2/M3 land). Task intent (rule
  enforcement, debloat, model swap) remains future scope. No operator blocker:
  remaining work is planned, sequenced, and resourced for next iteration."


--- Prior Close-up closeup-2.yaml ---
iteration: 2
status: next-iteration
summary: "Iteration 2 delivered the verifiable repo scope: M1 green baseline +
  14-tool contract (check-only ruff format strategy, single-sourced registry,
  14-site docs migration, SIM102/R0914/C0208/W9704-tail fixes, baseline []) and
  M2 test-infra consolidation + golden hardening (11 helpers single-sourced,
  integration.py 498 lines, caller asserts, shared slicer, golden
  byte-identical) — both verified at HEAD by the close-up audit. M3 partial:
  model matrix + CPU eval (structural no-go with disclosed single-adjudicator
  limits) + runtime-pinning no-go skip merged; test_pylint_cache_semantics.py
  still missing (pylint-cache-assumptions running, cache-design-spike pending on
  its verdict). M4: both audits merged per engine records; report completeness
  validates at the iteration-3 replan via HEAD re-glob per ADR-008. Secrets
  verdict is human-async and does not block dev acceptance. Task intent (rule
  enforcement, debloat, semantic swap) remains iteration-3 scope per plan; no
  operator blocker."


--- Steering Directive/Answer (1794100866341.md) ---
Operator acknowledges all plan-1 awareness items: (1) material definition and its SEMANTIC=0 findings scope: OK; tightened acceptance by the model is intentional, not a regression. (2) git-stored cache file at the linted repo root: OK as required by INTENT; document it in install docs, keep it detect-secrets clean, and note model weight licenses. (3) never-test-linting broadening and removing the pytest self-lint guard: OK, it matches the project's coding rules; the lint gate is the guard. No further action needed on these.


--- Steering Directive/Answer (1794128584028.md) ---
Operator acknowledges awareness-consolidate-integration-helpers-v2-agents-counts-stale-followup: restoring AGENTS.md + cli.py:314 to base inside a test-only story was correct (kind forbids non-test paths). The follow-up docs/prod story to sync AGENTS.md counts and the cli help text is approved — add it (small dev kind, depends on the v3 line) when the wave-report next amends, or fold the two-line sync into the docs-counts-sync story if it is still pending. Pre-existing red lint/test baseline items stay out of story budgets. No other action.


--- Steering Directive/Answer (1794158471467.md) ---
Answers to secrets-triage-spike questions: (1) q-secrets-triage-spike-engine-untrack-runtime-journals: do NOT untrack journals — journal.ndjson and runs/ are audit records and must stay committed. Instead seed the should_exclude_file filter at factory init/backfill so fresh checkouts exclude .factory/ from secret scanning by default. Also fix the two stale claims (infra.yaml note that detect-secrets passes; gates-baseline [detect-secrets] PASSED line) to reflect that the baseline predates the flagged journal lines. File the filter-seeding as a harness follow-up item. (2) q-secrets-triage-spike-operator-secrets-baseline-exclusion: YES, add the ^\.factory/ pattern to .secrets.baseline filters_used after line 40 in the python-setup repo (task-branch commit), keeping the awareness residual-risk caveat (write-time redaction + periodic unfiltered audits). M1 acceptance cites the mechanism + pinned HEAD, not the finding count.


--- Decision 001-item-golden-findings-snapshot.yaml ---
id: decision-golden-findings-snapshot-1794105920421
context: item
item: golden-findings-snapshot
afterRecord: 002-test-first-a2
decision: split
timestamp: 2026-11-08T02:45:20.421Z
rationale: "3/3 test-first attempts exhausted with empty diff and no failure
  log: item couples deterministic unit-testable helpers (None-safe key, POSIX
  normalize, Counter diff, CI guard) with a heavy 2x14-tool pipeline capture +
  golden commit + integration rewiring. Test-first cannot progress on the
  combined scope. Split isolates the pure-logic module with fast synthetic tests
  from the heavy integration wiring, each independently verifiable; preserves
  probe dep and bounded-src discipline."
text: Schedule golden-helpers-unit first (fast, no pipeline);
  golden-snapshot-wiring consumes it plus the probe spec. Wiring acceptance is
  baseline-relative (6 pre-existing 13-vs-14 failures persist; no new failures).
  Do not touch .factory records.
outlines:
  - deps:
      - golden-determinism-probe
    description: "Create tests/_golden.py as SOLE golden owner (no pipeline run in
      this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN,
      SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict
      {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe
      mirroring _violation_sort_key; normalize_record (drop msg, relativize vs
      project, strip ./, backslash->/, as_posix, assert non-absolute); serialize
      (json.dump indent=2 sort_keys=True + trailing newline);
      assert_matches_golden (Counter multiset diff, sorted added/removed;
      UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if
      CI/GITHUB_ACTIONS else warn+rewrite golden+counts together);
      read_oracle_rules, slice_tool_section, assert_oracle_coverage,
      assert_tool_coverage. Add tests/test_golden.py (synthetic Finding lists
      ONLY, no run_lint, no pipeline): finding_key None vs str/int ordering,
      POSIX normalization, multiset diff exact added/removed, CI-guard fail,
      coverage asserts, serialization byte-format. Acceptance: `uv run pytest
      tests/test_golden.py -q` passes; module <=500 lines, formatted. Consumes
      probe normalization spec; no src/ changes; no golden files yet."
    kind: story
    milestoneId: M1
    slug: golden-helpers-unit
    title: Golden helpers module with synthetic unit tests
  - deps:
      - golden-determinism-probe
      - golden-helpers-unit
    description: "Using tests/_golden.py from golden-helpers-unit and the probe
      report verdict. (1) Commit
      tests/data/golden/minimal_sample_project_findings.json +
      ..._tool_counts.json via the helper serialization, outside sample dir,
      never copied/linted; violations.txt RETAINED. (2) Edit
      tests/integration.py test_setup_new_and_lint only: keep first run (no
      baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions;
      add dedicated second capture (caller owns tmp, copy, git-init,
      _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling
      collect_findings; replace substring loop with golden equality +
      oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint,
      mod.py:49 present / :56 absent); drift injection on in-memory copies only.
      Run captures on temp copies only, never bare `uv run lint` on the repo.
      Bounded src allowance ONLY if probe proved test-side insufficient:
      baseline.py relativize/sort + parsers.py|_record_parsers.py ordering, <=40
      added lines, determinism-only, reviewed diff in report. Acceptance: `uv
      run pytest tests/integration.py -v`, `uv run pytest tests/test_golden.py
      -q` pass; regen twice byte-identical; golden+counts byte-stable."
    kind: dev
    milestoneId: M1
    slug: golden-snapshot-wiring
    title: Commit golden files and wire integration capture


--- Decision 002-item-golden-snapshot-wiring.yaml ---
id: decision-golden-snapshot-wiring-1794117253013
context: item
item: golden-snapshot-wiring
afterRecord: 004-qa-r1-a2
decision: accept-with-debt
timestamp: 2026-11-08T05:54:13.013Z
rationale: "QA rejected twice on red-test alone: test_setup_new_and_lint passes
  'without production code changes'. That is the CORRECT outcome here, not a
  defect — the probe verdict was test-side sufficient, so the item intentionally
  makes zero src/ changes (diff: tests/_golden.py +111, integration.py +61/-27,
  two new golden JSONs, violations.txt retained). No developer retry can satisfy
  fail-then-pass without fabricating a gratuitous src change, which the plan
  forbids. The item's sensitivity is proven instead by in-memory drift injection
  and golden equality. Split/escalate/abandon all wrong: scope is correct,
  implementation passed every other gate, and M1 is the iteration's critical
  path."
text: Merge golden-snapshot-wiring as-is. Do not add src changes to satisfy
  red-test. Downstream items (consolidate-v2, audits-v2) proceed against the
  committed golden; consolidate must keep golden+counts byte-identical. Future
  tests-only contract items should be flagged red-test-exempt at assignment.
debt: "RED-TEST WAIVED (gate inapplicable by design): golden-snapshot-wiring is
  a tests-only M1 contract item — probe verdict was test-side normalization
  sufficient, so the bounded src allowance was correctly NOT used and the diff
  touches only tests/_golden.py (+collect_findings), tests/integration.py
  wiring, and the two committed golden JSON files. Red-test (test must fail
  without src changes) cannot hold when zero src changes are the correct
  outcome. Compensating verification already in the item: drift injection on
  in-memory list copies proves assert_matches_golden detects add/drop drift;
  PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 regen-twice byte-identical proves
  determinism; oracle + per-tool coverage + tool-qualified brush-off/carry
  lookups prove sensitivity. QA rejected 2/2 solely on red-test; all other
  checks passed. No src follow-up required."


--- Decision 003-amend-remove-consolidate-integration-helpers.yaml ---
id: decision-amend-remove-consolidate-integration-helpers
context: wave
item: consolidate-integration-helpers
decision: split
rationale: Amendment removed pending item consolidate-integration-helpers
timestamp: 2026-11-08T07:19:12.494Z


--- Decision 004-item-consolidate-integration-helpers-v3.yaml ---
id: decision-consolidate-integration-helpers-v3-1794126299869
context: item
item: consolidate-integration-helpers-v3
afterRecord: 002-develop-r1-a2
decision: retry-with-guidance
timestamp: 2026-11-08T08:24:59.869Z
rationale: "Both develop attempts rejected solely on tests-only: diff touches
  lint.baseline (+18/-1) outside test paths. Test work itself matches the
  outline (_project_helpers.py +210, integration.py +43/-218, conftest/_autofix
  import switches). Baseline edit is never valid here — lint.baseline stays []
  and acceptance is baseline-relative. Reverting that one file plus any
  unrelated test edits unblocks merge; no split/escalate needed."
text: "Retry granted. Fix in this order: (1) Revert lint.baseline to HEAD
  exactly (must read `[]`, `git diff -- lint.baseline` empty). NEVER run `uv run
  lint --overwrite-baseline` or bare `uv run lint` (ruff-format write hazard).
  (2) Restrict diff to tests/** only: keep _project_helpers.py (10 helpers),
  conftest.py/_autofix_helpers.py/integration.py per-consumer import switches,
  and integration.py line-budget moves (>=127 removed, <=500, no suppression).
  Revert any unrelated edits — especially tests/_golden.py behavior, tool-count
  assertions (test_lint_runner*, test_t3_coverage), factory logic, or anything
  beyond import migration. (3) Verify: `git diff --stat` shows only tests/**;
  `git diff -- tests/data/golden/` empty (byte-identical); `uv run pytest
  tests/integration.py -v` and `uv run pytest tests/test_golden.py -q` pass;
  touched files ruff/format clean; pre-existing SIM102/R0914/C0208 + 6
  tool-count failures persist by design (do not fix, do not baseline). Record
  the golden diff check in the report."
persist: true


--- Decision 005-item-pylint-cache-assumptions.yaml ---
id: decision-pylint-cache-assumptions-1794139485507
context: item
item: pylint-cache-assumptions
afterRecord: 003-develop-r1-a2
decision: retry-with-guidance
timestamp: 2026-11-08T12:04:45.507Z
rationale: "Both develop attempts rejected solely on scope creep, not on the
  assumption tests themselves: diff leaked into M1-owned files (src
  stub/coverage.py SIM102 fix, src runner/cli.py locals, 6 tests/runner 13->14
  migrations) plus a .secrets.baseline side-effect write. The item's contract is
  one new file, tests/assumptions/test_pylint_cache_semantics.py, zero src
  changes. Reverting the out-of-scope files unblocks merge; no split/escalate
  needed."
text: "Retry granted. Fix in this order: (1) Revert to HEAD exactly:
  .secrets.baseline, src/python_setup_lint/checkers/stub/coverage.py,
  src/python_setup_lint/runner/cli.py (`git diff --` on each must be empty).
  NEVER run bare `uv run lint` or any detect-secrets scan that rewrites
  .secrets.baseline (run only `uv run pytest
  tests/assumptions/test_pylint_cache_semantics.py -q`). (2) Revert all
  tests/runner/** edits (factories, extra_tools, lint_runner, stats, t3, fakes)
  — owned by runner-format-contract, parallel race. (3) Diff must contain
  exactly ONE file: tests/assumptions/test_pylint_cache_semantics.py
  (writer-first: writer + timing + --path scoping verdict, no_external_api
  marker, test_<api>_given_<condition>_then_<expected> names, offline, no src
  imports beyond reading). (4) Verify: `git diff --stat` shows only that file;
  new tests pass; touched file ruff/format clean. Pre-existing SIM102/R0914/6
  tool-count failures persist by design — do not fix, do not baseline. Record
  the writer/timing verdict (crash-safe lock vs runner post-merge vs
  jobs=1/sidecars-if--j) plus --path sweep scope in the report for
  cache-design-spike."
persist: true


--- Decision 006-item-model-eval-poc.yaml ---
id: decision-model-eval-poc-1794148393249
context: item
item: model-eval-poc
afterRecord: 004-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T14:33:13.249Z
rationale: "Single display bug blocks approval: report.py:250 renders Recall
  column from precision instead of meaningful_recall. Metrics, best-cell
  selection (lines 240-244), compliance table 4.4, and verdict are already
  correct, so a one-line render fix plus report.md regeneration unblocks merge;
  no split/escalate needed."
text: "Fix exactly one line in the poc folder (production paths untouched):
  report.py:250 change pct(precision and precision) to
  pct(accepted['meaningful_recall']). Regenerate report.md section 4.3 (lines
  209-215) from metrics.json. Verify displayed values: decider-nano rubric
  0.5/veto Recall 27.9% (not 3.1%), bekko rubric 37.7% (not 11.8%), ettin/minilm
  100% (not n/a). Confirm best-cell selection and compliance table 4.4 unchanged
  and verdict unaffected. Do not touch metrics computation, corpus, or selection
  logic."
persist: false


--- Decision 007-item-test-debloat-audit-i2.yaml ---
id: decision-test-debloat-audit-i2-1794158623946
context: item
item: test-debloat-audit-i2
afterRecord: 004-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T17:23:43.946Z
rationale: "All 10 fix requests verified as factual regressions from r1 to r2
  (spot-checked: cli.py:292-367 has force-fix/format/cwd/config-status beyond
  MAIN_ARGPARSE_CASES; _SHIPPED_CONFIG_FILES has 11 labels; smoke test is the
  sole default full-pipeline pin). Root cause is methodological: r2 counted defs
  not collected tests, invented owner tokens, and dropped r1
  clusters/limbs/reservations. The unified-map inter-dep file exists in-repo, so
  alignment is mechanical. One guided rewrite of the report (zero repo writes)
  unblocks merge; no split/escalate needed."
text: "Retry granted. Rewrite the report (report-only, zero repo writes) fixing
  all 10 in this order: (1) Owners: restore the unified-map 5-owner scheme
  exactly (runner/checkers/setup-testing/semantic/root, counts 67/83/15/4/15)
  from coding-rules-audit-i2 output.yaml:82-88; delete the 10 invented tokens;
  test_suppression file stays checkers-file with
  TestSuppressionRerankerPipeline:357-390 as the semantic symbol skip. (2) N|S
  counts: re-derive EVERY row from per-file `pytest --collect-only` truth
  (default|slow), never def counts; fix the ~25 listed files (e.g.
  semantic-check 82|3, threshold 80, lint-runner 58, stats 87). (3) Pinning:
  restore all ~15 blocking-debt limbs from r1 (cli --force-fix+env, --format,
  --cwd, --config-status; 11-label vs 7-label config gap; mypy/rumdl/ty
  _config_flag_for branches; dispatch scopes
  ty-src/pylint-pyi-src/pylint-tests-tests/tach-whole-repo; pyright tests/** and
  rumdl tests/data exclusions) — grep-verify each has zero pins. (4) Self-lint
  removals: list all six groups (noise-filter, TestModuleSizeGates,
  private-imports AST scan, autofix-conflict slow, downstream-integration
  home-write, t9_7 hardcoded checkout) with surviving gates. (5) Reservations:
  restore epic verbatim (tests/checkers/conftest.py, tests/assumptions
  runtime/decision/cache, _decision_backend/_decision_cache); delete invented
  runner/runtime paths; tests/conftest.py is root-owned. (6) Symbols: restore
  _base.py:143-238 check_if_meaningful (+pyi) and no_try_import
  _OPTIONAL_IMPORT_PATTERNS exclusions. (7) Duplicates: restore duplicate-of for
  _make_tc x13, _walk_and_release x10, _msg_ids x8, t3-vs-stats
  parser-completeness exact dup, autofix fake-vs-git, setup 6x install,
  _UvCallRecorder x2 — or explicitly justify each drop. (8) Keep
  test_real_pipeline_smoke.py (sole default full-pipeline pin; integration.py is
  explicit-only) or name a default-collected survivor. (9) Slow budget:
  recompute from truth (baseline-edge 16|2 both in TestPerfBenchmark,
  suppression 40|2) — 18->13 not 14. (10) Runtime: restore integration 65-107s
  with conditions (WSL2/py3.14.4/warm-cache ±30%). Verify: owners match unified
  map exactly; every N|S matches --collect-only; every limb/gap above named."
persist: true


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


## Task Status
iteration: 3
amendments: 0
items:
  - ownership-map-revalidation kind=fact-finder wave=1 status=running outlineRef=ownership-map-revalidation
  - secrets-baseline-exclusion kind=no-behavior wave=1 status=merged outlineRef=secrets-baseline-exclusion
  - pylint-cache-semantics-closure kind=test-assumptions wave=1 status=merged outlineRef=pylint-cache-semantics-closure
  - adr-formalization kind=no-behavior wave=1 status=merged outlineRef=adr-formalization
  - epic-kickoff-gate kind=fact-finder wave=2 status=pending outlineRef=epic-kickoff-gate
  - epic-shift-report-collection kind=fact-finder wave=3 status=pending outlineRef=epic-shift-report-collection
  - golden-regen-hatch kind=test-only wave=4 status=pending outlineRef=golden-regen-hatch
  - final-gate-validation kind=fact-finder wave=5 status=pending outlineRef=final-gate-validation
waves: 1, 2, 3, 4, 5
merged: secrets-baseline-exclusion, pylint-cache-semantics-closure, adr-formalization
blocked: (none)
failed: (none)
open steer questions:
  - awareness-model-eval-poc-single-adjudicator-labels ref=model-eval-poc disposition=human-awareness: All real-repo ground truth was adjudicated by one author with no inter-rater check; borderline terse justifications ('planted violation', 'usage docs in .pyi', 'optional semantic extra', 'test helper for readability') are all True. The 85% meaningful-recall / 95% meaningless-precision bars inherit this subjectivity. Final report must disclose the adjudication protocol and edge-case rubric; architect can decide if sampled second-rating is needed.
  - awareness-model-eval-poc-single-adjudicator-structural-no-go ref=model-eval-poc disposition=human-awareness: Verified: contracted accepted stratum is 215 meaningful / 0 meaningless (the sole repo_suppression negative c188 is heuristic-rejected), so 95% precision is unevaluable by construction and heuristic baseline is 100% by definition (test-table labels assert heuristic behavior). All 183 repo labels are single-author (repo_labels.json) with terse borderlines ('planted violation', 'usage docs in .pyi') all True; the 39 hard negatives making augmented precision non-vacuous are author-written sensitivity data. Report discloses this (§6 + §3). Architect can decide whether a double-rated real brush-off sample is needed before any future go/no-go; no further PoC action required for the no-go itself.
  - awareness-plan-2-cache-location-choice ref=plan-2 disposition=human-awareness: Assumption places JSON cache at linted root next to baseline with weights in user cache, affecting gitignore/hatch inclusion/consumer repos/secrets scanning. Spikes can assume path with DECISIONS_PATH isolation but operator should confirm filename/location before iteration-3 implementation. Record informational review.
  - awareness-plan-2-fastino-license-gating ref=plan-2 disposition=human-awareness: Assumption correctly blocks Fastino until review, prefers Apache candidates, excludes CC-BY-NC. If eval recommends GLiDE implementation must pause for approval. No blocking now: matrix+eval proceed Apache-first. Operator must see gating criterion. Record informational review.
  - awareness-plan-2-fastino-license-review ref=plan-2 disposition=human-awareness: Plan correctly proceeds Apache-first, flags Fastino/unclear, pauses implementation if GLiDE recommended. Operator should be aware eval may recommend non-MIT-compatible model; no blocking decision needed until eval verdict.
  - awareness-plan-2-material-behavior-definition ref=plan-2 disposition=human-awareness: Assumption defines golden SEMANTIC=0 + unit/CLI/baseline/configs as material and reranker accept/reject as non-material, letting model swap change W9704 verdicts while claiming preservation. Architect can proceed with spikes but operator must see this redefinition of every material behavior. Record informational review.
  - awareness-plan-2-material-tightening-visibility ref=plan-2 disposition=human-awareness: Assumption allows tightening (accepted+miss+absent True, hit False) as intentional, not regression. Operator should be aware SEMANTIC=1 golden will shift; shift report+CHANGELOG+root regen protocol must be visible before iteration-3.
  - awareness-plan-3-dotted-path-injection-risk ref=plan-3 disposition=human-awareness: PYTHON_SETUP_LINT_DECISION_BACKEND dotted path has no test-only enforcement (pytest guard/allowlist); if honored in production lint, env control equals code execution. Architect can decide guard now; operator should be aware. Document in ADR-010 with loader test.
  - awareness-plan-3-model-deferral-awareness ref=plan-3 disposition=human-awareness: Intent requires replacing reranker with CPU-friendly decision model (GLiDE-0.4B or smaller) + git cache. ADR-009 defers model to follow-up on corpus repair + Fastino license verdict; iteration-3 delivers DecisionBackend/cache/FakeBackend, no model. Justified by 215/0 eval no-go but operator must approve close-up will not claim swap complete. Record follow-up triggers (double-rated sample, license decision, CPU benchmark).

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
