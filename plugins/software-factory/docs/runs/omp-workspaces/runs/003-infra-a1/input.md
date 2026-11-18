# Step: Infra

## Goal
Discover project infrastructure, worktree bootstrap commands, test runner configuration, and quality gates.

## Rules
- Read-only on repository files: Do NOT edit or write code files.
- Validate commands: Probe candidate commands with `bash`. Record red gates as-is, do NOT investigate or fix: If gates fail or are red on a clean checkout, record them as they are — the engine records baseline gate status and ratchets against regressions; do NOT hunt for workarounds, do NOT investigate failure causes, and do NOT search outside the repository. The target repository may be the factory itself — still only record, never investigate or fix engine internals.
- Orchestration-folder lint noise: when a gate's failures come from `{orchestrationFolder}` files (`.factory/**` or configured orchestration folder, such as `input.md`, `INTENT.md`, or harness records), declare the gate command with the tool's exclude option if one exists (e.g. `--exclude .factory`). If no exclude option exists for the tool, declare the gate as-is and report it in `notes: string[]` as an operator action.
- Gate mutation rule: quality gates MUST NOT mutate the worktree. Always declare check-only flags (e.g. `ruff format --check` instead of `ruff format`).
- Sizing: Setup commands should be minimal (≤3, empty `[]` if standard checkout works).
- Containment: Work ONLY inside `cwd`. Never search outside the repository root.
- Yield structured output matching `infra.schema.json`.

## Output Fields Specification
- `setup`: Minimal shell commands to prepare a fresh worktree (e.g. `["npm install"]` or `[]`).
- `gates`: Array of `{ "id": "...", "command": "..." }` for project checks (typecheck, lint, tests). Record existing gates as defined in the repository, even if currently failing on clean checkout.
- `testRunner.command`: Base test command, e.g. `"pytest"` or `"bun test"`.
- `testRunner.selectorArgs`: MUST be `[]` (positional selectors) unless the runner family consumes selectors behind a flag. Per-runner rules:
  - pytest: ALWAYS `[]`. Node-ids (`tests/test_math.py::test_add`) are positional; `-k` takes a keyword EXPRESSION and silently selects nothing when given a node-id. The engine builds `<command> <selector...> <junitArg>`.
  - unittest (`python -m unittest`): ALWAYS `[]`. Dotted ids (`tests.test_math.TestAdd.test_x`) are positional.
  - bun / node test runners: `[]` (file paths positional).
  - jest/vitest keyword filter: `["-t"]` ONLY when selectors are bare keyword strings (no `::`, `/`, or dotted module paths). If selectors may be file paths, use `[]`.
- `testRunner.junitArg`: Argument format for writing JUnit XML report, e.g. `"--junitxml={path}"` for pytest. The engine replaces `{path}` with the temporary JUnit report path.
- `notes`: Optional array of strings detailing operator actions or configuration suggestions (e.g. advising to exclude the orchestration folder from project linters/formatters).
- Selector dry-run (REQUIRED): after choosing `testRunner`, run the selection yourself with `bash`: execute `<command> <one-real-selector> <junitArg-with-tmp-path>` and confirm the named test actually ran (not "0 selected" / "no tests found"). If the runner cannot select a single test, record that in `notes` and prefer a gate-based target instead.
## Task
omp-workspaces

## Intent
# omp-workspaces

Implement spec items 19 and 20 of `docs/factory.v2.md` in `plugins/software-factory`
(read both in full; they are the acceptance definition):
- workspace isolation via omp's configurable isolation backend by default; engine-managed git worktrees kept
  as `isolation: engine` option; start with a fact-finder spike on omp isolation mechanics
  (prior research: `plugins/software-factory/docs/spikes/`);
- preflight: omp version/config compatibility, isolation round-trip, models/roles resolvable, repo state;
- idempotent status/cleanup/gc launcher commands (dry-run gc by default, refuse while a run holds the lock);
- commit content from agents' structured output (engine never invents content);
- wave-end merge: conflict-free → deterministic CI gates → merged; conflicts/red → workhorse wave-end merger
  agent → unresolvable → architect escalation with status + worktree/branch pointers;
- saga: each epic an independent factory launch in its own workspace (parallel epics), merge escalation to the
  epic architect inside an epic and to the saga architect at saga wave end; concerns propagate upward;
