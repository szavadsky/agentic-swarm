# Step: Architect Revise

## Goal
Revise the iteration execution plan (`plan-N.yaml`) in response to adversarial feedback from the plan reviewer.

## Rules
- Exploration budget: evaluate review feedback against the plan and the prepared context pack (`# Context Pack — `modernize` (iteration 5 starting state)

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
5. Any ADR-009 gate closure needs a corpus/license/CPU-benchmark decision that cannot be inferred from the repository today.`). Read code ONLY to verify a specific reviewer objection (few targeted reads, never broad scans or chunked whole-file reading). Translate newly identified unknowns into spike outlines or uncertainties instead of exploring in-turn. Keep terse.
- Feedback resolution: evaluate each review suggestion. Address valid concerns by adjusting milestones, scenarios, directional interfaces, or adding spikes.
- Architectural authority: for suggestions you deliberately reject or defer, provide clear, defensible technical rationale.
- Maintain plan bounds: keep milestone counts and dependencies within configured limits.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.
- Output: yield the updated plan matching `plan.schema.json`.

## Current Plan
{
  "iteration": 5,
  "milestones": [
    {
      "id": "M1",
      "title": "Test infrastructure and decision contracts first",
      "directionalInterfaces": [
        "Cache contracts (NEW tests/assumptions/test_decision_cache_contracts.py, no_external_api): round-trip sorted indent=2/sort_keys, no bare hex>=20, detect-secrets clean on tmp file, read-only hash (byte-hash before/after ordinary run_lint unchanged), refresh CI-guard refuses under CI/GITHUB_ACTIONS (golden-guard shape tests/_golden.py:374-392), prune missing-files + stale-model-ids, --path retains unscanned, jobs==1 required else loud fail (reuse writer-first verdict test_pylint_cache_semantics.py:225-355, cite file:line, do not re-derive).",
        "Loader contracts (NEW tests/assumptions/test_decision_loader_contracts.py, no_external_api): production ignores PYTHON_SETUP_LINT_DECISION_BACKEND without PYTEST_CURRENT_TEST (both branches pinned, do not weaken _decision_backend.py:37-46), missing [semantic] extra / get_backend() None maps to heuristic bool with exactly-one structlog warning for DECISION_MODEL, PROMPT_VERSION folded into production model_id once wired (shape '... prompt-vN', FakeBackend already complies).",
        "Model spikes (report-only, zero committed files): candidate matrix {license, params/size, runtime, py3.14 CPU wheels linux/mac/win, custom-code/vendoring, pinnable revision, offline}; corpus pilot {N>=100 post-dedup, both strata non-empty, rubric, two-pass blinded + adjudication + agreement, per-source/stratum split} or explicit blocker; CPU eval {veto-only at 0.5/0.6/0.7, 90/95/85 bars on heuristic-accepted stratum, cold-load/warm p50/p95 + RSS, GLIDE_MAX_BATCH=1 determinism, smallest compliant or no-go}; runtime pinning (conditional on go, else report-only skip).",
        "Pyi spike (report-only): {reproduction companion-vs-orphan on tmp, golden counts recount at HEAD, latent budget recount (symbols + duplicate-code), recommendation fix-with-regen vs orphan-only with I5 budget/regen plan}."
      ],
      "scenarios": [
        "Scenario: Cache and loader contracts pinned before implementation\n  Given HEAD with in-process memo only and no tracked cache\n  When cache/loader assumption items merge\n  Then new assumption modules pass offline, assert live contracts only (no raising=False vestiges), and M3/M4 implementations consume them via deps without loosening",
        "Scenario: Model verdict is evidence-based or explicitly blocked\n  Given the 215/0 no-go history and Fastino review open\n  When matrix + corpus + CPU eval complete\n  Then the report cites license verdict per candidate, CPU latency/RSS per threshold, 90/95/85 compliance on the accepted stratum, and recommends the smallest compliant model+prompt+threshold or a no-go/blocker with evidence; no model code ships on no-go",
        "Scenario: Pyi scope decided with budget\n  Given 42/43 pyi findings on .py and 205 latent symbols (verify at HEAD)\n  When the pyi spike completes\n  Then the verdict recommends fix-with-regen (with strategy + cleanup budget + regen plan) or orphan-only (with scope-note text), and M5 consumes it without re-proving reproduction"
      ]
    },
    {
      "id": "M2",
      "title": "Test harness and source debloat (behavior-preserving)",
      "directionalInterfaces": [
        "Checker harness single-sourced: testing.py gains open_checker/module_name options on _walk_and_release/_make_tc (backward-compat defaults preserving current call shapes); 13 _make_tc + 10 _walk_and_release + 8 _msg_ids local copies deleted (grep zero, recount at HEAD); SourceRootMixin callers pass open_checker=True; behavior identical.",
        "Semantic/runner doubles single-sourced: one _RecordingBackend (NEW tests/checkers/_decision_test_doubles.py or testing.py extension, item reports placement + import graph), one _semantic_disabled fixture (tests/checkers/conftest.py), one _UvCallRecorder, one extra_block; dead helpers deleted (assert_violation_contains_any, assert_r4_reason, baseline_entry_for_tool, sample_project) with grep-zero proof; vestigial cache tests rewritten to live hash/tmp contracts (no raising=False on retired attrs); smoke kept-narrowed or removed with survivor map to integration + fake orchestration.",
        "Source simplifications (no behavior change): _semantic memo dict + .clear() (drop both globals + nullable), _base boilerplate/phrase frozensets at module level, dispatch pyi/tests rcfile paths via _resolve_pylintrc (single implementation), checkers __init__ module docstring; FORBIDDEN _decision_backend/PROMPT_VERSION/DECISION_MODEL (M4), decisions/ + CLI threading (M3), tests/data, baseline, docs."
      ],
      "scenarios": [
        "Scenario: Harness deduped without intent loss\n  Given duplicated wrappers/doubles/dead helpers at HEAD\n  When M2 merges\n  Then grep shows zero local copies, all touched modules <=500 with no new suppressions, 115-row heuristic table + W9704/W9738 checker behavior tests pass unchanged, no new failures vs I5 HEAD gates, golden hash-equal",
        "Scenario: Source simplified without drift\n  Given placeholder globals, per-call sets, duplicated rcfile blocks\n  When simplifications merge\n  Then behavior identical (heuristic outcomes + tool commands byte-identical in tests), modules <=500, tach/typing clean, no new failures, golden hash-equal"
      ]
    },
    {
      "id": "M3",
      "title": "Git-stored decision cache with cleanup",
      "directionalInterfaces": [
        "Storage (NEW python_setup_lint/decisions/_decision_cache.py + .pyi, @beartype, structlog, tach-clean, <=500): .python-setup-decisions.json at linted root (array sorted by (rule, justification, model), indent=2, sort_keys, no bare hex>=20, secrets-clean); entry {justification normalized (strip+collapse ws, keep case), rule joined codes, model '<id> rev <short12> prompt-vN', score float [0,1] + decision bool (re-thresholdable), files sorted unique POSIX} + {version, prompt hash, last-seen}; key (justification, rule, model); context is model input only (NOT in key); PROMPT_VERSION folded into model string.",
        "Refresh (runner CLI --refresh-decisions [--path ...], RunnerConfig threading, help text): explicit only, FAILS under CI/GITHUB_ACTIONS (golden-guard shape), PYTHON_SETUP_LINT_DECISIONS_PATH test-only (honored ONLY under PYTEST_CURRENT_TEST; production root = config.cwd with traversal guard, no parent escape), lockfile (O_CREAT|O_EXCL retry 5s) + merge + atomic replace in target dir, prune automatic (missing files + stale model-ids, no --prune flag), --path scoping (unscanned retained), jobs==1 required else loud fail (no sidecars); observation producer owned atomically here (checker-layer file identity via node.root().file during refresh only; semantic_check stays path-free); normal lint read-only (hash-asserted zero writes); tach.toml gains decisions module + two edges (sole owner)."
      ],
      "scenarios": [
        "Scenario: Cache round-trips with cleanup and stays secrets-clean\n  Given empty/missing cache on tmp\n  When refresh runs with FakeBackend observations then prune\n  Then file round-trips sorted deterministically (double-run byte-identical), missing-file + stale-model entries disappear, live entries survive, detect-secrets passes, no bare hex>=20",
        "Scenario: Lint stays read-only while refresh writes explicitly\n  Given a committed cache with a persisted False verdict\n  When ordinary run_lint runs vs explicit --refresh-decisions\n  Then ordinary lint shows zero writes by byte-hash and emits the persisted verdict with no model load (heuristic-rejected never reaches backend; accepted+hit==persisted; accepted+miss+absent==heuristic True), while refresh merges + prunes + atomic-replaces, refuses under CI, and fails loudly on jobs>1"
      ]
    },
    {
      "id": "M4",
      "title": "CPU decision model wiring (spike-gated)",
      "directionalInterfaces": [
        "Semantic-on pin (tests-only, no model needed): deterministic fake-backend integration (SEMANTIC=1 + FakeBackend 0.0/1.0 over existing sample project, default-collected, no network) asserting veto extremes (1.0 preserves heuristic accepts, 0.0 vetoes them, brush-off never reaches backend with call-count 0, one call per unique pair); exactly one slow+with_real_api e2e SKELETON (skipped until model ships; on go, wired to real backend with importorskip + CPU budget asserts).",
        "Backend wiring (branches on U1 verdict; consumes eval + runtime-pinning + cache-impl): GO maps to [semantic] extra gains pinned runtime only (CPU wheels linux/mac/win verified), get_backend() loads '<id> rev <short12> prompt-vN' via DECISION_MODEL (PROMPT_VERSION folded, GLIDE_MAX_BATCH=1 when caching), failure maps to None maps to heuristic with exactly-one warning (no retry storm), no_try_import patterns + tests updated deliberately, emptiness pins replaced with allowlist pins, uv.lock regenerated (base install stays light); NO-GO maps to zero prod writes, no-op attestation citing verdict section, heuristic-only preserved, docs state no-go (M5)."
      ],
      "scenarios": [
        "Scenario: Veto path pinned with and without a model\n  Given golden runs with SEMANTIC=0\n  When semantic-on pin merges\n  Then fake-backend integration passes deterministically in the default suite, the slow skeleton skips with a clear reason, and SEMANTIC=0 golden stays hash-equal",
        "Scenario: Model ships only on a compliant verdict\n  Given the U1 verdict (go with license+CPU+corpus gates or no-go/blocked)\n  When backend wiring merges\n  Then GO shows pinned runtime + loader + e2e pass (slow) with no default-suite network and no SEMANTIC=0 drift, or NO-GO shows zero prod diff with an attestation citing the verdict — never a silent swap or an unpinned dependency"
      ]
    },
    {
      "id": "M5",
      "title": "Pyi scope, docs/ADR reconciliation, and gate evidence",
      "directionalInterfaces": [
        "Pyi branch (consumes spike; strategy + shift report here, latent cleanup bounded): FIX maps to _PylintPyiLintTool lints companion stubs (temp-tree/copy or pylint mode that does not resolve companions, proven by broken-stub control), shift report {class, added/removed keys, CHANGELOG snippet, file:line}, latent stub cleanup EITHER in-budget (<=200 prod lines, same item) OR routed to I6 follow-ups with explicit file list (never baseline edits); ORPHAN-ONLY maps to zero prod writes, scope-note text (companion .pyi governed by mypy.stubtest only) for docs item, no golden change.",
        "Docs/ADR exact-strings (sole writer; after all behavior items): semantic-justification.md (DecisionBackend, .python-setup-decisions.json, ADR-009, prompt-v1, veto, FakeBackend, no reranker/sentence-transformers); custom-checks.md (DecisionBackend, live key tuple); troubleshooting.md (PYTHON_SETUP_LINT_DECISION_MODEL, PYTHON_SETUP_LINT_RERANKER_MODEL, deprecated, 9 pass/~57s); tutorials.md (decision backend, no rerunner); AGENTS.md (pipeline DecisionBackend with no reranker in subsection, Tool Scope 14 rows incl ruff format, Quick Commands recount at HEAD); README.md (v1.2.10, [semantic] runtime description); CHANGELOG.md ([semantic], go/no-go per verdict, 1.2.10, .python-setup-decisions.json); config/ty.toml grep-zero sentence_transformers (verify at HEAD); docs/adr/README.md indexes 013..024; ADR-014/016 rewritten to HEAD truth, ADR-009/002/011 staleness notes, ADR-019..024 full Context/Decision/Consequences.",
        "Regen + gate table: ONLY golden-regen-hatch writes tests/data/golden (PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 locally, never under CI, double-run byte-identical, key-by-key diff vs shift reports, golden + tool counts together; no-op attestation with hash equality if all no-shift); final gate table {format exit, lint 14/14 per-tool, pytest counts, integration 9-collected-0-failed with env pinned, golden hash or regen diff, baseline [], docs checklist} with absolute green required (red routes to follow-ups, never baseline edits)."
      ],
      "scenarios": [
        "Scenario: Pyi scope closed without overstating enforcement\n  Given the spike verdict and golden impact count\n  When pyi branch merges\n  Then FIX shows strategy mechanism + shift report + (cleanup merged or I6 file list) with golden regen via hatch only, or ORPHAN-ONLY shows zero prod diff with scope-note text — and 'coding rules enforced' is not overstated either way",
        "Scenario: Iteration closes with evidence\n  Given all merges\n  When docs + hatch + gate table complete\n  Then docs grep per checklist, golden hash-equal or reviewed regen committed together, and the gate table records absolute green (format 0, lint zero new, pytest/integration per contract, baseline []); any red cell fails with routing to follow-ups"
      ]
    }
  ],
  "uncertainties": [
    {
      "id": "U1",
      "description": "Which decision model (if any) is license-clean, CPU-feasible on py3.14, and meets 90/95/85 on the heuristic-accepted stratum is unknown; 215/0 corpus defect + single-author labels + Fastino review + no CPU bench all open; GLiDE-0.4B is smallest-in-family (0.81GB bf16, CUDA-tested, torch 2.14/transformers 5.17, glide/ vendored pkg) so 'or smaller' needs a different family; CC-BY-NC excluded per allowlist.",
      "spikeOutlines": [
        "model-candidate-matrix (fact-finder, report-only): license, params/size, runtime, py3.14 CPU wheels, custom-code, pinnable revision; excludes CC-BY-NC, flags Fastino/unclear",
        "brush-off-corpus-pilot (fact-finder, report-only): two-pass blinded pilot N>=100 post-dedup, both strata non-empty, rubric + adjudication + agreement + splits, or explicit blocker; bias NOT fully repaired, human second rater still required for go/no-go",
        "model-eval-poc (poc, CPU-only, no committed files): ALL matrix candidates veto-only at 0.5/0.6/0.7 on deduped corpus; 90/95/85 compliance on heuristic-accepted stratum; cold-load/warm p50/p95 + RSS; GLIDE_MAX_BATCH=1 determinism; smallest compliant or no-go",
        "decision-runtime-pinning (test-assumptions, conditional on eval go): py3.14 CPU wheels + import/device/offline + custom-code pinning for chosen runtime; on no-go report-only skip, no file"
      ]
    },
    {
      "id": "U2",
      "description": "Whether pylint-pyi companion-stub skip is fixed (with latent stub cleanup + golden regen) or documented as orphan-only scope is unknown; fixing changes golden (42/43 on .py per old probe) and exposes large latent cleanup (205 symbols per old probe, verify at HEAD).",
      "spikeOutlines": [
        "pylint-pyi-scope-spike (fact-finder, report-only): reproduce companion vs orphan on tmp, recount golden impact + latent budget at HEAD, recommend fix-with-regen (with budget/regen plan) vs orphan-only (with scope-note text)"
      ]
    }
  ],
  "itemOutlines": [
    {
      "slug": "cache-contract-assumptions",
      "kind": "test-assumptions",
      "title": "Pin tracked-cache file and refresh contracts",
      "description": "Tests-only, NEW tests/assumptions/test_decision_cache_contracts.py ONLY (append-only; FORBIDDEN root __init__ + astroid/beartype/pylint contracts + test_pylint_cache_semantics.py, src, docs, tests/data, baseline). Red-test-exempt (pins future contract; M3 consumes without loosening). pytestmark no_external_api, test_<api>_given_<condition>_then_<expected>, offline, tmp_path only. Pin ADR-019 shape: sorted indent=2/sort_keys round-trip; no bare hex>=20 + detect-secrets clean on tmp cache; read-only hash (byte-hash before/after ordinary run_lint on tmp project unchanged); refresh CI-guard refuses under CI/GITHUB_ACTIONS (golden-guard shape); prune missing-files + stale-model-ids; --path retains unscanned; jobs==1 required else loud fail (reuse writer-first verdict, cite file:line, do not re-derive). Verify: new tests pass; format-clean; no other files.",
      "milestoneId": "M1",
      "deps": [],
      "prodBudgetHint": 0
    },
    {
      "slug": "backend-loading-assumptions",
      "kind": "test-assumptions",
      "title": "Pin backend loader gating and failure mapping",
      "description": "Tests-only, NEW tests/assumptions/test_decision_loader_contracts.py ONLY (same forbiddens as cache-contracts). Red-test-exempt. Pin at HEAD + M4 hook: PYTHON_SETUP_LINT_DECISION_BACKEND honored ONLY under PYTEST_CURRENT_TEST (both branches: honored with marker, ignored without — do not weaken _decision_backend.py:37-46); missing [semantic] extra / get_backend() None maps to check_if_meaningful heuristic bool (never raises, exactly-one structlog warning for DECISION_MODEL); PROMPT_VERSION folded into production model_id once wired (assert shape with prompt-vN suffix, FakeBackend already complies). Verify: new tests pass offline; format-clean.",
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
      "description": "Report-only, zero repo writes (no committed corpus in I5; poc consumes report tables). Collect N real repo suppressions + threshold 115-row table + brush-off/meaningful tables, DEDUPED by normalized justification (strip+collapse ws, keep case; target N>=100 post-dedup), stratified heuristic-rejected vs heuristic-accepted (both non-empty; report counts). Rubric: specific technical justification vs placeholder/deferral/brush-off (disclose edge-case rubric for terse borderlines). Rater protocol: pass-1 rates all; pass-2 re-rates blinded (shuffled, pass-1 hidden); disagreements resolved by documented adjudication rule (disclose rule); report inter-pass agreement + per-source/per-stratum split. Single-author bias NOT fully repaired — human second rater still required before any go/no-go (confirm-with-human). Or explicit blocker (collection/license/CPU) with I6 plan. No model choice here.",
      "milestoneId": "M1",
      "deps": [],
      "escalate": true,
      "prodBudgetHint": 0
    },
    {
      "slug": "model-eval-poc",
      "kind": "poc",
      "title": "CPU accuracy/latency evaluation (veto-only)",
      "description": "Prototype on tmp/venv only; zero committed files; network inside spike only. Consumes matrix + corpus reports (never invents candidates/labels). Mapping: justification=primary=(comment or text).strip(), rule=joined codes (current symbol where unavailable, recorded), context=code_context (None allowed); decision=prob>=threshold; VETO-ONLY final=heuristic AND (prob>=threshold) per ADR-014 (replace mode rejected — do not score). Smallest=lexicographic (params, weights bytes, CPU RSS, p50 latency). Score ALL matrix candidates at 0.5/0.6/0.7 (or explicit exclusion with reason): accuracy, meaningless-precision, meaningful-recall on heuristic-accepted stratum (overall also reported), CPU cold-load + warm p50/p95 + peak RSS, determinism check (GLIDE_MAX_BATCH=1 when caching; batching must not shift scores). Bars 90/95/85 apply to accepted stratum. Recommend smallest compliant model+prompt+threshold or no-go with evidence (license/CPU/accuracy blockers separated). Feeds runtime-pinning + M4 branch.",
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
      "description": "Conditional on eval verdict. GO maps to NEW tests/assumptions/test_decision_runtime_contracts.py ONLY (same forbiddens; no src changes): verify py3.14 CPU wheels linux/mac/win for chosen runtime, import/device/offline contract (CPU fallback, no network on cache-hit/memo-hit), custom-code pinning (vendored revision or PyPI pin, never unpinned trust_remote_code), loader/inference API signatures used by M4. NO-GO/BLOCKED maps to report-only skip, zero files, cite verdict section. Verify: new tests pass offline (or skip attested); format-clean.",
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
      "description": "Report-only, zero writes, tmp copies only. Reproduce at HEAD: tmp .pyi with companion .py (even syntactically broken — skipped?) vs orphan .pyi (linted, pyi-underscore fires?) with exact commands + outputs. Recount golden impact (pyi findings on .py vs .pyi) + latent budget (non-TYPE_CHECKING private symbols in src/**/*.pyi + duplicate-code findings on stubs) via grep at HEAD (old probe 42/43 and 205 symbols — verify, do not trust). Recommend fix-with-regen (mechanism: temp-tree/copy or pylint no-companion mode + cleanup budget + regen plan) vs document-orphan-only (scope-note text + stubtest governance). No prod change, no golden change here. Feeds M5 pyi-scope-fix.",
      "milestoneId": "M1",
      "deps": [],
      "prodBudgetHint": 0
    },
    {
      "slug": "checker-harness-dedup",
      "kind": "story",
      "title": "Single-source checker-test harness",
      "description": "Owns src/python_setup_lint/testing.py (_make_tc/_walk_and_release options only) + tests/checkers/test_*.py local _make_tc/_walk_and_release/_msg_ids wrappers ONLY (enumerate via grep at HEAD: ~13/10/8 per pack, verify actual; report full list). FORBIDDEN docs, baseline, tests/data, runner tests, conftest fixtures. Red-test-exempt (behavior-preserving refactor). Extend shared helpers with backward-compat open_checker bool default False + module_name passthrough (SourceRootMixin callers pass True; preserve open vs no-open shapes); delete all local copies (grep zero defs in tests/checkers/test_*.py); migrate importers; touched files toward naming/marker conventions. First writer: semantic-test-doubles-dedup serializes after via dep. Verify: testing.py options + tests only; pytest -q + integration no new failures vs I5 HEAD (1357/9 per pack, recount); golden hash-equal; format-clean.",
      "milestoneId": "M2",
      "deps": [],
      "prodBudgetHint": 30
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
      "description": "Tests-only. Owns tests/runner/_factories.py + _factories_extras.py + _factories_baseline.py + test_setup.py + test_setup_install.py + test_real_pipeline_smoke.py + tests/conftest.py (sample_project fixture lines only) ONLY. FORBIDDEN src, docs, baseline, tests/data, checker tests. Red-test-exempt. Single-source 2x _UvCallRecorder + 2x extra_block; delete dead helpers with grep-zero proof (assert_violation_contains_any, assert_r4_reason, baseline_entry_for_tool, sample_project — verify no call sites at HEAD, report each); smoke disposition: EITHER narrow to non-overlapping asserts (int return + markers that integration + fake orchestration do not already pin, with per-assert survivor analysis) OR delete with removal-to-survivor map to tests/integration.py + test_lint_runner_integration.py (never-test-linting boundary per 644774e precedent). Verify: tests only; no new failures; golden hash-equal; format-clean.",
      "milestoneId": "M2",
      "deps": [],
      "prodBudgetHint": 0
    },
    {
      "slug": "source-simplifications",
      "kind": "story",
      "title": "Simplify semantic memo, heuristic sets, rcfile paths",
      "description": "Owns src/python_setup_lint/checkers/_semantic.py (memo only) + _base.py (boilerplate/phrase sets only) + runner/dispatch.py (pyi/tests rcfile blocks only) + checkers/__init__.py (docstring only) + .pyi fidelity rows for touched symbols ONLY. FORBIDDEN _decision_backend.py/PROMPT_VERSION/DECISION_MODEL (M4), decisions/ + CLI threading (M3), testing.py (harness-dedup), no_try_import patterns (M4), tests/data, baseline, docs, tach.toml (M3). Behavior-preserving only (no threshold/key/behavior change): _semantic nullable memo + 2 globals maps to module dict + .clear() in _reset_cache; _base 46-token + 20-phrase sets maps to module-level frozensets (same literals, same membership); dispatch pyi/tests explicit-override-then-autodiscovery maps to shared _resolve_pylintrc path (same resolution order); checkers __init__ module docstring (runner/conformance pattern). Verify: prod <=40 lines; pytest + integration no new failures; lint 14/14 incl pylint/mypy/stubtest; golden hash-equal.",
      "milestoneId": "M2",
      "deps": [],
      "prodBudgetHint": 40
    },
    {
      "slug": "decision-cache-impl",
      "kind": "story",
      "title": "Implement tracked decision cache and refresh",
      "description": "Owns NEW python_setup_lint/decisions/_decision_cache.py + .pyi + __init__.py + tach.toml (sole owner: add decisions depends_on=[] + checkers/runner depends_on=[decisions]) + runner CLI threading (cli.py --refresh-decisions branch + help, types.py RunnerConfig.refresh_decisions bool False, _cli_complexity.py parse/build threading; --path reuses existing plumbing) + NEW tests/decisions/test_decision_cache.py + NEW tests/runner/test_refresh_decisions.py ONLY. FORBIDDEN _base/_semantic/_decision_backend (zero diff; observation via checker-layer file identity, not semantic API change), dispatch*/__init__/baseline/parsers (except CLI threading files), tests/data, baseline, docs, .gitignore/hatch/.secrets.baseline. Implements ADR-019: array sorted (rule, justification, model), indent2 sort_keys, entry + {version, prompt hash, last-seen}, score+decision, secrets-clean (no hex>=20); read-only lint (hash-asserted zero writes); explicit refresh (lockfile + merge + atomic replace in target dir, DECISIONS_PATH test-only under PYTEST_CURRENT_TEST, production root config.cwd with traversal guard, prune auto missing/stale, --path retains unscanned, jobs==1 else loud fail, CI-fail); observation producer ATOMICALLY here (refresh collects file via node.root().file + justification + rule + model + score during checker walk on refresh only — never prune-only; cite producer lines). Must pass all 14 tools incl tach + detect-secrets. Verify: tmp round-trip double-run byte-identical; zero-writes hash; refresh merges+prunes+sorts; CI-fail + isolation + jobs-guard tests; no new failures; golden hash-equal or shift-reported (expect no-shift: empty cache + no model maps to heuristic preserved).",
      "milestoneId": "M3",
      "deps": [
        "cache-contract-assumptions"
      ],
      "escalate": true,
      "prodBudgetHint": 200
    },
    {
      "slug": "semantic-on-golden-pin",
      "kind": "story",
      "title": "Pin semantic-on veto path with fake backend",
      "description": "Tests-only, no model needed. Owns NEW tests/test_semantic_on_veto.py (or tests/checkers/test_semantic_on_veto.py — item reports placement; verify no conftest cycle) ONLY. FORBIDDEN src, docs, tests/data/golden writes (hatch sole writer), baseline. Red-test-exempt (contract pin; veto already at HEAD so tests pass immediately). SEMANTIC=1 + FakeBackend(1.0/0.0) over existing sample project (no fixture change): 1.0 preserves heuristic accepts, 0.0 vetoes them, brush-off never reaches backend (call-count 0 via _RecordingBackend), one call per unique pair (memo hit), cache-hit without model emits persisted verdict (tmp cache from M3); exactly one slow+with_real_api e2e SKELETON (skipped with reason 'no model wired' until M4 go; on go, model-backend-wiring wires it with importorskip + CPU budget). Modules <=500, no suppressions, never test linting. Verify: default suite passes (fake only, no network); skeleton skips; SEMANTIC=0 golden hash-equal.",
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
      "description": "Branches on U1 verdict (consumed, not advisory). GO (eval recommends compliant model + license allowlist pass + CPU bench pass + runtime-pinning merged): owns _decision_backend.py/.pyi (production loader only) + pyproject [semantic] block + uv.lock + no_try_import _OPTIONAL_IMPORT_PATTERNS + tests/checkers/test_decision_backend.py (packaging pins) + test_no_try_import_checker.py (patterns) + slow e2e skeleton wiring ONLY; FORBIDDEN _semantic/_base (zero diff; PROMPT_VERSION folded in loader model_id string, not adapter), decisions/, dispatch/CLI, tests/data, baseline, docs (snippet in report). Implement ADR-020: DECISION_MODEL '<id> rev <short12>' parsed, loader constructs backend with model_id '<id> rev <short12> prompt-vN', GLIDE_MAX_BATCH=1 when caching (if glide), failure maps to None maps to heuristic with exactly-one warning (no retry storm); replace emptiness pins with allowlist pins (chosen runtime only, base install stays light); wire slow e2e to real backend (importorskip, CPU budget asserts per eval). NO-GO/BLOCKED: zero prod writes, merge no-op attestation citing verdict section + blocker + I6 plan (heuristic-only preserved). Verify GO: slow e2e passes with model, default suite no network, SEMANTIC=0 golden hash-equal, lint 14/14, uv.lock resolves; NO-GO: attestation + zero-diff proof.",
      "milestoneId": "M4",
      "deps": [
        "model-eval-poc",
        "decision-runtime-pinning",
        "decision-cache-impl",
        "semantic-on-golden-pin",
        "semantic-test-doubles-dedup"
      ],
      "escalate": true,
      "prodBudgetHint": 80
    },
    {
      "slug": "pyi-scope-fix",
      "kind": "story",
      "title": "Fix or scope pylint-pyi companion stubs",
      "description": "Branches on pyi spike verdict. FIX-WITH-REGEN: owns _PylintPyiLintTool strategy (dispatch.py pyi block only, applied onto M2 deduped shape) + shift report ONLY; mechanism (temp-tree/copy or pylint no-companion mode) proven by broken-stub control (before: skipped, after: linted with pyi-underscore firing); latent stub cleanup EITHER in-budget here (<=200 prod lines across stubs, same item, with per-file counts) OR routed to I6 follow-ups with explicit file:line list (item reports which; never baseline edits); emits shift report {class, added/removed keys, CHANGELOG snippet, file:line} for hatch. ORPHAN-ONLY: zero prod writes, scope-note text for docs item (companion .pyi governed by mypy.stubtest only; pyi-underscore enforces orphan stubs), no golden change. FORBIDDEN tests/data (hatch sole writer), baseline, docs (text in report), other dispatch blocks. Verify FIX: control proves mechanism, no new failures except shift-reported pyi keys, golden regen via hatch only; ORPHAN: zero-diff proof.",
      "milestoneId": "M5",
      "deps": [
        "pylint-pyi-scope-spike",
        "source-simplifications"
      ],
      "escalate": true,
      "prodBudgetHint": 60
    },
    {
      "slug": "docs-adr-reconciliation",
      "kind": "story",
      "title": "Reconcile docs, ADRs, and version pins",
      "description": "Docs-only, sole writer in I5. Owns docs/semantic-justification.md + docs/custom-checks.md (semantic bullets only) + docs/troubleshooting.md (semantic section + counts) + docs/tutorials.md (semantic lines) + AGENTS.md + README.md + CHANGELOG.md + config/ty.toml (comment only, grep-zero sentence_transformers — verify at HEAD) + docs/adr/ADR-014.md + ADR-016.md (rewrite to HEAD truth) + ADR-009/002/011 (staleness notes) + docs/adr/README.md (index 013..024) + NEW ADR-019..024 (full Context/Decision/Consequences per plan) ONLY. FORBIDDEN src, tests, tests/data, baseline, tach.toml. Red-test-exempt. Counts from rerun actuals at HEAD (pytest --collect-only, TOOLS==14, integration 9-collected-0-failed with env pinned); exact-strings per M5 checklist (report grep proof per row); CHANGELOG user-visible (extra contents per M4 branch, new/deprecated vars incl full PYTHON_SETUP_LINT_DECISION_MODEL, cache file, go/no-go note, version 1.2.10); README v1.2.10 pin; AGENTS pipeline DecisionBackend with no reranker in subsection + Tool Scope 14 rows. Verify: docs-only diff; rumdl clean; no new failures; golden hash-equal (no behavior change).",
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
      "description": "Report-only, zero writes. Record final gate table at HEAD: format exit 0 (ruff format --check --config config/ruff.toml src tests); lint 14/14 per-tool (uv run lint; cite exit + per-tool PASSED + duration); pytest -q counts (pass/deselect/warnings, cite); integration 9-collected-0-failed with pre-commit env pinned (cite env + 9 passed); golden hash or regen diff (cite hatch report); baseline []; docs exact-strings per M5 checklist (cite grep proof per row from docs item). Absolute green required here (M5 only); red cells fail with routing to I6 follow-ups (new root items by file owner), never baseline edits. Feeds close-up.",
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
      "assumption": "Integration contract is 9 collected, 0 failed with pre-commit env pinned (9 passed with it per I5 pack 56.6s; 7 passed + 2 skipped without per skip logic). AGENTS.md reconciled to recount at HEAD.",
      "why": "tests/integration.py skip logic; unconditional 9/9 fails on minimal envs while stale 7 under-reports."
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
      "assumption": "Cache file location/name is .python-setup-decisions.json at the linted project root (next to lint.baseline), committed, no hatch entry, secrets-clean; weights in user model cache, never git.",
      "why": "Decisions depend on project content and must reproduce in that project's CI without the model; committed file affects gitignore/hatch/consumers/secrets; operator acknowledged root placement in I1.",
      "disposition": "confirm with human"
    }
  ],
  "techDebt": [
    {
      "id": "TD5-B1",
      "description": "No compliant model proven (215/0 unevaluable, single-author labels, Fastino review open, no CPU bench).",
      "category": "blocking",
      "resolution": "U1 spikes + M4 branch (go only on license+CPU+corpus gates with human approval; else no-op attestation + heuristic-only docs); backend/cache built against FakeBackend so a compliant model plugs via get_backend()."
    },
    {
      "id": "TD5-B2",
      "description": "I4 cache producer gap (awareness: refresh prune-only until producer; decisions/ missing at HEAD so gap is unmerged, not live).",
      "category": "blocking",
      "resolution": "ADR-019 + decision-cache-impl owns storage + observation producer atomically (checker-layer file identity during refresh only); M3 acceptance requires end-to-end population proof on tmp (not prune-only); no split."
    },
    {
      "id": "TD5-I1",
      "description": "Pylint-pyi blind spot (42/43 findings on .py, latent private stub symbols, companion stubs unenforced per old probe).",
      "category": "impacting",
      "resolution": "pyi-scope-spike recounts at HEAD + recommends; M5 pyi-scope-fix branches fix-with-regen (strategy + bounded cleanup + hatch regen) vs orphan-only doc note; over-budget cleanup routes to I6 follow-ups; golden unchanged unless fix merges via hatch."
    },
    {
      "id": "TD5-I2",
      "description": "Semantic-on behavior unpinned (golden + integration capture with SEMANTIC=0; model could change W9704/W9738 silently).",
      "category": "impacting",
      "resolution": "semantic-on-golden-pin adds deterministic fake-backend integration (default suite) + slow skeleton (skipped until model); M4 wiring asserts no SEMANTIC=0 drift; golden stays SEMANTIC=0 per ADR-021."
    },
    {
      "id": "TD5-A1",
      "description": "Docs/ADR drift (semantic-justification, custom-checks, troubleshooting, tutorials, AGENTS.md counts/scope/pipeline, README, CHANGELOG, ty.toml, ADR-002/009/011/014/016 staleness, ADR index omits 013..016).",
      "category": "adjacent",
      "resolution": "docs-adr-reconciliation sole writer with exact-strings checklist; ADRs 019..024 formalize I5 decisions."
    },
    {
      "id": "TD5-A2",
      "description": "Test-harness duplication + dead code (13 _make_tc, 10 _walk_and_release, 8 _msg_ids, 3 _RecordingBackend, 2 _UvCallRecorder, 2 extra_block, 2 _semantic_disabled, dead helpers, vestigial cache tests, smoke overlap) + source placeholders (globals, per-call sets, rcfile dup, missing docstring).",
      "category": "adjacent",
      "resolution": "M2 items single-source/delete/simplify with grep-zero proofs + survivor maps; behavior identical."
    },
    {
      "id": "TD5-A3",
      "description": "Pre-existing tracked junk file ':bash' reported in I4 wave 6 (verify at HEAD via git ls-files) + minor version drift (pyproject 1.2.10 vs CHANGELOG v1.2.9).",
      "category": "adjacent",
      "resolution": "Operator deletes ':bash' outside iteration (no item owns root junk; final-gate-validation reports presence); docs item pins versions."
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
      "title": "Tracked-cache keying, file identity, and refresh contract (I5)",
      "context": "ADR-010 freezes backend + tracked-cache contracts but leaves file-identity vs path-free API, key composition, score vs verdict, refresh shape, CI direction, isolation scope, sort key, prune policy, --path scoping, jobs>1 behavior unspecified (I5 pack Q3). semantic_check is deliberately path-free (test_pylint_cache_semantics.py:171-181) and callers pass no paths; memo key includes code_context + 64-bit truncation; no CLI surface exists; secrets baseline enables HexHighEntropyString; writer-first verdict pins jobs=1 sequential. I4 ADR-017/018 planned lint-flag refresh + decisions-module placement but never merged (files missing at HEAD).",
      "decision": "Re-affirm ADR-017/018 shape with I5 resolutions: (1) semantic_check stays path-free; file identity supplied at checker layer via observation producer during refresh only (node.root().file into decisions API; normal lint path unchanged, zero _base/_semantic diff for identity). (2) Tracked key is (justification normalized [strip+collapse ws, keep case], rule joined codes, model '<id> rev <short12> prompt-vN'); context is model input only, NOT in key. (3) Store score float [0,1] + decision bool (re-thresholdable without re-running model; protocol range enforced by loader clamp + test). (4) Refresh is lint --refresh-decisions [--path ...] (setup-subcommand rejected); FAILS under CI/GITHUB_ACTIONS (golden-guard shape); DECISIONS_PATH test-only under PYTEST_CURRENT_TEST only; production root config.cwd with traversal guard (no parent escape/absolute outside); array sorted (rule, justification, model), indent=2 sort_keys; files sorted unique POSIX, union-merged; prune automatic missing/stale (no --prune flag); --path retains unscanned; jobs==1 required else loud fail (no sidecars). (5) Placement python_setup_lint/decisions/_decision_cache.py + .pyi; checkers/runner depends_on=[decisions]; decisions depends_on=[]; cache-impl sole tach.toml owner. (6) No .gitignore change (root file committed), no hatch entry (consumer-runtime data), no bare hex>=20 (secrets-clean).",
      "consequences": "Single refresh contract for M1 assumptions + M3 impl; implementation owns storage + producer atomically (no prune-only gap); normal lint read-only provable by hash; deterministic serialization provable by sort key; secrets + tach scans clean; M3 tests assert all branches on tmp."
    },
    {
      "id": "ADR-020",
      "title": "Model gating and default-off wiring for I5",
      "context": "Intent names GLiDE-0.4B or smaller; GLiDE is 0.4B/0.81GB bf16/CUDA-tested/torch 2.14/transformers 5.17/glide-vendored/Fastino Community License (commercial revenue gate + attribution + copyleft derivatives) vs MIT project; smallest-in-family so 'or smaller' needs a different family; ADR-009 corpus gate untouched (215/0 single-author, no corpus artifacts, no CPU bench); get_backend has no production path (DECISION_MODEL warn-only, PROMPT_VERSION dead); veto semantics mean default-on tightens W9704/W9738 for every consumer installing the extra.",
      "decision": "Gate wiring on U1 verdict with allowlist (Apache-2.0/MIT/BSD allowed; CC-BY-NC excluded; Fastino/unclear flagged for human review; no ship without license verdict + human approval if Fastino recommended) + CPU bench (cold-load/warm p50/p95 + RSS on target class, GLIDE_MAX_BATCH=1 determinism when caching) + corpus pilot (N>=100 post-dedup, both strata, rubric + two-pass blinded + adjudication + agreement; human second rater still required for go/no-go). Veto-only evaluation at 0.5/0.6/0.7; bars 90/95/85 on heuristic-accepted stratum; smallest compliant or no-go. Wiring (on go only): [semantic] gains pinned runtime (CPU wheels, base stays light), loader via DECISION_MODEL with PROMPT_VERSION folded, failure maps to None maps to heuristic with exactly-one warning (no retry storm), no_try_import + emptiness pins updated deliberately, uv.lock regenerated. Default heuristic-only until M4 go merges; semantic-on pinned by M4 fake-backend integration regardless. On no-go/blocked: zero prod writes, no-op attestation, heuristic-only docs.",
      "consequences": "No silent swap; gates stay offline/fast/deterministic; packaging change only on compliant verdict; close-up must not claim swap complete on no-go; I6 triggers explicit (independent rater, Fastino decision, CPU bench)."
    },
    {
      "id": "ADR-021",
      "title": "Semantic-on behavior pinning",
      "context": "Golden + integration capture with SEMANTIC=0 (tests/integration.py:110-115; tests/_golden.py:54), so model-enabled W9704/W9738 outcomes unpinned; a model could pass the suite while changing consumer behavior; veto extremes (Fake 1.0 preserves, 0.0 vetoes) deterministic without network.",
      "decision": "Pin veto path with (1) deterministic fake-backend integration (SEMANTIC=1 + FakeBackend 0.0/1.0 over existing sample, default-collected, no network, no fixture change): 1.0 preserves heuristic accepts, 0.0 vetoes them, brush-off never reaches backend (call-count 0), one call per unique pair (memo hit), cache-hit without model emits persisted verdict; (2) exactly one slow+with_real_api e2e SKELETON (skipped 'no model wired' until go; on go wired with importorskip + CPU budgets). Golden stays SEMANTIC=0 (heuristic contract); semantic-on contract lives in new tests, not the golden file.",
      "consequences": "Veto tightening visible before any model ships; no golden churn for semantic-on; real-model coverage gated behind slow + importorskip; M4 wiring asserts no SEMANTIC=0 drift."
    },
    {
      "id": "ADR-022",
      "title": "Test-harness single-sourcing and debloat acceptance",
      "context": "Measured duplication at HEAD (13 _make_tc, 10 _walk_and_release, 8 _msg_ids with open()/module_name variance; 3 _RecordingBackend; 2 _UvCallRecorder; 2 extra_block; 2 _semantic_disabled; dead helpers; vestigial raising=False cache tests; smoke overlapping integration + fake orchestration) vs behavior contracts (115-row heuristic table, W9704/W9738 checker tests, golden 158). 'Never test linting' defined only by 644774e prune precedent. No line-reduction metric beyond C0302/R0912/R0915 + empty baseline.",
      "decision": "Single-source harness helpers with variance-preserving options (testing.py open_checker/module_name with backward-compat defaults; one home per double/fixture with reported placement + import graph); delete dead helpers only with grep-zero no-call-site proof; rewrite (not loosen) vestigial cache tests to live hash/tmp contracts; smoke kept-narrowed (non-overlapping asserts with per-assert survivor analysis) or deleted with removal-to-survivor map to integration + fake orchestration; 115-row table + checker behavior + golden preserved byte-identical; touched modules <=500, no new suppressions, toward naming/marker conventions. Acceptance is grep-zero + no-new-failures + golden hash-equal, not line-count delta.",
      "consequences": "Debloat without intent loss; no gate-duplicating tests reintroduced; future harness changes have single homes; QA verifies by grep + gates, not LOC."
    },
    {
      "id": "ADR-023",
      "title": "Root-serialized delivery continued for I5",
      "context": "I3 epic gate stalled (retry + 3 empty waves, Blocked none, M2 zero delivery per closeup-3); I4 ADR-013 abandoned epics for root items with file-level single-writer + dep serialization, unblocking M2 verified + M3/M4 partials; I4 closeup shows 2 running + 3 pending carried by file ownership, not epic close-ups; review requires file-level proof for parallel items.",
      "decision": "I5 ships no child epics; all work as 18 root items with file-level single-writer for parallel items plus dep serialization for handoffs (harness-dedup into semantic-doubles; matrix+corpus into eval into runtime-pinning; cache-contracts into cache-impl into golden-pin into backend-wiring; pyi-spike + source-simplifications into pyi-fix; all behavior + debloat into docs; all behavior into hatch into gate table). No replanAfter gates; spike verdicts consumed via deps with pre-planned go/no-go and fix/orphan branches (no-op attestations on blocked, never invented alternatives). I6 may reintroduce epics or continue root increments.",
      "consequences": "9 dep-free wave-1 items avoid empty waves; no epic close-up/handoff bottleneck; M5 hatch consumes item shift declarations directly; parallel same-file forbidden, sequential same-file only via explicit deps."
    },
    {
      "id": "ADR-024",
      "title": "Pylint-pyi scope resolution process",
      "context": "ADR-015 defers fix to I5; _PylintPyiLintTool passes .pyi paths but pylint lints companion .py (42/43 golden on .py per old probe); 205 latent private stub symbols; fixing changes golden + exposes cleanup, conflicting with preservation unless staged via hatch; strategy fix vs scope note still unknown at plan time.",
      "decision": "Resolve by spike then branch: M1 pyi-scope-spike reproduces companion-vs-orphan on tmp + recounts golden impact + latent budget at HEAD + recommends fix-with-regen (mechanism + cleanup budget + regen plan) vs orphan-only (scope-note text). M5 pyi-scope-fix consumes verdict: FIX implements strategy mechanism (proven by broken-stub control) + shift report + in-budget cleanup (<=200 prod lines) or I6 file-list routing (never baseline edits), golden via hatch only; ORPHAN-ONLY merges zero prod diff with scope-note text for docs (companion .pyi governed by mypy.stubtest). 'Coding rules enforced' not overstated either way.",
      "consequences": "Golden stable unless fix merges via hatch; latent cleanup budgeted explicitly; I6 follow-ups concrete if over-budget; docs state scope truthfully."
    }
  ]
}

## Plan Review Feedback
{
  "status": "changes_requested",
  "summary": "Blocked: orphaned loader deps, M1 future-pins unpassable, producer/checker ownership gap, subprocess call-counts unobservable, last-seen vs byte-identical clash, jobs/hash/tach underspecified, human gates missing.",
  "suggestions": [
    {
      "detail": "No item depends on backend-loading-assumptions: cache-impl->cache-contracts only; backend-wiring deps eval/runtime/cache/pin/doubles, no loader. Violates M1 S1 'M3/M4 consume via deps'. Also duplicates test_decision_backend.py:117-135 honors/ignores + warn-once. Fix: add backend-wiring dep on loader-contracts; narrow loader-contracts to delta vs existing or fold PROMPT-shape into runtime-pinning; define prod model_id shape (not Fake-only).",
      "disposition": "fix",
      "id": "loader-contracts-orphaned-duplicate",
      "location": {
        "file": "src/python_setup_lint/checkers/_decision_backend.py",
        "line": 37
      },
      "summary": "Loader assumptions orphaned with no consumer and duplicate existing pins"
    }
  ]
}

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
amendments: 0
items:
  (none scheduled yet)
waves: (none)
merged: (none)
blocked: (none)
failed: (none)
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
