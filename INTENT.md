# Agentic software factory — INTENT

**Mechanics** are the HOW, shiftable on real behavior. Everything above **Mechanics** is user intent, must be built and tested.

## High-level intent

Modern harnesses deliver a decent story (several hundred lines of code). The agentic software factory is an orchestration framework on top of harnesses that delivers up to a saga (an entire product) or a major refactoring — token-efficient, slop-free, steerable, observable, autonomous, scalable from a trivial edit to a saga. One goal may span many epics and tens of tasks per iteration, across multiple resumable iterations; no size ceiling.

- Stop in the middle, relaunch — it keeps going; avoid duplicate work and keep token economics.
- Auto scales from "trivial" to "task" to "epic" to "saga"
- Harness agnostic 
- Configurable for different flows and types of projects, from
   - software delivery: stack, testing and build framework agnostic
   - Silicon and industrial design
   - Deep research
   - Loop-based optimization — e.g. architect selects most promising directions to try, PM creates tasks to research and implement approaches; they are merged; architect decides what to do next (including pruning of not-promising tasks)
   - For project types other than software delivery the requirement is a design constraint: nothing software-specific is hardcoded in the kernel; shown by review, no presets or runs required.
- Every flow assumes committed artifacts, git worktrees and shell scripts for deterministic checks. Minimum common denominator for a check is a shell script; no JUnit or runner-specific format required.

### Model economics

The cost (or subscription use) between frontier models (Opus, Fable, Astra) and capable implementer models (DeepSeek/Qwen Flash, Haiku, Luna, Sol on Low) is ~40–80x; plus sometimes there are "free" up-to-limit models. The speed also varies dramatically, sometimes 10x.
For humans, even with global pay differentials, the price delta is 30%–5x (with sometimes a 10x performance delta). The agentic factory needs to aggressively leverage cheaper models — focused tasks, context preparation for expensive models, etc. The architect may dominate the bill.

For the purpose of design, we consider the following models:

- **Architect** (expensive) models do only what a human architect does: convert intent into actionable but directional plans, directional interfaces, key-algorithm direction, tradeoffs above task level. They are called with a prepared context pack and work agentically and subagentically — launching scouts/tasks and waiting for them is fine, with no limits on them. They write no code beyond key interfaces and no verbose documents. Each architect produces one markdown plan, written for architect/reviewer friendliness and efficiency — maintaining file schemas is not architect work. Difference between human architect and agentic architect: as an agentic architect needs to build context (expensive), he doubles down as reviewer of a project at high level (does not need to go to implementation details, but interfaces, key tests, edge-case handling, code compaction and readability) — and uses it to define the plan.

- **Sr. Implementer/Workhorse** — focused task, code review, debugging, research, etc.

- **Simple** — orchestration fix-ups, explorations, context preparation, schema repair, commits, running gates, etc.

- **KERNEL** is not a model, it is a script responsible for overall orchestration flows, launching agents, sending prompts, git mechanics, etc.

- The architect's plan is reviewed for impracticality, unclarity and rule violations — real bugs are not unusual even for task-tier reviews. Which model reviews is config: task tier or frontier.
- For all reviews, the context is different from the implementer context, even if the model is at the same tier.
- The review is advisory input, not a veto: the author considers it, and "consider" spans the full range — from ignoring it on a factual judgement, to clarifying the plan, to realizing "oops" and changing it. During self-improvement the architect samples whether the review was helpful (one issue caught earlier reduces work 10x).
- The same agent (architect/implementer after review, reviewer to look post-review, PM on subsequent invocation from the same task) is started from pre-compacted (compaction when the cache is still hot) context. This enables both token economy (no turns to build the same context) and a fresher look — context, but no reasoning.

- Orchestration agent launches are delayed until non-blocked tasks are exhausted, a user steer arrives, or an agentic concern may render the task list moot. Expensive models are used after cheaper-model context prep and funnel concerns.

### How Factory works
#### Patterns we avoid
   - "Smart orchestrator top" swarms agents — it sometimes works for medium-scoped tasks, but considerable research shows that it is not always cheaper than a smart model doing end-to-end. In our experience, in addition to burning a lot of tokens on trivial orchestration mechanics, if something goes non-trivial, the orchestrator tends to overtake all the work.
   - "Smart planner" — in our experience, the plan sometimes gets more detailed than the code. Also, it assumes a smart planner can think everything to perfection. In reality, all development must be experimental and test-driven.
   - "Smart reviewer" — although it is beneficial to have a smart reviewer, we found that
      - A Flash-class model with focused context does decent reviews.
      - The context the reviewer has to build is not different from what the planner has to build, and the review result is not different from a plan.
