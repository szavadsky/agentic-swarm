# Manifesto vs as-built — evidence report

Read-only audit of `manifesto.md` against `plugins/software-factory/` (branch `factory-v3`, HEAD `dd6fc97`), `bootstrap/` and the self goal. Shorthand: `mk`=manifesto.md, `sf/`=plugins/software-factory/, `LOG`=bootstrap/LOG.md, `plan`=.factory/artifacts/self/plan.md, `i12`=.factory/artifacts/self/iterations/12/summary.md. Statuses: built+tested / built-untested / partial / missing / built-differently / contradicted-by-practice.

## Headline

- Kernel Intent is largely real: iteration loop, plan→PM→task→review→merge, steering/mailbox with holds, config layers, records+derive, pricing/metrics, harness adapters.
- Unbuilt Intent: task→bigger auto-escalation (`review-upscope`), hierarchy level 2 (all `epic-*`), advisory plan review (`plan-review`), harness rotation (`rotation-threaded`), sandbox doc (`operator-docs`), benchmark run.
- Textual defects a careful implementer hits: L12 same-agent trivial, L19 dependents-idle, L22 "single plan" vs L38 subarchitect plans, L30/L118 portability-graph claim, L46 calibration vocabulary, L84/L85 opaque+LSP claims, L89 sandbox "documented", L97 human presets, L119 "TTL is config".
- Notes-level keep list partly contradicts the prune: concern store deleted, human-involvement presets absent, hygiene check absent, LSP absent, structural-diff rule unused.
- Delivery gap: no `docs/usage.md`, no `docs/intent-evidence.md`, benchmark never run (i12 "Still owed for done").

## 1. Requirement matrix (manifesto top to bottom)

