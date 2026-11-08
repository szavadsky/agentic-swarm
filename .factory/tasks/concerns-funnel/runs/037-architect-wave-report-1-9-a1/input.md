# Step: Architect Wave Report

## Goal
Evaluate the results of a completed execution wave, assess spike findings and accumulated debt, and decide the iteration path.

## Rules
- Exploration budget: evaluate wave progress from the current plan, wave report, spike findings, and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)

This context pack prepares codebase and architectural context for implementing **spec item 18** of `docs/factory.v2.md` in `plugins/software-factory`. All file references use repo-relative paths (`plugins/software-factory/...`) with verified line ranges.

---

## 0. Acceptance Definition (Spec Item 18)

From `docs/factory.v2.md:89-103`:
- **Output contracts**: Every agent output may carry structured `concerns[]`: `{kind: tech-debt|assumption|blocker|risk|question, summary, detail, location?, severity: low|medium|high, affects?: item/epic/plan refs}`. Agents also report remarkable decisions/tradeoffs (`{chosen, alternatives, why}`).
- **Aggregation**: Engine aggregates them in `{task}/concerns/` with stable id (fingerprint), dedup across steps/attempts, status (`open|dismissed|routed|resolved`), and source step record pointer.
- **Triage**: Step reviewer (workhorse class; architect output → plan-reviewer) triages with review disposition vocabulary plus `dismiss` (logged with reason, kept in folder, no further action).
- **Routing**:
  - `blocker` affecting dependent item → dependent item blocked + architect consult.
  - `architect` → next architect turn (wave report / next iteration plan input).
  - `human-*` → steer mailbox per `reviewPolicy`.
  - `tech-debt` → plan tech-debt list.
- **Funneling**: `worker agents → workhorse reviewer (confirm/dismiss, condense) → epic architect → [saga architect] → human`. Every level passes up less detail than it receives and never more text than the code it summarizes; each level may resolve, steer, or propagate up. In a saga, epic-level concerns/decisions propagate to the saga architect.
- **ADRs**: Marked blocking or non-blocking. Blocking = needs human decision per active mode. Remarkable = below blocking threshold, reported in mailbox digest, never waits.
- **Human-involvement mode presets**: `autonomous`, `principal`, `detailed` (pipeline config + reviewer/architect prompt fragments), shipped as commented default config examples, selectable per task.
- **Surfacing**: Wave/plan close-ups list open concerns; close-up reviewers re-triage; architect resolves or carries; `factory status` and `state.yaml` show counts.
- **Deliverables**: Update `plugins/software-factory/docs/ARCHITECTURE.md` (§1 row 18, §6.2 task folder, §8), README, config commentary. Keep prompts terse (debloated). Behavior tests only.

---

## 1. Module Map

| Subsystem / Path | Architectural Responsibility | Key Citations |
|---|---|---|
| **Artifact & Configuration Types**<br>`plugins/software-factory/src/core/artifacts.ts` | Single source of TypeScript interfaces matching JSON schemas: `ReviewArtifact`, `DeveloperOutputArtifact`, `PlanArtifact`, `DecisionArtifact`, `SteerItemArtifact`, `StateArtifact`, `PipelineConfig`, `PipelineLimits`. | `artifacts.ts:77-133` (config), `artifacts.ts:288-373` (review, developer, closeup, decisions), `artifacts.ts:449-459` (state) |
| **JSON Schemas**<br>`plugins/software-factory/config/schemas/*.json` | Authoritative contracts for harness schema validation and `complete(@simpler)` structural repair: `review.schema.json`, `developer-output.schema.json`, `plan.schema.json`, `plan-closeup.schema.json`, `wave-closeup.schema.json`, `decisions.schema.json`, `steer-item.schema.json`, `state.schema.json`, `pipeline.schema.json`. | `config/schemas/developer-output.schema.json:61-69` (current free-form string concerns), `config/schemas/plan.schema.json:70-138` (adrs, techDebt, assumptions), `config/schemas/pipeline.schema.json:202-218` (reviewPolicy) |
| **Step Runner & Schema Resolution**<br>`plugins/software-factory/src/core/flows/step-runner.ts` | Dispatches agent turns, manages step record lifecycle, validates/repairs output, enforces HEAD guards, calls `writeArtifact` seam, commits worktree per step (§6 Invariants). | `step-runner.ts:25-30`, `step-runner.ts:90-110` (schema resolution), `step-runner.ts:220-230`, `step-runner.ts:610-655` (writeArtifact seam & commit) |
| **Review Schema Generator**<br>`plugins/software-factory/src/core/records/review-schema.ts` | Generates agent-specific JSON schema restricting `suggestions[].disposition` to the agent's allowed enum (§8.7). Natural insertion point for extending vocabulary with `dismiss`. | `review-schema.ts:5-52` (`generateReviewSchema`) |
| **Item Step Machine**<br>`plugins/software-factory/src/core/flows/item-machine.ts` | Drives per-item step execution (`develop` → `qa` → `review`), passes prompt vars (diff, target, dispositions criteria), collects suggestions, routes `human-async` to mailbox via `writeArtifact`. | `item-machine.ts:280-310` (suggestions loop), `item-machine.ts:628-647` (prompt review wiring), `item-machine.ts:706-728` (`writeQuestion` mailbox write), `item-machine.ts:750-765` (terminal conditions) |
| **Architect Iteration Flow**<br>`plugins/software-factory/src/core/flows/iteration.ts` | Orchestrates iteration lifecycle: `architect-plan` → `plan-review` loop (with `alt-architect`) → `pm-edits` → wave execution → `wave-close-up` → `architect-wave-report` → `plan-close-up` → `architect-closeup`. Writes ADRs, handles blocked questions. | `iteration.ts:335-400` (plan & ADR write), `iteration.ts:430-540` (plan review & revise), `iteration.ts:850-930` (wave close-up & report), `iteration.ts:1075-1150` (plan close-up & question write) |
| **Architect Consults & Decisions**<br>`plugins/software-factory/src/core/flows/consults.ts` | Dispatches `architect-consult-item` / `architect-consult-nonitem` on attempt/fix-round/merge failures; writes `{seq}-item-{item}.yaml` in `decisions/`; handles `human-async` question write. | `consults.ts:60-120` (item consult prompt), `consults.ts:130-180` (decision write & mailbox) |
| **Steering Mailbox**<br>`plugins/software-factory/src/core/steer.ts` | Root task mailbox: `writeQuestion` writes `steer/tousertoreview/{id}.yaml` with deterministic sha256 id; `listPending` reads `fromuserpending`; `classify` routes answers/directives/stop. | `steer.ts:18-40` (`listPending`), `steer.ts:59-110` (`writeQuestion`), `steer.ts:116-176` (`classify`) |
| **State Derivation & Counts**<br>`plugins/software-factory/src/core/derive/task.ts`<br>`plugins/software-factory/src/core/derive/item.ts`<br>`plugins/software-factory/src/core/derive/wave.ts` | Derives authoritative state from committed records + git (`deriveTaskState`, `toStateArtifact`, `deriveItemState`, `deriveWaveState`). Collects debt from plan, `accept-with-debt` decisions, and `optional` review suggestions. Cascades blocked dependencies. | `derive/task.ts:68-126` (iterations, closeups, open questions), `derive/task.ts:167-205` (debt collection), `derive/task.ts:307-335` (`toStateArtifact`), `derive/item.ts:180-260` (decisions & questions), `derive/wave.ts:44-63`, `85-100` (dependency blocking) |
| **Plan Scheduler**<br>`plugins/software-factory/src/core/plan/scheduler.ts` | Dependency-aware scheduling (`blockedByFailure`, `runnable`, `nextWave`). Transitive fixpoint for cascading blocked items. | `scheduler.ts:16-36` (`blockedByFailure`), `scheduler.ts:47-90` (`nextWave`), `scheduler.ts:101-135` (`runnable`) |
| **Fingerprints & Normalization**<br>`plugins/software-factory/src/core/fingerprint.ts`<br>`plugins/software-factory/src/core/loops.ts` | Deterministic hashing: `fingerprintText` (sha1 after whitespace/case normalization), `fingerprintObject` (sorted keys), `fingerprintSuggestions`. Reusable for stable concern fingerprint IDs and dedup. | `fingerprint.ts:10-50`, `loops.ts:169-178` |
| **Prompt Library & Registry**<br>`plugins/software-factory/src/core/prompts.ts`<br>`plugins/software-factory/src/core/prompt-vars.ts` | Prompt fragment rendering, `KNOWN_VARS` placeholder registry, `loadCriteriaBundle`, `formatDispositionsSection`, preflight prompt validation (`preflightPrompts`). | `prompts.ts:50-80` (`formatDispositionsSection`), `prompts.ts:420-520` (`preflightPrompts`), `prompt-vars.ts:12-38` (`PROMPT_VAR_DESCRIPTIONS`), `prompt-vars.ts:44-161` (`KNOWN_VARS`) |
| **CLI Status**<br>`plugins/software-factory/src/cli/status.ts` | Formats and prints derived task state, waves/items, open steer questions (`tousertoreview`), and recorded tech debt. | `status.ts:50-108` |
| **Engine Orchestration & Epics**<br>`plugins/software-factory/src/core/engine.ts` | Core derive-act-commit loop (`runTask`); spawns and manages child epics (`runChildTask`); processes mailbox directives; enforces budget stops (exit 10). | `engine.ts:208-285` (`runChildTask`), `engine.ts:325-335` (operator-editable globs), `engine.ts:380-465` (mailbox loop & budget stop), `engine.ts:685-715` (iteration invocation) |
| **Configuration Loading & Layering**<br>`plugins/software-factory/src/core/config/loader.ts`<br>`plugins/software-factory/src/core/config/merge.ts` | Loads and layers default → project (`.factory/pipeline.yaml`) → task (`{task}/pipeline.yaml`). Maps merge, arrays replace, `null` deletes. Validates against `pipeline.schema.json`. | `loader.ts:58-150`, `merge.ts:10-60` |
| **Agent Prompt Definitions**<br>`plugins/software-factory/agents/**` | Agent frontmatter and instructions: `developer.md`, `reviewer.md`, `plan-reviewer.md`, `architect.md`, `wave-close-up.md`, `plan-close-up.md`, `_shared/dispositions.md`, `criteria/dispositions.md`. | `agents/developer.md`, `agents/reviewer.md`, `agents/plan-reviewer.md`, `agents/criteria/dispositions.md:1-25`, `agents/_shared/dispositions.md:1-30` |

---

## 2. Key Interfaces & Signatures

### 2.1 Existing Artifact Types (`src/core/artifacts.ts`)

```typescript
// Review Dispositions (§8.7, artifacts.ts:288-295)
export type ReviewDisposition =
  | "fix"
  | "optional"
  | "architect"
  | "human-awareness"
  | "human-async"
  | "human-stop";

// Review Suggestion & Output (artifacts.ts:296-311)
export interface ReviewSuggestion {
  id: string;
  disposition: ReviewDisposition | string;
  summary: string;
  detail?: string;
  location?: { file: string; line?: number };
}
export interface ReviewArtifact {
  status: "approved" | "changes_requested";
  summary: string;
  suggestions: ReviewSuggestion[];
}

// Current Developer Output (artifacts.ts:318-325) — free-form string concerns only
export interface DeveloperOutputArtifact {
  status: "ok" | "blocked" | "failed";
  summary: string;
  target?: DeveloperTarget;
  evidence?: string[];
  concerns?: string[];   // <--- Free-form string array; must become structured Concern[]
  notes?: string;
}

// Plan ADRs & Tech Debt (artifacts.ts:228-252)
export interface PlanAdr {
  id: string;
  title: string;
  context: string;
  decision: string;
  consequences?: string;
  // Missing: blocking?: boolean
}
export interface PlanTechDebt {
  id: string;
  description: string;
  category: "adjacent" | "impacting" | "blocking";
  resolution?: string;
}

// Steer Mailbox Item (artifacts.ts:375-386)
export interface SteerItemArtifact {
  id: string;
  ref: string;
  disposition: string;
  question: string;
  draftDecision?: string;
  blocks?: string[];
  status: "open" | "answered" | "dismissed";
  createdAt?: string;
  answeredAt?: string;
  answer?: string;
}

// State Artifact (artifacts.ts:449-459)
export interface StateArtifact {
  task: string;
  kind?: string;
  status: "active" | "blocked" | "done" | "failed";
  iteration: number;
  currentWave?: number;
  items: Record<string, StateItemInfo>;
  debt?: string[];
  budgetSpentUsd?: number;
  lastUpdated: string;
  // Missing: concern counts & summary
}
```

### 2.2 Spec Item 18 Structured Concern Type (Required Target Contract)

Per `docs/factory.v2.md:90`:
```typescript
export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
export type ConcernSeverity = "low" | "medium" | "high";
export type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";

export interface Concern {
  id?: string;                        // Stable fingerprint id assigned by engine
  kind: ConcernKind;
  summary: string;
  detail: string;
  location?: { file: string; line?: number };
  severity: ConcernSeverity;
  affects?: string[];                 // item / epic / plan references
}

export interface RemarkableDecision {
  chosen: string;
  alternatives: string[];
  why: string;
}

export interface StoredConcernArtifact extends Concern {
  id: string;
  status: ConcernStatus;
  disposition?: string;               // Assigned during triage
  dismissReason?: string;             // When disposition is "dismiss"
  source: {
    record: string;                   // Step record directory name, e.g. "003-review-a1"
    agent: string;
    step: string;
    item?: string;
    iteration?: number;
  };
  createdAt: string;
  updatedAt: string;
}
```

