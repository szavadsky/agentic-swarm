# Step: Architect Consult (Item)

## Goal
Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.

## Rules
- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)

## 0. Snapshot (verified in this worktree)

- Acceptance definition: `docs/factory.v2.md:89-103` (structured `concerns[]`, aggregation, reviewer triage, routing, funnel, ADRs, human-involvement modes, surfacing).
- Task purpose: first self-hosted fire test (`plugins/software-factory/docs/FIRE_TEST.md:51`).
- Gate baseline: `bun run typecheck` clean; `bun test` → **384 pass, 2 skip, 0 fail** (386 tests / 65 files, ~95 s). Do not treat any current test as red.
- Iteration-1 design decisions already recorded as product ADRs (short title-only files): `docs/adr/adr-concern-store-taskwt.md`, `adr-digest-mailbox.md`, `adr-funnel-text-budget.md`, `adr-humaninvolvement-config.md`, `adr-routing-derived-state.md`, `adr-triage-suggestions-dismiss.md`.
- Most machinery exists; the dominant gap is **wiring prompts/hydration and closing routing/lifecycle semantics**, plus docs. See §5–§6.

## 1. Module map

| Area | Files | Responsibility |
|---|---|---|
| Artifact contract | `src/core/artifacts.ts` | `Concern`, `RemarkableDecision`, `StoredConcernArtifact`, `ConcernSource`, `ReviewDisposition`, `ConcernCounts`, `PipelineConfig` (concerns + humanInvolvement). |
| Concern store | `src/core/concerns.ts` | Fingerprint ids, per-file YAML persistence, merge/dedup, status/disposition, listing/counts, close-up pending resolutions, startup reconcile. |
| Triage + hydration | `src/core/triage.ts` | Exact-id partition of `suggestions[]`, debt predicate, terse byte-capped `renderConcernsYaml`, `human-async` mailbox write. |
| Review policy | `src/core/review-policy.ts` | Who is a triager; allowed disposition set per agent (adds `dismiss` for triagers). |
| Step pipeline | `src/core/flows/step-runner.ts` | Schema resolution, prompt var injection, producer-concern ingestion after artifact write, triage error policy. |
| Item flow | `src/core/flows/item-machine.ts` | Review step wiring, item-level `human-*` mailbox writes, item blocked/success verdicts. |
| Iteration / architect | `src/core/flows/iteration.ts` | Architect hydration, plan review loop, wave act + consult routing, wave/plan close-ups, architect close-up. |
| Concern consult | `src/core/flows/consults.ts` | One architect consult per routed blocker concern, idempotent `decisions/concern-<id>.yaml`. |
| ADR routing | `src/core/flows/adrs.ts` | ADR markdown + blocking (`human-stop`/`human-async`) vs remarkable (`human-awareness`, never waits) mailbox entries. |
| Derive / scheduling | `src/core/derive/{task,item,wave}.ts`, `src/core/plan/scheduler.ts` | Routed-blocker blocking + transitive dependents, debt collection, concern counts on `state.yaml`. |
| CLI surfacing | `src/cli/status.ts` | Counts line + blocking vs digest question sections + debt list. |
| Engine lifecycle | `src/core/engine.ts` | Startup reconcile, concern-store recovery commit, epic child task execution. |
| Prompts/config | `src/core/prompts.ts`, `src/core/prompt-vars.ts`, `config/pipeline.default.yaml`, `config/schemas/*`, `agents/**` | Human-involvement criteria selection, fragment/var matrix, presets, producer schemas, prompt fragments. |
| Tests | `test/engine/*`, `test/contracts/*`, `test/cli/*`, `test/human-involvement-config.test.ts` | Behavior + schema contracts for §18. |

## 2. Key interfaces & signatures

### 2.1 Concern data model (`src/core/artifacts.ts:301-354`)

```ts
type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
type ConcernSeverity = "low" | "medium" | "high";
type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";
interface Concern { id?; kind; summary; detail; location?: {file; line?}; severity; affects?: string[] }
interface RemarkableDecision { chosen: string; alternatives: string[]; why: string }
interface ConcernSource { record; agent; step?; item?; iteration?; escalated?; lastSeen? }
interface StoredConcernArtifact extends Concern { id; status; disposition?; dismissReason?; source; pendingResolution?; createdAt; updatedAt }
type ReviewDisposition = "fix"|"optional"|"architect"|"human-awareness"|"human-async"|"human-stop"|"dismiss";
```

`DeveloperOutputArtifact.concerns` is still `string[]` (`src/core/artifacts.ts:390-396`) although `config/schemas/developer-output.schema.json` defines structured objects — a type/schema drift (see §6/G9). `FactFinderOutputArtifact`, `WaveCloseupArtifact`, `PlanCloseupArtifact`, `DecisionArtifact` omit `concerns`/`remarkable` entirely (`src/core/artifacts.ts:399-443`) although their JSON schemas include them.

### 2.2 Config surface (`src/core/artifacts.ts:122-131`, `config/schemas/pipeline.schema.json:202-224`)

```ts
humanInvolvement?: "autonomous" | "principal" | "detailed";
concerns?: { raiseAllowlist?: string[]; minDigestSeverity?: ConcernSeverity; minBlockingSeverity?: ConcernSeverity };
```

Defaults and commented presets: `config/pipeline.default.yaml:379-435`; criteria registration: `config/pipeline.default.yaml:442-456`.

### 2.3 Store API (`src/core/concerns.ts`)

| Function | Lines | Contract |
|---|---|---|
| `concernFingerprint` | `:33-35` | `c-<sha10(kind, norm(summary), location.file, location.line, sorted affects)>`; detail/severity excluded. |
| `aggregateConcerns` | `:73-107` | Merge one file per fingerprint, longer detail, max severity, escalation flag, source + `lastSeen`; commits taskWt. |
| `listConcerns` / `listOpenConcerns` | `:110-128` | Stable createdAt/id order; corrupt files skipped. |
| `countConcerns` | `:135-156` | `{open,dismissed,routed,resolved}`; missing dir = zeroes; only `c-*.yaml`. |
| `listConcernIds` / `hydrateConcernsYaml` | `:159-190` | All ids (c- and rm-); hydration of **open** records with **full detail/source/timestamps**. |
| `applyConcernTriage` | `:212-223` | `dismiss` requires detail → `dismissed`+`dismissReason`; every other disposition → `routed`+`disposition`; missing ids skipped. |
| `applyCloseupResolutions` | `:226-233` | Writes `pendingResolution {action, note, by, at}` only; **does not change status**. |
| `reconcileConcerns` | `:271-288` | Rebuilds from committed `output.yaml` records with `meta.status=ok`, idempotent merge. |

Fingerprint nuance: `affects` is part of identity (`:26,33-35`), so re-emitting the same concern with a new `affects` ref creates a second file rather than merging. `mergeConcern` keeps the earliest `kind`/`summary`/`createdAt` unless a longer detail or higher severity arrives (`:44-60`).

### 2.4 Triage API (`src/core/triage.ts`)

- `partitionReviewSuggestions(suggestions, concernIds, isTriager)` (`:26-41`): exact-id suggestions are triage; others are findings; `fixRequired` when a triage entry is `fix`; non-triagers get everything as findings.
- `isDebtConcern` (`:52-58`): non-open + (`kind=tech-debt` or `disposition=optional`); there is deliberately no `tech-debt` disposition.
- `renderConcernsYaml(concerns, maxBytes=8000)` (`:82-114`): terse `{id,kind,severity,summary,affects?}`; progressively drops affects/truncates summaries/sheds entries to satisfy a **UTF-8 byte** cap.
- `applyReviewTriage` (`:121-169`): validates dismiss reasons (`TriageValidationError`), persists statuses, and writes a mailbox question **only for `human-async`** (`q-concern-<id>`, `ref=item ?? id`, `blocks=[item]` when item known).