| M | Quote (verbatim fragment) | Status | Evidence | Note |
|---|---|---|---|---|
| preamble 3 | "Intent is authoritative" | built | `mk:3`; `LOG:3` (authority order) | Doc-level rule; enforced socially, not in code. |
| preamble 5 | "Supersedes `docs/factory.v2.md` and the design of `plugins/software-builder`" | built+tested | `sf/docs/` holds only `runs/`, `spikes/`; v2 files gone; `LOG:241-243` prune-docs; `test/reachability.test.ts` | v2 readable via `git show main:<path>` (D1). |
| 8 | "no hard-coded size ceiling" | partial | no size cap in `sf/src/kernel/derive.ts:33-87`; per-item/concurrency/iteration limits are config (`sf/src/kernel/config.ts:73,119-128`) | Tens of tasks/iteration proven (76 task files, 18 merged in i11). Epics absent → saga span unproven. |
| 8 | "One goal may span many epics and tens of tasks per iteration" | partial | `plan:310-361` M11 pending; only `sf/src/kernel/register.ts:91` knows "epic", unreachable (`test/reachability.test.ts:16`) | Tasks yes, epics no. |
| 11 | "One cheap-but-capable agent classifies the goal: trivial / task / bigger" | built+tested | `sf/src/kernel/front.ts:29-33,198-257`; `sf/prompts/front.md:7-9`; `sf/test/kernel/front.test.ts:58` | Front also skipped once `plan.md`/`class.yaml` exists (`front.ts:204,209`). |
| 11 | "For a task it defines the scope" | built+tested | `front.ts:103-148` (one task, same validation as PM); `prompts/front.md:22`; `front.test.ts:329` | Exactly one task enforced (`front.ts:111`). |
| 11 | "It is not smart enough to decide how big "bigger" is — that is the architect's call." | built-differently | `front.ts:29-33` class enum; `front.ts:184` bigger→boundary; architect scopes in `plan.md` | Front does decide bigger-vs-task; architect decides scope inside bigger. Ambiguous split. |
| 12 | "Trivial: the same agent implements." | contradicted-by-practice | `sf/src/kernel/flow-context.ts:160-171` (cwd equality); `sf/src/kernel/flow.ts:146-151`; `plan:251` front-handoff | Front runs in goal checkout, implement in task worktree → resume never fires; de novo on a different alias. Plan calls it a gap. |
| 13 | "Task: does not reach the architect." | built+tested | `front.ts:186-187` (dispatch, no boundary); `front.test.ts:58` | |
| 13 | "Task review auto-escalates to "bigger" when the real scope exceeds the defined one." | missing | `sf/prompts/reviewer.md:16-21` has no upscope; `sf/src/kernel/flow.ts:94-96` parks `upscope`; only the front turn writes class (`front.ts` grep) | `review-upscope` pending (`plan:299-303`); implementer upscope only parks. |
| 14 | "Task or bigger: the same agent prepares the context pack" | built-differently | `front.ts:173-190` front writes pack; `sf/src/kernel/boundary.ts:110-140` script renders pack when no front | Same agent on first launch only; scripted on relaunch (allowed by `mk:218`). |
| 14 | "No separate triage/context-pack/infra steps" | built | one front turn; pack render is deterministic, not an agent step (`boundary.ts:112-140`) | |
| 17 | "An iteration is one architect engagement plus the orchestration it launches" | built+tested | `sf/src/kernel/launch.ts:214-252`; `boundary.ts:89-245`; `sf/test/kernel/integration-e2e.test.ts` | Front-only trivial/task iteration has no architect (see note on 17b). |
| 17 | "Each architect consult starts a new iteration." | built+tested | `boundary.ts:97`; `sf/src/kernel/derive.ts:42` (max record iteration) | Front-path iteration increments without a consult; documented exception. |
| 18 | "Every consult begins with a completeness check" | built-untested | `sf/prompts/architect.md:17-21` (turn order) | Prompt-only; snapshot test, no behaviour test. |
| 18 | "Sub-epics get their own completeness check." | missing | no sub-epic/epic consult path (grep `subarchitect` = `register.ts` only) | M11 pending. |
| 19 | "a landed spike does not end the iteration — the iteration still runs to exhaustion" | built+tested | `sf/src/kernel/dispatch.ts:138-323` loop; `derive.ts:13-18` (finished satisfies deps); spike scenario tests | |
| 19 | "dependents idle until the boundary" | contradicted-by-practice | `derive.ts:13-18`; `dispatch.ts:210-323` | A finished spike satisfies deps at once; dependents dispatch in the same iteration. |
| 19 | "Consulting the architect mid-iteration is the exception: measured" | partial | no mid-iteration architect call site; PM steer turn only (`dispatch.ts:177-198`); no consult metric (`sf/src/kernel/metrics.ts:30-56`) | Not measured. |
| 22 | Architect writes no code, no verbose docs; plans only | built-untested | `prompts/architect.md:5,11,34` | Prompt-only. |
| 22 | "The architect produces a single markdown plan" | built+tested | `plan.md`; `boundary.ts:204-211` existence check; PM parses it textually (`sf/src/kernel/pm.ts:74-90`) | See defect D4 (single vs epic plans). |
| 22 | "never schema-consistent files" | built+tested | plan is markdown; only outcome is schema (`sf/src/kernel/types.ts:11-18`) | |
| 22 | "Called with a prepared context pack; agentic and subagentic (scout/task)" | built+tested | `sf/src/kernel/context-pack.ts:66`; `boundary.ts:112-140`; `sf/src/cli/harnesses.ts:28` subagent model | Subagents only on omp. |
| 23 | "A weaker model can still usefully review the architect's plan" | missing | no `plan-review` role (`sf/config/process.yaml:23-29`); `plan:304-309` pending | `plan-review`. |
| 24 | "Optimize overall cost on that ratio (~50x)" | partial | price table + architect share `metrics.ts:52-56,294`; `sf/src/cli/benchmark.ts:38` | Measurement built; no cost-ratio policy. |
| 25 | "Escalation to an expensive implementer-tier model ... the architect calls it" | built+tested | `sf/src/kernel/tasks.ts:61` tier; `flow-context.ts:116-120`; `sf/test/kernel/tier-target.test.ts`; `bootstrap/run/self.yaml:32-34` | "on review" not implementable: review keeps reviewer alias (`flow-context.ts:117`). |
| 26 | "Consults are batched: delayed until non-blocked tasks are exhausted" | built+tested | boundary only from `launch.ts:239-246`; dispatch returns `boundary` (`dispatch.ts:319`) | |
| 29 | "Same context: same agent. Different context: different agent." | built+tested | separate flow steps (`config/process.yaml:3-22`); resume per alias/worktree `flow-context.ts:122-146`; `session-compact.test.ts` | |
| 30 | "Across harnesses portability is directional ... a graph records which way a session can move." | partial | `sf/src/harness/types.ts:103-109` `portable(from,to)=from===to` | No graph, no cross edges; de novo for every other pair. |
| 30 | "Not portable → de novo, with the context pack and links to artifacts." | partial | de novo prompt only; task turns read the task file/worktree (`prompts/implementer.md:1`), not the pack | Pack reaches architect/PM only (`agent.ts:50-60`). |
| 31 | "Compact at the end of a session ... Compaction is transcript trimming" | built+tested | `flow.ts:173-181`; `boundary.ts:158-162`; `session-compact.test.ts`; `LOG:267` | |
| 31 | "Use tree/branch summaries when a hot cache is unavailable or impractical." | missing | no tree/fork summary path; `Caps.fork` unused (grep) | |
| 32 | "Plans are the architect's markdown, edited in place — never in flight" | built+tested | `pm.ts:84-100` restores plan if PM edits; `pm.test.ts` | |
| 32 | PM "identifies task files, owns the DAG and the dispatch sets" | built+tested | `pm.ts:83-131,75-90`; dispatch admission `dispatch.ts:279-295`; `pm.test.ts` | |
| 32 | "Tasks are named by short immutable slugs." | built+tested | `tasks.ts:45-50` (file name authoritative), `:93-105` material hash; `pm.ts:83-131` | |
| 32 | "The orchestrator reconciles execution state from a semantic diff." | built-differently | `pm.ts:74-90` plan-mention + `tasks.ts:93-105` material hash; no diff library | "Semantic diff" has no implementation or definition. |
| 33 | "Status is aggregated by the script ... idempotently; the context pack is prepared from it." | built+tested | `derive.ts:24-87`; `context-pack.ts:66`; `sf/test/kernel/scenario1.test.ts` (delete records → same state) | |
| 36 | "Hierarchy depth is bounded by config: 1 architect level is the norm, 2 the expected maximum." | missing | no `hierarchy` key (`sf/src/kernel/types.ts:254-300`, `config.ts`); `register.ts:20` takes depth as a param only | M11 pending; no config knob. |
| 36 | "A subarchitect is split off only when the size/complexity of architecture context demands" | missing | no subarchitect role/alias (`config/process.yaml`; `bootstrap/run/*.yaml`) | |
| 37 | "Strict chain: task-level consults go to the architect responsible for that epic" | missing | no epic→architect mapping; one architect | |
| 38 | "Each subarchitect owns the status summary of his iteration." | partial | single summary writer `sf/src/kernel/summary.ts:93`; register parser `register.ts:91` unused | Parser + tests exist (`register.test.ts`), no caller. |
| 38 | "Task dispatch stays in the single script." | built+tested | one `runDispatch` (`dispatch.ts:138`), one merge queue (`integrate.ts:24-25`) | |
| 38 | "the architect register is maintained as part of the saga plan" | partial | `register.ts:35-150` grammar+validation; `test/kernel/register.test.ts` | Not wired; allowlisted `test/reachability.test.ts:16`. |
| 39 | "One orchestration script owns everything ... through a harness abstraction that knows each harness's capabilities" | built+tested | `cli/harnesses.ts:25-32`; `harness/types.ts:12-21` Caps; omp special case | Caps inform resume/compact/effort probes (`architect-session.ts:23`, `flow-context.ts:177`, `preflight-aliases.ts:40`); routing does not branch on them. |
| 42 | "implementer → reviewer → architect → [top architect] → human." | partial | flow steps + boundary + owner concerns (`summary.ts:219-222`) | No "top architect" entity; undefined term. |
| 43 | "Each stage sees a different scope ... separate steps rather than one agent" | built+tested | `config/process.yaml:3-10`; `prompts/reviewer.md:1`; `flow.ts:127-200` | |
| 44 | "Implementers over-report trivia; the reviewer decides what is ... worth architecture attention" | built-untested | `prompts/reviewer.md:13,23`; `prompts/_calibration.md:14`; D11 `LOG:19` | Prompt-level. |
| 45 | "Reviewer pairing is per task-type flow in config; there is no separate integration "wave review"" | built+tested | flows in `config/process.yaml`; no wave entity (grep); integration at boundary | Pairing is global role→alias, per-flow only by defining new roles. |
| 45 | "The reviewer's prompt and context differ ... not the implementer's edits" | built+tested | `prompts/reviewer.md:1`; no session reuse (`agent.ts:95`) | |
| 46 | "Concerns ... propagate up the chain; calibration lives in config prompts: FYI-only / blocked-by-architect / blocked-by-user." | built+tested | `prompts/_calibration.md:6-8`; debt `sf/src/kernel/record.ts:46-70`; forwards `context-pack.ts:216-240`; owner section `summary.ts:219` | Vocabulary differs: code `fyi|architect|owner` (`types.ts:3-8`). |
| 47 | "Files stay on disk; the architect can scout/read" | built-untested | `prompts/architect.md:7`; cwd `boundary.ts:145` | Prompt. |
| 50 | "Risk, uncertainty, complexity first. A milestone may defer detail until a spike lands" | built-untested | `prompts/architect.md:63-65`; deps-based parallelism `derive.ts:13-18` | Prompt; no milestone entity (D11). |
| 51 | "The architect issues what it can direct now plus the spikes" | built+tested | `tasks.ts:51` spike kind; `config/process.yaml:15-22`; scenario spike finish tests | |
| 54-55 | "The architect is incentivized to stop"; "Stop criteria, stated in the prompt" | built-untested | `prompts/architect.md:27-30`; `derive.ts:43-45` | Prompt; no formal-criteria input except goal text. |
| 56 | "On relaunch ... the architect first reviews the implementation for technical debt and gaps" | built-untested | `prompts/architect.md:23-25`; digest on relaunch `boundary.ts:103-108` | Prompt + digest; no machine gate. |
| 57 | "The architect may authorize temporary technical debt; removal by the end of the same goal." | missing | debt recorded (`record.ts:46-70`), listed in summary (`summary.ts:213-217`); `done` ignores open debt (`derive.ts:43-45`) | No enforcement/remover check. |
| 58 | "Bounds: ... optional limits on $ / subscription use / time per iteration. On a per-iteration budget hit: drain" | built+tested | `config.ts:119-128`; `types.ts:128-130`; `dispatch.ts:224-247`; `budget-drain.test.ts` | USD, turns, wall only; no subscription-quota knob. |
| 61 | "Config-driven ... reversible assumption ... notes it as remarkable, and continues" | built+tested | `_calibration.md:12`; assumptions section `summary.ts:155,196`; steers | |
| 62 | "Mailbox, not ACK protocol ... at least one remarkable entity per iteration (the iteration summary is the guaranteed one)" | built+tested | `summary.ts:93` writes always, incl. crash; outbox `summary.ts:260-261`; `mailbox.ts:121` | Summary may list `- none` under Remarkable (`summary.ts:224-226`). |
| 63 | "The script monitors the mailbox at startup and during a run. A cheap "PM" agent converts each steer into structured artifacts and decides which task or gate it blocks." | built+tested | boundary scan `boundary.ts:109`; mid-run poll `dispatch.ts:155-198`; holds `mailbox.ts:27-41,239`; `runSteerPm` `pm.ts:362`; `steer-holds.test.ts` | |
| 63 | "In-flight tasks finish and park unmerged; pending ones hold; ... every steer goes to the architect ... response in the outbox." | built+tested | `dispatch.ts:256-273` (park `steer:`), holds admission; `mailbox.ts:268-292`; `steer-holds.test.ts` | |
| 66-71 | Clean-code rules (real behaviour, priorities, edges, comments, interfaces, repo wins) | built-untested | `prompts/_clean-code.md:3-10`; `prompts/reviewer.md:13,25-27`; `prompts/implementer.md:19-21` | Prompt-level only. |
| 72 | "ADR is a high bar" | built+tested | `prompts/architect.md:73`; no `docs/adr` (deleted, `LOG:241-243`) | |
| 75 | "Three config layers: repo ... process ... run" | built+tested | `config.ts:191-231`; `config.test.ts`; README:29-74 | |
| 76 | "Flows are data ... Adding an agent/schema to ingestion, a task-type flow, or the PM flow is a config edit." | built+tested | `config/process.yaml:2-30`; `config.ts:48-59`; `types.ts:11-18` | "ingestion" never defined; flows are read at launch, no hot reload. |
| 77 | "Prompts are templated, not copy-pasted." | built+tested | `sf/src/kernel/prompts.ts`; `prompts.test.ts`; `prompts-snapshot.test.ts`; partials `prompts/_*.md` | |
| 78 | "Review retries configurable, with follow-up options: same agent on compacted context, different model, or de novo." | built+tested | `followUpSchema` `config.ts:48-59`; `flow-context.ts:102-120,66-77`; `reviewRounds` `config.ts:58` | Modes exist; no run config exercises non-default. |
| 79 | "Task review: two rounds by default ... last round decides" | built+tested | `config/process.yaml:4`; `flow.ts:88-113`; `derive-task.ts:151-178`; scenario tests | |
| 80 | "Concurrency: an absolute limit and limits per harness, in config." | built+tested | `config.ts:119`; `dispatch.ts:279-292`; `dispatch.test.ts` | |
| 81 | "Config has a schema and pre-flight validation." | built+tested | zod schemas `config.ts:21-140`; `preflight.ts:157-268`; `preflight.test.ts` | |
| 84 | "Works through any acp-compatible harness with opaque config passed at launch ... Supported and tested ... omp, OpenCode, codex, pi — with harness rotation" | partial | adapters `cli/harnesses.ts:25-32`; acpx probe `bootstrap/context/acpx-probe.md`; no `rotate` key (`config.ts`); pi/codex live runs owed (`i12` "Still owed") | Rotation missing; opaque only as `TurnRequest.opaque` (`harness/types.ts:87`), no run-config field. OpenCode adapter is CLI, not ACP. |
| 85 | "pi is the recommended task-flow implementer"; "omp carries structured output ... with LSP configured for YAML/JSON there" | partial | `self-acpx.yaml:23-30` pi+codex; default `self.yaml:22-24` opencode implementer; no LSP file/config (find) | Recommendation not the default; LSP absent. |
| 86 | "never a bespoke CLI wrapper for what the protocol already covers." | contradicted-by-practice | `sf/src/harness/opencode/harness.ts` CLI adapter; D19 grandfathers it `LOG:26`; acpx for pi/codex (`acpx/harness.ts:22`) | Deliberate, documented exception to an absolute rule. |
| 89 | "The entire factory is assumed to run inside a sandbox ... this is documented, not enforced." | missing | no bubblewrap/sandbox doc outside `plan:368` ("documented nowhere"); `operator-docs` pending | |
| 90 | "Which models see which code ... is my run config, not a factory deliverable." | built | no code needed; run-config layer exists | N/A by design. |
| 95 | "Keep: ... concern store + fingerprinting ..." | partial | only `concernFingerprint` kept (`context-pack.ts:1`); v2 concern store deleted (`plan:51`); debts/concerns live in records `record.ts:46-70` | Keep-list contradicts the prune. |
| 95 | "Reject: 21 schemas, separate triage/context-pack/infra steps, ADR-on-everything, code-line-oriented plans, strict-schema plan re-issue." | built+tested | no `config/schemas/`; no triage step; `docs/adr` gone; markdown plan | |
| 97 | "Already true in v2, keep rather than rebuild: ... human-involvement presets (autonomous / principal / detailed)." | partial | partials, slugs, state-apart, derived status all present; `humanInvolvement` grep = 0; no task in `plan`/`tasks` | Presets missing and untracked. |
| 100 | "Nested retry budgets compound ... Budget the whole item, not each nest." | built+tested | `next.ts:78-81` itemTurns; no per-step budget | |
| 101 | "No-progress detection compared only the last fingerprint ... Compare history." | built+tested | `progress.ts`; `derive-task.ts` loop history; `next.ts:30-39`; `progress.test.ts` | |
| 102 | "Plan review/PM bounce re-issued whole plans. Editable plan + diff kills this." | built+tested | plan edited in place; `pm.ts:74-131` | No plan-review step yet (that is 23). |
| 103 | "preserve ... economy rules ... add stop incentive, spike-deferred milestones, subepics, debt review." | partial | stop `architect.md:29-30`; deferred milestone `:65`; debt review `:25`; subepics missing | 3 of 4. |
| 104 | "Architect-role launches were the biggest single cost ... usage records need cache fields" | built+tested | `metrics.ts:52-56` (launches/costShare); `types.ts:43-51` cache fields; `pricing.ts` | |
| 107 | "Strict schema (tool/yield) only for small, simple outputs." | built+tested | outcome schema only `types.ts:11-18`; plan markdown | All harnesses write the file (D6 `LOG:14`). |
| 108 | "The architect's plan is markdown ... Configure LSP for the plan where the harness supports it" | partial | plan markdown; PM derive; no LSP (find); no LSP in `plan`/`tasks` | LSP missing. |
| 111 | "The architect writes one markdown plan; the PM derives task files, the DAG and the dispatch sets" | built+tested | `boundary.ts` → `pm.ts:292-360`; `tasks.ts`; `dispatch.ts` | |
| 112 | "Reconcile is deterministic where it can be (done tasks frozen, rework as a new slug, pending tasks re-read at dispatch)" | built+tested | `pm.ts:20-43,75-131`; `pm.test.ts`; `tasks.ts:45-50` | |
| 113 | "Library choice for any residual diffing is the implementer's (id-keyed ... microdiff is index-based)" | built-differently | no structural diff; `pm.ts` uses plan mentions + material hash | Rule has no consumer. |
| 116 | "omp RPC ... Special-case it; with omp as architecture harness, subarchitects can be subagents reachable through IRC" | partial | omp RPC adapter `sf/src/harness/omp/rpc.ts`; `Caps.subagents` (`types.ts:16`) unused; no subarchitect | |
| 117 | "Everything else through ACP; acpx ... prefer native structured output ... and build a direct layer" | partial | acpx adapter `acpx/harness.ts:22`; all outcomes via file `agent.ts:117`; D6 `LOG:14` native output backlog | |
| 118 | "today: one-way into omp from Claude Code and Codex; ACP itself has no transcript import" | contradicted-by-practice | `portable()` same-harness only `types.ts:103-109`; no claude harness in registry `cli/harnesses.ts:25-32` | Claimed current state does not exist. |
| 119 | "compact at the end ... never at the start of a resumed session ... No cache warming" | built+tested | `flow.ts:173-181`; `boundary.ts:158-162`; omp overlay `omp/overlay.ts:26`; `session-compact.test.ts` | |
| 119 | "The TTL is config: in omp the enum `auto|short|long|none` — set `short` explicitly" | partial | retention hardcoded default `"short"` `omp/overlay.ts:18,26`; no run-config key (`config.ts`) | Not configurable. |
| 122 | "Mechanical commit between agents (worktree), short hashes passed" | built+tested | `flow.ts:51-63,154-155` (base/head); `worktree.ts` | |
| 123 | "Cleanliness: OSS heuristic check ... with agentic revision ... Prompt reminder ... .gitignore is the hard floor." | partial | cleanup line `prompts/implementer.md:10`; `.gitignore` `store.ts:63-79`; no heuristic code (grep) | Heuristic+revision missing, no task. |
| 126 | "Storage is an interface ... Start with the plain-folder backend" | built+tested | `types.ts:216-235`; `store.ts:31-213`; `store.test.ts` | One backend only (as intended). |
| 127 | "Never commit sessions/logs or raw agent inputs/outputs to GitHub." | built+tested | `sessions.ts:30-57` outside repo; artifact `.gitignore *` `store.ts:63-79` | |
| 128 | "orchestration artifacts stored in the same repo must be merged/cherry-picked ASAP" | built-differently | artifacts gitignored (`store.ts:75-79`) so never in git; code merges via `integrate.ts` | Rule inert for folder backend. |
| 131 | "Each launch: a cheap scout distils the previous run's artifacts/transcripts into an evidence digest ... Session store lives outside worktrees and outside git (path in run config, last N runs kept)." | partial | digest `digest.ts`; digest only on relaunch `boundary.ts:103-108`; sessions `sessions.ts:53-56`; `keepRuns` `self.yaml:54-56` | "Each launch" vs relaunch-only. |
| 133 | "Always execute from a pinned last-good version ... promote after the no-model E2E suite passes. Metrics per iteration ... one fixed benchmark goal re-run each time" | partial | `bootstrap/promote.sh:14-22` (export+typecheck+test); metrics `metrics.ts`; benchmark kit `bootstrap/benchmark/README.md`; benchmark not run (`i12` "Still owed") | Pin is process, not enforced by `factory run`. |
| 136-139 | Bootstrap models/harness (Opus architect, Sonnet escalation, subscriptions, free models) | partial | `self.yaml:2-57`; `self-acpx.yaml`; D17 `LOG:27`; Sonnet escalation `self.yaml:32-34` | Codex/Claude legs configured, never run. |
| 144-146 | Free models first, promote on measured failure, highest effort, alternate configs, pi rotated | partial | `run/*.yaml`; D17; `LOG:267` PM promotion evidence; rotation task pending | Rotation missing; private configs exist. |
| 147-206 | Owner decisions propagated | built | decision log `mk:147-206`; `LOG:5-56` D1-D19 + steering entries | Not requirements; 7 `*Confirm:*` and N15 unanswered remain. |
| 209-218 | Glossary definitions | partial | `mk:209-218` | `milestone`, `wave`, `PM split/merge` have no mechanism; `sub-epic`, `top architect`, `front agent` undefined. |

