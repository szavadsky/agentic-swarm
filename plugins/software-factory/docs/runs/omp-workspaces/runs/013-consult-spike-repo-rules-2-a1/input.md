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
spike-repo-rules

## Assignment
{"slug":"spike-repo-rules","kind":"fact-finder","title":"Spike: repo-rules sources + omp injection audit","assignment":"Fact-finder spike, no prod code. 1) Enumerate rule/context sources (AGENTS.md/CLAUDE.md/.cursorrules/.omp/rules, root plus subdirs) and precedence via omp docs plus config inspection. 2) With a sentinel fixture repo (unique temp dir), probe root omp processes with and without --system-prompt and with/without contextFiles.extra and --no-context-files; record whether the sentinel is injected (double-injection risk). 3) Map per-role hydration seams (architect/developer/qa/reviewer prompt rendering) and define the M8 verification plan (probe agents quote sentinel). Outputs: items/{item}/findings.md with source/precedence table and probe matrix, full draft for plugins/software-factory/docs/spikes/omp-6-repo-rules.md, draft decision YAML {status, decision, evidence, followUps} stating sources, precedence, double-inject verdict. Constraints: read-only on repo prod paths; cwd=plugins/software-factory; throwaway profile/repos; hydration implementation deferred to M8. Acceptance: answers M1 repo-rules scenario.","outlineRef":"spike-repo-rules","milestone":"m1-omp-de-risk","wave":1,"scenarioRefs":["m1-omp-de-risk:scenario-4"],"citations":["docs/factory.v2.md:104-113","plugins/software-factory/docs/OMP_ADAPTER.md:163-168","plugins/software-factory/docs/ARCHITECTURE.md:40"]}

## Prior Attempts & Failures
Merge path failed for spike-repo-rules (attempt 2/2)

