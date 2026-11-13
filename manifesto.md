# Agentic software factory — manifesto

Two sections. **Intent** is authoritative: the WHAT and its invariants; it changes only by my decision (clarified for feasibility). **Notes on implementation** are technical judgement: the important HOW, shiftable during development based on real behavior.

Supersedes `docs/factory.v2.md` and the design of `plugins/software-builder` wherever they contradict this document. The previous design is rejected: restrictive, loop-prone, noisy, not token-economical. Components and code are reusable (`plugins/software-factory`). Everything in v2 that is not rejected here is worth consideration; intent, principles and practical observation decide — avoid ceremony, stay focused on practical tasks.
## Intent

Modern harnesses deliver a decent story (several hundred lines of code). The agentic software factory is an orchestration framework on top of harnesses that delivers up to a saga (entire product) or a major refactoring — token-efficient, slop-free, steerable or autonomous, scalable from a trivial edit to a saga. One goal may span many epics and tens of tasks per iteration, across multiple resumable iterations; no hard-coded size ceiling.

### Escalation ladder
- One cheap-but-capable agent classifies the goal: trivial / task / bigger (epic, saga). For a task it defines the scope. It is not smart enough to decide how big "bigger" is — that is the architect's call.
- Trivial: the same agent implements.
- Task: does not reach the architect. Task review auto-escalates to "bigger" when the real scope exceeds the defined one. Everyone can make a mistake; escalation corrects it.
- Task or bigger: the same agent prepares the context pack — current status, infra (applicable compile/lint/test), relevant code facts. No separate triage/context-pack/infra steps: same context, same agent.

### Iteration
- An iteration is one architect engagement plus the orchestration it launches: the architect plans; the script orchestrates all tasks until they are exhausted or blocked. Each architect consult starts a new iteration.
- Every consult begins with a completeness check: is the work truly blocked or does it make sense to continue, and what is incomplete or must be redone among non-blocked items. Sub-epics get their own completeness check.
- Consulting the architect mid-iteration is the exception: measured, and optimized during bootstrapping. For now: a landed spike does not end the iteration — the iteration still runs to exhaustion; dependents idle until the boundary.

### Model economics
- Architect-tier (expensive) models do only what a human architect does: convert intent into actionable plans, directional interfaces, key-algorithm direction, tradeoffs above task level. Called with a prepared context pack; agentic and subagentic (scout/task); write no code beyond key interfaces and no verbose documents. The architect produces a single markdown plan written for architect/reviewer friendliness and efficiency — never schema-consistent files; token-burning maintenance of file schemas is not architect work.
- A weaker model can still usefully review the architect's plan: weaker reviewers find impracticality, unclarity, rule violations — and real bugs are not unusual. "Weaker reviews stronger" as advisory input, not as a veto. "Consider" spans the full range: from ignoring based on fact judgement, to clarifying the plan, to realizing "oops" and changing it.
- Architect-tier costs or subscription use are ~40–80x the cheap capable tier today (vs only 2–3x for human architects). Optimize overall cost on that ratio (~50x); quota management is not a primary purpose.
- Escalation to an expensive implementer-tier model (Sonnet/Terra class) only when a task goes wrong or needs a highly non-trivial class/PoC; the architect calls it, in advance or on review. Minimize its use.
- Consults are batched: delayed until non-blocked tasks are exhausted — the iteration boundary. Expensive models are used rarely and only when necessary.

### Context economy
- Same context: same agent. Different context: different agent.
- Reuse stored agent sessions within one harness. Across harnesses portability is directional and not always feasible: a graph records which way a session can move. Portable → continue from the pre-compacted session. Not portable → de novo, with the context pack and links to artifacts.
- Compact at the end of a session; reload the compacted session for consult, review, or next iteration. Use tree/branch summaries when a hot cache is unavailable or impractical. Compaction is transcript trimming — even server-side — not a handoff summary; the two serve different reuses and must not be confused.
- Plans are the architect's markdown, edited in place — never in flight; the architect owns them. A cheap PM turns the plan into tasks and lines: it identifies task files, owns the DAG and the dispatch sets, and resolves whatever cannot be derived deterministically (missing branches, misplaced artifacts). The PM is a paper-pusher, not a peer: it converts the architect's bullet-point vision into actual tasks, interpreting intent into more formal shape — splitting and merging tasks as the formalization requires. There is no PM/architect disagreement to resolve; the architect's intent governs. Tasks are named by short immutable slugs. The orchestrator reconciles execution state from a semantic diff. Never force whole-plan re-issue through a strict schema.
- Status is aggregated by the script from structured outputs / YAML artifacts, idempotently; the context pack is prepared from it.