### 2.5 Review policy (`src/core/review-policy.ts:16-46`)

Triagers = `reviewer`, `plan-reviewer`, `wave-close-up`, `plan-close-up`. Precedence per-agent > default > legacy alias > builtin; triagers get `dismiss`, non-triagers never do.

### 2.6 ADR routing (`src/core/flows/adrs.ts:14-18,46-72`)

`blockingAdrDisposition(mode)` = `human-stop` for `autonomous`, `human-async` for `principal`/`detailed`. Blocking ADRs always `blocks:["task"]`; remarkable ADRs are `human-awareness` with no blocks. Markdown is written to `project.adrFolder` when configured; mailbox routing always runs.

## 3. End-to-end flow as implemented

### 3.1 Producer → aggregate → triage (every step)

`src/core/flows/step-runner.ts:184-216`:

```ts
const concerns = ["concerns","newConcerns"].flatMap(f => Array.isArray(data[f]) ? data[f] : []);
const remarkables = Array.isArray(data.remarkable) ? data.remarkable : [];
const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
const resolutions = Array.isArray(data.concernResolutions) ? data.concernResolutions : [];
// snapshot existing ids BEFORE the step so new concerns cannot self-dismiss
if (concerns.length || remarkables.length) await aggregateConcerns(...);
const triage = suggestions.length ? await applyReviewTriage({..., concernIds: existing, isTriager: isTriagerAgent(agent)}) : undefined;
if (resolutions.length) await applyCloseupResolutions({..., by: agent});
```

Called only when the step is `ok` (`src/core/flows/step-runner.ts:699-719`). A `TriageValidationError` (dismiss without detail) flips the step to `error`; any other ingest failure is journaled as `concern_ingest_error` and the step stays `ok` (test: `test/engine/concerns-funnel.test.ts:1261`).

### 3.2 Prompt hydration in step-runner

`src/core/flows/step-runner.ts:296-306`: open concerns are rendered terse with `min(diff-aware?) — actually `pipeline.limits?.hydrationBytes ?? 8000`` and injected as `concernsYaml`; `humanInvolvementCriteria` is selected from `criteria.human-involvement` via `formatHumanInvolvementCriteria` and injected for **every** step. Caller `promptVars` override both.

`formatHumanInvolvementCriteria` keeps only the active `## autonomous|principal|detailed` section plus shared sections/table (`src/core/prompts.ts:66-86`).

### 3.3 Blocker routing (derive + scheduler)

- `collectRoutedBlockers` (`src/core/derive/task.ts:50-59`): only `kind=blocker && status=routed`, collecting `affects` slugs.
- `blockedByConcern` (`src/core/plan/scheduler.ts:60-78`): unions failure-blocked, blocks affected **pending** items, cascades over `deps` to a fixpoint, preserves PM order.
- Applied in `deriveTaskState` (`src/core/derive/task.ts:167-187`) and `withRoutedBlocking` (`src/core/derive/item.ts:58-73`, pending-only) and in wave derive (`src/core/derive/wave.ts:47-73`).
- Act phase consults the architect once per routed blocker affecting a blocked item (`src/core/flows/iteration.ts:192-240`, called at `:857` and `:935`); the consult writes `decisions/concern-<cid>.yaml` and is idempotent by file existence (`src/core/flows/consults.ts:297-420`). Prompt carries id/summary/severity/affects and detail as feedback (`:352-360`).

### 3.4 Architect hydration / `architect` disposition

`buildArchitectHydration` (`src/core/flows/iteration.ts:120-190`) concatenates prior plans, prior close-ups, taken steering, decisions, and **last** a terse digest of `open`+`routed` concerns; the whole string is capped at `hydrationBytes` (default 40000, `:291,366`). It is passed as `debt` and `steering` to architect-plan (`:429`) and architect-wave-report (`:1057`), so architect-turn hydration sees routed concerns, but under those headings.

### 3.5 Debt and counts

- Debt collection (`src/core/derive/task.ts:210-253`): plan.techDebt, `accept-with-debt` decisions, `isDebtConcern` concerns as `[item] summary`, and `optional` review suggestions.
- State counts (`src/core/derive/task.ts:360`, `:382,398`), state schema (`config/schemas/state.schema.json:11,72-85`), CLI line + question sections (`src/cli/status.ts:84-124`).

### 3.6 Plan-review loop

`knownConcernIds = listConcernIds(taskDir)` and `concernsYaml = hydrateConcernsYaml(taskDir)` are captured before each round (`src/core/flows/iteration.ts:526-527`) and passed to `steps/plan-review` (`:545-559`). After the step, triage ids are removed from findings so they can never request a plan revision (`:576-581`). Hydration here uses the **full-record** helper (includes `detail`, `source`, timestamps, no byte cap).

### 3.7 Close-ups

Wave close-up and architect wave report (`src/core/flows/iteration.ts:1005-1060`) pass only `task`, `waveReport`, `infra` (close-up) and `plan`, `waveReport`, `debt: hydrationContext`, `steering` (architect). Plan close-up and architect close-up (`:1240-1330`) pass only `intent`, `plan`, `context` and `closeup`, `plan`, `intent`. Close-up schemas accept `concerns`, `remarkable`, `concernResolutions` (`config/schemas/wave-closeup.schema.json`, `plan-closeup.schema.json`), and `applyCloseupResolutions` persists them as pending only.

### 3.8 Epic child tasks

`runChildTask` creates `childTaskDir = <childWt>/<orch>/<parentTask>/<epic>` (`src/core/engine.ts:230`), runs its own iterations (`:243-260`), then writes only `child-closeup.yaml {epic,status,iteration,summary}` to the parent item dir (`:262-275`). Child concern stores under the child task folder are never merged into the parent/saga store.

### 3.9 Item review step specifics

Item review uses `resolveReviewAllowed(...)` for prompt + schema (`src/core/flows/item-machine.ts:629-636`), lets step-runner auto-inject `concernsYaml`/`humanInvolvementCriteria`, and persists `human-*` suggestions itself (`src/core/flows/item-machine.ts:709-750`), explicitly excluding `human-async` ids that are concern ids (those are written by `applyReviewTriage`). `human-stop`/`human-awareness` concern ids are **not** excluded and are written under `q-<item>-<cid>`. Item block/success verdicts: `:767-780`.

## 4. Existing tests & conventions

Behavior-first; no lint-only tests. All tests use temp git repos (`test/helpers/tmp-repo.ts:1-60`) and `FakeHarness` scripted per label `${task}/runs/<step>#a1` / `${task}/items/<item>/<step>#a1` (`src/harness/fake/fake-harness.ts:1-80`).

