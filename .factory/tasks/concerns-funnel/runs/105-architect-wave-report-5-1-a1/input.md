# Step: Architect Wave Report

## Goal
Evaluate the results of a completed execution wave, assess spike findings and accumulated debt, and decide the iteration path.

## Rules
- Exploration budget: evaluate wave progress from the current plan, wave report, spike findings, and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)

## 0. Snapshot

The intent asks to implement `docs/factory.v2.md` §18 in `plugins/software-factory` and update `docs/ARCHITECTURE.md` (§1 row), README and config commentary.

**The worktree already contains a complete item-18 implementation.** `docs/ARCHITECTURE.md:39` records item 18 as **Implemented** in §8.11 with five accepted deviations (`adr-epic-config-root-only`, `adr-closeup-no-suggestions-triage`, `adr-epic-push-condensed`, `adr-autonomous-immediate-halt`, `adr-funnel-triage-coverage`).

Verification performed in this session:

| Check | Command | Result |
|---|---|---|
| Tests | `cd plugins/software-factory && bun test` | **467 pass, 2 skip, 0 fail**, 469 tests / 71 files, 97.7 s |
| Types | `bun run typecheck` (`tsc --noEmit`) | clean, exit 0 |
| Focused funnel suites | `bun test test/engine/concerns-funnel.test.ts test/engine/reviewer-triage.test.ts test/docs-concerns.test.ts` | 47 pass, 0 fail, 5.5 s |

The 2 skips are the live-harness smoke suite gated by `FACTORY_LIVE_OMP=1` (`test/harness/smoke-live.test.ts:9-11`); no other skips exist in the repo.

**Planning implication:** the architect should treat the acceptance bullets as a traceability audit plus a small set of residual gaps (§5 below), not as a build-from-scratch plan. Any milestone that re-implements store/triage/routing would duplicate tested code.

### Acceptance map (spec `docs/factory.v2.md:89-103` → code → tests)

| Spec bullet | Implementation | Tests |
|---|---|---|
| `:90` structured `concerns[]` {kind, summary, detail, location?, severity, affects?} | `src/core/artifacts.ts:301-321`; producer schemas `config/schemas/developer-output.schema.json:61-78`, `plan.schema.json:134-...`, `decisions.schema.json:48-...`, `fact-finder-output.schema.json`, `wave-closeup.schema.json:35-...`, `plan-closeup.schema.json:27-...`, generated review schema `src/core/records/review-schema.ts:67-100` | `test/contracts/concern-schemas.test.ts`, `test/contracts/concern-artifact-types.test.ts` |
| `:91` aggregation under task folder, fingerprint ids, dedup, status, source record | `src/core/concerns.ts:50-168`, `171-249`, `391-408`; startup reconcile `src/core/engine.ts:381-394`; recovery commit `src/core/engine.ts:342-347` | `test/engine/concerns-funnel.test.ts`, `test/engine/hydration-fingerprint-caps.test.ts` |
| `:92` reviewer triage with review vocabulary + `dismiss`; architect output → plan-reviewer | `src/core/review-policy.ts:4-43`, `src/core/triage.ts:35-50`, `252-349`, `src/core/flows/step-runner.ts:261-275`, `src/core/flows/iteration.ts:506-568` | `test/engine/reviewer-triage.test.ts`, `test/engine/plan-reviewer-triage.test.ts`, `test/review-policy.test.ts` |
| `:93` routing blockers/architect/human-*/tech debt | `src/core/derive/task.ts:52-65`, `174-196`, `219-263`; `src/core/derive/item.ts:58-73`; `src/core/derive/wave.ts:47-57`; `src/core/plan/scheduler.ts:66-78`; `src/core/flows/iteration.ts:200-229`, `830-850`; `src/core/flows/consults.ts:319-421`; `src/core/triage.ts:93-136`; `src/core/flows/adrs.ts:46-71` | `test/engine/routing-blocker-derive.test.ts`, `routing-architect-consult.test.ts`, `routing-human-debt.test.ts`, `test/engine/human-router-severity.test.ts` |
| `:94` close-ups list/re-triage; architect resolves/carries; status/state counts | `src/core/flows/iteration.ts:1227-1337`; `src/core/concerns.ts:266-353`; `src/core/derive/task.ts:369-415`; `src/cli/status.ts:106-124` | `test/engine/closeup-lifecycle-resolve.test.ts`, `test/engine/state-concern-counts.test.ts`, `test/cli/status-concerns.test.ts` |
| `:95` configurable raise allowlist, dispositions, severity thresholds | `config/schemas/pipeline.schema.json:202-237`, `config/pipeline.default.yaml:359-437`, `src/core/concerns.ts:35-44`, `src/core/triage.ts:56-75`, `src/core/review-policy.ts:27-43` | `test/human-involvement-config.test.ts` |
| `:96` remarkable decisions same aggregation/triage | `src/core/artifacts.ts:323-327`; `src/core/concerns.ts:55`, `91-99`, `152-159`; hydration `src/core/triage.ts:200-231` | `test/engine/concerns-funnel.test.ts:713-745`, `human-router-severity.test.ts` |
| `:97` funnel with less detail per level, never more text than code | hydration caps `src/core/triage.ts:234-286` + `src/core/flows/step-runner.ts:429-449`; epic condensing `src/core/flows/epic-propagation.ts:52-58`, `141-185` | `test/engine/funnel-text-budget.test.ts`, `test/engine/epic-saga-propagate.test.ts` |
| `:98` blocking vs remarkable ADRs; digest never waits | `src/core/flows/adrs.ts:14-37`, `46-71`; plan-time halt `src/core/flows/iteration.ts:443-478` | `test/engine/adr-blocking-digest.test.ts` |
| `:99-102` `autonomous`/`principal`/`detailed` presets + prompt fragments, selectable per task | `config/pipeline.default.yaml:384-437`, `agents/criteria/human-involvement.md:1-28`, `src/core/prompts.ts:64-85`, `src/core/flows/step-runner.ts:421-427`, layering `src/core/config/loader.ts:92-102` | `test/human-involvement-config.test.ts:138-490` |
| `:103` fire-test mode switching, low-noise mailbox | operational; no unit test performs two `runTask` launches with a mode change | `docs/FIRE_TEST.md:43`, `:51` |

## 1. Module Map

All paths relative to `plugins/software-factory/`.

| Area | Files | Responsibility |
|---|---|---|
| Concern store | `src/core/concerns.ts` (408 lines) | Engine-owned store on the task branch: `c-*` / `rm-*` files, sha256 fingerprint identity, merge/dedup, legacy rename-merge, per-task mutex + one commit per mutation, triage application, close-up resolutions/confirmations, decision-level resolution, wave fallback, exact-id partition, startup reconcile. |
| Triage policy | `src/core/triage.ts` (349 lines) | Exact-id partition, severity policy + defaults, single human router, debt predicate, terse hydration shapes, byte-capped YAML renderer, `applyReviewTriage` orchestration. |
| Review policy | `src/core/review-policy.ts` (43 lines) | Triager set (`reviewer`, `plan-reviewer`) and per-agent allowed dispositions; `dismiss` auto-appended for triagers, filtered for everyone else. |
| Step pipeline | `src/core/flows/step-runner.ts` (923 lines) | `ingestStepConcerns` after every ok step artifact (`:193-323`), allowlist gate, schema generation (`:407-416`), prompt-var hydration (`:418-449`). |
| Iteration flow | `src/core/flows/iteration.ts` (1337 lines) | Plan-review triage never triggers revisions (`:506-568`), routed-blocker consults (`:179-229`, `:830-850`, `:927-931`), ADR persist + immediate halt (`:430-478`), wave close-up/architect report (`:1000-1100`), plan close-up + architect close-up (`:1227-1337`). |
| Concern consult | `src/core/flows/consults.ts` (421 lines) | `runConcernConsult` (`:319-421`): one architect turn per routed blocker, canonical `decisions/concern-<cid>.yaml`, existence is the idempotency guard, carries `concernResolution`. |
| Epic/saga funnel | `src/core/flows/epic-propagation.ts` (185 lines) | Child→parent push of open/routed concerns and open remarkables, `[epic]` prefix, 120-byte verbatim / 500-byte condensed payloads, per-record source `epic:<epic>/<record>`, `q-epic-*` blocked-question forwarding. |
| ADRs | `src/core/flows/adrs.ts` (72 lines) | Mode→disposition table, canonical ADR markdown, blocking task-parking question vs digest-only remarkable question. |
| Derived state | `src/core/derive/task.ts` (441), `derive/item.ts` (470), `derive/wave.ts` (121), `src/core/plan/scheduler.ts` (172) | Routed-blocker item blocking with transitive dependents, debt collection, concern counts materialized to `state.yaml`. |
| CLI | `src/cli/status.ts` (128 lines) | Concern counts line + `Blocking Questions` vs `Digest Questions` split, debt list. |
| Engine | `src/core/engine.ts` (795 lines) | Startup concern-store recovery/reconcile, epic child propagation + close-up in one commit, root steering mailbox loop. |
| Mailbox | `src/core/steer.ts` (188 lines) | `steer/tousertoreview/{id}.yaml`, stable ids with answer preservation, `questionBlocks` semantics. |
| Prompts/config | `src/core/prompts.ts` (598), `src/core/prompt-vars.ts` (171), `config/pipeline.default.yaml` (490), `config/schemas/pipeline.schema.json` | Mode-section filtering, disposition filtering, prompt-var matrix, shipped presets and closed config schema. |
| Agent fragments | `agents/steps/*.md`, `agents/criteria/{dispositions,human-involvement}.md`, `agents/_shared/dispositions.md` | Terse (~20-45 line) step fragments; concern/ADR/triage rules live in the per-step `## Open Concerns` sections. |
| Docs | `docs/ARCHITECTURE.md:39`, `:76-78`, `:193-205`, `:291-305`, `:330-364`, `:403`, `:414`, `:453`; `README.md:99-128` | §1 row, module map, task folder (`concerns/`), §8.7 dismiss row, §8.11 funnel contract, byte budgets, status output, test inventory. |

Dependency rule: core modules do not import the harness (`docs/ARCHITECTURE.md:61-88`); concern modules depend only on `artifacts.ts`, git commit/exec, records io, mutex and `steer.ts` (`src/core/concerns.ts:1-9`, `src/core/triage.ts:1-13`). `triage.ts` calls `concerns.ts` and `steer.ts`; `concerns.ts` deliberately does not import `triage.ts` (cycle note `src/core/flows/step-runner.ts:242-245`).

## 2. Key Interfaces & Signatures

### Concern payload and stored record (`src/core/artifacts.ts`)
```ts
// :303-321
type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
type ConcernSeverity = "low" | "medium" | "high";
type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";
interface Concern { id?: string; kind: ConcernKind; summary: string; detail: string;
  location?: { file: string; line?: number }; severity: ConcernSeverity; affects?: string[] }

// :323-327 RemarkableDecision { chosen: string; alternatives: string[]; why: string }
// :330-334 ConcernConfirms { id: string; confirm: "accept" | "reject"; note?: string }
// :337-341 ConcernResolution { id; action: "resolve" | "carry"; note? }
// :347-351 CloseupConcernResolution { id; action: "resolve" | "carry" | "propagate" | "dismiss"; note? }
// :353-364 ConcernSource { record; agent; epic?; step?; item?; iteration?; escalated?; lastSeen? }
// :366-372 PendingConcernResolution { action; note?; by; at }
// :375-384 StoredConcernArtifact extends Concern { id; status; disposition?; dismissReason?; source; pendingResolution?; createdAt; updatedAt }
// :386-393 ReviewDisposition = "fix" | "optional" | "architect" | "human-awareness" | "human-async" | "human-stop" | "dismiss"
```

Producer surfaces carrying the funnel fields:
- `ReviewArtifact` `src/core/artifacts.ts:406-412` (`suggestions`, `newConcerns`, `remarkable`)
- `DeveloperOutputArtifact` `:419-427`, `FactFinderOutputArtifact` `:429-437` (`concerns`, `remarkable`)
- `WaveCloseupArtifact` `:439-452` (`concerns`, `remarkable`, `concernResolutions`)
- `PlanCloseupArtifact` `:454-466` (`concerns`, `remarkable`, `concernConfirms`, `concernResolutions`)
- `DecisionArtifact` `:470-488` (`concerns`, `remarkable`, `concernConfirms`, `concernResolution`)
- `ReviewSuggestion` `:395-404` (`id`, `disposition`, `summary`, `detail`, `location`)
- `ConcernCounts` `:565-570`; `StateArtifact.concerns` `:572-583` (required field)

### Pipeline configuration (`src/core/artifacts.ts:108-143`)
```ts
interface PipelineConfig {
  humanInvolvement?: "autonomous" | "principal" | "detailed";
  concerns?: { raiseAllowlist?: string[]; minDigestSeverity?: ConcernSeverity; minBlockingSeverity?: ConcernSeverity };
  reviewPolicy?: { default?: string[]; allowedDispositions?: string[]; [agent: string]: string[] | undefined };
  // ...
}
```
Schema: `config/schemas/pipeline.schema.json:202-237` (closed `concerns` object; `reviewPolicy` allows per-agent arrays). Defaults: `config/pipeline.default.yaml:373-408`. Array replacement / `null` deletion semantics: `src/core/config/merge.ts:1-8`.

### Store API (`src/core/concerns.ts`)
```ts
concernFingerprint(c: ConcernInput): string                 // :60-62, sha256(kind, norm(summary), file, line), 10 hex, prefix "c-"
aggregateConcerns(ctx, concerns, remarkables?, opts?): Promise<StoredConcernArtifact[]>   // :124-168
listConcerns(taskDir) / listOpenConcerns(taskDir)           // :171-189
countConcerns(taskDir): Promise<ConcernCounts>              // :196-217, c-* only
listConcernIds(taskDir): Promise<string[]>                  // :220-230, includes rm-*
applyConcernTriage(ctx): Promise<StoredConcernArtifact[]>   // :252-263
applyCloseupResolutions(ctx)                                // :266-273, pending only
applyConcernConfirms(ctx)                                   // :282-306, accept/reject pending proposals
applyConcernResolution(ctx)                                 // :313-328, resolve | carry
applyWaveCloseupFallback(ctx)                               // :337-353, triage-less open concerns
partitionSuggestions(suggestions, concernIds)               // :356-364
reconcileConcerns(ctx)                                      // :391-408, rebuild from committed ok records
```

### Triage API (`src/core/triage.ts`)
```ts
partitionReviewSuggestions(suggestions, concernIds, isTriager)  // :35-50
resolveConcernSeverityPolicy(concerns?)                         // :67-75, defaults medium/high (:62-65)
routeHumanDisposition(ctx, suggestion, concern?)                 // :93-136, digest-only for rm-*, human-awareness, dismissed escalated; blocking only >= minBlockingSeverity
isDebtConcern(concern)                                           // :143-149
listHydratedConcerns(taskDir, consumer)                          // :219-231
hydrateStepConcerns(taskDir, {stepRole, consumer?, diffBytes?, taskDiffBytes?, inputBytes?}) // :234-247
renderConcernsYaml(records, maxBytes = 8000)                     // :254-286
applyReviewTriage(ctx)                                           // :293-349
```

### Review policy (`src/core/review-policy.ts`)
`BUILTIN_REVIEW_DISPOSITIONS = [fix, optional, architect, human-awareness, human-async]` (`:4-10`), `isTriagerAgent` (`:18-20`), `resolveReviewAllowed` (`:27-43`, precedence per-agent > default > legacy `allowedDispositions` > builtin; `dismiss` added for triagers, removed for non-triagers).

