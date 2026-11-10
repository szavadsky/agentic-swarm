# Step: Architect Consult (Item)

## Goal
Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.

## Rules
- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — `omp-workspaces` (factory.v2 spec items 19 + 20)

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
`). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.

## Item
spike-mock-provider

## Assignment
{"slug":"spike-mock-provider","kind":"fact-finder","title":"Spike: scripted mock provider seam for real omp","assignment":"Fact-finder spike, no prod code. Probe installed omp extension/provider registration with throwaway --profile and temp dirs (parallel-safe). 1) Probe extension API and model catalog listing via -e/--config overlays; enumerate any custom-provider/local-endpoint seam. 2) Capture streaming NDJSON contract for a scripted turn (events, usage, yield envelope). 3) Propose canned scenario format {turns: [{yield|toolCalls|text}]} sufficient for M8 runner. 4) Prove one minimal real-omp turn against a scripted provider with zero paid-model calls, or rule the seam out with command/output evidence. Outputs: items/{item}/findings.md with probe log, full draft for plugins/software-factory/docs/spikes/omp-4-mock-provider.md, draft decision YAML {status, decision, evidence, followUps} naming the chosen seam plus scenario format (or ruled-out alternatives). Constraints: read-only on repo prod paths; cwd=plugins/software-factory; throwaway profile/repos only; poc/runner implementation deferred to M8, proposal only. Acceptance: answers M1 mock-provider scenario.","outlineRef":"spike-mock-provider","milestone":"m1-omp-de-risk","wave":1,"scenarioRefs":["m1-omp-de-risk:scenario-2"],"citations":["docs/factory.v2.md:104-113","plugins/software-factory/docs/ARCHITECTURE.md:40","plugins/software-factory/src/cli/preflight.ts:365-393"]}

## Prior Attempts & Failures
Merge path failed for spike-mock-provider (attempt 2/2)

## Current Diff
diff --git a/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/input.md
new file mode 100644
index 0000000..6ab5362
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/input.md
@@ -0,0 +1,113 @@
+# Step: Research
+
+## Goal
+Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.
+
+## Rules
+- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
+- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
+- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
+- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
+- Fix-round re-entry: when `Review Feedback` below is non-empty, this is a fix round. Address ONLY the listed concerns with targeted follow-up investigation; do NOT re-run the full probe from scratch.
+- Tool-call budget: aim to finish within ~60 tool calls (probes that re-read files run 60-90 calls and diverge). Batch reads, prefer `grep`/`ast_grep` over re-reading, and stop once findings answer the assignment.
+
+## Assignment
+{
+  "slug": "spike-mock-provider",
+  "kind": "fact-finder",
+  "title": "Spike: scripted mock provider seam for real omp",
+  "assignment": "Fact-finder spike, no prod code. Probe installed omp extension/provider registration with throwaway --profile and temp dirs (parallel-safe). 1) Probe extension API and model catalog listing via -e/--config overlays; enumerate any custom-provider/local-endpoint seam. 2) Capture streaming NDJSON contract for a scripted turn (events, usage, yield envelope). 3) Propose canned scenario format {turns: [{yield|toolCalls|text}]} sufficient for M8 runner. 4) Prove one minimal real-omp turn against a scripted provider with zero paid-model calls, or rule the seam out with command/output evidence. Outputs: items/{item}/findings.md with probe log, full draft for plugins/software-factory/docs/spikes/omp-4-mock-provider.md, draft decision YAML {status, decision, evidence, followUps} naming the chosen seam plus scenario format (or ruled-out alternatives). Constraints: read-only on repo prod paths; cwd=plugins/software-factory; throwaway profile/repos only; poc/runner implementation deferred to M8, proposal only. Acceptance: answers M1 mock-provider scenario.",
+  "outlineRef": "spike-mock-provider",
+  "milestone": "m1-omp-de-risk",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-omp-de-risk:scenario-2"
+  ],
+  "citations": [
+    "docs/factory.v2.md:104-113",
+    "plugins/software-factory/docs/ARCHITECTURE.md:40",
+    "plugins/software-factory/src/cli/preflight.ts:365-393"
+  ]
+}
+
+## Task Intent
+# omp-workspaces
+
+Implement spec items 19 and 20 of `docs/factory.v2.md` in `plugins/software-factory`
+(read both in full; they are the acceptance definition):
+- workspace isolation via omp's configurable isolation backend by default; engine-managed git worktrees kept
+  as `isolation: engine` option; start with a fact-finder spike on omp isolation mechanics
+  (prior research: `plugins/software-factory/docs/spikes/`);
+- preflight: omp version/config compatibility, isolation round-trip, models/roles resolvable, repo state;
+- idempotent status/cleanup/gc launcher commands (dry-run gc by default, refuse while a run holds the lock);
+- commit content from agents' structured output (engine never invents content);
+- wave-end merge: conflict-free → deterministic CI gates → merged; conflicts/red → workhorse wave-end merger
+  agent → unresolvable → architect escalation with status + worktree/branch pointers;
+- saga: each epic an independent factory launch in its own workspace (parallel epics), merge escalation to the
+  epic architect inside an epic and to the saga architect at saga wave end; concerns propagate upward;
+- architect context economy: compaction before an uncached resume, cache warm on standby where it pays,
+  cost-measured configurable defaults, re-evaluate schema-free telegraphic architect output with PM structuring;
+- docs per use case (single task, story waves, epic, saga with parallel epics, conflict/escalation paths,
+  status/cleanup/gc);
+- "no models" end-to-end tests through the real omp harness with a scripted mock model provider.
+Expected to be split into epics by the architect where complexity warrants; behavior tests only; terse prompts.
+
+
+## Context & Citations
+[
+  "docs/factory.v2.md:104-113",
+  "plugins/software-factory/docs/ARCHITECTURE.md:40",
+  "plugins/software-factory/src/cli/preflight.ts:365-393"
+]
+
+## Review Feedback
+
+
+## Open Concerns
+- id: c-477404c672
+  kind: risk
+  severity: high
+  summary: Preflight's omp overlay validation is a no-op
+  affects:
+    - "19.1"
+    - "19.2"
+- id: c-aaebfb4099
+  kind: question
+  severity: medium
+  summary: Parallel epics need lock/merge coordination beyond per-task locks
+  affects:
+    - "19.3"
+    - "19.6"
+- id: c-ba416d7313
+  kind: risk
+  severity: medium
+  summary: No mock model provider exists; live omp tests are paid-only and opt-in
+  affects:
+    - "19.8"
+
+
+- Review the concerns above before starting; they constrain this step but are not part of the assignment.
+- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","inconclusive"])
+- summary (string, required)
+- findings (string, required)
+- contextPack (string, optional)
+- sources (array of string, optional)
+- recommendations (array of string, optional)
+- concerns (array of object, optional): Structured concerns raised while investigating
+  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
+  - summary (string, required)
+  - detail (string, optional)
+  - severity (string, optional, enum: ["low","medium","high"])
+  - location (object, optional)
+    - file (string, required)
+    - line (integer, optional)
+  - affects (array of string, optional)
+- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
+  - chosen (string, required)
+  - why (string, required)
+  - alternatives (array of string, required)
diff --git a/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/meta.yaml
new file mode 100644
index 0000000..8eebaa2
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/meta.yaml
@@ -0,0 +1,20 @@
+seq: 1
+name: research
+attempt: 1
+fixRound: 1
+agent: fact-finder
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 3600
+status: ok
+startedAt: 2026-11-09T23:41:25.126Z
+session: 01a1c2b0-23f3-749f-9d53-1d80a5467b6b
+endedAt: 2026-11-10T00:00:31.957Z
+usage:
+  inputTokens: 177310
+  outputTokens: 90586
+  costUsd: 0.09724
+repairedFrom: ask
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-41-25-876Z_01a1c2b0-23f3-749f-9d53-1d80a5467b6b
diff --git a/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/output.yaml
new file mode 100644
index 0000000..e16d43b
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/output.yaml
@@ -0,0 +1,225 @@
+status: ok
+summary: Extension -e + pi.registerProvider + local OpenAI-compatible SSE seam
+  verified end-to-end on real omp/18.18.5 with zero paid-model calls; scenario
+  format {turns:[{text|toolCalls|yield}]} proposed.
+findings: |
+  # Spike: scripted mock provider seam for real omp (M1)
+
+  Status: ok. Environment: omp/18.18.5 (`omp/18.18.5`), Bun 1.4.4, Linux x64 WSL2. Throwaway profiles and temp dirs; zero paid-model calls.
+
+  ## Verdict
+
+  Chosen seam: an omp extension loaded with `-e/--extension` calls `pi.registerProvider('mock', { api: 'openai-completions', baseUrl: 'http://127.0.0.1:<ephemeral>/v1', apiKey: 'mock-key', models: [{ id: 'mock-chat', name: 'Mock Chat', api: 'openai-completions', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 }] })`, backed by a local OpenAI-compatible SSE server.
+
+  Scenario format: `{turns: [...]}`; each turn is one assistant/model response (one HTTP POST):
+  - `{text: '...'}` text, finish stop, ends the agent turn.
+  - `{toolCalls: [{name, arguments}, ...]}` executes tools; next POST consumes next turn.
+  - `{yield: {data: ...}}` emits terminal `yield`; observed no further provider request.
+  Optional per-turn `usage`, `finishReason`; optional top-level `match`, `onExhausted`.
+
+  Proven: catalog listing (`omp models -e ... --json` -> `mock/mock-chat`); real text turn; yield envelope; read->yield tool loop; two parallel tool calls; session resume; @role resolution via `--config` modelRoles; parallel processes; OmpHarness.run and complete.
+
+  Ruled out: `--config` is a settings overlay, not a provider registry. `providers:` in `--config` was ignored; `omp models --config cfgprov.yml` did not list it. `models.yml` in a temp agent dir works (second choice).
+
+  ## Probe log
+
+  P1 `omp --version` -> `omp/18.18.5`; help has `-e`, `--config`, `--profile`, `--mode json`, `--no-session`, `--tools`.
+  P2 extension API: `typeof pi.registerProvider === 'function'`; `pi.pi` exposes `createAgentSession`, `runSubprocess`, `AgentSession`, `SessionManager`.
+  P3 `omp --profile ... models -e mock-provider.ts --json` -> selector `mock/mock-chat`, kind chat, cost 0.
+  P4 root-level `omp -e ... models` did not load the extension; place `-e` after `models`. Root-level `-e` works for `-p` sessions.
+  P5 text turn: exit 0; text `MOCK_OK`; usage `input:123, output:6, totalTokens:129, cost.total:0`; `agent_end` `isTerminal:true, yielded:true`.
+  P6 yield turn: exit 0; one POST; `tool_execution_start` args `{data:{status:'OK',count:42}}`; `tool_execution_end` result `details.data` identical; `turn_end` `stopReason:'toolUse'`; `agent_end`.
+  P7 read then yield: 2 POSTs; second request includes `role:'tool'` result.
+  P8 two reads in one response: 2 tool results then yield.
+  P9 resume: first process text `TURN1_TEXT`; second `--resume <id>` sends `system,user,assistant,user`, prior text present; yield `{resumed:true}`.
+  P10 parallel: two profiles/servers; both exit 0; one POST each.
+  P11 role overlay `modelRoles: {probe: mock/mock-chat}` + `--model @probe` -> wire model `mock-chat`, exit 0.
+  P12 SSE usage `prompt_tokens:100, cached_tokens:40, completion_tokens:5` -> usage `input:60, output:5, cacheRead:40, totalTokens:105`; cost computed from model rates.
+  P13 OmpHarness.run with wrapper `exec omp -e ext "$@"` -> `ok:true`, data `{status:'OK',via:'OmpHarness'}`, usage 111/9, costUsd 0, toolCallCount 1.
+  P14 OmpHarness.complete -> `{status:'OK',answer:42}`.
+  P15 models.yml via `PI_CODING_AGENT_DIR=<tmp>` -> `fileprov/file-model`; named profile works when file is at `omp config path`; absolute `PI_CONFIG_DIR=/tmp/...` was resolved under `$HOME/tmp` in 18.18.5, so verify.
+  P16 `--config` providers block ignored.
+  P17 preflight no-op: `omp --config /tmp/no-such-overlay.yml --version` prints version and exits 0; real `omp --config <missing> -p ...` exits 1 `Config overlay not found`; `models --config <missing>` exits 1.
+
+  ## NDJSON contract (omp 18.18.5)
+
+  `omp --mode json` emits one JSON object per line. Text turn sequence: `session`, `agent_start`, `turn_start`, user `message_start`/`message_end`, assistant `message_start` (usage zeros), `message_update` (`text_start`/`text_delta`/`text_end`), assistant `message_end` (real usage), `turn_end` (message + toolResults), `agent_end` (`messages`, `isTerminal:true`, `yielded:true`). Tool turn adds `tool_execution_start`/`tool_execution_end`, a `toolResult` message, and if non-terminal, another provider POST.
+
+  Usage fields: `turn_end.message.usage` has `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens`, `cost.{input,output,cacheRead,cacheWrite,total}`. `message_start.usage` is zeroed. `cacheRead` comes from `prompt_tokens_details.cached_tokens`; `input` = `prompt_tokens - cached_tokens`; cost from model cost rates. `agent_end.yielded` is true even for text-only turns, so not a yield signal.
+
+  Yield envelope: yield data appears in `turn_end.message.content[].toolCall.arguments.data`, `agent_end.messages[].content[].toolCall.arguments.data`, `tool_execution_start.args.data`, and `tool_execution_end.result.details.data` (parser `ndjson.ts:73-142`). Yield is terminal: one POST, no follow-up. Parser references: `src/harness/omp/ndjson.ts:52-150`.
+
+  ## Scenario format
+
+  ```jsonc
+  {
+    'name': 'developer-writes-and-yields',
+    'match': { 'model': 'mock-chat', 'systemContains': 'Developer', 'promptContains': 'implement' },
+    'onExhausted': 'error',
+    'turns': [
+      { 'toolCalls': [{ 'name': 'write', 'arguments': { 'path': 'src/hello.ts', 'content': 'export const hello = 1;\n' } }], 'usage': { 'input': 1200, 'output': 40, 'cacheRead': 800 } },
+      { 'yield': { 'data': { 'status': 'done', 'summary': 'added hello' } }, 'usage': { 'input': 1500, 'output': 20, 'cacheRead': 1400 } }
+    ]
+  }
+  ```
+
+  Types: `UsageSpec` {input?,output?,cacheRead?,cacheWrite?,cost?}; `ToolCallSpec` {name,arguments,id?}; `Turn` = text | toolCalls | yield | error {status?,message}; `Scenario` {name?,match?,onExhausted?,turns}. Semantics: sequential per server; one POST per turn; toolCalls continue; yield terminates; text ends; `onExhausted` default error or repeatLast; `match` assertions fail with 500; resume cursor keyed by session id/label. Error turns optional, not probed.
+
+  ## M8 integration
+
+  OmpHarness currently hard-codes args without `-e` (`harness.ts:368-388`, `:707-715`). Proven wrapper: `#!/bin/sh; exec /home/slava/.bun/bin/omp -e /tmp/mock-provider.ts "$@"` passed as `ompBinary`; both run and complete succeeded. Recommended: add `extraArgs`/`mockProvider` to OmpHarness. Proposed `test/e2e/mock-provider/{extension,server,scenario,runner}.ts`; gate with `FACTORY_E2E_OMP=1`, keep paid `FACTORY_LIVE_OMP=1` separate. Select scenario by `run.label` (like `FakeHarness.scriptOutcome`). Use per-test ephemeral port/profile or `PI_CODING_AGENT_DIR`, `--no-session`, `--no-extensions -e mock-ext`, explicit `mock/mock-chat`; assert request log only mock-chat and `usage.costUsd === 0`.
+
+  ## Decision YAML
+
+  ```yaml
+  status: accepted
+  decision: >
+    Adopt the omp extension provider seam: per-process `-e mock-provider.ts` calls
+    `pi.registerProvider('mock', {... openai-completions ...})` against a local scripted SSE server.
+    Scenarios are `{turns: [{text}|{toolCalls}|{yield}]}`; one turn per provider request; toolCalls continue,
+    yield terminates. Use an OmpHarness wrapper now; add `extraArgs`/`mockProvider` in M8. Keep
+    `models.yml` in a temp agent dir as fallback; `--config` is only for settings/modelRoles.
+  evidence:
+    - 'omp/18.18.5; omp models -e mock-provider.ts --json lists mock/mock-chat (P3).'
+    - 'Real text turn MOCK_OK, usage 123/6, cost.total 0 (P5).'
+    - 'Yield turn details.data {status:OK,count:42}, stopReason toolUse, agent_end (P6).'
+    - 'Tool loop and two parallel tool calls then yield (P7/P8).'
+    - 'Resume sees prior TURN1_TEXT and yields (P9).'
+    - 'OmpHarness.run and complete pass with mock wrapper, cost 0 (P13/P14).'
+    - 'Parallel profiles/servers both exit 0 (P10).'
+    - 'Preflight --config ... --version exits 0 with missing overlay (P17).'
+  followUps:
+    - 'M8: add extraArgs/mockProvider; implement test/e2e/mock-provider.'
+    - 'M8: gate FACTORY_E2E_OMP=1; keep FACTORY_LIVE_OMP=1 separate.'
+    - 'Replace preflight --version overlay check with omp models --config or a real mock turn; add version floor.'
+    - 'Pin/minimum omp version; re-run spike on upgrade.'
+    - 'Persist scenario cursor by session id for resume/restart.'
+  alternatives:
+    - 'models.yml custom provider (works; second choice).'
+    - '--config providers block (ignored).'
+    - 'Built-in Ollama/LM Studio (requires local runtime).'
+    - 'FakeHarness/mock binary (not real omp).'
+  ```
+
+  ## Risks / concern cross-check
+
+  - Preflight overlay validation no-op confirmed (`c-477404c672`): `preflight.ts:383-385` uses `--version`; missing overlay exits 0; real session exits 1. High risk 19.1/19.2.
+  - OmpHarness no extra-args seam: wrapper works but add `extraArgs`/`mockProvider`; medium, 19.8.
+  - Flag placement: `-e`/`--config` after `models` for catalog; root-level for sessions.
+  - `PI_CONFIG_DIR` absolute path resolved under `$HOME` in 18.18.5; use `PI_CODING_AGENT_DIR`/real profile and verify `omp config path`.
+  - `agent_end.yielded` true for text-only; use yieldData.
+  - `models.yml` works with temp `PI_CODING_AGENT_DIR`; named-profile caveat is path resolution.
+  - `c-aaebfb4099` out of scope; parallel mock probing is safe but doesn't address epic lock/merge.
+  - `c-ba416d7313` disproved: zero-paid real-omp mock path exists.
+
+  ## Sources
+
+  - `docs/factory.v2.md:104-113`
+  - `plugins/software-factory/docs/ARCHITECTURE.md:40`
+  - `plugins/software-factory/src/cli/preflight.ts:365-394`
+  - `plugins/software-factory/src/harness/omp/harness.ts:368-388`, `:525-570`, `:707-715`
+  - `plugins/software-factory/src/harness/omp/ndjson.ts:52-150`
+  - `plugins/software-factory/src/harness/omp/overlay.ts:26-86`
+  - `plugins/software-factory/src/harness/fake/fake-harness.ts:8-51`
+  - `plugins/software-factory/docs/spikes/omp-1-topology.md:55-104`
+  - `plugins/software-factory/docs/spikes/omp-2-cli-adapter.md:41-110`
+  - `plugins/software-factory/test/harness/smoke-live.test.ts:9-81`
+  - https://omp.sh/docs/extensions
+  - https://omp.sh/docs/models
+  - https://omp.sh/docs/providers
+  - https://omp.sh/docs/extension-loading
+  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/tools/yield.ts
+contextPack: "CHOSEN SEAM: omp extension -e mock-provider.ts ->
+  pi.registerProvider('mock', {api:'openai-completions',
+  baseUrl:'http://127.0.0.1:<ephemeral>/v1', apiKey:'mock-key',
+  models:[{id:'mock-chat', cost:0}]}) + local scripted SSE server. SCENARIO:
+  {turns:[{text}|{toolCalls:[{name,arguments}]}|{yield:{data|error}}]}, one turn
+  per provider POST; toolCalls continue, yield terminates; optional
+  usage/match/onExhausted. INTEGRATION: OmpHarness wrapper binary proven (exec
+  omp -e ext \"$@\"); add extraArgs/mockProvider in M8. NDJSON: session ->
+  agent_start -> turn_start -> user messages -> assistant message_start (usage
+  zeros) -> message_update deltas -> message_end/turn_end (real usage,
+  stopReason stop|toolUse) -> tool_execution_start/end -> agent_end (isTerminal,
+  yielded true even for text-only). Yield data appears in turn_end/agent_end
+  toolCall, tool_execution_start args, and tool_execution_end
+  result.details.data. HERMETICITY: --no-extensions -e, --no-session, temp
+  PI_CODING_AGENT_DIR or unique --profile, explicit mock/mock-chat, assert
+  server log + usage.costUsd===0. PREFLIGHT: omp --config overlay --version
+  ignores overlay (exit 0 even when missing); replace with omp models --config
+  overlay --json or a real mock turn. FALLBACK SEAM: models.yml in active agent
+  dir (verified with PI_CODING_AGENT_DIR); --config providers block is ignored."
+sources:
+  - docs/factory.v2.md:104-113
+  - plugins/software-factory/docs/ARCHITECTURE.md:40
+  - plugins/software-factory/src/cli/preflight.ts:365-394
+  - plugins/software-factory/src/harness/omp/harness.ts:368-388
+  - plugins/software-factory/src/harness/omp/harness.ts:525-570
+  - plugins/software-factory/src/harness/omp/harness.ts:707-715
+  - plugins/software-factory/src/harness/omp/ndjson.ts:52-150
+  - plugins/software-factory/src/harness/omp/overlay.ts:26-86
+  - plugins/software-factory/src/harness/fake/fake-harness.ts:8-51
+  - plugins/software-factory/docs/spikes/omp-1-topology.md:55-104
+  - plugins/software-factory/docs/spikes/omp-2-cli-adapter.md:41-110
+  - plugins/software-factory/test/harness/smoke-live.test.ts:9-81
+  - https://omp.sh/docs/extensions
+  - https://omp.sh/docs/models
+  - https://omp.sh/docs/providers
+  - https://omp.sh/docs/extension-loading
+  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/tools/yield.ts
+recommendations:
+  - "M8: add extraArgs/mockProvider to OmpHarness (or keep the proven wrapper)
+    and implement test/e2e/mock-provider/{extension,server,scenario,runner}.ts."
+  - "M8: gate no-model e2e with FACTORY_E2E_OMP=1; keep paid FACTORY_LIVE_OMP=1
+    separate."
+  - Use per-process mock extension with -e and --no-extensions, a unique profile
+    or temp PI_CODING_AGENT_DIR, --no-session, explicit mock/mock-chat; assert
+    server request log and usage.costUsd === 0.
+  - "Define scenario cursors per session id for resume/restart; default
+    onExhausted: error."
+  - Replace preflight's omp --config <overlay> --version no-op with omp models
+    --config <overlay> --json or a real mock turn; add an omp version floor
+    (tested 18.18.5).
+  - Pin/minimum omp version and re-run the spike on upgrade.
+concerns:
+  - kind: risk
+    summary: Preflight's omp overlay validation is a no-op (--config ... --version)
+    detail: "src/cli/preflight.ts:383-385 runs omp --config <overlay> --version.
+      --version is an early-exit and ignores the overlay: with a missing overlay
+      it still prints omp/18.18.5 and exits 0, while a real omp --config
+      <missing> -p ... exits 1 with Config overlay not found. This confirms
+      existing concern c-477404c672."
+    severity: high
+    location:
+      file: plugins/software-factory/src/cli/preflight.ts
+      line: 383
+    affects:
+      - "19.1"
+      - "19.2"
+  - kind: tech-debt
+    summary: OmpHarness has no extension/extra-arg seam; mock provider needs a
+      wrapper or new option
+    detail: OmpHarness hard-codes run/complete args at
+      src/harness/omp/harness.ts:368-388 and :707-715; it never passes -e. The
+      wrapper-binary workaround is proven, but M8 should add an
+      extraArgs/mockProvider option so tests do not depend on shell wrappers.
+    severity: medium
+    location:
+      file: plugins/software-factory/src/harness/omp/harness.ts
+      line: 368
+    affects:
+      - "19.8"
+remarkable:
+  - chosen: Extension -e + pi.registerProvider + local OpenAI-compatible SSE mock
+      server
+    why: Process-scoped, explicit per test, parallel-safe, catalog-visible via omp
+      models -e, and proven end-to-end through both omp -p and
+      OmpHarness.run/complete with zero paid calls. It avoids mutating a shared
+      profile/config file.
+    alternatives:
+      - models.yml custom provider in a temp agent dir (works; second choice,
+        but profile/agent-dir coupling and path-resolution caveats)
+      - "--config overlay with a providers: block (ruled out: ignored by the
+        model catalog)"
+      - Built-in Ollama/LM Studio local endpoint (needs a local model runtime;
+        not scripted)
+      - FakeHarness or mock omp binary (does not exercise real omp)
diff --git a/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/002-review-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/002-review-r1-a1/input.md
new file mode 100644
index 0000000..5caef86
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/002-review-r1-a1/input.md
@@ -0,0 +1,1336 @@
+# Step: Review
+
+## Goal
+Conduct adversarial peer code review on completed changes, evaluating implementation quality against requested focus criteria.
+
+## Rules
+- SKEPTICAL SCRUTINY: base findings on actual git diff and codebase state, never developer summaries.
+- Focus dimensions (see agent definition for the full philosophy and dispositions guide):
+  - `code`: validate clarity, wrapper discipline, complexity limits, boundary validation, and error typing.
+  - `security`: audit input sanitization, injection vectors, command execution boundaries, and secret exposure risks.
+  - `consistency`: ensure conformance with established repository naming idioms, directory layouts, and design patterns.
+  - `result`: for spikes (`fact-finder`, `poc`, `test-assumptions`), confirm findings answer the core uncertainty and code is properly isolated.
+- Reviewer boundary: reviewers critique; reviewers NEVER write fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
+
+## Dispositions Criteria
+Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async, dismiss.
+Use ONLY these dispositions; any other disposition value fails validation.
+# Review Suggestion Dispositions
+
+Criteria for assigning disposition to review findings:
+
+| Disposition | When to Assign | Engine Action |
+|---|---|---|
+| `fix` | Concrete defect, failing gate, broken contract, missing test, or deviation from assignment. | Returns item to `fixLoopTo` step (bounded by `maxFixRounds`); developer must address. Non-item: triggers consult. |
+| `optional` | Non-blocking polish, code style improvement, minor refactor opportunity, or deferred debt. | Passed to developer if another fix round occurs; otherwise recorded as tech debt for future iterations. |
+| `architect` | Architectural contradiction, interface redesign, boundary breach, or uncertainty exceeding item scope. | Triggers immediate architect consult; architect's decision is binding and final. |
+| `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
+| `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |
+| `dismiss` | Stale, invalid, or already-addressed concern; triager-only, requires a reason in `detail`. Concern record is kept on disk. | Closes the concern as `dismissed` with the reason; nothing is routed. |
+
+## Rules
+- Defect requiring code change MUST be `fix`.
+- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
+- Do NOT use `human-async` when repo context or architecture docs provide the answer.
+- `dismiss` is triager-only, requires a reason, and keeps the concern on disk.
+
+## Open Concerns
+- id: c-477404c672
+  kind: risk
+  severity: high
+  summary: Preflight's omp overlay validation is a no-op
+  affects:
+    - "19.1"
+    - "19.2"
+- id: c-aaebfb4099
+  kind: question
+  severity: medium
+  summary: Parallel epics need lock/merge coordination beyond per-task locks
+  affects:
+    - "19.3"
+    - "19.6"
+- id: c-ba416d7313
+  kind: risk
+  severity: medium
+  summary: No mock model provider exists; live omp tests are paid-only and opt-in
+  affects:
+    - "19.8"
+- id: c-d049242483
+  kind: risk
+  severity: medium
+  summary: Repo rules hydration is entirely absent
+  affects:
+    - "19.9"
+- id: c-e97dd18239
+  kind: risk
+  severity: high
+  summary: omp isolation backend values and runtime applicability are undocumented locally
+  affects:
+    - "19.1"
+    - "19.2"
+    - "19.5"
+- id: c-f9dc93315c
+  kind: tech-debt
+  severity: medium
+  summary: Runtime dirs sessions/prompts/system-prompts grow without cleanup
+  affects:
+    - "19.3"
+- id: c-fc5f2e54fb
+  kind: tech-debt
+  severity: medium
+  summary: Hard-coded omp fallback path in preflight
+  affects:
+    - "19.2"
+- id: c-556ca5ad29
+  kind: question
+  severity: medium
+  summary: Epic INTENT resolution for independent saga launches needs a new run contract
+  affects:
+    - "19.6"
+- id: c-6d3ab1a60d
+  kind: risk
+  severity: high
+  summary: 19.1 'omp isolation by default' may reduce to omp-managed worktrees + --cwd if task isolation proves unsuitable for root processes
+  affects:
+    - "19.1"
+- id: c-342c07aba6
+  kind: risk
+  severity: high
+  summary: User-level omp prompt files leak into every factory role; `APPEND_SYSTEM.md` survives `--no-context-files` and `--no-rules`
+  affects:
+    - "19.1"
+    - "19.2"
+    - M8 hydration
+- id: c-64046e8e72
+  kind: risk
+  severity: low
+  summary: "Cwd-scoped sources: `.omp/rules` and `.claude/CLAUDE.md` are launch-directory-only"
+  affects:
+    - "19"
+
+
+- Triage pre-existing concerns by exact `id` (`c-*` / `rm-*`) with the dispositions above plus `dismiss`; never restate a triaged concern as a new finding.
+- Use `dismiss` only with a non-empty `detail` giving the reason; a dismiss without a reason fails the step.
+- Keep concern summaries short: condense or dismiss stale concerns instead of repeating long detail.
+- Raise concerns with evidence when review uncovers new cross-cutting issues.
+
+## Assignment
+{
+  "slug": "spike-mock-provider",
+  "kind": "fact-finder",
+  "title": "Spike: scripted mock provider seam for real omp",
+  "assignment": "Fact-finder spike, no prod code. Probe installed omp extension/provider registration with throwaway --profile and temp dirs (parallel-safe). 1) Probe extension API and model catalog listing via -e/--config overlays; enumerate any custom-provider/local-endpoint seam. 2) Capture streaming NDJSON contract for a scripted turn (events, usage, yield envelope). 3) Propose canned scenario format {turns: [{yield|toolCalls|text}]} sufficient for M8 runner. 4) Prove one minimal real-omp turn against a scripted provider with zero paid-model calls, or rule the seam out with command/output evidence. Outputs: items/{item}/findings.md with probe log, full draft for plugins/software-factory/docs/spikes/omp-4-mock-provider.md, draft decision YAML {status, decision, evidence, followUps} naming the chosen seam plus scenario format (or ruled-out alternatives). Constraints: read-only on repo prod paths; cwd=plugins/software-factory; throwaway profile/repos only; poc/runner implementation deferred to M8, proposal only. Acceptance: answers M1 mock-provider scenario.",
+  "outlineRef": "spike-mock-provider",
+  "milestone": "m1-omp-de-risk",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-omp-de-risk:scenario-2"
+  ],
+  "citations": [
+    "docs/factory.v2.md:104-113",
+    "plugins/software-factory/docs/ARCHITECTURE.md:40",
+    "plugins/software-factory/src/cli/preflight.ts:365-393"
+  ]
+}
+
+## Engine Checks
+
+
+## Code Diff
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-02f2086657.yaml b/.factory/tasks/omp-workspaces/concerns/c-02f2086657.yaml
+deleted file mode 100644
+index 21406df..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-02f2086657.yaml
++++ /dev/null
+@@ -1,24 +0,0 @@
+-id: c-02f2086657
+-kind: risk
+-summary: Preflight's omp overlay validation is a no-op (--config ... --version)
+-detail: "src/cli/preflight.ts:383-385 runs omp --config <overlay> --version.
+-  --version is an early-exit and ignores the overlay: with a missing overlay it
+-  still prints omp/18.18.5 and exits 0, while a real omp --config <missing> -p
+-  ... exits 1 with Config overlay not found. This confirms existing concern
+-  c-477404c672."
+-location:
+-  file: plugins/software-factory/src/cli/preflight.ts
+-  line: 383
+-affects:
+-  - "19.1"
+-  - "19.2"
+-severity: high
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-mock-provider
+-  lastSeen: 2026-11-10T00:00:31.798Z
+-createdAt: 2026-11-10T00:00:31.798Z
+-updatedAt: 2026-11-10T00:00:31.798Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-13190d7c26.yaml b/.factory/tasks/omp-workspaces/concerns/c-13190d7c26.yaml
+deleted file mode 100644
+index 614d013..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-13190d7c26.yaml
++++ /dev/null
+@@ -1,23 +0,0 @@
+-id: c-13190d7c26
+-kind: tech-debt
+-summary: OmpHarness has no extension/extra-arg seam; mock provider needs a
+-  wrapper or new option
+-detail: OmpHarness hard-codes run/complete args at
+-  src/harness/omp/harness.ts:368-388 and :707-715; it never passes -e. The
+-  wrapper-binary workaround is proven, but M8 should add an
+-  extraArgs/mockProvider option so tests do not depend on shell wrappers.
+-location:
+-  file: plugins/software-factory/src/harness/omp/harness.ts
+-  line: 368
+-affects:
+-  - "19.8"
+-severity: medium
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-mock-provider
+-  lastSeen: 2026-11-10T00:00:31.798Z
+-createdAt: 2026-11-10T00:00:31.798Z
+-updatedAt: 2026-11-10T00:00:31.798Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-13b776c9b3.yaml b/.factory/tasks/omp-workspaces/concerns/c-13b776c9b3.yaml
+deleted file mode 100644
+index 600ab2f..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-13b776c9b3.yaml
++++ /dev/null
+@@ -1,28 +0,0 @@
+-id: c-13b776c9b3
+-kind: risk
+-summary: Factory records drop cacheRead/cacheWrite/totalTokens/cttl, so spec
+-  20's cost-measured defaults cannot be computed from records
+-detail: OmpNdjsonParser sums only u.input/u.output/u.cost.total
+-  (ndjson.ts:86-99; result at 173-177); Usage (types.ts:7-11) and StepUsage
+-  (artifacts.ts:545-549) have no cache fields. A turn's multiple requests are
+-  aggregated into one input/output/cost total; the architect's cache-read tokens
+-  and cold-resume cost are not attributable. The `-p "/compact"` probe also
+-  produced no usage record.
+-location:
+-  file: plugins/software-factory/src/harness/omp/ndjson.ts
+-  line: 86
+-affects:
+-  - 20a
+-  - 20b
+-  - 20c
+-  - 20d
+-severity: high
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-cache-key
+-  lastSeen: 2026-11-10T00:16:23.859Z
+-createdAt: 2026-11-10T00:16:23.859Z
+-updatedAt: 2026-11-10T00:16:23.859Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-2fdd0c0b52.yaml b/.factory/tasks/omp-workspaces/concerns/c-2fdd0c0b52.yaml
+deleted file mode 100644
+index 75756e9..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-2fdd0c0b52.yaml
++++ /dev/null
+@@ -1,26 +0,0 @@
+-id: c-2fdd0c0b52
+-kind: risk
+-summary: Resume passes @role without verifying the recorded
+-  model/thinking/tools/system prompt, so config/fallback changes silently cause
+-  cold resumes
+-detail: harness.ts:318-326 forces a single `@role` candidate on resume. The role
+-  is re-resolved against the current overlay each turn; a pipeline role-map
+-  change, or a fallback model used on a fresh turn, switches the model on resume
+-  and pays a full cold read (measured cacheRead=0, cost 8.9x warm).
+-  Tools/system-prompt/thinking changes similarly invalidate but are not recorded
+-  in step meta.
+-location:
+-  file: plugins/software-factory/src/harness/omp/harness.ts
+-  line: 318
+-affects:
+-  - 20a
+-severity: medium
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-cache-key
+-  lastSeen: 2026-11-10T00:16:23.859Z
+-createdAt: 2026-11-10T00:16:23.859Z
+-updatedAt: 2026-11-10T00:16:23.859Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-342c07aba6.yaml b/.factory/tasks/omp-workspaces/concerns/c-342c07aba6.yaml
+deleted file mode 100644
+index 03aad96..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-342c07aba6.yaml
++++ /dev/null
+@@ -1,28 +0,0 @@
+-id: c-342c07aba6
+-kind: risk
+-summary: User-level omp prompt files leak into every factory role;
+-  `APPEND_SYSTEM.md` survives `--no-context-files` and `--no-rules`
+-detail: OmpHarness inherits process.env and passes no `--profile` or
+-  `PI_CODING_AGENT_DIR` (harness.ts:406-409). A probe with a temp HOME/agent dir
+-  showed user `AGENTS.md` and `RULES.md` injected, and user `APPEND_SYSTEM.md`
+-  appended even with `--system-prompt` plus both disable flags. Only an explicit
+-  empty `--append-system-prompt=` suppressed the append. This can inject
+-  operator instructions into every architect/developer/qa/reviewer turn and
+-  defeats deterministic role prompts.
+-location:
+-  file: plugins/software-factory/src/harness/omp/harness.ts
+-  line: 406
+-affects:
+-  - "19.1"
+-  - "19.2"
+-  - M8 hydration
+-severity: high
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-repo-rules
+-  lastSeen: 2026-11-09T23:58:38.970Z
+-createdAt: 2026-11-09T23:58:38.970Z
+-updatedAt: 2026-11-09T23:58:38.970Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-3596b08453.yaml b/.factory/tasks/omp-workspaces/concerns/c-3596b08453.yaml
+deleted file mode 100644
+index a5f0cae..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-3596b08453.yaml
++++ /dev/null
+@@ -1,32 +0,0 @@
+-id: c-3596b08453
+-kind: risk
+-summary: Factory overlay pins no cache/compaction/memory knobs; effective
+-  behavior is inherited from host global/project config
+-detail: overlay.ts:51-85 generates only
+-  modelRoles/retry/eval/title/checkpoint/advisor/bash/mnemopi-linking/update. On
+-  this host `omp config list --scope global` sets
+-  providers.cacheRetention=short, providers.cacheWarming=streaming,
+-  compaction.experimentalContextManagement=true,
+-  compaction.handoffSaveToDisk=true and modelThresholds overrides — differing
+-  from omp docs defaults. A factory run on another host inherits different cache
+-  TTL/warming/compaction behavior with no record. Overlay precedence would fix
+-  it (docs/settings.md:113-123), but the keys are absent.
+-location:
+-  file: plugins/software-factory/src/harness/omp/overlay.ts
+-  line: 51
+-affects:
+-  - "19.2"
+-  - 20a
+-  - 20b
+-  - 20c
+-  - 20d
+-severity: high
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-cache-key
+-  lastSeen: 2026-11-10T00:16:23.859Z
+-createdAt: 2026-11-10T00:16:23.859Z
+-updatedAt: 2026-11-10T00:16:23.859Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-490224ade0.yaml b/.factory/tasks/omp-workspaces/concerns/c-490224ade0.yaml
+deleted file mode 100644
+index d2c9523..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-490224ade0.yaml
++++ /dev/null
+@@ -1,26 +0,0 @@
+-id: c-490224ade0
+-kind: risk
+-summary: Native standby warming and idle compaction are unavailable in
+-  one-process-per-turn -p sessions
+-detail: OMP's idle maintenance is enabled only by the interactive TUI; SDK, RPC
+-  and print sessions do not enable it (docs/sdk.md:278). A `-p` process exits
+-  after the turn, so providers.cacheWarming=idle cannot replay a request during
+-  factory standby and compaction.idle* never fires. `streaming` warming still
+-  applies during long tool executions inside a turn. The practical standby
+-  mechanism is providers.cacheRetention=long (1h), not native idle warming.
+-location:
+-  file: plugins/software-factory/docs/ARCHITECTURE.md
+-  line: 38
+-affects:
+-  - 20b
+-  - 20d
+-severity: medium
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-cache-key
+-  lastSeen: 2026-11-10T00:16:23.859Z
+-createdAt: 2026-11-10T00:16:23.859Z
+-updatedAt: 2026-11-10T00:16:23.859Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-64046e8e72.yaml b/.factory/tasks/omp-workspaces/concerns/c-64046e8e72.yaml
+deleted file mode 100644
+index 7b78541..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-64046e8e72.yaml
++++ /dev/null
+@@ -1,23 +0,0 @@
+-id: c-64046e8e72
+-kind: risk
+-summary: "Cwd-scoped sources: `.omp/rules` and `.claude/CLAUDE.md` are
+-  launch-directory-only"
+-detail: "Probe: starting omp in `repo/sub` loaded root+sub `AGENTS.md` and root
+-  `.omp/RULES.md`, but not root `.omp/rules` or root `.claude/CLAUDE.md`.
+-  Factory roles currently launch from worktree roots; changing role cwd to a
+-  package subdir would silently drop those sources."
+-location:
+-  file: plugins/software-factory/src/harness/omp/harness.ts
+-  line: 367
+-affects:
+-  - "19"
+-severity: low
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-repo-rules
+-  lastSeen: 2026-11-09T23:58:38.970Z
+-createdAt: 2026-11-09T23:58:38.970Z
+-updatedAt: 2026-11-09T23:58:38.970Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-717385e618.yaml b/.factory/tasks/omp-workspaces/concerns/c-717385e618.yaml
+deleted file mode 100644
+index 60222ad..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-717385e618.yaml
++++ /dev/null
+@@ -1,26 +0,0 @@
+-id: c-717385e618
+-kind: assumption
+-summary: Spec 20(a)'s 'compact before an uncached resume' is a net loss for a
+-  single resume because the summarizer itself pays the full history
+-detail: Compaction 38,053→6,794 tokens was verified, but the summarization
+-  request reads the full history; if the cache is already expired, cost ≈ cold
+-  history + summary output + compacted-prefix write + resumed turn, which is
+-  more than a direct cold resume. Compaction only pays while the cache is still
+-  warm (at a wave boundary) or when amortized over several future turns.
+-  Recommend fresh brief for already-cold long-history resumes.
+-location:
+-  file: docs/factory.v2.md
+-  line: 115
+-affects:
+-  - 20a
+-  - 20b
+-severity: medium
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-cache-key
+-  lastSeen: 2026-11-10T00:16:23.859Z
+-createdAt: 2026-11-10T00:16:23.859Z
+-updatedAt: 2026-11-10T00:16:23.859Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-81008436cb.yaml b/.factory/tasks/omp-workspaces/concerns/c-81008436cb.yaml
+deleted file mode 100644
+index 4d34566..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-81008436cb.yaml
++++ /dev/null
+@@ -1,24 +0,0 @@
+-id: c-81008436cb
+-kind: risk
+-summary: Repo rules in worktrees are branch snapshots; mid-task rule changes can
+-  diverge across item worktrees
+-detail: omp resolves rules from the role's cwd files. An item worktree only has
+-  rules committed on its branch; rules changed after the item branch was cut are
+-  absent until merged. If M8 requires all roles in a wave to see the same rules,
+-  sync/copy rule files at item/wave creation or define a branch-snapshot policy.
+-location:
+-  file: plugins/software-factory/src/core/flows/item-machine.ts
+-  line: 960
+-affects:
+-  - "19"
+-  - M1 scenario 4
+-severity: medium
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-repo-rules
+-  lastSeen: 2026-11-09T23:58:38.970Z
+-createdAt: 2026-11-09T23:58:38.970Z
+-updatedAt: 2026-11-09T23:58:38.970Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-9284d9c7f4.yaml b/.factory/tasks/omp-workspaces/concerns/c-9284d9c7f4.yaml
+deleted file mode 100644
+index ea124f2..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-9284d9c7f4.yaml
++++ /dev/null
+@@ -1,25 +0,0 @@
+-id: c-9284d9c7f4
+-kind: assumption
+-summary: Spec line 113's 'omp does not put AGENTS.md in subagent context' is
+-  true for omp task subagents, not root role sessions
+-detail: The factory's architect/developer/qa/reviewer are root omp processes
+-  launched with `--system-prompt`; probes show they already receive repo
+-  AGENTS.md/CLAUDE.md/rules from cwd. Only omp `task` subagents (scouts) drop
+-  AGENTS.md; they keep RULES.md and contextFiles.extra. Implementing a second
+-  factory-side copy for root roles would double-inject (measured 2 copies).
+-location:
+-  file: docs/factory.v2.md
+-  line: 113
+-affects:
+-  - M1 scenario 4
+-  - M8 hydration
+-severity: medium
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-repo-rules
+-  lastSeen: 2026-11-09T23:58:38.970Z
+-createdAt: 2026-11-09T23:58:38.970Z
+-updatedAt: 2026-11-09T23:58:38.970Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-938dee5497.yaml b/.factory/tasks/omp-workspaces/concerns/c-938dee5497.yaml
+deleted file mode 100644
+index 32e43c2..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-938dee5497.yaml
++++ /dev/null
+@@ -1,24 +0,0 @@
+-id: c-938dee5497
+-kind: question
+-summary: Legacy `.cursorrules` is documented but not loaded in omp 18.18.5;
+-  which source is authoritative?
+-detail: omp docs `context-files.md` mentions legacy `.cursorrules` rules, while
+-  `rulebook-matching-pipeline.md` lists only `.cursor/rules/*.{mdc,md}`. Probe
+-  with plain, heading-rich, and co-located `.cursorrules` produced no injection
+-  or rulebook listing. Treat `.cursorrules` as unsupported for 18.18.5; revisit
+-  if omp changes.
+-location:
+-  file: plugins/software-factory/docs/OMP_ADAPTER.md
+-  line: 163
+-affects:
+-  - M1 scenario 4
+-severity: low
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-repo-rules
+-  lastSeen: 2026-11-09T23:58:38.970Z
+-createdAt: 2026-11-09T23:58:38.970Z
+-updatedAt: 2026-11-09T23:58:38.970Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-e9395e843e.yaml b/.factory/tasks/omp-workspaces/concerns/c-e9395e843e.yaml
+deleted file mode 100644
+index ae17284..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-e9395e843e.yaml
++++ /dev/null
+@@ -1,29 +0,0 @@
+-id: c-e9395e843e
+-kind: risk
+-summary: mnemopi.autoRecall injects prior-session text into the first turn,
+-  changing the effective system prompt and defeating fresh-session cache reuse
+-detail: The overlay disables polyphonicRecall/enhancedRecall/proactiveLinking
+-  but leaves mnemopi.autoRecall and autoRetain at true. Probes show
+-  custom/system-prompt-digest changes when memory recall text is injected
+-  (a94d3680ec1c75cf with no memories vs a89aabcb237da3c7/634c40b6e2f931de with
+-  recalled content), even though the agent body is unchanged. Recalled memories
+-  are first-turn-only, so resumed turns are safe, but fresh sessions in a reused
+-  worktree are non-deterministic and can leak prior task prompts across tasks
+-  sharing a cwd.
+-location:
+-  file: plugins/software-factory/src/harness/omp/overlay.ts
+-  line: 77
+-affects:
+-  - "19.7"
+-  - 20b
+-  - 20c
+-severity: high
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-cache-key
+-  lastSeen: 2026-11-10T00:16:23.859Z
+-createdAt: 2026-11-10T00:16:23.859Z
+-updatedAt: 2026-11-10T00:16:23.859Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-1de0ddad1e.yaml b/.factory/tasks/omp-workspaces/concerns/rm-1de0ddad1e.yaml
+deleted file mode 100644
+index 3de5a56..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-1de0ddad1e.yaml
++++ /dev/null
+@@ -1,20 +0,0 @@
+-id: rm-1de0ddad1e
+-chosen: providers.cacheRetention=long for architect standby gaps under 1h
+-  instead of omp idle cache warming
+-alternatives:
+-  - Run a persistent RPC session with set_cache_warming idle
+-  - Pre-warm immediately before resume
+-  - Accept 5m short TTL and pay cold resumes
+-why: Print-mode sessions have no idle scheduler and exit after each turn, so
+-  cacheWarming=idle cannot cover factory standby. Long retention needs no live
+-  process and emits cttl ephemeral1h; it is the only zero-process warming
+-  mechanism. The 1h write premium must be verified against provider billing.
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-cache-key
+-  lastSeen: 2026-11-10T00:16:23.859Z
+-createdAt: 2026-11-10T00:16:23.859Z
+-updatedAt: 2026-11-10T00:16:23.859Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-21e3742e09.yaml b/.factory/tasks/omp-workspaces/concerns/rm-21e3742e09.yaml
+deleted file mode 100644
+index 2feb33c..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-21e3742e09.yaml
++++ /dev/null
+@@ -1,21 +0,0 @@
+-id: rm-21e3742e09
+-chosen: Pin all cache/compaction/memory keys in the generated omp overlay rather
+-  than relying on omp defaults or host config
+-alternatives:
+-  - Read host config and adapt at runtime
+-  - Use PI_CACHE_RETENTION env overrides
+-  - Document host settings as an installation prerequisite
+-why: The factory overlay currently pins none of them, and this host's global
+-  config overrides omp defaults (short vs auto, streaming vs idle,
+-  experimentalContextManagement true vs false). Overlay precedence beats
+-  project/global, so explicit keys make cache behavior reproducible and
+-  auditable.
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-cache-key
+-  lastSeen: 2026-11-10T00:16:23.859Z
+-createdAt: 2026-11-10T00:16:23.859Z
+-updatedAt: 2026-11-10T00:16:23.859Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-4b7a20ef15.yaml b/.factory/tasks/omp-workspaces/concerns/rm-4b7a20ef15.yaml
+deleted file mode 100644
+index 4766a7e..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-4b7a20ef15.yaml
++++ /dev/null
+@@ -1,22 +0,0 @@
+-id: rm-4b7a20ef15
+-chosen: Fresh brief for an already-cold long-history architect resume; compact
+-  only while warm
+-alternatives:
+-  - Compact immediately before every cold resume
+-  - Always resume uncached and never compact
+-  - Persistent RPC holder that compacts in place
+-why: Compaction after expiry re-reads the full history in the summarizer and
+-  then writes the compacted prefix, costing more than a direct cold resume for a
+-  single turn. A fresh session hydrated from records is bounded, deterministic,
+-  and still reuses the system-prompt prefix (measured 4,224 cached tokens across
+-  sessions). Warm compaction at a wave boundary avoids the double full-history
+-  payment.
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-cache-key
+-  lastSeen: 2026-11-10T00:16:23.859Z
+-createdAt: 2026-11-10T00:16:23.859Z
+-updatedAt: 2026-11-10T00:16:23.859Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-9571a69c19.yaml b/.factory/tasks/omp-workspaces/concerns/rm-9571a69c19.yaml
+deleted file mode 100644
+index 82e12e5..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-9571a69c19.yaml
++++ /dev/null
+@@ -1,20 +0,0 @@
+-id: rm-9571a69c19
+-chosen: Keep omp root-session discovery as the sole repo-rules injector; do not
+-  duplicate rule text in factory role/step prompts
+-alternatives:
+-  - Engine-rendered rules injected into the role system prompt with
+-    `--no-context-files --no-rules`
+-  - "Hybrid: omp for root roles, engine copy for scouts"
+-why: Probes show root omp sessions already inject `<repo-rules>` and rules even
+-  with `--system-prompt`; a second copy produced two sentinel occurrences. omp
+-  also places context in the trailing project-context footer, so per-worktree
+-  rules do not break the static prompt cache prefix (important for item 20).
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-repo-rules
+-  lastSeen: 2026-11-09T23:58:38.970Z
+-createdAt: 2026-11-09T23:58:38.970Z
+-updatedAt: 2026-11-09T23:58:38.970Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-cc0c8695cf.yaml b/.factory/tasks/omp-workspaces/concerns/rm-cc0c8695cf.yaml
+deleted file mode 100644
+index d36d9a2..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-cc0c8695cf.yaml
++++ /dev/null
+@@ -1,23 +0,0 @@
+-id: rm-cc0c8695cf
+-chosen: Extension -e + pi.registerProvider + local OpenAI-compatible SSE mock server
+-alternatives:
+-  - models.yml custom provider in a temp agent dir (works; second choice, but
+-    profile/agent-dir coupling and path-resolution caveats)
+-  - "--config overlay with a providers: block (ruled out: ignored by the model
+-    catalog)"
+-  - Built-in Ollama/LM Studio local endpoint (needs a local model runtime; not
+-    scripted)
+-  - FakeHarness or mock omp binary (does not exercise real omp)
+-why: Process-scoped, explicit per test, parallel-safe, catalog-visible via omp
+-  models -e, and proven end-to-end through both omp -p and
+-  OmpHarness.run/complete with zero paid calls. It avoids mutating a shared
+-  profile/config file.
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-mock-provider
+-  lastSeen: 2026-11-10T00:00:31.798Z
+-createdAt: 2026-11-10T00:00:31.798Z
+-updatedAt: 2026-11-10T00:00:31.798Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-d9e8ce5fcd.yaml b/.factory/tasks/omp-workspaces/concerns/rm-d9e8ce5fcd.yaml
+deleted file mode 100644
+index d1b2c69..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-d9e8ce5fcd.yaml
++++ /dev/null
+@@ -1,18 +0,0 @@
+-id: rm-d9e8ce5fcd
+-chosen: Use `.omp/RULES.md` / `contextFiles.extra` (or task `context`) for rules
+-  that must reach scouts
+-alternatives:
+-  - Put all rules in AGENTS.md and accept scout blindness
+-  - Inject repo rules into every task tool `context` field
+-why: omp task subagents drop every context file named AGENTS.md but keep
+-  RULES.md and extra context files. Hard rules that scouts must follow cannot
+-  live only in AGENTS.md.
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-repo-rules
+-  lastSeen: 2026-11-09T23:58:38.970Z
+-createdAt: 2026-11-09T23:58:38.970Z
+-updatedAt: 2026-11-09T23:58:38.970Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-e65fbf627b.yaml b/.factory/tasks/omp-workspaces/concerns/rm-e65fbf627b.yaml
+deleted file mode 100644
+index 178cf5f..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-e65fbf627b.yaml
++++ /dev/null
+@@ -1,21 +0,0 @@
+-id: rm-e65fbf627b
+-chosen: "Content fingerprints for cold-resume detection: system-prompt bytes,
+-  ordered tools, resolved model, thinking level, retention, TTL and compaction
+-  marker"
+-alternatives:
+-  - Hash the system-prompt path and prompt path
+-  - Invalidate on every new prompt filename
+-  - Rely on omp's UI cache marker / cacheRead alone
+-why: The probes show path changes with identical bytes are full hits, while
+-  one-byte content changes, tools changes, thinking changes, model switches, TTL
+-  expiry and compaction are misses. Path-based invalidation would false-positive
+-  on every turn because the factory creates a new prompt file path per turn.
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-cache-key
+-  lastSeen: 2026-11-10T00:16:23.859Z
+-createdAt: 2026-11-10T00:16:23.859Z
+-updatedAt: 2026-11-10T00:16:23.859Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-f74c3bd557.yaml b/.factory/tasks/omp-workspaces/concerns/rm-f74c3bd557.yaml
+deleted file mode 100644
+index d725dca..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-f74c3bd557.yaml
++++ /dev/null
+@@ -1,19 +0,0 @@
+-id: rm-f74c3bd557
+-chosen: Use a throwaway omp agent dir with a custom OpenAI-compatible
+-  `models.yml` plus a local SSE stub for no-paid-model probes
+-alternatives:
+-  - Live cheap models (paid, non-deterministic)
+-  - omp SDK/in-process harness (heavier, different path than production)
+-why: "Demonstrated end-to-end: omp 18.18.5 sent full prompts to the stub, which
+-  recorded exact system messages and returned scripted text; no credentials or
+-  paid calls. This directly supports M8's scripted mock model provider
+-  requirement."
+-status: open
+-source:
+-  record: 001-research-r1-a1
+-  agent: fact-finder
+-  step: research
+-  item: spike-repo-rules
+-  lastSeen: 2026-11-09T23:58:38.970Z
+-createdAt: 2026-11-09T23:58:38.970Z
+-updatedAt: 2026-11-09T23:58:38.970Z
+diff --git a/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/input.md
+new file mode 100644
+index 0000000..6ab5362
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/input.md
+@@ -0,0 +1,113 @@
++# Step: Research
++
++## Goal
++Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.
++
++## Rules
++- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
++- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
++- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
++- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
++- Fix-round re-entry: when `Review Feedback` below is non-empty, this is a fix round. Address ONLY the listed concerns with targeted follow-up investigation; do NOT re-run the full probe from scratch.
++- Tool-call budget: aim to finish within ~60 tool calls (probes that re-read files run 60-90 calls and diverge). Batch reads, prefer `grep`/`ast_grep` over re-reading, and stop once findings answer the assignment.
++
++## Assignment
++{
++  "slug": "spike-mock-provider",
++  "kind": "fact-finder",
++  "title": "Spike: scripted mock provider seam for real omp",
++  "assignment": "Fact-finder spike, no prod code. Probe installed omp extension/provider registration with throwaway --profile and temp dirs (parallel-safe). 1) Probe extension API and model catalog listing via -e/--config overlays; enumerate any custom-provider/local-endpoint seam. 2) Capture streaming NDJSON contract for a scripted turn (events, usage, yield envelope). 3) Propose canned scenario format {turns: [{yield|toolCalls|text}]} sufficient for M8 runner. 4) Prove one minimal real-omp turn against a scripted provider with zero paid-model calls, or rule the seam out with command/output evidence. Outputs: items/{item}/findings.md with probe log, full draft for plugins/software-factory/docs/spikes/omp-4-mock-provider.md, draft decision YAML {status, decision, evidence, followUps} naming the chosen seam plus scenario format (or ruled-out alternatives). Constraints: read-only on repo prod paths; cwd=plugins/software-factory; throwaway profile/repos only; poc/runner implementation deferred to M8, proposal only. Acceptance: answers M1 mock-provider scenario.",
++  "outlineRef": "spike-mock-provider",
++  "milestone": "m1-omp-de-risk",
++  "wave": 1,
++  "scenarioRefs": [
++    "m1-omp-de-risk:scenario-2"
++  ],
++  "citations": [
++    "docs/factory.v2.md:104-113",
++    "plugins/software-factory/docs/ARCHITECTURE.md:40",
++    "plugins/software-factory/src/cli/preflight.ts:365-393"
++  ]
++}
++
++## Task Intent
++# omp-workspaces
++
++Implement spec items 19 and 20 of `docs/factory.v2.md` in `plugins/software-factory`
++(read both in full; they are the acceptance definition):
++- workspace isolation via omp's configurable isolation backend by default; engine-managed git worktrees kept
++  as `isolation: engine` option; start with a fact-finder spike on omp isolation mechanics
++  (prior research: `plugins/software-factory/docs/spikes/`);
++- preflight: omp version/config compatibility, isolation round-trip, models/roles resolvable, repo state;
++- idempotent status/cleanup/gc launcher commands (dry-run gc by default, refuse while a run holds the lock);
++- commit content from agents' structured output (engine never invents content);
++- wave-end merge: conflict-free → deterministic CI gates → merged; conflicts/red → workhorse wave-end merger
++  agent → unresolvable → architect escalation with status + worktree/branch pointers;
++- saga: each epic an independent factory launch in its own workspace (parallel epics), merge escalation to the
++  epic architect inside an epic and to the saga architect at saga wave end; concerns propagate upward;
++- architect context economy: compaction before an uncached resume, cache warm on standby where it pays,
++  cost-measured configurable defaults, re-evaluate schema-free telegraphic architect output with PM structuring;
++- docs per use case (single task, story waves, epic, saga with parallel epics, conflict/escalation paths,
++  status/cleanup/gc);
++- "no models" end-to-end tests through the real omp harness with a scripted mock model provider.
++Expected to be split into epics by the architect where complexity warrants; behavior tests only; terse prompts.
++
++
++## Context & Citations
++[
++  "docs/factory.v2.md:104-113",
++  "plugins/software-factory/docs/ARCHITECTURE.md:40",
++  "plugins/software-factory/src/cli/preflight.ts:365-393"
++]
++
++## Review Feedback
++
++
++## Open Concerns
++- id: c-477404c672
++  kind: risk
++  severity: high
++  summary: Preflight's omp overlay validation is a no-op
++  affects:
++    - "19.1"
++    - "19.2"
++- id: c-aaebfb4099
++  kind: question
++  severity: medium
++  summary: Parallel epics need lock/merge coordination beyond per-task locks
++  affects:
++    - "19.3"
++    - "19.6"
++- id: c-ba416d7313
++  kind: risk
++  severity: medium
++  summary: No mock model provider exists; live omp tests are paid-only and opt-in
++  affects:
++    - "19.8"
++
++
++- Review the concerns above before starting; they constrain this step but are not part of the assignment.
++- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["ok","inconclusive"])
++- summary (string, required)
++- findings (string, required)
++- contextPack (string, optional)
++- sources (array of string, optional)
++- recommendations (array of string, optional)
++- concerns (array of object, optional): Structured concerns raised while investigating
++  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
++  - summary (string, required)
++  - detail (string, optional)
++  - severity (string, optional, enum: ["low","medium","high"])
++  - location (object, optional)
++    - file (string, required)
++    - line (integer, optional)
++  - affects (array of string, optional)
++- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
++  - chosen (string, required)
++  - why (string, required)
++  - alternatives (array of string, required)
+diff --git a/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..8eebaa2
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/meta.yaml
+@@ -0,0 +1,20 @@
++seq: 1
++name: research
++attempt: 1
++fixRound: 1
++agent: fact-finder
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 3600
++status: ok
++startedAt: 2026-11-09T23:41:25.126Z
++session: 01a1c2b0-23f3-749f-9d53-1d80a5467b6b
++endedAt: 2026-11-10T00:00:31.957Z
++usage:
++  inputTokens: 177310
++  outputTokens: 90586
++  costUsd: 0.09724
++repairedFrom: ask
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-41-25-876Z_01a1c2b0-23f3-749f-9d53-1d80a5467b6b
+diff --git a/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/output.yaml
+new file mode 100644
+index 0000000..e16d43b
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/output.yaml
+@@ -0,0 +1,225 @@
++status: ok
++summary: Extension -e + pi.registerProvider + local OpenAI-compatible SSE seam
++  verified end-to-end on real omp/18.18.5 with zero paid-model calls; scenario
++  format {turns:[{text|toolCalls|yield}]} proposed.
++findings: |
++  # Spike: scripted mock provider seam for real omp (M1)
++
++  Status: ok. Environment: omp/18.18.5 (`omp/18.18.5`), Bun 1.4.4, Linux x64 WSL2. Throwaway profiles and temp dirs; zero paid-model calls.
++
++  ## Verdict
++
++  Chosen seam: an omp extension loaded with `-e/--extension` calls `pi.registerProvider('mock', { api: 'openai-completions', baseUrl: 'http://127.0.0.1:<ephemeral>/v1', apiKey: 'mock-key', models: [{ id: 'mock-chat', name: 'Mock Chat', api: 'openai-completions', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 }] })`, backed by a local OpenAI-compatible SSE server.
++
++  Scenario format: `{turns: [...]}`; each turn is one assistant/model response (one HTTP POST):
++  - `{text: '...'}` text, finish stop, ends the agent turn.
++  - `{toolCalls: [{name, arguments}, ...]}` executes tools; next POST consumes next turn.
++  - `{yield: {data: ...}}` emits terminal `yield`; observed no further provider request.
++  Optional per-turn `usage`, `finishReason`; optional top-level `match`, `onExhausted`.
++
++  Proven: catalog listing (`omp models -e ... --json` -> `mock/mock-chat`); real text turn; yield envelope; read->yield tool loop; two parallel tool calls; session resume; @role resolution via `--config` modelRoles; parallel processes; OmpHarness.run and complete.
++
++  Ruled out: `--config` is a settings overlay, not a provider registry. `providers:` in `--config` was ignored; `omp models --config cfgprov.yml` did not list it. `models.yml` in a temp agent dir works (second choice).
++
++  ## Probe log
++
++  P1 `omp --version` -> `omp/18.18.5`; help has `-e`, `--config`, `--profile`, `--mode json`, `--no-session`, `--tools`.
++  P2 extension API: `typeof pi.registerProvider === 'function'`; `pi.pi` exposes `createAgentSession`, `runSubprocess`, `AgentSession`, `SessionManager`.
++  P3 `omp --profile ... models -e mock-provider.ts --json` -> selector `mock/mock-chat`, kind chat, cost 0.
++  P4 root-level `omp -e ... models` did not load the extension; place `-e` after `models`. Root-level `-e` works for `-p` sessions.
++  P5 text turn: exit 0; text `MOCK_OK`; usage `input:123, output:6, totalTokens:129, cost.total:0`; `agent_end` `isTerminal:true, yielded:true`.
++  P6 yield turn: exit 0; one POST; `tool_execution_start` args `{data:{status:'OK',count:42}}`; `tool_execution_end` result `details.data` identical; `turn_end` `stopReason:'toolUse'`; `agent_end`.
++  P7 read then yield: 2 POSTs; second request includes `role:'tool'` result.
++  P8 two reads in one response: 2 tool results then yield.
++  P9 resume: first process text `TURN1_TEXT`; second `--resume <id>` sends `system,user,assistant,user`, prior text present; yield `{resumed:true}`.
++  P10 parallel: two profiles/servers; both exit 0; one POST each.
++  P11 role overlay `modelRoles: {probe: mock/mock-chat}` + `--model @probe` -> wire model `mock-chat`, exit 0.
++  P12 SSE usage `prompt_tokens:100, cached_tokens:40, completion_tokens:5` -> usage `input:60, output:5, cacheRead:40, totalTokens:105`; cost computed from model rates.
++  P13 OmpHarness.run with wrapper `exec omp -e ext "$@"` -> `ok:true`, data `{status:'OK',via:'OmpHarness'}`, usage 111/9, costUsd 0, toolCallCount 1.
++  P14 OmpHarness.complete -> `{status:'OK',answer:42}`.
++  P15 models.yml via `PI_CODING_AGENT_DIR=<tmp>` -> `fileprov/file-model`; named profile works when file is at `omp config path`; absolute `PI_CONFIG_DIR=/tmp/...` was resolved under `$HOME/tmp` in 18.18.5, so verify.
++  P16 `--config` providers block ignored.
++  P17 preflight no-op: `omp --config /tmp/no-such-overlay.yml --version` prints version and exits 0; real `omp --config <missing> -p ...` exits 1 `Config overlay not found`; `models --config <missing>` exits 1.
++
++  ## NDJSON contract (omp 18.18.5)
++
++  `omp --mode json` emits one JSON object per line. Text turn sequence: `session`, `agent_start`, `turn_start`, user `message_start`/`message_end`, assistant `message_start` (usage zeros), `message_update` (`text_start`/`text_delta`/`text_end`), assistant `message_end` (real usage), `turn_end` (message + toolResults), `agent_end` (`messages`, `isTerminal:true`, `yielded:true`). Tool turn adds `tool_execution_start`/`tool_execution_end`, a `toolResult` message, and if non-terminal, another provider POST.
++
++  Usage fields: `turn_end.message.usage` has `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens`, `cost.{input,output,cacheRead,cacheWrite,total}`. `message_start.usage` is zeroed. `cacheRead` comes from `prompt_tokens_details.cached_tokens`; `input` = `prompt_tokens - cached_tokens`; cost from model cost rates. `agent_end.yielded` is true even for text-only turns, so not a yield signal.
++
++  Yield envelope: yield data appears in `turn_end.message.content[].toolCall.arguments.data`, `agent_end.messages[].content[].toolCall.arguments.data`, `tool_execution_start.args.data`, and `tool_execution_end.result.details.data` (parser `ndjson.ts:73-142`). Yield is terminal: one POST, no follow-up. Parser references: `src/harness/omp/ndjson.ts:52-150`.
++
++  ## Scenario format
++
++  ```jsonc
++  {
++    'name': 'developer-writes-and-yields',
++    'match': { 'model': 'mock-chat', 'systemContains': 'Developer', 'promptContains': 'implement' },
++    'onExhausted': 'error',
++    'turns': [
++      { 'toolCalls': [{ 'name': 'write', 'arguments': { 'path': 'src/hello.ts', 'content': 'export const hello = 1;\n' } }], 'usage': { 'input': 1200, 'output': 40, 'cacheRead': 800 } },
++      { 'yield': { 'data': { 'status': 'done', 'summary': 'added hello' } }, 'usage': { 'input': 1500, 'output': 20, 'cacheRead': 1400 } }
++    ]
++  }
++  ```
++
++  Types: `UsageSpec` {input?,output?,cacheRead?,cacheWrite?,cost?}; `ToolCallSpec` {name,arguments,id?}; `Turn` = text | toolCalls | yield | error {status?,message}; `Scenario` {name?,match?,onExhausted?,turns}. Semantics: sequential per server; one POST per turn; toolCalls continue; yield terminates; text ends; `onExhausted` default error or repeatLast; `match` assertions fail with 500; resume cursor keyed by session id/label. Error turns optional, not probed.
++
++  ## M8 integration
++
++  OmpHarness currently hard-codes args without `-e` (`harness.ts:368-388`, `:707-715`). Proven wrapper: `#!/bin/sh; exec /home/slava/.bun/bin/omp -e /tmp/mock-provider.ts "$@"` passed as `ompBinary`; both run and complete succeeded. Recommended: add `extraArgs`/`mockProvider` to OmpHarness. Proposed `test/e2e/mock-provider/{extension,server,scenario,runner}.ts`; gate with `FACTORY_E2E_OMP=1`, keep paid `FACTORY_LIVE_OMP=1` separate. Select scenario by `run.label` (like `FakeHarness.scriptOutcome`). Use per-test ephemeral port/profile or `PI_CODING_AGENT_DIR`, `--no-session`, `--no-extensions -e mock-ext`, explicit `mock/mock-chat`; assert request log only mock-chat and `usage.costUsd === 0`.
++
++  ## Decision YAML
++
++  ```yaml
++  status: accepted
++  decision: >
++    Adopt the omp extension provider seam: per-process `-e mock-provider.ts` calls
++    `pi.registerProvider('mock', {... openai-completions ...})` against a local scripted SSE server.
++    Scenarios are `{turns: [{text}|{toolCalls}|{yield}]}`; one turn per provider request; toolCalls continue,
++    yield terminates. Use an OmpHarness wrapper now; add `extraArgs`/`mockProvider` in M8. Keep
++    `models.yml` in a temp agent dir as fallback; `--config` is only for settings/modelRoles.
++  evidence:
++    - 'omp/18.18.5; omp models -e mock-provider.ts --json lists mock/mock-chat (P3).'
++    - 'Real text turn MOCK_OK, usage 123/6, cost.total 0 (P5).'
++    - 'Yield turn details.data {status:OK,count:42}, stopReason toolUse, agent_end (P6).'
++    - 'Tool loop and two parallel tool calls then yield (P7/P8).'
++    - 'Resume sees prior TURN1_TEXT and yields (P9).'
++    - 'OmpHarness.run and complete pass with mock wrapper, cost 0 (P13/P14).'
++    - 'Parallel profiles/servers both exit 0 (P10).'
++    - 'Preflight --config ... --version exits 0 with missing overlay (P17).'
++  followUps:
++    - 'M8: add extraArgs/mockProvider; implement test/e2e/mock-provider.'
++    - 'M8: gate FACTORY_E2E_OMP=1; keep FACTORY_LIVE_OMP=1 separate.'
++    - 'Replace preflight --version overlay check with omp models --config or a real mock turn; add version floor.'
++    - 'Pin/minimum omp version; re-run spike on upgrade.'
++    - 'Persist scenario cursor by session id for resume/restart.'
++  alternatives:
++    - 'models.yml custom provider (works; second choice).'
++    - '--config providers block (ignored).'
++    - 'Built-in Ollama/LM Studio (requires local runtime).'
++    - 'FakeHarness/mock binary (not real omp).'
++  ```
++
++  ## Risks / concern cross-check
++
++  - Preflight overlay validation no-op confirmed (`c-477404c672`): `preflight.ts:383-385` uses `--version`; missing overlay exits 0; real session exits 1. High risk 19.1/19.2.
++  - OmpHarness no extra-args seam: wrapper works but add `extraArgs`/`mockProvider`; medium, 19.8.
++  - Flag placement: `-e`/`--config` after `models` for catalog; root-level for sessions.
++  - `PI_CONFIG_DIR` absolute path resolved under `$HOME` in 18.18.5; use `PI_CODING_AGENT_DIR`/real profile and verify `omp config path`.
++  - `agent_end.yielded` true for text-only; use yieldData.
++  - `models.yml` works with temp `PI_CODING_AGENT_DIR`; named-profile caveat is path resolution.
++  - `c-aaebfb4099` out of scope; parallel mock probing is safe but doesn't address epic lock/merge.
++  - `c-ba416d7313` disproved: zero-paid real-omp mock path exists.
++
++  ## Sources
++
++  - `docs/factory.v2.md:104-113`
++  - `plugins/software-factory/docs/ARCHITECTURE.md:40`
++  - `plugins/software-factory/src/cli/preflight.ts:365-394`
++  - `plugins/software-factory/src/harness/omp/harness.ts:368-388`, `:525-570`, `:707-715`
++  - `plugins/software-factory/src/harness/omp/ndjson.ts:52-150`
++  - `plugins/software-factory/src/harness/omp/overlay.ts:26-86`
++  - `plugins/software-factory/src/harness/fake/fake-harness.ts:8-51`
++  - `plugins/software-factory/docs/spikes/omp-1-topology.md:55-104`
++  - `plugins/software-factory/docs/spikes/omp-2-cli-adapter.md:41-110`
++  - `plugins/software-factory/test/harness/smoke-live.test.ts:9-81`
++  - https://omp.sh/docs/extensions
++  - https://omp.sh/docs/models
++  - https://omp.sh/docs/providers
++  - https://omp.sh/docs/extension-loading
++  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/tools/yield.ts
++contextPack: "CHOSEN SEAM: omp extension -e mock-provider.ts ->
++  pi.registerProvider('mock', {api:'openai-completions',
++  baseUrl:'http://127.0.0.1:<ephemeral>/v1', apiKey:'mock-key',
++  models:[{id:'mock-chat', cost:0}]}) + local scripted SSE server. SCENARIO:
++  {turns:[{text}|{toolCalls:[{name,arguments}]}|{yield:{data|error}}]}, one turn
++  per provider POST; toolCalls continue, yield terminates; optional
++  usage/match/onExhausted. INTEGRATION: OmpHarness wrapper binary proven (exec
++  omp -e ext \"$@\"); add extraArgs/mockProvider in M8. NDJSON: session ->
++  agent_start -> turn_start -> user messages -> assistant message_start (usage
++  zeros) -> message_update deltas -> message_end/turn_end (real usage,
++  stopReason stop|toolUse) -> tool_execution_start/end -> agent_end (isTerminal,
++  yielded true even for text-only). Yield data appears in turn_end/agent_end
++  toolCall, tool_execution_start args, and tool_execution_end
++  result.details.data. HERMETICITY: --no-extensions -e, --no-session, temp
++  PI_CODING_AGENT_DIR or unique --profile, explicit mock/mock-chat, assert
++  server log + usage.costUsd===0. PREFLIGHT: omp --config overlay --version
++  ignores overlay (exit 0 even when missing); replace with omp models --config
++  overlay --json or a real mock turn. FALLBACK SEAM: models.yml in active agent
++  dir (verified with PI_CODING_AGENT_DIR); --config providers block is ignored."
++sources:
++  - docs/factory.v2.md:104-113
++  - plugins/software-factory/docs/ARCHITECTURE.md:40
++  - plugins/software-factory/src/cli/preflight.ts:365-394
++  - plugins/software-factory/src/harness/omp/harness.ts:368-388
++  - plugins/software-factory/src/harness/omp/harness.ts:525-570
++  - plugins/software-factory/src/harness/omp/harness.ts:707-715
++  - plugins/software-factory/src/harness/omp/ndjson.ts:52-150
++  - plugins/software-factory/src/harness/omp/overlay.ts:26-86
++  - plugins/software-factory/src/harness/fake/fake-harness.ts:8-51
++  - plugins/software-factory/docs/spikes/omp-1-topology.md:55-104
++  - plugins/software-factory/docs/spikes/omp-2-cli-adapter.md:41-110
++  - plugins/software-factory/test/harness/smoke-live.test.ts:9-81
++  - https://omp.sh/docs/extensions
++  - https://omp.sh/docs/models
++  - https://omp.sh/docs/providers
++  - https://omp.sh/docs/extension-loading
++  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/tools/yield.ts
++recommendations:
++  - "M8: add extraArgs/mockProvider to OmpHarness (or keep the proven wrapper)
++    and implement test/e2e/mock-provider/{extension,server,scenario,runner}.ts."
++  - "M8: gate no-model e2e with FACTORY_E2E_OMP=1; keep paid FACTORY_LIVE_OMP=1
++    separate."
++  - Use per-process mock extension with -e and --no-extensions, a unique profile
++    or temp PI_CODING_AGENT_DIR, --no-session, explicit mock/mock-chat; assert
++    server request log and usage.costUsd === 0.
++  - "Define scenario cursors per session id for resume/restart; default
++    onExhausted: error."
++  - Replace preflight's omp --config <overlay> --version no-op with omp models
++    --config <overlay> --json or a real mock turn; add an omp version floor
++    (tested 18.18.5).
++  - Pin/minimum omp version and re-run the spike on upgrade.
++concerns:
++  - kind: risk
++    summary: Preflight's omp overlay validation is a no-op (--config ... --version)
++    detail: "src/cli/preflight.ts:383-385 runs omp --config <overlay> --version.
++      --version is an early-exit and ignores the overlay: with a missing overlay
++      it still prints omp/18.18.5 and exits 0, while a real omp --config
++      <missing> -p ... exits 1 with Config overlay not found. This confirms
++      existing concern c-477404c672."
++    severity: high
++    location:
++      file: plugins/software-factory/src/cli/preflight.ts
++      line: 383
++    affects:
++      - "19.1"
++      - "19.2"
++  - kind: tech-debt
++    summary: OmpHarness has no extension/extra-arg seam; mock provider needs a
++      wrapper or new option
++    detail: OmpHarness hard-codes run/complete args at
++      src/harness/omp/harness.ts:368-388 and :707-715; it never passes -e. The
++      wrapper-binary workaround is proven, but M8 should add an
++      extraArgs/mockProvider option so tests do not depend on shell wrappers.
++    severity: medium
++    location:
++      file: plugins/software-factory/src/harness/omp/harness.ts
++      line: 368
++    affects:
++      - "19.8"
++remarkable:
++  - chosen: Extension -e + pi.registerProvider + local OpenAI-compatible SSE mock
++      server
++    why: Process-scoped, explicit per test, parallel-safe, catalog-visible via omp
++      models -e, and proven end-to-end through both omp -p and
++      OmpHarness.run/complete with zero paid calls. It avoids mutating a shared
++      profile/config file.
++    alternatives:
++      - models.yml custom provider in a temp agent dir (works; second choice,
++        but profile/agent-dir coupling and path-resolution caveats)
++      - "--config overlay with a providers: block (ruled out: ignored by the
++        model catalog)"
++      - Built-in Ollama/LM Studio local endpoint (needs a local model runtime;
++        not scripted)
++      - FakeHarness or mock omp binary (does not exercise real omp)
+diff --git a/.factory/tasks/omp-workspaces/journal.ndjson b/.factory/tasks/omp-workspaces/journal.ndjson
+index 0a5bb43..2c1b73c 100644
+--- a/.factory/tasks/omp-workspaces/journal.ndjson
++++ b/.factory/tasks/omp-workspaces/journal.ndjson
+@@ -31,27 +31,3 @@
+ {"type":"step_started","task":"omp-workspaces","step":"pm-edits-1","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces/.factory/tasks/omp-workspaces/runs/007-pm-edits-1-a1","ts":"2026-11-09T23:40:10.744Z"}
+ {"type":"step_timeout_armed","task":"omp-workspaces","step":"pm-edits-1","timeoutSec":2700,"ts":"2026-11-09T23:40:10.750Z"}
+ {"type":"step_finished","task":"omp-workspaces","step":"pm-edits-1","attempt":1,"status":"ok","sessionId":"01a1c2af-0016-7098-ba92-2c02615b5e7a","usage":{"inputTokens":23951,"outputTokens":8627,"costUsd":0.004121},"ts":"2026-11-09T23:41:24.172Z"}
+-{"type":"wave_started","wave":1,"iteration":1,"ts":"2026-11-09T23:41:24.717Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"spike-omp-isolation","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-omp-isolation/.factory/tasks/omp-workspaces/items/spike-omp-isolation/steps/001-research-r1-a1","ts":"2026-11-09T23:41:25.263Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-omp-isolation","step":"research","timeoutSec":3600,"ts":"2026-11-09T23:41:25.270Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"spike-mock-provider","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-mock-provider/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1","ts":"2026-11-09T23:41:25.319Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-mock-provider","step":"research","timeoutSec":3600,"ts":"2026-11-09T23:41:25.326Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"spike-cache-key","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-cache-key/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1","ts":"2026-11-09T23:41:25.425Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-cache-key","step":"research","timeoutSec":3600,"ts":"2026-11-09T23:41:25.434Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"spike-repo-rules","step":"research","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-repo-rules/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1","ts":"2026-11-09T23:41:25.532Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-repo-rules","step":"research","timeoutSec":3600,"ts":"2026-11-09T23:41:25.543Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"spike-repo-rules","step":"research","attempt":1,"sizeBytes":47180984,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-41-26-200Z_01a1c2b0-2538-749d-9c25-5a46df725a1d.jsonl","ts":"2026-11-09T23:58:38.949Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"spike-repo-rules","step":"research","attempt":1,"toolCalls":110,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-41-26-200Z_01a1c2b0-2538-749d-9c25-5a46df725a1d.jsonl","ts":"2026-11-09T23:58:38.950Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"spike-repo-rules","step":"research","attempt":1,"status":"ok","sessionId":"01a1c2b0-2538-749d-9c25-5a46df725a1d","usage":{"inputTokens":171777,"outputTokens":89871,"costUsd":0.10315},"ts":"2026-11-09T23:58:39.145Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"spike-mock-provider","step":"research","attempt":1,"sizeBytes":16133892,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-41-25-876Z_01a1c2b0-23f3-749f-9d53-1d80a5467b6b","ts":"2026-11-09T23:58:45.641Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"spike-mock-provider","step":"research","attempt":1,"toolCalls":91,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-41-25-876Z_01a1c2b0-23f3-749f-9d53-1d80a5467b6b","ts":"2026-11-09T23:58:45.642Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-mock-provider","step":"research","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-09T23:58:48.110Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-mock-provider","step":"research","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-09T23:58:50.181Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"spike-mock-provider","step":"research","attempt":1,"method":"ask","ts":"2026-11-10T00:00:31.791Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"spike-mock-provider","step":"research","attempt":1,"status":"ok","sessionId":"01a1c2b0-23f3-749f-9d53-1d80a5467b6b","usage":{"inputTokens":177310,"outputTokens":90586,"costUsd":0.09724},"ts":"2026-11-10T00:00:32.035Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"spike-omp-isolation","step":"research","attempt":1,"sizeBytes":65236573,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-41-25-799Z_01a1c2b0-23a7-7320-95a4-4554e95db71e.jsonl","ts":"2026-11-10T00:15:33.113Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"spike-omp-isolation","step":"research","attempt":1,"toolCalls":187,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-41-25-799Z_01a1c2b0-23a7-7320-95a4-4554e95db71e.jsonl","ts":"2026-11-10T00:15:33.116Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-omp-isolation","step":"research","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T00:15:35.648Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-omp-isolation","step":"research","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T00:15:38.109Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"spike-cache-key","step":"research","attempt":1,"sizeBytes":17208600,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-41-26-058Z_01a1c2b0-24aa-72df-8f7d-5ddbac0d4498","ts":"2026-11-10T00:16:23.836Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"spike-cache-key","step":"research","attempt":1,"toolCalls":138,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-41-26-058Z_01a1c2b0-24aa-72df-8f7d-5ddbac0d4498","ts":"2026-11-10T00:16:23.837Z"}
+diff --git a/.factory/tasks/omp-workspaces/state.yaml b/.factory/tasks/omp-workspaces/state.yaml
+index 10064e8..34ac63b 100644
+--- a/.factory/tasks/omp-workspaces/state.yaml
++++ b/.factory/tasks/omp-workspaces/state.yaml
+@@ -3,57 +3,11 @@ kind: saga
+ status: active
+ iteration: 1
+ currentWave: 1
+-items:
+-  spike-cache-key:
+-    kind: fact-finder
+-    status: running
+-    branch: topic/omp-workspaces--spike-cache-key
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0
+-    currentStep: research
+-  spike-mock-provider:
+-    kind: fact-finder
+-    status: running
+-    branch: topic/omp-workspaces--spike-mock-provider
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0.09724
+-    currentStep: research
+-  spike-omp-isolation:
+-    kind: fact-finder
+-    status: running
+-    branch: topic/omp-workspaces--spike-omp-isolation
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0
+-    currentStep: research
+-  spike-repo-rules:
+-    kind: fact-finder
+-    status: running
+-    branch: topic/omp-workspaces--spike-repo-rules
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0.10315
+-    currentStep: research
+-  transport-byte-stability:
+-    kind: test-only
+-    status: pending
+-    branch: topic/omp-workspaces--transport-byte-stability
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0
+-  usage-cache-tokens:
+-    kind: dev
+-    status: pending
+-    branch: topic/omp-workspaces--usage-cache-tokens
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0
++items: {}
+ concerns:
+-  open: 16
++  open: 12
+   dismissed: 0
+-  routed: 3
++  routed: 0
+   resolved: 0
+ debt:
+   - "Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2
+@@ -66,40 +20,19 @@ debt:
+     regenerated per turn; no byte-stability tests.
+   - Runtime dirs sessions/prompts/system-prompts grow without cleanup (only tmp/
+     purged); omp-owned orphans unclassified.
+-  - "[20c] Per-turn prompt transport path embeds timestamp+randomness"
+-  - "[20-cost] Usage parser discards cache-read/write tokens needed for item 20
+-    defaults"
+-  - "[19.6] Saga launches do not exist and epic INTENT is not resolvable by
+-    `factory run`"
+-budgetSpentUsd: 0.34762640000000006
++budgetSpentUsd: 0.1367514
+ spendByRole:
+   workhorse:
+-    costUsd: 0.3212704
+-    inputTokens: 615932
+-    outputTokens: 260303
+-  alt-workhorse:
+-    costUsd: 0.004121
+-    inputTokens: 23951
+-    outputTokens: 8627
+-  alt-architect:
+-    costUsd: 0.006364
+-    inputTokens: 28896
+-    outputTokens: 15650
++    costUsd: 0.1208804
++    inputTokens: 266845
++    outputTokens: 79846
+   architect:
+     costUsd: 0.015871
+     inputTokens: 62797
+     outputTokens: 40479
+ spendByItem:
+-  spike-mock-provider:
+-    costUsd: 0.09724
+-    inputTokens: 177310
+-    outputTokens: 90586
+-  spike-repo-rules:
+-    costUsd: 0.10315
+-    inputTokens: 171777
+-    outputTokens: 89871
+   (orchestration):
+-    costUsd: 0.14723639999999996
+-    inputTokens: 382489
+-    outputTokens: 144602
+-lastUpdated: 2026-11-10T00:00:32.608Z
++    costUsd: 0.1367514
++    inputTokens: 329642
++    outputTokens: 120325
++lastUpdated: 2026-11-09T23:33:06.447Z
+
+## Human involvement
+# Human involvement criteria
+
+Mode selects which ADR and concern decisions need a human decision. Everything
+else is either autonomous or digest-only; never block on items the table marks
+remarkable.
+
+## Blocking table (ADRs and concerns)
+
+| Mode | Blocking (needs human decision) | Remarkable (digest only) |
+| --- | --- | --- |
+| autonomous | high-severity ADRs/concerns still blocking after unblocked work | everything else |
+| principal | stack/layer, external interfaces, config shapes | internal choices |
+| detailed | external-interface changes and major internal interfaces | minor internals |
+
+## autonomous
+
+Block only explicit high-severity ADRs/concerns that remain after all unblocked
+work is finished. Do not stop for internal choices; record them as remarkable.
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["approved","changes_requested"])
+- summary (string, required)
+- suggestions (array of object, required)
+  - id (string, required)
+  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async","dismiss"])
+  - summary (string, required)
+  - detail (string, optional)
+  - location (object, optional)
+    - file (string, required)
+    - line (integer, optional)
+- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
+  - chosen (string, required)
+  - why (string, required)
+  - alternatives (array of string, required)
+- newConcerns (array of object, optional): New concerns discovered during review
+  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
+  - summary (string, required)
+  - detail (string, optional)
+  - severity (string, optional, enum: ["low","medium","high"])
+  - location (object, optional)
+    - file (string, required)
+    - line (integer, optional)
+  - affects (array of string, optional)
diff --git a/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/002-review-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/002-review-r1-a1/meta.yaml
new file mode 100644
index 0000000..57b7811
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/002-review-r1-a1/meta.yaml
@@ -0,0 +1,20 @@
+seq: 2
+name: review
+attempt: 1
+fixRound: 1
+agent: reviewer
+role: alt-workhorse
+models:
+  - opencode-go/muse-spark-1.3-contributor
+  - opencode-go/deepseek-v4.1-flash
+timeoutSec: 3600
+status: ok
+startedAt: 2026-11-10T00:55:03.230Z
+session: 01a1c2f3-8df1-7235-ae55-5994373ec7e3
+endedAt: 2026-11-10T01:19:46.908Z
+usage:
+  inputTokens: 78049
+  outputTokens: 77703
+  costUsd: 0.027357
+repairedFrom: simpler_repair
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T00-55-03-921Z_01a1c2f3-8df1-7235-ae55-5994373ec7e3.jsonl
diff --git a/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/002-review-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/002-review-r1-a1/output.yaml
new file mode 100644
index 0000000..fd711d3
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-mock-provider/steps/002-review-r1-a1/output.yaml
@@ -0,0 +1,34 @@
+status: approved
+summary: Spike proves -e registerProvider mock seam on real omp with zero paid
+  calls; M1 scenario-2 answered, no prod edits.
+suggestions:
+  - detail: Existing live test is test/harness/smoke-live.test.ts; M8 proposal
+      test/e2e/mock-provider/* introduces a new top-level dir. Prefer
+      test/harness/mock-provider/* to match repo idiom, or justify the e2e split
+      in the spike doc.
+    disposition: optional
+    id: test-path-consistency
+    location:
+      file: .factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/output.yaml
+      line: 70
+    summary: Proposed test/e2e/mock-provider diverges from test/harness layout
+  - detail: Findings describe event sequence, usage fields, and yield envelope
+      accurately (verified against ndjson.ts:64-142) but give no raw lines. One
+      short session-to-agent_end excerpt would let M8 build parser fixtures
+      without re-running probes.
+    disposition: optional
+    id: ndjson-raw-excerpt
+    location:
+      file: .factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/output.yaml
+      line: 46
+    summary: Add one raw NDJSON transcript excerpt to spike draft
+  - detail: Scenario types include error {status?,message} but findings honestly
+      disclose 'Error turns optional, not probed'. M8 runner should verify omp
+      -p exit code and NDJSON error mapping for HTTP 500 before adopting
+      match/onExhausted failure semantics.
+    disposition: optional
+    id: error-turn-unprobed
+    location:
+      file: .factory/tasks/omp-workspaces/items/spike-mock-provider/steps/001-research-r1-a1/output.yaml
+      line: 66
+    summary: Error-turn scenario variant unprobed; verify before M8 relies on it

## Review Feedback
Quality gates failed on merge path for spike-mock-provider: typecheck. typecheck (exit via status=fail). Command: bun --cwd=plugins/software-factory run typecheck Details: error TS2688: Cannot find type definition file for 'bun'.
  The file is in the program because:
    Entry point of type library 'bun' specified in compilerOptions

$ tsc --noEmit

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


- Raise concerns with evidence; condense stale detail instead of repeating it.

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