| Test | What it pins |
|---|---|
| `test/engine/concerns-funnel.test.ts` (1285 l) | Producer schemas, store merge/dedup/concurrency, dismiss/routed triage, close-up pending resolutions, remarkable rm-* triage, reviewer/consult/close-up wiring, reconcile from records, ingest-error policy. |
| `test/engine/reviewer-triage.test.ts` (688 l) | Terse review hydration, exact-id partition, byte-capped render, human-async mailbox dedupe, debt predicate, fixRequired, review-step blocking. |
| `test/engine/plan-reviewer-triage.test.ts` | Plan findings vs concern ids, plan-review hydration, revise aggregation, triage never triggers revision, debt. |
| `test/engine/routing-blocker-derive.test.ts` | Derived item blocking + transitive dependents; non-pending untouched. |
| `test/engine/routing-architect-consult.test.ts` | One consult per routed blocker, decision artifact guard, restart idempotency, architect hydration. |
| `test/engine/routing-human-debt.test.ts` | human-async vs human-stop vs human-awareness mailbox/debt/task status. |
| `test/engine/adr-blocking-digest.test.ts` | ADR markdown, blocking exit 10, remarkable digest-only, mode table, no adrFolder. |
| `test/engine/concerns-funnel.test.ts` + `funnel-text-budget.test.ts` | Funnel byte contract (spike-local helpers, not production). |
| `test/engine/state-concern-counts.test.ts`, `test/cli/status-concerns.test.ts` | Four-status counts, zeroes for missing dir, blocking/digest split. |
| `test/human-involvement-config.test.ts` (454 l) | Mode defaults/layering/overlay/null deletion, presets, criteria loading, KNOWN_VARS matrix, prompt-time mode selection. |
| `test/contracts/concern-{artifact-types,schemas}.test.ts`, `state-concern-schema.test.ts` | Type vocabularies, inline producer schemas, concernResolutions, untouched triage/infra/plan-edits. |

Style: `describe("... (§18)")`, comments name the spec/ADR, assertions on artifacts and rendered prompts; run `cd plugins/software-factory && bun test` and `bun run typecheck`.

## 5. Acceptance coverage (spec `docs/factory.v2.md:89-103`)

| Requirement | State | Evidence |
|---|---|---|
| Structured `concerns[]` in agent outputs | **Partial** | Schemas: developer/fact-finder/plan/decisions/close-ups (`config/schemas/*.json`); review/QA only `newConcerns`; `remarkable` absent from review schema (`src/core/records/review-schema.ts:50-83`, `config/schemas/review.schema.json`). Only review/plan-review prompts mention concerns (`agents/steps/review.md:18-23`, `agents/steps/plan-review.md:15,35-36`). |
| Aggregation under task folder, stable ids, dedup, status, source | **Done** | `src/core/concerns.ts:33-35,73-107,110-156`; crash reconcile `:271-288`, startup `src/core/engine.ts:366-380`. |
| Reviewer triage with dispositions + `dismiss` | **Done (item/plan)** | `src/core/review-policy.ts:16-46`, `src/core/triage.ts:121-169`; dismiss requires detail. |
| Blocker → dependent blocked + architect consult | **Done, lifecycle open** | `src/core/plan/scheduler.ts:60-78`, `src/core/derive/task.ts:167-187`, `src/core/flows/consults.ts:319-420`. |
| `architect` → next architect turn | **Partial** | Hydration in `src/core/flows/iteration.ts:120-190,429,1057`; but no dedicated concerns section in architect templates. |
| `human-*` → mailbox per policy | **Partial** | `human-async` only in triage (`src/core/triage.ts:154-166`); item-level raw suggestions (`src/core/flows/item-machine.ts:709-750`); no plan-level human-awareness/stop routing, no remarkable-decision digest. |
| Tech debt → plan tech-debt list | **Partial** | Derived debt list/status (`src/core/derive/task.ts:210-253,382`); architect plan gets `debt: hydrationContext`, not the derived debt list (`src/core/flows/iteration.ts:366,429`). |
| Close-ups list/re-triage; architect resolves/carries | **Partial/missing wiring** | Schemas allow (`wave-closeup.schema.json`, `plan-closeup.schema.json`); prompts do not include `concernsYaml`/`humanInvolvementCriteria` or ask for resolutions (`agents/steps/wave-close-up.md:1-18`, `agents/steps/plan-close-up.md:1-21`); resolutions only pending (`src/core/concerns.ts:225-233`). |
| Configurable dispositions/severity thresholds | **Partial** | Allowed dispositions done; `raiseAllowlist`/`minDigestSeverity`/`minBlockingSeverity` exist in schema/default/type (`src/core/artifacts.ts:126-131`, `config/pipeline.default.yaml:386-403`) but are **never read** in `src/`. |
| Remarkable decisions same aggregation/triage | **Partial** | Aggregated/triaged (`src/core/concerns.ts:62-70,94-101`, `src/core/triage.ts:43-44,121-169`); no digest routing for `rm-*`; remarkables excluded from `countConcerns`. |
| Funnel worker→reviewer→epic→saga→human, less detail each level | **Partial** | Reviewer gets terse capped YAML (`src/core/triage.ts:82-114`); no epic→saga propagation (`src/core/engine.ts:262-275`); byte contract only spike-local (`test/engine/funnel-text-budget.test.ts:1-160`). |
| Blocking vs non-blocking ADRs; remarkable digest | **Done** | `src/core/flows/adrs.ts:14-18,46-72`; tested `test/engine/adr-blocking-digest.test.ts:305-390`. |
| Modes `autonomous`/`principal`/`detailed` config + prompt fragments, per task | **Done (config), partial prompt use** | `config/pipeline.default.yaml:379-435`, `agents/criteria/human-involvement.md:1-28`, `src/core/prompts.ts:66-86`, layered loader; but `steps/review.md`/`steps/qa.md` never render `humanInvolvementCriteria`. |
| Surfaced in close-ups, status, state counts | **Partial** | Status/state done (`src/cli/status.ts:106-116`, `src/core/derive/task.ts:360`); close-up prompts do not see open concerns. |
| Docs: ARCHITECTURE §1 row, README, config commentary | **Missing (docs)** | `docs/ARCHITECTURE.md:39` still says 'Deliberately not hand-built ... review dispositions and steering mailbox only'; README has no concerns/mode section (`README.md:87-110`); config commentary already updated (`config/pipeline.default.yaml:379-435`). |

## 6. Gaps, edge cases & open questions (ranked for the architect)

**G1 — Prompt coverage is the largest functional gap.** Only `steps/review` and `steps/plan-review` consume concern hydration. `steps/architect-plan`, `architect-revise`, `architect-resume`, `architect-wave-report`, `architect-closeup`, `architect-consult-*`, `wave-close-up`, `plan-close-up`, `qa`, `develop` have no `{{concernsYaml}}`/`{{humanInvolvementCriteria}}` sections even though `KNOWN_VARS` registers both for most of them (`src/core/prompt-vars.ts:60-64,105-160`). Preflight only rejects *unknown* placeholders, so unused registered vars are silent (`test/prompts.test.ts:154-208`). The step-runner already supplies the values (`src/core/flows/step-runner.ts:296-306`) — templates/call sites are what's missing. Also no prompt tells developers/fact-finders/close-ups/architects to *raise* concerns or remarkable decisions. Decide: per-fragment terse instructions + sections, keeping the terse/debloated prompt requirement.

**G2 — Severity policy is inert.** `raiseAllowlist`, `minDigestSeverity`, `minBlockingSeverity` are typed/validated/shipped (`src/core/artifacts.ts:126-131`, `config/schemas/pipeline.schema.json:207-224`, `config/pipeline.default.yaml:386-403`) but have no readers in `src/` (only `test/contracts/concern-artifact-types.test.ts:271-296` and config tests). Specify semantics: gate aggregation by raise allowlist? filter digest by `minDigestSeverity`? allow blocking only at `minBlockingSeverity`? Where is the filter applied (ingest vs mailbox vs close-up)?

**G3 — `human-*` routing is incomplete outside item reviews.** `applyReviewTriage` writes only `human-async` (`src/core/triage.ts:154-166`). `human-awareness`/`human-stop` triage relies on raw review suggestions handled in `item-machine` (`src/core/flows/item-machine.ts:709-750`), so plan-reviewer/close-up/architect-raised human dispositions never reach the mailbox. Also `human-awareness` for `rm-*` (remarkable decisions) has no digest entry: only ADRs call `writeQuestion` (`src/core/flows/adrs.ts:62-70`). Decide a single disposition→mailbox router with `blocks` semantics per ref (`task` vs item vs digest).

