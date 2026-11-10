# Step: Triage

## Goal
Inspect incoming task intent and codebase context to determine task kind in the hierarchy and provide code citations.

## Rules
- Quick scoping step: Triage is a quick scoping step to classify the task kind and orient downstream work. Read INTENT-referenced docs at most once; do not spend time on exhaustive codebase analysis.
- Citations: Include only what you already read while judging scope, capped at ≤ 12 most relevant citations. Do NOT make exhaustive verification passes; the engine verifies citations and automatically drops invalid ones.
- Read-only on repository files: Do NOT edit or write code files.
- Determine classification kind: `simple`, `story`, `spike`, `epic`, or `saga` per criteria. `simple` for docs, renames, trivial splits, or really trivial additive changes (≤10–20 lines, no classes, no collaborating functions, zero tradeoffs); `story` when >10–20 lines, adds a class, functions calling each other, design tradeoffs, interface choices, or regression risks.
- Yield structured output matching the triage schema.

## Triage Criteria
# Task Triage Hierarchy & Criteria

Classification matrix for incoming tasks (`INTENT.md`).
(Numeric bounds live in `limits`; values below are the current defaults for orientation only.)

| Kind | Scope & Risk | Criteria |
|---|---|---|
| `simple` | Small, trivial, zero-risk scope | Doc changes, renames, trivial file split with no material change, really trivial additive change (≤10–20 lines of code, no new classes, no functions calling each other). No tradeoffs, no design decisions, no interface/config shape choices, obvious single correct implementation. Executable directly by triage session. |
| `story` | Single coherent feature or refactor | Needs more than ~10–20 lines of code, adds a class, or adds functions calling each other — OR has tradeoffs/design decisions to make, public interface/config shape choices, cross-module impact, non-obvious edge cases, or regression risk beyond touched code. Fits standard dev flow (`dev`, `no-behavior`, `test-only`). |
| `spike` | Exploration / uncertainty resolution | Technical unknown, third-party library evaluation, or feasibility study; precedes architectural commitment. Kinds: `fact-finder`, `poc`, `test-assumptions`. |
| `epic` | Multi-component subsystem | Requires architectural decomposition into milestones; spans multiple waves; root-level task only (max depth 1). |
| `saga` | Multi-epic initiative | System-wide initiative spanning multiple epics, architecture migrations, or multi-iteration lifecycles. Decompose into progressive epics. |

## Decision Rules
- `simple` = doc changes, renames, trivial file split with no material change, really trivial additive change (under ~10–20 lines, no classes, no collaborating functions, zero risk/tradeoffs).
- `story` when it needs more than ~10–20 lines of code, adds a class, or adds functions calling each other — plus any tradeoff/design decision, public interface/config shape choice, cross-module impact, non-obvious edge cases, or regression risk beyond touched code.
- Any task exceeding the story prod-line budget MUST be classified as `epic` or split into multiple stories.
- Any task with architectural unknowns MUST triage as `spike` or include spikes in its plan.

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

## Output

Yield a structured JSON object matching this schema:
- kind (string, required, enum: ["simple","story","spike","epic","saga"]): Task hierarchy classification (simple, story, spike, epic, saga)
- rationale (string, required): Explanation of classification rationale based on scope, risk, and design choices
- size (string, optional): Estimated scope or line count as a string (e.g. '1 file, <20 lines')
- risks (array of string, optional): Anticipated risks, uncertainties, or edge cases
- citations (array of object, required): Verified citations in the codebase with anchors and line numbers
  - file (string, required)
  - lines (string, required)
  - anchors (array of string, required)
  - summary (string, required)
