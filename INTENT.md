# Agentic software factory — INTENT

**Intent** is the WHAT and its invariants; it changes only by owner decision. **Mechanics** are the HOW, shiftable on real behavior. Status does not live here — it lives in iteration summaries and the dashboard.
*Gaps and inconsistencies* at the end — where the current build differs from the intent, with links to code and run records. The only evidence kept in this file; an entry is removed when it lands.

## Intent

Modern harnesses deliver a decent story (several hundred lines of code). The agentic software factory is an orchestration framework on top of harnesses that delivers up to a saga (an entire product) or a major refactoring — token-efficient, slop-free, steerable, observable, autonomous, scalable from a trivial edit to a saga. One goal may span many epics and tens of tasks per iteration, across multiple resumable iterations; no size ceiling.

- Stop in the middle, relaunch — it keeps going; no architect intervention required.
- Auto scales from "trivial" to "task" to "epic" to "saga"
- Harness agnostic 
- Configurable for different flows and type of projects, from
   - software delivery: stack, testing and build framework agnostic
   - Silicon and industrial design
   - Deep research
   - Loop based optimization — e.g. architect selects most promising versions in the repo, creates tasks to research and implement approaches; they are merged; he decides what to do next (can emit cleanup tasks)
- Every flow assumes committed artifacts, git worktrees and shell scripts. Minimum common denominator for a check is a shell script; no JUnit or runner-specific format required.

### Model economics

 The cost (or subscription use) between frontier model (Opus, Fable, Astra), and capable implementer models (DeepSeek/Qwen Flash, Haiku, Luna,  Sol on Low) ~40–80x;  + sometimes there are "free" up to limit models. The speed also varies dramatically, sometimes 10x.
  For humans, even with global pay differentials, the price delta  30% –5x  (with sometimes 10x performance delta). Agentic factory need to aggressively leverage cheaper models - focused tasks, context preparation for large, etc. The architect dominates the bill; optimize overall cost on that ratio (~50x).

For the purpose of design, we consider the following models:

- **Architect**  (expensive) models do only what a human architect does: convert intent into actionable but directional plans, directional interfaces, key-algorithm direction, tradeoffs above task level. They are called with a prepared context pack and work agentically and subagentically — launching scouts/tasks and waiting for them is fine, with no limits on them. They write no code beyond key interfaces and no verbose documents. Each architect produces one markdown plan, written for architect/reviewer friendliness and efficiency — never schema-consistent files; maintaining file schemas is not architect work.

- **Sr. Implementer/Workhorse** - focused task, code review, debugging, research, etc

- **Simple** ~ orchestration, context preparation, schema repair, commits,  running gates, etc

- The architect's plan is reviewed for impracticality, unclarity and rule violations — real bugs are not unusual. Which model reviews is config: task tier or frontier, always from a fresh context. The review is advisory input, not a veto: the architect considers it, and "consider" spans the full range — from ignoring it on a factual judgement, to clarifying the plan, to realizing "oops" and changing it. During self-improvement the architect samples whether the review was helpful (one issue caught earlier reduces work 10x).
- Measure work and usage where feasible and not burdensome: per-model token use (assume the prefix is cached when not reported separately), number of turns, and work done — edits, test runs, etc. Be realistic about what can be counted: ACP harnesses do not report cost or tokens (ACP `usage_update`/`usage` may be extractable), and OpenCode Go does not report subscription costs. Exact cost accounting is not a goal beyond analysis during the self-improvement build, to make sure nothing is wasted; subscription subsidies, street pricing and local hosting alter the cost structure anyway. Where a price is needed, it comes from the harness or from OpenRouter, with a local cache; nothing is hardcoded. Reported cost misleads: the Claude subscription reports about list price while its real subsidy is ~30x, agy's is ~300x, and OpenCode Go sometimes reports 0, so a reported cost ratio is not a good indicator.
- Wasted turns: a turn whose change is implemented and then rebutted after review/QA is NOT wasted — that is the accepted tax for quality, compactness and readability, and fully rebutted reviews are accounted separately. A turn IS wasted when the implementer completely fails (tokens spent, nothing lands), the agent does the job but the structure fails it (protocol, containment, outcome channel), or flaky tests cause an incorrect rejection. Wasted turns are investigated by spikes and their root causes addressed.
- KERNEL is fallback aware (if particular subscription or model provider down)-> fallback, resume prompts to fallback agents: the fallback agent is launched in the same worktree with a minimum extra prompt (keep implementing, assess status first).
- Escalation to an expensive implementer-tier model (Sonnet/Terra class) only when a task goes wrong or needs a highly non-trivial class/PoC; the architect calls it, in advance or on review. Minimize its use. Escalation is an alias mapped to a stronger model in the local config, not a separate tier.
- Consults are batched: delayed until non-blocked tasks are exhausted — the iteration boundary. Expensive models are used rarely and only when necessary.

### How Factory works
#### Patterns we avoid
   - "Smart orchestrator top" swarms agents - it sometimes works for medium scoped task, but considerable research shows that it is not always cheaper than smart model doing end 2 end. In our experience,  in addition of burning a lot of tokens on trivial orchestration mechanics, if something goes not trivial, orchestrator tend to overtake all the work
   - "Smart planner" - in our experience, plan get sometimes more detailed than code. Also, it assumes smart planner can think everything to perfection. In reality, all development must be experiment and test driven.
   - "Smart reviewer" - although it is beneficial to have smart reviewer, we found that 
      - A Flash class model, with focused context does decent reviews
      - The context that reviewer has to build is not different from what planner has to build, and review result is not different from a plan. 
#### Immutable part coded in orchestration kernel
##### Key players
   - Key orchestration player is script **kernel**. It invokes harnesses with agents, reads structured artefacts prepared by agents and check steers by users, executes the commands infra defined (setup, compile, lint, tests), git commits and merges, worktree setup and cleanup.
   - To enable parallel operations, rollbacks, etc, we leverage git, git worktrees or  compatible modern performance alternatives
   - Our key technical player is "architect" aka principal engineer. His responsibility is to derive technical direction (directional, but not detailed plans), ensure code quality, readability = he defines "what has to be done directionally, in roughly what order, how to act on important concerns brought by engineers or steers by user. Architect is reviewing status of the project and defining/editing directional plan once per iteration: the architect flow is launched once per iteration and may include review; for a saga, subarchitects with their reviews. The flow may hold separate architects — designer, security architect, functional safety, etc. That includes code review (same context is leveraged). Architect owns "directional plan that defines WHAT have to be done (subject to yet unknowns) to bring project to desired state (as per INTENT) without adding technical debt or quality issues". Architect involvement is subject to configurable "architect pipelines" - context preparation, review etc
   - Once architect defined "plan", technical judgement is plan complete or extra work that need to be done more or less in scope of the technical decisions by architect owned by *plan completeness checker*. He also makes simple technical decisions to address concerns — emits extra tasks (see Concerns funnel).
   - Our key agentic orchestration  player is "PM" . His job is to repair artefacts/figure out status when KERNEL can not, convert plan to specific tasks, triage steers.
   - **steward** is invoked when merges to the goal branch create conflicts, ci/cd failures etc. Goal branch is the current branch of the repo; if it is the default (main, master), the ingestion pipeline creates one automatically.
   - **infra** agent is part of the ingestion flow. It outputs what commands kernel need to run in scope of the goal (fast/slow tests, worktree preparation, compile, lint, etc) — discovered from the repo or taken from config — and their status (yellow/red, specific failures, flakiness). If required, it wraps commands so kernel can execute them.
   - **task flows** - a number of tasks are arranged in DAGs.
   - **ingestion flow** at goal start: create goal branch (when the repo is on main/master), front agent triage (trivial / task / bigger), infra agent (commands + status), context pack, scouts map existing code (bigger only), extra steps as configured (e.g. a separate agent to retrieve requirements).