#### Immutable part coded in orchestration kernel
##### Key players
   - The key orchestration player is the script **kernel**. It invokes harnesses with agents, reads structured artifacts prepared by agents and checks steers by users, executes the commands infra defines (setup, compile, lint, tests), git commits and merges, worktree setup and cleanup.
   - To enable parallel operations, rollbacks, etc., we leverage git, git worktrees or compatible modern performance alternatives.
   - Our key technical player is the "architect" (aka principal engineer). His responsibility is to derive technical direction (directional, but not detailed plans), ensure code quality and readability — he defines "what has to be done directionally, in roughly what order, how to act on important concerns brought by engineers or steers by the user." The architect reviews the status of the project and defines/edits the directional plan once per iteration: the architect flow is launched once per iteration and may include review; for a saga, subarchitects with their reviews. The architect launch is a configurable flow; the flow depends on the reason for launch (initial, concerns, iteration done, steer, etc.). The flow may hold separate agents — designer, security architect, functional safety, etc. That includes code review (the same context is leveraged). The architect owns the "directional plan that defines WHAT has to be done (subject to yet unknowns) to bring the project to the desired state (as per INTENT) without adding technical debt or quality issues." Architect involvement is subject to a configurable "architect flow" — context preparation, deciding which flow to use if many apply, the architect itself, subarchitects, review, etc.
   - Once the architect has defined the "plan", whether the plan is complete or extra work needs to be done more or less in scope of the architect's technical decisions is owned by the *plan completeness checker*. He also makes simple technical decisions to address concerns — emitting extra tasks (see Concerns funnel).
   - Our key agentic orchestration player is the "PM". His job is to convert the plan to specific tasks in a DAG. He repairs artifacts/figures out status when KERNEL cannot, and triages steers.
   - **steward** is invoked when merges to the goal branch create conflicts, CI/CD failures, etc. The goal branch is the current branch of the repo; tasks merge into it directly, no extra worktree for it. If it is the default (main, master), the ingestion pipeline creates one automatically. Launch is refused on a dirty tree; during a run the user does not edit that checkout — the factory owns it until the run stops. Self-build adds protection on top: the factory runs from the pinned build in a separate worktree, and the operator promotes to main (see bootstrap).
   - **infra** agent is part of the ingestion flow. It outputs what commands the kernel needs to run in scope of the goal (fast/slow tests, worktree preparation, compile, lint, etc.) — discovered from the repo or taken from config — and their status (yellow/red, specific failures, flakiness). If required, it wraps commands so the kernel can execute them.
   - **task flows** — a number of tasks arranged in DAGs.
   - **ingestion flow** at goal start: create goal branch (when the repo is on main/master), front agent triage (trivial / task / bigger), infra agent (commands + status), context pack, scouts map existing code (bigger only), extra steps as configured (e.g. a separate agent to retrieve requirements).
### Scalability
Factory auto-scales and is capable of handling
   - trivial — entire task handled by one cheap model launch
   - "task" — a configured flow (may be one of several configured) including implementer, reviewer, etc.
   - "epic" — multiple interdependent tasks, each handled in a separate branch, with review, etc.
   - "saga" — complex project where high-level goals are associated with software layers; split into a hierarchy, and orchestration agents (architects, PMs, plan completeness checkers) are instantiated per underlying epic. For now we have 2 limitations in case of a saga:
       - only one level down
       - all tasks merge to the goal branch (single steward), no per-epic branch
#### Scope Escalation ladder (triage)
- One cheap-but-capable agent classifies the goal: trivial / task / bigger (epic, saga). It is not smart enough to decide how big "bigger" is — that is the architect's call.
- Trivial: the same agent implements, in the same session (reusing the context it already built): after receiving the classification, the kernel sends a follow-up prompt with the location/branch. No loop.
- Standalone task: does not reach the architect. If multiple types of tasks are supported and the triage agent classified the intent as a task, a follow-up prompt is sent to produce a YAML file with the task type. Then normal mechanical orchestration is followed for the given task type. To the last agent in the chain — the one that produces the merge decision/concerns — extra is added to the prompt/schema, including the same task scope definition that triage/architect/PM/architect reviewer etc. has, and asks whether delivery is in scope. If not, the "bigger-based" flow is launched.

