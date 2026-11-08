# Step: Architect Plan

## Goal
Design the iteration execution plan (`plan-N.yaml`) decomposing task intent into sequenced milestones, spike outlines, item outlines, and architectural decisions.

## Rules
- Exploration budget: work primarily from INTENT, triage citations (`citations:
  - file: docs/factory.v2.md
    lines: 89-103
    anchors:
      - 18. concerns + remarkable decisions funnel
      - concerns[]
      - human-involvement modes
      - "funnel: worker agents"
    summary: "Acceptance definition: structured concerns[] with
      kind/severity/affects, engine aggregation with fingerprint
      ids/dedup/status/source record, reviewer triage plus dismiss, routing
      (blocker→dependent item + architect consult, architect→next turn,
      human-*→mailbox, debt→plan), close-up/status counts, configurable
      dispositions, remarkable decisions/ADRs, funnel and
      autonomous/principal/detailed presets."
  - file: plugins/software-factory/docs/ARCHITECTURE.md
    lines: "39"
    anchors:
      - 18 concerns + remarkable decisions funnel
      - Deliberately not hand-built
      - review dispositions (§8.7)
    summary: "The §1 row that must be updated: item 18 currently marked deliberately
      unimplemented, with only review dispositions (§8.7) and steering mailbox
      (§8.8) in place."
  - file: plugins/software-factory/src/core/artifacts.ts
    lines: 313-325
    anchors:
      - DeveloperOutputArtifact
      - "concerns?: string[]"
    summary: Current developer output carries only free-form string concerns; needs
      the structured concern object (kind, summary, detail, location, severity,
      affects) plus remarkable decisions/ADR fields.
  - file: plugins/software-factory/src/core/records/review-schema.ts
    lines: 5-52
    anchors:
      - generateReviewSchema
      - allowedDispositions
      - "enum: dispositions"
    summary: Review JSON schema is generated from the agent's allowed disposition
      enum; triage-by-reviewer needs the vocabulary extended with `dismiss` and
      the allowed set filtered per reviewer/agent.
  - file: plugins/software-factory/src/core/flows/item-machine.ts
    lines: 628-647
    anchors:
      - reviewAllowed
      - formatDispositionsSection
      - dispositionsCriteria
    summary: Per-item review prompt wiring and allowed-disposition resolution; the
      natural insertion point for the step reviewer's concern triage and its
      disposition vocabulary.
  - file: plugins/software-factory/src/core/flows/iteration.ts
    lines: 439-485
    anchors:
      - plan-reviewer
      - ReviewArtifact
      - fixSuggestions
    summary: Plan review flow where architect output is reviewed by plan-reviewer;
      item 18 requires architect concerns/decisions to be triaged here rather
      than by the workhorse reviewer.
  - file: plugins/software-factory/src/core/steer.ts
    lines: 59-88
    anchors:
      - writeQuestion
      - sha256
      - q-${cleanRef}-${hash}
    summary: Existing stable-id mailbox write pattern (fingerprint-derived id,
      ref/disposition, blocks, status) to reuse for concern routing to human-*
      and for the mailbox digest.
  - file: plugins/software-factory/src/core/derive/task.ts
    lines: 167-205
    anchors:
      - Tech debt collection
      - accept-with-debt
      - disposition === "optional"
    summary: Debt is currently derived from plan techDebt, accept-with-debt
      decisions and optional review suggestions; routed tech-debt concerns and
      concern counts must be added to this derived state.
  - file: plugins/software-factory/src/cli/status.ts
    lines: 83-105
    anchors:
      - openSteerQuestions
      - Recorded Technical Debt
    summary: factory status currently surfaces open operator questions and debt; it
      must additionally show open/routed/resolved concern counts and
      remarkable-item digests.
  - file: plugins/software-factory/src/core/fingerprint.ts
    lines: 20-50
    anchors:
      - fingerprintText
      - fingerprintObject
      - canonicalJsonStringify
    summary: Existing normalization/fingerprint helpers usable for stable concern
      ids and dedup across steps/attempts/restarts.
`), and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)

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
`). Read code ONLY to verify a specific architectural decision (few targeted reads, never broad scans or chunked whole-file reading). Do not investigate open-ended questions in code; translate unknowns into explicit uncertainties or spike outlines (`fact-finder`, `poc`, `test-assumptions`). Keep terse.
- Milestone count within the configured limit (see `{
  "maxParallelItems": 4,
  "maxParallelTurns": 6,
  "stubMaxProdLines": 40,
  "maxStepAttempts": 2,
  "maxInterruptions": 3,
  "maxFixRounds": 3,
  "maxConsultsPerItem": 2,
  "maxSplitDepth": 1,
  "maxPlanReviewRounds": 2,
  "maxAmendmentsPerIteration": 3,
  "maxIterations": 6,
  "maxInfraRetries": 3,
  "maxInfraRetriesExpensive": 1,
  "gateRetries": 1,
  "gateTimeoutSec": 900,
  "storyMaxProdLines": 300,
  "simpleMaxProdLines": 20,
  "maxMilestones": 8,
  "maxItemsPerPlan": 50,
  "checkOutputBytes": 4000,
  "maxEmptyWaves": 3,
  "minFreeDiskMb": 2048
}`).
- Scenarios & interfaces: each milestone requires concrete Gherkin scenarios specifying observable behavior and directional interfaces defining key contracts.
- Progressive planning: plan only what is clear. If later milestones depend on earlier execution outcomes or spikes, mark them with `replanAfter: true`.
- Uncertainty to spikes: isolate technical risks or unverified external dependencies into spikes (`fact-finder`, `poc`, `test-assumptions`). Never design on unproven assumptions.
- Assumptions: document assumptions with rationale (`why`) and optional disposition if human confirmation is desired.
- Epics (root task only): define child epics for major subsystems (depth 1 only); each epic outline requires complete `intent` text.
- Tech debt: categorize technical debt as `adjacent`, `impacting`, or `blocking`. Impacting and blocking debt MUST include explicit resolutions.
- ADRs: record architectural decision records (`id`, `title`, `context`, `decision`, `consequences`) for non-trivial design choices.
- Escalation: flag `escalate: true` on item outlines where domain complexity exceeds standard implementation.
- Advisory sizing hint: give each item outline an explicit `prodBudgetHint` (estimated prod lines changed) as a sizing reference for review against `storyMaxProdLines`/`simpleMaxProdLines` in `{
  "maxParallelItems": 4,
  "maxParallelTurns": 6,
  "stubMaxProdLines": 40,
  "maxStepAttempts": 2,
  "maxInterruptions": 3,
  "maxFixRounds": 3,
  "maxConsultsPerItem": 2,
  "maxSplitDepth": 1,
  "maxPlanReviewRounds": 2,
  "maxAmendmentsPerIteration": 3,
  "maxIterations": 6,
  "maxInfraRetries": 3,
  "maxInfraRetriesExpensive": 1,
  "gateRetries": 1,
  "gateTimeoutSec": 900,
  "storyMaxProdLines": 300,
  "simpleMaxProdLines": 20,
  "maxMilestones": 8,
  "maxItemsPerPlan": 50,
  "checkOutputBytes": 4000,
  "maxEmptyWaves": 3,
  "minFreeDiskMb": 2048
}`.
- Infrastructure & quality gates: review declared gates, baseline status, and notes in `setup:
  - cd plugins/software-factory && bun install --frozen-lockfile
