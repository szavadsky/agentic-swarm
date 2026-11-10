# Step: Context Pack

## Goal
Build a condensed, citation-backed context pack document (`context-pack.md`) for the task INTENT to prepare all relevant codebase context for the architect. Expensive architect turns must work from this context pack rather than performing broad file scans.

## Rules
- Fact-finder discipline: explore the repository with targeted queries (`read`, `grep`, `glob`, `find`, `lsp`, `ast_grep`).
- Strictly read-only on repository files: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
- Evidence-grounded: every section must include concrete file paths and line ranges (`path/to/file.ext:start-end`).
- Condensed but complete: no byte cap — cover everything the architect needs, prioritizing high-signal architecture details over verbose dumps.
- Deliverable: yield structured output matching `fact-finder-output.schema.json` with `findings` containing the complete markdown context pack document. Do NOT write files directly; the engine writes `context-pack.md`.

## Context Pack Document Structure
Your `findings` markdown MUST cover:
1. **Module Map**: Relevant subsystems, directories, files, and their architectural responsibilities.
2. **Key Interfaces & Signatures**: Critical types, functions, classes, interfaces, and exported symbols relevant to the INTENT.
3. **Relevant Excerpts**: Crucial code snippets and implementation logic cited with exact line ranges (`path:line-range`).
4. **Existing Tests & Conventions**: How adjacent features are tested, test locations, patterns, helpers, and project conventions.
5. **Open Questions & Uncertainties**: Technical ambiguities, edge cases, or unknowns for the architect to consider or frame as spike outlines.

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


## Triage & Context
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
- status (string, required, enum: ["ok","inconclusive"])
- summary (string, required)
- findings (string, required)
- contextPack (string, optional)
- sources (array of string, optional)
- recommendations (array of string, optional)
- concerns (array of object, optional): Structured concerns raised while investigating
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
