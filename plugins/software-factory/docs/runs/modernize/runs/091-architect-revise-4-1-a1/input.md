# Step: Architect Revise

## Goal
Revise the iteration execution plan (`plan-N.yaml`) in response to adversarial feedback from the plan reviewer.

## Rules
- Exploration budget: evaluate review feedback against the plan and the prepared context pack (`# Context Pack — `modernize`

Repository: `python-setup` v1.2.10 (`pyproject.toml:1-4`), Python `>=3.14`, MIT. The intent has three strands: enforce `CodingRules.md`/`AGENTS.md` across the code base, debloat code and tests while keeping test intent, and replace the embedding/reranker justification check with a CPU-friendly small decision model plus a git-stored, self-cleaning cache.

---

## 1. Snapshot and Gate State

| Fact | Evidence |
|---|---|
| Version / Python floor | `pyproject.toml:1-4` (`1.2.10`, `>=3.14`) |
| Lint baseline | `lint.baseline:1` is `[]` — zero tolerated pre-existing violations |
| Self-lint gate | `uv run lint` runs 14 tools with baseline diffing; pre-commit hook runs `lint --fix --baseline lint.baseline` (`AGENTS.md:9-12`, `AGENTS.md:129-138`) |
| Pylint complexity gates | `max-module-lines=500`, `max-statements=65`, `max-branches=16`, `max-locals=20` (`config/.pylintrc:2`, `config/.pylintrc:21-27`); tests have their own rcfile (`config/.pylintrc-tests:19-39`); stubs have their own rcfile (`config/.pylintrc-pyi:8-39`) |
| Default pytest selection | `addopts = "-m 'not slow'"`; markers `slow`, `no_external_api`, `with_real_api`, `implementation_detail` (`pyproject.toml:48-55`) |
| Unit probe (2026-11-08) | `uv run pytest -q` → `1378 passed, 4 skipped, 18 deselected, 4 warnings in 27.19s`; the 4 skips are `pytest.importorskip("sentence_transformers")` in `tests/checkers/test_semantic_check.py:432,453,473,493` |
| Integration probe (2026-11-08) | `uv run pytest tests/integration.py -q` → `9 passed in 65.61s` |
| Pylint trio probe (2026-11-08) | `uv run lint --tools "pylint,pylint-pyi,pylint tests" --baseline lint.baseline` → pylint reports `10.0/10`, baseline reports no new violations, 37.86s |
| AGENTS counts are stale | `AGENTS.md:10-11` says `1290 pass, 4 skip, 15 deselected` and `7` integration tests; actual probes are 1378/4/18 and 9 |
| Integration is not in the default selector | `tests/integration.py` is named `integration.py`, not `test_*.py`; pytest default collection plus `pyproject.toml:48-55` means `uv run pytest -q` does not run the golden end-to-end test. `AGENTS.md:92` tells developers to run it explicitly |
| Self-lint test is slow/deselected | `tests/runner/test_self_lint_clean.py:17` sets `pytestmark = pytest.mark.slow`; it asserts rc 0, no `[CRASH]`, no unexpected `SKIPPED`, and pylint `"score": 10.0` (`tests/runner/test_self_lint_clean.py:20-59`) |

**ADRs at HEAD are decisions, not implementation.** `docs/adr/ADR-009.md:5` accepts a deferral, `docs/adr/ADR-009.md:29-37` says iteration 3 delivers a `DecisionBackend` plus tracked-cache infrastructure, and `docs/adr/ADR-010.md:23-36` freezes the backend/cache contracts. At HEAD the production module still uses `sentence_transformers.CrossEncoder` and `~/.cache/python-setup/semantic/results.json` (`src/python_setup_lint/checkers/_semantic.py:1-12`, `:37-52`, `:93-122`); no `DecisionBackend`, `get_backend`, or `.python-setup-decisions.json` implementation exists in `src/`. This is the central semantic open question (see §7).

---

## 2. Module Map

### 2.1 Checker subsystem (`src/python_setup_lint/checkers/`)

| File(s) | Responsibility |
|---|---|
| `_base.py` (238 lines) + `_base.pyi` | Shared checker helpers: `MessageDef`, `_msgs`, path/source-root helpers, `SourceRootMixin`, `FunctionVisitMixin`, and the public `check_if_meaningful` decision entry point (`_base.py:27-238`). |
| `_semantic.py` (189 lines) + `_semantic.pyi` | Optional NLP justification pipeline: lazy `CrossEncoder` load, pair scoring at threshold 0.5, in-memory + home-directory JSON result cache (`_semantic.py:1-12`, `:37-189`). |
| `conformance/` (17 checker modules) | Pylint checkers implementing project rules: `no-try-import`, `missing-beartype`, `missing-return-annotation`, `unjustified-suppression` (W9704), `bare-except-comment`, `silent-except`, `trivial-wrapper`, `redundant-type-guard`, `generic-key-dict`, `unnamed-tuple-dict`, `pyi-underscore-symbol`, `use-structlog`/`use-structured-logging`, `missing-error-chain`, `asyncio-timeout`, `tempfile-mkdtemp-in-test`. Registration is `register(linter)` in each module; the installer discovers them via `pkgutil.walk_packages` (`setup.py:97-116`) and adds them to consumer `load-plugins` (`setup.py:179-203`). |
| `stub/` | Stub checker (`stub/checker.py`, 379 lines), coverage/resolution (`stub/coverage.py`, 241 lines), import contract, docstring rules (`stub/docstring_checker.py`, 237 lines), and fidelity invariants (`stub/fidelity/*`, ~0.8k lines). |

### 2.2 Runner subsystem (`src/python_setup_lint/runner/`)

| File(s) | Responsibility |
|---|---|
| `dispatch.py` (542 lines) | Single-source 14-tool registry (`TOOLS`, `dispatch.py:46-137`), live `LINT_TOOLS` registry (`:503-507`), seven per-tool strategy subclasses (`:155-451`), `register_lint_tool` (`:517-542`). |
| `cli.py` (413 lines) | `main`/`run_lint` orchestration, fix phase, tool selection, baseline handling (`run_lint` at `:204-273`; CLI parser at `:274-413`). |
| `baseline.py` (303 lines) | Violations-only baseline capture/diff, sorted atomic JSON writer (`:182-229`), legacy-compatible shims (`:20-42`). |
| `parsers.py` (290) + `_record_parsers.py` (277) | Per-tool text/JSON record parsers and `Record` type; backward-compat re-exports (`parsers.py:7-31`). |
| `cmd_build.py` (293) | Command construction, path/glob discovery, config-flag resolution, pylint rcfile resolution. |
| `output.py` (265) | Subprocess execution (`_run_cmd`, `:153-223`), memory guard (`RLIMIT_AS`, default 2048 MB), statistics printing. |
| `types.py` (65) | `ToolSpec`, `LintResult`, `ViolationCount`, `RunnerConfig` (`types.py:12-65`). |
| `_config.py` (152), `_cli_complexity.py` (154), `_cli_helpers.py` (65), `_autofix.py` (125), `extra_tools.py` (322), `_baseline_helpers.py` (82), `_record_types.py` (19) | Supporting config, CLI, autofix, declarative extra-tool, and baseline helpers. |

### 2.3 Setup / testing / packaging

| File(s) | Responsibility |
|---|---|
| `setup.py` (413) + `_setup_precommit.py` (145), `_setup_pyproject.py` (97), `_setup_update.py` (108) | Consumer install/update: add dependency, checker discovery + `load-plugins`, pre-commit template, AGENTS snippet, config symlinks, drift detection, state file (`setup.py:35-53`, `:97-116`, `:179-205`, `:365-413`). |
| `testing.py` (196) | Consumer-agnostic test helpers: `_make_tc`, `_walk_and_release`, `make_lint_result`, `FakeRunCmd`, pre-commit validators (`testing.py:18-196`). |
| `pyproject.toml` | Main deps (`astroid>=4.0.4`, `beartype`, `pylint`, `pytest`, `structlog`, `tomli-w`; `:10-16`), optional `[semantic]` extra (`:28-31`), wheel force-includes `config/` and `CodingRules.md` (`:39-46`), pytest config (`:48-55`), dev group (`:58-85`). |
| `config/` | Shipped tool configs: `.pylintrc`, `.pylintrc-tests`, `.pylintrc-pyi`, `ruff.toml` (line-length 130, target `py314`), `mypy.ini` (`strict = true`), `pyrightconfig.json`, `ty.toml`, `rumdl.toml`, `yamllint`, `tach.toml`. |
| `CodingRules.md`, `AGENTS.md`, `README.md`, `docs/` | Shipped coding rules, agent index, user docs, semantic docs, troubleshooting, tutorials, ADRs (`docs/adr/`). |
| `tach.toml` | Module boundaries: `python_setup_lint/checkers` and `python_setup_lint/runner` both declare `depends_on = []`; checkers must not import runner (`tach.toml:14-21`). Any new decision module must respect this. |

### 2.4 Tests (`tests/`)

59 `test_*.py` modules plus helpers, ~18.8k lines excluding `tests/data/`. Layers: unit checker tests (`tests/checkers/`), runner tests (`tests/runner/`), third-party assumption tests (`tests/assumptions/`), golden-helper tests (`tests/test_golden.py`), setup/config-symlink tests, and the non-auto-collected end-to-end `tests/integration.py` with planted-violation sample project and golden snapshot (`tests/data/golden/*.json`).

---

## 3. Key Interfaces & Signatures

### 3.1 Justification decision entry point — `check_if_meaningful`

`src/python_setup_lint/checkers/_base.py:142-238`:

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

Flow:

1. If `PYTHON_SETUP_LINT_SEMANTIC` is `"1"` (default), lazily import `semantic_check_if_meaningful` and call it with `(text, rule=..., code_context=..., comment=...)` (`_base.py:150-158`).
2. If the semantic function returns `None`, fall back to the heuristic (`_base.py:160-211`): empty or `<5` chars rejects; a 50-entry boilerplate set rejects; a 16-entry meaningless-phrase set rejects; a justification equal to the rule symbol rejects (`_base.py:210-238`).

`_base.pyi:69-95` documents this helper but says `*rule*` and `*code_context*` are “reserved for future semantic analysis” — stale, because both are used by `_semantic.py:164-177`.

Call sites (all five pass a real rule/context):

- `SuppressionJustificationChecker._emit_if_unjustified` — `conformance/suppression_justification_checker.py:149-155`.
- `SuppressionJustificationChecker._has_justification` — same file `:370-386` (trailing and preceding comment paths).
- `BareExceptCommentChecker._has_justifying_comment` — `conformance/bare_except_comment_checker.py:103-120` (trailing and preceding comment paths).

### 3.2 Semantic implementation — `semantic_check_if_meaningful`

`src/python_setup_lint/checkers/_semantic.py:125-189`:

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

| Detail | Evidence |
|---|---|
| Primary text is `(comment or text).strip()`; empty returns `False` before key computation | `_semantic.py:133-140` |
| Cache key = SHA-256 over `(text, rule, code_context, comment, _RERANKER_MODEL)`, truncated to first 8 bytes / 64-bit int | `_semantic.py:142-157` |
| Model singleton is lazy-loaded; `ImportError` or load failure sets `_RERANKER_UNAVAILABLE` and returns `None` | `_semantic.py:93-122` |
| Query = `"rule: ... | context: ..."` when rule/context exist, otherwise self-pair `(primary, primary)` | `_semantic.py:164-177` |
| Score below `0.5` rejects; each new verdict is appended to `_RESULT_CACHE` and the whole JSON file is rewritten | `_semantic.py:178-189` |
| Public stub exposes only `semantic_check_if_meaningful`; `__all__` also exposes private test hooks `_RERANKER_UNAVAILABLE`, `_load_reranker`, `_reset_cache` | `_semantic.pyi:1-24`, `_semantic.py:26-31` |
| The optional extra is only `sentence-transformers>=3.0.0` | `pyproject.toml:28-31` |

### 3.3 Cache and model constants (current, to be replaced)

`_semantic.py:37-52`:

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

Load/save are best-effort: missing file → `{}`; corrupt JSON/OSError/ValueError → warning + `{}`; save uses non-atomic `Path.write_text` (`_semantic.py:55-78`). `_reset_cache` clears both globals and unlinks the file (test helper; `:81-91`). `.gitignore:243-244` explicitly ignores `.cache/python-setup/semantic/`.

### 3.4 Planned backend contract from ADR-010 (absent at HEAD)

`docs/adr/ADR-010.md:23-36` fixes:

- `DecisionBackend` Protocol: `decide(justification, rule, context) -> float` in `[0.0, 1.0]`, with a heuristic-first hard gate.
- Tracked cache `.python-setup-decisions.json` at the linted project root: sorted JSON array, `indent=2`, `sort_keys`, no bare hex strings of length ≥20, must pass the secrets scan.
- Ordinary lint is read-only with a hash-asserted zero-write check; cache updates only through an explicit CI-guarded refresh path (lockfile + merge + atomic replace).
- Prune missing files and stale model identifiers.
- Concurrency semantics must come from the `pylint-cache-assumptions` verdict, not invented.
- `PYTHON_SETUP_LINT_DECISION_BACKEND` is honored only when `PYTEST_CURRENT_TEST` is set; production lint ignores it.

No implementation module exists at HEAD; `_semantic.py` remains the only decision path.

### 3.5 Runner interfaces relevant to a cache-refresh command

- `ToolSpec` fields include `timeout`, `memory_limit_mb`, `supports_path`, `supports_fix` (`runner/types.py:12-22`); default memory limit is 2048 MB (`types.py:22`) and pylint specs use that default (`dispatch.py:112-132`). `_run_cmd` applies `RLIMIT_AS` and injects `cwd/.venv/bin` on PATH (`runner/output.py:153-223`).
- `run_lint` accepts `path`, `fix`, `baseline`, `overwrite_baseline`, `statistics`, etc. (`runner/cli.py:204-273`); `main` exposes `--baseline`, `--overwrite-baseline`, `--path`, `--tools`, `--cwd`, `--config` (`runner/cli.py:284-360`). There is no decision-cache refresh flag today.
- The setup CLI has only `install` and `update` subcommands (`setup.py:365-413`); a `refresh-decisions`/`prune-decisions` command would be a new surface.
- `runner/baseline.py:201-229` is the existing pattern for a sorted, atomic, `indent=2`, `sort_keys` JSON artifact; it uses a temp file in the system temp dir and `shutil.move`, whereas ADR-010 asks for atomic replace at the project root.

### 3.6 Checker helper / test harness interfaces

- `SourceRootMixin` declares `source-roots` option, resolves it in `open()`, and exposes `_skip_if_outside_source_roots` (`checkers/_base.py:96-128`).
- `FunctionVisitMixin` dispatches `visit_functiondef`/`visit_asyncfunctiondef` to `self._check_function` (`_base.py:131-140`).
- `testing._make_tc` builds a `CheckerTestCase`; `_walk_and_release` parses source, optionally sets `module.file`, walks, and drains messages (`testing.py:18-41`).
- Checker tests import `_walk_and_release` directly or via `tests/checkers/_factories.make_tc` (`tests/checkers/_factories.py:40-43`).

---

## 4. Relevant Excerpts and Implementation Logic

### 4.1 Current semantic pipeline is reranker-first, not heuristic-first

`_semantic.py:1-12`:

```python
# Semantic justification checker using a cross-encoder reranker (Track B).
# ...
# 1. Cross-encoder reranking (jina-reranker-v2-base-multilingual):
#    Re-score the justification against the rule and code context with a
#    dedicated cross-encoder for higher accuracy.
# ...
# On ImportError ... or model download failure, semantic_check_if_meaningful
# returns None, signalling the caller to fall back to the heuristic check.
```

This is the opposite ordering from ADR-010’s “heuristic-first hard gate.” The current gate is in `_base.py:150-158`: semantic first, heuristic only when `None`.

### 4.2 `semantic_check_if_meaningful` scoring and write path

`_semantic.py:142-189` (condensed):

```python
cache_key = hashlib.sha256(
    "|".join(str(x) for x in (text, rule, code_context, comment, _RERANKER_MODEL)).encode()
).digest()
cache_key_int = int.from_bytes(cache_key[:8], "big")
if cache_key_int in _RESULT_CACHE:
    return _RESULT_CACHE[cache_key_int]

reranker = _load_reranker()
if reranker is None:
    return None
...
scores = reranker.predict([(primary, query)])
result = float(scores[0]) >= 0.5
_RESULT_CACHE[cache_key_int] = result
_save_result_cache()
return result
```

Implications: one model prediction per cache miss, synchronous whole-file rewrite, no file path in the key, no prune path, no explicit model metadata beyond the key.

### 4.3 W9704 emission and the two decision call paths

`SuppressionJustificationChecker` defines W9704 (`suppression_justification_checker.py:31-41`), scans raw lines for suppression patterns while excluding string-literal spans (`:44-91`), checks `Any` annotations/functions (`:96-162`), and evaluates trailing/preceding comments (`:331-388`). The call site inside `_emit_if_unjustified` is:

```python
if check_if_meaningful(
    reason, comment=reason, rule="unjustified-suppression", code_context=src_line.split("#", 1)[0].strip()
):
    return
self.add_message("unjustified-suppression", ...)
```

`BareExceptCommentChecker._has_justifying_comment` performs the same trailing/preceding-comment shape for `bare-except-comment` (`bare_except_comment_checker.py:74-120`). The two checkers duplicate comment extraction and `check_if_meaningful` wiring; a shared source-stream/comment helper is a natural debloat target (ADR-011 names a planned `checkers/_source_stream.py`, which does not exist at HEAD).

### 4.4 Cache writer verdict that any redesign must consume

`tests/assumptions/test_pylint_cache_semantics.py:11-48` records the writer-first verdict:

- Writer identity: `semantic_check_if_meaningful` calls `_save_result_cache`; runner performs no merge; checker `open()`/`close()` do not write.
- Timing: one whole-file rewrite per miss, synchronously before return; hits, heuristic fallbacks, and empty-primary short-circuit write nothing.
- `--path` scoping: `--path` only narrows file arguments; the cache key is path-free, so scoped and full runs share entries.
- Sweep implication: because identity is path-free, a tracked schema needs per-entry `files` references; today’s schema is only `dict[int, bool]`.
- Concurrency: pylint `jobs` defaults to 1; shipped rc files do not raise it; a consumer override with `jobs > 1` voids the single-writer claim and flips to sidecars/merge or lock + atomic replace.
- Crash safety: current writer is non-atomic `Path.write_text`; corrupt JSON loads as empty and is recomputed.

The test also pins the current contract directly: home-dir single cache (`test_pylint_cache_semantics.py:298-305`), path-free signature (`:276-296`), one `_save_result_cache` caller (`:335-349`), and no cache artifacts outside `_semantic.py` (`:351-364`).

### 4.5 ADR-010 conflicts with the current tests

`docs/adr/ADR-010.md:26-28` requires a project-root tracked JSON array with per-entry file/model metadata and no long bare hex; `tests/assumptions/test_pylint_cache_semantics.py:298-305` asserts a single `~/.cache/python-setup/semantic/results.json`, and `:276-296` asserts the API/signature is path-free. `tests/checkers/test_semantic_check.py:321-360` independently recomputes the 64-bit SHA-256 key and pre-populates `_RESULT_CACHE`. A redesign must rewrite these tests, not merely extend them.

### 4.6 `pylint-pyi` scoping defect (rule-enforcement gap)

`_PylintPyiLintTool.build_command` passes `.pyi` file paths to pylint (`runner/dispatch.py:342-370`; `_find_pyi_files` at `runner/cmd_build.py:82-93`). Probe behavior:

- A temp `.pyi` with a companion `.py` is skipped by pylint (even a syntactically broken `.pyi` produces no error); an orphan `.pyi` is linted and `pyi-underscore-symbol` fires.
- The committed golden confirms the consequence: of 43 `pylint-pyi` findings in `tests/data/golden/minimal_sample_project_findings.json`, 42 are on `.py` files and only 1 is on `standalone.pyi` (the orphan stub).

So `pylint-pyi` currently re-lints companion `.py` modules under the pyi rcfile and does not enforce `pyi-underscore-symbol`/`duplicate-code` on companion stubs. A probe of `src/python_setup_lint/**/*.pyi` found 205 non-`TYPE_CHECKING` private symbols in 29 stub files (169 functions, 5 classes, 31 annotated assignments) that the `PyiUnderscoreChecker` would flag if stubs were actually linted (`conformance/pyi_underscore_checker.py:19-90`). `.pylintrc:4` and `.pylintrc-tests:22` ignore `*.pyi`, so only `pylint-pyi` is supposed to cover them. This is a high-signal enforcement gap; fixing it changes the golden contract and would expose a large latent cleanup.

### 4.7 Existing sorted-JSON/atomic-write patterns

- Baseline writer: `runner/baseline.py:201-229` uses temp file + `json.dump(..., indent=2, sort_keys=True)` + `shutil.move`; `_write_baseline_if_modified` is gated by a `baseline_modified` flag.
- Setup atomic writer: `_setup_precommit.py:70-84` uses `NamedTemporaryFile(dir=gettempdir(), delete=False)` + `shutil.move`.
- Setup state writer: `setup.py:278-290` writes `.python-setup-state.json` with `json.dumps(..., indent=2, sort_keys=True)` via `_atomic_write`.
- Baseline diffing silently rewrites the baseline on removals (`runner/baseline.py:286-299`), which is a precedent for auto-pruning but conflicts with ADR-010’s read-only decision-cache rule; the architect should decide whether the decision cache follows the baseline model or the stricter ADR-010 model.

---

## 5. Existing Tests and Conventions

### 5.1 Test layers and commands

| Layer | Command | Scope / evidence |
|---|---|---|
| Unit | `uv run pytest -q` | 59 `test_*.py` modules; excludes `slow`; ~27-34s; probe 1378 passed, 4 skipped, 18 deselected |
| Integration / golden | `uv run pytest tests/integration.py -q` | End-to-end install + 14-tool lint on `tests/data/minimal_sample_project`; golden multiset + oracle rules + per-tool minimums; probe 9 passed, 65.6s (`tests/integration.py:1-10`, `tests/_golden.py:1-12`) |
| Self-lint | `uv run lint` | 14 tools, baseline diff, ~100s warm per `AGENTS.md:9`; pre-commit hook runs it with `--fix` (`AGENTS.md:129-138`) |
| Self-lint guard | `uv run pytest tests/runner/test_self_lint_clean.py -q -m slow` | Slow/deselected; asserts rc 0 and pylint 10.0 (`test_self_lint_clean.py:17-59`) |
| Assumptions | `uv run pytest tests/assumptions -q` | Pins astroid 4.0.4, beartype 0.22.9, pylint 4.0.6, and the semantic cache writer verdict |

### 5.2 Checker test conventions

- Most checker tests use `_walk_and_release(code, CheckerClass, file_path=...)` and assert on `msg.msg_id` (`tests/checkers/test_suppression_justification_checker.py:1-120`; `testing.py:18-41`).
- Shared parametrize tables and helpers live in `tests/checkers/_factories.py` (1393 lines, 16 functions), imported by 9 checker test modules. The file header claims “data tables are free LOC” and disables `too-many-lines` (`tests/checkers/_factories.py:1-15`), but `CodingRules.md:139-159` does not grant that exemption.
- Runner tests use `RunnerConfig`, `make_lint_result`, `FakeRunCmd`, and `tests/runner/_factories*.py` (209 + 279 + 394 + 511 lines) imported by 16 runner test modules; `tests/runner/_factories_extras.py:1` and `:6` both disable `too-many-lines` and claim 502 lines while the file is 511.
- Fixtures: `tests/conftest.py` provides `tmp_baseline`, `runner_config_factory`, `isolated_runner_registries`, `empty_project`, `configured_project` (`tests/conftest.py:1-160`). `configured_project` runs install once per session with a hardcoded `dev_path="/home/slava/aiexp/python-setup"` (`tests/conftest.py:86`).
- Project helpers: `tests/_project_helpers.py` is the single source for sample-project copy, git init/stage, shipped config paths, runner config, and install idempotency (`tests/_project_helpers.py:1-204`). It must not import `tests.conftest`/`tests.integration` (module docstring `:1-8`).
- Test naming convention is `test_<method>_given_<condition>_then_<expected>` (`CodingRules.md:288-290`). Probe: 497/799 test functions (62.2%) match; 60+ files are below 50%. `CodingRules.md:256-270` requires every test to be `no_external_api` or `with_real_api`; probe: 31/60 test modules carry a category marker.

### 5.3 Golden behavior-preservation contract

`tests/_golden.py` is the sole owner of normalization/serialization/assertions; a `Finding` is `(tool, file, line, col, rule)`, compared as a multiset (`Counter`) so duplicates, moved lines, new false positives, and dropped findings fail (`tests/_golden.py:1-12`, `:53-120`). Regeneration is opt-in via `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1` and refused under CI (`tests/_golden.py:9-12`, `:370-420`). The golden capture explicitly disables the semantic pipeline with `monkeypatch.setenv(SEMANTIC_ENV, "0")` (`tests/integration.py:109-113`), and asserts the planted brush-off at `src/minimal_sample/mod.py:49` fires while the carry-from justification at `:56` does not (`tests/integration.py:124-129`; sample source `tests/data/minimal_sample_project/src/minimal_sample/mod.py:45-57`).

Consequently, the model swap has **no deterministic coverage**: the golden pins heuristic W9704 behavior only; the 4 reranker pair tests skip without `sentence_transformers`, and the 2 slow semantic tests are deselected by default (`tests/checkers/test_semantic_check.py:424-506`; skip probe above).

### 5.4 Semantic test inventory and redundancy

| File | Lines / roles | Redundancy / impact |
|---|---|---|
| `tests/checkers/test_semantic_check.py` | 506 lines; 7 classes: import fallback, default fallback, reranker sentinel, brush-off patterns, meaningful patterns, pipeline, reranker pairs (`:20-506`) | Over C0302; header claims 504 lines (`:1`). Heuristic pattern lists at `:159-257`; reranker-specific classes at `:424-506` encode the current cross-encoder contract. Weak assertions like `result is None or isinstance(result, bool)` and `result is True or result is None` (`:271-286`, `:430-506`) cannot fail meaningfully. |
| `tests/checkers/test_semantic_threshold.py` | 135 lines; `TestSemanticThreshold` (`:19-135`) | Its 30 meaningful comments are fully contained in `test_semantic_check.py`’s 33 (probe: 30/33 overlap); its 50 meaningless comments overlap only 3 with the brush-off list. Prime consolidation candidate. |
| `tests/checkers/test_suppression_justification_checker.py` | 390 lines; 42 tests incl. slow `TestSuppressionRerankerPipeline` (`:356-390`) | The slow reranker pipeline tests duplicate semantic-pipeline coverage and add a download dependency; the rest are genuine checker behavior tests. |
| `tests/assumptions/test_pylint_cache_semantics.py` | 485 lines; `TestSemanticCacheWriter`, `TestSemanticCachePathScoping`, `TestPylintRcfileJobsWatchdog`, `TestPylintInvocationConcurrency` (`:129-485`) | Intimately coupled to `_CACHE_DIR`, `_RESULT_CACHE_FILE`, `_RERANKER_MODEL`, `_load_reranker`, `_save_result_cache`; a cache redesign must rewrite this file. |

### 5.5 Existing debloat evidence (objective)

| Category | Evidence |
|---|---|
| Over-limit modules | `tests/checkers/_factories.py` 1393 lines (disable at `:15`), `src/.../runner/dispatch.py` 542 (disable at `:1`), `tests/runner/_factories_extras.py` 511 (disables at `:1` and `:6`), `tests/checkers/test_semantic_check.py` 506 (disable at `:1`) |
| Stale over-limit suppressions | `tests/runner/test_lint_runner.py` 479 lines (disable at `:7`), `tests/runner/test_lint_runner_integration.py` 418 (disable at `:1`); both are under the 500-line limit |
| Stale comments | `test_semantic_check.py:1` says 504 vs 506; `_factories_extras.py:1` says 502 vs 511; `_base.pyi:69-95` says rule/context are unused |
| Backward-compat shims | `runner/baseline.py:20-42` (`_FALLBACK_TOOLS`, `peek_fallback_tools` returning empty, `_compare_sorted` re-export); `runner/parsers.py:7-31` re-exports; `dispatch.py:503-507` `TOOLS` legacy alias; `trivial_wrapper_checker.py:28-36` exemption names `_legacy_to_records`/`_legacy_current_output`/`_legacy_saved_output` that no longer exist |
| Duplicate helpers | `checkers/stub/coverage.py:131-138` reimplements `_is_under_source_root` already in `checkers/_base.py:54-62`; `bare_except_comment_checker.py:74-120` and `suppression_justification_checker.py:331-388` duplicate trailing/preceding-comment extraction |
| Dead compatibility code | `_add_doc_node_spans` handles astroid 4.x `.doc_node` **and** astroid 3.x `body[0].value` (`suppression_justification_checker.py:247-271`), but the project floors astroid at `>=4.0.4` (`pyproject.toml:11`; lock 4.0.4 at `uv.lock:71-76`) |
| Redundant exception checks | `_semantic.py:66` catches `JSONDecodeError, OSError, ValueError`; `JSONDecodeError` subclasses `ValueError` |
| Test helper wrappers | 38 `trivial-wrapper` disables in tests, e.g. `_make_tc` aliases (`tests/checkers/test_stub_checker.py:82`, `test_redundant_type_guard_checker.py:16`), `_sorted` aliases (`test_baseline_diff.py:21`, `test_baseline_diff_parsers.py:32`), `_ctx` (`test_extra_tools.py:285`), `_s_*` (`test_setup_install.py:113-130`) |
| Hardcoded environment paths | `/home/slava/aiexp/python-setup` at `tests/conftest.py:86`, `tests/runner/test_setup_install.py:265-350`, `tests/runner/test_autofix_conflict_integration.py:181`, `tests/runner/test_setup.py:252,277`, `tests/runner/test_t9_7_compose_pyright_live.py:31` |
| Baseline test split | `tests/runner/test_baseline_diff.py` 249 + `test_baseline_diff_edge.py` 308 + `test_baseline_diff_parsers.py` 486 = 1043 lines / 21 test functions, with overlapping `_compare_sorted`/`_diff_baseline`/`_capture_baseline` coverage |
| Docs drift | `AGENTS.md:10-11` stale counts; `CHANGELOG.md:3` v1.2.9 vs `pyproject.toml:3` 1.2.10; `README.md:72` still shows v1.2.5; `config/ty.toml:8` names `sentence_transformers` |

### 5.6 Third-party assumptions to read before debloating

- `tests/assumptions/test_astroid_contracts.py:1-10` pins astroid 4.0.4 behavior used by checkers.
- `tests/assumptions/test_beartype_contracts.py:1-13` pins beartype 0.22.9’s TYPE_CHECKING forward-ref behavior: `@beartype` succeeds at import but raises on first call; this explains many `# pylint: disable=missing-beartype` comments on mixins/`register()`.
- `tests/assumptions/test_pylint_contracts.py` pins pylint 4.0.6 checker lifecycle (`open`/`close` order), `CheckerTestCase`/`UnittestLinter` message shape, and `MessageDefinitionTuple` arity (`:67-175`).
- `tests/assumptions/test_pylint_cache_semantics.py:11-48` is the writer-first verdict; the file says “these tests are the verdict” and must be re-derived before changing assertions.

---

## 6. Model Candidate Landscape (external; verify before adoption)

The intent names GLiDE-0.4B and the JEV Decision Index. The following are external facts from model cards/leaderboard, not codebase facts; they should seed a spike, not be treated as final choices.

| Candidate | Params | License | Runtime / CPU evidence | Notes |
|---|---:|---|---|---|
| `fastino/GLiDE-0.4B` | 0.40B | `fastino-community` | Custom `glide` package; torch/transformers; card reports RTX PRO 6000 GPU latency 6.9 ms, 0.81 GB bf16; no CPU claim | Intent’s named candidate; ADR-009 requires human license review and notes no candidate is proven compliant (`docs/adr/ADR-009.md:15-19`) |
| `fastino/GLiNER2.5-Decide` | 340M | Apache-2.0 | Card says “Runs on CPU or GPU, through `gliner2`”; `gliner2[local]` | English classification; 60.2% exact match on `fastino/fast-decisions`; 0.34B is smaller than GLiDE |
| `tasksource/tasksource-decider-nano` | 150M | Apache-2.0 | ModernBERT cross-encoder, self-contained `decider.py` (PyTorch + transformers); A30 median 23 ms | #1 among models under 300M on Decision Index 0.4 (19.85); 8,192-token context; no explicit CPU claim but 150M encoder |
| `SupersonicLabs/Julia-1` | 144.3M | Apache-2.0 | Card: CPU inference works with standard PyTorch; FP32 weights 550.5 MiB; 8,192-token CPU smoke test; ONNX/GGUF variants | Typed decisions (`choice`, `noul`, `score`); Python 3.11+ |
| `hotchpotch/bekko-system-one-v0-{17m,68m,400m}` | 17M/68M/400M | No license field in card/API | Card: CPU or CUDA through `BekkoSentenceTransformer`; 17M ONNX ~29 MB | Experimental; license risk until clarified |
| `tardellirs/crivo-68m` / `crivo-400m` | 68M/400M | CC-BY-NC-4.0 | Cross-encoder/ModernBERT decision models | Noncommercial license likely incompatible with an MIT tool; treat as unsuitable unless legal says otherwise |
| `cross-encoder/ettin-reranker-68m-v1` / `150m-v1` | 68M/150M | Apache-2.0 | ONNX/OpenVINO tags; sentence-transformers cross-encoders | Rerankers, not decision models; could be a lightweight stopgap but does not satisfy “decision model” framing |

Leaderboard: `https://multimodalart-jev-decision-index.static.hf.space/index.html` (Decision Index 0.4.1; 274 model entries). GLiDE-0.4B card: `https://huggingface.co/fastino/GLiDE-0.4B`. GLiNER2.5-Decide: `https://huggingface.co/fastino/GLiNER2.5-Decide`. tasksource-decider-nano: `https://huggingface.co/tasksource/tasksource-decider-nano`. Julia-1: `https://huggingface.co/SupersonicLabs/Julia-1`. Bekko: `https://huggingface.co/hotchpotch/bekko-system-one-v0-400m`. Crivo: `https://huggingface.co/tardellirs/crivo-68m`. Ettin reranker: `https://huggingface.co/cross-encoder/ettin-reranker-68m-v1`.

Caveats: leaderboard latencies are GPU measurements; CPU latency must be measured on the target laptop/CI class. The model cards’ benchmark labels are not the W9704 meaningful-vs-brush-off task. No double-rated W9704 corpus exists at HEAD (ADR-009 says the accepted stratum had 215 meaningful and 0 meaningless labels; `docs/adr/ADR-009.md:9-13`).

---

## 7. Open Questions and Uncertainties

1. **Backend semantics: what exactly replaces what?** ADR-010 specifies `DecisionBackend.decide(justification, rule, context) -> float` with a “heuristic-first hard gate” (`docs/adr/ADR-010.md:23-25`), while current code is semantic-first with heuristic fallback (`_base.py:150-158`). Does “hard gate” mean the heuristic must pass before the model runs, or that the heuristic is only a fallback when the model is unavailable? Does the model return a probability that the caller thresholds, or a boolean? How does `None` (model unavailable) map to `check_if_meaningful`’s `bool` return?

2. **Which model is compliant and CPU-feasible?** GLiDE-0.4B is the intent’s example but carries a Fastino Community License and GPU-only evidence (`https://huggingface.co/fastino/GLiDE-0.4B`). Apache-2.0 alternatives exist (GLiNER2.5-Decide 340M, tasksource-decider-nano 150M, Julia-1 144.3M), but none is trained on W9704 labels; zero-shot behavior on terse comments is unproven. A CPU benchmark on the target class and a license decision are both unresolved. Python 3.14 is supported by locked torch 2.12.1/transformers 5.12.1 (`uv.lock` entries; PyPI classifiers), but `gliner2` advertises classifiers only through 3.12 — verify before adopting it.

3. **Evaluation corpus is missing.** The only in-repo labeled examples are the heuristic test lists (`test_semantic_check.py:159-257`, `test_semantic_threshold.py:29-131`) and the planted sample project (`tests/data/minimal_sample_project/src/minimal_sample/mod.py:45-57`). ADR-009’s required double-rated brush-off sample (`docs/adr/ADR-009.md:23-27`) is not in the repo. Without it, the 95% meaningless-precision gate cannot be evaluated; a model may improve or regress W9704 silently because the golden forces `SEMANTIC=0` (`tests/integration.py:112`).

4. **Cache location and key schema.** ADR-010 wants `.python-setup-decisions.json` at the linted project root with per-entry file/model metadata and no bare hex ≥20 (`docs/adr/ADR-010.md:26-28`). The current key is path-free and 64-bit truncated (`_semantic.py:142-157`), and the tests assert a home-dir single file and path-free signature (`tests/assumptions/test_pylint_cache_semantics.py:276-305`). How does a checker know the project root? Options: `Path.cwd()` (pylint is launched with `cwd=config.cwd`; `runner/output.py:186-188`), walking up from `node.root().file`, or adding a `path`/`project_root` parameter to `check_if_meaningful`. The last conflicts with the current assumption test and the public helper signature.

5. **Refresh vs read-only lint, and the writer side channel.** ADR-010 says ordinary lint is read-only and cache updates happen only through an explicit CI-guarded refresh with lockfile + merge + atomic replace (`docs/adr/ADR-010.md:29-32`). But pylint runs as a subprocess, so model verdicts computed during lint are not visible to the runner. Is the refresh command a separate source walker? Does pylint run with a special env var that permits a temp sidecar? Does the refresh reuse checker parsing? This is unspecified and should be spiked before implementation.

6. **Prune/cleanup semantics.** “Prune entries for missing files and stale model identifiers” (`docs/adr/ADR-010.md:33`) requires file refs and a model identifier per entry. How are moved files handled? Does a model ID change invalidate all entries? Is pruning automatic on refresh or a separate `--prune` flag? Does `--path` scope the refresh? The current cache has no path or prune support (`tests/assumptions/test_pylint_cache_semantics.py:27-31`).

7. **Secrets scan and tracked-cache safety.** `detect-secrets` scans all tracked files (`config`/runner strategy; `.secrets.baseline:42-44` only excludes `^\\.factory/`). ADR-010’s “no bare hex strings of length ≥20” suggests hashes must be encoded or avoided; storing raw justification text would be worse. What exact fields are safe to commit? Does the cache need a `.secrets.baseline` allowlist entry, or a non-hex key encoding?

8. **Memory/time limits for a model in pylint subprocesses.** Pylint runs with default `memory_limit_mb=2048` (`runner/types.py:22`; pylint specs at `dispatch.py:112-132`), and `_run_cmd` applies `RLIMIT_AS` (`runner/output.py:171-200`). A torch/transformers model plus Python 3.14 may exceed 2 GB virtual address space; `ty` already needed `memory_limit_mb=0` for this reason (`dispatch.py:93`). Does every pylint spec need a memory/time override, or should the backend use a lighter ONNX runtime? How many model loads occur across the three pylint invocations (`pylint`, `pylint-pyi`, `pylint tests`)?

9. **Dependency packaging.** The `[semantic]` extra is only `sentence-transformers>=3.0.0` (`pyproject.toml:28-31`); dev group has no ML deps (`pyproject.toml:58-85`), so the semantic path is untested in CI and four tests skip. Does the new backend replace the extra’s contents, add a new extra (e.g. `[decision]`), or become a core dependency? Core would change every consumer install and the default lint path; optional preserves the current “heuristic by default” behavior but leaves the model unexercised. `uv.lock` must be regenerated either way.

10. **Debloat scope and ordering.** Objective targets are listed in §5.5, but the intent also says “test infra/assumptions first.” Which comes first: splitting `tests/checkers/_factories.py`/`tests/runner/_factories_extras.py`, consolidating `test_semantic_threshold.py` into `test_semantic_check.py`, removing the three baseline-diff modules’ overlap, removing stale shims (`peek_fallback_tools`, `_compare_sorted`, `_legacy_*` exemptions), or fixing `pylint-pyi`? Each touches different gates; ADR-011’s single-writer map is not present at HEAD (`docs/adr/ADR-011.md:40-70` plans a `_source_stream.py` and ownership table, neither implemented).

11. **`pylint-pyi` blind spot.** Do we fix the strategy to lint companion stubs (e.g., copy stubs to a temp tree or use a pylint mode that does not resolve companions), and then clean up the 205 private stub symbols / duplicate-code findings? Or do we explicitly scope the rule to orphan stubs and document that companion `.pyi` files are governed only by `mypy.stubtest`? Fixing it changes the golden (currently 42/43 `pylint-pyi` findings are on `.py` files) and will likely require a large baseline/golden regeneration, which conflicts with “preserve every material lint/check behavior” unless staged deliberately.

12. **Coding-rule enforcement that is currently subjective.** `CodingRules.md` requires simplification, wrapper justification, no fallbacks for hard dependencies, test naming `test_<method>_given_<condition>_then_<expected>`, test isolation/fixture scope, and `no_external_api`/`with_real_api` categories (`CodingRules.md:90-107`, `:256-306`). Probes show 62.2% naming compliance, 31/60 marker coverage, 38 test `trivial-wrapper` disables, and several hardcoded `/home/slava/aiexp/python-setup` paths. Which of these become lint-enforced rules vs one-time cleanup? A new checker for test naming/markers would itself need tests and could create a large baseline.

13. **Docs/version reconciliation.** `AGENTS.md:79-85` still describes the cross-encoder and `PYTHON_SETUP_LINT_RERANKER_MODEL`; `docs/semantic-justification.md:3-62` describes reranker-first/fallback, `~/.cache`, and `results.json`; `docs/custom-checks.md:97-104` documents the reranker helper; `docs/troubleshooting.md:97-111` documents download fallback and cache deletion; `README.md:29` and `docs/tutorials.md:12-16` tell users to install `python-setup[semantic]`; `config/ty.toml:8` names `sentence_transformers`; `CHANGELOG.md:3` vs `pyproject.toml:3` version drift. All must move together, or the docs will contradict the new backend/cache.

14. **Behavior-preservation verification gap.** The default `uv run pytest -q` does not run `tests/integration.py` (`tests/integration.py` is not named `test_*.py`; `pyproject.toml:48-55`), and the golden explicitly disables semantic scoring (`tests/integration.py:112`). A model/cache change can pass the default suite while changing W9704 behavior on the sample project. The architect should require `uv run pytest tests/integration.py -q` plus a new model-specific contract test (mocked backend for determinism, one `slow` real-model smoke) before claiming behavior preservation.

---

## 8. Recommendations for the Architect

1. **Pin the behavior contract before touching the model.** Record baseline probe results (`uv run pytest -q`; `uv run pytest tests/integration.py -q`; `uv run lint`) and keep `PYTHON_SETUP_LINT_SEMANTIC=0` as the deterministic W9704 contract. Add a mocked-backend contract test for the new decision path; keep real-model tests behind `slow` + `importorskip`.

2. **Resolve ADR-009’s no-go gates explicitly.** Either (a) produce the double-rated brush-off sample and license decision, then implement a compliant CPU model, or (b) keep the heuristic as production default and land only the model-independent `DecisionBackend` + cache infrastructure. Do not claim the swap is complete without a CPU benchmark and a license verdict.

3. **Spike the model bake-off with license-clean candidates first.** For a W9704 binary decision, evaluate `tasksource/tasksource-decider-nano` (150M, Apache-2.0), `SupersonicLabs/Julia-1` (144.3M, Apache-2.0, explicit CPU), and `fastino/GLiNER2.5-Decide` (340M, Apache-2.0, CPU via gliner2) against GLiDE-0.4B. Measure CPU latency, peak RSS under the 2048 MB `RLIMIT_AS`, model load time, and threshold sweep on the double-rated sample; verify Python 3.14 support for the chosen runtime.

4. **Implement ADR-010 cache as an explicit-refresh artifact, not a lint side effect.** Decide project-root resolution (`cwd` vs node path vs explicit parameter), per-entry `files`/`model` schema, non-hex key encoding, prune policy, and atomic replace in the target directory. Consume `tests/assumptions/test_pylint_cache_semantics.py`’s writer/concurrency verdict; rewrite that file deliberately rather than loosening it. Add a CI-guarded `refresh-decisions` command (or `lint --refresh-decisions`) and keep ordinary lint read-only.

5. **Debloat test infrastructure first.** Split `tests/checkers/_factories.py` by checker domain, trim `_factories_extras.py` below 500 lines, consolidate `test_semantic_threshold.py` into `test_semantic_check.py`, and merge the three baseline-diff modules’ overlapping cases. Remove stale `too-many-lines` disables and stale `_legacy_*`/`peek_fallback_tools`/`_compare_sorted` shims only after the golden/baseline gates confirm no behavior change.

6. **Treat `pylint-pyi` as a decision, not an assumption.** Reproduce the companion-stub skip, decide whether to fix it, and if so, budget for the 205 private stub symbols and duplicate-code findings. Regenerate the golden and baseline in the same change; otherwise document the orphan-only scope so “coding rules enforced” is not overstated.

7. **Fix rule-enforcement and portability drift in measured increments.** Add/enable checks or one-time cleanups for test naming/markers, hardcoded `/home/slava/aiexp/python-setup` paths, stale docs counts/versions, and `config/ty.toml` optional-import comments. Keep each change behind the existing lint + integration gates.`). Read code ONLY to verify a specific reviewer objection (few targeted reads, never broad scans or chunked whole-file reading). Translate newly identified unknowns into spike outlines or uncertainties instead of exploring in-turn. Keep terse.
- Feedback resolution: evaluate each review suggestion. Address valid concerns by adjusting milestones, scenarios, directional interfaces, or adding spikes.
- Architectural authority: for suggestions you deliberately reject or defer, provide clear, defensible technical rationale.
- Maintain plan bounds: keep milestone counts and dependencies within configured limits.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.
- Output: yield the updated plan matching `plan.schema.json`.

## Current Plan
{
  "iteration": 4,
  "milestones": [
    {
      "directionalInterfaces": [
        "Scope table: {path, owner in {runner,checkers,semantic,root}, single-writer item slug} at pinned HEAD; universe src+scripts+tests minus tests/data; root group (tests/data, config, docs except assigned rows, repo-root except packaging exception); exclusions (_semantic+.pyi, _base::check_if_meaningful incl :238, _OPTIONAL_IMPORT_PATTERNS + register line, semantic test modules + pipeline block); planned paths (_decision_backend/_decision_cache, conftest reservation); artifact = item report, informational, non-gating.",
        "Gate baseline table: {format exit, lint per-tool, pytest counts, integration 9-collected with pre-commit env, golden hash, baseline []} + `uv run lint` check-only verification (git status clean) confirming split-gate reunification or retaining split.",
        "Secrets verification: full git-ls-files scan exit 0 on clean checkout + planted control secret exit 1 (reviewer-replicated), cited with pinned HEAD; journals committed."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Scope snapshot without gating\n  Given HEAD plus I2 audits plus closeup-3 verified scope\n  When scope-table-snapshot runs\n  Then every universe file lists owner + single-writer item, exclusions reference existing symbols, reservations name planned paths only, and M2-M5 proceed without depending on it",
        "Scenario: Secrets mechanism verified\n  Given merged ^\\.factory/ filter\n  When verification scans clean checkout plus planted secret\n  Then clean exits 0, planted exits 1, cited with HEAD",
        "Scenario: Gates green baseline recorded\n  Given clean HEAD\n  When gate capture runs format + lint + pytest + integration\n  Then table records exits/counts/hashes, baseline [], golden hash, and lint check-only verdict"
      ],
      "title": "K kickoff and green-gate preconditions (non-blocking)"
    },
    {
      "directionalInterfaces": [
        "Checkers factories split: tests/checkers/_factories*.py each <=500, no too-many-lines, ParameterSet typing, 9 importers migrated, behavior identical; touched files toward naming/marker conventions.",
        "Runner factories trim: tests/runner/_factories_extras*.py each <=500, duplicate disables collapsed to <=1, behavior identical.",
        "Threshold consolidation: one deduped parametrized table (30/33 + 50 + 35 merged, outcomes pinned), modules <=500, no suppressions.",
        "SEMANTIC guards: 40 W9704 + 11 W9738 tests (except pipeline block) pass with monkeypatched SEMANTIC=0, outcomes pinned.",
        "Baseline merge: baseline-diff coverage in <=2 modules <=500, overlapping cases merged, each names survivor; pinning limbs preserved or flagged.",
        "Portability: stale disables removed, /home/slava paths replaced via tmp/env, stale comments fixed.",
        "Never-test-linting prune: each removed group names survivor (golden/assumption/unit); default suite keeps full-pipeline pin; golden/integration contracts kept."
      ],
      "id": "M2",
      "scenarios": [
        "Scenario: Factories split without behavior change\n  Given over-limit factories\n  When splits merge\n  Then each module <=500 with no disable, importers pass, pytest + integration green, golden byte-identical",
        "Scenario: Threshold deduped plus guards pinned\n  Given overlapping tables plus unguarded heuristic tests\n  When consolidation plus guards merge\n  Then one table pins exact outcomes, 51 tests pass with SEMANTIC=0, golden byte-identical",
        "Scenario: Baseline merged plus portability plus prune with survivors\n  Given overlapping baseline tests plus stale/portability debt plus self-lint groups\n  When merges complete\n  Then modules <=500, hardcoded paths gone, each removal names survivor, default pipeline pin retained, gates green, golden byte-identical"
      ],
      "title": "Test infrastructure debloat first"
    },
    {
      "directionalInterfaces": [
        "Dispatch split: runner/dispatch*.py each <=500, zero too-many-lines, EXPECTED_TOOL_NAMES derives from TOOLS via single-sourced re-exports in runner/__init__.py (dispatch-split sole __init__ writer), FORMATTER_ONLY/RECORDLESS explicit, registry tests pass.",
        "Shim removal: baseline _FALLBACK_TOOLS/peek/_compare_sorted plus parsers re-exports deleted (or kept with in-repo consumer evidence + debt note), asserting tests updated, does not touch __init__.",
        "Stream helper: NEW checkers/_source_stream.py (@beartype, <=500, tach-clean), all listed blocks replaced (grep zero copies outside helper), zero _base.py diff, coverage + comment-extraction deduped.",
        "Legacy cleanup: _legacy_scan renamed with call sites, trivial_wrapper dead _legacy_* removed plus peek line matching runner close-up, astroid 3.x branch deleted, register() per ADR-012 (no @beartype), mixin misc removed or retained-with-justification, joined sorted codes emitted, skips no_try_import register line, shift report if outcomes shift.",
        "Pyi spike verdict: {reproduction, golden counts, latent budget (205 symbols + duplicate-code), recommendation fix-with-regen vs document-orphan-only, I5 plan} — report only, no I4 code or golden change."
      ],
      "id": "M3",
      "scenarios": [
        "Scenario: Runner split without drift\n  Given dispatch 542 plus shims\n  When splits merge\n  Then modules <=500 with no disables, registry single-sourced, shims deleted or evidenced, gates green, golden byte-identical or shift-reported",
        "Scenario: Checkers helper plus legacy without drift\n  Given duplicated stream blocks plus legacy names plus dead code\n  When helper plus cleanup merge\n  Then zero copies outside helper, zero _base diff, joined codes emitted, 51 outcomes pinned or shift-reported, gates green",
        "Scenario: Pyi scope decided without code change\n  Given companion-stub blind spot\n  When spike completes\n  Then verdict recommends fix (with I5 budget + regen plan) or orphan-only (with docs note), no I4 golden change"
      ],
      "title": "Production rule enforcement and code debloat"
    },
    {
      "directionalInterfaces": [
        "Backend (ADR-014 veto): DecisionBackend Protocol decide(justification,rule,context)->float [0,1]; DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1'; final = heuristic AND (prob>=threshold) when available else heuristic; check_if_meaningful signature + SEMANTIC='0' preserved; semantic_check bool|None; kwarg (public .pyi) + test-only DECISION_BACKEND dotted path honored ONLY under PYTEST_CURRENT_TEST (loader pins both); FakeBackend/NoBackend/get_backend; DECISION_MODEL parses but loader None + one warning; [semantic] without sentence-transformers (uv.lock no edge); RERANKER deprecated warn+ignore; joined-rule keys + any-element match; tach-clean, @beartype, structlog, each <=500; .gitignore untouched, no hatch entry.",
        "Cache (per spike): .python-setup-decisions.json at linted root (sorted array, indent=2, sort_keys, no bare hex>=20, secrets-clean); entry {justification normalized, rule joined, model '<id> rev <short12> prompt-vN', decision, files POSIX} + {version, prompt hash, last-seen}; key (justification,rule,model); read-only lint (hash-asserted zero writes); explicit CI-guarded refresh (lockfile + merge + atomic replace in target dir, DECISIONS_PATH isolation); prune missing/stale (+age if defined); --path + jobs>1 per verdict.",
        "Tests (no AGENTS): merged table pinned; FakeBackend kwarg + env; cache round-trip/cleanup/concurrency on tmp + hypothesis format; vacuous + ImportError-propagation deleted; 4 pair tests slow (or deleted); pipeline block serialized after guards; cache-semantics assumptions rewritten deliberately; modules <=500, no suppressions, never test linting; one slow+with_real_api e2e SKELETON (skipped) allowed; CHANGELOG snippet in report only.",
        "Corpus spike: double-rated real brush-off sample (>=100 post-dedup, both strata, rubric + per-source/stratum split, protocol + agreement disclosed) repairing 215/0, or explicit I5 blocker; report only."
      ],
      "id": "M4",
      "scenarios": [
        "Scenario: Veto backend without model\n  Given ADR-009 no-go\n  When backend merges\n  Then brush-off never reaches backend, one call per unique pair, cache-hit without model emits persisted verdict with no load, no retry storm, SEMANTIC=0 equals golden, gates green",
        "Scenario: Cache read-only plus explicit refresh\n  Given tracked schema\n  When cache merges\n  Then normal lint shows zero writes by hash, refresh on tmp merges + prunes + atomic-replaces with CI guard, secrets scan clean, gates green",
        "Scenario: Corpus evaluable or blocked\n  Given 215/0 defect plus single-adjudicator limits\n  When corpus spike completes\n  Then report cites double-rated sample with agreement + rubric + stratum split usable for I5 90/95/85 bars, or names explicit blocker with I5 plan"
      ],
      "title": "Semantic backend plus tracked cache infrastructure (no model)"
    },
    {
      "directionalInterfaces": [
        "Regen protocol: UPDATE_GOLDEN=1 locally only (fail under CI/GITHUB_ACTIONS); byte-identical double run; key-by-key diff review against shift reports; golden + tool counts together; no blind regen; no-op attestation if all no-shift; ONLY regen-hatch writes tests/data/golden.",
        "Docs checklist must-contain: semantic-justification.md (DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1, veto); custom-checks.md (DecisionBackend); troubleshooting.md (DECISION_MODEL + RERANKER deprecated); AGENTS.md pipeline (DecisionBackend, no reranker) + counts (rerun actuals + 9-collected contract + ruff-format scope row); CHANGELOG (extra contents, new/deprecated vars, cache file, no-go note + version 1.2.10); README pin; ty.toml no sentence_transformers.",
        "Final gate table: {format exit, lint per-tool on scoped/clean checkout for MemoryError (mechanism + HEAD), pytest counts, integration 9-collected-0-failed with env pinned, golden hash or regen diff, baseline [], docs checklist}; red cells route to new root/follow-up items, never baseline edits."
      ],
      "id": "M5",
      "scenarios": [
        "Scenario: Golden integrity preserved\n  Given shift/no-shift declarations from all behavior items\n  When regen-hatch runs\n  Then golden byte-identical if all no-shift, else regenerated locally with double-run plus key-by-key review matching shift reports, committed together",
        "Scenario: Iteration closes with evidence\n  Given all merges\n  When final validation completes\n  Then gate table records all cells plus docs must-contain per assignment; red cells route to follow-ups, never baseline edits"
      ],
      "title": "Behavior-preservation close-out and gate evidence"
    }
  ],
  "uncertainties": [
    {
      "description": "Which decision model (if any) is license-clean, CPU-feasible on py3.14, and meets 90/95/85 on the heuristic-accepted stratum is unknown; 215/0 corpus defect makes precision unevaluable and all repo labels single-author; GLiDE needs human review; CC-BY-NC excluded; gliner2 py3.14 unverified.",
      "id": "U1",
      "spikeOutlines": [
        "brush-off-corpus-spike (fact-finder, report-only): double-rated real brush-off sample + rubric + agreement + stratum split repairing 215/0 for I5 bake-off; no model choice in I4"
      ]
    },
    {
      "description": "Tracked-cache project-root resolution, non-hex key encoding, prune policy, refresh command shape, --path scoping, jobs>1 concurrency, and secrets-safe fields are unknown; writer-first verdict must be consumed.",
      "id": "U2",
      "spikeOutlines": [
        "decision-cache-design-spike (poc on tmp, no committed files): schema + root resolution + encoding + prune + refresh/CI/isolation + deterministic-given-cache+model proof with hash-asserted zero normal-lint writes"
      ]
    },
    {
      "description": "Whether pylint-pyi companion-stub skip is fixed (with 205-symbol cleanup + golden regen) or documented as orphan-only scope is unknown; fixing changes golden and exposes large latent cleanup.",
      "id": "U3",
      "spikeOutlines": [
        "pylint-pyi-scope-spike (fact-finder, report-only): reproduce companion vs orphan, count golden impact, budget latent cleanup, recommend fix-with-regen vs orphan-only for I5"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Report-only, zero repo writes. At pinned HEAD: git ls-files filtered to src+scripts+tests minus tests/data; recount universe total + per-owner counts from I2 map (67/83/15/4/15) within ±5; record commands + HEAD SHA + revision map-<short> consistently. Confirm exclusions existence (file:line only): _semantic+.pyi, _base::check_if_meaningful incl :238, _OPTIONAL_IMPORT_PATTERNS + register line, semantic test modules + pipeline block. Confirm reservations absent at HEAD (or corrected). List root group once. Emit file-level single-writer table for I4 items + drift list {path,auditRef,headEvidence,confirmed|corrected|disputed} (disputed allowed). Capture gate baseline (format, lint per-tool, pytest counts, integration 9-collected with env, golden hash, baseline []) + `uv run lint` check-only verification (git status clean) to confirm split-gate reunification or retain split. Informational, non-gating: no M2-M5 item depends on it.",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "scope-table-snapshot",
      "title": "Snapshot scope table and gate baseline (non-gating)"
    },
    {
      "deps": [],
      "description": "Report-only, zero writes. Verify merged .secrets.baseline:41-46 ^\\.factory/ should_exclude_file list-pattern form against installed detect-secrets (cite version + signature). On clean checkout: full git-ls-files scan exits 0; planted control secret still exits 1 (reviewer-replicated). Cite mechanism + pinned HEAD, not counts. Journals stay committed; residual-risk caveat (write-time redaction + periodic unfiltered audits). No baseline edits. Feeds M5 gate table.",
      "kind": "fact-finder",
      "milestoneId": "M1",
      "prodBudgetHint": 0,
      "slug": "secrets-scan-verification",
      "title": "Verify secrets exclusion mechanism"
    },
    {
      "deps": [],
      "description": "Tests-only (tests/checkers/_factories*.py + 9 importer modules ONLY; FORBIDDEN src, baseline, docs, tests/data). Red-test-exempt. Split _factories.py 1393 (disable :15) by checker domain into modules each <=500, no too-many-lines, ParameterSet typing, cases next to tests where mechanical; migrate 9 importers; delete unused helpers with survivor notes; touched files toward test_<method>_given_<condition>_then_<expected> + no_external_api/with_real_api markers. Verify: tests only; pytest + integration no new failures; golden byte-identical; format-clean; grep zero too-many-lines in split.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "checkers-factories-split",
      "title": "Split checkers factories by domain"
    },
    {
      "deps": [],
      "description": "Tests-only (tests/runner/_factories_extras*.py + importers ONLY). Red-test-exempt. Trim 511 (disables :1,:6, claims 502) to each <=500, collapse duplicate disables to <=1, split by group if needed; touched files toward naming/marker conventions. Verify: tests only; pytest + integration no new failures; golden byte-identical; format-clean.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "runner-factories-trim",
      "title": "Trim runner factories extras below limit"
    },
    {
      "deps": [],
      "description": "Tests-only (test_semantic_check.py + test_semantic_threshold.py ONLY; FORBIDDEN suppression/bare-except files, src, docs, tests/data). Red-test-exempt. Merge 30/33 + 50 + 35 heuristic lists into one deduped parametrized table (outcomes pinned, no behavior change); leave reranker-specific classes untouched (M4 rewrites); modules <=500 with no suppressions; fix stale 504-vs-506 header. Verify: tests only; parametrized IDs + outcomes identical in report; pytest + integration no new failures; golden byte-identical.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "semantic-threshold-consolidation",
      "title": "Consolidate semantic heuristic tables"
    },
    {
      "deps": [],
      "description": "Tests-only (test_suppression_justification_checker.py + test_bare_except_comment_checker.py ONLY, EXCEPT TestSuppressionRerankerPipeline block which is semantic-owned — do not touch block). Red-test-exempt. Add monkeypatched SEMANTIC=0 guards to 40 W9704 + 11 W9738 heuristic tests; outcomes pinned. Verify: tests only; 51 pass with guards; golden byte-identical.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "checkers-semantic-guards",
      "title": "Guard heuristic checker tests with SEMANTIC=0"
    },
    {
      "deps": [],
      "description": "Tests-only (test_baseline_diff*.py ONLY). Red-test-exempt. Merge 249+308+486 overlapping _compare_sorted/_diff_baseline/_capture_baseline coverage into <=2 modules <=500; each merged case names survivor; preserve CLI/exit/baseline/autofix pinning limbs or flag blocking debt; touched files toward naming/markers. Verify: tests only; pytest + integration no new failures; golden byte-identical.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "baseline-diff-merge",
      "title": "Merge baseline-diff test overlap"
    },
    {
      "deps": [],
      "description": "Tests-only (test_lint_runner.py:7, test_lint_runner_integration.py:1, conftest.py:86, test_setup*.py, test_autofix_conflict_integration.py:181, t9_7 live :31 ONLY; FORBIDDEN factories/baseline/self-lint files owned by parallel items). Red-test-exempt. Remove stale too-many-lines disables (479/418 under limit); replace /home/slava paths with tmp/env/portable fixtures; fix stale count comments in touched files only. Verify: tests only; pytest + integration no new failures; golden byte-identical; grep zero hardcoded checkout in touched files.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "stale-disables-portability-cleanup",
      "title": "Remove stale disables and hardcoded paths"
    },
    {
      "deps": [],
      "description": "Tests-only (self-lint, config-consistency, noise-filter, private-imports, hardcoded-checkout live, autofix-conflict slow/home-write, downstream home-write ONLY; FORBIDDEN factories/baseline/golden/helpers). Red-test-exempt. Remove gate-duplicating tests per never-test-linting boundary (subprocess re-lint, AST re-implementation, config re-checks); each removal names survivor (golden/assumption/unit); keep default full-pipeline pin (smoke kept or default-collected survivor named); keep golden/integration contracts. Verify: tests only; removal→survivor map in report; pytest (minus removed) + integration pass; golden byte-identical.",
      "kind": "story",
      "milestoneId": "M2",
      "prodBudgetHint": 0,
      "slug": "never-test-linting-prune",
      "title": "Prune gate-duplicating tests with survivors"
    },
    {
      "deps": [],
      "description": "Report-only, zero writes, temp copies only. Reproduce: temp .pyi with companion .py (even broken -> skipped) vs orphan .pyi (linted, pyi-underscore fires); count golden 42/43 on .py; budget latent cleanup (205 private symbols in 29 stubs + duplicate-code findings). Recommend fix-with-regen (temp-tree/copy or pylint mode + cleanup budget + regen plan for I5) vs document-orphan-only (scope note + stubtest governance). No prod change, no golden change in I4. Feeds I5 plan.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "prodBudgetHint": 0,
      "slug": "pylint-pyi-scope-spike",
      "title": "Decide pylint-pyi companion-stub scope"
    },
    {
      "deps": [],
      "description": "Owns runner/dispatch*.py + runner/__init__.py (sole __init__ writer) + registry tests ONLY; FORBIDDEN baseline/parsers (shim item), tests/data, baseline edits, docs. Split dispatch.py 542 (disable :1) into modules each <=500 (registry/strategies/parser-sets) with single-sourced re-exports; EXPECTED_TOOL_NAMES derives from TOOLS; FORMATTER_ONLY/RECORDLESS explicit; no threshold raises; migrate registry/fakes tests to EXPECTED/STATISTICS sets. Verify: no too-many-lines in split; registry tests pass; format exit 0; scoped lint zero new; pytest + integration no new failures; golden byte-identical or shift report {justification-class, keys, CHANGELOG snippet, file:line}.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 150,
      "slug": "runner-dispatch-split",
      "title": "Split dispatch registry below limits"
    },
    {
      "deps": [],
      "description": "Owns runner/baseline.py/.pyi + parsers re-exports + asserting tests ONLY; FORBIDDEN dispatch*/__init__ (dispatch-split), tests/data, baseline edits. Delete _FALLBACK_TOOLS/peek_fallback_tools/_compare_sorted shim + stale re-exports + TOOLS legacy alias (or keep with in-repo consumer grep evidence + debt note); update asserting tests; leave trivial_wrapper exemptions to checkers item. Verify: grep zero shim symbols (or evidenced); gates green; golden byte-identical or shift-reported.",
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 30,
      "slug": "runner-compat-shim-removal",
      "title": "Remove runner compat shims"
    },
    {
      "deps": [],
      "description": "Owns NEW checkers/_source_stream.py + stream read/decode call sites in conformance/stub checkers ONLY; FORBIDDEN _base.py/.pyi (zero diff, semantic-owned), no_try_import register line/patterns (semantic), tests/data, baseline. Create @beartype helper (<=500, tach-clean); replace all listed blocks (grep zero copies outside helper); dedupe coverage.py _is_under_source_root to _base helper + share trailing/preceding comment extraction where mechanical. Verify: grep zero local copies; `git diff -- _base.py` empty; gates green; golden byte-identical or shift-reported.",
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 100,
      "slug": "checkers-stream-helper",
      "title": "Single-source stream read/decode helper"
    },
    {
      "deps": [
        "checkers-stream-helper",
        "runner-compat-shim-removal"
      ],
      "description": "Owns conformance/*.py (suppression, trivial_wrapper, bare_except, mixins) + stub fidelity rows ONLY; FORBIDDEN _base (zero diff), no_try_import register line/patterns, tests/data. Rename _legacy_scan (only scan path) with call sites; remove trivial_wrapper dead _legacy_* unconditionally + peek line iff runner confirms deletion (else keep); delete astroid 3.x body[0].value branch (floor 4.0.4); register() missing-beartype justification per ADR-012 (no @beartype added); mixin misc via shared typed base attempt with retain-and-report fallback; emit joined sorted codes at W9704/W9738 call sites (bare-except single); fix .pyi fidelity rows. On shift: shift report + CHANGELOG snippet (root regenerates). Verify: grep zero _legacy_scan/_legacy_* (except retained peek if runner kept); gates green; 51 outcomes pinned or shift-reported.",
      "kind": "story",
      "milestoneId": "M3",
      "prodBudgetHint": 40,
      "slug": "checkers-legacy-dead-cleanup",
      "title": "Rename legacy scan and remove dead compat"
    },
    {
      "deps": [],
      "description": "Prototype on tmp copies only; zero committed files. Consume test_pylint_cache_semantics.py writer-first verdict (writer+timing+--path+jobs=1, crash-safe, no lock/sidecar; jobs>1 voids claim). Decide: project-root resolution (cwd vs node.root().file walk-up vs explicit param + signature impact), per-entry files/model schema, non-hex key encoding (no bare hex>=20, detect-secrets clean, collision-safe), prune (missing/stale/moved-file/model-change/--path/auto-vs---prune), atomic replace in target dir, refresh shape (lint --refresh-decisions vs setup subcommand vs env-permitted sidecar + parser reuse + CI guard + DECISIONS_PATH isolation), memory/time notes for I5 model (2048 RLIMIT_AS, 3 pylint loads, ONNX vs torch). Prove on tmp: heuristic-rejected False without backend; accepted+hit == persisted; accepted+miss+absent == heuristic True; normal lint zero writes by hash. Feeds backend/cache impls (must not invent).",
      "escalate": true,
      "kind": "poc",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "decision-cache-design-spike",
      "title": "Prototype tracked-cache schema and refresh"
    },
    {
      "deps": [],
      "description": "Report-only, zero writes. Repair 215/0 defect for I5 bake-off: collect N real repo suppressions + threshold 30+50 + brush-off/meaningful tables, DEDUPED by normalized justification (target >=100 post-dedup), stratified heuristic-rejected vs heuristic-accepted; rubric (specific technical justification vs placeholder/deferral/brush-off); double-rated with adjudication protocol + edge-case rubric disclosed + inter-rater agreement reported (single-author bias repaired; terse borderlines re-rated). Per-source + per-stratum split. Recommend smallest-evaluable corpus + threshold sweep for I5 90/95/85 bars on accepted stratum, or explicit blocker (collection/license/CPU). No model choice in I4.",
      "escalate": true,
      "kind": "fact-finder",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "brush-off-corpus-spike",
      "title": "Build double-rated brush-off sample"
    },
    {
      "deps": [
        "decision-cache-design-spike",
        "semantic-threshold-consolidation"
      ],
      "description": "Sole writer: NEW _decision_backend.py/.pyi + _base.py/.pyi (veto + injection + on-any-element) + _semantic.py/.pyi (rewrite, no sentence-transformers) + no_try_import _OPTIONAL_IMPORT_PATTERNS + register line + pyproject [semantic] block + uv.lock (packaging exception); FORBIDDEN _decision_cache (cache-impl), _source_stream, ty.toml (docs item), tests/data, .gitignore (untouched), hatch (no entry), baseline. Implement ADR-014 veto + ADR-010 contracts (Protocol decide->float, threshold, prompt-v1, kwarg + PYTEST_CURRENT_TEST-guarded dotted path with loader test pinning both, FakeBackend/NoBackend/get_backend, DECISION_MODEL parses but loader None + one warning, RERANKER deprecated warn+ignore, joined-rule keys + any-element match, tach-clean, @beartype, structlog, each <=500). Verify: brush-off never reaches backend; one call per unique pair; SEMANTIC=0 equals golden; extra has no sentence-transformers; uv.lock no edge; loader None + one warning proven; gates green; golden byte-identical or shift-reported.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "M4",
      "prodBudgetHint": 150,
      "slug": "decision-backend-impl",
      "title": "Implement veto DecisionBackend with FakeBackend"
    },
    {
      "deps": [
        "decision-cache-design-spike",
        "runner-dispatch-split",
        "runner-compat-shim-removal"
      ],
      "description": "Owns NEW _decision_cache.py/.pyi + refresh command (runner cli flag OR setup subcommand per spike verdict, applied onto final runner shape) ONLY; FORBIDDEN _base/_semantic/_decision_backend, tests/data, baseline. Implement spike verdict: sorted array indent2 sort_keys, entry {justification normalized, rule joined, model '<id> rev <short12> prompt-vN', decision, files POSIX} + {version, prompt hash, last-seen}, secrets-clean encoding, read-only lint (hash-asserted zero writes), explicit CI-guarded refresh (lockfile + merge + atomic replace in target dir, DECISIONS_PATH isolation), prune missing/stale (+age if defined), --path scoping + jobs>1 sidecars/lock per verdict. Must pass all tools incl detect-secrets. Does not change existing gate contracts. Verify: round-trip on tmp; normal lint zero writes by hash; refresh merges + prunes; gates green; golden byte-identical or shift-reported.",
      "kind": "story",
      "milestoneId": "M4",
      "prodBudgetHint": 120,
      "slug": "decision-cache-impl",
      "title": "Implement tracked decision cache and refresh"
    },
    {
      "deps": [
        "checkers-semantic-guards",
        "decision-backend-impl",
        "decision-cache-impl"
      ],
      "description": "Owns test_semantic_check.py + test_semantic_threshold.py + pipeline block + tests/assumptions runtime/decision/cache modules (append-only; never touch root __init__ + 3 contracts except deliberate cache-semantics rewrite) + semantic-justification.md + custom-checks bullet + troubleshooting section ONLY; FORBIDDEN AGENTS.md (docs item), CHANGELOG.md (emit snippet in report, docs writes file), tests/data, src. Merge tables pinned; FakeBackend kwarg + env; cache round-trip/cleanup/concurrency on tmp + hypothesis format; delete vacuous + ImportError-propagation; 4 pair tests slow (or deleted with reranker); rewrite cache-semantics assumptions deliberately (not loosened); modules <=500, no suppressions, never test linting; one slow+with_real_api e2e SKELETON (skipped) allowed. Docs state veto backend + tracked cache + no-go. Verify: pytest + integration no new failures; golden byte-identical or shift-reported; rumdl clean.",
      "kind": "story",
      "milestoneId": "M4",
      "prodBudgetHint": 0,
      "slug": "semantic-tests-rewrite",
      "title": "Rewrite semantic tests and docs (no AGENTS)"
    },
    {
      "deps": [
        "decision-backend-impl",
        "decision-cache-impl"
      ],
      "description": "Sole AGENTS.md + CHANGELOG.md + README.md + config/ty.toml writer in I4; FORBIDDEN semantic-justification/custom-checks/troubleshooting (semantic-tests), tests/data, src (except ty.toml comment). Update AGENTS counts to rerun actuals (verify --collect-only + TOOLS==14) + Tool Scope ruff-format row + pipeline subsection (DecisionBackend, no reranker) + testing strategy; CHANGELOG user-visible (extra contents, new/deprecated vars, cache file, no-go note + version 1.2.10); README pin; ty.toml no sentence_transformers. Verify: docs only; must-contain strings per M5 checklist; rumdl clean; pytest + integration no new failures.",
      "kind": "story",
      "milestoneId": "M5",
      "prodBudgetHint": 0,
      "slug": "docs-reconciliation",
      "title": "Reconcile docs counts and versions"
    },
    {
      "deps": [
        "checkers-legacy-dead-cleanup",
        "checkers-stream-helper",
        "decision-backend-impl",
        "decision-cache-impl",
        "runner-compat-shim-removal",
        "runner-dispatch-split"
      ],
      "description": "Sole tests/data/golden writer; FORBIDDEN all other paths. ONLY on reviewed shift report (justification-class + added/removed keys + CHANGELOG snippet + file:line) from behavior items: run UPDATE_GOLDEN=1 locally (never CI), double-run byte-identical, key-by-key diff review matching shift reports, commit golden + tool counts together. If all declare no-shift: no-op attestation (golden byte-identical). NEVER blind-regen. Verify: regen report with diff review or no-op attestation; integration + test_golden pass.",
      "kind": "story",
      "milestoneId": "M5",
      "prodBudgetHint": 0,
      "slug": "golden-regen-hatch",
      "title": "Conditional golden regen on shift reports"
    },
    {
      "deps": [
        "docs-reconciliation",
        "golden-regen-hatch"
      ],
      "description": "Report-only, zero writes. Record final gate table: format exit 0; lint per-tool on scoped/clean checkout for MemoryError (mechanism + HEAD); pytest counts; integration 9-collected-0-failed with pre-commit env pinned; golden hash or regen diff; baseline []; docs must-contain per M5 checklist. Red-cell routing to new root/follow-up items, never baseline edits. Feeds close-up.",
      "kind": "fact-finder",
      "milestoneId": "M5",
      "prodBudgetHint": 0,
      "slug": "final-gate-validation",
      "title": "Final gate table and docs check"
    }
  ],
  "assumptions": [
    {
      "assumption": "Material behavior = golden (SEMANTIC=0) + checker unit tests + CLI/exit codes + baseline/autofix semantics + shipped configs/scopes. Heuristic rejections material; model accept/reject never material (dormant path). Tightening intentional when a model ships.",
      "disposition": "confirm with human",
      "why": "Preserves I1/I2 operator-approved boundary; golden stays the mechanical contract."
    },
    {
      "assumption": "Dev/CI do not install [semantic]; gates run heuristic + cache hits. Real-model tests are slow + with_real_api, never in default suite.",
      "why": "Matches current venv; keeps gates offline, fast, deterministic."
    },
    {
      "assumption": "'Never test linting' bans pytest asserting this repo passes its own gates (subprocess re-lint, AST re-implementation, config re-checks). Golden/integration contracts retained.",
      "disposition": "confirm with human",
      "why": "Operator-approved in I1; removes gate-duplicating tests without deleting fit-for-purpose contract."
    },
    {
      "assumption": "detect-secrets MemoryError on huge tracked artifacts is environmental; validate on clean/scoped checkout; never weaken baseline or exclude product paths.",
      "why": "Context-pack measurement; baseline stays [] by design."
    },
    {
      "assumption": "Operator secrets answers stand: journals committed; ^\\.factory/ filter merged; harness filter-seeding outside task; acceptance cites mechanism + HEAD.",
      "why": "Steering directive 1794158471467."
    },
    {
      "assumption": "Integration contract is 9 collected, 0 failed with pre-commit env pinned (9 passed with it, 7 passed + 2 skipped without). AGENTS.md reconciled to this contract.",
      "why": "tests/integration.py skip logic; unconditional 9/9 fails on minimal envs while stale 7 under-reports."
    },
    {
      "assumption": "Iteration 4 ships semantic infra only (backend/cache/FakeBackend/docs/corpus spike); model swap NOT complete at close-up and must not be claimed. I5 triggers: double-rated sample repairing 215/0, human Fastino decision if GLiDE recommended, CPU latency/RSS benchmark.",
      "disposition": "confirm with human",
      "why": "ADR-009 no-go gating extended by ADR-016; operator must approve infra-only close-up."
    },
    {
      "assumption": "No child epics in iteration 4; all work as root items with file-level single-writer + dep serialization (ADR-013). Item cap counts root items only (22).",
      "why": "I3 epic gate caused 3 empty waves + zero M2 delivery; direct increments avoid bottleneck."
    }
  ],
  "techDebt": [
    {
      "category": "blocking",
      "description": "No compliant model proven (215/0 unevaluable, single-author labels, Fastino review open, no CPU bench).",
      "id": "TD4-B1",
      "resolution": "ADR-009 extended by ADR-016: no model in I4; brush-off-corpus-spike produces double-rated sample + rubric + agreement for I5 bake-off; backend/cache built against FakeBackend so a compliant model plugs via get_backend()."
    },
    {
      "category": "blocking",
      "description": "I3 M1 gate not closed per engine (map running, kickoff pending) caused 3 empty waves.",
      "id": "TD4-B2",
      "resolution": "ADR-013 abandons epic gate for I4; scope-table-snapshot informational non-gating; closeup-3 verified repo scope carries forward; M2-M5 proceed via file ownership + deps."
    },
    {
      "category": "impacting",
      "description": "Pylint-pyi blind spot (42/43 findings on .py, 205 latent private symbols, companion stubs unenforced).",
      "id": "TD4-I1",
      "resolution": "pylint-pyi-scope-spike reproduces + recommends fix-with-regen vs orphan-only with budget; fix + golden regen deferred to I5; I4 golden unchanged on this axis."
    },
    {
      "category": "impacting",
      "description": "Cache refresh/root/prune/secrets unresolved (Q4-7); writer-first verdict must be consumed, not invented.",
      "id": "TD4-I2",
      "resolution": "decision-cache-design-spike prototypes schema/root/encoding/prune/refresh/secrets/zero-write proof on tmp; backend/cache impls consume verdict via deps and rewrite assumption file deliberately."
    },
    {
      "category": "adjacent",
      "description": "Docs/version drift (AGENTS stale counts/scope/pipeline, CHANGELOG 1.2.9 vs 1.2.10, README v1.2.5 pin, ty.toml sentence_transformers).",
      "id": "TD4-A1",
      "resolution": "docs-reconciliation sole AGENTS/CHANGELOG/version/pin writer in I4 (after backend/cache); semantic-tests owns non-AGENTS semantic docs and emits CHANGELOG snippet in report."
    },
    {
      "category": "adjacent",
      "description": "Over-limit modules/shims/duplicates/hardcoded paths (dispatch 542, _factories 1393, _factories_extras 511 + dup disables, test_semantic 506, baseline shims, stream blocks, mixin misc, trivial-wrapper disables, /home/slava paths).",
      "id": "TD4-A2",
      "resolution": "Split across M2-M3 items per evidence; each removal/merge names survivor; default pipeline pin retained; register() per ADR-012, mixin per attempt-with-fallback."
    }
  ],
  "adrs": [
    {
      "consequences": "No epic close-ups/handoff in I4; M5 regen consumes item shift declarations directly. 15 dep-free wave-1 items avoid empty waves. I5 may reintroduce epics or continue root increments based on I4 evidence.",
      "context": "I3 planned 3 epics behind ownership-map-revalidation + kickoff gate; map stalled (retry + 3 empty waves, Blocked none), kickoff pending, M2 zero delivery per closeup-3 audit. Map + kickoff reports live in orchestration records with high QA surface on report-only items, creating a single-item bottleneck.",
      "decision": "Iteration 4 ships no child epics; all work as root items with file-level single-writer table + dep serialization in itemOutlines (dispatch/baseline/parsers/__init__, checkers stream/legacy, _base/_semantic/_decision_*/packaging, factories/threshold/guards/baseline/portability/never-test, AGENTS/CHANGELOG, golden). Scope-table-snapshot is informational, non-gating. M2-M5 proceed without map-revision gate.",
      "id": "ADR-013",
      "title": "Root-serialized delivery replaces epic decomposition for iteration 4"
    },
    {
      "consequences": "Brush-off rejections guaranteed regardless of model; model only tightens acceptance; SEMANTIC=0 deterministic contract preserved; backend/cache tests assert veto (brush-off uncalled, one call per unique pair, hit without load, no retry storm).",
      "context": "ADR-010 says heuristic-first hard gate but current code is semantic-first with heuristic fallback (_base.py:150-158 vs _semantic.py:1-12). Open Q1 asks whether gate means must-pass-before-model or fallback-only, float vs bool, None mapping.",
      "decision": "Veto: final = heuristic(text) AND (backend.decide(...)>=threshold) when backend available; heuristic False never reaches backend or cache-write; backend None/unavailable -> heuristic stands; backend returns float [0,1], caller thresholds with DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1'; cache key (justification,rule,model), context is model-input only.",
      "id": "ADR-014",
      "title": "Heuristic-first veto semantics for DecisionBackend"
    },
    {
      "consequences": "'Coding rules enforced' not overstated in I4; golden stable on this axis; I5 plan consumes spike verdict with explicit budget.",
      "context": "_PylintPyiLintTool passes .pyi paths but pylint skips companion stubs (even broken) and lints orphan only; golden 42/43 pyi findings on .py; probe finds 205 latent private stub symbols; fixing changes golden + exposes large cleanup, conflicting with preservation unless staged.",
      "decision": "I4 runs pylint-pyi-scope-spike only (reproduce companion vs orphan, count golden impact, budget latent cleanup, recommend fix-with-regen vs document-orphan-only). No prod change, no golden change on this axis in I4. Fix + regen (if recommended) scheduled in I5.",
      "id": "ADR-015",
      "title": "Pylint-pyi scope decided by spike, fix deferred to iteration 5"
    },
    {
      "consequences": "Intent swap clause remains open after I4; infra makes I5 wiring bounded (get_backend + DECISION_MODEL, no pipeline refactor); gates stay offline/fast/deterministic.",
      "context": "ADR-009 deferred model on 215/0 structural no-go + single-adjudicator limits + Fastino review + no CPU bench. At HEAD no DecisionBackend/cache/FakeBackend exists, [semantic] still sentence-transformers, tests still reranker-coupled. Double-rated corpus + license + CPU bench still open.",
      "decision": "I4 lands model-independent infra only (veto backend + tracked cache + FakeBackend/NoBackend + packaging swap to no-model + tests/docs + corpus spike). No model wiring, no real-model default test; exactly one slow+with_real_api e2e SKELETON (skipped) allowed. Model bake-off + wiring gated on I4 corpus spike + human Fastino decision + CPU bench in I5. Close-up must not claim swap complete.",
      "id": "ADR-016",
      "title": "Iteration-4 semantic scope remains infrastructure-only"
    }
  ]
}

## Plan Review Feedback
{
  "status": "changes_requested",
  "summary": "5 milestones/22 items within bounds, acyclic, unique slugs; 12 fix (parallel collisions, orphaned contracts, missing deps, unfalsifiable scenarios), 3 architect (backend/cache values, boundary), 2 awareness (infra-only, boundaries).",
  "suggestions": [
    {
      "id": "m2-parallel-file-collision",
      "disposition": "fix",
      "summary": "M2 stale-disables and never-test-prune claim same files in parallel",
      "detail": "stale-disables owns test_autofix_conflict_integration.py:181 + t9_7 :31 hardcoded paths while prune owns autofix-conflict slow/home-write + hardcoded-checkout live (same files). Both dep-free parallel violates ADR-013 file-level single-writer. Evidence: :181 install dev_path /home/slava, t9_7:31 skipif /home/slava. Fix: serialize via dep or split by file (one owns autofix, other owns t9_7).",
      "location": {
        "file": "tests/runner/test_autofix_conflict_integration.py",
        "line": 181
      }
    },
    {
      "id": "ownership-enumeration-gaps",
      "disposition": "fix",
      "summary": "Unenumerated sets block single-writer proof; factories 9 vs 8 miscount",
      "detail": "checkers-factories claims 9 importers but grep finds 8 (beartype, no_try_import, stub, stub_callable, stub_class, stub_coverage, stub_docstring, stub_normalizer); runner +importers and dispatch +registry tests unnamed risk M2/M3 parallel overlap (both dep-free); threshold 30/33+50+35, baseline 249+308+486, 4 pair, vacuous, 3 contracts, runtime/decision/cache modules unverified. Fix: enumerate every path + recount at HEAD.",
      "location": {
        "file": "tests/checkers/_factories.py",
        "line": 15
      }
    },
    {
      "id": "shim-init-orphan",
      "disposition": "fix",
      "summary": "peek_fallback_tools removal orphaned between shim item and dispatch item",
      "detail": "baseline.py:27 defines peek, __init__.py:22 re-exports. Shim-removal deletes baseline symbols but FORBIDDEN __init__; dispatch-split sole __init__ writer omits peek removal. Both dep-free parallel -> ImportError or incomplete. Fix: explicitly assign __init__ peek lines to dispatch-split with dep on shim-removal (or vice versa).",
      "location": {
        "file": "src/python_setup_lint/runner/__init__.py",
        "line": 22
      }
    },
    {
      "id": "parsers-baseline-overlap",
      "disposition": "fix",
      "summary": "Shim parser re-exports collide with M2 baseline tests on same files",
      "detail": "Shim owns parsers re-exports + asserting tests; test_baseline_diff_parsers.py:13 imports _parse_* from parsers (deletion target); baseline-merge owns test_baseline_diff*.py. M2 vs M3 both dep-free parallel same files. Fix: dep-serialize (shim after baseline-merge) + enumerate asserting tests excluding/including with dep.",
      "location": {
        "file": "tests/runner/test_baseline_diff_parsers.py",
        "line": 13
      }
    },
    {
      "id": "docs-final-missing-deps",
      "disposition": "fix",
      "summary": "Docs + final gate omit deps on M2, will record stale counts",
      "detail": "docs-reconciliation deps only backend/cache but AGENTS counts need M2 prune/factories/baseline (--collect-only, TOOLS==14, 9-collected); final-gate deps only docs+regen but gate table needs all M2 pytest/integration/golden effects. Both can run before M2. Fix: add deps docs<-[M2 test items], final<-[M2 + M3 behavior + M4 tests].",
      "location": {
        "file": "tests/integration.py",
        "line": 60
      }
    },
    {
      "id": "regen-env-var",
      "disposition": "fix",
      "summary": "Regen cites UPDATE_GOLDEN but code uses PYTHON_SETUP_LINT_UPDATE_GOLDEN",
      "detail": "tests/_golden.py:53 UPDATE_ENV full name, refused under CI; M5 interface + hatch say UPDATE_GOLDEN=1. Wrong var -> regen never triggers, shifts unhandled. Fix: replace all with full var + cite _golden.py:53 + CI/GITHUB_ACTIONS guard.",
      "location": {
        "file": "tests/_golden.py",
        "line": 53
      }
    },
    {
      "id": "scope-scenario-unfalsifiable",
      "disposition": "fix",
      "summary": "M1 scope Given cites off-limits orchestration; red-HEAD criteria undefined",
      "detail": "Given HEAD plus I2 audits plus closeup-3 references orchestration records (containment forbids). Gate-baseline Then records exits/counts/hashes but unclear pass when HEAD red (record red vs fail?). Later gates-green meaningless if baseline red. Fix: Given clean HEAD only (git status clean + SHA); Then define red (record + follow-ups, still non-gating) vs green.",
      "location": {
        "file": "lint.baseline",
        "line": 1
      }
    },
    {
      "id": "scenario-falsifiability-gaps",
      "disposition": "fix",
      "summary": "Bundled/disjunctive scenarios omit pins, criteria, and exact strings",
      "detail": "M2 bundles baseline+portability+prune in 1 scenario + default pin unnamed; M3 deleted-or-evidenced / identical-or-shift, M4 evaluable-or-blocked lack when-criteria; corpus scenario omits N>=100, both strata, per-source, protocol (in item); M5 docs must-contain lists topics not strings. Fix: split M2 x3, name pin, pin disjunctions (grep zero vs evidence+debt; hash equal vs class+keys+snippet+file:line), align corpus, enumerate exact strings.",
      "location": {
        "file": "tests/runner/test_baseline_diff.py",
        "line": 12
      }
    },
    {
      "id": "legacy-stream-unverifiable",
      "disposition": "fix",
      "summary": "M3 legacy + stream omit rename target, API, blocks, locations, joiner",
      "detail": "_legacy_scan rename target undefined (:61,63 + .pyi:21); astroid 3.x body[0].value branch uncited; register() scope conformance-only vs all 20+ ambiguous vs ADR-012; _source_stream signature + enumerated sites missing (all listed blocks unlisted; verified 3 stream() sites but coverage/comment scope unclear); joined sorted codes joiner/sort/match undefined yet M4 consumes. Fix: name method, cite branch, scope register, define API + sites, define joiner.",
      "location": {
        "file": "src/python_setup_lint/checkers/conformance/suppression_justification_checker.py",
        "line": 61
      }
    },
    {
      "id": "backend-contradictions",
      "disposition": "fix",
      "summary": "Backend preserves signature + bool|None yet adds kwarg + veto always-bool",
      "detail": "Interface preserves check_if_meaningful signature + SEMANTIC=0 (_base.py:142,151) yet adds kwarg public .pyi (which fn? _base/_semantic/_backend?); preserves semantic_check bool|None yet ADR-014 veto final=heuristic AND prob>=threshold always bool, None obsolete (loader None->heuristic). Unsatisfiable both. Fix: clarify backward-compat optional kwarg (e.g. backend=None) + None mapping (never return None vs preserve fallback signal).",
      "location": {
        "file": "src/python_setup_lint/checkers/_base.py",
        "line": 142
      }
    },
    {
      "id": "adr-docs-ownership",
      "disposition": "fix",
      "summary": "ADR-013..016 placeholders have no owning item",
      "detail": "docs/adr/ADR-013..016 are 3-line stubs; plan ADRs define delivery, veto, pyi scope, infra-only but no item owns docs/adr/*. Docs item owns AGENTS/CHANGELOG/README/ty.toml; semantic-tests owns semantic docs. Veto (014) + infra-only (016) persistent. Fix: assign ADR-014+016 (at least) to docs/semantic-tests with must-contain.",
      "location": {
        "file": "docs/adr/ADR-013.md",
        "line": 1
      }
    },
    {
      "id": "secrets-scan-ambiguity",
      "disposition": "fix",
      "summary": "Secrets full scan vs filtered + clean vs scoped undefined",
      "detail": ".secrets.baseline:42 excludes ^\\.factory/ so full git-ls-files exit 0 is filtered not full; M1 clean checkout vs M5 scoped/clean for MemoryError undefined (fresh clone? which paths/tools? all 14 or detect-secrets only?). Fix: rephrase filtered scan (cite filter+version+signature), define clean (fresh clone, HEAD SHA) + scoped + planted control exact secret/location/replication.",
      "location": {
        "file": ".secrets.baseline",
        "line": 42
      }
    },
    {
      "id": "backend-threshold-joiner-decisions",
      "disposition": "architect",
      "summary": "Backend missing values need architect decision",
      "detail": "DECISION_THRESHOLD value unstated; joined-rule joiner/sort/match undefined; FakeBackend score + model string for Fake (model <id> rev short12 prompt-vN ill-fits Fake) undefined; DECISION_MODEL/RERANKER warning channel + dedup (structlog vs warnings, once per process/call, text) undefined; [semantic] empty vs removed + uv.lock regen undefined (pyproject:28 still sentence-transformers). Exceeds item scope; items will invent incompatibly. Architect must pin all.",
      "location": {
        "file": "pyproject.toml",
        "line": 28
      }
    },
    {
      "id": "cache-refresh-decisions",
      "disposition": "architect",
      "summary": "Cache refresh disjunction + guards need architect contract",
      "detail": "Interface cli-flag OR setup-subcommand per verdict is disjunction not contract; lockfile+merge+atomic is implementation not caller/callee; DECISIONS_PATH scope (test-only under PYTEST_CURRENT_TEST vs prod? traversal guard?) undefined; files POSIX cardinality/merge, prune +age conditional, --path/jobs>1 per verdict unfalsifiable; spike poc report-only with no completeness gate. Architect must define invocation, CI direction (fail vs require), isolation, files/jobs.",
      "location": {
        "file": "tests/assumptions/test_pylint_cache_semantics.py",
        "line": 11
      }
    },
    {
      "id": "file-level-boundary-breach",
      "disposition": "architect",
      "summary": "Block-level split + double-merge breach ADR-013 file-level",
      "detail": "Guards owns suppression file EXCEPT pipeline block :357, semantic-tests owns block in same file (block-level not file-level) serial but conflict-prone; threshold files touched by M2 merge then M4 merge-tables-pinned (double-touch, second may discard first). Violates file-level single-writer + wastes work. Architect must re-scope to file handoff (M4 owns whole file after M2 or move block) + clarify M2 dedup survives.",
      "location": {
        "file": "tests/checkers/test_suppression_justification_checker.py",
        "line": 357
      }
    },
    {
      "id": "infra-only-closeup",
      "disposition": "human-awareness",
      "summary": "I4 infra-only leaves intent model swap open",
      "detail": "Intent replaces cross-encoder (_semantic.py:1 reranker, sentence-transformers) with CPU decision model + git cache; ADR-016 ships backend/cache/Fake/docs/corpus only, no wiring, close-up must not claim swap, I5 gated on corpus + human Fastino + CPU bench. High-impact cut architect can decide per ADR-009 no-go (215/0, single-author, no bench). Inform operator swap open.",
      "location": {
        "file": "src/python_setup_lint/checkers/_semantic.py",
        "line": 1
      }
    },
    {
      "id": "material-never-test-boundaries",
      "disposition": "human-awareness",
      "summary": "Material + never-test-linting re-confirm I1 operator boundaries",
      "detail": "Material = golden SEMANTIC=0 + unit + CLI/exit + baseline/autofix + configs (heuristic material, model never); never-test-linting bans pytest asserting own gates while retaining golden/integration. Both confirm-with-human, I1-approved. Architect decides preserve; golden stays mechanical contract. Informational only.",
      "location": {
        "file": "tests/_golden.py",
        "line": 1
      }
    },
    {
      "id": "polish-typos-categorization",
      "disposition": "optional",
      "summary": "Polish typos, wording, license site, categorization, skeleton, gitignore",
      "detail": "M1 title K kickoff typo; assumption item-cap wording (22 within 50 not cap=22); U1 CC-BY-NC buried should be assumption/ADR allowlist; TD4-I2 cache blocks M4 should be blocking not impacting (or justify); skeleton allowed should be required/skipped or forbidden; .gitignore old cache stale but untouched intentional debt. Non-blocking.",
      "location": {
        "file": "config/ty.toml",
        "line": 8
      }
    }
  ]
}

## Context Pack
# Context Pack — `modernize`

Repository: `python-setup` v1.2.10 (`pyproject.toml:1-4`), Python `>=3.14`, MIT. The intent has three strands: enforce `CodingRules.md`/`AGENTS.md` across the code base, debloat code and tests while keeping test intent, and replace the embedding/reranker justification check with a CPU-friendly small decision model plus a git-stored, self-cleaning cache.

---

## 1. Snapshot and Gate State

| Fact | Evidence |
|---|---|
| Version / Python floor | `pyproject.toml:1-4` (`1.2.10`, `>=3.14`) |
| Lint baseline | `lint.baseline:1` is `[]` — zero tolerated pre-existing violations |
| Self-lint gate | `uv run lint` runs 14 tools with baseline diffing; pre-commit hook runs `lint --fix --baseline lint.baseline` (`AGENTS.md:9-12`, `AGENTS.md:129-138`) |
| Pylint complexity gates | `max-module-lines=500`, `max-statements=65`, `max-branches=16`, `max-locals=20` (`config/.pylintrc:2`, `config/.pylintrc:21-27`); tests have their own rcfile (`config/.pylintrc-tests:19-39`); stubs have their own rcfile (`config/.pylintrc-pyi:8-39`) |
| Default pytest selection | `addopts = "-m 'not slow'"`; markers `slow`, `no_external_api`, `with_real_api`, `implementation_detail` (`pyproject.toml:48-55`) |
| Unit probe (2026-11-08) | `uv run pytest -q` → `1378 passed, 4 skipped, 18 deselected, 4 warnings in 27.19s`; the 4 skips are `pytest.importorskip("sentence_transformers")` in `tests/checkers/test_semantic_check.py:432,453,473,493` |
| Integration probe (2026-11-08) | `uv run pytest tests/integration.py -q` → `9 passed in 65.61s` |
| Pylint trio probe (2026-11-08) | `uv run lint --tools "pylint,pylint-pyi,pylint tests" --baseline lint.baseline` → pylint reports `10.0/10`, baseline reports no new violations, 37.86s |
| AGENTS counts are stale | `AGENTS.md:10-11` says `1290 pass, 4 skip, 15 deselected` and `7` integration tests; actual probes are 1378/4/18 and 9 |
| Integration is not in the default selector | `tests/integration.py` is named `integration.py`, not `test_*.py`; pytest default collection plus `pyproject.toml:48-55` means `uv run pytest -q` does not run the golden end-to-end test. `AGENTS.md:92` tells developers to run it explicitly |
| Self-lint test is slow/deselected | `tests/runner/test_self_lint_clean.py:17` sets `pytestmark = pytest.mark.slow`; it asserts rc 0, no `[CRASH]`, no unexpected `SKIPPED`, and pylint `"score": 10.0` (`tests/runner/test_self_lint_clean.py:20-59`) |

**ADRs at HEAD are decisions, not implementation.** `docs/adr/ADR-009.md:5` accepts a deferral, `docs/adr/ADR-009.md:29-37` says iteration 3 delivers a `DecisionBackend` plus tracked-cache infrastructure, and `docs/adr/ADR-010.md:23-36` freezes the backend/cache contracts. At HEAD the production module still uses `sentence_transformers.CrossEncoder` and `~/.cache/python-setup/semantic/results.json` (`src/python_setup_lint/checkers/_semantic.py:1-12`, `:37-52`, `:93-122`); no `DecisionBackend`, `get_backend`, or `.python-setup-decisions.json` implementation exists in `src/`. This is the central semantic open question (see §7).

---

## 2. Module Map

### 2.1 Checker subsystem (`src/python_setup_lint/checkers/`)

| File(s) | Responsibility |
|---|---|
| `_base.py` (238 lines) + `_base.pyi` | Shared checker helpers: `MessageDef`, `_msgs`, path/source-root helpers, `SourceRootMixin`, `FunctionVisitMixin`, and the public `check_if_meaningful` decision entry point (`_base.py:27-238`). |
| `_semantic.py` (189 lines) + `_semantic.pyi` | Optional NLP justification pipeline: lazy `CrossEncoder` load, pair scoring at threshold 0.5, in-memory + home-directory JSON result cache (`_semantic.py:1-12`, `:37-189`). |
| `conformance/` (17 checker modules) | Pylint checkers implementing project rules: `no-try-import`, `missing-beartype`, `missing-return-annotation`, `unjustified-suppression` (W9704), `bare-except-comment`, `silent-except`, `trivial-wrapper`, `redundant-type-guard`, `generic-key-dict`, `unnamed-tuple-dict`, `pyi-underscore-symbol`, `use-structlog`/`use-structured-logging`, `missing-error-chain`, `asyncio-timeout`, `tempfile-mkdtemp-in-test`. Registration is `register(linter)` in each module; the installer discovers them via `pkgutil.walk_packages` (`setup.py:97-116`) and adds them to consumer `load-plugins` (`setup.py:179-203`). |
| `stub/` | Stub checker (`stub/checker.py`, 379 lines), coverage/resolution (`stub/coverage.py`, 241 lines), import contract, docstring rules (`stub/docstring_checker.py`, 237 lines), and fidelity invariants (`stub/fidelity/*`, ~0.8k lines). |

### 2.2 Runner subsystem (`src/python_setup_lint/runner/`)

| File(s) | Responsibility |
|---|---|
| `dispatch.py` (542 lines) | Single-source 14-tool registry (`TOOLS`, `dispatch.py:46-137`), live `LINT_TOOLS` registry (`:503-507`), seven per-tool strategy subclasses (`:155-451`), `register_lint_tool` (`:517-542`). |
| `cli.py` (413 lines) | `main`/`run_lint` orchestration, fix phase, tool selection, baseline handling (`run_lint` at `:204-273`; CLI parser at `:274-413`). |
| `baseline.py` (303 lines) | Violations-only baseline capture/diff, sorted atomic JSON writer (`:182-229`), legacy-compatible shims (`:20-42`). |
| `parsers.py` (290) + `_record_parsers.py` (277) | Per-tool text/JSON record parsers and `Record` type; backward-compat re-exports (`parsers.py:7-31`). |
| `cmd_build.py` (293) | Command construction, path/glob discovery, config-flag resolution, pylint rcfile resolution. |
| `output.py` (265) | Subprocess execution (`_run_cmd`, `:153-223`), memory guard (`RLIMIT_AS`, default 2048 MB), statistics printing. |
| `types.py` (65) | `ToolSpec`, `LintResult`, `ViolationCount`, `RunnerConfig` (`types.py:12-65`). |
| `_config.py` (152), `_cli_complexity.py` (154), `_cli_helpers.py` (65), `_autofix.py` (125), `extra_tools.py` (322), `_baseline_helpers.py` (82), `_record_types.py` (19) | Supporting config, CLI, autofix, declarative extra-tool, and baseline helpers. |

### 2.3 Setup / testing / packaging

| File(s) | Responsibility |
|---|---|
| `setup.py` (413) + `_setup_precommit.py` (145), `_setup_pyproject.py` (97), `_setup_update.py` (108) | Consumer install/update: add dependency, checker discovery + `load-plugins`, pre-commit template, AGENTS snippet, config symlinks, drift detection, state file (`setup.py:35-53`, `:97-116`, `:179-205`, `:365-413`). |
| `testing.py` (196) | Consumer-agnostic test helpers: `_make_tc`, `_walk_and_release`, `make_lint_result`, `FakeRunCmd`, pre-commit validators (`testing.py:18-196`). |
| `pyproject.toml` | Main deps (`astroid>=4.0.4`, `beartype`, `pylint`, `pytest`, `structlog`, `tomli-w`; `:10-16`), optional `[semantic]` extra (`:28-31`), wheel force-includes `config/` and `CodingRules.md` (`:39-46`), pytest config (`:48-55`), dev group (`:58-85`). |
| `config/` | Shipped tool configs: `.pylintrc`, `.pylintrc-tests`, `.pylintrc-pyi`, `ruff.toml` (line-length 130, target `py314`), `mypy.ini` (`strict = true`), `pyrightconfig.json`, `ty.toml`, `rumdl.toml`, `yamllint`, `tach.toml`. |
| `CodingRules.md`, `AGENTS.md`, `README.md`, `docs/` | Shipped coding rules, agent index, user docs, semantic docs, troubleshooting, tutorials, ADRs (`docs/adr/`). |
| `tach.toml` | Module boundaries: `python_setup_lint/checkers` and `python_setup_lint/runner` both declare `depends_on = []`; checkers must not import runner (`tach.toml:14-21`). Any new decision module must respect this. |

### 2.4 Tests (`tests/`)

59 `test_*.py` modules plus helpers, ~18.8k lines excluding `tests/data/`. Layers: unit checker tests (`tests/checkers/`), runner tests (`tests/runner/`), third-party assumption tests (`tests/assumptions/`), golden-helper tests (`tests/test_golden.py`), setup/config-symlink tests, and the non-auto-collected end-to-end `tests/integration.py` with planted-violation sample project and golden snapshot (`tests/data/golden/*.json`).

---

## 3. Key Interfaces & Signatures

### 3.1 Justification decision entry point — `check_if_meaningful`

`src/python_setup_lint/checkers/_base.py:142-238`:

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

Flow:

1. If `PYTHON_SETUP_LINT_SEMANTIC` is `"1"` (default), lazily import `semantic_check_if_meaningful` and call it with `(text, rule=..., code_context=..., comment=...)` (`_base.py:150-158`).
2. If the semantic function returns `None`, fall back to the heuristic (`_base.py:160-211`): empty or `<5` chars rejects; a 50-entry boilerplate set rejects; a 16-entry meaningless-phrase set rejects; a justification equal to the rule symbol rejects (`_base.py:210-238`).

`_base.pyi:69-95` documents this helper but says `*rule*` and `*code_context*` are “reserved for future semantic analysis” — stale, because both are used by `_semantic.py:164-177`.

Call sites (all five pass a real rule/context):

- `SuppressionJustificationChecker._emit_if_unjustified` — `conformance/suppression_justification_checker.py:149-155`.
- `SuppressionJustificationChecker._has_justification` — same file `:370-386` (trailing and preceding comment paths).
- `BareExceptCommentChecker._has_justifying_comment` — `conformance/bare_except_comment_checker.py:103-120` (trailing and preceding comment paths).

### 3.2 Semantic implementation — `semantic_check_if_meaningful`

`src/python_setup_lint/checkers/_semantic.py:125-189`:

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

| Detail | Evidence |
|---|---|
| Primary text is `(comment or text).strip()`; empty returns `False` before key computation | `_semantic.py:133-140` |
| Cache key = SHA-256 over `(text, rule, code_context, comment, _RERANKER_MODEL)`, truncated to first 8 bytes / 64-bit int | `_semantic.py:142-157` |
| Model singleton is lazy-loaded; `ImportError` or load failure sets `_RERANKER_UNAVAILABLE` and returns `None` | `_semantic.py:93-122` |
| Query = `"rule: ... | context: ..."` when rule/context exist, otherwise self-pair `(primary, primary)` | `_semantic.py:164-177` |
| Score below `0.5` rejects; each new verdict is appended to `_RESULT_CACHE` and the whole JSON file is rewritten | `_semantic.py:178-189` |
| Public stub exposes only `semantic_check_if_meaningful`; `__all__` also exposes private test hooks `_RERANKER_UNAVAILABLE`, `_load_reranker`, `_reset_cache` | `_semantic.pyi:1-24`, `_semantic.py:26-31` |
| The optional extra is only `sentence-transformers>=3.0.0` | `pyproject.toml:28-31` |

### 3.3 Cache and model constants (current, to be replaced)

`_semantic.py:37-52`:

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

Load/save are best-effort: missing file → `{}`; corrupt JSON/OSError/ValueError → warning + `{}`; save uses non-atomic `Path.write_text` (`_semantic.py:55-78`). `_reset_cache` clears both globals and unlinks the file (test helper; `:81-91`). `.gitignore:243-244` explicitly ignores `.cache/python-setup/semantic/`.

### 3.4 Planned backend contract from ADR-010 (absent at HEAD)

`docs/adr/ADR-010.md:23-36` fixes:

- `DecisionBackend` Protocol: `decide(justification, rule, context) -> float` in `[0.0, 1.0]`, with a heuristic-first hard gate.
- Tracked cache `.python-setup-decisions.json` at the linted project root: sorted JSON array, `indent=2`, `sort_keys`, no bare hex strings of length ≥20, must pass the secrets scan.
- Ordinary lint is read-only with a hash-asserted zero-write check; cache updates only through an explicit CI-guarded refresh path (lockfile + merge + atomic replace).
- Prune missing files and stale model identifiers.
- Concurrency semantics must come from the `pylint-cache-assumptions` verdict, not invented.
- `PYTHON_SETUP_LINT_DECISION_BACKEND` is honored only when `PYTEST_CURRENT_TEST` is set; production lint ignores it.

No implementation module exists at HEAD; `_semantic.py` remains the only decision path.

### 3.5 Runner interfaces relevant to a cache-refresh command

- `ToolSpec` fields include `timeout`, `memory_limit_mb`, `supports_path`, `supports_fix` (`runner/types.py:12-22`); default memory limit is 2048 MB (`types.py:22`) and pylint specs use that default (`dispatch.py:112-132`). `_run_cmd` applies `RLIMIT_AS` and injects `cwd/.venv/bin` on PATH (`runner/output.py:153-223`).
- `run_lint` accepts `path`, `fix`, `baseline`, `overwrite_baseline`, `statistics`, etc. (`runner/cli.py:204-273`); `main` exposes `--baseline`, `--overwrite-baseline`, `--path`, `--tools`, `--cwd`, `--config` (`runner/cli.py:284-360`). There is no decision-cache refresh flag today.
- The setup CLI has only `install` and `update` subcommands (`setup.py:365-413`); a `refresh-decisions`/`prune-decisions` command would be a new surface.
- `runner/baseline.py:201-229` is the existing pattern for a sorted, atomic, `indent=2`, `sort_keys` JSON artifact; it uses a temp file in the system temp dir and `shutil.move`, whereas ADR-010 asks for atomic replace at the project root.

### 3.6 Checker helper / test harness interfaces

- `SourceRootMixin` declares `source-roots` option, resolves it in `open()`, and exposes `_skip_if_outside_source_roots` (`checkers/_base.py:96-128`).
- `FunctionVisitMixin` dispatches `visit_functiondef`/`visit_asyncfunctiondef` to `self._check_function` (`_base.py:131-140`).
- `testing._make_tc` builds a `CheckerTestCase`; `_walk_and_release` parses source, optionally sets `module.file`, walks, and drains messages (`testing.py:18-41`).
- Checker tests import `_walk_and_release` directly or via `tests/checkers/_factories.make_tc` (`tests/checkers/_factories.py:40-43`).

---

## 4. Relevant Excerpts and Implementation Logic

### 4.1 Current semantic pipeline is reranker-first, not heuristic-first

`_semantic.py:1-12`:

```python
# Semantic justification checker using a cross-encoder reranker (Track B).
# ...
# 1. Cross-encoder reranking (jina-reranker-v2-base-multilingual):
#    Re-score the justification against the rule and code context with a
#    dedicated cross-encoder for higher accuracy.
# ...
# On ImportError ... or model download failure, semantic_check_if_meaningful
# returns None, signalling the caller to fall back to the heuristic check.
```

This is the opposite ordering from ADR-010’s “heuristic-first hard gate.” The current gate is in `_base.py:150-158`: semantic first, heuristic only when `None`.

### 4.2 `semantic_check_if_meaningful` scoring and write path

`_semantic.py:142-189` (condensed):

```python
cache_key = hashlib.sha256(
    "|".join(str(x) for x in (text, rule, code_context, comment, _RERANKER_MODEL)).encode()
).digest()
cache_key_int = int.from_bytes(cache_key[:8], "big")
if cache_key_int in _RESULT_CACHE:
    return _RESULT_CACHE[cache_key_int]

reranker = _load_reranker()
if reranker is None:
    return None
...
scores = reranker.predict([(primary, query)])
result = float(scores[0]) >= 0.5
_RESULT_CACHE[cache_key_int] = result
_save_result_cache()
return result
```

Implications: one model prediction per cache miss, synchronous whole-file rewrite, no file path in the key, no prune path, no explicit model metadata beyond the key.

### 4.3 W9704 emission and the two decision call paths

`SuppressionJustificationChecker` defines W9704 (`suppression_justification_checker.py:31-41`), scans raw lines for suppression patterns while excluding string-literal spans (`:44-91`), checks `Any` annotations/functions (`:96-162`), and evaluates trailing/preceding comments (`:331-388`). The call site inside `_emit_if_unjustified` is:

```python
if check_if_meaningful(
    reason, comment=reason, rule="unjustified-suppression", code_context=src_line.split("#", 1)[0].strip()
):
    return
self.add_message("unjustified-suppression", ...)
```

`BareExceptCommentChecker._has_justifying_comment` performs the same trailing/preceding-comment shape for `bare-except-comment` (`bare_except_comment_checker.py:74-120`). The two checkers duplicate comment extraction and `check_if_meaningful` wiring; a shared source-stream/comment helper is a natural debloat target (ADR-011 names a planned `checkers/_source_stream.py`, which does not exist at HEAD).

### 4.4 Cache writer verdict that any redesign must consume

`tests/assumptions/test_pylint_cache_semantics.py:11-48` records the writer-first verdict:

- Writer identity: `semantic_check_if_meaningful` calls `_save_result_cache`; runner performs no merge; checker `open()`/`close()` do not write.
- Timing: one whole-file rewrite per miss, synchronously before return; hits, heuristic fallbacks, and empty-primary short-circuit write nothing.
- `--path` scoping: `--path` only narrows file arguments; the cache key is path-free, so scoped and full runs share entries.
- Sweep implication: because identity is path-free, a tracked schema needs per-entry `files` references; today’s schema is only `dict[int, bool]`.
- Concurrency: pylint `jobs` defaults to 1; shipped rc files do not raise it; a consumer override with `jobs > 1` voids the single-writer claim and flips to sidecars/merge or lock + atomic replace.
- Crash safety: current writer is non-atomic `Path.write_text`; corrupt JSON loads as empty and is recomputed.

The test also pins the current contract directly: home-dir single cache (`test_pylint_cache_semantics.py:298-305`), path-free signature (`:276-296`), one `_save_result_cache` caller (`:335-349`), and no cache artifacts outside `_semantic.py` (`:351-364`).

### 4.5 ADR-010 conflicts with the current tests

`docs/adr/ADR-010.md:26-28` requires a project-root tracked JSON array with per-entry file/model metadata and no long bare hex; `tests/assumptions/test_pylint_cache_semantics.py:298-305` asserts a single `~/.cache/python-setup/semantic/results.json`, and `:276-296` asserts the API/signature is path-free. `tests/checkers/test_semantic_check.py:321-360` independently recomputes the 64-bit SHA-256 key and pre-populates `_RESULT_CACHE`. A redesign must rewrite these tests, not merely extend them.

### 4.6 `pylint-pyi` scoping defect (rule-enforcement gap)

`_PylintPyiLintTool.build_command` passes `.pyi` file paths to pylint (`runner/dispatch.py:342-370`; `_find_pyi_files` at `runner/cmd_build.py:82-93`). Probe behavior:

- A temp `.pyi` with a companion `.py` is skipped by pylint (even a syntactically broken `.pyi` produces no error); an orphan `.pyi` is linted and `pyi-underscore-symbol` fires.
- The committed golden confirms the consequence: of 43 `pylint-pyi` findings in `tests/data/golden/minimal_sample_project_findings.json`, 42 are on `.py` files and only 1 is on `standalone.pyi` (the orphan stub).

So `pylint-pyi` currently re-lints companion `.py` modules under the pyi rcfile and does not enforce `pyi-underscore-symbol`/`duplicate-code` on companion stubs. A probe of `src/python_setup_lint/**/*.pyi` found 205 non-`TYPE_CHECKING` private symbols in 29 stub files (169 functions, 5 classes, 31 annotated assignments) that the `PyiUnderscoreChecker` would flag if stubs were actually linted (`conformance/pyi_underscore_checker.py:19-90`). `.pylintrc:4` and `.pylintrc-tests:22` ignore `*.pyi`, so only `pylint-pyi` is supposed to cover them. This is a high-signal enforcement gap; fixing it changes the golden contract and would expose a large latent cleanup.

### 4.7 Existing sorted-JSON/atomic-write patterns

- Baseline writer: `runner/baseline.py:201-229` uses temp file + `json.dump(..., indent=2, sort_keys=True)` + `shutil.move`; `_write_baseline_if_modified` is gated by a `baseline_modified` flag.
- Setup atomic writer: `_setup_precommit.py:70-84` uses `NamedTemporaryFile(dir=gettempdir(), delete=False)` + `shutil.move`.
- Setup state writer: `setup.py:278-290` writes `.python-setup-state.json` with `json.dumps(..., indent=2, sort_keys=True)` via `_atomic_write`.
- Baseline diffing silently rewrites the baseline on removals (`runner/baseline.py:286-299`), which is a precedent for auto-pruning but conflicts with ADR-010’s read-only decision-cache rule; the architect should decide whether the decision cache follows the baseline model or the stricter ADR-010 model.

---

## 5. Existing Tests and Conventions

### 5.1 Test layers and commands

| Layer | Command | Scope / evidence |
|---|---|---|
| Unit | `uv run pytest -q` | 59 `test_*.py` modules; excludes `slow`; ~27-34s; probe 1378 passed, 4 skipped, 18 deselected |
| Integration / golden | `uv run pytest tests/integration.py -q` | End-to-end install + 14-tool lint on `tests/data/minimal_sample_project`; golden multiset + oracle rules + per-tool minimums; probe 9 passed, 65.6s (`tests/integration.py:1-10`, `tests/_golden.py:1-12`) |
| Self-lint | `uv run lint` | 14 tools, baseline diff, ~100s warm per `AGENTS.md:9`; pre-commit hook runs it with `--fix` (`AGENTS.md:129-138`) |
| Self-lint guard | `uv run pytest tests/runner/test_self_lint_clean.py -q -m slow` | Slow/deselected; asserts rc 0 and pylint 10.0 (`test_self_lint_clean.py:17-59`) |
| Assumptions | `uv run pytest tests/assumptions -q` | Pins astroid 4.0.4, beartype 0.22.9, pylint 4.0.6, and the semantic cache writer verdict |

### 5.2 Checker test conventions

- Most checker tests use `_walk_and_release(code, CheckerClass, file_path=...)` and assert on `msg.msg_id` (`tests/checkers/test_suppression_justification_checker.py:1-120`; `testing.py:18-41`).
- Shared parametrize tables and helpers live in `tests/checkers/_factories.py` (1393 lines, 16 functions), imported by 9 checker test modules. The file header claims “data tables are free LOC” and disables `too-many-lines` (`tests/checkers/_factories.py:1-15`), but `CodingRules.md:139-159` does not grant that exemption.
- Runner tests use `RunnerConfig`, `make_lint_result`, `FakeRunCmd`, and `tests/runner/_factories*.py` (209 + 279 + 394 + 511 lines) imported by 16 runner test modules; `tests/runner/_factories_extras.py:1` and `:6` both disable `too-many-lines` and claim 502 lines while the file is 511.
- Fixtures: `tests/conftest.py` provides `tmp_baseline`, `runner_config_factory`, `isolated_runner_registries`, `empty_project`, `configured_project` (`tests/conftest.py:1-160`). `configured_project` runs install once per session with a hardcoded `dev_path="/home/slava/aiexp/python-setup"` (`tests/conftest.py:86`).
- Project helpers: `tests/_project_helpers.py` is the single source for sample-project copy, git init/stage, shipped config paths, runner config, and install idempotency (`tests/_project_helpers.py:1-204`). It must not import `tests.conftest`/`tests.integration` (module docstring `:1-8`).
- Test naming convention is `test_<method>_given_<condition>_then_<expected>` (`CodingRules.md:288-290`). Probe: 497/799 test functions (62.2%) match; 60+ files are below 50%. `CodingRules.md:256-270` requires every test to be `no_external_api` or `with_real_api`; probe: 31/60 test modules carry a category marker.

### 5.3 Golden behavior-preservation contract

`tests/_golden.py` is the sole owner of normalization/serialization/assertions; a `Finding` is `(tool, file, line, col, rule)`, compared as a multiset (`Counter`) so duplicates, moved lines, new false positives, and dropped findings fail (`tests/_golden.py:1-12`, `:53-120`). Regeneration is opt-in via `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1` and refused under CI (`tests/_golden.py:9-12`, `:370-420`). The golden capture explicitly disables the semantic pipeline with `monkeypatch.setenv(SEMANTIC_ENV, "0")` (`tests/integration.py:109-113`), and asserts the planted brush-off at `src/minimal_sample/mod.py:49` fires while the carry-from justification at `:56` does not (`tests/integration.py:124-129`; sample source `tests/data/minimal_sample_project/src/minimal_sample/mod.py:45-57`).

Consequently, the model swap has **no deterministic coverage**: the golden pins heuristic W9704 behavior only; the 4 reranker pair tests skip without `sentence_transformers`, and the 2 slow semantic tests are deselected by default (`tests/checkers/test_semantic_check.py:424-506`; skip probe above).

### 5.4 Semantic test inventory and redundancy

| File | Lines / roles | Redundancy / impact |
|---|---|---|
| `tests/checkers/test_semantic_check.py` | 506 lines; 7 classes: import fallback, default fallback, reranker sentinel, brush-off patterns, meaningful patterns, pipeline, reranker pairs (`:20-506`) | Over C0302; header claims 504 lines (`:1`). Heuristic pattern lists at `:159-257`; reranker-specific classes at `:424-506` encode the current cross-encoder contract. Weak assertions like `result is None or isinstance(result, bool)` and `result is True or result is None` (`:271-286`, `:430-506`) cannot fail meaningfully. |
| `tests/checkers/test_semantic_threshold.py` | 135 lines; `TestSemanticThreshold` (`:19-135`) | Its 30 meaningful comments are fully contained in `test_semantic_check.py`’s 33 (probe: 30/33 overlap); its 50 meaningless comments overlap only 3 with the brush-off list. Prime consolidation candidate. |
| `tests/checkers/test_suppression_justification_checker.py` | 390 lines; 42 tests incl. slow `TestSuppressionRerankerPipeline` (`:356-390`) | The slow reranker pipeline tests duplicate semantic-pipeline coverage and add a download dependency; the rest are genuine checker behavior tests. |
| `tests/assumptions/test_pylint_cache_semantics.py` | 485 lines; `TestSemanticCacheWriter`, `TestSemanticCachePathScoping`, `TestPylintRcfileJobsWatchdog`, `TestPylintInvocationConcurrency` (`:129-485`) | Intimately coupled to `_CACHE_DIR`, `_RESULT_CACHE_FILE`, `_RERANKER_MODEL`, `_load_reranker`, `_save_result_cache`; a cache redesign must rewrite this file. |

### 5.5 Existing debloat evidence (objective)

| Category | Evidence |
|---|---|
| Over-limit modules | `tests/checkers/_factories.py` 1393 lines (disable at `:15`), `src/.../runner/dispatch.py` 542 (disable at `:1`), `tests/runner/_factories_extras.py` 511 (disables at `:1` and `:6`), `tests/checkers/test_semantic_check.py` 506 (disable at `:1`) |
| Stale over-limit suppressions | `tests/runner/test_lint_runner.py` 479 lines (disable at `:7`), `tests/runner/test_lint_runner_integration.py` 418 (disable at `:1`); both are under the 500-line limit |
| Stale comments | `test_semantic_check.py:1` says 504 vs 506; `_factories_extras.py:1` says 502 vs 511; `_base.pyi:69-95` says rule/context are unused |
| Backward-compat shims | `runner/baseline.py:20-42` (`_FALLBACK_TOOLS`, `peek_fallback_tools` returning empty, `_compare_sorted` re-export); `runner/parsers.py:7-31` re-exports; `dispatch.py:503-507` `TOOLS` legacy alias; `trivial_wrapper_checker.py:28-36` exemption names `_legacy_to_records`/`_legacy_current_output`/`_legacy_saved_output` that no longer exist |
| Duplicate helpers | `checkers/stub/coverage.py:131-138` reimplements `_is_under_source_root` already in `checkers/_base.py:54-62`; `bare_except_comment_checker.py:74-120` and `suppression_justification_checker.py:331-388` duplicate trailing/preceding-comment extraction |
| Dead compatibility code | `_add_doc_node_spans` handles astroid 4.x `.doc_node` **and** astroid 3.x `body[0].value` (`suppression_justification_checker.py:247-271`), but the project floors astroid at `>=4.0.4` (`pyproject.toml:11`; lock 4.0.4 at `uv.lock:71-76`) |
| Redundant exception checks | `_semantic.py:66` catches `JSONDecodeError, OSError, ValueError`; `JSONDecodeError` subclasses `ValueError` |
| Test helper wrappers | 38 `trivial-wrapper` disables in tests, e.g. `_make_tc` aliases (`tests/checkers/test_stub_checker.py:82`, `test_redundant_type_guard_checker.py:16`), `_sorted` aliases (`test_baseline_diff.py:21`, `test_baseline_diff_parsers.py:32`), `_ctx` (`test_extra_tools.py:285`), `_s_*` (`test_setup_install.py:113-130`) |
| Hardcoded environment paths | `/home/slava/aiexp/python-setup` at `tests/conftest.py:86`, `tests/runner/test_setup_install.py:265-350`, `tests/runner/test_autofix_conflict_integration.py:181`, `tests/runner/test_setup.py:252,277`, `tests/runner/test_t9_7_compose_pyright_live.py:31` |
| Baseline test split | `tests/runner/test_baseline_diff.py` 249 + `test_baseline_diff_edge.py` 308 + `test_baseline_diff_parsers.py` 486 = 1043 lines / 21 test functions, with overlapping `_compare_sorted`/`_diff_baseline`/`_capture_baseline` coverage |
| Docs drift | `AGENTS.md:10-11` stale counts; `CHANGELOG.md:3` v1.2.9 vs `pyproject.toml:3` 1.2.10; `README.md:72` still shows v1.2.5; `config/ty.toml:8` names `sentence_transformers` |

### 5.6 Third-party assumptions to read before debloating

- `tests/assumptions/test_astroid_contracts.py:1-10` pins astroid 4.0.4 behavior used by checkers.
- `tests/assumptions/test_beartype_contracts.py:1-13` pins beartype 0.22.9’s TYPE_CHECKING forward-ref behavior: `@beartype` succeeds at import but raises on first call; this explains many `# pylint: disable=missing-beartype` comments on mixins/`register()`.
- `tests/assumptions/test_pylint_contracts.py` pins pylint 4.0.6 checker lifecycle (`open`/`close` order), `CheckerTestCase`/`UnittestLinter` message shape, and `MessageDefinitionTuple` arity (`:67-175`).
- `tests/assumptions/test_pylint_cache_semantics.py:11-48` is the writer-first verdict; the file says “these tests are the verdict” and must be re-derived before changing assertions.

---

## 6. Model Candidate Landscape (external; verify before adoption)

The intent names GLiDE-0.4B and the JEV Decision Index. The following are external facts from model cards/leaderboard, not codebase facts; they should seed a spike, not be treated as final choices.

| Candidate | Params | License | Runtime / CPU evidence | Notes |
|---|---:|---|---|---|
| `fastino/GLiDE-0.4B` | 0.40B | `fastino-community` | Custom `glide` package; torch/transformers; card reports RTX PRO 6000 GPU latency 6.9 ms, 0.81 GB bf16; no CPU claim | Intent’s named candidate; ADR-009 requires human license review and notes no candidate is proven compliant (`docs/adr/ADR-009.md:15-19`) |
| `fastino/GLiNER2.5-Decide` | 340M | Apache-2.0 | Card says “Runs on CPU or GPU, through `gliner2`”; `gliner2[local]` | English classification; 60.2% exact match on `fastino/fast-decisions`; 0.34B is smaller than GLiDE |
| `tasksource/tasksource-decider-nano` | 150M | Apache-2.0 | ModernBERT cross-encoder, self-contained `decider.py` (PyTorch + transformers); A30 median 23 ms | #1 among models under 300M on Decision Index 0.4 (19.85); 8,192-token context; no explicit CPU claim but 150M encoder |
| `SupersonicLabs/Julia-1` | 144.3M | Apache-2.0 | Card: CPU inference works with standard PyTorch; FP32 weights 550.5 MiB; 8,192-token CPU smoke test; ONNX/GGUF variants | Typed decisions (`choice`, `noul`, `score`); Python 3.11+ |
| `hotchpotch/bekko-system-one-v0-{17m,68m,400m}` | 17M/68M/400M | No license field in card/API | Card: CPU or CUDA through `BekkoSentenceTransformer`; 17M ONNX ~29 MB | Experimental; license risk until clarified |
| `tardellirs/crivo-68m` / `crivo-400m` | 68M/400M | CC-BY-NC-4.0 | Cross-encoder/ModernBERT decision models | Noncommercial license likely incompatible with an MIT tool; treat as unsuitable unless legal says otherwise |
| `cross-encoder/ettin-reranker-68m-v1` / `150m-v1` | 68M/150M | Apache-2.0 | ONNX/OpenVINO tags; sentence-transformers cross-encoders | Rerankers, not decision models; could be a lightweight stopgap but does not satisfy “decision model” framing |

Leaderboard: `https://multimodalart-jev-decision-index.static.hf.space/index.html` (Decision Index 0.4.1; 274 model entries). GLiDE-0.4B card: `https://huggingface.co/fastino/GLiDE-0.4B`. GLiNER2.5-Decide: `https://huggingface.co/fastino/GLiNER2.5-Decide`. tasksource-decider-nano: `https://huggingface.co/tasksource/tasksource-decider-nano`. Julia-1: `https://huggingface.co/SupersonicLabs/Julia-1`. Bekko: `https://huggingface.co/hotchpotch/bekko-system-one-v0-400m`. Crivo: `https://huggingface.co/tardellirs/crivo-68m`. Ettin reranker: `https://huggingface.co/cross-encoder/ettin-reranker-68m-v1`.

Caveats: leaderboard latencies are GPU measurements; CPU latency must be measured on the target laptop/CI class. The model cards’ benchmark labels are not the W9704 meaningful-vs-brush-off task. No double-rated W9704 corpus exists at HEAD (ADR-009 says the accepted stratum had 215 meaningful and 0 meaningless labels; `docs/adr/ADR-009.md:9-13`).

---

## 7. Open Questions and Uncertainties

1. **Backend semantics: what exactly replaces what?** ADR-010 specifies `DecisionBackend.decide(justification, rule, context) -> float` with a “heuristic-first hard gate” (`docs/adr/ADR-010.md:23-25`), while current code is semantic-first with heuristic fallback (`_base.py:150-158`). Does “hard gate” mean the heuristic must pass before the model runs, or that the heuristic is only a fallback when the model is unavailable? Does the model return a probability that the caller thresholds, or a boolean? How does `None` (model unavailable) map to `check_if_meaningful`’s `bool` return?

2. **Which model is compliant and CPU-feasible?** GLiDE-0.4B is the intent’s example but carries a Fastino Community License and GPU-only evidence (`https://huggingface.co/fastino/GLiDE-0.4B`). Apache-2.0 alternatives exist (GLiNER2.5-Decide 340M, tasksource-decider-nano 150M, Julia-1 144.3M), but none is trained on W9704 labels; zero-shot behavior on terse comments is unproven. A CPU benchmark on the target class and a license decision are both unresolved. Python 3.14 is supported by locked torch 2.12.1/transformers 5.12.1 (`uv.lock` entries; PyPI classifiers), but `gliner2` advertises classifiers only through 3.12 — verify before adopting it.

3. **Evaluation corpus is missing.** The only in-repo labeled examples are the heuristic test lists (`test_semantic_check.py:159-257`, `test_semantic_threshold.py:29-131`) and the planted sample project (`tests/data/minimal_sample_project/src/minimal_sample/mod.py:45-57`). ADR-009’s required double-rated brush-off sample (`docs/adr/ADR-009.md:23-27`) is not in the repo. Without it, the 95% meaningless-precision gate cannot be evaluated; a model may improve or regress W9704 silently because the golden forces `SEMANTIC=0` (`tests/integration.py:112`).

4. **Cache location and key schema.** ADR-010 wants `.python-setup-decisions.json` at the linted project root with per-entry file/model metadata and no bare hex ≥20 (`docs/adr/ADR-010.md:26-28`). The current key is path-free and 64-bit truncated (`_semantic.py:142-157`), and the tests assert a home-dir single file and path-free signature (`tests/assumptions/test_pylint_cache_semantics.py:276-305`). How does a checker know the project root? Options: `Path.cwd()` (pylint is launched with `cwd=config.cwd`; `runner/output.py:186-188`), walking up from `node.root().file`, or adding a `path`/`project_root` parameter to `check_if_meaningful`. The last conflicts with the current assumption test and the public helper signature.

5. **Refresh vs read-only lint, and the writer side channel.** ADR-010 says ordinary lint is read-only and cache updates happen only through an explicit CI-guarded refresh with lockfile + merge + atomic replace (`docs/adr/ADR-010.md:29-32`). But pylint runs as a subprocess, so model verdicts computed during lint are not visible to the runner. Is the refresh command a separate source walker? Does pylint run with a special env var that permits a temp sidecar? Does the refresh reuse checker parsing? This is unspecified and should be spiked before implementation.

6. **Prune/cleanup semantics.** “Prune entries for missing files and stale model identifiers” (`docs/adr/ADR-010.md:33`) requires file refs and a model identifier per entry. How are moved files handled? Does a model ID change invalidate all entries? Is pruning automatic on refresh or a separate `--prune` flag? Does `--path` scope the refresh? The current cache has no path or prune support (`tests/assumptions/test_pylint_cache_semantics.py:27-31`).

7. **Secrets scan and tracked-cache safety.** `detect-secrets` scans all tracked files (`config`/runner strategy; `.secrets.baseline:42-44` only excludes `^\\.factory/`). ADR-010’s “no bare hex strings of length ≥20” suggests hashes must be encoded or avoided; storing raw justification text would be worse. What exact fields are safe to commit? Does the cache need a `.secrets.baseline` allowlist entry, or a non-hex key encoding?

8. **Memory/time limits for a model in pylint subprocesses.** Pylint runs with default `memory_limit_mb=2048` (`runner/types.py:22`; pylint specs at `dispatch.py:112-132`), and `_run_cmd` applies `RLIMIT_AS` (`runner/output.py:171-200`). A torch/transformers model plus Python 3.14 may exceed 2 GB virtual address space; `ty` already needed `memory_limit_mb=0` for this reason (`dispatch.py:93`). Does every pylint spec need a memory/time override, or should the backend use a lighter ONNX runtime? How many model loads occur across the three pylint invocations (`pylint`, `pylint-pyi`, `pylint tests`)?

9. **Dependency packaging.** The `[semantic]` extra is only `sentence-transformers>=3.0.0` (`pyproject.toml:28-31`); dev group has no ML deps (`pyproject.toml:58-85`), so the semantic path is untested in CI and four tests skip. Does the new backend replace the extra’s contents, add a new extra (e.g. `[decision]`), or become a core dependency? Core would change every consumer install and the default lint path; optional preserves the current “heuristic by default” behavior but leaves the model unexercised. `uv.lock` must be regenerated either way.

10. **Debloat scope and ordering.** Objective targets are listed in §5.5, but the intent also says “test infra/assumptions first.” Which comes first: splitting `tests/checkers/_factories.py`/`tests/runner/_factories_extras.py`, consolidating `test_semantic_threshold.py` into `test_semantic_check.py`, removing the three baseline-diff modules’ overlap, removing stale shims (`peek_fallback_tools`, `_compare_sorted`, `_legacy_*` exemptions), or fixing `pylint-pyi`? Each touches different gates; ADR-011’s single-writer map is not present at HEAD (`docs/adr/ADR-011.md:40-70` plans a `_source_stream.py` and ownership table, neither implemented).

11. **`pylint-pyi` blind spot.** Do we fix the strategy to lint companion stubs (e.g., copy stubs to a temp tree or use a pylint mode that does not resolve companions), and then clean up the 205 private stub symbols / duplicate-code findings? Or do we explicitly scope the rule to orphan stubs and document that companion `.pyi` files are governed only by `mypy.stubtest`? Fixing it changes the golden (currently 42/43 `pylint-pyi` findings are on `.py` files) and will likely require a large baseline/golden regeneration, which conflicts with “preserve every material lint/check behavior” unless staged deliberately.

12. **Coding-rule enforcement that is currently subjective.** `CodingRules.md` requires simplification, wrapper justification, no fallbacks for hard dependencies, test naming `test_<method>_given_<condition>_then_<expected>`, test isolation/fixture scope, and `no_external_api`/`with_real_api` categories (`CodingRules.md:90-107`, `:256-306`). Probes show 62.2% naming compliance, 31/60 marker coverage, 38 test `trivial-wrapper` disables, and several hardcoded `/home/slava/aiexp/python-setup` paths. Which of these become lint-enforced rules vs one-time cleanup? A new checker for test naming/markers would itself need tests and could create a large baseline.

13. **Docs/version reconciliation.** `AGENTS.md:79-85` still describes the cross-encoder and `PYTHON_SETUP_LINT_RERANKER_MODEL`; `docs/semantic-justification.md:3-62` describes reranker-first/fallback, `~/.cache`, and `results.json`; `docs/custom-checks.md:97-104` documents the reranker helper; `docs/troubleshooting.md:97-111` documents download fallback and cache deletion; `README.md:29` and `docs/tutorials.md:12-16` tell users to install `python-setup[semantic]`; `config/ty.toml:8` names `sentence_transformers`; `CHANGELOG.md:3` vs `pyproject.toml:3` version drift. All must move together, or the docs will contradict the new backend/cache.

14. **Behavior-preservation verification gap.** The default `uv run pytest -q` does not run `tests/integration.py` (`tests/integration.py` is not named `test_*.py`; `pyproject.toml:48-55`), and the golden explicitly disables semantic scoring (`tests/integration.py:112`). A model/cache change can pass the default suite while changing W9704 behavior on the sample project. The architect should require `uv run pytest tests/integration.py -q` plus a new model-specific contract test (mocked backend for determinism, one `slow` real-model smoke) before claiming behavior preservation.

---

## 8. Recommendations for the Architect

1. **Pin the behavior contract before touching the model.** Record baseline probe results (`uv run pytest -q`; `uv run pytest tests/integration.py -q`; `uv run lint`) and keep `PYTHON_SETUP_LINT_SEMANTIC=0` as the deterministic W9704 contract. Add a mocked-backend contract test for the new decision path; keep real-model tests behind `slow` + `importorskip`.

2. **Resolve ADR-009’s no-go gates explicitly.** Either (a) produce the double-rated brush-off sample and license decision, then implement a compliant CPU model, or (b) keep the heuristic as production default and land only the model-independent `DecisionBackend` + cache infrastructure. Do not claim the swap is complete without a CPU benchmark and a license verdict.

3. **Spike the model bake-off with license-clean candidates first.** For a W9704 binary decision, evaluate `tasksource/tasksource-decider-nano` (150M, Apache-2.0), `SupersonicLabs/Julia-1` (144.3M, Apache-2.0, explicit CPU), and `fastino/GLiNER2.5-Decide` (340M, Apache-2.0, CPU via gliner2) against GLiDE-0.4B. Measure CPU latency, peak RSS under the 2048 MB `RLIMIT_AS`, model load time, and threshold sweep on the double-rated sample; verify Python 3.14 support for the chosen runtime.

4. **Implement ADR-010 cache as an explicit-refresh artifact, not a lint side effect.** Decide project-root resolution (`cwd` vs node path vs explicit parameter), per-entry `files`/`model` schema, non-hex key encoding, prune policy, and atomic replace in the target directory. Consume `tests/assumptions/test_pylint_cache_semantics.py`’s writer/concurrency verdict; rewrite that file deliberately rather than loosening it. Add a CI-guarded `refresh-decisions` command (or `lint --refresh-decisions`) and keep ordinary lint read-only.

5. **Debloat test infrastructure first.** Split `tests/checkers/_factories.py` by checker domain, trim `_factories_extras.py` below 500 lines, consolidate `test_semantic_threshold.py` into `test_semantic_check.py`, and merge the three baseline-diff modules’ overlapping cases. Remove stale `too-many-lines` disables and stale `_legacy_*`/`peek_fallback_tools`/`_compare_sorted` shims only after the golden/baseline gates confirm no behavior change.

6. **Treat `pylint-pyi` as a decision, not an assumption.** Reproduce the companion-stub skip, decide whether to fix it, and if so, budget for the 205 private stub symbols and duplicate-code findings. Regenerate the golden and baseline in the same change; otherwise document the orphan-only scope so “coding rules enforced” is not overstated.

7. **Fix rule-enforcement and portability drift in measured increments.** Add/enable checks or one-time cleanups for test naming/markers, hardcoded `/home/slava/aiexp/python-setup` paths, stale docs counts/versions, and `config/ty.toml` optional-import comments. Keep each change behind the existing lint + integration gates.

## Task Status
iteration: 4
amendments: 0
items:
  (none scheduled yet)
waves: (none)
merged: (none)
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
  - awareness-plan-4-infra-only-closeup ref=plan-4 disposition=human-awareness: Intent replaces cross-encoder (_semantic.py:1 reranker, sentence-transformers) with CPU decision model + git cache; ADR-016 ships backend/cache/Fake/docs/corpus only, no wiring, close-up must not claim swap, I5 gated on corpus + human Fastino + CPU bench. High-impact cut architect can decide per ADR-009 no-go (215/0, single-author, no bench). Inform operator swap open.
  - awareness-plan-4-material-never-test-boundaries ref=plan-4 disposition=human-awareness: Material = golden SEMANTIC=0 + unit + CLI/exit + baseline/autofix + configs (heuristic material, model never); never-test-linting bans pytest asserting own gates while retaining golden/integration. Both confirm-with-human, I1-approved. Architect decides preserve; golden stays mechanical contract. Informational only.

## Output

Yield a structured JSON object matching this schema:
- iteration (integer, required, min: 1): Iteration number for this plan (minimum 1)
- milestones (array of object, required): Key delivery milestones for this iteration
  - id (string, required)
  - title (string, required)
  - scenarios (array of string, optional)
  - directionalInterfaces (array of string, optional)
  - replanAfter (boolean, optional)
- uncertainties (array of object, optional): Identified technical or domain uncertainties to resolve via spikes
  - id (string, required)
  - description (string, required)
  - spikeOutlines (array of string, optional)
- itemOutlines (array of object, required): Planned items/tasks to implement in this iteration
  - slug (string, required)
  - kind (string, required)
  - title (string, required)
  - description (string, optional)
  - milestoneId (string, optional)
  - deps (array of string, optional)
  - escalate (boolean, optional)
  - replanAfter (boolean, optional)
  - prodBudgetHint (integer, optional, min: 0): Advisory sizing hint: architect's estimated production lines changed for this item, for review against storyMaxProdLines/simpleMaxProdLines. Never blocks or fails the plan.
- assumptions (array of object, optional): Key assumptions made during planning
  - assumption (string, required)
  - why (string, required)
  - disposition (string, optional)
- epics (array of object, optional): Child epics to spawn (root tasks only)
  - slug (string, required)
  - intent (string, required)
- techDebt (array of object, optional): Technical debt identified, categorized as adjacent, impacting, or blocking
  - id (string, required)
  - description (string, required)
  - category (string, required, enum: ["adjacent","impacting","blocking"])
  - resolution (string, optional)
- adrs (array of object, optional): Architecture Decision Records documented for major design choices
  - id (string, required)
  - title (string, required)
  - context (string, required)
  - decision (string, required)
  - consequences (string, optional)
