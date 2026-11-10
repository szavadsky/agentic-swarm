# Step: Architect Wave Report

## Goal
Evaluate the results of a completed execution wave, assess spike findings and accumulated debt, and decide the iteration path.

## Rules
- Exploration budget: evaluate wave progress from the current plan, wave report, spike findings, and the prepared context pack (`# Context Pack — `modernize`

> Repository: `python-setup` v1.2.10, `requires-python = ">=3.14"` (`pyproject.toml:4`), branch `topic/modernize`. All citations are `path:line` at HEAD. Line numbers verified 2026-11-07.
> Size: 8,890 LOC in `src/**/*.py`, 17,210 LOC in `tests/**/*.py` (28,612 incl. `.pyi`, 190 files). 1,310 tests collected, 18 deselected.

---

## 1. Module Map

| Subsystem | Path | Size | Responsibility |
|---|---|---|---|
| Checker framework | `src/python_setup_lint/checkers/_base.py` (238) + `_base.pyi` (96) | 2 files | `MessageDef`, `_msgs`, `SourceRootMixin`, `FunctionVisitMixin`, `check_if_meaningful` (heuristic + semantic gate) |
| **Semantic pipeline (swap target)** | `src/python_setup_lint/checkers/_semantic.py` (189) + `_semantic.pyi` (27) | 2 files | Lazy `sentence_transformers.CrossEncoder` reranker, SHA-256 result cache, 0.5 threshold |
| Conformance checkers | `src/python_setup_lint/checkers/conformance/` | 16 `.py` + 16 `.pyi` | 15 checkers (W9001…W9741) incl. `suppression_justification_checker.py` (393) and `bare_except_comment_checker.py` (128) — the two consumers of `check_if_meaningful` |
| Stub checkers | `src/python_setup_lint/checkers/stub/` | 10 `.py` + 10 `.pyi` | `.pyi` contract/fidelity/coverage/docstring checks (`checker.py` 379, `fidelity/annotation.py` 281, `fidelity/signature.py` 269) |
| Runner | `src/python_setup_lint/runner/` | 20 modules | `cli.py` (379) entry (`main`, `run_lint`), `dispatch.py` (473) tool registry + strategies, `cmd_build.py` (291) argv building, `parsers.py` (290) + `_record_parsers.py` (277), `baseline.py` (303) diff/cleanup, `output.py` (265), `extra_tools.py` (322), `_autofix.py` (125), `_config.py` (151), `_cli_complexity.py` (154) |
| Installer | `src/python_setup_lint/setup.py` (413), `_setup_precommit.py` (145), `_setup_pyproject.py` (97), `_setup_update.py` (108) | 4 files | Materialises configs, pre-commit hooks, `lint.baseline` in consumer projects |
| Test support (shipped) | `src/python_setup_lint/testing.py` (196) + `.pyi` (156) | 2 files | `_make_tc`, `_walk_and_release`, `make_lint_result`, `FakeRunCmd`, `assert_precommit_*` |
| Shipped configs | `config/` | 10 files | `.pylintrc`, `.pylintrc-pyi`, `.pylintrc-tests`, `ruff.toml`, `mypy.ini`, `pyrightconfig.json`, `rumdl.toml`, `ty.toml`, `.yamllint`, `tach.toml` |
| Tests | `tests/checkers/` (24 files), `tests/runner/` (27 files), `tests/integration.py` (627), `tests/conftest.py` (178), `tests/data/minimal_sample_project/` | ~19.7k LOC | Unit + integration + gated self-lint |
| Docs | `docs/semantic-justification.md` (62), `docs/custom-checks.md` (104), `docs/overlays.md` (86), `docs/troubleshooting.md` (177), `docs/tutorials.md` (122), `AGENTS.md` (139), `CodingRules.md` (307), `design/0001`, `design/0002`, `docs/adr/ADR-001…004` | — | Contract documentation; ADR-001…004 already record modernization decisions (3-line stubs) |

Data flow (documented `AGENTS.md:57-73`, implemented in `runner/cli.py:190-260`):

```
pyproject.toml → ToolSpec[] → dispatch.run() → per-tool subprocess → parse → baseline diff → report
suppressed violation → check_if_meaningful → _semantic.py (reranker) → score cached → reused on re-lint
```

---

## 2. Key Interfaces & Signatures

### Public/consumed API of the check pipeline

| Symbol | Location | Signature / contract |
|---|---|---|
| `check_if_meaningful` | `checkers/_base.py:142-149` (stub `_base.pyi:69-96`) | `(text: str, *, rule: str | None = None, code_context: str | None = None, comment: str | None = None) -> bool` — **never returns `None`**; env gate `PYTHON_SETUP_LINT_SEMANTIC` (default `"1"`, `_base.py:151`) |
| `semantic_check_if_meaningful` | `checkers/_semantic.py:125-132` (stub `_semantic.pyi:3-27`) | `(text, *, rule, code_context, comment) -> bool | None`; `None` ⇒ “backend unavailable, keep heuristic” |
| `_load_reranker` | `checkers/_semantic.py:93-122` | `() -> CrossEncoder | None`, lazy singleton, `_RERANKER_UNAVAILABLE` sentinel |
| `_reset_cache` | `checkers/_semantic.py:81-90` | clears in-memory cache, resets sentinel, unlinks `results.json` (test helper) |
| `SuppressionJustificationChecker` | `conformance/suppression_justification_checker.py:31-41` | W9704 `unjustified-suppression`; visits module + `AnnAssign` + function annotations |
| `BareExceptCommentChecker` | `conformance/bare_except_comment_checker.py:21-124` | W9738 `bare-except-comment`; second consumer of `check_if_meaningful` |
| `register(linter)` | 18 modules (`grep -c '^def register' src`) | pylint entry point; all carry `# pylint: disable=missing-beartype` (26 occurrences repo-wide) |

### Runner/type surface (relevant if a new backend module is added)

| Symbol | Location | Notes |
|---|---|---|
| `TOOLS: list[ToolSpec]` | `runner/dispatch.py:38-129` | **14 entries** (see §4.4 drift note) |
| `LINT_TOOLS: list[ToolSpec]` | `runner/dispatch.py:435` | live registry; `TOOLS` is a “legacy-compat alias” |
| `ToolSpec` | `runner/types.py:1-65`, `dispatch.py:42-128` | `supports_fix`, `supports_path`, `fix_flags`, `memory_limit_mb`, `default_paths` |
| `RunnerConfig` | `runner/types.py`, `runner/_config.py:1-151` | `cwd`, `package_name`, `config_paths`, `tool_timeouts`, `tool_memory_limits` |
| `main` / `run_lint` | `runner/cli.py:1-379`, `runner/__init__.py:24-38` | CLI + programmatic entry |

### Shipped test helpers (`python_setup_lint.testing`)

| Symbol | Location | Purpose |
|---|---|---|
| `_make_tc(checker_class, /)` | `testing.py:18-22` | builds pylint `CheckerTestCase` |
| `_walk_and_release(code, checker_class, /, *, file_path, module_name)` | `testing.py:25-38` | parse + walk + `release_messages()`; returns `list[Any]` |
| `make_lint_result(...)` | `testing.py:44-61` | `LintResult` factory |
| `FakeRunCmd` / `fake_run_cmd_factory` | `testing.py:64-103` | subprocess boundary fake |
| `assert_precommit_config_valid`, `assert_precommit_hooks_shape` | `testing.py:138-196` | consumer-agnostic health checks |

### Pytest markers (`pyproject.toml:48-55`)

`slow` (default-deselected via `addopts = "-m 'not slow'"`), `no_external_api`, `with_real_api`, `implementation_detail` (declared, **0 uses**).

---

## 3. Relevant Excerpts

### 3.1 The pipeline being replaced — `checkers/_semantic.py`

Module header states the design and its fallback contract (`_semantic.py:1-12`): cross-encoder reranking of the justification against rule + code context, lazy load, `None` on `ImportError`/download failure.

```python
# _semantic.py:37-52
_CACHE_DIR = Path.home() / ".cache" / "python-setup" / "semantic"
_RERANKER_INSTANCE: CrossEncoder | None = None
_RERANKER_UNAVAILABLE: bool = False
_RESULT_CACHE_FILE = _CACHE_DIR / "results.json"
_RESULT_CACHE: dict[int, bool] | None = None
_RERANKER_MODEL = os.environ.get("PYTHON_SETUP_LINT_RERANKER_MODEL", "jina-reranker-v2-base-multilingual")
```

```python
# _semantic.py:139-157
if not primary:
    return False
cache_key = hashlib.sha256("|".join(str(x) for x in (text, rule, code_context, comment, _RERANKER_MODEL)).encode()).digest()
cache_key_int = int.from_bytes(cache_key[:8], "big")     # 64-bit truncated key
if cache_key_int in _RESULT_CACHE:
    return _RESULT_CACHE[cache_key_int]
```

```python
# _semantic.py:164-189
if rule or code_context:
    query_parts = []
    if rule: query_parts.append(f"rule: {rule}")
    if code_context: query_parts.append(f"context: {code_context[:200]}")   # truncate to avoid OOM
    query = " | ".join(query_parts)
else:
    query = primary
...
scores = reranker.predict([(primary, query)])
score = float(scores[0])
...
result = score >= 0.5
```

Behavioural facts the modernization must preserve or consciously change:
- Empty/whitespace primary ⇒ `False` **before** any model work (`_semantic.py:139-140`).
- Result cache is persisted on *every* new entry (`_save_result_cache`, `_semantic.py:71-78,187-188`), little-endian-free 64-bit key ⇒ collision surface.
- Failure sentinel prevents retry storms (`_semantic.py:99-109`; CHANGELOG v0.11.0 fix at `CHANGELOG.md:113`).
- Model weights and results share one directory `~/.cache/python-setup/semantic` (`_semantic.py:38,112-117`), which is `.gitignore`d (`gitignore:243-244`).

### 3.2 The heuristic gate — `checkers/_base.py:142-238`

```python
# _base.py:150-158
if os.environ.get("PYTHON_SETUP_LINT_SEMANTIC", "1") == "1":
    from python_setup_lint.checkers._semantic import semantic_check_if_meaningful as _semantic_check
    result = _semantic_check(text, rule=rule, code_context=code_context, comment=comment)
    if result is not None:
        return result
# Heuristic fallback.
primary = (comment or text).strip()
if not primary or len(primary) < 5: return False
```

Heuristic vocabulary is two hard-coded sets: `boilerplate` (28 entries, `_base.py:165-209`) and `meaningless_phrases` (17 entries, `_base.py:213-234`), plus the rule-echo rejection at `_base.py:238`. **In the dev environment this heuristic decides every verdict**: `sentence_transformers` is absent from `.venv` (verified `ModuleNotFoundError`), `~/.cache/python-setup/semantic` does not exist, and `uv.lock` only records the optional extra (`uv.lock:1032`).

### 3.3 Consumers (exactly two)

```python
# conformance/suppression_justification_checker.py:149-155  (Any-annotation path)
m = _PAT_TRAILING_REASON.search(src_line)
if m:
    reason = m.group(1)
    if check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
                           code_context=src_line.split("#", 1)[0].strip()):
        return
```

```python
# conformance/suppression_justification_checker.py:356-386  (suppression-comment path)
for pat in _suppression_patterns:
    for m in pat.finditer(line):
        ...  # only accept a reason before the next suppression pattern
        if tm and check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
                                      code_context=line.split("#", 1)[0].strip()):
            return True
if idx > 0:
    pm = _PAT_PRECEDING_COMMENT.match(prev)
    if pm and check_if_meaningful(reason, comment=reason, ...):
        return True
```

```python
# conformance/bare_except_comment_checker.py:98-124
line = lines[lineno - 1] if lineno <= len(lines) else ""
trailing_match = re.search(r"#\s+(.+)", line)
if trailing_match:
    comment_text = trailing_match.group(1).strip()
    if check_if_meaningful(text=comment_text, rule="bare-except-comment",
                           code_context=line.strip(), comment=comment_test):
        return True
```

Both callers pass `rule=<own symbol>` and `code_context=<code line>`, so any new backend receives a (justification, rule, code-line) triple — the natural feature set for a small classifier.

### 3.4 Packaging & config surfaces that must move together

```toml
# pyproject.toml:28-31
[project.optional-dependencies]
semantic = ["sentence-transformers>=3.0.0"]
```

- Pylint plugin list: `config/.pylintrc:7` (`load-plugins=…`, 16 checkers).
- Optional-import allowlist: `conformance/no_try_import_checker.py:12` — `_OPTIONAL_IMPORT_PATTERNS = frozenset({"sentence_transformers"})`; a new runtime module must be added or `no-try-import` (W9001) will flag the guarded import.
- Doc surfaces naming the model/env var: `AGENTS.md:79-85`, `docs/semantic-justification.md:1-62`, `docs/troubleshooting.md:97-111`, `docs/tutorials.md:12-16`, `README.md:29,105`, `docs/custom-checks.md:104`.
- `tach.toml` declares only two module boundaries (`python_setup_lint/checkers`, `python_setup_lint/runner`, `config/tach.toml:15-21`), so new private modules under `checkers/` need no boundary change.

### 3.5 In-repo precedents for a *git-stored, self-cleaning* cache

`lint.baseline` is the closest analogue: a committed, JSON, sorted artefact whose shrink-path is auto-cleaned.

```python
# runner/baseline.py:201-230 — atomic write, only when modified
if not baseline_modified:
    return None
tmp_path = tempfile.NamedTemporaryFile(dir=tempfile.gettempdir(), prefix="psl_baseline_",
                                       suffix=".json", delete=False).name
try:
    with open(tmp_path, "w") as f:
        json.dump(violations, f, indent=2, sort_keys=True)
    shutil.move(tmp_path, str(baseline_path))
finally:
    ...
```

```python
# runner/baseline.py:280-292 — removals silently shrink the stored baseline
baseline_modified = bool(removed)
if baseline_modified:
    removed_tuples = {_violation_tuple(v) for v in removed}
    new_saved = [v for v in crashless_saved if _violation_tuple(v) not in removed_tuples]
    write_result = _write_baseline_if_modified(new_saved, baseline_path, True)
```

Other relevant precedents/constraints for a committed cache file:
- `.secrets.baseline` is a committed JSON artefact regenerated by `detect-secrets-hook` with `generated_at` stripped (`dispatch.py:216-232`); **detect-secrets scans `git ls-files`**, so a committed decision cache is scanned for high-entropy strings.
- `.gitignore:243-244` currently *excludes* the semantic cache; a git-stored cache reverses that decision and needs an ignore-rule for weights (never commit weights).
- `lint.baseline` is currently `[]` (2 bytes) — zero tolerated violations.

### 3.6 Tool registry (registry fact that already breaks tests)

```python
# runner/dispatch.py:38-47
TOOLS: list[ToolSpec] = [
    ToolSpec("tach check", ["tach", "check"], supports_exclude=True, exclude_flag="-e"),
    ToolSpec("ruff format", ["ruff", "format"], supports_fix=False, supports_path=True,
             supports_exclude=True, default_paths=["src/", "tests/"]),
    ...
]
```

`len(TOOLS) == 14` (verified at runtime). `_build_command` appends **no `--check`** for `ruff format` (`runner/cmd_build.py:278-291`), so the lint-only pass rewrites formatting — see §4.4.

---

## 4. Existing Tests & Conventions

### 4.1 Layout and helpers

| Layer | Location | Count |
|---|---|---|
| Checker units | `tests/checkers/test_*.py` | 24 modules; shared tables in `tests/checkers/_factories.py` (1,393 lines, `# pylint: disable=too-many-lines`) |
| Runner units | `tests/runner/test_*.py` | 27 modules; factories split across `_factories.py` (173), `_factories_baseline.py` (279), `_factories_extras.py` (502), `_factories_tables.py` (394), `_autofix_helpers.py` (135) |
| Integration | `tests/integration.py` (627, `too-many-lines` disabled) | 9 tests, `TestMinimalSampleProject` |
| Fixtures | `tests/conftest.py` only (no `tests/checkers/conftest.py`, no `tests/assumptions/`) | session `_ensure_venv_on_path` (`:30-36`), `configured_project` (`:62-89`), `isolated_runner_registries` (`:126-159`), `sample_project` (`:161-164`), `shipped_config_paths()` (`:170-178`) |

Conventions enforced by `CodingRules.md:276-307`: test naming `test_<method>_given_<condition>_then_<expected>`, parametrisation over loops, `hypothesis` for parsers (`tests/runner/test_parsers_hypothesis.py`), factories for complex objects, no shared fixtures in test files.

Checker test idiom (`docs/custom-checks.md:78-93`, used by 20 modules):

```python
msgs = _walk_and_release(code, SuppressionJustificationChecker, file_path="src/mod.py")
assert {m.msg_id for m in msgs} == {"unjustified-suppression"}
```

### 4.2 Markers / selection

`addopts = "-m 'not slow'"` (`pyproject.toml:49`). 19 `@pytest.mark.slow` uses ⇒ 18 deselected. `with_real_api` is used **once** (`tests/runner/test_real_pipeline_smoke.py:15`) and is *not* deselected, so the real 14-tool pipeline runs in the default suite (2.6 s). `tests/runner/test_self_lint_clean.py:17` is `slow` ⇒ the self-lint gate is **not** in the default suite.

### 4.3 Integration gate (the only end-to-end behaviour contract today)

`tests/integration.py:36-102` copies `tests/data/minimal_sample_project`, `git init`s it (detect-secrets), builds `RunnerConfig` from `config/`, and asserts that **every rule name in `tests/data/minimal_sample_project/violations.txt` appears somewhere** in the output (`_read_violation_rules`, `:62-69`).

```
# violations.txt (planted-rule list, 40 lines)
unjustified-suppression, missing-beartype, no-try-import, asyncio-timeout,
tempfile-mkdtemp-in-test, use-structlog, silent-except, trivial-wrapper,
missing-return-annotation, missing-error-chain, redundant-type-guard,
bare-except-comment, pyi-underscore-symbol, docstring-in-impl,
signature-mismatch, …, MD072, duplicate-code
```

Weakness relevant to “preserve every material behavior”: this asserts *presence only* — duplicate findings, moved lines, and new false positives are invisible. `docs/adr/ADR-001.md` already records the decision to add a normalized golden snapshot (`{tool,file,line,col,rule}`), which does not exist yet (`tests/data/golden/` absent).

### 4.4 Measured gate state on this checkout (2026-11-07)

| Gate | Command | Result |
|---|---|---|
| Unit+integration | `uv run pytest -q` | **6 failed, 1300 passed, 4 skipped, 18 deselected** in ~21 s |
| Self-lint | `uv run lint --baseline <tmp copy>` | **4 “new violations” reported; exit non-zero** |
| Format cleanliness | `uv run ruff format --check src/ tests/` (ruff 0.15.17) | **105 files would be reformatted, 79 already formatted** |

Failing tests (all one root cause — hard-coded 13-tool sets that omit `ruff format`, while `TOOLS` has 14):

- `tests/runner/test_lint_runner.py:52-67` (`test_tool_spec_given_known_tools_then_present` — `assert {t.name for t in TOOLS} == {…13 names…}`)
- `tests/runner/test_lint_runner.py::…test_tool_spec_given_tools_then_autofix_and_no_duplicates`
- `tests/runner/test_lint_runner_stats.py:72-73` (`assert {t.name for t in TOOLS} <= set(_STATISTICS_PARSERS)`)
- `tests/runner/test_t3_coverage.py:33-56` (`EXPECTED_PARSER_TOOLS`, duplicated 13-name set)
- `tests/runner/test_testing_fakes.py::…all_13_tools_dispatched`, `…package_name_none_skips_stubtest_verifytypes`

Documentation drift on the same fact: `AGENTS.md:43,63,92,93`, `docs/overlays.md:3`, `docs/tutorials.md:26`, `README.md:58`, `runner/__init__.py:3` all say “13 tools”, while `runner/dispatch.py:433-434` says “14 built-ins”.

**Operational hazard observed**: `uv run lint` (no `--fix`) runs `ruff format` in write mode, reformatting 105 tracked files, and the subsequent verification pass then reports violations produced by that reformat (e.g. `ruff check SIM102` at `checkers/stub/coverage.py`, which is absent on the unformatted file — verified with `ruff format --diff` + a copy probe). `PYTHON_SETUP_LINT_NO_AUTOFIX=1` does **not** prevent this (it only disables the `--fix` route, `runner/cli.py:190-196`). Any read-only verification step must not run bare `uv run lint`.

### 4.5 Known test-quality problems (debloat targets)

| Problem | Evidence |
|---|---|
| Duplicate heuristic tables | `tests/checkers/test_semantic_check.py:212-257` (`TestMeaningfulPatterns`, 33 rows) duplicates `tests/checkers/test_semantic_threshold.py:29-63` (30 rows, near-identical strings) |
| Over-limit module hiding behind a disable | `test_semantic_check.py:1` disables `too-many-lines` while claiming “504 lines” for a 506-line file (`CodingRules.md:139-141` requires splitting, not baselining) |
| Mocking first-party code | `patch("python_setup_lint.checkers._semantic._load_reranker")`, `patch(…_RESULT_CACHE)`, `patch("builtins.__import__")` at `test_semantic_check.py:25-42,58-61,98-117,310-357`; contradicts `CodingRules.md:240-254` (mock only at external boundaries) |
| Vacuous assertions | `assert result is None or isinstance(result, bool)` (`test_semantic_check.py:286`), `assert result is True or result is None` (`:449`), `assert result is False or result is None` (`:418,469`) — pass under any backend state |
| Private-symbol imports with blanket ignores | `# type: ignore[attr-defined]  # private symbol removed from .pyi per M3(b)` repeated 8× in `test_semantic_check.py` and 2× in `test_suppression_justification_checker.py:368,382` |
| Slow reranker suite guarded by `importorskip` | `test_suppression_justification_checker.py:356-390` (`@pytest.mark.slow`), `test_semantic_check.py:424-506` (`TestRerankerPairs`) — dead in this venv |
| Test-name/behaviour mismatch | `test_semantic_threshold.py:65-69` is named “threshold” but exercises the heuristic with `PYTHON_SETUP_LINT_SEMANTIC=0`; the 0.5 threshold is untested |
| Structural suppressions repeated per checker | 26× `# pylint: disable=missing-beartype` on `register()`, 4× `# type: ignore[misc]` on checker classes; src total suppressions: 87 pylint-disable, 60 type-ignore, 23 ty-ignore, 16 noqa; tests: 117/104/3/37 |
| Legacy compat surface | `runner/baseline.py:20-38` (`_FALLBACK_TOOLS`, `peek_fallback_tools` returning `frozenset()`), `runner/parsers.py:7,31` re-exports, `dispatch.py:435-437` `LINT_TOOLS` “legacy-compat alias”; `trivial_wrapper_checker.py:34-36` carve-outs for `_legacy_*` names |
| Stale code comments | `test_semantic_check.py:1` (“504 lines”), `test_t3_coverage.py:1-2` (“T3 coverage … implementer's tests”), `test_t5/test_t9_7/test_t11` reference non-existent `T*.envelope.md` documents |
| Deprecated astroid API | `tests/checkers/test_stub_checker.py:410` uses `astroid.NodeNG` (DeprecationWarning: removed in astroid v5) |

### 4.6 Coding-rule gates that constrain refactors

- `config/.pylintrc:2` `max-module-lines=500`; `:22-27` `max-statements=65`, `max-branches=16`, `max-locals=20`, `max-public-methods=30`, `max-attributes=15`.
- `config/.pylintrc:3` `ignore-paths=…,tests/data/,…,.omp,.factory` (sample project and orchestration dirs are exempt).
- `config/.pylintrc:5` `source-roots=src` — the W9704 `Any`-annotation arm only fires under `src/` (`_skip_if_outside_source_roots`).
- `mypy.stubtest` + `pylint-pyi` + `pyright verify types` make every `.py`/`.pyi` pair a hard contract (`CodingRules.md:35-59`).
- `ruff format` is not idempotent-clean on this checkout (§4.4), so “run lint to verify” is currently unsafe.

---

## 5. Open Questions & Uncertainties

### 5.1 Model choice — the intent's example does not meet the intent's constraints

Facts gathered from the model cards (see §6):

| Candidate | Params / size | Runtime | License | Fit for a CPU lint tool |
|---|---|---|---|---|
| `fastino/GLiDE-0.4B` (intent's example) | 0.40B, **790 MB bf16 safetensors**, 812 MB repo | `glide` package vendored in the repo (**not on PyPI**), `torch==2.14.0` (CUDA 13 wheels), `transformers==5.17.0`, **tested on Python 3.12**, `GLIDE_DEVICE` defaults to `cuda` | **fastino-community** — restricts Commercial Use and “Production” deployment, forbids redistribution terms of MIT-style use | Poor: GPU-first latency numbers only (6.9 ms median on RTX PRO 6000), no CPU benchmarks, no PyPI package, Python 3.14 untested, non-OSI license conflicts with this repo's MIT license (`pyproject.toml:19-20`) |
| `minishlab/potion-base-8M` | 7.56M params, static embeddings (`model2vec`) | CPU-native, ONNX variant available, `pip install model2vec` | **MIT** | Good cost/profile, but it is an *embedding* model — needs a prototype/similarity or trained head to produce P(meaningful) |
| `cross-encoder/nli-deberta-v3-xsmall` | 70.8M params | sentence-transformers (`torch`) or ONNX export | **Apache-2.0** | Good accuracy/size trade-off, still a torch dependency unless ONNX-only path is chosen |

Open decisions for a spike: (a) license compatibility for a redistributable MIT package; (b) CPU-only latency/RSS budget per lint run (W9704 currently runs on every suppression line in `src/`, `tests/`); (c) Python 3.14 wheel availability (`requires-python = ">=3.14"`, `pyproject.toml:4`); (d) whether the backend is `transformers`, `onnxruntime`, `model2vec`, or a pure-numpy scorer; (e) pinned revision/digest + offline-first behaviour; (f) whether `PYTHON_SETUP_LINT_RERANKER_MODEL` survives as a deprecated alias (ADR-002 narrative in `docs/adr/ADR-002.md`).

### 5.2 Cache design (open)

- **Location**: committed file at the linted project root (e.g. next to `lint.baseline`) vs. in-repo `.python-setup/`. `docs/adr/ADR-003.md` records the intent but not the path/format.
- **Key**: today's key is a 64-bit truncation of SHA-256 over `(text, rule, code_context, comment, model)` (`_semantic.py:143-155`) — collisions silently flip verdicts. A committed cache makes a collision *permanent and shared*.
- **Correctness coupling**: the key includes `code_context`, so cache entries churn on any line edit; a committed cache would produce large, noisy diffs.
- **Eviction**: what is “cleanup”? Options: drop entries for deleted files, cap by age (`created`/`last_used`), cap by size, or shrink when a suppression disappears (mirrors `baseline.py:280-292`).
- **Concurrency/atomicity**: must reuse the temp-file + `shutil.move` pattern (`baseline.py:207-222`) to avoid torn writes from parallel pylint workers.
- **Determinism across machines**: with a committed cache, verdicts become machine-independent — but only for cache hits; misses still diverge when the model is absent. Decide whether a miss with no model *rejects*, *accepts*, or *falls back to heuristic* (today: heuristic, `_base.py:156-158`).
- **detect-secrets**: `git ls-files` is scanned (`dispatch.py:216-232`) — a JSON cache of free-text justifications may trip entropy heuristics and must be either allowlisted or excluded.
- **Merge conflicts**: JSON object keyed by hash is conflict-prone; consider sorted list-of-records with a stable sort key.

### 5.3 Behavior preservation boundaries

- Exact W9704/W9738 outcomes on `tests/data/minimal_sample_project` are the de-facto spec (`violations.txt`), but only presence is asserted.
- The heuristic is a **hard** pre-filter only if you decide so; today the semantic result *replaces* the heuristic when it returns a bool (`_base.py:156-158`). ADR-002 proposes heuristic-first gating (“its rejections never reach the model”), which is a deliberate behaviour change for the model-accepted-but-heuristic-rejected set (e.g. `"carried from library httpx for type compatibility"` is accepted today by heuristic; `"pre-existing"` is rejected by heuristic and would be guaranteed rejected).
- `bare_except_comment_checker` is a second consumer; any signature change must update both call sites (`:103,:116`) and `docs/custom-checks.md`.
- `_base.pyi` and `_semantic.pyi` are part of the shipped contract (`mypy.stubtest` gate); `check_if_meaningful` must keep its name, keyword-only params and `-> bool` return.

### 5.4 Debloat boundaries

- What counts as “redundant test”? Candidates: the duplicated heuristic tables (§4.5), the 6 tool-count assertions (all currently failing), `TestRerankerPairs` (never runs here), and `test_semantic_threshold.py` as a whole once merged.
- Structural suppressions (26 `missing-beartype` disables) need a rule-level fix (e.g. checker `register()` exemption in `beartype_checker.py`) rather than per-line disables — verify `CodingRules.md:106-107` (“remove checks redundant over type annotations”).
- `runner/baseline.py:20-38` compat stubs have live callers (`peek_fallback_tools` 9 hits incl. `runner/__init__.py:24,36` and its `.pyi`), so removal touches the public `__all__`.
- Any module split must keep every `.py`/`.pyi` pair and stay ≤500 lines (`CodingRules.md:139-159`).

### 5.5 Gate drift to resolve before/while modernizing

- 14 tools vs. documented 13 vs. 6 failing test expectations (§4.4). Decide whether `ruff format` counts as a “tool” in docs/tests, or whether the tests should derive the set from `TOOLS`.
- Self-lint gate is not green and `ruff format` mutates the tree. Either baseline-format the repo once (105 files, reviewable diff) or add `--check` semantics for the format tool; both change the “preserve behavior” baseline.
- `AGENTS.md:92` claims the integration test validates “ALL 13 tools”; `tests/runner/test_real_pipeline_smoke.py:38-42` iterates `TOOLS` dynamically (correct), `tests/integration.py` asserts section headers from a static list.

### 5.6 Unverified / needs probing

- CPU latency and RSS of each candidate at representative W9704 volume (a full `uv run lint` invokes pylint over 67 modules; suppression density is 186 in `src`, 261 in `tests`).
- Whether `onnxruntime`-only inference avoids the `torch` dependency chain (currently `torch` is 532 MB per wheel in `uv.lock:1575`).
- Whether a git-stored cache is acceptable for `tests/data/minimal_sample_project` (which is committed and linted in integration).

---

## 6. External references (fetched 2026-11-07)

- `https://huggingface.co/fastino/GLiDE-0.4B` — 0.40B encoder decision model, 0.81 GB bf16, `noul` question type returns P(yes), Python 3.12 + `torch==2.14.0` + `transformers==5.17.0`, `glide/` package lives in the repo, `GLIDE_DEVICE` default `cuda`, license `fastino-community`.
- `https://huggingface.co/fastino/GLiDE-0.4B/blob/main/LICENSE` — Fastino Community License: “Commercial Use” and “Production” definitions restrict for-profit/internal deployment; derivative works bound by §§2-4.
- `https://huggingface.co/collections/fastino/glide` — 6-item family (0.4B/27B variants); 0.4B is the smallest documented.
- `https://huggingface.co/minishlab/potion-base-8M` — 7.56M params, MIT, Model2Vec static embeddings, ONNX-tagged, “orders of magnitude faster on CPU”.
- `https://huggingface.co/cross-encoder/nli-deberta-v3-xsmall` — 70.8M params, Apache-2.0, SNLI/MultiNLI 3-way cross-encoder, ONNX-tagged, 91.6% SNLI accuracy.

---

## 7. Suggested reading order for the architect

1. `src/python_setup_lint/checkers/_semantic.py` (whole file) + `checkers/_base.py:142-238`.
2. `checkers/conformance/suppression_justification_checker.py:31-41,136-162,330-388` and `bare_except_comment_checker.py:73-124`.
3. `docs/semantic-justification.md` + `docs/adr/ADR-001…004`.
4. `pyproject.toml:1-55`, `config/.pylintrc:1-19`, `runner/dispatch.py:38-131`.
5. `runner/baseline.py:20-38,182-292` (cache precedent) and `.gitignore:242-244`.
6. `tests/checkers/test_semantic_check.py`, `tests/checkers/test_semantic_threshold.py`, `tests/checkers/test_suppression_justification_checker.py:356-390`, `tests/integration.py:1-123`.
`). Read code ONLY to verify a specific integration decision (few targeted reads, never broad scans). Translate new unknowns into spike outlines or plan amendments instead of in-turn investigation. Keep terse.
- Outcome options (yield `decision` matching `decisions.schema.json` with `context: "wave"`):
  - `continue`: wave succeeded; proceed to the next scheduled wave.
  - `amend`: revise remaining plan items based on wave learnings or spike results. Yield `outlines` = the NEW or REPLACEMENT PlanItemOutline entries for the amendment (same shape as plan `itemOutlines`: slug, kind, title, description?, milestoneId?, deps?, escalate?), PLUS optional `removeItemSlugs` naming PENDING (never merged/running) items the new items replace, PLUS `planDelta` prose describing the change for the PM. NEVER yield `amend` without `outlines`: an amendment with no new outlines is `continue`.
  - `end-iteration`: halt remaining waves early and transition directly to plan close-up (e.g. goal accomplished early or severe pivot required).
- Integrate spike findings: use `findings.md` and PoC results from finished spikes to inform subsequent item outlines.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.

## Current Plan
{
  "iteration": 1,
  "milestones": [
    {
      "directionalInterfaces": [
        "tests/data/golden/minimal_sample_project_findings.json (sorted Finding array) + minimal_sample_project_tool_counts.json ({tool: min_count}). Serialization: json.dump(indent=2, sort_keys=True) + trailing newline. Outside sample dir, never copied/linted. violations.txt RETAINED as planted-rule oracle.",
        "tests/_golden.py (sole golden owner): UPDATE_ENV='PYTHON_SETUP_LINT_UPDATE_GOLDEN', SEMANTIC_ENV='PYTHON_SETUP_LINT_SEMANTIC'; Finding TypedDict {tool: str, file: str|None, line: int|None, col: int|None, rule: str}; finding_key(f) None-safe (tool, file or '', line if int else -1, col if int else -1, rule) mirroring _violation_sort_key; collect_findings(config: RunnerConfig, capture_path: Path)->list[Finding] (run_lint with baseline=capture_path/overwrite, read JSON, normalize per record: drop msg, relativize vs project, strip './', backslash->'/', as_posix, assert non-absolute, sort by finding_key, assert len!=0); assert_matches_golden(findings, golden_path=GOLDEN_PATH)->None (Counter-multiset diff on keys, sorted added/removed; UPDATE_ENV=1: pytest.fail('refusing to rewrite golden under CI...') if CI/GITHUB_ACTIONS set, else warn + rewrite golden+counts together); read_oracle_rules()->list[str]; slice_tool_section(output, start, end)->str; assert_oracle_coverage(findings, rules)->None; assert_tool_coverage(findings, minimums)->None.",
        "Config side-effect contract: _make_config (M1) / make_runner_config (M2, identical) writes/overwrites <project>/rumdl.toml derived from config/rumdl.toml with '\"tests/data\", ' removed; idempotent (same bytes on repeat); no-op when shipped rumdl.toml missing; OSError propagates. Caller (test) owns tmp dir, copy_sample, git-init, config build, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0.",
        "First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions: __CRASH__/exit<0 records must be zero in golden; positive-exit tool failures with zero parsed records surface via section/SKIPPED assertions, not via golden."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Golden snapshot pins current behavior\n  Given a fresh git-initialised temp copy with make_runner_config semantics and monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0\n  When the dedicated capture run reduces records to Findings (msg dropped, POSIX relpaths, None-safe key sort)\n  Then findings equal the committed golden exactly (indent=2/sort_keys/trailing-newline), len!=0 holds, and zero __CRASH__ records exist",
        "Scenario: Behavior drift is reported precisely\n  Given the real capture plus synthetic injection (drop one record from an in-memory copy; append one synthetic record)\n  When `uv run pytest tests/integration.py -v` runs\n  Then real drift fails golden equality and each injection fails assert_matches_golden naming the exact added/removed key, sorted (committed golden never touched)",
        "Scenario: Deterministic regeneration\n  Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 without CI env (CI/GITHUB_ACTIONS set pytest.fails with 'refusing to rewrite golden under CI...')\n  When the golden test runs twice\n  Then both runs warn + write byte-identical golden AND tool-counts files (no messages/timestamps/absolutes), and the regen is committed only with a reviewed diff",
        "Scenario: Planted-rule and per-tool coverage preserved\n  Given the golden, tool-counts, and violations.txt as oracle\n  When coverage is checked\n  Then every oracle rule appears in golden, every TOOLS entry meets its minimum count, ('pylint','src/minimal_sample/mod.py',49,'unjustified-suppression') is present, and no ('pylint',...,56,'unjustified-suppression') record exists",
        "Scenario: Crash/skip coverage retained outside golden\n  Given the first run's output\n  When checked\n  Then every TOOLS section header appears, no [CRASH] appears, no non-package_name SKIPPED appears, and generic-return-requires-returns appears"
      ],
      "title": "Golden lint-findings safety net (behavior-preservation contract)"
    },
    {
      "directionalInterfaces": [
        "tests/_project_helpers.py (sole definition site): copy_sample_project, git_init_and_stage (test/test@test + add .), git_init_bare (Test/test@example.com, -q, no add), stage_file, commit_all, shipped_config_paths, make_runner_config, build_pylint_overlay_config(project, disable_rule)->Path, ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project, monkeypatch)->None. Per-consumer imports: integration.py->{copy, git_init_and_stage, make_runner_config, build_overlay, ensure_precommit, install_twice}; conftest.py->{shipped_config_paths} only; _autofix_helpers.py->{git_init_bare, stage_file, commit_all} only. Tests outside tach bounds.",
        "tests/assumptions/__init__.py + {test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contracts.py}: distinct classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts; pytestmark no_external_api. Root owns __init__ + these 3; semantic epic appends runtime modules only."
      ],
      "id": "M2",
      "scenarios": [
        "Scenario: Shared helpers exist once\n  Given tests/_project_helpers.py defining the helpers\n  When tests/ is searched\n  Then each helper is defined exactly once there, duplicate defs in conftest.py/_autofix_helpers.py are deleted, and each consumer imports only its mapped subset",
        "Scenario: Integration gate module within limits\n  Given extracted helpers plus moved overlay/setup/precommit scaffolding per the line budget (>=127 removed, target <=490)\n  When `uv run pytest tests/integration.py -v` runs\n  Then tests/integration.py is <=500 lines with no suppression, test names unchanged, all pass, golden+counts byte-identical",
        "Scenario: Third-party contracts pinned\n  Given the explicit astroid/pylint/beartype contract list (bytes|str-tolerant stream, doc_node presence/absence, nodes_of_class tuple union, span int attrs, PyLinter.register_checker lifecycle, CheckerTestCase capture shape, MessageDefinitionTuple leading fields, observed beartype forward-ref outcome)\n  When `uv run pytest tests/assumptions -q` runs\n  Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api",
        "Scenario: Assumption failures diagnose at the source\n  Given assumption modules as sole pinning location\n  When checker tests are searched\n  Then none asserts third-party internals (Module.stream/doc_node/register-checker shapes); tests/assumptions is the only pinning place"
      ],
      "title": "Test infrastructure and third-party assumptions baseline"
    },
    {
      "directionalInterfaces": [
        "Row schemas: coding-rules {module, section, evidence file:line, category, est. LoC delta, owner, fix}; test-debloat {module, behaviors, duplicate-of, recommendation, surviving coverage, reason, owner}. Artifact = structured item-report tables (durable in orchestration records; no committed file); coding-rules-audit owns the unified disjoint-ownership map; test-debloat-audit reads it via inter-dep and aligns its owner column; iteration-2 replan re-globs HEAD (catching epic-created modules) and re-validates the map before spawning subsystem epics.",
        "Exclusions (marked skipped, everything else audited): src side: checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache modules (+.pyi), _base.py::check_if_meaningful (+stub section), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. tests side: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, tests/checkers/conftest.py (epic-created), tests/assumptions runtime/decision/cache modules (epic-created)."
      ],
      "id": "M3",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Coding-rules debt inventoried\n  Given CodingRules.md and AGENTS.md\n  When the audit completes\n  Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts) plus the unified ownership map; semantic-owned symbols are marked skipped while the rest of those files is audited",
        "Scenario: Test redundancy inventoried\n  Given tests/ and the golden\n  When the audit completes\n  Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt, and owner values match the unified map",
        "Scenario: Ownership map is complete and disjoint\n  Given both audit item reports\n  When the unified map is checked\n  Then every src/scripts/tests file appears exactly once with exactly one owner, excluded semantic symbols are listed, and no file has two owners"
      ],
      "title": "Modernization debt inventory and subsystem epic decomposition"
    }
  ],
  "uncertainties": [
    {
      "description": "Which decision model meets all constraints (CPU-friendly, MIT-compatible runtime download, py3.14 CPU wheels, no unpinned remote code, acceptable accuracy) is unknown. GLiDE-0.4B: fastino-community license, 0.81GB bf16, bundled `glide` pkg, tested on 3.12/torch2.14/transformers5.17. Smaller candidates vary (e.g. cc-by-nc-4.0 vs apache-2.0, ONNX exports).",
      "id": "U1",
      "spikeOutlines": [
        "semantic epic fact-finder: candidate matrix (license, params/size, runtime, py3.14 wheels, custom-code, pinnable revision)",
        "semantic epic poc: CPU cold-load, warm latency, accuracy on labeled corpus (repo justifications + test tables); smallest model/prompt/threshold meeting bar (>=90% acc, >=95% meaningless-precision, >=85% meaningful-recall)",
        "semantic epic test-assumptions: install chosen runtime via `semantic` extra on 3.14, pin loader/inference API in tests/assumptions/"
      ]
    },
    {
      "description": "Git-stored cache behavior under concurrency/cleanup from inside pylint unknown: jobs, open()/close() timing, partial/staged runs, 3 pylint invocations sharing one project.",
      "id": "U2",
      "spikeOutlines": [
        "semantic epic test-assumptions: pin pylint 4.x invocation/hook semantics; lock/merge/sweep design conditional on result (else jobs=1 or sidecars, recorded in ADR-CACHE-01)"
      ]
    },
    {
      "description": "Golden must be deterministic across runs/machines. Risks: duplicate-code ordering, detect-secrets over ls-files, pyright/mypy churn, absolute-path leakage.",
      "id": "U3",
      "spikeOutlines": [
        "golden-determinism-probe (test-assumptions, pre-story): capture twice on temp copies, diff raw captures, report unstable fields + verdict + normalization spec",
        "golden-findings-snapshot implements probe's test-side normalization; bounded src allowance (baseline relativize/sort, parser ordering only, <=40 lines, determinism-only) applies ONLY if the probe proves test-side insufficient. Excluding any field that drops a planted oracle rule is forbidden without an ADR."
      ]
    },
    {
      "description": "Size/shape of coding-rules debt in src/ and redundant/lint-testing tests in tests/ (~28.6k LOC) unknown; subsystem epics cannot be scoped yet.",
      "id": "U4",
      "spikeOutlines": [
        "coding-rules-audit (fact-finder)",
        "test-debloat-audit (fact-finder)"
      ]
    }
  ],
  "itemOutlines": [
    {
      "description": "Probe golden determinism BEFORE the snapshot story (resolves U3). On two fresh temp copies (copy+git-init+_make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) run run_lint capture twice; diff raw captures field-by-field. Report: unstable fields (ordering, absolute paths, timestamps, churn), verdict (test-side normalization sufficient vs bounded src fix needed with exact scope), and the normalization spec the snapshot story implements. Runs captures on temp copies only — never bare `uv run lint` on the repo (ruff-format write hazard). No committed files; output is the item report consumed by golden-findings-snapshot.",
      "kind": "test-assumptions",
      "milestoneId": "M1",
      "slug": "golden-determinism-probe",
      "title": "Probe capture determinism on temp copies"
    },
    {
      "description": "Make the integration gate pin exact behavior per the probe report. Dedicated capture run separate from the rc!=0 first run: caller owns tmp dir, copy_sample, git-init, _make_config (package_name + rumdl override), monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0; tests/_golden.py owns Finding, None-safe finding_key, collect_findings(config, capture_path) (run_lint + read capture + normalize + sort + assert len!=0), assert_matches_golden (Counter multiset diff, sorted added/removed; PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 pytest.fails under CI/GITHUB_ACTIONS, else warns + rewrites golden+counts; reviewed diff required), read_oracle_rules, slice_tool_section, assert_oracle_coverage, assert_tool_coverage. Serialization indent=2/sort_keys/trailing-newline. First run keeps rc!=0 AND retains tool-section/SKIPPED/[CRASH]/W9705 assertions (positive-exit failures surface there, not in golden). Replace substring loop with golden equality + oracle/tool coverage (violations.txt RETAINED). Brush-off/carry as tool-qualified lookups (tool='pylint', mod.py:49 present / :56 absent). Drift injection on in-memory list copies. If probe proves test-side insufficient: bounded src allowance ONLY in runner/baseline.py (relativize/POSIX/sort) and runner/parsers.py|_record_parsers.py (ordering), <=40 added lines, determinism-only (no finding added/removed), reviewed diff in report. Acceptance: integration, `pytest -q`, `lint` pass, empty lint.baseline.",
      "kind": "story",
      "milestoneId": "M1",
      "slug": "golden-findings-snapshot",
      "title": "Golden snapshot of normalized lint findings",
      "deps": [
        "golden-determinism-probe"
      ]
    },
    {
      "description": "Create tests/assumptions/__init__.py + 3 modules with distinct classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts (pytestmark no_external_api), tests named test_<api>_given_<condition>_then_<expected>, asserting observed behavior at pinned versions. astroid: Module.stream().read() returns bytes|str (product decodes-if-bytes); doc_node is Const/JoinedStr when docstring present else None for module/class/function; nodes_of_class accepts a tuple and returns union in document order; Const/JoinedStr string nodes expose int fromlineno/end_lineno/col_offset/end_col_offset (asserted on a sample literal). pylint (third-party side, not first-party register): PyLinter.register_checker(checker) lifecycle incl. open()/close() call order (record observed); CheckerTestCase/UnittestLinter capture add_message output into release_messages (assert observed MessageTest shape); MessageDefinitionTuple leading fields (msgid, symbol, description) + record full arity. beartype: discovery contract — decorate a function with a TYPE_CHECKING-only forward-ref annotation, assert the OBSERVED outcome (call-time vs import-time vs checker-only), record in item report for M3. No src/ changes. Must NOT touch AGENTS.md (consolidate is sole counts owner).",
      "kind": "test-assumptions",
      "milestoneId": "M2",
      "slug": "third-party-assumption-tests",
      "title": "Pin astroid/pylint/beartype contracts"
    },
    {
      "description": "Extract into tests/_project_helpers.py: copy_sample_project, git_init_and_stage (init+config user test/test@test + `git add .`, integration/detect-secrets semantics), git_init_bare (init -q + config Test/test@example.com, no add, autofix semantics — identities NOT unified), stage_file, commit_all, shipped_config_paths, make_runner_config (package_name + rumdl override, preserving _make_config side-effect contract incl. idempotent overwrite and no-op when shipped rumdl missing), build_pylint_overlay_config(project, disable_rule)->Path, ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project, monkeypatch)->None. Delete duplicate defs in conftest.py and _autofix_helpers.py (import instead); integration.py imports only what it uses; test_self_lint_clean.py and autofix tests switch imports. Per-consumer map: integration->{copy, git_init_and_stage, make_runner_config, build_overlay, ensure_precommit, install_twice}; conftest->{shipped_config_paths} only; _autofix->{git_init_bare, stage_file, commit_all} only. Line budget (must remove >=127, target <=490): helpers ~58 + oracle reader ~8 + overlay rewrite ~21 + setup scaffolding (fake _run_uv/install-twice) ~20 + precommit scaffolding (probe + validate/config blocks) ~25 + M1 loop/lookup net ~5 + section-slice ~3 + import/docstring trim ~4. integration.py keeps path/class/function names; golden+counts byte-identical; sole AGENTS.md counts owner (update counts incl. new assumption tests). Acceptance: integration, `pytest -q`, `lint` pass.",
      "kind": "story",
      "milestoneId": "M2",
      "slug": "consolidate-integration-helpers",
      "title": "Single-source helpers; integration.py under 500 lines",
      "deps": [
        "golden-findings-snapshot",
        "third-party-assumption-tests"
      ]
    },
    {
      "description": "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS. Semantic exclusions are symbol/file-level (mark skipped, audit rest normally): checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache modules (+.pyi), _base.py::check_if_meaningful (+stub section), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi fidelity/private symbols, @beartype + structural suppressions, trivial wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export), over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules, rumdl tests/data-exclude hack (TD-11). Output: rows {module, section, evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint-ownership map (this audit is single owner; test-debloat-audit consumes it via inter-dep). Reads final state (post-golden/assumptions/consolidate) + beartype report.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "replanAfter": true,
      "slug": "coding-rules-audit",
      "title": "Inventory CodingRules violations",
      "deps": [
        "golden-findings-snapshot",
        "third-party-assumption-tests",
        "consolidate-integration-helpers"
      ]
    },
    {
      "description": "Read-only audit of tests/**. Semantic exclusions (mark skipped): tests/checkers/test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline class, tests/checkers/conftest.py (epic-created), tests/assumptions runtime/decision/cache modules (epic-created). Per module: behaviors protected; duplicates (incl. golden-covered); CodingRules-Tests violations (first-party mocking, naming, markers, in-file fixtures, _factories.py list[Any] tables, far cases); repo-self-lint tests for removal (test_self_lint_clean.py, AST/source-scanning guards, config re-checks); slow/benchmark; task-ID names. Output: rows {module, behaviors, duplicate-of, recommendation keep|merge|rewrite|remove, surviving coverage, reason, owner} + per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit, baseline/autofix, configs/scopes: surviving test or blocking-debt flag). Owner column aligned to coding-rules-audit's unified map (read via inter-dep).",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "replanAfter": true,
      "slug": "test-debloat-audit",
      "title": "Inventory redundant and lint-testing tests",
      "deps": [
        "golden-findings-snapshot",
        "third-party-assumption-tests",
        "consolidate-integration-helpers",
        "coding-rules-audit"
      ]
    }
  ],
  "assumptions": [
    {
      "assumption": "'Material lint/check behavior' = findings {tool,file,line,col,rule} pinned by golden (PYTHON_SETUP_LINT_SEMANTIC=0) + checker unit tests; CLI flags/exit codes; baseline/autofix semantics; shipped configs/scopes. Other three limbs are pinned by surviving tests inventoried in M3 (CLI: tests/runner/test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*; configs/scopes: overlay + config tests) — if a limb has no surviving test the audit flags blocking debt. Reranker accept/reject decisions are not material; heuristic rejections (empty, boilerplate, brush-off, rule-echo) are material.",
      "disposition": "confirm with human",
      "why": "Intent replaces the model yet demands preservation; this boundary makes 'preserve' mechanically testable per limb."
    },
    {
      "assumption": "The git-stored decision cache belongs to the repo being linted (python-setup itself and consumers alike), at .python-setup-decisions.json next to lint.baseline. Only decisions committed; weights (0.03-0.8 GB, own licenses) stay in the user model cache.",
      "disposition": "confirm with human",
      "why": "Decisions depend on project content and must reproduce in that project's CI without the model."
    },
    {
      "assumption": "Dev and CI do not install the `semantic` extra; sentence-transformers absent from .venv today. Gates run heuristic + cache hits; real-model tests are slow + with_real_api.",
      "why": "Matches current .venv; keeps gates offline, fast, deterministic."
    },
    {
      "assumption": "tests/integration.py, `uv run pytest -q`, `uv run pytest tests/integration.py` and `uv run lint` are gate contracts: paths and commands do not change.",
      "why": "Infra gates and AGENTS.md reference them; renaming silently breaks gating."
    },
    {
      "assumption": "'Never test linting' means pytest must not assert this repository passes its own lint gates — whether by re-running tools in subprocess, by AST/source scanning that re-implements a gate, or by config-consistency checks that re-lint the repo. `uv run lint` and pre-commit enforce that. Tests exercise logic on synthetic inputs and the sample project.",
      "disposition": "confirm with human",
      "why": "AST guards and config re-checks duplicate the gate and rot with rule churn; broadening the definition removes them with rationale."
    },
    {
      "assumption": "Only semantic-decision-model starts now; runner/checkers/setup-testing-scripts spawn at iteration-2 replan from M3 audits. Root/epic sharing is narrowed: epic never writes tests/data (regen is a root iteration-2 item), AGENTS.md is split by section with a rebase prerequisite, tests/assumptions is append-only.",
      "why": "No cross-epic machine edges exist; narrowing removes the write/write races by construction."
    },
    {
      "assumption": "At least one model among GLiDE-0.4B and smaller Decision-Index models has compatible license, Python 3.14 CPU wheels and pinnable revision. Else the semantic epic escalates instead of shipping non-compliant.",
      "disposition": "verify via semantic-decision-model spikes",
      "why": "GLiDE uses a custom community license, tested on 3.12; smaller candidates vary."
    }
  ],
  "epics": [
    {
      "intent": "# semantic-decision-model\n\nReplace the cross-encoder reranker behind suppression-justification with a CPU-friendly small decision model plus a git-stored self-cleaning decision cache. Preserve every material behavior. Child epic of `modernize`.\n\n## Scope (symbol-level; narrowed cross-epic protocol)\nOwned symbols/files: checkers/_semantic.py+.pyi and new private backend/cache modules (+.pyi each, @beartype, structlog kwargs, tach-clean); check_if_meaningful in checkers/_base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject [semantic] extra + uv.lock + .gitignore semantic entries; docs (semantic-justification.md, custom-checks.md bullet, troubleshooting.md section, AGENTS.md pipeline section, CHANGELOG); tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, new decision/cache modules, tests/checkers/conftest.py, new runtime-assumption modules under tests/assumptions/.\nProtocol with root: (a) NEVER write tests/data/** (no exception) — read golden for verification only; if heuristic outcomes shift, emit a shift report (which justification classes flip) + CHANGELOG behavior description, and root regenerates golden as an iteration-2 item; (b) AGENTS.md pipeline section only, applied onto HEAD containing root M2's merge (prerequisite), never touch count lines; (c) shared .py files: symbol ownership only; (d) tests/assumptions: append runtime modules only, never touch root's __init__ + 3 contract modules. Out of scope: other checkers/runner; tests/integration.py, tests/conftest.py (no edits). Any runner touch stays minimal + ADR.\n\n## Requirements\n1. Spikes before design: (a) fact-finder candidate matrix (GLiDE-0.4B + Decision-Index smalls): license (exclude non-commercial), params/size, runtime with py3.14 CPU wheels linux/mac/win, vendored/pinned custom code (never unpinned trust_remote_code), offline behavior. (b) poc CPU-only: cold-load, warm latency, accuracy on labeled corpus (repo's real justifications + today's brush-off/meaningful tables); bar: >=90% accuracy, >=95% precision on meaningless, >=85% recall on meaningful; choose smallest model/prompt/threshold meeting bar, record in ADR. (c) test-assumptions: pylint 4.x invocation semantics; cache lock/merge/sweep conditional on result — if jobs>1 violates partial-run guarantee, constrain to jobs=1 (pinned by test) or per-worker sidecars, recorded in cache-design ADR (ADR-CACHE-01).\n2. Decision contract: keep check_if_meaningful(text,*,rule,code_context,comment)->bool and PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported). Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None (None=unavailable, heuristic stands). Public DecisionBackend Protocol decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1'; decision=prob>=threshold. Injection: optional backend kwarg (public in .pyi); get_backend() honors test-only PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. No patching globals/imports, no private imports.\n3. Packaging: `semantic` extra ships chosen runtime (drop sentence-transformers). Without extra or on failure: heuristic + cache hits, one warning, sentinel. Weights in user model cache, never git. PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision; PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore).\n4. Cache (.python-setup-decisions.json at linted root, definitive): JSON array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry {justification normalized (strip+collapse ws, keep case), rule (joined codes), model ('<id> rev <short12> prompt-vN', no bare hex>=20), decision, files (sorted POSIX relpaths)}. Key (justification,rule,model); context is model input only. Hits need no model. Writes: lockfile (O_CREAT|O_EXCL retry 5s) + merge + atomic temp+move. Sweep scoped to linted files; drop empty-files + stale-model entries. Isolation: PYTHON_SETUP_LINT_DECISIONS_PATH (tests->tmp, never repo cache). Must pass all tools incl. detect-secrets.\n5. Real suppressed codes: extract all codes from disable=/noqa:/ignore[...] via existing patterns; normalize (strip, split comma), sort, join ','; pass joined string as rule (bare-except keeps single 'bare-except-comment'). Rule-echo rejects if primary (lower, stripped) equals any element (lower). Cache key uses joined rule. If any heuristic outcome on the sample changes: do NOT touch golden; emit shift report + CHANGELOG behavior-change description (which justification classes flip, not the raw diff); root iteration-2 item regenerates.\n6. Tests: merge brush-off/meaningful/threshold tables into one parametrized table; FakeBackend via direct kwarg (units) and env-var (check_if_meaningful path); cache round-trip/cleanup/concurrency on tmp + hypothesis format round-trip; exactly one slow+with_real_api e2e; delete vacuous `is None or ...` assertions; modules <=500 lines, no suppressions; never test linting.\n7. Docs: update Scope list + CHANGELOG (user-visible only: extra contents, new/deprecated vars, cache file, behavior-change descriptions).\n\n## Acceptance\n- Heuristic path unchanged: PYTHON_SETUP_LINT_SEMANTIC=0 sample lint equals golden (read-only verification).\n- Cache without model: no extra + cached false decision => W9704 emitted, no model load.\n- Brush-off never reaches model: 'pre-existing' + fake backend => False, backend uncalled.\n- One call per unique pair: miss + backend => exactly one call per unique (justification,rule), persisted sorted.\n- Scoped cleanup: suppression deleted from a.py => linting a.py removes entry; linting only b.py keeps it.\n- No retry storm: load fails => one attempt per process, heuristic results.\n- Gates: `uv run pytest -q`, `uv run pytest tests/integration.py -v`, `uv run lint` pass with empty lint.baseline.",
      "slug": "semantic-decision-model"
    }
  ],
  "techDebt": [
    {
      "category": "impacting",
      "description": "Suppression/bare-except checkers pass their own symbol as `rule`; the rule-echo heuristic and model never see the actually-suppressed codes.",
      "id": "TD-1",
      "resolution": "Semantic req5: extract all codes, pass comma-joined sorted string; echo matches any element; epic emits shift report + CHANGELOG behavior description, root iteration-2 item regenerates golden."
    },
    {
      "category": "impacting",
      "description": "Semantic tests patch module globals and builtins.__import__, import privates under type:ignore; several assertions vacuous (`is None or ...`).",
      "id": "TD-2",
      "resolution": "Semantic req6: FakeBackend via public Protocol (direct kwarg + dotted-path env injection); delete vacuous tests."
    },
    {
      "category": "impacting",
      "description": "tests/integration.py 627 lines + too-many-lines suppression; duplicates conftest/_autofix helpers; substring-only assertions miss drift.",
      "id": "TD-3",
      "resolution": "Probe + M1 pin exact findings with per-tool minimums; M2 single-sources 10 helpers, moves overlay/setup/precommit scaffolding per budget, reaches <=500 without suppression."
    },
    {
      "category": "impacting",
      "description": "test_semantic_check.py 506 lines + suppression; heuristic tables duplicate test_semantic_threshold.py.",
      "id": "TD-4",
      "resolution": "Semantic req6: one merged parametrized table; modules <=500."
    },
    {
      "category": "adjacent",
      "description": "~15 checkers repeat structural suppressions (missing-beartype on register(), type:ignore[misc] on mixin classes) + copied stream read/decode.",
      "id": "TD-5",
      "resolution": "coding-rules-audit inventories; iteration-2 checkers epic fixes (base class, shared helper, typed register)."
    },
    {
      "category": "adjacent",
      "description": "Legacy/compat: baseline._FALLBACK_TOOLS/peek_fallback_tools, _compare_sorted re-export, astroid 3.x docstring fallback despite astroid>=4.0.4.",
      "id": "TD-6",
      "resolution": "Iteration-2 runner/checkers epics remove, guarded by golden."
    },
    {
      "category": "adjacent",
      "description": "dispatch.py 500+ char rationale comment ending in `# pylint: disable=unjustified-suppression` suppresses the justification checker itself.",
      "id": "TD-7",
      "resolution": "Iteration-2 runner epic: move rationale to design/0002, leave short justified comment."
    },
    {
      "category": "adjacent",
      "description": "tests/checkers/_factories.py ~1400 lines; ~40 pytest.param tables typed list[Any] with pasted justifications; cases far from tests.",
      "id": "TD-8",
      "resolution": "Iteration-2 checkers epic per test-debloat-audit: ParameterSet typing, cases next to tests, split per checker."
    },
    {
      "category": "adjacent",
      "description": "Task-ID test names (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*, test_t3_*); repo-self-lint tests (test_self_lint_clean.py, AST/source-scanning guards, config re-checks) duplicate the `uv run lint` gate.",
      "id": "TD-9",
      "resolution": "Iteration-2 epics per test-debloat-audit: rename by behavior; remove self-lint tests (broadened never-linting definition)."
    },
    {
      "category": "adjacent",
      "description": "ADR locations disagree: CodingRules requires design/, factory ADRs go to docs/adr.",
      "id": "TD-10",
      "resolution": "Iteration-2 replan: cross-reference (design/README or AGENTS.md index). No engine change."
    },
    {
      "category": "adjacent",
      "description": "Shipped rumdl.toml excludes tests/data, forcing the integration per-run rewrite to lint the sample AGENTS.md; affects golden determinism.",
      "id": "TD-11",
      "resolution": "coding-rules-audit inventories; iteration-2 runner epic fixes (e.g. narrow exclude); M1/M2 retain the override."
    }
  ],
  "adrs": [
    {
      "consequences": "Exact cheap regression detection; golden updates are explicit reviewed diffs. Message text not snapshotted. Tool upgrades may require reviewed regen. CI cannot silently rewrite. Positive-exit tool failures still surface via retained section/SKIPPED assertions, not via golden.",
      "context": "Modernization enforces rules, debloats, swaps the semantic model while preserving material behavior. lint.baseline is empty; integration only checks planted rule-name presence, missing duplicates, moves, new false positives. violations.txt covers only pylint-custom + MD + duplicate-code rules.",
      "decision": "Commit Finding {tool,file?,line?,col?,rule} snapshot at tests/data/golden/minimal_sample_project_findings.json plus per-tool minimums at ..._tool_counts.json {tool: min_count}. Serialization: json.dump(indent=2, sort_keys=True) + trailing newline. Dedicated second run_lint capture (baseline=<tmp>/capture.json, overwrite) under monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0 with make_runner_config semantics; first run keeps rc!=0 and retains tool-section/SKIPPED/[CRASH]/W9705 assertions. Test-side normalize: drop msg, relativize vs project, strip './', backslash->'/', as_posix, assert non-absolute; sort/diff by None-safe finding_key mirroring _violation_sort_key (None file->'', None line/col->-1); Counter-multiset diff with sorted added/removed. Golden holds zero __CRASH__; any crash fails naming the tool. violations.txt retained as oracle; coverage = every oracle rule in golden AND every TOOLS entry meets its minimum count. Regen only via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1: pytest.fail under CI/GITHUB_ACTIONS ('refusing to rewrite golden under CI...'), warn + rewrite golden+counts otherwise, byte-identical across two runs, reviewed diff required. Drift injection = synthetic add/drop on in-memory list copies. Brush-off/carry are tool-qualified lookups (tool='pylint', file='src/minimal_sample/mod.py', line 49 present / line 56 absent).",
      "id": "ADR-001",
      "title": "Golden findings snapshot as the behavior-preservation contract"
    },
    {
      "consequences": "Brush-off rejections guaranteed regardless of model; model can only tighten acceptance. sentence-transformers dropped; no-try-import patterns list the new runtime. Real-model coverage is one slow + with_real_api test. Old env var warns via CHANGELOG-documented deprecation.",
      "context": "_semantic.py misuses a sentence-transformers cross-encoder as a quality judge. The dependency is heavy and absent in dev/CI, so the heuristic decides everything today. The intent asks for a CPU-friendly small decision model.",
      "decision": "Keep check_if_meaningful signature and PYTHON_SETUP_LINT_SEMANTIC. Heuristic runs first as a hard gate; rejections never reach the model. Accepted text goes to cache, then to a local decision model behind a public DecisionBackend Protocol decide(justification, rule, context) -> float P(meaningful) in [0,1]; decision = prob >= DECISION_THRESHOLD with PROMPT_VERSION='prompt-v1'. Injection without patching: semantic_check_if_meaningful gains optional backend kwarg (public in .pyi), and get_backend() honors test-only PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. Model/prompt/threshold chosen by spike under compatible license, Python 3.14 CPU wheels, pinned revision, no unpinned remote code, meeting bar: >=90% accuracy, >=95% precision on meaningless, >=85% recall on meaningful. Ships via `semantic` extra, configured by PYTHON_SETUP_LINT_DECISION_MODEL; PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Backend unavailable returns None; heuristic stands.",
      "id": "ADR-002",
      "title": "Heuristic-gated local decision model for justification checks"
    },
    {
      "consequences": "W9704 reproducible across machines without the extra; decision changes are reviewable diffs. Small line-local merge conflicts possible. Consumer repos gain one committed file (install docs mention it); the file must pass all tools and not trip detect-secrets.",
      "context": "Results cached in gitignored ~/.cache per-machine file, unbounded, keyed by 64-bit truncated SHA-256 including code context. Outcomes diverge across machines; stale entries never removed. Intent requires git-stored cache with cleanup.",
      "decision": "Store decisions in committed .python-setup-decisions.json at the linted project root (definitive, next to lint.baseline). Format: JSON array sorted by (rule, justification, model), indent=2, sort_keys=True. Entry {justification (normalized: strip + collapse whitespace, preserve case), rule (comma-joined sorted codes), model ('<id> rev <short12> prompt-vN', no bare hex >=20 chars), decision: bool, files: sorted POSIX relpaths}. Key is (justification, rule, model); context is model input only. Reads need no model. Writes: lockfile + merge-on-write + atomic temp+move (baseline pattern). Cleanup: mark-and-sweep scoped to linted files + drop empty-files and stale-model entries. Isolation via PYTHON_SETUP_LINT_DECISIONS_PATH. Lock/merge/sweep is conditional on the pylint-semantics spike; if jobs>1 violates the partial-run guarantee, the epic constrains to jobs=1 (pinned by test) or per-worker sidecars — the choice is recorded in the epic's cache-design ADR (ADR-CACHE-01). Weights stay in user model cache.",
      "id": "ADR-003",
      "title": "Git-stored, self-cleaning decision cache"
    },
    {
      "consequences": "Shared test infra never edited concurrently; debloat runs behind golden + assumptions. No machine-checkable cross-epic edges exist, so epic/root sharing is narrowed to non-write or prerequisite form; residual AGENTS.md/_base.py concurrent-edit risk is accepted with rebase discipline. Subsystem epics start one iteration later but scoped from evidence.",
      "context": "Three workstreams span ~28.6k LOC. Parallel edits to shared test infra would conflict. Intent requires test infra/assumptions before debloat. The semantic epic shares surfaces with root (AGENTS.md, _base.py symbols, tests/assumptions, golden dir) but the engine has no cross-epic dependency edges.",
      "decision": "Iteration 1: root delivers golden net, test-infra consolidation, third-party assumption tests, read-only audits, and spawns semantic-decision-model now under a narrowed protocol: (a) the epic NEVER writes tests/data/** — golden regen after a semantic heuristic shift is a root iteration-2 item planned at replan from the epic's shift report (epic reads golden for verification only); (b) AGENTS.md: root M2 solely owns count lines, epic solely owns the pipeline section, and the epic's edit has prerequisite 'applies onto HEAD containing M2's merge' (epic never touches count lines); (c) shared .py files: symbol-level ownership, rest auditable; (d) tests/assumptions: root owns __init__ + 3 contract modules, epic appends runtime modules only. Iteration 2 (replan): re-glob HEAD, re-validate the unified ownership map (catches epic-created modules), then spawn runner/checkers/setup-testing-scripts epics. Policy: pytest never asserts this repo passes its own lint gates (no subprocess re-lint, no AST re-implementation, no config re-checks); `uv run lint` does that.",
      "id": "ADR-004",
      "title": "Progressive saga decomposition with narrowed cross-epic protocol"
    }
  ]
}