##### Overall flow
   - idempotent state stored to restart at any time
```mermaid
flowchart TD
    launch["launch"] --> preflight["pre-flight: config schemas, aliases"]
    preflight --> recover["recover: relaunch agents stopped mid-flight with resume prompt; PM repairs unreadable YAML"]
    recover --> isnew{"new goal?"}
    isnew -- "no: resume where stopped" --> waves
    isnew -- yes --> ingest["ingestion flow: goal branch, triage, infra, context pack, code map, extra steps"]
    ingest --> cls{"triage class"}
    cls -- trivial --> trivial["front agent implements"] --> done(["done"])
    cls -- task --> task["task flow: implement, QA, review"] --> merge1["merge"] --> done
    task -- upscope --> arch
    cls -- bigger --> arch["architect flow: pack, architect + subarchitects, plan review, architect return"]
    arch --> pm["PM: plan to task files, DAG, waves"]
    pm --> waves["waves: task flows in worktrees; gates keyed by tree; steers read between turns"]
    waves --> steward["end of wave: steward merges into goal branch (conflicts, red)"]
    steward --> left{"dispatchable work left?"}
    left -- yes --> waves
    left -- no --> parks["PM decides parks and blocking concerns"]
    parks --> checker{"plan checker"}
    checker -- "progress: extra tasks" --> waves
    checker -- "architect: next iteration" --> arch
    arch -- "goal done / blocked on user" --> stop(["stop"])
```
   - stop: goal done | blocked on user | iteration limit | budget hit (drain: no new dispatch, in-flight work finishes)

##### Concerns funnel

- Concerns include discovered technical debt, issues with the plan, pre-existing test failures.
- Funnel order:
    - inside a task, as per the configurable task flow: the reviewer adds concerns that go to the implementer; the reviewer checks concerns raised by previous agents and can gate them as immaterial;
    - PM decides if any concern blocks the rest (makes the remaining work wasteful);
    - plan checker makes simple technical decisions to address concerns (emits extra tasks);
    - once exhausted, concerns not filtered out, with their resolutions, go to the architect.
- implementer → reviewer → PM / plan checker → architect → [top architect] → human. Each stage filters.
- Each stage sees a different scope: the implementer sees one task, the reviewer its diff against the task, the architect the epic's interactions, layers and sequence. That perspective gap is the point — it holds even between same-class models (or humans), which is why the task flow uses separate steps rather than one agent doing everything. Sample and investigate whether it works as intended.
- Implementers over-report trivia; the reviewer decides what is different/additive to the plan and worth architecture attention. Even a same-model reviewer with a different focus adds a lot.
- The task reviewer shall be a task-tier model.
- Reviewer pairing is per task-type flow in config; there is no separate integration "wave review" (the end-of-wave steward merges, it does not review) — the iteration's completeness check at the next architect consult is the integration point. The reviewer's context differs from developer/QA: tailored to the focus of the review, not the implementation context — not the implementer's edits, not its reasoning about what to edit. Its prompt is mostly the author's prompt, included whole through the templating engine so the common part is the same text — the same assignment, bounds and standard — plus the review focus and verdict. This holds for every reviewer, the plan reviewer included.
- Concerns (technical debt, risks, uncertainties, design choices) and remarkables propagate up the chain; calibration lives in config prompts: FYI-only / blocked-by-architect / blocked-by-user. Not spam. The remarkable at each level always includes "what is achieved" and "what is of concern".
- Files stay on disk; the architect can scout/read instead of receiving pasted content.

##### Schemas known to kernel

- Agent outputs the kernel reads and validates: task file (`tasks/*.md` front matter), step outcome (`outcome.yaml`; QA has its own outcome schema), steer hold (`mailbox/holds/*.yaml`), triage class (`class.yaml`).
- The plan is markdown, no schema.

#### Configurable part
- Each task type get configurable orchestration flow (eg: researchers-> PoC agents; test/interface developer -> developer-> review; developer->compute use qa -> automated test qa -> review) , each task kind is described "when to use" and auto inserted into architect and other relevant (PM, Plan Checker) prompt 
- architect flows (depending on project state : ingestion, return after uncertainty resolution, declared done by plan checker, concerns to resolve)
- what harnesses/models (aliases) to use for element in flow (support aliases in config)
- ci/cd (or discovered by infra)
- use generic coding rules or project specific
- prompt options for all agents 
- harnesses are already configured (skills, agents, lsps - etc) for production project (config for orchestration files is propagated by Kernel): factory uses the repo's harness setup as is; kernel only adds what orchestration needs (JSON Schemas + LSP mapping for artifact files, transient agents like subarchitects) and never overwrites the repo's setup.
- what harnesses to use, what arguments

##### Config-driven flows
- Three config layers, separated by concern: each concern lives in exactly one layer, and no layer restates another's.
    - Repo config: locations, paths, gates — the repo's CI/CD, defined as commands; whether a red gate was already broken before the task may be judged agentically (by the reviewer).
    - Factory (process) config: bounded flows as DAGs (the architecture flow with its plan review included), task types, agents and prompts, which kernel schema each output follows, calibration, and model alternation — all expressed with aliases, never with models. It names the aliases it requires.
    - Local config (the run config): the one config that defines the available harnesses and models (or harness-level aliases), fallbacks with their own effort, and their mapping to aliases, plus extra opaque acpx-compatible options passed through to the harness untouched. Some aliases are mandatory for the kernel (e.g. architect); others are required by the factory config. For special harnesses such as omp it is rendered into a transient run config. It also holds what is specific to the machine and its subscriptions: concurrency per subscription, session and worktree paths with retention, and the price cache; launch limits (iterations, $/time per iteration) are launch arguments with defaults here. Binary resolution is config-only: rely on acpx unless a custom adapter is the default; binaries are expected on PATH already; config override possible.
