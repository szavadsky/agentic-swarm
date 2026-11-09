# Step: Architect Wave Report

## Goal
Evaluate the results of a completed execution wave, assess spike findings and accumulated debt, and decide the iteration path.

## Rules
- Exploration budget: evaluate wave progress from the current plan, wave report, spike findings, and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)

## 0. Snapshot (verified 2026-11-09)

- Repository: `plugins/software-factory` inside worktree `topic_concerns-funnel`; Bun 1.4.4; TypeScript ESM, no build step; deps only `ajv`, `ajv-formats`, `yaml` (`plugins/software-factory/package.json`).
- Baseline: `cd plugins/software-factory && bun test` → **441 pass, 2 skip, 0 fail** (443 tests / 69 files, 91.3 s).
- Worktree is clean except engine-owned `.factory/tasks/concerns-funnel/journal.ndjson` (not code).
- Acceptance definition: `docs/factory.v2.md:89-103` (item 18, concerns + remarkable decisions funnel, human-involvement modes).
- **Current state: item 18 is substantially implemented.** Store, triage, routing, close-up lifecycle, epic→saga propagation, ADRs, presets, status/state surfacing and prompts exist and are tested. The main visible remainder is documentation:
  - `docs/ARCHITECTURE.md:39` still marks item 18 as “**Deliberately not hand-built** … Current state: review dispositions (§8.7) and steering mailbox (§8.8) only.”
  - Neither `docs/ARCHITECTURE.md` (409 lines) nor `README.md` (122 lines) contains any concerns/funnel/human-involvement section (verified by grep; only hits are line 39 and the developer-output row at line 348).
- Prior iterations recorded their decisions as 14 terse ADRs in `docs/adr/` (3 lines each), directly relevant to the docs work: `adr-concern-store-taskwt.md`, `adr-triage-suggestions-dismiss.md`, `adr-routing-derived-state.md`, `adr-epic-push-condensed.md`, `adr-humaninvolvement-config.md`, `adr-human-router-single.md`, `adr-severity-policy-active.md`, `adr-hydration-single-cap.md`, `adr-funnel-text-budget.md`, `adr-fingerprint-affects-union.md`, `adr-prompt-fragment-matrix.md`, `adr-digest-mailbox.md`, `adr-closeup-lifecycle-resolved.md`, `adr-autonomous-immediate-halt.md`.

## 1. Module Map

| Path | Responsibility | Key refs |
|---|---|---|
| `src/core/concerns.ts` | Concern store: fingerprint identity, merge/dedup, one file per id under `{taskDir}/concerns/`, list/count, reviewer triage patches, close-up pending/confirm/resolve, wave fallback, reconcile from committed records. | `:35-44`, `:46`, `:58-60`, `:69-87`, `:122-167`, `:169-215`, `:250-261`, `:264-317`, `:326-342`, `:380-397` |
| `src/core/triage.ts` | Reviewer triage over `suggestions[]` by exact concern id; the single human-disposition router with severity thresholds and digest semantics; step-role hydration + byte-capped YAML rendering; debt predicate. | `:16-30`, `:35-50`, `:56-75`, `:93-136`, `:143-150`, `:152-165`, `:219-251`, `:254-291`, `:293-349` |
| `src/core/review-policy.ts` | Triager set (reviewer, plan-reviewer, wave/plan close-up) and allowed-disposition resolution; `dismiss` is added only for triagers, never for non-triagers. | `:4-12`, `:16-24`, `:30-46` |
| `src/core/flows/step-runner.ts` | Generic ingest of any step output into the concern store (`concerns`/`newConcerns`, `remarkable`, `suggestions`, `concernResolutions`, `concernConfirms`, `concernResolution`), allowlist gate, prompt-var hydration, schema selection. | `:194-306`, `:391-430` |
| `src/core/flows/item-machine.ts` | Per-step review wiring (`reviewAllowed`, `dispositionsCriteria`), raw human-* question write guarded for concern ids, blocking decision for concern-routed human dispositions. | `:630-650`, `:664-666`, `:712-740`, `:786-806` |
| `src/core/flows/iteration.ts` | Plan review triage partition (triage ids never request a revision), ADR persistence at plan/revise, autonomous blocking-ADR halt before waves, routed-blocker architect consults per wave. | `:200-229`, `:439-476`, `:514`, `:542-567`, `:600-628`, `:820-846` |
| `src/core/flows/consults.ts` | `runConcernConsult`: one architect consult per routed blocker; `decisions/concern-<cid>.yaml` is the idempotency guard and the direct resolution carrier. | `:297-370` |
| `src/core/flows/adrs.ts` | Blocking/non-blocking ADR table (`autonomous`→`human-stop`, `principal`/`detailed`→`human-async`), markdown rendering, mailbox routing (blocking question vs `human-awareness` digest). | `:8-19`, `:23-45`, `:46-72` |
| `src/core/flows/epic-propagation.ts` | Epic→saga push of open/routed concerns and open remarkables as condensed copies (verbatim ≤120 B; else ≤500 B and half size), blocked-question forwarding, idempotent merge. | `:26-38`, `:40-64`, `:97-130`, `:141-185` |
| `src/core/derive/task.ts` | Routed blockers (kind `blocker`, status `routed`, severity ≥ threshold) → blocked items + deps; debt collection incl. `isDebtConcern`; `state.yaml` concern counts. | `:52-65`, `:177-197`, `:219-265`, `:369-390`, `:431-440` |
| `src/core/derive/wave.ts`, `src/core/plan/scheduler.ts` | Blocked-by-concern fixpoint and transitive dependency cascade used by derive, waves and iteration. | `derive/wave.ts:27-57`, `plan/scheduler.ts:68-78` |
| `src/core/artifacts.ts` | Concern/remarkable/confirm/resolution/source/stored types, `ConcernCounts`, `StateArtifact`, pipeline config fields. | `:124-131`, `:301-378`, `:560-566`, `:568-582` |
| `src/cli/status.ts` | `factory status` concern counts + separate “Blocking Questions” / “Digest Questions” sections + debt list. | `:83-115`, `:107` |
| `config/pipeline.default.yaml` | Shipped `humanInvolvement: autonomous`, `concerns` block, commented `autonomous`/`principal`/`detailed` presets, blocking table, `criteria.human-involvement`, `reviewPolicy.default`. | `:370-376`, `:378-425`, `:440-456` |
| `config/schemas/*.schema.json` | Output contracts carrying concerns: `developer-output`, `review` (`newConcerns`), `plan` (`concerns`, `remarkable`, `adrs`), `decisions`, `fact-finder-output`, `plan-closeup` (+ `concernConfirms`, `concernResolutions`), `wave-closeup` (+ `concernResolutions`), `state` (`concerns` required). | see §2 |
| `agents/criteria/human-involvement.md` | Mode sections + shared ADR/concern blocking table, filtered to the active mode at render time. | `:1-30` |
| `agents/criteria/dispositions.md` | Review disposition criteria table (**no `dismiss` row**). | `:1-20` |
| `agents/steps/*.md` | Terse producer/triager instructions and `{{concernsYaml}}` sections; `review.md:19-24`, `plan-review.md:15`, `qa.md:33-35`, `develop.md:20-24`, `wave-close-up.md:21-24`, `architect-closeup.md:24-27`, `architect-plan.md:14,41`. | — |
| `test/**` | 18 concerns-related behavior/contract suites (see §4). | — |

## 2. Key Interfaces & Signatures

### 2.1 Types (`src/core/artifacts.ts`)

```ts
export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
export type ConcernSeverity = "low" | "medium" | "high";
export type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";

export interface Concern {
  id?: string; kind: ConcernKind; summary: string; detail: string;
  location?: { file: string; line?: number };
  severity: ConcernSeverity; affects?: string[];
}
export interface RemarkableDecision { chosen: string; alternatives: string[]; why: string; }
export interface ConcernConfirms { id: string; confirm: "accept" | "reject"; note?: string; }
export interface ConcernResolution { id: string; action: "resolve" | "carry"; note?: string; }
export interface CloseupConcernResolution { id: string; action: "resolve" | "carry" | "propagate"; note?: string; }
export interface ConcernSource { record: string; agent: string; epic?: string; step?: string; item?: string; iteration?: number; escalated?: boolean; lastSeen?: string; }
export interface PendingConcernResolution { action: "resolve" | "carry" | "propagate"; note?: string; by: string; at: string; }
export interface StoredConcernArtifact extends Concern {
  id: string; status: ConcernStatus; disposition?: ReviewDisposition; dismissReason?: string;
  source: ConcernSource; pendingResolution?: PendingConcernResolution;
  createdAt: string; updatedAt: string;
}
export interface ConcernCounts { open: number; dismissed: number; routed: number; resolved: number; }
```
`src/core/artifacts.ts:301-378`, `:560-566`; `StateArtifact.concerns` required (`:568-582`).

Pipeline config surface (`src/core/artifacts.ts:124-131`, schema `config/schemas/pipeline.schema.json:202-227`):

```ts
humanInvolvement?: "autonomous" | "principal" | "detailed";
concerns?: { raiseAllowlist?: string[]; minDigestSeverity?: ConcernSeverity; minBlockingSeverity?: ConcernSeverity };
reviewPolicy?: { default?: string[]; allowedDispositions?: string[]; [agent: string]: string[] | undefined };
```

### 2.2 Store API (`src/core/concerns.ts`)

```ts
export const DEFAULT_RAISE_ALLOWLIST = ["developer","fact-finder","architect","qa","reviewer","plan-reviewer","wave-close-up","plan-close-up"] as const;
export function severityAtLeast(severity: ConcernSeverity, min: ConcernSeverity): boolean;
export function concernFingerprint(c: ConcernInput): string;                 // c-<sha256[0..10]>
export async function aggregateConcerns(ctx, concerns, remarkables = [], opts?): Promise<StoredConcernArtifact[]>;
export async function listConcerns(taskDir): Promise<StoredConcernArtifact[]>;
export async function listOpenConcerns(taskDir): Promise<StoredConcernArtifact[]>;
export async function countConcerns(taskDir): Promise<ConcernCounts>;
export async function listConcernIds(taskDir): Promise<string[]>;
export async function applyConcernTriage(ctx: { suggestions; isTriager }): Promise<StoredConcernArtifact[]>;
export function applyCloseupResolutions(ctx: { resolutions; by }): Promise<StoredConcernArtifact[]>;
export function applyConcernConfirms(ctx: { confirms }): Promise<StoredConcernArtifact[]>;
export function applyConcernResolution(ctx: { resolution: {id; action: "resolve"|"carry"; note?}; by }): Promise<StoredConcernArtifact[]>;
export async function applyWaveCloseupFallback(ctx: { ids?: Iterable<string> }): Promise<StoredConcernArtifact[]>;
export function partitionSuggestions(suggestions, concernIds): { triage; findings };
export async function reconcileConcerns(ctx): Promise<StoredConcernArtifact[]>;  // rebuild from committed step records
```
Refs: `:35-44`, `:58-60`, `:122-167`, `:169-215`, `:218-228`, `:250-261`, `:264-317`, `:326-342`, `:345-353`, `:380-397`.

### 2.3 Triage / routing / hydration (`src/core/triage.ts`)

```ts
export interface TriagePartition { triage: ReviewSuggestion[]; findings: ReviewSuggestion[]; fixRequired: boolean }
export interface ReviewTriageOutcome extends TriagePartition { routed; dismissed; mailboxIds: string[] }
export class TriageValidationError extends Error {}
export function partitionReviewSuggestions(suggestions, concernIds, isTriager): TriagePartition;
export function concernMailboxId(concernId: string): string;                 // q-concern-<id>
export const DEFAULT_CONCERN_SEVERITY_POLICY = { minDigestSeverity: "medium", minBlockingSeverity: "high" };
export function resolveConcernSeverityPolicy(concerns?): ConcernSeverityPolicy;
export async function routeHumanDisposition(ctx, suggestion, concern?): Promise<string | undefined>;
export function isDebtConcern(c): boolean;
export async function listHydratedConcerns(taskDir, consumer): Promise<Array<Record<string, unknown>>>;
export async function hydrateStepConcerns(taskDir, request: { stepRole; inputBytes?; diffBytes?; taskDiffBytes?; consumer? }): Promise<string>;
export function renderConcernsYaml(records, maxBytes = 8000): string;
export async function applyReviewTriage(ctx): Promise<ReviewTriageOutcome>;
```
Refs: `:16-30`, `:32`, `:35-50`, `:52-54`, `:56-75`, `:93-136`, `:143-150`, `:219-251`, `:254-291`, `:293-349`.

