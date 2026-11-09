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