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
      "directionalInterfaces": [
        "tests/data/golden/minimal_sample_project_findings.json: sorted JSON array of Finding {tool: str, file: str | None, line: int | None, col: int | None, rule: str}. Crashes are {tool, file: None, line: None, col: None, rule: '__CRASH__'}; golden holds zero, any crash fails naming the tool. Outside sample dir, never copied/linted. violations.txt RETAINED as planted-rule oracle; coverage = every oracle rule in golden.",
        "Runner config: make_runner_config(project: Path) -> RunnerConfig replicating _make_config (package_name='minimal_sample' + rumdl override stripping '\"tests/data\", '). M1 uses existing _make_config; M2 extracts it unchanged.",
        "tests/_golden.py (new, sole golden owner): Finding TypedDict; collect_findings(project, tmp) -> list[Finding] = dedicated second run_lint(config, path='.', baseline=tmp/'capture.json', overwrite_baseline=True) under SEMANTIC=0, read capture, drop msg, relativize+as_posix(), sort, assert len!=0; assert_matches_golden(findings, golden) = Counter multiset diff on 5-tuples with sorted added/removed output; UPDATE_GOLDEN=1 warns+rewrites, fails loudly if CI/GITHUB_ACTIONS set. First run in test_setup_new_and_lint (no baseline, rc!=0) is untouched."
      ],
      "id": "M1",
      "scenarios": [
        "Scenario: Golden snapshot pins current behavior\n  Given a fresh git-initialised temp copy of tests/data/minimal_sample_project with make_runner_config semantics and PYTHON_SETUP_LINT_SEMANTIC=0\n  When a dedicated capture run (baseline=<tmp>/capture.json, overwrite) reduces records to Finding {tool,file,line,col,rule} (msg dropped, POSIX relpaths, sorted)\n  Then findings equal tests/data/golden/minimal_sample_project_findings.json exactly, len(records)!=0 is asserted, and zero __CRASH__ records exist",
        "Scenario: Behavior drift is reported precisely\n  Given a change adding/removing any finding\n  When `uv run pytest tests/integration.py -v` runs\n  Then the golden assertion fails with a Counter-multiset diff listing every added and removed 5-tuple, sorted",
        "Scenario: Deterministic regeneration\n  Given PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 and no CI env (CI/GITHUB_ACTIONS set fails loudly instead)\n  When the golden test runs twice\n  Then both runs write a byte-identical file (POSIX relpaths, no messages/timestamps/absolutes) with a rewrite warning",
        "Scenario: Planted-rule coverage preserved\n  Given the golden and violations.txt as oracle\n  When coverage is checked\n  Then every oracle rule appears in golden, src/minimal_sample/mod.py:49 ('pre-existing') has an unjustified-suppression record, and mod.py:56 (carry-from) has none (full equality + explicit lookup)"
      ],
      "title": "Golden lint-findings safety net (behavior-preservation contract)"
    },
    {
      "directionalInterfaces": [
        "tests/_project_helpers.py: copy_sample_project(tmp_path)->Path; git_init_and_stage(project)->None (init+config+add ., integration/detect-secrets); git_init_bare(cwd)->None (init+config only, autofix staged-file tests); stage_file(cwd,rel)->None; commit_all(cwd,msg='init')->None; shipped_config_paths()->dict[str,Path]; make_runner_config(project)->RunnerConfig. conftest.py and _autofix_helpers.py delete duplicate defs and import; consumers (integration.py, test_self_lint_clean.py, autofix tests) import from tests._project_helpers. Tests outside tach bounds.",
        "tests/assumptions/{test_astroid_contracts.py,test_pylint_contracts.py,test_beartype_contracts.py}: distinct classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts; pytestmark no_external_api; tests/__init__.py added. Root owns __init__ + these 3; semantic epic appends runtime modules only."
      ],
      "id": "M2",
      "scenarios": [
        "Scenario: Shared helpers exist once\n  Given tests/_project_helpers.py defining the 7 helpers\n  When tests/ is searched\n  Then each helper is defined exactly once there and imported (never redefined) by integration.py, conftest.py and _autofix_helpers.py",
        "Scenario: Integration gate module within limits\n  Given extracted helpers plus moved overlay/assertion blocks\n  When `uv run pytest tests/integration.py -v` runs\n  Then tests/integration.py is <=500 lines (target <=480) with no suppression, test names unchanged, all pass, golden byte-identical",
        "Scenario: Third-party contracts pinned\n  Given the explicit astroid/pylint/beartype contract list\n  When `uv run pytest tests/assumptions -q` runs\n  Then each contract has exactly one passing test named test_<api>_given_<condition>_then_<expected> in its Test*Contracts class marked no_external_api",
        "Scenario: Assumption failures diagnose at the source\n  Given assumption modules as sole pinning location\n  When checker tests are searched\n  Then none asserts third-party internals (Module.stream/doc_node/register shapes); tests/assumptions is the only pinning place"
      ],
      "title": "Test infrastructure and third-party assumptions baseline"
    },
    {
      "directionalInterfaces": [
        "Row schemas: coding-rules {module, section, evidence file:line, category, est. LoC delta, owner, fix}; test-debloat {module, behaviors, duplicate-of, recommendation, surviving coverage, reason, owner}. Artifact = structured item-report tables (no committed file); coding-rules-audit owns the unified disjoint-ownership map; test-debloat-audit contributes LoC estimates + per-limb pinning inventory; iteration-2 replan consumes both.",
        "Symbol-level exclusions (file coverage stays): _base.py::check_if_meaningful (+.pyi), _semantic.py (+.pyi) + new backend/cache modules, no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS, TestSuppressionRerankerPipeline, tests/assumptions runtime modules. Audits list every file, auditing non-excluded symbols normally."
      ],
      "id": "M3",
      "replanAfter": true,
      "scenarios": [
        "Scenario: Coding-rules debt inventoried\n  Given CodingRules.md and AGENTS.md\n  When the audit completes\n  Then every src/scripts module is listed with violations (evidence, section, category, LoC delta, owner runner|checkers|setup-testing-scripts); semantic-owned symbols are marked skipped while the rest of those files is audited",
        "Scenario: Test redundancy inventoried\n  Given tests/ and the golden\n  When the audit completes\n  Then each module has keep|merge|rewrite|remove with surviving coverage, every repo-self-lint test is listed for removal, and each material limb (CLI/exit, baseline/autofix, configs/scopes) names surviving pinning tests or flags blocking debt",
        "Scenario: Subsystem epics decomposable without overlap\n  Given both audit item reports\n  When iteration 2 is replanned\n  Then runner/checkers/setup-testing-scripts have disjoint ownership from the unified proposal, excluding semantic-owned symbols"
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
        "semantic epic test-assumptions: pin pylint 4.x invocation/hook semantics; lock/merge/sweep design conditional on result (else jobs=1 or sidecars)"
      ]
    },
    {
      "description": "Golden must be deterministic across runs/machines. Risks: duplicate-code ordering, detect-secrets over ls-files, pyright/mypy churn, absolute-path leakage.",
      "id": "U3",
      "spikeOutlines": [
        "Inside golden-findings-snapshot: capture twice, diff; test-side normalization only (POSIX/sort/msg-drop). Any src parser/baseline fix needed is recorded as blocking debt for iteration 2, not done in-story. Excluding any field that drops a planted oracle rule is forbidden without an ADR."
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
      "description": "Make the integration gate pin exact behavior. Dedicated capture run (SEPARATE from the rc!=0 run): fresh temp copy via _copy_sample+_init_git, config via _make_config (package_name + rumdl override), monkeypatched SEMANTIC=0, run_lint(baseline=<tmp>/capture.json, overwrite_baseline=True); assert len(records)!=0 (not rc). Normalize test-side: drop msg, project-relative POSIX via as_posix(), sort by 5-tuple. New tests/_golden.py owns Finding {tool,file?,line?,col?,rule}, collect_findings(project,tmp), assert_matches_golden (Counter multiset diff, sorted added/removed). Crash records {rule:__CRASH__, nulls} kept; golden holds zero, any crash fails. Keep test_setup_new_and_lint first run (no baseline, rc!=0) unchanged; golden check in same or new test. Replace substring loop with golden equality + oracle coverage (violations.txt RETAINED as oracle; do not delete). Brush-off/carry expressed as golden lookups: mod.py:49 pre-existing HAS unjustified-suppression record; mod.py:56 carry-from has NONE (absence via full equality + explicit lookup). Regen via PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 (fail loudly under CI/GITHUB_ACTIONS, warn otherwise); verify byte-identical across two runs (U3: test-side normalization only; src fixes deferred as blocking debt; never exclude a field that drops an oracle rule without ADR). No src/ changes. Acceptance: integration, `pytest -q`, `lint` pass, empty lint.baseline.",
      "kind": "story",
      "milestoneId": "M1",
      "slug": "golden-findings-snapshot",
      "title": "Golden snapshot of normalized lint findings"
    },
    {
      "description": "Create tests/assumptions/ (+__init__.py) with distinct classes TestAstroidContracts/TestPylintContracts/TestBeartypeContracts (pytestmark no_external_api), tests named test_<api>_given_<condition>_then_<expected>. Contracts: astroid Module.stream()->bytes, doc_node set for module/class/function, nodes_of_class tuple arg, Const/JoinedStr span attrs (fromlineno/end_lineno/col_offset/end_col_offset); pylint CheckerTestCase/UnittestLinter capture, register(linter) plugin shape, MessageDefinitionTuple shape; beartype TYPE_CHECKING-forward-ref behavior VERIFIED during item (assert observed: call-time vs import-time vs checker-only) and discrepancy recorded in item report for M3. No src/ changes.",
      "kind": "test-assumptions",
      "milestoneId": "M2",
      "slug": "third-party-assumption-tests",
      "title": "Pin astroid/pylint/beartype contracts"
    },
    {
      "description": "Extract into tests/_project_helpers.py: copy_sample_project, git_init_and_stage (init+config+add .), git_init_bare (init+config only), stage_file, commit_all, shipped_config_paths, make_runner_config (package_name + rumdl override). Delete duplicate defs in conftest.py and _autofix_helpers.py (import instead); update consumers (integration.py, test_self_lint_clean.py, autofix tests). Line budget to reach <=500 (target <=480): helpers ~61 + M1 loop removal ~15 + moved overlay scaffolding (pylintrc rewrite ~30-40) + moved assertion blocks (tool-section/skipped/crash/W9705 ~25-30) + import/docstring trim. tests/integration.py keeps path, class/function names; golden byte-identical; test counts same (update AGENTS.md counts if changed; epic owns pipeline section). Acceptance: integration, `pytest -q`, `lint` pass.",
      "kind": "story",
      "milestoneId": "M2",
      "slug": "consolidate-integration-helpers",
      "title": "Single-source helpers; integration.py under 500 lines",
      "deps": [
        "golden-findings-snapshot"
      ]
    },
    {
      "description": "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS. Symbol-level semantic exclusions only (check_if_meaningful in _base.py/.pyi, _semantic.py/.pyi, _OPTIONAL_IMPORT_PATTERNS): mark those symbols skipped, audit rest of those files normally (incl. TD-5). Inventory: .pyi fidelity/private symbols, @beartype + structural suppressions, trivial wrappers/duplicated logic (stream read/decode, make_tc), redundant fallbacks (astroid 3.x path), legacy stubs (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export), over-long comments (dispatch.py 500+ char), 500-line/R0912/R0915 proximity, structlog/error rules, rumdl tests/data-exclude hack (TD-11). Output: rows {module, section, evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint-ownership map (this audit is single owner). Runs after golden/assumptions/consolidate so it reads final state + beartype report.",
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
      "description": "Read-only audit of tests/**. Exclude semantic-owned TestSuppressionRerankerPipeline + semantic test modules (marked skipped). Per module: behaviors protected; duplicates (incl. golden-covered); CodingRules-Tests violations (first-party mocking, naming, markers, in-file fixtures, _factories.py list[Any] tables ~1400 lines, far cases); repo-self-lint tests for removal (test_self_lint_clean.py, AST/source-scanning guards, config re-checks — per broadened never-linting definition); slow/benchmark; task-ID names (test_t5_*, test_t9_7_*, test_t11_*, test_t1b_*, test_t3_*). Output: rows {module, behaviors, duplicate-of, recommendation keep|merge|rewrite|remove, surviving coverage, reason, owner} + per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit, baseline/autofix, configs/scopes: surviving test or blocking-debt flag). Runs after golden/assumptions/consolidate.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "replanAfter": true,
      "slug": "test-debloat-audit",
      "title": "Inventory redundant and lint-testing tests",
      "deps": [
        "golden-findings-snapshot",
        "third-party-assumption-tests",
        "consolidate-integration-helpers"
      ]
    }
  ],
  "assumptions": [
    {
      "assumption": "'Material lint/check behavior' = findings {tool,file,line,col,rule} pinned by golden (SEMANTIC=0) + checker unit tests; CLI flags/exit codes; baseline/autofix semantics; shipped configs/scopes. Other three limbs are pinned by surviving tests inventoried in M3 (CLI: tests/runner/test_cli_*; baseline/autofix: test_baseline_*/test_autofix_*; configs/scopes: overlay + config tests) — if a limb has no surviving test the audit flags blocking debt. Reranker accept/reject decisions are not material; heuristic rejections (empty, boilerplate, brush-off, rule-echo) are material.",
      "disposition": "confirm with human",
      "why": "Intent replaces the model yet demands preservation; this boundary makes 'preserve' mechanically testable per limb."
    },
    {
      "assumption": "The git-stored decision cache belongs to the repo being linted (python-setup itself and consumers alike), at .python-setup-decisions.json next to lint.baseline. Only decisions committed; weights (0.03-0.8 GB, own licenses) stay in the user model cache.",
      "why": "Decisions depend on project content and must reproduce in that project's CI without the model.",
      "disposition": "confirm with human"
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
      "why": "AST guards and config re-checks duplicate the gate and rot with rule churn; broadening the definition removes them with rationale.",
      "disposition": "confirm with human"
    },
    {
      "assumption": "Only semantic-decision-model starts now; runner/checkers/setup-testing-scripts spawn at iteration-2 replan from M3 audits. Semantic starts under the symbol-level sequencing protocol (AGENTS.md rebase, golden regen after M1, shared-file symbols, assumptions append-only).",
      "why": "Debloat follows safety net + assumptions; sequencing prevents concurrent edits to shared files."
    },
    {
      "assumption": "At least one model among GLiDE-0.4B and smaller Decision-Index models has compatible license, Python 3.14 CPU wheels and pinnable revision. Else the semantic epic escalates instead of shipping non-compliant.",
      "why": "GLiDE uses a custom community license, tested on 3.12; smaller candidates vary.",
      "disposition": "verify via semantic-decision-model spikes"
    }
  ],
  "epics": [
    {
      "intent": "# semantic-decision-model\n\nReplace the cross-encoder reranker behind suppression-justification with a CPU-friendly small decision model plus a git-stored self-cleaning decision cache. Preserve every material behavior. Child epic of `modernize`.\n\n## Scope (symbol-level; file-disjoint is false)\nOwned symbols/files: checkers/_semantic.py+.pyi and new private backend/cache modules (+.pyi each, @beartype, structlog kwargs, tach-clean); check_if_meaningful in checkers/_base.py+.pyi; _OPTIONAL_IMPORT_PATTERNS in no_try_import_checker.py; pyproject [semantic] extra + uv.lock + .gitignore semantic entries; docs (semantic-justification.md, custom-checks.md bullet, troubleshooting.md section, AGENTS.md pipeline section, CHANGELOG); tests: test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline, new decision/cache modules, tests/checkers/conftest.py, new runtime-assumption modules under tests/assumptions/.\nSequencing with root: AGENTS.md — epic owns pipeline section only, rebases after root M2 test-count edits; shared .py files — symbol ownership only, no whole-file transfer; tests/assumptions — root owns __init__ + 3 contract modules, epic appends runtime modules only; golden — root M1 creates, epic req5 regen only after M1 committed (ordered edge).\nOut of scope: other checkers/runner; tests/integration.py, tests/conftest.py (no edits); tests/data/** except the explicit minimal exception of golden regen under req5 (same change, ADR + diff review). Any runner touch (e.g. cache path to pylint) stays minimal + ADR.\n\n## Requirements\n1. Spikes before design: (a) fact-finder candidate matrix (GLiDE-0.4B + Decision-Index smalls): license (exclude non-commercial), params/size, runtime (torch+transformers vs onnxruntime+tokenizers) with py3.14 CPU wheels linux/mac/win, vendored/pinned custom code (never unpinned trust_remote_code), offline behavior. (b) poc CPU-only: cold-load, warm latency, accuracy on labeled corpus (repo's real justifications + today's brush-off/meaningful tables); bar: >=90% accuracy, >=95% precision on meaningless, >=85% recall on meaningful; choose smallest model/prompt/threshold meeting bar, record in ADR. (c) test-assumptions: pylint 4.x invocation semantics (jobs, per-tool processes, open()/close() timing, partial/staged runs); cache lock/merge/sweep design is conditional on this — if jobs>1 violates partial-run guarantee, constrain decision runs to jobs=1 (pinned by test) or per-worker sidecars.\n2. Decision contract: keep check_if_meaningful(text,*,rule,code_context,comment)->bool and PYTHON_SETUP_LINT_SEMANTIC ('0'=heuristic only, semantic never imported). Heuristic-first hard gate. semantic_check_if_meaningful keeps bool|None (None=unavailable, heuristic stands). Public DecisionBackend Protocol decide(justification,rule,context)->float in [0,1]; DECISION_THRESHOLD + PROMPT_VERSION='prompt-v1' constants; decision=prob>=threshold. Injection: semantic_... gains optional backend kwarg (public in .pyi); get_backend() honors test-only PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path (instance or zero-arg factory). No patching globals/imports, no private imports.\n3. Packaging: `semantic` extra ships chosen runtime (drop sentence-transformers). Without extra or on failure: heuristic + cache hits, one warning, sentinel (no retry storm). Weights in user model cache, never git. PYTHON_SETUP_LINT_DECISION_MODEL selects model@revision; PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore).\n4. Cache (.python-setup-decisions.json at linted root, definitive): JSON array sorted by (rule,justification,model), indent=2 sort_keys=True. Entry {justification normalized (strip+collapse ws, keep case), rule (joined codes), model ('<id> rev <short12> prompt-vN', no bare hex>=20), decision, files (sorted POSIX relpaths)}. Key (justification,rule,model); context is model input only. Hits need no model. Writes: lockfile (O_CREAT|O_EXCL retry 5s) + merge + atomic temp+move. Sweep scoped to linted files; drop empty-files + stale-model entries. Isolation: PYTHON_SETUP_LINT_DECISIONS_PATH (tests->tmp, never repo cache). Must pass all tools incl. detect-secrets.\n5. Real suppressed codes: extract all codes from disable=/noqa:/ignore[...] via existing patterns; normalize (strip, split comma), sort, join ','; pass joined string as rule (bare-except keeps single 'bare-except-comment'). Rule-echo rejects if primary (lower, stripped) equals any element (lower). Cache key uses joined rule. If any heuristic outcome on the sample changes, regen golden with PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 in same change (after M1), review diff, record behavior-change description (which justification classes flip) in CHANGELOG — not the raw diff.\n6. Tests: merge brush-off/meaningful/threshold tables into one parametrized table; backend via FakeBackend (direct kwarg for units, env-var for check_if_meaningful path); cache round-trip/cleanup/concurrency on tmp paths + hypothesis format round-trip; exactly one slow+with_real_api e2e; delete vacuous `is None or ...` assertions; modules <=500 lines, no suppressions; never test linting.\n7. Docs: update Scope list + CHANGELOG (user-visible only: extra contents, new/deprecated vars, cache file, behavior-change descriptions).\n\n## Acceptance\n- Heuristic path unchanged: SEMANTIC=0 sample lint equals golden.\n- Cache without model: no extra + cached false decision => W9704 emitted, no model load.\n- Brush-off never reaches model: 'pre-existing' + fake backend => False, backend uncalled.\n- One call per unique pair: miss + backend => exactly one call per unique (justification,rule), persisted sorted.\n- Scoped cleanup: suppression deleted from a.py => linting a.py removes entry; linting only b.py keeps it.\n- No retry storm: load fails => one attempt per process, heuristic results.\n- Gates: `uv run pytest -q`, `uv run pytest tests/integration.py -v`, `uv run lint` pass with empty lint.baseline.",
      "slug": "semantic-decision-model"
    }
  ],
  "techDebt": [
    {
      "category": "impacting",
      "description": "Suppression/bare-except checkers pass their own symbol as `rule`; the rule-echo heuristic and model never see the actually-suppressed codes.",
      "id": "TD-1",
      "resolution": "Semantic req5: extract all codes, pass comma-joined sorted string; echo matches any element; golden regen + CHANGELOG behavior description if outcomes shift."
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
      "resolution": "M1 pins exact findings; M2 single-sources 7 helpers, moves overlay/assertion blocks, reaches <=500 without suppression."
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
      "consequences": "Regression detection across all tools and checkers becomes exact and cheap; golden updates are explicit review points. Message text is not snapshotted. Tool upgrades via uv.lock may require reviewed regeneration. CI cannot silently rewrite the golden.",
      "context": "The modernization enforces coding rules, debloats code/tests, and swaps the semantic model while preserving every material behavior. lint.baseline is empty. The integration test only checks planted rule-name presence, so duplicates, moved lines and new false positives go undetected.",
      "decision": "Commit a normalized snapshot of every finding, Finding {tool, file, line, col, rule} (file/line/col nullable for __CRASH__), for tests/data/minimal_sample_project at tests/data/golden/minimal_sample_project_findings.json (outside the linted project). Produce it via a dedicated second run_lint capture (baseline=<tmp>/capture.json, overwrite_baseline=True) under PYTHON_SETUP_LINT_SEMANTIC=0 with make_runner_config semantics (package_name + rumdl override); the first run keeps its rc!=0 assertion and the capture asserts len(records)!=0. Normalize test-side: drop msg, project-relative POSIX via as_posix(), sort by 5-tuple. Diff via Counter multiset on 5-tuples with sorted added/removed output. Golden must contain zero __CRASH__; any crash fails. violations.txt is retained as the planted-rule oracle (coverage = every oracle rule in golden). Regenerate only with PYTHON_SETUP_LINT_UPDATE_GOLDEN=1 (fails loudly under CI/GITHUB_ACTIONS, warns otherwise), byte-identical across two runs. No field exclusion that drops an oracle rule without an ADR; src parser fixes are deferred as blocking debt.",
      "id": "ADR-001",
      "title": "Golden findings snapshot as the behavior-preservation contract"
    },
    {
      "consequences": "Brush-off rejections are guaranteed regardless of model; model can only tighten acceptance. sentence-transformers is dropped; no-try-import patterns list the new runtime. Real-model coverage is one slow + with_real_api test. Old env var warns via CHANGELOG-documented deprecation.",
      "context": "_semantic.py misuses a sentence-transformers cross-encoder as a quality judge. The dependency is heavy and absent in dev/CI, so the heuristic decides everything today. The intent asks for a CPU-friendly small decision model.",
      "decision": "Keep check_if_meaningful signature and PYTHON_SETUP_LINT_SEMANTIC. Heuristic runs first as a hard gate; rejections never reach the model. Accepted text goes to cache, then to a local decision model behind a public DecisionBackend Protocol decide(justification, rule, context) -> float P(meaningful) in [0,1]; decision = prob >= DECISION_THRESHOLD with PROMPT_VERSION='prompt-v1'. Injection without patching: semantic_check_if_meaningful gains optional backend kwarg (public in .pyi), and get_backend() honors test-only PYTHON_SETUP_LINT_DECISION_BACKEND=dotted.path. Model/prompt/threshold chosen by spike under compatible license, Python 3.14 CPU wheels, pinned revision, no unpinned remote code, meeting bar: >=90% accuracy, >=95% precision on meaningless, >=85% recall on meaningful. Ships via `semantic` extra, configured by PYTHON_SETUP_LINT_DECISION_MODEL; PYTHON_SETUP_LINT_RERANKER_MODEL deprecated (warn + ignore). Backend unavailable returns None; heuristic stands.",
      "id": "ADR-002",
      "title": "Heuristic-gated local decision model for justification checks"
    },
    {
      "consequences": "W9704 reproducible across machines without the extra; decision changes are reviewable diffs. Small line-local merge conflicts possible. Consumer repos gain one committed file (install docs mention it); the file must pass all tools and not trip detect-secrets.",
      "context": "Results cached in gitignored ~/.cache per-machine file, unbounded, keyed by 64-bit truncated SHA-256 including code context. Outcomes diverge across machines; stale entries never removed. Intent requires git-stored cache with cleanup.",
      "decision": "Store decisions in committed .python-setup-decisions.json at the linted project root (definitive, next to lint.baseline). Format: JSON array sorted by (rule, justification, model), indent=2, sort_keys=True. Entry {justification (normalized: strip + collapse whitespace, preserve case), rule (comma-joined sorted codes), model ('<id> rev <short12> prompt-vN', no bare hex >=20 chars), decision: bool, files: sorted POSIX relpaths}. Key is (justification, rule, model); context is model input only. Reads need no model. Writes: lockfile + merge-on-write + atomic temp+move (baseline pattern). Cleanup: mark-and-sweep scoped to linted files + drop empty-files and stale-model entries. Isolation via PYTHON_SETUP_LINT_DECISIONS_PATH. Lock/merge/sweep confirmed by pylint-semantics spike; if jobs>1 violates partial-run guarantee, constrain to jobs=1 (pinned by test) or per-worker sidecars — chosen in ADR. Weights stay in user model cache.",
      "id": "ADR-003",
      "title": "Git-stored, self-cleaning decision cache"
    },
    {
      "consequences": "Shared test infra never edited concurrently; debloat runs behind golden + assumptions. Source and its tests stay together per subsystem. Subsystem epics start one iteration later but scoped from evidence. Symbol-level sharing needs review discipline on 4 files.",
      "context": "Three workstreams span ~28.6k LOC. Parallel edits to shared test infra would conflict. Intent requires test infra/assumptions before debloat. The semantic epic is not file-disjoint (AGENTS.md, _base.py, no_try_import_checker.py, one test class, tests/assumptions, golden dir), so whole-file disjointness is false.",
      "decision": "Iteration 1: root delivers golden safety net, test-infra consolidation, third-party assumption tests, plus read-only audits, and spawns semantic-decision-model now under a symbol-level sequencing protocol: (a) AGENTS.md — root M2 owns test-count lines, epic owns pipeline section, epic rebases after M2; (b) golden — root M1 creates the file, epic req5 regen only after M1 committed; (c) shared .py files — symbol-level ownership, rest of file stays auditable; (d) tests/assumptions — root owns __init__ + 3 contract modules, epic only adds runtime modules; (e) golden regen is the epic's sole tests/data exception with ADR + diff review. Iteration 2 (replan): spawn runner, checkers, setup-testing-scripts epics with disjoint ownership from the audits. Policy: pytest never asserts this repo passes its own lint gates (no subprocess re-lint, no AST re-implementation, no config re-checks); `uv run lint` does that.",
      "id": "ADR-004",
      "title": "Progressive saga decomposition with symbol-level sequencing"
    }
  ]
}

