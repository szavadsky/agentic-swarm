# Step: Architect Consult (Item)

## Goal
Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.

## Rules
- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — `modernize`

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
`). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.

## Item
consolidate-integration-helpers-v3

## Assignment
{"slug":"consolidate-integration-helpers-v3","kind":"test-only","title":"Single-source helpers; integration.py under 500 lines","assignment":"Single-source test project helpers per replaced outline (test-only enforcement). Create tests/_project_helpers.py as sole definition site for 10 helpers: copy_sample_project, git_init_and_stage (git init + config user test/test@test + `git add .`, integration/detect-secrets semantics), git_init_bare (init -q + config Test/test@example.com, no add, autofix semantics — identities NOT unified), stage_file, commit_all, shipped_config_paths, make_runner_config (package_name + rumdl override, preserving _make_config side-effect contract: writes/overwrites <project>/rumdl.toml derived from config/rumdl.toml with '\"tests/data\", ' removed, idempotent same-bytes, no-op when shipped rumdl.toml missing, OSError propagates), build_pylint_overlay_config(project, disable_rule)->Path, ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project, monkeypatch)->None. Delete duplicate defs in tests/conftest.py and tests/_autofix_helpers.py and import instead. Update tests/integration.py to import only its mapped subset {copy_sample_project, git_init_and_stage, make_runner_config, build_pylint_overlay_config, ensure_precommit_or_skip, install_twice_assert_idempotent}; conftest.py imports only {shipped_config_paths}; _autofix_helpers.py imports only {git_init_bare, stage_file, commit_all}. Switch test_self_lint_clean.py and autofix tests to new imports. Move overlay/setup/precommit scaffolding per line budget to remove >=127 lines, target <=490, hard gate <=500 with no suppression: helpers ~58 + oracle reader ~8 + overlay rewrite ~21 + setup scaffolding ~20 + precommit scaffolding ~25 + M1 loop/lookup net ~5 + section-slice ~3 + import/docstring trim ~4. Keep tests/integration.py path/class/function names unchanged; golden+counts byte-identical. FORBIDDEN: MUST NOT touch AGENTS.md, docs/**, or src/** — engine enforces test-only. Leave AGENTS.md counts (1290 pass/13 tools) and cli.py help stale by design; docs-counts-sync follow-up owns them. Reads merged state from golden-snapshot-wiring + third-party-assumption-tests. Runs captures only via integration on temp copies, never bare `uv run lint` on repo (ruff-format write hazard). Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest -q` pass; tests/integration.py <=500 lines no suppression; golden+counts byte-identical (diff before/after); each helper defined exactly once; no new lint violations in touched files (pre-existing SIM102/R0914/C0208 persist, baseline-relative).","outlineRef":"consolidate-integration-helpers","milestone":"M2","wave":11,"deps":["golden-snapshot-wiring","third-party-assumption-tests"],"scenarioRefs":["Shared helpers exist once","Integration gate module within limits"],"citations":["tests/integration.py","tests/conftest.py","tests/_autofix_helpers.py","tests/_project_helpers.py","tests/_golden.py","tests/data/golden/minimal_sample_project_findings.json"]}

## Prior Attempts & Failures
2 attempts recorded for develop (all rejected); next would be 3 > max 2

Failing checks:
[tests-only] Changes outside test paths found: lint.baseline

## Current Diff
.factory/tasks/modernize/items/consolidate-integration-helpers-v3/steps/001-develop-r1-a1/checks.yaml +204/-0
.factory/tasks/modernize/items/consolidate-integration-helpers-v3/steps/001-develop-r1-a1/input.md +71/-0
.factory/tasks/modernize/items/consolidate-integration-helpers-v3/steps/001-develop-r1-a1/meta.yaml +19/-0
.factory/tasks/modernize/items/consolidate-integration-helpers-v3/steps/001-develop-r1-a1/output.yaml +59/-0
.factory/tasks/modernize/items/consolidate-integration-helpers-v3/steps/002-develop-r1-a2/checks.yaml +191/-0
.factory/tasks/modernize/items/consolidate-integration-helpers-v3/steps/002-develop-r1-a2/input.md +122/-0
.factory/tasks/modernize/items/consolidate-integration-helpers-v3/steps/002-develop-r1-a2/meta.yaml +19/-0
.factory/tasks/modernize/items/consolidate-integration-helpers-v3/steps/002-develop-r1-a2/output.yaml +64/-0
lint.baseline +18/-1
tests/_golden.py +11/-0
tests/_project_helpers.py +210/-0
tests/conftest.py +1/-15
tests/integration.py +43/-218
tests/runner/_autofix_helpers.py +10/-32
tests/runner/_factories_extras.py +3/-3
tests/runner/test_autofix_conflict.py +12/-12
tests/runner/test_autofix_conflict_apply.py +12/-12
tests/runner/test_autofix_conflict_integration.py +11/-11
tests/runner/test_lint_runner.py +3/-2
tests/runner/test_lint_runner_stats.py +2/-1
tests/runner/test_pyright_noise_filter.py +1/-1
tests/runner/test_self_lint_clean.py +1/-1
tests/runner/test_t3_coverage.py +3/-2

## Review Feedback
Failing check: tests-only

Message: Changes outside test paths found: lint.baseline

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