### 2.4 Review policy (`src/core/review-policy.ts`)

```ts
export const BUILTIN_REVIEW_DISPOSITIONS = ["fix","optional","architect","human-awareness","human-async"] as const;
export function isTriagerAgent(agent: string): boolean;   // reviewer | plan-reviewer | wave-close-up | plan-close-up
export function resolveReviewAllowed(pipeline, agent, isTriager): string[]; // + dismiss iff triager
```
`:4-12`, `:16-24`, `:30-46`.

### 2.5 ADR + propagation APIs

```ts
// src/core/flows/adrs.ts
export function blockingAdrDisposition(mode): "human-stop" | "human-async";  // principal|detailed -> human-async
export function renderAdrMarkdown(adr: PlanAdr): string;                     // # title / ## Context / ## Decision / ## Consequences / ## Blocking
export async function persistAdrs(opts: { taskWt; taskDir; adrFolder?; adrs: PlanAdr[]; mode }): Promise<void>;

// src/core/flows/epic-propagation.ts
export interface PropagateEpicConcernsOptions { childTaskDir; parentTaskDir; parentWt; epic; concernIds?: Iterable<string> }
export async function propagateEpicConcerns(opts): Promise<void>;
```
`adrs.ts:8-72`; `epic-propagation.ts:26-185`.

### 2.6 Step-runner wiring

`runAgentStep` resolves `allowedDispositions = resolveReviewAllowed(pipeline, agent, isTriagerAgent(agent))` and the output schema (`step-runner.ts:391-396`), then hydrates `concernsYaml` when the fragment declares it and the caller did not supply it (`:400-430`): review/QA by `diffBytes`; wave/plan close-ups by the task-branch diff; everything else by the sum of non-excluded prompt vars. After a successful step, `ingestStepConcerns` (`:194-306`) is the single write path.

## 3. Relevant Excerpts

### 3.1 Identity and merge (fingerprint excludes `affects`; union merge)
`src/core/concerns.ts:51-60`, `:69-87`

```ts
const hash = (prefix, parts) => `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
export function concernFingerprint(c: ConcernInput): string {
  return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
}
// mergeConcern: detail = longer of existing/incoming; severity = max;
// escalated = prior escalated || incoming severity > existing;
// affects = union; status/disposition preserved; source.lastSeen advanced
```
Same code computes `rm-<sha>` for remarkables from `[chosen, alternatives]` (`:53`).

### 3.2 Aggregation commits to the task worktree
`src/core/concerns.ts:122-167`

```ts
export async function aggregateConcerns(ctx, concerns, remarkables = [], opts = {}) {
  // validates kind/summary/severity and remarkable chosen/alternatives/why
  // KeyedMutex per taskDir; one <id>.yaml per fingerprint; legacy rename-merge
  if (dirty && opts.commit !== false) {
    if (!ctx.repo) throw new Error("aggregateConcerns requires repo when committing");
    await commitAll(ctx.repo, ctx.taskWt, `factory: concerns ${ctx.source.record}`);
  }
}
```
Store location is `path.join(taskDir, "concerns")` (`:47`); item steps still write it on the task worktree (ADR `adr-concern-store-taskwt.md`). Startup commits a pre-existing `concerns/` before stray-dirt repair and calls `reconcileConcerns` (`src/core/engine.ts:342-346`, `:384-393`).

### 3.3 Dismiss keeps the file, requires a reason
`src/core/concerns.ts:250-261`

```ts
export async function applyConcernTriage(ctx) {
  if (!ctx.isTriager) return [];
  const ops = ctx.suggestions.map((s) => [s.id, (record) => s.disposition === "dismiss"
    ? { ...record, status: "dismissed", disposition: s.disposition, dismissReason: s.detail!.trim() }
    : { ...record, status: "routed", disposition: s.disposition, dismissReason: undefined }]);
  return mutate(ctx, ops, "factory: concerns triaged");
}
```
`applyReviewTriage` rejects `dismiss` without detail before any write (`triage.ts:304-310`) and routes human/remarkable dispositions through one router (`:317-345`).

### 3.4 Single human router with severity thresholds
`src/core/triage.ts:98-136`

```ts
const isRemarkable = suggestion.id.startsWith("rm-");
const isHuman = ["human-awareness","human-async","human-stop"].includes(suggestion.disposition);
const dismissedEscalated = suggestion.disposition === "dismiss" && Boolean(concern?.source?.escalated);
if (!isHuman && !isRemarkable && !dismissedEscalated) return undefined;
const digestOnly = isRemarkable || dismissedEscalated || suggestion.disposition === "human-awareness";
const blocking = !digestOnly && severityAtLeast(severity, ctx.minBlockingSeverity);
// below minDigestSeverity -> no mailbox entry (rm-* exempt)
// blocks: human-stop -> [item, task] / task; human-async -> [item] / task; others []
```
Mailbox ids are `q-concern-<concernId>` (`:52-54`) or `q-escalated-<id>` for a dismissed escalated concern (`:117-119`).

### 3.5 Hydration caps and rendering
`src/core/triage.ts:234-291`

```ts
const cap = role === "review" || role === "qa" ? Math.min(request.diffBytes ?? 0, 2000)
  : role === "wave-close-up" || role === "plan-close-up" ? Math.min(request.taskDiffBytes ?? 0, 2000)
  : Math.min(request.inputBytes ?? 0, 500);
// renderConcernsYaml: try full, then drop affects, then shrink summaries (80→1 chars), shedding trailing records
```
Consumers (`:219-232`): `review`/`develop`/`qa`/`plan-review` see open; `closeup`/`architect` also see routed; only `architect` sees dismissed-but-escalated. Terse records omit `detail` (`:152-165`).

### 3.6 Step ingest order (allowlist → existing ids → aggregate → triage → resolutions → confirms → fallback)
`src/core/flows/step-runner.ts:194-306`

```ts
const allowlist = opts.pipeline.concerns?.raiseAllowlist ?? DEFAULT_RAISE_ALLOWLIST;
if (concerns.length > 0 && !allowlist.includes(opts.source.agent)) {
  await appendJournal(opts.taskDir, { type: "concern_ingest_skipped", ... }); concerns = [];
}
// triage only ids that existed before this step, so new concerns cannot self-dismiss
const existing = <concerns/*.yaml basenames>;
await aggregateConcerns(...);
const triage = suggestions.length ? await applyReviewTriage({ ...ctx, concernIds: existing, isTriager: isTriagerAgent(agent), ... });
// concernResolution honored only for consult-concern-<id>, architect-closeup*, architect-wave-report*
// concernConfirms applied only for agent === "architect"; accepted propagate ids pushed to the parent task
// wave-close-up: applyWaveCloseupFallback({ ids: existing })
```

### 3.7 Item-machine guards (single-writer for concern-id human dispositions)
`src/core/flows/item-machine.ts:664-666`, `:712-740`, `:786-806`

```ts
const concernIds = new Set(await listConcernIds(taskDir));
// raw human-* question writer skips ids in concernIds
// hasHumanBlock: human-async/stop is decided by whether the router wrote an open blocking question
// hasIssues: any fix suggestion, or human-stop for a non-concern id
```

### 3.8 Routed blockers: derive blocks, iteration consults
`src/core/derive/task.ts:52-65`, `src/core/plan/scheduler.ts:68-78`, `src/core/flows/iteration.ts:200-229`, `:820-846`

```ts
export async function collectRoutedBlockers(taskDir, minBlockingSeverity = "high") {
  for (const concern of await listConcerns(taskDir)) {
    if (concern.kind !== "blocker" || concern.status !== "routed") continue;
    if (!severityAtLeast(concern.severity, minBlockingSeverity)) continue;
    for (const slug of concern.affects ?? []) affected.add(slug);
  }
}
// blockedByConcern seeds pending items named by routed blockers, then cascadePendingBlocked;
// consultRoutedBlockers runs one runConcernConsult per blocker affecting a blocked wave item.
```
A consult's decision file `decisions/concern-<cid>.yaml` is created once (`consults.ts:319-324`); `concernResolution` is applied on commit, so the next derive unblocks (ADR `adr-closeup-lifecycle-resolved.md`).

### 3.9 Tech debt derivation
`src/core/derive/task.ts:219-265`

```ts
if (plan?.techDebt) debtSet.add(d.description);
// decisions: accept-with-debt -> d.debt
for (const concern of await listConcerns(taskDir)) {
  if (!isDebtConcern(concern)) continue;
  const item = concern.source?.item ?? concern.affects?.[0];
  debtSet.add(item ? `[${item}] ${concern.summary}` : concern.summary);
}
// review suggestions disposition === "optional" -> `[<item>] <summary>`
```
`isDebtConcern` = non-open `tech-debt` concern or `optional` disposition (`triage.ts:143-150`); outstanding debt is passed to architect prompts as `debt` and printed by `factory status`.

### 3.10 ADRs at plan time
`src/core/flows/adrs.ts:8-19`, `:46-72`; `src/core/flows/iteration.ts:439-455`, `:469-476`, `:614-628`

```ts
export function blockingAdrDisposition(mode) {
  return mode === "principal" || mode === "detailed" ? "human-async" : "human-stop";
}
// persistAdrs: markdown into project.adrFolder when configured; always writes a question —
// blocking: disposition per mode + blocks:["task"]; remarkable: disposition "human-awareness" (no blocks)
// iteration: after plan/revise, if refreshStateYaml.status === "blocked" -> return blocked before waves
```
`project.adrFolder` defaults to `docs/adr` (`plugins/software-factory/config/project.template.yaml:11`).

### 3.11 Epic → saga propagation
`src/core/flows/epic-propagation.ts:40-64`, `:141-185`

```ts
function condenseText(text) {
  const size = utf8Bytes(text);
  return size <= VERBATIM_BYTES /*120*/ ? text
    : truncateUtf8(text, Math.min(CONDENSED_CAP_BYTES /*500*/, Math.floor(size / 2)));
}
// push: open|routed child concerns + open remarkables -> parent store via aggregateConcerns(commit:false)
// summary prefixed "[epic] "; source {epic, record: `epic:<epic>/<record>`, agent}; copies stay "open"
// questions with blocks forwarded as q-epic-<epic>-<id> with blocks remapped to the parent item/task
```
Called from `runTaskChild` after the child iteration, inside the parent close-up lock/commit (`src/core/engine.ts:271-292`).

### 3.12 Surfacing: status, state, close-ups, prompts
`src/cli/status.ts:107`; `src/core/derive/task.ts:369-390`

```ts
console.log(`Concerns: open ${derived.concerns.open} | dismissed ${...} | routed ${...} | resolved ${...}`);
// state.yaml: concerns: countConcerns(taskDir) (schema requires open/dismissed/routed/resolved)
```
`state.schema.json:1-15`, `:72-100`; close-up prompts carry `{{concernsYaml}}` and resolution fields (`agents/steps/wave-close-up.md:21-24`, `plan-close-up.md:24`, `architect-closeup.md:24-27`); architect/hydration consumers receive terse open/routed records (`triage.ts:219-232`).

### 3.13 Shipped config and presets
`config/pipeline.default.yaml:378-425`

```yaml
humanInvolvement: autonomous
concerns:
  raiseAllowlist: [developer, fact-finder, architect, qa, reviewer, plan-reviewer, wave-close-up, plan-close-up]
  minDigestSeverity: medium
  minBlockingSeverity: high
