based on plugins/software-builder, developm plugins/software-factory

1. Orchestration code shall be rewitten in typescrpt bun to js to run in eval kernels when applicable. No more "mechanical" orchestration prompts, that shall be done as omp extensions; with launching smol model completions when needed to repair
idemponent artefacts stored in yaml with schema, verified ageinst schema. restart at any time : continuing execution
2. /home/slava/aiexp/software-builder.dev/plugins/prompt-engineering/skills/prompt-debloat applied to all prompts
3.  (define in  pipeline config ) - model roles, fallbacks - propagated to launch specific config (may include aliases )
     - @workhorse: open code go deeepseek v4.1 flash
     - @alt-workhorse: open code go muse contributor 1.3
     - @task-reviewer: = @alt-workhorse
     - @wave-close-up : = @workhorse
     - @plan-close-up: = @alt-workhorse
     - @task-escalation: claude / sonnet 5.5 max
     - @simpler: antigravity gemini flash 3.8
     - @pm: = @alt-workhorse
     - @architect: claude opus 5.5 : max
     - @alt-architect: open code go muse contrbutor 1.3
4. Although omp is our primary target, overall orchestration (picking up tasks, artifact structure, etc) shall be harness agnostic, all core code shall be w/o direct omp SDK dependencies, abstracted launch agent (with agent definion files and exposed tools) and chat handle (for IRC chat channel to architect) - no need to overabstract (eg, will leverage omp isolation functionality), but keep non omp related mechnic separate allow friendlier  support  of another harness
5. A task {orchestrationFolder}/{taskSlug[/sugslugforepics]}/"INTENT.md" is given to the factory.
   - Pre-requisite: clear git workspace.
   - workstree must be in brnach topic/{taskSlug} , additional branches created topic/{taskSlug}/{subSlug} - for epics, and tasks (2 level for task within epics) 
   - All orchestration files are under {orchestrationFolder}/{taskSlug} , develop structure. 
   - Assigment files for agent (chain) must be commited before agent started
    
6. Agents implemeting development assignment (see below) each operate in their own branch and worktree; commited to branch even if work is rejected.  (yield error in omp harness does that, need propgagation though mechanical orchestration for "story" and "epic" level tasks)

Kinds of tasks, kind of feedback required, orchestration for each task , mechnical checks + prompts to judge significance of decision/need for feedback/approval 
8. Hierarchy, from bottom to top
   - `simple` - well defined, no architecture concern change, that is small enough not worhing a review. variable rename, file split, dependency uodate w/o change of prod code. No behavioral changes in prod code. materially same tests (beyond rename/repackaging). `simple` is half day worth of dev time in pre-ai time. 
   - `story` - an atomic, reviweable PR, typically < 300 lines of prod code/doc change; + tests. Eg: scaffold repo; scaffold interface and shim implementations/tests. If story includes behavior changes, prod code and tests are part of the story, not a separate task.  story corresponds to a subtask in v1 software builder flow . story may be dedicated to an single architecture change/scaffolding; but it is smaller then multiple architecture changes/layered design/multiple interfaces definition. Story is up to  few days of pre-ai time effort of mid/sr developer. story assumes iterative refinment based on reviwes
   = `spike` research task in epic 
   - `epic`  > single story. includes PM and Architect. < 100 person  days in pre AI time. Epic is defined by set of milestone (up ~ 8 ) and a number of `story`/`simple` (up to 30..50). `epic` may include significant uncertainties that need to be resolved before implementation. Architect defines technical direction (if blocked by uncertainties -> to known level) by defining milestones, directional interfaces and gherkin test scenarios; outline of stories. 
   - `saga`  : aggregation of epics + task
7. Development "story" kinds  , all shall be configurable (config yaml with agent flow and prompt to PM agent to identify task)
   - "dev" - mechanically orchestrated (commit to branch after each step) to "test fisrt", "develop", "QA - review vs test first (ok to have reasonable changes), red testing" , "review", possible security review (that why we have config), possible consistency review etc. event infra setup task or boostrap is dev with test first - define which comand shall to run
   - "no behavioral changes" -> "develop", "QA", review 
   - "test only" -> "develop", review 
  
8. `spike` fact-finding task (all configurable)
   - `fact-finder` document capabilities of libraries, best practices, 
   - `PoC` - develop in separate folder, "develop", "result review"  
   - `test-assumptions` - develop tests (that will stay) to understand how lower level works and give examples