## 2. As-built, not in the manifesto (amendment candidates)

- **PM retry/escalation ladder** — fresh same-tier retry, then `escalateTo` with broader mandate, then block with rung trace (`sf/src/kernel/pm.ts:171-360`; `boundary.ts:50-54`; README:76-81; `LOG:268,273`). Manifesto only says the PM structures steers.
- **Steer holds artifact** — `mailbox/holds/<id>.yaml` `{slugs,goal}`; a goal hold is a named drain (`mailbox.ts:27-41,239`; `dispatch.ts:117-136,256-273`). Manifesto says "decides which task or gate it blocks" but names no artifact.
- **Containment invariant** — a turn may change only its own worktree; commit refused, task parked, evidence in record (`flow.ts:154-170`; `worktree.ts:273-300`; `containment.test.ts`; REV finding `LOG:177`, fixed `LOG:188-191`; false positive when the owner touches the repo root mid-turn (`LOG:285`)).
- **Base-gate baseline** — pre-flight records one gate run per base commit; pre-existing red is not a task finding and does not fail pre-flight (`baseline.ts:29-43`; `gates.ts`; `prompts/reviewer.md:41`; README:98-100).
- **Serial squash-merge queue with merged-result gates** — squash in scratch at integration head, gates there, ref moves only after green, crash-recoverable merge (`integrate.ts:24-25,58-102,189-223`; `merge-recovery.test.ts`).
- **Scope-overlap admission** — never two tasks whose declared scopes touch (`dispatch.ts:40-59,288,295`).
- **Infra taxonomy + same-harness fallbacks + attempts pricing** — `quota|rate|auth|crash|overflow|timeout`, scrubbed `details`, retries never consume item budget, every attempt priced (`types.ts:30-41,67-72`; `agent.ts`; `pricing.ts:98-115`; D8 `LOG:16`).
- **Outcome repair turn** — one same-session repair ask, then `failed`; file first, fenced-block fallback (D6) (`agent.ts:70-94,195-215`).
- **Overflow de-novo retry** — resumed session overflow retries once without the session, second overflow parks (`agent.ts:137-153,208-215`; `overflow-denovo` merged i11).
- **Session home `dir` + cross-launch architect resume** — harness-managed session home, missing session retries de novo (`types.ts:63`; `architect-session.ts:11-33`; `LOG:221-224`).
- **Torn-record tolerance and launch recovery** — malformed outcome skipped, torn end degrades to orphan, merge recovery (`recovery.ts`; `store.ts`; `LOG:227-230`; `merge-recovery.test.ts`).
- **Run lock / runtime isolation** — one run per goal, runtime dir outside checkout, TMPDIR redirected for children (README:88-93; `launch.ts:154-158`; `cli/lock.ts`).
- **Price-table semantics** — unpriced ≠ `$0`; all-zero counters = no usage; cache writes at input rate (`README:83-90`; `pricing.ts`; `self.yaml:39-41`).
- **Drain limits** — per-iteration turn, wall-clock and USD brakes; per-slug infra stop lets independent work continue (`types.ts:128-130`; `dispatch.ts:224-247`; `budget-drain.test.ts`).
- **Digest split** — script-computed cost/turn facts plus agent narrative, 80-line cap (`digest.ts:24-28`; `prompts/digest.md:11-26`).
- **CLI surface + exit codes** — `init/run/status/benchmark/steer`, 0/1/2/3/130/143, first signal drains (`README:7-27`; `sf/src/cli/commands.ts`).
- **Benchmark kit** — `reset.sh`, archived v2 target, cheap-tier run config (`bootstrap/benchmark/README.md`; `bootstrap/run/benchmark.yaml`).
- **`class.yaml` + front task contract** — three-class file, exactly one task, `Front pack:` line, `tier` validation (`front.ts:103-148`; `prompts/front.md`).
- **`base:` continuation + spent slugs** — parked branch continued by a new slug naming `base`; cancelled slugs are read-only (`tasks.ts:62,135-141`; `pm.ts:36-43`; `prompts/architect.md:70`).
- **`upscope` outcome + `source`/`tier`/material hash** — `types.ts:12`; `tasks.ts:61-63,93-105`; `prompts/_outcome.md:15`.
- **Gate-fix turn** — one fix turn after red merge-checks without consuming a review round; second red parks (`derive-task.ts:160-189`; `flow.ts:202-229`).
- **Process defaults** — `itemTurns: 8`, three default flows incl. `spike` at one review round (`config/process.yaml:2-30`).

