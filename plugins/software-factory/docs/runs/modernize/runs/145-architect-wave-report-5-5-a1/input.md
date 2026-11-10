# Step: Architect Wave Report

## Goal
Evaluate the results of a completed execution wave, assess spike findings and accumulated debt, and decide the iteration path.

## Rules
- Exploration budget: evaluate wave progress from the current plan, wave report, spike findings, and the prepared context pack (`# Context Pack — `modernize` (iteration 5 starting state)

**Repository**: `python-setup` v1.2.10 (`pyproject.toml:1-4`), Python `>=3.14`, MIT (`pyproject.toml:19-20`). Worktree `topic/modernize`, HEAD `0944670`.

**Gates verified in this worktree on 2026-11-09** (read-only execution):

| Gate | Result | Evidence |
|---|---|---|
| `uv run pytest -q` | 1357 passed, 7 deselected, 4 warnings, 26.6 s | default collection does **not** include `tests/integration.py` (filename is not `test_*.py`) |
| `uv run pytest tests/integration.py -v` | 9 passed, 56.6 s | run explicitly per AGENTS/README |
| `uv run lint` | exit 0, all 14 tools PASSED, 57.7 s | `lint.baseline` is `[]` (`lint.baseline:1`) |

**Intent status at a glance**

| Intent clause | State at HEAD | Primary evidence |
|---|---|---|
| Enforce `CodingRules.md` / `AGENTS.md` | Mostly done; lint gates green, but docs/ADR drift and some dead placeholders remain | `lint.baseline:1`; `AGENTS.md:9-11`, `AGENTS.md:79-85`; `docs/adr/ADR-016.md:1-5` |
| Debloat code and tests; keep test intent | Partially done (recent prune removed self-lint/config-consistency tests); concrete duplication and dead helpers remain | §4.4 below; `tests/checkers/test_tmp_path_checker.py:19-32`; `tests/runner/_factories.py:167,200`; `tests/runner/test_real_pipeline_smoke.py:1-42` |
| Replace embedding/rerank justification check with a CPU-friendly small decision model | **Half done**: reranker is gone and the veto backend protocol exists, but no production model is wired and no optional dependency ships | `src/python_setup_lint/checkers/_semantic.py:1-65`; `src/python_setup_lint/checkers/_decision_backend.py:37-59`; `pyproject.toml:28-30`; `tests/checkers/test_semantic_check.py:119-123` |
| Keep a git-stored cache with cleanup | **Not implemented**: only a process-local memo exists; no `.python-setup-decisions.json`, refresh path, or pruning | `src/python_setup_lint/checkers/_semantic.py:15-25,47-64`; `tests/assumptions/test_pylint_cache_semantics.py:8-12`; `docs/adr/ADR-010.md:26-36` |
| Preserve every material lint/check behavior | Green at HEAD; golden pins 158 findings including 18 W9704, but semantic is disabled during golden capture | `tests/data/golden/minimal_sample_project_findings.json`; `tests/integration.py:110-129`; `tests/_golden.py:54` |

---

## 1. Module Map

### 1.1 Semantic justification subsystem (primary intent area)

| Path | Responsibility | Key lines |
|---|---|---|
| `src/python_setup_lint/checkers/_decision_backend.py` | `DecisionBackend` protocol, `FakeBackend`, test-only dotted-path loader, `get_backend()`, pinned threshold/prompt constants, warn-once state | `:10-13`, `:16-30`, `:37-59` |
| `src/python_setup_lint/checkers/_decision_backend.pyi` | Public stub: `DECISION_THRESHOLD`, `PROMPT_VERSION`, protocol, `FakeBackend`, `get_backend` | `:1-20` |
| `src/python_setup_lint/checkers/_semantic.py` | Thin adapter: resolves backend, computes SHA-256 cache key, applies `>= DECISION_THRESHOLD`, owns in-memory memo | `:1-65` |
| `src/python_setup_lint/checkers/_semantic.pyi` | Stub documenting the adapter contract | `:1-23` |
| `src/python_setup_lint/checkers/_base.py` | `normalize_suppressed_codes`, heuristic-first `check_if_meaningful`, env gate, lazy `_semantic` import | `:145-156`, `:159-252` |
| `src/python_setup_lint/checkers/conformance/suppression_justification_checker.py` | W9704 `unjustified-suppression`: scans suppression comments and `Any` annotations, calls `check_if_meaningful` | `:33-41`, `:63-91`, `:136-162`, `:330-388` |
| `src/python_setup_lint/checkers/conformance/bare_except_comment_checker.py` | W9738 `bare-except-comment`, second consumer of `check_if_meaningful` | `:14`, `:103-118` |
| `docs/semantic-justification.md` | Current *stale* narrative of the reranker pipeline and caches | `:1-62` |
| `docs/custom-checks.md` | Checker-authoring guide; semantic helper description stale | `:97`, `:104` |

### 1.2 Checker subsystem

| Path | Responsibility | Key lines |
|---|---|---|
| `src/python_setup_lint/checkers/conformance/` | Conformance checkers: beartype, no-try-import, tmp-path, structlog, suppression justification, bare-except, missing error-chain, silent-except, generic-key-dict, unnamed-tuple-dict, trivial-wrapper, redundant-type-guard, pyi-underscore, missing-return-annotation, asyncio-timeout | directory listing |
| `src/python_setup_lint/checkers/stub/` | Stub fidelity/coverage/docstring checkers and annotation normalizer | `checker.py`, `coverage.py`, `docstring_checker.py`, `normalizer.py`, `fidelity/*` |
| `config/.pylintrc` | Source-code rcfile; enables custom rules and `max-module-lines=500`, `max-statements=65`, `max-branches=16` | `:2`, `:17`, `:19`, `:22-23` |
| `config/.pylintrc-pyi` | Stub-file rcfile | `:12-13` |
| `config/.pylintrc-tests` | Test-file ruleset (production-only rules disabled; W9704/W9702 still enabled) | `:20`, `:37`, `:39`, `:42-47` |

### 1.3 Runner subsystem

| Path | Responsibility | Key lines |
|---|---|---|
| `src/python_setup_lint/runner/_tool_specs.py` | Single-source 14 built-in `ToolSpec` entries | `:9-100`, `:102` |
| `src/python_setup_lint/runner/dispatch.py` | Tool strategy registry, command builders, autofix ordering, baseline fallback | `:62-359`, `:350-359` |
| `src/python_setup_lint/runner/cli.py` | CLI, tool selection, skip reasons, serial pipeline, `run_lint` | `:110-201`, `:204-...`, argument parser `:280-366` |
| `src/python_setup_lint/runner/baseline.py` | Baseline diff/merge and fallback inspection | module |
| `src/python_setup_lint/runner/parsers.py`, `_record_parsers.py` | Output parsers (JSON, regex, record parsers) | modules |
| `src/python_setup_lint/runner/_autofix.py` | Autofix conflict detection and staged/unstaged handling | module |
| `src/python_setup_lint/runner/_config.py`, `cmd_build.py` | Config discovery and command composition | modules |
| `src/python_setup_lint/runner/types.py` | `ToolSpec`, `LintResult`, `RunnerConfig`, `ViolationCount` | `:12-22`, `:25-59` |

### 1.4 Setup / packaging / test helpers

| Path | Responsibility | Key lines |
|---|---|---|
| `src/python_setup_lint/setup.py` | `install()` / `main()`: dependency step, pylint plugin registration, config symlinks, state/checksums | `:41-56`, `:149-205`, `:223-290`, `:318-364` |
| `src/python_setup_lint/_setup_pyproject.py` | TOML read/write, pylint load-plugins, dev-dependency detection (extras stripped) | `:19-97` |
| `src/python_setup_lint/_setup_precommit.py` | Pre-commit config and AGENTS snippet generation/atomic writes | `:70-...` |
| `src/python_setup_lint/_setup_update.py` | Drift detection + `uv add --refresh-package` update flow | `:11-...` |
| `src/python_setup_lint/testing.py` | Shared `_make_tc` / `_walk_and_release`, lint-runner fakes, consumer health checks | `:18-38`, `:44-103`, `:115-196` |
| `pyproject.toml` | Package metadata, empty `[semantic]` extra, pytest markers (`not slow` default) | `:1-4`, `:28-30`, `:47-54` |
| `uv.lock` | Locked dependencies; root provides `semantic` extra, currently empty | `:573-623` |
| `.gitignore` | Generated consumer artifacts; legacy semantic model cache ignored | `:222-244` |

### 1.5 Documentation / decision register

| Path | Responsibility | Key lines / state |
|---|---|---|
| `CodingRules.md` | Shipped coding rules: typing, `.pyi`, simplification, complexity, tests | `:1-75`, `:90-159`, `:230-307` |
| `AGENTS.md` | Agent entry point: commands, tool scope, pipeline, test strategy | `:5-14`, `:16-32`, `:79-93` |
| `docs/adr/README.md` | ADR index — **omits ADR-013…ADR-016** | `:16-31` |
| `docs/adr/ADR-009.md` | Accepted no-go-gated deferral for the model | `:1-48` |
| `docs/adr/ADR-010.md` | Frozen backend + tracked-cache contracts | `:1-52` |
| `docs/adr/ADR-014.md` | Heuristic-first veto semantics (now implemented; text stale) | `:1-5` |
| `docs/adr/ADR-015.md` | Pylint-pyi scope fix deferred to iteration 5 | `:1-3` |
| `docs/adr/ADR-016.md` | Iteration-4 infrastructure-only scope — **claims no backend/cache/FakeBackend exists, contradicted by HEAD** | `:1-5` |
| `design/0001`, `design/0002` | Config composers; ty src-only exception | files |
| `README.md`, `docs/tutorials.md`, `docs/troubleshooting.md` | Consumer docs; semantic sections stale | `README.md:29,105`; `tutorials.md:12-16`; `troubleshooting.md:97-111,150` |

### 1.6 Test subsystems

| Path | Responsibility | Key lines |
|---|---|---|
| `tests/checkers/` | Per-checker behavioral tests over real pylint `CheckerTestCase`; `_factories_*` data modules | 45 `.py` files incl. helpers |
| `tests/runner/` | Runner unit/integration tests, autofix, parsers, setup, benchmarks | 30 `.py` files |
| `tests/assumptions/` | Third-party contract pins (astroid, beartype, pylint, pylint cache semantics) | `test_pylint_cache_semantics.py:1-39` |
| `tests/_golden.py` | Golden snapshot normalization/serialization/assertions + CI-guarded rewrite | `:1-11`, `:53-58`, `:374-392` |
| `tests/test_golden.py` | Synthetic unit tests for golden helpers | `:1-6` |
| `tests/integration.py` | Fit-for-purpose end-to-end gate on planted sample project | `:1-145` |
| `tests/data/minimal_sample_project/` | Planted-violation fixture project (W9704 brush-off vs carry-from) | `src/minimal_sample/mod.py:41-56`, `violations.txt` |
| `tests/data/golden/minimal_sample_project_findings.json` | 158 normalized findings; 18 `unjustified-suppression`, 2 `bare-except-comment` | golden file |

---

## 2. Key Interfaces & Signatures

### 2.1 Decision backend (`src/python_setup_lint/checkers/_decision_backend.py`)

```python
DECISION_THRESHOLD: float = 0.5          # :10
PROMPT_VERSION: str = "prompt-v1"        # :11

@runtime_checkable
class DecisionBackend(Protocol):          # :16-20
    model_id: str
    def decide(self, justification: str, rule: str | None, context: str | None) -> float: ...

class FakeBackend:                        # :23-30
    model_id: str = "fake-backend rev test prompt-v1"
    def __init__(self, score: float = 1.0) -> None: ...
    def decide(self, justification: str, rule: str | None, context: str | None) -> float: ...

def get_backend() -> DecisionBackend | None: ...   # :49-59
```

Behavior of `get_backend()` at HEAD:

- `PYTHON_SETUP_LINT_DECISION_BACKEND` is honored **only** when `PYTEST_CURRENT_TEST` is set, then imports an arbitrary `module:attribute` factory (`_decision_backend.py:37-46`).
- `PYTHON_SETUP_LINT_RERANKER_MODEL` emits a one-time deprecation warning (`:51-53`).
- `PYTHON_SETUP_LINT_DECISION_MODEL` is read but only emits a one-time `decision_model_unavailable` warning; it never constructs a backend (`:55-58`).
- Production default is therefore always `None` → heuristic-only behavior.

### 2.2 Semantic adapter (`src/python_setup_lint/checkers/_semantic.py`)

```python
_RESULT_CACHE: dict[int, bool] | None = None     # :16

def _reset_cache() -> None: ...                  # :19-25 (test helper, not in .pyi)

@beartype
def semantic_check_if_meaningful(                # :28-65
    text: str,
    *,
    rule: str | None = None,
    code_context: str | None = None,
    comment: str | None = None,
    backend: DecisionBackend | None = None,
) -> bool | None: ...
```

Contract: `primary = (comment or text).strip()`; empty → `False`; no backend → `None`; otherwise `decide(primary, rule, code_context) >= 0.5`; result memoized in `_RESULT_CACHE` keyed by the first 8 bytes of SHA-256 over `(primary, rule, code_context, model_id)` (`:37-64`).

### 2.3 Heuristic-first gate (`src/python_setup_lint/checkers/_base.py`)

```python
def normalize_suppressed_codes(raw: str) -> str: ...   # :148-156

def check_if_meaningful(                               # :159-252
    text: str,
    *,
    rule: str | None = None,
    code_context: str | None = None,
    comment: str | None = None,
    backend: DecisionBackend | None = None,
) -> bool: ...
```

Order is strict:

1. Normalize directive text and strip echoed codes (`:168`, `:145-156`).
2. Reject `<5` chars, boilerplate tokens, multi-word brush-offs, and rule-symbol-only reasons (`:169-246`).
3. If `PYTHON_SETUP_LINT_SEMANTIC != "1"` → return `True` (`:248-249`).
4. Lazily import `_semantic` and return `semantic_check_if_meaningful(...) is not False` (`:250-252`).

Consequence: the backend can **only veto** a heuristic-meaningful justification; it can never resurrect a heuristic rejection. `None` (no backend) maps to `True`.

### 2.4 W9704 consumer (`suppression_justification_checker.py`)

```python
msgs = _msgs(W9704=MessageDef(
    message="Suppression comment without technical justification: %s",
    symbol="unjustified-suppression", ...))              # :33-41

# module-level scan of raw source lines
self._legacy_scan(node, lines)                            # :63-91

# Any annotation path
self._emit_if_unjustified(annotation, lineno)             # :136-162

# trailing/preceding reason validation
self._has_justification(lines, idx)                       # :330-388
```

Both paths call `check_if_meaningful(reason, comment=reason, rule="unjustified-suppression", code_context=<code before #>)` (`:152-155`, `:372-375`, `:383-386`). The checker knows the file path via `node.root().file` (`_base.py:68-75`) but does not pass it to the semantic API.

### 2.5 Runner / test helpers

- `ToolSpec` and `RunnerConfig` (`runner/types.py:12-22`, `:49-59`); `TOOLS` list (`runner/_tool_specs.py:9-100`); `run_lint(...)` (`runner/cli.py:204-...`).
- `_make_tc(checker_class)` and `_walk_and_release(code, checker_class, *, file_path, module_name)` (`testing.py:18-38`) are the intended shared checker-test harness.
- Golden contract: `Finding = {tool,file,line,col,rule}`, multiset diff, `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1` opt-in, refused under `CI`/`GITHUB_ACTIONS` (`tests/_golden.py:1-11`, `:53-58`, `:374-392`).

---

## 3. Relevant Excerpts

### 3.1 Full current semantic adapter

`src/python_setup_lint/checkers/_semantic.py:15-65`:

```python
_RESULT_CACHE: dict[int, bool] | None = None

def _reset_cache() -> None:
    global _RESULT_CACHE
    _RESULT_CACHE = None

@beartype
def semantic_check_if_meaningful(...) -> bool | None:
    primary = (comment or text).strip()
    global _RESULT_CACHE
    if _RESULT_CACHE is None:
        _RESULT_CACHE = {}
    if not primary:
        return False
    resolved = backend if backend is not None else _decision_backend.get_backend()
    if resolved is None:
        return None
    cache_key = hashlib.sha256("|".join(str(x) for x in (
        primary, rule, code_context, resolved.model_id)).encode()).digest()
    cache_key_int = int.from_bytes(cache_key[:8], "big")
    if cache_key_int in _RESULT_CACHE:
        return _RESULT_CACHE[cache_key_int]
    result = resolved.decide(primary, rule, code_context) >= _decision_backend.DECISION_THRESHOLD
    _RESULT_CACHE[cache_key_int] = result
    return result
```

Observations for the architect:

- The memo is process-local only; nothing is persisted.
- The key truncates SHA-256 to 64 bits (`:59`) — the same truncation ADR-003 criticized in the retired on-disk cache (`docs/adr/ADR-003.md:7`).
- `comment` is folded into `primary`, so the key does not separately include it; docs claim `(text, rule, code_context, comment, model)` (`docs/custom-checks.md:97`).
- `code_context` participates in the key, so any source-line edit invalidates an entry even if the justification is unchanged.
- `model_id` participates, so a model/prompt swap invalidates entries — but `PROMPT_VERSION` is not currently folded into `model_id` by production code.

### 3.2 Heuristic gate and env behavior

`src/python_setup_lint/checkers/_base.py:248-252`:

```python
if os.environ.get("PYTHON_SETUP_LINT_SEMANTIC", "1") != "1":
    return True
from python_setup_lint.checkers._semantic import semantic_check_if_meaningful as _semantic_check

return _semantic_check(primary, rule=rule, code_context=code_context, comment=primary, backend=backend) is not False
```

- Semantic is **on by default**; absence of a backend yields heuristic behavior because `_semantic` returns `None`.
- The lazy import means `_semantic` is never imported when `PYTHON_SETUP_LINT_SEMANTIC=0` (`docs/semantic-justification.md:18`, verified by tests).
- The same gate governs W9738 `bare-except-comment` (`bare_except_comment_checker.py:103-118`).

### 3.3 W9704 justification resolution

`suppression_justification_checker.py:350-388`:

```python
_suppression_patterns = (_PAT_PYLINT_DISABLE, _PAT_NOQA, _PAT_TYPE_IGNORE, _PAT_TY_IGNORE)
for pat in _suppression_patterns:
    for m in pat.finditer(line):
        after = line[m.end():]
        ...  # only search before the next suppression pattern
        tm = _PAT_TRAILING_REASON.search(search_after)
        if tm:
            reason = tm.group(1)
            if check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
                                   code_context=line.split("#", 1)[0].strip()):
                return True

if idx > 0:
    pm = _PAT_PRECEDING_COMMENT.match(prev)
    if pm:
        reason = pm.group(1)
        if check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
                               code_context=lines[idx].split("#", 1)[0].strip()):
            return True
return False
```

A tracked cache keyed by file path would need this caller to supply file identity; today it does not.

### 3.4 Packaging and pytest configuration

`pyproject.toml:28-30`:

```toml
[project.optional-dependencies]
# Empty placeholder: no model dependency ships in iteration 4 (ADR-016).
semantic = []
```

`pyproject.toml:47-54`:

```toml
[tool.pytest.ini_options]
addopts = "-m 'not slow'"
markers = [
  "slow: ...full pipeline runs...",
  "no_external_api: ...",
  "with_real_api: ...",
  "implementation_detail: ...",
]
```

`uv.lock:623` likewise reports `provides-extras = ["semantic"]` with no dependencies.

### 3.5 Cache-related ignore and secrets constraints

- `.gitignore:243-244` still names the retired machine cache: `# NLP semantic model cache (sentence-transformers)` / `.cache/python-setup/semantic/`.
- `.secrets.baseline` enables `HexHighEntropyString` with `limit: 3.0`, so a committed result cache must not contain raw long hex digests; ADR-010 already requires “no bare hex strings of length >= 20” (`docs/adr/ADR-010.md:26-28`).
- ADR-011 says the tracked decisions file is consumer-runtime data, is committed, and gets **no** hatch/wheel entry (`docs/adr/ADR-011.md:54-60`).

### 3.6 ADR state (decisions vs implementation)

- `docs/adr/ADR-009.md:5` — accepted deferral; `:9-13` documents the 215-meaningful / 0-meaningless corpus no-go; `:23-27` requires a double-rated sample and a human Fastino license decision; `:35-37` requires a CPU benchmark and forbids claiming the swap complete.
- `docs/adr/ADR-009.md:29-33` claims iteration 3 delivers “Heuristic-first `DecisionBackend` plus tracked-cache infrastructure” — the backend half exists; the tracked-cache half does not.
- `docs/adr/ADR-010.md:23-36` freezes: backend protocol, `.python-setup-decisions.json` at the linted project root, sorted `indent=2`/`sort_keys` JSON array, no hex≥20, read-only lint with a hash-asserted zero-write check, explicit CI-guarded refresh (lockfile + merge + atomic replace), pruning of missing files/stale model IDs, and writer-first concurrency from the pylint verdict.
- `docs/adr/ADR-010.md:38-41` and `_decision_backend.py:37-46` pin the dotted-path loader as test-only.
- `docs/adr/ADR-014.md:1-5` claims current code is semantic-first with heuristic fallback; HEAD is heuristic-first (`_base.py:248-252`; `_decision_backend.py:16-20`), so the record is stale.
- `docs/adr/ADR-016.md:1-5` claims “At HEAD no DecisionBackend/cache/FakeBackend exists, [semantic] still sentence-transformers, tests still reranker-coupled.” All three claims are false at HEAD: `_decision_backend.py` exists, `pyproject.toml:28-30` is empty, and tests pin the absence of `sentence_transformers` (`tests/checkers/test_semantic_check.py:119-123`, `tests/checkers/test_decision_backend.py:329-337`).
- `docs/adr/ADR-015.md:1-3` is an open iteration-5 deferral: `_PylintPyiLintTool` passes `.pyi` paths but pylint lints companion `.py` (42 of 43 `pylint-pyi` golden findings are on `.py` files); probe found 205 latent private stub symbols; fixing changes the golden.
- `docs/adr/README.md:18-31` indexes only ADR-001…ADR-012; ADR-013…ADR-016 are absent.

---

## 4. Existing Tests & Conventions

### 4.1 Layout and style

- Unit tests: `tests/checkers/`, `tests/runner/`, `tests/test_golden.py`, `tests/test_setup_*`; 85 test modules, 794 test functions before parametrization, 19,627 lines total (`tests/`).
- Naming convention `test_<method>_given_<condition>_then_<expected>` (`CodingRules.md:288-290`).
- Markers: `slow` (excluded by default via `addopts = "-m 'not slow'"`), `no_external_api`, `with_real_api`, `implementation_detail` (`pyproject.toml:47-54`).
- Mocking policy: mock only external boundaries; first-party code always real (`CodingRules.md:240-252`). Checker tests therefore instantiate real `BaseChecker` subclasses through `CheckerTestCase`.
- Shared fixtures live in `tests/conftest.py` (`:40-169`): `empty_project`, session-scoped `configured_project`, `runner_config_factory`, `isolated_runner_registries`, `sample_project`.
- Test factories for complex checker inputs are split by domain to respect the 500-line C0302 limit (`tests/checkers/_factories.py:1-16`; `_factories_stub*.py`).

### 4.2 Semantic/backend tests (current contract)

| File | Coverage | Key lines |
|---|---|---|
| `tests/checkers/test_decision_backend.py` | Pinned constants, FakeBackend, loader gating, heuristic-first veto, normalization, packaging pins | `:1-6`, `:83-165`, `:181-264`, `:320-337` |
| `tests/checkers/test_semantic_check.py` | Adapter signature, empty-primary, `None` mapping, 0.5 threshold matrix, memo per unique pair/model, no `sentence_transformers`, no disk cache | `:47-133` |
| `tests/checkers/test_semantic_threshold.py` | 115-row heuristic table, semantic disabled | `:16-21`, `:147-164` |
| `tests/assumptions/test_pylint_cache_semantics.py` | Read-only behavior, in-process memo, path-free semantic API, `jobs=1` single-writer verdict, sequential pylint invocation | `:1-39`, `:94-181`, `:225-355` |
| `tests/checkers/test_suppression_justification_checker.py` | W9704 checker behavior; semantic disabled via fixture | `:19-30`, `:367-392` |
| `tests/checkers/test_bare_except_comment_checker.py` | W9738 checker behavior; semantic disabled via fixture | `:18-43` |

Important: no test exercises a real model. Every backend is a test double (`test_decision_backend.py:1-6`). The current test suite actively pins the **absence** of a model dependency (`test_semantic_extra_is_empty`, `test_uv_lock_has_no_sentence_transformers_edge` at `:323-337`; `test_no_try_import_checker.py:27-35`; `_OPTIONAL_IMPORT_PATTERNS` empty at `no_try_import_checker.py:10-13`). Any model wiring must update these pins deliberately.

### 4.3 Behavior-preservation gates

- Golden snapshot: 158 findings across all 14 tools; per-tool minimums; multiset comparison catches duplicates/moved lines/new false positives (`tests/_golden.py:1-11`; `tests/data/golden/minimal_sample_project_findings.json`).
- 18 `unjustified-suppression` findings (6 each for `pylint`, `pylint-pyi`, `pylint tests`) and 2 `bare-except-comment` findings.
- Golden capture runs with `PYTHON_SETUP_LINT_SEMANTIC=0` (`tests/integration.py:110-115`; `tests/_golden.py:54`), so semantic-enabled behavior is **not** covered by the golden.
- Integration also asserts brush-off W9704 at `mod.py:49` and no W9704 for carry-from at `mod.py:56` (`tests/integration.py:124-129`; fixture `tests/data/minimal_sample_project/src/minimal_sample/mod.py:49,56`).
- `lint.baseline` is empty, so self-lint fails on any new violation (`lint.baseline:1`).

### 4.4 Debloat evidence (measured at HEAD)

**Duplicated checker-test harness:**

- `_make_tc` local wrapper exists in 13 test files; `_walk_and_release` in 10; `_msg_ids` in 8. The shared implementations already exist in `testing.py:18-38`.
- Examples: `tests/checkers/test_tmp_path_checker.py:19-32` (calls `tc.checker.open()`), `tests/checkers/test_missing_error_chain_checker.py:16-32` (does not call `open()`), `tests/checkers/test_suppression_justification_checker.py:19-20` (imports the shared helper but still defines `_msg_ids`).
- The wrappers are not byte-identical: some call `checker.open()` (SourceRootMixin checkers) and some pass `module_name`. A shared helper needs an `open_checker`/`module_name` option rather than naive deletion.

**Duplicated semantic test double:**

- `_RecordingBackend` appears three times: `tests/checkers/test_decision_backend.py:44-55`, `tests/checkers/test_semantic_check.py:25-36`, `tests/assumptions/test_pylint_cache_semantics.py:80-91`.

**Duplicated runner/setup helpers:**

- `_UvCallRecorder` appears twice: `tests/runner/test_setup.py:39-60` and `tests/runner/test_setup_install.py:36-58`.
- `extra_block` appears twice: `tests/runner/_factories.py:174-176` and `tests/runner/_factories_extras.py:45-47`.
- `_semantic_disabled` fixture appears twice: `tests/checkers/test_bare_except_comment_checker.py:37-40` and `tests/checkers/test_suppression_justification_checker.py:23-26`.

**Dead/vestigial test code:**

- `assert_violation_contains_any` (`tests/runner/_factories.py:167-171`), `assert_r4_reason` (`:200-206`), and `baseline_entry_for_tool` (`tests/runner/_factories_baseline.py:26-28`) have no call sites.
- `sample_project` fixture (`tests/conftest.py:166-169`) has no call sites.
- `test_check_writes_no_disk_cache` monkeypatches `_CACHE_DIR`/`_RESULT_CACHE_FILE`, attributes that no longer exist, with `raising=False` (`tests/checkers/test_semantic_check.py:126-133`).
- The `semantic_disk` fixture does the same for `_CACHE_DIR`, `_RESULT_CACHE_FILE`, `_RESULT_CACHE` (`tests/assumptions/test_pylint_cache_semantics.py:94-106`). These assert the absence of a retired implementation rather than a live contract.
- `tests/runner/test_real_pipeline_smoke.py:1-42` runs the full pipeline and asserts only an int return plus all 14 section markers; this overlaps `tests/integration.py:57-145` and the fake-driven all-tools assertion in `tests/runner/test_lint_runner_integration.py:230-248`.
- Recent prune precedent: commit `644774e` deleted `test_config_consistency.py`, `test_self_lint_clean.py`, `test_pyright_noise_filter.py`, `test_t9_7_compose_pyright_live.py` and trimmed `test_autofix_conflict_integration.py` — the “never test linting” direction is already established.

**Source-side dead/placeholder code:**

- `PROMPT_VERSION` (`_decision_backend.py:11`) is unused in production; only tests assert it (`test_decision_backend.py:87-88`).
- `PYTHON_SETUP_LINT_DECISION_MODEL` is read only to warn that no model exists (`_decision_backend.py:55-58`; test `:141-151`).
- `_semantic.py` needs two `global` statements and a nullable memo solely for lazy initialization (`:16,24,39-41`); a module-level dict + `.clear()` would remove both.
- `_base.check_if_meaningful` rebuilds the 46-token boilerplate set and 20-phrase set on every call (`:172-241`); module-level `frozenset`s would preserve behavior and cut per-call work.
- `_PylintPyiLintTool` and `_PylintTestsLintTool` duplicate “explicit override then auto-discovery” rcfile resolution (`dispatch.py:249-277` vs `:280-309`), while `_PylintLintTool` uses `_resolve_pylintrc` (`:201-246`).
- `src/python_setup_lint/checkers/__init__.py` has only the license header and no module docstring (unlike `runner/__init__.py` and `conformance/__init__.py`).
- `docs/adr/ADR-016.md` and `ADR-014.md` are stale; the ADR index omits 013-016 (`docs/adr/README.md:18-31`).
- `pyproject.toml:3` says 1.2.10 while `CHANGELOG.md:3` tops out at v1.2.9 (minor release-doc drift).

### 4.5 Test-infrastructure conventions to extend first

The intent says “test infra/assumptions first.” The existing template is `tests/assumptions/`:

- Each module opens with the observed third-party version and the contract being pinned (`test_pylint_cache_semantics.py:1-39`, `test_astroid_contracts.py:1-7`, `test_beartype_contracts.py:1-11`, `test_pylint_contracts.py:1-6`).
- `pytestmark = pytest.mark.no_external_api` on every assumption module.
- Tests are behavioral and assert observed consequences, not implementation internals; failures are meant to trigger re-derivation before loosening.
- For the cache writer, `TestPylintRcfileJobsWatchdog` and `TestPylintInvocationConcurrency` already pin `jobs=1`, sequential dispatch, and the absence of `concurrent`/`multiprocessing` imports in the runner (`:225-355`). This is the writer-first verdict ADR-010 requires.
- For benchmarks, `tests/runner/test_bench_runner_overhead.py:1-14` shows the convention: `@pytest.mark.slow`, real subprocesses, measured wall time/RSS, artifact written under `tmp_path`.

---

## 5. Open Questions & Uncertainties

### Q1. Which model satisfies the intent, and can the ADR-009 gate be closed now?

- The intent names `fastino/GLiDE-0.4B` or smaller. External facts: GLiDE-0.4B is a 0.40B-parameter encoder, 0.81 GB bf16 weights, tested on an RTX PRO 6000, requires `torch==2.14.0` (CUDA 13.0 wheels) and `transformers==5.17.0`; its `glide/` inference package lives in the HF repo, not as a normal PyPI dependency ([model card](https://huggingface.co/fastino/GLiDE-0.4B)).
- The GLiDE collection’s smallest member is 0.4B (others: 0.8B, 2B, 9B, 27B) ([collection](https://huggingface.co/collections/fastino/glide)), so “or smaller” requires a different model family.
- License is the Fastino Community License: free use, but production commercial use by an entity with annual revenue > $10M requires a separate written agreement; any commercial use requires “Built with Fastino GLiDE” attribution; derivative works must be distributed under the same license ([LICENSE](https://huggingface.co/fastino/GLiDE-0.4B/blob/main/LICENSE)). The project itself is MIT (`pyproject.toml:19-20`).
- ADR-009’s corpus gate remains untouched: 215 meaningful / 0 meaningless labels, all single-author (`docs/adr/ADR-009.md:9-13`). No corpus artifacts exist in the repository (only `tests/data/golden/` and `tests/data/minimal_sample_project/`).
- No CPU benchmark exists; ADR-016 explicitly lists “no CPU bench” as open (`docs/adr/ADR-016.md:3`).
- Decision framing: (a) spike GLiDE CPU latency and packaging, then implement an optional backend; (b) choose a smaller permissively licensed zero-shot/classifier model, which still needs evaluation data; or (c) keep heuristic-only behavior and record another explicit deferral. Option (c) conflicts with the literal intent unless the operator accepts the ADR-009 gate again.

### Q2. How should a production backend be wired, and should it be default-on?

- `get_backend()` currently has no production model path; it returns a test-only dotted-path backend or `None` (`_decision_backend.py:37-59`). ADR-010 says a compliant model “plugs in through `get_backend()` plus `DECISION_MODEL` with no pipeline refactor” (`docs/adr/ADR-010.md:47-48`), but no loader code exists for that env var.
- `PYTHON_SETUP_LINT_DECISION_MODEL` is parsed but never used (`_decision_backend.py:55-58`), and `PROMPT_VERSION` is dead (`:11`).
- The present veto semantics mean a backend can only make lint stricter (`_base.py:248-252`; tests `test_decision_backend.py:181-229`). Default-on would change W9704/W9738 outcomes for every consumer that installs the extra; default-off would preserve behavior but make the feature opt-in.
- The architect must also decide failure semantics: missing extra, model download failure, OOM, CPU timeout, and malformed model output all currently collapse to `None` → heuristic pass. Is that acceptable for a tool advertised as validating suppressions?

### Q3. Git-stored decision cache: schema, keying, and the path-free API tension

ADR-010 freezes the contract (`docs/adr/ADR-010.md:26-36`) but the repository documents no schema or key encoding beyond “JSON array sorted, indent=2, sort_keys, no bare hex ≥20.” Open decisions:

- **File identity vs path-free API**: pruning requires file paths in cache entries (ADR-010:33), but `semantic_check_if_meaningful` is deliberately path-free (`tests/assumptions/test_pylint_cache_semantics.py:171-181`) and its callers (`suppression_justification_checker.py:152-155,372-386`; `bare_except_comment_checker.py:103-118`) do not pass a path. Options: extend the checker→semantic call with a file path, add a separate cache API at the checker layer, or key by content and prune by scanning the repo. Each has test/behavior implications.
- **Key composition**: current memo includes `(primary, rule, code_context, model_id)` and truncates to 64 bits (`_semantic.py:47-64`). A tracked cache should likely key on file path + normalized justification + rule + model/prompt version; whether `code_context` belongs in the key determines churn vs sensitivity.
- **Score vs verdict**: storing a boolean loses the ability to re-threshold; storing a float lets `DECISION_THRESHOLD` changes apply without re-running the model, but requires calibrating model output to `[0,1]` (the protocol promises this, but does not enforce it; `_decision_backend.py:16-20`).
- **Refresh command**: there is no CLI surface today (`runner/cli.py:280-366` lists all args; none refresh decisions). ADR-010 requires an explicit CI-guarded refresh path with lockfile + merge + atomic replace. The golden-update guard pattern (`tests/_golden.py:374-392`: refuse under `CI`/`GITHUB_ACTIONS`) is a reusable precedent.
- **Read-only lint**: ordinary lint must not mutate the cache; a hash-before/hash-after test is required. Current tests only prove the retired path is absent (`test_pylint_cache_semantics.py:112-168`; `test_semantic_check.py:126-133`).
- **Secrets scan**: `.secrets.baseline` enables `HexHighEntropyString` (limit 3.0), so long hex keys in a committed cache will fail `detect-secrets`. ADR-010’s “no bare hex strings” constraint is not just stylistic.
- **Writer concurrency**: the verdict says no lock/merge is needed while pylint `jobs=1` (`test_pylint_cache_semantics.py:14-38`, `:225-355`); a consumer rcfile with `jobs>1` voids the claim. If refresh is a separate process rather than pylint, that assumption must be restated.
- **Location**: `.python-setup-decisions.json` at the linted project root (ADR-010:26); `.gitignore` currently ignores only `.cache/python-setup/semantic/` (`.gitignore:243-244`), so a root decisions file would be committed and visible to `detect-secrets`/`git ls-files`.

### Q4. How is semantic behavior pinned if a model ships?

- Golden and integration capture with `PYTHON_SETUP_LINT_SEMANTIC=0` (`tests/integration.py:110-115`; `tests/_golden.py:54`), so no current test pins model-enabled W9704/W9738 outcomes.
- A model that changes verdicts could pass the entire suite while changing consumer lint behavior. Options: (a) add a deterministic fake-backend golden that exercises the full veto path with `PYTHON_SETUP_LINT_SEMANTIC=1`; (b) add an opt-in real-model golden/contract test marked `slow`/`with_real_api`; (c) keep the model opt-in and document that golden covers only heuristic behavior.

### Q5. Documentation and ADR reconciliation scope

The following are definitively stale at HEAD and should be part of the modernize work:

- `docs/semantic-justification.md:1-62` — entire document describes cross-encoder/reranker, `sentence-transformers`, `PYTHON_SETUP_LINT_RERANKER_MODEL`, `~/.cache/.../results.json`.
- `docs/custom-checks.md:97` and `:104` — reranker-first description and invalid cache-key tuple.
- `README.md:29` — `python-setup[semantic]` described as “sentence-transformer-powered”.
- `docs/troubleshooting.md:97-111` — cross-encoder download-failure section; `:150` says “Expected: 7 pass, ~39s” (actual 9 pass, ~57s).
- `docs/tutorials.md:12-16` — “optional semantic justification rerunner”.
- `AGENTS.md:79-85` — cross-encoder pipeline and `PYTHON_SETUP_LINT_RERANKER_MODEL`; `:9-11` test counts stale (1290/4 skip/15 deselected/53 s vs 1357/7 deselected/26.6 s; integration 7 vs 9); Tool Scope table `:20-32` has 13 rows but there are 14 tools (missing `ruff format`; see `runner/_tool_specs.py:12-22`).
- `docs/adr/ADR-016.md:1-5`, `ADR-014.md:1-5`, `ADR-009.md:29-33`, `ADR-002.md:3-6`, `ADR-011.md:44-49` — claims that no longer match HEAD (backend exists; tracked cache does not; `TestSuppressionRerankerPipeline` no longer exists).
- `docs/adr/README.md:18-31` — missing ADR-013…ADR-016 entries.

### Q6. Debloat acceptance criteria and “never test linting”

- “Test infra/assumptions first” is already satisfied structurally by `tests/assumptions/`; continue that pattern for any new model/cache work.
- “Never test linting” is not defined in the repo. The closest precedent is the recent prune of `test_self_lint_clean.py`, `test_config_consistency.py`, `test_pyright_noise_filter.py`, `test_t9_7_compose_pyright_live.py` (commit `644774e`). Remaining candidates: `tests/runner/test_real_pipeline_smoke.py` (overlaps integration + fake orchestration), and checker-test helper wrappers that only re-test the harness.
- Test intent must be preserved: the 115-row heuristic table (`test_semantic_threshold.py:16-21,147-164`) and the W9704 checker behavior tests (`test_suppression_justification_checker.py:29-392`) are behavior contracts, not harness duplication. The duplicate `_RecordingBackend` / `_UvCallRecorder` / `_make_tc` layers are harness duplication.
- No acceptance metric exists for line-count reduction; the only enforced metrics are `C0302 ≤500`, `R0912 ≤16`, `R0915 ≤65` and the empty baseline (`CodingRules.md:139-159`; `lint.baseline:1`).

### Q7. Pylint-pyi scope (ADR-015)

- ADR-015 explicitly defers the fix to iteration 5 (`docs/adr/ADR-015.md:1-3`). If iteration 5 is this iteration, the architect must either include it or update the ADR with a later target.
- Current behavior: `_PylintPyiLintTool` discovers `.pyi` paths and passes them to pylint (`dispatch.py:249-277`); the golden contains 43 `pylint-pyi` findings, 42 on `.py` files (`tests/data/golden/minimal_sample_project_findings.json`). Changing this scope will change the golden and possibly `lint.baseline` behavior for consumers.

### Q8. Packaging and test pins that will change with a model extra

- `[semantic]` extra is empty (`pyproject.toml:28-30`; `uv.lock:623`).
- Tests pin emptiness: `test_semantic_extra_is_empty` and `test_uv_lock_has_no_sentence_transformers_edge` (`tests/checkers/test_decision_backend.py:323-337`).
- `_OPTIONAL_IMPORT_PATTERNS` is empty with the comment “The [semantic] extra is an empty placeholder” (`no_try_import_checker.py:10-13`), and `test_no_try_import_checker.py:27-35` pins that `sentence_transformers` is no longer optional and that a try/except import is now a violation.
- If a model is loaded via `importlib` (as the current dotted loader does), the no-try-import rule is bypassed; if it is loaded via `try/except ImportError`, the patterns/test must be updated deliberately.
- `uv.lock` regeneration for torch/transformers/glide will be large and platform-specific; `semantic` must remain optional so the base dev install stays light.

### Q9. Cache/model test infrastructure to add before implementation

Suggested assumption/contract tests, following `tests/assumptions/` style:

1. Cache file round-trip: sorted `indent=2`/`sort_keys`, no hex ≥20, passes `detect-secrets` (ADR-010:26-28).
2. Read-only lint: byte-hash the cache before/after an ordinary `run_lint`; assert unchanged (ADR-010:29-30).
3. Refresh path: refused under `CI`/`GITHUB_ACTIONS`; atomic replace; single-writer behavior (reuse the golden guard pattern, `tests/_golden.py:374-392`).
4. Prune: entries for missing files and stale `model_id`s disappear; live entries survive.
5. Backend loading: production ignores `PYTHON_SETUP_LINT_DECISION_BACKEND`; missing optional dependency → `None` → heuristic behavior (`_decision_backend.py:37-46`).
6. Model determinism: no sampling; batching must not change scores (GLiDE model card warns that concurrent micro-batching can shift probabilities; set `GLIDE_MAX_BATCH=1` when caching scores).
7. CPU benchmark: `@pytest.mark.slow`, wall time/RSS per justification, following `test_bench_runner_overhead.py:1-14`.

---

## 6. High-signal summary for the architect

1. The reranker removal is complete; the backend/cache *interfaces* are half-delivered. The next iteration’s semantic work is: production backend wiring + an actual CPU model (or an explicit deferral) + the tracked decision cache with refresh/prune.
2. The biggest behavioral risk is enabling a model by default before semantic-on behavior is pinned; golden currently runs with semantic off.
3. The biggest debloat wins are test-harness duplication (13 `_make_tc` copies, 10 `_walk_and_release` copies, 3 `_RecordingBackend` copies, 2 `_UvCallRecorder` copies, dead helpers, vestigial cache tests, redundant smoke test), not production code.
4. Docs and ADRs are materially wrong about the semantic subsystem; ADR-016 actively contradicts HEAD and should be superseded/updated first.
5. Any ADR-009 gate closure needs a corpus/license/CPU-benchmark decision that cannot be inferred from the repository today.`). Read code ONLY to verify a specific integration decision (few targeted reads, never broad scans). Translate new unknowns into spike outlines or plan amendments instead of in-turn investigation. Keep terse.
- Outcome options (yield `decision` matching `decisions.schema.json` with `context: "wave"`):
  - `continue`: wave succeeded; proceed to the next scheduled wave.
  - `amend`: revise remaining plan items based on wave learnings or spike results. Yield `outlines` = the NEW or REPLACEMENT PlanItemOutline entries for the amendment (same shape as plan `itemOutlines`: slug, kind, title, description?, milestoneId?, deps?, escalate?), PLUS optional `removeItemSlugs` naming PENDING (never merged/running) items the new items replace, PLUS `planDelta` prose describing the change for the PM. NEVER yield `amend` without `outlines`: an amendment with no new outlines is `continue`.
  - `end-iteration`: halt remaining waves early and transition directly to plan close-up (e.g. goal accomplished early or severe pivot required).
- When an amendment versions or replaces an item (for example a *-v2 copy superseding the original), include the stale original slug in `removeItemSlugs` so the pending original does not linger and run redundantly.
- Integrate spike findings: use `findings.md` and PoC results from finished spikes to inform subsequent item outlines.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.

## Current Plan
{
  "iteration": 5,
  "milestones": [
    {
      "id": "M1",
      "title": "Test infrastructure and decision contracts first",
      "directionalInterfaces": [
        "Cache file contracts (NEW tests/assumptions/test_decision_cache_contracts.py, no_external_api, passable at M1 via inline tmp JSON without prod imports): round-trip sorted (rule, justification, model) indent=2/sort_keys deterministic (double-write byte-identical), last-seen update-only-on-change rule; secrets split — schema-controlled fields never emit hex>=20 (rev short12 = 12 chars, prompt hash = sha256 hexdigest[:12], version/paths clean; unit test with adversarial SHA-bearing justification proves only the verbatim field contains it), tmp check shells the installed hook (`detect-secrets-hook --baseline <fresh-tmp-baseline> <tmp-cache>`; item cites --help at HEAD + exact invocation) asserting zero findings on representative entries. DEFERRED to M3 impl tests: read-only hash, refresh CI-guard, prune, --path, jobs>1.",
        "Loader delta contracts (NEW tests/assumptions/test_decision_loader_contracts.py, no_external_api; do NOT re-pin honors/ignores/warn-once at tests/checkers/test_decision_backend.py:117-165 — cite, never duplicate): PROD_MODEL_ID_RE `^[\\w.\\-/]+ rev [0-9a-f]{12} prompt-v\\d+$` + FAKE_ALLOWLIST {'fake-backend rev test prompt-v1','dotted-loader rev test prompt-v1'} (strict regex would reject 'test'; allowlist is explicit, never widened silently); DECISION_MODEL_RE `^(?P<id>[\\w.\\-/]+) rev (?P<rev>[0-9a-f]{12})$`; malformed (missing rev, rev len!=12, non-hex rev, trailing ' prompt-vN', empty/whitespace, extra tokens) maps to None + exactly-one warning; failure-to-None maps to heuristic bool (no raise, no retry). Consumed by model-backend-wiring via dep.",
        "Model spikes (report-only, zero committed files): candidate matrix {license, params/size, runtime, py3.14 CPU wheels linux/mac/win, custom-code/vendoring, pinnable revision, offline}; corpus pilot {JSON code-block schema [{id, justification, rule, context, stratum, label, source, pass1, pass2, adjudicated}] + counts {total, post_dedup>=100, per_stratum non-empty, per_source} + agreement, N>=100 post-dedup, rubric} or explicit blocker; CPU eval {veto-only 0.5/0.6/0.7, 90/95/85 on accepted stratum, latency pilot on 12-item subset then full accuracy on non-excluded, per-candidate 30-min timeout with explicit exclusion + partial results, cold-load/warm p50/p95 + RSS, GLIDE_MAX_BATCH=1 determinism, re-validates corpus (re-normalize + re-dedup, counts match, strata non-empty), smallest compliant or no-go, needs_human fields on Fastino/unclear + second-rater flag}; runtime pinning (conditional on go, else report-only skip).",
        "Pyi spike (report-only, tmp poc incl mechanism): {reproduction companion-vs-orphan, mechanism poc (temp-tree/copy OR pylint no-companion mode on tmp: broken-stub control proves skipped-before/linted-after + tmp-to-repo path-mapping table for golden keys), golden counts recount at HEAD, latent budget recount (symbols + duplicate-code), recommendation fix-with-regen (mechanism + mapping + cleanup budget + regen plan) vs orphan-only (scope-note text)}."
      ],
      "scenarios": [
        "Scenario: Cache and loader contracts pinned before implementation\n  Given HEAD with in-process memo only and no tracked cache\n  When cache/loader assumption items merge\n  Then new assumption modules pass offline, assert live or inline-format contracts only (no raising=False vestiges, no future-behavior pins), and M3/M4 consume them via deps (cache-impl->cache-contracts, backend-wiring->loader-contracts) without loosening; refresh/prune/jobs/read-only pinned in M3 tests, not M1",
        "Scenario: Model verdict is evidence-based or explicitly blocked\n  Given the 215/0 no-go history and Fastino review open\n  When matrix + corpus + CPU eval complete\n  Then the report cites license verdict per candidate, CPU latency/RSS per threshold, 90/95/85 compliance on the accepted stratum, emits needs_human fields on any Fastino/unclear recommendation, flags the second-rater requirement, and recommends the smallest compliant model+prompt+threshold or a no-go/blocker with evidence; no model code ships on no-go",
        "Scenario: Pyi scope decided with budget\n  Given 42/43 pyi findings on .py and 205 latent symbols (verify at HEAD)\n  When the pyi spike completes\n  Then the verdict recommends fix-with-regen (proven mechanism + path mapping + cleanup budget + regen plan) or orphan-only (scope-note text), and M5 consumes it without re-proving reproduction"
      ]
    },
    {
      "id": "M2",
      "title": "Test harness and source debloat (behavior-preserving)",
      "directionalInterfaces": [
        "Checker harness single-sourced: testing.py (+testing.pyi atomic sync) gains _walk_and_release(..., *, file_path=None, module_name='', open_checker=False, source_roots=None) — open_checker=True sets linter.config.source_roots = source_roots or ['src'] then checker.open() before walk (structlog pattern test_structlog_checker.py:23-31); module_name passthrough kept; plus _msg_ids()->set[str] and _msg_ids_sorted()->list[str] (7 set callers migrate to former, test_stub_fidelity_invariants.py:77 to latter); per-file migration table in report; 13 _make_tc + 10 _walk_and_release + 8 _msg_ids local copies deleted (grep zero, recount at HEAD); behavior identical.",
        "Semantic/runner doubles single-sourced: one _RecordingBackend (NEW tests/checkers/_decision_test_doubles.py or testing.py extension, item reports placement + import graph), one _semantic_disabled fixture (tests/checkers/conftest.py), one _UvCallRecorder, one extra_block; dead helpers CONDITIONAL delete (assert_violation_contains_any, assert_r4_reason, baseline_entry_for_tool, sample_project — grep-zero no-call-site proof per helper incl pytest-arg injection check for fixtures; keep + document survivors with reason); vestigial cache tests rewritten to live hash/tmp contracts (no raising=False on retired attrs); smoke kept-narrowed or removed with survivor map to integration + fake orchestration.",
        "Source simplifications (no behavior change): _semantic memo dict + .clear() (drop both globals + nullable; read-branch + scored API + memo-value-tuple owned by M3 after, via dep); _base boilerplate/phrase frozensets at module level; NEW cmd_build._resolve_tool_rcfile(tool_key, config_paths, cwd, shipped) (explicit override first, then shipped fallback; pyi/tests migrate; pylint migrates iff byte-identical commands proven, else stays with note) + byte-identical command tests; checkers __init__ module docstring; FORBIDDEN _decision_backend/PROMPT_VERSION/DECISION_MODEL (M4), decisions/ + CLI threading + checker observation lines + _semantic read/scored API (M3), tests/data, baseline, docs."
      ],
      "scenarios": [
        "Scenario: Harness deduped without intent loss\n  Given duplicated wrappers/doubles/dead helpers at HEAD\n  When M2 merges\n  Then grep shows zero local copies (or documented survivors with proof), all touched modules <=500 with no new suppressions, stubtest passes on testing.pyi sync, 115-row heuristic table + W9704/W9738 checker behavior tests pass unchanged, no new failures vs I5 HEAD gates, golden hash-equal",
        "Scenario: Source simplified without drift\n  Given placeholder globals, per-call sets, duplicated rcfile blocks\n  When simplifications merge\n  Then behavior identical (heuristic outcomes + tool commands byte-identical in tests incl rcfile resolution), modules <=500, tach/typing clean, no new failures, golden hash-equal"
      ]
    },
    {
      "id": "M3",
      "title": "Git-stored decision cache with cleanup",
      "directionalInterfaces": [
        "Storage + read (NEW python_setup_lint/decisions/_decision_cache.py + .pyi with lookup(justification, rule, model)->(score, decision)|None + resolve_cache_path() with traversal guard; _semantic.py read-branch + semantic_score()->float|None (+.pyi) + memo value (score, decision) tuple, applied onto M2 dict shape via dep; @beartype, structlog, tach-clean, <=500): .python-setup-decisions.json at linted root (array sorted by (rule, justification, model), indent=2, sort_keys, schema fields never hex>=20); entry {justification normalized, rule joined codes, model '<id> rev <short12> prompt-vN', score float [0,1] + decision bool, files sorted unique POSIX} + {version, prompt hash hexdigest[:12], last-seen ISO date updated ONLY when score/decision/files change}; key (justification, rule, model); context model-input-only; hit/miss/absent table — heuristic-rejected: False, no read, no backend; accepted + file-missing: None->heuristic True; accepted + entry-hit: persisted decision, backend uncalled (call-count 0 proof); accepted + key-miss: backend.decide once (clamped [0,1] in semantic_score), memo only, persist via refresh.",
        "Refresh (runner CLI --refresh-decisions [--path ...], RunnerConfig.refresh_decisions: bool=False new field in types.py, help text): explicit only, FAILS under CI/GITHUB_ACTIONS (golden-guard shape), PYTHON_SETUP_LINT_DECISIONS_PATH test-only (ONLY under PYTEST_CURRENT_TEST; production root = config.cwd with traversal guard), lockfile (O_CREAT|O_EXCL retry 5s) + merge + atomic replace in target dir, prune automatic — scanned-scope-only missing prune (entry.files paths under scanned scope (--path dirs or full tree) removed if missing; unscanned retained even if missing), stale = model != refresh-run folded id drops whole entry, file-level removal then drop-empty-entry; jobs_from_rcfile() reads effective jobs from resolved pylint/pylint-pyi/pylint-tests rcfiles, any >1 fails loudly naming file (no sidecars); observation producer atomic here via checker-layer emit (suppression + bare-except refresh-only branch: OBSERVE=1 appends {file via node.root().file, justification, rule, model, score via semantic_score memo reuse — single backend call, no heuristic duplication} to OBSERVE_PATH tmp *.jsonl, env unset emits nothing; sidecar merged then deleted); read-only = SHA-256 of cache file bytes (missing=sentinel) unchanged across ordinary run_lint; tach: BOTH root tach.toml AND config/tach.toml gain decisions module + 2 edges (sole owner, exact 3-module TOML)."
      ],
      "scenarios": [
        "Scenario: Cache round-trips with cleanup and stays secrets-clean\n  Given empty/missing cache on tmp\n  When refresh runs with FakeBackend observations then prune\n  Then file round-trips sorted deterministically (double-run byte-identical, last-seen stable on identical input), checker->sidecar->cache population proven end-to-end (never prune-only, producer lines cited), missing-file + stale-model entries disappear per prune rules, live entries survive, detect-secrets passes, no schema hex>=20 (verbatim-justification SHA warns + risk-accepted per docs)",
        "Scenario: Lint stays read-only while refresh writes explicitly\n  Given a committed cache with a persisted False verdict\n  When ordinary run_lint runs vs explicit --refresh-decisions\n  Then ordinary lint shows zero writes by file-bytes SHA-256 hash and emits the persisted verdict with no model load per the hit/miss/absent table (backend uncalled proof), while refresh merges sidecar observations + prunes + atomic-replaces, refuses under CI, and fails loudly on jobs>1"
      ]
    },
    {
      "id": "M4",
      "title": "CPU decision model wiring (spike-gated)",
      "directionalInterfaces": [
        "Semantic-on pin (tests-only, no model needed): counts layer = DIRECT semantic_check_if_meaningful/semantic_score calls with backend=_RecordingBackend kwarg (public .pyi API, same process): veto extremes (1.0 preserves, 0.0 vetoes), brush-off count 0, one call per unique pair (memo-tuple hit); verdicts layer = _walk_and_release walks (no backend kwarg exists; default None->heuristic) asserting heuristic verdicts + SUBPROCESS sample-project run asserting verdict deltas via tmp cache-hit only (persisted False flips W9704 on with no model load; dotted-path import in child FORBIDDEN — no PYTHONPATH proof needed, assert no PYTEST_CURRENT_TEST leakage instead); exactly one slow+with_real_api e2e SKELETON (skipped until model ships; on go, wired to real backend with importorskip + CPU budget asserts).",
        "Backend wiring (branches on U1 verdict + recorded human approvals via needs_human->steer workflow; consumes eval + runtime-pinning + cache-impl + loader-contracts): GO maps to per-family loader in get_backend() — family-transformers (Auto* CPU, pinned per runtime-pinning, ~60 lines) | family-vendored-glide (importlib from pinned vendored revision, GLIDE_MAX_BATCH=1 when caching, ~100 lines) | family-other (per runtime-pinning API, <=120 lines) — model_id folded '<id> rev <short12> prompt-vN' per PROD_MODEL_ID_RE; [semantic] gains pinned runtime only (CPU wheels verified); allowlist pins (chosen top-level present, sentence-transformers absent, no unpinned git/URL deps, base-without-extra dep set unchanged); uv.lock via single networked `uv lock` + `uv sync --frozen` offline verify after; failure maps to None maps to heuristic with exactly-one warning (no retry storm); no_try_import patterns updated deliberately; GO additionally requires recorded approvals (license + second-rater steer answer IDs cited) — absent forces NO-GO; NO-GO maps to zero prod writes, no-op attestation, heuristic-only docs (M5)."
      ],
      "scenarios": [
        "Scenario: Veto path pinned with and without a model\n  Given golden runs with SEMANTIC=0\n  When semantic-on pin merges\n  Then direct-call count asserts + walk/subprocess verdict-delta asserts pass deterministically in the default suite (no unobservable cross-process counts, no child dotted import), the slow skeleton skips with a clear reason, and SEMANTIC=0 golden stays hash-equal",
        "Scenario: Model ships only on a compliant verdict plus human gates\n  Given the U1 verdict plus steer approvals (or their absence)\n  When backend wiring merges\n  Then GO shows per-family loader + allowlist pins + lock regen + e2e pass (slow) with no default-suite network and no SEMANTIC=0 drift, or NO-GO shows zero prod diff with an attestation citing verdict + approvals gap — never a silent swap, an unpinned dependency, or a merge past missing human approval"
      ]
    },
    {
      "id": "M5",
      "title": "Pyi scope, docs/ADR reconciliation, and gate evidence",
      "directionalInterfaces": [
        "Pyi branch (consumes spike mechanism poc + path mapping; owns dispatch.py pyi block + src/**/*.pyi + companion .py ONLY where stubtest fidelity requires, enumerated): FIX maps to _PylintPyiLintTool lints companion stubs via spike-proven mechanism (temp-tree/copy or no-companion mode) with tmp-to-repo path mapping applied before golden keys, broken-stub control (skipped-before/linted-after with pyi-underscore firing), shift report {class, added/removed keys, CHANGELOG snippet, file:line}, latent stub cleanup EITHER in-budget (<=200 prod lines, per-file counts) OR I6 file:line list (never baseline edits); ORPHAN-ONLY maps to zero prod writes + scope-note text for docs; no golden change unless FIX via hatch.",
        "Docs/ADR exact-strings (sole writer; after all behavior items): semantic-justification.md (DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1, veto, FakeBackend, grep-zero 'reranker' case-insensitive — full rewrite); custom-checks.md (DecisionBackend, live key tuple); troubleshooting.md (PYTHON_SETUP_LINT_DECISION_MODEL, PYTHON_SETUP_LINT_RERANKER_MODEL, deprecated, 9 pass/~57s; pyi branch strings — FIX: 'companion stubs are linted by pylint-pyi', ORPHAN: 'companion .pyi files are governed by mypy.stubtest only' + 'pyi-underscore-symbol enforces orphan stubs only'); tutorials.md (decision backend, no rerunner); AGENTS.md (pipeline DecisionBackend with no reranker in subsection, Tool Scope 14 rows incl ruff format, Quick Commands recount at HEAD); README.md (v1.2.10, [semantic] runtime description); CHANGELOG.md ([semantic], go/no-go per verdict, 1.2.10, .python-setup-decisions.json); config/ty.toml grep-zero sentence_transformers (GO: comment names chosen runtime; NO-GO: empty-placeholder comment); docs/adr/README.md indexes 013-016 + 019-024 with 017/018 rows marked 'planned, unmerged in I4 — superseded by ADR-019'; ADR-013/015 verified (rewrite if stale) + ADR-014/016 rewritten to HEAD truth + ADR-009/002/011 staleness notes + NEW ADR-019..024 full Context/Decision/Consequences.",
        "Regen + gate table: ONLY golden-regen-hatch writes tests/data/golden (PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally, never under CI, double-run byte-identical, key-by-key diff vs shift reports, golden + tool counts together; no-op attestation with hash equality if all no-shift); final gate table {format exit, lint 14/14 per-tool, pytest counts, integration 9-collected-0-failed (9 passed with pre-commit; 7+2 skipped allowed with env + skip reasons cited), golden hash or regen diff, baseline [], docs checklist with INDEPENDENT grep rerun (cite docs-item proof + own rerun), :bash git-ls-files proof + gate-neutral evidence or I6 route} with absolute green required (red routes to follow-ups, never baseline edits)."
      ],
      "scenarios": [
        "Scenario: Pyi scope closed without overstating enforcement\n  Given the spike verdict and golden impact count\n  When pyi branch merges\n  Then FIX shows proven mechanism + mapping + shift report + (cleanup merged or I6 file list) with golden regen via hatch only and FIX docs strings grepped, or ORPHAN-ONLY shows zero prod diff with ORPHAN docs strings grepped — each branch asserting its distinct truth",
        "Scenario: Iteration closes with evidence\n  Given all merges\n  When docs + hatch + gate table complete\n  Then docs grep per checklist (producer proof + independent rerun), golden hash-equal or reviewed regen committed together, integration 9-collected-0-failed per contract, and the gate table records absolute green; any red cell fails with routing to follow-ups"
      ]
    }
  ],
  "uncertainties": [
    {
      "id": "U1",
      "description": "Which decision model (if any) is license-clean, CPU-feasible on py3.14, and meets 90/95/85 on the heuristic-accepted stratum is unknown; 215/0 corpus defect + single-author labels + Fastino review + no CPU bench all open; GLiDE-0.4B is smallest-in-family (0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17, glide/ vendored pkg) so 'or smaller' needs a different family; CC-BY-NC excluded per allowlist; go additionally gated on recorded human approvals via needs_human->steer workflow.",
      "spikeOutlines": [
        "model-candidate-matrix (fact-finder, report-only): license, params/size, runtime, py3.14 CPU wheels, custom-code, pinnable revision; excludes CC-BY-NC, flags Fastino/unclear",
        "brush-off-corpus-pilot (fact-finder, report-only): two-pass blinded pilot with JSON code-block handoff schema + counts + agreement, N>=100 post-dedup, both strata non-empty, or explicit blocker; bias NOT fully repaired, human second rater still required for go/no-go",
        "model-eval-poc (poc, CPU-only, no committed files): ALL matrix candidates veto-only at 0.5/0.6/0.7 (latency pilot then full accuracy, per-candidate 30-min timeout with explicit exclusion); corpus re-validation; 90/95/85 on accepted stratum; cold-load/warm p50/p95 + RSS; GLIDE_MAX_BATCH=1 determinism; smallest compliant or no-go; needs_human fields on Fastino/unclear + second-rater flag",
        "decision-runtime-pinning (test-assumptions, conditional on eval go): py3.14 CPU wheels + import/device/offline + custom-code pinning + loader/inference API signatures for chosen runtime family; on no-go report-only skip, no file"
      ]
    },
    {
      "id": "U2",
      "description": "Whether pylint-pyi companion-stub skip is fixed (with proven mechanism + path mapping + latent stub cleanup + golden regen) or documented as orphan-only scope is unknown; fixing changes golden (42/43 on .py per old probe) and exposes large latent cleanup (205 symbols per old probe, verify at HEAD).",
      "spikeOutlines": [
        "pylint-pyi-scope-spike (fact-finder, report-only, tmp poc incl mechanism + path mapping): reproduce companion vs orphan, prove temp-tree/copy or no-companion mode with broken-stub control + tmp-to-repo mapping table, recount golden impact + latent budget at HEAD, recommend fix-with-regen (mechanism + mapping + budget + regen plan) vs orphan-only (scope-note text)"
      ]
    }
  ],
  "itemOutlines": [
    {
      "slug": "cache-contract-assumptions",
      "kind": "test-assumptions",
      "title": "Pin tracked-cache file format contracts",
      "description": "Tests-only, NEW tests/assumptions/test_decision_cache_contracts.py ONLY (append-only; FORBIDDEN root __init__ + astroid/beartype/pylint contracts + test_pylint_cache_semantics.py, src, docs, tests/data, baseline). Passable at M1: build tmp JSON inline WITHOUT prod imports and pin format only — sorted (rule, justification, model) + indent=2/sort_keys round-trip, double-write byte-identical, last-seen update-only-on-change rule, schema-fields-never-hex>=20 unit test with adversarial SHA-bearing justification (only verbatim field contains it); tmp hook check via installed entry point (`detect-secrets-hook --baseline <fresh-tmp-baseline> <tmp-cache>`; cite --help at HEAD + exact invocation in report) asserting zero findings on representative entries. Explicitly DEFERRED to M3 impl tests: read-only hash, refresh CI-guard, prune, --path, jobs>1. pytestmark no_external_api, test_<api>_given_<condition>_then_<expected>, offline, tmp_path only. Verify: new tests pass now; format-clean; no other files.",
      "milestoneId": "M1",
      "deps": [],
      "prodBudgetHint": 0
    },
    {
      "slug": "backend-loading-assumptions",
      "kind": "test-assumptions",
      "title": "Pin backend loader delta contracts",
      "description": "Tests-only, NEW tests/assumptions/test_decision_loader_contracts.py ONLY (same forbiddens as cache-contracts). DELTA ONLY — honors/ignores/warn-once already pinned at tests/checkers/test_decision_backend.py:117-165 (cite file:line, never duplicate). Pin: PROD_MODEL_ID_RE + FAKE_ALLOWLIST (both exact strings asserted; M4 loader output must match one); DECISION_MODEL_RE parse + malformed table (missing rev, rev len!=12, non-hex rev, trailing ' prompt-vN', empty/whitespace, extra tokens → None + exactly-one warning each); failure-to-None mapping to heuristic bool (no raise, no retry). Consumed by model-backend-wiring via dep. Verify: new tests pass offline; format-clean.",
      "milestoneId": "M1",
      "deps": [],
      "prodBudgetHint": 0
    },
    {
      "slug": "model-candidate-matrix",
      "kind": "fact-finder",
      "title": "Decision-model candidate matrix",
      "description": "Report-only, zero repo writes. Matrix for GLiDE-0.4B + permissively-licensed Decision-Index smalls + MiniLM baseline (recount families from I5 pack section 6 + live cards; verify each): license (exclude CC-BY-NC/non-commercial; flag Fastino Community + unclear/no-license for human review per allowlist), params/weights bytes, runtime stack, py3.14 CPU wheels linux/mac/win, custom-code/vendoring burden (never unpinned trust_remote_code), pinnable revision, offline behavior, CPU evidence (or explicit none). Cite card URLs + revision SHAs + license texts. Feeds eval-poc + runtime-pinning.",
      "milestoneId": "M1",
      "deps": [],
      "prodBudgetHint": 0
    },
    {
      "slug": "brush-off-corpus-pilot",
      "kind": "fact-finder",
      "title": "Build two-pass brush-off pilot sample",
      "description": "Report-only, zero repo writes (no committed corpus in I5; poc consumes report tables via schema). Collect N real repo suppressions + threshold 115-row table + brush-off/meaningful tables, DEDUPED by normalized justification (strip+collapse ws, keep case; target N>=100 post-dedup), stratified heuristic-rejected vs heuristic-accepted (both non-empty). Rubric: specific technical justification vs placeholder/deferral/brush-off (disclose edge-case rubric for terse borderlines). Rater protocol: pass-1 rates all; pass-2 re-rates blinded (shuffled, pass-1 hidden); disagreements resolved by documented adjudication rule (disclose rule). HANDOFF: ```json corpus.json code block [{id, justification, rule, context, stratum: rejected|accepted, label: true|false, source: repo|threshold|table, pass1, pass2, adjudicated}] + counts {total, post_dedup, per_stratum, per_source} + agreement. Single-author bias NOT fully repaired — human second rater still required before any go/no-go (needs_human field). Or explicit blocker (collection/license/CPU) with I6 plan. No model choice here.",
      "milestoneId": "M1",
      "deps": [],
      "escalate": true,
      "prodBudgetHint": 0
    },
    {
      "slug": "model-eval-poc",
      "kind": "poc",
      "title": "CPU accuracy/latency evaluation (veto-only)",
      "description": "Prototype on tmp/venv only; zero committed files; network inside spike only. Consumes matrix + corpus reports (never invents candidates/labels). FIRST re-validate corpus: parse JSON handoff, re-normalize + re-dedup, assert counts match ±0 and both strata non-empty (fail loudly on mismatch, do not silently resample). Mapping: justification=primary, rule=joined codes (current symbol where unavailable, recorded), context=code_context (None allowed); decision=prob>=threshold; VETO-ONLY final=heuristic AND (prob>=threshold) per ADR-014 (replace mode rejected — do not score). Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency). PROTOCOL: latency pilot on 12-item subset per candidate first (cold-load + warm p50 + RSS), then full 3-threshold accuracy on non-excluded candidates; per-candidate 30-min wall timeout → explicit exclusion with partial results + reason (never silent drop). Metrics: accuracy, meaningless-precision, meaningful-recall on heuristic-accepted stratum (overall also reported), determinism check (GLIDE_MAX_BATCH=1 when caching; batching must not shift scores). Bars 90/95/85 apply to accepted stratum. Recommend smallest compliant model+prompt+threshold or no-go with evidence (license/CPU/accuracy blockers separated). Emit needs_human fields (Fastino/unclear recommendation; second-rater requirement) — engine converts to steer; never write steer records directly. Feeds runtime-pinning + M4 branch.",
      "milestoneId": "M1",
      "deps": [
        "model-candidate-matrix",
        "brush-off-corpus-pilot"
      ],
      "escalate": true,
      "prodBudgetHint": 0
    },
    {
      "slug": "decision-runtime-pinning",
      "kind": "test-assumptions",
      "title": "Pin chosen runtime wheels and API contracts",
      "description": "Conditional on eval verdict. GO maps to NEW tests/assumptions/test_decision_runtime_contracts.py ONLY (same forbiddens; no src changes): verify py3.14 CPU wheels linux/mac/win for chosen runtime family, import/device/offline contract (CPU fallback, no network on cache-hit/memo-hit), custom-code pinning (vendored revision or PyPI pin, never unpinned trust_remote_code), loader/inference API signatures + family tag (transformers|vendored-glide|other) consumed by M4 per-family loader. NO-GO/BLOCKED maps to report-only skip, zero files, cite verdict section. Verify: new tests pass offline (or skip attested); format-clean.",
      "milestoneId": "M1",
      "deps": [
        "model-eval-poc"
      ],
      "prodBudgetHint": 0
    },
    {
      "slug": "pylint-pyi-scope-spike",
      "kind": "fact-finder",
      "title": "Decide pylint-pyi companion-stub scope",
      "description": "Report-only, zero repo writes, tmp copies + tmp poc only. (1) Reproduce at HEAD: tmp .pyi with companion .py (even syntactically broken — skipped?) vs orphan .pyi (linted, pyi-underscore fires?) with exact commands + outputs. (2) Mechanism poc on tmp (no committed code): implement ONE of temp-tree/copy or pylint no-companion mode against tmp copies; broken-stub control must flip skipped→linted with pyi-underscore firing; emit tmp-to-repo path-mapping table (tmp path → repo-relative golden key) proving golden keys stay repo-relative. (3) Recount golden impact (pyi findings on .py vs .pyi) + latent budget (non-TYPE_CHECKING private symbols in src/**/*.pyi + duplicate-code findings on stubs) via grep at HEAD (old probe 42/43 and 205 symbols — verify, do not trust). Recommend fix-with-regen (proven mechanism + mapping + cleanup budget + regen plan) vs document-orphan-only (scope-note text + stubtest governance). No prod change, no golden change here. Feeds M5 pyi-scope-fix.",
      "milestoneId": "M1",
      "deps": [],
      "prodBudgetHint": 0
    },
    {
      "slug": "checker-harness-dedup",
      "kind": "story",
      "title": "Single-source checker-test harness",
      "description": "Owns src/python_setup_lint/testing.py + testing.pyi (atomic sync; stubtest must pass) — _make_tc/_walk_and_release options + _msg_ids/_msg_ids_sorted ONLY — + tests/checkers/test_*.py local _make_tc/_walk_and_release/_msg_ids wrappers ONLY (enumerate via grep at HEAD: ~13/10/8 per pack, verify actual; report full per-file migration table: file → shared call with args). FORBIDDEN docs, baseline, tests/data, runner tests, conftest fixtures. Red-test-exempt. Shared signatures: _walk_and_release(code, cls, /, *, file_path=None, module_name='', open_checker=False, source_roots=None); open_checker=True sets linter.config.source_roots = source_roots or ['src'] then checker.open() before walk; _msg_ids(msgs)->set[str]; _msg_ids_sorted(msgs)->list[str] (stub_fidelity migrates here, 7 set-callers to former). Delete all local copies (grep zero defs); migrate importers; touched files toward naming/marker conventions. First writer: semantic-test-doubles-dedup serializes after via dep. Verify: testing.py/.pyi + tests only; pytest -q + integration no new failures vs I5 HEAD (1357/9 per pack, recount); golden hash-equal; format-clean; stubtest clean.",
      "milestoneId": "M2",
      "deps": [],
      "prodBudgetHint": 40
    },
    {
      "slug": "semantic-test-doubles-dedup",
      "kind": "story",
      "title": "Single-source semantic test doubles and fixtures",
      "description": "Tests-only, second writer after harness-dedup. Owns tests/checkers/test_decision_backend.py + test_semantic_check.py + test_suppression_justification_checker.py + test_bare_except_comment_checker.py + tests/assumptions/test_pylint_cache_semantics.py + NEW tests/checkers/_decision_test_doubles.py (or testing.py extension — item reports placement + import graph; FORBIDDEN new conftest.py unless needed) ONLY. FORBIDDEN src, docs, baseline, tests/data, other test dirs. Red-test-exempt. Single-source 3x _RecordingBackend + 2x _semantic_disabled fixture into one home each; rewrite vestigial cache tests to live contracts (test_check_writes_no_disk_cache, semantic_disk fixture — assert absence of writes via hash/tmp, not raising=False on retired _CACHE_DIR/_RESULT_CACHE_FILE); preserve 115-row heuristic table + veto/threshold matrices byte-identical (outcomes pinned). Verify: tests only; no new failures; golden hash-equal; format-clean.",
      "milestoneId": "M2",
      "deps": [
        "checker-harness-dedup"
      ],
      "prodBudgetHint": 0
    },
    {
      "slug": "runner-test-helpers-dedup",
      "kind": "story",
      "title": "Single-source runner/setup helpers and prune dead tests",
      "description": "Tests-only. Owns tests/runner/_factories.py + _factories_extras.py + _factories_baseline.py + test_setup.py + test_setup_install.py + test_real_pipeline_smoke.py + tests/conftest.py (sample_project fixture lines only) ONLY. FORBIDDEN src, docs, baseline, tests/data, checker tests. Red-test-exempt. Single-source 2x _UvCallRecorder + 2x extra_block; dead helpers CONDITIONAL (assert_violation_contains_any, assert_r4_reason, baseline_entry_for_tool, sample_project — grep-zero no-call-site proof per helper INCLUDING pytest-arg injection search for sample_project; delete only if zero, else keep + document survivor reason in report); smoke disposition: EITHER narrow to non-overlapping asserts (int return + markers that integration + fake orchestration do not already pin, with per-assert survivor analysis) OR delete with removal-to-survivor map to tests/integration.py + test_lint_runner_integration.py (never-test-linting boundary per 644774e precedent). Verify: tests only; no new failures; golden hash-equal; format-clean.",
      "milestoneId": "M2",
      "deps": [],
      "prodBudgetHint": 0
    },
    {
      "slug": "source-simplifications",
      "kind": "story",
      "title": "Simplify semantic memo, heuristic sets, rcfile paths",
      "description": "Owns src/python_setup_lint/checkers/_semantic.py (memo dict + .clear() ONLY — read-branch + scored API + memo-value-tuple are M3 via dep) + _base.py (boilerplate/phrase frozensets only) + runner/cmd_build.py (NEW _resolve_tool_rcfile(tool_key, config_paths, cwd, shipped) ONLY: explicit override first, then shipped fallback param) + runner/dispatch.py (pyi/tests rcfile blocks call shared resolver passing _default_config_paths(cwd).get(key); pylint migrates iff byte-identical commands proven, else stays with note) + checkers/__init__.py (docstring only) + .pyi fidelity rows for touched symbols ONLY. FORBIDDEN _decision_backend.py/PROMPT_VERSION/DECISION_MODEL (M4), decisions/ + CLI threading + checker observation lines + _semantic read/scored API (M3), testing.py (harness-dedup), no_try_import patterns (M4), tests/data, baseline, docs, tach.toml (M3). Behavior-preserving only: same literals/membership, same resolution order proven by byte-identical built-command tests (before/after diff empty). Verify: prod <=60 lines; pytest + integration no new failures; lint 14/14 incl pylint/mypy/stubtest; golden hash-equal.",
      "milestoneId": "M2",
      "deps": [],
      "prodBudgetHint": 60
    },
    {
      "slug": "decision-cache-impl",
      "kind": "story",
      "title": "Implement tracked decision cache and refresh",
      "description": "Owns NEW python_setup_lint/decisions/_decision_cache.py + .pyi (__init__.py, lookup(), resolve_cache_path(), refresh/merge/prune, jobs_from_rcfile) + BOTH tach.toml files (root tach.toml + config/tach.toml, sole owner: each gains [[modules]] decisions depends_on=[] + checkers/runner depends_on=[python_setup_lint.decisions], exact 3-module TOML, both files byte-consistent on module stanzas) + runner CLI threading (cli.py --refresh-decisions branch + help, types.py RunnerConfig.refresh_decisions: bool=False + refresh scope reuses --path plumbing, _cli_complexity.py parse/build threading) + _semantic.py read-branch + semantic_score()->float|None (+.pyi, clamped [0,1]) + memo value (score, decision) tuple (applied onto M2 dict shape via dep; _base.py + _decision_backend.py bodies zero diff) + checker observation lines (suppression + bare-except refresh-only emit branch ONLY: OBSERVE=1 appends {file via node.root().file, justification, rule, model, score via semantic_score memo reuse — single backend call, no heuristic duplication} to OBSERVE_PATH tmp *.jsonl; unset emits nothing) + NEW tests/decisions/test_decision_cache.py + NEW tests/runner/test_refresh_decisions.py ONLY. FORBIDDEN _base.py/_decision_backend.py bodies, dispatch*/__init__/baseline/parsers (except CLI threading files), tests/data, baseline, docs, .gitignore/hatch/.secrets.baseline. Implements ADR-019: sorted array, entry + {version, prompt hash hexdigest[:12], last-seen change-only}, score+decision, secrets-clean schema (verbatim-justification SHA warns via structlog + risk-accepted); read-only SHA-256 file-bytes hash (missing=sentinel); refresh (sidecar collect + lockfile + merge + atomic replace + sidecar delete, DECISIONS_PATH test-only, cwd root + traversal guard, scanned-scope-only missing prune + stale-model drop + file-removal/drop-empty, --path retains unscanned, jobs_from_rcfile>1 fails loudly naming file, CI-fail). Must pass all 14 tools incl tach + detect-secrets. Verify: tmp round-trip double-run byte-identical; end-to-end checker->sidecar->cache population (cited lines, never prune-only); hit/miss/absent table incl backend-uncalled proof; CI-fail + isolation + jobs-guard + prune-granularity tests; no new failures; golden hash-equal or shift-reported (expect no-shift).",
      "milestoneId": "M3",
      "deps": [
        "cache-contract-assumptions",
        "source-simplifications"
      ],
      "escalate": true,
      "prodBudgetHint": 260
    },
    {
      "slug": "semantic-on-golden-pin",
      "kind": "story",
      "title": "Pin semantic-on veto path with fake backend",
      "description": "Tests-only, no model needed. Owns NEW tests/test_semantic_on_veto.py (or tests/checkers/test_semantic_on_veto.py — item reports placement; verify no conftest cycle) ONLY. FORBIDDEN src, docs, tests/data/golden writes (hatch sole writer), baseline, child dotted-path imports (FORBIDDEN in subprocess layer). Red-test-exempt (contract pin; veto already at HEAD so tests pass immediately). COUNTS layer (direct calls, backend=_RecordingBackend kwarg): 1.0 preserves heuristic accepts, 0.0 vetoes them, brush-off count 0, one call per unique pair (memo-tuple hit). VERDICTS layer (walks default None->heuristic + subprocess sample run via tmp cache-hit asserting W9704 flips with no model load + no PYTEST_CURRENT_TEST leakage assert). Exactly one slow+with_real_api e2e SKELETON (skipped 'no model wired' until M4 go; on go, model-backend-wiring wires it with importorskip + CPU budget). Modules <=500, no suppressions, never test linting. Verify: default suite passes (fake only, no network); skeleton skips; SEMANTIC=0 golden hash-equal.",
      "milestoneId": "M4",
      "deps": [
        "decision-cache-impl"
      ],
      "prodBudgetHint": 0
    },
    {
      "slug": "model-backend-wiring",
      "kind": "story",
      "title": "Wire production decision backend (or no-go attestation)",
      "description": "Branches on U1 verdict + recorded human approvals via needs_human->steer workflow (consumed, not advisory; reads Task Status steer answers at execution — allowed per status grounding; absent/negative → default NO-GO, no pause). GO (compliant model + allowlist pass + CPU bench pass + runtime-pinning merged with family tag + steer approvals for license/Fastino + second-rater sign-off, answer IDs cited): owns _decision_backend.py/.pyi (per-family production loader ONLY: family-transformers Auto* CPU ~60 lines | family-vendored-glide importlib pinned revision + GLIDE_MAX_BATCH=1 ~100 lines | family-other per runtime-pinning API <=120 lines; model_id folded per PROD_MODEL_ID_RE; failure→None→heuristic exactly-one warning, no retry storm) + pyproject [semantic] block + uv.lock (single networked `uv lock`, then `uv sync --frozen` offline verify) + no_try_import _OPTIONAL_IMPORT_PATTERNS + tests/checkers/test_decision_backend.py (ALLOWLIST pins: chosen top-level present, sentence-transformers absent, no unpinned git/URL deps, base-without-extra dep set unchanged) + test_no_try_import_checker.py (patterns) + slow e2e skeleton wiring (importorskip + CPU budgets per eval) ONLY; FORBIDDEN _semantic/_base (zero diff), decisions/, dispatch/CLI, tests/data, baseline, docs (snippet in report). NO-GO/BLOCKED/MISSING-APPROVAL: zero prod writes, no-op attestation citing verdict section + blocker + approvals gap + I6 plan. Verify GO: slow e2e passes with model, default suite no network, SEMANTIC=0 golden hash-equal, lint 14/14, lock resolves; NO-GO: attestation + zero-diff proof.",
      "milestoneId": "M4",
      "deps": [
        "model-eval-poc",
        "decision-runtime-pinning",
        "decision-cache-impl",
        "semantic-on-golden-pin",
        "semantic-test-doubles-dedup",
        "backend-loading-assumptions"
      ],
      "escalate": true,
      "prodBudgetHint": 120
    },
    {
      "slug": "pyi-scope-fix",
      "kind": "story",
      "title": "Fix or scope pylint-pyi companion stubs",
      "description": "Branches on pyi spike verdict (consumes proven mechanism + path mapping; never invents alternative). FIX-WITH-REGEN: owns dispatch.py pyi block (mechanism from spike + tmp-to-repo mapping applied before golden keys) + src/**/*.pyi + companion .py ONLY where stubtest fidelity requires (enumerated file list) + shift report {class, added/removed keys, CHANGELOG snippet, file:line} ONLY; broken-stub control must flip skipped→linted with pyi-underscore firing; latent stub cleanup EITHER in-budget (<=200 prod lines across stubs, per-file counts) OR I6 file:line list (item reports which; never baseline edits). ORPHAN-ONLY: zero prod writes, scope-note text for docs item. FORBIDDEN tests/data (hatch sole writer), baseline, docs (text in report), other dispatch blocks. Verify FIX: control proves mechanism, mapping keeps keys repo-relative, no new failures except shift-reported pyi keys, golden regen via hatch only; ORPHAN: zero-diff proof.",
      "milestoneId": "M5",
      "deps": [
        "pylint-pyi-scope-spike",
        "source-simplifications"
      ],
      "escalate": true,
      "prodBudgetHint": 260
    },
    {
      "slug": "docs-adr-reconciliation",
      "kind": "story",
      "title": "Reconcile docs, ADRs, and version pins",
      "description": "Docs-only, sole writer in I5. Owns docs/semantic-justification.md (full rewrite, grep-zero 'reranker' case-insensitive) + docs/custom-checks.md (semantic bullets) + docs/troubleshooting.md (semantic section incl deprecated RERANKER_MODEL note + counts + pyi branch strings: FIX 'companion stubs are linted by pylint-pyi' / ORPHAN 'companion .pyi files are governed by mypy.stubtest only' + 'pyi-underscore-symbol enforces orphan stubs only' — assert per verdict branch) + docs/tutorials.md (semantic lines) + AGENTS.md + README.md + CHANGELOG.md + config/ty.toml (GO: comment names chosen runtime; NO-GO: empty-placeholder comment; grep-zero sentence_transformers either way — verify at HEAD) + docs/adr/ADR-013.md + ADR-015.md (verify, rewrite if stale) + ADR-014.md + ADR-016.md (rewrite to HEAD truth) + ADR-009/002/011 (staleness notes) + docs/adr/README.md (index 013-016 + 019-024; 017/018 rows 'planned, unmerged in I4 — superseded by ADR-019') + NEW ADR-019..024 (full Context/Decision/Consequences per plan) ONLY. FORBIDDEN src, tests, tests/data, baseline, tach.toml. Red-test-exempt. Counts from rerun actuals at HEAD; exact-strings per M5 checklist (report grep proof per row); CHANGELOG user-visible (extra contents per M4 branch, full PYTHON_SETUP_LINT_DECISION_MODEL, cache file, go/no-go note, 1.2.10); README v1.2.10 pin; AGENTS pipeline DecisionBackend with no reranker in subsection + Tool Scope 14 rows. Verify: docs-only diff; rumdl clean; no new failures; golden hash-equal.",
      "milestoneId": "M5",
      "deps": [
        "checker-harness-dedup",
        "semantic-test-doubles-dedup",
        "runner-test-helpers-dedup",
        "source-simplifications",
        "decision-cache-impl",
        "semantic-on-golden-pin",
        "model-backend-wiring",
        "pyi-scope-fix"
      ],
      "prodBudgetHint": 0
    },
    {
      "slug": "golden-regen-hatch",
      "kind": "story",
      "title": "Conditional golden regen on shift reports",
      "description": "Sole tests/data/golden writer; FORBIDDEN all other paths. ONLY on reviewed shift report (justification-class + added/removed keys + CHANGELOG snippet + file:line) from behavior items (cache-impl, backend-wiring, pyi-fix; source-simplifications + golden-pin declare no-shift): run PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally (tests/_golden.py:53; never under CI/GITHUB_ACTIONS — guard fails), double-run byte-identical, key-by-key diff review matching shift reports, commit golden + tool counts together. If all declare no-shift: no-op attestation with hash equality (golden byte-identical). NEVER blind-regen. Verify: regen report with diff review or no-op attestation; integration + test_golden pass.",
      "milestoneId": "M5",
      "deps": [
        "source-simplifications",
        "decision-cache-impl",
        "semantic-on-golden-pin",
        "model-backend-wiring",
        "pyi-scope-fix"
      ],
      "prodBudgetHint": 0
    },
    {
      "slug": "final-gate-validation",
      "kind": "fact-finder",
      "title": "Final gate table and docs check",
      "description": "Report-only, zero writes. Record final gate table at HEAD: format exit 0; lint 14/14 per-tool (cite exit + per-tool + duration); pytest -q counts (cite); integration 9-collected-0-failed (9 passed with pre-commit installed, else 7 passed + 2 skipped with env + skip reasons cited — collected==9 and failed==0 is green either way); golden hash or regen diff (cite hatch report); baseline []; docs exact-strings with INDEPENDENT rerun (re-execute checklist greps read-only, cite docs-item proof + own rerun side by side); :bash proof (`git ls-files | grep -x ':bash' || echo absent`; if present, scoped yamllint + detect-secrets-hook exits cited as gate-neutral evidence, else route I6 root-cleanup). Absolute green required here (M5 only); red cells fail with routing to I6 follow-ups (new root items by file owner), never baseline edits. Feeds close-up.",
      "milestoneId": "M5",
      "deps": [
        "checker-harness-dedup",
        "semantic-test-doubles-dedup",
        "runner-test-helpers-dedup",
        "source-simplifications",
        "decision-cache-impl",
        "semantic-on-golden-pin",
        "model-backend-wiring",
        "pyi-scope-fix",
        "docs-adr-reconciliation",
        "golden-regen-hatch"
      ],
      "prodBudgetHint": 0
    },
    {
      "deps": [
        "cache-contract-assumptions"
      ],
      "description": "Owns NEW python_setup_lint/decisions/_decision_cache.py + .pyi (__init__, lookup(), resolve_cache_path(), refresh/merge/prune, jobs_from_rcfile, refresh_blockers) + BOTH tach.toml (sole owner, exact 3-module TOML, byte-consistent stanzas) + NEW tests/decisions/test_decision_cache.py ONLY. FORBIDDEN _base/_semantic/_decision_backend bodies, CLI threading, checker observation, tests/data, baseline, docs, .gitignore/hatch/.secrets. Implements ADR-019 storage: sorted (rule,justification,model) indent=2 sort_keys, entry {justification, rule, model '<id> rev <short12> prompt-vN', score [0,1]+decision, files POSIX} + {version, prompt hash hexdigest[:12], last-seen change-only}, secrets-clean (verbatim SHA structlog-warns + risk-accepted), DECISIONS_PATH test-only under PYTEST_CURRENT_TEST else config.cwd + traversal guard, lockfile O_EXCL retry 5s + merge + atomic replace in target dir, scanned-scope-only missing prune + stale-model whole-entry drop + file-removal/drop-empty, jobs_from_rcfile>1 fails naming file, CI/GITHUB_ACTIONS fail. Export-consistency protocol (I4 ImportError fix): refresh_blockers exact spelling in .py+.pyi, grep both trees, python -c import, stubtest clean, clear __pycache__, prove red/green locally (prod aside fails red, restored passes). Declare target {\"command\":\"uv run pytest -q\",\"customTarget\":true} NEVER {\"gate\":\"tests\"}. Verify: tmp round-trip double-run byte-identical, prune granularity, CI/jobs guards, tach+detect-secrets clean, no new failures, golden hash-equal.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "M3",
      "slug": "decision-cache-storage-v2",
      "title": "Tracked decision cache storage and refresh core (split 1/2)"
    },
    {
      "deps": [
        "decision-cache-storage-v2",
        "source-simplifications"
      ],
      "description": "Owns runner CLI threading (cli.py --refresh-decisions branch+help, types.py RunnerConfig.refresh_decisions:bool=False, _cli_complexity threading, --path scope reuse) + _semantic.py read-branch + semantic_score()->float|None (+.pyi, clamped [0,1]) + memo (score,decision) tuple onto M2 dict shape + checker observation (suppression+bare-except OBSERVE=1 appends {file via node.root().file, justification, rule, model, score via semantic_score memo reuse, single backend call, no heuristic duplication} to OBSERVE_PATH tmp *.jsonl; unset emits nothing) + NEW tests/runner/test_refresh_decisions.py ONLY. Consumes storage-v2 lookup/refresh (no storage edits). FORBIDDEN _base/_decision_backend bodies, decisions/ internals, dispatch*/baseline/parsers except threading files, tests/data, baseline, docs, tach.toml. Implements hit/miss/absent (rejected->False no read; file-missing->None->True; hit->persisted decision backend-uncalled; miss->one decide, memo only), read-only SHA-256 file-bytes hash (missing=sentinel) unchanged on ordinary run_lint, sidecar merged then deleted. Declare target custom command, never gate tests. Verify: end-to-end checker->sidecar->cache (cited lines, never prune-only), hit/miss table incl backend-uncalled proof, CI-fail + isolation + jobs integration, no new failures, golden hash-equal or shift-reported.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "M3",
      "slug": "decision-cache-refresh-wiring-v2",
      "title": "Cache read branch and refresh wiring (split 2/2)"
    },
    {
      "deps": [
        "decision-cache-refresh-wiring-v2"
      ],
      "description": "Tests-only, no model needed. Owns NEW tests/test_semantic_on_veto.py (or tests/checkers/test_semantic_on_veto.py — item reports placement; verify no conftest cycle) ONLY. FORBIDDEN src, docs, tests/data/golden writes (hatch sole writer), baseline, child dotted-path imports. Red-test-exempt. COUNTS layer (direct calls, backend=_RecordingBackend kwarg): 1.0 preserves heuristic accepts, 0.0 vetoes them, brush-off count 0, one call per unique pair (memo-tuple hit). VERDICTS layer (walks default None->heuristic + subprocess sample run via tmp cache-hit asserting W9704 flips with no model load + no PYTEST_CURRENT_TEST leakage assert). Exactly one slow+with_real_api e2e SKELETON (skipped 'no model wired' until M4 go; on go, model-backend-wiring-v2 wires it). Modules <=500, no suppressions, never test linting. Verify: default suite passes (fake only, no network); skeleton skips; SEMANTIC=0 golden hash-equal.",
      "kind": "story",
      "milestoneId": "M4",
      "slug": "semantic-on-golden-pin-v2",
      "title": "Pin semantic-on veto path with fake backend (v2 rewired)"
    },
    {
      "deps": [
        "model-eval-poc",
        "decision-runtime-pinning",
        "decision-cache-refresh-wiring-v2",
        "semantic-on-golden-pin-v2",
        "semantic-test-doubles-dedup",
        "backend-loading-assumptions"
      ],
      "description": "Branches on U1 verdict + recorded human approvals via needs_human->steer workflow (reads Task Status steer answers at execution; absent/negative -> default NO-GO, no pause). GO (compliant model + allowlist + CPU bench + runtime-pinning family tag + steer approvals for license/Fastino + second-rater, answer IDs cited): owns _decision_backend.py/.pyi per-family loader ONLY (transformers ~60 | vendored-glide importlib pinned + GLIDE_MAX_BATCH=1 ~100 | other <=120; model_id per PROD_MODEL_ID_RE; failure->None->heuristic exactly-one warning) + pyproject [semantic] + uv.lock (single networked `uv lock`, then `uv sync --frozen` offline verify) + no_try_import patterns + test_decision_backend.py allowlist pins + test_no_try_import_checker.py + slow e2e skeleton wiring ONLY; FORBIDDEN _semantic/_base zero diff, decisions/, dispatch/CLI, tests/data, baseline, docs. NO-GO/BLOCKED/MISSING-APPROVAL: zero prod writes, no-op attestation citing verdict + blocker + approvals gap + I6 plan. Verify GO: slow e2e passes, default suite no network, SEMANTIC=0 golden hash-equal, lint 14/14; NO-GO: attestation + zero-diff proof.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "M4",
      "slug": "model-backend-wiring-v2",
      "title": "Wire production decision backend (or no-go attestation) (v2 rewired)"
    },
    {
      "deps": [
        "checker-harness-dedup",
        "semantic-test-doubles-dedup",
        "runner-test-helpers-dedup",
        "source-simplifications",
        "decision-cache-refresh-wiring-v2",
        "semantic-on-golden-pin-v2",
        "model-backend-wiring-v2",
        "pyi-scope-fix"
      ],
      "description": "Docs-only, sole writer in I5. Owns docs/semantic-justification.md (full rewrite, grep-zero 'reranker' case-insensitive) + custom-checks.md + troubleshooting.md (incl deprecated RERANKER_MODEL note + counts + pyi branch strings) + tutorials.md + AGENTS.md + README.md + CHANGELOG.md + config/ty.toml (GO names runtime; NO-GO empty-placeholder; grep-zero sentence_transformers) + ADR-013/015 verify + ADR-014/016 rewrite + ADR-009/002/011 staleness notes + README index 013-016 + 019-024 + NEW ADR-019..024 ONLY. FORBIDDEN src, tests, tests/data, baseline, tach.toml. Red-test-exempt. Counts from rerun actuals; exact-strings per M5 checklist with grep proof per row. Verify: docs-only diff; rumdl clean; no new failures; golden hash-equal.",
      "kind": "story",
      "milestoneId": "M5",
      "slug": "docs-adr-reconciliation-v2",
      "title": "Reconcile docs, ADRs, and version pins (v2 rewired)"
    },
    {
      "deps": [
        "source-simplifications",
        "decision-cache-refresh-wiring-v2",
        "semantic-on-golden-pin-v2",
        "model-backend-wiring-v2",
        "pyi-scope-fix"
      ],
      "description": "Sole tests/data/golden writer; FORBIDDEN all other paths. ONLY on reviewed shift report (justification-class + added/removed keys + CHANGELOG snippet + file:line) from behavior items: run PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally (never under CI), double-run byte-identical, key-by-key diff review matching shift reports, commit golden + tool counts together. If all declare no-shift: no-op attestation with hash equality. NEVER blind-regen. Verify: regen report with diff review or no-op attestation; integration + test_golden pass.",
      "kind": "story",
      "milestoneId": "M5",
      "slug": "golden-regen-hatch-v2",
      "title": "Conditional golden regen on shift reports (v2 rewired)"
    },
    {
      "deps": [
        "checker-harness-dedup",
        "semantic-test-doubles-dedup",
        "runner-test-helpers-dedup",
        "source-simplifications",
        "decision-cache-refresh-wiring-v2",
        "semantic-on-golden-pin-v2",
        "model-backend-wiring-v2",
        "pyi-scope-fix",
        "docs-adr-reconciliation-v2",
        "golden-regen-hatch-v2"
      ],
      "description": "Report-only, zero writes. Record final gate table at HEAD: format exit 0; lint 14/14 per-tool; pytest -q counts; integration 9-collected-0-failed; golden hash or regen diff; baseline []; docs exact-strings with INDEPENDENT rerun; :bash proof via git ls-files. Absolute green required (M5 only); red cells fail with routing to I6 follow-ups, never baseline edits. Feeds close-up.",
      "kind": "fact-finder",
      "milestoneId": "M5",
      "slug": "final-gate-validation-v2",
      "title": "Final gate table and docs check (v2 rewired)"
    }
  ],
  "assumptions": [
    {
      "assumption": "Material behavior = golden (SEMANTIC=0) + checker unit tests + CLI/exit codes + baseline/autofix semantics + shipped configs/scopes. Heuristic rejections material; model accept/reject never material pre-ship (dormant FakeBackend path). Tightening intentional when a compliant model ships with shift report + CHANGELOG + hatch regen.",
      "why": "Preserves I1/I2 operator-approved boundary; golden stays the mechanical contract; operator acknowledged tightening intentional, not a regression.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Dev/CI do not install [semantic]; gates run heuristic + cache hits (+ FakeBackend in tests). Real-model tests are slow + with_real_api (+ importorskip), never in default suite.",
      "why": "Matches current venv (I5 pack: extra empty, no torch); keeps gates offline, fast, deterministic."
    },
    {
      "assumption": "'Never test linting' bans pytest asserting this repo passes its own gates (subprocess re-lint, AST re-implementation, config re-checks). Golden/integration contracts retained; smoke disposition follows 644774e prune precedent.",
      "why": "Operator-approved in I1; removes gate-duplicating tests without deleting the fit-for-purpose contract.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Integration green = 9 collected, 0 failed (9 passed with pre-commit installed; 7 passed + 2 skipped with env + skip reasons cited without). AGENTS.md reconciled to recount at HEAD.",
      "why": "tests/integration.py dry_run/pre_commit skip without the binary; failed==0 is the invariant, skips are environmental."
    },
    {
      "assumption": "Gates green at I5 HEAD per pack (1357 passed / 9 passed / 14-tool lint exit 0 at 0944670); the 2026-11-07 infra baseline (red lint/test, ruff-format mutation) is superseded by I2/I4 fixes; items verify no-new-failures vs I5 HEAD recount, not vs stale infra baseline.",
      "why": "Avoids re-litigating fixed reds; closeup-4 + I5 pack prove green at HEAD."
    },
    {
      "assumption": "No child epics in I5; all work as 18 root items within the 50-item cap, file-level single-writer + dep serialization (ADR-023 extends ADR-013).",
      "why": "I3 epic gate caused 3 empty waves + zero delivery; I4 root-serialized delivery unblocked M2 verified + M3/M4 partials."
    },
    {
      "assumption": "Model license allowlist: Apache-2.0 / MIT / BSD-2/3-Clause allowed; CC-BY-NC-4.0 and other non-commercial excluded; Fastino Community + unclear/no-license flagged for human review; no model ships without a license verdict + human approval if Fastino recommended.",
      "why": "MIT tool cannot absorb non-commercial/unclear licensing; I5 bake-off needs the gating criterion before any verdict.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Iteration 5 may close infra-only again if U1 verdict is no-go/blocked (model swap NOT complete, must not be claimed). I6 triggers: double-rated corpus with independent second rater, human Fastino decision if GLiDE recommended, CPU bench pass.",
      "why": "ADR-009 no-go gating extended by ADR-020; operator must approve infra-only close-up if gates fail again.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Cache file location/name is .python-setup-decisions.json at the linted project root (next to lint.baseline), committed, no hatch entry, secrets-clean schema (verbatim justifications risk-accepted with refresh warning); weights in user model cache, never git.",
      "why": "Decisions depend on project content and must reproduce in that project's CI without the model; operator acknowledged root placement in I1; verbatim user content cannot be hex-free by construction.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Human gates resolve via needs_human report fields converted by the engine to steer/tousertoreview (items never write steer records — engine-managed). M4 GO reads Task Status steer answers at execution (allowed per status grounding) and cites answer IDs; absent/negative answers force default NO-GO attestation with no pause or retry wait; docs item records approval IDs from the wiring report.",
      "why": "Single-author corpus + copyleft/commercial license risk cannot self-approve; workflow keeps spikes report-only while making the gate checkable without pausing the iteration.",
      "disposition": "confirm with human"
    }
  ],
  "techDebt": [
    {
      "id": "TD5-B1",
      "description": "No compliant model proven (215/0 unevaluable, single-author labels, Fastino review open, no CPU bench).",
      "category": "blocking",
      "resolution": "U1 spikes (JSON-schema corpus handoff, re-validated eval with timeout/exclusion rules) + M4 branch (go only on license+CPU+corpus gates with recorded human approvals incl second rater; else no-op attestation + heuristic-only docs); per-family loader budgets + single networked lock step on go."
    },
    {
      "id": "TD5-B2",
      "description": "I4 cache producer gap (awareness: refresh prune-only until producer; decisions/ missing at HEAD so gap is unmerged, not live).",
      "category": "blocking",
      "resolution": "ADR-019 + decision-cache-impl owns storage + scored read API + checker-layer sidecar producer atomically (memo-tuple score reuse, single backend call); M3 acceptance requires end-to-end checker->sidecar->cache proof + hit/miss/absent table incl backend-uncalled proof; no split."
    },
    {
      "id": "TD5-I1",
      "description": "Pylint-pyi blind spot (42/43 findings on .py, latent private stub symbols, companion stubs unenforced per old probe).",
      "category": "impacting",
      "resolution": "pyi-scope-spike proves mechanism + path mapping on tmp + recounts at HEAD; M5 pyi-scope-fix owns strategy + stubs (+stubtest-required .py) with fix/orphan branch, bounded cleanup or I6 file list, hatch regen; orphan leaves stubtest-only gap (operator-aware per awareness-plan-5-orphan-enforcement-gap)."
    },
    {
      "id": "TD5-I2",
      "description": "Semantic-on behavior unpinned (golden + integration capture with SEMANTIC=0; model could change W9704/W9738 silently).",
      "category": "impacting",
      "resolution": "semantic-on-golden-pin adds direct-call count asserts + walk/subprocess verdict-delta asserts (no cross-process counts, no child dotted import) + slow skeleton (skipped until model); M4 wiring asserts no SEMANTIC=0 drift; golden stays SEMANTIC=0 per ADR-021."
    },
    {
      "id": "TD5-A1",
      "description": "Docs/ADR drift (semantic-justification, custom-checks, troubleshooting, tutorials, AGENTS.md counts/scope/pipeline, README, CHANGELOG, ty.toml, ADR-002/009/011/013/014/015/016 staleness, ADR index omits 013..016, 017/018 never merged).",
      "category": "adjacent",
      "resolution": "docs-adr-reconciliation sole writer with branch-aware exact-strings checklist (pyi FIX/ORPHAN strings, ty.toml per-branch text, reranker scoping); ADRs 013/015 verified, 014/016 rewritten, 019..024 formalize I5 decisions; 017/018 indexed as planned-unmerged superseded by ADR-019."
    },
    {
      "id": "TD5-A2",
      "description": "Test-harness duplication + dead code (13 _make_tc, 10 _walk_and_release, 8 _msg_ids, 3 _RecordingBackend, 2 _UvCallRecorder, 2 extra_block, 2 _semantic_disabled, dead helpers, vestigial cache tests, smoke overlap) + source placeholders (globals, per-call sets, rcfile dup, missing docstring).",
      "category": "adjacent",
      "resolution": "M2 items single-source with full signatures (+.pyi sync, open/source_roots semantics, _msg_ids pair, resolver with byte-identical proof) and conditional deletes with per-helper proof + survivor reasons; behavior identical."
    },
    {
      "id": "TD5-A3",
      "description": "Pre-existing tracked junk file ':bash' reported in I4 wave 6 (verify at HEAD via git ls-files) + minor version drift (pyproject 1.2.10 vs CHANGELOG v1.2.9).",
      "category": "adjacent",
      "resolution": "final-gate-validation proves presence/absence via git ls-files + scoped yamllint/detect-secrets gate-neutral evidence in-iteration; present-and-failing routes to I6 root-cleanup (operator delete); docs item pins versions."
    },
    {
      "id": "TD5-A4",
      "description": "Legacy .gitignore .cache/python-setup/semantic/ lines (retired machine cache) alongside new root decisions file.",
      "category": "adjacent",
      "resolution": "Retained intentionally (.cache still ignored; root decisions file committed; no hatch entry); cache-impl forbids .gitignore changes."
    }
  ],
  "adrs": [
    {
      "id": "ADR-019",
      "title": "Tracked-cache keying, scored read path, and refresh contract (I5)",
      "context": "ADR-010 freezes backend + tracked-cache contracts but leaves file-identity vs path-free API, key composition, score vs verdict, refresh shape, CI direction, isolation scope, sort key, prune policy, --path scoping, jobs>1 behavior unspecified (I5 pack Q3). semantic_check is deliberately path-free and memo-only (_semantic.py:28-65, bool|None hides float); callers pass no paths; no CLI surface; secrets baseline enables HexHighEntropyString while justifications are verbatim user content; writer-first verdict pins jobs=1 sequential; root tach.toml and config/tach.toml both list checkers/runner only; RunnerConfig has no refresh fields (types.py:48-60). I4 ADR-017/018 planned lint-flag refresh + decisions-module placement but never merged. I4 left a prune-only producer gap (awareness).",
      "decision": "Re-affirm ADR-017/018 shape with I5 resolutions: (1) _semantic gains semantic_score()->float|None (+.pyi, clamped [0,1]) + file-backed read branch; memo value becomes (score, decision) tuple (applied onto M2 dict shape via dep; _base/_decision_backend bodies zero diff); semantic_check thresholds the score (existing bool|None contract preserved). (2) semantic_check stays path-free re callers; file identity supplied at checker layer via refresh-only sidecar producer (suppression/bare-except emit when OBSERVE=1: {file via node.root().file, justification, rule, model, score via semantic_score memo reuse — single backend call, no heuristic duplication} to OBSERVE_PATH tmp *.jsonl, never committed; unset emits nothing). (3) Tracked key (justification normalized, rule joined codes, model '<id> rev <short12> prompt-vN'); context model-input-only. Store score + decision (re-thresholdable). Hit/miss/absent: rejected→False no read/backend; file-missing→None→heuristic True; entry-hit→persisted decision with backend-uncalled proof; key-miss→one backend call, memo only. (4) Refresh lint --refresh-decisions [--path ...] (setup-subcommand rejected); FAILS under CI/GITHUB_ACTIONS; DECISIONS_PATH test-only under PYTEST_CURRENT_TEST; production root config.cwd + traversal guard; sorted (rule, justification, model) indent=2 sort_keys; files union-merged POSIX; prune = scanned-scope-only missing removal + stale-model (model != refresh folded id) whole-entry drop + file-removal/drop-empty-entry (no --prune flag); --path retains unscanned; jobs_from_rcfile() over resolved pylint rcfiles, any >1 fails loudly naming file. (5) Placement decisions/ module; BOTH root tach.toml AND config/tach.toml gain [[modules]] decisions depends_on=[] + checkers/runner depends_on=[python_setup_lint.decisions]; cache-impl sole owner of both. (6) last-seen ISO date updated ONLY on score/decision/files change (byte-identical double-run holds). (7) Read-only = SHA-256 file-bytes hash (missing=sentinel) unchanged across ordinary run_lint. (8) Secrets: schema fields hex-free by construction (rev 12, prompt hash hexdigest[:12]); verbatim justification/rule MAY contain hex → refresh structlog-warns + docs risk-accept (same as source comments). RunnerConfig gains refresh_decisions: bool=False. No .gitignore change, no hatch entry.",
      "consequences": "Single contract for M1 format assumptions + M3 behavioral impl; storage + scored read + producer atomic in one item (checker->sidecar->cache proven on tmp, no prune-only gap, no bool-hiding drift); normal lint read-only provable by hash; deterministic serialization provable; secrets + tach (both files) scans clean; M3 tests assert hit/miss/absent + prune granularity + jobs guard on tmp."
    },
    {
      "id": "ADR-020",
      "title": "Model gating and default-off wiring for I5",
      "context": "Intent names GLiDE-0.4B or smaller; GLiDE is 0.4B/0.81GB bf16/CUDA-tested/torch 2.14/transformers 5.17/glide-vendored/Fastino Community License (commercial revenue gate + attribution + copyleft derivatives) vs MIT project; smallest-in-family so 'or smaller' needs a different family; ADR-009 corpus gate untouched (215/0 single-author, no corpus artifacts, no CPU bench); get_backend has no production path and news instances per call (_decision_backend.py:37-59); veto semantics mean default-on tightens W9704/W9738 for every consumer installing the extra; loader APIs differ per runtime family; uv.lock regen needs network.",
      "decision": "Gate wiring on U1 verdict with allowlist (Apache-2.0/MIT/BSD allowed; CC-BY-NC excluded; Fastino/unclear flagged) + CPU bench (cold-load/warm p50/p95 + RSS, GLIDE_MAX_BATCH=1 determinism) + corpus pilot (JSON-schema handoff, re-validated) + RECORDED HUMAN APPROVALS via needs_human->steer workflow (spikes emit needs_human report fields — never write steer records; engine converts; wiring reads Task Status steer answers at execution and cites IDs; absent/negative forces default NO-GO with no pause). PROD_MODEL_ID_RE + FAKE_ALLOWLIST + DECISION_MODEL_RE + malformed table per M1. Veto-only evaluation at 0.5/0.6/0.7; bars 90/95/85 on accepted stratum; smallest compliant or no-go. Wiring (on go + approvals only): per-family loader (transformers ~60 | vendored-glide ~100 | other <=120 lines), PROMPT_VERSION folded, failure→None→heuristic exactly-one warning (no retry storm), [semantic] pinned runtime only (CPU wheels, base stays light), allowlist pins (chosen top-level present, sentence-transformers absent, no unpinned git/URL deps, base dep set unchanged), no_try_import updated deliberately, single networked `uv lock` + `uv sync --frozen` offline verify. Default heuristic-only until M4 go merges; semantic-on pinned regardless. On no-go/blocked/missing-approval: zero prod writes, no-op attestation, heuristic-only docs.",
      "consequences": "No silent swap, no self-approved license/corpus gate, no unbudgeted loader work; gates stay offline/fast/deterministic except one documented lock step; close-up must not claim swap complete on no-go; I6 triggers explicit."
    },
    {
      "id": "ADR-021",
      "title": "Semantic-on behavior pinning",
      "context": "Golden + integration capture with SEMANTIC=0, so model-enabled W9704/W9738 outcomes unpinned; veto extremes deterministic without network; but _walk_and_release takes no backend, checkers pass no backend, get_backend() news instances per call, and pylint subprocess cwd lacks tests on PYTHONPATH — parent call-counts unobservable across run_lint and child dotted imports unprovable.",
      "decision": "Pin veto path in two layers with no unobservable asserts: (1) COUNTS via direct semantic_check_if_meaningful/semantic_score calls with backend=_RecordingBackend kwarg (public .pyi API, same process): 1.0 preserves, 0.0 vetoes, brush-off count 0, one call per unique pair (memo-tuple hit). (2) VERDICTS via walks (default None->heuristic, verdicts only) + subprocess sample-project run asserting verdict deltas via tmp cache-hit only (persisted False flips W9704 on, no model load, no PYTEST_CURRENT_TEST leakage); dotted-path import in child FORBIDDEN. Plus exactly one slow+with_real_api e2e SKELETON (skipped 'no model wired' until go; on go wired with importorskip + CPU budgets). Golden stays SEMANTIC=0 (heuristic contract); semantic-on contract lives in new tests.",
      "consequences": "Veto tightening visible before any model ships with only observable asserts; no PYTHONPATH proof burden; no golden churn for semantic-on; real-model coverage gated behind slow + importorskip; M4 wiring asserts no SEMANTIC=0 drift."
    },
    {
      "id": "ADR-022",
      "title": "Test-harness single-sourcing and debloat acceptance",
      "context": "Measured duplication at HEAD (13 _make_tc, 10 _walk_and_release with open()/source_roots/module_name variance incl structlog source_roots pattern, 8 _msg_ids as 7 set + 1 sorted-list, 3 _RecordingBackend, 2 _UvCallRecorder, 2 extra_block, 2 _semantic_disabled, dead helpers incl possibly-live sample_project fixture, vestigial raising=False cache tests, smoke overlapping integration + fake orchestration) vs behavior contracts (115-row heuristic table, W9704/W9738 checker tests, golden 158). testing.pyi must mirror testing.py or stubtest fails. 'Never test linting' defined only by 644774e precedent. No line-reduction metric beyond C0302/R0912/R0915 + empty baseline.",
      "decision": "Single-source with full signatures: _walk_and_release(..., open_checker=False, source_roots=None) with open semantics (config.source_roots = source_roots or ['src']; checker.open() before walk) + module_name passthrough; _msg_ids()->set + _msg_ids_sorted()->list; testing.pyi synced atomically; per-file migration table in report. Cmd_build gains _resolve_tool_rcfile(tool_key, config_paths, cwd, shipped) with byte-identical built-command proof (pylint migrates iff identical, else stays noted). Delete dead helpers only with per-helper grep-zero proof incl fixture-arg injection search (keep + document survivors). Rewrite (not loosen) vestigial cache tests to live hash/tmp contracts; smoke kept-narrowed (per-assert survivor analysis) or deleted with removal-to-survivor map; 115-row table + checker behavior + golden preserved byte-identical; touched modules <=500, no new suppressions. Acceptance is grep-zero/proof + no-new-failures + golden hash-equal, not line-count delta.",
      "consequences": "Debloat without intent loss or behavior change; no gate-duplicating tests reintroduced; future harness changes have single homes; QA verifies by grep + gates + stubtest, not LOC."
    },
    {
      "id": "ADR-023",
      "title": "Root-serialized delivery continued for I5",
      "context": "I3 epic gate stalled (retry + 3 empty waves, Blocked none, M2 zero delivery per closeup-3); I4 ADR-013 abandoned epics for root items with file-level single-writer + dep serialization, unblocking M2 verified + M3/M4 partials; I4 closeup shows 2 running + 3 pending carried by file ownership; review requires file-level proof, consumed (not advisory) spike verdicts, and joint ownership (M2 memo shape -> M3 memo tuple/read API) via deps.",
      "decision": "I5 ships no child epics; all work as 18 root items with file-level single-writer for parallel items plus dep serialization for handoffs (harness-dedup into semantic-doubles; matrix+corpus into eval into runtime-pinning; cache-contracts + source-simplifications into cache-impl into golden-pin into backend-wiring; loader-contracts into backend-wiring; pyi-spike + source-simplifications into pyi-fix; all behavior + debloat into docs; all behavior into hatch into gate table). No replanAfter gates; spike verdicts consumed via deps with pre-planned go/no-go and fix/orphan branches (no-op attestations on blocked, never invented alternatives). I6 may reintroduce epics or continue root increments.",
      "consequences": "8 dep-free wave-1 items avoid empty waves (eval + runtime-pinning + cache-impl + downstream dep-gated); no epic close-up/handoff bottleneck; M5 hatch consumes item shift declarations directly; parallel same-file forbidden, sequential same-file only via explicit deps; every assumption file has a consumer dep."
    },
    {
      "id": "ADR-024",
      "title": "Pylint-pyi scope resolution process",
      "context": "ADR-015 defers fix to I5; _PylintPyiLintTool passes .pyi paths but pylint lints companion .py (42/43 golden on .py per old probe); 205 latent private stub symbols; temp-tree rewrites src/... paths needing golden-key mapping; fixing changes golden + exposes cleanup (incl possible stubtest-required .py co-changes), conflicting with preservation unless staged via hatch; strategy fix vs scope note unknown at plan time; orphan-only leaves companion stubs style-unenforced (stubtest!=style, operator-aware).",
      "decision": "Resolve by spike then branch: M1 pyi-scope-spike reproduces companion-vs-orphan on tmp + pocs ONE mechanism (temp-tree/copy or no-companion mode) with broken-stub control + tmp-to-repo path-mapping table + recounts golden impact + latent budget at HEAD + recommends fix-with-regen (proven mechanism + mapping + cleanup budget + regen plan) vs orphan-only (scope-note text). M5 pyi-scope-fix consumes verdict (never invents alternative): FIX implements spike-proven mechanism with mapping applied before golden keys + shift report + stub cleanup (owns src/**/*.pyi + stubtest-required .py, enumerated; <=200 prod lines in-budget or I6 file-list routing, never baseline edits), golden via hatch only; ORPHAN-ONLY merges zero prod diff with scope-note text for docs. Branch-distinct docs strings grepped per verdict. 'Coding rules enforced' states the verified truth either way.",
      "consequences": "Golden stable unless fix merges via hatch; mechanism proven before commit; mapping keeps keys repo-relative; latent cleanup budgeted explicitly; I6 follow-ups concrete if over-budget; docs state scope truthfully."
    }
  ]
}