## Wave Report
{
  "blockedItems": [],
  "debt": [
    "Pre-existing red baseline (unchanged, not wave-caused): 6 unit-test failures assuming 13 tools while TOOLS now has 14 (ruff format added); lint violations SIM102 at src/python_setup_lint/checkers/stub/coverage.py:196, W9704 unjustified-suppression x2, R0914 at runner/cli.py:50, C0208 at tests/runner/_factories_extras.py:383.",
    "Documented `uv run lint` mutation hazard still open: the `ruff format` ToolSpec runs plain `ruff format` without --check/--config (operator action from infra notes).",
    "detect-secrets scans `git ls-files` (all tracked files) so engine-managed .factory journal content can flip it red independent of repo code; no exclusion mechanism is currently in place."
  ],
  "failedItems": [
    "gate:lint/detect-secrets (regressed pass->fail vs baseline; hits are Hex High Entropy strings at .factory/tasks/modernize/journal.ndjson:81,83 — engine-managed orchestration records, not repo code)"
  ],
  "iteration": 1,
  "mergedItems": [],
  "recommendations": [
    "Engine/operator: exclude .factory/** from the detect-secrets scan (or refresh .secrets.baseline / allowlist journal session digests) so orchestration noise cannot flip the lint gate.",
    "Operator: add --check (+ --config) to the `ruff format` ToolSpec or drop it from TOOLS so `uv run lint` stops mutating worktrees (carried from infra notes).",
    "Update the 6 baseline-red unit tests and 5 baseline-red lint violations to the 14-tool world (or record them as accepted debt) so future waves have a green baseline to regress against."
  ],
  "status": "has_failures",
  "summary": "Wave 2 close-up (iteration 1): wave report lists no merged items (empty merged set — consult/report-only wave), and the tree is clean: only engine-managed .factory/tasks/modernize/journal.ndjson is modified, zero untracked files, zero merge-conflict markers in repo code. Gate audit vs baseline: format PASS (177 files formatted, was 173 — count grew, still green); test-integration PASS (9/9); test FAIL with exactly the 6 pre-existing baseline failures and 1308 passed (baseline 1300, +8, no new failures); lint FAIL with the same baseline tool failures (ruff check SIM102 coverage.py:196, pylint W9704, pylint-pyi R0914 cli.py:50, pylint tests C0208 _factories_extras.py:383 — identical exit codes) BUT detect-secrets regressed pass->fail (exit 123) on Hex High Entropy hits inside the engine-managed .factory journal. That single green->red flip is orchestration noise, not a repo-code regression from wave work, but per gate-baseline rules it is recorded in failedItems; iteration can continue.",
  "wave": 2
}

