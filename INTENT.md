# Agentic software factory — INTENT

**Intent** is the WHAT and its invariants; it changes only by owner decision. **Notes on implementation** are the HOW, shiftable on real behavior. Status and evidence do not live here — they live in iteration summaries and the dashboard. The one exception is *Concerns and contradictions* at the end of the notes: owner-confirmed points where the current build falls short of the intent; an item is deleted once it is fixed.

This document supersedes `docs/factory.v2.md` and the design of `plugins/software-builder` wherever they contradict it. Components and code are reusable; everything in v2 not rejected here is worth consideration — intent, principles and practical observation decide. Avoid ceremony; stay focused on practical tasks.

## Intent

Modern harnesses deliver a decent story (several hundred lines of code). The agentic software factory is an orchestration framework on top of harnesses that delivers up to a saga (an entire product) or a major refactoring — token-efficient, slop-free, steerable, observable, autonomous, scalable from a trivial edit to a saga. One goal may span many epics and tens of tasks per iteration, across multiple resumable iterations; no size ceiling.

- Stop in the middle, relaunch — it keeps going; no architect intervention required.
- The saga flow (hierarchy) is required and built as specified.

### Model economics
- Architect-tier (expensive) models do only what a human architect does: convert intent into actionable plans, directional interfaces, key-algorithm direction, tradeoffs above task level. Called with a prepared context pack; agentic and subagentic — launching scouts/tasks and waiting for them is fine, no limits on them. Write no code beyond key interfaces and no verbose documents. Each architect produces one markdown plan, written for architect/reviewer friendliness and efficiency — never schema-consistent files; maintaining file schemas is not architect work.
- The architect's plan is reviewed for impracticality, unclarity and rule violations — real bugs are not unusual. Which model reviews is config: task tier or frontier, always from a fresh context. Advisory input, not a veto. "Consider" spans the full range: from ignoring based on fact judgement, to clarifying the plan, to realizing "oops" and changing it. During self-improvement the architect samples whether the review was helpful (one issue caught earlier reduces work 10x).
- Architect-tier costs or subscription use are ~40–80x the cheap capable tier (vs 2–3x for human architects); the architect outweighs the bill. Optimize overall cost on that ratio (~50x).
- Measure both actual cost and work: per-model cost and token use (assume the prefix is cached when not reported separately), number of turns, and work done — edits, test runs, etc. Subscriptions under-report prices (e.g. OpenCode Go may count deepseek as free). Prices are reported by the harness or retrieved from OpenRouter, with a local cache; nothing is hardcoded.
- Quota management is not a primary purpose; subscription throttling and fallback in dispatch is a feature (see the concurrency rule in Config-driven flows).
- Escalation to an expensive implementer-tier model (Sonnet/Terra class) only when a task goes wrong or needs a highly non-trivial class/PoC; the architect calls it, in advance or on review. Minimize its use.
- Consults are batched: delayed until non-blocked tasks are exhausted — the iteration boundary. Expensive models are used rarely and only when necessary.

### Context and focus are as important as model tier/diversity
- It is a popular belief that improvement needs a smarter model and provider diversity, and that planning needs a very smart model. That is not entirely true.
- Smaller models:
    - are more likely to make suboptimal decisions;
    - degrade more quickly on tasks with contradictory and/or complex context, tasks needing trade-offs, etc.;
    - work quite well on a well-defined, focused task, even when the task is of an architecture or planning nature. E.g. a smaller model can perfectly plan or define an architecture; it degrades when it has to consider call graphs and edge cases at the same time.
- The same model, small or large, can perfectly review results, even those of a larger model. At the end of the day, the job of the smarter actor is to make sure results AND motivation are understandable to small actors.
- Consequence: well-defined planning and review work may go to task-tier models.

### Model diversity
- When several suitable models are available (there are many at task and mechanical level), different steps of the same flow are assigned to different models. This is config-driven — the factory config specifies it with aliases. E.g. task implementer: switch model on retry, especially inside one multi-model harness that can reuse the compacted transcript.

### Role of agents/models — a conceptual section that helps to interpret everything below
- Architect agent: preferably runs on large frontier-level models (Opus, Fable, Astra, Kimi). The architect's job is to decide what needs to be done to bring the project to the state specified by the intent (build from scratch or evolve an existing codebase) without introducing new technical debt or breaking existing functionality. In a saga's hierarchical process the architect relies on subarchitects to handle sublayers, so he does not need to look at the entire codebase. The architect (same context) doubles as code reviewer: he looks at the net changes since the project start. At each iteration the architect's job is to:
    - specify the entire set of tasks, arranged in a DAG/milestones, needed to complete the project;
    - call out specific uncertainties that can be removed by spikes or foundational tasks, and plan up to the resolution of those uncertainties.
- Architect reviewer: a frontier or a task-level model, per config; fresh context. The architect can improve based on the feedback, sometimes by providing more grounding/explanation in the plan.
- Task-level models include DeepSeek v41 1017, Muse/Ember, Luna, Haiku (currently of limited sense due to the 100k-context price increase), Gemini Flash/Hydrogen, etc.
- PM: owns the implementation of the plan — moving tasks around, repairing artifacts, providing environmental steering addendums, ingesting user steers. Not technical: he owns artifacts, the DAG, and splits/changes beyond what mechanical orchestration handles.
- Task-level agents are arranged into config-driven flows depending on the type of the task: the list of task types, agents and prompts is config-driven, not hardcoded in the kernel. The kernel knows spike (no code change expected) vs development. Each task flow is a DAG, bounded and retriable. Examples of task types:
    - spike
        - fact-finding — figure something out (universal, or split into separate types: library / codebase / web research / computer-use test / specialized review)
        - PoC
    - development
        - normal dev
        - documentation only
        - e.g. backend dev vs dev with computer use (a separate task type is required, e.g. for a dashboard: an extra QA agent in the flow tests the integration)
