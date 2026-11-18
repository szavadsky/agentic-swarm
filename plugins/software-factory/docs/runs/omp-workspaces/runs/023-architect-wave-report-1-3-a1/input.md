# Step: Architect Wave Report

## Goal
Evaluate the results of a completed execution wave, assess spike findings and accumulated debt, and decide the iteration path.

## Rules
- Exploration budget: evaluate wave progress from the current plan, wave report, spike findings, and the prepared context pack (`# Context Pack — `omp-workspaces` (factory.v2 spec items 19 + 20)

Repo: `agentic-swarm` (plugin root `plugins/software-factory`). Spec: `docs/factory.v2.md`.
All line numbers are repo-relative and verified against the current checkout.

---

## 0. Scope and headline

The two spec items are deliberately un-implemented in v2 and are the second self-hosted fire-test goal: `plugins/software-factory/docs/ARCHITECTURE.md:40` says **"Deliberately not hand-built … Current state: engine-managed worktrees (§7), item-level integrate step, in-process epics, schema-bound architect plan, no cache/compaction management; prior omp research in `docs/spikes/`."**

The engine today is a single Bun process that derives state from committed records + git, creates its own git worktrees, runs one omp process per agent turn with `--cwd <worktree>`, merges items serially at wave end, and runs epics in-process as child tasks. Items 19/20 ask to (a) move workspace isolation to omp's configurable backend by default, (b) harden preflight/lifecycle, (c) move commit content and merge escalation to agents, (d) make epics independent launches inside sagas, (e) add an audited cache/compaction policy for the architect, and (f) prove all of it with no-paid-model end-to-end tests through the real omp harness.

A fresh probe of the installed `omp` (`/home/slava/.bun/bin/omp`, version `18.18.5`) shows the mechanics the spec refers to **do exist** as configuration: `isolation.backend` (enum, default `rcopy`), `task.isolation.{enabled,apply,merge,commits}`, `worktree.{base,onStart,onExit,clone,cleanSource}`, `compaction.*`, and `providers.cacheWarming` / `providers.cacheRetention`. None of these keys is used by the factory today (`plugins/software-factory/src/harness/omp/overlay.ts:26-100`). See §5 for the probe log.

---

## 1. Acceptance definition (the two spec items)

### Item 19 — workspaces, merging, lifecycle (prefer omp over DIY) — `docs/factory.v2.md:104-113`

| # | Requirement (condensed) |
|---|---|
| 19.1 | Workspace isolation via **omp's configurable isolation backend by default**; engine git worktrees stay only as config option `isolation: omp | engine`; a spike settles backend config, branch/commit retention on failure, cwd, merge-back |
| 19.2 | Preflight verifies: compatible omp version + config (overlay keys, isolation backend usable via a **real throwaway round-trip**), every configured model/role resolvable, target git repo state (clean, branches/worktrees consistent with records), harness binaries |
| 19.3 | Idempotent tracking of tasks/workspaces/branches/commits derived from records + git; launchers: `status` (whole tree: saga/epics/tasks/items, workspace+branch per active agent, open questions), `cleanup` (finished workspaces), `gc` (orphaned workspaces/branches/runtime files, stale locks; **dry-run by default**); all safe when idle and **refusing while a run holds the lock** |
| 19.4 | Commit message and scope from agents' structured output (e.g. last review before commit summarizes the change) or omp mechanics; **engine never invents content** |
| 19.5 | Wave-end merge default: conflict-free → deterministic CI gates → merged; conflicts or red → **workhorse-class wave-end merger agent** resolves trivial conflicts → unresolvable → architect escalation carrying a pointer to overall status (one command/file) and the worktree + branch of the problematic item |
| 19.6 | Saga: each epic runs as an **independent factory launch in its own workspace** (parallel epics possible); merges inside an epic escalate to the epic architect; merging epics at saga wave end escalates to the saga architect |
| 19.7 | Docs show each use case: single task, story waves, epic, saga with parallel epics, conflict/escalation paths, status/cleanup/gc |
| 19.8 | "No models" tests: end-to-end through the **real omp harness with a scripted mock model provider** (no paid models), covering isolation, merges/conflicts/escalations, saga/epic launches, restart, gc |
| 19.9 | Repo rules hydration: omp does not put AGENTS.md in subagent context, so the factory hydrates repo rules itself for architect and every implementer-chain agent, verified end-to-end per role |

### Item 20 — architect context economy — `docs/factory.v2.md:114-120`

| # | Requirement (condensed) |
|---|---|
| 20a | Compact the architect session **before a resume that will miss the provider prompt cache** (TTL expired / model switched), so an uncached resume does not re-pay full history |
| 20b | Keep the prompt cache **warm while the architect is on standby** between turns, when cheaper than expected uncached resume; leverage omp mechanics |
| 20-cost | Decide defaults by **measured cost** (usage / cache-read tokens in records); each mechanism configurable, explicitly off where it does not pay |
| 20-plan | Re-evaluate v2's **schema-bound architect plan** against v1's schema-free telegraphic output + PM structuring (an expensive repair turn was observed) |
| 20c | Session launching must **never break the provider prompt cache**: additive sessions only, never rewrite a transcript, prompt prefixes byte-stable across turns (no timestamps/random/temp-path interpolation into the cached prefix), generated omp overlay byte-stable for the same config |
| 20d | Optional optimizations only after 20c holds: focused compaction/handoff summaries on resume, IRC escalation reply, restart — measured and configurable/off by default |

---

## 2. Module map

### 2.1 Layout and responsibilities

| Area | Files | Responsibility relevant to 19/20 |
|---|---|---|
| CLI | `plugins/software-factory/src/cli/{dispatch,run,preflight,status,steer,init,lock}.ts`, `bin/factory.ts` | Only `init|preflight|status|steer|run`; `run` = preflight → lock → engine; `status` is one-task |
| Engine | `src/core/engine.ts` (835 lines) | `runTask` main loop, `runChildTask` (epic in-process), start-up repair, simple path, task worktree bootstrap, epic wiring |
| Iteration/waves | `src/core/flows/iteration.ts` (3978 lines) | plan → review → PM → waves → wave-end merges → close-up → wave report; architect session id threading; consults/redrives |
| Item machine | `src/core/flows/item-machine.ts` (1113 lines) | per-item step sequence, fix rounds, consults, terminal states |
| Merge path | `src/core/flows/merge-path.ts` (422 lines) | per-item merge under a parent-keyed merge lock; conflict → `integrate`; gates/verify; attempt ledger |
| Consults | `src/core/flows/consults.ts` | architect item/non-item/concern consults (decision artifact), resume architect session |
| Epic propagation | `src/core/flows/epic-propagation.ts` | child concerns/remarkables/questions pushed to parent store/mailbox (`q-epic-*`) |
| Step runner | `src/core/flows/step-runner.ts` (1437 lines) | single agent turn: prompt, session reuse, record commit, checks, session-loss rehydration, transient retries |
| Git | `src/core/git/{worktrees,naming,merge,commit,repair,status,repo,exec,cleanliness,diff}.ts` | engine-managed worktrees, branch naming, merges, commits, HEAD guard, repair |
| Derive | `src/core/derive/{task,item,wave}.ts` | derived state from committed records + git (idempotent, restart-safe) |
| Records | `src/core/records/*` | YAML IO, step records, schema cache, repair, citations |
| Checks/gates | `src/core/checks/{gates,runner,junit,types}.ts` | deterministic gates, target-green/red, baseline ratchet |
| Config | `src/core/config/{loader,merge,validate,roles}.ts`, `config/*.yaml`, `config/schemas/*.json` | layered pipeline config, role resolution, structural validation |
| Harness | `src/harness/types.ts`, `src/harness/omp/{harness,overlay,ndjson,classify}.ts`, `src/harness/fake/*` | one omp process per turn; NDJSON parse; overlay; fake harness for tests |
| Prompts/agents | `agents/**`, `src/core/{prompts,prompt-vars,brief}.ts` | agent definitions, step fragments, prompt vars, architect brief |
| Docs | `docs/{ARCHITECTURE,IMPLEMENTATION,OMP_ADAPTER,FIRE_TEST}.md`, `docs/spikes/*.md` | build contract, current-state audit, omp adapter spec, prior omp spikes |

### 2.2 Execution topology today (relevant to all of item 19)

1. `factory run <task>` resolves the slug, copies an INTENT path into `{orch}/{task}/INTENT.md` in the **main checkout** if needed, runs preflight, acquires a **per-task** run lock, builds `OmpHarness` and `Repo`, then calls `runTask` (`src/cli/run.ts:27-135`).
2. `runTask` creates the task worktree on `topic/{task}` from main HEAD (INTENT committed there), repairs stray dirt, repairs item worktrees, marks interrupted records, reconciles concerns, then runs ingest/triage/infra/context-pack (`src/core/engine.ts:236-340`).
3. Each wave runs items concurrently up to `limits.maxParallelItems`; each item gets a child worktree (`{worktreeRoot}/topic_{task}--{item}`) and is ticked by `tickItemMachine`; epic items call `runTaskChild` **in-process** (`src/core/flows/iteration.ts:2432-2480`).
4. Wave end merges ready items serially through `mergeItem` under `repo.mergeLocks(parentBranch)`; on failure the engine consults the architect and re-drives, bounded by `merge-attempts.yaml` (`src/core/flows/iteration.ts:2706-2800`, `src/core/flows/merge-path.ts:131-170`).
5. Epic child task = child task dir under `{parentTaskDir}/{epic}`, its own iterations/waves on branch `topic/{parent}--{epic}`, then a `child-closeup.yaml` on the parent and the epic branch merged like any item (`src/core/engine.ts:123-226`).
6. Every agent turn is a separate omp process launched with `--cwd <worktree>`, `--config <overlay>`, `--session-dir <runtime>/sessions`, optional `--resume <id>`, `--system-prompt <file>`, `-p @<prompt-file>` (`src/harness/omp/harness.ts:356-410`).

---

## 3. Key interfaces & signatures

### Harness contract (`src/harness/types.ts:24-55`)
```ts
export interface Harness {
  run(l: AgentRun): Promise<AgentOutcome>;          // one turn (fresh or resumed)
  validateTools?(tools: string[]): Promise<string[]>;
  complete(c: { role; models; system; prompt; schema; timeoutSec?; timeoutMs?; onModelFallback? }): Promise<unknown>;
}
export interface AgentRun {
  agent; definition; prompt; role; models; tools;
  cwd: string;                 // worktree — engine-created today
  outputSchema; label;
  session: { resume?: string; keep: boolean };
  timeoutSec?; onModelFallback?; onSession?; onUsage?;
}
```
`AgentOutcome` carries `sessionId`, `traceRef`, `usage`, `transcriptBytes`, `stdoutBytes`, `toolCallCount`, and failure flags `transient|sessionLost|launchError|timedOut` (`src/harness/types.ts:57-82`).

### Engine entry points
- `runTask(deps: EngineDeps, task: string, opts?: { maxTicks?; maxIterations?; lockTakeoverEvent? }): Promise<RunResult>` — `src/core/engine.ts:236-247`; `RunResult = {status: done|blocked|failed|stopped, exitCode: 0|10|1, summary}` (`:61-65`).
- `runChildTask(deps, parent: {branch,path,taskDir}, epicSlug, opts?): Promise<RunResult>` — `src/core/engine.ts:123-226`.
- Engine deps: `{ harness, repo, project, pipelineFor(taskDir), prompts, clock?, log?, diskSpaceProbe? }` (`src/core/engine.ts:46-54`).

### Worktrees (`src/core/git/worktrees.ts`)
- `ensureTaskWorktree(repo, task, {intentPath, orchestrationFolder}): {branch, path, created}` — first run checks cleanliness except INTENT, `git worktree add -b topic/{task} <wt> HEAD`, writes+commits INTENT; idempotent (`:47-119`).
- `ensureChildWorktree(repo, parent:{branch,path}, slug, opts?): {branch,path,created}` — idempotent, prunes stale registrations, reuses branch, `git worktree add -b <child> <wt> <fromRef>` (`:122-168`).
- `removeWorktree(repo, wtPath)` — removes worktree, **keeps branch** (`:170-189`).
- `resetScratch(repo, parent, slug)` — removes branch+worktree and recreates from parent tip (`:191-224`).

### Branch naming (`src/core/git/naming.ts`)
- `taskBranch(task) => topic/{task}` (`:73-76`)
- `childBranch(parent, item) => parent--item`, max depth 2 (`:78-101`)
- `worktreePath(root, branch) => root/{branch with / → _}` (`:103-110`)
- `parseBranch` → `{task, items, depth}` (`:50-70`)

### Merge path (`src/core/flows/merge-path.ts`)
- `mergeItem(params: MergeItemParams): Promise<MergeItemResult>` — `:131-422`; params include `task,item,parentBranch,taskWt,childWt,repo,harness,pipeline,project,prompts,taskDir,wave?,targetOverride?,turnsSemaphore?` (`:20-49`).
- `MergeItemResult = {ok, sha?, error?, conflictResolved?, mergeAttempt?}` (`:51-58`).
- `MAX_MERGE_ATTEMPTS_PER_WAVE = 2`; ledger at `items/<slug>/merge-attempts.yaml`; per-wave target override at `items/<slug>/merge-target.yaml` (`:60-128`).

### CLI
- `dispatch(args): Promise<number>` switch over `init|preflight|status|steer|run` (`src/cli/dispatch.ts:110-176`).
- `runStatus({repoRoot, task})` — one task; resolves its single worktree (`src/cli/status.ts:26-80`).
- `acquireRunLock(repoRoot, task, opts?)` / `isRunLockFree(...)` / `resolveRuntimeDir(repoRoot, worktreeRoot?)` (`src/cli/lock.ts:21-170`).

### Config types
- `ProjectConfig { orchestrationFolder, adrFolder?, worktreeRoot, scripts?, paths?, skillDirs? }` (`src/core/artifacts.ts:11-22`).
- `PipelineConfig { models, agents, checks?, hooks?, flows, limits, budget?, diversity?, harness?: string, humanInvolvement?, concerns?, reviewPolicy?, criteria?, contextPack?, tools?, prompts? }` (`src/core/artifacts.ts:117-160`).
- `TaskKind = simple|story|spike|epic|saga` (`src/core/artifacts.ts:166`).
- `StepUsage = {inputTokens?, outputTokens?, costUsd?}` (`src/core/artifacts.ts:545-549`), recorded in every step `meta.yaml` (`:551-568`).

### Derived state
- `DerivedTaskState` (task, kind, status `active|blocked|done|failed`, iteration, currentWave, items/itemMap, waves, debt, budget/spend maps, runningSteps, concerns, openSteerQuestions, strandedItems, failureDetails) — `src/core/derive/task.ts:60-85`.
- `deriveTaskState({taskDir, task, parentBranch?, taskWt, pipeline?, project?})` — `src/core/derive/task.ts:140-147`.
- `DerivedItemState.status = pending|running|ready|merged|failed|blocked|superseded` — `src/core/derive/item.ts:41`.

---

## 4. Relevant excerpts

### 4.1 Engine-managed task worktree (the `isolation: engine` backend to preserve)
`plugins/software-factory/src/core/git/worktrees.ts:47-119`:
```ts
// first run: main checkout must be clean except INTENT
const dirty = findDirtyEntries(entries, { orchestrationFolder, currentIntentPath: relIntent });
if (dirty.length > 0) throw new Error(`Main checkout is dirty ...`);
...
await repo.writeLock.runExclusive(() =>
  git(repo.mainRoot, ["worktree", "add", "-b", branch, wtPath, "HEAD"])
);
```
Idempotence and stale-registration pruning are explicit (`:14-44`, `:60-72`, `:126-168`). This is the code the spec's `isolation: engine` option must keep behind a config switch.

### 4.2 Epic child task is in-process (the model to replace for sagas)
`plugins/software-factory/src/core/engine.ts:123-145`:
```ts
export async function runChildTask(deps, parent, epicSlug, opts?) {
  const parentBranch = parent.branch;
  const childBranchName = childBranch(parentBranch, epicSlug);
  const childWtInfo = await ensureChildWorktree(repo, parent, epicSlug);
  const childTaskDir = path.join(childWt, orchFolder, parentTaskSlug, epicSlug);
```
Child iterations run on `parentBranch = childBranchName` (`:166-182`); then concerns propagate, `child-closeup.yaml` is written on the parent, and the parent branch commits the record (`:186-212`). The child is launched from the wave loop only when `it.kind === "epic" && runTaskChild` (`src/core/flows/iteration.ts:2440-2450`), wired in `runTask` at `src/core/engine.ts:750-767`. `docs/IMPLEMENTATION.md:150-173` states the saga gap explicitly: *"NOT IMPLEMENTED: saga launches do not exist in code … no saga launcher/loop exists … defers this to the `omp-workspaces` fire-test goal."*

### 4.3 Wave-end merge, gates, and the current "merger"
`plugins/software-factory/src/core/flows/merge-path.ts:176-245` — on parent→child conflict the engine runs an `integrate` step with:
```ts
stepId: "integrate", stepFragment: "steps/integrate",
agent: "developer", role: "workhorse",   // <-- no dedicated wave-end merger agent
```
Then `concludeMerge` commits the resolution (engine stages, agent may not run git writes). If the tree changed, gates and target-green run (`:246-380`); any failure returns `ok:false` with evidence. Success merges child into parent with `--no-ff`, removes the worktree (branch kept), runs `after:item.merge` hooks (`:381-422`).

The wave loop calls this per ready item, then on failure calls `redriveMergeAfterConsult` which runs an architect consult and retries the merge, bounded by the attempt ledger: `src/core/flows/iteration.ts:2706-2800` (call), `:650-710` (helper). The consult input has assignment/priorAttempts/diff/feedback/debt/contextPack only — **no worktree or branch pointer**: `src/core/flows/consults.ts:110-136`; prompt fragment `agents/steps/architect-consult-item.md:1-40`. The status block the architect sees also lacks workspace/branch: `src/core/flows/iteration.ts:177-215`.

### 4.4 Preflight — what is actually verified today
`plugins/software-factory/src/cli/preflight.ts:129-235` loads project config, warns on linter configs, checks first-run cleanliness (only when the task branch does not exist), loads/validates the layered pipeline, checks disk space (`limits.minFreeDiskMb`). `:250-290` resolves roles/aliases and checks agents reference declared roles. `:292-360` renders prompt fragments and compiles all schemas. `:364-394` validates omp:
```ts
execFileSync(ompBinary, ["--version"], ...);
writeOmpConfigOverlay(pipelineConfig, tempOverlay);
execFileSync(ompBinary, ["--config", tempOverlay, "--version"], ...);
```
with a hard-coded last-resort path `/home/slava/.bun/bin/omp` (`:365-369`). `:399-414` checks the per-task run lock. There is **no isolation round-trip, no cross-check of branches/worktrees against records, and no model-name resolution against omp** (only role alias resolution).

### 4.5 CLI/status/lock — single-task today
`src/cli/status.ts:26-80` resolves one task dir (task worktree if present, else main), calls `deriveTaskState`, and prints worktree/config/budget/running steps/waves/items/questions/debt (`:59-170`). `src/cli/lock.ts:21-44` puts runtime state at `{worktreeRoot}/.factory-runtime`; locks at `{runtimeDir}/locks/{task}.lock` (`:45-55`); `isRunLockFree` and `acquireRunLock` implement same-host dead-PID takeover (`:57-246`). There is no task enumeration anywhere in `src/cli` (only `readdir` of config/schema dirs, `src/cli/preflight.ts:74,349`), so whole-tree status has no existing discovery layer.

### 4.6 Harness launch and cache-relevant transport
`src/harness/omp/harness.ts:286-300` — system prompt path is deterministic per agent+session:
```ts
const sessionKey = (run.session?.resume ?? "fresh").replace(...);
const systemPromptPath = path.join(systemPromptsDir, `${sanitizedAgent}-${sessionKey}.md`);
fs.writeFileSync(systemPromptPath, agentBody, "utf8");
```
`src/harness/omp/harness.ts:311-316` — prompt file name **embeds timestamp + randomness on every turn**:
```ts
const promptPath = path.join(promptsDir, `prompt-${Date.now()}-${Math.random()...}.txt`);
```
Args (`:368-388`): `--cwd run.cwd --config overlay --mode json --model <@role> --session-dir <dir> [--resume id] --tools=... --system-prompt <file> -p @<promptFile>`. Spawn cwd is the worktree (`:400-410`). No isolation/worktree flag is passed.

`src/core/flows/step-runner.ts:606-620` decides session reuse (`keep = sessionMode==="reuse"`, resume interrupted record or existing id); on `sessionLost` it retries once with a fresh session and the **full prompt**, not a rehydrated prefix (`:967-1000`); `PersistentAgent` does the same with an optional `rehydrate()` prefix (`src/core/sessions.ts:110-138`).

### 4.7 Architect planning, brief, wave report
- Plan turn: fresh plan or reuse session; `buildArchitectBrief` is called for a fresh brief even on resume (`src/core/flows/iteration.ts:1155-1235`); plan step uses `sessionMode: "reuse"`, `existingSessionId: architectSessionId`, fragment `steps/architect-plan` (`:1223-1290`). A limits violation triggers one resumed repair turn on the same session (`:1299-1370`).
- Wave report resumes the architect, injects `plan/waveReport/debt/steering/contextPack/taskStatus`, and the report fragment decides continue/amend/end (`:3089-3180`).
- `buildArchitectBrief` = deterministic one-line skeleton + a `@simpler` relevance judge returning `{include:[ids]}`, fail-open to the full skeleton (`src/core/brief.ts:1-14`, `:340-420`). This is the existing **cheap handoff** mechanism that item 20a/20d can build on.
- Architect output is schema-bound: `agents/steps/architect-plan.md:20` ("yield the plan matching `plan.schema.json`"); `config/schemas/plan.schema.json:4-6` requires `iteration, milestones, itemOutlines`; PM then structures item edits from plan outlines (`agents/steps/pm-edits.md:1-25`, `src/core/plan/apply.ts:1-16`).

### 4.8 Usage/cost parsing drops cache tokens
`src/harness/omp/ndjson.ts:84-98`:
```ts
const u = event.message.usage;
this.inputTokens += u.input || 0;
this.outputTokens += u.output || 0;
const costVal = u.cost?.total ?? ((u.cost?.input || 0) + (u.cost?.output || 0));
this.costUsd += costVal || 0;
```
`cacheRead`, `cacheWrite`, `totalTokens`, and cost sub-fields are ignored; `src/harness/omp/ndjson.ts:170-178` emits only `{inputTokens, outputTokens, costUsd}`; `src/core/artifacts.ts:545-549` and `src/core/budget.ts:34-48` sum only those three. The raw omp NDJSON **does** carry them: fixtures `test/fixtures/omp/turn-fallback.ndjson:7` (`"cacheRead":0,"cacheWrite":0,...cost.cacheRead`), and the prior spike documents `usage.cacheRead` as available (`docs/spikes/omp-2-cli-adapter.md:100-104`). So 20-cost cannot be implemented without extending `Usage`/`StepUsage` and the parser (and updating records/budget tests).

### 4.9 Commit content is engine-authored
`src/core/git/commit.ts:9-30` — `commitAll(repo, wt, message, {allowEmpty?, paths?})`; `paths` is the available scope mechanism. Call sites invent messages: step records `factory(...): <step> aN [started|error|rejected|session]` (`src/core/flows/step-runner.ts:697-760`, `:572`, `:807`, `:1400-1410`), plan edits `factory: apply plan edits iteration N` (`src/core/flows/iteration.ts:1914,1944`), epic close-up `factory: record epic <slug> child status ...` (`src/core/engine.ts:209`), merge `factory: merge item <slug>` (`src/core/flows/merge-path.ts:384-390`). Agent output schemas carry `summary` (`config/schemas/review.schema.json:6-12`, `config/schemas/developer-output.schema.json:6-14`) but no commit message/scope field.

### 4.10 Concern propagation and escalation vocabulary
`epic-propagation.ts:20-33` documents "Epic-to-saga concern push": open/routed child concerns + open remarkables are condensed, questions with `blocks` are forwarded to the parent mailbox as `q-epic-<epic>-<id>` (`:116`). The actual parent is the enclosing task; there is no distinct saga architect. `buildTaskStatusBlock` lists items/waves/merged/blocked/failed and both task/root question dirs (`src/core/flows/iteration.ts:195-220`).

### 4.11 Config surface where `isolation` must land
- `config/schemas/pipeline.schema.json:6-7` requires `models, agents, flows, limits`; `:208-210` declares `harness` as a **string**; `:305` sets root `additionalProperties: false`.
- `config/schemas/project.schema.json:52` is also `additionalProperties: false`.
- `config/pipeline.default.yaml`: models/roles `:40-104`, agents `:106-141`, checks/hooks `:172-195`, flows `:241-330`, limits `:342-390`, harness `:406`, humanInvolvement `:449`.
- Loader merge/validate: `src/core/config/loader.ts:68-150` (defaults → project → task → overrides, AJV, structural).
So adding `isolation` (or changing `harness` to an object) requires schema + `PipelineConfig` type + default YAML + overlay generation, or it fails validation at load.

### 4.12 Existing omp cache/compaction knobs are config-only
`src/harness/omp/overlay.ts:26-100` emits only `modelRoles`, `retry.*`, `eval.autoBackground`, `title.generator`, `checkpoint.enabled`, `advisor`, `bash.gitGuard/allowCompoundCommands`, `mnemopi.*`, `update.auto`. It emits **none** of the omp keys discovered in §5 (`isolation.backend`, `task.isolation.*`, `worktree.*`, `compaction.*`, `providers.cacheWarming/cacheRetention`). Overlay is regenerated per turn from the effective pipeline (`src/harness/omp/harness.ts:222-240`).

---

## 5. omp isolation mechanics — evidence log

### 5.1 Prior research (repository docs)
- `docs/spikes/omp-1-topology.md:189-215` — empirical comparison:
  - omp `isolated: true` hardcodes branch `omp/task/<agentId>`, has no `cwd`, needs `apply:false` (not `merge:false`) to avoid applying to parent, and **"if the subagent fails or rejects (`exitCode !== 0`), `commitToBranch` is completely skipped; no branch commits are captured on failure/rejection, and the temporary isolation worktree is deleted"** (`:196-201`).
  - Engine-created `git worktree add -b topic/x/y` + `omp --cwd <wt>` keeps **all** files/commits regardless of exit status (`:205-213`).
  - Recommendation: hybrid external Bun CLI + omp headless adapter with engine-managed worktrees (`:347-395`).
- `docs/spikes/omp-2-cli-adapter.md:114-158` — `--session-dir` + `--resume` append to the same transcript; cwd persists in the session header; model switch on resume is allowed. `:160-218` — overlay with `modelRoles`, fallback chains, unattended switches; `:245-270` — four concurrent omp processes in four worktrees, no lock contention, ~0.8–1.2 s startup, SIGTERM 143 with partial session flush.
- `docs/OMP_ADAPTER.md:164-172` — cache-safety audit claim: additive resumes, byte-stable system prompt content, "only transport filenames embed timestamps", deterministic overlay. **It does not test omp's cache keying; it flags `--system-prompt` path-keying as unknown.**

### 5.2 Fresh read-only probes on the installed omp 18.18.5
These are execution probes (no repository edits, no omp config writes):

| Probe | Result |
|---|---|
| `omp --version` | `omp/18.18.5` (README requires v18.17.0+: `plugins/software-factory/README.md:14-18`) |
| `omp config get isolation.backend --json` | `{"value":"rcopy","type":"enum","description":"Backend used for subagent isolation and worktree cloning"}` — **no enum values exposed** |
| `omp config get task.isolation.*` | `enabled=true`, `apply=true` ("apply successful isolated task changes to parent"), `merge="branch"` (patch apply or branch merge), `commits="ai"` (generic or AI-generated commit messages) |
| `omp config get worktree.*` | `base` unset → `~/.omp/wt`; `onStart=off`; `onExit=remove`; `clone=true` (copy-on-write clone so `node_modules`/`target` carry over); `cleanSource=false`; `session.worktreeScope=repo` |
| `omp worktree --help` | `omp worktree [list|clear|add] [PATH] [COMMIT]` with `-b/-B/-C`, `--dry-run`, `--all`, `--json`. `clear --dry-run` prints what would be removed; `add -b feature ../path` creates a branch+worktree |
| `omp worktree list --json` | Entries carry `{path, kind:"task-isolation", orphanReason:"task-isolation leftover (no live task owns it)"}` — omp already has orphan classification |
| `omp --config <overlay with bogus keys including isolation.backend: definitely-not-a-backend> --version` | Prints `18.18.5`, **exit 0** — this probe validates nothing about overlay keys/values |
| `omp --config <overlay with title.generator:none, compaction.idleEnabled:true> config get title.generator` / `compaction.idleEnabled` | `tiny` / `false` — `omp config get` reports **persisted** config and ignores `--config`; it cannot be used to validate an overlay |
| `omp config list --json` (filtered) | `compaction.enabled=true`, `compaction.asyncEnabled=true`, `compaction.idleEnabled=false`, `compaction.idleThresholdTokens=200000`, `compaction.idleTimeoutSeconds=300` ("with a 1-hour prompt cache, compaction instead runs just before the cache expires"), `compaction.keepRecentTokens=20000`, `compaction.methodOrder=[remote,snapcompact,handoff,shake,soft]`, `compaction.handoffSaveToDisk=true`, `compaction.dropUseless=true` ("cache-aware"), `compaction.supersedeReads=true` ("cache-aware"), `providers.cacheRetention=short`, `providers.cacheWarming=streaming` ("Re-send the last request with a one-token output budget shortly before its prompt-cache entry expires"), `display.cacheMissMarker=true` |
| `omp models --help` | Supports `-e/--extension` and `--config` when listing models — the plausible seam for a scripted provider extension |
| `omp --help` | No `--isolated`/isolation flag; isolation is config-driven. `--cwd`, `--session-dir`, `--resume`, `--config`, `--system-prompt`, `--no-session`, `--no-tools`, `--tools`, `--extension` exist |

### 5.3 What this proves / does not prove

**Proven:**
- omp exposes a configurable isolation backend (`isolation.backend`, default `rcopy`) and per-task isolation controls; the phrase in its own description ties the backend to *"subagent isolation and worktree cloning"*, i.e. it governs omp-managed worktrees as well as subagent tasks.
- omp has first-class worktree lifecycle commands (`worktree add|list|clear --dry-run`) with ownership/orphan metadata — a ready-made primitive for `cleanup`/`gc` of omp workspaces.
- omp exposes native compaction and prompt-cache-warming knobs, which item 20 can configure instead of building from scratch.
- `omp --config … --version` is not a config validator; `omp config get` cannot see an overlay.

**Not proven (spike items):**
- The allowed values of `isolation.backend` and whether `rcopy`/others affect retention on failure; whether `omp worktree add` honors it exactly like subagent task isolation.
- Whether a **root** omp process launched with `--cwd <omp-created worktree>` can use `isolated: true` meaningfully (factory agents do not spawn subagents; prompts forbid it), i.e. which omp mechanism maps to "workspace isolation" for factory agents.
- Whether omp `--config` fully accepts these keys at runtime (no validation error ≠ applied; `config get` ignores overlays, so only a real turn can prove it).
- Whether omp prompt caching keys on content or on transport path (`--system-prompt <path>`, `-p @<timestamped-path>`), which determines item 20c.
- How to register a scripted mock provider (extension API shape, catalog registration, streaming NDJSON contract).

---

## 6. Gap matrix — spec bullet vs current state

| Spec | Current state (evidence) | Missing work | Likely touchpoints |
|---|---|---|---|
| 19.1 isolation backend default + `isolation: omp|engine` + spike | Engine-only worktrees; no isolation key in schema/types/overlay; harness passes no isolation flags (`src/core/git/worktrees.ts:47-224`, `src/harness/omp/harness.ts:368-388`, `config/schemas/pipeline.schema.json:208,305`) | Spike + config field + backend abstraction (create/remove/retain workspace) + overlay keys + preflight compatibility | `src/core/engine.ts:266-272`, `src/core/flows/iteration.ts:2455-2470`, `src/core/git/worktrees.ts`, new workspace module, `config/pipeline.default.yaml`, `config/schemas/pipeline.schema.json`, `src/harness/omp/overlay.ts` |
| 19.2 preflight | Version + inert overlay check, role aliases, prompts/schemas, disk, per-task lock (`src/cli/preflight.ts:129-414`) | Isolation round-trip; real model/role resolvability; branches/worktrees-vs-records consistency; harness binaries beyond omp; remove hard-coded omp fallback | `src/cli/preflight.ts`, `src/core/git/{status,worktrees}.ts`, `src/core/config/roles.ts` |
| 19.3 whole-tree status / cleanup / gc + lock refusal | `status` one task; no `cleanup`/`gc` commands; per-task locks; runtime dirs `sessions/`, `prompts/`, `system-prompts/` never purged (only `tmp/` is: `src/core/runtime-tmp.ts:16-45`); orphan detection helpers partially exist (`parseWorktreeList` `src/core/git/status.ts:64-71`, `removeWorktree`) | Task/workspace index derived from records+git; saga/epic parent links; active-agent workspace+branch; cleanup semantics; gc orphan worktrees/branches/runtime/locks, dry-run default; lock guard across the whole tree | `src/cli/dispatch.ts:110-176`, `src/cli/status.ts`, `src/cli/lock.ts:21-95`, new `src/cli/{cleanup,gc}.ts`, `src/core/derive/task.ts`, `src/core/git/status.ts` |
| 19.4 commits from agent output | All messages engine-authored; `commitAll` accepts message + `paths` scope only (`src/core/git/commit.ts:9-30`; call sites in §4.9) | Commit message/scope fields in output schemas + prompts; thread them to step/merge commits; fallback rule (engine may only use agent-provided or mechanical text) | `config/schemas/review.schema.json`, `config/schemas/developer-output.schema.json`, `agents/steps/review.md`/`develop.md`, `src/core/flows/step-runner.ts:714-760`, `src/core/flows/merge-path.ts:381-422` |
| 19.5 wave-end merge + workhorse merger + escalation pointers | Merge already runs at wave end with deterministic gates; conflict handled by `developer` step `integrate`; failure → architect consult with evidence but no status/worktree/branch pointer; attempts bounded 2/wave (`src/core/flows/merge-path.ts:176-422`, `src/core/flows/iteration.ts:2706-2800,650-710`, `src/core/flows/consults.ts:110-136`) | Dedicated workhorse-class wave-end merger agent (trivial conflicts only) + prompt fragment; escalation payload with one-command status pointer and worktree+branch; contract tests | new `agents/wave-merger.md` + step fragment, `src/core/flows/merge-path.ts`, `src/core/flows/consults.ts`, `agents/steps/architect-consult-item.md`, `src/core/flows/iteration.ts:177-215` |
| 19.6 saga independent launches, parallel epics, escalation split | `saga` only a `TaskKind` (`src/core/artifacts.ts:166`, `config/schemas/triage.schema.json`); epics in-process (`src/core/engine.ts:123-226`); epic INTENT written under the **parent task dir on the parent branch** (`src/core/plan/apply.ts:9-16`), so `factory run <epic>` cannot resolve it from main; `q-epic-*` goes to the enclosing task, not a saga architect (`src/core/flows/epic-propagation.ts:20-33,116`) | Saga launcher (spawn independent `factory run` per epic in its own workspace), parent/saga identity+links, per-workspace locks, saga wave-end merge/escalation to saga architect, concern funnel upward | new saga/workspace orchestration module, `src/cli/run.ts:55-135`, `src/cli/dispatch.ts`, `src/core/flows/epic-propagation.ts`, `src/core/git/naming.ts:73-101` |
| 19.7 docs per use case | Existing ARCHITECTURE/IMPLEMENTATION/OMP_ADAPTER/FIRE_TEST; no use-case doc; docs sentinel test convention exists (`test/docs-concerns.test.ts:1-50`) | New/updated docs for single task, story waves, epic, saga+parallel, conflict/escalation, status/cleanup/gc + sentinel test | `plugins/software-factory/docs/*`, `test/docs-*.test.ts` |
| 19.8 no-model e2e through real omp | Only `FakeHarness` engine tests + one live smoke gated by `FACTORY_LIVE_OMP=1` (`test/harness/smoke-live.test.ts:9-12`); harness can take an alternative `ompBinary` (`src/harness/omp/types.ts:4-15`, precedent `test/engine/model-fallback.test.ts:44-53`) | Scripted mock model provider usable by real omp; e2e scenarios (isolation, merges/conflicts/escalations, saga/epic launches, restart, gc) without paid models | new harness test fixture/provider extension, `test/e2e/**`, `OmpHarness` options, possibly `src/harness/omp/overlay.ts` |
| 19.9 repo rules hydration | No `AGENTS.md`/rules handling anywhere in `src/` (grep); `PROMPT_VAR_DESCRIPTIONS`/`KNOWN_VARS` have no repo-rules var (`src/core/prompt-vars.ts:9-60`) | Deterministic repo-rule resolution from target repo; inject into architect + developer/qa/reviewer prompts across items/epics; verify per role | `src/core/prompts.ts`, `src/core/prompt-vars.ts`, `src/core/flows/step-runner.ts`, `agents/*.md`, preflight render checks |
| 20a compact before uncached resume | No cache awareness; resume threads a session id; on loss it starts fresh with full prompt (`src/core/flows/step-runner.ts:967-1000`); a deterministic brief already exists (`src/core/brief.ts:1-14,340-420`); omp `compaction.*` exists but is unused | Detect cold-cache resume (TTL/model switch), compact or switch to fresh+hydrated brief, measure cost delta | `src/harness/omp/harness.ts:286-351`, `src/core/flows/step-runner.ts:606-620`, `src/core/brief.ts`, `src/harness/omp/overlay.ts` |
| 20b warm cache on standby | Architect process exits every turn; no standby; `providers.cacheWarming` unused | Decide mechanism (long-lived/keepalive process vs omp warming config), measure vs uncached resume, config gate | `src/harness/omp/harness.ts`, `src/core/flows/iteration.ts` (architect turns), overlay |
| 20c cache-coherence audit | Additive `--resume`; deterministic system-prompt path; **timestamp+random prompt path every turn** (`harness.ts:311-316`); overlay regenerated per turn from config (`harness.ts:222-240`); no byte-stability test | Audit omp cache keying; make transport paths stable or prove content keying; add byte-stability tests for overlay/system prompt/prompts across turns | `src/harness/omp/harness.ts`, `src/harness/omp/overlay.ts`, `test/harness/*` |
| 20d optional optimizations | None | Handoff/compaction on resume, IRC escalation reply, restart | `src/core/brief.ts`, `src/core/flows/step-runner.ts`, overlay |
| 20-cost measurement | `Usage`/`StepUsage` only input/output/cost; parser drops `cacheRead/cacheWrite/cost.cacheRead` (`ndjson.ts:84-98,170-178`, `artifacts.ts:545-549`, `budget.ts:34-48`) | Add cache token fields end-to-end + records/derive/status/budget aggregation; use for defaults | `src/harness/types.ts:7-11`, `src/harness/omp/ndjson.ts`, `src/core/artifacts.ts:545-549`, `src/core/budget.ts`, `src/core/derive/task.ts`, `config/schemas/state.schema.json` |
| 20-plan schema-free architect vs PM structuring | Plan is schema-bound (`config/schemas/plan.schema.json`, `agents/steps/architect-plan.md:20`); PM already structures outlines into scheduled items (`agents/steps/pm-edits.md:1-25`) | Re-evaluate from measured plan-repair turns; possibly telegraphic plan + PM structuring of plan/edits | `agents/steps/architect-plan.md`, `agents/steps/pm-edits.md`, `src/core/plan/*`, `config/schemas/*` |

---

## 7. Existing tests & conventions

**Runner and gates**
- `bun test` (Bun test runner, no config file), `bun run typecheck` (`tsc --noEmit`) — `plugins/software-factory/package.json:11-13`; strict TS incl. `noUncheckedIndexedAccess` (`plugins/software-factory/tsconfig.json`). The repo's own gate hints are in `.factory/project.yaml` `scripts.setup/typecheck/test`.
- Tests live under `test/**/*.test.ts` and import source directly; no mocks for git or filesystem.

**Core helpers**
- `createTmpRepo()` builds a real temporary git repo, tracks worktrees, commits with fixed identity, and cleans up on exit (`test/helpers/tmp-repo.ts:1-90`).
- `FakeHarness` scripts outcomes **by exact `AgentRun.label`**, records all calls, models sessions and `sessionLost` (`src/harness/fake/fake-harness.ts:35-125`). This is how all engine-level behavior tests avoid models.
- Worktree behavior is tested against real git: `test/git/worktrees.test.ts:1-60` (first-run cleanliness, idempotence, child worktrees, removal preserving branch).

**Behavior test patterns relevant to 19**
- Epic execution end-to-end with FakeHarness, asserting branch existence, child-closeup, derived item status `merged`, and merged file content: `test/engine/epic-child-task.test.ts:78-218`.
- Merge conflict → integrate resolution: `test/engine/merge-conflict.test.ts:1-50`; merge gate evidence/attempt ledger: `test/engine/merge-gate-evidence.test.ts`; redrive/stranded: `test/engine/merge-redrive-stranded.test.ts`.
- Crash/restart record repair: `test/engine/crash-restart.test.ts:1-50`; derived state: `test/engine/derive-gaps.test.ts`.
- CLI output/exit conventions: `test/cli/cli.test.ts:1-70` (arg parsing, lock lifecycle), `test/cli/status-concerns.test.ts:1-50` (capture `console.log/error` into a string, assert sections).
- Docs closure sentinel: `test/docs-concerns.test.ts:1-50` — asserts needles inside named doc sections/YAML commentary blocks so docs edits are test-enforced. Reuse this for the 19.7 use-case docs.
- Live omp tests are opt-in only: `FACTORY_LIVE_OMP=1 bun test test/harness/smoke-live.test.ts` (`test/harness/smoke-live.test.ts:9-12`).
- Process-level harness tests substitute a mock `ompBinary` shell script (`test/engine/model-fallback.test.ts:44-53`, `test/harness/omp-harness.test.ts:84-90,286-311`) and assert classification/timeout/session behavior. For 19.8 this is the precedent for a scripted provider, but the spec requires going through **real omp**, so a mock *binary* alone will not satisfy it.

**Conventions to follow**
- Behavior tests only: assert committed records, `journal.ndjson` events, git graph/worktree state, CLI output — not private helpers.
- Every engine decision is journaled (`appendJournal`) and records are committed before/after each step; new features should add journal events + record artifacts so restart/derive tests can prove idempotence.
- Schemas are draft-07 with `additionalProperties:false`; optional new fields are backward-compatible, required fields are not.
- Preflight validates every prompt fragment against `KNOWN_VARS` and renders with sample vars (`src/cli/preflight.ts:292-360`), so new prompt variables/fragments must be registered in `src/core/prompt-vars.ts`.

---

## 8. Open questions & spike outlines (for the architect)

### Isolation semantics (must settle before 19.1 design)
1. **Isolation backend contract.** `isolation.backend` is an enum defaulting to `rcopy`; what are the values, and does it control (a) subagent task isolation only, (b) `omp worktree add` cloning, or both? Probe candidate: throwaway profile (`--profile`) + `config set`, then a temp repo `omp worktree add -b topic/probe <tmp> HEAD`, inspect branch/commits, then `omp worktree clear --dry-run`.
2. **Retention on failure.** Prior spike proves `isolated:true` discards branch commits on non-zero exit (`docs/spikes/omp-1-topology.md:201`). Does an omp-managed worktree via `omp worktree add` + `omp --cwd` retain everything like engine worktrees? Test with a failing/aborted turn.
3. **Root-process isolation.** Factory agents are top-level omp processes, not omp subagents. Which omp mechanism is the "workspace" for such a process — `omp worktree add` + `--cwd`, `--add-dir`, or `task.isolation`? Document the mapping and the fallback to `isolation: engine`.
4. **Merge-back ownership.** omp has `task.isolation.{apply,merge,commits}`; the spec still requires deterministic CI gates and wave-end merger. Decide whether omp ever performs the merge (then gates) or only creates workspaces and the engine keeps merging. Evidence needed: can omp's `commits: ai` produce a usable message from structured output, or is it generic?
5. **Config validation.** `omp --config ... --version` accepts bogus keys (probe), and `omp config get` ignores overlays. A real preflight round-trip must actually launch omp. Define the cheapest safe probe (e.g. `omp -p --no-session --tools= --model @role "reply OK"` in a temp clone, or an `omp worktree add`-based round-trip).
6. **Model/role resolvability.** `omp models ls --json` (with `-e`) may enumerate catalogs; overlays define `modelRoles`. Determine whether any CLI validates `--model @role` + overlay without a paid turn; otherwise preflight can only resolve roles structurally (current behavior) plus a first-turn fallback.

### Lifecycle (19.3)
7. **Index source.** Derive the whole tree on demand from `{orch}/*/INTENT.md`, `items/*/child-closeup.yaml`, `journal.ndjson`, task dirs and `git worktree list --porcelain` (`parseWorktreeList`, `src/core/git/status.ts:64-71`), or persist a registry file? The spec says "derived from records + git" and "idempotent", which favors on-demand derivation; a registry risks drift.
8. **Parent links.** Epic child dirs are nested under the parent task dir but live on the parent branch; saga→epic links are only implicit in `plan.epics` (`config/schemas/plan.schema.json:85-95`) and `child-closeup.yaml`. Define the link record used by status/gc/escalation.
9. **Cleanup vs gc semantics.** `cleanup` = finished (merged/done) workspaces; `gc` = orphaned worktrees/branches/runtime files/stale locks, dry-run default. Which branches are deletable (merged only? superseded? failed after N days?), and how to treat omp-managed worktrees (`kind: task-isolation`, `orphanReason`) vs engine worktrees. `removeWorktree` keeps branches (`worktrees.ts:170-189`); `omp worktree clear` removes omp-owned ones.
10. **Lock refusal across a tree.** Locks are per task (`src/cli/lock.ts:45-55`). Whole-tree commands must refuse if *any* run lock is live; parallel epics need per-workspace locks plus a saga-level coordination lock (merge/status writes). Dead-PID takeover exists only per file (`:57-95,109-246`).

### Saga (19.6)
11. **Launch mechanics.** Each epic = independent `factory run` in its own workspace. Today `factory run <epic>` cannot resolve an epic INTENT because `resolveTaskSlug`/`runFactory` copy INTENT from the **main checkout** into `{repoRoot}/{orch}/{epic}/INTENT.md` (`src/cli/run.ts:27-75`), while epic INTENT lives under the parent task dir on the parent branch (`src/core/plan/apply.ts:9-16`). Decide: new `factory run --parent <task> --workspace <path> <epic>` or a saga launcher that spawns children with explicit INTENT path/branch.
12. **Process orchestration.** Who supervises child factories (exit codes 0/10/1), restarts, and parallelism? How are child stdout/journal/status surfaced to the saga status command? How do saga wave-end merges happen — the saga architect merges epic branches onto a saga branch, or epics merge directly to main?
13. **Escalation split.** Inside an epic, merge escalation must reach the epic architect (currently parent task architect for all items, `src/core/flows/iteration.ts:650-710`); at saga wave end it must reach the saga architect. Define the architect-session/ownership map per workspace and how consults are routed.

### Cache/compaction (item 20)
14. **Cache-key audit.** Determine whether omp caches on message content or transport path. Concrete suspicion: the per-turn prompt file path `prompt-<ts>-<rand>.txt` (`harness.ts:311-316`) and regenerated overlay (`harness.ts:222-240`). Add a test that renders the same prompt twice and compares system-prompt bytes, overlay bytes, and argv (the only unstable part should be the prompt filename; then verify omp behavior with a live probe using `providers.cacheRetention`/`display.cacheMissMarker`).
15. **Compaction mechanism.** omp auto-compacts inside a session (`compaction.*`); there is no CLI `compact` command in `omp --help`. To "compact before an uncached resume", decide between (a) relying on omp auto-compaction triggered before resume, (b) starting a fresh architect session with the existing deterministic brief (`buildArchitectBrief`) and recording it as the handoff, (c) a long-lived architect process. Measure cost with cacheRead/cacheWrite tokens.
16. **Warm-on-standby.** The architect process exits after every turn; `providers.cacheWarming=streaming` only helps a live/last request. Decide whether to keep a standby process (cost) or treat warming as off by default; the spec allows "explicitly off where it does not pay".
17. **Measurement plumbing.** Add `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, and cost sub-fields to `Usage`/`StepUsage`/records/derived status before choosing defaults; update `budget.ts` aggregation and `state.schema.json` if surfaced.
18. **Schema-free plan.** Count plan-repair turns and their cost from records (`architect-plan-*` attempts, repair records, usage) before changing the contract. The PM already structures item edits from plan outlines; the open question is whether the architect should emit telegraphic markdown for the plan itself and let PM produce both `plan` and `edits` schemas.

### Repo rules (19.9)
19. **Rule sources and precedence.** Which files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.omp/rules`?), from repo root and subdirs, and how they combine with factory agent definitions. Confirm whether omp already injects context files into a root process launched with `--system-prompt` (its config exposes `contextFiles.extra` and `--no-context-files`), to avoid double injection. Verify per role with a probe agent that must quote a sentinel rule.

### No-model e2e (19.8)
20. **Mock provider seam.** omp supports `--extension` and `omp models -e`, so a scripted provider extension is the most likely route; alternatively an OpenAI-compatible local endpoint registered via overlay if omp supports custom provider definitions. Define the canned scenario format (turn-by-turn NDJSON: text, tool calls, yield), and prove the real omp binary runs a full factory flow against it with zero paid calls.

---

## 9. Verification commands (baseline)

```bash
cd plugins/software-factory
bun test                       # full behavior suite
bun run typecheck              # tsc --noEmit
FACTORY_LIVE_OMP=1 bun test test/harness/smoke-live.test.ts   # opt-in real omp smoke (paid models)

# omp mechanics probes (read-only)
omp --version
omp config list --json | jq 'to_entries[] | select(.key|test("isolation|worktree|compaction|cache"))'
omp worktree list --json
omp worktree clear --dry-run   # dry-run only
```

---

## 10. Notes for the architect

- **Do not re-derive** the following: merge is already wave-end per item; gates/target-green already run deterministically on tree change; conflict handling exists but uses `developer/integrate`; epics are in-process and merge like items; `factory status` is task-scoped; commit messages are engine-invented; usage lacks cache tokens; omp exposes native compaction/warming/worktree-lifecycle config.
- **Suggested epic split** (sizing only; the architect decides): (A) isolation backend + workspace abstraction + preflight round-trip + whole-tree status/cleanup/gc; (B) agent-authored commits + wave-end merger agent + escalation pointers; (C) saga independent launches + parallel epics + escalation/funnel routing; (D) cache/compaction measurement & policy; (E) no-model omp e2e harness + repo-rules hydration + use-case docs. A/B share workspace primitives; C depends on A; D is independent but benefits from A's workspace cleanup; E spans all and should land last per epic with a thin slice early (mock provider spike) to de-risk.
- **Start with a fact-finder spike item** per the intent: it must answer questions 1–6 (§8) with throwaway temp repos and a throwaway omp profile, and produce a decision record on the omp↔engine isolation mapping before any engine code changes.
`). Read code ONLY to verify a specific integration decision (few targeted reads, never broad scans). Translate new unknowns into spike outlines or plan amendments instead of in-turn investigation. Keep terse.
- Outcome options (yield `decision` matching `decisions.schema.json` with `context: "wave"`):
  - `continue`: wave succeeded; proceed to the next scheduled wave.
  - `amend`: revise remaining plan items based on wave learnings or spike results. Yield `outlines` = the NEW or REPLACEMENT PlanItemOutline entries for the amendment (same shape as plan `itemOutlines`: slug, kind, title, description?, milestoneId?, deps?, escalate?), PLUS optional `removeItemSlugs` naming PENDING (never merged/running) items the new items replace, PLUS `planDelta` prose describing the change for the PM. NEVER yield `amend` without `outlines`: an amendment with no new outlines is `continue`.
  - `end-iteration`: halt remaining waves early and transition directly to plan close-up (e.g. goal accomplished early or severe pivot required).