**G4 — No epic → saga funnel.** `runChildTask` writes only `child-closeup.yaml {status}` (`src/core/engine.ts:262-275`); child `concerns/` (under `childTaskDir`, `:230`) are isolated. Spec requires epic concerns/decisions to propagate to the saga architect, which reviews and steers or propagates to the human (`docs/factory.v2.md:97`). Decide direction (push on child close vs pull at parent derive), dedup/source shape (`source.record` prefix), and whether propagation creates `routed`/`open` copies in the parent store.

**G5 — Blocked-by-concern never unblocks.** A routed blocker blocks pending items (`src/core/plan/scheduler.ts:60-78`), and the consult writes a decision (`src/core/flows/consults.ts:319-420`) but nothing transitions the concern to `resolved` or removes `affects`. `withRoutedBlocking` keeps deriving `blocked` (`src/core/derive/item.ts:58-73`); `buildArchitectHydration` still lists it. `test/engine/routing-architect-consult.test.ts:335-380` reaches `done` with the blocker still `routed`, because blocked items are terminal for wave completion and close-ups are scripted. Decide: consult decision must produce `resolve`/`carry`/`re-plan`, or derive must treat a decided concern as advisory.

**G6 — Close-up triage is schema-only.** `applyCloseupResolutions` records `pendingResolution` and explicitly says status change is a later decision (`src/core/concerns.ts:225-233`); no engine path applies it. Close-up prompts neither list open concerns nor ask for `concernResolutions`; architect close-up maps to `plan-closeup.schema.json` (`src/core/flows/step-runner.ts:121-149`) but its prompt omits both concerns and resolutions (`agents/steps/architect-closeup.md`). Decide the resolution→status transition (who/when: close-up step ingest vs next architect turn) and whether close-ups triage via `suggestions`/`dismiss` or via `concernResolutions` actions.

**G7 — Funnel byte caps are spike-only and hydration is duplicated.** Production `renderConcernsYaml` caps terse YAML at `hydrationBytes` (default 8000 in step-runner, `src/core/flows/step-runner.ts:296-299`; 40000 in `src/core/loops.ts:24`), but the spike contract (min(diff,2000) for code steps, min(input,500) for zero-diff, strict per-level condensation) is implemented only in test helpers (`test/engine/funnel-text-budget.test.ts:1-160`). Plan review uses `hydrateConcernsYaml`, which emits full records (detail/source/timestamps), uncapped, and its caller overrides the terse step-runner value (`src/core/flows/iteration.ts:526-549`, `src/core/concerns.ts:171-190`). Also `buildArchitectHydration` caps on JS string length, not UTF-8 bytes (`src/core/flows/iteration.ts:185-188`). Decide one hydration module and the cap policy; note the spike finding: caps apply to prompt vars only, stored artifacts keep full detail (`test/engine/funnel-text-budget.test.ts:411-452`).

**G8 — Docs are stale.** `docs/ARCHITECTURE.md:39` (§1 row 18) still declares the feature hand-unbuilt; §5 config sample lacks `humanInvolvement` + `concerns` (`:112-178`); §6.2 task-folder tree lacks `concerns/` and `decisions/concern-<id>` (`:185-197`); §8.7 lacks `dismiss` and concern triage (`:282-294`); no §8.x funnel/concerns section; §10 developer output still `concerns[]` untyped (`:348`); §11 status description silent (`:358-367`); §13 test list silent (`:405-407`); README has no concerns/mode section (`README.md:87-110`). Config commentary is already done.

**G9 — Type/schema drift.** `DeveloperOutputArtifact.concerns?: string[]` (`src/core/artifacts.ts:395`) vs structured schema; `ReviewArtifact` lacks `newConcerns` (`:366-374`); FactFinder/Wave/PlanCloseup/Decision artifact types lack `concerns`/`remarkable` despite schemas; static `config/schemas/review.schema.json` and generated `review-schema.ts` both omit `remarkable`, so a reviewer cannot report a tradeoff without failing `additionalProperties:false`.

**G10 — Duplicate/competing hydration helpers.** `hydrateConcernsYaml` (concerns.ts) vs `renderConcernsYaml` (triage.ts) differ in shape, cap, and inclusion of `rm-*`; only the latter is byte-capped. Consolidation avoids the plan-review detail leak (G7).

**G11 — Fingerprint stability vs evolving affects.** Fingerprint includes sorted `affects` (`src/core/concerns.ts:26,33-35`); a concern re-emitted later with an added item/epic ref forks into a second file instead of merging (dedup across steps/attempts only holds when affects are identical). Test explicitly ignores affect *order* only (`test/engine/concerns-funnel.test.ts:320`). Decide if affects should be merged (identity by kind+summary+location) or remain identity.

**G12 — `resolved` is unreachable in production.** Only tests construct `status:"resolved"`; no `src/` writer sets it (grep: only the type `src/core/artifacts.ts:305` and reads in `isDebtConcern`/counts). Spec requires the status vocabulary and close-up/architect resolution; pick the transition path (G5/G6).

**G13 — Autonomous-mode semantics.** Blocking ADRs are always routed at plan time and park the task immediately (`src/core/flows/adrs.ts:46-72`, `test/engine/adr-blocking-digest.test.ts:357-390`), while the mode table says autonomous consults blocking only for the portion still blocked after unblocked work is done (`agents/criteria/human-involvement.md:11`, `docs/factory.v2.md:100`). Confirm whether immediate halt is the accepted deviation or whether blocking should defer until remaining work drains.

## 7. Suggested doc-update checklist (from the intent)