- Task types come from config, which supplies the file names of their prompts. Schemas are the demarcation between tasks and kernel code: the kernel supports a fixed number of schemas, and every output that has to be verified or ingested by the kernel follows one of them. A task type names which of these schemas its output follows; it never supplies its own.
- Merge agent: involved when a conflict or test regression occurs as the result of a merge.
- Plan checker: a specialized agent that sees whether the current plan (architect output) can be meaningfully progressed as a net positive gain before the architect is involved — a task-level gatekeeper for the architect.
- Triage: see Escalation ladder.

### Escalation ladder (triage)
- One cheap-but-capable agent classifies the goal: trivial / task / bigger (epic, saga). For a task it defines the scope. It is not smart enough to decide how big "bigger" is — that is the architect's call.
- Trivial: the same agent implements, in the same session (reusing the context it already built): after receiving the classification, the kernel sends a follow-up prompt with the location/branch.
- Standalone task: does not reach the architect. Its review re-prompts the task scope (the shared scope definition used by triage/planner — a single include) and asks whether the real scope is substantially higher than planned and the result requires architecture input; if so it auto-escalates to "bigger". Everyone can make a mistake; escalation corrects it. A task that is part of an epic is not a standalone task.
- Task or bigger: the same agent prepares the context pack — current status, infra (applicable compile/lint/test), relevant code facts. No separate triage/context-pack/infra steps: same context, same agent.

### Iteration
- An iteration is one architect plan and its implementation: the architect plans; the script orchestrates all tasks until they are exhausted or blocked. Each architect consult starts a new iteration. Unless the run is stopped, an iteration finishes within one launch; a launch specifies the maximum number of iterations.
- The architect plans the road to completion, not one iteration's slice: as much work as makes sense given the uncertainties. Where a detail cannot be settled yet he says so explicitly — deferring a feature until a named spike or foundational task lands — and plans the unblocked work in parallel.
- Every consult starts by evaluating the project against the intent — completeness, quality, correctness of the implementation so far — not merely the previous iteration's work. Is the work truly blocked or does it make sense to continue; what is incomplete or must be redone. In a saga, the architect defers to subarchitects for details in their domains; sub-epics get their own completeness check. Two in one: the same context serves evaluation and planning.
- Before the architect: a plan checker verifies the plan's status against the repo, with bounded repeats — it may name things to do before the architect is involved; its findings go back to execution, and the iteration keeps progressing, before the architect is consulted (see v1: `plugins/software-builder/agents/plan-completeness-checker.md`, loop in `plugins/software-builder/skills/software-builder-asset/goal_flow.py`).
- A launch after an interrupt (mid-iteration stop, quota, computer reboot) is a script relaunch: no architect, no digest. If the resumed state is problematic, the script repairs it with an agentic PM turn and/or the plan completeness checker, with a budget for extra retry.
- Scope: the architect predicts a reasonable, non-overlapping scope per task. He does not name files — a waste of tokens. Tasks may touch the same files; nothing enforces which files a task touches. Normal development.
- End-of-wave steward (v1 wave checker; omitted when there are no conflicts): merge, resolve conflicts, run CI/CD, fix the obvious, record concerns for the non-obvious, decide what to hold. DoD: branch state ready for the next wave; task status revised if unmerged. Tasks that did not merge are relaunched to port on top of the new branch state. Conflicts are normal during development, sometimes logical (test failures). The steward is compacted at the end and relaunched as needed. Merge ladder: a workhorse-class merger resolves trivial conflicts → unresolvable goes to the architect with a pointer to the overall status plus the worktree and branch of the problematic item.
- Why: too-tight scopes, no end-of-wave merging with repeat, and no plan status check before the architect cause rework and conflicts.
- The kernel ensures every agent delivers. An agent that ends its turn without delivering is asked again — e.g. the architect: "You need to deliver. Specify actions, including spikes if needed to plan more, in the plan; or declare the build done [if allowed by config], or blocked till done." The ask is a prompt template from config; its exact shape depends on the agent.

