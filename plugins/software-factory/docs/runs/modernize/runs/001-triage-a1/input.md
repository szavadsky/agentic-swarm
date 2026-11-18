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
modernize

## Intent
# modernize

Modernize the project while preserving every material lint/check behavior.
- Enforce the project's coding rules (CodingRules.md, AGENTS.md) across the code base.
- Debloat code and tests; keep test intent, never test linting, test infra/assumptions first.
- Remove redundant tests.
- Replace the embedding/rerank based justification/comment check
  (`src/python_setup_lint/checkers/_semantic.py`) with a CPU-friendly small decision model,
  e.g. https://huggingface.co/fastino/GLiDE-0.4B or smaller
  (https://huggingface.co/spaces/multimodalart/jev-decision-index); keep a git-stored cache with cleanup.

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