# Presets — copy the desired mode block into `.factory/pipeline.yaml` or a task `pipeline.yaml` override:
# humanInvolvement: principal   (+ minDigestSeverity: low, minBlockingSeverity: medium)
# humanInvolvement: detailed    (+ minDigestSeverity: low, minBlockingSeverity: low)
# ADR blocking table ...
```
Criteria mapping at `:440-456` (`human-involvement: agents/criteria/human-involvement.md`); mode filtering in `formatHumanInvolvementCriteria` (`src/core/prompts.ts:66-88`), dispositions filtering in `formatDispositionsSection` (`:90-113`).

## 4. Existing Tests & Conventions

- Runner: `bun test` (`package.json` scripts). Tests are **behavioral**: real temp git repos + `FakeHarness`; no mocks of the store.
- Helper `test/helpers/tmp-repo.ts:12-29` (`createTmpRepo`: `writeFile`, `commit`, `git`, `cleanup`) and `FakeHarness.scriptOutcome(label, outcome)` / `scriptComplete(handler)` (`src/harness/fake/fake-harness.ts:34-89`).
- Engine-level tests call `runTask`/`runAgentStep` with `PipelineConfig` + `ProjectConfig` literals and assert on YAML artifacts, journal events and `git status --porcelain === ""` (no stray files after commits), e.g. `test/engine/concerns-funnel.test.ts:37-124`, `:194-220`, `:347-467`.
- Contract tests (`test/contracts/`) compile schemas with `createAjv` and compare against `resolveStepSchema` output, asserting inline (no `$ref`) concern/remarkable definitions and strict enums (`test/contracts/concern-schemas.test.ts:10-25`).
- Tests cite the governing ADR id in their header comment (e.g. `funnel-text-budget.test.ts:1-22`, `hydration-fingerprint-caps.test.ts:30-36`, `closeup-lifecycle-resolve.test.ts:19-30`), which is the project convention for traceability.
- Concerns-related suites (18):

| Test | Focus |
|---|---|
| `test/engine/concerns-funnel.test.ts` | schema gate, fingerprint/merge, aggregation/commit, dismiss, close-up pending, remarkable, concurrency, producer wiring |
| `test/engine/reviewer-triage.test.ts` | item reviewer triage, allowed dispositions, debt predicate, mailbox ids |
| `test/engine/plan-reviewer-triage.test.ts` | architect plan concerns triaged by plan-reviewer; triage ids don't request revision |
| `test/engine/routing-blocker-derive.test.ts` | pure derive blocking of affected items + deps, no writes |
| `test/engine/routing-architect-consult.test.ts` | routed blocker → one architect consult before wave work |
| `test/engine/routing-human-debt.test.ts` | human-* routing and tech-debt to plan/status |
| `test/engine/closeup-lifecycle-resolve.test.ts` | propose/confirm/resolve/carry/propagate, consult unblocks, fallback |
| `test/engine/epic-saga-propagate.test.ts` | condensed epic→saga copies, byte caps, idempotency, question forwarding |
| `test/engine/hydration-fingerprint-caps.test.ts` | step-role caps, hydrated sets, fingerprint identity |
| `test/engine/funnel-text-budget.test.ts` | byte-budget contract (spike-finding test, helpers only) |
| `test/engine/human-router-severity.test.ts` | severity downgrade/suppression, digest vs blocking, escalated dismiss |
| `test/engine/state-concern-counts.test.ts` | state.yaml counts |
| `test/cli/status-concerns.test.ts` | status counts + blocking/digest sections |
| `test/contracts/concern-schemas.test.ts` | producer schema coverage |
| `test/contracts/concern-artifact-types.test.ts` | artifact type contract |
| `test/contracts/state-concern-schema.test.ts` | state schema contract |
| `test/human-involvement-config.test.ts` | mode config, criteria filtering, presets, per-task layering |
| `test/review-policy.test.ts` | allowed dispositions incl. triager-only `dismiss` |

- No test asserts documentation content (grep for `ARCHITECTURE` in `test/` only finds fixture files), so docs edits are not test-gated.

## 5. Implementation Status vs Intent (`docs/factory.v2.md:89-103`)

| Intent bullet | Status | Evidence |
|---|---|---|
| Structured `concerns[]` in agent outputs | **Done** for developer, fact-finder, architect (plan/decisions), close-ups; reviews use `newConcerns[]` | `config/schemas/developer-output.schema.json:61-90`, `fact-finder-output.schema.json:22-48`, `plan.schema.json:135-159`, `decisions.schema.json:48-72`, `review.schema.json:60-75`, `wave-closeup.schema.json:35-58`, `plan-closeup.schema.json:27-50` |
| Remarkable decisions/tradeoffs in structured output | **Done** (`remarkable: [{chosen, alternatives, why}]`, `rm-*` store ids) | schemas above; `concerns.ts:53`, `:89-97` |
| Aggregation under task folder, fingerprint ids, dedup, status, source record | **Done** | `concerns.ts:47-60`, `:122-167`, `:169-215`; statuses open/dismissed/routed/resolved |
| Reviewer triage with review vocabulary + `dismiss` (reason, kept) | **Done** for reviewer/plan-reviewer | `triage.ts:35-50`, `:293-349`; `review-policy.ts:30-46`; `concerns.ts:250-261` |
| blocker → dependent items blocked + architect consult | **Done** | `derive/task.ts:52-65`, `plan/scheduler.ts:68-78`, `iteration.ts:200-229`, `consults.ts:319-370` |
| `architect` → next architect turn | **Done** (routed status + hydration for architect/close-up consumers) | `triage.ts:219-232`, `step-runner.ts:404-430` |
| `human-*` → steer mailbox per policy | **Done** (severity thresholds; digest-only entries; blocks task/item) | `triage.ts:93-136`; `steer.ts:59-88` |
| tech debt → plan tech-debt list | **Done** (plan `techDebt`, accept-with-debt, optional suggestions, routed tech-debt concerns) | `derive/task.ts:219-265` |
| Wave/plan close-ups list concerns, re-triage, architect resolves/carries | **Done via `concernResolutions` + architect `concernConfirms` + wave fallback** (not via review dispositions; see open question 3) | `concerns.ts:264-317`, `:326-342`; `step-runner.ts:257-302`; close-up schemas |
| Funnel worker → reviewer → epic architect → saga architect → human, less detail per level, never more text than code | **Done** (hydration byte caps; epic copies condensed to ≤half/≤500 B; open copies) | `triage.ts:234-291`; `epic-propagation.ts:40-64`, `:141-185`; `funnel-text-budget.test.ts` |
| Saga architect reviews epic items, steers or propagates | **Done generically**: epic copies land in the parent (saga) task store, hydrated to its architect; steering via the root mailbox; proposals confirmed by the architect | `engine.ts:271-292`, `step-runner.ts:308-325`, `epic-propagation.ts:152-185` |
| Blocking vs non-blocking ADRs; remarkable digest never waits | **Done** (blocking question with `blocks:["task"]` vs `human-awareness`, no blocks) | `adrs.ts:8-72`; `iteration.ts:439-476`, `:614-628` |
| Presets `autonomous`/`principal`/`detailed` shipped as commented config examples, prompt fragments, per-task selectable | **Done** for config examples + fragment + root-task layer; **epic children do not inherit the parent task layer** (see open question 2) | `pipeline.default.yaml:378-425`; `prompts.ts:66-113`; `agents/criteria/human-involvement.md`; `loader.ts:92-100`; `run.ts:127-133`; `engine.ts:247` |
| Surfaced in close-ups, `factory status`, state.yaml counts | **Done** | `status.ts:107`; `derive/task.ts:369-390`; close-up prompts; `state.schema.json:72-100` |
| Update ARCHITECTURE (incl. §1 row 18), README, config commentary | **Not done** for ARCHITECTURE and README; config commentary already updated | `docs/ARCHITECTURE.md:39`; `README.md` (no hits); `pipeline.default.yaml:378-456` |
| Prompts terse / behavior tests only | **Done** | agent prompts ~20-30 lines; all 18 suites are behavior/contract tests |

## 6. Open Questions & Uncertainties

1. **Documentation gap is the dominant remaining work.** Concretely stale/missing:
   - `docs/ARCHITECTURE.md:39` — §1 row for item 18 says “deliberately not hand-built … current state: review dispositions and steering mailbox only”; must become an implemented row that records deviations.
   - `docs/ARCHITECTURE.md:61-85` (§3 module layout) omits `concerns.ts`, `triage.ts`, `review-policy.ts`, `flows/adrs.ts`, `flows/epic-propagation.ts`.
   - `docs/ARCHITECTURE.md:112-176` (§5) config sample omits `humanInvolvement`, `concerns`, `criteria.human-involvement`, triager-only `dismiss`; line 117 claims “epics inherit parent task layer” (mismatch — see item 2).
   - `docs/ARCHITECTURE.md:185-198` (§6.2 task folder) omits `concerns/`, `decisions/concern-<id>.yaml`, and `adrFolder` outputs.
   - `docs/ARCHITECTURE.md:282-295` (§8.7) disposition table omits `dismiss`, exact-id triage rules, severity thresholds and the human router; no section describes the store/funnel at all (natural placement: new §8.11 or §18; §8.8 ends at line 300).
   - `docs/ARCHITECTURE.md:339-357` (§10) output column omits `newConcerns[]`, `remarkable`, `concernResolutions`, `concernConfirms`, `adrs`; lines 352-353 claim close-ups output “wave-closeup + review” although their schemas have no `suggestions`.
   - `docs/ARCHITECTURE.md:404-406` (§13) test list does not mention the 18 concerns suites.
   - `README.md:71-86` (config hierarchy) has no per-task mode example; `README.md:99-105` (docs index) has no funnel/concerns pointer; README has zero mentions of concerns/humanInvolvement/ADR.
2. **Epic config inheritance mismatch (behavior).** ARCHITECTURE §5 says epics inherit the parent task layer (`docs/ARCHITECTURE.md:117`), but `runTaskChild` calls `pipelineFor(childTaskDir)` (`src/core/engine.ts:247`) and `pipelineFor` loads only `<taskDir>/pipeline.yaml` (`src/cli/run.ts:127-133`). Consequence: `humanInvolvement`, `concerns.*`, `reviewPolicy` set in a root task's `pipeline.yaml` do **not** apply inside its epics; “selectable per task” is root-only today. Decide: implement parent-layer inheritance (new test) or document the deviation in §1/§5/§18.
3. **Close-up disposition triage is unreachable.** `isTriagerAgent` returns true for `wave-close-up`/`plan-close-up` (`src/core/review-policy.ts:16-24`) and the ingest path would triage their `suggestions[]` (`step-runner.ts:243-257`), but `config/schemas/wave-closeup.schema.json` and `plan-closeup.schema.json` set `additionalProperties: false` and define no `suggestions`, so schema validation rejects any such output. Re-triage currently works through `concernResolutions` + architect `concernConfirms` + `applyWaveCloseupFallback`. Decide: add `suggestions` to close-up schemas (and prompt section) or drop close-ups from `isTriagerAgent` and correct §10/§8.7 wording.
4. **`dismiss` missing from the shared criteria file.** `agents/criteria/dispositions.md:1-20` documents fix/optional/architect/human-awareness/human-async/human-stop but not `dismiss`, while `formatDispositionsSection` advertises `dismiss` as allowed for triagers (`src/core/prompts.ts:90-113`), `review.md:21-23` / `plan-review.md:15` require `detail`, and `triage.ts:304-310` enforces it. Either add the row (docs/prompt fix) or reconsider the prompt instructions.
5. **Producer coverage is not literally “every agent output”.** `triage.schema.json` and `infra.schema.json` have no `concerns`/`remarkable`, and the default allowlist excludes triage/infra/pm (`concerns.ts:35-44`); a raising agent outside the allowlist is silently journaled as `concern_ingest_skipped` (`step-runner.ts:221-232`). The contract test deliberately lists only developer/fact-finder/plan/decisions/close-ups (`test/contracts/concern-schemas.test.ts:10-25`). Confirm and document the exclusion set, or extend schemas+allowlist.
6. **Zero-diff close-up hydration is empty.** Close-ups cap at `min(taskDiffBytes, 2000)` (`triage.ts:236-240`, `step-runner.ts:417-424`); a close-up on a branch with no diff since the parent tip gets cap 0 and therefore no open concerns to triage. The byte-budget spike documents a 0-byte budget case as valid (`test/engine/funnel-text-budget.test.ts:402-408`). Confirm whether a no-diff close-up should see a 500-byte input-based budget instead.
7. **Propagated epic concerns cannot block the epic item.** `concernCopy` preserves child `affects` slugs (`epic-propagation.ts:141-150`), while parent `collectRoutedBlockers` matches parent item slugs (`derive/task.ts:52-65`). The module header states copies stay open and only forwarded questions can block the parent (`epic-propagation.ts:20-25, 152-160`), and the test asserts that intent (`test/engine/epic-saga-propagate.test.ts:13-20`). Document this as the intended funnel semantic (saga architect resolves/steers; epic-level questions block).
8. **ADR format inconsistency.** `renderAdrMarkdown` writes `# title / ## Context / ## Decision / ## Consequences / ## Blocking` (`adrs.ts:23-45`), but the 14 existing `docs/adr/*.md` files are 3-line context-only notes (e.g. `docs/adr/adr-concern-store-taskwt.md`). The docs update should state the canonical generated format and whether the existing notes are historical.
9. **`autonomous` deviation.** Spec line 100 says autonomous blocks only “for the portion still blocked after everything unblocked is done”; implementation halts immediately at plan time on a blocking ADR (`iteration.ts:469-476`) and records this as accepted in `docs/adr/adr-autonomous-immediate-halt.md`. This deviation must appear in the §1 row / §18 section.
10. **`factory status` surfaces counts and mailbox digests, not the concern list.** Intent only requires counts; the current output prints counts plus blocking/digest question sections (`status.ts:83-115`) and debt. If the architect wants per-concern visibility, that is new behavior with a `status-concerns` test extension.
11. **No preflight validation of `concerns.raiseAllowlist` entries.** Only the pipeline JSON schema validates the shape (`pipeline.schema.json:207-227`); an unknown agent name is accepted and silently never matches `source.agent` (`step-runner.ts:219-232`). Consider a preflight warning or document it.
12. **Saga depth.** Epics are depth-1 only (`docs/ARCHITECTURE.md:279-281`, `flows` limits); “saga architect” is the root task architect and propagation is one level (`engine.ts:271-292`). Doc wording should not imply deeper recursion.

