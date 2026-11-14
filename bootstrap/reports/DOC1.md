# DOC1 — ideology document

## Files changed

- `docs/ideology.md` (149 lines): five-line opening; 13 principle sections, each with Principle / Why / In the system / Forbids; "What was rejected and why"; a link to the manifesto glossary. Amended after DOC1R.
- `bootstrap/reports/DOC1.md` (this report).
- No shared files changed.

## DOC1R findings

- F1 — fixed: dropped the unsourced mid-iteration-context sentence; the paragraph now ends on the cited $5.22 and 141,337-token facts.
- F2 — fixed: the principle now says consults are batched to the boundary and a mid-iteration consult is the measured exception (`manifesto.md:17`; `manifesto.md:19`; `manifesto.md:26`), with no flat prohibition.
- F3 — fixed: the capability rule now adds `manifesto.md:39` and `manifesto.advice.md:145` to the ACP/native-interface citations.
- F4 — fixed: `upscope` now cites `manifesto.md:13` and `manifesto.advice.md:195`, not the status union.
- F5 — fixed: the v2 hard-cap incident moved into Forbids; Why now names the wrong-authority failure without misattributing `bootstrap/context/repo-map.md:109`.
- F6 — fixed: the handoff/rebuild claim now cites `manifesto.md:29` and `manifesto.md:30`.
- F7 — fixed: the principle now says only "aggregated idempotently from artifacts" (`manifesto.md:33`); KERNEL0's stronger "never stored" invariant stays in In the system.
- F8 — fixed: the forwarding criterion now cites `manifesto.md:42-44`.
- F9 — fixed: the subarchitect-summary claim now cites both `manifesto.md:38` and `manifesto.md:33`.
- F10 — fixed: the closing bullet now cites `manifesto.advice.md:325` for v2's six counters and `manifesto.md:99` for the compounding rule.
- F11 — fixed: "human or reviewer" → "architect and reviewer" (`manifesto.md:22`).
- F12 — kept, exception stated: KERNEL0 is cited only for named kernel mechanisms and invariants (`TaskStatus`, derived state, merge/park, on-disk layout); every number and incident still comes from `manifesto.md`, `manifesto.advice.md`, or `bootstrap/context/*.md`.

## Reader test

- Merge path — fixed: added one serial merge queue, gate-on-merged-result, and park-on-red (`manifesto.advice.md:269`; `bootstrap/KERNEL0.md:122`).
- Parked-work owner — fixed: added parked-is-terminal and architect continuation through a new slug (`bootstrap/KERNEL0.md:103`).
- Operator surface — fixed: added the `.factory/repo.yaml` / process / run config layout and the goal-directory contents (`bootstrap/KERNEL0.md:89-93`).

## Verified

- `wc -l docs/ideology.md` → 149 (assignment range 120–180).
- 13 principle headings and 52 labelled parts (13 × 4), checked with `rg` counts.
- Reference audit: 127 occurrences, 85 unique, 0 failed after the fixes; every cited line was opened and read against its claim.
- Placeholder-marker search in `docs/ideology.md` → no output (exit 1).
- `bun run typecheck` → green; `bun test` → 243 pass, 2 skip, 0 fail, 921 expects, 43 files, 20.99 s.
- `git diff --check` → clean.
