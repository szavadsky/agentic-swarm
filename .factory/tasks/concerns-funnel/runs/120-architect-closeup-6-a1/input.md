# Step: Architect Close-Up

## Goal
Determine the final iteration outcome following the completeness audit by the plan close-up agent.

## Rules
- Exploration budget: ground decision in the plan close-up audit findings, task INTENT, and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)

## 0. Snapshot (verified 2026-11-09)

| Fact | Evidence |
|---|---|
| Acceptance definition | `docs/factory.v2.md:89-103` (item 18, all bullets) |
| Implementation status | `plugins/software-factory/docs/ARCHITECTURE.md:39` — row 18 marked **Implemented** with five accepted deviations (`adr-epic-config-root-only`, `adr-closeup-no-suggestions-triage`, `adr-epic-push-condensed`, `adr-autonomous-immediate-halt`, `adr-funnel-triage-coverage`) |
| Full funnel contract | `plugins/software-factory/docs/ARCHITECTURE.md:330-363` (§8.11) |
| Module map | `plugins/software-factory/docs/ARCHITECTURE.md:61-88` (`concerns.ts:76`, `triage.ts:77`, `review-policy.ts:78`) |
| User docs | `plugins/software-factory/README.md:99-128` (§5 concerns & human involvement, per-task examples, status output) |
| Docs are executable | `plugins/software-factory/test/docs-concerns.test.ts:87-346` asserts exact phrases/ADR ids/byte caps |
| Git history | Branch already carries iterations 1–5 (`git log`: `architect-wave-report-5-2`, `plan-close-up-5`, `architect-closeup-5`); current step record `context-pack-6`. `src/core/concerns.ts` entered via develop items (e.g. `8d47957 factory(schema-detail-normalize-v2): develop a1 [ok]`). |
| Test baseline (this pass) | `bun test` → **467 pass, 2 skip, 0 fail**, 2794 expects, 71 files, 106.56s. Targeted concern suites (concerns-funnel, reviewer-triage, status-concerns, docs-concerns) → 49 pass, 0 fail. |
| Working tree | Only `.factory/tasks/concerns-funnel/journal.ndjson` modified (engine audit log); plugin sources/docs clean. |

**Verdict for the architect:** item 18 is not greenfield on this worktree. Scope iteration 6 as a residual-gap audit/hardening pass against the bullets in `docs/factory.v2.md:89-103`; avoid re-architecting the store. Any docs edit is constrained by the sentinel tests (§4).

---

## 1. Module Map

| Path | Responsibility |
|---|---|
| `docs/factory.v2.md:89-103` | Item 18 acceptance text: structured concerns, aggregation/fingerprint, reviewer triage+dismiss, routing, close-up lifecycle, funnel condensation, ADR blocking/remarkable, human-involvement presets. |
| `plugins/software-factory/src/core/artifacts.ts` | Canonical types: `ConcernKind/Severity/Status`, `Concern`, `RemarkableDecision`, `ConcernConfirms`, `ConcernResolution`, `CloseupConcernResolution`, `ConcernSource`, `PendingConcernResolution`, `StoredConcernArtifact` (`:301-384`), `ReviewDisposition` (`:386-393`), `PipelineConfig` (`:108-144`), `PlanTechDebt/PlanAdr` (`:239-265`), `ConcernCounts`/`StateArtifact` (`:564-583`). |
| `plugins/software-factory/src/core/concerns.ts` | Engine-owned store: fingerprint ids, merge/dedup, aggregation+commit, list/count, triage, pending resolutions, architect confirms, decision-level resolution, wave-closeup fallback, exact-id partition, reconcile from records. |
| `plugins/software-factory/src/core/triage.ts` | Review triage partition, severity policy, single human router (`human-*` + `rm-*` + dismissed-escalated), debt predicate, terse hydration sets and UTF-8 byte caps, `renderConcernsYaml`. |
| `plugins/software-factory/src/core/review-policy.ts` | Triager set (`reviewer`, `plan-reviewer`), builtin dispositions, per-agent allowed set + auto-appended `dismiss`. |
| `plugins/software-factory/src/core/flows/step-runner.ts` | Producer ingest (`concerns`/`newConcerns`/`remarkable`/`suggestions`/`concernResolutions`/`concernConfirms`/`concernResolution`), allowlist gate, hydration injection, allowed-disposition resolution. |
| `plugins/software-factory/src/core/flows/iteration.ts` | Architect plan + ADRs, plan-review triage, routed-blocker consults per wave, wave/plan close-ups, architect wave report and close-up. |
| `plugins/software-factory/src/core/flows/consults.ts` | `runConcernConsult` for routed blockers; `decisions/concern-<cid>.yaml` idempotency guard. |
| `plugins/software-factory/src/core/flows/epic-propagation.ts` | Epic→saga push: condensed copies, `[epic]` prefix, `q-epic-*` question forwarding. |
| `plugins/software-factory/src/core/flows/adrs.ts` | Blocking vs remarkable ADR routing + canonical ADR markdown. |
| `plugins/software-factory/src/core/derive/task.ts` | Routed-blocker collection, blocked fixpoint, derived debt, concern counts in `state.yaml`, state refresh. |
| `plugins/software-factory/src/core/derive/item.ts` | Pending-item blocking via routed concerns (`withRoutedBlocking`). |
| `plugins/software-factory/src/core/plan/scheduler.ts` | `blockedByConcern` union with blocked-by-failure + transitive `deps` cascade. |
| `plugins/software-factory/src/core/steer.ts` | Mailbox writes (`q-{ref}-{hash}`), `questionBlocks`, answer flow. |
| `plugins/software-factory/src/core/records/review-schema.ts` | Generates review JSON schema with the agent's allowed disposition enum. |
| `plugins/software-factory/src/core/prompts.ts`, `prompt-vars.ts` | `formatHumanInvolvementCriteria`, `formatDispositionsSection`, prompt-var registry (`concernsYaml`, `humanInvolvementCriteria`). |
| `plugins/software-factory/config/pipeline.default.yaml` | Review policy incl. `dismiss` commentary (`:359-379`), `humanInvolvement`/`concerns` defaults + commented presets + blocking table (`:381-437`), criteria mapping (`:460-463`). |
| `plugins/software-factory/config/schemas/*.schema.json` | Producer/review/plan/decisions/close-up/state schemas (§2). |
| `plugins/software-factory/agents/steps/*.md`, `agents/criteria/*.md` | Prompt fragments for triage/close-up/architect turns and the mode/blocking criteria. |
| `plugins/software-factory/src/core/engine.ts` | Startup `reconcileConcerns` (`:385`), epic push after child iteration (`:266-296`), state refresh after every tick. |
| `plugins/software-factory/src/cli/status.ts` | `Concerns: open|dismissed|routed|resolved`, blocking vs digest mailbox split (`:84-116`). |

---

## 2. Key Interfaces & Signatures

### 2.1 Artifact types (`src/core/artifacts.ts`)

```ts
export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
export type ConcernSeverity = "low" | "medium" | "high";
export type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";

export interface Concern {                 // :308-321
  id?: string;                             // engine-assigned fingerprint
  kind: ConcernKind; summary: string; detail: string;
  location?: { file: string; line?: number };
  severity: ConcernSeverity;
  affects?: string[];                      // item/epic/plan refs
}
export interface RemarkableDecision { chosen: string; alternatives: string[]; why: string } // :323-327
export interface ConcernConfirms { id: string; confirm: "accept" | "reject"; note?: string }  // :330-334
export interface ConcernResolution { id: string; action: "resolve" | "carry"; note?: string } // :337-341
export interface CloseupConcernResolution { id: string; action: "resolve" | "carry" | "propagate" | "dismiss"; note?: string } // :347-351
export interface StoredConcernArtifact extends Concern {   // :375-384
  id: string; status: ConcernStatus; disposition?: ReviewDisposition;
  dismissReason?: string; source: ConcernSource; pendingResolution?: PendingConcernResolution;
  createdAt: string; updatedAt: string;
}
export type ReviewDisposition = "fix" | "optional" | "architect" | "human-awareness" | "human-async" | "human-stop" | "dismiss"; // :386-393
```

`ConcernSource` (`:353-364`) carries `record`, `agent`, `epic?`, `step?`, `item?`, `iteration?`, `escalated?`, `lastSeen?`. `ConcernCounts` = `{open,dismissed,routed,resolved}` and `StateArtifact.concerns` is required (`:564-583`).

### 2.2 Pipeline config (`src/core/artifacts.ts:108-144`, schema `config/schemas/pipeline.schema.json:202-237`)

```ts
humanInvolvement?: "autonomous" | "principal" | "detailed";
concerns?: { raiseAllowlist?: string[]; minDigestSeverity?: ConcernSeverity; minBlockingSeverity?: ConcernSeverity };
reviewPolicy?: { default?: string[]; allowedDispositions?: string[]; [agent: string]: string[] | undefined };
```
`humanInvolvement` default `autonomous` (`pipeline.schema.json:202-205`); `concerns` is closed (`additionalProperties:false`, `:223`); `reviewPolicy` allows per-agent arrays (`:233-236`).

### 2.3 Concern store (`src/core/concerns.ts`)

```ts
export function severityAtLeast(severity, min): boolean                                  // :24-26
export const DEFAULT_RAISE_ALLOWLIST = [developer, fact-finder, architect, qa, reviewer, plan-reviewer, wave-close-up, plan-close-up] // :35-44
export function concernFingerprint(c: ConcernInput): string                              // :60-62
export async function aggregateConcerns(ctx: ConcernWriteContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables?: RemarkableDecision[], opts?: { at?; commit?; dirty? }): Promise<StoredConcernArtifact[]> // :124-168
export async function listConcerns(taskDir): Promise<StoredConcernArtifact[]>             // :171-184
export async function listOpenConcerns(taskDir): Promise<StoredConcernArtifact[]>         // :187-189
export async function countConcerns(taskDir): Promise<ConcernCounts>                     // :196-217
export async function listConcernIds(taskDir): Promise<string[]>                         // :220-230
export async function applyConcernTriage(ctx: ConcernStoreContext & { suggestions; isTriager }): Promise<StoredConcernArtifact[]> // :252-263
export function applyCloseupResolutions(ctx & { resolutions: ConcernResolution[]; by }): Promise<...> // :266-273
export function applyConcernConfirms(ctx & { confirms }): Promise<...>                    // :282-306
export function applyConcernResolution(ctx & { resolution: {id; action: "resolve"|"carry"; note?}; by }): Promise<...> // :313-328
export async function applyWaveCloseupFallback(ctx & { ids?: Iterable<string> }): Promise<...> // :337-353
export function partitionSuggestions(suggestions, concernIds): { triage; findings }      // :356-364
export async function reconcileConcerns(ctx): Promise<StoredConcernArtifact[]>             // :391-408
```

### 2.4 Triage/router (`src/core/triage.ts`)

```ts
export function partitionReviewSuggestions(suggestions, concernIds, isTriager): TriagePartition // :35-50
export function concernMailboxId(concernId: string): string                                  // :52-54
export const DEFAULT_CONCERN_SEVERITY_POLICY = { minDigestSeverity: "medium", minBlockingSeverity: "high" } // :62-65
export function resolveConcernSeverityPolicy(concerns?): ConcernSeverityPolicy              // :67-75
export async function routeHumanDisposition(ctx: HumanRouteContext, suggestion, concern?): Promise<string|undefined> // :93-136
export function isDebtConcern(c): boolean                                                    // :143-149
export async function listHydratedConcerns(taskDir, consumer): Promise<Record<string,unknown>[]> // :219-231
export async function hydrateStepConcerns(taskDir, request): Promise<string>                 // :234-247
export function renderConcernsYaml(records, maxBytes = 8000): string                        // :254-286
export async function applyReviewTriage(ctx: ReviewTriageContext): Promise<ReviewTriageOutcome> // :293-349
```

### 2.5 Policy, flows, derivations

