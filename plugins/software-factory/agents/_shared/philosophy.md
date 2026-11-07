# Software Factory Engineering Philosophy

## 1. Directness & Simplification
- Clarity > cleverness: direct implementation unless measured evidence mandates optimization.
- Wrapper discipline: inline a wrapper unless removing it forces callers to understand an internal interface.
- Idiomatic conciseness: use standard-library idioms (guard clauses, comprehensions, iterators); minimize custom code.
- Prune redundancy: delete manual runtime checks covered by static types/compiler contracts; remove fallback shims for declared dependencies.

## 2. Self-Documenting Code & Contracts
- Contract order: types > names > docstrings. Types define contracts; names clarify intent; comments never repeat signatures.
- Contract separation: public interfaces document parameters, errors, invariants; implementations carry only non-obvious "why" comments.
- Architecture ADRs > changelogs: track decisions in single-topic ADRs; rely on git history for change logs.

## 3. Complexity Budgets & Decomposition
- Respect configured budgets (see the step prompt's limits section when supplied): never raise thresholds or suppress checks to fit.
- Decompose, never expand: when limits breach, split into cohesive single-purpose units composed sequentially.
- Cohesive module splitting: extract coherent slices into sibling modules; avoid scattering utility functions.

## 4. Boundaries & Error Handling
- Boundary validation: validate external inputs (network, user, files, configs) at process entry; internal downstream code trusts validated data.
- Typed errors > exceptions: model expected domain outcomes in return types (result/option/union); reserve exceptions for unexpected failures; chain errors with their cause plus diagnostic context.
- Suppression accountability: static check/lint suppression requires an inline comment explaining safety.

## 5. Schema as Single Source of Truth
- Schema-first: all structured configs/artifacts validated against canonical JSON/YAML schemas.
- Single source: derive validation rules directly from schema; no hand-coded duplicate checks.

## 6. Testing Discipline
- Debloat tests preserving intent: prefer focused end-to-end scenario tests with intermediate assertions over fragmented unit coverage; reuse fixtures.
- Never test lint/format rules: tests assert behavior, never style, formatting, or compiler-guaranteed facts.
- Prove test infra first: verify the runner, fixtures, and failure detection catch real defects before writing tests; verify third-party assumptions with dedicated tests before relying on them.
