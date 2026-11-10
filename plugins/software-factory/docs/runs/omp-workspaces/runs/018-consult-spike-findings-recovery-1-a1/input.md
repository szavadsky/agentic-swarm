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
spike-findings-recovery

## Assignment
{"slug":"spike-findings-recovery","kind":"no-behavior","title":"Recover wave-1 spike findings onto parent branch","assignment":"Salvage approved wave-1 spike research stranded on environmentally-failed item branches onto the parent branch. All research steps + reviews are approved; only wave-end merges failed (missing node_modules). Docs only, zero prod lines.\n\nRead-only sources (NEVER checkout/switch branches, NEVER write to .factory/** engine-owned paths; use `git show <branch>:<path>` only):\n- topic/omp-workspaces--spike-omp-isolation :: items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml (+003 review)\n- topic/omp-workspaces--spike-mock-provider :: items/spike-mock-provider/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-cache-key :: items/spike-cache-key/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-repo-rules :: items/spike-repo-rules/steps/001-research-r1-a1/output.yaml (+002 review)\n- parent-branch decisions/001 + 002 rulings (read on parent branch).\n\nSteps:\n1. git-show each research output.yaml + its review output; extract the embedded spike-draft markdown.\n2. Apply each review's optional polish notes ONLY where they correct evidence (e.g. probe-26/18 softening, spec-path fix); do not invent new probes.\n3. Write the four drafts to: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md.\n4. Write items/spike-findings-recovery/RECOVERY.md mapping each M1 scenario (isolation probe matrix, mock-provider seam, cache-keying, repo-rules injection) to branch evidence + followUps for iteration-2 planning (M3/M4/M6/M7/M8).\n5. Verify on parent branch only: all five files exist, each spike doc retains probe-evidence/logs + recommendations sections, RECOVERY.md covers all four M1 scenarios.\n\nAcceptance: 4 spike docs + RECOVERY.md present with probe evidence; no prod code changed; no branch checkouts; no .factory/** writes.\n\nConstraints: no-behavior kind; no deps; wave-2 parallel (self-contained, self-heals node_modules via own develop-step gates).","outlineRef":"spike-findings-recovery","milestone":"m1-omp-de-risk","wave":2,"citations":["topic/omp-workspaces--spike-omp-isolation:items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml","topic/omp-workspaces--spike-mock-provider:items/spike-mock-provider/steps/001-research-r1-a1/output.yaml","topic/omp-workspaces--spike-cache-key:items/spike-cache-key/steps/001-research-r1-a1/output.yaml","topic/omp-workspaces--spike-repo-rules:items/spike-repo-rules/steps/001-research-r1-a1/output.yaml"]}

## Prior Attempts & Failures
Merge path failed for spike-findings-recovery (attempt 2/2)

## Current Diff
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md
new file mode 100644
index 0000000..cfaee73
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md
@@ -0,0 +1,90 @@
+# Wave-1 spike findings recovery
+
+Status: recovered. Docs-only salvage of approved wave-1 research onto the parent branch.
+
+## Why this exists
+
+All four wave-1 spike items completed research (`status: ok`) and review (`status: approved`), but their wave-end merges failed environmentally: the merge-path gates ran without `infra.setup` in the child worktree, so the missing `node_modules` failed typecheck. No research finding was rejected. This item re-materializes the approved drafts as product docs and records the evidence mapping needed by iteration-2 planning. No production code changed; the source item branches were read via `git show` only (no checkout/switch).
+
+## Source provenance (read-only)
+
+| M1 scenario | Source branch | Research record | Review record | Review outcome |
+|---|---|---|---|---|
+| 1. Isolation probe matrix | `topic/omp-workspaces--spike-omp-isolation` (`cd07f2d`) | `items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml` (`ok`) | `steps/003-review-r1-a1/output.yaml` | `approved`; probe-26/18 interpretation softened |
+| 2. Mock-provider seam | `topic/omp-workspaces--spike-mock-provider` (`85c4b46`) | `items/spike-mock-provider/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; e2e split justified |
+| 3. Cache keying | `topic/omp-workspaces--spike-cache-key` (`c28f43b`) | `items/spike-cache-key/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; spec-path/provenance fixes applied |
+| 4. Repo-rules injection | `topic/omp-workspaces--spike-repo-rules` (`9755c7e`) | `items/spike-repo-rules/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; cwd-scope invariant documented |
+
+Parent-branch decisions consumed:
+
+- `decisions/001-item-spike-repo-rules-1.yaml` — `accept-with-debt`; rulings: M4 replaces the preflight no-op with a real mock-provider turn; M8 builds the scripted mock helper with per-role request-body assertions; M8 keeps omp as sole root injector, implements RULES/extra for scouts, and asserts one sentinel per role; M8 chooses the prompt-isolation policy (profile/agent-dir and/or `disabledExtensions` + empty `--append-system-prompt=`).
+- `decisions/002-item-spike-omp-isolation-1.yaml` — `accept-with-debt`; rulings: M4 replaces `preflight.ts:364-394` with key/enum/catalog validation plus one real isolated round-trip turn; M3 implements the ratified root mapping (`omp worktree add -b <topic-branch> <path> <base> -C <repo>` then `omp --cwd <path> -p`) with `isolation: engine` as the fallback and unchanged engine merge ownership.
+
+## Recovered docs
+
+| Doc | M1 scenario | Evidence preserved |
+|---|---|---|
+| `plugins/software-factory/docs/spikes/omp-3-isolation.md` | 1 | 27-probe command log + excerpts, backend enum, retention matrix, root mapping, `task.isolation` vs engine merge, preflight recipe, draft config surface, recommendations |
+| `plugins/software-factory/docs/spikes/omp-4-mock-provider.md` | 2 | 17-probe log, extension/SSE seam, scenario `{turns}` contract, NDJSON/usage contract, `OmpHarness` wrapper, decision YAML + followUps, sources |
+| `plugins/software-factory/docs/spikes/omp-5-cache-keys.md` | 3 | Transport byte/argv audit, live resume probe log (DeepSeek/Anthropic), TTL/model/content invalidation, cold-resume signals, knob audit, compaction/warming analysis, recommendations, appendix |
+| `plugins/software-factory/docs/spikes/omp-6-repo-rules.md` | 4 | Source inventory, precedence/composition, flag matrix, probe matrix, per-role seams, M8 verification plan, recommendations |
+
+## M1 scenario → evidence mapping
+
+### 1. Isolation probe matrix (M1 scenario-1)
+
+Evidence: `isolation.backend` has exactly 9 accepted values (`auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy`); every value degrades to plain checkout with a FICLONE warning on ext4/WSL2. Retention: `worktree add` + `--cwd` keeps commits/partials/registration on success, failure, and SIGKILL; isolated subagents retain a patch or `omp/task/<Agent>` branch on success **and** failure; parent abort loses all. `worktree.onStart` is a no-op for `-p`. omp `apply:true` produces a single-parent commit with no gates/conflict agent, so engine `merge-path.ts` remains merge owner and subagents use `apply:false`. Preflight must include one real turn (probes 17/18/27: bogus keys, invalid backend overlays, and missing overlays are all accepted by static checks).
+
+FollowUps:
+- **M3**: implement `workspaces.isolation: omp|engine`, the omp backend/worktree/`task.isolation` config surface, `omp worktree add` + `--cwd` root mapping, and keep topic branch naming + engine merge ownership.
+- **M4**: replace `preflight.ts:364-394` with key/enum/catalog validation plus one real isolated round-trip turn; derive status/gc from `git worktree list` + records; classify turn outcome from the `--mode json` transcript, not process rc.
+- **M6**: add cross-launch merge/lock coordination for parallel-epic launches.
+
+### 2. Mock-provider seam (M1 scenario-2)
+
+Evidence: an omp extension loaded with `-e/--extension` calls `pi.registerProvider('mock', {...openai-completions...})` against a local SSE server; `omp models -e ... --json` lists `mock/mock-chat`. Proven end-to-end on real omp 18.18.5 with zero paid calls: text turn, yield envelope, read→yield tool loop, parallel tool calls, session resume, `@role` resolution, parallel processes, and `OmpHarness.run`/`complete` through a wrapper. Scenario format is `{turns: [{text}|{toolCalls}|{yield}]}` with optional `usage`/`finishReason` and top-level `match`/`onExhausted`; error turns are not probed.
+
+FollowUps:
+- **M8**: add `extraArgs`/`mockProvider` to `OmpHarness`; implement `test/e2e/mock-provider/{extension,server,scenario,runner}.ts`, gate with `FACTORY_E2E_OMP=1`, keep paid `FACTORY_LIVE_OMP=1` separate, assert only `mock/mock-chat` requests and `usage.costUsd === 0`.
+- **M4**: use the seam for the preflight real-turn validation.
+
+### 3. Cache keying (M1 scenario-3)
+
+Evidence: omp 18.18.5 keys the prompt cache by request-prefix **content**, not by file path. Identical bytes at a changed system-prompt path still fully hit; a model switch is a full cold read (measured ≈8.9× warm). TTL expiry (Anthropic 5m) causes a cold read; long retention was verified separately. Compaction rewrites history and makes the next resume cold from the cut point. The factory currently detects none of these signals and pins none of the cache/compaction/memory knobs; the manual `-p "/compact"` path exists but its cost is absent from NDJSON.
+
+FollowUps:
+- **M7**: extend usage accounting with `cacheReadTokens`/`cacheWriteTokens`/`totalTokens`/`cacheTtl`/provider/model/reasoning fields; add a per-session cache-state record; record the resolved model used by the successful turn and pass that literal model on resume; pin `providers.cache*`, `compaction.*`, `snapcompact.*`, and `mnemopi.autoRecall/autoRetain` in the overlay; measure long-vs-short retention and fresh-brief-vs-warm-compaction on the self-host fire test; add a mock-provider cache fixture.
+- **M4**: validate effective overlay values (not `--version`) and read back performance-relevant settings in preflight.
+
+### 4. Repo-rules injection (M1 scenario-4)
+
+Evidence: root omp sessions discover and inject repo context/rules into a trailing `<repo-rules>` footer; `--system-prompt` replaces block 0 only. The current factory has no double injection because role prompts contain no repo-rule text. Copying rules into role prompts or append prompts double-injects (2 sentinel copies). omp `task` subagents drop `AGENTS.md` but keep `RULES.md` and `contextFiles.extra`. User-level `APPEND_SYSTEM.md`, `AGENTS.md`, and `RULES.md` leak into roles unless isolated or suppressed; only an explicit empty `--append-system-prompt=` suppresses the append file. Resume re-discovers repo rules each process, while the static block-0 prefix stays stable.
+
+FollowUps:
+- **M4**: replace the preflight `--config --version` no-op using the mock-provider real-turn recipe.
+- **M8**: keep omp as sole injector for root roles; implement `RULES.md`/`contextFiles.extra` (or delegation context) for scouts; add sentinel-based per-role request-body tests; choose and enforce the user-level contamination policy; keep factory launches at worktree roots because `.omp/rules` and `.claude/CLAUDE.md` are cwd-only.
+
+## Iteration-2 follow-up index
+
+| Milestone | Follow-up | Source |
+|---|---|---|
+| M3 | omp workspace backend + `isolation: engine` fallback + config surface + unchanged branch/merge ownership | `omp-3-isolation.md` §7/§9/§10; decision 002 |
+| M4 | preflight version/key/enum/catalog checks + one real isolated round trip; status/gc from git records; transcript-based outcome | `omp-3-isolation.md` §5/§10, `omp-5-cache-keys.md` §9.5, `omp-6-repo-rules.md` §6; decisions 001/002 |
+| M6 | cross-launch merge/lock coordination for parallel epics; per-epic workspace isolation | `omp-3-isolation.md` §10 |
+| M7 | cache/compaction usage plumbing, session cache-state, literal model on resume, overlay pins, retention measurement, mock cache fixture | `omp-5-cache-keys.md` §9/§10/§11 |
+| M8 | scripted mock-provider helper + `extraArgs`; repo-rules hydration/sentinel tests; user-level isolation policy; no-model e2e and use-case docs | `omp-4-mock-provider.md` §M8/decision, `omp-6-repo-rules.md` §6/§7 |
+
+## Review polish ledger
+
+Applied only where the note corrected evidence (no new probes invented):
+
+- **Isolation** — probe 26 corrected: in-base explicit-path worktrees are listed by `worktree list --json` when `OMP_WORKTREE_DIR` is aligned; outside-base trees are invisible; live trees are never reported as orphans. Probe 18 softened: invalid backend overlay is accepted, but `config get` ignores `--config` overlays, so runtime coercion is unproven. Retention matrix scoped to single-host omp 18.18.5/ext4/WSL2.
+- **Cache** — spec source fixed to `docs/factory.v2.md:114-120`; `tokensAfter`/`method` attributed to the transcript `compaction` entry rather than the NDJSON result; long/none retention probes qualified as YAML-only artifacts; dead `steps/architect-resume` fragment noted while keeping the byte-diff evidence valid.
+- **Repo rules** — worktree-root cwd invariant documented because `.omp/rules` and `.claude/CLAUDE.md` are cwd-only.
+- **Mock provider** — the `test/e2e/` split is retained and justified: it separates the no-model scripted suite from paid live coverage and matches the M8 plan's directional interface. The optional raw-NDJSON-excerpt and unprobed-error-turn notes remain disclosed limitations, not re-probed here.
+
+## Verification
+
+- All five recovery outputs exist and each spike doc contains a findings section plus probe evidence/log and recommendations/M8 sections (see the recovered-docs table).
+- Source records were read with `git show <branch>:<path>`; no branch was checked out.
+- No production code changed. No engine-owned record (`runs/`, `plan/`, `state.yaml`, `journal.ndjson`, `decisions/`) was modified; the only orchestration-folder write is this item's assigned deliverable `items/spike-findings-recovery/RECOVERY.md`.
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..3f4821c
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/checks.yaml
@@ -0,0 +1,116 @@
+checks:
+  - id: gates
+    status: pass
+    message: Gates passed (2 gates)
+    details:
+      - id: typecheck
+        command: bun --cwd=plugins/software-factory run typecheck
+        status: pass
+        durationMs: 7518
+        details: $ tsc --noEmit
+      - id: test
+        command: bun --cwd=plugins/software-factory test
+        status: pass
+        durationMs: 520862
+        details: >-
+          bun test v1.4.4 (38afee6c8)
+
+          Disk space check passed (threshold 2048 MB):
+            worktreeRoot (/tmp/factory-test-repo-OFsFtD.factory-wt): 4473 MB free
+            .factory-runtime/tmp (/tmp/factory-test-repo-OFsFtD.factory-wt/.factory-runtime/tmp): 4473 MB free
+            repoRoot (/tmp/factory-test-repo-OFsFtD): 4473 MB free
+            tmpdir (/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp): 79632 MB free
+            /tmp (/tmp): 4473 MB free
+          ================================================================
+
+          Task: status-test-task [ACTIVE]
+
+          Kind: unclassified | Iteration: 1 | Wave: 1
+
+          Worktree: (none - main checkout)
+
+          Config path: /tmp/factory-test-repo-z4yvBN/.factory/pipeline.yaml
+
+          Budget spent: $0.0000
+
+          ----------------------------------------------------------------
+
+          Waves & Items:
+            Wave 1:
+          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
+
+          ----------------------------------------------------------------
+
+          Blocking Questions:
+            (none)
+          ----------------------------------------------------------------
+
+          Digest Questions:
+            (none)
+          ================================================================
+
+
+
+          test/config-worktree-layering.test.ts:
+
+          [factory preflight] Preflight failed with 1 error(s):
+            - Pipeline config loading failed: Invalid pipeline configuration:
+          /limits/maxIterations: must be integer ({"type":"integer"})
+
+
+          test/disk-space.test.ts:
+
+          52 |       probe,
+
+          53 |     });
+
+          54 | 
+
+          55 |     expect(res.ok).toBe(false);
+
+          56 |     expect(res.minFreeDiskMb).toBe(2048);
+
+          57 |     expect(res.failingPaths.length).toBe(1);
+                                                   ^
+          error: expect(received).toBe(expected)
+
+
+          Expected: 1
+
+          Received: 2
+
+                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery/plugins/software-factory/test/disk-space.test.ts:57:37)
+          (fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace
+          verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
+          [34.45ms]
+
+
+          test/cli/cli.test.ts:
+
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999
+          on host Slava-Yoga) taken over by PID 3677721
+
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID
+          9999999 on host Slava-Yoga) taken over by PID 3677721
+
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID
+          9999999 on host Slava-Yoga) taken over by PID 3677721
+
+           663 pass
+           2 skip
+           1 fail
+           3736 expect() calls
+          Ran 666 tests across 101 files. [268.45s]
+        failingTests:
+          - Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies
+            worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
+  - id: size
+    status: pass
+    message: "size passed: 0/300 production lines changed"
+    details:
+      changedLines:
+        added: 0
+        deleted: 0
+        total: 0
+        files: []
+      limit: 300
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/input.md
new file mode 100644
index 0000000..b336ce5
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/input.md
@@ -0,0 +1,92 @@
+# Step: Develop
+
+## Goal
+Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
+
+## Rules
+- Target green: every test selector and case identified in `target` MUST pass cleanly.
+- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
+- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
+- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
+- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
+
+## Assignment
+{
+  "slug": "spike-findings-recovery",
+  "kind": "no-behavior",
+  "title": "Recover wave-1 spike findings onto parent branch",
+  "assignment": "Salvage approved wave-1 spike research stranded on environmentally-failed item branches onto the parent branch. All research steps + reviews are approved; only wave-end merges failed (missing node_modules). Docs only, zero prod lines.\n\nRead-only sources (NEVER checkout/switch branches, NEVER write to .factory/** engine-owned paths; use `git show <branch>:<path>` only):\n- topic/omp-workspaces--spike-omp-isolation :: items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml (+003 review)\n- topic/omp-workspaces--spike-mock-provider :: items/spike-mock-provider/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-cache-key :: items/spike-cache-key/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-repo-rules :: items/spike-repo-rules/steps/001-research-r1-a1/output.yaml (+002 review)\n- parent-branch decisions/001 + 002 rulings (read on parent branch).\n\nSteps:\n1. git-show each research output.yaml + its review output; extract the embedded spike-draft markdown.\n2. Apply each review's optional polish notes ONLY where they correct evidence (e.g. probe-26/18 softening, spec-path fix); do not invent new probes.\n3. Write the four drafts to: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md.\n4. Write items/spike-findings-recovery/RECOVERY.md mapping each M1 scenario (isolation probe matrix, mock-provider seam, cache-keying, repo-rules injection) to branch evidence + followUps for iteration-2 planning (M3/M4/M6/M7/M8).\n5. Verify on parent branch only: all five files exist, each spike doc retains probe-evidence/logs + recommendations sections, RECOVERY.md covers all four M1 scenarios.\n\nAcceptance: 4 spike docs + RECOVERY.md present with probe evidence; no prod code changed; no branch checkouts; no .factory/** writes.\n\nConstraints: no-behavior kind; no deps; wave-2 parallel (self-contained, self-heals node_modules via own develop-step gates).",
+  "outlineRef": "spike-findings-recovery",
+  "milestone": "m1-omp-de-risk",
+  "wave": 2,
+  "citations": [
+    "topic/omp-workspaces--spike-omp-isolation:items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml",
+    "topic/omp-workspaces--spike-mock-provider:items/spike-mock-provider/steps/001-research-r1-a1/output.yaml",
+    "topic/omp-workspaces--spike-cache-key:items/spike-cache-key/steps/001-research-r1-a1/output.yaml",
+    "topic/omp-workspaces--spike-repo-rules:items/spike-repo-rules/steps/001-research-r1-a1/output.yaml"
+  ]
+}
+
+## Target
+tests
+
+## Context & Citations
+[
+  "topic/omp-workspaces--spike-omp-isolation:items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml",
+  "topic/omp-workspaces--spike-mock-provider:items/spike-mock-provider/steps/001-research-r1-a1/output.yaml",
+  "topic/omp-workspaces--spike-cache-key:items/spike-cache-key/steps/001-research-r1-a1/output.yaml",
+  "topic/omp-workspaces--spike-repo-rules:items/spike-repo-rules/steps/001-research-r1-a1/output.yaml"
+]
+
+## Review Feedback
+
+
+## Open Concerns
+- id: c-552344216d
+  kind: blocker
+  severity: high
+  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
+  affects:
+    - "19.2"
+    - wave-merge
+- id: c-f972360209
+  kind: tech-debt
+  severity: medium
+  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
+  affects:
+    - redrive
+    - wave-merge
+
+
+- Review the concerns above before starting; they constrain this step but are not part of the assignment.
+- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+- summary (string, required): Concise summary of implementation actions and test results
+- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+  - Option 1:
+    - selectors (array of string, required)
+    - expectRed (array of string, required, minItems: 1)
+  - Option 2:
+    - gate (string, required)
+  - Option 3:
+    - command (string, required)
+    - customTarget (boolean, required)
+- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+- concerns (array of object, optional): Structured concerns raised during implementation
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
+- notes (string, optional): Optional developer notes, implementation observations, or comments
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..d8c6979
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/meta.yaml
@@ -0,0 +1,20 @@
+seq: 1
+name: develop
+attempt: 1
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-10T01:58:58.390Z
+session: 01a1c32e-1401-7277-bf9d-7bf38233f921
+endedAt: 2026-11-10T02:23:11.631Z
+usage:
+  inputTokens: 139228
+  outputTokens: 49219
+  costUsd: 0.071688
+repairedFrom: ask
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-329Z_01a1c32e-1401-7277-bf9d-7bf38233f921.jsonl
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..1e2c16b
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/output.yaml
@@ -0,0 +1,82 @@
+status: ok
+summary: Recovered all four approved wave-1 spike drafts from their item
+  branches via read-only `git show` and published them as
+  `plugins/software-factory/docs/spikes/omp-3-isolation.md`,
+  `omp-4-mock-provider.md`, `omp-5-cache-keys.md`, and `omp-6-repo-rules.md`.
+  Applied only evidence-correcting review polish (probe-26/18 softening,
+  single-host retention scope, cache spec-path + compaction provenance +
+  artifact-completeness fixes, dead-fragment note, repo cwd invariant, justified
+  mock e2e split) and invented no probes. Wrote
+  `items/spike-findings-recovery/RECOVERY.md` mapping each M1 scenario to branch
+  evidence and M3/M4/M6/M7/M8 followUps, including the parent decision 001/002
+  rulings. No production source changed and no branch was checked out.
+  Self-healed missing `node_modules` with `bun install`; typecheck is green.
+  Full-suite tests show the known baseline-red disk-space test plus
+  environment-sensitive failures caused by two overlapping suite runs on this
+  shared host; isolated reruns of the affected engine files pass.
+target:
+  gate: test
+evidence:
+  - "Provenance: `git show
+    topic/omp-workspaces--spike-{omp-isolation,mock-provider,cache-key,repo-rul\
+    es}:<step>/output.yaml` confirmed research status `ok` and all four review
+    outputs `approved`."
+  - "Draft fidelity: ordered-line comparison against the embedded drafts shows
+    only the intended polish lines differ; isolation differs only on the
+    probe-26 and probe-18 corrections, mock only on the M8 e2e justification,
+    cache only on the four evidence corrections, repo retains all lines plus the
+    cwd recommendation."
+  - "Output verification: all five files exist — four spike docs
+    (123/133/308/128 lines) plus RECOVERY.md (90 lines); each spike doc contains
+    probe evidence/log and recommendations/M8 sections; RECOVERY.md names all
+    four M1 scenarios and M3/M4/M6/M7/M8 followUps (programmatic assertions
+    passed)."
+  - "Typecheck gate: `cd plugins/software-factory && bun install` (self-heal
+    gitignored node_modules) then `bun run typecheck` exited 0 (`tsc --noEmit`
+    clean)."
+  - "Test gate: full `bun test` executed 666 tests (652 pass / 2 skip / 12 fail
+    / 5 errors) while an earlier full-suite run was still active on the shared
+    host; targeted isolation rerun `bun test test/engine/head-guard.test.ts
+    test/engine/fix-round-reentry.test.ts` passed 3/3 with exit 0, confirming
+    the failures were concurrency-induced; the known baseline-red
+    `test/disk-space.test.ts` remains the only documented baseline failure."
+  - "Tree state: `git status --short` shows only the four new spike docs and
+    RECOVERY.md; `git diff --numstat` shows zero production source changes; no
+    branch checkout/switch was performed. The staged item `meta.yaml` session
+    field is engine-written and was not touched."
+remarkable:
+  - chosen: Published the full embedded draft for isolation and enriched it with the
+      approved findings' 27-probe command log, config surface, and follow-ups.
+    why: The M1 directional interface requires findings + probe logs +
+      recommendations, and the embedded compact draft had no dedicated
+      probe/recommendation sections; all added content comes from the same
+      approved research output, so no new probes were invented.
+    alternatives:
+      - Publish only the compact embedded full draft (fails the
+        probe-log/recommendations acceptance)
+      - Reconstruct the whole document from the pre-draft findings (duplicates
+        the approved draft)
+  - chosen: Retained `test/e2e/mock-provider` in the mock-provider doc while
+      documenting why it is justified over `test/harness/mock-provider`.
+    why: The M8 plan's directional interface explicitly names
+      `test/e2e/mock-provider/*`, and the split keeps the no-model scripted
+      suite separate from paid live coverage; the review allowed either the repo
+      idiom or a justification.
+    alternatives:
+      - Rename to `test/harness/mock-provider` (conflicts with the M8 plan
+        interface)
+      - Drop the proposal path entirely (loses actionable M8 guidance)
+  - chosen: Wrote RECOVERY.md at the assigned
+      `items/spike-findings-recovery/RECOVERY.md` item-local path.
+    why: Step 4 mandates that path (shorthand for the task's `items/` workspace); no
+      engine-owned record (`runs/`, `plan/`, `state.yaml`, `journal.ndjson`,
+      `decisions/`) was modified.
+    alternatives:
+      - Write a repo-root `items/` copy (not the assigned task-workspace path)
+      - Write under engine-owned `.factory` records (explicitly forbidden)
+notes: The full test suite was executed twice on a shared host with concurrent
+  factory sessions; overlapping runs produced transient engine-test failures
+  that pass in isolation. No test or source file was changed by this item, so
+  those failures cannot be attributed to this diff. `bun install` created only
+  gitignored `node_modules`, which also removes the merge-path typecheck blocker
+  (missing node_modules) for this worktree.
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..43b8675
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/checks.yaml
@@ -0,0 +1,7 @@
+checks:
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/input.md
new file mode 100644
index 0000000..123c86a
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/input.md
@@ -0,0 +1,1747 @@
+# Step: QA
+
+## Goal
+Perform independent quality assurance on the item's implementation and test suite. Guard against test weakening, false passes, and unverified claims.
+
+## Rules
+- SKEPTICAL VERIFICATION: do NOT trust developer summaries. Scrutinize engine check results (`red-test`, `test-diff`), actual diffs, and tool outputs.
+- Test weakening defense: scrutinize `testDiff`. Reject any test change that deletes assertions, relaxes matchers, replaces concrete checks with tautologies, or reduces test coverage.
+- Story kind validation:
+  - `dev` stories: verify `red-test` proved tests failed on baseline code and pass after implementation.
+  - `no-behavior` stories: confirm tests remain materially identical. Functional behavior must not change.
+- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
+
+## Dispositions Criteria
+Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async.
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
+
+## Rules
+- Defect requiring code change MUST be `fix`.
+- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
+- Do NOT use `human-async` when repo context or architecture docs provide the answer.
+
+## Assignment
+{
+  "slug": "spike-findings-recovery",
+  "kind": "no-behavior",
+  "title": "Recover wave-1 spike findings onto parent branch",
+  "assignment": "Salvage approved wave-1 spike research stranded on environmentally-failed item branches onto the parent branch. All research steps + reviews are approved; only wave-end merges failed (missing node_modules). Docs only, zero prod lines.\n\nRead-only sources (NEVER checkout/switch branches, NEVER write to .factory/** engine-owned paths; use `git show <branch>:<path>` only):\n- topic/omp-workspaces--spike-omp-isolation :: items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml (+003 review)\n- topic/omp-workspaces--spike-mock-provider :: items/spike-mock-provider/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-cache-key :: items/spike-cache-key/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-repo-rules :: items/spike-repo-rules/steps/001-research-r1-a1/output.yaml (+002 review)\n- parent-branch decisions/001 + 002 rulings (read on parent branch).\n\nSteps:\n1. git-show each research output.yaml + its review output; extract the embedded spike-draft markdown.\n2. Apply each review's optional polish notes ONLY where they correct evidence (e.g. probe-26/18 softening, spec-path fix); do not invent new probes.\n3. Write the four drafts to: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md.\n4. Write items/spike-findings-recovery/RECOVERY.md mapping each M1 scenario (isolation probe matrix, mock-provider seam, cache-keying, repo-rules injection) to branch evidence + followUps for iteration-2 planning (M3/M4/M6/M7/M8).\n5. Verify on parent branch only: all five files exist, each spike doc retains probe-evidence/logs + recommendations sections, RECOVERY.md covers all four M1 scenarios.\n\nAcceptance: 4 spike docs + RECOVERY.md present with probe evidence; no prod code changed; no branch checkouts; no .factory/** writes.\n\nConstraints: no-behavior kind; no deps; wave-2 parallel (self-contained, self-heals node_modules via own develop-step gates).",
+  "outlineRef": "spike-findings-recovery",
+  "milestone": "m1-omp-de-risk",
+  "wave": 2,
+  "citations": [
+    "topic/omp-workspaces--spike-omp-isolation:items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml",
+    "topic/omp-workspaces--spike-mock-provider:items/spike-mock-provider/steps/001-research-r1-a1/output.yaml",
+    "topic/omp-workspaces--spike-cache-key:items/spike-cache-key/steps/001-research-r1-a1/output.yaml",
+    "topic/omp-workspaces--spike-repo-rules:items/spike-repo-rules/steps/001-research-r1-a1/output.yaml"
+  ]
+}
+
+## Engine Checks
+
+
+## Test Diff
+
+
+## Code Diff
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml b/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml
+deleted file mode 100644
+index 8a3bcf8..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml
++++ /dev/null
+@@ -1,23 +0,0 @@
+-id: c-0647070832
+-kind: tech-debt
+-summary: Child/merge worktrees still need infra.setup (bun install) before the
+-  bun test runner can collect tests; this worktree had no node_modules until
+-  installed manually
+-detail: Running `bun test` in a fresh worktree failed with `Cannot find package
+-  'yaml'` from test/records-and-fingerprint.test.ts and src/core/prompts.ts
+-  until `bun install` was run. This is the pre-existing open concern
+-  c-552344216d (missing infra.setup in merge-child worktrees), not introduced by
+-  this step; node_modules is gitignored and not part of the change.
+-affects:
+-  - target-red
+-  - wave-merge
+-severity: high
+-status: open
+-source:
+-  record: 001-test-first-r1-a1
+-  agent: developer
+-  step: test-first
+-  item: usage-cache-tokens
+-  lastSeen: 2026-11-10T02:05:24.168Z
+-createdAt: 2026-11-10T02:05:24.168Z
+-updatedAt: 2026-11-10T02:05:24.168Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml b/.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml
+deleted file mode 100644
+index fdfe75a..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml
++++ /dev/null
+@@ -1,24 +0,0 @@
+-id: c-f415508eb1
+-kind: risk
+-summary: Gate runs that inherit the factory-runtime TMPDIR produce unrelated
+-  test failures
+-detail: "When TMPDIR points under .factory-runtime/tmp, disk-space.test.ts
+-  counts the tmpdir itself as a second low-space path (fails: expected 1 failing
+-  path, got 2) and several engine tests fail with git 'could not create
+-  temporary file' or 5s timeouts under contention. With TMPDIR=/tmp the same
+-  full suite is fully green (669 pass / 2 skip / 0 fail). This is
+-  pre-existing/environmental and not caused by this test-only diff, but it
+-  affects gate greenness for any item run in this environment."
+-affects:
+-  - gates
+-  - wave-merge
+-severity: medium
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: transport-byte-stability
+-  lastSeen: 2026-11-10T02:28:29.083Z
+-createdAt: 2026-11-10T02:28:29.083Z
+-updatedAt: 2026-11-10T02:28:29.083Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml b/.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml
+deleted file mode 100644
+index 9f8e15f..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml
++++ /dev/null
+@@ -1,21 +0,0 @@
+-id: rm-4e7a8c758b
+-chosen: Published the full embedded draft for isolation and enriched it with the
+-  approved findings' 27-probe command log, config surface, and follow-ups.
+-alternatives:
+-  - Publish only the compact embedded full draft (fails the
+-    probe-log/recommendations acceptance)
+-  - Reconstruct the whole document from the pre-draft findings (duplicates the
+-    approved draft)
+-why: The M1 directional interface requires findings + probe logs +
+-  recommendations, and the embedded compact draft had no dedicated
+-  probe/recommendation sections; all added content comes from the same approved
+-  research output, so no new probes were invented.
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: spike-findings-recovery
+-  lastSeen: 2026-11-10T02:23:11.570Z
+-createdAt: 2026-11-10T02:23:11.570Z
+-updatedAt: 2026-11-10T02:23:11.570Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml b/.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml
+deleted file mode 100644
+index 3cdbede..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml
++++ /dev/null
+@@ -1,18 +0,0 @@
+-id: rm-63a8ee819c
+-chosen: Wrote RECOVERY.md at the assigned
+-  `items/spike-findings-recovery/RECOVERY.md` item-local path.
+-alternatives:
+-  - Write a repo-root `items/` copy (not the assigned task-workspace path)
+-  - Write under engine-owned `.factory` records (explicitly forbidden)
+-why: Step 4 mandates that path (shorthand for the task's `items/` workspace); no
+-  engine-owned record (`runs/`, `plan/`, `state.yaml`, `journal.ndjson`,
+-  `decisions/`) was modified.
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: spike-findings-recovery
+-  lastSeen: 2026-11-10T02:23:11.570Z
+-createdAt: 2026-11-10T02:23:11.570Z
+-updatedAt: 2026-11-10T02:23:11.570Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml b/.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml
+deleted file mode 100644
+index 8bab5e4..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml
++++ /dev/null
+@@ -1,20 +0,0 @@
+-id: rm-8363899156
+-chosen: Pin the prompt filename instability with explicit shape and difference
+-  assertions plus comments, instead of stabilizing transport.
+-alternatives:
+-  - "Stabilize prompt paths in production code: out of scope for this test-only
+-    item."
+-  - "Only compare normalized argv: would hide the unstable element instead of
+-    pinning it."
+-why: Assignment defers stabilization to M7 after spike-cache-key; a
+-  failing-explicit assertion documents the currently unstable behavior and will
+-  point at the decision when transport is stabilized.
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: transport-byte-stability
+-  lastSeen: 2026-11-10T02:28:29.083Z
+-createdAt: 2026-11-10T02:28:29.083Z
+-updatedAt: 2026-11-10T02:28:29.083Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml b/.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml
+deleted file mode 100644
+index 22471e5..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml
++++ /dev/null
+@@ -1,18 +0,0 @@
+-id: rm-9efb47e04e
+-chosen: Specify zero-default aggregation and optional schema properties, with no
+-  migration of historical records.
+-alternatives:
+-  - Migration/backfill of old records (explicitly out of scope).
+-  - Required schema fields (would invalidate historical records).
+-why: "Matches the assignment contract: absent cache keys in old meta.yaml/NDJSON
+-  must read as 0 and remain schema-valid, while new records persist
+-  cacheReadTokens/cacheWriteTokens/totalTokens and a cost breakdown."
+-status: open
+-source:
+-  record: 001-test-first-r1-a1
+-  agent: developer
+-  step: test-first
+-  item: usage-cache-tokens
+-  lastSeen: 2026-11-10T02:05:24.168Z
+-createdAt: 2026-11-10T02:05:24.168Z
+-updatedAt: 2026-11-10T02:05:24.168Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml b/.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml
+deleted file mode 100644
+index 273f553..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml
++++ /dev/null
+@@ -1,25 +0,0 @@
+-id: rm-ccac403fa7
+-chosen: Characterize transport via a mock omp binary that snapshots argv plus
+-  the --system-prompt/-p/--config files, and guard only the real-binary overlay
+-  acceptance check with omp-presence skip.
+-alternatives:
+-  - "Run harness turns against real omp with live models: paid and flaky,
+-    violates no-paid-turns constraint."
+-  - "Mock the bun spawn module in-process: fragile, bypasses the real argv
+-    assembly path."
+-  - "Test only pure generateOmpConfigOverlay/render functions: cannot pin the
+-    timestamped prompt filename or full argv instability."
+-why: This captures the exact bytes and argv the harness would hand to omp
+-  without contacting a provider (no paid turns) and without requiring omp on a
+-  clean checkout, while still validating the generated overlay with the real
+-  binary when it is installed using the same non-paid `--config <overlay>
+-  --version` preflight performs.
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: transport-byte-stability
+-  lastSeen: 2026-11-10T02:28:29.083Z
+-createdAt: 2026-11-10T02:28:29.083Z
+-updatedAt: 2026-11-10T02:28:29.083Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml b/.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml
+deleted file mode 100644
+index 71f4351..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml
++++ /dev/null
+@@ -1,21 +0,0 @@
+-id: rm-d3a28fa170
+-chosen: Deliver a test-only diff and defer the merge-path.ts implementation to
+-  the follow-up develop step.
+-alternatives:
+-  - Implement mergeItem setup execution in this step as the story assignment
+-    text lists — rejected because target-red would see green and
+-    test-first-scope rejects modified src/** files.
+-  - Introduce a prod interface stub — unnecessary because the tests exercise the
+-    existing mergeItem export.
+-why: The story.dev flow runs test-first-scope (rejects any modified prod file)
+-  and target-red (declared tests must currently fail) in this step; shipping the
+-  implementation here would fail both mechanical checks.
+-status: open
+-source:
+-  record: 001-test-first-r1-a1
+-  agent: developer
+-  step: test-first
+-  item: merge-setup-fix
+-  lastSeen: 2026-11-10T02:12:17.201Z
+-createdAt: 2026-11-10T02:12:17.201Z
+-updatedAt: 2026-11-10T02:12:17.201Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml b/.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml
+deleted file mode 100644
+index c8c12a6..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml
++++ /dev/null
+@@ -1,20 +0,0 @@
+-id: rm-d63aed4fdb
+-chosen: Declare expectRed ids as bare Bun test names rather than file-qualified
+-  `file::test` node ids.
+-alternatives:
+-  - File-qualified `test/...::test` ids (would not match Bun's describe-based
+-    JUnit ids unless the describe name is also embedded).
+-  - Full `<describe>.<test>` ids (brittle to describe renames).
+-why: "Bun's JUnit reporter emits ids as `<innermost describe>.<test name>` with
+-  no file path in the id; the engine's normalizer matches a bare id by suffix
+-  (`id.endsWith('.' + expectId)`). Verified against parseJunit output: all 11
+-  ids match exactly one failing case."
+-status: open
+-source:
+-  record: 001-test-first-r1-a1
+-  agent: developer
+-  step: test-first
+-  item: usage-cache-tokens
+-  lastSeen: 2026-11-10T02:05:24.168Z
+-createdAt: 2026-11-10T02:05:24.168Z
+-updatedAt: 2026-11-10T02:05:24.168Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml b/.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml
+deleted file mode 100644
+index 681e394..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml
++++ /dev/null
+@@ -1,19 +0,0 @@
+-id: rm-eaf2656f2a
+-chosen: Retained `test/e2e/mock-provider` in the mock-provider doc while
+-  documenting why it is justified over `test/harness/mock-provider`.
+-alternatives:
+-  - Rename to `test/harness/mock-provider` (conflicts with the M8 plan interface)
+-  - Drop the proposal path entirely (loses actionable M8 guidance)
+-why: The M8 plan's directional interface explicitly names
+-  `test/e2e/mock-provider/*`, and the split keeps the no-model scripted suite
+-  separate from paid live coverage; the review allowed either the repo idiom or
+-  a justification.
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: spike-findings-recovery
+-  lastSeen: 2026-11-10T02:23:11.570Z
+-createdAt: 2026-11-10T02:23:11.570Z
+-updatedAt: 2026-11-10T02:23:11.570Z
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md
+new file mode 100644
+index 0000000..cfaee73
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md
+@@ -0,0 +1,90 @@
++# Wave-1 spike findings recovery
++
++Status: recovered. Docs-only salvage of approved wave-1 research onto the parent branch.
++
++## Why this exists
++
++All four wave-1 spike items completed research (`status: ok`) and review (`status: approved`), but their wave-end merges failed environmentally: the merge-path gates ran without `infra.setup` in the child worktree, so the missing `node_modules` failed typecheck. No research finding was rejected. This item re-materializes the approved drafts as product docs and records the evidence mapping needed by iteration-2 planning. No production code changed; the source item branches were read via `git show` only (no checkout/switch).
++
++## Source provenance (read-only)
++
++| M1 scenario | Source branch | Research record | Review record | Review outcome |
++|---|---|---|---|---|
++| 1. Isolation probe matrix | `topic/omp-workspaces--spike-omp-isolation` (`cd07f2d`) | `items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml` (`ok`) | `steps/003-review-r1-a1/output.yaml` | `approved`; probe-26/18 interpretation softened |
++| 2. Mock-provider seam | `topic/omp-workspaces--spike-mock-provider` (`85c4b46`) | `items/spike-mock-provider/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; e2e split justified |
++| 3. Cache keying | `topic/omp-workspaces--spike-cache-key` (`c28f43b`) | `items/spike-cache-key/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; spec-path/provenance fixes applied |
++| 4. Repo-rules injection | `topic/omp-workspaces--spike-repo-rules` (`9755c7e`) | `items/spike-repo-rules/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; cwd-scope invariant documented |
++
++Parent-branch decisions consumed:
++
++- `decisions/001-item-spike-repo-rules-1.yaml` — `accept-with-debt`; rulings: M4 replaces the preflight no-op with a real mock-provider turn; M8 builds the scripted mock helper with per-role request-body assertions; M8 keeps omp as sole root injector, implements RULES/extra for scouts, and asserts one sentinel per role; M8 chooses the prompt-isolation policy (profile/agent-dir and/or `disabledExtensions` + empty `--append-system-prompt=`).
++- `decisions/002-item-spike-omp-isolation-1.yaml` — `accept-with-debt`; rulings: M4 replaces `preflight.ts:364-394` with key/enum/catalog validation plus one real isolated round-trip turn; M3 implements the ratified root mapping (`omp worktree add -b <topic-branch> <path> <base> -C <repo>` then `omp --cwd <path> -p`) with `isolation: engine` as the fallback and unchanged engine merge ownership.
++
++## Recovered docs
++
++| Doc | M1 scenario | Evidence preserved |
++|---|---|---|
++| `plugins/software-factory/docs/spikes/omp-3-isolation.md` | 1 | 27-probe command log + excerpts, backend enum, retention matrix, root mapping, `task.isolation` vs engine merge, preflight recipe, draft config surface, recommendations |
++| `plugins/software-factory/docs/spikes/omp-4-mock-provider.md` | 2 | 17-probe log, extension/SSE seam, scenario `{turns}` contract, NDJSON/usage contract, `OmpHarness` wrapper, decision YAML + followUps, sources |
++| `plugins/software-factory/docs/spikes/omp-5-cache-keys.md` | 3 | Transport byte/argv audit, live resume probe log (DeepSeek/Anthropic), TTL/model/content invalidation, cold-resume signals, knob audit, compaction/warming analysis, recommendations, appendix |
++| `plugins/software-factory/docs/spikes/omp-6-repo-rules.md` | 4 | Source inventory, precedence/composition, flag matrix, probe matrix, per-role seams, M8 verification plan, recommendations |
++
++## M1 scenario → evidence mapping
++
++### 1. Isolation probe matrix (M1 scenario-1)
++
++Evidence: `isolation.backend` has exactly 9 accepted values (`auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy`); every value degrades to plain checkout with a FICLONE warning on ext4/WSL2. Retention: `worktree add` + `--cwd` keeps commits/partials/registration on success, failure, and SIGKILL; isolated subagents retain a patch or `omp/task/<Agent>` branch on success **and** failure; parent abort loses all. `worktree.onStart` is a no-op for `-p`. omp `apply:true` produces a single-parent commit with no gates/conflict agent, so engine `merge-path.ts` remains merge owner and subagents use `apply:false`. Preflight must include one real turn (probes 17/18/27: bogus keys, invalid backend overlays, and missing overlays are all accepted by static checks).
++
++FollowUps:
++- **M3**: implement `workspaces.isolation: omp|engine`, the omp backend/worktree/`task.isolation` config surface, `omp worktree add` + `--cwd` root mapping, and keep topic branch naming + engine merge ownership.
++- **M4**: replace `preflight.ts:364-394` with key/enum/catalog validation plus one real isolated round-trip turn; derive status/gc from `git worktree list` + records; classify turn outcome from the `--mode json` transcript, not process rc.
++- **M6**: add cross-launch merge/lock coordination for parallel-epic launches.
++
++### 2. Mock-provider seam (M1 scenario-2)
++
++Evidence: an omp extension loaded with `-e/--extension` calls `pi.registerProvider('mock', {...openai-completions...})` against a local SSE server; `omp models -e ... --json` lists `mock/mock-chat`. Proven end-to-end on real omp 18.18.5 with zero paid calls: text turn, yield envelope, read→yield tool loop, parallel tool calls, session resume, `@role` resolution, parallel processes, and `OmpHarness.run`/`complete` through a wrapper. Scenario format is `{turns: [{text}|{toolCalls}|{yield}]}` with optional `usage`/`finishReason` and top-level `match`/`onExhausted`; error turns are not probed.
++
++FollowUps:
++- **M8**: add `extraArgs`/`mockProvider` to `OmpHarness`; implement `test/e2e/mock-provider/{extension,server,scenario,runner}.ts`, gate with `FACTORY_E2E_OMP=1`, keep paid `FACTORY_LIVE_OMP=1` separate, assert only `mock/mock-chat` requests and `usage.costUsd === 0`.
++- **M4**: use the seam for the preflight real-turn validation.
++
++### 3. Cache keying (M1 scenario-3)
++
++Evidence: omp 18.18.5 keys the prompt cache by request-prefix **content**, not by file path. Identical bytes at a changed system-prompt path still fully hit; a model switch is a full cold read (measured ≈8.9× warm). TTL expiry (Anthropic 5m) causes a cold read; long retention was verified separately. Compaction rewrites history and makes the next resume cold from the cut point. The factory currently detects none of these signals and pins none of the cache/compaction/memory knobs; the manual `-p "/compact"` path exists but its cost is absent from NDJSON.
++
++FollowUps:
++- **M7**: extend usage accounting with `cacheReadTokens`/`cacheWriteTokens`/`totalTokens`/`cacheTtl`/provider/model/reasoning fields; add a per-session cache-state record; record the resolved model used by the successful turn and pass that literal model on resume; pin `providers.cache*`, `compaction.*`, `snapcompact.*`, and `mnemopi.autoRecall/autoRetain` in the overlay; measure long-vs-short retention and fresh-brief-vs-warm-compaction on the self-host fire test; add a mock-provider cache fixture.
++- **M4**: validate effective overlay values (not `--version`) and read back performance-relevant settings in preflight.
++
++### 4. Repo-rules injection (M1 scenario-4)
++
++Evidence: root omp sessions discover and inject repo context/rules into a trailing `<repo-rules>` footer; `--system-prompt` replaces block 0 only. The current factory has no double injection because role prompts contain no repo-rule text. Copying rules into role prompts or append prompts double-injects (2 sentinel copies). omp `task` subagents drop `AGENTS.md` but keep `RULES.md` and `contextFiles.extra`. User-level `APPEND_SYSTEM.md`, `AGENTS.md`, and `RULES.md` leak into roles unless isolated or suppressed; only an explicit empty `--append-system-prompt=` suppresses the append file. Resume re-discovers repo rules each process, while the static block-0 prefix stays stable.
++
++FollowUps:
++- **M4**: replace the preflight `--config --version` no-op using the mock-provider real-turn recipe.
++- **M8**: keep omp as sole injector for root roles; implement `RULES.md`/`contextFiles.extra` (or delegation context) for scouts; add sentinel-based per-role request-body tests; choose and enforce the user-level contamination policy; keep factory launches at worktree roots because `.omp/rules` and `.claude/CLAUDE.md` are cwd-only.
++
++## Iteration-2 follow-up index
++
++| Milestone | Follow-up | Source |
++|---|---|---|
++| M3 | omp workspace backend + `isolation: engine` fallback + config surface + unchanged branch/merge ownership | `omp-3-isolation.md` §7/§9/§10; decision 002 |
++| M4 | preflight version/key/enum/catalog checks + one real isolated round trip; status/gc from git records; transcript-based outcome | `omp-3-isolation.md` §5/§10, `omp-5-cache-keys.md` §9.5, `omp-6-repo-rules.md` §6; decisions 001/002 |
++| M6 | cross-launch merge/lock coordination for parallel epics; per-epic workspace isolation | `omp-3-isolation.md` §10 |
++| M7 | cache/compaction usage plumbing, session cache-state, literal model on resume, overlay pins, retention measurement, mock cache fixture | `omp-5-cache-keys.md` §9/§10/§11 |
++| M8 | scripted mock-provider helper + `extraArgs`; repo-rules hydration/sentinel tests; user-level isolation policy; no-model e2e and use-case docs | `omp-4-mock-provider.md` §M8/decision, `omp-6-repo-rules.md` §6/§7 |
++
++## Review polish ledger
++
++Applied only where the note corrected evidence (no new probes invented):
++
++- **Isolation** — probe 26 corrected: in-base explicit-path worktrees are listed by `worktree list --json` when `OMP_WORKTREE_DIR` is aligned; outside-base trees are invisible; live trees are never reported as orphans. Probe 18 softened: invalid backend overlay is accepted, but `config get` ignores `--config` overlays, so runtime coercion is unproven. Retention matrix scoped to single-host omp 18.18.5/ext4/WSL2.
++- **Cache** — spec source fixed to `docs/factory.v2.md:114-120`; `tokensAfter`/`method` attributed to the transcript `compaction` entry rather than the NDJSON result; long/none retention probes qualified as YAML-only artifacts; dead `steps/architect-resume` fragment noted while keeping the byte-diff evidence valid.
++- **Repo rules** — worktree-root cwd invariant documented because `.omp/rules` and `.claude/CLAUDE.md` are cwd-only.
++- **Mock provider** — the `test/e2e/` split is retained and justified: it separates the no-model scripted suite from paid live coverage and matches the M8 plan's directional interface. The optional raw-NDJSON-excerpt and unprobed-error-turn notes remain disclosed limitations, not re-probed here.
++
++## Verification
++
++- All five recovery outputs exist and each spike doc contains a findings section plus probe evidence/log and recommendations/M8 sections (see the recovered-docs table).
++- Source records were read with `git show <branch>:<path>`; no branch was checked out.
++- No production code changed. No engine-owned record (`runs/`, `plan/`, `state.yaml`, `journal.ndjson`, `decisions/`) was modified; the only orchestration-folder write is this item's assigned deliverable `items/spike-findings-recovery/RECOVERY.md`.
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..3f4821c
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/checks.yaml
+@@ -0,0 +1,116 @@
++checks:
++  - id: gates
++    status: pass
++    message: Gates passed (2 gates)
++    details:
++      - id: typecheck
++        command: bun --cwd=plugins/software-factory run typecheck
++        status: pass
++        durationMs: 7518
++        details: $ tsc --noEmit
++      - id: test
++        command: bun --cwd=plugins/software-factory test
++        status: pass
++        durationMs: 520862
++        details: >-
++          bun test v1.4.4 (38afee6c8)
++
++          Disk space check passed (threshold 2048 MB):
++            worktreeRoot (/tmp/factory-test-repo-OFsFtD.factory-wt): 4473 MB free
++            .factory-runtime/tmp (/tmp/factory-test-repo-OFsFtD.factory-wt/.factory-runtime/tmp): 4473 MB free
++            repoRoot (/tmp/factory-test-repo-OFsFtD): 4473 MB free
++            tmpdir (/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp): 79632 MB free
++            /tmp (/tmp): 4473 MB free
++          ================================================================
++
++          Task: status-test-task [ACTIVE]
++
++          Kind: unclassified | Iteration: 1 | Wave: 1
++
++          Worktree: (none - main checkout)
++
++          Config path: /tmp/factory-test-repo-z4yvBN/.factory/pipeline.yaml
++
++          Budget spent: $0.0000
++
++          ----------------------------------------------------------------
++
++          Waves & Items:
++            Wave 1:
++          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
++
++          ----------------------------------------------------------------
++
++          Blocking Questions:
++            (none)
++          ----------------------------------------------------------------
++
++          Digest Questions:
++            (none)
++          ================================================================
++
++
++
++          test/config-worktree-layering.test.ts:
++
++          [factory preflight] Preflight failed with 1 error(s):
++            - Pipeline config loading failed: Invalid pipeline configuration:
++          /limits/maxIterations: must be integer ({"type":"integer"})
++
++
++          test/disk-space.test.ts:
++
++          52 |       probe,
++
++          53 |     });
++
++          54 | 
++
++          55 |     expect(res.ok).toBe(false);
++
++          56 |     expect(res.minFreeDiskMb).toBe(2048);
++
++          57 |     expect(res.failingPaths.length).toBe(1);
++                                                   ^
++          error: expect(received).toBe(expected)
++
++
++          Expected: 1
++
++          Received: 2
++
++                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery/plugins/software-factory/test/disk-space.test.ts:57:37)
++          (fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace
++          verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
++          [34.45ms]
++
++
++          test/cli/cli.test.ts:
++
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999
++          on host Slava-Yoga) taken over by PID 3677721
++
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID
++          9999999 on host Slava-Yoga) taken over by PID 3677721
++
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID
++          9999999 on host Slava-Yoga) taken over by PID 3677721
++
++           663 pass
++           2 skip
++           1 fail
++           3736 expect() calls
++          Ran 666 tests across 101 files. [268.45s]
++        failingTests:
++          - Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies
++            worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
++  - id: size
++    status: pass
++    message: "size passed: 0/300 production lines changed"
++    details:
++      changedLines:
++        added: 0
++        deleted: 0
++        total: 0
++        files: []
++      limit: 300
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..b336ce5
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/input.md
+@@ -0,0 +1,92 @@
++# Step: Develop
++
++## Goal
++Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
++
++## Rules
++- Target green: every test selector and case identified in `target` MUST pass cleanly.
++- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
++- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
++- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
++- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
++
++## Assignment
++{
++  "slug": "spike-findings-recovery",
++  "kind": "no-behavior",
++  "title": "Recover wave-1 spike findings onto parent branch",
++  "assignment": "Salvage approved wave-1 spike research stranded on environmentally-failed item branches onto the parent branch. All research steps + reviews are approved; only wave-end merges failed (missing node_modules). Docs only, zero prod lines.\n\nRead-only sources (NEVER checkout/switch branches, NEVER write to .factory/** engine-owned paths; use `git show <branch>:<path>` only):\n- topic/omp-workspaces--spike-omp-isolation :: items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml (+003 review)\n- topic/omp-workspaces--spike-mock-provider :: items/spike-mock-provider/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-cache-key :: items/spike-cache-key/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-repo-rules :: items/spike-repo-rules/steps/001-research-r1-a1/output.yaml (+002 review)\n- parent-branch decisions/001 + 002 rulings (read on parent branch).\n\nSteps:\n1. git-show each research output.yaml + its review output; extract the embedded spike-draft markdown.\n2. Apply each review's optional polish notes ONLY where they correct evidence (e.g. probe-26/18 softening, spec-path fix); do not invent new probes.\n3. Write the four drafts to: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md.\n4. Write items/spike-findings-recovery/RECOVERY.md mapping each M1 scenario (isolation probe matrix, mock-provider seam, cache-keying, repo-rules injection) to branch evidence + followUps for iteration-2 planning (M3/M4/M6/M7/M8).\n5. Verify on parent branch only: all five files exist, each spike doc retains probe-evidence/logs + recommendations sections, RECOVERY.md covers all four M1 scenarios.\n\nAcceptance: 4 spike docs + RECOVERY.md present with probe evidence; no prod code changed; no branch checkouts; no .factory/** writes.\n\nConstraints: no-behavior kind; no deps; wave-2 parallel (self-contained, self-heals node_modules via own develop-step gates).",
++  "outlineRef": "spike-findings-recovery",
++  "milestone": "m1-omp-de-risk",
++  "wave": 2,
++  "citations": [
++    "topic/omp-workspaces--spike-omp-isolation:items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml",
++    "topic/omp-workspaces--spike-mock-provider:items/spike-mock-provider/steps/001-research-r1-a1/output.yaml",
++    "topic/omp-workspaces--spike-cache-key:items/spike-cache-key/steps/001-research-r1-a1/output.yaml",
++    "topic/omp-workspaces--spike-repo-rules:items/spike-repo-rules/steps/001-research-r1-a1/output.yaml"
++  ]
++}
++
++## Target
++tests
++
++## Context & Citations
++[
++  "topic/omp-workspaces--spike-omp-isolation:items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml",
++  "topic/omp-workspaces--spike-mock-provider:items/spike-mock-provider/steps/001-research-r1-a1/output.yaml",
++  "topic/omp-workspaces--spike-cache-key:items/spike-cache-key/steps/001-research-r1-a1/output.yaml",
++  "topic/omp-workspaces--spike-repo-rules:items/spike-repo-rules/steps/001-research-r1-a1/output.yaml"
++]
++
++## Review Feedback
++
++
++## Open Concerns
++- id: c-552344216d
++  kind: blocker
++  severity: high
++  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
++  affects:
++    - "19.2"
++    - wave-merge
++- id: c-f972360209
++  kind: tech-debt
++  severity: medium
++  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
++  affects:
++    - redrive
++    - wave-merge
++
++
++- Review the concerns above before starting; they constrain this step but are not part of the assignment.
++- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
++- summary (string, required): Concise summary of implementation actions and test results
++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
++  - Option 1:
++    - selectors (array of string, required)
++    - expectRed (array of string, required, minItems: 1)
++  - Option 2:
++    - gate (string, required)
++  - Option 3:
++    - command (string, required)
++    - customTarget (boolean, required)
++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
++- concerns (array of object, optional): Structured concerns raised during implementation
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
++- notes (string, optional): Optional developer notes, implementation observations, or comments
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..d8c6979
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/meta.yaml
+@@ -0,0 +1,20 @@
++seq: 1
++name: develop
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-10T01:58:58.390Z
++session: 01a1c32e-1401-7277-bf9d-7bf38233f921
++endedAt: 2026-11-10T02:23:11.631Z
++usage:
++  inputTokens: 139228
++  outputTokens: 49219
++  costUsd: 0.071688
++repairedFrom: ask
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-329Z_01a1c32e-1401-7277-bf9d-7bf38233f921.jsonl
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..1e2c16b
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/output.yaml
+@@ -0,0 +1,82 @@
++status: ok
++summary: Recovered all four approved wave-1 spike drafts from their item
++  branches via read-only `git show` and published them as
++  `plugins/software-factory/docs/spikes/omp-3-isolation.md`,
++  `omp-4-mock-provider.md`, `omp-5-cache-keys.md`, and `omp-6-repo-rules.md`.
++  Applied only evidence-correcting review polish (probe-26/18 softening,
++  single-host retention scope, cache spec-path + compaction provenance +
++  artifact-completeness fixes, dead-fragment note, repo cwd invariant, justified
++  mock e2e split) and invented no probes. Wrote
++  `items/spike-findings-recovery/RECOVERY.md` mapping each M1 scenario to branch
++  evidence and M3/M4/M6/M7/M8 followUps, including the parent decision 001/002
++  rulings. No production source changed and no branch was checked out.
++  Self-healed missing `node_modules` with `bun install`; typecheck is green.
++  Full-suite tests show the known baseline-red disk-space test plus
++  environment-sensitive failures caused by two overlapping suite runs on this
++  shared host; isolated reruns of the affected engine files pass.
++target:
++  gate: test
++evidence:
++  - "Provenance: `git show
++    topic/omp-workspaces--spike-{omp-isolation,mock-provider,cache-key,repo-rul\
++    es}:<step>/output.yaml` confirmed research status `ok` and all four review
++    outputs `approved`."
++  - "Draft fidelity: ordered-line comparison against the embedded drafts shows
++    only the intended polish lines differ; isolation differs only on the
++    probe-26 and probe-18 corrections, mock only on the M8 e2e justification,
++    cache only on the four evidence corrections, repo retains all lines plus the
++    cwd recommendation."
++  - "Output verification: all five files exist — four spike docs
++    (123/133/308/128 lines) plus RECOVERY.md (90 lines); each spike doc contains
++    probe evidence/log and recommendations/M8 sections; RECOVERY.md names all
++    four M1 scenarios and M3/M4/M6/M7/M8 followUps (programmatic assertions
++    passed)."
++  - "Typecheck gate: `cd plugins/software-factory && bun install` (self-heal
++    gitignored node_modules) then `bun run typecheck` exited 0 (`tsc --noEmit`
++    clean)."
++  - "Test gate: full `bun test` executed 666 tests (652 pass / 2 skip / 12 fail
++    / 5 errors) while an earlier full-suite run was still active on the shared
++    host; targeted isolation rerun `bun test test/engine/head-guard.test.ts
++    test/engine/fix-round-reentry.test.ts` passed 3/3 with exit 0, confirming
++    the failures were concurrency-induced; the known baseline-red
++    `test/disk-space.test.ts` remains the only documented baseline failure."
++  - "Tree state: `git status --short` shows only the four new spike docs and
++    RECOVERY.md; `git diff --numstat` shows zero production source changes; no
++    branch checkout/switch was performed. The staged item `meta.yaml` session
++    field is engine-written and was not touched."
++remarkable:
++  - chosen: Published the full embedded draft for isolation and enriched it with the
++      approved findings' 27-probe command log, config surface, and follow-ups.
++    why: The M1 directional interface requires findings + probe logs +
++      recommendations, and the embedded compact draft had no dedicated
++      probe/recommendation sections; all added content comes from the same
++      approved research output, so no new probes were invented.
++    alternatives:
++      - Publish only the compact embedded full draft (fails the
++        probe-log/recommendations acceptance)
++      - Reconstruct the whole document from the pre-draft findings (duplicates
++        the approved draft)
++  - chosen: Retained `test/e2e/mock-provider` in the mock-provider doc while
++      documenting why it is justified over `test/harness/mock-provider`.
++    why: The M8 plan's directional interface explicitly names
++      `test/e2e/mock-provider/*`, and the split keeps the no-model scripted
++      suite separate from paid live coverage; the review allowed either the repo
++      idiom or a justification.
++    alternatives:
++      - Rename to `test/harness/mock-provider` (conflicts with the M8 plan
++        interface)
++      - Drop the proposal path entirely (loses actionable M8 guidance)
++  - chosen: Wrote RECOVERY.md at the assigned
++      `items/spike-findings-recovery/RECOVERY.md` item-local path.
++    why: Step 4 mandates that path (shorthand for the task's `items/` workspace); no
++      engine-owned record (`runs/`, `plan/`, `state.yaml`, `journal.ndjson`,
++      `decisions/`) was modified.
++    alternatives:
++      - Write a repo-root `items/` copy (not the assigned task-workspace path)
++      - Write under engine-owned `.factory` records (explicitly forbidden)
++notes: The full test suite was executed twice on a shared host with concurrent
++  factory sessions; overlapping runs produced transient engine-test failures
++  that pass in isolation. No test or source file was changed by this item, so
++  those failures cannot be attributed to this diff. `bun install` created only
++  gitignored `node_modules`, which also removes the merge-path typecheck blocker
++  (missing node_modules) for this worktree.
+diff --git a/.factory/tasks/omp-workspaces/journal.ndjson b/.factory/tasks/omp-workspaces/journal.ndjson
+index aa2bd98..bd0bfd0 100644
+--- a/.factory/tasks/omp-workspaces/journal.ndjson
++++ b/.factory/tasks/omp-workspaces/journal.ndjson
+@@ -179,31 +179,3 @@
+ {"type":"step_started","task":"omp-workspaces","step":"pm-amend-1-1","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces/.factory/tasks/omp-workspaces/runs/016-pm-amend-1-1-a1","ts":"2026-11-10T01:58:23.267Z"}
+ {"type":"step_timeout_armed","task":"omp-workspaces","step":"pm-amend-1-1","timeoutSec":2700,"ts":"2026-11-10T01:58:23.271Z"}
+ {"type":"step_finished","task":"omp-workspaces","step":"pm-amend-1-1","attempt":1,"status":"ok","sessionId":"01a1c32d-8867-7723-95d2-878ad3ce217f","usage":{"inputTokens":23942,"outputTokens":4443,"costUsd":0.003283},"ts":"2026-11-10T01:58:56.769Z"}
+-{"type":"wave_started","wave":2,"iteration":1,"ts":"2026-11-10T01:58:57.650Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--usage-cache-tokens/.factory/tasks/omp-workspaces/items/usage-cache-tokens/steps/001-test-first-r1-a1","ts":"2026-11-10T01:58:58.322Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","timeoutSec":5400,"ts":"2026-11-10T01:58:58.327Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--transport-byte-stability/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1","ts":"2026-11-10T01:58:58.394Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","timeoutSec":5400,"ts":"2026-11-10T01:58:58.401Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1","ts":"2026-11-10T01:58:58.508Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","timeoutSec":5400,"ts":"2026-11-10T01:58:58.516Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1","ts":"2026-11-10T01:58:58.632Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","timeoutSec":5400,"ts":"2026-11-10T01:58:58.639Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"sizeBytes":10510823,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-852Z_01a1c32e-1224-72a4-b1e9-c14d90c8551d.jsonl","ts":"2026-11-10T02:05:21.946Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"toolCalls":110,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-852Z_01a1c32e-1224-72a4-b1e9-c14d90c8551d.jsonl","ts":"2026-11-10T02:05:21.946Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1c32e-1224-72a4-b1e9-c14d90c8551d","usage":{"inputTokens":115693,"outputTokens":43458,"costUsd":0.058962},"ts":"2026-11-10T02:05:24.330Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"sizeBytes":12075086,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-329Z_01a1c32e-1401-7277-bf9d-7bf38233f921.jsonl","ts":"2026-11-10T02:05:50.227Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"toolCalls":111,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-329Z_01a1c32e-1401-7277-bf9d-7bf38233f921.jsonl","ts":"2026-11-10T02:05:50.228Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:05:54.916Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:05:58.777Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"sizeBytes":5435764,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-869Z_01a1c32e-1235-7054-84d9-126190c40577.jsonl","ts":"2026-11-10T02:06:51.065Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:06:54.313Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:06:57.347Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"sizeBytes":5725555,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-097Z_01a1c32e-1319-71c5-8ba5-7d9366c17208.jsonl","ts":"2026-11-10T02:08:28.709Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"toolCalls":93,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-097Z_01a1c32e-1319-71c5-8ba5-7d9366c17208.jsonl","ts":"2026-11-10T02:08:28.709Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:08:31.055Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:08:33.409Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"method":"ask","ts":"2026-11-10T02:12:14.696Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1c32e-1319-71c5-8ba5-7d9366c17208","usage":{"inputTokens":204993,"outputTokens":50291,"costUsd":0.068727},"ts":"2026-11-10T02:12:17.328Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"method":"ask","ts":"2026-11-10T02:14:23.165Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"method":"ask","ts":"2026-11-10T02:20:04.945Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c32e-1401-7277-bf9d-7bf38233f921","usage":{"inputTokens":139228,"outputTokens":49219,"costUsd":0.071688},"ts":"2026-11-10T02:23:11.689Z"}
+diff --git a/.factory/tasks/omp-workspaces/state.yaml b/.factory/tasks/omp-workspaces/state.yaml
+index 1ed059f..0f64339 100644
+--- a/.factory/tasks/omp-workspaces/state.yaml
++++ b/.factory/tasks/omp-workspaces/state.yaml
+@@ -36,42 +36,24 @@ items:
+     fixRounds: 1
+     spendUsd: 0.11246700000000001
+     currentStep: review
+-  merge-setup-fix:
+-    kind: dev
+-    status: running
+-    branch: topic/omp-workspaces--merge-setup-fix
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0.068727
+-    currentStep: test-first
+-  spike-findings-recovery:
+-    kind: no-behavior
+-    status: running
+-    branch: topic/omp-workspaces--spike-findings-recovery
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0.071688
+-    currentStep: develop
+   transport-byte-stability:
+     kind: test-only
+-    status: running
++    status: pending
+     branch: topic/omp-workspaces--transport-byte-stability
+     attempts: 1
+     fixRounds: 1
+     spendUsd: 0
+-    currentStep: develop
+   usage-cache-tokens:
+     kind: dev
+-    status: running
++    status: pending
+     branch: topic/omp-workspaces--usage-cache-tokens
+     attempts: 1
+     fixRounds: 1
+-    spendUsd: 0.058962
+-    currentStep: test-first
++    spendUsd: 0
+ concerns:
+-  open: 3
++  open: 24
+   dismissed: 1
+-  routed: 33
++  routed: 10
+   resolved: 0
+ debt:
+   - "Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2
+@@ -106,14 +88,8 @@ debt:
+     defaults"
+   - "[19.6] Saga launches do not exist and epic INTENT is not resolvable by
+     `factory run`"
+-  - "[19.3] Runtime dirs sessions/prompts/system-prompts grow without cleanup"
+-  - "[19.2] Hard-coded omp fallback path in preflight"
+   - "[spike-repo-rules] Cwd-scoped sources: `.omp/rules` and `.claude/CLAUDE.md`
+     are launch-directory-only"
+-  - "[spike-mock-provider] OmpHarness has no extension/extra-arg seam; mock
+-    provider needs a wrapper or new option"
+-  - "[19.1] spike-omp-isolation polish notes deferred to iteration-2 M3/M4
+-    planning"
+   - "[spike-cache-key] Findings cite nonexistent
+     plugins/software-factory/docs/factory.v2.md"
+   - "[spike-cache-key] 7.1 misattributes tokensAfter/method to NDJSON result"
+@@ -134,29 +110,25 @@ debt:
+   - "[spike-omp-isolation] Reconcile mock-provider negative with sibling spikes"
+   - "[spike-repo-rules] Preserve worktree-root cwd; .omp/rules +
+     .claude/CLAUDE.md are cwd-only"
+-budgetSpentUsd: 1.2976133999999995
++budgetSpentUsd: 1.0690054
+ spendByRole:
+   workhorse:
+-    costUsd: 1.0833324
+-    inputTokens: 2341044
+-    outputTokens: 835217
++    costUsd: 0.8839554
++    inputTokens: 1881130
++    outputTokens: 692249
+   alt-workhorse:
+-    costUsd: 0.091624
+-    inputTokens: 393774
+-    outputTokens: 183082
++    costUsd: 0.086165
++    inputTokens: 357804
++    outputTokens: 174090
+   architect:
+-    costUsd: 0.116293
+-    inputTokens: 664435
+-    outputTokens: 80172
++    costUsd: 0.09252099999999999
++    inputTokens: 606147
++    outputTokens: 59551
+   alt-architect:
+     costUsd: 0.006364
+     inputTokens: 28896
+     outputTokens: 15650
+ spendByItem:
+-  merge-setup-fix:
+-    costUsd: 0.068727
+-    inputTokens: 204993
+-    outputTokens: 50291
+   spike-omp-isolation:
+     costUsd: 0.45245700000000005
+     inputTokens: 1135682
+@@ -169,20 +141,12 @@ spendByItem:
+     costUsd: 0.11246700000000001
+     inputTokens: 225196
+     outputTokens: 108718
+-  spike-findings-recovery:
+-    costUsd: 0.071688
+-    inputTokens: 139228
+-    outputTokens: 49219
+   spike-cache-key:
+     costUsd: 0.155598
+     inputTokens: 331901
+     outputTokens: 152018
+-  usage-cache-tokens:
+-    costUsd: 0.058962
+-    inputTokens: 115693
+-    outputTokens: 43458
+   (orchestration):
+-    costUsd: 0.2531174
+-    inputTokens: 1020097
+-    outputTokens: 193287
+-lastUpdated: 2026-11-10T02:23:12.497Z
++    costUsd: 0.22388639999999999
++    inputTokens: 925839
++    outputTokens: 163674
++lastUpdated: 2026-11-10T01:45:03.449Z
+diff --git a/plugins/software-factory/docs/spikes/omp-3-isolation.md b/plugins/software-factory/docs/spikes/omp-3-isolation.md
+new file mode 100644
+index 0000000..fcc0b75
+--- /dev/null
++++ b/plugins/software-factory/docs/spikes/omp-3-isolation.md
+@@ -0,0 +1,123 @@
++# Spike omp-3: omp isolation mechanics + backend decision
++
++- omp 18.18.5 (`omp/18.18.5`), WSL2 Linux, ext4 (no FICLONE)
++- Throwaway `--profile spk-*`; mktemp repos per run
++- Prior: omp-1-topology.md:189-215, omp-2-cli-adapter.md
++
++## 1. isolation.backend values
++
++`auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy` (default auto). `config set <enum> __invalid__` prints `Valid values: ...` and exits nonzero. Trial overlays set each value then ran `omp worktree add`: all rc=0, all fell back to plain checkout with FICLONE warning on ext4. Backend = clone mechanism only; verify with a round-trip.
++
++## 2. Retention matrix
++
++| Mechanism | Success | Fail | Abort (SIGKILL) |
++|---|---|---|---|
++| worktree add + --cwd | commit on topic branch; parent clean | staged partial retained | untracked partial + branch + registration retained |
++| isolated patch apply=false | .patch retained, parent clean | .patch preserved | — |
++| isolated branch apply=false | omp/task/<Agent> + commit | branch preserved with partial commit | total loss |
++| isolated branch apply=true | single-parent commit, branch deleted | failures preserve | — |
++
++Single-host scope: these retention results are from omp 18.18.5 on ext4/WSL2; treat abort/SIGKILL retention as host-specific until re-probed elsewhere.
++
++`commits=generic` → `<AgentId>`; `commits=ai` → `chore: add ...`. No `omp isolated-task` CLI; failing turns exit rc=0.
++
++## 3. Root-process mapping
++
++`worktree.onStart/onExit/cleanSource` and `/wt` are interactive-only. Factory root process: `omp worktree add -b <topic/*> <path> <base> -C <repo>` (OMP_WORKTREE_DIR) then `omp --cwd <path> -p`. `omp worktree list --json` lists in-base explicit-path worktrees when `OMP_WORKTREE_DIR` is aligned (kind `pr-checkout`); outside-base trees are invisible. `omp worktree clear --dry-run` correctly reports no orphans for live trees; `--all --dry-run` lists them. Status/gc use `git worktree list` + records.
++
++## 4. task.isolation vs engine merge
++
++omp apply/merge/commits are per-subagent capture preferences ending in a retained artifact or a single-parent auto-commit (no gates). Engine merge-path.ts adds merge locks, parent-into-child trial, integrate agent, gates/target-green, --no-ff merge, worktree removal with branch kept, hooks, journaling. Keep engine merges.
++
++## 5. Preflight
++
++Free: version ≥18.18.5; unknown-key oracle config get rc=1; enum oracle config set invalid; models find + modelRoles; repo state. Real turn: mktemp repo, one -p turn spawning isolated marker subagent apply:false, assert patch/branch artifact, cleanup. ~16s cheapest.
++
++## 6. Overlay gaps (c-477404c672)
++
++Bogus key → BADKEY_OK rc=0; invalid backend overlay is accepted, but `config get` ignores `--config` overlays so runtime coercion is unproven (probe 18 softened); missing overlay → --version succeeds. Current preflight.ts:364-394 validates nothing about content; replace with schema check + real turn.
++
++## 7. Decision
++
++isolation: omp by default (engine fallback kept): omp creates/clones worktrees and optionally captures subagent work; engine owns branches, merges, gates, commits, gc, records.
++
++## 8. Probe-command log
++
++Throwaway `--profile spk-*`, `mktemp`-isolated repos; paid turns on cheapest catalog model `alibaba-token-plan/deepseek-v4-flash-0731` (~10 turns).
++
++| # | Probe | Command (abridged) | Result |
++|---|-------|-------------------|--------|
++| 1 | version/help | `omp --version; omp --help` | `omp/18.18.5`; no `task`/`isolated-task` command |
++| 2 | schema | `omp config list --json` filtered | 9-value backend; task.isolation keys present |
++| 3 | fresh defaults | `config get <key>` ×10 | backend auto, enabled false, apply true, merge patch, commits generic, onStart off, onExit keep, clone true, base unset |
++| 4 | enum oracle | `config set <key> __invalid__` | backend 9 values; merge `patch,branch`; commits `generic,ai` |
++| 5 | backend trial ×9 | `config set isolation.backend $b` + `worktree add -b t-$b $BASE/wt-$b HEAD -C $R` | all rc=0, all FICLONE fallback to plain checkout, 9 branches/worktrees |
++| 6 | --cwd success | turn creates+commits `TURN_OK.txt` | `DONE`; wt log `1d958ca spike: turn ok`; parent untouched |
++| 7 | --cwd failure | stage `FAIL_PARTIAL.txt`, then eval-throw | process rc=**0** despite in-turn error; `A FAIL_PARTIAL.txt` retained; parent untouched |
++| 8 | --cwd SIGKILL | SIGKILL after `KILL_PARTIAL.txt` appears | `?? KILL_PARTIAL.txt` retained; branch+worktree registration intact |
++| 9 | isolated success patch | eval `agent(...,{isolated:true,apply:false})` | `Captured at .../omp-eval-agent-<id>/UpsetMongoose.patch (apply=false). Not applied.` |
++| 10 | isolated success branch | same, `merge=branch` | `omp/task/ParentalPelican` = `e10e903 ParentalPelican`; parent clean |
++| 11 | isolated failure branch | subagent stages file then throws `SUB_FAIL` | wait rejects BUT `Captured branch preserved as omp/task/PoliteOrangutan` with `ISO_FAIL.txt` |
++| 12 | isolated failure patch | creates file then throws `SUB_FAIL2` | `Captured patch preserved at .../RevolutionaryCentipede.patch` |
++| 13 | isolated success apply | `apply:true` | parent main gains single-parent `68e5586 DecentAnaconda`; branch deleted |
++| 14 | parent abort | SIGKILL parent during isolated `sleep 120` | no branch, file, or worktree entry; output lost |
++| 15 | commits=ai | branch capture with `commits=ai` | `chore: add iso_ai_msg.txt file` vs generic `<AgentId>` |
++| 16 | overlay accepted | `--config overlay.yml` + real turn | `OVERLAY_OK` rc=0 |
++| 17 | bogus overlay key | `task.isolation.noSuchKey: true` + real turn | silently ignored: `BADKEY_OK` rc=0 |
++| 18 | invalid backend overlay | `isolation.backend: __invalid__` | accepted by `--version`; **coercion unproven** — `config get` ignores `--config` overlays |
++| 19 | role resolution + | `--model @probe-role` + real turn | `ROLE_OK` rc=0 |
++| 20 | role resolution − | `--model @no-such-role-xyz` | `Model ... not found`, rc=1, no spend |
++| 21 | bogus model | `--model bogus-provider-xyz/...` | `Model ... not found`, rc=1, no spend |
++| 22 | catalog lookup | `models find deepseek-v4-pro --json` | free selector/provider/thinking metadata |
++| 23 | cheapest preflight | one `-p` turn spawning isolated marker subagent, `apply:false` | `PF_RESULT:...DustyBeetle.patch`, **15.6s**; bare no-op turn 5.2s |
++| 24 | onStart scope | `worktree.onStart=create` + `-p` turn | no worktree; stayed in `$R`, only main |
++| 25 | add w/o path | `omp worktree add -C $R` | `Error: Missing required argument: path` |
++| 26 | gc listing | `worktree list --json`, `clear --dry-run` | in-base explicit paths listed when `OMP_WORKTREE_DIR` aligned; outside-base invisible; live trees never reported as orphans |
++| 27 | bad key/missing overlay | `config get no.such.key`; `--config /tmp/missing --version` | unknown key rc=1; missing overlay silently ignored (18.18.5, rc=0) |
++
++Probe excerpts:
++
++```text
++$ omp --profile $P config set isolation.backend __invalid__
++Error: Invalid value: __invalid__. Valid values: auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy
++
++$ omp worktree add -b t-auto $BASE/wt-auto HEAD -C $R
++Preparing worktree (new branch 't-auto')
++HEAD is now at eb6c019 init
++warning: worktree clone fell back to plain checkout: git worktree add: FICLONE unsupported ... (os error 95)
++
++Isolation: changes captured on branch `omp/task/ParentalPelican` (apply=false). Not merged.
++Error: SUB_FAIL ... Captured branch preserved as omp/task/PoliteOrangutan.
++"Merged branch: omp/task/DecentAnaconda"   # parent 68e5586, single parent b9e032f
++```
++
++## 9. Draft isolation config surface
++
++```yaml
++workspaces:
++  isolation: omp              # omp | engine (default omp)
++  omp:
++    backend: auto             # isolation.backend enum (9 values)
++    worktreeClone: true       # worktree.clone (clone-first, fallback ok)
++    cleanSource: false        # worktree.cleanSource (interactive /wt only)
++    onStart: off              # informational: no effect on -p turns
++    onExit: keep              # informational: no effect on engine worktrees
++    baseDir: null             # worktree.base / OMP_WORKTREE_DIR; null = ~/.omp/wt
++    worktreeScope: repo       # session.worktreeScope
++    taskIsolation:
++      enabled: true           # gate for isolated:true subagents
++      apply: false            # engine merges; never auto-apply
++      merge: branch           # branch (auditable) | patch (lightweight)
++      commits: generic        # generic (agent-id stub); ai = harness-invented
++```
++
++Overlay additions (extends `overlay.ts:51-85`): `isolation: { backend: <workspaces.omp.backend> }` and `task: { isolation: { enabled, apply, merge, commits } }`. The overlay cannot express `worktree.*` path/base per run; pass `-C`/`--cwd`/`OMP_WORKTREE_DIR` instead.
++
++## 10. Recommendations / follow-ups
++
++- Implement `workspaces.isolation: omp|engine` plus the omp backend/worktree/task.isolation config surface above.
++- Replace the preflight `omp --config --version` check (`preflight.ts:364-394`) with key/enum/catalog validation and one real isolated round-trip turn (probe 23).
++- Classify turn outcome from the `--mode json` transcript, not process rc (probe 7).
++- Derive gc/status from `git worktree list` + records; document the omp `worktree list` blind spot for outside-base trees (probe 26).
++- Add cross-launch merge/lock coordination for the parallel-epic saga.
++- Add a scripted mock model provider for no-models e2e tests (see `omp-4-mock-provider.md`).
+diff --git a/plugins/software-factory/docs/spikes/omp-4-mock-provider.md b/plugins/software-factory/docs/spikes/omp-4-mock-provider.md
+new file mode 100644
+index 0000000..9cfe4d0
+--- /dev/null
++++ b/plugins/software-factory/docs/spikes/omp-4-mock-provider.md
+@@ -0,0 +1,133 @@
++# Spike: scripted mock provider seam for real omp (M1)
++
++Status: ok. Environment: omp/18.18.5 (`omp/18.18.5`), Bun 1.4.4, Linux x64 WSL2. Throwaway profiles and temp dirs; zero paid-model calls.
++
++## Verdict
++
++Chosen seam: an omp extension loaded with `-e/--extension` calls `pi.registerProvider('mock', { api: 'openai-completions', baseUrl: 'http://127.0.0.1:<ephemeral>/v1', apiKey: 'mock-key', models: [{ id: 'mock-chat', name: 'Mock Chat', api: 'openai-completions', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 }] })`, backed by a local OpenAI-compatible SSE server.
++
++Scenario format: `{turns: [...]}`; each turn is one assistant/model response (one HTTP POST):
++- `{text: '...'}` text, finish stop, ends the agent turn.
++- `{toolCalls: [{name, arguments}, ...]}` executes tools; next POST consumes next turn.
++- `{yield: {data: ...}}` emits terminal `yield`; observed no further provider request.
++Optional per-turn `usage`, `finishReason`; optional top-level `match`, `onExhausted`.
++
++Proven: catalog listing (`omp models -e ... --json` -> `mock/mock-chat`); real text turn; yield envelope; read->yield tool loop; two parallel tool calls; session resume; @role resolution via `--config` modelRoles; parallel processes; OmpHarness.run and complete.
++
++Ruled out: `--config` is a settings overlay, not a provider registry. `providers:` in `--config` was ignored; `omp models --config cfgprov.yml` did not list it. `models.yml` in a temp agent dir works (second choice).
++
++## Probe log
++
++P1 `omp --version` -> `omp/18.18.5`; help has `-e`, `--config`, `--profile`, `--mode json`, `--no-session`, `--tools`.
++P2 extension API: `typeof pi.registerProvider === 'function'`; `pi.pi` exposes `createAgentSession`, `runSubprocess`, `AgentSession`, `SessionManager`.
++P3 `omp --profile ... models -e mock-provider.ts --json` -> selector `mock/mock-chat`, kind chat, cost 0.
++P4 root-level `omp -e ... models` did not load the extension; place `-e` after `models`. Root-level `-e` works for `-p` sessions.
++P5 text turn: exit 0; text `MOCK_OK`; usage `input:123, output:6, totalTokens:129, cost.total:0`; `agent_end` `isTerminal:true, yielded:true`.
++P6 yield turn: exit 0; one POST; `tool_execution_start` args `{data:{status:'OK',count:42}}`; `tool_execution_end` result `details.data` identical; `turn_end` `stopReason:'toolUse'`; `agent_end`.
++P7 read then yield: 2 POSTs; second request includes `role:'tool'` result.
++P8 two reads in one response: 2 tool results then yield.
++P9 resume: first process text `TURN1_TEXT`; second `--resume <id>` sends `system,user,assistant,user`, prior text present; yield `{resumed:true}`.
++P10 parallel: two profiles/servers; both exit 0; one POST each.
++P11 role overlay `modelRoles: {probe: mock/mock-chat}` + `--model @probe` -> wire model `mock-chat`, exit 0.
++P12 SSE usage `prompt_tokens:100, cached_tokens:40, completion_tokens:5` -> usage `input:60, output:5, cacheRead:40, totalTokens:105`; cost computed from model rates.
++P13 OmpHarness.run with wrapper `exec omp -e ext "$@"` -> `ok:true`, data `{status:'OK',via:'OmpHarness'}`, usage 111/9, costUsd 0, toolCallCount 1.
++P14 OmpHarness.complete -> `{status:'OK',answer:42}`.
++P15 models.yml via `PI_CODING_AGENT_DIR=<tmp>` -> `fileprov/file-model`; named profile works when file is at `omp config path`; absolute `PI_CONFIG_DIR=/tmp/...` was resolved under `$HOME/tmp` in 18.18.5, so verify.
++P16 `--config` providers block ignored.
++P17 preflight no-op: `omp --config /tmp/no-such-overlay.yml --version` prints version and exits 0; real `omp --config <missing> -p ...` exits 1 `Config overlay not found`; `models --config <missing>` exits 1.
++
++## NDJSON contract (omp 18.18.5)
++
++`omp --mode json` emits one JSON object per line. Text turn sequence: `session`, `agent_start`, `turn_start`, user `message_start`/`message_end`, assistant `message_start` (usage zeros), `message_update` (`text_start`/`text_delta`/`text_end`), assistant `message_end` (real usage), `turn_end` (message + toolResults), `agent_end` (`messages`, `isTerminal:true`, `yielded:true`). Tool turn adds `tool_execution_start`/`tool_execution_end`, a `toolResult` message, and if non-terminal, another provider POST.
++
++Usage fields: `turn_end.message.usage` has `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens`, `cost.{input,output,cacheRead,cacheWrite,total}`. `message_start.usage` is zeroed. `cacheRead` comes from `prompt_tokens_details.cached_tokens`; `input` = `prompt_tokens - cached_tokens`; cost from model cost rates. `agent_end.yielded` is true even for text-only turns, so not a yield signal.
++
++Yield envelope: yield data appears in `turn_end.message.content[].toolCall.arguments.data`, `agent_end.messages[].content[].toolCall.arguments.data`, `tool_execution_start.args.data`, and `tool_execution_end.result.details.data` (parser `ndjson.ts:73-142`). Yield is terminal: one POST, no follow-up. Parser references: `src/harness/omp/ndjson.ts:52-150`.
++
++## Scenario format
++
++```jsonc
++{
++  'name': 'developer-writes-and-yields',
++  'match': { 'model': 'mock-chat', 'systemContains': 'Developer', 'promptContains': 'implement' },
++  'onExhausted': 'error',
++  'turns': [
++    { 'toolCalls': [{ 'name': 'write', 'arguments': { 'path': 'src/hello.ts', 'content': 'export const hello = 1;\n' } }], 'usage': { 'input': 1200, 'output': 40, 'cacheRead': 800 } },
++    { 'yield': { 'data': { 'status': 'done', 'summary': 'added hello' } }, 'usage': { 'input': 1500, 'output': 20, 'cacheRead': 1400 } }
++  ]
++}
++```
++
++Types: `UsageSpec` {input?,output?,cacheRead?,cacheWrite?,cost?}; `ToolCallSpec` {name,arguments,id?}; `Turn` = text | toolCalls | yield | error {status?,message}; `Scenario` {name?,match?,onExhausted?,turns}. Semantics: sequential per server; one POST per turn; toolCalls continue; yield terminates; text ends; `onExhausted` default error or repeatLast; `match` assertions fail with 500; resume cursor keyed by session id/label. Error turns optional, not probed.
++
++## M8 integration
++
++OmpHarness currently hard-codes args without `-e` (`harness.ts:368-388`, `:707-715`). Proven wrapper: `#!/bin/sh; exec /home/slava/.bun/bin/omp -e /tmp/mock-provider.ts "$@"` passed as `ompBinary`; both run and complete succeeded. Recommended: add `extraArgs`/`mockProvider` to OmpHarness. Proposed `test/e2e/mock-provider/{extension,server,scenario,runner}.ts`; gate with `FACTORY_E2E_OMP=1`, keep paid `FACTORY_LIVE_OMP=1` separate. Select scenario by `run.label` (like `FakeHarness.scriptOutcome`). Use per-test ephemeral port/profile or `PI_CODING_AGENT_DIR`, `--no-session`, `--no-extensions -e mock-ext`, explicit `mock/mock-chat`; assert request log only mock-chat and `usage.costUsd === 0`. The `test/e2e/` split keeps the no-model scripted suite separate from the paid `test/harness/smoke-live.test.ts` and matches the M8 plan's directional interface.
++
++## Recommendations
++
++- Adopt the extension `-e` + `pi.registerProvider` + local SSE seam as the canonical no-paid-model provider; keep `models.yml` in a temp agent dir as the fallback.
++- Add `extraArgs`/`mockProvider` to `OmpHarness` and implement the scripted suite under `test/e2e/mock-provider/`.
++- Gate the suite with `FACTORY_E2E_OMP=1`, keep paid live tests under `FACTORY_LIVE_OMP=1`, and assert zero-cost usage and mock-only request logs.
++- Replace the preflight `--config --version` check with a real mock turn and add an omp version floor.
++
++## Decision YAML
++
++```yaml
++status: accepted
++decision: >
++  Adopt the omp extension provider seam: per-process `-e mock-provider.ts` calls
++  `pi.registerProvider('mock', {... openai-completions ...})` against a local scripted SSE server.
++  Scenarios are `{turns: [{text}|{toolCalls}|{yield}]}`; one turn per provider request; toolCalls continue,
++  yield terminates. Use an OmpHarness wrapper now; add `extraArgs`/`mockProvider` in M8. Keep
++  `models.yml` in a temp agent dir as fallback; `--config` is only for settings/modelRoles.
++evidence:
++  - 'omp/18.18.5; omp models -e mock-provider.ts --json lists mock/mock-chat (P3).'
++  - 'Real text turn MOCK_OK, usage 123/6, cost.total 0 (P5).'
++  - 'Yield turn details.data {status:OK,count:42}, stopReason toolUse, agent_end (P6).'
++  - 'Tool loop and two parallel tool calls then yield (P7/P8).'
++  - 'Resume sees prior TURN1_TEXT and yields (P9).'
++  - 'OmpHarness.run and complete pass with mock wrapper, cost 0 (P13/P14).'
++  - 'Parallel profiles/servers both exit 0 (P10).'
++  - 'Preflight --config ... --version exits 0 with missing overlay (P17).'
++followUps:
++  - 'M8: add extraArgs/mockProvider; implement test/e2e/mock-provider.'
++  - 'M8: gate FACTORY_E2E_OMP=1; keep FACTORY_LIVE_OMP=1 separate.'
++  - 'Replace preflight --version overlay check with omp models --config or a real mock turn; add version floor.'
++  - 'Pin/minimum omp version; re-run spike on upgrade.'
++  - 'Persist scenario cursor by session id for resume/restart.'
++alternatives:
++  - 'models.yml custom provider (works; second choice).'
++  - '--config providers block (ignored).'
++  - 'Built-in Ollama/LM Studio (requires local runtime).'
++  - 'FakeHarness/mock binary (not real omp).'
++```
++
++## Risks / concern cross-check
++
++- Preflight overlay validation no-op confirmed (`c-477404c672`): `preflight.ts:383-385` uses `--version`; missing overlay exits 0; real session exits 1. High risk 19.1/19.2.
++- OmpHarness no extra-args seam: wrapper works but add `extraArgs`/`mockProvider`; medium, 19.8.
++- Flag placement: `-e`/`--config` after `models` for catalog; root-level for sessions.
++- `PI_CONFIG_DIR` absolute path resolved under `$HOME` in 18.18.5; use `PI_CODING_AGENT_DIR`/real profile and verify `omp config path`.
++- `agent_end.yielded` true for text-only; use yieldData.
++- `models.yml` works with temp `PI_CODING_AGENT_DIR`; named-profile caveat is path resolution.
++- `c-aaebfb4099` out of scope; parallel mock probing is safe but doesn't address epic lock/merge.
++- `c-ba416d7313` disproved: zero-paid real-omp mock path exists.
++
++## Sources
++
++- `docs/factory.v2.md:104-113`
++- `plugins/software-factory/docs/ARCHITECTURE.md:40`
++- `plugins/software-factory/src/cli/preflight.ts:365-394`
++- `plugins/software-factory/src/harness/omp/harness.ts:368-388`, `:525-570`, `:707-715`
++- `plugins/software-factory/src/harness/omp/ndjson.ts:52-150`
++- `plugins/software-factory/src/harness/omp/overlay.ts:26-86`
++- `plugins/software-factory/src/harness/fake/fake-harness.ts:8-51`
++- `plugins/software-factory/docs/spikes/omp-1-topology.md:55-104`
++- `plugins/software-factory/docs/spikes/omp-2-cli-adapter.md:41-110`
++- `plugins/software-factory/test/harness/smoke-live.test.ts:9-81`
++- https://omp.sh/docs/extensions
++- https://omp.sh/docs/models
++- https://omp.sh/docs/providers
++- https://omp.sh/docs/extension-loading
++- https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/tools/yield.ts
+diff --git a/plugins/software-factory/docs/spikes/omp-5-cache-keys.md b/plugins/software-factory/docs/spikes/omp-5-cache-keys.md
+new file mode 100644
+index 0000000..acc48fb
+--- /dev/null
++++ b/plugins/software-factory/docs/spikes/omp-5-cache-keys.md
+@@ -0,0 +1,308 @@
++# Spike: prompt-cache keying + compaction/warming audit
++
++Status: complete (M1 / `spike-cache-key`)
++Harness: `omp/18.18.5` on Linux x86_64 WSL2; factory checkout `plugins/software-factory`; live probes used throwaway `/tmp` dirs and throwaway session dirs (no production paths edited).
++
++## 0. Verdict (answers the M1 cache-key scenario)
++
++**OMP prompt caching is content-keyed, not path-keyed.**
++
++- A changed system-prompt *path* with byte-identical content still produced a full cache hit: DeepSeek `cacheRead=11,392` (T3 below); Anthropic `cacheRead=6,703` (A-T2 below).
++- A new prompt-file *path* on every turn did not break resumed-turn caching: Anthropic `cacheRead=29,363` on a resume whose prompt file path differed from the previous turn.
++- A one-byte system-prompt content change (appended newline) produced `cacheRead=0` (DeepSeek T3, `input=13,266`).
++- Tools change produced a partial miss (`cacheRead=2,432` of a prior `4,480`); thinking-level change and model switch produced full misses (`cacheRead=0`).
++- A 330-second gap on Anthropic `short` retention produced `cacheRead=0`, `cacheWrite=38,022` (cold).
++- A brand-new session with the same system prompt/tools reused the system-prompt prefix from the provider cache (`cacheRead=4,224`), so a fresh session is not inherently a full cold read.
++
++**Consequence for the factory:** the transport's random prompt filename is safe; the cached prefix is the system-prompt bytes + tool specs + model/thinking identity + conversation history. The real cold-resume triggers are: system-prompt content change, tools change, model/thinking change, cache-retention/TTL change/expiry, and compaction. The current factory does not detect any of these (see §5) and does not pin the knobs (see §6).
++
++## 1. Method
++
++- Transport audit (no model calls): ran `OmpHarness.run()` four times (fresh ×2, resume ×2) with `OMP_PATH` pointed at a throwaway shim that logged argv and copied the `--system-prompt`/`-p @file` inputs. Same rendered `steps/architect-resume` prompt, same `PipelineConfig`, same runtime dir, same synthetic session id. Note: `IMPLEMENTATION.md` flags the `steps/architect-resume` fragment as dead, but the harness mechanism is identical (`harness.ts:286-350,368-389`), so the byte diffs remain valid; re-run against a live fragment for the M2 baseline.
++- Live probes: real `omp -p --mode json` turns against `opencode-go/deepseek-v4.1-flash:max`, `opencode-go/muse-spark-1.3-contributor:max`, and `anthropic/claude-haiku-5-5:max`, using the factory's generated overlay plus the actual architect system prompt (`agents/architect.md` body). Unique `--session-dir`/`--cwd` per probe family under `/tmp`; `--max-cost 0.10` per turn. Aggregate live spend ≈ **$0.05**.
++- All probe dirs are throwaway (`/tmp/spike-cache-key-*`); no repo file was written.
++
++## 2. Transport render audit (byte/argv diff)
++
++Source under audit: `src/harness/omp/harness.ts:286-350` (prompt materialization), `src/harness/omp/harness.ts:368-389` (argv), `src/harness/omp/overlay.ts:26-100` (overlay).
++
++| Run pair | System-prompt bytes | System-prompt path | Prompt bytes | Prompt path | Argv |
++|---|---|---|---|---|---|
++| fresh-1 vs fresh-2 | identical, sha256 `cb92bbcaafd7bfa7b52413cc9a75cd58985c4e22b21b9984a60733a9f177c93a` | identical `.../system-prompts/architect-fresh.md` | identical, sha256 `4a9d87d474be6638f4c5b1bc4655622baa7566e9e91935bc12aa136c6cec6d88` | **different** `prompt-1794267999675-k2y1.txt` vs `prompt-1794267999746-1jly.txt` | identical except `-p @<path>` |
++| resume-1 vs resume-2 | identical | identical `.../system-prompts/architect-spike-session-fixed.md` | identical | **different** | identical except `-p @<path>` |
++| fresh vs resume | identical | **different** (`fresh` vs sanitized session id) | identical | different | resume adds `--resume spike-session-fixed` |
++| overlay generated twice | — | — | — | — | identical YAML, 1,472 bytes, sha256 `6ebf5894b6aaa2123b1cc3030555c3f5e61562751a2e332ef4b5d5b96e739f53` |
++
++Exact fresh argv (captured; resume adds `--resume spike-session-fixed` after `--session-dir`):
++
++```text
++--cwd /tmp/spike-cache-key-0c1ojol5/cwd
++--config /tmp/spike-cache-key-0c1ojol5/runtime/omp-overlay.yaml
++--mode json
++--model @architect
++--session-dir /tmp/spike-cache-key-0c1ojol5/runtime/sessions
++--tools=read,grep,glob
++--system-prompt /tmp/spike-cache-key-0c1ojol5/runtime/system-prompts/architect-fresh.md
++-p @/tmp/spike-cache-key-0c1ojol5/runtime/prompts/prompt-1794267999675-k2y1.txt
++```
++
++Findings:
++
++- System prompt is `extractAgentBody(run.definition)` written to `${agent}-${sessionKey}.md`; `sessionKey` is `fresh` or the sanitized resume id (`harness.ts:293-300`). Content is byte-stable per agent definition and path is deterministic per agent+session. The fresh→resume transition changes the path but not the bytes.
++- Prompt is written to `prompt-${Date.now()}-${random4}.txt` (`harness.ts:311-316`), so the path is unique every turn and the argv differs only there. Prompt **content** is byte-identical when the same fragment/vars are rendered.
++- Overlay is regenerated from the effective pipeline every run (`harness.ts:225-240`) and is byte-stable for identical config; it contains only `modelRoles`, `retry`, `eval`, `title`, `checkpoint`, `advisor`, `bash`, `mnemopi` (three linking flags), and `update` (`overlay.ts:51-85`). It pins **none** of `providers.cache*`, `compaction.*`, `snapcompact.*`, or `mnemopi.autoRecall/autoRetain`.
++- omp wraps the `@file` argument into the user message as `<file name="/abs/path">…</file>` (observed in `message_start`/`message_end` and the session JSONL). Therefore the *new* user message is not byte-identical when the same logical prompt is re-rendered to a different path. This does not break the prior cached prefix (the wrapper is appended at the end), but it means the transport is not byte-reproducible for retries. A content-addressed prompt filename (e.g. `prompt-<sha256>.txt`) would fix that; it is not required for cache hits.
++
++## 3. Live resume probe log
++
++All rows are `turn_end.message.usage`; `totalTokens = input + output + cacheRead + cacheWrite` in every observed row. `input` is *uncached* input (Anthropic reports `input=4` while writing/reading tens of thousands of cached tokens).
++
++### 3.1 Path / model / content probes (opencode-go DeepSeek, 1M context, implicit cache)
++
++| Probe | Input | cacheRead | cacheWrite | total | Cost USD | Interpretation |
++|---|---:|---:|---:|---:|---:|---|
++| D-T1 fresh (architect-resume prompt) | 9,060 + 478 + 1,515 | 0 + 8,960 + 9,344 | 0 | 9,318 / 9,717 / 11,390 | 0.001514 + 0.000266 + 0.000574 = **0.002354** | first request cold; intra-turn tool-loop requests cache |
++| D-T2 resume, same system-prompt path, new prompt path | 677 | 10,752 | 0 | 11,439 | **0.000140** | new prompt path is harmless |
++| D-T3 resume, **system-prompt path changed**, same bytes | 86 | 11,392 | 0 | 11,481 | **0.000049** | path is not in the key |
++| D-T4 resume, prompt path reused, content changed | 130 | 11,392 | 0 | 11,586 | **0.000092** | path reuse gives no extra hit; prior prefix still hits |
++| D-T5 resume, **model switched** to `opencode-go/muse-spark-1.3-contributor:max` | 11,082 | 0 | 0 | 11,775 | **0.001247** | model switch is a full cold read (≈8.9× D-T2) |
++
++### 3.2 Content / tools / thinking invalidations (clean 2-turn sessions, DeepSeek)
++
++| Scenario | T1 input | T2 input | T2 cacheRead | Result |
++|---|---:|---:|---:|---|
++| Control (same system prompt, same tools, same thinking) | 4,505 | 90 | 4,480 | near-full warm hit |
++| System prompt + one appended newline (same path) | 4,585 | 13,266 | 0 | full miss |
++| Tools `read,grep,glob` → `read,grep,glob,bash` | 4,585 | 2,719 | 2,432 | partial miss (tools are in the prefix) |
++| Thinking `:max` → `:high` (same model id) | 4,585 | 4,681 | 0 | full miss |
++
++Anthropic confirms path invariance: A-T1 fresh `input=4`, `cacheWrite=6,703`; A-T2 resume with a **different system-prompt path and identical bytes**: `input=4`, `cacheRead=6,703`, `cacheWrite=342`, cost $0.000143 (vs $0.00098 fresh).
++
++### 3.3 TTL expiry (Anthropic short/5m)
++
++| Turn | Input | cacheRead | cacheWrite | cttl | Cost USD |
++|---|---:|---:|---:|---|---:|
++| T1 fresh (2 requests) | 4 + 2 | 0 + 15,501 | 15,501 + 13,862 | `ephemeral5m` | 0.008491 + 0.006040 |
++| T2 resume ~1 min after T1 | 4 | 29,363 | 8,359 | `ephemeral5m` | **0.001454** |
++| T3 resume 330 s after T2 | 4 | **0** | **38,022** | `ephemeral5m` | **0.004767** |
++
++330 s is past the 300 s short TTL; the cold resume cost 3.3× the warm resume. Long retention was verified separately: `providers.cacheRetention: long` produced `cttl: {ephemeral1h: 6,705}`.
++
++`providers.cacheRetention: none` on a single fresh request produced `input=4,510`, `cacheRead=2,256`, `cacheWrite=24`, `cttl: {ephemeral5m: 24}` — i.e. omp stopped requesting explicit retention, but the provider still served an implicit cached prefix (the default base prompt) from an earlier identical request. `none` is therefore not a guarantee of zero cacheRead; it does reduce explicit write cost for single-request turns.
++
++### 3.4 Cross-session reuse
++
++A brand-new session in a new cwd with the same architect system prompt/tools/prompt shape produced `input=207`, `cacheRead=4,224`, `cacheWrite=0` — the system-prompt prefix was reused across session ids. Content, not session id, is the key (omp may still use session ids for provider routing affinity, but it is not a hard cache-key component for this provider).
++
++### 3.5 Memory-recall caveat (important)
++
++The session JSONL records `custom/system-prompt-digest` entries. With no recalled memories the digest of the same architect body was `a94d3680ec1c75cf` across different paths, cwds and session ids. With `mnemopi.autoRecall` returning a prior turn, the digest changed (`a89aabcb237da3c7`, `634c40b6e2f931de`) even though the agent body was unchanged; a one-newline body change produced `1a5712bb71b370ac`. Conclusion: the digest is a content hash of the **effective** system prompt including injected memory text (not path), and omp's ambient memory can change it. The factory overlay disables `polyphonicRecall`/`enhancedRecall`/`proactiveLinking` (`overlay.ts:77-81`) but leaves `mnemopi.autoRecall` and `mnemopi.autoRetain` at their default `true`. Recalled memories are injected only into the first turn of a session (observed once per session; docs: “Recall local memories into the first turn of each session”), so resumed turns are not re-polluted, but fresh sessions in a reused cwd are non-deterministic and can recall prior task text into the system prompt — losing the cross-session system-prompt cache hit and potentially leaking context between tasks that share a worktree.
++
++## 4. What the cache key covers
++
++**Content key (confirmed):** system-prompt bytes + tool specs (ordered) + model identity + thinking level + conversation history + cache retention markers/TTL. **Not in the key (confirmed):** system-prompt file path, prompt-file path, session id (for content reuse), file mtimes.
++
++Invalidation matrix:
++
++| Change | Observed effect |
++|---|---|
++| system-prompt path changed, bytes identical | full hit (DeepSeek 11,392; Anthropic 6,703) |
++| prompt path changed every turn | full hit on prior prefix (Anthropic 29,363) |
++| prompt path reused, content changed | no extra hit; prior prefix still hits (11,392) |
++| system-prompt +1 byte | full miss (0) |
++| tools order/content changed | partial/full miss; measured 2,432 of 4,480 retained |
++| thinking level changed | full miss (0) |
++| model switched | full miss (0), ~8.9× cost |
++| 5m TTL expired (330 s gap) | full miss (0), `cacheWrite` = 38,022 |
++| new session, same system prompt/tools | system-prompt prefix hit (4,224) |
++| compaction committed | prefix rewritten; next request cannot reuse the pre-compaction prefix |
++
++## 5. Cold-resume detection signals
++
++### 5.1 Pre-launch signals (engine can act before spending)
++
++Read from the session JSONL (the engine already has its path as `meta.yaml` `traceRef`, `src/core/records/step-record.ts:96`, produced at `harness.ts:521-522`):
++
++1. **`custom/system-prompt-digest`** — 16-hex digest of the effective system prompt. Compare the latest value to the engine's own hash of the current `agentBody`; content-only (path-independent), but includes omp-injected memory text (see §3.5).
++2. **`model_change`** — resolved `model` recorded at session start. Compare to the model the current `@role` resolves to. `@role` is re-resolved on every resume (`harness.ts:318-326`), so a pipeline/role/fallback change silently switches models.
++3. **`thinking_level_change`** — recorded level; compare to the current role suffix. A change is a full miss (measured).
++4. **`cttl` + last assistant timestamp** from the newest assistant message usage (`ephemeral5m`/`ephemeral1h`). Expiry = request-send time + TTL. The transcript timestamp is completion time, so subtract a conservative margin (seconds to tens of seconds).
++5. **`compaction` entry** after the last normal turn — history was rewritten; the next resume is cold from the cut point.
++6. **`credential_pin.hash`** (optional) — provider/account affinity changed; OpenAI-style `prompt_cache_key` affinity may be lost.
++7. **Ordered tools hash and cache-retention setting** — the session does not record these; the engine must store them in its own session-state record/meta and compare. Tools change is a partial miss (measured).
++
++### 5.2 Post-hoc signals (ground truth)
++
++- `turn_end.message.usage.cacheRead` == 0 on a resumed turn with prior history ⇒ miss; `cacheWrite` ≈ prompt size ⇒ cold write. `cacheWrite` is only populated by providers with explicit cache writes (Anthropic/Bedrock; DeepSeek reports 0).
++- `turn_end.message.usage.cttl` gives the tier and cached-token count (`{ephemeral5m: N}` / `{ephemeral1h: N}`); absent for DeepSeek implicit caching.
++- `turn_end.message` also carries `api`, `provider`, `model`, `reasoningTokens`, `totalTokens` — the factory currently discards all of them.
++- RPC/SDK expose `cache_warming_start` / `cache_warming_end` with `warmingStopReason` (`refresh missed the cache`, `refresh failed`, `conversation context changed`). `-p --mode json` would include these ordinary session events if warming runs; our probes did not trigger warming (see §7).
++- `display.cacheMissMarker` and the status-line `cache` segment are **UI-only**; no `cache_miss` event appeared in `-p` NDJSON. Do not build engine detection on them.
++
++### 5.3 Records gap (blocks spec 20's “measured defaults”)
++
++`OmpNdjsonParser` reads only `u.input`, `u.output`, and `u.cost.total` (`src/harness/omp/ndjson.ts:86-99`) and returns only `inputTokens`/`outputTokens`/`costUsd` (`ndjson.ts:173-177`). `Usage` (`src/harness/types.ts:7-11`) and `StepUsage` (`src/core/artifacts.ts:545-549`) have no cacheRead/cacheWrite/totalTokens/cttl/model fields. Consequently the records cannot answer “how many tokens did the cold resume re-pay?” today — only the total cost. Extend the types and parser before choosing cost-measured defaults.
++
++Also: side requests not tied to the agent turn (`model_usage` entries in the transcript with `purpose: "unexpected-stop"`, compaction summarization) are not attributed to the step. The `-p "/compact"` probe produced no usage record at all (see §7.1).
++
++## 6. Knob audit for one-process-per-turn (`-p`) factory sessions
++
++Effective values observed with `omp config list --json` / `--scope global` on this host (omp 18.18.5): `providers.cacheRetention=short`, `providers.cacheWarming=streaming`, `provider.appendOnlyContext=auto`, `includeModelInPrompt=false`, `compaction.enabled=true`, `compaction.midTurnEnabled=true`, `compaction.methodOrder=[remote,snapcompact,handoff,shake,soft]`, `compaction.experimentalContextManagement=true`, `compaction.handoffSaveToDisk=true`, `compaction.modelThresholds={anthropic/claude-haiku-5-5: "f90000", vercel-ai-gateway/minimax/minimax-m3.1-flash: 800000}`, `mnemopi.autoRecall=true`, `mnemopi.autoRetain=true`, `memory.backend=mnemopi`, `memories.enabled=false`. Several differ from the omp docs defaults: `cacheRetention` docs `auto`, `cacheWarming` docs `idle`, `experimentalContextManagement` docs `false`, `handoffSaveToDisk` docs `false`; `--scope global` proves the host layer sets them. Factory overlay precedence is above project/global (`docs/settings.md:113-123`), so pinning in the generated overlay is effective.
++
++| Knob | Docs default | Effective here | Affects `-p` one-process-per-turn? | Action for M7 |
++|---|---|---|---|---|
++| `providers.cacheRetention` | `auto` | `short` (host) | **Yes** — per-process TTL/markers; a per-turn `--config` overlay can vary it | Pin per role: architect `long` (1h) for standby gaps <1h; `short` for multi-request tool-loop agents; `none` only for known single-request turns |
++| `providers.cacheWarming` | `idle` | `streaming` (host) | `streaming` **yes** (intra-turn long tool executions); `idle` **no** (no idle scheduler in print sessions; process exits) | Pin `streaming`; do not rely on `idle`/standby warming |
++| `provider.appendOnlyContext` | `auto` | `auto` | **Yes** — keeps system prompt + tool specs + append-only log for maximum prefix hits | Keep `auto`/`on`; do not disable |
++| `includeModelInPrompt` | true in docs main; installed effective `false` | `false` | **Yes if true** — model name in the system prompt makes a model switch/fallback change the prefix | Pin `false` |
++| `display.cacheMissMarker` | true | true | **No** — TUI display only | Use usage fields instead |
++| `compaction.enabled` | true | true | **Yes** if the threshold is crossed inside a turn (mid-turn or post-turn) | Set explicit thresholds; do not rely on the default 15%/16k reserve (≈850k on a 1M window) |
++| `compaction.midTurnEnabled` | true | true | **Yes** — can rewrite history between tool-loop requests; the likely auto path in a long factory turn | Keep as overflow safety but raise `thresholdTokens` so it does not fire on normal architect turns |
++| `compaction.thresholdTokens` / `thresholdPercent` / `reserveTokens` | -1 / -1 / unset | same | **Yes** — trigger point | Pin an explicit architect budget; leave room for the next wave |
++| `compaction.methodOrder` | remote, snapcompact, handoff, shake, soft | same | **Yes** if compaction fires | Prefer `handoff`/`soft`; avoid `snapcompact` for the architect (images lose prompt caching) |
++| `compaction.asyncEnabled` | true | true | **Yes** near threshold — speculative side request inside a one-shot process | Keep or disable for deterministic cost; measure |
++| `compaction.autoContinue` | true | true | **Yes** — post-threshold continuation request; needed so the step still yields | Keep `true`; `false` would end a headless run without the agent's answer |
++| `compaction.keepRecentTokens` | 20,000 | 20,000 | **Yes** — size of retained tail after compaction | Tune to the architect brief size |
++| `compaction.supersedeReads` / `dropUseless` | true / true | true / true | **Yes** — cache-aware pruning every turn; can still mutate history near the cache lookback | Keep defaults; audit if cacheRead drops unexpectedly |
++| `compaction.idleEnabled` / `idleThresholdTokens` / `idleTimeoutSeconds` | false / 200,000 / 300 | same | **No** — idle maintenance is enabled only by the interactive TUI; SDK/RPC/print sessions do not enable it (`docs/sdk.md:278`) | Ignore for `-p`; do not build standby policy on it |
++| `compaction.handoffSaveToDisk` | false (host true) | true | No direct cache effect; writes summary artifacts | Pin for determinism |
++| `compaction.experimentalContextManagement` | false (host true) | true | **Potentially** — notes-backed rollover; requires `context_notes`/`new_context`/`read`/`grep` tools, otherwise legacy maintenance | Pin `false` unless deliberately opted in |
++| `snapcompact.systemPrompt` | `none` | `none` | **Yes** — imaging system prompt text loses prompt caching for that text | Pin `none` |
++| `snapcompact.toolResults` | false | false | **Maybe** — images of tool results; cache/vision trade-off | Pin `false` for architect |
++| `compaction.remoteEndpoint` / `remoteStreamingV2Enabled` / `v2RetainedMessageBudget` | unset / true / 64,000 | same | **Yes** if remote compaction is used | Decide/pin; remote is a second compaction path to test |
++| `compaction.modelThresholds` / `modelThresholdsEnabled` | per-model / true | host overrides | **Yes** — can trigger on a model unexpectedly | Audit/pin |
++| `task.agentCompactionThresholdOverrides` | {} | {} | **No** for root factory turns (task/subagents only) | Ignore |
++| `mnemopi.autoRecall` / `autoRetain` | true / true | true / true | **Yes** — first-turn effective system prompt changes; cross-session recall and cache loss | Pin `false` for deterministic factory agents (or opt in consciously with a recorded digest) |
++| `memory.backend` | `mnemopi` | `mnemopi` | **Yes via autoRecall** | Keep but disable autoRecall/autoRetain, or choose `off` if no memory is wanted |
++
++## 7. Compaction vs fresh brief
++
++### 7.1 `-p` manual compaction is available (verified)
++
++A one-shot print invocation accepted the slash command:
++
++```bash
++omp --cwd <cwd> --mode json --model opencode-go/deepseek-v4.1-flash:max \
++  --session-dir <sd> --tools= --resume <session-id> -p "/compact"
++```
++
++It emitted `manual_compaction_start` then `manual_compaction_end` with `result: { tokensBefore: 38053, firstKeptEntryId: …, summary, shortSummary, details }`; `tokensAfter: 6794` and `method: "soft"` live in the transcript `compaction` entry, not the NDJSON result. It printed `Compaction complete. Tokens: 36413 -> 6768 (saved 29645)` to stderr, persisted that `compaction` entry in the session JSONL, and exited 0. There was **no `turn_end`, no usage, and no `model_usage` entry** for the summarization request in NDJSON/transcript — compaction cost must be estimated from `tokensBefore`/summary length (or measured via `omp stats`/an RPC wrapper) if spec 20's cost defaults are to include it.
++
++RPC mode exposes a first-class `{ type: "compact", customInstructions? }` command and `manual_compaction_start/end` events (`docs/rpc.md:190-210`, `:970-987`); `{ type: "set_cache_warming", mode }` is also available there (`docs/rpc.md:197-210`).
++
++### 7.2 Cost analysis (architect on `anthropic/claude-opus-5-5`, catalog: input $4/M, cacheRead $0.20/M, cacheWrite $5/M)
++
++For a 38k-token history (same order as the compaction probe):
++
++| Strategy | What is paid | Approx cost |
++|---|---|---|
++| Direct cold resume | 38k × $4/M | **$0.152** |
++| Compact **after** cache expiry, then resume | summarizer cold-reads 38k ($0.152) + summary output (~$0.01-0.02) + compacted prefix write 6.8k × $5/M ($0.034) + resumed turn | **≈$0.20-0.24** (worse than direct for one turn) |
++| Compact **while warm** (at wave end, within TTL), then resume | summarizer cache-reads 38k × $0.20/M ($0.0076) + output (~$0.01-0.02) + compacted write $0.034 + resumed turn | **≈$0.06-0.09** (better) |
++| Fresh architect brief | build B-token brief from records (e.g. B≈5k: $0.02 input / $0.025 write) + system-prompt prefix cacheRead (~$0.001) | **≈$0.02-0.03** at B=5k; still cheaper at B=20k (~$0.08-0.10) |
++
++Key correction to spec item 20(a): **compaction after the cache has already expired does not avoid re-paying the full history; the summarizer pays it once, then the resumed turn pays the compacted prefix again.** Compaction only pays if it runs while the prefix is still warm, or if the architect will have several future turns on the compacted history, or if the full history would overflow the window. For an already-cold resume, a deterministic fresh brief is the cheaper mechanism.
++
++### 7.3 Recommended mechanism
++
++1. **Warm** (no trigger): resume additively; do nothing.
++2. **Cold + short history / one-shot consult**: resume uncached; optionally pass a per-turn overlay with `providers.cacheRetention: none` if the turn is known to make a single model request (multi-request tool loops still benefit from caching).
++3. **Cold + long history + more turns expected**: start a **fresh architect session hydrated from records** (existing `hydrationContext`/`contextPack`/`waveReport` machinery in `step-runner.ts` and `steps/architect-resume`). This is bounded, deterministic, and still reuses the system-prompt prefix (4,224-token cross-session hit measured).
++4. **Compact only while warm**, at a natural wave boundary, before the TTL expires: `omp -p --resume <id> "/compact"` (verified) or RPC `compact`. Use `handoff`/`soft`, not `snapcompact` for the architect. Record `tokensBefore/tokensAfter`; estimate cost.
++5. **If already cold and continuity is mandatory** (the brief would lose critical conversational state): resume uncached and accept the full read; do not compact as well.
++
++## 8. Standby-warming viability
++
++- `providers.cacheWarming` values: `off`, `streaming`, `idle` (verified by invalid-value error; docs `docs/settings.md:1026`). Warming replays the last request with a one-token output budget shortly before expiry, only when the expected avoided-miss cost exceeds the refresh cost by at least **$0.05**. For Opus (input $4/M vs cacheRead $0.20/M, delta $3.8/M), the threshold is ≈**13.2k tokens** of prefix; an architect session above that qualifies economically.
++- **`idle` warming cannot cover factory standby.** The interactive TUI owns idle work; “SDK, RPC and print sessions do not” enable idle maintenance (`docs/sdk.md:278`). `-p` exits at the end of the turn, so there is no process alive to replay the request between turns. `streaming` warming can still protect a long tool execution **inside** a turn — pin it.
++- **The practical standby mechanism is `providers.cacheRetention: long`** (1h where supported). Verified `cttl: {ephemeral1h: N}`. It needs no live process. The cost is the cache write: catalog `cacheWrite` for Opus is $5/M (1.25× input); Anthropic bills 1h writes at a higher rate than 5m in the real API, and omp's single catalog `cacheWrite` value may under-estimate 1h writes — verify against provider billing before making it the default. A 1h tier pays if the architect's next turn lands >5m and <1h later; it does not cover >1h gaps.
++- **Pre-warming immediately before a resume is never cheaper:** if the entry already expired, the warm request pays full input + cache write, then the resumed turn pays cache read; that is strictly more than the direct cold resume. Warm must happen *before* expiry to pay off.
++- **Persistent RPC holder** (`omp --mode rpc`, `set_cache_warming idle`, `compact`) is the only true standby warming, but it reintroduces a long-lived process and session ownership across wave gaps. Defer as an optional M7 experiment; measure against long retention first.
++
++## 9. Recommendations for M7
++
++1. **Extend usage accounting** (`src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549`, `src/harness/omp/ndjson.ts:86-99`): add `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, `cacheTtl: {tier, tokens}`, `provider`, `api`, `model`, `reasoningTokens`; keep per-request rows (a turn can emit multiple `turn_end` usages) and aggregate. Include side-request `model_usage`/compaction cost where available.
++2. **Add a per-session cache-state record** (meta or a sibling `session-cache.yaml`): resolved model (`provider/model` from `turn_end.message`), thinking suffix, ordered tools hash, system-prompt hash, cache retention, last request timestamp, last `cttl`, last `compaction` marker. Compare it on every resume.
++3. **Stop silently switching models on resume:** record the resolved model used by the successful turn and pass that literal model on resume (or detect the mismatch and treat it as cold). Current resume unconditionally passes `@role` (`harness.ts:318-326`), so a role-map change or fallback recovery silently switches models and pays a full cold read.
++4. **Pin effective omp settings in the generated overlay** (`overlay.ts:51-85`): `providers.cacheRetention` (per role/flow), `providers.cacheWarming: streaming`, `provider.appendOnlyContext: auto`, `includeModelInPrompt: false`, `snapcompact.systemPrompt: none`, `snapcompact.toolResults: false`, `compaction.experimentalContextManagement: false`, explicit `compaction.enabled/thresholdTokens/methodOrder/autoContinue`, and `mnemopi.autoRecall/autoRetain: false`. Overlay precedence beats host global/project config (`docs/settings.md:113-123`), but only if the keys are actually present.
++5. **Validate effectively, not syntactically:** `omp --config <overlay> --version` exits 0 even for invalid YAML or an invalid `providers.cacheRetention` value (confirmed). Preflight’s current overlay check (`src/cli/preflight.ts:364-393`) is therefore a no-op. Read back effective values (`omp config get`, or a no-model probe) and/or perform a real throwaway turn before declaring config compatible. This confirms open concern `c-477404c672` and adds cache/compaction keys to its scope.
++6. **Cold policy:** warm → resume; cold single-turn → resume (optionally `retention: none`); cold long-history → fresh brief; compact only while warm. Do not compact after expiry for a single resume.
++7. **Byte stability:** keep system-prompt content byte-stable; make prompt filenames content-addressed (`prompt-<sha256>.txt`) so identical logical prompts produce identical `@file` wrappers/transcripts. The current timestamp+random path is cache-safe but not byte-reproducible.
++8. **Disable ambient memory for deterministic agents** or explicitly include its digest: `mnemopi.autoRecall/autoRetain: false`; otherwise fresh sessions in a reused cwd inject prior task text into the system prompt (digest changes observed).
++9. **Measure before defaults:** use `long` retention for architect standby gaps <1h, `short` for multi-request tool-loop agents, `none` only for single-request turns; keep the choice per role/flow and record the cost delta.
++10. **Tests:** the scripted mock provider for item 19.8 should emit realistic `usage` rows with `cacheRead`, `cacheWrite`, `totalTokens`, `cttl`, and multiple `turn_end`s per turn, plus a synthetic session JSONL with `system-prompt-digest`, `model_change`, `thinking_level_change`, `compaction`, and `cttl` so cold detection is testable without paid models.
++
++## 10. Draft decision YAML
++
++```yaml
++status: proposed
++decision: |
++  OMP prompt caching is content-keyed, not path-keyed. The cached prefix is composed of the
++  system-prompt bytes, ordered tool specs, model/thinking identity, cache-retention tier, and
++  conversation history; file paths and session ids are not hard key components. The factory's
++  deterministic system-prompt path and unique per-turn prompt path are cache-safe; a changed
++  system-prompt path with identical bytes still fully hits. Cold resume must be detected from
++  content/config changes (system-prompt bytes, ordered tools, model, thinking level, cache
++  retention) plus TTL expiry (usage.cttl + timestamp) and compaction markers, not from paths.
++  For one-process-per-turn `-p` sessions, idle cache warming and idle compaction are unavailable;
++  use `providers.cacheRetention: long` for architect standby gaps under 1h, pin streaming warming
++  for intra-turn tool executions, and do not rely on omp's default host config (this host sets
++  short/streaming/experimental values). For an already-cold architect resume, prefer a fresh
++  brief hydrated from records over compaction; compaction only pays when performed while the
++  cache is warm (at a wave boundary) or amortized over several future turns. Pin all relevant
++  omp cache/compaction/memory keys in the generated overlay and record cacheRead/cacheWrite/
++  totalTokens/cttl in step records so defaults can be measured.
++evidence:
++  - "Transport audit: harness.ts:286-350 writes a deterministic per-agent+session system prompt and a unique timestamp+random prompt file; argv differs only in -p @path; overlay bytes identical (sha256 6ebf5894...); system-prompt/prompt content identical across renders."
++  - "Path invariance: DeepSeek resume with changed system-prompt path and identical bytes cacheRead=11,392 (input 86); Anthropic resume with changed path cacheRead=6,703 (input 4). New prompt path per turn cacheRead=10,752 (DeepSeek) and 29,363 (Anthropic)."
++  - "Content invalidation: system prompt + newline cacheRead=0 (input 13,266); tools change cacheRead=2,432 of 4,480; thinking change cacheRead=0; model switch cacheRead=0 (cost 8.9x warm)."
++  - "TTL: Anthropic short (5m) warm resume cacheRead=29,363, cost $0.001454; after 330s cacheRead=0, cacheWrite=38,022, cost $0.004767. Long retention emits cttl ephemeral1h; providers.cacheRetention enum is auto|short|long|none."
++  - "Cross-session: new session, same system prompt/tools, cacheRead=4,224; session id is not a hard key."
++  - "Compaction: `omp -p --resume <id> \"/compact\"` compacted 38,053 -> 6,794 tokens (method soft) with manual_compaction_start/end; no usage/cost in NDJSON or transcript. Docs: idle maintenance is TUI-only (docs/sdk.md:278); cacheWarming values off|streaming|idle, $0.05 avoided-miss gate (docs/settings.md:1026); idle compaction trade-off (docs/compaction.md:155-158)."
++  - "Factory records: ndjson.ts:86-99 and 173-177 drop cacheRead/cacheWrite/totalTokens/cttl; Usage and StepUsage lack fields (types.ts:7-11, artifacts.ts:545-549)."
++  - "Factory overlay: overlay.ts:51-85 pins no providers.cache*, compaction.*, snapcompact.*, mnemopi.autoRecall/autoRetain; host global config sets providers.cacheRetention=short, cacheWarming=streaming, compaction.experimentalContextManagement=true. `omp --config <invalid> --version` exits 0, so preflight.ts:364-393 does not validate the overlay."
++followUps:
++  - "M7: extend Usage/StepUsage and OmpNdjsonParser with cacheRead/cacheWrite/totalTokens/cttl/provider/model/reasoningTokens and per-request rows."
++  - "M7: add a session cache-state record and pre-launch cold detector (system-prompt hash, ordered tools hash, resolved model, thinking, retention, cttl+timestamp, compaction marker)."
++  - "M7: pass the recorded resolved model on resume instead of unconditionally @role; treat role-map changes as cold."
++  - "M7: pin cache/compaction/mnemopi settings in the generated overlay; validate effective values in preflight with a real check, not `--version`."
++  - "M7: measure long-vs-short retention and fresh-brief-vs-warm-compaction per role/flow on the self-host fire test; confirm Anthropic 1h write pricing against provider billing."
++  - "M7: optional RPC holder experiment (set_cache_warming idle + compact) only if long retention does not cover the observed wave gaps."
++  - "Add a mock-provider fixture with cache usage/cttl/session entries so cold-detection and cost defaults are testable without paid models."
++```
++
++## 11. Open questions / follow-ups
++
++- Anthropic's real 1h cache-write price is higher than the 5m write price; omp's catalog exposes one `cacheWrite` value per model. The cost estimates in §7.2/§8 for `long` may be optimistic. Confirm on the provider bill before making `long` the default.
++- DeepSeek reports no `cttl`/`cacheWrite`; its implicit cache has no observable TTL. Do not attempt TTL-based cold detection for such providers; use content/config fingerprints only.
++- The `-p "/compact"` summarization cost is not in NDJSON or the transcript. If spec 20 requires measured compaction cost, add an RPC wrapper that captures the compaction response/usage, or estimate from `tokensBefore` and summary length.
++- `mnemopi.autoRetain` can write completed factory turns into a per-cwd memory bank and affect later fresh sessions in the same worktree. Decide whether that is a feature (cross-run context) or a leak (task isolation); the factory's current overlay only disables the linking flags.
++- `checkpoint.enabled: true` in the overlay mounts checkpoint tools; agents opt in via their tool lists. Not a cache issue, but part of the effective harness surface to audit.
++
++## Sources
++
++Repo (read-only audit):
++- `plugins/software-factory/src/harness/omp/harness.ts:286-350` — system-prompt/prompt materialization, model candidates.
++- `plugins/software-factory/src/harness/omp/harness.ts:368-389` — argv construction (`--system-prompt`, `-p @file`, `--resume`, tools).
++- `plugins/software-factory/src/harness/omp/harness.ts:225-240` — overlay regeneration.
++- `plugins/software-factory/src/harness/omp/overlay.ts:26-100` — overlay keys; no cache/compaction/memory-autoRecall pins.
++- `plugins/software-factory/src/harness/omp/ndjson.ts:86-99,173-177` — usage fields dropped.
++- `plugins/software-factory/src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549` — `Usage`/`StepUsage` lack cache fields.
++- `plugins/software-factory/src/core/flows/step-runner.ts:534-547,620,817` — prompt rendering and `AgentRun` prompt.
++- `plugins/software-factory/src/core/records/step-record.ts:96`; `src/harness/omp/harness.ts:521-522` — `traceRef` to session JSONL.
++- `plugins/software-factory/src/cli/preflight.ts:364-393` — overlay validation via `omp --config … --version`.
++- `plugins/software-factory/docs/OMP_ADAPTER.md:164-172` — prior cache-safety claims; line 168 previously marked path-vs-content keying unknown.
++- `plugins/software-factory/docs/ARCHITECTURE.md:38` — one process per agent turn; `:40` — cache/compaction not built.
++- `docs/factory.v2.md:114-120` — spec items 20(a)-(d).
++
++OMP docs (official):
++- `https://omp.sh/docs/compaction` — compaction settings reference.
++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/settings.md:113-123` — precedence (overlay beats project/global); `:926` — cache-segment invalidation signals; `:1025-1027` — cacheRetention/cacheWarming; `:468` — includeModelInPrompt.
++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/models.md:465-504` — prompt-cache lifetimes (Anthropic 5m/1h; OAuth vs API key defaults).
++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/sdk.md:278` — idle maintenance is TUI-only; SDK/RPC/print sessions do not enable it.
++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/compaction.md:155-158` — idle-compaction/cache TTL trade-off; `:530` — experimental context management default false.
++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/rpc.md:190-210,970-1037` — `compact`, `set_cache_warming`, `cache_warming_start/end`/`warmingStopReason`.
++
++## Appendix A: Probe log (commands and raw result locations)
++
++All live probes were run as `omp -p --mode json --max-cost 0.10` from throwaway dirs; per-turn NDJSON and stderr were captured under `/tmp/spike-cache-key-{live,ttl,invalidation,tools-thinking,digest,cross-session,anth-path,retention,preflight}` (exception: the long/none retention probes in §3.3 saved only YAML results — no NDJSON/transcript was archived for them). The transport shim captured argv/system-prompt/prompt under `/tmp/spike-cache-key-0c1ojol5/capture/{fresh-1,fresh-2,resume-1,resume-2}`. The numbers in §3 are extracted from the `turn_end`/`message` usage rows in those files. Aggregate spend ≈ $0.05.
+diff --git a/plugins/software-factory/docs/spikes/omp-6-repo-rules.md b/plugins/software-factory/docs/spikes/omp-6-repo-rules.md
+new file mode 100644
+index 0000000..8c03096
+--- /dev/null
++++ b/plugins/software-factory/docs/spikes/omp-6-repo-rules.md
+@@ -0,0 +1,128 @@
++# Software-Factory v2: OMP Repo Rules & Injection Spike (M1)
++
++This report is empirical verification of how omp discovers repository rules and context files, how the factory's per-role prompts interact with that injection, and what the factory should do for the M1 `omp-workspaces` repo-rules requirement. Tested against `omp 18.18.5` on Linux x86_64 WSL2 with throwaway git fixtures and a local OpenAI-compatible mock provider. No paid models were used; no production files were changed.
++
++## 1. Verdicts
++
++### 1.1 Root omp sessions inject repo rules automatically — **VERIFIED**
++
++`omp --cwd <repo> --system-prompt <role-body>` still emits a trailing `<project-context>` footer with `<repo-rules>` and injects rules. `--system-prompt` replaces only block 0; it does not suppress context files, `RULES.md`, always-apply rules, or the rulebook listing.
++
++### 1.2 Current factory has no double injection — **VERIFIED**
++
++Factory roles are root omp processes; their `--system-prompt` contains only the agent definition body. Repo rule text is absent from all role/step prompt assets. Each active sentinel appeared exactly once in captured provider requests.
++
++### 1.3 Copying rules into role prompts double-injects — **VERIFIED**
++
++A role system prompt containing the same repo text produced 2 sentinel occurrences (block 0 + `<repo-rules>`). `--append-system-prompt` with the same text produced 2 (repo-rules + append). If M8 injects engine-rendered rules, it MUST disable omp discovery for that run.
++
++### 1.4 The spec's subagent premise is about scouts — **VERIFIED BY DOCS, NOT LIVE**
++
++oMP task subagents drop every context file named `AGENTS.md` by basename; they keep `RULES.md` and `contextFiles.extra`. Root role sessions do not drop AGENTS.md. The factory's architect/developer/qa/reviewer are root processes, so they already receive AGENTS.md. Scouts (`task`) do not; use RULES.md/extra/delegation context for them.
++
++### 1.5 Preflight overlay validation is a no-op — **VERIFIED (critical)**
++
++`omp --config <bad.yaml> --version` exits 0. The same overlay on a real turn fails with `Failed to parse config overlay`. The current preflight check (`preflight.ts:364-393`) proves the binary exists, not that the overlay is valid.
++
++### 1.6 No-paid-model mock provider is feasible — **VERIFIED**
++
++A throwaway `models.yml` custom provider (`api: openai-completions`, `apiKey` literal, `authHeader: true`) plus a local HTTP/SSE stub returned scripted responses and recorded exact request bodies. This is a viable basis for M8's scripted mock model provider.
++
++## 2. Source and precedence summary
++
++### 2.1 Context files (`<repo-rules>`)
++
++| Source | Provider priority | Scope |
++|---|---|---|
++| `.omp/AGENTS.md` | native 100 | nearest non-empty `.omp` walking cwd→repo root; no farther fallback |
++| `AGENTS.md` | agents-md 10 | every ancestor cwd→repo root (and enclosing workspace dirs under home) |
++| `.claude/CLAUDE.md` | claude 80 | launch cwd only |
++| `CLAUDE.md` | claude-md 10 | every ancestor cwd→repo root |
++| `.agent/AGENTS.md`, `.agents/AGENTS.md` | agents 70 | ancestor walk; `.agent` wins same level |
++| `.github/copilot-instructions.md` | github 30 | launch cwd only |
++| `.gemini/GEMINI.md` | gemini 60 | launch cwd only |
++| `contextFiles.extra` basenames | custom-context 9 | walk like AGENTS.md; additive; also user agent dir and primary checkout root in linked worktrees |
++
++One user context file survives by provider priority; one project file per depth; higher priority shadows at the same depth; different depths compose root→cwd (nearer last, more prominent). `contextFiles.extra` is additive and never takes the scope slot. Final injection is one `<repo-rules>` block in the trailing `<project-context>` footer, with absolute paths and expanded `@` imports.
++
++### 2.2 Rules
++
++| Source | Provider priority | Scope / bucket |
++|---|---|---|
++| `.omp/rules/*.{md,mdc}` | native 100 | `<cwd>/.omp/rules` only; always-apply / rulebook / TTSR |
++| `<agent-dir>/rules/*` | native 100 | user; same buckets |
++| `.omp/RULES.md` | native 100 sticky | nearest project `.omp`; forced always-apply (`RULES@project`) |
++| `<agent-dir>/RULES.md` | native 100 sticky | user; forced always-apply (`RULES`) |
++| `.cursor/rules/*.{mdc,md}` | cursor 50 | project `<cwd>/.cursor/rules`, user `~/.cursor/rules`; alwaysApply or rulebook |
++| `.cursorrules` | — | **not observed in 18.18.5**; do not rely on it |
++| `.windsurf/rules/*.md` | windsurf 50 | project; rules |
++| `.clinerules` | cline 40 | nearest; rules |
++| `.github/instructions/**/*.instructions.md` | github 30 | applyTo rules |
++| plugin `rules/` | omp-plugins 90 | extension packages |
++
++Rules dedup by name: native > omp-plugins > agents > cursor/windsurf > cline > github > builtin. Bucket order: TTSR > alwaysApply (full content) > rulebook (description listing; body via `rule://`). `--no-rules` removes all of them; `--no-context-files` removes none.
++
++### 2.3 Settings layers
++
++Environment > runtime > `--config` overlays > project `.omp/config.yml` > global `<agent-dir>/config.yml` > default. Arrays replace; they do not merge. `disabledExtensions: [context-file:<level>:<basename>]` drops a single context file; `disabledProviders` removes a whole discovery source.
++
++## 3. Injection behavior
++
++- Context files: `<repo-rules>` in `<project-context>` footer; static system block comes first, so worktree-specific rules sit below the Anthropic cache breakpoint.
++- Rules with default prompt: full always-apply content in `<generic-rules>`; conditional/described rules in `<domain-rules>` as name/description/globs pointers.
++- Rules with `--system-prompt`: always-apply content is prepended to block 0; rulebook renders as `<rules>` in block 0.
++- `--system-prompt` suppresses discovered `SYSTEM.md` but **not** `APPEND_SYSTEM.md`, context files, or rules.
++- `--no-context-files` disables context files only; `--no-rules` disables rules only; both are needed to disable both.
++- Discovered `APPEND_SYSTEM.md` is appended even with both flags and a custom system prompt; explicit empty `--append-system-prompt=` suppresses it.
++
++## 4. Probe matrix (condensed)
++
++| Probe | Result |
++|---|---|
++| repo1 baseline (root AGENTS, CLAUDE, .claude/CLAUDE, .cursorrules, .cursor/rules always, .omp/RULES, AGENTS.local) | `<repo-rules>` = `.claude/CLAUDE.md`; rules = `RULES.md` + cursor always; root AGENTS/CLAUDE shadowed; `.cursorrules` absent |
++| + `--system-prompt` | role text + rules in block 0; `<repo-rules>` still `.claude/CLAUDE.md` |
++| + `--no-context-files` | no `<repo-rules>`; rules remain |
++| + `--no-rules` | `<repo-rules>` remains; rules gone |
++| + extra overlay `AGENTS.local.md` | `.claude/CLAUDE.md` + `AGENTS.local.md` |
++| repo2 `.omp/AGENTS.md` + root AGENTS | `.omp/AGENTS.md` only; root shadowed |
++| repo3 only AGENTS.md | `AGENTS.md` injected |
++| repo4 only CLAUDE.md | `CLAUDE.md` injected |
++| repo5 only `.cursorrules` | nothing, even with `read` |
++| repo6 conditional `.mdc` | `<domain-rules>` listing only |
++| repo7 always `.mdc` + `.cursorrules` | always body injected; `.cursorrules` absent |
++| cwd `sub/` | root + sub AGENTS (root first); root `.omp/RULES.md`; root `.claude` not loaded |
++| repo8 native rules + same-name cursor | native body wins; cursor body absent; conditional in `<domain-rules>` |
++| cwd `sub/` of repo8 | root `.omp/rules` not loaded; root RULES still loaded |
++| duplicate role prompt | sentinel count 2; with `--no-context-files` count 1 |
++| duplicate append | sentinel count 2 |
++| user AGENTS/RULES/SYSTEM/APPEND | all load; APPEND survives both disable flags; empty append suppresses |
++| project config extra + overlay empty / disabledExtensions | project extra loads; overlay `[]` removes; disabled file drops while extra stays |
++| resume after editing AGENTS.md | new system footer contains V2 only; history retained |
++| preflight bad overlay + `--version` | exit 0; real turn parse error |
++
++## 5. Role hydration seams
++
++- `--system-prompt` = `agents/<role>.md` body (frontmatter stripped, shared partials resolved).
++- `-p @<prompt>` = rendered `agents/steps/<step>.md` with prompt vars/schema.
++- `--cwd` = task worktree for architect/plan-reviewer/PM/close-ups; item worktree for developer/qa/reviewer. That cwd is the omp discovery root.
++- One shared `{runtimeDir}/omp-overlay.yaml`; currently no context/rules keys.
++- Inherited `HOME`/agent dir means user-level `AGENTS.md`/`RULES.md`/`APPEND_SYSTEM.md` apply to every role.
++
++## 6. M8 plan
++
++1. Keep omp auto-discovery as the repo-rules injector for root roles; do not copy rule text into role definitions or step prompts.
++2. Add a pipeline/overlay knob for `contextFiles.extra` (array of basenames) and, if needed, `disabledExtensions` for user-level contamination.
++3. For rules that scouts must follow, use `.omp/RULES.md` or `contextFiles.extra`, or pass them in the `task` tool `context` field; AGENTS.md alone is invisible to scouts.
++4. Add a mock-provider test harness that records request bodies; assert sentinel counts per role, precedence, flags, resume refresh, and cache-prefix stability.
++5. Optionally run a cheap live probe where each role quotes sentinels; assert root roles see AGENTS and scouts do not (unless RULES/extra/context carries them).
++6. If engine-side hydration is ever chosen, launch with `--no-context-files --no-rules --append-system-prompt=` and assert count == 1.
++7. Replace preflight's `--config --version` with a real throwaway turn against the mock provider.
++
++## 7. Recommendations
++
++- **Use omp-native injection** (recommended): no double injection, no rule-text duplication, cache-friendly (rules in the trailing footer below the cache breakpoint).
++- **Do not rely on `.cursorrules`** in omp 18.18.5; use `.cursor/rules/*.mdc` with `alwaysApply: true`.
++- **Put hard repo rules in `.omp/RULES.md`** if scouts must see them; keep AGENTS.md for the broader root-session guidance.
++- **Verify user-level prompt files** are intentional; suppress `APPEND_SYSTEM.md` with `--append-system-prompt=` for deterministic role prompts.
++- **Pin/sync repo rules across worktrees** at item/wave creation if rule changes must be consistent.
++- **Keep factory launches at worktree roots**: `.omp/rules` and `.claude/CLAUDE.md` are cwd-only, so launching a role from a subdirectory would silently miss the root copies.
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
+## Open Concerns
+- id: c-552344216d
+  kind: blocker
+  severity: high
+  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
+  affects:
+    - "19.2"
+    - wave-merge
+- id: c-f972360209
+  kind: tech-debt
+  severity: medium
+  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
+  affects:
+    - redrive
+    - wave-merge
+- id: c-0647070832
+  kind: tech-debt
+  severity: high
+  summary: Child/merge worktrees still need infra.setup (bun install) before the bun test runner can collect tests; this worktree had no node_modules until installed manually
+  affects:
+    - target-red
+    - wave-merge
+- id: c-f415508eb1
+  kind: risk
+  severity: medium
+  summary: Gate runs that inherit the factory-runtime TMPDIR produce unrelated test failures
+  affects:
+    - gates
+    - wave-merge
+- id: rm-02fe59eb65
+  kind: remarkable
+  summary: Deterministic architect brief skeleton + cheap `@simpler` relevance judge (`brief.ts`)
+- id: rm-61c10c8318
+  kind: remarkable
+  summary: Schema-bound architect plan (`plan.schema.json`) with PM structuring item edits
+- id: rm-63922d9635
+  kind: remarkable
+  summary: Configure omp via a generated YAML overlay per turn
+- id: rm-ac427a6618
+  kind: remarkable
+  summary: "Engine-managed git worktrees (`git worktree add` + `omp --cwd`) rather than omp `isolated: true` subagent tasks"
+- id: rm-df9df7bd8a
+  kind: remarkable
+  summary: Epics run in-process as child tasks with an in-process `runTaskChild`
+- id: rm-565790e99d
+  kind: remarkable
+  summary: On-demand whole-tree derivation; no registry
+- id: rm-6344b013f9
+  kind: remarkable
+  summary: Additive optional cache fields; no record migration
+- id: rm-d5301c7af1
+  kind: remarkable
+  summary: Real-binary scripted-provider e2e; FakeHarness retained
+- id: rm-d7f1fc7cc4
+  kind: remarkable
+  summary: Four spikes + two foundation items in iteration 1; epics deferred to iteration 2
+
+
+- Raise concerns with evidence; condense stale detail instead of repeating it.
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["approved","changes_requested"])
+- summary (string, required)
+- suggestions (array of object, required)
+  - id (string, required)
+  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async"])
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
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..6ab2bfe
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 2
+name: qa
+attempt: 1
+fixRound: 1
+agent: qa
+role: alt-workhorse
+models:
+  - opencode-go/muse-spark-1.3-contributor
+  - opencode-go/deepseek-v4.1-flash
+timeoutSec: 5400
+status: ok
+startedAt: 2026-11-10T02:28:30.436Z
+session: 01a1c349-1cc2-739a-990e-2c1cce0ebd71
+endedAt: 2026-11-10T02:42:24.339Z
+usage:
+  inputTokens: 232949
+  outputTokens: 72636
+  costUsd: 0.051412
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-31-042Z_01a1c349-1cc2-739a-990e-2c1cce0ebd71.jsonl
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..8b98887
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/output.yaml
@@ -0,0 +1,16 @@
+status: approved
+summary: "Docs-only recovery verified: 4 spike docs + RECOVERY.md with probe
+  evidence; zero src/test changes; typecheck green; sole test fail is
+  pre-existing baseline"
+suggestions:
+  - detail: checks.yaml records test gate status pass with 663 pass/2 skip/1 fail;
+      the 1 fail is the documented baseline-red disk-space test (state.yaml debt
+      entry; test file untouched by this diff, verified via merge-base numstat).
+      No item action required; engine gate reporting tolerates the known
+      baseline.
+    disposition: optional
+    id: test-gate-baseline-reporting
+    location:
+      file: .factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/checks.yaml
+      line: 1
+    summary: Test gate pass coexists with 1 documented baseline failure
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/003-review-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/003-review-r1-a1/input.md
new file mode 100644
index 0000000..13b5b60
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/003-review-r1-a1/input.md
@@ -0,0 +1,3624 @@
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
+- id: c-552344216d
+  kind: blocker
+  severity: high
+  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
+  affects:
+    - "19.2"
+    - wave-merge
+- id: c-f972360209
+  kind: tech-debt
+  severity: medium
+  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
+  affects:
+    - redrive
+    - wave-merge
+- id: c-f415508eb1
+  kind: risk
+  severity: medium
+  summary: Gate runs that inherit the factory-runtime TMPDIR produce unrelated test failures
+  affects:
+    - gates
+    - wave-merge
+- id: rm-02fe59eb65
+  kind: remarkable
+  summary: Deterministic architect brief skeleton + cheap `@simpler` relevance judge (`brief.ts`)
+- id: rm-61c10c8318
+  kind: remarkable
+  summary: Schema-bound architect plan (`plan.schema.json`) with PM structuring item edits
+- id: rm-63922d9635
+  kind: remarkable
+  summary: Configure omp via a generated YAML overlay per turn
+- id: rm-ac427a6618
+  kind: remarkable
+  summary: "Engine-managed git worktrees (`git worktree add` + `omp --cwd`) rather than omp `isolated: true` subagent tasks"
+- id: rm-df9df7bd8a
+  kind: remarkable
+  summary: Epics run in-process as child tasks with an in-process `runTaskChild`
+- id: rm-565790e99d
+  kind: remarkable
+  summary: On-demand whole-tree derivation; no registry
+- id: rm-6344b013f9
+  kind: remarkable
+  summary: Additive optional cache fields; no record migration
+- id: rm-d5301c7af1
+  kind: remarkable
+  summary: Real-binary scripted-provider e2e; FakeHarness retained
+- id: rm-d7f1fc7cc4
+  kind: remarkable
+  summary: Four spikes + two foundation items in iteration 1; epics deferred to iteration 2
+- id: rm-1e89eca104
+  kind: remarkable
+  summary: Additive optional cache-token fields with zero-default aggregation, no migration
+- id: rm-f6cb03959a
+  kind: remarkable
+  summary: Iteration-1 spikes+measurement only, epics deferred to iteration-2 via replanAfter
+
+
+- Triage pre-existing concerns by exact `id` (`c-*` / `rm-*`) with the dispositions above plus `dismiss`; never restate a triaged concern as a new finding.
+- Use `dismiss` only with a non-empty `detail` giving the reason; a dismiss without a reason fails the step.
+- Keep concern summaries short: condense or dismiss stale concerns instead of repeating long detail.
+- Raise concerns with evidence when review uncovers new cross-cutting issues.
+
+## Assignment
+{
+  "slug": "spike-findings-recovery",
+  "kind": "no-behavior",
+  "title": "Recover wave-1 spike findings onto parent branch",
+  "assignment": "Salvage approved wave-1 spike research stranded on environmentally-failed item branches onto the parent branch. All research steps + reviews are approved; only wave-end merges failed (missing node_modules). Docs only, zero prod lines.\n\nRead-only sources (NEVER checkout/switch branches, NEVER write to .factory/** engine-owned paths; use `git show <branch>:<path>` only):\n- topic/omp-workspaces--spike-omp-isolation :: items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml (+003 review)\n- topic/omp-workspaces--spike-mock-provider :: items/spike-mock-provider/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-cache-key :: items/spike-cache-key/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-repo-rules :: items/spike-repo-rules/steps/001-research-r1-a1/output.yaml (+002 review)\n- parent-branch decisions/001 + 002 rulings (read on parent branch).\n\nSteps:\n1. git-show each research output.yaml + its review output; extract the embedded spike-draft markdown.\n2. Apply each review's optional polish notes ONLY where they correct evidence (e.g. probe-26/18 softening, spec-path fix); do not invent new probes.\n3. Write the four drafts to: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md.\n4. Write items/spike-findings-recovery/RECOVERY.md mapping each M1 scenario (isolation probe matrix, mock-provider seam, cache-keying, repo-rules injection) to branch evidence + followUps for iteration-2 planning (M3/M4/M6/M7/M8).\n5. Verify on parent branch only: all five files exist, each spike doc retains probe-evidence/logs + recommendations sections, RECOVERY.md covers all four M1 scenarios.\n\nAcceptance: 4 spike docs + RECOVERY.md present with probe evidence; no prod code changed; no branch checkouts; no .factory/** writes.\n\nConstraints: no-behavior kind; no deps; wave-2 parallel (self-contained, self-heals node_modules via own develop-step gates).",
+  "outlineRef": "spike-findings-recovery",
+  "milestone": "m1-omp-de-risk",
+  "wave": 2,
+  "citations": [
+    "topic/omp-workspaces--spike-omp-isolation:items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml",
+    "topic/omp-workspaces--spike-mock-provider:items/spike-mock-provider/steps/001-research-r1-a1/output.yaml",
+    "topic/omp-workspaces--spike-cache-key:items/spike-cache-key/steps/001-research-r1-a1/output.yaml",
+    "topic/omp-workspaces--spike-repo-rules:items/spike-repo-rules/steps/001-research-r1-a1/output.yaml"
+  ]
+}
+
+## Engine Checks
+
+
+## Code Diff
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml b/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml
+deleted file mode 100644
+index 1499898..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml
++++ /dev/null
+@@ -1,29 +0,0 @@
+-id: c-0647070832
+-kind: tech-debt
+-summary: Child/merge worktrees still need infra.setup (bun install) before the
+-  bun test runner can collect tests; this worktree had no node_modules until
+-  installed manually
+-detail: Running `bun test` in a fresh worktree failed with `Cannot find package
+-  'yaml'` from test/records-and-fingerprint.test.ts and src/core/prompts.ts
+-  until `bun install` was run. This is the pre-existing open concern
+-  c-552344216d (missing infra.setup in merge-child worktrees), not introduced by
+-  this step; node_modules is gitignored and not part of the change.
+-affects:
+-  - target-red
+-  - wave-merge
+-severity: high
+-status: dismissed
+-source:
+-  record: 001-test-first-r1-a1
+-  agent: developer
+-  step: test-first
+-  item: usage-cache-tokens
+-  lastSeen: 2026-11-10T02:05:24.168Z
+-createdAt: 2026-11-10T02:05:24.168Z
+-updatedAt: 2026-11-10T02:46:53.285Z
+-disposition: dismiss
+-dismissReason: "Self-declared duplicate: the concern's own detail text states
+-  'This is the pre-existing open concern c-552344216d (missing infra.setup in
+-  merge-child worktrees), not introduced by this step'. Same root cause (bun
+-  install absent in fresh worktree), same affects. Keep c-552344216d as
+-  canonical."
+diff --git a/.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml b/.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml
+deleted file mode 100644
+index fdfe75a..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml
++++ /dev/null
+@@ -1,24 +0,0 @@
+-id: c-f415508eb1
+-kind: risk
+-summary: Gate runs that inherit the factory-runtime TMPDIR produce unrelated
+-  test failures
+-detail: "When TMPDIR points under .factory-runtime/tmp, disk-space.test.ts
+-  counts the tmpdir itself as a second low-space path (fails: expected 1 failing
+-  path, got 2) and several engine tests fail with git 'could not create
+-  temporary file' or 5s timeouts under contention. With TMPDIR=/tmp the same
+-  full suite is fully green (669 pass / 2 skip / 0 fail). This is
+-  pre-existing/environmental and not caused by this test-only diff, but it
+-  affects gate greenness for any item run in this environment."
+-affects:
+-  - gates
+-  - wave-merge
+-severity: medium
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: transport-byte-stability
+-  lastSeen: 2026-11-10T02:28:29.083Z
+-createdAt: 2026-11-10T02:28:29.083Z
+-updatedAt: 2026-11-10T02:28:29.083Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml b/.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml
+deleted file mode 100644
+index 9f8e15f..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml
++++ /dev/null
+@@ -1,21 +0,0 @@
+-id: rm-4e7a8c758b
+-chosen: Published the full embedded draft for isolation and enriched it with the
+-  approved findings' 27-probe command log, config surface, and follow-ups.
+-alternatives:
+-  - Publish only the compact embedded full draft (fails the
+-    probe-log/recommendations acceptance)
+-  - Reconstruct the whole document from the pre-draft findings (duplicates the
+-    approved draft)
+-why: The M1 directional interface requires findings + probe logs +
+-  recommendations, and the embedded compact draft had no dedicated
+-  probe/recommendation sections; all added content comes from the same approved
+-  research output, so no new probes were invented.
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: spike-findings-recovery
+-  lastSeen: 2026-11-10T02:23:11.570Z
+-createdAt: 2026-11-10T02:23:11.570Z
+-updatedAt: 2026-11-10T02:23:11.570Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml b/.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml
+deleted file mode 100644
+index 3cdbede..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml
++++ /dev/null
+@@ -1,18 +0,0 @@
+-id: rm-63a8ee819c
+-chosen: Wrote RECOVERY.md at the assigned
+-  `items/spike-findings-recovery/RECOVERY.md` item-local path.
+-alternatives:
+-  - Write a repo-root `items/` copy (not the assigned task-workspace path)
+-  - Write under engine-owned `.factory` records (explicitly forbidden)
+-why: Step 4 mandates that path (shorthand for the task's `items/` workspace); no
+-  engine-owned record (`runs/`, `plan/`, `state.yaml`, `journal.ndjson`,
+-  `decisions/`) was modified.
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: spike-findings-recovery
+-  lastSeen: 2026-11-10T02:23:11.570Z
+-createdAt: 2026-11-10T02:23:11.570Z
+-updatedAt: 2026-11-10T02:23:11.570Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml b/.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml
+deleted file mode 100644
+index 8bab5e4..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml
++++ /dev/null
+@@ -1,20 +0,0 @@
+-id: rm-8363899156
+-chosen: Pin the prompt filename instability with explicit shape and difference
+-  assertions plus comments, instead of stabilizing transport.
+-alternatives:
+-  - "Stabilize prompt paths in production code: out of scope for this test-only
+-    item."
+-  - "Only compare normalized argv: would hide the unstable element instead of
+-    pinning it."
+-why: Assignment defers stabilization to M7 after spike-cache-key; a
+-  failing-explicit assertion documents the currently unstable behavior and will
+-  point at the decision when transport is stabilized.
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: transport-byte-stability
+-  lastSeen: 2026-11-10T02:28:29.083Z
+-createdAt: 2026-11-10T02:28:29.083Z
+-updatedAt: 2026-11-10T02:28:29.083Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml b/.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml
+deleted file mode 100644
+index 22471e5..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml
++++ /dev/null
+@@ -1,18 +0,0 @@
+-id: rm-9efb47e04e
+-chosen: Specify zero-default aggregation and optional schema properties, with no
+-  migration of historical records.
+-alternatives:
+-  - Migration/backfill of old records (explicitly out of scope).
+-  - Required schema fields (would invalidate historical records).
+-why: "Matches the assignment contract: absent cache keys in old meta.yaml/NDJSON
+-  must read as 0 and remain schema-valid, while new records persist
+-  cacheReadTokens/cacheWriteTokens/totalTokens and a cost breakdown."
+-status: open
+-source:
+-  record: 001-test-first-r1-a1
+-  agent: developer
+-  step: test-first
+-  item: usage-cache-tokens
+-  lastSeen: 2026-11-10T02:05:24.168Z
+-createdAt: 2026-11-10T02:05:24.168Z
+-updatedAt: 2026-11-10T02:05:24.168Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-af4c866bf2.yaml b/.factory/tasks/omp-workspaces/concerns/rm-af4c866bf2.yaml
+deleted file mode 100644
+index 7481d13..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-af4c866bf2.yaml
++++ /dev/null
+@@ -1,21 +0,0 @@
+-id: rm-af4c866bf2
+-chosen: Characterize transport via mock omp binary snapshotting argv + file
+-  bytes, with only the real-binary --config --version acceptance check behind
+-  describe.skipIf.
+-alternatives:
+-  - Live-model harness turns (paid, flaky)
+-  - In-process spawn mocking (bypasses real argv assembly)
+-  - Pure-function tests only (cannot pin timestamped prompt filename)
+-why: Captures exact harness-to-omp bytes/argv without provider contact (no paid
+-  turns) or requiring omp on clean checkout, while still validating overlay
+-  acceptance with the real binary when present using preflight's own non-paid
+-  validation.
+-status: open
+-source:
+-  record: 002-review-r1-a1
+-  agent: reviewer
+-  step: review
+-  item: transport-byte-stability
+-  lastSeen: 2026-11-10T02:46:53.244Z
+-createdAt: 2026-11-10T02:46:53.244Z
+-updatedAt: 2026-11-10T02:46:53.244Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml b/.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml
+deleted file mode 100644
+index 273f553..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml
++++ /dev/null
+@@ -1,25 +0,0 @@
+-id: rm-ccac403fa7
+-chosen: Characterize transport via a mock omp binary that snapshots argv plus
+-  the --system-prompt/-p/--config files, and guard only the real-binary overlay
+-  acceptance check with omp-presence skip.
+-alternatives:
+-  - "Run harness turns against real omp with live models: paid and flaky,
+-    violates no-paid-turns constraint."
+-  - "Mock the bun spawn module in-process: fragile, bypasses the real argv
+-    assembly path."
+-  - "Test only pure generateOmpConfigOverlay/render functions: cannot pin the
+-    timestamped prompt filename or full argv instability."
+-why: This captures the exact bytes and argv the harness would hand to omp
+-  without contacting a provider (no paid turns) and without requiring omp on a
+-  clean checkout, while still validating the generated overlay with the real
+-  binary when it is installed using the same non-paid `--config <overlay>
+-  --version` preflight performs.
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: transport-byte-stability
+-  lastSeen: 2026-11-10T02:28:29.083Z
+-createdAt: 2026-11-10T02:28:29.083Z
+-updatedAt: 2026-11-10T02:28:29.083Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml b/.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml
+deleted file mode 100644
+index 71f4351..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml
++++ /dev/null
+@@ -1,21 +0,0 @@
+-id: rm-d3a28fa170
+-chosen: Deliver a test-only diff and defer the merge-path.ts implementation to
+-  the follow-up develop step.
+-alternatives:
+-  - Implement mergeItem setup execution in this step as the story assignment
+-    text lists — rejected because target-red would see green and
+-    test-first-scope rejects modified src/** files.
+-  - Introduce a prod interface stub — unnecessary because the tests exercise the
+-    existing mergeItem export.
+-why: The story.dev flow runs test-first-scope (rejects any modified prod file)
+-  and target-red (declared tests must currently fail) in this step; shipping the
+-  implementation here would fail both mechanical checks.
+-status: open
+-source:
+-  record: 001-test-first-r1-a1
+-  agent: developer
+-  step: test-first
+-  item: merge-setup-fix
+-  lastSeen: 2026-11-10T02:12:17.201Z
+-createdAt: 2026-11-10T02:12:17.201Z
+-updatedAt: 2026-11-10T02:12:17.201Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml b/.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml
+deleted file mode 100644
+index c8c12a6..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml
++++ /dev/null
+@@ -1,20 +0,0 @@
+-id: rm-d63aed4fdb
+-chosen: Declare expectRed ids as bare Bun test names rather than file-qualified
+-  `file::test` node ids.
+-alternatives:
+-  - File-qualified `test/...::test` ids (would not match Bun's describe-based
+-    JUnit ids unless the describe name is also embedded).
+-  - Full `<describe>.<test>` ids (brittle to describe renames).
+-why: "Bun's JUnit reporter emits ids as `<innermost describe>.<test name>` with
+-  no file path in the id; the engine's normalizer matches a bare id by suffix
+-  (`id.endsWith('.' + expectId)`). Verified against parseJunit output: all 11
+-  ids match exactly one failing case."
+-status: open
+-source:
+-  record: 001-test-first-r1-a1
+-  agent: developer
+-  step: test-first
+-  item: usage-cache-tokens
+-  lastSeen: 2026-11-10T02:05:24.168Z
+-createdAt: 2026-11-10T02:05:24.168Z
+-updatedAt: 2026-11-10T02:05:24.168Z
+diff --git a/.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml b/.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml
+deleted file mode 100644
+index 681e394..0000000
+--- a/.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml
++++ /dev/null
+@@ -1,19 +0,0 @@
+-id: rm-eaf2656f2a
+-chosen: Retained `test/e2e/mock-provider` in the mock-provider doc while
+-  documenting why it is justified over `test/harness/mock-provider`.
+-alternatives:
+-  - Rename to `test/harness/mock-provider` (conflicts with the M8 plan interface)
+-  - Drop the proposal path entirely (loses actionable M8 guidance)
+-why: The M8 plan's directional interface explicitly names
+-  `test/e2e/mock-provider/*`, and the split keeps the no-model scripted suite
+-  separate from paid live coverage; the review allowed either the repo idiom or
+-  a justification.
+-status: open
+-source:
+-  record: 001-develop-r1-a1
+-  agent: developer
+-  step: develop
+-  item: spike-findings-recovery
+-  lastSeen: 2026-11-10T02:23:11.570Z
+-createdAt: 2026-11-10T02:23:11.570Z
+-updatedAt: 2026-11-10T02:23:11.570Z
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md
+new file mode 100644
+index 0000000..cfaee73
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md
+@@ -0,0 +1,90 @@
++# Wave-1 spike findings recovery
++
++Status: recovered. Docs-only salvage of approved wave-1 research onto the parent branch.
++
++## Why this exists
++
++All four wave-1 spike items completed research (`status: ok`) and review (`status: approved`), but their wave-end merges failed environmentally: the merge-path gates ran without `infra.setup` in the child worktree, so the missing `node_modules` failed typecheck. No research finding was rejected. This item re-materializes the approved drafts as product docs and records the evidence mapping needed by iteration-2 planning. No production code changed; the source item branches were read via `git show` only (no checkout/switch).
++
++## Source provenance (read-only)
++
++| M1 scenario | Source branch | Research record | Review record | Review outcome |
++|---|---|---|---|---|
++| 1. Isolation probe matrix | `topic/omp-workspaces--spike-omp-isolation` (`cd07f2d`) | `items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml` (`ok`) | `steps/003-review-r1-a1/output.yaml` | `approved`; probe-26/18 interpretation softened |
++| 2. Mock-provider seam | `topic/omp-workspaces--spike-mock-provider` (`85c4b46`) | `items/spike-mock-provider/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; e2e split justified |
++| 3. Cache keying | `topic/omp-workspaces--spike-cache-key` (`c28f43b`) | `items/spike-cache-key/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; spec-path/provenance fixes applied |
++| 4. Repo-rules injection | `topic/omp-workspaces--spike-repo-rules` (`9755c7e`) | `items/spike-repo-rules/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; cwd-scope invariant documented |
++
++Parent-branch decisions consumed:
++
++- `decisions/001-item-spike-repo-rules-1.yaml` — `accept-with-debt`; rulings: M4 replaces the preflight no-op with a real mock-provider turn; M8 builds the scripted mock helper with per-role request-body assertions; M8 keeps omp as sole root injector, implements RULES/extra for scouts, and asserts one sentinel per role; M8 chooses the prompt-isolation policy (profile/agent-dir and/or `disabledExtensions` + empty `--append-system-prompt=`).
++- `decisions/002-item-spike-omp-isolation-1.yaml` — `accept-with-debt`; rulings: M4 replaces `preflight.ts:364-394` with key/enum/catalog validation plus one real isolated round-trip turn; M3 implements the ratified root mapping (`omp worktree add -b <topic-branch> <path> <base> -C <repo>` then `omp --cwd <path> -p`) with `isolation: engine` as the fallback and unchanged engine merge ownership.
++
++## Recovered docs
++
++| Doc | M1 scenario | Evidence preserved |
++|---|---|---|
++| `plugins/software-factory/docs/spikes/omp-3-isolation.md` | 1 | 27-probe command log + excerpts, backend enum, retention matrix, root mapping, `task.isolation` vs engine merge, preflight recipe, draft config surface, recommendations |
++| `plugins/software-factory/docs/spikes/omp-4-mock-provider.md` | 2 | 17-probe log, extension/SSE seam, scenario `{turns}` contract, NDJSON/usage contract, `OmpHarness` wrapper, decision YAML + followUps, sources |
++| `plugins/software-factory/docs/spikes/omp-5-cache-keys.md` | 3 | Transport byte/argv audit, live resume probe log (DeepSeek/Anthropic), TTL/model/content invalidation, cold-resume signals, knob audit, compaction/warming analysis, recommendations, appendix |
++| `plugins/software-factory/docs/spikes/omp-6-repo-rules.md` | 4 | Source inventory, precedence/composition, flag matrix, probe matrix, per-role seams, M8 verification plan, recommendations |
++
++## M1 scenario → evidence mapping
++
++### 1. Isolation probe matrix (M1 scenario-1)
++
++Evidence: `isolation.backend` has exactly 9 accepted values (`auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy`); every value degrades to plain checkout with a FICLONE warning on ext4/WSL2. Retention: `worktree add` + `--cwd` keeps commits/partials/registration on success, failure, and SIGKILL; isolated subagents retain a patch or `omp/task/<Agent>` branch on success **and** failure; parent abort loses all. `worktree.onStart` is a no-op for `-p`. omp `apply:true` produces a single-parent commit with no gates/conflict agent, so engine `merge-path.ts` remains merge owner and subagents use `apply:false`. Preflight must include one real turn (probes 17/18/27: bogus keys, invalid backend overlays, and missing overlays are all accepted by static checks).
++
++FollowUps:
++- **M3**: implement `workspaces.isolation: omp|engine`, the omp backend/worktree/`task.isolation` config surface, `omp worktree add` + `--cwd` root mapping, and keep topic branch naming + engine merge ownership.
++- **M4**: replace `preflight.ts:364-394` with key/enum/catalog validation plus one real isolated round-trip turn; derive status/gc from `git worktree list` + records; classify turn outcome from the `--mode json` transcript, not process rc.
++- **M6**: add cross-launch merge/lock coordination for parallel-epic launches.
++
++### 2. Mock-provider seam (M1 scenario-2)
++
++Evidence: an omp extension loaded with `-e/--extension` calls `pi.registerProvider('mock', {...openai-completions...})` against a local SSE server; `omp models -e ... --json` lists `mock/mock-chat`. Proven end-to-end on real omp 18.18.5 with zero paid calls: text turn, yield envelope, read→yield tool loop, parallel tool calls, session resume, `@role` resolution, parallel processes, and `OmpHarness.run`/`complete` through a wrapper. Scenario format is `{turns: [{text}|{toolCalls}|{yield}]}` with optional `usage`/`finishReason` and top-level `match`/`onExhausted`; error turns are not probed.
++
++FollowUps:
++- **M8**: add `extraArgs`/`mockProvider` to `OmpHarness`; implement `test/e2e/mock-provider/{extension,server,scenario,runner}.ts`, gate with `FACTORY_E2E_OMP=1`, keep paid `FACTORY_LIVE_OMP=1` separate, assert only `mock/mock-chat` requests and `usage.costUsd === 0`.
++- **M4**: use the seam for the preflight real-turn validation.
++
++### 3. Cache keying (M1 scenario-3)
++
++Evidence: omp 18.18.5 keys the prompt cache by request-prefix **content**, not by file path. Identical bytes at a changed system-prompt path still fully hit; a model switch is a full cold read (measured ≈8.9× warm). TTL expiry (Anthropic 5m) causes a cold read; long retention was verified separately. Compaction rewrites history and makes the next resume cold from the cut point. The factory currently detects none of these signals and pins none of the cache/compaction/memory knobs; the manual `-p "/compact"` path exists but its cost is absent from NDJSON.
++
++FollowUps:
++- **M7**: extend usage accounting with `cacheReadTokens`/`cacheWriteTokens`/`totalTokens`/`cacheTtl`/provider/model/reasoning fields; add a per-session cache-state record; record the resolved model used by the successful turn and pass that literal model on resume; pin `providers.cache*`, `compaction.*`, `snapcompact.*`, and `mnemopi.autoRecall/autoRetain` in the overlay; measure long-vs-short retention and fresh-brief-vs-warm-compaction on the self-host fire test; add a mock-provider cache fixture.
++- **M4**: validate effective overlay values (not `--version`) and read back performance-relevant settings in preflight.
++
++### 4. Repo-rules injection (M1 scenario-4)
++
++Evidence: root omp sessions discover and inject repo context/rules into a trailing `<repo-rules>` footer; `--system-prompt` replaces block 0 only. The current factory has no double injection because role prompts contain no repo-rule text. Copying rules into role prompts or append prompts double-injects (2 sentinel copies). omp `task` subagents drop `AGENTS.md` but keep `RULES.md` and `contextFiles.extra`. User-level `APPEND_SYSTEM.md`, `AGENTS.md`, and `RULES.md` leak into roles unless isolated or suppressed; only an explicit empty `--append-system-prompt=` suppresses the append file. Resume re-discovers repo rules each process, while the static block-0 prefix stays stable.
++
++FollowUps:
++- **M4**: replace the preflight `--config --version` no-op using the mock-provider real-turn recipe.
++- **M8**: keep omp as sole injector for root roles; implement `RULES.md`/`contextFiles.extra` (or delegation context) for scouts; add sentinel-based per-role request-body tests; choose and enforce the user-level contamination policy; keep factory launches at worktree roots because `.omp/rules` and `.claude/CLAUDE.md` are cwd-only.
++
++## Iteration-2 follow-up index
++
++| Milestone | Follow-up | Source |
++|---|---|---|
++| M3 | omp workspace backend + `isolation: engine` fallback + config surface + unchanged branch/merge ownership | `omp-3-isolation.md` §7/§9/§10; decision 002 |
++| M4 | preflight version/key/enum/catalog checks + one real isolated round trip; status/gc from git records; transcript-based outcome | `omp-3-isolation.md` §5/§10, `omp-5-cache-keys.md` §9.5, `omp-6-repo-rules.md` §6; decisions 001/002 |
++| M6 | cross-launch merge/lock coordination for parallel epics; per-epic workspace isolation | `omp-3-isolation.md` §10 |
++| M7 | cache/compaction usage plumbing, session cache-state, literal model on resume, overlay pins, retention measurement, mock cache fixture | `omp-5-cache-keys.md` §9/§10/§11 |
++| M8 | scripted mock-provider helper + `extraArgs`; repo-rules hydration/sentinel tests; user-level isolation policy; no-model e2e and use-case docs | `omp-4-mock-provider.md` §M8/decision, `omp-6-repo-rules.md` §6/§7 |
++
++## Review polish ledger
++
++Applied only where the note corrected evidence (no new probes invented):
++
++- **Isolation** — probe 26 corrected: in-base explicit-path worktrees are listed by `worktree list --json` when `OMP_WORKTREE_DIR` is aligned; outside-base trees are invisible; live trees are never reported as orphans. Probe 18 softened: invalid backend overlay is accepted, but `config get` ignores `--config` overlays, so runtime coercion is unproven. Retention matrix scoped to single-host omp 18.18.5/ext4/WSL2.
++- **Cache** — spec source fixed to `docs/factory.v2.md:114-120`; `tokensAfter`/`method` attributed to the transcript `compaction` entry rather than the NDJSON result; long/none retention probes qualified as YAML-only artifacts; dead `steps/architect-resume` fragment noted while keeping the byte-diff evidence valid.
++- **Repo rules** — worktree-root cwd invariant documented because `.omp/rules` and `.claude/CLAUDE.md` are cwd-only.
++- **Mock provider** — the `test/e2e/` split is retained and justified: it separates the no-model scripted suite from paid live coverage and matches the M8 plan's directional interface. The optional raw-NDJSON-excerpt and unprobed-error-turn notes remain disclosed limitations, not re-probed here.
++
++## Verification
++
++- All five recovery outputs exist and each spike doc contains a findings section plus probe evidence/log and recommendations/M8 sections (see the recovered-docs table).
++- Source records were read with `git show <branch>:<path>`; no branch was checked out.
++- No production code changed. No engine-owned record (`runs/`, `plan/`, `state.yaml`, `journal.ndjson`, `decisions/`) was modified; the only orchestration-folder write is this item's assigned deliverable `items/spike-findings-recovery/RECOVERY.md`.
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..3f4821c
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/checks.yaml
+@@ -0,0 +1,116 @@
++checks:
++  - id: gates
++    status: pass
++    message: Gates passed (2 gates)
++    details:
++      - id: typecheck
++        command: bun --cwd=plugins/software-factory run typecheck
++        status: pass
++        durationMs: 7518
++        details: $ tsc --noEmit
++      - id: test
++        command: bun --cwd=plugins/software-factory test
++        status: pass
++        durationMs: 520862
++        details: >-
++          bun test v1.4.4 (38afee6c8)
++
++          Disk space check passed (threshold 2048 MB):
++            worktreeRoot (/tmp/factory-test-repo-OFsFtD.factory-wt): 4473 MB free
++            .factory-runtime/tmp (/tmp/factory-test-repo-OFsFtD.factory-wt/.factory-runtime/tmp): 4473 MB free
++            repoRoot (/tmp/factory-test-repo-OFsFtD): 4473 MB free
++            tmpdir (/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp): 79632 MB free
++            /tmp (/tmp): 4473 MB free
++          ================================================================
++
++          Task: status-test-task [ACTIVE]
++
++          Kind: unclassified | Iteration: 1 | Wave: 1
++
++          Worktree: (none - main checkout)
++
++          Config path: /tmp/factory-test-repo-z4yvBN/.factory/pipeline.yaml
++
++          Budget spent: $0.0000
++
++          ----------------------------------------------------------------
++
++          Waves & Items:
++            Wave 1:
++          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
++
++          ----------------------------------------------------------------
++
++          Blocking Questions:
++            (none)
++          ----------------------------------------------------------------
++
++          Digest Questions:
++            (none)
++          ================================================================
++
++
++
++          test/config-worktree-layering.test.ts:
++
++          [factory preflight] Preflight failed with 1 error(s):
++            - Pipeline config loading failed: Invalid pipeline configuration:
++          /limits/maxIterations: must be integer ({"type":"integer"})
++
++
++          test/disk-space.test.ts:
++
++          52 |       probe,
++
++          53 |     });
++
++          54 | 
++
++          55 |     expect(res.ok).toBe(false);
++
++          56 |     expect(res.minFreeDiskMb).toBe(2048);
++
++          57 |     expect(res.failingPaths.length).toBe(1);
++                                                   ^
++          error: expect(received).toBe(expected)
++
++
++          Expected: 1
++
++          Received: 2
++
++                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery/plugins/software-factory/test/disk-space.test.ts:57:37)
++          (fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace
++          verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
++          [34.45ms]
++
++
++          test/cli/cli.test.ts:
++
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999
++          on host Slava-Yoga) taken over by PID 3677721
++
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID
++          9999999 on host Slava-Yoga) taken over by PID 3677721
++
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID
++          9999999 on host Slava-Yoga) taken over by PID 3677721
++
++           663 pass
++           2 skip
++           1 fail
++           3736 expect() calls
++          Ran 666 tests across 101 files. [268.45s]
++        failingTests:
++          - Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies
++            worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
++  - id: size
++    status: pass
++    message: "size passed: 0/300 production lines changed"
++    details:
++      changedLines:
++        added: 0
++        deleted: 0
++        total: 0
++        files: []
++      limit: 300
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..b336ce5
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/input.md
+@@ -0,0 +1,92 @@
++# Step: Develop
++
++## Goal
++Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
++
++## Rules
++- Target green: every test selector and case identified in `target` MUST pass cleanly.
++- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
++- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
++- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
++- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
++
++## Assignment
++{
++  "slug": "spike-findings-recovery",
++  "kind": "no-behavior",
++  "title": "Recover wave-1 spike findings onto parent branch",
++  "assignment": "Salvage approved wave-1 spike research stranded on environmentally-failed item branches onto the parent branch. All research steps + reviews are approved; only wave-end merges failed (missing node_modules). Docs only, zero prod lines.\n\nRead-only sources (NEVER checkout/switch branches, NEVER write to .factory/** engine-owned paths; use `git show <branch>:<path>` only):\n- topic/omp-workspaces--spike-omp-isolation :: items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml (+003 review)\n- topic/omp-workspaces--spike-mock-provider :: items/spike-mock-provider/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-cache-key :: items/spike-cache-key/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-repo-rules :: items/spike-repo-rules/steps/001-research-r1-a1/output.yaml (+002 review)\n- parent-branch decisions/001 + 002 rulings (read on parent branch).\n\nSteps:\n1. git-show each research output.yaml + its review output; extract the embedded spike-draft markdown.\n2. Apply each review's optional polish notes ONLY where they correct evidence (e.g. probe-26/18 softening, spec-path fix); do not invent new probes.\n3. Write the four drafts to: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md.\n4. Write items/spike-findings-recovery/RECOVERY.md mapping each M1 scenario (isolation probe matrix, mock-provider seam, cache-keying, repo-rules injection) to branch evidence + followUps for iteration-2 planning (M3/M4/M6/M7/M8).\n5. Verify on parent branch only: all five files exist, each spike doc retains probe-evidence/logs + recommendations sections, RECOVERY.md covers all four M1 scenarios.\n\nAcceptance: 4 spike docs + RECOVERY.md present with probe evidence; no prod code changed; no branch checkouts; no .factory/** writes.\n\nConstraints: no-behavior kind; no deps; wave-2 parallel (self-contained, self-heals node_modules via own develop-step gates).",
++  "outlineRef": "spike-findings-recovery",
++  "milestone": "m1-omp-de-risk",
++  "wave": 2,
++  "citations": [
++    "topic/omp-workspaces--spike-omp-isolation:items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml",
++    "topic/omp-workspaces--spike-mock-provider:items/spike-mock-provider/steps/001-research-r1-a1/output.yaml",
++    "topic/omp-workspaces--spike-cache-key:items/spike-cache-key/steps/001-research-r1-a1/output.yaml",
++    "topic/omp-workspaces--spike-repo-rules:items/spike-repo-rules/steps/001-research-r1-a1/output.yaml"
++  ]
++}
++
++## Target
++tests
++
++## Context & Citations
++[
++  "topic/omp-workspaces--spike-omp-isolation:items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml",
++  "topic/omp-workspaces--spike-mock-provider:items/spike-mock-provider/steps/001-research-r1-a1/output.yaml",
++  "topic/omp-workspaces--spike-cache-key:items/spike-cache-key/steps/001-research-r1-a1/output.yaml",
++  "topic/omp-workspaces--spike-repo-rules:items/spike-repo-rules/steps/001-research-r1-a1/output.yaml"
++]
++
++## Review Feedback
++
++
++## Open Concerns
++- id: c-552344216d
++  kind: blocker
++  severity: high
++  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
++  affects:
++    - "19.2"
++    - wave-merge
++- id: c-f972360209
++  kind: tech-debt
++  severity: medium
++  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
++  affects:
++    - redrive
++    - wave-merge
++
++
++- Review the concerns above before starting; they constrain this step but are not part of the assignment.
++- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
++- summary (string, required): Concise summary of implementation actions and test results
++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
++  - Option 1:
++    - selectors (array of string, required)
++    - expectRed (array of string, required, minItems: 1)
++  - Option 2:
++    - gate (string, required)
++  - Option 3:
++    - command (string, required)
++    - customTarget (boolean, required)
++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
++- concerns (array of object, optional): Structured concerns raised during implementation
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
++- notes (string, optional): Optional developer notes, implementation observations, or comments
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..d8c6979
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/meta.yaml
+@@ -0,0 +1,20 @@
++seq: 1
++name: develop
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-10T01:58:58.390Z
++session: 01a1c32e-1401-7277-bf9d-7bf38233f921
++endedAt: 2026-11-10T02:23:11.631Z
++usage:
++  inputTokens: 139228
++  outputTokens: 49219
++  costUsd: 0.071688
++repairedFrom: ask
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-329Z_01a1c32e-1401-7277-bf9d-7bf38233f921.jsonl
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..1e2c16b
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/output.yaml
+@@ -0,0 +1,82 @@
++status: ok
++summary: Recovered all four approved wave-1 spike drafts from their item
++  branches via read-only `git show` and published them as
++  `plugins/software-factory/docs/spikes/omp-3-isolation.md`,
++  `omp-4-mock-provider.md`, `omp-5-cache-keys.md`, and `omp-6-repo-rules.md`.
++  Applied only evidence-correcting review polish (probe-26/18 softening,
++  single-host retention scope, cache spec-path + compaction provenance +
++  artifact-completeness fixes, dead-fragment note, repo cwd invariant, justified
++  mock e2e split) and invented no probes. Wrote
++  `items/spike-findings-recovery/RECOVERY.md` mapping each M1 scenario to branch
++  evidence and M3/M4/M6/M7/M8 followUps, including the parent decision 001/002
++  rulings. No production source changed and no branch was checked out.
++  Self-healed missing `node_modules` with `bun install`; typecheck is green.
++  Full-suite tests show the known baseline-red disk-space test plus
++  environment-sensitive failures caused by two overlapping suite runs on this
++  shared host; isolated reruns of the affected engine files pass.
++target:
++  gate: test
++evidence:
++  - "Provenance: `git show
++    topic/omp-workspaces--spike-{omp-isolation,mock-provider,cache-key,repo-rul\
++    es}:<step>/output.yaml` confirmed research status `ok` and all four review
++    outputs `approved`."
++  - "Draft fidelity: ordered-line comparison against the embedded drafts shows
++    only the intended polish lines differ; isolation differs only on the
++    probe-26 and probe-18 corrections, mock only on the M8 e2e justification,
++    cache only on the four evidence corrections, repo retains all lines plus the
++    cwd recommendation."
++  - "Output verification: all five files exist — four spike docs
++    (123/133/308/128 lines) plus RECOVERY.md (90 lines); each spike doc contains
++    probe evidence/log and recommendations/M8 sections; RECOVERY.md names all
++    four M1 scenarios and M3/M4/M6/M7/M8 followUps (programmatic assertions
++    passed)."
++  - "Typecheck gate: `cd plugins/software-factory && bun install` (self-heal
++    gitignored node_modules) then `bun run typecheck` exited 0 (`tsc --noEmit`
++    clean)."
++  - "Test gate: full `bun test` executed 666 tests (652 pass / 2 skip / 12 fail
++    / 5 errors) while an earlier full-suite run was still active on the shared
++    host; targeted isolation rerun `bun test test/engine/head-guard.test.ts
++    test/engine/fix-round-reentry.test.ts` passed 3/3 with exit 0, confirming
++    the failures were concurrency-induced; the known baseline-red
++    `test/disk-space.test.ts` remains the only documented baseline failure."
++  - "Tree state: `git status --short` shows only the four new spike docs and
++    RECOVERY.md; `git diff --numstat` shows zero production source changes; no
++    branch checkout/switch was performed. The staged item `meta.yaml` session
++    field is engine-written and was not touched."
++remarkable:
++  - chosen: Published the full embedded draft for isolation and enriched it with the
++      approved findings' 27-probe command log, config surface, and follow-ups.
++    why: The M1 directional interface requires findings + probe logs +
++      recommendations, and the embedded compact draft had no dedicated
++      probe/recommendation sections; all added content comes from the same
++      approved research output, so no new probes were invented.
++    alternatives:
++      - Publish only the compact embedded full draft (fails the
++        probe-log/recommendations acceptance)
++      - Reconstruct the whole document from the pre-draft findings (duplicates
++        the approved draft)
++  - chosen: Retained `test/e2e/mock-provider` in the mock-provider doc while
++      documenting why it is justified over `test/harness/mock-provider`.
++    why: The M8 plan's directional interface explicitly names
++      `test/e2e/mock-provider/*`, and the split keeps the no-model scripted
++      suite separate from paid live coverage; the review allowed either the repo
++      idiom or a justification.
++    alternatives:
++      - Rename to `test/harness/mock-provider` (conflicts with the M8 plan
++        interface)
++      - Drop the proposal path entirely (loses actionable M8 guidance)
++  - chosen: Wrote RECOVERY.md at the assigned
++      `items/spike-findings-recovery/RECOVERY.md` item-local path.
++    why: Step 4 mandates that path (shorthand for the task's `items/` workspace); no
++      engine-owned record (`runs/`, `plan/`, `state.yaml`, `journal.ndjson`,
++      `decisions/`) was modified.
++    alternatives:
++      - Write a repo-root `items/` copy (not the assigned task-workspace path)
++      - Write under engine-owned `.factory` records (explicitly forbidden)
++notes: The full test suite was executed twice on a shared host with concurrent
++  factory sessions; overlapping runs produced transient engine-test failures
++  that pass in isolation. No test or source file was changed by this item, so
++  those failures cannot be attributed to this diff. `bun install` created only
++  gitignored `node_modules`, which also removes the merge-path typecheck blocker
++  (missing node_modules) for this worktree.
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..43b8675
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/checks.yaml
+@@ -0,0 +1,7 @@
++checks:
++  - id: test-diff
++    status: pass
++    message: test-diff generated (0 test files, 0 bytes)
++    details:
++      diff: ""
++      files: []
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/input.md
+new file mode 100644
+index 0000000..123c86a
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/input.md
+@@ -0,0 +1,1747 @@
++# Step: QA
++
++## Goal
++Perform independent quality assurance on the item's implementation and test suite. Guard against test weakening, false passes, and unverified claims.
++
++## Rules
++- SKEPTICAL VERIFICATION: do NOT trust developer summaries. Scrutinize engine check results (`red-test`, `test-diff`), actual diffs, and tool outputs.
++- Test weakening defense: scrutinize `testDiff`. Reject any test change that deletes assertions, relaxes matchers, replaces concrete checks with tautologies, or reduces test coverage.
++- Story kind validation:
++  - `dev` stories: verify `red-test` proved tests failed on baseline code and pass after implementation.
++  - `no-behavior` stories: confirm tests remain materially identical. Functional behavior must not change.
++- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
++
++## Dispositions Criteria
++Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async.
++Use ONLY these dispositions; any other disposition value fails validation.
++# Review Suggestion Dispositions
++
++Criteria for assigning disposition to review findings:
++
++| Disposition | When to Assign | Engine Action |
++|---|---|---|
++| `fix` | Concrete defect, failing gate, broken contract, missing test, or deviation from assignment. | Returns item to `fixLoopTo` step (bounded by `maxFixRounds`); developer must address. Non-item: triggers consult. |
++| `optional` | Non-blocking polish, code style improvement, minor refactor opportunity, or deferred debt. | Passed to developer if another fix round occurs; otherwise recorded as tech debt for future iterations. |
++| `architect` | Architectural contradiction, interface redesign, boundary breach, or uncertainty exceeding item scope. | Triggers immediate architect consult; architect's decision is binding and final. |
++| `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
++| `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |
++
++## Rules
++- Defect requiring code change MUST be `fix`.
++- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
++- Do NOT use `human-async` when repo context or architecture docs provide the answer.
++
++## Assignment
++{
++  "slug": "spike-findings-recovery",
++  "kind": "no-behavior",
++  "title": "Recover wave-1 spike findings onto parent branch",
++  "assignment": "Salvage approved wave-1 spike research stranded on environmentally-failed item branches onto the parent branch. All research steps + reviews are approved; only wave-end merges failed (missing node_modules). Docs only, zero prod lines.\n\nRead-only sources (NEVER checkout/switch branches, NEVER write to .factory/** engine-owned paths; use `git show <branch>:<path>` only):\n- topic/omp-workspaces--spike-omp-isolation :: items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml (+003 review)\n- topic/omp-workspaces--spike-mock-provider :: items/spike-mock-provider/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-cache-key :: items/spike-cache-key/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-repo-rules :: items/spike-repo-rules/steps/001-research-r1-a1/output.yaml (+002 review)\n- parent-branch decisions/001 + 002 rulings (read on parent branch).\n\nSteps:\n1. git-show each research output.yaml + its review output; extract the embedded spike-draft markdown.\n2. Apply each review's optional polish notes ONLY where they correct evidence (e.g. probe-26/18 softening, spec-path fix); do not invent new probes.\n3. Write the four drafts to: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md.\n4. Write items/spike-findings-recovery/RECOVERY.md mapping each M1 scenario (isolation probe matrix, mock-provider seam, cache-keying, repo-rules injection) to branch evidence + followUps for iteration-2 planning (M3/M4/M6/M7/M8).\n5. Verify on parent branch only: all five files exist, each spike doc retains probe-evidence/logs + recommendations sections, RECOVERY.md covers all four M1 scenarios.\n\nAcceptance: 4 spike docs + RECOVERY.md present with probe evidence; no prod code changed; no branch checkouts; no .factory/** writes.\n\nConstraints: no-behavior kind; no deps; wave-2 parallel (self-contained, self-heals node_modules via own develop-step gates).",
++  "outlineRef": "spike-findings-recovery",
++  "milestone": "m1-omp-de-risk",
++  "wave": 2,
++  "citations": [
++    "topic/omp-workspaces--spike-omp-isolation:items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml",
++    "topic/omp-workspaces--spike-mock-provider:items/spike-mock-provider/steps/001-research-r1-a1/output.yaml",
++    "topic/omp-workspaces--spike-cache-key:items/spike-cache-key/steps/001-research-r1-a1/output.yaml",
++    "topic/omp-workspaces--spike-repo-rules:items/spike-repo-rules/steps/001-research-r1-a1/output.yaml"
++  ]
++}
++
++## Engine Checks
++
++
++## Test Diff
++
++
++## Code Diff
++diff --git a/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml b/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml
++deleted file mode 100644
++index 8a3bcf8..0000000
++--- a/.factory/tasks/omp-workspaces/concerns/c-0647070832.yaml
+++++ /dev/null
++@@ -1,23 +0,0 @@
++-id: c-0647070832
++-kind: tech-debt
++-summary: Child/merge worktrees still need infra.setup (bun install) before the
++-  bun test runner can collect tests; this worktree had no node_modules until
++-  installed manually
++-detail: Running `bun test` in a fresh worktree failed with `Cannot find package
++-  'yaml'` from test/records-and-fingerprint.test.ts and src/core/prompts.ts
++-  until `bun install` was run. This is the pre-existing open concern
++-  c-552344216d (missing infra.setup in merge-child worktrees), not introduced by
++-  this step; node_modules is gitignored and not part of the change.
++-affects:
++-  - target-red
++-  - wave-merge
++-severity: high
++-status: open
++-source:
++-  record: 001-test-first-r1-a1
++-  agent: developer
++-  step: test-first
++-  item: usage-cache-tokens
++-  lastSeen: 2026-11-10T02:05:24.168Z
++-createdAt: 2026-11-10T02:05:24.168Z
++-updatedAt: 2026-11-10T02:05:24.168Z
++diff --git a/.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml b/.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml
++deleted file mode 100644
++index fdfe75a..0000000
++--- a/.factory/tasks/omp-workspaces/concerns/c-f415508eb1.yaml
+++++ /dev/null
++@@ -1,24 +0,0 @@
++-id: c-f415508eb1
++-kind: risk
++-summary: Gate runs that inherit the factory-runtime TMPDIR produce unrelated
++-  test failures
++-detail: "When TMPDIR points under .factory-runtime/tmp, disk-space.test.ts
++-  counts the tmpdir itself as a second low-space path (fails: expected 1 failing
++-  path, got 2) and several engine tests fail with git 'could not create
++-  temporary file' or 5s timeouts under contention. With TMPDIR=/tmp the same
++-  full suite is fully green (669 pass / 2 skip / 0 fail). This is
++-  pre-existing/environmental and not caused by this test-only diff, but it
++-  affects gate greenness for any item run in this environment."
++-affects:
++-  - gates
++-  - wave-merge
++-severity: medium
++-status: open
++-source:
++-  record: 001-develop-r1-a1
++-  agent: developer
++-  step: develop
++-  item: transport-byte-stability
++-  lastSeen: 2026-11-10T02:28:29.083Z
++-createdAt: 2026-11-10T02:28:29.083Z
++-updatedAt: 2026-11-10T02:28:29.083Z
++diff --git a/.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml b/.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml
++deleted file mode 100644
++index 9f8e15f..0000000
++--- a/.factory/tasks/omp-workspaces/concerns/rm-4e7a8c758b.yaml
+++++ /dev/null
++@@ -1,21 +0,0 @@
++-id: rm-4e7a8c758b
++-chosen: Published the full embedded draft for isolation and enriched it with the
++-  approved findings' 27-probe command log, config surface, and follow-ups.
++-alternatives:
++-  - Publish only the compact embedded full draft (fails the
++-    probe-log/recommendations acceptance)
++-  - Reconstruct the whole document from the pre-draft findings (duplicates the
++-    approved draft)
++-why: The M1 directional interface requires findings + probe logs +
++-  recommendations, and the embedded compact draft had no dedicated
++-  probe/recommendation sections; all added content comes from the same approved
++-  research output, so no new probes were invented.
++-status: open
++-source:
++-  record: 001-develop-r1-a1
++-  agent: developer
++-  step: develop
++-  item: spike-findings-recovery
++-  lastSeen: 2026-11-10T02:23:11.570Z
++-createdAt: 2026-11-10T02:23:11.570Z
++-updatedAt: 2026-11-10T02:23:11.570Z
++diff --git a/.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml b/.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml
++deleted file mode 100644
++index 3cdbede..0000000
++--- a/.factory/tasks/omp-workspaces/concerns/rm-63a8ee819c.yaml
+++++ /dev/null
++@@ -1,18 +0,0 @@
++-id: rm-63a8ee819c
++-chosen: Wrote RECOVERY.md at the assigned
++-  `items/spike-findings-recovery/RECOVERY.md` item-local path.
++-alternatives:
++-  - Write a repo-root `items/` copy (not the assigned task-workspace path)
++-  - Write under engine-owned `.factory` records (explicitly forbidden)
++-why: Step 4 mandates that path (shorthand for the task's `items/` workspace); no
++-  engine-owned record (`runs/`, `plan/`, `state.yaml`, `journal.ndjson`,
++-  `decisions/`) was modified.
++-status: open
++-source:
++-  record: 001-develop-r1-a1
++-  agent: developer
++-  step: develop
++-  item: spike-findings-recovery
++-  lastSeen: 2026-11-10T02:23:11.570Z
++-createdAt: 2026-11-10T02:23:11.570Z
++-updatedAt: 2026-11-10T02:23:11.570Z
++diff --git a/.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml b/.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml
++deleted file mode 100644
++index 8bab5e4..0000000
++--- a/.factory/tasks/omp-workspaces/concerns/rm-8363899156.yaml
+++++ /dev/null
++@@ -1,20 +0,0 @@
++-id: rm-8363899156
++-chosen: Pin the prompt filename instability with explicit shape and difference
++-  assertions plus comments, instead of stabilizing transport.
++-alternatives:
++-  - "Stabilize prompt paths in production code: out of scope for this test-only
++-    item."
++-  - "Only compare normalized argv: would hide the unstable element instead of
++-    pinning it."
++-why: Assignment defers stabilization to M7 after spike-cache-key; a
++-  failing-explicit assertion documents the currently unstable behavior and will
++-  point at the decision when transport is stabilized.
++-status: open
++-source:
++-  record: 001-develop-r1-a1
++-  agent: developer
++-  step: develop
++-  item: transport-byte-stability
++-  lastSeen: 2026-11-10T02:28:29.083Z
++-createdAt: 2026-11-10T02:28:29.083Z
++-updatedAt: 2026-11-10T02:28:29.083Z
++diff --git a/.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml b/.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml
++deleted file mode 100644
++index 22471e5..0000000
++--- a/.factory/tasks/omp-workspaces/concerns/rm-9efb47e04e.yaml
+++++ /dev/null
++@@ -1,18 +0,0 @@
++-id: rm-9efb47e04e
++-chosen: Specify zero-default aggregation and optional schema properties, with no
++-  migration of historical records.
++-alternatives:
++-  - Migration/backfill of old records (explicitly out of scope).
++-  - Required schema fields (would invalidate historical records).
++-why: "Matches the assignment contract: absent cache keys in old meta.yaml/NDJSON
++-  must read as 0 and remain schema-valid, while new records persist
++-  cacheReadTokens/cacheWriteTokens/totalTokens and a cost breakdown."
++-status: open
++-source:
++-  record: 001-test-first-r1-a1
++-  agent: developer
++-  step: test-first
++-  item: usage-cache-tokens
++-  lastSeen: 2026-11-10T02:05:24.168Z
++-createdAt: 2026-11-10T02:05:24.168Z
++-updatedAt: 2026-11-10T02:05:24.168Z
++diff --git a/.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml b/.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml
++deleted file mode 100644
++index 273f553..0000000
++--- a/.factory/tasks/omp-workspaces/concerns/rm-ccac403fa7.yaml
+++++ /dev/null
++@@ -1,25 +0,0 @@
++-id: rm-ccac403fa7
++-chosen: Characterize transport via a mock omp binary that snapshots argv plus
++-  the --system-prompt/-p/--config files, and guard only the real-binary overlay
++-  acceptance check with omp-presence skip.
++-alternatives:
++-  - "Run harness turns against real omp with live models: paid and flaky,
++-    violates no-paid-turns constraint."
++-  - "Mock the bun spawn module in-process: fragile, bypasses the real argv
++-    assembly path."
++-  - "Test only pure generateOmpConfigOverlay/render functions: cannot pin the
++-    timestamped prompt filename or full argv instability."
++-why: This captures the exact bytes and argv the harness would hand to omp
++-  without contacting a provider (no paid turns) and without requiring omp on a
++-  clean checkout, while still validating the generated overlay with the real
++-  binary when it is installed using the same non-paid `--config <overlay>
++-  --version` preflight performs.
++-status: open
++-source:
++-  record: 001-develop-r1-a1
++-  agent: developer
++-  step: develop
++-  item: transport-byte-stability
++-  lastSeen: 2026-11-10T02:28:29.083Z
++-createdAt: 2026-11-10T02:28:29.083Z
++-updatedAt: 2026-11-10T02:28:29.083Z
++diff --git a/.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml b/.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml
++deleted file mode 100644
++index 71f4351..0000000
++--- a/.factory/tasks/omp-workspaces/concerns/rm-d3a28fa170.yaml
+++++ /dev/null
++@@ -1,21 +0,0 @@
++-id: rm-d3a28fa170
++-chosen: Deliver a test-only diff and defer the merge-path.ts implementation to
++-  the follow-up develop step.
++-alternatives:
++-  - Implement mergeItem setup execution in this step as the story assignment
++-    text lists — rejected because target-red would see green and
++-    test-first-scope rejects modified src/** files.
++-  - Introduce a prod interface stub — unnecessary because the tests exercise the
++-    existing mergeItem export.
++-why: The story.dev flow runs test-first-scope (rejects any modified prod file)
++-  and target-red (declared tests must currently fail) in this step; shipping the
++-  implementation here would fail both mechanical checks.
++-status: open
++-source:
++-  record: 001-test-first-r1-a1
++-  agent: developer
++-  step: test-first
++-  item: merge-setup-fix
++-  lastSeen: 2026-11-10T02:12:17.201Z
++-createdAt: 2026-11-10T02:12:17.201Z
++-updatedAt: 2026-11-10T02:12:17.201Z
++diff --git a/.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml b/.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml
++deleted file mode 100644
++index c8c12a6..0000000
++--- a/.factory/tasks/omp-workspaces/concerns/rm-d63aed4fdb.yaml
+++++ /dev/null
++@@ -1,20 +0,0 @@
++-id: rm-d63aed4fdb
++-chosen: Declare expectRed ids as bare Bun test names rather than file-qualified
++-  `file::test` node ids.
++-alternatives:
++-  - File-qualified `test/...::test` ids (would not match Bun's describe-based
++-    JUnit ids unless the describe name is also embedded).
++-  - Full `<describe>.<test>` ids (brittle to describe renames).
++-why: "Bun's JUnit reporter emits ids as `<innermost describe>.<test name>` with
++-  no file path in the id; the engine's normalizer matches a bare id by suffix
++-  (`id.endsWith('.' + expectId)`). Verified against parseJunit output: all 11
++-  ids match exactly one failing case."
++-status: open
++-source:
++-  record: 001-test-first-r1-a1
++-  agent: developer
++-  step: test-first
++-  item: usage-cache-tokens
++-  lastSeen: 2026-11-10T02:05:24.168Z
++-createdAt: 2026-11-10T02:05:24.168Z
++-updatedAt: 2026-11-10T02:05:24.168Z
++diff --git a/.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml b/.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml
++deleted file mode 100644
++index 681e394..0000000
++--- a/.factory/tasks/omp-workspaces/concerns/rm-eaf2656f2a.yaml
+++++ /dev/null
++@@ -1,19 +0,0 @@
++-id: rm-eaf2656f2a
++-chosen: Retained `test/e2e/mock-provider` in the mock-provider doc while
++-  documenting why it is justified over `test/harness/mock-provider`.
++-alternatives:
++-  - Rename to `test/harness/mock-provider` (conflicts with the M8 plan interface)
++-  - Drop the proposal path entirely (loses actionable M8 guidance)
++-why: The M8 plan's directional interface explicitly names
++-  `test/e2e/mock-provider/*`, and the split keeps the no-model scripted suite
++-  separate from paid live coverage; the review allowed either the repo idiom or
++-  a justification.
++-status: open
++-source:
++-  record: 001-develop-r1-a1
++-  agent: developer
++-  step: develop
++-  item: spike-findings-recovery
++-  lastSeen: 2026-11-10T02:23:11.570Z
++-createdAt: 2026-11-10T02:23:11.570Z
++-updatedAt: 2026-11-10T02:23:11.570Z
++diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md
++new file mode 100644
++index 0000000..cfaee73
++--- /dev/null
+++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/RECOVERY.md
++@@ -0,0 +1,90 @@
+++# Wave-1 spike findings recovery
+++
+++Status: recovered. Docs-only salvage of approved wave-1 research onto the parent branch.
+++
+++## Why this exists
+++
+++All four wave-1 spike items completed research (`status: ok`) and review (`status: approved`), but their wave-end merges failed environmentally: the merge-path gates ran without `infra.setup` in the child worktree, so the missing `node_modules` failed typecheck. No research finding was rejected. This item re-materializes the approved drafts as product docs and records the evidence mapping needed by iteration-2 planning. No production code changed; the source item branches were read via `git show` only (no checkout/switch).
+++
+++## Source provenance (read-only)
+++
+++| M1 scenario | Source branch | Research record | Review record | Review outcome |
+++|---|---|---|---|---|
+++| 1. Isolation probe matrix | `topic/omp-workspaces--spike-omp-isolation` (`cd07f2d`) | `items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml` (`ok`) | `steps/003-review-r1-a1/output.yaml` | `approved`; probe-26/18 interpretation softened |
+++| 2. Mock-provider seam | `topic/omp-workspaces--spike-mock-provider` (`85c4b46`) | `items/spike-mock-provider/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; e2e split justified |
+++| 3. Cache keying | `topic/omp-workspaces--spike-cache-key` (`c28f43b`) | `items/spike-cache-key/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; spec-path/provenance fixes applied |
+++| 4. Repo-rules injection | `topic/omp-workspaces--spike-repo-rules` (`9755c7e`) | `items/spike-repo-rules/steps/001-research-r1-a1/output.yaml` (`ok`) | `steps/002-review-r1-a1/output.yaml` | `approved`; cwd-scope invariant documented |
+++
+++Parent-branch decisions consumed:
+++
+++- `decisions/001-item-spike-repo-rules-1.yaml` — `accept-with-debt`; rulings: M4 replaces the preflight no-op with a real mock-provider turn; M8 builds the scripted mock helper with per-role request-body assertions; M8 keeps omp as sole root injector, implements RULES/extra for scouts, and asserts one sentinel per role; M8 chooses the prompt-isolation policy (profile/agent-dir and/or `disabledExtensions` + empty `--append-system-prompt=`).
+++- `decisions/002-item-spike-omp-isolation-1.yaml` — `accept-with-debt`; rulings: M4 replaces `preflight.ts:364-394` with key/enum/catalog validation plus one real isolated round-trip turn; M3 implements the ratified root mapping (`omp worktree add -b <topic-branch> <path> <base> -C <repo>` then `omp --cwd <path> -p`) with `isolation: engine` as the fallback and unchanged engine merge ownership.
+++
+++## Recovered docs
+++
+++| Doc | M1 scenario | Evidence preserved |
+++|---|---|---|
+++| `plugins/software-factory/docs/spikes/omp-3-isolation.md` | 1 | 27-probe command log + excerpts, backend enum, retention matrix, root mapping, `task.isolation` vs engine merge, preflight recipe, draft config surface, recommendations |
+++| `plugins/software-factory/docs/spikes/omp-4-mock-provider.md` | 2 | 17-probe log, extension/SSE seam, scenario `{turns}` contract, NDJSON/usage contract, `OmpHarness` wrapper, decision YAML + followUps, sources |
+++| `plugins/software-factory/docs/spikes/omp-5-cache-keys.md` | 3 | Transport byte/argv audit, live resume probe log (DeepSeek/Anthropic), TTL/model/content invalidation, cold-resume signals, knob audit, compaction/warming analysis, recommendations, appendix |
+++| `plugins/software-factory/docs/spikes/omp-6-repo-rules.md` | 4 | Source inventory, precedence/composition, flag matrix, probe matrix, per-role seams, M8 verification plan, recommendations |
+++
+++## M1 scenario → evidence mapping
+++
+++### 1. Isolation probe matrix (M1 scenario-1)
+++
+++Evidence: `isolation.backend` has exactly 9 accepted values (`auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy`); every value degrades to plain checkout with a FICLONE warning on ext4/WSL2. Retention: `worktree add` + `--cwd` keeps commits/partials/registration on success, failure, and SIGKILL; isolated subagents retain a patch or `omp/task/<Agent>` branch on success **and** failure; parent abort loses all. `worktree.onStart` is a no-op for `-p`. omp `apply:true` produces a single-parent commit with no gates/conflict agent, so engine `merge-path.ts` remains merge owner and subagents use `apply:false`. Preflight must include one real turn (probes 17/18/27: bogus keys, invalid backend overlays, and missing overlays are all accepted by static checks).
+++
+++FollowUps:
+++- **M3**: implement `workspaces.isolation: omp|engine`, the omp backend/worktree/`task.isolation` config surface, `omp worktree add` + `--cwd` root mapping, and keep topic branch naming + engine merge ownership.
+++- **M4**: replace `preflight.ts:364-394` with key/enum/catalog validation plus one real isolated round-trip turn; derive status/gc from `git worktree list` + records; classify turn outcome from the `--mode json` transcript, not process rc.
+++- **M6**: add cross-launch merge/lock coordination for parallel-epic launches.
+++
+++### 2. Mock-provider seam (M1 scenario-2)
+++
+++Evidence: an omp extension loaded with `-e/--extension` calls `pi.registerProvider('mock', {...openai-completions...})` against a local SSE server; `omp models -e ... --json` lists `mock/mock-chat`. Proven end-to-end on real omp 18.18.5 with zero paid calls: text turn, yield envelope, read→yield tool loop, parallel tool calls, session resume, `@role` resolution, parallel processes, and `OmpHarness.run`/`complete` through a wrapper. Scenario format is `{turns: [{text}|{toolCalls}|{yield}]}` with optional `usage`/`finishReason` and top-level `match`/`onExhausted`; error turns are not probed.
+++
+++FollowUps:
+++- **M8**: add `extraArgs`/`mockProvider` to `OmpHarness`; implement `test/e2e/mock-provider/{extension,server,scenario,runner}.ts`, gate with `FACTORY_E2E_OMP=1`, keep paid `FACTORY_LIVE_OMP=1` separate, assert only `mock/mock-chat` requests and `usage.costUsd === 0`.
+++- **M4**: use the seam for the preflight real-turn validation.
+++
+++### 3. Cache keying (M1 scenario-3)
+++
+++Evidence: omp 18.18.5 keys the prompt cache by request-prefix **content**, not by file path. Identical bytes at a changed system-prompt path still fully hit; a model switch is a full cold read (measured ≈8.9× warm). TTL expiry (Anthropic 5m) causes a cold read; long retention was verified separately. Compaction rewrites history and makes the next resume cold from the cut point. The factory currently detects none of these signals and pins none of the cache/compaction/memory knobs; the manual `-p "/compact"` path exists but its cost is absent from NDJSON.
+++
+++FollowUps:
+++- **M7**: extend usage accounting with `cacheReadTokens`/`cacheWriteTokens`/`totalTokens`/`cacheTtl`/provider/model/reasoning fields; add a per-session cache-state record; record the resolved model used by the successful turn and pass that literal model on resume; pin `providers.cache*`, `compaction.*`, `snapcompact.*`, and `mnemopi.autoRecall/autoRetain` in the overlay; measure long-vs-short retention and fresh-brief-vs-warm-compaction on the self-host fire test; add a mock-provider cache fixture.
+++- **M4**: validate effective overlay values (not `--version`) and read back performance-relevant settings in preflight.
+++
+++### 4. Repo-rules injection (M1 scenario-4)
+++
+++Evidence: root omp sessions discover and inject repo context/rules into a trailing `<repo-rules>` footer; `--system-prompt` replaces block 0 only. The current factory has no double injection because role prompts contain no repo-rule text. Copying rules into role prompts or append prompts double-injects (2 sentinel copies). omp `task` subagents drop `AGENTS.md` but keep `RULES.md` and `contextFiles.extra`. User-level `APPEND_SYSTEM.md`, `AGENTS.md`, and `RULES.md` leak into roles unless isolated or suppressed; only an explicit empty `--append-system-prompt=` suppresses the append file. Resume re-discovers repo rules each process, while the static block-0 prefix stays stable.
+++
+++FollowUps:
+++- **M4**: replace the preflight `--config --version` no-op using the mock-provider real-turn recipe.
+++- **M8**: keep omp as sole injector for root roles; implement `RULES.md`/`contextFiles.extra` (or delegation context) for scouts; add sentinel-based per-role request-body tests; choose and enforce the user-level contamination policy; keep factory launches at worktree roots because `.omp/rules` and `.claude/CLAUDE.md` are cwd-only.
+++
+++## Iteration-2 follow-up index
+++
+++| Milestone | Follow-up | Source |
+++|---|---|---|
+++| M3 | omp workspace backend + `isolation: engine` fallback + config surface + unchanged branch/merge ownership | `omp-3-isolation.md` §7/§9/§10; decision 002 |
+++| M4 | preflight version/key/enum/catalog checks + one real isolated round trip; status/gc from git records; transcript-based outcome | `omp-3-isolation.md` §5/§10, `omp-5-cache-keys.md` §9.5, `omp-6-repo-rules.md` §6; decisions 001/002 |
+++| M6 | cross-launch merge/lock coordination for parallel epics; per-epic workspace isolation | `omp-3-isolation.md` §10 |
+++| M7 | cache/compaction usage plumbing, session cache-state, literal model on resume, overlay pins, retention measurement, mock cache fixture | `omp-5-cache-keys.md` §9/§10/§11 |
+++| M8 | scripted mock-provider helper + `extraArgs`; repo-rules hydration/sentinel tests; user-level isolation policy; no-model e2e and use-case docs | `omp-4-mock-provider.md` §M8/decision, `omp-6-repo-rules.md` §6/§7 |
+++
+++## Review polish ledger
+++
+++Applied only where the note corrected evidence (no new probes invented):
+++
+++- **Isolation** — probe 26 corrected: in-base explicit-path worktrees are listed by `worktree list --json` when `OMP_WORKTREE_DIR` is aligned; outside-base trees are invisible; live trees are never reported as orphans. Probe 18 softened: invalid backend overlay is accepted, but `config get` ignores `--config` overlays, so runtime coercion is unproven. Retention matrix scoped to single-host omp 18.18.5/ext4/WSL2.
+++- **Cache** — spec source fixed to `docs/factory.v2.md:114-120`; `tokensAfter`/`method` attributed to the transcript `compaction` entry rather than the NDJSON result; long/none retention probes qualified as YAML-only artifacts; dead `steps/architect-resume` fragment noted while keeping the byte-diff evidence valid.
+++- **Repo rules** — worktree-root cwd invariant documented because `.omp/rules` and `.claude/CLAUDE.md` are cwd-only.
+++- **Mock provider** — the `test/e2e/` split is retained and justified: it separates the no-model scripted suite from paid live coverage and matches the M8 plan's directional interface. The optional raw-NDJSON-excerpt and unprobed-error-turn notes remain disclosed limitations, not re-probed here.
+++
+++## Verification
+++
+++- All five recovery outputs exist and each spike doc contains a findings section plus probe evidence/log and recommendations/M8 sections (see the recovered-docs table).
+++- Source records were read with `git show <branch>:<path>`; no branch was checked out.
+++- No production code changed. No engine-owned record (`runs/`, `plan/`, `state.yaml`, `journal.ndjson`, `decisions/`) was modified; the only orchestration-folder write is this item's assigned deliverable `items/spike-findings-recovery/RECOVERY.md`.
++diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/checks.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..3f4821c
++--- /dev/null
+++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/checks.yaml
++@@ -0,0 +1,116 @@
+++checks:
+++  - id: gates
+++    status: pass
+++    message: Gates passed (2 gates)
+++    details:
+++      - id: typecheck
+++        command: bun --cwd=plugins/software-factory run typecheck
+++        status: pass
+++        durationMs: 7518
+++        details: $ tsc --noEmit
+++      - id: test
+++        command: bun --cwd=plugins/software-factory test
+++        status: pass
+++        durationMs: 520862
+++        details: >-
+++          bun test v1.4.4 (38afee6c8)
+++
+++          Disk space check passed (threshold 2048 MB):
+++            worktreeRoot (/tmp/factory-test-repo-OFsFtD.factory-wt): 4473 MB free
+++            .factory-runtime/tmp (/tmp/factory-test-repo-OFsFtD.factory-wt/.factory-runtime/tmp): 4473 MB free
+++            repoRoot (/tmp/factory-test-repo-OFsFtD): 4473 MB free
+++            tmpdir (/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp): 79632 MB free
+++            /tmp (/tmp): 4473 MB free
+++          ================================================================
+++
+++          Task: status-test-task [ACTIVE]
+++
+++          Kind: unclassified | Iteration: 1 | Wave: 1
+++
+++          Worktree: (none - main checkout)
+++
+++          Config path: /tmp/factory-test-repo-z4yvBN/.factory/pipeline.yaml
+++
+++          Budget spent: $0.0000
+++
+++          ----------------------------------------------------------------
+++
+++          Waves & Items:
+++            Wave 1:
+++          Concerns: open 0 | dismissed 0 | routed 0 | resolved 0
+++
+++          ----------------------------------------------------------------
+++
+++          Blocking Questions:
+++            (none)
+++          ----------------------------------------------------------------
+++
+++          Digest Questions:
+++            (none)
+++          ================================================================
+++
+++
+++
+++          test/config-worktree-layering.test.ts:
+++
+++          [factory preflight] Preflight failed with 1 error(s):
+++            - Pipeline config loading failed: Invalid pipeline configuration:
+++          /limits/maxIterations: must be integer ({"type":"integer"})
+++
+++
+++          test/disk-space.test.ts:
+++
+++          52 |       probe,
+++
+++          53 |     });
+++
+++          54 | 
+++
+++          55 |     expect(res.ok).toBe(false);
+++
+++          56 |     expect(res.minFreeDiskMb).toBe(2048);
+++
+++          57 |     expect(res.failingPaths.length).toBe(1);
+++                                                   ^
+++          error: expect(received).toBe(expected)
+++
+++
+++          Expected: 1
+++
+++          Received: 2
+++
+++                at <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery/plugins/software-factory/test/disk-space.test.ts:57:37)
+++          (fail) Disk-space guards (§limits.minFreeDiskMb) > checkDiskSpace
+++          verifies worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
+++          [34.45ms]
+++
+++
+++          test/cli/cli.test.ts:
+++
+++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999
+++          on host Slava-Yoga) taken over by PID 3677721
+++
+++          [factory lock] Stale run lock for task "competing-takeover-task" (PID
+++          9999999 on host Slava-Yoga) taken over by PID 3677721
+++
+++          [factory lock] Stale run lock for task "journal-worktree-task" (PID
+++          9999999 on host Slava-Yoga) taken over by PID 3677721
+++
+++           663 pass
+++           2 skip
+++           1 fail
+++           3736 expect() calls
+++          Ran 666 tests across 101 files. [268.45s]
+++        failingTests:
+++          - Disk-space guards (§limits.minFreeDiskMb).checkDiskSpace verifies
+++            worktreeRoot, .factory-runtime/tmp, repoRoot, and tmpdir
+++  - id: size
+++    status: pass
+++    message: "size passed: 0/300 production lines changed"
+++    details:
+++      changedLines:
+++        added: 0
+++        deleted: 0
+++        total: 0
+++        files: []
+++      limit: 300
++diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/input.md b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/input.md
++new file mode 100644
++index 0000000..b336ce5
++--- /dev/null
+++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/input.md
++@@ -0,0 +1,92 @@
+++# Step: Develop
+++
+++## Goal
+++Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
+++
+++## Rules
+++- Target green: every test selector and case identified in `target` MUST pass cleanly.
+++- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
+++- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
+++- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
+++- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
+++
+++## Assignment
+++{
+++  "slug": "spike-findings-recovery",
+++  "kind": "no-behavior",
+++  "title": "Recover wave-1 spike findings onto parent branch",
+++  "assignment": "Salvage approved wave-1 spike research stranded on environmentally-failed item branches onto the parent branch. All research steps + reviews are approved; only wave-end merges failed (missing node_modules). Docs only, zero prod lines.\n\nRead-only sources (NEVER checkout/switch branches, NEVER write to .factory/** engine-owned paths; use `git show <branch>:<path>` only):\n- topic/omp-workspaces--spike-omp-isolation :: items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml (+003 review)\n- topic/omp-workspaces--spike-mock-provider :: items/spike-mock-provider/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-cache-key :: items/spike-cache-key/steps/001-research-r1-a1/output.yaml (+002 review)\n- topic/omp-workspaces--spike-repo-rules :: items/spike-repo-rules/steps/001-research-r1-a1/output.yaml (+002 review)\n- parent-branch decisions/001 + 002 rulings (read on parent branch).\n\nSteps:\n1. git-show each research output.yaml + its review output; extract the embedded spike-draft markdown.\n2. Apply each review's optional polish notes ONLY where they correct evidence (e.g. probe-26/18 softening, spec-path fix); do not invent new probes.\n3. Write the four drafts to: plugins/software-factory/docs/spikes/omp-3-isolation.md, omp-4-mock-provider.md, omp-5-cache-keys.md, omp-6-repo-rules.md.\n4. Write items/spike-findings-recovery/RECOVERY.md mapping each M1 scenario (isolation probe matrix, mock-provider seam, cache-keying, repo-rules injection) to branch evidence + followUps for iteration-2 planning (M3/M4/M6/M7/M8).\n5. Verify on parent branch only: all five files exist, each spike doc retains probe-evidence/logs + recommendations sections, RECOVERY.md covers all four M1 scenarios.\n\nAcceptance: 4 spike docs + RECOVERY.md present with probe evidence; no prod code changed; no branch checkouts; no .factory/** writes.\n\nConstraints: no-behavior kind; no deps; wave-2 parallel (self-contained, self-heals node_modules via own develop-step gates).",
+++  "outlineRef": "spike-findings-recovery",
+++  "milestone": "m1-omp-de-risk",
+++  "wave": 2,
+++  "citations": [
+++    "topic/omp-workspaces--spike-omp-isolation:items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml",
+++    "topic/omp-workspaces--spike-mock-provider:items/spike-mock-provider/steps/001-research-r1-a1/output.yaml",
+++    "topic/omp-workspaces--spike-cache-key:items/spike-cache-key/steps/001-research-r1-a1/output.yaml",
+++    "topic/omp-workspaces--spike-repo-rules:items/spike-repo-rules/steps/001-research-r1-a1/output.yaml"
+++  ]
+++}
+++
+++## Target
+++tests
+++
+++## Context & Citations
+++[
+++  "topic/omp-workspaces--spike-omp-isolation:items/spike-omp-isolation/steps/002-research-r1-a2/output.yaml",
+++  "topic/omp-workspaces--spike-mock-provider:items/spike-mock-provider/steps/001-research-r1-a1/output.yaml",
+++  "topic/omp-workspaces--spike-cache-key:items/spike-cache-key/steps/001-research-r1-a1/output.yaml",
+++  "topic/omp-workspaces--spike-repo-rules:items/spike-repo-rules/steps/001-research-r1-a1/output.yaml"
+++]
+++
+++## Review Feedback
+++
+++
+++## Open Concerns
+++- id: c-552344216d
+++  kind: blocker
+++  severity: high
+++  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
+++  affects:
+++    - "19.2"
+++    - wave-merge
+++- id: c-f972360209
+++  kind: tech-debt
+++  severity: medium
+++  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
+++  affects:
+++    - redrive
+++    - wave-merge
+++
+++
+++- Review the concerns above before starting; they constrain this step but are not part of the assignment.
+++- Raise concerns with evidence when you find cross-cutting issues; do not triage pre-existing concerns.
+++
+++## Output
+++
+++Yield a structured JSON object matching this schema:
+++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+++- summary (string, required): Concise summary of implementation actions and test results
+++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+++  - Option 1:
+++    - selectors (array of string, required)
+++    - expectRed (array of string, required, minItems: 1)
+++  - Option 2:
+++    - gate (string, required)
+++  - Option 3:
+++    - command (string, required)
+++    - customTarget (boolean, required)
+++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+++- concerns (array of object, optional): Structured concerns raised during implementation
+++  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
+++  - summary (string, required)
+++  - detail (string, optional)
+++  - severity (string, optional, enum: ["low","medium","high"])
+++  - location (object, optional)
+++    - file (string, required)
+++    - line (integer, optional)
+++  - affects (array of string, optional)
+++- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
+++  - chosen (string, required)
+++  - why (string, required)
+++  - alternatives (array of string, required)
+++- notes (string, optional): Optional developer notes, implementation observations, or comments
++diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..d8c6979
++--- /dev/null
+++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/meta.yaml
++@@ -0,0 +1,20 @@
+++seq: 1
+++name: develop
+++attempt: 1
+++fixRound: 1
+++agent: developer
+++role: workhorse
+++models:
+++  - opencode-go/deepseek-v4.1-flash
+++  - opencode-go/muse-spark-1.3-contributor
+++timeoutSec: 5400
+++status: ok
+++startedAt: 2026-11-10T01:58:58.390Z
+++session: 01a1c32e-1401-7277-bf9d-7bf38233f921
+++endedAt: 2026-11-10T02:23:11.631Z
+++usage:
+++  inputTokens: 139228
+++  outputTokens: 49219
+++  costUsd: 0.071688
+++repairedFrom: ask
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-329Z_01a1c32e-1401-7277-bf9d-7bf38233f921.jsonl
++diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/output.yaml
++new file mode 100644
++index 0000000..1e2c16b
++--- /dev/null
+++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/output.yaml
++@@ -0,0 +1,82 @@
+++status: ok
+++summary: Recovered all four approved wave-1 spike drafts from their item
+++  branches via read-only `git show` and published them as
+++  `plugins/software-factory/docs/spikes/omp-3-isolation.md`,
+++  `omp-4-mock-provider.md`, `omp-5-cache-keys.md`, and `omp-6-repo-rules.md`.
+++  Applied only evidence-correcting review polish (probe-26/18 softening,
+++  single-host retention scope, cache spec-path + compaction provenance +
+++  artifact-completeness fixes, dead-fragment note, repo cwd invariant, justified
+++  mock e2e split) and invented no probes. Wrote
+++  `items/spike-findings-recovery/RECOVERY.md` mapping each M1 scenario to branch
+++  evidence and M3/M4/M6/M7/M8 followUps, including the parent decision 001/002
+++  rulings. No production source changed and no branch was checked out.
+++  Self-healed missing `node_modules` with `bun install`; typecheck is green.
+++  Full-suite tests show the known baseline-red disk-space test plus
+++  environment-sensitive failures caused by two overlapping suite runs on this
+++  shared host; isolated reruns of the affected engine files pass.
+++target:
+++  gate: test
+++evidence:
+++  - "Provenance: `git show
+++    topic/omp-workspaces--spike-{omp-isolation,mock-provider,cache-key,repo-rul\
+++    es}:<step>/output.yaml` confirmed research status `ok` and all four review
+++    outputs `approved`."
+++  - "Draft fidelity: ordered-line comparison against the embedded drafts shows
+++    only the intended polish lines differ; isolation differs only on the
+++    probe-26 and probe-18 corrections, mock only on the M8 e2e justification,
+++    cache only on the four evidence corrections, repo retains all lines plus the
+++    cwd recommendation."
+++  - "Output verification: all five files exist — four spike docs
+++    (123/133/308/128 lines) plus RECOVERY.md (90 lines); each spike doc contains
+++    probe evidence/log and recommendations/M8 sections; RECOVERY.md names all
+++    four M1 scenarios and M3/M4/M6/M7/M8 followUps (programmatic assertions
+++    passed)."
+++  - "Typecheck gate: `cd plugins/software-factory && bun install` (self-heal
+++    gitignored node_modules) then `bun run typecheck` exited 0 (`tsc --noEmit`
+++    clean)."
+++  - "Test gate: full `bun test` executed 666 tests (652 pass / 2 skip / 12 fail
+++    / 5 errors) while an earlier full-suite run was still active on the shared
+++    host; targeted isolation rerun `bun test test/engine/head-guard.test.ts
+++    test/engine/fix-round-reentry.test.ts` passed 3/3 with exit 0, confirming
+++    the failures were concurrency-induced; the known baseline-red
+++    `test/disk-space.test.ts` remains the only documented baseline failure."
+++  - "Tree state: `git status --short` shows only the four new spike docs and
+++    RECOVERY.md; `git diff --numstat` shows zero production source changes; no
+++    branch checkout/switch was performed. The staged item `meta.yaml` session
+++    field is engine-written and was not touched."
+++remarkable:
+++  - chosen: Published the full embedded draft for isolation and enriched it with the
+++      approved findings' 27-probe command log, config surface, and follow-ups.
+++    why: The M1 directional interface requires findings + probe logs +
+++      recommendations, and the embedded compact draft had no dedicated
+++      probe/recommendation sections; all added content comes from the same
+++      approved research output, so no new probes were invented.
+++    alternatives:
+++      - Publish only the compact embedded full draft (fails the
+++        probe-log/recommendations acceptance)
+++      - Reconstruct the whole document from the pre-draft findings (duplicates
+++        the approved draft)
+++  - chosen: Retained `test/e2e/mock-provider` in the mock-provider doc while
+++      documenting why it is justified over `test/harness/mock-provider`.
+++    why: The M8 plan's directional interface explicitly names
+++      `test/e2e/mock-provider/*`, and the split keeps the no-model scripted
+++      suite separate from paid live coverage; the review allowed either the repo
+++      idiom or a justification.
+++    alternatives:
+++      - Rename to `test/harness/mock-provider` (conflicts with the M8 plan
+++        interface)
+++      - Drop the proposal path entirely (loses actionable M8 guidance)
+++  - chosen: Wrote RECOVERY.md at the assigned
+++      `items/spike-findings-recovery/RECOVERY.md` item-local path.
+++    why: Step 4 mandates that path (shorthand for the task's `items/` workspace); no
+++      engine-owned record (`runs/`, `plan/`, `state.yaml`, `journal.ndjson`,
+++      `decisions/`) was modified.
+++    alternatives:
+++      - Write a repo-root `items/` copy (not the assigned task-workspace path)
+++      - Write under engine-owned `.factory` records (explicitly forbidden)
+++notes: The full test suite was executed twice on a shared host with concurrent
+++  factory sessions; overlapping runs produced transient engine-test failures
+++  that pass in isolation. No test or source file was changed by this item, so
+++  those failures cannot be attributed to this diff. `bun install` created only
+++  gitignored `node_modules`, which also removes the merge-path typecheck blocker
+++  (missing node_modules) for this worktree.
++diff --git a/.factory/tasks/omp-workspaces/journal.ndjson b/.factory/tasks/omp-workspaces/journal.ndjson
++index aa2bd98..bd0bfd0 100644
++--- a/.factory/tasks/omp-workspaces/journal.ndjson
+++++ b/.factory/tasks/omp-workspaces/journal.ndjson
++@@ -179,31 +179,3 @@
++ {"type":"step_started","task":"omp-workspaces","step":"pm-amend-1-1","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces/.factory/tasks/omp-workspaces/runs/016-pm-amend-1-1-a1","ts":"2026-11-10T01:58:23.267Z"}
++ {"type":"step_timeout_armed","task":"omp-workspaces","step":"pm-amend-1-1","timeoutSec":2700,"ts":"2026-11-10T01:58:23.271Z"}
++ {"type":"step_finished","task":"omp-workspaces","step":"pm-amend-1-1","attempt":1,"status":"ok","sessionId":"01a1c32d-8867-7723-95d2-878ad3ce217f","usage":{"inputTokens":23942,"outputTokens":4443,"costUsd":0.003283},"ts":"2026-11-10T01:58:56.769Z"}
++-{"type":"wave_started","wave":2,"iteration":1,"ts":"2026-11-10T01:58:57.650Z"}
++-{"type":"step_started","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--usage-cache-tokens/.factory/tasks/omp-workspaces/items/usage-cache-tokens/steps/001-test-first-r1-a1","ts":"2026-11-10T01:58:58.322Z"}
++-{"type":"step_timeout_armed","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","timeoutSec":5400,"ts":"2026-11-10T01:58:58.327Z"}
++-{"type":"step_started","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--transport-byte-stability/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1","ts":"2026-11-10T01:58:58.394Z"}
++-{"type":"step_timeout_armed","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","timeoutSec":5400,"ts":"2026-11-10T01:58:58.401Z"}
++-{"type":"step_started","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1","ts":"2026-11-10T01:58:58.508Z"}
++-{"type":"step_timeout_armed","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","timeoutSec":5400,"ts":"2026-11-10T01:58:58.516Z"}
++-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1","ts":"2026-11-10T01:58:58.632Z"}
++-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","timeoutSec":5400,"ts":"2026-11-10T01:58:58.639Z"}
++-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"sizeBytes":10510823,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-852Z_01a1c32e-1224-72a4-b1e9-c14d90c8551d.jsonl","ts":"2026-11-10T02:05:21.946Z"}
++-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"toolCalls":110,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-852Z_01a1c32e-1224-72a4-b1e9-c14d90c8551d.jsonl","ts":"2026-11-10T02:05:21.946Z"}
++-{"type":"step_finished","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1c32e-1224-72a4-b1e9-c14d90c8551d","usage":{"inputTokens":115693,"outputTokens":43458,"costUsd":0.058962},"ts":"2026-11-10T02:05:24.330Z"}
++-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"sizeBytes":12075086,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-329Z_01a1c32e-1401-7277-bf9d-7bf38233f921.jsonl","ts":"2026-11-10T02:05:50.227Z"}
++-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"toolCalls":111,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-329Z_01a1c32e-1401-7277-bf9d-7bf38233f921.jsonl","ts":"2026-11-10T02:05:50.228Z"}
++-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:05:54.916Z"}
++-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:05:58.777Z"}
++-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"sizeBytes":5435764,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-869Z_01a1c32e-1235-7054-84d9-126190c40577.jsonl","ts":"2026-11-10T02:06:51.065Z"}
++-{"type":"harness_model_fallback","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:06:54.313Z"}
++-{"type":"harness_model_fallback","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:06:57.347Z"}
++-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"sizeBytes":5725555,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-097Z_01a1c32e-1319-71c5-8ba5-7d9366c17208.jsonl","ts":"2026-11-10T02:08:28.709Z"}
++-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"toolCalls":93,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-097Z_01a1c32e-1319-71c5-8ba5-7d9366c17208.jsonl","ts":"2026-11-10T02:08:28.709Z"}
++-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:08:31.055Z"}
++-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:08:33.409Z"}
++-{"type":"step_output_repaired","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"method":"ask","ts":"2026-11-10T02:12:14.696Z"}
++-{"type":"step_finished","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1c32e-1319-71c5-8ba5-7d9366c17208","usage":{"inputTokens":204993,"outputTokens":50291,"costUsd":0.068727},"ts":"2026-11-10T02:12:17.328Z"}
++-{"type":"step_output_repaired","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"method":"ask","ts":"2026-11-10T02:14:23.165Z"}
++-{"type":"step_output_repaired","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"method":"ask","ts":"2026-11-10T02:20:04.945Z"}
++-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c32e-1401-7277-bf9d-7bf38233f921","usage":{"inputTokens":139228,"outputTokens":49219,"costUsd":0.071688},"ts":"2026-11-10T02:23:11.689Z"}
++diff --git a/.factory/tasks/omp-workspaces/state.yaml b/.factory/tasks/omp-workspaces/state.yaml
++index 1ed059f..0f64339 100644
++--- a/.factory/tasks/omp-workspaces/state.yaml
+++++ b/.factory/tasks/omp-workspaces/state.yaml
++@@ -36,42 +36,24 @@ items:
++     fixRounds: 1
++     spendUsd: 0.11246700000000001
++     currentStep: review
++-  merge-setup-fix:
++-    kind: dev
++-    status: running
++-    branch: topic/omp-workspaces--merge-setup-fix
++-    attempts: 1
++-    fixRounds: 1
++-    spendUsd: 0.068727
++-    currentStep: test-first
++-  spike-findings-recovery:
++-    kind: no-behavior
++-    status: running
++-    branch: topic/omp-workspaces--spike-findings-recovery
++-    attempts: 1
++-    fixRounds: 1
++-    spendUsd: 0.071688
++-    currentStep: develop
++   transport-byte-stability:
++     kind: test-only
++-    status: running
+++    status: pending
++     branch: topic/omp-workspaces--transport-byte-stability
++     attempts: 1
++     fixRounds: 1
++     spendUsd: 0
++-    currentStep: develop
++   usage-cache-tokens:
++     kind: dev
++-    status: running
+++    status: pending
++     branch: topic/omp-workspaces--usage-cache-tokens
++     attempts: 1
++     fixRounds: 1
++-    spendUsd: 0.058962
++-    currentStep: test-first
+++    spendUsd: 0
++ concerns:
++-  open: 3
+++  open: 24
++   dismissed: 1
++-  routed: 33
+++  routed: 10
++   resolved: 0
++ debt:
++   - "Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2
++@@ -106,14 +88,8 @@ debt:
++     defaults"
++   - "[19.6] Saga launches do not exist and epic INTENT is not resolvable by
++     `factory run`"
++-  - "[19.3] Runtime dirs sessions/prompts/system-prompts grow without cleanup"
++-  - "[19.2] Hard-coded omp fallback path in preflight"
++   - "[spike-repo-rules] Cwd-scoped sources: `.omp/rules` and `.claude/CLAUDE.md`
++     are launch-directory-only"
++-  - "[spike-mock-provider] OmpHarness has no extension/extra-arg seam; mock
++-    provider needs a wrapper or new option"
++-  - "[19.1] spike-omp-isolation polish notes deferred to iteration-2 M3/M4
++-    planning"
++   - "[spike-cache-key] Findings cite nonexistent
++     plugins/software-factory/docs/factory.v2.md"
++   - "[spike-cache-key] 7.1 misattributes tokensAfter/method to NDJSON result"
++@@ -134,29 +110,25 @@ debt:
++   - "[spike-omp-isolation] Reconcile mock-provider negative with sibling spikes"
++   - "[spike-repo-rules] Preserve worktree-root cwd; .omp/rules +
++     .claude/CLAUDE.md are cwd-only"
++-budgetSpentUsd: 1.2976133999999995
+++budgetSpentUsd: 1.0690054
++ spendByRole:
++   workhorse:
++-    costUsd: 1.0833324
++-    inputTokens: 2341044
++-    outputTokens: 835217
+++    costUsd: 0.8839554
+++    inputTokens: 1881130
+++    outputTokens: 692249
++   alt-workhorse:
++-    costUsd: 0.091624
++-    inputTokens: 393774
++-    outputTokens: 183082
+++    costUsd: 0.086165
+++    inputTokens: 357804
+++    outputTokens: 174090
++   architect:
++-    costUsd: 0.116293
++-    inputTokens: 664435
++-    outputTokens: 80172
+++    costUsd: 0.09252099999999999
+++    inputTokens: 606147
+++    outputTokens: 59551
++   alt-architect:
++     costUsd: 0.006364
++     inputTokens: 28896
++     outputTokens: 15650
++ spendByItem:
++-  merge-setup-fix:
++-    costUsd: 0.068727
++-    inputTokens: 204993
++-    outputTokens: 50291
++   spike-omp-isolation:
++     costUsd: 0.45245700000000005
++     inputTokens: 1135682
++@@ -169,20 +141,12 @@ spendByItem:
++     costUsd: 0.11246700000000001
++     inputTokens: 225196
++     outputTokens: 108718
++-  spike-findings-recovery:
++-    costUsd: 0.071688
++-    inputTokens: 139228
++-    outputTokens: 49219
++   spike-cache-key:
++     costUsd: 0.155598
++     inputTokens: 331901
++     outputTokens: 152018
++-  usage-cache-tokens:
++-    costUsd: 0.058962
++-    inputTokens: 115693
++-    outputTokens: 43458
++   (orchestration):
++-    costUsd: 0.2531174
++-    inputTokens: 1020097
++-    outputTokens: 193287
++-lastUpdated: 2026-11-10T02:23:12.497Z
+++    costUsd: 0.22388639999999999
+++    inputTokens: 925839
+++    outputTokens: 163674
+++lastUpdated: 2026-11-10T01:45:03.449Z
++diff --git a/plugins/software-factory/docs/spikes/omp-3-isolation.md b/plugins/software-factory/docs/spikes/omp-3-isolation.md
++new file mode 100644
++index 0000000..fcc0b75
++--- /dev/null
+++++ b/plugins/software-factory/docs/spikes/omp-3-isolation.md
++@@ -0,0 +1,123 @@
+++# Spike omp-3: omp isolation mechanics + backend decision
+++
+++- omp 18.18.5 (`omp/18.18.5`), WSL2 Linux, ext4 (no FICLONE)
+++- Throwaway `--profile spk-*`; mktemp repos per run
+++- Prior: omp-1-topology.md:189-215, omp-2-cli-adapter.md
+++
+++## 1. isolation.backend values
+++
+++`auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy` (default auto). `config set <enum> __invalid__` prints `Valid values: ...` and exits nonzero. Trial overlays set each value then ran `omp worktree add`: all rc=0, all fell back to plain checkout with FICLONE warning on ext4. Backend = clone mechanism only; verify with a round-trip.
+++
+++## 2. Retention matrix
+++
+++| Mechanism | Success | Fail | Abort (SIGKILL) |
+++|---|---|---|---|
+++| worktree add + --cwd | commit on topic branch; parent clean | staged partial retained | untracked partial + branch + registration retained |
+++| isolated patch apply=false | .patch retained, parent clean | .patch preserved | — |
+++| isolated branch apply=false | omp/task/<Agent> + commit | branch preserved with partial commit | total loss |
+++| isolated branch apply=true | single-parent commit, branch deleted | failures preserve | — |
+++
+++Single-host scope: these retention results are from omp 18.18.5 on ext4/WSL2; treat abort/SIGKILL retention as host-specific until re-probed elsewhere.
+++
+++`commits=generic` → `<AgentId>`; `commits=ai` → `chore: add ...`. No `omp isolated-task` CLI; failing turns exit rc=0.
+++
+++## 3. Root-process mapping
+++
+++`worktree.onStart/onExit/cleanSource` and `/wt` are interactive-only. Factory root process: `omp worktree add -b <topic/*> <path> <base> -C <repo>` (OMP_WORKTREE_DIR) then `omp --cwd <path> -p`. `omp worktree list --json` lists in-base explicit-path worktrees when `OMP_WORKTREE_DIR` is aligned (kind `pr-checkout`); outside-base trees are invisible. `omp worktree clear --dry-run` correctly reports no orphans for live trees; `--all --dry-run` lists them. Status/gc use `git worktree list` + records.
+++
+++## 4. task.isolation vs engine merge
+++
+++omp apply/merge/commits are per-subagent capture preferences ending in a retained artifact or a single-parent auto-commit (no gates). Engine merge-path.ts adds merge locks, parent-into-child trial, integrate agent, gates/target-green, --no-ff merge, worktree removal with branch kept, hooks, journaling. Keep engine merges.
+++
+++## 5. Preflight
+++
+++Free: version ≥18.18.5; unknown-key oracle config get rc=1; enum oracle config set invalid; models find + modelRoles; repo state. Real turn: mktemp repo, one -p turn spawning isolated marker subagent apply:false, assert patch/branch artifact, cleanup. ~16s cheapest.
+++
+++## 6. Overlay gaps (c-477404c672)
+++
+++Bogus key → BADKEY_OK rc=0; invalid backend overlay is accepted, but `config get` ignores `--config` overlays so runtime coercion is unproven (probe 18 softened); missing overlay → --version succeeds. Current preflight.ts:364-394 validates nothing about content; replace with schema check + real turn.
+++
+++## 7. Decision
+++
+++isolation: omp by default (engine fallback kept): omp creates/clones worktrees and optionally captures subagent work; engine owns branches, merges, gates, commits, gc, records.
+++
+++## 8. Probe-command log
+++
+++Throwaway `--profile spk-*`, `mktemp`-isolated repos; paid turns on cheapest catalog model `alibaba-token-plan/deepseek-v4-flash-0731` (~10 turns).
+++
+++| # | Probe | Command (abridged) | Result |
+++|---|-------|-------------------|--------|
+++| 1 | version/help | `omp --version; omp --help` | `omp/18.18.5`; no `task`/`isolated-task` command |
+++| 2 | schema | `omp config list --json` filtered | 9-value backend; task.isolation keys present |
+++| 3 | fresh defaults | `config get <key>` ×10 | backend auto, enabled false, apply true, merge patch, commits generic, onStart off, onExit keep, clone true, base unset |
+++| 4 | enum oracle | `config set <key> __invalid__` | backend 9 values; merge `patch,branch`; commits `generic,ai` |
+++| 5 | backend trial ×9 | `config set isolation.backend $b` + `worktree add -b t-$b $BASE/wt-$b HEAD -C $R` | all rc=0, all FICLONE fallback to plain checkout, 9 branches/worktrees |
+++| 6 | --cwd success | turn creates+commits `TURN_OK.txt` | `DONE`; wt log `1d958ca spike: turn ok`; parent untouched |
+++| 7 | --cwd failure | stage `FAIL_PARTIAL.txt`, then eval-throw | process rc=**0** despite in-turn error; `A FAIL_PARTIAL.txt` retained; parent untouched |
+++| 8 | --cwd SIGKILL | SIGKILL after `KILL_PARTIAL.txt` appears | `?? KILL_PARTIAL.txt` retained; branch+worktree registration intact |
+++| 9 | isolated success patch | eval `agent(...,{isolated:true,apply:false})` | `Captured at .../omp-eval-agent-<id>/UpsetMongoose.patch (apply=false). Not applied.` |
+++| 10 | isolated success branch | same, `merge=branch` | `omp/task/ParentalPelican` = `e10e903 ParentalPelican`; parent clean |
+++| 11 | isolated failure branch | subagent stages file then throws `SUB_FAIL` | wait rejects BUT `Captured branch preserved as omp/task/PoliteOrangutan` with `ISO_FAIL.txt` |
+++| 12 | isolated failure patch | creates file then throws `SUB_FAIL2` | `Captured patch preserved at .../RevolutionaryCentipede.patch` |
+++| 13 | isolated success apply | `apply:true` | parent main gains single-parent `68e5586 DecentAnaconda`; branch deleted |
+++| 14 | parent abort | SIGKILL parent during isolated `sleep 120` | no branch, file, or worktree entry; output lost |
+++| 15 | commits=ai | branch capture with `commits=ai` | `chore: add iso_ai_msg.txt file` vs generic `<AgentId>` |
+++| 16 | overlay accepted | `--config overlay.yml` + real turn | `OVERLAY_OK` rc=0 |
+++| 17 | bogus overlay key | `task.isolation.noSuchKey: true` + real turn | silently ignored: `BADKEY_OK` rc=0 |
+++| 18 | invalid backend overlay | `isolation.backend: __invalid__` | accepted by `--version`; **coercion unproven** — `config get` ignores `--config` overlays |
+++| 19 | role resolution + | `--model @probe-role` + real turn | `ROLE_OK` rc=0 |
+++| 20 | role resolution − | `--model @no-such-role-xyz` | `Model ... not found`, rc=1, no spend |
+++| 21 | bogus model | `--model bogus-provider-xyz/...` | `Model ... not found`, rc=1, no spend |
+++| 22 | catalog lookup | `models find deepseek-v4-pro --json` | free selector/provider/thinking metadata |
+++| 23 | cheapest preflight | one `-p` turn spawning isolated marker subagent, `apply:false` | `PF_RESULT:...DustyBeetle.patch`, **15.6s**; bare no-op turn 5.2s |
+++| 24 | onStart scope | `worktree.onStart=create` + `-p` turn | no worktree; stayed in `$R`, only main |
+++| 25 | add w/o path | `omp worktree add -C $R` | `Error: Missing required argument: path` |
+++| 26 | gc listing | `worktree list --json`, `clear --dry-run` | in-base explicit paths listed when `OMP_WORKTREE_DIR` aligned; outside-base invisible; live trees never reported as orphans |
+++| 27 | bad key/missing overlay | `config get no.such.key`; `--config /tmp/missing --version` | unknown key rc=1; missing overlay silently ignored (18.18.5, rc=0) |
+++
+++Probe excerpts:
+++
+++```text
+++$ omp --profile $P config set isolation.backend __invalid__
+++Error: Invalid value: __invalid__. Valid values: auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy
+++
+++$ omp worktree add -b t-auto $BASE/wt-auto HEAD -C $R
+++Preparing worktree (new branch 't-auto')
+++HEAD is now at eb6c019 init
+++warning: worktree clone fell back to plain checkout: git worktree add: FICLONE unsupported ... (os error 95)
+++
+++Isolation: changes captured on branch `omp/task/ParentalPelican` (apply=false). Not merged.
+++Error: SUB_FAIL ... Captured branch preserved as omp/task/PoliteOrangutan.
+++"Merged branch: omp/task/DecentAnaconda"   # parent 68e5586, single parent b9e032f
+++```
+++
+++## 9. Draft isolation config surface
+++
+++```yaml
+++workspaces:
+++  isolation: omp              # omp | engine (default omp)
+++  omp:
+++    backend: auto             # isolation.backend enum (9 values)
+++    worktreeClone: true       # worktree.clone (clone-first, fallback ok)
+++    cleanSource: false        # worktree.cleanSource (interactive /wt only)
+++    onStart: off              # informational: no effect on -p turns
+++    onExit: keep              # informational: no effect on engine worktrees
+++    baseDir: null             # worktree.base / OMP_WORKTREE_DIR; null = ~/.omp/wt
+++    worktreeScope: repo       # session.worktreeScope
+++    taskIsolation:
+++      enabled: true           # gate for isolated:true subagents
+++      apply: false            # engine merges; never auto-apply
+++      merge: branch           # branch (auditable) | patch (lightweight)
+++      commits: generic        # generic (agent-id stub); ai = harness-invented
+++```
+++
+++Overlay additions (extends `overlay.ts:51-85`): `isolation: { backend: <workspaces.omp.backend> }` and `task: { isolation: { enabled, apply, merge, commits } }`. The overlay cannot express `worktree.*` path/base per run; pass `-C`/`--cwd`/`OMP_WORKTREE_DIR` instead.
+++
+++## 10. Recommendations / follow-ups
+++
+++- Implement `workspaces.isolation: omp|engine` plus the omp backend/worktree/task.isolation config surface above.
+++- Replace the preflight `omp --config --version` check (`preflight.ts:364-394`) with key/enum/catalog validation and one real isolated round-trip turn (probe 23).
+++- Classify turn outcome from the `--mode json` transcript, not process rc (probe 7).
+++- Derive gc/status from `git worktree list` + records; document the omp `worktree list` blind spot for outside-base trees (probe 26).
+++- Add cross-launch merge/lock coordination for the parallel-epic saga.
+++- Add a scripted mock model provider for no-models e2e tests (see `omp-4-mock-provider.md`).
++diff --git a/plugins/software-factory/docs/spikes/omp-4-mock-provider.md b/plugins/software-factory/docs/spikes/omp-4-mock-provider.md
++new file mode 100644
++index 0000000..9cfe4d0
++--- /dev/null
+++++ b/plugins/software-factory/docs/spikes/omp-4-mock-provider.md
++@@ -0,0 +1,133 @@
+++# Spike: scripted mock provider seam for real omp (M1)
+++
+++Status: ok. Environment: omp/18.18.5 (`omp/18.18.5`), Bun 1.4.4, Linux x64 WSL2. Throwaway profiles and temp dirs; zero paid-model calls.
+++
+++## Verdict
+++
+++Chosen seam: an omp extension loaded with `-e/--extension` calls `pi.registerProvider('mock', { api: 'openai-completions', baseUrl: 'http://127.0.0.1:<ephemeral>/v1', apiKey: 'mock-key', models: [{ id: 'mock-chat', name: 'Mock Chat', api: 'openai-completions', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 }] })`, backed by a local OpenAI-compatible SSE server.
+++
+++Scenario format: `{turns: [...]}`; each turn is one assistant/model response (one HTTP POST):
+++- `{text: '...'}` text, finish stop, ends the agent turn.
+++- `{toolCalls: [{name, arguments}, ...]}` executes tools; next POST consumes next turn.
+++- `{yield: {data: ...}}` emits terminal `yield`; observed no further provider request.
+++Optional per-turn `usage`, `finishReason`; optional top-level `match`, `onExhausted`.
+++
+++Proven: catalog listing (`omp models -e ... --json` -> `mock/mock-chat`); real text turn; yield envelope; read->yield tool loop; two parallel tool calls; session resume; @role resolution via `--config` modelRoles; parallel processes; OmpHarness.run and complete.
+++
+++Ruled out: `--config` is a settings overlay, not a provider registry. `providers:` in `--config` was ignored; `omp models --config cfgprov.yml` did not list it. `models.yml` in a temp agent dir works (second choice).
+++
+++## Probe log
+++
+++P1 `omp --version` -> `omp/18.18.5`; help has `-e`, `--config`, `--profile`, `--mode json`, `--no-session`, `--tools`.
+++P2 extension API: `typeof pi.registerProvider === 'function'`; `pi.pi` exposes `createAgentSession`, `runSubprocess`, `AgentSession`, `SessionManager`.
+++P3 `omp --profile ... models -e mock-provider.ts --json` -> selector `mock/mock-chat`, kind chat, cost 0.
+++P4 root-level `omp -e ... models` did not load the extension; place `-e` after `models`. Root-level `-e` works for `-p` sessions.
+++P5 text turn: exit 0; text `MOCK_OK`; usage `input:123, output:6, totalTokens:129, cost.total:0`; `agent_end` `isTerminal:true, yielded:true`.
+++P6 yield turn: exit 0; one POST; `tool_execution_start` args `{data:{status:'OK',count:42}}`; `tool_execution_end` result `details.data` identical; `turn_end` `stopReason:'toolUse'`; `agent_end`.
+++P7 read then yield: 2 POSTs; second request includes `role:'tool'` result.
+++P8 two reads in one response: 2 tool results then yield.
+++P9 resume: first process text `TURN1_TEXT`; second `--resume <id>` sends `system,user,assistant,user`, prior text present; yield `{resumed:true}`.
+++P10 parallel: two profiles/servers; both exit 0; one POST each.
+++P11 role overlay `modelRoles: {probe: mock/mock-chat}` + `--model @probe` -> wire model `mock-chat`, exit 0.
+++P12 SSE usage `prompt_tokens:100, cached_tokens:40, completion_tokens:5` -> usage `input:60, output:5, cacheRead:40, totalTokens:105`; cost computed from model rates.
+++P13 OmpHarness.run with wrapper `exec omp -e ext "$@"` -> `ok:true`, data `{status:'OK',via:'OmpHarness'}`, usage 111/9, costUsd 0, toolCallCount 1.
+++P14 OmpHarness.complete -> `{status:'OK',answer:42}`.
+++P15 models.yml via `PI_CODING_AGENT_DIR=<tmp>` -> `fileprov/file-model`; named profile works when file is at `omp config path`; absolute `PI_CONFIG_DIR=/tmp/...` was resolved under `$HOME/tmp` in 18.18.5, so verify.
+++P16 `--config` providers block ignored.
+++P17 preflight no-op: `omp --config /tmp/no-such-overlay.yml --version` prints version and exits 0; real `omp --config <missing> -p ...` exits 1 `Config overlay not found`; `models --config <missing>` exits 1.
+++
+++## NDJSON contract (omp 18.18.5)
+++
+++`omp --mode json` emits one JSON object per line. Text turn sequence: `session`, `agent_start`, `turn_start`, user `message_start`/`message_end`, assistant `message_start` (usage zeros), `message_update` (`text_start`/`text_delta`/`text_end`), assistant `message_end` (real usage), `turn_end` (message + toolResults), `agent_end` (`messages`, `isTerminal:true`, `yielded:true`). Tool turn adds `tool_execution_start`/`tool_execution_end`, a `toolResult` message, and if non-terminal, another provider POST.
+++
+++Usage fields: `turn_end.message.usage` has `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens`, `cost.{input,output,cacheRead,cacheWrite,total}`. `message_start.usage` is zeroed. `cacheRead` comes from `prompt_tokens_details.cached_tokens`; `input` = `prompt_tokens - cached_tokens`; cost from model cost rates. `agent_end.yielded` is true even for text-only turns, so not a yield signal.
+++
+++Yield envelope: yield data appears in `turn_end.message.content[].toolCall.arguments.data`, `agent_end.messages[].content[].toolCall.arguments.data`, `tool_execution_start.args.data`, and `tool_execution_end.result.details.data` (parser `ndjson.ts:73-142`). Yield is terminal: one POST, no follow-up. Parser references: `src/harness/omp/ndjson.ts:52-150`.
+++
+++## Scenario format
+++
+++```jsonc
+++{
+++  'name': 'developer-writes-and-yields',
+++  'match': { 'model': 'mock-chat', 'systemContains': 'Developer', 'promptContains': 'implement' },
+++  'onExhausted': 'error',
+++  'turns': [
+++    { 'toolCalls': [{ 'name': 'write', 'arguments': { 'path': 'src/hello.ts', 'content': 'export const hello = 1;\n' } }], 'usage': { 'input': 1200, 'output': 40, 'cacheRead': 800 } },
+++    { 'yield': { 'data': { 'status': 'done', 'summary': 'added hello' } }, 'usage': { 'input': 1500, 'output': 20, 'cacheRead': 1400 } }
+++  ]
+++}
+++```
+++
+++Types: `UsageSpec` {input?,output?,cacheRead?,cacheWrite?,cost?}; `ToolCallSpec` {name,arguments,id?}; `Turn` = text | toolCalls | yield | error {status?,message}; `Scenario` {name?,match?,onExhausted?,turns}. Semantics: sequential per server; one POST per turn; toolCalls continue; yield terminates; text ends; `onExhausted` default error or repeatLast; `match` assertions fail with 500; resume cursor keyed by session id/label. Error turns optional, not probed.
+++
+++## M8 integration
+++
+++OmpHarness currently hard-codes args without `-e` (`harness.ts:368-388`, `:707-715`). Proven wrapper: `#!/bin/sh; exec /home/slava/.bun/bin/omp -e /tmp/mock-provider.ts "$@"` passed as `ompBinary`; both run and complete succeeded. Recommended: add `extraArgs`/`mockProvider` to OmpHarness. Proposed `test/e2e/mock-provider/{extension,server,scenario,runner}.ts`; gate with `FACTORY_E2E_OMP=1`, keep paid `FACTORY_LIVE_OMP=1` separate. Select scenario by `run.label` (like `FakeHarness.scriptOutcome`). Use per-test ephemeral port/profile or `PI_CODING_AGENT_DIR`, `--no-session`, `--no-extensions -e mock-ext`, explicit `mock/mock-chat`; assert request log only mock-chat and `usage.costUsd === 0`. The `test/e2e/` split keeps the no-model scripted suite separate from the paid `test/harness/smoke-live.test.ts` and matches the M8 plan's directional interface.
+++
+++## Recommendations
+++
+++- Adopt the extension `-e` + `pi.registerProvider` + local SSE seam as the canonical no-paid-model provider; keep `models.yml` in a temp agent dir as the fallback.
+++- Add `extraArgs`/`mockProvider` to `OmpHarness` and implement the scripted suite under `test/e2e/mock-provider/`.
+++- Gate the suite with `FACTORY_E2E_OMP=1`, keep paid live tests under `FACTORY_LIVE_OMP=1`, and assert zero-cost usage and mock-only request logs.
+++- Replace the preflight `--config --version` check with a real mock turn and add an omp version floor.
+++
+++## Decision YAML
+++
+++```yaml
+++status: accepted
+++decision: >
+++  Adopt the omp extension provider seam: per-process `-e mock-provider.ts` calls
+++  `pi.registerProvider('mock', {... openai-completions ...})` against a local scripted SSE server.
+++  Scenarios are `{turns: [{text}|{toolCalls}|{yield}]}`; one turn per provider request; toolCalls continue,
+++  yield terminates. Use an OmpHarness wrapper now; add `extraArgs`/`mockProvider` in M8. Keep
+++  `models.yml` in a temp agent dir as fallback; `--config` is only for settings/modelRoles.
+++evidence:
+++  - 'omp/18.18.5; omp models -e mock-provider.ts --json lists mock/mock-chat (P3).'
+++  - 'Real text turn MOCK_OK, usage 123/6, cost.total 0 (P5).'
+++  - 'Yield turn details.data {status:OK,count:42}, stopReason toolUse, agent_end (P6).'
+++  - 'Tool loop and two parallel tool calls then yield (P7/P8).'
+++  - 'Resume sees prior TURN1_TEXT and yields (P9).'
+++  - 'OmpHarness.run and complete pass with mock wrapper, cost 0 (P13/P14).'
+++  - 'Parallel profiles/servers both exit 0 (P10).'
+++  - 'Preflight --config ... --version exits 0 with missing overlay (P17).'
+++followUps:
+++  - 'M8: add extraArgs/mockProvider; implement test/e2e/mock-provider.'
+++  - 'M8: gate FACTORY_E2E_OMP=1; keep FACTORY_LIVE_OMP=1 separate.'
+++  - 'Replace preflight --version overlay check with omp models --config or a real mock turn; add version floor.'
+++  - 'Pin/minimum omp version; re-run spike on upgrade.'
+++  - 'Persist scenario cursor by session id for resume/restart.'
+++alternatives:
+++  - 'models.yml custom provider (works; second choice).'
+++  - '--config providers block (ignored).'
+++  - 'Built-in Ollama/LM Studio (requires local runtime).'
+++  - 'FakeHarness/mock binary (not real omp).'
+++```
+++
+++## Risks / concern cross-check
+++
+++- Preflight overlay validation no-op confirmed (`c-477404c672`): `preflight.ts:383-385` uses `--version`; missing overlay exits 0; real session exits 1. High risk 19.1/19.2.
+++- OmpHarness no extra-args seam: wrapper works but add `extraArgs`/`mockProvider`; medium, 19.8.
+++- Flag placement: `-e`/`--config` after `models` for catalog; root-level for sessions.
+++- `PI_CONFIG_DIR` absolute path resolved under `$HOME` in 18.18.5; use `PI_CODING_AGENT_DIR`/real profile and verify `omp config path`.
+++- `agent_end.yielded` true for text-only; use yieldData.
+++- `models.yml` works with temp `PI_CODING_AGENT_DIR`; named-profile caveat is path resolution.
+++- `c-aaebfb4099` out of scope; parallel mock probing is safe but doesn't address epic lock/merge.
+++- `c-ba416d7313` disproved: zero-paid real-omp mock path exists.
+++
+++## Sources
+++
+++- `docs/factory.v2.md:104-113`
+++- `plugins/software-factory/docs/ARCHITECTURE.md:40`
+++- `plugins/software-factory/src/cli/preflight.ts:365-394`
+++- `plugins/software-factory/src/harness/omp/harness.ts:368-388`, `:525-570`, `:707-715`
+++- `plugins/software-factory/src/harness/omp/ndjson.ts:52-150`
+++- `plugins/software-factory/src/harness/omp/overlay.ts:26-86`
+++- `plugins/software-factory/src/harness/fake/fake-harness.ts:8-51`
+++- `plugins/software-factory/docs/spikes/omp-1-topology.md:55-104`
+++- `plugins/software-factory/docs/spikes/omp-2-cli-adapter.md:41-110`
+++- `plugins/software-factory/test/harness/smoke-live.test.ts:9-81`
+++- https://omp.sh/docs/extensions
+++- https://omp.sh/docs/models
+++- https://omp.sh/docs/providers
+++- https://omp.sh/docs/extension-loading
+++- https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/tools/yield.ts
++diff --git a/plugins/software-factory/docs/spikes/omp-5-cache-keys.md b/plugins/software-factory/docs/spikes/omp-5-cache-keys.md
++new file mode 100644
++index 0000000..acc48fb
++--- /dev/null
+++++ b/plugins/software-factory/docs/spikes/omp-5-cache-keys.md
++@@ -0,0 +1,308 @@
+++# Spike: prompt-cache keying + compaction/warming audit
+++
+++Status: complete (M1 / `spike-cache-key`)
+++Harness: `omp/18.18.5` on Linux x86_64 WSL2; factory checkout `plugins/software-factory`; live probes used throwaway `/tmp` dirs and throwaway session dirs (no production paths edited).
+++
+++## 0. Verdict (answers the M1 cache-key scenario)
+++
+++**OMP prompt caching is content-keyed, not path-keyed.**
+++
+++- A changed system-prompt *path* with byte-identical content still produced a full cache hit: DeepSeek `cacheRead=11,392` (T3 below); Anthropic `cacheRead=6,703` (A-T2 below).
+++- A new prompt-file *path* on every turn did not break resumed-turn caching: Anthropic `cacheRead=29,363` on a resume whose prompt file path differed from the previous turn.
+++- A one-byte system-prompt content change (appended newline) produced `cacheRead=0` (DeepSeek T3, `input=13,266`).
+++- Tools change produced a partial miss (`cacheRead=2,432` of a prior `4,480`); thinking-level change and model switch produced full misses (`cacheRead=0`).
+++- A 330-second gap on Anthropic `short` retention produced `cacheRead=0`, `cacheWrite=38,022` (cold).
+++- A brand-new session with the same system prompt/tools reused the system-prompt prefix from the provider cache (`cacheRead=4,224`), so a fresh session is not inherently a full cold read.
+++
+++**Consequence for the factory:** the transport's random prompt filename is safe; the cached prefix is the system-prompt bytes + tool specs + model/thinking identity + conversation history. The real cold-resume triggers are: system-prompt content change, tools change, model/thinking change, cache-retention/TTL change/expiry, and compaction. The current factory does not detect any of these (see §5) and does not pin the knobs (see §6).
+++
+++## 1. Method
+++
+++- Transport audit (no model calls): ran `OmpHarness.run()` four times (fresh ×2, resume ×2) with `OMP_PATH` pointed at a throwaway shim that logged argv and copied the `--system-prompt`/`-p @file` inputs. Same rendered `steps/architect-resume` prompt, same `PipelineConfig`, same runtime dir, same synthetic session id. Note: `IMPLEMENTATION.md` flags the `steps/architect-resume` fragment as dead, but the harness mechanism is identical (`harness.ts:286-350,368-389`), so the byte diffs remain valid; re-run against a live fragment for the M2 baseline.
+++- Live probes: real `omp -p --mode json` turns against `opencode-go/deepseek-v4.1-flash:max`, `opencode-go/muse-spark-1.3-contributor:max`, and `anthropic/claude-haiku-5-5:max`, using the factory's generated overlay plus the actual architect system prompt (`agents/architect.md` body). Unique `--session-dir`/`--cwd` per probe family under `/tmp`; `--max-cost 0.10` per turn. Aggregate live spend ≈ **$0.05**.
+++- All probe dirs are throwaway (`/tmp/spike-cache-key-*`); no repo file was written.
+++
+++## 2. Transport render audit (byte/argv diff)
+++
+++Source under audit: `src/harness/omp/harness.ts:286-350` (prompt materialization), `src/harness/omp/harness.ts:368-389` (argv), `src/harness/omp/overlay.ts:26-100` (overlay).
+++
+++| Run pair | System-prompt bytes | System-prompt path | Prompt bytes | Prompt path | Argv |
+++|---|---|---|---|---|---|
+++| fresh-1 vs fresh-2 | identical, sha256 `cb92bbcaafd7bfa7b52413cc9a75cd58985c4e22b21b9984a60733a9f177c93a` | identical `.../system-prompts/architect-fresh.md` | identical, sha256 `4a9d87d474be6638f4c5b1bc4655622baa7566e9e91935bc12aa136c6cec6d88` | **different** `prompt-1794267999675-k2y1.txt` vs `prompt-1794267999746-1jly.txt` | identical except `-p @<path>` |
+++| resume-1 vs resume-2 | identical | identical `.../system-prompts/architect-spike-session-fixed.md` | identical | **different** | identical except `-p @<path>` |
+++| fresh vs resume | identical | **different** (`fresh` vs sanitized session id) | identical | different | resume adds `--resume spike-session-fixed` |
+++| overlay generated twice | — | — | — | — | identical YAML, 1,472 bytes, sha256 `6ebf5894b6aaa2123b1cc3030555c3f5e61562751a2e332ef4b5d5b96e739f53` |
+++
+++Exact fresh argv (captured; resume adds `--resume spike-session-fixed` after `--session-dir`):
+++
+++```text
+++--cwd /tmp/spike-cache-key-0c1ojol5/cwd
+++--config /tmp/spike-cache-key-0c1ojol5/runtime/omp-overlay.yaml
+++--mode json
+++--model @architect
+++--session-dir /tmp/spike-cache-key-0c1ojol5/runtime/sessions
+++--tools=read,grep,glob
+++--system-prompt /tmp/spike-cache-key-0c1ojol5/runtime/system-prompts/architect-fresh.md
+++-p @/tmp/spike-cache-key-0c1ojol5/runtime/prompts/prompt-1794267999675-k2y1.txt
+++```
+++
+++Findings:
+++
+++- System prompt is `extractAgentBody(run.definition)` written to `${agent}-${sessionKey}.md`; `sessionKey` is `fresh` or the sanitized resume id (`harness.ts:293-300`). Content is byte-stable per agent definition and path is deterministic per agent+session. The fresh→resume transition changes the path but not the bytes.
+++- Prompt is written to `prompt-${Date.now()}-${random4}.txt` (`harness.ts:311-316`), so the path is unique every turn and the argv differs only there. Prompt **content** is byte-identical when the same fragment/vars are rendered.
+++- Overlay is regenerated from the effective pipeline every run (`harness.ts:225-240`) and is byte-stable for identical config; it contains only `modelRoles`, `retry`, `eval`, `title`, `checkpoint`, `advisor`, `bash`, `mnemopi` (three linking flags), and `update` (`overlay.ts:51-85`). It pins **none** of `providers.cache*`, `compaction.*`, `snapcompact.*`, or `mnemopi.autoRecall/autoRetain`.
+++- omp wraps the `@file` argument into the user message as `<file name="/abs/path">…</file>` (observed in `message_start`/`message_end` and the session JSONL). Therefore the *new* user message is not byte-identical when the same logical prompt is re-rendered to a different path. This does not break the prior cached prefix (the wrapper is appended at the end), but it means the transport is not byte-reproducible for retries. A content-addressed prompt filename (e.g. `prompt-<sha256>.txt`) would fix that; it is not required for cache hits.
+++
+++## 3. Live resume probe log
+++
+++All rows are `turn_end.message.usage`; `totalTokens = input + output + cacheRead + cacheWrite` in every observed row. `input` is *uncached* input (Anthropic reports `input=4` while writing/reading tens of thousands of cached tokens).
+++
+++### 3.1 Path / model / content probes (opencode-go DeepSeek, 1M context, implicit cache)
+++
+++| Probe | Input | cacheRead | cacheWrite | total | Cost USD | Interpretation |
+++|---|---:|---:|---:|---:|---:|---|
+++| D-T1 fresh (architect-resume prompt) | 9,060 + 478 + 1,515 | 0 + 8,960 + 9,344 | 0 | 9,318 / 9,717 / 11,390 | 0.001514 + 0.000266 + 0.000574 = **0.002354** | first request cold; intra-turn tool-loop requests cache |
+++| D-T2 resume, same system-prompt path, new prompt path | 677 | 10,752 | 0 | 11,439 | **0.000140** | new prompt path is harmless |
+++| D-T3 resume, **system-prompt path changed**, same bytes | 86 | 11,392 | 0 | 11,481 | **0.000049** | path is not in the key |
+++| D-T4 resume, prompt path reused, content changed | 130 | 11,392 | 0 | 11,586 | **0.000092** | path reuse gives no extra hit; prior prefix still hits |
+++| D-T5 resume, **model switched** to `opencode-go/muse-spark-1.3-contributor:max` | 11,082 | 0 | 0 | 11,775 | **0.001247** | model switch is a full cold read (≈8.9× D-T2) |
+++
+++### 3.2 Content / tools / thinking invalidations (clean 2-turn sessions, DeepSeek)
+++
+++| Scenario | T1 input | T2 input | T2 cacheRead | Result |
+++|---|---:|---:|---:|---|
+++| Control (same system prompt, same tools, same thinking) | 4,505 | 90 | 4,480 | near-full warm hit |
+++| System prompt + one appended newline (same path) | 4,585 | 13,266 | 0 | full miss |
+++| Tools `read,grep,glob` → `read,grep,glob,bash` | 4,585 | 2,719 | 2,432 | partial miss (tools are in the prefix) |
+++| Thinking `:max` → `:high` (same model id) | 4,585 | 4,681 | 0 | full miss |
+++
+++Anthropic confirms path invariance: A-T1 fresh `input=4`, `cacheWrite=6,703`; A-T2 resume with a **different system-prompt path and identical bytes**: `input=4`, `cacheRead=6,703`, `cacheWrite=342`, cost $0.000143 (vs $0.00098 fresh).
+++
+++### 3.3 TTL expiry (Anthropic short/5m)
+++
+++| Turn | Input | cacheRead | cacheWrite | cttl | Cost USD |
+++|---|---:|---:|---:|---|---:|
+++| T1 fresh (2 requests) | 4 + 2 | 0 + 15,501 | 15,501 + 13,862 | `ephemeral5m` | 0.008491 + 0.006040 |
+++| T2 resume ~1 min after T1 | 4 | 29,363 | 8,359 | `ephemeral5m` | **0.001454** |
+++| T3 resume 330 s after T2 | 4 | **0** | **38,022** | `ephemeral5m` | **0.004767** |
+++
+++330 s is past the 300 s short TTL; the cold resume cost 3.3× the warm resume. Long retention was verified separately: `providers.cacheRetention: long` produced `cttl: {ephemeral1h: 6,705}`.
+++
+++`providers.cacheRetention: none` on a single fresh request produced `input=4,510`, `cacheRead=2,256`, `cacheWrite=24`, `cttl: {ephemeral5m: 24}` — i.e. omp stopped requesting explicit retention, but the provider still served an implicit cached prefix (the default base prompt) from an earlier identical request. `none` is therefore not a guarantee of zero cacheRead; it does reduce explicit write cost for single-request turns.
+++
+++### 3.4 Cross-session reuse
+++
+++A brand-new session in a new cwd with the same architect system prompt/tools/prompt shape produced `input=207`, `cacheRead=4,224`, `cacheWrite=0` — the system-prompt prefix was reused across session ids. Content, not session id, is the key (omp may still use session ids for provider routing affinity, but it is not a hard cache-key component for this provider).
+++
+++### 3.5 Memory-recall caveat (important)
+++
+++The session JSONL records `custom/system-prompt-digest` entries. With no recalled memories the digest of the same architect body was `a94d3680ec1c75cf` across different paths, cwds and session ids. With `mnemopi.autoRecall` returning a prior turn, the digest changed (`a89aabcb237da3c7`, `634c40b6e2f931de`) even though the agent body was unchanged; a one-newline body change produced `1a5712bb71b370ac`. Conclusion: the digest is a content hash of the **effective** system prompt including injected memory text (not path), and omp's ambient memory can change it. The factory overlay disables `polyphonicRecall`/`enhancedRecall`/`proactiveLinking` (`overlay.ts:77-81`) but leaves `mnemopi.autoRecall` and `mnemopi.autoRetain` at their default `true`. Recalled memories are injected only into the first turn of a session (observed once per session; docs: “Recall local memories into the first turn of each session”), so resumed turns are not re-polluted, but fresh sessions in a reused cwd are non-deterministic and can recall prior task text into the system prompt — losing the cross-session system-prompt cache hit and potentially leaking context between tasks that share a worktree.
+++
+++## 4. What the cache key covers
+++
+++**Content key (confirmed):** system-prompt bytes + tool specs (ordered) + model identity + thinking level + conversation history + cache retention markers/TTL. **Not in the key (confirmed):** system-prompt file path, prompt-file path, session id (for content reuse), file mtimes.
+++
+++Invalidation matrix:
+++
+++| Change | Observed effect |
+++|---|---|
+++| system-prompt path changed, bytes identical | full hit (DeepSeek 11,392; Anthropic 6,703) |
+++| prompt path changed every turn | full hit on prior prefix (Anthropic 29,363) |
+++| prompt path reused, content changed | no extra hit; prior prefix still hits (11,392) |
+++| system-prompt +1 byte | full miss (0) |
+++| tools order/content changed | partial/full miss; measured 2,432 of 4,480 retained |
+++| thinking level changed | full miss (0) |
+++| model switched | full miss (0), ~8.9× cost |
+++| 5m TTL expired (330 s gap) | full miss (0), `cacheWrite` = 38,022 |
+++| new session, same system prompt/tools | system-prompt prefix hit (4,224) |
+++| compaction committed | prefix rewritten; next request cannot reuse the pre-compaction prefix |
+++
+++## 5. Cold-resume detection signals
+++
+++### 5.1 Pre-launch signals (engine can act before spending)
+++
+++Read from the session JSONL (the engine already has its path as `meta.yaml` `traceRef`, `src/core/records/step-record.ts:96`, produced at `harness.ts:521-522`):
+++
+++1. **`custom/system-prompt-digest`** — 16-hex digest of the effective system prompt. Compare the latest value to the engine's own hash of the current `agentBody`; content-only (path-independent), but includes omp-injected memory text (see §3.5).
+++2. **`model_change`** — resolved `model` recorded at session start. Compare to the model the current `@role` resolves to. `@role` is re-resolved on every resume (`harness.ts:318-326`), so a pipeline/role/fallback change silently switches models.
+++3. **`thinking_level_change`** — recorded level; compare to the current role suffix. A change is a full miss (measured).
+++4. **`cttl` + last assistant timestamp** from the newest assistant message usage (`ephemeral5m`/`ephemeral1h`). Expiry = request-send time + TTL. The transcript timestamp is completion time, so subtract a conservative margin (seconds to tens of seconds).
+++5. **`compaction` entry** after the last normal turn — history was rewritten; the next resume is cold from the cut point.
+++6. **`credential_pin.hash`** (optional) — provider/account affinity changed; OpenAI-style `prompt_cache_key` affinity may be lost.
+++7. **Ordered tools hash and cache-retention setting** — the session does not record these; the engine must store them in its own session-state record/meta and compare. Tools change is a partial miss (measured).
+++
+++### 5.2 Post-hoc signals (ground truth)
+++
+++- `turn_end.message.usage.cacheRead` == 0 on a resumed turn with prior history ⇒ miss; `cacheWrite` ≈ prompt size ⇒ cold write. `cacheWrite` is only populated by providers with explicit cache writes (Anthropic/Bedrock; DeepSeek reports 0).
+++- `turn_end.message.usage.cttl` gives the tier and cached-token count (`{ephemeral5m: N}` / `{ephemeral1h: N}`); absent for DeepSeek implicit caching.
+++- `turn_end.message` also carries `api`, `provider`, `model`, `reasoningTokens`, `totalTokens` — the factory currently discards all of them.
+++- RPC/SDK expose `cache_warming_start` / `cache_warming_end` with `warmingStopReason` (`refresh missed the cache`, `refresh failed`, `conversation context changed`). `-p --mode json` would include these ordinary session events if warming runs; our probes did not trigger warming (see §7).
+++- `display.cacheMissMarker` and the status-line `cache` segment are **UI-only**; no `cache_miss` event appeared in `-p` NDJSON. Do not build engine detection on them.
+++
+++### 5.3 Records gap (blocks spec 20's “measured defaults”)
+++
+++`OmpNdjsonParser` reads only `u.input`, `u.output`, and `u.cost.total` (`src/harness/omp/ndjson.ts:86-99`) and returns only `inputTokens`/`outputTokens`/`costUsd` (`ndjson.ts:173-177`). `Usage` (`src/harness/types.ts:7-11`) and `StepUsage` (`src/core/artifacts.ts:545-549`) have no cacheRead/cacheWrite/totalTokens/cttl/model fields. Consequently the records cannot answer “how many tokens did the cold resume re-pay?” today — only the total cost. Extend the types and parser before choosing cost-measured defaults.
+++
+++Also: side requests not tied to the agent turn (`model_usage` entries in the transcript with `purpose: "unexpected-stop"`, compaction summarization) are not attributed to the step. The `-p "/compact"` probe produced no usage record at all (see §7.1).
+++
+++## 6. Knob audit for one-process-per-turn (`-p`) factory sessions
+++
+++Effective values observed with `omp config list --json` / `--scope global` on this host (omp 18.18.5): `providers.cacheRetention=short`, `providers.cacheWarming=streaming`, `provider.appendOnlyContext=auto`, `includeModelInPrompt=false`, `compaction.enabled=true`, `compaction.midTurnEnabled=true`, `compaction.methodOrder=[remote,snapcompact,handoff,shake,soft]`, `compaction.experimentalContextManagement=true`, `compaction.handoffSaveToDisk=true`, `compaction.modelThresholds={anthropic/claude-haiku-5-5: "f90000", vercel-ai-gateway/minimax/minimax-m3.1-flash: 800000}`, `mnemopi.autoRecall=true`, `mnemopi.autoRetain=true`, `memory.backend=mnemopi`, `memories.enabled=false`. Several differ from the omp docs defaults: `cacheRetention` docs `auto`, `cacheWarming` docs `idle`, `experimentalContextManagement` docs `false`, `handoffSaveToDisk` docs `false`; `--scope global` proves the host layer sets them. Factory overlay precedence is above project/global (`docs/settings.md:113-123`), so pinning in the generated overlay is effective.
+++
+++| Knob | Docs default | Effective here | Affects `-p` one-process-per-turn? | Action for M7 |
+++|---|---|---|---|---|
+++| `providers.cacheRetention` | `auto` | `short` (host) | **Yes** — per-process TTL/markers; a per-turn `--config` overlay can vary it | Pin per role: architect `long` (1h) for standby gaps <1h; `short` for multi-request tool-loop agents; `none` only for known single-request turns |
+++| `providers.cacheWarming` | `idle` | `streaming` (host) | `streaming` **yes** (intra-turn long tool executions); `idle` **no** (no idle scheduler in print sessions; process exits) | Pin `streaming`; do not rely on `idle`/standby warming |
+++| `provider.appendOnlyContext` | `auto` | `auto` | **Yes** — keeps system prompt + tool specs + append-only log for maximum prefix hits | Keep `auto`/`on`; do not disable |
+++| `includeModelInPrompt` | true in docs main; installed effective `false` | `false` | **Yes if true** — model name in the system prompt makes a model switch/fallback change the prefix | Pin `false` |
+++| `display.cacheMissMarker` | true | true | **No** — TUI display only | Use usage fields instead |
+++| `compaction.enabled` | true | true | **Yes** if the threshold is crossed inside a turn (mid-turn or post-turn) | Set explicit thresholds; do not rely on the default 15%/16k reserve (≈850k on a 1M window) |
+++| `compaction.midTurnEnabled` | true | true | **Yes** — can rewrite history between tool-loop requests; the likely auto path in a long factory turn | Keep as overflow safety but raise `thresholdTokens` so it does not fire on normal architect turns |
+++| `compaction.thresholdTokens` / `thresholdPercent` / `reserveTokens` | -1 / -1 / unset | same | **Yes** — trigger point | Pin an explicit architect budget; leave room for the next wave |
+++| `compaction.methodOrder` | remote, snapcompact, handoff, shake, soft | same | **Yes** if compaction fires | Prefer `handoff`/`soft`; avoid `snapcompact` for the architect (images lose prompt caching) |
+++| `compaction.asyncEnabled` | true | true | **Yes** near threshold — speculative side request inside a one-shot process | Keep or disable for deterministic cost; measure |
+++| `compaction.autoContinue` | true | true | **Yes** — post-threshold continuation request; needed so the step still yields | Keep `true`; `false` would end a headless run without the agent's answer |
+++| `compaction.keepRecentTokens` | 20,000 | 20,000 | **Yes** — size of retained tail after compaction | Tune to the architect brief size |
+++| `compaction.supersedeReads` / `dropUseless` | true / true | true / true | **Yes** — cache-aware pruning every turn; can still mutate history near the cache lookback | Keep defaults; audit if cacheRead drops unexpectedly |
+++| `compaction.idleEnabled` / `idleThresholdTokens` / `idleTimeoutSeconds` | false / 200,000 / 300 | same | **No** — idle maintenance is enabled only by the interactive TUI; SDK/RPC/print sessions do not enable it (`docs/sdk.md:278`) | Ignore for `-p`; do not build standby policy on it |
+++| `compaction.handoffSaveToDisk` | false (host true) | true | No direct cache effect; writes summary artifacts | Pin for determinism |
+++| `compaction.experimentalContextManagement` | false (host true) | true | **Potentially** — notes-backed rollover; requires `context_notes`/`new_context`/`read`/`grep` tools, otherwise legacy maintenance | Pin `false` unless deliberately opted in |
+++| `snapcompact.systemPrompt` | `none` | `none` | **Yes** — imaging system prompt text loses prompt caching for that text | Pin `none` |
+++| `snapcompact.toolResults` | false | false | **Maybe** — images of tool results; cache/vision trade-off | Pin `false` for architect |
+++| `compaction.remoteEndpoint` / `remoteStreamingV2Enabled` / `v2RetainedMessageBudget` | unset / true / 64,000 | same | **Yes** if remote compaction is used | Decide/pin; remote is a second compaction path to test |
+++| `compaction.modelThresholds` / `modelThresholdsEnabled` | per-model / true | host overrides | **Yes** — can trigger on a model unexpectedly | Audit/pin |
+++| `task.agentCompactionThresholdOverrides` | {} | {} | **No** for root factory turns (task/subagents only) | Ignore |
+++| `mnemopi.autoRecall` / `autoRetain` | true / true | true / true | **Yes** — first-turn effective system prompt changes; cross-session recall and cache loss | Pin `false` for deterministic factory agents (or opt in consciously with a recorded digest) |
+++| `memory.backend` | `mnemopi` | `mnemopi` | **Yes via autoRecall** | Keep but disable autoRecall/autoRetain, or choose `off` if no memory is wanted |
+++
+++## 7. Compaction vs fresh brief
+++
+++### 7.1 `-p` manual compaction is available (verified)
+++
+++A one-shot print invocation accepted the slash command:
+++
+++```bash
+++omp --cwd <cwd> --mode json --model opencode-go/deepseek-v4.1-flash:max \
+++  --session-dir <sd> --tools= --resume <session-id> -p "/compact"
+++```
+++
+++It emitted `manual_compaction_start` then `manual_compaction_end` with `result: { tokensBefore: 38053, firstKeptEntryId: …, summary, shortSummary, details }`; `tokensAfter: 6794` and `method: "soft"` live in the transcript `compaction` entry, not the NDJSON result. It printed `Compaction complete. Tokens: 36413 -> 6768 (saved 29645)` to stderr, persisted that `compaction` entry in the session JSONL, and exited 0. There was **no `turn_end`, no usage, and no `model_usage` entry** for the summarization request in NDJSON/transcript — compaction cost must be estimated from `tokensBefore`/summary length (or measured via `omp stats`/an RPC wrapper) if spec 20's cost defaults are to include it.
+++
+++RPC mode exposes a first-class `{ type: "compact", customInstructions? }` command and `manual_compaction_start/end` events (`docs/rpc.md:190-210`, `:970-987`); `{ type: "set_cache_warming", mode }` is also available there (`docs/rpc.md:197-210`).
+++
+++### 7.2 Cost analysis (architect on `anthropic/claude-opus-5-5`, catalog: input $4/M, cacheRead $0.20/M, cacheWrite $5/M)
+++
+++For a 38k-token history (same order as the compaction probe):
+++
+++| Strategy | What is paid | Approx cost |
+++|---|---|---|
+++| Direct cold resume | 38k × $4/M | **$0.152** |
+++| Compact **after** cache expiry, then resume | summarizer cold-reads 38k ($0.152) + summary output (~$0.01-0.02) + compacted prefix write 6.8k × $5/M ($0.034) + resumed turn | **≈$0.20-0.24** (worse than direct for one turn) |
+++| Compact **while warm** (at wave end, within TTL), then resume | summarizer cache-reads 38k × $0.20/M ($0.0076) + output (~$0.01-0.02) + compacted write $0.034 + resumed turn | **≈$0.06-0.09** (better) |
+++| Fresh architect brief | build B-token brief from records (e.g. B≈5k: $0.02 input / $0.025 write) + system-prompt prefix cacheRead (~$0.001) | **≈$0.02-0.03** at B=5k; still cheaper at B=20k (~$0.08-0.10) |
+++
+++Key correction to spec item 20(a): **compaction after the cache has already expired does not avoid re-paying the full history; the summarizer pays it once, then the resumed turn pays the compacted prefix again.** Compaction only pays if it runs while the prefix is still warm, or if the architect will have several future turns on the compacted history, or if the full history would overflow the window. For an already-cold resume, a deterministic fresh brief is the cheaper mechanism.
+++
+++### 7.3 Recommended mechanism
+++
+++1. **Warm** (no trigger): resume additively; do nothing.
+++2. **Cold + short history / one-shot consult**: resume uncached; optionally pass a per-turn overlay with `providers.cacheRetention: none` if the turn is known to make a single model request (multi-request tool loops still benefit from caching).
+++3. **Cold + long history + more turns expected**: start a **fresh architect session hydrated from records** (existing `hydrationContext`/`contextPack`/`waveReport` machinery in `step-runner.ts` and `steps/architect-resume`). This is bounded, deterministic, and still reuses the system-prompt prefix (4,224-token cross-session hit measured).
+++4. **Compact only while warm**, at a natural wave boundary, before the TTL expires: `omp -p --resume <id> "/compact"` (verified) or RPC `compact`. Use `handoff`/`soft`, not `snapcompact` for the architect. Record `tokensBefore/tokensAfter`; estimate cost.
+++5. **If already cold and continuity is mandatory** (the brief would lose critical conversational state): resume uncached and accept the full read; do not compact as well.
+++
+++## 8. Standby-warming viability
+++
+++- `providers.cacheWarming` values: `off`, `streaming`, `idle` (verified by invalid-value error; docs `docs/settings.md:1026`). Warming replays the last request with a one-token output budget shortly before expiry, only when the expected avoided-miss cost exceeds the refresh cost by at least **$0.05**. For Opus (input $4/M vs cacheRead $0.20/M, delta $3.8/M), the threshold is ≈**13.2k tokens** of prefix; an architect session above that qualifies economically.
+++- **`idle` warming cannot cover factory standby.** The interactive TUI owns idle work; “SDK, RPC and print sessions do not” enable idle maintenance (`docs/sdk.md:278`). `-p` exits at the end of the turn, so there is no process alive to replay the request between turns. `streaming` warming can still protect a long tool execution **inside** a turn — pin it.
+++- **The practical standby mechanism is `providers.cacheRetention: long`** (1h where supported). Verified `cttl: {ephemeral1h: N}`. It needs no live process. The cost is the cache write: catalog `cacheWrite` for Opus is $5/M (1.25× input); Anthropic bills 1h writes at a higher rate than 5m in the real API, and omp's single catalog `cacheWrite` value may under-estimate 1h writes — verify against provider billing before making it the default. A 1h tier pays if the architect's next turn lands >5m and <1h later; it does not cover >1h gaps.
+++- **Pre-warming immediately before a resume is never cheaper:** if the entry already expired, the warm request pays full input + cache write, then the resumed turn pays cache read; that is strictly more than the direct cold resume. Warm must happen *before* expiry to pay off.
+++- **Persistent RPC holder** (`omp --mode rpc`, `set_cache_warming idle`, `compact`) is the only true standby warming, but it reintroduces a long-lived process and session ownership across wave gaps. Defer as an optional M7 experiment; measure against long retention first.
+++
+++## 9. Recommendations for M7
+++
+++1. **Extend usage accounting** (`src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549`, `src/harness/omp/ndjson.ts:86-99`): add `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, `cacheTtl: {tier, tokens}`, `provider`, `api`, `model`, `reasoningTokens`; keep per-request rows (a turn can emit multiple `turn_end` usages) and aggregate. Include side-request `model_usage`/compaction cost where available.
+++2. **Add a per-session cache-state record** (meta or a sibling `session-cache.yaml`): resolved model (`provider/model` from `turn_end.message`), thinking suffix, ordered tools hash, system-prompt hash, cache retention, last request timestamp, last `cttl`, last `compaction` marker. Compare it on every resume.
+++3. **Stop silently switching models on resume:** record the resolved model used by the successful turn and pass that literal model on resume (or detect the mismatch and treat it as cold). Current resume unconditionally passes `@role` (`harness.ts:318-326`), so a role-map change or fallback recovery silently switches models and pays a full cold read.
+++4. **Pin effective omp settings in the generated overlay** (`overlay.ts:51-85`): `providers.cacheRetention` (per role/flow), `providers.cacheWarming: streaming`, `provider.appendOnlyContext: auto`, `includeModelInPrompt: false`, `snapcompact.systemPrompt: none`, `snapcompact.toolResults: false`, `compaction.experimentalContextManagement: false`, explicit `compaction.enabled/thresholdTokens/methodOrder/autoContinue`, and `mnemopi.autoRecall/autoRetain: false`. Overlay precedence beats host global/project config (`docs/settings.md:113-123`), but only if the keys are actually present.
+++5. **Validate effectively, not syntactically:** `omp --config <overlay> --version` exits 0 even for invalid YAML or an invalid `providers.cacheRetention` value (confirmed). Preflight’s current overlay check (`src/cli/preflight.ts:364-393`) is therefore a no-op. Read back effective values (`omp config get`, or a no-model probe) and/or perform a real throwaway turn before declaring config compatible. This confirms open concern `c-477404c672` and adds cache/compaction keys to its scope.
+++6. **Cold policy:** warm → resume; cold single-turn → resume (optionally `retention: none`); cold long-history → fresh brief; compact only while warm. Do not compact after expiry for a single resume.
+++7. **Byte stability:** keep system-prompt content byte-stable; make prompt filenames content-addressed (`prompt-<sha256>.txt`) so identical logical prompts produce identical `@file` wrappers/transcripts. The current timestamp+random path is cache-safe but not byte-reproducible.
+++8. **Disable ambient memory for deterministic agents** or explicitly include its digest: `mnemopi.autoRecall/autoRetain: false`; otherwise fresh sessions in a reused cwd inject prior task text into the system prompt (digest changes observed).
+++9. **Measure before defaults:** use `long` retention for architect standby gaps <1h, `short` for multi-request tool-loop agents, `none` only for single-request turns; keep the choice per role/flow and record the cost delta.
+++10. **Tests:** the scripted mock provider for item 19.8 should emit realistic `usage` rows with `cacheRead`, `cacheWrite`, `totalTokens`, `cttl`, and multiple `turn_end`s per turn, plus a synthetic session JSONL with `system-prompt-digest`, `model_change`, `thinking_level_change`, `compaction`, and `cttl` so cold detection is testable without paid models.
+++
+++## 10. Draft decision YAML
+++
+++```yaml
+++status: proposed
+++decision: |
+++  OMP prompt caching is content-keyed, not path-keyed. The cached prefix is composed of the
+++  system-prompt bytes, ordered tool specs, model/thinking identity, cache-retention tier, and
+++  conversation history; file paths and session ids are not hard key components. The factory's
+++  deterministic system-prompt path and unique per-turn prompt path are cache-safe; a changed
+++  system-prompt path with identical bytes still fully hits. Cold resume must be detected from
+++  content/config changes (system-prompt bytes, ordered tools, model, thinking level, cache
+++  retention) plus TTL expiry (usage.cttl + timestamp) and compaction markers, not from paths.
+++  For one-process-per-turn `-p` sessions, idle cache warming and idle compaction are unavailable;
+++  use `providers.cacheRetention: long` for architect standby gaps under 1h, pin streaming warming
+++  for intra-turn tool executions, and do not rely on omp's default host config (this host sets
+++  short/streaming/experimental values). For an already-cold architect resume, prefer a fresh
+++  brief hydrated from records over compaction; compaction only pays when performed while the
+++  cache is warm (at a wave boundary) or amortized over several future turns. Pin all relevant
+++  omp cache/compaction/memory keys in the generated overlay and record cacheRead/cacheWrite/
+++  totalTokens/cttl in step records so defaults can be measured.
+++evidence:
+++  - "Transport audit: harness.ts:286-350 writes a deterministic per-agent+session system prompt and a unique timestamp+random prompt file; argv differs only in -p @path; overlay bytes identical (sha256 6ebf5894...); system-prompt/prompt content identical across renders."
+++  - "Path invariance: DeepSeek resume with changed system-prompt path and identical bytes cacheRead=11,392 (input 86); Anthropic resume with changed path cacheRead=6,703 (input 4). New prompt path per turn cacheRead=10,752 (DeepSeek) and 29,363 (Anthropic)."
+++  - "Content invalidation: system prompt + newline cacheRead=0 (input 13,266); tools change cacheRead=2,432 of 4,480; thinking change cacheRead=0; model switch cacheRead=0 (cost 8.9x warm)."
+++  - "TTL: Anthropic short (5m) warm resume cacheRead=29,363, cost $0.001454; after 330s cacheRead=0, cacheWrite=38,022, cost $0.004767. Long retention emits cttl ephemeral1h; providers.cacheRetention enum is auto|short|long|none."
+++  - "Cross-session: new session, same system prompt/tools, cacheRead=4,224; session id is not a hard key."
+++  - "Compaction: `omp -p --resume <id> \"/compact\"` compacted 38,053 -> 6,794 tokens (method soft) with manual_compaction_start/end; no usage/cost in NDJSON or transcript. Docs: idle maintenance is TUI-only (docs/sdk.md:278); cacheWarming values off|streaming|idle, $0.05 avoided-miss gate (docs/settings.md:1026); idle compaction trade-off (docs/compaction.md:155-158)."
+++  - "Factory records: ndjson.ts:86-99 and 173-177 drop cacheRead/cacheWrite/totalTokens/cttl; Usage and StepUsage lack fields (types.ts:7-11, artifacts.ts:545-549)."
+++  - "Factory overlay: overlay.ts:51-85 pins no providers.cache*, compaction.*, snapcompact.*, mnemopi.autoRecall/autoRetain; host global config sets providers.cacheRetention=short, cacheWarming=streaming, compaction.experimentalContextManagement=true. `omp --config <invalid> --version` exits 0, so preflight.ts:364-393 does not validate the overlay."
+++followUps:
+++  - "M7: extend Usage/StepUsage and OmpNdjsonParser with cacheRead/cacheWrite/totalTokens/cttl/provider/model/reasoningTokens and per-request rows."
+++  - "M7: add a session cache-state record and pre-launch cold detector (system-prompt hash, ordered tools hash, resolved model, thinking, retention, cttl+timestamp, compaction marker)."
+++  - "M7: pass the recorded resolved model on resume instead of unconditionally @role; treat role-map changes as cold."
+++  - "M7: pin cache/compaction/mnemopi settings in the generated overlay; validate effective values in preflight with a real check, not `--version`."
+++  - "M7: measure long-vs-short retention and fresh-brief-vs-warm-compaction per role/flow on the self-host fire test; confirm Anthropic 1h write pricing against provider billing."
+++  - "M7: optional RPC holder experiment (set_cache_warming idle + compact) only if long retention does not cover the observed wave gaps."
+++  - "Add a mock-provider fixture with cache usage/cttl/session entries so cold-detection and cost defaults are testable without paid models."
+++```
+++
+++## 11. Open questions / follow-ups
+++
+++- Anthropic's real 1h cache-write price is higher than the 5m write price; omp's catalog exposes one `cacheWrite` value per model. The cost estimates in §7.2/§8 for `long` may be optimistic. Confirm on the provider bill before making `long` the default.
+++- DeepSeek reports no `cttl`/`cacheWrite`; its implicit cache has no observable TTL. Do not attempt TTL-based cold detection for such providers; use content/config fingerprints only.
+++- The `-p "/compact"` summarization cost is not in NDJSON or the transcript. If spec 20 requires measured compaction cost, add an RPC wrapper that captures the compaction response/usage, or estimate from `tokensBefore` and summary length.
+++- `mnemopi.autoRetain` can write completed factory turns into a per-cwd memory bank and affect later fresh sessions in the same worktree. Decide whether that is a feature (cross-run context) or a leak (task isolation); the factory's current overlay only disables the linking flags.
+++- `checkpoint.enabled: true` in the overlay mounts checkpoint tools; agents opt in via their tool lists. Not a cache issue, but part of the effective harness surface to audit.
+++
+++## Sources
+++
+++Repo (read-only audit):
+++- `plugins/software-factory/src/harness/omp/harness.ts:286-350` — system-prompt/prompt materialization, model candidates.
+++- `plugins/software-factory/src/harness/omp/harness.ts:368-389` — argv construction (`--system-prompt`, `-p @file`, `--resume`, tools).
+++- `plugins/software-factory/src/harness/omp/harness.ts:225-240` — overlay regeneration.
+++- `plugins/software-factory/src/harness/omp/overlay.ts:26-100` — overlay keys; no cache/compaction/memory-autoRecall pins.
+++- `plugins/software-factory/src/harness/omp/ndjson.ts:86-99,173-177` — usage fields dropped.
+++- `plugins/software-factory/src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549` — `Usage`/`StepUsage` lack cache fields.
+++- `plugins/software-factory/src/core/flows/step-runner.ts:534-547,620,817` — prompt rendering and `AgentRun` prompt.
+++- `plugins/software-factory/src/core/records/step-record.ts:96`; `src/harness/omp/harness.ts:521-522` — `traceRef` to session JSONL.
+++- `plugins/software-factory/src/cli/preflight.ts:364-393` — overlay validation via `omp --config … --version`.
+++- `plugins/software-factory/docs/OMP_ADAPTER.md:164-172` — prior cache-safety claims; line 168 previously marked path-vs-content keying unknown.
+++- `plugins/software-factory/docs/ARCHITECTURE.md:38` — one process per agent turn; `:40` — cache/compaction not built.
+++- `docs/factory.v2.md:114-120` — spec items 20(a)-(d).
+++
+++OMP docs (official):
+++- `https://omp.sh/docs/compaction` — compaction settings reference.
+++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/settings.md:113-123` — precedence (overlay beats project/global); `:926` — cache-segment invalidation signals; `:1025-1027` — cacheRetention/cacheWarming; `:468` — includeModelInPrompt.
+++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/models.md:465-504` — prompt-cache lifetimes (Anthropic 5m/1h; OAuth vs API key defaults).
+++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/sdk.md:278` — idle maintenance is TUI-only; SDK/RPC/print sessions do not enable it.
+++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/compaction.md:155-158` — idle-compaction/cache TTL trade-off; `:530` — experimental context management default false.
+++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/rpc.md:190-210,970-1037` — `compact`, `set_cache_warming`, `cache_warming_start/end`/`warmingStopReason`.
+++
+++## Appendix A: Probe log (commands and raw result locations)
+++
+++All live probes were run as `omp -p --mode json --max-cost 0.10` from throwaway dirs; per-turn NDJSON and stderr were captured under `/tmp/spike-cache-key-{live,ttl,invalidation,tools-thinking,digest,cross-session,anth-path,retention,preflight}` (exception: the long/none retention probes in §3.3 saved only YAML results — no NDJSON/transcript was archived for them). The transport shim captured argv/system-prompt/prompt under `/tmp/spike-cache-key-0c1ojol5/capture/{fresh-1,fresh-2,resume-1,resume-2}`. The numbers in §3 are extracted from the `turn_end`/`message` usage rows in those files. Aggregate spend ≈ $0.05.
++diff --git a/plugins/software-factory/docs/spikes/omp-6-repo-rules.md b/plugins/software-factory/docs/spikes/omp-6-repo-rules.md
++new file mode 100644
++index 0000000..8c03096
++--- /dev/null
+++++ b/plugins/software-factory/docs/spikes/omp-6-repo-rules.md
++@@ -0,0 +1,128 @@
+++# Software-Factory v2: OMP Repo Rules & Injection Spike (M1)
+++
+++This report is empirical verification of how omp discovers repository rules and context files, how the factory's per-role prompts interact with that injection, and what the factory should do for the M1 `omp-workspaces` repo-rules requirement. Tested against `omp 18.18.5` on Linux x86_64 WSL2 with throwaway git fixtures and a local OpenAI-compatible mock provider. No paid models were used; no production files were changed.
+++
+++## 1. Verdicts
+++
+++### 1.1 Root omp sessions inject repo rules automatically — **VERIFIED**
+++
+++`omp --cwd <repo> --system-prompt <role-body>` still emits a trailing `<project-context>` footer with `<repo-rules>` and injects rules. `--system-prompt` replaces only block 0; it does not suppress context files, `RULES.md`, always-apply rules, or the rulebook listing.
+++
+++### 1.2 Current factory has no double injection — **VERIFIED**
+++
+++Factory roles are root omp processes; their `--system-prompt` contains only the agent definition body. Repo rule text is absent from all role/step prompt assets. Each active sentinel appeared exactly once in captured provider requests.
+++
+++### 1.3 Copying rules into role prompts double-injects — **VERIFIED**
+++
+++A role system prompt containing the same repo text produced 2 sentinel occurrences (block 0 + `<repo-rules>`). `--append-system-prompt` with the same text produced 2 (repo-rules + append). If M8 injects engine-rendered rules, it MUST disable omp discovery for that run.
+++
+++### 1.4 The spec's subagent premise is about scouts — **VERIFIED BY DOCS, NOT LIVE**
+++
+++oMP task subagents drop every context file named `AGENTS.md` by basename; they keep `RULES.md` and `contextFiles.extra`. Root role sessions do not drop AGENTS.md. The factory's architect/developer/qa/reviewer are root processes, so they already receive AGENTS.md. Scouts (`task`) do not; use RULES.md/extra/delegation context for them.
+++
+++### 1.5 Preflight overlay validation is a no-op — **VERIFIED (critical)**
+++
+++`omp --config <bad.yaml> --version` exits 0. The same overlay on a real turn fails with `Failed to parse config overlay`. The current preflight check (`preflight.ts:364-393`) proves the binary exists, not that the overlay is valid.
+++
+++### 1.6 No-paid-model mock provider is feasible — **VERIFIED**
+++
+++A throwaway `models.yml` custom provider (`api: openai-completions`, `apiKey` literal, `authHeader: true`) plus a local HTTP/SSE stub returned scripted responses and recorded exact request bodies. This is a viable basis for M8's scripted mock model provider.
+++
+++## 2. Source and precedence summary
+++
+++### 2.1 Context files (`<repo-rules>`)
+++
+++| Source | Provider priority | Scope |
+++|---|---|---|
+++| `.omp/AGENTS.md` | native 100 | nearest non-empty `.omp` walking cwd→repo root; no farther fallback |
+++| `AGENTS.md` | agents-md 10 | every ancestor cwd→repo root (and enclosing workspace dirs under home) |
+++| `.claude/CLAUDE.md` | claude 80 | launch cwd only |
+++| `CLAUDE.md` | claude-md 10 | every ancestor cwd→repo root |
+++| `.agent/AGENTS.md`, `.agents/AGENTS.md` | agents 70 | ancestor walk; `.agent` wins same level |
+++| `.github/copilot-instructions.md` | github 30 | launch cwd only |
+++| `.gemini/GEMINI.md` | gemini 60 | launch cwd only |
+++| `contextFiles.extra` basenames | custom-context 9 | walk like AGENTS.md; additive; also user agent dir and primary checkout root in linked worktrees |
+++
+++One user context file survives by provider priority; one project file per depth; higher priority shadows at the same depth; different depths compose root→cwd (nearer last, more prominent). `contextFiles.extra` is additive and never takes the scope slot. Final injection is one `<repo-rules>` block in the trailing `<project-context>` footer, with absolute paths and expanded `@` imports.
+++
+++### 2.2 Rules
+++
+++| Source | Provider priority | Scope / bucket |
+++|---|---|---|
+++| `.omp/rules/*.{md,mdc}` | native 100 | `<cwd>/.omp/rules` only; always-apply / rulebook / TTSR |
+++| `<agent-dir>/rules/*` | native 100 | user; same buckets |
+++| `.omp/RULES.md` | native 100 sticky | nearest project `.omp`; forced always-apply (`RULES@project`) |
+++| `<agent-dir>/RULES.md` | native 100 sticky | user; forced always-apply (`RULES`) |
+++| `.cursor/rules/*.{mdc,md}` | cursor 50 | project `<cwd>/.cursor/rules`, user `~/.cursor/rules`; alwaysApply or rulebook |
+++| `.cursorrules` | — | **not observed in 18.18.5**; do not rely on it |
+++| `.windsurf/rules/*.md` | windsurf 50 | project; rules |
+++| `.clinerules` | cline 40 | nearest; rules |
+++| `.github/instructions/**/*.instructions.md` | github 30 | applyTo rules |
+++| plugin `rules/` | omp-plugins 90 | extension packages |
+++
+++Rules dedup by name: native > omp-plugins > agents > cursor/windsurf > cline > github > builtin. Bucket order: TTSR > alwaysApply (full content) > rulebook (description listing; body via `rule://`). `--no-rules` removes all of them; `--no-context-files` removes none.
+++
+++### 2.3 Settings layers
+++
+++Environment > runtime > `--config` overlays > project `.omp/config.yml` > global `<agent-dir>/config.yml` > default. Arrays replace; they do not merge. `disabledExtensions: [context-file:<level>:<basename>]` drops a single context file; `disabledProviders` removes a whole discovery source.
+++
+++## 3. Injection behavior
+++
+++- Context files: `<repo-rules>` in `<project-context>` footer; static system block comes first, so worktree-specific rules sit below the Anthropic cache breakpoint.
+++- Rules with default prompt: full always-apply content in `<generic-rules>`; conditional/described rules in `<domain-rules>` as name/description/globs pointers.
+++- Rules with `--system-prompt`: always-apply content is prepended to block 0; rulebook renders as `<rules>` in block 0.
+++- `--system-prompt` suppresses discovered `SYSTEM.md` but **not** `APPEND_SYSTEM.md`, context files, or rules.
+++- `--no-context-files` disables context files only; `--no-rules` disables rules only; both are needed to disable both.
+++- Discovered `APPEND_SYSTEM.md` is appended even with both flags and a custom system prompt; explicit empty `--append-system-prompt=` suppresses it.
+++
+++## 4. Probe matrix (condensed)
+++
+++| Probe | Result |
+++|---|---|
+++| repo1 baseline (root AGENTS, CLAUDE, .claude/CLAUDE, .cursorrules, .cursor/rules always, .omp/RULES, AGENTS.local) | `<repo-rules>` = `.claude/CLAUDE.md`; rules = `RULES.md` + cursor always; root AGENTS/CLAUDE shadowed; `.cursorrules` absent |
+++| + `--system-prompt` | role text + rules in block 0; `<repo-rules>` still `.claude/CLAUDE.md` |
+++| + `--no-context-files` | no `<repo-rules>`; rules remain |
+++| + `--no-rules` | `<repo-rules>` remains; rules gone |
+++| + extra overlay `AGENTS.local.md` | `.claude/CLAUDE.md` + `AGENTS.local.md` |
+++| repo2 `.omp/AGENTS.md` + root AGENTS | `.omp/AGENTS.md` only; root shadowed |
+++| repo3 only AGENTS.md | `AGENTS.md` injected |
+++| repo4 only CLAUDE.md | `CLAUDE.md` injected |
+++| repo5 only `.cursorrules` | nothing, even with `read` |
+++| repo6 conditional `.mdc` | `<domain-rules>` listing only |
+++| repo7 always `.mdc` + `.cursorrules` | always body injected; `.cursorrules` absent |
+++| cwd `sub/` | root + sub AGENTS (root first); root `.omp/RULES.md`; root `.claude` not loaded |
+++| repo8 native rules + same-name cursor | native body wins; cursor body absent; conditional in `<domain-rules>` |
+++| cwd `sub/` of repo8 | root `.omp/rules` not loaded; root RULES still loaded |
+++| duplicate role prompt | sentinel count 2; with `--no-context-files` count 1 |
+++| duplicate append | sentinel count 2 |
+++| user AGENTS/RULES/SYSTEM/APPEND | all load; APPEND survives both disable flags; empty append suppresses |
+++| project config extra + overlay empty / disabledExtensions | project extra loads; overlay `[]` removes; disabled file drops while extra stays |
+++| resume after editing AGENTS.md | new system footer contains V2 only; history retained |
+++| preflight bad overlay + `--version` | exit 0; real turn parse error |
+++
+++## 5. Role hydration seams
+++
+++- `--system-prompt` = `agents/<role>.md` body (frontmatter stripped, shared partials resolved).
+++- `-p @<prompt>` = rendered `agents/steps/<step>.md` with prompt vars/schema.
+++- `--cwd` = task worktree for architect/plan-reviewer/PM/close-ups; item worktree for developer/qa/reviewer. That cwd is the omp discovery root.
+++- One shared `{runtimeDir}/omp-overlay.yaml`; currently no context/rules keys.
+++- Inherited `HOME`/agent dir means user-level `AGENTS.md`/`RULES.md`/`APPEND_SYSTEM.md` apply to every role.
+++
+++## 6. M8 plan
+++
+++1. Keep omp auto-discovery as the repo-rules injector for root roles; do not copy rule text into role definitions or step prompts.
+++2. Add a pipeline/overlay knob for `contextFiles.extra` (array of basenames) and, if needed, `disabledExtensions` for user-level contamination.
+++3. For rules that scouts must follow, use `.omp/RULES.md` or `contextFiles.extra`, or pass them in the `task` tool `context` field; AGENTS.md alone is invisible to scouts.
+++4. Add a mock-provider test harness that records request bodies; assert sentinel counts per role, precedence, flags, resume refresh, and cache-prefix stability.
+++5. Optionally run a cheap live probe where each role quotes sentinels; assert root roles see AGENTS and scouts do not (unless RULES/extra/context carries them).
+++6. If engine-side hydration is ever chosen, launch with `--no-context-files --no-rules --append-system-prompt=` and assert count == 1.
+++7. Replace preflight's `--config --version` with a real throwaway turn against the mock provider.
+++
+++## 7. Recommendations
+++
+++- **Use omp-native injection** (recommended): no double injection, no rule-text duplication, cache-friendly (rules in the trailing footer below the cache breakpoint).
+++- **Do not rely on `.cursorrules`** in omp 18.18.5; use `.cursor/rules/*.mdc` with `alwaysApply: true`.
+++- **Put hard repo rules in `.omp/RULES.md`** if scouts must see them; keep AGENTS.md for the broader root-session guidance.
+++- **Verify user-level prompt files** are intentional; suppress `APPEND_SYSTEM.md` with `--append-system-prompt=` for deterministic role prompts.
+++- **Pin/sync repo rules across worktrees** at item/wave creation if rule changes must be consistent.
+++- **Keep factory launches at worktree roots**: `.omp/rules` and `.claude/CLAUDE.md` are cwd-only, so launching a role from a subdirectory would silently miss the root copies.
++
++## Human involvement
++# Human involvement criteria
++
++Mode selects which ADR and concern decisions need a human decision. Everything
++else is either autonomous or digest-only; never block on items the table marks
++remarkable.
++
++## Blocking table (ADRs and concerns)
++
++| Mode | Blocking (needs human decision) | Remarkable (digest only) |
++| --- | --- | --- |
++| autonomous | high-severity ADRs/concerns still blocking after unblocked work | everything else |
++| principal | stack/layer, external interfaces, config shapes | internal choices |
++| detailed | external-interface changes and major internal interfaces | minor internals |
++
++## autonomous
++
++Block only explicit high-severity ADRs/concerns that remain after all unblocked
++work is finished. Do not stop for internal choices; record them as remarkable.
++
++## Open Concerns
++- id: c-552344216d
++  kind: blocker
++  severity: high
++  summary: Merge-path gates run without infra.setup in the child worktree; missing node_modules fails typecheck
++  affects:
++    - "19.2"
++    - wave-merge
++- id: c-f972360209
++  kind: tech-debt
++  severity: medium
++  summary: Merge redrive ignores retry-with-guidance (no execution path); guidance-only recovery cannot fix environmental gate failures
++  affects:
++    - redrive
++    - wave-merge
++- id: c-0647070832
++  kind: tech-debt
++  severity: high
++  summary: Child/merge worktrees still need infra.setup (bun install) before the bun test runner can collect tests; this worktree had no node_modules until installed manually
++  affects:
++    - target-red
++    - wave-merge
++- id: c-f415508eb1
++  kind: risk
++  severity: medium
++  summary: Gate runs that inherit the factory-runtime TMPDIR produce unrelated test failures
++  affects:
++    - gates
++    - wave-merge
++- id: rm-02fe59eb65
++  kind: remarkable
++  summary: Deterministic architect brief skeleton + cheap `@simpler` relevance judge (`brief.ts`)
++- id: rm-61c10c8318
++  kind: remarkable
++  summary: Schema-bound architect plan (`plan.schema.json`) with PM structuring item edits
++- id: rm-63922d9635
++  kind: remarkable
++  summary: Configure omp via a generated YAML overlay per turn
++- id: rm-ac427a6618
++  kind: remarkable
++  summary: "Engine-managed git worktrees (`git worktree add` + `omp --cwd`) rather than omp `isolated: true` subagent tasks"
++- id: rm-df9df7bd8a
++  kind: remarkable
++  summary: Epics run in-process as child tasks with an in-process `runTaskChild`
++- id: rm-565790e99d
++  kind: remarkable
++  summary: On-demand whole-tree derivation; no registry
++- id: rm-6344b013f9
++  kind: remarkable
++  summary: Additive optional cache fields; no record migration
++- id: rm-d5301c7af1
++  kind: remarkable
++  summary: Real-binary scripted-provider e2e; FakeHarness retained
++- id: rm-d7f1fc7cc4
++  kind: remarkable
++  summary: Four spikes + two foundation items in iteration 1; epics deferred to iteration 2
++
++
++- Raise concerns with evidence; condense stale detail instead of repeating it.
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["approved","changes_requested"])
++- summary (string, required)
++- suggestions (array of object, required)
++  - id (string, required)
++  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async"])
++  - summary (string, required)
++  - detail (string, optional)
++  - location (object, optional)
++    - file (string, required)
++    - line (integer, optional)
++- remarkable (array of object, optional): Remarkable decisions or tradeoffs with the chosen option, alternatives, and why
++  - chosen (string, required)
++  - why (string, required)
++  - alternatives (array of string, required)
++- newConcerns (array of object, optional): New concerns discovered during review
++  - kind (string, required, enum: ["tech-debt","assumption","blocker","risk","question"])
++  - summary (string, required)
++  - detail (string, optional)
++  - severity (string, optional, enum: ["low","medium","high"])
++  - location (object, optional)
++    - file (string, required)
++    - line (integer, optional)
++  - affects (array of string, optional)
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..6ab2bfe
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 2
++name: qa
++attempt: 1
++fixRound: 1
++agent: qa
++role: alt-workhorse
++models:
++  - opencode-go/muse-spark-1.3-contributor
++  - opencode-go/deepseek-v4.1-flash
++timeoutSec: 5400
++status: ok
++startedAt: 2026-11-10T02:28:30.436Z
++session: 01a1c349-1cc2-739a-990e-2c1cce0ebd71
++endedAt: 2026-11-10T02:42:24.339Z
++usage:
++  inputTokens: 232949
++  outputTokens: 72636
++  costUsd: 0.051412
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-31-042Z_01a1c349-1cc2-739a-990e-2c1cce0ebd71.jsonl
+diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/output.yaml
+new file mode 100644
+index 0000000..8b98887
+--- /dev/null
++++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1/output.yaml
+@@ -0,0 +1,16 @@
++status: approved
++summary: "Docs-only recovery verified: 4 spike docs + RECOVERY.md with probe
++  evidence; zero src/test changes; typecheck green; sole test fail is
++  pre-existing baseline"
++suggestions:
++  - detail: checks.yaml records test gate status pass with 663 pass/2 skip/1 fail;
++      the 1 fail is the documented baseline-red disk-space test (state.yaml debt
++      entry; test file untouched by this diff, verified via merge-base numstat).
++      No item action required; engine gate reporting tolerates the known
++      baseline.
++    disposition: optional
++    id: test-gate-baseline-reporting
++    location:
++      file: .factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1/checks.yaml
++      line: 1
++    summary: Test gate pass coexists with 1 documented baseline failure
+diff --git a/.factory/tasks/omp-workspaces/journal.ndjson b/.factory/tasks/omp-workspaces/journal.ndjson
+index 3242c40..bd0bfd0 100644
+--- a/.factory/tasks/omp-workspaces/journal.ndjson
++++ b/.factory/tasks/omp-workspaces/journal.ndjson
+@@ -179,53 +179,3 @@
+ {"type":"step_started","task":"omp-workspaces","step":"pm-amend-1-1","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces/.factory/tasks/omp-workspaces/runs/016-pm-amend-1-1-a1","ts":"2026-11-10T01:58:23.267Z"}
+ {"type":"step_timeout_armed","task":"omp-workspaces","step":"pm-amend-1-1","timeoutSec":2700,"ts":"2026-11-10T01:58:23.271Z"}
+ {"type":"step_finished","task":"omp-workspaces","step":"pm-amend-1-1","attempt":1,"status":"ok","sessionId":"01a1c32d-8867-7723-95d2-878ad3ce217f","usage":{"inputTokens":23942,"outputTokens":4443,"costUsd":0.003283},"ts":"2026-11-10T01:58:56.769Z"}
+-{"type":"wave_started","wave":2,"iteration":1,"ts":"2026-11-10T01:58:57.650Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--usage-cache-tokens/.factory/tasks/omp-workspaces/items/usage-cache-tokens/steps/001-test-first-r1-a1","ts":"2026-11-10T01:58:58.322Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","timeoutSec":5400,"ts":"2026-11-10T01:58:58.327Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--transport-byte-stability/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/001-develop-r1-a1","ts":"2026-11-10T01:58:58.394Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","timeoutSec":5400,"ts":"2026-11-10T01:58:58.401Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/001-test-first-r1-a1","ts":"2026-11-10T01:58:58.508Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","timeoutSec":5400,"ts":"2026-11-10T01:58:58.516Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/001-develop-r1-a1","ts":"2026-11-10T01:58:58.632Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","timeoutSec":5400,"ts":"2026-11-10T01:58:58.639Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"sizeBytes":10510823,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-852Z_01a1c32e-1224-72a4-b1e9-c14d90c8551d.jsonl","ts":"2026-11-10T02:05:21.946Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"toolCalls":110,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-852Z_01a1c32e-1224-72a4-b1e9-c14d90c8551d.jsonl","ts":"2026-11-10T02:05:21.946Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"usage-cache-tokens","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1c32e-1224-72a4-b1e9-c14d90c8551d","usage":{"inputTokens":115693,"outputTokens":43458,"costUsd":0.058962},"ts":"2026-11-10T02:05:24.330Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"sizeBytes":12075086,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-329Z_01a1c32e-1401-7277-bf9d-7bf38233f921.jsonl","ts":"2026-11-10T02:05:50.227Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"toolCalls":111,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-329Z_01a1c32e-1401-7277-bf9d-7bf38233f921.jsonl","ts":"2026-11-10T02:05:50.228Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:05:54.916Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:05:58.777Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"sizeBytes":5435764,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-58-869Z_01a1c32e-1235-7054-84d9-126190c40577.jsonl","ts":"2026-11-10T02:06:51.065Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:06:54.313Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:06:57.347Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"sizeBytes":5725555,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-097Z_01a1c32e-1319-71c5-8ba5-7d9366c17208.jsonl","ts":"2026-11-10T02:08:28.709Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"toolCalls":93,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T01-58-59-097Z_01a1c32e-1319-71c5-8ba5-7d9366c17208.jsonl","ts":"2026-11-10T02:08:28.709Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:08:31.055Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:08:33.409Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"method":"ask","ts":"2026-11-10T02:12:14.696Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"merge-setup-fix","step":"test-first","attempt":1,"status":"ok","sessionId":"01a1c32e-1319-71c5-8ba5-7d9366c17208","usage":{"inputTokens":204993,"outputTokens":50291,"costUsd":0.068727},"ts":"2026-11-10T02:12:17.328Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"method":"ask","ts":"2026-11-10T02:14:23.165Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"method":"ask","ts":"2026-11-10T02:20:04.945Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c32e-1401-7277-bf9d-7bf38233f921","usage":{"inputTokens":139228,"outputTokens":49219,"costUsd":0.071688},"ts":"2026-11-10T02:23:11.689Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"transport-byte-stability","step":"develop","attempt":1,"status":"ok","sessionId":"01a1c32e-1235-7054-84d9-126190c40577","usage":{"inputTokens":115418,"outputTokens":50352,"costUsd":0.060786},"ts":"2026-11-10T02:28:29.165Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"transport-byte-stability","step":"review","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--transport-byte-stability/.factory/tasks/omp-workspaces/items/transport-byte-stability/steps/002-review-r1-a1","ts":"2026-11-10T02:28:30.468Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"transport-byte-stability","step":"review","timeoutSec":3600,"ts":"2026-11-10T02:28:30.473Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--usage-cache-tokens/.factory/tasks/omp-workspaces/items/usage-cache-tokens/steps/002-develop-r1-a1","ts":"2026-11-10T02:28:30.505Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","timeoutSec":5400,"ts":"2026-11-10T02:28:30.510Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"spike-findings-recovery","step":"qa","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--spike-findings-recovery/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/002-qa-r1-a1","ts":"2026-11-10T02:28:30.543Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"spike-findings-recovery","step":"qa","timeoutSec":5400,"ts":"2026-11-10T02:28:30.563Z"}
+-{"type":"step_started","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":1,"recordDir":"/home/slava/aiexp/agentic-swarm.factory-wt/topic_omp-workspaces--merge-setup-fix/.factory/tasks/omp-workspaces/items/merge-setup-fix/steps/002-develop-r1-a1","ts":"2026-11-10T02:28:30.586Z"}
+-{"type":"step_timeout_armed","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","timeoutSec":5400,"ts":"2026-11-10T02:28:30.594Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:31:18.728Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:31:20.791Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","attempt":1,"sizeBytes":9642303,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-30-960Z_01a1c349-1c70-753b-80bd-f7b7bd4a284b","ts":"2026-11-10T02:35:11.187Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","attempt":1,"toolCalls":104,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-30-960Z_01a1c349-1c70-753b-80bd-f7b7bd4a284b","ts":"2026-11-10T02:35:11.187Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","from":"@simpler","to":"google-antigravity/gemini-3.8-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:35:13.343Z"}
+-{"type":"harness_model_fallback","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","from":"google-antigravity/gemini-3.8-flash","to":"opencode-go/deepseek-v4.1-flash","reason":"OMP complete failed with exit code 1: 24647 | ` + \"Then use /model to select a model.\");\n24648 |       }\n24649 |       const S = await xe(\"prompt:apiKey\", () => this.#m.getApiKey(h, this.sessionId));\n24650 |       if (!S && !await this.#y.applyMissingCredentialFallback(f.signal)) {\n24651 |         if (f.signal.aborted)\n24652 |         throw new Tc(`No API key found for ${h.provider}.\n                      ^\nerror: No API key found for google-antigravity.\n\nUse /login, set an API key environment variable, or create /home/slava/.omp/agent/agent.db\n      at #Xn (/$bunfs/root/chunks/cli-vn3by5pe.js:24652:15)\n      at async #Fo (/$bunfs/root/chunks/cli-vn3by5pe.js:24319:26)\n      at async #Ea (/$bunfs/root/chunks/cli-vn3by5pe.js:24163:30)\n      at async #$s (/$bunfs/root/chunks/cli-vn3by5pe.js:20905:28)","ts":"2026-11-10T02:35:16.197Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"merge-setup-fix","step":"develop","attempt":1,"status":"rejected","sessionId":"01a1c349-1ccd-7094-967b-f4e95a34a589","usage":{"inputTokens":65574,"outputTokens":18937,"costUsd":0.025037999999999998},"ts":"2026-11-10T02:35:24.503Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"qa","attempt":1,"sizeBytes":22491067,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-31-042Z_01a1c349-1cc2-739a-990e-2c1cce0ebd71.jsonl","ts":"2026-11-10T02:42:24.305Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"spike-findings-recovery","step":"qa","attempt":1,"toolCalls":145,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-31-042Z_01a1c349-1cc2-739a-990e-2c1cce0ebd71.jsonl","ts":"2026-11-10T02:42:24.306Z"}
+-{"type":"step_finished","task":"omp-workspaces","item":"spike-findings-recovery","step":"qa","attempt":1,"status":"ok","sessionId":"01a1c349-1cc2-739a-990e-2c1cce0ebd71","usage":{"inputTokens":232949,"outputTokens":72636,"costUsd":0.051412},"ts":"2026-11-10T02:42:24.388Z"}
+-{"type":"step_output_repaired","task":"omp-workspaces","item":"usage-cache-tokens","step":"develop","attempt":1,"method":"relaunch","ts":"2026-11-10T02:44:44.801Z"}
+-{"type":"step_transcript_size_warning","task":"omp-workspaces","item":"transport-byte-stability","step":"review","attempt":1,"sizeBytes":8808880,"thresholdBytes":5242880,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-30-938Z_01a1c349-1c5a-74ff-8fd7-583a79e8bffd","ts":"2026-11-10T02:46:53.214Z"}
+-{"type":"step_tool_call_warning","task":"omp-workspaces","item":"transport-byte-stability","step":"review","attempt":1,"toolCalls":96,"threshold":60,"traceRef":"/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-28-30-938Z_01a1c349-1c5a-74ff-8fd7-583a79e8bffd","ts":"2026-11-10T02:46:53.215Z"}
+diff --git a/.factory/tasks/omp-workspaces/state.yaml b/.factory/tasks/omp-workspaces/state.yaml
+index 8fa4fd9..0f64339 100644
+--- a/.factory/tasks/omp-workspaces/state.yaml
++++ b/.factory/tasks/omp-workspaces/state.yaml
+@@ -36,42 +36,24 @@ items:
+     fixRounds: 1
+     spendUsd: 0.11246700000000001
+     currentStep: review
+-  merge-setup-fix:
+-    kind: dev
+-    status: running
+-    branch: topic/omp-workspaces--merge-setup-fix
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0.09376499999999999
+-    currentStep: develop
+-  spike-findings-recovery:
+-    kind: no-behavior
+-    status: running
+-    branch: topic/omp-workspaces--spike-findings-recovery
+-    attempts: 1
+-    fixRounds: 1
+-    spendUsd: 0.1231
+-    currentStep: qa
+   transport-byte-stability:
+     kind: test-only
+-    status: running
++    status: pending
+     branch: topic/omp-workspaces--transport-byte-stability
+     attempts: 1
+     fixRounds: 1
+-    spendUsd: 0.060786
+-    currentStep: review
++    spendUsd: 0
+   usage-cache-tokens:
+     kind: dev
+-    status: running
++    status: pending
+     branch: topic/omp-workspaces--usage-cache-tokens
+     attempts: 1
+     fixRounds: 1
+-    spendUsd: 0.058962
+-    currentStep: develop
++    spendUsd: 0
+ concerns:
+-  open: 4
++  open: 24
+   dismissed: 1
+-  routed: 33
++  routed: 10
+   resolved: 0
+ debt:
+   - "Baseline red: test/disk-space.test.ts:57 expects 1 failing path, gets 2
+@@ -106,14 +88,8 @@ debt:
+     defaults"
+   - "[19.6] Saga launches do not exist and epic INTENT is not resolvable by
+     `factory run`"
+-  - "[19.3] Runtime dirs sessions/prompts/system-prompts grow without cleanup"
+-  - "[19.2] Hard-coded omp fallback path in preflight"
+   - "[spike-repo-rules] Cwd-scoped sources: `.omp/rules` and `.claude/CLAUDE.md`
+     are launch-directory-only"
+-  - "[spike-mock-provider] OmpHarness has no extension/extra-arg seam; mock
+-    provider needs a wrapper or new option"
+-  - "[19.1] spike-omp-isolation polish notes deferred to iteration-2 M3/M4
+-    planning"
+   - "[spike-cache-key] Findings cite nonexistent
+     plugins/software-factory/docs/factory.v2.md"
+   - "[spike-cache-key] 7.1 misattributes tokensAfter/method to NDJSON result"
+@@ -134,35 +110,25 @@ debt:
+   - "[spike-omp-isolation] Reconcile mock-provider negative with sibling spikes"
+   - "[spike-repo-rules] Preserve worktree-root cwd; .omp/rules +
+     .claude/CLAUDE.md are cwd-only"
+-  - "[spike-findings-recovery] Test gate pass coexists with 1 documented
+-    baseline failure"
+-budgetSpentUsd: 1.4348493999999996
++budgetSpentUsd: 1.0690054
+ spendByRole:
+   workhorse:
+-    costUsd: 1.1691564
+-    inputTokens: 2522036
+-    outputTokens: 904506
++    costUsd: 0.8839554
++    inputTokens: 1881130
++    outputTokens: 692249
+   alt-workhorse:
+-    costUsd: 0.14303600000000002
+-    inputTokens: 626723
+-    outputTokens: 255718
++    costUsd: 0.086165
++    inputTokens: 357804
++    outputTokens: 174090
+   architect:
+-    costUsd: 0.116293
+-    inputTokens: 664435
+-    outputTokens: 80172
++    costUsd: 0.09252099999999999
++    inputTokens: 606147
++    outputTokens: 59551
+   alt-architect:
+     costUsd: 0.006364
+     inputTokens: 28896
+     outputTokens: 15650
+ spendByItem:
+-  merge-setup-fix:
+-    costUsd: 0.09376499999999999
+-    inputTokens: 270567
+-    outputTokens: 69228
+-  transport-byte-stability:
+-    costUsd: 0.060786
+-    inputTokens: 115418
+-    outputTokens: 50352
+   spike-omp-isolation:
+     costUsd: 0.45245700000000005
+     inputTokens: 1135682
+@@ -175,20 +141,12 @@ spendByItem:
+     costUsd: 0.11246700000000001
+     inputTokens: 225196
+     outputTokens: 108718
+-  spike-findings-recovery:
+-    costUsd: 0.1231
+-    inputTokens: 372177
+-    outputTokens: 121855
+   spike-cache-key:
+     costUsd: 0.155598
+     inputTokens: 331901
+     outputTokens: 152018
+-  usage-cache-tokens:
+-    costUsd: 0.058962
+-    inputTokens: 115693
+-    outputTokens: 43458
+   (orchestration):
+-    costUsd: 0.2531174
+-    inputTokens: 1020097
+-    outputTokens: 193287
+-lastUpdated: 2026-11-10T02:42:24.972Z
++    costUsd: 0.22388639999999999
++    inputTokens: 925839
++    outputTokens: 163674
++lastUpdated: 2026-11-10T01:45:03.449Z
+diff --git a/plugins/software-factory/docs/spikes/omp-3-isolation.md b/plugins/software-factory/docs/spikes/omp-3-isolation.md
+new file mode 100644
+index 0000000..fcc0b75
+--- /dev/null
++++ b/plugins/software-factory/docs/spikes/omp-3-isolation.md
+@@ -0,0 +1,123 @@
++# Spike omp-3: omp isolation mechanics + backend decision
++
++- omp 18.18.5 (`omp/18.18.5`), WSL2 Linux, ext4 (no FICLONE)
++- Throwaway `--profile spk-*`; mktemp repos per run
++- Prior: omp-1-topology.md:189-215, omp-2-cli-adapter.md
++
++## 1. isolation.backend values
++
++`auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy` (default auto). `config set <enum> __invalid__` prints `Valid values: ...` and exits nonzero. Trial overlays set each value then ran `omp worktree add`: all rc=0, all fell back to plain checkout with FICLONE warning on ext4. Backend = clone mechanism only; verify with a round-trip.
++
++## 2. Retention matrix
++
++| Mechanism | Success | Fail | Abort (SIGKILL) |
++|---|---|---|---|
++| worktree add + --cwd | commit on topic branch; parent clean | staged partial retained | untracked partial + branch + registration retained |
++| isolated patch apply=false | .patch retained, parent clean | .patch preserved | — |
++| isolated branch apply=false | omp/task/<Agent> + commit | branch preserved with partial commit | total loss |
++| isolated branch apply=true | single-parent commit, branch deleted | failures preserve | — |
++
++Single-host scope: these retention results are from omp 18.18.5 on ext4/WSL2; treat abort/SIGKILL retention as host-specific until re-probed elsewhere.
++
++`commits=generic` → `<AgentId>`; `commits=ai` → `chore: add ...`. No `omp isolated-task` CLI; failing turns exit rc=0.
++
++## 3. Root-process mapping
++
++`worktree.onStart/onExit/cleanSource` and `/wt` are interactive-only. Factory root process: `omp worktree add -b <topic/*> <path> <base> -C <repo>` (OMP_WORKTREE_DIR) then `omp --cwd <path> -p`. `omp worktree list --json` lists in-base explicit-path worktrees when `OMP_WORKTREE_DIR` is aligned (kind `pr-checkout`); outside-base trees are invisible. `omp worktree clear --dry-run` correctly reports no orphans for live trees; `--all --dry-run` lists them. Status/gc use `git worktree list` + records.
++
++## 4. task.isolation vs engine merge
++
++omp apply/merge/commits are per-subagent capture preferences ending in a retained artifact or a single-parent auto-commit (no gates). Engine merge-path.ts adds merge locks, parent-into-child trial, integrate agent, gates/target-green, --no-ff merge, worktree removal with branch kept, hooks, journaling. Keep engine merges.
++
++## 5. Preflight
++
++Free: version ≥18.18.5; unknown-key oracle config get rc=1; enum oracle config set invalid; models find + modelRoles; repo state. Real turn: mktemp repo, one -p turn spawning isolated marker subagent apply:false, assert patch/branch artifact, cleanup. ~16s cheapest.
++
++## 6. Overlay gaps (c-477404c672)
++
++Bogus key → BADKEY_OK rc=0; invalid backend overlay is accepted, but `config get` ignores `--config` overlays so runtime coercion is unproven (probe 18 softened); missing overlay → --version succeeds. Current preflight.ts:364-394 validates nothing about content; replace with schema check + real turn.
++
++## 7. Decision
++
++isolation: omp by default (engine fallback kept): omp creates/clones worktrees and optionally captures subagent work; engine owns branches, merges, gates, commits, gc, records.
++
++## 8. Probe-command log
++
++Throwaway `--profile spk-*`, `mktemp`-isolated repos; paid turns on cheapest catalog model `alibaba-token-plan/deepseek-v4-flash-0731` (~10 turns).
++
++| # | Probe | Command (abridged) | Result |
++|---|-------|-------------------|--------|
++| 1 | version/help | `omp --version; omp --help` | `omp/18.18.5`; no `task`/`isolated-task` command |
++| 2 | schema | `omp config list --json` filtered | 9-value backend; task.isolation keys present |
++| 3 | fresh defaults | `config get <key>` ×10 | backend auto, enabled false, apply true, merge patch, commits generic, onStart off, onExit keep, clone true, base unset |
++| 4 | enum oracle | `config set <key> __invalid__` | backend 9 values; merge `patch,branch`; commits `generic,ai` |
++| 5 | backend trial ×9 | `config set isolation.backend $b` + `worktree add -b t-$b $BASE/wt-$b HEAD -C $R` | all rc=0, all FICLONE fallback to plain checkout, 9 branches/worktrees |
++| 6 | --cwd success | turn creates+commits `TURN_OK.txt` | `DONE`; wt log `1d958ca spike: turn ok`; parent untouched |
++| 7 | --cwd failure | stage `FAIL_PARTIAL.txt`, then eval-throw | process rc=**0** despite in-turn error; `A FAIL_PARTIAL.txt` retained; parent untouched |
++| 8 | --cwd SIGKILL | SIGKILL after `KILL_PARTIAL.txt` appears | `?? KILL_PARTIAL.txt` retained; branch+worktree registration intact |
++| 9 | isolated success patch | eval `agent(...,{isolated:true,apply:false})` | `Captured at .../omp-eval-agent-<id>/UpsetMongoose.patch (apply=false). Not applied.` |
++| 10 | isolated success branch | same, `merge=branch` | `omp/task/ParentalPelican` = `e10e903 ParentalPelican`; parent clean |
++| 11 | isolated failure branch | subagent stages file then throws `SUB_FAIL` | wait rejects BUT `Captured branch preserved as omp/task/PoliteOrangutan` with `ISO_FAIL.txt` |
++| 12 | isolated failure patch | creates file then throws `SUB_FAIL2` | `Captured patch preserved at .../RevolutionaryCentipede.patch` |
++| 13 | isolated success apply | `apply:true` | parent main gains single-parent `68e5586 DecentAnaconda`; branch deleted |
++| 14 | parent abort | SIGKILL parent during isolated `sleep 120` | no branch, file, or worktree entry; output lost |
++| 15 | commits=ai | branch capture with `commits=ai` | `chore: add iso_ai_msg.txt file` vs generic `<AgentId>` |
++| 16 | overlay accepted | `--config overlay.yml` + real turn | `OVERLAY_OK` rc=0 |
++| 17 | bogus overlay key | `task.isolation.noSuchKey: true` + real turn | silently ignored: `BADKEY_OK` rc=0 |
++| 18 | invalid backend overlay | `isolation.backend: __invalid__` | accepted by `--version`; **coercion unproven** — `config get` ignores `--config` overlays |
++| 19 | role resolution + | `--model @probe-role` + real turn | `ROLE_OK` rc=0 |
++| 20 | role resolution − | `--model @no-such-role-xyz` | `Model ... not found`, rc=1, no spend |
++| 21 | bogus model | `--model bogus-provider-xyz/...` | `Model ... not found`, rc=1, no spend |
++| 22 | catalog lookup | `models find deepseek-v4-pro --json` | free selector/provider/thinking metadata |
++| 23 | cheapest preflight | one `-p` turn spawning isolated marker subagent, `apply:false` | `PF_RESULT:...DustyBeetle.patch`, **15.6s**; bare no-op turn 5.2s |
++| 24 | onStart scope | `worktree.onStart=create` + `-p` turn | no worktree; stayed in `$R`, only main |
++| 25 | add w/o path | `omp worktree add -C $R` | `Error: Missing required argument: path` |
++| 26 | gc listing | `worktree list --json`, `clear --dry-run` | in-base explicit paths listed when `OMP_WORKTREE_DIR` aligned; outside-base invisible; live trees never reported as orphans |
++| 27 | bad key/missing overlay | `config get no.such.key`; `--config /tmp/missing --version` | unknown key rc=1; missing overlay silently ignored (18.18.5, rc=0) |
++
++Probe excerpts:
++
++```text
++$ omp --profile $P config set isolation.backend __invalid__
++Error: Invalid value: __invalid__. Valid values: auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy
++
++$ omp worktree add -b t-auto $BASE/wt-auto HEAD -C $R
++Preparing worktree (new branch 't-auto')
++HEAD is now at eb6c019 init
++warning: worktree clone fell back to plain checkout: git worktree add: FICLONE unsupported ... (os error 95)
++
++Isolation: changes captured on branch `omp/task/ParentalPelican` (apply=false). Not merged.
++Error: SUB_FAIL ... Captured branch preserved as omp/task/PoliteOrangutan.
++"Merged branch: omp/task/DecentAnaconda"   # parent 68e5586, single parent b9e032f
++```
++
++## 9. Draft isolation config surface
++
++```yaml
++workspaces:
++  isolation: omp              # omp | engine (default omp)
++  omp:
++    backend: auto             # isolation.backend enum (9 values)
++    worktreeClone: true       # worktree.clone (clone-first, fallback ok)
++    cleanSource: false        # worktree.cleanSource (interactive /wt only)
++    onStart: off              # informational: no effect on -p turns
++    onExit: keep              # informational: no effect on engine worktrees
++    baseDir: null             # worktree.base / OMP_WORKTREE_DIR; null = ~/.omp/wt
++    worktreeScope: repo       # session.worktreeScope
++    taskIsolation:
++      enabled: true           # gate for isolated:true subagents
++      apply: false            # engine merges; never auto-apply
++      merge: branch           # branch (auditable) | patch (lightweight)
++      commits: generic        # generic (agent-id stub); ai = harness-invented
++```
++
++Overlay additions (extends `overlay.ts:51-85`): `isolation: { backend: <workspaces.omp.backend> }` and `task: { isolation: { enabled, apply, merge, commits } }`. The overlay cannot express `worktree.*` path/base per run; pass `-C`/`--cwd`/`OMP_WORKTREE_DIR` instead.
++
++## 10. Recommendations / follow-ups
++
++- Implement `workspaces.isolation: omp|engine` plus the omp backend/worktree/task.isolation config surface above.
++- Replace the preflight `omp --config --version` check (`preflight.ts:364-394`) with key/enum/catalog validation and one real isolated round-trip turn (probe 23).
++- Classify turn outcome from the `--mode json` transcript, not process rc (probe 7).
++- Derive gc/status from `git worktree list` + records; document the omp `worktree list` blind spot for outside-base trees (probe 26).
++- Add cross-launch merge/lock coordination for the parallel-epic saga.
++- Add a scripted mock model provider for no-models e2e tests (see `omp-4-mock-provider.md`).
+diff --git a/plugins/software-factory/docs/spikes/omp-4-mock-provider.md b/plugins/software-factory/docs/spikes/omp-4-mock-provider.md
+new file mode 100644
+index 0000000..9cfe4d0
+--- /dev/null
++++ b/plugins/software-factory/docs/spikes/omp-4-mock-provider.md
+@@ -0,0 +1,133 @@
++# Spike: scripted mock provider seam for real omp (M1)
++
++Status: ok. Environment: omp/18.18.5 (`omp/18.18.5`), Bun 1.4.4, Linux x64 WSL2. Throwaway profiles and temp dirs; zero paid-model calls.
++
++## Verdict
++
++Chosen seam: an omp extension loaded with `-e/--extension` calls `pi.registerProvider('mock', { api: 'openai-completions', baseUrl: 'http://127.0.0.1:<ephemeral>/v1', apiKey: 'mock-key', models: [{ id: 'mock-chat', name: 'Mock Chat', api: 'openai-completions', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 }] })`, backed by a local OpenAI-compatible SSE server.
++
++Scenario format: `{turns: [...]}`; each turn is one assistant/model response (one HTTP POST):
++- `{text: '...'}` text, finish stop, ends the agent turn.
++- `{toolCalls: [{name, arguments}, ...]}` executes tools; next POST consumes next turn.
++- `{yield: {data: ...}}` emits terminal `yield`; observed no further provider request.
++Optional per-turn `usage`, `finishReason`; optional top-level `match`, `onExhausted`.
++
++Proven: catalog listing (`omp models -e ... --json` -> `mock/mock-chat`); real text turn; yield envelope; read->yield tool loop; two parallel tool calls; session resume; @role resolution via `--config` modelRoles; parallel processes; OmpHarness.run and complete.
++
++Ruled out: `--config` is a settings overlay, not a provider registry. `providers:` in `--config` was ignored; `omp models --config cfgprov.yml` did not list it. `models.yml` in a temp agent dir works (second choice).
++
++## Probe log
++
++P1 `omp --version` -> `omp/18.18.5`; help has `-e`, `--config`, `--profile`, `--mode json`, `--no-session`, `--tools`.
++P2 extension API: `typeof pi.registerProvider === 'function'`; `pi.pi` exposes `createAgentSession`, `runSubprocess`, `AgentSession`, `SessionManager`.
++P3 `omp --profile ... models -e mock-provider.ts --json` -> selector `mock/mock-chat`, kind chat, cost 0.
++P4 root-level `omp -e ... models` did not load the extension; place `-e` after `models`. Root-level `-e` works for `-p` sessions.
++P5 text turn: exit 0; text `MOCK_OK`; usage `input:123, output:6, totalTokens:129, cost.total:0`; `agent_end` `isTerminal:true, yielded:true`.
++P6 yield turn: exit 0; one POST; `tool_execution_start` args `{data:{status:'OK',count:42}}`; `tool_execution_end` result `details.data` identical; `turn_end` `stopReason:'toolUse'`; `agent_end`.
++P7 read then yield: 2 POSTs; second request includes `role:'tool'` result.
++P8 two reads in one response: 2 tool results then yield.
++P9 resume: first process text `TURN1_TEXT`; second `--resume <id>` sends `system,user,assistant,user`, prior text present; yield `{resumed:true}`.
++P10 parallel: two profiles/servers; both exit 0; one POST each.
++P11 role overlay `modelRoles: {probe: mock/mock-chat}` + `--model @probe` -> wire model `mock-chat`, exit 0.
++P12 SSE usage `prompt_tokens:100, cached_tokens:40, completion_tokens:5` -> usage `input:60, output:5, cacheRead:40, totalTokens:105`; cost computed from model rates.
++P13 OmpHarness.run with wrapper `exec omp -e ext "$@"` -> `ok:true`, data `{status:'OK',via:'OmpHarness'}`, usage 111/9, costUsd 0, toolCallCount 1.
++P14 OmpHarness.complete -> `{status:'OK',answer:42}`.
++P15 models.yml via `PI_CODING_AGENT_DIR=<tmp>` -> `fileprov/file-model`; named profile works when file is at `omp config path`; absolute `PI_CONFIG_DIR=/tmp/...` was resolved under `$HOME/tmp` in 18.18.5, so verify.
++P16 `--config` providers block ignored.
++P17 preflight no-op: `omp --config /tmp/no-such-overlay.yml --version` prints version and exits 0; real `omp --config <missing> -p ...` exits 1 `Config overlay not found`; `models --config <missing>` exits 1.
++
++## NDJSON contract (omp 18.18.5)
++
++`omp --mode json` emits one JSON object per line. Text turn sequence: `session`, `agent_start`, `turn_start`, user `message_start`/`message_end`, assistant `message_start` (usage zeros), `message_update` (`text_start`/`text_delta`/`text_end`), assistant `message_end` (real usage), `turn_end` (message + toolResults), `agent_end` (`messages`, `isTerminal:true`, `yielded:true`). Tool turn adds `tool_execution_start`/`tool_execution_end`, a `toolResult` message, and if non-terminal, another provider POST.
++
++Usage fields: `turn_end.message.usage` has `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens`, `cost.{input,output,cacheRead,cacheWrite,total}`. `message_start.usage` is zeroed. `cacheRead` comes from `prompt_tokens_details.cached_tokens`; `input` = `prompt_tokens - cached_tokens`; cost from model cost rates. `agent_end.yielded` is true even for text-only turns, so not a yield signal.
++
++Yield envelope: yield data appears in `turn_end.message.content[].toolCall.arguments.data`, `agent_end.messages[].content[].toolCall.arguments.data`, `tool_execution_start.args.data`, and `tool_execution_end.result.details.data` (parser `ndjson.ts:73-142`). Yield is terminal: one POST, no follow-up. Parser references: `src/harness/omp/ndjson.ts:52-150`.
++
++## Scenario format
++
++```jsonc
++{
++  'name': 'developer-writes-and-yields',
++  'match': { 'model': 'mock-chat', 'systemContains': 'Developer', 'promptContains': 'implement' },
++  'onExhausted': 'error',
++  'turns': [
++    { 'toolCalls': [{ 'name': 'write', 'arguments': { 'path': 'src/hello.ts', 'content': 'export const hello = 1;\n' } }], 'usage': { 'input': 1200, 'output': 40, 'cacheRead': 800 } },
++    { 'yield': { 'data': { 'status': 'done', 'summary': 'added hello' } }, 'usage': { 'input': 1500, 'output': 20, 'cacheRead': 1400 } }
++  ]
++}
++```
++
++Types: `UsageSpec` {input?,output?,cacheRead?,cacheWrite?,cost?}; `ToolCallSpec` {name,arguments,id?}; `Turn` = text | toolCalls | yield | error {status?,message}; `Scenario` {name?,match?,onExhausted?,turns}. Semantics: sequential per server; one POST per turn; toolCalls continue; yield terminates; text ends; `onExhausted` default error or repeatLast; `match` assertions fail with 500; resume cursor keyed by session id/label. Error turns optional, not probed.
++
++## M8 integration
++
++OmpHarness currently hard-codes args without `-e` (`harness.ts:368-388`, `:707-715`). Proven wrapper: `#!/bin/sh; exec /home/slava/.bun/bin/omp -e /tmp/mock-provider.ts "$@"` passed as `ompBinary`; both run and complete succeeded. Recommended: add `extraArgs`/`mockProvider` to OmpHarness. Proposed `test/e2e/mock-provider/{extension,server,scenario,runner}.ts`; gate with `FACTORY_E2E_OMP=1`, keep paid `FACTORY_LIVE_OMP=1` separate. Select scenario by `run.label` (like `FakeHarness.scriptOutcome`). Use per-test ephemeral port/profile or `PI_CODING_AGENT_DIR`, `--no-session`, `--no-extensions -e mock-ext`, explicit `mock/mock-chat`; assert request log only mock-chat and `usage.costUsd === 0`. The `test/e2e/` split keeps the no-model scripted suite separate from the paid `test/harness/smoke-live.test.ts` and matches the M8 plan's directional interface.
++
++## Recommendations
++
++- Adopt the extension `-e` + `pi.registerProvider` + local SSE seam as the canonical no-paid-model provider; keep `models.yml` in a temp agent dir as the fallback.
++- Add `extraArgs`/`mockProvider` to `OmpHarness` and implement the scripted suite under `test/e2e/mock-provider/`.
++- Gate the suite with `FACTORY_E2E_OMP=1`, keep paid live tests under `FACTORY_LIVE_OMP=1`, and assert zero-cost usage and mock-only request logs.
++- Replace the preflight `--config --version` check with a real mock turn and add an omp version floor.
++
++## Decision YAML
++
++```yaml
++status: accepted
++decision: >
++  Adopt the omp extension provider seam: per-process `-e mock-provider.ts` calls
++  `pi.registerProvider('mock', {... openai-completions ...})` against a local scripted SSE server.
++  Scenarios are `{turns: [{text}|{toolCalls}|{yield}]}`; one turn per provider request; toolCalls continue,
++  yield terminates. Use an OmpHarness wrapper now; add `extraArgs`/`mockProvider` in M8. Keep
++  `models.yml` in a temp agent dir as fallback; `--config` is only for settings/modelRoles.
++evidence:
++  - 'omp/18.18.5; omp models -e mock-provider.ts --json lists mock/mock-chat (P3).'
++  - 'Real text turn MOCK_OK, usage 123/6, cost.total 0 (P5).'
++  - 'Yield turn details.data {status:OK,count:42}, stopReason toolUse, agent_end (P6).'
++  - 'Tool loop and two parallel tool calls then yield (P7/P8).'
++  - 'Resume sees prior TURN1_TEXT and yields (P9).'
++  - 'OmpHarness.run and complete pass with mock wrapper, cost 0 (P13/P14).'
++  - 'Parallel profiles/servers both exit 0 (P10).'
++  - 'Preflight --config ... --version exits 0 with missing overlay (P17).'
++followUps:
++  - 'M8: add extraArgs/mockProvider; implement test/e2e/mock-provider.'
++  - 'M8: gate FACTORY_E2E_OMP=1; keep FACTORY_LIVE_OMP=1 separate.'
++  - 'Replace preflight --version overlay check with omp models --config or a real mock turn; add version floor.'
++  - 'Pin/minimum omp version; re-run spike on upgrade.'
++  - 'Persist scenario cursor by session id for resume/restart.'
++alternatives:
++  - 'models.yml custom provider (works; second choice).'
++  - '--config providers block (ignored).'
++  - 'Built-in Ollama/LM Studio (requires local runtime).'
++  - 'FakeHarness/mock binary (not real omp).'
++```
++
++## Risks / concern cross-check
++
++- Preflight overlay validation no-op confirmed (`c-477404c672`): `preflight.ts:383-385` uses `--version`; missing overlay exits 0; real session exits 1. High risk 19.1/19.2.
++- OmpHarness no extra-args seam: wrapper works but add `extraArgs`/`mockProvider`; medium, 19.8.
++- Flag placement: `-e`/`--config` after `models` for catalog; root-level for sessions.
++- `PI_CONFIG_DIR` absolute path resolved under `$HOME` in 18.18.5; use `PI_CODING_AGENT_DIR`/real profile and verify `omp config path`.
++- `agent_end.yielded` true for text-only; use yieldData.
++- `models.yml` works with temp `PI_CODING_AGENT_DIR`; named-profile caveat is path resolution.
++- `c-aaebfb4099` out of scope; parallel mock probing is safe but doesn't address epic lock/merge.
++- `c-ba416d7313` disproved: zero-paid real-omp mock path exists.
++
++## Sources
++
++- `docs/factory.v2.md:104-113`
++- `plugins/software-factory/docs/ARCHITECTURE.md:40`
++- `plugins/software-factory/src/cli/preflight.ts:365-394`
++- `plugins/software-factory/src/harness/omp/harness.ts:368-388`, `:525-570`, `:707-715`
++- `plugins/software-factory/src/harness/omp/ndjson.ts:52-150`
++- `plugins/software-factory/src/harness/omp/overlay.ts:26-86`
++- `plugins/software-factory/src/harness/fake/fake-harness.ts:8-51`
++- `plugins/software-factory/docs/spikes/omp-1-topology.md:55-104`
++- `plugins/software-factory/docs/spikes/omp-2-cli-adapter.md:41-110`
++- `plugins/software-factory/test/harness/smoke-live.test.ts:9-81`
++- https://omp.sh/docs/extensions
++- https://omp.sh/docs/models
++- https://omp.sh/docs/providers
++- https://omp.sh/docs/extension-loading
++- https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/tools/yield.ts
+diff --git a/plugins/software-factory/docs/spikes/omp-5-cache-keys.md b/plugins/software-factory/docs/spikes/omp-5-cache-keys.md
+new file mode 100644
+index 0000000..acc48fb
+--- /dev/null
++++ b/plugins/software-factory/docs/spikes/omp-5-cache-keys.md
+@@ -0,0 +1,308 @@
++# Spike: prompt-cache keying + compaction/warming audit
++
++Status: complete (M1 / `spike-cache-key`)
++Harness: `omp/18.18.5` on Linux x86_64 WSL2; factory checkout `plugins/software-factory`; live probes used throwaway `/tmp` dirs and throwaway session dirs (no production paths edited).
++
++## 0. Verdict (answers the M1 cache-key scenario)
++
++**OMP prompt caching is content-keyed, not path-keyed.**
++
++- A changed system-prompt *path* with byte-identical content still produced a full cache hit: DeepSeek `cacheRead=11,392` (T3 below); Anthropic `cacheRead=6,703` (A-T2 below).
++- A new prompt-file *path* on every turn did not break resumed-turn caching: Anthropic `cacheRead=29,363` on a resume whose prompt file path differed from the previous turn.
++- A one-byte system-prompt content change (appended newline) produced `cacheRead=0` (DeepSeek T3, `input=13,266`).
++- Tools change produced a partial miss (`cacheRead=2,432` of a prior `4,480`); thinking-level change and model switch produced full misses (`cacheRead=0`).
++- A 330-second gap on Anthropic `short` retention produced `cacheRead=0`, `cacheWrite=38,022` (cold).
++- A brand-new session with the same system prompt/tools reused the system-prompt prefix from the provider cache (`cacheRead=4,224`), so a fresh session is not inherently a full cold read.
++
++**Consequence for the factory:** the transport's random prompt filename is safe; the cached prefix is the system-prompt bytes + tool specs + model/thinking identity + conversation history. The real cold-resume triggers are: system-prompt content change, tools change, model/thinking change, cache-retention/TTL change/expiry, and compaction. The current factory does not detect any of these (see §5) and does not pin the knobs (see §6).
++
++## 1. Method
++
++- Transport audit (no model calls): ran `OmpHarness.run()` four times (fresh ×2, resume ×2) with `OMP_PATH` pointed at a throwaway shim that logged argv and copied the `--system-prompt`/`-p @file` inputs. Same rendered `steps/architect-resume` prompt, same `PipelineConfig`, same runtime dir, same synthetic session id. Note: `IMPLEMENTATION.md` flags the `steps/architect-resume` fragment as dead, but the harness mechanism is identical (`harness.ts:286-350,368-389`), so the byte diffs remain valid; re-run against a live fragment for the M2 baseline.
++- Live probes: real `omp -p --mode json` turns against `opencode-go/deepseek-v4.1-flash:max`, `opencode-go/muse-spark-1.3-contributor:max`, and `anthropic/claude-haiku-5-5:max`, using the factory's generated overlay plus the actual architect system prompt (`agents/architect.md` body). Unique `--session-dir`/`--cwd` per probe family under `/tmp`; `--max-cost 0.10` per turn. Aggregate live spend ≈ **$0.05**.
++- All probe dirs are throwaway (`/tmp/spike-cache-key-*`); no repo file was written.
++
++## 2. Transport render audit (byte/argv diff)
++
++Source under audit: `src/harness/omp/harness.ts:286-350` (prompt materialization), `src/harness/omp/harness.ts:368-389` (argv), `src/harness/omp/overlay.ts:26-100` (overlay).
++
++| Run pair | System-prompt bytes | System-prompt path | Prompt bytes | Prompt path | Argv |
++|---|---|---|---|---|---|
++| fresh-1 vs fresh-2 | identical, sha256 `cb92bbcaafd7bfa7b52413cc9a75cd58985c4e22b21b9984a60733a9f177c93a` | identical `.../system-prompts/architect-fresh.md` | identical, sha256 `4a9d87d474be6638f4c5b1bc4655622baa7566e9e91935bc12aa136c6cec6d88` | **different** `prompt-1794267999675-k2y1.txt` vs `prompt-1794267999746-1jly.txt` | identical except `-p @<path>` |
++| resume-1 vs resume-2 | identical | identical `.../system-prompts/architect-spike-session-fixed.md` | identical | **different** | identical except `-p @<path>` |
++| fresh vs resume | identical | **different** (`fresh` vs sanitized session id) | identical | different | resume adds `--resume spike-session-fixed` |
++| overlay generated twice | — | — | — | — | identical YAML, 1,472 bytes, sha256 `6ebf5894b6aaa2123b1cc3030555c3f5e61562751a2e332ef4b5d5b96e739f53` |
++
++Exact fresh argv (captured; resume adds `--resume spike-session-fixed` after `--session-dir`):
++
++```text
++--cwd /tmp/spike-cache-key-0c1ojol5/cwd
++--config /tmp/spike-cache-key-0c1ojol5/runtime/omp-overlay.yaml
++--mode json
++--model @architect
++--session-dir /tmp/spike-cache-key-0c1ojol5/runtime/sessions
++--tools=read,grep,glob
++--system-prompt /tmp/spike-cache-key-0c1ojol5/runtime/system-prompts/architect-fresh.md
++-p @/tmp/spike-cache-key-0c1ojol5/runtime/prompts/prompt-1794267999675-k2y1.txt
++```
++
++Findings:
++
++- System prompt is `extractAgentBody(run.definition)` written to `${agent}-${sessionKey}.md`; `sessionKey` is `fresh` or the sanitized resume id (`harness.ts:293-300`). Content is byte-stable per agent definition and path is deterministic per agent+session. The fresh→resume transition changes the path but not the bytes.
++- Prompt is written to `prompt-${Date.now()}-${random4}.txt` (`harness.ts:311-316`), so the path is unique every turn and the argv differs only there. Prompt **content** is byte-identical when the same fragment/vars are rendered.
++- Overlay is regenerated from the effective pipeline every run (`harness.ts:225-240`) and is byte-stable for identical config; it contains only `modelRoles`, `retry`, `eval`, `title`, `checkpoint`, `advisor`, `bash`, `mnemopi` (three linking flags), and `update` (`overlay.ts:51-85`). It pins **none** of `providers.cache*`, `compaction.*`, `snapcompact.*`, or `mnemopi.autoRecall/autoRetain`.
++- omp wraps the `@file` argument into the user message as `<file name="/abs/path">…</file>` (observed in `message_start`/`message_end` and the session JSONL). Therefore the *new* user message is not byte-identical when the same logical prompt is re-rendered to a different path. This does not break the prior cached prefix (the wrapper is appended at the end), but it means the transport is not byte-reproducible for retries. A content-addressed prompt filename (e.g. `prompt-<sha256>.txt`) would fix that; it is not required for cache hits.
++
++## 3. Live resume probe log
++
++All rows are `turn_end.message.usage`; `totalTokens = input + output + cacheRead + cacheWrite` in every observed row. `input` is *uncached* input (Anthropic reports `input=4` while writing/reading tens of thousands of cached tokens).
++
++### 3.1 Path / model / content probes (opencode-go DeepSeek, 1M context, implicit cache)
++
++| Probe | Input | cacheRead | cacheWrite | total | Cost USD | Interpretation |
++|---|---:|---:|---:|---:|---:|---|
++| D-T1 fresh (architect-resume prompt) | 9,060 + 478 + 1,515 | 0 + 8,960 + 9,344 | 0 | 9,318 / 9,717 / 11,390 | 0.001514 + 0.000266 + 0.000574 = **0.002354** | first request cold; intra-turn tool-loop requests cache |
++| D-T2 resume, same system-prompt path, new prompt path | 677 | 10,752 | 0 | 11,439 | **0.000140** | new prompt path is harmless |
++| D-T3 resume, **system-prompt path changed**, same bytes | 86 | 11,392 | 0 | 11,481 | **0.000049** | path is not in the key |
++| D-T4 resume, prompt path reused, content changed | 130 | 11,392 | 0 | 11,586 | **0.000092** | path reuse gives no extra hit; prior prefix still hits |
++| D-T5 resume, **model switched** to `opencode-go/muse-spark-1.3-contributor:max` | 11,082 | 0 | 0 | 11,775 | **0.001247** | model switch is a full cold read (≈8.9× D-T2) |
++
++### 3.2 Content / tools / thinking invalidations (clean 2-turn sessions, DeepSeek)
++
++| Scenario | T1 input | T2 input | T2 cacheRead | Result |
++|---|---:|---:|---:|---|
++| Control (same system prompt, same tools, same thinking) | 4,505 | 90 | 4,480 | near-full warm hit |
++| System prompt + one appended newline (same path) | 4,585 | 13,266 | 0 | full miss |
++| Tools `read,grep,glob` → `read,grep,glob,bash` | 4,585 | 2,719 | 2,432 | partial miss (tools are in the prefix) |
++| Thinking `:max` → `:high` (same model id) | 4,585 | 4,681 | 0 | full miss |
++
++Anthropic confirms path invariance: A-T1 fresh `input=4`, `cacheWrite=6,703`; A-T2 resume with a **different system-prompt path and identical bytes**: `input=4`, `cacheRead=6,703`, `cacheWrite=342`, cost $0.000143 (vs $0.00098 fresh).
++
++### 3.3 TTL expiry (Anthropic short/5m)
++
++| Turn | Input | cacheRead | cacheWrite | cttl | Cost USD |
++|---|---:|---:|---:|---|---:|
++| T1 fresh (2 requests) | 4 + 2 | 0 + 15,501 | 15,501 + 13,862 | `ephemeral5m` | 0.008491 + 0.006040 |
++| T2 resume ~1 min after T1 | 4 | 29,363 | 8,359 | `ephemeral5m` | **0.001454** |
++| T3 resume 330 s after T2 | 4 | **0** | **38,022** | `ephemeral5m` | **0.004767** |
++
++330 s is past the 300 s short TTL; the cold resume cost 3.3× the warm resume. Long retention was verified separately: `providers.cacheRetention: long` produced `cttl: {ephemeral1h: 6,705}`.
++
++`providers.cacheRetention: none` on a single fresh request produced `input=4,510`, `cacheRead=2,256`, `cacheWrite=24`, `cttl: {ephemeral5m: 24}` — i.e. omp stopped requesting explicit retention, but the provider still served an implicit cached prefix (the default base prompt) from an earlier identical request. `none` is therefore not a guarantee of zero cacheRead; it does reduce explicit write cost for single-request turns.
++
++### 3.4 Cross-session reuse
++
++A brand-new session in a new cwd with the same architect system prompt/tools/prompt shape produced `input=207`, `cacheRead=4,224`, `cacheWrite=0` — the system-prompt prefix was reused across session ids. Content, not session id, is the key (omp may still use session ids for provider routing affinity, but it is not a hard cache-key component for this provider).
++
++### 3.5 Memory-recall caveat (important)
++
++The session JSONL records `custom/system-prompt-digest` entries. With no recalled memories the digest of the same architect body was `a94d3680ec1c75cf` across different paths, cwds and session ids. With `mnemopi.autoRecall` returning a prior turn, the digest changed (`a89aabcb237da3c7`, `634c40b6e2f931de`) even though the agent body was unchanged; a one-newline body change produced `1a5712bb71b370ac`. Conclusion: the digest is a content hash of the **effective** system prompt including injected memory text (not path), and omp's ambient memory can change it. The factory overlay disables `polyphonicRecall`/`enhancedRecall`/`proactiveLinking` (`overlay.ts:77-81`) but leaves `mnemopi.autoRecall` and `mnemopi.autoRetain` at their default `true`. Recalled memories are injected only into the first turn of a session (observed once per session; docs: “Recall local memories into the first turn of each session”), so resumed turns are not re-polluted, but fresh sessions in a reused cwd are non-deterministic and can recall prior task text into the system prompt — losing the cross-session system-prompt cache hit and potentially leaking context between tasks that share a worktree.
++
++## 4. What the cache key covers
++
++**Content key (confirmed):** system-prompt bytes + tool specs (ordered) + model identity + thinking level + conversation history + cache retention markers/TTL. **Not in the key (confirmed):** system-prompt file path, prompt-file path, session id (for content reuse), file mtimes.
++
++Invalidation matrix:
++
++| Change | Observed effect |
++|---|---|
++| system-prompt path changed, bytes identical | full hit (DeepSeek 11,392; Anthropic 6,703) |
++| prompt path changed every turn | full hit on prior prefix (Anthropic 29,363) |
++| prompt path reused, content changed | no extra hit; prior prefix still hits (11,392) |
++| system-prompt +1 byte | full miss (0) |
++| tools order/content changed | partial/full miss; measured 2,432 of 4,480 retained |
++| thinking level changed | full miss (0) |
++| model switched | full miss (0), ~8.9× cost |
++| 5m TTL expired (330 s gap) | full miss (0), `cacheWrite` = 38,022 |
++| new session, same system prompt/tools | system-prompt prefix hit (4,224) |
++| compaction committed | prefix rewritten; next request cannot reuse the pre-compaction prefix |
++
++## 5. Cold-resume detection signals
++
++### 5.1 Pre-launch signals (engine can act before spending)
++
++Read from the session JSONL (the engine already has its path as `meta.yaml` `traceRef`, `src/core/records/step-record.ts:96`, produced at `harness.ts:521-522`):
++
++1. **`custom/system-prompt-digest`** — 16-hex digest of the effective system prompt. Compare the latest value to the engine's own hash of the current `agentBody`; content-only (path-independent), but includes omp-injected memory text (see §3.5).
++2. **`model_change`** — resolved `model` recorded at session start. Compare to the model the current `@role` resolves to. `@role` is re-resolved on every resume (`harness.ts:318-326`), so a pipeline/role/fallback change silently switches models.
++3. **`thinking_level_change`** — recorded level; compare to the current role suffix. A change is a full miss (measured).
++4. **`cttl` + last assistant timestamp** from the newest assistant message usage (`ephemeral5m`/`ephemeral1h`). Expiry = request-send time + TTL. The transcript timestamp is completion time, so subtract a conservative margin (seconds to tens of seconds).
++5. **`compaction` entry** after the last normal turn — history was rewritten; the next resume is cold from the cut point.
++6. **`credential_pin.hash`** (optional) — provider/account affinity changed; OpenAI-style `prompt_cache_key` affinity may be lost.
++7. **Ordered tools hash and cache-retention setting** — the session does not record these; the engine must store them in its own session-state record/meta and compare. Tools change is a partial miss (measured).
++
++### 5.2 Post-hoc signals (ground truth)
++
++- `turn_end.message.usage.cacheRead` == 0 on a resumed turn with prior history ⇒ miss; `cacheWrite` ≈ prompt size ⇒ cold write. `cacheWrite` is only populated by providers with explicit cache writes (Anthropic/Bedrock; DeepSeek reports 0).
++- `turn_end.message.usage.cttl` gives the tier and cached-token count (`{ephemeral5m: N}` / `{ephemeral1h: N}`); absent for DeepSeek implicit caching.
++- `turn_end.message` also carries `api`, `provider`, `model`, `reasoningTokens`, `totalTokens` — the factory currently discards all of them.
++- RPC/SDK expose `cache_warming_start` / `cache_warming_end` with `warmingStopReason` (`refresh missed the cache`, `refresh failed`, `conversation context changed`). `-p --mode json` would include these ordinary session events if warming runs; our probes did not trigger warming (see §7).
++- `display.cacheMissMarker` and the status-line `cache` segment are **UI-only**; no `cache_miss` event appeared in `-p` NDJSON. Do not build engine detection on them.
++
++### 5.3 Records gap (blocks spec 20's “measured defaults”)
++
++`OmpNdjsonParser` reads only `u.input`, `u.output`, and `u.cost.total` (`src/harness/omp/ndjson.ts:86-99`) and returns only `inputTokens`/`outputTokens`/`costUsd` (`ndjson.ts:173-177`). `Usage` (`src/harness/types.ts:7-11`) and `StepUsage` (`src/core/artifacts.ts:545-549`) have no cacheRead/cacheWrite/totalTokens/cttl/model fields. Consequently the records cannot answer “how many tokens did the cold resume re-pay?” today — only the total cost. Extend the types and parser before choosing cost-measured defaults.
++
++Also: side requests not tied to the agent turn (`model_usage` entries in the transcript with `purpose: "unexpected-stop"`, compaction summarization) are not attributed to the step. The `-p "/compact"` probe produced no usage record at all (see §7.1).
++
++## 6. Knob audit for one-process-per-turn (`-p`) factory sessions
++
++Effective values observed with `omp config list --json` / `--scope global` on this host (omp 18.18.5): `providers.cacheRetention=short`, `providers.cacheWarming=streaming`, `provider.appendOnlyContext=auto`, `includeModelInPrompt=false`, `compaction.enabled=true`, `compaction.midTurnEnabled=true`, `compaction.methodOrder=[remote,snapcompact,handoff,shake,soft]`, `compaction.experimentalContextManagement=true`, `compaction.handoffSaveToDisk=true`, `compaction.modelThresholds={anthropic/claude-haiku-5-5: "f90000", vercel-ai-gateway/minimax/minimax-m3.1-flash: 800000}`, `mnemopi.autoRecall=true`, `mnemopi.autoRetain=true`, `memory.backend=mnemopi`, `memories.enabled=false`. Several differ from the omp docs defaults: `cacheRetention` docs `auto`, `cacheWarming` docs `idle`, `experimentalContextManagement` docs `false`, `handoffSaveToDisk` docs `false`; `--scope global` proves the host layer sets them. Factory overlay precedence is above project/global (`docs/settings.md:113-123`), so pinning in the generated overlay is effective.
++
++| Knob | Docs default | Effective here | Affects `-p` one-process-per-turn? | Action for M7 |
++|---|---|---|---|---|
++| `providers.cacheRetention` | `auto` | `short` (host) | **Yes** — per-process TTL/markers; a per-turn `--config` overlay can vary it | Pin per role: architect `long` (1h) for standby gaps <1h; `short` for multi-request tool-loop agents; `none` only for known single-request turns |
++| `providers.cacheWarming` | `idle` | `streaming` (host) | `streaming` **yes** (intra-turn long tool executions); `idle` **no** (no idle scheduler in print sessions; process exits) | Pin `streaming`; do not rely on `idle`/standby warming |
++| `provider.appendOnlyContext` | `auto` | `auto` | **Yes** — keeps system prompt + tool specs + append-only log for maximum prefix hits | Keep `auto`/`on`; do not disable |
++| `includeModelInPrompt` | true in docs main; installed effective `false` | `false` | **Yes if true** — model name in the system prompt makes a model switch/fallback change the prefix | Pin `false` |
++| `display.cacheMissMarker` | true | true | **No** — TUI display only | Use usage fields instead |
++| `compaction.enabled` | true | true | **Yes** if the threshold is crossed inside a turn (mid-turn or post-turn) | Set explicit thresholds; do not rely on the default 15%/16k reserve (≈850k on a 1M window) |
++| `compaction.midTurnEnabled` | true | true | **Yes** — can rewrite history between tool-loop requests; the likely auto path in a long factory turn | Keep as overflow safety but raise `thresholdTokens` so it does not fire on normal architect turns |
++| `compaction.thresholdTokens` / `thresholdPercent` / `reserveTokens` | -1 / -1 / unset | same | **Yes** — trigger point | Pin an explicit architect budget; leave room for the next wave |
++| `compaction.methodOrder` | remote, snapcompact, handoff, shake, soft | same | **Yes** if compaction fires | Prefer `handoff`/`soft`; avoid `snapcompact` for the architect (images lose prompt caching) |
++| `compaction.asyncEnabled` | true | true | **Yes** near threshold — speculative side request inside a one-shot process | Keep or disable for deterministic cost; measure |
++| `compaction.autoContinue` | true | true | **Yes** — post-threshold continuation request; needed so the step still yields | Keep `true`; `false` would end a headless run without the agent's answer |
++| `compaction.keepRecentTokens` | 20,000 | 20,000 | **Yes** — size of retained tail after compaction | Tune to the architect brief size |
++| `compaction.supersedeReads` / `dropUseless` | true / true | true / true | **Yes** — cache-aware pruning every turn; can still mutate history near the cache lookback | Keep defaults; audit if cacheRead drops unexpectedly |
++| `compaction.idleEnabled` / `idleThresholdTokens` / `idleTimeoutSeconds` | false / 200,000 / 300 | same | **No** — idle maintenance is enabled only by the interactive TUI; SDK/RPC/print sessions do not enable it (`docs/sdk.md:278`) | Ignore for `-p`; do not build standby policy on it |
++| `compaction.handoffSaveToDisk` | false (host true) | true | No direct cache effect; writes summary artifacts | Pin for determinism |
++| `compaction.experimentalContextManagement` | false (host true) | true | **Potentially** — notes-backed rollover; requires `context_notes`/`new_context`/`read`/`grep` tools, otherwise legacy maintenance | Pin `false` unless deliberately opted in |
++| `snapcompact.systemPrompt` | `none` | `none` | **Yes** — imaging system prompt text loses prompt caching for that text | Pin `none` |
++| `snapcompact.toolResults` | false | false | **Maybe** — images of tool results; cache/vision trade-off | Pin `false` for architect |
++| `compaction.remoteEndpoint` / `remoteStreamingV2Enabled` / `v2RetainedMessageBudget` | unset / true / 64,000 | same | **Yes** if remote compaction is used | Decide/pin; remote is a second compaction path to test |
++| `compaction.modelThresholds` / `modelThresholdsEnabled` | per-model / true | host overrides | **Yes** — can trigger on a model unexpectedly | Audit/pin |
++| `task.agentCompactionThresholdOverrides` | {} | {} | **No** for root factory turns (task/subagents only) | Ignore |
++| `mnemopi.autoRecall` / `autoRetain` | true / true | true / true | **Yes** — first-turn effective system prompt changes; cross-session recall and cache loss | Pin `false` for deterministic factory agents (or opt in consciously with a recorded digest) |
++| `memory.backend` | `mnemopi` | `mnemopi` | **Yes via autoRecall** | Keep but disable autoRecall/autoRetain, or choose `off` if no memory is wanted |
++
++## 7. Compaction vs fresh brief
++
++### 7.1 `-p` manual compaction is available (verified)
++
++A one-shot print invocation accepted the slash command:
++
++```bash
++omp --cwd <cwd> --mode json --model opencode-go/deepseek-v4.1-flash:max \
++  --session-dir <sd> --tools= --resume <session-id> -p "/compact"
++```
++
++It emitted `manual_compaction_start` then `manual_compaction_end` with `result: { tokensBefore: 38053, firstKeptEntryId: …, summary, shortSummary, details }`; `tokensAfter: 6794` and `method: "soft"` live in the transcript `compaction` entry, not the NDJSON result. It printed `Compaction complete. Tokens: 36413 -> 6768 (saved 29645)` to stderr, persisted that `compaction` entry in the session JSONL, and exited 0. There was **no `turn_end`, no usage, and no `model_usage` entry** for the summarization request in NDJSON/transcript — compaction cost must be estimated from `tokensBefore`/summary length (or measured via `omp stats`/an RPC wrapper) if spec 20's cost defaults are to include it.
++
++RPC mode exposes a first-class `{ type: "compact", customInstructions? }` command and `manual_compaction_start/end` events (`docs/rpc.md:190-210`, `:970-987`); `{ type: "set_cache_warming", mode }` is also available there (`docs/rpc.md:197-210`).
++
++### 7.2 Cost analysis (architect on `anthropic/claude-opus-5-5`, catalog: input $4/M, cacheRead $0.20/M, cacheWrite $5/M)
++
++For a 38k-token history (same order as the compaction probe):
++
++| Strategy | What is paid | Approx cost |
++|---|---|---|
++| Direct cold resume | 38k × $4/M | **$0.152** |
++| Compact **after** cache expiry, then resume | summarizer cold-reads 38k ($0.152) + summary output (~$0.01-0.02) + compacted prefix write 6.8k × $5/M ($0.034) + resumed turn | **≈$0.20-0.24** (worse than direct for one turn) |
++| Compact **while warm** (at wave end, within TTL), then resume | summarizer cache-reads 38k × $0.20/M ($0.0076) + output (~$0.01-0.02) + compacted write $0.034 + resumed turn | **≈$0.06-0.09** (better) |
++| Fresh architect brief | build B-token brief from records (e.g. B≈5k: $0.02 input / $0.025 write) + system-prompt prefix cacheRead (~$0.001) | **≈$0.02-0.03** at B=5k; still cheaper at B=20k (~$0.08-0.10) |
++
++Key correction to spec item 20(a): **compaction after the cache has already expired does not avoid re-paying the full history; the summarizer pays it once, then the resumed turn pays the compacted prefix again.** Compaction only pays if it runs while the prefix is still warm, or if the architect will have several future turns on the compacted history, or if the full history would overflow the window. For an already-cold resume, a deterministic fresh brief is the cheaper mechanism.
++
++### 7.3 Recommended mechanism
++
++1. **Warm** (no trigger): resume additively; do nothing.
++2. **Cold + short history / one-shot consult**: resume uncached; optionally pass a per-turn overlay with `providers.cacheRetention: none` if the turn is known to make a single model request (multi-request tool loops still benefit from caching).
++3. **Cold + long history + more turns expected**: start a **fresh architect session hydrated from records** (existing `hydrationContext`/`contextPack`/`waveReport` machinery in `step-runner.ts` and `steps/architect-resume`). This is bounded, deterministic, and still reuses the system-prompt prefix (4,224-token cross-session hit measured).
++4. **Compact only while warm**, at a natural wave boundary, before the TTL expires: `omp -p --resume <id> "/compact"` (verified) or RPC `compact`. Use `handoff`/`soft`, not `snapcompact` for the architect. Record `tokensBefore/tokensAfter`; estimate cost.
++5. **If already cold and continuity is mandatory** (the brief would lose critical conversational state): resume uncached and accept the full read; do not compact as well.
++
++## 8. Standby-warming viability
++
++- `providers.cacheWarming` values: `off`, `streaming`, `idle` (verified by invalid-value error; docs `docs/settings.md:1026`). Warming replays the last request with a one-token output budget shortly before expiry, only when the expected avoided-miss cost exceeds the refresh cost by at least **$0.05**. For Opus (input $4/M vs cacheRead $0.20/M, delta $3.8/M), the threshold is ≈**13.2k tokens** of prefix; an architect session above that qualifies economically.
++- **`idle` warming cannot cover factory standby.** The interactive TUI owns idle work; “SDK, RPC and print sessions do not” enable idle maintenance (`docs/sdk.md:278`). `-p` exits at the end of the turn, so there is no process alive to replay the request between turns. `streaming` warming can still protect a long tool execution **inside** a turn — pin it.
++- **The practical standby mechanism is `providers.cacheRetention: long`** (1h where supported). Verified `cttl: {ephemeral1h: N}`. It needs no live process. The cost is the cache write: catalog `cacheWrite` for Opus is $5/M (1.25× input); Anthropic bills 1h writes at a higher rate than 5m in the real API, and omp's single catalog `cacheWrite` value may under-estimate 1h writes — verify against provider billing before making it the default. A 1h tier pays if the architect's next turn lands >5m and <1h later; it does not cover >1h gaps.
++- **Pre-warming immediately before a resume is never cheaper:** if the entry already expired, the warm request pays full input + cache write, then the resumed turn pays cache read; that is strictly more than the direct cold resume. Warm must happen *before* expiry to pay off.
++- **Persistent RPC holder** (`omp --mode rpc`, `set_cache_warming idle`, `compact`) is the only true standby warming, but it reintroduces a long-lived process and session ownership across wave gaps. Defer as an optional M7 experiment; measure against long retention first.
++
++## 9. Recommendations for M7
++
++1. **Extend usage accounting** (`src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549`, `src/harness/omp/ndjson.ts:86-99`): add `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, `cacheTtl: {tier, tokens}`, `provider`, `api`, `model`, `reasoningTokens`; keep per-request rows (a turn can emit multiple `turn_end` usages) and aggregate. Include side-request `model_usage`/compaction cost where available.
++2. **Add a per-session cache-state record** (meta or a sibling `session-cache.yaml`): resolved model (`provider/model` from `turn_end.message`), thinking suffix, ordered tools hash, system-prompt hash, cache retention, last request timestamp, last `cttl`, last `compaction` marker. Compare it on every resume.
++3. **Stop silently switching models on resume:** record the resolved model used by the successful turn and pass that literal model on resume (or detect the mismatch and treat it as cold). Current resume unconditionally passes `@role` (`harness.ts:318-326`), so a role-map change or fallback recovery silently switches models and pays a full cold read.
++4. **Pin effective omp settings in the generated overlay** (`overlay.ts:51-85`): `providers.cacheRetention` (per role/flow), `providers.cacheWarming: streaming`, `provider.appendOnlyContext: auto`, `includeModelInPrompt: false`, `snapcompact.systemPrompt: none`, `snapcompact.toolResults: false`, `compaction.experimentalContextManagement: false`, explicit `compaction.enabled/thresholdTokens/methodOrder/autoContinue`, and `mnemopi.autoRecall/autoRetain: false`. Overlay precedence beats host global/project config (`docs/settings.md:113-123`), but only if the keys are actually present.
++5. **Validate effectively, not syntactically:** `omp --config <overlay> --version` exits 0 even for invalid YAML or an invalid `providers.cacheRetention` value (confirmed). Preflight’s current overlay check (`src/cli/preflight.ts:364-393`) is therefore a no-op. Read back effective values (`omp config get`, or a no-model probe) and/or perform a real throwaway turn before declaring config compatible. This confirms open concern `c-477404c672` and adds cache/compaction keys to its scope.
++6. **Cold policy:** warm → resume; cold single-turn → resume (optionally `retention: none`); cold long-history → fresh brief; compact only while warm. Do not compact after expiry for a single resume.
++7. **Byte stability:** keep system-prompt content byte-stable; make prompt filenames content-addressed (`prompt-<sha256>.txt`) so identical logical prompts produce identical `@file` wrappers/transcripts. The current timestamp+random path is cache-safe but not byte-reproducible.
++8. **Disable ambient memory for deterministic agents** or explicitly include its digest: `mnemopi.autoRecall/autoRetain: false`; otherwise fresh sessions in a reused cwd inject prior task text into the system prompt (digest changes observed).
++9. **Measure before defaults:** use `long` retention for architect standby gaps <1h, `short` for multi-request tool-loop agents, `none` only for single-request turns; keep the choice per role/flow and record the cost delta.
++10. **Tests:** the scripted mock provider for item 19.8 should emit realistic `usage` rows with `cacheRead`, `cacheWrite`, `totalTokens`, `cttl`, and multiple `turn_end`s per turn, plus a synthetic session JSONL with `system-prompt-digest`, `model_change`, `thinking_level_change`, `compaction`, and `cttl` so cold detection is testable without paid models.
++
++## 10. Draft decision YAML
++
++```yaml
++status: proposed
++decision: |
++  OMP prompt caching is content-keyed, not path-keyed. The cached prefix is composed of the
++  system-prompt bytes, ordered tool specs, model/thinking identity, cache-retention tier, and
++  conversation history; file paths and session ids are not hard key components. The factory's
++  deterministic system-prompt path and unique per-turn prompt path are cache-safe; a changed
++  system-prompt path with identical bytes still fully hits. Cold resume must be detected from
++  content/config changes (system-prompt bytes, ordered tools, model, thinking level, cache
++  retention) plus TTL expiry (usage.cttl + timestamp) and compaction markers, not from paths.
++  For one-process-per-turn `-p` sessions, idle cache warming and idle compaction are unavailable;
++  use `providers.cacheRetention: long` for architect standby gaps under 1h, pin streaming warming
++  for intra-turn tool executions, and do not rely on omp's default host config (this host sets
++  short/streaming/experimental values). For an already-cold architect resume, prefer a fresh
++  brief hydrated from records over compaction; compaction only pays when performed while the
++  cache is warm (at a wave boundary) or amortized over several future turns. Pin all relevant
++  omp cache/compaction/memory keys in the generated overlay and record cacheRead/cacheWrite/
++  totalTokens/cttl in step records so defaults can be measured.
++evidence:
++  - "Transport audit: harness.ts:286-350 writes a deterministic per-agent+session system prompt and a unique timestamp+random prompt file; argv differs only in -p @path; overlay bytes identical (sha256 6ebf5894...); system-prompt/prompt content identical across renders."
++  - "Path invariance: DeepSeek resume with changed system-prompt path and identical bytes cacheRead=11,392 (input 86); Anthropic resume with changed path cacheRead=6,703 (input 4). New prompt path per turn cacheRead=10,752 (DeepSeek) and 29,363 (Anthropic)."
++  - "Content invalidation: system prompt + newline cacheRead=0 (input 13,266); tools change cacheRead=2,432 of 4,480; thinking change cacheRead=0; model switch cacheRead=0 (cost 8.9x warm)."
++  - "TTL: Anthropic short (5m) warm resume cacheRead=29,363, cost $0.001454; after 330s cacheRead=0, cacheWrite=38,022, cost $0.004767. Long retention emits cttl ephemeral1h; providers.cacheRetention enum is auto|short|long|none."
++  - "Cross-session: new session, same system prompt/tools, cacheRead=4,224; session id is not a hard key."
++  - "Compaction: `omp -p --resume <id> \"/compact\"` compacted 38,053 -> 6,794 tokens (method soft) with manual_compaction_start/end; no usage/cost in NDJSON or transcript. Docs: idle maintenance is TUI-only (docs/sdk.md:278); cacheWarming values off|streaming|idle, $0.05 avoided-miss gate (docs/settings.md:1026); idle compaction trade-off (docs/compaction.md:155-158)."
++  - "Factory records: ndjson.ts:86-99 and 173-177 drop cacheRead/cacheWrite/totalTokens/cttl; Usage and StepUsage lack fields (types.ts:7-11, artifacts.ts:545-549)."
++  - "Factory overlay: overlay.ts:51-85 pins no providers.cache*, compaction.*, snapcompact.*, mnemopi.autoRecall/autoRetain; host global config sets providers.cacheRetention=short, cacheWarming=streaming, compaction.experimentalContextManagement=true. `omp --config <invalid> --version` exits 0, so preflight.ts:364-393 does not validate the overlay."
++followUps:
++  - "M7: extend Usage/StepUsage and OmpNdjsonParser with cacheRead/cacheWrite/totalTokens/cttl/provider/model/reasoningTokens and per-request rows."
++  - "M7: add a session cache-state record and pre-launch cold detector (system-prompt hash, ordered tools hash, resolved model, thinking, retention, cttl+timestamp, compaction marker)."
++  - "M7: pass the recorded resolved model on resume instead of unconditionally @role; treat role-map changes as cold."
++  - "M7: pin cache/compaction/mnemopi settings in the generated overlay; validate effective values in preflight with a real check, not `--version`."
++  - "M7: measure long-vs-short retention and fresh-brief-vs-warm-compaction per role/flow on the self-host fire test; confirm Anthropic 1h write pricing against provider billing."
++  - "M7: optional RPC holder experiment (set_cache_warming idle + compact) only if long retention does not cover the observed wave gaps."
++  - "Add a mock-provider fixture with cache usage/cttl/session entries so cold-detection and cost defaults are testable without paid models."
++```
++
++## 11. Open questions / follow-ups
++
++- Anthropic's real 1h cache-write price is higher than the 5m write price; omp's catalog exposes one `cacheWrite` value per model. The cost estimates in §7.2/§8 for `long` may be optimistic. Confirm on the provider bill before making `long` the default.
++- DeepSeek reports no `cttl`/`cacheWrite`; its implicit cache has no observable TTL. Do not attempt TTL-based cold detection for such providers; use content/config fingerprints only.
++- The `-p "/compact"` summarization cost is not in NDJSON or the transcript. If spec 20 requires measured compaction cost, add an RPC wrapper that captures the compaction response/usage, or estimate from `tokensBefore` and summary length.
++- `mnemopi.autoRetain` can write completed factory turns into a per-cwd memory bank and affect later fresh sessions in the same worktree. Decide whether that is a feature (cross-run context) or a leak (task isolation); the factory's current overlay only disables the linking flags.
++- `checkpoint.enabled: true` in the overlay mounts checkpoint tools; agents opt in via their tool lists. Not a cache issue, but part of the effective harness surface to audit.
++
++## Sources
++
++Repo (read-only audit):
++- `plugins/software-factory/src/harness/omp/harness.ts:286-350` — system-prompt/prompt materialization, model candidates.
++- `plugins/software-factory/src/harness/omp/harness.ts:368-389` — argv construction (`--system-prompt`, `-p @file`, `--resume`, tools).
++- `plugins/software-factory/src/harness/omp/harness.ts:225-240` — overlay regeneration.
++- `plugins/software-factory/src/harness/omp/overlay.ts:26-100` — overlay keys; no cache/compaction/memory-autoRecall pins.
++- `plugins/software-factory/src/harness/omp/ndjson.ts:86-99,173-177` — usage fields dropped.
++- `plugins/software-factory/src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549` — `Usage`/`StepUsage` lack cache fields.
++- `plugins/software-factory/src/core/flows/step-runner.ts:534-547,620,817` — prompt rendering and `AgentRun` prompt.
++- `plugins/software-factory/src/core/records/step-record.ts:96`; `src/harness/omp/harness.ts:521-522` — `traceRef` to session JSONL.
++- `plugins/software-factory/src/cli/preflight.ts:364-393` — overlay validation via `omp --config … --version`.
++- `plugins/software-factory/docs/OMP_ADAPTER.md:164-172` — prior cache-safety claims; line 168 previously marked path-vs-content keying unknown.
++- `plugins/software-factory/docs/ARCHITECTURE.md:38` — one process per agent turn; `:40` — cache/compaction not built.
++- `docs/factory.v2.md:114-120` — spec items 20(a)-(d).
++
++OMP docs (official):
++- `https://omp.sh/docs/compaction` — compaction settings reference.
++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/settings.md:113-123` — precedence (overlay beats project/global); `:926` — cache-segment invalidation signals; `:1025-1027` — cacheRetention/cacheWarming; `:468` — includeModelInPrompt.
++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/models.md:465-504` — prompt-cache lifetimes (Anthropic 5m/1h; OAuth vs API key defaults).
++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/sdk.md:278` — idle maintenance is TUI-only; SDK/RPC/print sessions do not enable it.
++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/compaction.md:155-158` — idle-compaction/cache TTL trade-off; `:530` — experimental context management default false.
++- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/rpc.md:190-210,970-1037` — `compact`, `set_cache_warming`, `cache_warming_start/end`/`warmingStopReason`.
++
++## Appendix A: Probe log (commands and raw result locations)
++
++All live probes were run as `omp -p --mode json --max-cost 0.10` from throwaway dirs; per-turn NDJSON and stderr were captured under `/tmp/spike-cache-key-{live,ttl,invalidation,tools-thinking,digest,cross-session,anth-path,retention,preflight}` (exception: the long/none retention probes in §3.3 saved only YAML results — no NDJSON/transcript was archived for them). The transport shim captured argv/system-prompt/prompt under `/tmp/spike-cache-key-0c1ojol5/capture/{fresh-1,fresh-2,resume-1,resume-2}`. The numbers in §3 are extracted from the `turn_end`/`message` usage rows in those files. Aggregate spend ≈ $0.05.
+diff --git a/plugins/software-factory/docs/spikes/omp-6-repo-rules.md b/plugins/software-factory/docs/spikes/omp-6-repo-rules.md
+new file mode 100644
+index 0000000..8c03096
+--- /dev/null
++++ b/plugins/software-factory/docs/spikes/omp-6-repo-rules.md
+@@ -0,0 +1,128 @@
++# Software-Factory v2: OMP Repo Rules & Injection Spike (M1)
++
++This report is empirical verification of how omp discovers repository rules and context files, how the factory's per-role prompts interact with that injection, and what the factory should do for the M1 `omp-workspaces` repo-rules requirement. Tested against `omp 18.18.5` on Linux x86_64 WSL2 with throwaway git fixtures and a local OpenAI-compatible mock provider. No paid models were used; no production files were changed.
++
++## 1. Verdicts
++
++### 1.1 Root omp sessions inject repo rules automatically — **VERIFIED**
++
++`omp --cwd <repo> --system-prompt <role-body>` still emits a trailing `<project-context>` footer with `<repo-rules>` and injects rules. `--system-prompt` replaces only block 0; it does not suppress context files, `RULES.md`, always-apply rules, or the rulebook listing.
++
++### 1.2 Current factory has no double injection — **VERIFIED**
++
++Factory roles are root omp processes; their `--system-prompt` contains only the agent definition body. Repo rule text is absent from all role/step prompt assets. Each active sentinel appeared exactly once in captured provider requests.
++
++### 1.3 Copying rules into role prompts double-injects — **VERIFIED**
++
++A role system prompt containing the same repo text produced 2 sentinel occurrences (block 0 + `<repo-rules>`). `--append-system-prompt` with the same text produced 2 (repo-rules + append). If M8 injects engine-rendered rules, it MUST disable omp discovery for that run.
++
++### 1.4 The spec's subagent premise is about scouts — **VERIFIED BY DOCS, NOT LIVE**
++
++oMP task subagents drop every context file named `AGENTS.md` by basename; they keep `RULES.md` and `contextFiles.extra`. Root role sessions do not drop AGENTS.md. The factory's architect/developer/qa/reviewer are root processes, so they already receive AGENTS.md. Scouts (`task`) do not; use RULES.md/extra/delegation context for them.
++
++### 1.5 Preflight overlay validation is a no-op — **VERIFIED (critical)**
++
++`omp --config <bad.yaml> --version` exits 0. The same overlay on a real turn fails with `Failed to parse config overlay`. The current preflight check (`preflight.ts:364-393`) proves the binary exists, not that the overlay is valid.
++
++### 1.6 No-paid-model mock provider is feasible — **VERIFIED**
++
++A throwaway `models.yml` custom provider (`api: openai-completions`, `apiKey` literal, `authHeader: true`) plus a local HTTP/SSE stub returned scripted responses and recorded exact request bodies. This is a viable basis for M8's scripted mock model provider.
++
++## 2. Source and precedence summary
++
++### 2.1 Context files (`<repo-rules>`)
++
++| Source | Provider priority | Scope |
++|---|---|---|
++| `.omp/AGENTS.md` | native 100 | nearest non-empty `.omp` walking cwd→repo root; no farther fallback |
++| `AGENTS.md` | agents-md 10 | every ancestor cwd→repo root (and enclosing workspace dirs under home) |
++| `.claude/CLAUDE.md` | claude 80 | launch cwd only |
++| `CLAUDE.md` | claude-md 10 | every ancestor cwd→repo root |
++| `.agent/AGENTS.md`, `.agents/AGENTS.md` | agents 70 | ancestor walk; `.agent` wins same level |
++| `.github/copilot-instructions.md` | github 30 | launch cwd only |
++| `.gemini/GEMINI.md` | gemini 60 | launch cwd only |
++| `contextFiles.extra` basenames | custom-context 9 | walk like AGENTS.md; additive; also user agent dir and primary checkout root in linked worktrees |
++
++One user context file survives by provider priority; one project file per depth; higher priority shadows at the same depth; different depths compose root→cwd (nearer last, more prominent). `contextFiles.extra` is additive and never takes the scope slot. Final injection is one `<repo-rules>` block in the trailing `<project-context>` footer, with absolute paths and expanded `@` imports.
++
++### 2.2 Rules
++
++| Source | Provider priority | Scope / bucket |
++|---|---|---|
++| `.omp/rules/*.{md,mdc}` | native 100 | `<cwd>/.omp/rules` only; always-apply / rulebook / TTSR |
++| `<agent-dir>/rules/*` | native 100 | user; same buckets |
++| `.omp/RULES.md` | native 100 sticky | nearest project `.omp`; forced always-apply (`RULES@project`) |
++| `<agent-dir>/RULES.md` | native 100 sticky | user; forced always-apply (`RULES`) |
++| `.cursor/rules/*.{mdc,md}` | cursor 50 | project `<cwd>/.cursor/rules`, user `~/.cursor/rules`; alwaysApply or rulebook |
++| `.cursorrules` | — | **not observed in 18.18.5**; do not rely on it |
++| `.windsurf/rules/*.md` | windsurf 50 | project; rules |
++| `.clinerules` | cline 40 | nearest; rules |
++| `.github/instructions/**/*.instructions.md` | github 30 | applyTo rules |
++| plugin `rules/` | omp-plugins 90 | extension packages |
++
++Rules dedup by name: native > omp-plugins > agents > cursor/windsurf > cline > github > builtin. Bucket order: TTSR > alwaysApply (full content) > rulebook (description listing; body via `rule://`). `--no-rules` removes all of them; `--no-context-files` removes none.
++
++### 2.3 Settings layers
++
++Environment > runtime > `--config` overlays > project `.omp/config.yml` > global `<agent-dir>/config.yml` > default. Arrays replace; they do not merge. `disabledExtensions: [context-file:<level>:<basename>]` drops a single context file; `disabledProviders` removes a whole discovery source.
++
++## 3. Injection behavior
++
++- Context files: `<repo-rules>` in `<project-context>` footer; static system block comes first, so worktree-specific rules sit below the Anthropic cache breakpoint.
++- Rules with default prompt: full always-apply content in `<generic-rules>`; conditional/described rules in `<domain-rules>` as name/description/globs pointers.
++- Rules with `--system-prompt`: always-apply content is prepended to block 0; rulebook renders as `<rules>` in block 0.
++- `--system-prompt` suppresses discovered `SYSTEM.md` but **not** `APPEND_SYSTEM.md`, context files, or rules.
++- `--no-context-files` disables context files only; `--no-rules` disables rules only; both are needed to disable both.
++- Discovered `APPEND_SYSTEM.md` is appended even with both flags and a custom system prompt; explicit empty `--append-system-prompt=` suppresses it.
++
++## 4. Probe matrix (condensed)
++
++| Probe | Result |
++|---|---|
++| repo1 baseline (root AGENTS, CLAUDE, .claude/CLAUDE, .cursorrules, .cursor/rules always, .omp/RULES, AGENTS.local) | `<repo-rules>` = `.claude/CLAUDE.md`; rules = `RULES.md` + cursor always; root AGENTS/CLAUDE shadowed; `.cursorrules` absent |
++| + `--system-prompt` | role text + rules in block 0; `<repo-rules>` still `.claude/CLAUDE.md` |
++| + `--no-context-files` | no `<repo-rules>`; rules remain |
++| + `--no-rules` | `<repo-rules>` remains; rules gone |
++| + extra overlay `AGENTS.local.md` | `.claude/CLAUDE.md` + `AGENTS.local.md` |
++| repo2 `.omp/AGENTS.md` + root AGENTS | `.omp/AGENTS.md` only; root shadowed |
++| repo3 only AGENTS.md | `AGENTS.md` injected |
++| repo4 only CLAUDE.md | `CLAUDE.md` injected |
++| repo5 only `.cursorrules` | nothing, even with `read` |
++| repo6 conditional `.mdc` | `<domain-rules>` listing only |
++| repo7 always `.mdc` + `.cursorrules` | always body injected; `.cursorrules` absent |
++| cwd `sub/` | root + sub AGENTS (root first); root `.omp/RULES.md`; root `.claude` not loaded |
++| repo8 native rules + same-name cursor | native body wins; cursor body absent; conditional in `<domain-rules>` |
++| cwd `sub/` of repo8 | root `.omp/rules` not loaded; root RULES still loaded |
++| duplicate role prompt | sentinel count 2; with `--no-context-files` count 1 |
++| duplicate append | sentinel count 2 |
++| user AGENTS/RULES/SYSTEM/APPEND | all load; APPEND survives both disable flags; empty append suppresses |
++| project config extra + overlay empty / disabledExtensions | project extra loads; overlay `[]` removes; disabled file drops while extra stays |
++| resume after editing AGENTS.md | new system footer contains V2 only; history retained |
++| preflight bad overlay + `--version` | exit 0; real turn parse error |
++
++## 5. Role hydration seams
++
++- `--system-prompt` = `agents/<role>.md` body (frontmatter stripped, shared partials resolved).
++- `-p @<prompt>` = rendered `agents/steps/<step>.md` with prompt vars/schema.
++- `--cwd` = task worktree for architect/plan-reviewer/PM/close-ups; item worktree for developer/qa/reviewer. That cwd is the omp discovery root.
++- One shared `{runtimeDir}/omp-overlay.yaml`; currently no context/rules keys.
++- Inherited `HOME`/agent dir means user-level `AGENTS.md`/`RULES.md`/`APPEND_SYSTEM.md` apply to every role.
++
++## 6. M8 plan
++
++1. Keep omp auto-discovery as the repo-rules injector for root roles; do not copy rule text into role definitions or step prompts.
++2. Add a pipeline/overlay knob for `contextFiles.extra` (array of basenames) and, if needed, `disabledExtensions` for user-level contamination.
++3. For rules that scouts must follow, use `.omp/RULES.md` or `contextFiles.extra`, or pass them in the `task` tool `context` field; AGENTS.md alone is invisible to scouts.
++4. Add a mock-provider test harness that records request bodies; assert sentinel counts per role, precedence, flags, resume refresh, and cache-prefix stability.
++5. Optionally run a cheap live probe where each role quotes sentinels; assert root roles see AGENTS and scouts do not (unless RULES/extra/context carries them).
++6. If engine-side hydration is ever chosen, launch with `--no-context-files --no-rules --append-system-prompt=` and assert count == 1.
++7. Replace preflight's `--config --version` with a real throwaway turn against the mock provider.
++
++## 7. Recommendations
++
++- **Use omp-native injection** (recommended): no double injection, no rule-text duplication, cache-friendly (rules in the trailing footer below the cache breakpoint).
++- **Do not rely on `.cursorrules`** in omp 18.18.5; use `.cursor/rules/*.mdc` with `alwaysApply: true`.
++- **Put hard repo rules in `.omp/RULES.md`** if scouts must see them; keep AGENTS.md for the broader root-session guidance.
++- **Verify user-level prompt files** are intentional; suppress `APPEND_SYSTEM.md` with `--append-system-prompt=` for deterministic role prompts.
++- **Pin/sync repo rules across worktrees** at item/wave creation if rule changes must be consistent.
++- **Keep factory launches at worktree roots**: `.omp/rules` and `.claude/CLAUDE.md` are cwd-only, so launching a role from a subdirectory would silently miss the root copies.
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
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/003-review-r1-a1/meta.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/003-review-r1-a1/meta.yaml
new file mode 100644
index 0000000..681f683
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/003-review-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 3
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
+startedAt: 2026-11-10T02:52:15.800Z
+session: 01a1c35e-dc47-7421-b99b-9b4039009710
+endedAt: 2026-11-10T03:07:13.251Z
+usage:
+  inputTokens: 174557
+  outputTokens: 81945
+  costUsd: 0.051078
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-10T02-52-16-327Z_01a1c35e-dc47-7421-b99b-9b4039009710.jsonl
diff --git a/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/003-review-r1-a1/output.yaml b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/003-review-r1-a1/output.yaml
new file mode 100644
index 0000000..8e06c09
--- /dev/null
+++ b/.factory/tasks/omp-workspaces/items/spike-findings-recovery/steps/003-review-r1-a1/output.yaml
@@ -0,0 +1,13 @@
+status: approved
+summary: "Docs-only recovery approved: 4 spike docs + RECOVERY.md faithful to
+  approved sources; zero prod lines; no checkout or forbidden writes"
+suggestions:
+  - detail: Line 21 reads `oMP task subagents...`; verbatim from the approved source
+      draft so fidelity is intact, but `omp` capitalization matches repo idiom.
+      Non-blocking polish only.
+    disposition: optional
+    id: typo-omp-capitalization
+    location:
+      file: plugins/software-factory/docs/spikes/omp-6-repo-rules.md
+      line: 21
+    summary: Fix `oMP` capitalization typo in repo-rules doc
diff --git a/plugins/software-factory/docs/spikes/omp-3-isolation.md b/plugins/software-factory/docs/spikes/omp-3-isolation.md
new file mode 100644
index 0000000..fcc0b75
--- /dev/null
+++ b/plugins/software-factory/docs/spikes/omp-3-isolation.md
@@ -0,0 +1,123 @@
+# Spike omp-3: omp isolation mechanics + backend decision
+
+- omp 18.18.5 (`omp/18.18.5`), WSL2 Linux, ext4 (no FICLONE)
+- Throwaway `--profile spk-*`; mktemp repos per run
+- Prior: omp-1-topology.md:189-215, omp-2-cli-adapter.md
+
+## 1. isolation.backend values
+
+`auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy` (default auto). `config set <enum> __invalid__` prints `Valid values: ...` and exits nonzero. Trial overlays set each value then ran `omp worktree add`: all rc=0, all fell back to plain checkout with FICLONE warning on ext4. Backend = clone mechanism only; verify with a round-trip.
+
+## 2. Retention matrix
+
+| Mechanism | Success | Fail | Abort (SIGKILL) |
+|---|---|---|---|
+| worktree add + --cwd | commit on topic branch; parent clean | staged partial retained | untracked partial + branch + registration retained |
+| isolated patch apply=false | .patch retained, parent clean | .patch preserved | — |
+| isolated branch apply=false | omp/task/<Agent> + commit | branch preserved with partial commit | total loss |
+| isolated branch apply=true | single-parent commit, branch deleted | failures preserve | — |
+
+Single-host scope: these retention results are from omp 18.18.5 on ext4/WSL2; treat abort/SIGKILL retention as host-specific until re-probed elsewhere.
+
+`commits=generic` → `<AgentId>`; `commits=ai` → `chore: add ...`. No `omp isolated-task` CLI; failing turns exit rc=0.
+
+## 3. Root-process mapping
+
+`worktree.onStart/onExit/cleanSource` and `/wt` are interactive-only. Factory root process: `omp worktree add -b <topic/*> <path> <base> -C <repo>` (OMP_WORKTREE_DIR) then `omp --cwd <path> -p`. `omp worktree list --json` lists in-base explicit-path worktrees when `OMP_WORKTREE_DIR` is aligned (kind `pr-checkout`); outside-base trees are invisible. `omp worktree clear --dry-run` correctly reports no orphans for live trees; `--all --dry-run` lists them. Status/gc use `git worktree list` + records.
+
+## 4. task.isolation vs engine merge
+
+omp apply/merge/commits are per-subagent capture preferences ending in a retained artifact or a single-parent auto-commit (no gates). Engine merge-path.ts adds merge locks, parent-into-child trial, integrate agent, gates/target-green, --no-ff merge, worktree removal with branch kept, hooks, journaling. Keep engine merges.
+
+## 5. Preflight
+
+Free: version ≥18.18.5; unknown-key oracle config get rc=1; enum oracle config set invalid; models find + modelRoles; repo state. Real turn: mktemp repo, one -p turn spawning isolated marker subagent apply:false, assert patch/branch artifact, cleanup. ~16s cheapest.
+
+## 6. Overlay gaps (c-477404c672)
+
+Bogus key → BADKEY_OK rc=0; invalid backend overlay is accepted, but `config get` ignores `--config` overlays so runtime coercion is unproven (probe 18 softened); missing overlay → --version succeeds. Current preflight.ts:364-394 validates nothing about content; replace with schema check + real turn.
+
+## 7. Decision
+
+isolation: omp by default (engine fallback kept): omp creates/clones worktrees and optionally captures subagent work; engine owns branches, merges, gates, commits, gc, records.
+
+## 8. Probe-command log
+
+Throwaway `--profile spk-*`, `mktemp`-isolated repos; paid turns on cheapest catalog model `alibaba-token-plan/deepseek-v4-flash-0731` (~10 turns).
+
+| # | Probe | Command (abridged) | Result |
+|---|-------|-------------------|--------|
+| 1 | version/help | `omp --version; omp --help` | `omp/18.18.5`; no `task`/`isolated-task` command |
+| 2 | schema | `omp config list --json` filtered | 9-value backend; task.isolation keys present |
+| 3 | fresh defaults | `config get <key>` ×10 | backend auto, enabled false, apply true, merge patch, commits generic, onStart off, onExit keep, clone true, base unset |
+| 4 | enum oracle | `config set <key> __invalid__` | backend 9 values; merge `patch,branch`; commits `generic,ai` |
+| 5 | backend trial ×9 | `config set isolation.backend $b` + `worktree add -b t-$b $BASE/wt-$b HEAD -C $R` | all rc=0, all FICLONE fallback to plain checkout, 9 branches/worktrees |
+| 6 | --cwd success | turn creates+commits `TURN_OK.txt` | `DONE`; wt log `1d958ca spike: turn ok`; parent untouched |
+| 7 | --cwd failure | stage `FAIL_PARTIAL.txt`, then eval-throw | process rc=**0** despite in-turn error; `A FAIL_PARTIAL.txt` retained; parent untouched |
+| 8 | --cwd SIGKILL | SIGKILL after `KILL_PARTIAL.txt` appears | `?? KILL_PARTIAL.txt` retained; branch+worktree registration intact |
+| 9 | isolated success patch | eval `agent(...,{isolated:true,apply:false})` | `Captured at .../omp-eval-agent-<id>/UpsetMongoose.patch (apply=false). Not applied.` |
+| 10 | isolated success branch | same, `merge=branch` | `omp/task/ParentalPelican` = `e10e903 ParentalPelican`; parent clean |
+| 11 | isolated failure branch | subagent stages file then throws `SUB_FAIL` | wait rejects BUT `Captured branch preserved as omp/task/PoliteOrangutan` with `ISO_FAIL.txt` |
+| 12 | isolated failure patch | creates file then throws `SUB_FAIL2` | `Captured patch preserved at .../RevolutionaryCentipede.patch` |
+| 13 | isolated success apply | `apply:true` | parent main gains single-parent `68e5586 DecentAnaconda`; branch deleted |
+| 14 | parent abort | SIGKILL parent during isolated `sleep 120` | no branch, file, or worktree entry; output lost |
+| 15 | commits=ai | branch capture with `commits=ai` | `chore: add iso_ai_msg.txt file` vs generic `<AgentId>` |
+| 16 | overlay accepted | `--config overlay.yml` + real turn | `OVERLAY_OK` rc=0 |
+| 17 | bogus overlay key | `task.isolation.noSuchKey: true` + real turn | silently ignored: `BADKEY_OK` rc=0 |
+| 18 | invalid backend overlay | `isolation.backend: __invalid__` | accepted by `--version`; **coercion unproven** — `config get` ignores `--config` overlays |
+| 19 | role resolution + | `--model @probe-role` + real turn | `ROLE_OK` rc=0 |
+| 20 | role resolution − | `--model @no-such-role-xyz` | `Model ... not found`, rc=1, no spend |
+| 21 | bogus model | `--model bogus-provider-xyz/...` | `Model ... not found`, rc=1, no spend |
+| 22 | catalog lookup | `models find deepseek-v4-pro --json` | free selector/provider/thinking metadata |
+| 23 | cheapest preflight | one `-p` turn spawning isolated marker subagent, `apply:false` | `PF_RESULT:...DustyBeetle.patch`, **15.6s**; bare no-op turn 5.2s |
+| 24 | onStart scope | `worktree.onStart=create` + `-p` turn | no worktree; stayed in `$R`, only main |
+| 25 | add w/o path | `omp worktree add -C $R` | `Error: Missing required argument: path` |
+| 26 | gc listing | `worktree list --json`, `clear --dry-run` | in-base explicit paths listed when `OMP_WORKTREE_DIR` aligned; outside-base invisible; live trees never reported as orphans |
+| 27 | bad key/missing overlay | `config get no.such.key`; `--config /tmp/missing --version` | unknown key rc=1; missing overlay silently ignored (18.18.5, rc=0) |
+
+Probe excerpts:
+
+```text
+$ omp --profile $P config set isolation.backend __invalid__
+Error: Invalid value: __invalid__. Valid values: auto, apfs, btrfs, zfs, reflink, overlayfs, projfs, block-clone, rcopy
+
+$ omp worktree add -b t-auto $BASE/wt-auto HEAD -C $R
+Preparing worktree (new branch 't-auto')
+HEAD is now at eb6c019 init
+warning: worktree clone fell back to plain checkout: git worktree add: FICLONE unsupported ... (os error 95)
+
+Isolation: changes captured on branch `omp/task/ParentalPelican` (apply=false). Not merged.
+Error: SUB_FAIL ... Captured branch preserved as omp/task/PoliteOrangutan.
+"Merged branch: omp/task/DecentAnaconda"   # parent 68e5586, single parent b9e032f
+```
+
+## 9. Draft isolation config surface
+
+```yaml
+workspaces:
+  isolation: omp              # omp | engine (default omp)
+  omp:
+    backend: auto             # isolation.backend enum (9 values)
+    worktreeClone: true       # worktree.clone (clone-first, fallback ok)
+    cleanSource: false        # worktree.cleanSource (interactive /wt only)
+    onStart: off              # informational: no effect on -p turns
+    onExit: keep              # informational: no effect on engine worktrees
+    baseDir: null             # worktree.base / OMP_WORKTREE_DIR; null = ~/.omp/wt
+    worktreeScope: repo       # session.worktreeScope
+    taskIsolation:
+      enabled: true           # gate for isolated:true subagents
+      apply: false            # engine merges; never auto-apply
+      merge: branch           # branch (auditable) | patch (lightweight)
+      commits: generic        # generic (agent-id stub); ai = harness-invented
+```
+
+Overlay additions (extends `overlay.ts:51-85`): `isolation: { backend: <workspaces.omp.backend> }` and `task: { isolation: { enabled, apply, merge, commits } }`. The overlay cannot express `worktree.*` path/base per run; pass `-C`/`--cwd`/`OMP_WORKTREE_DIR` instead.
+
+## 10. Recommendations / follow-ups
+
+- Implement `workspaces.isolation: omp|engine` plus the omp backend/worktree/task.isolation config surface above.
+- Replace the preflight `omp --config --version` check (`preflight.ts:364-394`) with key/enum/catalog validation and one real isolated round-trip turn (probe 23).
+- Classify turn outcome from the `--mode json` transcript, not process rc (probe 7).
+- Derive gc/status from `git worktree list` + records; document the omp `worktree list` blind spot for outside-base trees (probe 26).
+- Add cross-launch merge/lock coordination for the parallel-epic saga.
+- Add a scripted mock model provider for no-models e2e tests (see `omp-4-mock-provider.md`).
diff --git a/plugins/software-factory/docs/spikes/omp-4-mock-provider.md b/plugins/software-factory/docs/spikes/omp-4-mock-provider.md
new file mode 100644
index 0000000..9cfe4d0
--- /dev/null
+++ b/plugins/software-factory/docs/spikes/omp-4-mock-provider.md
@@ -0,0 +1,133 @@
+# Spike: scripted mock provider seam for real omp (M1)
+
+Status: ok. Environment: omp/18.18.5 (`omp/18.18.5`), Bun 1.4.4, Linux x64 WSL2. Throwaway profiles and temp dirs; zero paid-model calls.
+
+## Verdict
+
+Chosen seam: an omp extension loaded with `-e/--extension` calls `pi.registerProvider('mock', { api: 'openai-completions', baseUrl: 'http://127.0.0.1:<ephemeral>/v1', apiKey: 'mock-key', models: [{ id: 'mock-chat', name: 'Mock Chat', api: 'openai-completions', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 8192 }] })`, backed by a local OpenAI-compatible SSE server.
+
+Scenario format: `{turns: [...]}`; each turn is one assistant/model response (one HTTP POST):
+- `{text: '...'}` text, finish stop, ends the agent turn.
+- `{toolCalls: [{name, arguments}, ...]}` executes tools; next POST consumes next turn.
+- `{yield: {data: ...}}` emits terminal `yield`; observed no further provider request.
+Optional per-turn `usage`, `finishReason`; optional top-level `match`, `onExhausted`.
+
+Proven: catalog listing (`omp models -e ... --json` -> `mock/mock-chat`); real text turn; yield envelope; read->yield tool loop; two parallel tool calls; session resume; @role resolution via `--config` modelRoles; parallel processes; OmpHarness.run and complete.
+
+Ruled out: `--config` is a settings overlay, not a provider registry. `providers:` in `--config` was ignored; `omp models --config cfgprov.yml` did not list it. `models.yml` in a temp agent dir works (second choice).
+
+## Probe log
+
+P1 `omp --version` -> `omp/18.18.5`; help has `-e`, `--config`, `--profile`, `--mode json`, `--no-session`, `--tools`.
+P2 extension API: `typeof pi.registerProvider === 'function'`; `pi.pi` exposes `createAgentSession`, `runSubprocess`, `AgentSession`, `SessionManager`.
+P3 `omp --profile ... models -e mock-provider.ts --json` -> selector `mock/mock-chat`, kind chat, cost 0.
+P4 root-level `omp -e ... models` did not load the extension; place `-e` after `models`. Root-level `-e` works for `-p` sessions.
+P5 text turn: exit 0; text `MOCK_OK`; usage `input:123, output:6, totalTokens:129, cost.total:0`; `agent_end` `isTerminal:true, yielded:true`.
+P6 yield turn: exit 0; one POST; `tool_execution_start` args `{data:{status:'OK',count:42}}`; `tool_execution_end` result `details.data` identical; `turn_end` `stopReason:'toolUse'`; `agent_end`.
+P7 read then yield: 2 POSTs; second request includes `role:'tool'` result.
+P8 two reads in one response: 2 tool results then yield.
+P9 resume: first process text `TURN1_TEXT`; second `--resume <id>` sends `system,user,assistant,user`, prior text present; yield `{resumed:true}`.
+P10 parallel: two profiles/servers; both exit 0; one POST each.
+P11 role overlay `modelRoles: {probe: mock/mock-chat}` + `--model @probe` -> wire model `mock-chat`, exit 0.
+P12 SSE usage `prompt_tokens:100, cached_tokens:40, completion_tokens:5` -> usage `input:60, output:5, cacheRead:40, totalTokens:105`; cost computed from model rates.
+P13 OmpHarness.run with wrapper `exec omp -e ext "$@"` -> `ok:true`, data `{status:'OK',via:'OmpHarness'}`, usage 111/9, costUsd 0, toolCallCount 1.
+P14 OmpHarness.complete -> `{status:'OK',answer:42}`.
+P15 models.yml via `PI_CODING_AGENT_DIR=<tmp>` -> `fileprov/file-model`; named profile works when file is at `omp config path`; absolute `PI_CONFIG_DIR=/tmp/...` was resolved under `$HOME/tmp` in 18.18.5, so verify.
+P16 `--config` providers block ignored.
+P17 preflight no-op: `omp --config /tmp/no-such-overlay.yml --version` prints version and exits 0; real `omp --config <missing> -p ...` exits 1 `Config overlay not found`; `models --config <missing>` exits 1.
+
+## NDJSON contract (omp 18.18.5)
+
+`omp --mode json` emits one JSON object per line. Text turn sequence: `session`, `agent_start`, `turn_start`, user `message_start`/`message_end`, assistant `message_start` (usage zeros), `message_update` (`text_start`/`text_delta`/`text_end`), assistant `message_end` (real usage), `turn_end` (message + toolResults), `agent_end` (`messages`, `isTerminal:true`, `yielded:true`). Tool turn adds `tool_execution_start`/`tool_execution_end`, a `toolResult` message, and if non-terminal, another provider POST.
+
+Usage fields: `turn_end.message.usage` has `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens`, `cost.{input,output,cacheRead,cacheWrite,total}`. `message_start.usage` is zeroed. `cacheRead` comes from `prompt_tokens_details.cached_tokens`; `input` = `prompt_tokens - cached_tokens`; cost from model cost rates. `agent_end.yielded` is true even for text-only turns, so not a yield signal.
+
+Yield envelope: yield data appears in `turn_end.message.content[].toolCall.arguments.data`, `agent_end.messages[].content[].toolCall.arguments.data`, `tool_execution_start.args.data`, and `tool_execution_end.result.details.data` (parser `ndjson.ts:73-142`). Yield is terminal: one POST, no follow-up. Parser references: `src/harness/omp/ndjson.ts:52-150`.
+
+## Scenario format
+
+```jsonc
+{
+  'name': 'developer-writes-and-yields',
+  'match': { 'model': 'mock-chat', 'systemContains': 'Developer', 'promptContains': 'implement' },
+  'onExhausted': 'error',
+  'turns': [
+    { 'toolCalls': [{ 'name': 'write', 'arguments': { 'path': 'src/hello.ts', 'content': 'export const hello = 1;\n' } }], 'usage': { 'input': 1200, 'output': 40, 'cacheRead': 800 } },
+    { 'yield': { 'data': { 'status': 'done', 'summary': 'added hello' } }, 'usage': { 'input': 1500, 'output': 20, 'cacheRead': 1400 } }
+  ]
+}
+```
+
+Types: `UsageSpec` {input?,output?,cacheRead?,cacheWrite?,cost?}; `ToolCallSpec` {name,arguments,id?}; `Turn` = text | toolCalls | yield | error {status?,message}; `Scenario` {name?,match?,onExhausted?,turns}. Semantics: sequential per server; one POST per turn; toolCalls continue; yield terminates; text ends; `onExhausted` default error or repeatLast; `match` assertions fail with 500; resume cursor keyed by session id/label. Error turns optional, not probed.
+
+## M8 integration
+
+OmpHarness currently hard-codes args without `-e` (`harness.ts:368-388`, `:707-715`). Proven wrapper: `#!/bin/sh; exec /home/slava/.bun/bin/omp -e /tmp/mock-provider.ts "$@"` passed as `ompBinary`; both run and complete succeeded. Recommended: add `extraArgs`/`mockProvider` to OmpHarness. Proposed `test/e2e/mock-provider/{extension,server,scenario,runner}.ts`; gate with `FACTORY_E2E_OMP=1`, keep paid `FACTORY_LIVE_OMP=1` separate. Select scenario by `run.label` (like `FakeHarness.scriptOutcome`). Use per-test ephemeral port/profile or `PI_CODING_AGENT_DIR`, `--no-session`, `--no-extensions -e mock-ext`, explicit `mock/mock-chat`; assert request log only mock-chat and `usage.costUsd === 0`. The `test/e2e/` split keeps the no-model scripted suite separate from the paid `test/harness/smoke-live.test.ts` and matches the M8 plan's directional interface.
+
+## Recommendations
+
+- Adopt the extension `-e` + `pi.registerProvider` + local SSE seam as the canonical no-paid-model provider; keep `models.yml` in a temp agent dir as the fallback.
+- Add `extraArgs`/`mockProvider` to `OmpHarness` and implement the scripted suite under `test/e2e/mock-provider/`.
+- Gate the suite with `FACTORY_E2E_OMP=1`, keep paid live tests under `FACTORY_LIVE_OMP=1`, and assert zero-cost usage and mock-only request logs.
+- Replace the preflight `--config --version` check with a real mock turn and add an omp version floor.
+
+## Decision YAML
+
+```yaml
+status: accepted
+decision: >
+  Adopt the omp extension provider seam: per-process `-e mock-provider.ts` calls
+  `pi.registerProvider('mock', {... openai-completions ...})` against a local scripted SSE server.
+  Scenarios are `{turns: [{text}|{toolCalls}|{yield}]}`; one turn per provider request; toolCalls continue,
+  yield terminates. Use an OmpHarness wrapper now; add `extraArgs`/`mockProvider` in M8. Keep
+  `models.yml` in a temp agent dir as fallback; `--config` is only for settings/modelRoles.
+evidence:
+  - 'omp/18.18.5; omp models -e mock-provider.ts --json lists mock/mock-chat (P3).'
+  - 'Real text turn MOCK_OK, usage 123/6, cost.total 0 (P5).'
+  - 'Yield turn details.data {status:OK,count:42}, stopReason toolUse, agent_end (P6).'
+  - 'Tool loop and two parallel tool calls then yield (P7/P8).'
+  - 'Resume sees prior TURN1_TEXT and yields (P9).'
+  - 'OmpHarness.run and complete pass with mock wrapper, cost 0 (P13/P14).'
+  - 'Parallel profiles/servers both exit 0 (P10).'
+  - 'Preflight --config ... --version exits 0 with missing overlay (P17).'
+followUps:
+  - 'M8: add extraArgs/mockProvider; implement test/e2e/mock-provider.'
+  - 'M8: gate FACTORY_E2E_OMP=1; keep FACTORY_LIVE_OMP=1 separate.'
+  - 'Replace preflight --version overlay check with omp models --config or a real mock turn; add version floor.'
+  - 'Pin/minimum omp version; re-run spike on upgrade.'
+  - 'Persist scenario cursor by session id for resume/restart.'
+alternatives:
+  - 'models.yml custom provider (works; second choice).'
+  - '--config providers block (ignored).'
+  - 'Built-in Ollama/LM Studio (requires local runtime).'
+  - 'FakeHarness/mock binary (not real omp).'
+```
+
+## Risks / concern cross-check
+
+- Preflight overlay validation no-op confirmed (`c-477404c672`): `preflight.ts:383-385` uses `--version`; missing overlay exits 0; real session exits 1. High risk 19.1/19.2.
+- OmpHarness no extra-args seam: wrapper works but add `extraArgs`/`mockProvider`; medium, 19.8.
+- Flag placement: `-e`/`--config` after `models` for catalog; root-level for sessions.
+- `PI_CONFIG_DIR` absolute path resolved under `$HOME` in 18.18.5; use `PI_CODING_AGENT_DIR`/real profile and verify `omp config path`.
+- `agent_end.yielded` true for text-only; use yieldData.
+- `models.yml` works with temp `PI_CODING_AGENT_DIR`; named-profile caveat is path resolution.
+- `c-aaebfb4099` out of scope; parallel mock probing is safe but doesn't address epic lock/merge.
+- `c-ba416d7313` disproved: zero-paid real-omp mock path exists.
+
+## Sources
+
+- `docs/factory.v2.md:104-113`
+- `plugins/software-factory/docs/ARCHITECTURE.md:40`
+- `plugins/software-factory/src/cli/preflight.ts:365-394`
+- `plugins/software-factory/src/harness/omp/harness.ts:368-388`, `:525-570`, `:707-715`
+- `plugins/software-factory/src/harness/omp/ndjson.ts:52-150`
+- `plugins/software-factory/src/harness/omp/overlay.ts:26-86`
+- `plugins/software-factory/src/harness/fake/fake-harness.ts:8-51`
+- `plugins/software-factory/docs/spikes/omp-1-topology.md:55-104`
+- `plugins/software-factory/docs/spikes/omp-2-cli-adapter.md:41-110`
+- `plugins/software-factory/test/harness/smoke-live.test.ts:9-81`
+- https://omp.sh/docs/extensions
+- https://omp.sh/docs/models
+- https://omp.sh/docs/providers
+- https://omp.sh/docs/extension-loading
+- https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/tools/yield.ts
diff --git a/plugins/software-factory/docs/spikes/omp-5-cache-keys.md b/plugins/software-factory/docs/spikes/omp-5-cache-keys.md
new file mode 100644
index 0000000..acc48fb
--- /dev/null
+++ b/plugins/software-factory/docs/spikes/omp-5-cache-keys.md
@@ -0,0 +1,308 @@
+# Spike: prompt-cache keying + compaction/warming audit
+
+Status: complete (M1 / `spike-cache-key`)
+Harness: `omp/18.18.5` on Linux x86_64 WSL2; factory checkout `plugins/software-factory`; live probes used throwaway `/tmp` dirs and throwaway session dirs (no production paths edited).
+
+## 0. Verdict (answers the M1 cache-key scenario)
+
+**OMP prompt caching is content-keyed, not path-keyed.**
+
+- A changed system-prompt *path* with byte-identical content still produced a full cache hit: DeepSeek `cacheRead=11,392` (T3 below); Anthropic `cacheRead=6,703` (A-T2 below).
+- A new prompt-file *path* on every turn did not break resumed-turn caching: Anthropic `cacheRead=29,363` on a resume whose prompt file path differed from the previous turn.
+- A one-byte system-prompt content change (appended newline) produced `cacheRead=0` (DeepSeek T3, `input=13,266`).
+- Tools change produced a partial miss (`cacheRead=2,432` of a prior `4,480`); thinking-level change and model switch produced full misses (`cacheRead=0`).
+- A 330-second gap on Anthropic `short` retention produced `cacheRead=0`, `cacheWrite=38,022` (cold).
+- A brand-new session with the same system prompt/tools reused the system-prompt prefix from the provider cache (`cacheRead=4,224`), so a fresh session is not inherently a full cold read.
+
+**Consequence for the factory:** the transport's random prompt filename is safe; the cached prefix is the system-prompt bytes + tool specs + model/thinking identity + conversation history. The real cold-resume triggers are: system-prompt content change, tools change, model/thinking change, cache-retention/TTL change/expiry, and compaction. The current factory does not detect any of these (see §5) and does not pin the knobs (see §6).
+
+## 1. Method
+
+- Transport audit (no model calls): ran `OmpHarness.run()` four times (fresh ×2, resume ×2) with `OMP_PATH` pointed at a throwaway shim that logged argv and copied the `--system-prompt`/`-p @file` inputs. Same rendered `steps/architect-resume` prompt, same `PipelineConfig`, same runtime dir, same synthetic session id. Note: `IMPLEMENTATION.md` flags the `steps/architect-resume` fragment as dead, but the harness mechanism is identical (`harness.ts:286-350,368-389`), so the byte diffs remain valid; re-run against a live fragment for the M2 baseline.
+- Live probes: real `omp -p --mode json` turns against `opencode-go/deepseek-v4.1-flash:max`, `opencode-go/muse-spark-1.3-contributor:max`, and `anthropic/claude-haiku-5-5:max`, using the factory's generated overlay plus the actual architect system prompt (`agents/architect.md` body). Unique `--session-dir`/`--cwd` per probe family under `/tmp`; `--max-cost 0.10` per turn. Aggregate live spend ≈ **$0.05**.
+- All probe dirs are throwaway (`/tmp/spike-cache-key-*`); no repo file was written.
+
+## 2. Transport render audit (byte/argv diff)
+
+Source under audit: `src/harness/omp/harness.ts:286-350` (prompt materialization), `src/harness/omp/harness.ts:368-389` (argv), `src/harness/omp/overlay.ts:26-100` (overlay).
+
+| Run pair | System-prompt bytes | System-prompt path | Prompt bytes | Prompt path | Argv |
+|---|---|---|---|---|---|
+| fresh-1 vs fresh-2 | identical, sha256 `cb92bbcaafd7bfa7b52413cc9a75cd58985c4e22b21b9984a60733a9f177c93a` | identical `.../system-prompts/architect-fresh.md` | identical, sha256 `4a9d87d474be6638f4c5b1bc4655622baa7566e9e91935bc12aa136c6cec6d88` | **different** `prompt-1794267999675-k2y1.txt` vs `prompt-1794267999746-1jly.txt` | identical except `-p @<path>` |
+| resume-1 vs resume-2 | identical | identical `.../system-prompts/architect-spike-session-fixed.md` | identical | **different** | identical except `-p @<path>` |
+| fresh vs resume | identical | **different** (`fresh` vs sanitized session id) | identical | different | resume adds `--resume spike-session-fixed` |
+| overlay generated twice | — | — | — | — | identical YAML, 1,472 bytes, sha256 `6ebf5894b6aaa2123b1cc3030555c3f5e61562751a2e332ef4b5d5b96e739f53` |
+
+Exact fresh argv (captured; resume adds `--resume spike-session-fixed` after `--session-dir`):
+
+```text
+--cwd /tmp/spike-cache-key-0c1ojol5/cwd
+--config /tmp/spike-cache-key-0c1ojol5/runtime/omp-overlay.yaml
+--mode json
+--model @architect
+--session-dir /tmp/spike-cache-key-0c1ojol5/runtime/sessions
+--tools=read,grep,glob
+--system-prompt /tmp/spike-cache-key-0c1ojol5/runtime/system-prompts/architect-fresh.md
+-p @/tmp/spike-cache-key-0c1ojol5/runtime/prompts/prompt-1794267999675-k2y1.txt
+```
+
+Findings:
+
+- System prompt is `extractAgentBody(run.definition)` written to `${agent}-${sessionKey}.md`; `sessionKey` is `fresh` or the sanitized resume id (`harness.ts:293-300`). Content is byte-stable per agent definition and path is deterministic per agent+session. The fresh→resume transition changes the path but not the bytes.
+- Prompt is written to `prompt-${Date.now()}-${random4}.txt` (`harness.ts:311-316`), so the path is unique every turn and the argv differs only there. Prompt **content** is byte-identical when the same fragment/vars are rendered.
+- Overlay is regenerated from the effective pipeline every run (`harness.ts:225-240`) and is byte-stable for identical config; it contains only `modelRoles`, `retry`, `eval`, `title`, `checkpoint`, `advisor`, `bash`, `mnemopi` (three linking flags), and `update` (`overlay.ts:51-85`). It pins **none** of `providers.cache*`, `compaction.*`, `snapcompact.*`, or `mnemopi.autoRecall/autoRetain`.
+- omp wraps the `@file` argument into the user message as `<file name="/abs/path">…</file>` (observed in `message_start`/`message_end` and the session JSONL). Therefore the *new* user message is not byte-identical when the same logical prompt is re-rendered to a different path. This does not break the prior cached prefix (the wrapper is appended at the end), but it means the transport is not byte-reproducible for retries. A content-addressed prompt filename (e.g. `prompt-<sha256>.txt`) would fix that; it is not required for cache hits.
+
+## 3. Live resume probe log
+
+All rows are `turn_end.message.usage`; `totalTokens = input + output + cacheRead + cacheWrite` in every observed row. `input` is *uncached* input (Anthropic reports `input=4` while writing/reading tens of thousands of cached tokens).
+
+### 3.1 Path / model / content probes (opencode-go DeepSeek, 1M context, implicit cache)
+
+| Probe | Input | cacheRead | cacheWrite | total | Cost USD | Interpretation |
+|---|---:|---:|---:|---:|---:|---|
+| D-T1 fresh (architect-resume prompt) | 9,060 + 478 + 1,515 | 0 + 8,960 + 9,344 | 0 | 9,318 / 9,717 / 11,390 | 0.001514 + 0.000266 + 0.000574 = **0.002354** | first request cold; intra-turn tool-loop requests cache |
+| D-T2 resume, same system-prompt path, new prompt path | 677 | 10,752 | 0 | 11,439 | **0.000140** | new prompt path is harmless |
+| D-T3 resume, **system-prompt path changed**, same bytes | 86 | 11,392 | 0 | 11,481 | **0.000049** | path is not in the key |
+| D-T4 resume, prompt path reused, content changed | 130 | 11,392 | 0 | 11,586 | **0.000092** | path reuse gives no extra hit; prior prefix still hits |
+| D-T5 resume, **model switched** to `opencode-go/muse-spark-1.3-contributor:max` | 11,082 | 0 | 0 | 11,775 | **0.001247** | model switch is a full cold read (≈8.9× D-T2) |
+
+### 3.2 Content / tools / thinking invalidations (clean 2-turn sessions, DeepSeek)
+
+| Scenario | T1 input | T2 input | T2 cacheRead | Result |
+|---|---:|---:|---:|---|
+| Control (same system prompt, same tools, same thinking) | 4,505 | 90 | 4,480 | near-full warm hit |
+| System prompt + one appended newline (same path) | 4,585 | 13,266 | 0 | full miss |
+| Tools `read,grep,glob` → `read,grep,glob,bash` | 4,585 | 2,719 | 2,432 | partial miss (tools are in the prefix) |
+| Thinking `:max` → `:high` (same model id) | 4,585 | 4,681 | 0 | full miss |
+
+Anthropic confirms path invariance: A-T1 fresh `input=4`, `cacheWrite=6,703`; A-T2 resume with a **different system-prompt path and identical bytes**: `input=4`, `cacheRead=6,703`, `cacheWrite=342`, cost $0.000143 (vs $0.00098 fresh).
+
+### 3.3 TTL expiry (Anthropic short/5m)
+
+| Turn | Input | cacheRead | cacheWrite | cttl | Cost USD |
+|---|---:|---:|---:|---|---:|
+| T1 fresh (2 requests) | 4 + 2 | 0 + 15,501 | 15,501 + 13,862 | `ephemeral5m` | 0.008491 + 0.006040 |
+| T2 resume ~1 min after T1 | 4 | 29,363 | 8,359 | `ephemeral5m` | **0.001454** |
+| T3 resume 330 s after T2 | 4 | **0** | **38,022** | `ephemeral5m` | **0.004767** |
+
+330 s is past the 300 s short TTL; the cold resume cost 3.3× the warm resume. Long retention was verified separately: `providers.cacheRetention: long` produced `cttl: {ephemeral1h: 6,705}`.
+
+`providers.cacheRetention: none` on a single fresh request produced `input=4,510`, `cacheRead=2,256`, `cacheWrite=24`, `cttl: {ephemeral5m: 24}` — i.e. omp stopped requesting explicit retention, but the provider still served an implicit cached prefix (the default base prompt) from an earlier identical request. `none` is therefore not a guarantee of zero cacheRead; it does reduce explicit write cost for single-request turns.
+
+### 3.4 Cross-session reuse
+
+A brand-new session in a new cwd with the same architect system prompt/tools/prompt shape produced `input=207`, `cacheRead=4,224`, `cacheWrite=0` — the system-prompt prefix was reused across session ids. Content, not session id, is the key (omp may still use session ids for provider routing affinity, but it is not a hard cache-key component for this provider).
+
+### 3.5 Memory-recall caveat (important)
+
+The session JSONL records `custom/system-prompt-digest` entries. With no recalled memories the digest of the same architect body was `a94d3680ec1c75cf` across different paths, cwds and session ids. With `mnemopi.autoRecall` returning a prior turn, the digest changed (`a89aabcb237da3c7`, `634c40b6e2f931de`) even though the agent body was unchanged; a one-newline body change produced `1a5712bb71b370ac`. Conclusion: the digest is a content hash of the **effective** system prompt including injected memory text (not path), and omp's ambient memory can change it. The factory overlay disables `polyphonicRecall`/`enhancedRecall`/`proactiveLinking` (`overlay.ts:77-81`) but leaves `mnemopi.autoRecall` and `mnemopi.autoRetain` at their default `true`. Recalled memories are injected only into the first turn of a session (observed once per session; docs: “Recall local memories into the first turn of each session”), so resumed turns are not re-polluted, but fresh sessions in a reused cwd are non-deterministic and can recall prior task text into the system prompt — losing the cross-session system-prompt cache hit and potentially leaking context between tasks that share a worktree.
+
+## 4. What the cache key covers
+
+**Content key (confirmed):** system-prompt bytes + tool specs (ordered) + model identity + thinking level + conversation history + cache retention markers/TTL. **Not in the key (confirmed):** system-prompt file path, prompt-file path, session id (for content reuse), file mtimes.
+
+Invalidation matrix:
+
+| Change | Observed effect |
+|---|---|
+| system-prompt path changed, bytes identical | full hit (DeepSeek 11,392; Anthropic 6,703) |
+| prompt path changed every turn | full hit on prior prefix (Anthropic 29,363) |
+| prompt path reused, content changed | no extra hit; prior prefix still hits (11,392) |
+| system-prompt +1 byte | full miss (0) |
+| tools order/content changed | partial/full miss; measured 2,432 of 4,480 retained |
+| thinking level changed | full miss (0) |
+| model switched | full miss (0), ~8.9× cost |
+| 5m TTL expired (330 s gap) | full miss (0), `cacheWrite` = 38,022 |
+| new session, same system prompt/tools | system-prompt prefix hit (4,224) |
+| compaction committed | prefix rewritten; next request cannot reuse the pre-compaction prefix |
+
+## 5. Cold-resume detection signals
+
+### 5.1 Pre-launch signals (engine can act before spending)
+
+Read from the session JSONL (the engine already has its path as `meta.yaml` `traceRef`, `src/core/records/step-record.ts:96`, produced at `harness.ts:521-522`):
+
+1. **`custom/system-prompt-digest`** — 16-hex digest of the effective system prompt. Compare the latest value to the engine's own hash of the current `agentBody`; content-only (path-independent), but includes omp-injected memory text (see §3.5).
+2. **`model_change`** — resolved `model` recorded at session start. Compare to the model the current `@role` resolves to. `@role` is re-resolved on every resume (`harness.ts:318-326`), so a pipeline/role/fallback change silently switches models.
+3. **`thinking_level_change`** — recorded level; compare to the current role suffix. A change is a full miss (measured).
+4. **`cttl` + last assistant timestamp** from the newest assistant message usage (`ephemeral5m`/`ephemeral1h`). Expiry = request-send time + TTL. The transcript timestamp is completion time, so subtract a conservative margin (seconds to tens of seconds).
+5. **`compaction` entry** after the last normal turn — history was rewritten; the next resume is cold from the cut point.
+6. **`credential_pin.hash`** (optional) — provider/account affinity changed; OpenAI-style `prompt_cache_key` affinity may be lost.
+7. **Ordered tools hash and cache-retention setting** — the session does not record these; the engine must store them in its own session-state record/meta and compare. Tools change is a partial miss (measured).
+
+### 5.2 Post-hoc signals (ground truth)
+
+- `turn_end.message.usage.cacheRead` == 0 on a resumed turn with prior history ⇒ miss; `cacheWrite` ≈ prompt size ⇒ cold write. `cacheWrite` is only populated by providers with explicit cache writes (Anthropic/Bedrock; DeepSeek reports 0).
+- `turn_end.message.usage.cttl` gives the tier and cached-token count (`{ephemeral5m: N}` / `{ephemeral1h: N}`); absent for DeepSeek implicit caching.
+- `turn_end.message` also carries `api`, `provider`, `model`, `reasoningTokens`, `totalTokens` — the factory currently discards all of them.
+- RPC/SDK expose `cache_warming_start` / `cache_warming_end` with `warmingStopReason` (`refresh missed the cache`, `refresh failed`, `conversation context changed`). `-p --mode json` would include these ordinary session events if warming runs; our probes did not trigger warming (see §7).
+- `display.cacheMissMarker` and the status-line `cache` segment are **UI-only**; no `cache_miss` event appeared in `-p` NDJSON. Do not build engine detection on them.
+
+### 5.3 Records gap (blocks spec 20's “measured defaults”)
+
+`OmpNdjsonParser` reads only `u.input`, `u.output`, and `u.cost.total` (`src/harness/omp/ndjson.ts:86-99`) and returns only `inputTokens`/`outputTokens`/`costUsd` (`ndjson.ts:173-177`). `Usage` (`src/harness/types.ts:7-11`) and `StepUsage` (`src/core/artifacts.ts:545-549`) have no cacheRead/cacheWrite/totalTokens/cttl/model fields. Consequently the records cannot answer “how many tokens did the cold resume re-pay?” today — only the total cost. Extend the types and parser before choosing cost-measured defaults.
+
+Also: side requests not tied to the agent turn (`model_usage` entries in the transcript with `purpose: "unexpected-stop"`, compaction summarization) are not attributed to the step. The `-p "/compact"` probe produced no usage record at all (see §7.1).
+
+## 6. Knob audit for one-process-per-turn (`-p`) factory sessions
+
+Effective values observed with `omp config list --json` / `--scope global` on this host (omp 18.18.5): `providers.cacheRetention=short`, `providers.cacheWarming=streaming`, `provider.appendOnlyContext=auto`, `includeModelInPrompt=false`, `compaction.enabled=true`, `compaction.midTurnEnabled=true`, `compaction.methodOrder=[remote,snapcompact,handoff,shake,soft]`, `compaction.experimentalContextManagement=true`, `compaction.handoffSaveToDisk=true`, `compaction.modelThresholds={anthropic/claude-haiku-5-5: "f90000", vercel-ai-gateway/minimax/minimax-m3.1-flash: 800000}`, `mnemopi.autoRecall=true`, `mnemopi.autoRetain=true`, `memory.backend=mnemopi`, `memories.enabled=false`. Several differ from the omp docs defaults: `cacheRetention` docs `auto`, `cacheWarming` docs `idle`, `experimentalContextManagement` docs `false`, `handoffSaveToDisk` docs `false`; `--scope global` proves the host layer sets them. Factory overlay precedence is above project/global (`docs/settings.md:113-123`), so pinning in the generated overlay is effective.
+
+| Knob | Docs default | Effective here | Affects `-p` one-process-per-turn? | Action for M7 |
+|---|---|---|---|---|
+| `providers.cacheRetention` | `auto` | `short` (host) | **Yes** — per-process TTL/markers; a per-turn `--config` overlay can vary it | Pin per role: architect `long` (1h) for standby gaps <1h; `short` for multi-request tool-loop agents; `none` only for known single-request turns |
+| `providers.cacheWarming` | `idle` | `streaming` (host) | `streaming` **yes** (intra-turn long tool executions); `idle` **no** (no idle scheduler in print sessions; process exits) | Pin `streaming`; do not rely on `idle`/standby warming |
+| `provider.appendOnlyContext` | `auto` | `auto` | **Yes** — keeps system prompt + tool specs + append-only log for maximum prefix hits | Keep `auto`/`on`; do not disable |
+| `includeModelInPrompt` | true in docs main; installed effective `false` | `false` | **Yes if true** — model name in the system prompt makes a model switch/fallback change the prefix | Pin `false` |
+| `display.cacheMissMarker` | true | true | **No** — TUI display only | Use usage fields instead |
+| `compaction.enabled` | true | true | **Yes** if the threshold is crossed inside a turn (mid-turn or post-turn) | Set explicit thresholds; do not rely on the default 15%/16k reserve (≈850k on a 1M window) |
+| `compaction.midTurnEnabled` | true | true | **Yes** — can rewrite history between tool-loop requests; the likely auto path in a long factory turn | Keep as overflow safety but raise `thresholdTokens` so it does not fire on normal architect turns |
+| `compaction.thresholdTokens` / `thresholdPercent` / `reserveTokens` | -1 / -1 / unset | same | **Yes** — trigger point | Pin an explicit architect budget; leave room for the next wave |
+| `compaction.methodOrder` | remote, snapcompact, handoff, shake, soft | same | **Yes** if compaction fires | Prefer `handoff`/`soft`; avoid `snapcompact` for the architect (images lose prompt caching) |
+| `compaction.asyncEnabled` | true | true | **Yes** near threshold — speculative side request inside a one-shot process | Keep or disable for deterministic cost; measure |
+| `compaction.autoContinue` | true | true | **Yes** — post-threshold continuation request; needed so the step still yields | Keep `true`; `false` would end a headless run without the agent's answer |
+| `compaction.keepRecentTokens` | 20,000 | 20,000 | **Yes** — size of retained tail after compaction | Tune to the architect brief size |
+| `compaction.supersedeReads` / `dropUseless` | true / true | true / true | **Yes** — cache-aware pruning every turn; can still mutate history near the cache lookback | Keep defaults; audit if cacheRead drops unexpectedly |
+| `compaction.idleEnabled` / `idleThresholdTokens` / `idleTimeoutSeconds` | false / 200,000 / 300 | same | **No** — idle maintenance is enabled only by the interactive TUI; SDK/RPC/print sessions do not enable it (`docs/sdk.md:278`) | Ignore for `-p`; do not build standby policy on it |
+| `compaction.handoffSaveToDisk` | false (host true) | true | No direct cache effect; writes summary artifacts | Pin for determinism |
+| `compaction.experimentalContextManagement` | false (host true) | true | **Potentially** — notes-backed rollover; requires `context_notes`/`new_context`/`read`/`grep` tools, otherwise legacy maintenance | Pin `false` unless deliberately opted in |
+| `snapcompact.systemPrompt` | `none` | `none` | **Yes** — imaging system prompt text loses prompt caching for that text | Pin `none` |
+| `snapcompact.toolResults` | false | false | **Maybe** — images of tool results; cache/vision trade-off | Pin `false` for architect |
+| `compaction.remoteEndpoint` / `remoteStreamingV2Enabled` / `v2RetainedMessageBudget` | unset / true / 64,000 | same | **Yes** if remote compaction is used | Decide/pin; remote is a second compaction path to test |
+| `compaction.modelThresholds` / `modelThresholdsEnabled` | per-model / true | host overrides | **Yes** — can trigger on a model unexpectedly | Audit/pin |
+| `task.agentCompactionThresholdOverrides` | {} | {} | **No** for root factory turns (task/subagents only) | Ignore |
+| `mnemopi.autoRecall` / `autoRetain` | true / true | true / true | **Yes** — first-turn effective system prompt changes; cross-session recall and cache loss | Pin `false` for deterministic factory agents (or opt in consciously with a recorded digest) |
+| `memory.backend` | `mnemopi` | `mnemopi` | **Yes via autoRecall** | Keep but disable autoRecall/autoRetain, or choose `off` if no memory is wanted |
+
+## 7. Compaction vs fresh brief
+
+### 7.1 `-p` manual compaction is available (verified)
+
+A one-shot print invocation accepted the slash command:
+
+```bash
+omp --cwd <cwd> --mode json --model opencode-go/deepseek-v4.1-flash:max \
+  --session-dir <sd> --tools= --resume <session-id> -p "/compact"
+```
+
+It emitted `manual_compaction_start` then `manual_compaction_end` with `result: { tokensBefore: 38053, firstKeptEntryId: …, summary, shortSummary, details }`; `tokensAfter: 6794` and `method: "soft"` live in the transcript `compaction` entry, not the NDJSON result. It printed `Compaction complete. Tokens: 36413 -> 6768 (saved 29645)` to stderr, persisted that `compaction` entry in the session JSONL, and exited 0. There was **no `turn_end`, no usage, and no `model_usage` entry** for the summarization request in NDJSON/transcript — compaction cost must be estimated from `tokensBefore`/summary length (or measured via `omp stats`/an RPC wrapper) if spec 20's cost defaults are to include it.
+
+RPC mode exposes a first-class `{ type: "compact", customInstructions? }` command and `manual_compaction_start/end` events (`docs/rpc.md:190-210`, `:970-987`); `{ type: "set_cache_warming", mode }` is also available there (`docs/rpc.md:197-210`).
+
+### 7.2 Cost analysis (architect on `anthropic/claude-opus-5-5`, catalog: input $4/M, cacheRead $0.20/M, cacheWrite $5/M)
+
+For a 38k-token history (same order as the compaction probe):
+
+| Strategy | What is paid | Approx cost |
+|---|---|---|
+| Direct cold resume | 38k × $4/M | **$0.152** |
+| Compact **after** cache expiry, then resume | summarizer cold-reads 38k ($0.152) + summary output (~$0.01-0.02) + compacted prefix write 6.8k × $5/M ($0.034) + resumed turn | **≈$0.20-0.24** (worse than direct for one turn) |
+| Compact **while warm** (at wave end, within TTL), then resume | summarizer cache-reads 38k × $0.20/M ($0.0076) + output (~$0.01-0.02) + compacted write $0.034 + resumed turn | **≈$0.06-0.09** (better) |
+| Fresh architect brief | build B-token brief from records (e.g. B≈5k: $0.02 input / $0.025 write) + system-prompt prefix cacheRead (~$0.001) | **≈$0.02-0.03** at B=5k; still cheaper at B=20k (~$0.08-0.10) |
+
+Key correction to spec item 20(a): **compaction after the cache has already expired does not avoid re-paying the full history; the summarizer pays it once, then the resumed turn pays the compacted prefix again.** Compaction only pays if it runs while the prefix is still warm, or if the architect will have several future turns on the compacted history, or if the full history would overflow the window. For an already-cold resume, a deterministic fresh brief is the cheaper mechanism.
+
+### 7.3 Recommended mechanism
+
+1. **Warm** (no trigger): resume additively; do nothing.
+2. **Cold + short history / one-shot consult**: resume uncached; optionally pass a per-turn overlay with `providers.cacheRetention: none` if the turn is known to make a single model request (multi-request tool loops still benefit from caching).
+3. **Cold + long history + more turns expected**: start a **fresh architect session hydrated from records** (existing `hydrationContext`/`contextPack`/`waveReport` machinery in `step-runner.ts` and `steps/architect-resume`). This is bounded, deterministic, and still reuses the system-prompt prefix (4,224-token cross-session hit measured).
+4. **Compact only while warm**, at a natural wave boundary, before the TTL expires: `omp -p --resume <id> "/compact"` (verified) or RPC `compact`. Use `handoff`/`soft`, not `snapcompact` for the architect. Record `tokensBefore/tokensAfter`; estimate cost.
+5. **If already cold and continuity is mandatory** (the brief would lose critical conversational state): resume uncached and accept the full read; do not compact as well.
+
+## 8. Standby-warming viability
+
+- `providers.cacheWarming` values: `off`, `streaming`, `idle` (verified by invalid-value error; docs `docs/settings.md:1026`). Warming replays the last request with a one-token output budget shortly before expiry, only when the expected avoided-miss cost exceeds the refresh cost by at least **$0.05**. For Opus (input $4/M vs cacheRead $0.20/M, delta $3.8/M), the threshold is ≈**13.2k tokens** of prefix; an architect session above that qualifies economically.
+- **`idle` warming cannot cover factory standby.** The interactive TUI owns idle work; “SDK, RPC and print sessions do not” enable idle maintenance (`docs/sdk.md:278`). `-p` exits at the end of the turn, so there is no process alive to replay the request between turns. `streaming` warming can still protect a long tool execution **inside** a turn — pin it.
+- **The practical standby mechanism is `providers.cacheRetention: long`** (1h where supported). Verified `cttl: {ephemeral1h: N}`. It needs no live process. The cost is the cache write: catalog `cacheWrite` for Opus is $5/M (1.25× input); Anthropic bills 1h writes at a higher rate than 5m in the real API, and omp's single catalog `cacheWrite` value may under-estimate 1h writes — verify against provider billing before making it the default. A 1h tier pays if the architect's next turn lands >5m and <1h later; it does not cover >1h gaps.
+- **Pre-warming immediately before a resume is never cheaper:** if the entry already expired, the warm request pays full input + cache write, then the resumed turn pays cache read; that is strictly more than the direct cold resume. Warm must happen *before* expiry to pay off.
+- **Persistent RPC holder** (`omp --mode rpc`, `set_cache_warming idle`, `compact`) is the only true standby warming, but it reintroduces a long-lived process and session ownership across wave gaps. Defer as an optional M7 experiment; measure against long retention first.
+
+## 9. Recommendations for M7
+
+1. **Extend usage accounting** (`src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549`, `src/harness/omp/ndjson.ts:86-99`): add `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, `cacheTtl: {tier, tokens}`, `provider`, `api`, `model`, `reasoningTokens`; keep per-request rows (a turn can emit multiple `turn_end` usages) and aggregate. Include side-request `model_usage`/compaction cost where available.
+2. **Add a per-session cache-state record** (meta or a sibling `session-cache.yaml`): resolved model (`provider/model` from `turn_end.message`), thinking suffix, ordered tools hash, system-prompt hash, cache retention, last request timestamp, last `cttl`, last `compaction` marker. Compare it on every resume.
+3. **Stop silently switching models on resume:** record the resolved model used by the successful turn and pass that literal model on resume (or detect the mismatch and treat it as cold). Current resume unconditionally passes `@role` (`harness.ts:318-326`), so a role-map change or fallback recovery silently switches models and pays a full cold read.
+4. **Pin effective omp settings in the generated overlay** (`overlay.ts:51-85`): `providers.cacheRetention` (per role/flow), `providers.cacheWarming: streaming`, `provider.appendOnlyContext: auto`, `includeModelInPrompt: false`, `snapcompact.systemPrompt: none`, `snapcompact.toolResults: false`, `compaction.experimentalContextManagement: false`, explicit `compaction.enabled/thresholdTokens/methodOrder/autoContinue`, and `mnemopi.autoRecall/autoRetain: false`. Overlay precedence beats host global/project config (`docs/settings.md:113-123`), but only if the keys are actually present.
+5. **Validate effectively, not syntactically:** `omp --config <overlay> --version` exits 0 even for invalid YAML or an invalid `providers.cacheRetention` value (confirmed). Preflight’s current overlay check (`src/cli/preflight.ts:364-393`) is therefore a no-op. Read back effective values (`omp config get`, or a no-model probe) and/or perform a real throwaway turn before declaring config compatible. This confirms open concern `c-477404c672` and adds cache/compaction keys to its scope.
+6. **Cold policy:** warm → resume; cold single-turn → resume (optionally `retention: none`); cold long-history → fresh brief; compact only while warm. Do not compact after expiry for a single resume.
+7. **Byte stability:** keep system-prompt content byte-stable; make prompt filenames content-addressed (`prompt-<sha256>.txt`) so identical logical prompts produce identical `@file` wrappers/transcripts. The current timestamp+random path is cache-safe but not byte-reproducible.
+8. **Disable ambient memory for deterministic agents** or explicitly include its digest: `mnemopi.autoRecall/autoRetain: false`; otherwise fresh sessions in a reused cwd inject prior task text into the system prompt (digest changes observed).
+9. **Measure before defaults:** use `long` retention for architect standby gaps <1h, `short` for multi-request tool-loop agents, `none` only for single-request turns; keep the choice per role/flow and record the cost delta.
+10. **Tests:** the scripted mock provider for item 19.8 should emit realistic `usage` rows with `cacheRead`, `cacheWrite`, `totalTokens`, `cttl`, and multiple `turn_end`s per turn, plus a synthetic session JSONL with `system-prompt-digest`, `model_change`, `thinking_level_change`, `compaction`, and `cttl` so cold detection is testable without paid models.
+
+## 10. Draft decision YAML
+
+```yaml
+status: proposed
+decision: |
+  OMP prompt caching is content-keyed, not path-keyed. The cached prefix is composed of the
+  system-prompt bytes, ordered tool specs, model/thinking identity, cache-retention tier, and
+  conversation history; file paths and session ids are not hard key components. The factory's
+  deterministic system-prompt path and unique per-turn prompt path are cache-safe; a changed
+  system-prompt path with identical bytes still fully hits. Cold resume must be detected from
+  content/config changes (system-prompt bytes, ordered tools, model, thinking level, cache
+  retention) plus TTL expiry (usage.cttl + timestamp) and compaction markers, not from paths.
+  For one-process-per-turn `-p` sessions, idle cache warming and idle compaction are unavailable;
+  use `providers.cacheRetention: long` for architect standby gaps under 1h, pin streaming warming
+  for intra-turn tool executions, and do not rely on omp's default host config (this host sets
+  short/streaming/experimental values). For an already-cold architect resume, prefer a fresh
+  brief hydrated from records over compaction; compaction only pays when performed while the
+  cache is warm (at a wave boundary) or amortized over several future turns. Pin all relevant
+  omp cache/compaction/memory keys in the generated overlay and record cacheRead/cacheWrite/
+  totalTokens/cttl in step records so defaults can be measured.
+evidence:
+  - "Transport audit: harness.ts:286-350 writes a deterministic per-agent+session system prompt and a unique timestamp+random prompt file; argv differs only in -p @path; overlay bytes identical (sha256 6ebf5894...); system-prompt/prompt content identical across renders."
+  - "Path invariance: DeepSeek resume with changed system-prompt path and identical bytes cacheRead=11,392 (input 86); Anthropic resume with changed path cacheRead=6,703 (input 4). New prompt path per turn cacheRead=10,752 (DeepSeek) and 29,363 (Anthropic)."
+  - "Content invalidation: system prompt + newline cacheRead=0 (input 13,266); tools change cacheRead=2,432 of 4,480; thinking change cacheRead=0; model switch cacheRead=0 (cost 8.9x warm)."
+  - "TTL: Anthropic short (5m) warm resume cacheRead=29,363, cost $0.001454; after 330s cacheRead=0, cacheWrite=38,022, cost $0.004767. Long retention emits cttl ephemeral1h; providers.cacheRetention enum is auto|short|long|none."
+  - "Cross-session: new session, same system prompt/tools, cacheRead=4,224; session id is not a hard key."
+  - "Compaction: `omp -p --resume <id> \"/compact\"` compacted 38,053 -> 6,794 tokens (method soft) with manual_compaction_start/end; no usage/cost in NDJSON or transcript. Docs: idle maintenance is TUI-only (docs/sdk.md:278); cacheWarming values off|streaming|idle, $0.05 avoided-miss gate (docs/settings.md:1026); idle compaction trade-off (docs/compaction.md:155-158)."
+  - "Factory records: ndjson.ts:86-99 and 173-177 drop cacheRead/cacheWrite/totalTokens/cttl; Usage and StepUsage lack fields (types.ts:7-11, artifacts.ts:545-549)."
+  - "Factory overlay: overlay.ts:51-85 pins no providers.cache*, compaction.*, snapcompact.*, mnemopi.autoRecall/autoRetain; host global config sets providers.cacheRetention=short, cacheWarming=streaming, compaction.experimentalContextManagement=true. `omp --config <invalid> --version` exits 0, so preflight.ts:364-393 does not validate the overlay."
+followUps:
+  - "M7: extend Usage/StepUsage and OmpNdjsonParser with cacheRead/cacheWrite/totalTokens/cttl/provider/model/reasoningTokens and per-request rows."
+  - "M7: add a session cache-state record and pre-launch cold detector (system-prompt hash, ordered tools hash, resolved model, thinking, retention, cttl+timestamp, compaction marker)."
+  - "M7: pass the recorded resolved model on resume instead of unconditionally @role; treat role-map changes as cold."
+  - "M7: pin cache/compaction/mnemopi settings in the generated overlay; validate effective values in preflight with a real check, not `--version`."
+  - "M7: measure long-vs-short retention and fresh-brief-vs-warm-compaction per role/flow on the self-host fire test; confirm Anthropic 1h write pricing against provider billing."
+  - "M7: optional RPC holder experiment (set_cache_warming idle + compact) only if long retention does not cover the observed wave gaps."
+  - "Add a mock-provider fixture with cache usage/cttl/session entries so cold-detection and cost defaults are testable without paid models."
+```
+
+## 11. Open questions / follow-ups
+
+- Anthropic's real 1h cache-write price is higher than the 5m write price; omp's catalog exposes one `cacheWrite` value per model. The cost estimates in §7.2/§8 for `long` may be optimistic. Confirm on the provider bill before making `long` the default.
+- DeepSeek reports no `cttl`/`cacheWrite`; its implicit cache has no observable TTL. Do not attempt TTL-based cold detection for such providers; use content/config fingerprints only.
+- The `-p "/compact"` summarization cost is not in NDJSON or the transcript. If spec 20 requires measured compaction cost, add an RPC wrapper that captures the compaction response/usage, or estimate from `tokensBefore` and summary length.
+- `mnemopi.autoRetain` can write completed factory turns into a per-cwd memory bank and affect later fresh sessions in the same worktree. Decide whether that is a feature (cross-run context) or a leak (task isolation); the factory's current overlay only disables the linking flags.
+- `checkpoint.enabled: true` in the overlay mounts checkpoint tools; agents opt in via their tool lists. Not a cache issue, but part of the effective harness surface to audit.
+
+## Sources
+
+Repo (read-only audit):
+- `plugins/software-factory/src/harness/omp/harness.ts:286-350` — system-prompt/prompt materialization, model candidates.
+- `plugins/software-factory/src/harness/omp/harness.ts:368-389` — argv construction (`--system-prompt`, `-p @file`, `--resume`, tools).
+- `plugins/software-factory/src/harness/omp/harness.ts:225-240` — overlay regeneration.
+- `plugins/software-factory/src/harness/omp/overlay.ts:26-100` — overlay keys; no cache/compaction/memory-autoRecall pins.
+- `plugins/software-factory/src/harness/omp/ndjson.ts:86-99,173-177` — usage fields dropped.
+- `plugins/software-factory/src/harness/types.ts:7-11`, `src/core/artifacts.ts:545-549` — `Usage`/`StepUsage` lack cache fields.
+- `plugins/software-factory/src/core/flows/step-runner.ts:534-547,620,817` — prompt rendering and `AgentRun` prompt.
+- `plugins/software-factory/src/core/records/step-record.ts:96`; `src/harness/omp/harness.ts:521-522` — `traceRef` to session JSONL.
+- `plugins/software-factory/src/cli/preflight.ts:364-393` — overlay validation via `omp --config … --version`.
+- `plugins/software-factory/docs/OMP_ADAPTER.md:164-172` — prior cache-safety claims; line 168 previously marked path-vs-content keying unknown.
+- `plugins/software-factory/docs/ARCHITECTURE.md:38` — one process per agent turn; `:40` — cache/compaction not built.
+- `docs/factory.v2.md:114-120` — spec items 20(a)-(d).
+
+OMP docs (official):
+- `https://omp.sh/docs/compaction` — compaction settings reference.
+- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/settings.md:113-123` — precedence (overlay beats project/global); `:926` — cache-segment invalidation signals; `:1025-1027` — cacheRetention/cacheWarming; `:468` — includeModelInPrompt.
+- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/models.md:465-504` — prompt-cache lifetimes (Anthropic 5m/1h; OAuth vs API key defaults).
+- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/sdk.md:278` — idle maintenance is TUI-only; SDK/RPC/print sessions do not enable it.
+- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/compaction.md:155-158` — idle-compaction/cache TTL trade-off; `:530` — experimental context management default false.
+- `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/rpc.md:190-210,970-1037` — `compact`, `set_cache_warming`, `cache_warming_start/end`/`warmingStopReason`.
+
+## Appendix A: Probe log (commands and raw result locations)
+
+All live probes were run as `omp -p --mode json --max-cost 0.10` from throwaway dirs; per-turn NDJSON and stderr were captured under `/tmp/spike-cache-key-{live,ttl,invalidation,tools-thinking,digest,cross-session,anth-path,retention,preflight}` (exception: the long/none retention probes in §3.3 saved only YAML results — no NDJSON/transcript was archived for them). The transport shim captured argv/system-prompt/prompt under `/tmp/spike-cache-key-0c1ojol5/capture/{fresh-1,fresh-2,resume-1,resume-2}`. The numbers in §3 are extracted from the `turn_end`/`message` usage rows in those files. Aggregate spend ≈ $0.05.
diff --git a/plugins/software-factory/docs/spikes/omp-6-repo-rules.md b/plugins/software-factory/docs/spikes/omp-6-repo-rules.md
new file mode 100644
index 0000000..8c03096
--- /dev/null
+++ b/plugins/software-factory/docs/spikes/omp-6-repo-rules.md
@@ -0,0 +1,128 @@
+# Software-Factory v2: OMP Repo Rules & Injection Spike (M1)
+
+This report is empirical verification of how omp discovers repository rules and context files, how the factory's per-role prompts interact with that injection, and what the factory should do for the M1 `omp-workspaces` repo-rules requirement. Tested against `omp 18.18.5` on Linux x86_64 WSL2 with throwaway git fixtures and a local OpenAI-compatible mock provider. No paid models were used; no production files were changed.
+
+## 1. Verdicts
+
+### 1.1 Root omp sessions inject repo rules automatically — **VERIFIED**
+
+`omp --cwd <repo> --system-prompt <role-body>` still emits a trailing `<project-context>` footer with `<repo-rules>` and injects rules. `--system-prompt` replaces only block 0; it does not suppress context files, `RULES.md`, always-apply rules, or the rulebook listing.
+
+### 1.2 Current factory has no double injection — **VERIFIED**
+
+Factory roles are root omp processes; their `--system-prompt` contains only the agent definition body. Repo rule text is absent from all role/step prompt assets. Each active sentinel appeared exactly once in captured provider requests.
+
+### 1.3 Copying rules into role prompts double-injects — **VERIFIED**
+
+A role system prompt containing the same repo text produced 2 sentinel occurrences (block 0 + `<repo-rules>`). `--append-system-prompt` with the same text produced 2 (repo-rules + append). If M8 injects engine-rendered rules, it MUST disable omp discovery for that run.
+
+### 1.4 The spec's subagent premise is about scouts — **VERIFIED BY DOCS, NOT LIVE**
+
+oMP task subagents drop every context file named `AGENTS.md` by basename; they keep `RULES.md` and `contextFiles.extra`. Root role sessions do not drop AGENTS.md. The factory's architect/developer/qa/reviewer are root processes, so they already receive AGENTS.md. Scouts (`task`) do not; use RULES.md/extra/delegation context for them.
+
+### 1.5 Preflight overlay validation is a no-op — **VERIFIED (critical)**
+
+`omp --config <bad.yaml> --version` exits 0. The same overlay on a real turn fails with `Failed to parse config overlay`. The current preflight check (`preflight.ts:364-393`) proves the binary exists, not that the overlay is valid.
+
+### 1.6 No-paid-model mock provider is feasible — **VERIFIED**
+
+A throwaway `models.yml` custom provider (`api: openai-completions`, `apiKey` literal, `authHeader: true`) plus a local HTTP/SSE stub returned scripted responses and recorded exact request bodies. This is a viable basis for M8's scripted mock model provider.
+
+## 2. Source and precedence summary
+
+### 2.1 Context files (`<repo-rules>`)
+
+| Source | Provider priority | Scope |
+|---|---|---|
+| `.omp/AGENTS.md` | native 100 | nearest non-empty `.omp` walking cwd→repo root; no farther fallback |
+| `AGENTS.md` | agents-md 10 | every ancestor cwd→repo root (and enclosing workspace dirs under home) |
+| `.claude/CLAUDE.md` | claude 80 | launch cwd only |
+| `CLAUDE.md` | claude-md 10 | every ancestor cwd→repo root |
+| `.agent/AGENTS.md`, `.agents/AGENTS.md` | agents 70 | ancestor walk; `.agent` wins same level |
+| `.github/copilot-instructions.md` | github 30 | launch cwd only |
+| `.gemini/GEMINI.md` | gemini 60 | launch cwd only |
+| `contextFiles.extra` basenames | custom-context 9 | walk like AGENTS.md; additive; also user agent dir and primary checkout root in linked worktrees |
+
+One user context file survives by provider priority; one project file per depth; higher priority shadows at the same depth; different depths compose root→cwd (nearer last, more prominent). `contextFiles.extra` is additive and never takes the scope slot. Final injection is one `<repo-rules>` block in the trailing `<project-context>` footer, with absolute paths and expanded `@` imports.
+
+### 2.2 Rules
+
+| Source | Provider priority | Scope / bucket |
+|---|---|---|
+| `.omp/rules/*.{md,mdc}` | native 100 | `<cwd>/.omp/rules` only; always-apply / rulebook / TTSR |
+| `<agent-dir>/rules/*` | native 100 | user; same buckets |
+| `.omp/RULES.md` | native 100 sticky | nearest project `.omp`; forced always-apply (`RULES@project`) |
+| `<agent-dir>/RULES.md` | native 100 sticky | user; forced always-apply (`RULES`) |
+| `.cursor/rules/*.{mdc,md}` | cursor 50 | project `<cwd>/.cursor/rules`, user `~/.cursor/rules`; alwaysApply or rulebook |
+| `.cursorrules` | — | **not observed in 18.18.5**; do not rely on it |
+| `.windsurf/rules/*.md` | windsurf 50 | project; rules |
+| `.clinerules` | cline 40 | nearest; rules |
+| `.github/instructions/**/*.instructions.md` | github 30 | applyTo rules |
+| plugin `rules/` | omp-plugins 90 | extension packages |
+
+Rules dedup by name: native > omp-plugins > agents > cursor/windsurf > cline > github > builtin. Bucket order: TTSR > alwaysApply (full content) > rulebook (description listing; body via `rule://`). `--no-rules` removes all of them; `--no-context-files` removes none.
+
+### 2.3 Settings layers
+
+Environment > runtime > `--config` overlays > project `.omp/config.yml` > global `<agent-dir>/config.yml` > default. Arrays replace; they do not merge. `disabledExtensions: [context-file:<level>:<basename>]` drops a single context file; `disabledProviders` removes a whole discovery source.
+
+## 3. Injection behavior
+
+- Context files: `<repo-rules>` in `<project-context>` footer; static system block comes first, so worktree-specific rules sit below the Anthropic cache breakpoint.
+- Rules with default prompt: full always-apply content in `<generic-rules>`; conditional/described rules in `<domain-rules>` as name/description/globs pointers.
+- Rules with `--system-prompt`: always-apply content is prepended to block 0; rulebook renders as `<rules>` in block 0.
+- `--system-prompt` suppresses discovered `SYSTEM.md` but **not** `APPEND_SYSTEM.md`, context files, or rules.
+- `--no-context-files` disables context files only; `--no-rules` disables rules only; both are needed to disable both.
+- Discovered `APPEND_SYSTEM.md` is appended even with both flags and a custom system prompt; explicit empty `--append-system-prompt=` suppresses it.
+
+## 4. Probe matrix (condensed)
+
+| Probe | Result |
+|---|---|
+| repo1 baseline (root AGENTS, CLAUDE, .claude/CLAUDE, .cursorrules, .cursor/rules always, .omp/RULES, AGENTS.local) | `<repo-rules>` = `.claude/CLAUDE.md`; rules = `RULES.md` + cursor always; root AGENTS/CLAUDE shadowed; `.cursorrules` absent |
+| + `--system-prompt` | role text + rules in block 0; `<repo-rules>` still `.claude/CLAUDE.md` |
+| + `--no-context-files` | no `<repo-rules>`; rules remain |
+| + `--no-rules` | `<repo-rules>` remains; rules gone |
+| + extra overlay `AGENTS.local.md` | `.claude/CLAUDE.md` + `AGENTS.local.md` |
+| repo2 `.omp/AGENTS.md` + root AGENTS | `.omp/AGENTS.md` only; root shadowed |
+| repo3 only AGENTS.md | `AGENTS.md` injected |
+| repo4 only CLAUDE.md | `CLAUDE.md` injected |
+| repo5 only `.cursorrules` | nothing, even with `read` |
+| repo6 conditional `.mdc` | `<domain-rules>` listing only |
+| repo7 always `.mdc` + `.cursorrules` | always body injected; `.cursorrules` absent |
+| cwd `sub/` | root + sub AGENTS (root first); root `.omp/RULES.md`; root `.claude` not loaded |
+| repo8 native rules + same-name cursor | native body wins; cursor body absent; conditional in `<domain-rules>` |
+| cwd `sub/` of repo8 | root `.omp/rules` not loaded; root RULES still loaded |
+| duplicate role prompt | sentinel count 2; with `--no-context-files` count 1 |
+| duplicate append | sentinel count 2 |
+| user AGENTS/RULES/SYSTEM/APPEND | all load; APPEND survives both disable flags; empty append suppresses |
+| project config extra + overlay empty / disabledExtensions | project extra loads; overlay `[]` removes; disabled file drops while extra stays |
+| resume after editing AGENTS.md | new system footer contains V2 only; history retained |
+| preflight bad overlay + `--version` | exit 0; real turn parse error |
+
+## 5. Role hydration seams
+
+- `--system-prompt` = `agents/<role>.md` body (frontmatter stripped, shared partials resolved).
+- `-p @<prompt>` = rendered `agents/steps/<step>.md` with prompt vars/schema.
+- `--cwd` = task worktree for architect/plan-reviewer/PM/close-ups; item worktree for developer/qa/reviewer. That cwd is the omp discovery root.
+- One shared `{runtimeDir}/omp-overlay.yaml`; currently no context/rules keys.
+- Inherited `HOME`/agent dir means user-level `AGENTS.md`/`RULES.md`/`APPEND_SYSTEM.md` apply to every role.
+
+## 6. M8 plan
+
+1. Keep omp auto-discovery as the repo-rules injector for root roles; do not copy rule text into role definitions or step prompts.
+2. Add a pipeline/overlay knob for `contextFiles.extra` (array of basenames) and, if needed, `disabledExtensions` for user-level contamination.
+3. For rules that scouts must follow, use `.omp/RULES.md` or `contextFiles.extra`, or pass them in the `task` tool `context` field; AGENTS.md alone is invisible to scouts.
+4. Add a mock-provider test harness that records request bodies; assert sentinel counts per role, precedence, flags, resume refresh, and cache-prefix stability.
+5. Optionally run a cheap live probe where each role quotes sentinels; assert root roles see AGENTS and scouts do not (unless RULES/extra/context carries them).
+6. If engine-side hydration is ever chosen, launch with `--no-context-files --no-rules --append-system-prompt=` and assert count == 1.
+7. Replace preflight's `--config --version` with a real throwaway turn against the mock provider.
+
+## 7. Recommendations
+
+- **Use omp-native injection** (recommended): no double injection, no rule-text duplication, cache-friendly (rules in the trailing footer below the cache breakpoint).
+- **Do not rely on `.cursorrules`** in omp 18.18.5; use `.cursor/rules/*.mdc` with `alwaysApply: true`.
+- **Put hard repo rules in `.omp/RULES.md`** if scouts must see them; keep AGENTS.md for the broader root-session guidance.
+- **Verify user-level prompt files** are intentional; suppress `APPEND_SYSTEM.md` with `--append-system-prompt=` for deterministic role prompts.
+- **Pin/sync repo rules across worktrees** at item/wave creation if rule changes must be consistent.
+- **Keep factory launches at worktree roots**: `.omp/rules` and `.claude/CLAUDE.md` are cwd-only, so launching a role from a subdirectory would silently miss the root copies.

## Review Feedback
target-green failed on merge path for spike-findings-recovery: Gate test failed with exit code 1. Command: bun --cwd=plugins/software-factory test Command: bun --cwd=plugins/software-factory test Output tail: oot, and tmpdir [32.38ms]

test/cli/cli.test.ts:
[factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1251469
[factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1251469
[factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 1251469

 684 pass
 2 skip
 1 fail
 3871 expect() calls
Ran 687 tests across 106 files. [232.65s]

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