gates:
  - id: typecheck
    command: cd plugins/software-factory && bun run typecheck
  - id: test
    command: cd plugins/software-factory && bun test
testRunner:
  command: cd plugins/software-factory && bun test
  selectorArgs: []
  junitArg: --reporter=junit --reporter-outfile={path}
notes:
  - Only plugins/software-factory is a Bun package; the repo root has no
    package.json, so setup, gates and targeted test commands must cd into
    plugins/software-factory first.
  - "No lint/format gate exists in the repository: there is no
    eslint/biome/prettier config and no lint script; the project defines only
    typecheck (tsc --noEmit) and test (bun test)."
  - Bun test selectors are positional file/pattern filters, so selectorArgs is
    empty; -t filters test names only and would break the project's
    'test-file-or-pattern' target selectors. JUnit output was verified for both
    filtered and full runs.
  - "TMPDIR caveat: this host sets TMPDIR under
    <repo>.factory-wt/.factory-runtime/tmp. The full suite then has 2
    pre-existing failures in test/engine/head-guard.test.ts because step-runner
    resolves the task worktree by splitting taskDir on '/.factory', which also
    matches '/.factory-runtime'. With TMPDIR=/tmp the suite is green (271 pass,
    2 skip, 0 fail vs 269 pass, 2 skip, 2 fail inherited). Operator action:
    normalize TMPDIR for gate runs or fix the '/.factory' split; otherwise the
    test gate baseline records red."
  - "No orchestration-folder exclusion is needed for these gates: tsconfig
    includes only src/test/bin, bun test discovers only test files, and there is
    no linter; the committed .factory task folder is not scanned."