## Wave Report
{
  "blockedItems": [
    "semantic-tests-rewrite"
  ],
  "debt": [
    "Operator backlog (pre-existing): documented gate `uv run lint` is not check-only — its `ruff format` ToolSpec runs plain `ruff format` without --check/--config and silently rewrites files; declared gates work around it by splitting format/lint."
  ],
  "iteration": 5,
  "mergedItems": [],
  "recommendations": [
    "Retry or rescope `semantic-tests-rewrite` in the next wave; it is the only wave-5 item reported as blocked-by-failure.",
    "Operator: fix the `ruff format` ToolSpec (add --check + --config) or drop it from TOOLS so AGENTS.md/CONTRIBUTING's `uv run lint` stops mutating worktrees."
  ],
  "status": "has_failures",
  "summary": "Wave 5 close-up: no items reported merged; `semantic-tests-rewrite` is blocked-by-failure. Tree hygiene is clean: `git status` shows only the engine-managed `.factory/tasks/modernize/journal.ndjson` modified, zero untracked files (excluding ignored), and no merge-conflict markers in src/tests/config/docs/scripts. Gate diff vs baseline shows zero regressions and two improvements: format pass/pass (green), lint fail->pass IMPROVED, test fail->pass IMPROVED, test-integration pass/pass (green). All 4 gates are green now; baseline red causes (6 unit-test failures assuming 13 tools vs 14, and lint SIM102/W9704/R0914/C0208 violations) no longer fail.",
  "wave": 5
}