## 3. Intent defects (exact quotes; inline-annotation feedstock)

1. **L12** `Trivial: the same agent implements.` — impossible as written with cwd-bound sessions: front runs in the goal checkout, implement in a task worktree, and resume requires equal cwd (`flow-context.ts:160-171`). Two readers: same model/alias (what `front-handoff` plans) vs same session (impossible). `plan:251`.
2. **L13** `Task review auto-escalates to "bigger" when the real scope exceeds the defined one.` — the reviewer has no upscope verdict (`reviewer.md:16-21`); implementer `upscope` only parks (`flow.ts:94-96`); nothing but the front writes `class.yaml`. One of the two mechanisms must be named.
3. **L19** `dependents idle until the boundary.` — contradicts the same sentence's "runs to exhaustion" and the code: a finished spike satisfies deps immediately (`derive.ts:13-18`) and dependents dispatch in that iteration.
4. **L22** `The architect produces a single markdown plan` — vs L38 `Each subarchitect owns the status summary of his iteration.` and L212 `an epic is a coherent part owned by one architect`. At depth 2 there is a main plan plus epic plans; "single" is false or means "one per architect".
5. **L14** `same context, same agent.` — vs L218 `built by the front agent or by deterministic scripts.` A reader cannot tell whether a scripted pack violates the same-agent rule; code does both (`front.ts:173-190`; `boundary.ts:112-140`).
6. **L30** `a graph records which way a session can move.` + **L118** `today: one-way into omp from Claude Code and Codex` — no graph exists (`portable()` is `from===to`, `types.ts:103-109`) and no Claude Code harness exists (`cli/harnesses.ts:25-32`). Both are stated as current facts.
7. **L32** `The orchestrator reconciles execution state from a semantic diff.` — "semantic diff" undefined; the code reconciles by plan-mention (`pm.ts:74-90`) and material hash (`tasks.ts:93-105`), no diff.
8. **L36** `Hierarchy depth is bounded by config: 1 architect level is the norm, 2 the expected maximum.` — no such config key; "architect level" counting undefined (is main level 1?). A reader may add `hierarchy.depth`, as `epic-plumbing` plans.
9. **L42** `implementer → reviewer → architect → [top architect] → human.` — "top architect" undefined; **L18** `Sub-epics get their own completeness check.` uses "sub-epic", a term absent from the glossary (which defines `epic`). Two readers build different stages.
10. **L46** `calibration lives in config prompts: FYI-only / blocked-by-architect / blocked-by-user.` — code vocabulary is `fyi|architect|owner` (`types.ts:3-8`; `_calibration.md:6-8`); "blocked-by-user" implies blocking, while `owner` may carry a default and not block.
11. **L50** `A milestone may defer detail until a spike lands` + **L213** `Milestone: a demoable, checkable achievement` — no milestone object exists; the rule is one prompt line (`architect.md:65`) the PM cannot see or enforce. Reader may build milestone state.
12. **L57** `The architect may authorize temporary technical debt; removal by the end of the same goal.` — debt is recorded and summarized (`record.ts:46-70`; `summary.ts:230-235`) but `done` ignores open debt (`derive.ts:43-45`). Invariant unenforced.
13. **L58** `optional limits on $ / subscription use / time per iteration.` — USD, turns, wall exist (`config.ts:119-128`); subscription quota has no source or knob. Either drop or define measurement.
14. **L62** `at least one remarkable entity per iteration (the iteration summary is the guaranteed one)` — the summary is a document, not an entity; its `## Remarkable` can be `- none` (`summary.ts:224-226`). Two readers: summary-as-remarkable vs at-least-one-item.
15. **L76** `Adding an agent/schema to ingestion, a task-type flow, or the PM flow is a config edit.` — "ingestion" is never defined and no such step exists; schemas are zod code (`types.ts:11-18`) while the same paragraph says `The script surface schema is fixed`. Contradictory instruction.
16. **L84** `with opaque config passed at launch` — no run-config field reaches `TurnRequest.opaque`; only the omp adapter reads it internally (`omp/types.ts:4`; `harness/types.ts:87`). Reader may add a new pass-through layer.
17. **L85** `with LSP configured for YAML/JSON there` and **L108** `Configure LSP for the plan where the harness supports it` — no LSP file, flag or doc anywhere (find/grep). Stated as if built.
18. **L86** `never a bespoke CLI wrapper for what the protocol already covers.` — the OpenCode adapter is exactly that, deliberately grandfathered (`LOG:26`). Absolute wording vs logged exception; future implementers will read it as a prohibition.
19. **L89** `this is documented, not enforced.` — nowhere documented; `plan:368` says "documented nowhere"; `operator-docs` pending. Statement of fact is false.
20. **L95** `Keep: ... concern store + fingerprinting ...` — the store was deliberately deleted (`plan:51`); only `concernFingerprint` remains (`context-pack.ts:1`). Keep-list contradicts the prune decision.
21. **L97** `human-involvement presets (autonomous / principal / detailed).` — zero occurrences in `sf/src`, `prompts`, `config`; no task in `plan` or `tasks/`. Either build or strike.
22. **L119** `The TTL is config` — omp retention is hardcoded `short` in the overlay (`omp/overlay.ts:18,26`); no run-config key. Reader will add `cacheRetention`.
23. **L133** `Always execute from a pinned last-good version` — `factory run` does not check or pin (`launch.ts:121-335`); it is a bootstrap process rule (`bootstrap/README.md:25`). "Always" overstates enforcement.
24. **L31** `Use tree/branch summaries when a hot cache is unavailable or impractical.` — no tree/fork summary path; `Caps.fork` unused. Undefined trigger, unbuilt capability.
25. **L25** `the architect calls it, in advance or on review.` — "on review" cannot escalate the implementer: review keeps the reviewer alias (`flow-context.ts:117`). Only advance/pre-plan escalation works.
26. **L206** `All items decided.` vs **L191** `N15: unanswered` — internal contradiction; also 7 `*Confirm:*` readings remain (L152 ×2, L161, L178, L180, L199, L201) although L149 says "Three readings".
27. **L24** `~40–80x` then `Optimize overall cost on that ratio (~50x)` — two target ratios in one bullet; a reader cannot tell which number bounds a design choice.
28. **L11** `It is not smart enough to decide how big "bigger" is — that is the architect's call.` — the front does choose bigger-vs-task (`front.ts:29-33`); only the extent inside bigger is the architect's. Wording implies the front cannot select `bigger`.
29. **L23/L178** `"Consider" spans the full range` / open question "what consider binds the architect to" — `plan:305` decides "one `forward` answer per finding", a policy the manifesto still lists as open. Intent gap with a plan-level answer.
30. **Undefined terms**: `slop` (L55), `scope` (L11 — goal class vs task-file globs), `consult` / `engagement` / `boundary` (L17,26,37,63), `park` vs `discard` (L79), `drain` (L58), `gate` (L75), `pin`/`promote` (L133), `land` (L38), `lines` (L32), `digest` (L131), `front agent` (L218), `ingestion` (L76), `top architect` (L42), `sub-epic` (L18), `DAG` (L63), `head-guard` / `record discipline` (L95), `capability-aware` (L39), `opaque config` (L84), `semantic diff` (L32), `wave` (L215 — defined but no mechanism), `milestone` (L213 — defined but no mechanism), `run config` vs `factory process config` (L75).
31. **Two-reader forks**: L12 (session vs alias), L36 (level counting), L50 (milestone object vs prompt), L57 (debt gate), L62 (summary vs remarkable), L76 (schema-as-config), L84 (opaque pass-through).

