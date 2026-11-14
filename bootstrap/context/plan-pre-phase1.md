# Plan — goal `self`: the factory completes itself

Authority: `manifesto.md` `## Intent`; goal delta: `intent.md`. Code: `plugins/software-factory` (kernel `src/kernel/`, adapters `src/harness/`, v2 leftovers `src/core/`). Paths below are relative to `plugins/software-factory/` unless they start at the repo root.

Strategy, iteration 13: iteration 12 merged 6 (`front-land`, `sweep-land`, `brake-priced`, `compact-shared`, `incident-surfaces`, `register-guards`) and parked `pm-ladder-tidy` on `upscope`. Its in-scope work is green, but ending the iteration as infra needs `launch.ts`, which sat outside its scope: once more the plan drew the scope too tight, and the implementer did not fail. That one park held the whole serial chain (`steer-guards` → … → M11 → delivery), so 13 tasks stayed pending. Scope rule learnt from four upscope parks: a task whose done-when names a launch-level or CLI-level observable owns the module that produces it. Order: (1) `pm-infra-stop` (base: the parked branch; scope widened to `launch.ts`); (2) M16, debt from the iteration-12 reviews: front handoff and status truth, test-only git exports; (3) the rest of the M15 chain; (4) `review-upscope`, `plan-review`; (5) hierarchy level 2 (M11); (6) delivery: usage doc, ideology check, Intent→evidence table; the operator launches the benchmark run. Hot modules serialize along `pm-infra-stop` → `steer-guards` → `rotation-threaded` → `review-upscope` → `epic-plumbing`. Side branches: `front-handoff` before `rotation-threaded`; `front-status` after `steer-guards`; `doc-drift` after `rotation-threaded` and before `plan-review`.

## Rules every task carries

- Gates by own run, green in the task worktree before reporting done: `plugins/software-factory/scripts/gates.sh plugins/software-factory` (package-only export, then install, typecheck, test). The reviewer re-runs it.
- No scenario in `test/kernel/**` weakened, skipped or deleted to get green.
- A new schema field, config knob, counter or command carries a one-line justification in the task's report.
- Tests read nothing outside `plugins/software-factory/`: the gate runs on a package-only export, so an outside read fails the task's own gate. Fixtures inline or under `test/`; a test of a real `bootstrap/` file is live-only (`skipIf(!LIVE)`, as `test/kernel/live-run-configs.test.ts`).
- Tests and the rendered prompt snapshot of a touched module are in-scope collateral, whatever the Scope line lists.

## M1 — Foundation — merged: `sync-base`, `base-follow`, `crash-detail-opencode`.

## M2 — Measurement — merged: `cost-pricing`, `prompt-size`, `subagent-usage`, `metrics-incidents`, `budget-drain`, `benchmark-report`.

## M3 — Prune

Goal done-when: nothing the manifesto rejects remains. Authority: `manifesto.md` line 5 and Notes "Reuse from plugins/software-factory"; `bootstrap/context/kept-modules.md` (do-not-cite list). Import-graph inventory by scout PruneMap (reachable set = everything imported from `bin/factory.ts`). Rule for every batch: a dead `src` module and every test importing it leave in the same diff; a test that exercises a live module through a dead helper is rewritten, not deleted. Prune tasks never touch `manifesto.md`, `bootstrap/**` or `plugins/software-factory/docs/runs/**`.

- `prune-docs` — Rejected v1/v2 design material still reads as authority to agents.
  - Done-when: removed `docs/adr/`, `docs/factory.v2.md`, `docs/dev-process.md`, `docs/dev-process-diagram.svg`, `plugins/software-builder/`, `plugins/software-factory/agents/` (unreachable `_shared` partials), `agents/skills/factory-selfhost/`, `.factory/project.yaml` (v2 template); `docs/ideology.md` stays (v3). Gates green.
  - Scope: those paths plus `src/cli/lock.ts` (its `resolveRuntimeDir` falls back to reading `.factory/project.yaml` for `worktreeRoot`).
  - Edge cases: the lock-dir fallback must come from the run config's `worktreeRoot` (already passed by the launch, verify) — if some caller relies on project.yaml, report instead of guessing a default.
  - Ordering: after `sync-base`.
- `prune-checks` — The v2 checks stack and disk-space guard are dead (kernel `gates.ts`/`baseline.ts` replaced them); ~4.8k lines of code and tests that slow the suite.
  - Done-when: `src/core/checks/` keeps only `types.ts` and `setup.ts`; `src/core/disk-space.ts` and the tests importing removed modules are gone; `rg` finds no import of a removed path; gates green.
  - Scope: `src/core/checks/**`, `src/core/disk-space.ts`, `test/checks/**`, `test/disk-space.test.ts`.
  - Ordering: after `sync-base`; before `prune-git` (dead checks import dead git leaves).
- `prune-checks-types` (base: `prune-checks`) — Finish the checks prune. Its reviewer (record 00084) proved 11 types in `src/core/checks/types.ts` and `CheckLimits.minFreeDiskMb` serve only the deleted stack, while the old done-when kept the file whole; direction fixed: the trim is in scope.
  - Done-when: the base branch's deletions stand; `src/core/checks/` holds `setup.ts` and a `types.ts` exporting only what live code imports (`CheckResult`, `tailCap`), no `Repo` import; `rg minFreeDiskMb src test` empty; gates green.
  - Scope: `src/core/checks/**`, `src/core/disk-space.ts`, `test/checks/**`, `test/disk-space.test.ts`.
  - Edge cases: no kernel low-disk guard replaces the dead one (not Intent; a full disk surfaces as an infra stop with details).
  - Ordering: before `prune-git` (dead checks import dead git leaves).
