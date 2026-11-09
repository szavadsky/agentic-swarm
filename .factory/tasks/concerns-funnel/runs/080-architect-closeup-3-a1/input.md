# Step: Architect Close-Up

## Goal
Determine the final iteration outcome following the completeness audit by the plan close-up agent.

## Rules
- Exploration budget: ground decision in the plan close-up audit findings, task INTENT, and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)

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
6. Verification commands: `cd plugins/software-factory && bun test` (baseline 441 pass / 2 skip / 0 fail) and `bun run typecheck` (`tsc --noEmit`).`). Read code ONLY to verify specific disputed claims or gate reports (few targeted reads, never broad scans). Keep terse.
- Decision options (yield `status` matching `plan-closeup.schema.json`):
  - `complete`: the task's `INTENT.md` is fully satisfied with verified working code, comprehensive tests, and green gates.
  - `next-iteration`: scope remains unfulfilled; proceed to iteration N+1 with updated requirements and hydrated context.
  - `blocked`: execution cannot proceed without human operator resolution. Formulate a precise, answerable `question` for the operator.
- Yield `{iteration, status, summary, question?, completedMilestones?, remainingMilestones?, techDebt?}`. Copy milestone/tech-debt lists from the audit when they still hold.
- Status grounding: the `Task Status` block below is derived from committed records + git — trust it over session memory. For detail read status files under the task dir: `state.yaml`, `items/*/assignment.yaml`, `waves/`, `decisions/`, `steer/tousertoreview/`.
- Rationale required: ground your decision in the plan close-up audit findings, verifying whether all milestones and Gherkin scenarios are genuinely delivered.

## Plan Close-Up Audit
{
  "iteration": 3,
  "remainingMilestones": [
    "m1-contracts-consistency",
    "m2-docs-gates"
  ],
  "status": "next-iteration",
  "summary": "Iteration 3 partially delivered: close-up triager/dismiss path verified (3/6 m1 scenarios pass), but schema-detail normalization and all docs/gates scenarios fail. M1: isTriagerAgent={reviewer,plan-reviewer} + composed dismiss exclusion (review-policy.ts:18-43, review-policy.test.ts:139-181), dismiss accept with trimmed note (concerns.ts:293-299, step-runner.ts:246-259, closeup-lifecycle-resolve.test.ts:306-335), and dismiss-without-note pre-flight error with no partial transitions (step-runner.ts:246-259, closeup-lifecycle-resolve.test.ts:337-400) all pass; dismiss enums in artifacts.ts:347-372 + wave/plan-closeup schemas + contract test concern-schemas.test.ts:299-364 pass. M1 gaps: all 6 runtime schemas still use capital-D Detail (developer-output:68, fact-finder-output:29, plan:142, decisions:55, wave-closeup:42, plan-closeup:34, plus review.schema.json:33/65) so lowercase-detail contract tests (concern-schemas.test.ts:445-451,537-541,621-625,688-694) must fail; concerns.ts:72 reads existing?.Detail (always undefined; typecheck error, longest-wins never applies) and no 200-byte/20-byte test exists; epic-saga-propagate.test.ts:248,307,313,319,682 and funnel-text-budget.test.ts:442,445 still read .Detail (typecheck + runtime failures); gates cannot be green. M2: ARCHITECTURE.md:39 still Deliberately not hand-built, no §8.11, §3/§5:117 (still claims epics inherit parent layer)/§6.2/§8.7/§10:352-353 (still closeup+review)/§13 unchanged; dispositions.md has no dismiss row and prompts.ts:90-110 filters only human-stop (prompts.test.ts:306-318 human-stop only); README has no Concerns section; pipeline.default.yaml has presets with correct severities (392-424) but no fragment->agent mapping commentary; human-involvement.md:11,17-18 has no immediate-halt note. Neither milestone fully delivered.",
  "techDebt": [
    "td-detail-casing still open: 6 runtime schemas + review.schema.json use capital-D Detail, concerns.ts:72 reads existing?.Detail, 5+ test reads use .Detail; typecheck and concern-schemas/epic-saga/funnel suites red",
    "docs-finish-v4 not landed: ARCH §1 row 18 + §8.11 + §3/§5/§6.2/§8.7/§10/§13 updates, README Concerns section, dispositions dismiss row, prompts dismiss filter + QA/reviewer test, pipeline fragment mapping, halt notes all missing",
    "td-tmpdir-split (adjacent): pre-existing head-guard failures without TMPDIR=/tmp remain",
    "td-spike-nits (adjacent): unapplied spike-saga-commit reviewer nits remain"
  ]
}

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
- iteration (integer, required, min: 1)
- status (string, required, enum: ["complete","next-iteration","blocked"])
- summary (string, required)
- question (string, optional)
- completedMilestones (array of string, optional)
- remainingMilestones (array of string, optional)
- techDebt (array of string, optional)