-------
9. Ingestion flow -> given goal.md 
   - `triage` -> collect relevant context , and classify task as  `simple`, `task|spike` or larger. respond with json
        mechnical orchestration check json, if 
            `simple` -> same agent/same context implement 
         >= simple: produce verfiable relevant context file , similar to ai bot citaions: file, line ranges, 'anchor words', 'summary". 
         task|spike : run mechnanical orchestration based on task and context
         else -> run architect based flow as described below
10. architect based flow(s): 
   config based, emchanically orchestrated  
     - infra (once)
     - architect based plugins/software-builder/agents/plan-goal-execution.md 
         - irc id preserved for consult
         - prompt changed to 
            - specfically identify uncertainties, adressing them by series of spikes is required, and plan only milestones / task that is clear in view in uncertainties (and further mistones/goals as to be replanned after uncertainties)
            - if there untrivial assumprions what INTENT mean that could not resolved in searchable context, list them, why assumption was made
            - Allowed to define epics with intent described (if scope is too large and independent architect analysis is required)
            - noted technical debt not in scope of goal (adjacent, impacting, blocking)
               - for impacting/blocking, how to resolve
         - no more oracle , plan-review - separate agent, mechnically launched
         
    - applicable to all reviewers - reviewer produce json with suggestions and  based on mechanically configured (part of pipeline config to prompt) make a decision (option present ig agent schema/prompt applicable)
        - human feedback is required, pipeline is stopped (not even option by default, not in agent schema prompt )
        - human feedback is requred, pipline can contnue on non dependent tasks
        - human awareness, architrct ganetic deision is used meanwhile
        - architect agent must decide 


  11. plugins/software-builder/agents/orchestrate-goal-execution.md becames pm. create edits json, the rest is mechanical.
  12. plugins/software-builder/agents/subtask-dev-process.md disappers - mechnical
     overall mechnical process -> on confugurable number of retries architect is consukted
     problem with earlier implementation -now shall be ok as mechanical -  qa trusted dev report, dev report tried to cheat.
     task may include tradeof analysis, complex debugging ing etc - dev and review done by escalation model (rare) - flagged by architect. complexity != size . large size -> split    
 13.  steering mailbox
       - orchestrationFolder/{slug}/steer/ 
                                          tousertoreview/ - pipeline sopped, draft decisions, remarkable
                                          /fromuserpending/
                                          /fromusertaken/
      mechcanical orcehstation check pending, process with json model, add to next architect call, decide if it needs to be escalated quick
 14. During iteration or after spike architect is on stabdby (irc id preserved)
     subsequent iterations - relaunch like v1
 15. DEbloat, code quality, self deocmenting, debloat tests while preserving intent, never test linting, test ifra/assumptions first - see my phylosophy in /home/slava/aiexp/python-setup shall be in generic form part of default prompts
 16. config 
      pipeline config, criteria, orchestration steps. default bs override prompt templates, possible extra agents, extra skill folders 
project config: location of orcehstrationFolder, folderForPreservedADRs, scripts for compile/test/lint, extra skills folders
17. launch: a bun command, prepare/check prompts /env, launch harness, omp once per ietration (as need to preserve irc)
18. concerns + remarkable decisions funnel, human-involvement modes ("see something, say something"; partly in v1, missing in v2)
     - every agent output may carry structured `concerns[]`: {kind: tech-debt|assumption|blocker|risk|question, summary, detail, location?, severity: low|medium|high, affects?: item/epic/plan refs}
     - engine aggregates them in the task orchestration folder (`concerns/`, stable id by fingerprint, dedup across steps/attempts, status open|dismissed|routed|resolved, source step record)
     - the step's reviewer (workhorse class, except architect output which goes to plan-reviewer) triages new concerns with the same disposition vocabulary as review suggestions plus `dismiss` (not real: logged with reason, kept in the folder, no further action)
     - routing: blocker affecting a dependent item → dependent item blocked + architect consult; `architect` → next architect turn (wave report / next iteration plan input); `human-*` → steer mailbox per reviewPolicy; tech debt → plan tech-debt list
     - wave/plan close-ups list open concerns; close-up reviewers re-triage them; architect resolves or carries them; status/state.yaml shows counts
     - configurable like other dispositions (which agents may raise, which dispositions are allowed per reviewer, severity thresholds)
     - besides concerns, agents report remarkable decisions/tradeoffs (what was chosen, alternatives, why) in structured output; same aggregation/triage as concerns
     - funnel: worker agents → workhorse reviewer (confirm/dismiss, condense) → epic architect → [saga architect] → human; every level passes up less detail than it receives and never more text than the code it summarizes; each level may resolve, steer, or propagate up. In a saga, epic-level concerns/decisions propagate to the saga architect, which reviews them and steers epics or propagates to the human
     - ADRs are marked blocking or non-blocking; blocking = needs human decision per the active mode; remarkable = below the blocking threshold, reported (mailbox digest), never waits
     - human-involvement modes = config presets (pipeline config + prompt fragments for reviewer/architect criteria, shipped as default config examples):
       - `autonomous`: the human is consulted blocking only for the portion still blocked after everything unblocked is done; blocked items and remarkable findings (confirmed by the architect) appear in the mailbox as they are found
       - `principal`: blocking on stack/layer decisions, external interfaces and config shapes, roles of major classes, performance and edge-case handling, deviations and clean-code exceptions
       - `detailed`: additionally any change to external interfaces/configs (not only shapes), major internal interfaces, test-scenario level for major internal layers and classes
     - fire-tested in the same self-host launches (mode switched via config between launches) — the mailbox must show only funnelled, confirmed, low-noise items