- architect context economy: compaction before an uncached resume, cache warm on standby where it pays,
  cost-measured configurable defaults, re-evaluate schema-free telegraphic architect output with PM structuring;
- docs per use case (single task, story waves, epic, saga with parallel epics, conflict/escalation paths,
  status/cleanup/gc);
- "no models" end-to-end tests through the real omp harness with a scripted mock model provider.
Expected to be split into epics by the architect where complexity warrants; behavior tests only; terse prompts.


## Context
{
  "citations": [
    {
      "file": "docs/factory.v2.md",
      "lines": "104-113",
      "anchors": [
        "19. workspaces, merging, lifecycle (prefer omp over DIY)",
        "workspace isolation via omp's configurable isolation backend by default",
        "preflight verifies: compatible omp version + config",
        "wave-end merge (default)",
        "saga: each epic runs as an independent factory launch"
      ],
      "summary": "Spec item 19 acceptance definition: omp isolation as default with engine worktrees as an option, a fact-finder spike on omp mechanics, hardened preflight, idempotent status/cleanup/gc with dry-run gc and lock refusal, agent-derived commit content, wave-end merge/CI/workhorse-merger/architect escalation, saga parallel-epic launches and escalation split, use-case docs, no-model e2e tests through the real omp harness, and repo-rules hydration."
    },
    {
      "file": "docs/factory.v2.md",
      "lines": "114-120",
      "anchors": [
        "20. architect context economy: cache coherence and compaction",
        "(a) compact the architect session before a resume",
        "(c) session launching must never break the provider prompt cache",
        "(d) optional optimizations only after (c) holds"
      ],
      "summary": "Spec item 20 acceptance definition: compact before cache-missing resumes, keep caches warm on standby when cheaper, decide configurable defaults from measured usage/cache-read tokens, re-evaluate schema-free telegraphic architect output vs schema-bound plans, and hard cache-coherence invariants (additive sessions only, no transcript rewrite, byte-stable prefixes/overlay) before optional compaction optimizations."
    },
    {
      "file": "plugins/software-factory/docs/ARCHITECTURE.md",
      "lines": "40",
      "anchors": [
        "Deliberately not hand-built",
        "second self-hosted fire-test goal `omp-workspaces`",
        "no cache/compaction management"
      ],
      "summary": "Architecture traceability row for spec 19+20: deliberately not hand-built; current state is engine-managed worktrees, item-level integrate, in-process epics, schema-bound architect plan, and no cache/compaction management, with prior omp research in docs/spikes."
    },
    {
      "file": "plugins/software-factory/docs/IMPLEMENTATION.md",
      "lines": "166-173",
      "anchors": [
        "Saga (NOT IMPLEMENTED as launches)",
        "no saga launcher/loop exists",
        "defers this to the `omp-workspaces` fire-test goal"
      ],
      "summary": "Explicit implementation gap: saga launches do not exist; triage can classify saga but engine.ts only has runTaskChild for epics, and this work is deferred to the omp-workspaces goal."
    },
    {
      "file": "plugins/software-factory/docs/spikes/omp-1-topology.md",
      "lines": "189-215",
      "anchors": [
        "Isolation: `isolated: true` vs Engine-Created Git Worktrees",
        "Failure / Rejection Trap (Critical)",
        "Engine-Created Git Worktree (`git worktree add -b topic/x/y /path`)",
        "Full Retention"
      ],
      "summary": "Prior omp isolation research: built-in isolated:true loses branch commits on failure/rejection and needs apply:false to avoid merging into the parent, while engine-created git worktrees with omp --cwd retain all changes regardless of exit status; this is the starting point for the mandated fact-finder spike."
    },
    {
      "file": "plugins/software-factory/src/core/git/worktrees.ts",
      "lines": "38-123",
      "anchors": [
        "Ensures the root task worktree exists.",
        "Idempotent: Subsequent calls reuse the existing worktree",
        "Ensures a child worktree exists"
      ],
      "summary": "Current engine-managed worktree implementation that must become the isolation: engine backend: idempotent root task worktree creation (branch from HEAD, INTENT commit, stale registration pruning) and child worktree creation for epics/items."
    },
    {
      "file": "plugins/software-factory/src/core/engine.ts",
      "lines": "123-225",
      "anchors": [
        "Runs an epic as a child task on the parent branch",
        "ensureChildWorktree",
        "Epic ${epicSlug} child task"
      ],
      "summary": "Current epic execution is in-process via runTaskChild on a child branch/worktree of the parent task, with child close-up records and concern propagation; sagas need independent factory launches per epic instead of this in-process model."
    },
    {
      "file": "plugins/software-factory/src/core/flows/merge-path.ts",
      "lines": "131-243",
      "anchors": [
        "Runs the merge path for a single ready item under the parent's merge lock",
        "mergeParentInto",
        "role: \"workhorse\"",
        "conflictResolved"
      ],
      "summary": "Existing item-level merge path under a per-parent merge lock: merge parent into child, workhorse conflict-resolution agent on conflict, conclude merge, gates/verify, then merge child into parent; this is the baseline to generalize into wave-end merges with deterministic gates and architect escalation pointers."
    },
    {
      "file": "plugins/software-factory/src/cli/dispatch.ts",
      "lines": "110-159",
      "anchors": [
        "case \"init\"",
        "case \"preflight\"",
        "case \"status\"",
        "case \"run\""
      ],
      "summary": "CLI currently exposes only init/preflight/status/steer/run; the spec's idempotent whole-tree status plus cleanup and dry-run-by-default gc launchers are absent."
    },
    {
      "file": "plugins/software-factory/src/cli/status.ts",
      "lines": "24-70",
      "anchors": [
        "Prints compact derived state for a task",
        "export async function runStatus"
      ],
      "summary": "Status is scoped to one task and resolves its single worktree; spec item 19 requires whole-tree status across saga/epics/tasks/items with workspace+branch per active agent and open questions."
    },
    {
      "file": "plugins/software-factory/src/cli/preflight.ts",
      "lines": "365-393",
      "anchors": [
        "const ompBinary =",
        "execFileSync(ompBinary, [\"--version\"]",
        "OMP binary validation failed"
      ],
      "summary": "Preflight already validates the omp binary version and config overlay; spec item 19 additionally requires a real throwaway isolation round-trip, model/role resolvability, and repo state consistency with records."
    },
    {
      "file": "plugins/software-factory/docs/OMP_ADAPTER.md",
      "lines": "163-168",
      "anchors": [
        "## 7. Prompt-cache safety",
        "Resumed turns are true additive appends",
        "only transport filenames embed timestamps",
        "Overlay generation is deterministic per pipeline"
      ],
      "summary": "The documented cache-safety audit claims additive resumes and deterministic overlays, but transport system-prompt filenames embed timestamps/randomness; item 20c requires auditing that omp caches by content, and item 20a/b/d require new compaction, standby warming, and handoff behavior on top of these invariants."
    }
  ]
}