## Tech Debt
rs.py are deleted, and each consumer imports only its mapped subset
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


## Steering Directives
rs.py are deleted, and each consumer imports only its mapped subset
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


## Context Pack
# Context Pack — `modernize`

> Repository: `python-setup` v1.2.10, `requires-python = ">=3.14"` (`pyproject.toml:4`), branch `topic/modernize`. All citations are `path:line` at HEAD. Line numbers verified 2026-11-07.
> Size: 8,890 LOC in `src/**/*.py`, 17,210 LOC in `tests/**/*.py` (28,612 incl. `.pyi`, 190 files). 1,310 tests collected, 18 deselected.

---

## 1. Module Map

| Subsystem | Path | Size | Responsibility |
|---|---|---|---|
| Checker framework | `src/python_setup_lint/checkers/_base.py` (238) + `_base.pyi` (96) | 2 files | `MessageDef`, `_msgs`, `SourceRootMixin`, `FunctionVisitMixin`, `check_if_meaningful` (heuristic + semantic gate) |
| **Semantic pipeline (swap target)** | `src/python_setup_lint/checkers/_semantic.py` (189) + `_semantic.pyi` (27) | 2 files | Lazy `sentence_transformers.CrossEncoder` reranker, SHA-256 result cache, 0.5 threshold |
| Conformance checkers | `src/python_setup_lint/checkers/conformance/` | 16 `.py` + 16 `.pyi` | 15 checkers (W9001…W9741) incl. `suppression_justification_checker.py` (393) and `bare_except_comment_checker.py` (128) — the two consumers of `check_if_meaningful` |
| Stub checkers | `src/python_setup_lint/checkers/stub/` | 10 `.py` + 10 `.pyi` | `.pyi` contract/fidelity/coverage/docstring checks (`checker.py` 379, `fidelity/annotation.py` 281, `fidelity/signature.py` 269) |
| Runner | `src/python_setup_lint/runner/` | 20 modules | `cli.py` (379) entry (`main`, `run_lint`), `dispatch.py` (473) tool registry + strategies, `cmd_build.py` (291) argv building, `parsers.py` (290) + `_record_parsers.py` (277), `baseline.py` (303) diff/cleanup, `output.py` (265), `extra_tools.py` (322), `_autofix.py` (125), `_config.py` (151), `_cli_complexity.py` (154) |
| Installer | `src/python_setup_lint/setup.py` (413), `_setup_precommit.py` (145), `_setup_pyproject.py` (97), `_setup_update.py` (108) | 4 files | Materialises configs, pre-commit hooks, `lint.baseline` in consumer projects |
| Test support (shipped) | `src/python_setup_lint/testing.py` (196) + `.pyi` (156) | 2 files | `_make_tc`, `_walk_and_release`, `make_lint_result`, `FakeRunCmd`, `assert_precommit_*` |
| Shipped configs | `config/` | 10 files | `.pylintrc`, `.pylintrc-pyi`, `.pylintrc-tests`, `ruff.toml`, `mypy.ini`, `pyrightconfig.json`, `rumdl.toml`, `ty.toml`, `.yamllint`, `tach.toml` |
| Tests | `tests/checkers/` (24 files), `tests/runner/` (27 files), `tests/integration.py` (627), `tests/conftest.py` (178), `tests/data/minimal_sample_project/` | ~19.7k LOC | Unit + integration + gated self-lint |
| Docs | `docs/semantic-justification.md` (62), `docs/custom-checks.md` (104), `docs/overlays.md` (86), `docs/troubleshooting.md` (177), `docs/tutorials.md` (122), `AGENTS.md` (139), `CodingRules.md` (307), `design/0001`, `design/0002`, `docs/adr/ADR-001…004` | — | Contract documentation; ADR-001…004 already record modernization decisions (3-line stubs) |