# Infra Operator Action Notes
- Only plugins/software-factory is a Bun package; the repo root has no package.json, so setup, gates and targeted test commands must cd into plugins/software-factory first.
- No lint/format gate exists in the repository: there is no eslint/biome/prettier config and no lint script; the project defines only typecheck (tsc --noEmit) and test (bun test).
- Bun test selectors are positional file/pattern filters, so selectorArgs is empty; -t filters test names only and would break the project's 'test-file-or-pattern' target selectors. JUnit output was verified for both filtered and full runs.
- TMPDIR caveat: this host sets TMPDIR under <repo>.factory-wt/.factory-runtime/tmp. The full suite then has 2 pre-existing failures in test/engine/head-guard.test.ts because step-runner resolves the task worktree by splitting taskDir on '/.factory', which also matches '/.factory-runtime'. With TMPDIR=/tmp the suite is green (271 pass, 2 skip, 0 fail vs 269 pass, 2 skip, 2 fail inherited). Operator action: normalize TMPDIR for gate runs or fix the '/.factory' split; otherwise the test gate baseline records red.
- No orchestration-folder exclusion is needed for these gates: tsconfig includes only src/test/bin, bun test discovers only test files, and there is no linter; the committed .factory task folder is not scanned.

# Gates Baseline
timestamp: 2026-11-07T19:10:39.077Z
gates:
  - id: typecheck
    command: cd plugins/software-factory && bun run typecheck
    status: pass
    durationMs: 3576
    details: $ tsc --noEmit
  - id: test
    command: cd plugins/software-factory && bun test
    status: fail
    durationMs: 127126
    details: |-
      bun test v1.4.3 (c6da4a4d3)
      ================================================================
      Task: status-test-task [ACTIVE]
      Kind: unclassified | Iteration: 1 | Wave: 1
      Worktree: (none - main checkout)
      Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-KBUTnF/.factory/pipeline.yaml
      Budget spent: $0.0000
      ----------------------------------------------------------------
      Waves & Items:
        Wave 1:
      ================================================================


      test/cli/cli.test.ts:
      [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3688761
      [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3688761
      [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3688761

      test/engine/head-guard.test.ts:
      126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
      127 |   const stderr = res.stderr;
      128 |   const code = res.code ?? 0;
      129 | 
      130 |   if (code !== 0 && !opts?.allowFail) {
      131 |     throw new GitError(args.join(" "), code, stderr, stdout);
                      ^
      GitError: git add -A failed with exit code 128:
      fatal: not a git repository (or any of the parent directories): .git

       command: "add -A",
          code: 128,
        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
        stdout: "",

            at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/exec.ts:131:11)
            at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/commit.ts:23:13)
            at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/mutex.ts:39:20)
      (fail) Engine: HEAD guard resilience (§7) > detects when an agent commits and resets --soft to before.sha, keeping changes staged [54.62ms]
      126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
      127 |   const stderr = res.stderr;
      128 |   const code = res.code ?? 0;
      129 | 
      130 |   if (code !== 0 && !opts?.allowFail) {
      131 |     throw new GitError(args.join(" "), code, stderr, stdout);
                      ^
      GitError: git add -A failed with exit code 128:
      fatal: not a git repository (or any of the parent directories): .git

       command: "add -A",
          code: 128,
        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
        stdout: "",

            at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/exec.ts:131:11)
            at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/commit.ts:23:13)
            at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/mutex.ts:39:20)
      (fail) Engine: HEAD guard resilience (§7) > detects when an agent switches branch and restores original branch, keeping changes [44.71ms]

       269 pass
       2 skip
       2 fail
       1072 expect() calls
      Ran 273 tests across 50 files. [64.65s]
    failingTests:
      - "Engine: HEAD guard resilience (§7).detects when an agent commits and
        resets --soft to before.sha, keeping changes staged"
      - "Engine: HEAD guard resilience (§7).detects when an agent switches
        branch and restores original branch, keeping changes"`. If any gate mutates the worktree (`mutatesWorktree: true`) or has operator action notes (e.g. linter scanning orchestration folder), account for it in your plan (e.g. adding check flags, excluding folders, or addressing via tech debt/spikes).
