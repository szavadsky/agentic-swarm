# Step: PM Amend

## Goal
Yield ONLY the NEW items for this plan amendment (`edits-{N}.{k}.yaml` delta). The engine merges your delta into active execution.

## Rules
- Delta ONLY: yield NEW items and nothing else. NEVER re-emit existing items — re-emitted slugs are dropped deterministically and an empty delta discards the amendment.
- Yield only: you have NO file tools. Everything you need is below (`{
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
      "deps": [
        "golden-snapshot-wiring",
        "third-party-assumption-tests"
      ],
      "description": "Extract into tests/_project_helpers.py: copy_sample_project, git_init_and_stage (init+config user test/test@test + `git add .`, integration/detect-secrets semantics), git_init_bare (init -q + config Test/test@example.com, no add, autofix semantics — identities NOT unified), stage_file, commit_all, shipped_config_paths, make_runner_config (package_name + rumdl override, preserving _make_config side-effect contract incl. idempotent overwrite and no-op when shipped rumdl missing), build_pylint_overlay_config(project, disable_rule)->Path, ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project, monkeypatch)->None. Delete duplicate defs in conftest.py and _autofix_helpers.py (import instead); integration.py imports only what it uses; test_self_lint_clean.py and autofix tests switch imports. Per-consumer map: integration->{copy, git_init_and_stage, make_runner_config, build_overlay, ensure_precommit, install_twice}; conftest->{shipped_config_paths} only; _autofix->{git_init_bare, stage_file, commit_all} only. Line budget (must remove >=127, target <=490): helpers ~58 + oracle reader ~8 + overlay rewrite ~21 + setup scaffolding (fake _run_uv/install-twice) ~20 + precommit scaffolding (probe + validate/config blocks) ~25 + M1 loop/lookup net ~5 + section-slice ~3 + import/docstring trim ~4. integration.py keeps path/class/function names; golden+counts byte-identical; sole AGENTS.md counts owner (update counts incl. new assumption tests). Acceptance: integration, `pytest -q`, `lint` pass.",
      "kind": "story",
      "milestoneId": "M2",
      "slug": "consolidate-integration-helpers",
      "title": "Single-source helpers; integration.py under 500 lines"
    },
    {
      "deps": [
        "golden-snapshot-wiring",
        "third-party-assumption-tests",
        "consolidate-integration-helpers"
      ],
      "description": "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS. Semantic exclusions are symbol/file-level (mark skipped, audit rest normally): checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache modules (+.pyi), _base.py::check_if_meaningful (+stub section), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi fidelity/private symbols, @beartype + structural suppressions, trivial wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export), over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules, rumdl tests/data-exclude hack (TD-11). Output: rows {module, section, evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint-ownership map (this audit is single owner; test-debloat-audit consumes it via inter-dep). Reads final state (post-golden/assumptions/consolidate) + beartype report.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "replanAfter": true,
      "slug": "coding-rules-audit",
      "title": "Inventory CodingRules violations"
    },
    {
      "deps": [
        "golden-snapshot-wiring",
        "third-party-assumption-tests",
        "consolidate-integration-helpers",
        "coding-rules-audit"
      ],
      "description": "Read-only audit of tests/**. Semantic exclusions (mark skipped): tests/checkers/test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline class, tests/checkers/conftest.py (epic-created), tests/assumptions runtime/decision/cache modules (epic-created). Per module: behaviors protected; duplicates (incl. golden-covered); CodingRules-Tests violations (first-party mocking, naming, markers, in-file fixtures, _factories.py list[Any] tables, far cases); repo-self-lint tests for removal (test_self_lint_clean.py, AST/source-scanning guards, config re-checks); slow/benchmark; task-ID names. Output: rows {module, behaviors, duplicate-of, recommendation keep|merge|rewrite|remove, surviving coverage, reason, owner} + per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit, baseline/autofix, configs/scopes: surviving test or blocking-debt flag). Owner column aligned to coding-rules-audit's unified map (read via inter-dep).",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "replanAfter": true,
      "slug": "test-debloat-audit",
      "title": "Inventory redundant and lint-testing tests"
    },
    {
      "deps": [
        "golden-determinism-probe"
      ],
      "description": "Create tests/_golden.py as SOLE golden owner (no pipeline run in this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN, SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe (tool, file or '', line if int else -1, col if int else -1, rule) mirroring _violation_sort_key; normalize_record (drop msg, relativize vs project, strip ./, backslash->/, as_posix, assert non-absolute); serialize via json.dump(indent=2, sort_keys=True) + trailing newline; assert_matches_golden (Counter multiset diff, sorted added/removed; UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if CI/GITHUB_ACTIONS else warn + rewrite golden+counts together); read_oracle_rules, slice_tool_section, assert_oracle_coverage, assert_tool_coverage. Add tests/test_golden.py (synthetic Finding lists ONLY, no run_lint, no pipeline): finding_key None vs str/int ordering, POSIX normalization, multiset diff exact added/removed, CI-guard fail, coverage asserts, serialization byte-format. Acceptance: `uv run pytest tests/test_golden.py -q` passes; module <=500 lines, formatted. Consumes probe normalization spec; no src/ changes; no golden files yet.",
      "kind": "story",
      "milestoneId": "M1",
      "slug": "golden-helpers-unit",
      "title": "Golden helpers module with synthetic unit tests"
    },
    {
      "deps": [
        "golden-determinism-probe",
        "golden-helpers-unit"
      ],
      "description": "Using tests/_golden.py from golden-helpers-unit and the probe report verdict. (1) Commit tests/data/golden/minimal_sample_project_findings.json + ..._tool_counts.json via the helper serialization, outside sample dir, never copied/linted; violations.txt RETAINED as oracle. (2) Edit tests/integration.py test_setup_new_and_lint only: keep first run (no baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions; add dedicated second capture (caller owns tmp, copy, git-init, _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling collect_findings; replace substring loop with golden equality + oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint, mod.py:49 present / :56 absent); drift injection on in-memory copies only. Run captures on temp copies only, never bare `uv run lint` on the repo (ruff-format write hazard). Bounded src allowance ONLY if probe proved test-side insufficient: runner/baseline.py relativize/sort + runner/parsers.py|_record_parsers.py ordering, <=40 added lines, determinism-only (no finding added/removed), reviewed diff in report. Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest tests/test_golden.py -q` pass; regen twice byte-identical; golden+counts byte-stable.",
      "kind": "dev",
      "milestoneId": "M1",
      "slug": "golden-snapshot-wiring",
      "title": "Commit golden files and wire integration capture"
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
}`, `iteration: 1
amendments: 2
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
  - awareness-plan-1-never-linting-policy-needs-awareness ref=plan-1 disposition=human-awareness: Policy 'pytest never asserts lint-clean; lint gate does' removes self-lint guard running all 13 tools on repo. Trades pytest redundancy for gate reliance. Architect decides now; operator should know pytest -q alone will no longer catch self-lint regressions.`, `Wave 3 merged nothing because consolidate-integration-helpers, coding-rules-audit, and test-debloat-audit still depend on superseded golden-findings-snapshot (amendment 1 added golden-helpers-unit + golden-snapshot-wiring outlines but the prose dep-rewire was not applied). Replace those three pending outlines with identical content except dep golden-findings-snapshot -> golden-snapshot-wiring. Do not touch merged items (probe, assumption-tests) or the already-added split outlines. U3 prose reference update optional.`, `Wave 3 completed. Merged items: `). NEVER reference files you cannot see.
- Structure ONLY architect-provided outlines: every item's `outlineRef` MUST name an outline slug from `{
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
      "deps": [
        "golden-snapshot-wiring",
        "third-party-assumption-tests"
      ],
      "description": "Extract into tests/_project_helpers.py: copy_sample_project, git_init_and_stage (init+config user test/test@test + `git add .`, integration/detect-secrets semantics), git_init_bare (init -q + config Test/test@example.com, no add, autofix semantics — identities NOT unified), stage_file, commit_all, shipped_config_paths, make_runner_config (package_name + rumdl override, preserving _make_config side-effect contract incl. idempotent overwrite and no-op when shipped rumdl missing), build_pylint_overlay_config(project, disable_rule)->Path, ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project, monkeypatch)->None. Delete duplicate defs in conftest.py and _autofix_helpers.py (import instead); integration.py imports only what it uses; test_self_lint_clean.py and autofix tests switch imports. Per-consumer map: integration->{copy, git_init_and_stage, make_runner_config, build_overlay, ensure_precommit, install_twice}; conftest->{shipped_config_paths} only; _autofix->{git_init_bare, stage_file, commit_all} only. Line budget (must remove >=127, target <=490): helpers ~58 + oracle reader ~8 + overlay rewrite ~21 + setup scaffolding (fake _run_uv/install-twice) ~20 + precommit scaffolding (probe + validate/config blocks) ~25 + M1 loop/lookup net ~5 + section-slice ~3 + import/docstring trim ~4. integration.py keeps path/class/function names; golden+counts byte-identical; sole AGENTS.md counts owner (update counts incl. new assumption tests). Acceptance: integration, `pytest -q`, `lint` pass.",
      "kind": "story",
      "milestoneId": "M2",
      "slug": "consolidate-integration-helpers",
      "title": "Single-source helpers; integration.py under 500 lines"
    },
    {
      "deps": [
        "golden-snapshot-wiring",
        "third-party-assumption-tests",
        "consolidate-integration-helpers"
      ],
      "description": "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS. Semantic exclusions are symbol/file-level (mark skipped, audit rest normally): checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache modules (+.pyi), _base.py::check_if_meaningful (+stub section), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi fidelity/private symbols, @beartype + structural suppressions, trivial wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export), over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules, rumdl tests/data-exclude hack (TD-11). Output: rows {module, section, evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint-ownership map (this audit is single owner; test-debloat-audit consumes it via inter-dep). Reads final state (post-golden/assumptions/consolidate) + beartype report.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "replanAfter": true,
      "slug": "coding-rules-audit",
      "title": "Inventory CodingRules violations"
    },
    {
      "deps": [
        "golden-snapshot-wiring",
        "third-party-assumption-tests",
        "consolidate-integration-helpers",
        "coding-rules-audit"
      ],
      "description": "Read-only audit of tests/**. Semantic exclusions (mark skipped): tests/checkers/test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline class, tests/checkers/conftest.py (epic-created), tests/assumptions runtime/decision/cache modules (epic-created). Per module: behaviors protected; duplicates (incl. golden-covered); CodingRules-Tests violations (first-party mocking, naming, markers, in-file fixtures, _factories.py list[Any] tables, far cases); repo-self-lint tests for removal (test_self_lint_clean.py, AST/source-scanning guards, config re-checks); slow/benchmark; task-ID names. Output: rows {module, behaviors, duplicate-of, recommendation keep|merge|rewrite|remove, surviving coverage, reason, owner} + per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit, baseline/autofix, configs/scopes: surviving test or blocking-debt flag). Owner column aligned to coding-rules-audit's unified map (read via inter-dep).",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "replanAfter": true,
      "slug": "test-debloat-audit",
      "title": "Inventory redundant and lint-testing tests"
    },
    {
      "deps": [
        "golden-determinism-probe"
      ],
      "description": "Create tests/_golden.py as SOLE golden owner (no pipeline run in this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN, SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe (tool, file or '', line if int else -1, col if int else -1, rule) mirroring _violation_sort_key; normalize_record (drop msg, relativize vs project, strip ./, backslash->/, as_posix, assert non-absolute); serialize via json.dump(indent=2, sort_keys=True) + trailing newline; assert_matches_golden (Counter multiset diff, sorted added/removed; UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if CI/GITHUB_ACTIONS else warn + rewrite golden+counts together); read_oracle_rules, slice_tool_section, assert_oracle_coverage, assert_tool_coverage. Add tests/test_golden.py (synthetic Finding lists ONLY, no run_lint, no pipeline): finding_key None vs str/int ordering, POSIX normalization, multiset diff exact added/removed, CI-guard fail, coverage asserts, serialization byte-format. Acceptance: `uv run pytest tests/test_golden.py -q` passes; module <=500 lines, formatted. Consumes probe normalization spec; no src/ changes; no golden files yet.",
      "kind": "story",
      "milestoneId": "M1",
      "slug": "golden-helpers-unit",
      "title": "Golden helpers module with synthetic unit tests"
    },
    {
      "deps": [
        "golden-determinism-probe",
        "golden-helpers-unit"
      ],
      "description": "Using tests/_golden.py from golden-helpers-unit and the probe report verdict. (1) Commit tests/data/golden/minimal_sample_project_findings.json + ..._tool_counts.json via the helper serialization, outside sample dir, never copied/linted; violations.txt RETAINED as oracle. (2) Edit tests/integration.py test_setup_new_and_lint only: keep first run (no baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions; add dedicated second capture (caller owns tmp, copy, git-init, _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling collect_findings; replace substring loop with golden equality + oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint, mod.py:49 present / :56 absent); drift injection on in-memory copies only. Run captures on temp copies only, never bare `uv run lint` on the repo (ruff-format write hazard). Bounded src allowance ONLY if probe proved test-side insufficient: runner/baseline.py relativize/sort + runner/parsers.py|_record_parsers.py ordering, <=40 added lines, determinism-only (no finding added/removed), reviewed diff in report. Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest tests/test_golden.py -q` pass; regen twice byte-identical; golden+counts byte-stable.",
      "kind": "dev",
      "milestoneId": "M1",
      "slug": "golden-snapshot-wiring",
      "title": "Commit golden files and wire integration capture"
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
}` (which already includes the amendment's new outlines). NEVER invent outlineRefs — an unknown `outlineRef` fails validation.
- Protect history: DO NOT alter, reschedule, or remove items in waves that have already executed or merged. Removal of pending items is handled by the engine via the architect's `removeItemSlugs`, not by your output.
- Dependency integrity: ensure all new dependencies reference either completed items from earlier waves or earlier items in the amended plan. Wave ordering stays strict (deps only on earlier waves).
- Output: yield the delta edits artifact matching `plan-edits.schema.json`.

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
      "deps": [
        "golden-snapshot-wiring",
        "third-party-assumption-tests"
      ],
      "description": "Extract into tests/_project_helpers.py: copy_sample_project, git_init_and_stage (init+config user test/test@test + `git add .`, integration/detect-secrets semantics), git_init_bare (init -q + config Test/test@example.com, no add, autofix semantics — identities NOT unified), stage_file, commit_all, shipped_config_paths, make_runner_config (package_name + rumdl override, preserving _make_config side-effect contract incl. idempotent overwrite and no-op when shipped rumdl missing), build_pylint_overlay_config(project, disable_rule)->Path, ensure_precommit_or_skip()->None, install_twice_assert_idempotent(project, monkeypatch)->None. Delete duplicate defs in conftest.py and _autofix_helpers.py (import instead); integration.py imports only what it uses; test_self_lint_clean.py and autofix tests switch imports. Per-consumer map: integration->{copy, git_init_and_stage, make_runner_config, build_overlay, ensure_precommit, install_twice}; conftest->{shipped_config_paths} only; _autofix->{git_init_bare, stage_file, commit_all} only. Line budget (must remove >=127, target <=490): helpers ~58 + oracle reader ~8 + overlay rewrite ~21 + setup scaffolding (fake _run_uv/install-twice) ~20 + precommit scaffolding (probe + validate/config blocks) ~25 + M1 loop/lookup net ~5 + section-slice ~3 + import/docstring trim ~4. integration.py keeps path/class/function names; golden+counts byte-identical; sole AGENTS.md counts owner (update counts incl. new assumption tests). Acceptance: integration, `pytest -q`, `lint` pass.",
      "kind": "story",
      "milestoneId": "M2",
      "slug": "consolidate-integration-helpers",
      "title": "Single-source helpers; integration.py under 500 lines"
    },
    {
      "deps": [
        "golden-snapshot-wiring",
        "third-party-assumption-tests",
        "consolidate-integration-helpers"
      ],
      "description": "Read-only audit of src/** and scripts/** vs CodingRules/AGENTS. Semantic exclusions are symbol/file-level (mark skipped, audit rest normally): checkers/_semantic.py+.pyi, new _decision_backend/_decision_cache modules (+.pyi), _base.py::check_if_meaningful (+stub section), no_try_import_checker::_OPTIONAL_IMPORT_PATTERNS. Inventory: .pyi fidelity/private symbols, @beartype + structural suppressions, trivial wrappers/duplicated logic, redundant fallbacks (astroid 3.x), legacy stubs (_FALLBACK_TOOLS, peek_fallback_tools, _compare_sorted re-export), over-long comments, 500-line/R0912/R0915 proximity, structlog/error rules, rumdl tests/data-exclude hack (TD-11). Output: rows {module, section, evidence file:line, category, est. LoC delta, owner, fix} + UNIFIED disjoint-ownership map (this audit is single owner; test-debloat-audit consumes it via inter-dep). Reads final state (post-golden/assumptions/consolidate) + beartype report.",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "replanAfter": true,
      "slug": "coding-rules-audit",
      "title": "Inventory CodingRules violations"
    },
    {
      "deps": [
        "golden-snapshot-wiring",
        "third-party-assumption-tests",
        "consolidate-integration-helpers",
        "coding-rules-audit"
      ],
      "description": "Read-only audit of tests/**. Semantic exclusions (mark skipped): tests/checkers/test_semantic_check.py, test_semantic_threshold.py, TestSuppressionRerankerPipeline class, tests/checkers/conftest.py (epic-created), tests/assumptions runtime/decision/cache modules (epic-created). Per module: behaviors protected; duplicates (incl. golden-covered); CodingRules-Tests violations (first-party mocking, naming, markers, in-file fixtures, _factories.py list[Any] tables, far cases); repo-self-lint tests for removal (test_self_lint_clean.py, AST/source-scanning guards, config re-checks); slow/benchmark; task-ID names. Output: rows {module, behaviors, duplicate-of, recommendation keep|merge|rewrite|remove, surviving coverage, reason, owner} + per-subsystem LoC estimates + per-limb pinning inventory (CLI/exit, baseline/autofix, configs/scopes: surviving test or blocking-debt flag). Owner column aligned to coding-rules-audit's unified map (read via inter-dep).",
      "kind": "fact-finder",
      "milestoneId": "M3",
      "replanAfter": true,
      "slug": "test-debloat-audit",
      "title": "Inventory redundant and lint-testing tests"
    },
    {
      "deps": [
        "golden-determinism-probe"
      ],
      "description": "Create tests/_golden.py as SOLE golden owner (no pipeline run in this item): UPDATE_ENV=PYTHON_SETUP_LINT_UPDATE_GOLDEN, SEMANTIC_ENV=PYTHON_SETUP_LINT_SEMANTIC; Finding TypedDict {tool,file|None,line|None,col|None,rule}; finding_key(f) None-safe (tool, file or '', line if int else -1, col if int else -1, rule) mirroring _violation_sort_key; normalize_record (drop msg, relativize vs project, strip ./, backslash->/, as_posix, assert non-absolute); serialize via json.dump(indent=2, sort_keys=True) + trailing newline; assert_matches_golden (Counter multiset diff, sorted added/removed; UPDATE=1: pytest.fail('refusing to rewrite golden under CI...') if CI/GITHUB_ACTIONS else warn + rewrite golden+counts together); read_oracle_rules, slice_tool_section, assert_oracle_coverage, assert_tool_coverage. Add tests/test_golden.py (synthetic Finding lists ONLY, no run_lint, no pipeline): finding_key None vs str/int ordering, POSIX normalization, multiset diff exact added/removed, CI-guard fail, coverage asserts, serialization byte-format. Acceptance: `uv run pytest tests/test_golden.py -q` passes; module <=500 lines, formatted. Consumes probe normalization spec; no src/ changes; no golden files yet.",
      "kind": "story",
      "milestoneId": "M1",
      "slug": "golden-helpers-unit",
      "title": "Golden helpers module with synthetic unit tests"
    },
    {
      "deps": [
        "golden-determinism-probe",
        "golden-helpers-unit"
      ],
      "description": "Using tests/_golden.py from golden-helpers-unit and the probe report verdict. (1) Commit tests/data/golden/minimal_sample_project_findings.json + ..._tool_counts.json via the helper serialization, outside sample dir, never copied/linted; violations.txt RETAINED as oracle. (2) Edit tests/integration.py test_setup_new_and_lint only: keep first run (no baseline, rc!=0) AND retain tool-section/SKIPPED/[CRASH]/W9705 assertions; add dedicated second capture (caller owns tmp, copy, git-init, _make_config, monkeypatched PYTHON_SETUP_LINT_SEMANTIC=0) calling collect_findings; replace substring loop with golden equality + oracle/tool coverage; brush-off/carry as tool-qualified lookups (pylint, mod.py:49 present / :56 absent); drift injection on in-memory copies only. Run captures on temp copies only, never bare `uv run lint` on the repo (ruff-format write hazard). Bounded src allowance ONLY if probe proved test-side insufficient: runner/baseline.py relativize/sort + runner/parsers.py|_record_parsers.py ordering, <=40 added lines, determinism-only (no finding added/removed), reviewed diff in report. Acceptance: `uv run pytest tests/integration.py -v` and `uv run pytest tests/test_golden.py -q` pass; regen twice byte-identical; golden+counts byte-stable.",
      "kind": "dev",
      "milestoneId": "M1",
      "slug": "golden-snapshot-wiring",
      "title": "Commit golden files and wire integration capture"
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

## Task Status
iteration: 1
amendments: 2
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

## Architect Amendment Directives
Wave 3 merged nothing because consolidate-integration-helpers, coding-rules-audit, and test-debloat-audit still depend on superseded golden-findings-snapshot (amendment 1 added golden-helpers-unit + golden-snapshot-wiring outlines but the prose dep-rewire was not applied). Replace those three pending outlines with identical content except dep golden-findings-snapshot -> golden-snapshot-wiring. Do not touch merged items (probe, assumption-tests) or the already-added split outlines. U3 prose reference update optional.

## Completed Wave Reports
Wave 3 completed. Merged items:

## Output

Yield a structured JSON object matching this schema:
- iteration (integer, required, min: 1)
- amendmentIndex (integer, optional, min: 0)
- items (array of object, required)
  - slug (string, required)
  - kind (string, required)
  - title (string, required)
  - assignment (string, required)
  - outlineRef (string, optional)
  - milestone (string, required)
  - wave (integer, required, min: 1)
  - deps (array of string, optional)
  - scenarioRefs (array of string, optional)
  - citations (array of string, optional)
  - escalate (boolean, optional)