Discarded amendments (re-decide within the amendment budget):
- discarded amendment (wave 4): PM amend output invalid after resumed repair: Total items (52) exceeds maximum items limit of 50

Stranded items resumed this iteration (prior iteration closed mid-flow):
- stranded item re-queued: cache-design-spike (was pending after step ?, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: checkers-legacy-dead-cleanup (was pending after step ?, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: checkers-stream-helper (was running after step integrate, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: coding-rules-audit (was pending after step ?, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: coding-rules-audit-v2 (was pending after step ?, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: consolidate-integration-helpers-v2 (was ready after step review, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: consolidate-integration-helpers-v3 (was ready after step review, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: decision-cache-impl (was running after step qa, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: docs-counts-sync (was pending after step ?, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: docs-reconciliation (was pending after step ?, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: epic-kickoff-gate (was pending after step ?, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: epic-shift-report-collection (was pending after step ?, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: final-gate-validation (was pending after step ?, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: golden-regen-hatch (was pending after step ?, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: ownership-map-revalidation (was running after step review, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: pylint-cache-assumptions (was running after step develop, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: secrets-triage-spike (was running after step review, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: semantic-tests-rewrite (was pending after step ?, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: test-debloat-audit (was pending after step ?, stranded from iteration 4; branch/records preserved, fix round resumes)
- stranded item re-queued: test-debloat-audit-v2 (was pending after step ?, stranded from iteration 4; branch/records preserved, fix round resumes)

## Tech Debt
# Architect brief — task: modernize iteration: 5
Read full detail from file paths under the task dir; entries are relevance-ordered for this step.
- [wave:wave-5.4.yaml] waves: complete merged=[(none)] failed=[(none)] blocked=[(none)] — Wave 4 completed. Merged items: Failed items: decision-cache-impl | waves/wave-5.4.yaml
- [wave:wave-5.3.yaml] waves: complete merged=[(none)] failed=[(none)] blocked=[(none)] — Wave 3 completed. Merged items: | waves/wave-5.3.yaml
- [wave:wave-5.2.yaml] waves: complete merged=[(none)] failed=[(none)] blocked=[(none)] — Wave 2 completed. Merged items: | waves/wave-5.2.yaml
- [wave:wave-5.1.yaml] waves: complete merged=[(none)] failed=[(none)] blocked=[(none)] — Wave 1 completed. Merged items: Failed items: ownership-map-revalidation, pylint-cache-assumptions | waves/wave-5.1.yaml
- [plan:plan-5.1.yaml] plan: milestones [M1: Test infrastructure and decision contracts first; M2: Test harness and source debloat (behavior-preserving…] | plan/plan-5.1.yaml
- [plan:plan-5.yaml] plan: milestones [M1: Test infrastructure and decision contracts first; M2: Test harness and source debloat (behavior-preserving…] | plan/plan-5.yaml
- [plan:edits-5.0.yaml] plan: scheduled [] | plan/edits-5.0.yaml
- [plan:edits-5.yaml] plan: scheduled [] | plan/edits-5.yaml
- [closeup:closeup-4.yaml] closeup: next-iteration — Iteration 4 partially delivered: M1/M2 VERIFIED (secrets filter, factories splits <=500, threshold deduped + SEMANTIC=0 guards, baseline 2x<… | closeup-4.yaml
- [decision:024-item-decision-cache-impl-abandon.yaml] decisions: abandon: Consult budget exhausted with no progress; abandoning item so the wave gate absorbs it as failed | decisions/024-item-decision-cache-impl-abandon.yaml
- [decision:020-item-decision-cache-impl-1.yaml] decisions: escalate: Fix export consistency then prove red/green: ensure src/python_setup_lint/decisions/_decision_cache.py defines and exports refresh_blockers … | decisions/020-item-decision-cache-impl-1.yaml
- [decision:012-item-decision-cache-impl.yaml] decisions: retry-with-guidance: Fix import consistency with zero scope creep (forbidden _base/_semantic/_decision_backend, dispatch*/__init__/baseline/parsers, tests/data, … | decisions/012-item-decision-cache-impl.yaml
- [decision:027-item-checkers-stream-helper-10.yaml] decisions: escalate: Fresh HEAD base; re-apply owned-only 12 paths: NEW _source_stream.py/.pyi, bare_except, suppression+.pyi with '_, comment' plus src_line.spl… | decisions/027-item-checkers-stream-helper-10.yaml
- [decision:026-item-checkers-stream-helper-9.yaml] decisions: retry-with-guidance: Fresh HEAD worktree from engine; re-apply ONLY 12 owned paths (8 prod: NEW _source_stream.py/.pyi, bare_except, suppression+.pyi with '_, co… | decisions/026-item-checkers-stream-helper-9.yaml
- [decision:025-item-checkers-stream-helper-8.yaml] decisions: escalate: Fresh HEAD base; re-apply owned-only: NEW _source_stream.py/.pyi, bare_except+suppression (+.pyi, first-# src_line.split preserved), stub ch… | decisions/025-item-checkers-stream-helper-8.yaml
- [decision:013-item-ownership-map-revalidation-abandon.yaml] decisions: abandon: Consult budget exhausted with no progress; abandoning item so the wave gate absorbs it as failed | decisions/013-item-ownership-map-revalidation-abandon.yaml
- [decision:015-item-pylint-cache-assumptions-abandon.yaml] decisions: abandon: Consult budget exhausted with no progress; abandoning item so the wave gate absorbs it as failed | decisions/015-item-pylint-cache-assumptions-abandon.yaml
- [decision:011-item-checkers-stream-helper.yaml] decisions: retry-with-guidance: Retry merge verification with zero content changes. Keep resolved tests/checkers/test_suppression_justification_checker.py as-is (both new c… | decisions/011-item-checkers-stream-helper.yaml
- [concern:c-89f3cb5a77.yaml] concerns: risk / medium: decision-cache-impl failed and was abandoned; needs replan | concerns/c-89f3cb5a77.yaml
- [debt:plan-5.1.yaml:TD5-B1] debt: [blocking] No compliant model proven (215/0 unevaluable, single-author labels, Fastino review open, no CPU bench). | plan/plan-5.1.yaml
- [debt:plan-5.1.yaml:TD5-B2] debt: [blocking] I4 cache producer gap (awareness: refresh prune-only until producer; decisions/ missing at HEAD so gap is unmerged, not live). | plan/plan-5.1.yaml
- [debt:plan-5.1.yaml:TD5-I1] debt: [impacting] Pylint-pyi blind spot (42/43 findings on .py, latent private stub symbols, companion stubs unenforced per old probe). | plan/plan-5.1.yaml
- [debt:plan-5.1.yaml:TD5-I2] debt: [impacting] Semantic-on behavior unpinned (golden + integration capture with SEMANTIC=0; model could change W9704/W9738 silently). | plan/plan-5.1.yaml
- [debt:plan-5.1.yaml:TD5-A1] debt: [adjacent] Docs/ADR drift (semantic-justification, custom-checks, troubleshooting, tutorials, AGENTS.md counts/scope/pipeline, README, CHANGELOG, ty.to… | plan/plan-5.1.yaml
- [debt:plan-5.1.yaml:TD5-A2] debt: [adjacent] Test-harness duplication + dead code (13 _make_tc, 10 _walk_and_release, 8 _msg_ids, 3 _RecordingBackend, 2 _UvCallRecorder, 2 extra_block, … | plan/plan-5.1.yaml
- [steer:awareness-plan-5-infra-only-close] steer: [human-awareness] ref=plan-5: No-go/blocked + missing approvals force cache+pinning+docs only ([semantic] stays empty, pyproject.toml:28); I6 needs second rater + Fastino… | steer/tousertoreview/awareness-plan-5-infra-only-close.yaml
- [steer:awareness-plan-5-orphan-enforcement-gap] steer: [human-awareness] ref=plan-5: ORPHAN (stubtest-only, pyi-underscore orphan-only) leaves ~205 latent symbols + 42/43 findings unenforced; FIX needs temp-tree+cleanup+regen… | steer/tousertoreview/awareness-plan-5-orphan-enforcement-gap.yaml
- [steer:awareness-decision-cache-impl-cli-refresh-prune-only-until-producer] steer: [human-awareness] ref=decision-cache-impl: run_decision_refresh calls refresh(observed=()) because the checker-side observation producer is forbidden in this item (_semantic/_decision… | steer/tousertoreview/awareness-decision-cache-impl-cli-refresh-prune-only-until-producer.yaml
- [item:decision-cache-impl] items: dev wave=4 status=failed branch=topic/modernize--decision-cache-impl — Implement tracked decision cache and refresh | items/decision-cache-impl/assignment.yaml
- [item:checkers-stream-helper] items: no-behavior wave=2 status=running branch=topic/modernize--checkers-stream-helper — Single-source stream read/decode helper | items/checkers-stream-helper/assignment.yaml
- [item:semantic-tests-rewrite] items: test-only wave=5 status=pending branch=topic/modernize--semantic-tests-rewrite — Rewrite semantic tests and docs (no AGENTS) | items/semantic-tests-rewrite/assignment.yaml
- [item:test-debloat-audit] items: fact-finder wave=5 status=pending branch=topic/modernize--test-debloat-audit — Inventory redundant and lint-testing tests | items/test-debloat-audit/assignment.yaml
- [item:coding-rules-audit] items: fact-finder wave=4 status=pending branch=topic/modernize--coding-rules-audit — Inventory CodingRules violations | items/coding-rules-audit/assignment.yaml
- [item:docs-reconciliation] items: no-behavior wave=6 status=pending branch=topic/modernize--docs-reconciliation — Reconcile docs counts and versions | items/docs-reconciliation/assignment.yaml
- [item:final-gate-validation] items: fact-finder wave=5 status=pending branch=topic/modernize--final-gate-validation — Final gate table and docs reconciliation check | items/final-gate-validation/assignment.yaml
- [item:cache-design-spike] items: poc wave=3 status=pending branch=topic/modernize--cache-design-spike — Tracked cache schema and determinism prototype | items/cache-design-spike/assignment.yaml
- [item:checkers-legacy-dead-cleanup] items: no-behavior wave=3 status=pending branch=topic/modernize--checkers-legacy-dead-cleanup — Rename legacy scan and remove dead compat | items/checkers-legacy-dead-cleanup/assignment.yaml
- [item:golden-regen-hatch] items: test-only wave=4 status=pending branch=topic/modernize--golden-regen-hatch — Conditional golden regen on reviewed shift report | items/golden-regen-hatch/assignment.yaml
- [item:docs-counts-sync] items: dev wave=12 status=pending branch=topic/modernize--docs-counts-sync — Sync AGENTS.md counts and cli help to 14-tool world | items/docs-counts-sync/assignment.yaml
- [item:consolidate-integration-helpers-v3] items: test-only wave=11 status=ready branch=topic/modernize--consolidate-integration-helpers-v3 — Single-source helpers; integration.py under 500 lines | items/consolidate-integration-helpers-v3/assignment.yaml
- [item:consolidate-integration-helpers-v2] items: test-only wave=8 status=ready branch=topic/modernize--consolidate-integration-helpers-v2 — Single-source helpers; integration.py under 500 lines | items/consolidate-integration-helpers-v2/assignment.yaml
- [item:test-debloat-audit-v2] items: fact-finder wave=10 status=pending branch=topic/modernize--test-debloat-audit-v2 — Inventory redundant and lint-testing tests | items/test-debloat-audit-v2/assignment.yaml
- [item:coding-rules-audit-v2] items: fact-finder wave=9 status=pending branch=topic/modernize--coding-rules-audit-v2 — Inventory CodingRules violations | items/coding-rules-audit-v2/assignment.yaml
- [item:epic-kickoff-gate] items: fact-finder wave=2 status=pending branch=topic/modernize--epic-kickoff-gate — Epic kickoff and ownership-dispute gate | items/epic-kickoff-gate/assignment.yaml
- [item:epic-shift-report-collection] items: fact-finder wave=3 status=pending branch=topic/modernize--epic-shift-report-collection — Consolidate epic shift reports into handoff record | items/epic-shift-report-collection/assignment.yaml
- [item:never-test-linting-prune] items: test-only wave=4 status=merged branch=topic/modernize--never-test-linting-prune — Prune gate-duplicating tests with survivors | items/never-test-linting-prune/assignment.yaml
- [item:golden-snapshot-wiring] items: dev wave=7 status=merged branch=topic/modernize--golden-snapshot-wiring — Commit golden files and wire integration capture | items/golden-snapshot-wiring/assignment.yaml
- [item:decision-backend-impl] items: dev wave=2 status=merged branch=topic/modernize--decision-backend-impl — Implement veto DecisionBackend with FakeBackend | items/decision-backend-impl/assignment.yaml

## Steering Directives
# Architect brief — task: modernize iteration: 5
Read full detail from file paths under the task dir; entries are relevance-ordered for this step.
- [wave:wave-5.4.yaml] waves: complete merged=[(none)] failed=[(none)] blocked=[(none)] — Wave 4 completed. Merged items: Failed items: decision-cache-impl | waves/wave-5.4.yaml
- [wave:wave-5.3.yaml] waves: complete merged=[(none)] failed=[(none)] blocked=[(none)] — Wave 3 completed. Merged items: | waves/wave-5.3.yaml
- [wave:wave-5.2.yaml] waves: complete merged=[(none)] failed=[(none)] blocked=[(none)] — Wave 2 completed. Merged items: | waves/wave-5.2.yaml
- [wave:wave-5.1.yaml] waves: complete merged=[(none)] failed=[(none)] blocked=[(none)] — Wave 1 completed. Merged items: Failed items: ownership-map-revalidation, pylint-cache-assumptions | waves/wave-5.1.yaml
- [plan:plan-5.1.yaml] plan: milestones [M1: Test infrastructure and decision contracts first; M2: Test harness and source debloat (behavior-preserving…] | plan/plan-5.1.yaml
- [plan:plan-5.yaml] plan: milestones [M1: Test infrastructure and decision contracts first; M2: Test harness and source debloat (behavior-preserving…] | plan/plan-5.yaml
- [plan:edits-5.0.yaml] plan: scheduled [] | plan/edits-5.0.yaml
- [plan:edits-5.yaml] plan: scheduled [] | plan/edits-5.yaml
- [closeup:closeup-4.yaml] closeup: next-iteration — Iteration 4 partially delivered: M1/M2 VERIFIED (secrets filter, factories splits <=500, threshold deduped + SEMANTIC=0 guards, baseline 2x<… | closeup-4.yaml
- [decision:024-item-decision-cache-impl-abandon.yaml] decisions: abandon: Consult budget exhausted with no progress; abandoning item so the wave gate absorbs it as failed | decisions/024-item-decision-cache-impl-abandon.yaml
- [decision:020-item-decision-cache-impl-1.yaml] decisions: escalate: Fix export consistency then prove red/green: ensure src/python_setup_lint/decisions/_decision_cache.py defines and exports refresh_blockers … | decisions/020-item-decision-cache-impl-1.yaml
- [decision:012-item-decision-cache-impl.yaml] decisions: retry-with-guidance: Fix import consistency with zero scope creep (forbidden _base/_semantic/_decision_backend, dispatch*/__init__/baseline/parsers, tests/data, … | decisions/012-item-decision-cache-impl.yaml
- [decision:027-item-checkers-stream-helper-10.yaml] decisions: escalate: Fresh HEAD base; re-apply owned-only 12 paths: NEW _source_stream.py/.pyi, bare_except, suppression+.pyi with '_, comment' plus src_line.spl… | decisions/027-item-checkers-stream-helper-10.yaml
- [decision:026-item-checkers-stream-helper-9.yaml] decisions: retry-with-guidance: Fresh HEAD worktree from engine; re-apply ONLY 12 owned paths (8 prod: NEW _source_stream.py/.pyi, bare_except, suppression+.pyi with '_, co… | decisions/026-item-checkers-stream-helper-9.yaml
- [decision:025-item-checkers-stream-helper-8.yaml] decisions: escalate: Fresh HEAD base; re-apply owned-only: NEW _source_stream.py/.pyi, bare_except+suppression (+.pyi, first-# src_line.split preserved), stub ch… | decisions/025-item-checkers-stream-helper-8.yaml
- [decision:013-item-ownership-map-revalidation-abandon.yaml] decisions: abandon: Consult budget exhausted with no progress; abandoning item so the wave gate absorbs it as failed | decisions/013-item-ownership-map-revalidation-abandon.yaml
- [decision:015-item-pylint-cache-assumptions-abandon.yaml] decisions: abandon: Consult budget exhausted with no progress; abandoning item so the wave gate absorbs it as failed | decisions/015-item-pylint-cache-assumptions-abandon.yaml
- [decision:011-item-checkers-stream-helper.yaml] decisions: retry-with-guidance: Retry merge verification with zero content changes. Keep resolved tests/checkers/test_suppression_justification_checker.py as-is (both new c… | decisions/011-item-checkers-stream-helper.yaml
- [concern:c-89f3cb5a77.yaml] concerns: risk / medium: decision-cache-impl failed and was abandoned; needs replan | concerns/c-89f3cb5a77.yaml
- [debt:plan-5.1.yaml:TD5-B1] debt: [blocking] No compliant model proven (215/0 unevaluable, single-author labels, Fastino review open, no CPU bench). | plan/plan-5.1.yaml
- [debt:plan-5.1.yaml:TD5-B2] debt: [blocking] I4 cache producer gap (awareness: refresh prune-only until producer; decisions/ missing at HEAD so gap is unmerged, not live). | plan/plan-5.1.yaml
- [debt:plan-5.1.yaml:TD5-I1] debt: [impacting] Pylint-pyi blind spot (42/43 findings on .py, latent private stub symbols, companion stubs unenforced per old probe). | plan/plan-5.1.yaml
- [debt:plan-5.1.yaml:TD5-I2] debt: [impacting] Semantic-on behavior unpinned (golden + integration capture with SEMANTIC=0; model could change W9704/W9738 silently). | plan/plan-5.1.yaml
- [debt:plan-5.1.yaml:TD5-A1] debt: [adjacent] Docs/ADR drift (semantic-justification, custom-checks, troubleshooting, tutorials, AGENTS.md counts/scope/pipeline, README, CHANGELOG, ty.to… | plan/plan-5.1.yaml
- [debt:plan-5.1.yaml:TD5-A2] debt: [adjacent] Test-harness duplication + dead code (13 _make_tc, 10 _walk_and_release, 8 _msg_ids, 3 _RecordingBackend, 2 _UvCallRecorder, 2 extra_block, … | plan/plan-5.1.yaml
- [steer:awareness-plan-5-infra-only-close] steer: [human-awareness] ref=plan-5: No-go/blocked + missing approvals force cache+pinning+docs only ([semantic] stays empty, pyproject.toml:28); I6 needs second rater + Fastino… | steer/tousertoreview/awareness-plan-5-infra-only-close.yaml
- [steer:awareness-plan-5-orphan-enforcement-gap] steer: [human-awareness] ref=plan-5: ORPHAN (stubtest-only, pyi-underscore orphan-only) leaves ~205 latent symbols + 42/43 findings unenforced; FIX needs temp-tree+cleanup+regen… | steer/tousertoreview/awareness-plan-5-orphan-enforcement-gap.yaml
- [steer:awareness-decision-cache-impl-cli-refresh-prune-only-until-producer] steer: [human-awareness] ref=decision-cache-impl: run_decision_refresh calls refresh(observed=()) because the checker-side observation producer is forbidden in this item (_semantic/_decision… | steer/tousertoreview/awareness-decision-cache-impl-cli-refresh-prune-only-until-producer.yaml
- [item:decision-cache-impl] items: dev wave=4 status=failed branch=topic/modernize--decision-cache-impl — Implement tracked decision cache and refresh | items/decision-cache-impl/assignment.yaml
- [item:checkers-stream-helper] items: no-behavior wave=2 status=running branch=topic/modernize--checkers-stream-helper — Single-source stream read/decode helper | items/checkers-stream-helper/assignment.yaml
- [item:semantic-tests-rewrite] items: test-only wave=5 status=pending branch=topic/modernize--semantic-tests-rewrite — Rewrite semantic tests and docs (no AGENTS) | items/semantic-tests-rewrite/assignment.yaml
- [item:test-debloat-audit] items: fact-finder wave=5 status=pending branch=topic/modernize--test-debloat-audit — Inventory redundant and lint-testing tests | items/test-debloat-audit/assignment.yaml
- [item:coding-rules-audit] items: fact-finder wave=4 status=pending branch=topic/modernize--coding-rules-audit — Inventory CodingRules violations | items/coding-rules-audit/assignment.yaml
- [item:docs-reconciliation] items: no-behavior wave=6 status=pending branch=topic/modernize--docs-reconciliation — Reconcile docs counts and versions | items/docs-reconciliation/assignment.yaml
- [item:final-gate-validation] items: fact-finder wave=5 status=pending branch=topic/modernize--final-gate-validation — Final gate table and docs reconciliation check | items/final-gate-validation/assignment.yaml
- [item:cache-design-spike] items: poc wave=3 status=pending branch=topic/modernize--cache-design-spike — Tracked cache schema and determinism prototype | items/cache-design-spike/assignment.yaml
- [item:checkers-legacy-dead-cleanup] items: no-behavior wave=3 status=pending branch=topic/modernize--checkers-legacy-dead-cleanup — Rename legacy scan and remove dead compat | items/checkers-legacy-dead-cleanup/assignment.yaml
- [item:golden-regen-hatch] items: test-only wave=4 status=pending branch=topic/modernize--golden-regen-hatch — Conditional golden regen on reviewed shift report | items/golden-regen-hatch/assignment.yaml
- [item:docs-counts-sync] items: dev wave=12 status=pending branch=topic/modernize--docs-counts-sync — Sync AGENTS.md counts and cli help to 14-tool world | items/docs-counts-sync/assignment.yaml
- [item:consolidate-integration-helpers-v3] items: test-only wave=11 status=ready branch=topic/modernize--consolidate-integration-helpers-v3 — Single-source helpers; integration.py under 500 lines | items/consolidate-integration-helpers-v3/assignment.yaml
- [item:consolidate-integration-helpers-v2] items: test-only wave=8 status=ready branch=topic/modernize--consolidate-integration-helpers-v2 — Single-source helpers; integration.py under 500 lines | items/consolidate-integration-helpers-v2/assignment.yaml
- [item:test-debloat-audit-v2] items: fact-finder wave=10 status=pending branch=topic/modernize--test-debloat-audit-v2 — Inventory redundant and lint-testing tests | items/test-debloat-audit-v2/assignment.yaml
- [item:coding-rules-audit-v2] items: fact-finder wave=9 status=pending branch=topic/modernize--coding-rules-audit-v2 — Inventory CodingRules violations | items/coding-rules-audit-v2/assignment.yaml
- [item:epic-kickoff-gate] items: fact-finder wave=2 status=pending branch=topic/modernize--epic-kickoff-gate — Epic kickoff and ownership-dispute gate | items/epic-kickoff-gate/assignment.yaml
- [item:epic-shift-report-collection] items: fact-finder wave=3 status=pending branch=topic/modernize--epic-shift-report-collection — Consolidate epic shift reports into handoff record | items/epic-shift-report-collection/assignment.yaml
- [item:never-test-linting-prune] items: test-only wave=4 status=merged branch=topic/modernize--never-test-linting-prune — Prune gate-duplicating tests with survivors | items/never-test-linting-prune/assignment.yaml
- [item:golden-snapshot-wiring] items: dev wave=7 status=merged branch=topic/modernize--golden-snapshot-wiring — Commit golden files and wire integration capture | items/golden-snapshot-wiring/assignment.yaml
- [item:decision-backend-impl] items: dev wave=2 status=merged branch=topic/modernize--decision-backend-impl — Implement veto DecisionBackend with FakeBackend | items/decision-backend-impl/assignment.yaml

## Context Pack
# Context Pack — `modernize` (iteration 5 starting state)

**Repository**: `python-setup` v1.2.10 (`pyproject.toml:1-4`), Python `>=3.14`, MIT (`pyproject.toml:19-20`). Worktree `topic/modernize`, HEAD `0944670`.

**Gates verified in this worktree on 2026-11-09** (read-only execution):

| Gate | Result | Evidence |
|---|---|---|
| `uv run pytest -q` | 1357 passed, 7 deselected, 4 warnings, 26.6 s | default collection does **not** include `tests/integration.py` (filename is not `test_*.py`) |
| `uv run pytest tests/integration.py -v` | 9 passed, 56.6 s | run explicitly per AGENTS/README |
| `uv run lint` | exit 0, all 14 tools PASSED, 57.7 s | `lint.baseline` is `[]` (`lint.baseline:1`) |

**Intent status at a glance**

| Intent clause | State at HEAD | Primary evidence |
|---|---|---|
| Enforce `CodingRules.md` / `AGENTS.md` | Mostly done; lint gates green, but docs/ADR drift and some dead placeholders remain | `lint.baseline:1`; `AGENTS.md:9-11`, `AGENTS.md:79-85`; `docs/adr/ADR-016.md:1-5` |
| Debloat code and tests; keep test intent | Partially done (recent prune removed self-lint/config-consistency tests); concrete duplication and dead helpers remain | §4.4 below; `tests/checkers/test_tmp_path_checker.py:19-32`; `tests/runner/_factories.py:167,200`; `tests/runner/test_real_pipeline_smoke.py:1-42` |
| Replace embedding/rerank justification check with a CPU-friendly small decision model | **Half done**: reranker is gone and the veto backend protocol exists, but no production model is wired and no optional dependency ships | `src/python_setup_lint/checkers/_semantic.py:1-65`; `src/python_setup_lint/checkers/_decision_backend.py:37-59`; `pyproject.toml:28-30`; `tests/checkers/test_semantic_check.py:119-123` |
| Keep a git-stored cache with cleanup | **Not implemented**: only a process-local memo exists; no `.python-setup-decisions.json`, refresh path, or pruning | `src/python_setup_lint/checkers/_semantic.py:15-25,47-64`; `tests/assumptions/test_pylint_cache_semantics.py:8-12`; `docs/adr/ADR-010.md:26-36` |
| Preserve every material lint/check behavior | Green at HEAD; golden pins 158 findings including 18 W9704, but semantic is disabled during golden capture | `tests/data/golden/minimal_sample_project_findings.json`; `tests/integration.py:110-129`; `tests/_golden.py:54` |

---

## 1. Module Map

### 1.1 Semantic justification subsystem (primary intent area)

| Path | Responsibility | Key lines |
|---|---|---|
| `src/python_setup_lint/checkers/_decision_backend.py` | `DecisionBackend` protocol, `FakeBackend`, test-only dotted-path loader, `get_backend()`, pinned threshold/prompt constants, warn-once state | `:10-13`, `:16-30`, `:37-59` |
| `src/python_setup_lint/checkers/_decision_backend.pyi` | Public stub: `DECISION_THRESHOLD`, `PROMPT_VERSION`, protocol, `FakeBackend`, `get_backend` | `:1-20` |
| `src/python_setup_lint/checkers/_semantic.py` | Thin adapter: resolves backend, computes SHA-256 cache key, applies `>= DECISION_THRESHOLD`, owns in-memory memo | `:1-65` |
| `src/python_setup_lint/checkers/_semantic.pyi` | Stub documenting the adapter contract | `:1-23` |
| `src/python_setup_lint/checkers/_base.py` | `normalize_suppressed_codes`, heuristic-first `check_if_meaningful`, env gate, lazy `_semantic` import | `:145-156`, `:159-252` |
| `src/python_setup_lint/checkers/conformance/suppression_justification_checker.py` | W9704 `unjustified-suppression`: scans suppression comments and `Any` annotations, calls `check_if_meaningful` | `:33-41`, `:63-91`, `:136-162`, `:330-388` |
| `src/python_setup_lint/checkers/conformance/bare_except_comment_checker.py` | W9738 `bare-except-comment`, second consumer of `check_if_meaningful` | `:14`, `:103-118` |
| `docs/semantic-justification.md` | Current *stale* narrative of the reranker pipeline and caches | `:1-62` |
| `docs/custom-checks.md` | Checker-authoring guide; semantic helper description stale | `:97`, `:104` |

### 1.2 Checker subsystem

| Path | Responsibility | Key lines |
|---|---|---|
| `src/python_setup_lint/checkers/conformance/` | Conformance checkers: beartype, no-try-import, tmp-path, structlog, suppression justification, bare-except, missing error-chain, silent-except, generic-key-dict, unnamed-tuple-dict, trivial-wrapper, redundant-type-guard, pyi-underscore, missing-return-annotation, asyncio-timeout | directory listing |
| `src/python_setup_lint/checkers/stub/` | Stub fidelity/coverage/docstring checkers and annotation normalizer | `checker.py`, `coverage.py`, `docstring_checker.py`, `normalizer.py`, `fidelity/*` |
| `config/.pylintrc` | Source-code rcfile; enables custom rules and `max-module-lines=500`, `max-statements=65`, `max-branches=16` | `:2`, `:17`, `:19`, `:22-23` |
| `config/.pylintrc-pyi` | Stub-file rcfile | `:12-13` |
| `config/.pylintrc-tests` | Test-file ruleset (production-only rules disabled; W9704/W9702 still enabled) | `:20`, `:37`, `:39`, `:42-47` |

### 1.3 Runner subsystem

| Path | Responsibility | Key lines |
|---|---|---|
| `src/python_setup_lint/runner/_tool_specs.py` | Single-source 14 built-in `ToolSpec` entries | `:9-100`, `:102` |
| `src/python_setup_lint/runner/dispatch.py` | Tool strategy registry, command builders, autofix ordering, baseline fallback | `:62-359`, `:350-359` |
| `src/python_setup_lint/runner/cli.py` | CLI, tool selection, skip reasons, serial pipeline, `run_lint` | `:110-201`, `:204-...`, argument parser `:280-366` |
| `src/python_setup_lint/runner/baseline.py` | Baseline diff/merge and fallback inspection | module |
| `src/python_setup_lint/runner/parsers.py`, `_record_parsers.py` | Output parsers (JSON, regex, record parsers) | modules |
| `src/python_setup_lint/runner/_autofix.py` | Autofix conflict detection and staged/unstaged handling | module |
| `src/python_setup_lint/runner/_config.py`, `cmd_build.py` | Config discovery and command composition | modules |
| `src/python_setup_lint/runner/types.py` | `ToolSpec`, `LintResult`, `RunnerConfig`, `ViolationCount` | `:12-22`, `:25-59` |

### 1.4 Setup / packaging / test helpers

| Path | Responsibility | Key lines |
|---|---|---|
| `src/python_setup_lint/setup.py` | `install()` / `main()`: dependency step, pylint plugin registration, config symlinks, state/checksums | `:41-56`, `:149-205`, `:223-290`, `:318-364` |
| `src/python_setup_lint/_setup_pyproject.py` | TOML read/write, pylint load-plugins, dev-dependency detection (extras stripped) | `:19-97` |
| `src/python_setup_lint/_setup_precommit.py` | Pre-commit config and AGENTS snippet generation/atomic writes | `:70-...` |
| `src/python_setup_lint/_setup_update.py` | Drift detection + `uv add --refresh-package` update flow | `:11-...` |
| `src/python_setup_lint/testing.py` | Shared `_make_tc` / `_walk_and_release`, lint-runner fakes, consumer health checks | `:18-38`, `:44-103`, `:115-196` |
| `pyproject.toml` | Package metadata, empty `[semantic]` extra, pytest markers (`not slow` default) | `:1-4`, `:28-30`, `:47-54` |
| `uv.lock` | Locked dependencies; root provides `semantic` extra, currently empty | `:573-623` |
| `.gitignore` | Generated consumer artifacts; legacy semantic model cache ignored | `:222-244` |

### 1.5 Documentation / decision register

| Path | Responsibility | Key lines / state |
|---|---|---|
| `CodingRules.md` | Shipped coding rules: typing, `.pyi`, simplification, complexity, tests | `:1-75`, `:90-159`, `:230-307` |
| `AGENTS.md` | Agent entry point: commands, tool scope, pipeline, test strategy | `:5-14`, `:16-32`, `:79-93` |
| `docs/adr/README.md` | ADR index — **omits ADR-013…ADR-016** | `:16-31` |
| `docs/adr/ADR-009.md` | Accepted no-go-gated deferral for the model | `:1-48` |
| `docs/adr/ADR-010.md` | Frozen backend + tracked-cache contracts | `:1-52` |
| `docs/adr/ADR-014.md` | Heuristic-first veto semantics (now implemented; text stale) | `:1-5` |
| `docs/adr/ADR-015.md` | Pylint-pyi scope fix deferred to iteration 5 | `:1-3` |
| `docs/adr/ADR-016.md` | Iteration-4 infrastructure-only scope — **claims no backend/cache/FakeBackend exists, contradicted by HEAD** | `:1-5` |
| `design/0001`, `design/0002` | Config composers; ty src-only exception | files |
| `README.md`, `docs/tutorials.md`, `docs/troubleshooting.md` | Consumer docs; semantic sections stale | `README.md:29,105`; `tutorials.md:12-16`; `troubleshooting.md:97-111,150` |

### 1.6 Test subsystems

| Path | Responsibility | Key lines |
|---|---|---|
| `tests/checkers/` | Per-checker behavioral tests over real pylint `CheckerTestCase`; `_factories_*` data modules | 45 `.py` files incl. helpers |
| `tests/runner/` | Runner unit/integration tests, autofix, parsers, setup, benchmarks | 30 `.py` files |
| `tests/assumptions/` | Third-party contract pins (astroid, beartype, pylint, pylint cache semantics) | `test_pylint_cache_semantics.py:1-39` |
| `tests/_golden.py` | Golden snapshot normalization/serialization/assertions + CI-guarded rewrite | `:1-11`, `:53-58`, `:374-392` |
| `tests/test_golden.py` | Synthetic unit tests for golden helpers | `:1-6` |
| `tests/integration.py` | Fit-for-purpose end-to-end gate on planted sample project | `:1-145` |
| `tests/data/minimal_sample_project/` | Planted-violation fixture project (W9704 brush-off vs carry-from) | `src/minimal_sample/mod.py:41-56`, `violations.txt` |
| `tests/data/golden/minimal_sample_project_findings.json` | 158 normalized findings; 18 `unjustified-suppression`, 2 `bare-except-comment` | golden file |

---

## 2. Key Interfaces & Signatures

### 2.1 Decision backend (`src/python_setup_lint/checkers/_decision_backend.py`)

```python
DECISION_THRESHOLD: float = 0.5          # :10
PROMPT_VERSION: str = "prompt-v1"        # :11

@runtime_checkable
class DecisionBackend(Protocol):          # :16-20
    model_id: str
    def decide(self, justification: str, rule: str | None, context: str | None) -> float: ...

class FakeBackend:                        # :23-30
    model_id: str = "fake-backend rev test prompt-v1"
    def __init__(self, score: float = 1.0) -> None: ...
    def decide(self, justification: str, rule: str | None, context: str | None) -> float: ...

def get_backend() -> DecisionBackend | None: ...   # :49-59
```

Behavior of `get_backend()` at HEAD:

- `PYTHON_SETUP_LINT_DECISION_BACKEND` is honored **only** when `PYTEST_CURRENT_TEST` is set, then imports an arbitrary `module:attribute` factory (`_decision_backend.py:37-46`).
- `PYTHON_SETUP_LINT_RERANKER_MODEL` emits a one-time deprecation warning (`:51-53`).
- `PYTHON_SETUP_LINT_DECISION_MODEL` is read but only emits a one-time `decision_model_unavailable` warning; it never constructs a backend (`:55-58`).
- Production default is therefore always `None` → heuristic-only behavior.

### 2.2 Semantic adapter (`src/python_setup_lint/checkers/_semantic.py`)

```python
_RESULT_CACHE: dict[int, bool] | None = None     # :16

def _reset_cache() -> None: ...                  # :19-25 (test helper, not in .pyi)

@beartype
def semantic_check_if_meaningful(                # :28-65
    text: str,
    *,
    rule: str | None = None,
    code_context: str | None = None,
    comment: str | None = None,
    backend: DecisionBackend | None = None,
) -> bool | None: ...
```

Contract: `primary = (comment or text).strip()`; empty → `False`; no backend → `None`; otherwise `decide(primary, rule, code_context) >= 0.5`; result memoized in `_RESULT_CACHE` keyed by the first 8 bytes of SHA-256 over `(primary, rule, code_context, model_id)` (`:37-64`).

### 2.3 Heuristic-first gate (`src/python_setup_lint/checkers/_base.py`)

```python
def normalize_suppressed_codes(raw: str) -> str: ...   # :148-156

def check_if_meaningful(                               # :159-252
    text: str,
    *,
    rule: str | None = None,
    code_context: str | None = None,
    comment: str | None = None,
    backend: DecisionBackend | None = None,
) -> bool: ...
```

Order is strict:

1. Normalize directive text and strip echoed codes (`:168`, `:145-156`).
2. Reject `<5` chars, boilerplate tokens, multi-word brush-offs, and rule-symbol-only reasons (`:169-246`).
3. If `PYTHON_SETUP_LINT_SEMANTIC != "1"` → return `True` (`:248-249`).
4. Lazily import `_semantic` and return `semantic_check_if_meaningful(...) is not False` (`:250-252`).

Consequence: the backend can **only veto** a heuristic-meaningful justification; it can never resurrect a heuristic rejection. `None` (no backend) maps to `True`.

### 2.4 W9704 consumer (`suppression_justification_checker.py`)

```python
msgs = _msgs(W9704=MessageDef(
    message="Suppression comment without technical justification: %s",
    symbol="unjustified-suppression", ...))              # :33-41

# module-level scan of raw source lines
self._legacy_scan(node, lines)                            # :63-91

# Any annotation path
self._emit_if_unjustified(annotation, lineno)             # :136-162

# trailing/preceding reason validation
self._has_justification(lines, idx)                       # :330-388
```

Both paths call `check_if_meaningful(reason, comment=reason, rule="unjustified-suppression", code_context=<code before #>)` (`:152-155`, `:372-375`, `:383-386`). The checker knows the file path via `node.root().file` (`_base.py:68-75`) but does not pass it to the semantic API.

### 2.5 Runner / test helpers

- `ToolSpec` and `RunnerConfig` (`runner/types.py:12-22`, `:49-59`); `TOOLS` list (`runner/_tool_specs.py:9-100`); `run_lint(...)` (`runner/cli.py:204-...`).
- `_make_tc(checker_class)` and `_walk_and_release(code, checker_class, *, file_path, module_name)` (`testing.py:18-38`) are the intended shared checker-test harness.
- Golden contract: `Finding = {tool,file,line,col,rule}`, multiset diff, `PYTHON_SETUP_LINT_UPDATE_GOLDEN=1` opt-in, refused under `CI`/`GITHUB_ACTIONS` (`tests/_golden.py:1-11`, `:53-58`, `:374-392`).

---

## 3. Relevant Excerpts

### 3.1 Full current semantic adapter

`src/python_setup_lint/checkers/_semantic.py:15-65`:

```python
_RESULT_CACHE: dict[int, bool] | None = None

def _reset_cache() -> None:
    global _RESULT_CACHE
    _RESULT_CACHE = None

@beartype
def semantic_check_if_meaningful(...) -> bool | None:
    primary = (comment or text).strip()
    global _RESULT_CACHE
    if _RESULT_CACHE is None:
        _RESULT_CACHE = {}
    if not primary:
        return False
    resolved = backend if backend is not None else _decision_backend.get_backend()
    if resolved is None:
        return None
    cache_key = hashlib.sha256("|".join(str(x) for x in (
        primary, rule, code_context, resolved.model_id)).encode()).digest()
    cache_key_int = int.from_bytes(cache_key[:8], "big")
    if cache_key_int in _RESULT_CACHE:
        return _RESULT_CACHE[cache_key_int]
    result = resolved.decide(primary, rule, code_context) >= _decision_backend.DECISION_THRESHOLD
    _RESULT_CACHE[cache_key_int] = result
    return result
```

Observations for the architect:

- The memo is process-local only; nothing is persisted.
- The key truncates SHA-256 to 64 bits (`:59`) — the same truncation ADR-003 criticized in the retired on-disk cache (`docs/adr/ADR-003.md:7`).
- `comment` is folded into `primary`, so the key does not separately include it; docs claim `(text, rule, code_context, comment, model)` (`docs/custom-checks.md:97`).
- `code_context` participates in the key, so any source-line edit invalidates an entry even if the justification is unchanged.
- `model_id` participates, so a model/prompt swap invalidates entries — but `PROMPT_VERSION` is not currently folded into `model_id` by production code.

### 3.2 Heuristic gate and env behavior

`src/python_setup_lint/checkers/_base.py:248-252`:

```python
if os.environ.get("PYTHON_SETUP_LINT_SEMANTIC", "1") != "1":
    return True
from python_setup_lint.checkers._semantic import semantic_check_if_meaningful as _semantic_check

return _semantic_check(primary, rule=rule, code_context=code_context, comment=primary, backend=backend) is not False
```

- Semantic is **on by default**; absence of a backend yields heuristic behavior because `_semantic` returns `None`.
- The lazy import means `_semantic` is never imported when `PYTHON_SETUP_LINT_SEMANTIC=0` (`docs/semantic-justification.md:18`, verified by tests).
- The same gate governs W9738 `bare-except-comment` (`bare_except_comment_checker.py:103-118`).

### 3.3 W9704 justification resolution

`suppression_justification_checker.py:350-388`:

```python
_suppression_patterns = (_PAT_PYLINT_DISABLE, _PAT_NOQA, _PAT_TYPE_IGNORE, _PAT_TY_IGNORE)
for pat in _suppression_patterns:
    for m in pat.finditer(line):
        after = line[m.end():]
        ...  # only search before the next suppression pattern
        tm = _PAT_TRAILING_REASON.search(search_after)
        if tm:
            reason = tm.group(1)
            if check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
                                   code_context=line.split("#", 1)[0].strip()):
                return True

if idx > 0:
    pm = _PAT_PRECEDING_COMMENT.match(prev)
    if pm:
        reason = pm.group(1)
        if check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
                               code_context=lines[idx].split("#", 1)[0].strip()):
            return True
return False
```

A tracked cache keyed by file path would need this caller to supply file identity; today it does not.

### 3.4 Packaging and pytest configuration

`pyproject.toml:28-30`:

```toml
[project.optional-dependencies]
# Empty placeholder: no model dependency ships in iteration 4 (ADR-016).
semantic = []
```

`pyproject.toml:47-54`:

```toml
[tool.pytest.ini_options]
addopts = "-m 'not slow'"
markers = [
  "slow: ...full pipeline runs...",
  "no_external_api: ...",
  "with_real_api: ...",
  "implementation_detail: ...",
]
```

`uv.lock:623` likewise reports `provides-extras = ["semantic"]` with no dependencies.

### 3.5 Cache-related ignore and secrets constraints

- `.gitignore:243-244` still names the retired machine cache: `# NLP semantic model cache (sentence-transformers)` / `.cache/python-setup/semantic/`.
- `.secrets.baseline` enables `HexHighEntropyString` with `limit: 3.0`, so a committed result cache must not contain raw long hex digests; ADR-010 already requires “no bare hex strings of length >= 20” (`docs/adr/ADR-010.md:26-28`).
- ADR-011 says the tracked decisions file is consumer-runtime data, is committed, and gets **no** hatch/wheel entry (`docs/adr/ADR-011.md:54-60`).

### 3.6 ADR state (decisions vs implementation)

- `docs/adr/ADR-009.md:5` — accepted deferral; `:9-13` documents the 215-meaningful / 0-meaningless corpus no-go; `:23-27` requires a double-rated sample and a human Fastino license decision; `:35-37` requires a CPU benchmark and forbids claiming the swap complete.
- `docs/adr/ADR-009.md:29-33` claims iteration 3 delivers “Heuristic-first `DecisionBackend` plus tracked-cache infrastructure” — the backend half exists; the tracked-cache half does not.
- `docs/adr/ADR-010.md:23-36` freezes: backend protocol, `.python-setup-decisions.json` at the linted project root, sorted `indent=2`/`sort_keys` JSON array, no hex≥20, read-only lint with a hash-asserted zero-write check, explicit CI-guarded refresh (lockfile + merge + atomic replace), pruning of missing files/stale model IDs, and writer-first concurrency from the pylint verdict.
- `docs/adr/ADR-010.md:38-41` and `_decision_backend.py:37-46` pin the dotted-path loader as test-only.
- `docs/adr/ADR-014.md:1-5` claims current code is semantic-first with heuristic fallback; HEAD is heuristic-first (`_base.py:248-252`; `_decision_backend.py:16-20`), so the record is stale.
- `docs/adr/ADR-016.md:1-5` claims “At HEAD no DecisionBackend/cache/FakeBackend exists, [semantic] still sentence-transformers, tests still reranker-coupled.” All three claims are false at HEAD: `_decision_backend.py` exists, `pyproject.toml:28-30` is empty, and tests pin the absence of `sentence_transformers` (`tests/checkers/test_semantic_check.py:119-123`, `tests/checkers/test_decision_backend.py:329-337`).
- `docs/adr/ADR-015.md:1-3` is an open iteration-5 deferral: `_PylintPyiLintTool` passes `.pyi` paths but pylint lints companion `.py` (42 of 43 `pylint-pyi` golden findings are on `.py` files); probe found 205 latent private stub symbols; fixing changes the golden.
- `docs/adr/README.md:18-31` indexes only ADR-001…ADR-012; ADR-013…ADR-016 are absent.

---

## 4. Existing Tests & Conventions

### 4.1 Layout and style

- Unit tests: `tests/checkers/`, `tests/runner/`, `tests/test_golden.py`, `tests/test_setup_*`; 85 test modules, 794 test functions before parametrization, 19,627 lines total (`tests/`).
- Naming convention `test_<method>_given_<condition>_then_<expected>` (`CodingRules.md:288-290`).
- Markers: `slow` (excluded by default via `addopts = "-m 'not slow'"`), `no_external_api`, `with_real_api`, `implementation_detail` (`pyproject.toml:47-54`).
- Mocking policy: mock only external boundaries; first-party code always real (`CodingRules.md:240-252`). Checker tests therefore instantiate real `BaseChecker` subclasses through `CheckerTestCase`.
- Shared fixtures live in `tests/conftest.py` (`:40-169`): `empty_project`, session-scoped `configured_project`, `runner_config_factory`, `isolated_runner_registries`, `sample_project`.
- Test factories for complex checker inputs are split by domain to respect the 500-line C0302 limit (`tests/checkers/_factories.py:1-16`; `_factories_stub*.py`).

### 4.2 Semantic/backend tests (current contract)

| File | Coverage | Key lines |
|---|---|---|
| `tests/checkers/test_decision_backend.py` | Pinned constants, FakeBackend, loader gating, heuristic-first veto, normalization, packaging pins | `:1-6`, `:83-165`, `:181-264`, `:320-337` |
| `tests/checkers/test_semantic_check.py` | Adapter signature, empty-primary, `None` mapping, 0.5 threshold matrix, memo per unique pair/model, no `sentence_transformers`, no disk cache | `:47-133` |
| `tests/checkers/test_semantic_threshold.py` | 115-row heuristic table, semantic disabled | `:16-21`, `:147-164` |
| `tests/assumptions/test_pylint_cache_semantics.py` | Read-only behavior, in-process memo, path-free semantic API, `jobs=1` single-writer verdict, sequential pylint invocation | `:1-39`, `:94-181`, `:225-355` |
| `tests/checkers/test_suppression_justification_checker.py` | W9704 checker behavior; semantic disabled via fixture | `:19-30`, `:367-392` |
| `tests/checkers/test_bare_except_comment_checker.py` | W9738 checker behavior; semantic disabled via fixture | `:18-43` |

Important: no test exercises a real model. Every backend is a test double (`test_decision_backend.py:1-6`). The current test suite actively pins the **absence** of a model dependency (`test_semantic_extra_is_empty`, `test_uv_lock_has_no_sentence_transformers_edge` at `:323-337`; `test_no_try_import_checker.py:27-35`; `_OPTIONAL_IMPORT_PATTERNS` empty at `no_try_import_checker.py:10-13`). Any model wiring must update these pins deliberately.

### 4.3 Behavior-preservation gates

- Golden snapshot: 158 findings across all 14 tools; per-tool minimums; multiset comparison catches duplicates/moved lines/new false positives (`tests/_golden.py:1-11`; `tests/data/golden/minimal_sample_project_findings.json`).
- 18 `unjustified-suppression` findings (6 each for `pylint`, `pylint-pyi`, `pylint tests`) and 2 `bare-except-comment` findings.
- Golden capture runs with `PYTHON_SETUP_LINT_SEMANTIC=0` (`tests/integration.py:110-115`; `tests/_golden.py:54`), so semantic-enabled behavior is **not** covered by the golden.
- Integration also asserts brush-off W9704 at `mod.py:49` and no W9704 for carry-from at `mod.py:56` (`tests/integration.py:124-129`; fixture `tests/data/minimal_sample_project/src/minimal_sample/mod.py:49,56`).
- `lint.baseline` is empty, so self-lint fails on any new violation (`lint.baseline:1`).

### 4.4 Debloat evidence (measured at HEAD)

**Duplicated checker-test harness:**

- `_make_tc` local wrapper exists in 13 test files; `_walk_and_release` in 10; `_msg_ids` in 8. The shared implementations already exist in `testing.py:18-38`.
- Examples: `tests/checkers/test_tmp_path_checker.py:19-32` (calls `tc.checker.open()`), `tests/checkers/test_missing_error_chain_checker.py:16-32` (does not call `open()`), `tests/checkers/test_suppression_justification_checker.py:19-20` (imports the shared helper but still defines `_msg_ids`).
- The wrappers are not byte-identical: some call `checker.open()` (SourceRootMixin checkers) and some pass `module_name`. A shared helper needs an `open_checker`/`module_name` option rather than naive deletion.

**Duplicated semantic test double:**

- `_RecordingBackend` appears three times: `tests/checkers/test_decision_backend.py:44-55`, `tests/checkers/test_semantic_check.py:25-36`, `tests/assumptions/test_pylint_cache_semantics.py:80-91`.

**Duplicated runner/setup helpers:**

- `_UvCallRecorder` appears twice: `tests/runner/test_setup.py:39-60` and `tests/runner/test_setup_install.py:36-58`.
- `extra_block` appears twice: `tests/runner/_factories.py:174-176` and `tests/runner/_factories_extras.py:45-47`.
- `_semantic_disabled` fixture appears twice: `tests/checkers/test_bare_except_comment_checker.py:37-40` and `tests/checkers/test_suppression_justification_checker.py:23-26`.

**Dead/vestigial test code:**

- `assert_violation_contains_any` (`tests/runner/_factories.py:167-171`), `assert_r4_reason` (`:200-206`), and `baseline_entry_for_tool` (`tests/runner/_factories_baseline.py:26-28`) have no call sites.
- `sample_project` fixture (`tests/conftest.py:166-169`) has no call sites.
- `test_check_writes_no_disk_cache` monkeypatches `_CACHE_DIR`/`_RESULT_CACHE_FILE`, attributes that no longer exist, with `raising=False` (`tests/checkers/test_semantic_check.py:126-133`).
- The `semantic_disk` fixture does the same for `_CACHE_DIR`, `_RESULT_CACHE_FILE`, `_RESULT_CACHE` (`tests/assumptions/test_pylint_cache_semantics.py:94-106`). These assert the absence of a retired implementation rather than a live contract.
- `tests/runner/test_real_pipeline_smoke.py:1-42` runs the full pipeline and asserts only an int return plus all 14 section markers; this overlaps `tests/integration.py:57-145` and the fake-driven all-tools assertion in `tests/runner/test_lint_runner_integration.py:230-248`.
- Recent prune precedent: commit `644774e` deleted `test_config_consistency.py`, `test_self_lint_clean.py`, `test_pyright_noise_filter.py`, `test_t9_7_compose_pyright_live.py` and trimmed `test_autofix_conflict_integration.py` — the “never test linting” direction is already established.

**Source-side dead/placeholder code:**

- `PROMPT_VERSION` (`_decision_backend.py:11`) is unused in production; only tests assert it (`test_decision_backend.py:87-88`).
- `PYTHON_SETUP_LINT_DECISION_MODEL` is read only to warn that no model exists (`_decision_backend.py:55-58`; test `:141-151`).
- `_semantic.py` needs two `global` statements and a nullable memo solely for lazy initialization (`:16,24,39-41`); a module-level dict + `.clear()` would remove both.
- `_base.check_if_meaningful` rebuilds the 46-token boilerplate set and 20-phrase set on every call (`:172-241`); module-level `frozenset`s would preserve behavior and cut per-call work.
- `_PylintPyiLintTool` and `_PylintTestsLintTool` duplicate “explicit override then auto-discovery” rcfile resolution (`dispatch.py:249-277` vs `:280-309`), while `_PylintLintTool` uses `_resolve_pylintrc` (`:201-246`).
- `src/python_setup_lint/checkers/__init__.py` has only the license header and no module docstring (unlike `runner/__init__.py` and `conformance/__init__.py`).
- `docs/adr/ADR-016.md` and `ADR-014.md` are stale; the ADR index omits 013-016 (`docs/adr/README.md:18-31`).
- `pyproject.toml:3` says 1.2.10 while `CHANGELOG.md:3` tops out at v1.2.9 (minor release-doc drift).

### 4.5 Test-infrastructure conventions to extend first

The intent says “test infra/assumptions first.” The existing template is `tests/assumptions/`:

- Each module opens with the observed third-party version and the contract being pinned (`test_pylint_cache_semantics.py:1-39`, `test_astroid_contracts.py:1-7`, `test_beartype_contracts.py:1-11`, `test_pylint_contracts.py:1-6`).
- `pytestmark = pytest.mark.no_external_api` on every assumption module.
- Tests are behavioral and assert observed consequences, not implementation internals; failures are meant to trigger re-derivation before loosening.
- For the cache writer, `TestPylintRcfileJobsWatchdog` and `TestPylintInvocationConcurrency` already pin `jobs=1`, sequential dispatch, and the absence of `concurrent`/`multiprocessing` imports in the runner (`:225-355`). This is the writer-first verdict ADR-010 requires.
- For benchmarks, `tests/runner/test_bench_runner_overhead.py:1-14` shows the convention: `@pytest.mark.slow`, real subprocesses, measured wall time/RSS, artifact written under `tmp_path`.

---

## 5. Open Questions & Uncertainties

### Q1. Which model satisfies the intent, and can the ADR-009 gate be closed now?

- The intent names `fastino/GLiDE-0.4B` or smaller. External facts: GLiDE-0.4B is a 0.40B-parameter encoder, 0.81 GB bf16 weights, tested on an RTX PRO 6000, requires `torch==2.14.0` (CUDA 13.0 wheels) and `transformers==5.17.0`; its `glide/` inference package lives in the HF repo, not as a normal PyPI dependency ([model card](https://huggingface.co/fastino/GLiDE-0.4B)).
- The GLiDE collection’s smallest member is 0.4B (others: 0.8B, 2B, 9B, 27B) ([collection](https://huggingface.co/collections/fastino/glide)), so “or smaller” requires a different model family.
- License is the Fastino Community License: free use, but production commercial use by an entity with annual revenue > $10M requires a separate written agreement; any commercial use requires “Built with Fastino GLiDE” attribution; derivative works must be distributed under the same license ([LICENSE](https://huggingface.co/fastino/GLiDE-0.4B/blob/main/LICENSE)). The project itself is MIT (`pyproject.toml:19-20`).
- ADR-009’s corpus gate remains untouched: 215 meaningful / 0 meaningless labels, all single-author (`docs/adr/ADR-009.md:9-13`). No corpus artifacts exist in the repository (only `tests/data/golden/` and `tests/data/minimal_sample_project/`).
- No CPU benchmark exists; ADR-016 explicitly lists “no CPU bench” as open (`docs/adr/ADR-016.md:3`).
- Decision framing: (a) spike GLiDE CPU latency and packaging, then implement an optional backend; (b) choose a smaller permissively licensed zero-shot/classifier model, which still needs evaluation data; or (c) keep heuristic-only behavior and record another explicit deferral. Option (c) conflicts with the literal intent unless the operator accepts the ADR-009 gate again.

### Q2. How should a production backend be wired, and should it be default-on?

- `get_backend()` currently has no production model path; it returns a test-only dotted-path backend or `None` (`_decision_backend.py:37-59`). ADR-010 says a compliant model “plugs in through `get_backend()` plus `DECISION_MODEL` with no pipeline refactor” (`docs/adr/ADR-010.md:47-48`), but no loader code exists for that env var.
- `PYTHON_SETUP_LINT_DECISION_MODEL` is parsed but never used (`_decision_backend.py:55-58`), and `PROMPT_VERSION` is dead (`:11`).
- The present veto semantics mean a backend can only make lint stricter (`_base.py:248-252`; tests `test_decision_backend.py:181-229`). Default-on would change W9704/W9738 outcomes for every consumer that installs the extra; default-off would preserve behavior but make the feature opt-in.
- The architect must also decide failure semantics: missing extra, model download failure, OOM, CPU timeout, and malformed model output all currently collapse to `None` → heuristic pass. Is that acceptable for a tool advertised as validating suppressions?

### Q3. Git-stored decision cache: schema, keying, and the path-free API tension

ADR-010 freezes the contract (`docs/adr/ADR-010.md:26-36`) but the repository documents no schema or key encoding beyond “JSON array sorted, indent=2, sort_keys, no bare hex ≥20.” Open decisions:

- **File identity vs path-free API**: pruning requires file paths in cache entries (ADR-010:33), but `semantic_check_if_meaningful` is deliberately path-free (`tests/assumptions/test_pylint_cache_semantics.py:171-181`) and its callers (`suppression_justification_checker.py:152-155,372-386`; `bare_except_comment_checker.py:103-118`) do not pass a path. Options: extend the checker→semantic call with a file path, add a separate cache API at the checker layer, or key by content and prune by scanning the repo. Each has test/behavior implications.
- **Key composition**: current memo includes `(primary, rule, code_context, model_id)` and truncates to 64 bits (`_semantic.py:47-64`). A tracked cache should likely key on file path + normalized justification + rule + model/prompt version; whether `code_context` belongs in the key determines churn vs sensitivity.
- **Score vs verdict**: storing a boolean loses the ability to re-threshold; storing a float lets `DECISION_THRESHOLD` changes apply without re-running the model, but requires calibrating model output to `[0,1]` (the protocol promises this, but does not enforce it; `_decision_backend.py:16-20`).
- **Refresh command**: there is no CLI surface today (`runner/cli.py:280-366` lists all args; none refresh decisions). ADR-010 requires an explicit CI-guarded refresh path with lockfile + merge + atomic replace. The golden-update guard pattern (`tests/_golden.py:374-392`: refuse under `CI`/`GITHUB_ACTIONS`) is a reusable precedent.
- **Read-only lint**: ordinary lint must not mutate the cache; a hash-before/hash-after test is required. Current tests only prove the retired path is absent (`test_pylint_cache_semantics.py:112-168`; `test_semantic_check.py:126-133`).
- **Secrets scan**: `.secrets.baseline` enables `HexHighEntropyString` (limit 3.0), so long hex keys in a committed cache will fail `detect-secrets`. ADR-010’s “no bare hex strings” constraint is not just stylistic.
- **Writer concurrency**: the verdict says no lock/merge is needed while pylint `jobs=1` (`test_pylint_cache_semantics.py:14-38`, `:225-355`); a consumer rcfile with `jobs>1` voids the claim. If refresh is a separate process rather than pylint, that assumption must be restated.
- **Location**: `.python-setup-decisions.json` at the linted project root (ADR-010:26); `.gitignore` currently ignores only `.cache/python-setup/semantic/` (`.gitignore:243-244`), so a root decisions file would be committed and visible to `detect-secrets`/`git ls-files`.

### Q4. How is semantic behavior pinned if a model ships?

- Golden and integration capture with `PYTHON_SETUP_LINT_SEMANTIC=0` (`tests/integration.py:110-115`; `tests/_golden.py:54`), so no current test pins model-enabled W9704/W9738 outcomes.
- A model that changes verdicts could pass the entire suite while changing consumer lint behavior. Options: (a) add a deterministic fake-backend golden that exercises the full veto path with `PYTHON_SETUP_LINT_SEMANTIC=1`; (b) add an opt-in real-model golden/contract test marked `slow`/`with_real_api`; (c) keep the model opt-in and document that golden covers only heuristic behavior.

### Q5. Documentation and ADR reconciliation scope

The following are definitively stale at HEAD and should be part of the modernize work:

- `docs/semantic-justification.md:1-62` — entire document describes cross-encoder/reranker, `sentence-transformers`, `PYTHON_SETUP_LINT_RERANKER_MODEL`, `~/.cache/.../results.json`.
- `docs/custom-checks.md:97` and `:104` — reranker-first description and invalid cache-key tuple.
- `README.md:29` — `python-setup[semantic]` described as “sentence-transformer-powered”.
- `docs/troubleshooting.md:97-111` — cross-encoder download-failure section; `:150` says “Expected: 7 pass, ~39s” (actual 9 pass, ~57s).
- `docs/tutorials.md:12-16` — “optional semantic justification rerunner”.
- `AGENTS.md:79-85` — cross-encoder pipeline and `PYTHON_SETUP_LINT_RERANKER_MODEL`; `:9-11` test counts stale (1290/4 skip/15 deselected/53 s vs 1357/7 deselected/26.6 s; integration 7 vs 9); Tool Scope table `:20-32` has 13 rows but there are 14 tools (missing `ruff format`; see `runner/_tool_specs.py:12-22`).
- `docs/adr/ADR-016.md:1-5`, `ADR-014.md:1-5`, `ADR-009.md:29-33`, `ADR-002.md:3-6`, `ADR-011.md:44-49` — claims that no longer match HEAD (backend exists; tracked cache does not; `TestSuppressionRerankerPipeline` no longer exists).
- `docs/adr/README.md:18-31` — missing ADR-013…ADR-016 entries.

### Q6. Debloat acceptance criteria and “never test linting”

- “Test infra/assumptions first” is already satisfied structurally by `tests/assumptions/`; continue that pattern for any new model/cache work.
- “Never test linting” is not defined in the repo. The closest precedent is the recent prune of `test_self_lint_clean.py`, `test_config_consistency.py`, `test_pyright_noise_filter.py`, `test_t9_7_compose_pyright_live.py` (commit `644774e`). Remaining candidates: `tests/runner/test_real_pipeline_smoke.py` (overlaps integration + fake orchestration), and checker-test helper wrappers that only re-test the harness.
- Test intent must be preserved: the 115-row heuristic table (`test_semantic_threshold.py:16-21,147-164`) and the W9704 checker behavior tests (`test_suppression_justification_checker.py:29-392`) are behavior contracts, not harness duplication. The duplicate `_RecordingBackend` / `_UvCallRecorder` / `_make_tc` layers are harness duplication.
- No acceptance metric exists for line-count reduction; the only enforced metrics are `C0302 ≤500`, `R0912 ≤16`, `R0915 ≤65` and the empty baseline (`CodingRules.md:139-159`; `lint.baseline:1`).

### Q7. Pylint-pyi scope (ADR-015)

- ADR-015 explicitly defers the fix to iteration 5 (`docs/adr/ADR-015.md:1-3`). If iteration 5 is this iteration, the architect must either include it or update the ADR with a later target.
- Current behavior: `_PylintPyiLintTool` discovers `.pyi` paths and passes them to pylint (`dispatch.py:249-277`); the golden contains 43 `pylint-pyi` findings, 42 on `.py` files (`tests/data/golden/minimal_sample_project_findings.json`). Changing this scope will change the golden and possibly `lint.baseline` behavior for consumers.

### Q8. Packaging and test pins that will change with a model extra

- `[semantic]` extra is empty (`pyproject.toml:28-30`; `uv.lock:623`).
- Tests pin emptiness: `test_semantic_extra_is_empty` and `test_uv_lock_has_no_sentence_transformers_edge` (`tests/checkers/test_decision_backend.py:323-337`).
- `_OPTIONAL_IMPORT_PATTERNS` is empty with the comment “The [semantic] extra is an empty placeholder” (`no_try_import_checker.py:10-13`), and `test_no_try_import_checker.py:27-35` pins that `sentence_transformers` is no longer optional and that a try/except import is now a violation.
- If a model is loaded via `importlib` (as the current dotted loader does), the no-try-import rule is bypassed; if it is loaded via `try/except ImportError`, the patterns/test must be updated deliberately.
- `uv.lock` regeneration for torch/transformers/glide will be large and platform-specific; `semantic` must remain optional so the base dev install stays light.

### Q9. Cache/model test infrastructure to add before implementation

Suggested assumption/contract tests, following `tests/assumptions/` style:

1. Cache file round-trip: sorted `indent=2`/`sort_keys`, no hex ≥20, passes `detect-secrets` (ADR-010:26-28).
2. Read-only lint: byte-hash the cache before/after an ordinary `run_lint`; assert unchanged (ADR-010:29-30).
3. Refresh path: refused under `CI`/`GITHUB_ACTIONS`; atomic replace; single-writer behavior (reuse the golden guard pattern, `tests/_golden.py:374-392`).
4. Prune: entries for missing files and stale `model_id`s disappear; live entries survive.
5. Backend loading: production ignores `PYTHON_SETUP_LINT_DECISION_BACKEND`; missing optional dependency → `None` → heuristic behavior (`_decision_backend.py:37-46`).
6. Model determinism: no sampling; batching must not change scores (GLiDE model card warns that concurrent micro-batching can shift probabilities; set `GLIDE_MAX_BATCH=1` when caching scores).
7. CPU benchmark: `@pytest.mark.slow`, wall time/RSS per justification, following `test_bench_runner_overhead.py:1-14`.

---

## 6. High-signal summary for the architect

1. The reranker removal is complete; the backend/cache *interfaces* are half-delivered. The next iteration’s semantic work is: production backend wiring + an actual CPU model (or an explicit deferral) + the tracked decision cache with refresh/prune.
2. The biggest behavioral risk is enabling a model by default before semantic-on behavior is pinned; golden currently runs with semantic off.
3. The biggest debloat wins are test-harness duplication (13 `_make_tc` copies, 10 `_walk_and_release` copies, 3 `_RecordingBackend` copies, 2 `_UvCallRecorder` copies, dead helpers, vestigial cache tests, redundant smoke test), not production code.
4. Docs and ADRs are materially wrong about the semantic subsystem; ADR-016 actively contradicts HEAD and should be superseded/updated first.
5. Any ADR-009 gate closure needs a corpus/license/CPU-benchmark decision that cannot be inferred from the repository today.

## Task Status
iteration: 5
amendments: 1
items:
  - cache-design-spike kind=poc wave=3 status=pending outlineRef=cache-design-spike
  - checkers-legacy-dead-cleanup kind=no-behavior wave=3 status=pending outlineRef=checkers-legacy-dead-cleanup
  - checkers-stream-helper kind=no-behavior wave=2 status=running outlineRef=checkers-stream-helper
  - coding-rules-audit kind=fact-finder wave=4 status=pending outlineRef=coding-rules-audit
  - coding-rules-audit-v2 kind=fact-finder wave=9 status=pending outlineRef=coding-rules-audit
  - consolidate-integration-helpers-v2 kind=test-only wave=8 status=ready outlineRef=consolidate-integration-helpers
  - consolidate-integration-helpers-v3 kind=test-only wave=11 status=ready outlineRef=consolidate-integration-helpers
  - decision-cache-impl kind=dev wave=4 status=failed outlineRef=decision-cache-impl
  - docs-counts-sync kind=dev wave=12 status=pending outlineRef=docs-counts-sync
  - docs-reconciliation kind=no-behavior wave=6 status=pending outlineRef=docs-reconciliation
  - epic-kickoff-gate kind=fact-finder wave=2 status=pending outlineRef=epic-kickoff-gate
  - epic-shift-report-collection kind=fact-finder wave=3 status=pending outlineRef=epic-shift-report-collection
  - final-gate-validation kind=fact-finder wave=5 status=pending outlineRef=final-gate-validation
  - golden-regen-hatch kind=test-only wave=4 status=pending outlineRef=golden-regen-hatch
  - semantic-tests-rewrite kind=test-only wave=5 status=pending outlineRef=semantic-tests-rewrite
  - test-debloat-audit kind=fact-finder wave=5 status=pending outlineRef=test-debloat-audit
  - test-debloat-audit-v2 kind=fact-finder wave=10 status=pending outlineRef=test-debloat-audit
waves: 2, 3, 4, 5, 6, 8, 9, 10, 11, 12
merged: (none)
blocked: (none)
failed: decision-cache-impl
open steer questions:
  - awareness-decision-cache-impl-cli-refresh-prune-only-until-producer ref=decision-cache-impl disposition=human-awareness: run_decision_refresh calls refresh(observed=()) because the checker-side observation producer is forbidden in this item (_semantic/_decision_backend). Module-level merge path is fully tested; end-to-end population of new entries awaits the follow-up producer item. No action for this item; recorded so M4 acceptance tracks the dependency.
  - awareness-model-eval-poc-single-adjudicator-labels ref=model-eval-poc disposition=human-awareness: All real-repo ground truth was adjudicated by one author with no inter-rater check; borderline terse justifications ('planted violation', 'usage docs in .pyi', 'optional semantic extra', 'test helper for readability') are all True. The 85% meaningful-recall / 95% meaningless-precision bars inherit this subjectivity. Final report must disclose the adjudication protocol and edge-case rubric; architect can decide if sampled second-rating is needed.
  - awareness-model-eval-poc-single-adjudicator-structural-no-go ref=model-eval-poc disposition=human-awareness: Verified: contracted accepted stratum is 215 meaningful / 0 meaningless (the sole repo_suppression negative c188 is heuristic-rejected), so 95% precision is unevaluable by construction and heuristic baseline is 100% by definition (test-table labels assert heuristic behavior). All 183 repo labels are single-author (repo_labels.json) with terse borderlines ('planted violation', 'usage docs in .pyi') all True; the 39 hard negatives making augmented precision non-vacuous are author-written sensitivity data. Report discloses this (§6 + §3). Architect can decide whether a double-rated real brush-off sample is needed before any future go/no-go; no further PoC action required for the no-go itself.
  - awareness-plan-2-cache-location-choice ref=plan-2 disposition=human-awareness: Assumption places JSON cache at linted root next to baseline with weights in user cache, affecting gitignore/hatch inclusion/consumer repos/secrets scanning. Spikes can assume path with DECISIONS_PATH isolation but operator should confirm filename/location before iteration-3 implementation. Record informational review.
  - awareness-plan-2-fastino-license-gating ref=plan-2 disposition=human-awareness: Assumption correctly blocks Fastino until review, prefers Apache candidates, excludes CC-BY-NC. If eval recommends GLiDE implementation must pause for approval. No blocking now: matrix+eval proceed Apache-first. Operator must see gating criterion. Record informational review.
  - awareness-plan-2-fastino-license-review ref=plan-2 disposition=human-awareness: Plan correctly proceeds Apache-first, flags Fastino/unclear, pauses implementation if GLiDE recommended. Operator should be aware eval may recommend non-MIT-compatible model; no blocking decision needed until eval verdict.
  - awareness-plan-2-material-behavior-definition ref=plan-2 disposition=human-awareness: Assumption defines golden SEMANTIC=0 + unit/CLI/baseline/configs as material and reranker accept/reject as non-material, letting model swap change W9704 verdicts while claiming preservation. Architect can proceed with spikes but operator must see this redefinition of every material behavior. Record informational review.
  - awareness-plan-2-material-tightening-visibility ref=plan-2 disposition=human-awareness: Assumption allows tightening (accepted+miss+absent True, hit False) as intentional, not regression. Operator should be aware SEMANTIC=1 golden will shift; shift report+CHANGELOG+root regen protocol must be visible before iteration-3.
  - awareness-plan-3-dotted-path-injection-risk ref=plan-3 disposition=human-awareness: PYTHON_SETUP_LINT_DECISION_BACKEND dotted path has no test-only enforcement (pytest guard/allowlist); if honored in production lint, env control equals code execution. Architect can decide guard now; operator should be aware. Document in ADR-010 with loader test.
  - awareness-plan-3-model-deferral-awareness ref=plan-3 disposition=human-awareness: Intent requires replacing reranker with CPU-friendly decision model (GLiDE-0.4B or smaller) + git cache. ADR-009 defers model to follow-up on corpus repair + Fastino license verdict; iteration-3 delivers DecisionBackend/cache/FakeBackend, no model. Justified by 215/0 eval no-go but operator must approve close-up will not claim swap complete. Record follow-up triggers (double-rated sample, license decision, CPU benchmark).
  - awareness-plan-4-infra-only-closeup-awareness ref=plan-4 disposition=human-awareness: Intent requires replacing the reranker with a CPU-friendly decision model; plan defers all model wiring to I5 on corpus+license+CPU gates, which is sound given the 215/0 no-go but is a scope deviation ADR-009 says the operator must approve at close-up ('must not claim swap complete'). Proceed with infra now; record operator awareness that close-up stays heuristic-first.
  - awareness-plan-4-infra-only-closeup ref=plan-4 disposition=human-awareness: Intent replaces cross-encoder (_semantic.py:1 reranker, sentence-transformers) with CPU decision model + git cache; ADR-016 ships backend/cache/Fake/docs/corpus only, no wiring, close-up must not claim swap, I5 gated on corpus + human Fastino + CPU bench. High-impact cut architect can decide per ADR-009 no-go (215/0, single-author, no bench). Inform operator swap open.
  - awareness-plan-4-material-never-test-boundaries ref=plan-4 disposition=human-awareness: Material = golden SEMANTIC=0 + unit + CLI/exit + baseline/autofix + configs (heuristic material, model never); never-test-linting bans pytest asserting own gates while retaining golden/integration. Both confirm-with-human, I1-approved. Architect decides preserve; golden stays mechanical contract. Informational only.
  - awareness-plan-5-infra-only-close ref=plan-5 disposition=human-awareness: No-go/blocked + missing approvals force cache+pinning+docs only ([semantic] stays empty, pyproject.toml:28); I6 needs second rater + Fastino + CPU bench. Close-up must not claim swap complete.
  - awareness-plan-5-orphan-enforcement-gap ref=plan-5 disposition=human-awareness: ORPHAN (stubtest-only, pyi-underscore orphan-only) leaves ~205 latent symbols + 42/43 findings unenforced; FIX needs temp-tree+cleanup+regen. Architect may choose with spike evidence; operator should note gap (stubtest≠style).

## Human involvement
# Human involvement criteria

Mode selects which ADR and concern decisions need a human decision. Everything
else is either autonomous or digest-only; never block on items the table marks
remarkable.

## Blocking table (ADRs and concerns)

| Mode | Blocking (needs human decision) | Remarkable (digest only) |
| --- | --- | --- |
| autonomous | high-severity ADRs/concerns still blocking after unblocked work | everything else |
| principal | stack/layer, external interfaces, config shapes | internal choices |
| detailed | external-interface changes and major internal interfaces | minor internals |

## autonomous

Block only explicit high-severity ADRs/concerns that remain after all unblocked
work is finished. Do not stop for internal choices; record them as remarkable.

## Open Concerns
- id: c-89f3cb5a77
  kind: risk
  severity: medium
  summary: decision-cache-impl failed and was abandoned; needs replan
  affects:
    - decision-cache-impl
  status: routed
  disposition: architect
- id: rm-717ccdc143
  kind: remarkable
  summary: Tree now carries check-only ruff format ToolSpec (_RuffFormatLintTool.build_command appends --check, _build adds --config) with phase-1a-only mutation


- Raise concerns with evidence; condense stale detail instead of repeating it.

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
- target (object, optional): Corrected developer target from a merge-verify consult, applied to the merge verification instead of the record's stale target (unknown-gate recovery). One of {gate: <infra gate id>}, {selectors: [<test ids>]}, or {command, customTarget: true}.
  - gate (string, optional)
  - selectors (array of string, optional)
  - expectRed (array of string, optional)
  - command (string, optional)
  - customTarget (boolean, optional)
- planDelta (string, optional): Plan delta or amendment directives when decision is amend
- timestamp (string, optional): ISO timestamp (assigned by engine if omitted)
- concerns (array of object, optional): Structured concerns raised by the architect
  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
  - summary (string, required)
  - detail (string, optional)
  - severity (string, optional, enum: ["low","medium","high"])
  - location (object, optional)
    - file (string, required)
    - line (integer, optional)
  - affects (array of string, optional)
- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
  - chosen (string, required)
  - why (string, required)
  - alternatives (array of string, required)
- concernConfirms (array of object, optional): Architect confirmations for close-up concern resolutions
  - id (string, required)
  - note (string, optional)
  - confirm (string, required, enum: ["accept","reject"])
- concernResolution (object, optional): Direct concern resolution applied when the decision commits
  - id (string, required)
  - note (string, optional)
  - action (string, required, enum: ["resolve","carry"])
