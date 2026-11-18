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
