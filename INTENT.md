# Agentic software factory — INTENT

 **Intent** is the WHAT and its invariants; it changes only by owner decision. **Notes on implementation** are the HOW, shiftable on real behavior. Status and evidence never live here — they live in iteration summaries and the dashboard.

This document supersedes `docs/factory.v2.md` and the design of `plugins/software-builder` wherever they contradict it. Components and code are reusable; everything in v2 not rejected here is worth consideration — intent, principles and practical observation decide. Avoid ceremony; stay focused on practical tasks.

## Intent

Modern harnesses deliver a decent story (several hundred lines of code). The agentic software factory is an orchestration framework on top of harnesses that delivers up to a saga (entire product) or a major refactoring — token-efficient, slop-free, steerable, observable,  autonomous, scalable from a trivial edit to a saga. One goal may span many epics and tens of tasks per iteration, across multiple resumable iterations; no  size ceiling.

- Stop in the middle, relaunch — it keeps going; no architect intervention required.
- The saga flow (hierarchy) is required and built as specified.


### Model economics
- Architect-tier (expensive) models do only what a human architect does: convert intent into actionable plans, directional interfaces, key-algorithm direction, tradeoffs above task level. Called with a prepared context pack; agentic and subagentic — launching scouts/tasks and waiting for them is fine, no limits on them. Write no code beyond key interfaces and no verbose documents. The architect produces a single markdown plan written for architect/reviewer friendliness and efficiency — never schema-consistent files; maintaining file schemas is not architect work.
- A weaker model (same tier as task models) reviews the architect's plan: impracticality, unclarity, rule violations — real bugs are not unusual. Advisory input, not a veto. "Consider" spans the full range: from ignoring based on fact judgement, to clarifying the plan, to realizing "oops" and changing it. During self-improvement the architect samples whether the review was helpful (one issue caught earlier reduces work 10x).
- Architect-tier costs or subscription use are ~40–80x the cheap capable tier (vs 2–3x for human architects); the architect outweighs the bill. Optimize overall cost on that ratio (~50x).
- Measure both actual cost and work: per-model cost and token use (assume the prefix is cached when not reported separately), number of turns, and work done — edits, test runs, etc. Subscriptions under-report prices (e.g. OpenCode Go may count deepseek as free).
- Quota management is not a primary purpose; subscription throttling and fallback in dispatch is a feature (see Concurrency).
- Escalation to an expensive implementer-tier model (Sonnet/Terra class) only when a task goes wrong or needs a highly non-trivial class/PoC; the architect calls it, in advance or on review. Minimize its use.
- Consults are batched: delayed until non-blocked tasks are exhausted — the iteration boundary. Expensive models are used rarely and only when necessary.

### Context and focus is as important as model tier/diveristy
 - It a popular belief that you you need smarter model and provider diversity to improve, and you need very smart model to plan. It is not entirely true
 - Smaller models are 
    - more likely to make suboptimal decisions
    - degrade more quickly on tasks having contradictory and/or complex context, neeing trade-off etc
    - work quite good on well defined, focused task even if this task is more of architecture and planning nature
    - eg, smaller model can perfectly plan or define architecture. It will degrade if it needs to simutaneously consider callgraphs and edge cases.
    - same model, small or large, can perfectly review results even of a larger model. At the end of the day, the job of smarter actor is to make sure results AND motivation are understandable to small actors.


### Role of agents/models - that coceptual section shall help to interpret anything below
- Architect agent preferrably to run with large frontier level models (Opus, Fable, Astra, Kimi). The job of architect is to decide what needs to what to do to bring project to state specified by the intent (=can be either build from scratch or evolve an existing codebase) w/o intoducing new technical debt, breaking existing functionlity. In case of saga hiearchical process, architect relies on subarchitects to handle sub layers - so, architect does not need to look at entire codabase. Architect (same context) double up as code reviewer = look at net changes since the project start. At each iteration, job of achitect it 
    - speficy entire set of tasks arranged in DAG/Milestones needed to complete project
    - call out specific uncertainties that can be removed by spikes or foundational tasks, and plan up to resolution of uncertainties