## Plan Review Feedback
{
  "status": "changes_requested",
  "summary": "changes_requested: 12 fix block (env mismatch, None-sort crash, crash gap, missing M2 owner, config side-effect, U3 unisolated, vague contracts, overconstrained scenario, audit artifact race, serialization gap, cross-epic edges, weak oracle) + 3 human-awareness",
  "suggestions": [
    {
      "id": "golden-env-var-mismatch",
      "disposition": "fix",
      "summary": "M1 regen env var disagrees: UPDATE_GOLDEN vs PYTHON_SETUP_LINT_UPDATE_GOLDEN",
      "detail": "M1 directionalInterfaces says UPDATE_GOLDEN=1 warns+rewrites; golden-findings-snapshot item and semantic req5 say PYTHON_SETUP_LINT_UPDATE_GOLDEN=1. SEMANTIC=0 shorthand vs real PYTHON_SETUP_LINT_SEMANTIC also ambiguous. Unify to single fully-qualified name in interface, item, epic, and assert_matches_golden contract; specify CI/GITHUB_ACTIONS fail message/mechanism.",
      "location": {
        "file": "tests/integration.py",
        "line": 111
      }
    },
    {
      "id": "golden-sort-none-unsafe",
      "disposition": "fix",
      "summary": "Sort/Counter on nullable Finding will TypeError without None-safe key",
      "detail": "Finding has file/line/col nullable for __CRASH__. Interface says sort by 5-tuple and sorted added/removed, but naive sorted() on None vs str/int raises. Baseline already solves via _violation_sort_key mapping None file->('',) line/col->(-1,) (baseline.py:55-57). Specify None-safe key (reuse/mirror) for collect_findings sort and assert_matches_golden diff output.",
      "location": {
        "file": "src/python_setup_lint/runner/baseline.py",
        "line": 48
      }
    },
    {
      "id": "crash-coverage-false",
      "disposition": "fix",
      "summary": "Golden cannot pin crashes/skips as claimed; positive-exit failures silent",
      "detail": "_capture_one emits __CRASH__ only for exit_code<0 (baseline.py:133); _print_result marks [CRASH] only for exit<0 (output.py:249). Tool traceback/config error exiting 1/2 yields zero records, no crash. Tools with zero sample findings can be skipped without golden diff. M1 says replace substring loop; M2 says moved blocks to unspecified owner. Explicitly retain tool-section/SKIPPED/[CRASH]/W9705 assertions and define how skips surface.",
      "location": {
        "file": "src/python_setup_lint/runner/baseline.py",
        "line": 133
      }
    },
    {
      "id": "m2-moved-blocks-no-owner",
      "disposition": "fix",
      "summary": "M2 line budget moves overlay/assertion blocks to nowhere",
      "detail": "consolidate-integration-helpers budgets <=500 via moved overlay scaffolding ~30-40 (test_config_overlay pylintrc rewrite) + moved assertion blocks ~25-30, but directionalInterfaces define only 7 helpers in tests/_project_helpers.py. No destination module, function signatures, or caller contract. Define owning module + signatures or keep blocks in integration.py and re-budget.",
      "location": {
        "file": "tests/integration.py",
        "line": 168
      }
    },
    {
      "id": "m1-config-side-effect-contract",
      "disposition": "fix",
      "summary": "make_runner_config/_make_config side effect and collect_findings signature underspecified",
      "detail": "M1 scenario cites make_runner_config semantics but M1 uses _make_config (M2 extracts). _make_config writes project/rumdl.toml via brittle content.replace('\"tests/data\", ','') (integration.py:90-97), idempotency/overwrite/failure unspecified. collect_findings(project,tmp) omits who builds config, who git-inits/copies, how SEMANTIC=0 set (monkeypatch?), tmp creation, len!=0 owner; assert_matches_golden(findings,golden) omits Path-vs-list and rewrite side effect owner.",
      "location": {
        "file": "tests/integration.py",
        "line": 83
      }
    },
    {
      "id": "u3-needs-spike-or-src-allowance",
      "disposition": "fix",
      "summary": "U3 determinism risk inside story that forbids the src fix it may need",
      "detail": "U3 lists duplicate-code ordering, detect-secrets over ls-files, pyright/mypy churn, absolute leakage. SpikeOutline is inside golden-findings-snapshot with test-side normalization only, No src/ changes, src fixes deferred as blocking debt. If capture-twice diff fails, story cannot pass while deferring, blocking M2/M3 via deps. Add pre-story spike or allow bounded src parser/baseline fixes in-story.",
      "location": {
        "file": "src/python_setup_lint/runner/baseline.py",
        "line": 161
      }
    },
    {
      "id": "third-party-contracts-vague",
      "disposition": "fix",
      "summary": "Assumption contracts over-pin, miscategorize, and leave beartype unknown",
      "detail": "Module.stream()->bytes too strict: product tolerates bytes|str (suppression_justification_checker.py:59 raw.decode if bytes). register(linter) is first-party; true third-party contract is PyLinter.register_checker/BaseChecker lifecycle. MessageDefinitionTuple shape, CheckerTestCase/UnittestLinter capture, nodes_of_class tuple, Const/JoinedStr attrs lack expected values. Beartype TYPE_CHECKING behavior VERIFIED during item = unknown, belongs in spike. Also tests/__init__.py already exists; should be tests/assumptions/__init__.py.",
      "location": {
        "file": "src/python_setup_lint/checkers/conformance/suppression_justification_checker.py",
        "line": 50
      }
    },
    {
      "id": "m2-helpers-scenario-overconstrained",
      "disposition": "fix",
      "summary": "Shared-helpers scenario requires impossible imports and races AGENTS.md counts",
      "detail": "Scenario requires each of 7 helpers imported by integration.py, conftest.py and _autofix_helpers.py, but conftest only needs shipped_config_paths (conftest.py:170), _autofix_helpers needs only git helpers (own _git_init/_stage/_commit_all with different identity/-q). Correct impl fails scenario. Also consolidate updates AGENTS.md counts while third-party-assumption-tests runs parallel (no dep) adding tests; counts race. Scope imports per-consumer and add dep or single AGENTS.md owner.",
      "location": {
        "file": "tests/conftest.py",
        "line": 170
      }
    },
    {
      "id": "m3-audit-artifact-ownership",
      "disposition": "fix",
      "summary": "Audits emit no durable artifact, race semantic epic, exclusions inconsistent",
      "detail": "Row schemas as item-report tables (no committed file) rot when semantic epic concurrently creates backend/cache modules and rewrites test_semantic_check.py (506 lines + suppression), test_semantic_threshold.py, tests/checkers/conftest.py (absent per glob), pyproject/docs. Unified map owned solely by coding-rules-audit but both audits parallel with no inter-dep. Interface excludes only TestSuppressionRerankerPipeline + runtime modules, omitting epic-owned semantic test files; item says exclude semantic test modules. Iteration-2 disjoint-ownership scenario not falsifiable in iter1.",
      "location": {
        "file": "tests/checkers/test_semantic_check.py",
        "line": 1
      }
    },
    {
      "id": "golden-serialization-determinism",
      "disposition": "fix",
      "summary": "Golden JSON format, POSIX steps, drift injection, and tool-qualified lookups missing",
      "detail": "Interface says sorted JSON array but omits indent/sort_keys/newline (baseline writer uses indent=2 sort_keys=True), POSIX steps (strip ./, Windows \\, already-relative), and no-absolutes/timestamps/msgs assertion. Drift scenario lacks injection method. Brush-off mod.py:49 HAS vs carry mod.py:56 NONE lookups omit tool (pylint vs pylint-pyi vs pylint tests may duplicate same line), so equality+lookup ambiguous.",
      "location": {
        "file": "tests/data/minimal_sample_project/src/minimal_sample/mod.py",
        "line": 49
      }
    },
    {
      "id": "cross-epic-ordering-unenforced",
      "disposition": "fix",
      "summary": "Semantic-vs-root file sharing relies on prose ordering, not edges",
      "detail": "ADR-004 orders epic AGENTS.md pipeline-section rebase after root M2 counts edit and epic req5 golden regen after M1, but no machine-checkable deps enforce it; concurrent edits to AGENTS.md, _base.py/_semantic.py symbols, tests/assumptions, golden dir risk conflicts/stale audits. Epic out-of-scope bans tests/integration.py/conftest.py edits but allows golden regen exception. Add explicit ordered edges or serialize; clarify ADR-003 self-reference (lock/merge/sweep chosen in ADR).",
      "location": {
        "file": "AGENTS.md",
        "line": 79
      }
    },
    {
      "id": "oracle-coverage-weak",
      "disposition": "fix",
      "summary": "violations.txt oracle pins only subset; other tools unguarded on regen",
      "detail": "violations.txt holds pylint custom + MD072 + duplicate-code only, not ruff/mypy/pyright/ty/yamllint/tach/detect-secrets. Every-oracle-rule-in-golden does not prevent silent drop of other tools on blind regen. Root M1 regen warns only (no diff-review requirement unlike epic req5). Add per-tool minimum-count or explicit tool coverage and require reviewed diff for regen.",
      "location": {
        "file": "tests/data/minimal_sample_project/violations.txt",
        "line": 1
      }
    },
    {
      "id": "human-material-definition",
      "disposition": "human-awareness",
      "summary": "Material-behavior boundary (golden + surviving tests, reranker excluded) needs operator visibility",
      "detail": "Assumption defines material as findings {tool,file,line,col,rule} SEMANTIC=0 + checker units + CLI/exit + baseline/autofix + configs/scopes; model accept/reject non-material, heuristic rejections material. Makes preserve testable but narrows intent. Architect can proceed for iter1; record for operator review.",
      "location": {
        "file": "src/python_setup_lint/checkers/_base.py",
        "line": 142
      }
    },
    {
      "id": "human-cache-location",
      "disposition": "human-awareness",
      "summary": "Committed .python-setup-decisions.json next to baseline impacts consumers",
      "detail": "Assumption + ADR-003 place git-stored cache at linted root for python-setup and consumers; weights stay in user cache. Adds one committed file per consumer, reviewable diffs, possible line-local merges, must pass detect-secrets. Architect can proceed; operator should be aware before epic implements.",
      "location": {
        "file": "src/python_setup_lint/checkers/_semantic.py",
        "line": 37
      }
    },
    {
      "id": "human-never-lint-broadening",
      "disposition": "human-awareness",
      "summary": "Broadened never-test-linting removes self-lint/AST/config tests",
      "detail": "Assumption expands never-test-linting to ban subprocess re-lint, AST/source re-implementation, and config-consistency re-checks (e.g. test_self_lint_clean.py slow gate, guards, config re-checks). M3 lists for removal, iter2 removes. Rationale (rot with rule churn) reasonable but deletes coverage; operator visibility warranted.",
      "location": {
        "file": "tests/runner/test_self_lint_clean.py",
        "line": 20
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
