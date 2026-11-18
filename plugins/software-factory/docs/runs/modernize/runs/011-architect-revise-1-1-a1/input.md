# Step: Architect Revise

## Goal
Revise the iteration execution plan (`plan-N.yaml`) in response to adversarial feedback from the plan reviewer.

## Rules
- Exploration budget: evaluate review feedback against the plan and the prepared context pack (`# Context Pack — `modernize`

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
`). Read code ONLY to verify a specific reviewer objection (few targeted reads, never broad scans or chunked whole-file reading). Translate newly identified unknowns into spike outlines or uncertainties instead of exploring in-turn. Keep terse.
- Feedback resolution: evaluate each review suggestion. Address valid concerns by adjusting milestones, scenarios, directional interfaces, or adding spikes.
- Architectural authority: for suggestions you deliberately reject or defer, provide clear, defensible technical rationale.
- Maintain plan bounds: keep milestone counts and dependencies within configured limits.
- Output: yield the updated plan matching `plan.schema.json`.

## Current Plan
{
  "iteration": 1,
  "milestones": [
    {
      "id": "M1",
      "title": "Golden lint-findings safety net (behavior-preservation contract)",
      "scenarios": [
        "Scenario: Golden snapshot pins current behavior\n  Given a fresh git-initialised copy of tests/data/minimal_sample_project and PYTHON_SETUP_LINT_SEMANTIC=0\n  When run_lint runs with the shipped configs and captures its baseline into a temp file\n  Then the findings reduced to {tool, file, line, col, rule} equal tests/data/golden/minimal_sample_project_findings.json exactly",
        "Scenario: Behavior drift is reported precisely\n  Given a change that adds or removes any finding on the sample project\n  When `uv run pytest tests/integration.py -v` runs\n  Then the golden assertion fails and lists every added and every removed record",
        "Scenario: Deterministic regeneration\n  Given PYTHON_SETUP_UPDATE_GOLDEN=1\n  When the golden test runs twice in a row\n  Then both runs write a byte-identical golden file, sorted by (tool, file, line, col, rule), with project-relative POSIX paths and no messages, timestamps or absolute paths",
        "Scenario: Planted-rule coverage preserved\n  Given the golden snapshot\n  When it is checked against the planted rule list\n  Then every planted rule symbol appears, the 'pre-existing' brush-off yields unjustified-suppression, and the carry-from-external justification yields no unjustified-suppression"
      ],
      "directionalInterfaces": [
        "tests/data/golden/minimal_sample_project_findings.json: a sorted JSON array of {tool: str, file: str, line: int, col: int, rule: str}. It lives outside the sample project dir, so it is never copied into the project or linted.",
        "run_lint(config=RunnerConfig(cwd=project, config_paths=shipped_config_paths()), path='.', baseline=str(tmp/'capture.json'), overwrite_baseline=True) -> int. Captured records use the runner.baseline._capture_baseline schema with `msg` removed.",
        "collect_findings(project: Path, tmp: Path) -> list[Finding]; assert_matches_golden(findings: list[Finding], golden: Path) -> None. When PYTHON_SETUP_UPDATE_GOLDEN=1 it rewrites the golden file instead of asserting."
      ]
    },
    {
      "id": "M2",
      "title": "Test infrastructure and third-party assumptions baseline (test infra/assumptions first)",
      "scenarios": [
        "Scenario: Shared helpers exist once\n  Given helpers for copying the sample project, initialising git and resolving shipped config paths\n  When tests/ is searched\n  Then each helper is defined exactly once and imported by tests/integration.py, tests/conftest.py and runner test helpers",
        "Scenario: Integration gate module within limits\n  Given the extracted helpers\n  When `uv run lint` and `uv run pytest tests/integration.py -v` run\n  Then tests/integration.py has <= 500 lines and no too-many-lines suppression, test names are unchanged, all tests pass and the golden snapshot is unchanged",
        "Scenario: Third-party contracts pinned\n  Given the astroid, pylint and beartype behaviors that the custom checkers rely on\n  When `uv run pytest tests/assumptions -q` runs\n  Then each contract has one passing TestImportedPackageBehavior test named test_<api>_given_<condition>_then_<expected> and marked no_external_api",
        "Scenario: Broken assumption is diagnosed at the source\n  Given a dependency upgrade that changes e.g. astroid Module.stream() or doc_node semantics\n  When the unit suite runs\n  Then the failing test is the assumption test that names that contract, not an unrelated checker test"
      ],
      "directionalInterfaces": [
        "tests/_project_helpers.py: copy_sample_project(tmp_path: Path) -> Path; git_init(project: Path) -> None; shipped_config_paths() -> dict[str, Path]. Each is defined once; tests/conftest.py and tests/runner/_autofix_helpers.py import them instead of redefining.",
        "tests/assumptions/{test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contracts.py}: class TestImportedPackageBehavior; pytestmark = pytest.mark.no_external_api."
      ]
    },
    {
      "id": "M3",
      "title": "Modernization debt inventory and subsystem epic decomposition",
      "scenarios": [
        "Scenario: Coding-rules debt inventoried\n  Given CodingRules.md and AGENTS.md\n  When the coding-rules audit completes\n  Then every src/ and scripts/ module is listed with concrete violations (file:line evidence, CodingRules section, debt category adjacent|impacting|blocking, estimated LoC delta) and an owning subsystem (runner | checkers | setup-testing-scripts)",
        "Scenario: Test redundancy inventoried\n  Given tests/ and the golden snapshot\n  When the test-debloat audit completes\n  Then each test module has a keep|merge|rewrite|remove recommendation that names the behavior it protects and the surviving test that covers it, and every test that asserts this repository passes lint is listed for removal",
        "Scenario: Subsystem epics decomposable without overlap\n  Given both audit reports\n  When iteration 2 is replanned\n  Then the runner, checkers and setup-testing-scripts epics have disjoint file ownership that excludes files owned by semantic-decision-model"
      ],
      "directionalInterfaces": [
        "Coding-rules audit report rows: {module, CodingRules section, evidence file:line, category, est. LoC delta, owner subsystem, proposed fix}",
        "Test audit report rows: {test module, behaviors protected, duplicate-of, recommendation keep|merge|rewrite|remove, reason, owner subsystem}"
      ],
      "replanAfter": true
    }
  ],
  "uncertainties": [
    {
      "id": "U1",
      "description": "Which decision model meets all the constraints is unknown. The constraints are: CPU-friendly, a license compatible with an MIT tool that downloads weights at runtime, Python 3.14 CPU wheels for its runtime, no unpinned remote code, and acceptable accuracy on real justifications. fastino/GLiDE-0.4B uses a 'fastino-community' license, ships 0.81 GB of bf16 weights, needs its bundled `glide` package, and was tested on Python 3.12 with torch 2.14 and transformers 5.17. The smaller candidates need custom inference code and their licenses vary (e.g. crivo is cc-by-nc-4.0, tasksource-decider-nano is apache-2.0, bekko has ONNX exports).",
      "spikeOutlines": [
        "semantic-decision-model epic, fact-finder: a candidate matrix (license, params/download size, runtime stack, Python 3.14 wheel availability, custom-code requirement, pinnable revision) covering GLiDE-0.4B and smaller Decision-Index models",
        "semantic-decision-model epic, poc: CPU-only cold-load time, warm per-decision latency and accuracy on a labeled corpus built from this repo's real suppression justifications plus the brush-off/meaningful tables in today's tests; pick the smallest model, prompt and threshold that meet the bar",
        "semantic-decision-model epic, test-assumptions: install the chosen runtime through the `semantic` extra on Python 3.14 and pin its loader/inference API behavior in tests/assumptions/"
      ]
    },
    {
      "id": "U2",
      "description": "How a git-stored cache behaves under concurrency and cleanup when it is written from inside pylint is unknown. Open questions: pylint `jobs` under the runner and pre-commit, when checker open()/close() hooks run, partial-path and staged-file runs, and three pylint invocations (pylint, pylint-pyi, pylint tests) sharing one project.",
      "spikeOutlines": [
        "semantic-decision-model epic, test-assumptions: pin pylint 4.x invocation and hook semantics (process count, close() timing, partial runs) that the cache's lock, merge and mark-and-sweep design relies on"
      ]
    },
    {
      "id": "U3",
      "description": "The golden snapshot must be deterministic across runs and machines. Possible nondeterminism: record ordering from pylint duplicate-code, detect-secrets results over git ls-files, pyright/mypy message churn, and absolute-path leakage.",
      "spikeOutlines": [
        "Inside golden-findings-snapshot: run the capture twice, diff the results, and normalize or exclude any unstable field, with a documented reason"
      ]
    },
    {
      "id": "U4",
      "description": "The size and shape of the coding-rules debt in src/ and of the redundant or lint-testing tests in tests/ (~28.6k LOC) are unknown, so the subsystem epics cannot be scoped responsibly yet.",
      "spikeOutlines": [
        "coding-rules-audit (fact-finder)",
        "test-debloat-audit (fact-finder)"
      ]
    }
  ],
  "itemOutlines": [
    {
      "slug": "golden-findings-snapshot",
      "kind": "story",
      "title": "Golden snapshot of normalized lint findings for the sample project",
      "description": "Make the integration gate pin exact lint behavior.\n\n- **Capture.** Run the real pipeline on a git-initialised temp copy of tests/data/minimal_sample_project with shipped configs and PYTHON_SETUP_LINT_SEMANTIC=0 (monkeypatched). Capture records with run_lint(..., baseline=<tmp>/capture.json, overwrite_baseline=True).\n- **Normalize.** Reduce records to {tool, file, line, col, rule}: drop `msg`, use project-relative POSIX paths, sort by (tool, file, line, col, rule).\n- **Compare.** Compare against the committed tests/data/golden/minimal_sample_project_findings.json. Keep it outside the sample dir so it is never linted. On mismatch, the failure lists added and removed records.\n- **Regenerate.** PYTHON_SETUP_UPDATE_GOLDEN=1 rewrites the file deterministically.\n- **Reuse the existing run.** Prefer extending the pipeline run already in TestMinimalSampleProject::test_setup_new_and_lint over adding a second full run.\n- **Replace the substring loop.** Swap the per-rule substring loop over violations.txt for a coverage check derived from the golden. Delete violations.txt if nothing else references it.\n- **Keep key assertions.** The brush-off 'pre-existing' and carry-from-external assertions stay, expressed as golden records.\n- **Verify determinism.** Run the capture twice (U3).\n\nNo src/ changes. Acceptance: `uv run pytest tests/integration.py -v`, `uv run pytest -q` and `uv run lint` pass with an empty lint.baseline.",
      "milestoneId": "M1"
    },
    {
      "slug": "third-party-assumption-tests",
      "kind": "test-assumptions",
      "title": "Pin astroid/pylint/beartype contracts relied on by checkers",
      "description": "Create tests/assumptions/ (with __init__.py). Add TestImportedPackageBehavior tests for each third-party behavior the checkers depend on:\n\n- **astroid:** Module.stream() yields bytes; doc_node is set for module, class and function docstrings; nodes_of_class accepts a tuple of classes; Const and JoinedStr expose fromlineno/end_lineno/col_offset/end_col_offset, which the string-literal span logic uses.\n- **pylint:** CheckerTestCase/UnittestLinter capture add_message output; plugins register through `register(linter)`; MessageDefinitionTuple has the expected shape.\n- **beartype:** decorating a function whose annotation is a TYPE_CHECKING-only forward reference fails at call time. This is the stated rationale behind the repeated missing-beartype suppressions on register().\n\nNaming and markers: test_<api>_given_<condition>_then_<expected>, pytestmark no_external_api.\n\nNo src/ changes. If an assumption turns out false, keep the test asserting the observed behavior and record the discrepancy in the item report for the M3 audits.",
      "milestoneId": "M2"
    },
    {
      "slug": "consolidate-integration-helpers",
      "kind": "story",
      "title": "Single-source shared test helpers; bring tests/integration.py under 500 lines",
      "description": "Extract the helper functions in tests/integration.py (_copy_sample, _init_git, _shipped_config_paths, _make_config and any violations.txt leftovers) into tests/_project_helpers.py. Dedupe them with tests/conftest.py::shipped_config_paths and tests/runner/_autofix_helpers.py::_git_init so each helper is defined once and imported everywhere.\n\nConstraints:\n- tests/integration.py stays the gate entry point at the same path, with unchanged test class and function names.\n- Shrink it to <= 500 lines and remove its too-many-lines suppression.\n- No behavior change: the golden snapshot stays unchanged and test counts stay the same.\n- If any test count in AGENTS.md changes, update it.\n\nAcceptance: `uv run pytest tests/integration.py -v`, `uv run pytest -q` and `uv run lint` pass.",
      "milestoneId": "M2",
      "deps": [
        "golden-findings-snapshot"
      ]
    },
    {
      "slug": "coding-rules-audit",
      "kind": "fact-finder",
      "title": "Inventory CodingRules.md/AGENTS.md violations across src/ and scripts/",
      "description": "Read-only audit of src/python_setup_lint/** and scripts/** against CodingRules.md and AGENTS.md. Exclude files owned by the semantic-decision-model epic.\n\nWhat to inventory:\n- .pyi completeness and fidelity, and private symbols in stubs.\n- @beartype coverage, and structural suppressions repeated across checkers (missing-beartype on register(), type: ignore[misc] on every mixin-based checker class, ty/pyright ignores).\n- Trivial wrappers and duplicated logic, e.g. module stream read/decode copied across checkers, or `make_tc` duplicating testing._make_tc.\n- Redundant fallbacks for hard-declared deps, e.g. the astroid 3.x docstring path while astroid>=4.0.4 is declared.\n- Legacy/compat stubs, e.g. baseline._FALLBACK_TOOLS, peek_fallback_tools, the _compare_sorted re-export.\n- Over-long rationale comments, e.g. the 500+ char comment ending in `# pylint: disable=unjustified-suppression` in runner/dispatch.py.\n- Modules near the 500-line limit and functions near the R0912/R0915 thresholds.\n- structlog usage and the error-handling rules.\n\nOutput: a table of {module, rule section, evidence file:line, category adjacent|impacting|blocking, est. LoC delta, owner subsystem runner|checkers|setup-testing-scripts, proposed fix}, plus a proposed disjoint file ownership for the iteration-2 subsystem epics.",
      "milestoneId": "M3",
      "replanAfter": true
    },
    {
      "slug": "test-debloat-audit",
      "kind": "fact-finder",
      "title": "Inventory redundant, lint-testing and rule-violating tests",
      "description": "Read-only audit of tests/**. Exclude the semantic tests owned by semantic-decision-model.\n\nFor each test module, record:\n- the behaviors it protects;\n- duplicates of other tests, i.e. the same behavior asserted elsewhere, including coverage already provided by the golden snapshot;\n- violations of the CodingRules Tests section: mocking first-party code, naming, missing markers, shared fixtures inside test files, list[Any] pytest.param tables in tests/checkers/_factories.py (~1400 lines), cases far from their tests;\n- tests that 'test linting' (test_self_lint_clean.py, source-scanning guards in test_runner_private_imports.py, config-consistency checks that re-lint the repo);\n- slow/benchmark tests;\n- module names that encode historical task IDs (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*, test_t3_*).\n\nOutput: rows of {test module, behaviors protected, duplicate-of, recommendation keep|merge|rewrite|remove, surviving coverage, reason, owner subsystem}, with an estimated LoC reduction per subsystem.",
      "milestoneId": "M3",
      "replanAfter": true
    }
  ],
  "assumptions": [
    {
      "assumption": "'Material lint/check behavior' means four things:\n- the findings {tool, file, line, col, rule} that each of the 13 tools and each custom checker produces, pinned by the golden snapshot and the checker unit tests;\n- CLI flags and exit codes;\n- baseline and autofix semantics;\n- shipped configs and tool scopes.\n\nThe replaced reranker's individual accept/reject decisions are not material. The heuristic gate's outcomes (rejecting empty, boilerplate, brush-off and rule-echo justifications) are material.",
      "why": "The intent replaces the model and also demands behavior preservation. Drawing this boundary makes 'preserve' mechanically testable.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "The git-stored decision cache belongs to the repository being linted (python-setup itself and consumer projects alike), not to the installed package. Model weights are never committed; only decisions are.",
      "why": "Decisions depend on project content and must be reproducible in that project's CI without the model. Weights run from roughly 0.03 to 0.8 GB and carry their own licenses.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Dev and CI environments do not install the `semantic` extra; sentence-transformers is absent from .venv today. All gates therefore run the heuristic path plus cache hits, and real-model tests are marked slow + with_real_api.",
      "why": "Matches the current .venv contents and keeps the gates offline, fast and deterministic."
    },
    {
      "assumption": "tests/integration.py, `uv run pytest -q`, `uv run pytest tests/integration.py` and `uv run lint` are gate contracts: their paths and commands do not change during the modernization.",
      "why": "The infra gates and AGENTS.md reference them, so renaming any of them would silently break gating."
    },
    {
      "assumption": "'Never test linting' means pytest must not assert that this repository is lint-clean or re-run lint tools on it. The `uv run lint` gate and pre-commit enforce that. Tests exercise checker and runner logic on synthetic inputs and on the sample project.",
      "why": "This removes slow, duplicate coverage such as test_self_lint_clean.py and keeps tests focused on behavior.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Only the semantic-decision-model epic starts now. The runner, checkers and setup-testing-scripts epics are spawned at the iteration-2 replan, informed by the M3 audits.",
      "why": "Debloat must follow the safety net and the assumption tests ('test infra/assumptions first'). Starting the subsystem epics now would mean concurrent edits to shared test infra and conflicting merges."
    },
    {
      "assumption": "At least one model among GLiDE-0.4B and the smaller Decision-Index models has a compatible license, Python 3.14 CPU wheels and a pinnable revision. If none qualifies, the semantic epic escalates instead of shipping a non-compliant model.",
      "why": "GLiDE-0.4B uses a custom community license and was tested on Python 3.12. Several smaller candidates are non-commercial or require remote code.",
      "disposition": "verify via semantic-decision-model spikes"
    }
  ],
  "epics": [
    {
      "slug": "semantic-decision-model",
      "intent": "# semantic-decision-model\n\nReplace the cross-encoder reranker behind the suppression-justification check with a CPU-friendly small decision model plus a git-stored decision cache that cleans itself up. Preserve every material lint/check behavior. This is a child epic of the `modernize` saga.\n\n## Scope (files owned by this epic)\n- src/python_setup_lint/checkers/_semantic.py and .pyi, plus any new private modules and stubs for the decision backend and cache (e.g. checkers/_decision_backend.py, checkers/_decision_cache.py). Every new module needs a .pyi, @beartype on public functions, structlog kwargs logging, and must respect tach boundaries.\n- check_if_meaningful in checkers/_base.py and .pyi. Its call sites in conformance/suppression_justification_checker.py and conformance/bare_except_comment_checker.py change only where the call contract changes.\n- _OPTIONAL_IMPORT_PATTERNS in conformance/no_try_import_checker.py: replace sentence_transformers with the new runtime's modules.\n- pyproject.toml [project.optional-dependencies].semantic and uv.lock; the semantic entries in .gitignore.\n- Docs: docs/semantic-justification.md, the check_if_meaningful bullet in docs/custom-checks.md, the semantic section of docs/troubleshooting.md, the 'Semantic justification pipeline' section of AGENTS.md (which today wrongly calls W9704 'the semantic checker'), and a CHANGELOG.md entry.\n- Tests: tests/checkers/test_semantic_check.py, tests/checkers/test_semantic_threshold.py, TestSuppressionRerankerPipeline in tests/checkers/test_suppression_justification_checker.py, new decision/cache test modules, tests/checkers/conftest.py, and new runtime-assumption modules under tests/assumptions/.\n\nOut of scope:\n- Refactoring other checkers or runner modules.\n- tests/integration.py, tests/conftest.py and tests/data/** (owned by the root safety-net milestones and the later subsystem epics).\n- Any unavoidable runner touch point (e.g. passing the cache path to pylint subprocesses) must stay minimal and be recorded in an ADR.\n\n## Requirements\n1. Spikes come before design commitments.\n   - (a) fact-finder: build a candidate matrix for fastino/GLiDE-0.4B and smaller models from the Jev Decision Index board (e.g. tasksource/tasksource-decider-nano, hotchpotch/bekko-system-one-v0-17m/-68m, knowledgator/gliclass-v4-edge, fastino/GLiNER2.5-Decide). Cover:\n     - license: exclude non-commercial; GLiDE is 'fastino-community';\n     - parameter count and download size;\n     - runtime stack (torch+transformers vs onnxruntime+tokenizers), with Python 3.14 CPU wheels on Linux, macOS and Windows;\n     - custom inference code: it must be vendored or pinned to a revision; never unpinned trust_remote_code;\n     - offline behavior.\n   - (b) poc, CPU only: measure cold-load time, warm per-decision latency and accuracy on a labeled corpus. Build the corpus from this repository's real suppression justifications plus the brush-off/meaningful tables in today's tests. Choose the smallest model, prompt (e.g. a yes/no question over {justification, rule, context}) and threshold that meet the accuracy bar, and record the measurements and the choice in an ADR.\n   - (c) test-assumptions: pin how pylint 4.x is invoked by the runner and by pre-commit (jobs, process per tool, when checker open()/close() run, partial-path and staged-file runs). The cache's lock, merge and mark-and-sweep design depends on this.\n2. Decision contract:\n   - Keep check_if_meaningful(text, *, rule, code_context, comment) -> bool.\n   - Keep PYTHON_SETUP_LINT_SEMANTIC: default '1'; '0' means heuristic only, and the semantic module is never imported.\n   - The heuristic runs first as a hard gate. Empty, short, boilerplate, brush-off and rule-echo justifications are rejected without consulting the model. Only text the heuristic accepts goes to the cache, then to the model.\n   - semantic_check_if_meaningful keeps returning bool | None. None means the backend is unavailable and the heuristic result stands.\n   - The model sits behind a small DecisionBackend Protocol (decide(justification, rule, context) -> probability) so tests can inject a fake at the model boundary.\n3. Packaging and configuration:\n   - The `semantic` extra ships the chosen runtime instead of sentence-transformers.\n   - Without the extra, or on download, load or inference failure, results equal the heuristic plus cache hits. Emit one warning and avoid a retry storm (keep a sentinel).\n   - Weights stay in the user's model cache, never in git.\n   - PYTHON_SETUP_LINT_DECISION_MODEL selects the model id and pinned revision. PYTHON_SETUP_LINT_RERANKER_MODEL is deprecated: log a warning and ignore it.\n4. Git-stored decision cache, replacing ~/.cache/python-setup/semantic/results.json:\n   - Location: a committed file at the linted project's root, e.g. .python-setup-decisions.json next to lint.baseline.\n   - Format: deterministic, sorted, one entry per line. Entries are human-readable: {justification (normalized), rule, model@revision+prompt-version, decision, files}.\n   - Keys must not trip detect-secrets (no raw high-entropy hex), and the file must pass all 13 tools.\n   - Decision inputs are limited so that unrelated edits to a line do not invalidate its entry.\n   - Cache hits need no model, so lint results are identical on machines with and without the extra.\n   - Writes are lock-protected merge-on-write followed by an atomic replace.\n   - Cleanup is mark-and-sweep, scoped to the files linted in the run. Partial runs never delete entries for files they did not lint. Entries for deleted files and for other model/prompt versions are dropped.\n   - Tests never write to the repository's own cache (the path is isolated by a fixture).\n5. Pass the actual suppressed rule code(s) from disable=/noqa:/ignore[...] instead of the checker's own symbol ('unjustified-suppression'). If this changes any heuristic outcome on the sample project, regenerate tests/data/golden/minimal_sample_project_findings.json with PYTHON_SETUP_UPDATE_GOLDEN=1 in the same change, review the diff, and record it in CHANGELOG. Otherwise the golden stays unchanged.\n6. Tests:\n   - Merge TestBrushOffPatterns, TestMeaningfulPatterns and TestSemanticThreshold into one parametrized heuristic table.\n   - Test the backend through the fake Protocol. Do not patch module globals or builtins.__import__, and do not import private symbols with type: ignore.\n   - Add cache round-trip, cleanup and concurrency tests on tmp paths, plus a hypothesis round-trip for the cache format.\n   - Add exactly one slow + with_real_api end-to-end test that uses the real model.\n   - Delete vacuous assertions such as `result is None or isinstance(result, bool)`.\n   - Keep every module under 500 lines without too-many-lines suppressions.\n   - Never test linting.\n7. Update the docs and agent context listed in Scope to the new design. CHANGELOG covers only user-visible changes: the extra's new contents, the new env var, the deprecated env var and the new cache file.\n\n## Acceptance (Gherkin)\n- Scenario: Heuristic path unchanged. Given PYTHON_SETUP_LINT_SEMANTIC=0, When the sample project is linted, Then the findings equal tests/data/golden/minimal_sample_project_findings.json.\n- Scenario: Cache works without the model. Given the semantic extra is not installed and the project cache holds a false decision for a justification/rule pair, When lint runs, Then W9704 is emitted for that suppression and no model is loaded.\n- Scenario: Brush-off never reaches the model. Given the justification 'pre-existing' and an available fake backend, When check_if_meaningful runs, Then it returns False and the backend is not called.\n- Scenario: One call per unique pair. Given a cache miss and an available backend, When lint runs, Then the backend is called exactly once per unique (justification, rule) and the decision is persisted in sorted order.\n- Scenario: Scoped cleanup. Given a suppression comment has been deleted from a.py, When a run lints a.py, Then its cache entry is removed. And When a run lints only b.py, Then the entry is kept.\n- Scenario: No retry storm. Given model loading fails, When lint checks many suppressions in one process, Then loading is attempted once and heuristic results are returned.\n- Gates: `uv run pytest -q`, `uv run pytest tests/integration.py -v` and `uv run lint` all pass with an empty lint.baseline."
    }
  ],
  "techDebt": [
    {
      "id": "TD-1",
      "description": "The suppression-justification and bare-except checkers pass their own symbol ('unjustified-suppression' / 'bare-except-comment') as `rule` to check_if_meaningful. As a result, the documented rule-echo heuristic and the semantic model never see the rule that is actually being suppressed.",
      "category": "impacting",
      "resolution": "Resolved by semantic-decision-model requirement 5: extract the real suppressed codes and pass them. Any golden diff this causes must be reviewed, regenerated in the same change, and recorded in CHANGELOG."
    },
    {
      "id": "TD-2",
      "description": "Semantic tests mock first-party code: they patch module globals (_RERANKER_UNAVAILABLE, _RESULT_CACHE), patch builtins.__import__, and import private symbols under type: ignore. Several assertions are vacuous (`result is None or isinstance(result, bool)`). This breaks the CodingRules mocking strategy and protects nothing.",
      "category": "impacting",
      "resolution": "Resolved by semantic-decision-model requirement 6: inject a fake at the DecisionBackend Protocol boundary and delete the vacuous tests."
    },
    {
      "id": "TD-3",
      "description": "tests/integration.py is 627 lines with a too-many-lines suppression. It duplicates the helpers in tests/conftest.py and tests/runner/_autofix_helpers.py, and it only substring-matches rule names, so dropped, moved or new findings go unnoticed.",
      "category": "impacting",
      "resolution": "M1 golden-findings-snapshot pins the exact findings. M2 consolidate-integration-helpers single-sources the helpers and brings the module to <= 500 lines without the suppression."
    },
    {
      "id": "TD-4",
      "description": "tests/checkers/test_semantic_check.py is 506 lines and suppresses too-many-lines. Its heuristic tables duplicate tests/checkers/test_semantic_threshold.py.",
      "category": "impacting",
      "resolution": "Resolved by semantic-decision-model requirement 6: one merged parametrized table, and modules under 500 lines."
    },
    {
      "id": "TD-5",
      "description": "The same structural suppressions repeat across about 15 checkers: missing-beartype on every register(linter), type: ignore[misc] on every SourceRootMixin/FunctionVisitMixin checker class, and copied stream-read/decode blocks. These are design smells, not one-off justifications.",
      "category": "adjacent",
      "resolution": "Inventoried by coding-rules-audit and fixed by the iteration-2 checkers epic (e.g. a BaseChecker-derived source-root base class, a shared source-lines helper, a typed register pattern)."
    },
    {
      "id": "TD-6",
      "description": "Legacy and compat code remains for removed formats and for hard-declared dependencies: baseline._FALLBACK_TOOLS and peek_fallback_tools ('legacy stub: always empty'), the _compare_sorted re-export, and the astroid 3.x docstring fallback even though astroid>=4.0.4 is declared. CodingRules says to remove fallbacks for hard-declared dependencies.",
      "category": "adjacent",
      "resolution": "To be removed by the iteration-2 runner and checkers epics, guarded by the golden snapshot."
    },
    {
      "id": "TD-7",
      "description": "runner/dispatch.py carries a rationale comment of more than 500 characters that ends in `# pylint: disable=unjustified-suppression`, which suppresses the justification checker itself.",
      "category": "adjacent",
      "resolution": "Iteration-2 runner epic: move the rationale to design/0002 (already referenced) and leave a short, justified comment."
    },
    {
      "id": "TD-8",
      "description": "tests/checkers/_factories.py is about 1400 lines. It types around 40 pytest.param tables as list[Any] with copy-pasted justification comments, and keeps cases far from the tests that use them.",
      "category": "adjacent",
      "resolution": "Iteration-2 checkers epic, following test-debloat-audit: type the tables as ParameterSet, move cases next to their tests, and split per checker."
    },
    {
      "id": "TD-9",
      "description": "Several test modules are named after historical task IDs (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*, test_t3_*) instead of behavior. Some tests lint this repository: test_self_lint_clean.py and the source-scanning guards in test_runner_private_imports.py.",
      "category": "adjacent",
      "resolution": "Iteration-2 runner and setup epics, following test-debloat-audit: rename modules by behavior and remove lint-the-repo tests, which the `uv run lint` gate already covers."
    },
    {
      "id": "TD-10",
      "description": "ADR locations disagree: CodingRules.md requires design/ (ADR format), but factory ADRs are written to docs/adr.",
      "category": "adjacent",
      "resolution": "At the iteration-2 replan, add a cross-reference (design/README or the AGENTS.md index) so both locations are discoverable. Engine configuration is not changed."
    }
  ],
  "adrs": [
    {
      "id": "ADR-001",
      "title": "Golden findings snapshot as the behavior-preservation contract",
      "context": "The modernization enforces coding rules, debloats code and tests, removes tests and swaps the semantic model, and it must still preserve every material lint/check behavior. lint.baseline is empty. The integration test only checks that each planted rule name appears somewhere in the output, so duplicate findings, moved lines and new false positives all go undetected.",
      "decision": "Commit a normalized snapshot of every finding, {tool, file, line, col, rule}, for tests/data/minimal_sample_project. Store it at tests/data/golden/minimal_sample_project_findings.json, outside the linted project. Produce it through the runner's baseline capture with PYTHON_SETUP_LINT_SEMANTIC=0 and assert it in tests/integration.py. Regenerate it only with PYTHON_SETUP_UPDATE_GOLDEN=1, in the same change as the behavior change, with the diff reviewed. Every modernization item must leave it unchanged unless the item explicitly declares a behavior change.",
      "consequences": "Regression detection across all 13 tools and every custom checker becomes exact and cheap, and golden updates become explicit review points. Message text is not snapshotted, so changes in message wording are not guarded. Tool upgrades via uv.lock may require a reviewed regeneration."
    },
    {
      "id": "ADR-002",
      "title": "Heuristic-gated local decision model for justification checks",
      "context": "_semantic.py misuses a sentence-transformers cross-encoder (jina-reranker-v2) as a quality judge. It scores a self-pair, or a query of the form 'rule: unjustified-suppression | context', against a 0.5 threshold. The dependency is heavy, and because it is not installed in dev/CI the heuristic actually makes every decision today. The intent asks for a CPU-friendly small decision model (GLiDE-0.4B or smaller).",
      "decision": "Keep the check_if_meaningful signature and PYTHON_SETUP_LINT_SEMANTIC. Run the heuristic first as a hard gate; its rejections never reach the model. For text the heuristic accepts, consult the git-stored cache first, then a local decision model behind a DecisionBackend Protocol that returns P(meaningful) for a yes/no question. The model, prompt and threshold are chosen by spike under four constraints: a compatible license, Python 3.14 CPU wheels, a pinned revision, and no unpinned remote code. The model ships through the existing `semantic` extra and is configured with PYTHON_SETUP_LINT_DECISION_MODEL. PYTHON_SETUP_LINT_RERANKER_MODEL is deprecated. When the backend is unavailable it returns None and the heuristic result stands.",
      "consequences": "Brush-off rejections are guaranteed regardless of the model, which can only tighten acceptance. sentence-transformers is dropped. no-try-import's optional patterns must list the new runtime. Real-model coverage moves to one slow + with_real_api test. Users who set the old env var get a deprecation warning, documented in CHANGELOG."
    },
    {
      "id": "ADR-003",
      "title": "Git-stored, self-cleaning decision cache",
      "context": "Results are cached in ~/.cache/python-setup/semantic/results.json. That file is gitignored, per machine and unbounded, and it is keyed by a 64-bit truncated SHA-256 that includes code context. As a result, W9704 outcomes can differ between machines with and without the model, and stale entries are never removed. The intent requires a git-stored cache with cleanup.",
      "decision": "Store decisions in a committed file at the linted project's root, e.g. .python-setup-decisions.json next to lint.baseline.\n\n- **Format:** deterministic, sorted, one entry per line. Each entry is {normalized justification, rule, model@revision+prompt-version, decision, files}, with readable composite keys and no high-entropy hex that detect-secrets would flag.\n- **Stable inputs:** decision inputs are limited so that unrelated edits to a line do not invalidate its entry.\n- **Reads and writes:** reads need no model. Writes are lock-protected merge followed by an atomic replace.\n- **Cleanup:** mark-and-sweep, scoped to the files linted in the run, plus removal of entries for deleted files and for stale model/prompt versions.\n- **Tests:** they isolate the cache path.\n\nModel weights stay in the user's model cache.",
      "consequences": "W9704 decisions become reproducible across machines and in CI without the extra. Decision changes show up as reviewable diffs in PRs, and humans can audit them. Concurrent branches may produce small, line-local merge conflicts. Consumer repos gain one committed file, which the install and setup docs must mention, and the file itself must pass all 13 tools."
    },
    {
      "id": "ADR-004",
      "title": "Progressive saga decomposition with disjoint file ownership",
      "context": "Three workstreams (coding-rules enforcement, code/test debloat, the semantic swap) span about 28.6k LOC across 184 files. Running them in parallel would mean conflicting edits to shared test infra. The intent also requires testing the infrastructure and assumptions before any debloat.",
      "decision": "Iteration 1: the root delivers the golden safety net, test-infra consolidation and third-party assumption tests, plus read-only audits, and spawns the semantic-decision-model epic now, since its files are disjoint. Iteration 2 (replan): spawn subsystem epics for runner, checkers and setup-testing-scripts. Each epic does both coding-rules enforcement and test debloat for its own subsystem, with disjoint ownership derived from the audits and with semantic-owned files excluded. Policy: pytest never asserts that this repository passes lint; the `uv run lint` gate does that.",
      "consequences": "Shared test infra is never edited concurrently, and debloat always runs behind the golden snapshot and the assumption tests. Changes to source and its tests stay together within each subsystem. The subsystem epics start one iteration later, but they are scoped from evidence rather than guesswork."
    }
  ]
}

