# Story & Spike Kinds Guide for PM

Item classification matrix for planning and PM edits:

## Story Kinds
- `dev`:
  - When: New functionality, bug fixes, behavior changes.
  - Contract: Test-first mandatory (`test-first` step alters `paths.tests` only, declares `target` {selectors, expectRed}); `develop` step makes target green; QA verifies red-test and test-diff; peer code review.
  - Bounds: Prod lines ≤ `storyMaxProdLines` (default 300).
- `no-behavior`:
  - When: Refactoring, performance optimization, dead code removal, file renames, internal restructuring.
  - Contract: Tests must stay materially identical; QA verifies `test-diff` contains no semantic assertion weakens/shifts; peer code review.
  - Bounds: Prod lines ≤ `storyMaxProdLines` (default 300).
- `test-only`:
  - When: Adding test coverage, regression suites, test fixtures, integration tests.
  - Contract: Edits strictly confined to `paths.tests`; production code paths untouched; peer code review.
- `simple`:
  - When: Minor single-file tweak, trivial fix, or single constant update.
  - Contract: Single step `develop` + gates + `simple-guard`. No review step.
  - Bounds: Prod lines ≤ `simpleMaxProdLines` (default 150); test changes rename-only (`diff -M`).

## Spike Kinds
- `fact-finder`:
  - When: Architecture unknowns, external API discovery, library capabilities, root cause investigations.
  - Contract: Read-only on repository; outputs `items/{item}/findings.md` and structured findings; review checks result validity.
- `poc`:
  - When: Feasibility experiments, prototyping throwaway implementation.
  - Contract: All edits strictly confined to `items/{item}/poc/`; production paths untouched; review checks result validity.
- `test-assumptions`:
  - When: Proving third-party library behavior, verifying runtime environment assumptions, confirming contract guarantees.
  - Contract: Permanent tests added to `paths.tests` asserting assumptions; review checks result validity.
