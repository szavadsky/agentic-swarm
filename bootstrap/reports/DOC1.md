# DOC1 — ideology document

## Files changed

- `docs/ideology.md` (new, 149 lines): five-line opening; 13 principle sections, each with Principle / Why / In the system / Forbids; "What was rejected and why"; a link to the manifesto glossary.
- `bootstrap/reports/DOC1.md` (new, this report).

## Verified

- `wc -l docs/ideology.md` → 149 (assignment range 120–180).
- Placeholder-marker search in `docs/ideology.md` (`rg` for the two assignment tokens) → no output (exit 1).
- 13 principle headings and 52 labelled parts (13 × 4), checked with `rg` counts.
- Every `file:line` reference was extracted and each cited line printed and read; all resolve and say what is claimed. Factual references are confined to `manifesto.md`, `manifesto.advice.md`, and `bootstrap/context/repo-map.md`; `bootstrap/KERNEL0.md` is cited only for named mechanisms and invariants (`upscope`, `TaskStatus`, derived state).
- `bun run typecheck` → green.
- `bun test` → 238 pass, 0 fail, 938 expects, 37 files, 17.19 s.
- `git diff --check` before commit → clean.

## Deviations and choices

- No deviation from KERNEL0. The assignment exempts code rules; I ran typecheck and tests anyway, since they were cheap and green.
- Read the opening as five physical lines, one sentence each.
- The manifesto does not say "state is never stored"; Intent requires idempotent aggregation (manifesto.md:33), and the document names KERNEL0's stronger invariant explicitly instead of presenting it as Intent.
- Glossary link is `../manifesto.md#n19-glossary--decided`; the anchor follows GitHub's em-dash slug. If the site renders anchors differently, link to `../manifesto.md` instead.
- No shared files changed.

## Next

- Owner review of the 13-section partition and the rejected-traits evidence lines.
- Link the document from a docs index or README when an owner of that file exists; DOC1 owns only `docs/ideology.md`.

## Surprises

- The last v2 run's review signal was weak in the direction the funnel needs: 5/5 failed items had approved reviews (`bootstrap/context/repo-map.md:107`), so clean code as a result is not a footnote to the review flow.
- Most architect spend was ceremony, not plans (`manifesto.advice.md:20-21`), which makes the iteration boundary the highest-leverage rule in the document.
