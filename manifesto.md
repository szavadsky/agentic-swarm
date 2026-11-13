# Agentic software factory — manifesto

Two sections. **Intent** is authoritative: the WHAT and its invariants; it changes only by my decision (clarified for feasibility). **Notes on implementation** are technical judgement: the important HOW, shiftable during development based on real behavior.

Supersedes `docs/factory.v2.md` and the design of `plugins/software-builder` wherever they contradict this document. The previous design is rejected: restrictive, loop-prone, noisy, not token-economical. Components and code are reusable (`plugins/software-factory`). Everything in v2 that is not rejected here is worth consideration; intent, principles and practical observation decide — avoid ceremony, stay focused on practical tasks.
## Intent

Modern harnesses deliver a decent story (several hundred lines of code). The agentic software factory is an orchestration framework on top of harnesses that delivers up to a saga (entire product) or a major refactoring — token-efficient, slop-free, steerable or autonomous, scalable from a trivial edit to a saga. One goal may span many epics and tens of tasks per iteration, across multiple resumable iterations; no hard-coded size ceiling.

### Escalation ladder
- One cheap-but-capable agent classifies the goal: trivial / task / bigger (epic, saga). For a task it defines the scope. It is not smart enough to decide how big "bigger" is — that is the architect's call.
  - **[AI Review R01 · unclear]** “Scope” means two things in the build: the class the front gives a goal, and the file globs of a planned task (`src/kernel/tasks.ts:60`). The second is nowhere in the Intent, yet it caused 5 of the 8 parks through iteration 12. The front also does choose between task and bigger (`src/kernel/front.ts:29-33`). → P2
- Trivial: the same agent implements.
  - **[AI Review R02 · incorrect]** Cannot work as written. The front runs in the goal checkout, the implementer in a task worktree, and a session resumes only in its own directory (`src/kernel/flow-context.ts:160-171`). Task `front-handoff` (iteration 13) built “same model alias, fresh session”. The line is also silent on gates and review; as built, gates run and review does not. → P12
- Task: does not reach the architect. Task review auto-escalates to "bigger" when the real scope exceeds the defined one. Everyone can make a mistake; escalation corrects it.
  - **[AI Review R03 · unclear]** Not built, and the mechanism is not named. The reviewer has no such verdict (`prompts/reviewer.md:16-21`); an implementer that reports `upscope` only parks the task (`src/kernel/flow.ts:94-96`). It is open who escalates and what happens to the work already done. Task `review-upscope` is pending. → P12
- Task or bigger: the same agent prepares the context pack — current status, infra (applicable compile/lint/test), relevant code facts. No separate triage/context-pack/infra steps: same context, same agent.

### Iteration
- An iteration is one architect engagement plus the orchestration it launches: the architect plans; the script orchestrates all tasks until they are exhausted or blocked. Each architect consult starts a new iteration.
  - **[AI Review R04 · contradiction]** “Each architect consult starts a new iteration”, yet the bullet two below allows a consult inside an iteration (R06). One has to yield. As built, one launch is one architect turn and one iteration. With subarchitects (Saga and hierarchy: “his iteration”) it is undefined whose iterations a launch limit counts. → P5
- Every consult begins with a completeness check: is the work truly blocked or does it make sense to continue, and what is incomplete or must be redone among non-blocked items. Sub-epics get their own completeness check.
  - **[AI Review R05 · practice differs]** This turn is where the money goes: $15.79 of $21.25 over 13 iterations, one turn per launch whatever the launch produced. A turn is 15 to 45 requests, each re-sending the whole session at the cache-read price (0.7 to 3.2 million tokens). Through iteration 12, $6.28 went to iterations that merged one task or none. → P4
- Consulting the architect mid-iteration is the exception: measured, and optimized during bootstrapping. For now: a landed spike does not end the iteration — the iteration still runs to exhaustion; dependents idle until the boundary.
  - **[AI Review R06 · practice differs]** The code does the opposite for dependents that are already planned: a finished spike satisfies their dependencies at once and they start in the same iteration (`src/kernel/derive.ts:13-18`). The sentence fits only work the architect has yet to plan. → P5

### Model economics
- Architect-tier (expensive) models do only what a human architect does: convert intent into actionable plans, directional interfaces, key-algorithm direction, tradeoffs above task level. Called with a prepared context pack; agentic and subagentic (scout/task); write no code beyond key interfaces and no verbose documents. The architect produces a single markdown plan written for architect/reviewer friendliness and efficiency — never schema-consistent files; token-burning maintenance of file schemas is not architect work.
  - **[AI Review R07 · contradiction]** “A single plan” conflicts with Saga and hierarchy and the Glossary, where each subarchitect owns an epic and its summary: one plan per goal, or one per architect? “No verbose documents” is not what happened either: the plan gains a strategy line and a debt register every iteration. → P8
- A weaker model can still usefully review the architect's plan: weaker reviewers find impracticality, unclarity, rule violations — and real bugs are not unusual. "Weaker reviews stronger" as advisory input, not as a veto. "Consider" spans the full range: from ignoring based on fact judgement, to clarifying the plan, to realizing "oops" and changing it.
- Architect-tier costs or subscription use are ~40–80x the cheap capable tier today (vs only 2–3x for human architects). Optimize overall cost on that ratio (~50x); quota management is not a primary purpose.
  - **[AI Review R08 · practice differs]** Two ratios in one bullet (40–80x, then ~50x). In the run the binding constraint was quota, not price: 432 quota rejections, 145 of 172 turns retried, 136 finished on the paid fallback model. The ratio cannot be measured from the records: 162 of 172 store a cost of $0. → P9
- Escalation to an expensive implementer-tier model (Sonnet/Terra class) only when a task goes wrong or needs a highly non-trivial class/PoC; the architect calls it, in advance or on review. Minimize its use.
  - **[AI Review R09 · practice differs]** For the PM the script now owns escalation (owner steer of 2026-11-13, `src/kernel/pm.ts:171-360`). For implementers “on review” cannot work: a review keeps the reviewer's alias (`src/kernel/flow-context.ts:117`), task `tier-escalation` has been parked since iteration 7, and the `escalation` alias has not run one turn. → P3
- Consults are batched: delayed until non-blocked tasks are exhausted — the iteration boundary. Expensive models are used rarely and only when necessary.

### Context economy
- Same context: same agent. Different context: different agent.
- Reuse stored agent sessions within one harness. Across harnesses portability is directional and not always feasible: a graph records which way a session can move. Portable → continue from the pre-compacted session. Not portable → de novo, with the context pack and links to artifacts.
  - **[AI Review R10 · incorrect]** No graph exists: a session is portable only to the same harness (`portable()` tests `from === to`). Resuming also failed in practice: a stale omp session crashed the architect in iterations 2, 3 and 4 (records 00006, 00009, 00012). What a resumed session saves over a fresh one with a digest was never measured. → P4
- Compact at the end of a session; reload the compacted session for consult, review, or next iteration. Use tree/branch summaries when a hot cache is unavailable or impractical. Compaction is transcript trimming — even server-side — not a handoff summary; the two serve different reuses and must not be confused.
- Plans are the architect's markdown, edited in place — never in flight; the architect owns them. A cheap PM turns the plan into tasks and lines: it identifies task files, owns the DAG and the dispatch sets, and resolves whatever cannot be derived deterministically (missing branches, misplaced artifacts). The PM is a paper-pusher, not a peer: it converts the architect's bullet-point vision into actual tasks, interpreting intent into more formal shape — splitting and merging tasks as the formalization requires. There is no PM/architect disagreement to resolve; the architect's intent governs. Tasks are named by short immutable slugs. The orchestrator reconciles execution state from a semantic diff. Never force whole-plan re-issue through a strict schema.
  - **[AI Review R11 · unclear]** “Lines” and “semantic diff” are undefined; as built the PM re-derives task files and the script matches them by plan mention and a content hash (`src/kernel/pm.ts:74-90`). “Paper-pusher” undersells the role: PM turns without a usable outcome ended iterations 6 and 10 with nothing dispatched, after the architect had been paid. → P4
- Status is aggregated by the script from structured outputs / YAML artifacts, idempotently; the context pack is prepared from it.

### Saga and hierarchy
- Hierarchy depth is bounded by config: 1 architect level is the norm, 2 the expected maximum. A subarchitect is split off only when the size/complexity of architecture context demands focused context; the architect owns all planning and review down to that level. Untouched levels are not invoked.
  - **[AI Review R12 · unclear]** No such config key exists, and the count is ambiguous: is the main architect level 1? The level is unbuilt (six `epic-*` tasks pending) and the run shows no need yet: none of 560 records has a context-overflow stop, with one architect on a 430-line plan. → P8