- Task or bigger: the same agent prepares the context pack — current status, relevant code facts; commands and their status come from the infra agent (ingestion flow). No separate triage/context-pack steps: same context, same agent.
#### Scope escalation (architect)
  - part of the architect prompt is the option to define epics, write high-level intent and define the scope of each responsible architect. In this case, the "top" architect is responsible for the intent as a whole and may have individual tasks/spikes (not preferable). The top architect may add subarchitects at any iteration, and defines intent at any iteration (if any for a subarchitect).
     - Those intents also form a DAG.
     - Subarchitects are launched with their intents to plan.
     - KERNEL orchestrates, launching a PM per top/sub architect, task flows, plan completeness checkers for sub-intents applicable to the iteration, steward when needed.
     - Steering is propagated from the top PM to sub PMs (and sideways to their architects).
     - Plan completeness checkers are executed bottom-to-top.
     - Once the pre-architect orchestration flow is exhausted, architects run in two passes: bottom-to-top identifies what has been done and what the gaps, follow-ups and debt are; top-to-bottom defines what to do. The first iteration has only top-to-bottom, the last one (done) only bottom-to-top, the iterations in the middle both.
    - At each iteration, the top architect decides which subarchitects need to be involved.

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
    waves --> steward["tasks merge one at a time as they pass; end of wave: steward only on conflicts or red goal branch"]
    steward --> left{"dispatchable work left?"}
    left -- yes --> waves
    left -- no --> parks["PM decides parks and blocking concerns"]
    parks --> checker{"plan checker"}
    checker -- "progress: extra tasks" --> waves
    checker -- "architect: next iteration" --> arch
    arch -- "goal done / blocked on user" --> stop(["stop"])
