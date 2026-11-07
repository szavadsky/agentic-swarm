# Task Triage Hierarchy & Criteria

Classification matrix for incoming tasks (`INTENT.md`).
(Numeric bounds live in `limits`; values below are the current defaults for orientation only.)

| Kind | Sizing & Scope | File Bounds | Production Line Limit | Criteria |
|---|---|---|---|---|
| `simple` | Single isolated fix/tweak | 1 file | within `simpleMaxProdLines` | No architectural uncertainty; tests rename-only or minimal; zero external dependencies; executable directly by triage session. |
| `story` | Single coherent feature or refactor | 1–3 files | within `storyMaxProdLines` | Clear requirements; testable in isolation; fits single wave or standard dev flow (`dev`, `no-behavior`, `test-only`). |
| `spike` | Exploration/uncertainty resolution | Contained | Minimal / throwaway | Technical unknown, third-party library evaluation, or feasibility study; precedes architectural commitment. Kinds: `fact-finder`, `poc`, `test-assumptions`. |
| `epic` | Multi-component subsystem | Multi-file | exceeds story budget | Requires architectural decomposition into milestones; spans multiple waves; root-level task only (max depth 1). |
| `saga` | Multi-epic initiative | Cross-system | Unlimited | System-wide initiative spanning multiple epics, architecture migrations, or multi-iteration lifecycles. Decompose into progressive epics. |

## Sizing Rules
- Prod lines count added/modified lines in production paths (`paths.prod`).
- Any task exceeding the story prod-line budget MUST be classified as `epic` or split into multiple stories.
- Any task with architectural unknowns MUST triage as `spike` or include spikes in its plan.