Data flow (documented `AGENTS.md:57-73`, implemented in `runner/cli.py:190-260`):

```
pyproject.toml → ToolSpec[] → dispatch.run() → per-tool subprocess → parse → baseline diff → report
suppressed violation → check_if_meaningful → _semantic.py (reranker) → score cached → reused on re-lint
```

---

## 2. Key Interfaces & Signatures

### Public/consumed API of the check pipeline

| Symbol | Location | Signature / contract |
|---|---|---|
| `check_if_meaningful` | `checkers/_base.py:142-149` (stub `_base.pyi:69-96`) | `(text: str, *, rule: str | None = None, code_context: str | None = None, comment: str | None = None) -> bool` — **never returns `None`**; env gate `PYTHON_SETUP_LINT_SEMANTIC` (default `"1"`, `_base.py:151`) |
| `semantic_check_if_meaningful` | `checkers/_semantic.py:125-132` (stub `_semantic.pyi:3-27`) | `(text, *, rule, code_context, comment) -> bool | None`; `None` ⇒ “backend unavailable, keep heuristic” |
| `_load_reranker` | `checkers/_semantic.py:93-122` | `() -> CrossEncoder | None`, lazy singleton, `_RERANKER_UNAVAILABLE` sentinel |
| `_reset_cache` | `checkers/_semantic.py:81-90` | clears in-memory cache, resets sentinel, unlinks `results.json` (test helper) |
| `SuppressionJustificationChecker` | `conformance/suppression_justification_checker.py:31-41` | W9704 `unjustified-suppression`; visits module + `AnnAssign` + function annotations |
| `BareExceptCommentChecker` | `conformance/bare_except_comment_checker.py:21-124` | W9738 `bare-except-comment`; second consumer of `check_if_meaningful` |
| `register(linter)` | 18 modules (`grep -c '^def register' src`) | pylint entry point; all carry `# pylint: disable=missing-beartype` (26 occurrences repo-wide) |

