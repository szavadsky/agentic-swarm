# REV — adversarial review of kernel-0

Run on `opencode-go/muse-spark-1.3-contributor#xhigh` (D12). The reviewer model sees the artifact, never how it was written; self-review by the implementing model does not count.

Worktree `/home/slava/aiexp/agentic-swarm.wt/rev`, branch `factory-v3-rev`. Rules: `bootstrap/assignments/RULES.md`, except: you change no code. Your only product is `bootstrap/reports/REV.md`, committed.

## Why

Kernel-0 was written by several sessions in parallel and integrated. Before it is trusted to run on its own repository, someone who did not write it must try to break it. You see the result, not the authors' reasoning — that gap is the point.

## Read first

`manifesto.md:6-89` (Intent — the requirement); `bootstrap/KERNEL0.md` §3, §5, §6, §7 (loop, invariants, edge cases, scenarios); then `plugins/software-factory/src/kernel/**`, `src/harness/{types,fallback}.ts`, `prompts/**`, `test/kernel/**`.

## Do

1. Invariants (KERNEL0 §5): for each, find the code that enforces it and the test that would fail if it broke. Report an invariant with no enforcement or no such test.
2. Break the pure core by reasoning and by experiment: write throwaway tests (do not commit them) for `derive`/`next` with hostile record sequences — out-of-order sequence numbers, a record started twice, a merge record without a review, a task file edited after merge, a dependency cycle introduced by a PM edit, a `base` pointing at a slug that is no longer parked, two launches writing records at once. Report every case where state is wrong, a task could merge twice, a task could run forever, or the launch could hang.
3. Loops and money: find every place a turn can be repeated — repair turns, fix rounds, infra retries, fallbacks, PM repair, conflict attempts. For each: what bounds it, and whether two bounds multiply. Find every architect launch site and prove there is exactly one per iteration.
4. Prompts versus code: every `{{variable}}` is supplied; nothing the prompts promise (paths, hashes, round numbers, baseline checks) is missing or stale at render time; no role is told to do what the script forbids it.
5. Slop: dead code, duplicated helpers, tests that assert wiring instead of behavior, comments that restate code, files over ~250 lines, anything the manifesto rejects (schema per output, ceremony launches, nested retries).
6. What an operator will trip over in the first real launch: unclear errors, missing pre-flight checks, places where a crash loses work.

## Report

`bootstrap/reports/REV.md`, 120 lines at most. Findings ordered by damage: `file:line` — what breaks — the smallest reproduction (command or record sequence) — the smallest fix. Mark each `proven` (you reproduced it) or `suspected`. Then one paragraph: would you launch this on its own repository today, and what must change first. No praise, no summary of what the code does.