- Status grounding (iterations > 1): the `Task Status` block below is derived from committed records + git. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.
- Output: yield the plan matching `plan.schema.json`.

## Task & Iteration
Task: concerns-funnel
Iteration: 2

## Intent
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


## Context
citations:
  - file: docs/factory.v2.md
    lines: 89-103
    anchors:
      - 18. concerns + remarkable decisions funnel
      - concerns[]
      - human-involvement modes
      - "funnel: worker agents"
    summary: "Acceptance definition: structured concerns[] with
      kind/severity/affects, engine aggregation with fingerprint
      ids/dedup/status/source record, reviewer triage plus dismiss, routing
      (blocker→dependent item + architect consult, architect→next turn,
      human-*→mailbox, debt→plan), close-up/status counts, configurable
      dispositions, remarkable decisions/ADRs, funnel and
      autonomous/principal/detailed presets."
  - file: plugins/software-factory/docs/ARCHITECTURE.md
    lines: "39"
    anchors:
      - 18 concerns + remarkable decisions funnel
      - Deliberately not hand-built
      - review dispositions (§8.7)
    summary: "The §1 row that must be updated: item 18 currently marked deliberately
      unimplemented, with only review dispositions (§8.7) and steering mailbox
      (§8.8) in place."
  - file: plugins/software-factory/src/core/artifacts.ts
    lines: 313-325
    anchors:
      - DeveloperOutputArtifact
      - "concerns?: string[]"
    summary: Current developer output carries only free-form string concerns; needs
      the structured concern object (kind, summary, detail, location, severity,
      affects) plus remarkable decisions/ADR fields.
  - file: plugins/software-factory/src/core/records/review-schema.ts
    lines: 5-52
    anchors:
      - generateReviewSchema
      - allowedDispositions
      - "enum: dispositions"
    summary: Review JSON schema is generated from the agent's allowed disposition
      enum; triage-by-reviewer needs the vocabulary extended with `dismiss` and
      the allowed set filtered per reviewer/agent.
  - file: plugins/software-factory/src/core/flows/item-machine.ts
    lines: 628-647
    anchors:
      - reviewAllowed
      - formatDispositionsSection
      - dispositionsCriteria
    summary: Per-item review prompt wiring and allowed-disposition resolution; the
      natural insertion point for the step reviewer's concern triage and its
      disposition vocabulary.
  - file: plugins/software-factory/src/core/flows/iteration.ts
    lines: 439-485
    anchors:
      - plan-reviewer
      - ReviewArtifact
      - fixSuggestions
    summary: Plan review flow where architect output is reviewed by plan-reviewer;
      item 18 requires architect concerns/decisions to be triaged here rather
      than by the workhorse reviewer.
  - file: plugins/software-factory/src/core/steer.ts
    lines: 59-88
    anchors:
      - writeQuestion
      - sha256
      - q-${cleanRef}-${hash}
    summary: Existing stable-id mailbox write pattern (fingerprint-derived id,
      ref/disposition, blocks, status) to reuse for concern routing to human-*
      and for the mailbox digest.
  - file: plugins/software-factory/src/core/derive/task.ts
    lines: 167-205
    anchors:
      - Tech debt collection
      - accept-with-debt
      - disposition === "optional"
    summary: Debt is currently derived from plan techDebt, accept-with-debt
      decisions and optional review suggestions; routed tech-debt concerns and
      concern counts must be added to this derived state.
  - file: plugins/software-factory/src/cli/status.ts
    lines: 83-105
    anchors:
      - openSteerQuestions
      - Recorded Technical Debt
    summary: factory status currently surfaces open operator questions and debt; it
      must additionally show open/routed/resolved concern counts and
      remarkable-item digests.
  - file: plugins/software-factory/src/core/fingerprint.ts
    lines: 20-50
    anchors:
      - fingerprintText
      - fingerprintObject
      - canonicalJsonStringify
    summary: Existing normalization/fingerprint helpers usable for stable concern
      ids and dedup across steps/attempts/restarts.


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