### Saga and hierarchy
- Hierarchy depth is bounded by config: 1 architect level is the norm, 2 the expected maximum. A subarchitect is split off only when the size/complexity of architecture context demands focused context; the architect owns all planning and review down to that level. Untouched levels are not invoked.
- Strict chain: task-level consults go to the architect responsible for that epic (epic→architect may be many-to-one). The subarchitect filters and consolidates escalations into one brief upward; implementers/reviewers never reach past their architect.
- Each subarchitect owns the status summary of his iteration. Task dispatch stays in the single script. On each iteration the main architect decides the subarchitect set and may leave out an architect whose job is done; the architect register is maintained as part of the saga plan.
- One orchestration script owns everything down to task level — through a harness abstraction that knows each harness's capabilities and orchestrates the chain of architects accordingly. It does not drive every harness directly and uniformly.

### Funnel: only the remarkable
- implementer → reviewer → architect → [top architect] → human. Each stage filters.
- Each stage sees a different scope: the implementer sees one task, the reviewer its diff against the task, the architect the epic's interactions, layers and sequence. That perspective gap is the point — it holds even between same-class models (or humans), which is why the task flow uses separate steps rather than one agent doing everything.
- Implementers over-report trivia; the reviewer decides what is different/additive to the plan and worth architecture attention. Even a same-model reviewer with a different focus adds a lot.
- Reviewer pairing is per task-type flow in config; there is no separate integration "wave review" — the iteration's completeness check at the next architect consult is the integration point. The reviewer's prompt and context differ from developer/QA: tailored to the focus of the review, not the implementation context — not the implementer's edits, not its reasoning about what to edit.
- Concerns (technical debt, risks, uncertainties, design choices) and remarkables propagate up the chain; calibration lives in config prompts: FYI-only / blocked-by-architect / blocked-by-user. Not spam.
- Files stay on disk; the architect can scout/read instead of receiving pasted content.

### Uncertainty and spikes
- Risk, uncertainty, complexity first. A milestone may defer detail until a spike lands ("XYZ details after spike"); implementation work already unblocked proceeds in parallel. Orchestrate all.
- The architect issues what it can direct now plus the spikes: "I need modules X, Y, Z; X is clear (T1, T2); Y needs a spike (research, PoC, a couple of interactions); Z depends on Y" → issue T1, T2 and the spike, then decide next steps.

### Stopping and debt
- The architect is incentivized to stop: goal met → done; no infinite continuation.
- Stop criteria, stated in the prompt: the goal is met, or no more meaningful development is possible without owner feedback; no new technical debt introduced, no slop introduced, clean-code principles met. A goal's own formal acceptance criteria apply when it has them.
- On relaunch of the same goal, the architect first reviews the implementation for technical debt and gaps (from compacted or de-novo context), then plans. Historic debt may need addressing to enable the goal; the rule is: no new debt created by the goal.
- The architect may authorize temporary technical debt; removal by the end of the same goal.
- Bounds: a launch limits the number of iterations; review cycles are bounded; optional limits on $ / subscription use / time per iteration. On a per-iteration budget hit: drain — no new dispatch, in-flight work finishes within its own bound.

### Steering and autonomy
- Config-driven. Under the current calibration the architect records a reversible assumption, notes it as remarkable, and continues; the user steers/overrides. The process-config prompt defines what the architect may decide alone vs what blocks on user input.
- Mailbox, not ACK protocol: the user drops files to steer; the user sees remarkable notes (iteration summary, concerns, open questions) — at least one remarkable entity per iteration (the iteration summary is the guaranteed one), never spam.
- The script monitors the mailbox at startup and during a run. A cheap "PM" agent converts each steer into structured artifacts and decides which task or gate it blocks. In-flight tasks finish and park unmerged; pending ones hold; the architect consult waits until the unblocked remainder of the DAG is also exhausted. Fundamentally every steer goes to the architect; it is then marked processed by the architect, with the architect's response in the outbox.

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
- Concurrency: an absolute limit and limits per harness, in config.
- Config has a schema and pre-flight validation.