### ADR/epic/status
- `blockingAdrDisposition(mode)` `src/core/flows/adrs.ts:14-18`; `renderAdrMarkdown` `:21-37`; `persistAdrs` `:46-71`.
- `PropagateEpicConcernsOptions` `src/core/flows/epic-propagation.ts:26-33`; `propagateEpicConcerns` `:152-185`.
- `runConcernConsult` `src/core/flows/consults.ts:319`.
- `StepRunResult.triage?: ReviewTriageOutcome` `src/core/flows/step-runner.ts:105`.
- `collectRoutedBlockers` `src/core/derive/task.ts:52-65`; `withRoutedBlocking` `src/core/derive/item.ts:65-73`; `blockedByConcern` `src/core/plan/scheduler.ts:68-78`; `refreshStateYaml` `src/core/derive/task.ts:431-441`.
- `writeQuestion` `src/core/steer.ts:63`; `questionBlocks` `:117-124`.
- `formatHumanInvolvementCriteria` `src/core/prompts.ts:68-85`; `formatDispositionsSection` `:91-111`; `generateReviewSchema` `src/core/records/review-schema.ts:5-104`; `resolveStepSchema` `src/core/flows/step-runner.ts:111-179`.

## 3. Relevant Excerpts

### Identity, dedup and merge (`src/core/concerns.ts:49-99`)
- Normalization `norm = trim + collapse whitespace + lowercase` (`:49`); funnel budgets compare UTF-8 bytes (`:50-51`).
- Concern id: `c-` + first 10 hex of `sha256(JSON.stringify([kind, norm(summary), file|null, line|null]))` (`:53-62`). Remarkable id: `rm-` + `sha256([norm(chosen), sorted(alternatives)])` (`:55`).
- Merge rules: longest detail wins, highest severity wins, `affects` union/dedup/sort, status preserved, `escalated` sticky and set when an incoming severity exceeds the stored one (`:71-88`).
- Legacy pre-union files with the same kind/summary/location are rename-merged on raise (`:101-121`, deletion `:149`).
- Mutation is serialized by `KeyedMutex` keyed on `taskDir` and committed as one `factory: concerns <message>` commit (`:45-46`, `:232-249`).

### Reviewer triage (exact id only) (`src/core/triage.ts:35-50`, `252-263`)
```ts
if (!isTriager) return { triage: [], findings: [...suggestions], fixRequired: false };
const ids = new Set(concernIds);
const triage = suggestions.filter(s => ids.has(s.id));
// findings = the rest; fixRequired = triage.some(s => s.disposition === "fix")
```
`applyConcernTriage` refuses non-triagers, requires non-empty `detail` for `dismiss`, and writes `status: dismissed` + `dismissReason`, else `status: routed` + disposition (`src/core/concerns.ts:252-263`). The step-runner passes only ids that existed **before** the step, so a step cannot self-dismiss its own findings (`src/core/flows/step-runner.ts:233-240`).

### Human router (`src/core/triage.ts:93-136`)
`human-awareness`, `rm-*` remarkables and dismissed-escalated concerns are digest-only; `human-async`/`human-stop` block only at or above `minBlockingSeverity` and downgrade to `human-awareness` below it; nothing below `minDigestSeverity` is surfaced (`rm-*` is threshold-exempt). Mailbox ids are `q-concern-<concernId>` or `q-escalated-<concernId>`, so a re-raise does not duplicate a question and `writeQuestion` keeps an existing answered file (`src/core/steer.ts:99-106`).

### Ingest order after a step (`src/core/flows/step-runner.ts:193-322`)
1. Collect `concerns`+`newConcerns`, `remarkable`, `suggestions`, `concernResolutions`, `concernConfirms`, `concernResolution` (`:198-215`).
2. Gate raise by `source.agent` against the allowlist; a skip is journaled and the step stays ok (`:217-231`).
3. Capture pre-existing concern ids for exact-id triage (`:233-240`).
4. Pre-flight architect dismiss-confirmations that need a pending reason, before mutating anything (`:242-259`).
5. `aggregateConcerns` (`:260`) → `applyReviewTriage` (`:261-275`) → `applyCloseupResolutions` (`:276`) → decision-level `applyConcernResolution` only for `consult-concern-<id>`, `architect-closeup*`, `architect-wave-report*` (`:278-301`) → `applyConcernConfirms` + propagate-accepted (`:303-316`) → wave-close-up fallback (`:318-321`).
6. Called only when `finalStatus === "ok"` (`:841-861`); a `TriageValidationError` flips the step to error, other ingest failures are journaled and do not change step status (`:853-860`).

### Hydration caps — “never more text than the code it summarizes” (`src/core/triage.ts:234-247`)
```ts
cap = role in {review, qa}      ? min(diffBytes ?? 0, 2000)
    : role in {wave-close-up, plan-close-up} ? min(taskDiffBytes ?? 0, 2000)
    : min(inputBytes ?? 0, 500);
if (cap <= 0) return "";
```
`renderConcernsYaml` degrades in stages: full records → drop `affects` → summary limits 80/40/16/8/4/1 → shed trailing entries; default ceiling 8000 bytes (`:254-286`). Consumer sets: review/develop see open only; close-ups see open+routed; architect additionally sees escalated dismissed; every consumer sees open remarkables (`:219-231`). Prompt-var wiring: `step-runner.ts:429-449` (caller-supplied `concernsYaml` wins; close-up caps measure `git diff parent...HEAD`).

### Plan-review triage never requests revisions (`src/core/flows/iteration.ts:506-572`)
`knownConcernIds = listConcernIds(taskDir)` is captured before each round (`:512-514`); after the plan-reviewer turn, `partitionSuggestions` removes triage ids and only `findings` with `fix` can trigger an architect revision (`:561-572`). The plan-reviewer prompt receives `dispositionsCriteria` built from its allowed set, which includes `dismiss` (`:537-544`).

### Routed blocker → dependent items + architect consult (`src/core/derive/task.ts:52-65`, `src/core/flows/iteration.ts:200-229`)
`collectRoutedBlockers` selects `kind === blocker && status === routed && severity >= minBlockingSeverity` and returns `affects` slugs. `blockedByConcern` blocks only pending affected items and cascades over declared deps to a fixpoint (`src/core/plan/scheduler.ts:68-78`). In the act phase, `consultRoutedBlockers` runs once per routed blocker whose `affects` intersects the wave’s blocked set; the decision artifact `decisions/concern-<cid>.yaml` makes it restart-idempotent (`src/core/flows/consults.ts:319-421`).

### Close-up propose/confirm (`src/core/concerns.ts:266-306`, `337-353`)
Close-ups are non-triagers, so their `concernResolutions` are stored as `pendingResolution` only. The architect `concernConfirms` accepts (`resolve`→resolved, `carry`→routed/architect, `dismiss`→dismissed with pending note, `propagate`→clears local proposal) or rejects (clears proposal). `applyWaveCloseupFallback` only touches pre-existing open concerns with no pending resolution/disposition: tech-debt→`optional`, others→`architect`, blockers stay open, epic copies skipped (`:342-350`).

### Epic → saga condensing (`src/core/flows/epic-propagation.ts:35-58`, `141-185`)
Payloads ≤120 bytes stay verbatim; longer ones are truncated to `min(500, floor(bytes/2))` on UTF-8 boundaries; summary is prefixed `[epic]`; source becomes `epic:{epic}/{record}`; concerns are copied only when open/routed, remarkables only when open and only on unfiltered pushes; blocked child questions are forwarded with `blocks` remapped from `task` to the parent slug (`:97-128`). The push and the parent `child-closeup.yaml` share one lock and one commit (`src/core/engine.ts:266-290`).

### ADRs (`src/core/flows/adrs.ts:14-37`, `46-71`)
`autonomous` → blocking ADR uses `human-stop`; `principal`/`detailed` → `human-async`; remarkable ADRs always `human-awareness` with no `blocks`. Markdown is written only when `adrFolder` is configured; mailbox routing always runs. A blocking ADR parks a plan-time iteration before any wave (`src/core/flows/iteration.ts:461-471`).

### Modes and prompt fragments (`src/core/prompts.ts:64-85`, `config/pipeline.default.yaml:384-437`)
`formatHumanInvolvementCriteria` keeps only the active `## <mode>` section plus shared sections (the blocking table), dropping inactive mode headings. Shipped presets pair each mode with `minDigestSeverity`/`minBlockingSeverity`; those thresholds are separate keys, not derived from the mode.

### Counts and status (`src/core/derive/task.ts:369-395`, `src/cli/status.ts:106-124`)
`countConcerns` counts `c-*` files only and is written into `state.yaml` on every refresh (`refreshStateYaml` is called after every step, `src/core/flows/item-machine.ts:748`). `factory status` prints `Concerns: open N | dismissed N | routed N | resolved N`, then splits open mailbox entries into blocking vs digest and lists debt.

## 4. Existing Tests & Conventions

**Runner and helpers.** `bun test` (`bun:test`), 71 files. Engine behavior is exercised through `runAgentStep` / `runTask` against real temporary git repositories (`test/helpers/tmp-repo.ts:1-60`: `createTmpRepo`, deterministic git env) with `FakeHarness` scripted per step label (`src/harness/fake/fake-harness.ts:25-50`: `scriptOutcome(label, outcome)`, `scriptComplete(handler)`). Tests assert observable engine behavior — committed files, statuses, mailbox files, prompts, exit codes — not internal calls (ARCHITECTURE §13 `docs/ARCHITECTURE.md:451-454`).

**Funnel suites** (all present and passing):

| Suite | Focus |
|---|---|
| `test/engine/concerns-funnel.test.ts` | Schema write gate, fingerprint/dedup/merge, legacy migration, concurrency, producer wiring, reconcile, startup recovery, ingest failure keeps step ok. |
| `test/engine/reviewer-triage.test.ts` | Terse hydration, no `detail` leak, dismiss reason, exact-id partition, debt predicate, `fixRequired`, `q-concern` dedupe, non-triager QA no-op, engine blocking. |
| `test/engine/plan-reviewer-triage.test.ts` | Plan-concern hydration, dismiss/routed, architect-revise accumulation, triage ids never trigger revision, debt derivation. |
| `test/engine/closeup-lifecycle-resolve.test.ts` | Accept resolve/carry/propagate, reject, dismiss note validation, consult unblock, cross-emission drop, wave fallback; architect close-up emits `concernConfirms` (`:156-162`, `:253-259`, `:367-373`). |
| `test/engine/funnel-text-budget.test.ts` | UTF-8 byte budgets, git-diff caps, zero-diff caps, strict per-level condensation. |
| `test/engine/epic-saga-propagate.test.ts` | Open/routed copy with `[epic]`, condensing, restart idempotency, `q-epic-*`, saga architect hydration, failed-child propagation. |
| `test/engine/routing-blocker-derive.test.ts`, `routing-architect-consult.test.ts`, `routing-human-debt.test.ts` | Blocker→dependent blocking, one consult per blocker, debt routing. |
| `test/engine/human-router-severity.test.ts` | Single router, severity downgrades, digest-only, escalation, allowlist, exit codes. |
| `test/engine/adr-blocking-digest.test.ts` | ADR markdown, blocking halt, remarkable digest, mode table, no `adrFolder`. |
| `test/engine/state-concern-counts.test.ts`, `test/cli/status-concerns.test.ts` | `state.yaml` counts, zero/corrupt handling, CLI output split. |
| `test/human-involvement-config.test.ts` | Defaults, layer overrides + null deletion, schema closedness, shipped presets, criteria fragment selection at prompt time, triager prompt reach. |
| `test/contracts/concern-*.test.ts`, `state-concern-schema.test.ts` | Artifact type/schema contracts, `schema-detail-normalize` (detail/severity optionality). |
| `test/engine/hydration-fingerprint-caps.test.ts` | Caps, caller override, architect single cap, hydrated sets, remarkables, counts exclude remarkables, fingerprint identity/affects union, legacy rename. |
| `test/docs-concerns.test.ts` | Base-failing docs sentinels (16 assertions) for §1 row 18, §8.11 store/triage/close-ups/ADRs/modes/counts/caps/deviations, §3 modules, §5 config, §6.2 folder, §8.7 dismiss row, §10 budgets, §11 status, §13 suites, README, config commentary. |

**Conventions worth keeping.** New behavior tests should go through the engine with `FakeHarness`; docs changes are guarded by `test/docs-concerns.test.ts` which asserts exact needles inside `##` sections and YAML comment banners; any assertion added must be base-failing (its needle must not exist on the base tree) or it proves nothing.

## 5. Open Questions & Uncertainties

1. **Close-up confirmation prompt/engine mismatch (highest-value gap).** The engine expects the architect to settle close-up proposals with `concernConfirms` (`src/core/flows/step-runner.ts:303-316`, `src/core/concerns.ts:282-306`), but `agents/steps/architect-closeup.md:29` instructs `concernResolutions` (the proposal field) and nothing mentions confirms. `agents/steps/architect-wave-report.md:32` and `architect-resume.md:27` instruct neither, while `agents/steps/wave-close-up.md:26` emits proposals. A proposal the architect never confirms stays `pendingResolution` forever, and `applyWaveCloseupFallback` then skips it (`src/core/concerns.ts:347`). Decide whether to fix the fragments (cheap, in scope) or make ingest treat architect `concernResolutions` as confirms.

2. **Remarkable digest is triage-dependent.** `remarkable[]` becomes an open `rm-*` record (`src/core/concerns.ts:152-159`) and is hydrated to every consumer (`src/core/triage.ts:200-231`), but a mailbox digest is written only when a triager emits a suggestion whose id is an `rm-*` id with a human-* disposition (`src/core/triage.ts:98`, `:334-346`). Architect ADRs route automatically (`src/core/flows/adrs.ts:56-70`); worker remarkables do not. Spec `docs/factory.v2.md:98` says remarkable items are “reported (mailbox digest), never waiting”. Decide: auto-digest new remarkables above a threshold, or document reviewer-triage dependency explicitly.

3. **Epic mailbox isolation.** `runChildTask` accepts `rootTaskDir` (`src/core/engine.ts:221`, passed at `:737`) but never reads it; `processSteeringMailbox` is called only from root `runTask` (`src/core/engine.ts:432-440`) and writes to the task dir it is given (`src/core/steer.ts:90-93`). Child task dirs are `{childWt}/{orch}/{parent}/{epic}` (`src/core/engine.ts:234`), so `human-*` concerns raised inside an epic land in the epic mailbox, while `docs/ARCHITECTURE.md:309` states the active run (root or epic) polls the root mailbox. Blocked child questions are forwarded as `q-epic-*` (`src/core/flows/epic-propagation.ts:97-129`), but parent answers are not copied back down. Decide: wire child→root mailbox, or record as a sixth accepted deviation.

4. **Reviewer “condense” is prompt-only.** `agents/steps/review.md:23` asks reviewers to condense or dismiss stale concerns, but `applyConcernTriage` persists only status/disposition/reason (`src/core/concerns.ts:252-263`); stored `detail` is never rewritten. Condensation is realized only by hydration suppression (`src/core/triage.ts:151-165`, `:254-286`) and epic-copy truncation (`src/core/flows/epic-propagation.ts:52-58`). Decide whether the store should persist a reviewer-condensed summary/detail, or whether the byte-capped prompt view is the contract.

5. **Epic children do not inherit task config** (accepted deviation `adr-epic-config-root-only`, `docs/ARCHITECTURE.md:361`). `runChildTask` loads `pipelineFor(childTaskDir)` (`src/core/engine.ts:247`); the root `humanInvolvement`/`concerns`/`reviewPolicy` overrides do not reach epic children. If per-task mode switching must apply inside epics, this needs a code change, not docs.

