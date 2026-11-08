# Step: Architect Revise

## Goal
Revise the iteration execution plan (`plan-N.yaml`) in response to adversarial feedback from the plan reviewer.

## Rules
- Exploration budget: evaluate review feedback against the plan and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)

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
`). Read code ONLY to verify a specific reviewer objection (few targeted reads, never broad scans or chunked whole-file reading). Translate newly identified unknowns into spike outlines or uncertainties instead of exploring in-turn. Keep terse.
- Feedback resolution: evaluate each review suggestion. Address valid concerns by adjusting milestones, scenarios, directional interfaces, or adding spikes.
- Architectural authority: for suggestions you deliberately reject or defer, provide clear, defensible technical rationale.
- Maintain plan bounds: keep milestone counts and dependencies within configured limits.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.
- Output: yield the updated plan matching `plan.schema.json`.

## Current Plan
{
  "iteration": 2,
  "milestones": [
    {
      "id": "m1-hydration-prompts",
      "title": "Hydration, caps, fingerprint, prompts",
      "scenarios": [
        "Given wave diff 5000 bytes and open concerns 3000 bytes When wave-close-up hydrates Then concernsYaml is <=2000 bytes and < wave diff in UTF-8 bytes",
        "Given zero-diff plan-review with 4000-byte input in iteration 2+ When hydrating Then concernsYaml is <=500 bytes and < input bytes",
        "Given a dismissed concern re-emitted with higher severity When merge and hydration run Then status stays dismissed, source.escalated=true, a q-escalated-<cid> digest entry exists with blocks=[], and the escalation appears in architect concernsYaml",
        "Given the same concern re-emitted with added affects When merge runs Then a single file holds union affects with no fork; a legacy old-hash file is rename-merged and the triage id stays stable",
        "Given architect-plan/revise/resume/wave-report/closeup/consult-item/consult-nonitem, wave-close-up, plan-close-up, review, qa, and develop prompts render When preflight and render run Then Open Concerns and Human involvement sections with terse raise and condense instructions appear; added lines are <=15 per fragment and <=60 total",
        "Given zero-byte diff and input When hydrating Then concernsYaml renders '' with standing heading/instructions but no id lines",
        "Given an open rm-* remarkable When review and architect prompts hydrate Then concernsYaml includes it as {id, kind remarkable, summary chosen}"
      ],
      "directionalInterfaces": [
        "step-runner/iteration -> triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes,diffBytes,consumer}): returns concernsYaml UTF-8 capped (review/qa min(diff,2000); close-ups min(taskDiff via git(),2000); others min(allowlisted-input,500)); '' on zero-cap; step-runner injects for item steps, iteration computes for plan-review/close-ups/architect turns (hydrateConcernsYaml deleted)",
        "aggregateConcerns -> mergeConcern(new id kind+summary+location; affects-union incl terminal; escalated on rise) + legacy dual-lookup rename; KeyedMutex RMW + taskWt commitAll ownership unchanged; journal on ingest skip",
        "buildArchitectHydration -> debt/steering vars WITHOUT concerns section (UTF-8 capped); architect turns consume concernsYaml (architect-consumer set incl escalated notes) as single source",
        "prompts.render <- prompt-vars KNOWN_VARS (prompt-fragments extends develop/test-first/simple-implement/fix-round); fragments keep standing headings; per-fragment +<=15 lines, total +<=60, prompts.test asserts"
      ]
    },
    {
      "id": "m2-contracts-epic",
      "title": "Contracts and epic propagation",
      "scenarios": [
        "Given structured concerns/remarkable plus concernConfirms and concernResolution shapes in producer outputs When validation and typecheck run Then all pass with matching TS types, reviewer remarkable no longer fails additionalProperties, and triage/infra/pm-edit still reject concerns",
        "Given a child epic finishing with one dismissed and one open concern with 800-byte detail When runChildTask completes Then the parent gains exactly one copy with id from `[epic] summary`, detail <=500 bytes and strictly shorter than 800 via truncate/half-cut, source.epic set, while dismissed stays local",
        "Given a propagated epic concern When the saga architect hydrates Then concernsYaml contains the epic id and summary; a restart creates no duplicate; the child blocking question is forwarded as q-epic-<epic>-<orig> with blocks=[epic]; open copies alone cause no parent exit-10"
      ],
      "directionalInterfaces": [
        "producers -> JSON schemas + artifacts.ts (concernConfirms, concernResolution, concerns/remarkable incl review remarkable): schemas validate, TS mirrors, no runtime",
        "engine.runChildTask -> propagateEpicConcerns(childTaskDir => parent.taskDir/concerns on parentWt, existing single commit) + forward blocking questions to parent root mailbox; condensed per-epic ids, restart-idempotent merge"
      ]
    },
    {
      "id": "m3-routing-lifecycle",
      "title": "Human routing, severity, lifecycle",
      "scenarios": [
        "Given a routed blocker whose affects names a declared dependent When derive and wave-act run Then the dependent derives blocked, exactly one decisions/concern-<cid>.yaml is written, and a restart writes no second file",
        "Given a routed architect concern When the next architect-plan turn hydrates Then its concernsYaml input contains that concern id and summary",
        "Given reviewer suggestion matching a concern id with disposition dismiss and detail When review commits Then that file has status dismissed plus dismissReason=detail, is kept, and causes no mailbox, debt, blocked, or approval effect",
        "Given an rm-* remarkable triaged architect or dismissed When routing runs Then it becomes routed with disposition persisted or dismissed with reason; routed rm-* gains a digest entry with blocks=[] that never blocks or halts",
        "Given a routed human-async concern When routing runs Then mailbox q-concern-<cid> blocks the item, the engine continues without exit 10; given plan-reviewer human-stop Then a single q-concern-<cid> blocks task/item and the engine halts with exit 10",
        "Given raiseAllowlist excluding qa When QA emits newConcerns Then no file is written, the skip is journaled, and the step stays ok; given minBlockingSeverity high and a low human-stop Then it is downgraded to digest with no blocks and no exit-10",
        "Given wave-close-up emitting concernResolutions When it commits Then pendingResolution is set with status unchanged; architect concernConfirms accept applies resolved/routed/propagated and reject clears pending preserving status with no disposition",
        "Given a consult decision carrying concernResolution {id, resolve} When it commits Then the bound concern becomes resolved and the dependent unblocks on next derive",
        "Given a simple item with open concerns and no reviewer When wave-close-up runs Then explicit resolutions triage them; fallback auto-routes task-wide untriaged open tech-debt to optional (appearing in the derived debt list) and other kinds to architect; human-* is never auto-routed",
        "Given pipeline.yaml humanInvolvement detailed When reviewer and architect prompts render Then the detailed criteria fragment is included; pipeline.default.yaml ships commented autonomous/principal/detailed presets"
      ],
      "directionalInterfaces": [
        "ingestStepConcerns -> triage.applyReviewTriage -> routeHumanDisposition(all triagers): q-concern-/q-escalated- mailbox writes via writeQuestion (blocks vs digest), dedup by existence; item-machine raw path skips ALL concern-id human-*",
        "ingest allowlist gate (post-validation skip+journal, step ok) + severity gates (digest>=minDigest, blocks>=minBlocking else downgrade; rm exempt); effective defaults medium/high = shipped",
        "close-up/architect/consult ingest -> applyCloseupResolutions (pending, status unchanged) -> applyConcernConfirms (accept resolve/carry/propagate | reject clear+preserve) + consult concernResolution resolve->resolved; wave-close-up fallback over task-wide untriaged open"
      ]
    },
    {
      "id": "m4-docs-gates",
      "title": "Docs and gates",
      "scenarios": [
        "Given implementation complete When docs are read Then ARCHITECTURE §1 row 18 no longer says 'Deliberately not hand-built', new §8.11 Concerns funnel covers store/triage/routing/funnel/ADR/modes with the immediate-halt deviation marked, README has a concerns/modes section, and config commentary matches landed severity/router semantics",
        "Given prompt fragments When prompts.test runs Then the KNOWN_VARS matrix and 15-per-fragment/60-total budgets pass",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "directionalInterfaces": [
        "docs-finish-v3 -> ARCHITECTURE §1 row18 + §8.11 + §5/§6.2/§8.7/§10/§11/§13, README, pipeline.default.yaml commentary, human-involvement.md deviation note; prompts.test matrix+budgets; TMPDIR=/tmp gates"
      ]
    }
  ],
  "itemOutlines": [
    {
      "slug": "hydration-fingerprint-caps",
      "kind": "story",
      "title": "Unified hydration, caps, fingerprint",
      "description": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes. hydrateStepConcerns + listHydratedConcerns per-consumer sets; step-role UTF-8 caps (review/qa min(diff,2000); close-ups min(taskDiff via git(),2000); plan-review/architect*/develop-family min(allowlisted-input,500) excl concerns/human/debt/steering); terse + pending whenever present + rm shape; zero-cap ''. Delete hydrateConcernsYaml; iteration calls hydrateStepConcerns. buildArchitectHydration drops concerns section, UTF-8 capped. Fingerprint kind+summary+location, affects-union incl terminal, legacy dual-lookup rename. Decision 020 fixes 1/2/4 + regression tests. Behavior tests only. Verify typecheck + TMPDIR=/tmp bun test.",
      "milestoneId": "m1-hydration-prompts",
      "deps": [],
      "prodBudgetHint": 250
    },
    {
      "slug": "contracts-drift-fix",
      "kind": "story",
      "title": "Producer type and schema drift",
      "description": "Schemas + TS only, no ingest/apply. artifacts.ts: DeveloperOutput concerns Concern[], ReviewArtifact newConcerns + remarkable, FactFinder/WaveCloseup/PlanCloseup/Decision concerns/remarkable fields, ConcernConfirms + ConcernResolution types. review-schema.ts + review.schema.json: add remarkable. Architect wave-report output schema + plan-closeup schema: concernConfirms [{id,confirm,note?}]. decisions.schema + DecisionArtifact: concernResolution {id,action}. triage/infra/pm-edit untouched. Behavior tests: per-producer validation incl confirms/resolution shapes + still-reject cases. Verify typecheck + preflight.",
      "milestoneId": "m2-contracts-epic",
      "deps": [],
      "prodBudgetHint": 120
    },
    {
      "slug": "prompt-fragments",
      "kind": "story",
      "title": "Fragment matrix and raise instructions",
      "description": "Own prompt-vars.ts + fragments. Extend KNOWN_VARS with concernsYaml+humanInvolvementCriteria for develop/test-first/simple-implement/fix-round (+short forms). Per-fragment delta per adr-prompt-fragment-matrix across architect-plan/revise/resume/wave-report/closeup/consult-item/consult-nonitem, wave/plan-close-up, review, qa, develop; terse raise 1-line + condense rule. Per-fragment +<=15 lines, total +<=60; prompts.test sentinel render per fragment + budget assertion. Behavior tests: sections present; mode switch changes criteria. Verify preflight + typecheck.",
      "milestoneId": "m1-hydration-prompts",
      "deps": [
        "hydration-fingerprint-caps"
      ],
      "prodBudgetHint": 120
    },
    {
      "slug": "human-router-severity",
      "kind": "story",
      "title": "Human router and severity policy",
      "description": "Single routeHumanDisposition in triage for all triagers (async/stop/awareness + routed rm-* + dismissed-escalated digest via writeQuestion blocks=[]; ids q-concern-/q-escalated-; dedup by existence); item-machine raw path skips ALL concern-id human-*. Severity: post-validation allowlist skip+journal (step ok); minDigest/minBlocking gates with downgrade (stop loses exit-10); rm exempt; effective defaults medium/high; extend shipped raiseAllowlist to full matrix (add poc, test-assumptions) + commentary sync; keep suite green with explicit fixture severities. Behavior tests: plan/close-up routing, rm digest, allowlist skip+journal+ok, downgrade, no double-write, exit-10 only blocking stop.",
      "milestoneId": "m3-routing-lifecycle",
      "deps": [
        "hydration-fingerprint-caps"
      ],
      "escalate": true,
      "prodBudgetHint": 270
    },
    {
      "slug": "epic-saga-propagate",
      "kind": "story",
      "title": "Epic to saga propagation",
      "description": "engine.runChildTask -> propagateEpicConcerns after runIteration before child-closeup write, every child status: push open+routed (skip dismissed) as `[epic] summary` copies (detail <=500B + strictly shorter via 500B-truncate/half-cut, status open, source.epic + epic:record prefix), restart-idempotent recompute+merge; existing single commit covers copies+closeup. Forward child blocking questions to parent root mailbox q-epic-<epic>-<orig> blocks=[epic]. Parent hydration recompute sees copies. Spike-saga-commit/Decision 002 authoritative. Behavior tests: one condensed copy, dismissed local, saga input contains id, restart no dup, forwarded question, no parent halt from copies.",
      "milestoneId": "m2-contracts-epic",
      "deps": [
        "hydration-fingerprint-caps"
      ],
      "escalate": true,
      "prodBudgetHint": 180
    },
    {
      "slug": "closeup-lifecycle-resolve",
      "kind": "story",
      "title": "Close-up lifecycle and unblock",
      "description": "Ingest + apply (schemas owned by contracts-drift-fix). ingestStepConcerns reads concernConfirms + concernResolution. concernResolutions->pending (status unchanged); confirms accept (resolve->resolved, carry->routed+architect, propagate->parent copy/digest via epic helper) / reject (clear pending, preserve status, no disposition) per Decision 020 fix 3. Consults act phase applies concernResolution resolve->resolved, unblocks on next derive. Wave-close-up fallback over task-wide untriaged open: tech-debt->optional (in derived debt), others->architect, human-* never. Behavior tests: pending/confirm matrix, reject preserves open, consult unblock by id, simple fallback + debt, resolved reachable.",
      "milestoneId": "m3-routing-lifecycle",
      "deps": [
        "contracts-drift-fix",
        "epic-saga-propagate",
        "human-router-severity",
        "prompt-fragments"
      ],
      "escalate": true,
      "prodBudgetHint": 220
    },
    {
      "slug": "docs-finish-v3",
      "kind": "story",
      "title": "Docs and suite consolidation",
      "description": "Update ARCHITECTURE §1 row 18 (drop 'Deliberately not hand-built') + new §8.11 funnel section + §5/§6.2/§8.7/§10/§11/§13, README concerns/modes section, pipeline commentary sync with landed severity/router semantics, human-involvement.md + §8.11 explicit immediate-halt deviation note; prompts.test matrix + 15/60 budgets; consolidate concerns coverage. Final gates: bun run typecheck + TMPDIR=/tmp bun test green.",
      "milestoneId": "m4-docs-gates",
      "deps": [
        "closeup-lifecycle-resolve",
        "contracts-drift-fix",
        "epic-saga-propagate",
        "human-router-severity",
        "hydration-fingerprint-caps",
        "prompt-fragments"
      ],
      "prodBudgetHint": 100
    }
  ],
  "assumptions": [
    {
      "assumption": "Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures do not mask regressions.",
      "why": "Baseline red only under .factory-runtime TMPDIR; suite green with TMPDIR=/tmp. Out of scope."
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
      "assumption": "funnel-closeups-v3 unmerged work is discarded; its Decision 020 persist guidance (4 fixes) is baked into hydration-fingerprint-caps (fixes 1/2/4) and closeup-lifecycle-resolve (fix 3).",
      "why": "Iteration 1 closed with v3 running/unmerged; reimplementing correctly avoids rebasing stale branch state."
    },
    {
      "assumption": "Effective severity defaults are shipped medium/high (code fallback identical); tasks opt out via pipeline.yaml null/deletion.",
      "why": "Aligns code with shipped pipeline.default.yaml instead of contradicting it; items keep suite green by setting explicit severities in fixtures."
    },
    {
      "assumption": "Autonomous immediate-halt deviation accepted now; operator notified via awareness item.",
      "why": "High-impact tradeoff visible in plan; architect decides, operator informed, docs mark it explicitly.",
      "disposition": "human-awareness"
    }
  ],
  "techDebt": [
    {
      "id": "td-tmpdir-split",
      "category": "adjacent",
      "description": "Pre-existing head-guard failures when TMPDIR sits under .factory-runtime: inferTaskWorktree matches a folder-boundary tail (not a naive substring split) yet the 2 failures persist via a different path. Baseline red; green with TMPDIR=/tmp. Out of scope."
    },
    {
      "id": "td-spike-nits",
      "category": "adjacent",
      "description": "Unapplied spike-saga-commit reviewer optional nits (qualify epic-state-from-child-closeup with isMerged precedence, prefix inline paths, scope removeWorktree claim, fold contextPack key). Consumers apply mentally."
    }
  ],
  "adrs": [
    {
      "id": "adr-hydration-single-cap",
      "title": "Single hydration module with step-role byte caps",
      "context": "Two hydration helpers diverge (hydrateConcernsYaml full-detail uncapped vs renderConcernsYaml terse capped); plan-review overrides terse value; buildArchitectHydration caps JS length and double-embeds concerns via debt/steering; zero-cap heading handling undefined.",
      "decision": "Single calculator triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes,diffBytes,consumer}) returning concernsYaml. Caps on promptVars only: review/qa min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff supplied by step-runner; wave/plan-close-up min(taskDiffBytes,2000) with taskDiffBytes=aggregated task-branch diff via production git() computed by iteration; plan-review/architect*/develop/test-first/simple-implement/fix-round min(inputBytes,500) with inputBytes=sum of allowlisted registered input vars EXCLUDING concernsYaml, humanInvolvementCriteria, debt, steering. Terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}. Zero-cap returns ''. hydrateConcernsYaml deleted; iteration calls hydrateStepConcerns and passes result explicitly. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Fragments keep standing headings+instructions; '' means no YAML block follows."
    },
    {
      "id": "adr-hydrated-sets",
      "title": "Per-consumer hydration sets with rm rules",
      "context": "Predicates diverge (step-runner open-only, architect open+routed, hydrate open c-+rm-); terseConcern drops pendingResolution; dismissed+escalated visibility and rm-* hydration undefined; RemarkableDecision has no severity.",
      "decision": "triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes. countConcerns stays c-* only. rm-* exempt from severity gates (no severity field), always digest-eligible when routed."
    },
    {
      "id": "adr-fingerprint-affects-union",
      "title": "Fingerprint identity without affects, union merge",
      "context": "Fingerprint includes sorted affects so added refs fork files; stored files keyed by old hash; mergeConcern replaces affects; terminal content-merge vs terminal-in-merge ambiguous.",
      "decision": "Identity kind+normalized summary+location; affects merged as sorted-union INCLUDING on terminal statuses (status preserved, detail/severity/affects/escalated still merge; triage is the only reopen path). Migration: aggregate dual-lookup — compute new id; if file missing, scan store for legacy file with same kind+norm summary+location (any affects) and rename-merge into new id with union affects. No GC pass. Refines adr-fingerprint-merge."
    },
    {
      "id": "adr-prompt-fragment-matrix",
      "title": "Full fragment matrix with raise instructions",
      "context": "Only review/plan-review consume hydration; KNOWN_VARS steps/develop lacks both vars so placeholders would fail preflight; existing fragments partial; no KNOWN_VARS owner; 15/60 budgets ambiguous.",
      "decision": "prompt-fragments owns prompt-vars.ts extension (add concernsYaml+humanInvolvementCriteria to steps/develop, develop, steps/test-first, test-first, steps/simple-implement, simple-implement, steps/fix-round, fix-round) plus per-fragment delta: architect-plan/revise add Open Concerns+raise (have HI); review adds HI+condense (has OC+instructions); plan-review adds raise+condense (has both); wave/plan-close-up, architect-resume/wave-report/closeup/consults, qa, develop add both+raise; reviewer/architect/close-up carry output<input condense rule. Budgets: added lines per fragment <=15, total growth <=60, prompts.test asserts both plus per-fragment sentinel render."
    },
    {
      "id": "adr-severity-policy-active",
      "title": "Active severity and allowlist policy",
      "context": "raiseAllowlist/minDigestSeverity/minBlockingSeverity never read; shipped pipeline.default.yaml sets medium/high with an 8-agent allowlist (poc/test-assumptions excluded); gate order vs schema validation undefined; QA emits newConcerns not concerns.",
      "decision": "Effective defaults = shipped medium/high (code fallback when concerns key absent: full-matrix allowlist, minDigest medium, minBlocking high); shipped raiseAllowlist extended to the full producer matrix (add poc, test-assumptions) with commentary sync. Gate order: schema validation first (triage/infra/pm-edit still schema-reject), then ingest allowlist skip+journal with step staying ok. Digest written only if severity>=minDigest; blocks set only if severity>=minBlocking else downgraded to digest (stop loses exit-10). rm-* exempt from severity gates."
    },
    {
      "id": "adr-human-router-single",
      "title": "Single human-disposition router with digest",
      "context": "applyReviewTriage writes only human-async; awareness/stop rely on item-machine raw suggestions so plan/close-up/architect dispositions never reach mailbox; rm-* has no digest; item-machine double-writes stop/awareness concern ids; digest mechanism undefined.",
      "decision": "Single routeHumanDisposition in triage for all triagers at ingest: human-async q-concern-<cid> blocks=[item] or [task] when task-level; human-stop blocks item+task ([task] task-level) + exit-10; human-awareness, routed rm-*, and dismissed+escalated -> digest via writeQuestion human-awareness blocks=[] (ids q-concern-<cid>, q-escalated-<cid>), never blocking/halting. Dedup by file existence. item-machine raw path skips ALL concern-id human-*. Debt predicate unchanged."
    },
    {
      "id": "adr-closeup-lifecycle-resolved",
      "title": "Close-up propose/confirm lifecycle with unblock",
      "context": "applyCloseupResolutions records pending with no applier; resolved unreachable; consult decisions never transition concerns so blocking never unblocks; concernConfirms/consult-resolution have no schema/TS/ingest owner; fallback scope undefined.",
      "decision": "contracts-drift-fix owns schema+TS: concernConfirms?: [{id, confirm: accept|reject, note?}] in architect wave-report output schema + plan-closeup schema (architect-closeup's mapped schema); decisions.schema + DecisionArtifact gain concernResolution?: {id, action: resolve|carry} (id always explicit). closeup-lifecycle-resolve owns ingest (ingestStepConcerns reads concernConfirms + concernResolution) and apply: accept+resolve->resolved, accept+carry->routed+architect, accept+propagate->parent copy/digest; reject clears pending, preserves status, sets no disposition. consults act phase applies concernResolution resolve->resolved, unblocking on next derive. Wave-close-up act fallback over task-wide untriaged open (open, no pending/disposition): tech-debt->optional (derived debt), others->architect carry; human-* never auto."
    },
    {
      "id": "adr-epic-push-condensed",
      "title": "Epic push with condensed parent copies",
      "context": "runChildTask (engine.ts:209-282) writes only child-closeup.yaml + single parent.path add/commit; no cleanup/merge; child concerns/ isolated; spike-saga-commit (Decision 002 binding directives) mandates push with condensed copies + question forwarding; id/truncation/commit/ordering/forward-mapping/halt semantics unspecified.",
      "decision": "engine.runChildTask calls propagateEpicConcerns({childTaskDir,parentTaskDir,parentWt:parent.path,epic}) after runIteration, before child-closeup write, for every child status: reads childTaskDir/concerns, writes parent.taskDir/concerns copies for open+routed (skip dismissed) with summary `[epic] <child summary>`, id=recomputed fingerprint (per-epic files, restart-idempotent recompute+merge preserving parent triage), detail condensed (<=500 UTF-8 bytes AND strictly shorter: truncate at 500B, else first half by chars min 20), status open, source {epic, record: epic:<epic>/<child-record>}; existing single add+commit covers copies+closeup (no separate commit); synchronous before return so parent hydration recompute sees copies. Forward child blocking steer questions (blocks.length>0) to parent root mailbox parent.taskDir/steer/tousertoreview as q-epic-<epic>-<orig> blocks=[epic]. Copies are open/unrouted -> no parent halt from copies; halt only via forwarded questions under normal mailbox check."
    },
    {
      "id": "adr-autonomous-immediate-halt",
      "title": "Autonomous immediate halt accepted",
      "context": "Mode table says autonomous defers blocking until unblocked work drains, but implementation routes blocking ADRs at plan time and halts immediately; deferral needs drain scheduling.",
      "decision": "Keep immediate halt as accepted deviation for iteration 2 (simpler, preserves exit-10 contract, matches tested behavior). docs-finish-v3 marks the deviation explicitly in ARCHITECTURE 8.11 and human-involvement.md (operator awareness item awareness-plan-2-autonomous-halt-deviation filed); drain-then-block scheduling is future work."
    }
  ]
}

## Plan Review Feedback
{
  "status": "changes_requested",
  "summary": "changes_requested: bounds pass, 12 blocking contract/scope/ownership gaps; sizing advisory ok",
  "suggestions": [
    {
      "id": "contracts-detail-casing",
      "disposition": "fix",
      "summary": "contracts scope omits Detail/detail casing mismatch breaking validation",
      "detail": "All 7 schemas use capital Detail (developer-output:68, wave-closeup:42, plan:142, etc.) while artifacts.ts Concern.detail is lowercase and concerns.ts mergeConcern reads input.detail. Detail is dropped, epic 800B->500B scenario untestable, m2s1 TS-mirror claim false. Require contracts-drift-fix to own casing fix plus regression test.",
      "location": {
        "file": "plugins/software-factory/config/schemas/developer-output.schema.json",
        "line": 68
      }
    },
    {
      "id": "allowlist-fragment-agent-mismatch",
      "disposition": "fix",
      "summary": "raiseAllowlist adds poc/test-assumptions fragments that never match agent gate",
      "detail": "Spike poc/test-assumptions run as agent developer with stepFragment poc/test-assumptions (pipeline.default.yaml:290,302). ingestStepConcerns gates on source.agent, so entries poc/test-assumptions are dead. ADR adr-severity-policy-active full-matrix wrong. Require gate-key definition (agent vs stepId vs fragment) and corrected allowlist.",
      "location": {
        "file": "plugins/software-factory/config/pipeline.default.yaml",
        "line": 290
      }
    },
    {
      "id": "decision-020-unknown",
      "disposition": "fix",
      "summary": "Decision 020 fixes referenced but text absent; discarded branch cannot guide items",
      "detail": "Assumption discards funnel-closeups-v3 yet hydration/closeup claim Decision 020 fixes 1/2/4 and 3. No Decision 020 in plan ADRs or repo. Unverified assumption baked into dev stories violates risk isolation. Require inline Decision 020 text or spike.",
      "location": {
        "file": "plugins/software-factory/src/core/concerns.ts",
        "line": 44
      }
    },
    {
      "id": "hydration-contract-ambiguous",
      "disposition": "fix",
      "summary": "hydrateStepConcerns bytes source, git diff, and '' semantics underspecified",
      "detail": "inputBytes allowlisted var set undefined; caller vs callee byte computation split unclear; wave diff (m1s1) vs task-branch diff (ADR) contradiction; git args/seam for tests missing; zero-cap '' vs empty-store [] vs standing heading undefined. step-runner:296 computes for all steps and iteration:527 also computes - double-compute/override race. Require per-stepRole var list, git spec, '' semantics, skip rule.",
      "location": {
        "file": "plugins/software-factory/src/core/flows/step-runner.ts",
        "line": 296
      }
    },
    {
      "id": "epic-truncate-edge",
      "disposition": "fix",
      "summary": "epic detail half-cut min-20 violates strictly-shorter and UTF-8 safety",
      "detail": "400B detail half-cut to 200 loses info; 10B detail min-20 expands to 20 violating funnel; chars-vs-bytes mismatch risks splitting codepoints. ADR adr-epic-push-condensed needs UTF-8-safe spec with tiny-detail exemption and explicit method.",
      "location": {
        "file": "plugins/software-factory/src/core/engine.ts",
        "line": 209
      }
    },
    {
      "id": "epic-contract-gaps",
      "disposition": "fix",
      "summary": "epic propagation omits remarkable, commit ownership, concurrency, forwarding lifecycle",
      "detail": "rm-* has chosen not summary - no rule; aggregate commitAll vs single add+commit conflict (needs commit:false); parallel epics race on parent concerns dir (KeyedMutex RMW but git commit race); child mailbox path undefined; q-epic blocks=[epic] downgrades task-blocks unjustified; no answer-sync so parent stays blocked after child unblocked.",
      "location": {
        "file": "plugins/software-factory/src/core/engine.ts",
        "line": 274
      }
    },
    {
      "id": "consult-resolution-dropped",
      "disposition": "fix",
      "summary": "runConcernConsult drops concernResolution; no item owns consults.ts persistence",
      "detail": "consults.ts:388-402 picks explicit DecisionArtifact fields omitting concernResolution, so closeup resolve->resolved never persists for concern consults. contracts owns schema, closeup owns ingest/apply, consults.ts unowned. decisions.schema shared by all consults needs cross-emission guard; wave-report vs closeup ordering undefined.",
      "location": {
        "file": "plugins/software-factory/src/core/flows/consults.ts",
        "line": 388
      }
    },
    {
      "id": "derive-severity-bypass",
      "disposition": "fix",
      "summary": "severity downgrade ineffective; derive blocks ignore minBlockingSeverity and unowned",
      "detail": "collectRoutedBlockers (derive/task:50) blocks on kind+status only. Low blocker downgraded to digest (no mailbox blocks) still blocks via derive. No item owns derive/task.ts or scheduler. Require derive update owned with severity-aware predicate.",
      "location": {
        "file": "plugins/software-factory/src/core/derive/task.ts",
        "line": 50
      }
    },
    {
      "id": "fallback-blocker-scope",
      "disposition": "fix",
      "summary": "wave-close-up fallback auto-blocks via blocker->architect and misstates human-*",
      "detail": "Fallback others->architect includes blocker causing auto-block without triage; tech-debt->optional disposition vs kind confusion; human-* never auto-routed vacuous (concerns have kinds, untriaged have no disposition); scenario conflates pending resolutions with triage. Require fallback excluding blocker or severity-gated plus terminology fix.",
      "location": {
        "file": "plugins/software-factory/src/core/concerns.ts",
        "line": 226
      }
    },
    {
      "id": "fragment-matrix-incomplete",
      "disposition": "fix",
      "summary": "fragment budget infeasible, matrix misses spike fragments, breaks existing test",
      "detail": "12 fragments in 60 lines avg 5 insufficient for both sections+raise (develop needs 6-8); poc/test-assumptions/research produce concerns but absent from matrix and KNOWN_VARS; extension breaks human-involvement-config.test:273 asserting develop lacks vars - no owner for test update; no sentinel strings/baseline for falsifiability.",
      "location": {
        "file": "plugins/software-factory/test/human-involvement-config.test.ts",
        "line": 61
      }
    },
    {
      "id": "scenarios-unfalsifiable",
      "disposition": "fix",
      "summary": "key Gherkin scenarios lack concrete sentinels, baselines, producer lists",
      "detail": "m1s5 lists 12 fragments with vague appear; m2s1 all-pass without producer enumeration; m3s9 explicit-resolutions-triage wording; m4 docs-read checks lack grep assertions. Require per-fragment sentinels, baseline commit for line delta, explicit producer matrix, grep-based docs assertions.",
      "location": {
        "file": "plugins/software-factory/src/core/prompt-vars.ts",
        "line": 46
      }
    },
    {
      "id": "awareness-item-unowned",
      "disposition": "fix",
      "summary": "autonomous-halt awareness notification has no producing item",
      "detail": "Assumption plus ADR adr-autonomous-immediate-halt claim awareness-plan-2-autonomous-halt-deviation filed, but 7 itemOutlines contain no steer/tousertoreview write. Require docs-finish-v3 or new item to own mailbox write.",
      "location": {
        "file": "plugins/software-factory/src/core/flows/adrs.ts",
        "line": 14
      }
    },
    {
      "id": "docs-interface-tasklist",
      "disposition": "optional",
      "summary": "m4 directionalInterfaces is task list not caller/callee contract",
      "detail": "Lists doc sections not interface. Polish: reword as deliverable or drop interface for docs milestone.",
      "location": {
        "file": "plugins/software-factory/docs/ARCHITECTURE.md",
        "line": 39
      }
    },
    {
      "id": "artificial-deps",
      "disposition": "optional",
      "summary": "closeup on prompt-fragments and prompt on hydration serialize unnecessarily",
      "detail": "Backend ingest/apply independent of prompt text; KNOWN_VARS extension independent of hydration impl. Deps force 4-wave critical path; dropping increases parallelism within maxParallelItems 4."
    },
    {
      "id": "tmpdir-debt-category",
      "disposition": "optional",
      "summary": "td-tmpdir-split adjacent may be impacting for hydration git work",
      "detail": "Hydration adds production git() taskDiff sensitive to worktree inference (inferTaskWorktree) under .factory-runtime TMPDIR. TMPDIR=/tmp workaround masks regressions. Suggest impacting with resolution or explicit justification.",
      "location": {
        "file": "plugins/software-factory/src/core/flows/step-runner.ts",
        "line": 176
      }
    }
  ]
}

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
  (none scheduled yet)
waves: (none)
merged: (none)
blocked: (none)
failed: (none)
open steer questions:
  - awareness-plan-2-autonomous-halt-deviation ref=plan-2 disposition=human-awareness: Spec autonomous defers blocking until unblocked work drains, but implementation routes blocking ADRs at plan time and halts immediately (iteration.ts:481-490). Plan ADR accepts immediate halt for iteration 2 with docs in ARCHITECTURE 8.11/human-involvement.md, drain scheduling future work. High-impact tradeoff operator should be aware of; architect can decide now. Ensure docs mark deviation explicitly.

## Output

Yield a structured JSON object matching this schema:
- iteration (integer, required, min: 1): Iteration number for this plan (minimum 1)
- milestones (array of object, required): Key delivery milestones for this iteration
  - id (string, required)
  - title (string, required)
  - scenarios (array of string, optional)
  - directionalInterfaces (array of string, optional)
  - replanAfter (boolean, optional)
- uncertainties (array of object, optional): Identified technical or domain uncertainties to resolve via spikes
  - id (string, required)
  - description (string, required)
  - spikeOutlines (array of string, optional)
- itemOutlines (array of object, required): Planned items/tasks to implement in this iteration
  - slug (string, required)
  - kind (string, required)
  - title (string, required)
  - description (string, optional)
  - milestoneId (string, optional)
  - deps (array of string, optional)
  - escalate (boolean, optional)
  - replanAfter (boolean, optional)
  - prodBudgetHint (integer, optional, min: 0): Advisory sizing hint: architect's estimated production lines changed for this item, for review against storyMaxProdLines/simpleMaxProdLines. Never blocks or fails the plan.
- assumptions (array of object, optional): Key assumptions made during planning
  - assumption (string, required)
  - why (string, required)
  - disposition (string, optional)
- epics (array of object, optional): Child epics to spawn (root tasks only)
  - slug (string, required)
  - intent (string, required)
- techDebt (array of object, optional): Technical debt identified, categorized as adjacent, impacting, or blocking
  - id (string, required)
  - description (string, required)
  - category (string, required, enum: ["adjacent","impacting","blocking"])
  - resolution (string, optional)
- adrs (array of object, optional): Architecture Decision Records documented for major design choices
  - id (string, required)
  - title (string, required)
  - context (string, required)
  - decision (string, required)
  - consequences (string, optional)