- Not a single model is hardcoded anywhere in code — neither in the kernel nor in a harness adapter. Not a single harness is hardcoded unless it has a justified custom adapter. Models and acpx harnesses appear only in the local config.
- Flows are data: e.g. "just implement", "implement/review", "TDD: ingest → record known problems → stubs → implement/QA/review/security review". Adding an agent to ingestion, a task-type flow, or the PM flow is a config edit; agent types and task flows can be added or commented out. More spike/agent types are configurable — e.g. for a dashboard: computer-use tests, design/usability review. Templating serves the architect flow too. The script surface is the kernel's fixed set of schemas: agent produces, script reads. A new schema is a kernel change, not a config edit.
- Prompts are assembled from shared fragments and single-definition templates — never copy-pasted. Use a well-established templating engine, not DIY: LiquidJS (strict TypeScript, `{{ var | filter }}`, CLI `npx liquidjs`, custom filters, async tags), Eta (TypeScript-native, ~3.5 KB, partials, plugins) or Nunjucks (Jinja2-like macros, block inheritance). Single definition extends to what prompts say about the kernel and config: output shapes, task-file fields, and flow and alias names are rendered from the kernel schemas and the factory config, never retyped in prompt text.
- A simple linter catches copy-paste: semantically almost-same fragments across prompts. Deterministic checks prove no fragment or prompt is dead. Prefer existing tools.
- Review retries configurable, with follow-up options: same agent on compacted context, different model, or de novo.
- Task review: three reviews by default, configurable — the reviewer may request changes on the first two, and the third is the last call. Change-request bounds are per agent, in config: for each agent in a config-defined agentic flow that can request changes, the maximum number of change requests is part of the config (for the reviewer it is 2). On the last call the agent receives a different prompt — ship with concerns recorded (net positive) or park.
    - Counting: the kernel keeps, idempotently, a count of each agent's launches in the flow, and keeps three kinds apart — technical glitches (e.g. a fallback), bona fide change requests and bona fide failures. Each agent gets up to a configured number of reminders (default 1) to produce its output.
    - Park is an agentic decision, never a kernel turn counter; a total number of turns (8) is not what is intended. If parked, the DAG continues until all unblocked items are done (the PM calls what is blocked/unblocked); the plan completeness checker (task level) can emit a task/steer to run to completion.
    - Review is not gospel: a separate adjudication agent that re-reviews all findings and may discard them is supported as configuration (another agent taking the review input and producing review-schema output before the harness sees it, on any review cycle or only the last one — most practical only on the last one, since the developer prompt already says to consider findings, apply them if net positive and in scope, else explain why in reply).
    - The last round decides: negative value → park, keeping the branch, until architect feedback; or record concerns/technical debt and go ahead. What becomes of a parked task is an agentic decision within the decider's scope of ownership: the PM and the plan checker ensure the plan progresses, the architect that the project does. The decider normally either amends the task (same slug) or cancels, replaces or splits it (new slugs). A kept branch that is complete and green lands at the next boundary without a new task.
- Concurrency in the local config: an overall limit plus limits per subscription — the quota pool a session draws on, whichever harness reaches it (e.g. in parallel 1 session on OpenCode free, 2 on OpenCode Go, 1 on Antigravity). Dispatch throttles per subscription and falls back.
- Merges land one at a time. Gates run in parallel, each task in its isolated worktree; tests that cannot run in parallel (e.g. integration-level) are serialized through the factory setup — e.g. a per-worktree dir declared in the environment, declared mutexes.
- Config has a schema and pre-flight validation.


### Context and focus are as important as model tier/diversity
- It is a popular belief that improvement needs a smarter model and provider diversity, and that planning needs a very smart model. That is not entirely true.
- Smaller models:
    - are more likely to make suboptimal decisions;
    - degrade more quickly on tasks with contradictory and/or complex context, tasks needing tradeoffs, etc.;
    - work quite well on a well-defined, focused task, even when the task is of an architecture or planning nature. E.g. a smaller model can perfectly plan or define an architecture; it degrades when it has to consider call graphs and edge cases at the same time.
- Any model, small or large — including the author's own model — can perfectly review results, even those of a larger model. At the end of the day, the job of the smarter actor is to make sure results AND motivation are understandable to small actors.
- Consequence: well-defined planning and review work may go to task-tier models.

### No useless ceremony
- All agents, especially the architect, focus on technical work.

### Task flow
- The exemplary flow, and the default in config for code-touching development:
    - Developer: must deliver the task plus a working test.
    - QA: accepts the work agentically — the spec is fulfilled and the work is tested well. Where a deterministic gate run exists, QA receives its result and log; it verifies no regressions, adds automated tests and smoke tests where logical coverage requires them, as applicable within the task's scope, and validates interfaces vs the plan. Changing tests and scripts is normal during development; that is why QA is a separate agent.
    - Reviewer: assumes the tests work; reads code, tests and output; verifies correctness and adherence to the plan (or to noted concerns); filters concerns, decides on severity, summarizes the job done.
    - Review round-trip: review → concerns → author (change and/or reply, both in the outcome schema) → review. An empty r2 that replies without code change is valid, not a fault.
- Self-improvement samples what QA catches that the gates and the reviewer miss, and the default flow keeps the step on that evidence.

### Model diversity
- When several suitable models are available (there are many at task and mechanical level), different steps of the same flow are assigned to different models. This is config-driven — the factory config specifies it with aliases. E.g. task implementer: switch model on retry, especially inside one multi-model harness that can reuse the compacted transcript.

### Roles of agents and models (conceptual; helps interpret everything below)
- Architect agent: preferably runs on large frontier-level models (Opus, Fable, Astra, Kimi). The architect's job is to decide what needs to be done to bring the project to the state specified by the intent (build from scratch or evolve an existing codebase) without introducing new technical debt or breaking existing functionality. In a saga's hierarchical process the architect relies on subarchitects to handle sublayers, so he does not need to look at the entire codebase. The architect (same context) doubles as code reviewer: he looks at the net changes since the project start. At each iteration the architect's job is to:
    - specify every task needed to complete the project that can be specified now, arranged in a DAG/milestones (in a saga, down to the epics its subarchitects own);
    - call out specific uncertainties that can be removed by spikes or foundational tasks, and plan up to the resolution of those uncertainties.
- Plan reviewer: a frontier or a task-level model, per config; fresh context. Plan review is configured in the factory config as part of the architecture flow — e.g. several separate reviewers, or more than one architect turn when concerns are raised. The findings schema includes technical concerns and plan-and-dependencies notes; the architect considers the technical concerns and can improve the plan based on the feedback, sometimes by providing more grounding/explanation in the plan. The plan reviewer's schema has no last-call option (ship/park).
- Task-level models include DeepSeek v41 1017, Muse/Ember, Luna, Haiku (currently of limited use due to the 100k-context price increase), Gemini Flash/Hydrogen, etc.
- PM: owns the implementation of the plan — moving tasks around, repairing artifacts, adding environment notes to task files (infra facts, known flakes, workarounds), ingesting user steers. Not technical: he owns artifacts, the DAG, and splits/changes beyond what mechanical orchestration handles.
- Task-level agents are arranged into config-driven flows depending on the type of the task: the list of task types, agents and prompts is config-driven, not hardcoded in the kernel. The kernel knows spike (no code change expected) vs development. Each task flow is a DAG, bounded and retriable. Examples of task types:
    - spike
        - fact-finding — figure something out (universal, or split into separate types: library / codebase / web research / computer-use test / specialized review)
        - PoC
    - development
        - normal dev
        - documentation only
        - e.g. backend dev vs dev with computer use (a separate task type is required, e.g. for a dashboard: an extra QA agent in the flow tests the integration)
