# Agentic software factory — manifesto

Two sections. **Intent** is authoritative: the WHAT and its invariants; it changes only by my decision (clarified for feasibility). **Notes on implementation** are technical judgement: the important HOW, shiftable during development based on real behavior.

Supersedes `docs/factory.v2.md` and the design of `plugins/software-builder` wherever they contradict this document. The previous design is rejected: restrictive, loop-prone, noisy, not token-economical. Components and code are reusable (`plugins/software-factory`).

## Intent

Modern harnesses deliver a decent story (several hundred lines of code). The agentic software factory is an orchestration framework on top of harnesses that delivers up to a saga (entire product) or a major refactoring — token-efficient, slop-free, steerable or autonomous, scalable from a trivial edit to a saga. One goal may span many epics and tens of tasks per iteration, across multiple resumable iterations; no hard-coded size ceiling.

### Escalation ladder
- One cheap-but-capable agent classifies the goal: trivial / task / bigger. It is not smart enough to decide how big "bigger" is — that is the architect's call.
- Trivial: the same agent implements.
- Task or bigger: the same agent prepares the context pack — current status, infra (applicable compile/lint/test), relevant code facts. No separate triage/context-pack/infra steps: same context, same agent.

### Model economics
- Architect-tier (expensive) models do only what a human architect does: convert intent into actionable plans, directional interfaces, key-algorithm direction, tradeoffs above task level. Called with a prepared context pack; agentic and subagentic (scout/task); write no code beyond key interfaces and no verbose documents.
- Architect-tier costs ~40–80x the cheap capable tier today (Fable/Mythos 5.2 $8/$40 per MTok vs Haiku 5.5 $0.10/$0.50; vs Sonnet-tier only 2–4x). The split exists for that gap.
- Escalation to an expensive implementer-tier model (Sonnet/Terra class) only when a task goes wrong or needs a highly non-trivial class/PoC; the architect calls it, in advance or on review.
- Consults are batched: delayed until non-blocked tasks are exhausted. Expensive models are used rarely and only when necessary.

### Context economy
- Same context: same agent. Different context: different agent.
- Reuse stored agent sessions, at least within one harness; across harnesses through ACP where transcripts are portable.
- Compact at the end of a session; reload the compacted session for consult, review, or next iteration. Use tree/branch summaries when a hot cache is unavailable or impractical.
- Plans are files the architect edits in place; the orchestrator reconciles execution state from a semantic diff. Never force whole-plan re-issue through a strict schema.

### Saga and hierarchy
- Hierarchy depth is bounded by config: 1 architect level is the norm, 2 the expected maximum. A subarchitect is split off only when the size/complexity of architecture context demands focused context; the architect owns all planning and review down to that level. Untouched levels are not invoked.
- Strict chain: task-level consults go to the architect responsible for that epic (epic→architect may be many-to-one). The subarchitect filters and consolidates escalations into one brief upward; implementers/reviewers never reach past their architect.
- One orchestration script drives everything down to task level.

### Funnel: only the remarkable
- implementer → reviewer → architect → [top architect] → human. Each stage filters.
- Implementers over-report trivia; the reviewer decides what is different/additive to the plan and worth architecture attention.
- Concerns (technical debt, risks, uncertainties, design choices) and remarkables propagate up the chain; calibration lives in config prompts: FYI-only / blocked-by-architect / blocked-by-user. Not spam.
- Files stay on disk; the architect can scout/read instead of receiving pasted content.

### Uncertainty and spikes
- Risk, uncertainty, complexity first. A milestone may defer detail until a spike lands ("XYZ details after spike"); implementation work already unblocked proceeds in parallel. Orchestrate all.

### Stopping and debt
- The architect is incentivized to stop: goal met → done; no infinite continuation.
- On relaunch of the same goal, the architect first reviews the implementation for technical debt and gaps (from compacted or de-novo context), then plans.
- The architect may authorize temporary technical debt; removal by the end of the same goal.

### Steering and autonomy
- Config-driven. Under the current calibration the architect records a reversible assumption, notes it as remarkable, and continues; the user steers/overrides. The process-config prompt defines what the architect may decide alone vs what blocks on user input.
- Mailbox, not ACK protocol: the user drops files to steer; the user sees remarkable notes (iteration summary, concerns, open questions) — at least one remarkable entity per iteration, never spam.

### Clean code and architecture
- Test real behavior. Bottom-up implementation + vertical slices + iterative.
- Edge cases, security posture, failure propagation/containment, observability, performance are architectural direction from day one.
- Comments: why, only for non-trivial code. Self-documenting code over docs.
- Public interfaces separate from implementation, preferably separate files; interface docs readable by humans and agents alike.
- ADR is a high bar: a long-term decision shaping the project or a whole layer; concise decision/enablement-vs-limitation, tradeoff vs alternative. Not routine decisions, not normal consult outcomes.