## Plan Review Feedback
{
  "status": "changes_requested",
  "summary": "changes_requested: bounds pass (3/8 milestones, 5/50 items, acyclic) but 28 fix block: golden rc/oracle/config/crash/POSIX/diff, 500-line math, git semantics, ownership/disjoint, cache/injection/threshold; 3 awareness, 3 optional",
  "suggestions": [
    {
      "id": "golden-reuse-breaks-rc",
      "disposition": "fix",
      "summary": "Reusing existing run with overwrite_baseline breaks rc assertion",
      "detail": "test_setup_new_and_lint asserts rc!=0. run_lint with baseline+overwrite_baseline=True forces rc=0 via _handle_baseline. Item requires both 'prefer extending existing run' and baseline capture with overwrite=True, but run_lint returns only int (no results). Fix: allow second run, or change assertion to len(records)!=0, or allow src change to expose results.",
      "location": {
        "file": "tests/integration.py",
        "line": 128
      }
    },
    {
      "id": "violations-oracle-deleted",
      "disposition": "fix",
      "summary": "Deleting violations.txt removes planted-rule oracle",
      "detail": "M1 scenario 'checked against planted rule list' needs oracle. Only _read_violation_rules uses violations.txt, so after replacement 'if nothing else references it' is true and file deleted, making coverage check golden-vs-itself (circular). Fix: retain violations.txt as oracle or define new checked-in expected-rule set and update scenario.",
      "location": {
        "file": "tests/data/minimal_sample_project/violations.txt",
        "line": 1
      }
    },
    {
      "id": "golden-interface-missing-config",
      "disposition": "fix",
      "summary": "M1 interface omits package_name and rumdl override",
      "detail": "Current _make_config sets package_name='minimal_sample' and rewrites rumdl.toml to remove tests/data exclusion. Interface specifies RunnerConfig(cwd, config_paths=shipped_config_paths()) with no package_name and no override. Omitting package_name changes SKIPPED behavior; omitting override changes rumdl findings. Fix: pin interface to use _make_config or include both steps.",
      "location": {
        "file": "tests/integration.py",
        "line": 83
      }
    },
    {
      "id": "golden-crash-null-schema",
      "disposition": "fix",
      "summary": "Golden schema cannot represent crash/None records",
      "detail": "_capture_one emits {file:None,line:None,col:None,rule:'__CRASH__'} for exit<0. Interface defines Finding {tool:str,file:str,line:int,col:int,rule:str} non-nullable. No representation for crashes; comparison would error or silently drop crashes (test asserts no [CRASH]). Fix: define crash handling (sentinels, nullable, or separate no-crash assertion).",
      "location": {
        "file": "src/python_setup_lint/runner/baseline.py",
        "line": 133
      }
    },
    {
      "id": "golden-posix-normalization-gap",
      "disposition": "fix",
      "summary": "POSIX guarantee contradicts baseline relativize",
      "detail": "Scenario requires project-relative POSIX paths. _relativize_file uses str(p.relative_to(cwd)) which yields backslashes on Windows. Interface says 'use _capture_baseline schema with msg removed' (no POSIX conversion). Fix: specify test-side as_posix() normalization or allow src helper.",
      "location": {
        "file": "src/python_setup_lint/runner/baseline.py",
        "line": 161
      }
    },
    {
      "id": "golden-diff-msg-collapse",
      "disposition": "fix",
      "summary": "Msg-less diff logic, Finding type and duplicates undefined",
      "detail": "Baseline equality includes msg via _violation_tuple; two-pointer diff relies on it. Golden drops msg so cannot reuse directly; same 5-tuple with different msg collapses, multiset-vs-set unspecified. Finding type/module and collect_findings/assert_matches_golden ownership undefined; 'it rewrites' ambiguous. Fix: define Finding, module, and golden diff (e.g., Counter on 5-tuple, sorted) with added/removed formatting.",
      "location": {
        "file": "src/python_setup_lint/runner/baseline.py",
        "line": 62
      }
    },
    {
      "id": "u3-inside-story-no-src",
      "disposition": "fix",
      "summary": "U3 determinism work inside no-src story",
      "detail": "U3 lists R0801 ordering, detect-secrets ls-files, pyright/mypy churn, absolute leakage. Outline says 'Inside golden-findings-snapshot: normalize or exclude unstable field' while story declares 'No src/ changes'. Parser/baseline fixes impossible; excluding duplicate-code (planted rule) contradicts 'every planted rule appears'. Fix: isolate into spike (or allow src) and forbid excluding planted rules without ADR.",
      "location": {
        "file": "src/python_setup_lint/runner/baseline.py",
        "line": 48
      }
    },
    {
      "id": "m2-500-math-impossible",
      "disposition": "fix",
      "summary": "Helper extraction alone cannot reach <=500 lines",
      "detail": "File is 627 lines. Helpers total ~61 lines; 627-61=~566, minus M1 loop removal ~15 = ~551, still >500. Item only authorizes extracting helpers, keeping test names. Fix: authorize moving additional blocks (overlay/setup scaffolding) with explicit line budget or split strategy.",
      "location": {
        "file": "tests/integration.py",
        "line": 12
      }
    },
    {
      "id": "m2-git-init-semantics-diverge",
      "disposition": "fix",
      "summary": "Single git_init underspecifies add vs no-add",
      "detail": "integration._init_git does init+config+add . (needed for detect-secrets); autofix._git_init does init+config only. Interface collapses to git_init(project)->None without specifying add/commit. Unify to no-add breaks golden; unify to add-all may break staged-file tests. Fix: define semantics (init+config+add) plus separate stage/commit helpers and list call-site updates.",
      "location": {
        "file": "tests/integration.py",
        "line": 44
      }
    },
    {
      "id": "m2-interface-omits-make-config",
      "disposition": "fix",
      "summary": "M2 interface omits _make_config and import migration",
      "detail": "Item says extract _copy_sample,_init_git,_shipped_config_paths,_make_config plus leftovers. Interface lists only 3 (omits make_config/rumdl override). Unclear whether conftest keeps re-export wrapper (violating 'defined exactly once') or all consumers (e.g., test_self_lint_clean imports from conftest) switch to tests._project_helpers. Fix: list full set, define re-export vs direct import, clear tach for _SHIPPED_CONFIG_FILES import.",
      "location": {
        "file": "tests/conftest.py",
        "line": 170
      }
    },
    {
      "id": "m2-broken-assumption-unfalsifiable",
      "disposition": "fix",
      "summary": "Future-upgrade scenario not falsifiable today",
      "detail": "Scenario 'Given dependency upgrade... Then failing test is assumption test' is hypothetical future, cannot verify now, no simulation procedure. Fix: rewrite as present-tense checks (explicit contract list, each has one TestImportedPackageBehavior; checker tests do not assert third-party internals).",
      "location": {
        "file": "pyproject.toml",
        "line": 52
      }
    },
    {
      "id": "beartype-assumption-needs-proof",
      "disposition": "fix",
      "summary": "Beartype forward-ref failure asserted without evidence",
      "detail": "Item claims TYPE_CHECKING-only annotation 'fails at call time' as rationale for missing-beartype suppressions on register(). Comments cite unresolvable forward ref/circular import but no test proves call-time vs import-time vs checker-only. If false, pins wrong contract. Fix: treat as verify-during-item (assert observed, record discrepancy) and add dep so M3 audits receive report.",
      "location": {
        "file": "src/python_setup_lint/checkers/conformance/no_try_import_checker.py",
        "line": 80
      }
    },
    {
      "id": "m3-symbol-file-ownership-clash",
      "disposition": "fix",
      "summary": "File-level exclusion contradicts symbol-level epic ownership",
      "detail": "Epic owns check_if_meaningful in _base.py, _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py, one class in test_suppression_justification_checker.py — not whole files. M3 says 'exclude files owned by epic' while requiring 'every module listed'. Excluding whole files misses TD-5 slated for checkers epic. Fix: define symbol-level exclusions, keep file coverage.",
      "location": {
        "file": "src/python_setup_lint/checkers/_base.py",
        "line": 143
      }
    },
    {
      "id": "m3-audit-artifact-missing",
      "disposition": "fix",
      "summary": "Audit report artifact and consumption undefined",
      "detail": "Interfaces give row schemas but no artifact path/format. 'Given both audit reports When iteration 2 replanned' has no concrete inputs. Both audits propose ownership/LoC, overlapping. Fix: define artifact (path/format), single owner for disjoint-ownership proposal, and replan consumption.",
      "location": {
        "file": "src/python_setup_lint/checkers/_base.py",
        "line": 1
      }
    },
    {
      "id": "m3-missing-deps-on-m1m2",
      "disposition": "fix",
      "summary": "Audits lack deps on safety-net writes, risk races",
      "detail": "Both audits have no deps. Engine may run them parallel with golden (rewrites integration.py, adds golden/), assumption-tests (adds tests/assumptions/), consolidate (rewrites integration.py, adds helpers). Reads see intermediate state; assumption discrepancies missed. Fix: add deps to golden, assumption-tests, consolidate (still within maxParallelTurns 6).",
      "location": {
        "file": "tests/integration.py",
        "line": 36
      }
    },
    {
      "id": "material-pinning-gap",
      "disposition": "fix",
      "summary": "Non-findings material behaviors lack pinning",
      "detail": "Assumption defines material as findings + CLI flags/exit codes + baseline/autofix + configs/scopes. Golden pins only findings (SEMANTIC=0, overwrite). No snapshot pins other three limbs; M3 may remove runner tests that pin them. Fix: name surviving pinning tests per limb or add snapshots (help/exit-code table, baseline/autofix fixtures).",
      "location": {
        "file": "src/python_setup_lint/runner/cli.py",
        "line": 170
      }
    },
    {
      "id": "never-linting-definition-clash",
      "disposition": "fix",
      "summary": "Never-test-linting definition contradicts removal lists",
      "detail": "Definition: must not assert lint-clean or re-run tools. TD-9/audit list AST-scanning guards (no subprocess) and config-consistency checks as lint-testing to remove. By definition they are not lint-testing. Fix: narrow lists to true re-lint tests or broaden definition with rationale.",
      "location": {
        "file": "tests/runner/test_runner_private_imports.py",
        "line": 69
      }
    },
    {
      "id": "epic-disjoint-false",
      "disposition": "fix",
      "summary": "Semantic epic not file-disjoint, ADR-004 premise false",
      "detail": "ADR-004 spawns epic now 'since files disjoint'. Overlaps: AGENTS.md (M2 counts vs epic pipeline section); _base.py/.pyi; no_try_import_checker.py; test_suppression_justification_checker.py; tests/assumptions/ (__init__+3 vs runtime modules); tests/data/golden/ (M1 creates, req5 regenerates). Fix: sequence AGENTS.md/golden edits, define symbol-level protocol or transfer whole files.",
      "location": {
        "file": "AGENTS.md",
        "line": 85
      }
    },
    {
      "id": "epic-golden-out-of-scope-clash",
      "disposition": "fix",
      "summary": "Epic out-of-scope contradicts req5 golden regen",
      "detail": "Scope says out of scope: tests/integration.py, conftest, tests/data/**. Req5 says regenerate tests/data/golden/... in same change if heuristic changes. Cannot both hold. Fix: allow golden regen as explicit minimal exception with ADR+diff review or make it a root follow-up item.",
      "location": {
        "file": "tests/data/minimal_sample_project/violations.txt",
        "line": 1
      }
    },
    {
      "id": "epic-multicode-contract-vague",
      "disposition": "fix",
      "summary": "Real suppressed codes passing undefined for multi-disable",
      "detail": "Req5 says pass actual code(s) from disable/noqa/ignore instead of own symbol. check_if_meaningful takes rule:str|None single. Multi-disable joining (comma? first? per-code calls?) and rule-echo for lists undefined; bare-except scope ambiguous. Fix: define extraction + joining/calling convention and echo semantics.",
      "location": {
        "file": "src/python_setup_lint/checkers/conformance/suppression_justification_checker.py",
        "line": 152
      }
    },
    {
      "id": "epic-backend-injection-impossible",
      "disposition": "fix",
      "summary": "Fake injection forbidden-patch contradiction",
      "detail": "Req6 requires fake Protocol without patching globals/imports or importing privates with ignore. check_if_meaningful has no backend param; instantiation site undefined. Without hook (param/factory/registry/env), fake cannot inject without patching. Fix: define injection point satisfying both constraints.",
      "location": {
        "file": "src/python_setup_lint/checkers/_base.py",
        "line": 143
      }
    },
    {
      "id": "epic-cache-contract-vague",
      "disposition": "fix",
      "summary": "Cache location/format/key/lock underspecified",
      "detail": "Location 'e.g.' not definitive; JSONL vs JSON, sort key, normalization, revision format, files relative/POSIX undefined; model@revision hex trips detect-secrets; key (justification,rule) vs context inconsistent with decide(justification,rule,context); lock mechanism and test isolation hook undefined. Fix: pin filename, format, sort key, normalization, key tuple, deleted-files semantics, isolation.",
      "location": {
        "file": "src/python_setup_lint/checkers/_semantic.py",
        "line": 44
      }
    },
    {
      "id": "epic-cache-design-before-spike",
      "disposition": "fix",
      "summary": "Lock/merge/sweep prescribed before feasibility spike",
      "detail": "Req4 mandates lock+merge+atomic and mark-and-sweep scoped to linted files. U2 (jobs, open/close timing, partial/staged, 3 invocations) unconfirmed. Per-worker close() views with jobs>1 would violate partial-run guarantee without coordination, contradicting 'spikes before design'. Fix: make conditional on spike (prototype or constrain jobs=1 with test).",
      "location": {
        "file": "src/python_setup_lint/checkers/_base.py",
        "line": 116
      }
    },
    {
      "id": "epic-threshold-accuracy-undefined",
      "disposition": "fix",
      "summary": "Accuracy bar/threshold/probability undefined",
      "detail": "Spike chooses smallest model/prompt/threshold meeting 'accuracy bar' on real justifications + tables. No bar (precision/recall %), threshold location, probability range/semantics, prompt-versioning for invalidation. Fix: define bar, threshold storage, and version string.",
      "location": {
        "file": "src/python_setup_lint/checkers/_semantic.py",
        "line": 125
      }
    },
    {
      "id": "epic-req5-race-with-m1",
      "disposition": "fix",
      "summary": "Req5 golden regen races M1 creation, no dep",
      "detail": "Epic may regenerate golden while M1 creates it; no edge between epic and M1. Concurrent race on uncommitted file. Fix: order epic req5 after M1 commit or make regen a root item.",
      "location": {
        "file": "tests/integration.py",
        "line": 111
      }
    },
    {
      "id": "m1-brushoff-golden-mapping-missing",
      "disposition": "fix",
      "summary": "Brush-off/carry golden expression lacks mapping",
      "detail": "Item says assertions 'stay, expressed as golden records'. Golden has only {tool,file,line,col,rule} (no msg). No mapping names which sample file/line holds pre-existing (expect record) vs carry-from (expect absence). Absence only provable via full equality. Fix: name exact files/lines and assert via golden lookup.",
      "location": {
        "file": "tests/integration.py",
        "line": 138
      }
    },
    {
      "id": "m1-update-golden-ci-safety",
      "disposition": "fix",
      "summary": "UPDATE_GOLDEN rewrite risks vacuous pass in CI",
      "detail": "When env=1 test rewrites instead of asserting. No guard against leakage into CI causing silent update + pass on dirty tree. Fix: require explicit opt-in with warning/skip, forbid in CI, and define determinism check.",
      "location": {
        "file": "tests/integration.py",
        "line": 111
      }
    },
    {
      "id": "changelog-scope-clash",
      "disposition": "fix",
      "summary": "CHANGELOG scope contradicts golden-diff recording",
      "detail": "Req5 says record golden diff in CHANGELOG; Req7 says only user-visible (extra contents, new/deprecated vars, cache file). Golden diff is internal; user-visible is behavior change description. Fix: record behavior change, not raw diff, or expand allowed list.",
      "location": {
        "file": "CHANGELOG.md",
        "line": 1
      }
    },
    {
      "id": "material-definition-needs-awareness",
      "disposition": "human-awareness",
      "summary": "Material-behavior tightening needs operator awareness",
      "detail": "Assumption defines 4 limbs; reranker decisions not material, heuristic rejections material. Model 'only tightens acceptance' may add W9704 under default SEMANTIC=1 vs today heuristic-only. Architect decides now; operator should know tightening is intentional, not regression.",
      "location": {
        "file": "src/python_setup_lint/checkers/_semantic.py",
        "line": 1
      }
    },
    {
      "id": "cache-file-needs-awareness",
      "disposition": "human-awareness",
      "summary": "Committed decisions file impacts consumers",
      "detail": "Committed file in every linted repo (incl. consumers) with reviewable diffs and possible branch conflicts. Weights 0.03-0.8GB in model cache with own licenses. Install docs must mention file. Architect decides now; operator should be aware of footprint and license review.",
      "location": {
        "file": ".gitignore",
        "line": 243
      }
    },
    {
      "id": "never-linting-policy-needs-awareness",
      "disposition": "human-awareness",
      "summary": "Never-test-linting policy deletes guard tests",
      "detail": "Policy 'pytest never asserts lint-clean; lint gate does' removes self-lint guard running all 13 tools on repo. Trades pytest redundancy for gate reliance. Architect decides now; operator should know pytest -q alone will no longer catch self-lint regressions.",
      "location": {
        "file": "tests/runner/test_self_lint_clean.py",
        "line": 1
      }
    },
    {
      "id": "update-golden-env-naming",
      "disposition": "optional",
      "summary": "UPDATE_GOLDEN env naming inconsistent",
      "detail": "PYTHON_SETUP_UPDATE_GOLDEN lacks LINT infix vs PYTHON_SETUP_LINT_* vars. Consider PYTHON_SETUP_LINT_UPDATE_GOLDEN. Non-blocking.",
      "location": {
        "file": "tests/integration.py",
        "line": 111
      }
    },
    {
      "id": "assumptions-class-name-collision",
      "disposition": "optional",
      "summary": "Same TestImportedPackageBehavior in 3 modules confuses reports",
      "detail": "Identical class name in 3 assumption modules needs module qualification on failure. Consider distinct names per module. Non-blocking.",
      "location": {
        "file": "tests/__init__.py",
        "line": 1
      }
    },
    {
      "id": "rumdl-exclude-debt-unlisted",
      "disposition": "optional",
      "summary": "Rumdl tests/data exclusion hack not inventoried",
      "detail": "Shipped rumdl.toml excludes tests/data, forcing per-run rewrite to lint sample AGENTS.md. Affects golden determinism but absent from TD/audits. Consider adding to audit or runner epic. Non-blocking if override retained.",
      "location": {
        "file": "config/rumdl.toml",
        "line": 3
      }
    }
  ]
}

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