## 7. Recommendations for the Architect

1. Treat the store/triage/routing/funnel APIs as **frozen**: `concerns.ts`, `triage.ts`, `review-policy.ts`, `adrs.ts`, `epic-propagation.ts` are implemented and covered by 18 suites. Do not re-plan them; plan documentation and only the explicitly chosen consistency fixes.
2. Make the next iteration a documentation-closure milestone:
   - rewrite `docs/ARCHITECTURE.md:39` (§1 row 18) to “implemented” with the deviations from open questions 2/3/7/9;
   - add a funnel section (e.g. §8.11 “Concerns, remarkable decisions, ADRs, human-involvement modes”) covering store layout `{task}/concerns/{c-*,rm-*}.yaml`, fingerprint/dedup, statuses, triage contract (`suggestions[]` by exact id, triager-only `dismiss` with reason), routing table (blocker/architect/human-*/tech-debt), close-up propose→architect confirm, epic→saga condensing, ADR blocking table, presets + per-task layer;
   - update §3 module layout, §5 config sample, §6.2 task folder, §8.7 disposition table, §10 agent output column, §13 test list;
   - add a README section (“Concerns & human involvement”) with a per-task `pipeline.yaml` mode example and the `factory status` counts/digest output.
3. Add the missing `dismiss` row to `agents/criteria/dispositions.md` (one table row + rule) so the advertised vocabulary is fully documented; this is a prompt-surface fix, still terse.
4. Decide explicitly (and record in the plan ADRs) whether to fix or document the two behavioral mismatches: epic→parent task config inheritance and close-up `suggestions` triage. Each fix needs one behavior test near the existing suites; documenting needs one §1-row deviation sentence.
5. Keep behavior tests only; docs changes need no tests. For behavior changes, extend `test/human-involvement-config.test.ts` (config layering) and `test/engine/closeup-lifecycle-resolve.test.ts` (close-up triage) rather than new files.
6. Verification commands: `cd plugins/software-factory && bun test` (baseline 441 pass / 2 skip / 0 fail) and `bun run typecheck` (`tsc --noEmit`).`). Read code ONLY to verify a specific integration decision (few targeted reads, never broad scans). Translate new unknowns into spike outlines or plan amendments instead of in-turn investigation. Keep terse.
- Outcome options (yield `decision` matching `decisions.schema.json` with `context: "wave"`):
  - `continue`: wave succeeded; proceed to the next scheduled wave.
  - `amend`: revise remaining plan items based on wave learnings or spike results. Yield `outlines` = the NEW or REPLACEMENT PlanItemOutline entries for the amendment (same shape as plan `itemOutlines`: slug, kind, title, description?, milestoneId?, deps?, escalate?), PLUS optional `removeItemSlugs` naming PENDING (never merged/running) items the new items replace, PLUS `planDelta` prose describing the change for the PM. NEVER yield `amend` without `outlines`: an amendment with no new outlines is `continue`.
  - `end-iteration`: halt remaining waves early and transition directly to plan close-up (e.g. goal accomplished early or severe pivot required).
- When an amendment versions or replaces an item (for example a *-v2 copy superseding the original), include the stale original slug in `removeItemSlugs` so the pending original does not linger and run redundantly.
- Integrate spike findings: use `findings.md` and PoC results from finished spikes to inform subsequent item outlines.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.

## Current Plan
{
  "iteration": 3,
  "milestones": [
    {
      "id": "m1-contracts-consistency",
      "title": "Contracts consistency",
      "scenarios": [
        "Given the 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup incl architect-closeup, wave-closeup) plus reference review schema When test/contracts/concern-schemas.test.ts runs Then lowercase detail validates and capital-D Detail is rejected",
        "Given a stored concern with 200-byte detail re-emitted with 20-byte detail When aggregateConcerns merges Then the stored 200-byte detail survives",
        "Given composed resolveReviewAllowed(p,a,isTriagerAgent(a)) for wave-close-up/plan-close-up When resolved Then the allowed set excludes dismiss and the triager set equals {reviewer,plan-reviewer}",
        "Given a pending dismiss proposal with note plus architect accept When ingest runs Then the concern becomes dismissed with dismissReason equal to the trimmed note, disposition dismiss, and pending cleared",
        "Given a pending dismiss proposal without note plus architect accept When ingest runs Then the step errors with TriageValidationError and status plus pending are preserved with no partial transitions",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass with no regressions"
      ],
      "directionalInterfaces": [
        "step-runner (caller) validates producer outputs against the 6 runtime file schemas (callee contract: decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup): lowercase detail accepted, capital-D Detail rejected with step error before any store write; aggregateConcerns/mergeConcern read lowercase detail with longest-wins",
        "prompts/step-runner/item-machine (callers) consume composed resolveReviewAllowed(p,a,isTriagerAgent(a)) (callee): triager set {reviewer,plan-reviewer} get dismiss; wave-close-up/plan-close-up return false so dismiss excluded; close-up schemas carry no suggestions[] so re-triage honored solely via concernResolutions + architect concernConfirms + wave fallback",
        "ingestStepConcerns (caller) pre-flights then calls applyConcernConfirms (callee, never throws TriageValidationError): every accept on pending dismiss requires non-empty pending.note else TriageValidationError before any mutate (all statuses+pendings preserved); accept+dismiss -> dismissed + disposition dismiss + dismissReason=pending.note trimmed + pending cleared; fallback never assigns dismiss, kind=blocker stays open"
      ]
    },
    {
      "id": "m2-docs-gates",
      "title": "Docs and gates",
      "scenarios": [
        "Given ARCHITECTURE §1 row 18 When read Then it records item 18 implemented with the epic-config, close-up-dismiss, saga-semantics, and immediate-halt deviations and no 'Deliberately not hand-built'",
        "Given ARCHITECTURE §8.11 When read Then it documents store layout, fingerprint/dedup, remarkable aggregation/triage, triage contract, routing table, close-up propose-confirm incl dismiss, epic condensing, ADR blocking table, presets, and the 4 deviations",
        "Given dispositions.md and rendered prompts When checked Then a terse dismiss row (reason required, kept) exists, the QA prompt excludes it while the reviewer prompt includes it, and prompts.test debloat budgets pass",
        "Given README, pipeline.default.yaml, and human-involvement.md When read Then README shows per-task principal (low/medium) and detailed (low/low) examples plus status counts/digest output, commentary documents the fragment->agent mapping (developer covers develop/poc/test-assumptions/test-first/simple-implement/fix-round; fact-finder covers research; architect covers architect-*) with medium/high defaults, and the immediate-halt deviation is noted",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "directionalInterfaces": [
        "item-machine/iteration (callers) -> formatDispositionsSection(criteria, allowed) (callee): when allowed excludes dismiss, dismiss rows/rules are filtered from criteria text (QA prompt); when allowed includes dismiss, rows are kept (reviewer prompt); mirrors existing human-stop filtering"
      ]
    }
  ],
  "itemOutlines": [
    {
      "slug": "schema-detail-normalize",
      "kind": "story",
      "title": "Lowercase detail in producer schemas + merge fix",
      "description": "Normalize concern Detail->lowercase detail in 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) + reference-only review.schema.json for consistency. One-line TS fix concerns.ts:72 (existing?.Detail -> existing?.detail). Fix 3 test reads epic-saga-propagate.test.ts:307/313/319 to .detail. Tests: contract suites (lowercase passes, capital-D rejected) + longest-wins behavior test (200-byte stored survives 20-byte re-emit). triage/infra/pm-edit untouched. Verify typecheck + TMPDIR=/tmp bun test.",
      "milestoneId": "m1-contracts-consistency",
      "deps": [],
      "prodBudgetHint": 25
    },
    {
      "slug": "closeup-triager-cleanup",
      "kind": "story",
      "title": "Close-up triager cleanup + dismiss resolutions",
      "description": "Per adr-closeup-no-suggestions-triage: drop wave-close-up/plan-close-up from isTriagerAgent; add dismiss to CloseupConcernResolution/PendingConcernResolution (artifacts.ts) + local ConcernResolution (concerns.ts:16) + wave/plan-closeup schema action enums; ingestStepConcerns pre-flights accept-on-dismiss (non-empty pending.note else TriageValidationError, no writes); applyConcernConfirms accept+dismiss -> dismissed + disposition dismiss + dismissReason=pending.note trimmed + pending cleared; fallback unchanged. Tests: review-policy composed triager-set exclusion, closeup-lifecycle dismiss accept/error cases, closeup dismiss enum contract case. Verify typecheck + targeted suites + full gates.",
      "milestoneId": "m1-contracts-consistency",
      "deps": [],
      "prodBudgetHint": 70
    },
    {
      "slug": "docs-finish-v4",
      "kind": "story",
      "title": "Docs and suite consolidation",
      "description": "Docs closure over final landed behavior (source: context-pack §6 Q1 deltas + Q2/Q3/Q7/Q9 deviations). ARCHITECTURE: §1 row18 implemented + 4 deviations; §3 add concerns/triage/review-policy/adrs/epic-propagation modules; §5 config sample + fix line-117 inheritance claim to root-only; §6.2 add concerns/, decisions/concern-<id>.yaml, adrFolder; §8.7 dismiss + exact-id triage + thresholds + router; new §8.11 (store, fingerprint/dedup, remarkable aggregation/triage, triage contract, routing table, close-up propose-confirm incl dismiss, epic condensing, ADR table, presets); §10 outputs + fix close-up review claim; §13 18 suites; canonical ADR format vs historical notes. README Concerns section (principal low/medium, detailed low/low, status output). dispositions.md terse dismiss row. prompts.ts dismiss-row filter (mirror human-stop) + QA-excludes/reviewer-includes test + prompts.test debloat budgets (terse row; bump only if measured over). human-involvement.md + §8.11 halt note. pipeline commentary mapping + medium/high. Final gates green.",
      "milestoneId": "m2-docs-gates",
      "deps": [
        "closeup-triager-cleanup",
        "schema-detail-normalize"
      ],
      "prodBudgetHint": 115
    }
  ],
  "assumptions": [
    {
      "assumption": "Baseline is RED (not green): typecheck fails on concerns.ts:72 capital-D read, test/contracts/concern-schemas.test.ts fails asserting lowercase detail against capital-D schemas, and test/engine/epic-saga-propagate.test.ts:307/313/319 read .Detail (undefined at runtime). Gates go green only after m1 lands. TMPDIR=/tmp is still required for the 2 pre-existing head-guard failures.",
      "why": "Reviewer-verified red on 3 fronts; plan targets red-to-green closure in this iteration."
    },
    {
      "assumption": "Store/triage/routing/funnel/propagation behavior is frozen except the three scoped fixes: concerns.ts:72 lowercase read, close-up dismiss-via-resolutions with ingest pre-flight, and prompts.ts dismiss-row filtering.",
      "why": "18 behavior/contract suites cover the implementation; bounding iteration 3 to the reviewed gaps avoids regressions."
    },
    {
      "assumption": "Autonomous immediate-halt deviation stands as accepted; operator already notified via awareness-plan-2-autonomous-halt-deviation.",
      "why": "Decided in iteration 2 planning; iteration 3 only documents it."
    },
    {
      "assumption": "Epic config root-only deviation accepted as document-only; operator notified via open awareness item awareness-plan-3-epic-config-awareness.",
      "why": "Operators setting mode once at root would otherwise be surprised; architect decides, operator informed.",
      "disposition": "human-awareness"
    }
  ],
  "techDebt": [
    {
      "id": "td-tmpdir-split",
      "description": "Pre-existing head-guard failures when TMPDIR sits under .factory-runtime. Baseline red; green with TMPDIR=/tmp. Out of scope.",
      "category": "adjacent"
    },
    {
      "id": "td-spike-nits",
      "description": "Unapplied spike-saga-commit reviewer optional nits (qualify epic-state precedence, prefix inline paths, scope removeWorktree claim, fold contextPack key). Consumers apply mentally.",
      "category": "adjacent"
    },
    {
      "id": "td-detail-casing",
      "description": "Capital-D Detail in 6 runtime-bound file schemas rejects lowercase detail (review.schema.json reference-only, normalized for consistency); mergeConcern reads existing?.Detail so longest-wins never applies and typecheck fails; 3 epic-saga-propagate test reads use .Detail.",
      "category": "impacting",
      "resolution": "Fix in schema-detail-normalize: normalize schemas + concerns.ts:72 + 3 test reads; contract and longest-wins tests verify."
    },
    {
      "id": "td-closeup-triager-dead",
      "description": "wave/plan-close-up listed as triagers though close-up schemas reject suggestions[], advertising an unreachable dismiss path; close-up re-triage has no dismiss vocabulary.",
      "category": "impacting",
      "resolution": "Fix in closeup-triager-cleanup: drop close-ups from isTriagerAgent, add dismiss to resolutions with ingest pre-flight and accept semantics."
    }
  ],
  "adrs": [
    {
      "id": "adr-epic-config-root-only",
      "title": "Epic config inheritance documented as deviation",
      "context": "ARCHITECTURE §5 claims epics inherit the parent task layer, but runTaskChild loads only the child task dir pipeline.yaml, so humanInvolvement/concerns/reviewPolicy set at root do not apply inside epics. Implementing parent-layer inheritance would change config loading semantics for all tasks, beyond item-18 closure scope.",
      "decision": "Document the deviation: per-task selectability holds per task directory (each epic child has its own pipeline.yaml), but epic children do not inherit the parent task layer. Record in the §1 row 18 rewrite and §5; no behavior change. Operator notified via open awareness item awareness-plan-3-epic-config-awareness."
    },
    {
      "id": "adr-closeup-no-suggestions-triage",
      "title": "Close-ups removed from triager set; dismiss via resolutions",
      "context": "isTriagerAgent returns true for wave/plan-close-up and ingest would triage their suggestions[], but both close-up schemas set additionalProperties:false without a suggestions field, so the path is unreachable; real re-triage flows through concernResolutions + architect concernConfirms + wave fallback. Removing close-ups from the triager set would leave close-up re-triage with no dismiss path (resolutions allow only resolve/carry/propagate).",
      "decision": "Drop wave-close-up/plan-close-up from isTriagerAgent AND add dismiss to the close-up path: CloseupConcernResolution + PendingConcernResolution (artifacts.ts) + local ConcernResolution (concerns.ts:16) + wave/plan-closeup schema action enums gain dismiss. ingestStepConcerns pre-flights: before any mutate, every accept confirm whose pending.action==dismiss must have non-empty pending.note else it throws TriageValidationError (step errors; all statuses+pendings preserved, no partial transitions); applyConcernConfirms itself never throws TriageValidationError (avoids concerns<->triage cycle and in-mutate partial writes). accept+dismiss -> dismissed + disposition dismiss + dismissReason=pending.note trimmed + pending cleared. Wave fallback never assigns dismiss and leaves kind=blocker open."
    },
    {
      "id": "adr-saga-funnel-semantics",
      "title": "Propagated copies open-only; questions block",
      "context": "Propagated epic copies preserve child affects slugs while parent collectRoutedBlockers matches parent item slugs, so copies can never derived-block the parent; copies stay open by design and only forwarded q-epic questions block (module header + epic-saga-propagate tests assert this intent).",
      "decision": "Document as the intended funnel semantic in §1 row 18 and §8.11: the saga architect resolves/steers propagated copies; epic-level blocking reaches the parent only via forwarded questions. No behavior change."
    },
    {
      "id": "adr-autonomous-immediate-halt",
      "title": "Autonomous immediate halt accepted (restated)",
      "context": "Spec line 100 says autonomous blocks only for the portion still blocked after everything unblocked is done, but iteration.ts halts immediately at plan time on a blocking ADR. Prior ADR docs/adr/adr-autonomous-immediate-halt.md records this as accepted with operator awareness item awareness-plan-2-autonomous-halt-deviation.",
      "decision": "Restate and keep the accepted deviation for closure: immediate halt stands; drain-then-block scheduling stays future work. docs-finish-v4 marks it explicitly in ARCHITECTURE §8.11 and agents/criteria/human-involvement.md."
    }
  ]
}

## Wave Report
{
  "blockedItems": [],
  "debt": [
    "schema-detail-normalize not yet merged: capital-D Detail drift (developer-output.schema.json etc.) still open; item retrying in test-first per consult retry-with-guidance after two yield-shape omissions (missing target field), no code defect.",
    "Reviewer optional nits on closeup-triager-cleanup (all disposition optional): reuse pre-flight pending map instead of re-listing store in step-runner.ts propagate scan (double I/O); clarify pre-flight comment wording (accept-without-note vs confirm=reject); no-op dismiss confirm still bumps updatedAt + commits (deep-equal short-circuit is future work).",
    "docs-finish-v4 (wave 2) gated on closeup-triager-cleanup + schema-detail-normalize; cannot start until schema item merges."
  ],
  "failedItems": [],
  "iteration": 3,
  "mergedItems": [
    "closeup-triager-cleanup"
  ],
  "recommendations": [
    "Continue schema-detail-normalize with the consult guidance (yield target with exact expectRed test names, test-file-only scope), then merge and proceed to wave 2 docs-finish-v4.",
    "Keep TMPDIR=/tmp for gate runs per infra notes to avoid the pre-existing head-guard TMPDIR failures.",
    "Optionally fold the three reviewer optional nits (pending-map reuse, comment wording) into a later cleanup; none block this wave."
  ],
  "status": "complete",
  "summary": "Iteration 3 wave 1 closed with closeup-triager-cleanup merged (sha 0499173, review approved, no conflicts). Tree hygiene clean: git status shows only the engine-managed journal.ndjson modification, no untracked junk, and no merge-conflict markers in source (precise ^<<<<<<< / ^======= / ^>>>>>>> scan outside .factory/node_modules found no matches; ===== hits are bun-test divider lines inside .factory logs). Gate diff vs baseline: typecheck pass->pass green (matches baseline), test fail->pass IMPROVED (was failing at baseline on 2 head-guard TMPDIR tests) — zero regressions. Companion wave-1 item schema-detail-normalize did not merge this wave but is not failed/blocked: it is retrying in test-first per architect consult retry-with-guidance (both rejections were yield-shape omissions of the target field, not code problems) and carries forward; wave-2 docs-finish-v4 remains correctly gated on it.",
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


## Context Pack
# Context Pack — concerns-funnel (Spec Item 18)

## 0. Snapshot (verified 2026-11-09)

- Repository: `plugins/software-factory` inside worktree `topic_concerns-funnel`; Bun 1.4.4; TypeScript ESM, no build step; deps only `ajv`, `ajv-formats`, `yaml` (`plugins/software-factory/package.json`).
- Baseline: `cd plugins/software-factory && bun test` → **441 pass, 2 skip, 0 fail** (443 tests / 69 files, 91.3 s).
- Worktree is clean except engine-owned `.factory/tasks/concerns-funnel/journal.ndjson` (not code).
- Acceptance definition: `docs/factory.v2.md:89-103` (item 18, concerns + remarkable decisions funnel, human-involvement modes).
- **Current state: item 18 is substantially implemented.** Store, triage, routing, close-up lifecycle, epic→saga propagation, ADRs, presets, status/state surfacing and prompts exist and are tested. The main visible remainder is documentation:
  - `docs/ARCHITECTURE.md:39` still marks item 18 as “**Deliberately not hand-built** … Current state: review dispositions (§8.7) and steering mailbox (§8.8) only.”
  - Neither `docs/ARCHITECTURE.md` (409 lines) nor `README.md` (122 lines) contains any concerns/funnel/human-involvement section (verified by grep; only hits are line 39 and the developer-output row at line 348).
- Prior iterations recorded their decisions as 14 terse ADRs in `docs/adr/` (3 lines each), directly relevant to the docs work: `adr-concern-store-taskwt.md`, `adr-triage-suggestions-dismiss.md`, `adr-routing-derived-state.md`, `adr-epic-push-condensed.md`, `adr-humaninvolvement-config.md`, `adr-human-router-single.md`, `adr-severity-policy-active.md`, `adr-hydration-single-cap.md`, `adr-funnel-text-budget.md`, `adr-fingerprint-affects-union.md`, `adr-prompt-fragment-matrix.md`, `adr-digest-mailbox.md`, `adr-closeup-lifecycle-resolved.md`, `adr-autonomous-immediate-halt.md`.

## 1. Module Map

| Path | Responsibility | Key refs |
|---|---|---|
| `src/core/concerns.ts` | Concern store: fingerprint identity, merge/dedup, one file per id under `{taskDir}/concerns/`, list/count, reviewer triage patches, close-up pending/confirm/resolve, wave fallback, reconcile from committed records. | `:35-44`, `:46`, `:58-60`, `:69-87`, `:122-167`, `:169-215`, `:250-261`, `:264-317`, `:326-342`, `:380-397` |
| `src/core/triage.ts` | Reviewer triage over `suggestions[]` by exact concern id; the single human-disposition router with severity thresholds and digest semantics; step-role hydration + byte-capped YAML rendering; debt predicate. | `:16-30`, `:35-50`, `:56-75`, `:93-136`, `:143-150`, `:152-165`, `:219-251`, `:254-291`, `:293-349` |
| `src/core/review-policy.ts` | Triager set (reviewer, plan-reviewer, wave/plan close-up) and allowed-disposition resolution; `dismiss` is added only for triagers, never for non-triagers. | `:4-12`, `:16-24`, `:30-46` |
| `src/core/flows/step-runner.ts` | Generic ingest of any step output into the concern store (`concerns`/`newConcerns`, `remarkable`, `suggestions`, `concernResolutions`, `concernConfirms`, `concernResolution`), allowlist gate, prompt-var hydration, schema selection. | `:194-306`, `:391-430` |
| `src/core/flows/item-machine.ts` | Per-step review wiring (`reviewAllowed`, `dispositionsCriteria`), raw human-* question write guarded for concern ids, blocking decision for concern-routed human dispositions. | `:630-650`, `:664-666`, `:712-740`, `:786-806` |
| `src/core/flows/iteration.ts` | Plan review triage partition (triage ids never request a revision), ADR persistence at plan/revise, autonomous blocking-ADR halt before waves, routed-blocker architect consults per wave. | `:200-229`, `:439-476`, `:514`, `:542-567`, `:600-628`, `:820-846` |
| `src/core/flows/consults.ts` | `runConcernConsult`: one architect consult per routed blocker; `decisions/concern-<cid>.yaml` is the idempotency guard and the direct resolution carrier. | `:297-370` |
| `src/core/flows/adrs.ts` | Blocking/non-blocking ADR table (`autonomous`→`human-stop`, `principal`/`detailed`→`human-async`), markdown rendering, mailbox routing (blocking question vs `human-awareness` digest). | `:8-19`, `:23-45`, `:46-72` |
| `src/core/flows/epic-propagation.ts` | Epic→saga push of open/routed concerns and open remarkables as condensed copies (verbatim ≤120 B; else ≤500 B and half size), blocked-question forwarding, idempotent merge. | `:26-38`, `:40-64`, `:97-130`, `:141-185` |
| `src/core/derive/task.ts` | Routed blockers (kind `blocker`, status `routed`, severity ≥ threshold) → blocked items + deps; debt collection incl. `isDebtConcern`; `state.yaml` concern counts. | `:52-65`, `:177-197`, `:219-265`, `:369-390`, `:431-440` |
| `src/core/derive/wave.ts`, `src/core/plan/scheduler.ts` | Blocked-by-concern fixpoint and transitive dependency cascade used by derive, waves and iteration. | `derive/wave.ts:27-57`, `plan/scheduler.ts:68-78` |
| `src/core/artifacts.ts` | Concern/remarkable/confirm/resolution/source/stored types, `ConcernCounts`, `StateArtifact`, pipeline config fields. | `:124-131`, `:301-378`, `:560-566`, `:568-582` |
| `src/cli/status.ts` | `factory status` concern counts + separate “Blocking Questions” / “Digest Questions” sections + debt list. | `:83-115`, `:107` |
| `config/pipeline.default.yaml` | Shipped `humanInvolvement: autonomous`, `concerns` block, commented `autonomous`/`principal`/`detailed` presets, blocking table, `criteria.human-involvement`, `reviewPolicy.default`. | `:370-376`, `:378-425`, `:440-456` |
| `config/schemas/*.schema.json` | Output contracts carrying concerns: `developer-output`, `review` (`newConcerns`), `plan` (`concerns`, `remarkable`, `adrs`), `decisions`, `fact-finder-output`, `plan-closeup` (+ `concernConfirms`, `concernResolutions`), `wave-closeup` (+ `concernResolutions`), `state` (`concerns` required). | see §2 |
| `agents/criteria/human-involvement.md` | Mode sections + shared ADR/concern blocking table, filtered to the active mode at render time. | `:1-30` |
| `agents/criteria/dispositions.md` | Review disposition criteria table (**no `dismiss` row**). | `:1-20` |
| `agents/steps/*.md` | Terse producer/triager instructions and `{{concernsYaml}}` sections; `review.md:19-24`, `plan-review.md:15`, `qa.md:33-35`, `develop.md:20-24`, `wave-close-up.md:21-24`, `architect-closeup.md:24-27`, `architect-plan.md:14,41`. | — |
| `test/**` | 18 concerns-related behavior/contract suites (see §4). | — |

## 2. Key Interfaces & Signatures

### 2.1 Types (`src/core/artifacts.ts`)

```ts
export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
export type ConcernSeverity = "low" | "medium" | "high";
export type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";

export interface Concern {
  id?: string; kind: ConcernKind; summary: string; detail: string;
  location?: { file: string; line?: number };
  severity: ConcernSeverity; affects?: string[];
}
export interface RemarkableDecision { chosen: string; alternatives: string[]; why: string; }
export interface ConcernConfirms { id: string; confirm: "accept" | "reject"; note?: string; }
export interface ConcernResolution { id: string; action: "resolve" | "carry"; note?: string; }
export interface CloseupConcernResolution { id: string; action: "resolve" | "carry" | "propagate"; note?: string; }
export interface ConcernSource { record: string; agent: string; epic?: string; step?: string; item?: string; iteration?: number; escalated?: boolean; lastSeen?: string; }
export interface PendingConcernResolution { action: "resolve" | "carry" | "propagate"; note?: string; by: string; at: string; }
export interface StoredConcernArtifact extends Concern {
  id: string; status: ConcernStatus; disposition?: ReviewDisposition; dismissReason?: string;
  source: ConcernSource; pendingResolution?: PendingConcernResolution;
  createdAt: string; updatedAt: string;
}
export interface ConcernCounts { open: number; dismissed: number; routed: number; resolved: number; }
```
`src/core/artifacts.ts:301-378`, `:560-566`; `StateArtifact.concerns` required (`:568-582`).

Pipeline config surface (`src/core/artifacts.ts:124-131`, schema `config/schemas/pipeline.schema.json:202-227`):

```ts
humanInvolvement?: "autonomous" | "principal" | "detailed";
concerns?: { raiseAllowlist?: string[]; minDigestSeverity?: ConcernSeverity; minBlockingSeverity?: ConcernSeverity };
reviewPolicy?: { default?: string[]; allowedDispositions?: string[]; [agent: string]: string[] | undefined };
```

### 2.2 Store API (`src/core/concerns.ts`)

```ts
export const DEFAULT_RAISE_ALLOWLIST = ["developer","fact-finder","architect","qa","reviewer","plan-reviewer","wave-close-up","plan-close-up"] as const;
export function severityAtLeast(severity: ConcernSeverity, min: ConcernSeverity): boolean;
export function concernFingerprint(c: ConcernInput): string;                 // c-<sha256[0..10]>
export async function aggregateConcerns(ctx, concerns, remarkables = [], opts?): Promise<StoredConcernArtifact[]>;
export async function listConcerns(taskDir): Promise<StoredConcernArtifact[]>;
export async function listOpenConcerns(taskDir): Promise<StoredConcernArtifact[]>;
export async function countConcerns(taskDir): Promise<ConcernCounts>;
export async function listConcernIds(taskDir): Promise<string[]>;
export async function applyConcernTriage(ctx: { suggestions; isTriager }): Promise<StoredConcernArtifact[]>;
export function applyCloseupResolutions(ctx: { resolutions; by }): Promise<StoredConcernArtifact[]>;
export function applyConcernConfirms(ctx: { confirms }): Promise<StoredConcernArtifact[]>;
export function applyConcernResolution(ctx: { resolution: {id; action: "resolve"|"carry"; note?}; by }): Promise<StoredConcernArtifact[]>;
export async function applyWaveCloseupFallback(ctx: { ids?: Iterable<string> }): Promise<StoredConcernArtifact[]>;
export function partitionSuggestions(suggestions, concernIds): { triage; findings };
export async function reconcileConcerns(ctx): Promise<StoredConcernArtifact[]>;  // rebuild from committed step records
```
Refs: `:35-44`, `:58-60`, `:122-167`, `:169-215`, `:218-228`, `:250-261`, `:264-317`, `:326-342`, `:345-353`, `:380-397`.

### 2.3 Triage / routing / hydration (`src/core/triage.ts`)

```ts
export interface TriagePartition { triage: ReviewSuggestion[]; findings: ReviewSuggestion[]; fixRequired: boolean }
export interface ReviewTriageOutcome extends TriagePartition { routed; dismissed; mailboxIds: string[] }
export class TriageValidationError extends Error {}
export function partitionReviewSuggestions(suggestions, concernIds, isTriager): TriagePartition;
export function concernMailboxId(concernId: string): string;                 // q-concern-<id>
export const DEFAULT_CONCERN_SEVERITY_POLICY = { minDigestSeverity: "medium", minBlockingSeverity: "high" };
export function resolveConcernSeverityPolicy(concerns?): ConcernSeverityPolicy;
export async function routeHumanDisposition(ctx, suggestion, concern?): Promise<string | undefined>;
export function isDebtConcern(c): boolean;
export async function listHydratedConcerns(taskDir, consumer): Promise<Array<Record<string, unknown>>>;
export async function hydrateStepConcerns(taskDir, request: { stepRole; inputBytes?; diffBytes?; taskDiffBytes?; consumer? }): Promise<string>;
export function renderConcernsYaml(records, maxBytes = 8000): string;
export async function applyReviewTriage(ctx): Promise<ReviewTriageOutcome>;
```
Refs: `:16-30`, `:32`, `:35-50`, `:52-54`, `:56-75`, `:93-136`, `:143-150`, `:219-251`, `:254-291`, `:293-349`.

### 2.4 Review policy (`src/core/review-policy.ts`)

```ts
export const BUILTIN_REVIEW_DISPOSITIONS = ["fix","optional","architect","human-awareness","human-async"] as const;
export function isTriagerAgent(agent: string): boolean;   // reviewer | plan-reviewer | wave-close-up | plan-close-up
export function resolveReviewAllowed(pipeline, agent, isTriager): string[]; // + dismiss iff triager
```
`:4-12`, `:16-24`, `:30-46`.

### 2.5 ADR + propagation APIs

```ts
// src/core/flows/adrs.ts
export function blockingAdrDisposition(mode): "human-stop" | "human-async";  // principal|detailed -> human-async
export function renderAdrMarkdown(adr: PlanAdr): string;                     // # title / ## Context / ## Decision / ## Consequences / ## Blocking
export async function persistAdrs(opts: { taskWt; taskDir; adrFolder?; adrs: PlanAdr[]; mode }): Promise<void>;

// src/core/flows/epic-propagation.ts
export interface PropagateEpicConcernsOptions { childTaskDir; parentTaskDir; parentWt; epic; concernIds?: Iterable<string> }
export async function propagateEpicConcerns(opts): Promise<void>;
```
`adrs.ts:8-72`; `epic-propagation.ts:26-185`.

### 2.6 Step-runner wiring

`runAgentStep` resolves `allowedDispositions = resolveReviewAllowed(pipeline, agent, isTriagerAgent(agent))` and the output schema (`step-runner.ts:391-396`), then hydrates `concernsYaml` when the fragment declares it and the caller did not supply it (`:400-430`): review/QA by `diffBytes`; wave/plan close-ups by the task-branch diff; everything else by the sum of non-excluded prompt vars. After a successful step, `ingestStepConcerns` (`:194-306`) is the single write path.

## 3. Relevant Excerpts

### 3.1 Identity and merge (fingerprint excludes `affects`; union merge)
`src/core/concerns.ts:51-60`, `:69-87`

```ts
const hash = (prefix, parts) => `${prefix}-${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
export function concernFingerprint(c: ConcernInput): string {
  return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]);
}
// mergeConcern: detail = longer of existing/incoming; severity = max;
// escalated = prior escalated || incoming severity > existing;
// affects = union; status/disposition preserved; source.lastSeen advanced
```
Same code computes `rm-<sha>` for remarkables from `[chosen, alternatives]` (`:53`).

### 3.2 Aggregation commits to the task worktree
`src/core/concerns.ts:122-167`

```ts
export async function aggregateConcerns(ctx, concerns, remarkables = [], opts = {}) {
  // validates kind/summary/severity and remarkable chosen/alternatives/why
  // KeyedMutex per taskDir; one <id>.yaml per fingerprint; legacy rename-merge
  if (dirty && opts.commit !== false) {
    if (!ctx.repo) throw new Error("aggregateConcerns requires repo when committing");
    await commitAll(ctx.repo, ctx.taskWt, `factory: concerns ${ctx.source.record}`);
  }
}
```
Store location is `path.join(taskDir, "concerns")` (`:47`); item steps still write it on the task worktree (ADR `adr-concern-store-taskwt.md`). Startup commits a pre-existing `concerns/` before stray-dirt repair and calls `reconcileConcerns` (`src/core/engine.ts:342-346`, `:384-393`).

### 3.3 Dismiss keeps the file, requires a reason
`src/core/concerns.ts:250-261`

```ts
export async function applyConcernTriage(ctx) {
  if (!ctx.isTriager) return [];
  const ops = ctx.suggestions.map((s) => [s.id, (record) => s.disposition === "dismiss"
    ? { ...record, status: "dismissed", disposition: s.disposition, dismissReason: s.detail!.trim() }
    : { ...record, status: "routed", disposition: s.disposition, dismissReason: undefined }]);
  return mutate(ctx, ops, "factory: concerns triaged");
}
```
`applyReviewTriage` rejects `dismiss` without detail before any write (`triage.ts:304-310`) and routes human/remarkable dispositions through one router (`:317-345`).

### 3.4 Single human router with severity thresholds
`src/core/triage.ts:98-136`

```ts
const isRemarkable = suggestion.id.startsWith("rm-");
const isHuman = ["human-awareness","human-async","human-stop"].includes(suggestion.disposition);
const dismissedEscalated = suggestion.disposition === "dismiss" && Boolean(concern?.source?.escalated);
if (!isHuman && !isRemarkable && !dismissedEscalated) return undefined;
const digestOnly = isRemarkable || dismissedEscalated || suggestion.disposition === "human-awareness";
const blocking = !digestOnly && severityAtLeast(severity, ctx.minBlockingSeverity);
// below minDigestSeverity -> no mailbox entry (rm-* exempt)
// blocks: human-stop -> [item, task] / task; human-async -> [item] / task; others []
```
Mailbox ids are `q-concern-<concernId>` (`:52-54`) or `q-escalated-<id>` for a dismissed escalated concern (`:117-119`).

### 3.5 Hydration caps and rendering
`src/core/triage.ts:234-291`

```ts
const cap = role === "review" || role === "qa" ? Math.min(request.diffBytes ?? 0, 2000)
  : role === "wave-close-up" || role === "plan-close-up" ? Math.min(request.taskDiffBytes ?? 0, 2000)
  : Math.min(request.inputBytes ?? 0, 500);
// renderConcernsYaml: try full, then drop affects, then shrink summaries (80→1 chars), shedding trailing records
```
Consumers (`:219-232`): `review`/`develop`/`qa`/`plan-review` see open; `closeup`/`architect` also see routed; only `architect` sees dismissed-but-escalated. Terse records omit `detail` (`:152-165`).

### 3.6 Step ingest order (allowlist → existing ids → aggregate → triage → resolutions → confirms → fallback)
`src/core/flows/step-runner.ts:194-306`

```ts
const allowlist = opts.pipeline.concerns?.raiseAllowlist ?? DEFAULT_RAISE_ALLOWLIST;
if (concerns.length > 0 && !allowlist.includes(opts.source.agent)) {
  await appendJournal(opts.taskDir, { type: "concern_ingest_skipped", ... }); concerns = [];
}
// triage only ids that existed before this step, so new concerns cannot self-dismiss
const existing = <concerns/*.yaml basenames>;
await aggregateConcerns(...);
const triage = suggestions.length ? await applyReviewTriage({ ...ctx, concernIds: existing, isTriager: isTriagerAgent(agent), ... });
// concernResolution honored only for consult-concern-<id>, architect-closeup*, architect-wave-report*
// concernConfirms applied only for agent === "architect"; accepted propagate ids pushed to the parent task
// wave-close-up: applyWaveCloseupFallback({ ids: existing })
```

### 3.7 Item-machine guards (single-writer for concern-id human dispositions)
`src/core/flows/item-machine.ts:664-666`, `:712-740`, `:786-806`

```ts
const concernIds = new Set(await listConcernIds(taskDir));
// raw human-* question writer skips ids in concernIds
// hasHumanBlock: human-async/stop is decided by whether the router wrote an open blocking question
// hasIssues: any fix suggestion, or human-stop for a non-concern id
```

### 3.8 Routed blockers: derive blocks, iteration consults
`src/core/derive/task.ts:52-65`, `src/core/plan/scheduler.ts:68-78`, `src/core/flows/iteration.ts:200-229`, `:820-846`

```ts
export async function collectRoutedBlockers(taskDir, minBlockingSeverity = "high") {
  for (const concern of await listConcerns(taskDir)) {
    if (concern.kind !== "blocker" || concern.status !== "routed") continue;
    if (!severityAtLeast(concern.severity, minBlockingSeverity)) continue;
    for (const slug of concern.affects ?? []) affected.add(slug);
  }
}
// blockedByConcern seeds pending items named by routed blockers, then cascadePendingBlocked;
// consultRoutedBlockers runs one runConcernConsult per blocker affecting a blocked wave item.
```
A consult's decision file `decisions/concern-<cid>.yaml` is created once (`consults.ts:319-324`); `concernResolution` is applied on commit, so the next derive unblocks (ADR `adr-closeup-lifecycle-resolved.md`).

### 3.9 Tech debt derivation
`src/core/derive/task.ts:219-265`

```ts
if (plan?.techDebt) debtSet.add(d.description);
// decisions: accept-with-debt -> d.debt
for (const concern of await listConcerns(taskDir)) {
  if (!isDebtConcern(concern)) continue;
  const item = concern.source?.item ?? concern.affects?.[0];
  debtSet.add(item ? `[${item}] ${concern.summary}` : concern.summary);
}
// review suggestions disposition === "optional" -> `[<item>] <summary>`
```
`isDebtConcern` = non-open `tech-debt` concern or `optional` disposition (`triage.ts:143-150`); outstanding debt is passed to architect prompts as `debt` and printed by `factory status`.

### 3.10 ADRs at plan time
`src/core/flows/adrs.ts:8-19`, `:46-72`; `src/core/flows/iteration.ts:439-455`, `:469-476`, `:614-628`

```ts
export function blockingAdrDisposition(mode) {
  return mode === "principal" || mode === "detailed" ? "human-async" : "human-stop";
}
// persistAdrs: markdown into project.adrFolder when configured; always writes a question —
// blocking: disposition per mode + blocks:["task"]; remarkable: disposition "human-awareness" (no blocks)
// iteration: after plan/revise, if refreshStateYaml.status === "blocked" -> return blocked before waves
```
`project.adrFolder` defaults to `docs/adr` (`plugins/software-factory/config/project.template.yaml:11`).

### 3.11 Epic → saga propagation
`src/core/flows/epic-propagation.ts:40-64`, `:141-185`

```ts
function condenseText(text) {
  const size = utf8Bytes(text);
  return size <= VERBATIM_BYTES /*120*/ ? text
    : truncateUtf8(text, Math.min(CONDENSED_CAP_BYTES /*500*/, Math.floor(size / 2)));
}
// push: open|routed child concerns + open remarkables -> parent store via aggregateConcerns(commit:false)
// summary prefixed "[epic] "; source {epic, record: `epic:<epic>/<record>`, agent}; copies stay "open"
// questions with blocks forwarded as q-epic-<epic>-<id> with blocks remapped to the parent item/task
```
Called from `runTaskChild` after the child iteration, inside the parent close-up lock/commit (`src/core/engine.ts:271-292`).

### 3.12 Surfacing: status, state, close-ups, prompts
`src/cli/status.ts:107`; `src/core/derive/task.ts:369-390`

```ts
console.log(`Concerns: open ${derived.concerns.open} | dismissed ${...} | routed ${...} | resolved ${...}`);
// state.yaml: concerns: countConcerns(taskDir) (schema requires open/dismissed/routed/resolved)
```
`state.schema.json:1-15`, `:72-100`; close-up prompts carry `{{concernsYaml}}` and resolution fields (`agents/steps/wave-close-up.md:21-24`, `plan-close-up.md:24`, `architect-closeup.md:24-27`); architect/hydration consumers receive terse open/routed records (`triage.ts:219-232`).

### 3.13 Shipped config and presets
`config/pipeline.default.yaml:378-425`

```yaml
humanInvolvement: autonomous
concerns:
  raiseAllowlist: [developer, fact-finder, architect, qa, reviewer, plan-reviewer, wave-close-up, plan-close-up]
  minDigestSeverity: medium
  minBlockingSeverity: high
