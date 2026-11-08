# Step: Architect Consult (Item)

## Goal
Resolve an item-level blockage, retry exhaustion, size violation, or reviewer escalation.

## Rules
- Exploration budget: diagnose root causes from the assignment, prior attempts, current diff, review feedback, and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)

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
`). Read code ONLY to verify a specific failure site or interface contract (few targeted reads, never broad scans). If root cause remains unknown, split the item, outline a spike, or escalate instead of investigating. Keep terse.
- Decision options (yield `decision` matching `decisions.schema.json` with `context: "item"`):
  - `retry-with-guidance`: provide concrete technical steering for another developer attempt. Set `persist: true` if guidance applies to subsequent rounds.
  - `split`: decompose oversized or unfocused item into smaller, independent item outlines (respecting the configured split-depth limit).
  - `escalate`: relaunch item using `task-escalation` model role for developer and reviewer steps.
  - `accept-with-debt`: accept current partial progress; record unaddressed requirements or shortcuts as formal tech debt.
  - `abandon`: cancel the item if obsolete, unfeasible, or superseded. State clear technical justification.
- Grounded judgment: inspect prior attempts, failure output, reviewer feedback, and the current code diff to identify root cause before deciding.

## Item
spike-saga-commit

## Assignment
{"slug":"spike-saga-commit","kind":"fact-finder","title":"Spike: saga propagation, commit, derive boundary","assignment":"Read-only fact-finder verifying epic propagation timing, taskWt serialization/restart, and pure-derive vs act-phase boundary (adr-concern-store-taskwt, adr-routing-derived-state). Verify: runChildTask parent-copy timing after child completion before cleanup/merge, parent buildArchitectHydration extension seam for concernsYaml, taskWt runExclusive serialization under 4 parallel items, writeYamlAtomic + immediate taskWt commit idempotency on retry/restart, collectRoutedBlockers owner in derive/task.ts. Produce items/{item}/findings.md + structured findings; no prod code. Gates concerns-store, routing-blocker-derive, saga-propagate.","outlineRef":"spike-saga-commit","milestone":"m1-contracts-aggregate","wave":1,"scenarioRefs":["m1-contracts-aggregate:s2","m3-routing:s2","m4-funnel-surface:s5"],"citations":["docs/factory.v2.md:89-103","plugins/software-factory/src/core/flows/iteration.ts:439-485","plugins/software-factory/src/core/derive/task.ts:167-205"]}

## Prior Attempts & Failures
Merge path failed for spike-saga-commit

## Current Diff
diff --git a/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/001-research-a1/input.md b/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/001-research-a1/input.md
new file mode 100644
index 0000000..9910091
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/001-research-a1/input.md
@@ -0,0 +1,69 @@
+# Step: Research
+
+## Goal
+Conduct technical spike research to eliminate architecture unknowns, investigate library capabilities, or diagnose root causes.
+
+## Rules
+- Investigative discipline: form multiple hypotheses; test using search, LSP, code inspection, and documentation queries.
+- Concrete references: ground every finding with repository paths, exact line ranges, or documentation URLs.
+- Deliverable: yield structured output matching `fact-finder-output.schema.json`. Do NOT write files; the engine writes `findings` to `items/{item}/findings.md`.
+- Read-only on repository: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
+
+## Assignment
+{
+  "slug": "spike-saga-commit",
+  "kind": "fact-finder",
+  "title": "Spike: saga propagation, commit, derive boundary",
+  "assignment": "Read-only fact-finder verifying epic propagation timing, taskWt serialization/restart, and pure-derive vs act-phase boundary (adr-concern-store-taskwt, adr-routing-derived-state). Verify: runChildTask parent-copy timing after child completion before cleanup/merge, parent buildArchitectHydration extension seam for concernsYaml, taskWt runExclusive serialization under 4 parallel items, writeYamlAtomic + immediate taskWt commit idempotency on retry/restart, collectRoutedBlockers owner in derive/task.ts. Produce items/{item}/findings.md + structured findings; no prod code. Gates concerns-store, routing-blocker-derive, saga-propagate.",
+  "outlineRef": "spike-saga-commit",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-contracts-aggregate:s2",
+    "m3-routing:s2",
+    "m4-funnel-surface:s5"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/flows/iteration.ts:439-485",
+    "plugins/software-factory/src/core/derive/task.ts:167-205"
+  ]
+}
+
+## Task Intent
+# concerns-funnel
+
+Implement spec item 18 of `docs/factory.v2.md` in `plugins/software-factory`
+(read it in full; it is the acceptance definition):
+- structured `concerns[]` and remarkable decisions/tradeoffs in agent outputs;
+- engine aggregation under the task folder (`concerns/`, stable fingerprint ids, dedup, status, source record);
+- triage by the step's reviewer (workhorse class; architect output → plan-reviewer) with the review disposition
+  vocabulary plus `dismiss` (logged with reason, kept);
+- routing: blockers block dependent items + architect consult; `architect` → next architect turn;
+  `human-*` → steer mailbox per policy; tech debt → plan tech-debt list;
+- funnel worker → reviewer → epic architect → saga architect → human, less detail per level, never more text
+  than the code summarized; saga architect reviews epic-level items and steers or propagates;
+- blocking vs non-blocking ADRs; remarkable items reported in a mailbox digest, never waiting;
+- human-involvement mode presets `autonomous`, `principal`, `detailed` (pipeline config + reviewer/architect
+  prompt fragments), shipped as commented default config examples; selectable per task;
+- surfaced in wave/plan close-ups, `factory status`, state.yaml counts.
+Update `plugins/software-factory/docs/ARCHITECTURE.md` (incl. the §1 row for item 18), README and config commentary.
+Keep prompts terse (debloated). Behavior tests only. Expected scope: a couple of iterations at most.
+
+
+## Context & Citations
+[
+  "docs/factory.v2.md:89-103",
+  "plugins/software-factory/src/core/flows/iteration.ts:439-485",
+  "plugins/software-factory/src/core/derive/task.ts:167-205"
+]
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","inconclusive"])
+- summary (string, required)
+- findings (string, required)
+- contextPack (string, optional)
+- sources (array of string, optional)
+- recommendations (array of string, optional)
diff --git a/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/001-research-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/001-research-a1/meta.yaml
new file mode 100644
index 0000000..e102336
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/001-research-a1/meta.yaml
@@ -0,0 +1,18 @@
+seq: 1
+name: research
+attempt: 1
+agent: fact-finder
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 900
+status: ok
+startedAt: 2026-11-08T00:55:33.311Z
+session: 01a1b8a7-4aba-71fc-a37e-d573896f7ace
+endedAt: 2026-11-08T01:12:10.422Z
+usage:
+  inputTokens: 215812
+  outputTokens: 78739
+  costUsd: 0.119713
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T00-55-33-818Z_01a1b8a7-4aba-71fc-a37e-d573896f7ace
diff --git a/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/001-research-a1/output.yaml b/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/001-research-a1/output.yaml
new file mode 100644
index 0000000..6b4bb48
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/001-research-a1/output.yaml
@@ -0,0 +1,559 @@
+status: ok
+summary: "Verified all five spike questions against the current engine source
+  and with read-only execution probes. (1) runChildTask has a clean,
+  pre-cleanup/pre-merge parent-copy window immediately after runIteration
+  returns (engine.ts:246-274), and failed/blocked epics never merge, so this is
+  the only reliable saga propagation seam. (2) buildArchitectHydration is a
+  private, single-call-site function whose overflow policy keeps the tail
+  (iteration.ts:111-168, 293); concerns must be appended last or exposed as a
+  registered prompt var, and the wave-report hydration is a stale
+  iteration-start snapshot (iteration.ts:902-903). (3) taskWt has no per-task
+  lock; all git writes are globally serialized by a non-reentrant AsyncMutex
+  (repo.writeLock). A probe proved nested runExclusive deadlocks and that
+  unlocked read-modify-write loses 3/4 concurrent updates, while KeyedMutex
+  fixes it. Per-concern files named by fingerprint are safe under 4 parallel
+  items; shared index/status RMW is not. (4) writeYamlAtomic + immediate
+  commitAll is empirically idempotent (first of 4 parallel write+commit calls
+  commits all files, others return null; retry creates no commit). Immediate
+  commit is REQUIRED: startup repairWorktree stashes uncommitted taskWt files
+  not in operatorEditable, and {task}/concerns/** is not in that list
+  (engine.ts:325-335, repair.ts:53-74). (5) collectRoutedBlockers does not exist
+  anywhere; derive/task.ts is the correct owner (it already derives items,
+  waves, debt and state, and is shared by engine/CLI/iteration), but it must be
+  threaded into deriveItemState/wave derivation because dependents of a blocked
+  item only cascade when the item status is already 'blocked' (wave.ts:87-98).
+  Additional constraints found for routing/saga: any open steer question whose
+  ref matches an item blocks it regardless of disposition (item.ts:249-273,
+  385-386); review.schema additionalProperties is false and reusing
+  suggestions[] for concern triage would trigger the fix loop
+  (item-machine.ts:280-302); decision filenames are seq-allocated by
+  parallel-unsafe readdir (consults.ts:127-157); runChildTask maps
+  next-iteration child closeups to failed (engine.ts:265-266); rootTaskDir is
+  passed but unused (engine.ts:216,702) while mailbox processing only reads the
+  root taskDir (engine.ts:111-203); and the advertised per-session turn
+  serialization is not wired in production (PersistentAgent unused; step-runner
+  calls harness.run directly)."
+findings: >-
+  # Spike findings — saga propagation, commit, derive boundary
+
+
+  Scope note: read-only investigation; no production code changed. All probes
+  used temporary repos/tmp dirs. The full test suite was not run (time budget).
+
+
+  ## 1. runChildTask: parent-copy timing after child completion, before
+  cleanup/merge — CONFIRMED
+
+
+  - `runChildTask` (plugins/software-factory/src/core/engine.ts:208-281) creates
+  the child task dir as `<childWt>/<orchFolder>/<parentTaskSlug>/<epicSlug>`
+  (engine.ts:227-230), runs exactly ONE `runIteration` on it
+  (engine.ts:246-259), then writes `items/{epic}/child-closeup.yaml` into the
+  parent taskDir and commits on `parent.path` (= taskWt) (engine.ts:261-274).
+
+  - The child worktree is merged and removed only later in the wave-end merge
+  path: mergeItem -> mergeChildIntoParent then removeWorktree
+  (plugins/software-factory/src/core/flows/merge-path.ts:216-225, invoked from
+  iteration.ts:788-845).
+
+  - Therefore the exact seam is between `const itRes = await runIteration(...)`
+  (engine.ts:246) and the `return` (engine.ts:276). `childTaskDir` is already in
+  scope, so the parent can read `{childTaskDir}/concerns/*.yaml` there and write
+  `{parent.taskDir}/concerns/*.yaml`; the existing child-closeup commit
+  (engine.ts:273-274) will include those files.
+
+  - Why not copy later: (a) blocked/failed epic children are never merged
+  (mergeItem is only called for `waveState.ready`, iteration.ts:790-811) and no
+  failure-path removeWorktree exists (only engine.ts simple path and
+  merge-path.ts:225), so their files never appear in taskWt; (b) epic item state
+  is derived ONLY from child-closeup.yaml (derive/item.ts:91-108), so nothing
+  else surfaces the child's concerns; (c) child task files merge to
+  `{taskDir}/{epicSlug}/...`, not to `{taskDir}/concerns/` (ARCHITECTURE §6.2,
+  docs/ARCHITECTURE.md:185-196), and buildArchitectHydration does not scan that
+  nested path.
+
+  - Timing caveat: `runChildTask` can run while other parent items run
+  concurrently in the same wave batch (iteration.ts:732-776), so the copy must
+  be idempotent by fingerprint and must write to the explicit taskWt path, never
+  `cwd`.
+
+  - Related gap: `runChildTask` receives `opts.rootTaskDir` (engine.ts:212-217,
+  702) but never uses it. Child-raised human questions are written under
+  `{childTaskDir}/steer/tousertoreview` (via writeQuestion), while
+  `processSteeringMailbox` reads only root `{taskDir}/steer/tousertoreview`
+  (engine.ts:120-143, called with root taskDir at engine.ts:398-406). Epic
+  human-routed concerns are therefore stranded unless runChildTask also forwards
+  them to the root mailbox (writeQuestion is deterministic/idempotent,
+  steer.ts:63-110).
+
+  - Risk (adjacent): runIteration can return `next-iteration`/`stopped`
+  (iteration.ts:1170-1176), which runChildTask maps to `failed` (`itRes.status
+  === "done" ? "done" : blocked ? "blocked" : "failed"`, engine.ts:265-266). A
+  multi-iteration epic therefore fails after iteration 1 and later concerns
+  never propagate. Confirmed by code; intended behavior unknown.
+
+
+  ## 2. buildArchitectHydration: extension seam for concernsYaml — CONFIRMED
+  (private, single call site, tail-truncating)
+
+
+  - `buildArchitectHydration(taskDir, maxBytes)` (iteration.ts:111-168)
+  concatenates prior plans, prior closeups, taken steering and decisions; if
+  over cap it keeps the TAIL: `combined.slice(combined.length - maxBytes)`
+  (iteration.ts:167). Cap = `limits.hydrationBytes` default 65536 in code
+  (iteration.ts:218) / 40000 in shipped config
+  (config/pipeline.default.yaml:333).
+
+  - It is private and called once per iteration at iteration.ts:293; the
+  resulting string is passed as BOTH `debt` and `steering` to architect-plan
+  (iteration.ts:350-362) and to architect-wave-report (iteration.ts:899-904). It
+  duplicates content in the prompt.
+
+  - Consequence: append a concerns section LAST (or it will be sliced away), or
+  introduce a dedicated registered prompt variable. A new placeholder is a hard
+  preflight failure unless registered in PROMPT_VAR_DESCRIPTIONS and KNOWN_VARS
+  per fragment (src/core/prompt-vars.ts:12-38, 94-153; prompts.ts:452-484).
+  Relevant fragments: `steps/architect-plan` (prompt uses {{debt}},{{steering}},
+  agents/steps/architect-plan.md:26-35), `steps/architect-wave-report`
+  (agents/steps/architect-wave-report.md:21-24), plus `steps/plan-review`,
+  `steps/wave-close-up`, `steps/plan-close-up` for triage.
+
+  - Staleness: `hydrationContext` is computed at iteration start
+  (iteration.ts:293) and reused verbatim by the wave-report turn
+  (iteration.ts:902-903), so concerns raised during the iteration are invisible
+  there unless the wave close-up output carries them (iteration.ts:853-876, 901
+  passes waveCloseupRes.output as `waveReport`). Note the canonical wave
+  artifact writer (iteration.ts:908-922) ignores the wave-close-up output and
+  rebuilds status/mergedItems from merge results, so close-up concerns are not
+  persisted in waves/wave-*.yaml. Similarly, architect-closeup writeArtifact
+  copies only status/summary/question into closeup-N.yaml
+  (iteration.ts:1126-1137), dropping schema fields (plan-closeup.schema.json
+  includes techDebt/completedMilestones).
+
+  - Schema-generated Output sections: renderStepPrompt appends an Output section
+  from the step schema (prompts.ts:370-381, records/schema-format.ts:1-80), so
+  adding `concerns[]`/`remarkable[]` to the JSON schemas is the lowest-effort
+  prompt surface; but all current output schemas are strict
+  (`additionalProperties: false`), so schema must change before prompts mention
+  the fields (developer-output.schema.json:34-72,
+  fact-finder-output.schema.json:23, plan.schema.json:28-81+,
+  decisions.schema.json:49, plan-closeup.schema.json, wave-closeup.schema.json).
+
+
+  ## 3. taskWt runExclusive serialization under 4 parallel items — NO PER-TASK
+  LOCK EXISTS
+
+
+  - Parallelism: `maxParallelItems` defaults to 2 in code (iteration.ts:216) but
+  the shipped config sets 4 (config/pipeline.default.yaml:314); turns are
+  globally capped by maxParallelTurns (engine.ts:368-370; config default 6). The
+  wave loop runs `activeItems.slice(0, maxParallelItems)` through Promise.all,
+  one step per item tick (iteration.ts:732-776). No test exercises >1 concurrent
+  item except config-layering asserting the value 4; story-happy-path sets 2 but
+  schedules one item (test/engine/story-happy-path.test.ts:203-205).
+
+  - Locking: `Repo.writeLock` is ONE non-reentrant FIFO AsyncMutex for the whole
+  repo (git/repo.ts:13-31, mutex.ts:8-44); every commitAll takes it
+  (git/commit.ts:11-17). `Repo.mergeLocks` is a KeyedMutex keyed by parent
+  branch (repo.ts:23,30) used only for merge sequences (merge-path.ts:65,
+  ingest.ts:505). There is NO taskDir-scoped lock anywhere.
+
+  - Probe (read-only): nested `mutex.runExclusive(async () =>
+  mutex.runExclusive(...))` never resolves -> DEADLOCK. So concerns-store must
+  NOT wrap `commitAll` inside `repo.writeLock.runExclusive`.
+
+  - Probe: 4 concurrent writers doing readYaml -> delay -> push ->
+  writeYamlAtomic on one index file lost 3 of 4 updates (final items=["c"]); the
+  same code under `KeyedMutex.runExclusive("task")` retained all 4.
+  writeYamlAtomic alone is atomic per file (unique temp + rename, io.ts:9-24)
+  but provides NO read-modify-write atomicity.
+
+  - Probe: 4 concurrent `writeYamlAtomic(distinct file) + commitAll(taskWt)`
+  calls produced exactly ONE commit containing all 4 files; the other 3 calls
+  returned null; git status clean; repeating the same writes/commits produced
+  zero new commits. This is the correct pattern: per-concern files + immediate
+  commit, no shared index; use a KeyedMutex keyed by taskDir only for status
+  transitions/dedup merges.
+
+  - Existing precedent/risk: `tickItemMachine` already calls `refreshStateYaml`
+  after every step from every parallel item (item-machine.ts:729-730), i.e.
+  concurrent same-file writeYamlAtomic to state.yaml; harmless because
+  state.yaml is a materialized view never read for decisions
+  (derive/task.ts:41-43, 351-354, verified: no reader). Also, writeQuestion uses
+  check-then-write with a deterministic id and returns the existing file
+  (steer.ts:63-110) - idempotent but TOCTOU; fine for identical content, not
+  sufficient for status precedence.
+
+  - Parallel-unsafe sequence allocation precedent: runItemConsult allocates
+  decision filenames by readdir+max seq inside writeArtifact
+  (consults.ts:127-157, 249-274); two concurrent consults can pick the same
+  `${seq}-item-{item}.yaml`. Blocker routing that triggers consults inherits
+  this hazard; use fingerprint-based ids or a taskDir lock. Related:
+  ARCHITECTURE:56 claims per-session turn serialization via sessions.ts, but
+  production runAgentStep calls harness.run directly with a resume id
+  (step-runner.ts:370-378) and PersistentAgent is only imported, never used
+  (iteration.ts:34; sessions.ts:34); concurrent consults resuming the same
+  architect session are not serialized by the engine.
+
+
+  ## 4. writeYamlAtomic + immediate taskWt commit: idempotency and restart —
+  CONFIRMED, with a mandatory recovery fix
+
+
+  - `writeYamlAtomic` = yaml.stringify + writeTextAtomic (unique temp name +
+  rename; mkdir -p) (records/io.ts:5-24). Concurrent same-path writes leave one
+  complete document (last-writer-wins) and no temp leftovers on success (probe:
+  200 concurrent writes -> parsed i=146, 0 leftovers).
+
+  - `commitAll` stages `git add -A` and returns null when nothing is staged,
+  unless allowEmpty (git/commit.ts:11-44). Probe confirmed retry of identical
+  content creates no commit -> idempotent at-least-once ingestion with
+  exactly-once commit effect.
+
+  - CRITICAL restart hazard: on every `runTask` start, `repairWorktree(taskWt,
+  "task", {operatorEditable})` commits only matched globs and then `git stash
+  push -u` everything else (git/repair.ts:53-74). The current operatorEditable
+  list is INTENT/pipeline/.factory/*.yaml/steer/fromuserpending only
+  (engine.ts:325-335); `{orchFolder}/{task}/concerns/**` is NOT matched.
+  Therefore any concern file written but not yet committed at crash time is
+  stashed away on restart and disappears from the working tree (preserved only
+  in the stash), so derive/routing will not see it. Immediate commit is not
+  optional; additionally add a recovery glob (or a dedicated engine-owned
+  reconcile pass) for concerns. Test evidence for the stash semantics:
+  test/git/repair.test.ts:106-148.
+
+  - Step-record atomicity boundary: canonical artifacts are written in
+  `writeArtifact` before finishStepRecord and committed in one step commit
+  (step-runner.ts:610-655; ARCHITECTURE §6.2:197). But item step records are in
+  the item worktree (item-machine.ts:655-658; step-runner.ts:216-218 chooses
+  wtToCommit = cwd when recordDir is under cwd), while concerns must live in
+  taskWt. Cross-worktree atomicity is impossible; if concern ingestion throws
+  inside writeArtifact the whole step becomes error (step-runner.ts:611-618).
+  Recommended boundary: ingest concerns in an act-phase hook with internal error
+  handling (or after step finish), keeping dedup/idempotency; never let concern
+  I/O change step status.
+
+  - Restart recovery of triage verdicts: a reviewer's ok record is never re-run
+  (item machine advances on committed records, item-machine.ts:274-302; step
+  records output.yaml committed at step-runner.ts:642-648; finishStepRecord
+  writes output.yaml, records/step-record.ts:72-113). If the process crashes
+  after the reviewer record commit but before the concern status write, the
+  verdict is lost unless the engine reconciles from committed reviewer outputs.
+  `repairInterruptedRecords` (engine.ts:57-106) is the existing
+  startup-reconcile analogue; add a concerns reconcile there or immediately
+  after. Derive must remain read-only (ARCHITECTURE §6.3 Invariant 4: state
+  derived from committed records + git, docs/ARCHITECTURE.md:203).
+
+
+  ## 5. collectRoutedBlockers ownership — derive/task.ts, integrated into
+  wave/item derivation
+
+
+  - The symbol does not exist today (grep across src/test: zero matches for
+  routed/Routed/blocker except blockedByFailure/blockedItems).
+
+  - derive/task.ts is the right owner: deriveTaskState already loads all items
+  (task.ts:127-149), waves (151-165), tech debt (167-205), task/status (212-305)
+  and materializes state.yaml (307-330, 351-375); it is called by the engine
+  loop (engine.ts:462-472), the CLI status (cli/status.ts:47-52) and tests.
+  Tech-debt routing belongs in the existing debtSet block at task.ts:167-205
+  (plan.techDebt + accept-with-debt decisions + optional suggestions today).
+
+  - Scheduling constraint: deriveWaveState only cascades dependents when the
+  dependency's status is already `blocked` or `failed` (wave.ts:87-98); simply
+  filtering inside deriveWaveState would not block the affected item itself.
+  Either pass a `blockedBy` set into deriveItemState (new optional param,
+  precedence above pending/running, before status returns at item.ts:371-425) or
+  post-process the item arrays before every deriveWaveState call
+  (iteration.ts:706-711, 779-784, 1043-1046; engine simple path 572-607; item
+  machine tick 175). A blocked item is then excluded from runnable/running
+  (wave.ts:77-104), so it will not be ticked.
+
+  - Pure-derive routing effects: blockers -> blocked set; architect ->
+  hydration/wave-report prompt input; tech-debt -> debtSet; human-* -> mailbox.
+  Only the mailbox write is an act-phase side effect and can be made idempotent
+  via writeQuestion's deterministic id (steer.ts:63-107); a per-tick
+  `ensureConcernQuestions` pass is safe to repeat.
+
+  - Blocking semantics caveat: ANY open question whose ref equals an item slug
+  (or task/item) blocks that item, regardless of disposition or blocks[]
+  (derive/item.ts:249-273, 385-386); at task level, ref === plan/task or blocks
+  includes task blocks the task (derive/task.ts:215-220). So
+  `human-awareness`/digest entries cannot reuse tousertoreview with an item ref
+  without changing derive; either add a non-blocking disposition/blocks check or
+  use a separate digest directory ignored by derive (matches
+  docs/adr/adr-digest-mailbox.md framing).
+
+  - Blocker consult: runItemConsult writes a decision artifact and optionally a
+  human-async question (consults.ts:104-169); blocked items are never ticked, so
+  the consult must be triggered from the wave/iteration act phase (or routing
+  time), not from the item machine. Use a durable once-marker (concern status
+  routedTo/consultedAt or decision fingerprint) and remember the decision
+  seq-allocation race above.
+
+
+  ## 6. Triage/contracts constraints relevant to the gates
+
+
+  - Review output is generated (not the static review.schema.json) for
+  reviewer/qa/plan-reviewer via generateReviewSchema (step-runner.ts:87-105,
+  records/review-schema.ts:5-53); suggestions items are
+  additionalProperties:false. Reusing suggestions[] for concern triage is
+  hazardous: item-machine treats every suggestion with disposition "fix" as a
+  fix-loop trigger (item-machine.ts:280-302) and fingerprints suggestions for
+  loop detection (loops.ts:169-171). A separate `concernTriage[]` branch (or
+  filtering entries carrying concernId out of the fix loop) is safer; `dismiss`
+  is currently absent everywhere and must be a separate enum value, not a
+  code-review suggestion disposition.
+
+  - Plan-review currently acts only on suggestions with disposition "fix"
+  (iteration.ts:480-485) and gets
+  plan/intent/context/limits/dispositionsCriteria only (iteration.ts:455-464),
+  no concerns; its output is not written as a canonical artifact (no
+  writeArtifact), so triage verdicts exist only in the ok step record and must
+  be re-applied idempotently on restart.
+
+  - Architect output surface: plan.schema.json has techDebt
+  (adjacent/impacting/blocking) and adrs but NO blocking flag and no concerns
+  (config/schemas/plan.schema.json:92-130; artifacts.ts PlanAdr:234-241). The
+  ADR writer emits only `# title\n\ncontext` (iteration.ts:376-386), dropping
+  decision/consequences; epic ADRs land under repo docs/adr via child worktrees
+  and merge normally. Blocking/non-blocking ADR routing needs a schema field and
+  cannot be derived from the current .md files.
+
+  - Config strictness: pipeline.schema.json root additionalProperties:false
+  (config/schemas/pipeline.schema.json:1-6 and tail), so a new
+  concerns/humanInvolvement block must be added to the schema or config loading
+  fails (loader.ts:104-112). reviewPolicy is an open map of arrays
+  (pipeline.schema.json:202-218; artifacts.ts:124-127). No
+  humanInvolvement/autonomous/principal/detailed strings exist in src/config
+  today.
+
+  - State surfacing: state.schema.json root additionalProperties:false
+  (state.schema.json:1-40); StateArtifact has no concern counts
+  (artifacts.ts:449-459). Add counts to both and print in CLI status
+  (cli/status.ts:58-105).
+
+
+  ## 7. Test seams (behavior-level)
+
+
+  - Epic propagation: extend
+  plugins/software-factory/test/engine/epic-child-task.test.ts (FakeHarness
+  scripts child turns; parent branch assertions at lines 185-217) to assert
+  `{taskDir}/concerns/*.yaml` exists on taskWt after the epic child run
+  (including blocked/failed child), committed on the root topic branch, and
+  deduped on re-run.
+
+  - Concurrency: no existing test runs 4 items in parallel; add one using
+  FakeHarness scripted per item label, each returning a concern in the same
+  wave; assert 4 files, one or more commits, clean git status, no duplicate ids,
+  and correct aggregation.
+
+  - Restart: follow crash-restart.test.ts style (pre-populated records +
+  runTask). Pre-write an uncommitted concern file, run task, assert it is
+  preserved (today it would be stashed by repairWorktree). Re-run with identical
+  outputs and assert no duplicate concerns/no new commit.
+
+  - Derive routing: unit-test deriveTaskState/deriveWaveState with a concern
+  file: blocker+routed affecting item B where A->B dep; assert B blocked, C
+  (dependent on B) blocked via existing cascade, unrelated D runnable; resolving
+  the concern unblocks on next derive. Assert consult called once (FakeHarness)
+  and mailbox entry idempotent.
+
+
+  ## Uncertainties / open questions
+
+
+  - Whether the intended store is one-file-per-fingerprint or an index file;
+  evidence strongly favors one-file-per-fingerprint (atomicity + concurrency
+  probes), but the plan wording "stable id by fingerprint" permits either.
+
+  - Exact funnel filter for parent copy (all routed concerns vs only
+  epic-architect-confirmed/propagate=true) is a product decision; spec says each
+  level passes up less detail (docs/factory.v2.md:97), so raw worker concerns
+  should not be copied verbatim.
+
+  - Whether epic children are expected to loop multiple iterations inside
+  runChildTask; current code maps next-iteration to failed (engine.ts:265-266)
+  and no test covers it - likely a pre-existing gap, but confirm with the
+  saga-propagate item owner.
+
+  - Whether `PersistentAgent` was intended to be wired into runAgentStep;
+  code/docs disagree (ARCHITECTURE:56 vs step-runner.ts:370-378).
+
+  - Full test suite was not executed (read-only spike; time budget). Probes used
+  tmp repos and left the working tree clean.
+contextPack: >-
+  # Context for implementing concerns-funnel (item 18)
+
+
+  ## Verified mechanics
+
+  - Item steps: cwd=childWt, recordsDir=childWt/relTaskDir/items/{slug}/steps
+  (item-machine.ts:655-658); the step commit goes to childWt
+  (step-runner.ts:214-218, 642-648). TaskWt files touched by item steps (steer
+  questions, state.yaml, and the new concerns) are separate commits.
+
+  - Task-level steps (architect, plan-review, PM, consults, close-ups):
+  cwd=taskWt, recordsDir=taskDir/runs; commits go to taskWt.
+
+  - Startup: repairWorktree avoids stashing only whitelisted taskWt globs;
+  everything else is stashed (repair.ts:53-74, engine.ts:325-335). Add concerns
+  to recovery or commit immediately (both recommended).
+
+  - Single repo-wide git mutex (non-reentrant); per-task lock absent; KeyedMutex
+  available (mutex.ts:50-79).
+
+  - Epic child files: {parentTaskDir}/{epic}/... on the child branch;
+  runChildTask copies only child-closeup before merge (engine.ts:246-274).
+
+
+  ## Recommended module shape
+
+  - src/core/concerns.ts: Concern/RemarkableDecision types, fingerprint id,
+  per-file store under {taskDir}/concerns/{id}.yaml, write-if-absent insert,
+  KeyedMutex(taskDir) for status/source merges, taskWt-only writes, commitAll
+  after write, reconcile(read records) API; no imports from flows to avoid new
+  cycles.
+
+  - derive/task.ts: collectRoutedBlockers(taskDir) -> {
+  blockedItems:Set<string>, architect:string[], human:string[], debt:string[] };
+  used by deriveTaskState and by iteration wave loop; tech-debt added to debtSet
+  at task.ts:167-205.
+
+  - iteration.ts: append concerns section last in buildArchitectHydration;
+  recompute before wave report or pass via wave-close-up output; add prompt vars
+  for plan-review/wave-close-up/plan-close-up; register in prompt-vars.ts.
+
+  - runChildTask: copy child concerns (filtered/condensed) to parent concerns
+  with epic source; forward child human questions to root mailbox;
+  copy/reference child closeup for saga hydration.
+
+
+  ## Contract pitfalls
+
+  - Do not reuse suggestions[] for concern triage without excluding concern
+  entries from fix-loop detection; prefer concernTriage[].
+
+  - Do not use tousertoreview item-ref entries for non-blocking awareness:
+  deriveItemState blocks on any open matching question
+  (item.ts:249-273,385-386).
+
+  - All output schemas are additionalProperties:false; schema change precedes
+  prompt change.
+
+  - commitAll returns null when unchanged; never wrap it in
+  repo.writeLock.runExclusive (deadlock proven).
+sources:
+  - docs/factory.v2.md:89-103
+  - docs/adr/adr-concern-store-taskwt.md
+  - docs/adr/adr-routing-derived-state.md
+  - docs/adr/adr-digest-mailbox.md
+  - docs/adr/adr-triage-suggestions-dismiss.md
+  - docs/adr/adr-funnel-text-budget.md
+  - docs/adr/adr-humaninvolvement-config.md
+  - plugins/software-factory/docs/ARCHITECTURE.md:39,56,59,185-206,213-218
+  - plugins/software-factory/docs/FIRE_TEST.md:49-52
+  - plugins/software-factory/src/core/engine.ts:57-106,111-203,208-281,325-335,368-370,394-472,680-732
+  - plugins/software-factory/src/core/flows/iteration.ts:111-168,212-220,293,350-386,432-544,688-776,788-924,1043-1060,1088-1137,1163-1180
+  - plugins/software-factory/src/core/flows/item-machine.ts:175,274-302,655-730,748-770
+  - plugins/software-factory/src/core/flows/merge-path.ts:65-257
+  - plugins/software-factory/src/core/flows/step-runner.ts:87-105,160-218,263-305,370-378,610-655
+  - plugins/software-factory/src/core/flows/consults.ts:104-185,226-291
+  - plugins/software-factory/src/core/derive/task.ts:44-205,212-330,351-375
+  - plugins/software-factory/src/core/derive/item.ts:60-132,208-273,346-451
+  - plugins/software-factory/src/core/derive/wave.ts:23-126
+  - plugins/software-factory/src/core/plan/scheduler.ts:20-34
+  - plugins/software-factory/src/core/git/commit.ts:11-44
+  - plugins/software-factory/src/core/git/repo.ts:13-31
+  - plugins/software-factory/src/core/git/repair.ts:15-77
+  - plugins/software-factory/src/core/git/merge.ts:138-207
+  - plugins/software-factory/src/core/mutex.ts:8-79
+  - plugins/software-factory/src/core/records/io.ts:5-24
+  - plugins/software-factory/src/core/records/step-record.ts:72-113
+  - plugins/software-factory/src/core/records/review-schema.ts:5-53
+  - plugins/software-factory/src/core/steer.ts:63-110
+  - plugins/software-factory/src/core/prompt-vars.ts:12-38,44-153
+  - plugins/software-factory/src/core/prompts.ts:452-484
+  - plugins/software-factory/src/core/artifacts.ts:110-127,234-266,296-325,359-390,449-459
+  - plugins/software-factory/config/pipeline.default.yaml:313-334,370-378
+  - plugins/software-factory/config/schemas/pipeline.schema.json:1-6,202-218
+  - plugins/software-factory/config/schemas/plan.schema.json:92-130
+  - plugins/software-factory/config/schemas/state.schema.json:1-40
+  - plugins/software-factory/config/schemas/developer-output.schema.json:34-72
+  - plugins/software-factory/config/schemas/fact-finder-output.schema.json
+  - plugins/software-factory/config/schemas/decisions.schema.json:1-50
+  - plugins/software-factory/config/schemas/plan-closeup.schema.json
+  - plugins/software-factory/config/schemas/wave-closeup.schema.json
+  - plugins/software-factory/config/schemas/steer-item.schema.json
+  - plugins/software-factory/test/engine/epic-child-task.test.ts:78-218
+  - plugins/software-factory/test/engine/crash-restart.test.ts:1-143
+  - plugins/software-factory/test/engine/story-happy-path.test.ts:1-260
+  - plugins/software-factory/test/git/repair.test.ts:106-182
+  - plugins/software-factory/test/engine/blocked-closeup-iteration.test.ts:120-262
+  - plugins/software-factory/src/core/sessions.ts:34-110
+recommendations:
+  - "concerns-store: implement src/core/concerns.ts as one file per fingerprint
+    id under {taskDir}/concerns, write-if-absent for insertion,
+    KeyedMutex(taskDir) only for status/source merges; write to explicit taskWt
+    (never cwd) and call commitAll immediately (idempotent; returns null when
+    unchanged)."
+  - "concerns-store: never wrap commitAll inside repo.writeLock.runExclusive
+    (non-reentrant deadlock proven); serialize only the read-modify-write with
+    KeyedMutex and let repo.writeLock guard git."
+  - "concerns-store: add {orchFolder}/{task}/concerns/** to startup recovery
+    (engine.ts:325-335 / repair.ts) and add a startup reconcileConcerns that
+    re-ingests committed step outputs and re-applies triage verdicts; keep
+    derive read-only."
+  - "concerns-store: fingerprint on stable identity (type+kind+normalized
+    summary) excluding detail/severity/source; track sources[]; enforce
+    precedence so re-raises never reopen dismissed/resolved concerns; store
+    source record paths relative to taskDir."
+  - "concerns-store: test 4 concurrent items raising concerns in one wave (one
+    commit/all files present/clean git/no duplicate ids), retry idempotency, and
+    the crash window where a concern file exists uncommitted before restart."
+  - "routing-blocker-derive: add collectRoutedBlockers(taskDir) in
+    derive/task.ts reading {taskDir}/concerns/*.yaml (kind=blocker,
+    status=routed) and returning affected item slugs; thread a blockedBy set
+    into deriveItemState or post-process item arrays before every
+    deriveWaveState call so the affected item itself is blocked and dependents
+    cascade via wave.ts:87-98."
+  - "routing-blocker-derive: add routed tech-debt to the existing debtSet block
+    (derive/task.ts:167-205) and surface concern counts in state.yaml/CLI
+    (requires state.schema.json + StateArtifact updates)."
+  - "routing-blocker-derive: trigger the architect consult from the
+    wave/iteration act phase (blocked items are never ticked), exactly once per
+    routed concern, and avoid the seq-allocated decision filename race
+    (consults.ts:127-157) by using fingerprint ids or a taskDir lock."
+  - "routing-*-derive: do not route non-blocking human-awareness through
+    tousertoreview item refs until deriveItemState stops blocking on every
+    matching open question; either add disposition/blocks-aware blocking or a
+    separate digest directory ignored by derive."
+  - "reviewer-triage: prefer a separate concernTriage[] output branch (or
+    exclude concern entries from the fix-loop filter) rather than reusing
+    suggestions[]; add dismiss only to the triage enum; regenerate schemas via
+    generateReviewSchema and update all strict output schemas before prompt
+    changes."
+  - "saga-propagate: copy filtered/condensed child concerns at runChildTask
+    between runIteration return and child-closeup write (engine.ts:246-274) for
+    every child status; also forward child human-routed questions to the root
+    mailbox (rootTaskDir is currently unused) and copy/reference the child
+    closeup for saga hydration."
+  - "saga-propagate: extend buildArchitectHydration by appending concerns LAST
+    (tail-slice keeps it) or add a registered concerns prompt var to
+    architect-plan/wave-report/plan-review/wave-close-up/plan-close-up;
+    recompute concerns for the wave report instead of reusing the
+    iteration-start snapshot."
+  - "saga-propagate: persist condensed concerns in waves/wave-*.yaml and
+    closeup-N.yaml (the current writers drop close-up output and most
+    architect-closeup fields), and include concern-blocked items in the wave
+    report (blockedItems currently only lists blocked-by-failure)."
+  - "saga-propagate: fix or explicitly decide the runChildTask next-iteration
+    mapping (currently failed, engine.ts:265-266) and wire per-session turn
+    serialization (PersistentAgent is unused) before multiple concurrent
+    architect consults become reachable."
+  - "Add behavior tests only: extend epic-child-task.test.ts for concern
+    propagation from a failed/blocked epic, add a 4-parallel-item concerns test,
+    a derive-level blocker cascade test, and a crash/restart idempotency test;
+    do not test linting."
diff --git a/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/002-review-a1/input.md b/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/002-review-a1/input.md
new file mode 100644
index 0000000..ab77cc8
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/002-review-a1/input.md
@@ -0,0 +1,73 @@
+# Step: Review
+
+## Goal
+Conduct adversarial peer code review on completed changes, evaluating implementation quality against requested focus criteria.
+
+## Rules
+- SKEPTICAL SCRUTINY: base findings on actual git diff and codebase state, never developer summaries.
+- Focus dimensions (see agent definition for the full philosophy and dispositions guide):
+  - `code`: validate clarity, wrapper discipline, complexity limits, boundary validation, and error typing.
+  - `security`: audit input sanitization, injection vectors, command execution boundaries, and secret exposure risks.
+  - `consistency`: ensure conformance with established repository naming idioms, directory layouts, and design patterns.
+  - `result`: for spikes (`fact-finder`, `poc`, `test-assumptions`), confirm findings answer the core uncertainty and code is properly isolated.
+- Reviewer boundary: reviewers critique; reviewers NEVER write fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
+
+## Dispositions Criteria
+Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async.
+Use ONLY these dispositions; any other disposition value fails validation.
+# Review Suggestion Dispositions
+
+Criteria for assigning disposition to review findings:
+
+| Disposition | When to Assign | Engine Action |
+|---|---|---|
+| `fix` | Concrete defect, failing gate, broken contract, missing test, or deviation from assignment. | Returns item to `fixLoopTo` step (bounded by `maxFixRounds`); developer must address. Non-item: triggers consult. |
+| `optional` | Non-blocking polish, code style improvement, minor refactor opportunity, or deferred debt. | Passed to developer if another fix round occurs; otherwise recorded as tech debt for future iterations. |
+| `architect` | Architectural contradiction, interface redesign, boundary breach, or uncertainty exceeding item scope. | Triggers immediate architect consult; architect's decision is binding and final. |
+| `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
+| `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |
+
+## Rules
+- Defect requiring code change MUST be `fix`.
+- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
+- Do NOT use `human-async` when repo context or architecture docs provide the answer.
+
+## Assignment
+{
+  "slug": "spike-saga-commit",
+  "kind": "fact-finder",
+  "title": "Spike: saga propagation, commit, derive boundary",
+  "assignment": "Read-only fact-finder verifying epic propagation timing, taskWt serialization/restart, and pure-derive vs act-phase boundary (adr-concern-store-taskwt, adr-routing-derived-state). Verify: runChildTask parent-copy timing after child completion before cleanup/merge, parent buildArchitectHydration extension seam for concernsYaml, taskWt runExclusive serialization under 4 parallel items, writeYamlAtomic + immediate taskWt commit idempotency on retry/restart, collectRoutedBlockers owner in derive/task.ts. Produce items/{item}/findings.md + structured findings; no prod code. Gates concerns-store, routing-blocker-derive, saga-propagate.",
+  "outlineRef": "spike-saga-commit",
+  "milestone": "m1-contracts-aggregate",
+  "wave": 1,
+  "scenarioRefs": [
+    "m1-contracts-aggregate:s2",
+    "m3-routing:s2",
+    "m4-funnel-surface:s5"
+  ],
+  "citations": [
+    "docs/factory.v2.md:89-103",
+    "plugins/software-factory/src/core/flows/iteration.ts:439-485",
+    "plugins/software-factory/src/core/derive/task.ts:167-205"
+  ]
+}
+
+## Engine Checks
+
+
+## Code Diff
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["approved","changes_requested"])
+- summary (string, required)
+- suggestions (array of object, required)
+  - id (string, required)
+  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async"])
+  - summary (string, required)
+  - detail (string, optional)
+  - location (object, optional)
+    - file (string, required)
+    - line (integer, optional)
diff --git a/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/002-review-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/002-review-a1/meta.yaml
new file mode 100644
index 0000000..c2f1c62
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/002-review-a1/meta.yaml
@@ -0,0 +1,18 @@
+seq: 2
+name: review
+attempt: 1
+agent: reviewer
+role: alt-workhorse
+models:
+  - opencode-go/muse-spark-1.3-contributor
+  - opencode-go/deepseek-v4.1-flash
+timeoutSec: 900
+status: ok
+startedAt: 2026-11-08T01:12:10.896Z
+session: 01a1b8b6-8316-7129-8a5f-f4b33efb73f4
+endedAt: 2026-11-08T01:17:09.360Z
+usage:
+  inputTokens: 48093
+  outputTokens: 31161
+  costUsd: 0.012219
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T01-12-11-286Z_01a1b8b6-8316-7129-8a5f-f4b33efb73f4
diff --git a/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/002-review-a1/output.yaml b/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/002-review-a1/output.yaml
new file mode 100644
index 0000000..63fcf4f
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/spike-saga-commit/steps/002-review-a1/output.yaml
@@ -0,0 +1,50 @@
+status: approved
+summary: "Spike verified: all 5 questions answered with accurate line-grounded
+  evidence; tree clean, no prod code; 4 minor precision nits."
+suggestions:
+  - detail: deriveItemState checks isMerged first (merged on git merge commit) and
+      only then maps epicChildStatus (ready/blocked/failed). Pre-merge the
+      closeup is the sole status source, so the runChildTask copy-seam
+      conclusion (engine.ts:246-274) is unaffected — but drop 'ONLY' to avoid
+      misleading downstream merge-path work.
+    disposition: optional
+    id: qualify-epic-closeup-only-claim
+    location:
+      file: plugins/software-factory/src/core/derive/item.ts
+      line: 373
+    summary: Qualify 'epic state derived ONLY from child-closeup.yaml' — isMerged
+      takes precedence
+  - detail: Inline refs 'docs/ARCHITECTURE.md:185-196',
+      'config/pipeline.default.yaml:314,333', 'config/schemas/*',
+      'agents/steps/*' omit the 'plugins/software-factory/' prefix (repo root
+      has no docs/ARCHITECTURE.md or config/). The sources list already uses
+      correct full paths; fix inline refs to match so gated items
+      (saga-propagate, concerns-store) resolve them mechanically.
+    disposition: optional
+    id: citation-path-prefixes
+    location:
+      file: .factory/tasks/concerns-funnel/items/spike-saga-commit/steps/001-research-a1/output.yaml
+      line: 71
+    summary: Inline citation paths missing plugins/software-factory/ prefix
+  - detail: removeWorktree failure-path calls do exist for scratch worktrees
+      (ingest.ts triage/infra failure paths). The spike's claim holds for epic
+      child worktrees specifically (only merge-path.ts:225 success-path removal
+      plus unrelated simple-path/scratch calls). Scope the sentence to epic
+      child worktrees to keep it literally true.
+    disposition: optional
+    id: removeworktree-scope
+    location:
+      file: .factory/tasks/concerns-funnel/items/spike-saga-commit/steps/001-research-a1/output.yaml
+      line: 66
+    summary: Scope 'no failure-path removeWorktree' claim to epic child worktrees
+  - detail: fact-finder-output.schema.json is additionalProperties:false with
+      exactly status/summary/findings/sources/recommendations. The step was
+      accepted (meta status ok), but any strict re-validation of output.yaml
+      would reject the 6th 'contextPack' key. Consider folding that content into
+      findings/recommendations.
+    disposition: optional
+    id: contextpack-schema-strictness
+    location:
+      file: .factory/tasks/concerns-funnel/items/spike-saga-commit/steps/001-research-a1/output.yaml
+      line: 387
+    summary: contextPack key exceeds strict fact-finder output schema

## Review Feedback
Quality gates failed on merge path for spike-saga-commit

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

## Output

Yield a structured JSON object matching this schema:
- id (string, optional): Unique identifier for this decision (assigned by engine if omitted)
- context (string, optional, enum: ["item","non-item","wave","plan-closeup"]): Decision context scope (item, non-item, wave, plan-closeup)
- decision (string, required, enum: ["retry-with-guidance","split","escalate","accept-with-debt","abandon","fix-item","human-async","abort","continue","amend","end-iteration","complete","next-iteration","blocked"]): Architect decision verdict
- rationale (string, optional): Technical justification for this decision
- text (string, optional): Concrete guidance or steering directives
- persist (boolean, optional): Whether guidance persists across subsequent attempts
- outlines (array of object, optional): Decomposed item outlines when decision is split
- outline (object, optional): Item outline to schedule when decision is fix-item
- debt (string, optional): Technical debt description when decision is accept-with-debt
- reason (string, optional): Reason for abandonment or abort
- question (string, optional): Specific question for human operator when decision is human-async or blocked
- planDelta (string, optional): Plan delta or amendment directives when decision is amend
- timestamp (string, optional): ISO timestamp (assigned by engine if omitted)