### 2.3 Review Schema Generation (`src/core/records/review-schema.ts:5-52`)

```typescript
export function generateReviewSchema(
  allowedDispositions: string[]
): Record<string, unknown>;
```
Currently generates schema where `suggestions[].disposition` is an enum of `allowedDispositions` (default: `["fix", "optional", "architect", "human-awareness", "human-async"]`). Triage extension must allow `dismiss` in this vocabulary.

### 2.4 Step Execution & Schema Resolution (`src/core/flows/step-runner.ts`)

```typescript
export interface StepRunOptions {
  task: string;
  item?: string;
  stepId: string;
  stepFragment?: string;
  agent: string;
  role?: string;
  cwd: string;
  taskDir: string;
  recordsDir: string;
  repo: any;
  harness: Harness;
  pipeline: PipelineConfig;
  project: ProjectConfig;
  prompts: any;
  promptVars: Record<string, string>;
  writeArtifact?: (output: unknown) => Promise<void>;  // <--- Seam: runs before finishStepRecord
  // ...
}
export interface StepRunResult {
  ok: boolean;
  status: StepMetaStatus;
  output?: unknown;
  meta: StepMetaArtifact;
  sessionId?: string;
}
```

---

## 3. Relevant Code Excerpts & Current Wiring

### 3.1 Item Machine: Review Allowed Dispositions & Prompt Wiring
From `plugins/software-factory/src/core/flows/item-machine.ts:631-647`:
```typescript
  const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
  const reviewAllowed =
    pipeline.reviewPolicy?.allowedDispositions ??
    pipeline.reviewPolicy?.[currentStep.agent] ??
    ["fix", "optional", "architect", "human-awareness", "human-async"];

  const promptVars: Record<string, string> = {
    assignment: assignmentYaml,
    intent: intentText,
    target: lastDeveloperTarget ? JSON.stringify(lastDeveloperTarget, null, 2) : "tests",
    citations: JSON.stringify(itemState.assignment?.citations ?? [], null, 2),
    context: "",
    checks: failingCheckSummaries.join("\n"),
    testDiff: "",
    diff: diffRes.stdout,
    feedback: feedbackText,
    dispositionsCriteria: formatDispositionsSection(criteriaBundle.dispositions, reviewAllowed),
  };
```
*Note*: Line 632 checks `pipeline.reviewPolicy?.allowedDispositions`, but `StepRunner` at `step-runner.ts:222` only reads `pipeline.reviewPolicy?.allowedDispositions` (global), so per-agent overrides (`pipeline.reviewPolicy[currentStep.agent]`) currently reach the prompt but NOT the schema generator unless resolved uniformly.

### 3.2 Item Machine: `writeArtifact` Seam Writing `human-async` Questions
From `plugins/software-factory/src/core/flows/item-machine.ts:706-727`:
```typescript
    writeArtifact: async (output: unknown) => {
      // Persist human-async questions atomically with the review record (Finding 23)
      if (output && typeof output === "object" && "suggestions" in (output as any)) {
        const rev = output as ReviewArtifact;
        const asyncQuestions = rev.suggestions?.filter((s) => s.disposition === "human-async");
        if (asyncQuestions && asyncQuestions.length > 0) {
          for (const q of asyncQuestions) {
            const cleanSuggestionId = (q.id || "s").replace(/[^a-z0-9_-]/gi, "-");
            const qId = `q-${itemSlug}-${cleanSuggestionId}`;
            await writeQuestion(taskWt, taskDir, {
              id: qId,
              ref: itemSlug,
              disposition: "human-async",
              question: q.detail || q.summary,
              blocks: [itemSlug],
            });
          }
        }
      }
    },
```
This is the proven atomic persistence pattern for routing reviewer suggestions to mailbox questions; concern aggregation from agent outputs maps naturally to this seam or an adjacent callback.

### 3.3 Step Runner: `writeArtifact` Seam & Commit Invariant
From `plugins/software-factory/src/core/flows/step-runner.ts:611-655`:
```typescript
  // 12. Write canonical artifact before finishing meta so both land in the same commit (§6.2, Invariant 5)
  if (finalStatus === "ok" && opts.writeArtifact) {
    try {
      await opts.writeArtifact(validatedData);
    } catch (err: any) {
      finalStatus = "error";
      validationError = `Failed writing canonical artifact: ${err?.message || err}`;
    }
  }

  // 13. Invariant §6.3.2: Finish step record with final meta
  const finalMeta = await finishStepRecord({ ... });

  // 14. Invariant §6.3.2, §6.3.3: Engine commits worktree after every step
  if (!(await isMerging(wtToCommit))) {
    await commitAll(
      repo,
      wtToCommit,
      `factory${item ? `(${item})` : ""}: ${stepId} a${attempt} [${finalStatus}]`
    );
  }
```

### 3.4 Steering: `writeQuestion` Stable ID Pattern
From `plugins/software-factory/src/core/steer.ts:63-108`:
```typescript
export async function writeQuestion(
  rootWt: string,
  taskDir: string,
  q: Omit<SteerItemArtifact, "id" | "status"> & { id?: string }
): Promise<SteerItemArtifact> {
  const hash = crypto
    .createHash("sha256")
    .update(`${q.ref}:${q.question}:${q.disposition}`)
    .digest("hex")
    .slice(0, 10);

  const cleanRef = q.ref.replace(/[^a-z0-9_-]/gi, "-");
  const id = q.id ?? `q-${cleanRef}-${hash}`;
  // ...
  const targetPath = path.join(outDir, `${id}.yaml`);
  if (fs.existsSync(targetPath)) {
    // A re-run step raising the same question must not clobber the operator's answer.
    try {
      const existing = yaml.parse(await fs.promises.readFile(targetPath, "utf8")) as SteerItemArtifact;
      return existing;
    } catch { }
  }
  await writeYamlAtomic(targetPath, item);
  return item;
}
```
This demonstrates the dedup and idempotent overwrite-guard pattern needed for `concerns/{id}.yaml`.

### 3.5 Plan Review Flow: Architect <-> Reviewer Turn
From `plugins/software-factory/src/core/flows/iteration.ts:440-485`:
```typescript
    const revStepRes = await runAgentStep({
      task,
      stepId: revRecordName,
      stepFragment: "steps/plan-review",
      agent: "plan-reviewer",
      role: "alt-architect",
      cwd: taskWt,
      recordsDir: runsDir,
      promptVars: {
        plan: JSON.stringify(plan, null, 2),
        intent: intentText,
        context: contextYaml,
        limits: JSON.stringify(limits, null, 2),
        dispositionsCriteria: formatDispositionsSection(
          loadCriteriaBundle(pipeline.criteria).dispositions,
          pipeline.reviewPolicy?.allowedDispositions ?? ["fix", "optional", "architect", "human-awareness", "human-async"]
        ),
      },
      // ...
    });
    // ...
    const revOutput = revStepRes.output as ReviewArtifact | undefined;
    const fixSuggestions = revOutput?.suggestions?.filter((s) => s.disposition === "fix");
    if (!fixSuggestions || fixSuggestions.length === 0) {
      break; // Plan approved!
    }
```
Currently `plan-review` only acts on `fix` suggestions (looping into `architect-revise`). Architect concerns/decisions are not triaged or propagated here yet.

### 3.6 ADR Writing: Current Implementation Only Writes Title + Context
From `plugins/software-factory/src/core/flows/iteration.ts:380-390`:
```typescript
        // Write ADRs if specified (§8.4.2)
        if (plan.adrs && project.adrFolder) {
          const adrDir = path.join(taskWt, project.adrFolder);
          await fs.promises.mkdir(adrDir, { recursive: true });
          for (const adr of plan.adrs) {
            const adrFile = path.join(adrDir, `${adr.id}.md`);
            await writeTextAtomic(adrFile, `# ${adr.title}\n\n${adr.context}\n`);
          }
        }
```
Notice that `adr.decision` and `adr.consequences` are currently omitted from the markdown file, and there is no `blocking` flag.

### 3.7 Derived Tech Debt Collection
From `plugins/software-factory/src/core/derive/task.ts:167-205`:
```typescript
  // 7. Tech debt collection
  const debtSet = new Set<string>();
  if (plan?.techDebt) {
    for (const d of plan.techDebt) {
      debtSet.add(d.description);
    }
  }
  // From decisions: accept-with-debt
  const decisionsDir = path.join(taskDir, "decisions");
  if (fs.existsSync(decisionsDir)) {
    // ... adds d.debt
  }
  // From review suggestions with disposition optional
  for (const it of items) {
    for (const rec of it.records) {
      if (rec.output && typeof rec.output === "object" && "suggestions" in (rec.output as any)) {
        const suggestions = (rec.output as any).suggestions;
        for (const sug of suggestions ?? []) {
          if (sug.disposition === "optional" && sug.summary) {
            debtSet.add(`[${it.slug}] ${sug.summary}`);
          }
        }
      }
    }
  }
```
Concerns routed to `tech-debt` must feed into this derived debt set.

### 3.8 Wave Dependency Blocking (Transitive Fixpoint)
From `plugins/software-factory/src/core/derive/wave.ts:44-63` & `plugins/software-factory/src/core/plan/scheduler.ts:16-36`:
```typescript
  // Dependents of failed items become blocked-by-failure, cascaded transitively to a fixpoint (§8.2)
  const schedItems = items.map((it) => ({
    slug: it.slug,
    wave: String(it.wave),
    deps: it.deps,
    status: it.status as "pending" | "running" | "done" | "failed" | "blocked" | "abandoned",
  }));
  const failureBlocked = new Set<string>(blockedByFailure(schedItems));
  let grew = failureBlocked.size > 0;
  while (grew) {
    grew = false;
    for (const it of items) {
      if (it.status === "pending" && !failureBlocked.has(it.slug) && it.deps.some((d) => failureBlocked.has(d))) {
        failureBlocked.add(it.slug);
        grew = true;
      }
    }
  }