### Runner/type surface (relevant if a new backend module is added)

| Symbol | Location | Notes |
|---|---|---|
| `TOOLS: list[ToolSpec]` | `runner/dispatch.py:38-129` | **14 entries** (see §4.4 drift note) |
| `LINT_TOOLS: list[ToolSpec]` | `runner/dispatch.py:435` | live registry; `TOOLS` is a “legacy-compat alias” |
| `ToolSpec` | `runner/types.py:1-65`, `dispatch.py:42-128` | `supports_fix`, `supports_path`, `fix_flags`, `memory_limit_mb`, `default_paths` |
| `RunnerConfig` | `runner/types.py`, `runner/_config.py:1-151` | `cwd`, `package_name`, `config_paths`, `tool_timeouts`, `tool_memory_limits` |
| `main` / `run_lint` | `runner/cli.py:1-379`, `runner/__init__.py:24-38` | CLI + programmatic entry |

### Shipped test helpers (`python_setup_lint.testing`)

| Symbol | Location | Purpose |
|---|---|---|
| `_make_tc(checker_class, /)` | `testing.py:18-22` | builds pylint `CheckerTestCase` |
| `_walk_and_release(code, checker_class, /, *, file_path, module_name)` | `testing.py:25-38` | parse + walk + `release_messages()`; returns `list[Any]` |
| `make_lint_result(...)` | `testing.py:44-61` | `LintResult` factory |
| `FakeRunCmd` / `fake_run_cmd_factory` | `testing.py:64-103` | subprocess boundary fake |
| `assert_precommit_config_valid`, `assert_precommit_hooks_shape` | `testing.py:138-196` | consumer-agnostic health checks |

