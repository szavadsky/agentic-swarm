# What the user wants (merged: hand-committed manifesto + owner verdict)

Source of truth: the owner manifesto as hand-committed (`d10f5bb`, 218 lines), merged with the owner's 2026-11-13 review verdict (hierarchy required after B1–B5; B1–B5 first, test first; scope-as-prediction with the v1 merge ladder; done = shippable and tested; landing stays manual). Intent is not reworded here; every item is judged against what iteration 13 built.

Status words: **built** (works, has evidence), **friction** (built but fights back in practice), **deviation** (built differently from the text), **not built** (missing). Links are relative to the v3 worktree root.

---

## Preamble: what the factory is

> An orchestration framework on top of harnesses that delivers up to a saga — token-efficient, slop-free, steerable or autonomous, scalable from a trivial edit to a saga. One goal may span many epics and tens of tasks per iteration, across multiple resumable iterations; no hard-coded size ceiling.

**Built, with friction.** Thirteen iterations merged 54 tasks through the full loop — one example run: [iteration 11 summary](.factory/artifacts/self/iterations/11/summary.md) (18 merges) — with no merge conflict inside the factory and no gate failure after a merge. Resumable iterations work: the state is derived idempotently from append-only records ([derive.ts](plugins/software-factory/src/kernel/derive.ts)), so calling `derive` again is the crash-recovery story.

What does not yet match the paragraph: **no epic has ever run** (one goal, one architect, 54 tasks — the hierarchy that would prove "many epics" is the pending [`epic-*` chain](.factory/artifacts/self/plan.md)), and **no sizing limit was ever tested** (the plan grew to 430 lines without an overflow stop; nothing proves tens of tasks per iteration — iteration 11 ran them one at a time, see Friction 1 below). So: the loop exists and is exercised, at single-epic, single-digit-parallelism scale.

Next: the owner's dashboard requirement lands in the intent; then the hierarchy chain is the proof a second architect gets focused context. Widening parallelism is gated on the scope-scheduling fix (Friction 1).

---

## Escalation ladder

### Classify: trivial / task / bigger

> One cheap-but-capable agent classifies the goal. For a task it defines the scope. How big "bigger" is — that's the architect's call.

**Built.** The front agent classifies and writes one task plus scope ([front.ts](plugins/software-factory/src/kernel/front.ts), [prompts](plugins/software-factory/prompts/front.md)); bigger goals enter the architect boundary. Covered by [front.test.ts](plugins/software-factory/test/kernel/front.test.ts). Example live run: the [front-status task](.factory/artifacts/self/iterations/13/summary.md) derived done from one source on the front path in iteration 13. In the self-run the classifier runs on beam-free (see [run config](bootstrap/run/self.yaml)).

Next: none — works. The pending [rotation-threaded](.factory/artifacts/self/plan.md) row is about rotating the front's harness across iterations, not about classification itself.

### Trivial: implemented without the architect

> Trivial: the same agent implements.

**Deviation, forced by the machinery.** The front runs in the goal checkout and the implementer in a task worktree; a session resumes only in the same working directory ([flow-context.ts](plugins/software-factory/src/kernel/flow-context.ts)). So "the same agent" cannot literally hold: what was built is the same model alias with a fresh session ([front-handoff](.factory/artifacts/self/iterations/13/summary.md), [flow.ts](plugins/software-factory/src/kernel/flow.ts)). The outcome is the same from the owner's chair — trivial work lands without an architect turn — but the mechanism is de-novo re-implementation, not continuation.

Next: none required. If the wording matters to you, "the same class of agent implements" would describe what runs. The task path this needs: none pending — it works as re-implementation.

### Task review escalates to bigger when the scope was wrong

> Task: does not reach the architect. Task review auto-escalates to "bigger" when the real scope exceeds the defined one.

**Not built.** The reviewer prompt has no upscope verdict ([reviewer.md](plugins/software-factory/prompts/reviewer.md)), and an implementer upscope only parks the task ([flow.ts](plugins/software-factory/src/kernel/flow.ts)). It is a planned task: [`review-upscope`](.factory/artifacts/self/plan.md) — on a task-class goal, a reviewer or implementer `upscope` parks the task with cause `upscope`, sets `class.yaml` to `bigger`, and the next iteration runs the architect.

Next: build `review-upscope` after the B1–B5 milestone. It is the correction mechanism the ladder promises ("everyone can make a mistake; escalation corrects it").

### Context pack by the same agent, no separate triage steps

> Task or bigger: the same agent prepares the context pack — current status, infra, relevant code facts. No separate triage/context-pack/infra steps: same context, same agent.

**Built on first launch; deviation on relaunch.** The front agent prepares the pack the first time ([front.ts](plugins/software-factory/src/kernel/front.ts)); on relaunch the script renders it deterministically ([boundary.ts](plugins/software-factory/src/kernel/boundary.ts), [context-pack.ts](plugins/software-factory/src/kernel/context-pack.ts)). There are genuinely no separate triage steps — one front turn, one pack.

Next: none. The relaunch render is the cheaper correct behavior; the text's "same agent" holds only for the first launch.

---

## Iteration

### One architect engagement + orchestration to exhaustion

> An iteration is one architect engagement plus the orchestration it launches: the architect plans; the script orchestrates all tasks until they are exhausted or blocked. Each architect consult starts a new iteration.

**Built.** One launch is one architect turn plus dispatch to exhaustion ([launch.ts](plugins/software-factory/src/kernel/launch.ts), [dispatch.ts](plugins/software-factory/src/kernel/dispatch.ts)); covered end to end by [integration-e2e.test.ts](plugins/software-factory/test/kernel/integration-e2e.test.ts). Every iteration summary shows the shape — e.g. [iteration 13](.factory/artifacts/self/iterations/13/summary.md): one architect turn, then dispatch of everything planned.

Next: none.

### Completeness check at every consult; sub-epics get their own

> Every consult begins with a completeness check: is the work truly blocked or does it make sense to continue, and what is incomplete or must be redone. Sub-epics get their own completeness check.

**Built for the single architect; not built for sub-epics.** The boundary turns carry the check via the architect prompt ([architect.md](plugins/software-factory/prompts/architect.md)), exercised every iteration. But there is no sub-epic consult path — the architect register parser exists with no caller ([register.ts](plugins/software-factory/src/kernel/register.ts), pinned by [reachability.test.ts](plugins/software-factory/test/reachability.test.ts)).

Next: the pending hierarchy chain ([`epic-consult`](.factory/artifacts/self/plan.md) and sequels) builds the per-epic consult, with the completeness check inside it. Nothing to do before hierarchy lands.

### Mid-iteration consult is the measured exception; spikes don't end the iteration

> Consulting the architect mid-iteration is the exception: measured, and optimized during bootstrapping. A landed spike does not end the iteration — the iteration still runs to exhaustion.

**Half built, half deviated.** The spike half works: a landed spike satisfies dependents at once and the iteration runs to exhaustion ([dispatch.ts](plugins/software-factory/src/kernel/dispatch.ts), [derive.ts](plugins/software-factory/src/kernel/derive.ts)). The "measured exception" half is not built: there is no mid-iteration consult call site and no consult metric — and where the text says "dependents idle until the boundary", the code dispatches dependents in the same iteration once a spike lands — the code's behavior is the better one.

Next: the code's behavior (dispatch dependents at once) is the better one — no owner decision needed unless you want idling. The missing piece is only the measurement: a consult counter in [metrics](plugins/software-factory/src/kernel/metrics.ts), a small task once the milestone queue clears.

---

## Model economics

### Architect does architect work only, from a prepared pack