```
Spec item 18's rule ("blocker affecting a dependent item → dependent item blocked + architect consult") hooks into this dependency-blocking mechanic.

### 3.9 Child Epic Execution & Parent State Propagation
From `plugins/software-factory/src/core/engine.ts:208-278`:
```typescript
export async function runChildTask(
  deps: EngineDeps,
  parent: { branch: string; path: string; taskDir: string },
  epicSlug: string,
  // ...
): Promise<RunResult> {
  // Child worktree topic/{task}--{epic}
  // Runs its own runIteration loop
  // Writes child-closeup.yaml into parentItemDir:
  const parentItemDir = path.join(parent.taskDir, "items", epicSlug);
  await writeYamlAtomic(path.join(parentItemDir, "child-closeup.yaml"), {
    epic: epicSlug,
    status: childStatus,
    iteration: itRes.iteration,
    summary: `Epic child task finished: ${itRes.status}`,
  });
```

### 3.10 CLI Status Rendering
From `plugins/software-factory/src/cli/status.ts:83-105`:
```typescript
  if (derived.openSteerQuestions && derived.openSteerQuestions.length > 0) {
    console.log(`Open Operator Questions (tousertoreview):`);
    for (const q of derived.openSteerQuestions) {
      console.log(`  * [${q.id}] ref: ${q.ref} | disposition: ${q.disposition}`);
      console.log(`    Question: ${q.question}`);
      // ...
    }
  }
  if (derived.debt && derived.debt.length > 0) {
    console.log(`Recorded Technical Debt:`);
    for (const d of derived.debt) {
      console.log(`  - ${d}`);
    }
  }
```
Currently missing concern counts (`open`, `dismissed`, `routed`, `resolved`) and remarkable decision digests.

---

## 4. Existing Tests & Conventions

### 4.1 Testing Harness & Infrastructure
- **Test Runner**: `bun test` (see `plugins/software-factory/package.json:11-13`).
- **Temporary Git Repos**: `test/helpers/tmp-repo.ts:24-125` creates isolated git repositories with helper methods (`commit`, `createBranch`, `createWorktree`, `git`, `cleanup`).
- **Fake Harness Scripting**: `src/harness/fake/fake-harness.ts:40-140`. End-to-end engine tests script agent turns deterministically using label patterns:
  - Orchestration turns: `${task}/runs/${stepId}#a${attempt}`
  - Item turns: `${task}/items/${item}/${stepId}#a${attempt}`
  - Example: `test/engine/story-happy-path.test.ts:34-80`, `test/engine/human-async-steering.test.ts:70-130`.
- **Ajv Schema Verification**: Fake outcomes must conform to actual JSON schemas because `step-runner.ts:510-570` parses and validates them through `validateAndRepair`. Invalid scripted schemas trigger repair or failure.

### 4.2 Behavior Tests Only Convention
Per task intent and spec §13:
- Tests must verify end-to-end behaviors: raising concerns, aggregation on disk, triage by reviewer, routing effects (mailbox write, dependent item blocking, consult trigger, debt inclusion), state/status surfacing.
- No unit tests of prompt string templates or mocking internals; use `FakeHarness` driving `runTask` or `tickItemMachine`.
- Target files: `test/engine/concerns-funnel.test.ts` (new behavior suite), with focused additions to `test/steer.test.ts`, `test/cli/cli.test.ts`.

### 4.3 Prompt Preflight Invariants (`test/prompts.test.ts:102-195`)
- Every agent declared in `pipeline.agents` must have a loadable definition in `agents/`.
- Every placeholder in step fragments must be registered in `KNOWN_VARS` (`src/core/prompt-vars.ts:44-161`).
- Every orchestration fragment in `ENGINE_STEP_FRAGMENTS` (`src/core/prompts.ts:402-420`) must exist and pass render checks.
- Adding prompt fragments or variables for concern triage or human-involvement modes must update `KNOWN_VARS` and pass `preflightPrompts`.

### 4.4 Config Layering Semantics (`test/config-layering.test.ts:5-45`)
- Precedence: `config/pipeline.default.yaml` → `<repo>/.factory/pipeline.yaml` → `<repo>/{task}/pipeline.yaml`.
- Objects deeply merge, arrays replace wholesale, explicit `null` deletes keys.
- `config/schemas/pipeline.schema.json:253` enforces `"additionalProperties": false` at the root, so new top-level configuration keys (like `humanInvolvement`) require schema updates.

---

## 5. Current State vs. Item 18 Requirements (Gap Analysis)

| Feature | Spec Item 18 Requirement | Current Codebase State | Gap to Close |
|---|---|---|---|
| **Structured Concerns in Output** | Every agent output may carry `concerns[]`: `{kind, summary, detail, location?, severity, affects?}` + remarkable decisions/tradeoffs `{chosen, alternatives, why}`. | `DeveloperOutputArtifact` has only free-form `concerns?: string[]` (`artifacts.ts:323`). Other schemas (`plan.schema.json`, `fact-finder-output.schema.json`, `wave-closeup.schema.json`, `plan-closeup.schema.json`) have no `concerns` or `remarkable` fields. | Define structured `Concern` and `RemarkableDecision` schemas/types; update output schemas for developer, fact-finder, architect plan, and close-ups. |
| **Engine Aggregation & Dedup** | Engine aggregates them in `{task}/concerns/` with stable fingerprint id, dedup across steps/attempts, status (`open|dismissed|routed|resolved`), source step record pointer. | No `concerns/` folder exists (`docs/ARCHITECTURE.md:185-197`). `writeQuestion` pattern exists (`steer.ts:63-108`) with sha256 hashing, but no concern aggregation logic exists. | Build `src/core/concerns.ts` with `aggregateConcerns()`: stable hash of `{kind, summary, location, affects}`, atomic YAML write in `{task}/concerns/{id}.yaml`, dedup/merge across re-runs. |
| **Reviewer Triage & Dispositions** | Step reviewer (workhorse class; architect output → plan-reviewer) triages with review disposition vocabulary plus `dismiss` (logged with reason, kept in folder). | Review vocabulary (`artifacts.ts:288-294`, `review-schema.ts:9-12`) lacks `dismiss`. `item-machine.ts` and `iteration.ts` do not pass open concerns to reviewers or collect triage decisions. | Add `dismiss` to `ReviewDisposition`; extend review schema to accept concern triage; pass open concerns in `promptVars`; record triage status/reason in `{task}/concerns/{id}.yaml`. |
| **Routing: Blocker & Architect** | `blocker` affecting dependent item → dependent item blocked + architect consult. `architect` → next architect turn (wave report / next plan input). | Review disposition `architect` is never routed anywhere in `item-machine.ts` or `iteration.ts`. Dependency blocking only checks `failed`/`abandoned` items (`scheduler.ts:16-36`). | Map `affects` to item slugs; mark affected items `blocked` in `deriveWaveState`/`deriveItemState`; trigger `runItemConsult` or hydrate into next architect turn (`buildArchitectHydration`). |
| **Routing: Human Mailbox & Tech Debt** | `human-*` → steer mailbox per policy; `tech-debt` → plan tech-debt list. | `human-async` writes to `steer/tousertoreview` (`item-machine.ts:711`), but `human-awareness` and `human-stop` are ignored. Debt collection (`derive/task.ts:167-205`) only reads plan `techDebt`, `accept-with-debt` decisions, and `optional` review suggestions. | Route `human-awareness` as non-blocking digest item in mailbox; route `human-stop` with task halt; add routed `tech-debt` concerns to `deriveTaskState` debt collection. |
| **Funneling & Text Budget** | `worker → reviewer (confirm/dismiss, condense) → epic architect → [saga architect] → human`. Less detail per level, never more text than code summarized. | No text length limits or condensing mechanics exist. Close-up prompts have no concerns context. | Provide condensed summaries at each funnel tier; enforce text size bound (detail bytes ≤ diff bytes); hydrate wave report and plan close-up with open concerns. |
| **Blocking vs Non-blocking ADRs** | Marked blocking or non-blocking. Blocking = needs human decision per mode; remarkable = below blocking threshold, reported in mailbox digest, never waits. | `PlanAdr` has no `blocking` boolean (`artifacts.ts:235-241`). `iteration.ts:380-390` writes only title/context to `.md` files; no mailbox digest exists. | Add `blocking?: boolean` to `PlanAdr` and `plan.schema.json`; route blocking ADRs to `writeQuestion` per mode; route non-blocking remarkable ADRs to mailbox digest. |
| **Human-Involvement Modes** | Config presets: `autonomous`, `principal`, `detailed` (pipeline config + prompt fragments for reviewer/architect criteria), selectable per task. | No mode concept in `PipelineConfig` (`artifacts.ts:108-133`). `criteria/dispositions.md` has static criteria without mode-specific rules. | Add mode config preset examples to `config/pipeline.default.yaml`; create prompt criteria fragments (`agents/criteria/human-involvement.md`); wire into prompt rendering. |
| **Surfacing & State Counts** | Wave/plan close-ups list open concerns; close-up reviewers re-triage; `factory status` and `state.yaml` show counts. | `state.yaml` (`StateArtifact`, `artifacts.ts:449-459`) has no concern fields. `status.ts:83-105` prints only operator questions and debt. | Add `concerns?: { open, dismissed, routed, resolved }` to `StateArtifact`, refresh in `deriveTaskState`, and render in `cli/status.ts`. |
| **Documentation Updates** | Update `ARCHITECTURE.md` (§1 row 18, §6.2, §8.7), README, config commentary. | Row 18 marked "Deliberately not hand-built" (`docs/ARCHITECTURE.md:39`). | Update `docs/ARCHITECTURE.md`, `README.md`, and config comments with full concerns funnel specifications. |

---

## 6. Open Questions & Architectural Decisions for the Architect

1. **Aggregation Worktree & Commit Invariant (§6.2 vs §6.3)**:
   - *Context*: In `step-runner.ts:630-655`, an item step commits only `childWt` (`topic/{task}--{item}`). The task orchestration folder `{task}/concerns/` lives on `taskWt` (`topic/{task}`).
   - *Options*:
     - (A) Write concerns directly to `taskWt/{task}/concerns/` during item steps, matching the precedent set by `writeQuestion` (`item-machine.ts:716`) and `refreshStateYaml` (`item-machine.ts:731`), with formal task worktree commit at wave merges/edits.
     - (B) Write item concerns to `childWt/{task}/items/{item}/concerns/` and aggregate them onto `taskWt` when the item merges or at wave completion.
     - (C) Extend `runAgentStep` to commit both worktrees when task-level artifacts are written.
   - *Recommendation*: Option (A) is cleanest and exactly matches `writeQuestion` and `state.yaml` behavior.

2. **Triage Schema Contract for Reviewers**:
   - *Context*: Reviewers need to triage concerns raised by earlier worker steps.
   - *Options*:
     - (A) Reuse the existing `suggestions[]` array in `ReviewArtifact`, extending `disposition` to include `"dismiss"`, matching on `suggestion.id = concern.id`.
     - (B) Add a distinct `concernTriage: Array<{ id: string; status: "confirmed" | "dismissed"; disposition?: ReviewDisposition; reason?: string }>` to `ReviewArtifact`.
   - *Tradeoff*: Option (A) adheres strictly to the spec phrasing ("triages new concerns with the same disposition vocabulary as review suggestions plus dismiss"), avoiding a separate schema branch.

3. **Text Size Bound Enforcement ("never more text than the code it summarizes")**:
   - *Context*: How should the engine mechanically check or enforce that summaries do not bloat?
   - *Options*:
     - Purely prompt-guided with debloated instructions in reviewer/architect prompts.
     - Mechanical validation in the engine comparing `concern.detail.length` to `diff.length` (or capping at a sensible max like 300 characters).

4. **Saga Concern Propagation Mechanics**:
   - *Context*: Epics run as child tasks (`engine.ts:208-285`) using `runChildTask`, writing `child-closeup.yaml`. How should epic concerns reach the saga architect?
   - *Design*: When child epics finish, un-dismissed epic-level concerns/decisions can be summarized into `child-closeup.yaml` or copied into the parent task's `concerns/` directory, hydrating the saga architect's next wave report or close-up turn.

5. **Mailbox Digest Delivery for Remarkable Items**:
   - *Context*: "remarkable items reported in a mailbox digest, never waiting".
   - *Design*: Write to `steer/digest/` or record in `steer/tousertoreview/digest-{hash}.yaml` with `status: "open"`, `disposition: "human-awareness"`, without adding the item to `blocks: [...]`, so it surfaces in `factory status` and the mailbox without stopping the engine.

6. **Human-Involvement Mode Configuration Placement**:
   - *Context*: `pipeline.schema.json` has `additionalProperties: false` at the root.
   - *Options*:
     - Add `humanInvolvement: { type: "string", enum: ["autonomous", "principal", "detailed"], default: "autonomous" }` to `config/schemas/pipeline.schema.json` and `PipelineConfig`.
     - Alternatively, place it inside `reviewPolicy.mode` or under `criteria.humanInvolvement`.
   - *Recommendation*: Adding top-level `humanInvolvement` to schema and `PipelineConfig` is cleanest and aligns with the spec intent ("human-involvement modes = config presets").
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
  "iteration": 1,
  "milestones": [
    {
      "directionalInterfaces": [
        "artifacts.ts: Concern, RemarkableDecision, StoredConcernArtifact(+pendingResolution?, source.escalated?), ReviewDisposition+dismiss (no tech-debt), PlanAdr.blocking, PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeverity,minBlockingSeverity}, reviewPolicy.default canonical",
        "config/schemas: shared concern/remarkable partial in developer, fact-finder, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup, architect reports; triage/infra/pm-edit out of scope; dismiss detail-required; closeup concernResolutions",
        "src/core/concerns.ts: concernFingerprint(identity), aggregateConcerns(merge+escalated), listOpenConcerns, applyConcernTriage(exact-id,isTriager), applyCloseupResolutions, partitionSuggestions(triage vs findings)",
        "src/core/review-policy.ts: resolveReviewAllowed(pipeline,agent,isTriager) per-agent>default>builtin, legacy allowedDispositions alias, dismiss auto-append for triagers; generateReviewSchema uses it; taskWt runExclusive+atomic+immediate-commit helper"
      ],
      "id": "m1-contracts-aggregate",
      "scenarios": [
        "Given a developer step emitting a blocker concern When the step commits Then concerns/c-<fp10>.yaml exists with status open and source.record pointing at the step record",
        "Given the same concern re-emitted on retry When aggregation runs Then exactly one file exists, prior dismissed/routed preserved, updatedAt/lastSeen advance",
        "Given a concern missing severity and detail When validation runs Then severity defaults to medium, detail defaults to summary, and the file is created",
        "Given a concern with unknown kind When validation runs Then the step errors, no concerns file is written, existing files stay untouched",
        "Given developer, fact-finder, qa, poc, review-new, plan, consult, closeup, and architect-report outputs carrying concerns[]+remarkable[] When steps commit Then each aggregates to concerns/c-*.yaml or rm-*.yaml with open status and source pointer; triage/infra/pm-edit carry none",
        "Given reviewer output with new concerns[] plus suggestions triaging a pre-existing id When the step commits Then the new concern aggregates open and only the pre-existing id is triaged (no same-step self-dismiss)",
        "Given reviewPolicy.default [fix,optional] plus reviewer override [fix,optional,architect] When resolveReviewAllowed runs Then reviewer triager gets override+dismiss and QA non-triager gets default without dismiss",
        "Given a dismissed concern re-emitted with higher severity When merge runs Then status stays dismissed but source.escalated=true and the escalation appears in digest and architect hydration"
      ],
      "title": "Contracts and aggregation foundation"
    },
    {
      "directionalInterfaces": [
        "prompt-vars KNOWN_VARS+descriptions: concernsYaml in steps/review, steps/plan-review, steps/wave-close-up, steps/plan-close-up, architect-plan, architect-wave-report, architect-closeup, architect-consult-*; humanInvolvementCriteria in review, plan-review, architect-*",
        "item-machine review + iteration plan-review promptVars and writeArtifact with isTriager gate, partitionSuggestions excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox dedup q-concern-<cid>",
        "agents reviewer, plan-reviewer, criteria/dispositions, criteria/human-involvement terse confirm/dismiss/condense plus blocking table plus condensing rule output-bytes<input-bytes",
        "config/pipeline.default.yaml commented autonomous/principal/detailed presets with blocking table plus concerns raise/threshold examples"
      ],
      "id": "m2-triage-modes",
      "scenarios": [
        "Given open item concerns When review runs Then steps/review receives concernsYaml with id/kind/severity/summary/affects and terse triage instructions",
        "Given reviewer suggestion matching a concern id with disposition dismiss and detail When review commits Then that file has status dismissed plus dismissReason=detail and no mailbox, debt, blocked, or approval effect",
        "Given a matching dismiss suggestion without detail When review commits Then the step errors and no triage is persisted",
        "Given QA emitting a matching concern id When QA commits Then no triage is applied and the file stays open",
        "Given matching suggestions with fix, optional, architect, or human-* When review commits Then each file becomes routed with disposition persisted; triage ids are excluded from normal fix-loop/approval/mailbox except fix-on-concern sets fixRequired once; human-async on a concern writes a single q-concern-<cid>",
        "Given architect plan concerns plus an rm-* file When plan-review runs Then plan-reviewer triages with the same vocabulary and non-dismissed files become routed; debt predicate is kind==tech-debt&&routed or disposition==optional (no tech-debt disposition)",
        "Given pipeline.yaml humanInvolvement principal When reviewer and architect prompts render Then the mode criteria fragment is included and preflightPrompts passes"
      ],
      "title": "Reviewer triage and modes"
    },
    {
      "directionalInterfaces": [
        "derive/task.ts collectRoutedBlockers(taskDir)->Set plus deriveWave/deriveItem integration; scheduler.blockedByConcern(items,concernBlocked) pure reusing blockedByFailure fixpoint, unioned, cascade only over declared deps",
        "act-phase routing: triage writeArtifact plus wave-act newly-blocked check writing decisions/concern-<cid>.yaml exactly once (restart idempotent); buildArchitectHydration extended with concernsYaml digest",
        "steer writeQuestion for human-async/stop/blocking ADR; derive/task blocking-vs-digest split (blocks.length>0 vs awareness empty); debt predicate; human-stop exit-10 halt plus blocked"
      ],
      "id": "m3-routing",
      "scenarios": [
        "Given a routed blocker whose affects names a declared dependent When derive runs Then the dependent derives blocked with no writes; non-dependents are unaffected and transitive blocking follows declared deps only",
        "Given a newly blocked dependent When the act phase runs Then exactly one decisions/concern-<cid>.yaml is written and a restart writes no second file",
        "Given a routed architect concern When the next architect turn builds hydration Then its concernsYaml input contains that concern id and summary",
        "Given a routed human-async concern When routing runs Then mailbox q-concern-<cid> has blocks=[item], the item derives blocked, and the engine continues without exit 10",
        "Given a routed human-stop concern When routing runs Then the mailbox entry blocks task/item, item and task derive blocked, and the engine halts with exit code 10 until answered or dismissed",
        "Given a routed human-awareness concern When routing runs Then the mailbox entry has blocks=[] in the Digest section and the engine continues with no blocked set and no exit 10",
        "Given plan ADRs blocking true and false under autonomous mode When plan commits Then the blocking ADR creates a mailbox question with blocks while the remarkable ADR appears only in the digest; debt includes kind tech-debt routed or disposition optional routed as [item] summary"
      ],
      "title": "Routing to blocked, architect, mailbox, debt"
    },
    {
      "directionalInterfaces": [
        "closeup schemas concernResolutions resolve/carry/propagate plus concerns[]/remarkable[]; StoredConcern.pendingResolution{action,note,by,at}; applyCloseupResolutions proposes (status stays routed); architect concernConfirms accept/reject applies; propagate to parent concerns/ copy or human digest",
        "iteration.ts concernsYaml hydration capped UTF-8 bytes: code steps min(diffBytes,2000); zero-diff orchestration min(inputBytes,500); reviewer/architect condensing prompts require output<input; engine truncates hydrated var only",
        "engine.ts runChildTask propagateEpicConcerns after child completion before cleanup/merge, condensed copies with source.epic, parent hydration extended; size assert parent-detail<child-detail",
        "derive/task.ts toStateArtifact().concerns counts (missing dir zeros, corrupt skip+warn); cli/status.ts Concerns plus separate Blocking vs Digest sections"
      ],
      "id": "m4-funnel-surface",
      "replanAfter": true,
      "scenarios": [
        "Given wave diff 5000 bytes and open concerns 3000 bytes When wave-close-up hydrates Then concernsYaml is <=2000 bytes and < wave diff in UTF-8 bytes",
        "Given zero-diff plan-review with 4000-byte input When hydrating Then concernsYaml is <=500 bytes and < input bytes",
        "Given wave-close-up emitting concernResolutions resolve/carry/propagate When it commits Then files stay routed with pendingResolution set; architect accept applies resolved/routed/propagated and reject clears pending",
        "Given a simple item with open concerns and no reviewer When wave-close-up runs Then explicit resolutions triage them; fallback auto-routes kind tech-debt to optional (debt) and other kinds to architect (carry); human-* is never auto-routed",
        "Given a child epic finishing with one dismissed and one open concern with 800-byte detail When runChildTask completes before cleanup Then the parent gains exactly one condensed copy with source.epic, detail <800 bytes, hydrating saga architect concernsYaml",
        "Given mixed-status concerns plus a corrupt yaml file When state refreshes and factory status runs Then state.yaml counts skip the corrupt file with warn, missing dir yields zeros, and CLI shows Concerns plus Blocking vs Digest sections"
      ],
      "title": "Funnel, close-ups, saga, surfacing"
    },
    {
      "directionalInterfaces": [
        "docs/ARCHITECTURE.md §1 row 18 + §6.2 concerns/ + §8 funnel/routing/modes/partition/producer-matrix/resilience/exit-10, README.md, config commentary, agents/criteria/dispositions.md human-stop exit-10 preserved",
        "fragment matrix (8 fragments) + debloat check: each fragment ≤15 lines, total growth ≤60 lines, preflight plus line-count assertion in prompts.test"
      ],
      "id": "m5-docs",
      "scenarios": [
        "Given implementation complete When docs are read Then ARCHITECTURE, README, config commentary, and dispositions describe concerns lifecycle, funnel sizes, partition, producer matrix, exit-10, modes, and counts with terse prompts",
        "Given prompt fragments When prompts.test runs Then KNOWN_VARS plus descriptions cover all 8 fragments and added lines respect ≤15/≤60 budgets",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "title": "Docs and suite consolidation"
    }
  ],
  "uncertainties": [
    {
      "description": "Funnel byte budget per-level sources, zero-diff rule, and bytes-vs-chars unit needed before close-up hydration.",
      "id": "u-text-budget",
      "spikeOutlines": [
        "test-assumptions spike-text-budget verifies code min(diff,2000) and zero-diff min(input,500) UTF-8 bytes with output<input condensing"
      ]
    },
    {
      "description": "Epic propagation timing plus taskWt serialization/restart behavior and pure-derive versus act-phase boundary needed before store, blocker derive, and saga propagation.",
      "id": "u-saga-propagation",
      "spikeOutlines": [
        "fact-finder spike-saga-commit verifies parent-copy timing, runExclusive serialization, immediate commit idempotency, collectRoutedBlockers owner, and hydration seam"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "test-assumptions: measure item/wave diff bytes vs concern detail sizes; confirm per-level caps code min(diff,2000) and zero-diff min(input,500) UTF-8 bytes, condensing output<input, no 500-floor violation. Finding record only, no prod code; gates funnel-closeups.",
      "kind": "test-assumptions",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "spike-text-budget",
      "title": "Spike: funnel byte budget"
    },
    {
      "deps": [],
      "description": "fact-finder: verify runChildTask copy timing before cleanup/merge, parent buildArchitectHydration extension point, taskWt runExclusive serialization under 4 parallel items, immediate commit plus restart idempotency, pure-derive vs act-phase boundary with collectRoutedBlockers owner. Finding only; gates concerns-store, routing-blocker-derive, saga-propagate.",
      "kind": "fact-finder",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "spike-saga-commit",
      "title": "Spike: saga propagation, commit, derive boundary"
    },
    {
      "deps": [],
      "description": "Types plus schemas for producer matrix (developer, fact-finder, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup with concernResolutions, architect reports) via shared partial; triage/infra/pm-edit out of scope. Canonical reviewPolicy.default, legacy alias, resolveReviewAllowed(pipeline,agent,isTriager) precedence plus dismiss injection, generateReviewSchema, dismiss detail-required, pipeline humanInvolvement plus concerns thresholds. Tests: typecheck, preflight, repair defaults vs strict reject unknown kind.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-contracts",
      "title": "Concern contracts and canonical review policy"
    },
    {
      "deps": [
        "concerns-contracts",
        "spike-saga-commit"
      ],
      "description": "Implement src/core/concerns.ts (fingerprint identity, merge with escalated flag, aggregate/list/triage/closeup/partition, atomic YAML plus runExclusive plus immediate taskWt commit, restart idempotent). Wire all producer seams including consult writeArtifact; reviewer ordering aggregates new then triages pre-existing only. Behavior tests: open+source, retry dedup, reword merge preserving status plus escalation surfacing, rm-* aggregate, precedence/injection. Run TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-store",
      "title": "Concerns store with merge and commit"
    },
    {
      "deps": [
        "concerns-store"
      ],
      "description": "Item reviewer triage with concernsYaml in steps/review, isTriager gate, exact-id partition excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox dedup q-concern-<cid>, dismiss detail to dismissReason, condensing output<input, debt predicate without tech-debt disposition. Behavior tests: dismiss no routing, routed persist, QA gate no-op, missing detail errors, fix-once, no double mailbox.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "reviewer-triage",
      "title": "Workhorse reviewer triage"
    },
    {
      "deps": [
        "concerns-store"
      ],
      "description": "Architect path: aggregate plan/revise concerns plus remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary, non-dismissed become routed. Behavior tests: dismissed vs routed, rm-* triaged, debt predicate, no approval trigger from triage ids.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "plan-reviewer-triage",
      "title": "Plan-reviewer triage"
    },
    {
      "deps": [
        "concerns-contracts"
      ],
      "description": "humanInvolvement plus concerns thresholds schema/loader/merge, commented autonomous/principal/detailed presets with blocking table, agents/criteria/human-involvement.md terse fragment, KNOWN_VARS concernsYaml plus humanInvolvementCriteria with descriptions wired per fragment matrix. Behavior tests: mode switch changes criteria and blocking-ADR behavior; preflight green. Precedes all routing.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "modes-prompts",
      "title": "Modes, thresholds, prompt wiring"
    },
    {
      "deps": [
        "plan-reviewer-triage",
        "reviewer-triage",
        "modes-prompts",
        "spike-saga-commit"
      ],
      "description": "Pure derive only: derive/task collectRoutedBlockers plus deriveWave/deriveItem integration, scheduler.blockedByConcern reusing fixpoint, union with failure-blocked, cascade only declared deps, no writes. Behavior tests: dependent blocked, non-dep unaffected, transitive via deps only.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-blocker-derive",
      "title": "Blocker derive"
    },
    {
      "deps": [
        "modes-prompts",
        "routing-blocker-derive"
      ],
      "description": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) plus buildArchitectHydration concernsYaml extension for wave-report/next-plan. Behavior tests: single consult file, restart no duplicate, architect input contains id+summary.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-architect-consult",
      "title": "Architect consult and hydration"
    },
    {
      "deps": [
        "reviewer-triage",
        "modes-prompts"
      ],
      "description": "human-async blocks [item] and continues, human-stop blocks task/item plus exit-10 halt plus blocked derive, awareness blocks [] digest never blocking/exiting, debt predicate kind tech-debt routed or disposition optional routed. Behavior tests: mailbox files per disposition, exit 10 on stop, awareness continues, debt includes [item] summary.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-human-debt",
      "title": "Human mailbox and debt routing"
    },
    {
      "deps": [
        "modes-prompts",
        "routing-human-debt"
      ],
      "description": "Full ADR md title/context/decision/consequences/blocking, blocking routed per mode table with exit-10 when stop, remarkable digest-only never waiting, dispositions.md exit-10 preserved. Behavior tests: blocking mailbox+blocks, remarkable digest only.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "adr-blocking-digest",
      "title": "Blocking vs remarkable ADRs"
    },
    {
      "deps": [
        "adr-blocking-digest",
        "routing-architect-consult",
        "spike-text-budget"
      ],
      "description": "Hydrate wave/plan-close-up and architect reports with concernsYaml capped per spike (UTF-8 bytes), concernResolutions pending plus architect concernConfirms accept/reject, propagate to parent/digest, simple-item explicit plus auto-route fallback (tech-debt to optional, others to architect, human never auto). Behavior tests: concrete byte budgets, pending/confirm, simple fallback.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "replanAfter": true,
      "slug": "funnel-closeups",
      "title": "Funnel close-ups and simple triage"
    },
    {
      "deps": [
        "routing-architect-consult",
        "spike-saga-commit"
      ],
      "description": "runChildTask propagateEpicConcerns per spike: after child completion before cleanup/merge, condensed parent copies source.epic with parent detail smaller than child, extended parent concernsYaml hydration. Behavior tests: one copy, dismissed stays local, saga input contains id.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "replanAfter": true,
      "slug": "saga-propagate",
      "title": "Epic to saga propagation"
    },
    {
      "deps": [
        "concerns-store",
        "routing-human-debt"
      ],
      "description": "Sole owner StateArtifact.concerns {open,dismissed,routed,resolved}, state.schema, toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI Concerns plus Blocking vs Digest. Behavior tests: counts, missing/corrupt, CLI sections.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "slug": "status-state-surface",
      "title": "State counts and status surfacing"
    },
    {
      "deps": [
        "funnel-closeups",
        "modes-prompts",
        "saga-propagate",
        "status-state-surface"
      ],
      "description": "Update ARCHITECTURE section 1 row 18 plus 6.2 plus 8, README, config commentary, dispositions.md; fragment matrix plus 15/60 debloat check; consolidate test/engine/concerns-funnel.test.ts plus steer/CLI coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m5-docs",
      "slug": "docs-finish",
      "title": "Docs and suite consolidation"
    }
  ],
  "assumptions": [
    {
      "assumption": "Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures do not mask regressions.",
      "why": "Baseline red only under .factory-runtime TMPDIR; suite green with TMPDIR=/tmp. Out of scope."
    },
    {
      "assumption": "Concern identity excludes detail and severity per adr-fingerprint-merge; reworded detail merges and severity escalations surface via escalated flag without reopening.",
      "why": "Prevents trivial-reword duplicates while keeping escalation visible to architect and digest."
    },
    {
      "assumption": "buildArchitectHydration does not read parent concerns/ today; saga-propagate extends it with concernsYaml, and runChildTask copies condensed epic concerns to parent concerns/ after child completion but before cleanup/merge per spike-saga-commit.",
      "why": "Corrects the prior hydration assumption; defines the copy timing and seam the spike must verify."
    },
    {
      "assumption": "Per-mode blocking table in adr-humaninvolvement-config is authoritative for iteration 1; raise allowlist defaults to all agents.",
      "why": "Unblocks routing without operator tuning; task pipeline.yaml can override."
    },
    {
      "assumption": "Dismissed concerns stay dismissed on severity escalation but appear as escalated notes in digest and architect hydration.",
      "disposition": "human-awareness",
      "why": "Surfaces the hidden-escalation tradeoff to the operator without auto-reopening triaged work."
    }
  ],
  "techDebt": [
    {
      "category": "adjacent",
      "description": "Pre-existing head-guard failures when TMPDIR sits under .factory-runtime because step-runner splits on /.factory. Baseline red; green with TMPDIR=/tmp. Out of scope.",
      "id": "td-tmpdir-split"
    },
    {
      "category": "impacting",
      "description": "reviewAllowed resolved in two places with non-canonical allowedDispositions key and wrong fallback order, so per-agent dismiss could fail schema validation.",
      "id": "td-reviewpolicy-divergence",
      "resolution": "Fix in concerns-contracts: canonical reviewPolicy.default, legacy alias, single resolveReviewAllowed(pipeline,agent,isTriager) with precedence and dismiss injection used by prompt and schema paths."
    },
    {
      "category": "impacting",
      "description": "ADR writer persists only title plus context and PlanAdr lacks blocking; human-stop contract drifted from exit-10.",
      "id": "td-adr-md-truncated",
      "resolution": "Fix in adr-blocking-digest and routing-human-debt: full md with decision, consequences, blocking plus preserved exit-10 halt and dispositions.md update."
    },
    {
      "category": "impacting",
      "description": "human-awareness and human-stop ignored, debt derivation ignores routed concerns, status lists digest as blocking.",
      "id": "td-human-debt-gaps",
      "resolution": "Fix in routing-human-debt and status-state-surface: stop exit-10 plus blocked, awareness digest with empty blocks, debt from predicate, Blocking versus Digest split."
    }
  ],
  "adrs": [
    {
      "context": "Item steps commit only childWt while concerns/ lives on taskWt; up to 4 parallel items share taskDir; retries/restarts must not duplicate or lose triage.",
      "decision": "Write directly to taskWt/{task}/concerns/ with writeYamlAtomic plus runExclusive taskWt mutex, then immediately commit taskWt when concerns/ or steer/ changed. Distinct fingerprints are distinct files; same fingerprint merges without clobbering dismissed/routed/resolved. Restart re-reads files idempotently. Implementation gated by spike-saga-commit serialization findings.",
      "id": "adr-concern-store-taskwt",
      "title": "Direct taskWt writes with serialized immediate commit"
    },
    {
      "context": "suggestions[] reuse conflated concern triage with fix-loop, mailbox, and plan-approval triggers; review id is free-form; QA must not triage; dismiss needs a reason field.",
      "decision": "Exact-id match (suggestion.id === c-<hash10> or rm-<hash10>) via partitionSuggestions splits triage entries from normal findings. Triage ids update concerns/ only and are excluded from fix-loop/approval/normal-mailbox paths; fix on a concern id routes as fix and returns fixRequired once for the owning item; human-async on a concern writes a single q-concern-<cid> (normal path skipped). Dismiss requires non-empty detail persisted to dismissReason or the step errors. isTriager gate allows only reviewer, plan-reviewer, and close-up/architect chain. Reviewer ordering: aggregate new concerns[] first, then triage only pre-existing ids from concernsYaml (no same-step self-dismiss).",
      "id": "adr-triage-suggestions-dismiss",
      "title": "Partitioned exact-id triage with gate"
    },
    {
      "context": "derive/* must stay pure; debt routing invented an invalid tech-debt disposition; consult writes need exactly-once; mailbox needs dedup.",
      "decision": "Pure derive: derive/task.ts collectRoutedBlockers(taskDir) reads routed kind==blocker affects into a Set passed to deriveWave/deriveItem and scheduler.blockedByConcern(items, concernBlocked) which reuses the blockedByFailure fixpoint pattern, unions with failure-blocked, and cascades only over declared deps. Debt predicate: (kind==tech-debt && status routed/resolved) OR (disposition==optional && status routed); no tech-debt disposition exists. Act phase (triage writeArtifact plus wave-act newly-blocked check) writes decisions/concern-<cid>.yaml exactly once, idempotent on restart, and extends buildArchitectHydration with concernsYaml.",
      "id": "adr-routing-derived-state",
      "title": "Pure derive plus exactly-once act routing"
    },
    {
      "context": "Digest must reuse the mailbox without blocking, halting, or spamming status; classify handles operator answers, not blocking.",
      "decision": "Digest entries are steer/tousertoreview entries with disposition human-awareness and blocks:[]. derive/task splits openSteerQuestions into blocking (blocks.length>0) versus digest (awareness plus empty blocks); classify only routes answers/directives/stop; status renders separate Blocking versus Digest sections.",
      "id": "adr-digest-mailbox",
      "title": "Digest as filtered non-blocking mailbox view"
    },
    {
      "context": "Spec needs autonomous/principal/detailed presets plus raise allowlist and severity thresholds; pipeline root is closed.",
      "decision": "Top-level PipelineConfig.humanInvolvement (default autonomous) plus PipelineConfig.concerns {raiseAllowlist?, minDigestSeverity?, minBlockingSeverity?}. Blocking table: autonomous blocks only on blocking ADR or high human-stop; principal adds human-async and high severity; detailed adds all human-*. Thresholds gate blocking versus digest placement. Criteria fragment agents/criteria/human-involvement.md carries the table tersely.",
      "id": "adr-humaninvolvement-config",
      "title": "Modes plus raise and severity config"
    },
    {
      "context": "Funnel requires less detail per level and never more text than code summarized, with falsifiable checks and no empty digest on zero-diff steps.",
      "decision": "Per-level UTF-8 byte caps on hydrated promptVars only (stored artifacts never truncated): code steps cap min(diffBytes,2000) where diff is item diff for review triage and wave aggregated diff for close-ups; zero-diff orchestration steps cap min(inputBytes,500) where input is plan/context bytes. Reviewer/architect/close-up prompts require condensing with output bytes < input bytes. Engine truncates only the hydrated var.",
      "id": "adr-funnel-text-budget",
      "title": "Per-level hydration byte caps"
    },
    {
      "context": "PipelineConfig type says {default,[agent]} but flows read .allowedDispositions as if global; precedence and dismiss injection are undefined.",
      "decision": "Canonical key is reviewPolicy.default with legacy reviewPolicy.allowedDispositions as a one-iteration read-alias. Single owner src/core/review-policy.ts resolveReviewAllowed(pipeline, agent, isTriager): precedence per-agent array > default > builtin [fix,optional,architect,human-awareness,human-async]; when isTriager is true append dismiss if absent; QA and other non-triagers never receive dismiss. Used by both prompt criteria and generateReviewSchema.",
      "id": "adr-reviewpolicy-canonical",
      "title": "Canonical reviewPolicy with triager injection"
    },
    {
      "context": "Hashing detail/severity duplicates on rewording; excluding them hides severity escalation on dismissed concerns.",
      "decision": "Stable id c-{sha1-10} over {kind, normalizedSummary, location, sortedAffects} excluding detail and severity. Normalization trims, collapses whitespace, lowercases summary. Re-emit merges: detail keeps longer/latest, severity keeps max, updatedAt and source.lastSeen advance, never changes dismissed/routed/resolved except via triage or close-up resolution. If re-emit severity exceeds stored severity, set source.escalated=true and surface the escalation in digest and architect hydration without reopening; architect may reopen via close-up resolution.",
      "id": "adr-fingerprint-merge",
      "title": "Fingerprint identity, merge, escalation surfacing"
    },
    {
      "context": "Close-up schemas are closed, wave-close-up has no reviewer, stored statuses have no pending, and simple items have no reviewer.",
      "decision": "Add concernResolutions?: [{id, action: resolve|carry|propagate, note?}] plus concerns[]/remarkable[] producer fields to wave/plan-closeup schemas and StoredConcern.pendingResolution?: {action,note,by,at}. Wave-close-up proposes via applyCloseupResolutions (status stays routed, pending set); architect-wave-report confirms via concernConfirms?: [{id, confirm: accept|reject, note?}] applying resolved/routed/propagated or clearing pending. Propagate targets parent concerns/ copy for epics or human digest for task-level unless elevated to blocking ADR. Simple-item fallback at wave-close-up: kind tech-debt auto-routes to disposition optional (debt), all other kinds to architect (carry); human-* is never auto-routed.",
      "id": "adr-closeup-retriage",
      "title": "Close-up pending resolution and simple fallback"
    },
    {
      "context": "Remarkable {chosen,alternatives,why} needs one authoritative store and the same triage vocabulary.",
      "decision": "Authoritative store is concerns/rm-{hash10}.yaml with RemarkableDecision plus status and source. Triaged with suggestions[] dismiss vocabulary via exact-id match under the same partition and gate. Routed remarkables go digest-only unless elevated to a blocking ADR.",
      "id": "adr-remarkable-store",
      "title": "Remarkable decisions in rm- files"
    },
    {
      "context": "dispositions.md and ARCHITECTURE 8.7 define human-stop as tousertoreview plus exit-10 halt, but item-machine treats it fix-like running.",
      "decision": "Preserve exit-10 halt: human-stop writes a mailbox entry with blocks covering affected items plus task when task-level, item-machine maps it to blocked terminal, derive marks item and task blocked, and the engine halts with exit code 10 at the next mailbox check until answered or dismissed. Awareness with blocks:[] never enters blocked sets and never triggers exit 10. Update dispositions.md and ARCHITECTURE 8.7 to keep the contract explicit.",
      "id": "adr-human-stop",
      "title": "Human-stop preserves exit-10 halt"
    },
    {
      "context": "Derive throws on corrupt triage/plan/steer/decisions while concerns/ proposes skip; one bad concern could fail a whole step.",
      "decision": "Corrupt concerns/*.yaml files are skipped with a warn and excluded from counts because concerns/ is an append-only cache rebuildable from committed step records; missing concerns/ yields zero counts. A single unknown-kind concern fails its step with no partial aggregate and no clobber of existing files, forcing prompt/schema drift to surface via retry rather than silent loss.",
      "id": "adr-resilience",
      "title": "Corrupt-skip versus strict-fail resilience"
    },
    {
      "context": "Spec says every agent output may carry concerns[], but not every schema has a producer and reviewer has a dual aggregate-plus-triage role.",
      "decision": "Producer matrix via a shared concern/remarkable partial: developer, fact-finder, qa, poc, test-assumptions, reviewer/plan-reviewer new concerns[], architect plan/revise, consult decisions, wave/plan-closeup, architect wave-report/closeup. Triage, infra, and pm-edit mechanical outputs are explicitly out of scope (no LLM synthesis). Consults aggregate via runItemConsult/runNonItemConsult writeArtifact. Reviewer ordering: aggregate new concerns first, then triage only pre-existing ids.",
      "id": "adr-producer-matrix",
      "title": "Producer matrix and reviewer ordering"
    }
  ]
}

## Wave Report
{
  "blockedItems": [],
  "failedItems": [],
  "iteration": 1,
  "mergedItems": [
    "adr-blocking-digest-v2",
    "status-state-surface-v2"
  ],
  "recommendations": [
    "Proceed to Architect Wave Report for Wave 9; no follow-up hygiene actions required.",
    "Engine will commit the pending journal.ndjson update as part of normal close-up finalization; no manual tree cleanup needed."
  ],
  "status": "complete",
  "summary": "Wave 9 complete: both items (adr-blocking-digest-v2, status-state-surface-v2) merged cleanly. Tree hygiene PASS: no untracked junk, no stray temp/build artifacts (*.tmp/*.orig/*.rej absent), no merge conflict markers in plugins/ (strict ^<<<<<<</^=======/^>>>>>>> scan clean; ===== hits under .factory/ are test-output banner lines, not conflicts). Only modified file is engine-managed .factory/tasks/concerns-funnel/journal.ndjson (2-line append, pending engine commit). Gates per diff table: typecheck pass/pass green (matches baseline), test fail->pass IMPROVED (baseline head-guard failures resolved). No regressions; no failed or blocked items.",
  "wave": 9
}

## Tech Debt
Blockers(taskDir)->Set plus
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


--- Steering Directive/Answer (1794112659180.md) ---
Operator acknowledges both plan-1 awareness items: (1) digest mailbox reuse — confirmed that digest/awareness dispositions must stay low-noise and non-blocking; status/derive/classify filtering keeps them out of the blocking set (verify in the funnel implementation; flag if any code path treats an empty-blocks awareness item as blocking). (2) merge escalation hidden — decision: keep dismissed/routed/resolved as terminal-in-merge, and surface escalated-severity-on-dismissed concerns in the digest (keep + digest surfacing). Triage remains the only path to reopen. No further action on these two.


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


## Steering Directives
Blockers(taskDir)->Set plus
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


--- Steering Directive/Answer (1794112659180.md) ---
Operator acknowledges both plan-1 awareness items: (1) digest mailbox reuse — confirmed that digest/awareness dispositions must stay low-noise and non-blocking; status/derive/classify filtering keeps them out of the blocking set (verify in the funnel implementation; flag if any code path treats an empty-blocks awareness item as blocking). (2) merge escalation hidden — decision: keep dismissed/routed/resolved as terminal-in-merge, and surface escalated-severity-on-dismissed concerns in the digest (keep + digest surfacing). Triage remains the only path to reopen. No further action on these two.


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


## Context Pack
# Context Pack — concerns-funnel (Spec Item 18)

This context pack prepares codebase and architectural context for implementing **spec item 18** of `docs/factory.v2.md` in `plugins/software-factory`. All file references use repo-relative paths (`plugins/software-factory/...`) with verified line ranges.

---

## 0. Acceptance Definition (Spec Item 18)

From `docs/factory.v2.md:89-103`:
- **Output contracts**: Every agent output may carry structured `concerns[]`: `{kind: tech-debt|assumption|blocker|risk|question, summary, detail, location?, severity: low|medium|high, affects?: item/epic/plan refs}`. Agents also report remarkable decisions/tradeoffs (`{chosen, alternatives, why}`).
- **Aggregation**: Engine aggregates them in `{task}/concerns/` with stable id (fingerprint), dedup across steps/attempts, status (`open|dismissed|routed|resolved`), and source step record pointer.
- **Triage**: Step reviewer (workhorse class; architect output → plan-reviewer) triages with review disposition vocabulary plus `dismiss` (logged with reason, kept in folder, no further action).
- **Routing**:
  - `blocker` affecting dependent item → dependent item blocked + architect consult.
  - `architect` → next architect turn (wave report / next iteration plan input).
  - `human-*` → steer mailbox per `reviewPolicy`.
  - `tech-debt` → plan tech-debt list.
- **Funneling**: `worker agents → workhorse reviewer (confirm/dismiss, condense) → epic architect → [saga architect] → human`. Every level passes up less detail than it receives and never more text than the code it summarizes; each level may resolve, steer, or propagate up. In a saga, epic-level concerns/decisions propagate to the saga architect.
- **ADRs**: Marked blocking or non-blocking. Blocking = needs human decision per active mode. Remarkable = below blocking threshold, reported in mailbox digest, never waits.
- **Human-involvement mode presets**: `autonomous`, `principal`, `detailed` (pipeline config + reviewer/architect prompt fragments), shipped as commented default config examples, selectable per task.
- **Surfacing**: Wave/plan close-ups list open concerns; close-up reviewers re-triage; architect resolves or carries; `factory status` and `state.yaml` show counts.
- **Deliverables**: Update `plugins/software-factory/docs/ARCHITECTURE.md` (§1 row 18, §6.2 task folder, §8), README, config commentary. Keep prompts terse (debloated). Behavior tests only.

---

## 1. Module Map

| Subsystem / Path | Architectural Responsibility | Key Citations |
|---|---|---|
| **Artifact & Configuration Types**<br>`plugins/software-factory/src/core/artifacts.ts` | Single source of TypeScript interfaces matching JSON schemas: `ReviewArtifact`, `DeveloperOutputArtifact`, `PlanArtifact`, `DecisionArtifact`, `SteerItemArtifact`, `StateArtifact`, `PipelineConfig`, `PipelineLimits`. | `artifacts.ts:77-133` (config), `artifacts.ts:288-373` (review, developer, closeup, decisions), `artifacts.ts:449-459` (state) |
| **JSON Schemas**<br>`plugins/software-factory/config/schemas/*.json` | Authoritative contracts for harness schema validation and `complete(@simpler)` structural repair: `review.schema.json`, `developer-output.schema.json`, `plan.schema.json`, `plan-closeup.schema.json`, `wave-closeup.schema.json`, `decisions.schema.json`, `steer-item.schema.json`, `state.schema.json`, `pipeline.schema.json`. | `config/schemas/developer-output.schema.json:61-69` (current free-form string concerns), `config/schemas/plan.schema.json:70-138` (adrs, techDebt, assumptions), `config/schemas/pipeline.schema.json:202-218` (reviewPolicy) |
| **Step Runner & Schema Resolution**<br>`plugins/software-factory/src/core/flows/step-runner.ts` | Dispatches agent turns, manages step record lifecycle, validates/repairs output, enforces HEAD guards, calls `writeArtifact` seam, commits worktree per step (§6 Invariants). | `step-runner.ts:25-30`, `step-runner.ts:90-110` (schema resolution), `step-runner.ts:220-230`, `step-runner.ts:610-655` (writeArtifact seam & commit) |
| **Review Schema Generator**<br>`plugins/software-factory/src/core/records/review-schema.ts` | Generates agent-specific JSON schema restricting `suggestions[].disposition` to the agent's allowed enum (§8.7). Natural insertion point for extending vocabulary with `dismiss`. | `review-schema.ts:5-52` (`generateReviewSchema`) |
| **Item Step Machine**<br>`plugins/software-factory/src/core/flows/item-machine.ts` | Drives per-item step execution (`develop` → `qa` → `review`), passes prompt vars (diff, target, dispositions criteria), collects suggestions, routes `human-async` to mailbox via `writeArtifact`. | `item-machine.ts:280-310` (suggestions loop), `item-machine.ts:628-647` (prompt review wiring), `item-machine.ts:706-728` (`writeQuestion` mailbox write), `item-machine.ts:750-765` (terminal conditions) |
| **Architect Iteration Flow**<br>`plugins/software-factory/src/core/flows/iteration.ts` | Orchestrates iteration lifecycle: `architect-plan` → `plan-review` loop (with `alt-architect`) → `pm-edits` → wave execution → `wave-close-up` → `architect-wave-report` → `plan-close-up` → `architect-closeup`. Writes ADRs, handles blocked questions. | `iteration.ts:335-400` (plan & ADR write), `iteration.ts:430-540` (plan review & revise), `iteration.ts:850-930` (wave close-up & report), `iteration.ts:1075-1150` (plan close-up & question write) |
| **Architect Consults & Decisions**<br>`plugins/software-factory/src/core/flows/consults.ts` | Dispatches `architect-consult-item` / `architect-consult-nonitem` on attempt/fix-round/merge failures; writes `{seq}-item-{item}.yaml` in `decisions/`; handles `human-async` question write. | `consults.ts:60-120` (item consult prompt), `consults.ts:130-180` (decision write & mailbox) |
| **Steering Mailbox**<br>`plugins/software-factory/src/core/steer.ts` | Root task mailbox: `writeQuestion` writes `steer/tousertoreview/{id}.yaml` with deterministic sha256 id; `listPending` reads `fromuserpending`; `classify` routes answers/directives/stop. | `steer.ts:18-40` (`listPending`), `steer.ts:59-110` (`writeQuestion`), `steer.ts:116-176` (`classify`) |
| **State Derivation & Counts**<br>`plugins/software-factory/src/core/derive/task.ts`<br>`plugins/software-factory/src/core/derive/item.ts`<br>`plugins/software-factory/src/core/derive/wave.ts` | Derives authoritative state from committed records + git (`deriveTaskState`, `toStateArtifact`, `deriveItemState`, `deriveWaveState`). Collects debt from plan, `accept-with-debt` decisions, and `optional` review suggestions. Cascades blocked dependencies. | `derive/task.ts:68-126` (iterations, closeups, open questions), `derive/task.ts:167-205` (debt collection), `derive/task.ts:307-335` (`toStateArtifact`), `derive/item.ts:180-260` (decisions & questions), `derive/wave.ts:44-63`, `85-100` (dependency blocking) |
| **Plan Scheduler**<br>`plugins/software-factory/src/core/plan/scheduler.ts` | Dependency-aware scheduling (`blockedByFailure`, `runnable`, `nextWave`). Transitive fixpoint for cascading blocked items. | `scheduler.ts:16-36` (`blockedByFailure`), `scheduler.ts:47-90` (`nextWave`), `scheduler.ts:101-135` (`runnable`) |
| **Fingerprints & Normalization**<br>`plugins/software-factory/src/core/fingerprint.ts`<br>`plugins/software-factory/src/core/loops.ts` | Deterministic hashing: `fingerprintText` (sha1 after whitespace/case normalization), `fingerprintObject` (sorted keys), `fingerprintSuggestions`. Reusable for stable concern fingerprint IDs and dedup. | `fingerprint.ts:10-50`, `loops.ts:169-178` |
| **Prompt Library & Registry**<br>`plugins/software-factory/src/core/prompts.ts`<br>`plugins/software-factory/src/core/prompt-vars.ts` | Prompt fragment rendering, `KNOWN_VARS` placeholder registry, `loadCriteriaBundle`, `formatDispositionsSection`, preflight prompt validation (`preflightPrompts`). | `prompts.ts:50-80` (`formatDispositionsSection`), `prompts.ts:420-520` (`preflightPrompts`), `prompt-vars.ts:12-38` (`PROMPT_VAR_DESCRIPTIONS`), `prompt-vars.ts:44-161` (`KNOWN_VARS`) |
| **CLI Status**<br>`plugins/software-factory/src/cli/status.ts` | Formats and prints derived task state, waves/items, open steer questions (`tousertoreview`), and recorded tech debt. | `status.ts:50-108` |
| **Engine Orchestration & Epics**<br>`plugins/software-factory/src/core/engine.ts` | Core derive-act-commit loop (`runTask`); spawns and manages child epics (`runChildTask`); processes mailbox directives; enforces budget stops (exit 10). | `engine.ts:208-285` (`runChildTask`), `engine.ts:325-335` (operator-editable globs), `engine.ts:380-465` (mailbox loop & budget stop), `engine.ts:685-715` (iteration invocation) |
| **Configuration Loading & Layering**<br>`plugins/software-factory/src/core/config/loader.ts`<br>`plugins/software-factory/src/core/config/merge.ts` | Loads and layers default → project (`.factory/pipeline.yaml`) → task (`{task}/pipeline.yaml`). Maps merge, arrays replace, `null` deletes. Validates against `pipeline.schema.json`. | `loader.ts:58-150`, `merge.ts:10-60` |
| **Agent Prompt Definitions**<br>`plugins/software-factory/agents/**` | Agent frontmatter and instructions: `developer.md`, `reviewer.md`, `plan-reviewer.md`, `architect.md`, `wave-close-up.md`, `plan-close-up.md`, `_shared/dispositions.md`, `criteria/dispositions.md`. | `agents/developer.md`, `agents/reviewer.md`, `agents/plan-reviewer.md`, `agents/criteria/dispositions.md:1-25`, `agents/_shared/dispositions.md:1-30` |

---

## 2. Key Interfaces & Signatures

### 2.1 Existing Artifact Types (`src/core/artifacts.ts`)

```typescript
// Review Dispositions (§8.7, artifacts.ts:288-295)
export type ReviewDisposition =
  | "fix"
  | "optional"
  | "architect"
  | "human-awareness"
  | "human-async"
  | "human-stop";

// Review Suggestion & Output (artifacts.ts:296-311)
export interface ReviewSuggestion {
  id: string;
  disposition: ReviewDisposition | string;
  summary: string;
  detail?: string;
  location?: { file: string; line?: number };
}
export interface ReviewArtifact {
  status: "approved" | "changes_requested";
  summary: string;
  suggestions: ReviewSuggestion[];
}

// Current Developer Output (artifacts.ts:318-325) — free-form string concerns only
export interface DeveloperOutputArtifact {
  status: "ok" | "blocked" | "failed";
  summary: string;
  target?: DeveloperTarget;
  evidence?: string[];
  concerns?: string[];   // <--- Free-form string array; must become structured Concern[]
  notes?: string;
}

// Plan ADRs & Tech Debt (artifacts.ts:228-252)
export interface PlanAdr {
  id: string;
  title: string;
  context: string;
  decision: string;
  consequences?: string;
  // Missing: blocking?: boolean
}
export interface PlanTechDebt {
  id: string;
  description: string;
  category: "adjacent" | "impacting" | "blocking";
  resolution?: string;
}

// Steer Mailbox Item (artifacts.ts:375-386)
export interface SteerItemArtifact {
  id: string;
  ref: string;
  disposition: string;
  question: string;
  draftDecision?: string;
  blocks?: string[];
  status: "open" | "answered" | "dismissed";
  createdAt?: string;
  answeredAt?: string;
  answer?: string;
}

// State Artifact (artifacts.ts:449-459)
export interface StateArtifact {
  task: string;
  kind?: string;
  status: "active" | "blocked" | "done" | "failed";
  iteration: number;
  currentWave?: number;
  items: Record<string, StateItemInfo>;
  debt?: string[];
  budgetSpentUsd?: number;
  lastUpdated: string;
  // Missing: concern counts & summary
}
```

### 2.2 Spec Item 18 Structured Concern Type (Required Target Contract)

Per `docs/factory.v2.md:90`:
```typescript
export type ConcernKind = "tech-debt" | "assumption" | "blocker" | "risk" | "question";
export type ConcernSeverity = "low" | "medium" | "high";
export type ConcernStatus = "open" | "dismissed" | "routed" | "resolved";

export interface Concern {
  id?: string;                        // Stable fingerprint id assigned by engine
  kind: ConcernKind;
  summary: string;
  detail: string;
  location?: { file: string; line?: number };
  severity: ConcernSeverity;
  affects?: string[];                 // item / epic / plan references
}

export interface RemarkableDecision {
  chosen: string;
  alternatives: string[];
  why: string;
}

export interface StoredConcernArtifact extends Concern {
  id: string;
  status: ConcernStatus;
  disposition?: string;               // Assigned during triage
  dismissReason?: string;             // When disposition is "dismiss"
  source: {
    record: string;                   // Step record directory name, e.g. "003-review-a1"
    agent: string;
    step: string;
    item?: string;
    iteration?: number;
  };
  createdAt: string;
  updatedAt: string;
}
```

### 2.3 Review Schema Generation (`src/core/records/review-schema.ts:5-52`)

```typescript
export function generateReviewSchema(
  allowedDispositions: string[]
): Record<string, unknown>;
```
Currently generates schema where `suggestions[].disposition` is an enum of `allowedDispositions` (default: `["fix", "optional", "architect", "human-awareness", "human-async"]`). Triage extension must allow `dismiss` in this vocabulary.

### 2.4 Step Execution & Schema Resolution (`src/core/flows/step-runner.ts`)

```typescript
export interface StepRunOptions {
  task: string;
  item?: string;
  stepId: string;
  stepFragment?: string;
  agent: string;
  role?: string;
  cwd: string;
  taskDir: string;
  recordsDir: string;
  repo: any;
  harness: Harness;
  pipeline: PipelineConfig;
  project: ProjectConfig;
  prompts: any;
  promptVars: Record<string, string>;
  writeArtifact?: (output: unknown) => Promise<void>;  // <--- Seam: runs before finishStepRecord
  // ...
}
export interface StepRunResult {
  ok: boolean;
  status: StepMetaStatus;
  output?: unknown;
  meta: StepMetaArtifact;
  sessionId?: string;
}
```

---

## 3. Relevant Code Excerpts & Current Wiring

### 3.1 Item Machine: Review Allowed Dispositions & Prompt Wiring
From `plugins/software-factory/src/core/flows/item-machine.ts:631-647`:
```typescript
  const criteriaBundle = loadCriteriaBundle(pipeline.criteria);
  const reviewAllowed =
    pipeline.reviewPolicy?.allowedDispositions ??
    pipeline.reviewPolicy?.[currentStep.agent] ??
    ["fix", "optional", "architect", "human-awareness", "human-async"];

  const promptVars: Record<string, string> = {
    assignment: assignmentYaml,
    intent: intentText,
    target: lastDeveloperTarget ? JSON.stringify(lastDeveloperTarget, null, 2) : "tests",
    citations: JSON.stringify(itemState.assignment?.citations ?? [], null, 2),
    context: "",
    checks: failingCheckSummaries.join("\n"),
    testDiff: "",
    diff: diffRes.stdout,
    feedback: feedbackText,
    dispositionsCriteria: formatDispositionsSection(criteriaBundle.dispositions, reviewAllowed),
  };
```
*Note*: Line 632 checks `pipeline.reviewPolicy?.allowedDispositions`, but `StepRunner` at `step-runner.ts:222` only reads `pipeline.reviewPolicy?.allowedDispositions` (global), so per-agent overrides (`pipeline.reviewPolicy[currentStep.agent]`) currently reach the prompt but NOT the schema generator unless resolved uniformly.

### 3.2 Item Machine: `writeArtifact` Seam Writing `human-async` Questions
From `plugins/software-factory/src/core/flows/item-machine.ts:706-727`:
```typescript
    writeArtifact: async (output: unknown) => {
      // Persist human-async questions atomically with the review record (Finding 23)
      if (output && typeof output === "object" && "suggestions" in (output as any)) {
        const rev = output as ReviewArtifact;
        const asyncQuestions = rev.suggestions?.filter((s) => s.disposition === "human-async");
        if (asyncQuestions && asyncQuestions.length > 0) {
          for (const q of asyncQuestions) {
            const cleanSuggestionId = (q.id || "s").replace(/[^a-z0-9_-]/gi, "-");
            const qId = `q-${itemSlug}-${cleanSuggestionId}`;
            await writeQuestion(taskWt, taskDir, {
              id: qId,
              ref: itemSlug,
              disposition: "human-async",
              question: q.detail || q.summary,
              blocks: [itemSlug],
            });
          }
        }
      }
    },
```
This is the proven atomic persistence pattern for routing reviewer suggestions to mailbox questions; concern aggregation from agent outputs maps naturally to this seam or an adjacent callback.

### 3.3 Step Runner: `writeArtifact` Seam & Commit Invariant
From `plugins/software-factory/src/core/flows/step-runner.ts:611-655`:
```typescript
  // 12. Write canonical artifact before finishing meta so both land in the same commit (§6.2, Invariant 5)
  if (finalStatus === "ok" && opts.writeArtifact) {
    try {
      await opts.writeArtifact(validatedData);
    } catch (err: any) {
      finalStatus = "error";
      validationError = `Failed writing canonical artifact: ${err?.message || err}`;
    }
  }

  // 13. Invariant §6.3.2: Finish step record with final meta
  const finalMeta = await finishStepRecord({ ... });

  // 14. Invariant §6.3.2, §6.3.3: Engine commits worktree after every step
  if (!(await isMerging(wtToCommit))) {
    await commitAll(
      repo,
      wtToCommit,
      `factory${item ? `(${item})` : ""}: ${stepId} a${attempt} [${finalStatus}]`
    );
  }
```

### 3.4 Steering: `writeQuestion` Stable ID Pattern
From `plugins/software-factory/src/core/steer.ts:63-108`:
```typescript
export async function writeQuestion(
  rootWt: string,
  taskDir: string,
  q: Omit<SteerItemArtifact, "id" | "status"> & { id?: string }
): Promise<SteerItemArtifact> {
  const hash = crypto
    .createHash("sha256")
    .update(`${q.ref}:${q.question}:${q.disposition}`)
    .digest("hex")
    .slice(0, 10);

  const cleanRef = q.ref.replace(/[^a-z0-9_-]/gi, "-");
  const id = q.id ?? `q-${cleanRef}-${hash}`;
  // ...
  const targetPath = path.join(outDir, `${id}.yaml`);
  if (fs.existsSync(targetPath)) {
    // A re-run step raising the same question must not clobber the operator's answer.
    try {
      const existing = yaml.parse(await fs.promises.readFile(targetPath, "utf8")) as SteerItemArtifact;
      return existing;
    } catch { }
  }
  await writeYamlAtomic(targetPath, item);
  return item;
}
```
This demonstrates the dedup and idempotent overwrite-guard pattern needed for `concerns/{id}.yaml`.

### 3.5 Plan Review Flow: Architect <-> Reviewer Turn
From `plugins/software-factory/src/core/flows/iteration.ts:440-485`:
```typescript
    const revStepRes = await runAgentStep({
      task,
      stepId: revRecordName,
      stepFragment: "steps/plan-review",
      agent: "plan-reviewer",
      role: "alt-architect",
      cwd: taskWt,
      recordsDir: runsDir,
      promptVars: {
        plan: JSON.stringify(plan, null, 2),
        intent: intentText,
        context: contextYaml,
        limits: JSON.stringify(limits, null, 2),
        dispositionsCriteria: formatDispositionsSection(
          loadCriteriaBundle(pipeline.criteria).dispositions,
          pipeline.reviewPolicy?.allowedDispositions ?? ["fix", "optional", "architect", "human-awareness", "human-async"]
        ),
      },
      // ...
    });
    // ...
    const revOutput = revStepRes.output as ReviewArtifact | undefined;
    const fixSuggestions = revOutput?.suggestions?.filter((s) => s.disposition === "fix");
    if (!fixSuggestions || fixSuggestions.length === 0) {
      break; // Plan approved!
    }
```
Currently `plan-review` only acts on `fix` suggestions (looping into `architect-revise`). Architect concerns/decisions are not triaged or propagated here yet.

### 3.6 ADR Writing: Current Implementation Only Writes Title + Context
From `plugins/software-factory/src/core/flows/iteration.ts:380-390`:
```typescript
        // Write ADRs if specified (§8.4.2)
        if (plan.adrs && project.adrFolder) {
          const adrDir = path.join(taskWt, project.adrFolder);
          await fs.promises.mkdir(adrDir, { recursive: true });
          for (const adr of plan.adrs) {
            const adrFile = path.join(adrDir, `${adr.id}.md`);
            await writeTextAtomic(adrFile, `# ${adr.title}\n\n${adr.context}\n`);
          }
        }
