# Step: Architect Close-Up

## Goal
Determine the final iteration outcome following the completeness audit by the plan close-up agent.

## Rules
- Exploration budget: ground decision in the plan close-up audit findings, task INTENT, and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)

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
`). Read code ONLY to verify specific disputed claims or gate reports (few targeted reads, never broad scans). Keep terse.
- Decision options (yield `status` matching `plan-closeup.schema.json`):
  - `complete`: the task's `INTENT.md` is fully satisfied with verified working code, comprehensive tests, and green gates.
  - `next-iteration`: scope remains unfulfilled; proceed to iteration N+1 with updated requirements and hydrated context.
  - `blocked`: execution cannot proceed without human operator resolution. Formulate a precise, answerable `question` for the operator.
- Yield `{iteration, status, summary, question?, completedMilestones?, remainingMilestones?, techDebt?}`. Copy milestone/tech-debt lists from the audit when they still hold.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.
- Rationale required: ground your decision in the plan close-up audit findings, verifying whether all milestones and Gherkin scenarios are genuinely delivered.

## Plan Close-Up Audit
{
  "iteration": 2,
  "remainingMilestones": [
    "m2-contracts-epic",
    "m4-docs-gates"
  ],
  "completedMilestones": [
    "m1-hydration-prompts",
    "m3-routing-lifecycle"
  ],
  "status": "next-iteration",
  "summary": "Iteration 2 audit: m1 hydration/prompts and m3 routing/lifecycle are implemented with behavior tests; m2 contracts fail on the capital-D Detail schema drift (file schemas reject lowercase detail, so validation tests must be red and runtime validation is broken); m4 docs are untouched (ARCH row 18 still deliberately-unbuilt, no 8.11, README bare) and gates cannot be green. Next iteration must normalize Detail->detail in 7 schema files and deliver docs-finish-v3.\n\nM1 HYDRATION/PROMPTS — COMPLETE. Code: triage.hydrateStepConcerns caps review/qa by min(diffBytes,2000), close-ups by min(taskDiffBytes,2000), planning by min(inputBytes,500), returns '' on cap<=0/empty (triage.ts:234-247); renderConcernsYaml condenses/sheds to cap (254-286); listHydratedConcerns per-consumer sets incl dismissed+escalated for architect and open rm-* as {id,kind:remarkable,summary:chosen} (219-231); concernFingerprint kind+summary+location without affects (concerns.ts:58-60), mergeConcern unions affects incl terminal + escalated flag (69-87), legacyConcern dual-lookup rename (100-119); buildArchitectHydration drops concerns, UTF-8 capped (iteration.ts:118-175); step-runner computes bytes per role, caller-supplied concernsYaml wins, injectable gitFn (step-runner.ts:410-430); KNOWN_VARS registers concernsYaml on all 19 producer/triager fragments, HI only on 12 triagers (prompt-vars.ts:46-171); all 19 step fragments render ## Open Concerns + Raise concerns, 12 triagers add ## Human involvement + condense. Tests: hydration-fingerprint-caps covers review/plan-review/wave caps, 0/1/3-byte '' with zero id lines, caller-wins, inputBytes exclusion, gitFn injection, architect single-source without duplicate section, open+pending/closeup-vs-review/rm-terse/architect-escalated sets, fingerprint/union/legacy-rename; prompts.test covers 19-fragment sentinels, 12-fragment HI+condense, 15/80 budgets, autonomous/detailed switch; HI-config covers producer/triage split and triage/infra exclusion. Minor notes (not blocking): zero-cap asserted for review only (close-up/plan-review zero inferred from shared early-return); dismissed re-emit->q-escalated->architect chain proven by three separate tests, no single end-to-end; standing heading with '' hydration implied by static fragments, id-lines==0 asserted.\n\nM2 CONTRACTS/EPIC — REMAINING (epic done, contracts failed). TS contracts good: artifacts.ts has Concern/detail lowercase, RemarkableDecision, ConcernConfirms, ConcernResolution/Carry, CloseupResolution/propagate, ReviewArtifact newConcerns+remarkable, StoredConcern lifecycle (301-484); review-schema.ts generates lowercase detail + remarkable + newConcerns. BUT file schemas still declare capital-D Detail with additionalProperties:false, so lowercase detail is rejected and capital-D accepted — the exact drift contracts-drift-fix was to normalize: decisions.schema.json:55, developer-output.schema.json:68, fact-finder-output.schema.json:29, plan.schema.json:142, plan-closeup.schema.json:34, wave-closeup.schema.json:42, review.schema.json:33 (suggestions Detail) + :65 (newConcerns Detail). The contract tests assert the opposite (lowercase passes/persists, capital-D rejected) across all producers incl developer poc/test-assumptions/test-first/simple-implement/fix-round, fact-finder/research, plan/revise, decisions concernResolution, close-up concernResolutions, architect concernConfirms (concern-schemas.test.ts), so that suite must currently fail and runtime validation for file-schema agents (developer/fact-finder/architect/close-ups) is broken either way (lowercase fails validation; capital-D loses detail in ingest which reads lowercase). Triage/infra/pm-edit correctly lack concern fields (verified). Epic propagation COMPLETE: propagateEpicConcerns pushes open+routed (dismissed/resolved local), [epic] summary, id recomputed, condense <=120B verbatim else min(500B,half) char-safe, source.epic (epic-propagation.ts:17-185); engine.runChildTask serializes under parentCloseupLocks(parentWt) with single commit (engine.ts:208/272-289); forwards blocked questions as q-epic-<epic>-<orig> with blocks mapped (child item->epic, task->parent slug). Tests cover open+routed copy + dismissed local + verbatim-120, 800/2000/121-byte condense with CJK boundaries, restart idempotent + parent triage preserved, q-epic forwarding + child untouched, saga architect hydration, exit-0 on copies-only, failed-child propagation.\n\nM3 ROUTING/LIFECYCLE — COMPLETE (minor literal notes). Code: routeHumanDisposition single router (async/stop block only >=minBlocking else downgrade to awareness; awareness/rm-*/dismissed-escalated digest blocks=[]; below minDigest suppressed; rm-* exempt; dedup via writeQuestion existence) (triage.ts:93-136); severityAtLeast + medium/high fallback (24-26,62-75); DEFAULT_RAISE_ALLOWLIST 8 agents keyed on source.agent (concerns.ts:35-44); ingest allowlist skip+journal step-ok, triage/existing-only, resolutions->pending, consult-resolution honored only on consult-concern-<id>/architect-closeup*/architect-wave-report* else journaled, architect confirms + propagate via epic helper, wave fallback on pre-existing ids (step-runner.ts:194-305); collectRoutedBlockers kind=blocker+routed+severity>=minBlocking threaded through derive (derive/task.ts:52-63,180-183; iteration.ts:820-823,922-924); consultConcernOnce KeyedMutex + decisions/concern-<cid>.yaml guard with concernResolution passthrough (consults.ts:321-324,352-404); item-machine raw path skips ALL concern-id human-* and blocks only on router-written open questions (item-machine.ts:664-665,716-801); isDebtConcern routed/resolved tech-debt|optional (triage.ts:143-149) into derived debt (derive/task.ts:246-250); status counts + state.yaml. Tests: human-router-severity (plan-reviewer stop blocks task, close-up async blocks task, next-architect hydration, rm-* digest regardless of disposition, q-escalated digest + dismissal kept, ordinary dismiss kept with reason + no mailbox, medium-stop downgrade + low-awareness suppression, low-blocker digest-at-low + never-derived-blocking, collectRoutedBlockers high/medium/low matrix + pipeline threading, allowlist skip+journal+ok + fragment-key rejection, engine exit-10 stop / exit-0 async-park / exit-0 downgrade with single q-concern and no double-write); closeup-lifecycle (accept resolve/carry/propagate-to-parent, reject clears preserving open with no disposition, consult resolve unblocks next derive, item-consult ignored+journaled, fallback debt->optional in derived debt + assumption/risk/question->architect + pending preserved + never human-*, blocker stays open); routing-blocker-derive (derived blocked cascade, write-free); routing-architect-consult (one decision file + restart no-rewrite); reviewer/plan-reviewer triage (exact-id partition, dismiss reason, rm dismiss/routed, debt predicate, fix-once, QA non-triager). Minor literal mismatches (same code path, fixture value differs): allowlist test uses developer-not-qa emitter; downgrade engine test uses medium-stop not low-stop (low-stop with default medium digest is suppressed per ADR, not digested — scenario underspecified on minDigest); rm-architect stored routed+digest proven across two tests (stored optional + mailbox architect); reject-on-routed preservation inferred from code (tested on open); same-run explicit-resolutions+fallback interaction inferred from ordering (tested separately); no parallel-epic race test for the mutex.\n\nM4 DOCS/GATES — REMAINING. ARCHITECTURE.md §1 row 18 still reads 'Deliberately not hand-built' with no §8.11 Concerns, no 'immediate halt', none of the §5/§6.2/§8.7/§10/§11/§13 updates (docs/ARCHITECTURE.md:39; grep for 8.11/immediate-halt empty). README.md (4.1KB) has no concerns/modes section. pipeline.default.yaml ships autonomous/principal/detailed presets + blocking table (375-432) but commentary lacks the fragment->agent mapping (developer covers develop/poc/test-assumptions/test-first/simple-implement/fix-round etc.) and its autonomous row ('still blocking after unblocked work') contradicts the landed immediate-halt deviation; agents/criteria/human-involvement.md has no deviation note. Prompts matrix/budgets code+tests exist and likely pass, but gates were not executed (read-only audit, no bash/TMPDIR run) and static analysis shows the suite must be red due to the Detail drift above, so 'typecheck + bun test green' is not met.\n\nINTENT coverage: funnel caps/condense, reviewer triage + dismiss, blocker consult + architect/next-turn routing, human-*/debt routing, epic->saga condensed push + question forwarding, blocking/non-blocking ADRs with digest-never-waits, HI presets selectable per task, close-up/status/state.yaml surfacing, terse prompts, behavior-only tests — all present except the ARCH/README/config-commentary updates.",
  "techDebt": [
    "td-tmpdir-split: pre-existing head-guard failures when TMPDIR sits under .factory-runtime (baseline red; gates assume TMPDIR=/tmp; out of scope)",
    "td-spike-nits: unapplied spike-saga-commit reviewer optional nits (qualify epic-state precedence, prefix inline paths, scope removeWorktree claim, fold contextPack key)"
  ]
}

## Current Plan
{
  "iteration": 2,
  "milestones": [
    {
      "directionalInterfaces": [
        "step-runner/iteration -> triage.hydrateStepConcerns(taskDir,{stepRole,bytes,consumer}): callers compute bytes (step-runner item diff; iteration taskDiff/input), callee caps+renders; skip rule (caller-supplied wins); '' on zero-cap/empty (hydrateConcernsYaml deleted)",
        "aggregateConcerns -> mergeConcern(new id; affects-union incl terminal; escalated on rise) + legacy dual-lookup rename; KeyedMutex RMW + taskWt commitAll unchanged; journal on skip",
        "buildArchitectHydration -> debt/steering WITHOUT concerns (UTF-8 capped); architect turns consume concernsYaml (architect set incl escalated notes) as single source",
        "prompts.render <- KNOWN_VARS (prompt-fragments extends producer fragments); terse 2-3-line sections; per-fragment +<=15, total +<=80, prompts.test asserts"
      ],
      "id": "m1-hydration-prompts",
      "scenarios": [
        "Given task-branch diff 5000 bytes and open concerns 3000 bytes When wave-close-up hydrates Then concernsYaml is <=2000 bytes and < task diff in UTF-8 bytes",
        "Given zero-diff plan-review with 4000-byte input in iteration 2+ When hydrating Then concernsYaml is <=500 bytes and < input bytes",
        "Given a dismissed concern re-emitted with higher severity When merge and hydration run Then status stays dismissed, source.escalated=true, a q-escalated-<cid> digest entry exists with blocks=[], and the escalation appears in architect concernsYaml",
        "Given the same concern re-emitted with added affects When merge runs Then a single file holds union affects with no fork; a legacy old-hash file is rename-merged and the triage id stays stable",
        "Given each matrix fragment rendering When preflight and render run Then required sentinels appear (## Open Concerns + Raise concerns on all 19; ## Human involvement on review/qa/plan-review/architect-*/close-ups) with per-fragment added lines <=15 and total <=80",
        "Given zero-byte diff and input When hydrating Then concernsYaml renders '' with standing heading/instructions but zero id lines",
        "Given an open rm-* remarkable When review and architect prompts hydrate Then concernsYaml includes it as {id, kind remarkable, summary chosen}"
      ],
      "title": "Hydration, caps, fingerprint, prompts"
    },
    {
      "directionalInterfaces": [
        "producers -> JSON schemas + artifacts.ts (concernConfirms, concernResolution, concerns/remarkable incl review remarkable, lowercase detail): schemas validate, TS mirrors, no runtime",
        "engine.runChildTask -> propagateEpicConcerns(childTaskDir => parent.taskDir/concerns on parentWt, commit:false writes, KeyedMutex(parentWt) atomic record) + forward blocking questions to parent root mailbox; condensed per-epic ids, restart-idempotent merge"
      ],
      "id": "m2-contracts-epic",
      "scenarios": [
        "Given structured concerns/remarkable from developer (incl poc/test-assumptions/test-first/simple-implement/fix-round), fact-finder (incl research), qa, reviewer/plan-reviewer newConcerns+remarkable, plan/revise, decisions incl concernResolution, close-ups incl concernResolutions, and architect reports incl concernConfirms When validation and typecheck run Then all pass with matching TS types, lowercase detail persists, reviewer remarkable no longer fails additionalProperties, and triage/infra/pm-edit still reject concerns",
        "Given a child epic finishing with one dismissed and one open concern with 800-byte detail When runChildTask completes Then the parent gains exactly one copy with id from [epic] summary, detail <=500 bytes and strictly shorter via char-safe half-cut, source.epic set, while dismissed stays local; a <=120-byte detail copies verbatim",
        "Given a propagated epic concern When the saga architect hydrates Then concernsYaml contains the epic id and summary; a restart creates no duplicate; the child blocking question is forwarded as q-epic-<epic>-<orig> with mapped blocks; open copies alone cause no parent exit-10"
      ],
      "title": "Contracts and epic propagation"
    },
    {
      "directionalInterfaces": [
        "ingestStepConcerns -> triage.applyReviewTriage -> routeHumanDisposition(all triagers): q-concern-/q-escalated- writes via writeQuestion (blocks vs digest), dedup by existence; item-machine raw path skips ALL concern-id human-*",
        "ingest allowlist gate keyed on source.agent (post-validation skip+journal, step ok) + severity gates (digest>=minDigest, blocks>=minBlocking else downgrade; rm exempt); defaults medium/high = shipped",
        "derive/task.collectRoutedBlockers(taskDir,minBlocking) severity-aware + call-site threading; close-up/architect/consult ingest -> pending -> confirms (accept resolve/carry/propagate | reject clear+preserve) + consult resolve->resolved with cross-emission guard; wave-close-up fallback over triage-less open"
      ],
      "id": "m3-routing-lifecycle",
      "scenarios": [
        "Given a routed high blocker whose affects names a declared dependent When derive and wave-act run Then the dependent derives blocked, exactly one decisions/concern-<cid>.yaml is written, and a restart writes no second file",
        "Given a routed architect concern When the next architect-plan turn hydrates Then its concernsYaml input contains that concern id and summary",
        "Given reviewer suggestion matching a concern id with disposition dismiss and detail When review commits Then that file has status dismissed plus dismissReason=detail, is kept, and causes no mailbox, debt, blocked, or approval effect",
        "Given an rm-* remarkable triaged architect or dismissed When routing runs Then it becomes routed with disposition persisted or dismissed with reason; routed rm-* gains a digest entry with blocks=[] that never blocks or halts",
        "Given a routed human-async concern When routing runs Then mailbox q-concern-<cid> blocks the item and the engine continues without exit 10; given plan-reviewer human-stop Then a single q-concern-<cid> blocks task/item and the engine halts with exit 10",
        "Given raiseAllowlist excluding qa When QA emits newConcerns Then no file is written, the skip is journaled, and the step stays ok; given minBlockingSeverity high and a low human-stop Then it is downgraded to digest with no blocks and no exit-10",
        "Given a low blocker routed When derive runs Then the dependent is NOT blocked (severity-aware collectRoutedBlockers); the concern still appears in hydration and digest per minDigest",
        "Given wave-close-up emitting concernResolutions for triaged ids When it commits Then pendingResolution is proposed with status unchanged; architect concernConfirms accept applies resolved/routed/propagated and reject clears pending preserving status with no disposition",
        "Given a concern consult decision carrying concernResolution {id, resolve} When it commits Then the bound concern becomes resolved and the dependent unblocks on next derive; an item-consult decision carrying concernResolution is ignored with a journal note",
        "Given a simple item with open concerns and no reviewer When wave-close-up runs Then explicit resolutions propose pending for those ids; fallback auto-routes only triage-less open tech-debt to optional (appearing in the derived debt list) and assumption/risk/question to architect; kind=blocker stays open and human-* dispositions are never assigned",
        "Given pipeline.yaml humanInvolvement detailed When reviewer and architect prompts render Then the detailed criteria fragment is included; pipeline.default.yaml ships commented autonomous/principal/detailed presets with the fragment->agent mapping"
      ],
      "title": "Human routing, severity, lifecycle"
    },
    {
      "directionalInterfaces": [
        "docs-finish-v3 delivers: ARCHITECTURE §1 row18 + §8.11 + §5/§6.2/§8.7/§10/§11/§13, README section, pipeline commentary, human-involvement.md deviation note; prompts.test matrix + 15/80 budgets; TMPDIR=/tmp gates green"
      ],
      "id": "m4-docs-gates",
      "scenarios": [
        "Given implementation complete When grep runs Then ARCHITECTURE contains '8.11 Concerns' and 'immediate halt', §1 row 18 no longer contains 'Deliberately not hand-built', README contains a concerns/modes section, and config commentary matches landed severity/router semantics",
        "Given prompt fragments When prompts.test runs Then the KNOWN_VARS matrix and 15-per-fragment/80-total budgets pass",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "title": "Docs and gates"
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes. hydrateStepConcerns + listHydratedConcerns per adr-hydration-single-cap (stepRole table, caller-computed bytes, skip rule, '' semantics, injectable gitFn) + adr-hydrated-sets. Delete hydrateConcernsYaml; buildArchitectHydration drops concerns, UTF-8 capped. Fingerprint kind+summary+location, affects-union incl terminal, legacy dual-lookup rename. Regression tests: iter2+ plan-review <=500B, open+pending visibility, 0/1/3-byte caps -> ''. Behavior tests only. Verify typecheck + TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m1-hydration-prompts",
      "prodBudgetHint": 250,
      "slug": "hydration-fingerprint-caps",
      "title": "Unified hydration, caps, fingerprint"
    },
    {
      "deps": [],
      "description": "Schemas + TS only, no ingest/apply. artifacts.ts: DeveloperOutput concerns Concern[], ReviewArtifact newConcerns + remarkable, FactFinder/WaveCloseup/PlanCloseup/Decision concerns/remarkable, ConcernConfirms + ConcernResolution types. review-schema.ts + review.schema.json: remarkable. Wave-report output + plan-closeup schemas: concernConfirms. decisions.schema + DecisionArtifact: concernResolution. Normalize ALL concern Detail->lowercase detail across schemas (developer-output capital-D bug) + regression test that lowercase detail validates and persists. triage/infra/pm-edit untouched. Verify typecheck + preflight.",
      "kind": "story",
      "milestoneId": "m2-contracts-epic",
      "prodBudgetHint": 140,
      "slug": "contracts-drift-fix",
      "title": "Producer type and schema drift"
    },
    {
      "deps": [],
      "description": "Own prompt-vars.ts + fragments + matrix test. KNOWN_VARS: concernsYaml for develop/test-first/simple-implement/fix-round/poc/test-assumptions/research (+short forms); HI only where registered. Per-fragment delta per adr-prompt-fragment-matrix (producers OC+raise; triagers/architects/close-ups/qa +HI+condense). Per-fragment +<=15 lines, total +<=80; prompts.test per-fragment sentinels + budgets; update human-involvement-config.test.ts non-consumer assertion (develop leaves, triage/infra stay) + FRAGMENT_MATRIX. Behavior tests: sections render; mode switch changes criteria. Verify preflight + typecheck.",
      "kind": "story",
      "milestoneId": "m1-hydration-prompts",
      "prodBudgetHint": 120,
      "slug": "prompt-fragments",
      "title": "Fragment matrix and raise instructions"
    },
    {
      "deps": [
        "hydration-fingerprint-caps"
      ],
      "description": "Single routeHumanDisposition in triage for all triagers (async/stop/awareness + routed rm-* + dismissed-escalated digest; q-concern-/q-escalated-; dedup by existence); item-machine raw path skips ALL concern-id human-*. Severity: agent-keyed allowlist skip+journal (step ok); minDigest/minBlocking gates + downgrade (stop loses exit-10); rm exempt; defaults medium/high; commentary documents fragment->agent mapping (no allowlist entries added). Own derive: severity-aware collectRoutedBlockers(taskDir,minBlocking) + call-site threading (fallback high). Explicit fixture severities keep suite green. Behavior tests: plan/close-up routing, rm digest, skip+journal+ok, downgrade + derive unblocked, no double-write, exit-10 only blocking stop.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m3-routing-lifecycle",
      "prodBudgetHint": 280,
      "slug": "human-router-severity",
      "title": "Human router and severity policy"
    },
    {
      "deps": [
        "hydration-fingerprint-caps"
      ],
      "description": "engine.runChildTask -> propagateEpicConcerns per adr-epic-push-condensed (c-* + rm-* condensed push, commit:false writes, KeyedMutex(parentWt) atomic record, restart-idempotent merge preserving parent triage; forward blocking questions with blocks mapping). Spike-saga-commit/Decision 002 authoritative. Behavior tests: one condensed copy (incl rm-*), dismissed local, tiny-detail verbatim, saga input contains id, restart no dup, forwarded q-epic-* with mapped blocks, no parent halt from copies.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m2-contracts-epic",
      "prodBudgetHint": 190,
      "slug": "epic-saga-propagate",
      "title": "Epic to saga propagation"
    },
    {
      "deps": [
        "contracts-drift-fix",
        "epic-saga-propagate",
        "human-router-severity"
      ],
      "description": "Ingest + apply (schemas owned by contracts-drift-fix). ingestStepConcerns reads concernConfirms + concernResolution; consults.ts passthrough; cross-emission guard (honor only concern consults + closeup/architect contexts, else ignore+journal); ordering (consult apply at decision commit, confirms at architect ingest). Resolutions->pending; confirms accept (resolve/carry/propagate via epic helper) / reject (clear, preserve, no disposition). Wave-close-up fallback over triage-less open per ADR (blocker stays open; tech-debt->optional in derived debt; others->architect; never human-*). Behavior tests: pending/confirm matrix, reject preserves open, consult unblock by id, guard ignores item-consult resolution, fallback + debt, resolved reachable.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m3-routing-lifecycle",
      "prodBudgetHint": 240,
      "slug": "closeup-lifecycle-resolve",
      "title": "Close-up lifecycle and unblock"
    },
    {
      "deps": [
        "closeup-lifecycle-resolve",
        "contracts-drift-fix",
        "epic-saga-propagate",
        "human-router-severity",
        "hydration-fingerprint-caps",
        "prompt-fragments"
      ],
      "description": "Deliverables: ARCHITECTURE §1 row 18 (drop 'Deliberately not hand-built') + new §8.11 + §5/§6.2/§8.7/§10/§11/§13, README concerns/modes, pipeline commentary sync, human-involvement.md + §8.11 immediate-halt deviation note; prompts.test matrix + 15/80 budgets; consolidated coverage. Grep-asserted: '8.11 Concerns', 'immediate halt', README 'concerns', row-18 replacement. Final gates: bun run typecheck + TMPDIR=/tmp bun test green.",
      "kind": "story",
      "milestoneId": "m4-docs-gates",
      "prodBudgetHint": 100,
      "slug": "docs-finish-v3",
      "title": "Docs and suite consolidation"
    }
  ],
  "assumptions": [
    {
      "assumption": "Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures do not mask regressions.",
      "why": "Baseline red only under .factory-runtime TMPDIR; suite green with TMPDIR=/tmp. Hydration git uses explicit taskWt cwd, not worktree inference, so it is unaffected; tests still run TMPDIR=/tmp."
    },
    {
      "assumption": "Spike findings spike-text-budget (byte caps) and spike-saga-commit (serialization/derive/commit/propagation, Decision 002 directives) remain authoritative; no re-run.",
      "why": "Both accepted in iteration 1 with binding downstream directives; iteration-2 items implement them."
    },
    {
      "assumption": "Dismissed/routed/resolved stay terminal-in-merge (status preserved; content merges + escalated flag); escalated-severity-on-dismissed surfaces in digest + architect hydration; triage is the only reopen path.",
      "why": "Operator directive 1794112659180 decided keep + digest surfacing."
    },
    {
      "assumption": "funnel-closeups-v3 unmerged branch is discarded; its retry guidance substance (step-role cap classification, pending visibility for open+routed, reject-preserves-status, zero-cap '') is captured in adr-hydration-single-cap and adr-closeup-lifecycle-resolved, which items implement.",
      "why": "Iteration 1 closed with v3 running/unmerged; ADRs carry the normative substance so items need no branch reference."
    },
    {
      "assumption": "Effective severity defaults are shipped medium/high (code fallback identical); tasks opt out via pipeline.yaml null/deletion.",
      "why": "Aligns code with shipped pipeline.default.yaml; items keep suite green with explicit fixture severities."
    },
    {
      "assumption": "Autonomous immediate-halt deviation accepted now; operator notified via open awareness item awareness-plan-2-autonomous-halt-deviation.",
      "disposition": "human-awareness",
      "why": "High-impact tradeoff visible in plan; architect decides, operator informed, docs mark it explicitly."
    }
  ],
  "techDebt": [
    {
      "category": "adjacent",
      "description": "Pre-existing head-guard failures when TMPDIR sits under .factory-runtime: inferTaskWorktree matches a folder-boundary tail yet 2 failures persist via a different path. Baseline red; green with TMPDIR=/tmp. Out of scope. Hydration git uses explicit taskWt cwd (not worktree inference), so the new taskDiff path is unaffected.",
      "id": "td-tmpdir-split"
    },
    {
      "category": "adjacent",
      "description": "Unapplied spike-saga-commit reviewer optional nits (qualify epic-state-from-child-closeup with isMerged precedence, prefix inline paths, scope removeWorktree claim, fold contextPack key). Consumers apply mentally.",
      "id": "td-spike-nits"
    }
  ],
  "adrs": [
    {
      "context": "Two hydration helpers diverge; plan-review overrides terse value; buildArchitectHydration caps JS length and double-embeds concerns; byte sources, git seam, '' semantics, and step-runner/iteration double-compute undefined.",
      "decision": "triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) — callers compute bytes, callee caps+renders. stepRole table: review|qa -> min(diffBytes,2000), diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000), taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500), inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins, no race). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. hydrateConcernsYaml deleted. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only.",
      "id": "adr-hydration-single-cap",
      "title": "Single hydration module with step-role byte caps"
    },
    {
      "context": "Predicates diverge (step-runner open-only, architect open+routed, hydrate open c-+rm-); terseConcern drops pendingResolution; dismissed+escalated and rm-* visibility undefined; RemarkableDecision has no severity.",
      "decision": "triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes. Terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}. countConcerns stays c-* only. rm-* exempt from severity gates, always digest-eligible when routed.",
      "id": "adr-hydrated-sets",
      "title": "Per-consumer hydration sets with rm rules"
    },
    {
      "context": "Fingerprint includes sorted affects so added refs fork files; stored files keyed by old hash; mergeConcern replaces affects; terminal content-merge vs terminal-in-merge ambiguous.",
      "decision": "Identity kind+normalized summary+location; affects merged as sorted-union INCLUDING on terminal statuses (status preserved, detail/severity/affects/escalated still merge; triage is the only reopen path). Migration: aggregate dual-lookup — compute new id; if file missing, scan store for legacy file with same kind+norm summary+location (any affects) and rename-merge into new id with union affects. No GC pass. Refines adr-fingerprint-merge.",
      "id": "adr-fingerprint-affects-union",
      "title": "Fingerprint identity without affects, union merge"
    },
    {
      "context": "Only review/plan-review consume hydration; KNOWN_VARS steps/develop lacks both vars; poc/test-assumptions/research produce concerns but are absent from matrix; test asserts develop lacks vars; budgets unclear.",
      "decision": "prompt-fragments owns prompt-vars.ts + fragments + test update. KNOWN_VARS gains concernsYaml on steps/develop,develop,steps/test-first,test-first,steps/simple-implement,simple-implement,steps/fix-round,fix-round,steps/poc,poc,steps/test-assumptions,test-assumptions,steps/research,research (+humanInvolvementCriteria only where already registered). Sections: producers (develop-family+poc/test-assumptions/research) get 3-line ## Open Concerns {{concernsYaml}} + 1-line raise (no HI: they raise, never triage); triagers/architects/close-ups/qa get HI section + condense rule appended. Delta: architect-plan/revise add OC+raise; review adds HI+condense; plan-review adds raise+condense; rest add per above. Budgets: added lines per fragment <=15, total <=80 (2-3-line section convention); prompts.test asserts per-fragment sentinels (## Open Concerns, ## Human involvement, Raise concerns) + budgets; human-involvement-config.test.ts non-consumer assertion updated (develop leaves, triage/infra stay).",
      "id": "adr-prompt-fragment-matrix",
      "title": "Full fragment matrix with raise instructions"
    },
    {
      "context": "Severity config never read; shipped medium/high + 8-agent allowlist; poc/test-assumptions run as agent developer (fragment-gated entries would be dead); gate order vs validation undefined.",
      "decision": "Gate key is source.agent (never fragment): developer covers develop/poc/test-assumptions/test-first/simple-implement/fix-round, fact-finder covers research, architect covers architect-*; shipped 8-agent allowlist is already the complete producer matrix — no entries added, commentary documents fragment->agent mapping. Effective defaults = shipped medium/high (code fallback identical). Order: schema validation first (triage/infra/pm-edit schema-reject), then ingest allowlist skip+journal with step ok. Digest iff severity>=minDigest; blocks iff severity>=minBlocking else downgrade to digest (stop loses exit-10). rm-* exempt.",
      "id": "adr-severity-policy-active",
      "title": "Active severity and allowlist policy"
    },
    {
      "context": "applyReviewTriage writes only human-async; awareness/stop rely on item-machine raw suggestions so plan/close-up/architect dispositions never reach mailbox; rm-* has no digest; item-machine double-writes; collectRoutedBlockers blocks severity-blind so downgrade is ineffective.",
      "decision": "Single routeHumanDisposition in triage for all triagers at ingest: human-async q-concern-<cid> blocks=[item]|[task]; human-stop blocks item+task + exit-10; human-awareness, routed rm-*, dismissed+escalated -> digest via writeQuestion human-awareness blocks=[] (q-concern-/q-escalated-), never blocking/halting. Dedup by existence. item-machine raw path skips ALL concern-id human-*. human-router-severity also owns derive: collectRoutedBlockers(taskDir,minBlocking) blocks only kind=blocker+routed+severity>=minBlocking; deriveTaskState/withRoutedBlocking thread pipeline.concerns.minBlockingSeverity (fallback high). Debt predicate unchanged.",
      "id": "adr-human-router-single",
      "title": "Single human-disposition router with severity-aware derive"
    },
    {
      "context": "applyCloseupResolutions records pending with no applier; resolved unreachable; consult decisions never transition concerns; concernConfirms/consult-resolution need schema+TS+ingest+apply owners; consults.ts drops unknown fields; fallback scope/terminology wrong (blocker auto-block, human-* vacuous).",
      "decision": "contracts-drift-fix owns schema+TS: concernConfirms?: [{id,confirm:accept|reject,note?}] in architect wave-report output + plan-closeup schema; decisions.schema + DecisionArtifact gain concernResolution?: {id, action: resolve|carry}; all concern Detail normalized to lowercase detail. closeup-lifecycle-resolve owns ingest (ingestStepConcerns reads both), consults.ts concernResolution passthrough, and apply: accept+resolve->resolved, accept+carry->routed+architect, accept+propagate->parent copy/digest via epic helper; reject clears pending, preserves status, no disposition. Consult act phase applies resolve->resolved at decision commit (unblocks next derive); honored only on concern consults + closeup/architect contexts, ignored+journaled elsewhere. Wave-close-up fallback over triage-less open (open, no pendingResolution, no disposition): tech-debt->optional (derived debt), assumption|risk|question->architect; kind=blocker stays open for explicit triage; fallback never assigns human-* dispositions.",
      "id": "adr-closeup-lifecycle-resolved",
      "title": "Close-up propose/confirm lifecycle with unblock"
    },
    {
      "context": "runChildTask writes only child-closeup + single commit; child concerns/ isolated; spike-saga-commit/Decision 002 mandate push+forward; rm-*, commit ownership, parallel-epic races, forward mapping, back-sync, and truncation edge cases unspecified.",
      "decision": "engine.runChildTask calls propagateEpicConcerns({childTaskDir,parentTaskDir,parentWt,epic}) after runIteration before child-closeup write, every status: push open+routed (skip dismissed); c-* copies get summary [epic] <child summary>, id=recomputed fingerprint, status open, source {epic, record epic:<epic>/<child-record>}; child rm-* propagate as parent rm-* with chosen prefixed [epic], id recomputed, why condensed. Condense UTF-8 char-safe: detail<=120B verbatim (tiny exemption); else cut to min(500B, half) on char boundary (strictly shorter guaranteed). Writes use aggregate opts {commit:false}; parent-side propagate+closeup+add+commit serialized under KeyedMutex(parentWt) (never repo.writeLock) so parallel epics cannot race; existing single commit covers copies+closeup. Forward childTaskDir/steer/tousertoreview entries with blocks.length>0 to parent.taskDir/steer/tousertoreview as q-epic-<epic>-<orig>, blocks mapped (child item slugs->epic; child-task-level->parent task slug; default [epic]). No back-sync: child run is complete; forwarded entries are parent-owned. Copies open/unrouted -> no parent halt; halt only via forwarded questions.",
      "id": "adr-epic-push-condensed",
      "title": "Epic push with condensed parent copies"
    },
    {
      "context": "Mode table says autonomous defers blocking until unblocked work drains, but implementation routes blocking ADRs at plan time and halts immediately; deferral needs drain scheduling.",
      "decision": "Keep immediate halt as accepted deviation for iteration 2 (simpler, preserves exit-10 contract, matches tested behavior). Operator awareness item awareness-plan-2-autonomous-halt-deviation already open (filed at plan review); docs-finish-v3 marks the deviation explicitly in ARCHITECTURE 8.11 and human-involvement.md; drain-then-block scheduling is future work.",
      "id": "adr-autonomous-immediate-halt",
      "title": "Autonomous immediate halt accepted"
    }
  ]
}

## Task Intent
# concerns-funnel

Implement spec item 18 of `docs/factory.v2.md` in `plugins/software-factory`
(read it in full; it is the acceptance definition):
- structured `concerns[]` and remarkable decisions/tradeoffs in agent outputs;
- engine aggregation under the task folder (`concerns/`, stable fingerprint ids, dedup, status, source record);
- triage by the step's reviewer (workhorse class; architect output → plan-reviewer) with the review disposition
  vocabulary plus `dismiss` (logged with reason, kept);
- routing: blockers block dependent items + architect consult; `architect` → next architect turn;
  `human-*` → steer mailbox per policy; tech debt → plan tech-debt list;
- funnel worker → reviewer → epic architect → saga architect → human, less detail per level, never more text
  than the code summarized; saga architect reviews epic-level items and steers or propagates;
- blocking vs non-blocking ADRs; remarkable items reported in a mailbox digest, never waiting;
- human-involvement mode presets `autonomous`, `principal`, `detailed` (pipeline config + reviewer/architect
  prompt fragments), shipped as commented default config examples; selectable per task;
- surfaced in wave/plan close-ups, `factory status`, state.yaml counts.
Update `plugins/software-factory/docs/ARCHITECTURE.md` (incl. the §1 row for item 18), README and config commentary.
Keep prompts terse (debloated). Behavior tests only. Expected scope: a couple of iterations at most.


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


## Task Status
iteration: 2
amendments: 0
items:
  - hydration-fingerprint-caps kind=dev wave=1 status=merged outlineRef=hydration-fingerprint-caps
  - contracts-drift-fix kind=dev wave=1 status=merged outlineRef=contracts-drift-fix
  - prompt-fragments kind=dev wave=1 status=merged outlineRef=prompt-fragments
  - human-router-severity kind=dev wave=2 status=merged outlineRef=human-router-severity
  - epic-saga-propagate kind=dev wave=2 status=merged outlineRef=epic-saga-propagate
  - closeup-lifecycle-resolve kind=dev wave=3 status=merged outlineRef=closeup-lifecycle-resolve
  - docs-finish-v3 kind=dev wave=4 status=running outlineRef=docs-finish-v3
waves: 1, 2, 3, 4
merged: hydration-fingerprint-caps, contracts-drift-fix, prompt-fragments, human-router-severity, epic-saga-propagate, closeup-lifecycle-resolve
blocked: (none)
failed: (none)
open steer questions:
  - awareness-plan-2-autonomous-halt-deviation ref=plan-2 disposition=human-awareness: Spec autonomous defers blocking until unblocked work drains, but implementation routes blocking ADRs at plan time and halts immediately (iteration.ts:481-490). Plan ADR accepts immediate halt for iteration 2 with docs in ARCHITECTURE 8.11/human-involvement.md, drain scheduling future work. High-impact tradeoff operator should be aware of; architect can decide now. Ensure docs mark deviation explicitly.

## Output

Yield a structured JSON object matching this schema:
- iteration (integer, required, min: 1)
- status (string, required, enum: ["complete","next-iteration","blocked"])
- summary (string, required)
- question (string, optional)
- completedMilestones (array of string, optional)
- remainingMilestones (array of string, optional)
- techDebt (array of string, optional)
