# Step: Architect Close-Up

## Goal
Determine the final iteration outcome following the completeness audit by the plan close-up agent.

## Rules
- Exploration budget: ground decision in the plan close-up audit findings, task INTENT, and the prepared context pack (`# Context Pack — `modernize`

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
`). Read code ONLY to verify specific disputed claims or gate reports (few targeted reads, never broad scans). Keep terse.
- Decision options (yield `status` matching `plan-closeup.schema.json`):
  - `complete`: the task's `INTENT.md` is fully satisfied with verified working code, comprehensive tests, and green gates.
  - `next-iteration`: scope remains unfulfilled; proceed to iteration N+1 with updated requirements and hydrated context.
  - `blocked`: execution cannot proceed without human operator resolution. Formulate a precise, answerable `question` for the operator.
- Yield `{iteration, status, summary, question?, completedMilestones?, remainingMilestones?, techDebt?}`. Copy milestone/tech-debt lists from the audit when they still hold.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.
- Rationale required: ground your decision in the plan close-up audit findings, verifying whether all milestones and Gherkin scenarios are genuinely delivered.

## Plan Close-Up Audit
{
  "iteration": 3,
  "status": "next-iteration",
  "summary": "M1 repo work VERIFIED: .secrets.baseline:41-46 has should_exclude_file ^\\.factory/ in list-pattern form; tests/assumptions/test_pylint_cache_semantics.py (485 lines, 19 tests) contains the writer-first verdict (writer+timing+--path+jobs=1, crash-safe, no lock/sidecar); docs/adr/ has 12 files with ADR-009/010/011/012 full Context/Decision/Consequences, 001/005/006 staleness notes, README locations cross-ref to design/. Map-revalidation and kickoff-gate reports are orchestration records outside repo containment and were not traced. M2 ZERO DELIVERY: runner dispatch.py:1 still too-many-lines (542 lines, unsplit), EXPECTED_TOOL_NAMES still derived (dispatch.py:144) but baseline.py:23-42 + .pyi retain _FALLBACK_TOOLS/peek_fallback_tools/_compare_sorted shims, tests/runner/_factories_extras.py:1,6 duplicate too-many-lines (511 lines, unsplit), hardcoded /home/slava paths in 4 runner test files, test_self_lint_clean/test_pyright_noise_filter/test_config_consistency/test_runner_private_imports retained; checkers has no _source_stream.py, _legacy_scan retained (suppression_justification_checker.py:61,63), trivial_wrapper_checker.py:33-36 retains _legacy_* + peek_fallback_tools exemptions, register() justifications unstandardized, 4 mixin type-ignore[misc] retained with no shared base, tests/checkers/_factories.py still 1393 lines single file, W9704 call sites still rule=\"unjustified-suppression\" single code (no joined sorted codes), SEMANTIC=0 guards only in 2 semantic-owned files; semantic has zero DecisionBackend/DECISION_THRESHOLD/PROMPT_VERSION/FakeBackend/get_backend/_decision_backend/_decision_cache/.python-setup-decisions.json in src, _semantic.py:1-52 still cross-encoder reranker with ~/.cache + jina model, _base.py:238 still exact-match rule-echo, pyproject:29-31 [semantic] still sentence-transformers, _OPTIONAL_IMPORT_PATTERNS still {sentence_transformers}. M3 FAILS: lint.baseline [] holds and golden files exist, but docs must-contain checklist fails everywhere (AGENTS.md:9-11 stale 1290/7 counts, no ruff-format scope row, :79-85 still reranker pipeline; semantic-justification.md still reranker-first + ~/.cache results.json; custom-checks.md:97 still reranker; troubleshooting.md still download-failure section, no DECISION_MODEL/RERANKER-deprecated; CHANGELOG top v1.2.9 vs pyproject 1.2.10; README:72 still v1.2.5 pin). No shift-report/regen-hatch/gate-table evidence in repo. Gates (pytest/lint/integration/detect-secrets exit codes) unverifiable under read-only no-bash audit; verdict is static inspection only.",
  "completedMilestones": [
    "M1"
  ],
  "remainingMilestones": [
    "M2",
    "M3"
  ],
  "techDebt": [
    "TD3-B1 still open: no DecisionBackend/cache infra built; corpus 215/0 defect + Fastino license + CPU benchmark untouched",
    "TD3-A1 partially open: ADR reconciliation done, but AGENTS.md counts/scope rows, CHANGELOG version, README pin all still stale",
    "TD3-A2 fully open: dispatch.py 542 + _factories_extras.py 511 + _factories.py 1393 over-limit with disables, baseline shims retained, stream blocks unconsolidated, mixin misc unattempted",
    "TD3-I2 mechanism landed but green-scan exit 0 + planted-secret exit 1 unverified without execution",
    "M2 epic work (runner/checkers/semantic) entirely outstanding; M3 golden/docs/gate close-out blocked on it"
  ]
}

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

## Task Intent
# modernize

Modernize the project while preserving every material lint/check behavior.
- Enforce the project's coding rules (CodingRules.md, AGENTS.md) across the code base.
- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
- Remove redundant tests.
- Replace the embedding/rerank based justification/comment check
  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.


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
- iteration (integer, required, min: 1)
- status (string, required, enum: ["complete","next-iteration","blocked"])
- summary (string, required)
- question (string, optional)
- completedMilestones (array of string, optional)
- remainingMilestones (array of string, optional)
- techDebt (array of string, optional)