- Architect reviwer can be equally frontier model, or task level model. Fresh context.. Architect can improve based on feedback, sometimes by providing more grounding/explanation in the plan.
- task level model includes DeepSeek v41 1017, Muse/Ember, Luna, Haiku (currrently limited sense due to 100k context price increase), Gemini Flash/Hydrogen, etc. 
- PM own implementation of the plan, moving task around, repairing artifacts, providing enviromental steering addendums, injesting user steer. Not technical - he owns artefacts, DAG, splits/changes beyond what mechanical orchestration handles.
- Various task level agents are arranged to config driven flow depending on the type of the tasks= list of tasks types, agents, and prompts are config driven, not hardcoded in kernel. Kernel knows spike (no code change expected) /vs development. Each task flow is a DAG , bounded retriablle. Examples of task types
 - spike
   - fact-finding - figure something out (can be universal or split as separate type: library/codebase/webresearch/computer-use-test/specialized review)
   - PoC
 - development
   - normal dev
   - documentation only
   - eg: backend dev vs dev with computer use (separate task type required eg for dashboard to test - extra qa agent in the flow that test integration)
Task types below are propagated from config from relevant prompts and schemas. 

- Merge agent involved when conflict/test regression occurs as result of merge
- Plan checker is specialized agent to see if current plan (architect outoput) can be meaningfully  progressed as net positive gain before architect involmement. task level architect gate keeper
- triage - see below


### Escalation ladder (triage)
- One cheap-but-capable agent classifies the goal: trivial / task / bigger (epic, saga). For a task it defines the scope. It is not smart enough to decide how big "bigger" is — that is the architect's call.
- Trivial: the same agent implements, in the same session (reusing the context it already built): after receiving the classification, the kernel sends a follow-up prompt with the location/branch.
- Standalone task: does not reach the architect. Its review re-prompts the task scope (the shared scope definition used by triage/planner — a single include) and asks whether the real scope is substantially higher than planned and the result requires architecture input; if so it auto-escalates to "bigger". Everyone can make a mistake; escalation corrects it. A task that is part of an epic is not a standalone task.
- Task or bigger: the same agent prepares the context pack — current status, infra (applicable compile/lint/test), relevant code facts. No separate triage/context-pack/infra steps: same context, same agent.

### Iteration
- An iteration is one architect engagement plus the orchestration it launches: the architect plans; the script orchestrates all tasks until they are exhausted or blocked. Each architect consult starts a new iteration.
- The architect plans the road to completion, not one iteration's slice: as much work as makes sense given the uncertainties. Where a detail cannot be settled yet he says so explicitly — deferring a feature until a named spike or foundational task lands — and plans the unblocked work in parallel.
- Every consult starts by evaluating the project against the intent — completeness, quality, correctness of the implementation so far — not merely the previous iteration's work. Is the work truly blocked or does it make sense to continue; what is incomplete or must be redone. In a saga, the architect defers to subarchitects for details in their domains; sub-epics get their own completeness check. Two in one: the same context serves evaluation and planning.
- Before the architect: a plan checker verifies the plan's status against the repo, with repeat — its findings go back to execution before the architect is consulted (see v1: `plugins/software-builder/agents/plan-completeness-checker.md`, loop in `plugins/software-builder/skills/software-builder-asset/goal_flow.py`).
- A launch after an interrupt (mid-iteration stop, quota, computer reboot) is a script relaunch: no architect, no digest. If the resumed state is problematic, the script repairs it with an agentic PM turn and/or the plan completeness checker, with a budget for extra retry.
- Scope: the architect predicts a reasonable, non-overlapping scope per task. He does not name files — a waste of tokens. Tasks may touch the same files; nothing enforces which files a task touches. Normal development.
- End-of-wave steward (v1 wave checker; omitted when there are no conflicts): merge, resolve conflicts, run CI/CD, fix the obvious, record concerns for the non-obvious, decide what to hold. DoD: branch state ready for the next wave; task status revised if unmerged. Tasks that did not merge are relaunched to port on top of the new branch state. Conflicts are normal during development, sometimes logical (test failures). The steward is compacted at the end and relaunched as needed. Merge ladder: a workhorse-class merger resolves trivial conflicts → unresolvable goes to the architect with a pointer to the overall status plus the worktree and branch of the problematic item.
- Why: too-tight scopes, no end-of-wave merging with repeat, and no plan status check before the architect cause rework and conflicts.
- The kernel ensures every agent delivers. An agent that ends its turn without delivering is asked again — e.g. the architect: "You need to deliver. Specify actions, including spikes if needed to plan more, in the plan; or declare the build done [if allowed by config], or blocked till done." The ask is a prompt template from config; its exact shape depends on the agent.
- iteration progressing up to bounded repeats with plan checker - plan checker may say things to do before involve architect.

