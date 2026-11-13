# Bootstrap — handoff and runbook

For whoever orchestrates the bootstrap (this session now, a task-grade agent later). Read this file, then the last Journal entry in `LOG.md`; nothing else is needed to resume.

## Mission

Turn `manifesto.md` into a working, documented factory that was tested by building itself. Iteration 0 (by hand, with agents): the minimum new version, `KERNEL0.md`. After that the factory runs on its own repository, one iteration per launch, with `manifesto.md` plus a small delta as the goal intent; the orchestrator babysits each launch.

## Authority and files

1. `manifesto.md` `## Intent` — the owner's. Changes only by the owner's decision.
2. Owner steering (chat, later the factory mailbox).
3. `bootstrap/LOG.md` — decisions (rebuttable) and the journal: one entry per build slice and per launch.
4. `bootstrap/KERNEL0.md` — intent for the initial implementation.
5. `manifesto.md` `## Notes on implementation`, then `manifesto.advice.md` — advisory; cite line ranges, do not paste.
6. `bootstrap/context/*.md` — scout briefs: `repo-map` (v2 inventory), `advice-digest` (with a table of contents of the advice), `opencode-probe`, `omp-probe`, `kept-modules`.

Code: branch `factory-v3`, worktree `/home/slava/aiexp/agentic-swarm.wt/v3`. The owner's checkout `/home/slava/aiexp/agentic-swarm` stays on `main`, untouched; `bootstrap` there is a symlink into the worktree.

## Rules for the orchestrator

- Delegate anything bigger than a decision: discovery, implementation, transcript analysis go to subagents; give direction, not specifications. Read briefs, not sources.
- Free models first (OpenCode); a paid tier replaces a free model for a role only on measured failure, recorded in the Journal.
- State lives on disk. Every decision, intervention and launch result goes to `LOG.md` before the next step starts.
- The factory runs only from the pinned build; the pin moves only after the no-model E2E suite passes.
- Sessions, transcripts, raw prompts never enter git.
- The manifesto's autonomy rule applies to the orchestrator too: on an open question take the reversible assumption, log it as a decision, continue. Ask the owner only for: a contradiction inside Intent, a destructive action outside the worktrees, spend beyond the bound in the run config, or three launches in a row without merged progress.

## Phases

| Phase | Exit |
|---|---|
| A. Context | Scout briefs written, `KERNEL0.md` and decisions recorded |
| B. Kernel-0 build | Slices P, S0–S5 of `KERNEL0.md` §8 merged on `factory-v3`; suite green; build pinned |
| C. Shakedown | Toy goal, free models in every role including architect: at least one reviewed task merged, summary + metrics written, no manual repair during the launch |
| D. Self-run | Goal = this repository, intent = manifesto + delta; one iteration per launch with the real architect alias; repeat the launch protocol |
| E. Close | Architect declares the goal done; every Intent section has test or run evidence (traceability table in the usage docs); usage and ideology docs reviewed; benchmark goal compared with the v2 baseline |

## Build protocol (phase B)

One slice = one foreman subagent that owns named files in the worktree. The foreman tries OpenCode free models for bounded pieces (verified commands: `context/opencode-probe.md`), verifies everything itself, and implements directly after two free-model failures on the same piece. On return: check the acceptance it claims (typecheck, the suite), read its deviations, journal the slice with the free-model attempt table. Parallel slices get their own worktree and branch off `factory-v3` and are merged by the orchestrator.

## Launch protocol (phases C and D)

1. Promote: suite green on the head to run → copy that commit's package to the pin directory → journal the pinned hash.
2. Launch from the pin with an iteration limit of 1. Do not touch a running launch except to stop a runaway (bounds exceeded).
3. After exit read, in this order: the iteration summary in the goal outbox, the metrics, the derived status. Send a scout over the session store for what the summary cannot show: loops, wasted turns, work done by the wrong role, prompt sizes.
4. Verify merged work independently: suite on the integration head, a reviewer subagent on diffs that touch the core.
5. Classify every problem and act through the cheapest channel that works:
   - factory defect that blocks the next launch → fix by hand on `factory-v3`, count it as a human intervention;
   - factory defect that does not block → steer through the goal mailbox so the factory repairs itself;
   - plan problem → steer; never edit `plan.md` by hand;
   - model too weak for a role → change the run config, journal the evidence;
   - gap or contradiction in Intent → collect; ask the owner only under the rule above.
6. Journal the launch: pinned hash, run config name, iterations, architect launches, architect share of cost, cost per merged task, merged / parked, loop incidents, human interventions, what changes before the next launch.
7. Merge the integration branch into `factory-v3` when step 4 is clean, promote, relaunch.