### Config-driven flows
- Three config layers: repo config (locations, paths, gates), factory process config (flows, agents, schemas, calibration), transient run config (harnesses, models, aliases).
- Flows are data: e.g. "just implement", "implement/review", "TDD: ingest → record known problems → stubs → implement/QA/review/security review". Adding an agent/schema to ingestion, a task-type flow, or the PM flow is a config edit. The script surface schema is fixed: agent produces, script reads.
- Review retries configurable, with follow-up options: same agent on compacted context, different model, or de novo.
- Config has a schema and pre-flight validation.

### Harness agnosticism
- Works through any omp-compatible harness with opaque config passed on the command line. omp is a special case, not a dependency; extra tools exposable through ACP.

## Notes on implementation

### Reuse from plugins/software-factory
Keep: worktree/commit/head-guard mechanics, record discipline, concern store + fingerprinting, mailbox, harness adapter, budget/limits, checks runner, derived state. Reject: 20 schemas, separate triage/context-pack/infra steps, ADR-on-everything, code-line-oriented plans, strict-schema plan re-issue.

### Known loop causes to design out
- Nested retry budgets compound (step attempts × fix rounds × consults × plan reviews × amendments). Budget the whole item, not each nest.
- No-progress detection compared only the last fingerprint, allowing alternation loops. Compare history.
- Plan review/PM bounce re-issued whole plans. Editable plan + diff kills this.
- `plan-goal-execution.md` said "keep going until complete" with no debt gate; preserve its economy rules (direction-not-spec, telegraphic, adversarial grounding, V&V inside dev tasks) but add stop incentive, spike-deferred milestones, subepics, debt review.

### Strict schema output
- Strict schema (tool/yield) only for small, simple outputs.
- The plan is a large editable file with validation instructions; configure LSP for it where the harness supports it, harness-agnostically. The old architect plan schema was too complex; flatten.

### Plan diff
- Architect edits the plan file; a cheap PM receives a semantic, schema-aware diff to reconcile execution state. Library choice is the implementer's: must treat array reorder as no-change (id-keyed matching), be reputable, TypeScript, self-agnostic. microdiff is a candidate, not a mandate.

### Harness access layer
- omp RPC (JSONL) is far more capable than ACP: compact, navigate_tree with summary, fork, subagent steering/IRC, host tools. Special-case it; with omp as architecture harness, subarchitects are subagents reachable through IRC. Server-side compaction payloads need a hot cache to pay off — compact at session end, consult later from the compacted reload.
- Everything else through ACP; acpx (headless ACP client, persistent sessions, embeddable runtime) is the candidate access layer. Session portability across harnesses is best-effort: fall back to de novo + context pack.

### Git hygiene
- Mechanical commit between agents (worktree), short hashes passed so the next agent reads diffs.
- Cleanliness: OSS heuristic check for the unusual — large files, new file extensions, many files outside task scope, temp files/model weights/huge outputs — with agentic revision (agent inspects and fixes or justifies). Prompt reminder to clean scaffolds; .gitignore is the hard floor. No homegrown heuristics.

### Orchestration artifacts
- Storage is an interface (design/OOP in scripts), three backends: plain folder (gitignored under the repo, or outside it), separate GitHub repo (all edits on a single branch, committed), folder in the same repo.
- Never commit sessions/logs or raw agent inputs/outputs to GitHub.
- Code changes may sit on an unmerged branch; orchestration artifacts must be merged/cherry-picked ASAP when stored separately.

### CRITICAL — bootstrap
This factory is built by running itself one iteration at a time. Each launch: scout previous artifacts/transcripts into the architect's context pack; the architect reviews the previous version's transcript plus the new one. Evidence for the next iteration is the previous run's transcripts.

#### Boostrap models/harness
  - use the following models:
     - architect: Claude Opus 5.5 : high (omp, claude code)
    -  Open Code Go sunscription: beam free (least capable model for steer ingestion/schema fixes/commits), capable implementers :deepbseek v41 flash, muse spark 1.3 - omp, codex, Open Code
    - "open code only free models"  (open code harness only) - glm-5.3-flash-free deepseek-v4.1-flash-free (most capable),  minimax-m3.1-flash-free  mimo-v2.6-flash-free inkling-2-small-free they are resonably capable for developmenty  tasks
    
    - develop several "model" configs and alternate to test different harness combo during iterations  
    - omp, claude code, open code, codex (only though open code subscription, muse/deepseek enabled ) are inasalled and authorized