- Strict chain: task-level consults go to the architect responsible for that epic (epic→architect may be many-to-one). The subarchitect filters and consolidates escalations into one brief upward; implementers/reviewers never reach past their architect.
  - **[AI Review R13 · contradiction]** The Escalation ladder says a task never reaches the architect. “Consult” is used for three things: the architect's turn at an iteration boundary (Iteration, Model economics), an escalated item (here), and a steer (Steering and autonomy). Two readers will route escalations differently. → P5
- Each subarchitect owns the status summary of his iteration. Task dispatch stays in the single script. On each iteration the main architect decides the subarchitect set and may leave out an architect whose job is done; the architect register is maintained as part of the saga plan.
- One orchestration script owns everything down to task level — through a harness abstraction that knows each harness's capabilities and orchestrates the chain of architects accordingly. It does not drive every harness directly and uniformly.
  - **[AI Review R14 · practice differs]** Scouts run as subagents inside the architect's omp session: no record, no cost line, no limit, no crash recovery (`Caps.subagents` is unused). In iteration 8 the architect's turn ended while it waited for its scouts, with no plan edit (record 00226). Harness access layer proposes subarchitects the same way. → P4

### Funnel: only the remarkable
- implementer → reviewer → architect → [top architect] → human. Each stage filters.
- Each stage sees a different scope: the implementer sees one task, the reviewer its diff against the task, the architect the epic's interactions, layers and sequence. That perspective gap is the point — it holds even between same-class models (or humans), which is why the task flow uses separate steps rather than one agent doing everything.
- Implementers over-report trivia; the reviewer decides what is different/additive to the plan and worth architecture attention. Even a same-model reviewer with a different focus adds a lot.
- Reviewer pairing is per task-type flow in config; there is no separate integration "wave review" — the iteration's completeness check at the next architect consult is the integration point. The reviewer's prompt and context differ from developer/QA: tailored to the focus of the review, not the implementation context — not the implementer's edits, not its reasoning about what to edit.
  - **[AI Review R15 · practice differs]** The price of this rule: any integration or scope problem waits a full iteration. Seven of the eight parks through iteration 12 held finished or correctly diagnosed work. Five were merged later by a separate task whose only content is the kept branch (`turn-land`, `prune-checks-land`, `front-land`, `sweep-land`, `pm-infra-stop`), each after a consult. → P2
- Concerns (technical debt, risks, uncertainties, design choices) and remarkables propagate up the chain; calibration lives in config prompts: FYI-only / blocked-by-architect / blocked-by-user. Not spam.
  - **[AI Review R16 · practice differs]** Iteration summaries are 18 to 34 KB. The park section is cumulative and reprints parks that were landed iterations earlier, and the status line stays `in-progress` after the iteration has ended. The calibration words in code are `fyi`, `architect`, `owner` (`prompts/_calibration.md:6-8`), not the three named here. → P10
- Files stay on disk; the architect can scout/read instead of receiving pasted content.

### Uncertainty and spikes
- Risk, uncertainty, complexity first. A milestone may defer detail until a spike lands ("XYZ details after spike"); implementation work already unblocked proceeds in parallel. Orchestrate all.
- The architect issues what it can direct now plus the spikes: "I need modules X, Y, Z; X is clear (T1, T2); Y needs a spike (research, PoC, a couple of interactions); Z depends on Y" → issue T1, T2 and the spike, then decide next steps.

### Stopping and debt
- The architect is incentivized to stop: goal met → done; no infinite continuation.
  - **[AI Review R17 · unclear]** The incentive is prompt text only. Thirteen iterations ended `in-progress`; pending tasks stood at 10, 10, 3, 2, 16, 16, 10, 13, 11 from iteration 5 on, and the reviews of iterations 11 and 12 each opened a new milestone. Nothing measures the distance to done, and nothing stops a goal that is not getting closer. → P1
- Stop criteria, stated in the prompt: the goal is met, or no more meaningful development is possible without owner feedback; no new technical debt introduced, no slop introduced, clean-code principles met. A goal's own formal acceptance criteria apply when it has them.
  - **[AI Review R18 · infeasible]** “Slop” is undefined, and the conjunction is strict: the last review round may merge with recorded debt (R22), so a goal ends clean only if every item is removed. Reviews opened 121 distinct items in 13 iterations; 103 are closed, 18 are open, 8 of those with no task to remove them. → P1
- On relaunch of the same goal, the architect first reviews the implementation for technical debt and gaps (from compacted or de-novo context), then plans. Historic debt may need addressing to enable the goal; the rule is: no new debt created by the goal.
- The architect may authorize temporary technical debt; removal by the end of the same goal.
  - **[AI Review R19 · practice differs]** Not enforced: `done` does not look at open debt (`src/kernel/derive.ts:43-45`). → P1
- Bounds: a launch limits the number of iterations; review cycles are bounded; optional limits on $ / subscription use / time per iteration. On a per-iteration budget hit: drain — no new dispatch, in-flight work finishes within its own bound.
  - **[AI Review R20 · infeasible]** Subscription use has no source in any harness; quota shows up only as a failed attempt. Time is unbounded by default: iteration 7 was killed by hand and iteration 11 ran 6.2 hours. Two gaps are reproduced by test: after a first interrupt the dispatcher keeps starting queued tasks, and a step that times out is retried on every relaunch. → P9

### Steering and autonomy
- Config-driven. Under the current calibration the architect records a reversible assumption, notes it as remarkable, and continues; the user steers/overrides. The process-config prompt defines what the architect may decide alone vs what blocks on user input.
- Mailbox, not ACK protocol: the user drops files to steer; the user sees remarkable notes (iteration summary, concerns, open questions) — at least one remarkable entity per iteration (the iteration summary is the guaranteed one), never spam.
- The script monitors the mailbox at startup and during a run. A cheap "PM" agent converts each steer into structured artifacts and decides which task or gate it blocks. In-flight tasks finish and park unmerged; pending ones hold; the architect consult waits until the unblocked remainder of the DAG is also exhausted. Fundamentally every steer goes to the architect; it is then marked processed by the architect, with the architect's response in the outbox.
  - **[AI Review R21 · unclear]** All in-flight tasks, or only those the steer blocks? The code parks only the held task (`src/kernel/dispatch.ts:256-273`). Cases the line does not cover: a steer to a goal the architect has blocked, two steers with the same text, a steer the architect does not answer, a PM that misreads the steer. → P13

### Clean code and architecture
- Test real behavior. Bottom-up implementation + vertical slices + iterative.
- These rules specify the result; the build approach is separate. Build priorities: uncertainties, then layers handling edge cases, then tested slices of user-visible functionality; exact ordering is decided case by case.
- Edge cases, security posture, failure propagation/containment, observability, performance are architectural direction from day one.
- Comments: why, only for non-trivial code. Self-documenting code over docs.
- Public interfaces separate from implementation, preferably separate files; interface docs readable by humans and agents alike.
- Where the target repo has its own conventions, the repo's win; these rules are defaults.
- ADR is a high bar: a long-term decision shaping the project or a whole layer; concise decision/enablement-vs-limitation, tradeoff vs alternative. Not routine decisions, not normal consult outcomes.

### Config-driven flows
- Three config layers: repo config (locations, paths, gates), factory process config (flows, agents, schemas, calibration), transient run config (harnesses, models, aliases).
- Flows are data: e.g. "just implement", "implement/review", "TDD: ingest → record known problems → stubs → implement/QA/review/security review". Adding an agent/schema to ingestion, a task-type flow, or the PM flow is a config edit. The script surface schema is fixed: agent produces, script reads.
- Prompts are templated, not copy-pasted.
- Review retries configurable, with follow-up options: same agent on compacted context, different model, or de novo.
- Task review: two rounds by default, configurable. The last round decides: negative value → discard (parked until architect feedback), or record concerns/technical debt and go ahead.
  - **[AI Review R22 · contradiction]** “Discard” and “parked” are opposites. As built the branch is kept, and kept branches were merged later five times. A reader of this line may delete the branch. → P2
- Concurrency: an absolute limit and limits per harness, in config.
  - **[AI Review R23 · incorrect]** Quotas and rate limits are per provider and model, not per harness; the code keys `perHarness` (`src/kernel/config.ts:119`) and the kernel has no throttle for the free tier. What actually limited concurrency was scope overlap: iteration 11 ran one task at a time for 309 of its 369 minutes. → P9