### Harness agnosticism
- Works through any acp-compatible harness with opaque config passed at launch (command-line args, env, or config files depending on the harness). omp is a special case that simplifies things, not a dependency; extra tools exposable through ACP. Supported and tested during bootstrapping: omp, OpenCode, codex, pi — with harness rotation across iterations so no harness-specific assumption survives untested.
- Each harness has a role it is best at, discovered during bootstrapping and recorded in run configs, not in code: pi is the recommended task-flow implementer (minimal, great at the single task); omp and OpenCode fit spikes better out of the shelf, where subagent expansion matters; omp carries structured output in the orchestration folder, with LSP configured for YAML/JSON there (other harnesses' LSP support is unverified).
- Resilience and fallbacks are important. omp provides model fallbacks; fallback across harnesses (e.g. an OpenCode free model → OpenCode Go through omp) is nice to have.

### Operating assumptions
- The entire factory is assumed to run inside a sandbox (e.g. bubblewrap); this is documented, not enforced. Sandboxing individual harnesses can come in a subsequent iteration.
- Which models see which code (training/retention policy) is my run config, not a factory deliverable.

## Notes on implementation

### Reuse from plugins/software-factory
Keep: worktree/commit/head-guard mechanics, record discipline, concern store + fingerprinting, mailbox, harness adapter, budget/limits, checks runner, derived state. Reject: 21 schemas, separate triage/context-pack/infra steps, ADR-on-everything, code-line-oriented plans, strict-schema plan re-issue. The ADRs v2 produced (`docs/adr`) are agentic spam — one of the reasons v2 is not acceptable — and bind nothing.

Already true in v2, keep rather than rebuild: templated prompts with partials, slug task ids, execution state stored apart from the plan, status derived from on-disk records, human-involvement presets (autonomous / principal / detailed).

### Known loop causes to design out
- Nested retry budgets compound (step attempts × fix rounds × consults × plan reviews × amendments). Budget the whole item, not each nest.
- No-progress detection compared only the last fingerprint, allowing alternation loops. Compare history.
- Plan review/PM bounce re-issued whole plans. Editable plan + diff kills this.
- `plan-goal-execution.md` said "keep going until complete" with no debt gate; preserve its economy rules (direction-not-spec, telegraphic, adversarial grounding, V&V inside dev tasks) but add stop incentive, spike-deferred milestones, subepics, debt review.
- Architect-role launches were the biggest single cost: 81 launches, 21.7M input tokens, $5.22 of $11.01 in the last run (wave reports, close-ups, PM edits, plan reviews, consults — full combined accounting in `manifesto.advice.md` §1, including 103 item-level launches the old 158-launch headline missed). The iteration rule above removes the ceremony; usage records need cache fields before architect context is fully measurable.

### Strict schema output
- Strict schema (tool/yield) only for small, simple outputs.
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

### CRITICAL — bootstrap
This factory is built by running itself one iteration at a time. Iteration 0: the agent that ingests this file and `manifesto.advice.md` prepares the minimum new version based on v2 (`plugins/software-factory`), launches it, and starts bootstrapping. Each launch: a cheap scout distils the previous run's artifacts/transcripts into an evidence digest for the architect's context pack (cost by role, loops, failures, interventions, with paths); the architect reads the digest and drills down by path. Session store lives outside worktrees and outside git (path in run config, last N runs kept).

Always execute from a pinned last-good version, never from the tree being edited; promote after the no-model E2E suite passes. Metrics per iteration: architect launches, architect share of cost, cost per merged task, loop incidents, human interventions; one fixed benchmark goal re-run each time (baselines in `plugins/software-factory/docs/runs`).

#### Bootstrap models/harness
- Architect: Claude Opus 5.5 at high (omp, Claude Code).
- Escalation implementer: Sonnet 5.5 — exists in our environment; minimize use.
- Subscriptions: omp, OpenCode, codex and pi all run on the OpenCode Go subscription; omp additionally on the Claude subscription (Opus/Sonnet). Self-improvement runs cover both legs: codex through OpenCode Go (muse/deepseek) and Claude through omp (Opus architects, Sonnet escalation).
- OpenCode Go subscription: beam-free (least capable; steer ingestion, schema fixes, commits); capable implementers deepseek-v4.1-flash and muse-spark-1.3-contributor — through omp, codex, OpenCode.
- OpenCode-only free models (OpenCode harness only): glm-5.3-flash-free, deepseek-v4.1-flash-free (most capable), minimax-m3.1-flash-free, mimo-v2.6-flash-free, inkling-2-small-free — reasonably capable for development tasks.
- Leverage OpenCode with the free models early in bootstrapping: front agent, review, PM structuring and evidence digests run there first; paid tiers only where the free models demonstrably fail. Promote a step to a paid tier on measured failure, not by default.
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
- Sandbox assumed around the whole factory; data policy is run config → Operating assumptions.
- acpx as generic layer, adapters fine, direct layer where native beats ACP → Harness access layer.
- Hygiene: simple homegrown checks allowed where no OSS exists → Git hygiene.
- Artifact merge wording corrected → Orchestration artifacts.
- v2: import everything reasonable; ADRs are spam → preamble, Reuse.
- Iteration 0 by the ingesting agent on top of v2; Sonnet 5.5 as escalation tier; hobby config ≠ production → Bootstrap.
- Architect and advice add value by knowledge and reasoning without over-constraining (chat, same day) → Model economics.
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