```
Notice that `adr.decision` and `adr.consequences` are currently omitted from the markdown file, and there is no `blocking` flag.

### 3.7 Derived Tech Debt Collection
From `plugins/software-factory/src/core/derive/task.ts:167-205`:
```typescript
  // 7. Tech debt collection
  const debtSet = new Set<string>();
  if (plan?.techDebt) {
    for (const d of plan.techDebt) {
      debtSet.add(d.description);
    }
  }
  // From decisions: accept-with-debt
  const decisionsDir = path.join(taskDir, "decisions");
  if (fs.existsSync(decisionsDir)) {
    // ... adds d.debt
  }
  // From review suggestions with disposition optional
  for (const it of items) {
    for (const rec of it.records) {
      if (rec.output && typeof rec.output === "object" && "suggestions" in (rec.output as any)) {
        const suggestions = (rec.output as any).suggestions;
        for (const sug of suggestions ?? []) {
          if (sug.disposition === "optional" && sug.summary) {
            debtSet.add(`[${it.slug}] ${sug.summary}`);
          }
        }
      }
    }
  }
```
Concerns routed to `tech-debt` must feed into this derived debt set.

### 3.8 Wave Dependency Blocking (Transitive Fixpoint)
From `plugins/software-factory/src/core/derive/wave.ts:44-63` & `plugins/software-factory/src/core/plan/scheduler.ts:16-36`:
```typescript
  // Dependents of failed items become blocked-by-failure, cascaded transitively to a fixpoint (§8.2)
  const schedItems = items.map((it) => ({
    slug: it.slug,
    wave: String(it.wave),
    deps: it.deps,
    status: it.status as "pending" | "running" | "done" | "failed" | "blocked" | "abandoned",
  }));
  const failureBlocked = new Set<string>(blockedByFailure(schedItems));
  let grew = failureBlocked.size > 0;
  while (grew) {
    grew = false;
    for (const it of items) {
      if (it.status === "pending" && !failureBlocked.has(it.slug) && it.deps.some((d) => failureBlocked.has(d))) {
        failureBlocked.add(it.slug);
        grew = true;
      }
    }
  }