# Presets — copy the desired mode block into `.factory/pipeline.yaml` or a task `pipeline.yaml` override:
# humanInvolvement: principal   (+ minDigestSeverity: low, minBlockingSeverity: medium)
# humanInvolvement: detailed    (+ minDigestSeverity: low, minBlockingSeverity: low)
# ADR blocking table ...
```
Criteria mapping at `:440-456` (`human-involvement: agents/criteria/human-involvement.md`); mode filtering in `formatHumanInvolvementCriteria` (`src/core/prompts.ts:66-88`), dispositions filtering in `formatDispositionsSection` (`:90-113`).

## 4. Existing Tests & Conventions

- Runner: `bun test` (`package.json` scripts). Tests are **behavioral**: real temp git repos + `FakeHarness`; no mocks of the store.
- Helper `test/helpers/tmp-repo.ts:12-29` (`createTmpRepo`: `writeFile`, `commit`, `git`, `cleanup`) and `FakeHarness.scriptOutcome(label, outcome)` / `scriptComplete(handler)` (`src/harness/fake/fake-harness.ts:34-89`).
- Engine-level tests call `runTask`/`runAgentStep` with `PipelineConfig` + `ProjectConfig` literals and assert on YAML artifacts, journal events and `git status --porcelain === ""` (no stray files after commits), e.g. `test/engine/concerns-funnel.test.ts:37-124`, `:194-220`, `:347-467`.
- Contract tests (`test/contracts/`) compile schemas with `createAjv` and compare against `resolveStepSchema` output, asserting inline (no `$ref`) concern/remarkable definitions and strict enums (`test/contracts/concern-schemas.test.ts:10-25`).
- Tests cite the governing ADR id in their header comment (e.g. `funnel-text-budget.test.ts:1-22`, `hydration-fingerprint-caps.test.ts:30-36`, `closeup-lifecycle-resolve.test.ts:19-30`), which is the project convention for traceability.
- Concerns-related suites (18):

| Test | Focus |
|---|---|
| `test/engine/concerns-funnel.test.ts` | schema gate, fingerprint/merge, aggregation/commit, dismiss, close-up pending, remarkable, concurrency, producer wiring |
| `test/engine/reviewer-triage.test.ts` | item reviewer triage, allowed dispositions, debt predicate, mailbox ids |
| `test/engine/plan-reviewer-triage.test.ts` | architect plan concerns triaged by plan-reviewer; triage ids don't request revision |
| `test/engine/routing-blocker-derive.test.ts` | pure derive blocking of affected items + deps, no writes |
| `test/engine/routing-architect-consult.test.ts` | routed blocker → one architect consult before wave work |
| `test/engine/routing-human-debt.test.ts` | human-* routing and tech-debt to plan/status |
| `test/engine/closeup-lifecycle-resolve.test.ts` | propose/confirm/resolve/carry/propagate, consult unblocks, fallback |
| `test/engine/epic-saga-propagate.test.ts` | condensed epic→saga copies, byte caps, idempotency, question forwarding |
| `test/engine/hydration-fingerprint-caps.test.ts` | step-role caps, hydrated sets, fingerprint identity |
| `test/engine/funnel-text-budget.test.ts` | byte-budget contract (spike-finding test, helpers only) |
| `test/engine/human-router-severity.test.ts` | severity downgrade/suppression, digest vs blocking, escalated dismiss |
| `test/engine/state-concern-counts.test.ts` | state.yaml counts |
| `test/cli/status-concerns.test.ts` | status counts + blocking/digest sections |
| `test/contracts/concern-schemas.test.ts` | producer schema coverage |
| `test/contracts/concern-artifact-types.test.ts` | artifact type contract |
| `test/contracts/state-concern-schema.test.ts` | state schema contract |
| `test/human-involvement-config.test.ts` | mode config, criteria filtering, presets, per-task layering |
| `test/review-policy.test.ts` | allowed dispositions incl. triager-only `dismiss` |

- No test asserts documentation content (grep for `ARCHITECTURE` in `test/` only finds fixture files), so docs edits are not test-gated.

## 5. Implementation Status vs Intent (`docs/factory.v2.md:89-103`)

| Intent bullet | Status | Evidence |
|---|---|---|
| Structured `concerns[]` in agent outputs | **Done** for developer, fact-finder, architect (plan/decisions), close-ups; reviews use `newConcerns[]` | `config/schemas/developer-output.schema.json:61-90`, `fact-finder-output.schema.json:22-48`, `plan.schema.json:135-159`, `decisions.schema.json:48-72`, `review.schema.json:60-75`, `wave-closeup.schema.json:35-58`, `plan-closeup.schema.json:27-50` |
| Remarkable decisions/tradeoffs in structured output | **Done** (`remarkable: [{chosen, alternatives, why}]`, `rm-*` store ids) | schemas above; `concerns.ts:53`, `:89-97` |
| Aggregation under task folder, fingerprint ids, dedup, status, source record | **Done** | `concerns.ts:47-60`, `:122-167`, `:169-215`; statuses open/dismissed/routed/resolved |
| Reviewer triage with review vocabulary + `dismiss` (reason, kept) | **Done** for reviewer/plan-reviewer | `triage.ts:35-50`, `:293-349`; `review-policy.ts:30-46`; `concerns.ts:250-261` |
| blocker → dependent items blocked + architect consult | **Done** | `derive/task.ts:52-65`, `plan/scheduler.ts:68-78`, `iteration.ts:200-229`, `consults.ts:319-370` |
| `architect` → next architect turn | **Done** (routed status + hydration for architect/close-up consumers) | `triage.ts:219-232`, `step-runner.ts:404-430` |
| `human-*` → steer mailbox per policy | **Done** (severity thresholds; digest-only entries; blocks task/item) | `triage.ts:93-136`; `steer.ts:59-88` |
| tech debt → plan tech-debt list | **Done** (plan `techDebt`, accept-with-debt, optional suggestions, routed tech-debt concerns) | `derive/task.ts:219-265` |
| Wave/plan close-ups list concerns, re-triage, architect resolves/carries | **Done via `concernResolutions` + architect `concernConfirms` + wave fallback** (not via review dispositions; see open question 3) | `concerns.ts:264-317`, `:326-342`; `step-runner.ts:257-302`; close-up schemas |
| Funnel worker → reviewer → epic architect → saga architect → human, less detail per level, never more text than code | **Done** (hydration byte caps; epic copies condensed to ≤half/≤500 B; open copies) | `triage.ts:234-291`; `epic-propagation.ts:40-64`, `:141-185`; `funnel-text-budget.test.ts` |
| Saga architect reviews epic items, steers or propagates | **Done generically**: epic copies land in the parent (saga) task store, hydrated to its architect; steering via the root mailbox; proposals confirmed by the architect | `engine.ts:271-292`, `step-runner.ts:308-325`, `epic-propagation.ts:152-185` |
| Blocking vs non-blocking ADRs; remarkable digest never waits | **Done** (blocking question with `blocks:["task"]` vs `human-awareness`, no blocks) | `adrs.ts:8-72`; `iteration.ts:439-476`, `:614-628` |
| Presets `autonomous`/`principal`/`detailed` shipped as commented config examples, prompt fragments, per-task selectable | **Done** for config examples + fragment + root-task layer; **epic children do not inherit the parent task layer** (see open question 2) | `pipeline.default.yaml:378-425`; `prompts.ts:66-113`; `agents/criteria/human-involvement.md`; `loader.ts:92-100`; `run.ts:127-133`; `engine.ts:247` |
| Surfaced in close-ups, `factory status`, state.yaml counts | **Done** | `status.ts:107`; `derive/task.ts:369-390`; close-up prompts; `state.schema.json:72-100` |
| Update ARCHITECTURE (incl. §1 row 18), README, config commentary | **Not done** for ARCHITECTURE and README; config commentary already updated | `docs/ARCHITECTURE.md:39`; `README.md` (no hits); `pipeline.default.yaml:378-456` |
| Prompts terse / behavior tests only | **Done** | agent prompts ~20-30 lines; all 18 suites are behavior/contract tests |

## 6. Open Questions & Uncertainties

1. **Documentation gap is the dominant remaining work.** Concretely stale/missing:
   - `docs/ARCHITECTURE.md:39` — §1 row for item 18 says “deliberately not hand-built … current state: review dispositions and steering mailbox only”; must become an implemented row that records deviations.
   - `docs/ARCHITECTURE.md:61-85` (§3 module layout) omits `concerns.ts`, `triage.ts`, `review-policy.ts`, `flows/adrs.ts`, `flows/epic-propagation.ts`.
   - `docs/ARCHITECTURE.md:112-176` (§5) config sample omits `humanInvolvement`, `concerns`, `criteria.human-involvement`, triager-only `dismiss`; line 117 claims “epics inherit parent task layer” (mismatch — see item 2).
   - `docs/ARCHITECTURE.md:185-198` (§6.2 task folder) omits `concerns/`, `decisions/concern-<id>.yaml`, and `adrFolder` outputs.
   - `docs/ARCHITECTURE.md:282-295` (§8.7) disposition table omits `dismiss`, exact-id triage rules, severity thresholds and the human router; no section describes the store/funnel at all (natural placement: new §8.11 or §18; §8.8 ends at line 300).
   - `docs/ARCHITECTURE.md:339-357` (§10) output column omits `newConcerns[]`, `remarkable`, `concernResolutions`, `concernConfirms`, `adrs`; lines 352-353 claim close-ups output “wave-closeup + review” although their schemas have no `suggestions`.
   - `docs/ARCHITECTURE.md:404-406` (§13) test list does not mention the 18 concerns suites.
   - `README.md:71-86` (config hierarchy) has no per-task mode example; `README.md:99-105` (docs index) has no funnel/concerns pointer; README has zero mentions of concerns/humanInvolvement/ADR.
2. **Epic config inheritance mismatch (behavior).** ARCHITECTURE §5 says epics inherit the parent task layer (`docs/ARCHITECTURE.md:117`), but `runTaskChild` calls `pipelineFor(childTaskDir)` (`src/core/engine.ts:247`) and `pipelineFor` loads only `<taskDir>/pipeline.yaml` (`src/cli/run.ts:127-133`). Consequence: `humanInvolvement`, `concerns.*`, `reviewPolicy` set in a root task's `pipeline.yaml` do **not** apply inside its epics; “selectable per task” is root-only today. Decide: implement parent-layer inheritance (new test) or document the deviation in §1/§5/§18.
3. **Close-up disposition triage is unreachable.** `isTriagerAgent` returns true for `wave-close-up`/`plan-close-up` (`src/core/review-policy.ts:16-24`) and the ingest path would triage their `suggestions[]` (`step-runner.ts:243-257`), but `config/schemas/wave-closeup.schema.json` and `plan-closeup.schema.json` set `additionalProperties: false` and define no `suggestions`, so schema validation rejects any such output. Re-triage currently works through `concernResolutions` + architect `concernConfirms` + `applyWaveCloseupFallback`. Decide: add `suggestions` to close-up schemas (and prompt section) or drop close-ups from `isTriagerAgent` and correct §10/§8.7 wording.
4. **`dismiss` missing from the shared criteria file.** `agents/criteria/dispositions.md:1-20` documents fix/optional/architect/human-awareness/human-async/human-stop but not `dismiss`, while `formatDispositionsSection` advertises `dismiss` as allowed for triagers (`src/core/prompts.ts:90-113`), `review.md:21-23` / `plan-review.md:15` require `detail`, and `triage.ts:304-310` enforces it. Either add the row (docs/prompt fix) or reconsider the prompt instructions.
5. **Producer coverage is not literally “every agent output”.** `triage.schema.json` and `infra.schema.json` have no `concerns`/`remarkable`, and the default allowlist excludes triage/infra/pm (`concerns.ts:35-44`); a raising agent outside the allowlist is silently journaled as `concern_ingest_skipped` (`step-runner.ts:221-232`). The contract test deliberately lists only developer/fact-finder/plan/decisions/close-ups (`test/contracts/concern-schemas.test.ts:10-25`). Confirm and document the exclusion set, or extend schemas+allowlist.
6. **Zero-diff close-up hydration is empty.** Close-ups cap at `min(taskDiffBytes, 2000)` (`triage.ts:236-240`, `step-runner.ts:417-424`); a close-up on a branch with no diff since the parent tip gets cap 0 and therefore no open concerns to triage. The byte-budget spike documents a 0-byte budget case as valid (`test/engine/funnel-text-budget.test.ts:402-408`). Confirm whether a no-diff close-up should see a 500-byte input-based budget instead.
7. **Propagated epic concerns cannot block the epic item.** `concernCopy` preserves child `affects` slugs (`epic-propagation.ts:141-150`), while parent `collectRoutedBlockers` matches parent item slugs (`derive/task.ts:52-65`). The module header states copies stay open and only forwarded questions can block the parent (`epic-propagation.ts:20-25, 152-160`), and the test asserts that intent (`test/engine/epic-saga-propagate.test.ts:13-20`). Document this as the intended funnel semantic (saga architect resolves/steers; epic-level questions block).
8. **ADR format inconsistency.** `renderAdrMarkdown` writes `# title / ## Context / ## Decision / ## Consequences / ## Blocking` (`adrs.ts:23-45`), but the 14 existing `docs/adr/*.md` files are 3-line context-only notes (e.g. `docs/adr/adr-concern-store-taskwt.md`). The docs update should state the canonical generated format and whether the existing notes are historical.
9. **`autonomous` deviation.** Spec line 100 says autonomous blocks only “for the portion still blocked after everything unblocked is done”; implementation halts immediately at plan time on a blocking ADR (`iteration.ts:469-476`) and records this as accepted in `docs/adr/adr-autonomous-immediate-halt.md`. This deviation must appear in the §1 row / §18 section.
10. **`factory status` surfaces counts and mailbox digests, not the concern list.** Intent only requires counts; the current output prints counts plus blocking/digest question sections (`status.ts:83-115`) and debt. If the architect wants per-concern visibility, that is new behavior with a `status-concerns` test extension.
11. **No preflight validation of `concerns.raiseAllowlist` entries.** Only the pipeline JSON schema validates the shape (`pipeline.schema.json:207-227`); an unknown agent name is accepted and silently never matches `source.agent` (`step-runner.ts:219-232`). Consider a preflight warning or document it.
12. **Saga depth.** Epics are depth-1 only (`docs/ARCHITECTURE.md:279-281`, `flows` limits); “saga architect” is the root task architect and propagation is one level (`engine.ts:271-292`). Doc wording should not imply deeper recursion.

