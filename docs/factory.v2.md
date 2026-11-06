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
   - `story` - an atomic, reviweable PR, typically < 300 lines of prod code/doc change; + tests. Eg: scaffold repo; scaffold interface and shim implementations/tests. If story includes behavior changes, prod code and tests are part of the story, not a separate task.  story corresponds to a subtask in v1 software builder flow . story may be dedicated to an single architecture change/scaffolding; but it is smaller then multiple architecture changes/layered design/multiple interfaces definition. Story is up to  few days of pre-ai time effort of mid/sr developer. story assumes iterative refinment based on reviwes
   = `spike` research task in epic 
   - `epic`  > single story. includes PM and Architect. < 100 person  days in pre AI time. Epic is defined by set of milestone (up ~ 8 ) and a number of `story`/`simple` (up to 30..50). `epic` may include significant uncertainties that need to be resolved before implementation. Architect defines technical direction (if blocked by uncertainties -> to known level) by defining milestones, directional interfaces and gherkin test scenarios; outline of stories. 
   - `saga`  : aggregation of epics + task
7. Development "story" kinds  , all shall be configurable (config yaml with agent flow and prompt to PM agent to identify task)
   - "mainstream dev" - mechanically orchestrated (commit to branch after each step) to "test fisrt", "develop", "QA - review vs test first (ok to have reasonable changes), red testing" , "review", possible security review (that why we have config), possible consistency review etc
   - "no behavioral changes" -> "develop", "QA", review 
   - "test only" -> "develop", review 
  
8. `spike` fact-finding task (all configurable)
   - `fact-finder` document capabilities of libraries, best practices, etc 
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
         
    - applicable to all reviewers - reviewer produce json with suggestions and  based on mechanically configured (part of pipeline config to prompt) make a decision 
        - human feedback is required, pipeline is 

