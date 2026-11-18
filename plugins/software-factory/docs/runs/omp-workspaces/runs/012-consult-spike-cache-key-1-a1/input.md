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
spike-cache-key

## Assignment
{"slug":"spike-cache-key","kind":"fact-finder","title":"Spike: prompt-cache keying + compaction/warming audit","assignment":"Fact-finder spike, no prod code. 1) Render the same agent prompt twice via current transport and diff bytes/argv (system-prompt content, overlay bytes, prompt path/argv). 2) Run bounded live resume probes with cache-miss markers: same vs changed prompt path, model switch, TTL expiry; record cacheRead/cacheWrite/totalTokens and cost deltas. 3) Audit which compaction.* and providers.cache* knobs affect one-process-per-turn factory sessions and what cold-resume detection signals exist. 4) Recommend cold-resume detection plus compaction-vs-fresh-brief mechanism and standby-warming viability for M7. Outputs: items/{item}/findings.md with byte-diff tables and probe log, full draft for plugins/software-factory/docs/spikes/omp-5-cache-keys.md, draft decision YAML {status, decision, evidence, followUps} stating content-vs-path keying and applicable knobs. Constraints: read-only on repo prod paths; cwd=plugins/software-factory; throwaway profile/repos, unique temp dirs; no transport stabilization (M2 characterizes, M7 implements). Acceptance: answers M1 cache-key scenario.","outlineRef":"spike-cache-key","milestone":"m1-omp-de-risk","wave":1,"scenarioRefs":["m1-omp-de-risk:scenario-3"],"citations":["docs/factory.v2.md:114-120","plugins/software-factory/docs/OMP_ADAPTER.md:163-168","plugins/software-factory/docs/ARCHITECTURE.md:40"]}

## Prior Attempts & Failures
Merge path failed for spike-cache-key (attempt 2/2)