- `prune-checks-land` — Lands the parked `prune-checks-types` branch (with `prune-checks` beneath it): v2 checks stack, disk-space guard and their tests deleted, `types.ts` trimmed. Parked only because its base lacked `scripts/gates.sh`; the trim was never reviewed.
  - Done-when: `prune-checks-types`' done-when holds on `factory/self`; `rg` finds no import of a deleted path, including imports merged since; gates green.
  - Scope: as `prune-checks-types`.
  - Approach: first commit merges the kept branch `factory-task/self/prune-checks-types` into the task worktree; then fix fallout only. Not via `base:` (pinned build's defect, see `parked-base-sync`). If the merge conflicts, resolve toward deletion and report.
  - Ordering: no upstream; before `prune-git`; parallel with `turn-land` (no shared module).
- `prune-git` — Dead `core/git` leaves, v2 `core/budget.ts`, `core/steer.ts`, and the v2 `core/journal.ts` (records are v3's journal; its last writer is `core/shutdown.ts`).
  - Done-when: `src/core/git/` keeps only `exec`, `commit`, `repo`, `merge`, `status`; `core/budget.ts`, `core/steer.ts`, `core/journal.ts` and their tests gone; `test/git/merge.test.ts` and `test/git/commit-and-guard.test.ts` rewritten onto raw git setup, keeping every assertion on live code; gates green.
  - Scope: `src/core/git/**`, `src/core/{budget,steer,journal,shutdown}.ts`, `test/git/**`, `test/git-*.test.ts`, `test/steer.test.ts`.
  - Edge cases: `shutdown.ts` keeps its behaviour minus the journal append; if a shutdown event then has no trace at all, report it — do not invent a replacement log.
  - Ordering: after `prune-checks-land`; before `prune-sweep`.
- `prompt-refs` — `prompts/digest.md` and `prompts/VARIABLES.md` tell agents the goal dir holds `journal.ndjson`; nothing in v3 writes it (records are the journal), so the digest scout hunts a missing file.
  - Done-when: `rg -n "journal.ndjson" plugins/software-factory/prompts` is empty; prompt tests green.
  - Scope: `prompts/digest.md`, `prompts/VARIABLES.md`.
  - Ordering: after `sync-base`.
- `prune-sweep` — "Nothing the manifesto rejects remains" needs a proof, not a list: every `src/**` file reachable from `bin/factory.ts`. Known leftovers: `core/concerns.ts` (v2 concern store; live code imports only `concernFingerprint`), `core/concern-types.ts`, `core/runtime-tmp.ts`, `core/clock.ts`, plus whatever the prior batches orphan.
  - Done-when: a reachability check from `bin/factory.ts` (command in the report; the reviewer re-runs it) lists no unreachable `src/**/*.ts`; unused exports of kept `src/core/**` modules removed; tests of removed code gone, tests of live code kept; gates green.
  - Scope: `src/core/**`, root-level `test/*.test.ts`.
  - Edge cases: `concernFingerprint` stays importable where `src/kernel/context-pack.ts` imports it (no kernel edit); a module reachable only from tests is dead.
  - Ordering: after `prune-git`.
  - Approach: the bundler's input list (`bun build` with a metafile) or `bunx madge --orphans`; if neither runs offline, a throwaway import walker, not committed.

## M4 — Harness layer — finished spike: `acpx-probe`.

## M5 — acpx adapter (pi, codex) — merged: `acpx-doc`, `acpx-adapter`.

## M6 — Flow-layer promises the kernel does not keep

- `tier-escalation` — The architect's `escalation` tier is parsed (`src/kernel/tasks.ts`) and never resolved: an escalated task still runs on the cheap implementer. Manifesto Model economics: the architect calls the expensive tier.
  - Done-when: kernel test — a task with `tier: escalation` runs its implement step on the run config's `escalation` alias, its review step on the normal reviewer alias; a task without tier is unchanged; pre-flight fails when a task file names a tier with no alias.
  - Scope: role→alias resolution in `src/kernel/flow-context.ts`, the tier check in `src/kernel/preflight.ts`, a test under `test/kernel/`.
  - Edge cases: same-session follow-up after an escalated implement resumes on the escalation alias (sessions are alias-bound); tier names are open (`tier` value = alias name), `default` = no override.
  - Ordering: after `sync-base`; before `overflow-denovo` (shares `flow-context.ts`).
- `turn-target` (base: `tier-escalation`) — The escalated tier never reaches the turn: `stepTarget` resolves alias/model/harness, `flow.ts` passes only `role` to `runAgentTurn`, `agent.ts` re-resolves it via `resolveRoleAlias`; `merge-attempt.ts` repeats this; dispatch admits on `target.harnessId`, so admission and the turn can disagree. Fix the interface, not one call site.
  - Done-when: `tier-escalation`'s done-when (escalated implement on the `escalation` alias, review on the reviewer alias, untiered unchanged, pre-flight fails on a tier with no alias) plus a kernel test: for an escalated task, admission's harness equals the recorded turn's harness, and the record's alias/model are the escalation alias's.
  - Interface: `runAgentTurn(runtime, spec)` with `spec.target: RoleTarget` (alias, harness, model, effort, fallbacks, timeouts) replacing `spec.role`; one resolver `resolveRole(runtime, role, tier?)`; boundary, PM and digest pass `resolveRole(runtime, "<role>")`.
  - Scope: `src/kernel/{agent,flow,flow-context,merge-attempt,dispatch,preflight,boundary,pm,digest,types}.ts` — resolution and call sites only; tests under `test/kernel/`.
  - Edge cases: tier value = alias name, `default` = none; a fix-turn follow-up after an escalated implement resumes on the escalation alias; fallbacks are the resolved alias's.
  - Ordering: first in the kernel chain; before `overflow-denovo`, `stop-details-visible`, `pm-frozen`, `usage-unknown`, `cli-paths`, `front-ladder`.
  - Approach: the base branch carries no diff; delete `resolveRoleAlias` once no caller remains. If a caller genuinely needs role-only resolution, keep one resolver and report.
- `turn-land` — Lands the parked `turn-target` branch: one resolved `RoleTarget` from resolution to the turn, so the escalated tier reaches the turn and admission and turn agree. Parked only because its base lacked `scripts/gates.sh`; never reviewed.
  - Done-when: `turn-target`'s done-when holds on `factory/self`; `rg resolveRoleAlias src test` empty; gates green.
  - Interface: as `turn-target` — `runAgentTurn(runtime, spec)` with `spec.target: RoleTarget`; one `resolveRole(runtime, role, tier?)`.
  - Scope: `turn-target`'s scope plus `src/kernel/architect-session.ts`.
  - Edge cases: as `turn-target`; architect resumes stay on the architect alias.
  - Ordering: first in the kernel chain, replacing `turn-target` upstream of `overflow-denovo`, `stop-details-visible`, `pm-frozen`, `usage-unknown`, `cli-paths`, `front-ladder`, `acpx-preflight-msg`. Not via `base:` — the pinned build's base path is the defect `parked-base-sync` fixes.
  - Approach: first commit merges the kept branch `factory-task/self/turn-target` into the task worktree; then fix fallout from what merged since (`acpx-session-loss`, `harness-hygiene`); then move `architect-session.ts` to `resolveRole` and delete the re-export. If the carried design fights current code, report the seams; do not silently rewrite.
- `flow-just-implement` — Manifesto Config-driven flows names "just implement"; `prompts/pm.md` already offers it, no config defines it, so a bullet using it breaks the PM's derive.
  - Done-when: `config/process.yaml` defines `just-implement` (implement step only); kernel test: a just-implement task merges after gates with zero reviewer turns, and a red merged gate still parks it.
  - Scope: `config/process.yaml`, flow derivation in `src/kernel/derive-task.ts` / `src/kernel/next.ts` only if a review-less flow trips them, a test under `test/kernel/`.
  - Edge cases: no review step ⇒ no review rounds; debt/concerns come only from the implementer's outcome.
  - Ordering: after `sync-base`; before `empty-diff-skip`.
- `empty-diff-skip` — An implement step that commits nothing still consumes reviewer rounds and is only caught later as a no-progress park (REV §5).
  - Done-when: kernel test — an implement turn reporting `done` with an empty diff skips the reviewer and parks with cause `empty-diff`; in flow `spike` an empty diff is a normal finish (the product is knowledge).
  - Scope: `src/kernel/flow.ts`, `src/kernel/derive-task.ts`, a test under `test/kernel/`.
  - Ordering: after `flow-just-implement`.
- `overflow-denovo` — Manifesto Context economy: not portable → de novo with the context pack. An `infra: overflow` stop on a resumed session has no de-novo path today (REV §5).
  - Done-when: kernel test with a fake harness — overflow on a resumed turn retries once de novo with the full prompt and does not consume a review round or item turn; overflow on a de-novo turn parks with cause `overflow`.
  - Scope: `src/kernel/flow-context.ts`, `src/kernel/agent.ts`, a test under `test/kernel/`.
  - Ordering: after `turn-land` (shares `flow-context.ts`, `agent.ts`); before `session-end-compact`.

## M7 — Iteration-5 review debt — merged: `cost-unknown`, `opencode-cache-write`, `refusal-scrub`, `omp-resume-test`, `base-follow-fixes`, `pack-path-single`, `docs-truth`.

## M8 — Iteration-7 review debt

- `stop-details-visible` — Infra/refusal details reach step records but not the operator: `flow.ts` and `merge-attempt.ts` rebuild the infra result as `{kind, cause}` dropping `details`; `dispatch.ts`/`launch.ts` print `slug: cause`, so a bad model route still reads "auth" in the launch summary. `dispatch.ts`'s drain docstring contradicts its drain branch.
  - Done-when: kernel test — a fake-harness `provider.no-route` infra stop shows its details in the park cause, the launch stop text and the iteration summary; a stop without details prints as today; the drain docstring matches the code.
  - Scope: `src/kernel/{flow,merge-attempt,dispatch,launch}.ts`, a test under `test/kernel/`.
  - Edge cases: details are already scrubbed and truncated by the classifier — no second scrub, no longer cap.
  - Ordering: after `turn-land`; before `limits-usd-typed`, `session-end-compact`, `steer-holds`, `front-ladder`.
- `usage-unknown` — Measurement holes: a harness that reports no usage (pi via acpx) yields zero counters that `priceUsage` prices as known $0 for a table-listed model; metrics prices only `rec.usage`, losing retry/fallback attempts' spend (`attempts[].usage`); loop incidents match only `/no[- ]progress/`, missing `empty-diff` parks; metrics negative tests missing; README's metrics paragraph stale.
  - Done-when: kernel tests over record fixtures — all-zero-token usage prices unknown and counts as an unpriced turn, metrics/summary/digest agree; a record with two attempts prices both, once each; an `empty-diff` park counts as a loop incident, a spike's empty finish does not; fixtures with none of each yield zero counts; README metrics paragraph matches.
  - Interface: `priceUsage` rule — zero total tokens = not reported → `undefined` (a real turn always consumes input); no `Usage` shape change.
  - Scope: `src/kernel/{pricing,metrics,summary,digest}.ts`, their tests, README's metrics paragraph.
  - Edge cases: no double count where `rec.usage` already includes the last attempt — read how `fallback.ts` and the adapters fill both before summing; a harness non-zero cost still wins.
  - Ordering: after `turn-land` (`digest.ts`); before `limits-usd-typed`, `cli-paths`.
- `limits-usd-typed` — `limits.iterationUsd` bypasses typed limits: `RunConfig["limits"]` and `Limits` omit it, so `iterationUsdBrake` casts; budget-drain left two edges untested.
  - Done-when: `iterationUsd?: number` declared in both types, mapped in `toLimits`; dispatch reads `runtime.limits.iterationUsd`; `iterationUsdBrake` and its `config.test.ts` case gone; kernel tests — another iteration's priced records do not count toward this iteration's brake; a turn with tokens but no harness cost, priced from `run.prices`, trips it.
  - Scope: `src/kernel/{types,config,dispatch}.ts`, tests under `test/kernel/`.
  - Ordering: after `stop-details-visible`, `usage-unknown`, `pm-ladder` (`config.ts`, `types.ts`); before `harness-rotation`, `steer-holds`.
- `cli-paths` — The summary path is defined three times (`boundary.ts`, `summary.ts`, `cli/commands.ts`); `factory benchmark` lacks the goal-dir existence check its sibling commands have; `resolveRuntimeDir`'s no-arg branch is untested; the `lock.ts` docstring is still false.
  - Done-when: one `summaryRelPath(iteration)` beside `contextPackRelPath()`, used by all three; `benchmark` on a missing goal exits non-zero with the siblings' message; CLI test for the no-arg branch; the lock docstring states what the function does.
  - Scope: `src/cli/{commands,benchmark,lock}.ts`, path helpers in `src/kernel/{boundary,summary,context-pack}.ts`, tests under `test/cli/` and `test/kernel/`.
  - Ordering: after `turn-land` (`boundary.ts`), `usage-unknown` (`summary.ts`), `pm-ladder` (`boundary.ts`); before `front-ladder`, `plan-review`.
- `pm-frozen` — Every iteration the PM rewrites the finished spike's task file (`acpx-probe`) and pm-reconcile restores it (records 00106, 00228): a failed script step per iteration and PM tokens on frozen work. The PM's view and the reconcile disagree on what is frozen.
  - Done-when: kernel test — with a merged task and a finished spike present, the PM prompt marks both frozen and read-only, and a PM pass leaving them untouched reconciles `ok`; an edit to either is still restored.
  - Interface: one frozen-set predicate shared by PM prompt rendering and reconcile.
  - Scope: `src/kernel/pm.ts`, `prompts/pm.md` and its snapshot, a test under `test/kernel/`.
  - Edge cases: keep reconcile's current definition of frozen; pending tasks without records stay editable.
  - Ordering: after `turn-land` (`pm.ts` call site) and `pm-ladder` (`pm.ts`, `prompts/pm.md`); before `steer-holds`.
  - Unknown: whether the PM edits it because its prompt omits status or because the plan once carried the bullet — read the 00227/00229 transcripts first.
- `acpx-session-loss` — A resumed acpx turn whose record is gone loops forever: with an effort set, the `set` call answers NO_SESSION before the prompt and its setup stop returns without the de-novo retry (only the prompt path has it); the record carries no session, so `resumeSessionFor` picks the previous dead ref again and `flow.ts` ends the iteration on infra. Plus acpx-adapter review leftovers.
  - Done-when: harness tests with the stub `acpx` — a resume whose `set` returns NO_SESSION retries once de novo (new session, effort set, prompt run) and returns the live ref; a second NO_SESSION is an infra stop with details and no session; the outcome-path test proves the adapter passed the requested path (the stub asserts what it received), not that the stub wrote its own file; `sessionDir` used or removed; unused `ACPX_EFFORT` re-export and `feedText` gone; the missing-binary pre-flight message names acpx and the `bunx acpx` route.
  - Scope: `src/harness/acpx/**`, `src/cli/harnesses.ts`, `test/harness/acpx-*`, the acpx stub under `test/`.
  - Edge cases: one de-novo retry per turn across setup and prompt together, never two; `omp/turn.ts`'s retry is the reference shape.
  - Ordering: none upstream; before `harness-hygiene`.
  - Approach: wrap setup and prompt in the one existing attempt loop. If the pre-flight wording lives in `src/kernel/preflight.ts`, leave it and report.
- `harness-hygiene` — Adapter debt: `withDetails` triplicated (`acpx/classify.ts`, `omp/classify.ts`, `opencode/classifier.ts`); the `Stop.details` doc in `harness/types.ts` still says "truncated stderr for crashes"; the omp resume retry guard is untested on its negative branch (`if (resumeId)` alone passes today); opencode usage falls back to step usage on a malformed export without a test, and its comment claims a universal rule.
  - Done-when: one `withDetails` in `src/harness/details.ts` used by all three; the types doc says what details carry; harness tests — a non-"not found" omp resume failure does not retry; opencode malformed and absent exports both fall back to step usage, and the comments in `opencode/usage.ts` and `api.ts` state exactly when.
  - Scope: `src/harness/{details,types}.ts`, `src/harness/{omp,opencode}/**`, `src/harness/acpx/classify.ts`, tests under `test/harness/`.
  - Ordering: after `acpx-session-loss`; before `session-end-compact`.

## M13 — Iteration-9 debt

- `parked-base-sync` — A `base:` task starts at the parked tip without the integration head: tools and fixes merged since are missing (iteration 9: `scripts/gates.sh`, exit 127 on both parks), and the review diff base is the parked tip, so never-reviewed parked commits escape review.
  - Done-when: kernel test with the fake harness — a continuation of a parked branch that predates an integration commit sees that commit's file in its worktree, and its reviewer diff base is the integration head (the carried parked commits appear in the diff); a conflicting sync parks with cause `base-conflict: <paths>` and leaves no merge state; tasks without `base` unchanged.
  - Interface: for a base continuation, `EnsuredWorktree.startPoint` = the integration head sha (`flow.ts` already takes it as the review base on the first turn).
  - Scope: `src/kernel/worktree.ts`, a test under `test/kernel/`.
  - Edge cases: sync only when the worktree is created (an existing worktree after a crash keeps its state); merge under `runtime.repo.writeLock` with the identity env, as `followBase`; the parked branch itself is never rewritten; the conflict surfaces through `EnsuredWorktree.error`, which `flow.ts` already parks.
  - Ordering: no upstream; parallel with `turn-land` (it owns `flow.ts`, this task does not touch it).
  - Approach: extract `followBase`'s merge/abort/conflict-paths core into one helper both use. If `ensureTaskWorktree` cannot merge without the goal checkout's lock semantics, report.
- `empty-diff-cause` (flow `just-implement`) — The park cause hides why: a gate-fix implement turn that commits nothing after red checks parks as plain `empty-diff`, which the digest read as "implementer did nothing" though round 1 had committed.
  - Done-when: kernel test — a gate-fix turn with no new tree after red checks parks with cause `empty-diff: implement r<N> committed no changes after red checks: <check> (<summary>)`; a first turn with no commit keeps today's cause.
  - Scope: `src/kernel/derive-task.ts`, a test under `test/kernel/`.
  - Edge cases: keep the `empty-diff:` prefix — `usage-unknown`'s loop-incident match and the digest key on it.
  - Ordering: no upstream.
- `probe-scratch-path` — Pre-flight base-gate scratch worktrees live at `<os.tmpdir()>/preflight-probe-*` (`baseline.ts` `scratchPath`), a prefix this package's own test helper sweeps (`test/helpers/tmp-repo.ts`), so a repo whose gate is such a suite deletes the scratch mid-gate and records a red base, and later same-named reds count as pre-existing (benchmark-kit review; record 00002).
  - Done-when: kernel test — a base gate whose command deletes every `os.tmpdir()/preflight-probe-*` still passes; the scratch is gone after the gate.
  - Scope: `src/kernel/baseline.ts`, a test under `test/kernel/`.
  - Edge cases: scratch under the run's runtime dir (`worktreeRoot`, outside the repo by pre-flight rule), never inside the tree; leave `bootstrap/benchmark/target-repo.yaml`'s TMPDIR isolation alone (benchmark comparability).
  - Ordering: no upstream.
- `acpx-preflight-msg` (flow `just-implement`) — `acpx-session-loss` left one done-when item unmet: the missing-binary pre-flight finding names neither acpx nor the `bunx acpx` route; the wording lives in `src/kernel/preflight.ts`.
  - Done-when: pre-flight test — an alias routed to acpx with no acpx binary yields a finding naming `acpx` and `bunx acpx`; other harnesses' wording unchanged.
  - Scope: `src/kernel/preflight.ts`, `test/kernel/preflight.test.ts`.
  - Ordering: after `turn-land` (both touch `preflight.ts`); before `pm-ladder` (`preflight.ts`).
- `benchmark-guards` (flow `just-implement`) — Benchmark kit safety (benchmark-kit review): `reset.sh` refuses a dest that contains `$HOME` or the checkout but not one inside the checkout, so `reset.sh bootstrap` deletes tracked files; its gate subshell runs under the ambient TMPDIR, unlike `target-repo.yaml`.
  - Done-when: `reset.sh <path inside the checkout>` exits non-zero before any delete (run, output in the report); the gate subshell runs under `TMPDIR=<dest>/gates-tmp`; `bootstrap/benchmark/README.md` claims match.
  - Scope: `bootstrap/benchmark/**`.
  - Ordering: no upstream.

## M14 — PM retry ladder (steer `steer-pm-ladder`)

- `pm-ladder` — Today a PM turn with no usable outcome gets one repair ask in the same session, then the iteration blocks. Iterations 6 and 10 failed identically on beam-free (no outcome file, then a confused repair; record 00290), and each time the owner had to promote the PM by hand. Kernel ladder instead: a fresh session on the same tier, then the next tier with a broader mandate, then blocked with the full trace.
  - Done-when: fake-harness kernel tests, where the faked flakiness is setup and the ladder is what is asserted. (a) Fails once, then succeeds: the second turn ran de novo (no session ref) on the same alias, its prompt carries the findings and the restated PM contract, and the iteration continues. (b) Fails twice: the third turn ran on the `escalateTo` alias's model with the broader-mandate note. (c) Fails twice on the last tier: the iteration is blocked, and the cause (shown in the summary as `boundary:`) lists every rung as alias, model, failure. (d) An escalated rung answering `blocked` with a question: the iteration is blocked with that question, and no further rung runs. Pre-flight: `escalateTo` naming an unknown alias, or forming a cycle, is a finding. An alias without `escalateTo` gets the retry, then blocks.
  - Interface: run-config alias field `escalateTo?: string` (another alias name). The escalated turn resolves through `turn-land`'s `resolveRole(runtime, "pm", <alias>)`. Knob justification: which model a failed turn climbs to is model routing, a run-layer concern; `fallbacks` stay infra-only (same harness, quota and crash).
  - Scope: `src/kernel/{pm,boundary,config,types,preflight}.ts`, `prompts/pm.md` and its snapshot, `bootstrap/run/{self,self-acpx}.yaml` (`pm.escalateTo: escalation`, an alias both already define), the README run-config section, tests under `test/kernel/`.
  - Edge cases:
    - Usable means an outcome is present, its status is `done`, and validation has no findings.
    - Base-tier `failed` (e.g. "plan underivable") climbs the ladder; its reasons become the next rung's findings. Only an escalated rung may stop the ladder with `blocked` plus a question for the architect.
    - Every tier gets two turns: the first, then one de-novo retry. The existing same-session repair ask is removed (clean cutover). The generic outcome-repair inside `runAgentTurn` stays as is, because it serves every role.
    - A failed rung's plan and task-file writes are rolled back to the pre-PM snapshot before the next rung, so no confusion carries over.
    - Each rung is its own `pm` step record (round = rung), so metrics and digest count it. Escalated turns count toward the $ brake.
  - Ordering: after `turn-land` (`resolveRole`, the `pm.ts` call site) and `acpx-preflight-msg` (`preflight.ts`). Before `pm-frozen` (`pm.ts`, `prompts/pm.md`), `limits-usd-typed` (`config.ts`, `types.ts`), `cli-paths` (`boundary.ts`).
  - Approach: build the rung list once from the alias chain as (alias, mandate) pairs, two per tier, and loop over it inside `runPm`. `boundary.ts` only renders the trace. If the rollback fights the reconcile's frozen-task restore, keep reconcile as the one restorer and report.

## M15 — Iteration-11 parks and review debt

- `front-land` — Lands the parked `front-ladder` branch (`factory-task/self/front-ladder`; merges cleanly, never reviewed) plus the two seams its scope missed: the CLI e2e test still scripts the architect first, and a trivial goal's implement step does not resume the front's session. Manifesto Escalation ladder.
  - Done-when: `front-ladder`'s done-when holds on the merged tree; `test/cli/e2e.test.ts` green with its goal still reaching the architect (a scripted `bigger` front turn, or a `class.yaml` written after init); kernel test — the trivial path's implement turn resumes the front's session when the harness matches, de novo with the pack otherwise; `prompts/VARIABLES.md` has a front section; gates green.
  - Scope: the kept branch merged in, `src/kernel/{front,launch,boundary,flow,flow-context}.ts`, `config/process.yaml`, `prompts/front.md`, `prompts/VARIABLES.md` (front section only), `test/cli/e2e.test.ts`, tests under `test/kernel/`.
  - Edge cases: merge the kept branch, never `base:`; review covers the branch's whole diff against the integration head; a goal with `plan.md` or `class.yaml` behaves byte-identically (existing suite); a front turn without an outcome stays an infra stop.
  - Ordering: no upstream; before `pm-ladder-tidy` (`boundary.ts`), `compact-shared` (`flow-context.ts`), `sweep-land` (test import lines), `doc-drift` (`VARIABLES.md`), `review-upscope`, `plan-review`.
  - Approach: merge first, then fix e2e, then seed the trivial path's first implement step with the front record as the prior session for the existing `resumeSessionFor`. If the resume needs more than that seed, ship de novo with the pack and report.
- `sweep-land` — Lands the parked `prune-sweep` branch (`factory-task/self/prune-sweep`; merges cleanly, never reviewed). Its done-when was too strict: four `src` files are reachable only from tests. Dispositions: `src/cli/index.ts` is a test-only barrel → deleted, tests import the concrete modules; `src/harness/fake/**` is the test double → allowlisted; `src/kernel/register.ts` has no production caller until M11 wires it → allowlisted. Plus prune-git's shutdown leftovers.
  - Done-when: committed `test/reachability.test.ts` walks relative imports (type imports included) from `bin/factory.ts` and fails on any `src/**/*.ts` outside the reachable set, except a named allowlist with one reason per entry; an allowlisted file that becomes reachable fails as stale, so M11 drops `register.ts` when it wires it; `installShutdownHandlers`/`registerActiveStep` gone; a test pins the live interrupt path (`terminateAllChildGroups` kills a spawned child group); gates green.
  - Scope: the kept branch merged in, `src/core/**`, `src/cli/index.ts` (delete) and the import lines of its importers, root-level `test/*.test.ts`, `test/kernel/shutdown.test.ts`.
  - Edge cases: `concernFingerprint` stays importable for `context-pack.ts`; a test exercising a live module through a dead helper is rewritten, not deleted; no `bootstrap/**` edit.
  - Ordering: after `front-land`, `incident-surfaces` (both edit tests that import `src/cli/index.ts`).
  - Approach: the throwaway walker from the park record (`records/00353-i11-prune-sweep-park-r1`), turned into the test. If `bun build --metafile` gives the same set more simply, use it and report.
- `rotation-threaded` — Replaces parked `harness-rotation` (its branch has no commits). Its park (record 00442) proved the plan's interface unreachable inside its scope: no caller hands the iteration to `resolveRole` (`stepTarget`, `dispatch.ts`, `flow.ts`, `merge-attempt.ts`), and `resumeSessionFor` checks portability against the alias's static harness, so a rotated turn would resume the other harness's session. Manifesto Harness agnosticism; knob justification as `harness-rotation` (per-iteration routing is run config).
  - Done-when: `harness-rotation`'s done-when (two iterations → two harnesses in one alias's records; pre-flight validates each entry; `bootstrap/run/self-rotate.yaml`; README key), plus kernel tests for both probe failures — dispatch over iterations 1 and 2 calls the rotated harness; an iteration-1 session from another harness is not resumed in iteration 2. A conflict-merge turn and `perHarness` admission use the rotated entry.
  - Interface: alias `rotate?: AliasEntry[]` (entry N mod length); `resolveRole(runtime, role, { alias?: string; iteration: number }): RoleTarget`, where `alias` overrides the role's alias (a task's `tier`, a PM rung's `escalateTo`, the front's `pm` fallback all pass it; this ends the iteration-12 "tier vs alias" conflation in `front.ts`); `stepTarget(…, iteration)`; `resumeSessionFor` takes the resolved `RoleTarget` and checks `portable(prior.harness, target.harnessId)`.
  - Scope: `src/kernel/{config,types,flow-context,flow,dispatch,merge-attempt,preflight}.ts`, every other `resolveRole` call site (call line only), `bootstrap/run/self-rotate.yaml`, the README run-config section, tests under `test/kernel/`.
  - Edge cases: fallbacks apply to the rotated entry; a tier or `escalateTo` alias resolves its own rotation; `self.yaml` untouched.
  - Ordering: after `compact-shared` (`flow-context.ts`, `merge-attempt.ts`), `steer-guards` (`dispatch.ts`), `front-handoff` (`flow-context.ts`, `flow.ts`, `front.ts`); before `doc-drift` (`types.ts`, README), `review-upscope` (`flow.ts`), `epic-plumbing`, `operator-docs`.
  - Approach: make `iteration` required so the typechecker lists every caller. If a caller has no iteration in reach, report it rather than defaulting to 0.
