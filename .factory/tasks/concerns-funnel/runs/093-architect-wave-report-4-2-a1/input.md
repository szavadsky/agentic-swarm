# Step: Architect Wave Report

## Goal
Evaluate the results of a completed execution wave, assess spike findings and accumulated debt, and decide the iteration path.

## Rules
- Exploration budget: evaluate wave progress from the current plan, wave report, spike findings, and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)

## 0. Snapshot (verified 2026-11-09)

| Fact | Evidence |
|---|---|
| Task | spec item 18 of `docs/factory.v2.md:89-103` (acceptance definition) |
| Code state | plugin sources committed at worktree HEAD `b3450c9` (`factory: context-pack-4 a1`); plugin tree clean (only factory journal dirty) |
| Test health | `cd plugins/software-factory && bun test` → **445 pass, 2 skip, 0 fail**, 2468 expect() calls, 69 files, 105s |
| Concern-focused subset | 17 files / **137 pass, 0 fail** (concerns-funnel, reviewer-triage, plan-reviewer-triage, funnel-text-budget, human-router-severity, routing-*, state-concern-counts, adr-blocking-digest, epic-saga-propagate, closeup-lifecycle-resolve, human-involvement-config, cli/status-concerns, contracts/*) |
| Implementation status | item 18 is materially implemented (store, fingerprint/dedup, triage+dismiss, routing, funnel, ADRs, human modes, close-up/status/state surfacing). Docs were **not** updated: `plugins/software-factory/docs/ARCHITECTURE.md:39` still says "Deliberately not hand-built … Current state: review dispositions (§8.7) and steering mailbox (§8.8) only" |
| Repository ADRs | 16 one-paragraph ADRs written by the architect under `docs/adr/` (project `adrFolder`, `plugins/software-factory/config/project.template.yaml:11`) |
| Active human mode | default `autonomous`; repo `.factory/pipeline.yaml` absent → only default + repo layers apply |

> Containment note: `.factory/tasks/**` is orchestration state and is intentionally not inspected here; all claims below come from plugin sources, schemas, prompts, docs and tests.

---

## 1. Module Map

### 1.1 Core concern subsystem

| File | Responsibility | Key ranges |
|---|---|---|
| `plugins/software-factory/src/core/concerns.ts` (406 L) | The concern store: stable fingerprint ids, per-file dedup/merge, aggregation with immediate commit, status vocabulary, triage application, close-up proposals/confirms, decision-level resolution, wave fallback, crash reconcile | `:35-44` allowlist, `:46-60` ids, `:69-97` merge, `:121-166` aggregate, `:184-215` counts, `:250-261` triage, `:263-304` close-up lifecycle, `:311-326` resolution, `:335-351` wave fallback, `:353-362` partition, `:388-406` reconcile |
| `plugins/software-factory/src/core/triage.ts` (349 L) | Pure triage/routing helpers: partition by exact id, severity policy, single human-disposition router (digest vs blocking), debt predicate, terse hydration + byte-capped rendering, `applyReviewTriage` | `:35-50`, `:52-54`, `:56-75`, `:93-136`, `:143-149`, `:152-165`, `:200-247`, `:254-286`, `:293-349` |
| `plugins/software-factory/src/core/review-policy.ts` (43 L) | Triager set (`reviewer`, `plan-reviewer`) and per-agent allowed dispositions; appends `dismiss` for triagers only | `:4-20`, `:27-43` |
| `plugins/software-factory/src/core/flows/step-runner.ts` (923 L) | Post-step ingest: aggregates produced concerns/remarkables, applies triage on pre-existing ids only, records close-up resolutions, honors/ignores decision-level resolutions, applies architect confirms + epic propagation, wave fallback; resolves schema/dispositions and hydrates `concernsYaml` | `:194-322`, `:325-341`, `:409-449` |
| `plugins/software-factory/src/core/flows/iteration.ts` (1337 L) | Architect plan/revise (ADR persistence), plan-review wiring (plan-reviewer is the triager for architect output), wave-level routed-blocker consults | `:170-177`, `:179-229`, `:441-451`, `:517-549`, `:614-623`, `:810-933` |
| `plugins/software-factory/src/core/flows/item-machine.ts` (811 L) | Item review prompt wiring (`dispositionsCriteria`, `reviewAllowed`) and suppression of duplicate raw human dispositions for concern ids | `:663-665`, `:714-744`, `:766-810` |
| `plugins/software-factory/src/core/flows/consults.ts` (421 L) | `consult-concern-<id>` architect consult for a routed blocker; decision may carry `concernResolution` | `:326-421` |
| `plugins/software-factory/src/core/flows/epic-propagation.ts` (185 L) | Epic→saga concern push: condensed copies, `[epic]` summaries, forwarded blocked questions | `:17-36`, `:97-129`, `:141-150`, `:152-185` |
| `plugins/software-factory/src/core/flows/adrs.ts` (72 L) | Blocking vs remarkable ADR: markdown record + mailbox routing under the active mode | `:14-18`, `:20-37`, `:46-71` |

### 1.2 Derivation, engine, CLI

| File | Responsibility | Key ranges |
|---|---|---|
| `src/core/derive/task.ts` (441 L) | `collectRoutedBlockers` (kind `blocker` + status `routed` + severity ≥ `minBlockingSeverity`); maps routed blocking onto item state; debt list incl. concern debt; `concerns` counts on state | `:47-65`, `:174-190`, `:219-250`, `:369-385` |
| `src/core/derive/item.ts` | Applies routed-concern blocking to pending items (`withRoutedBlocking`) | `:59-90` |
| `src/core/derive/wave.ts` | Wave state carries concern-blocked items; transitive fixpoint over declared deps | `:27`, `:47`, `:73` |
| `src/core/plan/scheduler.ts` | `blockedByConcern(...)` failure-union fixpoint used by iteration/scheduler | `:60-90` |
| `src/core/engine.ts` (795 L) | Startup: commit engine-owned concern store (`factory: concern store recovery`), reconcile concerns from committed records; epic child finish: `propagateEpicConcerns` + child-closeup commit | `:266-289`, `:342-347`, `:383-394` |
| `src/core/prompts.ts` (597 L) | `loadCriteriaBundle`, `formatHumanInvolvementCriteria` (selects `## <mode>` + shared table), `formatDispositionsSection` (allowed set, drops `human-stop` unless allowed) | `:35-59`, `:61-84`, `:86-110` |
| `src/core/prompt-vars.ts` (171 L) | `KNOWN_VARS` fragment matrix (which steps get `concernsYaml` / `humanInvolvementCriteria`) and var descriptions | `:12-40`, `:46-171` |
| `src/core/records/review-schema.ts` (104 L) | Generates the review schema with the agent's allowed disposition enum; declares `remarkable` and `newConcerns` | `:5-104` |
| `src/cli/status.ts` (128 L) | `factory status`: concern counts line + blocking vs digest question split + recorded debt | `:84-124` (counts `:106-108`) |
| `src/core/steer.ts` (188 L) | Mailbox writer: deterministic id fallback, never clobbers an operator answer | `:63-110` |

### 1.3 Schemas, config, prompts, docs

| Area | Files |
|---|---|
| Artifact schemas with `concerns`/`remarkable` | `config/schemas/developer-output.schema.json:61-83`, `fact-finder-output.schema.json:22-40`, `plan.schema.json:120-158`, `decisions.schema.json:48-95` (+`concernConfirms` `:73-83`, `concernResolution` `:84-95`), `review.schema.json:47-99` (`remarkable` 47-58, `newConcerns` 59-99), `wave-closeup.schema.json:35-70`, `plan-closeup.schema.json:27-70` |
| State/pipeline schemas | `config/schemas/state.schema.json:72-100` (required counts), `pipeline.schema.json:203-229` (`humanInvolvement`, `concerns`) |
| Config | `config/pipeline.default.yaml:359-376` (reviewPolicy), `:378-432` (§18 block: mode, allowlist, thresholds, commented presets, ADR blocking table), `:434-456` (criteria registry); `config/project.template.yaml:11` (`adrFolder: docs/adr`) |
| Prompts | `agents/criteria/human-involvement.md` (mode table + per-mode sections), `agents/steps/review.md:15-24`, `agents/steps/plan-review.md:14-37`, `agents/steps/qa.md:30+`, `agents/steps/develop.md:21-22`, `agents/steps/architect-*.md` (all bind `humanInvolvementCriteria`/`concernsYaml`), `agents/architect.md:33` (ADR blocking rule) |
| Docs | `plugins/software-factory/docs/ARCHITECTURE.md` (409 L; §1 row `:39`, §5 `:117`, §6.2 `:186-196`, §8.7 `:282-294`, §8.8 `:296-299`, §10 `:341-356`, §11 `:358-367`, §13 `:404-406`), `README.md` (122 L; config `:71-85`, CLI `:87-97`, docs `:99-105`), `docs/FIRE_TEST.md:51` |
| Repo ADRs | `docs/adr/adr-*.md` — 16 files, one paragraph each, listing the problem each decision solved (see §3.9) |

---

## 2. Key Interfaces & Signatures

### 2.1 Artifact types (`plugins/software-factory/src/core/artifacts.ts`)

```ts
// :301-321
type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
type ConcernSeverity = "low" | "medium" | "high";
type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";
interface Concern { id?: string; kind: ConcernKind; summary: string; detail: string;
  location?: { file: string; line?: number }; severity: ConcernSeverity; affects?: string[] }

// :323-327
interface RemarkableDecision { chosen: string; alternatives: string[]; why: string }

// :329-384
interface ConcernConfirms { id: string; confirm: "accept" | "reject"; note?: string }
interface ConcernResolution { id: string; action: "resolve" | "carry"; note?: string }
interface CloseupConcernResolution { id: string; action: "resolve" | "carry" | "propagate" | "dismiss"; note?: string }
interface ConcernSource { record: string; agent: string; epic?: string; step?: string;
  item?: string; iteration?: number; escalated?: boolean; lastSeen?: string }
interface PendingConcernResolution { action: "resolve"|"carry"|"propagate"|"dismiss"; note?: string; by: string; at: string }
interface StoredConcernArtifact extends Concern { id: string; status: ConcernStatus;
  disposition?: ReviewDisposition; dismissReason?: string; source: ConcernSource;
  pendingResolution?: PendingConcernResolution; createdAt: string; updatedAt: string }

// :386-412
type ReviewDisposition = "fix"|"optional"|"architect"|"human-awareness"|"human-async"|"human-stop"|"dismiss";
interface ReviewSuggestion { id; disposition: ReviewDisposition | string; summary; detail?; location? }
interface ReviewArtifact { status; summary; suggestions: ReviewSuggestion[];
  newConcerns?: Concern[]; remarkable?: RemarkableDecision[] }

// :564-583
interface ConcernCounts { open: number; dismissed: number; routed: number; resolved: number }
interface StateArtifact { …, concerns: ConcernCounts, debt?: string[], … }

// :124-131 (PipelineConfig)
humanInvolvement?: "autonomous" | "principal" | "detailed";
concerns?: { raiseAllowlist?: string[]; minDigestSeverity?: ConcernSeverity; minBlockingSeverity?: ConcernSeverity };
```

### 2.2 Store API (`src/core/concerns.ts`)

```ts
type ConcernInput = Pick<Concern, "kind"|"summary"|"location"|"affects"> & Partial<Pick<Concern,"detail"|"severity">>;   // :11-12
concernFingerprint(c: ConcernInput): string                      // :58-60  → c-<10 hex>
aggregateConcerns(ctx, concerns, remarkables = [], opts): Promise<StoredConcernArtifact[]> // :122-166
listConcerns(taskDir)                                            // :169-182
listOpenConcerns(taskDir)                                        // :185-187
countConcerns(taskDir): Promise<ConcernCounts>                   // :194-215
listConcernIds(taskDir): Promise<string[]>                       // :218-228
applyConcernTriage({suggestions, isTriager, …})                  // :250-261
applyCloseupResolutions({resolutions, by, …})                    // :264-271
applyConcernConfirms({confirms, …})                              // :280-304
applyConcernResolution({resolution, by, …})                      // :311-326
applyWaveCloseupFallback({ids, …})                               // :335-351
partitionSuggestions(suggestions, concernIds)                    // :354-362
reconcileConcerns({taskDir, taskWt, repo})                       // :389-406
```

### 2.3 Triage/routing API (`src/core/triage.ts`, `src/core/review-policy.ts`)

```ts
partitionReviewSuggestions(suggestions, concernIds, isTriager): TriagePartition   // :35-50
concernMailboxId(concernId): string            // :52-54 → `q-concern-${id}`
resolveConcernSeverityPolicy(concerns?)        // :67-75  (defaults medium/high)
routeHumanDisposition(ctx, suggestion, concern?): Promise<string | undefined>  // :93-136
isDebtConcern({kind,status,disposition}): boolean                               // :143-149
listHydratedConcerns(taskDir, consumer): Promise<Record<string, unknown>[]>     // :219-231
hydrateStepConcerns(taskDir, {stepRole, diffBytes?, taskDiffBytes?, inputBytes?}) // :234-247
renderConcernsYaml(records, maxBytes = 8000): string                            // :254-286
applyReviewTriage(ctx): Promise<ReviewTriageOutcome>                            // :293-349

isTriagerAgent(agent): boolean                 // review-policy.ts:18-20 (reviewer | plan-reviewer)
resolveReviewAllowed(pipeline, agent, isTriager): string[]  // :27-43 (adds `dismiss` only for triagers)
```

### 2.4 Funnel / ADR / derivation API

```ts
persistAdrs({taskWt, taskDir, adrFolder?, adrs, mode})   // flows/adrs.ts:46-71
blockingAdrDisposition(mode): "human-stop" | "human-async" // :14-18
propagateEpicConcerns({childTaskDir, parentTaskDir, parentWt, epic, concernIds?}) // flows/epic-propagation.ts:152-185
collectRoutedBlockers(taskDir, minBlockingSeverity = "high"): Promise<Set<string>> // derive/task.ts:52-65
blockedByConcern(items, concernBlocked): string[]          // plan/scheduler.ts:60-90
formatHumanInvolvementCriteria(criteria, mode)             // prompts.ts:68-84
formatDispositionsSection(criteria, allowed)                // prompts.ts:90-110
```

---

## 3. Relevant Excerpts & Semantics

### 3.1 Store identity, dedup and merge (spec 91)

- Fingerprint = `sha256(JSON.stringify([kind, normalized summary, location.file, location.line])).slice(0,10)` with prefix `c-` (`concerns.ts:51-60`). `affects`, `detail`, and `severity` are **not** part of identity; affects are unioned on merge (`:50`, `:76-78`) — the fix captured by `docs/adr/adr-fingerprint-affects-union.md`.
- Remarkable id = `rm-<10 hex>` over normalized `chosen` + sorted `alternatives` (`concerns.ts:53`, `:89-97`).
- Merge rules (`concerns.ts:69-97`): keeps the **longer** detail, the **max** severity, preserves the existing kind/summary/status, unions affects, tracks `source.lastSeen`; a severity increase on an already-dismissed concern sets `source.escalated: true` (`:74`) so the dismissal still surfaces as a digest (`triage.ts:103-119`).
- Files land in `{taskDir}/concerns/<id>.yaml`, written under a per-task keyed mutex and committed immediately unless `commit:false` (`concerns.ts:121-166`). `taskDir` is the task-branch path (`engine.ts:337`) — rationale in `docs/adr/adr-concern-store-taskwt.md`.
- Legacy migration: a pre-union fingerprint file matching kind+summary+location is rename-merged when the new payload carries a detail (`concerns.ts:99-119`, `:139-147`).
- Startup reconcile rebuilds missing concern files from committed step records, idempotently (`concerns.ts:389-406`; engine `:383-394`); the store is committed before stray-dirt repair so it is never stashed (`engine.ts:342-347`).

### 3.2 Per-step ingest order (`src/core/flows/step-runner.ts:194-322`)

1. Collect `concerns`, `newConcerns`, `remarkable`, `suggestions`, `concernResolutions`, `concernConfirms`, `concernResolution` from the validated output (`:199-204`).
2. Gate by `concerns.raiseAllowlist` on `source.agent` (never the step fragment); a skip keeps the step `ok` and only journals `concern_ingest_skipped` (`:217-231`).
3. Compute `existing` = concern filenames that existed **before** this step, so a step can never triage/dismiss its own new concerns (`:233-240`).
4. Pre-flight accepted `dismiss` proposals require a note, before any mutation (`:242-259`).
5. `aggregateConcerns` (`:260`).
6. `applyReviewTriage` with `isTriagerAgent(agent)` and severity policy (`:261-275`).
7. `applyCloseupResolutions` for `concernResolutions` (`:276`).
8. Decision-level `concernResolution` only honored for `consult-concern-<id>`, `architect-closeup*`, `architect-wave-report*`; otherwise journaled as `concern_resolution_ignored` (`:278-301`).
9. Architect `concernConfirms` apply pending proposals; accepted `propagate` proposals push to the parent (epic/saga) store (`:303-316`).
10. Wave close-up fallback for concerns predating the step (`:318-321`).

### 3.3 Triage + `dismiss` (spec 92)

- Only `reviewer` and `plan-reviewer` are triagers (`review-policy.ts:18-20`); close-ups are deliberately **not** triagers — rationale `docs/adr/adr-closeup-no-suggestions-triage.md`.
- Triage happens through `suggestions[]` whose `id` equals a stored concern/remarkable id; partition is exact-id only, so ordinary findings pass through unchanged (`triage.ts:35-50`).
- `dismiss` requires non-empty `detail` (the reason); enforced twice — in `applyReviewTriage` before mutation (`triage.ts:305-311`) and in `applyConcernTriage` (`concerns.ts:255`). Dismissed records keep `status: dismissed`, `disposition: dismiss`, `dismissReason` and stay in `concerns/` (`concerns.ts:256-258`).
- Non-dismiss triage sets `status: routed` + `disposition` (`concerns.ts:256-258`).
- Allowed-disposition resolution: per-agent list > `reviewPolicy.default` > legacy `allowedDispositions` > builtin `[fix, optional, architect, human-awareness, human-async]`; `dismiss` is appended for triagers and stripped for everyone else (`review-policy.ts:4-43`).
- The same allowed set drives the generated review schema enum (`src/core/records/review-schema.ts:5-48`, resolved at `step-runner.ts:409-416`).
- Item-level review wiring: `dispositionsCriteria: formatDispositionsSection(criteriaBundle.dispositions, reviewAllowed)` (`item-machine.ts:649`); plan review does the same for `plan-reviewer` (`iteration.ts:537-544`).

### 3.4 Human routing: blocking vs digest (spec 93, 98)

`routeHumanDisposition` (`triage.ts:93-136`) is the single router:

- Applies to dispositions `human-awareness|human-async|human-stop`, routed remarkables (`rm-*`), and dismissed-but-escalated concerns.
- `digestOnly` = remarkable OR dismissed-escalated OR `human-awareness`. Blocking requires severity ≥ `minBlockingSeverity` (default `high`); below it `human-async`/`human-stop` downgrade to `human-awareness` (a downgraded `stop` loses the exit-10 halt).
- Nothing is surfaced below `minDigestSeverity` (default `medium`) except `rm-*`, which is exempt from both thresholds.
- Ids: `q-concern-<concernId>` (or `q-escalated-<concernId>` for a dismissed escalated concern); `blocks` = `[item?, "task"]` for `human-stop`, `[item ?? "task"]` for `human-async`, `[]` for digests (`:117-134`).
- Mailbox writes are idempotent and never clobber an answered question (`steer.ts:95-106`).
- Raw item-review human dispositions are suppressed when the suggestion id is a concern id, so the router is the only writer (`item-machine.ts:663-665`, `:714-744`).

### 3.5 Routing effects (spec 93)

| Route | Implementation | Tests |
|---|---|---|
| blocker → dependent items blocked + architect consult | `derive/task.ts:52-65` selects kind `blocker` + `status routed` + severity ≥ threshold; `blockedByConcern` computes the transitive fixpoint (`plan/scheduler.ts:60-90`); mapped in `derive/task.ts:174-190`, `derive/item.ts:59-90`, `derive/wave.ts:27-73`; consult per routed blocker before a wave starts and after each act pass (`iteration.ts:179-229`, `:830-856`, `:927-931`), idempotent via the decision artifact | `test/engine/routing-blocker-derive.test.ts:161-415`, `test/engine/routing-architect-consult.test.ts:344-395` |
| `architect` → next architect turn | routed concerns are hydrated into architect consumers (`triage.ts:219-231`, `includeRouted` for architect); a decision may `resolve`/`carry` (`concerns.ts:311-326`) | `test/engine/routing-architect-consult.test.ts`, `test/engine/closeup-lifecycle-resolve.test.ts:404-528` |
| `human-*` → mailbox per policy | `triage.ts:93-136`; mode only chooses `human-stop` vs `human-async` for blocking ADRs (`flows/adrs.ts:14-18`) | `test/engine/human-router-severity.test.ts:197-989`, `test/engine/routing-human-debt.test.ts:90-189` |
| tech debt → plan debt list | `isDebtConcern` = non-open `tech-debt` concern or `optional` disposition, explicitly no `tech-debt` disposition (`triage.ts:138-149`); merged into `debt` (`derive/task.ts:245-250`) and fed to the architect/close-ups | `test/engine/plan-reviewer-triage.test.ts:436`, `test/engine/closeup-lifecycle-resolve.test.ts:528` |

### 3.6 Hydration and the funnel text budget (spec 97)

- Terse record shape drops `detail` (`triage.ts:152-165`); consumers differ: `closeup`/`architect` also see `routed`; only `architect` sees dismissed-escalated (`:219-231`).
- Caps are `min(code size, 2000)` for review/qa, `min(task diff, 2000)` for wave/plan close-up, `min(prompt input, 500)` otherwise (`triage.ts:234-247`, wired at `step-runner.ts:429-448`).
- `renderConcernsYaml` degrades progressively: drop `affects`, then shrink summaries (80→1 chars), then shed trailing records; empty string when nothing fits (`triage.ts:254-286`).
- Epic→saga push condenses: verbatim up to 120 bytes, otherwise halved under a 500-byte cap; summaries prefixed `[epic]` (`epic-propagation.ts:35-36`, `:52-58`, `:141-150`).
- Tests: `test/engine/funnel-text-budget.test.ts:242-482` (UTF-8 byte counting, caps, “always forwards fewer bytes”, prompt vars must be capped before render).

### 3.7 Close-up lifecycle (spec 94)

- Wave/plan close-ups emit `concernResolutions` (`resolve|carry|propagate|dismiss`) and `concernConfirms`-consuming pending proposals; `applyCloseupResolutions` only records `pendingResolution` — status changes on architect confirmation (`concerns.ts:263-304`).
- Accept applies: resolve → `resolved`; carry → `routed` with disposition `architect`; dismiss → `dismissed` + reason from the pending note; propagate → proposal cleared and a copy pushed to the parent store (`concerns.ts:280-316`, `step-runner.ts:303-341`).
- Wave fallback: open tech debt → `optional`, assumptions/risks/questions → `architect`, blockers stay open, never assigns `human-*` (`concerns.ts:328-351`).
- Close-up prompts bind both `humanInvolvementCriteria` and `concernsYaml` (`agents/steps/wave-close-up.md:20-30`, `agents/steps/plan-close-up.md:20-28`).
- Tests: `test/engine/closeup-lifecycle-resolve.test.ts` (accept/reject, error when a dismiss note is missing, consult resolve unblocks the item, fallback debt).

### 3.8 Blocking vs remarkable ADRs (spec 98)

- `PlanAdr` has `blocking?: boolean` with the mode-dependent description (`config/schemas/plan.schema.json:120-134`).
- `persistAdrs` writes full markdown when `project.adrFolder` is set (`config/project.template.yaml:11` → `docs/adr`) and **always** routes to the mailbox: blocking → `human-stop` (autonomous) or `human-async` (principal/detailed) with `blocks: ["task"]`; remarkable → `human-awareness`, no blocks (`flows/adrs.ts:14-71`).
- Called on plan write and again on revise (idempotent) — `iteration.ts:441-451`, `:614-623`; a blocking ADR parks the task before waves (`iteration.ts:469-478`).
- Tests: `test/engine/adr-blocking-digest.test.ts:69-390`.

### 3.9 Human-involvement modes (spec 99-103)

- Config: top-level `humanInvolvement` + `concerns` thresholds/allowlist in `pipeline.schema.json:203-229` and `PipelineConfig` (`artifacts.ts:124-131`).
- Default `config/pipeline.default.yaml:378-432` ships: active `autonomous`, an 8-agent raise allowlist, `minDigestSeverity: medium`, `minBlockingSeverity: high`, three fully commented presets (`autonomous|principal|detailed`), and the ADR/concern blocking table.
- Prompt fragment `agents/criteria/human-involvement.md` holds the shared table plus one section per mode; `formatHumanInvolvementCriteria` keeps the shared sections and only the active `## <mode>` (`prompts.ts:61-84`).
- Per-task selectability is plain config layering (`config/pipeline.default.yaml` → `.factory/pipeline.yaml` → `{task}/pipeline.yaml`), covered by `test/human-involvement-config.test.ts:150-476`.

### 3.10 Surfacing (spec 94)

- `state.yaml`: required `concerns` object `{open,dismissed,routed,resolved}` (`state.schema.json:72-100`, `StateArtifact` `artifacts.ts:564-583`), computed by `countConcerns` (missing dir → zeros; corrupt entry → warn + skip) and attached in `deriveTaskState` (`derive/task.ts:369-385`).
- `factory status`: prints `Concerns: open N | dismissed N | routed N | resolved N`, then splits open operator questions into **Blocking** and **Digest** and lists recorded debt (`cli/status.ts:106-124`).
- Architect hydration for routed items goes through `concernsYaml` only (`iteration.ts:170-177`).
- Tests: `test/engine/state-concern-counts.test.ts:30-120`, `test/cli/status-concerns.test.ts:39-140`.

### 3.11 Repository ADRs written so far (`docs/adr/`)

These are the architect's own one-paragraph decisions from earlier iterations; they should be respected, and two of them are explicitly **documentation** obligations:

| ADR | Decision / deviation |
|---|---|
| `adr-concern-store-taskwt.md` | Aggregate concerns directly to `taskWt/concerns/` because item steps only commit the child worktree; precedent is `writeQuestion`/`refreshStateYaml` |
| `adr-triage-suggestions-dismiss.md` | Triage via `suggestions[]` with `id = concernId` plus `dismiss` (rejected a separate `concernTriage[]`) |
| `adr-human-router-single.md` | One router for all human dispositions; digest entries for awareness/remarkable; kills item-machine double-writes |
| `adr-severity-policy-active.md` | `raiseAllowlist` + digest/blocking thresholds are active semantics |
| `adr-routing-derived-state.md` | Concerns are file-authoritative; routing effects are derived, never forked |
| `adr-fingerprint-affects-union.md` | Fingerprint excludes `affects`; merge unions them |
| `adr-hydration-single-cap.md` | Single hydration module with step-role byte caps, UTF-8 counting |
| `adr-funnel-text-budget.md` | Prompt condensing + hydration cap enforce “less detail per level” |
| `adr-epic-push-condensed.md` | Epic→saga push with condensed `[epic]` copies |
| `adr-digest-mailbox.md` | Digest reuses `tousertoreview` with non-blocking semantics |
| `adr-closeup-lifecycle-resolved.md` | Close-up propose/confirm lifecycle makes `resolved` reachable and unblocks items |
| `adr-closeup-no-suggestions-triage.md` | Close-ups removed from the triager set; re-triage via resolutions + confirms + fallback |
| `adr-humaninvolvement-config.md` | Top-level `humanInvolvement` mode + criteria fragment |
| `adr-prompt-fragment-matrix.md` | Full fragment matrix with raise instructions and preflight checks |
| `adr-autonomous-immediate-halt.md` | **Deviation**: autonomous halts immediately at plan time instead of deferring until unblocked work drains |
| `adr-epic-config-root-only.md` | **Deviation**: epic child tasks do not inherit the parent task's `pipeline.yaml`, so root `humanInvolvement`/`concerns`/`reviewPolicy` overrides do not reach epics |

---

## 4. Requirement → Implementation Evidence (spec `docs/factory.v2.md:89-103`)

| Spec bullet | Evidence | Status |
|---|---|---|
| `concerns[]` `{kind,summary,detail,location,severity,affects}` in every agent output (`:90`) | `artifacts.ts:301-321`; schemas developer-output `:61-83`, fact-finder `:22-40`, plan `:135-158`, decisions `:48-72`, review `newConcerns` `:59-99`, wave-closeup `:35-58`, plan-closeup `:27-50`; contracts test `test/contracts/concern-schemas.test.ts:154-723` | implemented |
| Engine aggregation in `concerns/`, stable fingerprint id, dedup across steps/attempts, status, source record (`:91`) | `concerns.ts:46-166`, `:389-406`; `engine.ts:342-347`, `:383-394`; tests `concerns-funnel.test.ts:320-396`, `:787-844`, `:1130-1262` | implemented |
| Reviewer triage with disposition vocabulary + `dismiss` (logged with reason, kept) (`:92`) | `review-policy.ts:18-43`, `triage.ts:293-349`, `concerns.ts:250-261`; prompts `steps/review.md:20-24`, `steps/plan-review.md:23`; tests `reviewer-triage.test.ts:287-528`, `plan-reviewer-triage.test.ts:151-435` | implemented |
| Routing blocker / architect / human-* / tech-debt (`:93`) | `derive/task.ts:52-65`, `plan/scheduler.ts:60-90`, `iteration.ts:179-229`, `triage.ts:93-149`, `derive/task.ts:245-250`; tests `routing-*.test.ts` (4 files), `human-router-severity.test.ts` | implemented |
| Close-ups list open concerns, re-triage, architect resolves/carries; status/state counts (`:94`) | close-up prompts bind `concernsYaml`; `concerns.ts:263-351`; `state.schema.json:72-100`; `cli/status.ts:106-124`; tests `closeup-lifecycle-resolve`, `state-concern-counts`, `status-concerns` | implemented |
| Configurable raise allowlist / allowed dispositions / severity thresholds (`:95`) | `pipeline.schema.json:203-229`, `artifacts.ts:124-131`, `step-runner.ts:217-231`, `triage.ts:56-75`, `review-policy.ts:27-43`; `test/human-involvement-config.test.ts` | implemented |
| Remarkable decisions/tradeoffs with same aggregation/triage (`:96`) | `artifacts.ts:323-327`, `concerns.ts:53`, `:89-97`, `triage.ts:98-119`, `:200-218`; tests `concerns-funnel.test.ts:713-767`, `human-router-severity.test.ts:275-307` | implemented |
| Funnel worker → reviewer → epic architect → saga architect → human, less detail each level, never more text than the code (`:97`) | item review triage → architect hydration (`triage.ts:219-247`) → epic push (`epic-propagation.ts:141-185`, `engine.ts:266-289`) → human router (`triage.ts:93-136`); `test/engine/funnel-text-budget.test.ts:242-482`, `epic-saga-propagate.test.ts:192-500` | implemented (see Q5/Q6) |
| Blocking vs non-blocking ADRs; remarkable in digest, never waits (`:98`) | `flows/adrs.ts:14-71`, `iteration.ts:441-451`/`:614-623`; `test/engine/adr-blocking-digest.test.ts:286-390` | implemented |
| Human modes `autonomous|principal|detailed` as config presets + prompt fragments, per-task selectable (`:99-103`) | `config/pipeline.default.yaml:378-432`, `agents/criteria/human-involvement.md`, `prompts.ts:61-84`, `human-involvement-config.test.ts:150-476` | implemented, with two documented deviations (Q2, Q3) |
| ARCHITECTURE / README / config commentary update | config commentary done (`pipeline.default.yaml:359-432`); ARCHITECTURE and README **not** updated | **open** |
| Terse, debloated prompts | every agent/step fragment is 33–46 lines; `test/prompts.test.ts:401-520` enforces ≤15 non-empty added lines per fragment and total ≤80 | implemented |

---

## 5. Existing Tests & Conventions

### 5.1 Conventions

- Runner: `bun test` from `plugins/software-factory` (`package.json` scripts: `test`, `typecheck`). Behavior-only tests; no lint/format assertions (per spec item 15).
- Harness: `FakeHarness` replays scripted outcomes by step label (`src/harness/fake/fake-harness.ts`), so tests exercise the real `runAgentStep`/`runTask` paths.
- Repos: `test/helpers/tmp-repo.ts:32-134` creates a temp git repo on `main` with deterministic env, plus worktree/branch helpers and `cleanup()`.
- Assertions are on-disk facts: read `concerns/*.yaml`, `steer/tousertoreview/*.yaml`, `state.yaml`; commits are verified with `git cat-file -e HEAD:<path>` (e.g. `test/engine/concerns-funnel.test.ts:388-395`), not by trusting in-memory results.
- Test files carry a doc comment naming the spec §/ADR they lock (e.g. `concerns-funnel.test.ts:29-36`, `funnel-text-budget.test.ts:242`, `epic-saga-propagate.test.ts:23`).

### 5.2 Concern-related suites (all green)

| File | Locks | Notable lines |
|---|---|---|
| `test/engine/concerns-funnel.test.ts` (1287 L) | schema write gate, store identity/merge, concurrency, reviewer wiring, producer matrix, reconcile, failure journaling | `:37`, `:124`, `:194`, `:320`, `:347`, `:398`, `:467`, `:845`, `:895`, `:935`, `:980`, `:1130`, `:1263` |
| `test/engine/reviewer-triage.test.ts` (699 L) | terse hydration, exact-id partition, byte caps, dismiss with reason, routed persistence, `fixRequired`, deduped mailbox, non-triager no-op, engine-flow blocking | `:39`, `:166`, `:197`, `:230`, `:287`, `:323`, `:371`, `:410`, `:454`, `:499`, `:530` |
| `test/engine/plan-reviewer-triage.test.ts` (513 L) | plan-review hydration, architect-revise concerns, triage ids excluded from the plan fix loop, debt derivation | `:28`, `:151`, `:245`, `:368`, `:436` |
| `test/engine/funnel-text-budget.test.ts` (482 L) | UTF-8 byte counting, truncation at code-point boundary, all hydration caps, “always fewer bytes”, detail condensing, verbatim prompt vars | `:242-482` |
| `test/engine/human-router-severity.test.ts` (1023 L) | plan-reviewer stop, close-up async, architect hydration of routed, remarkable digests, escalated dismissal, threshold suppression/downgrade, allowlist skip, exit 10 / park / downgrade flows | `:197-989` |
| `test/engine/routing-blocker-derive.test.ts` (439 L) | `collectRoutedBlockers`, dependency cascade, terminal/running immunity, task-blocked derivation | `:161-415` |
| `test/engine/routing-architect-consult.test.ts` (444 L) | one decision file, architect hydration, restart idempotency | `:344`, `:395` |
| `test/engine/routing-human-debt.test.ts` (523 L) | item blocking vs task continuation per disposition, halt/exit 10, digest-only | `:90`, `:143`, `:189` |
| `test/engine/closeup-lifecycle-resolve.test.ts` (≈660 L) | accept/reject proposals, missing dismiss note error, consult resolve unblocks, fallback debt, blockers stay open | `:281-598` |
| `test/engine/epic-saga-propagate.test.ts` | `[epic]` copies of open/routed concerns, dismissed stays local, remarkables, saga-architect hydration, deployed child dirs | `:192-660` |
| `test/engine/adr-blocking-digest.test.ts` | ADR markdown, blocking halt, remarkable digest, mode table, no `adrFolder` | `:69-390` |
| `test/engine/state-concern-counts.test.ts` | state counts incl. zeroes and corrupt-skip | `:30-120` |
| `test/cli/status-concerns.test.ts` | counts line, blocking vs digest split, zero state | `:39-140` |
| `test/human-involvement-config.test.ts` | defaults, layering, `null` deletion, schema closure, commented presets, criteria fragment selection, prompt-var registration | `:150-476` |
| `test/contracts/concern-artifact-types.test.ts` (≈500 L) | type-level shape of concerns, lifecycle metadata, `dismiss`, ADR blocking flag, pipeline config, producer typing | `:122`, `:213`, `:242`, `:276`, `:336`, `:434` |
| `test/contracts/concern-schemas.test.ts` (723 L) | inlined concern defs in every producer schema, `newConcerns`, close-up resolutions, untouched triage/infra/edit schemas, confirmations | `:154-632` |
| `test/contracts/state-concern-schema.test.ts` | state schema requires all four counts | `:12-36` |
| `test/prompts.test.ts:401-520` | fragment matrix + prompt-debloat budgets + mode switching inside rendered prompts | `:410`, `:434`, `:464`, `:495`, `:517` |

---

## 6. Documentation Gaps (concrete, cited)

These are the parts of the intent not yet satisfied. Every item below is a **documentation** change, not behavior.

| # | Target | Current state | Needed |
|---|---|---|---|
| D1 | `plugins/software-factory/docs/ARCHITECTURE.md:39` (§1 row 18) | "**Deliberately not hand-built** … Current state: review dispositions (§8.7) and steering mailbox (§8.8) only." | Mark as implemented; point at the concern store, triage/routing, funnel, ADR modes and the new section; keep the two deviations visible |
| D2 | ARCHITECTURE body | Only two mentions of “concern” in the whole file (`:39`, `:348`); no section on the concern store/triage/routing/funnel/human modes | Add a section (natural slots: new `### 8.11 Concerns & remarkable decisions funnel (§18)` after §8.10, or a top-level `## 15`); include the status vocabulary, fingerprint/dedup, triage rules, routing table, byte caps, ADR blocking table |
| D3 | ARCHITECTURE `:282-294` (§8.7 dispositions) | Table lists 6 dispositions; `dismiss` is missing; the note only says the enum is generated from the allowed set | Add the `dismiss` row (triager-only, requires `detail`, kept as `dismissed` with reason) |
| D4 | ARCHITECTURE `:117` (§5) | "pipeline layers … (epics inherit parent task layer)" — contradicted by `src/cli/run.ts:127-139` + `src/core/engine.ts:247` (only the child task dir's `pipeline.yaml` is loaded); recorded in `docs/adr/adr-epic-config-root-only.md` | Correct the claim and state the deviation (root `humanInvolvement`/`concerns`/`reviewPolicy` overrides do not reach epics) |
| D5 | ARCHITECTURE `:186-196` (§6.2 task folder) | Listing omits `concerns/` | Add `concerns/{c-*,rm-*}.yaml` and note the store is engine-owned (committed before stray-dirt repair, `engine.ts:342-347`) |
| D6 | ARCHITECTURE `:341-356` (§10 agents) | Output column only says `developer … concerns[]` | Reflect `newConcerns`/`remarkable` on review outputs and `concerns`/`remarkable`/`concernConfirms`/`concernResolution` on architect decisions, close-ups, plan |
| D7 | ARCHITECTURE `:358-367` (§11 CLI) | `status` described as "tree, items, waves, budgets, open tousertoreview" | Mention concern counts and the blocking/digest split (`cli/status.ts:106-124`) |
| D8 | ARCHITECTURE `:404-406` (§13 testing) | Lists dispositions but not the funnel suite | Add concern funnel coverage (store, triage, routing, funnel budget, ADRs, modes) |
| D9 | `plugins/software-factory/README.md` | **Zero** mentions of concerns, ADRs or human-involvement modes (grep over the whole file) | Add a short section (e.g. under §3 Configuration) covering `humanInvolvement`, `concerns.*`, `reviewPolicy` + triager `dismiss`, and what `factory status` shows; update §5 docs to the new ARCHITECTURE section range (`README.md:99-105` currently says "§0–§14") |
| D10 | `plugins/software-factory/agents/criteria/dispositions.md:1-20` | Table lacks `dismiss`; step prompts explain it ad hoc (`agents/steps/review.md:22-23`, `agents/steps/plan-review.md:23`) | Add a `dismiss` row (triager-only, reason required, kept on disk) — or deliberately document that `dismiss` lives only in step prompts |
| D11 | `plugins/software-factory/config/pipeline.default.yaml:359-376` | `reviewPolicy` commentary lists 6 dispositions, no `dismiss`; §18 block (`:378-432`) is already complete | Mention that triagers get `dismiss` appended automatically (`review-policy.ts:36-42`) and why `human-stop` is absent from the default policy |

---

## 7. Open Questions & Uncertainties (for the architect)

**Q1 — Is the remaining scope purely documentation?** Functionally every spec bullet has an implementation and at least one behavior test (§4). The only unticked intent item is the doc set in §6. If the architect agrees, the iteration should be a small doc milestone (D1–D11) plus verification of the two deviations, not a re-implementation.

**Q2 — Autonomous mode deviation: document or implement drain scheduling?** Spec (`docs/factory.v2.md:100`) says the human is consulted "only for the portion still blocked after everything unblocked is done". Implementation routes blocking ADRs at plan time and halts immediately (`flows/adrs.ts:14-18`, `iteration.ts:469-478`); `docs/adr/adr-autonomous-immediate-halt.md` accepts this as out of scope. Decide whether the doc records it as a deviation (recommended by the existing ADR) or the iteration implements deferred halting.

**Q3 — Epic config inheritance deviation: document or implement?** Root-task `pipeline.yaml` overrides (`humanInvolvement`, `concerns`, `reviewPolicy`) do not reach epic child tasks: `src/cli/run.ts:127-139` loads only `{taskDir}/pipeline.yaml`, and `engine.ts:234-247` passes the child dir. `docs/adr/adr-epic-config-root-only.md` flags this and says implementing inheritance would change config semantics for all tasks. ARCHITECTURE `:117` currently makes the incorrect claim (see D4).

**Q4 — Who triages architect output outside the plan?** Only `plan-review` routes through `plan-reviewer`; architect concerns raised in `architect-consult-item`, `architect-consult-nonitem`, `architect-wave-report` and `architect-closeup` are aggregated (`step-runner.ts:260`) but `isTriagerAgent` is true for `reviewer|plan-reviewer` only (`review-policy.ts:18-20`), and close-ups are deliberately non-triagers (`docs/adr/adr-closeup-no-suggestions-triage.md`). Those concerns stay `open` until an architect turn hydrates them (`triage.ts:219-231`) or the wave fallback runs. Is that acceptable coverage of the spec sentence "architect output → plan-reviewer", or does a wave-report reviewer step need to exist?

**Q5 — Simple tasks have no reviewer.** `simple-implement` accepts `concernsYaml` (`prompt-vars.ts:69-70`) and the developer allowlist covers it, but the simple flow has no review step, so its concerns are never triaged and the wave fallback never runs (no waves). Recorded in `docs/adr/adr-closeup-lifecycle-resolved.md` ("simple items have no reviewer"). Document as a known limitation or add a triage path?

**Q6 — Remarkables are exempt from both severity thresholds.** `routeHumanDisposition` digests every routed `rm-*` regardless of `minDigestSeverity` (`triage.ts:108-115`), so all remarkable decisions become non-blocking mailbox entries. Spec line 103 demands the mailbox show "only funnelled, confirmed, low-noise items". Is unconditional digest the intended noise level, or should remarkables be gated by confirmation/severity?

**Q7 — `state.yaml` counts exclude remarkable decisions.** `countConcerns` only counts files whose name starts with `c-` (`concerns.ts:204`), while `rm-*` files exist in the same folder and are triageable (`listConcernIds` `:218-228`). Spec says "status/state.yaml shows counts" without defining scope. Decide whether remarkable counts belong in `ConcernCounts`/`state.schema.json:72-100`/`cli/status.ts:106-108`.

**Q8 — Legacy fingerprint migration.** `legacyConcern` (`concerns.ts:99-119`, `:139-147`) rewrites pre-union `c-*` filenames by kind+summary+location when the new payload carries a detail. Is this still needed after the fire test, or is it dead migration weight that the doc should either describe or the iteration should delete?

**Q9 — Allowlist duplication.** `DEFAULT_RAISE_ALLOWLIST` (`concerns.ts:35-44`) mirrors `config/pipeline.default.yaml:393-401` by hand. There is no test asserting the two lists agree; decide whether to generate one from the other or add a contract test.

**Q10 — Mailbox digest growth.** Every routed `human-awareness`/remarkable writes a persistent `q-concern-<id>` entry (`triage.ts:117-134`) that `factory status` prints under "Digest Questions" (`cli/status.ts:114-116`). Ids dedupe and answered entries are never clobbered (`steer.ts:95-106`), but there is no aging/archival rule. Is unbounded digest growth acceptable, or should the doc define a retention rule?

**Q11 — Concern store ownership vs stray-dirt repair.** The engine commits `{task}/concerns` before repair (`engine.ts:342-347`) and reconciles from records (`:383-394`), but ARCHITECTURE §6.3.6 (`:205`) does not list `concerns/` among engine-owned paths. Confirm the intended wording when updating D5/D2.

**Q12 — Documented-vs-tested byte caps.** `funnel-text-budget.test.ts` locks caps (2000/2000/500) as behavior; the numbers live only in `triage.ts:239-243` and the tests. If the architect documents them (D2), note they are code constants, not config.

---

## 8. Sources

- Spec: `docs/factory.v2.md:89-103` (item 18), `:104-112` (item 19/20 context), `:76-88` (items 13–17 context)
- Architecture: `plugins/software-factory/docs/ARCHITECTURE.md:39`, `:112-119`, `:179-209`, `:220-318`, `:339-367`, `:404-409`
- README: `plugins/software-factory/README.md:71-105`
- Fire test: `plugins/software-factory/docs/FIRE_TEST.md:51`
- Repo ADRs: `docs/adr/adr-*.md` (16 files)
- Core: `plugins/software-factory/src/core/{concerns,triage,review-policy,artifacts,prompts,prompt-vars,steer}.ts`; `src/core/flows/{step-runner,iteration,item-machine,consults,epic-propagation,adrs}.ts`; `src/core/derive/{task,item,wave}.ts`; `src/core/plan/scheduler.ts`; `src/core/records/review-schema.ts`; `src/core/engine.ts`; `src/cli/{status,run}.ts`
- Schemas: `plugins/software-factory/config/schemas/{developer-output,fact-finder-output,plan,decisions,review,wave-closeup,plan-closeup,state,pipeline}.schema.json`
- Config: `plugins/software-factory/config/pipeline.default.yaml:359-456`; `config/project.template.yaml:11`
- Prompts: `plugins/software-factory/agents/criteria/{human-involvement,dispositions}.md`; `agents/steps/{review,plan-review,qa,develop,fix-round,architect-*}.md`; `agents/architect.md:33`
- Tests: `plugins/software-factory/test/engine/*concern*`, `reviewer-triage`, `plan-reviewer-triage`, `funnel-text-budget`, `human-router-severity`, `routing-*`, `adr-blocking-digest`, `epic-saga-propagate`, `closeup-lifecycle-resolve`, `state-concern-counts`; `test/cli/status-concerns.test.ts`; `test/human-involvement-config.test.ts`; `test/contracts/*concern*`; `test/prompts.test.ts:401-520`; `test/helpers/tmp-repo.ts``). Read code ONLY to verify a specific integration decision (few targeted reads, never broad scans). Translate new unknowns into spike outlines or plan amendments instead of in-turn investigation. Keep terse.
- Outcome options (yield `decision` matching `decisions.schema.json` with `context: "wave"`):
  - `continue`: wave succeeded; proceed to the next scheduled wave.
  - `amend`: revise remaining plan items based on wave learnings or spike results. Yield `outlines` = the NEW or REPLACEMENT PlanItemOutline entries for the amendment (same shape as plan `itemOutlines`: slug, kind, title, description?, milestoneId?, deps?, escalate?), PLUS optional `removeItemSlugs` naming PENDING (never merged/running) items the new items replace, PLUS `planDelta` prose describing the change for the PM. NEVER yield `amend` without `outlines`: an amendment with no new outlines is `continue`.
  - `end-iteration`: halt remaining waves early and transition directly to plan close-up (e.g. goal accomplished early or severe pivot required).
- When an amendment versions or replaces an item (for example a *-v2 copy superseding the original), include the stale original slug in `removeItemSlugs` so the pending original does not linger and run redundantly.
- Integrate spike findings: use `findings.md` and PoC results from finished spikes to inform subsequent item outlines.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.

## Current Plan
{
  "iteration": 4,
  "milestones": [
    {
      "directionalInterfaces": [
        "step-runner (caller) validates producer outputs against the 6 runtime file schemas (callee contract: decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup): lowercase detail accepted, capital-D Detail rejected with step error before any store write; aggregateConcerns/mergeConcern read lowercase detail with longest-wins"
      ],
      "id": "m0-detail-normalize",
      "scenarios": [
        "Given the 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup incl architect-closeup, wave-closeup) plus reference review schema When test/contracts/concern-schemas.test.ts runs Then lowercase detail validates and capital-D Detail is rejected",
        "Given a stored concern with 200-byte detail re-emitted with 20-byte detail When aggregateConcerns merges Then the stored 200-byte detail survives",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass with no regressions"
      ],
      "title": "Detail casing normalization"
    },
    {
      "directionalInterfaces": [
        "item-machine/iteration (callers) -> formatDispositionsSection(criteria, allowed) (callee): allowed excludes dismiss => dismiss rows/rules filtered from prompt criteria text (QA prompt); allowed includes dismiss => rows kept (reviewer prompt); mirrors existing human-stop filtering",
        "review/plan-review step prompts (consumers) <- dispositions.md dismiss row (content contract): single terse row stating triager-only, reason required, kept on disk; prompt text only, independent of the review-schema enum which derives from resolveReviewAllowed"
      ],
      "id": "m1-dismiss-contract",
      "scenarios": [
        "Given dispositions.md When read Then a terse dismiss row (triager-only, reason required, kept on disk) exists",
        "Given a QA prompt (allowed excludes dismiss) and a reviewer prompt (allowed includes dismiss) When rendered Then the QA prompt excludes dismiss rows/rules while the reviewer prompt includes them",
        "Given prompts.test When run Then the fragment matrix and 15-per-fragment/80-total debloat budgets pass",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "title": "Dismiss vocabulary contract"
    },
    {
      "directionalInterfaces": [
        "docs-finish-v5 (caller) documents landed contracts (callees, read-only): store layout, fingerprint/dedup, triage contract, router table, close-up lifecycle, epic condensing, ADR blocking table, presets; deviation history in ARCHITECTURE docs only, never in agents/criteria prompt files; no behavior change",
        "test/docs-concerns.test.ts (caller) asserts doc sentinels (callee content): every needle names content added by docs-finish-v5 and fails on the base tree",
        "allowlist-agreement-test (caller) imports DEFAULT_RAISE_ALLOWLIST from src/core/concerns.ts (callee code) and asserts equality with the shipped concerns.raiseAllowlist in config/pipeline.default.yaml (callee data)"
      ],
      "id": "m2-docs-gates",
      "scenarios": [
        "Given ARCHITECTURE §1 row 18 When read Then it records item 18 implemented with the epic-config, close-up-dismiss, saga-semantics, immediate-halt, and triage-coverage deviations and no 'Deliberately not hand-built'",
        "Given ARCHITECTURE §8.11 When read Then it documents store layout, fingerprint/dedup, remarkable aggregation/triage with threshold-exemption, triage contract, routing table, byte caps as code constants, and the engine-owned concerns/ note",
        "Given ARCHITECTURE §8.11 When read Then it documents close-up propose-confirm incl dismiss, epic condensing, ADR blocking table, presets, c-only counts, and no-retention digest",
        "Given ARCHITECTURE §8.11 When read Then it records the immediate-halt deviation, the triage-coverage limitation (consult/wave-report/closeup via hydration+fallback, simple-task stays open), epic-config root-only, close-up-dismiss, and saga open-only semantics",
        "Given ARCHITECTURE §3/§5/§6.2/§8.7/§10/§11/§13 When read Then modules, config sample with root-only layering, concerns/ folder, dismiss row, outputs, status counts, and funnel suites are all updated",
        "Given README When read Then it has a Concerns & human involvement section with per-task principal/detailed examples and status counts/digest output; given pipeline.default.yaml When read Then reviewPolicy commentary documents dismiss auto-append and the concerns block documents the fragment->agent mapping",
        "Given test/docs-concerns.test.ts When run on base vs branch Then every test fails on base and passes on branch; given the allowlist agreement test When run Then code and shipped allowlists agree",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "title": "Docs closure and gates"
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Normalize concern Detail->lowercase detail in 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) + reference-only review.schema.json for consistency with generated review-schema.ts. One-line TS fix concerns.ts:72 (existing?.Detail -> existing?.detail) restoring longest-wins. Fix ALL capital-D .Detail reads in tests (epic-saga-propagate.test.ts incl :307/313/319 + any others; funnel-text-budget.test.ts). Ensure contract suite asserts lowercase validates + capital-D rejected (add cases if missing); add longest-wins behavior test (200-byte stored survives 20-byte re-emit). triage/infra/pm-edit untouched. Verify typecheck + TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m0-detail-normalize",
      "prodBudgetHint": 30,
      "slug": "schema-detail-normalize-v2",
      "title": "Lowercase detail in producer schemas + merge fix"
    },
    {
      "deps": [],
      "description": "Per adr-dismiss-criteria-row: add terse dismiss row + rule to agents/criteria/dispositions.md; extend formatDispositionsSection (prompts.ts:90-110) to filter dismiss rows/rules when allowed excludes dismiss, mirroring human-stop; add QA-excludes/reviewer-includes render test; keep prompts.test fragment matrix + 15/80 debloat budgets green. Verify typecheck + TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m1-dismiss-contract",
      "prodBudgetHint": 15,
      "slug": "prompts-dismiss-filter",
      "title": "Dismiss criteria row + prompt filtering"
    },
    {
      "deps": [],
      "description": "Test-only (no prod changes): in test/human-involvement-config.test.ts ONLY, replace the local DEFAULT_RAISE_ALLOWLIST duplicate (:46-55) with an import of DEFAULT_RAISE_ALLOWLIST from src/core/concerns.ts, so the existing assertion (:154-157) directly locks code-vs-shipped-yaml agreement. No new test file; no third copy. Verify typecheck + targeted suite.",
      "kind": "test-only",
      "milestoneId": "m2-docs-gates",
      "prodBudgetHint": 0,
      "slug": "allowlist-agreement-test",
      "title": "Raise-allowlist agreement contract test"
    },
    {
      "deps": [
        "prompts-dismiss-filter",
        "schema-detail-normalize-v2"
      ],
      "description": "Docs closure over landed behavior. Repo sources ONLY (no orchestration artifacts): all files under docs/adr/ (no count assumed; esp. adr-closeup-no-suggestions-triage, adr-epic-push-condensed, adr-autonomous-immediate-halt, adr-epic-config-root-only, adr-funnel-triage-coverage, adr-remarkable-counts-semantics, adr-dismiss-criteria-row), src/core/{concerns,triage,review-policy,prompts}.ts, flows/{step-runner,iteration,epic-propagation,adrs}.ts, cli/status.ts, config/pipeline.default.yaml:359-432. ARCHITECTURE: §1 row 18 implemented + 5 deviations (epic-config root-only, close-up-dismiss via resolutions, saga open-only semantics, immediate-halt, triage-coverage limitation); new §8.11 per m2 scenarios 2a-2c; §3 modules; §5 config sample + root-only fix; §6.2 concerns/ + engine-owned; §8.7 dismiss row; §10 outputs; §11 status; §13 suites; canonical ADR format vs historical notes. README Concerns & human involvement section + §5 range update. pipeline.default.yaml reviewPolicy dismiss auto-append + concerns fragment->agent mapping commentary. Do NOT touch agents/criteria/human-involvement.md (prompt criteria). New test/docs-concerns.test.ts with base-failing sentinels per Decision 022 (each needle names added content; verify fail on base, pass on branch). Final gates green with TMPDIR=/tmp.",
      "kind": "story",
      "milestoneId": "m2-docs-gates",
      "prodBudgetHint": 150,
      "slug": "docs-finish-v5",
      "title": "Docs and suite consolidation"
    }
  ],
  "assumptions": [
    {
      "assumption": "Baseline is RED: 6 runtime file schemas declare capital-D Detail with additionalProperties:false (verified by :raw read, e.g. developer-output.schema.json:68); concerns.ts:72 reads existing?.Detail (verified by :raw read) so typecheck fails and longest-wins is dead; epic-saga-propagate and funnel-text-budget tests read .Detail (verified by :raw read). The context-pack 445-pass claim is contradicted by file bytes; gates go green only after m0 lands. TMPDIR=/tmp still required for the 2 pre-existing head-guard failures.",
      "why": "Reviewer fix verified on exact bytes this turn; earlier lowercase readings were a rendering artifact. Plan targets red-to-green via m0 before docs."
    },
    {
      "assumption": "Behavior is frozen except Detail->detail normalization, prompts.ts dismiss-row filtering (mirroring human-stop) plus the dispositions.md row (prompt surface). Deviation history goes ONLY in ARCHITECTURE docs, never in agents/criteria prompt files. Legacy fingerprint migration (Q8) is retained as tested, harmless code; allowlist duplication (Q9) is locked by a contract test, not refactored.",
      "why": "Closure iteration: bounding change to the verified gaps avoids regressions and prompt debloat violations."
    },
    {
      "assumption": "Open questions Q2/Q3/Q4/Q5/Q6/Q7/Q10 are resolved document-only via the plan ADRs; operator notified on the four deviations via awareness-plan-2-autonomous-halt-deviation, awareness-plan-3-epic-config-awareness, awareness-plan-4-funnel-triage-coverage-awareness, and awareness-plan-4-remarkable-threshold-exemption-accepted.",
      "disposition": "human-awareness",
      "why": "All are accepted-semantics documentation, not implementation gaps; architect decides, operator informed."
    }
  ],
  "techDebt": [
    {
      "category": "impacting",
      "description": "Pre-existing head-guard failures when TMPDIR sits under .factory-runtime; every gate run needs the TMPDIR=/tmp workaround.",
      "id": "td-tmpdir-split",
      "resolution": "Run all gates with TMPDIR=/tmp; engine fix for the '/.factory' split is out of scope."
    },
    {
      "category": "adjacent",
      "description": "Unapplied spike-saga-commit reviewer optional nits (qualify epic-state precedence, prefix inline paths, scope removeWorktree claim, fold contextPack key). Consumers apply mentally.",
      "id": "td-spike-nits"
    },
    {
      "category": "impacting",
      "description": "Capital-D Detail in 6 runtime-bound file schemas rejects lowercase detail (review.schema.json reference-only, normalized for consistency); mergeConcern reads existing?.Detail so typecheck fails and longest-wins is dead; epic-saga and funnel tests read .Detail.",
      "id": "td-detail-casing",
      "resolution": "Fix in schema-detail-normalize-v2: normalize schemas + concerns.ts:72 + all test reads; contract and longest-wins tests verify; docs-finish-v5 depends on it."
    }
  ],
  "adrs": [
    {
      "context": "agents/criteria/dispositions.md documents fix/optional/architect/human-* but not dismiss, while triagers are allowed dismiss and review/plan-review step prompts explain it ad hoc. Adding the row to the shared criteria file would leak it into non-triager prompts (e.g. QA) unless filtered.",
      "decision": "Add one terse dismiss row + rule to dispositions.md (triager-only, reason required, kept on disk) AND extend formatDispositionsSection to filter dismiss rows/rules when the allowed set excludes dismiss, mirroring the existing human-stop filtering. QA-excludes/reviewer-includes render test locks it; prompts.test debloat budgets must pass.",
      "id": "adr-dismiss-criteria-row",
      "title": "Dismiss row in shared criteria with allowed-set filtering"
    },
    {
      "context": "Spec line 100 says autonomous consults the human only for the portion still blocked after everything unblocked is done; implementation halts immediately at plan time on a blocking ADR. Repo ADR adr-autonomous-immediate-halt.md and awareness item awareness-plan-2-autonomous-halt-deviation record this as accepted.",
      "decision": "Keep immediate halt as the accepted deviation for closure; drain-then-block scheduling stays future work. docs-finish-v5 marks it explicitly in ARCHITECTURE §1 row 18 and §8.11 only; agents/criteria/human-involvement.md is prompt criteria and MUST NOT carry deviation history.",
      "id": "adr-autonomous-immediate-halt",
      "title": "Autonomous immediate halt accepted (restated)"
    },
    {
      "context": "ARCHITECTURE §5 claims epics inherit the parent task layer, but runTaskChild loads only the child task dir pipeline.yaml, so root humanInvolvement/concerns/reviewPolicy overrides do not reach epics. Repo ADR adr-epic-config-root-only.md and awareness-plan-3-epic-config-awareness record this; implementing inheritance would change config semantics for all tasks.",
      "decision": "Document-only: per-task selectability holds per task directory; epic children do not inherit the parent task layer. Record in the §1 row 18 rewrite and corrected §5; no behavior change.",
      "id": "adr-epic-config-root-only",
      "title": "Epic config inheritance documented as deviation"
    },
    {
      "context": "Only plan-review routes architect output through plan-reviewer; architect concerns from consult/wave-report/closeup turns aggregate but stay open until an architect turn hydrates them or wave fallback runs. The simple flow has no review step and no waves, so its concerns are never triaged.",
      "decision": "Accept current coverage as the funnel semantic and document it as a known limitation in §1 row 18 and §8.11: plan/revise output is plan-reviewer-triaged; other architect output is covered by architect hydration + wave fallback; simple-task concerns stay open. No new reviewer step this iteration. Operator notified via awareness-plan-4-funnel-triage-coverage-awareness.",
      "id": "adr-funnel-triage-coverage",
      "title": "Non-plan/simple triage coverage documented as limitation"
    },
    {
      "context": "Routed rm-* remarkables always digest regardless of minDigestSeverity; ConcernCounts/state/status count c-* files only; digest mailbox entries persist with no archival rule.",
      "decision": "Document as accepted semantics in §8.11: remarkables are threshold-exempt digests (never blocking/halting, consistent with the low-noise digest directive), counts scope is c-* only, digest has no retention rule. Any gating/counting/retention change is future work. Operator notified via awareness-plan-4-remarkable-threshold-exemption-accepted.",
      "id": "adr-remarkable-counts-semantics",
      "title": "Remarkable digest exemption and counts scope accepted"
    },
    {
      "context": "isTriagerAgent returns true only for reviewer/plan-reviewer; close-up schemas carry no suggestions[] so close-up re-triage flows through concernResolutions + architect concernConfirms + wave fallback, with dismiss added to the resolution vocabulary. Repo ADR docs/adr/adr-closeup-no-suggestions-triage.md records this.",
      "decision": "Restate for plan traceability: close-ups are non-triagers; re-triage via resolutions + confirms + fallback. §1 row 18 and §8.11 cite docs/adr/adr-closeup-no-suggestions-triage.md; no behavior change.",
      "id": "adr-closeup-no-suggestions-triage",
      "title": "Close-ups removed from triager set; dismiss via resolutions (restated)"
    },
    {
      "context": "Propagated epic copies preserve child affects slugs while parent collectRoutedBlockers matches parent item slugs, so copies stay open by design and only forwarded q-epic questions block. Repo ADR docs/adr/adr-epic-push-condensed.md and epic-saga-propagate tests record this intent.",
      "decision": "Restate for plan traceability: saga architect resolves/steers propagated copies; epic-level blocking reaches the parent only via forwarded questions. §1 row 18 and §8.11 cite docs/adr/adr-epic-push-condensed.md; no behavior change.",
      "id": "adr-saga-funnel-semantics",
      "title": "Propagated copies open-only; questions block (restated)"
    }
  ]
}

## Wave Report
{
  "blockedItems": [],
  "debt": [],
  "failedItems": [],
  "iteration": 4,
  "mergedItems": [
    "docs-finish-v5"
  ],
  "recommendations": [
    "Proceed to architect wave report / next wave; no operator action required.",
    "No tree cleanup needed: only journal.ndjson append is engine-managed and will be baselined by the engine."
  ],
  "status": "complete",
  "summary": "Wave 2 (iteration 4) complete: merged docs-finish-v5 (README/ARCHITECTURE/pipeline.default.yaml docs + test/docs-concerns.test.ts). Tree hygiene clean: 0 untracked files, no .tmp/.bak artifacts, git diff --check clean, no conflict markers in docs/plugins (strict 7-char scan clean; earlier ==== hits are test-log separators inside .factory records only). Sole modified file is engine-managed .factory/tasks/concerns-funnel/journal.ndjson (step_started/timeout append for this close-up). Gates vs baseline (judged ONLY from Gate Diff table): typecheck pass->pass green (no regression), test fail->pass IMPROVED (pre-existing head-guard TMPDIR failures resolved). No failed or blocked items.",
  "wave": 2
}

## Tech Debt
--- Prior Plan plan-1.1.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "artifacts.ts: Concern, RemarkableDecision,
        StoredConcernArtifact(+pendingResolution?, source.escalated?),
        ReviewDisposition+dismiss (no tech-debt), PlanAdr.blocking,
        PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeveri\
        ty,minBlockingSeverity}, reviewPolicy.default canonical"
      - "config/schemas: shared concern/remarkable partial in developer,
        fact-finder, qa, poc, test-assumptions, review newConcerns, plan,
        decisions, wave/plan-closeup, architect reports; triage/infra/pm-edit
        out of scope; dismiss detail-required; closeup concernResolutions"
      - "src/core/concerns.ts: concernFingerprint(identity),
        aggregateConcerns(merge+escalated), listOpenConcerns,
        applyConcernTriage(exact-id,isTriager), applyCloseupResolutions,
        partitionSuggestions(triage vs findings)"
      - "src/core/review-policy.ts:
        resolveReviewAllowed(pipeline,agent,isTriager)
        per-agent>default>builtin, legacy allowedDispositions alias, dismiss
        auto-append for triagers; generateReviewSchema uses it; taskWt
        runExclusive+atomic+immediate-commit helper"
    id: m1-contracts-aggregate
    scenarios:
      - Given a developer step emitting a blocker concern When the step commits
        Then concerns/c-<fp10>.yaml exists with status open and source.record
        pointing at the step record
      - Given the same concern re-emitted on retry When aggregation runs Then
        exactly one file exists, prior dismissed/routed preserved,
        updatedAt/lastSeen advance
      - Given a concern missing severity and detail When validation runs Then
        severity defaults to medium, detail defaults to summary, and the file is
        created
      - Given a concern with unknown kind When validation runs Then the step
        errors, no concerns file is written, existing files stay untouched
      - Given developer, fact-finder, qa, poc, review-new, plan, consult,
        closeup, and architect-report outputs carrying concerns[]+remarkable[]
        When steps commit Then each aggregates to concerns/c-*.yaml or rm-*.yaml
        with open status and source pointer; triage/infra/pm-edit carry none
      - Given reviewer output with new concerns[] plus suggestions triaging a
        pre-existing id When the step commits Then the new concern aggregates
        open and only the pre-existing id is triaged (no same-step self-dismiss)
      - Given reviewPolicy.default [fix,optional] plus reviewer override
        [fix,optional,architect] When resolveReviewAllowed runs Then reviewer
        triager gets override+dismiss and QA non-triager gets default without
        dismiss
      - Given a dismissed concern re-emitted with higher severity When merge
        runs Then status stays dismissed but source.escalated=true and the
        escalation appears in digest and architect hydration
    title: Contracts and aggregation foundation
  - directionalInterfaces:
      - "prompt-vars KNOWN_VARS+descriptions: concernsYaml in steps/review,
        steps/plan-review, steps/wave-close-up, steps/plan-close-up,
        architect-plan, architect-wave-report, architect-closeup,
        architect-consult-*; humanInvolvementCriteria in review, plan-review,
        architect-*"
      - item-machine review + iteration plan-review promptVars and writeArtifact
        with isTriager gate, partitionSuggestions excluding triage ids from
        fix-loop/approval/normal mailbox, fix-on-concern fixRequired once,
        mailbox dedup q-concern-<cid>
      - agents reviewer, plan-reviewer, criteria/dispositions,
        criteria/human-involvement terse confirm/dismiss/condense plus blocking
        table plus condensing rule output-bytes<input-bytes
      - config/pipeline.default.yaml commented autonomous/principal/detailed
        presets with blocking table plus concerns raise/threshold examples
    id: m2-triage-modes
    scenarios:
      - Given open item concerns When review runs Then steps/review receives
        concernsYaml with id/kind/severity/summary/affects and terse triage
        instructions
      - Given reviewer suggestion matching a concern id with disposition dismiss
        and detail When review commits Then that file has status dismissed plus
        dismissReason=detail and no mailbox, debt, blocked, or approval effect
      - Given a matching dismiss suggestion without detail When review commits
        Then the step errors and no triage is persisted
      - Given QA emitting a matching concern id When QA commits Then no triage
        is applied and the file stays open
      - Given matching suggestions with fix, optional, architect, or human-*
        When review commits Then each file becomes routed with disposition
        persisted; triage ids are excluded from normal fix-loop/approval/mailbox
        except fix-on-concern sets fixRequired once; human-async on a concern
        writes a single q-concern-<cid>
      - Given architect plan concerns plus an rm-* file When plan-review runs
        Then plan-reviewer triages with the same vocabulary and non-dismissed
        files become routed; debt predicate is kind==tech-debt&&routed or
        disposition==optional (no tech-debt disposition)
      - Given pipeline.yaml humanInvolvement principal When reviewer and
        architect prompts render Then the mode criteria fragment is included and
        preflightPrompts passes
    title: Reviewer triage and modes
  - directionalInterfaces:
      - derive/task.ts collectRoutedBlockers(taskDir)->Set plus
        deriveWave/deriveItem integration;
        scheduler.blockedByConcern(items,concernBlocked) pure reusing
        blockedByFailure fixpoint, unioned, cascade only over declared deps
      - "act-phase routing: triage writeArtifact plus wave-act newly-blocked
        check writing decisions/concern-<cid>.yaml exactly once (restart
        idempotent); buildArchitectHydration extended with concernsYaml digest"
      - steer writeQuestion for human-async/stop/blocking ADR; derive/task
        blocking-vs-digest split (blocks.length>0 vs awareness empty); debt
        predicate; human-stop exit-10 halt plus blocked
    id: m3-routing
    scenarios:
      - Given a routed blocker whose affects names a declared dependent When
        derive runs Then the dependent derives blocked with no writes;
        non-dependents are unaffected and transitive blocking follows declared
        deps only
      - Given a newly blocked dependent When the act phase runs Then exactly one
        decisions/concern-<cid>.yaml is written and a restart writes no second
        file
      - Given a routed architect concern When the next architect turn builds
        hydration Then its concernsYaml input contains that concern id and
        summary
      - Given a routed human-async concern When routing runs Then mailbox
        q-concern-<cid> has blocks=[item], the item derives blocked, and the
        engine continues without exit 10
      - Given a routed human-stop concern When routing runs Then the mailbox
        entry blocks task/item, item and task derive blocked, and the engine
        halts with exit code 10 until answered or dismissed
      - Given a routed human-awareness concern When routing runs Then the
        mailbox entry has blocks=[] in the Digest section and the engine
        continues with no blocked set and no exit 10
      - Given plan ADRs blocking true and false under autonomous mode When plan
        commits Then the blocking ADR creates a mailbox question with blocks
        while the remarkable ADR appears only in the digest; debt includes kind
        tech-debt routed or disposition optional routed as [item] summary
    title: Routing to blocked, architect, mailbox, debt
  - directionalInterfaces:
      - closeup schemas concernResolutions resolve/carry/propagate plus
        concerns[]/remarkable[];
        StoredConcern.pendingResolution{action,note,by,at};
        applyCloseupResolutions proposes (status stays routed); architect
        concernConfirms accept/reject applies; propagate to parent concerns/
        copy or human digest
      - "iteration.ts concernsYaml hydration capped UTF-8 bytes: code steps
        min(diffBytes,2000); zero-diff orchestration min(inputBytes,500);
        reviewer/architect condensing prompts require output<input; engine
        truncates hydrated var only"
      - engine.ts runChildTask propagateEpicConcerns after child completion
        before cleanup/merge, condensed copies with source.epic, parent
        hydration extended; size assert parent-detail<child-detail
      - derive/task.ts toStateArtifact().concerns counts (missing dir zeros,
        corrupt skip+warn); cli/status.ts Concerns plus separate Blocking vs
        Digest sections
    id: m4-funnel-surface
    replanAfter: true
    scenarios:
      - Given wave diff 5000 bytes and open concerns 3000 bytes When
        wave-close-up hydrates Then concernsYaml is <=2000 bytes and < wave diff
        in UTF-8 bytes
      - Given zero-diff plan-review with 4000-byte input When hydrating Then
        concernsYaml is <=500 bytes and < input bytes
      - Given wave-close-up emitting concernResolutions resolve/carry/propagate
        When it commits Then files stay routed with pendingResolution set;
        architect accept applies resolved/routed/propagated and reject clears
        pending
      - Given a simple item with open concerns and no reviewer When
        wave-close-up runs Then explicit resolutions triage them; fallback
        auto-routes kind tech-debt to optional (debt) and other kinds to
        architect (carry); human-* is never auto-routed
      - Given a child epic finishing with one dismissed and one open concern
        with 800-byte detail When runChildTask completes before cleanup Then the
        parent gains exactly one condensed copy with source.epic, detail <800
        bytes, hydrating saga architect concernsYaml
      - Given mixed-status concerns plus a corrupt yaml file When state
        refreshes and factory status runs Then state.yaml counts skip the
        corrupt file with warn, missing dir yields zeros, and CLI shows Concerns
        plus Blocking vs Digest sections
    title: Funnel, close-ups, saga, surfacing
  - directionalInterfaces:
      - docs/ARCHITECTURE.md §1 row 18 + §6.2 concerns/ + §8
        funnel/routing/modes/partition/producer-matrix/resilience/exit-10,
        README.md, config commentary, agents/criteria/dispositions.md human-stop
        exit-10 preserved
      - "fragment matrix (8 fragments) + debloat check: each fragment ≤15 lines,
        total growth ≤60 lines, preflight plus line-count assertion in
        prompts.test"
    id: m5-docs
    scenarios:
      - Given implementation complete When docs are read Then ARCHITECTURE,
        README, config commentary, and dispositions describe concerns lifecycle,
        funnel sizes, partition, producer matrix, exit-10, modes, and counts
        with terse prompts
      - Given prompt fragments When prompts.test runs Then KNOWN_VARS plus
        descriptions cover all 8 fragments and added lines respect ≤15/≤60
        budgets
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    title: Docs and suite consolidation
uncertainties:
  - description: Funnel byte budget per-level sources, zero-diff rule, and
      bytes-vs-chars unit needed before close-up hydration.
    id: u-text-budget
    spikeOutlines:
      - test-assumptions spike-text-budget verifies code min(diff,2000) and
        zero-diff min(input,500) UTF-8 bytes with output<input condensing
  - description: Epic propagation timing plus taskWt serialization/restart behavior
      and pure-derive versus act-phase boundary needed before store, blocker
      derive, and saga propagation.
    id: u-saga-propagation
    spikeOutlines:
      - fact-finder spike-saga-commit verifies parent-copy timing, runExclusive
        serialization, immediate commit idempotency, collectRoutedBlockers
        owner, and hydration seam
itemOutlines:
  - deps: []
    description: "test-assumptions: measure item/wave diff bytes vs concern detail
      sizes; confirm per-level caps code min(diff,2000) and zero-diff
      min(input,500) UTF-8 bytes, condensing output<input, no 500-floor
      violation. Finding record only, no prod code; gates funnel-closeups."
    kind: test-assumptions
    milestoneId: m1-contracts-aggregate
    slug: spike-text-budget
    title: "Spike: funnel byte budget"
  - deps: []
    description: "fact-finder: verify runChildTask copy timing before cleanup/merge,
      parent buildArchitectHydration extension point, taskWt runExclusive
      serialization under 4 parallel items, immediate commit plus restart
      idempotency, pure-derive vs act-phase boundary with collectRoutedBlockers
      owner. Finding only; gates concerns-store, routing-blocker-derive,
      saga-propagate."
    kind: fact-finder
    milestoneId: m1-contracts-aggregate
    slug: spike-saga-commit
    title: "Spike: saga propagation, commit, derive boundary"
  - deps: []
    description: "Types plus schemas for producer matrix (developer, fact-finder,
      qa, poc, test-assumptions, review newConcerns, plan, decisions,
      wave/plan-closeup with concernResolutions, architect reports) via shared
      partial; triage/infra/pm-edit out of scope. Canonical
      reviewPolicy.default, legacy alias,
      resolveReviewAllowed(pipeline,agent,isTriager) precedence plus dismiss
      injection, generateReviewSchema, dismiss detail-required, pipeline
      humanInvolvement plus concerns thresholds. Tests: typecheck, preflight,
      repair defaults vs strict reject unknown kind."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts
    title: Concern contracts and canonical review policy
  - deps:
      - concerns-contracts-policy
      - concerns-contracts-schemas
      - concerns-contracts-types
    description: Implement src/core/concerns.ts (fingerprint identity,
      merge+escalated, aggregate/list/triage/closeup/partition, atomic YAML +
      KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll, restart
      idempotent). NEVER wrap commitAll in repo.writeLock.runExclusive
      (deadlock). Explicit taskWt path, one file per fingerprint, concerns/**
      startup recovery + reconcileConcerns from committed records (derive
      read-only), ingest errors must not change step status. Wire all producer
      seams incl consult writeArtifact; reviewer aggregates new then triages
      pre-existing only. Spike-saga-commit findings authoritative (no re-run).
      Behavior tests in test/engine/concerns-funnel.test.ts. Run TMPDIR=/tmp bun
      test.
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-store
    title: Concerns store with merge and commit
  - deps:
      - concerns-store
    description: "Item reviewer triage with concernsYaml in steps/review, isTriager
      gate, exact-id partition excluding triage ids from
      fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox
      dedup q-concern-<cid>, dismiss detail to dismissReason, condensing
      output<input, debt predicate without tech-debt disposition. Behavior
      tests: dismiss no routing, routed persist, QA gate no-op, missing detail
      errors, fix-once, no double mailbox."
    kind: story
    milestoneId: m2-triage-modes
    slug: reviewer-triage
    title: Workhorse reviewer triage
  - deps:
      - concerns-store
    description: "Architect path: aggregate plan/revise concerns plus remarkable
      rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition
      and dismiss vocabulary, non-dismissed become routed. Behavior tests:
      dismissed vs routed, rm-* triaged, debt predicate, no approval trigger
      from triage ids."
    kind: story
    milestoneId: m2-triage-modes
    slug: plan-reviewer-triage
    title: Plan-reviewer triage
  - deps:
      - concerns-contracts-policy
      - concerns-contracts-schemas
      - concerns-contracts-types
    description: "humanInvolvement + concerns thresholds schema/loader/merge,
      commented autonomous/principal/detailed presets with blocking table,
      agents/criteria/human-involvement.md terse fragment, KNOWN_VARS
      concernsYaml + humanInvolvementCriteria wired per fragment matrix.
      Behavior: mode switch changes criteria and blocking-ADR behavior;
      preflight green. Precedes all routing."
    kind: story
    milestoneId: m2-triage-modes
    slug: modes-prompts
    title: Modes, thresholds, prompt wiring
  - deps:
      - modes-prompts
      - plan-reviewer-triage
      - reviewer-triage
    description: "Pure derive only: derive/task.ts
      collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration
      (thread blockedBy into deriveItemState or post-process before every
      deriveWaveState call), scheduler.blockedByConcern reusing fixpoint, union
      with failure-blocked, cascade only declared deps, no writes. Spike
      findings authoritative. Behavior: dependent blocked, non-dep unaffected,
      transitive via deps only."
    escalate: true
    kind: story
    milestoneId: m3-routing
    slug: routing-blocker-derive
    title: Blocker derive
  - deps:
      - modes-prompts
      - routing-blocker-derive
    description: "Act phase only: wave-act newly-blocked check writes
      decisions/concern-<cid>.yaml exactly once (restart idempotent) plus
      buildArchitectHydration concernsYaml extension for wave-report/next-plan.
      Behavior tests: single consult file, restart no duplicate, architect input
      contains id+summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-architect-consult
    title: Architect consult and hydration
  - deps:
      - reviewer-triage
      - modes-prompts
    description: "human-async blocks [item] and continues, human-stop blocks
      task/item plus exit-10 halt plus blocked derive, awareness blocks []
      digest never blocking/exiting, debt predicate kind tech-debt routed or
      disposition optional routed. Behavior tests: mailbox files per
      disposition, exit 10 on stop, awareness continues, debt includes [item]
      summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-human-debt
    title: Human mailbox and debt routing
  - deps:
      - modes-prompts
      - routing-human-debt
    description: "Full ADR md title/context/decision/consequences/blocking, blocking
      routed per mode table with exit-10 when stop, remarkable digest-only never
      waiting, dispositions.md exit-10 preserved. Behavior tests: blocking
      mailbox+blocks, remarkable digest only."
    kind: story
    milestoneId: m3-routing
    slug: adr-blocking-digest
    title: Blocking vs remarkable ADRs
  - deps:
      - adr-blocking-digest
      - routing-architect-consult
      - spike-text-budget
    description: "Hydrate wave/plan-close-up and architect reports with concernsYaml
      capped per spike (code min(diff,2000), zero-diff min(input,500) UTF-8
      bytes, output<input), concernResolutions pending + architect
      concernConfirms accept/reject, propagate to parent/digest, simple-item
      explicit + auto-route fallback (tech-debt->optional, others->architect,
      human-* never auto). Apply spike nits: cross-check diffs via production
      git() wrapper, add many-concerns 2000B truncation case, clarify trim
      semantics. Behavior: byte budgets, pending/confirm, simple fallback."
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: funnel-closeups
    title: Funnel close-ups and simple triage
  - deps:
      - routing-architect-consult
    description: "runChildTask propagateEpicConcerns: after child completion before
      cleanup/merge (engine.ts:246-274) for every child status, condensed parent
      copies source.epic with parent detail < child, extended parent
      concernsYaml hydration (append LAST, recompute before wave-report);
      forward child human questions to root mailbox. Spike findings
      authoritative. Behavior: one copy, dismissed stays local, saga input
      contains id."
    escalate: true
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: saga-propagate
    title: Epic to saga propagation
  - deps:
      - concerns-store
      - routing-human-debt
    description: "Sole owner StateArtifact.concerns
      {open,dismissed,routed,resolved}, state.schema,
      toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI
      Concerns plus Blocking vs Digest. Behavior tests: counts, missing/corrupt,
      CLI sections."
    kind: story
    milestoneId: m4-funnel-surface
    slug: status-state-surface
    title: State counts and status surfacing
  - deps:
      - funnel-closeups
      - modes-prompts
      - saga-propagate
      - status-state-surface
    description: "Update ARCHITECTURE section 1 row 18 plus 6.2 plus 8, README,
      config commentary, dispositions.md; fragment matrix plus 15/60 debloat
      check; consolidate test/engine/concerns-funnel.test.ts plus steer/CLI
      coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test."
    kind: story
    milestoneId: m5-docs
    slug: docs-finish
    title: Docs and suite consolidation
  - deps: []
    description: "Types only. In src/core/artifacts.ts add
      Concern/ConcernKind/ConcernSeverity/ConcernStatus, RemarkableDecision,
      StoredConcernArtifact (+pendingResolution?, source.escalated?),
      ReviewDisposition+dismiss (no tech-debt value), PlanAdr.blocking,
      PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeverity\
      ,minBlockingSeverity}, reviewPolicy.default canonical + legacy
      allowedDispositions alias in type. No JSON, no runtime, no repair
      (deferred to concerns-store). Verify: bun run typecheck. Prod budget <=80
      lines."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-types
    title: Concern artifact types
  - deps:
      - concerns-contracts-types
    description: "Schemas only. Inline (no cross-file $ref) shared
      concern/remarkable definitions into developer-output, fact-finder-output,
      qa, poc, test-assumptions, review newConcerns, plan, decisions,
      wave/plan-closeup (+concernResolutions), architect wave-report/closeup;
      triage/infra/pm-edit untouched. severity/detail optional (runtime defaults
      in store); kind strict enum so unknown kind fails validation with no
      write. Dismiss detail-required at runtime, not JSON schema. Verify:
      typecheck + prompts.test preflight + one FakeHarness case in
      test/engine/concerns-funnel.test.ts. Budget <=200 lines JSON."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-schemas
    title: Concern producer schemas
  - deps:
      - concerns-contracts-types
    description: "Resolver only. New src/core/review-policy.ts
      resolveReviewAllowed(pipeline,agent,isTriager): per-agent > default >
      builtin [fix,optional,architect,human-awareness,human-async]; legacy
      allowedDispositions read-alias for default; append dismiss iff isTriager.
      Wire into item-machine review promptVars, step-runner schema path,
      iteration plan-review prompt+schema, generateReviewSchema. QA never
      dismiss. Verify: typecheck + FakeHarness (reviewer accepts dismiss, QA
      rejects). Budget <=100 lines."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-policy
    title: Canonical review-policy resolver
assumptions:
  - assumption: Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures
      do not mask regressions.
    why: Baseline red only under .factory-runtime TMPDIR; suite green with
      TMPDIR=/tmp. Out of scope.
  - assumption: Concern identity excludes detail and severity per
      adr-fingerprint-merge; reworded detail merges and severity escalations
      surface via escalated flag without reopening.
    why: Prevents trivial-reword duplicates while keeping escalation visible to
      architect and digest.
  - assumption: buildArchitectHydration does not read parent concerns/ today;
      saga-propagate extends it with concernsYaml, and runChildTask copies
      condensed epic concerns to parent concerns/ after child completion but
      before cleanup/merge per spike-saga-commit.
    why: Corrects the prior hydration assumption; defines the copy timing and seam
      the spike must verify.
  - assumption: Per-mode blocking table in adr-humaninvolvement-config is
      authoritative for iteration 1; raise allowlist defaults to all agents.
    why: Unblocks routing without operator tuning; task pipeline.yaml can override.
  - assumption: Dismissed concerns stay dismissed on severity escalation but appear
      as escalated notes in digest and architect hydration.
    disposition: human-awareness
    why: Surfaces the hidden-escalation tradeoff to the operator without
      auto-reopening triaged work.
techDebt:
  - category: adjacent
    description: Pre-existing head-guard failures when TMPDIR sits under
      .factory-runtime because step-runner splits on /.factory. Baseline red;
      green with TMPDIR=/tmp. Out of scope.
    id: td-tmpdir-split
  - category: impacting
    description: reviewAllowed resolved in two places with non-canonical
      allowedDispositions key and wrong fallback order, so per-agent dismiss
      could fail schema validation.
    id: td-reviewpolicy-divergence
    resolution: "Fix in concerns-contracts: canonical reviewPolicy.default, legacy
      alias, single resolveReviewAllowed(pipeline,agent,isTriager) with
      precedence and dismiss injection used by prompt and schema paths."
  - category: impacting
    description: ADR writer persists only title plus context and PlanAdr lacks
      blocking; human-stop contract drifted from exit-10.
    id: td-adr-md-truncated
    resolution: "Fix in adr-blocking-digest and routing-human-debt: full md with
      decision, consequences, blocking plus preserved exit-10 halt and
      dispositions.md update."
  - category: impacting
    description: human-awareness and human-stop ignored, debt derivation ignores
      routed concerns, status lists digest as blocking.
    id: td-human-debt-gaps
    resolution: "Fix in routing-human-debt and status-state-surface: stop exit-10
      plus blocked, awareness digest with empty blocks, debt from predicate,
      Blocking versus Digest split."
adrs:
  - context: Item steps commit only childWt while concerns/ lives on taskWt; up to 4
      parallel items share taskDir; retries/restarts must not duplicate or lose
      triage.
    decision: Write directly to taskWt/{task}/concerns/ with writeYamlAtomic plus
      runExclusive taskWt mutex, then immediately commit taskWt when concerns/
      or steer/ changed. Distinct fingerprints are distinct files; same
      fingerprint merges without clobbering dismissed/routed/resolved. Restart
      re-reads files idempotently. Implementation gated by spike-saga-commit
      serialization findings.
    id: adr-concern-store-taskwt
    title: Direct taskWt writes with serialized immediate commit
  - context: suggestions[] reuse conflated concern triage with fix-loop, mailbox,
      and plan-approval triggers; review id is free-form; QA must not triage;
      dismiss needs a reason field.
    decision: "Exact-id match (suggestion.id === c-<hash10> or rm-<hash10>) via
      partitionSuggestions splits triage entries from normal findings. Triage
      ids update concerns/ only and are excluded from
      fix-loop/approval/normal-mailbox paths; fix on a concern id routes as fix
      and returns fixRequired once for the owning item; human-async on a concern
      writes a single q-concern-<cid> (normal path skipped). Dismiss requires
      non-empty detail persisted to dismissReason or the step errors. isTriager
      gate allows only reviewer, plan-reviewer, and close-up/architect chain.
      Reviewer ordering: aggregate new concerns[] first, then triage only
      pre-existing ids from concernsYaml (no same-step self-dismiss)."
    id: adr-triage-suggestions-dismiss
    title: Partitioned exact-id triage with gate
  - context: derive/* must stay pure; debt routing invented an invalid tech-debt
      disposition; consult writes need exactly-once; mailbox needs dedup.
    decision: "Pure derive: derive/task.ts collectRoutedBlockers(taskDir) reads
      routed kind==blocker affects into a Set passed to deriveWave/deriveItem
      and scheduler.blockedByConcern(items, concernBlocked) which reuses the
      blockedByFailure fixpoint pattern, unions with failure-blocked, and
      cascades only over declared deps. Debt predicate: (kind==tech-debt &&
      status routed/resolved) OR (disposition==optional && status routed); no
      tech-debt disposition exists. Act phase (triage writeArtifact plus
      wave-act newly-blocked check) writes decisions/concern-<cid>.yaml exactly
      once, idempotent on restart, and extends buildArchitectHydration with
      concernsYaml."
    id: adr-routing-derived-state
    title: Pure derive plus exactly-once act routing
  - context: Digest must reuse the mailbox without blocking, halting, or spamming
      status; classify handles operator answers, not blocking.
    decision: Digest entries are steer/tousertoreview entries with disposition
      human-awareness and blocks:[]. derive/task splits openSteerQuestions into
      blocking (blocks.length>0) versus digest (awareness plus empty blocks);
      classify only routes answers/directives/stop; status renders separate
      Blocking versus Digest sections.
    id: adr-digest-mailbox
    title: Digest as filtered non-blocking mailbox view
  - context: Spec needs autonomous/principal/detailed presets plus raise allowlist
      and severity thresholds; pipeline root is closed.
    decision: "Top-level PipelineConfig.humanInvolvement (default autonomous) plus
      PipelineConfig.concerns {raiseAllowlist?, minDigestSeverity?,
      minBlockingSeverity?}. Blocking table: autonomous blocks only on blocking
      ADR or high human-stop; principal adds human-async and high severity;
      detailed adds all human-*. Thresholds gate blocking versus digest
      placement. Criteria fragment agents/criteria/human-involvement.md carries
      the table tersely."
    id: adr-humaninvolvement-config
    title: Modes plus raise and severity config
  - context: Funnel requires less detail per level and never more text than code
      summarized, with falsifiable checks and no empty digest on zero-diff
      steps.
    decision: "Per-level UTF-8 byte caps on hydrated promptVars only (stored
      artifacts never truncated): code steps cap min(diffBytes,2000) where diff
      is item diff for review triage and wave aggregated diff for close-ups;
      zero-diff orchestration steps cap min(inputBytes,500) where input is
      plan/context bytes. Reviewer/architect/close-up prompts require condensing
      with output bytes < input bytes. Engine truncates only the hydrated var."
    id: adr-funnel-text-budget
    title: Per-level hydration byte caps
  - context: PipelineConfig type says {default,[agent]} but flows read
      .allowedDispositions as if global; precedence and dismiss injection are
      undefined.
    decision: "Canonical key is reviewPolicy.default with legacy
      reviewPolicy.allowedDispositions as a one-iteration read-alias. Single
      owner src/core/review-policy.ts resolveReviewAllowed(pipeline, agent,
      isTriager): precedence per-agent array > default > builtin
      [fix,optional,architect,human-awareness,human-async]; when isTriager is
      true append dismiss if absent; QA and other non-triagers never receive
      dismiss. Used by both prompt criteria and generateReviewSchema."
    id: adr-reviewpolicy-canonical
    title: Canonical reviewPolicy with triager injection
  - context: Hashing detail/severity duplicates on rewording; excluding them hides
      severity escalation on dismissed concerns.
    decision: "Stable id c-{sha1-10} over {kind, normalizedSummary, location,
      sortedAffects} excluding detail and severity. Normalization trims,
      collapses whitespace, lowercases summary. Re-emit merges: detail keeps
      longer/latest, severity keeps max, updatedAt and source.lastSeen advance,
      never changes dismissed/routed/resolved except via triage or close-up
      resolution. If re-emit severity exceeds stored severity, set
      source.escalated=true and surface the escalation in digest and architect
      hydration without reopening; architect may reopen via close-up
      resolution."
    id: adr-fingerprint-merge
    title: Fingerprint identity, merge, escalation surfacing
  - context: Close-up schemas are closed, wave-close-up has no reviewer, stored
      statuses have no pending, and simple items have no reviewer.
    decision: "Add concernResolutions?: [{id, action: resolve|carry|propagate,
      note?}] plus concerns[]/remarkable[] producer fields to wave/plan-closeup
      schemas and StoredConcern.pendingResolution?: {action,note,by,at}.
      Wave-close-up proposes via applyCloseupResolutions (status stays routed,
      pending set); architect-wave-report confirms via concernConfirms?: [{id,
      confirm: accept|reject, note?}] applying resolved/routed/propagated or
      clearing pending. Propagate targets parent concerns/ copy for epics or
      human digest for task-level unless elevated to blocking ADR. Simple-item
      fallback at wave-close-up: kind tech-debt auto-routes to disposition
      optional (debt), all other kinds to architect (carry); human-* is never
      auto-routed."
    id: adr-closeup-retriage
    title: Close-up pending resolution and simple fallback
  - context: Remarkable {chosen,alternatives,why} needs one authoritative store and
      the same triage vocabulary.
    decision: Authoritative store is concerns/rm-{hash10}.yaml with
      RemarkableDecision plus status and source. Triaged with suggestions[]
      dismiss vocabulary via exact-id match under the same partition and gate.
      Routed remarkables go digest-only unless elevated to a blocking ADR.
    id: adr-remarkable-store
    title: Remarkable decisions in rm- files
  - context: dispositions.md and ARCHITECTURE 8.7 define human-stop as
      tousertoreview plus exit-10 halt, but item-machine treats it fix-like
      running.
    decision: "Preserve exit-10 halt: human-stop writes a mailbox entry with blocks
      covering affected items plus task when task-level, item-machine maps it to
      blocked terminal, derive marks item and task blocked, and the engine halts
      with exit code 10 at the next mailbox check until answered or dismissed.
      Awareness with blocks:[] never enters blocked sets and never triggers exit
      10. Update dispositions.md and ARCHITECTURE 8.7 to keep the contract
      explicit."
    id: adr-human-stop
    title: Human-stop preserves exit-10 halt
  - context: Derive throws on corrupt triage/plan/steer/decisions while concerns/
      proposes skip; one bad concern could fail a whole step.
    decision: Corrupt concerns/*.yaml files are skipped with a warn and excluded
      from counts because concerns/ is an append-only cache rebuildable from
      committed step records; missing concerns/ yields zero counts. A single
      unknown-kind concern fails its step with no partial aggregate and no
      clobber of existing files, forcing prompt/schema drift to surface via
      retry rather than silent loss.
    id: adr-resilience
    title: Corrupt-skip versus strict-fail resilience
  - context: Spec says every agent output may carry concerns[], but not every schema
      has a producer and reviewer has a dual aggregate-plus-triage role.
    decision: "Producer matrix via a shared concern/remarkable partial: developer,
      fact-finder, qa, poc, test-assumptions, reviewer/plan-reviewer new
      concerns[], architect plan/revise, consult decisions, wave/plan-closeup,
      architect wave-report/closeup. Triage, infra, and pm-edit mechanical
      outputs are explicitly out of scope (no LLM synthesis). Consults aggregate
      via runItemConsult/runNonItemConsult writeArtifact. Reviewer ordering:
      aggregate new concerns first, then triage only pre-existing ids."
    id: adr-producer-matrix
    title: Producer matrix and reviewer ordering


--- Prior Plan plan-1.2.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "artifacts.ts: Concern, RemarkableDecision,
        StoredConcernArtifact(+pendingResolution?, source.escalated?),
        ReviewDisposition+dismiss (no tech-debt), PlanAdr.blocking,
        PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeveri\
        ty,minBlockingSeverity}, reviewPolicy.default canonical"
      - "config/schemas: shared concern/remarkable partial in developer,
        fact-finder, qa, poc, test-assumptions, review newConcerns, plan,
        decisions, wave/plan-closeup, architect reports; triage/infra/pm-edit
        out of scope; dismiss detail-required; closeup concernResolutions"
      - "src/core/concerns.ts: concernFingerprint(identity),
        aggregateConcerns(merge+escalated), listOpenConcerns,
        applyConcernTriage(exact-id,isTriager), applyCloseupResolutions,
        partitionSuggestions(triage vs findings)"
      - "src/core/review-policy.ts:
        resolveReviewAllowed(pipeline,agent,isTriager)
        per-agent>default>builtin, legacy allowedDispositions alias, dismiss
        auto-append for triagers; generateReviewSchema uses it; taskWt
        runExclusive+atomic+immediate-commit helper"
    id: m1-contracts-aggregate
    scenarios:
      - Given a developer step emitting a blocker concern When the step commits
        Then concerns/c-<fp10>.yaml exists with status open and source.record
        pointing at the step record
      - Given the same concern re-emitted on retry When aggregation runs Then
        exactly one file exists, prior dismissed/routed preserved,
        updatedAt/lastSeen advance
      - Given a concern missing severity and detail When validation runs Then
        severity defaults to medium, detail defaults to summary, and the file is
        created
      - Given a concern with unknown kind When validation runs Then the step
        errors, no concerns file is written, existing files stay untouched
      - Given developer, fact-finder, qa, poc, review-new, plan, consult,
        closeup, and architect-report outputs carrying concerns[]+remarkable[]
        When steps commit Then each aggregates to concerns/c-*.yaml or rm-*.yaml
        with open status and source pointer; triage/infra/pm-edit carry none
      - Given reviewer output with new concerns[] plus suggestions triaging a
        pre-existing id When the step commits Then the new concern aggregates
        open and only the pre-existing id is triaged (no same-step self-dismiss)
      - Given reviewPolicy.default [fix,optional] plus reviewer override
        [fix,optional,architect] When resolveReviewAllowed runs Then reviewer
        triager gets override+dismiss and QA non-triager gets default without
        dismiss
      - Given a dismissed concern re-emitted with higher severity When merge
        runs Then status stays dismissed but source.escalated=true and the
        escalation appears in digest and architect hydration
    title: Contracts and aggregation foundation
  - directionalInterfaces:
      - "prompt-vars KNOWN_VARS+descriptions: concernsYaml in steps/review,
        steps/plan-review, steps/wave-close-up, steps/plan-close-up,
        architect-plan, architect-wave-report, architect-closeup,
        architect-consult-*; humanInvolvementCriteria in review, plan-review,
        architect-*"
      - item-machine review + iteration plan-review promptVars and writeArtifact
        with isTriager gate, partitionSuggestions excluding triage ids from
        fix-loop/approval/normal mailbox, fix-on-concern fixRequired once,
        mailbox dedup q-concern-<cid>
      - agents reviewer, plan-reviewer, criteria/dispositions,
        criteria/human-involvement terse confirm/dismiss/condense plus blocking
        table plus condensing rule output-bytes<input-bytes
      - config/pipeline.default.yaml commented autonomous/principal/detailed
        presets with blocking table plus concerns raise/threshold examples
    id: m2-triage-modes
    scenarios:
      - Given open item concerns When review runs Then steps/review receives
        concernsYaml with id/kind/severity/summary/affects and terse triage
        instructions
      - Given reviewer suggestion matching a concern id with disposition dismiss
        and detail When review commits Then that file has status dismissed plus
        dismissReason=detail and no mailbox, debt, blocked, or approval effect
      - Given a matching dismiss suggestion without detail When review commits
        Then the step errors and no triage is persisted
      - Given QA emitting a matching concern id When QA commits Then no triage
        is applied and the file stays open
      - Given matching suggestions with fix, optional, architect, or human-*
        When review commits Then each file becomes routed with disposition
        persisted; triage ids are excluded from normal fix-loop/approval/mailbox
        except fix-on-concern sets fixRequired once; human-async on a concern
        writes a single q-concern-<cid>
      - Given architect plan concerns plus an rm-* file When plan-review runs
        Then plan-reviewer triages with the same vocabulary and non-dismissed
        files become routed; debt predicate is kind==tech-debt&&routed or
        disposition==optional (no tech-debt disposition)
      - Given pipeline.yaml humanInvolvement principal When reviewer and
        architect prompts render Then the mode criteria fragment is included and
        preflightPrompts passes
    title: Reviewer triage and modes
  - directionalInterfaces:
      - derive/task.ts collectRoutedBlockers(taskDir)->Set plus
        deriveWave/deriveItem integration;
        scheduler.blockedByConcern(items,concernBlocked) pure reusing
        blockedByFailure fixpoint, unioned, cascade only over declared deps
      - "act-phase routing: triage writeArtifact plus wave-act newly-blocked
        check writing decisions/concern-<cid>.yaml exactly once (restart
        idempotent); buildArchitectHydration extended with concernsYaml digest"
      - steer writeQuestion for human-async/stop/blocking ADR; derive/task
        blocking-vs-digest split (blocks.length>0 vs awareness empty); debt
        predicate; human-stop exit-10 halt plus blocked
    id: m3-routing
    scenarios:
      - Given a routed blocker whose affects names a declared dependent When
        derive runs Then the dependent derives blocked with no writes;
        non-dependents are unaffected and transitive blocking follows declared
        deps only
      - Given a newly blocked dependent When the act phase runs Then exactly one
        decisions/concern-<cid>.yaml is written and a restart writes no second
        file
      - Given a routed architect concern When the next architect turn builds
        hydration Then its concernsYaml input contains that concern id and
        summary
      - Given a routed human-async concern When routing runs Then mailbox
        q-concern-<cid> has blocks=[item], the item derives blocked, and the
        engine continues without exit 10
      - Given a routed human-stop concern When routing runs Then the mailbox
        entry blocks task/item, item and task derive blocked, and the engine
        halts with exit code 10 until answered or dismissed
      - Given a routed human-awareness concern When routing runs Then the
        mailbox entry has blocks=[] in the Digest section and the engine
        continues with no blocked set and no exit 10
      - Given plan ADRs blocking true and false under autonomous mode When plan
        commits Then the blocking ADR creates a mailbox question with blocks
        while the remarkable ADR appears only in the digest; debt includes kind
        tech-debt routed or disposition optional routed as [item] summary
    title: Routing to blocked, architect, mailbox, debt
  - directionalInterfaces:
      - closeup schemas concernResolutions resolve/carry/propagate plus
        concerns[]/remarkable[];
        StoredConcern.pendingResolution{action,note,by,at};
        applyCloseupResolutions proposes (status stays routed); architect
        concernConfirms accept/reject applies; propagate to parent concerns/
        copy or human digest
      - "iteration.ts concernsYaml hydration capped UTF-8 bytes: code steps
        min(diffBytes,2000); zero-diff orchestration min(inputBytes,500);
        reviewer/architect condensing prompts require output<input; engine
        truncates hydrated var only"
      - engine.ts runChildTask propagateEpicConcerns after child completion
        before cleanup/merge, condensed copies with source.epic, parent
        hydration extended; size assert parent-detail<child-detail
      - derive/task.ts toStateArtifact().concerns counts (missing dir zeros,
        corrupt skip+warn); cli/status.ts Concerns plus separate Blocking vs
        Digest sections
    id: m4-funnel-surface
    replanAfter: true
    scenarios:
      - Given wave diff 5000 bytes and open concerns 3000 bytes When
        wave-close-up hydrates Then concernsYaml is <=2000 bytes and < wave diff
        in UTF-8 bytes
      - Given zero-diff plan-review with 4000-byte input When hydrating Then
        concernsYaml is <=500 bytes and < input bytes
      - Given wave-close-up emitting concernResolutions resolve/carry/propagate
        When it commits Then files stay routed with pendingResolution set;
        architect accept applies resolved/routed/propagated and reject clears
        pending
      - Given a simple item with open concerns and no reviewer When
        wave-close-up runs Then explicit resolutions triage them; fallback
        auto-routes kind tech-debt to optional (debt) and other kinds to
        architect (carry); human-* is never auto-routed
      - Given a child epic finishing with one dismissed and one open concern
        with 800-byte detail When runChildTask completes before cleanup Then the
        parent gains exactly one condensed copy with source.epic, detail <800
        bytes, hydrating saga architect concernsYaml
      - Given mixed-status concerns plus a corrupt yaml file When state
        refreshes and factory status runs Then state.yaml counts skip the
        corrupt file with warn, missing dir yields zeros, and CLI shows Concerns
        plus Blocking vs Digest sections
    title: Funnel, close-ups, saga, surfacing
  - directionalInterfaces:
      - docs/ARCHITECTURE.md §1 row 18 + §6.2 concerns/ + §8
        funnel/routing/modes/partition/producer-matrix/resilience/exit-10,
        README.md, config commentary, agents/criteria/dispositions.md human-stop
        exit-10 preserved
      - "fragment matrix (8 fragments) + debloat check: each fragment ≤15 lines,
        total growth ≤60 lines, preflight plus line-count assertion in
        prompts.test"
    id: m5-docs
    scenarios:
      - Given implementation complete When docs are read Then ARCHITECTURE,
        README, config commentary, and dispositions describe concerns lifecycle,
        funnel sizes, partition, producer matrix, exit-10, modes, and counts
        with terse prompts
      - Given prompt fragments When prompts.test runs Then KNOWN_VARS plus
        descriptions cover all 8 fragments and added lines respect ≤15/≤60
        budgets
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    title: Docs and suite consolidation
uncertainties:
  - description: Funnel byte budget per-level sources, zero-diff rule, and
      bytes-vs-chars unit needed before close-up hydration.
    id: u-text-budget
    spikeOutlines:
      - test-assumptions spike-text-budget verifies code min(diff,2000) and
        zero-diff min(input,500) UTF-8 bytes with output<input condensing
  - description: Epic propagation timing plus taskWt serialization/restart behavior
      and pure-derive versus act-phase boundary needed before store, blocker
      derive, and saga propagation.
    id: u-saga-propagation
    spikeOutlines:
      - fact-finder spike-saga-commit verifies parent-copy timing, runExclusive
        serialization, immediate commit idempotency, collectRoutedBlockers
        owner, and hydration seam
itemOutlines:
  - deps: []
    description: "test-assumptions: measure item/wave diff bytes vs concern detail
      sizes; confirm per-level caps code min(diff,2000) and zero-diff
      min(input,500) UTF-8 bytes, condensing output<input, no 500-floor
      violation. Finding record only, no prod code; gates funnel-closeups."
    kind: test-assumptions
    milestoneId: m1-contracts-aggregate
    slug: spike-text-budget
    title: "Spike: funnel byte budget"
  - deps: []
    description: "fact-finder: verify runChildTask copy timing before cleanup/merge,
      parent buildArchitectHydration extension point, taskWt runExclusive
      serialization under 4 parallel items, immediate commit plus restart
      idempotency, pure-derive vs act-phase boundary with collectRoutedBlockers
      owner. Finding only; gates concerns-store, routing-blocker-derive,
      saga-propagate."
    kind: fact-finder
    milestoneId: m1-contracts-aggregate
    slug: spike-saga-commit
    title: "Spike: saga propagation, commit, derive boundary"
  - deps: []
    description: "Types plus schemas for producer matrix (developer, fact-finder,
      qa, poc, test-assumptions, review newConcerns, plan, decisions,
      wave/plan-closeup with concernResolutions, architect reports) via shared
      partial; triage/infra/pm-edit out of scope. Canonical
      reviewPolicy.default, legacy alias,
      resolveReviewAllowed(pipeline,agent,isTriager) precedence plus dismiss
      injection, generateReviewSchema, dismiss detail-required, pipeline
      humanInvolvement plus concerns thresholds. Tests: typecheck, preflight,
      repair defaults vs strict reject unknown kind."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts
    title: Concern contracts and canonical review policy
  - deps:
      - concerns-contracts-policy
      - concerns-contracts-schemas
      - concerns-contracts-types
    description: Implement src/core/concerns.ts (fingerprint identity,
      merge+escalated, aggregate/list/triage/closeup/partition, atomic YAML +
      KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll, restart
      idempotent). NEVER wrap commitAll in repo.writeLock.runExclusive
      (deadlock). Explicit taskWt path, one file per fingerprint, concerns/**
      startup recovery + reconcileConcerns from committed records (derive
      read-only), ingest errors must not change step status. Wire all producer
      seams incl consult writeArtifact; reviewer aggregates new then triages
      pre-existing only. Spike-saga-commit findings authoritative (no re-run).
      Behavior tests in test/engine/concerns-funnel.test.ts. Run TMPDIR=/tmp bun
      test.
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-store
    title: Concerns store with merge and commit
  - deps:
      - concerns-store
    description: "Item reviewer triage with concernsYaml in steps/review, isTriager
      gate, exact-id partition excluding triage ids from
      fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox
      dedup q-concern-<cid>, dismiss detail to dismissReason, condensing
      output<input, debt predicate without tech-debt disposition. Behavior
      tests: dismiss no routing, routed persist, QA gate no-op, missing detail
      errors, fix-once, no double mailbox."
    kind: story
    milestoneId: m2-triage-modes
    slug: reviewer-triage
    title: Workhorse reviewer triage
  - deps:
      - concerns-store
    description: "Architect path: aggregate plan/revise concerns plus remarkable
      rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition
      and dismiss vocabulary, non-dismissed become routed. Behavior tests:
      dismissed vs routed, rm-* triaged, debt predicate, no approval trigger
      from triage ids."
    kind: story
    milestoneId: m2-triage-modes
    slug: plan-reviewer-triage
    title: Plan-reviewer triage
  - deps:
      - concerns-contracts-policy
      - concerns-contracts-schemas
      - concerns-contracts-types
    description: "humanInvolvement + concerns thresholds schema/loader/merge,
      commented autonomous/principal/detailed presets with blocking table,
      agents/criteria/human-involvement.md terse fragment, KNOWN_VARS
      concernsYaml + humanInvolvementCriteria wired per fragment matrix.
      Behavior: mode switch changes criteria and blocking-ADR behavior;
      preflight green. Precedes all routing."
    kind: story
    milestoneId: m2-triage-modes
    slug: modes-prompts
    title: Modes, thresholds, prompt wiring
  - deps:
      - modes-prompts
      - plan-reviewer-triage
      - reviewer-triage
    description: "Pure derive only: derive/task.ts
      collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration
      (thread blockedBy into deriveItemState or post-process before every
      deriveWaveState call), scheduler.blockedByConcern reusing fixpoint, union
      with failure-blocked, cascade only declared deps, no writes. Spike
      findings authoritative. Behavior: dependent blocked, non-dep unaffected,
      transitive via deps only."
    escalate: true
    kind: story
    milestoneId: m3-routing
    slug: routing-blocker-derive
    title: Blocker derive
  - deps:
      - modes-prompts
      - routing-blocker-derive
    description: "Act phase only: wave-act newly-blocked check writes
      decisions/concern-<cid>.yaml exactly once (restart idempotent) plus
      buildArchitectHydration concernsYaml extension for wave-report/next-plan.
      Behavior tests: single consult file, restart no duplicate, architect input
      contains id+summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-architect-consult
    title: Architect consult and hydration
  - deps:
      - reviewer-triage
      - modes-prompts
    description: "human-async blocks [item] and continues, human-stop blocks
      task/item plus exit-10 halt plus blocked derive, awareness blocks []
      digest never blocking/exiting, debt predicate kind tech-debt routed or
      disposition optional routed. Behavior tests: mailbox files per
      disposition, exit 10 on stop, awareness continues, debt includes [item]
      summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-human-debt
    title: Human mailbox and debt routing
  - deps:
      - modes-prompts
      - routing-human-debt
    description: "Full ADR md title/context/decision/consequences/blocking, blocking
      routed per mode table with exit-10 when stop, remarkable digest-only never
      waiting, dispositions.md exit-10 preserved. Behavior tests: blocking
      mailbox+blocks, remarkable digest only."
    kind: story
    milestoneId: m3-routing
    slug: adr-blocking-digest
    title: Blocking vs remarkable ADRs
  - deps:
      - adr-blocking-digest
      - routing-architect-consult
      - spike-text-budget
    description: "Hydrate wave/plan-close-up and architect reports with concernsYaml
      capped per spike (code min(diff,2000), zero-diff min(input,500) UTF-8
      bytes, output<input), concernResolutions pending + architect
      concernConfirms accept/reject, propagate to parent/digest, simple-item
      explicit + auto-route fallback (tech-debt->optional, others->architect,
      human-* never auto). Apply spike nits: cross-check diffs via production
      git() wrapper, add many-concerns 2000B truncation case, clarify trim
      semantics. Behavior: byte budgets, pending/confirm, simple fallback."
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: funnel-closeups
    title: Funnel close-ups and simple triage
  - deps:
      - routing-architect-consult
    description: "runChildTask propagateEpicConcerns: after child completion before
      cleanup/merge (engine.ts:246-274) for every child status, condensed parent
      copies source.epic with parent detail < child, extended parent
      concernsYaml hydration (append LAST, recompute before wave-report);
      forward child human questions to root mailbox. Spike findings
      authoritative. Behavior: one copy, dismissed stays local, saga input
      contains id."
    escalate: true
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: saga-propagate
    title: Epic to saga propagation
  - deps:
      - concerns-store
      - routing-human-debt
    description: "Sole owner StateArtifact.concerns
      {open,dismissed,routed,resolved}, state.schema,
      toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI
      Concerns plus Blocking vs Digest. Behavior tests: counts, missing/corrupt,
      CLI sections."
    kind: story
    milestoneId: m4-funnel-surface
    slug: status-state-surface
    title: State counts and status surfacing
  - deps:
      - funnel-closeups
      - modes-prompts
      - saga-propagate
      - status-state-surface
    description: "Update ARCHITECTURE section 1 row 18 plus 6.2 plus 8, README,
      config commentary, dispositions.md; fragment matrix plus 15/60 debloat
      check; consolidate test/engine/concerns-funnel.test.ts plus steer/CLI
      coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test."
    kind: story
    milestoneId: m5-docs
    slug: docs-finish
    title: Docs and suite consolidation
  - deps: []
    description: "Types only. In src/core/artifacts.ts add
      Concern/ConcernKind/ConcernSeverity/ConcernStatus, RemarkableDecision,
      StoredConcernArtifact (+pendingResolution?, source.escalated?),
      ReviewDisposition+dismiss (no tech-debt value), PlanAdr.blocking,
      PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeverity\
      ,minBlockingSeverity}, reviewPolicy.default canonical + legacy
      allowedDispositions alias in type. No JSON, no runtime, no repair
      (deferred to concerns-store). Verify: bun run typecheck. Prod budget <=80
      lines."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-types
    title: Concern artifact types
  - deps:
      - concerns-contracts-types
    description: "Schemas only. Inline (no cross-file $ref) shared
      concern/remarkable definitions into developer-output, fact-finder-output,
      qa, poc, test-assumptions, review newConcerns, plan, decisions,
      wave/plan-closeup (+concernResolutions), architect wave-report/closeup;
      triage/infra/pm-edit untouched. severity/detail optional (runtime defaults
      in store); kind strict enum so unknown kind fails validation with no
      write. Dismiss detail-required at runtime, not JSON schema. Verify:
      typecheck + prompts.test preflight + one FakeHarness case in
      test/engine/concerns-funnel.test.ts. Budget <=200 lines JSON."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-schemas
    title: Concern producer schemas
  - deps:
      - concerns-contracts-types
    description: "Resolver only. New src/core/review-policy.ts
      resolveReviewAllowed(pipeline,agent,isTriager): per-agent > default >
      builtin [fix,optional,architect,human-awareness,human-async]; legacy
      allowedDispositions read-alias for default; append dismiss iff isTriager.
      Wire into item-machine review promptVars, step-runner schema path,
      iteration plan-review prompt+schema, generateReviewSchema. QA never
      dismiss. Verify: typecheck + FakeHarness (reviewer accepts dismiss, QA
      rejects). Budget <=100 lines."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-policy
    title: Canonical review-policy resolver
  - deps:
      - concerns-contracts-policy
      - concerns-contracts-schemas
      - concerns-contracts-types
    description: Implement src/core/concerns.ts (fingerprint identity,
      merge+escalated, aggregate/list/triage/closeup/partition, atomic YAML +
      KeyedMutex(taskDir) RMW-only + immediate taskWt commitAll, restart
      idempotent). NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit
      taskWt path, one file per fingerprint, concerns/** recovery +
      reconcileConcerns (derive read-only), ingest errors must not change step
      status. Wire all producer seams incl consult writeArtifact; reviewer
      aggregates new then triages pre-existing only. Spike-saga-commit findings
      authoritative. Behavior tests in test/engine/concerns-funnel.test.ts. Run
      TMPDIR=/tmp bun test.
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-store-v2
    title: Concerns store with merge and commit
  - deps:
      - concerns-contracts-policy
      - concerns-contracts-schemas
      - concerns-contracts-types
    description: "humanInvolvement + concerns thresholds schema/loader/merge,
      commented autonomous/principal/detailed presets with blocking table,
      agents/criteria/human-involvement.md terse fragment, KNOWN_VARS
      concernsYaml + humanInvolvementCriteria per fragment matrix. Behavior:
      mode switch changes criteria and blocking-ADR behavior; preflight green.
      Precedes all routing."
    kind: story
    milestoneId: m2-triage-modes
    slug: modes-prompts-v2
    title: Modes, thresholds, prompt wiring
  - deps:
      - concerns-store-v2
    description: "Item reviewer triage with concernsYaml in steps/review, isTriager
      gate, exact-id partition excluding triage ids from
      fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox
      dedup q-concern-<cid>, dismiss detail to dismissReason, condensing
      output<input, debt predicate (no tech-debt disposition). Behavior: dismiss
      no routing, routed persist, QA no-op, missing detail errors, fix-once, no
      double mailbox."
    kind: story
    milestoneId: m2-triage-modes
    slug: reviewer-triage-v2
    title: Workhorse reviewer triage
  - deps:
      - concerns-store-v2
    description: "Architect path: aggregate plan/revise concerns + remarkable rm-*,
      hydrate steps/plan-review with concernsYaml, same exact-id partition and
      dismiss vocabulary, non-dismissed become routed. Behavior: dismissed vs
      routed, rm-* triaged, debt predicate, no approval trigger from triage
      ids."
    kind: story
    milestoneId: m2-triage-modes
    slug: plan-reviewer-triage-v2
    title: Plan-reviewer triage
  - deps:
      - modes-prompts-v2
      - plan-reviewer-triage-v2
      - reviewer-triage-v2
    description: "Pure derive only: derive/task.ts collectRoutedBlockers +
      deriveWave/deriveItem integration (thread blockedBy into deriveItemState
      or post-process before every deriveWaveState call),
      scheduler.blockedByConcern reusing fixpoint, union with failure-blocked,
      cascade only declared deps, no writes. Spike findings authoritative.
      Behavior: dependent blocked, non-dep unaffected, transitive via deps
      only."
    escalate: true
    kind: story
    milestoneId: m3-routing
    slug: routing-blocker-derive-v2
    title: Blocker derive
  - deps:
      - modes-prompts-v2
      - reviewer-triage-v2
    description: "human-async blocks [item] and continues, human-stop blocks
      task/item + exit-10 halt + blocked derive, awareness blocks [] digest
      never blocking/exiting, debt predicate kind tech-debt routed or
      disposition optional routed. Behavior: mailbox files per disposition, exit
      10 on stop, awareness continues, debt includes [item] summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-human-debt-v2
    title: Human mailbox and debt routing
  - deps:
      - modes-prompts-v2
      - routing-blocker-derive-v2
    description: "Act phase only: wave-act newly-blocked check writes
      decisions/concern-<cid>.yaml exactly once (restart idempotent) +
      buildArchitectHydration concernsYaml extension for wave-report/next-plan.
      Behavior: single consult file, restart no duplicate, architect input
      contains id+summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-architect-consult-v2
    title: Architect consult and hydration
  - deps:
      - modes-prompts-v2
      - routing-human-debt-v2
    description: "Full ADR md title/context/decision/consequences/blocking, blocking
      routed per mode table with exit-10 when stop, remarkable digest-only never
      waiting, dispositions.md exit-10 preserved. Behavior: blocking
      mailbox+blocks, remarkable digest only."
    kind: story
    milestoneId: m3-routing
    slug: adr-blocking-digest-v2
    title: Blocking vs remarkable ADRs
  - deps:
      - concerns-store-v2
      - routing-human-debt-v2
    description: "Sole owner StateArtifact.concerns
      {open,dismissed,routed,resolved}, state.schema,
      toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI
      Concerns plus Blocking vs Digest. Behavior: counts, missing/corrupt, CLI
      sections."
    kind: story
    milestoneId: m4-funnel-surface
    slug: status-state-surface-v2
    title: State counts and status surfacing
  - deps:
      - adr-blocking-digest-v2
      - routing-architect-consult-v2
      - spike-text-budget
    description: "Hydrate wave/plan-close-up and architect reports with concernsYaml
      capped per spike (code min(diff,2000), zero-diff min(input,500) UTF-8
      bytes, output<input), concernResolutions pending + architect
      concernConfirms accept/reject, propagate to parent/digest, simple-item
      explicit + auto-route fallback (tech-debt->optional, others->architect,
      human-* never auto). Spike nits: production git() wrapper, many-concerns
      2000B case, trim semantics. Behavior: byte budgets, pending/confirm,
      simple fallback."
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: funnel-closeups-v2
    title: Funnel close-ups and simple triage
  - deps:
      - routing-architect-consult-v2
    description: "runChildTask propagateEpicConcerns after child completion before
      cleanup/merge (engine.ts:246-274) for every child status, condensed parent
      copies source.epic with parent detail < child, extended parent
      concernsYaml hydration (append LAST, recompute before wave-report);
      forward child human questions to root mailbox. Spike findings
      authoritative. Behavior: one copy, dismissed stays local, saga input
      contains id."
    escalate: true
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: saga-propagate-v2
    title: Epic to saga propagation
  - deps:
      - funnel-closeups-v2
      - modes-prompts-v2
      - saga-propagate-v2
      - status-state-surface-v2
    description: "Update ARCHITECTURE section 1 row 18 + 6.2 + 8, README, config
      commentary, dispositions.md; fragment matrix + 15/60 debloat check;
      consolidate test/engine/concerns-funnel.test.ts + steer/CLI coverage.
      Final gates: bun run typecheck and TMPDIR=/tmp bun test."
    kind: story
    milestoneId: m5-docs
    slug: docs-finish-v2
    title: Docs and suite consolidation
assumptions:
  - assumption: Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures
      do not mask regressions.
    why: Baseline red only under .factory-runtime TMPDIR; suite green with
      TMPDIR=/tmp. Out of scope.
  - assumption: Concern identity excludes detail and severity per
      adr-fingerprint-merge; reworded detail merges and severity escalations
      surface via escalated flag without reopening.
    why: Prevents trivial-reword duplicates while keeping escalation visible to
      architect and digest.
  - assumption: buildArchitectHydration does not read parent concerns/ today;
      saga-propagate extends it with concernsYaml, and runChildTask copies
      condensed epic concerns to parent concerns/ after child completion but
      before cleanup/merge per spike-saga-commit.
    why: Corrects the prior hydration assumption; defines the copy timing and seam
      the spike must verify.
  - assumption: Per-mode blocking table in adr-humaninvolvement-config is
      authoritative for iteration 1; raise allowlist defaults to all agents.
    why: Unblocks routing without operator tuning; task pipeline.yaml can override.
  - assumption: Dismissed concerns stay dismissed on severity escalation but appear
      as escalated notes in digest and architect hydration.
    disposition: human-awareness
    why: Surfaces the hidden-escalation tradeoff to the operator without
      auto-reopening triaged work.
techDebt:
  - category: adjacent
    description: Pre-existing head-guard failures when TMPDIR sits under
      .factory-runtime because step-runner splits on /.factory. Baseline red;
      green with TMPDIR=/tmp. Out of scope.
    id: td-tmpdir-split
  - category: impacting
    description: reviewAllowed resolved in two places with non-canonical
      allowedDispositions key and wrong fallback order, so per-agent dismiss
      could fail schema validation.
    id: td-reviewpolicy-divergence
    resolution: "Fix in concerns-contracts: canonical reviewPolicy.default, legacy
      alias, single resolveReviewAllowed(pipeline,agent,isTriager) with
      precedence and dismiss injection used by prompt and schema paths."
  - category: impacting
    description: ADR writer persists only title plus context and PlanAdr lacks
      blocking; human-stop contract drifted from exit-10.
    id: td-adr-md-truncated
    resolution: "Fix in adr-blocking-digest and routing-human-debt: full md with
      decision, consequences, blocking plus preserved exit-10 halt and
      dispositions.md update."
  - category: impacting
    description: human-awareness and human-stop ignored, debt derivation ignores
      routed concerns, status lists digest as blocking.
    id: td-human-debt-gaps
    resolution: "Fix in routing-human-debt and status-state-surface: stop exit-10
      plus blocked, awareness digest with empty blocks, debt from predicate,
      Blocking versus Digest split."
adrs:
  - context: Item steps commit only childWt while concerns/ lives on taskWt; up to 4
      parallel items share taskDir; retries/restarts must not duplicate or lose
      triage.
    decision: Write directly to taskWt/{task}/concerns/ with writeYamlAtomic plus
      runExclusive taskWt mutex, then immediately commit taskWt when concerns/
      or steer/ changed. Distinct fingerprints are distinct files; same
      fingerprint merges without clobbering dismissed/routed/resolved. Restart
      re-reads files idempotently. Implementation gated by spike-saga-commit
      serialization findings.
    id: adr-concern-store-taskwt
    title: Direct taskWt writes with serialized immediate commit
  - context: suggestions[] reuse conflated concern triage with fix-loop, mailbox,
      and plan-approval triggers; review id is free-form; QA must not triage;
      dismiss needs a reason field.
    decision: "Exact-id match (suggestion.id === c-<hash10> or rm-<hash10>) via
      partitionSuggestions splits triage entries from normal findings. Triage
      ids update concerns/ only and are excluded from
      fix-loop/approval/normal-mailbox paths; fix on a concern id routes as fix
      and returns fixRequired once for the owning item; human-async on a concern
      writes a single q-concern-<cid> (normal path skipped). Dismiss requires
      non-empty detail persisted to dismissReason or the step errors. isTriager
      gate allows only reviewer, plan-reviewer, and close-up/architect chain.
      Reviewer ordering: aggregate new concerns[] first, then triage only
      pre-existing ids from concernsYaml (no same-step self-dismiss)."
    id: adr-triage-suggestions-dismiss
    title: Partitioned exact-id triage with gate
  - context: derive/* must stay pure; debt routing invented an invalid tech-debt
      disposition; consult writes need exactly-once; mailbox needs dedup.
    decision: "Pure derive: derive/task.ts collectRoutedBlockers(taskDir) reads
      routed kind==blocker affects into a Set passed to deriveWave/deriveItem
      and scheduler.blockedByConcern(items, concernBlocked) which reuses the
      blockedByFailure fixpoint pattern, unions with failure-blocked, and
      cascades only over declared deps. Debt predicate: (kind==tech-debt &&
      status routed/resolved) OR (disposition==optional && status routed); no
      tech-debt disposition exists. Act phase (triage writeArtifact plus
      wave-act newly-blocked check) writes decisions/concern-<cid>.yaml exactly
      once, idempotent on restart, and extends buildArchitectHydration with
      concernsYaml."
    id: adr-routing-derived-state
    title: Pure derive plus exactly-once act routing
  - context: Digest must reuse the mailbox without blocking, halting, or spamming
      status; classify handles operator answers, not blocking.
    decision: Digest entries are steer/tousertoreview entries with disposition
      human-awareness and blocks:[]. derive/task splits openSteerQuestions into
      blocking (blocks.length>0) versus digest (awareness plus empty blocks);
      classify only routes answers/directives/stop; status renders separate
      Blocking versus Digest sections.
    id: adr-digest-mailbox
    title: Digest as filtered non-blocking mailbox view
  - context: Spec needs autonomous/principal/detailed presets plus raise allowlist
      and severity thresholds; pipeline root is closed.
    decision: "Top-level PipelineConfig.humanInvolvement (default autonomous) plus
      PipelineConfig.concerns {raiseAllowlist?, minDigestSeverity?,
      minBlockingSeverity?}. Blocking table: autonomous blocks only on blocking
      ADR or high human-stop; principal adds human-async and high severity;
      detailed adds all human-*. Thresholds gate blocking versus digest
      placement. Criteria fragment agents/criteria/human-involvement.md carries
      the table tersely."
    id: adr-humaninvolvement-config
    title: Modes plus raise and severity config
  - context: Funnel requires less detail per level and never more text than code
      summarized, with falsifiable checks and no empty digest on zero-diff
      steps.
    decision: "Per-level UTF-8 byte caps on hydrated promptVars only (stored
      artifacts never truncated): code steps cap min(diffBytes,2000) where diff
      is item diff for review triage and wave aggregated diff for close-ups;
      zero-diff orchestration steps cap min(inputBytes,500) where input is
      plan/context bytes. Reviewer/architect/close-up prompts require condensing
      with output bytes < input bytes. Engine truncates only the hydrated var."
    id: adr-funnel-text-budget
    title: Per-level hydration byte caps
  - context: PipelineConfig type says {default,[agent]} but flows read
      .allowedDispositions as if global; precedence and dismiss injection are
      undefined.
    decision: "Canonical key is reviewPolicy.default with legacy
      reviewPolicy.allowedDispositions as a one-iteration read-alias. Single
      owner src/core/review-policy.ts resolveReviewAllowed(pipeline, agent,
      isTriager): precedence per-agent array > default > builtin
      [fix,optional,architect,human-awareness,human-async]; when isTriager is
      true append dismiss if absent; QA and other non-triagers never receive
      dismiss. Used by both prompt criteria and generateReviewSchema."
    id: adr-reviewpolicy-canonical
    title: Canonical reviewPolicy with triager injection
  - context: Hashing detail/severity duplicates on rewording; excluding them hides
      severity escalation on dismissed concerns.
    decision: "Stable id c-{sha1-10} over {kind, normalizedSummary, location,
      sortedAffects} excluding detail and severity. Normalization trims,
      collapses whitespace, lowercases summary. Re-emit merges: detail keeps
      longer/latest, severity keeps max, updatedAt and source.lastSeen advance,
      never changes dismissed/routed/resolved except via triage or close-up
      resolution. If re-emit severity exceeds stored severity, set
      source.escalated=true and surface the escalation in digest and architect
      hydration without reopening; architect may reopen via close-up
      resolution."
    id: adr-fingerprint-merge
    title: Fingerprint identity, merge, escalation surfacing
  - context: Close-up schemas are closed, wave-close-up has no reviewer, stored
      statuses have no pending, and simple items have no reviewer.
    decision: "Add concernResolutions?: [{id, action: resolve|carry|propagate,
      note?}] plus concerns[]/remarkable[] producer fields to wave/plan-closeup
      schemas and StoredConcern.pendingResolution?: {action,note,by,at}.
      Wave-close-up proposes via applyCloseupResolutions (status stays routed,
      pending set); architect-wave-report confirms via concernConfirms?: [{id,
      confirm: accept|reject, note?}] applying resolved/routed/propagated or
      clearing pending. Propagate targets parent concerns/ copy for epics or
      human digest for task-level unless elevated to blocking ADR. Simple-item
      fallback at wave-close-up: kind tech-debt auto-routes to disposition
      optional (debt), all other kinds to architect (carry); human-* is never
      auto-routed."
    id: adr-closeup-retriage
    title: Close-up pending resolution and simple fallback
  - context: Remarkable {chosen,alternatives,why} needs one authoritative store and
      the same triage vocabulary.
    decision: Authoritative store is concerns/rm-{hash10}.yaml with
      RemarkableDecision plus status and source. Triaged with suggestions[]
      dismiss vocabulary via exact-id match under the same partition and gate.
      Routed remarkables go digest-only unless elevated to a blocking ADR.
    id: adr-remarkable-store
    title: Remarkable decisions in rm- files
  - context: dispositions.md and ARCHITECTURE 8.7 define human-stop as
      tousertoreview plus exit-10 halt, but item-machine treats it fix-like
      running.
    decision: "Preserve exit-10 halt: human-stop writes a mailbox entry with blocks
      covering affected items plus task when task-level, item-machine maps it to
      blocked terminal, derive marks item and task blocked, and the engine halts
      with exit code 10 at the next mailbox check until answered or dismissed.
      Awareness with blocks:[] never enters blocked sets and never triggers exit
      10. Update dispositions.md and ARCHITECTURE 8.7 to keep the contract
      explicit."
    id: adr-human-stop
    title: Human-stop preserves exit-10 halt
  - context: Derive throws on corrupt triage/plan/steer/decisions while concerns/
      proposes skip; one bad concern could fail a whole step.
    decision: Corrupt concerns/*.yaml files are skipped with a warn and excluded
      from counts because concerns/ is an append-only cache rebuildable from
      committed step records; missing concerns/ yields zero counts. A single
      unknown-kind concern fails its step with no partial aggregate and no
      clobber of existing files, forcing prompt/schema drift to surface via
      retry rather than silent loss.
    id: adr-resilience
    title: Corrupt-skip versus strict-fail resilience
  - context: Spec says every agent output may carry concerns[], but not every schema
      has a producer and reviewer has a dual aggregate-plus-triage role.
    decision: "Producer matrix via a shared concern/remarkable partial: developer,
      fact-finder, qa, poc, test-assumptions, reviewer/plan-reviewer new
      concerns[], architect plan/revise, consult decisions, wave/plan-closeup,
      architect wave-report/closeup. Triage, infra, and pm-edit mechanical
      outputs are explicitly out of scope (no LLM synthesis). Consults aggregate
      via runItemConsult/runNonItemConsult writeArtifact. Reviewer ordering:
      aggregate new concerns first, then triage only pre-existing ids."
    id: adr-producer-matrix
    title: Producer matrix and reviewer ordering


--- Prior Plan plan-1.3.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "artifacts.ts: Concern, RemarkableDecision,
        StoredConcernArtifact(+pendingResolution?, source.escalated?),
        ReviewDisposition+dismiss (no tech-debt), PlanAdr.blocking,
        PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeveri\
        ty,minBlockingSeverity}, reviewPolicy.default canonical"
      - "config/schemas: shared concern/remarkable partial in developer,
        fact-finder, qa, poc, test-assumptions, review newConcerns, plan,
        decisions, wave/plan-closeup, architect reports; triage/infra/pm-edit
        out of scope; dismiss detail-required; closeup concernResolutions"
      - "src/core/concerns.ts: concernFingerprint(identity),
        aggregateConcerns(merge+escalated), listOpenConcerns,
        applyConcernTriage(exact-id,isTriager), applyCloseupResolutions,
        partitionSuggestions(triage vs findings)"
      - "src/core/review-policy.ts:
        resolveReviewAllowed(pipeline,agent,isTriager)
        per-agent>default>builtin, legacy allowedDispositions alias, dismiss
        auto-append for triagers; generateReviewSchema uses it; taskWt
        runExclusive+atomic+immediate-commit helper"
    id: m1-contracts-aggregate
    scenarios:
      - Given a developer step emitting a blocker concern When the step commits
        Then concerns/c-<fp10>.yaml exists with status open and source.record
        pointing at the step record
      - Given the same concern re-emitted on retry When aggregation runs Then
        exactly one file exists, prior dismissed/routed preserved,
        updatedAt/lastSeen advance
      - Given a concern missing severity and detail When validation runs Then
        severity defaults to medium, detail defaults to summary, and the file is
        created
      - Given a concern with unknown kind When validation runs Then the step
        errors, no concerns file is written, existing files stay untouched
      - Given developer, fact-finder, qa, poc, review-new, plan, consult,
        closeup, and architect-report outputs carrying concerns[]+remarkable[]
        When steps commit Then each aggregates to concerns/c-*.yaml or rm-*.yaml
        with open status and source pointer; triage/infra/pm-edit carry none
      - Given reviewer output with new concerns[] plus suggestions triaging a
        pre-existing id When the step commits Then the new concern aggregates
        open and only the pre-existing id is triaged (no same-step self-dismiss)
      - Given reviewPolicy.default [fix,optional] plus reviewer override
        [fix,optional,architect] When resolveReviewAllowed runs Then reviewer
        triager gets override+dismiss and QA non-triager gets default without
        dismiss
      - Given a dismissed concern re-emitted with higher severity When merge
        runs Then status stays dismissed but source.escalated=true and the
        escalation appears in digest and architect hydration
    title: Contracts and aggregation foundation
  - directionalInterfaces:
      - "prompt-vars KNOWN_VARS+descriptions: concernsYaml in steps/review,
        steps/plan-review, steps/wave-close-up, steps/plan-close-up,
        architect-plan, architect-wave-report, architect-closeup,
        architect-consult-*; humanInvolvementCriteria in review, plan-review,
        architect-*"
      - item-machine review + iteration plan-review promptVars and writeArtifact
        with isTriager gate, partitionSuggestions excluding triage ids from
        fix-loop/approval/normal mailbox, fix-on-concern fixRequired once,
        mailbox dedup q-concern-<cid>
      - agents reviewer, plan-reviewer, criteria/dispositions,
        criteria/human-involvement terse confirm/dismiss/condense plus blocking
        table plus condensing rule output-bytes<input-bytes
      - config/pipeline.default.yaml commented autonomous/principal/detailed
        presets with blocking table plus concerns raise/threshold examples
    id: m2-triage-modes
    scenarios:
      - Given open item concerns When review runs Then steps/review receives
        concernsYaml with id/kind/severity/summary/affects and terse triage
        instructions
      - Given reviewer suggestion matching a concern id with disposition dismiss
        and detail When review commits Then that file has status dismissed plus
        dismissReason=detail and no mailbox, debt, blocked, or approval effect
      - Given a matching dismiss suggestion without detail When review commits
        Then the step errors and no triage is persisted
      - Given QA emitting a matching concern id When QA commits Then no triage
        is applied and the file stays open
      - Given matching suggestions with fix, optional, architect, or human-*
        When review commits Then each file becomes routed with disposition
        persisted; triage ids are excluded from normal fix-loop/approval/mailbox
        except fix-on-concern sets fixRequired once; human-async on a concern
        writes a single q-concern-<cid>
      - Given architect plan concerns plus an rm-* file When plan-review runs
        Then plan-reviewer triages with the same vocabulary and non-dismissed
        files become routed; debt predicate is kind==tech-debt&&routed or
        disposition==optional (no tech-debt disposition)
      - Given pipeline.yaml humanInvolvement principal When reviewer and
        architect prompts render Then the mode criteria fragment is included and
        preflightPrompts passes
    title: Reviewer triage and modes
  - directionalInterfaces:
      - derive/task.ts collectRoutedBlockers(taskDir)->Set plus
        deriveWave/deriveItem integration;
        scheduler.blockedByConcern(items,concernBlocked) pure reusing
        blockedByFailure fixpoint, unioned, cascade only over declared deps
      - "act-phase routing: triage writeArtifact plus wave-act newly-blocked
        check writing decisions/concern-<cid>.yaml exactly once (restart
        idempotent); buildArchitectHydration extended with concernsYaml digest"
      - steer writeQuestion for human-async/stop/blocking ADR; derive/task
        blocking-vs-digest split (blocks.length>0 vs awareness empty); debt
        predicate; human-stop exit-10 halt plus blocked
    id: m3-routing
    scenarios:
      - Given a routed blocker whose affects names a declared dependent When
        derive runs Then the dependent derives blocked with no writes;
        non-dependents are unaffected and transitive blocking follows declared
        deps only
      - Given a newly blocked dependent When the act phase runs Then exactly one
        decisions/concern-<cid>.yaml is written and a restart writes no second
        file
      - Given a routed architect concern When the next architect turn builds
        hydration Then its concernsYaml input contains that concern id and
        summary
      - Given a routed human-async concern When routing runs Then mailbox
        q-concern-<cid> has blocks=[item], the item derives blocked, and the
        engine continues without exit 10
      - Given a routed human-stop concern When routing runs Then the mailbox
        entry blocks task/item, item and task derive blocked, and the engine
        halts with exit code 10 until answered or dismissed
      - Given a routed human-awareness concern When routing runs Then the
        mailbox entry has blocks=[] in the Digest section and the engine
        continues with no blocked set and no exit 10
      - Given plan ADRs blocking true and false under autonomous mode When plan
        commits Then the blocking ADR creates a mailbox question with blocks
        while the remarkable ADR appears only in the digest; debt includes kind
        tech-debt routed or disposition optional routed as [item] summary
    title: Routing to blocked, architect, mailbox, debt
  - directionalInterfaces:
      - closeup schemas concernResolutions resolve/carry/propagate plus
        concerns[]/remarkable[];
        StoredConcern.pendingResolution{action,note,by,at};
        applyCloseupResolutions proposes (status stays routed); architect
        concernConfirms accept/reject applies; propagate to parent concerns/
        copy or human digest
      - "iteration.ts concernsYaml hydration capped UTF-8 bytes: code steps
        min(diffBytes,2000); zero-diff orchestration min(inputBytes,500);
        reviewer/architect condensing prompts require output<input; engine
        truncates hydrated var only"
      - engine.ts runChildTask propagateEpicConcerns after child completion
        before cleanup/merge, condensed copies with source.epic, parent
        hydration extended; size assert parent-detail<child-detail
      - derive/task.ts toStateArtifact().concerns counts (missing dir zeros,
        corrupt skip+warn); cli/status.ts Concerns plus separate Blocking vs
        Digest sections
    id: m4-funnel-surface
    replanAfter: true
    scenarios:
      - Given wave diff 5000 bytes and open concerns 3000 bytes When
        wave-close-up hydrates Then concernsYaml is <=2000 bytes and < wave diff
        in UTF-8 bytes
      - Given zero-diff plan-review with 4000-byte input When hydrating Then
        concernsYaml is <=500 bytes and < input bytes
      - Given wave-close-up emitting concernResolutions resolve/carry/propagate
        When it commits Then files stay routed with pendingResolution set;
        architect accept applies resolved/routed/propagated and reject clears
        pending
      - Given a simple item with open concerns and no reviewer When
        wave-close-up runs Then explicit resolutions triage them; fallback
        auto-routes kind tech-debt to optional (debt) and other kinds to
        architect (carry); human-* is never auto-routed
      - Given a child epic finishing with one dismissed and one open concern
        with 800-byte detail When runChildTask completes before cleanup Then the
        parent gains exactly one condensed copy with source.epic, detail <800
        bytes, hydrating saga architect concernsYaml
      - Given mixed-status concerns plus a corrupt yaml file When state
        refreshes and factory status runs Then state.yaml counts skip the
        corrupt file with warn, missing dir yields zeros, and CLI shows Concerns
        plus Blocking vs Digest sections
    title: Funnel, close-ups, saga, surfacing
  - directionalInterfaces:
      - docs/ARCHITECTURE.md §1 row 18 + §6.2 concerns/ + §8
        funnel/routing/modes/partition/producer-matrix/resilience/exit-10,
        README.md, config commentary, agents/criteria/dispositions.md human-stop
        exit-10 preserved
      - "fragment matrix (8 fragments) + debloat check: each fragment ≤15 lines,
        total growth ≤60 lines, preflight plus line-count assertion in
        prompts.test"
    id: m5-docs
    scenarios:
      - Given implementation complete When docs are read Then ARCHITECTURE,
        README, config commentary, and dispositions describe concerns lifecycle,
        funnel sizes, partition, producer matrix, exit-10, modes, and counts
        with terse prompts
      - Given prompt fragments When prompts.test runs Then KNOWN_VARS plus
        descriptions cover all 8 fragments and added lines respect ≤15/≤60
        budgets
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    title: Docs and suite consolidation
uncertainties:
  - description: Funnel byte budget per-level sources, zero-diff rule, and
      bytes-vs-chars unit needed before close-up hydration.
    id: u-text-budget
    spikeOutlines:
      - test-assumptions spike-text-budget verifies code min(diff,2000) and
        zero-diff min(input,500) UTF-8 bytes with output<input condensing
  - description: Epic propagation timing plus taskWt serialization/restart behavior
      and pure-derive versus act-phase boundary needed before store, blocker
      derive, and saga propagation.
    id: u-saga-propagation
    spikeOutlines:
      - fact-finder spike-saga-commit verifies parent-copy timing, runExclusive
        serialization, immediate commit idempotency, collectRoutedBlockers
        owner, and hydration seam
itemOutlines:
  - deps: []
    description: "test-assumptions: measure item/wave diff bytes vs concern detail
      sizes; confirm per-level caps code min(diff,2000) and zero-diff
      min(input,500) UTF-8 bytes, condensing output<input, no 500-floor
      violation. Finding record only, no prod code; gates funnel-closeups."
    kind: test-assumptions
    milestoneId: m1-contracts-aggregate
    slug: spike-text-budget
    title: "Spike: funnel byte budget"
  - deps: []
    description: "fact-finder: verify runChildTask copy timing before cleanup/merge,
      parent buildArchitectHydration extension point, taskWt runExclusive
      serialization under 4 parallel items, immediate commit plus restart
      idempotency, pure-derive vs act-phase boundary with collectRoutedBlockers
      owner. Finding only; gates concerns-store, routing-blocker-derive,
      saga-propagate."
    kind: fact-finder
    milestoneId: m1-contracts-aggregate
    slug: spike-saga-commit
    title: "Spike: saga propagation, commit, derive boundary"
  - deps: []
    description: "Types plus schemas for producer matrix (developer, fact-finder,
      qa, poc, test-assumptions, review newConcerns, plan, decisions,
      wave/plan-closeup with concernResolutions, architect reports) via shared
      partial; triage/infra/pm-edit out of scope. Canonical
      reviewPolicy.default, legacy alias,
      resolveReviewAllowed(pipeline,agent,isTriager) precedence plus dismiss
      injection, generateReviewSchema, dismiss detail-required, pipeline
      humanInvolvement plus concerns thresholds. Tests: typecheck, preflight,
      repair defaults vs strict reject unknown kind."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts
    title: Concern contracts and canonical review policy
  - deps:
      - concerns-contracts
      - spike-saga-commit
    description: "Implement src/core/concerns.ts (fingerprint identity, merge with
      escalated flag, aggregate/list/triage/closeup/partition, atomic YAML plus
      runExclusive plus immediate taskWt commit, restart idempotent). Wire all
      producer seams including consult writeArtifact; reviewer ordering
      aggregates new then triages pre-existing only. Behavior tests:
      open+source, retry dedup, reword merge preserving status plus escalation
      surfacing, rm-* aggregate, precedence/injection. Run TMPDIR=/tmp bun test
      test/engine/concerns-funnel.test.ts."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-store
    title: Concerns store with merge and commit
  - deps:
      - concerns-store
    description: "Item reviewer triage with concernsYaml in steps/review, isTriager
      gate, exact-id partition excluding triage ids from
      fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox
      dedup q-concern-<cid>, dismiss detail to dismissReason, condensing
      output<input, debt predicate without tech-debt disposition. Behavior
      tests: dismiss no routing, routed persist, QA gate no-op, missing detail
      errors, fix-once, no double mailbox."
    kind: story
    milestoneId: m2-triage-modes
    slug: reviewer-triage
    title: Workhorse reviewer triage
  - deps:
      - concerns-store
    description: "Architect path: aggregate plan/revise concerns plus remarkable
      rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition
      and dismiss vocabulary, non-dismissed become routed. Behavior tests:
      dismissed vs routed, rm-* triaged, debt predicate, no approval trigger
      from triage ids."
    kind: story
    milestoneId: m2-triage-modes
    slug: plan-reviewer-triage
    title: Plan-reviewer triage
  - deps:
      - concerns-contracts
    description: "humanInvolvement plus concerns thresholds schema/loader/merge,
      commented autonomous/principal/detailed presets with blocking table,
      agents/criteria/human-involvement.md terse fragment, KNOWN_VARS
      concernsYaml plus humanInvolvementCriteria with descriptions wired per
      fragment matrix. Behavior tests: mode switch changes criteria and
      blocking-ADR behavior; preflight green. Precedes all routing."
    kind: story
    milestoneId: m2-triage-modes
    slug: modes-prompts
    title: Modes, thresholds, prompt wiring
  - deps:
      - plan-reviewer-triage
      - reviewer-triage
      - modes-prompts
      - spike-saga-commit
    description: "Pure derive only: derive/task collectRoutedBlockers plus
      deriveWave/deriveItem integration, scheduler.blockedByConcern reusing
      fixpoint, union with failure-blocked, cascade only declared deps, no
      writes. Behavior tests: dependent blocked, non-dep unaffected, transitive
      via deps only."
    escalate: true
    kind: story
    milestoneId: m3-routing
    slug: routing-blocker-derive
    title: Blocker derive
  - deps:
      - modes-prompts
      - routing-blocker-derive
    description: "Act phase only: wave-act newly-blocked check writes
      decisions/concern-<cid>.yaml exactly once (restart idempotent) plus
      buildArchitectHydration concernsYaml extension for wave-report/next-plan.
      Behavior tests: single consult file, restart no duplicate, architect input
      contains id+summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-architect-consult
    title: Architect consult and hydration
  - deps:
      - reviewer-triage
      - modes-prompts
    description: "human-async blocks [item] and continues, human-stop blocks
      task/item plus exit-10 halt plus blocked derive, awareness blocks []
      digest never blocking/exiting, debt predicate kind tech-debt routed or
      disposition optional routed. Behavior tests: mailbox files per
      disposition, exit 10 on stop, awareness continues, debt includes [item]
      summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-human-debt
    title: Human mailbox and debt routing
  - deps:
      - modes-prompts
      - routing-human-debt
    description: "Full ADR md title/context/decision/consequences/blocking, blocking
      routed per mode table with exit-10 when stop, remarkable digest-only never
      waiting, dispositions.md exit-10 preserved. Behavior tests: blocking
      mailbox+blocks, remarkable digest only."
    kind: story
    milestoneId: m3-routing
    slug: adr-blocking-digest
    title: Blocking vs remarkable ADRs
  - deps:
      - adr-blocking-digest
      - routing-architect-consult
      - spike-text-budget
    description: "Hydrate wave/plan-close-up and architect reports with concernsYaml
      capped per spike (UTF-8 bytes), concernResolutions pending plus architect
      concernConfirms accept/reject, propagate to parent/digest, simple-item
      explicit plus auto-route fallback (tech-debt to optional, others to
      architect, human never auto). Behavior tests: concrete byte budgets,
      pending/confirm, simple fallback."
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: funnel-closeups
    title: Funnel close-ups and simple triage
  - deps:
      - routing-architect-consult
      - spike-saga-commit
    description: "runChildTask propagateEpicConcerns per spike: after child
      completion before cleanup/merge, condensed parent copies source.epic with
      parent detail smaller than child, extended parent concernsYaml hydration.
      Behavior tests: one copy, dismissed stays local, saga input contains id."
    escalate: true
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: saga-propagate
    title: Epic to saga propagation
  - deps:
      - concerns-store
      - routing-human-debt
    description: "Sole owner StateArtifact.concerns
      {open,dismissed,routed,resolved}, state.schema,
      toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI
      Concerns plus Blocking vs Digest. Behavior tests: counts, missing/corrupt,
      CLI sections."
    kind: story
    milestoneId: m4-funnel-surface
    slug: status-state-surface
    title: State counts and status surfacing
  - deps:
      - funnel-closeups
      - modes-prompts
      - saga-propagate
      - status-state-surface
    description: "Update ARCHITECTURE section 1 row 18 plus 6.2 plus 8, README,
      config commentary, dispositions.md; fragment matrix plus 15/60 debloat
      check; consolidate test/engine/concerns-funnel.test.ts plus steer/CLI
      coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test."
    kind: story
    milestoneId: m5-docs
    slug: docs-finish
    title: Docs and suite consolidation
  - deps:
      - modes-prompts-v2
      - routing-blocker-derive-v2
    description: "Act phase only: wave-act newly-blocked check writes
      decisions/concern-<cid>.yaml exactly once (restart idempotent) +
      buildArchitectHydration concernsYaml extension (append LAST, open+routed,
      capped sub-budget, plan-reviewer path stays open-only). This is a
      merge-repair rerun of the COMPLETE ready implementation (steps approved,
      targets green); do NOT redesign: rebase the exact merged-diff approach
      onto current topic tip, verify wave-9 sibling conflict resolution
      (adr-blocking-digest-v2, status-state-surface-v2) kept ALL THREE diffs,
      then TMRDIR-normalized gates. Pull and fix the exact merge-gate failure
      (names+output in evidence). Out of scope: 4 optional nits (carry to
      docs-finish-v2)."
    kind: story
    milestoneId: m3-routing
    slug: routing-architect-consult-v3
    title: Architect consult and hydration (merge repair)
assumptions:
  - assumption: Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures
      do not mask regressions.
    why: Baseline red only under .factory-runtime TMPDIR; suite green with
      TMPDIR=/tmp. Out of scope.
  - assumption: Concern identity excludes detail and severity per
      adr-fingerprint-merge; reworded detail merges and severity escalations
      surface via escalated flag without reopening.
    why: Prevents trivial-reword duplicates while keeping escalation visible to
      architect and digest.
  - assumption: buildArchitectHydration does not read parent concerns/ today;
      saga-propagate extends it with concernsYaml, and runChildTask copies
      condensed epic concerns to parent concerns/ after child completion but
      before cleanup/merge per spike-saga-commit.
    why: Corrects the prior hydration assumption; defines the copy timing and seam
      the spike must verify.
  - assumption: Per-mode blocking table in adr-humaninvolvement-config is
      authoritative for iteration 1; raise allowlist defaults to all agents.
    why: Unblocks routing without operator tuning; task pipeline.yaml can override.
  - assumption: Dismissed concerns stay dismissed on severity escalation but appear
      as escalated notes in digest and architect hydration.
    disposition: human-awareness
    why: Surfaces the hidden-escalation tradeoff to the operator without
      auto-reopening triaged work.
techDebt:
  - category: adjacent
    description: Pre-existing head-guard failures when TMPDIR sits under
      .factory-runtime because step-runner splits on /.factory. Baseline red;
      green with TMPDIR=/tmp. Out of scope.
    id: td-tmpdir-split
  - category: impacting
    description: reviewAllowed resolved in two places with non-canonical
      allowedDispositions key and wrong fallback order, so per-agent dismiss
      could fail schema validation.
    id: td-reviewpolicy-divergence
    resolution: "Fix in concerns-contracts: canonical reviewPolicy.default, legacy
      alias, single resolveReviewAllowed(pipeline,agent,isTriager) with
      precedence and dismiss injection used by prompt and schema paths."
  - category: impacting
    description: ADR writer persists only title plus context and PlanAdr lacks
      blocking; human-stop contract drifted from exit-10.
    id: td-adr-md-truncated
    resolution: "Fix in adr-blocking-digest and routing-human-debt: full md with
      decision, consequences, blocking plus preserved exit-10 halt and
      dispositions.md update."
  - category: impacting
    description: human-awareness and human-stop ignored, debt derivation ignores
      routed concerns, status lists digest as blocking.
    id: td-human-debt-gaps
    resolution: "Fix in routing-human-debt and status-state-surface: stop exit-10
      plus blocked, awareness digest with empty blocks, debt from predicate,
      Blocking versus Digest split."
adrs:
  - context: Item steps commit only childWt while concerns/ lives on taskWt; up to 4
      parallel items share taskDir; retries/restarts must not duplicate or lose
      triage.
    decision: Write directly to taskWt/{task}/concerns/ with writeYamlAtomic plus
      runExclusive taskWt mutex, then immediately commit taskWt when concerns/
      or steer/ changed. Distinct fingerprints are distinct files; same
      fingerprint merges without clobbering dismissed/routed/resolved. Restart
      re-reads files idempotently. Implementation gated by spike-saga-commit
      serialization findings.
    id: adr-concern-store-taskwt
    title: Direct taskWt writes with serialized immediate commit
  - context: suggestions[] reuse conflated concern triage with fix-loop, mailbox,
      and plan-approval triggers; review id is free-form; QA must not triage;
      dismiss needs a reason field.
    decision: "Exact-id match (suggestion.id === c-<hash10> or rm-<hash10>) via
      partitionSuggestions splits triage entries from normal findings. Triage
      ids update concerns/ only and are excluded from
      fix-loop/approval/normal-mailbox paths; fix on a concern id routes as fix
      and returns fixRequired once for the owning item; human-async on a concern
      writes a single q-concern-<cid> (normal path skipped). Dismiss requires
      non-empty detail persisted to dismissReason or the step errors. isTriager
      gate allows only reviewer, plan-reviewer, and close-up/architect chain.
      Reviewer ordering: aggregate new concerns[] first, then triage only
      pre-existing ids from concernsYaml (no same-step self-dismiss)."
    id: adr-triage-suggestions-dismiss
    title: Partitioned exact-id triage with gate
  - context: derive/* must stay pure; debt routing invented an invalid tech-debt
      disposition; consult writes need exactly-once; mailbox needs dedup.
    decision: "Pure derive: derive/task.ts collectRoutedBlockers(taskDir) reads
      routed kind==blocker affects into a Set passed to deriveWave/deriveItem
      and scheduler.blockedByConcern(items, concernBlocked) which reuses the
      blockedByFailure fixpoint pattern, unions with failure-blocked, and
      cascades only over declared deps. Debt predicate: (kind==tech-debt &&
      status routed/resolved) OR (disposition==optional && status routed); no
      tech-debt disposition exists. Act phase (triage writeArtifact plus
      wave-act newly-blocked check) writes decisions/concern-<cid>.yaml exactly
      once, idempotent on restart, and extends buildArchitectHydration with
      concernsYaml."
    id: adr-routing-derived-state
    title: Pure derive plus exactly-once act routing
  - context: Digest must reuse the mailbox without blocking, halting, or spamming
      status; classify handles operator answers, not blocking.
    decision: Digest entries are steer/tousertoreview entries with disposition
      human-awareness and blocks:[]. derive/task splits openSteerQuestions into
      blocking (blocks.length>0) versus digest (awareness plus empty blocks);
      classify only routes answers/directives/stop; status renders separate
      Blocking versus Digest sections.
    id: adr-digest-mailbox
    title: Digest as filtered non-blocking mailbox view
  - context: Spec needs autonomous/principal/detailed presets plus raise allowlist
      and severity thresholds; pipeline root is closed.
    decision: "Top-level PipelineConfig.humanInvolvement (default autonomous) plus
      PipelineConfig.concerns {raiseAllowlist?, minDigestSeverity?,
      minBlockingSeverity?}. Blocking table: autonomous blocks only on blocking
      ADR or high human-stop; principal adds human-async and high severity;
      detailed adds all human-*. Thresholds gate blocking versus digest
      placement. Criteria fragment agents/criteria/human-involvement.md carries
      the table tersely."
    id: adr-humaninvolvement-config
    title: Modes plus raise and severity config
  - context: Funnel requires less detail per level and never more text than code
      summarized, with falsifiable checks and no empty digest on zero-diff
      steps.
    decision: "Per-level UTF-8 byte caps on hydrated promptVars only (stored
      artifacts never truncated): code steps cap min(diffBytes,2000) where diff
      is item diff for review triage and wave aggregated diff for close-ups;
      zero-diff orchestration steps cap min(inputBytes,500) where input is
      plan/context bytes. Reviewer/architect/close-up prompts require condensing
      with output bytes < input bytes. Engine truncates only the hydrated var."
    id: adr-funnel-text-budget
    title: Per-level hydration byte caps
  - context: PipelineConfig type says {default,[agent]} but flows read
      .allowedDispositions as if global; precedence and dismiss injection are
      undefined.
    decision: "Canonical key is reviewPolicy.default with legacy
      reviewPolicy.allowedDispositions as a one-iteration read-alias. Single
      owner src/core/review-policy.ts resolveReviewAllowed(pipeline, agent,
      isTriager): precedence per-agent array > default > builtin
      [fix,optional,architect,human-awareness,human-async]; when isTriager is
      true append dismiss if absent; QA and other non-triagers never receive
      dismiss. Used by both prompt criteria and generateReviewSchema."
    id: adr-reviewpolicy-canonical
    title: Canonical reviewPolicy with triager injection
  - context: Hashing detail/severity duplicates on rewording; excluding them hides
      severity escalation on dismissed concerns.
    decision: "Stable id c-{sha1-10} over {kind, normalizedSummary, location,
      sortedAffects} excluding detail and severity. Normalization trims,
      collapses whitespace, lowercases summary. Re-emit merges: detail keeps
      longer/latest, severity keeps max, updatedAt and source.lastSeen advance,
      never changes dismissed/routed/resolved except via triage or close-up
      resolution. If re-emit severity exceeds stored severity, set
      source.escalated=true and surface the escalation in digest and architect
      hydration without reopening; architect may reopen via close-up
      resolution."
    id: adr-fingerprint-merge
    title: Fingerprint identity, merge, escalation surfacing
  - context: Close-up schemas are closed, wave-close-up has no reviewer, stored
      statuses have no pending, and simple items have no reviewer.
    decision: "Add concernResolutions?: [{id, action: resolve|carry|propagate,
      note?}] plus concerns[]/remarkable[] producer fields to wave/plan-closeup
      schemas and StoredConcern.pendingResolution?: {action,note,by,at}.
      Wave-close-up proposes via applyCloseupResolutions (status stays routed,
      pending set); architect-wave-report confirms via concernConfirms?: [{id,
      confirm: accept|reject, note?}] applying resolved/routed/propagated or
      clearing pending. Propagate targets parent concerns/ copy for epics or
      human digest for task-level unless elevated to blocking ADR. Simple-item
      fallback at wave-close-up: kind tech-debt auto-routes to disposition
      optional (debt), all other kinds to architect (carry); human-* is never
      auto-routed."
    id: adr-closeup-retriage
    title: Close-up pending resolution and simple fallback
  - context: Remarkable {chosen,alternatives,why} needs one authoritative store and
      the same triage vocabulary.
    decision: Authoritative store is concerns/rm-{hash10}.yaml with
      RemarkableDecision plus status and source. Triaged with suggestions[]
      dismiss vocabulary via exact-id match under the same partition and gate.
      Routed remarkables go digest-only unless elevated to a blocking ADR.
    id: adr-remarkable-store
    title: Remarkable decisions in rm- files
  - context: dispositions.md and ARCHITECTURE 8.7 define human-stop as
      tousertoreview plus exit-10 halt, but item-machine treats it fix-like
      running.
    decision: "Preserve exit-10 halt: human-stop writes a mailbox entry with blocks
      covering affected items plus task when task-level, item-machine maps it to
      blocked terminal, derive marks item and task blocked, and the engine halts
      with exit code 10 at the next mailbox check until answered or dismissed.
      Awareness with blocks:[] never enters blocked sets and never triggers exit
      10. Update dispositions.md and ARCHITECTURE 8.7 to keep the contract
      explicit."
    id: adr-human-stop
    title: Human-stop preserves exit-10 halt
  - context: Derive throws on corrupt triage/plan/steer/decisions while concerns/
      proposes skip; one bad concern could fail a whole step.
    decision: Corrupt concerns/*.yaml files are skipped with a warn and excluded
      from counts because concerns/ is an append-only cache rebuildable from
      committed step records; missing concerns/ yields zero counts. A single
      unknown-kind concern fails its step with no partial aggregate and no
      clobber of existing files, forcing prompt/schema drift to surface via
      retry rather than silent loss.
    id: adr-resilience
    title: Corrupt-skip versus strict-fail resilience
  - context: Spec says every agent output may carry concerns[], but not every schema
      has a producer and reviewer has a dual aggregate-plus-triage role.
    decision: "Producer matrix via a shared concern/remarkable partial: developer,
      fact-finder, qa, poc, test-assumptions, reviewer/plan-reviewer new
      concerns[], architect plan/revise, consult decisions, wave/plan-closeup,
      architect wave-report/closeup. Triage, infra, and pm-edit mechanical
      outputs are explicitly out of scope (no LLM synthesis). Consults aggregate
      via runItemConsult/runNonItemConsult writeArtifact. Reviewer ordering:
      aggregate new concerns first, then triage only pre-existing ids."
    id: adr-producer-matrix
    title: Producer matrix and reviewer ordering


--- Prior Plan plan-1.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "artifacts.ts: Concern, RemarkableDecision,
        StoredConcernArtifact(+pendingResolution?, source.escalated?),
        ReviewDisposition+dismiss (no tech-debt), PlanAdr.blocking,
        PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeveri\
        ty,minBlockingSeverity}, reviewPolicy.default canonical"
      - "config/schemas: shared concern/remarkable partial in developer,
        fact-finder, qa, poc, test-assumptions, review newConcerns, plan,
        decisions, wave/plan-closeup, architect reports; triage/infra/pm-edit
        out of scope; dismiss detail-required; closeup concernResolutions"
      - "src/core/concerns.ts: concernFingerprint(identity),
        aggregateConcerns(merge+escalated), listOpenConcerns,
        applyConcernTriage(exact-id,isTriager), applyCloseupResolutions,
        partitionSuggestions(triage vs findings)"
      - "src/core/review-policy.ts:
        resolveReviewAllowed(pipeline,agent,isTriager)
        per-agent>default>builtin, legacy allowedDispositions alias, dismiss
        auto-append for triagers; generateReviewSchema uses it; taskWt
        runExclusive+atomic+immediate-commit helper"
    id: m1-contracts-aggregate
    scenarios:
      - Given a developer step emitting a blocker concern When the step commits
        Then concerns/c-<fp10>.yaml exists with status open and source.record
        pointing at the step record
      - Given the same concern re-emitted on retry When aggregation runs Then
        exactly one file exists, prior dismissed/routed preserved,
        updatedAt/lastSeen advance
      - Given a concern missing severity and detail When validation runs Then
        severity defaults to medium, detail defaults to summary, and the file is
        created
      - Given a concern with unknown kind When validation runs Then the step
        errors, no concerns file is written, existing files stay untouched
      - Given developer, fact-finder, qa, poc, review-new, plan, consult,
        closeup, and architect-report outputs carrying concerns[]+remarkable[]
        When steps commit Then each aggregates to concerns/c-*.yaml or rm-*.yaml
        with open status and source pointer; triage/infra/pm-edit carry none
      - Given reviewer output with new concerns[] plus suggestions triaging a
        pre-existing id When the step commits Then the new concern aggregates
        open and only the pre-existing id is triaged (no same-step self-dismiss)
      - Given reviewPolicy.default [fix,optional] plus reviewer override
        [fix,optional,architect] When resolveReviewAllowed runs Then reviewer
        triager gets override+dismiss and QA non-triager gets default without
        dismiss
      - Given a dismissed concern re-emitted with higher severity When merge
        runs Then status stays dismissed but source.escalated=true and the
        escalation appears in digest and architect hydration
    title: Contracts and aggregation foundation
  - directionalInterfaces:
      - "prompt-vars KNOWN_VARS+descriptions: concernsYaml in steps/review,
        steps/plan-review, steps/wave-close-up, steps/plan-close-up,
        architect-plan, architect-wave-report, architect-closeup,
        architect-consult-*; humanInvolvementCriteria in review, plan-review,
        architect-*"
      - item-machine review + iteration plan-review promptVars and writeArtifact
        with isTriager gate, partitionSuggestions excluding triage ids from
        fix-loop/approval/normal mailbox, fix-on-concern fixRequired once,
        mailbox dedup q-concern-<cid>
      - agents reviewer, plan-reviewer, criteria/dispositions,
        criteria/human-involvement terse confirm/dismiss/condense plus blocking
        table plus condensing rule output-bytes<input-bytes
      - config/pipeline.default.yaml commented autonomous/principal/detailed
        presets with blocking table plus concerns raise/threshold examples
    id: m2-triage-modes
    scenarios:
      - Given open item concerns When review runs Then steps/review receives
        concernsYaml with id/kind/severity/summary/affects and terse triage
        instructions
      - Given reviewer suggestion matching a concern id with disposition dismiss
        and detail When review commits Then that file has status dismissed plus
        dismissReason=detail and no mailbox, debt, blocked, or approval effect
      - Given a matching dismiss suggestion without detail When review commits
        Then the step errors and no triage is persisted
      - Given QA emitting a matching concern id When QA commits Then no triage
        is applied and the file stays open
      - Given matching suggestions with fix, optional, architect, or human-*
        When review commits Then each file becomes routed with disposition
        persisted; triage ids are excluded from normal fix-loop/approval/mailbox
        except fix-on-concern sets fixRequired once; human-async on a concern
        writes a single q-concern-<cid>
      - Given architect plan concerns plus an rm-* file When plan-review runs
        Then plan-reviewer triages with the same vocabulary and non-dismissed
        files become routed; debt predicate is kind==tech-debt&&routed or
        disposition==optional (no tech-debt disposition)
      - Given pipeline.yaml humanInvolvement principal When reviewer and
        architect prompts render Then the mode criteria fragment is included and
        preflightPrompts passes
    title: Reviewer triage and modes
  - directionalInterfaces:
      - derive/task.ts collectRoutedBlockers(taskDir)->Set plus
        deriveWave/deriveItem integration;
        scheduler.blockedByConcern(items,concernBlocked) pure reusing
        blockedByFailure fixpoint, unioned, cascade only over declared deps
      - "act-phase routing: triage writeArtifact plus wave-act newly-blocked
        check writing decisions/concern-<cid>.yaml exactly once (restart
        idempotent); buildArchitectHydration extended with concernsYaml digest"
      - steer writeQuestion for human-async/stop/blocking ADR; derive/task
        blocking-vs-digest split (blocks.length>0 vs awareness empty); debt
        predicate; human-stop exit-10 halt plus blocked
    id: m3-routing
    scenarios:
      - Given a routed blocker whose affects names a declared dependent When
        derive runs Then the dependent derives blocked with no writes;
        non-dependents are unaffected and transitive blocking follows declared
        deps only
      - Given a newly blocked dependent When the act phase runs Then exactly one
        decisions/concern-<cid>.yaml is written and a restart writes no second
        file
      - Given a routed architect concern When the next architect turn builds
        hydration Then its concernsYaml input contains that concern id and
        summary
      - Given a routed human-async concern When routing runs Then mailbox
        q-concern-<cid> has blocks=[item], the item derives blocked, and the
        engine continues without exit 10
      - Given a routed human-stop concern When routing runs Then the mailbox
        entry blocks task/item, item and task derive blocked, and the engine
        halts with exit code 10 until answered or dismissed
      - Given a routed human-awareness concern When routing runs Then the
        mailbox entry has blocks=[] in the Digest section and the engine
        continues with no blocked set and no exit 10
      - Given plan ADRs blocking true and false under autonomous mode When plan
        commits Then the blocking ADR creates a mailbox question with blocks
        while the remarkable ADR appears only in the digest; debt includes kind
        tech-debt routed or disposition optional routed as [item] summary
    title: Routing to blocked, architect, mailbox, debt
  - directionalInterfaces:
      - closeup schemas concernResolutions resolve/carry/propagate plus
        concerns[]/remarkable[];
        StoredConcern.pendingResolution{action,note,by,at};
        applyCloseupResolutions proposes (status stays routed); architect
        concernConfirms accept/reject applies; propagate to parent concerns/
        copy or human digest
      - "iteration.ts concernsYaml hydration capped UTF-8 bytes: code steps
        min(diffBytes,2000); zero-diff orchestration min(inputBytes,500);
        reviewer/architect condensing prompts require output<input; engine
        truncates hydrated var only"
      - engine.ts runChildTask propagateEpicConcerns after child completion
        before cleanup/merge, condensed copies with source.epic, parent
        hydration extended; size assert parent-detail<child-detail
      - derive/task.ts toStateArtifact().concerns counts (missing dir zeros,
        corrupt skip+warn); cli/status.ts Concerns plus separate Blocking vs
        Digest sections
    id: m4-funnel-surface
    replanAfter: true
    scenarios:
      - Given wave diff 5000 bytes and open concerns 3000 bytes When
        wave-close-up hydrates Then concernsYaml is <=2000 bytes and < wave diff
        in UTF-8 bytes
      - Given zero-diff plan-review with 4000-byte input When hydrating Then
        concernsYaml is <=500 bytes and < input bytes
      - Given wave-close-up emitting concernResolutions resolve/carry/propagate
        When it commits Then files stay routed with pendingResolution set;
        architect accept applies resolved/routed/propagated and reject clears
        pending
      - Given a simple item with open concerns and no reviewer When
        wave-close-up runs Then explicit resolutions triage them; fallback
        auto-routes kind tech-debt to optional (debt) and other kinds to
        architect (carry); human-* is never auto-routed
      - Given a child epic finishing with one dismissed and one open concern
        with 800-byte detail When runChildTask completes before cleanup Then the
        parent gains exactly one condensed copy with source.epic, detail <800
        bytes, hydrating saga architect concernsYaml
      - Given mixed-status concerns plus a corrupt yaml file When state
        refreshes and factory status runs Then state.yaml counts skip the
        corrupt file with warn, missing dir yields zeros, and CLI shows Concerns
        plus Blocking vs Digest sections
    title: Funnel, close-ups, saga, surfacing
  - directionalInterfaces:
      - docs/ARCHITECTURE.md §1 row 18 + §6.2 concerns/ + §8
        funnel/routing/modes/partition/producer-matrix/resilience/exit-10,
        README.md, config commentary, agents/criteria/dispositions.md human-stop
        exit-10 preserved
      - "fragment matrix (8 fragments) + debloat check: each fragment ≤15 lines,
        total growth ≤60 lines, preflight plus line-count assertion in
        prompts.test"
    id: m5-docs
    scenarios:
      - Given implementation complete When docs are read Then ARCHITECTURE,
        README, config commentary, and dispositions describe concerns lifecycle,
        funnel sizes, partition, producer matrix, exit-10, modes, and counts
        with terse prompts
      - Given prompt fragments When prompts.test runs Then KNOWN_VARS plus
        descriptions cover all 8 fragments and added lines respect ≤15/≤60
        budgets
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    title: Docs and suite consolidation
uncertainties:
  - description: Funnel byte budget per-level sources, zero-diff rule, and
      bytes-vs-chars unit needed before close-up hydration.
    id: u-text-budget
    spikeOutlines:
      - test-assumptions spike-text-budget verifies code min(diff,2000) and
        zero-diff min(input,500) UTF-8 bytes with output<input condensing
  - description: Epic propagation timing plus taskWt serialization/restart behavior
      and pure-derive versus act-phase boundary needed before store, blocker
      derive, and saga propagation.
    id: u-saga-propagation
    spikeOutlines:
      - fact-finder spike-saga-commit verifies parent-copy timing, runExclusive
        serialization, immediate commit idempotency, collectRoutedBlockers
        owner, and hydration seam
itemOutlines:
  - deps: []
    description: "test-assumptions: measure item/wave diff bytes vs concern detail
      sizes; confirm per-level caps code min(diff,2000) and zero-diff
      min(input,500) UTF-8 bytes, condensing output<input, no 500-floor
      violation. Finding record only, no prod code; gates funnel-closeups."
    kind: test-assumptions
    milestoneId: m1-contracts-aggregate
    slug: spike-text-budget
    title: "Spike: funnel byte budget"
  - deps: []
    description: "fact-finder: verify runChildTask copy timing before cleanup/merge,
      parent buildArchitectHydration extension point, taskWt runExclusive
      serialization under 4 parallel items, immediate commit plus restart
      idempotency, pure-derive vs act-phase boundary with collectRoutedBlockers
      owner. Finding only; gates concerns-store, routing-blocker-derive,
      saga-propagate."
    kind: fact-finder
    milestoneId: m1-contracts-aggregate
    slug: spike-saga-commit
    title: "Spike: saga propagation, commit, derive boundary"
  - deps: []
    description: "Types plus schemas for producer matrix (developer, fact-finder,
      qa, poc, test-assumptions, review newConcerns, plan, decisions,
      wave/plan-closeup with concernResolutions, architect reports) via shared
      partial; triage/infra/pm-edit out of scope. Canonical
      reviewPolicy.default, legacy alias,
      resolveReviewAllowed(pipeline,agent,isTriager) precedence plus dismiss
      injection, generateReviewSchema, dismiss detail-required, pipeline
      humanInvolvement plus concerns thresholds. Tests: typecheck, preflight,
      repair defaults vs strict reject unknown kind."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts
    title: Concern contracts and canonical review policy
  - deps:
      - concerns-contracts
      - spike-saga-commit
    description: "Implement src/core/concerns.ts (fingerprint identity, merge with
      escalated flag, aggregate/list/triage/closeup/partition, atomic YAML plus
      runExclusive plus immediate taskWt commit, restart idempotent). Wire all
      producer seams including consult writeArtifact; reviewer ordering
      aggregates new then triages pre-existing only. Behavior tests:
      open+source, retry dedup, reword merge preserving status plus escalation
      surfacing, rm-* aggregate, precedence/injection. Run TMPDIR=/tmp bun test
      test/engine/concerns-funnel.test.ts."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-store
    title: Concerns store with merge and commit
  - deps:
      - concerns-store
    description: "Item reviewer triage with concernsYaml in steps/review, isTriager
      gate, exact-id partition excluding triage ids from
      fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox
      dedup q-concern-<cid>, dismiss detail to dismissReason, condensing
      output<input, debt predicate without tech-debt disposition. Behavior
      tests: dismiss no routing, routed persist, QA gate no-op, missing detail
      errors, fix-once, no double mailbox."
    kind: story
    milestoneId: m2-triage-modes
    slug: reviewer-triage
    title: Workhorse reviewer triage
  - deps:
      - concerns-store
    description: "Architect path: aggregate plan/revise concerns plus remarkable
      rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition
      and dismiss vocabulary, non-dismissed become routed. Behavior tests:
      dismissed vs routed, rm-* triaged, debt predicate, no approval trigger
      from triage ids."
    kind: story
    milestoneId: m2-triage-modes
    slug: plan-reviewer-triage
    title: Plan-reviewer triage
  - deps:
      - concerns-contracts
    description: "humanInvolvement plus concerns thresholds schema/loader/merge,
      commented autonomous/principal/detailed presets with blocking table,
      agents/criteria/human-involvement.md terse fragment, KNOWN_VARS
      concernsYaml plus humanInvolvementCriteria with descriptions wired per
      fragment matrix. Behavior tests: mode switch changes criteria and
      blocking-ADR behavior; preflight green. Precedes all routing."
    kind: story
    milestoneId: m2-triage-modes
    slug: modes-prompts
    title: Modes, thresholds, prompt wiring
  - deps:
      - plan-reviewer-triage
      - reviewer-triage
      - modes-prompts
      - spike-saga-commit
    description: "Pure derive only: derive/task collectRoutedBlockers plus
      deriveWave/deriveItem integration, scheduler.blockedByConcern reusing
      fixpoint, union with failure-blocked, cascade only declared deps, no
      writes. Behavior tests: dependent blocked, non-dep unaffected, transitive
      via deps only."
    escalate: true
    kind: story
    milestoneId: m3-routing
    slug: routing-blocker-derive
    title: Blocker derive
  - deps:
      - modes-prompts
      - routing-blocker-derive
    description: "Act phase only: wave-act newly-blocked check writes
      decisions/concern-<cid>.yaml exactly once (restart idempotent) plus
      buildArchitectHydration concernsYaml extension for wave-report/next-plan.
      Behavior tests: single consult file, restart no duplicate, architect input
      contains id+summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-architect-consult
    title: Architect consult and hydration
  - deps:
      - reviewer-triage
      - modes-prompts
    description: "human-async blocks [item] and continues, human-stop blocks
      task/item plus exit-10 halt plus blocked derive, awareness blocks []
      digest never blocking/exiting, debt predicate kind tech-debt routed or
      disposition optional routed. Behavior tests: mailbox files per
      disposition, exit 10 on stop, awareness continues, debt includes [item]
      summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-human-debt
    title: Human mailbox and debt routing
  - deps:
      - modes-prompts
      - routing-human-debt
    description: "Full ADR md title/context/decision/consequences/blocking, blocking
      routed per mode table with exit-10 when stop, remarkable digest-only never
      waiting, dispositions.md exit-10 preserved. Behavior tests: blocking
      mailbox+blocks, remarkable digest only."
    kind: story
    milestoneId: m3-routing
    slug: adr-blocking-digest
    title: Blocking vs remarkable ADRs
  - deps:
      - adr-blocking-digest
      - routing-architect-consult
      - spike-text-budget
    description: "Hydrate wave/plan-close-up and architect reports with concernsYaml
      capped per spike (UTF-8 bytes), concernResolutions pending plus architect
      concernConfirms accept/reject, propagate to parent/digest, simple-item
      explicit plus auto-route fallback (tech-debt to optional, others to
      architect, human never auto). Behavior tests: concrete byte budgets,
      pending/confirm, simple fallback."
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: funnel-closeups
    title: Funnel close-ups and simple triage
  - deps:
      - routing-architect-consult
      - spike-saga-commit
    description: "runChildTask propagateEpicConcerns per spike: after child
      completion before cleanup/merge, condensed parent copies source.epic with
      parent detail smaller than child, extended parent concernsYaml hydration.
      Behavior tests: one copy, dismissed stays local, saga input contains id."
    escalate: true
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: saga-propagate
    title: Epic to saga propagation
  - deps:
      - concerns-store
      - routing-human-debt
    description: "Sole owner StateArtifact.concerns
      {open,dismissed,routed,resolved}, state.schema,
      toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI
      Concerns plus Blocking vs Digest. Behavior tests: counts, missing/corrupt,
      CLI sections."
    kind: story
    milestoneId: m4-funnel-surface
    slug: status-state-surface
    title: State counts and status surfacing
  - deps:
      - funnel-closeups
      - modes-prompts
      - saga-propagate
      - status-state-surface
    description: "Update ARCHITECTURE section 1 row 18 plus 6.2 plus 8, README,
      config commentary, dispositions.md; fragment matrix plus 15/60 debloat
      check; consolidate test/engine/concerns-funnel.test.ts plus steer/CLI
      coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test."
    kind: story
    milestoneId: m5-docs
    slug: docs-finish
    title: Docs and suite consolidation
assumptions:
  - assumption: Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures
      do not mask regressions.
    why: Baseline red only under .factory-runtime TMPDIR; suite green with
      TMPDIR=/tmp. Out of scope.
  - assumption: Concern identity excludes detail and severity per
      adr-fingerprint-merge; reworded detail merges and severity escalations
      surface via escalated flag without reopening.
    why: Prevents trivial-reword duplicates while keeping escalation visible to
      architect and digest.
  - assumption: buildArchitectHydration does not read parent concerns/ today;
      saga-propagate extends it with concernsYaml, and runChildTask copies
      condensed epic concerns to parent concerns/ after child completion but
      before cleanup/merge per spike-saga-commit.
    why: Corrects the prior hydration assumption; defines the copy timing and seam
      the spike must verify.
  - assumption: Per-mode blocking table in adr-humaninvolvement-config is
      authoritative for iteration 1; raise allowlist defaults to all agents.
    why: Unblocks routing without operator tuning; task pipeline.yaml can override.
  - assumption: Dismissed concerns stay dismissed on severity escalation but appear
      as escalated notes in digest and architect hydration.
    disposition: human-awareness
    why: Surfaces the hidden-escalation tradeoff to the operator without
      auto-reopening triaged work.
techDebt:
  - category: adjacent
    description: Pre-existing head-guard failures when TMPDIR sits under
      .factory-runtime because step-runner splits on /.factory. Baseline red;
      green with TMPDIR=/tmp. Out of scope.
    id: td-tmpdir-split
  - category: impacting
    description: reviewAllowed resolved in two places with non-canonical
      allowedDispositions key and wrong fallback order, so per-agent dismiss
      could fail schema validation.
    id: td-reviewpolicy-divergence
    resolution: "Fix in concerns-contracts: canonical reviewPolicy.default, legacy
      alias, single resolveReviewAllowed(pipeline,agent,isTriager) with
      precedence and dismiss injection used by prompt and schema paths."
  - category: impacting
    description: ADR writer persists only title plus context and PlanAdr lacks
      blocking; human-stop contract drifted from exit-10.
    id: td-adr-md-truncated
    resolution: "Fix in adr-blocking-digest and routing-human-debt: full md with
      decision, consequences, blocking plus preserved exit-10 halt and
      dispositions.md update."
  - category: impacting
    description: human-awareness and human-stop ignored, debt derivation ignores
      routed concerns, status lists digest as blocking.
    id: td-human-debt-gaps
    resolution: "Fix in routing-human-debt and status-state-surface: stop exit-10
      plus blocked, awareness digest with empty blocks, debt from predicate,
      Blocking versus Digest split."
adrs:
  - context: Item steps commit only childWt while concerns/ lives on taskWt; up to 4
      parallel items share taskDir; retries/restarts must not duplicate or lose
      triage.
    decision: Write directly to taskWt/{task}/concerns/ with writeYamlAtomic plus
      runExclusive taskWt mutex, then immediately commit taskWt when concerns/
      or steer/ changed. Distinct fingerprints are distinct files; same
      fingerprint merges without clobbering dismissed/routed/resolved. Restart
      re-reads files idempotently. Implementation gated by spike-saga-commit
      serialization findings.
    id: adr-concern-store-taskwt
    title: Direct taskWt writes with serialized immediate commit
  - context: suggestions[] reuse conflated concern triage with fix-loop, mailbox,
      and plan-approval triggers; review id is free-form; QA must not triage;
      dismiss needs a reason field.
    decision: "Exact-id match (suggestion.id === c-<hash10> or rm-<hash10>) via
      partitionSuggestions splits triage entries from normal findings. Triage
      ids update concerns/ only and are excluded from
      fix-loop/approval/normal-mailbox paths; fix on a concern id routes as fix
      and returns fixRequired once for the owning item; human-async on a concern
      writes a single q-concern-<cid> (normal path skipped). Dismiss requires
      non-empty detail persisted to dismissReason or the step errors. isTriager
      gate allows only reviewer, plan-reviewer, and close-up/architect chain.
      Reviewer ordering: aggregate new concerns[] first, then triage only
      pre-existing ids from concernsYaml (no same-step self-dismiss)."
    id: adr-triage-suggestions-dismiss
    title: Partitioned exact-id triage with gate
  - context: derive/* must stay pure; debt routing invented an invalid tech-debt
      disposition; consult writes need exactly-once; mailbox needs dedup.
    decision: "Pure derive: derive/task.ts collectRoutedBlockers(taskDir) reads
      routed kind==blocker affects into a Set passed to deriveWave/deriveItem
      and scheduler.blockedByConcern(items, concernBlocked) which reuses the
      blockedByFailure fixpoint pattern, unions with failure-blocked, and
      cascades only over declared deps. Debt predicate: (kind==tech-debt &&
      status routed/resolved) OR (disposition==optional && status routed); no
      tech-debt disposition exists. Act phase (triage writeArtifact plus
      wave-act newly-blocked check) writes decisions/concern-<cid>.yaml exactly
      once, idempotent on restart, and extends buildArchitectHydration with
      concernsYaml."
    id: adr-routing-derived-state
    title: Pure derive plus exactly-once act routing
  - context: Digest must reuse the mailbox without blocking, halting, or spamming
      status; classify handles operator answers, not blocking.
    decision: Digest entries are steer/tousertoreview entries with disposition
      human-awareness and blocks:[]. derive/task splits openSteerQuestions into
      blocking (blocks.length>0) versus digest (awareness plus empty blocks);
      classify only routes answers/directives/stop; status renders separate
      Blocking versus Digest sections.
    id: adr-digest-mailbox
    title: Digest as filtered non-blocking mailbox view
  - context: Spec needs autonomous/principal/detailed presets plus raise allowlist
      and severity thresholds; pipeline root is closed.
    decision: "Top-level PipelineConfig.humanInvolvement (default autonomous) plus
      PipelineConfig.concerns {raiseAllowlist?, minDigestSeverity?,
      minBlockingSeverity?}. Blocking table: autonomous blocks only on blocking
      ADR or high human-stop; principal adds human-async and high severity;
      detailed adds all human-*. Thresholds gate blocking versus digest
      placement. Criteria fragment agents/criteria/human-involvement.md carries
      the table tersely."
    id: adr-humaninvolvement-config
    title: Modes plus raise and severity config
  - context: Funnel requires less detail per level and never more text than code
      summarized, with falsifiable checks and no empty digest on zero-diff
      steps.
    decision: "Per-level UTF-8 byte caps on hydrated promptVars only (stored
      artifacts never truncated): code steps cap min(diffBytes,2000) where diff
      is item diff for review triage and wave aggregated diff for close-ups;
      zero-diff orchestration steps cap min(inputBytes,500) where input is
      plan/context bytes. Reviewer/architect/close-up prompts require condensing
      with output bytes < input bytes. Engine truncates only the hydrated var."
    id: adr-funnel-text-budget
    title: Per-level hydration byte caps
  - context: PipelineConfig type says {default,[agent]} but flows read
      .allowedDispositions as if global; precedence and dismiss injection are
      undefined.
    decision: "Canonical key is reviewPolicy.default with legacy
      reviewPolicy.allowedDispositions as a one-iteration read-alias. Single
      owner src/core/review-policy.ts resolveReviewAllowed(pipeline, agent,
      isTriager): precedence per-agent array > default > builtin
      [fix,optional,architect,human-awareness,human-async]; when isTriager is
      true append dismiss if absent; QA and other non-triagers never receive
      dismiss. Used by both prompt criteria and generateReviewSchema."
    id: adr-reviewpolicy-canonical
    title: Canonical reviewPolicy with triager injection
  - context: Hashing detail/severity duplicates on rewording; excluding them hides
      severity escalation on dismissed concerns.
    decision: "Stable id c-{sha1-10} over {kind, normalizedSummary, location,
      sortedAffects} excluding detail and severity. Normalization trims,
      collapses whitespace, lowercases summary. Re-emit merges: detail keeps
      longer/latest, severity keeps max, updatedAt and source.lastSeen advance,
      never changes dismissed/routed/resolved except via triage or close-up
      resolution. If re-emit severity exceeds stored severity, set
      source.escalated=true and surface the escalation in digest and architect
      hydration without reopening; architect may reopen via close-up
      resolution."
    id: adr-fingerprint-merge
    title: Fingerprint identity, merge, escalation surfacing
  - context: Close-up schemas are closed, wave-close-up has no reviewer, stored
      statuses have no pending, and simple items have no reviewer.
    decision: "Add concernResolutions?: [{id, action: resolve|carry|propagate,
      note?}] plus concerns[]/remarkable[] producer fields to wave/plan-closeup
      schemas and StoredConcern.pendingResolution?: {action,note,by,at}.
      Wave-close-up proposes via applyCloseupResolutions (status stays routed,
      pending set); architect-wave-report confirms via concernConfirms?: [{id,
      confirm: accept|reject, note?}] applying resolved/routed/propagated or
      clearing pending. Propagate targets parent concerns/ copy for epics or
      human digest for task-level unless elevated to blocking ADR. Simple-item
      fallback at wave-close-up: kind tech-debt auto-routes to disposition
      optional (debt), all other kinds to architect (carry); human-* is never
      auto-routed."
    id: adr-closeup-retriage
    title: Close-up pending resolution and simple fallback
  - context: Remarkable {chosen,alternatives,why} needs one authoritative store and
      the same triage vocabulary.
    decision: Authoritative store is concerns/rm-{hash10}.yaml with
      RemarkableDecision plus status and source. Triaged with suggestions[]
      dismiss vocabulary via exact-id match under the same partition and gate.
      Routed remarkables go digest-only unless elevated to a blocking ADR.
    id: adr-remarkable-store
    title: Remarkable decisions in rm- files
  - context: dispositions.md and ARCHITECTURE 8.7 define human-stop as
      tousertoreview plus exit-10 halt, but item-machine treats it fix-like
      running.
    decision: "Preserve exit-10 halt: human-stop writes a mailbox entry with blocks
      covering affected items plus task when task-level, item-machine maps it to
      blocked terminal, derive marks item and task blocked, and the engine halts
      with exit code 10 at the next mailbox check until answered or dismissed.
      Awareness with blocks:[] never enters blocked sets and never triggers exit
      10. Update dispositions.md and ARCHITECTURE 8.7 to keep the contract
      explicit."
    id: adr-human-stop
    title: Human-stop preserves exit-10 halt
  - context: Derive throws on corrupt triage/plan/steer/decisions while concerns/
      proposes skip; one bad concern could fail a whole step.
    decision: Corrupt concerns/*.yaml files are skipped with a warn and excluded
      from counts because concerns/ is an append-only cache rebuildable from
      committed step records; missing concerns/ yields zero counts. A single
      unknown-kind concern fails its step with no partial aggregate and no
      clobber of existing files, forcing prompt/schema drift to surface via
      retry rather than silent loss.
    id: adr-resilience
    title: Corrupt-skip versus strict-fail resilience
  - context: Spec says every agent output may carry concerns[], but not every schema
      has a producer and reviewer has a dual aggregate-plus-triage role.
    decision: "Producer matrix via a shared concern/remarkable partial: developer,
      fact-finder, qa, poc, test-assumptions, reviewer/plan-reviewer new
      concerns[], architect plan/revise, consult decisions, wave/plan-closeup,
      architect wave-report/closeup. Triage, infra, and pm-edit mechanical
      outputs are explicitly out of scope (no LLM synthesis). Consults aggregate
      via runItemConsult/runNonItemConsult writeArtifact. Reviewer ordering:
      aggregate new concerns first, then triage only pre-existing ids."
    id: adr-producer-matrix
    title: Producer matrix and reviewer ordering


--- Prior Plan plan-2.yaml ---
iteration: 2
milestones:
  - directionalInterfaces:
      - "step-runner/iteration ->
        triage.hydrateStepConcerns(taskDir,{stepRole,bytes,consumer}): callers
        compute bytes (step-runner item diff; iteration taskDiff/input), callee
        caps+renders; skip rule (caller-supplied wins); '' on zero-cap/empty
        (hydrateConcernsYaml deleted)"
      - aggregateConcerns -> mergeConcern(new id; affects-union incl terminal;
        escalated on rise) + legacy dual-lookup rename; KeyedMutex RMW + taskWt
        commitAll unchanged; journal on skip
      - buildArchitectHydration -> debt/steering WITHOUT concerns (UTF-8
        capped); architect turns consume concernsYaml (architect set incl
        escalated notes) as single source
      - prompts.render <- KNOWN_VARS (prompt-fragments extends producer
        fragments); terse 2-3-line sections; per-fragment +<=15, total +<=80,
        prompts.test asserts
    id: m1-hydration-prompts
    scenarios:
      - Given task-branch diff 5000 bytes and open concerns 3000 bytes When
        wave-close-up hydrates Then concernsYaml is <=2000 bytes and < task diff
        in UTF-8 bytes
      - Given zero-diff plan-review with 4000-byte input in iteration 2+ When
        hydrating Then concernsYaml is <=500 bytes and < input bytes
      - Given a dismissed concern re-emitted with higher severity When merge and
        hydration run Then status stays dismissed, source.escalated=true, a
        q-escalated-<cid> digest entry exists with blocks=[], and the escalation
        appears in architect concernsYaml
      - Given the same concern re-emitted with added affects When merge runs
        Then a single file holds union affects with no fork; a legacy old-hash
        file is rename-merged and the triage id stays stable
      - "Given each matrix fragment rendering When preflight and render run Then
        required sentinels appear (## Open Concerns + Raise concerns on all 19;
        ## Human involvement on review/qa/plan-review/architect-*/close-ups)
        with per-fragment added lines <=15 and total <=80"
      - Given zero-byte diff and input When hydrating Then concernsYaml renders
        '' with standing heading/instructions but zero id lines
      - Given an open rm-* remarkable When review and architect prompts hydrate
        Then concernsYaml includes it as {id, kind remarkable, summary chosen}
    title: Hydration, caps, fingerprint, prompts
  - directionalInterfaces:
      - "producers -> JSON schemas + artifacts.ts (concernConfirms,
        concernResolution, concerns/remarkable incl review remarkable, lowercase
        detail): schemas validate, TS mirrors, no runtime"
      - engine.runChildTask -> propagateEpicConcerns(childTaskDir =>
        parent.taskDir/concerns on parentWt, commit:false writes,
        KeyedMutex(parentWt) atomic record) + forward blocking questions to
        parent root mailbox; condensed per-epic ids, restart-idempotent merge
    id: m2-contracts-epic
    scenarios:
      - Given structured concerns/remarkable from developer (incl
        poc/test-assumptions/test-first/simple-implement/fix-round), fact-finder
        (incl research), qa, reviewer/plan-reviewer newConcerns+remarkable,
        plan/revise, decisions incl concernResolution, close-ups incl
        concernResolutions, and architect reports incl concernConfirms When
        validation and typecheck run Then all pass with matching TS types,
        lowercase detail persists, reviewer remarkable no longer fails
        additionalProperties, and triage/infra/pm-edit still reject concerns
      - Given a child epic finishing with one dismissed and one open concern
        with 800-byte detail When runChildTask completes Then the parent gains
        exactly one copy with id from [epic] summary, detail <=500 bytes and
        strictly shorter via char-safe half-cut, source.epic set, while
        dismissed stays local; a <=120-byte detail copies verbatim
      - Given a propagated epic concern When the saga architect hydrates Then
        concernsYaml contains the epic id and summary; a restart creates no
        duplicate; the child blocking question is forwarded as
        q-epic-<epic>-<orig> with mapped blocks; open copies alone cause no
        parent exit-10
    title: Contracts and epic propagation
  - directionalInterfaces:
      - "ingestStepConcerns -> triage.applyReviewTriage ->
        routeHumanDisposition(all triagers): q-concern-/q-escalated- writes via
        writeQuestion (blocks vs digest), dedup by existence; item-machine raw
        path skips ALL concern-id human-*"
      - ingest allowlist gate keyed on source.agent (post-validation
        skip+journal, step ok) + severity gates (digest>=minDigest,
        blocks>=minBlocking else downgrade; rm exempt); defaults medium/high =
        shipped
      - derive/task.collectRoutedBlockers(taskDir,minBlocking) severity-aware +
        call-site threading; close-up/architect/consult ingest -> pending ->
        confirms (accept resolve/carry/propagate | reject clear+preserve) +
        consult resolve->resolved with cross-emission guard; wave-close-up
        fallback over triage-less open
    id: m3-routing-lifecycle
    scenarios:
      - Given a routed high blocker whose affects names a declared dependent
        When derive and wave-act run Then the dependent derives blocked, exactly
        one decisions/concern-<cid>.yaml is written, and a restart writes no
        second file
      - Given a routed architect concern When the next architect-plan turn
        hydrates Then its concernsYaml input contains that concern id and
        summary
      - Given reviewer suggestion matching a concern id with disposition dismiss
        and detail When review commits Then that file has status dismissed plus
        dismissReason=detail, is kept, and causes no mailbox, debt, blocked, or
        approval effect
      - Given an rm-* remarkable triaged architect or dismissed When routing
        runs Then it becomes routed with disposition persisted or dismissed with
        reason; routed rm-* gains a digest entry with blocks=[] that never
        blocks or halts
      - Given a routed human-async concern When routing runs Then mailbox
        q-concern-<cid> blocks the item and the engine continues without exit
        10; given plan-reviewer human-stop Then a single q-concern-<cid> blocks
        task/item and the engine halts with exit 10
      - Given raiseAllowlist excluding qa When QA emits newConcerns Then no file
        is written, the skip is journaled, and the step stays ok; given
        minBlockingSeverity high and a low human-stop Then it is downgraded to
        digest with no blocks and no exit-10
      - Given a low blocker routed When derive runs Then the dependent is NOT
        blocked (severity-aware collectRoutedBlockers); the concern still
        appears in hydration and digest per minDigest
      - Given wave-close-up emitting concernResolutions for triaged ids When it
        commits Then pendingResolution is proposed with status unchanged;
        architect concernConfirms accept applies resolved/routed/propagated and
        reject clears pending preserving status with no disposition
      - Given a concern consult decision carrying concernResolution {id,
        resolve} When it commits Then the bound concern becomes resolved and the
        dependent unblocks on next derive; an item-consult decision carrying
        concernResolution is ignored with a journal note
      - Given a simple item with open concerns and no reviewer When
        wave-close-up runs Then explicit resolutions propose pending for those
        ids; fallback auto-routes only triage-less open tech-debt to optional
        (appearing in the derived debt list) and assumption/risk/question to
        architect; kind=blocker stays open and human-* dispositions are never
        assigned
      - Given pipeline.yaml humanInvolvement detailed When reviewer and
        architect prompts render Then the detailed criteria fragment is
        included; pipeline.default.yaml ships commented
        autonomous/principal/detailed presets with the fragment->agent mapping
    title: Human routing, severity, lifecycle
  - directionalInterfaces:
      - "docs-finish-v3 delivers: ARCHITECTURE §1 row18 + §8.11 +
        §5/§6.2/§8.7/§10/§11/§13, README section, pipeline commentary,
        human-involvement.md deviation note; prompts.test matrix + 15/80
        budgets; TMPDIR=/tmp gates green"
    id: m4-docs-gates
    scenarios:
      - Given implementation complete When grep runs Then ARCHITECTURE contains
        '8.11 Concerns' and 'immediate halt', §1 row 18 no longer contains
        'Deliberately not hand-built', README contains a concerns/modes section,
        and config commentary matches landed severity/router semantics
      - Given prompt fragments When prompts.test runs Then the KNOWN_VARS matrix
        and 15-per-fragment/80-total budgets pass
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    title: Docs and gates
itemOutlines:
  - deps: []
    description: "Own concerns.ts + triage.ts hydration + step-runner injection +
      iteration hydration bytes. hydrateStepConcerns + listHydratedConcerns per
      adr-hydration-single-cap (stepRole table, caller-computed bytes, skip
      rule, '' semantics, injectable gitFn) + adr-hydrated-sets. Delete
      hydrateConcernsYaml; buildArchitectHydration drops concerns, UTF-8 capped.
      Fingerprint kind+summary+location, affects-union incl terminal, legacy
      dual-lookup rename. Regression tests: iter2+ plan-review <=500B,
      open+pending visibility, 0/1/3-byte caps -> ''. Behavior tests only.
      Verify typecheck + TMPDIR=/tmp bun test."
    kind: story
    milestoneId: m1-hydration-prompts
    prodBudgetHint: 250
    slug: hydration-fingerprint-caps
    title: Unified hydration, caps, fingerprint
  - deps: []
    description: "Schemas + TS only, no ingest/apply. artifacts.ts: DeveloperOutput
      concerns Concern[], ReviewArtifact newConcerns + remarkable,
      FactFinder/WaveCloseup/PlanCloseup/Decision concerns/remarkable,
      ConcernConfirms + ConcernResolution types. review-schema.ts +
      review.schema.json: remarkable. Wave-report output + plan-closeup schemas:
      concernConfirms. decisions.schema + DecisionArtifact: concernResolution.
      Normalize ALL concern Detail->lowercase detail across schemas
      (developer-output capital-D bug) + regression test that lowercase detail
      validates and persists. triage/infra/pm-edit untouched. Verify typecheck +
      preflight."
    kind: story
    milestoneId: m2-contracts-epic
    prodBudgetHint: 140
    slug: contracts-drift-fix
    title: Producer type and schema drift
  - deps: []
    description: "Own prompt-vars.ts + fragments + matrix test. KNOWN_VARS:
      concernsYaml for
      develop/test-first/simple-implement/fix-round/poc/test-assumptions/resear\
      ch (+short forms); HI only where registered. Per-fragment delta per
      adr-prompt-fragment-matrix (producers OC+raise;
      triagers/architects/close-ups/qa +HI+condense). Per-fragment +<=15 lines,
      total +<=80; prompts.test per-fragment sentinels + budgets; update
      human-involvement-config.test.ts non-consumer assertion (develop leaves,
      triage/infra stay) + FRAGMENT_MATRIX. Behavior tests: sections render;
      mode switch changes criteria. Verify preflight + typecheck."
    kind: story
    milestoneId: m1-hydration-prompts
    prodBudgetHint: 120
    slug: prompt-fragments
    title: Fragment matrix and raise instructions
  - deps:
      - hydration-fingerprint-caps
    description: "Single routeHumanDisposition in triage for all triagers
      (async/stop/awareness + routed rm-* + dismissed-escalated digest;
      q-concern-/q-escalated-; dedup by existence); item-machine raw path skips
      ALL concern-id human-*. Severity: agent-keyed allowlist skip+journal (step
      ok); minDigest/minBlocking gates + downgrade (stop loses exit-10); rm
      exempt; defaults medium/high; commentary documents fragment->agent mapping
      (no allowlist entries added). Own derive: severity-aware
      collectRoutedBlockers(taskDir,minBlocking) + call-site threading (fallback
      high). Explicit fixture severities keep suite green. Behavior tests:
      plan/close-up routing, rm digest, skip+journal+ok, downgrade + derive
      unblocked, no double-write, exit-10 only blocking stop."
    escalate: true
    kind: story
    milestoneId: m3-routing-lifecycle
    prodBudgetHint: 280
    slug: human-router-severity
    title: Human router and severity policy
  - deps:
      - hydration-fingerprint-caps
    description: "engine.runChildTask -> propagateEpicConcerns per
      adr-epic-push-condensed (c-* + rm-* condensed push, commit:false writes,
      KeyedMutex(parentWt) atomic record, restart-idempotent merge preserving
      parent triage; forward blocking questions with blocks mapping).
      Spike-saga-commit/Decision 002 authoritative. Behavior tests: one
      condensed copy (incl rm-*), dismissed local, tiny-detail verbatim, saga
      input contains id, restart no dup, forwarded q-epic-* with mapped blocks,
      no parent halt from copies."
    escalate: true
    kind: story
    milestoneId: m2-contracts-epic
    prodBudgetHint: 190
    slug: epic-saga-propagate
    title: Epic to saga propagation
  - deps:
      - contracts-drift-fix
      - epic-saga-propagate
      - human-router-severity
    description: "Ingest + apply (schemas owned by contracts-drift-fix).
      ingestStepConcerns reads concernConfirms + concernResolution; consults.ts
      passthrough; cross-emission guard (honor only concern consults +
      closeup/architect contexts, else ignore+journal); ordering (consult apply
      at decision commit, confirms at architect ingest). Resolutions->pending;
      confirms accept (resolve/carry/propagate via epic helper) / reject (clear,
      preserve, no disposition). Wave-close-up fallback over triage-less open
      per ADR (blocker stays open; tech-debt->optional in derived debt;
      others->architect; never human-*). Behavior tests: pending/confirm matrix,
      reject preserves open, consult unblock by id, guard ignores item-consult
      resolution, fallback + debt, resolved reachable."
    escalate: true
    kind: story
    milestoneId: m3-routing-lifecycle
    prodBudgetHint: 240
    slug: closeup-lifecycle-resolve
    title: Close-up lifecycle and unblock
  - deps:
      - closeup-lifecycle-resolve
      - contracts-drift-fix
      - epic-saga-propagate
      - human-router-severity
      - hydration-fingerprint-caps
      - prompt-fragments
    description: "Deliverables: ARCHITECTURE §1 row 18 (drop 'Deliberately not
      hand-built') + new §8.11 + §5/§6.2/§8.7/§10/§11/§13, README
      concerns/modes, pipeline commentary sync, human-involvement.md + §8.11
      immediate-halt deviation note; prompts.test matrix + 15/80 budgets;
      consolidated coverage. Grep-asserted: '8.11 Concerns', 'immediate halt',
      README 'concerns', row-18 replacement. Final gates: bun run typecheck +
      TMPDIR=/tmp bun test green."
    kind: story
    milestoneId: m4-docs-gates
    prodBudgetHint: 100
    slug: docs-finish-v3
    title: Docs and suite consolidation
assumptions:
  - assumption: Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures
      do not mask regressions.
    why: Baseline red only under .factory-runtime TMPDIR; suite green with
      TMPDIR=/tmp. Hydration git uses explicit taskWt cwd, not worktree
      inference, so it is unaffected; tests still run TMPDIR=/tmp.
  - assumption: Spike findings spike-text-budget (byte caps) and spike-saga-commit
      (serialization/derive/commit/propagation, Decision 002 directives) remain
      authoritative; no re-run.
    why: Both accepted in iteration 1 with binding downstream directives;
      iteration-2 items implement them.
  - assumption: Dismissed/routed/resolved stay terminal-in-merge (status preserved;
      content merges + escalated flag); escalated-severity-on-dismissed surfaces
      in digest + architect hydration; triage is the only reopen path.
    why: Operator directive 1794112659180 decided keep + digest surfacing.
  - assumption: funnel-closeups-v3 unmerged branch is discarded; its retry guidance
      substance (step-role cap classification, pending visibility for
      open+routed, reject-preserves-status, zero-cap '') is captured in
      adr-hydration-single-cap and adr-closeup-lifecycle-resolved, which items
      implement.
    why: Iteration 1 closed with v3 running/unmerged; ADRs carry the normative
      substance so items need no branch reference.
  - assumption: Effective severity defaults are shipped medium/high (code fallback
      identical); tasks opt out via pipeline.yaml null/deletion.
    why: Aligns code with shipped pipeline.default.yaml; items keep suite green with
      explicit fixture severities.
  - assumption: Autonomous immediate-halt deviation accepted now; operator notified
      via open awareness item awareness-plan-2-autonomous-halt-deviation.
    disposition: human-awareness
    why: High-impact tradeoff visible in plan; architect decides, operator informed,
      docs mark it explicitly.
techDebt:
  - category: adjacent
    description: "Pre-existing head-guard failures when TMPDIR sits under
      .factory-runtime: inferTaskWorktree matches a folder-boundary tail yet 2
      failures persist via a different path. Baseline red; green with
      TMPDIR=/tmp. Out of scope. Hydration git uses explicit taskWt cwd (not
      worktree inference), so the new taskDiff path is unaffected."
    id: td-tmpdir-split
  - category: adjacent
    description: Unapplied spike-saga-commit reviewer optional nits (qualify
      epic-state-from-child-closeup with isMerged precedence, prefix inline
      paths, scope removeWorktree claim, fold contextPack key). Consumers apply
      mentally.
    id: td-spike-nits
adrs:
  - context: Two hydration helpers diverge; plan-review overrides terse value;
      buildArchitectHydration caps JS length and double-embeds concerns; byte
      sources, git seam, '' semantics, and step-runner/iteration double-compute
      undefined.
    decision: "triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,\
      taskDiffBytes?,consumer}) — callers compute bytes, callee caps+renders.
      stepRole table: review|qa -> min(diffBytes,2000), diffBytes=UTF-8 of
      promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000),
      taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via
      production git() with injectable gitFn;
      plan-review|architect-*|develop-family -> min(inputBytes,500),
      inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except
      concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule:
      step-runner computes only when caller promptVars lack concernsYaml
      (iteration-supplied wins, no race). '' when cap=0 or hydrated set empty;
      renderConcernsYaml '' when serialize([]) exceeds cap; standing headings
      remain, assertions count id lines. hydrateConcernsYaml deleted.
      buildArchitectHydration drops concerns section (UTF-8 capped); architect
      turns consume concernsYaml only."
    id: adr-hydration-single-cap
    title: Single hydration module with step-role byte caps
  - context: Predicates diverge (step-runner open-only, architect open+routed,
      hydrate open c-+rm-); terseConcern drops pendingResolution;
      dismissed+escalated and rm-* visibility undefined; RemarkableDecision has
      no severity.
    decision: "triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and
      plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open
      rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated
      notes. Terse shape + pendingResolution whenever present + rm-* as
      {id,kind:remarkable,summary:chosen}. countConcerns stays c-* only. rm-*
      exempt from severity gates, always digest-eligible when routed."
    id: adr-hydrated-sets
    title: Per-consumer hydration sets with rm rules
  - context: Fingerprint includes sorted affects so added refs fork files; stored
      files keyed by old hash; mergeConcern replaces affects; terminal
      content-merge vs terminal-in-merge ambiguous.
    decision: "Identity kind+normalized summary+location; affects merged as
      sorted-union INCLUDING on terminal statuses (status preserved,
      detail/severity/affects/escalated still merge; triage is the only reopen
      path). Migration: aggregate dual-lookup — compute new id; if file missing,
      scan store for legacy file with same kind+norm summary+location (any
      affects) and rename-merge into new id with union affects. No GC pass.
      Refines adr-fingerprint-merge."
    id: adr-fingerprint-affects-union
    title: Fingerprint identity without affects, union merge
  - context: Only review/plan-review consume hydration; KNOWN_VARS steps/develop
      lacks both vars; poc/test-assumptions/research produce concerns but are
      absent from matrix; test asserts develop lacks vars; budgets unclear.
    decision: "prompt-fragments owns prompt-vars.ts + fragments + test update.
      KNOWN_VARS gains concernsYaml on
      steps/develop,develop,steps/test-first,test-first,steps/simple-implement,\
      simple-implement,steps/fix-round,fix-round,steps/poc,poc,steps/test-assum\
      ptions,test-assumptions,steps/research,research (+humanInvolvementCriteria
      only where already registered). Sections: producers
      (develop-family+poc/test-assumptions/research) get 3-line ## Open Concerns
      {{concernsYaml}} + 1-line raise (no HI: they raise, never triage);
      triagers/architects/close-ups/qa get HI section + condense rule appended.
      Delta: architect-plan/revise add OC+raise; review adds HI+condense;
      plan-review adds raise+condense; rest add per above. Budgets: added lines
      per fragment <=15, total <=80 (2-3-line section convention); prompts.test
      asserts per-fragment sentinels (## Open Concerns, ## Human involvement,
      Raise concerns) + budgets; human-involvement-config.test.ts non-consumer
      assertion updated (develop leaves, triage/infra stay)."
    id: adr-prompt-fragment-matrix
    title: Full fragment matrix with raise instructions
  - context: Severity config never read; shipped medium/high + 8-agent allowlist;
      poc/test-assumptions run as agent developer (fragment-gated entries would
      be dead); gate order vs validation undefined.
    decision: "Gate key is source.agent (never fragment): developer covers
      develop/poc/test-assumptions/test-first/simple-implement/fix-round,
      fact-finder covers research, architect covers architect-*; shipped 8-agent
      allowlist is already the complete producer matrix — no entries added,
      commentary documents fragment->agent mapping. Effective defaults = shipped
      medium/high (code fallback identical). Order: schema validation first
      (triage/infra/pm-edit schema-reject), then ingest allowlist skip+journal
      with step ok. Digest iff severity>=minDigest; blocks iff
      severity>=minBlocking else downgrade to digest (stop loses exit-10). rm-*
      exempt."
    id: adr-severity-policy-active
    title: Active severity and allowlist policy
  - context: applyReviewTriage writes only human-async; awareness/stop rely on
      item-machine raw suggestions so plan/close-up/architect dispositions never
      reach mailbox; rm-* has no digest; item-machine double-writes;
      collectRoutedBlockers blocks severity-blind so downgrade is ineffective.
    decision: "Single routeHumanDisposition in triage for all triagers at ingest:
      human-async q-concern-<cid> blocks=[item]|[task]; human-stop blocks
      item+task + exit-10; human-awareness, routed rm-*, dismissed+escalated ->
      digest via writeQuestion human-awareness blocks=[]
      (q-concern-/q-escalated-), never blocking/halting. Dedup by existence.
      item-machine raw path skips ALL concern-id human-*. human-router-severity
      also owns derive: collectRoutedBlockers(taskDir,minBlocking) blocks only
      kind=blocker+routed+severity>=minBlocking;
      deriveTaskState/withRoutedBlocking thread
      pipeline.concerns.minBlockingSeverity (fallback high). Debt predicate
      unchanged."
    id: adr-human-router-single
    title: Single human-disposition router with severity-aware derive
  - context: applyCloseupResolutions records pending with no applier; resolved
      unreachable; consult decisions never transition concerns;
      concernConfirms/consult-resolution need schema+TS+ingest+apply owners;
      consults.ts drops unknown fields; fallback scope/terminology wrong
      (blocker auto-block, human-* vacuous).
    decision: "contracts-drift-fix owns schema+TS: concernConfirms?:
      [{id,confirm:accept|reject,note?}] in architect wave-report output +
      plan-closeup schema; decisions.schema + DecisionArtifact gain
      concernResolution?: {id, action: resolve|carry}; all concern Detail
      normalized to lowercase detail. closeup-lifecycle-resolve owns ingest
      (ingestStepConcerns reads both), consults.ts concernResolution
      passthrough, and apply: accept+resolve->resolved,
      accept+carry->routed+architect, accept+propagate->parent copy/digest via
      epic helper; reject clears pending, preserves status, no disposition.
      Consult act phase applies resolve->resolved at decision commit (unblocks
      next derive); honored only on concern consults + closeup/architect
      contexts, ignored+journaled elsewhere. Wave-close-up fallback over
      triage-less open (open, no pendingResolution, no disposition):
      tech-debt->optional (derived debt), assumption|risk|question->architect;
      kind=blocker stays open for explicit triage; fallback never assigns
      human-* dispositions."
    id: adr-closeup-lifecycle-resolved
    title: Close-up propose/confirm lifecycle with unblock
  - context: runChildTask writes only child-closeup + single commit; child concerns/
      isolated; spike-saga-commit/Decision 002 mandate push+forward; rm-*,
      commit ownership, parallel-epic races, forward mapping, back-sync, and
      truncation edge cases unspecified.
    decision: "engine.runChildTask calls
      propagateEpicConcerns({childTaskDir,parentTaskDir,parentWt,epic}) after
      runIteration before child-closeup write, every status: push open+routed
      (skip dismissed); c-* copies get summary [epic] <child summary>,
      id=recomputed fingerprint, status open, source {epic, record
      epic:<epic>/<child-record>}; child rm-* propagate as parent rm-* with
      chosen prefixed [epic], id recomputed, why condensed. Condense UTF-8
      char-safe: detail<=120B verbatim (tiny exemption); else cut to min(500B,
      half) on char boundary (strictly shorter guaranteed). Writes use aggregate
      opts {commit:false}; parent-side propagate+closeup+add+commit serialized
      under KeyedMutex(parentWt) (never repo.writeLock) so parallel epics cannot
      race; existing single commit covers copies+closeup. Forward
      childTaskDir/steer/tousertoreview entries with blocks.length>0 to
      parent.taskDir/steer/tousertoreview as q-epic-<epic>-<orig>, blocks mapped
      (child item slugs->epic; child-task-level->parent task slug; default
      [epic]). No back-sync: child run is complete; forwarded entries are
      parent-owned. Copies open/unrouted -> no parent halt; halt only via
      forwarded questions."
    id: adr-epic-push-condensed
    title: Epic push with condensed parent copies
  - context: Mode table says autonomous defers blocking until unblocked work drains,
      but implementation routes blocking ADRs at plan time and halts
      immediately; deferral needs drain scheduling.
    decision: Keep immediate halt as accepted deviation for iteration 2 (simpler,
      preserves exit-10 contract, matches tested behavior). Operator awareness
      item awareness-plan-2-autonomous-halt-deviation already open (filed at
      plan review); docs-finish-v3 marks the deviation explicitly in
      ARCHITECTURE 8.11 and human-involvement.md; drain-then-block scheduling is
      future work.
    id: adr-autonomous-immediate-halt
    title: Autonomous immediate halt accepted


--- Prior Plan plan-3.yaml ---
iteration: 3
milestones:
  - id: m1-contracts-consistency
    title: Contracts consistency
    scenarios:
      - Given the 6 runtime file schemas (decisions, developer-output,
        fact-finder-output, plan, plan-closeup incl architect-closeup,
        wave-closeup) plus reference review schema When
        test/contracts/concern-schemas.test.ts runs Then lowercase detail
        validates and capital-D Detail is rejected
      - Given a stored concern with 200-byte detail re-emitted with 20-byte
        detail When aggregateConcerns merges Then the stored 200-byte detail
        survives
      - Given composed resolveReviewAllowed(p,a,isTriagerAgent(a)) for
        wave-close-up/plan-close-up When resolved Then the allowed set excludes
        dismiss and the triager set equals {reviewer,plan-reviewer}
      - Given a pending dismiss proposal with note plus architect accept When
        ingest runs Then the concern becomes dismissed with dismissReason equal
        to the trimmed note, disposition dismiss, and pending cleared
      - Given a pending dismiss proposal without note plus architect accept When
        ingest runs Then the step errors with TriageValidationError and status
        plus pending are preserved with no partial transitions
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass with no regressions
    directionalInterfaces:
      - "step-runner (caller) validates producer outputs against the 6 runtime
        file schemas (callee contract: decisions, developer-output,
        fact-finder-output, plan, plan-closeup shared by architect-closeup,
        wave-closeup): lowercase detail accepted, capital-D Detail rejected with
        step error before any store write; aggregateConcerns/mergeConcern read
        lowercase detail with longest-wins"
      - "prompts/step-runner/item-machine (callers) consume composed
        resolveReviewAllowed(p,a,isTriagerAgent(a)) (callee): triager set
        {reviewer,plan-reviewer} get dismiss; wave-close-up/plan-close-up return
        false so dismiss excluded; close-up schemas carry no suggestions[] so
        re-triage honored solely via concernResolutions + architect
        concernConfirms + wave fallback"
      - "ingestStepConcerns (caller) pre-flights then calls applyConcernConfirms
        (callee, never throws TriageValidationError): every accept on pending
        dismiss requires non-empty pending.note else TriageValidationError
        before any mutate (all statuses+pendings preserved); accept+dismiss ->
        dismissed + disposition dismiss + dismissReason=pending.note trimmed +
        pending cleared; fallback never assigns dismiss, kind=blocker stays
        open"
  - id: m2-docs-gates
    title: Docs and gates
    scenarios:
      - Given ARCHITECTURE §1 row 18 When read Then it records item 18
        implemented with the epic-config, close-up-dismiss, saga-semantics, and
        immediate-halt deviations and no 'Deliberately not hand-built'
      - Given ARCHITECTURE §8.11 When read Then it documents store layout,
        fingerprint/dedup, remarkable aggregation/triage, triage contract,
        routing table, close-up propose-confirm incl dismiss, epic condensing,
        ADR blocking table, presets, and the 4 deviations
      - Given dispositions.md and rendered prompts When checked Then a terse
        dismiss row (reason required, kept) exists, the QA prompt excludes it
        while the reviewer prompt includes it, and prompts.test debloat budgets
        pass
      - Given README, pipeline.default.yaml, and human-involvement.md When read
        Then README shows per-task principal (low/medium) and detailed (low/low)
        examples plus status counts/digest output, commentary documents the
        fragment->agent mapping (developer covers
        develop/poc/test-assumptions/test-first/simple-implement/fix-round;
        fact-finder covers research; architect covers architect-*) with
        medium/high defaults, and the immediate-halt deviation is noted
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    directionalInterfaces:
      - "item-machine/iteration (callers) -> formatDispositionsSection(criteria,
        allowed) (callee): when allowed excludes dismiss, dismiss rows/rules are
        filtered from criteria text (QA prompt); when allowed includes dismiss,
        rows are kept (reviewer prompt); mirrors existing human-stop filtering"
itemOutlines:
  - slug: schema-detail-normalize
    kind: story
    title: Lowercase detail in producer schemas + merge fix
    description: "Normalize concern Detail->lowercase detail in 6 runtime file
      schemas (decisions, developer-output, fact-finder-output, plan,
      plan-closeup shared by architect-closeup, wave-closeup) + reference-only
      review.schema.json for consistency. One-line TS fix concerns.ts:72
      (existing?.Detail -> existing?.detail). Fix 3 test reads
      epic-saga-propagate.test.ts:307/313/319 to .detail. Tests: contract suites
      (lowercase passes, capital-D rejected) + longest-wins behavior test
      (200-byte stored survives 20-byte re-emit). triage/infra/pm-edit
      untouched. Verify typecheck + TMPDIR=/tmp bun test."
    milestoneId: m1-contracts-consistency
    deps: []
    prodBudgetHint: 25
  - slug: closeup-triager-cleanup
    kind: story
    title: Close-up triager cleanup + dismiss resolutions
    description: "Per adr-closeup-no-suggestions-triage: drop
      wave-close-up/plan-close-up from isTriagerAgent; add dismiss to
      CloseupConcernResolution/PendingConcernResolution (artifacts.ts) + local
      ConcernResolution (concerns.ts:16) + wave/plan-closeup schema action
      enums; ingestStepConcerns pre-flights accept-on-dismiss (non-empty
      pending.note else TriageValidationError, no writes); applyConcernConfirms
      accept+dismiss -> dismissed + disposition dismiss +
      dismissReason=pending.note trimmed + pending cleared; fallback unchanged.
      Tests: review-policy composed triager-set exclusion, closeup-lifecycle
      dismiss accept/error cases, closeup dismiss enum contract case. Verify
      typecheck + targeted suites + full gates."
    milestoneId: m1-contracts-consistency
    deps: []
    prodBudgetHint: 70
  - slug: docs-finish-v4
    kind: story
    title: Docs and suite consolidation
    description: "Docs closure over final landed behavior (source: context-pack §6
      Q1 deltas + Q2/Q3/Q7/Q9 deviations). ARCHITECTURE: §1 row18 implemented +
      4 deviations; §3 add concerns/triage/review-policy/adrs/epic-propagation
      modules; §5 config sample + fix line-117 inheritance claim to root-only;
      §6.2 add concerns/, decisions/concern-<id>.yaml, adrFolder; §8.7 dismiss +
      exact-id triage + thresholds + router; new §8.11 (store,
      fingerprint/dedup, remarkable aggregation/triage, triage contract, routing
      table, close-up propose-confirm incl dismiss, epic condensing, ADR table,
      presets); §10 outputs + fix close-up review claim; §13 18 suites;
      canonical ADR format vs historical notes. README Concerns section
      (principal low/medium, detailed low/low, status output). dispositions.md
      terse dismiss row. prompts.ts dismiss-row filter (mirror human-stop) +
      QA-excludes/reviewer-includes test + prompts.test debloat budgets (terse
      row; bump only if measured over). human-involvement.md + §8.11 halt note.
      pipeline commentary mapping + medium/high. Final gates green."
    milestoneId: m2-docs-gates
    deps:
      - closeup-triager-cleanup
      - schema-detail-normalize
    prodBudgetHint: 115
assumptions:
  - assumption: "Baseline is RED (not green): typecheck fails on concerns.ts:72
      capital-D read, test/contracts/concern-schemas.test.ts fails asserting
      lowercase detail against capital-D schemas, and
      test/engine/epic-saga-propagate.test.ts:307/313/319 read .Detail
      (undefined at runtime). Gates go green only after m1 lands. TMPDIR=/tmp is
      still required for the 2 pre-existing head-guard failures."
    why: Reviewer-verified red on 3 fronts; plan targets red-to-green closure in
      this iteration.
  - assumption: "Store/triage/routing/funnel/propagation behavior is frozen except
      the three scoped fixes: concerns.ts:72 lowercase read, close-up
      dismiss-via-resolutions with ingest pre-flight, and prompts.ts dismiss-row
      filtering."
    why: 18 behavior/contract suites cover the implementation; bounding iteration 3
      to the reviewed gaps avoids regressions.
  - assumption: Autonomous immediate-halt deviation stands as accepted; operator
      already notified via awareness-plan-2-autonomous-halt-deviation.
    why: Decided in iteration 2 planning; iteration 3 only documents it.
  - assumption: Epic config root-only deviation accepted as document-only; operator
      notified via open awareness item awareness-plan-3-epic-config-awareness.
    why: Operators setting mode once at root would otherwise be surprised; architect
      decides, operator informed.
    disposition: human-awareness
techDebt:
  - id: td-tmpdir-split
    description: Pre-existing head-guard failures when TMPDIR sits under
      .factory-runtime. Baseline red; green with TMPDIR=/tmp. Out of scope.
    category: adjacent
  - id: td-spike-nits
    description: Unapplied spike-saga-commit reviewer optional nits (qualify
      epic-state precedence, prefix inline paths, scope removeWorktree claim,
      fold contextPack key). Consumers apply mentally.
    category: adjacent
  - id: td-detail-casing
    description: Capital-D Detail in 6 runtime-bound file schemas rejects lowercase
      detail (review.schema.json reference-only, normalized for consistency);
      mergeConcern reads existing?.Detail so longest-wins never applies and
      typecheck fails; 3 epic-saga-propagate test reads use .Detail.
    category: impacting
    resolution: "Fix in schema-detail-normalize: normalize schemas + concerns.ts:72
      + 3 test reads; contract and longest-wins tests verify."
  - id: td-closeup-triager-dead
    description: wave/plan-close-up listed as triagers though close-up schemas
      reject suggestions[], advertising an unreachable dismiss path; close-up
      re-triage has no dismiss vocabulary.
    category: impacting
    resolution: "Fix in closeup-triager-cleanup: drop close-ups from isTriagerAgent,
      add dismiss to resolutions with ingest pre-flight and accept semantics."
adrs:
  - id: adr-epic-config-root-only
    title: Epic config inheritance documented as deviation
    context: ARCHITECTURE §5 claims epics inherit the parent task layer, but
      runTaskChild loads only the child task dir pipeline.yaml, so
      humanInvolvement/concerns/reviewPolicy set at root do not apply inside
      epics. Implementing parent-layer inheritance would change config loading
      semantics for all tasks, beyond item-18 closure scope.
    decision: "Document the deviation: per-task selectability holds per task
      directory (each epic child has its own pipeline.yaml), but epic children
      do not inherit the parent task layer. Record in the §1 row 18 rewrite and
      §5; no behavior change. Operator notified via open awareness item
      awareness-plan-3-epic-config-awareness."
  - id: adr-closeup-no-suggestions-triage
    title: Close-ups removed from triager set; dismiss via resolutions
    context: isTriagerAgent returns true for wave/plan-close-up and ingest would
      triage their suggestions[], but both close-up schemas set
      additionalProperties:false without a suggestions field, so the path is
      unreachable; real re-triage flows through concernResolutions + architect
      concernConfirms + wave fallback. Removing close-ups from the triager set
      would leave close-up re-triage with no dismiss path (resolutions allow
      only resolve/carry/propagate).
    decision: "Drop wave-close-up/plan-close-up from isTriagerAgent AND add dismiss
      to the close-up path: CloseupConcernResolution + PendingConcernResolution
      (artifacts.ts) + local ConcernResolution (concerns.ts:16) +
      wave/plan-closeup schema action enums gain dismiss. ingestStepConcerns
      pre-flights: before any mutate, every accept confirm whose
      pending.action==dismiss must have non-empty pending.note else it throws
      TriageValidationError (step errors; all statuses+pendings preserved, no
      partial transitions); applyConcernConfirms itself never throws
      TriageValidationError (avoids concerns<->triage cycle and in-mutate
      partial writes). accept+dismiss -> dismissed + disposition dismiss +
      dismissReason=pending.note trimmed + pending cleared. Wave fallback never
      assigns dismiss and leaves kind=blocker open."
  - id: adr-saga-funnel-semantics
    title: Propagated copies open-only; questions block
    context: Propagated epic copies preserve child affects slugs while parent
      collectRoutedBlockers matches parent item slugs, so copies can never
      derived-block the parent; copies stay open by design and only forwarded
      q-epic questions block (module header + epic-saga-propagate tests assert
      this intent).
    decision: "Document as the intended funnel semantic in §1 row 18 and §8.11: the
      saga architect resolves/steers propagated copies; epic-level blocking
      reaches the parent only via forwarded questions. No behavior change."
  - id: adr-autonomous-immediate-halt
    title: Autonomous immediate halt accepted (restated)
    context: Spec line 100 says autonomous blocks only for the portion still blocked
      after everything unblocked is done, but iteration.ts halts immediately at
      plan time on a blocking ADR. Prior ADR
      docs/adr/adr-autonomous-immediate-halt.md records this as accepted with
      operator awareness item awareness-plan-2-autonomous-halt-deviation.
    decision: "Restate and keep the accepted deviation for closure: immediate halt
      stands; drain-then-block scheduling stays future work. docs-finish-v4
      marks it explicitly in ARCHITECTURE §8.11 and
      agents/criteria/human-involvement.md."


--- Prior Close-up closeup-1.yaml ---
iteration: 1
status: next-iteration
summary: "Iteration 1 delivered M3 routing fully (pure derive + exactly-once
  consult + hydration + human/ADR/debt) plus M1 store/contracts and M2 triage
  cores, all green. Audit verified remaining gaps hold: M1 escalation surfacing
  + stale TS types; M2 fragment wiring partial (steps/review lacks
  humanInvolvementCriteria; architect reports/consults and close-ups lack
  concernsYaml/criteria); M4 funnel caps/confirms/fallback/saga propagation
  missing (only counts/status); M5 docs untouched — verified ARCHITECTURE §1 row
  18 still 'Deliberately not hand-built'. Tail unmergeable this iteration
  (amendments 3/3, funnel-closeups-v3 running, saga/docs pending on stale deps).
  Proceed to iteration 2 with the audited remainder."


--- Prior Close-up closeup-2.yaml ---
iteration: 2
status: next-iteration
summary: "Iteration 2 delivered m1 (unified step-role hydration, fingerprint
  union+legacy migration, 19-fragment matrix) and m3 (single human router,
  severity-aware derive, close-up propose/confirm lifecycle, consult unblock,
  fallback) with behavior tests, all merged. Audit findings verified and hold:
  m2 fails on the capital-D Detail drift — confirmed
  developer-output.schema.json:68 still declares \"Detail\" with
  additionalProperties:false, so lowercase detail is rejected and the contract
  suite must be red with runtime validation broken for file-schema producers
  (epic propagation itself is done). m4 untouched — confirmed ARCHITECTURE §1
  row 18 still reads 'Deliberately not hand-built' with docs-finish-v3 still
  running. Next iteration: normalize Detail->detail across the 7 schema files
  (small fix) and complete docs-finish-v3 (ARCH §8.11/row 18, README, commentary
  with fragment->agent mapping and immediate-halt deviation) with green
  TMPDIR=/tmp gates."


--- Prior Close-up closeup-3.yaml ---
iteration: 3
status: next-iteration
summary: "Iteration 3 partially delivered: close-up triager/dismiss path
  verified (m1 scenarios 3-5 pass; triager set, pre-flight, trimmed-note dismiss
  all behavior-tested), but schema-detail normalization never merged
  (schema-detail-normalize still running) and docs-finish-v4 never started.
  Verified on live tree: all producer schemas still declare capital-D Detail
  (e.g. developer-output.schema.json:68, plan-closeup.schema.json:34) so
  lowercase-detail contracts must fail; concerns.ts:72 reads existing?.Detail
  (undefined; longest-wins dead); epic-saga-propagate.test.ts:307/313/319 still
  read .Detail; ARCHITECTURE.md:39 still 'Deliberately not hand-built' with no
  §8.11; dispositions.md has no dismiss row; README has no Concerns section.
  Gates cannot be green. Iteration 4: land Detail->detail normalization (schemas
  + merge + test reads + longest-wins test) then complete docs-finish-v4 over
  final behavior; merged closeup-triager-cleanup carries forward as-is."


--- Steering Directive/Answer (1794112659180.md) ---
Operator acknowledges both plan-1 awareness items: (1) digest mailbox reuse — confirmed that digest/awareness dispositions must stay low-noise and non-blocking; status/derive/classify filtering keeps them out of the blocking set (verify in the funnel implementation; flag if any code path treats an empty-blocks awareness item as blocking). (2) merge escalation hidden — decision: keep dismissed/routed/resolved as terminal-in-merge, and surface escalated-severity-on-dismissed concerns in the digest (keep + digest surfacing). Triage remains the only path to reopen. No further action on these two.


--- Steering Directive/Answer (1794158471471.md) ---
Answer to escalation-funnel-closeups-v3-develop-a1: RETRY the develop step by resuming its session (01a1bc09 — the work is productive, not stuck: 49 reads were targeted verification, tests were written and a bun test run was 2s from output when the 20m active timeout fired). Guidance for the resumed turn: skip re-exploration, finish the funnel-closeups test run, fix only red failures, then yield. If it times out again, split the remaining verification into a smaller follow-up rather than a third full turn.


--- Decision 001-item-concerns-contracts.yaml ---
id: decision-concerns-contracts-1794104526635
context: item
item: concerns-contracts
afterRecord: 006-develop-a2
decision: split
timestamp: 2026-11-08T02:22:06.635Z
rationale: "Root cause is oversize + scope conflation, not logic: one item
  bundled types + ~12 schemas + new resolver + 3 call-site wirings + runtime
  repair, exceeding the 300-line story budget; 3 develop attempts produced an
  empty diff (scope paralysis). Repair/defaulting and dismiss-detail enforcement
  are runtime owned by concerns-store, but the assignment text pulled them into
  contracts, creating an unimplementable contract. Split into 3 sequenced
  stories (types -> schemas+policy parallel) each with a falsifiable budget and
  test."
text: "Engine: replace concerns-contracts with the 3 outlines; rewire downstream
  concerns-store/modes-prompts deps from concerns-contracts to all 3 children.
  Developers: do not implement aggregate/repair/triage runtime in these items;
  schemas declare optionality only. Do not use cross-file $ref in JSON schemas
  (inline the concern/remarkable partial). Keep each diff within its stated
  budget."
outlines:
  - deps: []
    description: "Types only. In src/core/artifacts.ts add
      Concern/ConcernKind/ConcernSeverity/ConcernStatus, RemarkableDecision,
      StoredConcernArtifact (+pendingResolution?, source.escalated?),
      ReviewDisposition+dismiss (no tech-debt value), PlanAdr.blocking,
      PipelineConfig.humanInvolvement +
      concerns{raiseAllowlist,minDigestSeverity,minBlockingSeverity},
      reviewPolicy.default canonical + legacy allowedDispositions alias in type.
      No JSON, no runtime, no repair logic (deferred to concerns-store). Verify:
      bun run typecheck. Prod budget <=80 lines."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-types
    title: Concern artifact types
  - deps:
      - concerns-contracts-types
    description: "Schemas only. Inline (no cross-file $ref) shared
      concern/remarkable definitions into developer-output, fact-finder-output,
      qa, poc, test-assumptions, review newConcerns, plan, decisions,
      wave/plan-closeup (+concernResolutions), architect wave-report/closeup
      outputs; triage/infra/pm-edit untouched. severity/detail optional at
      schema level (defaults applied at runtime by concerns-store); kind is
      strict enum so unknown kind fails validation with no write. Dismiss
      detail-required enforced at runtime (store), not in JSON schema. Verify:
      typecheck + prompts.test preflight + one FakeHarness behavior case in
      test/engine/concerns-funnel.test.ts (valid concerns pass, unknown kind
      errors, no file written). Prod budget <=200 lines JSON."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-schemas
    title: Concern producer schemas
  - deps:
      - concerns-contracts-types
    description: "Resolver only. New src/core/review-policy.ts
      resolveReviewAllowed(pipeline,agent,isTriager): precedence per-agent array
      > default > builtin [fix,optional,architect,human-awareness,human-async];
      legacy reviewPolicy.allowedDispositions read-alias for default; append
      dismiss iff isTriager. Wire the single resolver into item-machine review
      promptVars, step-runner schema path, iteration plan-review prompt+schema,
      and generateReviewSchema (dismiss in enum only for triagers; QA never).
      Verify: typecheck + FakeHarness review-step behavior (reviewer accepts
      dismiss id-match; QA rejects dismiss). Prod budget <=100 lines."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-policy
    title: Canonical review-policy resolver


--- Decision 002-item-spike-saga-commit.yaml ---
id: decision-spike-saga-commit-1794104673241
context: item
item: spike-saga-commit
afterRecord: 002-review-a1
decision: accept-with-debt
timestamp: 2026-11-08T02:24:33.241Z
rationale: Research answered all 5 questions with line-grounded evidence plus
  execution probes; review approved with only optional nits; tree clean with no
  prod code. Merge quality-gate failure cannot be caused by a read-only spike
  and matches the known red baseline (TMPDIR head-guard). Re-running or
  splitting a complete spike wastes budget and blocks 3 gated items.
text: "Binding downstream directives from accepted findings: concerns-store: one
  file per fingerprint id, writeYamlAtomic distinct files, KeyedMutex(taskDir)
  only for status/source RMW merges, NEVER wrap commitAll in
  repo.writeLock.runExclusive (non-reentrant deadlock proven), write explicit
  taskWt path + immediate commitAll, add concerns/** to startup recovery +
  reconcileConcerns from committed records (derive stays read-only), ingest
  errors must not change step status (act-phase hook with internal handling).
  Hydration: append concerns LAST in buildArchitectHydration (tail-slice keeps
  it) or add registered concernsYaml var in prompt-vars.ts; recompute before
  wave-report (iteration-start snapshot stale). Derive: collectRoutedBlockers
  owner derive/task.ts; thread blockedBy into deriveItemState or post-process
  before every deriveWaveState call; debt in debtSet block. Digest:
  tousertoreview reuse REQUIRES derive/item blocking change (any open matching
  ref blocks today) or separate digest dir. Triage: partition concern entries
  out of fix-loop; plan-review has no writeArtifact so re-apply verdicts
  idempotently. Consults: avoid seq-allocated filenames under parallel consults
  (fingerprint ids or lock); trigger from wave act phase. Saga: copy
  filtered/condensed child concerns at runChildTask engine.ts:246-274 for every
  child status; forward child human questions to root mailbox (rootTaskDir
  unused today). Note pre-existing next-iteration->failed mapping."
debt: "spike-saga-commit merge gate failure is environmental, not content:
  read-only spike with zero prod diff, research ok, review approved; baseline
  test gate is red (2 head-guard TMPDIR failures). Findings accepted as
  authoritative. Unapplied reviewer optional nits carried as debt: qualify 'epic
  state ONLY from child-closeup' (isMerged precedence), prefix inline paths with
  plugins/software-factory/, scope removeWorktree claim to epic child worktrees,
  fold contextPack key into findings (strict fact-finder schema allows only
  status/summary/findings/sources/recommendations). Consumers must apply these
  mentally."


--- Decision 003-amend-remove-adr-blocking-digest.yaml ---
id: decision-amend-remove-adr-blocking-digest
context: wave
item: adr-blocking-digest
decision: split
rationale: Amendment removed pending item adr-blocking-digest
timestamp: 2026-11-08T06:03:02.905Z


--- Decision 004-amend-remove-concerns-store.yaml ---
id: decision-amend-remove-concerns-store
context: wave
item: concerns-store
decision: split
rationale: Amendment removed pending item concerns-store
timestamp: 2026-11-08T06:03:02.905Z


--- Decision 005-amend-remove-docs-finish.yaml ---
id: decision-amend-remove-docs-finish
context: wave
item: docs-finish
decision: split
rationale: Amendment removed pending item docs-finish
timestamp: 2026-11-08T06:03:02.905Z


--- Decision 006-amend-remove-funnel-closeups.yaml ---
id: decision-amend-remove-funnel-closeups
context: wave
item: funnel-closeups
decision: split
rationale: Amendment removed pending item funnel-closeups
timestamp: 2026-11-08T06:03:02.905Z


--- Decision 007-amend-remove-modes-prompts.yaml ---
id: decision-amend-remove-modes-prompts
context: wave
item: modes-prompts
decision: split
rationale: Amendment removed pending item modes-prompts
timestamp: 2026-11-08T06:03:02.905Z


--- Decision 008-amend-remove-plan-reviewer-triage.yaml ---
id: decision-amend-remove-plan-reviewer-triage
context: wave
item: plan-reviewer-triage
decision: split
rationale: Amendment removed pending item plan-reviewer-triage
timestamp: 2026-11-08T06:03:02.905Z


--- Decision 009-amend-remove-reviewer-triage.yaml ---
id: decision-amend-remove-reviewer-triage
context: wave
item: reviewer-triage
decision: split
rationale: Amendment removed pending item reviewer-triage
timestamp: 2026-11-08T06:03:02.906Z


--- Decision 010-amend-remove-routing-architect-consult.yaml ---
id: decision-amend-remove-routing-architect-consult
context: wave
item: routing-architect-consult
decision: split
rationale: Amendment removed pending item routing-architect-consult
timestamp: 2026-11-08T06:03:02.906Z


--- Decision 011-amend-remove-routing-blocker-derive.yaml ---
id: decision-amend-remove-routing-blocker-derive
context: wave
item: routing-blocker-derive
decision: split
rationale: Amendment removed pending item routing-blocker-derive
timestamp: 2026-11-08T06:03:02.906Z


--- Decision 012-amend-remove-routing-human-debt.yaml ---
id: decision-amend-remove-routing-human-debt
context: wave
item: routing-human-debt
decision: split
rationale: Amendment removed pending item routing-human-debt
timestamp: 2026-11-08T06:03:02.906Z


--- Decision 013-amend-remove-saga-propagate.yaml ---
id: decision-amend-remove-saga-propagate
context: wave
item: saga-propagate
decision: split
rationale: Amendment removed pending item saga-propagate
timestamp: 2026-11-08T06:03:02.906Z


--- Decision 014-amend-remove-status-state-surface.yaml ---
id: decision-amend-remove-status-state-surface
context: wave
item: status-state-surface
decision: split
rationale: Amendment removed pending item status-state-surface
timestamp: 2026-11-08T06:03:02.906Z


--- Decision 015-item-concerns-store-v2.yaml ---
id: decision-concerns-store-v2-1794123864467
context: item
item: concerns-store-v2
afterRecord: 008-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T07:44:24.467Z
rationale: "Reviewer defect is valid and blocks M1 restart-idempotency
  invariant: unconditional replay with wall-clock timestamps rewrites every
  concern and commits per record on each startup, churning updatedAt/lastSeen
  and git history. Root cause is localized to aggregate/reconcile timestamp and
  dirty handling, fixable in one small round. No split or escalation warranted."
text: "Fix reconcile idempotency in concerns-store-v2 (one round): 1) Add
  opts.at to aggregateConcerns/merge (default now ISO). Live step seams keep
  wall-clock; reconcile passes meta.endedAt. 2) Write-only-on-diff: compare
  merged vs existing on content fields (detail, severity, sources, status,
  disposition, escalated); if equal and existing lastSeen >= at, skip
  writeYamlAtomic entirely. Else write with updatedAt=at,
  lastSeen=max(existing.lastSeen, at). 3) reconcileConcerns: enumerate committed
  ok records (runs + items/*/steps), read meta.endedAt, sort ascending (fallback
  seq/name), replay in order with at=endedAt; track dirty flag; single commitAll
  at end only if dirty — remove per-record commitAll from replay path. 4)
  Strengthen idempotency test: hash concern files + git rev-parse HEAD after
  first reconcile, run reconcile again, assert bytes and HEAD unchanged and
  updatedAt/lastSeen equal endedAt values. Keep KeyedMutex RMW-only, never wrap
  commitAll in repo.writeLock, ingest errors never change step status."
persist: true


--- Decision 016-item-adr-blocking-digest-v2.yaml ---
id: decision-adr-blocking-digest-v2-1794145301769
context: item
item: adr-blocking-digest-v2
afterRecord: 007-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T13:41:41.769Z
rationale: "Reviewer defect verified and valid: humanInvolvementCriteria is
  computed (step-runner.ts:300-304) and registered in KNOWN_VARS for
  architect/review steps (prompt-vars.ts:95-131), but zero fragments under
  agents/ contain the {{humanInvolvementCriteria}} placeholder, so the
  mode/blocking table is computed then silently dropped — preflight cannot catch
  unused vars. Architects must classify blocking per a table they never see,
  making blocking-vs-remarkable routing unguided. Fix is small and localized (3
  fragment edits + 1 render test); no split or escalation warranted."
text: "Fix in adr-blocking-digest-v2 (one round): 1) Add a terse
  `{{humanInvolvementCriteria}}` section to agents/steps/architect-plan.md,
  agents/steps/architect-revise.md, and agents/steps/plan-review.md (plan-review
  triages ADR/concern blocking per matrix). Insert after the existing
  criteria/dispositions block with a short heading (e.g. `## Human involvement`
  + placeholder only, no prose duplication — criteria text comes from
  agents/criteria/human-involvement.md via formatHumanInvolvementCriteria). Keep
  each addition ≤5 lines to respect the 15/60 debloat budget. 2) Do NOT touch
  step-runner computation or KNOWN_VARS registration (already correct). 3) Add a
  prompt-render test (extend test/human-involvement-config.test.ts): render
  architect-plan, architect-revise, and plan-review prompts with a sentinel
  humanInvolvementCriteria string and assert the sentinel appears in each
  rendered prompt. 4) Verify: bun run typecheck + TMPDIR=/tmp bun test
  (prompts.test preflight must stay green). Out of scope: steps/review
  placeholder (triage items own it), digest/blocking logic changes."
persist: true


--- Decision 017-item-routing-architect-consult-v2.yaml ---
id: decision-routing-architect-consult-v2-1794147542063
context: item
item: routing-architect-consult-v2
afterRecord: 004-review-r1-a1
decision: retry-with-guidance
timestamp: 2026-11-08T14:19:02.063Z
rationale: "Item is implementation-complete and review-clean: target tests
  red->green verified, QA approved, reviewer approved with only optionals,
  develop gates green (371 pass, typecheck pass, size 213/300). Merge-path test
  failure with no new fix requests points to merge-time causes (stale
  base/conflict resolution with wave-9 siblings touching iteration.ts,
  environmental TMPDIR/head-guard flake, or cross-test interference) rather than
  a design defect. No split/escalation warranted."
text: "Retry routing-architect-consult-v2 merge in one round: 1) Pull the exact
  merge-gate failure (failing test names + output), not the develop gate —
  report them in evidence. 2) Rebase onto current topic tip; wave-9 siblings
  (adr-blocking-digest-v2, status-state-surface-v2) also touch
  iteration.ts/derive — verify conflict resolution kept BOTH this item's
  consultRoutedBlockers call sites + hydration section AND sibling changes. 3)
  Reproduce with TMPDIR=/tmp: targeted file first, then full `bun test`; if
  failures are head-guard/TMPDIR flakes or lock/timeout flakes, re-run clean and
  note it. 4) If failures are real regressions, fix narrowly without redesign:
  consult must fire only for kind==blocker && status==routed with
  affects∩blocked-wave-items, guard on decisions/concern-<cid>.yaml existence
  (no rewrite, no second turn on restart); hydration section stays
  LAST-appended, open+routed only, plan-reviewer path stays open-only. 5) Do NOT
  apply the 4 optional nits unless they fix the failure
  (sub-budget/sanitize/barrel/prompt-align are debt for docs-finish). Keep diff
  within budget."
persist: false


--- Decision 018-amend-remove-funnel-closeups-v2.yaml ---
id: decision-amend-remove-funnel-closeups-v2
context: wave
item: funnel-closeups-v2
decision: split
rationale: Amendment removed pending item funnel-closeups-v2
timestamp: 2026-11-08T14:30:22.915Z


--- Decision 019-amend-remove-saga-propagate-v2.yaml ---
id: decision-amend-remove-saga-propagate-v2
context: wave
item: saga-propagate-v2
decision: split
rationale: Amendment removed pending item saga-propagate-v2
timestamp: 2026-11-08T14:30:22.915Z


--- Decision 020-item-funnel-closeups-v3.yaml ---
id: decision-funnel-closeups-v3-1794156080522
context: item
item: funnel-closeups-v3
afterRecord: 008-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T16:41:20.522Z
rationale: All 4 FIX findings are probe-verified contract breaches against cited
  spike/ADR text (wrong-cap classification, invisible pending proposals, reject
  burying open concerns, zero-input over-hydration), not judgment calls. Each
  has a localized mechanical fix in the item's own new code
  (hydrateStepConcerns, terseConcern, applyConcernConfirms, renderConcernsYaml
  edge). Base-tree check confirms the defects live in the unmerged work (no
  hydrateStepConfirms/hydrateStepConcerns on base; base renderConcernsYaml still
  returns serialize([])). One guided round should close all four; no split or
  escalation warranted.
text: "Fix funnel-closeups-v3 in one round (4 defects, all in your new code): 1)
  STEP-ROLE CAP CLASSIFICATION: delete the `git diff main HEAD > 0` branch-state
  inference in hydrateStepConcerns. Classify by step: review/qa steps -> UTF-8
  bytes of promptVars.diff -> cap min(diff,2000); wave-close-up/plan-close-up ->
  aggregated task-branch diff bytes -> min(diff,2000); plan-review +
  architect-plan/revise/wave-report/closeup/consults -> sum of registered input
  prompt-var bytes -> cap min(input,500). Add regression test: plan-review in
  iteration 2+ with merged code on branch hydrates <=500 bytes and < input bytes
  (replay the 294-byte-input probe). 2) PENDING VISIBILITY: in terseConcern emit
  `pendingResolution` whenever the field is present, regardless of status (open
  AND routed) — plan-close-up targets open concerns and architects must see the
  proposal to accept/reject. Extend hydration test to assert the block for an
  open+pending concern. 3) REJECT PRESERVES STATUS: in applyConcernConfirms,
  reject must clear pendingResolution, set NO disposition, and keep the
  concern's existing status (open stays open, routed stays routed); only
  accept+resolve -> resolved, accept+carry -> routed+disposition,
  accept+propagate -> propagate path. Add regression test: reject on an
  open+pending concern yields status open with no disposition, and
  listHydratedConcerns still returns it. 4) ZERO CAPS: when the computed cap is
  0 (zero-diff branch with inputBytes===0, or diffBytes===0 for code steps)
  return '' with no concerns block; in renderConcernsYaml return '' when
  serialize([]) itself exceeds maxBytes. Add edge tests: all-zero prompt vars ->
  '' hydration; 1-byte and 3-byte diff caps -> '' (not '[]'). Verify: bun run
  typecheck + TMPDIR=/tmp bun test (full suite green); keep diff within budget,
  no redesign beyond these four fixes."
persist: true


--- Decision 021-item-hydration-fingerprint-caps.yaml ---
id: decision-hydration-fingerprint-caps-1794176143790
context: item
item: hydration-fingerprint-caps
afterRecord: 006-qa-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T22:15:43.790Z
rationale: "Both remaining FIX items are test-strengthening gaps, not prod
  defects: cap tests render 185-249 bytes (never truncate, so any cap value
  passes) and the legacy detail-preservation gate at concerns.ts:119 has no
  regression coverage. Prod implementation is accepted; one test-only round
  closes both with falsifiable assertions."
text: "Test-only round for hydration-fingerprint-caps (no prod changes
  expected): 1) Cap discrimination tests: build fixtures whose UNCAPPED terse
  serialization exceeds each cap (many concerns or long summaries). Review
  (diffBytes 5000) and wave-close-up (taskDiffBytes 5000): assert rendered <=
  2000 AND > 500 bytes (proves 2000 applied, not 500) and assert condensation
  actually occurred (compare against uncapped render: fewer id lines or
  truncated-summary marker). Plan-review: use inputBytes < 500 (e.g. 294) with
  payload > input; assert rendered <= inputBytes and < input bytes (proves
  min(input,500)). Add a runAgentStep-level plan-review case WITHOUT caller
  concernsYaml override and with large prompt inputs incl.
  debt/steering/concernsYaml/humanInvolvementCriteria values, asserting
  hydration excludes those four keys from the inputBytes sum (direct
  hydrateStepConcerns calls do not cover step-runner summation). 2) Legacy gate
  regression test: seed a legacy old-hash file (affects-bearing id) with stored
  detail LONGER than summary; re-emit the same concern omitting detail; assert
  stored detail survives, affects union equals [new,old], new stable id file
  exists, legacy file removed. Sanity-check the test fails when the gate is
  reverted to merged.detail = (input.detail ?? input.summary).trim(). Verify:
  bun run typecheck + TMPDIR=/tmp bun test on the item's test file(s), then full
  suite green."
persist: true


--- Decision 022-item-docs-finish-v3.yaml ---
id: decision-docs-finish-v3-1794197936587
context: item
item: docs-finish-v3
afterRecord: 004-qa-r1-a2
decision: retry-with-guidance
timestamp: 2026-11-09T04:18:56.587Z
rationale: "Red-test gate correctly rejects: 9/11 docs tests pass on the base
  tree, so they do not prove the item's change. Only the source.agent and
  immediate-halt needle tests properly fail on base. Root cause is weak needles
  matching pre-existing base content (e.g. row-18 title already contains
  'concerns'; 'dismiss'/'concerns'/'digest' already appear in base docs), not
  missing docs. Small, localized test-only fix: tighten needles to base-absent
  sentinels."
text: "Test-only round for docs-finish-v3 (no docs/content changes expected
  beyond test alignment): 1) In test/docs-concerns.test.ts make ALL 11 tests
  base-failing: replace generic needles with sentinels unique to this item's new
  content. Row-18 test: assert row 18 contains the new shipped-description
  sentinel AND does NOT contain 'Deliberately not hand-built'. §8.11 test:
  assert the '8.11 Concerns' heading exists (absent on base).
  §5/§6.2/§8.7/§10/§11/§13/README tests: assert exact new phrases added by this
  item, never bare words ('concerns', 'dismiss', 'digest', 'counts') that
  already occur on base. Keep the 2 already-red tests (source.agent, immediate
  halt) as-is. 2) Verify red-then-green explicitly: run the test file against a
  pristine base worktree (expect 11 fail), then on the branch (expect 11 pass).
  3) Verify: bun run typecheck + TMPDIR=/tmp bun test on the test file, then
  full suite green. Do not weaken assertions to pass red-test cosmetically —
  each needle must name content this item adds."
persist: true


--- Decision 023-item-schema-detail-normalize.yaml ---
id: decision-schema-detail-normalize-1794206496998
context: item
item: schema-detail-normalize
afterRecord: 002-test-first-r1-a2
decision: retry-with-guidance
timestamp: 2026-11-09T06:41:36.998Z
rationale: Both test-first attempts wrote the new test file but yielded output
  with no `target` field, so the mechanical target-red check fails at
  runner.ts:333 before running anything ('No target specified'). This is a
  yield-shape omission, not a code problem. The item is small and well-scoped;
  no split or escalation needed.
text: "Retry test-first. Root cause of both rejections: your yield omitted
  `target`. You MUST yield `target: { selectors:
  ['test/contracts/schema-detail-normalize.test.ts'], expectRed: ['<exact
  it/test name 1>', '<exact it/test name 2>', ...] }` where every expectRed
  string is the EXACT name from an it()/test() block in your new file (bun-junit
  matching is by test-name segment; minItems 1). Scope: touch ONLY paths.tests
  (new file). Do NOT touch schemas, src, or epic-saga-propagate.test.ts in this
  step — test-first-scope rejects prod changes; the 3 .Detail read fixes +
  schemas + concerns.ts:72 belong to the develop step. Red semantics: each
  expectRed id must FAIL by assertion on current prod (lowercase-detail contract
  assertions fail against capital-D schemas; longest-wins fails because merge
  reads existing?.Detail). Collection/import/syntax errors do NOT count as red.
  Prove locally before yielding: cd plugins/software-factory && TMPDIR=/tmp bun
  test test/contracts/schema-detail-normalize.test.ts and confirm your declared
  ids fail with assertion failures."
persist: true


## Steering Directives
--- Prior Plan plan-1.1.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "artifacts.ts: Concern, RemarkableDecision,
        StoredConcernArtifact(+pendingResolution?, source.escalated?),
        ReviewDisposition+dismiss (no tech-debt), PlanAdr.blocking,
        PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeveri\
        ty,minBlockingSeverity}, reviewPolicy.default canonical"
      - "config/schemas: shared concern/remarkable partial in developer,
        fact-finder, qa, poc, test-assumptions, review newConcerns, plan,
        decisions, wave/plan-closeup, architect reports; triage/infra/pm-edit
        out of scope; dismiss detail-required; closeup concernResolutions"
      - "src/core/concerns.ts: concernFingerprint(identity),
        aggregateConcerns(merge+escalated), listOpenConcerns,
        applyConcernTriage(exact-id,isTriager), applyCloseupResolutions,
        partitionSuggestions(triage vs findings)"
      - "src/core/review-policy.ts:
        resolveReviewAllowed(pipeline,agent,isTriager)
        per-agent>default>builtin, legacy allowedDispositions alias, dismiss
        auto-append for triagers; generateReviewSchema uses it; taskWt
        runExclusive+atomic+immediate-commit helper"
    id: m1-contracts-aggregate
    scenarios:
      - Given a developer step emitting a blocker concern When the step commits
        Then concerns/c-<fp10>.yaml exists with status open and source.record
        pointing at the step record
      - Given the same concern re-emitted on retry When aggregation runs Then
        exactly one file exists, prior dismissed/routed preserved,
        updatedAt/lastSeen advance
      - Given a concern missing severity and detail When validation runs Then
        severity defaults to medium, detail defaults to summary, and the file is
        created
      - Given a concern with unknown kind When validation runs Then the step
        errors, no concerns file is written, existing files stay untouched
      - Given developer, fact-finder, qa, poc, review-new, plan, consult,
        closeup, and architect-report outputs carrying concerns[]+remarkable[]
        When steps commit Then each aggregates to concerns/c-*.yaml or rm-*.yaml
        with open status and source pointer; triage/infra/pm-edit carry none
      - Given reviewer output with new concerns[] plus suggestions triaging a
        pre-existing id When the step commits Then the new concern aggregates
        open and only the pre-existing id is triaged (no same-step self-dismiss)
      - Given reviewPolicy.default [fix,optional] plus reviewer override
        [fix,optional,architect] When resolveReviewAllowed runs Then reviewer
        triager gets override+dismiss and QA non-triager gets default without
        dismiss
      - Given a dismissed concern re-emitted with higher severity When merge
        runs Then status stays dismissed but source.escalated=true and the
        escalation appears in digest and architect hydration
    title: Contracts and aggregation foundation
  - directionalInterfaces:
      - "prompt-vars KNOWN_VARS+descriptions: concernsYaml in steps/review,
        steps/plan-review, steps/wave-close-up, steps/plan-close-up,
        architect-plan, architect-wave-report, architect-closeup,
        architect-consult-*; humanInvolvementCriteria in review, plan-review,
        architect-*"
      - item-machine review + iteration plan-review promptVars and writeArtifact
        with isTriager gate, partitionSuggestions excluding triage ids from
        fix-loop/approval/normal mailbox, fix-on-concern fixRequired once,
        mailbox dedup q-concern-<cid>
      - agents reviewer, plan-reviewer, criteria/dispositions,
        criteria/human-involvement terse confirm/dismiss/condense plus blocking
        table plus condensing rule output-bytes<input-bytes
      - config/pipeline.default.yaml commented autonomous/principal/detailed
        presets with blocking table plus concerns raise/threshold examples
    id: m2-triage-modes
    scenarios:
      - Given open item concerns When review runs Then steps/review receives
        concernsYaml with id/kind/severity/summary/affects and terse triage
        instructions
      - Given reviewer suggestion matching a concern id with disposition dismiss
        and detail When review commits Then that file has status dismissed plus
        dismissReason=detail and no mailbox, debt, blocked, or approval effect
      - Given a matching dismiss suggestion without detail When review commits
        Then the step errors and no triage is persisted
      - Given QA emitting a matching concern id When QA commits Then no triage
        is applied and the file stays open
      - Given matching suggestions with fix, optional, architect, or human-*
        When review commits Then each file becomes routed with disposition
        persisted; triage ids are excluded from normal fix-loop/approval/mailbox
        except fix-on-concern sets fixRequired once; human-async on a concern
        writes a single q-concern-<cid>
      - Given architect plan concerns plus an rm-* file When plan-review runs
        Then plan-reviewer triages with the same vocabulary and non-dismissed
        files become routed; debt predicate is kind==tech-debt&&routed or
        disposition==optional (no tech-debt disposition)
      - Given pipeline.yaml humanInvolvement principal When reviewer and
        architect prompts render Then the mode criteria fragment is included and
        preflightPrompts passes
    title: Reviewer triage and modes
  - directionalInterfaces:
      - derive/task.ts collectRoutedBlockers(taskDir)->Set plus
        deriveWave/deriveItem integration;
        scheduler.blockedByConcern(items,concernBlocked) pure reusing
        blockedByFailure fixpoint, unioned, cascade only over declared deps
      - "act-phase routing: triage writeArtifact plus wave-act newly-blocked
        check writing decisions/concern-<cid>.yaml exactly once (restart
        idempotent); buildArchitectHydration extended with concernsYaml digest"
      - steer writeQuestion for human-async/stop/blocking ADR; derive/task
        blocking-vs-digest split (blocks.length>0 vs awareness empty); debt
        predicate; human-stop exit-10 halt plus blocked
    id: m3-routing
    scenarios:
      - Given a routed blocker whose affects names a declared dependent When
        derive runs Then the dependent derives blocked with no writes;
        non-dependents are unaffected and transitive blocking follows declared
        deps only
      - Given a newly blocked dependent When the act phase runs Then exactly one
        decisions/concern-<cid>.yaml is written and a restart writes no second
        file
      - Given a routed architect concern When the next architect turn builds
        hydration Then its concernsYaml input contains that concern id and
        summary
      - Given a routed human-async concern When routing runs Then mailbox
        q-concern-<cid> has blocks=[item], the item derives blocked, and the
        engine continues without exit 10
      - Given a routed human-stop concern When routing runs Then the mailbox
        entry blocks task/item, item and task derive blocked, and the engine
        halts with exit code 10 until answered or dismissed
      - Given a routed human-awareness concern When routing runs Then the
        mailbox entry has blocks=[] in the Digest section and the engine
        continues with no blocked set and no exit 10
      - Given plan ADRs blocking true and false under autonomous mode When plan
        commits Then the blocking ADR creates a mailbox question with blocks
        while the remarkable ADR appears only in the digest; debt includes kind
        tech-debt routed or disposition optional routed as [item] summary
    title: Routing to blocked, architect, mailbox, debt
  - directionalInterfaces:
      - closeup schemas concernResolutions resolve/carry/propagate plus
        concerns[]/remarkable[];
        StoredConcern.pendingResolution{action,note,by,at};
        applyCloseupResolutions proposes (status stays routed); architect
        concernConfirms accept/reject applies; propagate to parent concerns/
        copy or human digest
      - "iteration.ts concernsYaml hydration capped UTF-8 bytes: code steps
        min(diffBytes,2000); zero-diff orchestration min(inputBytes,500);
        reviewer/architect condensing prompts require output<input; engine
        truncates hydrated var only"
      - engine.ts runChildTask propagateEpicConcerns after child completion
        before cleanup/merge, condensed copies with source.epic, parent
        hydration extended; size assert parent-detail<child-detail
      - derive/task.ts toStateArtifact().concerns counts (missing dir zeros,
        corrupt skip+warn); cli/status.ts Concerns plus separate Blocking vs
        Digest sections
    id: m4-funnel-surface
    replanAfter: true
    scenarios:
      - Given wave diff 5000 bytes and open concerns 3000 bytes When
        wave-close-up hydrates Then concernsYaml is <=2000 bytes and < wave diff
        in UTF-8 bytes
      - Given zero-diff plan-review with 4000-byte input When hydrating Then
        concernsYaml is <=500 bytes and < input bytes
      - Given wave-close-up emitting concernResolutions resolve/carry/propagate
        When it commits Then files stay routed with pendingResolution set;
        architect accept applies resolved/routed/propagated and reject clears
        pending
      - Given a simple item with open concerns and no reviewer When
        wave-close-up runs Then explicit resolutions triage them; fallback
        auto-routes kind tech-debt to optional (debt) and other kinds to
        architect (carry); human-* is never auto-routed
      - Given a child epic finishing with one dismissed and one open concern
        with 800-byte detail When runChildTask completes before cleanup Then the
        parent gains exactly one condensed copy with source.epic, detail <800
        bytes, hydrating saga architect concernsYaml
      - Given mixed-status concerns plus a corrupt yaml file When state
        refreshes and factory status runs Then state.yaml counts skip the
        corrupt file with warn, missing dir yields zeros, and CLI shows Concerns
        plus Blocking vs Digest sections
    title: Funnel, close-ups, saga, surfacing
  - directionalInterfaces:
      - docs/ARCHITECTURE.md §1 row 18 + §6.2 concerns/ + §8
        funnel/routing/modes/partition/producer-matrix/resilience/exit-10,
        README.md, config commentary, agents/criteria/dispositions.md human-stop
        exit-10 preserved
      - "fragment matrix (8 fragments) + debloat check: each fragment ≤15 lines,
        total growth ≤60 lines, preflight plus line-count assertion in
        prompts.test"
    id: m5-docs
    scenarios:
      - Given implementation complete When docs are read Then ARCHITECTURE,
        README, config commentary, and dispositions describe concerns lifecycle,
        funnel sizes, partition, producer matrix, exit-10, modes, and counts
        with terse prompts
      - Given prompt fragments When prompts.test runs Then KNOWN_VARS plus
        descriptions cover all 8 fragments and added lines respect ≤15/≤60
        budgets
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    title: Docs and suite consolidation
uncertainties:
  - description: Funnel byte budget per-level sources, zero-diff rule, and
      bytes-vs-chars unit needed before close-up hydration.
    id: u-text-budget
    spikeOutlines:
      - test-assumptions spike-text-budget verifies code min(diff,2000) and
        zero-diff min(input,500) UTF-8 bytes with output<input condensing
  - description: Epic propagation timing plus taskWt serialization/restart behavior
      and pure-derive versus act-phase boundary needed before store, blocker
      derive, and saga propagation.
    id: u-saga-propagation
    spikeOutlines:
      - fact-finder spike-saga-commit verifies parent-copy timing, runExclusive
        serialization, immediate commit idempotency, collectRoutedBlockers
        owner, and hydration seam
itemOutlines:
  - deps: []
    description: "test-assumptions: measure item/wave diff bytes vs concern detail
      sizes; confirm per-level caps code min(diff,2000) and zero-diff
      min(input,500) UTF-8 bytes, condensing output<input, no 500-floor
      violation. Finding record only, no prod code; gates funnel-closeups."
    kind: test-assumptions
    milestoneId: m1-contracts-aggregate
    slug: spike-text-budget
    title: "Spike: funnel byte budget"
  - deps: []
    description: "fact-finder: verify runChildTask copy timing before cleanup/merge,
      parent buildArchitectHydration extension point, taskWt runExclusive
      serialization under 4 parallel items, immediate commit plus restart
      idempotency, pure-derive vs act-phase boundary with collectRoutedBlockers
      owner. Finding only; gates concerns-store, routing-blocker-derive,
      saga-propagate."
    kind: fact-finder
    milestoneId: m1-contracts-aggregate
    slug: spike-saga-commit
    title: "Spike: saga propagation, commit, derive boundary"
  - deps: []
    description: "Types plus schemas for producer matrix (developer, fact-finder,
      qa, poc, test-assumptions, review newConcerns, plan, decisions,
      wave/plan-closeup with concernResolutions, architect reports) via shared
      partial; triage/infra/pm-edit out of scope. Canonical
      reviewPolicy.default, legacy alias,
      resolveReviewAllowed(pipeline,agent,isTriager) precedence plus dismiss
      injection, generateReviewSchema, dismiss detail-required, pipeline
      humanInvolvement plus concerns thresholds. Tests: typecheck, preflight,
      repair defaults vs strict reject unknown kind."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts
    title: Concern contracts and canonical review policy
  - deps:
      - concerns-contracts-policy
      - concerns-contracts-schemas
      - concerns-contracts-types
    description: Implement src/core/concerns.ts (fingerprint identity,
      merge+escalated, aggregate/list/triage/closeup/partition, atomic YAML +
      KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll, restart
      idempotent). NEVER wrap commitAll in repo.writeLock.runExclusive
      (deadlock). Explicit taskWt path, one file per fingerprint, concerns/**
      startup recovery + reconcileConcerns from committed records (derive
      read-only), ingest errors must not change step status. Wire all producer
      seams incl consult writeArtifact; reviewer aggregates new then triages
      pre-existing only. Spike-saga-commit findings authoritative (no re-run).
      Behavior tests in test/engine/concerns-funnel.test.ts. Run TMPDIR=/tmp bun
      test.
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-store
    title: Concerns store with merge and commit
  - deps:
      - concerns-store
    description: "Item reviewer triage with concernsYaml in steps/review, isTriager
      gate, exact-id partition excluding triage ids from
      fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox
      dedup q-concern-<cid>, dismiss detail to dismissReason, condensing
      output<input, debt predicate without tech-debt disposition. Behavior
      tests: dismiss no routing, routed persist, QA gate no-op, missing detail
      errors, fix-once, no double mailbox."
    kind: story
    milestoneId: m2-triage-modes
    slug: reviewer-triage
    title: Workhorse reviewer triage
  - deps:
      - concerns-store
    description: "Architect path: aggregate plan/revise concerns plus remarkable
      rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition
      and dismiss vocabulary, non-dismissed become routed. Behavior tests:
      dismissed vs routed, rm-* triaged, debt predicate, no approval trigger
      from triage ids."
    kind: story
    milestoneId: m2-triage-modes
    slug: plan-reviewer-triage
    title: Plan-reviewer triage
  - deps:
      - concerns-contracts-policy
      - concerns-contracts-schemas
      - concerns-contracts-types
    description: "humanInvolvement + concerns thresholds schema/loader/merge,
      commented autonomous/principal/detailed presets with blocking table,
      agents/criteria/human-involvement.md terse fragment, KNOWN_VARS
      concernsYaml + humanInvolvementCriteria wired per fragment matrix.
      Behavior: mode switch changes criteria and blocking-ADR behavior;
      preflight green. Precedes all routing."
    kind: story
    milestoneId: m2-triage-modes
    slug: modes-prompts
    title: Modes, thresholds, prompt wiring
  - deps:
      - modes-prompts
      - plan-reviewer-triage
      - reviewer-triage
    description: "Pure derive only: derive/task.ts
      collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration
      (thread blockedBy into deriveItemState or post-process before every
      deriveWaveState call), scheduler.blockedByConcern reusing fixpoint, union
      with failure-blocked, cascade only declared deps, no writes. Spike
      findings authoritative. Behavior: dependent blocked, non-dep unaffected,
      transitive via deps only."
    escalate: true
    kind: story
    milestoneId: m3-routing
    slug: routing-blocker-derive
    title: Blocker derive
  - deps:
      - modes-prompts
      - routing-blocker-derive
    description: "Act phase only: wave-act newly-blocked check writes
      decisions/concern-<cid>.yaml exactly once (restart idempotent) plus
      buildArchitectHydration concernsYaml extension for wave-report/next-plan.
      Behavior tests: single consult file, restart no duplicate, architect input
      contains id+summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-architect-consult
    title: Architect consult and hydration
  - deps:
      - reviewer-triage
      - modes-prompts
    description: "human-async blocks [item] and continues, human-stop blocks
      task/item plus exit-10 halt plus blocked derive, awareness blocks []
      digest never blocking/exiting, debt predicate kind tech-debt routed or
      disposition optional routed. Behavior tests: mailbox files per
      disposition, exit 10 on stop, awareness continues, debt includes [item]
      summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-human-debt
    title: Human mailbox and debt routing
  - deps:
      - modes-prompts
      - routing-human-debt
    description: "Full ADR md title/context/decision/consequences/blocking, blocking
      routed per mode table with exit-10 when stop, remarkable digest-only never
      waiting, dispositions.md exit-10 preserved. Behavior tests: blocking
      mailbox+blocks, remarkable digest only."
    kind: story
    milestoneId: m3-routing
    slug: adr-blocking-digest
    title: Blocking vs remarkable ADRs
  - deps:
      - adr-blocking-digest
      - routing-architect-consult
      - spike-text-budget
    description: "Hydrate wave/plan-close-up and architect reports with concernsYaml
      capped per spike (code min(diff,2000), zero-diff min(input,500) UTF-8
      bytes, output<input), concernResolutions pending + architect
      concernConfirms accept/reject, propagate to parent/digest, simple-item
      explicit + auto-route fallback (tech-debt->optional, others->architect,
      human-* never auto). Apply spike nits: cross-check diffs via production
      git() wrapper, add many-concerns 2000B truncation case, clarify trim
      semantics. Behavior: byte budgets, pending/confirm, simple fallback."
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: funnel-closeups
    title: Funnel close-ups and simple triage
  - deps:
      - routing-architect-consult
    description: "runChildTask propagateEpicConcerns: after child completion before
      cleanup/merge (engine.ts:246-274) for every child status, condensed parent
      copies source.epic with parent detail < child, extended parent
      concernsYaml hydration (append LAST, recompute before wave-report);
      forward child human questions to root mailbox. Spike findings
      authoritative. Behavior: one copy, dismissed stays local, saga input
      contains id."
    escalate: true
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: saga-propagate
    title: Epic to saga propagation
  - deps:
      - concerns-store
      - routing-human-debt
    description: "Sole owner StateArtifact.concerns
      {open,dismissed,routed,resolved}, state.schema,
      toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI
      Concerns plus Blocking vs Digest. Behavior tests: counts, missing/corrupt,
      CLI sections."
    kind: story
    milestoneId: m4-funnel-surface
    slug: status-state-surface
    title: State counts and status surfacing
  - deps:
      - funnel-closeups
      - modes-prompts
      - saga-propagate
      - status-state-surface
    description: "Update ARCHITECTURE section 1 row 18 plus 6.2 plus 8, README,
      config commentary, dispositions.md; fragment matrix plus 15/60 debloat
      check; consolidate test/engine/concerns-funnel.test.ts plus steer/CLI
      coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test."
    kind: story
    milestoneId: m5-docs
    slug: docs-finish
    title: Docs and suite consolidation
  - deps: []
    description: "Types only. In src/core/artifacts.ts add
      Concern/ConcernKind/ConcernSeverity/ConcernStatus, RemarkableDecision,
      StoredConcernArtifact (+pendingResolution?, source.escalated?),
      ReviewDisposition+dismiss (no tech-debt value), PlanAdr.blocking,
      PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeverity\
      ,minBlockingSeverity}, reviewPolicy.default canonical + legacy
      allowedDispositions alias in type. No JSON, no runtime, no repair
      (deferred to concerns-store). Verify: bun run typecheck. Prod budget <=80
      lines."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-types
    title: Concern artifact types
  - deps:
      - concerns-contracts-types
    description: "Schemas only. Inline (no cross-file $ref) shared
      concern/remarkable definitions into developer-output, fact-finder-output,
      qa, poc, test-assumptions, review newConcerns, plan, decisions,
      wave/plan-closeup (+concernResolutions), architect wave-report/closeup;
      triage/infra/pm-edit untouched. severity/detail optional (runtime defaults
      in store); kind strict enum so unknown kind fails validation with no
      write. Dismiss detail-required at runtime, not JSON schema. Verify:
      typecheck + prompts.test preflight + one FakeHarness case in
      test/engine/concerns-funnel.test.ts. Budget <=200 lines JSON."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-schemas
    title: Concern producer schemas
  - deps:
      - concerns-contracts-types
    description: "Resolver only. New src/core/review-policy.ts
      resolveReviewAllowed(pipeline,agent,isTriager): per-agent > default >
      builtin [fix,optional,architect,human-awareness,human-async]; legacy
      allowedDispositions read-alias for default; append dismiss iff isTriager.
      Wire into item-machine review promptVars, step-runner schema path,
      iteration plan-review prompt+schema, generateReviewSchema. QA never
      dismiss. Verify: typecheck + FakeHarness (reviewer accepts dismiss, QA
      rejects). Budget <=100 lines."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-policy
    title: Canonical review-policy resolver
assumptions:
  - assumption: Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures
      do not mask regressions.
    why: Baseline red only under .factory-runtime TMPDIR; suite green with
      TMPDIR=/tmp. Out of scope.
  - assumption: Concern identity excludes detail and severity per
      adr-fingerprint-merge; reworded detail merges and severity escalations
      surface via escalated flag without reopening.
    why: Prevents trivial-reword duplicates while keeping escalation visible to
      architect and digest.
  - assumption: buildArchitectHydration does not read parent concerns/ today;
      saga-propagate extends it with concernsYaml, and runChildTask copies
      condensed epic concerns to parent concerns/ after child completion but
      before cleanup/merge per spike-saga-commit.
    why: Corrects the prior hydration assumption; defines the copy timing and seam
      the spike must verify.
  - assumption: Per-mode blocking table in adr-humaninvolvement-config is
      authoritative for iteration 1; raise allowlist defaults to all agents.
    why: Unblocks routing without operator tuning; task pipeline.yaml can override.
  - assumption: Dismissed concerns stay dismissed on severity escalation but appear
      as escalated notes in digest and architect hydration.
    disposition: human-awareness
    why: Surfaces the hidden-escalation tradeoff to the operator without
      auto-reopening triaged work.
techDebt:
  - category: adjacent
    description: Pre-existing head-guard failures when TMPDIR sits under
      .factory-runtime because step-runner splits on /.factory. Baseline red;
      green with TMPDIR=/tmp. Out of scope.
    id: td-tmpdir-split
  - category: impacting
    description: reviewAllowed resolved in two places with non-canonical
      allowedDispositions key and wrong fallback order, so per-agent dismiss
      could fail schema validation.
    id: td-reviewpolicy-divergence
    resolution: "Fix in concerns-contracts: canonical reviewPolicy.default, legacy
      alias, single resolveReviewAllowed(pipeline,agent,isTriager) with
      precedence and dismiss injection used by prompt and schema paths."
  - category: impacting
    description: ADR writer persists only title plus context and PlanAdr lacks
      blocking; human-stop contract drifted from exit-10.
    id: td-adr-md-truncated
    resolution: "Fix in adr-blocking-digest and routing-human-debt: full md with
      decision, consequences, blocking plus preserved exit-10 halt and
      dispositions.md update."
  - category: impacting
    description: human-awareness and human-stop ignored, debt derivation ignores
      routed concerns, status lists digest as blocking.
    id: td-human-debt-gaps
    resolution: "Fix in routing-human-debt and status-state-surface: stop exit-10
      plus blocked, awareness digest with empty blocks, debt from predicate,
      Blocking versus Digest split."
adrs:
  - context: Item steps commit only childWt while concerns/ lives on taskWt; up to 4
      parallel items share taskDir; retries/restarts must not duplicate or lose
      triage.
    decision: Write directly to taskWt/{task}/concerns/ with writeYamlAtomic plus
      runExclusive taskWt mutex, then immediately commit taskWt when concerns/
      or steer/ changed. Distinct fingerprints are distinct files; same
      fingerprint merges without clobbering dismissed/routed/resolved. Restart
      re-reads files idempotently. Implementation gated by spike-saga-commit
      serialization findings.
    id: adr-concern-store-taskwt
    title: Direct taskWt writes with serialized immediate commit
  - context: suggestions[] reuse conflated concern triage with fix-loop, mailbox,
      and plan-approval triggers; review id is free-form; QA must not triage;
      dismiss needs a reason field.
    decision: "Exact-id match (suggestion.id === c-<hash10> or rm-<hash10>) via
      partitionSuggestions splits triage entries from normal findings. Triage
      ids update concerns/ only and are excluded from
      fix-loop/approval/normal-mailbox paths; fix on a concern id routes as fix
      and returns fixRequired once for the owning item; human-async on a concern
      writes a single q-concern-<cid> (normal path skipped). Dismiss requires
      non-empty detail persisted to dismissReason or the step errors. isTriager
      gate allows only reviewer, plan-reviewer, and close-up/architect chain.
      Reviewer ordering: aggregate new concerns[] first, then triage only
      pre-existing ids from concernsYaml (no same-step self-dismiss)."
    id: adr-triage-suggestions-dismiss
    title: Partitioned exact-id triage with gate
  - context: derive/* must stay pure; debt routing invented an invalid tech-debt
      disposition; consult writes need exactly-once; mailbox needs dedup.
    decision: "Pure derive: derive/task.ts collectRoutedBlockers(taskDir) reads
      routed kind==blocker affects into a Set passed to deriveWave/deriveItem
      and scheduler.blockedByConcern(items, concernBlocked) which reuses the
      blockedByFailure fixpoint pattern, unions with failure-blocked, and
      cascades only over declared deps. Debt predicate: (kind==tech-debt &&
      status routed/resolved) OR (disposition==optional && status routed); no
      tech-debt disposition exists. Act phase (triage writeArtifact plus
      wave-act newly-blocked check) writes decisions/concern-<cid>.yaml exactly
      once, idempotent on restart, and extends buildArchitectHydration with
      concernsYaml."
    id: adr-routing-derived-state
    title: Pure derive plus exactly-once act routing
  - context: Digest must reuse the mailbox without blocking, halting, or spamming
      status; classify handles operator answers, not blocking.
    decision: Digest entries are steer/tousertoreview entries with disposition
      human-awareness and blocks:[]. derive/task splits openSteerQuestions into
      blocking (blocks.length>0) versus digest (awareness plus empty blocks);
      classify only routes answers/directives/stop; status renders separate
      Blocking versus Digest sections.
    id: adr-digest-mailbox
    title: Digest as filtered non-blocking mailbox view
  - context: Spec needs autonomous/principal/detailed presets plus raise allowlist
      and severity thresholds; pipeline root is closed.
    decision: "Top-level PipelineConfig.humanInvolvement (default autonomous) plus
      PipelineConfig.concerns {raiseAllowlist?, minDigestSeverity?,
      minBlockingSeverity?}. Blocking table: autonomous blocks only on blocking
      ADR or high human-stop; principal adds human-async and high severity;
      detailed adds all human-*. Thresholds gate blocking versus digest
      placement. Criteria fragment agents/criteria/human-involvement.md carries
      the table tersely."
    id: adr-humaninvolvement-config
    title: Modes plus raise and severity config
  - context: Funnel requires less detail per level and never more text than code
      summarized, with falsifiable checks and no empty digest on zero-diff
      steps.
    decision: "Per-level UTF-8 byte caps on hydrated promptVars only (stored
      artifacts never truncated): code steps cap min(diffBytes,2000) where diff
      is item diff for review triage and wave aggregated diff for close-ups;
      zero-diff orchestration steps cap min(inputBytes,500) where input is
      plan/context bytes. Reviewer/architect/close-up prompts require condensing
      with output bytes < input bytes. Engine truncates only the hydrated var."
    id: adr-funnel-text-budget
    title: Per-level hydration byte caps
  - context: PipelineConfig type says {default,[agent]} but flows read
      .allowedDispositions as if global; precedence and dismiss injection are
      undefined.
    decision: "Canonical key is reviewPolicy.default with legacy
      reviewPolicy.allowedDispositions as a one-iteration read-alias. Single
      owner src/core/review-policy.ts resolveReviewAllowed(pipeline, agent,
      isTriager): precedence per-agent array > default > builtin
      [fix,optional,architect,human-awareness,human-async]; when isTriager is
      true append dismiss if absent; QA and other non-triagers never receive
      dismiss. Used by both prompt criteria and generateReviewSchema."
    id: adr-reviewpolicy-canonical
    title: Canonical reviewPolicy with triager injection
  - context: Hashing detail/severity duplicates on rewording; excluding them hides
      severity escalation on dismissed concerns.
    decision: "Stable id c-{sha1-10} over {kind, normalizedSummary, location,
      sortedAffects} excluding detail and severity. Normalization trims,
      collapses whitespace, lowercases summary. Re-emit merges: detail keeps
      longer/latest, severity keeps max, updatedAt and source.lastSeen advance,
      never changes dismissed/routed/resolved except via triage or close-up
      resolution. If re-emit severity exceeds stored severity, set
      source.escalated=true and surface the escalation in digest and architect
      hydration without reopening; architect may reopen via close-up
      resolution."
    id: adr-fingerprint-merge
    title: Fingerprint identity, merge, escalation surfacing
  - context: Close-up schemas are closed, wave-close-up has no reviewer, stored
      statuses have no pending, and simple items have no reviewer.
    decision: "Add concernResolutions?: [{id, action: resolve|carry|propagate,
      note?}] plus concerns[]/remarkable[] producer fields to wave/plan-closeup
      schemas and StoredConcern.pendingResolution?: {action,note,by,at}.
      Wave-close-up proposes via applyCloseupResolutions (status stays routed,
      pending set); architect-wave-report confirms via concernConfirms?: [{id,
      confirm: accept|reject, note?}] applying resolved/routed/propagated or
      clearing pending. Propagate targets parent concerns/ copy for epics or
      human digest for task-level unless elevated to blocking ADR. Simple-item
      fallback at wave-close-up: kind tech-debt auto-routes to disposition
      optional (debt), all other kinds to architect (carry); human-* is never
      auto-routed."
    id: adr-closeup-retriage
    title: Close-up pending resolution and simple fallback
  - context: Remarkable {chosen,alternatives,why} needs one authoritative store and
      the same triage vocabulary.
    decision: Authoritative store is concerns/rm-{hash10}.yaml with
      RemarkableDecision plus status and source. Triaged with suggestions[]
      dismiss vocabulary via exact-id match under the same partition and gate.
      Routed remarkables go digest-only unless elevated to a blocking ADR.
    id: adr-remarkable-store
    title: Remarkable decisions in rm- files
  - context: dispositions.md and ARCHITECTURE 8.7 define human-stop as
      tousertoreview plus exit-10 halt, but item-machine treats it fix-like
      running.
    decision: "Preserve exit-10 halt: human-stop writes a mailbox entry with blocks
      covering affected items plus task when task-level, item-machine maps it to
      blocked terminal, derive marks item and task blocked, and the engine halts
      with exit code 10 at the next mailbox check until answered or dismissed.
      Awareness with blocks:[] never enters blocked sets and never triggers exit
      10. Update dispositions.md and ARCHITECTURE 8.7 to keep the contract
      explicit."
    id: adr-human-stop
    title: Human-stop preserves exit-10 halt
  - context: Derive throws on corrupt triage/plan/steer/decisions while concerns/
      proposes skip; one bad concern could fail a whole step.
    decision: Corrupt concerns/*.yaml files are skipped with a warn and excluded
      from counts because concerns/ is an append-only cache rebuildable from
      committed step records; missing concerns/ yields zero counts. A single
      unknown-kind concern fails its step with no partial aggregate and no
      clobber of existing files, forcing prompt/schema drift to surface via
      retry rather than silent loss.
    id: adr-resilience
    title: Corrupt-skip versus strict-fail resilience
  - context: Spec says every agent output may carry concerns[], but not every schema
      has a producer and reviewer has a dual aggregate-plus-triage role.
    decision: "Producer matrix via a shared concern/remarkable partial: developer,
      fact-finder, qa, poc, test-assumptions, reviewer/plan-reviewer new
      concerns[], architect plan/revise, consult decisions, wave/plan-closeup,
      architect wave-report/closeup. Triage, infra, and pm-edit mechanical
      outputs are explicitly out of scope (no LLM synthesis). Consults aggregate
      via runItemConsult/runNonItemConsult writeArtifact. Reviewer ordering:
      aggregate new concerns first, then triage only pre-existing ids."
    id: adr-producer-matrix
    title: Producer matrix and reviewer ordering


--- Prior Plan plan-1.2.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "artifacts.ts: Concern, RemarkableDecision,
        StoredConcernArtifact(+pendingResolution?, source.escalated?),
        ReviewDisposition+dismiss (no tech-debt), PlanAdr.blocking,
        PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeveri\
        ty,minBlockingSeverity}, reviewPolicy.default canonical"
      - "config/schemas: shared concern/remarkable partial in developer,
        fact-finder, qa, poc, test-assumptions, review newConcerns, plan,
        decisions, wave/plan-closeup, architect reports; triage/infra/pm-edit
        out of scope; dismiss detail-required; closeup concernResolutions"
      - "src/core/concerns.ts: concernFingerprint(identity),
        aggregateConcerns(merge+escalated), listOpenConcerns,
        applyConcernTriage(exact-id,isTriager), applyCloseupResolutions,
        partitionSuggestions(triage vs findings)"
      - "src/core/review-policy.ts:
        resolveReviewAllowed(pipeline,agent,isTriager)
        per-agent>default>builtin, legacy allowedDispositions alias, dismiss
        auto-append for triagers; generateReviewSchema uses it; taskWt
        runExclusive+atomic+immediate-commit helper"
    id: m1-contracts-aggregate
    scenarios:
      - Given a developer step emitting a blocker concern When the step commits
        Then concerns/c-<fp10>.yaml exists with status open and source.record
        pointing at the step record
      - Given the same concern re-emitted on retry When aggregation runs Then
        exactly one file exists, prior dismissed/routed preserved,
        updatedAt/lastSeen advance
      - Given a concern missing severity and detail When validation runs Then
        severity defaults to medium, detail defaults to summary, and the file is
        created
      - Given a concern with unknown kind When validation runs Then the step
        errors, no concerns file is written, existing files stay untouched
      - Given developer, fact-finder, qa, poc, review-new, plan, consult,
        closeup, and architect-report outputs carrying concerns[]+remarkable[]
        When steps commit Then each aggregates to concerns/c-*.yaml or rm-*.yaml
        with open status and source pointer; triage/infra/pm-edit carry none
      - Given reviewer output with new concerns[] plus suggestions triaging a
        pre-existing id When the step commits Then the new concern aggregates
        open and only the pre-existing id is triaged (no same-step self-dismiss)
      - Given reviewPolicy.default [fix,optional] plus reviewer override
        [fix,optional,architect] When resolveReviewAllowed runs Then reviewer
        triager gets override+dismiss and QA non-triager gets default without
        dismiss
      - Given a dismissed concern re-emitted with higher severity When merge
        runs Then status stays dismissed but source.escalated=true and the
        escalation appears in digest and architect hydration
    title: Contracts and aggregation foundation
  - directionalInterfaces:
      - "prompt-vars KNOWN_VARS+descriptions: concernsYaml in steps/review,
        steps/plan-review, steps/wave-close-up, steps/plan-close-up,
        architect-plan, architect-wave-report, architect-closeup,
        architect-consult-*; humanInvolvementCriteria in review, plan-review,
        architect-*"
      - item-machine review + iteration plan-review promptVars and writeArtifact
        with isTriager gate, partitionSuggestions excluding triage ids from
        fix-loop/approval/normal mailbox, fix-on-concern fixRequired once,
        mailbox dedup q-concern-<cid>
      - agents reviewer, plan-reviewer, criteria/dispositions,
        criteria/human-involvement terse confirm/dismiss/condense plus blocking
        table plus condensing rule output-bytes<input-bytes
      - config/pipeline.default.yaml commented autonomous/principal/detailed
        presets with blocking table plus concerns raise/threshold examples
    id: m2-triage-modes
    scenarios:
      - Given open item concerns When review runs Then steps/review receives
        concernsYaml with id/kind/severity/summary/affects and terse triage
        instructions
      - Given reviewer suggestion matching a concern id with disposition dismiss
        and detail When review commits Then that file has status dismissed plus
        dismissReason=detail and no mailbox, debt, blocked, or approval effect
      - Given a matching dismiss suggestion without detail When review commits
        Then the step errors and no triage is persisted
      - Given QA emitting a matching concern id When QA commits Then no triage
        is applied and the file stays open
      - Given matching suggestions with fix, optional, architect, or human-*
        When review commits Then each file becomes routed with disposition
        persisted; triage ids are excluded from normal fix-loop/approval/mailbox
        except fix-on-concern sets fixRequired once; human-async on a concern
        writes a single q-concern-<cid>
      - Given architect plan concerns plus an rm-* file When plan-review runs
        Then plan-reviewer triages with the same vocabulary and non-dismissed
        files become routed; debt predicate is kind==tech-debt&&routed or
        disposition==optional (no tech-debt disposition)
      - Given pipeline.yaml humanInvolvement principal When reviewer and
        architect prompts render Then the mode criteria fragment is included and
        preflightPrompts passes
    title: Reviewer triage and modes
  - directionalInterfaces:
      - derive/task.ts collectRoutedBlockers(taskDir)->Set plus
        deriveWave/deriveItem integration;
        scheduler.blockedByConcern(items,concernBlocked) pure reusing
        blockedByFailure fixpoint, unioned, cascade only over declared deps
      - "act-phase routing: triage writeArtifact plus wave-act newly-blocked
        check writing decisions/concern-<cid>.yaml exactly once (restart
        idempotent); buildArchitectHydration extended with concernsYaml digest"
      - steer writeQuestion for human-async/stop/blocking ADR; derive/task
        blocking-vs-digest split (blocks.length>0 vs awareness empty); debt
        predicate; human-stop exit-10 halt plus blocked
    id: m3-routing
    scenarios:
      - Given a routed blocker whose affects names a declared dependent When
        derive runs Then the dependent derives blocked with no writes;
        non-dependents are unaffected and transitive blocking follows declared
        deps only
      - Given a newly blocked dependent When the act phase runs Then exactly one
        decisions/concern-<cid>.yaml is written and a restart writes no second
        file
      - Given a routed architect concern When the next architect turn builds
        hydration Then its concernsYaml input contains that concern id and
        summary
      - Given a routed human-async concern When routing runs Then mailbox
        q-concern-<cid> has blocks=[item], the item derives blocked, and the
        engine continues without exit 10
      - Given a routed human-stop concern When routing runs Then the mailbox
        entry blocks task/item, item and task derive blocked, and the engine
        halts with exit code 10 until answered or dismissed
      - Given a routed human-awareness concern When routing runs Then the
        mailbox entry has blocks=[] in the Digest section and the engine
        continues with no blocked set and no exit 10
      - Given plan ADRs blocking true and false under autonomous mode When plan
        commits Then the blocking ADR creates a mailbox question with blocks
        while the remarkable ADR appears only in the digest; debt includes kind
        tech-debt routed or disposition optional routed as [item] summary
    title: Routing to blocked, architect, mailbox, debt
  - directionalInterfaces:
      - closeup schemas concernResolutions resolve/carry/propagate plus
        concerns[]/remarkable[];
        StoredConcern.pendingResolution{action,note,by,at};
        applyCloseupResolutions proposes (status stays routed); architect
        concernConfirms accept/reject applies; propagate to parent concerns/
        copy or human digest
      - "iteration.ts concernsYaml hydration capped UTF-8 bytes: code steps
        min(diffBytes,2000); zero-diff orchestration min(inputBytes,500);
        reviewer/architect condensing prompts require output<input; engine
        truncates hydrated var only"
      - engine.ts runChildTask propagateEpicConcerns after child completion
        before cleanup/merge, condensed copies with source.epic, parent
        hydration extended; size assert parent-detail<child-detail
      - derive/task.ts toStateArtifact().concerns counts (missing dir zeros,
        corrupt skip+warn); cli/status.ts Concerns plus separate Blocking vs
        Digest sections
    id: m4-funnel-surface
    replanAfter: true
    scenarios:
      - Given wave diff 5000 bytes and open concerns 3000 bytes When
        wave-close-up hydrates Then concernsYaml is <=2000 bytes and < wave diff
        in UTF-8 bytes
      - Given zero-diff plan-review with 4000-byte input When hydrating Then
        concernsYaml is <=500 bytes and < input bytes
      - Given wave-close-up emitting concernResolutions resolve/carry/propagate
        When it commits Then files stay routed with pendingResolution set;
        architect accept applies resolved/routed/propagated and reject clears
        pending
      - Given a simple item with open concerns and no reviewer When
        wave-close-up runs Then explicit resolutions triage them; fallback
        auto-routes kind tech-debt to optional (debt) and other kinds to
        architect (carry); human-* is never auto-routed
      - Given a child epic finishing with one dismissed and one open concern
        with 800-byte detail When runChildTask completes before cleanup Then the
        parent gains exactly one condensed copy with source.epic, detail <800
        bytes, hydrating saga architect concernsYaml
      - Given mixed-status concerns plus a corrupt yaml file When state
        refreshes and factory status runs Then state.yaml counts skip the
        corrupt file with warn, missing dir yields zeros, and CLI shows Concerns
        plus Blocking vs Digest sections
    title: Funnel, close-ups, saga, surfacing
  - directionalInterfaces:
      - docs/ARCHITECTURE.md §1 row 18 + §6.2 concerns/ + §8
        funnel/routing/modes/partition/producer-matrix/resilience/exit-10,
        README.md, config commentary, agents/criteria/dispositions.md human-stop
        exit-10 preserved
      - "fragment matrix (8 fragments) + debloat check: each fragment ≤15 lines,
        total growth ≤60 lines, preflight plus line-count assertion in
        prompts.test"
    id: m5-docs
    scenarios:
      - Given implementation complete When docs are read Then ARCHITECTURE,
        README, config commentary, and dispositions describe concerns lifecycle,
        funnel sizes, partition, producer matrix, exit-10, modes, and counts
        with terse prompts
      - Given prompt fragments When prompts.test runs Then KNOWN_VARS plus
        descriptions cover all 8 fragments and added lines respect ≤15/≤60
        budgets
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    title: Docs and suite consolidation
uncertainties:
  - description: Funnel byte budget per-level sources, zero-diff rule, and
      bytes-vs-chars unit needed before close-up hydration.
    id: u-text-budget
    spikeOutlines:
      - test-assumptions spike-text-budget verifies code min(diff,2000) and
        zero-diff min(input,500) UTF-8 bytes with output<input condensing
  - description: Epic propagation timing plus taskWt serialization/restart behavior
      and pure-derive versus act-phase boundary needed before store, blocker
      derive, and saga propagation.
    id: u-saga-propagation
    spikeOutlines:
      - fact-finder spike-saga-commit verifies parent-copy timing, runExclusive
        serialization, immediate commit idempotency, collectRoutedBlockers
        owner, and hydration seam
itemOutlines:
  - deps: []
    description: "test-assumptions: measure item/wave diff bytes vs concern detail
      sizes; confirm per-level caps code min(diff,2000) and zero-diff
      min(input,500) UTF-8 bytes, condensing output<input, no 500-floor
      violation. Finding record only, no prod code; gates funnel-closeups."
    kind: test-assumptions
    milestoneId: m1-contracts-aggregate
    slug: spike-text-budget
    title: "Spike: funnel byte budget"
  - deps: []
    description: "fact-finder: verify runChildTask copy timing before cleanup/merge,
      parent buildArchitectHydration extension point, taskWt runExclusive
      serialization under 4 parallel items, immediate commit plus restart
      idempotency, pure-derive vs act-phase boundary with collectRoutedBlockers
      owner. Finding only; gates concerns-store, routing-blocker-derive,
      saga-propagate."
    kind: fact-finder
    milestoneId: m1-contracts-aggregate
    slug: spike-saga-commit
    title: "Spike: saga propagation, commit, derive boundary"
  - deps: []
    description: "Types plus schemas for producer matrix (developer, fact-finder,
      qa, poc, test-assumptions, review newConcerns, plan, decisions,
      wave/plan-closeup with concernResolutions, architect reports) via shared
      partial; triage/infra/pm-edit out of scope. Canonical
      reviewPolicy.default, legacy alias,
      resolveReviewAllowed(pipeline,agent,isTriager) precedence plus dismiss
      injection, generateReviewSchema, dismiss detail-required, pipeline
      humanInvolvement plus concerns thresholds. Tests: typecheck, preflight,
      repair defaults vs strict reject unknown kind."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts
    title: Concern contracts and canonical review policy
  - deps:
      - concerns-contracts-policy
      - concerns-contracts-schemas
      - concerns-contracts-types
    description: Implement src/core/concerns.ts (fingerprint identity,
      merge+escalated, aggregate/list/triage/closeup/partition, atomic YAML +
      KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll, restart
      idempotent). NEVER wrap commitAll in repo.writeLock.runExclusive
      (deadlock). Explicit taskWt path, one file per fingerprint, concerns/**
      startup recovery + reconcileConcerns from committed records (derive
      read-only), ingest errors must not change step status. Wire all producer
      seams incl consult writeArtifact; reviewer aggregates new then triages
      pre-existing only. Spike-saga-commit findings authoritative (no re-run).
      Behavior tests in test/engine/concerns-funnel.test.ts. Run TMPDIR=/tmp bun
      test.
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-store
    title: Concerns store with merge and commit
  - deps:
      - concerns-store
    description: "Item reviewer triage with concernsYaml in steps/review, isTriager
      gate, exact-id partition excluding triage ids from
      fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox
      dedup q-concern-<cid>, dismiss detail to dismissReason, condensing
      output<input, debt predicate without tech-debt disposition. Behavior
      tests: dismiss no routing, routed persist, QA gate no-op, missing detail
      errors, fix-once, no double mailbox."
    kind: story
    milestoneId: m2-triage-modes
    slug: reviewer-triage
    title: Workhorse reviewer triage
  - deps:
      - concerns-store
    description: "Architect path: aggregate plan/revise concerns plus remarkable
      rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition
      and dismiss vocabulary, non-dismissed become routed. Behavior tests:
      dismissed vs routed, rm-* triaged, debt predicate, no approval trigger
      from triage ids."
    kind: story
    milestoneId: m2-triage-modes
    slug: plan-reviewer-triage
    title: Plan-reviewer triage
  - deps:
      - concerns-contracts-policy
      - concerns-contracts-schemas
      - concerns-contracts-types
    description: "humanInvolvement + concerns thresholds schema/loader/merge,
      commented autonomous/principal/detailed presets with blocking table,
      agents/criteria/human-involvement.md terse fragment, KNOWN_VARS
      concernsYaml + humanInvolvementCriteria wired per fragment matrix.
      Behavior: mode switch changes criteria and blocking-ADR behavior;
      preflight green. Precedes all routing."
    kind: story
    milestoneId: m2-triage-modes
    slug: modes-prompts
    title: Modes, thresholds, prompt wiring
  - deps:
      - modes-prompts
      - plan-reviewer-triage
      - reviewer-triage
    description: "Pure derive only: derive/task.ts
      collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration
      (thread blockedBy into deriveItemState or post-process before every
      deriveWaveState call), scheduler.blockedByConcern reusing fixpoint, union
      with failure-blocked, cascade only declared deps, no writes. Spike
      findings authoritative. Behavior: dependent blocked, non-dep unaffected,
      transitive via deps only."
    escalate: true
    kind: story
    milestoneId: m3-routing
    slug: routing-blocker-derive
    title: Blocker derive
  - deps:
      - modes-prompts
      - routing-blocker-derive
    description: "Act phase only: wave-act newly-blocked check writes
      decisions/concern-<cid>.yaml exactly once (restart idempotent) plus
      buildArchitectHydration concernsYaml extension for wave-report/next-plan.
      Behavior tests: single consult file, restart no duplicate, architect input
      contains id+summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-architect-consult
    title: Architect consult and hydration
  - deps:
      - reviewer-triage
      - modes-prompts
    description: "human-async blocks [item] and continues, human-stop blocks
      task/item plus exit-10 halt plus blocked derive, awareness blocks []
      digest never blocking/exiting, debt predicate kind tech-debt routed or
      disposition optional routed. Behavior tests: mailbox files per
      disposition, exit 10 on stop, awareness continues, debt includes [item]
      summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-human-debt
    title: Human mailbox and debt routing
  - deps:
      - modes-prompts
      - routing-human-debt
    description: "Full ADR md title/context/decision/consequences/blocking, blocking
      routed per mode table with exit-10 when stop, remarkable digest-only never
      waiting, dispositions.md exit-10 preserved. Behavior tests: blocking
      mailbox+blocks, remarkable digest only."
    kind: story
    milestoneId: m3-routing
    slug: adr-blocking-digest
    title: Blocking vs remarkable ADRs
  - deps:
      - adr-blocking-digest
      - routing-architect-consult
      - spike-text-budget
    description: "Hydrate wave/plan-close-up and architect reports with concernsYaml
      capped per spike (code min(diff,2000), zero-diff min(input,500) UTF-8
      bytes, output<input), concernResolutions pending + architect
      concernConfirms accept/reject, propagate to parent/digest, simple-item
      explicit + auto-route fallback (tech-debt->optional, others->architect,
      human-* never auto). Apply spike nits: cross-check diffs via production
      git() wrapper, add many-concerns 2000B truncation case, clarify trim
      semantics. Behavior: byte budgets, pending/confirm, simple fallback."
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: funnel-closeups
    title: Funnel close-ups and simple triage
  - deps:
      - routing-architect-consult
    description: "runChildTask propagateEpicConcerns: after child completion before
      cleanup/merge (engine.ts:246-274) for every child status, condensed parent
      copies source.epic with parent detail < child, extended parent
      concernsYaml hydration (append LAST, recompute before wave-report);
      forward child human questions to root mailbox. Spike findings
      authoritative. Behavior: one copy, dismissed stays local, saga input
      contains id."
    escalate: true
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: saga-propagate
    title: Epic to saga propagation
  - deps:
      - concerns-store
      - routing-human-debt
    description: "Sole owner StateArtifact.concerns
      {open,dismissed,routed,resolved}, state.schema,
      toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI
      Concerns plus Blocking vs Digest. Behavior tests: counts, missing/corrupt,
      CLI sections."
    kind: story
    milestoneId: m4-funnel-surface
    slug: status-state-surface
    title: State counts and status surfacing
  - deps:
      - funnel-closeups
      - modes-prompts
      - saga-propagate
      - status-state-surface
    description: "Update ARCHITECTURE section 1 row 18 plus 6.2 plus 8, README,
      config commentary, dispositions.md; fragment matrix plus 15/60 debloat
      check; consolidate test/engine/concerns-funnel.test.ts plus steer/CLI
      coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test."
    kind: story
    milestoneId: m5-docs
    slug: docs-finish
    title: Docs and suite consolidation
  - deps: []
    description: "Types only. In src/core/artifacts.ts add
      Concern/ConcernKind/ConcernSeverity/ConcernStatus, RemarkableDecision,
      StoredConcernArtifact (+pendingResolution?, source.escalated?),
      ReviewDisposition+dismiss (no tech-debt value), PlanAdr.blocking,
      PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeverity\
      ,minBlockingSeverity}, reviewPolicy.default canonical + legacy
      allowedDispositions alias in type. No JSON, no runtime, no repair
      (deferred to concerns-store). Verify: bun run typecheck. Prod budget <=80
      lines."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-types
    title: Concern artifact types
  - deps:
      - concerns-contracts-types
    description: "Schemas only. Inline (no cross-file $ref) shared
      concern/remarkable definitions into developer-output, fact-finder-output,
      qa, poc, test-assumptions, review newConcerns, plan, decisions,
      wave/plan-closeup (+concernResolutions), architect wave-report/closeup;
      triage/infra/pm-edit untouched. severity/detail optional (runtime defaults
      in store); kind strict enum so unknown kind fails validation with no
      write. Dismiss detail-required at runtime, not JSON schema. Verify:
      typecheck + prompts.test preflight + one FakeHarness case in
      test/engine/concerns-funnel.test.ts. Budget <=200 lines JSON."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-schemas
    title: Concern producer schemas
  - deps:
      - concerns-contracts-types
    description: "Resolver only. New src/core/review-policy.ts
      resolveReviewAllowed(pipeline,agent,isTriager): per-agent > default >
      builtin [fix,optional,architect,human-awareness,human-async]; legacy
      allowedDispositions read-alias for default; append dismiss iff isTriager.
      Wire into item-machine review promptVars, step-runner schema path,
      iteration plan-review prompt+schema, generateReviewSchema. QA never
      dismiss. Verify: typecheck + FakeHarness (reviewer accepts dismiss, QA
      rejects). Budget <=100 lines."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-policy
    title: Canonical review-policy resolver
  - deps:
      - concerns-contracts-policy
      - concerns-contracts-schemas
      - concerns-contracts-types
    description: Implement src/core/concerns.ts (fingerprint identity,
      merge+escalated, aggregate/list/triage/closeup/partition, atomic YAML +
      KeyedMutex(taskDir) RMW-only + immediate taskWt commitAll, restart
      idempotent). NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit
      taskWt path, one file per fingerprint, concerns/** recovery +
      reconcileConcerns (derive read-only), ingest errors must not change step
      status. Wire all producer seams incl consult writeArtifact; reviewer
      aggregates new then triages pre-existing only. Spike-saga-commit findings
      authoritative. Behavior tests in test/engine/concerns-funnel.test.ts. Run
      TMPDIR=/tmp bun test.
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-store-v2
    title: Concerns store with merge and commit
  - deps:
      - concerns-contracts-policy
      - concerns-contracts-schemas
      - concerns-contracts-types
    description: "humanInvolvement + concerns thresholds schema/loader/merge,
      commented autonomous/principal/detailed presets with blocking table,
      agents/criteria/human-involvement.md terse fragment, KNOWN_VARS
      concernsYaml + humanInvolvementCriteria per fragment matrix. Behavior:
      mode switch changes criteria and blocking-ADR behavior; preflight green.
      Precedes all routing."
    kind: story
    milestoneId: m2-triage-modes
    slug: modes-prompts-v2
    title: Modes, thresholds, prompt wiring
  - deps:
      - concerns-store-v2
    description: "Item reviewer triage with concernsYaml in steps/review, isTriager
      gate, exact-id partition excluding triage ids from
      fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox
      dedup q-concern-<cid>, dismiss detail to dismissReason, condensing
      output<input, debt predicate (no tech-debt disposition). Behavior: dismiss
      no routing, routed persist, QA no-op, missing detail errors, fix-once, no
      double mailbox."
    kind: story
    milestoneId: m2-triage-modes
    slug: reviewer-triage-v2
    title: Workhorse reviewer triage
  - deps:
      - concerns-store-v2
    description: "Architect path: aggregate plan/revise concerns + remarkable rm-*,
      hydrate steps/plan-review with concernsYaml, same exact-id partition and
      dismiss vocabulary, non-dismissed become routed. Behavior: dismissed vs
      routed, rm-* triaged, debt predicate, no approval trigger from triage
      ids."
    kind: story
    milestoneId: m2-triage-modes
    slug: plan-reviewer-triage-v2
    title: Plan-reviewer triage
  - deps:
      - modes-prompts-v2
      - plan-reviewer-triage-v2
      - reviewer-triage-v2
    description: "Pure derive only: derive/task.ts collectRoutedBlockers +
      deriveWave/deriveItem integration (thread blockedBy into deriveItemState
      or post-process before every deriveWaveState call),
      scheduler.blockedByConcern reusing fixpoint, union with failure-blocked,
      cascade only declared deps, no writes. Spike findings authoritative.
      Behavior: dependent blocked, non-dep unaffected, transitive via deps
      only."
    escalate: true
    kind: story
    milestoneId: m3-routing
    slug: routing-blocker-derive-v2
    title: Blocker derive
  - deps:
      - modes-prompts-v2
      - reviewer-triage-v2
    description: "human-async blocks [item] and continues, human-stop blocks
      task/item + exit-10 halt + blocked derive, awareness blocks [] digest
      never blocking/exiting, debt predicate kind tech-debt routed or
      disposition optional routed. Behavior: mailbox files per disposition, exit
      10 on stop, awareness continues, debt includes [item] summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-human-debt-v2
    title: Human mailbox and debt routing
  - deps:
      - modes-prompts-v2
      - routing-blocker-derive-v2
    description: "Act phase only: wave-act newly-blocked check writes
      decisions/concern-<cid>.yaml exactly once (restart idempotent) +
      buildArchitectHydration concernsYaml extension for wave-report/next-plan.
      Behavior: single consult file, restart no duplicate, architect input
      contains id+summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-architect-consult-v2
    title: Architect consult and hydration
  - deps:
      - modes-prompts-v2
      - routing-human-debt-v2
    description: "Full ADR md title/context/decision/consequences/blocking, blocking
      routed per mode table with exit-10 when stop, remarkable digest-only never
      waiting, dispositions.md exit-10 preserved. Behavior: blocking
      mailbox+blocks, remarkable digest only."
    kind: story
    milestoneId: m3-routing
    slug: adr-blocking-digest-v2
    title: Blocking vs remarkable ADRs
  - deps:
      - concerns-store-v2
      - routing-human-debt-v2
    description: "Sole owner StateArtifact.concerns
      {open,dismissed,routed,resolved}, state.schema,
      toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI
      Concerns plus Blocking vs Digest. Behavior: counts, missing/corrupt, CLI
      sections."
    kind: story
    milestoneId: m4-funnel-surface
    slug: status-state-surface-v2
    title: State counts and status surfacing
  - deps:
      - adr-blocking-digest-v2
      - routing-architect-consult-v2
      - spike-text-budget
    description: "Hydrate wave/plan-close-up and architect reports with concernsYaml
      capped per spike (code min(diff,2000), zero-diff min(input,500) UTF-8
      bytes, output<input), concernResolutions pending + architect
      concernConfirms accept/reject, propagate to parent/digest, simple-item
      explicit + auto-route fallback (tech-debt->optional, others->architect,
      human-* never auto). Spike nits: production git() wrapper, many-concerns
      2000B case, trim semantics. Behavior: byte budgets, pending/confirm,
      simple fallback."
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: funnel-closeups-v2
    title: Funnel close-ups and simple triage
  - deps:
      - routing-architect-consult-v2
    description: "runChildTask propagateEpicConcerns after child completion before
      cleanup/merge (engine.ts:246-274) for every child status, condensed parent
      copies source.epic with parent detail < child, extended parent
      concernsYaml hydration (append LAST, recompute before wave-report);
      forward child human questions to root mailbox. Spike findings
      authoritative. Behavior: one copy, dismissed stays local, saga input
      contains id."
    escalate: true
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: saga-propagate-v2
    title: Epic to saga propagation
  - deps:
      - funnel-closeups-v2
      - modes-prompts-v2
      - saga-propagate-v2
      - status-state-surface-v2
    description: "Update ARCHITECTURE section 1 row 18 + 6.2 + 8, README, config
      commentary, dispositions.md; fragment matrix + 15/60 debloat check;
      consolidate test/engine/concerns-funnel.test.ts + steer/CLI coverage.
      Final gates: bun run typecheck and TMPDIR=/tmp bun test."
    kind: story
    milestoneId: m5-docs
    slug: docs-finish-v2
    title: Docs and suite consolidation
assumptions:
  - assumption: Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures
      do not mask regressions.
    why: Baseline red only under .factory-runtime TMPDIR; suite green with
      TMPDIR=/tmp. Out of scope.
  - assumption: Concern identity excludes detail and severity per
      adr-fingerprint-merge; reworded detail merges and severity escalations
      surface via escalated flag without reopening.
    why: Prevents trivial-reword duplicates while keeping escalation visible to
      architect and digest.
  - assumption: buildArchitectHydration does not read parent concerns/ today;
      saga-propagate extends it with concernsYaml, and runChildTask copies
      condensed epic concerns to parent concerns/ after child completion but
      before cleanup/merge per spike-saga-commit.
    why: Corrects the prior hydration assumption; defines the copy timing and seam
      the spike must verify.
  - assumption: Per-mode blocking table in adr-humaninvolvement-config is
      authoritative for iteration 1; raise allowlist defaults to all agents.
    why: Unblocks routing without operator tuning; task pipeline.yaml can override.
  - assumption: Dismissed concerns stay dismissed on severity escalation but appear
      as escalated notes in digest and architect hydration.
    disposition: human-awareness
    why: Surfaces the hidden-escalation tradeoff to the operator without
      auto-reopening triaged work.
techDebt:
  - category: adjacent
    description: Pre-existing head-guard failures when TMPDIR sits under
      .factory-runtime because step-runner splits on /.factory. Baseline red;
      green with TMPDIR=/tmp. Out of scope.
    id: td-tmpdir-split
  - category: impacting
    description: reviewAllowed resolved in two places with non-canonical
      allowedDispositions key and wrong fallback order, so per-agent dismiss
      could fail schema validation.
    id: td-reviewpolicy-divergence
    resolution: "Fix in concerns-contracts: canonical reviewPolicy.default, legacy
      alias, single resolveReviewAllowed(pipeline,agent,isTriager) with
      precedence and dismiss injection used by prompt and schema paths."
  - category: impacting
    description: ADR writer persists only title plus context and PlanAdr lacks
      blocking; human-stop contract drifted from exit-10.
    id: td-adr-md-truncated
    resolution: "Fix in adr-blocking-digest and routing-human-debt: full md with
      decision, consequences, blocking plus preserved exit-10 halt and
      dispositions.md update."
  - category: impacting
    description: human-awareness and human-stop ignored, debt derivation ignores
      routed concerns, status lists digest as blocking.
    id: td-human-debt-gaps
    resolution: "Fix in routing-human-debt and status-state-surface: stop exit-10
      plus blocked, awareness digest with empty blocks, debt from predicate,
      Blocking versus Digest split."
adrs:
  - context: Item steps commit only childWt while concerns/ lives on taskWt; up to 4
      parallel items share taskDir; retries/restarts must not duplicate or lose
      triage.
    decision: Write directly to taskWt/{task}/concerns/ with writeYamlAtomic plus
      runExclusive taskWt mutex, then immediately commit taskWt when concerns/
      or steer/ changed. Distinct fingerprints are distinct files; same
      fingerprint merges without clobbering dismissed/routed/resolved. Restart
      re-reads files idempotently. Implementation gated by spike-saga-commit
      serialization findings.
    id: adr-concern-store-taskwt
    title: Direct taskWt writes with serialized immediate commit
  - context: suggestions[] reuse conflated concern triage with fix-loop, mailbox,
      and plan-approval triggers; review id is free-form; QA must not triage;
      dismiss needs a reason field.
    decision: "Exact-id match (suggestion.id === c-<hash10> or rm-<hash10>) via
      partitionSuggestions splits triage entries from normal findings. Triage
      ids update concerns/ only and are excluded from
      fix-loop/approval/normal-mailbox paths; fix on a concern id routes as fix
      and returns fixRequired once for the owning item; human-async on a concern
      writes a single q-concern-<cid> (normal path skipped). Dismiss requires
      non-empty detail persisted to dismissReason or the step errors. isTriager
      gate allows only reviewer, plan-reviewer, and close-up/architect chain.
      Reviewer ordering: aggregate new concerns[] first, then triage only
      pre-existing ids from concernsYaml (no same-step self-dismiss)."
    id: adr-triage-suggestions-dismiss
    title: Partitioned exact-id triage with gate
  - context: derive/* must stay pure; debt routing invented an invalid tech-debt
      disposition; consult writes need exactly-once; mailbox needs dedup.
    decision: "Pure derive: derive/task.ts collectRoutedBlockers(taskDir) reads
      routed kind==blocker affects into a Set passed to deriveWave/deriveItem
      and scheduler.blockedByConcern(items, concernBlocked) which reuses the
      blockedByFailure fixpoint pattern, unions with failure-blocked, and
      cascades only over declared deps. Debt predicate: (kind==tech-debt &&
      status routed/resolved) OR (disposition==optional && status routed); no
      tech-debt disposition exists. Act phase (triage writeArtifact plus
      wave-act newly-blocked check) writes decisions/concern-<cid>.yaml exactly
      once, idempotent on restart, and extends buildArchitectHydration with
      concernsYaml."
    id: adr-routing-derived-state
    title: Pure derive plus exactly-once act routing
  - context: Digest must reuse the mailbox without blocking, halting, or spamming
      status; classify handles operator answers, not blocking.
    decision: Digest entries are steer/tousertoreview entries with disposition
      human-awareness and blocks:[]. derive/task splits openSteerQuestions into
      blocking (blocks.length>0) versus digest (awareness plus empty blocks);
      classify only routes answers/directives/stop; status renders separate
      Blocking versus Digest sections.
    id: adr-digest-mailbox
    title: Digest as filtered non-blocking mailbox view
  - context: Spec needs autonomous/principal/detailed presets plus raise allowlist
      and severity thresholds; pipeline root is closed.
    decision: "Top-level PipelineConfig.humanInvolvement (default autonomous) plus
      PipelineConfig.concerns {raiseAllowlist?, minDigestSeverity?,
      minBlockingSeverity?}. Blocking table: autonomous blocks only on blocking
      ADR or high human-stop; principal adds human-async and high severity;
      detailed adds all human-*. Thresholds gate blocking versus digest
      placement. Criteria fragment agents/criteria/human-involvement.md carries
      the table tersely."
    id: adr-humaninvolvement-config
    title: Modes plus raise and severity config
  - context: Funnel requires less detail per level and never more text than code
      summarized, with falsifiable checks and no empty digest on zero-diff
      steps.
    decision: "Per-level UTF-8 byte caps on hydrated promptVars only (stored
      artifacts never truncated): code steps cap min(diffBytes,2000) where diff
      is item diff for review triage and wave aggregated diff for close-ups;
      zero-diff orchestration steps cap min(inputBytes,500) where input is
      plan/context bytes. Reviewer/architect/close-up prompts require condensing
      with output bytes < input bytes. Engine truncates only the hydrated var."
    id: adr-funnel-text-budget
    title: Per-level hydration byte caps
  - context: PipelineConfig type says {default,[agent]} but flows read
      .allowedDispositions as if global; precedence and dismiss injection are
      undefined.
    decision: "Canonical key is reviewPolicy.default with legacy
      reviewPolicy.allowedDispositions as a one-iteration read-alias. Single
      owner src/core/review-policy.ts resolveReviewAllowed(pipeline, agent,
      isTriager): precedence per-agent array > default > builtin
      [fix,optional,architect,human-awareness,human-async]; when isTriager is
      true append dismiss if absent; QA and other non-triagers never receive
      dismiss. Used by both prompt criteria and generateReviewSchema."
    id: adr-reviewpolicy-canonical
    title: Canonical reviewPolicy with triager injection
  - context: Hashing detail/severity duplicates on rewording; excluding them hides
      severity escalation on dismissed concerns.
    decision: "Stable id c-{sha1-10} over {kind, normalizedSummary, location,
      sortedAffects} excluding detail and severity. Normalization trims,
      collapses whitespace, lowercases summary. Re-emit merges: detail keeps
      longer/latest, severity keeps max, updatedAt and source.lastSeen advance,
      never changes dismissed/routed/resolved except via triage or close-up
      resolution. If re-emit severity exceeds stored severity, set
      source.escalated=true and surface the escalation in digest and architect
      hydration without reopening; architect may reopen via close-up
      resolution."
    id: adr-fingerprint-merge
    title: Fingerprint identity, merge, escalation surfacing
  - context: Close-up schemas are closed, wave-close-up has no reviewer, stored
      statuses have no pending, and simple items have no reviewer.
    decision: "Add concernResolutions?: [{id, action: resolve|carry|propagate,
      note?}] plus concerns[]/remarkable[] producer fields to wave/plan-closeup
      schemas and StoredConcern.pendingResolution?: {action,note,by,at}.
      Wave-close-up proposes via applyCloseupResolutions (status stays routed,
      pending set); architect-wave-report confirms via concernConfirms?: [{id,
      confirm: accept|reject, note?}] applying resolved/routed/propagated or
      clearing pending. Propagate targets parent concerns/ copy for epics or
      human digest for task-level unless elevated to blocking ADR. Simple-item
      fallback at wave-close-up: kind tech-debt auto-routes to disposition
      optional (debt), all other kinds to architect (carry); human-* is never
      auto-routed."
    id: adr-closeup-retriage
    title: Close-up pending resolution and simple fallback
  - context: Remarkable {chosen,alternatives,why} needs one authoritative store and
      the same triage vocabulary.
    decision: Authoritative store is concerns/rm-{hash10}.yaml with
      RemarkableDecision plus status and source. Triaged with suggestions[]
      dismiss vocabulary via exact-id match under the same partition and gate.
      Routed remarkables go digest-only unless elevated to a blocking ADR.
    id: adr-remarkable-store
    title: Remarkable decisions in rm- files
  - context: dispositions.md and ARCHITECTURE 8.7 define human-stop as
      tousertoreview plus exit-10 halt, but item-machine treats it fix-like
      running.
    decision: "Preserve exit-10 halt: human-stop writes a mailbox entry with blocks
      covering affected items plus task when task-level, item-machine maps it to
      blocked terminal, derive marks item and task blocked, and the engine halts
      with exit code 10 at the next mailbox check until answered or dismissed.
      Awareness with blocks:[] never enters blocked sets and never triggers exit
      10. Update dispositions.md and ARCHITECTURE 8.7 to keep the contract
      explicit."
    id: adr-human-stop
    title: Human-stop preserves exit-10 halt
  - context: Derive throws on corrupt triage/plan/steer/decisions while concerns/
      proposes skip; one bad concern could fail a whole step.
    decision: Corrupt concerns/*.yaml files are skipped with a warn and excluded
      from counts because concerns/ is an append-only cache rebuildable from
      committed step records; missing concerns/ yields zero counts. A single
      unknown-kind concern fails its step with no partial aggregate and no
      clobber of existing files, forcing prompt/schema drift to surface via
      retry rather than silent loss.
    id: adr-resilience
    title: Corrupt-skip versus strict-fail resilience
  - context: Spec says every agent output may carry concerns[], but not every schema
      has a producer and reviewer has a dual aggregate-plus-triage role.
    decision: "Producer matrix via a shared concern/remarkable partial: developer,
      fact-finder, qa, poc, test-assumptions, reviewer/plan-reviewer new
      concerns[], architect plan/revise, consult decisions, wave/plan-closeup,
      architect wave-report/closeup. Triage, infra, and pm-edit mechanical
      outputs are explicitly out of scope (no LLM synthesis). Consults aggregate
      via runItemConsult/runNonItemConsult writeArtifact. Reviewer ordering:
      aggregate new concerns first, then triage only pre-existing ids."
    id: adr-producer-matrix
    title: Producer matrix and reviewer ordering


--- Prior Plan plan-1.3.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "artifacts.ts: Concern, RemarkableDecision,
        StoredConcernArtifact(+pendingResolution?, source.escalated?),
        ReviewDisposition+dismiss (no tech-debt), PlanAdr.blocking,
        PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeveri\
        ty,minBlockingSeverity}, reviewPolicy.default canonical"
      - "config/schemas: shared concern/remarkable partial in developer,
        fact-finder, qa, poc, test-assumptions, review newConcerns, plan,
        decisions, wave/plan-closeup, architect reports; triage/infra/pm-edit
        out of scope; dismiss detail-required; closeup concernResolutions"
      - "src/core/concerns.ts: concernFingerprint(identity),
        aggregateConcerns(merge+escalated), listOpenConcerns,
        applyConcernTriage(exact-id,isTriager), applyCloseupResolutions,
        partitionSuggestions(triage vs findings)"
      - "src/core/review-policy.ts:
        resolveReviewAllowed(pipeline,agent,isTriager)
        per-agent>default>builtin, legacy allowedDispositions alias, dismiss
        auto-append for triagers; generateReviewSchema uses it; taskWt
        runExclusive+atomic+immediate-commit helper"
    id: m1-contracts-aggregate
    scenarios:
      - Given a developer step emitting a blocker concern When the step commits
        Then concerns/c-<fp10>.yaml exists with status open and source.record
        pointing at the step record
      - Given the same concern re-emitted on retry When aggregation runs Then
        exactly one file exists, prior dismissed/routed preserved,
        updatedAt/lastSeen advance
      - Given a concern missing severity and detail When validation runs Then
        severity defaults to medium, detail defaults to summary, and the file is
        created
      - Given a concern with unknown kind When validation runs Then the step
        errors, no concerns file is written, existing files stay untouched
      - Given developer, fact-finder, qa, poc, review-new, plan, consult,
        closeup, and architect-report outputs carrying concerns[]+remarkable[]
        When steps commit Then each aggregates to concerns/c-*.yaml or rm-*.yaml
        with open status and source pointer; triage/infra/pm-edit carry none
      - Given reviewer output with new concerns[] plus suggestions triaging a
        pre-existing id When the step commits Then the new concern aggregates
        open and only the pre-existing id is triaged (no same-step self-dismiss)
      - Given reviewPolicy.default [fix,optional] plus reviewer override
        [fix,optional,architect] When resolveReviewAllowed runs Then reviewer
        triager gets override+dismiss and QA non-triager gets default without
        dismiss
      - Given a dismissed concern re-emitted with higher severity When merge
        runs Then status stays dismissed but source.escalated=true and the
        escalation appears in digest and architect hydration
    title: Contracts and aggregation foundation
  - directionalInterfaces:
      - "prompt-vars KNOWN_VARS+descriptions: concernsYaml in steps/review,
        steps/plan-review, steps/wave-close-up, steps/plan-close-up,
        architect-plan, architect-wave-report, architect-closeup,
        architect-consult-*; humanInvolvementCriteria in review, plan-review,
        architect-*"
      - item-machine review + iteration plan-review promptVars and writeArtifact
        with isTriager gate, partitionSuggestions excluding triage ids from
        fix-loop/approval/normal mailbox, fix-on-concern fixRequired once,
        mailbox dedup q-concern-<cid>
      - agents reviewer, plan-reviewer, criteria/dispositions,
        criteria/human-involvement terse confirm/dismiss/condense plus blocking
        table plus condensing rule output-bytes<input-bytes
      - config/pipeline.default.yaml commented autonomous/principal/detailed
        presets with blocking table plus concerns raise/threshold examples
    id: m2-triage-modes
    scenarios:
      - Given open item concerns When review runs Then steps/review receives
        concernsYaml with id/kind/severity/summary/affects and terse triage
        instructions
      - Given reviewer suggestion matching a concern id with disposition dismiss
        and detail When review commits Then that file has status dismissed plus
        dismissReason=detail and no mailbox, debt, blocked, or approval effect
      - Given a matching dismiss suggestion without detail When review commits
        Then the step errors and no triage is persisted
      - Given QA emitting a matching concern id When QA commits Then no triage
        is applied and the file stays open
      - Given matching suggestions with fix, optional, architect, or human-*
        When review commits Then each file becomes routed with disposition
        persisted; triage ids are excluded from normal fix-loop/approval/mailbox
        except fix-on-concern sets fixRequired once; human-async on a concern
        writes a single q-concern-<cid>
      - Given architect plan concerns plus an rm-* file When plan-review runs
        Then plan-reviewer triages with the same vocabulary and non-dismissed
        files become routed; debt predicate is kind==tech-debt&&routed or
        disposition==optional (no tech-debt disposition)
      - Given pipeline.yaml humanInvolvement principal When reviewer and
        architect prompts render Then the mode criteria fragment is included and
        preflightPrompts passes
    title: Reviewer triage and modes
  - directionalInterfaces:
      - derive/task.ts collectRoutedBlockers(taskDir)->Set plus
        deriveWave/deriveItem integration;
        scheduler.blockedByConcern(items,concernBlocked) pure reusing
        blockedByFailure fixpoint, unioned, cascade only over declared deps
      - "act-phase routing: triage writeArtifact plus wave-act newly-blocked
        check writing decisions/concern-<cid>.yaml exactly once (restart
        idempotent); buildArchitectHydration extended with concernsYaml digest"
      - steer writeQuestion for human-async/stop/blocking ADR; derive/task
        blocking-vs-digest split (blocks.length>0 vs awareness empty); debt
        predicate; human-stop exit-10 halt plus blocked
    id: m3-routing
    scenarios:
      - Given a routed blocker whose affects names a declared dependent When
        derive runs Then the dependent derives blocked with no writes;
        non-dependents are unaffected and transitive blocking follows declared
        deps only
      - Given a newly blocked dependent When the act phase runs Then exactly one
        decisions/concern-<cid>.yaml is written and a restart writes no second
        file
      - Given a routed architect concern When the next architect turn builds
        hydration Then its concernsYaml input contains that concern id and
        summary
      - Given a routed human-async concern When routing runs Then mailbox
        q-concern-<cid> has blocks=[item], the item derives blocked, and the
        engine continues without exit 10
      - Given a routed human-stop concern When routing runs Then the mailbox
        entry blocks task/item, item and task derive blocked, and the engine
        halts with exit code 10 until answered or dismissed
      - Given a routed human-awareness concern When routing runs Then the
        mailbox entry has blocks=[] in the Digest section and the engine
        continues with no blocked set and no exit 10
      - Given plan ADRs blocking true and false under autonomous mode When plan
        commits Then the blocking ADR creates a mailbox question with blocks
        while the remarkable ADR appears only in the digest; debt includes kind
        tech-debt routed or disposition optional routed as [item] summary
    title: Routing to blocked, architect, mailbox, debt
  - directionalInterfaces:
      - closeup schemas concernResolutions resolve/carry/propagate plus
        concerns[]/remarkable[];
        StoredConcern.pendingResolution{action,note,by,at};
        applyCloseupResolutions proposes (status stays routed); architect
        concernConfirms accept/reject applies; propagate to parent concerns/
        copy or human digest
      - "iteration.ts concernsYaml hydration capped UTF-8 bytes: code steps
        min(diffBytes,2000); zero-diff orchestration min(inputBytes,500);
        reviewer/architect condensing prompts require output<input; engine
        truncates hydrated var only"
      - engine.ts runChildTask propagateEpicConcerns after child completion
        before cleanup/merge, condensed copies with source.epic, parent
        hydration extended; size assert parent-detail<child-detail
      - derive/task.ts toStateArtifact().concerns counts (missing dir zeros,
        corrupt skip+warn); cli/status.ts Concerns plus separate Blocking vs
        Digest sections
    id: m4-funnel-surface
    replanAfter: true
    scenarios:
      - Given wave diff 5000 bytes and open concerns 3000 bytes When
        wave-close-up hydrates Then concernsYaml is <=2000 bytes and < wave diff
        in UTF-8 bytes
      - Given zero-diff plan-review with 4000-byte input When hydrating Then
        concernsYaml is <=500 bytes and < input bytes
      - Given wave-close-up emitting concernResolutions resolve/carry/propagate
        When it commits Then files stay routed with pendingResolution set;
        architect accept applies resolved/routed/propagated and reject clears
        pending
      - Given a simple item with open concerns and no reviewer When
        wave-close-up runs Then explicit resolutions triage them; fallback
        auto-routes kind tech-debt to optional (debt) and other kinds to
        architect (carry); human-* is never auto-routed
      - Given a child epic finishing with one dismissed and one open concern
        with 800-byte detail When runChildTask completes before cleanup Then the
        parent gains exactly one condensed copy with source.epic, detail <800
        bytes, hydrating saga architect concernsYaml
      - Given mixed-status concerns plus a corrupt yaml file When state
        refreshes and factory status runs Then state.yaml counts skip the
        corrupt file with warn, missing dir yields zeros, and CLI shows Concerns
        plus Blocking vs Digest sections
    title: Funnel, close-ups, saga, surfacing
  - directionalInterfaces:
      - docs/ARCHITECTURE.md §1 row 18 + §6.2 concerns/ + §8
        funnel/routing/modes/partition/producer-matrix/resilience/exit-10,
        README.md, config commentary, agents/criteria/dispositions.md human-stop
        exit-10 preserved
      - "fragment matrix (8 fragments) + debloat check: each fragment ≤15 lines,
        total growth ≤60 lines, preflight plus line-count assertion in
        prompts.test"
    id: m5-docs
    scenarios:
      - Given implementation complete When docs are read Then ARCHITECTURE,
        README, config commentary, and dispositions describe concerns lifecycle,
        funnel sizes, partition, producer matrix, exit-10, modes, and counts
        with terse prompts
      - Given prompt fragments When prompts.test runs Then KNOWN_VARS plus
        descriptions cover all 8 fragments and added lines respect ≤15/≤60
        budgets
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    title: Docs and suite consolidation
uncertainties:
  - description: Funnel byte budget per-level sources, zero-diff rule, and
      bytes-vs-chars unit needed before close-up hydration.
    id: u-text-budget
    spikeOutlines:
      - test-assumptions spike-text-budget verifies code min(diff,2000) and
        zero-diff min(input,500) UTF-8 bytes with output<input condensing
  - description: Epic propagation timing plus taskWt serialization/restart behavior
      and pure-derive versus act-phase boundary needed before store, blocker
      derive, and saga propagation.
    id: u-saga-propagation
    spikeOutlines:
      - fact-finder spike-saga-commit verifies parent-copy timing, runExclusive
        serialization, immediate commit idempotency, collectRoutedBlockers
        owner, and hydration seam
itemOutlines:
  - deps: []
    description: "test-assumptions: measure item/wave diff bytes vs concern detail
      sizes; confirm per-level caps code min(diff,2000) and zero-diff
      min(input,500) UTF-8 bytes, condensing output<input, no 500-floor
      violation. Finding record only, no prod code; gates funnel-closeups."
    kind: test-assumptions
    milestoneId: m1-contracts-aggregate
    slug: spike-text-budget
    title: "Spike: funnel byte budget"
  - deps: []
    description: "fact-finder: verify runChildTask copy timing before cleanup/merge,
      parent buildArchitectHydration extension point, taskWt runExclusive
      serialization under 4 parallel items, immediate commit plus restart
      idempotency, pure-derive vs act-phase boundary with collectRoutedBlockers
      owner. Finding only; gates concerns-store, routing-blocker-derive,
      saga-propagate."
    kind: fact-finder
    milestoneId: m1-contracts-aggregate
    slug: spike-saga-commit
    title: "Spike: saga propagation, commit, derive boundary"
  - deps: []
    description: "Types plus schemas for producer matrix (developer, fact-finder,
      qa, poc, test-assumptions, review newConcerns, plan, decisions,
      wave/plan-closeup with concernResolutions, architect reports) via shared
      partial; triage/infra/pm-edit out of scope. Canonical
      reviewPolicy.default, legacy alias,
      resolveReviewAllowed(pipeline,agent,isTriager) precedence plus dismiss
      injection, generateReviewSchema, dismiss detail-required, pipeline
      humanInvolvement plus concerns thresholds. Tests: typecheck, preflight,
      repair defaults vs strict reject unknown kind."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts
    title: Concern contracts and canonical review policy
  - deps:
      - concerns-contracts
      - spike-saga-commit
    description: "Implement src/core/concerns.ts (fingerprint identity, merge with
      escalated flag, aggregate/list/triage/closeup/partition, atomic YAML plus
      runExclusive plus immediate taskWt commit, restart idempotent). Wire all
      producer seams including consult writeArtifact; reviewer ordering
      aggregates new then triages pre-existing only. Behavior tests:
      open+source, retry dedup, reword merge preserving status plus escalation
      surfacing, rm-* aggregate, precedence/injection. Run TMPDIR=/tmp bun test
      test/engine/concerns-funnel.test.ts."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-store
    title: Concerns store with merge and commit
  - deps:
      - concerns-store
    description: "Item reviewer triage with concernsYaml in steps/review, isTriager
      gate, exact-id partition excluding triage ids from
      fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox
      dedup q-concern-<cid>, dismiss detail to dismissReason, condensing
      output<input, debt predicate without tech-debt disposition. Behavior
      tests: dismiss no routing, routed persist, QA gate no-op, missing detail
      errors, fix-once, no double mailbox."
    kind: story
    milestoneId: m2-triage-modes
    slug: reviewer-triage
    title: Workhorse reviewer triage
  - deps:
      - concerns-store
    description: "Architect path: aggregate plan/revise concerns plus remarkable
      rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition
      and dismiss vocabulary, non-dismissed become routed. Behavior tests:
      dismissed vs routed, rm-* triaged, debt predicate, no approval trigger
      from triage ids."
    kind: story
    milestoneId: m2-triage-modes
    slug: plan-reviewer-triage
    title: Plan-reviewer triage
  - deps:
      - concerns-contracts
    description: "humanInvolvement plus concerns thresholds schema/loader/merge,
      commented autonomous/principal/detailed presets with blocking table,
      agents/criteria/human-involvement.md terse fragment, KNOWN_VARS
      concernsYaml plus humanInvolvementCriteria with descriptions wired per
      fragment matrix. Behavior tests: mode switch changes criteria and
      blocking-ADR behavior; preflight green. Precedes all routing."
    kind: story
    milestoneId: m2-triage-modes
    slug: modes-prompts
    title: Modes, thresholds, prompt wiring
  - deps:
      - plan-reviewer-triage
      - reviewer-triage
      - modes-prompts
      - spike-saga-commit
    description: "Pure derive only: derive/task collectRoutedBlockers plus
      deriveWave/deriveItem integration, scheduler.blockedByConcern reusing
      fixpoint, union with failure-blocked, cascade only declared deps, no
      writes. Behavior tests: dependent blocked, non-dep unaffected, transitive
      via deps only."
    escalate: true
    kind: story
    milestoneId: m3-routing
    slug: routing-blocker-derive
    title: Blocker derive
  - deps:
      - modes-prompts
      - routing-blocker-derive
    description: "Act phase only: wave-act newly-blocked check writes
      decisions/concern-<cid>.yaml exactly once (restart idempotent) plus
      buildArchitectHydration concernsYaml extension for wave-report/next-plan.
      Behavior tests: single consult file, restart no duplicate, architect input
      contains id+summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-architect-consult
    title: Architect consult and hydration
  - deps:
      - reviewer-triage
      - modes-prompts
    description: "human-async blocks [item] and continues, human-stop blocks
      task/item plus exit-10 halt plus blocked derive, awareness blocks []
      digest never blocking/exiting, debt predicate kind tech-debt routed or
      disposition optional routed. Behavior tests: mailbox files per
      disposition, exit 10 on stop, awareness continues, debt includes [item]
      summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-human-debt
    title: Human mailbox and debt routing
  - deps:
      - modes-prompts
      - routing-human-debt
    description: "Full ADR md title/context/decision/consequences/blocking, blocking
      routed per mode table with exit-10 when stop, remarkable digest-only never
      waiting, dispositions.md exit-10 preserved. Behavior tests: blocking
      mailbox+blocks, remarkable digest only."
    kind: story
    milestoneId: m3-routing
    slug: adr-blocking-digest
    title: Blocking vs remarkable ADRs
  - deps:
      - adr-blocking-digest
      - routing-architect-consult
      - spike-text-budget
    description: "Hydrate wave/plan-close-up and architect reports with concernsYaml
      capped per spike (UTF-8 bytes), concernResolutions pending plus architect
      concernConfirms accept/reject, propagate to parent/digest, simple-item
      explicit plus auto-route fallback (tech-debt to optional, others to
      architect, human never auto). Behavior tests: concrete byte budgets,
      pending/confirm, simple fallback."
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: funnel-closeups
    title: Funnel close-ups and simple triage
  - deps:
      - routing-architect-consult
      - spike-saga-commit
    description: "runChildTask propagateEpicConcerns per spike: after child
      completion before cleanup/merge, condensed parent copies source.epic with
      parent detail smaller than child, extended parent concernsYaml hydration.
      Behavior tests: one copy, dismissed stays local, saga input contains id."
    escalate: true
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: saga-propagate
    title: Epic to saga propagation
  - deps:
      - concerns-store
      - routing-human-debt
    description: "Sole owner StateArtifact.concerns
      {open,dismissed,routed,resolved}, state.schema,
      toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI
      Concerns plus Blocking vs Digest. Behavior tests: counts, missing/corrupt,
      CLI sections."
    kind: story
    milestoneId: m4-funnel-surface
    slug: status-state-surface
    title: State counts and status surfacing
  - deps:
      - funnel-closeups
      - modes-prompts
      - saga-propagate
      - status-state-surface
    description: "Update ARCHITECTURE section 1 row 18 plus 6.2 plus 8, README,
      config commentary, dispositions.md; fragment matrix plus 15/60 debloat
      check; consolidate test/engine/concerns-funnel.test.ts plus steer/CLI
      coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test."
    kind: story
    milestoneId: m5-docs
    slug: docs-finish
    title: Docs and suite consolidation
  - deps:
      - modes-prompts-v2
      - routing-blocker-derive-v2
    description: "Act phase only: wave-act newly-blocked check writes
      decisions/concern-<cid>.yaml exactly once (restart idempotent) +
      buildArchitectHydration concernsYaml extension (append LAST, open+routed,
      capped sub-budget, plan-reviewer path stays open-only). This is a
      merge-repair rerun of the COMPLETE ready implementation (steps approved,
      targets green); do NOT redesign: rebase the exact merged-diff approach
      onto current topic tip, verify wave-9 sibling conflict resolution
      (adr-blocking-digest-v2, status-state-surface-v2) kept ALL THREE diffs,
      then TMRDIR-normalized gates. Pull and fix the exact merge-gate failure
      (names+output in evidence). Out of scope: 4 optional nits (carry to
      docs-finish-v2)."
    kind: story
    milestoneId: m3-routing
    slug: routing-architect-consult-v3
    title: Architect consult and hydration (merge repair)
assumptions:
  - assumption: Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures
      do not mask regressions.
    why: Baseline red only under .factory-runtime TMPDIR; suite green with
      TMPDIR=/tmp. Out of scope.
  - assumption: Concern identity excludes detail and severity per
      adr-fingerprint-merge; reworded detail merges and severity escalations
      surface via escalated flag without reopening.
    why: Prevents trivial-reword duplicates while keeping escalation visible to
      architect and digest.
  - assumption: buildArchitectHydration does not read parent concerns/ today;
      saga-propagate extends it with concernsYaml, and runChildTask copies
      condensed epic concerns to parent concerns/ after child completion but
      before cleanup/merge per spike-saga-commit.
    why: Corrects the prior hydration assumption; defines the copy timing and seam
      the spike must verify.
  - assumption: Per-mode blocking table in adr-humaninvolvement-config is
      authoritative for iteration 1; raise allowlist defaults to all agents.
    why: Unblocks routing without operator tuning; task pipeline.yaml can override.
  - assumption: Dismissed concerns stay dismissed on severity escalation but appear
      as escalated notes in digest and architect hydration.
    disposition: human-awareness
    why: Surfaces the hidden-escalation tradeoff to the operator without
      auto-reopening triaged work.
techDebt:
  - category: adjacent
    description: Pre-existing head-guard failures when TMPDIR sits under
      .factory-runtime because step-runner splits on /.factory. Baseline red;
      green with TMPDIR=/tmp. Out of scope.
    id: td-tmpdir-split
  - category: impacting
    description: reviewAllowed resolved in two places with non-canonical
      allowedDispositions key and wrong fallback order, so per-agent dismiss
      could fail schema validation.
    id: td-reviewpolicy-divergence
    resolution: "Fix in concerns-contracts: canonical reviewPolicy.default, legacy
      alias, single resolveReviewAllowed(pipeline,agent,isTriager) with
      precedence and dismiss injection used by prompt and schema paths."
  - category: impacting
    description: ADR writer persists only title plus context and PlanAdr lacks
      blocking; human-stop contract drifted from exit-10.
    id: td-adr-md-truncated
    resolution: "Fix in adr-blocking-digest and routing-human-debt: full md with
      decision, consequences, blocking plus preserved exit-10 halt and
      dispositions.md update."
  - category: impacting
    description: human-awareness and human-stop ignored, debt derivation ignores
      routed concerns, status lists digest as blocking.
    id: td-human-debt-gaps
    resolution: "Fix in routing-human-debt and status-state-surface: stop exit-10
      plus blocked, awareness digest with empty blocks, debt from predicate,
      Blocking versus Digest split."
adrs:
  - context: Item steps commit only childWt while concerns/ lives on taskWt; up to 4
      parallel items share taskDir; retries/restarts must not duplicate or lose
      triage.
    decision: Write directly to taskWt/{task}/concerns/ with writeYamlAtomic plus
      runExclusive taskWt mutex, then immediately commit taskWt when concerns/
      or steer/ changed. Distinct fingerprints are distinct files; same
      fingerprint merges without clobbering dismissed/routed/resolved. Restart
      re-reads files idempotently. Implementation gated by spike-saga-commit
      serialization findings.
    id: adr-concern-store-taskwt
    title: Direct taskWt writes with serialized immediate commit
  - context: suggestions[] reuse conflated concern triage with fix-loop, mailbox,
      and plan-approval triggers; review id is free-form; QA must not triage;
      dismiss needs a reason field.
    decision: "Exact-id match (suggestion.id === c-<hash10> or rm-<hash10>) via
      partitionSuggestions splits triage entries from normal findings. Triage
      ids update concerns/ only and are excluded from
      fix-loop/approval/normal-mailbox paths; fix on a concern id routes as fix
      and returns fixRequired once for the owning item; human-async on a concern
      writes a single q-concern-<cid> (normal path skipped). Dismiss requires
      non-empty detail persisted to dismissReason or the step errors. isTriager
      gate allows only reviewer, plan-reviewer, and close-up/architect chain.
      Reviewer ordering: aggregate new concerns[] first, then triage only
      pre-existing ids from concernsYaml (no same-step self-dismiss)."
    id: adr-triage-suggestions-dismiss
    title: Partitioned exact-id triage with gate
  - context: derive/* must stay pure; debt routing invented an invalid tech-debt
      disposition; consult writes need exactly-once; mailbox needs dedup.
    decision: "Pure derive: derive/task.ts collectRoutedBlockers(taskDir) reads
      routed kind==blocker affects into a Set passed to deriveWave/deriveItem
      and scheduler.blockedByConcern(items, concernBlocked) which reuses the
      blockedByFailure fixpoint pattern, unions with failure-blocked, and
      cascades only over declared deps. Debt predicate: (kind==tech-debt &&
      status routed/resolved) OR (disposition==optional && status routed); no
      tech-debt disposition exists. Act phase (triage writeArtifact plus
      wave-act newly-blocked check) writes decisions/concern-<cid>.yaml exactly
      once, idempotent on restart, and extends buildArchitectHydration with
      concernsYaml."
    id: adr-routing-derived-state
    title: Pure derive plus exactly-once act routing
  - context: Digest must reuse the mailbox without blocking, halting, or spamming
      status; classify handles operator answers, not blocking.
    decision: Digest entries are steer/tousertoreview entries with disposition
      human-awareness and blocks:[]. derive/task splits openSteerQuestions into
      blocking (blocks.length>0) versus digest (awareness plus empty blocks);
      classify only routes answers/directives/stop; status renders separate
      Blocking versus Digest sections.
    id: adr-digest-mailbox
    title: Digest as filtered non-blocking mailbox view
  - context: Spec needs autonomous/principal/detailed presets plus raise allowlist
      and severity thresholds; pipeline root is closed.
    decision: "Top-level PipelineConfig.humanInvolvement (default autonomous) plus
      PipelineConfig.concerns {raiseAllowlist?, minDigestSeverity?,
      minBlockingSeverity?}. Blocking table: autonomous blocks only on blocking
      ADR or high human-stop; principal adds human-async and high severity;
      detailed adds all human-*. Thresholds gate blocking versus digest
      placement. Criteria fragment agents/criteria/human-involvement.md carries
      the table tersely."
    id: adr-humaninvolvement-config
    title: Modes plus raise and severity config
  - context: Funnel requires less detail per level and never more text than code
      summarized, with falsifiable checks and no empty digest on zero-diff
      steps.
    decision: "Per-level UTF-8 byte caps on hydrated promptVars only (stored
      artifacts never truncated): code steps cap min(diffBytes,2000) where diff
      is item diff for review triage and wave aggregated diff for close-ups;
      zero-diff orchestration steps cap min(inputBytes,500) where input is
      plan/context bytes. Reviewer/architect/close-up prompts require condensing
      with output bytes < input bytes. Engine truncates only the hydrated var."
    id: adr-funnel-text-budget
    title: Per-level hydration byte caps
  - context: PipelineConfig type says {default,[agent]} but flows read
      .allowedDispositions as if global; precedence and dismiss injection are
      undefined.
    decision: "Canonical key is reviewPolicy.default with legacy
      reviewPolicy.allowedDispositions as a one-iteration read-alias. Single
      owner src/core/review-policy.ts resolveReviewAllowed(pipeline, agent,
      isTriager): precedence per-agent array > default > builtin
      [fix,optional,architect,human-awareness,human-async]; when isTriager is
      true append dismiss if absent; QA and other non-triagers never receive
      dismiss. Used by both prompt criteria and generateReviewSchema."
    id: adr-reviewpolicy-canonical
    title: Canonical reviewPolicy with triager injection
  - context: Hashing detail/severity duplicates on rewording; excluding them hides
      severity escalation on dismissed concerns.
    decision: "Stable id c-{sha1-10} over {kind, normalizedSummary, location,
      sortedAffects} excluding detail and severity. Normalization trims,
      collapses whitespace, lowercases summary. Re-emit merges: detail keeps
      longer/latest, severity keeps max, updatedAt and source.lastSeen advance,
      never changes dismissed/routed/resolved except via triage or close-up
      resolution. If re-emit severity exceeds stored severity, set
      source.escalated=true and surface the escalation in digest and architect
      hydration without reopening; architect may reopen via close-up
      resolution."
    id: adr-fingerprint-merge
    title: Fingerprint identity, merge, escalation surfacing
  - context: Close-up schemas are closed, wave-close-up has no reviewer, stored
      statuses have no pending, and simple items have no reviewer.
    decision: "Add concernResolutions?: [{id, action: resolve|carry|propagate,
      note?}] plus concerns[]/remarkable[] producer fields to wave/plan-closeup
      schemas and StoredConcern.pendingResolution?: {action,note,by,at}.
      Wave-close-up proposes via applyCloseupResolutions (status stays routed,
      pending set); architect-wave-report confirms via concernConfirms?: [{id,
      confirm: accept|reject, note?}] applying resolved/routed/propagated or
      clearing pending. Propagate targets parent concerns/ copy for epics or
      human digest for task-level unless elevated to blocking ADR. Simple-item
      fallback at wave-close-up: kind tech-debt auto-routes to disposition
      optional (debt), all other kinds to architect (carry); human-* is never
      auto-routed."
    id: adr-closeup-retriage
    title: Close-up pending resolution and simple fallback
  - context: Remarkable {chosen,alternatives,why} needs one authoritative store and
      the same triage vocabulary.
    decision: Authoritative store is concerns/rm-{hash10}.yaml with
      RemarkableDecision plus status and source. Triaged with suggestions[]
      dismiss vocabulary via exact-id match under the same partition and gate.
      Routed remarkables go digest-only unless elevated to a blocking ADR.
    id: adr-remarkable-store
    title: Remarkable decisions in rm- files
  - context: dispositions.md and ARCHITECTURE 8.7 define human-stop as
      tousertoreview plus exit-10 halt, but item-machine treats it fix-like
      running.
    decision: "Preserve exit-10 halt: human-stop writes a mailbox entry with blocks
      covering affected items plus task when task-level, item-machine maps it to
      blocked terminal, derive marks item and task blocked, and the engine halts
      with exit code 10 at the next mailbox check until answered or dismissed.
      Awareness with blocks:[] never enters blocked sets and never triggers exit
      10. Update dispositions.md and ARCHITECTURE 8.7 to keep the contract
      explicit."
    id: adr-human-stop
    title: Human-stop preserves exit-10 halt
  - context: Derive throws on corrupt triage/plan/steer/decisions while concerns/
      proposes skip; one bad concern could fail a whole step.
    decision: Corrupt concerns/*.yaml files are skipped with a warn and excluded
      from counts because concerns/ is an append-only cache rebuildable from
      committed step records; missing concerns/ yields zero counts. A single
      unknown-kind concern fails its step with no partial aggregate and no
      clobber of existing files, forcing prompt/schema drift to surface via
      retry rather than silent loss.
    id: adr-resilience
    title: Corrupt-skip versus strict-fail resilience
  - context: Spec says every agent output may carry concerns[], but not every schema
      has a producer and reviewer has a dual aggregate-plus-triage role.
    decision: "Producer matrix via a shared concern/remarkable partial: developer,
      fact-finder, qa, poc, test-assumptions, reviewer/plan-reviewer new
      concerns[], architect plan/revise, consult decisions, wave/plan-closeup,
      architect wave-report/closeup. Triage, infra, and pm-edit mechanical
      outputs are explicitly out of scope (no LLM synthesis). Consults aggregate
      via runItemConsult/runNonItemConsult writeArtifact. Reviewer ordering:
      aggregate new concerns first, then triage only pre-existing ids."
    id: adr-producer-matrix
    title: Producer matrix and reviewer ordering


--- Prior Plan plan-1.yaml ---
iteration: 1
milestones:
  - directionalInterfaces:
      - "artifacts.ts: Concern, RemarkableDecision,
        StoredConcernArtifact(+pendingResolution?, source.escalated?),
        ReviewDisposition+dismiss (no tech-debt), PlanAdr.blocking,
        PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeveri\
        ty,minBlockingSeverity}, reviewPolicy.default canonical"
      - "config/schemas: shared concern/remarkable partial in developer,
        fact-finder, qa, poc, test-assumptions, review newConcerns, plan,
        decisions, wave/plan-closeup, architect reports; triage/infra/pm-edit
        out of scope; dismiss detail-required; closeup concernResolutions"
      - "src/core/concerns.ts: concernFingerprint(identity),
        aggregateConcerns(merge+escalated), listOpenConcerns,
        applyConcernTriage(exact-id,isTriager), applyCloseupResolutions,
        partitionSuggestions(triage vs findings)"
      - "src/core/review-policy.ts:
        resolveReviewAllowed(pipeline,agent,isTriager)
        per-agent>default>builtin, legacy allowedDispositions alias, dismiss
        auto-append for triagers; generateReviewSchema uses it; taskWt
        runExclusive+atomic+immediate-commit helper"
    id: m1-contracts-aggregate
    scenarios:
      - Given a developer step emitting a blocker concern When the step commits
        Then concerns/c-<fp10>.yaml exists with status open and source.record
        pointing at the step record
      - Given the same concern re-emitted on retry When aggregation runs Then
        exactly one file exists, prior dismissed/routed preserved,
        updatedAt/lastSeen advance
      - Given a concern missing severity and detail When validation runs Then
        severity defaults to medium, detail defaults to summary, and the file is
        created
      - Given a concern with unknown kind When validation runs Then the step
        errors, no concerns file is written, existing files stay untouched
      - Given developer, fact-finder, qa, poc, review-new, plan, consult,
        closeup, and architect-report outputs carrying concerns[]+remarkable[]
        When steps commit Then each aggregates to concerns/c-*.yaml or rm-*.yaml
        with open status and source pointer; triage/infra/pm-edit carry none
      - Given reviewer output with new concerns[] plus suggestions triaging a
        pre-existing id When the step commits Then the new concern aggregates
        open and only the pre-existing id is triaged (no same-step self-dismiss)
      - Given reviewPolicy.default [fix,optional] plus reviewer override
        [fix,optional,architect] When resolveReviewAllowed runs Then reviewer
        triager gets override+dismiss and QA non-triager gets default without
        dismiss
      - Given a dismissed concern re-emitted with higher severity When merge
        runs Then status stays dismissed but source.escalated=true and the
        escalation appears in digest and architect hydration
    title: Contracts and aggregation foundation
  - directionalInterfaces:
      - "prompt-vars KNOWN_VARS+descriptions: concernsYaml in steps/review,
        steps/plan-review, steps/wave-close-up, steps/plan-close-up,
        architect-plan, architect-wave-report, architect-closeup,
        architect-consult-*; humanInvolvementCriteria in review, plan-review,
        architect-*"
      - item-machine review + iteration plan-review promptVars and writeArtifact
        with isTriager gate, partitionSuggestions excluding triage ids from
        fix-loop/approval/normal mailbox, fix-on-concern fixRequired once,
        mailbox dedup q-concern-<cid>
      - agents reviewer, plan-reviewer, criteria/dispositions,
        criteria/human-involvement terse confirm/dismiss/condense plus blocking
        table plus condensing rule output-bytes<input-bytes
      - config/pipeline.default.yaml commented autonomous/principal/detailed
        presets with blocking table plus concerns raise/threshold examples
    id: m2-triage-modes
    scenarios:
      - Given open item concerns When review runs Then steps/review receives
        concernsYaml with id/kind/severity/summary/affects and terse triage
        instructions
      - Given reviewer suggestion matching a concern id with disposition dismiss
        and detail When review commits Then that file has status dismissed plus
        dismissReason=detail and no mailbox, debt, blocked, or approval effect
      - Given a matching dismiss suggestion without detail When review commits
        Then the step errors and no triage is persisted
      - Given QA emitting a matching concern id When QA commits Then no triage
        is applied and the file stays open
      - Given matching suggestions with fix, optional, architect, or human-*
        When review commits Then each file becomes routed with disposition
        persisted; triage ids are excluded from normal fix-loop/approval/mailbox
        except fix-on-concern sets fixRequired once; human-async on a concern
        writes a single q-concern-<cid>
      - Given architect plan concerns plus an rm-* file When plan-review runs
        Then plan-reviewer triages with the same vocabulary and non-dismissed
        files become routed; debt predicate is kind==tech-debt&&routed or
        disposition==optional (no tech-debt disposition)
      - Given pipeline.yaml humanInvolvement principal When reviewer and
        architect prompts render Then the mode criteria fragment is included and
        preflightPrompts passes
    title: Reviewer triage and modes
  - directionalInterfaces:
      - derive/task.ts collectRoutedBlockers(taskDir)->Set plus
        deriveWave/deriveItem integration;
        scheduler.blockedByConcern(items,concernBlocked) pure reusing
        blockedByFailure fixpoint, unioned, cascade only over declared deps
      - "act-phase routing: triage writeArtifact plus wave-act newly-blocked
        check writing decisions/concern-<cid>.yaml exactly once (restart
        idempotent); buildArchitectHydration extended with concernsYaml digest"
      - steer writeQuestion for human-async/stop/blocking ADR; derive/task
        blocking-vs-digest split (blocks.length>0 vs awareness empty); debt
        predicate; human-stop exit-10 halt plus blocked
    id: m3-routing
    scenarios:
      - Given a routed blocker whose affects names a declared dependent When
        derive runs Then the dependent derives blocked with no writes;
        non-dependents are unaffected and transitive blocking follows declared
        deps only
      - Given a newly blocked dependent When the act phase runs Then exactly one
        decisions/concern-<cid>.yaml is written and a restart writes no second
        file
      - Given a routed architect concern When the next architect turn builds
        hydration Then its concernsYaml input contains that concern id and
        summary
      - Given a routed human-async concern When routing runs Then mailbox
        q-concern-<cid> has blocks=[item], the item derives blocked, and the
        engine continues without exit 10
      - Given a routed human-stop concern When routing runs Then the mailbox
        entry blocks task/item, item and task derive blocked, and the engine
        halts with exit code 10 until answered or dismissed
      - Given a routed human-awareness concern When routing runs Then the
        mailbox entry has blocks=[] in the Digest section and the engine
        continues with no blocked set and no exit 10
      - Given plan ADRs blocking true and false under autonomous mode When plan
        commits Then the blocking ADR creates a mailbox question with blocks
        while the remarkable ADR appears only in the digest; debt includes kind
        tech-debt routed or disposition optional routed as [item] summary
    title: Routing to blocked, architect, mailbox, debt
  - directionalInterfaces:
      - closeup schemas concernResolutions resolve/carry/propagate plus
        concerns[]/remarkable[];
        StoredConcern.pendingResolution{action,note,by,at};
        applyCloseupResolutions proposes (status stays routed); architect
        concernConfirms accept/reject applies; propagate to parent concerns/
        copy or human digest
      - "iteration.ts concernsYaml hydration capped UTF-8 bytes: code steps
        min(diffBytes,2000); zero-diff orchestration min(inputBytes,500);
        reviewer/architect condensing prompts require output<input; engine
        truncates hydrated var only"
      - engine.ts runChildTask propagateEpicConcerns after child completion
        before cleanup/merge, condensed copies with source.epic, parent
        hydration extended; size assert parent-detail<child-detail
      - derive/task.ts toStateArtifact().concerns counts (missing dir zeros,
        corrupt skip+warn); cli/status.ts Concerns plus separate Blocking vs
        Digest sections
    id: m4-funnel-surface
    replanAfter: true
    scenarios:
      - Given wave diff 5000 bytes and open concerns 3000 bytes When
        wave-close-up hydrates Then concernsYaml is <=2000 bytes and < wave diff
        in UTF-8 bytes
      - Given zero-diff plan-review with 4000-byte input When hydrating Then
        concernsYaml is <=500 bytes and < input bytes
      - Given wave-close-up emitting concernResolutions resolve/carry/propagate
        When it commits Then files stay routed with pendingResolution set;
        architect accept applies resolved/routed/propagated and reject clears
        pending
      - Given a simple item with open concerns and no reviewer When
        wave-close-up runs Then explicit resolutions triage them; fallback
        auto-routes kind tech-debt to optional (debt) and other kinds to
        architect (carry); human-* is never auto-routed
      - Given a child epic finishing with one dismissed and one open concern
        with 800-byte detail When runChildTask completes before cleanup Then the
        parent gains exactly one condensed copy with source.epic, detail <800
        bytes, hydrating saga architect concernsYaml
      - Given mixed-status concerns plus a corrupt yaml file When state
        refreshes and factory status runs Then state.yaml counts skip the
        corrupt file with warn, missing dir yields zeros, and CLI shows Concerns
        plus Blocking vs Digest sections
    title: Funnel, close-ups, saga, surfacing
  - directionalInterfaces:
      - docs/ARCHITECTURE.md §1 row 18 + §6.2 concerns/ + §8
        funnel/routing/modes/partition/producer-matrix/resilience/exit-10,
        README.md, config commentary, agents/criteria/dispositions.md human-stop
        exit-10 preserved
      - "fragment matrix (8 fragments) + debloat check: each fragment ≤15 lines,
        total growth ≤60 lines, preflight plus line-count assertion in
        prompts.test"
    id: m5-docs
    scenarios:
      - Given implementation complete When docs are read Then ARCHITECTURE,
        README, config commentary, and dispositions describe concerns lifecycle,
        funnel sizes, partition, producer matrix, exit-10, modes, and counts
        with terse prompts
      - Given prompt fragments When prompts.test runs Then KNOWN_VARS plus
        descriptions cover all 8 fragments and added lines respect ≤15/≤60
        budgets
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    title: Docs and suite consolidation
uncertainties:
  - description: Funnel byte budget per-level sources, zero-diff rule, and
      bytes-vs-chars unit needed before close-up hydration.
    id: u-text-budget
    spikeOutlines:
      - test-assumptions spike-text-budget verifies code min(diff,2000) and
        zero-diff min(input,500) UTF-8 bytes with output<input condensing
  - description: Epic propagation timing plus taskWt serialization/restart behavior
      and pure-derive versus act-phase boundary needed before store, blocker
      derive, and saga propagation.
    id: u-saga-propagation
    spikeOutlines:
      - fact-finder spike-saga-commit verifies parent-copy timing, runExclusive
        serialization, immediate commit idempotency, collectRoutedBlockers
        owner, and hydration seam
itemOutlines:
  - deps: []
    description: "test-assumptions: measure item/wave diff bytes vs concern detail
      sizes; confirm per-level caps code min(diff,2000) and zero-diff
      min(input,500) UTF-8 bytes, condensing output<input, no 500-floor
      violation. Finding record only, no prod code; gates funnel-closeups."
    kind: test-assumptions
    milestoneId: m1-contracts-aggregate
    slug: spike-text-budget
    title: "Spike: funnel byte budget"
  - deps: []
    description: "fact-finder: verify runChildTask copy timing before cleanup/merge,
      parent buildArchitectHydration extension point, taskWt runExclusive
      serialization under 4 parallel items, immediate commit plus restart
      idempotency, pure-derive vs act-phase boundary with collectRoutedBlockers
      owner. Finding only; gates concerns-store, routing-blocker-derive,
      saga-propagate."
    kind: fact-finder
    milestoneId: m1-contracts-aggregate
    slug: spike-saga-commit
    title: "Spike: saga propagation, commit, derive boundary"
  - deps: []
    description: "Types plus schemas for producer matrix (developer, fact-finder,
      qa, poc, test-assumptions, review newConcerns, plan, decisions,
      wave/plan-closeup with concernResolutions, architect reports) via shared
      partial; triage/infra/pm-edit out of scope. Canonical
      reviewPolicy.default, legacy alias,
      resolveReviewAllowed(pipeline,agent,isTriager) precedence plus dismiss
      injection, generateReviewSchema, dismiss detail-required, pipeline
      humanInvolvement plus concerns thresholds. Tests: typecheck, preflight,
      repair defaults vs strict reject unknown kind."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts
    title: Concern contracts and canonical review policy
  - deps:
      - concerns-contracts
      - spike-saga-commit
    description: "Implement src/core/concerns.ts (fingerprint identity, merge with
      escalated flag, aggregate/list/triage/closeup/partition, atomic YAML plus
      runExclusive plus immediate taskWt commit, restart idempotent). Wire all
      producer seams including consult writeArtifact; reviewer ordering
      aggregates new then triages pre-existing only. Behavior tests:
      open+source, retry dedup, reword merge preserving status plus escalation
      surfacing, rm-* aggregate, precedence/injection. Run TMPDIR=/tmp bun test
      test/engine/concerns-funnel.test.ts."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-store
    title: Concerns store with merge and commit
  - deps:
      - concerns-store
    description: "Item reviewer triage with concernsYaml in steps/review, isTriager
      gate, exact-id partition excluding triage ids from
      fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox
      dedup q-concern-<cid>, dismiss detail to dismissReason, condensing
      output<input, debt predicate without tech-debt disposition. Behavior
      tests: dismiss no routing, routed persist, QA gate no-op, missing detail
      errors, fix-once, no double mailbox."
    kind: story
    milestoneId: m2-triage-modes
    slug: reviewer-triage
    title: Workhorse reviewer triage
  - deps:
      - concerns-store
    description: "Architect path: aggregate plan/revise concerns plus remarkable
      rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition
      and dismiss vocabulary, non-dismissed become routed. Behavior tests:
      dismissed vs routed, rm-* triaged, debt predicate, no approval trigger
      from triage ids."
    kind: story
    milestoneId: m2-triage-modes
    slug: plan-reviewer-triage
    title: Plan-reviewer triage
  - deps:
      - concerns-contracts
    description: "humanInvolvement plus concerns thresholds schema/loader/merge,
      commented autonomous/principal/detailed presets with blocking table,
      agents/criteria/human-involvement.md terse fragment, KNOWN_VARS
      concernsYaml plus humanInvolvementCriteria with descriptions wired per
      fragment matrix. Behavior tests: mode switch changes criteria and
      blocking-ADR behavior; preflight green. Precedes all routing."
    kind: story
    milestoneId: m2-triage-modes
    slug: modes-prompts
    title: Modes, thresholds, prompt wiring
  - deps:
      - plan-reviewer-triage
      - reviewer-triage
      - modes-prompts
      - spike-saga-commit
    description: "Pure derive only: derive/task collectRoutedBlockers plus
      deriveWave/deriveItem integration, scheduler.blockedByConcern reusing
      fixpoint, union with failure-blocked, cascade only declared deps, no
      writes. Behavior tests: dependent blocked, non-dep unaffected, transitive
      via deps only."
    escalate: true
    kind: story
    milestoneId: m3-routing
    slug: routing-blocker-derive
    title: Blocker derive
  - deps:
      - modes-prompts
      - routing-blocker-derive
    description: "Act phase only: wave-act newly-blocked check writes
      decisions/concern-<cid>.yaml exactly once (restart idempotent) plus
      buildArchitectHydration concernsYaml extension for wave-report/next-plan.
      Behavior tests: single consult file, restart no duplicate, architect input
      contains id+summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-architect-consult
    title: Architect consult and hydration
  - deps:
      - reviewer-triage
      - modes-prompts
    description: "human-async blocks [item] and continues, human-stop blocks
      task/item plus exit-10 halt plus blocked derive, awareness blocks []
      digest never blocking/exiting, debt predicate kind tech-debt routed or
      disposition optional routed. Behavior tests: mailbox files per
      disposition, exit 10 on stop, awareness continues, debt includes [item]
      summary."
    kind: story
    milestoneId: m3-routing
    slug: routing-human-debt
    title: Human mailbox and debt routing
  - deps:
      - modes-prompts
      - routing-human-debt
    description: "Full ADR md title/context/decision/consequences/blocking, blocking
      routed per mode table with exit-10 when stop, remarkable digest-only never
      waiting, dispositions.md exit-10 preserved. Behavior tests: blocking
      mailbox+blocks, remarkable digest only."
    kind: story
    milestoneId: m3-routing
    slug: adr-blocking-digest
    title: Blocking vs remarkable ADRs
  - deps:
      - adr-blocking-digest
      - routing-architect-consult
      - spike-text-budget
    description: "Hydrate wave/plan-close-up and architect reports with concernsYaml
      capped per spike (UTF-8 bytes), concernResolutions pending plus architect
      concernConfirms accept/reject, propagate to parent/digest, simple-item
      explicit plus auto-route fallback (tech-debt to optional, others to
      architect, human never auto). Behavior tests: concrete byte budgets,
      pending/confirm, simple fallback."
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: funnel-closeups
    title: Funnel close-ups and simple triage
  - deps:
      - routing-architect-consult
      - spike-saga-commit
    description: "runChildTask propagateEpicConcerns per spike: after child
      completion before cleanup/merge, condensed parent copies source.epic with
      parent detail smaller than child, extended parent concernsYaml hydration.
      Behavior tests: one copy, dismissed stays local, saga input contains id."
    escalate: true
    kind: story
    milestoneId: m4-funnel-surface
    replanAfter: true
    slug: saga-propagate
    title: Epic to saga propagation
  - deps:
      - concerns-store
      - routing-human-debt
    description: "Sole owner StateArtifact.concerns
      {open,dismissed,routed,resolved}, state.schema,
      toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI
      Concerns plus Blocking vs Digest. Behavior tests: counts, missing/corrupt,
      CLI sections."
    kind: story
    milestoneId: m4-funnel-surface
    slug: status-state-surface
    title: State counts and status surfacing
  - deps:
      - funnel-closeups
      - modes-prompts
      - saga-propagate
      - status-state-surface
    description: "Update ARCHITECTURE section 1 row 18 plus 6.2 plus 8, README,
      config commentary, dispositions.md; fragment matrix plus 15/60 debloat
      check; consolidate test/engine/concerns-funnel.test.ts plus steer/CLI
      coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test."
    kind: story
    milestoneId: m5-docs
    slug: docs-finish
    title: Docs and suite consolidation
assumptions:
  - assumption: Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures
      do not mask regressions.
    why: Baseline red only under .factory-runtime TMPDIR; suite green with
      TMPDIR=/tmp. Out of scope.
  - assumption: Concern identity excludes detail and severity per
      adr-fingerprint-merge; reworded detail merges and severity escalations
      surface via escalated flag without reopening.
    why: Prevents trivial-reword duplicates while keeping escalation visible to
      architect and digest.
  - assumption: buildArchitectHydration does not read parent concerns/ today;
      saga-propagate extends it with concernsYaml, and runChildTask copies
      condensed epic concerns to parent concerns/ after child completion but
      before cleanup/merge per spike-saga-commit.
    why: Corrects the prior hydration assumption; defines the copy timing and seam
      the spike must verify.
  - assumption: Per-mode blocking table in adr-humaninvolvement-config is
      authoritative for iteration 1; raise allowlist defaults to all agents.
    why: Unblocks routing without operator tuning; task pipeline.yaml can override.
  - assumption: Dismissed concerns stay dismissed on severity escalation but appear
      as escalated notes in digest and architect hydration.
    disposition: human-awareness
    why: Surfaces the hidden-escalation tradeoff to the operator without
      auto-reopening triaged work.
techDebt:
  - category: adjacent
    description: Pre-existing head-guard failures when TMPDIR sits under
      .factory-runtime because step-runner splits on /.factory. Baseline red;
      green with TMPDIR=/tmp. Out of scope.
    id: td-tmpdir-split
  - category: impacting
    description: reviewAllowed resolved in two places with non-canonical
      allowedDispositions key and wrong fallback order, so per-agent dismiss
      could fail schema validation.
    id: td-reviewpolicy-divergence
    resolution: "Fix in concerns-contracts: canonical reviewPolicy.default, legacy
      alias, single resolveReviewAllowed(pipeline,agent,isTriager) with
      precedence and dismiss injection used by prompt and schema paths."
  - category: impacting
    description: ADR writer persists only title plus context and PlanAdr lacks
      blocking; human-stop contract drifted from exit-10.
    id: td-adr-md-truncated
    resolution: "Fix in adr-blocking-digest and routing-human-debt: full md with
      decision, consequences, blocking plus preserved exit-10 halt and
      dispositions.md update."
  - category: impacting
    description: human-awareness and human-stop ignored, debt derivation ignores
      routed concerns, status lists digest as blocking.
    id: td-human-debt-gaps
    resolution: "Fix in routing-human-debt and status-state-surface: stop exit-10
      plus blocked, awareness digest with empty blocks, debt from predicate,
      Blocking versus Digest split."
adrs:
  - context: Item steps commit only childWt while concerns/ lives on taskWt; up to 4
      parallel items share taskDir; retries/restarts must not duplicate or lose
      triage.
    decision: Write directly to taskWt/{task}/concerns/ with writeYamlAtomic plus
      runExclusive taskWt mutex, then immediately commit taskWt when concerns/
      or steer/ changed. Distinct fingerprints are distinct files; same
      fingerprint merges without clobbering dismissed/routed/resolved. Restart
      re-reads files idempotently. Implementation gated by spike-saga-commit
      serialization findings.
    id: adr-concern-store-taskwt
    title: Direct taskWt writes with serialized immediate commit
  - context: suggestions[] reuse conflated concern triage with fix-loop, mailbox,
      and plan-approval triggers; review id is free-form; QA must not triage;
      dismiss needs a reason field.
    decision: "Exact-id match (suggestion.id === c-<hash10> or rm-<hash10>) via
      partitionSuggestions splits triage entries from normal findings. Triage
      ids update concerns/ only and are excluded from
      fix-loop/approval/normal-mailbox paths; fix on a concern id routes as fix
      and returns fixRequired once for the owning item; human-async on a concern
      writes a single q-concern-<cid> (normal path skipped). Dismiss requires
      non-empty detail persisted to dismissReason or the step errors. isTriager
      gate allows only reviewer, plan-reviewer, and close-up/architect chain.
      Reviewer ordering: aggregate new concerns[] first, then triage only
      pre-existing ids from concernsYaml (no same-step self-dismiss)."
    id: adr-triage-suggestions-dismiss
    title: Partitioned exact-id triage with gate
  - context: derive/* must stay pure; debt routing invented an invalid tech-debt
      disposition; consult writes need exactly-once; mailbox needs dedup.
    decision: "Pure derive: derive/task.ts collectRoutedBlockers(taskDir) reads
      routed kind==blocker affects into a Set passed to deriveWave/deriveItem
      and scheduler.blockedByConcern(items, concernBlocked) which reuses the
      blockedByFailure fixpoint pattern, unions with failure-blocked, and
      cascades only over declared deps. Debt predicate: (kind==tech-debt &&
      status routed/resolved) OR (disposition==optional && status routed); no
      tech-debt disposition exists. Act phase (triage writeArtifact plus
      wave-act newly-blocked check) writes decisions/concern-<cid>.yaml exactly
      once, idempotent on restart, and extends buildArchitectHydration with
      concernsYaml."
    id: adr-routing-derived-state
    title: Pure derive plus exactly-once act routing
  - context: Digest must reuse the mailbox without blocking, halting, or spamming
      status; classify handles operator answers, not blocking.
    decision: Digest entries are steer/tousertoreview entries with disposition
      human-awareness and blocks:[]. derive/task splits openSteerQuestions into
      blocking (blocks.length>0) versus digest (awareness plus empty blocks);
      classify only routes answers/directives/stop; status renders separate
      Blocking versus Digest sections.
    id: adr-digest-mailbox
    title: Digest as filtered non-blocking mailbox view
  - context: Spec needs autonomous/principal/detailed presets plus raise allowlist
      and severity thresholds; pipeline root is closed.
    decision: "Top-level PipelineConfig.humanInvolvement (default autonomous) plus
      PipelineConfig.concerns {raiseAllowlist?, minDigestSeverity?,
      minBlockingSeverity?}. Blocking table: autonomous blocks only on blocking
      ADR or high human-stop; principal adds human-async and high severity;
      detailed adds all human-*. Thresholds gate blocking versus digest
      placement. Criteria fragment agents/criteria/human-involvement.md carries
      the table tersely."
    id: adr-humaninvolvement-config
    title: Modes plus raise and severity config
  - context: Funnel requires less detail per level and never more text than code
      summarized, with falsifiable checks and no empty digest on zero-diff
      steps.
    decision: "Per-level UTF-8 byte caps on hydrated promptVars only (stored
      artifacts never truncated): code steps cap min(diffBytes,2000) where diff
      is item diff for review triage and wave aggregated diff for close-ups;
      zero-diff orchestration steps cap min(inputBytes,500) where input is
      plan/context bytes. Reviewer/architect/close-up prompts require condensing
      with output bytes < input bytes. Engine truncates only the hydrated var."
    id: adr-funnel-text-budget
    title: Per-level hydration byte caps
  - context: PipelineConfig type says {default,[agent]} but flows read
      .allowedDispositions as if global; precedence and dismiss injection are
      undefined.
    decision: "Canonical key is reviewPolicy.default with legacy
      reviewPolicy.allowedDispositions as a one-iteration read-alias. Single
      owner src/core/review-policy.ts resolveReviewAllowed(pipeline, agent,
      isTriager): precedence per-agent array > default > builtin
      [fix,optional,architect,human-awareness,human-async]; when isTriager is
      true append dismiss if absent; QA and other non-triagers never receive
      dismiss. Used by both prompt criteria and generateReviewSchema."
    id: adr-reviewpolicy-canonical
    title: Canonical reviewPolicy with triager injection
  - context: Hashing detail/severity duplicates on rewording; excluding them hides
      severity escalation on dismissed concerns.
    decision: "Stable id c-{sha1-10} over {kind, normalizedSummary, location,
      sortedAffects} excluding detail and severity. Normalization trims,
      collapses whitespace, lowercases summary. Re-emit merges: detail keeps
      longer/latest, severity keeps max, updatedAt and source.lastSeen advance,
      never changes dismissed/routed/resolved except via triage or close-up
      resolution. If re-emit severity exceeds stored severity, set
      source.escalated=true and surface the escalation in digest and architect
      hydration without reopening; architect may reopen via close-up
      resolution."
    id: adr-fingerprint-merge
    title: Fingerprint identity, merge, escalation surfacing
  - context: Close-up schemas are closed, wave-close-up has no reviewer, stored
      statuses have no pending, and simple items have no reviewer.
    decision: "Add concernResolutions?: [{id, action: resolve|carry|propagate,
      note?}] plus concerns[]/remarkable[] producer fields to wave/plan-closeup
      schemas and StoredConcern.pendingResolution?: {action,note,by,at}.
      Wave-close-up proposes via applyCloseupResolutions (status stays routed,
      pending set); architect-wave-report confirms via concernConfirms?: [{id,
      confirm: accept|reject, note?}] applying resolved/routed/propagated or
      clearing pending. Propagate targets parent concerns/ copy for epics or
      human digest for task-level unless elevated to blocking ADR. Simple-item
      fallback at wave-close-up: kind tech-debt auto-routes to disposition
      optional (debt), all other kinds to architect (carry); human-* is never
      auto-routed."
    id: adr-closeup-retriage
    title: Close-up pending resolution and simple fallback
  - context: Remarkable {chosen,alternatives,why} needs one authoritative store and
      the same triage vocabulary.
    decision: Authoritative store is concerns/rm-{hash10}.yaml with
      RemarkableDecision plus status and source. Triaged with suggestions[]
      dismiss vocabulary via exact-id match under the same partition and gate.
      Routed remarkables go digest-only unless elevated to a blocking ADR.
    id: adr-remarkable-store
    title: Remarkable decisions in rm- files
  - context: dispositions.md and ARCHITECTURE 8.7 define human-stop as
      tousertoreview plus exit-10 halt, but item-machine treats it fix-like
      running.
    decision: "Preserve exit-10 halt: human-stop writes a mailbox entry with blocks
      covering affected items plus task when task-level, item-machine maps it to
      blocked terminal, derive marks item and task blocked, and the engine halts
      with exit code 10 at the next mailbox check until answered or dismissed.
      Awareness with blocks:[] never enters blocked sets and never triggers exit
      10. Update dispositions.md and ARCHITECTURE 8.7 to keep the contract
      explicit."
    id: adr-human-stop
    title: Human-stop preserves exit-10 halt
  - context: Derive throws on corrupt triage/plan/steer/decisions while concerns/
      proposes skip; one bad concern could fail a whole step.
    decision: Corrupt concerns/*.yaml files are skipped with a warn and excluded
      from counts because concerns/ is an append-only cache rebuildable from
      committed step records; missing concerns/ yields zero counts. A single
      unknown-kind concern fails its step with no partial aggregate and no
      clobber of existing files, forcing prompt/schema drift to surface via
      retry rather than silent loss.
    id: adr-resilience
    title: Corrupt-skip versus strict-fail resilience
  - context: Spec says every agent output may carry concerns[], but not every schema
      has a producer and reviewer has a dual aggregate-plus-triage role.
    decision: "Producer matrix via a shared concern/remarkable partial: developer,
      fact-finder, qa, poc, test-assumptions, reviewer/plan-reviewer new
      concerns[], architect plan/revise, consult decisions, wave/plan-closeup,
      architect wave-report/closeup. Triage, infra, and pm-edit mechanical
      outputs are explicitly out of scope (no LLM synthesis). Consults aggregate
      via runItemConsult/runNonItemConsult writeArtifact. Reviewer ordering:
      aggregate new concerns first, then triage only pre-existing ids."
    id: adr-producer-matrix
    title: Producer matrix and reviewer ordering


--- Prior Plan plan-2.yaml ---
iteration: 2
milestones:
  - directionalInterfaces:
      - "step-runner/iteration ->
        triage.hydrateStepConcerns(taskDir,{stepRole,bytes,consumer}): callers
        compute bytes (step-runner item diff; iteration taskDiff/input), callee
        caps+renders; skip rule (caller-supplied wins); '' on zero-cap/empty
        (hydrateConcernsYaml deleted)"
      - aggregateConcerns -> mergeConcern(new id; affects-union incl terminal;
        escalated on rise) + legacy dual-lookup rename; KeyedMutex RMW + taskWt
        commitAll unchanged; journal on skip
      - buildArchitectHydration -> debt/steering WITHOUT concerns (UTF-8
        capped); architect turns consume concernsYaml (architect set incl
        escalated notes) as single source
      - prompts.render <- KNOWN_VARS (prompt-fragments extends producer
        fragments); terse 2-3-line sections; per-fragment +<=15, total +<=80,
        prompts.test asserts
    id: m1-hydration-prompts
    scenarios:
      - Given task-branch diff 5000 bytes and open concerns 3000 bytes When
        wave-close-up hydrates Then concernsYaml is <=2000 bytes and < task diff
        in UTF-8 bytes
      - Given zero-diff plan-review with 4000-byte input in iteration 2+ When
        hydrating Then concernsYaml is <=500 bytes and < input bytes
      - Given a dismissed concern re-emitted with higher severity When merge and
        hydration run Then status stays dismissed, source.escalated=true, a
        q-escalated-<cid> digest entry exists with blocks=[], and the escalation
        appears in architect concernsYaml
      - Given the same concern re-emitted with added affects When merge runs
        Then a single file holds union affects with no fork; a legacy old-hash
        file is rename-merged and the triage id stays stable
      - "Given each matrix fragment rendering When preflight and render run Then
        required sentinels appear (## Open Concerns + Raise concerns on all 19;
        ## Human involvement on review/qa/plan-review/architect-*/close-ups)
        with per-fragment added lines <=15 and total <=80"
      - Given zero-byte diff and input When hydrating Then concernsYaml renders
        '' with standing heading/instructions but zero id lines
      - Given an open rm-* remarkable When review and architect prompts hydrate
        Then concernsYaml includes it as {id, kind remarkable, summary chosen}
    title: Hydration, caps, fingerprint, prompts
  - directionalInterfaces:
      - "producers -> JSON schemas + artifacts.ts (concernConfirms,
        concernResolution, concerns/remarkable incl review remarkable, lowercase
        detail): schemas validate, TS mirrors, no runtime"
      - engine.runChildTask -> propagateEpicConcerns(childTaskDir =>
        parent.taskDir/concerns on parentWt, commit:false writes,
        KeyedMutex(parentWt) atomic record) + forward blocking questions to
        parent root mailbox; condensed per-epic ids, restart-idempotent merge
    id: m2-contracts-epic
    scenarios:
      - Given structured concerns/remarkable from developer (incl
        poc/test-assumptions/test-first/simple-implement/fix-round), fact-finder
        (incl research), qa, reviewer/plan-reviewer newConcerns+remarkable,
        plan/revise, decisions incl concernResolution, close-ups incl
        concernResolutions, and architect reports incl concernConfirms When
        validation and typecheck run Then all pass with matching TS types,
        lowercase detail persists, reviewer remarkable no longer fails
        additionalProperties, and triage/infra/pm-edit still reject concerns
      - Given a child epic finishing with one dismissed and one open concern
        with 800-byte detail When runChildTask completes Then the parent gains
        exactly one copy with id from [epic] summary, detail <=500 bytes and
        strictly shorter via char-safe half-cut, source.epic set, while
        dismissed stays local; a <=120-byte detail copies verbatim
      - Given a propagated epic concern When the saga architect hydrates Then
        concernsYaml contains the epic id and summary; a restart creates no
        duplicate; the child blocking question is forwarded as
        q-epic-<epic>-<orig> with mapped blocks; open copies alone cause no
        parent exit-10
    title: Contracts and epic propagation
  - directionalInterfaces:
      - "ingestStepConcerns -> triage.applyReviewTriage ->
        routeHumanDisposition(all triagers): q-concern-/q-escalated- writes via
        writeQuestion (blocks vs digest), dedup by existence; item-machine raw
        path skips ALL concern-id human-*"
      - ingest allowlist gate keyed on source.agent (post-validation
        skip+journal, step ok) + severity gates (digest>=minDigest,
        blocks>=minBlocking else downgrade; rm exempt); defaults medium/high =
        shipped
      - derive/task.collectRoutedBlockers(taskDir,minBlocking) severity-aware +
        call-site threading; close-up/architect/consult ingest -> pending ->
        confirms (accept resolve/carry/propagate | reject clear+preserve) +
        consult resolve->resolved with cross-emission guard; wave-close-up
        fallback over triage-less open
    id: m3-routing-lifecycle
    scenarios:
      - Given a routed high blocker whose affects names a declared dependent
        When derive and wave-act run Then the dependent derives blocked, exactly
        one decisions/concern-<cid>.yaml is written, and a restart writes no
        second file
      - Given a routed architect concern When the next architect-plan turn
        hydrates Then its concernsYaml input contains that concern id and
        summary
      - Given reviewer suggestion matching a concern id with disposition dismiss
        and detail When review commits Then that file has status dismissed plus
        dismissReason=detail, is kept, and causes no mailbox, debt, blocked, or
        approval effect
      - Given an rm-* remarkable triaged architect or dismissed When routing
        runs Then it becomes routed with disposition persisted or dismissed with
        reason; routed rm-* gains a digest entry with blocks=[] that never
        blocks or halts
      - Given a routed human-async concern When routing runs Then mailbox
        q-concern-<cid> blocks the item and the engine continues without exit
        10; given plan-reviewer human-stop Then a single q-concern-<cid> blocks
        task/item and the engine halts with exit 10
      - Given raiseAllowlist excluding qa When QA emits newConcerns Then no file
        is written, the skip is journaled, and the step stays ok; given
        minBlockingSeverity high and a low human-stop Then it is downgraded to
        digest with no blocks and no exit-10
      - Given a low blocker routed When derive runs Then the dependent is NOT
        blocked (severity-aware collectRoutedBlockers); the concern still
        appears in hydration and digest per minDigest
      - Given wave-close-up emitting concernResolutions for triaged ids When it
        commits Then pendingResolution is proposed with status unchanged;
        architect concernConfirms accept applies resolved/routed/propagated and
        reject clears pending preserving status with no disposition
      - Given a concern consult decision carrying concernResolution {id,
        resolve} When it commits Then the bound concern becomes resolved and the
        dependent unblocks on next derive; an item-consult decision carrying
        concernResolution is ignored with a journal note
      - Given a simple item with open concerns and no reviewer When
        wave-close-up runs Then explicit resolutions propose pending for those
        ids; fallback auto-routes only triage-less open tech-debt to optional
        (appearing in the derived debt list) and assumption/risk/question to
        architect; kind=blocker stays open and human-* dispositions are never
        assigned
      - Given pipeline.yaml humanInvolvement detailed When reviewer and
        architect prompts render Then the detailed criteria fragment is
        included; pipeline.default.yaml ships commented
        autonomous/principal/detailed presets with the fragment->agent mapping
    title: Human routing, severity, lifecycle
  - directionalInterfaces:
      - "docs-finish-v3 delivers: ARCHITECTURE §1 row18 + §8.11 +
        §5/§6.2/§8.7/§10/§11/§13, README section, pipeline commentary,
        human-involvement.md deviation note; prompts.test matrix + 15/80
        budgets; TMPDIR=/tmp gates green"
    id: m4-docs-gates
    scenarios:
      - Given implementation complete When grep runs Then ARCHITECTURE contains
        '8.11 Concerns' and 'immediate halt', §1 row 18 no longer contains
        'Deliberately not hand-built', README contains a concerns/modes section,
        and config commentary matches landed severity/router semantics
      - Given prompt fragments When prompts.test runs Then the KNOWN_VARS matrix
        and 15-per-fragment/80-total budgets pass
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    title: Docs and gates
itemOutlines:
  - deps: []
    description: "Own concerns.ts + triage.ts hydration + step-runner injection +
      iteration hydration bytes. hydrateStepConcerns + listHydratedConcerns per
      adr-hydration-single-cap (stepRole table, caller-computed bytes, skip
      rule, '' semantics, injectable gitFn) + adr-hydrated-sets. Delete
      hydrateConcernsYaml; buildArchitectHydration drops concerns, UTF-8 capped.
      Fingerprint kind+summary+location, affects-union incl terminal, legacy
      dual-lookup rename. Regression tests: iter2+ plan-review <=500B,
      open+pending visibility, 0/1/3-byte caps -> ''. Behavior tests only.
      Verify typecheck + TMPDIR=/tmp bun test."
    kind: story
    milestoneId: m1-hydration-prompts
    prodBudgetHint: 250
    slug: hydration-fingerprint-caps
    title: Unified hydration, caps, fingerprint
  - deps: []
    description: "Schemas + TS only, no ingest/apply. artifacts.ts: DeveloperOutput
      concerns Concern[], ReviewArtifact newConcerns + remarkable,
      FactFinder/WaveCloseup/PlanCloseup/Decision concerns/remarkable,
      ConcernConfirms + ConcernResolution types. review-schema.ts +
      review.schema.json: remarkable. Wave-report output + plan-closeup schemas:
      concernConfirms. decisions.schema + DecisionArtifact: concernResolution.
      Normalize ALL concern Detail->lowercase detail across schemas
      (developer-output capital-D bug) + regression test that lowercase detail
      validates and persists. triage/infra/pm-edit untouched. Verify typecheck +
      preflight."
    kind: story
    milestoneId: m2-contracts-epic
    prodBudgetHint: 140
    slug: contracts-drift-fix
    title: Producer type and schema drift
  - deps: []
    description: "Own prompt-vars.ts + fragments + matrix test. KNOWN_VARS:
      concernsYaml for
      develop/test-first/simple-implement/fix-round/poc/test-assumptions/resear\
      ch (+short forms); HI only where registered. Per-fragment delta per
      adr-prompt-fragment-matrix (producers OC+raise;
      triagers/architects/close-ups/qa +HI+condense). Per-fragment +<=15 lines,
      total +<=80; prompts.test per-fragment sentinels + budgets; update
      human-involvement-config.test.ts non-consumer assertion (develop leaves,
      triage/infra stay) + FRAGMENT_MATRIX. Behavior tests: sections render;
      mode switch changes criteria. Verify preflight + typecheck."
    kind: story
    milestoneId: m1-hydration-prompts
    prodBudgetHint: 120
    slug: prompt-fragments
    title: Fragment matrix and raise instructions
  - deps:
      - hydration-fingerprint-caps
    description: "Single routeHumanDisposition in triage for all triagers
      (async/stop/awareness + routed rm-* + dismissed-escalated digest;
      q-concern-/q-escalated-; dedup by existence); item-machine raw path skips
      ALL concern-id human-*. Severity: agent-keyed allowlist skip+journal (step
      ok); minDigest/minBlocking gates + downgrade (stop loses exit-10); rm
      exempt; defaults medium/high; commentary documents fragment->agent mapping
      (no allowlist entries added). Own derive: severity-aware
      collectRoutedBlockers(taskDir,minBlocking) + call-site threading (fallback
      high). Explicit fixture severities keep suite green. Behavior tests:
      plan/close-up routing, rm digest, skip+journal+ok, downgrade + derive
      unblocked, no double-write, exit-10 only blocking stop."
    escalate: true
    kind: story
    milestoneId: m3-routing-lifecycle
    prodBudgetHint: 280
    slug: human-router-severity
    title: Human router and severity policy
  - deps:
      - hydration-fingerprint-caps
    description: "engine.runChildTask -> propagateEpicConcerns per
      adr-epic-push-condensed (c-* + rm-* condensed push, commit:false writes,
      KeyedMutex(parentWt) atomic record, restart-idempotent merge preserving
      parent triage; forward blocking questions with blocks mapping).
      Spike-saga-commit/Decision 002 authoritative. Behavior tests: one
      condensed copy (incl rm-*), dismissed local, tiny-detail verbatim, saga
      input contains id, restart no dup, forwarded q-epic-* with mapped blocks,
      no parent halt from copies."
    escalate: true
    kind: story
    milestoneId: m2-contracts-epic
    prodBudgetHint: 190
    slug: epic-saga-propagate
    title: Epic to saga propagation
  - deps:
      - contracts-drift-fix
      - epic-saga-propagate
      - human-router-severity
    description: "Ingest + apply (schemas owned by contracts-drift-fix).
      ingestStepConcerns reads concernConfirms + concernResolution; consults.ts
      passthrough; cross-emission guard (honor only concern consults +
      closeup/architect contexts, else ignore+journal); ordering (consult apply
      at decision commit, confirms at architect ingest). Resolutions->pending;
      confirms accept (resolve/carry/propagate via epic helper) / reject (clear,
      preserve, no disposition). Wave-close-up fallback over triage-less open
      per ADR (blocker stays open; tech-debt->optional in derived debt;
      others->architect; never human-*). Behavior tests: pending/confirm matrix,
      reject preserves open, consult unblock by id, guard ignores item-consult
      resolution, fallback + debt, resolved reachable."
    escalate: true
    kind: story
    milestoneId: m3-routing-lifecycle
    prodBudgetHint: 240
    slug: closeup-lifecycle-resolve
    title: Close-up lifecycle and unblock
  - deps:
      - closeup-lifecycle-resolve
      - contracts-drift-fix
      - epic-saga-propagate
      - human-router-severity
      - hydration-fingerprint-caps
      - prompt-fragments
    description: "Deliverables: ARCHITECTURE §1 row 18 (drop 'Deliberately not
      hand-built') + new §8.11 + §5/§6.2/§8.7/§10/§11/§13, README
      concerns/modes, pipeline commentary sync, human-involvement.md + §8.11
      immediate-halt deviation note; prompts.test matrix + 15/80 budgets;
      consolidated coverage. Grep-asserted: '8.11 Concerns', 'immediate halt',
      README 'concerns', row-18 replacement. Final gates: bun run typecheck +
      TMPDIR=/tmp bun test green."
    kind: story
    milestoneId: m4-docs-gates
    prodBudgetHint: 100
    slug: docs-finish-v3
    title: Docs and suite consolidation
assumptions:
  - assumption: Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures
      do not mask regressions.
    why: Baseline red only under .factory-runtime TMPDIR; suite green with
      TMPDIR=/tmp. Hydration git uses explicit taskWt cwd, not worktree
      inference, so it is unaffected; tests still run TMPDIR=/tmp.
  - assumption: Spike findings spike-text-budget (byte caps) and spike-saga-commit
      (serialization/derive/commit/propagation, Decision 002 directives) remain
      authoritative; no re-run.
    why: Both accepted in iteration 1 with binding downstream directives;
      iteration-2 items implement them.
  - assumption: Dismissed/routed/resolved stay terminal-in-merge (status preserved;
      content merges + escalated flag); escalated-severity-on-dismissed surfaces
      in digest + architect hydration; triage is the only reopen path.
    why: Operator directive 1794112659180 decided keep + digest surfacing.
  - assumption: funnel-closeups-v3 unmerged branch is discarded; its retry guidance
      substance (step-role cap classification, pending visibility for
      open+routed, reject-preserves-status, zero-cap '') is captured in
      adr-hydration-single-cap and adr-closeup-lifecycle-resolved, which items
      implement.
    why: Iteration 1 closed with v3 running/unmerged; ADRs carry the normative
      substance so items need no branch reference.
  - assumption: Effective severity defaults are shipped medium/high (code fallback
      identical); tasks opt out via pipeline.yaml null/deletion.
    why: Aligns code with shipped pipeline.default.yaml; items keep suite green with
      explicit fixture severities.
  - assumption: Autonomous immediate-halt deviation accepted now; operator notified
      via open awareness item awareness-plan-2-autonomous-halt-deviation.
    disposition: human-awareness
    why: High-impact tradeoff visible in plan; architect decides, operator informed,
      docs mark it explicitly.
techDebt:
  - category: adjacent
    description: "Pre-existing head-guard failures when TMPDIR sits under
      .factory-runtime: inferTaskWorktree matches a folder-boundary tail yet 2
      failures persist via a different path. Baseline red; green with
      TMPDIR=/tmp. Out of scope. Hydration git uses explicit taskWt cwd (not
      worktree inference), so the new taskDiff path is unaffected."
    id: td-tmpdir-split
  - category: adjacent
    description: Unapplied spike-saga-commit reviewer optional nits (qualify
      epic-state-from-child-closeup with isMerged precedence, prefix inline
      paths, scope removeWorktree claim, fold contextPack key). Consumers apply
      mentally.
    id: td-spike-nits
adrs:
  - context: Two hydration helpers diverge; plan-review overrides terse value;
      buildArchitectHydration caps JS length and double-embeds concerns; byte
      sources, git seam, '' semantics, and step-runner/iteration double-compute
      undefined.
    decision: "triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,\
      taskDiffBytes?,consumer}) — callers compute bytes, callee caps+renders.
      stepRole table: review|qa -> min(diffBytes,2000), diffBytes=UTF-8 of
      promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000),
      taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via
      production git() with injectable gitFn;
      plan-review|architect-*|develop-family -> min(inputBytes,500),
      inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except
      concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule:
      step-runner computes only when caller promptVars lack concernsYaml
      (iteration-supplied wins, no race). '' when cap=0 or hydrated set empty;
      renderConcernsYaml '' when serialize([]) exceeds cap; standing headings
      remain, assertions count id lines. hydrateConcernsYaml deleted.
      buildArchitectHydration drops concerns section (UTF-8 capped); architect
      turns consume concernsYaml only."
    id: adr-hydration-single-cap
    title: Single hydration module with step-role byte caps
  - context: Predicates diverge (step-runner open-only, architect open+routed,
      hydrate open c-+rm-); terseConcern drops pendingResolution;
      dismissed+escalated and rm-* visibility undefined; RemarkableDecision has
      no severity.
    decision: "triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and
      plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open
      rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated
      notes. Terse shape + pendingResolution whenever present + rm-* as
      {id,kind:remarkable,summary:chosen}. countConcerns stays c-* only. rm-*
      exempt from severity gates, always digest-eligible when routed."
    id: adr-hydrated-sets
    title: Per-consumer hydration sets with rm rules
  - context: Fingerprint includes sorted affects so added refs fork files; stored
      files keyed by old hash; mergeConcern replaces affects; terminal
      content-merge vs terminal-in-merge ambiguous.
    decision: "Identity kind+normalized summary+location; affects merged as
      sorted-union INCLUDING on terminal statuses (status preserved,
      detail/severity/affects/escalated still merge; triage is the only reopen
      path). Migration: aggregate dual-lookup — compute new id; if file missing,
      scan store for legacy file with same kind+norm summary+location (any
      affects) and rename-merge into new id with union affects. No GC pass.
      Refines adr-fingerprint-merge."
    id: adr-fingerprint-affects-union
    title: Fingerprint identity without affects, union merge
  - context: Only review/plan-review consume hydration; KNOWN_VARS steps/develop
      lacks both vars; poc/test-assumptions/research produce concerns but are
      absent from matrix; test asserts develop lacks vars; budgets unclear.
    decision: "prompt-fragments owns prompt-vars.ts + fragments + test update.
      KNOWN_VARS gains concernsYaml on
      steps/develop,develop,steps/test-first,test-first,steps/simple-implement,\
      simple-implement,steps/fix-round,fix-round,steps/poc,poc,steps/test-assum\
      ptions,test-assumptions,steps/research,research (+humanInvolvementCriteria
      only where already registered). Sections: producers
      (develop-family+poc/test-assumptions/research) get 3-line ## Open Concerns
      {{concernsYaml}} + 1-line raise (no HI: they raise, never triage);
      triagers/architects/close-ups/qa get HI section + condense rule appended.
      Delta: architect-plan/revise add OC+raise; review adds HI+condense;
      plan-review adds raise+condense; rest add per above. Budgets: added lines
      per fragment <=15, total <=80 (2-3-line section convention); prompts.test
      asserts per-fragment sentinels (## Open Concerns, ## Human involvement,
      Raise concerns) + budgets; human-involvement-config.test.ts non-consumer
      assertion updated (develop leaves, triage/infra stay)."
    id: adr-prompt-fragment-matrix
    title: Full fragment matrix with raise instructions
  - context: Severity config never read; shipped medium/high + 8-agent allowlist;
      poc/test-assumptions run as agent developer (fragment-gated entries would
      be dead); gate order vs validation undefined.
    decision: "Gate key is source.agent (never fragment): developer covers
      develop/poc/test-assumptions/test-first/simple-implement/fix-round,
      fact-finder covers research, architect covers architect-*; shipped 8-agent
      allowlist is already the complete producer matrix — no entries added,
      commentary documents fragment->agent mapping. Effective defaults = shipped
      medium/high (code fallback identical). Order: schema validation first
      (triage/infra/pm-edit schema-reject), then ingest allowlist skip+journal
      with step ok. Digest iff severity>=minDigest; blocks iff
      severity>=minBlocking else downgrade to digest (stop loses exit-10). rm-*
      exempt."
    id: adr-severity-policy-active
    title: Active severity and allowlist policy
  - context: applyReviewTriage writes only human-async; awareness/stop rely on
      item-machine raw suggestions so plan/close-up/architect dispositions never
      reach mailbox; rm-* has no digest; item-machine double-writes;
      collectRoutedBlockers blocks severity-blind so downgrade is ineffective.
    decision: "Single routeHumanDisposition in triage for all triagers at ingest:
      human-async q-concern-<cid> blocks=[item]|[task]; human-stop blocks
      item+task + exit-10; human-awareness, routed rm-*, dismissed+escalated ->
      digest via writeQuestion human-awareness blocks=[]
      (q-concern-/q-escalated-), never blocking/halting. Dedup by existence.
      item-machine raw path skips ALL concern-id human-*. human-router-severity
      also owns derive: collectRoutedBlockers(taskDir,minBlocking) blocks only
      kind=blocker+routed+severity>=minBlocking;
      deriveTaskState/withRoutedBlocking thread
      pipeline.concerns.minBlockingSeverity (fallback high). Debt predicate
      unchanged."
    id: adr-human-router-single
    title: Single human-disposition router with severity-aware derive
  - context: applyCloseupResolutions records pending with no applier; resolved
      unreachable; consult decisions never transition concerns;
      concernConfirms/consult-resolution need schema+TS+ingest+apply owners;
      consults.ts drops unknown fields; fallback scope/terminology wrong
      (blocker auto-block, human-* vacuous).
    decision: "contracts-drift-fix owns schema+TS: concernConfirms?:
      [{id,confirm:accept|reject,note?}] in architect wave-report output +
      plan-closeup schema; decisions.schema + DecisionArtifact gain
      concernResolution?: {id, action: resolve|carry}; all concern Detail
      normalized to lowercase detail. closeup-lifecycle-resolve owns ingest
      (ingestStepConcerns reads both), consults.ts concernResolution
      passthrough, and apply: accept+resolve->resolved,
      accept+carry->routed+architect, accept+propagate->parent copy/digest via
      epic helper; reject clears pending, preserves status, no disposition.
      Consult act phase applies resolve->resolved at decision commit (unblocks
      next derive); honored only on concern consults + closeup/architect
      contexts, ignored+journaled elsewhere. Wave-close-up fallback over
      triage-less open (open, no pendingResolution, no disposition):
      tech-debt->optional (derived debt), assumption|risk|question->architect;
      kind=blocker stays open for explicit triage; fallback never assigns
      human-* dispositions."
    id: adr-closeup-lifecycle-resolved
    title: Close-up propose/confirm lifecycle with unblock
  - context: runChildTask writes only child-closeup + single commit; child concerns/
      isolated; spike-saga-commit/Decision 002 mandate push+forward; rm-*,
      commit ownership, parallel-epic races, forward mapping, back-sync, and
      truncation edge cases unspecified.
    decision: "engine.runChildTask calls
      propagateEpicConcerns({childTaskDir,parentTaskDir,parentWt,epic}) after
      runIteration before child-closeup write, every status: push open+routed
      (skip dismissed); c-* copies get summary [epic] <child summary>,
      id=recomputed fingerprint, status open, source {epic, record
      epic:<epic>/<child-record>}; child rm-* propagate as parent rm-* with
      chosen prefixed [epic], id recomputed, why condensed. Condense UTF-8
      char-safe: detail<=120B verbatim (tiny exemption); else cut to min(500B,
      half) on char boundary (strictly shorter guaranteed). Writes use aggregate
      opts {commit:false}; parent-side propagate+closeup+add+commit serialized
      under KeyedMutex(parentWt) (never repo.writeLock) so parallel epics cannot
      race; existing single commit covers copies+closeup. Forward
      childTaskDir/steer/tousertoreview entries with blocks.length>0 to
      parent.taskDir/steer/tousertoreview as q-epic-<epic>-<orig>, blocks mapped
      (child item slugs->epic; child-task-level->parent task slug; default
      [epic]). No back-sync: child run is complete; forwarded entries are
      parent-owned. Copies open/unrouted -> no parent halt; halt only via
      forwarded questions."
    id: adr-epic-push-condensed
    title: Epic push with condensed parent copies
  - context: Mode table says autonomous defers blocking until unblocked work drains,
      but implementation routes blocking ADRs at plan time and halts
      immediately; deferral needs drain scheduling.
    decision: Keep immediate halt as accepted deviation for iteration 2 (simpler,
      preserves exit-10 contract, matches tested behavior). Operator awareness
      item awareness-plan-2-autonomous-halt-deviation already open (filed at
      plan review); docs-finish-v3 marks the deviation explicitly in
      ARCHITECTURE 8.11 and human-involvement.md; drain-then-block scheduling is
      future work.
    id: adr-autonomous-immediate-halt
    title: Autonomous immediate halt accepted


--- Prior Plan plan-3.yaml ---
iteration: 3
milestones:
  - id: m1-contracts-consistency
    title: Contracts consistency
    scenarios:
      - Given the 6 runtime file schemas (decisions, developer-output,
        fact-finder-output, plan, plan-closeup incl architect-closeup,
        wave-closeup) plus reference review schema When
        test/contracts/concern-schemas.test.ts runs Then lowercase detail
        validates and capital-D Detail is rejected
      - Given a stored concern with 200-byte detail re-emitted with 20-byte
        detail When aggregateConcerns merges Then the stored 200-byte detail
        survives
      - Given composed resolveReviewAllowed(p,a,isTriagerAgent(a)) for
        wave-close-up/plan-close-up When resolved Then the allowed set excludes
        dismiss and the triager set equals {reviewer,plan-reviewer}
      - Given a pending dismiss proposal with note plus architect accept When
        ingest runs Then the concern becomes dismissed with dismissReason equal
        to the trimmed note, disposition dismiss, and pending cleared
      - Given a pending dismiss proposal without note plus architect accept When
        ingest runs Then the step errors with TriageValidationError and status
        plus pending are preserved with no partial transitions
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass with no regressions
    directionalInterfaces:
      - "step-runner (caller) validates producer outputs against the 6 runtime
        file schemas (callee contract: decisions, developer-output,
        fact-finder-output, plan, plan-closeup shared by architect-closeup,
        wave-closeup): lowercase detail accepted, capital-D Detail rejected with
        step error before any store write; aggregateConcerns/mergeConcern read
        lowercase detail with longest-wins"
      - "prompts/step-runner/item-machine (callers) consume composed
        resolveReviewAllowed(p,a,isTriagerAgent(a)) (callee): triager set
        {reviewer,plan-reviewer} get dismiss; wave-close-up/plan-close-up return
        false so dismiss excluded; close-up schemas carry no suggestions[] so
        re-triage honored solely via concernResolutions + architect
        concernConfirms + wave fallback"
      - "ingestStepConcerns (caller) pre-flights then calls applyConcernConfirms
        (callee, never throws TriageValidationError): every accept on pending
        dismiss requires non-empty pending.note else TriageValidationError
        before any mutate (all statuses+pendings preserved); accept+dismiss ->
        dismissed + disposition dismiss + dismissReason=pending.note trimmed +
        pending cleared; fallback never assigns dismiss, kind=blocker stays
        open"
  - id: m2-docs-gates
    title: Docs and gates
    scenarios:
      - Given ARCHITECTURE §1 row 18 When read Then it records item 18
        implemented with the epic-config, close-up-dismiss, saga-semantics, and
        immediate-halt deviations and no 'Deliberately not hand-built'
      - Given ARCHITECTURE §8.11 When read Then it documents store layout,
        fingerprint/dedup, remarkable aggregation/triage, triage contract,
        routing table, close-up propose-confirm incl dismiss, epic condensing,
        ADR blocking table, presets, and the 4 deviations
      - Given dispositions.md and rendered prompts When checked Then a terse
        dismiss row (reason required, kept) exists, the QA prompt excludes it
        while the reviewer prompt includes it, and prompts.test debloat budgets
        pass
      - Given README, pipeline.default.yaml, and human-involvement.md When read
        Then README shows per-task principal (low/medium) and detailed (low/low)
        examples plus status counts/digest output, commentary documents the
        fragment->agent mapping (developer covers
        develop/poc/test-assumptions/test-first/simple-implement/fix-round;
        fact-finder covers research; architect covers architect-*) with
        medium/high defaults, and the immediate-halt deviation is noted
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    directionalInterfaces:
      - "item-machine/iteration (callers) -> formatDispositionsSection(criteria,
        allowed) (callee): when allowed excludes dismiss, dismiss rows/rules are
        filtered from criteria text (QA prompt); when allowed includes dismiss,
        rows are kept (reviewer prompt); mirrors existing human-stop filtering"
itemOutlines:
  - slug: schema-detail-normalize
    kind: story
    title: Lowercase detail in producer schemas + merge fix
    description: "Normalize concern Detail->lowercase detail in 6 runtime file
      schemas (decisions, developer-output, fact-finder-output, plan,
      plan-closeup shared by architect-closeup, wave-closeup) + reference-only
      review.schema.json for consistency. One-line TS fix concerns.ts:72
      (existing?.Detail -> existing?.detail). Fix 3 test reads
      epic-saga-propagate.test.ts:307/313/319 to .detail. Tests: contract suites
      (lowercase passes, capital-D rejected) + longest-wins behavior test
      (200-byte stored survives 20-byte re-emit). triage/infra/pm-edit
      untouched. Verify typecheck + TMPDIR=/tmp bun test."
    milestoneId: m1-contracts-consistency
    deps: []
    prodBudgetHint: 25
  - slug: closeup-triager-cleanup
    kind: story
    title: Close-up triager cleanup + dismiss resolutions
    description: "Per adr-closeup-no-suggestions-triage: drop
      wave-close-up/plan-close-up from isTriagerAgent; add dismiss to
      CloseupConcernResolution/PendingConcernResolution (artifacts.ts) + local
      ConcernResolution (concerns.ts:16) + wave/plan-closeup schema action
      enums; ingestStepConcerns pre-flights accept-on-dismiss (non-empty
      pending.note else TriageValidationError, no writes); applyConcernConfirms
      accept+dismiss -> dismissed + disposition dismiss +
      dismissReason=pending.note trimmed + pending cleared; fallback unchanged.
      Tests: review-policy composed triager-set exclusion, closeup-lifecycle
      dismiss accept/error cases, closeup dismiss enum contract case. Verify
      typecheck + targeted suites + full gates."
    milestoneId: m1-contracts-consistency
    deps: []
    prodBudgetHint: 70
  - slug: docs-finish-v4
    kind: story
    title: Docs and suite consolidation
    description: "Docs closure over final landed behavior (source: context-pack §6
      Q1 deltas + Q2/Q3/Q7/Q9 deviations). ARCHITECTURE: §1 row18 implemented +
      4 deviations; §3 add concerns/triage/review-policy/adrs/epic-propagation
      modules; §5 config sample + fix line-117 inheritance claim to root-only;
      §6.2 add concerns/, decisions/concern-<id>.yaml, adrFolder; §8.7 dismiss +
      exact-id triage + thresholds + router; new §8.11 (store,
      fingerprint/dedup, remarkable aggregation/triage, triage contract, routing
      table, close-up propose-confirm incl dismiss, epic condensing, ADR table,
      presets); §10 outputs + fix close-up review claim; §13 18 suites;
      canonical ADR format vs historical notes. README Concerns section
      (principal low/medium, detailed low/low, status output). dispositions.md
      terse dismiss row. prompts.ts dismiss-row filter (mirror human-stop) +
      QA-excludes/reviewer-includes test + prompts.test debloat budgets (terse
      row; bump only if measured over). human-involvement.md + §8.11 halt note.
      pipeline commentary mapping + medium/high. Final gates green."
    milestoneId: m2-docs-gates
    deps:
      - closeup-triager-cleanup
      - schema-detail-normalize
    prodBudgetHint: 115
assumptions:
  - assumption: "Baseline is RED (not green): typecheck fails on concerns.ts:72
      capital-D read, test/contracts/concern-schemas.test.ts fails asserting
      lowercase detail against capital-D schemas, and
      test/engine/epic-saga-propagate.test.ts:307/313/319 read .Detail
      (undefined at runtime). Gates go green only after m1 lands. TMPDIR=/tmp is
      still required for the 2 pre-existing head-guard failures."
    why: Reviewer-verified red on 3 fronts; plan targets red-to-green closure in
      this iteration.
  - assumption: "Store/triage/routing/funnel/propagation behavior is frozen except
      the three scoped fixes: concerns.ts:72 lowercase read, close-up
      dismiss-via-resolutions with ingest pre-flight, and prompts.ts dismiss-row
      filtering."
    why: 18 behavior/contract suites cover the implementation; bounding iteration 3
      to the reviewed gaps avoids regressions.
  - assumption: Autonomous immediate-halt deviation stands as accepted; operator
      already notified via awareness-plan-2-autonomous-halt-deviation.
    why: Decided in iteration 2 planning; iteration 3 only documents it.
  - assumption: Epic config root-only deviation accepted as document-only; operator
      notified via open awareness item awareness-plan-3-epic-config-awareness.
    why: Operators setting mode once at root would otherwise be surprised; architect
      decides, operator informed.
    disposition: human-awareness
techDebt:
  - id: td-tmpdir-split
    description: Pre-existing head-guard failures when TMPDIR sits under
      .factory-runtime. Baseline red; green with TMPDIR=/tmp. Out of scope.
    category: adjacent
  - id: td-spike-nits
    description: Unapplied spike-saga-commit reviewer optional nits (qualify
      epic-state precedence, prefix inline paths, scope removeWorktree claim,
      fold contextPack key). Consumers apply mentally.
    category: adjacent
  - id: td-detail-casing
    description: Capital-D Detail in 6 runtime-bound file schemas rejects lowercase
      detail (review.schema.json reference-only, normalized for consistency);
      mergeConcern reads existing?.Detail so longest-wins never applies and
      typecheck fails; 3 epic-saga-propagate test reads use .Detail.
    category: impacting
    resolution: "Fix in schema-detail-normalize: normalize schemas + concerns.ts:72
      + 3 test reads; contract and longest-wins tests verify."
  - id: td-closeup-triager-dead
    description: wave/plan-close-up listed as triagers though close-up schemas
      reject suggestions[], advertising an unreachable dismiss path; close-up
      re-triage has no dismiss vocabulary.
    category: impacting
    resolution: "Fix in closeup-triager-cleanup: drop close-ups from isTriagerAgent,
      add dismiss to resolutions with ingest pre-flight and accept semantics."
adrs:
  - id: adr-epic-config-root-only
    title: Epic config inheritance documented as deviation
    context: ARCHITECTURE §5 claims epics inherit the parent task layer, but
      runTaskChild loads only the child task dir pipeline.yaml, so
      humanInvolvement/concerns/reviewPolicy set at root do not apply inside
      epics. Implementing parent-layer inheritance would change config loading
      semantics for all tasks, beyond item-18 closure scope.
    decision: "Document the deviation: per-task selectability holds per task
      directory (each epic child has its own pipeline.yaml), but epic children
      do not inherit the parent task layer. Record in the §1 row 18 rewrite and
      §5; no behavior change. Operator notified via open awareness item
      awareness-plan-3-epic-config-awareness."
  - id: adr-closeup-no-suggestions-triage
    title: Close-ups removed from triager set; dismiss via resolutions
    context: isTriagerAgent returns true for wave/plan-close-up and ingest would
      triage their suggestions[], but both close-up schemas set
      additionalProperties:false without a suggestions field, so the path is
      unreachable; real re-triage flows through concernResolutions + architect
      concernConfirms + wave fallback. Removing close-ups from the triager set
      would leave close-up re-triage with no dismiss path (resolutions allow
      only resolve/carry/propagate).
    decision: "Drop wave-close-up/plan-close-up from isTriagerAgent AND add dismiss
      to the close-up path: CloseupConcernResolution + PendingConcernResolution
      (artifacts.ts) + local ConcernResolution (concerns.ts:16) +
      wave/plan-closeup schema action enums gain dismiss. ingestStepConcerns
      pre-flights: before any mutate, every accept confirm whose
      pending.action==dismiss must have non-empty pending.note else it throws
      TriageValidationError (step errors; all statuses+pendings preserved, no
      partial transitions); applyConcernConfirms itself never throws
      TriageValidationError (avoids concerns<->triage cycle and in-mutate
      partial writes). accept+dismiss -> dismissed + disposition dismiss +
      dismissReason=pending.note trimmed + pending cleared. Wave fallback never
      assigns dismiss and leaves kind=blocker open."
  - id: adr-saga-funnel-semantics
    title: Propagated copies open-only; questions block
    context: Propagated epic copies preserve child affects slugs while parent
      collectRoutedBlockers matches parent item slugs, so copies can never
      derived-block the parent; copies stay open by design and only forwarded
      q-epic questions block (module header + epic-saga-propagate tests assert
      this intent).
    decision: "Document as the intended funnel semantic in §1 row 18 and §8.11: the
      saga architect resolves/steers propagated copies; epic-level blocking
      reaches the parent only via forwarded questions. No behavior change."
  - id: adr-autonomous-immediate-halt
    title: Autonomous immediate halt accepted (restated)
    context: Spec line 100 says autonomous blocks only for the portion still blocked
      after everything unblocked is done, but iteration.ts halts immediately at
      plan time on a blocking ADR. Prior ADR
      docs/adr/adr-autonomous-immediate-halt.md records this as accepted with
      operator awareness item awareness-plan-2-autonomous-halt-deviation.
    decision: "Restate and keep the accepted deviation for closure: immediate halt
      stands; drain-then-block scheduling stays future work. docs-finish-v4
      marks it explicitly in ARCHITECTURE §8.11 and
      agents/criteria/human-involvement.md."


--- Prior Close-up closeup-1.yaml ---
iteration: 1
status: next-iteration
summary: "Iteration 1 delivered M3 routing fully (pure derive + exactly-once
  consult + hydration + human/ADR/debt) plus M1 store/contracts and M2 triage
  cores, all green. Audit verified remaining gaps hold: M1 escalation surfacing
  + stale TS types; M2 fragment wiring partial (steps/review lacks
  humanInvolvementCriteria; architect reports/consults and close-ups lack
  concernsYaml/criteria); M4 funnel caps/confirms/fallback/saga propagation
  missing (only counts/status); M5 docs untouched — verified ARCHITECTURE §1 row
  18 still 'Deliberately not hand-built'. Tail unmergeable this iteration
  (amendments 3/3, funnel-closeups-v3 running, saga/docs pending on stale deps).
  Proceed to iteration 2 with the audited remainder."


--- Prior Close-up closeup-2.yaml ---
iteration: 2
status: next-iteration
summary: "Iteration 2 delivered m1 (unified step-role hydration, fingerprint
  union+legacy migration, 19-fragment matrix) and m3 (single human router,
  severity-aware derive, close-up propose/confirm lifecycle, consult unblock,
  fallback) with behavior tests, all merged. Audit findings verified and hold:
  m2 fails on the capital-D Detail drift — confirmed
  developer-output.schema.json:68 still declares \"Detail\" with
  additionalProperties:false, so lowercase detail is rejected and the contract
  suite must be red with runtime validation broken for file-schema producers
  (epic propagation itself is done). m4 untouched — confirmed ARCHITECTURE §1
  row 18 still reads 'Deliberately not hand-built' with docs-finish-v3 still
  running. Next iteration: normalize Detail->detail across the 7 schema files
  (small fix) and complete docs-finish-v3 (ARCH §8.11/row 18, README, commentary
  with fragment->agent mapping and immediate-halt deviation) with green
  TMPDIR=/tmp gates."


--- Prior Close-up closeup-3.yaml ---
iteration: 3
status: next-iteration
summary: "Iteration 3 partially delivered: close-up triager/dismiss path
  verified (m1 scenarios 3-5 pass; triager set, pre-flight, trimmed-note dismiss
  all behavior-tested), but schema-detail normalization never merged
  (schema-detail-normalize still running) and docs-finish-v4 never started.
  Verified on live tree: all producer schemas still declare capital-D Detail
  (e.g. developer-output.schema.json:68, plan-closeup.schema.json:34) so
  lowercase-detail contracts must fail; concerns.ts:72 reads existing?.Detail
  (undefined; longest-wins dead); epic-saga-propagate.test.ts:307/313/319 still
  read .Detail; ARCHITECTURE.md:39 still 'Deliberately not hand-built' with no
  §8.11; dispositions.md has no dismiss row; README has no Concerns section.
  Gates cannot be green. Iteration 4: land Detail->detail normalization (schemas
  + merge + test reads + longest-wins test) then complete docs-finish-v4 over
  final behavior; merged closeup-triager-cleanup carries forward as-is."


--- Steering Directive/Answer (1794112659180.md) ---
Operator acknowledges both plan-1 awareness items: (1) digest mailbox reuse — confirmed that digest/awareness dispositions must stay low-noise and non-blocking; status/derive/classify filtering keeps them out of the blocking set (verify in the funnel implementation; flag if any code path treats an empty-blocks awareness item as blocking). (2) merge escalation hidden — decision: keep dismissed/routed/resolved as terminal-in-merge, and surface escalated-severity-on-dismissed concerns in the digest (keep + digest surfacing). Triage remains the only path to reopen. No further action on these two.


--- Steering Directive/Answer (1794158471471.md) ---
Answer to escalation-funnel-closeups-v3-develop-a1: RETRY the develop step by resuming its session (01a1bc09 — the work is productive, not stuck: 49 reads were targeted verification, tests were written and a bun test run was 2s from output when the 20m active timeout fired). Guidance for the resumed turn: skip re-exploration, finish the funnel-closeups test run, fix only red failures, then yield. If it times out again, split the remaining verification into a smaller follow-up rather than a third full turn.


--- Decision 001-item-concerns-contracts.yaml ---
id: decision-concerns-contracts-1794104526635
context: item
item: concerns-contracts
afterRecord: 006-develop-a2
decision: split
timestamp: 2026-11-08T02:22:06.635Z
rationale: "Root cause is oversize + scope conflation, not logic: one item
  bundled types + ~12 schemas + new resolver + 3 call-site wirings + runtime
  repair, exceeding the 300-line story budget; 3 develop attempts produced an
  empty diff (scope paralysis). Repair/defaulting and dismiss-detail enforcement
  are runtime owned by concerns-store, but the assignment text pulled them into
  contracts, creating an unimplementable contract. Split into 3 sequenced
  stories (types -> schemas+policy parallel) each with a falsifiable budget and
  test."
text: "Engine: replace concerns-contracts with the 3 outlines; rewire downstream
  concerns-store/modes-prompts deps from concerns-contracts to all 3 children.
  Developers: do not implement aggregate/repair/triage runtime in these items;
  schemas declare optionality only. Do not use cross-file $ref in JSON schemas
  (inline the concern/remarkable partial). Keep each diff within its stated
  budget."
outlines:
  - deps: []
    description: "Types only. In src/core/artifacts.ts add
      Concern/ConcernKind/ConcernSeverity/ConcernStatus, RemarkableDecision,
      StoredConcernArtifact (+pendingResolution?, source.escalated?),
      ReviewDisposition+dismiss (no tech-debt value), PlanAdr.blocking,
      PipelineConfig.humanInvolvement +
      concerns{raiseAllowlist,minDigestSeverity,minBlockingSeverity},
      reviewPolicy.default canonical + legacy allowedDispositions alias in type.
      No JSON, no runtime, no repair logic (deferred to concerns-store). Verify:
      bun run typecheck. Prod budget <=80 lines."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-types
    title: Concern artifact types
  - deps:
      - concerns-contracts-types
    description: "Schemas only. Inline (no cross-file $ref) shared
      concern/remarkable definitions into developer-output, fact-finder-output,
      qa, poc, test-assumptions, review newConcerns, plan, decisions,
      wave/plan-closeup (+concernResolutions), architect wave-report/closeup
      outputs; triage/infra/pm-edit untouched. severity/detail optional at
      schema level (defaults applied at runtime by concerns-store); kind is
      strict enum so unknown kind fails validation with no write. Dismiss
      detail-required enforced at runtime (store), not in JSON schema. Verify:
      typecheck + prompts.test preflight + one FakeHarness behavior case in
      test/engine/concerns-funnel.test.ts (valid concerns pass, unknown kind
      errors, no file written). Prod budget <=200 lines JSON."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-schemas
    title: Concern producer schemas
  - deps:
      - concerns-contracts-types
    description: "Resolver only. New src/core/review-policy.ts
      resolveReviewAllowed(pipeline,agent,isTriager): precedence per-agent array
      > default > builtin [fix,optional,architect,human-awareness,human-async];
      legacy reviewPolicy.allowedDispositions read-alias for default; append
      dismiss iff isTriager. Wire the single resolver into item-machine review
      promptVars, step-runner schema path, iteration plan-review prompt+schema,
      and generateReviewSchema (dismiss in enum only for triagers; QA never).
      Verify: typecheck + FakeHarness review-step behavior (reviewer accepts
      dismiss id-match; QA rejects dismiss). Prod budget <=100 lines."
    kind: story
    milestoneId: m1-contracts-aggregate
    slug: concerns-contracts-policy
    title: Canonical review-policy resolver


--- Decision 002-item-spike-saga-commit.yaml ---
id: decision-spike-saga-commit-1794104673241
context: item
item: spike-saga-commit
afterRecord: 002-review-a1
decision: accept-with-debt
timestamp: 2026-11-08T02:24:33.241Z
rationale: Research answered all 5 questions with line-grounded evidence plus
  execution probes; review approved with only optional nits; tree clean with no
  prod code. Merge quality-gate failure cannot be caused by a read-only spike
  and matches the known red baseline (TMPDIR head-guard). Re-running or
  splitting a complete spike wastes budget and blocks 3 gated items.
text: "Binding downstream directives from accepted findings: concerns-store: one
  file per fingerprint id, writeYamlAtomic distinct files, KeyedMutex(taskDir)
  only for status/source RMW merges, NEVER wrap commitAll in
  repo.writeLock.runExclusive (non-reentrant deadlock proven), write explicit
  taskWt path + immediate commitAll, add concerns/** to startup recovery +
  reconcileConcerns from committed records (derive stays read-only), ingest
  errors must not change step status (act-phase hook with internal handling).
  Hydration: append concerns LAST in buildArchitectHydration (tail-slice keeps
  it) or add registered concernsYaml var in prompt-vars.ts; recompute before
  wave-report (iteration-start snapshot stale). Derive: collectRoutedBlockers
  owner derive/task.ts; thread blockedBy into deriveItemState or post-process
  before every deriveWaveState call; debt in debtSet block. Digest:
  tousertoreview reuse REQUIRES derive/item blocking change (any open matching
  ref blocks today) or separate digest dir. Triage: partition concern entries
  out of fix-loop; plan-review has no writeArtifact so re-apply verdicts
  idempotently. Consults: avoid seq-allocated filenames under parallel consults
  (fingerprint ids or lock); trigger from wave act phase. Saga: copy
  filtered/condensed child concerns at runChildTask engine.ts:246-274 for every
  child status; forward child human questions to root mailbox (rootTaskDir
  unused today). Note pre-existing next-iteration->failed mapping."
debt: "spike-saga-commit merge gate failure is environmental, not content:
  read-only spike with zero prod diff, research ok, review approved; baseline
  test gate is red (2 head-guard TMPDIR failures). Findings accepted as
  authoritative. Unapplied reviewer optional nits carried as debt: qualify 'epic
  state ONLY from child-closeup' (isMerged precedence), prefix inline paths with
  plugins/software-factory/, scope removeWorktree claim to epic child worktrees,
  fold contextPack key into findings (strict fact-finder schema allows only
  status/summary/findings/sources/recommendations). Consumers must apply these
  mentally."


--- Decision 003-amend-remove-adr-blocking-digest.yaml ---
id: decision-amend-remove-adr-blocking-digest
context: wave
item: adr-blocking-digest
decision: split
rationale: Amendment removed pending item adr-blocking-digest
timestamp: 2026-11-08T06:03:02.905Z


--- Decision 004-amend-remove-concerns-store.yaml ---
id: decision-amend-remove-concerns-store
context: wave
item: concerns-store
decision: split
rationale: Amendment removed pending item concerns-store
timestamp: 2026-11-08T06:03:02.905Z


--- Decision 005-amend-remove-docs-finish.yaml ---
id: decision-amend-remove-docs-finish
context: wave
item: docs-finish
decision: split
rationale: Amendment removed pending item docs-finish
timestamp: 2026-11-08T06:03:02.905Z


--- Decision 006-amend-remove-funnel-closeups.yaml ---
id: decision-amend-remove-funnel-closeups
context: wave
item: funnel-closeups
decision: split
rationale: Amendment removed pending item funnel-closeups
timestamp: 2026-11-08T06:03:02.905Z


--- Decision 007-amend-remove-modes-prompts.yaml ---
id: decision-amend-remove-modes-prompts
context: wave
item: modes-prompts
decision: split
rationale: Amendment removed pending item modes-prompts
timestamp: 2026-11-08T06:03:02.905Z


--- Decision 008-amend-remove-plan-reviewer-triage.yaml ---
id: decision-amend-remove-plan-reviewer-triage
context: wave
item: plan-reviewer-triage
decision: split
rationale: Amendment removed pending item plan-reviewer-triage
timestamp: 2026-11-08T06:03:02.905Z


--- Decision 009-amend-remove-reviewer-triage.yaml ---
id: decision-amend-remove-reviewer-triage
context: wave
item: reviewer-triage
decision: split
rationale: Amendment removed pending item reviewer-triage
timestamp: 2026-11-08T06:03:02.906Z


--- Decision 010-amend-remove-routing-architect-consult.yaml ---
id: decision-amend-remove-routing-architect-consult
context: wave
item: routing-architect-consult
decision: split
rationale: Amendment removed pending item routing-architect-consult
timestamp: 2026-11-08T06:03:02.906Z


--- Decision 011-amend-remove-routing-blocker-derive.yaml ---
id: decision-amend-remove-routing-blocker-derive
context: wave
item: routing-blocker-derive
decision: split
rationale: Amendment removed pending item routing-blocker-derive
timestamp: 2026-11-08T06:03:02.906Z


--- Decision 012-amend-remove-routing-human-debt.yaml ---
id: decision-amend-remove-routing-human-debt
context: wave
item: routing-human-debt
decision: split
rationale: Amendment removed pending item routing-human-debt
timestamp: 2026-11-08T06:03:02.906Z


--- Decision 013-amend-remove-saga-propagate.yaml ---
id: decision-amend-remove-saga-propagate
context: wave
item: saga-propagate
decision: split
rationale: Amendment removed pending item saga-propagate
timestamp: 2026-11-08T06:03:02.906Z


--- Decision 014-amend-remove-status-state-surface.yaml ---
id: decision-amend-remove-status-state-surface
context: wave
item: status-state-surface
decision: split
rationale: Amendment removed pending item status-state-surface
timestamp: 2026-11-08T06:03:02.906Z


--- Decision 015-item-concerns-store-v2.yaml ---
id: decision-concerns-store-v2-1794123864467
context: item
item: concerns-store-v2
afterRecord: 008-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T07:44:24.467Z
rationale: "Reviewer defect is valid and blocks M1 restart-idempotency
  invariant: unconditional replay with wall-clock timestamps rewrites every
  concern and commits per record on each startup, churning updatedAt/lastSeen
  and git history. Root cause is localized to aggregate/reconcile timestamp and
  dirty handling, fixable in one small round. No split or escalation warranted."
text: "Fix reconcile idempotency in concerns-store-v2 (one round): 1) Add
  opts.at to aggregateConcerns/merge (default now ISO). Live step seams keep
  wall-clock; reconcile passes meta.endedAt. 2) Write-only-on-diff: compare
  merged vs existing on content fields (detail, severity, sources, status,
  disposition, escalated); if equal and existing lastSeen >= at, skip
  writeYamlAtomic entirely. Else write with updatedAt=at,
  lastSeen=max(existing.lastSeen, at). 3) reconcileConcerns: enumerate committed
  ok records (runs + items/*/steps), read meta.endedAt, sort ascending (fallback
  seq/name), replay in order with at=endedAt; track dirty flag; single commitAll
  at end only if dirty — remove per-record commitAll from replay path. 4)
  Strengthen idempotency test: hash concern files + git rev-parse HEAD after
  first reconcile, run reconcile again, assert bytes and HEAD unchanged and
  updatedAt/lastSeen equal endedAt values. Keep KeyedMutex RMW-only, never wrap
  commitAll in repo.writeLock, ingest errors never change step status."
persist: true


--- Decision 016-item-adr-blocking-digest-v2.yaml ---
id: decision-adr-blocking-digest-v2-1794145301769
context: item
item: adr-blocking-digest-v2
afterRecord: 007-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T13:41:41.769Z
rationale: "Reviewer defect verified and valid: humanInvolvementCriteria is
  computed (step-runner.ts:300-304) and registered in KNOWN_VARS for
  architect/review steps (prompt-vars.ts:95-131), but zero fragments under
  agents/ contain the {{humanInvolvementCriteria}} placeholder, so the
  mode/blocking table is computed then silently dropped — preflight cannot catch
  unused vars. Architects must classify blocking per a table they never see,
  making blocking-vs-remarkable routing unguided. Fix is small and localized (3
  fragment edits + 1 render test); no split or escalation warranted."
text: "Fix in adr-blocking-digest-v2 (one round): 1) Add a terse
  `{{humanInvolvementCriteria}}` section to agents/steps/architect-plan.md,
  agents/steps/architect-revise.md, and agents/steps/plan-review.md (plan-review
  triages ADR/concern blocking per matrix). Insert after the existing
  criteria/dispositions block with a short heading (e.g. `## Human involvement`
  + placeholder only, no prose duplication — criteria text comes from
  agents/criteria/human-involvement.md via formatHumanInvolvementCriteria). Keep
  each addition ≤5 lines to respect the 15/60 debloat budget. 2) Do NOT touch
  step-runner computation or KNOWN_VARS registration (already correct). 3) Add a
  prompt-render test (extend test/human-involvement-config.test.ts): render
  architect-plan, architect-revise, and plan-review prompts with a sentinel
  humanInvolvementCriteria string and assert the sentinel appears in each
  rendered prompt. 4) Verify: bun run typecheck + TMPDIR=/tmp bun test
  (prompts.test preflight must stay green). Out of scope: steps/review
  placeholder (triage items own it), digest/blocking logic changes."
persist: true


--- Decision 017-item-routing-architect-consult-v2.yaml ---
id: decision-routing-architect-consult-v2-1794147542063
context: item
item: routing-architect-consult-v2
afterRecord: 004-review-r1-a1
decision: retry-with-guidance
timestamp: 2026-11-08T14:19:02.063Z
rationale: "Item is implementation-complete and review-clean: target tests
  red->green verified, QA approved, reviewer approved with only optionals,
  develop gates green (371 pass, typecheck pass, size 213/300). Merge-path test
  failure with no new fix requests points to merge-time causes (stale
  base/conflict resolution with wave-9 siblings touching iteration.ts,
  environmental TMPDIR/head-guard flake, or cross-test interference) rather than
  a design defect. No split/escalation warranted."
text: "Retry routing-architect-consult-v2 merge in one round: 1) Pull the exact
  merge-gate failure (failing test names + output), not the develop gate —
  report them in evidence. 2) Rebase onto current topic tip; wave-9 siblings
  (adr-blocking-digest-v2, status-state-surface-v2) also touch
  iteration.ts/derive — verify conflict resolution kept BOTH this item's
  consultRoutedBlockers call sites + hydration section AND sibling changes. 3)
  Reproduce with TMPDIR=/tmp: targeted file first, then full `bun test`; if
  failures are head-guard/TMPDIR flakes or lock/timeout flakes, re-run clean and
  note it. 4) If failures are real regressions, fix narrowly without redesign:
  consult must fire only for kind==blocker && status==routed with
  affects∩blocked-wave-items, guard on decisions/concern-<cid>.yaml existence
  (no rewrite, no second turn on restart); hydration section stays
  LAST-appended, open+routed only, plan-reviewer path stays open-only. 5) Do NOT
  apply the 4 optional nits unless they fix the failure
  (sub-budget/sanitize/barrel/prompt-align are debt for docs-finish). Keep diff
  within budget."
persist: false


--- Decision 018-amend-remove-funnel-closeups-v2.yaml ---
id: decision-amend-remove-funnel-closeups-v2
context: wave
item: funnel-closeups-v2
decision: split
rationale: Amendment removed pending item funnel-closeups-v2
timestamp: 2026-11-08T14:30:22.915Z


--- Decision 019-amend-remove-saga-propagate-v2.yaml ---
id: decision-amend-remove-saga-propagate-v2
context: wave
item: saga-propagate-v2
decision: split
rationale: Amendment removed pending item saga-propagate-v2
timestamp: 2026-11-08T14:30:22.915Z


--- Decision 020-item-funnel-closeups-v3.yaml ---
id: decision-funnel-closeups-v3-1794156080522
context: item
item: funnel-closeups-v3
afterRecord: 008-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T16:41:20.522Z
rationale: All 4 FIX findings are probe-verified contract breaches against cited
  spike/ADR text (wrong-cap classification, invisible pending proposals, reject
  burying open concerns, zero-input over-hydration), not judgment calls. Each
  has a localized mechanical fix in the item's own new code
  (hydrateStepConcerns, terseConcern, applyConcernConfirms, renderConcernsYaml
  edge). Base-tree check confirms the defects live in the unmerged work (no
  hydrateStepConfirms/hydrateStepConcerns on base; base renderConcernsYaml still
  returns serialize([])). One guided round should close all four; no split or
  escalation warranted.
text: "Fix funnel-closeups-v3 in one round (4 defects, all in your new code): 1)
  STEP-ROLE CAP CLASSIFICATION: delete the `git diff main HEAD > 0` branch-state
  inference in hydrateStepConcerns. Classify by step: review/qa steps -> UTF-8
  bytes of promptVars.diff -> cap min(diff,2000); wave-close-up/plan-close-up ->
  aggregated task-branch diff bytes -> min(diff,2000); plan-review +
  architect-plan/revise/wave-report/closeup/consults -> sum of registered input
  prompt-var bytes -> cap min(input,500). Add regression test: plan-review in
  iteration 2+ with merged code on branch hydrates <=500 bytes and < input bytes
  (replay the 294-byte-input probe). 2) PENDING VISIBILITY: in terseConcern emit
  `pendingResolution` whenever the field is present, regardless of status (open
  AND routed) — plan-close-up targets open concerns and architects must see the
  proposal to accept/reject. Extend hydration test to assert the block for an
  open+pending concern. 3) REJECT PRESERVES STATUS: in applyConcernConfirms,
  reject must clear pendingResolution, set NO disposition, and keep the
  concern's existing status (open stays open, routed stays routed); only
  accept+resolve -> resolved, accept+carry -> routed+disposition,
  accept+propagate -> propagate path. Add regression test: reject on an
  open+pending concern yields status open with no disposition, and
  listHydratedConcerns still returns it. 4) ZERO CAPS: when the computed cap is
  0 (zero-diff branch with inputBytes===0, or diffBytes===0 for code steps)
  return '' with no concerns block; in renderConcernsYaml return '' when
  serialize([]) itself exceeds maxBytes. Add edge tests: all-zero prompt vars ->
  '' hydration; 1-byte and 3-byte diff caps -> '' (not '[]'). Verify: bun run
  typecheck + TMPDIR=/tmp bun test (full suite green); keep diff within budget,
  no redesign beyond these four fixes."
persist: true


--- Decision 021-item-hydration-fingerprint-caps.yaml ---
id: decision-hydration-fingerprint-caps-1794176143790
context: item
item: hydration-fingerprint-caps
afterRecord: 006-qa-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-08T22:15:43.790Z
rationale: "Both remaining FIX items are test-strengthening gaps, not prod
  defects: cap tests render 185-249 bytes (never truncate, so any cap value
  passes) and the legacy detail-preservation gate at concerns.ts:119 has no
  regression coverage. Prod implementation is accepted; one test-only round
  closes both with falsifiable assertions."
text: "Test-only round for hydration-fingerprint-caps (no prod changes
  expected): 1) Cap discrimination tests: build fixtures whose UNCAPPED terse
  serialization exceeds each cap (many concerns or long summaries). Review
  (diffBytes 5000) and wave-close-up (taskDiffBytes 5000): assert rendered <=
  2000 AND > 500 bytes (proves 2000 applied, not 500) and assert condensation
  actually occurred (compare against uncapped render: fewer id lines or
  truncated-summary marker). Plan-review: use inputBytes < 500 (e.g. 294) with
  payload > input; assert rendered <= inputBytes and < input bytes (proves
  min(input,500)). Add a runAgentStep-level plan-review case WITHOUT caller
  concernsYaml override and with large prompt inputs incl.
  debt/steering/concernsYaml/humanInvolvementCriteria values, asserting
  hydration excludes those four keys from the inputBytes sum (direct
  hydrateStepConcerns calls do not cover step-runner summation). 2) Legacy gate
  regression test: seed a legacy old-hash file (affects-bearing id) with stored
  detail LONGER than summary; re-emit the same concern omitting detail; assert
  stored detail survives, affects union equals [new,old], new stable id file
  exists, legacy file removed. Sanity-check the test fails when the gate is
  reverted to merged.detail = (input.detail ?? input.summary).trim(). Verify:
  bun run typecheck + TMPDIR=/tmp bun test on the item's test file(s), then full
  suite green."
persist: true


--- Decision 022-item-docs-finish-v3.yaml ---
id: decision-docs-finish-v3-1794197936587
context: item
item: docs-finish-v3
afterRecord: 004-qa-r1-a2
decision: retry-with-guidance
timestamp: 2026-11-09T04:18:56.587Z
rationale: "Red-test gate correctly rejects: 9/11 docs tests pass on the base
  tree, so they do not prove the item's change. Only the source.agent and
  immediate-halt needle tests properly fail on base. Root cause is weak needles
  matching pre-existing base content (e.g. row-18 title already contains
  'concerns'; 'dismiss'/'concerns'/'digest' already appear in base docs), not
  missing docs. Small, localized test-only fix: tighten needles to base-absent
  sentinels."
text: "Test-only round for docs-finish-v3 (no docs/content changes expected
  beyond test alignment): 1) In test/docs-concerns.test.ts make ALL 11 tests
  base-failing: replace generic needles with sentinels unique to this item's new
  content. Row-18 test: assert row 18 contains the new shipped-description
  sentinel AND does NOT contain 'Deliberately not hand-built'. §8.11 test:
  assert the '8.11 Concerns' heading exists (absent on base).
  §5/§6.2/§8.7/§10/§11/§13/README tests: assert exact new phrases added by this
  item, never bare words ('concerns', 'dismiss', 'digest', 'counts') that
  already occur on base. Keep the 2 already-red tests (source.agent, immediate
  halt) as-is. 2) Verify red-then-green explicitly: run the test file against a
  pristine base worktree (expect 11 fail), then on the branch (expect 11 pass).
  3) Verify: bun run typecheck + TMPDIR=/tmp bun test on the test file, then
  full suite green. Do not weaken assertions to pass red-test cosmetically —
  each needle must name content this item adds."
persist: true


--- Decision 023-item-schema-detail-normalize.yaml ---
id: decision-schema-detail-normalize-1794206496998
context: item
item: schema-detail-normalize
afterRecord: 002-test-first-r1-a2
decision: retry-with-guidance
timestamp: 2026-11-09T06:41:36.998Z
rationale: Both test-first attempts wrote the new test file but yielded output
  with no `target` field, so the mechanical target-red check fails at
  runner.ts:333 before running anything ('No target specified'). This is a
  yield-shape omission, not a code problem. The item is small and well-scoped;
  no split or escalation needed.
text: "Retry test-first. Root cause of both rejections: your yield omitted
  `target`. You MUST yield `target: { selectors:
  ['test/contracts/schema-detail-normalize.test.ts'], expectRed: ['<exact
  it/test name 1>', '<exact it/test name 2>', ...] }` where every expectRed
  string is the EXACT name from an it()/test() block in your new file (bun-junit
  matching is by test-name segment; minItems 1). Scope: touch ONLY paths.tests
  (new file). Do NOT touch schemas, src, or epic-saga-propagate.test.ts in this
  step — test-first-scope rejects prod changes; the 3 .Detail read fixes +
  schemas + concerns.ts:72 belong to the develop step. Red semantics: each
  expectRed id must FAIL by assertion on current prod (lowercase-detail contract
  assertions fail against capital-D schemas; longest-wins fails because merge
  reads existing?.Detail). Collection/import/syntax errors do NOT count as red.
  Prove locally before yielding: cd plugins/software-factory && TMPDIR=/tmp bun
  test test/contracts/schema-detail-normalize.test.ts and confirm your declared
  ids fail with assertion failures."
persist: true


## Context Pack
# Context Pack — concerns-funnel (Spec Item 18)

## 0. Snapshot (verified 2026-11-09)

| Fact | Evidence |
|---|---|
| Task | spec item 18 of `docs/factory.v2.md:89-103` (acceptance definition) |
| Code state | plugin sources committed at worktree HEAD `b3450c9` (`factory: context-pack-4 a1`); plugin tree clean (only factory journal dirty) |
| Test health | `cd plugins/software-factory && bun test` → **445 pass, 2 skip, 0 fail**, 2468 expect() calls, 69 files, 105s |
| Concern-focused subset | 17 files / **137 pass, 0 fail** (concerns-funnel, reviewer-triage, plan-reviewer-triage, funnel-text-budget, human-router-severity, routing-*, state-concern-counts, adr-blocking-digest, epic-saga-propagate, closeup-lifecycle-resolve, human-involvement-config, cli/status-concerns, contracts/*) |
| Implementation status | item 18 is materially implemented (store, fingerprint/dedup, triage+dismiss, routing, funnel, ADRs, human modes, close-up/status/state surfacing). Docs were **not** updated: `plugins/software-factory/docs/ARCHITECTURE.md:39` still says "Deliberately not hand-built … Current state: review dispositions (§8.7) and steering mailbox (§8.8) only" |
| Repository ADRs | 16 one-paragraph ADRs written by the architect under `docs/adr/` (project `adrFolder`, `plugins/software-factory/config/project.template.yaml:11`) |
| Active human mode | default `autonomous`; repo `.factory/pipeline.yaml` absent → only default + repo layers apply |

> Containment note: `.factory/tasks/**` is orchestration state and is intentionally not inspected here; all claims below come from plugin sources, schemas, prompts, docs and tests.

---

## 1. Module Map

### 1.1 Core concern subsystem

| File | Responsibility | Key ranges |
|---|---|---|
| `plugins/software-factory/src/core/concerns.ts` (406 L) | The concern store: stable fingerprint ids, per-file dedup/merge, aggregation with immediate commit, status vocabulary, triage application, close-up proposals/confirms, decision-level resolution, wave fallback, crash reconcile | `:35-44` allowlist, `:46-60` ids, `:69-97` merge, `:121-166` aggregate, `:184-215` counts, `:250-261` triage, `:263-304` close-up lifecycle, `:311-326` resolution, `:335-351` wave fallback, `:353-362` partition, `:388-406` reconcile |
| `plugins/software-factory/src/core/triage.ts` (349 L) | Pure triage/routing helpers: partition by exact id, severity policy, single human-disposition router (digest vs blocking), debt predicate, terse hydration + byte-capped rendering, `applyReviewTriage` | `:35-50`, `:52-54`, `:56-75`, `:93-136`, `:143-149`, `:152-165`, `:200-247`, `:254-286`, `:293-349` |
| `plugins/software-factory/src/core/review-policy.ts` (43 L) | Triager set (`reviewer`, `plan-reviewer`) and per-agent allowed dispositions; appends `dismiss` for triagers only | `:4-20`, `:27-43` |
| `plugins/software-factory/src/core/flows/step-runner.ts` (923 L) | Post-step ingest: aggregates produced concerns/remarkables, applies triage on pre-existing ids only, records close-up resolutions, honors/ignores decision-level resolutions, applies architect confirms + epic propagation, wave fallback; resolves schema/dispositions and hydrates `concernsYaml` | `:194-322`, `:325-341`, `:409-449` |
| `plugins/software-factory/src/core/flows/iteration.ts` (1337 L) | Architect plan/revise (ADR persistence), plan-review wiring (plan-reviewer is the triager for architect output), wave-level routed-blocker consults | `:170-177`, `:179-229`, `:441-451`, `:517-549`, `:614-623`, `:810-933` |
| `plugins/software-factory/src/core/flows/item-machine.ts` (811 L) | Item review prompt wiring (`dispositionsCriteria`, `reviewAllowed`) and suppression of duplicate raw human dispositions for concern ids | `:663-665`, `:714-744`, `:766-810` |
| `plugins/software-factory/src/core/flows/consults.ts` (421 L) | `consult-concern-<id>` architect consult for a routed blocker; decision may carry `concernResolution` | `:326-421` |
| `plugins/software-factory/src/core/flows/epic-propagation.ts` (185 L) | Epic→saga concern push: condensed copies, `[epic]` summaries, forwarded blocked questions | `:17-36`, `:97-129`, `:141-150`, `:152-185` |
| `plugins/software-factory/src/core/flows/adrs.ts` (72 L) | Blocking vs remarkable ADR: markdown record + mailbox routing under the active mode | `:14-18`, `:20-37`, `:46-71` |

### 1.2 Derivation, engine, CLI

| File | Responsibility | Key ranges |
|---|---|---|
| `src/core/derive/task.ts` (441 L) | `collectRoutedBlockers` (kind `blocker` + status `routed` + severity ≥ `minBlockingSeverity`); maps routed blocking onto item state; debt list incl. concern debt; `concerns` counts on state | `:47-65`, `:174-190`, `:219-250`, `:369-385` |
| `src/core/derive/item.ts` | Applies routed-concern blocking to pending items (`withRoutedBlocking`) | `:59-90` |
| `src/core/derive/wave.ts` | Wave state carries concern-blocked items; transitive fixpoint over declared deps | `:27`, `:47`, `:73` |
| `src/core/plan/scheduler.ts` | `blockedByConcern(...)` failure-union fixpoint used by iteration/scheduler | `:60-90` |
| `src/core/engine.ts` (795 L) | Startup: commit engine-owned concern store (`factory: concern store recovery`), reconcile concerns from committed records; epic child finish: `propagateEpicConcerns` + child-closeup commit | `:266-289`, `:342-347`, `:383-394` |
| `src/core/prompts.ts` (597 L) | `loadCriteriaBundle`, `formatHumanInvolvementCriteria` (selects `## <mode>` + shared table), `formatDispositionsSection` (allowed set, drops `human-stop` unless allowed) | `:35-59`, `:61-84`, `:86-110` |
| `src/core/prompt-vars.ts` (171 L) | `KNOWN_VARS` fragment matrix (which steps get `concernsYaml` / `humanInvolvementCriteria`) and var descriptions | `:12-40`, `:46-171` |
| `src/core/records/review-schema.ts` (104 L) | Generates the review schema with the agent's allowed disposition enum; declares `remarkable` and `newConcerns` | `:5-104` |
| `src/cli/status.ts` (128 L) | `factory status`: concern counts line + blocking vs digest question split + recorded debt | `:84-124` (counts `:106-108`) |
| `src/core/steer.ts` (188 L) | Mailbox writer: deterministic id fallback, never clobbers an operator answer | `:63-110` |

### 1.3 Schemas, config, prompts, docs

| Area | Files |
|---|---|
| Artifact schemas with `concerns`/`remarkable` | `config/schemas/developer-output.schema.json:61-83`, `fact-finder-output.schema.json:22-40`, `plan.schema.json:120-158`, `decisions.schema.json:48-95` (+`concernConfirms` `:73-83`, `concernResolution` `:84-95`), `review.schema.json:47-99` (`remarkable` 47-58, `newConcerns` 59-99), `wave-closeup.schema.json:35-70`, `plan-closeup.schema.json:27-70` |
| State/pipeline schemas | `config/schemas/state.schema.json:72-100` (required counts), `pipeline.schema.json:203-229` (`humanInvolvement`, `concerns`) |
| Config | `config/pipeline.default.yaml:359-376` (reviewPolicy), `:378-432` (§18 block: mode, allowlist, thresholds, commented presets, ADR blocking table), `:434-456` (criteria registry); `config/project.template.yaml:11` (`adrFolder: docs/adr`) |
| Prompts | `agents/criteria/human-involvement.md` (mode table + per-mode sections), `agents/steps/review.md:15-24`, `agents/steps/plan-review.md:14-37`, `agents/steps/qa.md:30+`, `agents/steps/develop.md:21-22`, `agents/steps/architect-*.md` (all bind `humanInvolvementCriteria`/`concernsYaml`), `agents/architect.md:33` (ADR blocking rule) |
| Docs | `plugins/software-factory/docs/ARCHITECTURE.md` (409 L; §1 row `:39`, §5 `:117`, §6.2 `:186-196`, §8.7 `:282-294`, §8.8 `:296-299`, §10 `:341-356`, §11 `:358-367`, §13 `:404-406`), `README.md` (122 L; config `:71-85`, CLI `:87-97`, docs `:99-105`), `docs/FIRE_TEST.md:51` |
| Repo ADRs | `docs/adr/adr-*.md` — 16 files, one paragraph each, listing the problem each decision solved (see §3.9) |

---

## 2. Key Interfaces & Signatures

### 2.1 Artifact types (`plugins/software-factory/src/core/artifacts.ts`)

```ts
// :301-321
type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
type ConcernSeverity = "low" | "medium" | "high";
type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";
interface Concern { id?: string; kind: ConcernKind; summary: string; detail: string;
  location?: { file: string; line?: number }; severity: ConcernSeverity; affects?: string[] }

// :323-327
interface RemarkableDecision { chosen: string; alternatives: string[]; why: string }

// :329-384
interface ConcernConfirms { id: string; confirm: "accept" | "reject"; note?: string }
interface ConcernResolution { id: string; action: "resolve" | "carry"; note?: string }
interface CloseupConcernResolution { id: string; action: "resolve" | "carry" | "propagate" | "dismiss"; note?: string }
interface ConcernSource { record: string; agent: string; epic?: string; step?: string;
  item?: string; iteration?: number; escalated?: boolean; lastSeen?: string }
interface PendingConcernResolution { action: "resolve"|"carry"|"propagate"|"dismiss"; note?: string; by: string; at: string }
interface StoredConcernArtifact extends Concern { id: string; status: ConcernStatus;
  disposition?: ReviewDisposition; dismissReason?: string; source: ConcernSource;
  pendingResolution?: PendingConcernResolution; createdAt: string; updatedAt: string }

// :386-412
type ReviewDisposition = "fix"|"optional"|"architect"|"human-awareness"|"human-async"|"human-stop"|"dismiss";
interface ReviewSuggestion { id; disposition: ReviewDisposition | string; summary; detail?; location? }
interface ReviewArtifact { status; summary; suggestions: ReviewSuggestion[];
  newConcerns?: Concern[]; remarkable?: RemarkableDecision[] }

// :564-583
interface ConcernCounts { open: number; dismissed: number; routed: number; resolved: number }
interface StateArtifact { …, concerns: ConcernCounts, debt?: string[], … }

// :124-131 (PipelineConfig)
humanInvolvement?: "autonomous" | "principal" | "detailed";
concerns?: { raiseAllowlist?: string[]; minDigestSeverity?: ConcernSeverity; minBlockingSeverity?: ConcernSeverity };
```

### 2.2 Store API (`src/core/concerns.ts`)

```ts
type ConcernInput = Pick<Concern, "kind"|"summary"|"location"|"affects"> & Partial<Pick<Concern,"detail"|"severity">>;   // :11-12
concernFingerprint(c: ConcernInput): string                      // :58-60  → c-<10 hex>
aggregateConcerns(ctx, concerns, remarkables = [], opts): Promise<StoredConcernArtifact[]> // :122-166
listConcerns(taskDir)                                            // :169-182
listOpenConcerns(taskDir)                                        // :185-187
countConcerns(taskDir): Promise<ConcernCounts>                   // :194-215
listConcernIds(taskDir): Promise<string[]>                       // :218-228
applyConcernTriage({suggestions, isTriager, …})                  // :250-261
applyCloseupResolutions({resolutions, by, …})                    // :264-271
applyConcernConfirms({confirms, …})                              // :280-304
applyConcernResolution({resolution, by, …})                      // :311-326
applyWaveCloseupFallback({ids, …})                               // :335-351
partitionSuggestions(suggestions, concernIds)                    // :354-362
reconcileConcerns({taskDir, taskWt, repo})                       // :389-406
```

### 2.3 Triage/routing API (`src/core/triage.ts`, `src/core/review-policy.ts`)

```ts
partitionReviewSuggestions(suggestions, concernIds, isTriager): TriagePartition   // :35-50
concernMailboxId(concernId): string            // :52-54 → `q-concern-${id}`
resolveConcernSeverityPolicy(concerns?)        // :67-75  (defaults medium/high)
routeHumanDisposition(ctx, suggestion, concern?): Promise<string | undefined>  // :93-136
isDebtConcern({kind,status,disposition}): boolean                               // :143-149
listHydratedConcerns(taskDir, consumer): Promise<Record<string, unknown>[]>     // :219-231
hydrateStepConcerns(taskDir, {stepRole, diffBytes?, taskDiffBytes?, inputBytes?}) // :234-247
renderConcernsYaml(records, maxBytes = 8000): string                            // :254-286
applyReviewTriage(ctx): Promise<ReviewTriageOutcome>                            // :293-349

isTriagerAgent(agent): boolean                 // review-policy.ts:18-20 (reviewer | plan-reviewer)
resolveReviewAllowed(pipeline, agent, isTriager): string[]  // :27-43 (adds `dismiss` only for triagers)
```

### 2.4 Funnel / ADR / derivation API

```ts
persistAdrs({taskWt, taskDir, adrFolder?, adrs, mode})   // flows/adrs.ts:46-71
blockingAdrDisposition(mode): "human-stop" | "human-async" // :14-18
propagateEpicConcerns({childTaskDir, parentTaskDir, parentWt, epic, concernIds?}) // flows/epic-propagation.ts:152-185
collectRoutedBlockers(taskDir, minBlockingSeverity = "high"): Promise<Set<string>> // derive/task.ts:52-65
blockedByConcern(items, concernBlocked): string[]          // plan/scheduler.ts:60-90
formatHumanInvolvementCriteria(criteria, mode)             // prompts.ts:68-84
formatDispositionsSection(criteria, allowed)                // prompts.ts:90-110
```

---

## 3. Relevant Excerpts & Semantics

### 3.1 Store identity, dedup and merge (spec 91)

- Fingerprint = `sha256(JSON.stringify([kind, normalized summary, location.file, location.line])).slice(0,10)` with prefix `c-` (`concerns.ts:51-60`). `affects`, `detail`, and `severity` are **not** part of identity; affects are unioned on merge (`:50`, `:76-78`) — the fix captured by `docs/adr/adr-fingerprint-affects-union.md`.
- Remarkable id = `rm-<10 hex>` over normalized `chosen` + sorted `alternatives` (`concerns.ts:53`, `:89-97`).
- Merge rules (`concerns.ts:69-97`): keeps the **longer** detail, the **max** severity, preserves the existing kind/summary/status, unions affects, tracks `source.lastSeen`; a severity increase on an already-dismissed concern sets `source.escalated: true` (`:74`) so the dismissal still surfaces as a digest (`triage.ts:103-119`).
- Files land in `{taskDir}/concerns/<id>.yaml`, written under a per-task keyed mutex and committed immediately unless `commit:false` (`concerns.ts:121-166`). `taskDir` is the task-branch path (`engine.ts:337`) — rationale in `docs/adr/adr-concern-store-taskwt.md`.
- Legacy migration: a pre-union fingerprint file matching kind+summary+location is rename-merged when the new payload carries a detail (`concerns.ts:99-119`, `:139-147`).
- Startup reconcile rebuilds missing concern files from committed step records, idempotently (`concerns.ts:389-406`; engine `:383-394`); the store is committed before stray-dirt repair so it is never stashed (`engine.ts:342-347`).

### 3.2 Per-step ingest order (`src/core/flows/step-runner.ts:194-322`)

1. Collect `concerns`, `newConcerns`, `remarkable`, `suggestions`, `concernResolutions`, `concernConfirms`, `concernResolution` from the validated output (`:199-204`).
2. Gate by `concerns.raiseAllowlist` on `source.agent` (never the step fragment); a skip keeps the step `ok` and only journals `concern_ingest_skipped` (`:217-231`).
3. Compute `existing` = concern filenames that existed **before** this step, so a step can never triage/dismiss its own new concerns (`:233-240`).
4. Pre-flight accepted `dismiss` proposals require a note, before any mutation (`:242-259`).
5. `aggregateConcerns` (`:260`).
6. `applyReviewTriage` with `isTriagerAgent(agent)` and severity policy (`:261-275`).
7. `applyCloseupResolutions` for `concernResolutions` (`:276`).
8. Decision-level `concernResolution` only honored for `consult-concern-<id>`, `architect-closeup*`, `architect-wave-report*`; otherwise journaled as `concern_resolution_ignored` (`:278-301`).
9. Architect `concernConfirms` apply pending proposals; accepted `propagate` proposals push to the parent (epic/saga) store (`:303-316`).
10. Wave close-up fallback for concerns predating the step (`:318-321`).

### 3.3 Triage + `dismiss` (spec 92)

- Only `reviewer` and `plan-reviewer` are triagers (`review-policy.ts:18-20`); close-ups are deliberately **not** triagers — rationale `docs/adr/adr-closeup-no-suggestions-triage.md`.
- Triage happens through `suggestions[]` whose `id` equals a stored concern/remarkable id; partition is exact-id only, so ordinary findings pass through unchanged (`triage.ts:35-50`).
- `dismiss` requires non-empty `detail` (the reason); enforced twice — in `applyReviewTriage` before mutation (`triage.ts:305-311`) and in `applyConcernTriage` (`concerns.ts:255`). Dismissed records keep `status: dismissed`, `disposition: dismiss`, `dismissReason` and stay in `concerns/` (`concerns.ts:256-258`).
- Non-dismiss triage sets `status: routed` + `disposition` (`concerns.ts:256-258`).
- Allowed-disposition resolution: per-agent list > `reviewPolicy.default` > legacy `allowedDispositions` > builtin `[fix, optional, architect, human-awareness, human-async]`; `dismiss` is appended for triagers and stripped for everyone else (`review-policy.ts:4-43`).
- The same allowed set drives the generated review schema enum (`src/core/records/review-schema.ts:5-48`, resolved at `step-runner.ts:409-416`).
- Item-level review wiring: `dispositionsCriteria: formatDispositionsSection(criteriaBundle.dispositions, reviewAllowed)` (`item-machine.ts:649`); plan review does the same for `plan-reviewer` (`iteration.ts:537-544`).

### 3.4 Human routing: blocking vs digest (spec 93, 98)

`routeHumanDisposition` (`triage.ts:93-136`) is the single router:

- Applies to dispositions `human-awareness|human-async|human-stop`, routed remarkables (`rm-*`), and dismissed-but-escalated concerns.
- `digestOnly` = remarkable OR dismissed-escalated OR `human-awareness`. Blocking requires severity ≥ `minBlockingSeverity` (default `high`); below it `human-async`/`human-stop` downgrade to `human-awareness` (a downgraded `stop` loses the exit-10 halt).
- Nothing is surfaced below `minDigestSeverity` (default `medium`) except `rm-*`, which is exempt from both thresholds.
- Ids: `q-concern-<concernId>` (or `q-escalated-<concernId>` for a dismissed escalated concern); `blocks` = `[item?, "task"]` for `human-stop`, `[item ?? "task"]` for `human-async`, `[]` for digests (`:117-134`).
- Mailbox writes are idempotent and never clobber an answered question (`steer.ts:95-106`).
- Raw item-review human dispositions are suppressed when the suggestion id is a concern id, so the router is the only writer (`item-machine.ts:663-665`, `:714-744`).

### 3.5 Routing effects (spec 93)

| Route | Implementation | Tests |
|---|---|---|
| blocker → dependent items blocked + architect consult | `derive/task.ts:52-65` selects kind `blocker` + `status routed` + severity ≥ threshold; `blockedByConcern` computes the transitive fixpoint (`plan/scheduler.ts:60-90`); mapped in `derive/task.ts:174-190`, `derive/item.ts:59-90`, `derive/wave.ts:27-73`; consult per routed blocker before a wave starts and after each act pass (`iteration.ts:179-229`, `:830-856`, `:927-931`), idempotent via the decision artifact | `test/engine/routing-blocker-derive.test.ts:161-415`, `test/engine/routing-architect-consult.test.ts:344-395` |
| `architect` → next architect turn | routed concerns are hydrated into architect consumers (`triage.ts:219-231`, `includeRouted` for architect); a decision may `resolve`/`carry` (`concerns.ts:311-326`) | `test/engine/routing-architect-consult.test.ts`, `test/engine/closeup-lifecycle-resolve.test.ts:404-528` |
| `human-*` → mailbox per policy | `triage.ts:93-136`; mode only chooses `human-stop` vs `human-async` for blocking ADRs (`flows/adrs.ts:14-18`) | `test/engine/human-router-severity.test.ts:197-989`, `test/engine/routing-human-debt.test.ts:90-189` |
| tech debt → plan debt list | `isDebtConcern` = non-open `tech-debt` concern or `optional` disposition, explicitly no `tech-debt` disposition (`triage.ts:138-149`); merged into `debt` (`derive/task.ts:245-250`) and fed to the architect/close-ups | `test/engine/plan-reviewer-triage.test.ts:436`, `test/engine/closeup-lifecycle-resolve.test.ts:528` |

### 3.6 Hydration and the funnel text budget (spec 97)

- Terse record shape drops `detail` (`triage.ts:152-165`); consumers differ: `closeup`/`architect` also see `routed`; only `architect` sees dismissed-escalated (`:219-231`).
- Caps are `min(code size, 2000)` for review/qa, `min(task diff, 2000)` for wave/plan close-up, `min(prompt input, 500)` otherwise (`triage.ts:234-247`, wired at `step-runner.ts:429-448`).
- `renderConcernsYaml` degrades progressively: drop `affects`, then shrink summaries (80→1 chars), then shed trailing records; empty string when nothing fits (`triage.ts:254-286`).
- Epic→saga push condenses: verbatim up to 120 bytes, otherwise halved under a 500-byte cap; summaries prefixed `[epic]` (`epic-propagation.ts:35-36`, `:52-58`, `:141-150`).
- Tests: `test/engine/funnel-text-budget.test.ts:242-482` (UTF-8 byte counting, caps, “always forwards fewer bytes”, prompt vars must be capped before render).

### 3.7 Close-up lifecycle (spec 94)

- Wave/plan close-ups emit `concernResolutions` (`resolve|carry|propagate|dismiss`) and `concernConfirms`-consuming pending proposals; `applyCloseupResolutions` only records `pendingResolution` — status changes on architect confirmation (`concerns.ts:263-304`).
- Accept applies: resolve → `resolved`; carry → `routed` with disposition `architect`; dismiss → `dismissed` + reason from the pending note; propagate → proposal cleared and a copy pushed to the parent store (`concerns.ts:280-316`, `step-runner.ts:303-341`).
- Wave fallback: open tech debt → `optional`, assumptions/risks/questions → `architect`, blockers stay open, never assigns `human-*` (`concerns.ts:328-351`).
- Close-up prompts bind both `humanInvolvementCriteria` and `concernsYaml` (`agents/steps/wave-close-up.md:20-30`, `agents/steps/plan-close-up.md:20-28`).
- Tests: `test/engine/closeup-lifecycle-resolve.test.ts` (accept/reject, error when a dismiss note is missing, consult resolve unblocks the item, fallback debt).

### 3.8 Blocking vs remarkable ADRs (spec 98)

- `PlanAdr` has `blocking?: boolean` with the mode-dependent description (`config/schemas/plan.schema.json:120-134`).
- `persistAdrs` writes full markdown when `project.adrFolder` is set (`config/project.template.yaml:11` → `docs/adr`) and **always** routes to the mailbox: blocking → `human-stop` (autonomous) or `human-async` (principal/detailed) with `blocks: ["task"]`; remarkable → `human-awareness`, no blocks (`flows/adrs.ts:14-71`).
- Called on plan write and again on revise (idempotent) — `iteration.ts:441-451`, `:614-623`; a blocking ADR parks the task before waves (`iteration.ts:469-478`).
- Tests: `test/engine/adr-blocking-digest.test.ts:69-390`.

### 3.9 Human-involvement modes (spec 99-103)

- Config: top-level `humanInvolvement` + `concerns` thresholds/allowlist in `pipeline.schema.json:203-229` and `PipelineConfig` (`artifacts.ts:124-131`).
- Default `config/pipeline.default.yaml:378-432` ships: active `autonomous`, an 8-agent raise allowlist, `minDigestSeverity: medium`, `minBlockingSeverity: high`, three fully commented presets (`autonomous|principal|detailed`), and the ADR/concern blocking table.
- Prompt fragment `agents/criteria/human-involvement.md` holds the shared table plus one section per mode; `formatHumanInvolvementCriteria` keeps the shared sections and only the active `## <mode>` (`prompts.ts:61-84`).
- Per-task selectability is plain config layering (`config/pipeline.default.yaml` → `.factory/pipeline.yaml` → `{task}/pipeline.yaml`), covered by `test/human-involvement-config.test.ts:150-476`.

### 3.10 Surfacing (spec 94)

- `state.yaml`: required `concerns` object `{open,dismissed,routed,resolved}` (`state.schema.json:72-100`, `StateArtifact` `artifacts.ts:564-583`), computed by `countConcerns` (missing dir → zeros; corrupt entry → warn + skip) and attached in `deriveTaskState` (`derive/task.ts:369-385`).
- `factory status`: prints `Concerns: open N | dismissed N | routed N | resolved N`, then splits open operator questions into **Blocking** and **Digest** and lists recorded debt (`cli/status.ts:106-124`).
- Architect hydration for routed items goes through `concernsYaml` only (`iteration.ts:170-177`).
- Tests: `test/engine/state-concern-counts.test.ts:30-120`, `test/cli/status-concerns.test.ts:39-140`.

### 3.11 Repository ADRs written so far (`docs/adr/`)

These are the architect's own one-paragraph decisions from earlier iterations; they should be respected, and two of them are explicitly **documentation** obligations:

| ADR | Decision / deviation |
|---|---|
| `adr-concern-store-taskwt.md` | Aggregate concerns directly to `taskWt/concerns/` because item steps only commit the child worktree; precedent is `writeQuestion`/`refreshStateYaml` |
| `adr-triage-suggestions-dismiss.md` | Triage via `suggestions[]` with `id = concernId` plus `dismiss` (rejected a separate `concernTriage[]`) |
| `adr-human-router-single.md` | One router for all human dispositions; digest entries for awareness/remarkable; kills item-machine double-writes |
| `adr-severity-policy-active.md` | `raiseAllowlist` + digest/blocking thresholds are active semantics |
| `adr-routing-derived-state.md` | Concerns are file-authoritative; routing effects are derived, never forked |
| `adr-fingerprint-affects-union.md` | Fingerprint excludes `affects`; merge unions them |
| `adr-hydration-single-cap.md` | Single hydration module with step-role byte caps, UTF-8 counting |
| `adr-funnel-text-budget.md` | Prompt condensing + hydration cap enforce “less detail per level” |
| `adr-epic-push-condensed.md` | Epic→saga push with condensed `[epic]` copies |
| `adr-digest-mailbox.md` | Digest reuses `tousertoreview` with non-blocking semantics |
| `adr-closeup-lifecycle-resolved.md` | Close-up propose/confirm lifecycle makes `resolved` reachable and unblocks items |
| `adr-closeup-no-suggestions-triage.md` | Close-ups removed from the triager set; re-triage via resolutions + confirms + fallback |
| `adr-humaninvolvement-config.md` | Top-level `humanInvolvement` mode + criteria fragment |
| `adr-prompt-fragment-matrix.md` | Full fragment matrix with raise instructions and preflight checks |
| `adr-autonomous-immediate-halt.md` | **Deviation**: autonomous halts immediately at plan time instead of deferring until unblocked work drains |
| `adr-epic-config-root-only.md` | **Deviation**: epic child tasks do not inherit the parent task's `pipeline.yaml`, so root `humanInvolvement`/`concerns`/`reviewPolicy` overrides do not reach epics |

---

## 4. Requirement → Implementation Evidence (spec `docs/factory.v2.md:89-103`)

| Spec bullet | Evidence | Status |
|---|---|---|
| `concerns[]` `{kind,summary,detail,location,severity,affects}` in every agent output (`:90`) | `artifacts.ts:301-321`; schemas developer-output `:61-83`, fact-finder `:22-40`, plan `:135-158`, decisions `:48-72`, review `newConcerns` `:59-99`, wave-closeup `:35-58`, plan-closeup `:27-50`; contracts test `test/contracts/concern-schemas.test.ts:154-723` | implemented |
| Engine aggregation in `concerns/`, stable fingerprint id, dedup across steps/attempts, status, source record (`:91`) | `concerns.ts:46-166`, `:389-406`; `engine.ts:342-347`, `:383-394`; tests `concerns-funnel.test.ts:320-396`, `:787-844`, `:1130-1262` | implemented |
| Reviewer triage with disposition vocabulary + `dismiss` (logged with reason, kept) (`:92`) | `review-policy.ts:18-43`, `triage.ts:293-349`, `concerns.ts:250-261`; prompts `steps/review.md:20-24`, `steps/plan-review.md:23`; tests `reviewer-triage.test.ts:287-528`, `plan-reviewer-triage.test.ts:151-435` | implemented |
| Routing blocker / architect / human-* / tech-debt (`:93`) | `derive/task.ts:52-65`, `plan/scheduler.ts:60-90`, `iteration.ts:179-229`, `triage.ts:93-149`, `derive/task.ts:245-250`; tests `routing-*.test.ts` (4 files), `human-router-severity.test.ts` | implemented |
| Close-ups list open concerns, re-triage, architect resolves/carries; status/state counts (`:94`) | close-up prompts bind `concernsYaml`; `concerns.ts:263-351`; `state.schema.json:72-100`; `cli/status.ts:106-124`; tests `closeup-lifecycle-resolve`, `state-concern-counts`, `status-concerns` | implemented |
| Configurable raise allowlist / allowed dispositions / severity thresholds (`:95`) | `pipeline.schema.json:203-229`, `artifacts.ts:124-131`, `step-runner.ts:217-231`, `triage.ts:56-75`, `review-policy.ts:27-43`; `test/human-involvement-config.test.ts` | implemented |
| Remarkable decisions/tradeoffs with same aggregation/triage (`:96`) | `artifacts.ts:323-327`, `concerns.ts:53`, `:89-97`, `triage.ts:98-119`, `:200-218`; tests `concerns-funnel.test.ts:713-767`, `human-router-severity.test.ts:275-307` | implemented |
| Funnel worker → reviewer → epic architect → saga architect → human, less detail each level, never more text than the code (`:97`) | item review triage → architect hydration (`triage.ts:219-247`) → epic push (`epic-propagation.ts:141-185`, `engine.ts:266-289`) → human router (`triage.ts:93-136`); `test/engine/funnel-text-budget.test.ts:242-482`, `epic-saga-propagate.test.ts:192-500` | implemented (see Q5/Q6) |
| Blocking vs non-blocking ADRs; remarkable in digest, never waits (`:98`) | `flows/adrs.ts:14-71`, `iteration.ts:441-451`/`:614-623`; `test/engine/adr-blocking-digest.test.ts:286-390` | implemented |
| Human modes `autonomous|principal|detailed` as config presets + prompt fragments, per-task selectable (`:99-103`) | `config/pipeline.default.yaml:378-432`, `agents/criteria/human-involvement.md`, `prompts.ts:61-84`, `human-involvement-config.test.ts:150-476` | implemented, with two documented deviations (Q2, Q3) |
| ARCHITECTURE / README / config commentary update | config commentary done (`pipeline.default.yaml:359-432`); ARCHITECTURE and README **not** updated | **open** |
| Terse, debloated prompts | every agent/step fragment is 33–46 lines; `test/prompts.test.ts:401-520` enforces ≤15 non-empty added lines per fragment and total ≤80 | implemented |

---

## 5. Existing Tests & Conventions

### 5.1 Conventions

- Runner: `bun test` from `plugins/software-factory` (`package.json` scripts: `test`, `typecheck`). Behavior-only tests; no lint/format assertions (per spec item 15).
- Harness: `FakeHarness` replays scripted outcomes by step label (`src/harness/fake/fake-harness.ts`), so tests exercise the real `runAgentStep`/`runTask` paths.
- Repos: `test/helpers/tmp-repo.ts:32-134` creates a temp git repo on `main` with deterministic env, plus worktree/branch helpers and `cleanup()`.
- Assertions are on-disk facts: read `concerns/*.yaml`, `steer/tousertoreview/*.yaml`, `state.yaml`; commits are verified with `git cat-file -e HEAD:<path>` (e.g. `test/engine/concerns-funnel.test.ts:388-395`), not by trusting in-memory results.
- Test files carry a doc comment naming the spec §/ADR they lock (e.g. `concerns-funnel.test.ts:29-36`, `funnel-text-budget.test.ts:242`, `epic-saga-propagate.test.ts:23`).

### 5.2 Concern-related suites (all green)

| File | Locks | Notable lines |
|---|---|---|
| `test/engine/concerns-funnel.test.ts` (1287 L) | schema write gate, store identity/merge, concurrency, reviewer wiring, producer matrix, reconcile, failure journaling | `:37`, `:124`, `:194`, `:320`, `:347`, `:398`, `:467`, `:845`, `:895`, `:935`, `:980`, `:1130`, `:1263` |
| `test/engine/reviewer-triage.test.ts` (699 L) | terse hydration, exact-id partition, byte caps, dismiss with reason, routed persistence, `fixRequired`, deduped mailbox, non-triager no-op, engine-flow blocking | `:39`, `:166`, `:197`, `:230`, `:287`, `:323`, `:371`, `:410`, `:454`, `:499`, `:530` |
| `test/engine/plan-reviewer-triage.test.ts` (513 L) | plan-review hydration, architect-revise concerns, triage ids excluded from the plan fix loop, debt derivation | `:28`, `:151`, `:245`, `:368`, `:436` |
| `test/engine/funnel-text-budget.test.ts` (482 L) | UTF-8 byte counting, truncation at code-point boundary, all hydration caps, “always fewer bytes”, detail condensing, verbatim prompt vars | `:242-482` |
| `test/engine/human-router-severity.test.ts` (1023 L) | plan-reviewer stop, close-up async, architect hydration of routed, remarkable digests, escalated dismissal, threshold suppression/downgrade, allowlist skip, exit 10 / park / downgrade flows | `:197-989` |
| `test/engine/routing-blocker-derive.test.ts` (439 L) | `collectRoutedBlockers`, dependency cascade, terminal/running immunity, task-blocked derivation | `:161-415` |
| `test/engine/routing-architect-consult.test.ts` (444 L) | one decision file, architect hydration, restart idempotency | `:344`, `:395` |
| `test/engine/routing-human-debt.test.ts` (523 L) | item blocking vs task continuation per disposition, halt/exit 10, digest-only | `:90`, `:143`, `:189` |
| `test/engine/closeup-lifecycle-resolve.test.ts` (≈660 L) | accept/reject proposals, missing dismiss note error, consult resolve unblocks, fallback debt, blockers stay open | `:281-598` |
| `test/engine/epic-saga-propagate.test.ts` | `[epic]` copies of open/routed concerns, dismissed stays local, remarkables, saga-architect hydration, deployed child dirs | `:192-660` |
| `test/engine/adr-blocking-digest.test.ts` | ADR markdown, blocking halt, remarkable digest, mode table, no `adrFolder` | `:69-390` |
| `test/engine/state-concern-counts.test.ts` | state counts incl. zeroes and corrupt-skip | `:30-120` |
| `test/cli/status-concerns.test.ts` | counts line, blocking vs digest split, zero state | `:39-140` |
| `test/human-involvement-config.test.ts` | defaults, layering, `null` deletion, schema closure, commented presets, criteria fragment selection, prompt-var registration | `:150-476` |
| `test/contracts/concern-artifact-types.test.ts` (≈500 L) | type-level shape of concerns, lifecycle metadata, `dismiss`, ADR blocking flag, pipeline config, producer typing | `:122`, `:213`, `:242`, `:276`, `:336`, `:434` |
| `test/contracts/concern-schemas.test.ts` (723 L) | inlined concern defs in every producer schema, `newConcerns`, close-up resolutions, untouched triage/infra/edit schemas, confirmations | `:154-632` |
| `test/contracts/state-concern-schema.test.ts` | state schema requires all four counts | `:12-36` |
| `test/prompts.test.ts:401-520` | fragment matrix + prompt-debloat budgets + mode switching inside rendered prompts | `:410`, `:434`, `:464`, `:495`, `:517` |

---

## 6. Documentation Gaps (concrete, cited)

These are the parts of the intent not yet satisfied. Every item below is a **documentation** change, not behavior.

| # | Target | Current state | Needed |
|---|---|---|---|
| D1 | `plugins/software-factory/docs/ARCHITECTURE.md:39` (§1 row 18) | "**Deliberately not hand-built** … Current state: review dispositions (§8.7) and steering mailbox (§8.8) only." | Mark as implemented; point at the concern store, triage/routing, funnel, ADR modes and the new section; keep the two deviations visible |
| D2 | ARCHITECTURE body | Only two mentions of “concern” in the whole file (`:39`, `:348`); no section on the concern store/triage/routing/funnel/human modes | Add a section (natural slots: new `### 8.11 Concerns & remarkable decisions funnel (§18)` after §8.10, or a top-level `## 15`); include the status vocabulary, fingerprint/dedup, triage rules, routing table, byte caps, ADR blocking table |
| D3 | ARCHITECTURE `:282-294` (§8.7 dispositions) | Table lists 6 dispositions; `dismiss` is missing; the note only says the enum is generated from the allowed set | Add the `dismiss` row (triager-only, requires `detail`, kept as `dismissed` with reason) |
| D4 | ARCHITECTURE `:117` (§5) | "pipeline layers … (epics inherit parent task layer)" — contradicted by `src/cli/run.ts:127-139` + `src/core/engine.ts:247` (only the child task dir's `pipeline.yaml` is loaded); recorded in `docs/adr/adr-epic-config-root-only.md` | Correct the claim and state the deviation (root `humanInvolvement`/`concerns`/`reviewPolicy` overrides do not reach epics) |
| D5 | ARCHITECTURE `:186-196` (§6.2 task folder) | Listing omits `concerns/` | Add `concerns/{c-*,rm-*}.yaml` and note the store is engine-owned (committed before stray-dirt repair, `engine.ts:342-347`) |
| D6 | ARCHITECTURE `:341-356` (§10 agents) | Output column only says `developer … concerns[]` | Reflect `newConcerns`/`remarkable` on review outputs and `concerns`/`remarkable`/`concernConfirms`/`concernResolution` on architect decisions, close-ups, plan |
| D7 | ARCHITECTURE `:358-367` (§11 CLI) | `status` described as "tree, items, waves, budgets, open tousertoreview" | Mention concern counts and the blocking/digest split (`cli/status.ts:106-124`) |
| D8 | ARCHITECTURE `:404-406` (§13 testing) | Lists dispositions but not the funnel suite | Add concern funnel coverage (store, triage, routing, funnel budget, ADRs, modes) |
| D9 | `plugins/software-factory/README.md` | **Zero** mentions of concerns, ADRs or human-involvement modes (grep over the whole file) | Add a short section (e.g. under §3 Configuration) covering `humanInvolvement`, `concerns.*`, `reviewPolicy` + triager `dismiss`, and what `factory status` shows; update §5 docs to the new ARCHITECTURE section range (`README.md:99-105` currently says "§0–§14") |
| D10 | `plugins/software-factory/agents/criteria/dispositions.md:1-20` | Table lacks `dismiss`; step prompts explain it ad hoc (`agents/steps/review.md:22-23`, `agents/steps/plan-review.md:23`) | Add a `dismiss` row (triager-only, reason required, kept on disk) — or deliberately document that `dismiss` lives only in step prompts |
| D11 | `plugins/software-factory/config/pipeline.default.yaml:359-376` | `reviewPolicy` commentary lists 6 dispositions, no `dismiss`; §18 block (`:378-432`) is already complete | Mention that triagers get `dismiss` appended automatically (`review-policy.ts:36-42`) and why `human-stop` is absent from the default policy |

---

## 7. Open Questions & Uncertainties (for the architect)

**Q1 — Is the remaining scope purely documentation?** Functionally every spec bullet has an implementation and at least one behavior test (§4). The only unticked intent item is the doc set in §6. If the architect agrees, the iteration should be a small doc milestone (D1–D11) plus verification of the two deviations, not a re-implementation.

**Q2 — Autonomous mode deviation: document or implement drain scheduling?** Spec (`docs/factory.v2.md:100`) says the human is consulted "only for the portion still blocked after everything unblocked is done". Implementation routes blocking ADRs at plan time and halts immediately (`flows/adrs.ts:14-18`, `iteration.ts:469-478`); `docs/adr/adr-autonomous-immediate-halt.md` accepts this as out of scope. Decide whether the doc records it as a deviation (recommended by the existing ADR) or the iteration implements deferred halting.

**Q3 — Epic config inheritance deviation: document or implement?** Root-task `pipeline.yaml` overrides (`humanInvolvement`, `concerns`, `reviewPolicy`) do not reach epic child tasks: `src/cli/run.ts:127-139` loads only `{taskDir}/pipeline.yaml`, and `engine.ts:234-247` passes the child dir. `docs/adr/adr-epic-config-root-only.md` flags this and says implementing inheritance would change config semantics for all tasks. ARCHITECTURE `:117` currently makes the incorrect claim (see D4).

**Q4 — Who triages architect output outside the plan?** Only `plan-review` routes through `plan-reviewer`; architect concerns raised in `architect-consult-item`, `architect-consult-nonitem`, `architect-wave-report` and `architect-closeup` are aggregated (`step-runner.ts:260`) but `isTriagerAgent` is true for `reviewer|plan-reviewer` only (`review-policy.ts:18-20`), and close-ups are deliberately non-triagers (`docs/adr/adr-closeup-no-suggestions-triage.md`). Those concerns stay `open` until an architect turn hydrates them (`triage.ts:219-231`) or the wave fallback runs. Is that acceptable coverage of the spec sentence "architect output → plan-reviewer", or does a wave-report reviewer step need to exist?

**Q5 — Simple tasks have no reviewer.** `simple-implement` accepts `concernsYaml` (`prompt-vars.ts:69-70`) and the developer allowlist covers it, but the simple flow has no review step, so its concerns are never triaged and the wave fallback never runs (no waves). Recorded in `docs/adr/adr-closeup-lifecycle-resolved.md` ("simple items have no reviewer"). Document as a known limitation or add a triage path?

**Q6 — Remarkables are exempt from both severity thresholds.** `routeHumanDisposition` digests every routed `rm-*` regardless of `minDigestSeverity` (`triage.ts:108-115`), so all remarkable decisions become non-blocking mailbox entries. Spec line 103 demands the mailbox show "only funnelled, confirmed, low-noise items". Is unconditional digest the intended noise level, or should remarkables be gated by confirmation/severity?

**Q7 — `state.yaml` counts exclude remarkable decisions.** `countConcerns` only counts files whose name starts with `c-` (`concerns.ts:204`), while `rm-*` files exist in the same folder and are triageable (`listConcernIds` `:218-228`). Spec says "status/state.yaml shows counts" without defining scope. Decide whether remarkable counts belong in `ConcernCounts`/`state.schema.json:72-100`/`cli/status.ts:106-108`.

**Q8 — Legacy fingerprint migration.** `legacyConcern` (`concerns.ts:99-119`, `:139-147`) rewrites pre-union `c-*` filenames by kind+summary+location when the new payload carries a detail. Is this still needed after the fire test, or is it dead migration weight that the doc should either describe or the iteration should delete?

**Q9 — Allowlist duplication.** `DEFAULT_RAISE_ALLOWLIST` (`concerns.ts:35-44`) mirrors `config/pipeline.default.yaml:393-401` by hand. There is no test asserting the two lists agree; decide whether to generate one from the other or add a contract test.

**Q10 — Mailbox digest growth.** Every routed `human-awareness`/remarkable writes a persistent `q-concern-<id>` entry (`triage.ts:117-134`) that `factory status` prints under "Digest Questions" (`cli/status.ts:114-116`). Ids dedupe and answered entries are never clobbered (`steer.ts:95-106`), but there is no aging/archival rule. Is unbounded digest growth acceptable, or should the doc define a retention rule?

**Q11 — Concern store ownership vs stray-dirt repair.** The engine commits `{task}/concerns` before repair (`engine.ts:342-347`) and reconciles from records (`:383-394`), but ARCHITECTURE §6.3.6 (`:205`) does not list `concerns/` among engine-owned paths. Confirm the intended wording when updating D5/D2.

**Q12 — Documented-vs-tested byte caps.** `funnel-text-budget.test.ts` locks caps (2000/2000/500) as behavior; the numbers live only in `triage.ts:239-243` and the tests. If the architect documents them (D2), note they are code constants, not config.

---

## 8. Sources

- Spec: `docs/factory.v2.md:89-103` (item 18), `:104-112` (item 19/20 context), `:76-88` (items 13–17 context)
- Architecture: `plugins/software-factory/docs/ARCHITECTURE.md:39`, `:112-119`, `:179-209`, `:220-318`, `:339-367`, `:404-409`
- README: `plugins/software-factory/README.md:71-105`
- Fire test: `plugins/software-factory/docs/FIRE_TEST.md:51`
- Repo ADRs: `docs/adr/adr-*.md` (16 files)
- Core: `plugins/software-factory/src/core/{concerns,triage,review-policy,artifacts,prompts,prompt-vars,steer}.ts`; `src/core/flows/{step-runner,iteration,item-machine,consults,epic-propagation,adrs}.ts`; `src/core/derive/{task,item,wave}.ts`; `src/core/plan/scheduler.ts`; `src/core/records/review-schema.ts`; `src/core/engine.ts`; `src/cli/{status,run}.ts`
- Schemas: `plugins/software-factory/config/schemas/{developer-output,fact-finder-output,plan,decisions,review,wave-closeup,plan-closeup,state,pipeline}.schema.json`
- Config: `plugins/software-factory/config/pipeline.default.yaml:359-456`; `config/project.template.yaml:11`
- Prompts: `plugins/software-factory/agents/criteria/{human-involvement,dispositions}.md`; `agents/steps/{review,plan-review,qa,develop,fix-round,architect-*}.md`; `agents/architect.md:33`
- Tests: `plugins/software-factory/test/engine/*concern*`, `reviewer-triage`, `plan-reviewer-triage`, `funnel-text-budget`, `human-router-severity`, `routing-*`, `adr-blocking-digest`, `epic-saga-propagate`, `closeup-lifecycle-resolve`, `state-concern-counts`; `test/cli/status-concerns.test.ts`; `test/human-involvement-config.test.ts`; `test/contracts/*concern*`; `test/prompts.test.ts:401-520`; `test/helpers/tmp-repo.ts`

## Task Status
iteration: 4
amendments: 0
items:
  - schema-detail-normalize-v2 kind=dev wave=1 status=merged outlineRef=schema-detail-normalize-v2
  - prompts-dismiss-filter kind=dev wave=1 status=merged outlineRef=prompts-dismiss-filter
  - allowlist-agreement-test kind=test-only wave=1 status=merged outlineRef=allowlist-agreement-test
  - docs-finish-v5 kind=dev wave=2 status=merged outlineRef=docs-finish-v5
waves: 1, 2
merged: schema-detail-normalize-v2, prompts-dismiss-filter, allowlist-agreement-test, docs-finish-v5
blocked: (none)
failed: (none)
open steer questions:
  - awareness-plan-2-autonomous-halt-deviation ref=plan-2 disposition=human-awareness: Spec autonomous defers blocking until unblocked work drains, but implementation routes blocking ADRs at plan time and halts immediately (iteration.ts:481-490). Plan ADR accepts immediate halt for iteration 2 with docs in ARCHITECTURE 8.11/human-involvement.md, drain scheduling future work. High-impact tradeoff operator should be aware of; architect can decide now. Ensure docs mark deviation explicitly.
  - awareness-plan-3-epic-config-awareness ref=plan-3 disposition=human-awareness: Plan ADR documents that humanInvolvement/concerns/reviewPolicy at root do not apply inside epics, deviating from ARCHITECTURE section 5 inheritance claim. Operators setting mode once at root will be surprised. Document-only decision is reasonable for closure scope but needs informational steer record like autonomous-halt awareness.
  - awareness-plan-4-funnel-triage-coverage-awareness ref=plan-4 disposition=human-awareness: adr-funnel-triage-coverage accepts simple-task concerns stay open forever (simple flow ARCHITECTURE.md:146 has only develop, no review/waves/fallback which runs only for wave-close-up per step-runner.ts:319) and consult/wave-report/closeup architect output bypasses plan-reviewer. Assumptions claim operator notified only for halt and epic-config deviations. Architect can decide closure, but operator should have an informational record that part of spec triage is deferred. Create awareness record; no blocking decision needed.
  - awareness-plan-4-remarkable-threshold-exemption-accepted ref=plan-4 disposition=human-awareness: Architect accepts via ADR that every routed rm-* digests regardless of minDigestSeverity (triage.ts:108-115), counts cover c-* only (concerns.ts:194-195), digest has no retention. Spec line 103 demands low-noise confirmed mailbox; unconditional digest could be noisy. Operator notified only via remarkable ADR digest entries, no blocking question. Flag for operator awareness; architect decision stands for closure.

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
- planDelta (string, optional): Plan delta or amendment directives when decision is amend
- timestamp (string, optional): ISO timestamp (assigned by engine if omitted)