## Infrastructure
setup:
  - cd plugins/software-factory && bun install --frozen-lockfile
gates:
  - id: typecheck
    command: cd plugins/software-factory && bun run typecheck
  - id: test
    command: cd plugins/software-factory && bun test
testRunner:
  command: cd plugins/software-factory && bun test
  selectorArgs: []
  junitArg: --reporter=junit --reporter-outfile={path}
notes:
  - Only plugins/software-factory is a Bun package; the repo root has no
    package.json, so setup, gates and targeted test commands must cd into
    plugins/software-factory first.
  - "No lint/format gate exists in the repository: there is no
    eslint/biome/prettier config and no lint script; the project defines only
    typecheck (tsc --noEmit) and test (bun test)."
  - Bun test selectors are positional file/pattern filters, so selectorArgs is
    empty; -t filters test names only and would break the project's
    'test-file-or-pattern' target selectors. JUnit output was verified for both
    filtered and full runs.
  - "TMPDIR caveat: this host sets TMPDIR under
    <repo>.factory-wt/.factory-runtime/tmp. The full suite then has 2
    pre-existing failures in test/engine/head-guard.test.ts because step-runner
    resolves the task worktree by splitting taskDir on '/.factory', which also
    matches '/.factory-runtime'. With TMPDIR=/tmp the suite is green (271 pass,
    2 skip, 0 fail vs 269 pass, 2 skip, 2 fail inherited). Operator action:
    normalize TMPDIR for gate runs or fix the '/.factory' split; otherwise the
    test gate baseline records red."
  - "No orchestration-folder exclusion is needed for these gates: tsconfig
    includes only src/test/bin, bun test discovers only test files, and there is
    no linter; the committed .factory task folder is not scanned."


# Infra Operator Action Notes
- Only plugins/software-factory is a Bun package; the repo root has no package.json, so setup, gates and targeted test commands must cd into plugins/software-factory first.
- No lint/format gate exists in the repository: there is no eslint/biome/prettier config and no lint script; the project defines only typecheck (tsc --noEmit) and test (bun test).
- Bun test selectors are positional file/pattern filters, so selectorArgs is empty; -t filters test names only and would break the project's 'test-file-or-pattern' target selectors. JUnit output was verified for both filtered and full runs.
- TMPDIR caveat: this host sets TMPDIR under <repo>.factory-wt/.factory-runtime/tmp. The full suite then has 2 pre-existing failures in test/engine/head-guard.test.ts because step-runner resolves the task worktree by splitting taskDir on '/.factory', which also matches '/.factory-runtime'. With TMPDIR=/tmp the suite is green (271 pass, 2 skip, 0 fail vs 269 pass, 2 skip, 2 fail inherited). Operator action: normalize TMPDIR for gate runs or fix the '/.factory' split; otherwise the test gate baseline records red.
- No orchestration-folder exclusion is needed for these gates: tsconfig includes only src/test/bin, bun test discovers only test files, and there is no linter; the committed .factory task folder is not scanned.