32. **L11** `For a task it defines the scope.` — "scope" is overloaded: the goal class's scope and a planned task's file globs (`tasks.ts:60`), and no intent rule says what a violation does (code parks `upscope`). A reader may enforce at the front, at review, or at merge.
33. **L12** `Trivial: the same agent implements.` — silent on whether trivial passes gates/review; as built: gates always, review never (`config/process.yaml:11-14`). Two readers build "gates + review" vs "gates only".
34. **L17** `Each architect consult starts a new iteration.` vs **L19** `Consulting the architect mid-iteration is the exception` — a mid-iteration consult would by definition start a new iteration; one statement must yield ("early boundary"). With hierarchy, iteration counting/limits are also undefined.
35. **L25** `the architect calls it, in advance or on review.` — the owner steer and the built PM ladder make escalation kernel-owned (`LOG:59`; `plan:166-180`; `pm.ts:292-360`), so "the architect calls it" is not the rule in practice for the PM role.
36. **L37** `task-level consults go to the architect responsible for that epic` — "consult" is overloaded (iteration engagement L17/L26, escalated item, mailbox steer), and L13 says a task never reaches the architect. Two readers route differently.
37. **L63** `In-flight tasks finish and park unmerged` — ambiguous: all in-flight or only those the steer holds; the code parks only the held task (`dispatch.ts:256-273`). The PM-failure/misclassification path is undefined.
38. **L79** `negative value → discard (parked until architect feedback)` — "discard" and "parked" contradict each other; the branch is kept and the slug parked (`flow.ts:88-96`), and kept branches are reused by `*-land` tasks. A reader may delete the branch.
39. **L80** `Concurrency: an absolute limit and limits per harness` — quota/rate limits are per provider+model, not per harness; the code keys `perHarness` (`config.ts:119`; `dispatch.ts:281`). Two readers build different limit keys.
40. **L116** `subarchitects can be subagents reachable through IRC — one strategy of the capability-aware layer, still owned by the script` — no mechanism records subagent turns, cost, limits or crash recovery; `Caps.subagents` is unused (`types.ts:16`). A reader may assume script-visible subagents.
41. **L89** `The entire factory is assumed to run inside a sandbox (e.g. bubblewrap); this is documented, not enforced.` — insufficient for a self-modifying system: package tests and the live run shared global tmp state twice (`LOG:208-210,239-240`). Isolation has to be per run, not ambient documentation.
42. **L55** `no new technical debt introduced, no slop introduced` — "slop" is undefined and the last review round may merge with recorded debt (L79), so the stop criterion cannot be met as a conjunction; a materiality threshold is missing.

