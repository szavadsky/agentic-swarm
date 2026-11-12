# Agentic software factory
This document has 2 sections: intent and notes on implementation.
Intent is authoritative and can be clarified or adjusted given feasibility. Notes on implementation are technical judgement and can be shifted during development based on real-life behavior.
This document follows from the rework of plugins/software-builder, as set forth in my previous docs/factory.v2.md, with implemented results in plugins/software-factory. Some previous instructions proved wrong; where they contradict this document, this document wins. Previous design rejected: restrictive, causes loops, produces too much noise, not token-economical. Some components and code can be reused.

## Intent

Modern harnesses can deliver a decent story (several hundred lines of code). Agentic software factory is an orchestration framework on top of harnesses that can deliver up to a saga (entire product) or major refactoring, in a token-efficient, slop-free, steerable or autonomous, and scalable way (from trivial edit to saga).

### Orchestration ideology

#### Escalation
- a cheap but capable model tasked to understand whether it is a simple/trivial change, a manageable task, or something bigger (it is not smart enough to decide how big)
- if trivial: asked to implement
- if task/bigger: asked to prepare context pack, document infra (applicable compile/lint/test), document current status

## Orchestration design [Q1]

### Model split
- Expensive models (Opus/Sol/Qwen4 max/etc.) are used only for Epic/Saga architecting: defining directional interfaces, deciding tradeoffs above and beyond task implementation decisions, giving direction on key algorithms, converting user intent into actionable plans. The same work a human architect does.
- Expensive implementer-level model (Sonnet/Terra) used if something goes wrong during implementation of a task, or a highly non-trivial class/PoC is needed. Architect calls to escalate (in advance or on review).
- Expensive models are currently 50-100x more costly than the capable implementer model [Q2]
  - called with prepared context pack
  - not required to write code beyond key interfaces
  - agentic and subagentic (scout/task)
  - not required to write verbose or complicated documents
  - my previous prompt, carefully optimized to simplify life, is at plugins/software-builder/agents/plan-goal-execution.md
    - suboptimal: agents tend not to rely on spikes (no option to create milestone "XYZ details after spike"). Also agents tend to discard scope.
    - not fully handling all use cases: e.g. no subepics
    - on subsequent launches, architect needs to review implementation for technical debts/gaps. Incentivize to stop (previously continued to infinity)
  - consult is always delayed until exhaustion of non-blocked tasks
  - this ensures expensive models are used efficiently and only when necessary

### Context optimization
- same context: same agent; different context: different agent
- leverage stored agentic sessions, at least within same harness (if not portable, through ACP)
- leverage compaction and tree, especially when hot cache is not supported/not practical
  - architect is consulted once in a blue moon: compact at end of initial session (if server-side compaction, need hot cache), then load and prompt for consult, review, or revision/next iteration
  - for consult, at least when omp is used, leverage tree command to summarize consult
  - implementation agent, if transcript is compatible (same harness, or possible to move through ACP): same compact, then review feedback
- plan edits: let architect edit file, then feed to PM (cheaper) schema-aware diff (reputable TypeScript library, self-agnostic) [Q2]

### Saga
- architect splits off a subarchitect if focused architecture-level context is required; architect handles all planning and review to that level. If a level is not touched in previous iteration and not needed for current, it is not invoked.
- saga split decision is on size of change, i.e. size/complexity of architecture context
- affected subarchitect always reports to top architect before involving him [Q4]
- if omp is used as architecture harness, subarchitects are subagents, accessible through IRC
- task-level consult goes to architect responsible for the relevant epic
- epic to architect may be many-to-one
- subarchitects filter consult/concerns to top one
- orchestrated up to task level by the same script

### Funnel of status and work done
- implementer -> verifier (filters more) -> architect -> [top architect] -> human
- only remarkable: implementers tend to be too focused on their task and list unremarkable things. Reviewer decides what is different/additive to the plan and worth architecture attention.
- files stay; architect can scout/read