## Current Diff
diff --git a/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/input.md
new file mode 100644
index 0000000..5993ef2
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/input.md
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
+  "slug": "spike-repo-rules",
+  "kind": "fact-finder",
+  "title": "Spike: repo-rules sources + omp injection audit",
+  "assignment": "Fact-finder spike, no prod code. 1) Enumerate rule/context sources (AGENTS.md/CLAUDE.md/.cursorrules/.omp/rules, root plus subdirs) and precedence via omp docs plus config inspection. 2) With a sentinel fixture repo (unique temp dir), probe root omp processes with and without --system-prompt and with/without contextFiles.extra and --no-context-files; record whether the sentinel is injected (double-injection risk). 3) Map per-role hydration seams (architect/developer/qa/reviewer prompt rendering) and define the M8 verification plan (probe agents quote sentinel). Outputs: items/{item}/findings.md with source/precedence table and probe matrix, full draft for plugins/software-factory/docs/spikes/omp-6-repo-rules.md, draft decision YAML {status, decision, evidence, followUps} stating sources, precedence, double-inject verdict. Constraints: read-only on repo prod paths; cwd=plugins/software-factory; throwaway profile/repos; hydration implementation deferred to M8. Acceptance: answers M1 repo-rules scenario.",
+  "outlineRef": "spike-repo-rules",
+  "milestone": "m1-omp-de-risk",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-omp-de-risk:scenario-4"
+  ],
+  "citations": [
+    "docs/factory.v2.md:104-113",
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
+  "docs/factory.v2.md:104-113",
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
diff --git a/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/meta.yaml
new file mode 100644
index 0000000..a7b9e9a
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/meta.yaml
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
+startedAt: 2026-11-09T23:41:25.304Z
+session: 01a1c2b0-2538-749d-9c25-5a46df725a1d
+endedAt: 2026-11-09T23:58:39.102Z
+usage:
+  inputTokens: 171777
+  outputTokens: 89871
+  costUsd: 0.10315
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-41-26-200Z_01a1c2b0-2538-749d-9c25-5a46df725a1d.jsonl
diff --git a/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/output.yaml
new file mode 100644
index 0000000..a3c1466
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/output.yaml
@@ -0,0 +1,720 @@
+status: ok
+summary: "omp 18.18.5 root sessions auto-discover and inject repo context files
+  into a trailing <repo-rules> block even when --system-prompt is used, and
+  inject rules separately (RULES.md/always-apply in the prompt, conditional
+  rules as rulebook listings). Factory roles are root omp processes, so
+  architect/developer/qa/reviewer already receive repo rules exactly once;
+  current code does not double-inject. The spec's 'subagents drop AGENTS.md'
+  premise is true only for omp task subagents (scouts), not root roles: scouts
+  keep RULES.md and contextFiles.extra but drop every AGENTS.md. Probe matrix
+  (sentinel fixtures + local mock provider, omp 18.18.5) confirms sources,
+  precedence, flags, user-level leakage, resume re-rendering, and that copying
+  rules into --system-prompt produces two copies. Preflight overlay validation
+  via `omp --config ... --version` is a confirmed no-op; a local
+  OpenAI-compatible mock provider works for no-paid-model tests."
+findings: |-
+  # Spike findings — repo-rules sources + omp injection audit (M1 scenario 4)
+
+  **Status:** ok  
+  **Tested:** omp `18.18.5` (`/home/slava/.bun/bin/omp`), Linux x86_64 WSL2, 2026-11-09.  
+  **Scope:** read-only repository investigation; all probes ran in throwaway `/tmp` fixtures and a throwaway omp profile/agent dir; no production files changed. Hydration implementation is deferred to M8.
+
+  ---
+
+  ## 1. Bottom line (answers the M1 repo-rules scenario)
+
+  1. **Root omp sessions auto-inject repo rules.** With `--system-prompt <role-body>`, omp still emits the trailing `<project-context>` footer containing `<repo-rules>` (one `<file path=...>` per surviving context file), and still injects rules (`RULES.md`, always-apply rules; conditional rules as `<domain-rules>`/`<rules>` listings). `--system-prompt` replaces only block 0. Evidence: probe matrix §5; omp docs Context files / System prompt customization.
+  2. **Factory roles are root omp processes**, not omp `task` subagents: `OmpHarness.runAttempt` launches `omp --cwd <worktree> ... --system-prompt <role-body> -p @<step-prompt>` per role turn. Architect/plan-reviewer/PM run in the task worktree; developer/qa/reviewer run in the item worktree. All therefore receive repo rules from their cwd automatically.
+  3. **No double injection in current code.** Agent/step prompts contain no repo-rule text (`grep` over `agents/` and `src/core/prompts.ts` found no `AGENTS`/`CLAUDE`/`RULES.md` references), so omp is the sole injector. The expected repo sentinel appears exactly once per role request.
+  4. **Double injection is real if M8 copies rules into role prompts.** A role `--system-prompt` containing the same repo text produced **2 occurrences** of the sentinel (block 0 + `<repo-rules>`). `--append-system-prompt` containing it also produced 2. Clean single-copy options: rely on omp discovery (recommended), or launch with `--no-context-files --no-rules` when the engine injects its own block.
+  5. **The spec's AGENTS.md/subagent premise applies to scout subagents, not roles.** omp task subagents drop every context file named `AGENTS.md` by basename, but keep `RULES.md` and `contextFiles.extra` files. Root role sessions do not drop AGENTS.md. Put hard rules that scouts must see in `.omp/RULES.md` (or `contextFiles.extra`), not only in `AGENTS.md`.
+  6. **`--system-prompt` does not suppress user-level `APPEND_SYSTEM.md`.** Discovered `APPEND_SYSTEM.md` is appended to every role prompt even with `--no-context-files --no-rules`; explicit empty `--append-system-prompt=` suppresses it. User-level `~/.omp/agent/AGENTS.md` and `RULES.md` are also injected unless discovery is disabled/isolated.
+  7. **Preflight's overlay validation is a no-op** (open concern c-477404c672 confirmed): `omp --config <bad.yaml> --version` exits 0; a real turn fails parsing. Only actual session startup parses the overlay.
+  8. **A no-paid-model provider is feasible** (open concern c-ba416d7313): a throwaway `models.yml` custom provider (`api: openai-completions`) plus a local HTTP/SSE stub served omp requests; the stub captured exact system prompts. No paid model calls were made.
+
+  ---
+
+  ## 2. Source inventory
+
+  ### 2.1 Context files (injected into `<repo-rules>`)
+
+  | Source | Provider (priority) | Discovery scope | Root role behavior | omp `task` subagent behavior |
+  |---|---|---|---|---|
+  | `.omp/AGENTS.md` | `native` (100) | Nearest non-empty `.omp/` from cwd walking to repo root; does not continue past that `.omp` if the file is absent | Injected; wins same-depth shadowing | Dropped (basename `AGENTS.md`) |
+  | `AGENTS.md` | `agents-md` (10) | Every ancestor from cwd to repo root (plus enclosing workspace dirs under home, stopping before `$HOME`) | Injected; shadowed at same depth by higher-priority provider | Dropped (basename `AGENTS.md`) |
+  | `.claude/CLAUDE.md` | `claude` (80) | Launch cwd only | Injected | Inherited per omp session-type table |
+  | `CLAUDE.md` | `claude-md` (10) | Every ancestor cwd→repo root | Injected; shadowed by `.claude/CLAUDE.md` at same depth | Inherited per omp session-type table |
+  | `.agent/AGENTS.md`, `.agents/AGENTS.md` | `agents` (70) | Ancestor walk cwd→repo root; `.agent` wins over `.agents` at same level | Injected | Dropped (basename `AGENTS.md`) |
+  | `.github/copilot-instructions.md` | `github` (30) | Launch cwd only (+ user `~/.copilot/...`) | Injected | Not AGENTS.md; inherited unless renamed |
+  | `.gemini/GEMINI.md` | `gemini` (60) | Launch cwd only (+ user) | Injected | Inherited per omp session-type table |
+  | `contextFiles.extra` basenames, e.g. `AGENTS.local.md` | `custom-context` (9) | Basename walk like `AGENTS.md`; also active user agent dir; in a linked worktree also the primary checkout root | Additive; loads beside the scope winner, never shadows it | Kept (docs: extra files reach subagents) |
+  | `~/.omp/agent/AGENTS.md` (profile-aware) | `native` user | One user-level context file; native shadows other user files | Injected first | Dropped (basename `AGENTS.md`) |
+  | `SYSTEM.md`, `APPEND_SYSTEM.md` | prompt files, not context | Project-first `.omp`/`.claude`/`.codex`/`.gemini`, then user; direct search | Modify block 0 / append text; `--system-prompt` beats `SYSTEM.md`, not `APPEND_SYSTEM.md` | `APPEND_SYSTEM.md` not inherited |
+
+  ### 2.2 Rules (separate from context files)
+
+  | Source | Provider (priority) | Discovery scope | Bucket behavior |
+  |---|---|---|---|
+  | `.omp/rules/*.{md,mdc}` | `native` (100) | `<cwd>/.omp/rules` only; not ancestor `.omp/rules` | `alwaysApply: true` full content; `description` only → rulebook listing; `condition`/`astCondition`/`question` → TTSR |
+  | `<active-agent-dir>/rules/*.{md,mdc}` | `native` user (100) | User agent dir (`~/.omp/agent`, profile/PI_CODING_AGENT_DIR-aware) | Same bucketing |
+  | `.omp/RULES.md` | `native` sticky (100) | `RULES.md` in nearest non-empty project `.omp/` walking cwd→repo root; no fallback to a farther `.omp` | Forced always-apply, name `RULES@project`; full body on every request |
+  | `<active-agent-dir>/RULES.md` | `native` sticky user (100) | User agent dir | Forced always-apply, name `RULES` |
+  | `.cursor/rules/*.{mdc,md}` | `cursor` (50) | Project `<cwd>/.cursor/rules`; user `~/.cursor/rules` | `alwaysApply: true` → full content; otherwise rulebook if `description`/globs |
+  | `.cursorrules` (legacy) | `cursor` docs mention it, but the rulebook pipeline's Cursor source lists only `.cursor/rules/*` | Project root per docs | **Not observed in 18.18.5**: no content, no rulebook listing (probed with/without `read`) |
+  | `.windsurf/rules/*.md`, `~/.codeium/windsurf/memories/global_rules.md` | `windsurf` (50) | Project/user | Rules (always/rulebook/TTSR) |
+  | `.clinerules` file or directory | `cline` (40) | Nearest `.clinerules` from cwd | Rules |
+  | `.github/instructions/**/*.instructions.md` | `github` (30) | Project `.github/instructions` (+ configured dirs) | `applyTo` globs become rule globs; `*`/`**` become always-apply |
+  | Plugin `rules/` | `omp-plugins` (90) | Configured extension package roots | Rules |
+
+  > **Doc discrepancy:** `docs/context-files.md` says Cursor rules include legacy `.cursorrules`, but `docs/rulebook-matching-pipeline.md` lists only `.cursor/rules/*.{mdc,md}`, and the 18.18.5 probe confirms `.cursorrules` is ignored. Treat `.cursorrules` as unsupported/do not rely on it; use `.cursor/rules/*.mdc` with `alwaysApply: true`.
+
+  ---
+
+  ## 3. Precedence and composition
+
+  ### 3.1 Context files
+
+  - **User scope:** exactly one user context file survives; `native` (`~/.omp/agent/AGENTS.md`) shadows Claude/Codex/Gemini/opencode/GitHub/agents/agents-md user files.
+  - **Project scope:** one context file per directory depth. Depth 0 = cwd, parent = depth 1, etc. Higher provider priority wins at the same depth; different depths compose.
+  - **Provider priority (context files):** `native` 100 > `omp-plugins` 90 > `claude` 80 > `agent-plugins` 75 > `agents`/`claude-plugins`/`codex` 70 > `gemini` 60 > `opencode` 55 > `cursor`/`windsurf` 50 > `cline` 40 > `github` 30 > `vscode` 20 > `agents-md` 10 > `claude-md` 10 > `custom-context` 9 > `mcp-json`/`ssh-json` 5 > `builtin-defaults` 1.
+  - **Final order:** user file first, then project ancestors root→cwd; nearer files are last/more prominent. `contextFiles.extra` files are additive and injected after the scope winner at the same depth.
+  - **Containment collapse:** a farther ancestor is omitted when a closer file contains its entire normalized paragraph sequence contiguously (identical copies collapse).
+  - **Probe confirmations:** repo1 baseline shows `.claude/CLAUDE.md` (80) shadowing root `AGENTS.md`/`CLAUDE.md` (10); repo2 shows `.omp/AGENTS.md` (100) shadowing root `AGENTS.md`; repo3/repo4 show standalone `AGENTS.md`/`CLAUDE.md` loading alone; `sub_cwd` shows root + sub `AGENTS.md` composing root-first.
+
+  ### 3.2 Rules
+
+  - Dedup is **by rule name**, not path. Provider order: `native` 100 > `omp-plugins` 90 > `agents` 70 > `cursor` 50 > `windsurf` 50 > `cline` 40 > `github` 30 > `builtin-defaults` 1.
+  - A native `.omp/rules/always_cursor_shadow.md` shadows the same-named `.cursor/rules/always_cursor_shadow.md` (probed: cursor body absent).
+  - Bucket order: TTSR (`condition`/`astCondition`/`question`) > always-apply (`alwaysApply: true`, full content) > rulebook (`description`, listing only; body via `rule://`).
+  - `RULES.md` is always sticky regardless of frontmatter. Project and user files coexist as `RULES@project` / `RULES`.
+  - `.omp/rules/*` is cwd-scoped: starting in a subdirectory does **not** load the repo-root `.omp/rules` (probed `native_rules_subcwd`); root `RULES.md` still loads from the nearest non-empty `.omp`.
+  - `--no-rules` removes `RULES.md`, `.omp/rules` always-apply, cursor always-apply, and rulebook listings; context files remain.
+
+  ### 3.3 Settings layers
+
+  Effective precedence (highest first), from omp config docs: environment variable declared on the setting > runtime override > `--config` overlays (`PI_CONFIG_FILES` then repeated `--config`) > project settings (`.omp/config.yml`, `settings.json`) > global agent config (`<agent-dir>/config.yml`) > definition default. **Array settings replace, not merge** (e.g. `contextFiles.extra`, `disabledProviders`, `disabledExtensions`). Probe: project `.omp/config.yml` `contextFiles.extra: [TEAM.md]` loads `TEAM.md`; an overlay with `contextFiles.extra: []` removes it; `disabledExtensions: [context-file:project:AGENTS.md]` drops `AGENTS.md` while keeping `TEAM.md`.
+
+  ### 3.4 Context files vs rules
+
+  They are separate namespaces and both apply: context files land in `<repo-rules>`; rules land in the always-apply section or rulebook. `.omp/AGENTS.md` and `.omp/RULES.md` can both load. `--no-context-files` does not remove rules; `--no-rules` does not remove context files.
+
+  ---
+
+  ## 4. Injection mechanics and flag behavior
+
+  ### 4.1 Block layout
+
+  oMP builds ordered prompt blocks: static system-prompt block first, then one trailing `<project-context>` footer containing workstation data, `<repo-rules>`, `<dir-context>`, workspace data, final completion requirements, and append text. On Anthropic, the cache breakpoint is before the first `<project-context>` block, so context files (which differ per worktree) do not invalidate the static prompt prefix. Repo rules below the breakpoint are uncached/append-only.
+
+  `<repo-rules>` format (probed):
+  ```xml
+  <repo-rules>
+  MUST follow these context files for all tasks:
+  <file path="/abs/path/AGENTS.md">
+  ...expanded content...
+  </file>
+  </repo-rules>
+  ```
+
+  ### 4.2 Flag effects (probed)
+
+  | Invocation | Context files (`<repo-rules>`) | Rules `RULES.md`/always-apply | Rulebook (conditional/description) | Discovered `SYSTEM.md` | Discovered `APPEND_SYSTEM.md` |
+  |---|---|---|---|---|---|
+  | default | yes | yes, `<generic-rules>` | yes, `<domain-rules>` | used if present | used if present |
+  | `--system-prompt <file>` | yes (unchanged) | yes, prepended to block 0 | yes, `<rules>` in block 0 | suppressed | **still used** |
+  | `--no-context-files` | no | yes | yes | unaffected | still used |
+  | `--no-rules` | yes | no | no | unaffected | still used |
+  | both flags | no | no | no | unaffected | **still used** |
+  | `--append-system-prompt X` | unchanged | unchanged | unchanged | unaffected | X wins over discovered append |
+  | `--append-system-prompt=` (empty) | unchanged | unchanged | unchanged | unaffected | suppressed |
+  | `contextFiles.extra` overlay | adds files beside scope winner | unchanged | unchanged | unaffected | unaffected |
+  | `disabledExtensions: [context-file:...]` | drops that file | unchanged | unchanged | unaffected | unaffected |
+
+  ### 4.3 User-level prompt files
+
+  With a fresh `HOME`/agent dir, probes showed:
+  - User `AGENTS.md` in the active agent dir is injected before project context files.
+  - User `RULES.md` is injected into the rules section.
+  - User `APPEND_SYSTEM.md` is appended to every prompt, including a role `--system-prompt`, and survives `--no-context-files --no-rules`.
+  - User `SYSTEM.md` replaces block 0 when no `--system-prompt` is given; `--system-prompt` suppresses it.
+  - `--append-system-prompt=` (empty) is the only tested way to suppress discovered `APPEND_SYSTEM.md`.
+
+  Factory impact: `OmpHarness` inherits `process.env` and passes no `--profile`/`PI_CODING_AGENT_DIR`, so the operator's default `~/.omp/agent` files apply to every role unless M8 isolates or disables them (`harness.ts:406-409`).
+
+  ### 4.4 Resume behavior
+
+  Probe: turn 1 with repo3 `AGENTS.md` sentinel; edit `AGENTS.md` to a V2 sentinel; `--continue` turn 2. The resumed request's system prompt contained only the V2 sentinel in `<repo-rules>`; omp re-discovered and re-rendered the footer, while retaining the assistant/user history. The factory starts a fresh omp process per resumed turn, so repo rules are re-read each turn; changes are live. Static block 0 remains byte-stable, so the cacheable prefix is unaffected; only the trailing context footer changes.
+
+  ---
+
+  ## 5. Probe method and matrix
+
+  ### 5.1 Method
+
+  - omp `18.18.5`, clean env per run: `env -i PATH=... HOME=<tmp>/home PI_CODING_AGENT_DIR=<tmp>/agent TERM=dumb`.
+  - Throwaway git fixture repos under `/tmp` with unique sentinels in `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `.cursorrules`, `.cursor/rules/*.mdc`, `.omp/AGENTS.md`, `.omp/RULES.md`, `.omp/rules/*.md`, `AGENTS.local.md`, subdir `AGENTS.md`.
+  - Custom mock provider in the throwaway agent dir:
+  ```yaml
+  providers:
+    mock:
+      baseUrl: http://127.0.0.1:<port>/v1
+      api: openai-completions
+      apiKey: mock-key
+      authHeader: true
+      models:
+        - id: mock
+          name: Mock Model
+          api: openai-completions
+          reasoning: false
+          input: [text]
+          contextWindow: 128000
+          maxTokens: 1024
+          cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0}
+  ```
+  `modelRoles.default: mock/mock`, `title.generator: none`.
+  - Local Python HTTP server recorded every POST body and returned OpenAI Chat Completions SSE (`chat.completion.chunk`, `finish_reason: stop`, usage) or a scripted `task` tool call. No paid models.
+  - Each run used one request; `--no-tools --no-lsp --no-title` unless tools were under test. The captured system message is authoritative for injection.
+
+  ### 5.2 Matrix (sentinel presence)
+
+  | Run | Fixture / flags | Context files in `<repo-rules>` | Rules / rulebook | Verdict |
+  |---|---|---|---|---|
+  | baseline | repo1: root `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `.cursorrules`, `.cursor/rules/sentinel.mdc` (`alwaysApply`), `.omp/RULES.md`, `AGENTS.local.md` | `.claude/CLAUDE.md` only | `RULES.md` + cursor mdc in `<generic-rules>`; root AGENTS/CLAUDE shadowed; `.cursorrules` absent | Expected shadowing; context and rules separate |
+  | system_prompt | repo1 + `--system-prompt` role file | `.claude/CLAUDE.md` still present | `RULES.md` + cursor mdc prepended to block 0; role sentinel in block 0 | `--system-prompt` does not suppress repo injection |
+  | no_context_files | repo1 + `--no-context-files` | none | `RULES.md` + cursor mdc remain | Flag scopes context only |
+  | no_rules | repo1 + `--no-rules` | `.claude/CLAUDE.md` remains | none | Flag scopes rules only |
+  | extra | repo1 + overlay `contextFiles.extra: [AGENTS.local.md]` | `.claude/CLAUDE.md` + `AGENTS.local.md` | unchanged | Extra is additive beside the winner |
+  | extra_no_context | repo1 + extra + `--no-context-files` | none | rules remain | Extra is a context file |
+  | system_prompt_no_context | repo1 + role file + no context | none | rules prepended to block 0 | Single role copy + rules |
+  | native_shadow | repo2: root `AGENTS.md` + `.omp/AGENTS.md` + `.omp/RULES.md` | `.omp/AGENTS.md` only | `RULES.md` | Native shadows root AGENTS at depth 0 |
+  | agents_md_only | repo3: only `AGENTS.md` | `AGENTS.md` | none | Standalone AGENTS loads when not shadowed |
+  | claude_md_only | repo4: only `CLAUDE.md` | `CLAUDE.md` | none | Standalone CLAUDE via `claude-md` |
+  | cursorrules_only | repo5: only `.cursorrules` (plain and heading-rich) | none | none, even with `--tools=read` | Legacy `.cursorrules` ignored in 18.18.5 |
+  | cursor_conditional | repo6: `.cursor/rules/conditional.mdc` (globs, description, no alwaysApply) | none | `<domain-rules>` listing `conditional (src/**/*.ts): ...`; content not injected | Rulebook only |
+  | cursor_always | repo7: `.cursor/rules/always.mdc` (`alwaysApply: true`) + `.cursorrules` | none | always body in `<generic-rules>`; `.cursorrules` absent | `.mdc` works, legacy does not |
+  | sub_cwd | repo1 cwd `sub/` | root `AGENTS.md` + `sub/AGENTS.md` (root first, sub last) | `RULES.md` from root `.omp` | Ancestor walk composes; `.claude` launch-dir-only not loaded |
+  | sub_cwd_no_context | same + `--no-context-files` | none | `RULES.md` remains | Context only |
+  | native_rules | repo8: `.omp/rules/always.md`, `cond.md`, native `always_cursor_shadow.md`; cursor same-name rule; `.omp/RULES.md`; root AGENTS | root `AGENTS.md` | native always + native shadow + `RULES` in `<generic-rules>`; `cond` in `<domain-rules>`; cursor shadow body absent | Native rule wins by name; buckets work |
+  | native_rules_no_rules | repo8 + `--no-rules` | root `AGENTS.md` | none | Rules only |
+  | native_rules_subcwd | repo8 cwd `sub/` | root `AGENTS.md` + `sub/AGENTS.md` | `RULES.md` only; root `.omp/rules` absent | `.omp/rules` is cwd-scoped |
+  | dup_system_prompt | repo3 + role file containing root sentinel | root `AGENTS.md` | none | **2 copies** (block 0 + repo-rules) |
+  | dup_system_prompt_no_context | same + `--no-context-files` | none | none | 1 copy |
+  | dup_append | repo3 + `--append-system-prompt` containing root sentinel | root `AGENTS.md` | none | **2 copies** (repo-rules + append) |
+  | user_files_default | repo3, user agent `AGENTS.md`/`RULES.md`, user `SYSTEM.md`, user `APPEND_SYSTEM.md` | user AGENTS then project AGENTS | user RULES; SYSTEM replaces block 0; APPEND appended | User scope loads |
+  | user_files_custom_sp | same + `--system-prompt` | user AGENTS + project AGENTS | user RULES prepended to block 0; APPEND still appended; SYSTEM suppressed | APPEND bypasses `--system-prompt` |
+  | user_files_custom_sp_no_ctx_rules | same + both flags | none | none | APPEND **still appended** |
+  | user_files_custom_sp_empty_append | same + `--append-system-prompt=` | user+project AGENTS | user RULES | APPEND suppressed |
+  | project_config_extra | repo9: `.omp/config.yml` extra `TEAM.md`, root AGENTS | root AGENTS + TEAM.md | none | Project config extra works |
+  | project_extra_overlay_empty | repo9 + `--config` `contextFiles.extra: []` | root AGENTS only | none | Array replaces project list |
+  | project_disable_agents | repo9 + `disabledExtensions: [context-file:project:AGENTS.md]` | TEAM.md only | none | Single-file disable works |
+  | resume_refresh | repo3 turn 1 → edit AGENTS.md → `--continue` turn 2 | turn 1 old; turn 2 V2 only | none | Context re-discovered each process; static prefix stable |
+  | task_subagent_attempt | repo3 + `--tools=task`, scripted `task` tool call | parent only | parent only | Inconclusive: omp returned `Spawned agent ...` and `-p` exited before the subagent made a provider request; docs cover the drop behavior, M8 must verify |
+  | preflight_overlay | bad YAML + `omp --config bad --version` | — | — | **exit 0** (no parse); same overlay on a real turn exits 1 with parse error |
+
+  ---
+
+  ## 6. Per-role hydration seams
+
+  | Role | cwd | System prompt (`--system-prompt`) | Step prompt (`-p @file`) | Repo rules source |
+  |---|---|---|---|---|
+  | architect | task worktree (`iteration.ts:1226-1236`, `1452`, `3133`, `3889`) | `agents/architect.md` body (frontmatter stripped) | `agents/steps/architect-plan.md`, `architect-consult-*.md`, `architect-wave-report.md`, `architect-revise.md`, `architect-closeup.md` | task-worktree `AGENTS.md`/`.omp/AGENTS.md`/`RULES.md`/`.omp/rules`/`.claude` etc. |
+  | developer | item worktree (`item-machine.ts:946-970`) | `agents/developer.md` body | `agents/steps/test-first.md`, `develop.md`, `fix-round.md`, `simple-implement.md`, `poc.md` | item-worktree files |
+  | qa | item worktree | `agents/qa.md` body | `agents/steps/qa.md` | item-worktree files |
+  | reviewer | item worktree | `agents/reviewer.md` body | `agents/steps/review.md`, `plan-review.md` | item-worktree files |
+  | plan-reviewer / PM / wave-close-up / plan-close-up | task worktree | corresponding `agents/*.md` | corresponding `agents/steps/*.md` | task-worktree files |
+
+  Seams and code refs:
+  - **Role definition → block 0:** `extractAgentBody(run.definition)` writes `{runtimeDir}/system-prompts/<agent>-<session>.md`; `runAttempt` passes `--system-prompt <path>` (`harness.ts:71-73, 291-300, 387`). `agentDefinition()` resolves `{{> partial}}` includes (`prompts.ts:282-345`).
+  - **Step prompt → user message:** `step-runner.ts:545-550` renders the fragment with vars/schema; `harness.ts:386-388` passes `-p @<promptPath>`.
+  - **cwd → omp discovery root:** `runAttempt` passes `--cwd run.cwd` (`harness.ts:367-374`). Architect/task roles use task worktree; developer/qa/reviewer use item worktree (`step-runner.ts:92`, `item-machine.ts:960`).
+  - **Overlay:** one `{runtimeDir}/omp-overlay.yaml` per harness/runtime, regenerated from pipeline (`harness.ts:205-263`, `overlay.ts:26-100`). It currently contains only model roles/retry/unattended switches; no `contextFiles`/`disabledExtensions`/`disabledProviders` keys.
+  - **Environment:** `spawn(..., { env: { ...process.env, ...tmpEnv } })` (`harness.ts:406-409`); no `--profile`, no `PI_CODING_AGENT_DIR` isolation, so operator-level `~/.omp/agent/{AGENTS.md,RULES.md,APPEND_SYSTEM.md}` applies to every role.
+  - **Resume:** `--resume`/`--session-dir` (`harness.ts:374-380`); system prompt file path is deterministic per agent+session, content byte-stable. omp re-renders the context footer on the new process; repo-rule edits are picked up on the next turn without changing block 0.
+
+  ### 6.1 Spec line 113 — repo rules hydration
+
+  `docs/factory.v2.md:113` says: omp does not put `AGENTS.md` in subagent context, so the factory hydrates repo rules itself, and architect + developer/qa/reviewer must receive the target repo's rules, verified end-to-end. Interpretation from probes:
+  - **Root role processes already receive them.** Do not add a second copy; that would double-inject.
+  - **omp task subagents (scouts) drop AGENTS.md** by basename but keep `RULES.md` and `contextFiles.extra`. For rules that must reach scouts, use `.omp/RULES.md`/extras, or pass the rules through the `task` tool's `context` field (factory-side hydration at the delegation seam).
+  - **Worktree determinism:** rules come from the cwd's files. A worktree only has rules committed on its branch; rules changed after an item branch was cut are not present until merged. If rules must be live across all worktrees, sync them at wave starts or commit them before branching.
+
+  ---
+
+  ## 7. M8 verification plan (probe agents quote sentinel)
+
+  ### 7.1 Deterministic request-body checks (CI, no paid models)
+
+  1. Build a tar/zip throwaway fixture repo with unique sentinels in every source: root `AGENTS.md`, `.omp/AGENTS.md`, `.omp/RULES.md`, `.omp/rules/always.md`, `.omp/rules/cond.md`, `.cursor/rules/always.mdc`, `AGENTS.local.md`, nested `AGENTS.md`, user agent `AGENTS.md`/`RULES.md`/`APPEND_SYSTEM.md`.
+  2. Configure the mock provider (recipe §5.1) to record each request body to NDJSON and return a scripted final response (or `yield` tool call).
+  3. Run the real factory through the real `OmpHarness` for each role: architect, developer, qa, reviewer (and plan-reviewer/PM). For each captured role request, assert:
+     - expected repo sentinel appears **exactly once** in `messages[role=system]`;
+     - it appears in `<repo-rules>` (context) or the rules section according to source;
+     - shadowed/disabled sentinels do **not** appear;
+     - user-level sentinel appears only when isolation/disabledExtensions policy allows it;
+     - `APPEND_SYSTEM.md` sentinel appears only when expected; when strict determinism is desired, `--append-system-prompt=` suppresses it.
+  4. Repeat with `--system-prompt` containing a copy of repo text: assert count == 1 in production mode; count == 2 in a deliberate negative test.
+  5. Run with `--no-context-files`, `--no-rules`, and both: assert exact presence matrix from §4.2.
+  6. Resume test: turn 1, edit `AGENTS.md`, turn 2 via `--resume`; assert the V2 sentinel is present exactly once and the static block 0 is unchanged.
+  7. Cache test: capture system prompts for two item worktrees with different repo rules; assert the bytes before `<project-context>` are identical (static prefix cache preserved).
+
+  ### 7.2 Live probe agents (optional cheap model)
+
+  Give each role a test-only step prompt: `Quote every repository rule sentinel you can see, exactly once, with its source path.` Assert the answers contain the expected sentinels and no shadowed ones. Run for architect (task worktree), developer/qa/reviewer (item worktree), and a scout spawned via `task`:
+  - root roles: AGENTS sentinel present;
+  - scout: AGENTS sentinel absent; `RULES.md` sentinel present; if the factory passes rules via `task` `context`, that copy present once.
+
+  ### 7.3 Acceptance
+
+  M1/M8 passes when: every root role request contains the target repo's active context/rules exactly once; precedence/shadowing matches §3; disabled flags produce the §4.2 matrix; scouts have RULES/extra but not AGENTS; no user-level contamination under the chosen isolation policy; static prompt prefix remains byte-identical across worktrees.
+
+  ---
+
+  ## 8. Risks and follow-ups
+
+  1. **User-level prompt leakage (medium/high):** `APPEND_SYSTEM.md` applies to every role even with `--system-prompt` and both disable flags; user `AGENTS.md`/`RULES.md` also apply. If M8 wants deterministic role prompts, add explicit `--append-system-prompt=` and either isolate the profile/agent dir or disable user context sources. (`harness.ts:406-409`)
+  2. **Double injection if M8 copies repo rules (medium):** omp root sessions already inject; a factory-side copy yields 2 occurrences. Keep omp as sole injector, or disable discovery when injecting.
+  3. **Scout rule visibility (medium):** `AGENTS.md` does not reach omp `task` subagents; put hard rules in `.omp/RULES.md`/`contextFiles.extra` or delegation `context`.
+  4. **Worktree rule snapshots (medium):** item worktrees see only rules committed on their branch; mid-task rule changes can diverge. Decide sync policy at wave/item creation.
+  5. **cwd-scoped sources (low/medium):** `.omp/rules` and `.claude/CLAUDE.md` are cwd-only; roles launched from nested dirs would miss root copies. Factory currently launches from worktree roots; preserve that.
+  6. **Legacy `.cursorrules` (low):** documented but not loaded in 18.18.5; use `.cursor/rules/*.mdc`.
+  7. **Per-role extras (low):** one shared overlay per runtime; role-specific `contextFiles.extra` needs per-role overlay support or role definitions.
+  8. **Preflight overlay check (confirmed no-op):** replace `--config --version` with a real throwaway omp turn against the mock provider (or another command that actually parses the overlay) before declaring config compatible.
+
+  ---
+
+  ## 9. Full draft — `plugins/software-factory/docs/spikes/omp-6-repo-rules.md`
+
+  ```markdown
+  # Software-Factory v2: OMP Repo Rules & Injection Spike (M1)
+
+  This report is empirical verification of how omp discovers repository rules and context files, how the factory's per-role prompts interact with that injection, and what the factory should do for the M1 `omp-workspaces` repo-rules requirement. Tested against `omp 18.18.5` on Linux x86_64 WSL2 with throwaway git fixtures and a local OpenAI-compatible mock provider. No paid models were used; no production files were changed.
+
+  ## 1. Verdicts
+
+  ### 1.1 Root omp sessions inject repo rules automatically — **VERIFIED**
+
+  `omp --cwd <repo> --system-prompt <role-body>` still emits a trailing `<project-context>` footer with `<repo-rules>` and injects rules. `--system-prompt` replaces only block 0; it does not suppress context files, `RULES.md`, always-apply rules, or the rulebook listing.
+
+  ### 1.2 Current factory has no double injection — **VERIFIED**
+
+  Factory roles are root omp processes; their `--system-prompt` contains only the agent definition body. Repo rule text is absent from all role/step prompt assets. Each active sentinel appeared exactly once in captured provider requests.
+
+  ### 1.3 Copying rules into role prompts double-injects — **VERIFIED**
+
+  A role system prompt containing the same repo text produced 2 sentinel occurrences (block 0 + `<repo-rules>`). `--append-system-prompt` with the same text produced 2 (repo-rules + append). If M8 injects engine-rendered rules, it MUST disable omp discovery for that run.
+
+  ### 1.4 The spec's subagent premise is about scouts — **VERIFIED BY DOCS, NOT LIVE**
+
+  oMP task subagents drop every context file named `AGENTS.md` by basename; they keep `RULES.md` and `contextFiles.extra`. Root role sessions do not drop AGENTS.md. The factory's architect/developer/qa/reviewer are root processes, so they already receive AGENTS.md. Scouts (`task`) do not; use RULES.md/extra/delegation context for them.
+
+  ### 1.5 Preflight overlay validation is a no-op — **VERIFIED (critical)**
+
+  `omp --config <bad.yaml> --version` exits 0. The same overlay on a real turn fails with `Failed to parse config overlay`. The current preflight check (`preflight.ts:364-393`) proves the binary exists, not that the overlay is valid.
+
+  ### 1.6 No-paid-model mock provider is feasible — **VERIFIED**
+
+  A throwaway `models.yml` custom provider (`api: openai-completions`, `apiKey` literal, `authHeader: true`) plus a local HTTP/SSE stub returned scripted responses and recorded exact request bodies. This is a viable basis for M8's scripted mock model provider.
+
+  ## 2. Source and precedence summary
+
+  ### 2.1 Context files (`<repo-rules>`)
+
+  | Source | Provider priority | Scope |
+  |---|---|---|
+  | `.omp/AGENTS.md` | native 100 | nearest non-empty `.omp` walking cwd→repo root; no farther fallback |
+  | `AGENTS.md` | agents-md 10 | every ancestor cwd→repo root (and enclosing workspace dirs under home) |
+  | `.claude/CLAUDE.md` | claude 80 | launch cwd only |
+  | `CLAUDE.md` | claude-md 10 | every ancestor cwd→repo root |
+  | `.agent/AGENTS.md`, `.agents/AGENTS.md` | agents 70 | ancestor walk; `.agent` wins same level |
+  | `.github/copilot-instructions.md` | github 30 | launch cwd only |
+  | `.gemini/GEMINI.md` | gemini 60 | launch cwd only |
+  | `contextFiles.extra` basenames | custom-context 9 | walk like AGENTS.md; additive; also user agent dir and primary checkout root in linked worktrees |
+
+  One user context file survives by provider priority; one project file per depth; higher priority shadows at the same depth; different depths compose root→cwd (nearer last, more prominent). `contextFiles.extra` is additive and never takes the scope slot. Final injection is one `<repo-rules>` block in the trailing `<project-context>` footer, with absolute paths and expanded `@` imports.
+
+  ### 2.2 Rules
+
+  | Source | Provider priority | Scope / bucket |
+  |---|---|---|
+  | `.omp/rules/*.{md,mdc}` | native 100 | `<cwd>/.omp/rules` only; always-apply / rulebook / TTSR |
+  | `<agent-dir>/rules/*` | native 100 | user; same buckets |
+  | `.omp/RULES.md` | native 100 sticky | nearest project `.omp`; forced always-apply (`RULES@project`) |
+  | `<agent-dir>/RULES.md` | native 100 sticky | user; forced always-apply (`RULES`) |
+  | `.cursor/rules/*.{mdc,md}` | cursor 50 | project `<cwd>/.cursor/rules`, user `~/.cursor/rules`; alwaysApply or rulebook |
+  | `.cursorrules` | — | **not observed in 18.18.5**; do not rely on it |
+  | `.windsurf/rules/*.md` | windsurf 50 | project; rules |
+  | `.clinerules` | cline 40 | nearest; rules |
+  | `.github/instructions/**/*.instructions.md` | github 30 | applyTo rules |
+  | plugin `rules/` | omp-plugins 90 | extension packages |
+
+  Rules dedup by name: native > omp-plugins > agents > cursor/windsurf > cline > github > builtin. Bucket order: TTSR > alwaysApply (full content) > rulebook (description listing; body via `rule://`). `--no-rules` removes all of them; `--no-context-files` removes none.
+
+  ### 2.3 Settings layers
+
+  Environment > runtime > `--config` overlays > project `.omp/config.yml` > global `<agent-dir>/config.yml` > default. Arrays replace; they do not merge. `disabledExtensions: [context-file:<level>:<basename>]` drops a single context file; `disabledProviders` removes a whole discovery source.
+
+  ## 3. Injection behavior
+
+  - Context files: `<repo-rules>` in `<project-context>` footer; static system block comes first, so worktree-specific rules sit below the Anthropic cache breakpoint.
+  - Rules with default prompt: full always-apply content in `<generic-rules>`; conditional/described rules in `<domain-rules>` as name/description/globs pointers.
+  - Rules with `--system-prompt`: always-apply content is prepended to block 0; rulebook renders as `<rules>` in block 0.
+  - `--system-prompt` suppresses discovered `SYSTEM.md` but **not** `APPEND_SYSTEM.md`, context files, or rules.
+  - `--no-context-files` disables context files only; `--no-rules` disables rules only; both are needed to disable both.
+  - Discovered `APPEND_SYSTEM.md` is appended even with both flags and a custom system prompt; explicit empty `--append-system-prompt=` suppresses it.
+
+  ## 4. Probe matrix (condensed)
+
+  | Probe | Result |
+  |---|---|
+  | repo1 baseline (root AGENTS, CLAUDE, .claude/CLAUDE, .cursorrules, .cursor/rules always, .omp/RULES, AGENTS.local) | `<repo-rules>` = `.claude/CLAUDE.md`; rules = `RULES.md` + cursor always; root AGENTS/CLAUDE shadowed; `.cursorrules` absent |
+  | + `--system-prompt` | role text + rules in block 0; `<repo-rules>` still `.claude/CLAUDE.md` |
+  | + `--no-context-files` | no `<repo-rules>`; rules remain |
+  | + `--no-rules` | `<repo-rules>` remains; rules gone |
+  | + extra overlay `AGENTS.local.md` | `.claude/CLAUDE.md` + `AGENTS.local.md` |
+  | repo2 `.omp/AGENTS.md` + root AGENTS | `.omp/AGENTS.md` only; root shadowed |
+  | repo3 only AGENTS.md | `AGENTS.md` injected |
+  | repo4 only CLAUDE.md | `CLAUDE.md` injected |
+  | repo5 only `.cursorrules` | nothing, even with `read` |
+  | repo6 conditional `.mdc` | `<domain-rules>` listing only |
+  | repo7 always `.mdc` + `.cursorrules` | always body injected; `.cursorrules` absent |
+  | cwd `sub/` | root + sub AGENTS (root first); root `.omp/RULES.md`; root `.claude` not loaded |
+  | repo8 native rules + same-name cursor | native body wins; cursor body absent; conditional in `<domain-rules>` |
+  | cwd `sub/` of repo8 | root `.omp/rules` not loaded; root RULES still loaded |
+  | duplicate role prompt | sentinel count 2; with `--no-context-files` count 1 |
+  | duplicate append | sentinel count 2 |
+  | user AGENTS/RULES/SYSTEM/APPEND | all load; APPEND survives both disable flags; empty append suppresses |
+  | project config extra + overlay empty / disabledExtensions | project extra loads; overlay `[]` removes; disabled file drops while extra stays |
+  | resume after editing AGENTS.md | new system footer contains V2 only; history retained |
+  | preflight bad overlay + `--version` | exit 0; real turn parse error |
+
+  ## 5. Role hydration seams
+
+  - `--system-prompt` = `agents/<role>.md` body (frontmatter stripped, shared partials resolved).
+  - `-p @<prompt>` = rendered `agents/steps/<step>.md` with prompt vars/schema.
+  - `--cwd` = task worktree for architect/plan-reviewer/PM/close-ups; item worktree for developer/qa/reviewer. That cwd is the omp discovery root.
+  - One shared `{runtimeDir}/omp-overlay.yaml`; currently no context/rules keys.
+  - Inherited `HOME`/agent dir means user-level `AGENTS.md`/`RULES.md`/`APPEND_SYSTEM.md` apply to every role.
+
+  ## 6. M8 plan
+
+  1. Keep omp auto-discovery as the repo-rules injector for root roles; do not copy rule text into role definitions or step prompts.
+  2. Add a pipeline/overlay knob for `contextFiles.extra` (array of basenames) and, if needed, `disabledExtensions` for user-level contamination.
+  3. For rules that scouts must follow, use `.omp/RULES.md` or `contextFiles.extra`, or pass them in the `task` tool `context` field; AGENTS.md alone is invisible to scouts.
+  4. Add a mock-provider test harness that records request bodies; assert sentinel counts per role, precedence, flags, resume refresh, and cache-prefix stability.
+  5. Optionally run a cheap live probe where each role quotes sentinels; assert root roles see AGENTS and scouts do not (unless RULES/extra/context carries them).
+  6. If engine-side hydration is ever chosen, launch with `--no-context-files --no-rules --append-system-prompt=` and assert count == 1.
+  7. Replace preflight's `--config --version` with a real throwaway turn against the mock provider.
+
+  ## 7. Recommendations
+
+  - **Use omp-native injection** (recommended): no double injection, no rule-text duplication, cache-friendly (rules in the trailing footer below the cache breakpoint).
+  - **Do not rely on `.cursorrules`** in omp 18.18.5; use `.cursor/rules/*.mdc` with `alwaysApply: true`.
+  - **Put hard repo rules in `.omp/RULES.md`** if scouts must see them; keep AGENTS.md for the broader root-session guidance.
+  - **Verify user-level prompt files** are intentional; suppress `APPEND_SYSTEM.md` with `--append-system-prompt=` for deterministic role prompts.
+  - **Pin/sync repo rules across worktrees** at item/wave creation if rule changes must be consistent.
+  ```
+
+  ---
+
+  ## 10. Draft decision YAML
+
+  ```yaml
+  status: accepted
+  decision: |
+    Sources: omp 18.18.5 discovers context files from cwd: `.omp/AGENTS.md` (native, nearest non-empty .omp),
+    standalone `AGENTS.md` (agents-md, ancestor walk), `CLAUDE.md`/`.claude/CLAUDE.md`,
+    `.agent(s)/AGENTS.md`, `.github/copilot-instructions.md`, `.gemini/GEMINI.md`, and
+    `contextFiles.extra` basenames (additive, custom-context). Rules are separate: `.omp/rules/*.{md,mdc}`
+    (cwd .omp only), `<agent-dir>/rules/*`, sticky `RULES.md` (user + nearest project .omp), `.cursor/rules/*.{mdc,md}`
+    (legacy `.cursorrules` was not discovered), `.windsurf/rules`, `.clinerules`, `.github/instructions/**/*.instructions.md`,
+    and plugin rules.
+    Precedence: context files keep one user file and one project file per depth, by provider priority
+    native(100) > claude(80) > agents/codex(70) > gemini(60) > opencode(55) > cursor/windsurf(50) > cline(40) >
+    github(30) > agents-md/claude-md(10) > custom-context(9), then compose root→cwd with nearer files last;
+    extras are additive and never shadow. Rules dedupe by name with native(100) > omp-plugins(90) > agents(70) >
+    cursor/windsurf(50) > cline(40) > github(30), then bucket TTSR > alwaysApply > rulebook. Settings layers:
+    env > runtime > --config overlay > project .omp/config.yml > global agent config > default; arrays replace.
+    Double injection: current factory code injects repo rules exactly once (omp root-session discovery);
+    `--system-prompt` only replaces block 0 and does not suppress `<repo-rules>` or always-apply rules.
+    Copying repo context/rules into the role system prompt or step prompt while discovery remains enabled
+    produced two copies in probes (block 0 + `<repo-rules>`). Verdict: keep omp as the sole injector for root
+    roles; do not duplicate repo-rule text in factory prompts. The spec's AGENTS.md/subagent limitation applies
+    to omp task subagents (scouts), which drop AGENTS.md but keep RULES.md and contextFiles.extra; use those
+    channels (or the task context field) for scout-visible rules. If engine-side injection is chosen, launch
+    with `--no-context-files --no-rules --append-system-prompt=` and verify a single copy.
+  sources:
+    - "docs/factory.v2.md:104-118 (items 19-20, incl. repo-rules hydration at 113)"
+    - "plugins/software-factory/docs/OMP_ADAPTER.md:55-63,163-168"
+    - "plugins/software-factory/docs/ARCHITECTURE.md:40"
+    - "plugins/software-factory/src/harness/omp/harness.ts:71-73,205-263,287-300,367-388,406-409"
+    - "plugins/software-factory/src/harness/omp/overlay.ts:26-100"
+    - "plugins/software-factory/src/cli/preflight.ts:364-393"
+    - "plugins/software-factory/src/core/flows/step-runner.ts:545-550,814-826"
+    - "plugins/software-factory/src/core/flows/iteration.ts:1226-1236,1452,3133,3889"
+    - "plugins/software-factory/src/core/flows/item-machine.ts:946-970"
+    - "plugins/software-factory/agents/architect.md, developer.md, qa.md, reviewer.md"
+    - "https://omp.sh/docs/context-files"
+    - "https://github.com/can1357/oh-my-pi/blob/main/docs/context-files.md"
+    - "https://github.com/can1357/oh-my-pi/blob/main/docs/system-prompt-customization.md"
+    - "https://github.com/can1357/oh-my-pi/blob/main/docs/rulebook-matching-pipeline.md"
+    - "https://github.com/can1357/oh-my-pi/blob/main/docs/config-usage.md"
+    - "https://github.com/can1357/oh-my-pi/blob/main/docs/models.md"
+    - "https://omp.sh/docs/cli"
+  evidence:
+    - "omp 18.18.5 baseline probe: repo-rules = .claude/CLAUDE.md; rules = RULES.md + .cursor/rules alwaysApply; root AGENTS.md/CLAUDE.md shadowed at same depth; .cursorrules absent."
+    - "--system-prompt probe: role sentinel in block 0; .claude/CLAUDE.md still in <repo-rules>; RULES.md and cursor alwaysApply prepended to block 0."
+    - "--no-context-files removes <repo-rules> but keeps rules; --no-rules removes rules but keeps <repo-rules>."
+    - "contextFiles.extra overlay adds AGENTS.local.md beside the scope winner; --no-context-files removes it; project .omp/config.yml extra works and overlay [] replaces it."
+    - "repo2 .omp/AGENTS.md shadows root AGENTS.md; repo3 standalone AGENTS.md loads; repo4 standalone CLAUDE.md loads; repo5 .cursorrules ignored; repo8 native rule shadows same-name cursor rule."
+    - "subdir cwd composes root+sub AGENTS.md; root .omp/rules is not loaded from a subdir; root RULES.md is loaded."
+    - "duplicate probe: same repo sentinel in --system-prompt yields 2 occurrences; with --no-context-files yields 1; --append-system-prompt copy yields 2."
+    - "user-level probe: user AGENTS.md/RULES.md load; APPEND_SYSTEM.md survives --system-prompt, --no-context-files and --no-rules; --append-system-prompt= suppresses it; SYSTEM.md is suppressed by --system-prompt."
+    - "resume probe: edited AGENTS.md was re-discovered on the next --continue turn; system footer contained V2 only; static block 0 unchanged."
+    - "preflight probe: omp --config bad.yaml --version exit 0; real turn exit 1 with 'Failed to parse config overlay'."
+    - "mock provider probe: throwaway models.yml + local OpenAI-compatible SSE stub captured full request bodies with no paid model calls."
+    - "Docs: task subagents drop AGENTS.md but keep RULES.md/contextFiles.extra; system-prompt --system-prompt/--append precedence; rule provider/bucket lists; settings layer order."
+  followUps:
+    - "M8: implement M1 repo-rules verification against omp auto-discovery; do not copy repo rules into role prompts; assert exactly one sentinel per root role."
+    - "M8: choose a user-level contamination policy (profile/PI_CODING_AGENT_DIR isolation and/or disabledExtensions) and suppress APPEND_SYSTEM.md with --append-system-prompt= for deterministic role prompts."
+    - "M8: expose contextFiles.extra/disabledExtensions in the generated overlay; consider per-role overlay only if role-specific extras are required."
+    - "M8: verify scout behavior with a live task tool call: AGENTS.md absent, RULES.md/extra present; optionally pass rules through task context."
+    - "M8: replace preflight's --config --version check with a real throwaway turn using the mock provider (or another overlay-parsing command)."
+    - "M8: build the scripted mock provider test helper (request recorder + SSE text/yield responses) for no-paid-model E2E tests."
+    - "M8: add tests for context shadowing, rule-name shadowing, flags, resume refresh, and static-prefix cache stability across worktrees."
+    - "Docs: do not document legacy .cursorrules as supported in omp 18.18.5; point users to .cursor/rules/*.mdc."
+  ```
+
+  ---
+
+  ## 11. Sources
+
+  **Repository**
+  - `docs/factory.v2.md:104-118` — items 19-20, incl. repo-rules hydration at line 113.
+  - `plugins/software-factory/docs/OMP_ADAPTER.md:55-63` — overlay generation; `:163-168` — prompt-cache safety.
+  - `plugins/software-factory/docs/ARCHITECTURE.md:40` — item 19 status/current state.
+  - `plugins/software-factory/src/harness/omp/harness.ts:71-73` — `extractAgentBody`; `:205-263` — runtime dirs/overlay; `:287-300` — system-prompt file; `:367-388` — omp args; `:406-409` — inherited env.
+  - `plugins/software-factory/src/harness/omp/overlay.ts:26-100` — generated overlay keys (no context/rules keys).
+  - `plugins/software-factory/src/cli/preflight.ts:364-393` — overlay `--version` check.
+  - `plugins/software-factory/src/core/flows/step-runner.ts:545-550,814-826` — prompt render + AgentRun definition.
+  - `plugins/software-factory/src/core/prompts.ts:282-345` — agent definition include resolution.
+  - `plugins/software-factory/src/core/flows/iteration.ts:1226-1236,1452,3133,3889` — architect/task-worktree roles.
+  - `plugins/software-factory/src/core/flows/item-machine.ts:946-970` — item steps run in `childWt`.
+  - `plugins/software-factory/config/pipeline.default.yaml:108-131,240-280` — role cwd/flows.
+  - `plugins/software-factory/agents/{architect,developer,qa,reviewer}.md` — role definitions.
+
+  **omp documentation**
+  - Context files: https://omp.sh/docs/context-files ; https://github.com/can1357/oh-my-pi/blob/main/docs/context-files.md
+  - System prompt customization: https://github.com/can1357/oh-my-pi/blob/main/docs/system-prompt-customization.md
+  - Rulebook matching pipeline: https://github.com/can1357/oh-my-pi/blob/main/docs/rulebook-matching-pipeline.md
+  - Config layers: https://github.com/can1357/oh-my-pi/blob/main/docs/config-usage.md
+  - Custom providers/models: https://github.com/can1357/oh-my-pi/blob/main/docs/models.md
+  - CLI flags (`--no-rules`, `--no-context-files`, `--system-prompt`, `--append-system-prompt`): https://omp.sh/docs/cli
+
+  **Version note:** docs from `main` may be newer than 18.18.5; where they disagree (legacy `.cursorrules`), the 18.18.5 probe is authoritative for this spike.
+contextPack: >-
+  omp 18.18.5 repo-rules/injection audit — key facts for M1/M8:
+
+  - Root omp sessions auto-inject context files into a trailing
+  `<project-context><repo-rules>` footer even with `--system-prompt`; rules are
+  separate (`RULES.md`/always-apply content; conditional rules as rulebook
+  listings).
+
+  - Factory roles are root omp processes: architect/plan-reviewer/PM/close-ups
+  run in task worktree; developer/qa/reviewer in item worktree. They already
+  receive repo rules once. Current code does not duplicate; no double injection
+  today.
+
+  - Double injection is guaranteed if M8 copies repo text into `--system-prompt`
+  or `--append-system-prompt` while discovery stays on: measured 2 occurrences.
+  Recommended: keep omp as sole injector. If engine-side injection:
+  `--no-context-files --no-rules --append-system-prompt=` and assert one copy.
+
+  - Sources: `.omp/AGENTS.md` native (nearest .omp), standalone
+  `AGENTS.md`/`CLAUDE.md` ancestor walk, `.claude/CLAUDE.md` launch-dir only,
+  `.agent(s)/AGENTS.md`, `.github/copilot-instructions.md`, `.gemini/GEMINI.md`,
+  `contextFiles.extra` (additive). Rules: `.omp/rules/*`, agent-dir rules,
+  `.omp/RULES.md` sticky, `.cursor/rules/*.mdc`, windsurf/cline/github/plugins.
+  Legacy `.cursorrules` NOT observed in 18.18.5.
+
+  - Context precedence: one user file; one project file per depth; native 100 >
+  claude 80 > agents/codex 70 > gemini 60 > ... > agents-md/claude-md 10 >
+  custom-context 9; compose root→cwd, nearer last; extras additive. Rules dedup
+  by name: native 100 > plugins 90 > agents 70 > cursor/windsurf 50 > cline 40 >
+  github 30; TTSR > alwaysApply > rulebook. Settings: env > runtime > --config
+  overlay > project .omp/config.yml > global > default; arrays replace.
+
+  - omp task subagents (scouts) drop AGENTS.md but keep RULES.md and
+  contextFiles.extra. Put hard rules scouts must see in `.omp/RULES.md`/extra or
+  delegation `context`.
+
+  - Resume in the factory's per-turn process model re-discovers context files;
+  edited AGENTS.md appeared on the next turn. Static block 0 stays stable; repo
+  rules sit below the Anthropic cache breakpoint, preserving the cacheable
+  prefix.
+
+  - Preflight overlay check `omp --config <bad> --version` exits 0 (no-op); real
+  turn fails. Mock provider via throwaway models.yml (`api: openai-completions`)
+  + local SSE stub captured full requests with no paid calls; use it for M8
+  tests.
+sources:
+  - docs/factory.v2.md:104-118
+  - plugins/software-factory/docs/OMP_ADAPTER.md:55-63
+  - plugins/software-factory/docs/OMP_ADAPTER.md:163-168
+  - plugins/software-factory/docs/ARCHITECTURE.md:40
+  - plugins/software-factory/src/harness/omp/harness.ts:71-73
+  - plugins/software-factory/src/harness/omp/harness.ts:205-263
+  - plugins/software-factory/src/harness/omp/harness.ts:287-300
+  - plugins/software-factory/src/harness/omp/harness.ts:367-388
+  - plugins/software-factory/src/harness/omp/harness.ts:406-409
+  - plugins/software-factory/src/harness/omp/overlay.ts:26-100
+  - plugins/software-factory/src/cli/preflight.ts:364-393
+  - plugins/software-factory/src/core/flows/step-runner.ts:545-550
+  - plugins/software-factory/src/core/flows/step-runner.ts:814-826
+  - plugins/software-factory/src/core/prompts.ts:282-345
+  - plugins/software-factory/src/core/flows/iteration.ts:1226-1236
+  - plugins/software-factory/src/core/flows/item-machine.ts:946-970
+  - plugins/software-factory/config/pipeline.default.yaml:108-131
+  - plugins/software-factory/config/pipeline.default.yaml:240-280
+  - plugins/software-factory/agents/architect.md
+  - plugins/software-factory/agents/developer.md
+  - plugins/software-factory/agents/qa.md
+  - plugins/software-factory/agents/reviewer.md
+  - https://omp.sh/docs/context-files
+  - https://github.com/can1357/oh-my-pi/blob/main/docs/context-files.md
+  - https://github.com/can1357/oh-my-pi/blob/main/docs/system-prompt-customization.md
+  - https://github.com/can1357/oh-my-pi/blob/main/docs/rulebook-matching-pipeline.md
+  - https://github.com/can1357/oh-my-pi/blob/main/docs/config-usage.md
+  - https://github.com/can1357/oh-my-pi/blob/main/docs/models.md
+  - https://omp.sh/docs/cli
+recommendations:
+  - "M8: treat omp root-session discovery as the repo-rules hydration mechanism;
+    do not copy repo rule text into role definitions or step prompts. Verify one
+    sentinel per role request."
+  - "M8: for rules that scouts must see, use `.omp/RULES.md` or
+    `contextFiles.extra` (omp task subagents drop AGENTS.md), or pass rules
+    through the `task` tool's `context` field."
+  - "M8: add `contextFiles.extra` and optional `disabledExtensions` to the
+    generated overlay; keep one overlay per runtime unless role-specific extras
+    justify per-role overlays."
+  - "M8: decide and test a user-level prompt policy: isolate the omp
+    profile/agent dir and/or disable user context files; use
+    `--append-system-prompt=` to suppress discovered `APPEND_SYSTEM.md` when
+    determinism is required."
+  - "M8: replace the preflight `omp --config <overlay> --version` check with a
+    real throwaway turn using the mock provider (or another overlay-parsing
+    path)."
+  - "M8: build the local mock-provider helper (throwaway models.yml + HTTP/SSE
+    stub) for request-body assertions and scripted `yield` responses; no paid
+    models."
+  - "M8: add behavior tests for context shadowing, rule-name shadowing,
+    `--no-context-files`/`--no-rules`, resume refresh, and static-prefix cache
+    stability across worktrees."
+  - "Document that legacy `.cursorrules` is not loaded in omp 18.18.5; use
+    `.cursor/rules/*.mdc` with `alwaysApply: true`."
+concerns:
+  - kind: risk
+    summary: User-level omp prompt files leak into every factory role;
+      `APPEND_SYSTEM.md` survives `--no-context-files` and `--no-rules`
+    detail: OmpHarness inherits process.env and passes no `--profile` or
+      `PI_CODING_AGENT_DIR` (harness.ts:406-409). A probe with a temp HOME/agent
+      dir showed user `AGENTS.md` and `RULES.md` injected, and user
+      `APPEND_SYSTEM.md` appended even with `--system-prompt` plus both disable
+      flags. Only an explicit empty `--append-system-prompt=` suppressed the
+      append. This can inject operator instructions into every
+      architect/developer/qa/reviewer turn and defeats deterministic role
+      prompts.
+    severity: high
+    location:
+      file: plugins/software-factory/src/harness/omp/harness.ts
+      line: 406
+    affects:
+      - "19.1"
+      - "19.2"
+      - M8 hydration
+  - kind: assumption
+    summary: Spec line 113's 'omp does not put AGENTS.md in subagent context' is
+      true for omp task subagents, not root role sessions
+    detail: The factory's architect/developer/qa/reviewer are root omp processes
+      launched with `--system-prompt`; probes show they already receive repo
+      AGENTS.md/CLAUDE.md/rules from cwd. Only omp `task` subagents (scouts)
+      drop AGENTS.md; they keep RULES.md and contextFiles.extra. Implementing a
+      second factory-side copy for root roles would double-inject (measured 2
+      copies).
+    severity: medium
+    location:
+      file: docs/factory.v2.md
+      line: 113
+    affects:
+      - M1 scenario 4
+      - M8 hydration
+  - kind: risk
+    summary: Repo rules in worktrees are branch snapshots; mid-task rule changes can
+      diverge across item worktrees
+    detail: omp resolves rules from the role's cwd files. An item worktree only has
+      rules committed on its branch; rules changed after the item branch was cut
+      are absent until merged. If M8 requires all roles in a wave to see the
+      same rules, sync/copy rule files at item/wave creation or define a
+      branch-snapshot policy.
+    severity: medium
+    location:
+      file: plugins/software-factory/src/core/flows/item-machine.ts
+      line: 960
+    affects:
+      - "19"
+      - M1 scenario 4
+  - kind: risk
+    summary: "Cwd-scoped sources: `.omp/rules` and `.claude/CLAUDE.md` are
+      launch-directory-only"
+    detail: "Probe: starting omp in `repo/sub` loaded root+sub `AGENTS.md` and root
+      `.omp/RULES.md`, but not root `.omp/rules` or root `.claude/CLAUDE.md`.
+      Factory roles currently launch from worktree roots; changing role cwd to a
+      package subdir would silently drop those sources."
+    severity: low
+    location:
+      file: plugins/software-factory/src/harness/omp/harness.ts
+      line: 367
+    affects:
+      - "19"
+  - kind: question
+    summary: Legacy `.cursorrules` is documented but not loaded in omp 18.18.5;
+      which source is authoritative?
+    detail: omp docs `context-files.md` mentions legacy `.cursorrules` rules, while
+      `rulebook-matching-pipeline.md` lists only `.cursor/rules/*.{mdc,md}`.
+      Probe with plain, heading-rich, and co-located `.cursorrules` produced no
+      injection or rulebook listing. Treat `.cursorrules` as unsupported for
+      18.18.5; revisit if omp changes.
+    severity: low
+    location:
+      file: plugins/software-factory/docs/OMP_ADAPTER.md
+      line: 163
+    affects:
+      - M1 scenario 4
+remarkable:
+  - chosen: Keep omp root-session discovery as the sole repo-rules injector; do not
+      duplicate rule text in factory role/step prompts
+    why: Probes show root omp sessions already inject `<repo-rules>` and rules even
+      with `--system-prompt`; a second copy produced two sentinel occurrences.
+      omp also places context in the trailing project-context footer, so
+      per-worktree rules do not break the static prompt cache prefix (important
+      for item 20).
+    alternatives:
+      - Engine-rendered rules injected into the role system prompt with
+        `--no-context-files --no-rules`
+      - "Hybrid: omp for root roles, engine copy for scouts"
+  - chosen: Use `.omp/RULES.md` / `contextFiles.extra` (or task `context`) for rules
+      that must reach scouts
+    why: omp task subagents drop every context file named AGENTS.md but keep
+      RULES.md and extra context files. Hard rules that scouts must follow
+      cannot live only in AGENTS.md.
+    alternatives:
+      - Put all rules in AGENTS.md and accept scout blindness
+      - Inject repo rules into every task tool `context` field
+  - chosen: Use a throwaway omp agent dir with a custom OpenAI-compatible
+      `models.yml` plus a local SSE stub for no-paid-model probes
+    why: "Demonstrated end-to-end: omp 18.18.5 sent full prompts to the stub, which
+      recorded exact system messages and returned scripted text; no credentials
+      or paid calls. This directly supports M8's scripted mock model provider
+      requirement."
+    alternatives:
+      - Live cheap models (paid, non-deterministic)
+      - omp SDK/in-process harness (heavier, different path than production)
diff --git a/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/002-review-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/002-review-r1-a1/input.md
new file mode 100644
index 0000000..7c5558f
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/002-review-r1-a1/input.md
@@ -0,0 +1,1830 @@
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
+  "slug": "spike-repo-rules",
+  "kind": "fact-finder",
+  "title": "Spike: repo-rules sources + omp injection audit",
+  "assignment": "Fact-finder spike, no prod code. 1) Enumerate rule/context sources (AGENTS.md/CLAUDE.md/.cursorrules/.omp/rules, root plus subdirs) and precedence via omp docs plus config inspection. 2) With a sentinel fixture repo (unique temp dir), probe root omp processes with and without --system-prompt and with/without contextFiles.extra and --no-context-files; record whether the sentinel is injected (double-injection risk). 3) Map per-role hydration seams (architect/developer/qa/reviewer prompt rendering) and define the M8 verification plan (probe agents quote sentinel). Outputs: items/{item}/findings.md with source/precedence table and probe matrix, full draft for plugins/software-factory/docs/spikes/omp-6-repo-rules.md, draft decision YAML {status, decision, evidence, followUps} stating sources, precedence, double-inject verdict. Constraints: read-only on repo prod paths; cwd=plugins/software-factory; throwaway profile/repos; hydration implementation deferred to M8. Acceptance: answers M1 repo-rules scenario.",
+  "outlineRef": "spike-repo-rules",
+  "milestone": "m1-omp-de-risk",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-omp-de-risk:scenario-4"
+  ],
+  "citations": [
+    "docs/factory.v2.md:104-113",
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
+diff --git a/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/input.md
+new file mode 100644
+index 0000000..5993ef2
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/input.md
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
++  "slug": "spike-repo-rules",
++  "kind": "fact-finder",
++  "title": "Spike: repo-rules sources + omp injection audit",
++  "assignment": "Fact-finder spike, no prod code. 1) Enumerate rule/context sources (AGENTS.md/CLAUDE.md/.cursorrules/.omp/rules, root plus subdirs) and precedence via omp docs plus config inspection. 2) With a sentinel fixture repo (unique temp dir), probe root omp processes with and without --system-prompt and with/without contextFiles.extra and --no-context-files; record whether the sentinel is injected (double-injection risk). 3) Map per-role hydration seams (architect/developer/qa/reviewer prompt rendering) and define the M8 verification plan (probe agents quote sentinel). Outputs: items/{item}/findings.md with source/precedence table and probe matrix, full draft for plugins/software-factory/docs/spikes/omp-6-repo-rules.md, draft decision YAML {status, decision, evidence, followUps} stating sources, precedence, double-inject verdict. Constraints: read-only on repo prod paths; cwd=plugins/software-factory; throwaway profile/repos; hydration implementation deferred to M8. Acceptance: answers M1 repo-rules scenario.",
++  "outlineRef": "spike-repo-rules",
++  "milestone": "m1-omp-de-risk",
++  "wave": 1,
++  "scenarioRefs": [
++    "m1-omp-de-risk:scenario-4"
++  ],
++  "citations": [
++    "docs/factory.v2.md:104-113",
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
++  "docs/factory.v2.md:104-113",
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
+diff --git a/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..a7b9e9a
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/meta.yaml
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
++startedAt: 2026-11-09T23:41:25.304Z
++session: 01a1c2b0-2538-749d-9c25-5a46df725a1d
++endedAt: 2026-11-09T23:58:39.102Z
++usage:
++  inputTokens: 171777
++  outputTokens: 89871
++  costUsd: 0.10315
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-09T23-41-26-200Z_01a1c2b0-2538-749d-9c25-5a46df725a1d.jsonl
+diff --git a/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/output.yaml
+new file mode 100644
+index 0000000..a3c1466
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/001-research-r1-a1/output.yaml
+@@ -0,0 +1,720 @@
++status: ok
++summary: "omp 18.18.5 root sessions auto-discover and inject repo context files
++  into a trailing <repo-rules> block even when --system-prompt is used, and
++  inject rules separately (RULES.md/always-apply in the prompt, conditional
++  rules as rulebook listings). Factory roles are root omp processes, so
++  architect/developer/qa/reviewer already receive repo rules exactly once;
++  current code does not double-inject. The spec's 'subagents drop AGENTS.md'
++  premise is true only for omp task subagents (scouts), not root roles: scouts
++  keep RULES.md and contextFiles.extra but drop every AGENTS.md. Probe matrix
++  (sentinel fixtures + local mock provider, omp 18.18.5) confirms sources,
++  precedence, flags, user-level leakage, resume re-rendering, and that copying
++  rules into --system-prompt produces two copies. Preflight overlay validation
++  via `omp --config ... --version` is a confirmed no-op; a local
++  OpenAI-compatible mock provider works for no-paid-model tests."
++findings: |-
++  # Spike findings — repo-rules sources + omp injection audit (M1 scenario 4)
++
++  **Status:** ok  
++  **Tested:** omp `18.18.5` (`/home/slava/.bun/bin/omp`), Linux x86_64 WSL2, 2026-11-09.  
++  **Scope:** read-only repository investigation; all probes ran in throwaway `/tmp` fixtures and a throwaway omp profile/agent dir; no production files changed. Hydration implementation is deferred to M8.
++
++  ---
++
++  ## 1. Bottom line (answers the M1 repo-rules scenario)
++
++  1. **Root omp sessions auto-inject repo rules.** With `--system-prompt <role-body>`, omp still emits the trailing `<project-context>` footer containing `<repo-rules>` (one `<file path=...>` per surviving context file), and still injects rules (`RULES.md`, always-apply rules; conditional rules as `<domain-rules>`/`<rules>` listings). `--system-prompt` replaces only block 0. Evidence: probe matrix §5; omp docs Context files / System prompt customization.
++  2. **Factory roles are root omp processes**, not omp `task` subagents: `OmpHarness.runAttempt` launches `omp --cwd <worktree> ... --system-prompt <role-body> -p @<step-prompt>` per role turn. Architect/plan-reviewer/PM run in the task worktree; developer/qa/reviewer run in the item worktree. All therefore receive repo rules from their cwd automatically.
++  3. **No double injection in current code.** Agent/step prompts contain no repo-rule text (`grep` over `agents/` and `src/core/prompts.ts` found no `AGENTS`/`CLAUDE`/`RULES.md` references), so omp is the sole injector. The expected repo sentinel appears exactly once per role request.
++  4. **Double injection is real if M8 copies rules into role prompts.** A role `--system-prompt` containing the same repo text produced **2 occurrences** of the sentinel (block 0 + `<repo-rules>`). `--append-system-prompt` containing it also produced 2. Clean single-copy options: rely on omp discovery (recommended), or launch with `--no-context-files --no-rules` when the engine injects its own block.
++  5. **The spec's AGENTS.md/subagent premise applies to scout subagents, not roles.** omp task subagents drop every context file named `AGENTS.md` by basename, but keep `RULES.md` and `contextFiles.extra` files. Root role sessions do not drop AGENTS.md. Put hard rules that scouts must see in `.omp/RULES.md` (or `contextFiles.extra`), not only in `AGENTS.md`.
++  6. **`--system-prompt` does not suppress user-level `APPEND_SYSTEM.md`.** Discovered `APPEND_SYSTEM.md` is appended to every role prompt even with `--no-context-files --no-rules`; explicit empty `--append-system-prompt=` suppresses it. User-level `~/.omp/agent/AGENTS.md` and `RULES.md` are also injected unless discovery is disabled/isolated.
++  7. **Preflight's overlay validation is a no-op** (open concern c-477404c672 confirmed): `omp --config <bad.yaml> --version` exits 0; a real turn fails parsing. Only actual session startup parses the overlay.
++  8. **A no-paid-model provider is feasible** (open concern c-ba416d7313): a throwaway `models.yml` custom provider (`api: openai-completions`) plus a local HTTP/SSE stub served omp requests; the stub captured exact system prompts. No paid model calls were made.
++
++  ---
++
++  ## 2. Source inventory
++
++  ### 2.1 Context files (injected into `<repo-rules>`)
++
++  | Source | Provider (priority) | Discovery scope | Root role behavior | omp `task` subagent behavior |
++  |---|---|---|---|---|
++  | `.omp/AGENTS.md` | `native` (100) | Nearest non-empty `.omp/` from cwd walking to repo root; does not continue past that `.omp` if the file is absent | Injected; wins same-depth shadowing | Dropped (basename `AGENTS.md`) |
++  | `AGENTS.md` | `agents-md` (10) | Every ancestor from cwd to repo root (plus enclosing workspace dirs under home, stopping before `$HOME`) | Injected; shadowed at same depth by higher-priority provider | Dropped (basename `AGENTS.md`) |
++  | `.claude/CLAUDE.md` | `claude` (80) | Launch cwd only | Injected | Inherited per omp session-type table |
++  | `CLAUDE.md` | `claude-md` (10) | Every ancestor cwd→repo root | Injected; shadowed by `.claude/CLAUDE.md` at same depth | Inherited per omp session-type table |
++  | `.agent/AGENTS.md`, `.agents/AGENTS.md` | `agents` (70) | Ancestor walk cwd→repo root; `.agent` wins over `.agents` at same level | Injected | Dropped (basename `AGENTS.md`) |
++  | `.github/copilot-instructions.md` | `github` (30) | Launch cwd only (+ user `~/.copilot/...`) | Injected | Not AGENTS.md; inherited unless renamed |
++  | `.gemini/GEMINI.md` | `gemini` (60) | Launch cwd only (+ user) | Injected | Inherited per omp session-type table |
++  | `contextFiles.extra` basenames, e.g. `AGENTS.local.md` | `custom-context` (9) | Basename walk like `AGENTS.md`; also active user agent dir; in a linked worktree also the primary checkout root | Additive; loads beside the scope winner, never shadows it | Kept (docs: extra files reach subagents) |
++  | `~/.omp/agent/AGENTS.md` (profile-aware) | `native` user | One user-level context file; native shadows other user files | Injected first | Dropped (basename `AGENTS.md`) |
++  | `SYSTEM.md`, `APPEND_SYSTEM.md` | prompt files, not context | Project-first `.omp`/`.claude`/`.codex`/`.gemini`, then user; direct search | Modify block 0 / append text; `--system-prompt` beats `SYSTEM.md`, not `APPEND_SYSTEM.md` | `APPEND_SYSTEM.md` not inherited |
++
++  ### 2.2 Rules (separate from context files)
++
++  | Source | Provider (priority) | Discovery scope | Bucket behavior |
++  |---|---|---|---|
++  | `.omp/rules/*.{md,mdc}` | `native` (100) | `<cwd>/.omp/rules` only; not ancestor `.omp/rules` | `alwaysApply: true` full content; `description` only → rulebook listing; `condition`/`astCondition`/`question` → TTSR |
++  | `<active-agent-dir>/rules/*.{md,mdc}` | `native` user (100) | User agent dir (`~/.omp/agent`, profile/PI_CODING_AGENT_DIR-aware) | Same bucketing |
++  | `.omp/RULES.md` | `native` sticky (100) | `RULES.md` in nearest non-empty project `.omp/` walking cwd→repo root; no fallback to a farther `.omp` | Forced always-apply, name `RULES@project`; full body on every request |
++  | `<active-agent-dir>/RULES.md` | `native` sticky user (100) | User agent dir | Forced always-apply, name `RULES` |
++  | `.cursor/rules/*.{mdc,md}` | `cursor` (50) | Project `<cwd>/.cursor/rules`; user `~/.cursor/rules` | `alwaysApply: true` → full content; otherwise rulebook if `description`/globs |
++  | `.cursorrules` (legacy) | `cursor` docs mention it, but the rulebook pipeline's Cursor source lists only `.cursor/rules/*` | Project root per docs | **Not observed in 18.18.5**: no content, no rulebook listing (probed with/without `read`) |
++  | `.windsurf/rules/*.md`, `~/.codeium/windsurf/memories/global_rules.md` | `windsurf` (50) | Project/user | Rules (always/rulebook/TTSR) |
++  | `.clinerules` file or directory | `cline` (40) | Nearest `.clinerules` from cwd | Rules |
++  | `.github/instructions/**/*.instructions.md` | `github` (30) | Project `.github/instructions` (+ configured dirs) | `applyTo` globs become rule globs; `*`/`**` become always-apply |
++  | Plugin `rules/` | `omp-plugins` (90) | Configured extension package roots | Rules |
++
++  > **Doc discrepancy:** `docs/context-files.md` says Cursor rules include legacy `.cursorrules`, but `docs/rulebook-matching-pipeline.md` lists only `.cursor/rules/*.{mdc,md}`, and the 18.18.5 probe confirms `.cursorrules` is ignored. Treat `.cursorrules` as unsupported/do not rely on it; use `.cursor/rules/*.mdc` with `alwaysApply: true`.
++
++  ---
++
++  ## 3. Precedence and composition
++
++  ### 3.1 Context files
++
++  - **User scope:** exactly one user context file survives; `native` (`~/.omp/agent/AGENTS.md`) shadows Claude/Codex/Gemini/opencode/GitHub/agents/agents-md user files.
++  - **Project scope:** one context file per directory depth. Depth 0 = cwd, parent = depth 1, etc. Higher provider priority wins at the same depth; different depths compose.
++  - **Provider priority (context files):** `native` 100 > `omp-plugins` 90 > `claude` 80 > `agent-plugins` 75 > `agents`/`claude-plugins`/`codex` 70 > `gemini` 60 > `opencode` 55 > `cursor`/`windsurf` 50 > `cline` 40 > `github` 30 > `vscode` 20 > `agents-md` 10 > `claude-md` 10 > `custom-context` 9 > `mcp-json`/`ssh-json` 5 > `builtin-defaults` 1.
++  - **Final order:** user file first, then project ancestors root→cwd; nearer files are last/more prominent. `contextFiles.extra` files are additive and injected after the scope winner at the same depth.
++  - **Containment collapse:** a farther ancestor is omitted when a closer file contains its entire normalized paragraph sequence contiguously (identical copies collapse).
++  - **Probe confirmations:** repo1 baseline shows `.claude/CLAUDE.md` (80) shadowing root `AGENTS.md`/`CLAUDE.md` (10); repo2 shows `.omp/AGENTS.md` (100) shadowing root `AGENTS.md`; repo3/repo4 show standalone `AGENTS.md`/`CLAUDE.md` loading alone; `sub_cwd` shows root + sub `AGENTS.md` composing root-first.
++
++  ### 3.2 Rules
++
++  - Dedup is **by rule name**, not path. Provider order: `native` 100 > `omp-plugins` 90 > `agents` 70 > `cursor` 50 > `windsurf` 50 > `cline` 40 > `github` 30 > `builtin-defaults` 1.
++  - A native `.omp/rules/always_cursor_shadow.md` shadows the same-named `.cursor/rules/always_cursor_shadow.md` (probed: cursor body absent).
++  - Bucket order: TTSR (`condition`/`astCondition`/`question`) > always-apply (`alwaysApply: true`, full content) > rulebook (`description`, listing only; body via `rule://`).
++  - `RULES.md` is always sticky regardless of frontmatter. Project and user files coexist as `RULES@project` / `RULES`.
++  - `.omp/rules/*` is cwd-scoped: starting in a subdirectory does **not** load the repo-root `.omp/rules` (probed `native_rules_subcwd`); root `RULES.md` still loads from the nearest non-empty `.omp`.
++  - `--no-rules` removes `RULES.md`, `.omp/rules` always-apply, cursor always-apply, and rulebook listings; context files remain.
++
++  ### 3.3 Settings layers
++
++  Effective precedence (highest first), from omp config docs: environment variable declared on the setting > runtime override > `--config` overlays (`PI_CONFIG_FILES` then repeated `--config`) > project settings (`.omp/config.yml`, `settings.json`) > global agent config (`<agent-dir>/config.yml`) > definition default. **Array settings replace, not merge** (e.g. `contextFiles.extra`, `disabledProviders`, `disabledExtensions`). Probe: project `.omp/config.yml` `contextFiles.extra: [TEAM.md]` loads `TEAM.md`; an overlay with `contextFiles.extra: []` removes it; `disabledExtensions: [context-file:project:AGENTS.md]` drops `AGENTS.md` while keeping `TEAM.md`.
++
++  ### 3.4 Context files vs rules
++
++  They are separate namespaces and both apply: context files land in `<repo-rules>`; rules land in the always-apply section or rulebook. `.omp/AGENTS.md` and `.omp/RULES.md` can both load. `--no-context-files` does not remove rules; `--no-rules` does not remove context files.
++
++  ---
++
++  ## 4. Injection mechanics and flag behavior
++
++  ### 4.1 Block layout
++
++  oMP builds ordered prompt blocks: static system-prompt block first, then one trailing `<project-context>` footer containing workstation data, `<repo-rules>`, `<dir-context>`, workspace data, final completion requirements, and append text. On Anthropic, the cache breakpoint is before the first `<project-context>` block, so context files (which differ per worktree) do not invalidate the static prompt prefix. Repo rules below the breakpoint are uncached/append-only.
++
++  `<repo-rules>` format (probed):
++  ```xml
++  <repo-rules>
++  MUST follow these context files for all tasks:
++  <file path="/abs/path/AGENTS.md">
++  ...expanded content...
++  </file>
++  </repo-rules>
++  ```
++
++  ### 4.2 Flag effects (probed)
++
++  | Invocation | Context files (`<repo-rules>`) | Rules `RULES.md`/always-apply | Rulebook (conditional/description) | Discovered `SYSTEM.md` | Discovered `APPEND_SYSTEM.md` |
++  |---|---|---|---|---|---|
++  | default | yes | yes, `<generic-rules>` | yes, `<domain-rules>` | used if present | used if present |
++  | `--system-prompt <file>` | yes (unchanged) | yes, prepended to block 0 | yes, `<rules>` in block 0 | suppressed | **still used** |
++  | `--no-context-files` | no | yes | yes | unaffected | still used |
++  | `--no-rules` | yes | no | no | unaffected | still used |
++  | both flags | no | no | no | unaffected | **still used** |
++  | `--append-system-prompt X` | unchanged | unchanged | unchanged | unaffected | X wins over discovered append |
++  | `--append-system-prompt=` (empty) | unchanged | unchanged | unchanged | unaffected | suppressed |
++  | `contextFiles.extra` overlay | adds files beside scope winner | unchanged | unchanged | unaffected | unaffected |
++  | `disabledExtensions: [context-file:...]` | drops that file | unchanged | unchanged | unaffected | unaffected |
++
++  ### 4.3 User-level prompt files
++
++  With a fresh `HOME`/agent dir, probes showed:
++  - User `AGENTS.md` in the active agent dir is injected before project context files.
++  - User `RULES.md` is injected into the rules section.
++  - User `APPEND_SYSTEM.md` is appended to every prompt, including a role `--system-prompt`, and survives `--no-context-files --no-rules`.
++  - User `SYSTEM.md` replaces block 0 when no `--system-prompt` is given; `--system-prompt` suppresses it.
++  - `--append-system-prompt=` (empty) is the only tested way to suppress discovered `APPEND_SYSTEM.md`.
++
++  Factory impact: `OmpHarness` inherits `process.env` and passes no `--profile`/`PI_CODING_AGENT_DIR`, so the operator's default `~/.omp/agent` files apply to every role unless M8 isolates or disables them (`harness.ts:406-409`).
++
++  ### 4.4 Resume behavior
++
++  Probe: turn 1 with repo3 `AGENTS.md` sentinel; edit `AGENTS.md` to a V2 sentinel; `--continue` turn 2. The resumed request's system prompt contained only the V2 sentinel in `<repo-rules>`; omp re-discovered and re-rendered the footer, while retaining the assistant/user history. The factory starts a fresh omp process per resumed turn, so repo rules are re-read each turn; changes are live. Static block 0 remains byte-stable, so the cacheable prefix is unaffected; only the trailing context footer changes.
++
++  ---
++
++  ## 5. Probe method and matrix
++
++  ### 5.1 Method
++
++  - omp `18.18.5`, clean env per run: `env -i PATH=... HOME=<tmp>/home PI_CODING_AGENT_DIR=<tmp>/agent TERM=dumb`.
++  - Throwaway git fixture repos under `/tmp` with unique sentinels in `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `.cursorrules`, `.cursor/rules/*.mdc`, `.omp/AGENTS.md`, `.omp/RULES.md`, `.omp/rules/*.md`, `AGENTS.local.md`, subdir `AGENTS.md`.
++  - Custom mock provider in the throwaway agent dir:
++  ```yaml
++  providers:
++    mock:
++      baseUrl: http://127.0.0.1:<port>/v1
++      api: openai-completions
++      apiKey: mock-key
++      authHeader: true
++      models:
++        - id: mock
++          name: Mock Model
++          api: openai-completions
++          reasoning: false
++          input: [text]
++          contextWindow: 128000
++          maxTokens: 1024
++          cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0}
++  ```
++  `modelRoles.default: mock/mock`, `title.generator: none`.
++  - Local Python HTTP server recorded every POST body and returned OpenAI Chat Completions SSE (`chat.completion.chunk`, `finish_reason: stop`, usage) or a scripted `task` tool call. No paid models.
++  - Each run used one request; `--no-tools --no-lsp --no-title` unless tools were under test. The captured system message is authoritative for injection.
++
++  ### 5.2 Matrix (sentinel presence)
++
++  | Run | Fixture / flags | Context files in `<repo-rules>` | Rules / rulebook | Verdict |
++  |---|---|---|---|---|
++  | baseline | repo1: root `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `.cursorrules`, `.cursor/rules/sentinel.mdc` (`alwaysApply`), `.omp/RULES.md`, `AGENTS.local.md` | `.claude/CLAUDE.md` only | `RULES.md` + cursor mdc in `<generic-rules>`; root AGENTS/CLAUDE shadowed; `.cursorrules` absent | Expected shadowing; context and rules separate |
++  | system_prompt | repo1 + `--system-prompt` role file | `.claude/CLAUDE.md` still present | `RULES.md` + cursor mdc prepended to block 0; role sentinel in block 0 | `--system-prompt` does not suppress repo injection |
++  | no_context_files | repo1 + `--no-context-files` | none | `RULES.md` + cursor mdc remain | Flag scopes context only |
++  | no_rules | repo1 + `--no-rules` | `.claude/CLAUDE.md` remains | none | Flag scopes rules only |
++  | extra | repo1 + overlay `contextFiles.extra: [AGENTS.local.md]` | `.claude/CLAUDE.md` + `AGENTS.local.md` | unchanged | Extra is additive beside the winner |
++  | extra_no_context | repo1 + extra + `--no-context-files` | none | rules remain | Extra is a context file |
++  | system_prompt_no_context | repo1 + role file + no context | none | rules prepended to block 0 | Single role copy + rules |
++  | native_shadow | repo2: root `AGENTS.md` + `.omp/AGENTS.md` + `.omp/RULES.md` | `.omp/AGENTS.md` only | `RULES.md` | Native shadows root AGENTS at depth 0 |
++  | agents_md_only | repo3: only `AGENTS.md` | `AGENTS.md` | none | Standalone AGENTS loads when not shadowed |
++  | claude_md_only | repo4: only `CLAUDE.md` | `CLAUDE.md` | none | Standalone CLAUDE via `claude-md` |
++  | cursorrules_only | repo5: only `.cursorrules` (plain and heading-rich) | none | none, even with `--tools=read` | Legacy `.cursorrules` ignored in 18.18.5 |
++  | cursor_conditional | repo6: `.cursor/rules/conditional.mdc` (globs, description, no alwaysApply) | none | `<domain-rules>` listing `conditional (src/**/*.ts): ...`; content not injected | Rulebook only |
++  | cursor_always | repo7: `.cursor/rules/always.mdc` (`alwaysApply: true`) + `.cursorrules` | none | always body in `<generic-rules>`; `.cursorrules` absent | `.mdc` works, legacy does not |
++  | sub_cwd | repo1 cwd `sub/` | root `AGENTS.md` + `sub/AGENTS.md` (root first, sub last) | `RULES.md` from root `.omp` | Ancestor walk composes; `.claude` launch-dir-only not loaded |
++  | sub_cwd_no_context | same + `--no-context-files` | none | `RULES.md` remains | Context only |
++  | native_rules | repo8: `.omp/rules/always.md`, `cond.md`, native `always_cursor_shadow.md`; cursor same-name rule; `.omp/RULES.md`; root AGENTS | root `AGENTS.md` | native always + native shadow + `RULES` in `<generic-rules>`; `cond` in `<domain-rules>`; cursor shadow body absent | Native rule wins by name; buckets work |
++  | native_rules_no_rules | repo8 + `--no-rules` | root `AGENTS.md` | none | Rules only |
++  | native_rules_subcwd | repo8 cwd `sub/` | root `AGENTS.md` + `sub/AGENTS.md` | `RULES.md` only; root `.omp/rules` absent | `.omp/rules` is cwd-scoped |
++  | dup_system_prompt | repo3 + role file containing root sentinel | root `AGENTS.md` | none | **2 copies** (block 0 + repo-rules) |
++  | dup_system_prompt_no_context | same + `--no-context-files` | none | none | 1 copy |
++  | dup_append | repo3 + `--append-system-prompt` containing root sentinel | root `AGENTS.md` | none | **2 copies** (repo-rules + append) |
++  | user_files_default | repo3, user agent `AGENTS.md`/`RULES.md`, user `SYSTEM.md`, user `APPEND_SYSTEM.md` | user AGENTS then project AGENTS | user RULES; SYSTEM replaces block 0; APPEND appended | User scope loads |
++  | user_files_custom_sp | same + `--system-prompt` | user AGENTS + project AGENTS | user RULES prepended to block 0; APPEND still appended; SYSTEM suppressed | APPEND bypasses `--system-prompt` |
++  | user_files_custom_sp_no_ctx_rules | same + both flags | none | none | APPEND **still appended** |
++  | user_files_custom_sp_empty_append | same + `--append-system-prompt=` | user+project AGENTS | user RULES | APPEND suppressed |
++  | project_config_extra | repo9: `.omp/config.yml` extra `TEAM.md`, root AGENTS | root AGENTS + TEAM.md | none | Project config extra works |
++  | project_extra_overlay_empty | repo9 + `--config` `contextFiles.extra: []` | root AGENTS only | none | Array replaces project list |
++  | project_disable_agents | repo9 + `disabledExtensions: [context-file:project:AGENTS.md]` | TEAM.md only | none | Single-file disable works |
++  | resume_refresh | repo3 turn 1 → edit AGENTS.md → `--continue` turn 2 | turn 1 old; turn 2 V2 only | none | Context re-discovered each process; static prefix stable |
++  | task_subagent_attempt | repo3 + `--tools=task`, scripted `task` tool call | parent only | parent only | Inconclusive: omp returned `Spawned agent ...` and `-p` exited before the subagent made a provider request; docs cover the drop behavior, M8 must verify |
++  | preflight_overlay | bad YAML + `omp --config bad --version` | — | — | **exit 0** (no parse); same overlay on a real turn exits 1 with parse error |
++
++  ---
++
++  ## 6. Per-role hydration seams
++
++  | Role | cwd | System prompt (`--system-prompt`) | Step prompt (`-p @file`) | Repo rules source |
++  |---|---|---|---|---|
++  | architect | task worktree (`iteration.ts:1226-1236`, `1452`, `3133`, `3889`) | `agents/architect.md` body (frontmatter stripped) | `agents/steps/architect-plan.md`, `architect-consult-*.md`, `architect-wave-report.md`, `architect-revise.md`, `architect-closeup.md` | task-worktree `AGENTS.md`/`.omp/AGENTS.md`/`RULES.md`/`.omp/rules`/`.claude` etc. |
++  | developer | item worktree (`item-machine.ts:946-970`) | `agents/developer.md` body | `agents/steps/test-first.md`, `develop.md`, `fix-round.md`, `simple-implement.md`, `poc.md` | item-worktree files |
++  | qa | item worktree | `agents/qa.md` body | `agents/steps/qa.md` | item-worktree files |
++  | reviewer | item worktree | `agents/reviewer.md` body | `agents/steps/review.md`, `plan-review.md` | item-worktree files |
++  | plan-reviewer / PM / wave-close-up / plan-close-up | task worktree | corresponding `agents/*.md` | corresponding `agents/steps/*.md` | task-worktree files |
++
++  Seams and code refs:
++  - **Role definition → block 0:** `extractAgentBody(run.definition)` writes `{runtimeDir}/system-prompts/<agent>-<session>.md`; `runAttempt` passes `--system-prompt <path>` (`harness.ts:71-73, 291-300, 387`). `agentDefinition()` resolves `{{> partial}}` includes (`prompts.ts:282-345`).
++  - **Step prompt → user message:** `step-runner.ts:545-550` renders the fragment with vars/schema; `harness.ts:386-388` passes `-p @<promptPath>`.
++  - **cwd → omp discovery root:** `runAttempt` passes `--cwd run.cwd` (`harness.ts:367-374`). Architect/task roles use task worktree; developer/qa/reviewer use item worktree (`step-runner.ts:92`, `item-machine.ts:960`).
++  - **Overlay:** one `{runtimeDir}/omp-overlay.yaml` per harness/runtime, regenerated from pipeline (`harness.ts:205-263`, `overlay.ts:26-100`). It currently contains only model roles/retry/unattended switches; no `contextFiles`/`disabledExtensions`/`disabledProviders` keys.
++  - **Environment:** `spawn(..., { env: { ...process.env, ...tmpEnv } })` (`harness.ts:406-409`); no `--profile`, no `PI_CODING_AGENT_DIR` isolation, so operator-level `~/.omp/agent/{AGENTS.md,RULES.md,APPEND_SYSTEM.md}` applies to every role.
++  - **Resume:** `--resume`/`--session-dir` (`harness.ts:374-380`); system prompt file path is deterministic per agent+session, content byte-stable. omp re-renders the context footer on the new process; repo-rule edits are picked up on the next turn without changing block 0.
++
++  ### 6.1 Spec line 113 — repo rules hydration
++
++  `docs/factory.v2.md:113` says: omp does not put `AGENTS.md` in subagent context, so the factory hydrates repo rules itself, and architect + developer/qa/reviewer must receive the target repo's rules, verified end-to-end. Interpretation from probes:
++  - **Root role processes already receive them.** Do not add a second copy; that would double-inject.
++  - **omp task subagents (scouts) drop AGENTS.md** by basename but keep `RULES.md` and `contextFiles.extra`. For rules that must reach scouts, use `.omp/RULES.md`/extras, or pass the rules through the `task` tool's `context` field (factory-side hydration at the delegation seam).
++  - **Worktree determinism:** rules come from the cwd's files. A worktree only has rules committed on its branch; rules changed after an item branch was cut are not present until merged. If rules must be live across all worktrees, sync them at wave starts or commit them before branching.
++
++  ---
++
++  ## 7. M8 verification plan (probe agents quote sentinel)
++
++  ### 7.1 Deterministic request-body checks (CI, no paid models)
++
++  1. Build a tar/zip throwaway fixture repo with unique sentinels in every source: root `AGENTS.md`, `.omp/AGENTS.md`, `.omp/RULES.md`, `.omp/rules/always.md`, `.omp/rules/cond.md`, `.cursor/rules/always.mdc`, `AGENTS.local.md`, nested `AGENTS.md`, user agent `AGENTS.md`/`RULES.md`/`APPEND_SYSTEM.md`.
++  2. Configure the mock provider (recipe §5.1) to record each request body to NDJSON and return a scripted final response (or `yield` tool call).
++  3. Run the real factory through the real `OmpHarness` for each role: architect, developer, qa, reviewer (and plan-reviewer/PM). For each captured role request, assert:
++     - expected repo sentinel appears **exactly once** in `messages[role=system]`;
++     - it appears in `<repo-rules>` (context) or the rules section according to source;
++     - shadowed/disabled sentinels do **not** appear;
++     - user-level sentinel appears only when isolation/disabledExtensions policy allows it;
++     - `APPEND_SYSTEM.md` sentinel appears only when expected; when strict determinism is desired, `--append-system-prompt=` suppresses it.
++  4. Repeat with `--system-prompt` containing a copy of repo text: assert count == 1 in production mode; count == 2 in a deliberate negative test.
++  5. Run with `--no-context-files`, `--no-rules`, and both: assert exact presence matrix from §4.2.
++  6. Resume test: turn 1, edit `AGENTS.md`, turn 2 via `--resume`; assert the V2 sentinel is present exactly once and the static block 0 is unchanged.
++  7. Cache test: capture system prompts for two item worktrees with different repo rules; assert the bytes before `<project-context>` are identical (static prefix cache preserved).
++
++  ### 7.2 Live probe agents (optional cheap model)
++
++  Give each role a test-only step prompt: `Quote every repository rule sentinel you can see, exactly once, with its source path.` Assert the answers contain the expected sentinels and no shadowed ones. Run for architect (task worktree), developer/qa/reviewer (item worktree), and a scout spawned via `task`:
++  - root roles: AGENTS sentinel present;
++  - scout: AGENTS sentinel absent; `RULES.md` sentinel present; if the factory passes rules via `task` `context`, that copy present once.
++
++  ### 7.3 Acceptance
++
++  M1/M8 passes when: every root role request contains the target repo's active context/rules exactly once; precedence/shadowing matches §3; disabled flags produce the §4.2 matrix; scouts have RULES/extra but not AGENTS; no user-level contamination under the chosen isolation policy; static prompt prefix remains byte-identical across worktrees.
++
++  ---
++
++  ## 8. Risks and follow-ups
++
++  1. **User-level prompt leakage (medium/high):** `APPEND_SYSTEM.md` applies to every role even with `--system-prompt` and both disable flags; user `AGENTS.md`/`RULES.md` also apply. If M8 wants deterministic role prompts, add explicit `--append-system-prompt=` and either isolate the profile/agent dir or disable user context sources. (`harness.ts:406-409`)
++  2. **Double injection if M8 copies repo rules (medium):** omp root sessions already inject; a factory-side copy yields 2 occurrences. Keep omp as sole injector, or disable discovery when injecting.
++  3. **Scout rule visibility (medium):** `AGENTS.md` does not reach omp `task` subagents; put hard rules in `.omp/RULES.md`/`contextFiles.extra` or delegation `context`.
++  4. **Worktree rule snapshots (medium):** item worktrees see only rules committed on their branch; mid-task rule changes can diverge. Decide sync policy at wave/item creation.
++  5. **cwd-scoped sources (low/medium):** `.omp/rules` and `.claude/CLAUDE.md` are cwd-only; roles launched from nested dirs would miss root copies. Factory currently launches from worktree roots; preserve that.
++  6. **Legacy `.cursorrules` (low):** documented but not loaded in 18.18.5; use `.cursor/rules/*.mdc`.
++  7. **Per-role extras (low):** one shared overlay per runtime; role-specific `contextFiles.extra` needs per-role overlay support or role definitions.
++  8. **Preflight overlay check (confirmed no-op):** replace `--config --version` with a real throwaway omp turn against the mock provider (or another command that actually parses the overlay) before declaring config compatible.
++
++  ---
++
++  ## 9. Full draft — `plugins/software-factory/docs/spikes/omp-6-repo-rules.md`
++
++  ```markdown
++  # Software-Factory v2: OMP Repo Rules & Injection Spike (M1)
++
++  This report is empirical verification of how omp discovers repository rules and context files, how the factory's per-role prompts interact with that injection, and what the factory should do for the M1 `omp-workspaces` repo-rules requirement. Tested against `omp 18.18.5` on Linux x86_64 WSL2 with throwaway git fixtures and a local OpenAI-compatible mock provider. No paid models were used; no production files were changed.
++
++  ## 1. Verdicts
++
++  ### 1.1 Root omp sessions inject repo rules automatically — **VERIFIED**
++
++  `omp --cwd <repo> --system-prompt <role-body>` still emits a trailing `<project-context>` footer with `<repo-rules>` and injects rules. `--system-prompt` replaces only block 0; it does not suppress context files, `RULES.md`, always-apply rules, or the rulebook listing.
++
++  ### 1.2 Current factory has no double injection — **VERIFIED**
++
++  Factory roles are root omp processes; their `--system-prompt` contains only the agent definition body. Repo rule text is absent from all role/step prompt assets. Each active sentinel appeared exactly once in captured provider requests.
++
++  ### 1.3 Copying rules into role prompts double-injects — **VERIFIED**
++
++  A role system prompt containing the same repo text produced 2 sentinel occurrences (block 0 + `<repo-rules>`). `--append-system-prompt` with the same text produced 2 (repo-rules + append). If M8 injects engine-rendered rules, it MUST disable omp discovery for that run.
++
++  ### 1.4 The spec's subagent premise is about scouts — **VERIFIED BY DOCS, NOT LIVE**
++
++  oMP task subagents drop every context file named `AGENTS.md` by basename; they keep `RULES.md` and `contextFiles.extra`. Root role sessions do not drop AGENTS.md. The factory's architect/developer/qa/reviewer are root processes, so they already receive AGENTS.md. Scouts (`task`) do not; use RULES.md/extra/delegation context for them.
++
++  ### 1.5 Preflight overlay validation is a no-op — **VERIFIED (critical)**
++
++  `omp --config <bad.yaml> --version` exits 0. The same overlay on a real turn fails with `Failed to parse config overlay`. The current preflight check (`preflight.ts:364-393`) proves the binary exists, not that the overlay is valid.
++
++  ### 1.6 No-paid-model mock provider is feasible — **VERIFIED**
++
++  A throwaway `models.yml` custom provider (`api: openai-completions`, `apiKey` literal, `authHeader: true`) plus a local HTTP/SSE stub returned scripted responses and recorded exact request bodies. This is a viable basis for M8's scripted mock model provider.
++
++  ## 2. Source and precedence summary
++
++  ### 2.1 Context files (`<repo-rules>`)
++
++  | Source | Provider priority | Scope |
++  |---|---|---|
++  | `.omp/AGENTS.md` | native 100 | nearest non-empty `.omp` walking cwd→repo root; no farther fallback |
++  | `AGENTS.md` | agents-md 10 | every ancestor cwd→repo root (and enclosing workspace dirs under home) |
++  | `.claude/CLAUDE.md` | claude 80 | launch cwd only |
++  | `CLAUDE.md` | claude-md 10 | every ancestor cwd→repo root |
++  | `.agent/AGENTS.md`, `.agents/AGENTS.md` | agents 70 | ancestor walk; `.agent` wins same level |
++  | `.github/copilot-instructions.md` | github 30 | launch cwd only |
++  | `.gemini/GEMINI.md` | gemini 60 | launch cwd only |
++  | `contextFiles.extra` basenames | custom-context 9 | walk like AGENTS.md; additive; also user agent dir and primary checkout root in linked worktrees |
++
++  One user context file survives by provider priority; one project file per depth; higher priority shadows at the same depth; different depths compose root→cwd (nearer last, more prominent). `contextFiles.extra` is additive and never takes the scope slot. Final injection is one `<repo-rules>` block in the trailing `<project-context>` footer, with absolute paths and expanded `@` imports.
++
++  ### 2.2 Rules
++
++  | Source | Provider priority | Scope / bucket |
++  |---|---|---|
++  | `.omp/rules/*.{md,mdc}` | native 100 | `<cwd>/.omp/rules` only; always-apply / rulebook / TTSR |
++  | `<agent-dir>/rules/*` | native 100 | user; same buckets |
++  | `.omp/RULES.md` | native 100 sticky | nearest project `.omp`; forced always-apply (`RULES@project`) |
++  | `<agent-dir>/RULES.md` | native 100 sticky | user; forced always-apply (`RULES`) |
++  | `.cursor/rules/*.{mdc,md}` | cursor 50 | project `<cwd>/.cursor/rules`, user `~/.cursor/rules`; alwaysApply or rulebook |
++  | `.cursorrules` | — | **not observed in 18.18.5**; do not rely on it |
++  | `.windsurf/rules/*.md` | windsurf 50 | project; rules |
++  | `.clinerules` | cline 40 | nearest; rules |
++  | `.github/instructions/**/*.instructions.md` | github 30 | applyTo rules |
++  | plugin `rules/` | omp-plugins 90 | extension packages |
++
++  Rules dedup by name: native > omp-plugins > agents > cursor/windsurf > cline > github > builtin. Bucket order: TTSR > alwaysApply (full content) > rulebook (description listing; body via `rule://`). `--no-rules` removes all of them; `--no-context-files` removes none.
++
++  ### 2.3 Settings layers
++
++  Environment > runtime > `--config` overlays > project `.omp/config.yml` > global `<agent-dir>/config.yml` > default. Arrays replace; they do not merge. `disabledExtensions: [context-file:<level>:<basename>]` drops a single context file; `disabledProviders` removes a whole discovery source.
++
++  ## 3. Injection behavior
++
++  - Context files: `<repo-rules>` in `<project-context>` footer; static system block comes first, so worktree-specific rules sit below the Anthropic cache breakpoint.
++  - Rules with default prompt: full always-apply content in `<generic-rules>`; conditional/described rules in `<domain-rules>` as name/description/globs pointers.
++  - Rules with `--system-prompt`: always-apply content is prepended to block 0; rulebook renders as `<rules>` in block 0.
++  - `--system-prompt` suppresses discovered `SYSTEM.md` but **not** `APPEND_SYSTEM.md`, context files, or rules.
++  - `--no-context-files` disables context files only; `--no-rules` disables rules only; both are needed to disable both.
++  - Discovered `APPEND_SYSTEM.md` is appended even with both flags and a custom system prompt; explicit empty `--append-system-prompt=` suppresses it.
++
++  ## 4. Probe matrix (condensed)
++
++  | Probe | Result |
++  |---|---|
++  | repo1 baseline (root AGENTS, CLAUDE, .claude/CLAUDE, .cursorrules, .cursor/rules always, .omp/RULES, AGENTS.local) | `<repo-rules>` = `.claude/CLAUDE.md`; rules = `RULES.md` + cursor always; root AGENTS/CLAUDE shadowed; `.cursorrules` absent |
++  | + `--system-prompt` | role text + rules in block 0; `<repo-rules>` still `.claude/CLAUDE.md` |
++  | + `--no-context-files` | no `<repo-rules>`; rules remain |
++  | + `--no-rules` | `<repo-rules>` remains; rules gone |
++  | + extra overlay `AGENTS.local.md` | `.claude/CLAUDE.md` + `AGENTS.local.md` |
++  | repo2 `.omp/AGENTS.md` + root AGENTS | `.omp/AGENTS.md` only; root shadowed |
++  | repo3 only AGENTS.md | `AGENTS.md` injected |
++  | repo4 only CLAUDE.md | `CLAUDE.md` injected |
++  | repo5 only `.cursorrules` | nothing, even with `read` |
++  | repo6 conditional `.mdc` | `<domain-rules>` listing only |
++  | repo7 always `.mdc` + `.cursorrules` | always body injected; `.cursorrules` absent |
++  | cwd `sub/` | root + sub AGENTS (root first); root `.omp/RULES.md`; root `.claude` not loaded |
++  | repo8 native rules + same-name cursor | native body wins; cursor body absent; conditional in `<domain-rules>` |
++  | cwd `sub/` of repo8 | root `.omp/rules` not loaded; root RULES still loaded |
++  | duplicate role prompt | sentinel count 2; with `--no-context-files` count 1 |
++  | duplicate append | sentinel count 2 |
++  | user AGENTS/RULES/SYSTEM/APPEND | all load; APPEND survives both disable flags; empty append suppresses |
++  | project config extra + overlay empty / disabledExtensions | project extra loads; overlay `[]` removes; disabled file drops while extra stays |
++  | resume after editing AGENTS.md | new system footer contains V2 only; history retained |
++  | preflight bad overlay + `--version` | exit 0; real turn parse error |
++
++  ## 5. Role hydration seams
++
++  - `--system-prompt` = `agents/<role>.md` body (frontmatter stripped, shared partials resolved).
++  - `-p @<prompt>` = rendered `agents/steps/<step>.md` with prompt vars/schema.
++  - `--cwd` = task worktree for architect/plan-reviewer/PM/close-ups; item worktree for developer/qa/reviewer. That cwd is the omp discovery root.
++  - One shared `{runtimeDir}/omp-overlay.yaml`; currently no context/rules keys.
++  - Inherited `HOME`/agent dir means user-level `AGENTS.md`/`RULES.md`/`APPEND_SYSTEM.md` apply to every role.
++
++  ## 6. M8 plan
++
++  1. Keep omp auto-discovery as the repo-rules injector for root roles; do not copy rule text into role definitions or step prompts.
++  2. Add a pipeline/overlay knob for `contextFiles.extra` (array of basenames) and, if needed, `disabledExtensions` for user-level contamination.
++  3. For rules that scouts must follow, use `.omp/RULES.md` or `contextFiles.extra`, or pass them in the `task` tool `context` field; AGENTS.md alone is invisible to scouts.
++  4. Add a mock-provider test harness that records request bodies; assert sentinel counts per role, precedence, flags, resume refresh, and cache-prefix stability.
++  5. Optionally run a cheap live probe where each role quotes sentinels; assert root roles see AGENTS and scouts do not (unless RULES/extra/context carries them).
++  6. If engine-side hydration is ever chosen, launch with `--no-context-files --no-rules --append-system-prompt=` and assert count == 1.
++  7. Replace preflight's `--config --version` with a real throwaway turn against the mock provider.
++
++  ## 7. Recommendations
++
++  - **Use omp-native injection** (recommended): no double injection, no rule-text duplication, cache-friendly (rules in the trailing footer below the cache breakpoint).
++  - **Do not rely on `.cursorrules`** in omp 18.18.5; use `.cursor/rules/*.mdc` with `alwaysApply: true`.
++  - **Put hard repo rules in `.omp/RULES.md`** if scouts must see them; keep AGENTS.md for the broader root-session guidance.
++  - **Verify user-level prompt files** are intentional; suppress `APPEND_SYSTEM.md` with `--append-system-prompt=` for deterministic role prompts.
++  - **Pin/sync repo rules across worktrees** at item/wave creation if rule changes must be consistent.
++  ```
++
++  ---
++
++  ## 10. Draft decision YAML
++
++  ```yaml
++  status: accepted
++  decision: |
++    Sources: omp 18.18.5 discovers context files from cwd: `.omp/AGENTS.md` (native, nearest non-empty .omp),
++    standalone `AGENTS.md` (agents-md, ancestor walk), `CLAUDE.md`/`.claude/CLAUDE.md`,
++    `.agent(s)/AGENTS.md`, `.github/copilot-instructions.md`, `.gemini/GEMINI.md`, and
++    `contextFiles.extra` basenames (additive, custom-context). Rules are separate: `.omp/rules/*.{md,mdc}`
++    (cwd .omp only), `<agent-dir>/rules/*`, sticky `RULES.md` (user + nearest project .omp), `.cursor/rules/*.{mdc,md}`
++    (legacy `.cursorrules` was not discovered), `.windsurf/rules`, `.clinerules`, `.github/instructions/**/*.instructions.md`,
++    and plugin rules.
++    Precedence: context files keep one user file and one project file per depth, by provider priority
++    native(100) > claude(80) > agents/codex(70) > gemini(60) > opencode(55) > cursor/windsurf(50) > cline(40) >
++    github(30) > agents-md/claude-md(10) > custom-context(9), then compose root→cwd with nearer files last;
++    extras are additive and never shadow. Rules dedupe by name with native(100) > omp-plugins(90) > agents(70) >
++    cursor/windsurf(50) > cline(40) > github(30), then bucket TTSR > alwaysApply > rulebook. Settings layers:
++    env > runtime > --config overlay > project .omp/config.yml > global agent config > default; arrays replace.
++    Double injection: current factory code injects repo rules exactly once (omp root-session discovery);
++    `--system-prompt` only replaces block 0 and does not suppress `<repo-rules>` or always-apply rules.
++    Copying repo context/rules into the role system prompt or step prompt while discovery remains enabled
++    produced two copies in probes (block 0 + `<repo-rules>`). Verdict: keep omp as the sole injector for root
++    roles; do not duplicate repo-rule text in factory prompts. The spec's AGENTS.md/subagent limitation applies
++    to omp task subagents (scouts), which drop AGENTS.md but keep RULES.md and contextFiles.extra; use those
++    channels (or the task context field) for scout-visible rules. If engine-side injection is chosen, launch
++    with `--no-context-files --no-rules --append-system-prompt=` and verify a single copy.
++  sources:
++    - "docs/factory.v2.md:104-118 (items 19-20, incl. repo-rules hydration at 113)"
++    - "plugins/software-factory/docs/OMP_ADAPTER.md:55-63,163-168"
++    - "plugins/software-factory/docs/ARCHITECTURE.md:40"
++    - "plugins/software-factory/src/harness/omp/harness.ts:71-73,205-263,287-300,367-388,406-409"
++    - "plugins/software-factory/src/harness/omp/overlay.ts:26-100"
++    - "plugins/software-factory/src/cli/preflight.ts:364-393"
++    - "plugins/software-factory/src/core/flows/step-runner.ts:545-550,814-826"
++    - "plugins/software-factory/src/core/flows/iteration.ts:1226-1236,1452,3133,3889"
++    - "plugins/software-factory/src/core/flows/item-machine.ts:946-970"
++    - "plugins/software-factory/agents/architect.md, developer.md, qa.md, reviewer.md"
++    - "https://omp.sh/docs/context-files"
++    - "https://github.com/can1357/oh-my-pi/blob/main/docs/context-files.md"
++    - "https://github.com/can1357/oh-my-pi/blob/main/docs/system-prompt-customization.md"
++    - "https://github.com/can1357/oh-my-pi/blob/main/docs/rulebook-matching-pipeline.md"
++    - "https://github.com/can1357/oh-my-pi/blob/main/docs/config-usage.md"
++    - "https://github.com/can1357/oh-my-pi/blob/main/docs/models.md"
++    - "https://omp.sh/docs/cli"
++  evidence:
++    - "omp 18.18.5 baseline probe: repo-rules = .claude/CLAUDE.md; rules = RULES.md + .cursor/rules alwaysApply; root AGENTS.md/CLAUDE.md shadowed at same depth; .cursorrules absent."
++    - "--system-prompt probe: role sentinel in block 0; .claude/CLAUDE.md still in <repo-rules>; RULES.md and cursor alwaysApply prepended to block 0."
++    - "--no-context-files removes <repo-rules> but keeps rules; --no-rules removes rules but keeps <repo-rules>."
++    - "contextFiles.extra overlay adds AGENTS.local.md beside the scope winner; --no-context-files removes it; project .omp/config.yml extra works and overlay [] replaces it."
++    - "repo2 .omp/AGENTS.md shadows root AGENTS.md; repo3 standalone AGENTS.md loads; repo4 standalone CLAUDE.md loads; repo5 .cursorrules ignored; repo8 native rule shadows same-name cursor rule."
++    - "subdir cwd composes root+sub AGENTS.md; root .omp/rules is not loaded from a subdir; root RULES.md is loaded."
++    - "duplicate probe: same repo sentinel in --system-prompt yields 2 occurrences; with --no-context-files yields 1; --append-system-prompt copy yields 2."
++    - "user-level probe: user AGENTS.md/RULES.md load; APPEND_SYSTEM.md survives --system-prompt, --no-context-files and --no-rules; --append-system-prompt= suppresses it; SYSTEM.md is suppressed by --system-prompt."
++    - "resume probe: edited AGENTS.md was re-discovered on the next --continue turn; system footer contained V2 only; static block 0 unchanged."
++    - "preflight probe: omp --config bad.yaml --version exit 0; real turn exit 1 with 'Failed to parse config overlay'."
++    - "mock provider probe: throwaway models.yml + local OpenAI-compatible SSE stub captured full request bodies with no paid model calls."
++    - "Docs: task subagents drop AGENTS.md but keep RULES.md/contextFiles.extra; system-prompt --system-prompt/--append precedence; rule provider/bucket lists; settings layer order."
++  followUps:
++    - "M8: implement M1 repo-rules verification against omp auto-discovery; do not copy repo rules into role prompts; assert exactly one sentinel per root role."
++    - "M8: choose a user-level contamination policy (profile/PI_CODING_AGENT_DIR isolation and/or disabledExtensions) and suppress APPEND_SYSTEM.md with --append-system-prompt= for deterministic role prompts."
++    - "M8: expose contextFiles.extra/disabledExtensions in the generated overlay; consider per-role overlay only if role-specific extras are required."
++    - "M8: verify scout behavior with a live task tool call: AGENTS.md absent, RULES.md/extra present; optionally pass rules through task context."
++    - "M8: replace preflight's --config --version check with a real throwaway turn using the mock provider (or another overlay-parsing command)."
++    - "M8: build the scripted mock provider test helper (request recorder + SSE text/yield responses) for no-paid-model E2E tests."
++    - "M8: add tests for context shadowing, rule-name shadowing, flags, resume refresh, and static-prefix cache stability across worktrees."
++    - "Docs: do not document legacy .cursorrules as supported in omp 18.18.5; point users to .cursor/rules/*.mdc."
++  ```
++
++  ---
++
++  ## 11. Sources
++
++  **Repository**
++  - `docs/factory.v2.md:104-118` — items 19-20, incl. repo-rules hydration at line 113.
++  - `plugins/software-factory/docs/OMP_ADAPTER.md:55-63` — overlay generation; `:163-168` — prompt-cache safety.
++  - `plugins/software-factory/docs/ARCHITECTURE.md:40` — item 19 status/current state.
++  - `plugins/software-factory/src/harness/omp/harness.ts:71-73` — `extractAgentBody`; `:205-263` — runtime dirs/overlay; `:287-300` — system-prompt file; `:367-388` — omp args; `:406-409` — inherited env.
++  - `plugins/software-factory/src/harness/omp/overlay.ts:26-100` — generated overlay keys (no context/rules keys).
++  - `plugins/software-factory/src/cli/preflight.ts:364-393` — overlay `--version` check.
++  - `plugins/software-factory/src/core/flows/step-runner.ts:545-550,814-826` — prompt render + AgentRun definition.
++  - `plugins/software-factory/src/core/prompts.ts:282-345` — agent definition include resolution.
++  - `plugins/software-factory/src/core/flows/iteration.ts:1226-1236,1452,3133,3889` — architect/task-worktree roles.
++  - `plugins/software-factory/src/core/flows/item-machine.ts:946-970` — item steps run in `childWt`.
++  - `plugins/software-factory/config/pipeline.default.yaml:108-131,240-280` — role cwd/flows.
++  - `plugins/software-factory/agents/{architect,developer,qa,reviewer}.md` — role definitions.
++
++  **omp documentation**
++  - Context files: https://omp.sh/docs/context-files ; https://github.com/can1357/oh-my-pi/blob/main/docs/context-files.md
++  - System prompt customization: https://github.com/can1357/oh-my-pi/blob/main/docs/system-prompt-customization.md
++  - Rulebook matching pipeline: https://github.com/can1357/oh-my-pi/blob/main/docs/rulebook-matching-pipeline.md
++  - Config layers: https://github.com/can1357/oh-my-pi/blob/main/docs/config-usage.md
++  - Custom providers/models: https://github.com/can1357/oh-my-pi/blob/main/docs/models.md
++  - CLI flags (`--no-rules`, `--no-context-files`, `--system-prompt`, `--append-system-prompt`): https://omp.sh/docs/cli
++
++  **Version note:** docs from `main` may be newer than 18.18.5; where they disagree (legacy `.cursorrules`), the 18.18.5 probe is authoritative for this spike.
++contextPack: >-
++  omp 18.18.5 repo-rules/injection audit — key facts for M1/M8:
++
++  - Root omp sessions auto-inject context files into a trailing
++  `<project-context><repo-rules>` footer even with `--system-prompt`; rules are
++  separate (`RULES.md`/always-apply content; conditional rules as rulebook
++  listings).
++
++  - Factory roles are root omp processes: architect/plan-reviewer/PM/close-ups
++  run in task worktree; developer/qa/reviewer in item worktree. They already
++  receive repo rules once. Current code does not duplicate; no double injection
++  today.
++
++  - Double injection is guaranteed if M8 copies repo text into `--system-prompt`
++  or `--append-system-prompt` while discovery stays on: measured 2 occurrences.
++  Recommended: keep omp as sole injector. If engine-side injection:
++  `--no-context-files --no-rules --append-system-prompt=` and assert one copy.
++
++  - Sources: `.omp/AGENTS.md` native (nearest .omp), standalone
++  `AGENTS.md`/`CLAUDE.md` ancestor walk, `.claude/CLAUDE.md` launch-dir only,
++  `.agent(s)/AGENTS.md`, `.github/copilot-instructions.md`, `.gemini/GEMINI.md`,
++  `contextFiles.extra` (additive). Rules: `.omp/rules/*`, agent-dir rules,
++  `.omp/RULES.md` sticky, `.cursor/rules/*.mdc`, windsurf/cline/github/plugins.
++  Legacy `.cursorrules` NOT observed in 18.18.5.
++
++  - Context precedence: one user file; one project file per depth; native 100 >
++  claude 80 > agents/codex 70 > gemini 60 > ... > agents-md/claude-md 10 >
++  custom-context 9; compose root→cwd, nearer last; extras additive. Rules dedup
++  by name: native 100 > plugins 90 > agents 70 > cursor/windsurf 50 > cline 40 >
++  github 30; TTSR > alwaysApply > rulebook. Settings: env > runtime > --config
++  overlay > project .omp/config.yml > global > default; arrays replace.
++
++  - omp task subagents (scouts) drop AGENTS.md but keep RULES.md and
++  contextFiles.extra. Put hard rules scouts must see in `.omp/RULES.md`/extra or
++  delegation `context`.
++
++  - Resume in the factory's per-turn process model re-discovers context files;
++  edited AGENTS.md appeared on the next turn. Static block 0 stays stable; repo
++  rules sit below the Anthropic cache breakpoint, preserving the cacheable
++  prefix.
++
++  - Preflight overlay check `omp --config <bad> --version` exits 0 (no-op); real
++  turn fails. Mock provider via throwaway models.yml (`api: openai-completions`)
++  + local SSE stub captured full requests with no paid calls; use it for M8
++  tests.
++sources:
++  - docs/factory.v2.md:104-118
++  - plugins/software-factory/docs/OMP_ADAPTER.md:55-63
++  - plugins/software-factory/docs/OMP_ADAPTER.md:163-168
++  - plugins/software-factory/docs/ARCHITECTURE.md:40
++  - plugins/software-factory/src/harness/omp/harness.ts:71-73
++  - plugins/software-factory/src/harness/omp/harness.ts:205-263
++  - plugins/software-factory/src/harness/omp/harness.ts:287-300
++  - plugins/software-factory/src/harness/omp/harness.ts:367-388
++  - plugins/software-factory/src/harness/omp/harness.ts:406-409
++  - plugins/software-factory/src/harness/omp/overlay.ts:26-100
++  - plugins/software-factory/src/cli/preflight.ts:364-393
++  - plugins/software-factory/src/core/flows/step-runner.ts:545-550
++  - plugins/software-factory/src/core/flows/step-runner.ts:814-826
++  - plugins/software-factory/src/core/prompts.ts:282-345
++  - plugins/software-factory/src/core/flows/iteration.ts:1226-1236
++  - plugins/software-factory/src/core/flows/item-machine.ts:946-970
++  - plugins/software-factory/config/pipeline.default.yaml:108-131
++  - plugins/software-factory/config/pipeline.default.yaml:240-280
++  - plugins/software-factory/agents/architect.md
++  - plugins/software-factory/agents/developer.md
++  - plugins/software-factory/agents/qa.md
++  - plugins/software-factory/agents/reviewer.md
++  - https://omp.sh/docs/context-files
++  - https://github.com/can1357/oh-my-pi/blob/main/docs/context-files.md
++  - https://github.com/can1357/oh-my-pi/blob/main/docs/system-prompt-customization.md
++  - https://github.com/can1357/oh-my-pi/blob/main/docs/rulebook-matching-pipeline.md
++  - https://github.com/can1357/oh-my-pi/blob/main/docs/config-usage.md
++  - https://github.com/can1357/oh-my-pi/blob/main/docs/models.md
++  - https://omp.sh/docs/cli
++recommendations:
++  - "M8: treat omp root-session discovery as the repo-rules hydration mechanism;
++    do not copy repo rule text into role definitions or step prompts. Verify one
++    sentinel per role request."
++  - "M8: for rules that scouts must see, use `.omp/RULES.md` or
++    `contextFiles.extra` (omp task subagents drop AGENTS.md), or pass rules
++    through the `task` tool's `context` field."
++  - "M8: add `contextFiles.extra` and optional `disabledExtensions` to the
++    generated overlay; keep one overlay per runtime unless role-specific extras
++    justify per-role overlays."
++  - "M8: decide and test a user-level prompt policy: isolate the omp
++    profile/agent dir and/or disable user context files; use
++    `--append-system-prompt=` to suppress discovered `APPEND_SYSTEM.md` when
++    determinism is required."
++  - "M8: replace the preflight `omp --config <overlay> --version` check with a
++    real throwaway turn using the mock provider (or another overlay-parsing
++    path)."
++  - "M8: build the local mock-provider helper (throwaway models.yml + HTTP/SSE
++    stub) for request-body assertions and scripted `yield` responses; no paid
++    models."
++  - "M8: add behavior tests for context shadowing, rule-name shadowing,
++    `--no-context-files`/`--no-rules`, resume refresh, and static-prefix cache
++    stability across worktrees."
++  - "Document that legacy `.cursorrules` is not loaded in omp 18.18.5; use
++    `.cursor/rules/*.mdc` with `alwaysApply: true`."
++concerns:
++  - kind: risk
++    summary: User-level omp prompt files leak into every factory role;
++      `APPEND_SYSTEM.md` survives `--no-context-files` and `--no-rules`
++    detail: OmpHarness inherits process.env and passes no `--profile` or
++      `PI_CODING_AGENT_DIR` (harness.ts:406-409). A probe with a temp HOME/agent
++      dir showed user `AGENTS.md` and `RULES.md` injected, and user
++      `APPEND_SYSTEM.md` appended even with `--system-prompt` plus both disable
++      flags. Only an explicit empty `--append-system-prompt=` suppressed the
++      append. This can inject operator instructions into every
++      architect/developer/qa/reviewer turn and defeats deterministic role
++      prompts.
++    severity: high
++    location:
++      file: plugins/software-factory/src/harness/omp/harness.ts
++      line: 406
++    affects:
++      - "19.1"
++      - "19.2"
++      - M8 hydration
++  - kind: assumption
++    summary: Spec line 113's 'omp does not put AGENTS.md in subagent context' is
++      true for omp task subagents, not root role sessions
++    detail: The factory's architect/developer/qa/reviewer are root omp processes
++      launched with `--system-prompt`; probes show they already receive repo
++      AGENTS.md/CLAUDE.md/rules from cwd. Only omp `task` subagents (scouts)
++      drop AGENTS.md; they keep RULES.md and contextFiles.extra. Implementing a
++      second factory-side copy for root roles would double-inject (measured 2
++      copies).
++    severity: medium
++    location:
++      file: docs/factory.v2.md
++      line: 113
++    affects:
++      - M1 scenario 4
++      - M8 hydration
++  - kind: risk
++    summary: Repo rules in worktrees are branch snapshots; mid-task rule changes can
++      diverge across item worktrees
++    detail: omp resolves rules from the role's cwd files. An item worktree only has
++      rules committed on its branch; rules changed after the item branch was cut
++      are absent until merged. If M8 requires all roles in a wave to see the
++      same rules, sync/copy rule files at item/wave creation or define a
++      branch-snapshot policy.
++    severity: medium
++    location:
++      file: plugins/software-factory/src/core/flows/item-machine.ts
++      line: 960
++    affects:
++      - "19"
++      - M1 scenario 4
++  - kind: risk
++    summary: "Cwd-scoped sources: `.omp/rules` and `.claude/CLAUDE.md` are
++      launch-directory-only"
++    detail: "Probe: starting omp in `repo/sub` loaded root+sub `AGENTS.md` and root
++      `.omp/RULES.md`, but not root `.omp/rules` or root `.claude/CLAUDE.md`.
++      Factory roles currently launch from worktree roots; changing role cwd to a
++      package subdir would silently drop those sources."
++    severity: low
++    location:
++      file: plugins/software-factory/src/harness/omp/harness.ts
++      line: 367
++    affects:
++      - "19"
++  - kind: question
++    summary: Legacy `.cursorrules` is documented but not loaded in omp 18.18.5;
++      which source is authoritative?
++    detail: omp docs `context-files.md` mentions legacy `.cursorrules` rules, while
++      `rulebook-matching-pipeline.md` lists only `.cursor/rules/*.{mdc,md}`.
++      Probe with plain, heading-rich, and co-located `.cursorrules` produced no
++      injection or rulebook listing. Treat `.cursorrules` as unsupported for
++      18.18.5; revisit if omp changes.
++    severity: low
++    location:
++      file: plugins/software-factory/docs/OMP_ADAPTER.md
++      line: 163
++    affects:
++      - M1 scenario 4
++remarkable:
++  - chosen: Keep omp root-session discovery as the sole repo-rules injector; do not
++      duplicate rule text in factory role/step prompts
++    why: Probes show root omp sessions already inject `<repo-rules>` and rules even
++      with `--system-prompt`; a second copy produced two sentinel occurrences.
++      omp also places context in the trailing project-context footer, so
++      per-worktree rules do not break the static prompt cache prefix (important
++      for item 20).
++    alternatives:
++      - Engine-rendered rules injected into the role system prompt with
++        `--no-context-files --no-rules`
++      - "Hybrid: omp for root roles, engine copy for scouts"
++  - chosen: Use `.omp/RULES.md` / `contextFiles.extra` (or task `context`) for rules
++      that must reach scouts
++    why: omp task subagents drop every context file named AGENTS.md but keep
++      RULES.md and extra context files. Hard rules that scouts must follow
++      cannot live only in AGENTS.md.
++    alternatives:
++      - Put all rules in AGENTS.md and accept scout blindness
++      - Inject repo rules into every task tool `context` field
++  - chosen: Use a throwaway omp agent dir with a custom OpenAI-compatible
++      `models.yml` plus a local SSE stub for no-paid-model probes
++    why: "Demonstrated end-to-end: omp 18.18.5 sent full prompts to the stub, which
++      recorded exact system messages and returned scripted text; no credentials
++      or paid calls. This directly supports M8's scripted mock model provider
++      requirement."
++    alternatives:
++      - Live cheap models (paid, non-deterministic)
++      - omp SDK/in-process harness (heavier, different path than production)
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
diff --git a/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/002-review-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/002-review-r1-a1/meta.yaml
new file mode 100644
index 0000000..a1a2bbf
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/002-review-r1-a1/meta.yaml
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
+startedAt: 2026-11-10T00:55:03.232Z
+session: 01a1c2f3-8e1c-76ce-913b-02bd0c58c0f1
+endedAt: 2026-11-10T01:01:32.548Z
+usage:
+  inputTokens: 53419
+  outputTokens: 18847
+  costUsd: 0.009317
+repairedFrom: simpler_repair
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T00-55-03-964Z_01a1c2f3-8e1c-76ce-913b-02bd0c58c0f1
diff --git a/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/002-review-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/002-review-r1-a1/output.yaml
new file mode 100644
index 0000000..99b28d2
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-repo-rules/steps/002-review-r1-a1/output.yaml
@@ -0,0 +1,60 @@
+status: approved
+summary: "Spike answers M1 scenario-4: root auto-inject once verified,
+  double-inject risk measured, scout RULES plan + M8 verification defined; 5
+  concerns triaged, no rework."
+suggestions:
+  - id: c-477404c672
+    disposition: architect
+    summary: Preflight no-op confirmed; schedule real-turn validation fix
+    detail: "Spike confirms with code + probe: preflight.ts:364-393 runs omp
+      --config <overlay> --version which exits 0 on bad overlay while a real
+      turn exits 1 with parse error. Read-only spike cannot fix prod code;
+      architect to schedule dev item replacing the check with a throwaway
+      mock-provider turn (recipe findings §5.1/§8.8)."
+    location:
+      file: plugins/software-factory/src/cli/preflight.ts
+      line: 364
+  - id: c-ba416d7313
+    disposition: architect
+    summary: Mock provider proven feasible; schedule M8 helper
+    detail: Spike demonstrates throwaway models.yml (openai-completions) + local SSE
+      stub capturing full system prompts with zero paid calls. Feasibility
+      de-risked; architect to schedule M8 scripted helper (request recorder +
+      scripted yield) and per-role request-body assertions per §7.1.
+  - id: c-d049242483
+    disposition: architect
+    summary: Hydration present for roots; scope remainder to scouts + verification
+    detail: "Spike reframes with evidence: root omp processes
+      (architect/dev/qa/reviewer via --system-prompt + --cwd) already receive
+      repo rules exactly once — no AGENTS/CLAUDE/RULES text in agents/ or
+      prompts.ts (verified), duplicate probe yields 2 copies. Remaining gap is
+      scouts (drop AGENTS.md, keep RULES.md/extra per docs; live task probe
+      inconclusive) + E2E verification. Architect to update M8 plan: keep omp
+      sole injector for roots, RULES.md/extra/context for scouts, assert one
+      sentinel per role."
+    location:
+      file: docs/factory.v2.md
+      line: 113
+  - id: c-342c07aba6
+    disposition: architect
+    summary: User-level prompt leak confirmed; decide M8 isolation policy
+    detail: "Harness inherits process.env with no --profile/PI_CODING_AGENT_DIR
+      (harness.ts:406-409 confirmed; no
+      --append-system-prompt/--no-context-files/--no-rules in prod args). Probe:
+      user AGENTS/RULES inject; APPEND_SYSTEM.md survives --system-prompt plus
+      both disable flags; only empty --append-system-prompt= suppresses.
+      Architect to choose M8 policy: profile/agent-dir isolation and/or
+      disabledExtensions + empty append for deterministic roles."
+    location:
+      file: plugins/software-factory/src/harness/omp/harness.ts
+      line: 406
+  - id: c-64046e8e72
+    disposition: optional
+    summary: Preserve worktree-root cwd; .omp/rules + .claude/CLAUDE.md are cwd-only
+    detail: "Probe: subdir launch loads root+sub AGENTS.md and root RULES.md but not
+      root .omp/rules or .claude/CLAUDE.md. Factory launches from worktree roots
+      today (taskWt/childWt); preserve that invariant and document. Low
+      severity."
+    location:
+      file: plugins/software-factory/src/harness/omp/harness.ts
+      line: 367

## Review Feedback
Quality gates failed on merge path for spike-repo-rules: typecheck. typecheck (exit via status=fail). Command: bun --cwd=plugins/software-factory run typecheck Details: error TS2688: Cannot find type definition file for 'bun'.
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