## 7. Recommendations for the Architect

1. Treat the store/triage/routing/funnel APIs as **frozen**: `concerns.ts`, `triage.ts`, `review-policy.ts`, `adrs.ts`, `epic-propagation.ts` are implemented and covered by 18 suites. Do not re-plan them; plan documentation and only the explicitly chosen consistency fixes.
2. Make the next iteration a documentation-closure milestone:
   - rewrite `docs/ARCHITECTURE.md:39` (§1 row 18) to “implemented” with the deviations from open questions 2/3/7/9;
   - add a funnel section (e.g. §8.11 “Concerns, remarkable decisions, ADRs, human-involvement modes”) covering store layout `{task}/concerns/{c-*,rm-*}.yaml`, fingerprint/dedup, statuses, triage contract (`suggestions[]` by exact id, triager-only `dismiss` with reason), routing table (blocker/architect/human-*/tech-debt), close-up propose→architect confirm, epic→saga condensing, ADR blocking table, presets + per-task layer;
   - update §3 module layout, §5 config sample, §6.2 task folder, §8.7 disposition table, §10 agent output column, §13 test list;
   - add a README section (“Concerns & human involvement”) with a per-task `pipeline.yaml` mode example and the `factory status` counts/digest output.
3. Add the missing `dismiss` row to `agents/criteria/dispositions.md` (one table row + rule) so the advertised vocabulary is fully documented; this is a prompt-surface fix, still terse.
4. Decide explicitly (and record in the plan ADRs) whether to fix or document the two behavioral mismatches: epic→parent task config inheritance and close-up `suggestions` triage. Each fix needs one behavior test near the existing suites; documenting needs one §1-row deviation sentence.
5. Keep behavior tests only; docs changes need no tests. For behavior changes, extend `test/human-involvement-config.test.ts` (config layering) and `test/engine/closeup-lifecycle-resolve.test.ts` (close-up triage) rather than new files.
6. Verification commands: `cd plugins/software-factory && bun test` (baseline 441 pass / 2 skip / 0 fail) and `bun run typecheck` (`tsc --noEmit`).