### Context economy
- Same context: same agent. Different context: different agent.
- Reuse stored agent sessions within one harness. Across harnesses portability is directional and not always feasible: a graph records which way a session can move. Portable → continue from the pre-compacted session. Not portable → de novo, with the context pack and links to artifacts. Any session that cannot be resumed → logged as error, started de novo.
- Compact at the end of a session; reload the compacted session for consult, review, or next iteration. Compaction is both cost saving (fewer tokens on restart) and context management (drops previous reasoning on a fix-up launch of a task or on the architect's next iteration). Compaction is transcript trimming — even server-side — not a handoff summary; the two serve different reuses and must not be confused. No tree/branch summaries.
    - compaction kills 2 birds in one stone: on cold retry no need to pay for entire transcript; and adjust context so concerns/sugegstion can get a decent consideration. However, by re-using compacting sessions we save on not revuilding entire context from scratch. On re-use, agent would reread.  
- Plans are the architect's markdown, edited in place — never in flight; the architect owns them. A cheap PM turns the plan into tasks and lines: it identifies task files, owns the DAG and the dispatch sets, and resolves whatever cannot be derived deterministically (missing branches, misplaced artifacts). The PM is a paper-pusher, not a peer: it converts the architect's bullet-point vision into actual tasks, interpreting intent into more formal shape — splitting and merging tasks as the formalization requires. There is no PM/architect disagreement to resolve; the architect's intent governs. Tasks are named by short immutable slugs. Never force whole-plan re-issue through a strict schema. Diffing serves only to inform the (compacted) PM of plan changes on subsequent iterations.
- Status is aggregated by the script from structured outputs / YAML artifacts, idempotently; the context pack is prepared from it.
- The context pack is an index: derived status, infra commands and code facts as paths — links, not content. No artificial caps; even when capped, the pack includes the files the architect needs to read agentically.

### Saga and hierarchy
- Hierarchy depth is bounded by config: 1 architect level is the norm, 2 the expected maximum. A subarchitect is split off only when the size/complexity of architecture context demands focused context; the architect owns all planning and review down to that level. Untouched levels are not invoked.
- Strict chain: task-level concerns  go to the architect responsible for that epic (epic→architect may be many-to-one). The subarchitect filters and consolidates escalations into one brief upward; implementers/reviewers never reach past their architect. The hierarchy build defines the "top architect".
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
- Config-driven (=criteria are part of the config, assempled into prompt by template system). Under the current calibration the architect records a reversible assumption, notes it as remarkable, and continues; the user steers/overrides. The process-config prompt defines what the architect may decide alone vs what blocks on user input. Human-involvement presets (autonomous / principal / detailed) select the calibration.
- Mailbox, not ACK protocol: the user drops files to steer; the user sees remarkable notes (iteration summary, concerns, open questions) — at least one remarkable entity per iteration (the iteration summary is the guaranteed one), never spam.
- The script monitors the mailbox at startup and during a run. Steers do not interrupt work: running tasks finish and pending work keeps dispatching.
- A cheap PM handles what needs no architect: a task-specific steer, or one that requires a redo or change, is handled by the PM; a small task or spike to report back to the owner is dispatched by the PM.
- The architect is involved when a steer amends the intent (handled automatically at his involvement) or needs an architecture decision; an urgent steer that pulls the architect in is the exception.
- A steer may stall the run when, given the steer, no pending task still has value, or when the user asks for a priority that is not planned: tasks drain, then the architect is involved.
- Every steer ends processed, with the response in the outbox. All these steer scenarios are built and tested during self-improvement.
- Intent change steer: when a steer clearly adds or modifies intent, the goal's intent is updated — preferably by a dedicated cheap agent — preserving user instructions: superseded text is crossed out, amendments carried over. No interpretation, just carry over edits. The architect on the next launch sees what changed.

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
- The factory applies this to itself: autoformat, lint, schema checks of all schema-enforced files/configs.
- All prompts follow the prompt-debloat principles (`/home/slava/aiexp/software-builder.dev/plugins/prompt-engineering/skills/prompt-debloat`).

### Config-driven flows
- Three config layers: repo config (locations, paths, gates), factory process config (flows, agents, schemas, calibration,  task tuoes - use model aliases), local config : available harnesses/models/fallback chains : for "special harnesses" like omp ->transiuent run config. 
- Flows are data: e.g. "just implement", "implement/review", "TDD: ingest → record known problems → stubs → implement/QA/review/security review". Adding an agent/schema to ingestion, a task-type flow, or the PM flow is a config edit; agent types and task flows can be added or commented out. More spike/agent types are configurable — e.g. for a dashboard: computer-use tests, design/usability review. Templating serves the architect flow too. The script surface schema is fixed: agent produces, script reads.
- Prompts are assembled from shared fragments and single-definition templates — never copy-pasted. Use a well-established templating engine, not DIY: LiquidJS (strict TypeScript, `{{ var | filter }}`, CLI `npx liquidjs`, custom filters, async tags), Eta (TypeScript-native, ~3.5 KB, partials, plugins) or Nunjucks (Jinja2-like macros, block inheritance).
- Review retries configurable, with follow-up options: same agent on compacted context, different model, or de novo.
- Task review: two rounds by default, configurable. The last round decides: negative value → park, keeping the branch, until architect feedback; or record concerns/technical debt and go ahead. A kept branch that is complete and green lands at the next boundary without a new task.
- Concurrency in config: an overall limit plus limits per provider (e.g. in parallel 1 session on OpenCode free, 2 on OpenCode Go, 1 on Antigravity). Dispatch throttles per subscription and falls back.
- Config has a schema and pre-flight validation.

### Harness agnosticism
- Works through any acp-compatible harness with opaque config passed at launch (command-line args, env, or config files depending on the harness). omp is a special case that simplifies things, not a dependency; extra tools exposable through ACP. Supported and tested: omp, OpenCode, codex, pi, Claude Code, agy (Antigravity CLI) — with harness rotation across iterations so no harness-specific assumption survives untested.
- The build is harness agnostic. Which harness does which role best is discovered during bootstrapping and recorded in run configs (default/exemplary config), never in code. Starting hypotheses: pi is the task-flow implementer (minimal, great at the single task); omp and OpenCode fit spikes better out of the shelf, where subagent expansion matters.
- Harness adapters: a custom adapter only when the harness offers substantially more than ACP exposes (omp is that case: RPC, yield, compaction, overlays). Otherwise drive the harness through acpx (OpenCode included), or at worst plain ACP — never a bespoke CLI wrapper for what the protocol already covers; NO CODE, shall leverage acpx naming (and opaque config) in config, that is it 

### Operating assumptions
- The entire factory is assumed to run inside a sandbox (e.g. bubblewrap); documented. Factory sandox is out of the scope now. Sandboxing individual harnesses can come later.
- Which models see which code (training/retention policy) is the owner's run config, not a factory deliverable.

### Delivery
- The factory is a plugin with a skill "run factory": where to put the intent, how to configure, what to launch, what to see, where the user sees the HTML; kernel and config are skill resources.

## Notes on implementation



### Loop causes designed out
- Over-prescription and mechanical checks on agent output (e.g. which files changed) create loops and no value. A turn is judged by what the agent delivers, the gates and the review; a check on agent output stays only on evidence that it prevents real defects.

### Structured output
- Strict schema (tool/yield) only for small, simple outputs. The plan is markdown; the PM derives task files from it.
- Every agent that produces a schema-controlled file (PM, task reviewers, QA)   has a validation command in its prompt (bun/npx, whatever) and if harness supported, lsp. The factory artefact folder must have preferrably harness agnostyic config file to enable lsp for artefacts schemas. Test at least for omp

### Architect plan → PM task files
- The architect writes one markdown plan; the PM derives task files, the DAG and the dispatch sets. The architect never maintains schema-consistent files.
- Reconcile is deterministic where it can be (done tasks frozen, rework as a new slug, pending tasks re-read at dispatch); the PM resolves what determinism cannot — missing branches, misplaced artifacts, ambiguous mappings.
- Diffing library choice is the implementer's (id-keyed matching if arrays are compared; microdiff is index-based and fails that).

### Harness access layer
- omp RPC (JSONL) is far more capable than ACP: compact, fork, subagent steering/IRC, host tools. Special-case it; with omp as architecture harness, subarchitects can be subagents reachable through IRC — one strategy of the capability-aware layer, still owned by the script.
- omp subarchitect: a subarchitect on omp must be an explicitly defined agent, not an anonymous subagent call — a transient plugin whose prompt is rendered by the templating engine, carrying the tools to spawn scouts and tasks. Being defined is what makes it addressable: the script reaches it over IRC by agent name, steers it, and records its turns and spawns like any other step. Anonymous one-shot subagents give no handle, no steering, no record.
- Everything else through ACP; acpx (headless ACP client, persistent sessions, embeddable runtime) is the generic access layer; reaching Claude Code and Codex through adapters is fine. Where a harness's native interface is more capable than ACP — e.g. native structured output in Claude Code and Codex — prefer it and build a direct layer, as for omp.
- Session portability follows the directional graph (one-way into omp from Claude Code and Codex; ACP has no transcript import). Fall back to de novo + context pack + links to artifacts.
- Compaction and cache: all providers cache prompts. A compaction request takes the whole transcript as input and is charged for it: cached-read price while the cache is hot, full input price once cold — compacting a cold session costs as much as the cold resume it was meant to avoid. Rule: compact at the end of the session, inside the cache TTL; never at the start of a resumed session. TTL is config (omp enum `auto|short|long|none`: set `short` explicitly; `auto` keeps 1-hour entries on subscriber sessions, doubling the cache-write price). No cache warming between separate calls; for implementer sessions a compacted fresh context beats a preserved one. Compaction rules are cost- and capability-model dependent: learn the reuse behavior during bootstrapping; the target is config-driven rules for what to compress on which review iteration. omp compacts Claude sessions server-side and stores portable summary text; Claude Code's `/compact` is client-side — same charging rule.
- for hirarchy (subagent) with omp subagent context shall also be compacted for the next launch

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
- Subscriptions: omp, OpenCode, codex and pi on OpenCode Go; omp also on the Claude subscription (Opus/Sonnet); agy (Antigravity CLI) with gemini flash 3.8 at high through acpx, task level. Self-improvement runs cover every leg.
- overall during build use the following subscriptions/harnesses 
   - agy (Antigravity CLI) with gemini flash 3.8 at high through acpx, - preferred task level model when subscription available. 
   - Open Code Go Subscription - omp (2 keys, auto rotation), open code (muse limited to xhigh), codex, pi - most of task level spent will be there. Only allowed models are deepseek v41 (defaults to 1017): max and muse conttributor 1.3:max 
   - Open Code Go beam-free:max - (through same 4 harnesses) - use as mechanical level 
   - claude : usable in omp and claude code. Only use for architect (OPus) and escalation tier (Sonnet). Multi architect (saga) shall be tested both with omp (same session, IRC, architect prompt launches subarchitects, subarchitects compacted before second launch, architect prompt reminds them they already launched, subarchitects still need to develop written status reports) and claude code (only writtent report), automatic launch -> first review if subarchitect created plan in previous iteration; and then to create subplan if assigned by master archutect

- OpenCode-only free models: glm-5.3-flash-free, deepseek-v4.1-flash-free (most capable), minimax-m3.1-flash-free, mimo-v2.6-flash-free - use when available. 
- as soon as we believe combination is supported, config shall be shifted, and next launch shall test new combination

- Implementers / task reviewers at the highest supported effort, resolved at pre-flight (syntax differs per harness: muse takes `:max` on omp, `#xhigh` on OpenCode, the bare id on codex).
- Several model configs, alternated across iterations to test harness combinations; pi is one of the rotated harnesses.

## Stack
 - typescript.- linted, autofrmatted, code complexity./file size enforced, separate interface from implementation enforced. .sh - minimize; ZERO real logic in sh. 

## Glossary
- **Goal**: one intent, one directory; relaunching the same directory is "the same goal".
- **Launch**: one run of the script; bounded by the iteration limit.
- **Iteration**: as defined in Intent.
- **Saga / epic / task**: a task is one implementer session's worth (a story) and the unit of worktree, review and merge; an epic is a coherent part owned by one architect — the unit of architecture context; a saga is a goal with several epics.
- **Milestone**: a demoable, checkable achievement; the logical flow of development.
- **Spike**: a task whose product is knowledge (a finding, optionally a PoC); not merged by default.
- **Wave**: a set of work items without logical dependencies, executable in parallel subject to limits.
- **Script / orchestrator**: deterministic code. **PM**: the paper-pusher that converts the architect's bullet-point vision into actual tasks. **Reviewer**: the per-task agent after the implementer, prompt and context tailored to the review focus. **Steward**: the end-of-wave merger.
- **Concern**: a recorded debt, risk, uncertainty or design choice with a calibration (FYI / blocked-by-architect / blocked-by-user). **Remarkable**: anything different from or additive to the plan that deserves the next stage's attention; concerns are one kind.
- **Context pack**: an index — derived status, infra commands, code facts with paths; links, not content; no artificial cap, pointers always present — built by the front agent or by deterministic scripts.