```
   - stop: goal done | blocked on user | launch bound hit — architect iterations, plan checker rounds, time or budget (drain: no new dispatch, in-flight work finishes) | infra, unless launched to wait and retry
   - During dispatch, started tasks/epics are prioritized to completion before others start, notwithstanding parallel execution when the DAG allows: the rest start from the already integrated branch, avoiding unnecessary conflicts and too many trees.

#### Concerns funnel

- Concerns include discovered technical debt, issues with the plan, pre-existing test failures, issues with implementation and pre-existing code
- Funnel order:
    - inside a task, as per the configurable task flow: the reviewer adds concerns that go to the implementer; the reviewer checks concerns raised by previous agents and can gate them as immaterial;
    - PM decides if any concern blocks the rest (makes the remaining work wasteful);
    - plan checker makes simple technical decisions to address concerns (emits extra tasks);
    - once exhausted, concerns not filtered out, with their resolutions, go to the architect.
- implementer → reviewer → PM / plan checker → architect → [top architect] → human. Each stage filters.
- Each stage sees a different scope: the implementer sees one task, the reviewer its diff against the task, the architect the epic's interactions, layers and sequence. That perspective gap is the point — it holds even between same-class models (or humans), which is why the task flow uses separate steps rather than one agent doing everything. Sample and investigate whether it works as intended.
- Implementers tend to over-report trivia; the reviewer decides what is different/additive to the plan and worth architecture attention. Even a same-model reviewer with a different focus adds a lot.
- In our default config, task reviewer is still task level agent.
- The reviewer's context differs from developer/QA: tailored to the focus of the review, not the implementation context — not the implementer's edits, not its reasoning about what to edit. Its prompt is mostly the author's prompt, included whole through the templating engine so the common part is the same text — the same assignment, bounds and standard — plus the review focus and verdict. This holds for every reviewer, the plan reviewer included.
- Concerns (technical debt, risks, uncertainties, design choices) and remarkables propagate up the chain; calibration lives in config prompts: FYI-only / blocked-by-architect / blocked-by-user. Not spam. The remarkable at each level always includes "what is achieved" and "what is of concern".
- Files stay on disk; the architect can scout/read instead of receiving pasted content.

##### Schemas known to kernel

- Agent outputs the kernel reads and validates: task file (`tasks/*.md` front matter), step outcome (`outcome.yaml`; QA has its own outcome schema), steer hold (`mailbox/holds/*.yaml`), triage class (`class.yaml`).
- The plan is markdown, no schema.

#### Configurable part
- Each task type gets a configurable orchestration flow (e.g. researchers -> PoC agents; test/interface developer -> developer -> review; developer -> compute-use QA -> automated-test QA -> review); each task kind is described as "when to use" and auto-inserted into the architect's and other relevant (PM, Plan Checker) prompts.
- architect flows (depending on project state: ingestion, return after uncertainty resolution, declared done by plan checker, concerns to resolve); extra steps per project — e.g. previous-run assessment (self-build), integration test as a user, visual review, design review
- what harnesses/models (aliases) to use for each element in the flow (support aliases in config)
- CI/CD (or discovered by infra)
- generic coding rules or project-specific ones
- prompt options for all agents
- harnesses are already configured (skills, agents, lsps - etc) for production project (config for orchestration files is propagated by Kernel): factory uses the repo's harness setup as is; kernel only adds what orchestration needs (JSON Schemas + LSP mapping for artifact files, transient agents like subarchitects) and never overwrites the repo's setup.
- what harnesses to use, what arguments

##### Config-driven KERNEL
- Three config layers, separated by concern: each concern lives in exactly one layer, and no layer restates another's.
    - Repo config: locations, paths, gates — the repo's CI/CD, defined as commands; whether a red gate was already broken before the task may be judged agentically (by the reviewer).
    - Factory (process) config: bounded flows as DAGs (the architecture flow with its plan review included), task types, agents and prompts, which kernel schema each output follows, calibration, and model alternation — all expressed with aliases, never with models. It names the aliases it requires.
    - Local config (the run config): the one config that defines the available harnesses and models (or harness-level aliases), fallbacks with their own effort, and their mapping to aliases, plus extra opaque acpx-compatible options passed through to the harness untouched. Some aliases are mandatory for the kernel (e.g. architect); others are required by the factory config. For special harnesses such as omp it is rendered into a transient run config. It also holds what is specific to the machine and its subscriptions: concurrency per subscription, session and worktree paths with retention, and the price cache; launch limits (architect iterations, plan checker rounds, time, budget) and stop-or-retry on infra are launch arguments with defaults here. Binary resolution is config-only: rely on acpx unless a custom adapter is the default; binaries are expected on PATH already; config override possible.
- All 3 layers have a schema; KERNEL has a validate option to check the 3 not just for schema, but for consistency (short of model calls, but everything else).
- Not a single model is hardcoded anywhere in code — neither in the kernel nor in a harness adapter. Not a single harness is hardcoded unless it has a justified custom adapter. Models and acpx harnesses appear only in the local config.
- Harnesses, models and subscriptions evolve: nothing hardcodes a real name of a harness, model or subscription beyond a justified harness adapter (omp) — completely model agnostic. Tests use fake names only and do not check run configs.
- Flows are defined: e.g. "just implement", "implement/review", "TDD: ingest → record known problems → stubs → implement/QA/review/security review". Adding an agent to ingestion, a task-type flow, or the PM flow is a config edit; agent types and task flows can be added or commented out. More spike/agent types are configurable — e.g. for a dashboard: computer-use tests, design/usability review. Templating serves the architect flow too. The script surface is the kernel's fixed set of schemas: agent produces, script reads. A new schema is a kernel change, not a config edit.
- Each task flow has a short description as part of config ("use when") — injected into the prompt of agents that define tasks.
- Prompts are assembled from shared fragments and single-definition templates — never copy-pasted. Use a well-established templating engine, not DIY: LiquidJS (strict TypeScript, `{{ var | filter }}`, CLI `npx liquidjs`, custom filters, async tags), Eta (TypeScript-native, ~3.5 KB, partials, plugins) or Nunjucks (Jinja2-like macros, block inheritance). Single definition extends to what prompts say about the kernel and config: output shapes, task-file fields, and flow and alias names are rendered from the kernel schemas and the factory config, never retyped in prompt text.
- Prompt templating is documented and examples are provided; ability to dry-run and see all prompts.
- Prompt templating might be conditional on harness/agents.
- Part of repo/CI-CD runs a simple anti-duplicate check (find reusable TypeScript lib/utility) to prevent duplicates. Deterministic checks prove no fragment or prompt is dead. Prefer existing tools.

- Review retries configurable, with follow-up options: same agent on compacted context, different model, or de novo.
- Task review: max three review retries by default, configurable — the reviewer may request changes on the first two, and the third is the last call. Change-request bounds are per agent, in config: for each agent in a config-defined agentic flow that can request changes, the maximum number of change requests is part of the config (for the reviewer it is 2). On the last call the agent receives a different prompt — ship with concerns recorded (net positive) or park.
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

### Extra
  - Measure work and usage where feasible and not burdensome: per-model token use (assume the prefix is cached when not reported separately), number of turns, and work done — edits, test runs, etc. Be realistic about what can be counted: ACP harnesses do not report cost or tokens (ACP `usage_update`/`usage` may be extractable), and OpenCode Go does not report subscription costs. Exact cost accounting is not a goal beyond analysis during the self-improvement build, to make sure nothing is wasted; subscription subsidies, street pricing and local hosting alter the cost structure anyway. Where a price is needed, it comes from the harness or from OpenRouter, with a local cache; nothing is hardcoded. Reported cost misleads: the Claude subscription reports about list price while its real subsidy is ~30x, agy's is ~300x, and OpenCode Go sometimes reports 0, so a reported cost ratio is not a good indicator.
- Wasted turns: a turn whose change is implemented and then rebutted after review/QA is NOT wasted — that is the accepted tax for quality, compactness and readability, and fully rebutted reviews are accounted separately. A turn IS wasted when the implementer completely fails (tokens spent, nothing lands), the agent does the job but the structure fails it (protocol, containment, outcome channel), or flaky tests cause an incorrect rejection. Wasted turns are investigated by spikes and their root causes addressed.
- KERNEL is fallback-aware (if a particular subscription or model provider is down) -> fallback; resume prompts to fallback agents: the fallback agent is launched in the same worktree with a minimal extra prompt (keep implementing, assess status first).
- Escalation to an expensive implementer-tier model (Sonnet/Terra class) only when a task goes wrong or needs a highly non-trivial class/PoC; the architect calls it, in advance or on review. Minimize its use. Escalation is an alias mapped to a stronger model in the local config, not a separate tier.


### Task flow
- The exemplary flow, and the default in config for code-touching development:
    - Developer: must deliver the task plus a working test.
    - QA: accepts the work agentically — the spec is fulfilled and the work is tested well. QA is the test owner: adds, reorganizes and optimizes tests. It judges whether the implementation is correct from the interface/plan/grey-box testing perspective. Where a deterministic gate run exists, QA receives its result and log; it verifies no regressions, adds automated tests and smoke tests where logical coverage requires them, as applicable within the task's scope, and validates interfaces vs the plan. QA may make minimum changes to enable testability; for substance it requests changes, and the implementer may push back. Prompt only, no kernel enforcement. Changing tests and scripts is normal during development; that is why QA is a separate agent.
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
- Steward (merge agent): the script merges each task as soon as it passes, one at a time; at wave end the steward is involved only when a merge conflicted or the goal branch is red; unmerged tasks are then relaunched to port onto the new state (see Iteration).
- Plan checker: a specialized agent that checks whether the current plan (architect output) can still be progressed with net positive gain before the architect is involved — a task-level gatekeeper for the architect. It can formulate follow-up tasks, and is instructed to stay within the overall technical direction of the tasks.
- Triage: see Escalation ladder.



### Iteration
- An iteration is one architect plan and its implementation: the architect plans; the script orchestrates all tasks until they are exhausted or blocked. Each architect consult starts a new iteration. A trivial or standalone-task goal has no architect: its iteration is the front's classification and the task's implementation.
- Two loops: the architect iteration, and inside it the plan checker loop — the checker sends extra tasks back to execution, up to a configured N rounds. A launch is bounded by either loop, by time or by budget; launch arguments say how much to iterate. A launch may stop earlier: infra, a blocking user escalation, etc.; launch arguments can say not to stop on infra but wait and retry.
- The architect plans the road to completion, not one iteration's slice: as much work as makes sense given the uncertainties. Where a detail cannot be settled yet he says so explicitly — deferring a feature until a named spike or foundational task lands — and plans the unblocked work in parallel.
- Every consult starts by evaluating the project against the intent — completeness, quality, correctness of the implementation so far — not merely the previous iteration's work. Is the work truly blocked or does it make sense to continue; what is incomplete or must be redone. In a saga, the architect defers to subarchitects for details in their domains; sub-epics get their own completeness check. Two in one: the same context serves evaluation and planning.
- Before any iteration finishes, a plan checker verifies the plan's status against the repo, with bounded repeats — it may name things to do before the architect is involved; its findings go back to execution, and the iteration keeps progressing, before the architect is consulted (see v1, removed in `3457b0c` and readable in git history: `plugins/software-builder/agents/plan-completeness-checker.md`, loop in `plugins/software-builder/skills/software-builder-asset/goal_flow.py`).
- A launch after an interrupt (mid-iteration stop, quota, computer reboot) is a script relaunch: no architect, so no architect flow (no previous-run assessment, see bootstrap); operator steers reach the PM as usual. If the resumed state is problematic, the script repairs it with an agentic PM turn and/or the plan checker, with a budget for extra retry.
- Relaunch/restart is idempotent by the script: no agentic work moves files around between restarts. Agents stopped mid-flight are relaunched by the script in their worktree with an extra prompt: "you were working on the task below, we had an unrelated technical problem, finish the task". The PM repairs artifacts the script cannot read (e.g. broken YAML).
- Scope: the architect predicts a reasonable scope per task — a prediction, not a fence. He does not name files or LOC — a waste of tokens. Within a wave, tasks have no logical dependencies and can reasonably run in parallel without likely substantial conflicts: it is fine if they add to the same file (the steward sorts it out), but logical overlaps are undesirable. Between waves, tasks may depend on each other logically. Nothing enforces which files a task touches. Normal development.
- The steward leaves the wave clean: merge, resolve conflicts, run CI/CD, fix the obvious, record concerns for the non-obvious, decide what to hold. DoD: branch state ready for the next wave; task status revised if unmerged. Tasks that did not merge are relaunched to port on top of the new branch state. Conflicts are normal during development, sometimes logical (test failures). The steward is compacted at the end and relaunched as needed. Merge ladder: the task-tier steward resolves trivial conflicts → unresolvable goes to the architect with a pointer to the overall status plus the worktree and branch of the problematic item.
- Why: too-tight scopes, no end-of-wave merging with repeat, and no plan status check before the architect cause rework and conflicts.
- The kernel ensures every agent delivers. An agent that ends its turn without delivering is asked again, up to the configured number of reminders (default 1) — e.g. the architect: "You need to deliver. Specify actions, including spikes if needed to plan more, in the plan; or declare the goal done (if config allows it) or blocked, naming what must happen first." The ask is a prompt template from config; its exact shape depends on the agent.

### Context economy
- Same context: same agent. Different context: different agent.
- Reuse stored agent sessions within one harness. Across harnesses portability is directional and not always feasible: a graph records which way a session can move. Portable → continue from the compacted session. Not portable → de novo, with the context pack and links to artifacts. Any session that cannot be resumed → logged as error, started de novo.
- Compact at the end of a session; reload the compacted session for the same agent's next turn: the next consult, the next review round, or the next iteration. Compaction is both cost saving (fewer tokens on restart) and context management (drops previous reasoning on a fix-up launch of a task or on the architect's next iteration). Compaction is transcript trimming — even server-side — not a handoff summary; the two serve different reuses and must not be confused. No tree/branch summaries.
    - Compaction kills two birds with one stone: a cold retry does not pay for the entire transcript, and the context is adjusted so concerns/suggestions get decent consideration. Reusing the compacted session also saves rebuilding the entire context from scratch; on reuse the agent rereads what it needs.
- Warm starts: when pending tasks touch roughly similar code areas (the PM's call; on a small project most areas are similar), build a pre-warmed starter per area — familiarize with the code, test structure and flows, then compact — and reuse it as the starter for many turns. Rollout is gated: a spike first researches (web search included) whether warm starters make sense, and cancels them if not; then the build runs warm vs cold starters at random and the measured verdict decides.
- Plans are the architect's markdown, edited in place — never in flight; the architect owns them. A cheap PM turns the plan into task files: it identifies task files, owns the DAG and the dispatch sets, and resolves whatever cannot be derived deterministically (missing branches, misplaced artifacts). The PM is a paper-pusher, not a peer: it converts the architect's bullet-point vision into actual tasks, interpreting intent into more formal shape — splitting and merging tasks as the formalization requires. There is no PM/architect disagreement to resolve; the architect's intent governs. Tasks are named by short immutable slugs. Never force whole-plan re-issue through a strict schema. Diffing serves only to inform the (compacted) PM of plan changes on subsequent iterations.
- Status is aggregated by the script from structured outputs / YAML artifacts, idempotently; the context pack is prepared from it, then agentic preparation.
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
- The PM is not launched before the first architect flow concludes with a plan. A steer dropped before launch goes to the first architect turn, who takes it into the whole plan; he does not plan around a single task. A steer that arrives during the architect flow is held until the PM is launched with the ready plan. Before the architect turn of iteration 2+ the PM handles steers as usual.
- The architect is involved when a steer needs an architecture decision. A steer that amends the intent is carried into the intent first (see Intent-change steer); the PM decides to what extent it precludes pending tasks from completing and marks those tasks blocked or mooted by the steer, which may end the iteration early. The architect sees the change at the next iteration. An urgent steer is the exception: it ends the iteration early — dispatch stops, running tasks finish (drain) — and the consult that follows opens the next iteration.
- A steer may stall the run when, given the steer, no pending task still has value, or when the user asks for a priority that is not planned: tasks drain, then the architect is involved.
- Every steer ends processed, with the response in the outbox. All these steer scenarios are built and tested during self-improvement.
- Intent-change steer: when a steer clearly adds or modifies intent, the goal's intent is updated — preferably by a dedicated cheap agent — preserving user instructions. The intent stays consolidated: the latest input wins and superseded text is removed. No interpretation, just carry over the edits. At the next iteration the architect sees what changed from the diff and the steer record.

### Status reporting and dashboard
- The user sees status — intent-wise what works / is not yet built / has friction, plus mechanical/technical concerns. Easily accessible, understandable, clickable.
- A high-quality HTML dashboard (use reputable JS/CSS frameworks to minimize organic code) efficiently presents mechanical status, costs, and intent completion. Either html/json files updated by the kernel at least after each agent launch or finish, or an HTTP server on localhost that supports parallel builds (e.g. different ports). As much "use", not build, as possible. Library files are vendored next to the dashboard in the artifact folder and linked locally.

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
- Works through any ACP-compatible harness with opaque config passed at launch (command-line args, env, or config files depending on the harness). omp is a special case that simplifies things, not a dependency; extra tools exposable through ACP. Supported and tested: omp, OpenCode, codex, pi, Claude Code, agy (Antigravity CLI), Command Code (cmdc, ACP via acpx) — with harness rotation across launches so no harness-specific assumption survives untested. A new harness/model combination is first proven on a canary goal — a trivial goal and a standalone task; for an architect leg, a small "bigger" goal — and joins the main goal's rotation only after it passes; rotation is among proven combinations. For tests there is also a fake acpx harness profile, test only.
- The build is harness agnostic. Which harness does which role best is discovered during bootstrapping and recorded in run configs (default/exemplary config), never in code. Starting hypotheses: pi is the task-flow implementer (minimal, great at the single task); omp and OpenCode fit spikes better off the shelf, where subagent expansion matters.
- Harness adapters: a custom adapter only when the harness offers substantially more than ACP exposes (omp is that case: RPC, yield, compaction, overlays). Otherwise drive the harness through acpx (OpenCode included), or at worst plain ACP — never a bespoke CLI wrapper for what the protocol already covers. No code: the config uses acpx naming (and opaque config), and that is it. Where acpx already supports a harness through a built-in adapter, an existing custom adapter needs a solid recorded justification — what improvements the bespoke adapter provides that acpx does not — or the harness moves to the generic acpx path.
- acpx is the enabler of agnosticism: an acpx-compatible harness is expected to be added by configuration alone, with no code change. A direct layer for such a harness is allowed later only on measured evidence that ACP loses something needed.

### Sandbox
  - The sandbox wrapper is factory config: global, override per flow, override per agent. A configured sandbox must be present on the machine. Configurations with and without sandbox are both tested by rotation.
  - bwrap is used during bootstrap; not built yet, needs to be introduced.
  - Harness-agnostic sandbox config is not trivial: each harness may need extra ro/rw folders configured separately. Sandbox config may be another plane, with repo/factory config naming folder aliases. Simple and elegant config: spike first (what people do), then PoC, slowly. If not trivial, all agents run in the same predefined sandbox.



### Delivery
- The factory is a plugin with a skill "run factory": where to put the intent, how to configure, what to launch, what to see, where the user sees the HTML; kernel and config are skill resources.
- The repo contains an extra plugin -> self improvements: the bootstrap-specific, reusable part (flows); machine-specific config (harnesses, subscriptions, folders, sandbox) only as an example.
- the repo has its own factory config - commented, as example (repo specific layer)
- Documentation 
  - minimum contributing.md
  - Pitch document (written as task by escalation model), including svg diagram showing key actors
- extra skill for self improvement runner


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
- The script calls the checker before every architect consult, also when nothing is parked, blocked or pending; the checker reads the recorded gate results instead of running the gates.

### Context pack and status
- The pack preparer decides what is included in full and what is a reference with a brief summary; Distance counts what is open.

### Gates
- A tree is judged once: a gate result is keyed by the tree it ran on, and the result and log go to the agents that follow.
- Gates shall be reasonably fast (nothing in the factory needs minutes) and shall use no API/model calls. Slow gates run only case by case.
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
- factory is quota aware, task associated with particular "provider/subscription" are as per config fallback to different providers, or postponed. If retry time can be deterministically extracted from harness - great, if not - the pool stays exhausted for the retry interval set per subscription in the local config (e.g. 6h), then one probe.
- Quota is a state of the subscription pool, not of an alias: once a pool answers "quota", every alias drawing on it treats it as exhausted until the configured retry. 
- Name the subscriptions in the run configs; keep the exhausted state per pool, across aliases and across launches, until the configured retry.

- many to many relationship between subscription and harness/models (include aliases) pairs

### Git hygiene
- Mechanical commit between agents (worktree), short hashes passed so the next agent reads diffs.
- Cleanliness: heuristic check for the unusual — large files, new file extensions, temp files/model weights/huge outputs — an extra check for an agent that forgot `.gitignore` while mechanical commits are allowed. On a hit the author gets a follow-up prompt: clean up, change `.gitignore`, or write an explicit `.yaml` with the file list (override). Not a constraint by script: no loop; the agent may clean up or override. Tasks have no file scope (no `task.scope`). Prefer OSS; where nothing exists, something simple. Prompt reminder to clean scaffolds; `.gitignore` is the hard floor.
- Idempotently clean up all worktrees created by KERNEL: at every launch and at goal end, remove worktrees of merged/cancelled tasks and finished spikes; parked/unmerged tasks keep their worktree.
- Give agents relevant hashes (e.g. architect needs to know the hash before the goal, the hash before the last iteration).
### Orchestration artifacts
- Storage is an interface. Backends: plain folder (gitignored under the repo, or outside it), separate GitHub repo, same-repo folder — all built and tested.
- Never commit sessions/logs or raw agent inputs/outputs.
- Code changes may sit on an unmerged branch; orchestration artifacts stored in the same repo are merged/cherry-picked ASAP. Artifacts stored separately need no cherry-pick.
- One artifact, one canonical location: the file structure never copies the same file over and over into multiple dirs.


### How factory is bootstrapped

#### CRITICAL — bootstrap
- The factory is built by running itself, launch by launch.
- Factory is run by "operator" bootstrapping harness using supplied skill, it assesses friction, switch config
- By Default, factory started with goal "Review intent file and make sure that everything specified in intent is build, tested, and documented." 
- Separate configured agent in the architect flow, before the top architect - assess previous run, including logs for friction and waste, prepare context pack. Extra to operator steers, which the PM handles. Self-build config only (see Configurable part for steps other projects add).
- Merge to main after each launch
- Depending on how much waste/friction it see, it can
   - emergency repair DIY
   - launch separate repair goal though factory
   - Just steer observed concerns and let factory to self heal
   - Always execute from a pinned last-good version, never from the tree being edited; promote after the no-model E2E suite ~passes.
- Landing and promotion are operator work until the owner says otherwise. Code after each launch lands on `main` of the agentic-swarm repo.
- The operator session gives requirements — which subset of the intent is the current phase — operates, recovers from major issues, and reports bugs and incidents as steers. It does not prescribe milestones or plans.
- During self-improvement the architect is concerned with both mechanical solidity and agentic behavior — e.g. how useful review feedback was — and may plan spikes that investigate previous sessions' behavior.

#### Tasks flow configured during self build
nogit - means that task  MIGHT specified to produce file outside of git
* - means escalation of implementer is supported
  - "fact finder" nogit-> delivers md, document behavior, research libraries, best practices, single agent
  - "PoC"* nogit - develop something without production intent (one of many options), implementer -> reviewer
  - Normal* : implementer (implement, automated test) -> QA (might request changes up to 2x): ensure no regressions in automated tests, simplify/reduce code size  tests, add tests for edge cases as needed, ensure interface separate and have right amount of doc -> reviewer (correctness, scope, plan adherence (or reasons to diverge)) 
  - ComputerUse: Same as above, but extra agent for browser tests 

#### Bootstrap subscription models/harness
 (config shall eventually be able to express it as fallbacks)

| Subscription | Only Use with Models | Supported harnesses | Roles | Notes |
|---|---|---|---|---|
| Claude code | Opus 5.5 xhigh/Sonnet 5.5 high | omp, claude code | Architect, Escalation implementer | |
| Open Code Go paid tier x 2 | opencode-go/deepseek-v4.1-flash :max, opencode-go/muse-spark-1.3-contributor :max (limited to xhigh in opencode harness) | omp (2 keys), Same 1 key: opencode, pi, codex | implementer, plan reviewer | |
| Open Code Go free tier (stays on even if open code go quota is over) | opencode-go/hy4-flash-free: xhigh | omp, open code, pi, codex | Ok implementer, simple tasks, context prep etc | |
| Open router free tier | openrouter/baidu/ernie-5.5-flash-preview:free | omp | ok implementer, simple tasks | |
| Antigravity | Gemini 3.8 flash | agy | workhorse | subscription run out quickly, but use when available |
| Open Code free tier | deepseek-v4.1-flash-free (most capable), mimo-v2.6-flash-free at max available efforts | opencode only | capable implementer models | use when available, runs out quick |
| Command code | meta/muse-ember, qwen/qwen3.8-flash at max available efforts | cmdc (ACP via acpx) | capable and different task level models | use subscription when available |

Fallbacks must be configured to fallback (except architect -> claude only) through all subscriptions whose roles fit the role — e.g. implementer: Go paid → agy → OpenCode free → Command Code → Go free hy4 → OpenRouter ernie; Claude is never in task-level chains, Sonnet is only the escalation alias — and rotated at each launch so all harnesses are tested.

- Implementers / task reviewers at the highest supported effort, set explicitly in the local config in each harness's syntax (muse takes `:max` on omp, `#xhigh` on OpenCode, the bare id on codex) and checked at pre-flight. There is no `highest` keyword.
- Several model configs, alternated across launches to test harness combinations; pi is one of the rotated harnesses.
- Model switches on retry are tested both inside one harness and across harnesses.
- omp supports auto rotation (OpenCode Go has 2 keys) and auto fallback (aliases can be used with config fallbacks); the other harnesses do not. That makes them perfect for testing kernel-level fallbacks, e.g. from pi as task implementer to agy.

## Glossary
- **Goal**: one intent, one directory; relaunching the same directory is "the same goal".
- **Launch**: one run of the script; bounded by architect iterations, plan checker rounds, time or budget; may stop earlier (infra, blocking user escalation).
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