### Pytest markers (`pyproject.toml:48-55`)

`slow` (default-deselected via `addopts = "-m 'not slow'"`), `no_external_api`, `with_real_api`, `implementation_detail` (declared, **0 uses**).

---

## 3. Relevant Excerpts

### 3.1 The pipeline being replaced — `checkers/_semantic.py`

Module header states the design and its fallback contract (`_semantic.py:1-12`): cross-encoder reranking of the justification against rule + code context, lazy load, `None` on `ImportError`/download failure.

```python
# _semantic.py:37-52
_CACHE_DIR = Path.home() / ".cache" / "python-setup" / "semantic"
_RERANKER_INSTANCE: CrossEncoder | None = None
_RERANKER_UNAVAILABLE: bool = False
_RESULT_CACHE_FILE = _CACHE_DIR / "results.json"
_RESULT_CACHE: dict[int, bool] | None = None
_RERANKER_MODEL = os.environ.get("PYTHON_SETUP_LINT_RERANKER_MODEL", "jina-reranker-v2-base-multilingual")
```

```python
# _semantic.py:139-157
if not primary:
    return False
cache_key = hashlib.sha256("|".join(str(x) for x in (text, rule, code_context, comment, _RERANKER_MODEL)).encode()).digest()
cache_key_int = int.from_bytes(cache_key[:8], "big")     # 64-bit truncated key
if cache_key_int in _RESULT_CACHE:
    return _RESULT_CACHE[cache_key_int]
```