- Task types come from config, which supplies the file names of their prompts. Schemas are the demarcation between tasks and kernel code: the kernel supports a fixed number of schemas, and every output that has to be verified or ingested by the kernel follows one of them. A task type names which of these schemas its output follows; it never supplies its own.
- Steward (merge agent): merges the wave at its end; involved when a merge conflicts or regresses tests (see Iteration).
- Plan checker: a specialized agent that checks whether the current plan (architect output) can still be progressed with net positive gain before the architect is involved — a task-level gatekeeper for the architect. It can formulate follow-up tasks, and is instructed to stay within the overall technical direction of the tasks.
- Triage: see Escalation ladder.

### Escalation ladder (triage)
- One cheap-but-capable agent classifies the goal: trivial / task / bigger (epic, saga). For a task it defines the scope. It is not smart enough to decide how big "bigger" is — that is the architect's call.
- Trivial: the same agent implements, in the same session (reusing the context it already built): after receiving the classification, the kernel sends a follow-up prompt with the location/branch.
- Standalone task: does not reach the architect. Its review prompt repeats the shared definition of a task's scope (one include, also used by triage and the architect) and asks whether the real scope is substantially higher than planned and the result requires architecture input; if so it auto-escalates to "bigger". Everyone can make a mistake; escalation corrects it. A task that is part of an epic is not a standalone task.
- Task or bigger: the same agent prepares the context pack — current status, relevant code facts; commands and their status come from the infra agent (ingestion flow). No separate triage/context-pack steps: same context, same agent.

### Iteration
- An iteration is one architect plan and its implementation: the architect plans; the script orchestrates all tasks until they are exhausted or blocked. Each architect consult starts a new iteration. Unless the run is stopped, an iteration finishes within one launch; a launch specifies the maximum number of iterations. A trivial or standalone-task goal has no architect: its iteration is the front's classification and the task's implementation.
- The architect plans the road to completion, not one iteration's slice: as much work as makes sense given the uncertainties. Where a detail cannot be settled yet he says so explicitly — deferring a feature until a named spike or foundational task lands — and plans the unblocked work in parallel.
- Every consult starts by evaluating the project against the intent — completeness, quality, correctness of the implementation so far — not merely the previous iteration's work. Is the work truly blocked or does it make sense to continue; what is incomplete or must be redone. In a saga, the architect defers to subarchitects for details in their domains; sub-epics get their own completeness check. Two in one: the same context serves evaluation and planning.
- Before the architect: a plan checker verifies the plan's status against the repo, with bounded repeats — it may name things to do before the architect is involved; its findings go back to execution, and the iteration keeps progressing, before the architect is consulted (see v1, removed in `3457b0c` and readable in git history: `plugins/software-builder/agents/plan-completeness-checker.md`, loop in `plugins/software-builder/skills/software-builder-asset/goal_flow.py`).
- A launch after an interrupt (mid-iteration stop, quota, computer reboot) is a script relaunch: no architect; the digest still runs and reaches the PM as a steer (see Bootstrap). If the resumed state is problematic, the script repairs it with an agentic PM turn and/or the plan checker, with a budget for extra retry.
- Relaunch/restart is idempotent by the script: no agentic work moves files around between restarts. Agents stopped mid-flight are relaunched by the script in their worktree with an extra prompt: "you were working on the task below, we had an unrelated technical problem, finish the task". The PM repairs artifacts the script cannot read (e.g. broken YAML).
- Scope: the architect predicts a reasonable scope per task — a prediction, not a fence. He does not name files — a waste of tokens. Within a wave, tasks have no logical dependencies and can reasonably run in parallel without likely substantial conflicts: it is fine if they add to the same file (the steward sorts it out), but logical overlaps are undesirable. Between waves, tasks may depend on each other logically. Nothing enforces which files a task touches. Normal development.
- End-of-wave steward (v1 wave checker; omitted when the wave merges clean and green): merge, resolve conflicts, run CI/CD, fix the obvious, record concerns for the non-obvious, decide what to hold. DoD: branch state ready for the next wave; task status revised if unmerged. Tasks that did not merge are relaunched to port on top of the new branch state. Conflicts are normal during development, sometimes logical (test failures). The steward is compacted at the end and relaunched as needed. Merge ladder: the task-tier steward resolves trivial conflicts → unresolvable goes to the architect with a pointer to the overall status plus the worktree and branch of the problematic item.
- Why: too-tight scopes, no end-of-wave merging with repeat, and no plan status check before the architect cause rework and conflicts.
- The kernel ensures every agent delivers. An agent that ends its turn without delivering is asked again, up to the configured number of reminders (default 1) — e.g. the architect: "You need to deliver. Specify actions, including spikes if needed to plan more, in the plan; or declare the goal done (if config allows it) or blocked, naming what must happen first." The ask is a prompt template from config; its exact shape depends on the agent.

### Context economy
- Same context: same agent. Different context: different agent.
- Reuse stored agent sessions within one harness. Across harnesses portability is directional and not always feasible: a graph records which way a session can move. Portable → continue from the compacted session. Not portable → de novo, with the context pack and links to artifacts. Any session that cannot be resumed → logged as error, started de novo.
- Compact at the end of a session; reload the compacted session for the same agent's next turn: the next consult, the next review round, or the next iteration. Compaction is both cost saving (fewer tokens on restart) and context management (drops previous reasoning on a fix-up launch of a task or on the architect's next iteration). Compaction is transcript trimming — even server-side — not a handoff summary; the two serve different reuses and must not be confused. No tree/branch summaries.
    - Compaction kills two birds with one stone: a cold retry does not pay for the entire transcript, and the context is adjusted so concerns/suggestions get decent consideration. Reusing the compacted session also saves rebuilding the entire context from scratch; on reuse the agent rereads what it needs.