- `pm-ladder-tidy` — pm-ladder review leftovers, plus one direction change: a rung ending on an infra stop (quota or crash after the alias's own `fallbacks`) currently climbs, spending an escalated turn at ~13× the price on trouble the fallbacks already absorbed. It ends the iteration as infra with details instead. Also the pm-frozen leftover.
  - Done-when: kernel tests — a rung ending on an infra stop stops the boundary as infra, with no further rung run; a base-tier `failed` outcome's reasons appear as findings in the next rung's prompt; a `cancelled` task renders read-only in the PM prompt; `PmRung` has no write-only field (`mandate` shown in the boundary's trace, or removed), `failure` is required, and the unreachable fallbacks in `boundary.ts` and `failureReasons` are gone.
  - Scope: `src/kernel/{pm,boundary}.ts`, `prompts/pm.md` and its snapshot, tests under `test/kernel/`.
  - Edge cases: refusal and invalid or missing outcomes still climb; only stop kind `infra` ends the ladder; rollback before an escalated `blocked` stays.
  - Ordering: after `front-land` (`boundary.ts`); before `steer-guards` (`pm.ts`, `boundary.ts`).
- `steer-guards` — steer-holds review leftovers that can corrupt a run:
  - the steer PM turn rewrites task files with no snapshot, validation or restore (unlike `runPm`), and a malformed file throws out of derive;
  - mid-run polls pass `settleMs: 0`, so a half-written steer is claimed and its truncated text stands all iteration;
  - a malformed hold file is an uncaught throw on every later launch;
  - a steer arriving between the boundary's inbox read and dispatch start gets no PM turn all iteration.
  - Done-when: kernel tests — a steer turn that edits a task file is restored, with a failed script record naming the file; a fresh steer still growing across the settle interval is not claimed on that pass; a malformed hold stops the iteration with an infra cause naming the file, and no held task is dispatched; a steer dropped after the boundary's read gets a PM steer turn in dispatch.
  - Interface: the boundary hands dispatch the steer ids it read (`seenSteers: string[]`, through `launch.ts`).
  - Scope: `src/kernel/{dispatch,mailbox,pm,boundary,launch}.ts` (steer paths only), tests under `test/kernel/`.
  - Edge cases: settle once per newly seen batch, not per loop pass; the steer turn's restore reuses `runPm`'s snapshot helper (one helper, no copy).
  - Ordering: after `pm-infra-stop` (`pm.ts`, `boundary.ts`, `launch.ts`), `brake-priced` (`dispatch.ts`); before `front-status` (`launch.ts`), `doc-drift`, `rotation-threaded` (`dispatch.ts`), `plan-review` (`boundary.ts`).
- `brake-priced` — The USD brake (`dispatch.ts` `iterationSpend`) prices only `rec.usage`, while metrics and digest price every reported attempt (`pricedRecord`). A turn that retried or fell back is undercounted, so the brake trips later than the summary's spend says.
  - Done-when: kernel test — a record with two reporting attempts counts both toward `limits.iterationUsd`, equal to the metrics figure for the same records; brake and metrics call one priced-spend function.
  - Scope: `src/kernel/{dispatch,pricing}.ts`, tests under `test/kernel/`.
  - Ordering: no upstream; before `steer-guards` (`dispatch.ts`).
- `compact-shared` — session-end-compact leftovers: a conflict-merge turn's settle never compacts, and resume no longer compacts, so that session is resumed uncompacted (cache regression on that path); `compactSession` duplicates `architect-session.ts`'s `compactArchitect` line for line.
  - Done-when: kernel test — a conflict-merge turn on a compaction-capable fake harness compacts at settle and its record stores the compacted ref; `architect-session.ts` calls `compactSession` and its copy is gone; the architect compaction tests stay green unchanged.
  - Scope: `src/kernel/{merge-attempt,architect-session,flow-context}.ts`, tests under `test/kernel/`.
  - Ordering: after `front-land` (`flow-context.ts`); before `rotation-threaded`, `epic-consult` (`architect-session.ts`).
- `incident-surfaces` — Loop incident classes added in iteration 11 never reach a human: overflow parks are not counted at all; empty-diff parks feed `loopIncidents` but are not in `IncidentCounts`; the summary lists only `noProgressParks`; `factory benchmark`'s "loop incidents" row sums `INCIDENT_LABELS`, which lack empty-diff and include infra retries. `SummaryInput`'s cause comment still says "PM validation".
  - Done-when: tests — `IncidentCounts` carries `overflowParks` and `emptyDiffParks`, and `loopIncidents` is derived from it (one source); the summary's incident section lists both; the benchmark "loop incidents" row equals `metrics.loopIncidents` for the same records; the README metrics paragraph names the counters; the cause comment names the PM ladder.
  - Scope: `src/kernel/{metrics,summary}.ts`, `src/cli/benchmark.ts`, the README metrics paragraph, tests under `test/kernel/` and `test/cli/`.
  - Ordering: no upstream; before `sweep-land` (`test/cli/` imports), `doc-drift` (README), `epic-reporting`.
- `register-guards` — epic-register review leftovers: an `architect main` row may name any existing plan path, though only `plan.md` is the main consult's; an unterminated code fence before `## Architect register` yields an empty register, which is legal at depth 2, so a malformed plan silently disables the check instead of blocking.
  - Done-when: register tests — a main row whose plan is not `plan.md` is a finding (inside `epics/` and at a source path); an unterminated fence at EOF is a finding, distinguishable from a plan with no register.
  - Scope: `src/kernel/register.ts`, tests under `test/kernel/`.
  - Ordering: no upstream; before `epic-consult`, `epic-pm`.
- `doc-drift` (flow `just-implement`) — Docs and comments the iteration-11 merges left false:
  - `prompts/VARIABLES.md`: the pm `repair` row (now also carries the ladder notes), missing `steers` and `holds_dir`;
  - README: the prices section lacks the zero-counter exception; the goal tree lacks `mailbox/holds/`; §Steering says steers are read only at the boundary;
  - `src/kernel/types.ts` `base` comment (a continuation now records the integration head it was synced to, never the parked tip);
  - `test/helpers/tmp-repo.ts` sweep rationale (no live scratch uses the probe prefix anymore).
  - Done-when: each statement matches the code, with the code line cited in the report; gates green.
  - Scope: those four files, comment and doc lines only.
  - Ordering: after `steer-guards` (steering behaviour), `rotation-threaded` (`types.ts`, README), `front-handoff` (`VARIABLES.md`); before `plan-review` (`VARIABLES.md`).

## M16 — Iteration-12 park and review debt

- `pm-infra-stop` (base: `pm-ladder-tidy`) — Finishes `pm-ladder-tidy`. Its kept branch (record 00494) already makes the ladder stop on an infra rung, renders the stop in the boundary, marks cancelled tasks read-only, and has tests. The launch still ends `iteration-limit`: `launch.ts` reads only `boundary.decision`, and only front and dispatch infra stops set `ended = "infra"`. Also removes the `compactArchitect` alias re-export that `compact-shared` left in `architect-session.ts`; `boundary.ts` is its only importer.
  - Done-when: `pm-ladder-tidy`'s done-when holds on the merged tree; a kernel test through `runGoal`, where the architect continues and the first PM rung returns a quota infra stop, shows: launch stop `infra`, a cause naming quota and its details, summary status `stopped-with-debt`, and no task dispatched that iteration; `compactArchitect` is gone and `boundary.ts` imports `compactSession`; gates green.
  - Interface: `BoundaryResult` carries an optional infra stop (`{ cause, details }`, the shape dispatch's infra stop already uses); `runGoal` treats it as it treats a dispatch infra stop.
  - Scope: the kept branch (via `base:`), `src/kernel/{pm,boundary,launch,architect-session}.ts`, `prompts/pm.md` and its snapshot, tests under `test/kernel/`.
  - Edge cases: refusal and invalid or missing outcomes still climb; the pre-PM snapshot stays restored, so nothing dispatches against it; front and dispatch infra paths unchanged.
  - Ordering: no upstream; before `steer-guards` (`pm.ts`, `boundary.ts`, `launch.ts`), `front-status` (`launch.ts`).
  - Approach: the park's own smallest next step (record 00494 concern): set the field in the new infra branch, then `ended = "infra"` and the stop cause after `runBoundary` returns. If the launch's stop derivation fights it, choose otherwise and report.
- `front-handoff` — Manifesto Escalation ladder: "Trivial: the same agent implements." `front-land` left two gaps. The front-session resume is unreachable: the front runs in the goal checkout, the task runs in its own worktree, and `frontSessionFor` requires equal cwd; its test passes only via a hand-written record. The pack handoff is a `Front pack:` brief line the front must remember to write. Direction: "same agent" means the front's resolved target (alias, model, harness), de novo, with the front pack as a structural prompt variable. No cross-cwd resume: harness sessions are cwd-bound, and the session is a cache saving, not Intent.
  - Done-when: kernel tests on the real front path (no hand-written record): a trivial goal's implement turn runs on the front's target, de novo, with the pack path carried by a prompt variable; a task-class goal's implement turn runs on the implementer alias with the same variable; `frontSessionFor` and its fabricated-record test are gone; `validateFrontTasks` no longer requires the brief line; `prompts/VARIABLES.md` documents the variable; gates green.
  - Scope: `src/kernel/{front,flow,flow-context}.ts`, `prompts/{implementer,front}.md`, `prompts/VARIABLES.md` (implementer and front rows only), their snapshots, tests under `test/kernel/`.
  - Edge cases: without `class.yaml` the variable is empty and the prompt is otherwise unchanged; a trivial task's review uses the reviewer alias; fix turns resume the implement session as today (same worktree).
  - Ordering: no upstream; before `rotation-threaded` (`flow-context.ts`, `flow.ts`, `front.ts`), `doc-drift` (`VARIABLES.md`), `review-upscope` (`front.ts`, `flow.ts`).
  - Approach: fill the variable in `promptVars` from `class.yaml` and the front record. If telling a front task from others needs a new task field, use the front record's task slug instead and report.
- `front-status` — A goal that lands through the front writes `status: goal-met` but derives `active`, so `factory status` prints "active … stop=done" for a launch that exited 0. `derive` takes goal status only from architect decisions, and `launch.ts` compensates locally (`frontFinished`).
  - Done-when: kernel tests: a trivial goal whose front task merges derives `done`, and the CLI status line prints it; a front goal whose task parks derives `blocked`; the launch's local status compensation is gone (derive is the one source); bigger goals unchanged (existing suite); gates green.
  - Scope: `src/kernel/{derive,launch}.ts`, the status line in `src/cli/` if it needs one, tests under `test/kernel/` and `test/cli/`.
  - Edge cases: a later architect decision overrides the front's (a steered front goal); status is never derived from `class.yaml` alone, only from the recorded stop.
  - Ordering: after `steer-guards` (`launch.ts`); before `epic-plumbing`.
  - Approach: when the front path stops, the launch appends one script record carrying the front's decision; `derive` reads the latest decision from either the architect or that record. If a new step name fights the metrics or digest readers, derive from `class.yaml` plus terminal task states and report.
- `git-helpers-prune` (flow `just-implement`) — From the `sweep-land` review: `src/core/git/{commit,merge}.ts` export `headOf`, `treeOf`, `mergeParentInto`, `concludeMerge` and `mergeChildIntoParent`, whose only outside callers are in `test/git/**`. The file-level reachability test cannot see dead exports.
  - Done-when: each helper is deleted (no use left) or unexported (used only inside its module); `test/git/**` asserts through the live exports; `rg` finds no import of a removed export; gates green.
  - Scope: `src/core/git/{commit,merge}.ts`, `test/git/**`.
  - Edge cases: a test that covers live merge behaviour through a dead helper is rewritten, not deleted; no kernel module touched.
  - Ordering: no upstream.

## M9 — Context economy and harness rotation

- `session-end-compact` — Manifesto Context economy: compact at the end of a session, never at the beginning of a resumed one; portability is directional. Task sessions break both: `resumeSessionFor` compacts the prior session just before resuming it, and resumes whichever harness recorded it even when the alias now routes elsewhere (fallback hop, rotation).
  - Done-when: kernel tests with the fake harness — an implement or review turn on a compaction-capable harness is compacted in `settle` and the record stores the compacted ref; the next fix turn resumes it with no compaction call; a prior session from a harness other than the resolved target is not resumed (de novo with the pack).
  - Interface: `portable(from: string, to: string): boolean` in the harness layer — same harness only today (no cross edges proven).
  - Scope: `src/kernel/{flow-context,flow}.ts`, `src/harness/types.ts` (portability), a test under `test/kernel/`.
  - Edge cases: a turn ending in an infra/refusal stop is not compacted; a failed compaction keeps the uncompacted ref; architect compaction (`architect-session.ts`) is the pattern, unchanged.
  - Ordering: after `overflow-denovo`, `stop-details-visible`, `harness-hygiene`; before `harness-rotation`, `review-upscope`.
- `harness-rotation` — Manifesto Harness agnosticism: harnesses rotate across iterations so no harness-specific assumption survives untested. Each alias names one harness today. Knob justification: rotation is per-iteration routing, which belongs in run config, not code.
  - Done-when: an alias may carry `rotate:` entries (harness, model, effort) — iteration N uses entry N mod length; kernel test over two iterations sees two harnesses in one alias's records, and iteration 2 does not resume iteration 1's session across harnesses; pre-flight validates every entry; `bootstrap/run/self-rotate.yaml` = `self.yaml` with the implementer rotating across opencode, pi and codex on models the probes ran; README documents the key.
  - Interface: alias schema `rotate?: AliasEntry[]`, resolved inside `resolveRole` with the iteration number.
  - Scope: `src/kernel/{config,types,flow-context,preflight}.ts`, `bootstrap/run/self-rotate.yaml`, the README run-config section, tests under `test/kernel/`.
  - Edge cases: fallbacks apply to the rotated entry; `perHarness` admission uses the rotated harness; `self.yaml` untouched (owner adopts rotation).
  - Ordering: after `limits-usd-typed` and `session-end-compact`; before `operator-docs`.

## M10 — Steering and the escalation ladder

- `steer-holds` — Manifesto Steering: the mailbox is monitored during a run; the PM structures each steer and decides which task or gate it blocks; in-flight tasks finish and park unmerged, pending ones hold; the consult waits until the unblocked remainder is exhausted. Today the inbox is read only at the boundary.
  - Done-when: kernel test with the fake harness — a steer dropped mid-iteration triggers one PM steer turn; held pending tasks are not dispatched; a held in-flight task finishes its step and parks unmerged with cause `steer: <id>`; unheld tasks run to exhaustion; the steer then reaches the architect at the boundary as today (only the architect marks it processed). A steer holding nothing changes nothing; a goal hold drains dispatch.
  - Interface: the PM writes `mailbox/holds/<steer-id>.yaml` `{ slugs: string[], goal: boolean }`; the script reads it (agent produces, script reads; no outcome-schema change).
  - Scope: `src/kernel/{dispatch,mailbox,pm,merge-attempt}.ts`, `prompts/pm.md` and its snapshot, a test under `test/kernel/`; types local to these modules.
  - Edge cases: poll between dispatch decisions, never interrupting a turn; a steer present at the boundary takes the boundary path only (no double PM turn); a held task stays pending for the architect; the PM steer turn counts toward the $ brake.
  - Ordering: after `limits-usd-typed`, `pm-frozen`, `stop-details-visible`; before `review-upscope`.
  - Approach: the dispatch loop already wakes on settle — check the inbox there. If merge-attempt cannot park before merging cleanly, hold at merge entry and report.
- `front-ladder` — Manifesto Escalation ladder: one cheap capable agent classifies the goal trivial / task / bigger; trivial → it implements; task → it scopes one task and the architect is never reached; task or bigger → the same agent prepares the context pack. Today every launch goes to the architect.
  - Done-when: kernel tests with the fake harness on a goal with no plan — a `front` turn writes `class.yaml`; trivial → one just-implement task (resuming the front's session where portable), merged after gates, zero architect and PM turns; task → one implement-review task file from the front's scope, zero architect and PM turns; bigger → the architect boundary runs with the front's pack instead of the scripted one. A goal with a plan or a `class.yaml` skips the front turn.
  - Interface: role `front` in `config/process.yaml` with `prompts/front.md`; run alias `front`, absent → the `pm` alias (no new required knob); artifact `class.yaml` `{ class: trivial|task|bigger, slug? }` beside the plan.
  - Scope: new `src/kernel/front.ts` (its types local), `src/kernel/{launch,boundary}.ts`, `config/process.yaml`, `prompts/front.md` and its snapshot, tests under `test/kernel/`.
  - Edge cases: the front's task file passes the same `tasks.ts` validation as the PM's; class changes only by escalation (`review-upscope`); a front turn without an outcome ends the launch as infra, never a silent default to bigger.
  - Ordering: after `turn-land`, `stop-details-visible` (`launch.ts`), `cli-paths` (`boundary.ts`); before `review-upscope`, `plan-review`.
  - Approach: the front runs before the boundary in the launch loop and writes through the store like the PM. If the architect-first assumption runs deeper than `launch.ts`/`boundary.ts`, report the seams instead of forcing it.
- `review-upscope` — Escalation ladder: on the task path, review auto-escalates to bigger when the real scope exceeds the defined one. Today a reviewer cannot upscope, and an implementer upscope only parks.
  - Done-when: kernel test — on a task-class goal, a reviewer or implementer `upscope` parks the task with cause `upscope`, sets `class.yaml` to `bigger`, and the next iteration runs the architect boundary with the parked task in its pack; on a bigger-class goal upscope behaves as today.
  - Scope: `src/kernel/{flow,derive-task,next,front}.ts`, `prompts/reviewer.md` (upscope allowed on review), `prompts/_outcome.md` if it forbids that, their snapshots, a test under `test/kernel/`.
  - Ordering: after `front-land`, `front-handoff` (`front.ts`), `rotation-threaded` (`flow.ts`).
- `plan-review` — Manifesto Model economics: a weaker model reviews the architect's plan as advisory input (impracticality, unclarity, rule violations, real bugs); the architect considers each finding — ignore on fact judgement, clarify, or change. A second architect launch per iteration is forbidden (ideology), so findings feed the next consult.
  - Done-when: kernel test — after the architect turn, a `plan-reviewer` turn writes `iterations/N/plan-review.md`; the next consult's context pack links it and the architect prompt asks for one `forward` answer per finding; no `plan-reviewer` role configured → no turn, behaviour unchanged.
  - Scope: `src/kernel/{boundary,context-pack}.ts`, `config/process.yaml`, new `prompts/plan-review.md`, one rule in `prompts/architect.md`, their snapshots, a test under `test/kernel/`.
  - Edge cases: the plan reviewer never edits the plan; its turn counts toward the $ brake; only the latest iteration's findings are linked.
  - Ordering: after `front-land` (`config/process.yaml`), `steer-guards` (`boundary.ts`), `doc-drift` (`VARIABLES.md`).

## M11 — Hierarchy level 2

Saga and hierarchy: depth bounded by config (1 the norm, 2 the maximum); a subarchitect per epic with its own plan, completeness check and status summary; a strict escalation chain; the main architect keeps the register in the saga plan; dispatch stays in the one script. Direction: the spike's finding, on its kept branch — `git show factory-task/self/hierarchy-probe:bootstrap/context/hierarchy-probe.md` (§ numbers below are its sections; its path:line refs date from iteration 9, re-check them). Invariants for every M11 task: `depth: 1` behaves byte-identically (the existing suite is the proof); one dispatch loop, one merge queue, one goal lock — needing a second means the seam is wrong; epic consults record step `subarchitect`, so main-only readers (goal status, architect resume, summary paragraph, architect metrics) stay main-only by construction. M11 lands after M10: it shares `types`, `config`, `process.yaml`, `flow`, `boundary`, `pm`, `context-pack` with the M8–M10 chain.

- `hierarchy-probe` (flow `spike`) — Where the kernel assumes one plan and one architect, and the smallest seam set for an epic level.
  - Done-when: `bootstrap/context/hierarchy-probe.md` names, with paths, every single-plan or single-architect assumption (boundary, PM derive, context pack, next/status, records, summary, digest); a register shape inside the main plan; how parks and upscopes route to an epic architect and consolidate upward; the depth knob; a fake-harness test strategy. Optional throwaway PoC under `bootstrap/hierarchy-poc/`.
  - Scope: `bootstrap/context/hierarchy-probe.md`, `bootstrap/hierarchy-poc/**`.
  - Ordering: none.
  - Unknown: everything above — that is the spike.
- `epic-register` — The main plan's architect register (§2) is the only hierarchy state the architect writes; a pure parser makes its grammar and validation testable before any consult exists.
  - Done-when: unit tests — §2's example parses to three rows; each §2 validation item 1–4 yields its finding (depth-1 register with an active `subarchitect` row, unparsable row, missing plan file, absolute or `..` plan path, task naming an unknown or closed epic, duplicate active epic); a plan without the heading yields no rows and no findings.
  - Interface: `parseArchitectRegister(plan: string, ctx: { depth: 1 | 2; tasks: { slug: string; epic?: string }[]; exists(rel: string): boolean }): { epics: EpicRow[]; findings: string[] }` in new `src/kernel/register.ts`; `EpicRow` = `{ epic, architect: "main" | "subarchitect", plan, scope, opened, closed?: { iteration, reason } }`, types local to the module.
  - Scope: new `src/kernel/register.ts`, a test under `test/kernel/`.
  - Edge cases: closed rows stay and are history; validation items 5–6 (post-turn checks, plan ownership) belong to `epic-consult`, not here.
  - Ordering: no upstream (new module, no caller yet); `epic-consult` and `epic-pm` consume it.
- `epic-plumbing` — Ownership fields every later seam reads (§5, §6 rows 1–3): the depth knob, `epic` on task files, `epic` on records.
  - Done-when: config/pre-flight tests — `hierarchy.depth` defaults to 1, 3 is a config error, depth 2 without a `subarchitect` role alias fails pre-flight; task tests — `epic` round-trips through parse/render, changes `materialHash`, an epic task's slug must start with `<epic>.`; a step record of an epic task carries `epic`, a goal task's record has none; gates green with no other test changed.
  - Interface: `ProcessConfig.hierarchy: { depth: 1 | 2 }`; `TaskFile.epic?: string`; `StepRecord.epic?: string`, stamped from the task at write time (a later task-file edit never re-attributes history).
  - Scope: `src/kernel/{types,config,preflight,tasks,store,record}.ts`, `config/process.yaml`, the record write path in `src/kernel/{flow,integrate}.ts`, the `epic` field contract in `prompts/pm.md` and its snapshot, tests under `test/kernel/`.
  - Edge cases: knob justification — depth changes roles and planning semantics, a process-layer concern (manifesto: depth bounded by config); a `base` continuation must stay in its epic unless the main plan names it (§3).
  - Ordering: after `review-upscope`, `plan-review`, `rotation-threaded`, `front-status`, `acpx-preflight-msg`, `empty-diff-cause`; before every other M11 task except `epic-register`.
  - Approach: stamp `epic` in one place on the record path if the store can see the task; else at the existing `flow.ts`/`integrate.ts` writers. If it fights the codebase, choose otherwise and report.
- `epic-derive` — Derived epic state (§4 "Derived predicates"): the boundary needs which epics are due without reading the register.
  - Done-when: derive tests — `TaskState.epic` copied from the task; `State.epics` per epic with `status` (`complete` / `blocked` / `open`) and `consultDue` exactly as §4 defines; a merely pending epic is not due; no epic tasks → `State.epics` empty.
  - Interface: `State.epics: Record<string, { status: "complete" | "blocked" | "open"; consultDue: boolean; slugs: string[] }>`.
  - Scope: `src/kernel/{derive,types}.ts`; `derive-task.ts` only to copy the field; tests under `test/kernel/`.
  - Edge cases: the task reducer is unchanged; a register row with no tasks yet is the boundary's concern (`epic-consult`).
  - Ordering: after `epic-plumbing`; before `epic-consult`, `epic-pm`.
- `epic-packs` — Scoped context packs and the strict chain enforced by filtering (§4 "Strict chain"), not by prompt.
  - Done-when: context-pack tests — an epic pack at `iterations/<n>/epics/<epic>/context-pack.md` lists only that epic's tasks and forwards; the main pack's forwards take records with no `epic` or step `subarchitect`, so an epic implementer's `architect` concern never reaches it; `owner` concerns still reach the summary's owner section; `fyi` never travels; the main pack with no epics is unchanged.
  - Interface: `contextPackRelPath(iteration, epic?)`; the renderer takes an optional epic scope; `PACK_ROLES` includes `subarchitect`.
  - Scope: `src/kernel/{context-pack,agent}.ts` (pack path and pack measurement only), tests under `test/kernel/`.
  - Ordering: after `epic-plumbing`; parallel with `epic-derive`; before `epic-consult`.
- `epic-consult` — The epic boundary (§4 "A consult, step by step"; §2 validation 5–6): per due epic, one subarchitect turn on its own plan and session, before the main architect.
  - Done-when: fake-harness kernel test at depth 2, two `subarchitect` epics, one with a parked task — only that epic consults (record step `subarchitect`, its `epic`), before the main architect turn; an epic `done` is not goal done; a foreign plan edit by either consult is restored as a finding; the main architect closing a row with open tasks, or deciding `done` with an active epic's open task, turns into `blocked` naming the slugs; a malformed register blocks with its findings; depth 1 runs no register read and no subarchitect turn.
  - Interface: role `subarchitect` in `config/process.yaml` with new `prompts/subarchitect.md`; `runEpicBoundary(runtime, epic, state)` in new `src/kernel/epic-boundary.ts`, called only from `boundary.ts`.
  - Scope: new `src/kernel/epic-boundary.ts`, `src/kernel/{boundary,architect-session}.ts`, `config/process.yaml` (role only), `prompts/{subarchitect,_calibration,architect}.md` (register and depth instructions) and their snapshots, tests under `test/kernel/`.
  - Edge cases: epics consult sorted by name; a row with no task files yet is due (first consult writes the epic plan); compaction on `continue` as the main architect; an infra stop ends the launch as for any consult; no mid-iteration epic consult.
  - Ordering: after `epic-register`, `register-guards`, `compact-shared` (`architect-session.ts`), `epic-derive`, `epic-packs`; parallel with `epic-pm` (disjoint modules); before `epic-reporting`.
  - Approach: reuse the main boundary's snapshot/restore and session code by parameterising on (step, plan path, pack path), not by copying it; if that drags `launch.ts` in, report.
- `epic-pm` — The PM derives from the main plan plus every active epic plan (§3, §6 row 8); today `cancelRemovedTasks` would cancel every epic task because one plan lacks its bullet.
  - Done-when: kernel test at depth 2 — tasks derived from an epic plan carry `epic`; dropping a bullet from its own epic plan cancels that task, dropping it from `plan.md` does not; a PM edit to an epic plan is restored; frozen tasks stay global; depth 1 unchanged.
  - Scope: `src/kernel/pm.ts`, `prompts/pm.md` (epic plans variable) and its snapshot, tests under `test/kernel/`.
  - Edge cases: a closed epic cancels nothing implicitly; the PM sees the register through `parseArchitectRegister`, never re-parses it.
  - Ordering: after `epic-register`, `register-guards`, `epic-derive`; parallel with `epic-consult`; before `epic-reporting`.
- `epic-reporting` — The operator's view of epics (§6 rows 9–11, §7 items 7–8): one summary, metrics by epic, status grouping, and the end-to-end proof.
  - Done-when: §7 item 7 (one summary with an `## Epics` section holding each subarchitect's paragraph; `metrics.yaml` `architect.launches` counts the main only, a `subarchitect` bucket keyed by epic; `status` groups tasks by epic; `turnsUsed` excludes `subarchitect` turns) and item 8 end to end (`test/kernel/scenario-hierarchy.test.ts`: one epic parks then its `base` continuation merges after the epic consult, the other merges independently; a second launch closes both rows and the main `done` ends the goal).
  - Scope: `src/kernel/{summary,metrics,digest,dispatch}.ts`, `src/cli/{commands,dispatch}.ts`, tests under `test/kernel/` and `test/cli/`.
  - Ordering: after `epic-consult`, `epic-pm`; before `operator-docs`, `intent-evidence`.
  - Unknown: §9's cost of N+1 architect turns per iteration is unmeasured; the subarchitect bucket is what will measure it.

## M12 — Delivery

- `benchmark-kit` — The goal's done-when compares a fixed benchmark run with the v2 baseline; the operator launches it, the factory owes a reproducible kit. `bootstrap/context/benchmark.md` §3–4 fixes the goal (`omp-workspaces` verbatim; target `agentic-swarm@572a6e0` plus intent tree `1379b0f`) and a v2-shaped reset recipe.
  - Done-when: `bootstrap/benchmark/reset.sh <dest>` builds the target at tree `1379b0f`, runs `factory init` for a goal with the archived INTENT, and prints the `factory run` line; `bootstrap/run/benchmark.yaml` (the cheap tier of `self.yaml`, `limits.iterations: 1`, runtime dirs under `<dest>`) passes pre-flight; a reset in `/tmp` with tree hash and green offline gates is reported as run evidence.
  - Scope: `bootstrap/benchmark/**`, `bootstrap/run/benchmark.yaml`.
  - Edge cases: runs are serial (shared runtime dir, benchmark.md §4); the reset deletes only under `<dest>`; no package test reads these files.
  - Ordering: none.
- `operator-docs` — Goal deliverable: a short usage doc and a short ideology doc for a new operator. `docs/ideology.md` (v3) predates the ladder, holds and rotation; README is a reference, not an onboarding path; the sandbox assumption is documented nowhere.
  - Done-when: `docs/usage.md` takes a new operator from zero to a steered, relaunched goal — install, the three config layers, `init`/`run`/`steer`/`status`/`benchmark`, reading summary and metrics, exit codes, relaunch, promoting a goal line, the sandbox assumption (whole factory inside e.g. bubblewrap; documented, not enforced) — linking README for reference; every command in it run against a fixture goal and reported; `docs/ideology.md` names no mechanism the code lacks and stays principle-level; README's benchmark-rows wording matches `src/cli/benchmark.ts`.
  - Scope: `docs/usage.md`, `docs/ideology.md`, `plugins/software-factory/README.md`.
  - Ordering: after `usage-unknown`, `cli-paths`, `rotation-threaded`, `steer-holds`, `front-land`, `doc-drift`, `incident-surfaces`, `review-upscope`, `plan-review`, `epic-reporting`, `pm-infra-stop`, `front-handoff`, `front-status`, `git-helpers-prune`.
- `intent-evidence` — Goal deliverable: every manifesto `## Intent` bullet maps to evidence or is named as missing with its reason.
  - Done-when: `docs/intent-evidence.md` table — Intent section → promise → code path → evidence (test file and test name, or a record id from the goal's `records/`) → state (`held`, `partial: <gap>`, `absent: <reason>`); every cited test exists and passes; anything not evidenced is `partial` or `absent`, never `held`.
  - Scope: `docs/intent-evidence.md` only.
  - Edge cases: run-only promises (live pi/codex/omp/opencode turns, rotation, the benchmark run) cite records or say `absent: needs operator run`; a wiring-only test is not evidence.
  - Ordering: after the same set as `operator-docs`; parallel with it.

## Historic debt register (relaunch review, iteration 5)

Open, each with its remover: stale integration branch → `sync-base`, `base-follow`; opencode drops stderr → `crash-detail-opencode`; triplicated usage helpers and unknown-vs-$0 → `cost-pricing`; unrecorded subagent cost → `subagent-usage`; dead `core/budget.ts` and no $ brake → `prune-git`, `budget-drain`; stale `journal.ndjson` references and v2 journal writer → `prompt-refs`, `prune-git`; `tier` never resolved → `tier-escalation`; `just-implement` named but undefined → `flow-just-implement`; empty-diff burns review → `empty-diff-skip`; no overflow de-novo path → `overflow-denovo`; implementer/reviewer sessions never compacted → M5.

Closed with reason: record `taskHash` "never read" — it is audit evidence of which task version a turn ran (digest-readable); the same `materialHash` feeds PM reconcile (`src/kernel/pm.ts:50`), and plans are never edited in flight, so mid-iteration drift has no source. Stall exit (advice) — launches are bounded by `limits.iterations` and the architect owns stopping; not Intent. `turnsUsed` counting architect/PM turns — consistent with the $ brake counting every turn; documented semantics, not a defect. Edited pending task reuses its branch — that is crash recovery for an interrupted task; rework of frozen tasks is a new slug by rule. Files over ~250 lines — no repo size rule; not debt.

## Historic debt register (relaunch review, iteration 6)

Open, each with its remover: false $0 for unpriced and crash-sealed turns, raw digest cost → `cost-unknown`; dropped opencode cache-write tokens → `opencode-cache-write`; unscrubbed refusal details → `refusal-scrub`; untested omp resume hand fix → `omp-resume-test`; misclassified base-follow failures, missing merge identity, dead abort, silent CLI cause → `base-follow-fixes`; duplicated pack path → `pack-path-single`; stale README / KERNEL0 / digest prompt / lock docstring → `docs-truth`; acpx findings stranded on a spike branch with three proven errors → `acpx-doc`; dead `minFreeDiskMb` → `prune-git`.

Closed with reason: low-disk guard — not Intent; removing the dead v2 guard loses nothing the kernel ran, and a full disk surfaces as an infra stop with details. Stray frontmatter and leaked model text in a PM-written task file — one of 18 files, the spike it fed finished correctly; it is evidence against the PM alias (promote on recurrence, manifesto Model economics), not a kernel defect. Base commits stranded on `factory-v3` (store rehydration fix) — no sync task: a squash-synced base never becomes an ancestor, so each sync task would buy the next conflict; the kernel's `base-follow` brings them in once the goal line is promoted with a real merge. Steer left in inbox / scout cost unrecorded (iteration-5 digest) — the steer is processed; scout cost → `subagent-usage`.

## Historic debt register (relaunch review, iteration 7)

Open, each with its remover: opaque non-crash stops (bad opencode model via `provider.no-route`, omp auth/overflow) → `refusal-scrub`, widened. Everything in the iteration-6 register stays open with its remover; none ran.

Closed with reason: unpromoted goal line and stranded base fixes — the owner merged `factory/self` into `factory-v3`; both now point at one commit, so `base-follow` starts from no divergence. A test reading `bootstrap/run/self.yaml` from outside the package — fixed by the owner on base; recurrence is prevented by the new package-hermetic tests rule. PM turn with no outcome (iteration 6) — one failure on an alias that succeeded in iteration 5; it is owner run-config evidence (promote the PM alias on recurrence), not a kernel defect.

## Historic debt register (relaunch review, iteration 9)

Open, each with its remover: the tier never reaches the turn, admission vs turn disagreement → `turn-target`; unfinished checks prune (`types.ts`, `minFreeDiskMb`) → `prune-checks-types`; v2 core leftovers without a reachability proof → `prune-sweep`; acpx dead-session loop on a setup NO_SESSION, acpx-adapter review leftovers → `acpx-session-loss`; report-less usage priced $0, unpriced attempts, `empty-diff` missing from loop incidents, metrics negative tests, stale README metrics → `usage-unknown`; `iterationUsd` cast seam and budget-drain test gaps → `limits-usd-typed`; infra details dropped from operator stop text, false drain docstring → `stop-details-visible`; triplicated `withDetails`, stale details doc, untested omp guard branch, opencode export fallback comment → `harness-hygiene`; triple summary path, unchecked benchmark goal dir, untested `resolveRuntimeDir` branch, false lock docstring → `cli-paths`; PM edits a frozen spike every iteration → `pm-frozen`; task sessions compacted at resume start and resumed across harnesses → `session-end-compact`; README benchmark-rows wording → `operator-docs`. Iteration-6 items without a merged remover: no overflow de novo → `overflow-denovo`; dead git leaves and v2 journal → `prune-git`.

Closed with reason: tests reading outside the package (second instance, `acpx-preflight.test.ts`) — owner fix `745c467`, and the task gate now runs on a package-only export (`scripts/gates.sh`, `d405fd4`), so an outside read fails the task's own gate. Low-disk guard question (prune-checks review) — not Intent, decided: no guard. `bootstrap/context/kept-modules.md` stale — a bootstrap snapshot; `prune-sweep`'s reachability check supersedes it as the authority. Failed architect outcome 00226 — the turn waited on scouts and edited nothing; no kernel defect.

## Historic debt register (relaunch review, iteration 10)

Open, each with its remover: parked tier and checks-prune work unlanded → `turn-land`, `prune-checks-land`; `base:` continuations start stale and skip review of carried commits → `parked-base-sync`; misleading `empty-diff` cause after red checks → `empty-diff-cause`; pre-flight scratch swept by the gate suite → `probe-scratch-path`; acpx missing-binary wording → `acpx-preflight-msg`; `resolveRoleAlias` re-export (turn-target r1) → `turn-land`; `reset.sh` dest-inside-checkout delete and ambient TMPDIR → `benchmark-guards`. Every iteration-9 item not listed here keeps its remover.

Closed with reason: `acpx-preflight.test.ts` outside read (turn-target r1 report) — fixed on base by `745c467`, the r1 branch predated it. `test/cli/cli.test.ts` stale-lock flake (prune-checks-types r1) — one occurrence, green on rerun; not debt until it repeats. harness-hygiene r1 review findings (`opencode/usage.ts` comment, 501-char details bound) — round 2 approved.

## Historic debt register (relaunch review, iteration 11)

Code is unchanged since the iteration-10 review; every item there keeps its remover. New: a PM turn without a usable outcome blocks the iteration and needs the owner to re-route the PM by hand (iterations 6 and 10; `steer-pm-ladder`) → `pm-ladder`.

## Historic debt register (relaunch review, iteration 12)

Open, each with its remover: parked front ladder, its e2e test and front-session resume → `front-land`; rotation unreachable without the iteration threaded, resume portability against the static harness → `rotation-threaded`; unreviewed core sweep, test-only `src` files, unreachable `core/shutdown.ts` half, missing shutdown regression test → `sweep-land`; PM ladder leftovers (infra stop climbs, write-only `mandate`, unreachable fallbacks, untested base-tier `failed`), cancelled tasks not marked read-only → `pm-ladder-tidy`; steer turn unguarded, zero-settle polls, malformed hold throws, steers in the boundary→dispatch window → `steer-guards`; brake undercounts retried and fallback attempts → `brake-priced`; conflict-merge turn never compacts, duplicated compaction guard → `compact-shared`; overflow and empty-diff incidents invisible in summary and benchmark, stale `SummaryInput` comment → `incident-surfaces`; register main-row path and unterminated fence → `register-guards`; `VARIABLES.md`, README prices/holds/steering, `types.ts` `base` comment, `tmp-repo.ts` comment → `doc-drift`. README benchmark-rows wording stays with `operator-docs`.

Closed with reason: rollback before an escalated `blocked` (pm-ladder review) — intended; the rungs and the self-contained question carry what the architect needs. `pricedRecord` treating a non-reporting attempt as absent — every current zero attempt is a call that never ran (acpx, omp); a new adapter states its usage contract in its own task. `bootstrap/context/kept-modules.md` stale (prune-checks-land review) — a bootstrap snapshot that prune tasks never edit; `sweep-land`'s committed reachability test becomes the authority.

## Historic debt register (relaunch review, iteration 13)

Open, each with its remover:
- PM infra stop does not end the iteration (parked `pm-ladder-tidy`) → `pm-infra-stop`.
- `compactArchitect` alias re-export (spot check) → `pm-infra-stop`.
- Front resolves its `pm` fallback through the `tier` argument → `rotation-threaded` (option renamed `alias`).
- Front-session resume unreachable and covered only by a fabricated record; pack handoff enforced as a brief line → `front-handoff`.
- Front-landed goal derives `active` → `front-status`.
- Test-only exports in `src/core/git/{commit,merge}.ts` → `git-helpers-prune`.

Closed with reason:
- Steered front goal: the architect gets no class signal (front-land review, fyi). The pack's task table lists the pending front task, and the architect's completeness check must account for it; the class routes the front path, it is not authority over a steered goal.
- Depth-1 register skips the main-row plan check (register-guards review). Every register check is skipped at depth 1 by design: no epic plan is consulted there. `epic-plumbing`'s depth knob gates consumption.