## Task Status
iteration: 3
amendments: 0
items:
  - schema-detail-normalize kind=dev wave=1 status=running outlineRef=schema-detail-normalize
  - closeup-triager-cleanup kind=dev wave=1 status=merged outlineRef=closeup-triager-cleanup
  - docs-finish-v4 kind=dev wave=2 status=pending outlineRef=docs-finish-v4
waves: 1, 2
merged: closeup-triager-cleanup
blocked: (none)
failed: (none)
open steer questions:
  - awareness-plan-2-autonomous-halt-deviation ref=plan-2 disposition=human-awareness: Spec autonomous defers blocking until unblocked work drains, but implementation routes blocking ADRs at plan time and halts immediately (iteration.ts:481-490). Plan ADR accepts immediate halt for iteration 2 with docs in ARCHITECTURE 8.11/human-involvement.md, drain scheduling future work. High-impact tradeoff operator should be aware of; architect can decide now. Ensure docs mark deviation explicitly.
  - awareness-plan-3-epic-config-awareness ref=plan-3 disposition=human-awareness: Plan ADR documents that humanInvolvement/concerns/reviewPolicy at root do not apply inside epics, deviating from ARCHITECTURE section 5 inheritance claim. Operators setting mode once at root will be surprised. Document-only decision is reasonable for closure scope but needs informational steer record like autonomous-halt awareness.

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