- `resolveReviewAllowed(pipeline, agent, isTriager): string[]` — triagers get `dismiss` auto-appended, non-triagers never (`review-policy.ts:27-43`).
- `blockingAdrDisposition(mode)`, `renderAdrMarkdown(adr)`, `persistAdrs({taskWt, taskDir, adrFolder?, adrs, mode})` (`adrs.ts:14-72`).
- `runConcernConsult(params): Promise<{decision?, sessionId?}>` (`consults.ts:319-324`).
- `propagateEpicConcerns(opts)` (`epic-propagation.ts:152-185`).
- `collectRoutedBlockers(taskDir, minBlockingSeverity="high"): Promise<Set<string>>` (`derive/task.ts:52-65`).
- `withRoutedBlocking(state, blockedBy?)` (`derive/item.ts:65-73`); `blockedByConcern(items, concernBlocked)` (`plan/scheduler.ts:68-78`).
- `writeQuestion(rootWt, taskDir, q)` / `questionBlocks(q, target)` (`steer.ts:63-110`, `:117-122`).
- `formatHumanInvolvementCriteria(criteria, mode)` / `formatDispositionsSection(criteria, allowed)` (`prompts.ts:68-111`).

---

## 3. Relevant Excerpts

### 3.1 Stable identity, merge and dedup (`src/core/concerns.ts:49-99`)

```ts
const norm = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
const hash = (prefix, parts) => `${prefix}-${sha256(JSON.stringify(parts)).slice(0,10)}`;
const rmId = (d) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);
function concernFingerprint(c) { return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]); }
```
Merge rules (`mergeConcern`, `:71-89`): **longest detail wins** (`utf8Bytes`), **highest severity wins**, `affects` union deduped/sorted, status stays as-is, `source.lastSeen` advances, and a severity increase on an existing record sets `source.escalated = true` (`:76`). `legacyConcern` (`:101-121`) rename-merges pre-union fingerprint files. `aggregateConcerns` serializes per task dir (`KeyedMutex`), validates kind/summary/severity (`:127-132`), writes one `c-*.yaml` / `rm-*.yaml` per fingerprint, and commits per ingest (`:163-166`).

### 3.2 Lifecycle transitions (`src/core/concerns.ts:251-353`)

```ts
// review triage: dismiss → dismissed + dismissReason; everything else → routed
export async function applyConcernTriage(...) {
  const ops = ctx.suggestions.map((s) => [s.id, (record) => s.disposition === "dismiss"
    ? { ...record, status: "dismissed", disposition: s.disposition, dismissReason: s.detail!.trim() }
    : { ...record, status: "routed", disposition: s.disposition, dismissReason: undefined }]);
}
// close-ups only propose; the architect settles
applyCloseupResolutions  // stores pendingResolution {action, note, by, at}; no status change
applyConcernConfirms     // accept resolve→resolved; carry→routed/architect; dismiss→dismissed+reason; propagate→clear only
applyConcernResolution   // resolve closes now; carry leaves pending carry
applyWaveCloseupFallback // triage-less pre-existing open: tech-debt→optional, others→architect, blockers stay open, epic copies skipped
```
Exact lines: `:252-263`, `:266-273`, `:282-306`, `:313-328`, `:337-353`; `partitionSuggestions` at `:356-364`. `reconcileConcerns` (`:391-408`) rebuilds the store from committed `ok` step records, ordered by `endedAt/seq/name`, merging idempotently and committing once if dirty.

### 3.3 Human router (`src/core/triage.ts:93-136`)

```ts
const isRemarkable = suggestion.id.startsWith("rm-");
const dismissedEscalated = suggestion.disposition === "dismiss" && Boolean(concern?.source?.escalated);
const digestOnly = isRemarkable || dismissedEscalated || suggestion.disposition === "human-awareness";
const blocking = !digestOnly && severityAtLeast(severity, ctx.minBlockingSeverity);
const disposition = digestOnly || !blocking ? "human-awareness" : suggestion.disposition;
if (!isRemarkable && !severityAtLeast(severity, ctx.minDigestSeverity)) return undefined;
const id = dismissedEscalated ? `q-escalated-${suggestion.id}` : `q-concern-${suggestion.id}`;
const blocks = disposition === "human-stop" ? [item?, "task"] : disposition === "human-async" ? [item ?? "task"] : [];
await writeQuestion(taskWt, taskDir, { id, ref: item ?? suggestion.id, disposition, question: detail||summary, blocks });
```
`question` = `detail` if present, else `summary`; `rm-*` is exempt from both thresholds; below `minDigestSeverity` nothing is written; below `minBlockingSeverity`, `human-async`/`human-stop` **downgrade to awareness** (losing the exit-10 halt).

### 3.4 Hydration / funnel budgets (`src/core/triage.ts:219-286`)

```ts
const includeRouted = consumer === "closeup" || consumer === "architect";
const includeEscalated = consumer === "architect";
// terseConcern: id, kind, severity, summary, affects?, pendingResolution?, status?, disposition?, dismissReason?, escalated? — never detail (:151-165)
const cap = role === "review" || role === "qa" ? Math.min(diffBytes ?? 0, 2000)
  : role === "wave-close-up" || role === "plan-close-up" ? Math.min(taskDiffBytes ?? 0, 2000)
  : Math.min(inputBytes ?? 0, 500);
```
`renderConcernsYaml` (`:254-286`) tries full → drop `affects` → summary truncation `80/40/16/8/4/1` → fewer entries, returning the first variant under the byte ceiling, else `""`. Step-runner wires the caps from the rendered prompt (`step-runner.ts:429-448`): review/qa by `diff`, close-ups by `git diff parent...HEAD`, everything else by the sum of its own prompt vars excluding `concernsYaml|humanInvolvementCriteria|debt|steering`.

### 3.5 Producer ingest (`src/core/flows/step-runner.ts:193-323`)

Order of operations after a step validates and its canonical artifact is written (`:831-861`):
1. collect `concerns` + `newConcerns`, `remarkable`, `suggestions`, `concernResolutions`, `concernConfirms`, `concernResolution` (`:199-204`); wave-close-up always proceeds even with none (`:212`).
2. allowlist gate keyed on `source.agent` (never the step fragment); dropped raises journal `concern_ingest_skipped` (`:217-231`).
3. snapshot pre-existing ids **before** aggregation so new concerns can never self-triage (`:233-240`).
4. architect `concernConfirms` pre-flight: accepting a `dismiss` proposal requires a non-empty pending note, else `TriageValidationError` fails the step before any mutation (`:246-259`).
5. `aggregateConcerns` then `applyReviewTriage` with `isTriagerAgent(source.agent)` and the configured severity thresholds (`:260-275`).
6. `applyCloseupResolutions` for close-up proposals (`:276`).
7. decision-level `concernResolution` honored only for `consult-concern-<id>`, `architect-closeup*`, `architect-wave-report*`; otherwise journal `concern_resolution_ignored` (`:284-301`).
8. architect confirms applied; accepted `propagate` proposals push the single confirmed copy to the parent (`:305-316`, `:325-341`).
9. wave-close-up fallback over pre-existing ids (`:318-321`).

A `TriageValidationError` turns the step status to `error` with `Review triage failed: …` (`:853-857`); other ingest errors only journal `concern_ingest_error`.

### 3.6 Iteration wiring (`src/core/flows/iteration.ts`)

- Architect hydration deliberately excludes concerns; they arrive only as `concernsYaml` (`:170`), and `debt`/`steering` share the same hydration context object (`:411-420`).
- Plan step persists ADRs through `persistAdrs` (`:441-451`).
- Plan review: `knownConcernIds = await listConcernIds(taskDir)` before the round (`:514`), suggestions partition by exact id (`:564-568`); triage ids never request a revision or influence approval.
- Wave loop: `collectRoutedBlockers(taskDir, minBlockingSeverity)` feeds `deriveWaveState` (`:817-824`); `consultRoutedBlockers` runs one architect consult per routed blocker affecting a pending item before work starts (`:830-850`).
- Wave close-up `:1000-1024`; architect wave report `:1030-1072` (debt var at `:1050`).
- Plan close-up + architect close-up `:1227-1307`; a `blocked` close-up writes `closeup-<N>` question with `blocks:["task"]` (`:1296-1305`).

`consultRoutedBlockers` (`:200-229`) iterates stored concerns, filters `kind==="blocker" && status==="routed"` and `affects ∩ blocked`, then calls `runConcernConsult`; the decision file `decisions/concern-<cid>.yaml` is the idempotency guard (`consults.ts:346-348`, prompt vars `:353-362`, artifact `:385-404`).

### 3.7 Epic/saga pressure (`src/core/flows/epic-propagation.ts`)

```ts
const VERBATIM_BYTES = 120; const CONDENSED_CAP_BYTES = 500;
function condenseText(text) { const size = utf8Bytes(text);
  return size <= 120 ? text : truncateUtf8(text, Math.min(500, Math.floor(size / 2))); }
function concernCopy(c, epic) { return { ...c, summary: `[epic] ${c.summary}`, detail: condenseText(c.detail ?? c.summary) }; }
```
Copies only `open`/`routed` child concerns and `open` remarkables (`:157-164`); copies keep `affects` unchanged and record `source.epic` with `record: epic:<epic>/<record>` (`:168`); parent copies stay open, so only forwarded `q-epic-*` questions can block the parent. `forwardBlockedQuestions` (`:97-129`) remaps `blocks: ["task"] → [parentTaskSlug]` and other blocks to the epic slug. Engine calls it after each child iteration, inside one lock + one commit with `child-closeup.yaml` (`engine.ts:266-296`).

### 3.8 ADRs (`src/core/flows/adrs.ts`)

```ts
blockingAdrDisposition(mode) => mode === "principal" || mode === "detailed" ? "human-async" : "human-stop"
renderAdrMarkdown: "# title" / "## Context" / "## Decision" / "## Consequences" / "## Blocking"
persistAdrs: blocking → writeQuestion({ref: adr.id, disposition: mode-based, blocks:["task"], draftDecision: decision});
             remarkable → disposition "human-awareness", no blocks
```
Markdown is written only when `adrFolder` is configured; mailbox routing always runs (`:46-71`). `PlanAdr.blocking?: boolean` (`artifacts.ts:246-254`).

### 3.9 Derivation: blockers, debt, counts

```ts
// derive/task.ts:52-65
export async function collectRoutedBlockers(taskDir, minBlockingSeverity = "high") {
  for (const concern of await listConcerns(taskDir))
    if (concern.kind === "blocker" && concern.status === "routed" && severityAtLeast(...))
      for (const slug of concern.affects ?? []) affected.add(slug);
}
```
`deriveTaskState` maps routed names through `blockedByConcern(...)` → `withRoutedBlocking` for **pending** items only (`:174-196`); `scheduler.ts:68-78` unions with blocked-by-failure and cascades over declared `deps` to a fixpoint. Debt (`:219-263`): plan `techDebt` + `accept-with-debt` decisions + `isDebtConcern` (routed/resolved `tech-debt`, routed `optional`) with `[item] ` prefix + optional review findings. Counts come from `countConcerns` (`:369`) and are written into `state.yaml` (`:371-395`).

### 3.10 Surfacing (`src/cli/status.ts:84-125`, `steer.ts:63-122`)

```ts
console.log(`Concerns: open ${n} | dismissed ${n} | routed ${n} | resolved ${n}`);
console.log(`Blocking Questions:`); printQuestions(...isBlocking);
console.log(`Digest Questions:`);  printQuestions(...!isBlocking);
```
`isBlocking` = `human-stop` OR non-empty `blocks` OR `questionBlocks(q, "task")`. `writeQuestion` derives id `q-${cleanRef}-${sha256(ref:question:disposition).slice(0,10)}` and **never clobbers an existing entry** (operator answers survive re-runs) (`steer.ts:63-110`). `questionBlocks` treats `human-awareness` as never blocking (`:117-122`).

### 3.11 Prompt surfaces (`src/core/prompts.ts`, `agents/`)

- `formatHumanInvolvementCriteria` keeps the active `## <mode>` section plus shared sections (blocking table) and drops inactive modes (`prompts.ts:68-84`).
- `formatDispositionsSection` prepends the allowed list and filters `human-stop`/`dismiss` criteria rows when not allowed (`prompts.ts:91-111`).
- Reviewer: `agents/steps/review.md:18-24` — triage pre-existing `c-*`/`rm-*` by exact id, `dismiss` needs `detail`, condense/dismiss stale, raise new concerns with evidence.
- Plan reviewer: `agents/steps/plan-review.md:14-15,35-38` — triage ids never request a revision.
- Close-ups: `agents/steps/wave-close-up.md:20-26`, `agents/steps/plan-close-up.md:23-29`, `agents/steps/architect-closeup.md:23-29`, `agents/steps/architect-wave-report.md:26-32`, `agents/steps/architect-consult-nonitem.md:24-30`, `agents/steps/architect-plan.md:40-46`.
- Mode criteria: `agents/criteria/human-involvement.md:1-28` (blocking table + per-mode prose); dismissal criteria: `agents/criteria/dispositions.md:5-20`.