> Architect-tier models do only what a human architect does: intent into plans, directional interfaces, tradeoffs above task level. Called with a prepared context pack; writes no code beyond key interfaces and no verbose documents. The plan is a single markdown file, never schema-consistent files.

**Built.** The pack is rendered for every boundary turn ([context-pack.ts](plugins/software-factory/src/kernel/context-pack.ts)); the plan is markdown the architect edits in place; the PM derives the formal files ([pm.ts](plugins/software-factory/src/kernel/pm.ts)). Thirteen architect turns produced thirteen plan edits — representative output: the [iteration 13 summary's architect section](.factory/artifacts/self/iterations/13/summary.md) (new milestone M16, debt register, re-pointed orderings). The architect never touches schema files by construction: it has no tool that writes them.

Friction: the architect is 74% of the $21.25 bill ($1.58 per turn that ran), because one turn runs per launch whatever the launch produces. That is the price of this item working as specified, not a defect in it — the fix is fewer wasted launches (P4 in the review), not a different architect.

Next: none on this item. Cost-side fixes live under Stopping/debt and the B-rows.

### Weaker reviews stronger, advisory

> A weaker model can still usefully review the architect's plan: impracticality, unclarity, rule violations — real bugs are not unusual. Advisory input, not a veto.

**Not built.** There is no plan-review role or step ([process.yaml](plugins/software-factory/config/process.yaml) has no such flow). Planned as [`plan-review`](.factory/artifacts/self/plan.md): after the architect turn, a `plan-reviewer` turn writes `iterations/N/plan-review.md`, linked from the next pack.

Next: build `plan-review` in the milestone queue. It is cheap insurance on the most expensive turn in the system.

### The ~50x cost ratio; quota not primary

> Architect-tier costs ~40–80x the cheap capable tier. Optimize overall cost on that ratio (~50x); quota management is not a primary purpose.

**The ratio was never measured; the binding constraint turned out to be quota, not price.** The run has per-role usage records with cache fields ([metrics.ts](plugins/software-factory/src/kernel/metrics.ts), [pricing](plugins/software-factory/src/kernel/pricing.ts)), but 162 of 172 records store $0 cost and the implementer/reviewer turns that were supposed to be free hit 432 quota rejections and finished on the paid fallback — see the [review's cost section](bootstrap/reports/review-2026-11-13/REVIEW.md). So the experiment's finding, with the evidence: on the free tier, the quota wall arrives before the price ratio matters. The ~50x number itself is untested either way — no per-model cost comparison was ever run.

Next: two small things. First, instrument per-model cost on the fallback turns so the ratio can be read off instead of asserted. Second, a free-tier throttle in dispatch (today the dispatcher keeps admitting turns into quota walls). Neither changes the intent — they measure it.

### Escalation to an expensive implementer, architect-called, minimal

> Escalation to an expensive implementer-tier model only when a task goes wrong or needs a highly non-trivial class/PoC; the architect calls it, in advance or on review. Minimize its use.

**Built for the PM; parked for tasks.** The run config carries the escalation alias (Sonnet through omp, [self.yaml](bootstrap/run/self.yaml)), and the PM ladder climbs to it on failure ([pm.ts](plugins/software-factory/src/kernel/pm.ts)). But the task-tier escalation ([`tier-escalation`](.factory/artifacts/self/plan.md)) has been parked since iteration 7: an escalated task still runs on the base alias, "on review" cannot work because review keeps the reviewer alias, and the escalation alias has never run a task turn.

Next: unpark `tier-escalation` after B1–B5. The "minimize its use" half already holds trivially — zero task turns have escalated.

### Batched consults; expensive models rarely

> Consults are batched: delayed until non-blocked tasks are exhausted — the iteration boundary. Expensive models are used rarely and only when necessary.

**Built.** The boundary runs after dispatch drains ([launch.ts](plugins/software-factory/src/kernel/launch.ts)). Thirteen launches, thirteen architect turns, no mid-iteration consults — the batching held in every run.

Next: none.

---

## Context economy

### Same context: same agent

> Same context: same agent. Different context: different agent.

**Built.** Roles resolve per step with session resume inside the role ([flow-context.ts](plugins/software-factory/src/kernel/flow-context.ts)); flows are separate steps in config ([process.yaml](plugins/software-factory/config/process.yaml)). Covered by [session-compact.test.ts](plugins/software-factory/test/kernel/session-compact.test.ts).

Next: none.

### Session reuse; portability graph across harnesses

> Reuse stored agent sessions within one harness. Across harnesses portability is directional and not always feasible: a graph records which way a session can move. Portable → continue from the pre-compacted session. Not portable → de novo, with the context pack and links to artifacts.

**Built within one harness; the graph is not built.** Same-harness resume with compact-at-end works and is tested ([flow.ts](plugins/software-factory/src/kernel/flow.ts), [boundary.ts](plugins/software-factory/src/kernel/boundary.ts)). Across harnesses there is no graph — `portable()` returns true only for same-harness ([harness/types.ts](plugins/software-factory/src/harness/types.ts)) — so everything cross-harness silently takes the de-novo path, and the de-novo task prompt does not even receive the pack path (the pack reaches architect/PM turns only).

Friction with a concrete example: a stale omp session crashed the architect turn at startup in iterations 2, 3 and 4 (records `00006`, `00009`, `00012` under [.factory/artifacts/self/records](.factory/artifacts/self/records)) — three paid launches lost to resume handling, the exact failure a portability record would route around.

Next: the minimal graph — record (from, to, ok) per resume attempt and consult it before resuming — plus passing the pack path to de-novo implementer prompts. Small tasks, after the milestone queue. Full cross-harness transcript import stays out of scope: no harness pair in this build supports it.

### Compact at end; tree summaries on cold cache; trimming ≠ handoff

> Compact at the end of a session; reload the compacted session for consult, review, or next iteration. Use tree/branch summaries when a hot cache is unavailable or impractical. Compaction is transcript trimming — even server-side — not a handoff summary; the two serve different reuses and must not be confused.

**Built except tree summaries.** Compact-at-end with reload is in the flow and tested ([flow.ts](plugins/software-factory/src/kernel/flow.ts), [session-compact.test.ts](plugins/software-factory/test/kernel/session-compact.test.ts)); trimming-vs-handoff is respected by construction. Tree/branch summaries don't exist (`Caps.fork` unused) — no cold-cache path was ever needed in thirteen iterations.

Next: none until a cold resume actually hurts. The trigger is observable: a consult turn paying full input price on a cold session.

### PM turns the plan into tasks; architect owns the plan

> Plans are the architect's markdown, edited in place — never in flight; the architect owns them. A cheap PM turns the plan into tasks and lines: task files, DAG, dispatch sets, resolving whatever cannot be derived deterministically. The PM is a paper-pusher, not a peer. Tasks are named by short immutable slugs. Never force whole-plan re-issue through a strict schema.

**Built — this is the best-exercised machinery in the system.** Thirteen PM turns derived the task files every iteration ([pm.ts](plugins/software-factory/src/kernel/pm.ts), [tasks.ts](plugins/software-factory/src/kernel/tasks.ts)); the plan is edited in place by the architect only; slugs are immutable; reconciliation is plan-mention plus material hash (no whole-plan re-issue anywhere). Covered by [pm.test.ts](plugins/software-factory/test/kernel/pm.test.ts).

Friction: two PM turns (iterations 6 and 10) produced no usable outcome and ended the launch after the architect had been paid (record [`00290-i10-pm-r1`](.factory/artifacts/self/records/00290-i10-pm-r1)). The fix is built and merged: the PM retry ladder climbs to the escalation alias with rollback between rungs ([pm.ts](plugins/software-factory/src/kernel/pm.ts)), and the PM alias was promoted to deepseek. Iteration 13's PM turn ran clean.

Deviation on one phrase: "the orchestrator reconciles execution state from a semantic diff" — what runs is plan-mention matching plus a content hash, not a semantic diff. It works; the phrase has no implementation behind it.

Next: none on the mechanism. The ladder needs its first live escalation to prove the climb path — observable, not buildable.

### Status aggregated by the script, idempotently; pack prepared from it

> Status is aggregated by the script from structured outputs / YAML artifacts, idempotently; the context pack is prepared from it.

**Built.** `derive` reduces records to state ([derive.ts](plugins/software-factory/src/kernel/derive.ts)); the pack renders from that state ([context-pack.ts](plugins/software-factory/src/kernel/context-pack.ts)). Idempotency is the crash-recovery story and it held across kills in testing.

Next: none.

---

## Saga and hierarchy

### Bounded depth; subarchitect on demand; untouched levels not invoked

> Hierarchy depth is bounded by config: 1 architect level is the norm, 2 the expected maximum. A subarchitect is split off only when the size/complexity of architecture context demands focused context. Untouched levels are not invoked.

**Not built — and this is the verdict's main build item.** There is no hierarchy config key, no subarchitect role, no epic→architect mapping. What exists is the register parser with no caller ([register.ts](plugins/software-factory/src/kernel/register.ts), [reachability.test.ts](plugins/software-factory/test/reachability.test.ts)) and the plan: [`epic-plumbing`](.factory/artifacts/self/plan.md) (depth key, ownership fields), then `epic-derive`, `epic-packs`, `epic-consult`, `epic-pm`, `epic-reporting`.

Your verdict resolves the open question the review raised: hierarchy is required, the dashboard requirement you're adding to the intent is the forcing case, and it builds right after the B1–B5 milestone. The "only when context demands" trigger stays — the dashboard epic is expected to be the first demand.

Next: build the chain in plan order after B1–B5. No experiment needed; the requirement is yours.

### Strict chain: consults go to the responsible architect

> Strict chain: task-level consults go to the architect responsible for that epic. The subarchitect filters and consolidates escalations into one brief upward; implementers/reviewers never reach past their architect.

**Not built — same chain.** One architect exists, so there is no chain to be strict about. The plan row that carries this is [`epic-packs`](.factory/artifacts/self/plan.md) (scoped packs, chain enforced by filtering).

Next: same as above — part of the hierarchy build.

### Per-subarchitect summaries; dispatch stays in the script; register in the saga plan

> Each subarchitect owns the status summary of his iteration. Task dispatch stays in the single script. The main architect picks the subarchitect set per iteration; the register is maintained as part of the saga plan.

**Dispatch half built; the rest waits on hierarchy.** Dispatch and the single merge queue are centralized ([dispatch.ts](plugins/software-factory/src/kernel/dispatch.ts), [integrate](plugins/software-factory/src/kernel/merge-attempt.ts)) and stay that way — nothing in the hierarchy plan moves them. Per-architect summaries, the set-picking, and the register are [`epic-consult`](.factory/artifacts/self/plan.md) / [`epic-reporting`](.factory/artifacts/self/plan.md) work.

Next: none on dispatch. The rest rides the hierarchy chain.

### One script owns everything through a capability-aware harness abstraction

> One orchestration script owns everything down to task level — through a harness abstraction that knows each harness's capabilities and orchestrates the chain of architects accordingly. It does not drive every harness directly and uniformly.

**Built for the single level; the chain half waits on hierarchy.** The script owns dispatch, merge, derive, and the boundary through the harness adapters ([harnesses.ts](plugins/software-factory/src/cli/harnesses.ts), capability flags in [harness/types.ts](plugins/software-factory/src/harness/types.ts)). Orchestrating a chain of architects has no code because there is no second architect.

Friction worth knowing before the chain is built: architect scouts run as subagents inside the omp session with no record, cost line, turn limit, or crash recovery (`Caps.subagents` is declared and unused) — and in iteration 8 the architect turn ended waiting for its scouts with no plan edit (record `00226` under [.factory/artifacts/self/records](.factory/artifacts/self/records)). Subarchitects on the same unrecorded path would inherit the blindness. The fix — record scout turns with cost and limits — is small and should land before the chain, not after.

Next: scout-turn records first (small), then the chain.

---

## Funnel: only the remarkable

### implementer → reviewer → architect → [top architect] → human

> implementer → reviewer → architect → [top architect] → human. Each stage filters.

**Built except the bracketed stage.** Task flows run implement→review as separate steps ([flow.ts](plugins/software-factory/src/kernel/flow.ts), [process.yaml](plugins/software-factory/config/process.yaml)); the architect filters at the boundary; the summary carries owner concerns ([summary.ts](plugins/software-factory/src/kernel/summary.ts)). There is no top-architect entity — the term has no definition and no code.

Next: your call, not the factory's — either the hierarchy build defines it (the main architect over subarchitects fits the bracket) or the word drops from the text. Flagged for the dashboard-intent pass.

### Perspective gap: separate steps, not one agent

> Each stage sees a different scope. That perspective gap is the point — which is why the task flow uses separate steps rather than one agent doing everything.

**Built.** Flows are separate steps with separate prompts and contexts ([process.yaml](plugins/software-factory/config/process.yaml), [prompts](plugins/software-factory/prompts/architect.md)). Thirteen iterations ran this shape without exception.

Next: none.

### Reviewer filters trivia; decides what's worth architecture attention

> Implementers over-report trivia; the reviewer decides what is different/additive to the plan and worth architecture attention.

**Built at prompt level.** The reviewer prompt carries the filtering rule ([reviewer.md](plugins/software-factory/prompts/reviewer.md), calibration in [_calibration.md](plugins/software-factory/prompts/_calibration.md)). No test asserts filtering happened — it's a judgment call per turn, visible in review outcomes across the records.

Next: none, unless you want a spot-check: sample review outcomes in [.factory/artifacts/self/records](.factory/artifacts/self/records) and see whether trivia reaches the summaries. The summaries are readable; the filter visibly works.

### Reviewer pairing per flow; no wave review; completeness check is the integration point

> Reviewer pairing is per task-type flow in config; there is no separate integration "wave review" — the iteration's completeness check at the next architect consult is the integration point. The reviewer's prompt and context differ from the implementation context.

**Built, with one tailored half missing.** Pairing is per flow in config; there is no wave entity; the boundary completeness check integrates. But the reviewer's prompt and context are not actually tailored per focus — one reviewer prompt serves all flows ([reviewer.md](plugins/software-factory/prompts/reviewer.md)).

Friction, concrete: finished work waits a full iteration for the next consult even when its dependents could run — 7 of 8 parks through iteration 12 held finished or diagnosed work, and 5 of them merged later through land-only tasks (`turn-land`, `prune-checks-land`, `front-land`, `sweep-land`, `pm-infra-stop` — all in the iteration summaries). The code already satisfies in-iteration dependencies ([derive.ts](plugins/software-factory/src/kernel/derive.ts)); only architect-planned follow-ups wait.

Next: tailor the reviewer prompt per flow (small, planned as part of the N12b decision row). The land-only path already exists — no build needed; the verdict's scope change (below) shortens the wait further.

### Concerns and remarkables propagate; calibration in config; files stay on disk

> Concerns and remarkables propagate up the chain; calibration lives in config prompts: FYI-only / blocked-by-architect / blocked-by-user. Files stay on disk; the architect can scout/read instead of receiving pasted content.

**Built, with a vocabulary deviation.** Propagation works: concerns are recorded ([record](plugins/software-factory/src/kernel/record.ts)), packed ([context-pack.ts](plugins/software-factory/src/kernel/context-pack.ts)), and surfaced in summaries ([summary.ts](plugins/software-factory/src/kernel/summary.ts)); the architect reads by path. But the code uses `fyi` / `architect` / `owner`, not the three words in the text — same three-way split, different labels.

Friction: summaries run 18–34 KB and the park section reprints landed parks cumulatively, so "never spam" strains at the seams — readable, but the guaranteed-remarkable sometimes reads `- none` under its own heading.

Next: align the labels (rename either side; the code's three are fine) and cap the park section to unlanded parks. Two small tasks.

---

## Uncertainty and spikes

### Risk first; milestones defer detail until the spike lands

> Risk, uncertainty, complexity first. A milestone may defer detail until a spike lands; unblocked work proceeds in parallel. Orchestrate all.

**Built at prompt level; no milestone entity.** The architect prompt carries risk-first and spike-deferral ([architect.md](plugins/software-factory/prompts/architect.md)); parallel dispatch of unblocked work is the dispatcher's normal shape ([dispatch.ts](plugins/software-factory/src/kernel/dispatch.ts)). "Milestone" has no code entity — it lives in the plan as headings (M2, M11, M16…).

Next: none. Milestones as plan headings have sufficed for thirteen iterations; promote to an entity only if a dispatch rule ever needs to read one.

### Architect issues directable work plus spikes

> The architect issues what it can direct now plus the spikes: T1, T2 and the spike, then next steps.

**Built.** Spike is a task kind ([tasks.ts](plugins/software-factory/src/kernel/tasks.ts), [process.yaml](plugins/software-factory/config/process.yaml)); spikes dispatch and land without ending the iteration. Iteration 11 ran the front-ladder spike path; iteration 12's plan deferred detail on parked work the same way.

Next: none.

---

## Stopping and debt

### Incentivized to stop; stop criteria in the prompt

> The architect is incentivized to stop: goal met → done. Stop criteria, stated in the prompt: goal met, or nothing meaningful left without owner feedback; no new technical debt, no slop, clean-code principles met. A goal's own formal acceptance criteria apply when it has them.

**Built as prompt; the `done` predicate doesn't enforce it.** The architect prompt carries the criteria ([architect.md](plugins/software-factory/prompts/architect.md)); the script's done check is structural (tasks exhausted/blocked), not a debt gate. Thirteen iterations all ended `in-progress` — which is correct each time (work remained), but nothing in code would stop a goal that stopped converging.

Your verdict redefines this item's target: done = "maintainable code satisfying repo rules, shippable, tested" — no new technical debt, no known bugs, W-rows answered; wording/structure debt may close by sweep per milestone. That supersedes the review's "material debt" proposal.

Next: make `done` see open debt (fail or drain at goal end while debt is open) and print the distance (pending, parks, open debt) at the top of every summary. Two tasks, queued behind B1–B5 — they are the enforcement of your done definition.

### Debt review on relaunch; no new debt

> On relaunch, the architect first reviews the implementation for debt and gaps, then plans. Historic debt may need addressing to enable the goal; the rule is: no new debt created by the goal.

**Built and exercised.** Every relaunch boundary runs the digest plus the architect's debt review ([boundary.ts](plugins/software-factory/src/kernel/boundary.ts), [digest.ts](plugins/software-factory/src/kernel/digest.ts)); debt registers open and close across iterations (121 items opened, 103 closed through iteration 13 — see the [review evidence](bootstrap/reports/review-2026-11-13/REVIEW.md)).

Next: none on the review. Enforcement is the previous item.

### Temporary debt authorized, removed by goal end

> The architect may authorize temporary technical debt; removal by the end of the same goal.

**Recorded but not enforced.** Debt is recorded and listed ([record](plugins/software-factory/src/kernel/record.ts), [summary.ts](plugins/software-factory/src/kernel/summary.ts)); nothing checks removal at goal end — `done` doesn't look at debt at all.

Next: same two tasks as the stop-criteria item. One build covers both.

### Bounds: iterations, review cycles, $/time; drain on budget hit

> Bounds: a launch limits iterations; review cycles are bounded; optional $/time limits per iteration. On a per-iteration budget hit: drain — no new dispatch, in-flight work finishes within its own bound.

**Built, with two holes.** Iteration and turn limits, review rounds, and the drain path exist ([config.ts](plugins/software-factory/src/kernel/config.ts), [dispatch.ts](plugins/software-factory/src/kernel/dispatch.ts), [budget-drain.test.ts](plugins/software-factory/test/kernel/budget-drain.test.ts)). The holes, both reproduced: a first interrupt doesn't stop dispatch from admitting queued tasks ([repro-e4.test.ts](bootstrap/reports/review-2026-11-13/repro/repro-e4.test.ts) — three more tasks started and merged after the signal), and a timed-out step is retried de novo on every relaunch without consuming the turn budget. No subscription-quota knob exists; time is unbounded by default (iteration 7 was killed by hand, iteration 11 ran 6.2 h).

Next: B4 (drain on first signal) is in the B1–B5 milestone. The timeout-budget hole and the quota knob queue behind it.

---

## Steering and autonomy

### Reversible assumptions, remarkable notes, owner steers

> Config-driven. The architect records a reversible assumption, notes it as remarkable, and continues; the user steers/overrides. The process-config prompt defines what the architect may decide alone vs what blocks on user input.

**Built.** Calibration prompt ([_calibration.md](plugins/software-factory/prompts/_calibration.md)), remarkables in every summary ([summary.ts](plugins/software-factory/src/kernel/summary.ts)), steers processed through the mailbox. Your own steers through this run (beam effort, PM ladder, the review verdict) all flowed through this path.

Next: none.

### Mailbox, not ACK; guaranteed remarkable per iteration

> The user drops files to steer; the user sees remarkable notes — at least one remarkable entity per iteration (the iteration summary is the guaranteed one), never spam.

**Built.** Mailbox with inbox/outbox/processed ([mailbox.ts](plugins/software-factory/src/kernel/mailbox.ts)); the summary always writes, including on crash paths ([summary.ts](plugins/software-factory/src/kernel/summary.ts)). Every steer in this run got an architect response in the outbox.

Friction: the guaranteed remarkable sometimes reads `- none` under its own heading, and one unhandled case is reproduced — a steer whose text duplicates an earlier one ("yes") is silently dropped ([repro-e10-steer-dedupe.test.ts](bootstrap/reports/review-2026-11-13/repro/repro-e10-steer-dedupe.test.ts)).

Next: dedupe-by-id instead of dedupe-by-text (small, queued with the mailbox batch). The `- none` wording is a one-line fix in the summary template.

### Steer handling: PM structures, in-flight parks, architect decides

> The script monitors the mailbox at startup and during a run. A cheap PM agent converts each steer into structured artifacts and decides what it blocks. In-flight tasks finish and park unmerged; pending ones hold; the consult waits for the unblocked remainder. Every steer goes to the architect, marked processed with the response in the outbox.

**Built.** Startup scan plus in-run polling ([boundary.ts](plugins/software-factory/src/kernel/boundary.ts), [dispatch.ts](plugins/software-factory/src/kernel/dispatch.ts)); steer-PM turn ([pm.ts](plugins/software-factory/src/kernel/pm.ts)); holds ([mailbox.ts](plugins/software-factory/src/kernel/mailbox.ts)); park-on-steer ([dispatch.ts](plugins/software-factory/src/kernel/dispatch.ts)). The verdict steer for iteration 14 sits in the inbox now and the next boundary will read it.

Deviation: the code parks only the held task, not all in-flight work — "in-flight tasks finish and park unmerged" overstates it. In practice the verdict steer names no running task (nothing is running), so the difference is latent.

Next: none before the next launch proves the path again. The mailbox batch (dedupe, malformed-hold hardening) queues behind B1–B5.

---

## Clean code and architecture

> Test real behavior. Bottom-up + vertical slices + iterative. Edge cases, security, failure propagation, observability, performance as direction from day one. Comments why-only; self-documenting code; interfaces separate; repo conventions win; ADR is a high bar.

**Built as prompt standard, not as enforced gate.** The standard lives in [_clean-code.md](plugins/software-factory/prompts/_clean-code.md), is referenced by implementer and reviewer prompts, and is snapshotted ([prompts-snapshot.test.ts](plugins/software-factory/test/kernel/prompts-snapshot.test.ts)) — but nothing fails a task that violates it. What the prompts cover: real-behavior tests, edge cases and security in review, fail-loud errors, interface separation, repo-wins. What they don't: observability and performance (absent), and no artifact records the build approach (uncertainties → edge layers → tested slices) anywhere but the manifesto.

Evidence it mostly works: 436 tests, typecheck clean, review findings actionable across the records. Evidence of the gap: five high-severity kernel defects survived to a review (B1–B5) — the standard asks for failure-propagation thinking, but no checklist forces a reviewer to ask "what happens when the base is red / a second goal launches / the operator commits mid-turn".

Next: your verdict's done definition ("clean code, coverage rules satisfied, no known bugs") is the enforcement this section lacked. Concretely: B1–B5 fixed test-first (milestone 1), then a review checklist prompt addition (failure propagation, containment, observability) — small. No separate architecture doc needed; the prompts plus the done gate carry it.

---

## Config-driven flows

### Three config layers; flows are data; templated prompts; schema + pre-flight

> Three layers (repo / process / run). Flows are data — adding an agent or flow is a config edit. Prompts templated, not copy-pasted. Config has a schema and pre-flight validation.

**Built and exercised.** Zod schemas for all three layers ([config.ts](plugins/software-factory/src/kernel/config.ts)); flows in [process.yaml](plugins/software-factory/config/process.yaml); prompt templating with partials ([prompts.ts](plugins/software-factory/src/kernel/prompts.ts)); pre-flight validation with effort resolution ([preflight.ts](plugins/software-factory/src/kernel/preflight.ts)). Thirteen launches validated configs; the PM-alias promotion and beam-max changes were config edits exactly as described.

Deviation: a flow edit takes effect on next launch (no hot reload) — "is a config edit" holds, "takes effect immediately" doesn't. Nobody has needed hot reload.

Next: none. Document the relaunch requirement in the operator docs when they're written.

### Review retries with follow-up options; two review rounds

> Review retries configurable, with follow-up options: same agent on compacted context, different model, or de novo. Task review: two rounds by default, configurable.

**Built; non-default modes unexercised.** The follow-up modes exist in schema and flow context ([config.ts](plugins/software-factory/src/kernel/config.ts), [flow-context.ts](plugins/software-factory/src/kernel/flow-context.ts)); two rounds is the default ([process.yaml](plugins/software-factory/config/process.yaml)). No run config has ever selected a non-default follow-up mode — thirteen iterations ran the default.

Next: none for the mechanism. A test that runs the other two modes would prove them; queue it as test debt, not a feature.

### Last round decides: discard (parked) or record-and-go

> The last round decides: negative value → discard (parked until architect feedback), or record concerns/technical debt and go ahead.

**Built as park-and-keep; the word "discard" misleads.** What runs: the branch is kept and the task parks; kept branches later merged five times through land-only tasks ([flow.ts](plugins/software-factory/src/kernel/flow.ts), [derive-task.ts](plugins/software-factory/src/kernel/derive-task.ts)). Your verdict adopts the fix: "discard" is re-read as "park, keep the branch", and a kept branch that is complete and green lands at the next boundary without a new task.

Next: implement the auto-land in the boundary (small, queued behind B1–B5). No owner wording change needed — the verdict already re-reads it.

### Concurrency limits in config

> Concurrency: an absolute limit and limits per harness, in config.

**Built with the wrong key, and not the real throttle.** Absolute + per-harness limits exist ([config.ts](plugins/software-factory/src/kernel/config.ts), [dispatch.ts](plugins/software-factory/src/kernel/dispatch.ts)). But quotas are per provider/model, not per harness — and the binding throttle in practice was neither: it was scope overlap (Friction 1). The config keys held; they just weren't what serialized the run.

Next: re-key limits per provider+model and add the free-tier throttle (queued with the quota work). Keep the scope gate — it's correct, just coarse (see Friction 1).

---

## Harness agnosticism

### Any ACP harness; omp special-cased; rotation across iterations

> Works through any ACP-compatible harness with opaque config passed at launch. omp is a special case, not a dependency. Supported and tested during bootstrapping: omp, OpenCode, codex, pi — with harness rotation across iterations so no harness-specific assumption survives untested.

**Partially built; rotation not built; pi and codex never ran.** The acpx adapter exists ([harness.ts](plugins/software-factory/src/harness/acpx/harness.ts)), adapters register ([harnesses.ts](plugins/software-factory/src/cli/harnesses.ts)), omp is special-cased via RPC ([rpc.ts](plugins/software-factory/src/harness/omp/rpc.ts)). The turn counts through iteration 13: opencode 159, omp 9, pi 0, codex 0. There is no `rotate` key, no run-config surface for the opaque field, and the rotation task ([`rotation-threaded`](.factory/artifacts/self/plan.md)) is parked — its iteration-13 attempt was the one my mid-run commit killed (records [`00559`](.factory/artifacts/self/records/00559-i13-rotation-threaded-implement-r1) / [`00560`](.factory/artifacts/self/records/00560-i13-rotation-threaded-park-r1); the uncommitted work survives as [rotation-threaded.patch](bootstrap/reports/review-2026-11-13/salvage/rotation-threaded.patch)).

Next: B1 first (the containment fix is what makes rotation's worktrees safe), then unpark `rotation-threaded`, then the first live pi/codex legs. This is the one owner steer the build does not honor yet, and the verdict keeps it required.

### Harness roles discovered in bootstrapping, recorded in run configs

> Each harness has a role it is best at, discovered during bootstrapping and recorded in run configs, not in code: pi the recommended task-flow implementer; omp/OpenCode better for spikes; omp carries structured output with LSP for YAML/JSON.

**Not discovered — nothing ran on pi, and LSP exists nowhere.** The run config records roles ([self.yaml](bootstrap/run/self.yaml): opencode implements, omp architects), but pi-as-implementer is untested (zero turns) and no harness has LSP configured (omp runs with `--no-lsp`). The "discovery" this item asks for hasn't happened because only one harness did the work.

Next: the pi/codex legs are the discovery experiment. Run them, record what each harness is actually best at, then write the roles down. Until then the text's role assignments are predictions, not findings.

### Custom adapter only when the harness beats ACP; else acpx or ACP

> A custom adapter only when the harness offers substantially more than ACP exposes (omp is that case). Otherwise acpx, or at worst plain ACP — never a bespoke CLI wrapper for what the protocol already covers.

**Violated once, knowingly.** omp's custom adapter is the justified case. But the OpenCode adapter — the one that ran 159 turns — is a CLI wrapper, not ACP/acpx. It works (all thirteen iterations ran through it), but it is exactly what the text forbids, and it means the most-exercised path is the least protocol-clean one.

Next: your call on priority, not on direction — the text is clear. Options: (a) move the OpenCode adapter onto acpx after rotation lands (it becomes one harness among rotated ones, so the wrapper's assumptions get tested); (b) leave it and record the exception. The verdict didn't cover this; I'd queue (a) behind the pi/codex legs, since rotation is what tests the claim either way.

---

## Operating assumptions

### Sandbox: documented, not enforced

> The entire factory is assumed to run inside a sandbox (e.g. bubblewrap); this is documented, not enforced.

**Not documented anywhere.** No sandbox doc exists; [`operator-docs`](.factory/artifacts/self/plan.md) is pending. And the assumption already bit twice: package tests and the live run shared temp state (preflight-probe worktrees vs test-helper purges), and my operator commit during iteration 13 parked a task — both are sandbox/isolation failures, not logic failures.

Next: write the operator doc with the sandbox requirement ([`operator-docs`](.factory/artifacts/self/plan.md), a goal deliverable), and isolate per-run temp state. The doc is owed regardless; the temp-state fix is small.

### Data policy is run config

> Which models see which code (training/retention policy) is my run config, not a factory deliverable.

**Built by construction.** Model selection lives in the run layer ([self.yaml](bootstrap/run/self.yaml), [config.ts](plugins/software-factory/src/kernel/config.ts)); the factory never sees a policy question. Nothing to prove beyond the config existing.

Next: none.

---

## Notes on implementation (the HOW — shiftable on evidence)

### Reuse from v2: keep / reject lists

> Keep: worktree/commit/head-guard mechanics, record discipline, concern store + fingerprinting, mailbox, harness adapter, budget/limits, checks runner, derived state. Reject: 21 schemas, separate triage steps, ADR-on-everything, code-line plans, strict-schema plan re-issue. v2's ADRs bind nothing.

**Kept except the concern store; rejected as specified.** The mechanics, records, mailbox, adapter, budgets, checks runner, and derived state all run ([core/git](plugins/software-factory/src/core/git), [record](plugins/software-factory/src/kernel/record.ts), [mailbox.ts](plugins/software-factory/src/kernel/mailbox.ts), [metrics.ts](plugins/software-factory/src/kernel/metrics.ts)). The concern store was deleted during the core sweep (only the fingerprint helper survives) — its job is done by recorded concerns plus the debt registers, so the deletion held. The rejects hold: one front turn, markdown plan, no v2 schema files ([reachability.test.ts](plugins/software-factory/test/reachability.test.ts) pins the surface), v2 `docs/adr` gone.

Also kept from v2: templated prompts, slug ids, state-apart-from-plan, derived status. Not kept: human-involvement presets (autonomous/principal/detailed) — zero references in code, no task tracks them.

Next: none on the keep/reject split. Either build the presets or drop the line — your call; they've been unneeded for thirteen iterations.

### Loop causes designed out

> Nested retry budgets → budget the whole item. No-progress → compare history. Plan/PM bounce → editable plan + diff. "Keep going until complete" → stop incentive, spike-deferred milestones, subepics, debt review. Architect launches were the biggest cost (81 launches, $5.22 of $11.01).

**Four of five designed out and holding; the fifth is the current bill.** Item-scoped turn budgets ([next.ts](plugins/software-factory/src/kernel/next.ts)), history-comparing no-progress detection ([progress.ts](plugins/software-factory/src/kernel/progress.ts) — the A-B-A-B alternation the old code allowed), in-place plan edits with plan-mention+hash reconcile ([pm.ts](plugins/software-factory/src/kernel/pm.ts)), stop incentive + debt review ([architect.md](plugins/software-factory/prompts/architect.md)) — all built, all exercised, no loop of these shapes observed in thirteen iterations. The architect-cost observation still holds and grew: $15.79 of $21.25 (74%), one turn per launch — the ceremony is gone, the fixed price per launch remains.

The "subepics" half of the fourth item is the hierarchy chain (not built — see Saga). The "usage records need cache fields" half is built ([metrics.ts](plugins/software-factory/src/kernel/metrics.ts), [pricing](plugins/software-factory/src/kernel/pricing.ts)).

Next: none on the four. Architect-cost containment is the P4 work (fewer wasted launches), queued as tasks, not a redesign.

### Strict schema only for small outputs; LSP for the plan

> Strict schema (tool/yield) only for small, simple outputs. The plan is markdown for architect/reviewer friendliness; the PM derives task files. Configure LSP for the plan where the harness supports it, harness-agnostically.

**Built except LSP.** Outcomes are small schemas, the plan is markdown, the PM derives ([pm.ts](plugins/software-factory/src/kernel/pm.ts)). LSP exists nowhere — no config, no harness support wired (omp runs `--no-lsp`).

Next: drop the LSP clause or build it. Thirteen iterations of markdown plans without LSP produced no failure attributable to missing language support — the evidence says it's unneeded. Your call.

### Plan → PM task files; deterministic reconcile; diffing implementer's choice

> The architect writes one markdown plan; the PM derives task files, DAG, dispatch sets. Reconcile deterministic where possible (done frozen, rework as new slug, pending re-read); the PM resolves the rest. Residual diffing: id-keyed matching, not index-based.

**Built except the diffing clause.** Plan→PM→DAG→dispatch is the core loop ([boundary.ts](plugins/software-factory/src/kernel/boundary.ts), [pm.ts](plugins/software-factory/src/kernel/pm.ts), [dispatch.ts](plugins/software-factory/src/kernel/dispatch.ts)); reconcile rules as specified ([pm.ts](plugins/software-factory/src/kernel/pm.ts), [tasks.ts](plugins/software-factory/src/kernel/tasks.ts)); tested ([pm.test.ts](plugins/software-factory/test/kernel/pm.test.ts)). The diffing rule has no consumer — reconciliation uses plan mentions plus a material hash, never a structural diff.

Next: drop the diffing clause (one-line text change) or keep it as a standing rule for whoever first needs a structural diff. No code either way.

### Harness access layer: omp special-cased, acpx generic, portability graph, compaction rules

> omp RPC special-cased; everything else through ACP/acpx; direct layer where native beats ACP. Portability follows the directional graph (one-way into omp from Claude/Codex). Compaction: whole-transcript cost, compact at end inside the TTL, TTL is config (`short` explicit), no warming.

**Built: omp adapter, acpx adapter, compact-at-end, no-warming. Not built: the graph, TTL-as-config, the Claude/Codex legs.** The omp RPC adapter runs the architect turns ([rpc.ts](plugins/software-factory/src/harness/omp/rpc.ts)); acpx carries pi/codex registration ([harness.ts](plugins/software-factory/src/harness/acpx/harness.ts)); compact-at-end with reload is tested ([session-compact.test.ts](plugins/software-factory/test/kernel/session-compact.test.ts)). But `portable()` is same-harness-only ([harness/types.ts](plugins/software-factory/src/harness/types.ts)) — the "one-way into omp" claim has no code and no Claude/Codex harness ran — retention is hardcoded `short` ([overlay.ts](plugins/software-factory/src/harness/omp/overlay.ts)) with no run-config key, and all outcomes go through files (the native-structured-output direct layer is backlog).

The compaction research held up in practice: cache-read-dominated turns ($15.79 architect bill is overwhelmingly cache re-reads), cold sessions cost what they cost, end-of-session compaction inside the TTL is the rule that runs.

Next: TTL-as-config key (small); the graph's minimal form (record resume outcomes — see Context economy); Claude/Codex legs when rotation lands. The direct-output layer waits for a harness that needs it.

### Git hygiene: mechanical commits; cleanliness checks

> Mechanical commit between agents (worktree), short hashes passed so the next agent reads diffs. Cleanliness: OSS heuristic check for the unusual with agentic revision; prompt reminder; .gitignore is the hard floor.

**Commits built; heuristic checks not built.** Inter-agent commits with hash-passing run in the flow ([flow.ts](plugins/software-factory/src/kernel/flow.ts), [worktree.ts](plugins/software-factory/src/kernel/worktree.ts)). The cleanliness half is a prompt reminder plus `.gitignore` only ([implementer.md](plugins/software-factory/prompts/implementer.md), [store.ts](plugins/software-factory/src/kernel/store.ts)) — no heuristic code checks for large files, stray extensions, or out-of-scope files, and no task tracks building one.

Next: small task — a follow-up cleanliness prompt with a file listing, or a simple check (new extensions, oversized files). Queue behind B1–B5. The `.gitignore` floor held; nothing leaked.

### Orchestration artifacts: interface + plain folder; never commit sessions

> Storage is an interface; start with the plain-folder backend. Never commit sessions/logs or raw agent inputs/outputs. Same-repo artifacts merge ASAP.

**Built; the merge-ASAP clause is inert.** The `ArtifactStore` interface with the plain-folder backend runs ([store.ts](plugins/software-factory/src/kernel/store.ts), tested); sessions live outside the repo ([sessions](plugins/software-factory/src/kernel/sessions.ts)), artifacts are gitignored — which is exactly why the "merge ASAP" rule never fires: folder-backend artifacts are never in git.

Next: none. If a same-repo backend ever lands, the rule wakes up with it.

### Bootstrap: self-building, digest per launch, pinned last-good, metrics, benchmark

> Built by running itself one iteration at a time. Each launch: a cheap scout distils the previous run's artifacts into an evidence digest for the architect pack. Session store outside git. Always execute from a pinned last-good version; promote after the no-model E2E passes. Metrics per iteration; one fixed benchmark goal re-run each time.

**Built except digest cadence, pin enforcement, and the benchmark run.** The self-run is real: thirteen iterations, each launched from a promoted pin ([promote.sh](bootstrap/promote.sh)), metrics per iteration ([metrics.ts](plugins/software-factory/src/kernel/metrics.ts)), sessions outside git. Three gaps: the digest runs on relaunch only, not every launch ([boundary.ts](plugins/software-factory/src/kernel/boundary.ts)); the pin is process (my script), not factory-enforced — nothing in code stops a run from the edited tree; and the benchmark kit exists ([benchmark](bootstrap/benchmark)) but has never run — no baseline, no comparison.

Next: benchmark run first (it's the fixed goal that proves done; ~7 h, operator work per the verdict). Digest-every-launch and pin enforcement are small tasks queued behind B1–B5.

### Bootstrap models/harness roster

> Architect Opus; Sonnet escalation; OpenCode Go + Claude subscriptions; beam-free for the cheap steps; free models first, promote on measured failure; highest effort at pre-flight; several model configs alternated; pi rotated; roster installed and authorized.

**Runs as one config, not several; free-first held in shape but not in fact.** What runs: Opus architect, deepseek PM (promoted on measured failure — iterations 6 and 10 proved it), beam-free digest, free implementer/reviewer with paid fallback ([self.yaml](bootstrap/run/self.yaml)); highest-effort resolution at pre-flight ([preflight.ts](plugins/software-factory/src/kernel/preflight.ts)). What doesn't: only one run config ever served (no alternation — rotation unbuilt); pi never ran; codex never ran; free-first "held" only because quota rejections pushed 136 of 172 turns onto the paid fallback — the fallback chain ([fallback.ts](plugins/software-factory/src/harness/fallback.ts)) worked, the free tier didn't.

Next: rotation + pi/codex legs are the roster proof (queued after B1–B5). The measured-failure promotions (PM to deepseek, beam to max) already follow the rule — keep following it per step.

---

## Owner decisions (2026-11-12 log) — status of each

The decision log sits under the Intent it landed in. Most landed as code or text; the open ones:

| Decision | Status | Evidence / next |
|---|---|---|
| Task never reaches architect; review auto-escalates | Half: classification built, escalation pending | [front.ts](plugins/software-factory/src/kernel/front.ts) vs [`review-upscope`](.factory/artifacts/self/plan.md) |
| Completeness check per sub-epic | Pending hierarchy | [`epic-consult`](.factory/artifacts/self/plan.md) |
| Weaker plan review (N2) | Not built | [`plan-review`](.factory/artifacts/self/plan.md) |
| Portability graph (one-way into omp claimed) | Not built; claim has no code | [harness/types.ts](plugins/software-factory/src/harness/types.ts); minimal graph queued |
| Subarchitects via IRC (N11) | Pending hierarchy | [`epic-*` chain](.factory/artifacts/self/plan.md) |
| Sandbox doc + data policy | Not built | [`operator-docs`](.factory/artifacts/self/plan.md) |
| Hygiene heuristic | Not built | Small task, queued |
| LSP for the plan | Not built | Drop or build — your call |
| Pinned last-good enforcement + benchmark run | Process only; benchmark never run | Benchmark is operator work; enforcement small task |
| TTL as config; compaction rules config-driven | Hardcoded; fixed rules | Config keys, small tasks |
| Reviewer tailored per focus (N12b) | One prompt serves all | Small prompt task |
| Highest effort at pre-flight (N15) | Built | [preflight.ts](plugins/software-factory/src/kernel/preflight.ts) |
| Everything else (bounds, reconcile, mailbox, drain, store, presets-excluded keeps) | Built | See sections above |

The seven `*Confirm:*` readings in the log are advisor guesses at garbled chat text (e.g. "case to" → "case by case"). They don't block any build — each landed in the section named. Confirm or correct them whenever you re-read the log; nothing waits on them.

---

## Friction RCAs (built, but fights back — with examples)

### Friction 1. Scope overlap serializes the run

**Symptom.** Iteration 11 ran one task at a time for 309 of its 369 minutes ([forensics](bootstrap/reports/review-2026-11-13/forensics.md), per-merge cost identical to iteration 9 — the span difference is collapsed parallelism, not slower turns).

**RCA.** Two mechanisms stack: (1) the dispatcher refuses to start a step whose scope globs overlap any running task ([dispatch.ts](plugins/software-factory/src/kernel/dispatch.ts)); (2) most scopes name the same test directory (`test/kernel/**` appeared in 17 of 21 scopes), because every task's tests live there. Neither is wrong alone — the gate prevents real file collisions, and test colocation is normal. Together they serialize everything. Root cause class: **scheduling key too coarse** — directory-level scopes for file-level conflicts.

**Fix (verdict-adopted).** Scope becomes a prediction: plans name test files per module; a green task that touched extra files nobody holds merges with the widening recorded; parks only on a file another task holds or the plan marks off limits. Queued as plan-convention + boundary auto-land work behind B1–B5.

### Friction 2. Quota walls, not prices, set the model bill

**Symptom.** 432 quota rejections; 136 of 172 implementer/reviewer turns finished on the paid fallback; 162 records store $0 ([review](bootstrap/reports/review-2026-11-13/REVIEW.md)).

**RCA.** The free tier is quota-capped per provider/model; the dispatcher admits turns without a throttle, so every turn burns its free attempt, fails on quota, and retries on the paid fallback ([fallback.ts](plugins/software-factory/src/harness/fallback.ts)). The fallback chain works exactly as designed — the design just never priced the retry storm. Root cause class: **missing admission control** — no per-provider/model throttle, no quota knob in config.

**Fix.** Per-provider/model throttle + quota knob (queued with the quota work); per-model cost instrumentation so the ~50x ratio becomes a measurement. Neither changes intent — they implement "quota management is not a primary purpose" by making quota a non-event.

### Friction 3. Task scopes drawn too tight park finished work

**Symptom.** Five of eight parks through iteration 12 were correct "scope drawn too tight" diagnoses; 13% of the run's tokens; one park held 13 tasks for an iteration ([review](bootstrap/reports/review-2026-11-13/REVIEW.md)).

**RCA.** The plan predicts file lists; the prediction misses (a test file, a type import, a second module); the implementer respects the fence and parks; a land-only task merges the kept branch next iteration. The implementers did right — 47 of 54 merged tasks stayed strictly in scope — the fence did wrong: it treats a misprediction as a stop. Root cause class: **prediction enforced as a fence**.

**Fix (verdict-adopted).** Same as Friction 1: prediction + recorded widening + auto-land. The five land-only merges are the proof the kept-branch path works; the fix removes the extra iteration per misprediction.

### Friction 4. Summaries bloat; the guaranteed remarkable strains

**Symptom.** Summaries run 18–34 KB; the park section reprints landed parks cumulatively; the remarkable slot sometimes reads `- none`.

**RCA.** The summary template ([summary.ts](plugins/software-factory/src/kernel/summary.ts)) appends per-iteration sections without a cap and re-derives parks from all records rather than unlanded ones. No size budget exists. Root cause class: **uncapped template**, not a judgment failure — the remarkable content is there, padded.

**Fix.** Cap the park section to unlanded parks; count the summary itself as the remarkable when nothing else qualifies. Two one-line-class tasks.

### Friction 5. The architect turn is all-or-nothing per launch

**Symptom.** $15.79 of $21.25 (74%); one turn per launch whatever the launch produced; $6.28 went to iterations merging one task or none ([review](bootstrap/reports/review-2026-11-13/REVIEW.md)).

**RCA.** Three cheap-failure shapes wasted paid turns: stale-session crashes at startup (iterations 2–4, records `00006/00009/00012`); the iteration-8 turn ending on scouts with no plan edit (record `00226`); PM no-outcome turns ending iterations 6 and 10 after the architect had been paid (record [`00290`](.factory/artifacts/self/records/00290-i10-pm-r1)). Each has its fix built or queued: resume hygiene, scout recording (small), the PM ladder (built, [pm.ts](plugins/software-factory/src/kernel/pm.ts)). Root cause class: **no cheap-failure guard before/after the expensive turn**.

**Fix.** Pre-turn guard (session fresh? pack current?) and post-turn guard (no plan edit and no decision → one repair ask in-session). Queued behind B1–B5. The turn's price is correct; the waste is launches that produce nothing.

---

## Bugs: B1–B5 (verdict milestone 1, test first)

Each starts from its repro test, moves the repro into the package suite as the regression test, then fixes. Ordered as the steer orders them:

| # | Defect | Repro / evidence | Fix direction |
|---|---|---|---|
| B1 | Containment blames the running turn for any repo-root change — an operator commit mid-turn parks the task and drops its work | Records [`00559`](.factory/artifacts/self/records/00559-i13-rotation-threaded-implement-r1) / [`00560`](.factory/artifacts/self/records/00560-i13-rotation-threaded-park-r1); [worktree.ts](plugins/software-factory/src/kernel/worktree.ts); salvaged [patch](bootstrap/reports/review-2026-11-13/salvage/rotation-threaded.patch) | Check only paths a task can reach; record outside changes as incidents |
| B2 | A red base switches gating off (red matched by gate name, one gate total) | [e5-repro.test.ts](bootstrap/reports/review-2026-11-13/repro/e5-repro.test.ts); [baseline.ts](plugins/software-factory/src/kernel/baseline.ts) | Match by failing test/signature; never cache infra as base-red; split typecheck/tests gates |
| B3 | A second goal's launch deletes the first goal's live worktrees (recovery prunes the shared root; lock is per goal) | [repro-e1.test.ts](bootstrap/reports/review-2026-11-13/repro/repro-e1.test.ts) (both variants); [worktree.ts](plugins/software-factory/src/kernel/worktree.ts) | Recovery touches own goal only; lock per repo; repo id in checkout path |
| B4 | First interrupt doesn't stop dispatch (queued tasks keep starting) | [repro-e4.test.ts](bootstrap/reports/review-2026-11-13/repro/repro-e4.test.ts); [dispatch.ts](plugins/software-factory/src/kernel/dispatch.ts) | Pass the drain controller into dispatch; stop admitting on first signal |
| B5 | Boundary infra filed as `blocked-by-user`, exit 3 (five of twelve iterations lost) | Records `00006/00009/00012/00101/00290`; [repro test](bootstrap/reports/review-2026-11-13/repro/repro-e6-boundary-blocked.test.ts); [boundary.ts](plugins/software-factory/src/kernel/boundary.ts) | Infra result, boundary-turn retry, exit 1 with cause (PM half fixed in it.13; architect half open) |

Medium rows (mailbox dedupe, hold hardening, timeout budget, scope/dispatch batch, isolation, measurement) follow in six code-touch groups per the review's handling strategy — no row gets a task of its own.

---

## What the verdict changed (merged above, collected here)

1. **Hierarchy is required, after B1–B5.** The dashboard requirement (coming to the intent) is the forcing case. Next launch: milestone 1, then the [`epic-*` chain](.factory/artifacts/self/plan.md).
2. **Scope is a prediction** with the v1 merge ladder ([factory.v2.md l.109](bootstrap/context/factory.v2.md): workhorse merger agent for trivial conflicts → architect escalation with status pointer + worktree/branch). "Discard" = "park, keep the branch"; green kept branches auto-land at the next boundary.
3. **Done = shippable and tested** (your words): no new technical debt, no known bugs, comprehensive testing, W-rows answered. Wording/structure debt may sweep per milestone. `done` must see open debt; summaries show the distance.
4. **Landing/promotion stays manual** until the re-ask. Operator loop documented in [RUN-SELF.md](bootstrap/RUN-SELF.md).
5. **This document replaces the review's adversarial framing.** The `[AI Review]` inlines and P-proposals in `manifesto.md` stay as committed history; `whatuserwant.md` is the operative reading going forward: intent as you wrote it, implementation judged against it, next steps per item.

---

## Build order from here

1. **Milestone 1: B1–B5**, test first (steer already in the inbox; [steer file](.factory/artifacts/self/mailbox/inbox/steer-review-decisions-14.md)).
2. **Dashboard requirement** lands in the intent (yours).
3. **Hierarchy chain** `epic-plumbing` → `epic-derive` → `epic-packs` → `epic-consult` → `epic-pm` → `epic-reporting`, with scout-turn records first and the per-epic completeness check inside `epic-consult`.
4. **Rotation + pi/codex legs** (`rotation-threaded` unparked after B1; first live pi implementer and codex reviewer; harness-role discovery recorded).
5. **Enforcement of done**: `done` sees open debt; distance printed per summary; benchmark run (~7 h, operator) as the fixed-goal proof.
6. **Backlog batches**: `review-upscope`, `plan-review`, mailbox batch, reviewer tailoring, TTL/graph keys, digest cadence, pin enforcement, cleanliness heuristic, summary caps, architect pre/post guards.
7. **Your calls when you re-read**: top-architect term (define in hierarchy or drop); LSP clause (drop or build); OpenCode CLI-wrapper exception (move to acpx or record); the seven `*Confirm:*` readings; which review P-items become manifesto text.