## Current Diff
diff --git a/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/input.md
new file mode 100644
index 0000000..bb1abec
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/input.md
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
+  "slug": "spike-cache-key",
+  "kind": "fact-finder",
+  "title": "Spike: prompt-cache keying + compaction/warming audit",
+  "assignment": "Fact-finder spike, no prod code. 1) Render the same agent prompt twice via current transport and diff bytes/argv (system-prompt content, overlay bytes, prompt path/argv). 2) Run bounded live resume probes with cache-miss markers: same vs changed prompt path, model switch, TTL expiry; record cacheRead/cacheWrite/totalTokens and cost deltas. 3) Audit which compaction.* and providers.cache* knobs affect one-process-per-turn factory sessions and what cold-resume detection signals exist. 4) Recommend cold-resume detection plus compaction-vs-fresh-brief mechanism and standby-warming viability for M7. Outputs: items/{item}/findings.md with byte-diff tables and probe log, full draft for plugins/software-factory/docs/spikes/omp-5-cache-keys.md, draft decision YAML {status, decision, evidence, followUps} stating content-vs-path keying and applicable knobs. Constraints: read-only on repo prod paths; cwd=plugins/software-factory; throwaway profile/repos, unique temp dirs; no transport stabilization (M2 characterizes, M7 implements). Acceptance: answers M1 cache-key scenario.",
+  "outlineRef": "spike-cache-key",
+  "milestone": "m1-omp-de-risk",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-omp-de-risk:scenario-3"
+  ],
+  "citations": [
+    "docs/factory.v2.md:114-120",
+    "plugins/software-factory/docs/OMP_ADAPTER.md:163-168",
+    "plugins/software-factory/docs/ARCHITECTURE.md:40"
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
+  "docs/factory.v2.md:114-120",
+  "plugins/software-factory/docs/OMP_ADAPTER.md:163-168",
+  "plugins/software-factory/docs/ARCHITECTURE.md:40"
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
diff --git a/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/meta.yaml
new file mode 100644
index 0000000..6fccfad
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
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
+startedAt: 2026-11-09T23:41:25.227Z
+session: 01a1c2b0-24aa-72df-8f7d-5ddbac0d4498
+endedAt: 2026-11-10T00:16:24.085Z
+usage:
+  inputTokens: 233491
+  outputTokens: 109631
+  costUsd: 0.130651
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-41-26-058Z_01a1c2b0-24aa-72df-8f7d-5ddbac0d4498
diff --git a/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/output.yaml
new file mode 100644
index 0000000..9a42ed5
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/output.yaml
@@ -0,0 +1,554 @@
+status: ok
+summary: "OMP 18.18.5 keys the prompt cache by request-prefix content, not by
+  file path. The factory's unique per-turn prompt path is harmless; identical
+  system-prompt bytes at a changed path still fully hit cache, while a one-byte
+  system-prompt change, a tools or thinking-level change, a model switch, 5m TTL
+  expiry, or compaction all go cold. The audit also found that the factory
+  currently records no cacheRead/cacheWrite/cttl data, inherits host
+  cache/compaction/mnemopi settings because the generated overlay pins none of
+  them, and cannot use omp's idle warming or idle compaction in
+  one-process-per-turn (-p) sessions. Recommended M7 policy: content
+  fingerprints for cold detection, fresh brief over compaction for an
+  already-cold resume, compact only while warm at a wave boundary (verified `omp
+  -p --resume <id> \"/compact\"` works), and long retention for the architect on
+  standby rather than native warming."
+findings: |
+  # Draft for `plugins/software-factory/docs/spikes/omp-5-cache-keys.md`
+
+  # Spike: prompt-cache keying + compaction/warming audit
+
+  Status: complete (M1 / `spike-cache-key`)
+  Harness: `omp/18.18.5` on Linux x86_64 WSL2; factory checkout `plugins/software-factory`; live probes used throwaway `/tmp` dirs and throwaway session dirs (no production paths edited).
+
+  ## 0. Verdict (answers the M1 cache-key scenario)
+
+  **OMP prompt caching is content-keyed, not path-keyed.**
+
+  - A changed system-prompt *path* with byte-identical content still produced a full cache hit: DeepSeek `cacheRead=11,392` (T3 below); Anthropic `cacheRead=6,703` (A-T2 below).
+  - A new prompt-file *path* on every turn did not break resumed-turn caching: Anthropic `cacheRead=29,363` on a resume whose prompt file path differed from the previous turn.
+  - A one-byte system-prompt content change (appended newline) produced `cacheRead=0` (DeepSeek T3, `input=13,266`).
+  - Tools change produced a partial miss (`cacheRead=2,432` of a prior `4,480`); thinking-level change and model switch produced full misses (`cacheRead=0`).
+  - A 330-second gap on Anthropic `short` retention produced `cacheRead=0`, `cacheWrite=38,022` (cold).
+  - A brand-new session with the same system prompt/tools reused the system-prompt prefix from the provider cache (`cacheRead=4,224`), so a fresh session is not inherently a full cold read.
+
+  **Consequence for the factory:** the transport's random prompt filename is safe; the cached prefix is the system-prompt bytes + tool specs + model/thinking identity + conversation history. The real cold-resume triggers are: system-prompt content change, tools change, model/thinking change, cache-retention/TTL change/expiry, and compaction. The current factory does not detect any of these (see §5) and does not pin the knobs (see §6).
+
+  ## 1. Method
+
+  - Transport audit (no model calls): ran `OmpHarness.run()` four times (fresh ×2, resume ×2) with `OMP_PATH` pointed at a throwaway shim that logged argv and copied the `--system-prompt`/`-p @file` inputs. Same rendered `steps/architect-resume` prompt, same `PipelineConfig`, same runtime dir, same synthetic session id.
+  - Live probes: real `omp -p --mode json` turns against `opencode-go/deepseek-v4.1-flash:max`, `opencode-go/muse-spark-1.3-contributor:max`, and `anthropic/claude-haiku-5-5:max`, using the factory's generated overlay plus the actual architect system prompt (`agents/architect.md` body). Unique `--session-dir`/`--cwd` per probe family under `/tmp`; `--max-cost 0.10` per turn. Aggregate live spend ≈ **$0.05**.
+  - All probe dirs are throwaway (`/tmp/spike-cache-key-*`); no repo file was written.
+
+  ## 2. Transport render audit (byte/argv diff)
+
+  Source under audit: `src/harness/omp/harness.ts:286-350` (prompt materialization), `src/harness/omp/harness.ts:368-389` (argv), `src/harness/omp/overlay.ts:26-100` (overlay).
+
+  | Run pair | System-prompt bytes | System-prompt path | Prompt bytes | Prompt path | Argv |
+  |---|---|---|---|---|---|
+  | fresh-1 vs fresh-2 | identical, sha256 `cb92bbcaafd7bfa7b52413cc9a75cd58985c4e22b21b9984a60733a9f177c93a` | identical `.../system-prompts/architect-fresh.md` | identical, sha256 `4a9d87d474be6638f4c5b1bc4655622baa7566e9e91935bc12aa136c6cec6d88` | **different** `prompt-1794267999675-k2y1.txt` vs `prompt-1794267999746-1jly.txt` | identical except `-p @<path>` |
+  | resume-1 vs resume-2 | identical | identical `.../system-prompts/architect-spike-session-fixed.md` | identical | **different** | identical except `-p @<path>` |
+  | fresh vs resume | identical | **different** (`fresh` vs sanitized session id) | identical | different | resume adds `--resume spike-session-fixed` |
+  | overlay generated twice | — | — | — | — | identical YAML, 1,472 bytes, sha256 `6ebf5894b6aaa2123b1cc3030555c3f5e61562751a2e332ef4b5d5b96e739f53` |
+
+  Exact fresh argv (captured; resume adds `--resume spike-session-fixed` after `--session-dir`):
+
+  ```text
+  --cwd /tmp/spike-cache-key-0c1ojol5/cwd
+  --config /tmp/spike-cache-key-0c1ojol5/runtime/omp-overlay.yaml
+  --mode json
+  --model @architect
+  --session-dir /tmp/spike-cache-key-0c1ojol5/runtime/sessions
+  --tools=read,grep,glob
+  --system-prompt /tmp/spike-cache-key-0c1ojol5/runtime/system-prompts/architect-fresh.md
+  -p @/tmp/spike-cache-key-0c1ojol5/runtime/prompts/prompt-1794267999675-k2y1.txt
+  ```
+
+  Findings:
+
+  - System prompt is `extractAgentBody(run.definition)` written to `${agent}-${sessionKey}.md`; `sessionKey` is `fresh` or the sanitized resume id (`harness.ts:293-300`). Content is byte-stable per agent definition and path is deterministic per agent+session. The fresh→resume transition changes the path but not the bytes.
+  - Prompt is written to `prompt-${Date.now()}-${random4}.txt` (`harness.ts:311-316`), so the path is unique every turn and the argv differs only there. Prompt **content** is byte-identical when the same fragment/vars are rendered.
+  - Overlay is regenerated from the effective pipeline every run (`harness.ts:225-240`) and is byte-stable for identical config; it contains only `modelRoles`, `retry`, `eval`, `title`, `checkpoint`, `advisor`, `bash`, `mnemopi` (three linking flags), and `update` (`overlay.ts:51-85`). It pins **none** of `providers.cache*`, `compaction.*`, `snapcompact.*`, or `mnemopi.autoRecall/autoRetain`.
+  - omp wraps the `@file` argument into the user message as `<file name="/abs/path">…</file>` (observed in `message_start`/`message_end` and the session JSONL). Therefore the *new* user message is not byte-identical when the same logical prompt is re-rendered to a different path. This does not break the prior cached prefix (the wrapper is appended at the end), but it means the transport is not byte-reproducible for retries. A content-addressed prompt filename (e.g. `prompt-<sha256>.txt`) would fix that; it is not required for cache hits.
+
+  ## 3. Live resume probe log
+
+  All rows are `turn_end.message.usage`; `totalTokens = input + output + cacheRead + cacheWrite` in every observed row. `input` is *uncached* input (Anthropic reports `input=4` while writing/reading tens of thousands of cached tokens).
+
+  ### 3.1 Path / model / content probes (opencode-go DeepSeek, 1M context, implicit cache)
+
+  | Probe | Input | cacheRead | cacheWrite | total | Cost USD | Interpretation |
+  |---|---:|---:|---:|---:|---:|---|
+  | D-T1 fresh (architect-resume prompt) | 9,060 + 478 + 1,515 | 0 + 8,960 + 9,344 | 0 | 9,318 / 9,717 / 11,390 | 0.001514 + 0.000266 + 0.000574 = **0.002354** | first request cold; intra-turn tool-loop requests cache |
+  | D-T2 resume, same system-prompt path, new prompt path | 677 | 10,752 | 0 | 11,439 | **0.000140** | new prompt path is harmless |
+  | D-T3 resume, **system-prompt path changed**, same bytes | 86 | 11,392 | 0 | 11,481 | **0.000049** | path is not in the key |
+  | D-T4 resume, prompt path reused, content changed | 130 | 11,392 | 0 | 11,586 | **0.000092** | path reuse gives no extra hit; prior prefix still hits |
+  | D-T5 resume, **model switched** to `opencode-go/muse-spark-1.3-contributor:max` | 11,082 | 0 | 0 | 11,775 | **0.001247** | model switch is a full cold read (≈8.9× D-T2) |
+
+  ### 3.2 Content / tools / thinking invalidations (clean 2-turn sessions, DeepSeek)
+
+  | Scenario | T1 input | T2 input | T2 cacheRead | Result |
+  |---|---:|---:|---:|---|
+  | Control (same system prompt, same tools, same thinking) | 4,505 | 90 | 4,480 | near-full warm hit |
+  | System prompt + one appended newline (same path) | 4,585 | 13,266 | 0 | full miss |
+  | Tools `read,grep,glob` → `read,grep,glob,bash` | 4,585 | 2,719 | 2,432 | partial miss (tools are in the prefix) |
+  | Thinking `:max` → `:high` (same model id) | 4,585 | 4,681 | 0 | full miss |
+
+  Anthropic confirms path invariance: A-T1 fresh `input=4`, `cacheWrite=6,703`; A-T2 resume with a **different system-prompt path and identical bytes**: `input=4`, `cacheRead=6,703`, `cacheWrite=342`, cost $0.000143 (vs $0.00098 fresh).
+
+  ### 3.3 TTL expiry (Anthropic short/5m)
+
+  | Turn | Input | cacheRead | cacheWrite | cttl | Cost USD |
+  |---|---:|---:|---:|---|---:|
+  | T1 fresh (2 requests) | 4 + 2 | 0 + 15,501 | 15,501 + 13,862 | `ephemeral5m` | 0.008491 + 0.006040 |
+  | T2 resume ~1 min after T1 | 4 | 29,363 | 8,359 | `ephemeral5m` | **0.001454** |
+  | T3 resume 330 s after T2 | 4 | **0** | **38,022** | `ephemeral5m` | **0.004767** |
+
+  330 s is past the 300 s short TTL; the cold resume cost 3.3× the warm resume. Long retention was verified separately: `providers.cacheRetention: long` produced `cttl: {ephemeral1h: 6,705}`.
+
+  `providers.cacheRetention: none` on a single fresh request produced `input=4,510`, `cacheRead=2,256`, `cacheWrite=24`, `cttl: {ephemeral5m: 24}` — i.e. omp stopped requesting explicit retention, but the provider still served an implicit cached prefix (the default base prompt) from an earlier identical request. `none` is therefore not a guarantee of zero cacheRead; it does reduce explicit write cost for single-request turns.
+
+  ### 3.4 Cross-session reuse
+
+  A brand-new session in a new cwd with the same architect system prompt/tools/prompt shape produced `input=207`, `cacheRead=4,224`, `cacheWrite=0` — the system-prompt prefix was reused across session ids. Content, not session id, is the key (omp may still use session ids for provider routing affinity, but it is not a hard cache-key component for this provider).
+
+  ### 3.5 Memory-recall caveat (important)
+
+  The session JSONL records `custom/system-prompt-digest` entries. With no recalled memories the digest of the same architect body was `a94d3680ec1c75cf` across different paths, cwds and session ids. With `mnemopi.autoRecall` returning a prior turn, the digest changed (`a89aabcb237da3c7`, `634c40b6e2f931de`) even though the agent body was unchanged; a one-newline body change produced `1a5712bb71b370ac`. Conclusion: the digest is a content hash of the **effective** system prompt including injected memory text (not path), and omp's ambient memory can change it. The factory overlay disables `polyphonicRecall`/`enhancedRecall`/`proactiveLinking` (`overlay.ts:77-81`) but leaves `mnemopi.autoRecall` and `mnemopi.autoRetain` at their default `true`. Recalled memories are injected only into the first turn of a session (observed once per session; docs: “Recall local memories into the first turn of each session”), so resumed turns are not re-polluted, but fresh sessions in a reused cwd are non-deterministic and can recall prior task text into the system prompt — losing the cross-session system-prompt cache hit and potentially leaking context between tasks that share a worktree.
+
+  ## 4. What the cache key covers
+
+  **Content key (confirmed):** system-prompt bytes + tool specs (ordered) + model identity + thinking level + conversation history + cache retention markers/TTL. **Not in the key (confirmed):** system-prompt file path, prompt-file path, session id (for content reuse), file mtimes.
+
+  Invalidation matrix:
+
+  | Change | Observed effect |
+  |---|---|
+  | system-prompt path changed, bytes identical | full hit (DeepSeek 11,392; Anthropic 6,703) |
+  | prompt path changed every turn | full hit on prior prefix (Anthropic 29,363) |
+  | prompt path reused, content changed | no extra hit; prior prefix still hits (11,392) |
+  | system-prompt +1 byte | full miss (0) |
+  | tools order/content changed | partial/full miss; measured 2,432 of 4,480 retained |
+  | thinking level changed | full miss (0) |
+  | model switched | full miss (0), ~8.9× cost |
+  | 5m TTL expired (330 s gap) | full miss (0), `cacheWrite` = 38,022 |
+  | new session, same system prompt/tools | system-prompt prefix hit (4,224) |
+  | compaction committed | prefix rewritten; next request cannot reuse the pre-compaction prefix |
+
+  ## 5. Cold-resume detection signals
+
+  ### 5.1 Pre-launch signals (engine can act before spending)
+
+  Read from the session JSONL (the engine already has its path as `meta.yaml` `traceRef`, `src/core/records/step-record.ts:96`, produced at `harness.ts:521-522`):
+
+  1. **`custom/system-prompt-digest`** — 16-hex digest of the effective system prompt. Compare the latest value to the engine's own hash of the current `agentBody`; content-only (path-independent), but includes omp-injected memory text (see §3.5).
+  2. **`model_change`** — resolved `model` recorded at session start. Compare to the model the current `@role` resolves to. `@role` is re-resolved on every resume (`harness.ts:318-326`), so a pipeline/role/fallback change silently switches models.
+  3. **`thinking_level_change`** — recorded level; compare to the current role suffix. A change is a full miss (measured).
+  4. **`cttl` + last assistant timestamp** from the newest assistant message usage (`ephemeral5m`/`ephemeral1h`). Expiry = request-send time + TTL. The transcript timestamp is completion time, so subtract a conservative margin (seconds to tens of seconds).
+  5. **`compaction` entry** after the last normal turn — history was rewritten; the next resume is cold from the cut point.
+  6. **`credential_pin.hash`** (optional) — provider/account affinity changed; OpenAI-style `prompt_cache_key` affinity may be lost.
+  7. **Ordered tools hash and cache-retention setting** — the session does not record these; the engine must store them in its own session-state record/meta and compare. Tools change is a partial miss (measured).
+
+  ### 5.2 Post-hoc signals (ground truth)
+
+  - `turn_end.message.usage.cacheRead` == 0 on a resumed turn with prior history ⇒ miss; `cacheWrite` ≈ prompt size ⇒ cold write. `cacheWrite` is only populated by providers with explicit cache writes (Anthropic/Bedrock; DeepSeek reports 0).
+  - `turn_end.message.usage.cttl` gives the tier and cached-token count (`{ephemeral5m: N}` / `{ephemeral1h: N}`); absent for DeepSeek implicit caching.
+  - `turn_end.message` also carries `api`, `provider`, `model`, `reasoningTokens`, `totalTokens` — the factory currently discards all of them.
+  - RPC/SDK expose `cache_warming_start` / `cache_warming_end` with `warmingStopReason` (`refresh missed the cache`, `refresh failed`, `conversation context changed`). `-p --mode json` would include these ordinary session events if warming runs; our probes did not trigger warming (see §7).
+  - `display.cacheMissMarker` and the status-line `cache` segment are **UI-only**; no `cache_miss` event appeared in `-p` NDJSON. Do not build engine detection on them.
+
+  ### 5.3 Records gap (blocks spec 20's “measured defaults”)
+
+  `OmpNdjsonParser` reads only `u.input`, `u.output`, and `u.cost.total` (`src/harness/omp/ndjson.ts:86-99`) and returns only `inputTokens`/`outputTokens`/`costUsd` (`ndjson.ts:173-177`). `Usage` (`src/harness/types.ts:7-11`) and `StepUsage` (`src/core/artifacts.ts:545-549`) have no cacheRead/cacheWrite/totalTokens/cttl/model fields. Consequently the records cannot answer “how many tokens did the cold resume re-pay?” today — only the total cost. Extend the types and parser before choosing cost-measured defaults.
+
+  Also: side requests not tied to the agent turn (`model_usage` entries in the transcript with `purpose: "unexpected-stop"`, compaction summarization) are not attributed to the step. The `-p "/compact"` probe produced no usage record at all (see §7.1).
+
+  ## 6. Knob audit for one-process-per-turn (`-p`) factory sessions
+
+  Effective values observed with `omp config list --json` / `--scope global` on this host (omp 18.18.5): `providers.cacheRetention=short`, `providers.cacheWarming=streaming`, `provider.appendOnlyContext=auto`, `includeModelInPrompt=false`, `compaction.enabled=true`, `compaction.midTurnEnabled=true`, `compaction.methodOrder=[remote,snapcompact,handoff,shake,soft]`, `compaction.experimentalContextManagement=true`, `compaction.handoffSaveToDisk=true`, `compaction.modelThresholds={anthropic/claude-haiku-5-5: "f90000", vercel-ai-gateway/minimax/minimax-m3.1-flash: 800000}`, `mnemopi.autoRecall=true`, `mnemopi.autoRetain=true`, `memory.backend=mnemopi`, `memories.enabled=false`. Several differ from the omp docs defaults: `cacheRetention` docs `auto`, `cacheWarming` docs `idle`, `experimentalContextManagement` docs `false`, `handoffSaveToDisk` docs `false`; `--scope global` proves the host layer sets them. Factory overlay precedence is above project/global (`docs/settings.md:113-123`), so pinning in the generated overlay is effective.
+
+  | Knob | Docs default | Effective here | Affects `-p` one-process-per-turn? | Action for M7 |
+  |---|---|---|---|---|
+  | `providers.cacheRetention` | `auto` | `short` (host) | **Yes** — per-process TTL/markers; a per-turn `--config` overlay can vary it | Pin per role: architect `long` (1h) for standby gaps <1h; `short` for multi-request tool-loop agents; `none` only for known single-request turns |
+  | `providers.cacheWarming` | `idle` | `streaming` (host) | `streaming` **yes** (intra-turn long tool executions); `idle` **no** (no idle scheduler in print sessions; process exits) | Pin `streaming`; do not rely on `idle`/standby warming |
+  | `provider.appendOnlyContext` | `auto` | `auto` | **Yes** — keeps system prompt + tool specs + append-only log for maximum prefix hits | Keep `auto`/`on`; do not disable |
+  | `includeModelInPrompt` | true in docs main; installed effective `false` | `false` | **Yes if true** — model name in the system prompt makes a model switch/fallback change the prefix | Pin `false` |
+  | `display.cacheMissMarker` | true | true | **No** — TUI display only | Use usage fields instead |
+  | `compaction.enabled` | true | true | **Yes** if the threshold is crossed inside a turn (mid-turn or post-turn) | Set explicit thresholds; do not rely on the default 15%/16k reserve (≈850k on a 1M window) |
+  | `compaction.midTurnEnabled` | true | true | **Yes** — can rewrite history between tool-loop requests; the likely auto path in a long factory turn | Keep as overflow safety but raise `thresholdTokens` so it does not fire on normal architect turns |
+  | `compaction.thresholdTokens` / `thresholdPercent` / `reserveTokens` | -1 / -1 / unset | same | **Yes** — trigger point | Pin an explicit architect budget; leave room for the next wave |
+  | `compaction.methodOrder` | remote, snapcompact, handoff, shake, soft | same | **Yes** if compaction fires | Prefer `handoff`/`soft`; avoid `snapcompact` for the architect (images lose prompt caching) |
+  | `compaction.asyncEnabled` | true | true | **Yes** near threshold — speculative side request inside a one-shot process | Keep or disable for deterministic cost; measure |
+  | `compaction.autoContinue` | true | true | **Yes** — post-threshold continuation request; needed so the step still yields | Keep `true`; `false` would end a headless run without the agent's answer |
+  | `compaction.keepRecentTokens` | 20,000 | 20,000 | **Yes** — size of retained tail after compaction | Tune to the architect brief size |
+  | `compaction.supersedeReads` / `dropUseless` | true / true | true / true | **Yes** — cache-aware pruning every turn; can still mutate history near the cache lookback | Keep defaults; audit if cacheRead drops unexpectedly |
+  | `compaction.idleEnabled` / `idleThresholdTokens` / `idleTimeoutSeconds` | false / 200,000 / 300 | same | **No** — idle maintenance is enabled only by the interactive TUI; SDK/RPC/print sessions do not enable it (`docs/sdk.md:278`) | Ignore for `-p`; do not build standby policy on it |
+  | `compaction.handoffSaveToDisk` | false (host true) | true | No direct cache effect; writes summary artifacts | Pin for determinism |
+  | `compaction.experimentalContextManagement` | false (host true) | true | **Potentially** — notes-backed rollover; requires `context_notes`/`new_context`/`read`/`grep` tools, otherwise legacy maintenance | Pin `false` unless deliberately opted in |
+  | `snapcompact.systemPrompt` | `none` | `none` | **Yes** — imaging system prompt text loses prompt caching for that text | Pin `none` |
+  | `snapcompact.toolResults` | false | false | **Maybe** — images of tool results; cache/vision trade-off | Pin `false` for architect |
+  | `compaction.remoteEndpoint` / `remoteStreamingV2Enabled` / `v2RetainedMessageBudget` | unset / true / 64,000 | same | **Yes** if remote compaction is used | Decide/pin; remote is a second compaction path to test |
+  | `compaction.modelThresholds` / `modelThresholdsEnabled` | per-model / true | host overrides | **Yes** — can trigger on a model unexpectedly | Audit/pin |
+  | `task.agentCompactionThresholdOverrides` | {} | {} | **No** for root factory turns (task/subagents only) | Ignore |
+  | `mnemopi.autoRecall` / `autoRetain` | true / true | true / true | **Yes** — first-turn effective system prompt changes; cross-session recall and cache loss | Pin `false` for deterministic factory agents (or opt in consciously with a recorded digest) |
+  | `memory.backend` | `mnemopi` | `mnemopi` | **Yes via autoRecall** | Keep but disable autoRecall/autoRetain, or choose `off` if no memory is wanted |
+
+  ## 7. Compaction vs fresh brief
+
+  ### 7.1 `-p` manual compaction is available (verified)
+
+  A one-shot print invocation accepted the slash command:
+
+  ```bash
+  omp --cwd <cwd> --mode json --model opencode-go/deepseek-v4.1-flash:max \
+    --session-dir <sd> --tools= --resume <session-id> -p "/compact"
+  ```
+
+  It emitted `manual_compaction_start` then `manual_compaction_end` with `result: { tokensBefore: 38053, tokensAfter: 6794, method: "soft", firstKeptEntryId: … }`, printed `Compaction complete. Tokens: 36413 -> 6768 (saved 29645)` to stderr, persisted a `compaction` entry in the session JSONL, and exited 0. There was **no `turn_end`, no usage, and no `model_usage` entry** for the summarization request in NDJSON/transcript — compaction cost must be estimated from `tokensBefore`/summary length (or measured via `omp stats`/an RPC wrapper) if spec 20's cost defaults are to include it.
+
+  RPC mode exposes a first-class `{ type: "compact", customInstructions? }` command and `manual_compaction_start/end` events (`docs/rpc.md:190-210`, `:970-987`); `{ type: "set_cache_warming", mode }` is also available there (`docs/rpc.md:197-210`).
+
+  ### 7.2 Cost analysis (architect on `anthropic/claude-opus-5-5`, catalog: input $4/M, cacheRead $0.20/M, cacheWrite $5/M)
+
+  For a 38k-token history (same order as the compaction probe):
+
+  | Strategy | What is paid | Approx cost |
+  |---|---|---|
+  | Direct cold resume | 38k × $4/M | **$0.152** |
+  | Compact **after** cache expiry, then resume | summarizer cold-reads 38k ($0.152) + summary output (~$0.01-0.02) + compacted prefix write 6.8k × $5/M ($0.034) + resumed turn | **≈$0.20-0.24** (worse than direct for one turn) |
+  | Compact **while warm** (at wave end, within TTL), then resume | summarizer cache-reads 38k × $0.20/M ($0.0076) + output (~$0.01-0.02) + compacted write $0.034 + resumed turn | **≈$0.06-0.09** (better) |
+  | Fresh architect brief | build B-token brief from records (e.g. B≈5k: $0.02 input / $0.025 write) + system-prompt prefix cacheRead (~$0.001) | **≈$0.02-0.03** at B=5k; still cheaper at B=20k (~$0.08-0.10) |
+
+  Key correction to spec item 20(a): **compaction after the cache has already expired does not avoid re-paying the full history; the summarizer pays it once, then the resumed turn pays the compacted prefix again.** Compaction only pays if it runs while the prefix is still warm, or if the architect will have several future turns on the compacted history, or if the full history would overflow the window. For an already-cold resume, a deterministic fresh brief is the cheaper mechanism.
+
+  ### 7.3 Recommended mechanism
+
+  1. **Warm** (no trigger): resume additively; do nothing.
+  2. **Cold + short history / one-shot consult**: resume uncached; optionally pass a per-turn overlay with `providers.cacheRetention: none` if the turn is known to make a single model request (multi-request tool loops still benefit from caching).
+  3. **Cold + long history + more turns expected**: start a **fresh architect session hydrated from records** (existing `hydrationContext`/`contextPack`/`waveReport` machinery in `step-runner.ts` and `steps/architect-resume`). This is bounded, deterministic, and still reuses the system-prompt prefix (4,224-token cross-session hit measured).
+  4. **Compact only while warm**, at a natural wave boundary, before the TTL expires: `omp -p --resume <id> "/compact"` (verified) or RPC `compact`. Use `handoff`/`soft`, not `snapcompact` for the architect. Record `tokensBefore/tokensAfter`; estimate cost.
+  5. **If already cold and continuity is mandatory** (the brief would lose critical conversational state): resume uncached and accept the full read; do not compact as well.
+
+  ## 8. Standby-warming viability
+
+  - `providers.cacheWarming` values: `off`, `streaming`, `idle` (verified by invalid-value error; docs `docs/settings.md:1026`). Warming replays the last request with a one-token output budget shortly before expiry, only when the expected avoided-miss cost exceeds the refresh cost by at least **$0.05**. For Opus (input $4/M vs cacheRead $0.20/M, delta $3.8/M), the threshold is ≈**13.2k tokens** of prefix; an architect session above that qualifies economically.
+  - **`idle` warming cannot cover factory standby.** The interactive TUI owns idle work; “SDK, RPC and print sessions do not” enable idle maintenance (`docs/sdk.md:278`). `-p` exits at the end of the turn, so there is no process alive to replay the request between turns. `streaming` warming can still protect a long tool execution **inside** a turn — pin it.
+  - **The practical standby mechanism is `providers.cacheRetention: long`** (1h where supported). Verified `cttl: {ephemeral1h: N}`. It needs no live process. The cost is the cache write: catalog `cacheWrite` for Opus is $5/M (1.25× input); Anthropic bills 1h writes at a higher rate than 5m in the real API, and omp's single catalog `cacheWrite` value may under-estimate 1h writes — verify against provider billing before making it the default. A 1h tier pays if the architect's next turn lands >5m and <1h later; it does not cover >1h gaps.
+  - **Pre-warming immediately before a resume is never cheaper:** if the entry already expired, the warm request pays full input + cache write, then the resumed turn pays cache read; that is strictly more than the direct cold resume. Warm must happen *before* expiry to pay off.
+  - **Persistent RPC holder** (`omp --mode rpc`, `set_cache_warming idle`, `compact`) is the only true standby warming, but it reintroduces a long-lived process and session ownership across wave gaps. Defer as an optional M7 experiment; measure against long retention first.
+
+  ## 9. Recommendations for M7
+
+  1. **Extend usage accounting** (`src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549`, `src/harness/omp/ndjson.ts:86-99`): add `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, `cacheTtl: {tier, tokens}`, `provider`, `api`, `model`, `reasoningTokens`; keep per-request rows (a turn can emit multiple `turn_end` usages) and aggregate. Include side-request `model_usage`/compaction cost where available.
+  2. **Add a per-session cache-state record** (meta or a sibling `session-cache.yaml`): resolved model (`provider/model` from `turn_end.message`), thinking suffix, ordered tools hash, system-prompt hash, cache retention, last request timestamp, last `cttl`, last `compaction` marker. Compare it on every resume.
+  3. **Stop silently switching models on resume:** record the resolved model used by the successful turn and pass that literal model on resume (or detect the mismatch and treat it as cold). Current resume unconditionally passes `@role` (`harness.ts:318-326`), so a role-map change or fallback recovery silently switches models and pays a full cold read.
+  4. **Pin effective omp settings in the generated overlay** (`overlay.ts:51-85`): `providers.cacheRetention` (per role/flow), `providers.cacheWarming: streaming`, `provider.appendOnlyContext: auto`, `includeModelInPrompt: false`, `snapcompact.systemPrompt: none`, `snapcompact.toolResults: false`, `compaction.experimentalContextManagement: false`, explicit `compaction.enabled/thresholdTokens/methodOrder/autoContinue`, and `mnemopi.autoRecall/autoRetain: false`. Overlay precedence beats host global/project config (`docs/settings.md:113-123`), but only if the keys are actually present.
+  5. **Validate effectively, not syntactically:** `omp --config <overlay> --version` exits 0 even for invalid YAML or an invalid `providers.cacheRetention` value (confirmed). Preflight’s current overlay check (`src/cli/preflight.ts:364-393`) is therefore a no-op. Read back effective values (`omp config get`, or a no-model probe) and/or perform a real throwaway turn before declaring config compatible. This confirms open concern `c-477404c672` and adds cache/compaction keys to its scope.
+  6. **Cold policy:** warm → resume; cold single-turn → resume (optionally `retention: none`); cold long-history → fresh brief; compact only while warm. Do not compact after expiry for a single resume.
+  7. **Byte stability:** keep system-prompt content byte-stable; make prompt filenames content-addressed (`prompt-<sha256>.txt`) so identical logical prompts produce identical `@file` wrappers/transcripts. The current timestamp+random path is cache-safe but not byte-reproducible.
+  8. **Disable ambient memory for deterministic agents** or explicitly include its digest: `mnemopi.autoRecall/autoRetain: false`; otherwise fresh sessions in a reused cwd inject prior task text into the system prompt (digest changes observed).
+  9. **Measure before defaults:** use `long` retention for architect standby gaps <1h, `short` for multi-request tool-loop agents, `none` only for single-request turns; keep the choice per role/flow and record the cost delta.
+  10. **Tests:** the scripted mock provider for item 19.8 should emit realistic `usage` rows with `cacheRead`, `cacheWrite`, `totalTokens`, `cttl`, and multiple `turn_end`s per turn, plus a synthetic session JSONL with `system-prompt-digest`, `model_change`, `thinking_level_change`, `compaction`, and `cttl` so cold detection is testable without paid models.
+
+  ## 10. Draft decision YAML
+
+  ```yaml
+  status: proposed
+  decision: |
+    OMP prompt caching is content-keyed, not path-keyed. The cached prefix is composed of the
+    system-prompt bytes, ordered tool specs, model/thinking identity, cache-retention tier, and
+    conversation history; file paths and session ids are not hard key components. The factory's
+    deterministic system-prompt path and unique per-turn prompt path are cache-safe; a changed
+    system-prompt path with identical bytes still fully hits. Cold resume must be detected from
+    content/config changes (system-prompt bytes, ordered tools, model, thinking level, cache
+    retention) plus TTL expiry (usage.cttl + timestamp) and compaction markers, not from paths.
+    For one-process-per-turn `-p` sessions, idle cache warming and idle compaction are unavailable;
+    use `providers.cacheRetention: long` for architect standby gaps under 1h, pin streaming warming
+    for intra-turn tool executions, and do not rely on omp's default host config (this host sets
+    short/streaming/experimental values). For an already-cold architect resume, prefer a fresh
+    brief hydrated from records over compaction; compaction only pays when performed while the
+    cache is warm (at a wave boundary) or amortized over several future turns. Pin all relevant
+    omp cache/compaction/memory keys in the generated overlay and record cacheRead/cacheWrite/
+    totalTokens/cttl in step records so defaults can be measured.
+  evidence:
+    - "Transport audit: harness.ts:286-350 writes a deterministic per-agent+session system prompt and a unique timestamp+random prompt file; argv differs only in -p @path; overlay bytes identical (sha256 6ebf5894...); system-prompt/prompt content identical across renders."
+    - "Path invariance: DeepSeek resume with changed system-prompt path and identical bytes cacheRead=11,392 (input 86); Anthropic resume with changed path cacheRead=6,703 (input 4). New prompt path per turn cacheRead=10,752 (DeepSeek) and 29,363 (Anthropic)."
+    - "Content invalidation: system prompt + newline cacheRead=0 (input 13,266); tools change cacheRead=2,432 of 4,480; thinking change cacheRead=0; model switch cacheRead=0 (cost 8.9x warm)."
+    - "TTL: Anthropic short (5m) warm resume cacheRead=29,363, cost $0.001454; after 330s cacheRead=0, cacheWrite=38,022, cost $0.004767. Long retention emits cttl ephemeral1h; providers.cacheRetention enum is auto|short|long|none."
+    - "Cross-session: new session, same system prompt/tools, cacheRead=4,224; session id is not a hard key."
+    - "Compaction: `omp -p --resume <id> \"/compact\"` compacted 38,053 -> 6,794 tokens (method soft) with manual_compaction_start/end; no usage/cost in NDJSON or transcript. Docs: idle maintenance is TUI-only (docs/sdk.md:278); cacheWarming values off|streaming|idle, $0.05 avoided-miss gate (docs/settings.md:1026); idle compaction trade-off (docs/compaction.md:155-158)."
+    - "Factory records: ndjson.ts:86-99 and 173-177 drop cacheRead/cacheWrite/totalTokens/cttl; Usage and StepUsage lack fields (types.ts:7-11, artifacts.ts:545-549)."
+    - "Factory overlay: overlay.ts:51-85 pins no providers.cache*, compaction.*, snapcompact.*, mnemopi.autoRecall/autoRetain; host global config sets providers.cacheRetention=short, cacheWarming=streaming, compaction.experimentalContextManagement=true. `omp --config <invalid> --version` exits 0, so preflight.ts:364-393 does not validate the overlay."
+  followUps:
+    - "M7: extend Usage/StepUsage and OmpNdjsonParser with cacheRead/cacheWrite/totalTokens/cttl/provider/model/reasoningTokens and per-request rows."
+    - "M7: add a session cache-state record and pre-launch cold detector (system-prompt hash, ordered tools hash, resolved model, thinking, retention, cttl+timestamp, compaction marker)."
+    - "M7: pass the recorded resolved model on resume instead of unconditionally @role; treat role-map changes as cold."
+    - "M7: pin cache/compaction/mnemopi settings in the generated overlay; validate effective values in preflight with a real check, not `--version`."
+    - "M7: measure long-vs-short retention and fresh-brief-vs-warm-compaction per role/flow on the self-host fire test; confirm Anthropic 1h write pricing against provider billing."
+    - "M7: optional RPC holder experiment (set_cache_warming idle + compact) only if long retention does not cover the observed wave gaps."
+    - "Add a mock-provider fixture with cache usage/cttl/session entries so cold-detection and cost defaults are testable without paid models."
+  ```
+
+  ## 11. Open questions / follow-ups
+
+  - Anthropic's real 1h cache-write price is higher than the 5m write price; omp's catalog exposes one `cacheWrite` value per model. The cost estimates in §7.2/§8 for `long` may be optimistic. Confirm on the provider bill before making `long` the default.
+  - DeepSeek reports no `cttl`/`cacheWrite`; its implicit cache has no observable TTL. Do not attempt TTL-based cold detection for such providers; use content/config fingerprints only.
+  - The `-p "/compact"` summarization cost is not in NDJSON or the transcript. If spec 20 requires measured compaction cost, add an RPC wrapper that captures the compaction response/usage, or estimate from `tokensBefore` and summary length.
+  - `mnemopi.autoRetain` can write completed factory turns into a per-cwd memory bank and affect later fresh sessions in the same worktree. Decide whether that is a feature (cross-run context) or a leak (task isolation); the factory's current overlay only disables the linking flags.
+  - `checkpoint.enabled: true` in the overlay mounts checkpoint tools; agents opt in via their tool lists. Not a cache issue, but part of the effective harness surface to audit.
+
+  ## Sources
+
+  Repo (read-only audit):
+  - `plugins/software-factory/src/harness/omp/harness.ts:286-350` — system-prompt/prompt materialization, model candidates.
+  - `plugins/software-factory/src/harness/omp/harness.ts:368-389` — argv construction (`--system-prompt`, `-p @file`, `--resume`, tools).
+  - `plugins/software-factory/src/harness/omp/harness.ts:225-240` — overlay regeneration.
+  - `plugins/software-factory/src/harness/omp/overlay.ts:26-100` — overlay keys; no cache/compaction/memory-autoRecall pins.
+  - `plugins/software-factory/src/harness/omp/ndjson.ts:86-99,173-177` — usage fields dropped.
+  - `plugins/software-factory/src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549` — `Usage`/`StepUsage` lack cache fields.
+  - `plugins/software-factory/src/core/flows/step-runner.ts:534-547,620,817` — prompt rendering and `AgentRun` prompt.
+  - `plugins/software-factory/src/core/records/step-record.ts:96`; `src/harness/omp/harness.ts:521-522` — `traceRef` to session JSONL.
+  - `plugins/software-factory/src/cli/preflight.ts:364-393` — overlay validation via `omp --config … --version`.
+  - `plugins/software-factory/docs/OMP_ADAPTER.md:164-172` — prior cache-safety claims; line 168 previously marked path-vs-content keying unknown.
+  - `plugins/software-factory/docs/ARCHITECTURE.md:38` — one process per agent turn; `:40` — cache/compaction not built.
+  - `plugins/software-factory/docs/factory.v2.md:114-120` — spec items 20(a)-(d).
+
+  OMP docs (official):
+  - `https://omp.sh/docs/compaction` — compaction settings reference.
+  - `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/settings.md:113-123` — precedence (overlay beats project/global); `:926` — cache-segment invalidation signals; `:1025-1027` — cacheRetention/cacheWarming; `:468` — includeModelInPrompt.
+  - `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/models.md:465-504` — prompt-cache lifetimes (Anthropic 5m/1h; OAuth vs API key defaults).
+  - `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/sdk.md:278` — idle maintenance is TUI-only; SDK/RPC/print sessions do not enable it.
+  - `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/compaction.md:155-158` — idle-compaction/cache TTL trade-off; `:530` — experimental context management default false.
+  - `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/rpc.md:190-210,970-1037` — `compact`, `set_cache_warming`, `cache_warming_start/end`/`warmingStopReason`.
+
+  ## Appendix A: Probe log (commands and raw result locations)
+
+  All live probes were run as `omp -p --mode json --max-cost 0.10` from throwaway dirs; per-turn NDJSON and stderr were captured under `/tmp/spike-cache-key-{live,ttl,invalidation,tools-thinking,digest,cross-session,anth-path,retention,preflight}`. The transport shim captured argv/system-prompt/prompt under `/tmp/spike-cache-key-0c1ojol5/capture/{fresh-1,fresh-2,resume-1,resume-2}`. The numbers in §3 are extracted from the `turn_end`/`message` usage rows in those files. Aggregate spend ≈ $0.05.
+contextPack: "M7 implementation handoff: (1) OMP cache identity is content-based
+  — system-prompt bytes + ordered tools + model/thinking + retention +
+  conversation; paths and session ids do not matter. (2) The factory transport
+  is cache-safe for resumed prefixes; the unique prompt path only appears in the
+  new user message via omp's `<file name=...>` wrapper. (3) Add
+  cacheRead/cacheWrite/totalTokens/cttl/provider/model to Usage/StepUsage +
+  OmpNdjsonParser; currently ndjson.ts:86-99 drops them. (4) Build a per-session
+  cache-state record and compare on resume: system-prompt hash (omp
+  `custom/system-prompt-digest`), resolved model from turn_end.message, thinking
+  suffix, ordered tools hash, retention, last cttl+timestamp, compaction entry.
+  Pass the recorded model literal on resume instead of @role. (5) Pin in the
+  generated overlay: providers.cacheRetention (long architect/short
+  tool-loop/none single-request), cacheWarming=streaming,
+  appendOnlyContext=auto, includeModelInPrompt=false,
+  snapcompact.systemPrompt=none, compaction.experimentalContextManagement=false,
+  explicit compaction thresholds/methodOrder,
+  mnemopi.autoRecall/autoRetain=false. (6) Print-mode sessions cannot use idle
+  warming or idle compaction; use long retention for <1h standby. (7) `omp -p
+  --resume <id> \"/compact\"` works (38,053→6,794 tokens) but does not expose
+  cost; prefer fresh brief when already cold and compact while warm at wave
+  end."
+sources:
+  - plugins/software-factory/src/harness/omp/harness.ts:286-350
+  - plugins/software-factory/src/harness/omp/harness.ts:368-389
+  - plugins/software-factory/src/harness/omp/overlay.ts:26-100
+  - plugins/software-factory/src/harness/omp/ndjson.ts:86-99
+  - plugins/software-factory/src/harness/types.ts:7-11
+  - plugins/software-factory/src/core/artifacts.ts:545-549
+  - plugins/software-factory/src/cli/preflight.ts:364-393
+  - plugins/software-factory/docs/OMP_ADAPTER.md:164-172
+  - plugins/software-factory/docs/ARCHITECTURE.md:38
+  - plugins/software-factory/docs/factory.v2.md:114-120
+  - https://omp.sh/docs/compaction
+  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/settings.md
+  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/models.md
+  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/sdk.md
+  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/compaction.md
+  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/rpc.md
+recommendations:
+  - Extend Usage/StepUsage and OmpNdjsonParser with cacheReadTokens,
+    cacheWriteTokens, totalTokens, cacheTtl {tier,tokens}, provider, api, model,
+    reasoningTokens; keep per-request rows.
+  - Add a per-session cache-state record (resolved model, thinking, ordered
+    tools hash, system-prompt hash, retention, last cttl+timestamp, compaction
+    marker) and compare it on every resume.
+  - Pass the recorded resolved model literal on resume instead of
+    unconditionally @role; a role-map change or fallback recovery currently
+    switches models and silently pays a full cold read.
+  - Pin providers.cacheRetention/cacheWarming, provider.appendOnlyContext,
+    includeModelInPrompt, snapcompact.*, compaction.*, and
+    mnemopi.autoRecall/autoRetain in the generated overlay; do not inherit host
+    global config.
+  - Replace the preflight overlay check (`omp --config … --version`) with
+    effective-value validation or a real throwaway turn; the current check exits
+    0 for invalid YAML and invalid enum values.
+  - "Cold policy: warm resume; cold one-shot resume with retention none only for
+    single-request turns; cold long-history fresh brief; compact only while warm
+    at a wave boundary."
+  - Disable mnemopi autoRecall/autoRetain for deterministic factory agents, or
+    record the memory digest explicitly; otherwise fresh sessions in a reused
+    cwd inject prior task text into the system prompt.
+  - Use long retention for architect standby gaps under 1h; keep short for
+    multi-request tool-loop agents; measure long-vs-short and
+    fresh-brief-vs-warm-compaction per role/flow.
+  - Make prompt filenames content-addressed (prompt-<sha256>.txt) if
+    byte-reproducible retries are needed; current timestamp+random paths are
+    cache-safe but not byte-identical.
+  - Add mock-provider fixtures that emit cacheRead/cacheWrite/totalTokens/cttl
+    and synthetic session entries (system-prompt-digest, model_change,
+    thinking_level_change, compaction) so cold detection is testable without
+    paid models.
+concerns:
+  - kind: risk
+    summary: Factory overlay pins no cache/compaction/memory knobs; effective
+      behavior is inherited from host global/project config
+    detail: overlay.ts:51-85 generates only
+      modelRoles/retry/eval/title/checkpoint/advisor/bash/mnemopi-linking/update.
+      On this host `omp config list --scope global` sets
+      providers.cacheRetention=short, providers.cacheWarming=streaming,
+      compaction.experimentalContextManagement=true,
+      compaction.handoffSaveToDisk=true and modelThresholds overrides —
+      differing from omp docs defaults. A factory run on another host inherits
+      different cache TTL/warming/compaction behavior with no record. Overlay
+      precedence would fix it (docs/settings.md:113-123), but the keys are
+      absent.
+    severity: high
+    location:
+      file: plugins/software-factory/src/harness/omp/overlay.ts
+      line: 51
+    affects:
+      - 20a
+      - 20b
+      - 20c
+      - 20d
+      - "19.2"
+  - kind: risk
+    summary: mnemopi.autoRecall injects prior-session text into the first turn,
+      changing the effective system prompt and defeating fresh-session cache
+      reuse
+    detail: The overlay disables polyphonicRecall/enhancedRecall/proactiveLinking
+      but leaves mnemopi.autoRecall and autoRetain at true. Probes show
+      custom/system-prompt-digest changes when memory recall text is injected
+      (a94d3680ec1c75cf with no memories vs a89aabcb237da3c7/634c40b6e2f931de
+      with recalled content), even though the agent body is unchanged. Recalled
+      memories are first-turn-only, so resumed turns are safe, but fresh
+      sessions in a reused worktree are non-deterministic and can leak prior
+      task prompts across tasks sharing a cwd.
+    severity: high
+    location:
+      file: plugins/software-factory/src/harness/omp/overlay.ts
+      line: 77
+    affects:
+      - 20b
+      - 20c
+      - "19.7"
+  - kind: risk
+    summary: Factory records drop cacheRead/cacheWrite/totalTokens/cttl, so spec
+      20's cost-measured defaults cannot be computed from records
+    detail: OmpNdjsonParser sums only u.input/u.output/u.cost.total
+      (ndjson.ts:86-99; result at 173-177); Usage (types.ts:7-11) and StepUsage
+      (artifacts.ts:545-549) have no cache fields. A turn's multiple requests
+      are aggregated into one input/output/cost total; the architect's
+      cache-read tokens and cold-resume cost are not attributable. The `-p
+      "/compact"` probe also produced no usage record.
+    severity: high
+    location:
+      file: plugins/software-factory/src/harness/omp/ndjson.ts
+      line: 86
+    affects:
+      - 20a
+      - 20b
+      - 20c
+      - 20d
+  - kind: risk
+    summary: Resume passes @role without verifying the recorded
+      model/thinking/tools/system prompt, so config/fallback changes silently
+      cause cold resumes
+    detail: harness.ts:318-326 forces a single `@role` candidate on resume. The role
+      is re-resolved against the current overlay each turn; a pipeline role-map
+      change, or a fallback model used on a fresh turn, switches the model on
+      resume and pays a full cold read (measured cacheRead=0, cost 8.9x warm).
+      Tools/system-prompt/thinking changes similarly invalidate but are not
+      recorded in step meta.
+    severity: medium
+    location:
+      file: plugins/software-factory/src/harness/omp/harness.ts
+      line: 318
+    affects:
+      - 20a
+  - kind: assumption
+    summary: Spec 20(a)'s 'compact before an uncached resume' is a net loss for a
+      single resume because the summarizer itself pays the full history
+    detail: Compaction 38,053→6,794 tokens was verified, but the summarization
+      request reads the full history; if the cache is already expired, cost ≈
+      cold history + summary output + compacted-prefix write + resumed turn,
+      which is more than a direct cold resume. Compaction only pays while the
+      cache is still warm (at a wave boundary) or when amortized over several
+      future turns. Recommend fresh brief for already-cold long-history resumes.
+    severity: medium
+    location:
+      file: docs/factory.v2.md
+      line: 115
+    affects:
+      - 20a
+      - 20b
+  - kind: risk
+    summary: Native standby warming and idle compaction are unavailable in
+      one-process-per-turn -p sessions
+    detail: OMP's idle maintenance is enabled only by the interactive TUI; SDK, RPC
+      and print sessions do not enable it (docs/sdk.md:278). A `-p` process
+      exits after the turn, so providers.cacheWarming=idle cannot replay a
+      request during factory standby and compaction.idle* never fires.
+      `streaming` warming still applies during long tool executions inside a
+      turn. The practical standby mechanism is providers.cacheRetention=long
+      (1h), not native idle warming.
+    severity: medium
+    location:
+      file: plugins/software-factory/docs/ARCHITECTURE.md
+      line: 38
+    affects:
+      - 20b
+      - 20d
+remarkable:
+  - chosen: "Content fingerprints for cold-resume detection: system-prompt bytes,
+      ordered tools, resolved model, thinking level, retention, TTL and
+      compaction marker"
+    why: The probes show path changes with identical bytes are full hits, while
+      one-byte content changes, tools changes, thinking changes, model switches,
+      TTL expiry and compaction are misses. Path-based invalidation would
+      false-positive on every turn because the factory creates a new prompt file
+      path per turn.
+    alternatives:
+      - Hash the system-prompt path and prompt path
+      - Invalidate on every new prompt filename
+      - Rely on omp's UI cache marker / cacheRead alone
+  - chosen: Fresh brief for an already-cold long-history architect resume; compact
+      only while warm
+    why: Compaction after expiry re-reads the full history in the summarizer and
+      then writes the compacted prefix, costing more than a direct cold resume
+      for a single turn. A fresh session hydrated from records is bounded,
+      deterministic, and still reuses the system-prompt prefix (measured 4,224
+      cached tokens across sessions). Warm compaction at a wave boundary avoids
+      the double full-history payment.
+    alternatives:
+      - Compact immediately before every cold resume
+      - Always resume uncached and never compact
+      - Persistent RPC holder that compacts in place
+  - chosen: providers.cacheRetention=long for architect standby gaps under 1h
+      instead of omp idle cache warming
+    why: Print-mode sessions have no idle scheduler and exit after each turn, so
+      cacheWarming=idle cannot cover factory standby. Long retention needs no
+      live process and emits cttl ephemeral1h; it is the only zero-process
+      warming mechanism. The 1h write premium must be verified against provider
+      billing.
+    alternatives:
+      - Run a persistent RPC session with set_cache_warming idle
+      - Pre-warm immediately before resume
+      - Accept 5m short TTL and pay cold resumes
+  - chosen: Pin all cache/compaction/memory keys in the generated omp overlay rather
+      than relying on omp defaults or host config
+    why: The factory overlay currently pins none of them, and this host's global
+      config overrides omp defaults (short vs auto, streaming vs idle,
+      experimentalContextManagement true vs false). Overlay precedence beats
+      project/global, so explicit keys make cache behavior reproducible and
+      auditable.
+    alternatives:
+      - Read host config and adapt at runtime
+      - Use PI_CACHE_RETENTION env overrides
+      - Document host settings as an installation prerequisite
diff --git a/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/002-review-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/002-review-r1-a1/input.md
new file mode 100644
index 0000000..2f9d858
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/002-review-r1-a1/input.md
@@ -0,0 +1,1664 @@
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
+  "slug": "spike-cache-key",
+  "kind": "fact-finder",
+  "title": "Spike: prompt-cache keying + compaction/warming audit",
+  "assignment": "Fact-finder spike, no prod code. 1) Render the same agent prompt twice via current transport and diff bytes/argv (system-prompt content, overlay bytes, prompt path/argv). 2) Run bounded live resume probes with cache-miss markers: same vs changed prompt path, model switch, TTL expiry; record cacheRead/cacheWrite/totalTokens and cost deltas. 3) Audit which compaction.* and providers.cache* knobs affect one-process-per-turn factory sessions and what cold-resume detection signals exist. 4) Recommend cold-resume detection plus compaction-vs-fresh-brief mechanism and standby-warming viability for M7. Outputs: items/{item}/findings.md with byte-diff tables and probe log, full draft for plugins/software-factory/docs/spikes/omp-5-cache-keys.md, draft decision YAML {status, decision, evidence, followUps} stating content-vs-path keying and applicable knobs. Constraints: read-only on repo prod paths; cwd=plugins/software-factory; throwaway profile/repos, unique temp dirs; no transport stabilization (M2 characterizes, M7 implements). Acceptance: answers M1 cache-key scenario.",
+  "outlineRef": "spike-cache-key",
+  "milestone": "m1-omp-de-risk",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-omp-de-risk:scenario-3"
+  ],
+  "citations": [
+    "docs/factory.v2.md:114-120",
+    "plugins/software-factory/docs/OMP_ADAPTER.md:163-168",
+    "plugins/software-factory/docs/ARCHITECTURE.md:40"
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
+diff --git a/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/input.md
+new file mode 100644
+index 0000000..bb1abec
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/input.md
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
++  "slug": "spike-cache-key",
++  "kind": "fact-finder",
++  "title": "Spike: prompt-cache keying + compaction/warming audit",
++  "assignment": "Fact-finder spike, no prod code. 1) Render the same agent prompt twice via current transport and diff bytes/argv (system-prompt content, overlay bytes, prompt path/argv). 2) Run bounded live resume probes with cache-miss markers: same vs changed prompt path, model switch, TTL expiry; record cacheRead/cacheWrite/totalTokens and cost deltas. 3) Audit which compaction.* and providers.cache* knobs affect one-process-per-turn factory sessions and what cold-resume detection signals exist. 4) Recommend cold-resume detection plus compaction-vs-fresh-brief mechanism and standby-warming viability for M7. Outputs: items/{item}/findings.md with byte-diff tables and probe log, full draft for plugins/software-factory/docs/spikes/omp-5-cache-keys.md, draft decision YAML {status, decision, evidence, followUps} stating content-vs-path keying and applicable knobs. Constraints: read-only on repo prod paths; cwd=plugins/software-factory; throwaway profile/repos, unique temp dirs; no transport stabilization (M2 characterizes, M7 implements). Acceptance: answers M1 cache-key scenario.",
++  "outlineRef": "spike-cache-key",
++  "milestone": "m1-omp-de-risk",
++  "wave": 1,
++  "scenarioRefs": [
++    "m1-omp-de-risk:scenario-3"
++  ],
++  "citations": [
++    "docs/factory.v2.md:114-120",
++    "plugins/software-factory/docs/OMP_ADAPTER.md:163-168",
++    "plugins/software-factory/docs/ARCHITECTURE.md:40"
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
++  "docs/factory.v2.md:114-120",
++  "plugins/software-factory/docs/OMP_ADAPTER.md:163-168",
++  "plugins/software-factory/docs/ARCHITECTURE.md:40"
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
+diff --git a/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..6fccfad
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
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
++startedAt: 2026-11-09T23:41:25.227Z
++session: 01a1c2b0-24aa-72df-8f7d-5ddbac0d4498
++endedAt: 2026-11-10T00:16:24.085Z
++usage:
++  inputTokens: 233491
++  outputTokens: 109631
++  costUsd: 0.130651
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-41-26-058Z_01a1c2b0-24aa-72df-8f7d-5ddbac0d4498
+diff --git a/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/output.yaml
+new file mode 100644
+index 0000000..9a42ed5
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/output.yaml
+@@ -0,0 +1,554 @@
++status: ok
++summary: "OMP 18.18.5 keys the prompt cache by request-prefix content, not by
++  file path. The factory's unique per-turn prompt path is harmless; identical
++  system-prompt bytes at a changed path still fully hit cache, while a one-byte
++  system-prompt change, a tools or thinking-level change, a model switch, 5m TTL
++  expiry, or compaction all go cold. The audit also found that the factory
++  currently records no cacheRead/cacheWrite/cttl data, inherits host
++  cache/compaction/mnemopi settings because the generated overlay pins none of
++  them, and cannot use omp's idle warming or idle compaction in
++  one-process-per-turn (-p) sessions. Recommended M7 policy: content
++  fingerprints for cold detection, fresh brief over compaction for an
++  already-cold resume, compact only while warm at a wave boundary (verified `omp
++  -p --resume <id> \"/compact\"` works), and long retention for the architect on
++  standby rather than native warming."
++findings: |
++  # Draft for `plugins/software-factory/docs/spikes/omp-5-cache-keys.md`
++
++  # Spike: prompt-cache keying + compaction/warming audit
++
++  Status: complete (M1 / `spike-cache-key`)
++  Harness: `omp/18.18.5` on Linux x86_64 WSL2; factory checkout `plugins/software-factory`; live probes used throwaway `/tmp` dirs and throwaway session dirs (no production paths edited).
++
++  ## 0. Verdict (answers the M1 cache-key scenario)
++
++  **OMP prompt caching is content-keyed, not path-keyed.**
++
++  - A changed system-prompt *path* with byte-identical content still produced a full cache hit: DeepSeek `cacheRead=11,392` (T3 below); Anthropic `cacheRead=6,703` (A-T2 below).
++  - A new prompt-file *path* on every turn did not break resumed-turn caching: Anthropic `cacheRead=29,363` on a resume whose prompt file path differed from the previous turn.
++  - A one-byte system-prompt content change (appended newline) produced `cacheRead=0` (DeepSeek T3, `input=13,266`).
++  - Tools change produced a partial miss (`cacheRead=2,432` of a prior `4,480`); thinking-level change and model switch produced full misses (`cacheRead=0`).
++  - A 330-second gap on Anthropic `short` retention produced `cacheRead=0`, `cacheWrite=38,022` (cold).
++  - A brand-new session with the same system prompt/tools reused the system-prompt prefix from the provider cache (`cacheRead=4,224`), so a fresh session is not inherently a full cold read.
++
++  **Consequence for the factory:** the transport's random prompt filename is safe; the cached prefix is the system-prompt bytes + tool specs + model/thinking identity + conversation history. The real cold-resume triggers are: system-prompt content change, tools change, model/thinking change, cache-retention/TTL change/expiry, and compaction. The current factory does not detect any of these (see §5) and does not pin the knobs (see §6).
++
++  ## 1. Method
++
++  - Transport audit (no model calls): ran `OmpHarness.run()` four times (fresh ×2, resume ×2) with `OMP_PATH` pointed at a throwaway shim that logged argv and copied the `--system-prompt`/`-p @file` inputs. Same rendered `steps/architect-resume` prompt, same `PipelineConfig`, same runtime dir, same synthetic session id.
++  - Live probes: real `omp -p --mode json` turns against `opencode-go/deepseek-v4.1-flash:max`, `opencode-go/muse-spark-1.3-contributor:max`, and `anthropic/claude-haiku-5-5:max`, using the factory's generated overlay plus the actual architect system prompt (`agents/architect.md` body). Unique `--session-dir`/`--cwd` per probe family under `/tmp`; `--max-cost 0.10` per turn. Aggregate live spend ≈ **$0.05**.
++  - All probe dirs are throwaway (`/tmp/spike-cache-key-*`); no repo file was written.
++
++  ## 2. Transport render audit (byte/argv diff)
++
++  Source under audit: `src/harness/omp/harness.ts:286-350` (prompt materialization), `src/harness/omp/harness.ts:368-389` (argv), `src/harness/omp/overlay.ts:26-100` (overlay).
++
++  | Run pair | System-prompt bytes | System-prompt path | Prompt bytes | Prompt path | Argv |
++  |---|---|---|---|---|---|
++  | fresh-1 vs fresh-2 | identical, sha256 `cb92bbcaafd7bfa7b52413cc9a75cd58985c4e22b21b9984a60733a9f177c93a` | identical `.../system-prompts/architect-fresh.md` | identical, sha256 `4a9d87d474be6638f4c5b1bc4655622baa7566e9e91935bc12aa136c6cec6d88` | **different** `prompt-1794267999675-k2y1.txt` vs `prompt-1794267999746-1jly.txt` | identical except `-p @<path>` |
++  | resume-1 vs resume-2 | identical | identical `.../system-prompts/architect-spike-session-fixed.md` | identical | **different** | identical except `-p @<path>` |
++  | fresh vs resume | identical | **different** (`fresh` vs sanitized session id) | identical | different | resume adds `--resume spike-session-fixed` |
++  | overlay generated twice | — | — | — | — | identical YAML, 1,472 bytes, sha256 `6ebf5894b6aaa2123b1cc3030555c3f5e61562751a2e332ef4b5d5b96e739f53` |
++
++  Exact fresh argv (captured; resume adds `--resume spike-session-fixed` after `--session-dir`):
++
++  ```text
++  --cwd /tmp/spike-cache-key-0c1ojol5/cwd
++  --config /tmp/spike-cache-key-0c1ojol5/runtime/omp-overlay.yaml
++  --mode json
++  --model @architect
++  --session-dir /tmp/spike-cache-key-0c1ojol5/runtime/sessions
++  --tools=read,grep,glob
++  --system-prompt /tmp/spike-cache-key-0c1ojol5/runtime/system-prompts/architect-fresh.md
++  -p @/tmp/spike-cache-key-0c1ojol5/runtime/prompts/prompt-1794267999675-k2y1.txt
++  ```
++
++  Findings:
++
++  - System prompt is `extractAgentBody(run.definition)` written to `${agent}-${sessionKey}.md`; `sessionKey` is `fresh` or the sanitized resume id (`harness.ts:293-300`). Content is byte-stable per agent definition and path is deterministic per agent+session. The fresh→resume transition changes the path but not the bytes.
++  - Prompt is written to `prompt-${Date.now()}-${random4}.txt` (`harness.ts:311-316`), so the path is unique every turn and the argv differs only there. Prompt **content** is byte-identical when the same fragment/vars are rendered.
++  - Overlay is regenerated from the effective pipeline every run (`harness.ts:225-240`) and is byte-stable for identical config; it contains only `modelRoles`, `retry`, `eval`, `title`, `checkpoint`, `advisor`, `bash`, `mnemopi` (three linking flags), and `update` (`overlay.ts:51-85`). It pins **none** of `providers.cache*`, `compaction.*`, `snapcompact.*`, or `mnemopi.autoRecall/autoRetain`.
++  - omp wraps the `@file` argument into the user message as `<file name="/abs/path">…</file>` (observed in `message_start`/`message_end` and the session JSONL). Therefore the *new* user message is not byte-identical when the same logical prompt is re-rendered to a different path. This does not break the prior cached prefix (the wrapper is appended at the end), but it means the transport is not byte-reproducible for retries. A content-addressed prompt filename (e.g. `prompt-<sha256>.txt`) would fix that; it is not required for cache hits.
++
++  ## 3. Live resume probe log
++
++  All rows are `turn_end.message.usage`; `totalTokens = input + output + cacheRead + cacheWrite` in every observed row. `input` is *uncached* input (Anthropic reports `input=4` while writing/reading tens of thousands of cached tokens).
++
++  ### 3.1 Path / model / content probes (opencode-go DeepSeek, 1M context, implicit cache)
++
++  | Probe | Input | cacheRead | cacheWrite | total | Cost USD | Interpretation |
++  |---|---:|---:|---:|---:|---:|---|
++  | D-T1 fresh (architect-resume prompt) | 9,060 + 478 + 1,515 | 0 + 8,960 + 9,344 | 0 | 9,318 / 9,717 / 11,390 | 0.001514 + 0.000266 + 0.000574 = **0.002354** | first request cold; intra-turn tool-loop requests cache |
++  | D-T2 resume, same system-prompt path, new prompt path | 677 | 10,752 | 0 | 11,439 | **0.000140** | new prompt path is harmless |
++  | D-T3 resume, **system-prompt path changed**, same bytes | 86 | 11,392 | 0 | 11,481 | **0.000049** | path is not in the key |
++  | D-T4 resume, prompt path reused, content changed | 130 | 11,392 | 0 | 11,586 | **0.000092** | path reuse gives no extra hit; prior prefix still hits |
++  | D-T5 resume, **model switched** to `opencode-go/muse-spark-1.3-contributor:max` | 11,082 | 0 | 0 | 11,775 | **0.001247** | model switch is a full cold read (≈8.9× D-T2) |
++
++  ### 3.2 Content / tools / thinking invalidations (clean 2-turn sessions, DeepSeek)
++
++  | Scenario | T1 input | T2 input | T2 cacheRead | Result |
++  |---|---:|---:|---:|---|
++  | Control (same system prompt, same tools, same thinking) | 4,505 | 90 | 4,480 | near-full warm hit |
++  | System prompt + one appended newline (same path) | 4,585 | 13,266 | 0 | full miss |
++  | Tools `read,grep,glob` → `read,grep,glob,bash` | 4,585 | 2,719 | 2,432 | partial miss (tools are in the prefix) |
++  | Thinking `:max` → `:high` (same model id) | 4,585 | 4,681 | 0 | full miss |
++
++  Anthropic confirms path invariance: A-T1 fresh `input=4`, `cacheWrite=6,703`; A-T2 resume with a **different system-prompt path and identical bytes**: `input=4`, `cacheRead=6,703`, `cacheWrite=342`, cost $0.000143 (vs $0.00098 fresh).
++
++  ### 3.3 TTL expiry (Anthropic short/5m)
++
++  | Turn | Input | cacheRead | cacheWrite | cttl | Cost USD |
++  |---|---:|---:|---:|---|---:|
++  | T1 fresh (2 requests) | 4 + 2 | 0 + 15,501 | 15,501 + 13,862 | `ephemeral5m` | 0.008491 + 0.006040 |
++  | T2 resume ~1 min after T1 | 4 | 29,363 | 8,359 | `ephemeral5m` | **0.001454** |
++  | T3 resume 330 s after T2 | 4 | **0** | **38,022** | `ephemeral5m` | **0.004767** |
++
++  330 s is past the 300 s short TTL; the cold resume cost 3.3× the warm resume. Long retention was verified separately: `providers.cacheRetention: long` produced `cttl: {ephemeral1h: 6,705}`.
++
++  `providers.cacheRetention: none` on a single fresh request produced `input=4,510`, `cacheRead=2,256`, `cacheWrite=24`, `cttl: {ephemeral5m: 24}` — i.e. omp stopped requesting explicit retention, but the provider still served an implicit cached prefix (the default base prompt) from an earlier identical request. `none` is therefore not a guarantee of zero cacheRead; it does reduce explicit write cost for single-request turns.
++
++  ### 3.4 Cross-session reuse
++
++  A brand-new session in a new cwd with the same architect system prompt/tools/prompt shape produced `input=207`, `cacheRead=4,224`, `cacheWrite=0` — the system-prompt prefix was reused across session ids. Content, not session id, is the key (omp may still use session ids for provider routing affinity, but it is not a hard cache-key component for this provider).
++
++  ### 3.5 Memory-recall caveat (important)
++
++  The session JSONL records `custom/system-prompt-digest` entries. With no recalled memories the digest of the same architect body was `a94d3680ec1c75cf` across different paths, cwds and session ids. With `mnemopi.autoRecall` returning a prior turn, the digest changed (`a89aabcb237da3c7`, `634c40b6e2f931de`) even though the agent body was unchanged; a one-newline body change produced `1a5712bb71b370ac`. Conclusion: the digest is a content hash of the **effective** system prompt including injected memory text (not path), and omp's ambient memory can change it. The factory overlay disables `polyphonicRecall`/`enhancedRecall`/`proactiveLinking` (`overlay.ts:77-81`) but leaves `mnemopi.autoRecall` and `mnemopi.autoRetain` at their default `true`. Recalled memories are injected only into the first turn of a session (observed once per session; docs: “Recall local memories into the first turn of each session”), so resumed turns are not re-polluted, but fresh sessions in a reused cwd are non-deterministic and can recall prior task text into the system prompt — losing the cross-session system-prompt cache hit and potentially leaking context between tasks that share a worktree.
++
++  ## 4. What the cache key covers
++
++  **Content key (confirmed):** system-prompt bytes + tool specs (ordered) + model identity + thinking level + conversation history + cache retention markers/TTL. **Not in the key (confirmed):** system-prompt file path, prompt-file path, session id (for content reuse), file mtimes.
++
++  Invalidation matrix:
++
++  | Change | Observed effect |
++  |---|---|
++  | system-prompt path changed, bytes identical | full hit (DeepSeek 11,392; Anthropic 6,703) |
++  | prompt path changed every turn | full hit on prior prefix (Anthropic 29,363) |
++  | prompt path reused, content changed | no extra hit; prior prefix still hits (11,392) |
++  | system-prompt +1 byte | full miss (0) |
++  | tools order/content changed | partial/full miss; measured 2,432 of 4,480 retained |
++  | thinking level changed | full miss (0) |
++  | model switched | full miss (0), ~8.9× cost |
++  | 5m TTL expired (330 s gap) | full miss (0), `cacheWrite` = 38,022 |
++  | new session, same system prompt/tools | system-prompt prefix hit (4,224) |
++  | compaction committed | prefix rewritten; next request cannot reuse the pre-compaction prefix |
++
++  ## 5. Cold-resume detection signals
++
++  ### 5.1 Pre-launch signals (engine can act before spending)
++
++  Read from the session JSONL (the engine already has its path as `meta.yaml` `traceRef`, `src/core/records/step-record.ts:96`, produced at `harness.ts:521-522`):
++
++  1. **`custom/system-prompt-digest`** — 16-hex digest of the effective system prompt. Compare the latest value to the engine's own hash of the current `agentBody`; content-only (path-independent), but includes omp-injected memory text (see §3.5).
++  2. **`model_change`** — resolved `model` recorded at session start. Compare to the model the current `@role` resolves to. `@role` is re-resolved on every resume (`harness.ts:318-326`), so a pipeline/role/fallback change silently switches models.
++  3. **`thinking_level_change`** — recorded level; compare to the current role suffix. A change is a full miss (measured).
++  4. **`cttl` + last assistant timestamp** from the newest assistant message usage (`ephemeral5m`/`ephemeral1h`). Expiry = request-send time + TTL. The transcript timestamp is completion time, so subtract a conservative margin (seconds to tens of seconds).
++  5. **`compaction` entry** after the last normal turn — history was rewritten; the next resume is cold from the cut point.
++  6. **`credential_pin.hash`** (optional) — provider/account affinity changed; OpenAI-style `prompt_cache_key` affinity may be lost.
++  7. **Ordered tools hash and cache-retention setting** — the session does not record these; the engine must store them in its own session-state record/meta and compare. Tools change is a partial miss (measured).
++
++  ### 5.2 Post-hoc signals (ground truth)
++
++  - `turn_end.message.usage.cacheRead` == 0 on a resumed turn with prior history ⇒ miss; `cacheWrite` ≈ prompt size ⇒ cold write. `cacheWrite` is only populated by providers with explicit cache writes (Anthropic/Bedrock; DeepSeek reports 0).
++  - `turn_end.message.usage.cttl` gives the tier and cached-token count (`{ephemeral5m: N}` / `{ephemeral1h: N}`); absent for DeepSeek implicit caching.
++  - `turn_end.message` also carries `api`, `provider`, `model`, `reasoningTokens`, `totalTokens` — the factory currently discards all of them.
++  - RPC/SDK expose `cache_warming_start` / `cache_warming_end` with `warmingStopReason` (`refresh missed the cache`, `refresh failed`, `conversation context changed`). `-p --mode json` would include these ordinary session events if warming runs; our probes did not trigger warming (see §7).
++  - `display.cacheMissMarker` and the status-line `cache` segment are **UI-only**; no `cache_miss` event appeared in `-p` NDJSON. Do not build engine detection on them.
++
++  ### 5.3 Records gap (blocks spec 20's “measured defaults”)
++
++  `OmpNdjsonParser` reads only `u.input`, `u.output`, and `u.cost.total` (`src/harness/omp/ndjson.ts:86-99`) and returns only `inputTokens`/`outputTokens`/`costUsd` (`ndjson.ts:173-177`). `Usage` (`src/harness/types.ts:7-11`) and `StepUsage` (`src/core/artifacts.ts:545-549`) have no cacheRead/cacheWrite/totalTokens/cttl/model fields. Consequently the records cannot answer “how many tokens did the cold resume re-pay?” today — only the total cost. Extend the types and parser before choosing cost-measured defaults.
++
++  Also: side requests not tied to the agent turn (`model_usage` entries in the transcript with `purpose: "unexpected-stop"`, compaction summarization) are not attributed to the step. The `-p "/compact"` probe produced no usage record at all (see §7.1).
++
++  ## 6. Knob audit for one-process-per-turn (`-p`) factory sessions
++
++  Effective values observed with `omp config list --json` / `--scope global` on this host (omp 18.18.5): `providers.cacheRetention=short`, `providers.cacheWarming=streaming`, `provider.appendOnlyContext=auto`, `includeModelInPrompt=false`, `compaction.enabled=true`, `compaction.midTurnEnabled=true`, `compaction.methodOrder=[remote,snapcompact,handoff,shake,soft]`, `compaction.experimentalContextManagement=true`, `compaction.handoffSaveToDisk=true`, `compaction.modelThresholds={anthropic/claude-haiku-5-5: "f90000", vercel-ai-gateway/minimax/minimax-m3.1-flash: 800000}`, `mnemopi.autoRecall=true`, `mnemopi.autoRetain=true`, `memory.backend=mnemopi`, `memories.enabled=false`. Several differ from the omp docs defaults: `cacheRetention` docs `auto`, `cacheWarming` docs `idle`, `experimentalContextManagement` docs `false`, `handoffSaveToDisk` docs `false`; `--scope global` proves the host layer sets them. Factory overlay precedence is above project/global (`docs/settings.md:113-123`), so pinning in the generated overlay is effective.
++
++  | Knob | Docs default | Effective here | Affects `-p` one-process-per-turn? | Action for M7 |
++  |---|---|---|---|---|
++  | `providers.cacheRetention` | `auto` | `short` (host) | **Yes** — per-process TTL/markers; a per-turn `--config` overlay can vary it | Pin per role: architect `long` (1h) for standby gaps <1h; `short` for multi-request tool-loop agents; `none` only for known single-request turns |
++  | `providers.cacheWarming` | `idle` | `streaming` (host) | `streaming` **yes** (intra-turn long tool executions); `idle` **no** (no idle scheduler in print sessions; process exits) | Pin `streaming`; do not rely on `idle`/standby warming |
++  | `provider.appendOnlyContext` | `auto` | `auto` | **Yes** — keeps system prompt + tool specs + append-only log for maximum prefix hits | Keep `auto`/`on`; do not disable |
++  | `includeModelInPrompt` | true in docs main; installed effective `false` | `false` | **Yes if true** — model name in the system prompt makes a model switch/fallback change the prefix | Pin `false` |
++  | `display.cacheMissMarker` | true | true | **No** — TUI display only | Use usage fields instead |
++  | `compaction.enabled` | true | true | **Yes** if the threshold is crossed inside a turn (mid-turn or post-turn) | Set explicit thresholds; do not rely on the default 15%/16k reserve (≈850k on a 1M window) |
++  | `compaction.midTurnEnabled` | true | true | **Yes** — can rewrite history between tool-loop requests; the likely auto path in a long factory turn | Keep as overflow safety but raise `thresholdTokens` so it does not fire on normal architect turns |
++  | `compaction.thresholdTokens` / `thresholdPercent` / `reserveTokens` | -1 / -1 / unset | same | **Yes** — trigger point | Pin an explicit architect budget; leave room for the next wave |
++  | `compaction.methodOrder` | remote, snapcompact, handoff, shake, soft | same | **Yes** if compaction fires | Prefer `handoff`/`soft`; avoid `snapcompact` for the architect (images lose prompt caching) |
++  | `compaction.asyncEnabled` | true | true | **Yes** near threshold — speculative side request inside a one-shot process | Keep or disable for deterministic cost; measure |
++  | `compaction.autoContinue` | true | true | **Yes** — post-threshold continuation request; needed so the step still yields | Keep `true`; `false` would end a headless run without the agent's answer |
++  | `compaction.keepRecentTokens` | 20,000 | 20,000 | **Yes** — size of retained tail after compaction | Tune to the architect brief size |
++  | `compaction.supersedeReads` / `dropUseless` | true / true | true / true | **Yes** — cache-aware pruning every turn; can still mutate history near the cache lookback | Keep defaults; audit if cacheRead drops unexpectedly |
++  | `compaction.idleEnabled` / `idleThresholdTokens` / `idleTimeoutSeconds` | false / 200,000 / 300 | same | **No** — idle maintenance is enabled only by the interactive TUI; SDK/RPC/print sessions do not enable it (`docs/sdk.md:278`) | Ignore for `-p`; do not build standby policy on it |
++  | `compaction.handoffSaveToDisk` | false (host true) | true | No direct cache effect; writes summary artifacts | Pin for determinism |
++  | `compaction.experimentalContextManagement` | false (host true) | true | **Potentially** — notes-backed rollover; requires `context_notes`/`new_context`/`read`/`grep` tools, otherwise legacy maintenance | Pin `false` unless deliberately opted in |
++  | `snapcompact.systemPrompt` | `none` | `none` | **Yes** — imaging system prompt text loses prompt caching for that text | Pin `none` |
++  | `snapcompact.toolResults` | false | false | **Maybe** — images of tool results; cache/vision trade-off | Pin `false` for architect |
++  | `compaction.remoteEndpoint` / `remoteStreamingV2Enabled` / `v2RetainedMessageBudget` | unset / true / 64,000 | same | **Yes** if remote compaction is used | Decide/pin; remote is a second compaction path to test |
++  | `compaction.modelThresholds` / `modelThresholdsEnabled` | per-model / true | host overrides | **Yes** — can trigger on a model unexpectedly | Audit/pin |
++  | `task.agentCompactionThresholdOverrides` | {} | {} | **No** for root factory turns (task/subagents only) | Ignore |
++  | `mnemopi.autoRecall` / `autoRetain` | true / true | true / true | **Yes** — first-turn effective system prompt changes; cross-session recall and cache loss | Pin `false` for deterministic factory agents (or opt in consciously with a recorded digest) |
++  | `memory.backend` | `mnemopi` | `mnemopi` | **Yes via autoRecall** | Keep but disable autoRecall/autoRetain, or choose `off` if no memory is wanted |
++
++  ## 7. Compaction vs fresh brief
++
++  ### 7.1 `-p` manual compaction is available (verified)
++
++  A one-shot print invocation accepted the slash command:
++
++  ```bash
++  omp --cwd <cwd> --mode json --model opencode-go/deepseek-v4.1-flash:max \
++    --session-dir <sd> --tools= --resume <session-id> -p "/compact"
++  ```
++
++  It emitted `manual_compaction_start` then `manual_compaction_end` with `result: { tokensBefore: 38053, tokensAfter: 6794, method: "soft", firstKeptEntryId: … }`, printed `Compaction complete. Tokens: 36413 -> 6768 (saved 29645)` to stderr, persisted a `compaction` entry in the session JSONL, and exited 0. There was **no `turn_end`, no usage, and no `model_usage` entry** for the summarization request in NDJSON/transcript — compaction cost must be estimated from `tokensBefore`/summary length (or measured via `omp stats`/an RPC wrapper) if spec 20's cost defaults are to include it.
++
++  RPC mode exposes a first-class `{ type: "compact", customInstructions? }` command and `manual_compaction_start/end` events (`docs/rpc.md:190-210`, `:970-987`); `{ type: "set_cache_warming", mode }` is also available there (`docs/rpc.md:197-210`).
++
++  ### 7.2 Cost analysis (architect on `anthropic/claude-opus-5-5`, catalog: input $4/M, cacheRead $0.20/M, cacheWrite $5/M)
++
++  For a 38k-token history (same order as the compaction probe):
++
++  | Strategy | What is paid | Approx cost |
++  |---|---|---|
++  | Direct cold resume | 38k × $4/M | **$0.152** |
++  | Compact **after** cache expiry, then resume | summarizer cold-reads 38k ($0.152) + summary output (~$0.01-0.02) + compacted prefix write 6.8k × $5/M ($0.034) + resumed turn | **≈$0.20-0.24** (worse than direct for one turn) |
++  | Compact **while warm** (at wave end, within TTL), then resume | summarizer cache-reads 38k × $0.20/M ($0.0076) + output (~$0.01-0.02) + compacted write $0.034 + resumed turn | **≈$0.06-0.09** (better) |
++  | Fresh architect brief | build B-token brief from records (e.g. B≈5k: $0.02 input / $0.025 write) + system-prompt prefix cacheRead (~$0.001) | **≈$0.02-0.03** at B=5k; still cheaper at B=20k (~$0.08-0.10) |
++
++  Key correction to spec item 20(a): **compaction after the cache has already expired does not avoid re-paying the full history; the summarizer pays it once, then the resumed turn pays the compacted prefix again.** Compaction only pays if it runs while the prefix is still warm, or if the architect will have several future turns on the compacted history, or if the full history would overflow the window. For an already-cold resume, a deterministic fresh brief is the cheaper mechanism.
++
++  ### 7.3 Recommended mechanism
++
++  1. **Warm** (no trigger): resume additively; do nothing.
++  2. **Cold + short history / one-shot consult**: resume uncached; optionally pass a per-turn overlay with `providers.cacheRetention: none` if the turn is known to make a single model request (multi-request tool loops still benefit from caching).
++  3. **Cold + long history + more turns expected**: start a **fresh architect session hydrated from records** (existing `hydrationContext`/`contextPack`/`waveReport` machinery in `step-runner.ts` and `steps/architect-resume`). This is bounded, deterministic, and still reuses the system-prompt prefix (4,224-token cross-session hit measured).
++  4. **Compact only while warm**, at a natural wave boundary, before the TTL expires: `omp -p --resume <id> "/compact"` (verified) or RPC `compact`. Use `handoff`/`soft`, not `snapcompact` for the architect. Record `tokensBefore/tokensAfter`; estimate cost.
++  5. **If already cold and continuity is mandatory** (the brief would lose critical conversational state): resume uncached and accept the full read; do not compact as well.
++
++  ## 8. Standby-warming viability
++
++  - `providers.cacheWarming` values: `off`, `streaming`, `idle` (verified by invalid-value error; docs `docs/settings.md:1026`). Warming replays the last request with a one-token output budget shortly before expiry, only when the expected avoided-miss cost exceeds the refresh cost by at least **$0.05**. For Opus (input $4/M vs cacheRead $0.20/M, delta $3.8/M), the threshold is ≈**13.2k tokens** of prefix; an architect session above that qualifies economically.
++  - **`idle` warming cannot cover factory standby.** The interactive TUI owns idle work; “SDK, RPC and print sessions do not” enable idle maintenance (`docs/sdk.md:278`). `-p` exits at the end of the turn, so there is no process alive to replay the request between turns. `streaming` warming can still protect a long tool execution **inside** a turn — pin it.
++  - **The practical standby mechanism is `providers.cacheRetention: long`** (1h where supported). Verified `cttl: {ephemeral1h: N}`. It needs no live process. The cost is the cache write: catalog `cacheWrite` for Opus is $5/M (1.25× input); Anthropic bills 1h writes at a higher rate than 5m in the real API, and omp's single catalog `cacheWrite` value may under-estimate 1h writes — verify against provider billing before making it the default. A 1h tier pays if the architect's next turn lands >5m and <1h later; it does not cover >1h gaps.
++  - **Pre-warming immediately before a resume is never cheaper:** if the entry already expired, the warm request pays full input + cache write, then the resumed turn pays cache read; that is strictly more than the direct cold resume. Warm must happen *before* expiry to pay off.
++  - **Persistent RPC holder** (`omp --mode rpc`, `set_cache_warming idle`, `compact`) is the only true standby warming, but it reintroduces a long-lived process and session ownership across wave gaps. Defer as an optional M7 experiment; measure against long retention first.
++
++  ## 9. Recommendations for M7
++
++  1. **Extend usage accounting** (`src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549`, `src/harness/omp/ndjson.ts:86-99`): add `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, `cacheTtl: {tier, tokens}`, `provider`, `api`, `model`, `reasoningTokens`; keep per-request rows (a turn can emit multiple `turn_end` usages) and aggregate. Include side-request `model_usage`/compaction cost where available.
++  2. **Add a per-session cache-state record** (meta or a sibling `session-cache.yaml`): resolved model (`provider/model` from `turn_end.message`), thinking suffix, ordered tools hash, system-prompt hash, cache retention, last request timestamp, last `cttl`, last `compaction` marker. Compare it on every resume.
++  3. **Stop silently switching models on resume:** record the resolved model used by the successful turn and pass that literal model on resume (or detect the mismatch and treat it as cold). Current resume unconditionally passes `@role` (`harness.ts:318-326`), so a role-map change or fallback recovery silently switches models and pays a full cold read.
++  4. **Pin effective omp settings in the generated overlay** (`overlay.ts:51-85`): `providers.cacheRetention` (per role/flow), `providers.cacheWarming: streaming`, `provider.appendOnlyContext: auto`, `includeModelInPrompt: false`, `snapcompact.systemPrompt: none`, `snapcompact.toolResults: false`, `compaction.experimentalContextManagement: false`, explicit `compaction.enabled/thresholdTokens/methodOrder/autoContinue`, and `mnemopi.autoRecall/autoRetain: false`. Overlay precedence beats host global/project config (`docs/settings.md:113-123`), but only if the keys are actually present.
++  5. **Validate effectively, not syntactically:** `omp --config <overlay> --version` exits 0 even for invalid YAML or an invalid `providers.cacheRetention` value (confirmed). Preflight’s current overlay check (`src/cli/preflight.ts:364-393`) is therefore a no-op. Read back effective values (`omp config get`, or a no-model probe) and/or perform a real throwaway turn before declaring config compatible. This confirms open concern `c-477404c672` and adds cache/compaction keys to its scope.
++  6. **Cold policy:** warm → resume; cold single-turn → resume (optionally `retention: none`); cold long-history → fresh brief; compact only while warm. Do not compact after expiry for a single resume.
++  7. **Byte stability:** keep system-prompt content byte-stable; make prompt filenames content-addressed (`prompt-<sha256>.txt`) so identical logical prompts produce identical `@file` wrappers/transcripts. The current timestamp+random path is cache-safe but not byte-reproducible.
++  8. **Disable ambient memory for deterministic agents** or explicitly include its digest: `mnemopi.autoRecall/autoRetain: false`; otherwise fresh sessions in a reused cwd inject prior task text into the system prompt (digest changes observed).
++  9. **Measure before defaults:** use `long` retention for architect standby gaps <1h, `short` for multi-request tool-loop agents, `none` only for single-request turns; keep the choice per role/flow and record the cost delta.
++  10. **Tests:** the scripted mock provider for item 19.8 should emit realistic `usage` rows with `cacheRead`, `cacheWrite`, `totalTokens`, `cttl`, and multiple `turn_end`s per turn, plus a synthetic session JSONL with `system-prompt-digest`, `model_change`, `thinking_level_change`, `compaction`, and `cttl` so cold detection is testable without paid models.
++
++  ## 10. Draft decision YAML
++
++  ```yaml
++  status: proposed
++  decision: |
++    OMP prompt caching is content-keyed, not path-keyed. The cached prefix is composed of the
++    system-prompt bytes, ordered tool specs, model/thinking identity, cache-retention tier, and
++    conversation history; file paths and session ids are not hard key components. The factory's
++    deterministic system-prompt path and unique per-turn prompt path are cache-safe; a changed
++    system-prompt path with identical bytes still fully hits. Cold resume must be detected from
++    content/config changes (system-prompt bytes, ordered tools, model, thinking level, cache
++    retention) plus TTL expiry (usage.cttl + timestamp) and compaction markers, not from paths.
++    For one-process-per-turn `-p` sessions, idle cache warming and idle compaction are unavailable;
++    use `providers.cacheRetention: long` for architect standby gaps under 1h, pin streaming warming
++    for intra-turn tool executions, and do not rely on omp's default host config (this host sets
++    short/streaming/experimental values). For an already-cold architect resume, prefer a fresh
++    brief hydrated from records over compaction; compaction only pays when performed while the
++    cache is warm (at a wave boundary) or amortized over several future turns. Pin all relevant
++    omp cache/compaction/memory keys in the generated overlay and record cacheRead/cacheWrite/
++    totalTokens/cttl in step records so defaults can be measured.
++  evidence:
++    - "Transport audit: harness.ts:286-350 writes a deterministic per-agent+session system prompt and a unique timestamp+random prompt file; argv differs only in -p @path; overlay bytes identical (sha256 6ebf5894...); system-prompt/prompt content identical across renders."
++    - "Path invariance: DeepSeek resume with changed system-prompt path and identical bytes cacheRead=11,392 (input 86); Anthropic resume with changed path cacheRead=6,703 (input 4). New prompt path per turn cacheRead=10,752 (DeepSeek) and 29,363 (Anthropic)."
++    - "Content invalidation: system prompt + newline cacheRead=0 (input 13,266); tools change cacheRead=2,432 of 4,480; thinking change cacheRead=0; model switch cacheRead=0 (cost 8.9x warm)."
++    - "TTL: Anthropic short (5m) warm resume cacheRead=29,363, cost $0.001454; after 330s cacheRead=0, cacheWrite=38,022, cost $0.004767. Long retention emits cttl ephemeral1h; providers.cacheRetention enum is auto|short|long|none."
++    - "Cross-session: new session, same system prompt/tools, cacheRead=4,224; session id is not a hard key."
++    - "Compaction: `omp -p --resume <id> \"/compact\"` compacted 38,053 -> 6,794 tokens (method soft) with manual_compaction_start/end; no usage/cost in NDJSON or transcript. Docs: idle maintenance is TUI-only (docs/sdk.md:278); cacheWarming values off|streaming|idle, $0.05 avoided-miss gate (docs/settings.md:1026); idle compaction trade-off (docs/compaction.md:155-158)."
++    - "Factory records: ndjson.ts:86-99 and 173-177 drop cacheRead/cacheWrite/totalTokens/cttl; Usage and StepUsage lack fields (types.ts:7-11, artifacts.ts:545-549)."
++    - "Factory overlay: overlay.ts:51-85 pins no providers.cache*, compaction.*, snapcompact.*, mnemopi.autoRecall/autoRetain; host global config sets providers.cacheRetention=short, cacheWarming=streaming, compaction.experimentalContextManagement=true. `omp --config <invalid> --version` exits 0, so preflight.ts:364-393 does not validate the overlay."
++  followUps:
++    - "M7: extend Usage/StepUsage and OmpNdjsonParser with cacheRead/cacheWrite/totalTokens/cttl/provider/model/reasoningTokens and per-request rows."
++    - "M7: add a session cache-state record and pre-launch cold detector (system-prompt hash, ordered tools hash, resolved model, thinking, retention, cttl+timestamp, compaction marker)."
++    - "M7: pass the recorded resolved model on resume instead of unconditionally @role; treat role-map changes as cold."
++    - "M7: pin cache/compaction/mnemopi settings in the generated overlay; validate effective values in preflight with a real check, not `--version`."
++    - "M7: measure long-vs-short retention and fresh-brief-vs-warm-compaction per role/flow on the self-host fire test; confirm Anthropic 1h write pricing against provider billing."
++    - "M7: optional RPC holder experiment (set_cache_warming idle + compact) only if long retention does not cover the observed wave gaps."
++    - "Add a mock-provider fixture with cache usage/cttl/session entries so cold-detection and cost defaults are testable without paid models."
++  ```
++
++  ## 11. Open questions / follow-ups
++
++  - Anthropic's real 1h cache-write price is higher than the 5m write price; omp's catalog exposes one `cacheWrite` value per model. The cost estimates in §7.2/§8 for `long` may be optimistic. Confirm on the provider bill before making `long` the default.
++  - DeepSeek reports no `cttl`/`cacheWrite`; its implicit cache has no observable TTL. Do not attempt TTL-based cold detection for such providers; use content/config fingerprints only.
++  - The `-p "/compact"` summarization cost is not in NDJSON or the transcript. If spec 20 requires measured compaction cost, add an RPC wrapper that captures the compaction response/usage, or estimate from `tokensBefore` and summary length.
++  - `mnemopi.autoRetain` can write completed factory turns into a per-cwd memory bank and affect later fresh sessions in the same worktree. Decide whether that is a feature (cross-run context) or a leak (task isolation); the factory's current overlay only disables the linking flags.
++  - `checkpoint.enabled: true` in the overlay mounts checkpoint tools; agents opt in via their tool lists. Not a cache issue, but part of the effective harness surface to audit.
++
++  ## Sources
++
++  Repo (read-only audit):
++  - `plugins/software-factory/src/harness/omp/harness.ts:286-350` — system-prompt/prompt materialization, model candidates.
++  - `plugins/software-factory/src/harness/omp/harness.ts:368-389` — argv construction (`--system-prompt`, `-p @file`, `--resume`, tools).
++  - `plugins/software-factory/src/harness/omp/harness.ts:225-240` — overlay regeneration.
++  - `plugins/software-factory/src/harness/omp/overlay.ts:26-100` — overlay keys; no cache/compaction/memory-autoRecall pins.
++  - `plugins/software-factory/src/harness/omp/ndjson.ts:86-99,173-177` — usage fields dropped.
++  - `plugins/software-factory/src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549` — `Usage`/`StepUsage` lack cache fields.
++  - `plugins/software-factory/src/core/flows/step-runner.ts:534-547,620,817` — prompt rendering and `AgentRun` prompt.
++  - `plugins/software-factory/src/core/records/step-record.ts:96`; `src/harness/omp/harness.ts:521-522` — `traceRef` to session JSONL.
++  - `plugins/software-factory/src/cli/preflight.ts:364-393` — overlay validation via `omp --config … --version`.
++  - `plugins/software-factory/docs/OMP_ADAPTER.md:164-172` — prior cache-safety claims; line 168 previously marked path-vs-content keying unknown.
++  - `plugins/software-factory/docs/ARCHITECTURE.md:38` — one process per agent turn; `:40` — cache/compaction not built.
++  - `plugins/software-factory/docs/factory.v2.md:114-120` — spec items 20(a)-(d).
++
++  OMP docs (official):
++  - `https://omp.sh/docs/compaction` — compaction settings reference.
++  - `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/settings.md:113-123` — precedence (overlay beats project/global); `:926` — cache-segment invalidation signals; `:1025-1027` — cacheRetention/cacheWarming; `:468` — includeModelInPrompt.
++  - `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/models.md:465-504` — prompt-cache lifetimes (Anthropic 5m/1h; OAuth vs API key defaults).
++  - `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/sdk.md:278` — idle maintenance is TUI-only; SDK/RPC/print sessions do not enable it.
++  - `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/compaction.md:155-158` — idle-compaction/cache TTL trade-off; `:530` — experimental context management default false.
++  - `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/rpc.md:190-210,970-1037` — `compact`, `set_cache_warming`, `cache_warming_start/end`/`warmingStopReason`.
++
++  ## Appendix A: Probe log (commands and raw result locations)
++
++  All live probes were run as `omp -p --mode json --max-cost 0.10` from throwaway dirs; per-turn NDJSON and stderr were captured under `/tmp/spike-cache-key-{live,ttl,invalidation,tools-thinking,digest,cross-session,anth-path,retention,preflight}`. The transport shim captured argv/system-prompt/prompt under `/tmp/spike-cache-key-0c1ojol5/capture/{fresh-1,fresh-2,resume-1,resume-2}`. The numbers in §3 are extracted from the `turn_end`/`message` usage rows in those files. Aggregate spend ≈ $0.05.
++contextPack: "M7 implementation handoff: (1) OMP cache identity is content-based
++  — system-prompt bytes + ordered tools + model/thinking + retention +
++  conversation; paths and session ids do not matter. (2) The factory transport
++  is cache-safe for resumed prefixes; the unique prompt path only appears in the
++  new user message via omp's `<file name=...>` wrapper. (3) Add
++  cacheRead/cacheWrite/totalTokens/cttl/provider/model to Usage/StepUsage +
++  OmpNdjsonParser; currently ndjson.ts:86-99 drops them. (4) Build a per-session
++  cache-state record and compare on resume: system-prompt hash (omp
++  `custom/system-prompt-digest`), resolved model from turn_end.message, thinking
++  suffix, ordered tools hash, retention, last cttl+timestamp, compaction entry.
++  Pass the recorded model literal on resume instead of @role. (5) Pin in the
++  generated overlay: providers.cacheRetention (long architect/short
++  tool-loop/none single-request), cacheWarming=streaming,
++  appendOnlyContext=auto, includeModelInPrompt=false,
++  snapcompact.systemPrompt=none, compaction.experimentalContextManagement=false,
++  explicit compaction thresholds/methodOrder,
++  mnemopi.autoRecall/autoRetain=false. (6) Print-mode sessions cannot use idle
++  warming or idle compaction; use long retention for <1h standby. (7) `omp -p
++  --resume <id> \"/compact\"` works (38,053→6,794 tokens) but does not expose
++  cost; prefer fresh brief when already cold and compact while warm at wave
++  end."
++sources:
++  - plugins/software-factory/src/harness/omp/harness.ts:286-350
++  - plugins/software-factory/src/harness/omp/harness.ts:368-389
++  - plugins/software-factory/src/harness/omp/overlay.ts:26-100
++  - plugins/software-factory/src/harness/omp/ndjson.ts:86-99
++  - plugins/software-factory/src/harness/types.ts:7-11
++  - plugins/software-factory/src/core/artifacts.ts:545-549
++  - plugins/software-factory/src/cli/preflight.ts:364-393
++  - plugins/software-factory/docs/OMP_ADAPTER.md:164-172
++  - plugins/software-factory/docs/ARCHITECTURE.md:38
++  - plugins/software-factory/docs/factory.v2.md:114-120
++  - https://omp.sh/docs/compaction
++  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/settings.md
++  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/models.md
++  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/sdk.md
++  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/compaction.md
++  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/rpc.md
++recommendations:
++  - Extend Usage/StepUsage and OmpNdjsonParser with cacheReadTokens,
++    cacheWriteTokens, totalTokens, cacheTtl {tier,tokens}, provider, api, model,
++    reasoningTokens; keep per-request rows.
++  - Add a per-session cache-state record (resolved model, thinking, ordered
++    tools hash, system-prompt hash, retention, last cttl+timestamp, compaction
++    marker) and compare it on every resume.
++  - Pass the recorded resolved model literal on resume instead of
++    unconditionally @role; a role-map change or fallback recovery currently
++    switches models and silently pays a full cold read.
++  - Pin providers.cacheRetention/cacheWarming, provider.appendOnlyContext,
++    includeModelInPrompt, snapcompact.*, compaction.*, and
++    mnemopi.autoRecall/autoRetain in the generated overlay; do not inherit host
++    global config.
++  - Replace the preflight overlay check (`omp --config … --version`) with
++    effective-value validation or a real throwaway turn; the current check exits
++    0 for invalid YAML and invalid enum values.
++  - "Cold policy: warm resume; cold one-shot resume with retention none only for
++    single-request turns; cold long-history fresh brief; compact only while warm
++    at a wave boundary."
++  - Disable mnemopi autoRecall/autoRetain for deterministic factory agents, or
++    record the memory digest explicitly; otherwise fresh sessions in a reused
++    cwd inject prior task text into the system prompt.
++  - Use long retention for architect standby gaps under 1h; keep short for
++    multi-request tool-loop agents; measure long-vs-short and
++    fresh-brief-vs-warm-compaction per role/flow.
++  - Make prompt filenames content-addressed (prompt-<sha256>.txt) if
++    byte-reproducible retries are needed; current timestamp+random paths are
++    cache-safe but not byte-identical.
++  - Add mock-provider fixtures that emit cacheRead/cacheWrite/totalTokens/cttl
++    and synthetic session entries (system-prompt-digest, model_change,
++    thinking_level_change, compaction) so cold detection is testable without
++    paid models.
++concerns:
++  - kind: risk
++    summary: Factory overlay pins no cache/compaction/memory knobs; effective
++      behavior is inherited from host global/project config
++    detail: overlay.ts:51-85 generates only
++      modelRoles/retry/eval/title/checkpoint/advisor/bash/mnemopi-linking/update.
++      On this host `omp config list --scope global` sets
++      providers.cacheRetention=short, providers.cacheWarming=streaming,
++      compaction.experimentalContextManagement=true,
++      compaction.handoffSaveToDisk=true and modelThresholds overrides —
++      differing from omp docs defaults. A factory run on another host inherits
++      different cache TTL/warming/compaction behavior with no record. Overlay
++      precedence would fix it (docs/settings.md:113-123), but the keys are
++      absent.
++    severity: high
++    location:
++      file: plugins/software-factory/src/harness/omp/overlay.ts
++      line: 51
++    affects:
++      - 20a
++      - 20b
++      - 20c
++      - 20d
++      - "19.2"
++  - kind: risk
++    summary: mnemopi.autoRecall injects prior-session text into the first turn,
++      changing the effective system prompt and defeating fresh-session cache
++      reuse
++    detail: The overlay disables polyphonicRecall/enhancedRecall/proactiveLinking
++      but leaves mnemopi.autoRecall and autoRetain at true. Probes show
++      custom/system-prompt-digest changes when memory recall text is injected
++      (a94d3680ec1c75cf with no memories vs a89aabcb237da3c7/634c40b6e2f931de
++      with recalled content), even though the agent body is unchanged. Recalled
++      memories are first-turn-only, so resumed turns are safe, but fresh
++      sessions in a reused worktree are non-deterministic and can leak prior
++      task prompts across tasks sharing a cwd.
++    severity: high
++    location:
++      file: plugins/software-factory/src/harness/omp/overlay.ts
++      line: 77
++    affects:
++      - 20b
++      - 20c
++      - "19.7"
++  - kind: risk
++    summary: Factory records drop cacheRead/cacheWrite/totalTokens/cttl, so spec
++      20's cost-measured defaults cannot be computed from records
++    detail: OmpNdjsonParser sums only u.input/u.output/u.cost.total
++      (ndjson.ts:86-99; result at 173-177); Usage (types.ts:7-11) and StepUsage
++      (artifacts.ts:545-549) have no cache fields. A turn's multiple requests
++      are aggregated into one input/output/cost total; the architect's
++      cache-read tokens and cold-resume cost are not attributable. The `-p
++      "/compact"` probe also produced no usage record.
++    severity: high
++    location:
++      file: plugins/software-factory/src/harness/omp/ndjson.ts
++      line: 86
++    affects:
++      - 20a
++      - 20b
++      - 20c
++      - 20d
++  - kind: risk
++    summary: Resume passes @role without verifying the recorded
++      model/thinking/tools/system prompt, so config/fallback changes silently
++      cause cold resumes
++    detail: harness.ts:318-326 forces a single `@role` candidate on resume. The role
++      is re-resolved against the current overlay each turn; a pipeline role-map
++      change, or a fallback model used on a fresh turn, switches the model on
++      resume and pays a full cold read (measured cacheRead=0, cost 8.9x warm).
++      Tools/system-prompt/thinking changes similarly invalidate but are not
++      recorded in step meta.
++    severity: medium
++    location:
++      file: plugins/software-factory/src/harness/omp/harness.ts
++      line: 318
++    affects:
++      - 20a
++  - kind: assumption
++    summary: Spec 20(a)'s 'compact before an uncached resume' is a net loss for a
++      single resume because the summarizer itself pays the full history
++    detail: Compaction 38,053→6,794 tokens was verified, but the summarization
++      request reads the full history; if the cache is already expired, cost ≈
++      cold history + summary output + compacted-prefix write + resumed turn,
++      which is more than a direct cold resume. Compaction only pays while the
++      cache is still warm (at a wave boundary) or when amortized over several
++      future turns. Recommend fresh brief for already-cold long-history resumes.
++    severity: medium
++    location:
++      file: docs/factory.v2.md
++      line: 115
++    affects:
++      - 20a
++      - 20b
++  - kind: risk
++    summary: Native standby warming and idle compaction are unavailable in
++      one-process-per-turn -p sessions
++    detail: OMP's idle maintenance is enabled only by the interactive TUI; SDK, RPC
++      and print sessions do not enable it (docs/sdk.md:278). A `-p` process
++      exits after the turn, so providers.cacheWarming=idle cannot replay a
++      request during factory standby and compaction.idle* never fires.
++      `streaming` warming still applies during long tool executions inside a
++      turn. The practical standby mechanism is providers.cacheRetention=long
++      (1h), not native idle warming.
++    severity: medium
++    location:
++      file: plugins/software-factory/docs/ARCHITECTURE.md
++      line: 38
++    affects:
++      - 20b
++      - 20d
++remarkable:
++  - chosen: "Content fingerprints for cold-resume detection: system-prompt bytes,
++      ordered tools, resolved model, thinking level, retention, TTL and
++      compaction marker"
++    why: The probes show path changes with identical bytes are full hits, while
++      one-byte content changes, tools changes, thinking changes, model switches,
++      TTL expiry and compaction are misses. Path-based invalidation would
++      false-positive on every turn because the factory creates a new prompt file
++      path per turn.
++    alternatives:
++      - Hash the system-prompt path and prompt path
++      - Invalidate on every new prompt filename
++      - Rely on omp's UI cache marker / cacheRead alone
++  - chosen: Fresh brief for an already-cold long-history architect resume; compact
++      only while warm
++    why: Compaction after expiry re-reads the full history in the summarizer and
++      then writes the compacted prefix, costing more than a direct cold resume
++      for a single turn. A fresh session hydrated from records is bounded,
++      deterministic, and still reuses the system-prompt prefix (measured 4,224
++      cached tokens across sessions). Warm compaction at a wave boundary avoids
++      the double full-history payment.
++    alternatives:
++      - Compact immediately before every cold resume
++      - Always resume uncached and never compact
++      - Persistent RPC holder that compacts in place
++  - chosen: providers.cacheRetention=long for architect standby gaps under 1h
++      instead of omp idle cache warming
++    why: Print-mode sessions have no idle scheduler and exit after each turn, so
++      cacheWarming=idle cannot cover factory standby. Long retention needs no
++      live process and emits cttl ephemeral1h; it is the only zero-process
++      warming mechanism. The 1h write premium must be verified against provider
++      billing.
++    alternatives:
++      - Run a persistent RPC session with set_cache_warming idle
++      - Pre-warm immediately before resume
++      - Accept 5m short TTL and pay cold resumes
++  - chosen: Pin all cache/compaction/memory keys in the generated omp overlay rather
++      than relying on omp defaults or host config
++    why: The factory overlay currently pins none of them, and this host's global
++      config overrides omp defaults (short vs auto, streaming vs idle,
++      experimentalContextManagement true vs false). Overlay precedence beats
++      project/global, so explicit keys make cache behavior reproducible and
++      auditable.
++    alternatives:
++      - Read host config and adapt at runtime
++      - Use PI_CACHE_RETENTION env overrides
++      - Document host settings as an installation prerequisite
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
diff --git a/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/002-review-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/002-review-r1-a1/meta.yaml
new file mode 100644
index 0000000..f1b2597
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/002-review-r1-a1/meta.yaml
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
+startedAt: 2026-11-10T00:55:03.143Z
+session: 01a1c2f3-8dc1-76c9-8e8a-397e87fcd73f
+endedAt: 2026-11-10T01:18:11.714Z
+usage:
+  inputTokens: 98410
+  outputTokens: 42387
+  costUsd: 0.024947
+repairedFrom: simpler_repair
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T00-55-03-873Z_01a1c2f3-8dc1-76c9-8e8a-397e87fcd73f.jsonl
diff --git a/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/002-review-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/002-review-r1-a1/output.yaml
new file mode 100644
index 0000000..3002cb0
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-cache-key/steps/002-review-r1-a1/output.yaml
@@ -0,0 +1,56 @@
+status: approved
+summary: Spike answers M1 cache-key scenario; content-keyed verdict strongly
+  evidenced; minor doc provenance nits only
+suggestions:
+  - detail: Findings Sources and output.yaml sources list
+      plugins/software-factory/docs/factory.v2.md:114-120 which does not exist;
+      assignment citations and repo truth is docs/factory.v2.md:114-120. Correct
+      before publishing draft to
+      plugins/software-factory/docs/spikes/omp-5-cache-keys.md.
+    disposition: optional
+    id: wrong-spec-path
+    location:
+      file: .factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/output.yaml
+    summary: Findings cite nonexistent plugins/software-factory/docs/factory.v2.md
+  - detail: Findings 7.1 claims NDJSON manual_compaction_end.result carries
+      tokensBefore/tokensAfter/method; raw NDJSON shows only
+      summary/shortSummary/firstKeptEntryId/tokensBefore/details.
+      tokensAfter+method live in transcript compaction entry (matches rpc.md
+      example). Numbers 38,053->6,794 soft still correct; fix provenance so M7
+      reads transcript not NDJSON for tokensAfter.
+    disposition: optional
+    id: compaction-result-source
+    location:
+      file: .factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/output.yaml
+    summary: 7.1 misattributes tokensAfter/method to NDJSON result
+  - detail: Appendix A claims per-turn NDJSON captured under
+      /tmp/spike-cache-key-retention but long (ephemeral1h:6,705) and none
+      probes have only YAMLs, no NDJSON/transcript found. Claim consistent with
+      docs/settings but log overstates artifact completeness. Archive NDJSON or
+      qualify as YAML-only.
+    disposition: optional
+    id: retention-probe-artifacts
+    location:
+      file: .factory/tasks/omp-workspaces/items/spike-cache-key/steps/001-research-r1-a1/output.yaml
+    summary: Long/none retention probes lack archived NDJSON
+  - detail: Docstring implies resume determinism but harness.ts:318-326 re-resolves
+      @role every turn; role-map/fallback change silently switches model (spike
+      measured cacheRead=0, 8.9x cost). Note re-resolution; M7 already tasked to
+      record literal model.
+    disposition: optional
+    id: harness-resume-docstring
+    location:
+      file: plugins/software-factory/src/harness/omp/harness.ts
+      line: 280
+    summary: harness.ts:280 docstring overstates resume guarantee
+  - detail: Transport audit cites steps/architect-resume; IMPLEMENTATION.md flags
+      that fragment dead. Harness mechanism identical
+      (harness.ts:286-350,368-389) so byte diffs (sysprompt cb92bbca, prompt
+      4a9d87d4, overlay 6ebf5894/1472B, argv differs only -p @path) still valid,
+      but note status or re-run with live fragment for M2 baseline.
+    disposition: optional
+    id: dead-fragment-probe
+    location:
+      file: plugins/software-factory/src/harness/omp/harness.ts
+      line: 286
+    summary: Audit uses steps/architect-resume flagged dead

## Review Feedback
Quality gates failed on merge path for spike-cache-key: typecheck. typecheck (exit via status=fail). Command: bun --cwd=plugins/software-factory run typecheck Details: error TS2688: Cannot find type definition file for 'bun'.
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