### 3.12 Config (`config/pipeline.default.yaml`)

- Review policy incl. `dismiss` explanation and auto-append (`:359-379`); default list omits `human-stop`.
- `humanInvolvement: autonomous` (`:395`); `concerns` defaults allowlist + `minDigestSeverity: medium`, `minBlockingSeverity: high` (`:397-408`).
- Commented presets for `autonomous`/`principal`/`detailed` (`:410-429`) and the ADR blocking table (`:431-437`); `principal` uses digest `low` / blocking `medium`, `detailed` both `low`.
- `criteria.human-involvement` wired to `agents/criteria/human-involvement.md` (`:460-463`).

### 3.13 Schemas carrying the contract

| Schema | Concern fields |
|---|---|
| `config/schemas/developer-output.schema.json:61-85` | `concerns[]` (kind/summary/detail/severity/location/affects) + `remarkable[]` |
| `config/schemas/review.schema.json:20-31,47-71` | full disposition enum incl. `dismiss`; `remarkable[]`; `newConcerns[]` |
| `config/schemas/plan.schema.json:115-159` | `adrs[]` with `blocking`; `concerns[]`; `remarkable[]` |
| `config/schemas/decisions.schema.json:48-93` | `concerns[]`, `remarkable[]`, `concernConfirms[]`, `concernResolution{resolve|carry}` |
| `config/schemas/plan-closeup.schema.json:27-73` | `concerns[]`, `remarkable[]`, `concernConfirms[]`, `concernResolutions{resolve|carry|propagate|dismiss}` |
| `config/schemas/wave-closeup.schema.json:35-70` | same minus confirms |
| `config/schemas/state.schema.json:72-99` | required `concerns {open,dismissed,routed,resolved}` |
| `src/core/records/review-schema.ts:5-51` | generates the disposition enum from the agent's allowed set |

### 3.14 Step→schema binding (`src/core/flows/step-runner.ts:132-160`)

`developer → developer-output`, `reviewer/qa → generated review`, `plan-close-up` **and** `architect-closeup → plan-closeup.schema.json`, `wave-close-up → wave-closeup`, `architect-consult-*`/`architect-wave-report → decisions`, `architect-plan → plan.schema.json`.

---

## 4. Existing Tests & Conventions

- **Runner:** `bun test` (`package.json:10`); typecheck `bun run typecheck` (`tsc --noEmit`, `:11`). Behavior tests only; no linting tests (spec item 15 / ARCHITECTURE:452).
- **Pattern:** `bun:test` + `test/helpers/tmp-repo.ts` (`createTmpRepo()` → temp git repo, deterministic identity env, worktree helpers, `cleanup()`), `FakeHarness` scripted by label, real `runAgentStep`/`runIteration` with a minimal `PipelineConfig`/`ProjectConfig`, assertions against disk (`concerns/*.yaml`, `steer/tousertoreview`, `state.yaml`), git (`ls-tree`, `status --porcelain`), and journal entries. Example setup: `test/engine/closeup-lifecycle-resolve.test.ts:1-60`.
- **Suite map (all green):**

| Suite | Focus |
|---|---|
| `test/engine/concerns-funnel.test.ts:37-1189` | schemas, fingerprint identity, aggregation/merge/escalation, dismiss reason, partitions, rm-* triage, concurrency, producer wiring (reviewer/consult/close-up), reconcile |
| `test/engine/reviewer-triage.test.ts:39-530` | terse hydration, exact-id partition, dismiss/routing, debt predicate, fixRequired once, dedup mailbox, non-triager gate |
| `test/engine/plan-reviewer-triage.test.ts:28-436` | plan-review hydration/triage, architect-revise concerns, triage ids never trigger revisions, debt derive |
| `test/engine/closeup-lifecycle-resolve.test.ts:168-598` | confirm accept/reject, propagate, dismiss-note validation, consult unblock, wave fallback |
| `test/engine/epic-saga-propagate.test.ts:139-656` | `[epic]` copies, 120/500 condensing, restart idempotency, `q-epic-*`, saga hydration, failed-child push |
| `test/engine/funnel-text-budget.test.ts:1-482` | **finding-only spike**: UTF-8 bytes, 2000/500 caps, 120/500 epic caps, strictly-fewer-bytes contract helpers (local to the test) |
| `test/engine/hydration-fingerprint-caps.test.ts:85-860` | per-consumer hydration sets and caps, affects union, counts exclude remarkables |
| `test/engine/routing-blocker-derive.test.ts:160-397` | routed blocker collection, pending-only blocking, transitive deps, terminal/running immunity |
| `test/engine/routing-architect-consult.test.ts:123` | routed blocker → one architect consult, idempotent decision file |
| `test/engine/human-router-severity.test.ts:131-699` | single router, severity downgrade/suppression, dismissed-escalated digest, rm-* digest |
| `test/engine/routing-human-debt.test.ts:34-284` | human-alert blocking semantics, exit 10, debt prefixes |
| `test/engine/adr-blocking-digest.test.ts:69-390` | blocking vs remarkable ADR, mode table, no-adrFolder routing |
| `test/engine/state-concern-counts.test.ts:33-159` | counts by status, zero/missing dir, corrupt skip, state.yaml materialization |
| `test/cli/status-concerns.test.ts:39-130` | counts line + blocking/digest split |
| `test/contracts/concern-artifact-types.test.ts`, `concern-schemas.test.ts`, `state-concern-schema.test.ts`, `schema-detail-normalize.test.ts` | type/schema contracts incl. `concernConfirms` in architect report/close-up schemas |
| `test/human-involvement-config.test.ts:138-481` | defaults/layering/null deletion, schema closure, commented presets, active-mode prompt selection, triager fragment matrix |
| `test/review-policy.test.ts:55-380` | builtin/per-agent/legacy resolution, dismiss append/gating, triager set, generated schema |
| `test/docs-concerns.test.ts:84-346` | docs sentinels (§1 row, §8.11 phrases, §3 modules, §5 sample, §6.2 folder, §8.7 dismiss, §10 vars/budgets, §11 status, §13 suites, README, config commentary) |

- **Docs-sentinel constraint:** any ARCHITECTURE/README/config commentary edit must keep the exact phrases asserted in `test/docs-concerns.test.ts:87-346` (e.g. row 18 must contain `**Implemented**`, the five deviation names and five `adr-*` ids; §8.11 must contain `c-{fingerprint}.yaml`, `longest detail wins`, `routeHumanDisposition`, `q-concern-{id}`, `120`, `500`, `2000`, `8000`, etc.). Run that suite after any doc change.
- **Allowlist agreement:** `DEFAULT_RAISE_ALLOWLIST` mirrors shipped config, asserted by `human-involvement-config.test.ts` and `funnel-text-budget`/`reviewer-triage` suites.

---

## 5. Open Questions & Uncertainties (verified residual gaps)

1. **Architect `concernConfirms` is schema-valid but prompt-silent.** The engine applies confirms only for `source.agent === "architect"` (`step-runner.ts:246-259,305-316`), and `decisions.schema.json:73-83` + `plan-closeup.schema.json:52-62` allow them, but every architect prompt tells the model only to “record concernResolutions” (`agents/steps/architect-closeup.md:29`, `architect-wave-report.md:32`, `plan-close-up.md:29`, `wave-close-up.md:26`). Consequence: pending close-up proposals may never be accepted/rejected in real runs. Engine tests drive confirms by constructing output directly (e.g. `closeup-lifecycle-resolve.test.ts:162-260`), not through prompt guidance. Decide whether to add a terse confirm instruction (and possibly a test that architect output includes it).
2. **Close-up `dismiss` action is allowed by schema but absent from prompt enumerations.** `plan-closeup.schema.json:63-73` and `wave-closeup.schema.json:60-70` allow `dismiss`, yet the fragments list only `resolve/carry/propagate`. `applyConcernConfirms` requires a pending note for an accepted dismiss (`concerns.ts:295-301`) and the pre-flight fails otherwise (`step-runner.ts:246-259`). Either document/teach it or narrow the schema (`adr-closeup-no-suggestions-triage`).
3. **“Each level passes up less detail” is prompt guidance + hydration caps, not an enforced invariant.** Merging keeps the *longest* detail (`concerns.ts:74`); terseness exists only in hydration (`triage.ts:151-165,234-247`) and epic push (`epic-propagation.ts:35-58`). `funnel-text-budget.test.ts:411-450` encodes a strictly-fewer-bytes contract but its helpers are local to the finding-only spike (“no production code is added here”, header `:1-21`); no production assertion checks reviewer→architect→close-up shrinkage. If the bullet must be enforced, add a code-level rule or a production test.
4. **Remarkables reach the mailbox only when a triager emits a suggestion with the `rm-*` id** (`triage.ts:98-115`; reviewer prompt `review.md:21`). Storage and hydration of open remarkable records is automatic (`triage.ts:200-216`), but there is no engine-side digest for an open remarkable that no reviewer re-emits. Confirm this is the intended “same aggregation/triage as concerns” reading (`docs/factory.v2.md:96`).
5. **`affects` refs beyond item slugs are inert for blocking.** `collectRoutedBlockers` returns all `affects` strings (`derive/task.ts:52-65`) but `blockedByConcern` matches only item slugs in the current plan (`plan/scheduler.ts:68-78`); epic/plan refs are stored and displayed but never block or consult. Decide whether to resolve epic/plan refs or document the limitation.
6. **Plan `{{debt}}` is architect hydration, not derived debt.** `iteration.ts:417` and `:1050` pass `hydrationContext` (prior plans/closeups/steering/decisions), whereas `StateArtifact.debt` is derived in `derive/task.ts:219-263`. Concern-derived debt therefore reaches the architect only through routed `concernsYaml`, not the debt section. This is likely intentional cache economy but worth confirming before adding anything.
7. **Counts intentionally exclude remarkables** (`concerns.ts:206-207` filters `c-*`; ARCHITECTURE:356). If item 18’s “counts” should include `rm-*`, this is a small change plus docs/sentinel updates.
8. **Digest mailbox has no retention/archival rule** (documented ARCHITECTURE:356) — entries accumulate in `steer/tousertoreview`; only human answers/steering move them.
9. **Epic config is root-only** (`ARCHITECTURE.md:120,361`): a per-task `pipeline.yaml` selecting `principal`/`detailed` does not reach epic children, so mode selection is not uniform across a saga. Accepted deviation `adr-epic-config-root-only`.
10. **Simple tasks have no reviewer/wave**, so their concerns stay open (`ARCHITECTURE:360`, deviation `adr-funnel-triage-coverage`); close-up fallback only exists for story flows.
11. **Autonomous mode halts immediately at plan time** for blocking ADRs rather than deferring until unblocked work is done (`ARCHITECTURE:359`, `adr-autonomous-immediate-halt`) — differs from the literal spec wording in `docs/factory.v2.md:100`.
12. **Presets are commented examples, not selectable presets keyed by name.** “Selectable per task” currently means copying a block into `{task}/pipeline.yaml` (README:107-121, config:410-429); `humanInvolvement` itself is just a string. If the architect wants a named preset mechanism, that is new surface.
13. **`aggregateConcerns` commits on every ingest** (`concerns.ts:163-166`) except epic pushes (`commit:false`). Any new producer wiring must account for this commit ordering: ingest commits in `taskWt` before the step record’s final commit (`step-runner.ts:843-898`).
14. **10-hex-char ids** (`concerns.ts:53-54`) are stable but short; collision handling relies on the fingerprint file layout. No test covers collisions (negligible probability, but a design assumption).

---

## 6. Quick Reference — Spec Bullet → Evidence

