# Software Factory Engineering Philosophy

## 1. Directness & Simplification
- Clarity > cleverness: Direct implementation unless performance benchmarks mandate optimization.
- Wrapper discipline: Inline wrapper unless removing it forces callers to understand internal dependency interface.
- Idiomatic conciseness: Use language idioms (guard clauses, comprehensions, iterators); minimize custom code via standard libraries.
- Prune redundancy: Delete manual runtime checks covered by static types/compiler contracts; remove fallback shims for declared dependencies.

## 2. Self-Documenting Code & Contracts
- Contract order: Types > Names > Docstrings. Types define contracts; names clarify intent; comments never repeat signatures.
- Contract separation: Public stubs/interfaces document parameters, exceptions, invariants; implementation files contain only non-obvious "why" comments.
- Architecture ADRs > changelogs: Track decisions in single-topic ADRs; rely on git history for change logs.

## 3. Complexity Budgets & Decomposition
- Enforced budgets: Thresholds for branch count, statement count, module length strictly respected.
- Decompose, never expand: When limits breach, split into cohesive single-purpose units composed sequentially; never raise thresholds or suppress checks.
- Cohesive module splitting: Extract coherent slices into sibling modules; avoid scattering utility functions.

## 4. Boundaries & Error Handling
- Boundary validation: Validate external inputs (network, user, files, configs) at process entry; internal downstream code trusts validated data.
- Typed errors > exceptions: Model expected domain outcomes in return types (result/option/union); reserve exceptions for unexpected failures; chain exceptions (`raise X from Y`) with diagnostic context.
- Suppression accountability: Static check/lint suppression requires inline comment explaining safety.

## 5. Schema as Single Source of Truth
- Schema-first: All structured configs/artifacts validated against canonical JSON/YAML schemas.
- Single source: Derive validation rules directly from schema; no hand-coded duplicate checks.

## 6. Testing Discipline
- Debloat tests preserving intent: Optimize test LoC and complexity; prefer focused end-to-end scenario tests with intermediate assertions over fragmented unit coverage; reuse test fixtures.
- Never test compiler guarantees: Tests must not assert type safety or properties guaranteed by static analysis.
- Test assumptions first: Verify third-party library assumptions with dedicated tests before relying on them; prove test harnesses detect real defects.