- Warm starts: when pending tasks touch roughly similar code areas (the PM's call; on a small project most areas are similar), build a pre-warmed starter per area — familiarize with the code, test structure and flows, then compact — and reuse it as the starter for many turns. Rollout is gated: a spike first researches (web search included) whether warm starters make sense, and cancels them if not; then the build runs warm vs cold starters at random and the measured verdict decides.
- Plans are the architect's markdown, edited in place — never in flight; the architect owns them. A cheap PM turns the plan into task files: it identifies task files, owns the DAG and the dispatch sets, and resolves whatever cannot be derived deterministically (missing branches, misplaced artifacts). The PM is a paper-pusher, not a peer: it converts the architect's bullet-point vision into actual tasks, interpreting intent into more formal shape — splitting and merging tasks as the formalization requires. There is no PM/architect disagreement to resolve; the architect's intent governs. Tasks are named by short immutable slugs. Never force whole-plan re-issue through a strict schema. Diffing serves only to inform the (compacted) PM of plan changes on subsequent iterations.
- Status is aggregated by the script from structured outputs / YAML artifacts, idempotently; the context pack is prepared from it.
- The context pack is an index: derived status, infra commands and code facts as paths — links, not content by default: one-line summary + link; the preparer pastes in full only the few items the architect must read anyway. Preparing it is the job of the pack preparer, a secretary: it decides what is worth including and what is worth a reference and a brief summary — an opinion on relevance, none on technical merit — so that expensive context goes to what is most remarkable. The architect can still search, read and scout himself. No artificial caps; if a size limit ever applies, the pointers to the files the architect needs to read agentically stay in.

### Saga and hierarchy
- Hierarchy depth is bounded by config: 1 architect level is the norm, 2 the expected maximum. A subarchitect is split off only when the size/complexity of architecture context demands focused context; until then, the architect owns all planning and review down to task level. Untouched levels are not invoked.
- Strict chain: task-level concerns go to the architect responsible for that epic (epic→architect may be many-to-one). The subarchitect filters and consolidates escalations into one brief upward; implementers/reviewers never reach past their architect. The top architect is the root of this chain (the goal's architect); with depth 1 it is the only architect.
- Each subarchitect owns the status summary of his iteration. Task dispatch stays in the single script. On each iteration the top architect decides the subarchitect set and may leave out an architect whose job is done; the architect register is maintained as part of the saga plan.
- Architect and subarchitect prompts share their common portions — bounds, completeness check, plan format, granularity, debt and stop rules — as shared fragments of the templating engine. Each adds only what differs: its scope (goal or epic), whom it reports to, and launch-specific reminders.
- One orchestration script owns everything down to task level — through a harness abstraction that knows each harness's capabilities and orchestrates the chain of architects accordingly. It does not drive every harness directly and uniformly.

### Uncertainty and spikes
- Risk, uncertainty, complexity first. A milestone may defer detail until a spike lands ("XYZ details after spike"); implementation work already unblocked proceeds in parallel. Orchestrate all.
- The architect issues what it can direct now plus the spikes: "I need modules X, Y, Z; X is clear (T1, T2); Y needs a spike (research, PoC, a couple of interactions); Z depends on Y" → issue T1, T2 and the spike, then decide next steps.

### Stopping and debt
- The architect is incentivized to stop: goal met → done; no infinite continuation.
- Stop criteria, stated in the prompt: the goal is met, or no more meaningful development is possible without owner feedback; no new technical debt, no slop, clean-code principles met. A goal's own formal acceptance criteria apply when it has them.
- Done = shippable and tested: maintainable code satisfying repo rules; no new technical debt (clean code, coverage rules satisfied); no known bugs; comprehensive testing; workmanship aligned with intent. Debt about wording and structure may close with a sweep per milestone; behavior and test debt keep a task. Done detection sees open debt; the summary shows the distance (pending, parks, open debt), and that distance shrinks before new milestones open.
- Debt evaluation is for the architect to decide agentically, as part of the intent-vs-repo assessment.
- When a new iteration starts on an existing goal, the architect first reviews the implementation for technical debt and gaps (from compacted or de-novo context), then plans; a resume after an interrupt does not involve him (see Iteration). Historic debt may need addressing to enable the goal; no new debt created by the goal.
- The architect may authorize temporary technical debt; removal by the end of the same goal.
- Bounds: a launch limits the number of iterations; review cycles are bounded; optional limits on $ / subscription use / time per iteration. On a per-iteration budget hit: drain — no new dispatch, in-flight work finishes within its own bound.

### Steering and autonomy
- What the architect may decide alone vs what blocks on user input is config-driven: the process config defines the criteria, and the templating engine assembles them into the prompt. Under the current calibration the architect records a reversible assumption, notes it as remarkable, and continues; the user steers/overrides. Human-involvement presets (autonomous / principal / detailed) select the calibration.
- Mailbox, not ACK protocol: the user drops files to steer; the user sees remarkable notes (iteration summary, concerns, open questions) — at least one remarkable entity per iteration (the iteration summary is the guaranteed one), never spam.
- The script monitors the mailbox at startup and during a run. Steers do not interrupt work: running tasks finish and pending work keeps dispatching.
- A cheap PM handles what needs no architect: a task-specific steer, or one that requires a redo or change, is handled by the PM; a small task or spike to report back to the owner is dispatched by the PM.
- The architect is involved when a steer needs an architecture decision. A steer that amends the intent is carried into the intent first (see Intent-change steer); the PM decides to what extent it precludes pending tasks from completing and marks those tasks blocked or mooted by the steer, which may end the iteration early. The architect sees the change at the next iteration. An urgent steer is the exception: it ends the iteration early — dispatch stops, running tasks finish (drain) — and the consult that follows opens the next iteration.
- A steer may stall the run when, given the steer, no pending task still has value, or when the user asks for a priority that is not planned: tasks drain, then the architect is involved.
- Every steer ends processed, with the response in the outbox. All these steer scenarios are built and tested during self-improvement.
- Intent-change steer: when a steer clearly adds or modifies intent, the goal's intent is updated — preferably by a dedicated cheap agent — preserving user instructions. The intent stays consolidated: the latest input wins and superseded text is removed. No interpretation, just carry over the edits. At the next iteration the architect sees what changed from the diff and the steer record.

### Status reporting and dashboard
- The user sees status — intent-wise what works / is not yet built / has friction, plus mechanical/technical concerns. Easily accessible, understandable, clickable.
- A high-quality HTML dashboard (use a library) efficiently presents mechanical status, costs, and intent completion. Either html/json files updated by the kernel at least after each agent launch or finish, or an HTTP server on localhost that supports parallel builds (e.g. different ports). As much "use", not build, as possible.

### Clean code and architecture
- Test real behavior.
- These rules specify the result; the build approach is separate: bottom-up implementation, vertical slices, iterative. Build priorities: uncertainties, then layers handling edge cases, then tested slices of user-visible functionality; exact ordering is decided case by case.
- Edge cases, security posture, failure propagation/containment, observability, performance are architectural direction from day one.
- Comments: why, only for non-trivial code. Self-documenting code over docs.
- Public interfaces separate from implementation, preferably separate files; interface docs readable by humans and agents alike.
- Where the target repo has its own conventions, the repo's win; these rules are defaults.
- ADR is a high bar: a long-term decision shaping the project or a whole layer; concise decision/enablement-vs-limitation, tradeoff vs alternative. Not routine decisions, not normal consult outcomes.
- The factory applies this to itself: autoformat, lint, schema checks of all schema-enforced files/configs (see Stack for what lint enforces).
- All prompts follow the prompt-debloat principles (`/home/slava/aiexp/software-builder.dev/plugins/prompt-engineering/skills/prompt-debloat`).

### Stack
- TypeScript: linted, autoformatted. Code complexity, file size and separation of interface from implementation are enforced by lint for the factory's own code, with thresholds in the lint config; for target repos separate files stay a preference.
- `.sh`: minimize; ZERO real logic in sh.

### Harness agnosticism
- Works through any ACP-compatible harness with opaque config passed at launch (command-line args, env, or config files depending on the harness). omp is a special case that simplifies things, not a dependency; extra tools exposable through ACP. Supported and tested: omp, OpenCode, codex, pi, Claude Code, agy (Antigravity CLI) — with harness rotation across iterations so no harness-specific assumption survives untested. A new harness/model combination is first proven on a canary goal — a trivial goal and a standalone task; for an architect leg, a small "bigger" goal — and joins the main goal's rotation only after it passes; rotation is among proven combinations. For tests there is also a fake acpx harness profile, test only.
- The build is harness agnostic. Which harness does which role best is discovered during bootstrapping and recorded in run configs (default/exemplary config), never in code. Starting hypotheses: pi is the task-flow implementer (minimal, great at the single task); omp and OpenCode fit spikes better off the shelf, where subagent expansion matters.
- Harness adapters: a custom adapter only when the harness offers substantially more than ACP exposes (omp is that case: RPC, yield, compaction, overlays). Otherwise drive the harness through acpx (OpenCode included), or at worst plain ACP — never a bespoke CLI wrapper for what the protocol already covers. No code: the config uses acpx naming (and opaque config), and that is it. Where acpx already supports a harness through a built-in adapter, an existing custom adapter needs a solid recorded justification — what improvements the bespoke adapter provides that acpx does not — or the harness moves to the generic acpx path.
- acpx is the enabler of agnosticism: an acpx-compatible harness is expected to be added by configuration alone, with no code change. A direct layer for such a harness is allowed later only on measured evidence that ACP loses something needed.

### Operating assumptions
- The entire factory is assumed to run inside a sandbox (e.g. bubblewrap). The sandbox assumption is documented; building the factory sandbox is out of scope for now. Sandboxing individual harnesses can come later.
- Which models see which code (training/retention policy) is the owner's run config, not a factory deliverable.

### Delivery
- The factory is a plugin with a skill "run factory": where to put the intent, how to configure, what to launch, what to see, where the user sees the HTML; kernel and config are skill resources.

## Mechanics

### Loop causes designed out
- Over-prescription and mechanical checks on agent output (e.g. which files changed) create loops and no value. A turn is judged by what the agent delivers, the gates and the review; a check on agent output stays only on evidence that it prevents real defects.
- A turn with no usage and no output is a technical glitch — retried or failed over; it spends no reminder and is never the task's failure.

### Structured output
- Strict schema (tool/yield) only for small, simple outputs. The plan is markdown; the PM derives task files from it.
- Every agent that produces a schema-controlled file (PM, task reviewers, QA) has a validation command in its prompt (bun/npx, whatever) and, where the harness supports it, LSP. The factory artifact folder must have a config file — preferably harness agnostic — that enables LSP for the artifact schemas. Test at least for omp.
- The validation command checks what the kernel will check for that step; every repair records its finding; the number of reminders comes from config (default 1).
- Write the kernel schemas out as JSON Schema and generate one LSP config into the artifact folder; omp first.

### Architect directional technical decomposition and plan → PM task files
- The architect writes one markdown plan; the PM derives task files, the DAG and the dispatch sets. The architect never maintains schema-consistent files.
- Reconcile is deterministic where it can be (done tasks frozen, rework as a new slug, pending tasks re-read at dispatch); the PM resolves what determinism cannot — missing branches, misplaced artifacts, ambiguous mappings.
- Diffing library choice is the implementer's (id-keyed matching if arrays are compared; microdiff is index-based and fails that).
- The bullet carries what only the architect can say — what, why, done-when, plus interface or approach where he has a direction; the PM writes the rest.
- A task leaves only by an explicit decision of its owner (amend, cancel, replace, split); the plan carries open work; history stays in records and summaries.

### Boundary: plan review and plan checker
- Plan review is the architecture flow of the factory config — its reviewers, its findings schema, the architect's turns on technical concerns — and it completes before the PM derives tasks.
- The script calls the checker only when something is parked, blocked or pending; the checker reads the recorded gate results instead of running the gates.

### Context pack and status
- The pack preparer decides what is included in full and what is a reference with a brief summary; Distance counts what is open.

### Gates
- A tree is judged once: a gate result is keyed by the tree it ran on, and the result and log go to the agents that follow.
- Gates shall be reasonably fast and shall use no API/model calls. Slow gates run only case by case.
- Skip the merge-check when the merged tree equals the checked tree; make the factory's suite safe in parallel worktrees (ports, caches, build dirs per worktree); no repo-wide gate mutex.

### Harness access layer
- omp RPC (JSONL) is far more capable than ACP: compact, fork, subagent steering/IRC, host tools. Special-case it; with omp as architecture harness, subarchitects can be subagents reachable through IRC — one strategy of the capability-aware layer, still owned by the script.
- omp subarchitect: a subarchitect on omp must be an explicitly defined agent, not an anonymous subagent call — a transient plugin whose prompt is rendered by the templating engine, carrying the tools to spawn scouts and tasks. Being defined is what makes it addressable: the script reaches it over IRC by agent name, steers it, and records its turns and spawns like any other step. Anonymous one-shot subagents give no handle, no steering, no record.
- Everything else through ACP; acpx (headless ACP client, persistent sessions, embeddable runtime) is the generic access layer; reaching Claude Code and Codex through adapters is fine. Where a harness's native interface is more capable than ACP — e.g. native structured output in Claude Code and Codex — a direct layer, as for omp, is built only on measured evidence that ACP loses something needed; acpx by config stays the default.
- Session portability follows the directional graph (one-way into omp from Claude Code and Codex; ACP has no transcript import). Fall back to de novo + context pack + links to artifacts.
- Compaction and cache: all providers cache prompts. A compaction request takes the whole transcript as input and is charged for it: cached-read price while the cache is hot, full input price once cold — compacting a cold session costs as much as the cold resume it was meant to avoid. Rule: compact at the end of the session, inside the cache TTL; never at the start of a resumed session. TTL is config (omp enum `auto|short|long|none`: set `short` explicitly; `auto` keeps 1-hour entries on subscriber sessions, doubling the cache-write price). No cache warming between separate calls: for implementer sessions, resuming the compacted session beats keeping the full session warm. Compaction rules are cost- and capability-model dependent: learn the reuse behavior during bootstrapping; the target is config-driven rules for what to compress on which review iteration. omp compacts Claude sessions server-side and stores portable summary text; Claude Code's `/compact` is client-side — same charging rule.
- For hierarchy on omp, the subagent (subarchitect) context shall also be compacted for the next launch.
- No thinking or effort level is hardcoded in an adapter: an alias names its level, the harness default, or auto, and pre-flight checks what it names. Compaction is config per harness entry — on for agy and Claude Code, or the run config records why not.

### Quota and fallback
- Quota is a state of the subscription pool, not of an alias: once a pool answers "quota", every alias drawing on it treats it as exhausted until configurable retry 
- Name the subscriptions in the run configs; keep the exhausted state per pool, across aliases and across launches, until the configured retry.

### Git hygiene
- Mechanical commit between agents (worktree), short hashes passed so the next agent reads diffs.
- Cleanliness: heuristic check for the unusual — large files, new file extensions, many files outside the task's scope, temp files/model weights/huge outputs — with agentic revision (the author inspects and fixes or justifies) as a follow-up prompt. Prefer OSS; where nothing exists, something simple. Prompt reminder to clean scaffolds; `.gitignore` is the hard floor.
- idempotently clean up all worktrees created by KERNEL: at every launch and at goal end, remove worktrees of merged/cancelled tasks and finished spikes; parked/unmerged tasks keep their worktree.
- give agents relevant hashes (eg architect need to know hash before goal, hash before last iteration)
### Orchestration artifacts
- Storage is an interface. Backends: plain folder (gitignored under the repo, or outside it), separate GitHub repo, same-repo folder — all built and tested.
- Never commit sessions/logs or raw agent inputs/outputs.
- Code changes may sit on an unmerged branch; orchestration artifacts stored in the same repo are merged/cherry-picked ASAP. Artifacts stored separately need no cherry-pick.
- One artifact, one canonical location: the file structure never copies the same file over and over into multiple dirs.

### CRITICAL — bootstrap
- The factory is built by running itself, one iteration per launch. Each launch: a cheap scout distils the previous run's artifacts/transcripts into an evidence digest (cost by role, loops, failures, interventions, with paths) and drops it as a steer. The PM handles it like any steer; what needs an architecture decision reaches the architect at the next iteration, and he drills down by path. Session store outside worktrees and git (path in run config, last N runs kept).
- Always execute from a pinned last-good version, never from the tree being edited; promote after the no-model E2E suite passes. Metrics per iteration: architect launches, architect share of tokens and turns, cost per merged task, loop incidents, human interventions. The transcripts of previous iterations are analyzed, as a judgement call, for efficiency and issues.
- Landing and promotion are operator work until the owner says otherwise. Code after each iteration lands on `main` of the agentic-swarm repo.
- The operator session gives requirements — which subset of the intent is the current phase — operates, recovers from major issues, and reports bugs and incidents as steers. It does not prescribe milestones or plans.
- During self-improvement the architect is concerned with both mechanical solidity and agentic behavior — e.g. how useful review feedback was — and may plan spikes that investigate previous sessions' behavior.

#### Bootstrap models/harness (one run config, not a factory assumption)

- Architect: Claude Opus 5.5 at high (omp, Claude Code). Escalation implementer: Sonnet 5.5 — minimize use.
- Plan reviewer: muse contributor 1.3 at max.
- Subscriptions and harnesses used during the build; self-improvement runs cover every leg:
    - agy (Antigravity CLI) with gemini flash 3.8 at high, through acpx — task level; the preferred task-level model when the subscription is available; the subscription must be used.
    - OpenCode Go subscription — omp (2 keys, auto rotation), OpenCode (muse limited to xhigh), codex, pi; most of the task-level spend goes there. The only allowed paid models are deepseek v41 (defaults to 1017) at max and muse contributor 1.3 at max.
    - OpenCode Go `opencode-go/hy4-flash-free` (through the same 4 harnesses) — used as the mechanical level.
    - Claude subscription (Opus/Sonnet): usable in omp and Claude Code. Used only for the architect (Opus) and the escalation tier (Sonnet).
    - OpenRouter free: ernie 5.5 flash preview — the weakest task-level fallback.
- Multi-architect (saga) is tested with both:
    - omp: same session, IRC; the architect prompt launches subarchitects; subarchitects are compacted before the second launch; the architect prompt reminds them they were already launched; subarchitects still need to develop written status reports.
    - Claude Code: written report only; automatic launch → first a review, if the subarchitect created a plan in the previous iteration; then creation of a subplan, if assigned by the top architect.
- OpenCode harness -only free models: glm-5.3-flash-free, deepseek-v4.1-flash-free (most capable), minimax-m3.1-flash-free, mimo-v2.6-flash-free — use when available, same capability
- Muse vs deepseek on a focused implementer task is unsettled; self-improvement compares them. 
- As soon as a combination is believed to be supported, a canary goal tests it (see Harness agnosticism); once it passes, the config is shifted and the combination joins the rotation.
- Implementers / task reviewers at the highest supported effort, set explicitly in the local config in each harness's syntax (muse takes `:max` on omp, `#xhigh` on OpenCode, the bare id on codex) and checked at pre-flight. There is no `highest` keyword.
- Several model configs, alternated across iterations to test harness combinations; pi is one of the rotated harnesses.
- Model switches on retry are tested both inside one harness and across harnesses.
- omp supports auto rotation (OpenCode Go has 2 keys) and auto fallback (aliases can be used with config fallbacks); the other harnesses do not. That makes them perfect for testing kernel-level fallbacks, e.g. from pi as task implementer to agy.

## Gaps and inconsistencies

Current build (`main`, run `delta` i1–i9) vs the intent above. *not built* — no code for it; *deviates* — built differently; *friction* — works, with a cost shown by a run; *buggy* — wrong result. Remove an entry when it lands.

### Roles and flow
- *not built* — infra agent in the ingestion flow. Gate commands are hand-written in [`.factory/repo.yaml`](.factory/repo.yaml); red and flaky handling is script-side ([`flow-gates.ts:78-114`](plugins/software-factory/src/kernel/flow-gates.ts)); no agent outputs commands + status.
- *not built* — ingestion flow as configurable steps. Boundary turns are a fixed set (`front`, `packprep`, `plancheck`, `pm`, ...) in [`process.yaml`](plugins/software-factory/config/process.yaml); no code-map step, no slot for extra steps (e.g. requirements agent).
- *deviates* — goal branch. Always `factory/<goal>` cut from `baseBranch` ([`paths.ts:184`](plugins/software-factory/src/kernel/config/paths.ts)), not the repo's current branch.
- *not built* — concerns funnel order. PM prompt does not judge whether a concern blocks the rest ([`pm.md`](plugins/software-factory/prompts/pm.md)); plan checker brief carries no concerns ([`plan-check.ts:200-215`](plugins/software-factory/src/kernel/plan-check.ts)); concerns reach the architect through the pack ([`context-pack/append.ts:181-188`](plugins/software-factory/src/kernel/context-pack/append.ts)).
- *not built* — architect flows by project state (ingestion, return after uncertainty resolution, declared done by plan checker, concerns to resolve) and separate architects (designer, security, functional safety). Config has one plan review + one return turn ([`process.yaml`](plugins/software-factory/config/process.yaml) `architecture:`); plan checker verdicts are only `progress | architect` ([`plan-checker.md:20-24`](plugins/software-factory/prompts/plan-checker.md)).
- *deviates* — steward on red CI. Steward runs only for tasks parked on a merge conflict ([`steward/candidates.ts:53-65`](plugins/software-factory/src/kernel/steward/candidates.ts)); i9 steward: "skipped: no conflicts" ([01505](/home/slava/aiexp/agentic-swarm.wt/v3/.factory/artifacts/delta/records/01505-i9-steward-r1/end.yaml)).
- *not built* — resume prompt on relaunch. Interrupted records are sealed `infra: crash` and the step is re-dispatched with its normal prompt ([`derive-task-facts.ts:281-289`](plugins/software-factory/src/kernel/derive-task-facts.ts)); only the trivial front session gets a resume note ([`flow-turn.ts:110-117`](plugins/software-factory/src/kernel/flow-turn.ts)).
- *deviates* — fallback resume prompt. A fallback tier gets the unchanged step prompt ([`agent/chain.ts:200-218`](plugins/software-factory/src/kernel/agent/chain.ts)).
- *deviates* — every steer answered. A steer left unanswered at two boundaries expires with a `steer-unanswered` record and no outbox response ([`boundary-tail.ts:144-174`](plugins/software-factory/src/kernel/boundary-tail.ts)).
- *buggy* — standalone task upscope. Only a reviewer's `upscope: yes` rewrites `class.yaml`; an implementer's `status: upscope` parks the task and the class stays `task` ([`flow-result.ts:129-133`](plugins/software-factory/src/kernel/flow-result.ts), :174-183).
- *not built* — task types with "when to use" in prompts. Task types carry only flow/kind/schema ([`flow-schema.ts:133-139`](plugins/software-factory/src/kernel/config/flow-schema.ts), [`prompt-schema.ts:305-315`](plugins/software-factory/src/kernel/prompt-schema.ts)); the plan checker prompt gets no task-type list.

### Config and harness
- *not built* — generic or project-specific coding rules. No config key; one fixed fragment ([`clean-code.md`](plugins/software-factory/prompts/clean-code.md)).
- *deviates* — artifact LSP. JSON Schemas and `.omp/lsp.json` are written ([`schemas.ts:85-108`](plugins/software-factory/src/kernel/schemas.ts), [`artifact-lsp.ts:89-99`](plugins/software-factory/src/kernel/artifact-lsp.ts)); no run config sets `lsp`, so omp runs with `--no-lsp` ([`omp/runtime.ts:157-163`](plugins/software-factory/src/harness/omp/runtime.ts)). QA outcome schema is not exported ([`qa.ts:26`](plugins/software-factory/src/kernel/qa.ts)).
- *deviates* — model diversity. In the active run config QA and reviewer use the same alias pair ([`self-quota.yaml:24-32`](bootstrap/run/self-quota.yaml), :67-90).
- *deviates* — "throttles per subscription and falls back". A capped pool only waits; fallback starts only after a quota answer ([`dispatch-admit.ts:115-123`](plugins/software-factory/src/kernel/dispatch-admit.ts), [`fallback.ts:195-212`](plugins/software-factory/src/harness/fallback.ts)).
- *deviates* — canary goals. No canary goal has run ([i9 pack:225](/home/slava/aiexp/agentic-swarm.wt/v3/.factory/artifacts/delta/iterations/9/context-pack.md)).
- *deviates* — session portability graph. Helper exists ([`harness/types.ts:222-234`](plugins/software-factory/src/harness/types.ts)); no run config declares an edge, so every cross-harness resume is de novo.
- *deviates* — compaction per harness entry. agy has no compact flag and the run config records no reason ([`self-quota.yaml:136-146`](bootstrap/run/self-quota.yaml)).
- *not built* — copy-paste prompt linter and dead-fragment check. Lint gate is Biome + knip ([`scripts/lint.ts:23-32`](plugins/software-factory/scripts/lint.ts)).
- *deviates* — bootstrap models. Plan reviewer is hy4-flash-free, not muse ([`self-quota.yaml:10-23`](bootstrap/run/self-quota.yaml)); ernie, listed as the weakest fallback, is primary for PM/QA/reviewer/digest (:67-102); glm and mimo are in no run config; the agy implementer is recorded hard-dead (:1-7).

### Artifacts, context, git
- *deviates* — worktree cleanup. Only worktrees under the current repo-id root are removed, at launch ([`worktree/checkout.ts:210-235`](plugins/software-factory/src/kernel/worktree/checkout.ts)); after i9, 8 delta task worktrees from the old pin root were left behind (5 merged, 1 finished spike) and had to be removed by hand.
- *not built* — hashes for the architect (before goal, before last iteration). Task turns get `base_hash`/`head_hash` ([`flow-turn.ts:84-90`](plugins/software-factory/src/kernel/flow-turn.ts)); the architect gets only the current head ([`VARIABLES.md:30-46`](plugins/software-factory/prompts/VARIABLES.md)).
- *deviates* — cleanliness heuristic. Checks size and extension only ([`cleanliness.ts:32-64`](plugins/software-factory/src/kernel/cleanliness.ts)); repo.yaml has no cleanliness block, so it always passes; no revision follow-up prompt.
- *friction* — plan carries history. Delta [`plan.md`](/home/slava/aiexp/agentic-swarm.wt/v3/.factory/artifacts/delta/plan.md) is 838 lines: milestones R–X of closed iterations plus A–J; the architect re-reads it every consult.
- *friction* — pack preparer. It wrote the i7 and i8 packs; at i9 it stopped on quota and the script rendered a 2,179-line pack ([01425](/home/slava/aiexp/agentic-swarm.wt/v3/.factory/artifacts/delta/records/01425-i9-packprep-fallback-r1/end.yaml), [i9 pack](/home/slava/aiexp/agentic-swarm.wt/v3/.factory/artifacts/delta/iterations/9/context-pack.md)).

### Scale, quality, delivery
- *not built* — project types beyond software. Only `development`, `spike`, `trivial` task types ([`process.yaml`](plugins/software-factory/config/process.yaml) `taskTypes:`). Delta spike: a chip flow merged on config alone, but structured gate evidence needs JUnit or a pytest/jest/cargo pattern, and binary files cannot be reviewed or merged ([01460](/home/slava/aiexp/agentic-swarm.wt/v3/.factory/artifacts/delta/records/01460-i9-project-type-spike-implement-r1/outcome.yaml)).
- *not built* — saga depth 2 never ran. Code exists ([`boundary-tail.ts:262-307`](plugins/software-factory/src/kernel/boundary-tail.ts)); process config ships `depth: 1`; no run has had a subarchitect; the omp task tool has no run-config opt-in ([01435](/home/slava/aiexp/agentic-swarm.wt/v3/.factory/artifacts/delta/records/01435-i9-omp-task-tool-off-implement-r1/outcome.yaml)).
- *deviates* — dashboard. Hand-written LiquidJS HTML, no library ([`dashboard-template.ts`](plugins/software-factory/src/kernel/dashboard-template.ts)); the "Intent completion" card counts merged/live tasks ([`dashboard.ts:114-147`](plugins/software-factory/src/kernel/dashboard.ts)); no intent-wise works / not built / friction view.
- *deviates* — pinned build. `factory run` does not check the pin ([`bootstrap/promote.sh`](bootstrap/promote.sh) only creates it); delta i6 was promoted by hand with a suite test red ([LOG.md:872-873](/home/slava/aiexp/agentic-swarm.wt/v3/bootstrap/LOG.md)).
- *deviates* — lint. Complexity 15, 50 lines per function ([`biome.json:30-49`](plugins/software-factory/biome.json)) and 500-line files ([`check-file-size.ts`](plugins/software-factory/scripts/check-file-size.ts)) are enforced; interface/implementation separation is not.

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
- **Context pack**: an index — derived status, infra commands, code facts with paths; links by default, full text only for the few items the architect must read anyway; no artificial cap, pointers always present — prepared by the pack preparer (the front agent on a new goal) from the status the script derives; what to include in full and what to reference with a brief summary is its call.
- **Front agent**: the cheap triage agent; it classifies the goal, implements trivial goals and prepares the context pack.
- **Boundary**: the point between iterations where the architect is consulted (after the plan checker) and where kept branches land.
- **Park / kept branch**: a task stopped without merging; its branch is kept so the work can continue or land.
- **Operator**: the session that sets the phase, launches, lands and reports incidents as steers (bootstrap only).
- **Pin**: the last-good factory build that a run executes from.
- **Ingestion flow**: the configurable flow at goal start — goal branch, triage, infra, context pack, code map, extra configured steps.
- **Goal branch**: the branch a goal's tasks merge into — the repo's current branch, or a new branch created by the ingestion pipeline when the current branch is the default (main, master).