```python
# _semantic.py:164-189
if rule or code_context:
    query_parts = []
    if rule: query_parts.append(f"rule: {rule}")
    if code_context: query_parts.append(f"context: {code_context[:200]}")   # truncate to avoid OOM
    query = " | ".join(query_parts)
else:
    query = primary
...
scores = reranker.predict([(primary, query)])
score = float(scores[0])
...
result = score >= 0.5
```

Behavioural facts the modernization must preserve or consciously change:
- Empty/whitespace primary ⇒ `False` **before** any model work (`_semantic.py:139-140`).
- Result cache is persisted on *every* new entry (`_save_result_cache`, `_semantic.py:71-78,187-188`), little-endian-free 64-bit key ⇒ collision surface.
- Failure sentinel prevents retry storms (`_semantic.py:99-109`; CHANGELOG v0.11.0 fix at `CHANGELOG.md:113`).
- Model weights and results share one directory `~/.cache/python-setup/semantic` (`_semantic.py:38,112-117`), which is `.gitignore`d (`gitignore:243-244`).

### 3.2 The heuristic gate — `checkers/_base.py:142-238`

```python
# _base.py:150-158
if os.environ.get("PYTHON_SETUP_LINT_SEMANTIC", "1") == "1":
    from python_setup_lint.checkers._semantic import semantic_check_if_meaningful as _semantic_check
    result = _semantic_check(text, rule=rule, code_context=code_context, comment=comment)
    if result is not None:
        return result
# Heuristic fallback.
primary = (comment or text).strip()
if not primary or len(primary) < 5: return False
```

Heuristic vocabulary is two hard-coded sets: `boilerplate` (28 entries, `_base.py:165-209`) and `meaningless_phrases` (17 entries, `_base.py:213-234`), plus the rule-echo rejection at `_base.py:238`. **In the dev environment this heuristic decides every verdict**: `sentence_transformers` is absent from `.venv` (verified `ModuleNotFoundError`), `~/.cache/python-setup/semantic` does not exist, and `uv.lock` only records the optional extra (`uv.lock:1032`).

### 3.3 Consumers (exactly two)

```python
# conformance/suppression_justification_checker.py:149-155  (Any-annotation path)
m = _PAT_TRAILING_REASON.search(src_line)
if m:
    reason = m.group(1)
    if check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
                           code_context=src_line.split("#", 1)[0].strip()):
        return
```

```python
# conformance/suppression_justification_checker.py:356-386  (suppression-comment path)
for pat in _suppression_patterns:
    for m in pat.finditer(line):
        ...  # only accept a reason before the next suppression pattern
        if tm and check_if_meaningful(reason, comment=reason, rule="unjustified-suppression",
                                      code_context=line.split("#", 1)[0].strip()):
            return True
if idx > 0:
    pm = _PAT_PRECEDING_COMMENT.match(prev)
    if pm and check_if_meaningful(reason, comment=reason, ...):
        return True
```

```python
# conformance/bare_except_comment_checker.py:98-124
line = lines[lineno - 1] if lineno <= len(lines) else ""
trailing_match = re.search(r"#\s+(.+)", line)
if trailing_match:
    comment_text = trailing_match.group(1).strip()
    if check_if_meaningful(text=comment_text, rule="bare-except-comment",
                           code_context=line.strip(), comment=comment_test):
        return True
```

Both callers pass `rule=<own symbol>` and `code_context=<code line>`, so any new backend receives a (justification, rule, code-line) triple — the natural feature set for a small classifier.

### 3.4 Packaging & config surfaces that must move together

```toml
# pyproject.toml:28-31
[project.optional-dependencies]
semantic = ["sentence-transformers>=3.0.0"]
```

- Pylint plugin list: `config/.pylintrc:7` (`load-plugins=…`, 16 checkers).
- Optional-import allowlist: `conformance/no_try_import_checker.py:12` — `_OPTIONAL_IMPORT_PATTERNS = frozenset({"sentence_transformers"})`; a new runtime module must be added or `no-try-import` (W9001) will flag the guarded import.
- Doc surfaces naming the model/env var: `AGENTS.md:79-85`, `docs/semantic-justification.md:1-62`, `docs/troubleshooting.md:97-111`, `docs/tutorials.md:12-16`, `README.md:29,105`, `docs/custom-checks.md:104`.
- `tach.toml` declares only two module boundaries (`python_setup_lint/checkers`, `python_setup_lint/runner`, `config/tach.toml:15-21`), so new private modules under `checkers/` need no boundary change.

### 3.5 In-repo precedents for a *git-stored, self-cleaning* cache

`lint.baseline` is the closest analogue: a committed, JSON, sorted artefact whose shrink-path is auto-cleaned.

```python
# runner/baseline.py:201-230 — atomic write, only when modified
if not baseline_modified:
    return None
tmp_path = tempfile.NamedTemporaryFile(dir=tempfile.gettempdir(), prefix="psl_baseline_",
                                       suffix=".json", delete=False).name
try:
    with open(tmp_path, "w") as f:
        json.dump(violations, f, indent=2, sort_keys=True)
    shutil.move(tmp_path, str(baseline_path))
finally:
    ...
```

```python
# runner/baseline.py:280-292 — removals silently shrink the stored baseline
baseline_modified = bool(removed)
if baseline_modified:
    removed_tuples = {_violation_tuple(v) for v in removed}
    new_saved = [v for v in crashless_saved if _violation_tuple(v) not in removed_tuples]
    write_result = _write_baseline_if_modified(new_saved, baseline_path, True)
```

Other relevant precedents/constraints for a committed cache file:
- `.secrets.baseline` is a committed JSON artefact regenerated by `detect-secrets-hook` with `generated_at` stripped (`dispatch.py:216-232`); **detect-secrets scans `git ls-files`**, so a committed decision cache is scanned for high-entropy strings.
- `.gitignore:243-244` currently *excludes* the semantic cache; a git-stored cache reverses that decision and needs an ignore-rule for weights (never commit weights).
- `lint.baseline` is currently `[]` (2 bytes) — zero tolerated violations.

### 3.6 Tool registry (registry fact that already breaks tests)

```python
# runner/dispatch.py:38-47
TOOLS: list[ToolSpec] = [
    ToolSpec("tach check", ["tach", "check"], supports_exclude=True, exclude_flag="-e"),
    ToolSpec("ruff format", ["ruff", "format"], supports_fix=False, supports_path=True,
             supports_exclude=True, default_paths=["src/", "tests/"]),
    ...
]
```

`len(TOOLS) == 14` (verified at runtime). `_build_command` appends **no `--check`** for `ruff format` (`runner/cmd_build.py:278-291`), so the lint-only pass rewrites formatting — see §4.4.

---

## 4. Existing Tests & Conventions

### 4.1 Layout and helpers

| Layer | Location | Count |
|---|---|---|
| Checker units | `tests/checkers/test_*.py` | 24 modules; shared tables in `tests/checkers/_factories.py` (1,393 lines, `# pylint: disable=too-many-lines`) |
| Runner units | `tests/runner/test_*.py` | 27 modules; factories split across `_factories.py` (173), `_factories_baseline.py` (279), `_factories_extras.py` (502), `_factories_tables.py` (394), `_autofix_helpers.py` (135) |
| Integration | `tests/integration.py` (627, `too-many-lines` disabled) | 9 tests, `TestMinimalSampleProject` |
| Fixtures | `tests/conftest.py` only (no `tests/checkers/conftest.py`, no `tests/assumptions/`) | session `_ensure_venv_on_path` (`:30-36`), `configured_project` (`:62-89`), `isolated_runner_registries` (`:126-159`), `sample_project` (`:161-164`), `shipped_config_paths()` (`:170-178`) |

Conventions enforced by `CodingRules.md:276-307`: test naming `test_<method>_given_<condition>_then_<expected>`, parametrisation over loops, `hypothesis` for parsers (`tests/runner/test_parsers_hypothesis.py`), factories for complex objects, no shared fixtures in test files.

Checker test idiom (`docs/custom-checks.md:78-93`, used by 20 modules):

```python
msgs = _walk_and_release(code, SuppressionJustificationChecker, file_path="src/mod.py")
assert {m.msg_id for m in msgs} == {"unjustified-suppression"}
```

### 4.2 Markers / selection

`addopts = "-m 'not slow'"` (`pyproject.toml:49`). 19 `@pytest.mark.slow` uses ⇒ 18 deselected. `with_real_api` is used **once** (`tests/runner/test_real_pipeline_smoke.py:15`) and is *not* deselected, so the real 14-tool pipeline runs in the default suite (2.6 s). `tests/runner/test_self_lint_clean.py:17` is `slow` ⇒ the self-lint gate is **not** in the default suite.

### 4.3 Integration gate (the only end-to-end behaviour contract today)

`tests/integration.py:36-102` copies `tests/data/minimal_sample_project`, `git init`s it (detect-secrets), builds `RunnerConfig` from `config/`, and asserts that **every rule name in `tests/data/minimal_sample_project/violations.txt` appears somewhere** in the output (`_read_violation_rules`, `:62-69`).

```
# violations.txt (planted-rule list, 40 lines)
unjustified-suppression, missing-beartype, no-try-import, asyncio-timeout,
tempfile-mkdtemp-in-test, use-structlog, silent-except, trivial-wrapper,
missing-return-annotation, missing-error-chain, redundant-type-guard,
bare-except-comment, pyi-underscore-symbol, docstring-in-impl,
signature-mismatch, …, MD072, duplicate-code
```

Weakness relevant to “preserve every material behavior”: this asserts *presence only* — duplicate findings, moved lines, and new false positives are invisible. `docs/adr/ADR-001.md` already records the decision to add a normalized golden snapshot (`{tool,file,line,col,rule}`), which does not exist yet (`tests/data/golden/` absent).

### 4.4 Measured gate state on this checkout (2026-11-07)

| Gate | Command | Result |
|---|---|---|
| Unit+integration | `uv run pytest -q` | **6 failed, 1300 passed, 4 skipped, 18 deselected** in ~21 s |
| Self-lint | `uv run lint --baseline <tmp copy>` | **4 “new violations” reported; exit non-zero** |
| Format cleanliness | `uv run ruff format --check src/ tests/` (ruff 0.15.17) | **105 files would be reformatted, 79 already formatted** |

Failing tests (all one root cause — hard-coded 13-tool sets that omit `ruff format`, while `TOOLS` has 14):

- `tests/runner/test_lint_runner.py:52-67` (`test_tool_spec_given_known_tools_then_present` — `assert {t.name for t in TOOLS} == {…13 names…}`)
- `tests/runner/test_lint_runner.py::…test_tool_spec_given_tools_then_autofix_and_no_duplicates`
- `tests/runner/test_lint_runner_stats.py:72-73` (`assert {t.name for t in TOOLS} <= set(_STATISTICS_PARSERS)`)
- `tests/runner/test_t3_coverage.py:33-56` (`EXPECTED_PARSER_TOOLS`, duplicated 13-name set)
- `tests/runner/test_testing_fakes.py::…all_13_tools_dispatched`, `…package_name_none_skips_stubtest_verifytypes`

Documentation drift on the same fact: `AGENTS.md:43,63,92,93`, `docs/overlays.md:3`, `docs/tutorials.md:26`, `README.md:58`, `runner/__init__.py:3` all say “13 tools”, while `runner/dispatch.py:433-434` says “14 built-ins”.

**Operational hazard observed**: `uv run lint` (no `--fix`) runs `ruff format` in write mode, reformatting 105 tracked files, and the subsequent verification pass then reports violations produced by that reformat (e.g. `ruff check SIM102` at `checkers/stub/coverage.py`, which is absent on the unformatted file — verified with `ruff format --diff` + a copy probe). `PYTHON_SETUP_LINT_NO_AUTOFIX=1` does **not** prevent this (it only disables the `--fix` route, `runner/cli.py:190-196`). Any read-only verification step must not run bare `uv run lint`.

### 4.5 Known test-quality problems (debloat targets)