# Gates Baseline
timestamp: 2026-11-07T19:10:39.077Z
gates:
  - id: typecheck
    command: cd plugins/software-factory && bun run typecheck
    status: pass
    durationMs: 3576
    details: $ tsc --noEmit
  - id: test
    command: cd plugins/software-factory && bun test
    status: fail
    durationMs: 127126
    details: |-
      bun test v1.4.3 (c6da4a4d3)
      ================================================================
      Task: status-test-task [ACTIVE]
      Kind: unclassified | Iteration: 1 | Wave: 1
      Worktree: (none - main checkout)
      Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-KBUTnF/.factory/pipeline.yaml
      Budget spent: $0.0000
      ----------------------------------------------------------------
      Waves & Items:
        Wave 1:
      ================================================================


      test/cli/cli.test.ts:
      [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3688761
      [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3688761
      [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 3688761

      test/engine/head-guard.test.ts:
      126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
      127 |   const stderr = res.stderr;
      128 |   const code = res.code ?? 0;
      129 | 
      130 |   if (code !== 0 && !opts?.allowFail) {
      131 |     throw new GitError(args.join(" "), code, stderr, stdout);
                      ^
      GitError: git add -A failed with exit code 128:
      fatal: not a git repository (or any of the parent directories): .git

       command: "add -A",
          code: 128,
        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
        stdout: "",

            at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/exec.ts:131:11)
            at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/commit.ts:23:13)
            at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/mutex.ts:39:20)
      (fail) Engine: HEAD guard resilience (§7) > detects when an agent commits and resets --soft to before.sha, keeping changes staged [54.62ms]
      126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
      127 |   const stderr = res.stderr;
      128 |   const code = res.code ?? 0;
      129 | 
      130 |   if (code !== 0 && !opts?.allowFail) {
      131 |     throw new GitError(args.join(" "), code, stderr, stdout);
                      ^
      GitError: git add -A failed with exit code 128:
      fatal: not a git repository (or any of the parent directories): .git

       command: "add -A",
          code: 128,
        stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
        stdout: "",

            at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/exec.ts:131:11)
            at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/git/commit.ts:23:13)
            at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel/plugins/software-factory/src/core/mutex.ts:39:20)
      (fail) Engine: HEAD guard resilience (§7) > detects when an agent switches branch and restores original branch, keeping changes [44.71ms]

       269 pass
       2 skip
       2 fail
       1072 expect() calls
      Ran 273 tests across 50 files. [64.65s]
    failingTests:
      - "Engine: HEAD guard resilience (§7).detects when an agent commits and
        resets --soft to before.sha, keeping changes staged"
      - "Engine: HEAD guard resilience (§7).detects when an agent switches
        branch and restores original branch, keeping changes"

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


## Limits
{
  "maxParallelItems": 4,
  "maxParallelTurns": 6,
  "stubMaxProdLines": 40,
  "maxStepAttempts": 2,
  "maxInterruptions": 3,
  "maxFixRounds": 3,
  "maxConsultsPerItem": 2,
  "maxSplitDepth": 1,
  "maxPlanReviewRounds": 2,
  "maxAmendmentsPerIteration": 3,
  "maxIterations": 6,
  "maxInfraRetries": 3,
  "maxInfraRetriesExpensive": 1,
  "gateRetries": 1,
  "gateTimeoutSec": 900,
  "storyMaxProdLines": 300,
  "simpleMaxProdLines": 20,
  "maxMilestones": 8,
  "maxItemsPerPlan": 50,
  "checkOutputBytes": 4000,
  "maxEmptyWaves": 3,
  "minFreeDiskMb": 2048
}

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
  (none)

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