- Config has a schema and pre-flight validation.

### Harness agnosticism
- Works through any acp-compatible harness with opaque config passed at launch (command-line args, env, or config files depending on the harness). omp is a special case that simplifies things, not a dependency; extra tools exposable through ACP. Supported and tested during bootstrapping: omp, OpenCode, codex, pi — with harness rotation across iterations so no harness-specific assumption survives untested.
  - **[AI Review R24 · practice differs]** Not met. Through iteration 12 opencode ran 159 turns, omp 9, pi and codex none. Rotation is unbuilt, one run config served all 13 iterations, and `self-acpx.yaml` was never used. “Opaque config passed at launch” has no path either: no run-config field reaches the harness. → P8
- Each harness has a role it is best at, discovered during bootstrapping and recorded in run configs, not in code: pi is the recommended task-flow implementer (minimal, great at the single task); omp and OpenCode fit spikes better out of the shelf, where subagent expansion matters; omp carries structured output in the orchestration folder, with LSP configured for YAML/JSON there (other harnesses' LSP support is unverified).
  - **[AI Review R25 · incorrect]** Stated as fact; there is no LSP configuration anywhere in the repository. pi as “the recommended task-flow implementer” rests on no run: it has not executed a turn. → P11
- Harness adapters: a custom adapter only when the harness offers substantially more than ACP exposes (omp is that case: RPC, yield, compaction, overlays). Otherwise drive the harness through acpx, or at worst plain ACP — never a bespoke CLI wrapper for what the protocol already covers.
  - **[AI Review R26 · contradiction]** The opencode adapter is exactly that, kept as a logged exception (`bootstrap/LOG.md:26`), and it carried 159 of the 168 live turns. Harness access layer pulls the other way (a direct layer where native beats ACP). Two readers build different adapter sets. → P11

### Operating assumptions
- The entire factory is assumed to run inside a sandbox (e.g. bubblewrap); this is documented, not enforced. Sandboxing individual harnesses can come in a subsequent iteration.
  - **[AI Review R27 · incorrect]** It is documented nowhere (`plan.md:368`), and for a factory that edits itself it is not enough: package tests and the live run shared temp state twice, an operator commit during iteration 13 parked a task (records 00559, 00560), and a PM turn tried `git checkout` on a task file in the live worktree (record 00290). → P7
- Which models see which code (training/retention policy) is my run config, not a factory deliverable.

## Notes on implementation

### Reuse from plugins/software-factory
Keep: worktree/commit/head-guard mechanics, record discipline, concern store + fingerprinting, mailbox, harness adapter, budget/limits, checks runner, derived state. Reject: 21 schemas, separate triage/context-pack/infra steps, ADR-on-everything, code-line-oriented plans, strict-schema plan re-issue. The ADRs v2 produced (`docs/adr`) are agentic spam — one of the reasons v2 is not acceptable — and bind nothing.

> **[AI Review R28 · stale]** The concern store was deleted on purpose (`plan.md:51`); only the fingerprint function remains. The human-involvement presets in the next paragraph exist nowhere in code, prompts or config. The keep-list and the prune decision have to agree. → P11

Already true in v2, keep rather than rebuild: templated prompts with partials, slug task ids, execution state stored apart from the plan, status derived from on-disk records, human-involvement presets (autonomous / principal / detailed).

### Known loop causes to design out
- Nested retry budgets compound (step attempts × fix rounds × consults × plan reviews × amendments). Budget the whole item, not each nest.
  - **[AI Review R29 · practice differs]** The new build nests again: provider attempts, fallback hops, outcome repair, gate-fix turn, review rounds, PM rungs. 145 of 172 turns were retried, and 12 turns show 8 attempts because the ladder restarts at the exhausted free tier. Only content turns count against the item budget (`itemTurns: 8`). → P3
- No-progress detection compared only the last fingerprint, allowing alternation loops. Compare history.
- Plan review/PM bounce re-issued whole plans. Editable plan + diff kills this.
- `plan-goal-execution.md` said "keep going until complete" with no debt gate; preserve its economy rules (direction-not-spec, telegraphic, adversarial grounding, V&V inside dev tasks) but add stop incentive, spike-deferred milestones, subepics, debt review.
- Architect-role launches were the biggest single cost: 81 launches, 21.7M input tokens, $5.22 of $11.01 in the last run (wave reports, close-ups, PM edits, plan reviews, consults — full combined accounting in `manifesto.advice.md` §1, including 103 item-level launches the old 158-launch headline missed). The iteration rule above removes the ceremony; usage records need cache fields before architect context is fully measurable.
  - **[AI Review R30 · practice differs]** Still true, and more so. v2: $5.22 of $11.01 over 81 launches. Now: $14.30 of $19.05 over 12 turns, $1.19 per launch whatever it produced. The cheap roles run on free or nearly free models, which inflates the share but not the fixed price of a launch. → P4

### Strict schema output
- Strict schema (tool/yield) only for small, simple outputs.
  - **[AI Review R31 · practice differs]** The weak point was the outcome file, not the schema: 21 repair turns, and two valid outcomes were thrown away because the session then stopped on infra (records 00090, 00222; still so at `b4a2d9f`). opencode produced 1.9% invalid outcomes, omp 22%. → P3
- The architect's plan is markdown written for architect/reviewer friendliness; the PM derives task files from it. Configure LSP for the plan where the harness supports it, harness-agnostically.

### Architect plan → PM task files
- The architect writes one markdown plan; the PM derives task files, the DAG and the dispatch sets from it. The architect never maintains schema-consistent files.
- Reconcile is deterministic where it can be (done tasks frozen, rework as a new slug, pending tasks re-read at dispatch); the PM resolves what determinism cannot — missing branches, misplaced artifacts, ambiguous mappings.
- Library choice for any residual diffing is the implementer's (id-keyed matching if arrays are compared; microdiff is index-based and fails that requirement).

### Harness access layer
- omp RPC (JSONL) is far more capable than ACP: compact, navigate_tree with summary, fork, subagent steering/IRC, host tools. Special-case it; with omp as architecture harness, subarchitects can be subagents reachable through IRC — one strategy of the capability-aware layer, still owned by the script.
- Everything else through ACP; acpx (headless ACP client, persistent sessions, embeddable runtime) is the generic access layer; reaching Claude Code and Codex through adapters is fine. Where a harness's native interface is more capable than ACP — e.g. native structured output in Claude Code and Codex — prefer it and build a direct layer, as for omp.
- Session portability across harnesses follows the directional graph (today: one-way into omp from Claude Code and Codex; ACP itself has no transcript import). Fall back to de novo + context pack + links to artifacts.
- Compaction and cache (researched 2026-11-12). All providers have prompt caching. A compaction request takes the whole transcript as input and is charged for it: at the cached-read price while the session's cache is hot, at full input price once it is cold. Compacting a cold session therefore costs as much as the cold resume it was meant to avoid. Rule: compact at the end of the session, inside the cache TTL; never at the start of a resumed session. The TTL is config: in omp the enum `auto|short|long|none` — set `short` explicitly, because the default `auto` keeps 1-hour entries on subscriber sessions and 1 h doubles the cache-write price. No cache warming between separate calls: over 4–5 turns the saving versus cold is small, and for implementer sessions a compacted fresh context beats a preserved one. Compaction trims the transcript; it is not a handoff summary. Compaction rules are cost- and capability-model dependent; learn the reuse behavior during bootstrapping, watch its variability — the expected result is config-driven rules for what to compress on which review iteration. omp compacts Claude sessions server-side and stores portable summary text; Claude Code's `/compact` is client-side summarisation — the charging rule is the same for both.

### Git hygiene
- Mechanical commit between agents (worktree), short hashes passed so the next agent reads diffs.
- Cleanliness: OSS heuristic check for the unusual — large files, new file extensions, many files outside task scope, temp files/model weights/huge outputs — with agentic revision (agent inspects and fixes or justifies). Prompt reminder to clean scaffolds; .gitignore is the hard floor. Prefer no homegrown heuristics; where nothing exists do something simple — new extensions, files exceeding the typical file size, a large number of files added — as a follow-up prompt to the author.

### Orchestration artifacts
- Storage is an interface (design/OOP in scripts). Start with the plain-folder backend (gitignored under the repo, or outside it); the separate-GitHub-repo and same-repo-folder backends come on first real need.
- Never commit sessions/logs or raw agent inputs/outputs to GitHub.
- Code changes may sit on an unmerged branch; orchestration artifacts stored in the same repo must be merged/cherry-picked ASAP. Artifacts stored separately need no cherry-pick.
  - **[AI Review R32 · unclear]** Who lands a goal's integration branch on the base, and when? As built nobody in the factory does: the operator merged `factory/self` into `factory-v3` by hand seven times, once resolving conflicts in three files. → P6

### CRITICAL — bootstrap
This factory is built by running itself one iteration at a time. Iteration 0: the agent that ingests this file and `manifesto.advice.md` prepares the minimum new version based on v2 (`plugins/software-factory`), launches it, and starts bootstrapping. Each launch: a cheap scout distils the previous run's artifacts/transcripts into an evidence digest for the architect's context pack (cost by role, loops, failures, interventions, with paths); the architect reads the digest and drills down by path. Session store lives outside worktrees and outside git (path in run config, last N runs kept).

> **[AI Review R33 · practice differs]** The digest is meant to report interventions, but they are recorded only in `bootstrap/LOG.md`, outside the factory's artifacts. The `humanInterventions` metric counts processed steers: it reports 1 where the journal shows 52 operator acts through iteration 12. → P6

Always execute from a pinned last-good version, never from the tree being edited; promote after the no-model E2E suite passes. Metrics per iteration: architect launches, architect share of cost, cost per merged task, loop incidents, human interventions; one fixed benchmark goal re-run each time (baselines in `plugins/software-factory/docs/runs`).

> **[AI Review R34 · unclear]** The passive voice hides the actor: `factory run` neither checks nor pins; promotion is a bootstrap script by decision D9, run by hand before every launch, with no rollback. “One fixed benchmark goal re-run each time” has not happened once. `costPerMergedTask` is null in the metrics. → P6

#### Bootstrap models/harness
- Architect: Claude Opus 5.5 at high (omp, Claude Code).
- Escalation implementer: Sonnet 5.5 — exists in our environment; minimize use.
- Subscriptions: omp, OpenCode, codex and pi all run on the OpenCode Go subscription; omp additionally on the Claude subscription (Opus/Sonnet). Self-improvement runs cover both legs: codex through OpenCode Go (muse/deepseek) and Claude through omp (Opus architects, Sonnet escalation).
- OpenCode Go subscription: beam-free (least capable; steer ingestion, schema fixes, commits); capable implementers deepseek-v4.1-flash and muse-spark-1.3-contributor — through omp, codex, OpenCode.
- OpenCode-only free models (OpenCode harness only): glm-5.3-flash-free, deepseek-v4.1-flash-free (most capable), minimax-m3.1-flash-free, mimo-v2.6-flash-free, inkling-2-small-free — reasonably capable for development tasks.
- Leverage OpenCode with the free models early in bootstrapping: front agent, review, PM structuring and evidence digests run there first; paid tiers only where the free models demonstrably fail. Promote a step to a paid tier on measured failure, not by default.
  - **[AI Review R35 · practice differs]** The free tier did not carry sustained work. It was exhausted on the first evening, and in the self-run 136 of 172 turns finished on the paid fallback after quota rejections. beam-free as PM failed twice and cost two iterations. Free models fit single cheap steps, not 50-turn iterations. → P9
- All implementers / task reviewers at the highest supported effort, resolved at pre-flight (effort syntax differs per harness; `:max` exists only on some models; muse takes `:max` on omp, `#xhigh` on OpenCode, the bare id on codex).
- Develop several "model" configs and alternate them to test different harness combinations across iterations; pi is one of the rotated harnesses.
- Installed and authorized: omp, Claude Code, OpenCode, codex (only through the OpenCode subscription; muse/deepseek enabled), pi (OpenCode Go subscription).
- What we use as a hobby setup is not what we build for production: this list is one run config, not a factory assumption.

## Owner decisions propagated — 2026-11-12

My annotations from the first AI review, as the advisor read them, and where each landed. Three readings are uncertain and marked *confirm*.

- Ladder: task never reaches the architect; classifier defines task scope; review auto-escalates → Escalation ladder.
- Iteration = each architect consult; completed vs blocked; completeness check at every consult; mid-iteration consult is the measured exception → Iteration, Model economics. *Confirm:* "that shall be exception" was read as referring to the mid-iteration consult. *Confirm:* "separate completeness check for subepics" was read as one check per sub-epic, by its own architect.
- Spikes: issue known tasks + spikes, plan dependents after → Uncertainty and spikes.
- Stop criteria as prompt text; formal criteria only if the goal has them → Stopping and debt.
- Bounds: iterations per launch, bounded review cycles, optional $/subscription/time per iteration → Stopping and debt.
- Plan never edited in flight; immutable slugs; status derived idempotently; context pack from status → Context economy.
- Session portability is a directional graph; non-portable = de novo + artifact links → Context economy, Harness access layer.
- Script owns everything through a capability-aware harness abstraction, not uniformly → Saga and hierarchy, Harness access layer.
- Mailbox: monitored at startup and during run; PM agent structures and maps steers; architect processes; response in outbox; blocked iteration exits → Steering and autonomy, Iteration.
- Iteration summary is the guaranteed remarkable → Steering and autonomy.
- Clean-code rules are the result, build approach is separate, priorities listed → Clean code and architecture. *Confirm:* the sentence ended "how exactly to order is case to"; read as "case by case".
- Prompts templated; task review two rounds with a last-round decision; absolute and per-harness concurrency limits → Config-driven flows.
- Resilience and fallbacks; cost ratio ~50x, quota not primary → Harness agnosticism, Model economics.
  - **[AI Review R36 · stale]** This says the decision landed in Harness agnosticism and Model economics. Neither section mentions resilience or fallbacks; the words appear nowhere else in this file. The build has both: same-tier `fallbacks` for infra failures and `escalateTo` for content failures. → P11
- Sandbox assumed around the whole factory; data policy is run config → Operating assumptions.
- acpx as generic layer, adapters fine, direct layer where native beats ACP → Harness access layer.
- Hygiene: simple homegrown checks allowed where no OSS exists → Git hygiene.
- Artifact merge wording corrected → Orchestration artifacts.
- v2: import everything reasonable; ADRs are spam → preamble, Reuse.
- Iteration 0 by the ingesting agent on top of v2; Sonnet 5.5 as escalation tier; hobby config ≠ production → Bootstrap.
- Architect and advice add value by knowledge and reasoning without over-constraining (chat, same day) → Model economics.
  - **[AI Review R37 · stale]** This decision and the next one (practical knowledge: libraries, patterns, anti-patterns) did not reach the Intent text. Their wording appears only here. → P11
- Knowledge must be practical — libraries, patterns and anti-patterns that change what the implementer builds, not academic viability citations (chat, same day) → Model economics.
- Each funnel stage sees a different scope; the perspective gap holds even between same-class models, which is why the task flow uses separate steps (chat, same day) → Funnel.
- Compaction happens at the end of a session, never at the beginning of a resumed one; all providers cache prompts; cache TTL is config (`short`, set explicitly — the `auto` default keeps 1 h on subscriber sessions). No `idle` warming between separate calls: compact at the end instead, cheaper over few turns and a better context (chat, same day) → Context economy (already said so), Harness access layer.
- Advisor fact fixes in Notes: schema count 21; last run's architect-role share added to Known loop causes.

Second-round decisions (my annotations on N1–N19, same day), as the advisor read them:
- N1: for now the iteration runs to exhaustion even when a spike lands → Iteration.
- N2: a weaker model usefully reviews the architect's plan as advisory input; impracticality, unclarity, rule violations, real bugs → Model economics. *Confirm:* "if weaker prompt can read" was read as "if the weaker model's prompt can read the plan". Open: what "consider" binds the architect to — must it answer each finding, or only read them?
- N3: (a) in-flight work finishes and parks unmerged; the consult waits for the unblocked remainder of the DAG → Steering and autonomy.
- N4: the PM owns DAG/tasks from the plan and resolves what determinism cannot (missing branches, misplaced artifacts) → Context economy. *Confirm:* "in v1 PM owns DAG/tasks based on plan" was read as the model to keep, not a description of what v1 did wrong.
- N5: architect writes one markdown plan for human/reviewer friendliness; the PM derives task files, waves and DAGs; the architect never maintains schema-consistent files → Model economics, Context economy.
- N6: agreed as recommended (park, report by root cause, autonomous continues) → no new text; the rule lives in `manifesto.advice.md` §5.
  - **[AI Review R38 · unclear]** A binding rule (park, report by root cause, autonomous continues) is recorded with “no new text”, so it exists only in the advisory `manifesto.advice.md`. An implementer who treats that file as advisory will not build it. → P11
- N7: historic debt may be addressed to enable the goal; the rule is no new debt created by the goal → Stopping and debt.
- N8: (a) drain on budget hit → Stopping and debt.
- N9: compaction is transcript trimming, not a handoff summary; rules are cost- and capability-model dependent; learn reuse probability empirically → Context economy, Harness access layer.
- N10: agreed (session store outside worktrees/git; scout-distilled digest) → Bootstrap.
- N11: subarchitect owns his iteration's status summary; dispatch stays in the single script; the main architect picks the subarchitect set per iteration; register in the saga plan → Saga and hierarchy.
- N12: same-model reviewers with different focus add a lot; pairing per task-type flow; no separate wave review → Funnel.
- N13: everything not rejected here is worth consideration; intent/principles/observation decide → preamble.
- N14: agreed (interface plus plain folder first) → Orchestration artifacts.
- N15: unanswered; "highest supported effort" applied as a reversible assumption → Bootstrap.
- N16: agreed (pinned last-good, promotion gate, metrics, benchmark) → Bootstrap. Noted: stop re-asking the obvious.
- N17: agreed (repo conventions win) → Clean code and architecture.
- N18: agreed ("at launch") → Harness agnosticism.
- Early OpenCode/free-models leverage during bootstrapping (chat, same day): cheap/new steps run on free models first, promoted on measured failure → Bootstrap.

Third-round decisions (my annotations on N2b–N15, same day), as the advisor read them:
- N2b: "consider" spans ignoring on fact judgement, clarifying the plan, and changing it on "oops" → Model economics.
- N4b: yes, the PM splits and merges tasks; no disagreement exists — the PM is a paper-pusher interpreting the architect's bullet vision into formal shape; architect intent governs → Context economy, Glossary. *Confirm:* "more formal larhing" was read as "more formal shape".
- N9b: learn reuse behavior during bootstrapping, watch variability; expected result is config-driven per-review-iteration compaction rules → Harness access layer.
- N12b: reviewer prompt and context are tailored to the review focus, not the implementation context — neither the edits nor the reasoning about them → Funnel, Glossary. *Confirm:* the cut-off "reviwer context is not ed" was read as "not edits".
- N15: confirmed (highest supported effort, resolved at pre-flight). Noted again: stop re-asking the obvious.

## AI REVIEW — open after propagation

All items decided. Earlier questions and their answers live in the decision log above; reasoning and implementation detail in `manifesto.advice.md`.

> **[AI Review R39 · stale]** Not all: N15 is “unanswered”, and seven `*Confirm:*` readings remain in the two decision lists above, where their introduction counts three. An implementer cannot tell whether an unconfirmed reading binds. → P11

### N19 Glossary — decided
- **Goal**: one intent, one directory; relaunching the same directory is "the same goal".
- **Launch**: one run of the script; bounded by the iteration limit.
- **Iteration**: as defined in Intent.
- **Saga / epic / task**: a task is one implementer session's worth (a story) and the unit of worktree, review and merge; an epic is a coherent part owned by one architect — the unit of architecture context; a saga is a goal with several epics.
- **Milestone**: a demoable, checkable achievement; the logical flow of development.
- **Spike**: a task whose product is knowledge (a finding, optionally a PoC); not merged by default.
- **Wave**: a set of work items without logical dependencies, executable in parallel subject to limits.
- **Script / orchestrator**: deterministic code. **PM**: the paper-pusher that converts the architect's bullet-point vision into actual tasks — derives DAG/task files from the plan, owns waves and dispatch sets, structures steers, resolves what determinism cannot; splits and merges tasks as formalization requires. **Reviewer**: the per-task agent after the implementer, with a prompt and context tailored to the review focus rather than the implementation context.
- **Concern**: a recorded debt, risk, uncertainty or design choice with a calibration (FYI / blocked-by-architect / blocked-by-user). **Remarkable**: anything different from or additive to the plan that deserves the next stage's attention; concerns are one kind; a design choice is a remarkable.
- **Context pack**: an index — derived status, infra commands, code facts with paths; links, not content; size-capped — built by the front agent or by deterministic scripts.
  - **[AI Review R40 · undefined term]** Terms used as rules and defined nowhere: scope, consult, boundary, park, land, drain, gate, pin, promote, digest, front agent, slop, lines (Context economy), ingestion (Config-driven flows), top architect (Funnel), sub-epic (Iteration). Milestone has a definition and no mechanism. → P11

## Fable proposal

Written on 2026-11-13 by the reviewing agent, at the owner's request, together with the `[AI Review]` inlines above. **Everything here is a proposal.** Nothing in this section or in the inlines is intent until the owner confirms it, and the goal intent the factory runs on is unchanged.

Evidence is in `bootstrap/reports/review-2026-11-13/`: `REVIEW.md` (status, execution history, manifesto against as-built) and the fact reports behind it. Iterations 1–12 were audited from records, transcripts and code; iteration 13 is taken from its summary and records. Code paths are relative to `plugins/software-factory/`, with line numbers as of `dd6fc97` unless a row names `b4a2d9f`. Ids: `R` is an inline above, `P` a proposal, `W` remaining work, `B` a bug or unhandled case.

### Where the project stands

- **The kernel the Intent describes exists and works.** Plan, PM, task, review and merge run end to end, with steering holds, records, pricing and three harness adapters. Thirteen iterations merged 54 tasks with no merge conflict inside the factory and no gate failure after a merge. The suite has 436 tests and is green at `b4a2d9f`.
- **Cost.** $21.25 and 17 hours of factory time. Through iteration 12 a merged task cost $0.39. The architect is 75% of that bill: one turn per launch, whatever the launch produces. A third of the money ($6.28) went to iterations that merged one task or none.
- **It does not run unattended.** Through iteration 12 there were 52 operator acts against 49 merges: merging the goal line into the base, verifying, promoting, relaunching, and eight hand fixes. The factory's own `humanInterventions` metric reports 1.
- **Free first did not hold.** 432 quota rejections; 136 of 172 turns finished on the paid fallback model.
- **Throughput is set by scope overlap, not by models.** Iteration 11 ran one task at a time for 309 of its 369 minutes.
- **It converges locally and diverges globally.** Parked work gets landed and review debt gets closed (103 of 121 items), but each review opens the next milestone. Pending tasks have not dropped below 10 since iteration 9.
- **Against the manifesto.** Of 103 statements checked, 50 are built and tested, 8 built but untested, 23 partial, 9 missing, 9 built differently or contradicted by practice.
- **Against the goal's done condition: not done.** Hierarchy level 2 and harness rotation are unbuilt, the benchmark has never been run, the usage document and the evidence table are pending, debt is open.
- **Harness breadth.** opencode ran 159 turns and omp 9; pi and codex ran none. This is the one owner steer the build does not honor.
- **Safety.** Five high-severity kernel defects (B1–B5 below): B1 was hit in iteration 13, the other four are reproduced by test. One reported defect turned out to be fixed already.

### Clarify the intent

**P1. Make done reachable, and measure the distance** (Stopping and debt; R17–R19).
The goal's done condition ends with "no open debt", and the stop criteria add "no new debt, no slop". Reviews do find real problems: of 121 distinct debt items, 58 describe wrong or missing behaviour. They also get closed: 103 are closed, 18 are open after iteration 13, eight of those with no task to remove them. What does not close is the plan: every item, including the 46 about wording and leftovers, travels through an architect turn and a task of its own, and the reviews of iterations 11 and 12 each opened a new milestone. `done` does not look at open debt at all, and nothing stops a goal that is not getting closer.
*Proposed reading.* Debt is material when it is about behaviour or a missing test; material debt blocks done and gets a task. Documentation and structure items go to the register and are closed by one sweep task per milestone. The script prints the distance to done at the top of every summary (pending tasks, open parks, open material debt) and, after two iterations in which it did not shrink, blocks the goal with a question to the owner.

**P2. A task's scope is a prediction, not a fence** (Escalation ladder, Funnel, Config-driven flows; R01, R15, R22).
The manifesto never says a planned task has a file scope. As built every task has one, it does two jobs, and both went wrong. As a fence it rests on the implementer's honesty: the kernel never compares a diff with the scope. Implementers kept to it all the same: of 54 merged tasks, 47 stayed strictly inside their scope, and only two made source edits outside it that no plan rule allowed (four files). An implementer that respects it parks as `upscope`: five of the eight parks through iteration 12, all five correct diagnoses of a scope drawn too tight, 13% of the run's tokens, one of them holding 13 tasks for an iteration. As a scheduling key it serialises the run, because two tasks with overlapping scopes never run together and most scopes named the same test directory.
*Proposed reading.* Scope predicts where the work will land; it serves scheduling and review. When gates are green and the extra files are outside every running task's scope, the reviewer records the widening and the task merges. A task parks only when it needs a file another task holds or one the plan marks off limits. Plans name test files per module. "Discard" becomes "park, keep the branch", and the script lands a kept branch that is complete and green at the next boundary without a new task.
*Alternative.* Keep the fence, enforce it at merge, and accept one extra iteration per misjudged scope.

**P3. One failure ladder for every role, owned by the script** (Model economics, Notes; R09, R29, R31).
The manifesto gives escalation to the architect. The owner's steer of 2026-11-13 gave PM failures to the script, and that ladder is built. Implementers still have none: a review cannot change the implementer's model, the task that would add it has been parked since iteration 7, and the `escalation` alias has not run one turn. Retries nest again: 145 of 172 turns were retried, and after a paid success the next attempt starts over at the exhausted free tier. Infra attempts sit outside the item budget and have no bound across relaunches (B12).
*Proposed reading.* One ladder for architect, PM, implementer and reviewer. A content failure (no outcome, invalid outcome, refusal, no progress) gets one fresh retry with the contract restated, then the alias's `escalateTo` with a broader mandate, then a block with the trace. An infra failure uses same-tier fallbacks and never climbs; the tier that answered stays selected for the rest of the launch; the same step failing on infra twice parks. A valid outcome counts whatever the session's stop was (B7). The architect chooses a tier only in advance, in the plan.

**P4. Never lose an architect turn to a cheap failure** (Iteration, Model economics, Context economy; R05, R10, R11, R14, R30).
The Notes name architect launches as v2's biggest cost at 47%. The ceremony is gone and the share is now 75%, $1.19 per launch. A turn is 15 to 45 requests, and each request re-sends the whole session at the cache-read price: 0.7 to 3.2 million cache-read tokens per turn against a few dozen fresh ones, on a plan that grew from 216 to 430 lines in four iterations. Three kinds of cheap failure wasted paid turns: a stale session crashed the architect in iterations 2 to 4, the architect ended iteration 8 waiting for its scouts without editing the plan, and PM turns without a usable outcome ended iterations 6 and 10 after the architect had been paid.
*Proposed reading.* When the plan has not changed since the last architect turn and the PM failed, the next launch resumes at the PM. An architect turn that ends without a plan edit or a decision gets one repair ask in the same session. The PM is chosen for reliability, not price: it is 0.3% of cost and gates the other 99.7%. The completeness check starts from a script-made delta (what merged, parked and opened since the last turn, with paths), so the turn needs fewer round trips; its cost is requests times session size. Scouts are recorded turns with their own cost line.

**P5. One meaning each for iteration, consult and boundary** (Iteration, Saga and hierarchy; R04, R06, R13).
*Proposed reading.* A boundary is the moment the script hands control to an architect. An iteration is the work between two boundaries of the same architect. A consult is the architect's turn at a boundary; there is none inside an iteration, and a "mid-iteration consult" is an early boundary. An escalated item is not a consult: it waits in the pack for the next boundary. A launch limit counts the top architect's iterations. Dependents of a spike that are already planned start when the spike lands; only work the architect has yet to plan waits for the boundary.

**P6. Close the outer loop inside the factory** (Orchestration artifacts, Bootstrap; R32–R34).
Decision D9 made merging the goal line and promoting the build operator work, because only a self-modifying target needs a pin. The result is about four operator acts per iteration, and the manifesto does not say who lands a goal's branch on the base for any target.
*Proposed reading.* Split the two. Landing is generic: when an iteration ends green, the script merges the goal line into the base behind the merged-result gates, or opens a pull request when the repo config says so. Promotion is for self-hosting only: after landing, run the no-model suite and one live smoke turn on the candidate, pin it, record which pin ran which iteration, and fall back to the previous pin when pre-flight fails. `--iterations N` then runs unattended and the owner's veto is a hold steer. The intervention metric counts operator acts.

**P7. Isolation for a run that modifies itself** (Operating assumptions; R27).
The sandbox assumption is documented nowhere, and an ambient sandbox would not have prevented what happened: the run's repository root is the operator's working tree, so the reviewer's own commit during iteration 13 parked a task (B1); package tests and the live run shared temp state twice; a PM turn tried `git checkout` on a task file in the live worktree; the gate script comes from the tree under test (B16).
*Proposed reading.* The factory runs against a dedicated clone, or treats the repository root as read-only input and checks only what a task can reach. Locks and launch recovery are per repository and touch only their own goal (B3). Gates and promotion use the pinned build's gate script. The goal directory is writable by the script and the owning role only, enforced by the harness and not by prompt text.

**P8. Build order: prove before widening** (Saga and hierarchy, Harness agnosticism; R07, R12, R24).
Hierarchy level 2 is the largest remaining build (six pending tasks) and has no measured need: none of 560 records has a context-overflow stop, with one architect on a 430-line plan. Harness breadth is the opposite case: asked for by the owner twice, and not exercised.
*Proposed order.* (1) The high-severity defects. (2) The unattended outer loop (P6). (3) The benchmark on the non-self target, which is also the first live run of the front agent, since the self goal already had a plan when the front landed. (4) A second benchmark leg with pi as implementer and codex as reviewer through acpx, then rotation. (5) Hierarchy level 2, started when an architect turn overflows or the plan passes a size the owner sets. Until then Saga and hierarchy stays intent and is marked "deferred, with trigger" in the evidence table, so the first done clause can be met without it.

**P9. Cost truth and quota** (Model economics, Stopping and debt, Config-driven flows, Bootstrap; R08, R20, R23, R35).
Limits are keyed per harness while quotas are per provider and model; the only throttle is a lock in a bootstrap script. 162 of 172 records store a cost of $0, so cost exists only in the aggregate and the 50x ratio cannot be measured. Compaction calls are not recorded (B20). Gate steps have zero-length timestamps, which hides 33 minutes of gate time in iteration 11. No wall-clock bound applies by default: iteration 7 was killed by hand.
*Proposed reading.* Concurrency slots per provider and model, in the kernel. A tier that returned a quota error is skipped for the rest of the launch. Priced cost is written into each record, with a second list-price figure for free-tier and subscription turns. Compaction and gate time are recorded. A default wall bound per turn and per iteration. "Subscription use" leaves the bounds unless a harness can report it. "Free first" is restated as: free models for single cheap steps, a paid cheap model for sustained work.

**P10. Keep what the owner reads small** (Funnel; R16).
*Proposed reading.* An iteration summary of at most 60 lines: status, distance to done, what merged, this iteration's parks by cause, decisions needed. Debt detail stays in the register. A park leaves the summary when its work lands. The status line follows the launch result.

**P11. Manifesto hygiene** (R25, R26, R28, R36–R40).
- Land the three propagated decisions whose text never arrived (resilience and fallbacks; value without over-constraining; practical knowledge).
- Decide or delete the seven `*Confirm:*` readings and N15, then make "All items decided" true.
- Move the binding N6 rule out of the advisory file into Intent.
- State the adapter policy in one sentence that covers the opencode adapter: a logged exception with an end date, or "acpx by default; a direct adapter where it gives the script what the protocol cannot".
- Strike or schedule what the text states as fact and the build does not have: the portability graph, LSP for the plan, the concern store, human-involvement presets, cache TTL as config, opaque config pass-through.
- Extend the Glossary with the terms listed in R40.
- Decide which mechanisms the build added are intent (`REVIEW.md`, "Built by practice").

**P12. Trivial and task classes** (Escalation ladder; R02, R03).
*Proposed reading.* "The same agent" means the same model alias with a fresh session and the front's pack as input; a session cannot follow the work into another checkout. Trivial changes pass gates and skip review. A task escalates to "bigger" when its reviewer or its implementer reports that the real scope exceeds the defined one; the kept branch and the report go into the architect's pack. The front chooses the class; the architect decides the extent of "bigger".

**P13. Steering semantics** (Steering and autonomy; R21).
*Proposed reading.* A steer holds only the tasks and gates it names; other in-flight work finishes and merges. A steer posted to a blocked goal reopens it (built in iteration 13). Two steers with the same text are two steers (B13). A steer the architect does not answer is presented again at the next boundary, and its hold expires after one iteration (B17). "Stop" is a steer that drains, and a first interrupt signal does the same (B4). A PM that cannot classify a steer passes it on unclassified.

### What remains to build

Ordered by dependency and value. "Section" is the manifesto section the item comes from.

| id | Item | Section | Size | Covered by | Handling |
|---|---|---|---|---|---|
| W1 | Fix the high-severity defects B1–B5 | — | S each | no task | One milestone, test first; see Handling strategy |
| W2 | Landing, promotion, rollback and relaunch without the operator | Orchestration artifacts, Bootstrap | M | no task; operator work by decision D9 | P6; owner decision 2 |
| W3 | Wall-clock bound per turn and iteration; park on repeated infra failure | Stopping and debt | S | no task | P3, P9; closes B12 |
| W4 | Distance to done, debt materiality, stop after idle iterations, `done` gated on material debt | Stopping and debt | M | no task | P1; owner decision 4 |
| W5 | Scope handling: widening at review or landing by script; test paths per module | Escalation ladder, Config-driven flows | M | no task | P2; owner decision 3 |
| W6 | Task-to-bigger escalation on upscope | Escalation ladder | S | `review-upscope`, pending | P12 |
| W7 | Advisory plan review by a weaker model | Model economics | S | `plan-review`, pending | keep |
| W8 | Benchmark run and comparison with the v2 baseline | Bootstrap | M, about 7 h | operator; kit merged in iteration 9 | P8; after W1 |
| W9 | Live pi and codex turns; harness rotation across iterations | Harness agnosticism, Bootstrap | M | `rotation-threaded`, parked by B1 with its uncommitted work saved in `salvage/`; no task for live legs | P8 |
| W10 | Usage document, sandbox assumption, intent-to-evidence table, stale docs | Operating assumptions, Bootstrap | M | `operator-docs`, `intent-evidence`, `doc-drift`, pending | keep |
| W11 | Hierarchy level 2: depth setting, epic derive, packs, consult, PM, reporting | Saga and hierarchy | L | six `epic-*` tasks, pending | P8: defer with a trigger; owner decision 1 |
| W12 | Implementer tier escalation | Model economics | S | `tier-escalation`, parked since iteration 7 | P3 |
| W13 | Concurrency per provider and model; sticky fallback tier | Config-driven flows, Bootstrap | S | no task | P9; closes B10 |
| W14 | Cost truth: priced cost in each record, list-price column, compaction spend, gate time, `costPerMergedTask` | Model economics, Bootstrap | S | no task | P9; closes B20, B21 |
| W15 | Intervention metric that counts operator acts | Bootstrap | S | no task | P6 |
| W16 | Summary cap; parks per iteration; status that follows the launch | Funnel | S | no task | P10; closes B22 |
| W17 | Isolation for self-hosting: dedicated clone or read-only root, pinned gate script, protected goal directory | Operating assumptions | M | no task | P7; closes B1, B15, B16 |
| W18 | Rehydration tolerance for torn outcome files: exists only as a hand fix (`e7d908d`) | — | S | no task | add a test and an owner in the plan |
| W19 | Pre-launch check for stale pins, reads outside the package, a gate command that cannot start | — | S | no task; named once in the journal | fold into pre-flight; closes B6 |
| W20 | Retention: 65 task branches, 6 worktrees (532 MB), 43 MB of transcripts; transcripts pruned while records cite them | Bootstrap | S | no task | retain by reference; closes B23 |
| W21 | LSP for the plan and YAML/JSON | Harness agnosticism, Notes | S | no task | build or strike; P11 |
| W22 | Git cleanliness heuristic with agentic revision | Notes | M | no task | build or strike; P11 |
| W23 | Human-involvement presets | Notes | M | no task | build or strike; P11 |
| W24 | Session portability graph; cache retention as config; opaque harness config pass-through | Context economy, Harness agnosticism, Notes | M | no task | correct the text or build; P11 |

### Bugs and unhandled edge cases

"Seen" says how each row is known: `run` means it happened in the self-run (record ids given), `test` means a test written for this review reproduces it at `b4a2d9f` (files in `bootstrap/reports/review-2026-11-13/repro/`), `review` means it comes from reading the code and was not reproduced.

| id | Severity | Case | Seen | Evidence | Handling |
|---|---|---|---|---|---|
| B1 | high | Containment blames the running turn for any change to the repository root. An operator commit or file edit during a turn parks the task and drops its work. | run: records 00559, 00560 | `src/kernel/worktree.ts:296-302`; edge-cases E2 | Check only paths a task can reach, or run against a dedicated clone; record an outside change as an incident (P7). |
| B2 | high | A red base switches gating off. Inherited red is matched by gate name and cached per commit, and this repository has one gate; a task that adds its own failure still merges. | test: `e5-repro.test.ts`; base red in records 00001, 00004, 00007 | `src/kernel/baseline.ts:41-43`; edge-cases E5 | Match by failing test or error signature; never cache an infra failure as base red; split the gate into typecheck and tests. |
| B3 | high | Launching a second goal deletes the first goal's checkout and task worktrees while it runs: recovery prunes the whole shared worktree root and the lock is per goal. Two repositories with one goal name and a shared root also share one checkout path. | test: `repro-e1.test.ts`, both variants | `src/kernel/worktree.ts:128-139`; edge-cases E1 | Recovery touches only its own goal; lock per repository; repository id in the checkout path. |
| B4 | high | A first interrupt does not stop dispatch. Queued tasks keep starting; only a second signal stops them, and it kills turns in flight. | test: `repro-e4.test.ts`, three more tasks started and merged | `src/kernel/dispatch.ts:148-151`; edge-cases E4 | Pass the drain controller into dispatch and stop admitting. |
| B5 | high | A model or harness failure at the boundary is filed as `blocked-by-user`, and the launch exits 3 as if it had hit the iteration limit. Five of twelve iterations were lost this way. | run: records 00006, 00009, 00012, 00101, 00290; test: `repro-e6-boundary-blocked.test.ts` | `src/kernel/boundary.ts:199-210`; edge-cases E6; forensics 6.2 | Fixed for the PM's infra case in iteration 13. Open for the architect: return an infra result, retry the boundary turn, exit 1 with the cause. |
| B6 | medium | A gate command that cannot start (exit 127) counts as the task's failure; the task parks as `empty-diff` although its work was committed. | run: records 00258, 00264, 00279, 00285; parks 00265, 00286 | `src/kernel/derive-task.ts:144-156` at `b4a2d9f`; forensics 6.1; edge-cases E8 | Fixed for the merge gate only. Treat gate start-up errors, timeouts and install failures as infra; stamp the cause on check records; advance a reused `base:` worktree to the integration head before the turn (`src/kernel/worktree.ts:207-221`). |
| B7 | medium | A valid outcome is thrown away when the session's stop is infra or cancelled. Two reviews were redone an iteration later. | run: records 00090, 00222 | `src/kernel/flow.ts:79-86` at `b4a2d9f`; forensics 6.4 | Accept a valid outcome whatever the stop; record the stop as an incident (P3). |
| B8 | medium | The PM can write frozen task files, and the restore replays a snapshot taken from the damaged state. `tasks/acpx-probe.md` is still corrupt; it cost iteration 10. | run: records 00106, 00228, 00238, 00290 | `src/kernel/pm.ts:35-84` at `b4a2d9f`; forensics 6.5 | Snapshot from a known-good source and verify the restore; frozen files read-only for the tool; track or checksum the goal directory. |
| B9 | medium | Scope overlap serialises the run: one shared test directory in most scopes held iteration 11 at one task for 309 of 369 minutes. | run: iteration 11 | `src/kernel/dispatch.ts:50-60` at `b4a2d9f`; forensics 6.6 | Test files named per module; overlap decided on files, not directory prefixes (P2). |
| B10 | medium | The retry ladder restarts at the exhausted free tier, also for the repair turn: 432 quota rejections, 12 turns with 8 attempts. | run: records 00020, 00109 | `src/harness/fallback.ts:66-86` at `b4a2d9f`; forensics 6.9 | Skip a tier that refused for the rest of the launch; the repair reuses the tier that answered (P3, P9). |
| B11 | medium | A stale session crashes the turn. Fixed for omp with one fresh retry; the opencode adapter still resumes blindly. | run: records 00006, 00009, 00012 | `src/harness/opencode/turn.ts:39-49` at `b4a2d9f`; forensics 6.3 | Check that the session exists before resuming, in every adapter. |
| B12 | medium | Timeouts and crashes never use the turn budget. A step that cannot finish is retried on every relaunch, up to an hour each time, without end. | test: `repro-e7-infra-timeout.test.ts` | `src/kernel/derive-task.ts:193-195`; edge-cases E7 | Park when the same step fails on infra twice (P3). |
| B13 | medium | A steer with the same text as an earlier one is archived silently: no architect turn, no reply. | test: `repro-e10-steer-dedupe.test.ts` | `src/kernel/mailbox.ts:144-146`; edge-cases E10 | Deduplicate only the same file in one window; write a reply when dropping (P13). |
| B14 | medium | One malformed hold or task file wedges every launch. A bad hold is never removed and each launch ends as infra; a bad task file makes each launch throw. | test: `repro-e12-holds.test.ts`, `repro-e13-tasks.test.ts` | `src/kernel/mailbox.ts:251-262`; `src/kernel/store.ts:105-113`; edge-cases E12, E13 | Validate what the PM writes and roll back; quarantine an unreadable file and report it. |
| B15 | medium | Agents can write the goal directory (records, tasks, holds) and commit in the integration checkout; containment does not see ignored files. A PM turn tried `git checkout` on a task file in the live worktree; only a wrong path stopped it. | run: record 00290; review | `src/kernel/worktree.ts:275-306`; edge-cases E17, E18; forensics 6.17 | Path allowlist enforced by the harness; goal directory writable by the script and the owning role only (P7). |
| B16 | medium | The gate script and the test command come from the tree under test, so a self-improvement task can weaken its own gate; promotion runs the candidate's own suite. | review | `src/kernel/gates.ts:23-31`; `bootstrap/promote.sh:34`; edge-cases E19 | Gates and promotion use the pinned build's gate script (P7). |
| B17 | medium | A steer the architect does not answer stays pending for good and its hold stays active; a goal hold then drains every later iteration at full architect cost. | review | `src/kernel/boundary.ts:166-174`; edge-cases E11 | Present it again once, then expire the hold and report (P13). |
| B18 | low | Nothing compares a merged diff with the task's scope. It has mattered little so far: 47 of 54 merged tasks stayed inside their scope, and two made source edits outside it that no plan rule allowed. | run: `cost-pricing`, `budget-drain` | `src/kernel/flow.ts:175`; edge-cases E16 | Decide P2; then either record the widening at review or refuse at merge. |
| B19 | medium | One exception in a task action ends the whole launch while sibling turns are still running. | review | `src/kernel/dispatch.ts:191,321`; edge-cases E9 | Catch per task, record a crash for that task, continue. |
| B20 | medium | Session compaction is an LLM call after almost every step. Its cost is not recorded or braked, and sessions that are never resumed are compacted too. | review | `src/kernel/flow.ts:176-181`; edge-cases E15 | Record and price it; compact only before a follow-up (P9). |
| B21 | medium | Cost and time are missing from the records: 162 of 172 turns store $0, and gate and commit steps have zero-length timestamps. | run | `src/kernel/pricing.ts:77-92` at `b4a2d9f`; forensics 6.8, 6.10 | Write priced cost and gate wall time into each record (P9). |
| B22 | medium | Summaries: the status never leaves `in-progress`, and the park section is cumulative. | run: summaries of iterations 8, 9, 11, 12 | forensics 6.14 | Derive the status from the launch result; list parks by the iteration they happened in (P10). |
| B23 | medium | Transcripts are pruned while records still cite them: 80 of 168 turns, all of iterations 5 and 7. | run | `bootstrap/run/self.yaml:56`; forensics 6.11 | Keep what a record cites. |
| B24 | medium | After a successful PM run, a pending task whose slug is not found in the plan is cancelled, including tasks with commits; a plan that writes `tasks/foo.md` does not match `foo`. | review | edge-cases E22 | Cancel only on an explicit plan statement; never cancel a task that has commits. |
| B25 | medium | Child processes inherit the full environment, provider keys included; gate output goes into records and prompts unscrubbed. | review | edge-cases E21 | Pass an allowlisted environment; scrub gate output like other details. |
| B26 | medium | Base gates are measured on the base branch, but tasks start from the integration head; a red integration head makes every task's gate red as new. | review | edge-cases E20 | Baseline the integration head. |
| B27 | medium | Nothing at goal level stops a goal that keeps planning: no cap on iterations without a merge. | review; pending tasks at 10 or more since iteration 9 | `src/kernel/launch.ts:207-305`; edge-cases E31 | P1. |
| B28 | low | Smaller cases, from code reading unless noted: a no-progress park on a correct no-op fix turn (run: record 00108); a merge attempt commits before its stop is examined; conflict resolutions get no review; the dollar brake resets each iteration; a failed front turn's `class.yaml` is reused unchecked; a dead lock-takeover marker blocks its task for good; a git process killed by a signal counts as success; a spike that finishes with nothing else running ends the iteration without starting its dependents; promotion has no live smoke turn and no rollback. | review | edge-cases E23–E30; forensics 6.15 | Fix when the file is next opened; the last one is part of P6. |

Checked and dropped: "a blocked goal never reads a steer" (edge-cases E3) no longer holds at `b4a2d9f`; `front-status` fixed it in iteration 13, and `repro-e3.test.ts` shows the steer being read. "Second-round turns get the first round's outcome path" (forensics 6.7) could not be confirmed: the prompts carry the right path. "The steer PM runs without validation or restore" (edge-cases E14) was closed by `steer-guards` in iteration 13.

### Handling strategy

1. **Safety first.** B1–B5 become one milestone ahead of everything pending. Each fix starts from the test in `repro/` that shows the defect today.
2. **Batch, do not chase.** The medium rows go into six tasks grouped by the code they touch: boundary and status (B5 remainder, B22); the failure ladder (B7, B10, B11, B12); mailbox and PM files (B8, B13, B14, B17, B24); scope and dispatch (B9, B18, B19); isolation (B6, B15, B16, B25, B26); measurement (B20, B21, B23). No row gets a task of its own. The low row is fixed when its file is next opened.
3. **Freeze the plan's growth until the distance shrinks.** Until the measure of P1 exists and has fallen two iterations in a row, the architect opens no new milestone, and review debt about wording or structure goes to the register.
4. **Who does what.** Factory tasks: W1, W3, W6, W7, W10, W12–W20 and the B rows, plus W2, W4, W5 and W11 once their decisions are made. Operator: the benchmark run (W8), the live pi and codex legs (W9), the journal corrections. Owner: the decisions below, and the text of P11.
5. **Verify by run, not by test count.** The suite grew from 188 to 436 tests while five of twelve iterations were lost to failures no test covered. Each milestone ends with a launch on the benchmark target.
6. **Generate the journal's numbers.** Six journal entries misstate cost or task state (`REVIEW.md`, "Journal corrections"). Iteration lines come from `metrics.yaml` and the records; the journal keeps decisions and interventions.

### Decisions needed from the owner

| # | Decision | Recommended | If not |
|---|---|---|---|
| 1 | Build hierarchy level 2 now, or defer it with a trigger (P8)? | Defer; hold the six `epic-*` tasks | The next launch starts `epic-plumbing` |
| 2 | Automate landing and promotion, reversing decision D9 (P6)? | Yes, behind merged-result gates and a rollback pin | About four operator acts per iteration stay |
| 3 | Scope as a prediction (P2)? | Yes, with the two park conditions | Keep the fence, enforce it at merge, expect upscope parks |
| 4 | Only material debt blocks done (P1)? | Yes | "No open debt" stays, and the goal has no reachable end |
| 5 | Steer B1–B5 into the next launch as its first milestone? | Yes, test first | They stay latent; B1 forbids any operator commit during a run |
| 6 | Run the benchmark (about 7 hours), then a pi and codex leg (P8)? | Yes, once decision 5 has landed | The second done clause stays at zero and pi and codex stay untested |
| 7 | Which proposals of P11 and which "built by practice" mechanisms become manifesto text? | Owner edits; the reviewer drafts on request | The inlines stay open |

Iteration 14 is not launched. Its first work would be the hierarchy chain, so it waits for decision 1.