6. **Triage coverage gaps are accepted** (`adr-funnel-triage-coverage`, `docs/ARCHITECTURE.md:360`): only plan generation is plan-reviewer-triaged; architect concerns from consult/wave-report/close-up turns aggregate but stay open until an architect turn hydrates them or the wave fallback runs; simple-task concerns have no reviewer/waves and stay open. Decide whether the iteration should narrow this or leave the deviation.

7. **Counts exclude remarkable decisions** (`adr-remarkable-counts-semantics`): `countConcerns` iterates `c-*` only (`src/core/concerns.ts:196-217`) and `factory status` prints only those (`src/cli/status.ts:106-108`). Digest entries also have no retention/archival rule (`docs/ARCHITECTURE.md:356`). Confirm this is acceptable for “state.yaml shows counts”.

8. **Mode presets and severity thresholds are only conventionally coupled.** `humanInvolvement` affects ADR disposition (`src/core/flows/adrs.ts:14-18`) and prompt criteria (`src/core/prompts.ts:64-85`); digests/blocking are governed by `concerns.minDigestSeverity`/`minBlockingSeverity`. The shipped presets copy both (`config/pipeline.default.yaml:410-429`), but switching only `humanInvolvement` leaves thresholds unchanged. Decide whether presets should be engine-derived.

9. **Static review schema and extra review agents.** `config/schemas/review.schema.json:22-42` still lists `dismiss` unconditionally; no `src/` code references it (tests only). Runtime schemas are generated per agent (`src/core/flows/step-runner.ts:117-128`, `src/core/records/review-schema.ts:5-12`). An extra agent configured with `output: review` does not match the hardcoded reviewer/qa/plan-reviewer branch and falls through to `${agent}.schema.json` → permissive fallback (`src/core/flows/step-runner.ts:159-178`), which can admit `dismiss` for a non-triager. Confirm no non-triager path can emit `dismiss`, or add a generic `output`-based schema mapping.

10. **Fire-test evidence is operational.** Spec `docs/factory.v2.md:103` requires switching modes via config between launches and a mailbox with only funnelled, confirmed, low-noise items. `docs/FIRE_TEST.md:43`, `:51` names this exact check, but no unit test performs two `runTask` launches with a mode change; evidence must come from the self-host launches.