| Problem | Evidence |
|---|---|
| Duplicate heuristic tables | `tests/checkers/test_semantic_check.py:212-257` (`TestMeaningfulPatterns`, 33 rows) duplicates `tests/checkers/test_semantic_threshold.py:29-63` (30 rows, near-identical strings) |
| Over-limit module hiding behind a disable | `test_semantic_check.py:1` disables `too-many-lines` while claiming “504 lines” for a 506-line file (`CodingRules.md:139-141` requires splitting, not baselining) |
| Mocking first-party code | `patch("python_setup_lint.checkers._semantic._load_reranker")`, `patch(…_RESULT_CACHE)`, `patch("builtins.__import__")` at `test_semantic_check.py:25-42,58-61,98-117,310-357`; contradicts `CodingRules.md:240-254` (mock only at external boundaries) |
| Vacuous assertions | `assert result is None or isinstance(result, bool)` (`test_semantic_check.py:286`), `assert result is True or result is None` (`:449`), `assert result is False or result is None` (`:418,469`) — pass under any backend state |
| Private-symbol imports with blanket ignores | `# type: ignore[attr-defined]  # private symbol removed from .pyi per M3(b)` repeated 8× in `test_semantic_check.py` and 2× in `test_suppression_justification_checker.py:368,382` |
| Slow reranker suite guarded by `importorskip` | `test_suppression_justification_checker.py:356-390` (`@pytest.mark.slow`), `test_semantic_check.py:424-506` (`TestRerankerPairs`) — dead in this venv |
| Test-name/behaviour mismatch | `test_semantic_threshold.py:65-69` is named “threshold” but exercises the heuristic with `PYTHON_SETUP_LINT_SEMANTIC=0`; the 0.5 threshold is untested |
| Structural suppressions repeated per checker | 26× `# pylint: disable=missing-beartype` on `register()`, 4× `# type: ignore[misc]` on checker classes; src total suppressions: 87 pylint-disable, 60 type-ignore, 23 ty-ignore, 16 noqa; tests: 117/104/3/37 |
| Legacy compat surface | `runner/baseline.py:20-38` (`_FALLBACK_TOOLS`, `peek_fallback_tools` returning `frozenset()`), `runner/parsers.py:7,31` re-exports, `dispatch.py:435-437` `LINT_TOOLS` “legacy-compat alias”; `trivial_wrapper_checker.py:34-36` carve-outs for `_legacy_*` names |
| Stale code comments | `test_semantic_check.py:1` (“504 lines”), `test_t3_coverage.py:1-2` (“T3 coverage … implementer's tests”), `test_t5/test_t9_7/test_t11` reference non-existent `T*.envelope.md` documents |
| Deprecated astroid API | `tests/checkers/test_stub_checker.py:410` uses `astroid.NodeNG` (DeprecationWarning: removed in astroid v5) |

### 4.6 Coding-rule gates that constrain refactors

- `config/.pylintrc:2` `max-module-lines=500`; `:22-27` `max-statements=65`, `max-branches=16`, `max-locals=20`, `max-public-methods=30`, `max-attributes=15`.
- `config/.pylintrc:3` `ignore-paths=…,tests/data/,…,.omp,.factory` (sample project and orchestration dirs are exempt).
- `config/.pylintrc:5` `source-roots=src` — the W9704 `Any`-annotation arm only fires under `src/` (`_skip_if_outside_source_roots`).
- `mypy.stubtest` + `pylint-pyi` + `pyright verify types` make every `.py`/`.pyi` pair a hard contract (`CodingRules.md:35-59`).
- `ruff format` is not idempotent-clean on this checkout (§4.4), so “run lint to verify” is currently unsafe.

---

## 5. Open Questions & Uncertainties

### 5.1 Model choice — the intent's example does not meet the intent's constraints

Facts gathered from the model cards (see §6):

| Candidate | Params / size | Runtime | License | Fit for a CPU lint tool |
|---|---|---|---|---|
| `fastino/GLiDE-0.4B` (intent's example) | 0.40B, **790 MB bf16 safetensors**, 812 MB repo | `glide` package vendored in the repo (**not on PyPI**), `torch==2.14.0` (CUDA 13 wheels), `transformers==5.17.0`, **tested on Python 3.12**, `GLIDE_DEVICE` defaults to `cuda` | **fastino-community** — restricts Commercial Use and “Production” deployment, forbids redistribution terms of MIT-style use | Poor: GPU-first latency numbers only (6.9 ms median on RTX PRO 6000), no CPU benchmarks, no PyPI package, Python 3.14 untested, non-OSI license conflicts with this repo's MIT license (`pyproject.toml:19-20`) |
| `minishlab/potion-base-8M` | 7.56M params, static embeddings (`model2vec`) | CPU-native, ONNX variant available, `pip install model2vec` | **MIT** | Good cost/profile, but it is an *embedding* model — needs a prototype/similarity or trained head to produce P(meaningful) |
| `cross-encoder/nli-deberta-v3-xsmall` | 70.8M params | sentence-transformers (`torch`) or ONNX export | **Apache-2.0** | Good accuracy/size trade-off, still a torch dependency unless ONNX-only path is chosen |

Open decisions for a spike: (a) license compatibility for a redistributable MIT package; (b) CPU-only latency/RSS budget per lint run (W9704 currently runs on every suppression line in `src/`, `tests/`); (c) Python 3.14 wheel availability (`requires-python = ">=3.14"`, `pyproject.toml:4`); (d) whether the backend is `transformers`, `onnxruntime`, `model2vec`, or a pure-numpy scorer; (e) pinned revision/digest + offline-first behaviour; (f) whether `PYTHON_SETUP_LINT_RERANKER_MODEL` survives as a deprecated alias (ADR-002 narrative in `docs/adr/ADR-002.md`).

### 5.2 Cache design (open)

- **Location**: committed file at the linted project root (e.g. next to `lint.baseline`) vs. in-repo `.python-setup/`. `docs/adr/ADR-003.md` records the intent but not the path/format.
- **Key**: today's key is a 64-bit truncation of SHA-256 over `(text, rule, code_context, comment, model)` (`_semantic.py:143-155`) — collisions silently flip verdicts. A committed cache makes a collision *permanent and shared*.
- **Correctness coupling**: the key includes `code_context`, so cache entries churn on any line edit; a committed cache would produce large, noisy diffs.
- **Eviction**: what is “cleanup”? Options: drop entries for deleted files, cap by age (`created`/`last_used`), cap by size, or shrink when a suppression disappears (mirrors `baseline.py:280-292`).
- **Concurrency/atomicity**: must reuse the temp-file + `shutil.move` pattern (`baseline.py:207-222`) to avoid torn writes from parallel pylint workers.
- **Determinism across machines**: with a committed cache, verdicts become machine-independent — but only for cache hits; misses still diverge when the model is absent. Decide whether a miss with no model *rejects*, *accepts*, or *falls back to heuristic* (today: heuristic, `_base.py:156-158`).
- **detect-secrets**: `git ls-files` is scanned (`dispatch.py:216-232`) — a JSON cache of free-text justifications may trip entropy heuristics and must be either allowlisted or excluded.
- **Merge conflicts**: JSON object keyed by hash is conflict-prone; consider sorted list-of-records with a stable sort key.

### 5.3 Behavior preservation boundaries

- Exact W9704/W9738 outcomes on `tests/data/minimal_sample_project` are the de-facto spec (`violations.txt`), but only presence is asserted.
- The heuristic is a **hard** pre-filter only if you decide so; today the semantic result *replaces* the heuristic when it returns a bool (`_base.py:156-158`). ADR-002 proposes heuristic-first gating (“its rejections never reach the model”), which is a deliberate behaviour change for the model-accepted-but-heuristic-rejected set (e.g. `"carried from library httpx for type compatibility"` is accepted today by heuristic; `"pre-existing"` is rejected by heuristic and would be guaranteed rejected).
- `bare_except_comment_checker` is a second consumer; any signature change must update both call sites (`:103,:116`) and `docs/custom-checks.md`.
- `_base.pyi` and `_semantic.pyi` are part of the shipped contract (`mypy.stubtest` gate); `check_if_meaningful` must keep its name, keyword-only params and `-> bool` return.

### 5.4 Debloat boundaries

- What counts as “redundant test”? Candidates: the duplicated heuristic tables (§4.5), the 6 tool-count assertions (all currently failing), `TestRerankerPairs` (never runs here), and `test_semantic_threshold.py` as a whole once merged.
- Structural suppressions (26 `missing-beartype` disables) need a rule-level fix (e.g. checker `register()` exemption in `beartype_checker.py`) rather than per-line disables — verify `CodingRules.md:106-107` (“remove checks redundant over type annotations”).
- `runner/baseline.py:20-38` compat stubs have live callers (`peek_fallback_tools` 9 hits incl. `runner/__init__.py:24,36` and its `.pyi`), so removal touches the public `__all__`.
- Any module split must keep every `.py`/`.pyi` pair and stay ≤500 lines (`CodingRules.md:139-159`).

### 5.5 Gate drift to resolve before/while modernizing

- 14 tools vs. documented 13 vs. 6 failing test expectations (§4.4). Decide whether `ruff format` counts as a “tool” in docs/tests, or whether the tests should derive the set from `TOOLS`.
- Self-lint gate is not green and `ruff format` mutates the tree. Either baseline-format the repo once (105 files, reviewable diff) or add `--check` semantics for the format tool; both change the “preserve behavior” baseline.
- `AGENTS.md:92` claims the integration test validates “ALL 13 tools”; `tests/runner/test_real_pipeline_smoke.py:38-42` iterates `TOOLS` dynamically (correct), `tests/integration.py` asserts section headers from a static list.

### 5.6 Unverified / needs probing

- CPU latency and RSS of each candidate at representative W9704 volume (a full `uv run lint` invokes pylint over 67 modules; suppression density is 186 in `src`, 261 in `tests`).
- Whether `onnxruntime`-only inference avoids the `torch` dependency chain (currently `torch` is 532 MB per wheel in `uv.lock:1575`).
- Whether a git-stored cache is acceptable for `tests/data/minimal_sample_project` (which is committed and linted in integration).

---

## 6. External references (fetched 2026-11-07)

- `https://huggingface.co/fastino/GLiDE-0.4B` — 0.40B encoder decision model, 0.81 GB bf16, `noul` question type returns P(yes), Python 3.12 + `torch==2.14.0` + `transformers==5.17.0`, `glide/` package lives in the repo, `GLIDE_DEVICE` default `cuda`, license `fastino-community`.
- `https://huggingface.co/fastino/GLiDE-0.4B/blob/main/LICENSE` — Fastino Community License: “Commercial Use” and “Production” definitions restrict for-profit/internal deployment; derivative works bound by §§2-4.
- `https://huggingface.co/collections/fastino/glide` — 6-item family (0.4B/27B variants); 0.4B is the smallest documented.
- `https://huggingface.co/minishlab/potion-base-8M` — 7.56M params, MIT, Model2Vec static embeddings, ONNX-tagged, “orders of magnitude faster on CPU”.
- `https://huggingface.co/cross-encoder/nli-deberta-v3-xsmall` — 70.8M params, Apache-2.0, SNLI/MultiNLI 3-way cross-encoder, ONNX-tagged, 91.6% SNLI accuracy.

---

## 7. Suggested reading order for the architect

1. `src/python_setup_lint/checkers/_semantic.py` (whole file) + `checkers/_base.py:142-238`.
2. `checkers/conformance/suppression_justification_checker.py:31-41,136-162,330-388` and `bare_except_comment_checker.py:73-124`.
3. `docs/semantic-justification.md` + `docs/adr/ADR-001…004`.
4. `pyproject.toml:1-55`, `config/.pylintrc:1-19`, `runner/dispatch.py:38-131`.
5. `runner/baseline.py:20-38,182-292` (cache precedent) and `.gitignore:242-244`.
6. `tests/checkers/test_semantic_check.py`, `tests/checkers/test_semantic_threshold.py`, `tests/checkers/test_suppression_justification_checker.py:356-390`, `tests/integration.py:1-123`.


## Task Status
iteration: 1
amendments: 0
items:
  - golden-determinism-probe kind=fact-finder wave=1 status=merged outlineRef=golden-determinism-probe
  - third-party-assumption-tests kind=test-assumptions wave=1 status=merged outlineRef=third-party-assumption-tests
  - golden-findings-snapshot kind=dev wave=2 status=superseded outlineRef=golden-findings-snapshot
  - consolidate-integration-helpers kind=test-only wave=3 status=pending outlineRef=consolidate-integration-helpers
  - coding-rules-audit kind=fact-finder wave=4 status=pending outlineRef=coding-rules-audit
  - test-debloat-audit kind=fact-finder wave=5 status=pending outlineRef=test-debloat-audit
waves: 1, 2, 3, 4, 5
merged: golden-determinism-probe, third-party-assumption-tests
blocked: (none)
failed: (none)
open steer questions:
  - awareness-plan-1-cache-file-needs-awareness ref=plan-1 disposition=human-awareness: Committed file in every linted repo (incl. consumers) with reviewable diffs and possible branch conflicts. Weights 0.03-0.8GB in model cache with own licenses. Install docs must mention file. Architect decides now; operator should be aware of footprint and license review.
  - awareness-plan-1-human-cache-location ref=plan-1 disposition=human-awareness: Assumption + ADR-003 place git-stored cache at linted root for python-setup and consumers; weights stay in user cache. Adds one committed file per consumer, reviewable diffs, possible line-local merges, must pass detect-secrets. Architect can proceed; operator should be aware before epic implements.
  - awareness-plan-1-human-material-definition ref=plan-1 disposition=human-awareness: Assumption defines material as findings {tool,file,line,col,rule} SEMANTIC=0 + checker units + CLI/exit + baseline/autofix + configs/scopes; model accept/reject non-material, heuristic rejections material. Makes preserve testable but narrows intent. Architect can proceed for iter1; record for operator review.
  - awareness-plan-1-human-never-lint-broadening ref=plan-1 disposition=human-awareness: Assumption expands never-test-linting to ban subprocess re-lint, AST/source re-implementation, and config-consistency re-checks (e.g. test_self_lint_clean.py slow gate, guards, config re-checks). M3 lists for removal, iter2 removes. Rationale (rot with rule churn) reasonable but deletes coverage; operator visibility warranted.
  - awareness-plan-1-material-definition-needs-awareness ref=plan-1 disposition=human-awareness: Assumption defines 4 limbs; reranker decisions not material, heuristic rejections material. Model 'only tightens acceptance' may add W9704 under default SEMANTIC=1 vs today heuristic-only. Architect decides now; operator should know tightening is intentional, not regression.
  - awareness-plan-1-never-linting-policy-needs-awareness ref=plan-1 disposition=human-awareness: Policy 'pytest never asserts lint-clean; lint gate does' removes self-lint guard running all 13 tools on repo. Trades pytest redundancy for gate reliance. Architect decides now; operator should know pytest -q alone will no longer catch self-lint regressions.

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
