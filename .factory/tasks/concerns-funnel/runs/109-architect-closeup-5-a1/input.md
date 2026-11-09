# Step: Architect Close-Up

## Goal
Determine the final iteration outcome following the completeness audit by the plan close-up agent.

## Rules
- Exploration budget: ground decision in the plan close-up audit findings, task INTENT, and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)

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
  "iteration": 5,
  "remainingMilestones": [
    "m0-detail-normalize",
    "m1-confirm-instructions"
  ],
  "status": "next-iteration",
  "summary": "Iteration 5 delivered neither milestone. m0: all 6 runtime schemas still carry capital-D `Detail` (developer-output, plan-closeup, decisions, fact-finder-output, plan, wave-closeup :raw) plus review.schema.json newConcerns, so lowercase detail is rejected; concerns.ts mergeConcern guards on existing?.Detail (mixed capital guard/lowercase read) breaking longest-wins and typecheck against StoredConcernArtifact.detail; stale capital reads remain in epic-saga-propagate.test.ts:248/307/313/319 and schema-detail-normalize.test.ts:234/263. m1: architect-closeup.md still instructs concernResolutions (no Confirms, no dismiss note rule), architect-wave-report.md instructs neither; prompts.test.ts has no confirms-present/Resolutions-absent assertions; ARCHITECTURE §1 row 18 still says five deviations and §8.11 lists five bullets (epic-mailbox-isolation missing); docs/adr/adr-confirm-field-instructions, adr-epic-mailbox-isolation, adr-remarkable-digest-triage have no Decision paragraphs (grep Decision: no matches); docs-concerns.test.ts sentinels still expect five deviations.",
  "techDebt": [
    "td-detail-casing still open: 6 runtime schemas + review reference use capital-D Detail; concerns.ts:74 mixed-casing guard; stale capital reads in epic-saga and longest-wins tests",
    "m1 confirm instructions missing: architect-closeup/architect-wave-report final bullets unchanged; prompts.test.ts lacks confirms coverage",
    "traceability gap: ARCHITECTURE §1 row 18 + §8.11 still five deviations; 3 ADR stubs lack Decision paragraphs; docs-concerns sentinels not co-updated",
    "td-tmpdir-split: pre-existing head-guard failures need TMPDIR=/tmp",
    "td-spike-nits: unapplied spike-saga-commit reviewer nits"
  ]
}

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
- iteration (integer, required, min: 1)
- status (string, required, enum: ["complete","next-iteration","blocked"])
- summary (string, required)
- question (string, optional)
- completedMilestones (array of string, optional)
- remainingMilestones (array of string, optional)
- techDebt (array of string, optional)