| `docs/factory.v2.md` bullet | Implementation | Tests |
|---|---|---|
| structured `concerns[]` + remarkable decisions | `artifacts.ts:301-327`; schemas `developer-output:61-85`, `review:47-71`, `plan:135-159`, `decisions:48-72`, `plan-closeup:27-51`, `wave-closeup:35-59` | `concerns-funnel.test.ts:37-192`, `concern-schemas.test.ts` |
| engine aggregation, fingerprint, dedup, status, source | `concerns.ts:49-168,171-230`; `engine.ts:385` | `concerns-funnel.test.ts:320-843`, `hydration-fingerprint-caps.test.ts:809+` |
| reviewer triage + `dismiss` | `review-policy.ts:18-43`; `triage.ts:35-50,288-349`; `review-schema.ts:5-51` | `reviewer-triage.test.ts`, `plan-reviewer-triage.test.ts`, `review-policy.test.ts` |
| routing blocker→item+consult / architect / human-* / debt | `triage.ts:83-149`; `concerns.ts:330-353`; `iteration.ts:200-229,830-850`; `derive/task.ts:52-65,174-196`; `scheduler.ts:68-78`; debt `derive/task.ts:245-250` | `routing-blocker-derive.test.ts`, `routing-architect-consult.test.ts`, `routing-human-debt.test.ts`, `human-router-severity.test.ts` |
| close-ups list/re-triage/resolve-or-carry | `concerns.ts:265-353`; `iteration.ts:1000-1024,1227-1307` | `closeup-lifecycle-resolve.test.ts`, `plan-reviewer-triage.test.ts` |
| configurable allowlist/dispositions/thresholds | `artifacts.ts:126-138`; `pipeline.schema.json:202-237`; `pipeline.default.yaml:359-437`; `review-policy.ts:27-43` | `human-involvement-config.test.ts`, `review-policy.test.ts` |
| funnel worker→reviewer→epic→saga→human with less detail | `triage.ts:219-286`; `epic-propagation.ts:35-58,141-185`; `engine.ts:266-296` | `epic-saga-propagate.test.ts`, `funnel-text-budget.test.ts`, `hydration-fingerprint-caps.test.ts` |
| blocking vs remarkable ADRs, digest never waits | `adrs.ts:14-72`; `plan.schema.json:127-130` | `adr-blocking-digest.test.ts` |
| human-involvement presets `autonomous`/`principal`/`detailed` | `prompts.ts:61-111`; `criteria/human-involvement.md`; `pipeline.default.yaml:381-437`; README:99-128 | `human-involvement-config.test.ts`, `docs-concerns.test.ts` |
| close-up/status/state counts | `derive/task.ts:369-415`; `state.schema.json:72-99`; `status.ts:84-116` | `state-concern-counts.test.ts`, `status-concerns.test.ts` |
| ARCHITECTURE §1 row + README + config commentary | `docs/ARCHITECTURE.md:39,330-363`; `README.md:99-128`; `config/pipeline.default.yaml:359-437` | `docs-concerns.test.ts:84-346` (sentinels) |

---

## 7. Suggested First Checks for the Architect (read-only, cheap)

- `bun test test/engine/concerns-funnel.test.ts test/engine/reviewer-triage.test.ts test/cli/status-concerns.test.ts test/docs-concerns.test.ts` (49 tests, ~6.5s) before planning any change.
- `grep -n "concernConfirms\|concernResolutions" plugins/software-factory/agents/steps/*.md` to see the prompt/schema asymmetry (open question 1/2).
- `grep -n "affects" plugins/software-factory/src/core/derive/task.ts plugins/software-factory/src/core/plan/scheduler.ts` for the blocking-ref scope (open question 5).
- If docs change: `bun test test/docs-concerns.test.ts` immediately (exact-phrase sentinels).
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
  "iteration": 6,
  "remainingMilestones": [
    "m0-detail-normalize",
    "m1-confirm-instructions"
  ],
  "status": "next-iteration",
  "summary": "Iteration 6 delivered neither milestone: all 6 runtime schemas still carry capital-D Detail, mergeConcern still guards on existing?.Detail (type error + longest-wins dead), stale capital reads remain in longest-wins/epic-saga tests, architect fragments still lack concernConfirms + dismiss-note rule, 3 ADR stubs lack Decision paragraphs, and ARCHITECTURE row-18 + §8.11 + docs-concerns sentinels remain at five deviations (no epic-mailbox-isolation). Baseline RED persists; contract/longest-wins/typecheck scenarios cannot pass.",
  "techDebt": [
    "td-detail-casing OPEN: 6 runtime schemas capital-D (decisions.schema.json:55, developer-output.schema.json:68, fact-finder-output.schema.json:29, plan.schema.json:142, plan-closeup.schema.json:34, wave-closeup.schema.json:42); review.schema.json capital-D in BOTH suggestions:33 and newConcerns:65 while generated review-schema.ts emits lowercase (records/review-schema.ts:36,80); concerns.ts:82 guards existing?.Detail against StoredConcernArtifact.detail (artifacts.ts:313,375) so typecheck fails and longest-wins always picks incoming",
    "td-detail-casing tests STALE: schema-detail-normalize.test.ts:250/279/346 + :324 read merged/listed .Detail capital (type error, must be lowercase); epic-saga-propagate.test.ts:248/307/313/319 read .Detail capital; contract assertions :85-86/:105-106/:114-115 correctly demand lowercase-present/capital-absent so fail against current schemas",
    "td-confirm-instructions OPEN: agents/steps/architect-closeup.md:29 still instructs concernResolutions with no concernConfirms/note-rule; agents/steps/architect-wave-report.md:32 instructs neither; test/prompts.test.ts has zero concernConfirms/concernResolutions/dismiss-note assertions (grep no match)",
    "td-traceability OPEN: docs/adr/adr-confirm-field-instructions.md + adr-epic-mailbox-isolation.md + adr-remarkable-digest-triage.md contain title+context only, no Decision paragraph; ARCHITECTURE.md:39 row-18 says five deviations; §8.11 Accepted deviations (:359-363) lists 5 bullets with no epic-mailbox-isolation; docs-concerns.test.ts titles/needles still assert five deviations",
    "td-tmpdir-split (adjacent, carried): pre-existing head-guard failures need TMPDIR=/tmp workaround",
    "td-spike-nits (adjacent, carried): unapplied spike-saga-commit reviewer nits"
  ]
}