## 4. Remaining to build (ranked)

| # | Item | Size | Depends on | Factory coverage (slug) |
|---|---|---|---|---|
| 1 | Task→bigger auto-escalation on reviewer/implementer upscope (L13) | S | `front-land` (merged) | `review-upscope` pending |
| 2 | Trivial "same agent" handoff: front target + pack as prompt var, drop cwd-bound resume (L12) | S | front path (merged) | `front-handoff` pending |
| 3 | Front goal status in `derive` (bug behind front ladder) | S | `steer-guards` | `front-status` pending |
| 4 | Advisory plan review by a weaker model (L23) | S | `doc-drift` | `plan-review` pending |
| 5 | Steer-turn guards: snapshot/restore, settle window, malformed holds, boundary→dispatch race (L63) | S | `pm-infra-stop` | `steer-guards` pending |
| 6 | PM infra rung ends the launch as infra (bug in ladder) | S | `pm-ladder-tidy` branch | `pm-infra-stop` pending |
| 7 | Hierarchy level 2: depth knob, epic fields, epic derive/packs/consult/PM/reporting (L36-38) | L | none (register parser merged) | `epic-plumbing` → `epic-derive`/`epic-packs` → `epic-consult`/`epic-pm` → `epic-reporting` (all pending) |
| 8 | Harness rotation across iterations (L84, L146) | M | `session-end-compact` (merged) | `rotation-threaded` pending (replaces parked `harness-rotation`) |
| 9 | Live pi/codex + rotation evidence; codex/Claude legs in a self run (L84, L138) | M | #8 | no task; operator run (`i12` owed) |
| 10 | Sandbox assumption documented (L89) | S | — | `operator-docs` pending |
| 11 | Usage + ideology docs; intent→evidence table; benchmark row wording (L131-133, goal intent:17) | M | docs tasks | `operator-docs`, `intent-evidence` pending |
| 12 | Run the fixed benchmark and compare with v2 baseline (L133) | M | benchmark kit (merged) | no task; operator step (`i12` owed) |
| 13 | LSP for plan/JSON in the orchestration folder (L85, L108) | S | — | none |
| 14 | Git cleanliness heuristic + agentic revision (L123) | M | — | none |
| 15 | Human-involvement presets or strike L97 | M | — | none |
| 16 | Cross-harness portability graph / one-way omp edges, or correct L30/L118 | M | #9 | none |
| 17 | Cache-retention as run config (L119) | S | — | none |
| 18 | Opaque harness config pass-through from run config (L84) | S | — | none |
| 19 | `done` gate on open debt/removers (L57) | S | — | none |
| 20 | Subscription-quota limit or strike L58 clause | S | — | none |

Cross-cutting: `doc-drift` (pending) fixes stale docs; `intent-evidence` (pending) is the natural owner of the matrix in part 1 once the gaps above are closed.
