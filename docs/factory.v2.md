based on plugins/software-builder, developm plugins/software-factory

1. Orchestration code shall be rewitten in typsecript/tsc to js to run in eval kernels when applicable. No more "mechanical" orchestration prompts, that shall be done as omp extensions; with launching smol model completions when needed to repair
idemponent artefacts stored in yaml with schema, verified ageinst schema. restart at any time : continuing execution
2. /home/slava/aiexp/software-builder.dev/plugins/prompt-engineering/skills/prompt-debloat applied to all prompts
3. pre-requisite (define in ~/.omp/agent/config.yml) - model aliases
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
5. A task {orchestrationFolder}/{taskSlug}/"INTENT.md" is given to the factory.
   - Pre-requisite: clear git workspace.
   - workstree must be in brnach topic/{taskSlug} , additional branches created topic/{taskSlug}/{subSlug} - for epics, and tasks (2 level for task within epics) 
   - All orchestration files are under {orchestrationFolder}/{taskSlug} , develop structure. 
   - Assigment files for agent (chain) must be commited before agent started
    
6. Agents implemeting development assignment (see below) each operate in their own branch and worktree; commited to branch even if work is rejected.  (yield error in omp harness does that, need propgagation though mechanical orchestration for "story" and "epic" level tasks)

Kinds of tasks, kind of feedback required, orchestration for each task , mechnical checks + prompts to judge significance of decision/need for feedback/approval 
8. Hierarchy, from bottom to top
   - `simple` - well defined, no architecture concern change, that is small enough not worhing a review. variable rename, file split, dependency uodate w/o change of prod code. No behavioral changes in prod code. materially same tests (beyond rename/repackaging). `simple` is half day worth of dev time in pre-ai time. 
   - `story` - an atomic, reviweable PR, typically < 300 lines of prod code/doc change; + tests. Eg: scaffold repo; scaffold interface and shim implementations/tests. If story includes behavior changes, prod code and tests are part of the story, not a separate task.  story corresponds to a subtask in v1 software builder flow . story may be dedicated to an single architecture change/scaffolding; but it is smaller then multiple architecture changes/layered design/multiple interfaces definition. Story is up to  few days of pre-ai time effort of mid/sr developer. story assumes iterative refinment based on reviwes,
   - `epic`  > single story. includes PM and Architect. < 100 person  days in pre AI time. Epic is defined by set of milestone (up ~ 8 ) and a number of `story`/`simple` (up to 30..50). `epic` may include significant uncertainties that need to be resolved before implementation. Architect defines technical direction (if blocked by uncertainties -> to known level) by defining milestones, directional interfaces and gherkin test scenarios; outline of stories. 
   - `saga`  : aggregation of epics
7. Development "task" kinds  
