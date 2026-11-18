# Step: Architect Consult (Item)

## Goal
Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.

## Rules
- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — `modernize` (iteration 5 starting state)

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
5. Any ADR-009 gate closure needs a corpus/license/CPU-benchmark decision that cannot be inferred from the repository today.`). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.

## Item
decision-cache-impl

## Assignment
{"slug":"decision-cache-impl","kind":"dev","title":"Implement tracked decision cache and refresh","assignment":"Owns NEW python_setup_lint/decisions/_decision_cache.py/.pyi + refresh threading (runner/cli.py --refresh-decisions branch + help text, runner/types.py RunnerConfig.refresh_decisions: bool = False field, runner/_cli_complexity.py _parse_config_args/_build_runner_config threading; --path scoping reuses existing --path plumbing) + tach.toml (sole owner: add decisions module depends_on=[] + checkers/runner depends_on=[decisions]) ONLY, applied onto final runner shape after dispatch split; FORBIDDEN _base/_semantic/_decision_backend, dispatch*/__init__/baseline/parsers, tests/data, baseline. If spike verdict is blocked: merge a no-op attestation citing the blocker (zero prod writes) instead of implementing. Else implement ADR-017 contract as validated by spike (array sorted by (rule, justification, model), indent2 sort_keys; entry + {version, prompt hash, last-seen}; secrets-clean encoding; read-only lint hash-asserted zero writes; explicit refresh lockfile + merge + atomic replace in target dir with DECISIONS_PATH test-only isolation; prune auto missing/stale; --path scoping; jobs==1 required else loud fail; CI-fail). Must pass all tools incl detect-secrets and tach check. Existing gate contracts unchanged. Verify: tmp round-trip; zero-writes hash; refresh merges + prunes + sorts deterministically (double-run byte-identical); CI-fail + isolation + jobs-guard tests; no new failures vs M1 table; golden hash-equal or shift-reported.","outlineRef":"decision-cache-impl","milestone":"M4","wave":4,"deps":["decision-cache-design-spike","runner-compat-shim-removal","runner-dispatch-split"],"scenarioRefs":["M4: Cache read-only plus explicit refresh"],"citations":["src/python_setup_lint/checkers/_semantic.py:37-52","src/python_setup_lint/checkers/_semantic.py:125-189","docs/semantic-justification.md:34-45",".gitignore:243-244"]}

## Prior Attempts & Failures
2 attempts recorded for qa (all rejected); next would be 3 > max 2

Failing checks:
[red-test] red-test: suite failed collection when prod restored: tests.decisions.test_decision_cache: collection failure. Command: uv run pytest tests/decisions/test_decision_cache.py tests/runner/test_refresh_decisions.py --junitxml=/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/junit-redtest-1794211404727-t80ezvpzek.xml

## Current Diff
.factory/tasks/modernize/closeup-4.yaml +0/-18
.factory/tasks/modernize/concerns/rm-717ccdc143.yaml +0/-18
.factory/tasks/modernize/context-pack.md +263/-381
.factory/tasks/modernize/decisions/012-item-decision-cache-impl.yaml +0/-29
.factory/tasks/modernize/decisions/013-item-ownership-map-revalidation-abandon.yaml +0/-8
.factory/tasks/modernize/decisions/014-item-pylint-cache-assumptions-1.yaml +0/-26
.factory/tasks/modernize/decisions/015-item-pylint-cache-assumptions-abandon.yaml +0/-8
.factory/tasks/modernize/decisions/016-item-checkers-stream-helper-1.yaml +0/-33
.factory/tasks/modernize/decisions/017-item-checkers-stream-helper-2.yaml +0/-28
.factory/tasks/modernize/decisions/018-item-checkers-stream-helper-3.yaml +0/-31
.factory/tasks/modernize/decisions/019-item-checkers-stream-helper-4.yaml +0/-29
.factory/tasks/modernize/items/decision-cache-impl/steps/001-test-first-r1-a1/checks.yaml +47/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/001-test-first-r1-a1/input.md +68/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/001-test-first-r1-a1/meta.yaml +19/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/001-test-first-r1-a1/output.yaml +81/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/002-develop-r1-a1/checks.yaml +94/-43
.factory/tasks/modernize/items/decision-cache-impl/steps/002-develop-r1-a1/input.md +97/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/002-develop-r1-a1/meta.yaml +19/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/002-develop-r1-a1/output.yaml +94/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/003-develop-r1-a2/checks.yaml +246/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/003-develop-r1-a2/input.md +124/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/003-develop-r1-a2/meta.yaml +19/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/003-develop-r1-a2/output.yaml +87/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/004-qa-r1-a1/checks.yaml +110/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/004-qa-r1-a1/input.md +2287/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/004-qa-r1-a1/meta.yaml +19/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/004-qa-r1-a1/output.yaml +45/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/005-develop-r2-a1/checks.yaml +247/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/005-develop-r2-a1/input.md +4756/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/005-develop-r2-a1/meta.yaml +19/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/005-develop-r2-a1/output.yaml +25/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/006-qa-r2-a1/checks.yaml +185/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/006-qa-r2-a1/input.md +9862/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/006-qa-r2-a1/meta.yaml +13/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/007-qa-r2-a2/checks.yaml +185/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/007-qa-r2-a2/input.md +19400/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/007-qa-r2-a2/meta.yaml +13/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/008-qa-r1-a1/checks.yaml +185/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/008-qa-r1-a1/input.md +18229/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/008-qa-r1-a1/meta.yaml +13/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/009-qa-r1-a2/checks.yaml +185/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/009-qa-r1-a2/input.md +17401/-0
.factory/tasks/modernize/items/decision-cache-impl/steps/009-qa-r1-a2/meta.yaml +13/-0
.factory/tasks/modernize/items/never-test-linting-prune/steps/001-develop-r1-a1/input.md +0/-60
.factory/tasks/modernize/items/never-test-linting-prune/steps/001-develop-r1-a1/meta.yaml +0/-19
.factory/tasks/modernize/items/never-test-linting-prune/steps/001-develop-r1-a1/output.yaml +0/-66
.factory/tasks/modernize/items/never-test-linting-prune/steps/002-review-r1-a1/input.md +0/-1200
.factory/tasks/modernize/items/never-test-linting-prune/steps/002-review-r1-a1/meta.yaml +0/-19
.factory/tasks/modernize/items/never-test-linting-prune/steps/002-review-r1-a1/output.yaml +0/-18
.factory/tasks/modernize/items/secrets-triage-spike/merge-attempts.yaml +0/-2
.factory/tasks/modernize/items/secrets-triage-spike/steps/001-research-r1-a1/input.md +0/-63
.factory/tasks/modernize/items/secrets-triage-spike/steps/001-research-r1-a1/meta.yaml +0/-19
.factory/tasks/modernize/items/secrets-triage-spike/steps/001-research-r1-a1/output.yaml +0/-248
.factory/tasks/modernize/items/secrets-triage-spike/steps/002-review-r1-a1/input.md +0/-419
.factory/tasks/modernize/items/secrets-triage-spike/steps/002-review-r1-a1/meta.yaml +0/-19
.factory/tasks/modernize/items/secrets-triage-spike/steps/002-review-r1-a1/output.yaml +0/-63
.factory/tasks/modernize/items/secrets-triage-spike/steps/003-research-r2-a1/input.md +0/-74
.factory/tasks/modernize/items/secrets-triage-spike/steps/003-research-r2-a1/meta.yaml +0/-19
.factory/tasks/modernize/items/secrets-triage-spike/steps/003-research-r2-a1/output.yaml +0/-227
.factory/tasks/modernize/items/secrets-triage-spike/steps/004-review-r1-a1/input.md +0/-18318
.factory/tasks/modernize/items/secrets-triage-spike/steps/004-review-r1-a1/meta.yaml +0/-19
.factory/tasks/modernize/items/secrets-triage-spike/steps/004-review-r1-a1/output.yaml +0/-4
.factory/tasks/modernize/journal.ndjson +0/-342
.factory/tasks/modernize/plan/edits-5.0.yaml +0/-3
.factory/tasks/modernize/plan/edits-5.yaml +0/-3
.factory/tasks/modernize/plan/plan-5.yaml +0/-1081
.factory/tasks/modernize/runs/104-consult-decision-cache-impl-a1/input.md +0/-909
.factory/tasks/modernize/runs/104-consult-decision-cache-impl-a1/meta.yaml +0/-17
.factory/tasks/modernize/runs/104-consult-decision-cache-impl-a1/output.yaml +0/-25
.factory/tasks/modernize/runs/105-wave-close-up-4-4-a1/input.md +0/-339
.factory/tasks/modernize/runs/105-wave-close-up-4-4-a1/meta.yaml +0/-18
.factory/tasks/modernize/runs/105-wave-close-up-4-4-a1/output.yaml +0/-22
.factory/tasks/modernize/runs/106-architect-wave-report-4-4-a1/input.md +0/-12835
.factory/tasks/modernize/runs/106-architect-wave-report-4-4-a1/meta.yaml +0/-17
.factory/tasks/modernize/runs/106-architect-wave-report-4-4-a1/output.yaml +0/-10
.factory/tasks/modernize/runs/107-wave-close-up-4-5-a1/input.md +0/-339
.factory/tasks/modernize/runs/107-wave-close-up-4-5-a1/meta.yaml +0/-18
.factory/tasks/modernize/runs/107-wave-close-up-4-5-a1/output.yaml +0/-13
.factory/tasks/modernize/runs/108-architect-wave-report-4-5-a1/input.md +0/-12827
.factory/tasks/modernize/runs/108-architect-wave-report-4-5-a1/meta.yaml +0/-17
.factory/tasks/modernize/runs/108-architect-wave-report-4-5-a1/output.yaml +0/-12
.factory/tasks/modernize/runs/109-wave-close-up-4-6-a1/input.md +0/-339
.factory/tasks/modernize/runs/109-wave-close-up-4-6-a1/meta.yaml +0/-18
.factory/tasks/modernize/runs/109-wave-close-up-4-6-a1/output.yaml +0/-27
.factory/tasks/modernize/runs/110-architect-wave-report-4-6-a1/input.md +0/-12834
.factory/tasks/modernize/runs/110-architect-wave-report-4-6-a1/meta.yaml +0/-17
.factory/tasks/modernize/runs/110-architect-wave-report-4-6-a1/output.yaml +0/-13
.factory/tasks/modernize/runs/111-plan-close-up-4-a1/input.md +0/-694
.factory/tasks/modernize/runs/111-plan-close-up-4-a1/meta.yaml +0/-18
.factory/tasks/modernize/runs/111-plan-close-up-4-a1/output.yaml +0/-79
.factory/tasks/modernize/runs/112-architect-closeup-4-a1/input.md +0/-1376
.factory/tasks/modernize/runs/112-architect-closeup-4-a1/meta.yaml +0/-17
.factory/tasks/modernize/runs/112-architect-closeup-4-a1/output.yaml +0/-47
.factory/tasks/modernize/runs/113-context-pack-5-a1/input.md +0/-212
.factory/tasks/modernize/runs/113-context-pack-5-a1/meta.yaml +0/-18
.factory/tasks/modernize/runs/113-context-pack-5-a1/output.yaml +0/-623
.factory/tasks/modernize/runs/114-architect-plan-5-a1/input.md +0/-15915
.factory/tasks/modernize/runs/114-architect-plan-5-a1/meta.yaml +0/-17
.factory/tasks/modernize/runs/114-architect-plan-5-a1/output.yaml +0/-901
.factory/tasks/modernize/runs/115-plan-review-5-1-a1/input.md +0/-745
... and 85 more files

## Review Feedback
Failing check: red-test

Message: red-test: suite failed collection when prod restored: tests.decisions.test_decision_cache: collection failure. Command: uv run pytest tests/decisions/test_decision_cache.py tests/runner/test_refresh_decisions.py --junitxml=/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/junit-redtest-1794211404727-t80ezvpzek.xml

Detail:
{
  "command": "uv run pytest tests/decisions/test_decision_cache.py tests/runner/test_refresh_decisions.py --junitxml=/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/junit-redtest-1794211404727-t80ezvpzek.xml",
  "junitCaseCount": 1,
  "junitCaseIds": [
    "tests.decisions.test_decision_cache"
  ],
  "junitTruncated": false,
  "collected": false,
  "collectionErrors": [
    "tests.decisions.test_decision_cache: collection failure"
  ]
}

Output tail:
============================= test session starts ==============================
platform linux -- Python 3.14.4, pytest-9.1.0, pluggy-1.6.0
rootdir: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/red-test-wt-BR8XbF
configfile: pyproject.toml
plugins: tach-0.35.0, hypothesis-6.155.7, typeguard-4.5.2
collected 6 items / 1 error
[Tach] 6 tests in 32 files unaffected by changes. Skip with: pytest --tach
[Tach] To disable: pytest -p no:tach (https://docs.gauge.sh/usage/commands#using-the-pytest-plugin-directly)

==================================== ERRORS ====================================
___________ ERROR collecting tests/decisions/test_decision_cache.py ____________
ImportError while importing test module '/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/red-test-wt-BR8XbF/tests/decisions/test_decision_cache.py'.
Hint: make sure your test modules/packages have valid Python names.
Traceback:
/usr/lib/python3.14/importlib/__init__.py:88: in import_module
    return _bootstrap._gcd_import(name[level:], package, level)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
tests/decisions/test_decision_cache.py:18: in <module>
    from python_setup_lint.decisions._decision_cache import (
E   ImportError: cannot import name 'refresh_blockers' from 'python_setup_lint.decisions._decision_cache' (/home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/red-test-wt-BR8XbF/src/python_setup_lint/decisions/_decision_cache.py)
- generated xml file: /home/slava/aiexp/python-setup.factory-wt/.factory-runtime/tmp/junit-redtest-1794211404727-t80ezvpzek.xml -
=========================== short test summary info ============================
ERROR tests/decisions/test_decision_cache.py
!!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
=============================== 1 error in 2.28s ===============================

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