11. **Pre-existing, not item-18: architect hydration default differs.** `src/core/flows/iteration.ts:279` uses `limits.hydrationBytes ?? 65536` while `src/core/loops.ts:24` and `config/pipeline.default.yaml:333` default to `40000`. The configured value wins in normal runs; only a config missing `hydrationBytes` hits the inconsistency. Do not fold this into item 18 unless the iteration is explicitly closing adjacent holes.
`). Read code ONLY to verify a specific integration decision (few targeted reads, never broad scans). Translate new unknowns into spike outlines or plan amendments instead of in-turn investigation. Keep terse.
- Outcome options (yield `decision` matching `decisions.schema.json` with `context: "wave"`):
  - `continue`: wave succeeded; proceed to the next scheduled wave.
  - `amend`: revise remaining plan items based on wave learnings or spike results. Yield `outlines` = the NEW or REPLACEMENT PlanItemOutline entries for the amendment (same shape as plan `itemOutlines`: slug, kind, title, description?, milestoneId?, deps?, escalate?), PLUS optional `removeItemSlugs` naming PENDING (never merged/running) items the new items replace, PLUS `planDelta` prose describing the change for the PM. NEVER yield `amend` without `outlines`: an amendment with no new outlines is `continue`.
  - `end-iteration`: halt remaining waves early and transition directly to plan close-up (e.g. goal accomplished early or severe pivot required).
- When an amendment versions or replaces an item (for example a *-v2 copy superseding the original), include the stale original slug in `removeItemSlugs` so the pending original does not linger and run redundantly.
- Integrate spike findings: use `findings.md` and PoC results from finished spikes to inform subsequent item outlines.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.

## Current Plan
{
  "iteration": 5,
  "milestones": [
    {
      "directionalInterfaces": [
        "runtime file schemas (callees: decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) <- step-runner validation (caller): lowercase detail accepted, capital Detail rejected with step error before any store write; aggregateConcerns/mergeConcern carry lowercase detail with longest-wins",
        "file schemas plus StoredConcernArtifact (callees) -> contract and longest-wins suites (callers): schemas accept lowercase detail and reject capital Detail; stored reads assert lowercase detail; negative-casing fixtures keep capital Detail to prove rejection"
      ],
      "id": "m0-detail-normalize",
      "scenarios": [
        "Given the 6 runtime file schemas plus reference review schema When test/contracts/schema-detail-normalize.test.ts, test/contracts/concern-schemas.test.ts, and test/contracts/concern-artifact-types.test.ts run Then lowercase detail validates and capital Detail is rejected",
        "Given a stored concern with 200-byte detail re-emitted with 20-byte detail When aggregateConcerns merges Then the stored 200-byte detail survives",
        "Given tsc --noEmit and the contract, longest-wins, and epic-saga suites When run with TMPDIR=/tmp Then all pass, proving no stale capital reads remain (typed reads fail typecheck, casing fails contracts)",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass with no regressions"
      ],
      "title": "Detail casing normalization"
    },
    {
      "directionalInterfaces": [
        "architect-closeup plus architect-wave-report fragments (callees) -> architect agents (callers): final bullet carries the concernConfirms accept/reject instruction with dismiss note rule (wave-report scoped to wave-close-up proposals) while preserving Raise-concerns and condense sentinels; architect-closeup carries no concernResolutions instruction",
        "ARCHITECTURE §1 row 18 plus §8.11 deviations list (callees) <-> docs-concerns sentinels (callers): row and body needles agree on six deviations including epic-mailbox-isolation; repo docs/adr stubs expose Decision paragraphs for the three records"
      ],
      "id": "m1-confirm-instructions",
      "scenarios": [
        "Given agents/steps/architect-closeup.md When read Then the final bullet instructs concernConfirms accept/reject with the dismiss note rule, keeps Raise-concerns and condense clauses, carries no concernResolutions instruction, and the fragment non-empty line count is unchanged",
        "Given agents/steps/architect-wave-report.md When read Then the final bullet instructs concernConfirms for wave-close-up proposals, keeps Raise-concerns and condense clauses, and the fragment non-empty line count is unchanged",
        "Given the rendered architect-closeup and architect-wave-report prompts When checked via prompts.test.ts Then the confirms instruction is present in both, concernResolutions is absent from architect-closeup, and the fragment matrix plus 15/80 debloat budgets pass",
        "Given ARCHITECTURE §1 row 18 and the §8.11 Accepted deviations list When read Then both record six deviations including epic-mailbox-isolation",
        "Given test/docs-concerns.test.ts and the full suite When run with TMPDIR=/tmp Then all sentinels pass including the updated row-18 and deviations needles, and typecheck and bun test pass"
      ],
      "title": "Close-up confirm instructions and traceability updates"
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Normalize concern Detail (capital-D) to detail (lowercase-d, all lowercase letters) in the 6 runtime file schemas under plugins/software-factory/config/schemas/ (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) + reference-only review.schema.json. TS fix at plugins/software-factory/src/core/concerns.ts:74: change the guard's capital-D property read to the lowercase-d property read (all-lowercase detail), restoring longest-wins. MUST-FIX positive stored reads to lowercase-d: plugins/software-factory/test/engine/epic-saga-propagate.test.ts:248/307/313/319 AND plugins/software-factory/test/contracts/schema-detail-normalize.test.ts:234/263 longest-wins assertions; sweep plugins/software-factory/test/engine/funnel-text-budget.test.ts + any others with :raw reads (grep missed verified matches this turn, never rely on grep alone). MUST-PRESERVE all negative-casing fixtures capital-D: schema-detail-normalize absence assertions + capital-D rejection payloads, concern-schemas.test.ts capital-D rejection payloads, concern-artifact-types.test.ts capital-D ts-expect-error fixture. Rule: positive stored-read assertions flip to lowercase-d; every rejection/absence/expect-error fixture keeps capital-D or coverage is destroyed. Longest-wins tests already exist -- fix their reads, do NOT add duplicates. triage/infra/pm-edit untouched. Verify typecheck + TMPDIR=/tmp bun test full suite green.",
      "kind": "story",
      "milestoneId": "m0-detail-normalize",
      "prodBudgetHint": 30,
      "slug": "schema-detail-normalize-v3",
      "title": "Lowercase detail in producer schemas + merge fix"
    },
    {
      "deps": [
        "schema-detail-normalize-v3"
      ],
      "description": "Per adr-confirm-field-instructions, after m0 is merged (baseline is RED so m1 gates require m0): net-zero single-line in-place replacement of the existing final bullet in plugins/software-factory/agents/steps/architect-closeup.md (concernConfirms accept/reject instruction incl the note rule for dismiss; concernResolutions instruction gone) and in plugins/software-factory/agents/steps/architect-wave-report.md (concernConfirms instruction for wave-close-up proposals). Both rewritten bullets MUST keep the Raise-concerns-with-evidence clause and the condense clause -- only Resolutions->Confirms plus the dismiss note rule changes -- or the prompts.test matrix sentinels fail. Zero net added lines per fragment; plugins/software-factory/agents/steps/architect-resume.md and all other fragments untouched. Extend plugins/software-factory/test/prompts.test.ts asserting confirms-present in both rendered prompts and concernResolutions-absent from architect-closeup; enforce net-zero via git diff --numstat showing equal insertions/deletions for the two fragments. Complete (UPDATE, never rewrite: preserve existing title+context stub text, append the Decision paragraph from the matching plan ADR) docs/adr/adr-confirm-field-instructions.md, docs/adr/adr-epic-mailbox-isolation.md (sixth deviation), docs/adr/adr-remarkable-digest-triage.md (spec-consistent, NOT a deviation). Update plugins/software-factory/docs/ARCHITECTURE.md §1 row 18 to six deviations (epic-mailbox-isolation needles + adr-epic-mailbox-isolation id) AND append the matching bullet to the §8.11 Accepted deviations list, co-updating BOTH sentinels in plugins/software-factory/test/docs-concerns.test.ts with the same needles in the same diff. Do NOT touch README/config/criteria files or any other ARCHITECTURE section. Verify: prompts.test matrix + 15/80 budgets green, docs-concerns green, typecheck + TMPDIR=/tmp full suite green.",
      "kind": "story",
      "milestoneId": "m1-confirm-instructions",
      "prodBudgetHint": 20,
      "slug": "closeup-confirm-instructions",
      "title": "Architect confirms instructions + traceability updates"
    }
  ],
  "assumptions": [
    {
      "assumption": "Baseline is RED on detail casing, contradicting the context-pack 467-pass/typecheck-clean claim: :raw reads verify capital-D Detail in runtime schemas (developer-output.schema.json:68, plan-closeup.schema.json:34), plugins/software-factory/src/core/concerns.ts:74 reads existing?.Detail (capital-D; type error against lowercase StoredConcernArtifact.detail, longest-wins dead), plugins/software-factory/test/engine/epic-saga-propagate.test.ts:248/307/313/319 read capital-D, and plugins/software-factory/test/contracts/schema-detail-normalize.test.ts:234/263 read merged[0]!.Detail (capital-D). Gates go green only after m0 lands. TMPDIR=/tmp still required for the 2 pre-existing head-guard failures.",
      "why": "Reviewer-verified on exact bytes; :raw reads plus closeup-4 are authoritative. Plan targets red-to-green via m0, with m1 sequenced after m0."
    },
    {
      "assumption": "Behavior is frozen except Detail->detail normalization, two net-zero architect-fragment bullet replacements (+ prompt-render test in prompts.test.ts), completion of 3 existing docs/adr stubs, and the ARCHITECTURE §1 row 18 + §8.11 deviations bullet + both docs-concerns sentinel co-updates. No README/config/prompt-criteria edits; no other ARCHITECTURE sections touched.",
      "why": "Closure iteration: bounding change to verified gaps avoids regressions and sentinel/debloat violations while keeping row+body+ADR traceability consistent."
    },
    {
      "assumption": "Q4/Q8/Q9 resolved accept-only with no code: byte-capped hydration views (triage.ts:151-165,254-286) plus epic-copy truncation are the condense contract (stored detail never rewritten); mode presets and severity thresholds stay conventionally coupled (engine-deriving presets would change config semantics); extra-agent output:review permissive fallback is out of closure scope (default triager/non-triager paths enforce dismiss via generated enum + isTriager gate, tested).",
      "why": "All are accepted-semantics or non-default-setup edges; architect decides, no operator action needed."
    },
    {
      "assumption": "Epic mailbox isolation accepted as the sixth deviation; epic-local digests invisible at root is operator-visible behavior.",
      "disposition": "human-awareness",
      "why": "Operators polling the root mailbox would otherwise miss epic-local human-* entries; architect decides, operator informed, mirroring the four prior awareness items."
    }
  ],
  "techDebt": [
    {
      "category": "impacting",
      "description": "Capital-D Detail in 6 runtime-bound file schemas rejects lowercase detail (review.schema.json reference-only, normalized for consistency); mergeConcern reads existing?.Detail (capital-D) so typecheck fails and longest-wins is dead; epic-saga (:248/:307/:313/:319) and schema-detail-normalize (:234/:263) tests read capital-D, while negative-casing fixtures must keep capital-D to prove rejection.",
      "id": "td-detail-casing",
      "resolution": "Fix in schema-detail-normalize-v3: normalize schemas + concerns.ts:74 + all stale positive reads verified by :raw (rejection/absence/expect-error fixtures stay capital-D); contract and longest-wins tests verify; full gates green."
    },
    {
      "category": "adjacent",
      "description": "Pre-existing head-guard failures when TMPDIR sits under .factory-runtime; every gate run needs the TMPDIR=/tmp workaround.",
      "id": "td-tmpdir-split"
    },
    {
      "category": "adjacent",
      "description": "Unapplied spike-saga-commit reviewer optional nits (qualify epic-state precedence, prefix inline paths, scope removeWorktree claim, fold contextPack key). Consumers apply mentally.",
      "id": "td-spike-nits"
    }
  ],
  "adrs": [
    {
      "context": "The engine settles close-up proposals only via architect concernConfirms (step-runner.ts:303-316, concerns.ts:282-306), but agents/steps/architect-closeup.md instructs concernResolutions (the proposal field, verified last line) and architect-wave-report.md instructs neither (verified). A proposal the architect never confirms keeps pendingResolution forever, and applyWaveCloseupFallback skips pending concerns (concerns.ts:347), so spec :94 resolve/carry silently stalls in production while engine tests pass.",
      "decision": "Fix the fragments with net-zero single-line in-place replacement: rewrite the existing final bullet of architect-closeup.md to a terse concernConfirms accept/reject instruction with the dismiss note rule, and the existing final bullet of architect-wave-report.md to a concernConfirms instruction scoped to wave-close-up proposals. Both rewritten bullets MUST preserve the Raise-concerns-with-evidence clause and the condense clause so the prompts.test matrix sentinels (/Raise concerns/ on all 19 fragments, /condens/i on triage fragments) keep passing; only Resolutions->Confirms plus the dismiss note rule changes. Zero net added lines; a prompt-render test in prompts.test.ts locks confirms-present in both renders and concernResolutions-absent in architect-closeup, and git diff --numstat must show equal insertions/deletions for the two fragments. architect-resume.md untouched. No engine/schema changes. Complete the existing docs/adr/adr-confirm-field-instructions.md stub with this Decision paragraph.",
      "id": "adr-confirm-field-instructions",
      "title": "Architect fragments instruct concernConfirms"
    },
    {
      "context": "runChildTask accepts rootTaskDir but never reads it; only root runTask polls the root mailbox, while epic children write human-* to their own task dir mailbox ({childWt}/{orch}/{parent}/{epic}). Blocked child questions are forwarded as q-epic-* (epic-propagation.ts:97-129), but epic-local digests stay in the epic mailbox and parent answers are not copied back down. Wiring child-to-root mailbox routing now is a late-stage behavior change with config-semantics blast radius.",
      "decision": "Accept as the sixth documented deviation for closure: the root mailbox is the operator surface; epic-local digest entries are not visible at root; child-to-root routing/answer-sync is future work. Complete the existing docs/adr/adr-epic-mailbox-isolation.md stub with this Decision paragraph; plugins/software-factory/docs/ARCHITECTURE.md §1 row 18 AND the §8.11 Accepted deviations list each gain the sixth-deviation entry, with the row-18 and §8.11-deviations sentinels in plugins/software-factory/test/docs-concerns.test.ts co-updated with the same needles in the same diff. Operator notified via human-awareness.",
      "id": "adr-epic-mailbox-isolation",
      "title": "Epic mailbox isolation accepted as deviation"
    },
    {
      "context": "Worker remarkable[] becomes an open rm-* record hydrated to every consumer, but a mailbox digest is written only when a triager emits a suggestion matching the rm-* id with a human-* disposition (triage.ts:98,334-346); architect ADRs route automatically instead. Spec :98 says remarkable items are reported in a digest, never waiting.",
      "decision": "Accept triage-dependency as spec-consistent (NOT a deviation, so §1 row 18 and §8.11 are unchanged by this ADR): spec :96 requires remarkable decisions to get the same aggregation/triage as concerns, so reviewer-triage is the funnel gate, not a bypass. No auto-digest above threshold. Complete the existing docs/adr/adr-remarkable-digest-triage.md stub with this Decision paragraph. Untriaged remarkables (simple tasks) never digest, consistent with adr-funnel-triage-coverage.",
      "id": "adr-remarkable-digest-triage",
      "title": "Worker-remarkable digest requires triager confirmation"
    }
  ]
}

## Wave Report
{
  "blockedItems": [],
  "debt": [
    "schema-detail-normalize-v3 requires one guided develop retry per decision 026: delete out-of-scope remarkable why block, verify concerns.ts:74 guard, normalize 6 runtime schemas + review.schema.json, fix MUST-FIX positive reads, preserve negative fixtures."
  ],
  "failedItems": [
    "schema-detail-normalize-v3"
  ],
  "iteration": 5,
  "mergedItems": [],
  "recommendations": [
    "Retry schema-detail-normalize-v3 with single develop round per decision 026 guidance (no test-first re-run).",
    "QA on retry must evaluate red-to-green via existing longest-wins and contract suites, not the deleted remarkable test name; stale missing-test gate result must not reject.",
    "After m0 merges, schedule wave 2 closeup-confirm-instructions (depends on schema-detail-normalize-v3)."
  ],
  "status": "has_failures",
  "summary": "Wave 1 iteration 5 completed with 0 merges. Tree hygiene clean: only engine-managed journal.ndjson modified, no untracked junk, no conflict markers (strict ^<<<<<<< / ^======= / ^>>>>>>> search clean; ===== hits are test-output separators). Gates vs baseline: typecheck pass->pass green (matches baseline), test fail->pass IMPROVED (counts as fixed per table); no regressions. Wave item schema-detail-normalize-v3 failed QA 2/2 due to out-of-scope test-first byte-test plus incomplete develop scope; consult 026 decided retry-with-guidance, iteration can continue.",
  "wave": 1
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


--- Prior Plan plan-4.yaml ---
iteration: 4
milestones:
  - directionalInterfaces:
      - "step-runner (caller) validates producer outputs against the 6 runtime
        file schemas (callee contract: decisions, developer-output,
        fact-finder-output, plan, plan-closeup shared by architect-closeup,
        wave-closeup): lowercase detail accepted, capital-D Detail rejected with
        step error before any store write; aggregateConcerns/mergeConcern read
        lowercase detail with longest-wins"
    id: m0-detail-normalize
    scenarios:
      - Given the 6 runtime file schemas (decisions, developer-output,
        fact-finder-output, plan, plan-closeup incl architect-closeup,
        wave-closeup) plus reference review schema When
        test/contracts/concern-schemas.test.ts runs Then lowercase detail
        validates and capital-D Detail is rejected
      - Given a stored concern with 200-byte detail re-emitted with 20-byte
        detail When aggregateConcerns merges Then the stored 200-byte detail
        survives
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass with no regressions
    title: Detail casing normalization
  - directionalInterfaces:
      - "item-machine/iteration (callers) -> formatDispositionsSection(criteria,
        allowed) (callee): allowed excludes dismiss => dismiss rows/rules
        filtered from prompt criteria text (QA prompt); allowed includes dismiss
        => rows kept (reviewer prompt); mirrors existing human-stop filtering"
      - "review/plan-review step prompts (consumers) <- dispositions.md dismiss
        row (content contract): single terse row stating triager-only, reason
        required, kept on disk; prompt text only, independent of the
        review-schema enum which derives from resolveReviewAllowed"
    id: m1-dismiss-contract
    scenarios:
      - Given dispositions.md When read Then a terse dismiss row (triager-only,
        reason required, kept on disk) exists
      - Given a QA prompt (allowed excludes dismiss) and a reviewer prompt
        (allowed includes dismiss) When rendered Then the QA prompt excludes
        dismiss rows/rules while the reviewer prompt includes them
      - Given prompts.test When run Then the fragment matrix and
        15-per-fragment/80-total debloat budgets pass
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    title: Dismiss vocabulary contract
  - directionalInterfaces:
      - "docs-finish-v5 (caller) documents landed contracts (callees,
        read-only): store layout, fingerprint/dedup, triage contract, router
        table, close-up lifecycle, epic condensing, ADR blocking table, presets;
        deviation history in ARCHITECTURE docs only, never in agents/criteria
        prompt files; no behavior change"
      - "test/docs-concerns.test.ts (caller) asserts doc sentinels (callee
        content): every needle names content added by docs-finish-v5 and fails
        on the base tree"
      - allowlist-agreement-test (caller) imports DEFAULT_RAISE_ALLOWLIST from
        src/core/concerns.ts (callee code) and asserts equality with the shipped
        concerns.raiseAllowlist in config/pipeline.default.yaml (callee data)
    id: m2-docs-gates
    scenarios:
      - Given ARCHITECTURE §1 row 18 When read Then it records item 18
        implemented with the epic-config, close-up-dismiss, saga-semantics,
        immediate-halt, and triage-coverage deviations and no 'Deliberately not
        hand-built'
      - Given ARCHITECTURE §8.11 When read Then it documents store layout,
        fingerprint/dedup, remarkable aggregation/triage with
        threshold-exemption, triage contract, routing table, byte caps as code
        constants, and the engine-owned concerns/ note
      - Given ARCHITECTURE §8.11 When read Then it documents close-up
        propose-confirm incl dismiss, epic condensing, ADR blocking table,
        presets, c-only counts, and no-retention digest
      - Given ARCHITECTURE §8.11 When read Then it records the immediate-halt
        deviation, the triage-coverage limitation (consult/wave-report/closeup
        via hydration+fallback, simple-task stays open), epic-config root-only,
        close-up-dismiss, and saga open-only semantics
      - Given ARCHITECTURE §3/§5/§6.2/§8.7/§10/§11/§13 When read Then modules,
        config sample with root-only layering, concerns/ folder, dismiss row,
        outputs, status counts, and funnel suites are all updated
      - Given README When read Then it has a Concerns & human involvement
        section with per-task principal/detailed examples and status
        counts/digest output; given pipeline.default.yaml When read Then
        reviewPolicy commentary documents dismiss auto-append and the concerns
        block documents the fragment->agent mapping
      - Given test/docs-concerns.test.ts When run on base vs branch Then every
        test fails on base and passes on branch; given the allowlist agreement
        test When run Then code and shipped allowlists agree
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    title: Docs closure and gates
itemOutlines:
  - deps: []
    description: Normalize concern Detail->lowercase detail in 6 runtime file
      schemas (decisions, developer-output, fact-finder-output, plan,
      plan-closeup shared by architect-closeup, wave-closeup) + reference-only
      review.schema.json for consistency with generated review-schema.ts.
      One-line TS fix concerns.ts:72 (existing?.Detail -> existing?.detail)
      restoring longest-wins. Fix ALL capital-D .Detail reads in tests
      (epic-saga-propagate.test.ts incl :307/313/319 + any others;
      funnel-text-budget.test.ts). Ensure contract suite asserts lowercase
      validates + capital-D rejected (add cases if missing); add longest-wins
      behavior test (200-byte stored survives 20-byte re-emit).
      triage/infra/pm-edit untouched. Verify typecheck + TMPDIR=/tmp bun test.
    kind: story
    milestoneId: m0-detail-normalize
    prodBudgetHint: 30
    slug: schema-detail-normalize-v2
    title: Lowercase detail in producer schemas + merge fix
  - deps: []
    description: "Per adr-dismiss-criteria-row: add terse dismiss row + rule to
      agents/criteria/dispositions.md; extend formatDispositionsSection
      (prompts.ts:90-110) to filter dismiss rows/rules when allowed excludes
      dismiss, mirroring human-stop; add QA-excludes/reviewer-includes render
      test; keep prompts.test fragment matrix + 15/80 debloat budgets green.
      Verify typecheck + TMPDIR=/tmp bun test."
    kind: story
    milestoneId: m1-dismiss-contract
    prodBudgetHint: 15
    slug: prompts-dismiss-filter
    title: Dismiss criteria row + prompt filtering
  - deps: []
    description: "Test-only (no prod changes): in
      test/human-involvement-config.test.ts ONLY, replace the local
      DEFAULT_RAISE_ALLOWLIST duplicate (:46-55) with an import of
      DEFAULT_RAISE_ALLOWLIST from src/core/concerns.ts, so the existing
      assertion (:154-157) directly locks code-vs-shipped-yaml agreement. No new
      test file; no third copy. Verify typecheck + targeted suite."
    kind: test-only
    milestoneId: m2-docs-gates
    prodBudgetHint: 0
    slug: allowlist-agreement-test
    title: Raise-allowlist agreement contract test
  - deps:
      - prompts-dismiss-filter
      - schema-detail-normalize-v2
    description: "Docs closure over landed behavior. Repo sources ONLY (no
      orchestration artifacts): all files under docs/adr/ (no count assumed;
      esp. adr-closeup-no-suggestions-triage, adr-epic-push-condensed,
      adr-autonomous-immediate-halt, adr-epic-config-root-only,
      adr-funnel-triage-coverage, adr-remarkable-counts-semantics,
      adr-dismiss-criteria-row),
      src/core/{concerns,triage,review-policy,prompts}.ts,
      flows/{step-runner,iteration,epic-propagation,adrs}.ts, cli/status.ts,
      config/pipeline.default.yaml:359-432. ARCHITECTURE: §1 row 18 implemented
      + 5 deviations (epic-config root-only, close-up-dismiss via resolutions,
      saga open-only semantics, immediate-halt, triage-coverage limitation); new
      §8.11 per m2 scenarios 2a-2c; §3 modules; §5 config sample + root-only
      fix; §6.2 concerns/ + engine-owned; §8.7 dismiss row; §10 outputs; §11
      status; §13 suites; canonical ADR format vs historical notes. README
      Concerns & human involvement section + §5 range update.
      pipeline.default.yaml reviewPolicy dismiss auto-append + concerns
      fragment->agent mapping commentary. Do NOT touch
      agents/criteria/human-involvement.md (prompt criteria). New
      test/docs-concerns.test.ts with base-failing sentinels per Decision 022
      (each needle names added content; verify fail on base, pass on branch).
      Final gates green with TMPDIR=/tmp."
    kind: story
    milestoneId: m2-docs-gates
    prodBudgetHint: 150
    slug: docs-finish-v5
    title: Docs and suite consolidation
assumptions:
  - assumption: "Baseline is RED: 6 runtime file schemas declare capital-D Detail
      with additionalProperties:false (verified by :raw read, e.g.
      developer-output.schema.json:68); concerns.ts:72 reads existing?.Detail
      (verified by :raw read) so typecheck fails and longest-wins is dead;
      epic-saga-propagate and funnel-text-budget tests read .Detail (verified by
      :raw read). The context-pack 445-pass claim is contradicted by file bytes;
      gates go green only after m0 lands. TMPDIR=/tmp still required for the 2
      pre-existing head-guard failures."
    why: Reviewer fix verified on exact bytes this turn; earlier lowercase readings
      were a rendering artifact. Plan targets red-to-green via m0 before docs.
  - assumption: Behavior is frozen except Detail->detail normalization, prompts.ts
      dismiss-row filtering (mirroring human-stop) plus the dispositions.md row
      (prompt surface). Deviation history goes ONLY in ARCHITECTURE docs, never
      in agents/criteria prompt files. Legacy fingerprint migration (Q8) is
      retained as tested, harmless code; allowlist duplication (Q9) is locked by
      a contract test, not refactored.
    why: "Closure iteration: bounding change to the verified gaps avoids regressions
      and prompt debloat violations."
  - assumption: Open questions Q2/Q3/Q4/Q5/Q6/Q7/Q10 are resolved document-only via
      the plan ADRs; operator notified on the four deviations via
      awareness-plan-2-autonomous-halt-deviation,
      awareness-plan-3-epic-config-awareness,
      awareness-plan-4-funnel-triage-coverage-awareness, and
      awareness-plan-4-remarkable-threshold-exemption-accepted.
    disposition: human-awareness
    why: All are accepted-semantics documentation, not implementation gaps;
      architect decides, operator informed.
techDebt:
  - category: impacting
    description: Pre-existing head-guard failures when TMPDIR sits under
      .factory-runtime; every gate run needs the TMPDIR=/tmp workaround.
    id: td-tmpdir-split
    resolution: Run all gates with TMPDIR=/tmp; engine fix for the '/.factory' split
      is out of scope.
  - category: adjacent
    description: Unapplied spike-saga-commit reviewer optional nits (qualify
      epic-state precedence, prefix inline paths, scope removeWorktree claim,
      fold contextPack key). Consumers apply mentally.
    id: td-spike-nits
  - category: impacting
    description: Capital-D Detail in 6 runtime-bound file schemas rejects lowercase
      detail (review.schema.json reference-only, normalized for consistency);
      mergeConcern reads existing?.Detail so typecheck fails and longest-wins is
      dead; epic-saga and funnel tests read .Detail.
    id: td-detail-casing
    resolution: "Fix in schema-detail-normalize-v2: normalize schemas +
      concerns.ts:72 + all test reads; contract and longest-wins tests verify;
      docs-finish-v5 depends on it."
adrs:
  - context: agents/criteria/dispositions.md documents
      fix/optional/architect/human-* but not dismiss, while triagers are allowed
      dismiss and review/plan-review step prompts explain it ad hoc. Adding the
      row to the shared criteria file would leak it into non-triager prompts
      (e.g. QA) unless filtered.
    decision: Add one terse dismiss row + rule to dispositions.md (triager-only,
      reason required, kept on disk) AND extend formatDispositionsSection to
      filter dismiss rows/rules when the allowed set excludes dismiss, mirroring
      the existing human-stop filtering. QA-excludes/reviewer-includes render
      test locks it; prompts.test debloat budgets must pass.
    id: adr-dismiss-criteria-row
    title: Dismiss row in shared criteria with allowed-set filtering
  - context: Spec line 100 says autonomous consults the human only for the portion
      still blocked after everything unblocked is done; implementation halts
      immediately at plan time on a blocking ADR. Repo ADR
      adr-autonomous-immediate-halt.md and awareness item
      awareness-plan-2-autonomous-halt-deviation record this as accepted.
    decision: Keep immediate halt as the accepted deviation for closure;
      drain-then-block scheduling stays future work. docs-finish-v5 marks it
      explicitly in ARCHITECTURE §1 row 18 and §8.11 only;
      agents/criteria/human-involvement.md is prompt criteria and MUST NOT carry
      deviation history.
    id: adr-autonomous-immediate-halt
    title: Autonomous immediate halt accepted (restated)
  - context: ARCHITECTURE §5 claims epics inherit the parent task layer, but
      runTaskChild loads only the child task dir pipeline.yaml, so root
      humanInvolvement/concerns/reviewPolicy overrides do not reach epics. Repo
      ADR adr-epic-config-root-only.md and
      awareness-plan-3-epic-config-awareness record this; implementing
      inheritance would change config semantics for all tasks.
    decision: "Document-only: per-task selectability holds per task directory; epic
      children do not inherit the parent task layer. Record in the §1 row 18
      rewrite and corrected §5; no behavior change."
    id: adr-epic-config-root-only
    title: Epic config inheritance documented as deviation
  - context: Only plan-review routes architect output through plan-reviewer;
      architect concerns from consult/wave-report/closeup turns aggregate but
      stay open until an architect turn hydrates them or wave fallback runs. The
      simple flow has no review step and no waves, so its concerns are never
      triaged.
    decision: "Accept current coverage as the funnel semantic and document it as a
      known limitation in §1 row 18 and §8.11: plan/revise output is
      plan-reviewer-triaged; other architect output is covered by architect
      hydration + wave fallback; simple-task concerns stay open. No new reviewer
      step this iteration. Operator notified via
      awareness-plan-4-funnel-triage-coverage-awareness."
    id: adr-funnel-triage-coverage
    title: Non-plan/simple triage coverage documented as limitation
  - context: Routed rm-* remarkables always digest regardless of minDigestSeverity;
      ConcernCounts/state/status count c-* files only; digest mailbox entries
      persist with no archival rule.
    decision: "Document as accepted semantics in §8.11: remarkables are
      threshold-exempt digests (never blocking/halting, consistent with the
      low-noise digest directive), counts scope is c-* only, digest has no
      retention rule. Any gating/counting/retention change is future work.
      Operator notified via
      awareness-plan-4-remarkable-threshold-exemption-accepted."
    id: adr-remarkable-counts-semantics
    title: Remarkable digest exemption and counts scope accepted
  - context: isTriagerAgent returns true only for reviewer/plan-reviewer; close-up
      schemas carry no suggestions[] so close-up re-triage flows through
      concernResolutions + architect concernConfirms + wave fallback, with
      dismiss added to the resolution vocabulary. Repo ADR
      docs/adr/adr-closeup-no-suggestions-triage.md records this.
    decision: "Restate for plan traceability: close-ups are non-triagers; re-triage
      via resolutions + confirms + fallback. §1 row 18 and §8.11 cite
      docs/adr/adr-closeup-no-suggestions-triage.md; no behavior change."
    id: adr-closeup-no-suggestions-triage
    title: Close-ups removed from triager set; dismiss via resolutions (restated)
  - context: Propagated epic copies preserve child affects slugs while parent
      collectRoutedBlockers matches parent item slugs, so copies stay open by
      design and only forwarded q-epic questions block. Repo ADR
      docs/adr/adr-epic-push-condensed.md and epic-saga-propagate tests record
      this intent.
    decision: "Restate for plan traceability: saga architect resolves/steers
      propagated copies; epic-level blocking reaches the parent only via
      forwarded questions. §1 row 18 and §8.11 cite
      docs/adr/adr-epic-push-condensed.md; no behavior change."
    id: adr-saga-funnel-semantics
    title: Propagated copies open-only; questions block (restated)


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


--- Prior Close-up closeup-4.yaml ---
iteration: 4
status: next-iteration
summary: 'Iteration 4 delivered 1/3 milestones. Verified on exact file bytes:
  m1-dismiss-contract COMPLETE (dispositions.md dismiss row + rule; prompts.ts
  filters dismiss+human-stop by allowed set; QA/reviewer render behavior
  landed). m0-detail-normalize NOT delivered despite its item merging: all 6
  runtime schemas still declare capital-D "Detail" (verified
  developer-output.schema.json:68), concerns.ts merge guard still reads
  existing?.Detail (verified), so the lowercase contract is inverted and
  typecheck/longest-wins/full-suite scenarios cannot pass. m2-docs-gates content
  landed (§1 row 18 Implemented + 5 deviations verified; §8.11 + README +
  commentary + sentinels + allowlist agreement per audit) but its gate scenario
  is blocked on m0, and §8.11 claims longest-wins the code does not deliver.
  Iteration 5: one small red-to-green item (6 schemas + review.schema.json +
  merge guard + stale .Detail test reads + longest-wins/contract verification),
  then re-verify m2 gates with no further docs edits expected.'


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


--- Decision 024-item-prompts-dismiss-filter.yaml ---
id: decision-prompts-dismiss-filter-1794213525197
context: item
item: prompts-dismiss-filter
afterRecord: 003-develop-r1-a2
decision: retry-with-guidance
timestamp: 2026-11-09T08:38:45.197Z
rationale: "Both develop attempts failed on yield shape, not code: 'Agent output
  failed schema validation: /: must be object'. The diff shows the
  implementation landed (dispositions.md +2, prompts.ts +10/-9, prompts.test.ts
  +92/-6), so the work is likely done but the final yield was emitted as a bare
  string/diff instead of the required DeveloperOutputArtifact object. Retry
  needs zero code changes — only a correctly shaped yield."
text: "Retry develop as a yield-only round: make NO code changes (diff already
  implements the row + filter + test). Your entire job is to emit a valid
  DeveloperOutputArtifact OBJECT via the yield tool: { status: 'ok', summary:
  '<1-2 sentences on dismiss row + filter + QA/reviewer test + gates>',
  evidence: ['typecheck command + result', 'TMPDIR=/tmp bun test result'] }. Do
  NOT yield a bare string, a diff, or prose outside the object — that is exactly
  what failed twice ('/: must be object'). Before yielding, re-run cd
  plugins/software-factory && bun run typecheck and TMPDIR=/tmp bun test
  test/prompts.test.ts (full suite if quick) and quote results in evidence. If
  those fail, report status failed with the failure output instead of another
  malformed ok."
persist: true


--- Decision 025-item-docs-finish-v5.yaml ---
id: decision-docs-finish-v5-1794219418081
context: item
item: docs-finish-v5
afterRecord: 006-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-09T10:16:58.081Z
rationale: "Single remaining FIX is a docs-sample inconsistency, fully
  diagnosed: README status sample shows 'dismissed 0' alongside a q-escalated
  id, which is unreachable (q-escalated-* is emitted only when a dismissed
  concern has source.escalated, triage.ts:103-104/117-118, so dismissed >= 1 is
  required); the sample id also uses an rm-* suffix where the router emits
  q-escalated-c-*. Two-line sample change, no test asserts the sample ids, no
  design question. One guided round closes it."
text: "Final round for docs-finish-v5: fix ONLY the README status sample (README
  ~L123-127). Replace the unreachable q-escalated-rm-... id with a reachable
  one: either q-escalated-c-<10-hex> (e.g. q-escalated-c-1a2b3c4d5e) AND change
  the counts line to dismissed 1, or show a remarkable digest as
  q-concern-rm-<10-hex> (remarkables route via concernMailboxId,
  triage.ts:117-119) with consistent counts. Keep all fingerprint suffixes 10
  lowercase hex chars. Do NOT touch code, tests, or any other docs; do NOT
  invent new ids elsewhere. Verify: grep the README sample block for consistency
  (dismissed count >= 1 iff a q-escalated id is shown), then TMPDIR=/tmp bun
  test on test/docs-concerns.test.ts and typecheck."
persist: false


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


--- Prior Plan plan-4.yaml ---
iteration: 4
milestones:
  - directionalInterfaces:
      - "step-runner (caller) validates producer outputs against the 6 runtime
        file schemas (callee contract: decisions, developer-output,
        fact-finder-output, plan, plan-closeup shared by architect-closeup,
        wave-closeup): lowercase detail accepted, capital-D Detail rejected with
        step error before any store write; aggregateConcerns/mergeConcern read
        lowercase detail with longest-wins"
    id: m0-detail-normalize
    scenarios:
      - Given the 6 runtime file schemas (decisions, developer-output,
        fact-finder-output, plan, plan-closeup incl architect-closeup,
        wave-closeup) plus reference review schema When
        test/contracts/concern-schemas.test.ts runs Then lowercase detail
        validates and capital-D Detail is rejected
      - Given a stored concern with 200-byte detail re-emitted with 20-byte
        detail When aggregateConcerns merges Then the stored 200-byte detail
        survives
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass with no regressions
    title: Detail casing normalization
  - directionalInterfaces:
      - "item-machine/iteration (callers) -> formatDispositionsSection(criteria,
        allowed) (callee): allowed excludes dismiss => dismiss rows/rules
        filtered from prompt criteria text (QA prompt); allowed includes dismiss
        => rows kept (reviewer prompt); mirrors existing human-stop filtering"
      - "review/plan-review step prompts (consumers) <- dispositions.md dismiss
        row (content contract): single terse row stating triager-only, reason
        required, kept on disk; prompt text only, independent of the
        review-schema enum which derives from resolveReviewAllowed"
    id: m1-dismiss-contract
    scenarios:
      - Given dispositions.md When read Then a terse dismiss row (triager-only,
        reason required, kept on disk) exists
      - Given a QA prompt (allowed excludes dismiss) and a reviewer prompt
        (allowed includes dismiss) When rendered Then the QA prompt excludes
        dismiss rows/rules while the reviewer prompt includes them
      - Given prompts.test When run Then the fragment matrix and
        15-per-fragment/80-total debloat budgets pass
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    title: Dismiss vocabulary contract
  - directionalInterfaces:
      - "docs-finish-v5 (caller) documents landed contracts (callees,
        read-only): store layout, fingerprint/dedup, triage contract, router
        table, close-up lifecycle, epic condensing, ADR blocking table, presets;
        deviation history in ARCHITECTURE docs only, never in agents/criteria
        prompt files; no behavior change"
      - "test/docs-concerns.test.ts (caller) asserts doc sentinels (callee
        content): every needle names content added by docs-finish-v5 and fails
        on the base tree"
      - allowlist-agreement-test (caller) imports DEFAULT_RAISE_ALLOWLIST from
        src/core/concerns.ts (callee code) and asserts equality with the shipped
        concerns.raiseAllowlist in config/pipeline.default.yaml (callee data)
    id: m2-docs-gates
    scenarios:
      - Given ARCHITECTURE §1 row 18 When read Then it records item 18
        implemented with the epic-config, close-up-dismiss, saga-semantics,
        immediate-halt, and triage-coverage deviations and no 'Deliberately not
        hand-built'
      - Given ARCHITECTURE §8.11 When read Then it documents store layout,
        fingerprint/dedup, remarkable aggregation/triage with
        threshold-exemption, triage contract, routing table, byte caps as code
        constants, and the engine-owned concerns/ note
      - Given ARCHITECTURE §8.11 When read Then it documents close-up
        propose-confirm incl dismiss, epic condensing, ADR blocking table,
        presets, c-only counts, and no-retention digest
      - Given ARCHITECTURE §8.11 When read Then it records the immediate-halt
        deviation, the triage-coverage limitation (consult/wave-report/closeup
        via hydration+fallback, simple-task stays open), epic-config root-only,
        close-up-dismiss, and saga open-only semantics
      - Given ARCHITECTURE §3/§5/§6.2/§8.7/§10/§11/§13 When read Then modules,
        config sample with root-only layering, concerns/ folder, dismiss row,
        outputs, status counts, and funnel suites are all updated
      - Given README When read Then it has a Concerns & human involvement
        section with per-task principal/detailed examples and status
        counts/digest output; given pipeline.default.yaml When read Then
        reviewPolicy commentary documents dismiss auto-append and the concerns
        block documents the fragment->agent mapping
      - Given test/docs-concerns.test.ts When run on base vs branch Then every
        test fails on base and passes on branch; given the allowlist agreement
        test When run Then code and shipped allowlists agree
      - Given the full suite When gates run with TMPDIR=/tmp Then typecheck and
        bun test pass
    title: Docs closure and gates
itemOutlines:
  - deps: []
    description: Normalize concern Detail->lowercase detail in 6 runtime file
      schemas (decisions, developer-output, fact-finder-output, plan,
      plan-closeup shared by architect-closeup, wave-closeup) + reference-only
      review.schema.json for consistency with generated review-schema.ts.
      One-line TS fix concerns.ts:72 (existing?.Detail -> existing?.detail)
      restoring longest-wins. Fix ALL capital-D .Detail reads in tests
      (epic-saga-propagate.test.ts incl :307/313/319 + any others;
      funnel-text-budget.test.ts). Ensure contract suite asserts lowercase
      validates + capital-D rejected (add cases if missing); add longest-wins
      behavior test (200-byte stored survives 20-byte re-emit).
      triage/infra/pm-edit untouched. Verify typecheck + TMPDIR=/tmp bun test.
    kind: story
    milestoneId: m0-detail-normalize
    prodBudgetHint: 30
    slug: schema-detail-normalize-v2
    title: Lowercase detail in producer schemas + merge fix
  - deps: []
    description: "Per adr-dismiss-criteria-row: add terse dismiss row + rule to
      agents/criteria/dispositions.md; extend formatDispositionsSection
      (prompts.ts:90-110) to filter dismiss rows/rules when allowed excludes
      dismiss, mirroring human-stop; add QA-excludes/reviewer-includes render
      test; keep prompts.test fragment matrix + 15/80 debloat budgets green.
      Verify typecheck + TMPDIR=/tmp bun test."
    kind: story
    milestoneId: m1-dismiss-contract
    prodBudgetHint: 15
    slug: prompts-dismiss-filter
    title: Dismiss criteria row + prompt filtering
  - deps: []
    description: "Test-only (no prod changes): in
      test/human-involvement-config.test.ts ONLY, replace the local
      DEFAULT_RAISE_ALLOWLIST duplicate (:46-55) with an import of
      DEFAULT_RAISE_ALLOWLIST from src/core/concerns.ts, so the existing
      assertion (:154-157) directly locks code-vs-shipped-yaml agreement. No new
      test file; no third copy. Verify typecheck + targeted suite."
    kind: test-only
    milestoneId: m2-docs-gates
    prodBudgetHint: 0
    slug: allowlist-agreement-test
    title: Raise-allowlist agreement contract test
  - deps:
      - prompts-dismiss-filter
      - schema-detail-normalize-v2
    description: "Docs closure over landed behavior. Repo sources ONLY (no
      orchestration artifacts): all files under docs/adr/ (no count assumed;
      esp. adr-closeup-no-suggestions-triage, adr-epic-push-condensed,
      adr-autonomous-immediate-halt, adr-epic-config-root-only,
      adr-funnel-triage-coverage, adr-remarkable-counts-semantics,
      adr-dismiss-criteria-row),
      src/core/{concerns,triage,review-policy,prompts}.ts,
      flows/{step-runner,iteration,epic-propagation,adrs}.ts, cli/status.ts,
      config/pipeline.default.yaml:359-432. ARCHITECTURE: §1 row 18 implemented
      + 5 deviations (epic-config root-only, close-up-dismiss via resolutions,
      saga open-only semantics, immediate-halt, triage-coverage limitation); new
      §8.11 per m2 scenarios 2a-2c; §3 modules; §5 config sample + root-only
      fix; §6.2 concerns/ + engine-owned; §8.7 dismiss row; §10 outputs; §11
      status; §13 suites; canonical ADR format vs historical notes. README
      Concerns & human involvement section + §5 range update.
      pipeline.default.yaml reviewPolicy dismiss auto-append + concerns
      fragment->agent mapping commentary. Do NOT touch
      agents/criteria/human-involvement.md (prompt criteria). New
      test/docs-concerns.test.ts with base-failing sentinels per Decision 022
      (each needle names added content; verify fail on base, pass on branch).
      Final gates green with TMPDIR=/tmp."
    kind: story
    milestoneId: m2-docs-gates
    prodBudgetHint: 150
    slug: docs-finish-v5
    title: Docs and suite consolidation
assumptions:
  - assumption: "Baseline is RED: 6 runtime file schemas declare capital-D Detail
      with additionalProperties:false (verified by :raw read, e.g.
      developer-output.schema.json:68); concerns.ts:72 reads existing?.Detail
      (verified by :raw read) so typecheck fails and longest-wins is dead;
      epic-saga-propagate and funnel-text-budget tests read .Detail (verified by
      :raw read). The context-pack 445-pass claim is contradicted by file bytes;
      gates go green only after m0 lands. TMPDIR=/tmp still required for the 2
      pre-existing head-guard failures."
    why: Reviewer fix verified on exact bytes this turn; earlier lowercase readings
      were a rendering artifact. Plan targets red-to-green via m0 before docs.
  - assumption: Behavior is frozen except Detail->detail normalization, prompts.ts
      dismiss-row filtering (mirroring human-stop) plus the dispositions.md row
      (prompt surface). Deviation history goes ONLY in ARCHITECTURE docs, never
      in agents/criteria prompt files. Legacy fingerprint migration (Q8) is
      retained as tested, harmless code; allowlist duplication (Q9) is locked by
      a contract test, not refactored.
    why: "Closure iteration: bounding change to the verified gaps avoids regressions
      and prompt debloat violations."
  - assumption: Open questions Q2/Q3/Q4/Q5/Q6/Q7/Q10 are resolved document-only via
      the plan ADRs; operator notified on the four deviations via
      awareness-plan-2-autonomous-halt-deviation,
      awareness-plan-3-epic-config-awareness,
      awareness-plan-4-funnel-triage-coverage-awareness, and
      awareness-plan-4-remarkable-threshold-exemption-accepted.
    disposition: human-awareness
    why: All are accepted-semantics documentation, not implementation gaps;
      architect decides, operator informed.
techDebt:
  - category: impacting
    description: Pre-existing head-guard failures when TMPDIR sits under
      .factory-runtime; every gate run needs the TMPDIR=/tmp workaround.
    id: td-tmpdir-split
    resolution: Run all gates with TMPDIR=/tmp; engine fix for the '/.factory' split
      is out of scope.
  - category: adjacent
    description: Unapplied spike-saga-commit reviewer optional nits (qualify
      epic-state precedence, prefix inline paths, scope removeWorktree claim,
      fold contextPack key). Consumers apply mentally.
    id: td-spike-nits
  - category: impacting
    description: Capital-D Detail in 6 runtime-bound file schemas rejects lowercase
      detail (review.schema.json reference-only, normalized for consistency);
      mergeConcern reads existing?.Detail so typecheck fails and longest-wins is
      dead; epic-saga and funnel tests read .Detail.
    id: td-detail-casing
    resolution: "Fix in schema-detail-normalize-v2: normalize schemas +
      concerns.ts:72 + all test reads; contract and longest-wins tests verify;
      docs-finish-v5 depends on it."
adrs:
  - context: agents/criteria/dispositions.md documents
      fix/optional/architect/human-* but not dismiss, while triagers are allowed
      dismiss and review/plan-review step prompts explain it ad hoc. Adding the
      row to the shared criteria file would leak it into non-triager prompts
      (e.g. QA) unless filtered.
    decision: Add one terse dismiss row + rule to dispositions.md (triager-only,
      reason required, kept on disk) AND extend formatDispositionsSection to
      filter dismiss rows/rules when the allowed set excludes dismiss, mirroring
      the existing human-stop filtering. QA-excludes/reviewer-includes render
      test locks it; prompts.test debloat budgets must pass.
    id: adr-dismiss-criteria-row
    title: Dismiss row in shared criteria with allowed-set filtering
  - context: Spec line 100 says autonomous consults the human only for the portion
      still blocked after everything unblocked is done; implementation halts
      immediately at plan time on a blocking ADR. Repo ADR
      adr-autonomous-immediate-halt.md and awareness item
      awareness-plan-2-autonomous-halt-deviation record this as accepted.
    decision: Keep immediate halt as the accepted deviation for closure;
      drain-then-block scheduling stays future work. docs-finish-v5 marks it
      explicitly in ARCHITECTURE §1 row 18 and §8.11 only;
      agents/criteria/human-involvement.md is prompt criteria and MUST NOT carry
      deviation history.
    id: adr-autonomous-immediate-halt
    title: Autonomous immediate halt accepted (restated)
  - context: ARCHITECTURE §5 claims epics inherit the parent task layer, but
      runTaskChild loads only the child task dir pipeline.yaml, so root
      humanInvolvement/concerns/reviewPolicy overrides do not reach epics. Repo
      ADR adr-epic-config-root-only.md and
      awareness-plan-3-epic-config-awareness record this; implementing
      inheritance would change config semantics for all tasks.
    decision: "Document-only: per-task selectability holds per task directory; epic
      children do not inherit the parent task layer. Record in the §1 row 18
      rewrite and corrected §5; no behavior change."
    id: adr-epic-config-root-only
    title: Epic config inheritance documented as deviation
  - context: Only plan-review routes architect output through plan-reviewer;
      architect concerns from consult/wave-report/closeup turns aggregate but
      stay open until an architect turn hydrates them or wave fallback runs. The
      simple flow has no review step and no waves, so its concerns are never
      triaged.
    decision: "Accept current coverage as the funnel semantic and document it as a
      known limitation in §1 row 18 and §8.11: plan/revise output is
      plan-reviewer-triaged; other architect output is covered by architect
      hydration + wave fallback; simple-task concerns stay open. No new reviewer
      step this iteration. Operator notified via
      awareness-plan-4-funnel-triage-coverage-awareness."
    id: adr-funnel-triage-coverage
    title: Non-plan/simple triage coverage documented as limitation
  - context: Routed rm-* remarkables always digest regardless of minDigestSeverity;
      ConcernCounts/state/status count c-* files only; digest mailbox entries
      persist with no archival rule.
    decision: "Document as accepted semantics in §8.11: remarkables are
      threshold-exempt digests (never blocking/halting, consistent with the
      low-noise digest directive), counts scope is c-* only, digest has no
      retention rule. Any gating/counting/retention change is future work.
      Operator notified via
      awareness-plan-4-remarkable-threshold-exemption-accepted."
    id: adr-remarkable-counts-semantics
    title: Remarkable digest exemption and counts scope accepted
  - context: isTriagerAgent returns true only for reviewer/plan-reviewer; close-up
      schemas carry no suggestions[] so close-up re-triage flows through
      concernResolutions + architect concernConfirms + wave fallback, with
      dismiss added to the resolution vocabulary. Repo ADR
      docs/adr/adr-closeup-no-suggestions-triage.md records this.
    decision: "Restate for plan traceability: close-ups are non-triagers; re-triage
      via resolutions + confirms + fallback. §1 row 18 and §8.11 cite
      docs/adr/adr-closeup-no-suggestions-triage.md; no behavior change."
    id: adr-closeup-no-suggestions-triage
    title: Close-ups removed from triager set; dismiss via resolutions (restated)
  - context: Propagated epic copies preserve child affects slugs while parent
      collectRoutedBlockers matches parent item slugs, so copies stay open by
      design and only forwarded q-epic questions block. Repo ADR
      docs/adr/adr-epic-push-condensed.md and epic-saga-propagate tests record
      this intent.
    decision: "Restate for plan traceability: saga architect resolves/steers
      propagated copies; epic-level blocking reaches the parent only via
      forwarded questions. §1 row 18 and §8.11 cite
      docs/adr/adr-epic-push-condensed.md; no behavior change."
    id: adr-saga-funnel-semantics
    title: Propagated copies open-only; questions block (restated)


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


--- Prior Close-up closeup-4.yaml ---
iteration: 4
status: next-iteration
summary: 'Iteration 4 delivered 1/3 milestones. Verified on exact file bytes:
  m1-dismiss-contract COMPLETE (dispositions.md dismiss row + rule; prompts.ts
  filters dismiss+human-stop by allowed set; QA/reviewer render behavior
  landed). m0-detail-normalize NOT delivered despite its item merging: all 6
  runtime schemas still declare capital-D "Detail" (verified
  developer-output.schema.json:68), concerns.ts merge guard still reads
  existing?.Detail (verified), so the lowercase contract is inverted and
  typecheck/longest-wins/full-suite scenarios cannot pass. m2-docs-gates content
  landed (§1 row 18 Implemented + 5 deviations verified; §8.11 + README +
  commentary + sentinels + allowlist agreement per audit) but its gate scenario
  is blocked on m0, and §8.11 claims longest-wins the code does not deliver.
  Iteration 5: one small red-to-green item (6 schemas + review.schema.json +
  merge guard + stale .Detail test reads + longest-wins/contract verification),
  then re-verify m2 gates with no further docs edits expected.'


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


--- Decision 024-item-prompts-dismiss-filter.yaml ---
id: decision-prompts-dismiss-filter-1794213525197
context: item
item: prompts-dismiss-filter
afterRecord: 003-develop-r1-a2
decision: retry-with-guidance
timestamp: 2026-11-09T08:38:45.197Z
rationale: "Both develop attempts failed on yield shape, not code: 'Agent output
  failed schema validation: /: must be object'. The diff shows the
  implementation landed (dispositions.md +2, prompts.ts +10/-9, prompts.test.ts
  +92/-6), so the work is likely done but the final yield was emitted as a bare
  string/diff instead of the required DeveloperOutputArtifact object. Retry
  needs zero code changes — only a correctly shaped yield."
text: "Retry develop as a yield-only round: make NO code changes (diff already
  implements the row + filter + test). Your entire job is to emit a valid
  DeveloperOutputArtifact OBJECT via the yield tool: { status: 'ok', summary:
  '<1-2 sentences on dismiss row + filter + QA/reviewer test + gates>',
  evidence: ['typecheck command + result', 'TMPDIR=/tmp bun test result'] }. Do
  NOT yield a bare string, a diff, or prose outside the object — that is exactly
  what failed twice ('/: must be object'). Before yielding, re-run cd
  plugins/software-factory && bun run typecheck and TMPDIR=/tmp bun test
  test/prompts.test.ts (full suite if quick) and quote results in evidence. If
  those fail, report status failed with the failure output instead of another
  malformed ok."
persist: true


--- Decision 025-item-docs-finish-v5.yaml ---
id: decision-docs-finish-v5-1794219418081
context: item
item: docs-finish-v5
afterRecord: 006-review-r2-a1
decision: retry-with-guidance
timestamp: 2026-11-09T10:16:58.081Z
rationale: "Single remaining FIX is a docs-sample inconsistency, fully
  diagnosed: README status sample shows 'dismissed 0' alongside a q-escalated
  id, which is unreachable (q-escalated-* is emitted only when a dismissed
  concern has source.escalated, triage.ts:103-104/117-118, so dismissed >= 1 is
  required); the sample id also uses an rm-* suffix where the router emits
  q-escalated-c-*. Two-line sample change, no test asserts the sample ids, no
  design question. One guided round closes it."
text: "Final round for docs-finish-v5: fix ONLY the README status sample (README
  ~L123-127). Replace the unreachable q-escalated-rm-... id with a reachable
  one: either q-escalated-c-<10-hex> (e.g. q-escalated-c-1a2b3c4d5e) AND change
  the counts line to dismissed 1, or show a remarkable digest as
  q-concern-rm-<10-hex> (remarkables route via concernMailboxId,
  triage.ts:117-119) with consistent counts. Keep all fingerprint suffixes 10
  lowercase hex chars. Do NOT touch code, tests, or any other docs; do NOT
  invent new ids elsewhere. Verify: grep the README sample block for consistency
  (dismissed count >= 1 iff a q-escalated id is shown), then TMPDIR=/tmp bun
  test on test/docs-concerns.test.ts and typecheck."
persist: false


## Context Pack
# Context Pack — concerns-funnel (Spec Item 18)

## 0. Snapshot

The intent asks to implement `docs/factory.v2.md` §18 in `plugins/software-factory` and update `docs/ARCHITECTURE.md` (§1 row), README and config commentary.

**The worktree already contains a complete item-18 implementation.** `docs/ARCHITECTURE.md:39` records item 18 as **Implemented** in §8.11 with five accepted deviations (`adr-epic-config-root-only`, `adr-closeup-no-suggestions-triage`, `adr-epic-push-condensed`, `adr-autonomous-immediate-halt`, `adr-funnel-triage-coverage`).

Verification performed in this session:

| Check | Command | Result |
|---|---|---|
| Tests | `cd plugins/software-factory && bun test` | **467 pass, 2 skip, 0 fail**, 469 tests / 71 files, 97.7 s |
| Types | `bun run typecheck` (`tsc --noEmit`) | clean, exit 0 |
| Focused funnel suites | `bun test test/engine/concerns-funnel.test.ts test/engine/reviewer-triage.test.ts test/docs-concerns.test.ts` | 47 pass, 0 fail, 5.5 s |

The 2 skips are the live-harness smoke suite gated by `FACTORY_LIVE_OMP=1` (`test/harness/smoke-live.test.ts:9-11`); no other skips exist in the repo.

**Planning implication:** the architect should treat the acceptance bullets as a traceability audit plus a small set of residual gaps (§5 below), not as a build-from-scratch plan. Any milestone that re-implements store/triage/routing would duplicate tested code.

### Acceptance map (spec `docs/factory.v2.md:89-103` → code → tests)

| Spec bullet | Implementation | Tests |
|---|---|---|
| `:90` structured `concerns[]` {kind, summary, detail, location?, severity, affects?} | `src/core/artifacts.ts:301-321`; producer schemas `config/schemas/developer-output.schema.json:61-78`, `plan.schema.json:134-...`, `decisions.schema.json:48-...`, `fact-finder-output.schema.json`, `wave-closeup.schema.json:35-...`, `plan-closeup.schema.json:27-...`, generated review schema `src/core/records/review-schema.ts:67-100` | `test/contracts/concern-schemas.test.ts`, `test/contracts/concern-artifact-types.test.ts` |
| `:91` aggregation under task folder, fingerprint ids, dedup, status, source record | `src/core/concerns.ts:50-168`, `171-249`, `391-408`; startup reconcile `src/core/engine.ts:381-394`; recovery commit `src/core/engine.ts:342-347` | `test/engine/concerns-funnel.test.ts`, `test/engine/hydration-fingerprint-caps.test.ts` |
| `:92` reviewer triage with review vocabulary + `dismiss`; architect output → plan-reviewer | `src/core/review-policy.ts:4-43`, `src/core/triage.ts:35-50`, `252-349`, `src/core/flows/step-runner.ts:261-275`, `src/core/flows/iteration.ts:506-568` | `test/engine/reviewer-triage.test.ts`, `test/engine/plan-reviewer-triage.test.ts`, `test/review-policy.test.ts` |
| `:93` routing blockers/architect/human-*/tech debt | `src/core/derive/task.ts:52-65`, `174-196`, `219-263`; `src/core/derive/item.ts:58-73`; `src/core/derive/wave.ts:47-57`; `src/core/plan/scheduler.ts:66-78`; `src/core/flows/iteration.ts:200-229`, `830-850`; `src/core/flows/consults.ts:319-421`; `src/core/triage.ts:93-136`; `src/core/flows/adrs.ts:46-71` | `test/engine/routing-blocker-derive.test.ts`, `routing-architect-consult.test.ts`, `routing-human-debt.test.ts`, `test/engine/human-router-severity.test.ts` |
| `:94` close-ups list/re-triage; architect resolves/carries; status/state counts | `src/core/flows/iteration.ts:1227-1337`; `src/core/concerns.ts:266-353`; `src/core/derive/task.ts:369-415`; `src/cli/status.ts:106-124` | `test/engine/closeup-lifecycle-resolve.test.ts`, `test/engine/state-concern-counts.test.ts`, `test/cli/status-concerns.test.ts` |
| `:95` configurable raise allowlist, dispositions, severity thresholds | `config/schemas/pipeline.schema.json:202-237`, `config/pipeline.default.yaml:359-437`, `src/core/concerns.ts:35-44`, `src/core/triage.ts:56-75`, `src/core/review-policy.ts:27-43` | `test/human-involvement-config.test.ts` |
| `:96` remarkable decisions same aggregation/triage | `src/core/artifacts.ts:323-327`; `src/core/concerns.ts:55`, `91-99`, `152-159`; hydration `src/core/triage.ts:200-231` | `test/engine/concerns-funnel.test.ts:713-745`, `human-router-severity.test.ts` |
| `:97` funnel with less detail per level, never more text than code | hydration caps `src/core/triage.ts:234-286` + `src/core/flows/step-runner.ts:429-449`; epic condensing `src/core/flows/epic-propagation.ts:52-58`, `141-185` | `test/engine/funnel-text-budget.test.ts`, `test/engine/epic-saga-propagate.test.ts` |
| `:98` blocking vs remarkable ADRs; digest never waits | `src/core/flows/adrs.ts:14-37`, `46-71`; plan-time halt `src/core/flows/iteration.ts:443-478` | `test/engine/adr-blocking-digest.test.ts` |
| `:99-102` `autonomous`/`principal`/`detailed` presets + prompt fragments, selectable per task | `config/pipeline.default.yaml:384-437`, `agents/criteria/human-involvement.md:1-28`, `src/core/prompts.ts:64-85`, `src/core/flows/step-runner.ts:421-427`, layering `src/core/config/loader.ts:92-102` | `test/human-involvement-config.test.ts:138-490` |
| `:103` fire-test mode switching, low-noise mailbox | operational; no unit test performs two `runTask` launches with a mode change | `docs/FIRE_TEST.md:43`, `:51` |

## 1. Module Map

All paths relative to `plugins/software-factory/`.

| Area | Files | Responsibility |
|---|---|---|
| Concern store | `src/core/concerns.ts` (408 lines) | Engine-owned store on the task branch: `c-*` / `rm-*` files, sha256 fingerprint identity, merge/dedup, legacy rename-merge, per-task mutex + one commit per mutation, triage application, close-up resolutions/confirmations, decision-level resolution, wave fallback, exact-id partition, startup reconcile. |
| Triage policy | `src/core/triage.ts` (349 lines) | Exact-id partition, severity policy + defaults, single human router, debt predicate, terse hydration shapes, byte-capped YAML renderer, `applyReviewTriage` orchestration. |
| Review policy | `src/core/review-policy.ts` (43 lines) | Triager set (`reviewer`, `plan-reviewer`) and per-agent allowed dispositions; `dismiss` auto-appended for triagers, filtered for everyone else. |
| Step pipeline | `src/core/flows/step-runner.ts` (923 lines) | `ingestStepConcerns` after every ok step artifact (`:193-323`), allowlist gate, schema generation (`:407-416`), prompt-var hydration (`:418-449`). |
| Iteration flow | `src/core/flows/iteration.ts` (1337 lines) | Plan-review triage never triggers revisions (`:506-568`), routed-blocker consults (`:179-229`, `:830-850`, `:927-931`), ADR persist + immediate halt (`:430-478`), wave close-up/architect report (`:1000-1100`), plan close-up + architect close-up (`:1227-1337`). |
| Concern consult | `src/core/flows/consults.ts` (421 lines) | `runConcernConsult` (`:319-421`): one architect turn per routed blocker, canonical `decisions/concern-<cid>.yaml`, existence is the idempotency guard, carries `concernResolution`. |
| Epic/saga funnel | `src/core/flows/epic-propagation.ts` (185 lines) | Child→parent push of open/routed concerns and open remarkables, `[epic]` prefix, 120-byte verbatim / 500-byte condensed payloads, per-record source `epic:<epic>/<record>`, `q-epic-*` blocked-question forwarding. |
| ADRs | `src/core/flows/adrs.ts` (72 lines) | Mode→disposition table, canonical ADR markdown, blocking task-parking question vs digest-only remarkable question. |
| Derived state | `src/core/derive/task.ts` (441), `derive/item.ts` (470), `derive/wave.ts` (121), `src/core/plan/scheduler.ts` (172) | Routed-blocker item blocking with transitive dependents, debt collection, concern counts materialized to `state.yaml`. |
| CLI | `src/cli/status.ts` (128 lines) | Concern counts line + `Blocking Questions` vs `Digest Questions` split, debt list. |
| Engine | `src/core/engine.ts` (795 lines) | Startup concern-store recovery/reconcile, epic child propagation + close-up in one commit, root steering mailbox loop. |
| Mailbox | `src/core/steer.ts` (188 lines) | `steer/tousertoreview/{id}.yaml`, stable ids with answer preservation, `questionBlocks` semantics. |
| Prompts/config | `src/core/prompts.ts` (598), `src/core/prompt-vars.ts` (171), `config/pipeline.default.yaml` (490), `config/schemas/pipeline.schema.json` | Mode-section filtering, disposition filtering, prompt-var matrix, shipped presets and closed config schema. |
| Agent fragments | `agents/steps/*.md`, `agents/criteria/{dispositions,human-involvement}.md`, `agents/_shared/dispositions.md` | Terse (~20-45 line) step fragments; concern/ADR/triage rules live in the per-step `## Open Concerns` sections. |
| Docs | `docs/ARCHITECTURE.md:39`, `:76-78`, `:193-205`, `:291-305`, `:330-364`, `:403`, `:414`, `:453`; `README.md:99-128` | §1 row, module map, task folder (`concerns/`), §8.7 dismiss row, §8.11 funnel contract, byte budgets, status output, test inventory. |

Dependency rule: core modules do not import the harness (`docs/ARCHITECTURE.md:61-88`); concern modules depend only on `artifacts.ts`, git commit/exec, records io, mutex and `steer.ts` (`src/core/concerns.ts:1-9`, `src/core/triage.ts:1-13`). `triage.ts` calls `concerns.ts` and `steer.ts`; `concerns.ts` deliberately does not import `triage.ts` (cycle note `src/core/flows/step-runner.ts:242-245`).

## 2. Key Interfaces & Signatures

### Concern payload and stored record (`src/core/artifacts.ts`)
```ts
// :303-321
type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
type ConcernSeverity = "low" | "medium" | "high";
type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";
interface Concern { id?: string; kind: ConcernKind; summary: string; detail: string;
  location?: { file: string; line?: number }; severity: ConcernSeverity; affects?: string[] }

// :323-327 RemarkableDecision { chosen: string; alternatives: string[]; why: string }
// :330-334 ConcernConfirms { id: string; confirm: "accept" | "reject"; note?: string }
// :337-341 ConcernResolution { id; action: "resolve" | "carry"; note? }
// :347-351 CloseupConcernResolution { id; action: "resolve" | "carry" | "propagate" | "dismiss"; note? }
// :353-364 ConcernSource { record; agent; epic?; step?; item?; iteration?; escalated?; lastSeen? }
// :366-372 PendingConcernResolution { action; note?; by; at }
// :375-384 StoredConcernArtifact extends Concern { id; status; disposition?; dismissReason?; source; pendingResolution?; createdAt; updatedAt }
// :386-393 ReviewDisposition = "fix" | "optional" | "architect" | "human-awareness" | "human-async" | "human-stop" | "dismiss"
```

Producer surfaces carrying the funnel fields:
- `ReviewArtifact` `src/core/artifacts.ts:406-412` (`suggestions`, `newConcerns`, `remarkable`)
- `DeveloperOutputArtifact` `:419-427`, `FactFinderOutputArtifact` `:429-437` (`concerns`, `remarkable`)
- `WaveCloseupArtifact` `:439-452` (`concerns`, `remarkable`, `concernResolutions`)
- `PlanCloseupArtifact` `:454-466` (`concerns`, `remarkable`, `concernConfirms`, `concernResolutions`)
- `DecisionArtifact` `:470-488` (`concerns`, `remarkable`, `concernConfirms`, `concernResolution`)
- `ReviewSuggestion` `:395-404` (`id`, `disposition`, `summary`, `detail`, `location`)
- `ConcernCounts` `:565-570`; `StateArtifact.concerns` `:572-583` (required field)

### Pipeline configuration (`src/core/artifacts.ts:108-143`)
```ts
interface PipelineConfig {
  humanInvolvement?: "autonomous" | "principal" | "detailed";
  concerns?: { raiseAllowlist?: string[]; minDigestSeverity?: ConcernSeverity; minBlockingSeverity?: ConcernSeverity };
  reviewPolicy?: { default?: string[]; allowedDispositions?: string[]; [agent: string]: string[] | undefined };
  // ...
}
```
Schema: `config/schemas/pipeline.schema.json:202-237` (closed `concerns` object; `reviewPolicy` allows per-agent arrays). Defaults: `config/pipeline.default.yaml:373-408`. Array replacement / `null` deletion semantics: `src/core/config/merge.ts:1-8`.

### Store API (`src/core/concerns.ts`)
```ts
concernFingerprint(c: ConcernInput): string                 // :60-62, sha256(kind, norm(summary), file, line), 10 hex, prefix "c-"
aggregateConcerns(ctx, concerns, remarkables?, opts?): Promise<StoredConcernArtifact[]>   // :124-168
listConcerns(taskDir) / listOpenConcerns(taskDir)           // :171-189
countConcerns(taskDir): Promise<ConcernCounts>              // :196-217, c-* only
listConcernIds(taskDir): Promise<string[]>                  // :220-230, includes rm-*
applyConcernTriage(ctx): Promise<StoredConcernArtifact[]>   // :252-263
applyCloseupResolutions(ctx)                                // :266-273, pending only
applyConcernConfirms(ctx)                                   // :282-306, accept/reject pending proposals
applyConcernResolution(ctx)                                 // :313-328, resolve | carry
applyWaveCloseupFallback(ctx)                               // :337-353, triage-less open concerns
partitionSuggestions(suggestions, concernIds)               // :356-364
reconcileConcerns(ctx)                                      // :391-408, rebuild from committed ok records
```

### Triage API (`src/core/triage.ts`)
```ts
partitionReviewSuggestions(suggestions, concernIds, isTriager)  // :35-50
resolveConcernSeverityPolicy(concerns?)                         // :67-75, defaults medium/high (:62-65)
routeHumanDisposition(ctx, suggestion, concern?)                 // :93-136, digest-only for rm-*, human-awareness, dismissed escalated; blocking only >= minBlockingSeverity
isDebtConcern(concern)                                           // :143-149
listHydratedConcerns(taskDir, consumer)                          // :219-231
hydrateStepConcerns(taskDir, {stepRole, consumer?, diffBytes?, taskDiffBytes?, inputBytes?}) // :234-247
renderConcernsYaml(records, maxBytes = 8000)                     // :254-286
applyReviewTriage(ctx)                                           // :293-349
```

### Review policy (`src/core/review-policy.ts`)
`BUILTIN_REVIEW_DISPOSITIONS = [fix, optional, architect, human-awareness, human-async]` (`:4-10`), `isTriagerAgent` (`:18-20`), `resolveReviewAllowed` (`:27-43`, precedence per-agent > default > legacy `allowedDispositions` > builtin; `dismiss` added for triagers, removed for non-triagers).

### ADR/epic/status
- `blockingAdrDisposition(mode)` `src/core/flows/adrs.ts:14-18`; `renderAdrMarkdown` `:21-37`; `persistAdrs` `:46-71`.
- `PropagateEpicConcernsOptions` `src/core/flows/epic-propagation.ts:26-33`; `propagateEpicConcerns` `:152-185`.
- `runConcernConsult` `src/core/flows/consults.ts:319`.
- `StepRunResult.triage?: ReviewTriageOutcome` `src/core/flows/step-runner.ts:105`.
- `collectRoutedBlockers` `src/core/derive/task.ts:52-65`; `withRoutedBlocking` `src/core/derive/item.ts:65-73`; `blockedByConcern` `src/core/plan/scheduler.ts:68-78`; `refreshStateYaml` `src/core/derive/task.ts:431-441`.
- `writeQuestion` `src/core/steer.ts:63`; `questionBlocks` `:117-124`.
- `formatHumanInvolvementCriteria` `src/core/prompts.ts:68-85`; `formatDispositionsSection` `:91-111`; `generateReviewSchema` `src/core/records/review-schema.ts:5-104`; `resolveStepSchema` `src/core/flows/step-runner.ts:111-179`.

## 3. Relevant Excerpts

### Identity, dedup and merge (`src/core/concerns.ts:49-99`)
- Normalization `norm = trim + collapse whitespace + lowercase` (`:49`); funnel budgets compare UTF-8 bytes (`:50-51`).
- Concern id: `c-` + first 10 hex of `sha256(JSON.stringify([kind, norm(summary), file|null, line|null]))` (`:53-62`). Remarkable id: `rm-` + `sha256([norm(chosen), sorted(alternatives)])` (`:55`).
- Merge rules: longest detail wins, highest severity wins, `affects` union/dedup/sort, status preserved, `escalated` sticky and set when an incoming severity exceeds the stored one (`:71-88`).
- Legacy pre-union files with the same kind/summary/location are rename-merged on raise (`:101-121`, deletion `:149`).
- Mutation is serialized by `KeyedMutex` keyed on `taskDir` and committed as one `factory: concerns <message>` commit (`:45-46`, `:232-249`).

### Reviewer triage (exact id only) (`src/core/triage.ts:35-50`, `252-263`)
```ts
if (!isTriager) return { triage: [], findings: [...suggestions], fixRequired: false };
const ids = new Set(concernIds);
const triage = suggestions.filter(s => ids.has(s.id));
// findings = the rest; fixRequired = triage.some(s => s.disposition === "fix")
```
`applyConcernTriage` refuses non-triagers, requires non-empty `detail` for `dismiss`, and writes `status: dismissed` + `dismissReason`, else `status: routed` + disposition (`src/core/concerns.ts:252-263`). The step-runner passes only ids that existed **before** the step, so a step cannot self-dismiss its own findings (`src/core/flows/step-runner.ts:233-240`).

### Human router (`src/core/triage.ts:93-136`)
`human-awareness`, `rm-*` remarkables and dismissed-escalated concerns are digest-only; `human-async`/`human-stop` block only at or above `minBlockingSeverity` and downgrade to `human-awareness` below it; nothing below `minDigestSeverity` is surfaced (`rm-*` is threshold-exempt). Mailbox ids are `q-concern-<concernId>` or `q-escalated-<concernId>`, so a re-raise does not duplicate a question and `writeQuestion` keeps an existing answered file (`src/core/steer.ts:99-106`).

### Ingest order after a step (`src/core/flows/step-runner.ts:193-322`)
1. Collect `concerns`+`newConcerns`, `remarkable`, `suggestions`, `concernResolutions`, `concernConfirms`, `concernResolution` (`:198-215`).
2. Gate raise by `source.agent` against the allowlist; a skip is journaled and the step stays ok (`:217-231`).
3. Capture pre-existing concern ids for exact-id triage (`:233-240`).
4. Pre-flight architect dismiss-confirmations that need a pending reason, before mutating anything (`:242-259`).
5. `aggregateConcerns` (`:260`) → `applyReviewTriage` (`:261-275`) → `applyCloseupResolutions` (`:276`) → decision-level `applyConcernResolution` only for `consult-concern-<id>`, `architect-closeup*`, `architect-wave-report*` (`:278-301`) → `applyConcernConfirms` + propagate-accepted (`:303-316`) → wave-close-up fallback (`:318-321`).
6. Called only when `finalStatus === "ok"` (`:841-861`); a `TriageValidationError` flips the step to error, other ingest failures are journaled and do not change step status (`:853-860`).

### Hydration caps — “never more text than the code it summarizes” (`src/core/triage.ts:234-247`)
```ts
cap = role in {review, qa}      ? min(diffBytes ?? 0, 2000)
    : role in {wave-close-up, plan-close-up} ? min(taskDiffBytes ?? 0, 2000)
    : min(inputBytes ?? 0, 500);
if (cap <= 0) return "";
```
`renderConcernsYaml` degrades in stages: full records → drop `affects` → summary limits 80/40/16/8/4/1 → shed trailing entries; default ceiling 8000 bytes (`:254-286`). Consumer sets: review/develop see open only; close-ups see open+routed; architect additionally sees escalated dismissed; every consumer sees open remarkables (`:219-231`). Prompt-var wiring: `step-runner.ts:429-449` (caller-supplied `concernsYaml` wins; close-up caps measure `git diff parent...HEAD`).

### Plan-review triage never requests revisions (`src/core/flows/iteration.ts:506-572`)
`knownConcernIds = listConcernIds(taskDir)` is captured before each round (`:512-514`); after the plan-reviewer turn, `partitionSuggestions` removes triage ids and only `findings` with `fix` can trigger an architect revision (`:561-572`). The plan-reviewer prompt receives `dispositionsCriteria` built from its allowed set, which includes `dismiss` (`:537-544`).

### Routed blocker → dependent items + architect consult (`src/core/derive/task.ts:52-65`, `src/core/flows/iteration.ts:200-229`)
`collectRoutedBlockers` selects `kind === blocker && status === routed && severity >= minBlockingSeverity` and returns `affects` slugs. `blockedByConcern` blocks only pending affected items and cascades over declared deps to a fixpoint (`src/core/plan/scheduler.ts:68-78`). In the act phase, `consultRoutedBlockers` runs once per routed blocker whose `affects` intersects the wave’s blocked set; the decision artifact `decisions/concern-<cid>.yaml` makes it restart-idempotent (`src/core/flows/consults.ts:319-421`).

### Close-up propose/confirm (`src/core/concerns.ts:266-306`, `337-353`)
Close-ups are non-triagers, so their `concernResolutions` are stored as `pendingResolution` only. The architect `concernConfirms` accepts (`resolve`→resolved, `carry`→routed/architect, `dismiss`→dismissed with pending note, `propagate`→clears local proposal) or rejects (clears proposal). `applyWaveCloseupFallback` only touches pre-existing open concerns with no pending resolution/disposition: tech-debt→`optional`, others→`architect`, blockers stay open, epic copies skipped (`:342-350`).

### Epic → saga condensing (`src/core/flows/epic-propagation.ts:35-58`, `141-185`)
Payloads ≤120 bytes stay verbatim; longer ones are truncated to `min(500, floor(bytes/2))` on UTF-8 boundaries; summary is prefixed `[epic]`; source becomes `epic:{epic}/{record}`; concerns are copied only when open/routed, remarkables only when open and only on unfiltered pushes; blocked child questions are forwarded with `blocks` remapped from `task` to the parent slug (`:97-128`). The push and the parent `child-closeup.yaml` share one lock and one commit (`src/core/engine.ts:266-290`).

### ADRs (`src/core/flows/adrs.ts:14-37`, `46-71`)
`autonomous` → blocking ADR uses `human-stop`; `principal`/`detailed` → `human-async`; remarkable ADRs always `human-awareness` with no `blocks`. Markdown is written only when `adrFolder` is configured; mailbox routing always runs. A blocking ADR parks a plan-time iteration before any wave (`src/core/flows/iteration.ts:461-471`).

### Modes and prompt fragments (`src/core/prompts.ts:64-85`, `config/pipeline.default.yaml:384-437`)
`formatHumanInvolvementCriteria` keeps only the active `## <mode>` section plus shared sections (the blocking table), dropping inactive mode headings. Shipped presets pair each mode with `minDigestSeverity`/`minBlockingSeverity`; those thresholds are separate keys, not derived from the mode.

### Counts and status (`src/core/derive/task.ts:369-395`, `src/cli/status.ts:106-124`)
`countConcerns` counts `c-*` files only and is written into `state.yaml` on every refresh (`refreshStateYaml` is called after every step, `src/core/flows/item-machine.ts:748`). `factory status` prints `Concerns: open N | dismissed N | routed N | resolved N`, then splits open mailbox entries into blocking vs digest and lists debt.

## 4. Existing Tests & Conventions

**Runner and helpers.** `bun test` (`bun:test`), 71 files. Engine behavior is exercised through `runAgentStep` / `runTask` against real temporary git repositories (`test/helpers/tmp-repo.ts:1-60`: `createTmpRepo`, deterministic git env) with `FakeHarness` scripted per step label (`src/harness/fake/fake-harness.ts:25-50`: `scriptOutcome(label, outcome)`, `scriptComplete(handler)`). Tests assert observable engine behavior — committed files, statuses, mailbox files, prompts, exit codes — not internal calls (ARCHITECTURE §13 `docs/ARCHITECTURE.md:451-454`).

**Funnel suites** (all present and passing):

| Suite | Focus |
|---|---|
| `test/engine/concerns-funnel.test.ts` | Schema write gate, fingerprint/dedup/merge, legacy migration, concurrency, producer wiring, reconcile, startup recovery, ingest failure keeps step ok. |
| `test/engine/reviewer-triage.test.ts` | Terse hydration, no `detail` leak, dismiss reason, exact-id partition, debt predicate, `fixRequired`, `q-concern` dedupe, non-triager QA no-op, engine blocking. |
| `test/engine/plan-reviewer-triage.test.ts` | Plan-concern hydration, dismiss/routed, architect-revise accumulation, triage ids never trigger revision, debt derivation. |
| `test/engine/closeup-lifecycle-resolve.test.ts` | Accept resolve/carry/propagate, reject, dismiss note validation, consult unblock, cross-emission drop, wave fallback; architect close-up emits `concernConfirms` (`:156-162`, `:253-259`, `:367-373`). |
| `test/engine/funnel-text-budget.test.ts` | UTF-8 byte budgets, git-diff caps, zero-diff caps, strict per-level condensation. |
| `test/engine/epic-saga-propagate.test.ts` | Open/routed copy with `[epic]`, condensing, restart idempotency, `q-epic-*`, saga architect hydration, failed-child propagation. |
| `test/engine/routing-blocker-derive.test.ts`, `routing-architect-consult.test.ts`, `routing-human-debt.test.ts` | Blocker→dependent blocking, one consult per blocker, debt routing. |
| `test/engine/human-router-severity.test.ts` | Single router, severity downgrades, digest-only, escalation, allowlist, exit codes. |
| `test/engine/adr-blocking-digest.test.ts` | ADR markdown, blocking halt, remarkable digest, mode table, no `adrFolder`. |
| `test/engine/state-concern-counts.test.ts`, `test/cli/status-concerns.test.ts` | `state.yaml` counts, zero/corrupt handling, CLI output split. |
| `test/human-involvement-config.test.ts` | Defaults, layer overrides + null deletion, schema closedness, shipped presets, criteria fragment selection at prompt time, triager prompt reach. |
| `test/contracts/concern-*.test.ts`, `state-concern-schema.test.ts` | Artifact type/schema contracts, `schema-detail-normalize` (detail/severity optionality). |
| `test/engine/hydration-fingerprint-caps.test.ts` | Caps, caller override, architect single cap, hydrated sets, remarkables, counts exclude remarkables, fingerprint identity/affects union, legacy rename. |
| `test/docs-concerns.test.ts` | Base-failing docs sentinels (16 assertions) for §1 row 18, §8.11 store/triage/close-ups/ADRs/modes/counts/caps/deviations, §3 modules, §5 config, §6.2 folder, §8.7 dismiss row, §10 budgets, §11 status, §13 suites, README, config commentary. |

**Conventions worth keeping.** New behavior tests should go through the engine with `FakeHarness`; docs changes are guarded by `test/docs-concerns.test.ts` which asserts exact needles inside `##` sections and YAML comment banners; any assertion added must be base-failing (its needle must not exist on the base tree) or it proves nothing.

## 5. Open Questions & Uncertainties

1. **Close-up confirmation prompt/engine mismatch (highest-value gap).** The engine expects the architect to settle close-up proposals with `concernConfirms` (`src/core/flows/step-runner.ts:303-316`, `src/core/concerns.ts:282-306`), but `agents/steps/architect-closeup.md:29` instructs `concernResolutions` (the proposal field) and nothing mentions confirms. `agents/steps/architect-wave-report.md:32` and `architect-resume.md:27` instruct neither, while `agents/steps/wave-close-up.md:26` emits proposals. A proposal the architect never confirms stays `pendingResolution` forever, and `applyWaveCloseupFallback` then skips it (`src/core/concerns.ts:347`). Decide whether to fix the fragments (cheap, in scope) or make ingest treat architect `concernResolutions` as confirms.

2. **Remarkable digest is triage-dependent.** `remarkable[]` becomes an open `rm-*` record (`src/core/concerns.ts:152-159`) and is hydrated to every consumer (`src/core/triage.ts:200-231`), but a mailbox digest is written only when a triager emits a suggestion whose id is an `rm-*` id with a human-* disposition (`src/core/triage.ts:98`, `:334-346`). Architect ADRs route automatically (`src/core/flows/adrs.ts:56-70`); worker remarkables do not. Spec `docs/factory.v2.md:98` says remarkable items are “reported (mailbox digest), never waiting”. Decide: auto-digest new remarkables above a threshold, or document reviewer-triage dependency explicitly.

3. **Epic mailbox isolation.** `runChildTask` accepts `rootTaskDir` (`src/core/engine.ts:221`, passed at `:737`) but never reads it; `processSteeringMailbox` is called only from root `runTask` (`src/core/engine.ts:432-440`) and writes to the task dir it is given (`src/core/steer.ts:90-93`). Child task dirs are `{childWt}/{orch}/{parent}/{epic}` (`src/core/engine.ts:234`), so `human-*` concerns raised inside an epic land in the epic mailbox, while `docs/ARCHITECTURE.md:309` states the active run (root or epic) polls the root mailbox. Blocked child questions are forwarded as `q-epic-*` (`src/core/flows/epic-propagation.ts:97-129`), but parent answers are not copied back down. Decide: wire child→root mailbox, or record as a sixth accepted deviation.

4. **Reviewer “condense” is prompt-only.** `agents/steps/review.md:23` asks reviewers to condense or dismiss stale concerns, but `applyConcernTriage` persists only status/disposition/reason (`src/core/concerns.ts:252-263`); stored `detail` is never rewritten. Condensation is realized only by hydration suppression (`src/core/triage.ts:151-165`, `:254-286`) and epic-copy truncation (`src/core/flows/epic-propagation.ts:52-58`). Decide whether the store should persist a reviewer-condensed summary/detail, or whether the byte-capped prompt view is the contract.

5. **Epic children do not inherit task config** (accepted deviation `adr-epic-config-root-only`, `docs/ARCHITECTURE.md:361`). `runChildTask` loads `pipelineFor(childTaskDir)` (`src/core/engine.ts:247`); the root `humanInvolvement`/`concerns`/`reviewPolicy` overrides do not reach epic children. If per-task mode switching must apply inside epics, this needs a code change, not docs.

6. **Triage coverage gaps are accepted** (`adr-funnel-triage-coverage`, `docs/ARCHITECTURE.md:360`): only plan generation is plan-reviewer-triaged; architect concerns from consult/wave-report/close-up turns aggregate but stay open until an architect turn hydrates them or the wave fallback runs; simple-task concerns have no reviewer/waves and stay open. Decide whether the iteration should narrow this or leave the deviation.

7. **Counts exclude remarkable decisions** (`adr-remarkable-counts-semantics`): `countConcerns` iterates `c-*` only (`src/core/concerns.ts:196-217`) and `factory status` prints only those (`src/cli/status.ts:106-108`). Digest entries also have no retention/archival rule (`docs/ARCHITECTURE.md:356`). Confirm this is acceptable for “state.yaml shows counts”.

8. **Mode presets and severity thresholds are only conventionally coupled.** `humanInvolvement` affects ADR disposition (`src/core/flows/adrs.ts:14-18`) and prompt criteria (`src/core/prompts.ts:64-85`); digests/blocking are governed by `concerns.minDigestSeverity`/`minBlockingSeverity`. The shipped presets copy both (`config/pipeline.default.yaml:410-429`), but switching only `humanInvolvement` leaves thresholds unchanged. Decide whether presets should be engine-derived.

9. **Static review schema and extra review agents.** `config/schemas/review.schema.json:22-42` still lists `dismiss` unconditionally; no `src/` code references it (tests only). Runtime schemas are generated per agent (`src/core/flows/step-runner.ts:117-128`, `src/core/records/review-schema.ts:5-12`). An extra agent configured with `output: review` does not match the hardcoded reviewer/qa/plan-reviewer branch and falls through to `${agent}.schema.json` → permissive fallback (`src/core/flows/step-runner.ts:159-178`), which can admit `dismiss` for a non-triager. Confirm no non-triager path can emit `dismiss`, or add a generic `output`-based schema mapping.

10. **Fire-test evidence is operational.** Spec `docs/factory.v2.md:103` requires switching modes via config between launches and a mailbox with only funnelled, confirmed, low-noise items. `docs/FIRE_TEST.md:43`, `:51` names this exact check, but no unit test performs two `runTask` launches with a mode change; evidence must come from the self-host launches.

11. **Pre-existing, not item-18: architect hydration default differs.** `src/core/flows/iteration.ts:279` uses `limits.hydrationBytes ?? 65536` while `src/core/loops.ts:24` and `config/pipeline.default.yaml:333` default to `40000`. The configured value wins in normal runs; only a config missing `hydrationBytes` hits the inconsistency. Do not fold this into item 18 unless the iteration is explicitly closing adjacent holes.


## Task Status
iteration: 5
amendments: 0
items:
  - schema-detail-normalize-v3 kind=dev wave=1 status=running outlineRef=schema-detail-normalize-v3
  - closeup-confirm-instructions kind=dev wave=2 status=pending outlineRef=closeup-confirm-instructions
waves: 1, 2
merged: (none)
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