1. `docs/ARCHITECTURE.md:39` — replace row 18 with what shipped + link to new §8.x.
2. New `### 8.11 Concerns + remarkable funnel` after §8.8: store path/id/status, producer fields, triage rules (dismiss reason), routing table (blocker/architect/human-*/tech-debt), funnel levels + byte rule, ADR blocking/remarkable, mode presets. Update §8.7 with `dismiss` and concern triage; §5 config sample; §6.2 tree; §10 outputs; §11 status; §13 tests.
3. `README.md:87-110` — mention concerns mailbox/modes in status/steer and configuration sections.
4. Keep `config/pipeline.default.yaml:379-435` commentary in sync with whatever thresholds/routing semantics land; `agents/criteria/human-involvement.md` is the shared prompt fragment.
`). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.

## Item
hydration-fingerprint-caps

## Assignment
{"slug":"hydration-fingerprint-caps","kind":"dev","title":"Unified hydration, caps, fingerprint","assignment":"Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.","outlineRef":"hydration-fingerprint-caps","milestone":"m1-hydration-prompts","wave":1,"scenarioRefs":["m1-hydration-prompts:1","m1-hydration-prompts:2","m1-hydration-prompts:3","m1-hydration-prompts:4","m1-hydration-prompts:6","m1-hydration-prompts:7"],"citations":["docs/factory.v2.md:89-103","plugins/software-factory/src/core/fingerprint.ts:20-50","plugins/software-factory/src/core/artifacts.ts:313-325"]}

## Prior Attempts & Failures
Fix rounds exhausted (2/3)

## Current Diff


## Review Feedback
Fix rounds exhausted (2/3) without resolution.

Latest fix requests:
- [FIX] Role-cap tests never reach their caps; all-500/2000 implementations pass: Measured with the exact fixtures: review diffBytes 5000 and 320 both render 185 bytes; plan-review inputBytes 4000 and 294 both render 249; wave-close-up taskDiffBytes 5000 and 2000 both render 195. Every assertion (<=2000, <=500, <input, <taskDiff) therefore passes with no truncation, so a regression applying 500 (or 2000) to every role passes the whole suite; only the 0/1/3-byte test exercises capping. The plan-review test also calls hydrateStepConcerns directly, so step-runner's inputBytes summation/exclusions are unverified. Fix: build payloads whose uncapped serialization exceeds each cap (many concerns or long summaries); assert <= exact cap and > smaller cap for review/wave (proves 2000), use input <500 with payload >input (proves min(inputBytes,500)), assert condensation/dropping actually occurred, and add a runAgentStep plan-review case with a {{concernsYaml}} override and large prompt inputs.
- [FIX] Fix-round legacy detail-preservation gate lacks a regression test: The review-required gate at concerns.ts:119 (`legacyFile && input.detail?.trim()`) has no committed regression test. The only legacy migration test (line 793) always supplies 'new detail'; its later detail-less re-emit targets an already-stable id, so legacyFile is unset and the gate is never hit. A regression back to `merged.detail = (input.detail ?? input.summary).trim()` would pass the suite. Add a legacy-file migration case that omits detail and uses stored detail longer than the summary, asserting the stored detail survives, affects union is [new,old], and the legacy file is removed; verify it fails on the pre-fix code.

## Context Pack
# Context Pack — concerns-funnel (Spec Item 18)

## 0. Snapshot (verified in this worktree)

- Acceptance definition: `docs/factory.v2.md:89-103` (structured `concerns[]`, aggregation, reviewer triage, routing, funnel, ADRs, human-involvement modes, surfacing).
- Task purpose: first self-hosted fire test (`plugins/software-factory/docs/FIRE_TEST.md:51`).
- Gate baseline: `bun run typecheck` clean; `bun test` → **384 pass, 2 skip, 0 fail** (386 tests / 65 files, ~95 s). Do not treat any current test as red.
- Iteration-1 design decisions already recorded as product ADRs (short title-only files): `docs/adr/adr-concern-store-taskwt.md`, `adr-digest-mailbox.md`, `adr-funnel-text-budget.md`, `adr-humaninvolvement-config.md`, `adr-routing-derived-state.md`, `adr-triage-suggestions-dismiss.md`.
- Most machinery exists; the dominant gap is **wiring prompts/hydration and closing routing/lifecycle semantics**, plus docs. See §5–§6.

## 1. Module map

| Area | Files | Responsibility |
|---|---|---|
| Artifact contract | `src/core/artifacts.ts` | `Concern`, `RemarkableDecision`, `StoredConcernArtifact`, `ConcernSource`, `ReviewDisposition`, `ConcernCounts`, `PipelineConfig` (concerns + humanInvolvement). |
| Concern store | `src/core/concerns.ts` | Fingerprint ids, per-file YAML persistence, merge/dedup, status/disposition, listing/counts, close-up pending resolutions, startup reconcile. |
| Triage + hydration | `src/core/triage.ts` | Exact-id partition of `suggestions[]`, debt predicate, terse byte-capped `renderConcernsYaml`, `human-async` mailbox write. |
| Review policy | `src/core/review-policy.ts` | Who is a triager; allowed disposition set per agent (adds `dismiss` for triagers). |
| Step pipeline | `src/core/flows/step-runner.ts` | Schema resolution, prompt var injection, producer-concern ingestion after artifact write, triage error policy. |
| Item flow | `src/core/flows/item-machine.ts` | Review step wiring, item-level `human-*` mailbox writes, item blocked/success verdicts. |
| Iteration / architect | `src/core/flows/iteration.ts` | Architect hydration, plan review loop, wave act + consult routing, wave/plan close-ups, architect close-up. |
| Concern consult | `src/core/flows/consults.ts` | One architect consult per routed blocker concern, idempotent `decisions/concern-<id>.yaml`. |
| ADR routing | `src/core/flows/adrs.ts` | ADR markdown + blocking (`human-stop`/`human-async`) vs remarkable (`human-awareness`, never waits) mailbox entries. |
| Derive / scheduling | `src/core/derive/{task,item,wave}.ts`, `src/core/plan/scheduler.ts` | Routed-blocker blocking + transitive dependents, debt collection, concern counts on `state.yaml`. |
| CLI surfacing | `src/cli/status.ts` | Counts line + blocking vs digest question sections + debt list. |
| Engine lifecycle | `src/core/engine.ts` | Startup reconcile, concern-store recovery commit, epic child task execution. |
| Prompts/config | `src/core/prompts.ts`, `src/core/prompt-vars.ts`, `config/pipeline.default.yaml`, `config/schemas/*`, `agents/**` | Human-involvement criteria selection, fragment/var matrix, presets, producer schemas, prompt fragments. |
| Tests | `test/engine/*`, `test/contracts/*`, `test/cli/*`, `test/human-involvement-config.test.ts` | Behavior + schema contracts for §18. |

## 2. Key interfaces & signatures

### 2.1 Concern data model (`src/core/artifacts.ts:301-354`)

```ts
type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
type ConcernSeverity = "low" | "medium" | "high";
type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";
interface Concern { id?; kind; summary; detail; location?: {file; line?}; severity; affects?: string[] }
interface RemarkableDecision { chosen: string; alternatives: string[]; why: string }
interface ConcernSource { record; agent; step?; item?; iteration?; escalated?; lastSeen? }
interface StoredConcernArtifact extends Concern { id; status; disposition?; dismissReason?; source; pendingResolution?; createdAt; updatedAt }
type ReviewDisposition = "fix"|"optional"|"architect"|"human-awareness"|"human-async"|"human-stop"|"dismiss";
```

`DeveloperOutputArtifact.concerns` is still `string[]` (`src/core/artifacts.ts:390-396`) although `config/schemas/developer-output.schema.json` defines structured objects — a type/schema drift (see §6/G9). `FactFinderOutputArtifact`, `WaveCloseupArtifact`, `PlanCloseupArtifact`, `DecisionArtifact` omit `concerns`/`remarkable` entirely (`src/core/artifacts.ts:399-443`) although their JSON schemas include them.

### 2.2 Config surface (`src/core/artifacts.ts:122-131`, `config/schemas/pipeline.schema.json:202-224`)

```ts
humanInvolvement?: "autonomous" | "principal" | "detailed";
concerns?: { raiseAllowlist?: string[]; minDigestSeverity?: ConcernSeverity; minBlockingSeverity?: ConcernSeverity };
```

Defaults and commented presets: `config/pipeline.default.yaml:379-435`; criteria registration: `config/pipeline.default.yaml:442-456`.

### 2.3 Store API (`src/core/concerns.ts`)

| Function | Lines | Contract |
|---|---|---|
| `concernFingerprint` | `:33-35` | `c-<sha10(kind, norm(summary), location.file, location.line, sorted affects)>`; detail/severity excluded. |
| `aggregateConcerns` | `:73-107` | Merge one file per fingerprint, longer detail, max severity, escalation flag, source + `lastSeen`; commits taskWt. |
| `listConcerns` / `listOpenConcerns` | `:110-128` | Stable createdAt/id order; corrupt files skipped. |
| `countConcerns` | `:135-156` | `{open,dismissed,routed,resolved}`; missing dir = zeroes; only `c-*.yaml`. |
| `listConcernIds` / `hydrateConcernsYaml` | `:159-190` | All ids (c- and rm-); hydration of **open** records with **full detail/source/timestamps**. |
| `applyConcernTriage` | `:212-223` | `dismiss` requires detail → `dismissed`+`dismissReason`; every other disposition → `routed`+`disposition`; missing ids skipped. |
| `applyCloseupResolutions` | `:226-233` | Writes `pendingResolution {action, note, by, at}` only; **does not change status**. |
| `reconcileConcerns` | `:271-288` | Rebuilds from committed `output.yaml` records with `meta.status=ok`, idempotent merge. |

Fingerprint nuance: `affects` is part of identity (`:26,33-35`), so re-emitting the same concern with a new `affects` ref creates a second file rather than merging. `mergeConcern` keeps the earliest `kind`/`summary`/`createdAt` unless a longer detail or higher severity arrives (`:44-60`).

### 2.4 Triage API (`src/core/triage.ts`)

- `partitionReviewSuggestions(suggestions, concernIds, isTriager)` (`:26-41`): exact-id suggestions are triage; others are findings; `fixRequired` when a triage entry is `fix`; non-triagers get everything as findings.
- `isDebtConcern` (`:52-58`): non-open + (`kind=tech-debt` or `disposition=optional`); there is deliberately no `tech-debt` disposition.
- `renderConcernsYaml(concerns, maxBytes=8000)` (`:82-114`): terse `{id,kind,severity,summary,affects?}`; progressively drops affects/truncates summaries/sheds entries to satisfy a **UTF-8 byte** cap.
- `applyReviewTriage` (`:121-169`): validates dismiss reasons (`TriageValidationError`), persists statuses, and writes a mailbox question **only for `human-async`** (`q-concern-<id>`, `ref=item ?? id`, `blocks=[item]` when item known).

### 2.5 Review policy (`src/core/review-policy.ts:16-46`)

Triagers = `reviewer`, `plan-reviewer`, `wave-close-up`, `plan-close-up`. Precedence per-agent > default > legacy alias > builtin; triagers get `dismiss`, non-triagers never do.

### 2.6 ADR routing (`src/core/flows/adrs.ts:14-18,46-72`)

`blockingAdrDisposition(mode)` = `human-stop` for `autonomous`, `human-async` for `principal`/`detailed`. Blocking ADRs always `blocks:["task"]`; remarkable ADRs are `human-awareness` with no blocks. Markdown is written to `project.adrFolder` when configured; mailbox routing always runs.

## 3. End-to-end flow as implemented

### 3.1 Producer → aggregate → triage (every step)

`src/core/flows/step-runner.ts:184-216`:

```ts
const concerns = ["concerns","newConcerns"].flatMap(f => Array.isArray(data[f]) ? data[f] : []);
const remarkables = Array.isArray(data.remarkable) ? data.remarkable : [];
const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
const resolutions = Array.isArray(data.concernResolutions) ? data.concernResolutions : [];
// snapshot existing ids BEFORE the step so new concerns cannot self-dismiss
if (concerns.length || remarkables.length) await aggregateConcerns(...);
const triage = suggestions.length ? await applyReviewTriage({..., concernIds: existing, isTriager: isTriagerAgent(agent)}) : undefined;
if (resolutions.length) await applyCloseupResolutions({..., by: agent});
```

Called only when the step is `ok` (`src/core/flows/step-runner.ts:699-719`). A `TriageValidationError` (dismiss without detail) flips the step to `error`; any other ingest failure is journaled as `concern_ingest_error` and the step stays `ok` (test: `test/engine/concerns-funnel.test.ts:1261`).

### 3.2 Prompt hydration in step-runner

`src/core/flows/step-runner.ts:296-306`: open concerns are rendered terse with `min(diff-aware?) — actually `pipeline.limits?.hydrationBytes ?? 8000`` and injected as `concernsYaml`; `humanInvolvementCriteria` is selected from `criteria.human-involvement` via `formatHumanInvolvementCriteria` and injected for **every** step. Caller `promptVars` override both.

`formatHumanInvolvementCriteria` keeps only the active `## autonomous|principal|detailed` section plus shared sections/table (`src/core/prompts.ts:66-86`).

### 3.3 Blocker routing (derive + scheduler)

- `collectRoutedBlockers` (`src/core/derive/task.ts:50-59`): only `kind=blocker && status=routed`, collecting `affects` slugs.
- `blockedByConcern` (`src/core/plan/scheduler.ts:60-78`): unions failure-blocked, blocks affected **pending** items, cascades over `deps` to a fixpoint, preserves PM order.
- Applied in `deriveTaskState` (`src/core/derive/task.ts:167-187`) and `withRoutedBlocking` (`src/core/derive/item.ts:58-73`, pending-only) and in wave derive (`src/core/derive/wave.ts:47-73`).
- Act phase consults the architect once per routed blocker affecting a blocked item (`src/core/flows/iteration.ts:192-240`, called at `:857` and `:935`); the consult writes `decisions/concern-<cid>.yaml` and is idempotent by file existence (`src/core/flows/consults.ts:297-420`). Prompt carries id/summary/severity/affects and detail as feedback (`:352-360`).

### 3.4 Architect hydration / `architect` disposition

`buildArchitectHydration` (`src/core/flows/iteration.ts:120-190`) concatenates prior plans, prior close-ups, taken steering, decisions, and **last** a terse digest of `open`+`routed` concerns; the whole string is capped at `hydrationBytes` (default 40000, `:291,366`). It is passed as `debt` and `steering` to architect-plan (`:429`) and architect-wave-report (`:1057`), so architect-turn hydration sees routed concerns, but under those headings.

### 3.5 Debt and counts

- Debt collection (`src/core/derive/task.ts:210-253`): plan.techDebt, `accept-with-debt` decisions, `isDebtConcern` concerns as `[item] summary`, and `optional` review suggestions.
- State counts (`src/core/derive/task.ts:360`, `:382,398`), state schema (`config/schemas/state.schema.json:11,72-85`), CLI line + question sections (`src/cli/status.ts:84-124`).

### 3.6 Plan-review loop

`knownConcernIds = listConcernIds(taskDir)` and `concernsYaml = hydrateConcernsYaml(taskDir)` are captured before each round (`src/core/flows/iteration.ts:526-527`) and passed to `steps/plan-review` (`:545-559`). After the step, triage ids are removed from findings so they can never request a plan revision (`:576-581`). Hydration here uses the **full-record** helper (includes `detail`, `source`, timestamps, no byte cap).

### 3.7 Close-ups

Wave close-up and architect wave report (`src/core/flows/iteration.ts:1005-1060`) pass only `task`, `waveReport`, `infra` (close-up) and `plan`, `waveReport`, `debt: hydrationContext`, `steering` (architect). Plan close-up and architect close-up (`:1240-1330`) pass only `intent`, `plan`, `context` and `closeup`, `plan`, `intent`. Close-up schemas accept `concerns`, `remarkable`, `concernResolutions` (`config/schemas/wave-closeup.schema.json`, `plan-closeup.schema.json`), and `applyCloseupResolutions` persists them as pending only.

### 3.8 Epic child tasks

`runChildTask` creates `childTaskDir = <childWt>/<orch>/<parentTask>/<epic>` (`src/core/engine.ts:230`), runs its own iterations (`:243-260`), then writes only `child-closeup.yaml {epic,status,iteration,summary}` to the parent item dir (`:262-275`). Child concern stores under the child task folder are never merged into the parent/saga store.

### 3.9 Item review step specifics

Item review uses `resolveReviewAllowed(...)` for prompt + schema (`src/core/flows/item-machine.ts:629-636`), lets step-runner auto-inject `concernsYaml`/`humanInvolvementCriteria`, and persists `human-*` suggestions itself (`src/core/flows/item-machine.ts:709-750`), explicitly excluding `human-async` ids that are concern ids (those are written by `applyReviewTriage`). `human-stop`/`human-awareness` concern ids are **not** excluded and are written under `q-<item>-<cid>`. Item block/success verdicts: `:767-780`.

## 4. Existing tests & conventions

Behavior-first; no lint-only tests. All tests use temp git repos (`test/helpers/tmp-repo.ts:1-60`) and `FakeHarness` scripted per label `${task}/runs/<step>#a1` / `${task}/items/<item>/<step>#a1` (`src/harness/fake/fake-harness.ts:1-80`).

| Test | What it pins |
|---|---|
| `test/engine/concerns-funnel.test.ts` (1285 l) | Producer schemas, store merge/dedup/concurrency, dismiss/routed triage, close-up pending resolutions, remarkable rm-* triage, reviewer/consult/close-up wiring, reconcile from records, ingest-error policy. |
| `test/engine/reviewer-triage.test.ts` (688 l) | Terse review hydration, exact-id partition, byte-capped render, human-async mailbox dedupe, debt predicate, fixRequired, review-step blocking. |
| `test/engine/plan-reviewer-triage.test.ts` | Plan findings vs concern ids, plan-review hydration, revise aggregation, triage never triggers revision, debt. |
| `test/engine/routing-blocker-derive.test.ts` | Derived item blocking + transitive dependents; non-pending untouched. |
| `test/engine/routing-architect-consult.test.ts` | One consult per routed blocker, decision artifact guard, restart idempotency, architect hydration. |
| `test/engine/routing-human-debt.test.ts` | human-async vs human-stop vs human-awareness mailbox/debt/task status. |
| `test/engine/adr-blocking-digest.test.ts` | ADR markdown, blocking exit 10, remarkable digest-only, mode table, no adrFolder. |
| `test/engine/concerns-funnel.test.ts` + `funnel-text-budget.test.ts` | Funnel byte contract (spike-local helpers, not production). |
| `test/engine/state-concern-counts.test.ts`, `test/cli/status-concerns.test.ts` | Four-status counts, zeroes for missing dir, blocking/digest split. |
| `test/human-involvement-config.test.ts` (454 l) | Mode defaults/layering/overlay/null deletion, presets, criteria loading, KNOWN_VARS matrix, prompt-time mode selection. |
| `test/contracts/concern-{artifact-types,schemas}.test.ts`, `state-concern-schema.test.ts` | Type vocabularies, inline producer schemas, concernResolutions, untouched triage/infra/plan-edits. |

Style: `describe("... (§18)")`, comments name the spec/ADR, assertions on artifacts and rendered prompts; run `cd plugins/software-factory && bun test` and `bun run typecheck`.

## 5. Acceptance coverage (spec `docs/factory.v2.md:89-103`)

| Requirement | State | Evidence |
|---|---|---|
| Structured `concerns[]` in agent outputs | **Partial** | Schemas: developer/fact-finder/plan/decisions/close-ups (`config/schemas/*.json`); review/QA only `newConcerns`; `remarkable` absent from review schema (`src/core/records/review-schema.ts:50-83`, `config/schemas/review.schema.json`). Only review/plan-review prompts mention concerns (`agents/steps/review.md:18-23`, `agents/steps/plan-review.md:15,35-36`). |
| Aggregation under task folder, stable ids, dedup, status, source | **Done** | `src/core/concerns.ts:33-35,73-107,110-156`; crash reconcile `:271-288`, startup `src/core/engine.ts:366-380`. |
| Reviewer triage with dispositions + `dismiss` | **Done (item/plan)** | `src/core/review-policy.ts:16-46`, `src/core/triage.ts:121-169`; dismiss requires detail. |
| Blocker → dependent blocked + architect consult | **Done, lifecycle open** | `src/core/plan/scheduler.ts:60-78`, `src/core/derive/task.ts:167-187`, `src/core/flows/consults.ts:319-420`. |
| `architect` → next architect turn | **Partial** | Hydration in `src/core/flows/iteration.ts:120-190,429,1057`; but no dedicated concerns section in architect templates. |
| `human-*` → mailbox per policy | **Partial** | `human-async` only in triage (`src/core/triage.ts:154-166`); item-level raw suggestions (`src/core/flows/item-machine.ts:709-750`); no plan-level human-awareness/stop routing, no remarkable-decision digest. |
| Tech debt → plan tech-debt list | **Partial** | Derived debt list/status (`src/core/derive/task.ts:210-253,382`); architect plan gets `debt: hydrationContext`, not the derived debt list (`src/core/flows/iteration.ts:366,429`). |
| Close-ups list/re-triage; architect resolves/carries | **Partial/missing wiring** | Schemas allow (`wave-closeup.schema.json`, `plan-closeup.schema.json`); prompts do not include `concernsYaml`/`humanInvolvementCriteria` or ask for resolutions (`agents/steps/wave-close-up.md:1-18`, `agents/steps/plan-close-up.md:1-21`); resolutions only pending (`src/core/concerns.ts:225-233`). |
| Configurable dispositions/severity thresholds | **Partial** | Allowed dispositions done; `raiseAllowlist`/`minDigestSeverity`/`minBlockingSeverity` exist in schema/default/type (`src/core/artifacts.ts:126-131`, `config/pipeline.default.yaml:386-403`) but are **never read** in `src/`. |
| Remarkable decisions same aggregation/triage | **Partial** | Aggregated/triaged (`src/core/concerns.ts:62-70,94-101`, `src/core/triage.ts:43-44,121-169`); no digest routing for `rm-*`; remarkables excluded from `countConcerns`. |
| Funnel worker→reviewer→epic→saga→human, less detail each level | **Partial** | Reviewer gets terse capped YAML (`src/core/triage.ts:82-114`); no epic→saga propagation (`src/core/engine.ts:262-275`); byte contract only spike-local (`test/engine/funnel-text-budget.test.ts:1-160`). |
| Blocking vs non-blocking ADRs; remarkable digest | **Done** | `src/core/flows/adrs.ts:14-18,46-72`; tested `test/engine/adr-blocking-digest.test.ts:305-390`. |
| Modes `autonomous`/`principal`/`detailed` config + prompt fragments, per task | **Done (config), partial prompt use** | `config/pipeline.default.yaml:379-435`, `agents/criteria/human-involvement.md:1-28`, `src/core/prompts.ts:66-86`, layered loader; but `steps/review.md`/`steps/qa.md` never render `humanInvolvementCriteria`. |
| Surfaced in close-ups, status, state counts | **Partial** | Status/state done (`src/cli/status.ts:106-116`, `src/core/derive/task.ts:360`); close-up prompts do not see open concerns. |
| Docs: ARCHITECTURE §1 row, README, config commentary | **Missing (docs)** | `docs/ARCHITECTURE.md:39` still says 'Deliberately not hand-built ... review dispositions and steering mailbox only'; README has no concerns/mode section (`README.md:87-110`); config commentary already updated (`config/pipeline.default.yaml:379-435`). |

## 6. Gaps, edge cases & open questions (ranked for the architect)

**G1 — Prompt coverage is the largest functional gap.** Only `steps/review` and `steps/plan-review` consume concern hydration. `steps/architect-plan`, `architect-revise`, `architect-resume`, `architect-wave-report`, `architect-closeup`, `architect-consult-*`, `wave-close-up`, `plan-close-up`, `qa`, `develop` have no `{{concernsYaml}}`/`{{humanInvolvementCriteria}}` sections even though `KNOWN_VARS` registers both for most of them (`src/core/prompt-vars.ts:60-64,105-160`). Preflight only rejects *unknown* placeholders, so unused registered vars are silent (`test/prompts.test.ts:154-208`). The step-runner already supplies the values (`src/core/flows/step-runner.ts:296-306`) — templates/call sites are what's missing. Also no prompt tells developers/fact-finders/close-ups/architects to *raise* concerns or remarkable decisions. Decide: per-fragment terse instructions + sections, keeping the terse/debloated prompt requirement.

**G2 — Severity policy is inert.** `raiseAllowlist`, `minDigestSeverity`, `minBlockingSeverity` are typed/validated/shipped (`src/core/artifacts.ts:126-131`, `config/schemas/pipeline.schema.json:207-224`, `config/pipeline.default.yaml:386-403`) but have no readers in `src/` (only `test/contracts/concern-artifact-types.test.ts:271-296` and config tests). Specify semantics: gate aggregation by raise allowlist? filter digest by `minDigestSeverity`? allow blocking only at `minBlockingSeverity`? Where is the filter applied (ingest vs mailbox vs close-up)?

**G3 — `human-*` routing is incomplete outside item reviews.** `applyReviewTriage` writes only `human-async` (`src/core/triage.ts:154-166`). `human-awareness`/`human-stop` triage relies on raw review suggestions handled in `item-machine` (`src/core/flows/item-machine.ts:709-750`), so plan-reviewer/close-up/architect-raised human dispositions never reach the mailbox. Also `human-awareness` for `rm-*` (remarkable decisions) has no digest entry: only ADRs call `writeQuestion` (`src/core/flows/adrs.ts:62-70`). Decide a single disposition→mailbox router with `blocks` semantics per ref (`task` vs item vs digest).

**G4 — No epic → saga funnel.** `runChildTask` writes only `child-closeup.yaml {status}` (`src/core/engine.ts:262-275`); child `concerns/` (under `childTaskDir`, `:230`) are isolated. Spec requires epic concerns/decisions to propagate to the saga architect, which reviews and steers or propagates to the human (`docs/factory.v2.md:97`). Decide direction (push on child close vs pull at parent derive), dedup/source shape (`source.record` prefix), and whether propagation creates `routed`/`open` copies in the parent store.

**G5 — Blocked-by-concern never unblocks.** A routed blocker blocks pending items (`src/core/plan/scheduler.ts:60-78`), and the consult writes a decision (`src/core/flows/consults.ts:319-420`) but nothing transitions the concern to `resolved` or removes `affects`. `withRoutedBlocking` keeps deriving `blocked` (`src/core/derive/item.ts:58-73`); `buildArchitectHydration` still lists it. `test/engine/routing-architect-consult.test.ts:335-380` reaches `done` with the blocker still `routed`, because blocked items are terminal for wave completion and close-ups are scripted. Decide: consult decision must produce `resolve`/`carry`/`re-plan`, or derive must treat a decided concern as advisory.

**G6 — Close-up triage is schema-only.** `applyCloseupResolutions` records `pendingResolution` and explicitly says status change is a later decision (`src/core/concerns.ts:225-233`); no engine path applies it. Close-up prompts neither list open concerns nor ask for `concernResolutions`; architect close-up maps to `plan-closeup.schema.json` (`src/core/flows/step-runner.ts:121-149`) but its prompt omits both concerns and resolutions (`agents/steps/architect-closeup.md`). Decide the resolution→status transition (who/when: close-up step ingest vs next architect turn) and whether close-ups triage via `suggestions`/`dismiss` or via `concernResolutions` actions.

**G7 — Funnel byte caps are spike-only and hydration is duplicated.** Production `renderConcernsYaml` caps terse YAML at `hydrationBytes` (default 8000 in step-runner, `src/core/flows/step-runner.ts:296-299`; 40000 in `src/core/loops.ts:24`), but the spike contract (min(diff,2000) for code steps, min(input,500) for zero-diff, strict per-level condensation) is implemented only in test helpers (`test/engine/funnel-text-budget.test.ts:1-160`). Plan review uses `hydrateConcernsYaml`, which emits full records (detail/source/timestamps), uncapped, and its caller overrides the terse step-runner value (`src/core/flows/iteration.ts:526-549`, `src/core/concerns.ts:171-190`). Also `buildArchitectHydration` caps on JS string length, not UTF-8 bytes (`src/core/flows/iteration.ts:185-188`). Decide one hydration module and the cap policy; note the spike finding: caps apply to prompt vars only, stored artifacts keep full detail (`test/engine/funnel-text-budget.test.ts:411-452`).

**G8 — Docs are stale.** `docs/ARCHITECTURE.md:39` (§1 row 18) still declares the feature hand-unbuilt; §5 config sample lacks `humanInvolvement` + `concerns` (`:112-178`); §6.2 task-folder tree lacks `concerns/` and `decisions/concern-<id>` (`:185-197`); §8.7 lacks `dismiss` and concern triage (`:282-294`); no §8.x funnel/concerns section; §10 developer output still `concerns[]` untyped (`:348`); §11 status description silent (`:358-367`); §13 test list silent (`:405-407`); README has no concerns/mode section (`README.md:87-110`). Config commentary is already done.

**G9 — Type/schema drift.** `DeveloperOutputArtifact.concerns?: string[]` (`src/core/artifacts.ts:395`) vs structured schema; `ReviewArtifact` lacks `newConcerns` (`:366-374`); FactFinder/Wave/PlanCloseup/Decision artifact types lack `concerns`/`remarkable` despite schemas; static `config/schemas/review.schema.json` and generated `review-schema.ts` both omit `remarkable`, so a reviewer cannot report a tradeoff without failing `additionalProperties:false`.

**G10 — Duplicate/competing hydration helpers.** `hydrateConcernsYaml` (concerns.ts) vs `renderConcernsYaml` (triage.ts) differ in shape, cap, and inclusion of `rm-*`; only the latter is byte-capped. Consolidation avoids the plan-review detail leak (G7).

**G11 — Fingerprint stability vs evolving affects.** Fingerprint includes sorted `affects` (`src/core/concerns.ts:26,33-35`); a concern re-emitted later with an added item/epic ref forks into a second file instead of merging (dedup across steps/attempts only holds when affects are identical). Test explicitly ignores affect *order* only (`test/engine/concerns-funnel.test.ts:320`). Decide if affects should be merged (identity by kind+summary+location) or remain identity.

**G12 — `resolved` is unreachable in production.** Only tests construct `status:"resolved"`; no `src/` writer sets it (grep: only the type `src/core/artifacts.ts:305` and reads in `isDebtConcern`/counts). Spec requires the status vocabulary and close-up/architect resolution; pick the transition path (G5/G6).

**G13 — Autonomous-mode semantics.** Blocking ADRs are always routed at plan time and park the task immediately (`src/core/flows/adrs.ts:46-72`, `test/engine/adr-blocking-digest.test.ts:357-390`), while the mode table says autonomous consults blocking only for the portion still blocked after unblocked work is done (`agents/criteria/human-involvement.md:11`, `docs/factory.v2.md:100`). Confirm whether immediate halt is the accepted deviation or whether blocking should defer until remaining work drains.

## 7. Suggested doc-update checklist (from the intent)

1. `docs/ARCHITECTURE.md:39` — replace row 18 with what shipped + link to new §8.x.
2. New `### 8.11 Concerns + remarkable funnel` after §8.8: store path/id/status, producer fields, triage rules (dismiss reason), routing table (blocker/architect/human-*/tech-debt), funnel levels + byte rule, ADR blocking/remarkable, mode presets. Update §8.7 with `dismiss` and concern triage; §5 config sample; §6.2 tree; §10 outputs; §11 status; §13 tests.
3. `README.md:87-110` — mention concerns mailbox/modes in status/steer and configuration sections.
4. Keep `config/pipeline.default.yaml:379-435` commentary in sync with whatever thresholds/routing semantics land; `agents/criteria/human-involvement.md` is the shared prompt fragment.

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