19. workspaces, merging, lifecycle (prefer omp over DIY)
     - workspace isolation via omp's configurable isolation backend by default; the engine's own git worktree management stays only as a config option (`isolation: omp | engine`); a spike settles which omp mechanics (backend config, branch/commit retention on failure, cwd, merge-back) fit
     - preflight verifies: compatible omp version + config (overlay keys, isolation backend usable — a real throwaway isolation round-trip), every configured model/role resolvable, target git repo state (clean, branches/worktrees consistent with records), harness binaries
     - idempotent tracking of tasks, workspaces, branches and commits derived from records + git; launcher commands: `status` (whole tree: saga/epics/tasks/items, workspace + branch per active agent, open questions), `cleanup` (finished workspaces), `gc` (orphaned workspaces/branches/runtime files, stale locks; dry-run by default), all safe to run while nothing is running and refusing while a run holds the lock
     - commits: message and scope from agents' structured output (e.g. the last review before commit summarizes the change) or omp mechanics; engine never invents content
     - wave-end merge (default): conflict-free merge → deterministic CI command(s) (gates) → all green: merged; conflicts or red → workhorse-class wave-end merger agent resolves (v1 checker/committer role, trivial conflicts only) → unresolvable → architect escalation. The escalation carries a pointer to the overall status (one command/file) and the worktree + branch of the problematic item so the architect can inspect directly
     - saga: each epic runs as an independent factory launch in its own workspace (parallel epics possible); merges inside an epic escalate to the epic's architect; merging epics at the saga wave end escalates to the saga architect
     - docs show each use case (single task, story waves, epic, saga with parallel epics, conflict resolution and escalation paths, status/cleanup/gc) and how it is handled
     - "no models" tests: end-to-end tests through the real omp harness with a scripted mock model provider (no paid models), covering isolation, merges/conflicts/escalations, saga/epic launches, restart and gc
     - repo rules hydration: omp does not put AGENTS.md in subagent context, so the factory hydrates repo rules itself — architect and every implementer-chain agent (developer, qa, reviewer across items/epics) receive the repo's rules in their prompts (deterministic resolution from the target repo), verified by an end-to-end check that rules reached each role
20. architect context economy: cache coherence and compaction (part of the same self-host complex task as 19)
     - (a) compact the architect session before a resume that will miss the provider prompt cache (cache TTL expired / model switched), so an uncached resume does not re-pay the full history
     - (b) keep the prompt cache warm while the architect is on standby between turns (waves running), when cheaper than the expected uncached resume; leverage omp mechanics where available
     - decide defaults by measured cost (usage/cache-read tokens in records); each mechanism configurable, and explicitly off where it does not pay
     - v1 lesson: architect output was intentionally schema-free and telegraphic; extracting the relevant per-item task and context from that markdown was the (cheap) PM's job. Re-evaluate v2's schema-bound architect plan output against this (an expensive repair turn was observed in the fire test) — e.g. architect writes telegraphic md, PM structures it into the plan/edits schemas
     - (c) session launching must never break the provider prompt cache: normal additive sessions only, never rewrite a session transcript; the harness is audited so resumed turns append (no history reconstruction), prompt prefixes stay byte-stable across turns (no timestamps/random/temp-path interpolation into the cached prefix), and the generated omp overlay is byte-stable given the same config
     - (d) optional optimizations only after (c) holds: focused compaction/handoff summaries on resume, on IRC escalation reply, and on restart — each measured against the uncached-resume cost and configurable/off by default where it does not pay
