# Step: Triage

## Goal
Inspect incoming task intent and codebase context to determine task kind in the hierarchy and extract verified code citations.

## Rules
- Read-only on repository files: Do NOT edit or write code files.
- Determine classification kind: `simple`, `story`, `spike`, `epic`, or `saga` per criteria. `simple` for docs, renames, trivial splits, or really trivial additive changes (≤10–20 lines, no classes, no collaborating functions, zero tradeoffs); `story` when >10–20 lines, adds a class, functions calling each other, design tradeoffs, interface choices, or regression risks.
- Extract verified citations: Every citation in `citations` MUST reference existing files, valid line numbers, and exact symbol/heading anchors.
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
concerns-funnel

## Intent
# concerns-funnel

Implement spec item 18 of `docs/factory.v2.md` in `plugins/software-factory`
(read it in full; it is the acceptance definition):
- structured `concerns[]` and remarkable decisions/tradeoffs in agent outputs;
- engine aggregation under the task folder (`concerns/`, stable fingerprint ids, dedup, status, source record);
- triage by the step's reviewer (workhorse class; architect output → plan-reviewer) with the review disposition
  vocabulary plus `dismiss` (logged with reason, kept);
- routing: blockers block dependent items + architect consult; `architect` → next architect turn;
  `human-*` → steer mailbox per policy; tech debt → plan tech-debt list;
- funnel worker → reviewer → epic architect → saga architect → human, less detail per level, never more text
  than the code summarized; saga architect reviews epic-level items and steers or propagates;
- blocking vs non-blocking ADRs; remarkable items reported in a mailbox digest, never waiting;
- human-involvement mode presets `autonomous`, `principal`, `detailed` (pipeline config + reviewer/architect
  prompt fragments), shipped as commented default config examples; selectable per task;
- surfaced in wave/plan close-ups, `factory status`, state.yaml counts.
Update `plugins/software-factory/docs/ARCHITECTURE.md` (incl. the §1 row for item 18), README and config commentary.
Keep prompts terse (debloated). Behavior tests only. Expected scope: a couple of iterations at most.

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
