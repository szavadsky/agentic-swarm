# Step: Architect Consult (Item)

## Goal
Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.

## Rules
- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — `modernize`

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

7. **Fix rule-enforcement and portability drift in measured increments.** Add/enable checks or one-time cleanups for test naming/markers, hardcoded `/home/slava/aiexp/python-setup` paths, stale docs counts/versions, and `config/ty.toml` optional-import comments. Keep each change behind the existing lint + integration gates.`). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.

## Item
decision-backend-impl

## Assignment
{"slug":"decision-backend-impl","kind":"dev","title":"Implement veto DecisionBackend with FakeBackend","assignment":"Sole writer: NEW checkers/_decision_backend.py/.pyi + _base.py/.pyi (veto + injection + normalize_suppressed_codes + on-any-element + stale-doc fix) + _semantic.py/.pyi (rewrite, no sentence-transformers) + no_try_import _OPTIONAL_IMPORT_PATTERNS + register line + pyproject [semantic] block + uv.lock (packaging exception); FORBIDDEN decisions/_decision_cache (cache-impl), _source_stream, ty.toml (docs item), tach.toml (cache-impl), tests/data, .gitignore (legacy .cache lines retained intentionally), hatch (no entry), baseline. If spike verdict is blocked: merge a no-op attestation citing the blocker (zero prod writes) instead of implementing. Else implement ADR-014 pinned values (threshold 0.5, prompt-v1, backend=None kwarg on both fns, None mapping, joiner/sort/match, Fake 1.0 + 'fake-backend rev test prompt-v1', structlog once-per-process warnings, empty [semantic] extra + uv.lock no edge, PYTHON_SETUP_LINT_RERANKER_MODEL deprecated, PYTHON_SETUP_LINT_DECISION_MODEL parses but loader None + exactly-one warning) + ADR-010 (PYTEST_CURRENT_TEST-guarded dotted path with loader test pinning both; tach-clean, @beartype, structlog, each <=500). Verify: brush-off never reaches backend; one call per unique pair; SEMANTIC=0 equals golden; extra empty; uv.lock grep zero sentence-transformers for extra; loader None + exactly-one warning proven; no new failures vs M1 table; golden hash-equal or shift-reported.","outlineRef":"decision-backend-impl","milestone":"M4","wave":2,"deps":["decision-cache-design-spike","semantic-threshold-consolidation"],"scenarioRefs":["M4: Veto backend without model"],"citations":["src/python_setup_lint/checkers/_semantic.py:1-12","src/python_setup_lint/checkers/_semantic.py:93-122","src/python_setup_lint/checkers/_semantic.py:125-189","src/python_setup_lint/checkers/_base.py:142-158","pyproject.toml:28-31","AGENTS.md:79-85"],"escalate":true}

## Prior Attempts & Failures
2 attempts recorded for develop (all rejected); next would be 3 > max 2

Failing checks:
[gates] Gate regressions: test-integration

## Current Diff
.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/checks.yaml +77/-0
.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/input.md +72/-0
.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/meta.yaml +19/-0
.factory/tasks/modernize/items/decision-backend-impl/steps/001-test-first-r1-a1/output.yaml +89/-0
.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/checks.yaml +87/-0
.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/input.md +79/-0
.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/meta.yaml +19/-0
.factory/tasks/modernize/items/decision-backend-impl/steps/002-test-first-r1-a2/output.yaml +103/-0
.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/checks.yaml +363/-0
.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/input.md +114/-0
.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/meta.yaml +19/-0
.factory/tasks/modernize/items/decision-backend-impl/steps/003-develop-r1-a1/output.yaml +124/-0
.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/checks.yaml +363/-0
.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/input.md +140/-0
.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/meta.yaml +19/-0
.factory/tasks/modernize/items/decision-backend-impl/steps/004-develop-r1-a2/output.yaml +113/-0
pyproject.toml +2/-3
src/python_setup_lint/checkers/_base.py +27/-13
src/python_setup_lint/checkers/_base.pyi +9/-6
src/python_setup_lint/checkers/_decision_backend.py +59/-0
src/python_setup_lint/checkers/_decision_backend.pyi +16/-0
src/python_setup_lint/checkers/_semantic.py +14/-138
src/python_setup_lint/checkers/_semantic.pyi +6/-8
src/python_setup_lint/checkers/conformance/no_try_import_checker.py +2/-1
tests/assumptions/test_pylint_cache_semantics.py +128/-258
tests/checkers/test_decision_backend.py +320/-0
tests/checkers/test_no_try_import_checker.py +17/-0
tests/checkers/test_semantic_check.py +102/-370
tests/checkers/test_suppression_justification_checker.py +23/-31
uv.lock +0/-709

## Review Feedback
Failing check: gates

Message: Gate regressions: test-integration

Detail:
olden_path}\")\n            warnings.warn(f\"updating golden files for {golden_path}\", stacklevel=2)\n            write_golden_files(golden_path, findings)\n            return\n        committed = read_golden(golden_path)\n        added, removed = _diff_keys(findings, committed)\n        if added or removed:\n>           pytest.fail(_format_drift(added, removed, golden_path))\nE           Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json\nE           added (3):\nE             ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\nE             ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\nE             ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n\ntests/_golden.py:389: Failed\n========================= Tach Impact Analysis Warning =========================\n[Tach] WARNING: 1 test(s) failed that would be skipped by impact analysis!\n[Tach] These failures would be missed when using --tach:\n[Tach]   - tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint\n=========================== short test summary info ============================\nFAILED tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint - Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json\nadded (3):\n  ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n  ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n  ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')\n1 failed, 8 passed in 48.82s\n[New failing tests: tests.integration.TestMinimalSampleProject.test_setup_new_and_lint]",
    "failingTests": [
      "tests.integration.TestMinimalSampleProject.test_setup_new_and_lint"
    ]
  }
]

Output tail:
get("GITHUB_ACTIONS"):
                pytest.fail(f"refusing to rewrite golden under CI; unset {UPDATE_ENV} or run locally to regenerate {golden_path}")
            warnings.warn(f"updating golden files for {golden_path}", stacklevel=2)
            write_golden_files(golden_path, findings)
            return
        committed = read_golden(golden_path)
        added, removed = _diff_keys(findings, committed)
        if added or removed:
>           pytest.fail(_format_drift(added, removed, golden_path))
E           Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
E           added (3):
E             ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
E             ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
E             ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')

tests/_golden.py:389: Failed
========================= Tach Impact Analysis Warning =========================
[Tach] WARNING: 1 test(s) failed that would be skipped by impact analysis!
[Tach] These failures would be missed when using --tach:
[Tach]   - tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint
=========================== short test summary info ============================
FAILED tests/integration.py::TestMinimalSampleProject::test_setup_new_and_lint - Failed: golden mismatch for /home/slava/aiexp/python-setup.factory-wt/topic_modernize--decision-backend-impl/tests/data/golden/minimal_sample_project_findings.json
added (3):
  ('pylint', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
  ('pylint tests', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
  ('pylint-pyi', 'src/minimal_sample/mod.py', 42, 0, 'unjustified-suppression')
1 failed, 8 passed in 48.82s
[New failing tests: tests.integration.TestMinimalSampleProject.test_setup_new_and_lint]

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