21. tool policy: profiles, thinking-loop prevention (self-host, after 19/20)
     - per-agent/per-step tool sets configurable in pipeline config (`agents.<name>.tools` overrides the agent definition; presets for research vs read-only vs none); defaults measured, not guessed
     - observed failure modes: with bash, agents use it for everything; read-only tools + bash sometimes send agents into thinking loops. The harness gets tool-use loop detection (repeated tool patterns, turn budgets tied to tool use) and prompt guidance; a thinking loop consults/escalates instead of burning silently
     - PM stays tool-less by construction (yield only); repo-rules hydration (19) and status hydration keep tool-less roles effective
     - progress-based extension (complement of loop detection): near the turn timeout, a cheap judge model inspects the last ~10 min of the turn (tool calls, edits, test runs); meaningful progress (not a loop) grants up to 2x extension, once; a loop lets the timeout fire and escalates per the loop path. Measured and configurable like the other mechanisms

Fire testing:
     develop initial version. launch ietration by iteration; babysit
       for /home/slava/aiexp/python-setup 
           GOAL
              - modernize, preserve all material checks, enforce coding rules
              - deblot
              - remove extra tests
              - replace embedding/rerank based justification/commment check with a cpu frendly hev style model eg https://huggingface.co/fastino/GLiDE-0.4B or even smaller https://huggingface.co/spaces/multimodalart/jev-decision-index , keep git stored cache with cleanup
      after each iteration susbagnt analyze execution traces, see issues in  factory build
        then launch harness imrpovement (scope might be from task to saga, observe behavior)

DoD. build and minimum documented factoy harness, ready to use, default config with commentary how to change in template. config schema

Steering log (user decisions recorded by the orchestrator during the build; newest last):
     - fire test: user acts as steering user for human gates; push both repos; ≤5 launches per target (python-setup, concerns-funnel, omp-workspaces, tool-policy); env/operator-killed launches don't count; no launch deadline
     - model splits: developer/reviewer are workhorse class (reviewer = alt-workhorse); alt-on-retry rotation; muse as architect for the initial launches (cheap)
     - triage: `simple` = docs/rename/trivial split/really trivial additive change; story if >10-20 lines, new class, collaborating functions, or any tradeoff/decision; simpleMaxProdLines 20 enforced by simple-guard
     - self-host: orchestrator merges results to main after review; complex goals split into epics by the architect; each self-host task expected to finish in a couple of iterations; concerns-funnel launches switch human-involvement mode via config
     - saga: epic-level concerns/decisions propagate to the saga architect, which steers epics or propagates to the human
     - trace analysis: dedicated subagents per launch, down to omp session JSONL; audit agent use, separation of concerns, guardrail execution, cost
     - operability: timeouts exclude machine sleep (monotonic clocks); /tmp cleaned; disk-space preflight + per-step guard
     - PM is non-technical by construction: no file tools (yield only), minimal delta-only output, outlineRef must name an architect-provided outline, context = injected plan + task status only; architect gets tools + injected task status + status-file paths
     - agent tools: per-agent tool sets configurable (`agents.<name>.tools`); tool profiles and loop prevention are spec item 21 (self-host)
     - sessions: additive-only, never rewrite transcripts; prompt prefixes and overlay byte-stable (spec 20c); repo rules hydrated by the factory (spec 19)
     - sizes are advisory, never hard gates: no limit on architect output size or code/prod size (over-budget warns, consults never on size alone; scope is the architect's judgment, compact tasks are its job)
     - simple-guard's mechanical rules (rename-only tests, dep-file bans) removed as nonsense — simple path guarded by gates + advisory size with conversion routing only
     - agent turn budgets: poc/architect 2h, tdd/dev/qa 90m, fact-finder/review 1h, quick scoping/summary agents 45m (active monotonic time, sleep excluded)
     - timeout floor 45m for every agent (harness backstop included); progress-based extension up to 2x on judged meaningful progress is spec item 21 scope (self-host tool-policy task)
     - hoop removal: per-step/per-item budget raised to fit long turns (8→25/40 USD); hydration 40→128KB (architect keeps its own plan); timeout-nudge/resume budget defaults to half the step timeout instead of pinned 5m; verified no work-loss paths (HEAD guard soft-resets, rejects keep worktree, citations drop-with-journal)
     - no hard caps on injected context: hydration/context-pack byte caps removed entirely (the old tail-truncation silently dropped the architect's own prior plans first); architect reads full files with normal tools + injected task status; runaway protection is budgets + turn limits only

                                                   