## Output

Yield a structured JSON object matching this schema:
- setup (array of string, required): Minimal setup shell commands (at most 1-3) executed to prepare a fresh worktree, e.g. ['poetry install'] or ['bun install']. Empty array [] if standard checkout requires no setup.
- gates (array of object, required): Repository quality gates (compile, typecheck, lint, fast tests) defined by the project. If any gate fails on clean checkout, record it as is — the engine records baseline status.
  - id (string, required): Gate identifier (e.g. 'typecheck', 'lint', 'test', 'build')
  - command (string, required): Shell command to run for this gate, e.g. 'ruff check .', 'pytest', 'tsc --noEmit'
- testRunner (object, required): Project test runner configuration for automated red/green checking and JUnit XML reporting
  - command (string, required): Base test runner shell command, e.g. 'pytest', 'cargo test', 'bun test', 'npm test'
  - selectorArgs (array of string, optional): Flag prefix for test selectors. MUST be [] (positional) unless the runner consumes selectors behind a flag. pytest node-ids are positional: ALWAYS []. unittest dotted ids: []. bun/node paths: []. jest/vitest ['-t'] ONLY for bare keyword selectors.
  - junitArg (string, optional): Flag/argument template to output JUnit XML report, with '{path}' or '{{path}}' placeholder for the file path. E.g. '--junitxml={path}' for pytest, '--reporter=junit --output={path}', or '' if unsupported.
- notes (array of string, optional): Optional notes or operator actions (e.g. advising to exclude the orchestration folder from project linters)