### Uncertainty resolution
- architect can decide that a portion of current work hinges on a number of spikes, but some implementation work may already be unblocked. Orchestrate all.

### Clean code and architecture principles
- test real behavior
- risk, uncertainties, complexities first
- bottom-to-top implementation + vertical slices + iterative
- edge cases, security posture, failure propagation and containment, observability, performance considerations are part of architectural direction from day 1
- comments: why only, and only for non-trivial code; not what
- self-documented code is better than docs
- interfaces/public (hierarchy of what is public) separate from implementation, preferably in separate files. Interface docs readable to human and agents alike.

### Technical debt/concerns
- architect may authorize temporary technical debt, then removal at end of the same goal
- on subsequent iterations of the same goal, architect starts from either compacted or de novo

### ADRs, tradeoffs, remarkables, concerns
- ADR is a high bar. Previous implementation spammed ADRs. ADR is a long-term decision shaping project or entire layer; concise "decision enablement vs limitation", tradeoff vs alternative. ADR is not a routine decision, and not the outcome of a normal architect consult.
- concerns (technical debt, risks, uncertainties, design choices) and remarkables shall be propagated.
  - individual implementer agents/task reviewers focus on little details of the task
  - reviewer filters some of them, or at least prioritizes
  - architect (subsystem) consolidates what is most remarkable. Calibration is in prompt (config): "FYI only" or "blocked by architect"; architect may decide "blocked by user input". Not spam.

### Mailbox queue
- not designed for ACKs
- user adds files to steer; user sees remarkable notes (but not spam), e.g. iteration summary, concerns, open questions: at least one remarkable entity

### Config-driven orchestration flow
- need to specify model/harness and flow
- e.g. be able to add extra agent/schema into ingestion flow, specific task-type orchestration flow, PM flow. Script surface schema is fixed (agent must produce, script reads).
- commit between agents (to work tree); pass around short hashes so next agent can understand diffs
- e.g. normal task flow could be "just implement", "implement/review", or "TDD: ingest, record known problems, create stubs -> implement / QA / review / security review"
- review retries configurable, with option to follow up with previous agent (option over compacted context, different model / de novo agent)
- config has schema and pre-flight validation

### Harness agnosticism
- omp is special case, but shall work through any omp-compatible harness, with opaque config passed through command lines; can expose extra tools through ACP.

## Notes on implementation

### Known irritation points with current implementation
- too many schemas
- triage is deciding saga vs epic: just need option "bigger" so architect can decide
- ADRs are on tiny decisions
- plans are too much on lines of code
- no need to separate triage, context pack, infra: same context, same capability model

### Strict schema output
- good (as tool/yield) for relatively small output and simple schema
- architect schema developed is CRAZY complex: formal dependencies etc.
- large file better editable, with instructions how to validate; if harness supports, configure LSP, preferably in harness-agnostic way for orchestration
- the way architect was required to re-issue plan / do strict schema update defeats the purpose of letting him focus. Allow edits.

### Harness access layer
- https://github.com/openclaw/acpx
- omp RPC JSON is way more capable than ACP; special case (supports trees, subagents, IRC between subagents: architect/subarchitect case; supports compaction for subagents)

### Git hygiene
- prefer deterministic commits; however, prefer a library/OSS for that: agents tend to spam large files, previously unknown file types, non-git-ignored junk, etc.
- homegrown heuristic deterministic check is too much and unknown quality: instead, remind agent to clean up [Q6]

### Orchestration artifacts
- can be:
  - separate folder: local or GitHub repo
  - separate .gitignore folder: need to pass [Q3]
  - under GitHub local repo [Q3]
- if under GitHub: no sessions/logs, inputs/outputs [Q3]
- if under local repo: separate location. Code change is in the branch that may not be merged, but orchestration artifacts need to be merged/cherry-picked ASAP

### CRITICAL
- self-improvement: in implementing this plan, we need to launch one iteration at a time. Scout previous artifacts/transcripts (context pack for architect). Architect's input: transcript of previous version + new one to review. [Q5]