## Current Plan
{
  "iteration": 6,
  "milestones": [
    {
      "directionalInterfaces": [
        "step-runner validation (caller) -> runtime file schemas (callees: decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup): lowercase detail accepted, capital Detail rejected with step error before any store write; aggregateConcerns/mergeConcern carry lowercase detail with longest-wins",
        "contract and longest-wins suites (callers) -> file schemas plus StoredConcernArtifact (callees): schemas accept lowercase detail and reject capital Detail; stored reads assert lowercase detail; reference review schema matches the generated schema on suggestions + newConcerns casing; negative-casing fixtures keep capital Detail to prove rejection"
      ],
      "id": "m0-detail-normalize",
      "scenarios": [
        "Given the 6 runtime file schemas plus reference review schema When test/contracts/schema-detail-normalize.test.ts, test/contracts/concern-schemas.test.ts, and test/contracts/concern-artifact-types.test.ts run Then lowercase detail validates and capital Detail is rejected, including review suggestions casing",
        "Given a stored concern with 200-byte detail re-emitted with 20-byte detail When aggregateConcerns merges Then the stored 200-byte detail survives",
        "Given tsc --noEmit and the contract, longest-wins, and epic-saga suites When run with TMPDIR=/tmp Then all pass, proving no stale capital reads remain (typed reads fail typecheck, casing fails contracts)",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass with no regressions"
      ],
      "title": "Detail casing normalization"
    },
    {
      "directionalInterfaces": [
        "architect agents (callers) -> architect-closeup plus architect-wave-report fragments (callees): final bullet carries the concernConfirms accept/reject instruction with the reject-noteless-dismiss rule (wave-report scoped to wave-close-up proposals) while preserving Raise-concerns and condense sentinels; neither fragment carries a concernResolutions instruction",
        "docs-concerns sentinels (callers) -> ARCHITECTURE §1 row 18 plus §8.11 deviations list (callees): row and body needles agree on six deviations including epic-mailbox-isolation; repo docs/adr stubs expose Decision paragraphs for the three records"
      ],
      "id": "m1-confirm-instructions",
      "scenarios": [
        "Given agents/steps/architect-closeup.md When read Then the final bullet instructs concernConfirms accept/reject with the reject-noteless-dismiss rule, keeps Raise-concerns and condense clauses, carries no concernResolutions instruction, and the fragment non-empty line count is unchanged",
        "Given agents/steps/architect-wave-report.md When read Then the final bullet instructs concernConfirms for wave-close-up proposals with the same note rule, keeps Raise-concerns and condense clauses, carries no concernResolutions instruction, and the fragment non-empty line count is unchanged",
        "Given the rendered architect-closeup and architect-wave-report prompts When checked via prompts.test.ts Then the confirms instruction and the dismiss-note-rule phrase are present in both, concernResolutions is absent from both, both fragment line counts are pinned to baseline, and the fragment matrix plus 15/80 debloat budgets pass",
        "Given docs/adr/adr-confirm-field-instructions.md, docs/adr/adr-epic-mailbox-isolation.md, and docs/adr/adr-remarkable-digest-triage.md When read Then each contains its Decision paragraph appended to the preserved title+context stub text",
        "Given ARCHITECTURE §1 row 18 and the §8.11 Accepted deviations list When read Then both record six deviations including epic-mailbox-isolation",
        "Given test/docs-concerns.test.ts and the full suite When run with TMPDIR=/tmp Then all sentinels pass including the updated row-18 and deviations needles and titles, and typecheck and bun test pass"
      ],
      "title": "Close-up confirm instructions and traceability updates"
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "FINAL-ITERATION RETRY of v3 per persisted decision 026 (closes QA-exhausted v3). Normalize concern Detail (capital-D) to detail (lowercase-d, all lowercase letters) in the 6 runtime file schemas under plugins/software-factory/config/schemas/ (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) + reference-only review.schema.json BOTH occurrences: suggestions[].Detail (:33) AND newConcerns[].Detail (:65), since the generated review-schema.ts already emits lowercase-d for both and the reference file must match. TS fix at plugins/software-factory/src/core/concerns.ts:74: change the guard's capital-D property read to the lowercase-d property read (all-lowercase detail), restoring longest-wins. MUST-FIX positive stored reads to lowercase-d: plugins/software-factory/test/engine/epic-saga-propagate.test.ts:248/307/313/319 AND plugins/software-factory/test/contracts/schema-detail-normalize.test.ts:234/263 longest-wins assertions; sweep plugins/software-factory/test/engine/funnel-text-budget.test.ts + any others with :raw reads (grep missed verified matches, never rely on grep alone). MUST-PRESERVE all negative-casing fixtures capital-D: schema-detail-normalize absence assertions + capital-D rejection payloads, concern-schemas.test.ts capital-D rejection payloads, concern-artifact-types.test.ts capital-D ts-expect-error fixture. Rule: positive stored-read assertions flip to lowercase-d; every rejection/absence/expect-error fixture keeps capital-D. Longest-wins tests already exist -- fix their reads, do NOT add duplicates. Add a suggestions-casing assertion to the reference-review-schema contract test: review.schema.json suggestions[].properties.detail exists lowercase-d and suggestions[].properties Detail (capital-D) is absent. triage/infra/pm-edit untouched. Verify typecheck + TMPDIR=/tmp bun test full suite green; QA evaluates red-to-green via longest-wins/contract suites.",
      "kind": "story",
      "milestoneId": "m0-detail-normalize",
      "prodBudgetHint": 30,
      "slug": "schema-detail-normalize-v4",
      "title": "Lowercase detail in producer schemas + merge fix (final retry)"
    },
    {
      "deps": [
        "schema-detail-normalize-v4"
      ],
      "description": "Per adr-confirm-field-instructions, after m0 is merged (baseline is RED so m1 gates require m0): net-zero single-line in-place replacement of the existing final bullet in plugins/software-factory/agents/steps/architect-closeup.md (concernConfirms accept/reject instruction incl the dismiss note rule 'reject dismiss proposals lacking a pending note'; concernResolutions instruction gone) and in plugins/software-factory/agents/steps/architect-wave-report.md (concernConfirms instruction for wave-close-up proposals, incl the same dismiss note rule). Both rewritten bullets MUST keep the Raise-concerns-with-evidence clause and the condense clause -- only Resolutions->Confirms plus the dismiss note rule changes -- or the prompts.test matrix sentinels fail. Zero net added lines per fragment; plugins/software-factory/agents/steps/architect-resume.md and all other fragments untouched. Extend plugins/software-factory/test/prompts.test.ts asserting: confirms-present in both rendered prompts, concernResolutions-absent from BOTH fragments, the dismiss-note-rule phrase in BOTH renders, and both fragments' non-empty line counts pinned to baseline (automated net-zero enforcement); also verify git diff --numstat shows equal insertions/deletions for the two fragments. Complete (UPDATE, never rewrite: preserve existing title+context stub text, append the Decision paragraph from the matching plan ADR) docs/adr/adr-confirm-field-instructions.md, docs/adr/adr-epic-mailbox-isolation.md (sixth deviation), docs/adr/adr-remarkable-digest-triage.md (spec-consistent, NOT a deviation). Update plugins/software-factory/docs/ARCHITECTURE.md §1 row 18 to six deviations (epic-mailbox-isolation needles + adr-epic-mailbox-isolation id) AND append the matching bullet to the §8.11 Accepted deviations list, co-updating BOTH sentinels in plugins/software-factory/test/docs-concerns.test.ts with the same needles in the same diff AND updating the two sentinel test titles from five to six. Do NOT touch README/config/criteria files or any other ARCHITECTURE section. Verify: prompts.test matrix + 15/80 budgets green, docs-concerns green, typecheck + TMPDIR=/tmp full suite green.",
      "kind": "story",
      "milestoneId": "m1-confirm-instructions",
      "prodBudgetHint": 20,
      "slug": "closeup-confirm-instructions",
      "title": "Architect confirms instructions + traceability updates"
    }
  ],
  "assumptions": [
    {
      "assumption": "Baseline is RED on detail casing, contradicting the context-pack 467-pass/typecheck-clean claim: :raw reads verify capital-D Detail in runtime schemas (developer-output.schema.json:68), concerns.ts:74 reads existing?.Detail (capital-D; type error against lowercase StoredConcernArtifact.detail, longest-wins dead), epic-saga-propagate.test.ts:248/307/313/319 read capital-D, schema-detail-normalize.test.ts:234/263 read merged[0]!.Detail (capital-D), and reference-only review.schema.json carries capital-D in BOTH suggestions (:33) and newConcerns (:65) while the generated review-schema.ts already uses lowercase-d for both. Gates go green only after m0 lands. TMPDIR=/tmp still required for the 2 pre-existing head-guard failures.",
      "why": ":raw reads plus closeup-5 are authoritative over rendered/green claims; iteration 5 merged zero items so the red baseline persists. Plan targets red-to-green via m0, with m1 sequenced after m0."
    },
    {
      "assumption": "Behavior is frozen except Detail->detail normalization, two net-zero architect-fragment bullet replacements (+ prompt-render test in prompts.test.ts), completion of 3 existing docs/adr stubs, and the ARCHITECTURE §1 row 18 + §8.11 deviations bullet + both docs-concerns sentinel co-updates. No README/config/prompt-criteria edits; no other ARCHITECTURE sections touched.",
      "why": "Final iteration (6/6): bounding change to verified gaps avoids regressions and sentinel/debloat violations while keeping row+body+ADR traceability consistent."
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
      "description": "Capital-D Detail in 6 runtime-bound file schemas rejects lowercase detail (reference-only review.schema.json carries capital-D in BOTH suggestions and newConcerns while the generated schema already emits lowercase-d for both); mergeConcern reads existing?.Detail (capital-D) so typecheck fails and longest-wins is dead; epic-saga (:248/:307/:313/:319) and schema-detail-normalize (:234/:263) tests read capital-D, while negative-casing fixtures must keep capital-D to prove rejection.",
      "id": "td-detail-casing",
      "resolution": "Fix in schema-detail-normalize-v4: normalize schemas (both review.schema.json occurrences) + concerns.ts:74 + all stale positive reads verified by :raw (rejection/absence/expect-error fixtures stay capital-D); contract, suggestions-casing, and longest-wins tests verify; full gates green."
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
      "context": "The engine settles close-up proposals only via architect concernConfirms (step-runner.ts:303-316, concerns.ts:282-306), but agents/steps/architect-closeup.md instructs concernResolutions (the proposal field, verified last line) and architect-wave-report.md instructs neither (verified). A proposal the architect never confirms keeps pendingResolution forever, and applyWaveCloseupFallback skips pending concerns (concerns.ts:347), so spec :94 resolve/carry silently stalls in production while engine tests pass. The dismiss path reads ONLY the close-up pending note (concerns.ts:293-300) and the store type drops confirm.note entirely (:283); a noteless accept leaves pending intact by design, and the ingest pre-flight fails the step on noteless dismiss-accepts (step-runner.ts:246-259).",
      "decision": "Dismiss note rule semantics: REJECT noteless dismiss proposals. Fix the fragments with net-zero single-line in-place replacement: rewrite the existing final bullet of architect-closeup.md to a terse concernConfirms accept/reject instruction with the dismiss note rule ('reject dismiss proposals lacking a pending note'), and the existing final bullet of architect-wave-report.md to a concernConfirms instruction scoped to wave-close-up proposals. Both rewritten bullets MUST preserve the Raise-concerns-with-evidence clause and the condense clause so the prompts.test matrix sentinels (/Raise concerns/ on all 19 fragments, /condens/i on triage fragments) keep passing; only Resolutions->Confirms plus the dismiss note rule changes. Zero net added lines; a prompt-render test in prompts.test.ts locks confirms-present in both renders, concernResolutions-absent in BOTH fragments, the dismiss-note-rule phrase in BOTH renders, and pins both fragments' non-empty line counts to baseline so gates enforce net-zero; git diff --numstat must show equal insertions/deletions for the two fragments. architect-resume.md untouched. No engine/schema changes. Complete the existing docs/adr/adr-confirm-field-instructions.md stub with this Decision paragraph.",
      "id": "adr-confirm-field-instructions",
      "title": "Architect fragments instruct concernConfirms"
    },
    {
      "context": "runChildTask accepts rootTaskDir but never reads it; only root runTask polls the root mailbox, while epic children write human-* to their own task dir mailbox ({childWt}/{orch}/{parent}/{epic}). Blocked child questions are forwarded as q-epic-* (epic-propagation.ts:97-129), but epic-local digests stay in the epic mailbox and parent answers are not copied back down. Wiring child-to-root mailbox routing now is a late-stage behavior change with config-semantics blast radius.",
      "decision": "Accept as the sixth documented deviation for closure: the root mailbox is the operator surface; epic-local digest entries are not visible at root; child-to-root routing/answer-sync is future work. Complete the existing docs/adr/adr-epic-mailbox-isolation.md stub with this Decision paragraph; plugins/software-factory/docs/ARCHITECTURE.md §1 row 18 AND the §8.11 Accepted deviations list each gain the sixth-deviation entry, with the row-18 and §8.11-deviations sentinels in plugins/software-factory/test/docs-concerns.test.ts co-updated with the same needles in the same diff (sentinel test titles updated from five to six alongside the needles). Operator notified via human-awareness.",
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

## 0. Snapshot (verified 2026-11-09)

| Fact | Evidence |
|---|---|
| Acceptance definition | `docs/factory.v2.md:89-103` (item 18, all bullets) |
| Implementation status | `plugins/software-factory/docs/ARCHITECTURE.md:39` — row 18 marked **Implemented** with five accepted deviations (`adr-epic-config-root-only`, `adr-closeup-no-suggestions-triage`, `adr-epic-push-condensed`, `adr-autonomous-immediate-halt`, `adr-funnel-triage-coverage`) |
| Full funnel contract | `plugins/software-factory/docs/ARCHITECTURE.md:330-363` (§8.11) |
| Module map | `plugins/software-factory/docs/ARCHITECTURE.md:61-88` (`concerns.ts:76`, `triage.ts:77`, `review-policy.ts:78`) |
| User docs | `plugins/software-factory/README.md:99-128` (§5 concerns & human involvement, per-task examples, status output) |
| Docs are executable | `plugins/software-factory/test/docs-concerns.test.ts:87-346` asserts exact phrases/ADR ids/byte caps |
| Git history | Branch already carries iterations 1–5 (`git log`: `architect-wave-report-5-2`, `plan-close-up-5`, `architect-closeup-5`); current step record `context-pack-6`. `src/core/concerns.ts` entered via develop items (e.g. `8d47957 factory(schema-detail-normalize-v2): develop a1 [ok]`). |
| Test baseline (this pass) | `bun test` → **467 pass, 2 skip, 0 fail**, 2794 expects, 71 files, 106.56s. Targeted concern suites (concerns-funnel, reviewer-triage, status-concerns, docs-concerns) → 49 pass, 0 fail. |
| Working tree | Only `.factory/tasks/concerns-funnel/journal.ndjson` modified (engine audit log); plugin sources/docs clean. |

**Verdict for the architect:** item 18 is not greenfield on this worktree. Scope iteration 6 as a residual-gap audit/hardening pass against the bullets in `docs/factory.v2.md:89-103`; avoid re-architecting the store. Any docs edit is constrained by the sentinel tests (§4).

---

## 1. Module Map

| Path | Responsibility |
|---|---|
| `docs/factory.v2.md:89-103` | Item 18 acceptance text: structured concerns, aggregation/fingerprint, reviewer triage+dismiss, routing, close-up lifecycle, funnel condensation, ADR blocking/remarkable, human-involvement presets. |
| `plugins/software-factory/src/core/artifacts.ts` | Canonical types: `ConcernKind/Severity/Status`, `Concern`, `RemarkableDecision`, `ConcernConfirms`, `ConcernResolution`, `CloseupConcernResolution`, `ConcernSource`, `PendingConcernResolution`, `StoredConcernArtifact` (`:301-384`), `ReviewDisposition` (`:386-393`), `PipelineConfig` (`:108-144`), `PlanTechDebt/PlanAdr` (`:239-265`), `ConcernCounts`/`StateArtifact` (`:564-583`). |
| `plugins/software-factory/src/core/concerns.ts` | Engine-owned store: fingerprint ids, merge/dedup, aggregation+commit, list/count, triage, pending resolutions, architect confirms, decision-level resolution, wave-closeup fallback, exact-id partition, reconcile from records. |
| `plugins/software-factory/src/core/triage.ts` | Review triage partition, severity policy, single human router (`human-*` + `rm-*` + dismissed-escalated), debt predicate, terse hydration sets and UTF-8 byte caps, `renderConcernsYaml`. |
| `plugins/software-factory/src/core/review-policy.ts` | Triager set (`reviewer`, `plan-reviewer`), builtin dispositions, per-agent allowed set + auto-appended `dismiss`. |
| `plugins/software-factory/src/core/flows/step-runner.ts` | Producer ingest (`concerns`/`newConcerns`/`remarkable`/`suggestions`/`concernResolutions`/`concernConfirms`/`concernResolution`), allowlist gate, hydration injection, allowed-disposition resolution. |
| `plugins/software-factory/src/core/flows/iteration.ts` | Architect plan + ADRs, plan-review triage, routed-blocker consults per wave, wave/plan close-ups, architect wave report and close-up. |
| `plugins/software-factory/src/core/flows/consults.ts` | `runConcernConsult` for routed blockers; `decisions/concern-<cid>.yaml` idempotency guard. |
| `plugins/software-factory/src/core/flows/epic-propagation.ts` | Epic→saga push: condensed copies, `[epic]` prefix, `q-epic-*` question forwarding. |
| `plugins/software-factory/src/core/flows/adrs.ts` | Blocking vs remarkable ADR routing + canonical ADR markdown. |
| `plugins/software-factory/src/core/derive/task.ts` | Routed-blocker collection, blocked fixpoint, derived debt, concern counts in `state.yaml`, state refresh. |
| `plugins/software-factory/src/core/derive/item.ts` | Pending-item blocking via routed concerns (`withRoutedBlocking`). |
| `plugins/software-factory/src/core/plan/scheduler.ts` | `blockedByConcern` union with blocked-by-failure + transitive `deps` cascade. |
| `plugins/software-factory/src/core/steer.ts` | Mailbox writes (`q-{ref}-{hash}`), `questionBlocks`, answer flow. |
| `plugins/software-factory/src/core/records/review-schema.ts` | Generates review JSON schema with the agent's allowed disposition enum. |
| `plugins/software-factory/src/core/prompts.ts`, `prompt-vars.ts` | `formatHumanInvolvementCriteria`, `formatDispositionsSection`, prompt-var registry (`concernsYaml`, `humanInvolvementCriteria`). |
| `plugins/software-factory/config/pipeline.default.yaml` | Review policy incl. `dismiss` commentary (`:359-379`), `humanInvolvement`/`concerns` defaults + commented presets + blocking table (`:381-437`), criteria mapping (`:460-463`). |
| `plugins/software-factory/config/schemas/*.schema.json` | Producer/review/plan/decisions/close-up/state schemas (§2). |
| `plugins/software-factory/agents/steps/*.md`, `agents/criteria/*.md` | Prompt fragments for triage/close-up/architect turns and the mode/blocking criteria. |
| `plugins/software-factory/src/core/engine.ts` | Startup `reconcileConcerns` (`:385`), epic push after child iteration (`:266-296`), state refresh after every tick. |
| `plugins/software-factory/src/cli/status.ts` | `Concerns: open|dismissed|routed|resolved`, blocking vs digest mailbox split (`:84-116`). |

---

## 2. Key Interfaces & Signatures

### 2.1 Artifact types (`src/core/artifacts.ts`)

```ts
export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
export type ConcernSeverity = "low" | "medium" | "high";
export type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";

export interface Concern {                 // :308-321
  id?: string;                             // engine-assigned fingerprint
  kind: ConcernKind; summary: string; detail: string;
  location?: { file: string; line?: number };
  severity: ConcernSeverity;
  affects?: string[];                      // item/epic/plan refs
}
export interface RemarkableDecision { chosen: string; alternatives: string[]; why: string } // :323-327
export interface ConcernConfirms { id: string; confirm: "accept" | "reject"; note?: string }  // :330-334
export interface ConcernResolution { id: string; action: "resolve" | "carry"; note?: string } // :337-341
export interface CloseupConcernResolution { id: string; action: "resolve" | "carry" | "propagate" | "dismiss"; note?: string } // :347-351
export interface StoredConcernArtifact extends Concern {   // :375-384
  id: string; status: ConcernStatus; disposition?: ReviewDisposition;
  dismissReason?: string; source: ConcernSource; pendingResolution?: PendingConcernResolution;
  createdAt: string; updatedAt: string;
}
export type ReviewDisposition = "fix" | "optional" | "architect" | "human-awareness" | "human-async" | "human-stop" | "dismiss"; // :386-393
```

`ConcernSource` (`:353-364`) carries `record`, `agent`, `epic?`, `step?`, `item?`, `iteration?`, `escalated?`, `lastSeen?`. `ConcernCounts` = `{open,dismissed,routed,resolved}` and `StateArtifact.concerns` is required (`:564-583`).

### 2.2 Pipeline config (`src/core/artifacts.ts:108-144`, schema `config/schemas/pipeline.schema.json:202-237`)

```ts
humanInvolvement?: "autonomous" | "principal" | "detailed";
concerns?: { raiseAllowlist?: string[]; minDigestSeverity?: ConcernSeverity; minBlockingSeverity?: ConcernSeverity };
reviewPolicy?: { default?: string[]; allowedDispositions?: string[]; [agent: string]: string[] | undefined };
```
`humanInvolvement` default `autonomous` (`pipeline.schema.json:202-205`); `concerns` is closed (`additionalProperties:false`, `:223`); `reviewPolicy` allows per-agent arrays (`:233-236`).

### 2.3 Concern store (`src/core/concerns.ts`)

```ts
export function severityAtLeast(severity, min): boolean                                  // :24-26
export const DEFAULT_RAISE_ALLOWLIST = [developer, fact-finder, architect, qa, reviewer, plan-reviewer, wave-close-up, plan-close-up] // :35-44
export function concernFingerprint(c: ConcernInput): string                              // :60-62
export async function aggregateConcerns(ctx: ConcernWriteContext & { source: ConcernSource }, concerns: ConcernInput[], remarkables?: RemarkableDecision[], opts?: { at?; commit?; dirty? }): Promise<StoredConcernArtifact[]> // :124-168
export async function listConcerns(taskDir): Promise<StoredConcernArtifact[]>             // :171-184
export async function listOpenConcerns(taskDir): Promise<StoredConcernArtifact[]>         // :187-189
export async function countConcerns(taskDir): Promise<ConcernCounts>                     // :196-217
export async function listConcernIds(taskDir): Promise<string[]>                         // :220-230
export async function applyConcernTriage(ctx: ConcernStoreContext & { suggestions; isTriager }): Promise<StoredConcernArtifact[]> // :252-263
export function applyCloseupResolutions(ctx & { resolutions: ConcernResolution[]; by }): Promise<...> // :266-273
export function applyConcernConfirms(ctx & { confirms }): Promise<...>                    // :282-306
export function applyConcernResolution(ctx & { resolution: {id; action: "resolve"|"carry"; note?}; by }): Promise<...> // :313-328
export async function applyWaveCloseupFallback(ctx & { ids?: Iterable<string> }): Promise<...> // :337-353
export function partitionSuggestions(suggestions, concernIds): { triage; findings }      // :356-364
export async function reconcileConcerns(ctx): Promise<StoredConcernArtifact[]>             // :391-408
```

### 2.4 Triage/router (`src/core/triage.ts`)

```ts
export function partitionReviewSuggestions(suggestions, concernIds, isTriager): TriagePartition // :35-50
export function concernMailboxId(concernId: string): string                                  // :52-54
export const DEFAULT_CONCERN_SEVERITY_POLICY = { minDigestSeverity: "medium", minBlockingSeverity: "high" } // :62-65
export function resolveConcernSeverityPolicy(concerns?): ConcernSeverityPolicy              // :67-75
export async function routeHumanDisposition(ctx: HumanRouteContext, suggestion, concern?): Promise<string|undefined> // :93-136
export function isDebtConcern(c): boolean                                                    // :143-149
export async function listHydratedConcerns(taskDir, consumer): Promise<Record<string,unknown>[]> // :219-231
export async function hydrateStepConcerns(taskDir, request): Promise<string>                 // :234-247
export function renderConcernsYaml(records, maxBytes = 8000): string                        // :254-286
export async function applyReviewTriage(ctx: ReviewTriageContext): Promise<ReviewTriageOutcome> // :293-349
```

### 2.5 Policy, flows, derivations

- `resolveReviewAllowed(pipeline, agent, isTriager): string[]` — triagers get `dismiss` auto-appended, non-triagers never (`review-policy.ts:27-43`).
- `blockingAdrDisposition(mode)`, `renderAdrMarkdown(adr)`, `persistAdrs({taskWt, taskDir, adrFolder?, adrs, mode})` (`adrs.ts:14-72`).
- `runConcernConsult(params): Promise<{decision?, sessionId?}>` (`consults.ts:319-324`).
- `propagateEpicConcerns(opts)` (`epic-propagation.ts:152-185`).
- `collectRoutedBlockers(taskDir, minBlockingSeverity="high"): Promise<Set<string>>` (`derive/task.ts:52-65`).
- `withRoutedBlocking(state, blockedBy?)` (`derive/item.ts:65-73`); `blockedByConcern(items, concernBlocked)` (`plan/scheduler.ts:68-78`).
- `writeQuestion(rootWt, taskDir, q)` / `questionBlocks(q, target)` (`steer.ts:63-110`, `:117-122`).
- `formatHumanInvolvementCriteria(criteria, mode)` / `formatDispositionsSection(criteria, allowed)` (`prompts.ts:68-111`).

---

## 3. Relevant Excerpts

### 3.1 Stable identity, merge and dedup (`src/core/concerns.ts:49-99`)

```ts
const norm = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
const hash = (prefix, parts) => `${prefix}-${sha256(JSON.stringify(parts)).slice(0,10)}`;
const rmId = (d) => hash("rm", [norm(d.chosen), affectsOf(d.alternatives)]);
function concernFingerprint(c) { return hash("c", [c.kind, norm(c.summary), ...locationOf(c.location)]); }
```
Merge rules (`mergeConcern`, `:71-89`): **longest detail wins** (`utf8Bytes`), **highest severity wins**, `affects` union deduped/sorted, status stays as-is, `source.lastSeen` advances, and a severity increase on an existing record sets `source.escalated = true` (`:76`). `legacyConcern` (`:101-121`) rename-merges pre-union fingerprint files. `aggregateConcerns` serializes per task dir (`KeyedMutex`), validates kind/summary/severity (`:127-132`), writes one `c-*.yaml` / `rm-*.yaml` per fingerprint, and commits per ingest (`:163-166`).

### 3.2 Lifecycle transitions (`src/core/concerns.ts:251-353`)

```ts
// review triage: dismiss → dismissed + dismissReason; everything else → routed
export async function applyConcernTriage(...) {
  const ops = ctx.suggestions.map((s) => [s.id, (record) => s.disposition === "dismiss"
    ? { ...record, status: "dismissed", disposition: s.disposition, dismissReason: s.detail!.trim() }
    : { ...record, status: "routed", disposition: s.disposition, dismissReason: undefined }]);
}
// close-ups only propose; the architect settles
applyCloseupResolutions  // stores pendingResolution {action, note, by, at}; no status change
applyConcernConfirms     // accept resolve→resolved; carry→routed/architect; dismiss→dismissed+reason; propagate→clear only
applyConcernResolution   // resolve closes now; carry leaves pending carry
applyWaveCloseupFallback // triage-less pre-existing open: tech-debt→optional, others→architect, blockers stay open, epic copies skipped
```
Exact lines: `:252-263`, `:266-273`, `:282-306`, `:313-328`, `:337-353`; `partitionSuggestions` at `:356-364`. `reconcileConcerns` (`:391-408`) rebuilds the store from committed `ok` step records, ordered by `endedAt/seq/name`, merging idempotently and committing once if dirty.

### 3.3 Human router (`src/core/triage.ts:93-136`)

```ts
const isRemarkable = suggestion.id.startsWith("rm-");
const dismissedEscalated = suggestion.disposition === "dismiss" && Boolean(concern?.source?.escalated);
const digestOnly = isRemarkable || dismissedEscalated || suggestion.disposition === "human-awareness";
const blocking = !digestOnly && severityAtLeast(severity, ctx.minBlockingSeverity);
const disposition = digestOnly || !blocking ? "human-awareness" : suggestion.disposition;
if (!isRemarkable && !severityAtLeast(severity, ctx.minDigestSeverity)) return undefined;
const id = dismissedEscalated ? `q-escalated-${suggestion.id}` : `q-concern-${suggestion.id}`;
const blocks = disposition === "human-stop" ? [item?, "task"] : disposition === "human-async" ? [item ?? "task"] : [];
await writeQuestion(taskWt, taskDir, { id, ref: item ?? suggestion.id, disposition, question: detail||summary, blocks });
```
`question` = `detail` if present, else `summary`; `rm-*` is exempt from both thresholds; below `minDigestSeverity` nothing is written; below `minBlockingSeverity`, `human-async`/`human-stop` **downgrade to awareness** (losing the exit-10 halt).

### 3.4 Hydration / funnel budgets (`src/core/triage.ts:219-286`)

```ts
const includeRouted = consumer === "closeup" || consumer === "architect";
const includeEscalated = consumer === "architect";
// terseConcern: id, kind, severity, summary, affects?, pendingResolution?, status?, disposition?, dismissReason?, escalated? — never detail (:151-165)
const cap = role === "review" || role === "qa" ? Math.min(diffBytes ?? 0, 2000)
  : role === "wave-close-up" || role === "plan-close-up" ? Math.min(taskDiffBytes ?? 0, 2000)
  : Math.min(inputBytes ?? 0, 500);
```
`renderConcernsYaml` (`:254-286`) tries full → drop `affects` → summary truncation `80/40/16/8/4/1` → fewer entries, returning the first variant under the byte ceiling, else `""`. Step-runner wires the caps from the rendered prompt (`step-runner.ts:429-448`): review/qa by `diff`, close-ups by `git diff parent...HEAD`, everything else by the sum of its own prompt vars excluding `concernsYaml|humanInvolvementCriteria|debt|steering`.

### 3.5 Producer ingest (`src/core/flows/step-runner.ts:193-323`)

Order of operations after a step validates and its canonical artifact is written (`:831-861`):
1. collect `concerns` + `newConcerns`, `remarkable`, `suggestions`, `concernResolutions`, `concernConfirms`, `concernResolution` (`:199-204`); wave-close-up always proceeds even with none (`:212`).
2. allowlist gate keyed on `source.agent` (never the step fragment); dropped raises journal `concern_ingest_skipped` (`:217-231`).
3. snapshot pre-existing ids **before** aggregation so new concerns can never self-triage (`:233-240`).
4. architect `concernConfirms` pre-flight: accepting a `dismiss` proposal requires a non-empty pending note, else `TriageValidationError` fails the step before any mutation (`:246-259`).
5. `aggregateConcerns` then `applyReviewTriage` with `isTriagerAgent(source.agent)` and the configured severity thresholds (`:260-275`).
6. `applyCloseupResolutions` for close-up proposals (`:276`).
7. decision-level `concernResolution` honored only for `consult-concern-<id>`, `architect-closeup*`, `architect-wave-report*`; otherwise journal `concern_resolution_ignored` (`:284-301`).
8. architect confirms applied; accepted `propagate` proposals push the single confirmed copy to the parent (`:305-316`, `:325-341`).
9. wave-close-up fallback over pre-existing ids (`:318-321`).

A `TriageValidationError` turns the step status to `error` with `Review triage failed: …` (`:853-857`); other ingest errors only journal `concern_ingest_error`.

### 3.6 Iteration wiring (`src/core/flows/iteration.ts`)

- Architect hydration deliberately excludes concerns; they arrive only as `concernsYaml` (`:170`), and `debt`/`steering` share the same hydration context object (`:411-420`).
- Plan step persists ADRs through `persistAdrs` (`:441-451`).
- Plan review: `knownConcernIds = await listConcernIds(taskDir)` before the round (`:514`), suggestions partition by exact id (`:564-568`); triage ids never request a revision or influence approval.
- Wave loop: `collectRoutedBlockers(taskDir, minBlockingSeverity)` feeds `deriveWaveState` (`:817-824`); `consultRoutedBlockers` runs one architect consult per routed blocker affecting a pending item before work starts (`:830-850`).
- Wave close-up `:1000-1024`; architect wave report `:1030-1072` (debt var at `:1050`).
- Plan close-up + architect close-up `:1227-1307`; a `blocked` close-up writes `closeup-<N>` question with `blocks:["task"]` (`:1296-1305`).

`consultRoutedBlockers` (`:200-229`) iterates stored concerns, filters `kind==="blocker" && status==="routed"` and `affects ∩ blocked`, then calls `runConcernConsult`; the decision file `decisions/concern-<cid>.yaml` is the idempotency guard (`consults.ts:346-348`, prompt vars `:353-362`, artifact `:385-404`).

### 3.7 Epic/saga pressure (`src/core/flows/epic-propagation.ts`)

```ts
const VERBATIM_BYTES = 120; const CONDENSED_CAP_BYTES = 500;
function condenseText(text) { const size = utf8Bytes(text);
  return size <= 120 ? text : truncateUtf8(text, Math.min(500, Math.floor(size / 2))); }
function concernCopy(c, epic) { return { ...c, summary: `[epic] ${c.summary}`, detail: condenseText(c.detail ?? c.summary) }; }
```
Copies only `open`/`routed` child concerns and `open` remarkables (`:157-164`); copies keep `affects` unchanged and record `source.epic` with `record: epic:<epic>/<record>` (`:168`); parent copies stay open, so only forwarded `q-epic-*` questions can block the parent. `forwardBlockedQuestions` (`:97-129`) remaps `blocks: ["task"] → [parentTaskSlug]` and other blocks to the epic slug. Engine calls it after each child iteration, inside one lock + one commit with `child-closeup.yaml` (`engine.ts:266-296`).

### 3.8 ADRs (`src/core/flows/adrs.ts`)

```ts
blockingAdrDisposition(mode) => mode === "principal" || mode === "detailed" ? "human-async" : "human-stop"
renderAdrMarkdown: "# title" / "## Context" / "## Decision" / "## Consequences" / "## Blocking"
persistAdrs: blocking → writeQuestion({ref: adr.id, disposition: mode-based, blocks:["task"], draftDecision: decision});
             remarkable → disposition "human-awareness", no blocks
```
Markdown is written only when `adrFolder` is configured; mailbox routing always runs (`:46-71`). `PlanAdr.blocking?: boolean` (`artifacts.ts:246-254`).

### 3.9 Derivation: blockers, debt, counts

```ts
// derive/task.ts:52-65
export async function collectRoutedBlockers(taskDir, minBlockingSeverity = "high") {
  for (const concern of await listConcerns(taskDir))
    if (concern.kind === "blocker" && concern.status === "routed" && severityAtLeast(...))
      for (const slug of concern.affects ?? []) affected.add(slug);
}
```
`deriveTaskState` maps routed names through `blockedByConcern(...)` → `withRoutedBlocking` for **pending** items only (`:174-196`); `scheduler.ts:68-78` unions with blocked-by-failure and cascades over declared `deps` to a fixpoint. Debt (`:219-263`): plan `techDebt` + `accept-with-debt` decisions + `isDebtConcern` (routed/resolved `tech-debt`, routed `optional`) with `[item] ` prefix + optional review findings. Counts come from `countConcerns` (`:369`) and are written into `state.yaml` (`:371-395`).

### 3.10 Surfacing (`src/cli/status.ts:84-125`, `steer.ts:63-122`)

```ts
console.log(`Concerns: open ${n} | dismissed ${n} | routed ${n} | resolved ${n}`);
console.log(`Blocking Questions:`); printQuestions(...isBlocking);
console.log(`Digest Questions:`);  printQuestions(...!isBlocking);
```
`isBlocking` = `human-stop` OR non-empty `blocks` OR `questionBlocks(q, "task")`. `writeQuestion` derives id `q-${cleanRef}-${sha256(ref:question:disposition).slice(0,10)}` and **never clobbers an existing entry** (operator answers survive re-runs) (`steer.ts:63-110`). `questionBlocks` treats `human-awareness` as never blocking (`:117-122`).

### 3.11 Prompt surfaces (`src/core/prompts.ts`, `agents/`)

- `formatHumanInvolvementCriteria` keeps the active `## <mode>` section plus shared sections (blocking table) and drops inactive modes (`prompts.ts:68-84`).
- `formatDispositionsSection` prepends the allowed list and filters `human-stop`/`dismiss` criteria rows when not allowed (`prompts.ts:91-111`).
- Reviewer: `agents/steps/review.md:18-24` — triage pre-existing `c-*`/`rm-*` by exact id, `dismiss` needs `detail`, condense/dismiss stale, raise new concerns with evidence.
- Plan reviewer: `agents/steps/plan-review.md:14-15,35-38` — triage ids never request a revision.
- Close-ups: `agents/steps/wave-close-up.md:20-26`, `agents/steps/plan-close-up.md:23-29`, `agents/steps/architect-closeup.md:23-29`, `agents/steps/architect-wave-report.md:26-32`, `agents/steps/architect-consult-nonitem.md:24-30`, `agents/steps/architect-plan.md:40-46`.
- Mode criteria: `agents/criteria/human-involvement.md:1-28` (blocking table + per-mode prose); dismissal criteria: `agents/criteria/dispositions.md:5-20`.

### 3.12 Config (`config/pipeline.default.yaml`)

- Review policy incl. `dismiss` explanation and auto-append (`:359-379`); default list omits `human-stop`.
- `humanInvolvement: autonomous` (`:395`); `concerns` defaults allowlist + `minDigestSeverity: medium`, `minBlockingSeverity: high` (`:397-408`).
- Commented presets for `autonomous`/`principal`/`detailed` (`:410-429`) and the ADR blocking table (`:431-437`); `principal` uses digest `low` / blocking `medium`, `detailed` both `low`.
- `criteria.human-involvement` wired to `agents/criteria/human-involvement.md` (`:460-463`).

### 3.13 Schemas carrying the contract

| Schema | Concern fields |
|---|---|
| `config/schemas/developer-output.schema.json:61-85` | `concerns[]` (kind/summary/detail/severity/location/affects) + `remarkable[]` |
| `config/schemas/review.schema.json:20-31,47-71` | full disposition enum incl. `dismiss`; `remarkable[]`; `newConcerns[]` |
| `config/schemas/plan.schema.json:115-159` | `adrs[]` with `blocking`; `concerns[]`; `remarkable[]` |
| `config/schemas/decisions.schema.json:48-93` | `concerns[]`, `remarkable[]`, `concernConfirms[]`, `concernResolution{resolve|carry}` |
| `config/schemas/plan-closeup.schema.json:27-73` | `concerns[]`, `remarkable[]`, `concernConfirms[]`, `concernResolutions{resolve|carry|propagate|dismiss}` |
| `config/schemas/wave-closeup.schema.json:35-70` | same minus confirms |
| `config/schemas/state.schema.json:72-99` | required `concerns {open,dismissed,routed,resolved}` |
| `src/core/records/review-schema.ts:5-51` | generates the disposition enum from the agent's allowed set |

### 3.14 Step→schema binding (`src/core/flows/step-runner.ts:132-160`)

`developer → developer-output`, `reviewer/qa → generated review`, `plan-close-up` **and** `architect-closeup → plan-closeup.schema.json`, `wave-close-up → wave-closeup`, `architect-consult-*`/`architect-wave-report → decisions`, `architect-plan → plan.schema.json`.

---

## 4. Existing Tests & Conventions

- **Runner:** `bun test` (`package.json:10`); typecheck `bun run typecheck` (`tsc --noEmit`, `:11`). Behavior tests only; no linting tests (spec item 15 / ARCHITECTURE:452).
- **Pattern:** `bun:test` + `test/helpers/tmp-repo.ts` (`createTmpRepo()` → temp git repo, deterministic identity env, worktree helpers, `cleanup()`), `FakeHarness` scripted by label, real `runAgentStep`/`runIteration` with a minimal `PipelineConfig`/`ProjectConfig`, assertions against disk (`concerns/*.yaml`, `steer/tousertoreview`, `state.yaml`), git (`ls-tree`, `status --porcelain`), and journal entries. Example setup: `test/engine/closeup-lifecycle-resolve.test.ts:1-60`.
- **Suite map (all green):**

| Suite | Focus |
|---|---|
| `test/engine/concerns-funnel.test.ts:37-1189` | schemas, fingerprint identity, aggregation/merge/escalation, dismiss reason, partitions, rm-* triage, concurrency, producer wiring (reviewer/consult/close-up), reconcile |
| `test/engine/reviewer-triage.test.ts:39-530` | terse hydration, exact-id partition, dismiss/routing, debt predicate, fixRequired once, dedup mailbox, non-triager gate |
| `test/engine/plan-reviewer-triage.test.ts:28-436` | plan-review hydration/triage, architect-revise concerns, triage ids never trigger revisions, debt derive |
| `test/engine/closeup-lifecycle-resolve.test.ts:168-598` | confirm accept/reject, propagate, dismiss-note validation, consult unblock, wave fallback |
| `test/engine/epic-saga-propagate.test.ts:139-656` | `[epic]` copies, 120/500 condensing, restart idempotency, `q-epic-*`, saga hydration, failed-child push |
| `test/engine/funnel-text-budget.test.ts:1-482` | **finding-only spike**: UTF-8 bytes, 2000/500 caps, 120/500 epic caps, strictly-fewer-bytes contract helpers (local to the test) |
| `test/engine/hydration-fingerprint-caps.test.ts:85-860` | per-consumer hydration sets and caps, affects union, counts exclude remarkables |
| `test/engine/routing-blocker-derive.test.ts:160-397` | routed blocker collection, pending-only blocking, transitive deps, terminal/running immunity |
| `test/engine/routing-architect-consult.test.ts:123` | routed blocker → one architect consult, idempotent decision file |
| `test/engine/human-router-severity.test.ts:131-699` | single router, severity downgrade/suppression, dismissed-escalated digest, rm-* digest |
| `test/engine/routing-human-debt.test.ts:34-284` | human-alert blocking semantics, exit 10, debt prefixes |
| `test/engine/adr-blocking-digest.test.ts:69-390` | blocking vs remarkable ADR, mode table, no-adrFolder routing |
| `test/engine/state-concern-counts.test.ts:33-159` | counts by status, zero/missing dir, corrupt skip, state.yaml materialization |
| `test/cli/status-concerns.test.ts:39-130` | counts line + blocking/digest split |
| `test/contracts/concern-artifact-types.test.ts`, `concern-schemas.test.ts`, `state-concern-schema.test.ts`, `schema-detail-normalize.test.ts` | type/schema contracts incl. `concernConfirms` in architect report/close-up schemas |
| `test/human-involvement-config.test.ts:138-481` | defaults/layering/null deletion, schema closure, commented presets, active-mode prompt selection, triager fragment matrix |
| `test/review-policy.test.ts:55-380` | builtin/per-agent/legacy resolution, dismiss append/gating, triager set, generated schema |
| `test/docs-concerns.test.ts:84-346` | docs sentinels (§1 row, §8.11 phrases, §3 modules, §5 sample, §6.2 folder, §8.7 dismiss, §10 vars/budgets, §11 status, §13 suites, README, config commentary) |

- **Docs-sentinel constraint:** any ARCHITECTURE/README/config commentary edit must keep the exact phrases asserted in `test/docs-concerns.test.ts:87-346` (e.g. row 18 must contain `**Implemented**`, the five deviation names and five `adr-*` ids; §8.11 must contain `c-{fingerprint}.yaml`, `longest detail wins`, `routeHumanDisposition`, `q-concern-{id}`, `120`, `500`, `2000`, `8000`, etc.). Run that suite after any doc change.
- **Allowlist agreement:** `DEFAULT_RAISE_ALLOWLIST` mirrors shipped config, asserted by `human-involvement-config.test.ts` and `funnel-text-budget`/`reviewer-triage` suites.

---

## 5. Open Questions & Uncertainties (verified residual gaps)

1. **Architect `concernConfirms` is schema-valid but prompt-silent.** The engine applies confirms only for `source.agent === "architect"` (`step-runner.ts:246-259,305-316`), and `decisions.schema.json:73-83` + `plan-closeup.schema.json:52-62` allow them, but every architect prompt tells the model only to “record concernResolutions” (`agents/steps/architect-closeup.md:29`, `architect-wave-report.md:32`, `plan-close-up.md:29`, `wave-close-up.md:26`). Consequence: pending close-up proposals may never be accepted/rejected in real runs. Engine tests drive confirms by constructing output directly (e.g. `closeup-lifecycle-resolve.test.ts:162-260`), not through prompt guidance. Decide whether to add a terse confirm instruction (and possibly a test that architect output includes it).
2. **Close-up `dismiss` action is allowed by schema but absent from prompt enumerations.** `plan-closeup.schema.json:63-73` and `wave-closeup.schema.json:60-70` allow `dismiss`, yet the fragments list only `resolve/carry/propagate`. `applyConcernConfirms` requires a pending note for an accepted dismiss (`concerns.ts:295-301`) and the pre-flight fails otherwise (`step-runner.ts:246-259`). Either document/teach it or narrow the schema (`adr-closeup-no-suggestions-triage`).
3. **“Each level passes up less detail” is prompt guidance + hydration caps, not an enforced invariant.** Merging keeps the *longest* detail (`concerns.ts:74`); terseness exists only in hydration (`triage.ts:151-165,234-247`) and epic push (`epic-propagation.ts:35-58`). `funnel-text-budget.test.ts:411-450` encodes a strictly-fewer-bytes contract but its helpers are local to the finding-only spike (“no production code is added here”, header `:1-21`); no production assertion checks reviewer→architect→close-up shrinkage. If the bullet must be enforced, add a code-level rule or a production test.
4. **Remarkables reach the mailbox only when a triager emits a suggestion with the `rm-*` id** (`triage.ts:98-115`; reviewer prompt `review.md:21`). Storage and hydration of open remarkable records is automatic (`triage.ts:200-216`), but there is no engine-side digest for an open remarkable that no reviewer re-emits. Confirm this is the intended “same aggregation/triage as concerns” reading (`docs/factory.v2.md:96`).
5. **`affects` refs beyond item slugs are inert for blocking.** `collectRoutedBlockers` returns all `affects` strings (`derive/task.ts:52-65`) but `blockedByConcern` matches only item slugs in the current plan (`plan/scheduler.ts:68-78`); epic/plan refs are stored and displayed but never block or consult. Decide whether to resolve epic/plan refs or document the limitation.
6. **Plan `{{debt}}` is architect hydration, not derived debt.** `iteration.ts:417` and `:1050` pass `hydrationContext` (prior plans/closeups/steering/decisions), whereas `StateArtifact.debt` is derived in `derive/task.ts:219-263`. Concern-derived debt therefore reaches the architect only through routed `concernsYaml`, not the debt section. This is likely intentional cache economy but worth confirming before adding anything.
7. **Counts intentionally exclude remarkables** (`concerns.ts:206-207` filters `c-*`; ARCHITECTURE:356). If item 18’s “counts” should include `rm-*`, this is a small change plus docs/sentinel updates.
8. **Digest mailbox has no retention/archival rule** (documented ARCHITECTURE:356) — entries accumulate in `steer/tousertoreview`; only human answers/steering move them.
9. **Epic config is root-only** (`ARCHITECTURE.md:120,361`): a per-task `pipeline.yaml` selecting `principal`/`detailed` does not reach epic children, so mode selection is not uniform across a saga. Accepted deviation `adr-epic-config-root-only`.
10. **Simple tasks have no reviewer/wave**, so their concerns stay open (`ARCHITECTURE:360`, deviation `adr-funnel-triage-coverage`); close-up fallback only exists for story flows.
11. **Autonomous mode halts immediately at plan time** for blocking ADRs rather than deferring until unblocked work is done (`ARCHITECTURE:359`, `adr-autonomous-immediate-halt`) — differs from the literal spec wording in `docs/factory.v2.md:100`.
12. **Presets are commented examples, not selectable presets keyed by name.** “Selectable per task” currently means copying a block into `{task}/pipeline.yaml` (README:107-121, config:410-429); `humanInvolvement` itself is just a string. If the architect wants a named preset mechanism, that is new surface.
13. **`aggregateConcerns` commits on every ingest** (`concerns.ts:163-166`) except epic pushes (`commit:false`). Any new producer wiring must account for this commit ordering: ingest commits in `taskWt` before the step record’s final commit (`step-runner.ts:843-898`).
14. **10-hex-char ids** (`concerns.ts:53-54`) are stable but short; collision handling relies on the fingerprint file layout. No test covers collisions (negligible probability, but a design assumption).

---

## 6. Quick Reference — Spec Bullet → Evidence

| `docs/factory.v2.md` bullet | Implementation | Tests |
|---|---|---|
| structured `concerns[]` + remarkable decisions | `artifacts.ts:301-327`; schemas `developer-output:61-85`, `review:47-71`, `plan:135-159`, `decisions:48-72`, `plan-closeup:27-51`, `wave-closeup:35-59` | `concerns-funnel.test.ts:37-192`, `concern-schemas.test.ts` |
| engine aggregation, fingerprint, dedup, status, source | `concerns.ts:49-168,171-230`; `engine.ts:385` | `concerns-funnel.test.ts:320-843`, `hydration-fingerprint-caps.test.ts:809+` |
| reviewer triage + `dismiss` | `review-policy.ts:18-43`; `triage.ts:35-50,288-349`; `review-schema.ts:5-51` | `reviewer-triage.test.ts`, `plan-reviewer-triage.test.ts`, `review-policy.test.ts` |
| routing blocker→item+consult / architect / human-* / debt | `triage.ts:83-149`; `concerns.ts:330-353`; `iteration.ts:200-229,830-850`; `derive/task.ts:52-65,174-196`; `scheduler.ts:68-78`; debt `derive/task.ts:245-250` | `routing-blocker-derive.test.ts`, `routing-architect-consult.test.ts`, `routing-human-debt.test.ts`, `human-router-severity.test.ts` |
| close-ups list/re-triage/resolve-or-carry | `concerns.ts:265-353`; `iteration.ts:1000-1024,1227-1307` | `closeup-lifecycle-resolve.test.ts`, `plan-reviewer-triage.test.ts` |
| configurable allowlist/dispositions/thresholds | `artifacts.ts:126-138`; `pipeline.schema.json:202-237`; `pipeline.default.yaml:359-437`; `review-policy.ts:27-43` | `human-involvement-config.test.ts`, `review-policy.test.ts` |
| funnel worker→reviewer→epic→saga→human with less detail | `triage.ts:219-286`; `epic-propagation.ts:35-58,141-185`; `engine.ts:266-296` | `epic-saga-propagate.test.ts`, `funnel-text-budget.test.ts`, `hydration-fingerprint-caps.test.ts` |
| blocking vs remarkable ADRs, digest never waits | `adrs.ts:14-72`; `plan.schema.json:127-130` | `adr-blocking-digest.test.ts` |
| human-involvement presets `autonomous`/`principal`/`detailed` | `prompts.ts:61-111`; `criteria/human-involvement.md`; `pipeline.default.yaml:381-437`; README:99-128 | `human-involvement-config.test.ts`, `docs-concerns.test.ts` |
| close-up/status/state counts | `derive/task.ts:369-415`; `state.schema.json:72-99`; `status.ts:84-116` | `state-concern-counts.test.ts`, `status-concerns.test.ts` |
| ARCHITECTURE §1 row + README + config commentary | `docs/ARCHITECTURE.md:39,330-363`; `README.md:99-128`; `config/pipeline.default.yaml:359-437` | `docs-concerns.test.ts:84-346` (sentinels) |

---

## 7. Suggested First Checks for the Architect (read-only, cheap)

- `bun test test/engine/concerns-funnel.test.ts test/engine/reviewer-triage.test.ts test/cli/status-concerns.test.ts test/docs-concerns.test.ts` (49 tests, ~6.5s) before planning any change.
- `grep -n "concernConfirms\|concernResolutions" plugins/software-factory/agents/steps/*.md` to see the prompt/schema asymmetry (open question 1/2).
- `grep -n "affects" plugins/software-factory/src/core/derive/task.ts plugins/software-factory/src/core/plan/scheduler.ts` for the blocking-ref scope (open question 5).
- If docs change: `bun test test/docs-concerns.test.ts` immediately (exact-phrase sentinels).


## Task Status
iteration: 6
amendments: 0
items:
  - schema-detail-normalize-v4 kind=dev wave=1 status=merged outlineRef=schema-detail-normalize-v4
waves: 1
merged: schema-detail-normalize-v4
blocked: (none)
failed: (none)
open steer questions:
  - awareness-plan-2-autonomous-halt-deviation ref=plan-2 disposition=human-awareness: Spec autonomous defers blocking until unblocked work drains, but implementation routes blocking ADRs at plan time and halts immediately (iteration.ts:481-490). Plan ADR accepts immediate halt for iteration 2 with docs in ARCHITECTURE 8.11/human-involvement.md, drain scheduling future work. High-impact tradeoff operator should be aware of; architect can decide now. Ensure docs mark deviation explicitly.
  - awareness-plan-3-epic-config-awareness ref=plan-3 disposition=human-awareness: Plan ADR documents that humanInvolvement/concerns/reviewPolicy at root do not apply inside epics, deviating from ARCHITECTURE section 5 inheritance claim. Operators setting mode once at root will be surprised. Document-only decision is reasonable for closure scope but needs informational steer record like autonomous-halt awareness.
  - awareness-plan-4-funnel-triage-coverage-awareness ref=plan-4 disposition=human-awareness: adr-funnel-triage-coverage accepts simple-task concerns stay open forever (simple flow ARCHITECTURE.md:146 has only develop, no review/waves/fallback which runs only for wave-close-up per step-runner.ts:319) and consult/wave-report/closeup architect output bypasses plan-reviewer. Assumptions claim operator notified only for halt and epic-config deviations. Architect can decide closure, but operator should have an informational record that part of spec triage is deferred. Create awareness record; no blocking decision needed.
  - awareness-plan-4-remarkable-threshold-exemption-accepted ref=plan-4 disposition=human-awareness: Architect accepts via ADR that every routed rm-* digests regardless of minDigestSeverity (triage.ts:108-115), counts cover c-* only (concerns.ts:194-195), digest has no retention. Spec line 103 demands low-noise confirmed mailbox; unconditional digest could be noisy. Operator notified only via remarkable ADR digest entries, no blocking question. Flag for operator awareness; architect decision stands for closure.
  - awareness-schema-detail-normalize-v4-baseline-premise-false ref=schema-detail-normalize-v4 disposition=human-awareness: Hex ground truth (64=d low, 44=D cap): all 7 schemas 0 cap-quoted keys (review 2 low, 6 producers 1 low each); concerns.ts:82 guard 2e 64 low; epic-saga 248/307/313/319 low reads; funnel 0 cap-dot. No schema/guard/test flip was needed. Test-first invented legacy Detail->detail normalization to get honest red. Operator should note decision-026 closure rests on already-green baseline, not the claimed RED gap.

## Output

Yield a structured JSON object matching this schema:
- iteration (integer, required, min: 1)
- status (string, required, enum: ["complete","next-iteration","blocked"])
- summary (string, required)
- question (string, optional)
- completedMilestones (array of string, optional)
- remainingMilestones (array of string, optional)
- techDebt (array of string, optional)