- When an amendment versions or replaces an item (for example a *-v2 copy superseding the original), include the stale original slug in `removeItemSlugs` so the pending original does not linger and run redundantly.
- Integrate spike findings: use `findings.md` and PoC results from finished spikes to inform subsequent item outlines.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.

## Current Plan
{
  "iteration": 1,
  "milestones": [
    {
      "id": "m1-omp-de-risk",
      "title": "Omp mechanics de-risked (spikes + decision records)",
      "scenarios": [
        "Given a throwaway git repo and throwaway omp profile, when the isolation probe matrix runs (backend values, omp-managed worktree add/cwd turn, failing/aborted turn, overlay acceptance), then the decision record states the omp↔engine mapping, retention guarantees, and the cheapest preflight probe.",
        "Given the installed omp binary, when the mock-provider spike probes extension registration and model catalog listing, then the report names the scripted-provider seam and a turn-by-turn scenario format (or rules extension out with evidence).",
        "Given two identical architect prompts, when the cache-key spike compares transport bytes/argv and runs live resume probes, then the report states whether omp caches by content or path and which compaction/warming knobs apply to factory sessions.",
        "Given a fixture repo with sentinel rules, when the repo-rules spike probes root-process context injection with and without --system-prompt, then the report lists rule sources, precedence, and whether factory hydration would double-inject."
      ],
      "directionalInterfaces": [
        "spike reports: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md (findings + probe logs + recommendations)",
        "decision records: {taskDir}/decisions/NNN-<topic>.yaml {status, decision, evidence, followUps} consumed by iteration-2 epic intents",
        "proposed config surface (draft, iteration 2 ratifies): isolation: omp|engine, overlay keys for isolation/worktree/compaction/cache, preflight probe command"
      ]
    },
    {
      "id": "m2-measure-stabilize",
      "title": "Cache measurement plumbing + transport stability characterized",
      "scenarios": [
        "Given an omp NDJSON turn carrying usage.cacheRead/cacheWrite and cost sub-fields, when the harness parses it, then the step meta record stores cacheReadTokens, cacheWriteTokens, totalTokens and cost breakdown, and budget/status aggregates include them.",
        "Given historical step records without cache fields, when derive/budget runs, then missing fields are treated as zero and old records remain valid (no migration).",
        "Given the same agent prompt rendered twice, when the transport characterization tests run, then they assert byte-equality of system-prompt content and overlay bytes and pin the unstable argv parts (prompt filename) as documented behavior."
      ],
      "directionalInterfaces": [
        "Usage/StepUsage: {inputTokens, outputTokens, cacheReadTokens?, cacheWriteTokens?, totalTokens?, costUsd?, cost?: {input?, output?, cacheRead?, cacheWrite?}} (all new fields optional)",
        "parser: NDJSON usage events -> Usage (tolerates absent cache keys); budget: sums with zero-defaults; derive: exposes cache columns to status",
        "tests: test/harness/transport-stability.test.ts (characterization, no prod change)"
      ]
    },
    {
      "id": "m3-workspace-backend",
      "title": "Workspace abstraction with omp default + engine option",
      "replanAfter": true,
      "scenarios": [
        "Given default config, when a task/item workspace is created, then it is created through the omp isolation backend and survives failing/aborted turns per the M1 retention decision.",
        "Given isolation: engine, when the same flows run, then behavior matches current engine worktrees (idempotent create/reuse, stale pruning, branch kept on remove).",
        "Given the same pipeline config twice, when the omp overlay is generated, then isolation/worktree/compaction/cache keys are byte-stable."
      ],
      "directionalInterfaces": [
        "PipelineConfig.isolation: {backend: omp|engine, ...spike-decided options}; schema + default YAML + loader validation",
        "workspace module: ensureWorkspace/releaseWorkspace {branch, path, backend} used by engine.ts and item setup; worktrees.ts becomes the engine backend",
        "overlay: writeOmpConfigOverlay emits spike-approved isolation/worktree keys"
      ]
    },
    {
      "id": "m4-lifecycle",
      "title": "Preflight hardening + whole-tree status/cleanup/gc",
      "replanAfter": true,
      "scenarios": [
        "Given an incompatible omp version or unusable isolation backend, when preflight runs, then it fails fast naming the cause (version, overlay/probe, model/role, repo-vs-records mismatch).",
        "Given a saga with epics/tasks/items, when factory status runs, then it prints the whole tree with workspace+branch per active agent and open questions, derived from records+git.",
        "Given finished and orphaned workspaces, when cleanup/gc run, then cleanup removes finished workspaces, gc dry-runs by default listing orphans (worktrees/branches/runtime/stale locks), and both refuse while any run lock is held."
      ],
      "directionalInterfaces": [
        "CLI: factory status [--tree], factory cleanup [--apply], factory gc [--apply] (exits 0 ok / 10 refused / 1 error); output sections stable for tests",
        "preflight checks: versionRange, isolationRoundTrip, modelRoleResolvability, repoRecordsConsistency (each independently testable)",
        "index: deriveWholeTree({orchRoot, git}) -> {tasks, links, workspaces, locks} (on demand, no registry)"
      ]
    },
    {
      "id": "m5-commits-merge",
      "title": "Agent-authored commits + wave-end merger + escalation pointers",
      "replanAfter": true,
      "scenarios": [
        "Given review/developer output with commitMessage/scope, when the engine commits step/merge records, then message and path scope come from the agent output and the engine adds only mechanical prefixes.",
        "Given a wave-end parent→child conflict, when the merge path runs, then a workhorse-class wave-end merger agent resolves trivial conflicts and deterministic gates re-run before merging to parent.",
        "Given an unresolvable conflict or red gates after bounded attempts, when escalation fires, then the architect consult carries a one-command status pointer plus the item worktree path and branch."
      ],
      "directionalInterfaces": [
        "schemas: review/developer-output += {commitMessage?, commitScope?}; prompts require them; step-runner/merge-path thread them to commitAll",
        "agents/wave-merger.md + steps/wave-merge.md (trivial-conflicts-only contract, yields {resolved, strategy} | {unresolvable, reason})",
        "consult payload: {statusPointer, worktree, branch, attempts, gateEvidence}"
      ]
    },
    {
      "id": "m6-saga",
      "title": "Saga independent launches + parallel epics + escalation split",
      "replanAfter": true,
      "scenarios": [
        "Given a saga plan with parallel epics, when the saga runs, then each epic executes as an independent factory launch in its own workspace with its own lock, and exit codes (0/10/1) roll up to the saga.",
        "Given a merge conflict inside an epic, when escalation fires, then it routes to the epic architect; given a saga wave-end epic-merge conflict, then it routes to the saga architect.",
        "Given child concerns/remarkables/blocking questions, when an epic wave ends, then they propagate upward (q-epic-* funnel) and appear in saga status."
      ],
      "directionalInterfaces": [
        "saga launcher: factory run --saga <task> / internal spawnChildFactory({epic, intentPath, workspace, branch}) with supervision + journal fan-in",
        "links: parent/saga identity records {sagaTask, epicSlug, childBranch, workspace} readable by status/gc/escalation routing",
        "locks: per-workspace run locks + saga coordination lock for merge/status writes; dead-PID takeover preserved"
      ]
    },
    {
      "id": "m7-cache-policy",
      "title": "Compaction/warming policy + measured defaults + plan-format review",
      "replanAfter": true,
      "scenarios": [
        "Given an architect resume that will miss the provider cache (TTL expired/model switched), when the turn starts, then the session compacts first (or starts fresh with the deterministic brief) and records the handoff + cost delta.",
        "Given standby between architect turns, when warming is cheaper than expected uncached resume, then the cache stays warm via omp mechanics; otherwise warming is explicitly off by config.",
        "Given measured plan-repair turns and cache-read costs, when the plan-format review runs, then it ratifies schema-bound plans or telegraphic+PM-structuring with cost evidence, and 20d optimizations stay off unless measured wins."
      ],
      "directionalInterfaces": [
        "config: architect.cache {compaction: {mode, triggers}, warming: {mode|off}, defaultsFrom: measurements}; overlay emits omp compaction/providers.cache* keys",
        "handoff record: brief + {reason: cache-miss|model-switch, priorSession, costDelta} in runs/ + journal event",
        "plan contract decision: docs/decisions/plan-format.md (+ schema/prompt changes if flipped)"
      ]
    },
    {
      "id": "m8-e2e-docs",
      "title": "No-model e2e + repo-rules hydration + use-case docs",
      "replanAfter": true,
      "scenarios": [
        "Given the scripted mock provider and the real omp binary, when the no-model e2e suite runs, then isolation, merge/conflict/escalation, saga/epic launch, restart, and gc scenarios pass with zero paid-model calls.",
        "Given a fixture repo with sentinel rules, when architect/developer/qa/reviewer turns run, then each role prompt contains the hydrated rules and probe agents quote the sentinel.",
        "Given each use case (single task, story waves, epic, saga+parallel, conflict/escalation, status/cleanup/gc), when docs are read, then a dedicated page exists and sentinel tests pin the required sections."
      ],
      "directionalInterfaces": [
        "mock provider: test/e2e/mock-provider/* (extension or local endpoint per M1 seam) + scenario scripts {turns: [{yield|toolCalls|text}]}; runner: bun test test/e2e/** with FACTORY_E2E_OMP=1 (real binary, scripted models)",
        "hydration: prompt var {{repoRules}} + resolver resolveRepoRules(repoRoot) {sources, precedence}; preflight renders per role",
        "docs: docs/usage/{single-task,story-waves,epic,saga,merging-escalation,lifecycle}.md + test/docs-usage.test.ts sentinels"
      ]
    }
  ],
  "uncertainties": [
    {
      "id": "u-isolation-backend",
      "description": "Allowed isolation.backend values; whether omp-managed worktrees (worktree add + --cwd) retain commits on failure/abort like engine worktrees; which omp mechanism maps to factory root-process workspaces; merge-back ownership; cheapest validating preflight probe; model/role resolvability without paid turns.",
      "spikeOutlines": [
        "spike-omp-isolation (fact-finder, iteration 1, M1): throwaway profile+repos probe matrix + decision record; blocks M3/M4/M6 design"
      ]
    },
    {
      "id": "u-mock-provider-seam",
      "description": "How to register a scripted provider for real omp (extension API vs local endpoint), catalog listing with --config/-e, streaming NDJSON contract, scenario format.",
      "spikeOutlines": [
        "spike-mock-provider (fact-finder, iteration 1, M1): seam probe + scenario-format proposal; poc + runner deferred to M8"
      ]
    },
    {
      "id": "u-cache-keying",
      "description": "Whether omp prompt cache keys on content or transport path (prompt filename, overlay regen); which compaction/warming knobs affect one-process-per-turn factory sessions; cold-resume detection signals.",
      "spikeOutlines": [
        "spike-cache-key (fact-finder, iteration 1, M1): byte-diff + live resume probes; transport stabilization deferred to M7"
      ]
    },
    {
      "id": "u-repo-rules",
      "description": "Rule file sources/precedence; whether omp injects context files into root --system-prompt processes (double-injection risk); per-role hydration seams.",
      "spikeOutlines": [
        "spike-repo-rules (fact-finder, iteration 1, M1): sentinel-fixture probes; hydration implementation deferred to M8"
      ]
    },
    {
      "id": "u-saga-orchestration",
      "description": "Child launch supervision, epic INTENT resolution, parallel-epic lock/merge coordination, architect routing map — designable after M1+M3; may need a launcher poc in iteration 2.",
      "spikeOutlines": [
        "poc saga launcher (iteration 2, after M3): spawn/supervise two stub children, lock + journal fan-in; proposal only, not scheduled now"
      ]
    },
    {
      "id": "u-plan-format",
      "description": "Whether schema-free telegraphic plans + PM structuring beat schema-bound plans on repair-turn cost — needs measured repair data from records.",
      "spikeOutlines": [
        "fact-finder plan-repair cost analysis (iteration 2, after M2): count repair turns + cache costs from records; feeds M7 decision"
      ]
    }
  ],
  "itemOutlines": [
    {
      "slug": "spike-omp-isolation",
      "kind": "fact-finder",
      "title": "Spike: omp isolation mechanics + backend decision",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Probe installed omp (throwaway --profile, temp repos): enumerate isolation.backend values; compare isolated-task vs omp worktree add + --cwd retention on failing/aborted turns; determine the root-process workspace mapping; evaluate task.isolation apply/merge/commits vs engine merges; define the cheapest validating preflight probe (real turn, since --version/config-get are no-ops); test model/role resolvability without paid turns. Yield decision record + docs/spikes/omp-3-isolation.md. No prod code."
    },
    {
      "slug": "spike-mock-provider",
      "kind": "fact-finder",
      "title": "Spike: scripted mock provider seam for real omp",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Probe the omp extension API + model listing (-e/--config) and any custom-provider/endpoint registration; capture the streaming NDJSON contract; propose a canned scenario format (turn-by-turn text/tool-calls/yield) and prove a minimal real-omp turn against a scripted provider with zero paid calls (or rule the seam out with evidence). Report + proposal only; poc/runner deferred to M8."
    },
    {
      "slug": "spike-cache-key",
      "kind": "fact-finder",
      "title": "Spike: prompt-cache keying + compaction/warming audit",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Diff transport bytes/argv across identical renders (system prompt, overlay, prompt path); run live resume probes (same vs changed prompt path, model switch, TTL) with cache-miss markers; audit which compaction.* / providers.cache* knobs affect one-process-per-turn factory sessions; recommend cold-resume detection plus the compaction-vs-fresh-brief mechanism and warming viability. No prod changes (M2 characterizes, M7 implements)."
    },
    {
      "slug": "spike-repo-rules",
      "kind": "fact-finder",
      "title": "Spike: repo-rules sources + omp injection audit",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "description": "Enumerate rule sources (AGENTS.md/CLAUDE.md/.cursorrules/.omp/rules, root+subdirs) and precedence; probe whether root omp processes with --system-prompt already receive context files (contextFiles.extra/--no-context-files) using sentinel fixtures; map per-role hydration seams (architect/developer/qa/reviewer) and the verification plan. Report only; hydration deferred to M8."
    },
    {
      "slug": "usage-cache-tokens",
      "kind": "dev",
      "title": "Cache-token usage plumbing end to end",
      "milestoneId": "m2-measure-stabilize",
      "prodBudgetHint": 180,
      "description": "Extend Usage/StepUsage with optional cacheReadTokens/cacheWriteTokens/totalTokens + cost breakdown; parse them in NdjsonParser (tolerate absence); persist in step meta records; aggregate in budget/derive; surface cache columns in status. Behavior tests: fixture NDJSON with cache fields, old-record backward compat (missing→0), budget sums, status output. Tests-first per dev kind."
    },
    {
      "slug": "transport-byte-stability",
      "kind": "test-only",
      "title": "Transport byte-stability characterization tests",
      "milestoneId": "m2-measure-stabilize",
      "prodBudgetHint": 0,
      "description": "Add tests rendering identical prompts twice and asserting byte-equality of system-prompt content and generated overlay, while pinning unstable argv parts (timestamped prompt filename) as current documented behavior. No prod changes; stabilization decision deferred to M7 after spike-cache-key."
    },
    {
      "description": "In mergeItem (plugins/software-factory/src/core/flows/merge-path.ts), execute infra.setup commands in childWt BEFORE the verify-checks phase (before gates snapshot/run), using the same runInfraSetup semantics as the temp-worktree paths (gates.ts:332-335, runner.ts:796-810). Requirements: no-op when setup is empty; setup runs before snapshotWorktree so setup-created untracked files (node_modules) are not flagged as gate mutations; failure of setup fails the merge with the setup command + output as evidence (same evidence shape as gate failures). Behavior tests (tests-first, tmp-repo, no network): (1) merge where infra.setup writes a marker file asserts gates observe it; (2) empty setup behaves exactly as today; (3) failing setup fails merge with actionable evidence. Note: fix takes effect on engine restart, not mid-run.",
      "kind": "dev",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 80,
      "slug": "merge-setup-fix",
      "title": "Run infra.setup in merge child worktree before gates"
    },
    {
      "description": "Salvage approved wave-1 spike research stranded on failed item branches (all research steps ok, reviews approved; only wave-end merges failed environmentally). Read-only via `git show <branch>:<path>` (NEVER checkout/switch branches, NEVER write to .factory/** engine-owned paths): topic/omp-workspaces--spike-omp-isolation items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml (+003 review), topic/omp-workspaces--spike-mock-provider steps/001-research-r1-a1/output.yaml (+002 review), topic/omp-workspaces--spike-cache-key steps/001-research-r1-a1/output.yaml (+002 review), topic/omp-workspaces--spike-repo-rules steps/001-research-r1-a1/output.yaml (+002 review), plus parent-branch decisions/001 + 002 rulings. Write the four spike draft docs to plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md from the embedded drafts (applying each review's optional polish notes where they correct evidence, e.g. probe-26/18 softening, spec-path fix), and items/spike-findings-recovery/RECOVERY.md mapping each M1 scenario to evidence + followUps for iteration-2 planning. Docs only, zero prod lines. Verify: all five files present with probe-evidence sections; parent branch only.",
      "kind": "no-behavior",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "slug": "spike-findings-recovery",
      "title": "Recover wave-1 spike findings onto parent branch"
    },
    {
      "description": "Docs-only salvage retry. Copy the 4 approved spike docs (plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md) plus items/spike-findings-recovery/RECOVERY.md from branch topic/omp-workspaces--spike-findings-recovery onto this item's branch via read-only `git show <branch>:<path>` (NEVER checkout/switch branches). Fix the `oMP` capitalization typo in omp-6-repo-rules.md. Verify all 5 files present with probe-evidence sections. CRITICAL: do NOT record a gate target (target {gate:test} requires full-suite exit 0 and is unmergeable on the red baseline); omit target or use a single passing selector target. Zero prod lines; no-behavior kind.",
      "kind": "no-behavior",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 0,
      "slug": "spike-findings-recovery-v2",
      "title": "Recover wave-1 spike findings onto parent branch (v2)"
    },
    {
      "description": "Fix checkTargetGreen gate-target branch (plugins/software-factory/src/core/checks/runner.ts:644-676) to apply the same baseline ratchet runGates uses: when the gate command fails, compare failing tests against gates-baseline.yaml and pass when failures are a subset of baseline (plus JUnit re-derivation parity where applicable). Behavior tests-first with tmp-repo fixtures: (1) gate target failing ONLY on baseline-listed tests passes; (2) gate target with a NEW failing test still fails with actionable evidence; (3) gate target fully green still passes. Keep prod diff small (~60 lines hint). Record selector targets (not gate targets) so this item itself merges cleanly.",
      "kind": "dev",
      "milestoneId": "m1-omp-de-risk",
      "prodBudgetHint": 60,
      "slug": "target-green-ratchet-fix",
      "title": "Apply baseline ratchet to target-green gate targets"
    }
  ],
  "assumptions": [
    {
      "assumption": "Iteration 1 schedules spikes + measurement only; child epics (proposed: workspaces-lifecycle, commits-merge, saga-launches, cache-policy, e2e-docs-hydration) are defined in iteration 2 with spike-informed intents.",
      "why": "All major subsystems build on spike decisions; epic children launched now could not see later-merged findings. Progressive planning defers epic definition to the next architect turn via replanAfter milestones."
    },
    {
      "assumption": "Installed omp 18.18.5 is representative; spikes probe it directly and preflight will pin a minimum version.",
      "why": "Context-pack probes already ran against this binary; findings must be validated against the real harness, not docs."
    },
    {
      "assumption": "Current engine worktree behavior is preserved behind isolation: engine without regression.",
      "why": "Spec keeps engine worktrees as a config option; M3 must not change engine semantics until the omp backend is proven."
    },
    {
      "assumption": "The single red baseline test (disk-space threshold, env-sensitive) is accepted as-is; iteration gates pass if no NEW failures appear.",
      "why": "Clean-checkout rule forbids investigating env-sensitive baseline reds; ratchet on new failures instead."
    },
    {
      "assumption": "All new tests assume cwd=plugins/software-factory and resolve fixtures repo-relatively.",
      "why": "Infra notes: running from the repo root breaks fixture resolution; spike/e2e tests must follow the same convention."
    },
    {
      "assumption": "Spikes may run bounded real-omp turns (throwaway profile/repos) using configured roles; token cost is research cost.",
      "why": "Cache/retention/resolvability questions are only answerable through the real binary; M8's no-model constraint applies to the committed e2e suite, not to spike probes."
    }
  ],
  "techDebt": [
    {
      "id": "td-baseline-disk",
      "description": "Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2 (env-sensitive duplicate low-space paths).",
      "category": "adjacent",
      "resolution": "Accepted as-is; iteration gates ratchet on new failures only."
    },
    {
      "id": "td-hardcoded-omp",
      "description": "Preflight hard-codes omp fallback path /home/slava/.bun/bin/omp.",
      "category": "adjacent",
      "resolution": "Remove during M4 preflight hardening (resolve via PATH/config only)."
    },
    {
      "id": "td-no-lint",
      "description": "No lint/format gate configured.",
      "category": "adjacent",
      "resolution": "Out of scope; if added later, exclude the orchestration folder .factory/**."
    },
    {
      "id": "td-usage-cache",
      "description": "Usage parser drops cacheRead/cacheWrite/totalTokens + cost subfields; StepUsage/budget/derive aggregate only input/output/cost.",
      "category": "impacting",
      "resolution": "Resolved this iteration by usage-cache-tokens (M2); M7 defaults depend on it."
    },
    {
      "id": "td-prompt-path",
      "description": "Per-turn prompt transport path embeds timestamp+randomness; overlay regenerated per turn; no byte-stability tests.",
      "category": "impacting",
      "resolution": "Characterize this iteration via transport-byte-stability (M2, tests only); stabilize in M7 after spike-cache-key decides content-vs-path keying."
    },
    {
      "id": "td-runtime-growth",
      "description": "Runtime dirs sessions/prompts/system-prompts grow without cleanup (only tmp/ purged); omp-owned orphans unclassified.",
      "category": "impacting",
      "resolution": "M4 gc semantics cover runtime files + omp-owned orphans; M8 e2e asserts bounded growth across restart/gc scenarios."
    }
  ],
  "adrs": [
    {
      "id": "adr-iter1-spikes-first",
      "title": "Iteration 1 runs spikes + measurement only; epics deferred to iteration 2",
      "context": "Items 19/20 hinge on unvalidated omp mechanics (isolation backend, provider seam, cache keying, context injection); intent mandates starting with a fact-finder spike; epic child worktrees branch from the parent tip at launch and cannot see spike findings merged later.",
      "decision": "Iteration 1 schedules four fact-finder spikes (M1) plus two spike-independent foundation items (M2). No child epics are defined; the iteration-2 architect turn defines epics with spike-informed intents against replanAfter milestones M3-M8."
    },
    {
      "id": "adr-whole-tree-index",
      "title": "Whole-tree status/cleanup/gc derive on demand from records + git; no persistent registry",
      "context": "19.3 requires idempotent tracking derived from records+git; a registry file risks drift from worktree/branch reality; parseWorktreeList plus INTENT/journal/task dirs already provide the sources.",
      "decision": "M4 implements deriveWholeTree over orchestration dirs, journals, and git worktree/branch state on every invocation; cleanup/gc compute candidate sets from the same derivation and refuse while any run lock is live."
    },
    {
      "id": "adr-cache-fields-additive",
      "title": "Cache-token usage fields are additive and optional end to end",
      "context": "M2 must capture cacheRead/cacheWrite/totalTokens plus cost breakdown without invalidating historical records or forcing a migration.",
      "decision": "All new Usage/StepUsage/record/budget fields are optional with zero-default aggregation; the parser tolerates absent keys; schemas gain optional properties only."
    },
    {
      "id": "adr-real-binary-e2e",
      "title": "No-model e2e drives the real omp binary with a scripted provider; FakeHarness retained for engine tests",
      "context": "19.8 requires end-to-end through the real omp harness with a scripted mock provider and zero paid calls; existing engine coverage relies on FakeHarness-by-label and mock-binary harness tests, neither of which exercises real omp.",
      "decision": "M8 builds a scripted provider behind the M1-chosen seam plus a scenario runner over the real omp binary (opt-in env flag, skips cleanly without omp); FakeHarness remains the default for fast engine behavior tests."
    }
  ]
}