```
Spec item 18's rule ("blocker affecting a dependent item → dependent item blocked + architect consult") hooks into this dependency-blocking mechanic.

### 3.9 Child Epic Execution & Parent State Propagation
From `plugins/software-factory/src/core/engine.ts:208-278`:
```typescript
export async function runChildTask(
  deps: EngineDeps,
  parent: { branch: string; path: string; taskDir: string },
  epicSlug: string,
  // ...
): Promise<RunResult> {
  // Child worktree topic/{task}--{epic}
  // Runs its own runIteration loop
  // Writes child-closeup.yaml into parentItemDir:
  const parentItemDir = path.join(parent.taskDir, "items", epicSlug);
  await writeYamlAtomic(path.join(parentItemDir, "child-closeup.yaml"), {
    epic: epicSlug,
    status: childStatus,
    iteration: itRes.iteration,
    summary: `Epic child task finished: ${itRes.status}`,
  });
```

### 3.10 CLI Status Rendering
From `plugins/software-factory/src/cli/status.ts:83-105`:
```typescript
  if (derived.openSteerQuestions && derived.openSteerQuestions.length > 0) {
    console.log(`Open Operator Questions (tousertoreview):`);
    for (const q of derived.openSteerQuestions) {
      console.log(`  * [${q.id}] ref: ${q.ref} | disposition: ${q.disposition}`);
      console.log(`    Question: ${q.question}`);
      // ...
    }
  }
  if (derived.debt && derived.debt.length > 0) {
    console.log(`Recorded Technical Debt:`);
    for (const d of derived.debt) {
      console.log(`  - ${d}`);
    }
  }
```
Currently missing concern counts (`open`, `dismissed`, `routed`, `resolved`) and remarkable decision digests.

---

## 4. Existing Tests & Conventions

### 4.1 Testing Harness & Infrastructure
- **Test Runner**: `bun test` (see `plugins/software-factory/package.json:11-13`).
- **Temporary Git Repos**: `test/helpers/tmp-repo.ts:24-125` creates isolated git repositories with helper methods (`commit`, `createBranch`, `createWorktree`, `git`, `cleanup`).
- **Fake Harness Scripting**: `src/harness/fake/fake-harness.ts:40-140`. End-to-end engine tests script agent turns deterministically using label patterns:
  - Orchestration turns: `${task}/runs/${stepId}#a${attempt}`
  - Item turns: `${task}/items/${item}/${stepId}#a${attempt}`
  - Example: `test/engine/story-happy-path.test.ts:34-80`, `test/engine/human-async-steering.test.ts:70-130`.
- **Ajv Schema Verification**: Fake outcomes must conform to actual JSON schemas because `step-runner.ts:510-570` parses and validates them through `validateAndRepair`. Invalid scripted schemas trigger repair or failure.

### 4.2 Behavior Tests Only Convention
Per task intent and spec §13:
- Tests must verify end-to-end behaviors: raising concerns, aggregation on disk, triage by reviewer, routing effects (mailbox write, dependent item blocking, consult trigger, debt inclusion), state/status surfacing.
- No unit tests of prompt string templates or mocking internals; use `FakeHarness` driving `runTask` or `tickItemMachine`.
- Target files: `test/engine/concerns-funnel.test.ts` (new behavior suite), with focused additions to `test/steer.test.ts`, `test/cli/cli.test.ts`.

### 4.3 Prompt Preflight Invariants (`test/prompts.test.ts:102-195`)
- Every agent declared in `pipeline.agents` must have a loadable definition in `agents/`.
- Every placeholder in step fragments must be registered in `KNOWN_VARS` (`src/core/prompt-vars.ts:44-161`).
- Every orchestration fragment in `ENGINE_STEP_FRAGMENTS` (`src/core/prompts.ts:402-420`) must exist and pass render checks.
- Adding prompt fragments or variables for concern triage or human-involvement modes must update `KNOWN_VARS` and pass `preflightPrompts`.

### 4.4 Config Layering Semantics (`test/config-layering.test.ts:5-45`)
- Precedence: `config/pipeline.default.yaml` → `<repo>/.factory/pipeline.yaml` → `<repo>/{task}/pipeline.yaml`.
- Objects deeply merge, arrays replace wholesale, explicit `null` deletes keys.
- `config/schemas/pipeline.schema.json:253` enforces `"additionalProperties": false` at the root, so new top-level configuration keys (like `humanInvolvement`) require schema updates.

---

## 5. Current State vs. Item 18 Requirements (Gap Analysis)

| Feature | Spec Item 18 Requirement | Current Codebase State | Gap to Close |
|---|---|---|---|
| **Structured Concerns in Output** | Every agent output may carry `concerns[]`: `{kind, summary, detail, location?, severity, affects?}` + remarkable decisions/tradeoffs `{chosen, alternatives, why}`. | `DeveloperOutputArtifact` has only free-form `concerns?: string[]` (`artifacts.ts:323`). Other schemas (`plan.schema.json`, `fact-finder-output.schema.json`, `wave-closeup.schema.json`, `plan-closeup.schema.json`) have no `concerns` or `remarkable` fields. | Define structured `Concern` and `RemarkableDecision` schemas/types; update output schemas for developer, fact-finder, architect plan, and close-ups. |
| **Engine Aggregation & Dedup** | Engine aggregates them in `{task}/concerns/` with stable fingerprint id, dedup across steps/attempts, status (`open|dismissed|routed|resolved`), source step record pointer. | No `concerns/` folder exists (`docs/ARCHITECTURE.md:185-197`). `writeQuestion` pattern exists (`steer.ts:63-108`) with sha256 hashing, but no concern aggregation logic exists. | Build `src/core/concerns.ts` with `aggregateConcerns()`: stable hash of `{kind, summary, location, affects}`, atomic YAML write in `{task}/concerns/{id}.yaml`, dedup/merge across re-runs. |
| **Reviewer Triage & Dispositions** | Step reviewer (workhorse class; architect output → plan-reviewer) triages with review disposition vocabulary plus `dismiss` (logged with reason, kept in folder). | Review vocabulary (`artifacts.ts:288-294`, `review-schema.ts:9-12`) lacks `dismiss`. `item-machine.ts` and `iteration.ts` do not pass open concerns to reviewers or collect triage decisions. | Add `dismiss` to `ReviewDisposition`; extend review schema to accept concern triage; pass open concerns in `promptVars`; record triage status/reason in `{task}/concerns/{id}.yaml`. |
| **Routing: Blocker & Architect** | `blocker` affecting dependent item → dependent item blocked + architect consult. `architect` → next architect turn (wave report / next plan input). | Review disposition `architect` is never routed anywhere in `item-machine.ts` or `iteration.ts`. Dependency blocking only checks `failed`/`abandoned` items (`scheduler.ts:16-36`). | Map `affects` to item slugs; mark affected items `blocked` in `deriveWaveState`/`deriveItemState`; trigger `runItemConsult` or hydrate into next architect turn (`buildArchitectHydration`). |
| **Routing: Human Mailbox & Tech Debt** | `human-*` → steer mailbox per policy; `tech-debt` → plan tech-debt list. | `human-async` writes to `steer/tousertoreview` (`item-machine.ts:711`), but `human-awareness` and `human-stop` are ignored. Debt collection (`derive/task.ts:167-205`) only reads plan `techDebt`, `accept-with-debt` decisions, and `optional` review suggestions. | Route `human-awareness` as non-blocking digest item in mailbox; route `human-stop` with task halt; add routed `tech-debt` concerns to `deriveTaskState` debt collection. |
| **Funneling & Text Budget** | `worker → reviewer (confirm/dismiss, condense) → epic architect → [saga architect] → human`. Less detail per level, never more text than code summarized. | No text length limits or condensing mechanics exist. Close-up prompts have no concerns context. | Provide condensed summaries at each funnel tier; enforce text size bound (detail bytes ≤ diff bytes); hydrate wave report and plan close-up with open concerns. |
| **Blocking vs Non-blocking ADRs** | Marked blocking or non-blocking. Blocking = needs human decision per mode; remarkable = below blocking threshold, reported in mailbox digest, never waits. | `PlanAdr` has no `blocking` boolean (`artifacts.ts:235-241`). `iteration.ts:380-390` writes only title/context to `.md` files; no mailbox digest exists. | Add `blocking?: boolean` to `PlanAdr` and `plan.schema.json`; route blocking ADRs to `writeQuestion` per mode; route non-blocking remarkable ADRs to mailbox digest. |
| **Human-Involvement Modes** | Config presets: `autonomous`, `principal`, `detailed` (pipeline config + prompt fragments for reviewer/architect criteria), selectable per task. | No mode concept in `PipelineConfig` (`artifacts.ts:108-133`). `criteria/dispositions.md` has static criteria without mode-specific rules. | Add mode config preset examples to `config/pipeline.default.yaml`; create prompt criteria fragments (`agents/criteria/human-involvement.md`); wire into prompt rendering. |
| **Surfacing & State Counts** | Wave/plan close-ups list open concerns; close-up reviewers re-triage; `factory status` and `state.yaml` show counts. | `state.yaml` (`StateArtifact`, `artifacts.ts:449-459`) has no concern fields. `status.ts:83-105` prints only operator questions and debt. | Add `concerns?: { open, dismissed, routed, resolved }` to `StateArtifact`, refresh in `deriveTaskState`, and render in `cli/status.ts`. |
| **Documentation Updates** | Update `ARCHITECTURE.md` (§1 row 18, §6.2, §8.7), README, config commentary. | Row 18 marked "Deliberately not hand-built" (`docs/ARCHITECTURE.md:39`). | Update `docs/ARCHITECTURE.md`, `README.md`, and config comments with full concerns funnel specifications. |

---

## 6. Open Questions & Architectural Decisions for the Architect

1. **Aggregation Worktree & Commit Invariant (§6.2 vs §6.3)**:
   - *Context*: In `step-runner.ts:630-655`, an item step commits only `childWt` (`topic/{task}--{item}`). The task orchestration folder `{task}/concerns/` lives on `taskWt` (`topic/{task}`).
   - *Options*:
     - (A) Write concerns directly to `taskWt/{task}/concerns/` during item steps, matching the precedent set by `writeQuestion` (`item-machine.ts:716`) and `refreshStateYaml` (`item-machine.ts:731`), with formal task worktree commit at wave merges/edits.
     - (B) Write item concerns to `childWt/{task}/items/{item}/concerns/` and aggregate them onto `taskWt` when the item merges or at wave completion.
     - (C) Extend `runAgentStep` to commit both worktrees when task-level artifacts are written.
   - *Recommendation*: Option (A) is cleanest and exactly matches `writeQuestion` and `state.yaml` behavior.

2. **Triage Schema Contract for Reviewers**:
   - *Context*: Reviewers need to triage concerns raised by earlier worker steps.
   - *Options*:
     - (A) Reuse the existing `suggestions[]` array in `ReviewArtifact`, extending `disposition` to include `"dismiss"`, matching on `suggestion.id = concern.id`.
     - (B) Add a distinct `concernTriage: Array<{ id: string; status: "confirmed" | "dismissed"; disposition?: ReviewDisposition; reason?: string }>` to `ReviewArtifact`.
   - *Tradeoff*: Option (A) adheres strictly to the spec phrasing ("triages new concerns with the same disposition vocabulary as review suggestions plus dismiss"), avoiding a separate schema branch.

3. **Text Size Bound Enforcement ("never more text than the code it summarizes")**:
   - *Context*: How should the engine mechanically check or enforce that summaries do not bloat?
   - *Options*:
     - Purely prompt-guided with debloated instructions in reviewer/architect prompts.
     - Mechanical validation in the engine comparing `concern.detail.length` to `diff.length` (or capping at a sensible max like 300 characters).

4. **Saga Concern Propagation Mechanics**:
   - *Context*: Epics run as child tasks (`engine.ts:208-285`) using `runChildTask`, writing `child-closeup.yaml`. How should epic concerns reach the saga architect?
   - *Design*: When child epics finish, un-dismissed epic-level concerns/decisions can be summarized into `child-closeup.yaml` or copied into the parent task's `concerns/` directory, hydrating the saga architect's next wave report or close-up turn.

5. **Mailbox Digest Delivery for Remarkable Items**:
   - *Context*: "remarkable items reported in a mailbox digest, never waiting".
   - *Design*: Write to `steer/digest/` or record in `steer/tousertoreview/digest-{hash}.yaml` with `status: "open"`, `disposition: "human-awareness"`, without adding the item to `blocks: [...]`, so it surfaces in `factory status` and the mailbox without stopping the engine.

6. **Human-Involvement Mode Configuration Placement**:
   - *Context*: `pipeline.schema.json` has `additionalProperties: false` at the root.
   - *Options*:
     - Add `humanInvolvement: { type: "string", enum: ["autonomous", "principal", "detailed"], default: "autonomous" }` to `config/schemas/pipeline.schema.json` and `PipelineConfig`.
     - Alternatively, place it inside `reviewPolicy.mode` or under `criteria.humanInvolvement`.
   - *Recommendation*: Adding top-level `humanInvolvement` to schema and `PipelineConfig` is cleanest and aligns with the spec intent ("human-involvement modes = config presets").


## Task Status
iteration: 1
amendments: 2
items:
  - spike-text-budget kind=test-assumptions wave=1 status=merged outlineRef=spike-text-budget
  - spike-saga-commit kind=fact-finder wave=1 status=ready outlineRef=spike-saga-commit
  - concerns-contracts kind=dev wave=1 status=superseded outlineRef=concerns-contracts
  - concerns-store kind=dev wave=2 status=superseded outlineRef=concerns-store
  - modes-prompts kind=dev wave=2 status=superseded outlineRef=modes-prompts
  - reviewer-triage kind=dev wave=3 status=superseded outlineRef=reviewer-triage
  - plan-reviewer-triage kind=dev wave=3 status=superseded outlineRef=plan-reviewer-triage
  - routing-blocker-derive kind=dev wave=4 status=superseded outlineRef=routing-blocker-derive
  - routing-human-debt kind=dev wave=4 status=superseded outlineRef=routing-human-debt
  - routing-architect-consult kind=dev wave=5 status=superseded outlineRef=routing-architect-consult
  - adr-blocking-digest kind=dev wave=5 status=superseded outlineRef=adr-blocking-digest
  - status-state-surface kind=dev wave=5 status=superseded outlineRef=status-state-surface
  - funnel-closeups kind=dev wave=6 status=superseded outlineRef=funnel-closeups
  - saga-propagate kind=dev wave=6 status=superseded outlineRef=saga-propagate
  - docs-finish kind=dev wave=7 status=superseded outlineRef=docs-finish
  - concerns-contracts-types kind=dev wave=2 status=merged outlineRef=concerns-contracts-types
  - concerns-contracts-schemas kind=dev wave=3 status=merged outlineRef=concerns-contracts-schemas
  - concerns-contracts-policy kind=dev wave=3 status=merged outlineRef=concerns-contracts-policy
  - concerns-store-v2 kind=dev wave=6 status=merged outlineRef=concerns-store-v2
  - modes-prompts-v2 kind=dev wave=6 status=merged outlineRef=modes-prompts-v2
  - reviewer-triage-v2 kind=dev wave=7 status=merged outlineRef=reviewer-triage-v2
  - plan-reviewer-triage-v2 kind=dev wave=7 status=merged outlineRef=plan-reviewer-triage-v2
  - routing-blocker-derive-v2 kind=dev wave=8 status=merged outlineRef=routing-blocker-derive-v2
  - routing-human-debt-v2 kind=dev wave=8 status=merged outlineRef=routing-human-debt-v2
  - routing-architect-consult-v2 kind=dev wave=9 status=ready outlineRef=routing-architect-consult-v2
  - adr-blocking-digest-v2 kind=dev wave=9 status=merged outlineRef=adr-blocking-digest-v2
  - status-state-surface-v2 kind=dev wave=9 status=merged outlineRef=status-state-surface-v2
  - funnel-closeups-v2 kind=dev wave=10 status=pending outlineRef=funnel-closeups-v2
  - saga-propagate-v2 kind=dev wave=10 status=pending outlineRef=saga-propagate-v2
  - docs-finish-v2 kind=dev wave=11 status=pending outlineRef=docs-finish-v2
waves: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
merged: spike-text-budget, concerns-contracts-types, concerns-contracts-schemas, concerns-contracts-policy, concerns-store-v2, modes-prompts-v2, reviewer-triage-v2, plan-reviewer-triage-v2, routing-blocker-derive-v2, routing-human-debt-v2, adr-blocking-digest-v2, status-state-surface-v2
blocked: (none)
failed: (none)
open steer questions:
  (none)

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
