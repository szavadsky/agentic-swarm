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