### Context economy
- Same context: same agent. Different context: different agent.
- Reuse stored agent sessions within one harness. Across harnesses portability is directional and not always feasible: a graph records which way a session can move. Portable → continue from the pre-compacted session. Not portable → de novo, with the context pack and links to artifacts. Any session that cannot be resumed → logged as error, started de novo.
- Compact at the end of a session; reload the compacted session for consult, review, or next iteration. Compaction is both cost saving (fewer tokens on restart) and context management (drops previous reasoning on a fix-up launch of a task or on the architect's next iteration). Compaction is transcript trimming — even server-side — not a handoff summary; the two serve different reuses and must not be confused. No tree/branch summaries.
    - Compaction kills two birds with one stone: a cold retry does not pay for the entire transcript, and the context is adjusted so concerns/suggestions get decent consideration. Reusing the compacted session also saves rebuilding the entire context from scratch; on reuse the agent rereads what it needs.
- Plans are the architect's markdown, edited in place — never in flight; the architect owns them. A cheap PM turns the plan into tasks and lines: it identifies task files, owns the DAG and the dispatch sets, and resolves whatever cannot be derived deterministically (missing branches, misplaced artifacts). The PM is a paper-pusher, not a peer: it converts the architect's bullet-point vision into actual tasks, interpreting intent into more formal shape — splitting and merging tasks as the formalization requires. There is no PM/architect disagreement to resolve; the architect's intent governs. Tasks are named by short immutable slugs. Never force whole-plan re-issue through a strict schema. Diffing serves only to inform the (compacted) PM of plan changes on subsequent iterations.
- Status is aggregated by the script from structured outputs / YAML artifacts, idempotently; the context pack is prepared from it.
- The context pack is an index: derived status, infra commands and code facts as paths — links, not content. No artificial caps; even when capped, the pack includes the files the architect needs to read agentically.

### Saga and hierarchy
- Hierarchy depth is bounded by config: 1 architect level is the norm, 2 the expected maximum. A subarchitect is split off only when the size/complexity of architecture context demands focused context; the architect owns all planning and review down to that level. Untouched levels are not invoked.
- Strict chain: task-level concerns go to the architect responsible for that epic (epic→architect may be many-to-one). The subarchitect filters and consolidates escalations into one brief upward; implementers/reviewers never reach past their architect. The hierarchy build defines the "top architect".
- Each subarchitect owns the status summary of his iteration. Task dispatch stays in the single script. On each iteration the main architect decides the subarchitect set and may leave out an architect whose job is done; the architect register is maintained as part of the saga plan.
- One orchestration script owns everything down to task level — through a harness abstraction that knows each harness's capabilities and orchestrates the chain of architects accordingly. It does not drive every harness directly and uniformly.

### Funnel: only the remarkable
- implementer → reviewer → architect → [top architect] → human. Each stage filters.
- Each stage sees a different scope: the implementer sees one task, the reviewer its diff against the task, the architect the epic's interactions, layers and sequence. That perspective gap is the point — it holds even between same-class models (or humans), which is why the task flow uses separate steps rather than one agent doing everything. Sample and investigate whether it works as intended.
- Implementers over-report trivia; the reviewer decides what is different/additive to the plan and worth architecture attention. Even a same-model reviewer with a different focus adds a lot.
- The reviewer shall be a task-grade model.
- Reviewer pairing is per task-type flow in config; there is no separate integration "wave review" (the end-of-wave steward merges, it does not review) — the iteration's completeness check at the next architect consult is the integration point. The reviewer's prompt and context differ from developer/QA: tailored to the focus of the review, not the implementation context — not the implementer's edits, not its reasoning about what to edit.
- Concerns (technical debt, risks, uncertainties, design choices) and remarkables propagate up the chain; calibration lives in config prompts: FYI-only / blocked-by-architect / blocked-by-user. Not spam. The remarkable at each level always includes "what is achieved" and "what is of concern".
- Files stay on disk; the architect can scout/read instead of receiving pasted content.

### Uncertainty and spikes
- Risk, uncertainty, complexity first. A milestone may defer detail until a spike lands ("XYZ details after spike"); implementation work already unblocked proceeds in parallel. Orchestrate all.
- The architect issues what it can direct now plus the spikes: "I need modules X, Y, Z; X is clear (T1, T2); Y needs a spike (research, PoC, a couple of interactions); Z depends on Y" → issue T1, T2 and the spike, then decide next steps.

### Stopping and debt
- The architect is incentivized to stop: goal met → done; no infinite continuation.
- Stop criteria, stated in the prompt: the goal is met, or no more meaningful development is possible without owner feedback; no new technical debt, no slop, clean-code principles met. A goal's own formal acceptance criteria apply when it has them.
- Done = shippable and tested: maintainable code satisfying repo rules; no new technical debt (clean code, coverage rules satisfied); no known bugs; comprehensive testing; workmanship aligned with intent. Debt about wording and structure may close with a sweep per milestone; behaviour and test debt keep a task. Done detection sees open debt; the summary shows the distance (pending, parks, open debt), and that distance shrinks before new milestones open.
- On relaunch of the same goal, the architect first reviews the implementation for technical debt and gaps (from compacted or de-novo context), then plans. Historic debt may need addressing to enable the goal; no new debt created by the goal.
- The architect may authorize temporary technical debt; removal by the end of the same goal.
- Bounds: a launch limits the number of iterations; review cycles are bounded; optional limits on $ / subscription use / time per iteration. On a per-iteration budget hit: drain — no new dispatch, in-flight work finishes within its own bound.

### Steering and autonomy
- Config-driven (the criteria are part of the config, assembled into the prompt by the template system). Under the current calibration the architect records a reversible assumption, notes it as remarkable, and continues; the user steers/overrides. The process-config prompt defines what the architect may decide alone vs what blocks on user input. Human-involvement presets (autonomous / principal / detailed) select the calibration.
- Mailbox, not ACK protocol: the user drops files to steer; the user sees remarkable notes (iteration summary, concerns, open questions) — at least one remarkable entity per iteration (the iteration summary is the guaranteed one), never spam.
- The script monitors the mailbox at startup and during a run. Steers do not interrupt work: running tasks finish and pending work keeps dispatching.
- A cheap PM handles what needs no architect: a task-specific steer, or one that requires a redo or change, is handled by the PM; a small task or spike to report back to the owner is dispatched by the PM.
- The architect is involved when a steer amends the intent (handled automatically at his involvement) or needs an architecture decision; an urgent steer that pulls the architect in is the exception.
- A steer may stall the run when, given the steer, no pending task still has value, or when the user asks for a priority that is not planned: tasks drain, then the architect is involved.
- Every steer ends processed, with the response in the outbox. All these steer scenarios are built and tested during self-improvement.
- Intent-change steer: when a steer clearly adds or modifies intent, the goal's intent is updated — preferably by a dedicated cheap agent — preserving user instructions. The intent stays consolidated: the latest input wins and superseded text is removed. No interpretation, just carry over the edits. The architect on the next launch sees what changed from the diff and the steer record.

### Status reporting and dashboard
- The user sees status — intent-wise what works / is not yet built / has friction, plus mechanical/technical concerns. Easily accessible, understandable, clickable.
- A high-quality HTML dashboard (use a library) efficiently presents mechanical status, costs, and intent completion. Either html/json files updated by the kernel at least after each agent launch or finish, or an HTTP server on localhost that supports parallel builds (e.g. different ports). As much "use", not build, as possible.

### Clean code and architecture
- Test real behavior. Bottom-up implementation + vertical slices + iterative.
- These rules specify the result; the build approach is separate. Build priorities: uncertainties, then layers handling edge cases, then tested slices of user-visible functionality; exact ordering is decided case by case.
- Edge cases, security posture, failure propagation/containment, observability, performance are architectural direction from day one.
- Comments: why, only for non-trivial code. Self-documenting code over docs.
- Public interfaces separate from implementation, preferably separate files; interface docs readable by humans and agents alike.
- Where the target repo has its own conventions, the repo's win; these rules are defaults.
- ADR is a high bar: a long-term decision shaping the project or a whole layer; concise decision/enablement-vs-limitation, tradeoff vs alternative. Not routine decisions, not normal consult outcomes.
- The factory applies this to itself: autoformat, lint, schema checks of all schema-enforced files/configs (see Stack for what lint enforces).
- All prompts follow the prompt-debloat principles (`/home/slava/aiexp/software-builder.dev/plugins/prompt-engineering/skills/prompt-debloat`).

### Config-driven flows
- Three config layers, separated by concern: each concern lives in exactly one layer, and no layer restates another's.
    - Repo config: locations, paths, gates.
    - Factory (process) config: bounded flows as DAGs, task types, agents and prompts, which kernel schema each output follows, calibration, and model alternation — all expressed with aliases, never with models. It names the aliases it requires.
    - Local config: the one config that defines the available harnesses and models (or harness-level aliases), fallbacks, and their mapping to aliases, plus extra opaque acpx-compatible options passed through to the harness untouched. Some aliases are mandatory for the kernel (e.g. architect); others are required by the factory config. For special harnesses such as omp it is rendered into a transient run config.
- Not a single model is hardcoded anywhere in code — neither in the kernel nor in a harness adapter. Not a single harness is hardcoded unless it has a justified custom adapter. Models and acpx harnesses appear only in the local config.
- Flows are data: e.g. "just implement", "implement/review", "TDD: ingest → record known problems → stubs → implement/QA/review/security review". Adding an agent to ingestion, a task-type flow, or the PM flow is a config edit; agent types and task flows can be added or commented out. More spike/agent types are configurable — e.g. for a dashboard: computer-use tests, design/usability review. Templating serves the architect flow too. The script surface is the kernel's fixed set of schemas: agent produces, script reads. A new schema is a kernel change, not a config edit.
- Prompts are assembled from shared fragments and single-definition templates — never copy-pasted. Use a well-established templating engine, not DIY: LiquidJS (strict TypeScript, `{{ var | filter }}`, CLI `npx liquidjs`, custom filters, async tags), Eta (TypeScript-native, ~3.5 KB, partials, plugins) or Nunjucks (Jinja2-like macros, block inheritance).
- Review retries configurable, with follow-up options: same agent on compacted context, different model, or de novo.
- Task review: two rounds by default, configurable. The last round decides: negative value → park, keeping the branch, until architect feedback; or record concerns/technical debt and go ahead. A kept branch that is complete and green lands at the next boundary without a new task.
- Concurrency in config: an overall limit plus limits per provider (e.g. in parallel 1 session on OpenCode free, 2 on OpenCode Go, 1 on Antigravity). Dispatch throttles per subscription and falls back.
- Config has a schema and pre-flight validation.

### Harness agnosticism
- Works through any ACP-compatible harness with opaque config passed at launch (command-line args, env, or config files depending on the harness). omp is a special case that simplifies things, not a dependency; extra tools exposable through ACP. Supported and tested: omp, OpenCode, codex, pi, Claude Code, agy (Antigravity CLI) — with harness rotation across iterations so no harness-specific assumption survives untested.
- The build is harness agnostic. Which harness does which role best is discovered during bootstrapping and recorded in run configs (default/exemplary config), never in code. Starting hypotheses: pi is the task-flow implementer (minimal, great at the single task); omp and OpenCode fit spikes better off the shelf, where subagent expansion matters.
- Harness adapters: a custom adapter only when the harness offers substantially more than ACP exposes (omp is that case: RPC, yield, compaction, overlays). Otherwise drive the harness through acpx (OpenCode included), or at worst plain ACP — never a bespoke CLI wrapper for what the protocol already covers. No code: the config uses acpx naming (and opaque config), and that is it.
- acpx is the enabler of agnosticism: an acpx-compatible harness is expected to be added by configuration alone, with no code change. A direct layer for such a harness is allowed later only on measured evidence that ACP loses something needed.

### Operating assumptions
- The entire factory is assumed to run inside a sandbox (e.g. bubblewrap). The sandbox assumption is documented; building the factory sandbox is out of scope for now. Sandboxing individual harnesses can come later.
- Which models see which code (training/retention policy) is the owner's run config, not a factory deliverable.

### Delivery
- The factory is a plugin with a skill "run factory": where to put the intent, how to configure, what to launch, what to see, where the user sees the HTML; kernel and config are skill resources.

## Notes on implementation

### Loop causes designed out
- Over-prescription and mechanical checks on agent output (e.g. which files changed) create loops and no value. A turn is judged by what the agent delivers, the gates and the review; a check on agent output stays only on evidence that it prevents real defects.

### Structured output
- Strict schema (tool/yield) only for small, simple outputs. The plan is markdown; the PM derives task files from it.
- Every agent that produces a schema-controlled file (PM, task reviewers, QA) has a validation command in its prompt (bun/npx, whatever) and, where the harness supports it, LSP. The factory artifact folder must have a config file — preferably harness agnostic — that enables LSP for the artifact schemas. Test at least for omp.

### Architect plan → PM task files
- The architect writes one markdown plan; the PM derives task files, the DAG and the dispatch sets. The architect never maintains schema-consistent files.
- Reconcile is deterministic where it can be (done tasks frozen, rework as a new slug, pending tasks re-read at dispatch); the PM resolves what determinism cannot — missing branches, misplaced artifacts, ambiguous mappings.
- Diffing library choice is the implementer's (id-keyed matching if arrays are compared; microdiff is index-based and fails that).

### Harness access layer
- omp RPC (JSONL) is far more capable than ACP: compact, fork, subagent steering/IRC, host tools. Special-case it; with omp as architecture harness, subarchitects can be subagents reachable through IRC — one strategy of the capability-aware layer, still owned by the script.
- omp subarchitect: a subarchitect on omp must be an explicitly defined agent, not an anonymous subagent call — a transient plugin whose prompt is rendered by the templating engine, carrying the tools to spawn scouts and tasks. Being defined is what makes it addressable: the script reaches it over IRC by agent name, steers it, and records its turns and spawns like any other step. Anonymous one-shot subagents give no handle, no steering, no record.
- Everything else through ACP; acpx (headless ACP client, persistent sessions, embeddable runtime) is the generic access layer; reaching Claude Code and Codex through adapters is fine. Where a harness's native interface is more capable than ACP — e.g. native structured output in Claude Code and Codex — a direct layer, as for omp, is built only on measured evidence that ACP loses something needed; acpx by config stays the default.
- Session portability follows the directional graph (one-way into omp from Claude Code and Codex; ACP has no transcript import). Fall back to de novo + context pack + links to artifacts.
- Compaction and cache: all providers cache prompts. A compaction request takes the whole transcript as input and is charged for it: cached-read price while the cache is hot, full input price once cold — compacting a cold session costs as much as the cold resume it was meant to avoid. Rule: compact at the end of the session, inside the cache TTL; never at the start of a resumed session. TTL is config (omp enum `auto|short|long|none`: set `short` explicitly; `auto` keeps 1-hour entries on subscriber sessions, doubling the cache-write price). No cache warming between separate calls; for implementer sessions a compacted fresh context beats a preserved one. Compaction rules are cost- and capability-model dependent: learn the reuse behavior during bootstrapping; the target is config-driven rules for what to compress on which review iteration. omp compacts Claude sessions server-side and stores portable summary text; Claude Code's `/compact` is client-side — same charging rule.
- For hierarchy on omp, the subagent (subarchitect) context shall also be compacted for the next launch.

### Git hygiene
- Mechanical commit between agents (worktree), short hashes passed so the next agent reads diffs.
- Cleanliness: heuristic check for the unusual — large files, new file extensions, many files outside the task's scope, temp files/model weights/huge outputs — with agentic revision (the author inspects and fixes or justifies) as a follow-up prompt. Prefer OSS; where nothing exists, something simple. Prompt reminder to clean scaffolds; `.gitignore` is the hard floor.

### Orchestration artifacts
- Storage is an interface. Backends: plain folder (gitignored under the repo, or outside it), separate GitHub repo, same-repo folder — all built and tested.
- Never commit sessions/logs or raw agent inputs/outputs.
- Code changes may sit on an unmerged branch; orchestration artifacts stored in the same repo are merged/cherry-picked ASAP. Artifacts stored separately need no cherry-pick.

### CRITICAL — bootstrap
- The factory is built by running itself, one iteration per launch. Each launch: a cheap scout distils the previous run's artifacts/transcripts into an evidence digest for the architect's pack (cost by role, loops, failures, interventions, with paths); the architect drills down by path. Session store outside worktrees and git (path in run config, last N runs kept).
- Always execute from a pinned last-good version, never from the tree being edited; promote after the no-model E2E suite passes. Metrics per iteration: architect launches, architect share of cost, cost per merged task, loop incidents, human interventions; one fixed benchmark goal re-run each time (baselines in `plugins/software-factory/docs/runs`).
- Landing and promotion are operator work until the owner says otherwise. Code after each iteration lands on `main` of the agentic-swarm repo.
- The operator session gives requirements — which subset of the intent is the current phase — operates, recovers from major issues, and reports bugs and incidents as steers. It does not prescribe milestones or plans.
- During self-improvement the architect is concerned with both mechanical solidity and agentic behavior — e.g. how useful review feedback was — and may plan spikes that investigate previous sessions' behavior.
- Build order: Phase 1 (`Phase1.md`: what enables solid hierarchy builds and the mechanics to execute sagas) → a couple of standalone tasks → everything else: read the intent against previous iterations' behavior (logs) and the code, and make sure the entire intent is built.

#### Bootstrap models/harness (one run config, not a factory assumption)
- Architect: Claude Opus 5.5 at high (omp, Claude Code). Escalation implementer: Sonnet 5.5 — minimize use.
- Plan reviewer: muse contributor 1.3 at max.
- Subscriptions and harnesses used during the build; self-improvement runs cover every leg:
    - agy (Antigravity CLI) with gemini flash 3.8 at high, through acpx — task level; the preferred task-level model when the subscription is available.
    - OpenCode Go subscription — omp (2 keys, auto rotation), OpenCode (muse limited to xhigh), codex, pi; most of the task-level spend goes there. The only allowed models are deepseek v41 (defaults to 1017) at max and muse contributor 1.3 at max.
    - OpenCode Go `beam-free:max` (through the same 4 harnesses) — used as the mechanical level.
    - Claude subscription (Opus/Sonnet): usable in omp and Claude Code. Used only for the architect (Opus) and the escalation tier (Sonnet).
- Multi-architect (saga) is tested with both:
    - omp: same session, IRC; the architect prompt launches subarchitects; subarchitects are compacted before the second launch; the architect prompt reminds them they were already launched; subarchitects still need to develop written status reports.
    - Claude Code: written report only; automatic launch → first a review, if the subarchitect created a plan in the previous iteration; then creation of a subplan, if assigned by the master architect.
- OpenCode-only free models: glm-5.3-flash-free, deepseek-v4.1-flash-free (most capable), minimax-m3.1-flash-free, mimo-v2.6-flash-free — use when available.
- As soon as a combination is believed to be supported, the config is shifted and the next launch tests the new combination.
- Implementers / task reviewers at the highest supported effort, set explicitly in the local config in each harness's syntax (muse takes `:max` on omp, `#xhigh` on OpenCode, the bare id on codex) and checked at pre-flight. There is no `highest` keyword.
- Several model configs, alternated across iterations to test harness combinations; pi is one of the rotated harnesses.
- Model switches on retry are tested both inside one harness and across harnesses.
- omp supports auto rotation (OpenCode Go has 2 keys) and auto fallback (aliases can be used with config fallbacks); the other harnesses do not. That makes them perfect for testing kernel-level fallbacks, e.g. from pi as task implementer to agy.

### Concerns and contradictions
Where the build contradicts or falls short of the intent, as of iteration 29. Each item: the intent point → what the build does now → why that is suboptimal. Code paths are under `plugins/software-factory/`; cost figures come from the goal's `metrics.yaml`.

Cost and architect involvement
- **No plan checker before the architect** (Iteration) → every iteration opens with an architect consult, whether or not pending work could progress. Over 29 iterations the architect is $37.5 of $47.2 recorded cost (79%; subscription task-tier spend is under-reported), and 10 iterations merged nothing. Iteration 29: $1.53 of $1.66 for one merged task, with 15 tasks still pending afterwards.
- **No plan review** (Model economics) → the plan reviewer is config in the intent, but no review step exists to configure; architect plans go to execution unreviewed, and "one issue caught earlier" is never caught.
- **Trivial work restarts de novo** (Escalation ladder) → the front classifies, then the implement step starts a new session in the task worktree on the front's alias/model ([`src/kernel/flow.ts:450-451`](plugins/software-factory/src/kernel/flow.ts), [`src/kernel/flow-context.ts:281-290`](plugins/software-factory/src/kernel/flow-context.ts)). The context the front already built is thrown away and paid for twice.
- **A standalone task cannot upscope** (Escalation ladder) → review has no path to "bigger"; a misclassified task either parks or lands under-scoped.

Flows and models
- **Model diversity is not expressible per step** (Model diversity) → a flow step carries only a role ([`src/kernel/types.ts:123-128`](plugins/software-factory/src/kernel/types.ts)); one flow-wide `followUp` covers every fix turn, and `different-model` always starts without a session ([`src/kernel/flow-context.ts:345-356`](plugins/software-factory/src/kernel/flow-context.ts)) — the switch-model-on-the-compacted-transcript case does not exist, and no run config tests a same-harness or cross-harness switch.
- **A mechanical check still creates loops** (Loop causes designed out) → a fix turn that correctly changes nothing after a red check parks as `empty-diff` ([`src/kernel/derive-task.ts:411-421`](plugins/software-factory/src/kernel/derive-task.ts)). Iteration 29 parked three finished branches this way (`acpx-config-only`, `fake-script-keyed-merge`, `continuation-conflict-land`) after load-sensitive tests went red.
- **Kept branches do not land by themselves** (Config-driven flows) → a complete, green kept branch needs a new continuation task, and conflicts again with every move of the integration head: `continuation-conflict` has been committed since iteration 28 and is still unmerged.
- **No end-of-wave steward** (Iteration) → conflicts are resolved only inside one task's own merge attempt ([`src/kernel/merge-attempt.ts`](plugins/software-factory/src/kernel/merge-attempt.ts)); nothing merges the wave, relaunches unmerged tasks to port onto the new head, or escalates through the merge ladder.
- **Per-harness, not per-provider, concurrency** (Config-driven flows) → limits are `concurrency` plus `perHarness` ([`src/kernel/config.ts:129-130`](plugins/software-factory/src/kernel/config.ts)). omp, OpenCode, codex and pi all draw on the one OpenCode Go subscription yet are throttled separately.

Harnesses
- **acpx is not config-only** (Harness agnosticism; Config-driven flows: no harness hardcoded without a justified custom adapter) → the agent set is a code union `"pi" | "codex" | "agy"` ([`src/harness/acpx/types.ts:5`](plugins/software-factory/src/harness/acpx/types.ts)), agy has five code branches in [`src/harness/acpx/turn.ts`](plugins/software-factory/src/harness/acpx/turn.ts) and its own binary lookup ([`src/harness/acpx/command.ts:22-23`](plugins/software-factory/src/harness/acpx/command.ts)), and the registry is code ([`src/cli/harnesses.ts:19-43`](plugins/software-factory/src/cli/harnesses.ts)). None of the three has a custom adapter; adding an acpx harness is a code change.
- **OpenCode runs through a bespoke CLI adapter** (Harness agnosticism) → 860 lines in [`src/harness/opencode/`](plugins/software-factory/src/harness/opencode/harness.ts) wrap `opencode run`; it predates the adapter rule and no measured ACP gap is recorded for it.
- **Claude Code is missing** (Harness agnosticism) → listed as supported and tested; absent from the registry, so the Claude Code architect and saga legs cannot be run.
- **acpx sessions are never compacted** (Context economy) → acpx harnesses declare `compact: "none"` ([`src/harness/acpx/harness.ts:42`](plugins/software-factory/src/harness/acpx/harness.ts)); pi, codex and agy fix turns resume the full transcript.

Steering, status, done
- **No intent-change agent** (Steering and autonomy) → nothing in the kernel updates the goal's intent from a steer; the operator edits it by hand.
- **No human-involvement presets** (Steering and autonomy) → autonomous / principal / detailed appear nowhere in config, prompts or code; process config has one free-text `calibration` override ([`src/kernel/config.ts:89`](plugins/software-factory/src/kernel/config.ts)).
- **The PM does not resolve stalls** (Steering and autonomy) → a 0-merge iteration waits for the next architect consult.
- **Done does not see open debt** (Stopping and debt) → the summary lists the distance, but nothing stops a "done" declaration with debt open.
- **No dashboard** (Status reporting) → `factory status` prints text; there is no HTML or JSON, although this document names the dashboard as the home of status.

Schemas, interfaces and config shapes
- **Agent output carries protocol in free text** (fixed kernel schemas) → the one outcome schema has `forward: string[]` ([`src/kernel/types.ts:27-34`](plugins/software-factory/src/kernel/types.ts)); the kernel recognizes a steer answer and a debt closure by text prefix (`/^steer\s/i`, `/^debt closed:/i`, [`src/kernel/summary.ts:171,188`](plugins/software-factory/src/kernel/summary.ts)). A misspelt prefix is not an error; the line is just not recognized. Concerns have no id, so a closure cannot point at the debt it closes, and the pack's debt register lists every debt concern ever raised, closed or not ([`src/kernel/context-pack.ts:144-148`](plugins/software-factory/src/kernel/context-pack.ts)) — there is no open-debt state for done detection to see.
- **The PM's task files have no schema** (fixed kernel schemas; Structured output) → task frontmatter is parsed by hand ([`src/kernel/tasks.ts:34-77`](plugins/software-factory/src/kernel/tasks.ts)), not by a declared schema like config, class and outcome. Hold files have a schema ([`src/kernel/mailbox.ts:46`](plugins/software-factory/src/kernel/mailbox.ts)) that `factory validate` does not check ([`src/schema-check.ts`](plugins/software-factory/src/schema-check.ts)). No schema is exported as JSON Schema, so no LSP can check artifacts; the untracked `.omp/lsp.json` in the main checkout maps 20 v2 files under `config/schemas/`, none of which exists.
- **Kernel state rides on message strings** (Context economy: status aggregated from structured outputs) → park and failure causes are one `cause: string`; root-cause grouping and incident counts parse prefixes such as `gates:`, `conflict:`, `no-progress:`, `empty-diff:` ([`src/kernel/derive-task.ts:257-271`](plugins/software-factory/src/kernel/derive-task.ts), [`src/kernel/metrics.ts:258-314`](plugins/software-factory/src/kernel/metrics.ts)). Rewording a message changes derived state and metrics.
- **No place for opaque harness options** (Config-driven flows: local config passes extra opaque acpx-compatible options) → an alias holds harness, model, effort, fallbacks, escalateTo and timeouts only ([`src/kernel/config.ts:108-124`](plugins/software-factory/src/kernel/config.ts)). `TurnRequest.opaque` exists ([`src/harness/types.ts:105`](plugins/software-factory/src/harness/types.ts)), but the kernel never sets it and only omp reads it. acpx options the build needs — agy's `--approve-all`, the `prompt` verb — are code branches instead ([`src/harness/acpx/turn.ts:64,378`](plugins/software-factory/src/harness/acpx/turn.ts)).
- **Fallbacks cannot leave the harness** (Config-driven flows; Bootstrap models/harness) → `fallbacks` are model ids run on the alias's own harness ([`src/kernel/agent.ts:227`](plugins/software-factory/src/kernel/agent.ts)); a fallback cannot name another alias, so pi → agy cannot be configured.
- **Portability is not a graph** (Context economy) → `portable(from, to)` returns `from === to` ([`src/harness/types.ts:126`](plugins/software-factory/src/harness/types.ts)); the one-way edges into omp from Claude Code and Codex cannot be declared, in code or in config.
- **The harness interface has no hierarchy primitives** (Harness access layer) → `Harness` is `caps`, `turn` and an optional `compact` ([`src/harness/types.ts:130-136`](plugins/software-factory/src/harness/types.ts)). `Caps` advertises `fork` and `subagents: "steer"`, but there is no method to fork a session or to address and steer a named agent, so the omp subarchitect over IRC has nothing to plug into.

Config layers
- **Config concerns are not separated** (Config-driven flows: each concern in exactly one layer) → the run config, which plays the local layer, holds the alias mapping together with a price table, launch policy (`limits`: iterations, concurrency, budgets) and machine paths (`sessions.dir`, `worktreeRoot`) ([`src/kernel/config.ts:143-166`](plugins/software-factory/src/kernel/config.ts)). `worktreeRoot` is accepted by both repo and run config; the run config wins ([`src/kernel/config.ts:451`](plugins/software-factory/src/kernel/config.ts)). Available harnesses are declared in no config: the set is the code registry ([`src/cli/harnesses.ts:19-43`](plugins/software-factory/src/cli/harnesses.ts)) and binaries come from env (`OMP_PATH`, `OPENCODE_PATH`, `ACPX_PATH`, `AGY_PATH`). Trying another model combination means copying a whole file: six run configs in [`bootstrap/run/`](bootstrap/run/self.yaml) (324 lines) each redeclare every alias, and four repeat the price table.
- **Roles stand in for aliases** (Config-driven flows: the factory config expresses flows and model alternation with aliases) → a role is a prompt plus an optional alias that defaults to the role name ([`src/kernel/flow-context.ts:174`](plugins/software-factory/src/kernel/flow-context.ts)); [`config/process.yaml`](plugins/software-factory/config/process.yaml) sets no alias. The required set is derived as roles — architect, pm and every flow-step role ([`src/kernel/preflight.ts:111-119`](plugins/software-factory/src/kernel/preflight.ts)) — so local configs must name their aliases after roles (`architect`, `pm`, `digest`, `implementer`, `reviewer`, `escalation` in [`bootstrap/run/self.yaml`](bootstrap/run/self.yaml)). Alternation is one alias per role plus one flow-wide follow-up role: running the same prompt on another model means declaring another role.
- **Prices are hardcoded** (Model economics: prices from the harness or OpenRouter, local cache) → cost comes from a `prices` table in the run config ([`src/kernel/config.ts:143-166`](plugins/software-factory/src/kernel/config.ts), [`src/kernel/pricing.ts`](plugins/software-factory/src/kernel/pricing.ts)), typed by hand in four run configs with the same rows repeated (Opus in three files, `opencode/beam-free` in four). There is no OpenRouter lookup and no price cache; a model missing from the table is unpriced.
- **Models, harnesses and efforts are hardcoded in harness adapters** (Config-driven flows: no model in code; no harness without a justified custom adapter) → the acpx adapter names `gemini-3.8-flash` and its effort suffixes ([`src/harness/acpx/types.ts:73-75`](plugins/software-factory/src/harness/acpx/types.ts)) and carries a per-agent effort table for pi, codex and agy ([`src/harness/acpx/types.ts:52-65`](plugins/software-factory/src/harness/acpx/types.ts)); the omp overlay fixes `defaultThinkingLevel: "low"` ([`src/harness/omp/overlay.ts:32`](plugins/software-factory/src/harness/omp/overlay.ts)).
- **Task type is not a config entity** (Role of agents/models: task types are config) → process config has `flows`, `roles` (prompt + optional alias), `itemTurns`, `calibration` and `promptsDir`. Each task file picks a `flow` and, independently, a `kind`; nothing ties them, and any `kind` other than exactly `spike` silently becomes a merged development task ([`src/kernel/tasks.ts:53`](plugins/software-factory/src/kernel/tasks.ts)).
- **The omp transient run config is rendered from code** (Config-driven flows: special harnesses get a transient run config) → the omp overlay's only config input is `scouts.model` ([`src/cli/harnesses.ts:39`](plugins/software-factory/src/cli/harnesses.ts)); approval mode and extra overlay settings are reachable only through `opaque`, which the kernel never sets.
- **An unintended `highest` effort keyword; bootstrap task effort unset** (Bootstrap models/harness: explicit highest effort, no `highest` keyword) → pre-flight resolves `effort: highest` ([`src/kernel/preflight-aliases.ts:100`](plugins/software-factory/src/kernel/preflight-aliases.ts)). `implementer` and `reviewer` in [`bootstrap/run/self.yaml`](bootstrap/run/self.yaml) and [`bootstrap/run/benchmark.yaml`](bootstrap/run/benchmark.yaml) set no `effort`, so those turns request none.

Structure and hygiene
- **Hierarchy is a parser without a caller** (Saga and hierarchy) → [`src/kernel/register.ts`](plugins/software-factory/src/kernel/register.ts) validates an architect register to depth 2; nothing invokes it, launches a subarchitect or writes an epic plan. `TaskFile` ([`src/kernel/types.ts:42-57`](plugins/software-factory/src/kernel/types.ts)) and step records carry no epic or owning architect, so a task's concerns cannot be routed to its epic's architect.
- **One storage backend, and the interface is a folder** (Orchestration artifacts) → `FolderStore` only ([`src/kernel/store.ts:64`](plugins/software-factory/src/kernel/store.ts)). `ArtifactStore` exposes five filesystem directories ([`src/kernel/types.ts:283-302`](plugins/software-factory/src/kernel/types.ts)); nine kernel modules build file paths from them outside the store, and prompts hand those paths to agents ([`src/kernel/pm.ts:435-437`](plugins/software-factory/src/kernel/pm.ts)). A separate-repo backend cannot implement the interface as it stands, and repo config selects a path (`artifactRoot`), not a backend.
- **Lint does not enforce the stack rules** (Stack) → [`biome.json`](plugins/software-factory/biome.json) is the recommended preset: no complexity, file-size or interface-separation rule. Largest files: `worktree.ts` 753, `metrics.ts` 682, `flow.ts` 654 lines. [`scripts/gates.sh`](plugins/software-factory/scripts/gates.sh) is 80 lines of shell logic.
- **No cleanliness heuristic** (Git hygiene) → no check for large or unusual files exists.
- **The benchmark is not re-run** (Bootstrap) → the kit exists (`bootstrap/benchmark/`), but no iteration records a benchmark run; the only baselines are the archived v2 runs.
- **No sandbox document, no "run factory" skill** (Operating assumptions, Delivery) → operator docs only.

## Stack
- TypeScript: linted, autoformatted. Code complexity, file size and separation of interface from implementation are enforced by lint for the factory's own code, with thresholds in the lint config; for target repos separate files stay a preference.
- `.sh`: minimize; ZERO real logic in sh.

## Glossary
- **Goal**: one intent, one directory; relaunching the same directory is "the same goal".
- **Launch**: one run of the script; bounded by the iteration limit.
- **Iteration**: one architect plan and its implementation; as defined in Intent.
- **Saga / epic / task**: a task is one implementer session's worth (a story) and the unit of worktree, review and merge; an epic is a coherent part owned by one architect — the unit of architecture context; a saga is a goal with several epics.
- **Milestone**: a demoable, checkable achievement; the logical flow of development.
- **Spike**: a task whose product is knowledge (a finding, optionally a PoC); not merged by default.
- **Wave**: a set of work items without logical dependencies, executable in parallel subject to limits.
- **Script / orchestrator**: deterministic code. **PM**: the paper-pusher that converts the architect's bullet-point vision into actual tasks. **Reviewer**: the per-task agent after the implementer, prompt and context tailored to the review focus. **Steward**: the end-of-wave merger.
- **Concern**: a recorded debt, risk, uncertainty or design choice with a calibration (FYI / blocked-by-architect / blocked-by-user). **Remarkable**: anything different from or additive to the plan that deserves the next stage's attention; concerns are one kind.
- **Context pack**: an index — derived status, infra commands, code facts with paths; links, not content; no artificial cap, pointers always present — built by the front agent or by deterministic scripts.