## Wave Report
{
  "blockedItems": [],
  "failedItems": [],
  "iteration": 1,
  "mergedItems": [
    "spike-findings-recovery-v2",
    "target-green-ratchet-fix"
  ],
  "recommendations": [
    "Proceed to next wave / architect wave report; no hygiene or gate blockers.",
    "Optionally address pre-existing environment-sensitive disk-space test failure (test/disk-space.test.ts:57) in a dedicated item; it is baseline-red and not a wave regression."
  ],
  "status": "complete",
  "summary": "Wave 3 complete: 2/2 items merged (spike-findings-recovery-v2, target-green-ratchet-fix). Tree hygiene clean: no untracked junk or tracked changes outside engine-managed .factory/ (only .factory/tasks/omp-workspaces/journal.ndjson +2 lines pending engine commit), no conflict markers. Gates match baseline with no regressions: typecheck pass/pass green, test fail/fail still failing (baseline-red disk-space test, not a regression per Gate Diff table).",
  "wave": 3
}

## Tech Debt
# Architect brief — task: omp-workspaces iteration: 1
Read full detail from file paths under the task dir; entries are relevance-ordered for this step.
- [plan:plan-1.2.yaml] plan: milestones [m1-omp-de-risk: Omp mechanics de-risked (spikes + decision records); m2-measure-stabilize: Cache measurement p…] | plan/plan-1.2.yaml
- [plan:edits-1.2.yaml] plan: scheduled [spike-findings-recovery-v2(no-behavior), target-green-ratchet-fix(dev)] | plan/edits-1.2.yaml
- [item:target-green-ratchet-fix] items: dev wave=3 status=merged branch=topic/omp-workspaces--target-green-ratchet-fix — Apply baseline ratchet to target-green gate targets | items/target-green-ratchet-fix/assignment.yaml
- [item:spike-findings-recovery-v2] items: no-behavior wave=3 status=merged branch=topic/omp-workspaces--spike-findings-recovery-v2 — Recover wave-1 spike findings onto parent branch (v2) | items/spike-findings-recovery-v2/assignment.yaml
- [debt:state.yaml:41] debt: [target-green-ratchet-fix] Non-JUnit gate targets stay strict-fail on red baseline (fail-closed vs runGates coarse-pass) | state.yaml
- [debt:state.yaml:40] debt: [spike-findings-recovery-v2] RECOVERY.md line 92 names non-v2 deliverable path | state.yaml
- [debt:state.yaml:17] debt: [wave-merge] target-green gate targets ignore baseline ratchet; gate:test unmergeable on red baseline | state.yaml
- [concern:c-2bec98be29.yaml] concerns: tech-debt / high: target-green gate targets ignore baseline ratchet; gate:test unmergeable on red baseline | concerns/c-2bec98be29.yaml
- [decision:012-item-spike-findings-recovery-1.yaml] decisions: abandon: Item work is complete and approved (4 spike docs + RECOVERY.md, QA/review approved, 0 prod lines). Merge verify passed gates (incl. typechec… | decisions/012-item-spike-findings-recovery-1.yaml
- [decision:011-item-merge-setup-fix-1.yaml] decisions: retry-with-guidance: RETRY (gate flake, not prod regression — isolate before touching code): 1) Run ONLY the failing file in isolation from plugins/software-fact… | decisions/011-item-merge-setup-fix-1.yaml
- [wave:wave-1.2.yaml] waves: has_failures merged=[usage-cache-tokens, transport-byte-stability, merge-setup-fix] failed=[spike-findings-recovery] blocked=[(none)] — Wave 2 completed. Merged items: usage-cache-tokens, transport-byte-stability, merge-setup-fix | waves/wave-1.2.yaml
- [wave:wave-1.1.yaml] waves: has_failures merged=[(none)] failed=[spike-omp-isolation, spike-mock-provider, spike-cache-key, spike-repo-rules] blocked=[(none)] — Wave 1 completed. Merged items: | waves/wave-1.1.yaml
- [concern:c-8a26e7294b.yaml] concerns: risk / medium: Gate environment lacks dependency install: child/item worktrees without infra.setup fail typecheck and tests with `Cannot find package 'yaml… | concerns/c-8a26e7294b.yaml
- [concern:c-0647070832.yaml] concerns: tech-debt / high: Child/merge worktrees still need infra.setup (bun install) before the bun test runner can collect tests; this worktree had no node_modules u… | concerns/c-0647070832.yaml
- [concern:c-552344216d.yaml] concerns: blocker / high: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck | concerns/c-552344216d.yaml
- [concern:c-f972360209.yaml] concerns: tech-debt / medium: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures | concerns/c-f972360209.yaml
- [debt:state.yaml:35] debt: [spike-findings-recovery] Test gate pass coexists with 1 documented baseline failure | state.yaml
- [debt:state.yaml:36] debt: [spike-findings-recovery] Fix `oMP` capitalization typo in repo-rules doc | state.yaml
- [debt:state.yaml:0] debt: Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2 (env-sensitive duplicate low-space paths). | state.yaml
- [debt:plan-1.2.yaml:td-baseline-disk] debt: [adjacent] Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2 (env-sensitive duplicate low-space paths). | plan/plan-1.2.yaml
- [plan:plan-1.1.yaml] plan: milestones [m1-omp-de-risk: Omp mechanics de-risked (spikes + decision records); m2-measure-stabilize: Cache measurement p…] | plan/plan-1.1.yaml
- [plan:edits-1.1.yaml] plan: scheduled [merge-setup-fix(dev), spike-findings-recovery(no-behavior)] | plan/edits-1.1.yaml
- [plan:plan-1.yaml] plan: milestones [m1-omp-de-risk: Omp mechanics de-risked (spikes + decision records); m2-measure-stabilize: Cache measurement p…] | plan/plan-1.yaml
- [plan:edits-1.yaml] plan: scheduled [spike-omp-isolation(fact-finder), spike-mock-provider(fact-finder), spike-cache-key(fact-finder), spike-repo-r…] | plan/edits-1.yaml
- [item:spike-findings-recovery] items: no-behavior wave=2 status=failed branch=topic/omp-workspaces--spike-findings-recovery — Recover wave-1 spike findings onto parent branch | items/spike-findings-recovery/assignment.yaml
- [item:spike-omp-isolation] items: fact-finder wave=1 status=failed branch=topic/omp-workspaces--spike-omp-isolation — Spike: omp isolation mechanics + backend decision | items/spike-omp-isolation/assignment.yaml
- [item:spike-mock-provider] items: fact-finder wave=1 status=failed branch=topic/omp-workspaces--spike-mock-provider — Spike: scripted mock provider seam for real omp | items/spike-mock-provider/assignment.yaml
- [item:spike-cache-key] items: fact-finder wave=1 status=failed branch=topic/omp-workspaces--spike-cache-key — Spike: prompt-cache keying + compaction/warming audit | items/spike-cache-key/assignment.yaml
- [item:spike-repo-rules] items: fact-finder wave=1 status=failed branch=topic/omp-workspaces--spike-repo-rules — Spike: repo-rules sources + omp injection audit | items/spike-repo-rules/assignment.yaml
- [decision:004-item-spike-omp-isolation-abandon.yaml] decisions: abandon: Merge redrive failed 2/2 attempts with evidence: Quality gates failed on merge path for spike-omp-isolation: typecheck. typecheck (exit via … | decisions/004-item-spike-omp-isolation-abandon.yaml
- [decision:006-item-spike-mock-provider-abandon.yaml] decisions: abandon: Merge redrive failed 2/2 attempts with evidence: Quality gates failed on merge path for spike-mock-provider: typecheck. typecheck (exit via … | decisions/006-item-spike-mock-provider-abandon.yaml
- [decision:008-item-spike-cache-key-abandon.yaml] decisions: abandon: Merge redrive failed 2/2 attempts with evidence: Quality gates failed on merge path for spike-cache-key: typecheck. typecheck (exit via stat… | decisions/008-item-spike-cache-key-abandon.yaml
- [decision:010-item-spike-repo-rules-abandon.yaml] decisions: abandon: Merge redrive failed 2/2 attempts with evidence: Quality gates failed on merge path for spike-repo-rules: typecheck. typecheck (exit via sta… | decisions/010-item-spike-repo-rules-abandon.yaml
- [decision:003-item-spike-omp-isolation-2.yaml] decisions: retry-with-guidance: RETRY (environmental failure, not spike failure): the typecheck error TS2688 (missing 'bun' types) means the merge child worktree lacks node… | decisions/003-item-spike-omp-isolation-2.yaml
- [concern:c-f70f3d57b8.yaml] concerns: risk / medium: Isolation patch artifacts land outside worktree base and records | concerns/c-f70f3d57b8.yaml
- [concern:c-e97dd18239.yaml] concerns: risk / high: omp isolation backend values and runtime applicability are undocumented locally | concerns/c-e97dd18239.yaml
- [concern:c-13190d7c26.yaml] concerns: tech-debt / medium: OmpHarness has no extension/extra-arg seam; mock provider needs a wrapper or new option | concerns/c-13190d7c26.yaml
- [concern:c-fc5f2e54fb.yaml] concerns: tech-debt / medium: Hard-coded omp fallback path in preflight | concerns/c-fc5f2e54fb.yaml
- [debt:state.yaml:14] debt: [spike-mock-provider] OmpHarness has no extension/extra-arg seam; mock provider needs a wrapper or new option | state.yaml
- [item:merge-setup-fix] items: dev wave=2 status=merged branch=topic/omp-workspaces--merge-setup-fix — Run infra.setup in merge child worktree before gates | items/merge-setup-fix/assignment.yaml
- [debt:state.yaml:34] debt: [merge-setup-fix] runMergeSetup duplicates runner.ts setup logic | state.yaml
- [debt:state.yaml:33] debt: [merge-setup-fix] No test for sequential stop-on-first-failure or timeout | state.yaml
- [concern:c-7ca231f0aa.yaml] concerns: risk / medium: stranded-wave test has a 5s timeout that flakes under full-suite parallel load | concerns/c-7ca231f0aa.yaml
- [concern:c-8dc9dd1c4d.yaml] concerns: risk / medium: Full-suite gates under parallel wave items cause timeout flakes (5s default) | concerns/c-8dc9dd1c4d.yaml
- [debt:plan-1.2.yaml:td-usage-cache] debt: [impacting] Usage parser drops cacheRead/cacheWrite/totalTokens + cost subfields; StepUsage/budget/derive aggregate only input/output/cost. | plan/plan-1.2.yaml
- [debt:plan-1.2.yaml:td-prompt-path] debt: [impacting] Per-turn prompt transport path embeds timestamp+randomness; overlay regenerated per turn; no byte-stability tests. | plan/plan-1.2.yaml
- [debt:plan-1.2.yaml:td-runtime-growth] debt: [impacting] Runtime dirs sessions/prompts/system-prompts grow without cleanup (only tmp/ purged); omp-owned orphans unclassified. | plan/plan-1.2.yaml
- [concern:c-399b793dc6.yaml] concerns: blocker / high: Saga launches do not exist and epic INTENT is not resolvable by `factory run` | concerns/c-399b793dc6.yaml
- [concern:c-13b776c9b3.yaml] concerns: risk / high: Factory records drop cacheRead/cacheWrite/totalTokens/cttl, so spec 20's cost-measured defaults cannot be computed from records | concerns/c-13b776c9b3.yaml
- [concern:c-317a4e9b8b.yaml] concerns: risk / high: Usage parser discards cache-read/write tokens needed for item 20 defaults | concerns/c-317a4e9b8b.yaml
- [concern:c-3596b08453.yaml] concerns: risk / high: Factory overlay pins no cache/compaction/memory knobs; effective behavior is inherited from host global/project config | concerns/c-3596b08453.yaml
- [concern:c-e9395e843e.yaml] concerns: risk / high: mnemopi.autoRecall injects prior-session text into the first turn, changing the effective system prompt and defeating fresh-session cache re… | concerns/c-e9395e843e.yaml
- [item:usage-cache-tokens] items: dev wave=2 status=merged branch=topic/omp-workspaces--usage-cache-tokens — Cache-token usage plumbing end to end | items/usage-cache-tokens/assignment.yaml
- [item:transport-byte-stability] items: test-only wave=2 status=merged branch=topic/omp-workspaces--transport-byte-stability — Transport byte-stability characterization tests | items/transport-byte-stability/assignment.yaml
- [steer:q-concern-c-8a26e7294b] steer: [human-awareness] ref=spike-findings-recovery-v2: Confirmed by attempt-1 checks (TS2688 no @types/bun, Cannot find package 'yaml') vs attempt-2 green after bun install. Not item-fixable: thi… | steer/tousertoreview/q-concern-c-8a26e7294b.yaml
- [debt:plan-1.2.yaml:td-hardcoded-omp] debt: [adjacent] Preflight hard-codes omp fallback path /home/slava/.bun/bin/omp. | plan/plan-1.2.yaml
- [debt:plan-1.2.yaml:td-no-lint] debt: [adjacent] No lint/format gate configured. | plan/plan-1.2.yaml

## Steering Directives
# Architect brief — task: omp-workspaces iteration: 1
Read full detail from file paths under the task dir; entries are relevance-ordered for this step.
- [plan:plan-1.2.yaml] plan: milestones [m1-omp-de-risk: Omp mechanics de-risked (spikes + decision records); m2-measure-stabilize: Cache measurement p…] | plan/plan-1.2.yaml
- [plan:edits-1.2.yaml] plan: scheduled [spike-findings-recovery-v2(no-behavior), target-green-ratchet-fix(dev)] | plan/edits-1.2.yaml
- [item:target-green-ratchet-fix] items: dev wave=3 status=merged branch=topic/omp-workspaces--target-green-ratchet-fix — Apply baseline ratchet to target-green gate targets | items/target-green-ratchet-fix/assignment.yaml
- [item:spike-findings-recovery-v2] items: no-behavior wave=3 status=merged branch=topic/omp-workspaces--spike-findings-recovery-v2 — Recover wave-1 spike findings onto parent branch (v2) | items/spike-findings-recovery-v2/assignment.yaml
- [debt:state.yaml:41] debt: [target-green-ratchet-fix] Non-JUnit gate targets stay strict-fail on red baseline (fail-closed vs runGates coarse-pass) | state.yaml
- [debt:state.yaml:40] debt: [spike-findings-recovery-v2] RECOVERY.md line 92 names non-v2 deliverable path | state.yaml
- [debt:state.yaml:17] debt: [wave-merge] target-green gate targets ignore baseline ratchet; gate:test unmergeable on red baseline | state.yaml
- [concern:c-2bec98be29.yaml] concerns: tech-debt / high: target-green gate targets ignore baseline ratchet; gate:test unmergeable on red baseline | concerns/c-2bec98be29.yaml
- [decision:012-item-spike-findings-recovery-1.yaml] decisions: abandon: Item work is complete and approved (4 spike docs + RECOVERY.md, QA/review approved, 0 prod lines). Merge verify passed gates (incl. typechec… | decisions/012-item-spike-findings-recovery-1.yaml
- [decision:011-item-merge-setup-fix-1.yaml] decisions: retry-with-guidance: RETRY (gate flake, not prod regression — isolate before touching code): 1) Run ONLY the failing file in isolation from plugins/software-fact… | decisions/011-item-merge-setup-fix-1.yaml
- [wave:wave-1.2.yaml] waves: has_failures merged=[usage-cache-tokens, transport-byte-stability, merge-setup-fix] failed=[spike-findings-recovery] blocked=[(none)] — Wave 2 completed. Merged items: usage-cache-tokens, transport-byte-stability, merge-setup-fix | waves/wave-1.2.yaml
- [wave:wave-1.1.yaml] waves: has_failures merged=[(none)] failed=[spike-omp-isolation, spike-mock-provider, spike-cache-key, spike-repo-rules] blocked=[(none)] — Wave 1 completed. Merged items: | waves/wave-1.1.yaml
- [concern:c-8a26e7294b.yaml] concerns: risk / medium: Gate environment lacks dependency install: child/item worktrees without infra.setup fail typecheck and tests with `Cannot find package 'yaml… | concerns/c-8a26e7294b.yaml
- [concern:c-0647070832.yaml] concerns: tech-debt / high: Child/merge worktrees still need infra.setup (bun install) before the bun test runner can collect tests; this worktree had no node_modules u… | concerns/c-0647070832.yaml
- [concern:c-552344216d.yaml] concerns: blocker / high: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck | concerns/c-552344216d.yaml
- [concern:c-f972360209.yaml] concerns: tech-debt / medium: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures | concerns/c-f972360209.yaml
- [debt:state.yaml:35] debt: [spike-findings-recovery] Test gate pass coexists with 1 documented baseline failure | state.yaml
- [debt:state.yaml:36] debt: [spike-findings-recovery] Fix `oMP` capitalization typo in repo-rules doc | state.yaml
- [debt:state.yaml:0] debt: Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2 (env-sensitive duplicate low-space paths). | state.yaml
- [debt:plan-1.2.yaml:td-baseline-disk] debt: [adjacent] Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2 (env-sensitive duplicate low-space paths). | plan/plan-1.2.yaml
- [plan:plan-1.1.yaml] plan: milestones [m1-omp-de-risk: Omp mechanics de-risked (spikes + decision records); m2-measure-stabilize: Cache measurement p…] | plan/plan-1.1.yaml
- [plan:edits-1.1.yaml] plan: scheduled [merge-setup-fix(dev), spike-findings-recovery(no-behavior)] | plan/edits-1.1.yaml
- [plan:plan-1.yaml] plan: milestones [m1-omp-de-risk: Omp mechanics de-risked (spikes + decision records); m2-measure-stabilize: Cache measurement p…] | plan/plan-1.yaml
- [plan:edits-1.yaml] plan: scheduled [spike-omp-isolation(fact-finder), spike-mock-provider(fact-finder), spike-cache-key(fact-finder), spike-repo-r…] | plan/edits-1.yaml
- [item:spike-findings-recovery] items: no-behavior wave=2 status=failed branch=topic/omp-workspaces--spike-findings-recovery — Recover wave-1 spike findings onto parent branch | items/spike-findings-recovery/assignment.yaml
- [item:spike-omp-isolation] items: fact-finder wave=1 status=failed branch=topic/omp-workspaces--spike-omp-isolation — Spike: omp isolation mechanics + backend decision | items/spike-omp-isolation/assignment.yaml
- [item:spike-mock-provider] items: fact-finder wave=1 status=failed branch=topic/omp-workspaces--spike-mock-provider — Spike: scripted mock provider seam for real omp | items/spike-mock-provider/assignment.yaml
- [item:spike-cache-key] items: fact-finder wave=1 status=failed branch=topic/omp-workspaces--spike-cache-key — Spike: prompt-cache keying + compaction/warming audit | items/spike-cache-key/assignment.yaml
- [item:spike-repo-rules] items: fact-finder wave=1 status=failed branch=topic/omp-workspaces--spike-repo-rules — Spike: repo-rules sources + omp injection audit | items/spike-repo-rules/assignment.yaml
- [decision:004-item-spike-omp-isolation-abandon.yaml] decisions: abandon: Merge redrive failed 2/2 attempts with evidence: Quality gates failed on merge path for spike-omp-isolation: typecheck. typecheck (exit via … | decisions/004-item-spike-omp-isolation-abandon.yaml
- [decision:006-item-spike-mock-provider-abandon.yaml] decisions: abandon: Merge redrive failed 2/2 attempts with evidence: Quality gates failed on merge path for spike-mock-provider: typecheck. typecheck (exit via … | decisions/006-item-spike-mock-provider-abandon.yaml
- [decision:008-item-spike-cache-key-abandon.yaml] decisions: abandon: Merge redrive failed 2/2 attempts with evidence: Quality gates failed on merge path for spike-cache-key: typecheck. typecheck (exit via stat… | decisions/008-item-spike-cache-key-abandon.yaml
- [decision:010-item-spike-repo-rules-abandon.yaml] decisions: abandon: Merge redrive failed 2/2 attempts with evidence: Quality gates failed on merge path for spike-repo-rules: typecheck. typecheck (exit via sta… | decisions/010-item-spike-repo-rules-abandon.yaml
- [decision:003-item-spike-omp-isolation-2.yaml] decisions: retry-with-guidance: RETRY (environmental failure, not spike failure): the typecheck error TS2688 (missing 'bun' types) means the merge child worktree lacks node… | decisions/003-item-spike-omp-isolation-2.yaml
- [concern:c-f70f3d57b8.yaml] concerns: risk / medium: Isolation patch artifacts land outside worktree base and records | concerns/c-f70f3d57b8.yaml
- [concern:c-e97dd18239.yaml] concerns: risk / high: omp isolation backend values and runtime applicability are undocumented locally | concerns/c-e97dd18239.yaml
- [concern:c-13190d7c26.yaml] concerns: tech-debt / medium: OmpHarness has no extension/extra-arg seam; mock provider needs a wrapper or new option | concerns/c-13190d7c26.yaml
- [concern:c-fc5f2e54fb.yaml] concerns: tech-debt / medium: Hard-coded omp fallback path in preflight | concerns/c-fc5f2e54fb.yaml
- [debt:state.yaml:14] debt: [spike-mock-provider] OmpHarness has no extension/extra-arg seam; mock provider needs a wrapper or new option | state.yaml
- [item:merge-setup-fix] items: dev wave=2 status=merged branch=topic/omp-workspaces--merge-setup-fix — Run infra.setup in merge child worktree before gates | items/merge-setup-fix/assignment.yaml
- [debt:state.yaml:34] debt: [merge-setup-fix] runMergeSetup duplicates runner.ts setup logic | state.yaml
- [debt:state.yaml:33] debt: [merge-setup-fix] No test for sequential stop-on-first-failure or timeout | state.yaml
- [concern:c-7ca231f0aa.yaml] concerns: risk / medium: stranded-wave test has a 5s timeout that flakes under full-suite parallel load | concerns/c-7ca231f0aa.yaml
- [concern:c-8dc9dd1c4d.yaml] concerns: risk / medium: Full-suite gates under parallel wave items cause timeout flakes (5s default) | concerns/c-8dc9dd1c4d.yaml
- [debt:plan-1.2.yaml:td-usage-cache] debt: [impacting] Usage parser drops cacheRead/cacheWrite/totalTokens + cost subfields; StepUsage/budget/derive aggregate only input/output/cost. | plan/plan-1.2.yaml
- [debt:plan-1.2.yaml:td-prompt-path] debt: [impacting] Per-turn prompt transport path embeds timestamp+randomness; overlay regenerated per turn; no byte-stability tests. | plan/plan-1.2.yaml
- [debt:plan-1.2.yaml:td-runtime-growth] debt: [impacting] Runtime dirs sessions/prompts/system-prompts grow without cleanup (only tmp/ purged); omp-owned orphans unclassified. | plan/plan-1.2.yaml
- [concern:c-399b793dc6.yaml] concerns: blocker / high: Saga launches do not exist and epic INTENT is not resolvable by `factory run` | concerns/c-399b793dc6.yaml
- [concern:c-13b776c9b3.yaml] concerns: risk / high: Factory records drop cacheRead/cacheWrite/totalTokens/cttl, so spec 20's cost-measured defaults cannot be computed from records | concerns/c-13b776c9b3.yaml
- [concern:c-317a4e9b8b.yaml] concerns: risk / high: Usage parser discards cache-read/write tokens needed for item 20 defaults | concerns/c-317a4e9b8b.yaml
- [concern:c-3596b08453.yaml] concerns: risk / high: Factory overlay pins no cache/compaction/memory knobs; effective behavior is inherited from host global/project config | concerns/c-3596b08453.yaml
- [concern:c-e9395e843e.yaml] concerns: risk / high: mnemopi.autoRecall injects prior-session text into the first turn, changing the effective system prompt and defeating fresh-session cache re… | concerns/c-e9395e843e.yaml
- [item:usage-cache-tokens] items: dev wave=2 status=merged branch=topic/omp-workspaces--usage-cache-tokens — Cache-token usage plumbing end to end | items/usage-cache-tokens/assignment.yaml
- [item:transport-byte-stability] items: test-only wave=2 status=merged branch=topic/omp-workspaces--transport-byte-stability — Transport byte-stability characterization tests | items/transport-byte-stability/assignment.yaml
- [steer:q-concern-c-8a26e7294b] steer: [human-awareness] ref=spike-findings-recovery-v2: Confirmed by attempt-1 checks (TS2688 no @types/bun, Cannot find package 'yaml') vs attempt-2 green after bun install. Not item-fixable: thi… | steer/tousertoreview/q-concern-c-8a26e7294b.yaml
- [debt:plan-1.2.yaml:td-hardcoded-omp] debt: [adjacent] Preflight hard-codes omp fallback path /home/slava/.bun/bin/omp. | plan/plan-1.2.yaml
- [debt:plan-1.2.yaml:td-no-lint] debt: [adjacent] No lint/format gate configured. | plan/plan-1.2.yaml

## Context Pack
# Context Pack — `omp-workspaces` (factory.v2 spec items 19 + 20)

Repo: `agentic-swarm` (plugin root `plugins/software-factory`). Spec: `docs/factory.v2.md`.
All line numbers are repo-relative and verified against the current checkout.

---

## 0. Scope and headline

The two spec items are deliberately un-implemented in v2 and are the second self-hosted fire-test goal: `plugins/software-factory/docs/ARCHITECTURE.md:40` says **"Deliberately not hand-built … Current state: engine-managed worktrees (§7), item-level integrate step, in-process epics, schema-bound architect plan, no cache/compaction management; prior omp research in `docs/spikes/`."**

The engine today is a single Bun process that derives state from committed records + git, creates its own git worktrees, runs one omp process per agent turn with `--cwd <worktree>`, merges items serially at wave end, and runs epics in-process as child tasks. Items 19/20 ask to (a) move workspace isolation to omp's configurable backend by default, (b) harden preflight/lifecycle, (c) move commit content and merge escalation to agents, (d) make epics independent launches inside sagas, (e) add an audited cache/compaction policy for the architect, and (f) prove all of it with no-paid-model end-to-end tests through the real omp harness.

A fresh probe of the installed `omp` (`/home/slava/.bun/bin/omp`, version `18.18.5`) shows the mechanics the spec refers to **do exist** as configuration: `isolation.backend` (enum, default `rcopy`), `task.isolation.{enabled,apply,merge,commits}`, `worktree.{base,onStart,onExit,clone,cleanSource}`, `compaction.*`, and `providers.cacheWarming` / `providers.cacheRetention`. None of these keys is used by the factory today (`plugins/software-factory/src/harness/omp/overlay.ts:26-100`). See §5 for the probe log.

---

## 1. Acceptance definition (the two spec items)

### Item 19 — workspaces, merging, lifecycle (prefer omp over DIY) — `docs/factory.v2.md:104-113`

| # | Requirement (condensed) |
|---|---|
| 19.1 | Workspace isolation via **omp's configurable isolation backend by default**; engine git worktrees stay only as config option `isolation: omp | engine`; a spike settles backend config, branch/commit retention on failure, cwd, merge-back |
| 19.2 | Preflight verifies: compatible omp version + config (overlay keys, isolation backend usable via a **real throwaway round-trip**), every configured model/role resolvable, target git repo state (clean, branches/worktrees consistent with records), harness binaries |
| 19.3 | Idempotent tracking of tasks/workspaces/branches/commits derived from records + git; launchers: `status` (whole tree: saga/epics/tasks/items, workspace+branch per active agent, open questions), `cleanup` (finished workspaces), `gc` (orphaned workspaces/branches/runtime files, stale locks; **dry-run by default**); all safe when idle and **refusing while a run holds the lock** |
| 19.4 | Commit message and scope from agents' structured output (e.g. last review before commit summarizes the change) or omp mechanics; **engine never invents content** |
| 19.5 | Wave-end merge default: conflict-free → deterministic CI gates → merged; conflicts or red → **workhorse-class wave-end merger agent** resolves trivial conflicts → unresolvable → architect escalation carrying a pointer to overall status (one command/file) and the worktree + branch of the problematic item |
| 19.6 | Saga: each epic runs as an **independent factory launch in its own workspace** (parallel epics possible); merges inside an epic escalate to the epic architect; merging epics at saga wave end escalates to the saga architect |
| 19.7 | Docs show each use case: single task, story waves, epic, saga with parallel epics, conflict/escalation paths, status/cleanup/gc |
| 19.8 | "No models" tests: end-to-end through the **real omp harness with a scripted mock model provider** (no paid models), covering isolation, merges/conflicts/escalations, saga/epic launches, restart, gc |
| 19.9 | Repo rules hydration: omp does not put AGENTS.md in subagent context, so the factory hydrates repo rules itself for architect and every implementer-chain agent, verified end-to-end per role |

### Item 20 — architect context economy — `docs/factory.v2.md:114-120`

| # | Requirement (condensed) |
|---|---|
| 20a | Compact the architect session **before a resume that will miss the provider prompt cache** (TTL expired / model switched), so an uncached resume does not re-pay full history |
| 20b | Keep the prompt cache **warm while the architect is on standby** between turns, when cheaper than expected uncached resume; leverage omp mechanics |
| 20-cost | Decide defaults by **measured cost** (usage / cache-read tokens in records); each mechanism configurable, explicitly off where it does not pay |
| 20-plan | Re-evaluate v2's **schema-bound architect plan** against v1's schema-free telegraphic output + PM structuring (an expensive repair turn was observed) |
| 20c | Session launching must **never break the provider prompt cache**: additive sessions only, never rewrite a transcript, prompt prefixes byte-stable across turns (no timestamps/random/temp-path interpolation into the cached prefix), generated omp overlay byte-stable for the same config |
| 20d | Optional optimizations only after 20c holds: focused compaction/handoff summaries on resume, IRC escalation reply, restart — measured and configurable/off by default |

---

## 2. Module map

### 2.1 Layout and responsibilities

| Area | Files | Responsibility relevant to 19/20 |
|---|---|---|
| CLI | `plugins/software-factory/src/cli/{dispatch,run,preflight,status,steer,init,lock}.ts`, `bin/factory.ts` | Only `init|preflight|status|steer|run`; `run` = preflight → lock → engine; `status` is one-task |
| Engine | `src/core/engine.ts` (835 lines) | `runTask` main loop, `runChildTask` (epic in-process), start-up repair, simple path, task worktree bootstrap, epic wiring |
| Iteration/waves | `src/core/flows/iteration.ts` (3978 lines) | plan → review → PM → waves → wave-end merges → close-up → wave report; architect session id threading; consults/redrives |
| Item machine | `src/core/flows/item-machine.ts` (1113 lines) | per-item step sequence, fix rounds, consults, terminal states |
| Merge path | `src/core/flows/merge-path.ts` (422 lines) | per-item merge under a parent-keyed merge lock; conflict → `integrate`; gates/verify; attempt ledger |
| Consults | `src/core/flows/consults.ts` | architect item/non-item/concern consults (decision artifact), resume architect session |
| Epic propagation | `src/core/flows/epic-propagation.ts` | child concerns/remarkables/questions pushed to parent store/mailbox (`q-epic-*`) |
| Step runner | `src/core/flows/step-runner.ts` (1437 lines) | single agent turn: prompt, session reuse, record commit, checks, session-loss rehydration, transient retries |
| Git | `src/core/git/{worktrees,naming,merge,commit,repair,status,repo,exec,cleanliness,diff}.ts` | engine-managed worktrees, branch naming, merges, commits, HEAD guard, repair |
| Derive | `src/core/derive/{task,item,wave}.ts` | derived state from committed records + git (idempotent, restart-safe) |
| Records | `src/core/records/*` | YAML IO, step records, schema cache, repair, citations |
| Checks/gates | `src/core/checks/{gates,runner,junit,types}.ts` | deterministic gates, target-green/red, baseline ratchet |
| Config | `src/core/config/{loader,merge,validate,roles}.ts`, `config/*.yaml`, `config/schemas/*.json` | layered pipeline config, role resolution, structural validation |
| Harness | `src/harness/types.ts`, `src/harness/omp/{harness,overlay,ndjson,classify}.ts`, `src/harness/fake/*` | one omp process per turn; NDJSON parse; overlay; fake harness for tests |
| Prompts/agents | `agents/**`, `src/core/{prompts,prompt-vars,brief}.ts` | agent definitions, step fragments, prompt vars, architect brief |
| Docs | `docs/{ARCHITECTURE,IMPLEMENTATION,OMP_ADAPTER,FIRE_TEST}.md`, `docs/spikes/*.md` | build contract, current-state audit, omp adapter spec, prior omp spikes |

### 2.2 Execution topology today (relevant to all of item 19)

1. `factory run <task>` resolves the slug, copies an INTENT path into `{orch}/{task}/INTENT.md` in the **main checkout** if needed, runs preflight, acquires a **per-task** run lock, builds `OmpHarness` and `Repo`, then calls `runTask` (`src/cli/run.ts:27-135`).
2. `runTask` creates the task worktree on `topic/{task}` from main HEAD (INTENT committed there), repairs stray dirt, repairs item worktrees, marks interrupted records, reconciles concerns, then runs ingest/triage/infra/context-pack (`src/core/engine.ts:236-340`).
3. Each wave runs items concurrently up to `limits.maxParallelItems`; each item gets a child worktree (`{worktreeRoot}/topic_{task}--{item}`) and is ticked by `tickItemMachine`; epic items call `runTaskChild` **in-process** (`src/core/flows/iteration.ts:2432-2480`).
4. Wave end merges ready items serially through `mergeItem` under `repo.mergeLocks(parentBranch)`; on failure the engine consults the architect and re-drives, bounded by `merge-attempts.yaml` (`src/core/flows/iteration.ts:2706-2800`, `src/core/flows/merge-path.ts:131-170`).
5. Epic child task = child task dir under `{parentTaskDir}/{epic}`, its own iterations/waves on branch `topic/{parent}--{epic}`, then a `child-closeup.yaml` on the parent and the epic branch merged like any item (`src/core/engine.ts:123-226`).
6. Every agent turn is a separate omp process launched with `--cwd <worktree>`, `--config <overlay>`, `--session-dir <runtime>/sessions`, optional `--resume <id>`, `--system-prompt <file>`, `-p @<prompt-file>` (`src/harness/omp/harness.ts:356-410`).

---

## 3. Key interfaces & signatures

### Harness contract (`src/harness/types.ts:24-55`)
```ts
export interface Harness {
  run(l: AgentRun): Promise<AgentOutcome>;          // one turn (fresh or resumed)
  validateTools?(tools: string[]): Promise<string[]>;
  complete(c: { role; models; system; prompt; schema; timeoutSec?; timeoutMs?; onModelFallback? }): Promise<unknown>;
}
export interface AgentRun {
  agent; definition; prompt; role; models; tools;
  cwd: string;                 // worktree — engine-created today
  outputSchema; label;
  session: { resume?: string; keep: boolean };
  timeoutSec?; onModelFallback?; onSession?; onUsage?;
}
```
`AgentOutcome` carries `sessionId`, `traceRef`, `usage`, `transcriptBytes`, `stdoutBytes`, `toolCallCount`, and failure flags `transient|sessionLost|launchError|timedOut` (`src/harness/types.ts:57-82`).

### Engine entry points
- `runTask(deps: EngineDeps, task: string, opts?: { maxTicks?; maxIterations?; lockTakeoverEvent? }): Promise<RunResult>` — `src/core/engine.ts:236-247`; `RunResult = {status: done|blocked|failed|stopped, exitCode: 0|10|1, summary}` (`:61-65`).
- `runChildTask(deps, parent: {branch,path,taskDir}, epicSlug, opts?): Promise<RunResult>` — `src/core/engine.ts:123-226`.
- Engine deps: `{ harness, repo, project, pipelineFor(taskDir), prompts, clock?, log?, diskSpaceProbe? }` (`src/core/engine.ts:46-54`).

### Worktrees (`src/core/git/worktrees.ts`)
- `ensureTaskWorktree(repo, task, {intentPath, orchestrationFolder}): {branch, path, created}` — first run checks cleanliness except INTENT, `git worktree add -b topic/{task} <wt> HEAD`, writes+commits INTENT; idempotent (`:47-119`).
- `ensureChildWorktree(repo, parent:{branch,path}, slug, opts?): {branch,path,created}` — idempotent, prunes stale registrations, reuses branch, `git worktree add -b <child> <wt> <fromRef>` (`:122-168`).
- `removeWorktree(repo, wtPath)` — removes worktree, **keeps branch** (`:170-189`).
- `resetScratch(repo, parent, slug)` — removes branch+worktree and recreates from parent tip (`:191-224`).

### Branch naming (`src/core/git/naming.ts`)
- `taskBranch(task) => topic/{task}` (`:73-76`)
- `childBranch(parent, item) => parent--item`, max depth 2 (`:78-101`)
- `worktreePath(root, branch) => root/{branch with / → _}` (`:103-110`)
- `parseBranch` → `{task, items, depth}` (`:50-70`)

### Merge path (`src/core/flows/merge-path.ts`)
- `mergeItem(params: MergeItemParams): Promise<MergeItemResult>` — `:131-422`; params include `task,item,parentBranch,taskWt,childWt,repo,harness,pipeline,project,prompts,taskDir,wave?,targetOverride?,turnsSemaphore?` (`:20-49`).
- `MergeItemResult = {ok, sha?, error?, conflictResolved?, mergeAttempt?}` (`:51-58`).
- `MAX_MERGE_ATTEMPTS_PER_WAVE = 2`; ledger at `items/<slug>/merge-attempts.yaml`; per-wave target override at `items/<slug>/merge-target.yaml` (`:60-128`).

### CLI
- `dispatch(args): Promise<number>` switch over `init|preflight|status|steer|run` (`src/cli/dispatch.ts:110-176`).
- `runStatus({repoRoot, task})` — one task; resolves its single worktree (`src/cli/status.ts:26-80`).
- `acquireRunLock(repoRoot, task, opts?)` / `isRunLockFree(...)` / `resolveRuntimeDir(repoRoot, worktreeRoot?)` (`src/cli/lock.ts:21-170`).

### Config types
- `ProjectConfig { orchestrationFolder, adrFolder?, worktreeRoot, scripts?, paths?, skillDirs? }` (`src/core/artifacts.ts:11-22`).
- `PipelineConfig { models, agents, checks?, hooks?, flows, limits, budget?, diversity?, harness?: string, humanInvolvement?, concerns?, reviewPolicy?, criteria?, contextPack?, tools?, prompts? }` (`src/core/artifacts.ts:117-160`).
- `TaskKind = simple|story|spike|epic|saga` (`src/core/artifacts.ts:166`).
- `StepUsage = {inputTokens?, outputTokens?, costUsd?}` (`src/core/artifacts.ts:545-549`), recorded in every step `meta.yaml` (`:551-568`).

### Derived state
- `DerivedTaskState` (task, kind, status `active|blocked|done|failed`, iteration, currentWave, items/itemMap, waves, debt, budget/spend maps, runningSteps, concerns, openSteerQuestions, strandedItems, failureDetails) — `src/core/derive/task.ts:60-85`.
- `deriveTaskState({taskDir, task, parentBranch?, taskWt, pipeline?, project?})` — `src/core/derive/task.ts:140-147`.
- `DerivedItemState.status = pending|running|ready|merged|failed|blocked|superseded` — `src/core/derive/item.ts:41`.

---

## 4. Relevant excerpts

### 4.1 Engine-managed task worktree (the `isolation: engine` backend to preserve)
`plugins/software-factory/src/core/git/worktrees.ts:47-119`:
```ts
// first run: main checkout must be clean except INTENT
const dirty = findDirtyEntries(entries, { orchestrationFolder, currentIntentPath: relIntent });
if (dirty.length > 0) throw new Error(`Main checkout is dirty ...`);
...
await repo.writeLock.runExclusive(() =>
  git(repo.mainRoot, ["worktree", "add", "-b", branch, wtPath, "HEAD"])
);
```
Idempotence and stale-registration pruning are explicit (`:14-44`, `:60-72`, `:126-168`). This is the code the spec's `isolation: engine` option must keep behind a config switch.

### 4.2 Epic child task is in-process (the model to replace for sagas)
`plugins/software-factory/src/core/engine.ts:123-145`:
```ts
export async function runChildTask(deps, parent, epicSlug, opts?) {
  const parentBranch = parent.branch;
  const childBranchName = childBranch(parentBranch, epicSlug);
  const childWtInfo = await ensureChildWorktree(repo, parent, epicSlug);
  const childTaskDir = path.join(childWt, orchFolder, parentTaskSlug, epicSlug);
```
Child iterations run on `parentBranch = childBranchName` (`:166-182`); then concerns propagate, `child-closeup.yaml` is written on the parent, and the parent branch commits the record (`:186-212`). The child is launched from the wave loop only when `it.kind === "epic" && runTaskChild` (`src/core/flows/iteration.ts:2440-2450`), wired in `runTask` at `src/core/engine.ts:750-767`. `docs/IMPLEMENTATION.md:150-173` states the saga gap explicitly: *"NOT IMPLEMENTED: saga launches do not exist in code … no saga launcher/loop exists … defers this to the `omp-workspaces` fire-test goal."*

### 4.3 Wave-end merge, gates, and the current "merger"
`plugins/software-factory/src/core/flows/merge-path.ts:176-245` — on parent→child conflict the engine runs an `integrate` step with:
```ts
stepId: "integrate", stepFragment: "steps/integrate",
agent: "developer", role: "workhorse",   // <-- no dedicated wave-end merger agent
```
Then `concludeMerge` commits the resolution (engine stages, agent may not run git writes). If the tree changed, gates and target-green run (`:246-380`); any failure returns `ok:false` with evidence. Success merges child into parent with `--no-ff`, removes the worktree (branch kept), runs `after:item.merge` hooks (`:381-422`).

The wave loop calls this per ready item, then on failure calls `redriveMergeAfterConsult` which runs an architect consult and retries the merge, bounded by the attempt ledger: `src/core/flows/iteration.ts:2706-2800` (call), `:650-710` (helper). The consult input has assignment/priorAttempts/diff/feedback/debt/contextPack only — **no worktree or branch pointer**: `src/core/flows/consults.ts:110-136`; prompt fragment `agents/steps/architect-consult-item.md:1-40`. The status block the architect sees also lacks workspace/branch: `src/core/flows/iteration.ts:177-215`.

### 4.4 Preflight — what is actually verified today
`plugins/software-factory/src/cli/preflight.ts:129-235` loads project config, warns on linter configs, checks first-run cleanliness (only when the task branch does not exist), loads/validates the layered pipeline, checks disk space (`limits.minFreeDiskMb`). `:250-290` resolves roles/aliases and checks agents reference declared roles. `:292-360` renders prompt fragments and compiles all schemas. `:364-394` validates omp:
```ts
execFileSync(ompBinary, ["--version"], ...);
writeOmpConfigOverlay(pipelineConfig, tempOverlay);
execFileSync(ompBinary, ["--config", tempOverlay, "--version"], ...);
```
with a hard-coded last-resort path `/home/slava/.bun/bin/omp` (`:365-369`). `:399-414` checks the per-task run lock. There is **no isolation round-trip, no cross-check of branches/worktrees against records, and no model-name resolution against omp** (only role alias resolution).

### 4.5 CLI/status/lock — single-task today
`src/cli/status.ts:26-80` resolves one task dir (task worktree if present, else main), calls `deriveTaskState`, and prints worktree/config/budget/running steps/waves/items/questions/debt (`:59-170`). `src/cli/lock.ts:21-44` puts runtime state at `{worktreeRoot}/.factory-runtime`; locks at `{runtimeDir}/locks/{task}.lock` (`:45-55`); `isRunLockFree` and `acquireRunLock` implement same-host dead-PID takeover (`:57-246`). There is no task enumeration anywhere in `src/cli` (only `readdir` of config/schema dirs, `src/cli/preflight.ts:74,349`), so whole-tree status has no existing discovery layer.

### 4.6 Harness launch and cache-relevant transport
`src/harness/omp/harness.ts:286-300` — system prompt path is deterministic per agent+session:
```ts
const sessionKey = (run.session?.resume ?? "fresh").replace(...);
const systemPromptPath = path.join(systemPromptsDir, `${sanitizedAgent}-${sessionKey}.md`);
fs.writeFileSync(systemPromptPath, agentBody, "utf8");
```
`src/harness/omp/harness.ts:311-316` — prompt file name **embeds timestamp + randomness on every turn**:
```ts
const promptPath = path.join(promptsDir, `prompt-${Date.now()}-${Math.random()...}.txt`);
```
Args (`:368-388`): `--cwd run.cwd --config overlay --mode json --model <@role> --session-dir <dir> [--resume id] --tools=... --system-prompt <file> -p @<promptFile>`. Spawn cwd is the worktree (`:400-410`). No isolation/worktree flag is passed.

`src/core/flows/step-runner.ts:606-620` decides session reuse (`keep = sessionMode==="reuse"`, resume interrupted record or existing id); on `sessionLost` it retries once with a fresh session and the **full prompt**, not a rehydrated prefix (`:967-1000`); `PersistentAgent` does the same with an optional `rehydrate()` prefix (`src/core/sessions.ts:110-138`).

### 4.7 Architect planning, brief, wave report
- Plan turn: fresh plan or reuse session; `buildArchitectBrief` is called for a fresh brief even on resume (`src/core/flows/iteration.ts:1155-1235`); plan step uses `sessionMode: "reuse"`, `existingSessionId: architectSessionId`, fragment `steps/architect-plan` (`:1223-1290`). A limits violation triggers one resumed repair turn on the same session (`:1299-1370`).
- Wave report resumes the architect, injects `plan/waveReport/debt/steering/contextPack/taskStatus`, and the report fragment decides continue/amend/end (`:3089-3180`).
- `buildArchitectBrief` = deterministic one-line skeleton + a `@simpler` relevance judge returning `{include:[ids]}`, fail-open to the full skeleton (`src/core/brief.ts:1-14`, `:340-420`). This is the existing **cheap handoff** mechanism that item 20a/20d can build on.
- Architect output is schema-bound: `agents/steps/architect-plan.md:20` ("yield the plan matching `plan.schema.json`"); `config/schemas/plan.schema.json:4-6` requires `iteration, milestones, itemOutlines`; PM then structures item edits from plan outlines (`agents/steps/pm-edits.md:1-25`, `src/core/plan/apply.ts:1-16`).

### 4.8 Usage/cost parsing drops cache tokens
`src/harness/omp/ndjson.ts:84-98`:
```ts
const u = event.message.usage;
this.inputTokens += u.input || 0;
this.outputTokens += u.output || 0;
const costVal = u.cost?.total ?? ((u.cost?.input || 0) + (u.cost?.output || 0));
this.costUsd += costVal || 0;
```
`cacheRead`, `cacheWrite`, `totalTokens`, and cost sub-fields are ignored; `src/harness/omp/ndjson.ts:170-178` emits only `{inputTokens, outputTokens, costUsd}`; `src/core/artifacts.ts:545-549` and `src/core/budget.ts:34-48` sum only those three. The raw omp NDJSON **does** carry them: fixtures `test/fixtures/omp/turn-fallback.ndjson:7` (`"cacheRead":0,"cacheWrite":0,...cost.cacheRead`), and the prior spike documents `usage.cacheRead` as available (`docs/spikes/omp-2-cli-adapter.md:100-104`). So 20-cost cannot be implemented without extending `Usage`/`StepUsage` and the parser (and updating records/budget tests).

### 4.9 Commit content is engine-authored
`src/core/git/commit.ts:9-30` — `commitAll(repo, wt, message, {allowEmpty?, paths?})`; `paths` is the available scope mechanism. Call sites invent messages: step records `factory(...): <step> aN [started|error|rejected|session]` (`src/core/flows/step-runner.ts:697-760`, `:572`, `:807`, `:1400-1410`), plan edits `factory: apply plan edits iteration N` (`src/core/flows/iteration.ts:1914,1944`), epic close-up `factory: record epic <slug> child status ...` (`src/core/engine.ts:209`), merge `factory: merge item <slug>` (`src/core/flows/merge-path.ts:384-390`). Agent output schemas carry `summary` (`config/schemas/review.schema.json:6-12`, `config/schemas/developer-output.schema.json:6-14`) but no commit message/scope field.

### 4.10 Concern propagation and escalation vocabulary
`epic-propagation.ts:20-33` documents "Epic-to-saga concern push": open/routed child concerns + open remarkables are condensed, questions with `blocks` are forwarded to the parent mailbox as `q-epic-<epic>-<id>` (`:116`). The actual parent is the enclosing task; there is no distinct saga architect. `buildTaskStatusBlock` lists items/waves/merged/blocked/failed and both task/root question dirs (`src/core/flows/iteration.ts:195-220`).

### 4.11 Config surface where `isolation` must land
- `config/schemas/pipeline.schema.json:6-7` requires `models, agents, flows, limits`; `:208-210` declares `harness` as a **string**; `:305` sets root `additionalProperties: false`.
- `config/schemas/project.schema.json:52` is also `additionalProperties: false`.
- `config/pipeline.default.yaml`: models/roles `:40-104`, agents `:106-141`, checks/hooks `:172-195`, flows `:241-330`, limits `:342-390`, harness `:406`, humanInvolvement `:449`.
- Loader merge/validate: `src/core/config/loader.ts:68-150` (defaults → project → task → overrides, AJV, structural).
So adding `isolation` (or changing `harness` to an object) requires schema + `PipelineConfig` type + default YAML + overlay generation, or it fails validation at load.

### 4.12 Existing omp cache/compaction knobs are config-only
`src/harness/omp/overlay.ts:26-100` emits only `modelRoles`, `retry.*`, `eval.autoBackground`, `title.generator`, `checkpoint.enabled`, `advisor`, `bash.gitGuard/allowCompoundCommands`, `mnemopi.*`, `update.auto`. It emits **none** of the omp keys discovered in §5 (`isolation.backend`, `task.isolation.*`, `worktree.*`, `compaction.*`, `providers.cacheWarming/cacheRetention`). Overlay is regenerated per turn from the effective pipeline (`src/harness/omp/harness.ts:222-240`).

---

## 5. omp isolation mechanics — evidence log

### 5.1 Prior research (repository docs)
- `docs/spikes/omp-1-topology.md:189-215` — empirical comparison:
  - omp `isolated: true` hardcodes branch `omp/task/<agentId>`, has no `cwd`, needs `apply:false` (not `merge:false`) to avoid applying to parent, and **"if the subagent fails or rejects (`exitCode !== 0`), `commitToBranch` is completely skipped; no branch commits are captured on failure/rejection, and the temporary isolation worktree is deleted"** (`:196-201`).
  - Engine-created `git worktree add -b topic/x/y` + `omp --cwd <wt>` keeps **all** files/commits regardless of exit status (`:205-213`).
  - Recommendation: hybrid external Bun CLI + omp headless adapter with engine-managed worktrees (`:347-395`).
- `docs/spikes/omp-2-cli-adapter.md:114-158` — `--session-dir` + `--resume` append to the same transcript; cwd persists in the session header; model switch on resume is allowed. `:160-218` — overlay with `modelRoles`, fallback chains, unattended switches; `:245-270` — four concurrent omp processes in four worktrees, no lock contention, ~0.8–1.2 s startup, SIGTERM 143 with partial session flush.
- `docs/OMP_ADAPTER.md:164-172` — cache-safety audit claim: additive resumes, byte-stable system prompt content, "only transport filenames embed timestamps", deterministic overlay. **It does not test omp's cache keying; it flags `--system-prompt` path-keying as unknown.**

### 5.2 Fresh read-only probes on the installed omp 18.18.5
These are execution probes (no repository edits, no omp config writes):

| Probe | Result |
|---|---|
| `omp --version` | `omp/18.18.5` (README requires v18.17.0+: `plugins/software-factory/README.md:14-18`) |
| `omp config get isolation.backend --json` | `{"value":"rcopy","type":"enum","description":"Backend used for subagent isolation and worktree cloning"}` — **no enum values exposed** |
| `omp config get task.isolation.*` | `enabled=true`, `apply=true` ("apply successful isolated task changes to parent"), `merge="branch"` (patch apply or branch merge), `commits="ai"` (generic or AI-generated commit messages) |
| `omp config get worktree.*` | `base` unset → `~/.omp/wt`; `onStart=off`; `onExit=remove`; `clone=true` (copy-on-write clone so `node_modules`/`target` carry over); `cleanSource=false`; `session.worktreeScope=repo` |
| `omp worktree --help` | `omp worktree [list|clear|add] [PATH] [COMMIT]` with `-b/-B/-C`, `--dry-run`, `--all`, `--json`. `clear --dry-run` prints what would be removed; `add -b feature ../path` creates a branch+worktree |
| `omp worktree list --json` | Entries carry `{path, kind:"task-isolation", orphanReason:"task-isolation leftover (no live task owns it)"}` — omp already has orphan classification |
| `omp --config <overlay with bogus keys including isolation.backend: definitely-not-a-backend> --version` | Prints `18.18.5`, **exit 0** — this probe validates nothing about overlay keys/values |
| `omp --config <overlay with title.generator:none, compaction.idleEnabled:true> config get title.generator` / `compaction.idleEnabled` | `tiny` / `false` — `omp config get` reports **persisted** config and ignores `--config`; it cannot be used to validate an overlay |
| `omp config list --json` (filtered) | `compaction.enabled=true`, `compaction.asyncEnabled=true`, `compaction.idleEnabled=false`, `compaction.idleThresholdTokens=200000`, `compaction.idleTimeoutSeconds=300` ("with a 1-hour prompt cache, compaction instead runs just before the cache expires"), `compaction.keepRecentTokens=20000`, `compaction.methodOrder=[remote,snapcompact,handoff,shake,soft]`, `compaction.handoffSaveToDisk=true`, `compaction.dropUseless=true` ("cache-aware"), `compaction.supersedeReads=true` ("cache-aware"), `providers.cacheRetention=short`, `providers.cacheWarming=streaming` ("Re-send the last request with a one-token output budget shortly before its prompt-cache entry expires"), `display.cacheMissMarker=true` |
| `omp models --help` | Supports `-e/--extension` and `--config` when listing models — the plausible seam for a scripted provider extension |
| `omp --help` | No `--isolated`/isolation flag; isolation is config-driven. `--cwd`, `--session-dir`, `--resume`, `--config`, `--system-prompt`, `--no-session`, `--no-tools`, `--tools`, `--extension` exist |

### 5.3 What this proves / does not prove

**Proven:**
- omp exposes a configurable isolation backend (`isolation.backend`, default `rcopy`) and per-task isolation controls; the phrase in its own description ties the backend to *"subagent isolation and worktree cloning"*, i.e. it governs omp-managed worktrees as well as subagent tasks.
- omp has first-class worktree lifecycle commands (`worktree add|list|clear --dry-run`) with ownership/orphan metadata — a ready-made primitive for `cleanup`/`gc` of omp workspaces.
- omp exposes native compaction and prompt-cache-warming knobs, which item 20 can configure instead of building from scratch.
- `omp --config … --version` is not a config validator; `omp config get` cannot see an overlay.

**Not proven (spike items):**
- The allowed values of `isolation.backend` and whether `rcopy`/others affect retention on failure; whether `omp worktree add` honors it exactly like subagent task isolation.
- Whether a **root** omp process launched with `--cwd <omp-created worktree>` can use `isolated: true` meaningfully (factory agents do not spawn subagents; prompts forbid it), i.e. which omp mechanism maps to "workspace isolation" for factory agents.
- Whether omp `--config` fully accepts these keys at runtime (no validation error ≠ applied; `config get` ignores overlays, so only a real turn can prove it).
- Whether omp prompt caching keys on content or on transport path (`--system-prompt <path>`, `-p @<timestamped-path>`), which determines item 20c.
- How to register a scripted mock provider (extension API shape, catalog registration, streaming NDJSON contract).

---

## 6. Gap matrix — spec bullet vs current state

| Spec | Current state (evidence) | Missing work | Likely touchpoints |
|---|---|---|---|
| 19.1 isolation backend default + `isolation: omp|engine` + spike | Engine-only worktrees; no isolation key in schema/types/overlay; harness passes no isolation flags (`src/core/git/worktrees.ts:47-224`, `src/harness/omp/harness.ts:368-388`, `config/schemas/pipeline.schema.json:208,305`) | Spike + config field + backend abstraction (create/remove/retain workspace) + overlay keys + preflight compatibility | `src/core/engine.ts:266-272`, `src/core/flows/iteration.ts:2455-2470`, `src/core/git/worktrees.ts`, new workspace module, `config/pipeline.default.yaml`, `config/schemas/pipeline.schema.json`, `src/harness/omp/overlay.ts` |
| 19.2 preflight | Version + inert overlay check, role aliases, prompts/schemas, disk, per-task lock (`src/cli/preflight.ts:129-414`) | Isolation round-trip; real model/role resolvability; branches/worktrees-vs-records consistency; harness binaries beyond omp; remove hard-coded omp fallback | `src/cli/preflight.ts`, `src/core/git/{status,worktrees}.ts`, `src/core/config/roles.ts` |
| 19.3 whole-tree status / cleanup / gc + lock refusal | `status` one task; no `cleanup`/`gc` commands; per-task locks; runtime dirs `sessions/`, `prompts/`, `system-prompts/` never purged (only `tmp/` is: `src/core/runtime-tmp.ts:16-45`); orphan detection helpers partially exist (`parseWorktreeList` `src/core/git/status.ts:64-71`, `removeWorktree`) | Task/workspace index derived from records+git; saga/epic parent links; active-agent workspace+branch; cleanup semantics; gc orphan worktrees/branches/runtime/locks, dry-run default; lock guard across the whole tree | `src/cli/dispatch.ts:110-176`, `src/cli/status.ts`, `src/cli/lock.ts:21-95`, new `src/cli/{cleanup,gc}.ts`, `src/core/derive/task.ts`, `src/core/git/status.ts` |
| 19.4 commits from agent output | All messages engine-authored; `commitAll` accepts message + `paths` scope only (`src/core/git/commit.ts:9-30`; call sites in §4.9) | Commit message/scope fields in output schemas + prompts; thread them to step/merge commits; fallback rule (engine may only use agent-provided or mechanical text) | `config/schemas/review.schema.json`, `config/schemas/developer-output.schema.json`, `agents/steps/review.md`/`develop.md`, `src/core/flows/step-runner.ts:714-760`, `src/core/flows/merge-path.ts:381-422` |
| 19.5 wave-end merge + workhorse merger + escalation pointers | Merge already runs at wave end with deterministic gates; conflict handled by `developer` step `integrate`; failure → architect consult with evidence but no status/worktree/branch pointer; attempts bounded 2/wave (`src/core/flows/merge-path.ts:176-422`, `src/core/flows/iteration.ts:2706-2800,650-710`, `src/core/flows/consults.ts:110-136`) | Dedicated workhorse-class wave-end merger agent (trivial conflicts only) + prompt fragment; escalation payload with one-command status pointer and worktree+branch; contract tests | new `agents/wave-merger.md` + step fragment, `src/core/flows/merge-path.ts`, `src/core/flows/consults.ts`, `agents/steps/architect-consult-item.md`, `src/core/flows/iteration.ts:177-215` |
| 19.6 saga independent launches, parallel epics, escalation split | `saga` only a `TaskKind` (`src/core/artifacts.ts:166`, `config/schemas/triage.schema.json`); epics in-process (`src/core/engine.ts:123-226`); epic INTENT written under the **parent task dir on the parent branch** (`src/core/plan/apply.ts:9-16`), so `factory run <epic>` cannot resolve it from main; `q-epic-*` goes to the enclosing task, not a saga architect (`src/core/flows/epic-propagation.ts:20-33,116`) | Saga launcher (spawn independent `factory run` per epic in its own workspace), parent/saga identity+links, per-workspace locks, saga wave-end merge/escalation to saga architect, concern funnel upward | new saga/workspace orchestration module, `src/cli/run.ts:55-135`, `src/cli/dispatch.ts`, `src/core/flows/epic-propagation.ts`, `src/core/git/naming.ts:73-101` |
| 19.7 docs per use case | Existing ARCHITECTURE/IMPLEMENTATION/OMP_ADAPTER/FIRE_TEST; no use-case doc; docs sentinel test convention exists (`test/docs-concerns.test.ts:1-50`) | New/updated docs for single task, story waves, epic, saga+parallel, conflict/escalation, status/cleanup/gc + sentinel test | `plugins/software-factory/docs/*`, `test/docs-*.test.ts` |
| 19.8 no-model e2e through real omp | Only `FakeHarness` engine tests + one live smoke gated by `FACTORY_LIVE_OMP=1` (`test/harness/smoke-live.test.ts:9-12`); harness can take an alternative `ompBinary` (`src/harness/omp/types.ts:4-15`, precedent `test/engine/model-fallback.test.ts:44-53`) | Scripted mock model provider usable by real omp; e2e scenarios (isolation, merges/conflicts/escalations, saga/epic launches, restart, gc) without paid models | new harness test fixture/provider extension, `test/e2e/**`, `OmpHarness` options, possibly `src/harness/omp/overlay.ts` |
| 19.9 repo rules hydration | No `AGENTS.md`/rules handling anywhere in `src/` (grep); `PROMPT_VAR_DESCRIPTIONS`/`KNOWN_VARS` have no repo-rules var (`src/core/prompt-vars.ts:9-60`) | Deterministic repo-rule resolution from target repo; inject into architect + developer/qa/reviewer prompts across items/epics; verify per role | `src/core/prompts.ts`, `src/core/prompt-vars.ts`, `src/core/flows/step-runner.ts`, `agents/*.md`, preflight render checks |
| 20a compact before uncached resume | No cache awareness; resume threads a session id; on loss it starts fresh with full prompt (`src/core/flows/step-runner.ts:967-1000`); a deterministic brief already exists (`src/core/brief.ts:1-14,340-420`); omp `compaction.*` exists but is unused | Detect cold-cache resume (TTL/model switch), compact or switch to fresh+hydrated brief, measure cost delta | `src/harness/omp/harness.ts:286-351`, `src/core/flows/step-runner.ts:606-620`, `src/core/brief.ts`, `src/harness/omp/overlay.ts` |
| 20b warm cache on standby | Architect process exits every turn; no standby; `providers.cacheWarming` unused | Decide mechanism (long-lived/keepalive process vs omp warming config), measure vs uncached resume, config gate | `src/harness/omp/harness.ts`, `src/core/flows/iteration.ts` (architect turns), overlay |
| 20c cache-coherence audit | Additive `--resume`; deterministic system-prompt path; **timestamp+random prompt path every turn** (`harness.ts:311-316`); overlay regenerated per turn from config (`harness.ts:222-240`); no byte-stability test | Audit omp cache keying; make transport paths stable or prove content keying; add byte-stability tests for overlay/system prompt/prompts across turns | `src/harness/omp/harness.ts`, `src/harness/omp/overlay.ts`, `test/harness/*` |
| 20d optional optimizations | None | Handoff/compaction on resume, IRC escalation reply, restart | `src/core/brief.ts`, `src/core/flows/step-runner.ts`, overlay |
| 20-cost measurement | `Usage`/`StepUsage` only input/output/cost; parser drops `cacheRead/cacheWrite/cost.cacheRead` (`ndjson.ts:84-98,170-178`, `artifacts.ts:545-549`, `budget.ts:34-48`) | Add cache token fields end-to-end + records/derive/status/budget aggregation; use for defaults | `src/harness/types.ts:7-11`, `src/harness/omp/ndjson.ts`, `src/core/artifacts.ts:545-549`, `src/core/budget.ts`, `src/core/derive/task.ts`, `config/schemas/state.schema.json` |
| 20-plan schema-free architect vs PM structuring | Plan is schema-bound (`config/schemas/plan.schema.json`, `agents/steps/architect-plan.md:20`); PM already structures outlines into scheduled items (`agents/steps/pm-edits.md:1-25`) | Re-evaluate from measured plan-repair turns; possibly telegraphic plan + PM structuring of plan/edits | `agents/steps/architect-plan.md`, `agents/steps/pm-edits.md`, `src/core/plan/*`, `config/schemas/*` |

---

## 7. Existing tests & conventions

**Runner and gates**
- `bun test` (Bun test runner, no config file), `bun run typecheck` (`tsc --noEmit`) — `plugins/software-factory/package.json:11-13`; strict TS incl. `noUncheckedIndexedAccess` (`plugins/software-factory/tsconfig.json`). The repo's own gate hints are in `.factory/project.yaml` `scripts.setup/typecheck/test`.
- Tests live under `test/**/*.test.ts` and import source directly; no mocks for git or filesystem.

**Core helpers**
- `createTmpRepo()` builds a real temporary git repo, tracks worktrees, commits with fixed identity, and cleans up on exit (`test/helpers/tmp-repo.ts:1-90`).
- `FakeHarness` scripts outcomes **by exact `AgentRun.label`**, records all calls, models sessions and `sessionLost` (`src/harness/fake/fake-harness.ts:35-125`). This is how all engine-level behavior tests avoid models.
- Worktree behavior is tested against real git: `test/git/worktrees.test.ts:1-60` (first-run cleanliness, idempotence, child worktrees, removal preserving branch).

**Behavior test patterns relevant to 19**
- Epic execution end-to-end with FakeHarness, asserting branch existence, child-closeup, derived item status `merged`, and merged file content: `test/engine/epic-child-task.test.ts:78-218`.
- Merge conflict → integrate resolution: `test/engine/merge-conflict.test.ts:1-50`; merge gate evidence/attempt ledger: `test/engine/merge-gate-evidence.test.ts`; redrive/stranded: `test/engine/merge-redrive-stranded.test.ts`.
- Crash/restart record repair: `test/engine/crash-restart.test.ts:1-50`; derived state: `test/engine/derive-gaps.test.ts`.
- CLI output/exit conventions: `test/cli/cli.test.ts:1-70` (arg parsing, lock lifecycle), `test/cli/status-concerns.test.ts:1-50` (capture `console.log/error` into a string, assert sections).
- Docs closure sentinel: `test/docs-concerns.test.ts:1-50` — asserts needles inside named doc sections/YAML commentary blocks so docs edits are test-enforced. Reuse this for the 19.7 use-case docs.
- Live omp tests are opt-in only: `FACTORY_LIVE_OMP=1 bun test test/harness/smoke-live.test.ts` (`test/harness/smoke-live.test.ts:9-12`).
- Process-level harness tests substitute a mock `ompBinary` shell script (`test/engine/model-fallback.test.ts:44-53`, `test/harness/omp-harness.test.ts:84-90,286-311`) and assert classification/timeout/session behavior. For 19.8 this is the precedent for a scripted provider, but the spec requires going through **real omp**, so a mock *binary* alone will not satisfy it.

**Conventions to follow**
- Behavior tests only: assert committed records, `journal.ndjson` events, git graph/worktree state, CLI output — not private helpers.
- Every engine decision is journaled (`appendJournal`) and records are committed before/after each step; new features should add journal events + record artifacts so restart/derive tests can prove idempotence.
- Schemas are draft-07 with `additionalProperties:false`; optional new fields are backward-compatible, required fields are not.
- Preflight validates every prompt fragment against `KNOWN_VARS` and renders with sample vars (`src/cli/preflight.ts:292-360`), so new prompt variables/fragments must be registered in `src/core/prompt-vars.ts`.

---

## 8. Open questions & spike outlines (for the architect)

### Isolation semantics (must settle before 19.1 design)
1. **Isolation backend contract.** `isolation.backend` is an enum defaulting to `rcopy`; what are the values, and does it control (a) subagent task isolation only, (b) `omp worktree add` cloning, or both? Probe candidate: throwaway profile (`--profile`) + `config set`, then a temp repo `omp worktree add -b topic/probe <tmp> HEAD`, inspect branch/commits, then `omp worktree clear --dry-run`.
2. **Retention on failure.** Prior spike proves `isolated:true` discards branch commits on non-zero exit (`docs/spikes/omp-1-topology.md:201`). Does an omp-managed worktree via `omp worktree add` + `omp --cwd` retain everything like engine worktrees? Test with a failing/aborted turn.
3. **Root-process isolation.** Factory agents are top-level omp processes, not omp subagents. Which omp mechanism is the "workspace" for such a process — `omp worktree add` + `--cwd`, `--add-dir`, or `task.isolation`? Document the mapping and the fallback to `isolation: engine`.
4. **Merge-back ownership.** omp has `task.isolation.{apply,merge,commits}`; the spec still requires deterministic CI gates and wave-end merger. Decide whether omp ever performs the merge (then gates) or only creates workspaces and the engine keeps merging. Evidence needed: can omp's `commits: ai` produce a usable message from structured output, or is it generic?
5. **Config validation.** `omp --config ... --version` accepts bogus keys (probe), and `omp config get` ignores overlays. A real preflight round-trip must actually launch omp. Define the cheapest safe probe (e.g. `omp -p --no-session --tools= --model @role "reply OK"` in a temp clone, or an `omp worktree add`-based round-trip).
6. **Model/role resolvability.** `omp models ls --json` (with `-e`) may enumerate catalogs; overlays define `modelRoles`. Determine whether any CLI validates `--model @role` + overlay without a paid turn; otherwise preflight can only resolve roles structurally (current behavior) plus a first-turn fallback.

### Lifecycle (19.3)
7. **Index source.** Derive the whole tree on demand from `{orch}/*/INTENT.md`, `items/*/child-closeup.yaml`, `journal.ndjson`, task dirs and `git worktree list --porcelain` (`parseWorktreeList`, `src/core/git/status.ts:64-71`), or persist a registry file? The spec says "derived from records + git" and "idempotent", which favors on-demand derivation; a registry risks drift.
8. **Parent links.** Epic child dirs are nested under the parent task dir but live on the parent branch; saga→epic links are only implicit in `plan.epics` (`config/schemas/plan.schema.json:85-95`) and `child-closeup.yaml`. Define the link record used by status/gc/escalation.
9. **Cleanup vs gc semantics.** `cleanup` = finished (merged/done) workspaces; `gc` = orphaned worktrees/branches/runtime files/stale locks, dry-run default. Which branches are deletable (merged only? superseded? failed after N days?), and how to treat omp-managed worktrees (`kind: task-isolation`, `orphanReason`) vs engine worktrees. `removeWorktree` keeps branches (`worktrees.ts:170-189`); `omp worktree clear` removes omp-owned ones.
10. **Lock refusal across a tree.** Locks are per task (`src/cli/lock.ts:45-55`). Whole-tree commands must refuse if *any* run lock is live; parallel epics need per-workspace locks plus a saga-level coordination lock (merge/status writes). Dead-PID takeover exists only per file (`:57-95,109-246`).

### Saga (19.6)
11. **Launch mechanics.** Each epic = independent `factory run` in its own workspace. Today `factory run <epic>` cannot resolve an epic INTENT because `resolveTaskSlug`/`runFactory` copy INTENT from the **main checkout** into `{repoRoot}/{orch}/{epic}/INTENT.md` (`src/cli/run.ts:27-75`), while epic INTENT lives under the parent task dir on the parent branch (`src/core/plan/apply.ts:9-16`). Decide: new `factory run --parent <task> --workspace <path> <epic>` or a saga launcher that spawns children with explicit INTENT path/branch.
12. **Process orchestration.** Who supervises child factories (exit codes 0/10/1), restarts, and parallelism? How are child stdout/journal/status surfaced to the saga status command? How do saga wave-end merges happen — the saga architect merges epic branches onto a saga branch, or epics merge directly to main?
13. **Escalation split.** Inside an epic, merge escalation must reach the epic architect (currently parent task architect for all items, `src/core/flows/iteration.ts:650-710`); at saga wave end it must reach the saga architect. Define the architect-session/ownership map per workspace and how consults are routed.

### Cache/compaction (item 20)
14. **Cache-key audit.** Determine whether omp caches on message content or transport path. Concrete suspicion: the per-turn prompt file path `prompt-<ts>-<rand>.txt` (`harness.ts:311-316`) and regenerated overlay (`harness.ts:222-240`). Add a test that renders the same prompt twice and compares system-prompt bytes, overlay bytes, and argv (the only unstable part should be the prompt filename; then verify omp behavior with a live probe using `providers.cacheRetention`/`display.cacheMissMarker`).
15. **Compaction mechanism.** omp auto-compacts inside a session (`compaction.*`); there is no CLI `compact` command in `omp --help`. To "compact before an uncached resume", decide between (a) relying on omp auto-compaction triggered before resume, (b) starting a fresh architect session with the existing deterministic brief (`buildArchitectBrief`) and recording it as the handoff, (c) a long-lived architect process. Measure cost with cacheRead/cacheWrite tokens.
16. **Warm-on-standby.** The architect process exits after every turn; `providers.cacheWarming=streaming` only helps a live/last request. Decide whether to keep a standby process (cost) or treat warming as off by default; the spec allows "explicitly off where it does not pay".
17. **Measurement plumbing.** Add `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, and cost sub-fields to `Usage`/`StepUsage`/records/derived status before choosing defaults; update `budget.ts` aggregation and `state.schema.json` if surfaced.
18. **Schema-free plan.** Count plan-repair turns and their cost from records (`architect-plan-*` attempts, repair records, usage) before changing the contract. The PM already structures item edits from plan outlines; the open question is whether the architect should emit telegraphic markdown for the plan itself and let PM produce both `plan` and `edits` schemas.

### Repo rules (19.9)
19. **Rule sources and precedence.** Which files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.omp/rules`?), from repo root and subdirs, and how they combine with factory agent definitions. Confirm whether omp already injects context files into a root process launched with `--system-prompt` (its config exposes `contextFiles.extra` and `--no-context-files`), to avoid double injection. Verify per role with a probe agent that must quote a sentinel rule.

### No-model e2e (19.8)
20. **Mock provider seam.** omp supports `--extension` and `omp models -e`, so a scripted provider extension is the most likely route; alternatively an OpenAI-compatible local endpoint registered via overlay if omp supports custom provider definitions. Define the canned scenario format (turn-by-turn NDJSON: text, tool calls, yield), and prove the real omp binary runs a full factory flow against it with zero paid calls.

---

## 9. Verification commands (baseline)

```bash
cd plugins/software-factory
bun test                       # full behavior suite
bun run typecheck              # tsc --noEmit
FACTORY_LIVE_OMP=1 bun test test/harness/smoke-live.test.ts   # opt-in real omp smoke (paid models)

# omp mechanics probes (read-only)
omp --version
omp config list --json | jq 'to_entries[] | select(.key|test("isolation|worktree|compaction|cache"))'
omp worktree list --json
omp worktree clear --dry-run   # dry-run only
```

---

## 10. Notes for the architect

- **Do not re-derive** the following: merge is already wave-end per item; gates/target-green already run deterministically on tree change; conflict handling exists but uses `developer/integrate`; epics are in-process and merge like items; `factory status` is task-scoped; commit messages are engine-invented; usage lacks cache tokens; omp exposes native compaction/warming/worktree-lifecycle config.
- **Suggested epic split** (sizing only; the architect decides): (A) isolation backend + workspace abstraction + preflight round-trip + whole-tree status/cleanup/gc; (B) agent-authored commits + wave-end merger agent + escalation pointers; (C) saga independent launches + parallel epics + escalation/funnel routing; (D) cache/compaction measurement & policy; (E) no-model omp e2e harness + repo-rules hydration + use-case docs. A/B share workspace primitives; C depends on A; D is independent but benefits from A's workspace cleanup; E spans all and should land last per epic with a thin slice early (mock provider spike) to de-risk.
- **Start with a fact-finder spike item** per the intent: it must answer questions 1–6 (§8) with throwaway temp repos and a throwaway omp profile, and produce a decision record on the omp↔engine isolation mapping before any engine code changes.


## Task Status
iteration: 1
amendments: 2
items:
  - spike-omp-isolation kind=fact-finder wave=1 status=failed outlineRef=spike-omp-isolation
  - spike-mock-provider kind=fact-finder wave=1 status=failed outlineRef=spike-mock-provider
  - spike-cache-key kind=fact-finder wave=1 status=failed outlineRef=spike-cache-key
  - spike-repo-rules kind=fact-finder wave=1 status=failed outlineRef=spike-repo-rules
  - usage-cache-tokens kind=dev wave=2 status=merged outlineRef=usage-cache-tokens
  - transport-byte-stability kind=test-only wave=2 status=merged outlineRef=transport-byte-stability
  - merge-setup-fix kind=dev wave=2 status=merged outlineRef=merge-setup-fix
  - spike-findings-recovery kind=no-behavior wave=2 status=failed outlineRef=spike-findings-recovery
  - spike-findings-recovery-v2 kind=no-behavior wave=3 status=merged outlineRef=spike-findings-recovery-v2
  - target-green-ratchet-fix kind=dev wave=3 status=merged outlineRef=target-green-ratchet-fix
waves: 1, 2, 3
merged: usage-cache-tokens, transport-byte-stability, merge-setup-fix, spike-findings-recovery-v2, target-green-ratchet-fix
blocked: (none)
failed: spike-omp-isolation, spike-mock-provider, spike-cache-key, spike-repo-rules, spike-findings-recovery
open steer questions:
  - q-adr-cache-fields-additive-87bb471f5e ref=adr-cache-fields-additive disposition=human-awareness: Remarkable architectural decision adr-cache-fields-additive (Cache-token usage fields are additive and optional end to end) recorded for awareness.
  - q-adr-iter1-spikes-first-402887ef39 ref=adr-iter1-spikes-first disposition=human-awareness: Remarkable architectural decision adr-iter1-spikes-first (Iteration 1 runs spikes + measurement only; epics deferred to iteration 2) recorded for awareness.
  - q-adr-real-binary-e2e-4938cae2f4 ref=adr-real-binary-e2e disposition=human-awareness: Remarkable architectural decision adr-real-binary-e2e (No-model e2e drives the real omp binary with a scripted provider; FakeHarness retained for engine tests) recorded for awareness.
  - q-adr-whole-tree-index-45f9d196da ref=adr-whole-tree-index disposition=human-awareness: Remarkable architectural decision adr-whole-tree-index (Whole-tree status/cleanup/gc derive on demand from records + git; no persistent registry) recorded for awareness.
  - q-concern-c-8a26e7294b ref=spike-findings-recovery-v2 disposition=human-awareness: Confirmed by attempt-1 checks (TS2688 no @types/bun, Cannot find package 'yaml') vs attempt-2 green after bun install. Not item-fixable: this is a docs-only item and its gates already pass via baseline ratchet (684 pass, 1 fail = known baseline disk-space test). Architect should decide on adding dependency setup to the gate runner so future docs-only items don't fail environmentally.

## Human involvement
# Human involvement criteria

Mode selects which ADR and concern decisions need a human decision. Everything
else is either autonomous or digest-only; never block on items the table marks
remarkable.

## Blocking table (ADRs and concerns)

| Mode | Blocking (needs human decision) | Remarkable (digest only) |
| --- | --- | --- |
| autonomous | high-severity ADRs/concerns still blocking after unblocked work | everything else |
| principal | stack/layer, external interfaces, config shapes | internal choices |
| detailed | external-interface changes and major internal interfaces | minor internals |

## autonomous

Block only explicit high-severity ADRs/concerns that remain after all unblocked
work is finished. Do not stop for internal choices; record them as remarkable.

## Open Concerns
- id: c-19cad43406
  kind: risk
  severity: medium
  summary: Per-turn prompt transport path embeds timestamp+randomness
  affects:
    - 20c
  status: routed
  disposition: optional
- id: c-317a4e9b8b
  kind: risk
  severity: high
  summary: Usage parser discards cache-read/write tokens needed for item 20 defaults
  affects:
    - 20-cost
    - 20a
    - 20b
    - 20d
  status: routed
  disposition: optional


- Raise concerns with evidence; settle pending close-up proposals with concernConfirms accept/reject (applyConcernConfirms): accept applies the pending action — resolve closes, carry routes to the architect, dismiss closes with the pending note as reason, propagate clears the local proposal for the epic push — while reject clears the proposal unchanged; accepting a dismiss proposal with an empty pending note fails the step. Condense stale detail instead of repeating it.

## Output

Yield a structured JSON object matching this schema:
- id (string, optional): Unique identifier for this decision (assigned by engine if omitted)
- context (string, optional, enum: ["item","non-item","wave","plan-closeup"]): Decision context scope (item, non-item, wave, plan-closeup)
- decision (string, required, enum: ["retry-with-guidance","split","escalate","accept-with-debt","abandon","fix-item","human-async","abort","continue","amend","end-iteration","complete","next-iteration","blocked"]): Architect decision verdict
- rationale (string, optional): Technical justification for this decision
- text (string, optional): Concrete guidance or steering directives
- persist (boolean, optional): Whether guidance persists across subsequent attempts
- outlines (array of object, optional): Decomposed item outlines when decision is split, or new/replacement item outlines when decision is amend (PlanItemOutline shape: slug, kind, title, description?, milestoneId?, deps?, etc.)
- removeItemSlugs (array of string, optional): Slugs of pending items to remove / supersede when decision is amend
- outline (object, optional): Item outline to schedule when decision is fix-item
- debt (string, optional): Technical debt description when decision is accept-with-debt
- reason (string, optional): Reason for abandonment or abort
- question (string, optional): Specific question for human operator when decision is human-async or blocked
- target (object, optional): Corrected developer target from a merge-verify consult, applied to the merge verification instead of the record's stale target (unknown-gate recovery). One of {gate: <infra gate id>}, {selectors: [<test ids>]}, or {command, customTarget: true}.
  - gate (string, optional)
  - selectors (array of string, optional)
  - expectRed (array of string, optional)
  - command (string, optional)
  - customTarget (boolean, optional)
- planDelta (string, optional): Plan delta or amendment directives when decision is amend
- timestamp (string, optional): ISO timestamp (assigned by engine if omitted)
- concerns (array of object, optional): Structured concerns raised by the architect
  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
  - summary (string, required)
  - detail (string, optional)
  - severity (string, optional, enum: ["low","medium","high"])
  - location (object, optional)
    - file (string, required)
    - line (integer, optional)
  - affects (array of string, optional)
- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
  - chosen (string, required)
  - why (string, required)
  - alternatives (array of string, required)
- concernConfirms (array of object, optional): Architect confirmations for close-up concern resolutions
  - id (string, required)
  - note (string, optional)
  - confirm (string, required, enum: ["accept","reject"])
- concernResolution (object, optional): Direct concern resolution applied when the decision commits
  - id (string, required)
  - note (string, optional)
  - action (string, required, enum: ["resolve","carry"])
