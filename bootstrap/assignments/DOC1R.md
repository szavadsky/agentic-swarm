# DOC1R — review of the ideology document

Worktree `/home/slava/aiexp/agentic-swarm.wt/doc1r`, branch `factory-v3-doc1r`. Rules: `bootstrap/assignments/RULES.md`, except: you change nothing but your report `bootstrap/reports/DOC1R.md`, committed.

## Why

`docs/ideology.md` explains the factory's principles to a new operator. It was written by another session from `bootstrap/assignments/DOC1.md`. You review the result against that task and against the source — you have not seen how it was written, and that is intended.

## Read first

`bootstrap/assignments/DOC1.md` (the task and its acceptance); `docs/ideology.md`; `manifesto.md` — `## Intent` (lines 6-89) is the authority, the glossary is at 206-216.

## Do

1. References: for every `file:line` reference in the document, open the cited lines and decide whether they say what the sentence claims. Do all of them, mechanically — list the reference, verdict `ok` / `wrong line` / `does not say that`, and for a failure the correct line or the missing source.
2. Fidelity: every statement that contradicts Intent, overstates it (a "must" where Intent says "may", a mechanism Intent does not name presented as Intent), or fills a silence with invention.
3. Coverage: each topic the task lists is present, and each principle section has its four parts (principle, why, how it shows, what it forbids).
4. Reader test: as a new operator, name the three places where you still would not know what the factory will do, and the three sentences that could be deleted without loss.

## Report

`bootstrap/reports/DOC1R.md`, 80 lines at most: verdict `approve` / `changes` / `reject` on the first line; then findings ordered by damage, each with the line in `docs/ideology.md`, what is wrong, and what would satisfy you; then the reference table totals (checked / ok / failed) with the failures listed. Concrete findings only — no praise, no rewrite of the document.
