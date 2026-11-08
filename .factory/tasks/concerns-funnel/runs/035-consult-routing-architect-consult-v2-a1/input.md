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
routing-architect-consult-v2

## Assignment
{"slug":"routing-architect-consult-v2","kind":"dev","title":"Architect consult and hydration","assignment":"Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) + buildArchitectHydration concernsYaml extension for wave-report/next-plan. Tests: single consult file, restart writes no duplicate, architect input contains concern id+summary.","outlineRef":"routing-architect-consult-v2","milestone":"m3-routing","wave":9,"deps":["modes-prompts-v2","routing-blocker-derive-v2"]}

## Prior Attempts & Failures
Merge path failed for routing-architect-consult-v2

## Current Diff
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/checks.yaml
new file mode 100644
index 0000000..ff0a121
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/checks.yaml
@@ -0,0 +1,26 @@
+checks:
+  - id: test-first-scope
+    status: pass
+    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
+    details:
+      testFiles:
+        - plugins/software-factory/test/engine/routing-architect-consult.test.ts
+      newProdFiles: []
+      stubProdLines: 0
+  - id: target-red
+    status: pass
+    message: "target-red passed: all 2 expected tests failed with assertion failures"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/routing-architect-consult.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794140428146-pkayk3bvwzb.xml
+      junitCaseCount: 2
+      junitCaseIds:
+        - "Routing: architect consult and hydration.writes one concern decision
+          file and hydrates architect turns with routed concerns"
+        - "Routing: architect consult and hydration.restart after a
+          mid-iteration failure neither repeats the consult nor rewrites the
+          decision"
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/input.md
new file mode 100644
index 0000000..10a3003
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/input.md
@@ -0,0 +1,53 @@
+# Step: Test-First
+
+## Goal
+Author automated tests specifying the required behavior changes BEFORE writing production code.
+
+## Rules
+- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
+- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
+- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
+- Target declaration in yield:
+  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
+  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
+  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
+- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
+- Output: yield structured output per `developer-output.schema.json`.
+
+## Assignment
+{
+  "slug": "routing-architect-consult-v2",
+  "kind": "dev",
+  "title": "Architect consult and hydration",
+  "assignment": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) + buildArchitectHydration concernsYaml extension for wave-report/next-plan. Tests: single consult file, restart writes no duplicate, architect input contains concern id+summary.",
+  "outlineRef": "routing-architect-consult-v2",
+  "milestone": "m3-routing",
+  "wave": 9,
+  "deps": [
+    "modes-prompts-v2",
+    "routing-blocker-derive-v2"
+  ]
+}
+
+## Context & Citations
+[]
+
+## Review Feedback
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+- summary (string, required): Concise summary of implementation actions and test results
+- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+  - Option 1:
+    - selectors (array of string, required)
+    - expectRed (array of string, required, minItems: 1)
+  - Option 2:
+    - gate (string, required)
+  - Option 3:
+    - command (string, required)
+    - customTarget (boolean, required)
+- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
+- notes (string, optional): Optional developer notes, implementation observations, or comments
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/meta.yaml
new file mode 100644
index 0000000..ec19db4
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 1
+name: test-first
+attempt: 1
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 1200
+status: ok
+startedAt: 2026-11-08T12:05:41.885Z
+session: 01a1bb0c-d451-772b-9182-9ddaa040219e
+endedAt: 2026-11-08T12:20:32.051Z
+usage:
+  inputTokens: 217952
+  outputTokens: 72889
+  costUsd: 0.111013
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-05-42-609Z_01a1bb0c-d451-772b-9182-9ddaa040219e.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/output.yaml
new file mode 100644
index 0000000..26aa05a
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/output.yaml
@@ -0,0 +1,61 @@
+status: ok
+summary: Authored test-first coverage for act-phase routing in
+  plugins/software-factory/test/engine/routing-architect-consult.test.ts (2
+  engine-level behavior tests, no production edits). Test 1 seeds routed blocker
+  + routed architect concerns, drives a story through plan/edits/waves, and
+  asserts exactly one decisions/concern-<cid>.yaml is written, one architect
+  consult runs with the concern id+summary in its prompt, and plan/wave-report
+  architect prompts hydrate routed concerns (id+summary). Test 2 runs the task,
+  fails it at wave 2's architect report after the consult artifact is committed,
+  restarts the same iteration, and asserts the decision file is neither
+  duplicated nor rewritten (one consult call total, byte-identical content)
+  while the restart's architect turn still carries the concern hydration. Both
+  tests are red on current production code as pure assertion failures (no
+  import/compile/collection errors).
+target:
+  selectors:
+    - test/engine/routing-architect-consult.test.ts
+  expectRed:
+    - "Routing: architect consult and hydration.writes one concern decision file
+      and hydrates architect turns with routed concerns"
+    - "Routing: architect consult and hydration.restart after a mid-iteration
+      failure neither repeats the consult nor rewrites the decision"
+evidence:
+  - Wrote plugins/software-factory/test/engine/routing-architect-consult.test.ts
+    with two focused engine-level scenarios reusing FakeHarness, tmp git repo,
+    and existing runTask/derive paths.
+  - TMPDIR=/tmp bun test test/engine/routing-architect-consult.test.ts -> 0
+    pass, 2 fail; both failures are expect().toEqual assertion failures
+    (decision file list expected ['concern-c-0123456789.yaml'] but received []),
+    so target-red is behavioral, not collection/import failure.
+  - "Bun JUnit reporter run: both testcases emitted <failure> (not <error>) with
+    ids 'Routing: architect consult and hydration.writes one concern decision
+    file and hydrates architect turns with routed concerns' and 'Routing:
+    architect consult and hydration.restart after a mid-iteration failure
+    neither repeats the consult nor rewrites the decision'."
+  - cd plugins/software-factory && bun run typecheck -> pass (no TS errors from
+    the new test file).
+  - TMPDIR=/tmp bun test (full suite) -> 369 pass, 2 skip, 2 fail; only the two
+    newly authored red tests fail, confirming no collateral regression.
+  - git status --porcelain shows only the new test file is untracked; no
+    existing production or test files were modified.
+concerns:
+  - "Green implementation contract encoded by the tests: the act-phase check
+    runs one orchestration step per routed blocker concern with an affected
+    blocked item, using step id 'consult-concern-<cid>' (FakeHarness label
+    '<task>/runs/consult-concern-<cid>#a1') and writing
+    'decisions/concern-<cid>.yaml'; file existence is the idempotency guard, so
+    restart neither consults nor rewrites."
+  - Hydration assertions require routed concerns (not only open ones) in
+    buildArchitectHydration output used by plan and wave-report turns;
+    hydrateConcernsYaml must stay open-only so the existing plan-review
+    hydration behavior/tests remain intact.
+  - The restart scenario fails wave 2's architect report after the consult
+    artifact is committed but before iteration close-up, proving restart
+    re-enters the act phase rather than short-circuiting on a blocked task
+    state.
+notes: "No interface stubs were needed: all tests compile against existing
+  exports (runTask, FakeHarness, Repo, loadPromptLibrary, readYaml). Selectors
+  use the committed infra testRunner (cd plugins/software-factory && bun test
+  <selector>); expectRed ids are exact JUnit classname.name ids emitted by bun's
+  junit reporter."
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/checks.yaml
new file mode 100644
index 0000000..0171408
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/checks.yaml
@@ -0,0 +1,76 @@
+checks:
+  - id: gates
+    status: pass
+    message: "Gates passed (2 gates, improvements: Engine: HEAD guard resilience
+      (§7).detects when an agent commits and resets --soft to before.sha,
+      keeping changes staged, Engine: HEAD guard resilience (§7).detects when an
+      agent switches branch and restores original branch, keeping changes)"
+    details:
+      - id: typecheck
+        command: cd plugins/software-factory && bun run typecheck
+        status: pass
+        durationMs: 5821
+        details: $ tsc --noEmit
+      - id: test
+        command: cd plugins/software-factory && bun test
+        status: pass
+        durationMs: 118585
+        details: |-
+          bun test v1.4.3 (c6da4a4d3)
+          ================================================================
+          Task: status-test-task [ACTIVE]
+          Kind: unclassified | Iteration: 1 | Wave: 1
+          Worktree: (none - main checkout)
+          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-J2eve1/.factory/pipeline.yaml
+          Budget spent: $0.0000
+          ----------------------------------------------------------------
+          Waves & Items:
+            Wave 1:
+          ================================================================
+
+
+          test/cli/cli.test.ts:
+          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 418986
+          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 418986
+          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 418986
+
+           371 pass
+           2 skip
+           0 fail
+           1725 expect() calls
+          Ran 373 tests across 61 files. [118.39s]
+          [Improvements: Engine: HEAD guard resilience (§7).detects when an agent commits and resets --soft to before.sha, keeping changes staged, Engine: HEAD guard resilience (§7).detects when an agent switches branch and restores original branch, keeping changes]
+        improvements:
+          - "Engine: HEAD guard resilience (§7).detects when an agent commits
+            and resets --soft to before.sha, keeping changes staged"
+          - "Engine: HEAD guard resilience (§7).detects when an agent switches
+            branch and restores original branch, keeping changes"
+  - id: target-green
+    status: pass
+    message: "target-green passed: selected tests passed"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/routing-architect-consult.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794140953772-s0xyy3z28sc.xml
+      junitCaseCount: 2
+      junitCaseIds:
+        - "Routing: architect consult and hydration.writes one concern decision
+          file and hydrates architect turns with routed concerns"
+        - "Routing: architect consult and hydration.restart after a
+          mid-iteration failure neither repeats the consult nor rewrites the
+          decision"
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: size
+    status: pass
+    message: "size passed: 213/300 production lines changed"
+    details:
+      changedLines:
+        added: 212
+        deleted: 1
+        total: 213
+        files:
+          - plugins/software-factory/src/core/flows/consults.ts
+          - plugins/software-factory/src/core/flows/iteration.ts
+      limit: 300
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/input.md
new file mode 100644
index 0000000..9369427
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/input.md
@@ -0,0 +1,60 @@
+# Step: Develop
+
+## Goal
+Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
+
+## Rules
+- Target green: every test selector and case identified in `target` MUST pass cleanly.
+- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
+- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
+- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
+- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
+
+## Assignment
+{
+  "slug": "routing-architect-consult-v2",
+  "kind": "dev",
+  "title": "Architect consult and hydration",
+  "assignment": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) + buildArchitectHydration concernsYaml extension for wave-report/next-plan. Tests: single consult file, restart writes no duplicate, architect input contains concern id+summary.",
+  "outlineRef": "routing-architect-consult-v2",
+  "milestone": "m3-routing",
+  "wave": 9,
+  "deps": [
+    "modes-prompts-v2",
+    "routing-blocker-derive-v2"
+  ]
+}
+
+## Target
+{
+  "selectors": [
+    "test/engine/routing-architect-consult.test.ts"
+  ],
+  "expectRed": [
+    "Routing: architect consult and hydration.writes one concern decision file and hydrates architect turns with routed concerns",
+    "Routing: architect consult and hydration.restart after a mid-iteration failure neither repeats the consult nor rewrites the decision"
+  ]
+}
+
+## Context & Citations
+[]
+
+## Review Feedback
+
+## Output
+
+Yield a structured JSON object matching this schema:
+- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+- summary (string, required): Concise summary of implementation actions and test results
+- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+  - Option 1:
+    - selectors (array of string, required)
+    - expectRed (array of string, required, minItems: 1)
+  - Option 2:
+    - gate (string, required)
+  - Option 3:
+    - command (string, required)
+    - customTarget (boolean, required)
+- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
+- notes (string, optional): Optional developer notes, implementation observations, or comments
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/meta.yaml
new file mode 100644
index 0000000..16cd70b
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/meta.yaml
@@ -0,0 +1,19 @@
+seq: 2
+name: develop
+attempt: 1
+fixRound: 1
+agent: developer
+role: workhorse
+models:
+  - opencode-go/deepseek-v4.1-flash
+  - opencode-go/muse-spark-1.3-contributor
+timeoutSec: 1200
+status: ok
+startedAt: 2026-11-08T12:20:34.899Z
+session: 01a1bb1a-73f1-70c0-9f65-49a895f3ed28
+endedAt: 2026-11-08T12:29:19.636Z
+usage:
+  inputTokens: 99783
+  outputTokens: 30332
+  costUsd: 0.044306
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-20-35-441Z_01a1bb1a-73f1-70c0-9f65-49a895f3ed28.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/output.yaml
new file mode 100644
index 0000000..2ec17bf
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/output.yaml
@@ -0,0 +1,47 @@
+status: ok
+summary: "Implemented act-phase routed-concern routing. Added runConcernConsult
+  to flows/consults.ts: it runs a `consult-concern-<cid>` architect turn
+  (non-item consult fragment, prompt carries concern id/summary) and writes
+  decisions/concern-<cid>.yaml, guarded by the artifact's existence so restarts
+  neither repeat the turn nor rewrite the decision. Added consultRoutedBlockers
+  in flows/iteration.ts and invoke it per wave before work starts and after each
+  act tick, consulting once per routed blocker concern whose affects name a
+  blocked wave item. Extended buildArchitectHydration with an actionable
+  (open+routed) concerns digest rendered by the terse, byte-capped
+  renderConcernsYaml, so architect-plan/next-plan and architect-wave-report
+  prompts receive concern ids and summaries while plan-reviewer hydration stays
+  open-only. Target tests, related routing/concern suites, typecheck, and the
+  full suite are green."
+target:
+  selectors:
+    - test/engine/routing-architect-consult.test.ts
+  expectRed:
+    - "Routing: architect consult and hydration.writes one concern decision file
+      and hydrates architect turns with routed concerns"
+    - "Routing: architect consult and hydration.restart after a mid-iteration
+      failure neither repeats the consult nor rewrites the decision"
+evidence:
+  - "`bun test test/engine/routing-architect-consult.test.ts` -> 2 pass, 0 fail,
+    26 expect() calls (both target cases green)."
+  - "`bun run typecheck` -> exit 0 (tsc --noEmit clean)."
+  - "`bun test` (full suite) -> 371 pass, 2 skip, 0 fail across 61 files, 1725
+    expect() calls."
+  - "`bun test test/engine/routing-blocker-derive.test.ts
+    test/engine/routing-human-debt.test.ts test/engine/concerns-funnel.test.ts`
+    -> 38 pass, 0 fail."
+  - "`bun test test/engine/plan-reviewer-triage.test.ts
+    test/human-involvement-config.test.ts
+    test/engine/consult-decision-application.test.ts
+    test/engine/blocked-closeup-iteration.test.ts
+    test/engine/funnel-text-budget.test.ts` -> 30 pass, 0 fail."
+  - "`git status --short` -> only src/core/flows/consults.ts and
+    src/core/flows/iteration.ts modified (no stray artifacts)."
+concerns:
+  - Consult idempotency relies on the canonical decisions/concern-<cid>.yaml
+    artifact; a crash after writing the artifact but before its commit could
+    re-consult on restart if worktree repair discards the uncommitted file (same
+    ordering applies to all engine artifacts).
+notes: Consult reuses steps/architect-consult-nonitem so the existing
+  decisions.schema.json resolution (`consult-` prefix) and prompt-var preflight
+  stay unchanged; the decision artifact maps only schema-known fields to remain
+  contract-valid.
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/checks.yaml
new file mode 100644
index 0000000..b8cd1ba
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/checks.yaml
@@ -0,0 +1,25 @@
+checks:
+  - id: red-test
+    status: pass
+    message: "red-test passed: all 2 tests fail when prod changes are restored to
+      test-first commit"
+    details:
+      command: cd plugins/software-factory && bun test
+        test/engine/routing-architect-consult.test.ts --reporter=junit
+        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794141077526-9l69upk9jf.xml
+      junitCaseCount: 2
+      junitCaseIds:
+        - "Routing: architect consult and hydration.writes one concern decision
+          file and hydrates architect turns with routed concerns"
+        - "Routing: architect consult and hydration.restart after a
+          mid-iteration failure neither repeats the consult nor rewrites the
+          decision"
+      junitTruncated: false
+      collected: true
+      collectionErrors: []
+  - id: test-diff
+    status: pass
+    message: test-diff generated (0 test files, 0 bytes)
+    details:
+      diff: ""
+      files: []
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/input.md
new file mode 100644
index 0000000..f0bceda
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/input.md
@@ -0,0 +1,1195 @@
+# Step: QA
+
+## Goal
+Perform independent quality assurance on the item's implementation and test suite. Guard against test weakening, false passes, and unverified claims.
+
+## Rules
+- SKEPTICAL VERIFICATION: do NOT trust developer summaries. Scrutinize engine check results (`red-test`, `test-diff`), actual diffs, and tool outputs.
+- Test weakening defense: scrutinize `testDiff`. Reject any test change that deletes assertions, relaxes matchers, replaces concrete checks with tautologies, or reduces test coverage.
+- Story kind validation:
+  - `dev` stories: verify `red-test` proved tests failed on baseline code and pass after implementation.
+  - `no-behavior` stories: confirm tests remain materially identical. Functional behavior must not change.
+- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
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
+  "slug": "routing-architect-consult-v2",
+  "kind": "dev",
+  "title": "Architect consult and hydration",
+  "assignment": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) + buildArchitectHydration concernsYaml extension for wave-report/next-plan. Tests: single consult file, restart writes no duplicate, architect input contains concern id+summary.",
+  "outlineRef": "routing-architect-consult-v2",
+  "milestone": "m3-routing",
+  "wave": 9,
+  "deps": [
+    "modes-prompts-v2",
+    "routing-blocker-derive-v2"
+  ]
+}
+
+## Engine Checks
+
+
+## Test Diff
+
+
+## Code Diff
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..ff0a121
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,26 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/engine/routing-architect-consult.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 2 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/routing-architect-consult.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794140428146-pkayk3bvwzb.xml
++      junitCaseCount: 2
++      junitCaseIds:
++        - "Routing: architect consult and hydration.writes one concern decision
++          file and hydrates architect turns with routed concerns"
++        - "Routing: architect consult and hydration.restart after a
++          mid-iteration failure neither repeats the consult nor rewrites the
++          decision"
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..10a3003
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,53 @@
++# Step: Test-First
++
++## Goal
++Author automated tests specifying the required behavior changes BEFORE writing production code.
++
++## Rules
++- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
++- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
++- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
++- Target declaration in yield:
++  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
++  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
++  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
++- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
++- Output: yield structured output per `developer-output.schema.json`.
++
++## Assignment
++{
++  "slug": "routing-architect-consult-v2",
++  "kind": "dev",
++  "title": "Architect consult and hydration",
++  "assignment": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) + buildArchitectHydration concernsYaml extension for wave-report/next-plan. Tests: single consult file, restart writes no duplicate, architect input contains concern id+summary.",
++  "outlineRef": "routing-architect-consult-v2",
++  "milestone": "m3-routing",
++  "wave": 9,
++  "deps": [
++    "modes-prompts-v2",
++    "routing-blocker-derive-v2"
++  ]
++}
++
++## Context & Citations
++[]
++
++## Review Feedback
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
++- summary (string, required): Concise summary of implementation actions and test results
++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
++  - Option 1:
++    - selectors (array of string, required)
++    - expectRed (array of string, required, minItems: 1)
++  - Option 2:
++    - gate (string, required)
++  - Option 3:
++    - command (string, required)
++    - customTarget (boolean, required)
++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
++- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
++- notes (string, optional): Optional developer notes, implementation observations, or comments
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..ec19db4
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 1
++name: test-first
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 1200
++status: ok
++startedAt: 2026-11-08T12:05:41.885Z
++session: 01a1bb0c-d451-772b-9182-9ddaa040219e
++endedAt: 2026-11-08T12:20:32.051Z
++usage:
++  inputTokens: 217952
++  outputTokens: 72889
++  costUsd: 0.111013
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-05-42-609Z_01a1bb0c-d451-772b-9182-9ddaa040219e.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..26aa05a
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,61 @@
++status: ok
++summary: Authored test-first coverage for act-phase routing in
++  plugins/software-factory/test/engine/routing-architect-consult.test.ts (2
++  engine-level behavior tests, no production edits). Test 1 seeds routed blocker
++  + routed architect concerns, drives a story through plan/edits/waves, and
++  asserts exactly one decisions/concern-<cid>.yaml is written, one architect
++  consult runs with the concern id+summary in its prompt, and plan/wave-report
++  architect prompts hydrate routed concerns (id+summary). Test 2 runs the task,
++  fails it at wave 2's architect report after the consult artifact is committed,
++  restarts the same iteration, and asserts the decision file is neither
++  duplicated nor rewritten (one consult call total, byte-identical content)
++  while the restart's architect turn still carries the concern hydration. Both
++  tests are red on current production code as pure assertion failures (no
++  import/compile/collection errors).
++target:
++  selectors:
++    - test/engine/routing-architect-consult.test.ts
++  expectRed:
++    - "Routing: architect consult and hydration.writes one concern decision file
++      and hydrates architect turns with routed concerns"
++    - "Routing: architect consult and hydration.restart after a mid-iteration
++      failure neither repeats the consult nor rewrites the decision"
++evidence:
++  - Wrote plugins/software-factory/test/engine/routing-architect-consult.test.ts
++    with two focused engine-level scenarios reusing FakeHarness, tmp git repo,
++    and existing runTask/derive paths.
++  - TMPDIR=/tmp bun test test/engine/routing-architect-consult.test.ts -> 0
++    pass, 2 fail; both failures are expect().toEqual assertion failures
++    (decision file list expected ['concern-c-0123456789.yaml'] but received []),
++    so target-red is behavioral, not collection/import failure.
++  - "Bun JUnit reporter run: both testcases emitted <failure> (not <error>) with
++    ids 'Routing: architect consult and hydration.writes one concern decision
++    file and hydrates architect turns with routed concerns' and 'Routing:
++    architect consult and hydration.restart after a mid-iteration failure
++    neither repeats the consult nor rewrites the decision'."
++  - cd plugins/software-factory && bun run typecheck -> pass (no TS errors from
++    the new test file).
++  - TMPDIR=/tmp bun test (full suite) -> 369 pass, 2 skip, 2 fail; only the two
++    newly authored red tests fail, confirming no collateral regression.
++  - git status --porcelain shows only the new test file is untracked; no
++    existing production or test files were modified.
++concerns:
++  - "Green implementation contract encoded by the tests: the act-phase check
++    runs one orchestration step per routed blocker concern with an affected
++    blocked item, using step id 'consult-concern-<cid>' (FakeHarness label
++    '<task>/runs/consult-concern-<cid>#a1') and writing
++    'decisions/concern-<cid>.yaml'; file existence is the idempotency guard, so
++    restart neither consults nor rewrites."
++  - Hydration assertions require routed concerns (not only open ones) in
++    buildArchitectHydration output used by plan and wave-report turns;
++    hydrateConcernsYaml must stay open-only so the existing plan-review
++    hydration behavior/tests remain intact.
++  - The restart scenario fails wave 2's architect report after the consult
++    artifact is committed but before iteration close-up, proving restart
++    re-enters the act phase rather than short-circuiting on a blocked task
++    state.
++notes: "No interface stubs were needed: all tests compile against existing
++  exports (runTask, FakeHarness, Repo, loadPromptLibrary, readYaml). Selectors
++  use the committed infra testRunner (cd plugins/software-factory && bun test
++  <selector>); expectRed ids are exact JUnit classname.name ids emitted by bun's
++  junit reporter."
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..0171408
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,76 @@
++checks:
++  - id: gates
++    status: pass
++    message: "Gates passed (2 gates, improvements: Engine: HEAD guard resilience
++      (§7).detects when an agent commits and resets --soft to before.sha,
++      keeping changes staged, Engine: HEAD guard resilience (§7).detects when an
++      agent switches branch and restores original branch, keeping changes)"
++    details:
++      - id: typecheck
++        command: cd plugins/software-factory && bun run typecheck
++        status: pass
++        durationMs: 5821
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 118585
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-J2eve1/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 418986
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 418986
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 418986
++
++           371 pass
++           2 skip
++           0 fail
++           1725 expect() calls
++          Ran 373 tests across 61 files. [118.39s]
++          [Improvements: Engine: HEAD guard resilience (§7).detects when an agent commits and resets --soft to before.sha, keeping changes staged, Engine: HEAD guard resilience (§7).detects when an agent switches branch and restores original branch, keeping changes]
++        improvements:
++          - "Engine: HEAD guard resilience (§7).detects when an agent commits
++            and resets --soft to before.sha, keeping changes staged"
++          - "Engine: HEAD guard resilience (§7).detects when an agent switches
++            branch and restores original branch, keeping changes"
++  - id: target-green
++    status: pass
++    message: "target-green passed: selected tests passed"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/routing-architect-consult.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794140953772-s0xyy3z28sc.xml
++      junitCaseCount: 2
++      junitCaseIds:
++        - "Routing: architect consult and hydration.writes one concern decision
++          file and hydrates architect turns with routed concerns"
++        - "Routing: architect consult and hydration.restart after a
++          mid-iteration failure neither repeats the consult nor rewrites the
++          decision"
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 213/300 production lines changed"
++    details:
++      changedLines:
++        added: 212
++        deleted: 1
++        total: 213
++        files:
++          - plugins/software-factory/src/core/flows/consults.ts
++          - plugins/software-factory/src/core/flows/iteration.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..9369427
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,60 @@
++# Step: Develop
++
++## Goal
++Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
++
++## Rules
++- Target green: every test selector and case identified in `target` MUST pass cleanly.
++- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
++- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
++- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
++- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
++
++## Assignment
++{
++  "slug": "routing-architect-consult-v2",
++  "kind": "dev",
++  "title": "Architect consult and hydration",
++  "assignment": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) + buildArchitectHydration concernsYaml extension for wave-report/next-plan. Tests: single consult file, restart writes no duplicate, architect input contains concern id+summary.",
++  "outlineRef": "routing-architect-consult-v2",
++  "milestone": "m3-routing",
++  "wave": 9,
++  "deps": [
++    "modes-prompts-v2",
++    "routing-blocker-derive-v2"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/routing-architect-consult.test.ts"
++  ],
++  "expectRed": [
++    "Routing: architect consult and hydration.writes one concern decision file and hydrates architect turns with routed concerns",
++    "Routing: architect consult and hydration.restart after a mid-iteration failure neither repeats the consult nor rewrites the decision"
++  ]
++}
++
++## Context & Citations
++[]
++
++## Review Feedback
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
++- summary (string, required): Concise summary of implementation actions and test results
++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
++  - Option 1:
++    - selectors (array of string, required)
++    - expectRed (array of string, required, minItems: 1)
++  - Option 2:
++    - gate (string, required)
++  - Option 3:
++    - command (string, required)
++    - customTarget (boolean, required)
++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
++- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
++- notes (string, optional): Optional developer notes, implementation observations, or comments
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..16cd70b
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 2
++name: develop
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 1200
++status: ok
++startedAt: 2026-11-08T12:20:34.899Z
++session: 01a1bb1a-73f1-70c0-9f65-49a895f3ed28
++endedAt: 2026-11-08T12:29:19.636Z
++usage:
++  inputTokens: 99783
++  outputTokens: 30332
++  costUsd: 0.044306
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-20-35-441Z_01a1bb1a-73f1-70c0-9f65-49a895f3ed28.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..2ec17bf
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,47 @@
++status: ok
++summary: "Implemented act-phase routed-concern routing. Added runConcernConsult
++  to flows/consults.ts: it runs a `consult-concern-<cid>` architect turn
++  (non-item consult fragment, prompt carries concern id/summary) and writes
++  decisions/concern-<cid>.yaml, guarded by the artifact's existence so restarts
++  neither repeat the turn nor rewrite the decision. Added consultRoutedBlockers
++  in flows/iteration.ts and invoke it per wave before work starts and after each
++  act tick, consulting once per routed blocker concern whose affects name a
++  blocked wave item. Extended buildArchitectHydration with an actionable
++  (open+routed) concerns digest rendered by the terse, byte-capped
++  renderConcernsYaml, so architect-plan/next-plan and architect-wave-report
++  prompts receive concern ids and summaries while plan-reviewer hydration stays
++  open-only. Target tests, related routing/concern suites, typecheck, and the
++  full suite are green."
++target:
++  selectors:
++    - test/engine/routing-architect-consult.test.ts
++  expectRed:
++    - "Routing: architect consult and hydration.writes one concern decision file
++      and hydrates architect turns with routed concerns"
++    - "Routing: architect consult and hydration.restart after a mid-iteration
++      failure neither repeats the consult nor rewrites the decision"
++evidence:
++  - "`bun test test/engine/routing-architect-consult.test.ts` -> 2 pass, 0 fail,
++    26 expect() calls (both target cases green)."
++  - "`bun run typecheck` -> exit 0 (tsc --noEmit clean)."
++  - "`bun test` (full suite) -> 371 pass, 2 skip, 0 fail across 61 files, 1725
++    expect() calls."
++  - "`bun test test/engine/routing-blocker-derive.test.ts
++    test/engine/routing-human-debt.test.ts test/engine/concerns-funnel.test.ts`
++    -> 38 pass, 0 fail."
++  - "`bun test test/engine/plan-reviewer-triage.test.ts
++    test/human-involvement-config.test.ts
++    test/engine/consult-decision-application.test.ts
++    test/engine/blocked-closeup-iteration.test.ts
++    test/engine/funnel-text-budget.test.ts` -> 30 pass, 0 fail."
++  - "`git status --short` -> only src/core/flows/consults.ts and
++    src/core/flows/iteration.ts modified (no stray artifacts)."
++concerns:
++  - Consult idempotency relies on the canonical decisions/concern-<cid>.yaml
++    artifact; a crash after writing the artifact but before its commit could
++    re-consult on restart if worktree repair discards the uncommitted file (same
++    ordering applies to all engine artifacts).
++notes: Consult reuses steps/architect-consult-nonitem so the existing
++  decisions.schema.json resolution (`consult-` prefix) and prompt-var preflight
++  stay unchanged; the decision artifact maps only schema-known fields to remain
++  contract-valid.
+diff --git a/plugins/software-factory/src/core/flows/consults.ts b/plugins/software-factory/src/core/flows/consults.ts
+index 9499683..92fdb03 100644
+--- a/plugins/software-factory/src/core/flows/consults.ts
++++ b/plugins/software-factory/src/core/flows/consults.ts
+@@ -6,6 +6,7 @@ import type {
+   PipelineConfig,
+   ProjectConfig,
+   SteerItemArtifact,
++  StoredConcernArtifact,
+ } from "../artifacts.js";
+ import type { Harness } from "../../harness/types.js";
+ import { writeYamlAtomic } from "../records/io.js";
+@@ -289,3 +290,121 @@ export async function runNonItemConsult(
+ 
+   return { decision: decisionArtifact, sessionId: stepRes.sessionId };
+ }
++
++export interface ConcernConsultParams {
++  task: string;
++  concern: StoredConcernArtifact;
++  taskDir: string;
++  taskWt: string;
++  repo: any;
++  harness: Harness;
++  pipeline: PipelineConfig;
++  project: ProjectConfig;
++  prompts: any;
++  architectSessionId?: string;
++  turnsSemaphore?: Semaphore;
++  budgetTracker?: BudgetTracker;
++  iteration?: number;
++}
++
++/**
++ * Runs one architect consult for a routed blocker concern (§18,
++ * adr-routing-derived-state). `decisions/concern-<cid>.yaml` is the canonical
++ * artifact; its existence is the idempotency guard, so a restarted act phase
++ * neither repeats the turn nor rewrites the decision.
++ */
++export async function runConcernConsult(
++  params: ConcernConsultParams
++): Promise<{ decision?: DecisionArtifact; sessionId?: string }> {
++  const {
++    task,
++    concern,
++    taskDir,
++    taskWt,
++    repo,
++    harness,
++    pipeline,
++    project,
++    prompts,
++    architectSessionId,
++    turnsSemaphore,
++    budgetTracker,
++    iteration,
++  } = params;
++
++  const decisionPath = path.join(taskDir, "decisions", `concern-${concern.id}.yaml`);
++  if (fs.existsSync(decisionPath)) {
++    return { sessionId: architectSessionId };
++  }
++
++  const runsDir = path.join(taskDir, "runs");
++  await fs.promises.mkdir(path.dirname(decisionPath), { recursive: true });
++  const affects = (concern.affects ?? []).join(", ");
++  const promptVars: Record<string, string> = {
++    task,
++    context: [
++      `Routed blocker concern ${concern.id}`,
++      `Summary: ${concern.summary}`,
++      `Severity: ${concern.severity}${affects ? `; blocks: ${affects}` : ""}`,
++    ].join("\n"),
++    feedback: concern.detail ?? concern.summary,
++    debt: "",
++  };
++
++  let decisionArtifact: DecisionArtifact | undefined;
++  const stepRes = await runAgentStep({
++    task,
++    stepId: `consult-concern-${concern.id}`,
++    stepFragment: "steps/architect-consult-nonitem",
++    agent: "architect",
++    role: "architect",
++    sessionMode: "reuse",
++    existingSessionId: architectSessionId,
++    cwd: taskWt,
++    taskDir,
++    recordsDir: runsDir,
++    repo,
++    harness,
++    pipeline,
++    project,
++    prompts,
++    promptVars,
++    turnsSemaphore,
++    budgetTracker,
++    iteration,
++    writeArtifact: async (output: unknown) => {
++      if (fs.existsSync(decisionPath)) return;
++      const raw = output as any;
++      decisionArtifact = {
++        id: String(raw?.id ?? `decision-concern-${concern.id}`),
++        context: (raw?.context ?? "wave") as DecisionContext,
++        decision: String(raw?.decision ?? "continue"),
++        timestamp: String(raw?.timestamp ?? new Date().toISOString()),
++        rationale: raw?.rationale,
++        text: raw?.text,
++        persist: raw?.persist,
++        outlines: raw?.outlines,
++        outline: raw?.outline,
++        debt: raw?.debt,
++        reason: raw?.reason,
++        question: raw?.question,
++        planDelta: raw?.planDelta,
++      };
++      await writeYamlAtomic(decisionPath, decisionArtifact);
++    },
++  });
++
++  if (!stepRes.ok || !decisionArtifact) {
++    throw new Error(`Concern consult for ${concern.id} failed: ${stepRes.meta.error || "no output"}`);
++  }
++
++  await appendJournal(taskDir, {
++    type: "decision_made",
++    context: "concern",
++    concern: concern.id,
++    decision: decisionArtifact.decision,
++    decisionPath,
++  });
++
++  return { decision: decisionArtifact, sessionId: stepRes.sessionId };
++}
+diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
+index abc124d..a58cfd2 100644
+--- a/plugins/software-factory/src/core/flows/iteration.ts
++++ b/plugins/software-factory/src/core/flows/iteration.ts
+@@ -19,7 +19,7 @@ import { ensureChildWorktree, commitAll, removeWorktree } from "../git/index.js"
+ import { writeYamlAtomic, writeTextAtomic, readYaml, readText } from "../records/io.js";
+ import { runAgentStep } from "./step-runner.js";
+ import { writeQuestion } from "../steer.js";
+-import { runItemConsult } from "./consults.js";
++import { runItemConsult, runConcernConsult } from "./consults.js";
+ import { mergeItem } from "./merge-path.js";
+ import { tickItemMachine } from "./item-machine.js";
+ import { deriveItemState } from "../derive/item.js";
+@@ -31,8 +31,10 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+ import {
+   hydrateConcernsYaml,
+   listConcernIds,
++  listConcerns,
+   partitionSuggestions,
+ } from "../concerns.js";
++import { renderConcernsYaml } from "../triage.js";
+ import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
+ import { validateEdits } from "../plan/limits.js";
+ import { applyEdits } from "../plan/apply.js";
+@@ -166,6 +168,17 @@ async function buildArchitectHydration(
+     }
+   }
+ 
++  // 5. Concerns (adr-routing-derived-state): routed and open concerns give
++  // every architect turn the terse decision context the act phase acts on.
++  const actionableConcerns = (await listConcerns(taskDir)).filter(
++    (c) => c.status === "open" || c.status === "routed"
++  );
++  if (actionableConcerns.length > 0) {
++    parts.push(
++      `--- Concerns ---\n${renderConcernsYaml(actionableConcerns, maxBytes)}`
++    );
++  }
++
+   const combined = parts.join("\n\n");
+   if (combined.length <= maxBytes) {
+     return combined;
+@@ -173,6 +186,58 @@ async function buildArchitectHydration(
+   return combined.slice(combined.length - maxBytes);
+ }
+ 
++/**
++ * Act-phase routing (§18, adr-routing-derived-state): consult the architect
++ * once per routed blocker concern that blocks a pending item in this wave.
++ * The per-concern decision artifact is the guard, so repeated or restarted
++ * act passes neither repeat the turn nor rewrite the decision.
++ */
++interface RoutedConsultContext {
++  task: string;
++  taskDir: string;
++  taskWt: string;
++  repo: any;
++  harness: Harness;
++  pipeline: PipelineConfig;
++  project: ProjectConfig;
++  prompts: any;
++  architectSessionId?: string;
++  turnsSemaphore?: Semaphore;
++  budgetTracker?: BudgetTracker;
++  iteration: number;
++}
++
++async function consultRoutedBlockers(
++  ctx: RoutedConsultContext,
++  blockedSlugs: Iterable<string>
++): Promise<string | undefined> {
++  const blocked = new Set(blockedSlugs);
++  if (blocked.size === 0) return ctx.architectSessionId;
++
++  let sessionId = ctx.architectSessionId;
++  for (const concern of await listConcerns(ctx.taskDir)) {
++    if (concern.kind !== "blocker" || concern.status !== "routed") continue;
++    if (!(concern.affects ?? []).some((slug) => blocked.has(slug))) continue;
++    const res = await runConcernConsult({
++      task: ctx.task,
++      concern,
++      taskDir: ctx.taskDir,
++      taskWt: ctx.taskWt,
++      repo: ctx.repo,
++      harness: ctx.harness,
++      pipeline: ctx.pipeline,
++      project: ctx.project,
++      prompts: ctx.prompts,
++      architectSessionId: sessionId,
++      turnsSemaphore: ctx.turnsSemaphore,
++      budgetTracker: ctx.budgetTracker,
++      iteration: ctx.iteration,
++    });
++    sessionId = res.sessionId ?? sessionId;
++  }
++  return sessionId;
++}
++
+ /**
+  * Runs a full architect iteration (§8.4).
+  */
+@@ -739,6 +804,28 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+       continue;
+     }
+ 
++    // Act-phase routing (§18): each routed blocker concern blocking a pending
++    // item in this wave gets one architect consult before work starts.
++    const consultCtx: RoutedConsultContext = {
++      task,
++      taskDir,
++      taskWt,
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts,
++      architectSessionId,
++      turnsSemaphore,
++      budgetTracker,
++      iteration,
++    };
++    architectSessionId = await consultRoutedBlockers(
++      consultCtx,
++      waveState.blocked.map((it) => it.slug)
++    );
++    consultCtx.architectSessionId = architectSessionId;
++
+     await appendJournal(taskDir, { type: "wave_started", wave: w, iteration });
+ 
+     // Run wave items until wave can merge or complete
+@@ -811,6 +898,11 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+         items: itemStates,
+         blockedBy: await collectRoutedBlockers(taskDir),
+       });
++      architectSessionId = await consultRoutedBlockers(
++        consultCtx,
++        waveState.blocked.map((it) => it.slug)
++      );
++      consultCtx.architectSessionId = architectSessionId;
+       await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
+     }
+ 
+diff --git a/plugins/software-factory/test/engine/routing-architect-consult.test.ts b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+new file mode 100644
+index 0000000..3eb7799
+--- /dev/null
++++ b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+@@ -0,0 +1,435 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import path from "node:path";
++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
++import { runTask } from "../../src/core/engine.js";
++import { Repo } from "../../src/core/git/repo.js";
++import { loadPromptLibrary } from "../../src/core/prompts.js";
++import { readYaml } from "../../src/core/records/io.js";
++import type {
++  PipelineConfig,
++  ProjectConfig,
++  StoredConcernArtifact,
++} from "../../src/core/artifacts.js";
++
++/**
++ * Act-phase routing (docs/factory.v2.md §18; adr-routing-derived-state).
++ *
++ * Derive owns the blocking effect of a `routed` blocker concern. The act phase
++ * owns the architect turn: when a wave act observes an item blocked by such a
++ * concern, it consults the architect once per concern and writes
++ * `decisions/concern-<cid>.yaml`. Existence of that canonical artifact is the
++ * guard, so a restart after a mid-iteration failure neither consults nor
++ * rewrites. Architect hydration (plan and wave report inputs) carries routed
++ * concerns as a terse `{id, summary, ...}` digest.
++ *
++ * Test-first contract for the new consult step: it runs an orchestration step
++ * named `consult-concern-<cid>` (harness label `<task>/runs/consult-concern-<cid>#a1`)
++ * and its rendered prompt names the concern id and summary.
++ */
++
++const ORCH = ".factory";
++const BLOCKER_CID = "c-0123456789";
++const ARCHITECT_CID = "c-9876543210";
++const BLOCKER_SUMMARY = "Database schema migration is pending";
++const ARCHITECT_SUMMARY = "Cache TTL assumption is unverified";
++
++type ConcernOverrides = Partial<StoredConcernArtifact> & { id: string };
++
++function storedConcern(overrides: ConcernOverrides): StoredConcernArtifact {
++  return {
++    kind: "blocker",
++    summary: `Concern ${overrides.id}`,
++    detail: "detail",
++    severity: "medium",
++    status: "routed",
++    disposition: "architect",
++    source: { record: "seed-concern", agent: "test" },
++    createdAt: "2026-01-01T00:00:00.000Z",
++    updatedAt: "2026-01-01T00:00:00.000Z",
++    ...overrides,
++  };
++}
++
++function writeConcern(taskDir: string, concern: StoredConcernArtifact): void {
++  const dir = path.join(taskDir, "concerns");
++  fs.mkdirSync(dir, { recursive: true });
++  fs.writeFileSync(path.join(dir, `${concern.id}.yaml`), JSON.stringify(concern, null, 2), "utf8");
++}
++
++function makePipeline(): PipelineConfig {
++  return {
++    models: {
++      roles: {
++        workhorse: { model: "deepseek-chat" },
++        "alt-workhorse": { model: "deepseek-chat" },
++        architect: { model: "deepseek-reasoner" },
++        "alt-architect": { model: "deepseek-reasoner" },
++        "task-reviewer": { model: "deepseek-chat" },
++        "wave-close-up": { model: "deepseek-chat" },
++        "plan-close-up": { model: "deepseek-chat" },
++        simpler: { model: "deepseek-chat" },
++      },
++    },
++    agents: {
++      triage: { role: "workhorse" },
++      infra: { role: "workhorse" },
++      architect: { role: "architect" },
++      "plan-reviewer": { role: "alt-architect" },
++      pm: { role: "alt-workhorse" },
++      developer: { role: "workhorse" },
++      reviewer: { role: "task-reviewer" },
++      "wave-close-up": { role: "wave-close-up" },
++      "plan-close-up": { role: "plan-close-up" },
++    },
++    flows: {
++      simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
++      story: {
++        dev: {
++          fixLoopTo: "develop",
++          steps: [{ id: "develop", agent: "developer", role: "workhorse" }],
++        },
++      },
++      spike: {},
++    },
++    limits: {
++      maxParallelItems: 2,
++      maxParallelTurns: 4,
++      maxStepAttempts: 2,
++      maxFixRounds: 2,
++      maxPlanReviewRounds: 1,
++      maxIterations: 3,
++    },
++  };
++}
++
++function decisionFiles(taskDir: string): string[] {
++  const dir = path.join(taskDir, "decisions");
++  if (!fs.existsSync(dir)) return [];
++  return fs.readdirSync(dir).filter((name) => name.endsWith(".yaml")).sort();
++}
++
++function consultPrompts(harness: FakeHarness): string[] {
++  return harness.calls
++    .filter(
++      (call): call is Extract<typeof call, { type: "run" }> =>
++        call.type === "run" && call.run.label.includes("consult-concern-")
++    )
++    .map((call) => call.run.prompt);
++}
++
++describe("Routing: architect consult and hydration", () => {
++  let tmpRepo: TmpRepo;
++  let worktreeRoot: string;
++  let repoObj: Repo;
++  let pipeline: PipelineConfig;
++  let project: ProjectConfig;
++  let prompts: ReturnType<typeof loadPromptLibrary>;
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++    worktreeRoot = path.join(tmpRepo.dir + "-wt");
++    fs.mkdirSync(worktreeRoot, { recursive: true });
++    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
++    pipeline = makePipeline();
++    project = { orchestrationFolder: ORCH, worktreeRoot };
++    prompts = loadPromptLibrary({
++      builtinDir: path.resolve(import.meta.dir, "../../agents"),
++      overrideDirs: [],
++    });
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  /**
++   * Seeds a task whose wave 1 has one routable item and one routed-blocker
++   * seed, and whose wave 2 holds the declared dependent of that seed.
++   */
++  function seedTask(task: string): string {
++    const taskDir = path.join(tmpRepo.dir, ORCH, task);
++    fs.mkdirSync(taskDir, { recursive: true });
++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `Routing consult for ${task}\n`, "utf8");
++    writeConcern(
++      taskDir,
++      storedConcern({
++        id: BLOCKER_CID,
++        kind: "blocker",
++        summary: BLOCKER_SUMMARY,
++        affects: ["seed"],
++      })
++    );
++    writeConcern(
++      taskDir,
++      storedConcern({
++        id: ARCHITECT_CID,
++        kind: "risk",
++        summary: ARCHITECT_SUMMARY,
++        affects: [],
++      })
++    );
++    tmpRepo.commit(`seed routed concerns for ${task}`);
++    return taskDir;
++  }
++
++  function scriptIngestAndPlan(
++    harness: FakeHarness,
++    task: string,
++    captured: { planPrompt?: string }
++  ): void {
++    harness.scriptOutcome(`${task}/runs/triage#a1`, {
++      ok: true,
++      data: { kind: "story", rationale: "Routed concerns need an architect turn", citations: [] },
++    });
++    harness.scriptOutcome(`${task}/runs/infra#a1`, {
++      ok: true,
++      data: {
++        setup: [],
++        gates: [{ id: "test", command: "true" }],
++        testRunner: { command: "true", selectorArgs: [], junitArg: "" },
++      },
++    });
++    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, (run) => {
++      captured.planPrompt = run.prompt;
++      return {
++        ok: true,
++        data: {
++          iteration: 1,
++          milestones: [{ id: "m1", title: "M1" }],
++          itemOutlines: [
++            { slug: "keep", kind: "dev", title: "Keep", milestoneId: "m1" },
++            { slug: "seed", kind: "dev", title: "Seed", milestoneId: "m1" },
++            {
++              slug: "dependent",
++              kind: "dev",
++              title: "Dependent",
++              milestoneId: "m1",
++              deps: ["seed"],
++            },
++          ],
++        },
++      };
++    });
++    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
++      ok: true,
++      data: { status: "approved", summary: "Plan approved", suggestions: [] },
++    });
++    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
++      ok: true,
++      data: {
++        iteration: 1,
++        items: [
++          {
++            slug: "keep",
++            outlineRef: "keep",
++            kind: "dev",
++            title: "Keep",
++            assignment: "Keep the wave progressing",
++            milestone: "m1",
++            wave: 1,
++          },
++          {
++            slug: "seed",
++            outlineRef: "seed",
++            kind: "dev",
++            title: "Seed",
++            assignment: "Work named by the routed blocker",
++            milestone: "m1",
++            wave: 1,
++          },
++          {
++            slug: "dependent",
++            outlineRef: "dependent",
++            kind: "dev",
++            title: "Dependent",
++            assignment: "Declared dependent of the blocked seed",
++            milestone: "m1",
++            wave: 2,
++            deps: ["seed"],
++          },
++        ],
++      },
++    });
++  }
++
++  function scriptConcernConsult(
++    harness: FakeHarness,
++    task: string,
++    promptsSeen: string[]
++  ): void {
++    harness.scriptOutcome(`${task}/runs/consult-concern-${BLOCKER_CID}#a1`, (run) => {
++      promptsSeen.push(run.prompt);
++      return {
++        ok: true,
++        data: {
++          id: `decision-concern-${BLOCKER_CID}`,
++          context: "wave",
++          decision: "continue",
++          rationale: "Mitigate the migration before dependents run",
++          timestamp: "2026-01-01T00:00:00.000Z",
++        },
++      };
++    });
++  }
++
++  function scriptWaveCeremony(
++    harness: FakeHarness,
++    task: string,
++    captured: { waveReports: string[] },
++    opts: { failReportAt?: 1 | 2 } = {}
++  ): void {
++    let wave1ReportCalls = 0;
++    let wave2ReportCalls = 0;
++    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
++      ok: true,
++      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["keep"], summary: "Wave 1" },
++    });
++    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, (run) => {
++      wave1ReportCalls++;
++      if (opts.failReportAt === 1 && wave1ReportCalls === 1) {
++        return { ok: false, error: "architect wave report crashed" };
++      }
++      captured.waveReports.push(run.prompt);
++      return {
++        ok: true,
++        data: {
++          id: "dec-wave-1",
++          context: "wave",
++          decision: "continue",
++          timestamp: "2026-01-01T00:00:00.000Z",
++        },
++      };
++    });
++    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
++      ok: true,
++      data: { wave: 2, iteration: 1, status: "blocked", mergedItems: [], blockedItems: ["dependent"], summary: "Wave 2 blocked" },
++    });
++    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, (run) => {
++      wave2ReportCalls++;
++      if (opts.failReportAt === 2 && wave2ReportCalls === 1) {
++        return { ok: false, error: "architect wave report crashed" };
++      }
++      captured.waveReports.push(run.prompt);
++      return {
++        ok: true,
++        data: {
++          id: "dec-wave-2",
++          context: "wave",
++          decision: "continue",
++          timestamp: "2026-01-01T00:00:00.000Z",
++        },
++      };
++    });
++    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
++      ok: true,
++      data: { iteration: 1, status: "complete", summary: "Iteration verified" },
++    });
++    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
++      ok: true,
++      data: { iteration: 1, status: "complete", summary: "Delivery complete" },
++    });
++  }
++
++  it("writes one concern decision file and hydrates architect turns with routed concerns", async () => {
++    const task = "routing-consult";
++    seedTask(task);
++    const harness = new FakeHarness();
++    const captured: { planPrompt?: string; waveReports: string[] } = { waveReports: [] };
++    const consultPromptsSeen: string[] = [];
++
++    scriptIngestAndPlan(harness, task, captured);
++    scriptConcernConsult(harness, task, consultPromptsSeen);
++    scriptWaveCeremony(harness, task, captured);
++    harness.scriptOutcome(`${task}/items/keep/develop#a1`, {
++      ok: true,
++      data: { status: "ok", summary: "Kept the wave moving" },
++    });
++
++    const result = await runTask(
++      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
++      task
++    );
++
++    expect(result.status).toBe("done");
++
++    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
++    const deployedTaskDir = path.join(taskWtPath, ORCH, task);
++
++    // Exactly one canonical consult artifact, named by the routed concern.
++    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
++    const decision = await readYaml<Record<string, any>>(
++      path.join(deployedTaskDir, "decisions", `concern-${BLOCKER_CID}.yaml`)
++    );
++    expect(decision.decision).toBe("continue");
++
++    // One architect turn for the blocker concern, no turn for the risk concern.
++    expect(consultPromptsSeen).toHaveLength(1);
++    expect(consultPrompts(harness)).toHaveLength(1);
++    expect(consultPromptsSeen[0]).toContain(BLOCKER_CID);
++    expect(consultPromptsSeen[0]).toContain(BLOCKER_SUMMARY);
++
++    // Routed concerns reach the architect hydration for the plan and wave
++    // report turns without changing the open-only reviewer hydration.
++    expect(captured.planPrompt).toBeDefined();
++    expect(captured.planPrompt).toContain(BLOCKER_CID);
++    expect(captured.planPrompt).toContain(BLOCKER_SUMMARY);
++    expect(captured.planPrompt).toContain(ARCHITECT_CID);
++    expect(captured.planPrompt).toContain(ARCHITECT_SUMMARY);
++
++    expect(captured.waveReports).toHaveLength(2);
++    expect(captured.waveReports[0]).toContain(BLOCKER_CID);
++    expect(captured.waveReports[0]).toContain(BLOCKER_SUMMARY);
++  }, 30_000);
++
++  it("restart after a mid-iteration failure neither repeats the consult nor rewrites the decision", async () => {
++    const task = "routing-consult-restart";
++    seedTask(task);
++    const harness = new FakeHarness();
++    const captured: { planPrompt?: string; waveReports: string[] } = { waveReports: [] };
++    const consultPromptsSeen: string[] = [];
++
++    scriptIngestAndPlan(harness, task, captured);
++    scriptConcernConsult(harness, task, consultPromptsSeen);
++    scriptWaveCeremony(harness, task, captured, { failReportAt: 2 });
++    harness.scriptOutcome(`${task}/items/keep/develop#a1`, {
++      ok: true,
++      data: { status: "ok", summary: "Kept the wave moving" },
++    });
++
++    // Run 1 dies on wave 2's architect report, after the wave act consulted on
++    // the routed blocker and committed the decision artifact, but before the
++    // iteration finished.
++    const first = await runTask(
++      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
++      task
++    );
++    expect(first.status).toBe("failed");
++
++    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
++    const deployedTaskDir = path.join(taskWtPath, ORCH, task);
++    const decisionPath = path.join(deployedTaskDir, "decisions", `concern-${BLOCKER_CID}.yaml`);
++    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
++    expect(fs.existsSync(decisionPath)).toBe(true);
++    const beforeRestart = fs.readFileSync(decisionPath, "utf8");
++    expect(consultPrompts(harness)).toHaveLength(1);
++
++    // Run 2 restarts the same iteration; the existing decision artifact is the
++    // idempotency guard, so act phase must not consult or rewrite.
++    const second = await runTask(
++      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
++      task
++    );
++    expect(second.status).toBe("done");
++
++    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
++    expect(fs.readFileSync(decisionPath, "utf8")).toBe(beforeRestart);
++    expect(consultPrompts(harness)).toHaveLength(1);
++
++    // The restarted architect turn is hydrated with the routed concern.
++    expect(captured.waveReports.length).toBeGreaterThanOrEqual(1);
++    expect(captured.waveReports[captured.waveReports.length - 1]).toContain(BLOCKER_CID);
++    expect(captured.waveReports[captured.waveReports.length - 1]).toContain(BLOCKER_SUMMARY);
++  }, 30_000);
++});
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
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/meta.yaml
new file mode 100644
index 0000000..5a2228b
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/meta.yaml
@@ -0,0 +1,20 @@
+seq: 3
+name: qa
+attempt: 1
+fixRound: 1
+agent: qa
+role: alt-workhorse
+models:
+  - opencode-go/muse-spark-1.3-contributor
+  - opencode-go/deepseek-v4.1-flash
+timeoutSec: 900
+status: ok
+startedAt: 2026-11-08T12:31:17.481Z
+session: 01a1bb24-5870-7744-8615-1c6bf8bbfef3
+endedAt: 2026-11-08T12:43:43.643Z
+usage:
+  inputTokens: 57431
+  outputTokens: 54489
+  costUsd: 0.018889999999999997
+repairedFrom: ask
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-31-23-760Z_01a1bb24-5870-7744-8615-1c6bf8bbfef3.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/output.yaml
new file mode 100644
index 0000000..50c5af6
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/output.yaml
@@ -0,0 +1,22 @@
+status: approved
+summary: Red-green verified, strict consult/hydration assertions, full gates
+  green (371 pass).
+suggestions:
+  - detail: renderConcernsYaml gets full 64k hydrationBytes as concerns-only budget;
+      under many concerns it can crowd out plans/decisions before tail
+      truncation. Step-runner caps open-concern YAML at 8000; use a capped
+      sub-budget here.
+    disposition: optional
+    id: concerns-hydration-sub-budget
+    location:
+      file: plugins/software-factory/src/core/flows/iteration.ts
+      line: 178
+    summary: Cap concerns hydration section below full hydrationBytes
+  - detail: runConcernConsult interpolates concern.id raw into stepId while
+      runNonItemConsult sanitizes seam; sanitize for parity.
+    disposition: optional
+    id: concern-stepid-sanitize
+    location:
+      file: plugins/software-factory/src/core/flows/consults.ts
+      line: 357
+    summary: Sanitize concern id in consult stepId
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/004-review-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/004-review-r1-a1/input.md
new file mode 100644
index 0000000..5e7155e
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/004-review-r1-a1/input.md
@@ -0,0 +1,2479 @@
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
+  "slug": "routing-architect-consult-v2",
+  "kind": "dev",
+  "title": "Architect consult and hydration",
+  "assignment": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) + buildArchitectHydration concernsYaml extension for wave-report/next-plan. Tests: single consult file, restart writes no duplicate, architect input contains concern id+summary.",
+  "outlineRef": "routing-architect-consult-v2",
+  "milestone": "m3-routing",
+  "wave": 9,
+  "deps": [
+    "modes-prompts-v2",
+    "routing-blocker-derive-v2"
+  ]
+}
+
+## Engine Checks
+
+
+## Code Diff
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..ff0a121
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/checks.yaml
+@@ -0,0 +1,26 @@
++checks:
++  - id: test-first-scope
++    status: pass
++    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
++    details:
++      testFiles:
++        - plugins/software-factory/test/engine/routing-architect-consult.test.ts
++      newProdFiles: []
++      stubProdLines: 0
++  - id: target-red
++    status: pass
++    message: "target-red passed: all 2 expected tests failed with assertion failures"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/routing-architect-consult.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794140428146-pkayk3bvwzb.xml
++      junitCaseCount: 2
++      junitCaseIds:
++        - "Routing: architect consult and hydration.writes one concern decision
++          file and hydrates architect turns with routed concerns"
++        - "Routing: architect consult and hydration.restart after a
++          mid-iteration failure neither repeats the consult nor rewrites the
++          decision"
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/input.md
+new file mode 100644
+index 0000000..10a3003
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/input.md
+@@ -0,0 +1,53 @@
++# Step: Test-First
++
++## Goal
++Author automated tests specifying the required behavior changes BEFORE writing production code.
++
++## Rules
++- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
++- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
++- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
++- Target declaration in yield:
++  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
++  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
++  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
++- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
++- Output: yield structured output per `developer-output.schema.json`.
++
++## Assignment
++{
++  "slug": "routing-architect-consult-v2",
++  "kind": "dev",
++  "title": "Architect consult and hydration",
++  "assignment": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) + buildArchitectHydration concernsYaml extension for wave-report/next-plan. Tests: single consult file, restart writes no duplicate, architect input contains concern id+summary.",
++  "outlineRef": "routing-architect-consult-v2",
++  "milestone": "m3-routing",
++  "wave": 9,
++  "deps": [
++    "modes-prompts-v2",
++    "routing-blocker-derive-v2"
++  ]
++}
++
++## Context & Citations
++[]
++
++## Review Feedback
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
++- summary (string, required): Concise summary of implementation actions and test results
++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
++  - Option 1:
++    - selectors (array of string, required)
++    - expectRed (array of string, required, minItems: 1)
++  - Option 2:
++    - gate (string, required)
++  - Option 3:
++    - command (string, required)
++    - customTarget (boolean, required)
++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
++- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
++- notes (string, optional): Optional developer notes, implementation observations, or comments
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..ec19db4
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 1
++name: test-first
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 1200
++status: ok
++startedAt: 2026-11-08T12:05:41.885Z
++session: 01a1bb0c-d451-772b-9182-9ddaa040219e
++endedAt: 2026-11-08T12:20:32.051Z
++usage:
++  inputTokens: 217952
++  outputTokens: 72889
++  costUsd: 0.111013
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-05-42-609Z_01a1bb0c-d451-772b-9182-9ddaa040219e.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/output.yaml
+new file mode 100644
+index 0000000..26aa05a
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/output.yaml
+@@ -0,0 +1,61 @@
++status: ok
++summary: Authored test-first coverage for act-phase routing in
++  plugins/software-factory/test/engine/routing-architect-consult.test.ts (2
++  engine-level behavior tests, no production edits). Test 1 seeds routed blocker
++  + routed architect concerns, drives a story through plan/edits/waves, and
++  asserts exactly one decisions/concern-<cid>.yaml is written, one architect
++  consult runs with the concern id+summary in its prompt, and plan/wave-report
++  architect prompts hydrate routed concerns (id+summary). Test 2 runs the task,
++  fails it at wave 2's architect report after the consult artifact is committed,
++  restarts the same iteration, and asserts the decision file is neither
++  duplicated nor rewritten (one consult call total, byte-identical content)
++  while the restart's architect turn still carries the concern hydration. Both
++  tests are red on current production code as pure assertion failures (no
++  import/compile/collection errors).
++target:
++  selectors:
++    - test/engine/routing-architect-consult.test.ts
++  expectRed:
++    - "Routing: architect consult and hydration.writes one concern decision file
++      and hydrates architect turns with routed concerns"
++    - "Routing: architect consult and hydration.restart after a mid-iteration
++      failure neither repeats the consult nor rewrites the decision"
++evidence:
++  - Wrote plugins/software-factory/test/engine/routing-architect-consult.test.ts
++    with two focused engine-level scenarios reusing FakeHarness, tmp git repo,
++    and existing runTask/derive paths.
++  - TMPDIR=/tmp bun test test/engine/routing-architect-consult.test.ts -> 0
++    pass, 2 fail; both failures are expect().toEqual assertion failures
++    (decision file list expected ['concern-c-0123456789.yaml'] but received []),
++    so target-red is behavioral, not collection/import failure.
++  - "Bun JUnit reporter run: both testcases emitted <failure> (not <error>) with
++    ids 'Routing: architect consult and hydration.writes one concern decision
++    file and hydrates architect turns with routed concerns' and 'Routing:
++    architect consult and hydration.restart after a mid-iteration failure
++    neither repeats the consult nor rewrites the decision'."
++  - cd plugins/software-factory && bun run typecheck -> pass (no TS errors from
++    the new test file).
++  - TMPDIR=/tmp bun test (full suite) -> 369 pass, 2 skip, 2 fail; only the two
++    newly authored red tests fail, confirming no collateral regression.
++  - git status --porcelain shows only the new test file is untracked; no
++    existing production or test files were modified.
++concerns:
++  - "Green implementation contract encoded by the tests: the act-phase check
++    runs one orchestration step per routed blocker concern with an affected
++    blocked item, using step id 'consult-concern-<cid>' (FakeHarness label
++    '<task>/runs/consult-concern-<cid>#a1') and writing
++    'decisions/concern-<cid>.yaml'; file existence is the idempotency guard, so
++    restart neither consults nor rewrites."
++  - Hydration assertions require routed concerns (not only open ones) in
++    buildArchitectHydration output used by plan and wave-report turns;
++    hydrateConcernsYaml must stay open-only so the existing plan-review
++    hydration behavior/tests remain intact.
++  - The restart scenario fails wave 2's architect report after the consult
++    artifact is committed but before iteration close-up, proving restart
++    re-enters the act phase rather than short-circuiting on a blocked task
++    state.
++notes: "No interface stubs were needed: all tests compile against existing
++  exports (runTask, FakeHarness, Repo, loadPromptLibrary, readYaml). Selectors
++  use the committed infra testRunner (cd plugins/software-factory && bun test
++  <selector>); expectRed ids are exact JUnit classname.name ids emitted by bun's
++  junit reporter."
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..0171408
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/checks.yaml
+@@ -0,0 +1,76 @@
++checks:
++  - id: gates
++    status: pass
++    message: "Gates passed (2 gates, improvements: Engine: HEAD guard resilience
++      (§7).detects when an agent commits and resets --soft to before.sha,
++      keeping changes staged, Engine: HEAD guard resilience (§7).detects when an
++      agent switches branch and restores original branch, keeping changes)"
++    details:
++      - id: typecheck
++        command: cd plugins/software-factory && bun run typecheck
++        status: pass
++        durationMs: 5821
++        details: $ tsc --noEmit
++      - id: test
++        command: cd plugins/software-factory && bun test
++        status: pass
++        durationMs: 118585
++        details: |-
++          bun test v1.4.3 (c6da4a4d3)
++          ================================================================
++          Task: status-test-task [ACTIVE]
++          Kind: unclassified | Iteration: 1 | Wave: 1
++          Worktree: (none - main checkout)
++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-J2eve1/.factory/pipeline.yaml
++          Budget spent: $0.0000
++          ----------------------------------------------------------------
++          Waves & Items:
++            Wave 1:
++          ================================================================
++
++
++          test/cli/cli.test.ts:
++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 418986
++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 418986
++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 418986
++
++           371 pass
++           2 skip
++           0 fail
++           1725 expect() calls
++          Ran 373 tests across 61 files. [118.39s]
++          [Improvements: Engine: HEAD guard resilience (§7).detects when an agent commits and resets --soft to before.sha, keeping changes staged, Engine: HEAD guard resilience (§7).detects when an agent switches branch and restores original branch, keeping changes]
++        improvements:
++          - "Engine: HEAD guard resilience (§7).detects when an agent commits
++            and resets --soft to before.sha, keeping changes staged"
++          - "Engine: HEAD guard resilience (§7).detects when an agent switches
++            branch and restores original branch, keeping changes"
++  - id: target-green
++    status: pass
++    message: "target-green passed: selected tests passed"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/routing-architect-consult.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794140953772-s0xyy3z28sc.xml
++      junitCaseCount: 2
++      junitCaseIds:
++        - "Routing: architect consult and hydration.writes one concern decision
++          file and hydrates architect turns with routed concerns"
++        - "Routing: architect consult and hydration.restart after a
++          mid-iteration failure neither repeats the consult nor rewrites the
++          decision"
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: size
++    status: pass
++    message: "size passed: 213/300 production lines changed"
++    details:
++      changedLines:
++        added: 212
++        deleted: 1
++        total: 213
++        files:
++          - plugins/software-factory/src/core/flows/consults.ts
++          - plugins/software-factory/src/core/flows/iteration.ts
++      limit: 300
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/input.md
+new file mode 100644
+index 0000000..9369427
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/input.md
+@@ -0,0 +1,60 @@
++# Step: Develop
++
++## Goal
++Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
++
++## Rules
++- Target green: every test selector and case identified in `target` MUST pass cleanly.
++- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
++- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
++- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
++- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
++
++## Assignment
++{
++  "slug": "routing-architect-consult-v2",
++  "kind": "dev",
++  "title": "Architect consult and hydration",
++  "assignment": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) + buildArchitectHydration concernsYaml extension for wave-report/next-plan. Tests: single consult file, restart writes no duplicate, architect input contains concern id+summary.",
++  "outlineRef": "routing-architect-consult-v2",
++  "milestone": "m3-routing",
++  "wave": 9,
++  "deps": [
++    "modes-prompts-v2",
++    "routing-blocker-derive-v2"
++  ]
++}
++
++## Target
++{
++  "selectors": [
++    "test/engine/routing-architect-consult.test.ts"
++  ],
++  "expectRed": [
++    "Routing: architect consult and hydration.writes one concern decision file and hydrates architect turns with routed concerns",
++    "Routing: architect consult and hydration.restart after a mid-iteration failure neither repeats the consult nor rewrites the decision"
++  ]
++}
++
++## Context & Citations
++[]
++
++## Review Feedback
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
++- summary (string, required): Concise summary of implementation actions and test results
++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
++  - Option 1:
++    - selectors (array of string, required)
++    - expectRed (array of string, required, minItems: 1)
++  - Option 2:
++    - gate (string, required)
++  - Option 3:
++    - command (string, required)
++    - customTarget (boolean, required)
++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
++- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
++- notes (string, optional): Optional developer notes, implementation observations, or comments
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..16cd70b
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/meta.yaml
+@@ -0,0 +1,19 @@
++seq: 2
++name: develop
++attempt: 1
++fixRound: 1
++agent: developer
++role: workhorse
++models:
++  - opencode-go/deepseek-v4.1-flash
++  - opencode-go/muse-spark-1.3-contributor
++timeoutSec: 1200
++status: ok
++startedAt: 2026-11-08T12:20:34.899Z
++session: 01a1bb1a-73f1-70c0-9f65-49a895f3ed28
++endedAt: 2026-11-08T12:29:19.636Z
++usage:
++  inputTokens: 99783
++  outputTokens: 30332
++  costUsd: 0.044306
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-20-35-441Z_01a1bb1a-73f1-70c0-9f65-49a895f3ed28.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/output.yaml
+new file mode 100644
+index 0000000..2ec17bf
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/output.yaml
+@@ -0,0 +1,47 @@
++status: ok
++summary: "Implemented act-phase routed-concern routing. Added runConcernConsult
++  to flows/consults.ts: it runs a `consult-concern-<cid>` architect turn
++  (non-item consult fragment, prompt carries concern id/summary) and writes
++  decisions/concern-<cid>.yaml, guarded by the artifact's existence so restarts
++  neither repeat the turn nor rewrite the decision. Added consultRoutedBlockers
++  in flows/iteration.ts and invoke it per wave before work starts and after each
++  act tick, consulting once per routed blocker concern whose affects name a
++  blocked wave item. Extended buildArchitectHydration with an actionable
++  (open+routed) concerns digest rendered by the terse, byte-capped
++  renderConcernsYaml, so architect-plan/next-plan and architect-wave-report
++  prompts receive concern ids and summaries while plan-reviewer hydration stays
++  open-only. Target tests, related routing/concern suites, typecheck, and the
++  full suite are green."
++target:
++  selectors:
++    - test/engine/routing-architect-consult.test.ts
++  expectRed:
++    - "Routing: architect consult and hydration.writes one concern decision file
++      and hydrates architect turns with routed concerns"
++    - "Routing: architect consult and hydration.restart after a mid-iteration
++      failure neither repeats the consult nor rewrites the decision"
++evidence:
++  - "`bun test test/engine/routing-architect-consult.test.ts` -> 2 pass, 0 fail,
++    26 expect() calls (both target cases green)."
++  - "`bun run typecheck` -> exit 0 (tsc --noEmit clean)."
++  - "`bun test` (full suite) -> 371 pass, 2 skip, 0 fail across 61 files, 1725
++    expect() calls."
++  - "`bun test test/engine/routing-blocker-derive.test.ts
++    test/engine/routing-human-debt.test.ts test/engine/concerns-funnel.test.ts`
++    -> 38 pass, 0 fail."
++  - "`bun test test/engine/plan-reviewer-triage.test.ts
++    test/human-involvement-config.test.ts
++    test/engine/consult-decision-application.test.ts
++    test/engine/blocked-closeup-iteration.test.ts
++    test/engine/funnel-text-budget.test.ts` -> 30 pass, 0 fail."
++  - "`git status --short` -> only src/core/flows/consults.ts and
++    src/core/flows/iteration.ts modified (no stray artifacts)."
++concerns:
++  - Consult idempotency relies on the canonical decisions/concern-<cid>.yaml
++    artifact; a crash after writing the artifact but before its commit could
++    re-consult on restart if worktree repair discards the uncommitted file (same
++    ordering applies to all engine artifacts).
++notes: Consult reuses steps/architect-consult-nonitem so the existing
++  decisions.schema.json resolution (`consult-` prefix) and prompt-var preflight
++  stay unchanged; the decision artifact maps only schema-known fields to remain
++  contract-valid.
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/checks.yaml
+new file mode 100644
+index 0000000..b8cd1ba
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/checks.yaml
+@@ -0,0 +1,25 @@
++checks:
++  - id: red-test
++    status: pass
++    message: "red-test passed: all 2 tests fail when prod changes are restored to
++      test-first commit"
++    details:
++      command: cd plugins/software-factory && bun test
++        test/engine/routing-architect-consult.test.ts --reporter=junit
++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-redtest-1794141077526-9l69upk9jf.xml
++      junitCaseCount: 2
++      junitCaseIds:
++        - "Routing: architect consult and hydration.writes one concern decision
++          file and hydrates architect turns with routed concerns"
++        - "Routing: architect consult and hydration.restart after a
++          mid-iteration failure neither repeats the consult nor rewrites the
++          decision"
++      junitTruncated: false
++      collected: true
++      collectionErrors: []
++  - id: test-diff
++    status: pass
++    message: test-diff generated (0 test files, 0 bytes)
++    details:
++      diff: ""
++      files: []
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/input.md
+new file mode 100644
+index 0000000..f0bceda
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/input.md
+@@ -0,0 +1,1195 @@
++# Step: QA
++
++## Goal
++Perform independent quality assurance on the item's implementation and test suite. Guard against test weakening, false passes, and unverified claims.
++
++## Rules
++- SKEPTICAL VERIFICATION: do NOT trust developer summaries. Scrutinize engine check results (`red-test`, `test-diff`), actual diffs, and tool outputs.
++- Test weakening defense: scrutinize `testDiff`. Reject any test change that deletes assertions, relaxes matchers, replaces concrete checks with tautologies, or reduces test coverage.
++- Story kind validation:
++  - `dev` stories: verify `red-test` proved tests failed on baseline code and pass after implementation.
++  - `no-behavior` stories: confirm tests remain materially identical. Functional behavior must not change.
++- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.
++
++## Dispositions Criteria
++Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async.
++Use ONLY these dispositions; any other disposition value fails validation.
++# Review Suggestion Dispositions
++
++Criteria for assigning disposition to review findings:
++
++| Disposition | When to Assign | Engine Action |
++|---|---|---|
++| `fix` | Concrete defect, failing gate, broken contract, missing test, or deviation from assignment. | Returns item to `fixLoopTo` step (bounded by `maxFixRounds`); developer must address. Non-item: triggers consult. |
++| `optional` | Non-blocking polish, code style improvement, minor refactor opportunity, or deferred debt. | Passed to developer if another fix round occurs; otherwise recorded as tech debt for future iterations. |
++| `architect` | Architectural contradiction, interface redesign, boundary breach, or uncertainty exceeding item scope. | Triggers immediate architect consult; architect's decision is binding and final. |
++| `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
++| `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |
++
++## Rules
++- Defect requiring code change MUST be `fix`.
++- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
++- Do NOT use `human-async` when repo context or architecture docs provide the answer.
++
++## Assignment
++{
++  "slug": "routing-architect-consult-v2",
++  "kind": "dev",
++  "title": "Architect consult and hydration",
++  "assignment": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) + buildArchitectHydration concernsYaml extension for wave-report/next-plan. Tests: single consult file, restart writes no duplicate, architect input contains concern id+summary.",
++  "outlineRef": "routing-architect-consult-v2",
++  "milestone": "m3-routing",
++  "wave": 9,
++  "deps": [
++    "modes-prompts-v2",
++    "routing-blocker-derive-v2"
++  ]
++}
++
++## Engine Checks
++
++
++## Test Diff
++
++
++## Code Diff
++diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..ff0a121
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/checks.yaml
++@@ -0,0 +1,26 @@
+++checks:
+++  - id: test-first-scope
+++    status: pass
+++    message: test-first-scope passed (1 test files, 0 new prod stubs with 0 lines)
+++    details:
+++      testFiles:
+++        - plugins/software-factory/test/engine/routing-architect-consult.test.ts
+++      newProdFiles: []
+++      stubProdLines: 0
+++  - id: target-red
+++    status: pass
+++    message: "target-red passed: all 2 expected tests failed with assertion failures"
+++    details:
+++      command: cd plugins/software-factory && bun test
+++        test/engine/routing-architect-consult.test.ts --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-1794140428146-pkayk3bvwzb.xml
+++      junitCaseCount: 2
+++      junitCaseIds:
+++        - "Routing: architect consult and hydration.writes one concern decision
+++          file and hydrates architect turns with routed concerns"
+++        - "Routing: architect consult and hydration.restart after a
+++          mid-iteration failure neither repeats the consult nor rewrites the
+++          decision"
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
++diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/input.md
++new file mode 100644
++index 0000000..10a3003
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/input.md
++@@ -0,0 +1,53 @@
+++# Step: Test-First
+++
+++## Goal
+++Author automated tests specifying the required behavior changes BEFORE writing production code.
+++
+++## Rules
+++- Test-first scope: modify files under test paths (`paths.tests`). You may introduce new (never modified) interface-stub files under production paths (`paths.prod`) within the engine-enforced stub budget so tests of new modules can collect/compile. Existing production code must remain untouched.
+++- Red expectation: every declared test must fail on the current production codebase because the functionality does not yet exist. A test that fails due to compilation/syntax/import errors does NOT satisfy target-red.
+++- Prove test infra first: confirm the runner executes your new tests and reports failures correctly before declaring the target.
+++- Target declaration in yield:
+++  - Standard story: yield `target: { selectors: ["<test-file-or-pattern>"], expectRed: ["<test-case-id-1>", "<test-case-id-2>"] }` (both required; `expectRed` non-empty).
+++  - Test id format: declare `expectRed` ids in the runner's native node-id form (e.g. pytest `tests/test_math.py::test_add`); the engine normalizes node ids against JUnit ids when matching.
+++  - Bootstrap story (no test runner exists yet): yield `target: { gate: "<gate-id>" }` or `target: { command: "<test-command>", customTarget: true }`. The gate/command itself must currently fail (red).
+++- Never test lint/format rules: assert behavior, never style or compiler-guaranteed facts. Debloat test code preserving intent.
+++- Output: yield structured output per `developer-output.schema.json`.
+++
+++## Assignment
+++{
+++  "slug": "routing-architect-consult-v2",
+++  "kind": "dev",
+++  "title": "Architect consult and hydration",
+++  "assignment": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) + buildArchitectHydration concernsYaml extension for wave-report/next-plan. Tests: single consult file, restart writes no duplicate, architect input contains concern id+summary.",
+++  "outlineRef": "routing-architect-consult-v2",
+++  "milestone": "m3-routing",
+++  "wave": 9,
+++  "deps": [
+++    "modes-prompts-v2",
+++    "routing-blocker-derive-v2"
+++  ]
+++}
+++
+++## Context & Citations
+++[]
+++
+++## Review Feedback
+++
+++## Output
+++
+++Yield a structured JSON object matching this schema:
+++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+++- summary (string, required): Concise summary of implementation actions and test results
+++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+++  - Option 1:
+++    - selectors (array of string, required)
+++    - expectRed (array of string, required, minItems: 1)
+++  - Option 2:
+++    - gate (string, required)
+++  - Option 3:
+++    - command (string, required)
+++    - customTarget (boolean, required)
+++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+++- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
+++- notes (string, optional): Optional developer notes, implementation observations, or comments
++diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..ec19db4
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/meta.yaml
++@@ -0,0 +1,19 @@
+++seq: 1
+++name: test-first
+++attempt: 1
+++fixRound: 1
+++agent: developer
+++role: workhorse
+++models:
+++  - opencode-go/deepseek-v4.1-flash
+++  - opencode-go/muse-spark-1.3-contributor
+++timeoutSec: 1200
+++status: ok
+++startedAt: 2026-11-08T12:05:41.885Z
+++session: 01a1bb0c-d451-772b-9182-9ddaa040219e
+++endedAt: 2026-11-08T12:20:32.051Z
+++usage:
+++  inputTokens: 217952
+++  outputTokens: 72889
+++  costUsd: 0.111013
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-05-42-609Z_01a1bb0c-d451-772b-9182-9ddaa040219e.jsonl
++diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/output.yaml
++new file mode 100644
++index 0000000..26aa05a
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/001-test-first-r1-a1/output.yaml
++@@ -0,0 +1,61 @@
+++status: ok
+++summary: Authored test-first coverage for act-phase routing in
+++  plugins/software-factory/test/engine/routing-architect-consult.test.ts (2
+++  engine-level behavior tests, no production edits). Test 1 seeds routed blocker
+++  + routed architect concerns, drives a story through plan/edits/waves, and
+++  asserts exactly one decisions/concern-<cid>.yaml is written, one architect
+++  consult runs with the concern id+summary in its prompt, and plan/wave-report
+++  architect prompts hydrate routed concerns (id+summary). Test 2 runs the task,
+++  fails it at wave 2's architect report after the consult artifact is committed,
+++  restarts the same iteration, and asserts the decision file is neither
+++  duplicated nor rewritten (one consult call total, byte-identical content)
+++  while the restart's architect turn still carries the concern hydration. Both
+++  tests are red on current production code as pure assertion failures (no
+++  import/compile/collection errors).
+++target:
+++  selectors:
+++    - test/engine/routing-architect-consult.test.ts
+++  expectRed:
+++    - "Routing: architect consult and hydration.writes one concern decision file
+++      and hydrates architect turns with routed concerns"
+++    - "Routing: architect consult and hydration.restart after a mid-iteration
+++      failure neither repeats the consult nor rewrites the decision"
+++evidence:
+++  - Wrote plugins/software-factory/test/engine/routing-architect-consult.test.ts
+++    with two focused engine-level scenarios reusing FakeHarness, tmp git repo,
+++    and existing runTask/derive paths.
+++  - TMPDIR=/tmp bun test test/engine/routing-architect-consult.test.ts -> 0
+++    pass, 2 fail; both failures are expect().toEqual assertion failures
+++    (decision file list expected ['concern-c-0123456789.yaml'] but received []),
+++    so target-red is behavioral, not collection/import failure.
+++  - "Bun JUnit reporter run: both testcases emitted <failure> (not <error>) with
+++    ids 'Routing: architect consult and hydration.writes one concern decision
+++    file and hydrates architect turns with routed concerns' and 'Routing:
+++    architect consult and hydration.restart after a mid-iteration failure
+++    neither repeats the consult nor rewrites the decision'."
+++  - cd plugins/software-factory && bun run typecheck -> pass (no TS errors from
+++    the new test file).
+++  - TMPDIR=/tmp bun test (full suite) -> 369 pass, 2 skip, 2 fail; only the two
+++    newly authored red tests fail, confirming no collateral regression.
+++  - git status --porcelain shows only the new test file is untracked; no
+++    existing production or test files were modified.
+++concerns:
+++  - "Green implementation contract encoded by the tests: the act-phase check
+++    runs one orchestration step per routed blocker concern with an affected
+++    blocked item, using step id 'consult-concern-<cid>' (FakeHarness label
+++    '<task>/runs/consult-concern-<cid>#a1') and writing
+++    'decisions/concern-<cid>.yaml'; file existence is the idempotency guard, so
+++    restart neither consults nor rewrites."
+++  - Hydration assertions require routed concerns (not only open ones) in
+++    buildArchitectHydration output used by plan and wave-report turns;
+++    hydrateConcernsYaml must stay open-only so the existing plan-review
+++    hydration behavior/tests remain intact.
+++  - The restart scenario fails wave 2's architect report after the consult
+++    artifact is committed but before iteration close-up, proving restart
+++    re-enters the act phase rather than short-circuiting on a blocked task
+++    state.
+++notes: "No interface stubs were needed: all tests compile against existing
+++  exports (runTask, FakeHarness, Repo, loadPromptLibrary, readYaml). Selectors
+++  use the committed infra testRunner (cd plugins/software-factory && bun test
+++  <selector>); expectRed ids are exact JUnit classname.name ids emitted by bun's
+++  junit reporter."
++diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/checks.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/checks.yaml
++new file mode 100644
++index 0000000..0171408
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/checks.yaml
++@@ -0,0 +1,76 @@
+++checks:
+++  - id: gates
+++    status: pass
+++    message: "Gates passed (2 gates, improvements: Engine: HEAD guard resilience
+++      (§7).detects when an agent commits and resets --soft to before.sha,
+++      keeping changes staged, Engine: HEAD guard resilience (§7).detects when an
+++      agent switches branch and restores original branch, keeping changes)"
+++    details:
+++      - id: typecheck
+++        command: cd plugins/software-factory && bun run typecheck
+++        status: pass
+++        durationMs: 5821
+++        details: $ tsc --noEmit
+++      - id: test
+++        command: cd plugins/software-factory && bun test
+++        status: pass
+++        durationMs: 118585
+++        details: |-
+++          bun test v1.4.3 (c6da4a4d3)
+++          ================================================================
+++          Task: status-test-task [ACTIVE]
+++          Kind: unclassified | Iteration: 1 | Wave: 1
+++          Worktree: (none - main checkout)
+++          Config path: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/factory-test-repo-J2eve1/.factory/pipeline.yaml
+++          Budget spent: $0.0000
+++          ----------------------------------------------------------------
+++          Waves & Items:
+++            Wave 1:
+++          ================================================================
+++
+++
+++          test/cli/cli.test.ts:
+++          [factory lock] Stale run lock for task "stale-lock-task" (PID 9999999 on host Slava-Yoga) taken over by PID 418986
+++          [factory lock] Stale run lock for task "competing-takeover-task" (PID 9999999 on host Slava-Yoga) taken over by PID 418986
+++          [factory lock] Stale run lock for task "journal-worktree-task" (PID 9999999 on host Slava-Yoga) taken over by PID 418986
+++
+++           371 pass
+++           2 skip
+++           0 fail
+++           1725 expect() calls
+++          Ran 373 tests across 61 files. [118.39s]
+++          [Improvements: Engine: HEAD guard resilience (§7).detects when an agent commits and resets --soft to before.sha, keeping changes staged, Engine: HEAD guard resilience (§7).detects when an agent switches branch and restores original branch, keeping changes]
+++        improvements:
+++          - "Engine: HEAD guard resilience (§7).detects when an agent commits
+++            and resets --soft to before.sha, keeping changes staged"
+++          - "Engine: HEAD guard resilience (§7).detects when an agent switches
+++            branch and restores original branch, keeping changes"
+++  - id: target-green
+++    status: pass
+++    message: "target-green passed: selected tests passed"
+++    details:
+++      command: cd plugins/software-factory && bun test
+++        test/engine/routing-architect-consult.test.ts --reporter=junit
+++        --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794140953772-s0xyy3z28sc.xml
+++      junitCaseCount: 2
+++      junitCaseIds:
+++        - "Routing: architect consult and hydration.writes one concern decision
+++          file and hydrates architect turns with routed concerns"
+++        - "Routing: architect consult and hydration.restart after a
+++          mid-iteration failure neither repeats the consult nor rewrites the
+++          decision"
+++      junitTruncated: false
+++      collected: true
+++      collectionErrors: []
+++  - id: size
+++    status: pass
+++    message: "size passed: 213/300 production lines changed"
+++    details:
+++      changedLines:
+++        added: 212
+++        deleted: 1
+++        total: 213
+++        files:
+++          - plugins/software-factory/src/core/flows/consults.ts
+++          - plugins/software-factory/src/core/flows/iteration.ts
+++      limit: 300
++diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/input.md b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/input.md
++new file mode 100644
++index 0000000..9369427
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/input.md
++@@ -0,0 +1,60 @@
+++# Step: Develop
+++
+++## Goal
+++Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.
+++
+++## Rules
+++- Target green: every test selector and case identified in `target` MUST pass cleanly.
+++- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
+++- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
+++- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
+++- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.
+++
+++## Assignment
+++{
+++  "slug": "routing-architect-consult-v2",
+++  "kind": "dev",
+++  "title": "Architect consult and hydration",
+++  "assignment": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) + buildArchitectHydration concernsYaml extension for wave-report/next-plan. Tests: single consult file, restart writes no duplicate, architect input contains concern id+summary.",
+++  "outlineRef": "routing-architect-consult-v2",
+++  "milestone": "m3-routing",
+++  "wave": 9,
+++  "deps": [
+++    "modes-prompts-v2",
+++    "routing-blocker-derive-v2"
+++  ]
+++}
+++
+++## Target
+++{
+++  "selectors": [
+++    "test/engine/routing-architect-consult.test.ts"
+++  ],
+++  "expectRed": [
+++    "Routing: architect consult and hydration.writes one concern decision file and hydrates architect turns with routed concerns",
+++    "Routing: architect consult and hydration.restart after a mid-iteration failure neither repeats the consult nor rewrites the decision"
+++  ]
+++}
+++
+++## Context & Citations
+++[]
+++
+++## Review Feedback
+++
+++## Output
+++
+++Yield a structured JSON object matching this schema:
+++- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
+++- summary (string, required): Concise summary of implementation actions and test results
+++- target (object, optional): Target test selectors, gate, or custom command for red/green verification
+++  - Option 1:
+++    - selectors (array of string, required)
+++    - expectRed (array of string, required, minItems: 1)
+++  - Option 2:
+++    - gate (string, required)
+++  - Option 3:
+++    - command (string, required)
+++    - customTarget (boolean, required)
+++- evidence (array of string, optional): List of executed checks and verification commands proving correctness
+++- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
+++- notes (string, optional): Optional developer notes, implementation observations, or comments
++diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/meta.yaml
++new file mode 100644
++index 0000000..16cd70b
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/meta.yaml
++@@ -0,0 +1,19 @@
+++seq: 2
+++name: develop
+++attempt: 1
+++fixRound: 1
+++agent: developer
+++role: workhorse
+++models:
+++  - opencode-go/deepseek-v4.1-flash
+++  - opencode-go/muse-spark-1.3-contributor
+++timeoutSec: 1200
+++status: ok
+++startedAt: 2026-11-08T12:20:34.899Z
+++session: 01a1bb1a-73f1-70c0-9f65-49a895f3ed28
+++endedAt: 2026-11-08T12:29:19.636Z
+++usage:
+++  inputTokens: 99783
+++  outputTokens: 30332
+++  costUsd: 0.044306
+++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-20-35-441Z_01a1bb1a-73f1-70c0-9f65-49a895f3ed28.jsonl
++diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/output.yaml
++new file mode 100644
++index 0000000..2ec17bf
++--- /dev/null
+++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/002-develop-r1-a1/output.yaml
++@@ -0,0 +1,47 @@
+++status: ok
+++summary: "Implemented act-phase routed-concern routing. Added runConcernConsult
+++  to flows/consults.ts: it runs a `consult-concern-<cid>` architect turn
+++  (non-item consult fragment, prompt carries concern id/summary) and writes
+++  decisions/concern-<cid>.yaml, guarded by the artifact's existence so restarts
+++  neither repeat the turn nor rewrite the decision. Added consultRoutedBlockers
+++  in flows/iteration.ts and invoke it per wave before work starts and after each
+++  act tick, consulting once per routed blocker concern whose affects name a
+++  blocked wave item. Extended buildArchitectHydration with an actionable
+++  (open+routed) concerns digest rendered by the terse, byte-capped
+++  renderConcernsYaml, so architect-plan/next-plan and architect-wave-report
+++  prompts receive concern ids and summaries while plan-reviewer hydration stays
+++  open-only. Target tests, related routing/concern suites, typecheck, and the
+++  full suite are green."
+++target:
+++  selectors:
+++    - test/engine/routing-architect-consult.test.ts
+++  expectRed:
+++    - "Routing: architect consult and hydration.writes one concern decision file
+++      and hydrates architect turns with routed concerns"
+++    - "Routing: architect consult and hydration.restart after a mid-iteration
+++      failure neither repeats the consult nor rewrites the decision"
+++evidence:
+++  - "`bun test test/engine/routing-architect-consult.test.ts` -> 2 pass, 0 fail,
+++    26 expect() calls (both target cases green)."
+++  - "`bun run typecheck` -> exit 0 (tsc --noEmit clean)."
+++  - "`bun test` (full suite) -> 371 pass, 2 skip, 0 fail across 61 files, 1725
+++    expect() calls."
+++  - "`bun test test/engine/routing-blocker-derive.test.ts
+++    test/engine/routing-human-debt.test.ts test/engine/concerns-funnel.test.ts`
+++    -> 38 pass, 0 fail."
+++  - "`bun test test/engine/plan-reviewer-triage.test.ts
+++    test/human-involvement-config.test.ts
+++    test/engine/consult-decision-application.test.ts
+++    test/engine/blocked-closeup-iteration.test.ts
+++    test/engine/funnel-text-budget.test.ts` -> 30 pass, 0 fail."
+++  - "`git status --short` -> only src/core/flows/consults.ts and
+++    src/core/flows/iteration.ts modified (no stray artifacts)."
+++concerns:
+++  - Consult idempotency relies on the canonical decisions/concern-<cid>.yaml
+++    artifact; a crash after writing the artifact but before its commit could
+++    re-consult on restart if worktree repair discards the uncommitted file (same
+++    ordering applies to all engine artifacts).
+++notes: Consult reuses steps/architect-consult-nonitem so the existing
+++  decisions.schema.json resolution (`consult-` prefix) and prompt-var preflight
+++  stay unchanged; the decision artifact maps only schema-known fields to remain
+++  contract-valid.
++diff --git a/plugins/software-factory/src/core/flows/consults.ts b/plugins/software-factory/src/core/flows/consults.ts
++index 9499683..92fdb03 100644
++--- a/plugins/software-factory/src/core/flows/consults.ts
+++++ b/plugins/software-factory/src/core/flows/consults.ts
++@@ -6,6 +6,7 @@ import type {
++   PipelineConfig,
++   ProjectConfig,
++   SteerItemArtifact,
+++  StoredConcernArtifact,
++ } from "../artifacts.js";
++ import type { Harness } from "../../harness/types.js";
++ import { writeYamlAtomic } from "../records/io.js";
++@@ -289,3 +290,121 @@ export async function runNonItemConsult(
++ 
++   return { decision: decisionArtifact, sessionId: stepRes.sessionId };
++ }
+++
+++export interface ConcernConsultParams {
+++  task: string;
+++  concern: StoredConcernArtifact;
+++  taskDir: string;
+++  taskWt: string;
+++  repo: any;
+++  harness: Harness;
+++  pipeline: PipelineConfig;
+++  project: ProjectConfig;
+++  prompts: any;
+++  architectSessionId?: string;
+++  turnsSemaphore?: Semaphore;
+++  budgetTracker?: BudgetTracker;
+++  iteration?: number;
+++}
+++
+++/**
+++ * Runs one architect consult for a routed blocker concern (§18,
+++ * adr-routing-derived-state). `decisions/concern-<cid>.yaml` is the canonical
+++ * artifact; its existence is the idempotency guard, so a restarted act phase
+++ * neither repeats the turn nor rewrites the decision.
+++ */
+++export async function runConcernConsult(
+++  params: ConcernConsultParams
+++): Promise<{ decision?: DecisionArtifact; sessionId?: string }> {
+++  const {
+++    task,
+++    concern,
+++    taskDir,
+++    taskWt,
+++    repo,
+++    harness,
+++    pipeline,
+++    project,
+++    prompts,
+++    architectSessionId,
+++    turnsSemaphore,
+++    budgetTracker,
+++    iteration,
+++  } = params;
+++
+++  const decisionPath = path.join(taskDir, "decisions", `concern-${concern.id}.yaml`);
+++  if (fs.existsSync(decisionPath)) {
+++    return { sessionId: architectSessionId };
+++  }
+++
+++  const runsDir = path.join(taskDir, "runs");
+++  await fs.promises.mkdir(path.dirname(decisionPath), { recursive: true });
+++  const affects = (concern.affects ?? []).join(", ");
+++  const promptVars: Record<string, string> = {
+++    task,
+++    context: [
+++      `Routed blocker concern ${concern.id}`,
+++      `Summary: ${concern.summary}`,
+++      `Severity: ${concern.severity}${affects ? `; blocks: ${affects}` : ""}`,
+++    ].join("\n"),
+++    feedback: concern.detail ?? concern.summary,
+++    debt: "",
+++  };
+++
+++  let decisionArtifact: DecisionArtifact | undefined;
+++  const stepRes = await runAgentStep({
+++    task,
+++    stepId: `consult-concern-${concern.id}`,
+++    stepFragment: "steps/architect-consult-nonitem",
+++    agent: "architect",
+++    role: "architect",
+++    sessionMode: "reuse",
+++    existingSessionId: architectSessionId,
+++    cwd: taskWt,
+++    taskDir,
+++    recordsDir: runsDir,
+++    repo,
+++    harness,
+++    pipeline,
+++    project,
+++    prompts,
+++    promptVars,
+++    turnsSemaphore,
+++    budgetTracker,
+++    iteration,
+++    writeArtifact: async (output: unknown) => {
+++      if (fs.existsSync(decisionPath)) return;
+++      const raw = output as any;
+++      decisionArtifact = {
+++        id: String(raw?.id ?? `decision-concern-${concern.id}`),
+++        context: (raw?.context ?? "wave") as DecisionContext,
+++        decision: String(raw?.decision ?? "continue"),
+++        timestamp: String(raw?.timestamp ?? new Date().toISOString()),
+++        rationale: raw?.rationale,
+++        text: raw?.text,
+++        persist: raw?.persist,
+++        outlines: raw?.outlines,
+++        outline: raw?.outline,
+++        debt: raw?.debt,
+++        reason: raw?.reason,
+++        question: raw?.question,
+++        planDelta: raw?.planDelta,
+++      };
+++      await writeYamlAtomic(decisionPath, decisionArtifact);
+++    },
+++  });
+++
+++  if (!stepRes.ok || !decisionArtifact) {
+++    throw new Error(`Concern consult for ${concern.id} failed: ${stepRes.meta.error || "no output"}`);
+++  }
+++
+++  await appendJournal(taskDir, {
+++    type: "decision_made",
+++    context: "concern",
+++    concern: concern.id,
+++    decision: decisionArtifact.decision,
+++    decisionPath,
+++  });
+++
+++  return { decision: decisionArtifact, sessionId: stepRes.sessionId };
+++}
++diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
++index abc124d..a58cfd2 100644
++--- a/plugins/software-factory/src/core/flows/iteration.ts
+++++ b/plugins/software-factory/src/core/flows/iteration.ts
++@@ -19,7 +19,7 @@ import { ensureChildWorktree, commitAll, removeWorktree } from "../git/index.js"
++ import { writeYamlAtomic, writeTextAtomic, readYaml, readText } from "../records/io.js";
++ import { runAgentStep } from "./step-runner.js";
++ import { writeQuestion } from "../steer.js";
++-import { runItemConsult } from "./consults.js";
+++import { runItemConsult, runConcernConsult } from "./consults.js";
++ import { mergeItem } from "./merge-path.js";
++ import { tickItemMachine } from "./item-machine.js";
++ import { deriveItemState } from "../derive/item.js";
++@@ -31,8 +31,10 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
++ import {
++   hydrateConcernsYaml,
++   listConcernIds,
+++  listConcerns,
++   partitionSuggestions,
++ } from "../concerns.js";
+++import { renderConcernsYaml } from "../triage.js";
++ import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
++ import { validateEdits } from "../plan/limits.js";
++ import { applyEdits } from "../plan/apply.js";
++@@ -166,6 +168,17 @@ async function buildArchitectHydration(
++     }
++   }
++ 
+++  // 5. Concerns (adr-routing-derived-state): routed and open concerns give
+++  // every architect turn the terse decision context the act phase acts on.
+++  const actionableConcerns = (await listConcerns(taskDir)).filter(
+++    (c) => c.status === "open" || c.status === "routed"
+++  );
+++  if (actionableConcerns.length > 0) {
+++    parts.push(
+++      `--- Concerns ---\n${renderConcernsYaml(actionableConcerns, maxBytes)}`
+++    );
+++  }
+++
++   const combined = parts.join("\n\n");
++   if (combined.length <= maxBytes) {
++     return combined;
++@@ -173,6 +186,58 @@ async function buildArchitectHydration(
++   return combined.slice(combined.length - maxBytes);
++ }
++ 
+++/**
+++ * Act-phase routing (§18, adr-routing-derived-state): consult the architect
+++ * once per routed blocker concern that blocks a pending item in this wave.
+++ * The per-concern decision artifact is the guard, so repeated or restarted
+++ * act passes neither repeat the turn nor rewrite the decision.
+++ */
+++interface RoutedConsultContext {
+++  task: string;
+++  taskDir: string;
+++  taskWt: string;
+++  repo: any;
+++  harness: Harness;
+++  pipeline: PipelineConfig;
+++  project: ProjectConfig;
+++  prompts: any;
+++  architectSessionId?: string;
+++  turnsSemaphore?: Semaphore;
+++  budgetTracker?: BudgetTracker;
+++  iteration: number;
+++}
+++
+++async function consultRoutedBlockers(
+++  ctx: RoutedConsultContext,
+++  blockedSlugs: Iterable<string>
+++): Promise<string | undefined> {
+++  const blocked = new Set(blockedSlugs);
+++  if (blocked.size === 0) return ctx.architectSessionId;
+++
+++  let sessionId = ctx.architectSessionId;
+++  for (const concern of await listConcerns(ctx.taskDir)) {
+++    if (concern.kind !== "blocker" || concern.status !== "routed") continue;
+++    if (!(concern.affects ?? []).some((slug) => blocked.has(slug))) continue;
+++    const res = await runConcernConsult({
+++      task: ctx.task,
+++      concern,
+++      taskDir: ctx.taskDir,
+++      taskWt: ctx.taskWt,
+++      repo: ctx.repo,
+++      harness: ctx.harness,
+++      pipeline: ctx.pipeline,
+++      project: ctx.project,
+++      prompts: ctx.prompts,
+++      architectSessionId: sessionId,
+++      turnsSemaphore: ctx.turnsSemaphore,
+++      budgetTracker: ctx.budgetTracker,
+++      iteration: ctx.iteration,
+++    });
+++    sessionId = res.sessionId ?? sessionId;
+++  }
+++  return sessionId;
+++}
+++
++ /**
++  * Runs a full architect iteration (§8.4).
++  */
++@@ -739,6 +804,28 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++       continue;
++     }
++ 
+++    // Act-phase routing (§18): each routed blocker concern blocking a pending
+++    // item in this wave gets one architect consult before work starts.
+++    const consultCtx: RoutedConsultContext = {
+++      task,
+++      taskDir,
+++      taskWt,
+++      repo,
+++      harness,
+++      pipeline,
+++      project,
+++      prompts,
+++      architectSessionId,
+++      turnsSemaphore,
+++      budgetTracker,
+++      iteration,
+++    };
+++    architectSessionId = await consultRoutedBlockers(
+++      consultCtx,
+++      waveState.blocked.map((it) => it.slug)
+++    );
+++    consultCtx.architectSessionId = architectSessionId;
+++
++     await appendJournal(taskDir, { type: "wave_started", wave: w, iteration });
++ 
++     // Run wave items until wave can merge or complete
++@@ -811,6 +898,11 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
++         items: itemStates,
++         blockedBy: await collectRoutedBlockers(taskDir),
++       });
+++      architectSessionId = await consultRoutedBlockers(
+++        consultCtx,
+++        waveState.blocked.map((it) => it.slug)
+++      );
+++      consultCtx.architectSessionId = architectSessionId;
++       await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
++     }
++ 
++diff --git a/plugins/software-factory/test/engine/routing-architect-consult.test.ts b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
++new file mode 100644
++index 0000000..3eb7799
++--- /dev/null
+++++ b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
++@@ -0,0 +1,435 @@
+++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+++import fs from "node:fs";
+++import path from "node:path";
+++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+++import { runTask } from "../../src/core/engine.js";
+++import { Repo } from "../../src/core/git/repo.js";
+++import { loadPromptLibrary } from "../../src/core/prompts.js";
+++import { readYaml } from "../../src/core/records/io.js";
+++import type {
+++  PipelineConfig,
+++  ProjectConfig,
+++  StoredConcernArtifact,
+++} from "../../src/core/artifacts.js";
+++
+++/**
+++ * Act-phase routing (docs/factory.v2.md §18; adr-routing-derived-state).
+++ *
+++ * Derive owns the blocking effect of a `routed` blocker concern. The act phase
+++ * owns the architect turn: when a wave act observes an item blocked by such a
+++ * concern, it consults the architect once per concern and writes
+++ * `decisions/concern-<cid>.yaml`. Existence of that canonical artifact is the
+++ * guard, so a restart after a mid-iteration failure neither consults nor
+++ * rewrites. Architect hydration (plan and wave report inputs) carries routed
+++ * concerns as a terse `{id, summary, ...}` digest.
+++ *
+++ * Test-first contract for the new consult step: it runs an orchestration step
+++ * named `consult-concern-<cid>` (harness label `<task>/runs/consult-concern-<cid>#a1`)
+++ * and its rendered prompt names the concern id and summary.
+++ */
+++
+++const ORCH = ".factory";
+++const BLOCKER_CID = "c-0123456789";
+++const ARCHITECT_CID = "c-9876543210";
+++const BLOCKER_SUMMARY = "Database schema migration is pending";
+++const ARCHITECT_SUMMARY = "Cache TTL assumption is unverified";
+++
+++type ConcernOverrides = Partial<StoredConcernArtifact> & { id: string };
+++
+++function storedConcern(overrides: ConcernOverrides): StoredConcernArtifact {
+++  return {
+++    kind: "blocker",
+++    summary: `Concern ${overrides.id}`,
+++    detail: "detail",
+++    severity: "medium",
+++    status: "routed",
+++    disposition: "architect",
+++    source: { record: "seed-concern", agent: "test" },
+++    createdAt: "2026-01-01T00:00:00.000Z",
+++    updatedAt: "2026-01-01T00:00:00.000Z",
+++    ...overrides,
+++  };
+++}
+++
+++function writeConcern(taskDir: string, concern: StoredConcernArtifact): void {
+++  const dir = path.join(taskDir, "concerns");
+++  fs.mkdirSync(dir, { recursive: true });
+++  fs.writeFileSync(path.join(dir, `${concern.id}.yaml`), JSON.stringify(concern, null, 2), "utf8");
+++}
+++
+++function makePipeline(): PipelineConfig {
+++  return {
+++    models: {
+++      roles: {
+++        workhorse: { model: "deepseek-chat" },
+++        "alt-workhorse": { model: "deepseek-chat" },
+++        architect: { model: "deepseek-reasoner" },
+++        "alt-architect": { model: "deepseek-reasoner" },
+++        "task-reviewer": { model: "deepseek-chat" },
+++        "wave-close-up": { model: "deepseek-chat" },
+++        "plan-close-up": { model: "deepseek-chat" },
+++        simpler: { model: "deepseek-chat" },
+++      },
+++    },
+++    agents: {
+++      triage: { role: "workhorse" },
+++      infra: { role: "workhorse" },
+++      architect: { role: "architect" },
+++      "plan-reviewer": { role: "alt-architect" },
+++      pm: { role: "alt-workhorse" },
+++      developer: { role: "workhorse" },
+++      reviewer: { role: "task-reviewer" },
+++      "wave-close-up": { role: "wave-close-up" },
+++      "plan-close-up": { role: "plan-close-up" },
+++    },
+++    flows: {
+++      simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
+++      story: {
+++        dev: {
+++          fixLoopTo: "develop",
+++          steps: [{ id: "develop", agent: "developer", role: "workhorse" }],
+++        },
+++      },
+++      spike: {},
+++    },
+++    limits: {
+++      maxParallelItems: 2,
+++      maxParallelTurns: 4,
+++      maxStepAttempts: 2,
+++      maxFixRounds: 2,
+++      maxPlanReviewRounds: 1,
+++      maxIterations: 3,
+++    },
+++  };
+++}
+++
+++function decisionFiles(taskDir: string): string[] {
+++  const dir = path.join(taskDir, "decisions");
+++  if (!fs.existsSync(dir)) return [];
+++  return fs.readdirSync(dir).filter((name) => name.endsWith(".yaml")).sort();
+++}
+++
+++function consultPrompts(harness: FakeHarness): string[] {
+++  return harness.calls
+++    .filter(
+++      (call): call is Extract<typeof call, { type: "run" }> =>
+++        call.type === "run" && call.run.label.includes("consult-concern-")
+++    )
+++    .map((call) => call.run.prompt);
+++}
+++
+++describe("Routing: architect consult and hydration", () => {
+++  let tmpRepo: TmpRepo;
+++  let worktreeRoot: string;
+++  let repoObj: Repo;
+++  let pipeline: PipelineConfig;
+++  let project: ProjectConfig;
+++  let prompts: ReturnType<typeof loadPromptLibrary>;
+++
+++  beforeEach(() => {
+++    tmpRepo = createTmpRepo();
+++    worktreeRoot = path.join(tmpRepo.dir + "-wt");
+++    fs.mkdirSync(worktreeRoot, { recursive: true });
+++    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
+++    pipeline = makePipeline();
+++    project = { orchestrationFolder: ORCH, worktreeRoot };
+++    prompts = loadPromptLibrary({
+++      builtinDir: path.resolve(import.meta.dir, "../../agents"),
+++      overrideDirs: [],
+++    });
+++  });
+++
+++  afterEach(() => {
+++    tmpRepo.cleanup();
+++  });
+++
+++  /**
+++   * Seeds a task whose wave 1 has one routable item and one routed-blocker
+++   * seed, and whose wave 2 holds the declared dependent of that seed.
+++   */
+++  function seedTask(task: string): string {
+++    const taskDir = path.join(tmpRepo.dir, ORCH, task);
+++    fs.mkdirSync(taskDir, { recursive: true });
+++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `Routing consult for ${task}\n`, "utf8");
+++    writeConcern(
+++      taskDir,
+++      storedConcern({
+++        id: BLOCKER_CID,
+++        kind: "blocker",
+++        summary: BLOCKER_SUMMARY,
+++        affects: ["seed"],
+++      })
+++    );
+++    writeConcern(
+++      taskDir,
+++      storedConcern({
+++        id: ARCHITECT_CID,
+++        kind: "risk",
+++        summary: ARCHITECT_SUMMARY,
+++        affects: [],
+++      })
+++    );
+++    tmpRepo.commit(`seed routed concerns for ${task}`);
+++    return taskDir;
+++  }
+++
+++  function scriptIngestAndPlan(
+++    harness: FakeHarness,
+++    task: string,
+++    captured: { planPrompt?: string }
+++  ): void {
+++    harness.scriptOutcome(`${task}/runs/triage#a1`, {
+++      ok: true,
+++      data: { kind: "story", rationale: "Routed concerns need an architect turn", citations: [] },
+++    });
+++    harness.scriptOutcome(`${task}/runs/infra#a1`, {
+++      ok: true,
+++      data: {
+++        setup: [],
+++        gates: [{ id: "test", command: "true" }],
+++        testRunner: { command: "true", selectorArgs: [], junitArg: "" },
+++      },
+++    });
+++    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, (run) => {
+++      captured.planPrompt = run.prompt;
+++      return {
+++        ok: true,
+++        data: {
+++          iteration: 1,
+++          milestones: [{ id: "m1", title: "M1" }],
+++          itemOutlines: [
+++            { slug: "keep", kind: "dev", title: "Keep", milestoneId: "m1" },
+++            { slug: "seed", kind: "dev", title: "Seed", milestoneId: "m1" },
+++            {
+++              slug: "dependent",
+++              kind: "dev",
+++              title: "Dependent",
+++              milestoneId: "m1",
+++              deps: ["seed"],
+++            },
+++          ],
+++        },
+++      };
+++    });
+++    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
+++      ok: true,
+++      data: { status: "approved", summary: "Plan approved", suggestions: [] },
+++    });
+++    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
+++      ok: true,
+++      data: {
+++        iteration: 1,
+++        items: [
+++          {
+++            slug: "keep",
+++            outlineRef: "keep",
+++            kind: "dev",
+++            title: "Keep",
+++            assignment: "Keep the wave progressing",
+++            milestone: "m1",
+++            wave: 1,
+++          },
+++          {
+++            slug: "seed",
+++            outlineRef: "seed",
+++            kind: "dev",
+++            title: "Seed",
+++            assignment: "Work named by the routed blocker",
+++            milestone: "m1",
+++            wave: 1,
+++          },
+++          {
+++            slug: "dependent",
+++            outlineRef: "dependent",
+++            kind: "dev",
+++            title: "Dependent",
+++            assignment: "Declared dependent of the blocked seed",
+++            milestone: "m1",
+++            wave: 2,
+++            deps: ["seed"],
+++          },
+++        ],
+++      },
+++    });
+++  }
+++
+++  function scriptConcernConsult(
+++    harness: FakeHarness,
+++    task: string,
+++    promptsSeen: string[]
+++  ): void {
+++    harness.scriptOutcome(`${task}/runs/consult-concern-${BLOCKER_CID}#a1`, (run) => {
+++      promptsSeen.push(run.prompt);
+++      return {
+++        ok: true,
+++        data: {
+++          id: `decision-concern-${BLOCKER_CID}`,
+++          context: "wave",
+++          decision: "continue",
+++          rationale: "Mitigate the migration before dependents run",
+++          timestamp: "2026-01-01T00:00:00.000Z",
+++        },
+++      };
+++    });
+++  }
+++
+++  function scriptWaveCeremony(
+++    harness: FakeHarness,
+++    task: string,
+++    captured: { waveReports: string[] },
+++    opts: { failReportAt?: 1 | 2 } = {}
+++  ): void {
+++    let wave1ReportCalls = 0;
+++    let wave2ReportCalls = 0;
+++    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
+++      ok: true,
+++      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["keep"], summary: "Wave 1" },
+++    });
+++    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, (run) => {
+++      wave1ReportCalls++;
+++      if (opts.failReportAt === 1 && wave1ReportCalls === 1) {
+++        return { ok: false, error: "architect wave report crashed" };
+++      }
+++      captured.waveReports.push(run.prompt);
+++      return {
+++        ok: true,
+++        data: {
+++          id: "dec-wave-1",
+++          context: "wave",
+++          decision: "continue",
+++          timestamp: "2026-01-01T00:00:00.000Z",
+++        },
+++      };
+++    });
+++    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
+++      ok: true,
+++      data: { wave: 2, iteration: 1, status: "blocked", mergedItems: [], blockedItems: ["dependent"], summary: "Wave 2 blocked" },
+++    });
+++    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, (run) => {
+++      wave2ReportCalls++;
+++      if (opts.failReportAt === 2 && wave2ReportCalls === 1) {
+++        return { ok: false, error: "architect wave report crashed" };
+++      }
+++      captured.waveReports.push(run.prompt);
+++      return {
+++        ok: true,
+++        data: {
+++          id: "dec-wave-2",
+++          context: "wave",
+++          decision: "continue",
+++          timestamp: "2026-01-01T00:00:00.000Z",
+++        },
+++      };
+++    });
+++    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
+++      ok: true,
+++      data: { iteration: 1, status: "complete", summary: "Iteration verified" },
+++    });
+++    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
+++      ok: true,
+++      data: { iteration: 1, status: "complete", summary: "Delivery complete" },
+++    });
+++  }
+++
+++  it("writes one concern decision file and hydrates architect turns with routed concerns", async () => {
+++    const task = "routing-consult";
+++    seedTask(task);
+++    const harness = new FakeHarness();
+++    const captured: { planPrompt?: string; waveReports: string[] } = { waveReports: [] };
+++    const consultPromptsSeen: string[] = [];
+++
+++    scriptIngestAndPlan(harness, task, captured);
+++    scriptConcernConsult(harness, task, consultPromptsSeen);
+++    scriptWaveCeremony(harness, task, captured);
+++    harness.scriptOutcome(`${task}/items/keep/develop#a1`, {
+++      ok: true,
+++      data: { status: "ok", summary: "Kept the wave moving" },
+++    });
+++
+++    const result = await runTask(
+++      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
+++      task
+++    );
+++
+++    expect(result.status).toBe("done");
+++
+++    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
+++    const deployedTaskDir = path.join(taskWtPath, ORCH, task);
+++
+++    // Exactly one canonical consult artifact, named by the routed concern.
+++    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
+++    const decision = await readYaml<Record<string, any>>(
+++      path.join(deployedTaskDir, "decisions", `concern-${BLOCKER_CID}.yaml`)
+++    );
+++    expect(decision.decision).toBe("continue");
+++
+++    // One architect turn for the blocker concern, no turn for the risk concern.
+++    expect(consultPromptsSeen).toHaveLength(1);
+++    expect(consultPrompts(harness)).toHaveLength(1);
+++    expect(consultPromptsSeen[0]).toContain(BLOCKER_CID);
+++    expect(consultPromptsSeen[0]).toContain(BLOCKER_SUMMARY);
+++
+++    // Routed concerns reach the architect hydration for the plan and wave
+++    // report turns without changing the open-only reviewer hydration.
+++    expect(captured.planPrompt).toBeDefined();
+++    expect(captured.planPrompt).toContain(BLOCKER_CID);
+++    expect(captured.planPrompt).toContain(BLOCKER_SUMMARY);
+++    expect(captured.planPrompt).toContain(ARCHITECT_CID);
+++    expect(captured.planPrompt).toContain(ARCHITECT_SUMMARY);
+++
+++    expect(captured.waveReports).toHaveLength(2);
+++    expect(captured.waveReports[0]).toContain(BLOCKER_CID);
+++    expect(captured.waveReports[0]).toContain(BLOCKER_SUMMARY);
+++  }, 30_000);
+++
+++  it("restart after a mid-iteration failure neither repeats the consult nor rewrites the decision", async () => {
+++    const task = "routing-consult-restart";
+++    seedTask(task);
+++    const harness = new FakeHarness();
+++    const captured: { planPrompt?: string; waveReports: string[] } = { waveReports: [] };
+++    const consultPromptsSeen: string[] = [];
+++
+++    scriptIngestAndPlan(harness, task, captured);
+++    scriptConcernConsult(harness, task, consultPromptsSeen);
+++    scriptWaveCeremony(harness, task, captured, { failReportAt: 2 });
+++    harness.scriptOutcome(`${task}/items/keep/develop#a1`, {
+++      ok: true,
+++      data: { status: "ok", summary: "Kept the wave moving" },
+++    });
+++
+++    // Run 1 dies on wave 2's architect report, after the wave act consulted on
+++    // the routed blocker and committed the decision artifact, but before the
+++    // iteration finished.
+++    const first = await runTask(
+++      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
+++      task
+++    );
+++    expect(first.status).toBe("failed");
+++
+++    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
+++    const deployedTaskDir = path.join(taskWtPath, ORCH, task);
+++    const decisionPath = path.join(deployedTaskDir, "decisions", `concern-${BLOCKER_CID}.yaml`);
+++    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
+++    expect(fs.existsSync(decisionPath)).toBe(true);
+++    const beforeRestart = fs.readFileSync(decisionPath, "utf8");
+++    expect(consultPrompts(harness)).toHaveLength(1);
+++
+++    // Run 2 restarts the same iteration; the existing decision artifact is the
+++    // idempotency guard, so act phase must not consult or rewrite.
+++    const second = await runTask(
+++      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
+++      task
+++    );
+++    expect(second.status).toBe("done");
+++
+++    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
+++    expect(fs.readFileSync(decisionPath, "utf8")).toBe(beforeRestart);
+++    expect(consultPrompts(harness)).toHaveLength(1);
+++
+++    // The restarted architect turn is hydrated with the routed concern.
+++    expect(captured.waveReports.length).toBeGreaterThanOrEqual(1);
+++    expect(captured.waveReports[captured.waveReports.length - 1]).toContain(BLOCKER_CID);
+++    expect(captured.waveReports[captured.waveReports.length - 1]).toContain(BLOCKER_SUMMARY);
+++  }, 30_000);
+++});
++
++## Output
++
++Yield a structured JSON object matching this schema:
++- status (string, required, enum: ["approved","changes_requested"])
++- summary (string, required)
++- suggestions (array of object, required)
++  - id (string, required)
++  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async"])
++  - summary (string, required)
++  - detail (string, optional)
++  - location (object, optional)
++    - file (string, required)
++    - line (integer, optional)
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/meta.yaml
+new file mode 100644
+index 0000000..5a2228b
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/meta.yaml
+@@ -0,0 +1,20 @@
++seq: 3
++name: qa
++attempt: 1
++fixRound: 1
++agent: qa
++role: alt-workhorse
++models:
++  - opencode-go/muse-spark-1.3-contributor
++  - opencode-go/deepseek-v4.1-flash
++timeoutSec: 900
++status: ok
++startedAt: 2026-11-08T12:31:17.481Z
++session: 01a1bb24-5870-7744-8615-1c6bf8bbfef3
++endedAt: 2026-11-08T12:43:43.643Z
++usage:
++  inputTokens: 57431
++  outputTokens: 54489
++  costUsd: 0.018889999999999997
++repairedFrom: ask
++traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-31-23-760Z_01a1bb24-5870-7744-8615-1c6bf8bbfef3.jsonl
+diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/output.yaml
+new file mode 100644
+index 0000000..50c5af6
+--- /dev/null
++++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/003-qa-r1-a1/output.yaml
+@@ -0,0 +1,22 @@
++status: approved
++summary: Red-green verified, strict consult/hydration assertions, full gates
++  green (371 pass).
++suggestions:
++  - detail: renderConcernsYaml gets full 64k hydrationBytes as concerns-only budget;
++      under many concerns it can crowd out plans/decisions before tail
++      truncation. Step-runner caps open-concern YAML at 8000; use a capped
++      sub-budget here.
++    disposition: optional
++    id: concerns-hydration-sub-budget
++    location:
++      file: plugins/software-factory/src/core/flows/iteration.ts
++      line: 178
++    summary: Cap concerns hydration section below full hydrationBytes
++  - detail: runConcernConsult interpolates concern.id raw into stepId while
++      runNonItemConsult sanitizes seam; sanitize for parity.
++    disposition: optional
++    id: concern-stepid-sanitize
++    location:
++      file: plugins/software-factory/src/core/flows/consults.ts
++      line: 357
++    summary: Sanitize concern id in consult stepId
+diff --git a/plugins/software-factory/src/core/flows/consults.ts b/plugins/software-factory/src/core/flows/consults.ts
+index 9499683..92fdb03 100644
+--- a/plugins/software-factory/src/core/flows/consults.ts
++++ b/plugins/software-factory/src/core/flows/consults.ts
+@@ -6,6 +6,7 @@ import type {
+   PipelineConfig,
+   ProjectConfig,
+   SteerItemArtifact,
++  StoredConcernArtifact,
+ } from "../artifacts.js";
+ import type { Harness } from "../../harness/types.js";
+ import { writeYamlAtomic } from "../records/io.js";
+@@ -289,3 +290,121 @@ export async function runNonItemConsult(
+ 
+   return { decision: decisionArtifact, sessionId: stepRes.sessionId };
+ }
++
++export interface ConcernConsultParams {
++  task: string;
++  concern: StoredConcernArtifact;
++  taskDir: string;
++  taskWt: string;
++  repo: any;
++  harness: Harness;
++  pipeline: PipelineConfig;
++  project: ProjectConfig;
++  prompts: any;
++  architectSessionId?: string;
++  turnsSemaphore?: Semaphore;
++  budgetTracker?: BudgetTracker;
++  iteration?: number;
++}
++
++/**
++ * Runs one architect consult for a routed blocker concern (§18,
++ * adr-routing-derived-state). `decisions/concern-<cid>.yaml` is the canonical
++ * artifact; its existence is the idempotency guard, so a restarted act phase
++ * neither repeats the turn nor rewrites the decision.
++ */
++export async function runConcernConsult(
++  params: ConcernConsultParams
++): Promise<{ decision?: DecisionArtifact; sessionId?: string }> {
++  const {
++    task,
++    concern,
++    taskDir,
++    taskWt,
++    repo,
++    harness,
++    pipeline,
++    project,
++    prompts,
++    architectSessionId,
++    turnsSemaphore,
++    budgetTracker,
++    iteration,
++  } = params;
++
++  const decisionPath = path.join(taskDir, "decisions", `concern-${concern.id}.yaml`);
++  if (fs.existsSync(decisionPath)) {
++    return { sessionId: architectSessionId };
++  }
++
++  const runsDir = path.join(taskDir, "runs");
++  await fs.promises.mkdir(path.dirname(decisionPath), { recursive: true });
++  const affects = (concern.affects ?? []).join(", ");
++  const promptVars: Record<string, string> = {
++    task,
++    context: [
++      `Routed blocker concern ${concern.id}`,
++      `Summary: ${concern.summary}`,
++      `Severity: ${concern.severity}${affects ? `; blocks: ${affects}` : ""}`,
++    ].join("\n"),
++    feedback: concern.detail ?? concern.summary,
++    debt: "",
++  };
++
++  let decisionArtifact: DecisionArtifact | undefined;
++  const stepRes = await runAgentStep({
++    task,
++    stepId: `consult-concern-${concern.id}`,
++    stepFragment: "steps/architect-consult-nonitem",
++    agent: "architect",
++    role: "architect",
++    sessionMode: "reuse",
++    existingSessionId: architectSessionId,
++    cwd: taskWt,
++    taskDir,
++    recordsDir: runsDir,
++    repo,
++    harness,
++    pipeline,
++    project,
++    prompts,
++    promptVars,
++    turnsSemaphore,
++    budgetTracker,
++    iteration,
++    writeArtifact: async (output: unknown) => {
++      if (fs.existsSync(decisionPath)) return;
++      const raw = output as any;
++      decisionArtifact = {
++        id: String(raw?.id ?? `decision-concern-${concern.id}`),
++        context: (raw?.context ?? "wave") as DecisionContext,
++        decision: String(raw?.decision ?? "continue"),
++        timestamp: String(raw?.timestamp ?? new Date().toISOString()),
++        rationale: raw?.rationale,
++        text: raw?.text,
++        persist: raw?.persist,
++        outlines: raw?.outlines,
++        outline: raw?.outline,
++        debt: raw?.debt,
++        reason: raw?.reason,
++        question: raw?.question,
++        planDelta: raw?.planDelta,
++      };
++      await writeYamlAtomic(decisionPath, decisionArtifact);
++    },
++  });
++
++  if (!stepRes.ok || !decisionArtifact) {
++    throw new Error(`Concern consult for ${concern.id} failed: ${stepRes.meta.error || "no output"}`);
++  }
++
++  await appendJournal(taskDir, {
++    type: "decision_made",
++    context: "concern",
++    concern: concern.id,
++    decision: decisionArtifact.decision,
++    decisionPath,
++  });
++
++  return { decision: decisionArtifact, sessionId: stepRes.sessionId };
++}
+diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
+index abc124d..a58cfd2 100644
+--- a/plugins/software-factory/src/core/flows/iteration.ts
++++ b/plugins/software-factory/src/core/flows/iteration.ts
+@@ -19,7 +19,7 @@ import { ensureChildWorktree, commitAll, removeWorktree } from "../git/index.js"
+ import { writeYamlAtomic, writeTextAtomic, readYaml, readText } from "../records/io.js";
+ import { runAgentStep } from "./step-runner.js";
+ import { writeQuestion } from "../steer.js";
+-import { runItemConsult } from "./consults.js";
++import { runItemConsult, runConcernConsult } from "./consults.js";
+ import { mergeItem } from "./merge-path.js";
+ import { tickItemMachine } from "./item-machine.js";
+ import { deriveItemState } from "../derive/item.js";
+@@ -31,8 +31,10 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
+ import {
+   hydrateConcernsYaml,
+   listConcernIds,
++  listConcerns,
+   partitionSuggestions,
+ } from "../concerns.js";
++import { renderConcernsYaml } from "../triage.js";
+ import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
+ import { validateEdits } from "../plan/limits.js";
+ import { applyEdits } from "../plan/apply.js";
+@@ -166,6 +168,17 @@ async function buildArchitectHydration(
+     }
+   }
+ 
++  // 5. Concerns (adr-routing-derived-state): routed and open concerns give
++  // every architect turn the terse decision context the act phase acts on.
++  const actionableConcerns = (await listConcerns(taskDir)).filter(
++    (c) => c.status === "open" || c.status === "routed"
++  );
++  if (actionableConcerns.length > 0) {
++    parts.push(
++      `--- Concerns ---\n${renderConcernsYaml(actionableConcerns, maxBytes)}`
++    );
++  }
++
+   const combined = parts.join("\n\n");
+   if (combined.length <= maxBytes) {
+     return combined;
+@@ -173,6 +186,58 @@ async function buildArchitectHydration(
+   return combined.slice(combined.length - maxBytes);
+ }
+ 
++/**
++ * Act-phase routing (§18, adr-routing-derived-state): consult the architect
++ * once per routed blocker concern that blocks a pending item in this wave.
++ * The per-concern decision artifact is the guard, so repeated or restarted
++ * act passes neither repeat the turn nor rewrite the decision.
++ */
++interface RoutedConsultContext {
++  task: string;
++  taskDir: string;
++  taskWt: string;
++  repo: any;
++  harness: Harness;
++  pipeline: PipelineConfig;
++  project: ProjectConfig;
++  prompts: any;
++  architectSessionId?: string;
++  turnsSemaphore?: Semaphore;
++  budgetTracker?: BudgetTracker;
++  iteration: number;
++}
++
++async function consultRoutedBlockers(
++  ctx: RoutedConsultContext,
++  blockedSlugs: Iterable<string>
++): Promise<string | undefined> {
++  const blocked = new Set(blockedSlugs);
++  if (blocked.size === 0) return ctx.architectSessionId;
++
++  let sessionId = ctx.architectSessionId;
++  for (const concern of await listConcerns(ctx.taskDir)) {
++    if (concern.kind !== "blocker" || concern.status !== "routed") continue;
++    if (!(concern.affects ?? []).some((slug) => blocked.has(slug))) continue;
++    const res = await runConcernConsult({
++      task: ctx.task,
++      concern,
++      taskDir: ctx.taskDir,
++      taskWt: ctx.taskWt,
++      repo: ctx.repo,
++      harness: ctx.harness,
++      pipeline: ctx.pipeline,
++      project: ctx.project,
++      prompts: ctx.prompts,
++      architectSessionId: sessionId,
++      turnsSemaphore: ctx.turnsSemaphore,
++      budgetTracker: ctx.budgetTracker,
++      iteration: ctx.iteration,
++    });
++    sessionId = res.sessionId ?? sessionId;
++  }
++  return sessionId;
++}
++
+ /**
+  * Runs a full architect iteration (§8.4).
+  */
+@@ -739,6 +804,28 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+       continue;
+     }
+ 
++    // Act-phase routing (§18): each routed blocker concern blocking a pending
++    // item in this wave gets one architect consult before work starts.
++    const consultCtx: RoutedConsultContext = {
++      task,
++      taskDir,
++      taskWt,
++      repo,
++      harness,
++      pipeline,
++      project,
++      prompts,
++      architectSessionId,
++      turnsSemaphore,
++      budgetTracker,
++      iteration,
++    };
++    architectSessionId = await consultRoutedBlockers(
++      consultCtx,
++      waveState.blocked.map((it) => it.slug)
++    );
++    consultCtx.architectSessionId = architectSessionId;
++
+     await appendJournal(taskDir, { type: "wave_started", wave: w, iteration });
+ 
+     // Run wave items until wave can merge or complete
+@@ -811,6 +898,11 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
+         items: itemStates,
+         blockedBy: await collectRoutedBlockers(taskDir),
+       });
++      architectSessionId = await consultRoutedBlockers(
++        consultCtx,
++        waveState.blocked.map((it) => it.slug)
++      );
++      consultCtx.architectSessionId = architectSessionId;
+       await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
+     }
+ 
+diff --git a/plugins/software-factory/test/engine/routing-architect-consult.test.ts b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+new file mode 100644
+index 0000000..3eb7799
+--- /dev/null
++++ b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
+@@ -0,0 +1,435 @@
++import { describe, it, expect, beforeEach, afterEach } from "bun:test";
++import fs from "node:fs";
++import path from "node:path";
++import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
++import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
++import { runTask } from "../../src/core/engine.js";
++import { Repo } from "../../src/core/git/repo.js";
++import { loadPromptLibrary } from "../../src/core/prompts.js";
++import { readYaml } from "../../src/core/records/io.js";
++import type {
++  PipelineConfig,
++  ProjectConfig,
++  StoredConcernArtifact,
++} from "../../src/core/artifacts.js";
++
++/**
++ * Act-phase routing (docs/factory.v2.md §18; adr-routing-derived-state).
++ *
++ * Derive owns the blocking effect of a `routed` blocker concern. The act phase
++ * owns the architect turn: when a wave act observes an item blocked by such a
++ * concern, it consults the architect once per concern and writes
++ * `decisions/concern-<cid>.yaml`. Existence of that canonical artifact is the
++ * guard, so a restart after a mid-iteration failure neither consults nor
++ * rewrites. Architect hydration (plan and wave report inputs) carries routed
++ * concerns as a terse `{id, summary, ...}` digest.
++ *
++ * Test-first contract for the new consult step: it runs an orchestration step
++ * named `consult-concern-<cid>` (harness label `<task>/runs/consult-concern-<cid>#a1`)
++ * and its rendered prompt names the concern id and summary.
++ */
++
++const ORCH = ".factory";
++const BLOCKER_CID = "c-0123456789";
++const ARCHITECT_CID = "c-9876543210";
++const BLOCKER_SUMMARY = "Database schema migration is pending";
++const ARCHITECT_SUMMARY = "Cache TTL assumption is unverified";
++
++type ConcernOverrides = Partial<StoredConcernArtifact> & { id: string };
++
++function storedConcern(overrides: ConcernOverrides): StoredConcernArtifact {
++  return {
++    kind: "blocker",
++    summary: `Concern ${overrides.id}`,
++    detail: "detail",
++    severity: "medium",
++    status: "routed",
++    disposition: "architect",
++    source: { record: "seed-concern", agent: "test" },
++    createdAt: "2026-01-01T00:00:00.000Z",
++    updatedAt: "2026-01-01T00:00:00.000Z",
++    ...overrides,
++  };
++}
++
++function writeConcern(taskDir: string, concern: StoredConcernArtifact): void {
++  const dir = path.join(taskDir, "concerns");
++  fs.mkdirSync(dir, { recursive: true });
++  fs.writeFileSync(path.join(dir, `${concern.id}.yaml`), JSON.stringify(concern, null, 2), "utf8");
++}
++
++function makePipeline(): PipelineConfig {
++  return {
++    models: {
++      roles: {
++        workhorse: { model: "deepseek-chat" },
++        "alt-workhorse": { model: "deepseek-chat" },
++        architect: { model: "deepseek-reasoner" },
++        "alt-architect": { model: "deepseek-reasoner" },
++        "task-reviewer": { model: "deepseek-chat" },
++        "wave-close-up": { model: "deepseek-chat" },
++        "plan-close-up": { model: "deepseek-chat" },
++        simpler: { model: "deepseek-chat" },
++      },
++    },
++    agents: {
++      triage: { role: "workhorse" },
++      infra: { role: "workhorse" },
++      architect: { role: "architect" },
++      "plan-reviewer": { role: "alt-architect" },
++      pm: { role: "alt-workhorse" },
++      developer: { role: "workhorse" },
++      reviewer: { role: "task-reviewer" },
++      "wave-close-up": { role: "wave-close-up" },
++      "plan-close-up": { role: "plan-close-up" },
++    },
++    flows: {
++      simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
++      story: {
++        dev: {
++          fixLoopTo: "develop",
++          steps: [{ id: "develop", agent: "developer", role: "workhorse" }],
++        },
++      },
++      spike: {},
++    },
++    limits: {
++      maxParallelItems: 2,
++      maxParallelTurns: 4,
++      maxStepAttempts: 2,
++      maxFixRounds: 2,
++      maxPlanReviewRounds: 1,
++      maxIterations: 3,
++    },
++  };
++}
++
++function decisionFiles(taskDir: string): string[] {
++  const dir = path.join(taskDir, "decisions");
++  if (!fs.existsSync(dir)) return [];
++  return fs.readdirSync(dir).filter((name) => name.endsWith(".yaml")).sort();
++}
++
++function consultPrompts(harness: FakeHarness): string[] {
++  return harness.calls
++    .filter(
++      (call): call is Extract<typeof call, { type: "run" }> =>
++        call.type === "run" && call.run.label.includes("consult-concern-")
++    )
++    .map((call) => call.run.prompt);
++}
++
++describe("Routing: architect consult and hydration", () => {
++  let tmpRepo: TmpRepo;
++  let worktreeRoot: string;
++  let repoObj: Repo;
++  let pipeline: PipelineConfig;
++  let project: ProjectConfig;
++  let prompts: ReturnType<typeof loadPromptLibrary>;
++
++  beforeEach(() => {
++    tmpRepo = createTmpRepo();
++    worktreeRoot = path.join(tmpRepo.dir + "-wt");
++    fs.mkdirSync(worktreeRoot, { recursive: true });
++    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
++    pipeline = makePipeline();
++    project = { orchestrationFolder: ORCH, worktreeRoot };
++    prompts = loadPromptLibrary({
++      builtinDir: path.resolve(import.meta.dir, "../../agents"),
++      overrideDirs: [],
++    });
++  });
++
++  afterEach(() => {
++    tmpRepo.cleanup();
++  });
++
++  /**
++   * Seeds a task whose wave 1 has one routable item and one routed-blocker
++   * seed, and whose wave 2 holds the declared dependent of that seed.
++   */
++  function seedTask(task: string): string {
++    const taskDir = path.join(tmpRepo.dir, ORCH, task);
++    fs.mkdirSync(taskDir, { recursive: true });
++    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `Routing consult for ${task}\n`, "utf8");
++    writeConcern(
++      taskDir,
++      storedConcern({
++        id: BLOCKER_CID,
++        kind: "blocker",
++        summary: BLOCKER_SUMMARY,
++        affects: ["seed"],
++      })
++    );
++    writeConcern(
++      taskDir,
++      storedConcern({
++        id: ARCHITECT_CID,
++        kind: "risk",
++        summary: ARCHITECT_SUMMARY,
++        affects: [],
++      })
++    );
++    tmpRepo.commit(`seed routed concerns for ${task}`);
++    return taskDir;
++  }
++
++  function scriptIngestAndPlan(
++    harness: FakeHarness,
++    task: string,
++    captured: { planPrompt?: string }
++  ): void {
++    harness.scriptOutcome(`${task}/runs/triage#a1`, {
++      ok: true,
++      data: { kind: "story", rationale: "Routed concerns need an architect turn", citations: [] },
++    });
++    harness.scriptOutcome(`${task}/runs/infra#a1`, {
++      ok: true,
++      data: {
++        setup: [],
++        gates: [{ id: "test", command: "true" }],
++        testRunner: { command: "true", selectorArgs: [], junitArg: "" },
++      },
++    });
++    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, (run) => {
++      captured.planPrompt = run.prompt;
++      return {
++        ok: true,
++        data: {
++          iteration: 1,
++          milestones: [{ id: "m1", title: "M1" }],
++          itemOutlines: [
++            { slug: "keep", kind: "dev", title: "Keep", milestoneId: "m1" },
++            { slug: "seed", kind: "dev", title: "Seed", milestoneId: "m1" },
++            {
++              slug: "dependent",
++              kind: "dev",
++              title: "Dependent",
++              milestoneId: "m1",
++              deps: ["seed"],
++            },
++          ],
++        },
++      };
++    });
++    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
++      ok: true,
++      data: { status: "approved", summary: "Plan approved", suggestions: [] },
++    });
++    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
++      ok: true,
++      data: {
++        iteration: 1,
++        items: [
++          {
++            slug: "keep",
++            outlineRef: "keep",
++            kind: "dev",
++            title: "Keep",
++            assignment: "Keep the wave progressing",
++            milestone: "m1",
++            wave: 1,
++          },
++          {
++            slug: "seed",
++            outlineRef: "seed",
++            kind: "dev",
++            title: "Seed",
++            assignment: "Work named by the routed blocker",
++            milestone: "m1",
++            wave: 1,
++          },
++          {
++            slug: "dependent",
++            outlineRef: "dependent",
++            kind: "dev",
++            title: "Dependent",
++            assignment: "Declared dependent of the blocked seed",
++            milestone: "m1",
++            wave: 2,
++            deps: ["seed"],
++          },
++        ],
++      },
++    });
++  }
++
++  function scriptConcernConsult(
++    harness: FakeHarness,
++    task: string,
++    promptsSeen: string[]
++  ): void {
++    harness.scriptOutcome(`${task}/runs/consult-concern-${BLOCKER_CID}#a1`, (run) => {
++      promptsSeen.push(run.prompt);
++      return {
++        ok: true,
++        data: {
++          id: `decision-concern-${BLOCKER_CID}`,
++          context: "wave",
++          decision: "continue",
++          rationale: "Mitigate the migration before dependents run",
++          timestamp: "2026-01-01T00:00:00.000Z",
++        },
++      };
++    });
++  }
++
++  function scriptWaveCeremony(
++    harness: FakeHarness,
++    task: string,
++    captured: { waveReports: string[] },
++    opts: { failReportAt?: 1 | 2 } = {}
++  ): void {
++    let wave1ReportCalls = 0;
++    let wave2ReportCalls = 0;
++    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
++      ok: true,
++      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["keep"], summary: "Wave 1" },
++    });
++    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, (run) => {
++      wave1ReportCalls++;
++      if (opts.failReportAt === 1 && wave1ReportCalls === 1) {
++        return { ok: false, error: "architect wave report crashed" };
++      }
++      captured.waveReports.push(run.prompt);
++      return {
++        ok: true,
++        data: {
++          id: "dec-wave-1",
++          context: "wave",
++          decision: "continue",
++          timestamp: "2026-01-01T00:00:00.000Z",
++        },
++      };
++    });
++    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
++      ok: true,
++      data: { wave: 2, iteration: 1, status: "blocked", mergedItems: [], blockedItems: ["dependent"], summary: "Wave 2 blocked" },
++    });
++    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, (run) => {
++      wave2ReportCalls++;
++      if (opts.failReportAt === 2 && wave2ReportCalls === 1) {
++        return { ok: false, error: "architect wave report crashed" };
++      }
++      captured.waveReports.push(run.prompt);
++      return {
++        ok: true,
++        data: {
++          id: "dec-wave-2",
++          context: "wave",
++          decision: "continue",
++          timestamp: "2026-01-01T00:00:00.000Z",
++        },
++      };
++    });
++    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
++      ok: true,
++      data: { iteration: 1, status: "complete", summary: "Iteration verified" },
++    });
++    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
++      ok: true,
++      data: { iteration: 1, status: "complete", summary: "Delivery complete" },
++    });
++  }
++
++  it("writes one concern decision file and hydrates architect turns with routed concerns", async () => {
++    const task = "routing-consult";
++    seedTask(task);
++    const harness = new FakeHarness();
++    const captured: { planPrompt?: string; waveReports: string[] } = { waveReports: [] };
++    const consultPromptsSeen: string[] = [];
++
++    scriptIngestAndPlan(harness, task, captured);
++    scriptConcernConsult(harness, task, consultPromptsSeen);
++    scriptWaveCeremony(harness, task, captured);
++    harness.scriptOutcome(`${task}/items/keep/develop#a1`, {
++      ok: true,
++      data: { status: "ok", summary: "Kept the wave moving" },
++    });
++
++    const result = await runTask(
++      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
++      task
++    );
++
++    expect(result.status).toBe("done");
++
++    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
++    const deployedTaskDir = path.join(taskWtPath, ORCH, task);
++
++    // Exactly one canonical consult artifact, named by the routed concern.
++    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
++    const decision = await readYaml<Record<string, any>>(
++      path.join(deployedTaskDir, "decisions", `concern-${BLOCKER_CID}.yaml`)
++    );
++    expect(decision.decision).toBe("continue");
++
++    // One architect turn for the blocker concern, no turn for the risk concern.
++    expect(consultPromptsSeen).toHaveLength(1);
++    expect(consultPrompts(harness)).toHaveLength(1);
++    expect(consultPromptsSeen[0]).toContain(BLOCKER_CID);
++    expect(consultPromptsSeen[0]).toContain(BLOCKER_SUMMARY);
++
++    // Routed concerns reach the architect hydration for the plan and wave
++    // report turns without changing the open-only reviewer hydration.
++    expect(captured.planPrompt).toBeDefined();
++    expect(captured.planPrompt).toContain(BLOCKER_CID);
++    expect(captured.planPrompt).toContain(BLOCKER_SUMMARY);
++    expect(captured.planPrompt).toContain(ARCHITECT_CID);
++    expect(captured.planPrompt).toContain(ARCHITECT_SUMMARY);
++
++    expect(captured.waveReports).toHaveLength(2);
++    expect(captured.waveReports[0]).toContain(BLOCKER_CID);
++    expect(captured.waveReports[0]).toContain(BLOCKER_SUMMARY);
++  }, 30_000);
++
++  it("restart after a mid-iteration failure neither repeats the consult nor rewrites the decision", async () => {
++    const task = "routing-consult-restart";
++    seedTask(task);
++    const harness = new FakeHarness();
++    const captured: { planPrompt?: string; waveReports: string[] } = { waveReports: [] };
++    const consultPromptsSeen: string[] = [];
++
++    scriptIngestAndPlan(harness, task, captured);
++    scriptConcernConsult(harness, task, consultPromptsSeen);
++    scriptWaveCeremony(harness, task, captured, { failReportAt: 2 });
++    harness.scriptOutcome(`${task}/items/keep/develop#a1`, {
++      ok: true,
++      data: { status: "ok", summary: "Kept the wave moving" },
++    });
++
++    // Run 1 dies on wave 2's architect report, after the wave act consulted on
++    // the routed blocker and committed the decision artifact, but before the
++    // iteration finished.
++    const first = await runTask(
++      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
++      task
++    );
++    expect(first.status).toBe("failed");
++
++    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
++    const deployedTaskDir = path.join(taskWtPath, ORCH, task);
++    const decisionPath = path.join(deployedTaskDir, "decisions", `concern-${BLOCKER_CID}.yaml`);
++    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
++    expect(fs.existsSync(decisionPath)).toBe(true);
++    const beforeRestart = fs.readFileSync(decisionPath, "utf8");
++    expect(consultPrompts(harness)).toHaveLength(1);
++
++    // Run 2 restarts the same iteration; the existing decision artifact is the
++    // idempotency guard, so act phase must not consult or rewrite.
++    const second = await runTask(
++      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
++      task
++    );
++    expect(second.status).toBe("done");
++
++    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
++    expect(fs.readFileSync(decisionPath, "utf8")).toBe(beforeRestart);
++    expect(consultPrompts(harness)).toHaveLength(1);
++
++    // The restarted architect turn is hydrated with the routed concern.
++    expect(captured.waveReports.length).toBeGreaterThanOrEqual(1);
++    expect(captured.waveReports[captured.waveReports.length - 1]).toContain(BLOCKER_CID);
++    expect(captured.waveReports[captured.waveReports.length - 1]).toContain(BLOCKER_SUMMARY);
++  }, 30_000);
++});
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
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/004-review-r1-a1/meta.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/004-review-r1-a1/meta.yaml
new file mode 100644
index 0000000..852cd00
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/004-review-r1-a1/meta.yaml
@@ -0,0 +1,20 @@
+seq: 4
+name: review
+attempt: 1
+fixRound: 1
+agent: reviewer
+role: alt-workhorse
+models:
+  - opencode-go/muse-spark-1.3-contributor
+  - opencode-go/deepseek-v4.1-flash
+timeoutSec: 900
+status: ok
+startedAt: 2026-11-08T12:43:55.135Z
+session: 01a1bb2f-d163-7604-99d1-93fe9ee27702
+endedAt: 2026-11-08T13:00:25.446Z
+usage:
+  inputTokens: 88736
+  outputTokens: 60183
+  costUsd: 0.024787
+repairedFrom: simpler_repair
+traceRef: /home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/sessions/2026-11-08T12-43-55-619Z_01a1bb2f-d163-7604-99d1-93fe9ee27702.jsonl
diff --git a/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/004-review-r1-a1/output.yaml b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/004-review-r1-a1/output.yaml
new file mode 100644
index 0000000..ea5655b
--- /dev/null
+++ b/.factory/tasks/concerns-funnel/items/routing-architect-consult-v2/steps/004-review-r1-a1/output.yaml
@@ -0,0 +1,45 @@
+status: approved
+summary: Act-phase concern consult + hydration meets assignment; idempotent
+  single-file consult verified, no blocking defects.
+suggestions:
+  - detail: renderConcernsYaml receives full hydrationBytes (65536) as concerns-only
+      budget inside buildArchitectHydration, then tail-truncation preserves
+      concerns over plans/decisions. Under many concerns this crowds out
+      higher-signal sections. Use a capped sub-budget (e.g. 8000 like
+      step-runner open-concern default) for the concerns section.
+    disposition: optional
+    id: concerns-hydration-sub-budget
+    location:
+      file: plugins/software-factory/src/core/flows/iteration.ts
+      line: 178
+    summary: Cap concerns hydration section below full hydrationBytes
+  - detail: runConcernConsult interpolates concern.id raw into stepId and decisions
+      path while runNonItemConsult sanitizes seam. Engine ids (c-<hex>) are safe
+      today; sanitizing matches existing hardening and guards crafted concern
+      files.
+    disposition: optional
+    id: concern-stepid-sanitize
+    location:
+      file: plugins/software-factory/src/core/flows/consults.ts
+      line: 357
+    summary: Sanitize concern id in consult stepId/path
+  - detail: Barrel exports runItemConsult/runNonItemConsult but omits
+      runConcernConsult while iteration imports it directly from consults.js.
+      Export for API consistency.
+    disposition: optional
+    id: concern-consult-barrel-export
+    location:
+      file: plugins/software-factory/src/core/flows/index.ts
+      line: 7
+    summary: Export runConcernConsult from flows barrel
+  - detail: Fragment steps/architect-consult-nonitem instructs context non-item with
+      fix-item/accept-with-debt options, but stored artifact defaults context to
+      wave and tests use decision continue. No consumer reads concern decisions
+      yet so inert, but prompt/default mismatch will confuse future decision
+      consumers; align fragment choice or default context.
+    disposition: optional
+    id: concern-prompt-context-align
+    location:
+      file: plugins/software-factory/src/core/flows/consults.ts
+      line: 380
+    summary: Align concern consult prompt fragment with default decision context
diff --git a/plugins/software-factory/src/core/flows/consults.ts b/plugins/software-factory/src/core/flows/consults.ts
index 9499683..92fdb03 100644
--- a/plugins/software-factory/src/core/flows/consults.ts
+++ b/plugins/software-factory/src/core/flows/consults.ts
@@ -6,6 +6,7 @@ import type {
   PipelineConfig,
   ProjectConfig,
   SteerItemArtifact,
+  StoredConcernArtifact,
 } from "../artifacts.js";
 import type { Harness } from "../../harness/types.js";
 import { writeYamlAtomic } from "../records/io.js";
@@ -289,3 +290,121 @@ export async function runNonItemConsult(
 
   return { decision: decisionArtifact, sessionId: stepRes.sessionId };
 }
+
+export interface ConcernConsultParams {
+  task: string;
+  concern: StoredConcernArtifact;
+  taskDir: string;
+  taskWt: string;
+  repo: any;
+  harness: Harness;
+  pipeline: PipelineConfig;
+  project: ProjectConfig;
+  prompts: any;
+  architectSessionId?: string;
+  turnsSemaphore?: Semaphore;
+  budgetTracker?: BudgetTracker;
+  iteration?: number;
+}
+
+/**
+ * Runs one architect consult for a routed blocker concern (§18,
+ * adr-routing-derived-state). `decisions/concern-<cid>.yaml` is the canonical
+ * artifact; its existence is the idempotency guard, so a restarted act phase
+ * neither repeats the turn nor rewrites the decision.
+ */
+export async function runConcernConsult(
+  params: ConcernConsultParams
+): Promise<{ decision?: DecisionArtifact; sessionId?: string }> {
+  const {
+    task,
+    concern,
+    taskDir,
+    taskWt,
+    repo,
+    harness,
+    pipeline,
+    project,
+    prompts,
+    architectSessionId,
+    turnsSemaphore,
+    budgetTracker,
+    iteration,
+  } = params;
+
+  const decisionPath = path.join(taskDir, "decisions", `concern-${concern.id}.yaml`);
+  if (fs.existsSync(decisionPath)) {
+    return { sessionId: architectSessionId };
+  }
+
+  const runsDir = path.join(taskDir, "runs");
+  await fs.promises.mkdir(path.dirname(decisionPath), { recursive: true });
+  const affects = (concern.affects ?? []).join(", ");
+  const promptVars: Record<string, string> = {
+    task,
+    context: [
+      `Routed blocker concern ${concern.id}`,
+      `Summary: ${concern.summary}`,
+      `Severity: ${concern.severity}${affects ? `; blocks: ${affects}` : ""}`,
+    ].join("\n"),
+    feedback: concern.detail ?? concern.summary,
+    debt: "",
+  };
+
+  let decisionArtifact: DecisionArtifact | undefined;
+  const stepRes = await runAgentStep({
+    task,
+    stepId: `consult-concern-${concern.id}`,
+    stepFragment: "steps/architect-consult-nonitem",
+    agent: "architect",
+    role: "architect",
+    sessionMode: "reuse",
+    existingSessionId: architectSessionId,
+    cwd: taskWt,
+    taskDir,
+    recordsDir: runsDir,
+    repo,
+    harness,
+    pipeline,
+    project,
+    prompts,
+    promptVars,
+    turnsSemaphore,
+    budgetTracker,
+    iteration,
+    writeArtifact: async (output: unknown) => {
+      if (fs.existsSync(decisionPath)) return;
+      const raw = output as any;
+      decisionArtifact = {
+        id: String(raw?.id ?? `decision-concern-${concern.id}`),
+        context: (raw?.context ?? "wave") as DecisionContext,
+        decision: String(raw?.decision ?? "continue"),
+        timestamp: String(raw?.timestamp ?? new Date().toISOString()),
+        rationale: raw?.rationale,
+        text: raw?.text,
+        persist: raw?.persist,
+        outlines: raw?.outlines,
+        outline: raw?.outline,
+        debt: raw?.debt,
+        reason: raw?.reason,
+        question: raw?.question,
+        planDelta: raw?.planDelta,
+      };
+      await writeYamlAtomic(decisionPath, decisionArtifact);
+    },
+  });
+
+  if (!stepRes.ok || !decisionArtifact) {
+    throw new Error(`Concern consult for ${concern.id} failed: ${stepRes.meta.error || "no output"}`);
+  }
+
+  await appendJournal(taskDir, {
+    type: "decision_made",
+    context: "concern",
+    concern: concern.id,
+    decision: decisionArtifact.decision,
+    decisionPath,
+  });
+
+  return { decision: decisionArtifact, sessionId: stepRes.sessionId };
+}
diff --git a/plugins/software-factory/src/core/flows/iteration.ts b/plugins/software-factory/src/core/flows/iteration.ts
index abc124d..a58cfd2 100644
--- a/plugins/software-factory/src/core/flows/iteration.ts
+++ b/plugins/software-factory/src/core/flows/iteration.ts
@@ -19,7 +19,7 @@ import { ensureChildWorktree, commitAll, removeWorktree } from "../git/index.js"
 import { writeYamlAtomic, writeTextAtomic, readYaml, readText } from "../records/io.js";
 import { runAgentStep } from "./step-runner.js";
 import { writeQuestion } from "../steer.js";
-import { runItemConsult } from "./consults.js";
+import { runItemConsult, runConcernConsult } from "./consults.js";
 import { mergeItem } from "./merge-path.js";
 import { tickItemMachine } from "./item-machine.js";
 import { deriveItemState } from "../derive/item.js";
@@ -31,8 +31,10 @@ import { isTriagerAgent, resolveReviewAllowed } from "../review-policy.js";
 import {
   hydrateConcernsYaml,
   listConcernIds,
+  listConcerns,
   partitionSuggestions,
 } from "../concerns.js";
+import { renderConcernsYaml } from "../triage.js";
 import { checkPlanReviewRounds, checkIterations, checkAmendments } from "../loops.js";
 import { validateEdits } from "../plan/limits.js";
 import { applyEdits } from "../plan/apply.js";
@@ -166,6 +168,17 @@ async function buildArchitectHydration(
     }
   }
 
+  // 5. Concerns (adr-routing-derived-state): routed and open concerns give
+  // every architect turn the terse decision context the act phase acts on.
+  const actionableConcerns = (await listConcerns(taskDir)).filter(
+    (c) => c.status === "open" || c.status === "routed"
+  );
+  if (actionableConcerns.length > 0) {
+    parts.push(
+      `--- Concerns ---\n${renderConcernsYaml(actionableConcerns, maxBytes)}`
+    );
+  }
+
   const combined = parts.join("\n\n");
   if (combined.length <= maxBytes) {
     return combined;
@@ -173,6 +186,58 @@ async function buildArchitectHydration(
   return combined.slice(combined.length - maxBytes);
 }
 
+/**
+ * Act-phase routing (§18, adr-routing-derived-state): consult the architect
+ * once per routed blocker concern that blocks a pending item in this wave.
+ * The per-concern decision artifact is the guard, so repeated or restarted
+ * act passes neither repeat the turn nor rewrite the decision.
+ */
+interface RoutedConsultContext {
+  task: string;
+  taskDir: string;
+  taskWt: string;
+  repo: any;
+  harness: Harness;
+  pipeline: PipelineConfig;
+  project: ProjectConfig;
+  prompts: any;
+  architectSessionId?: string;
+  turnsSemaphore?: Semaphore;
+  budgetTracker?: BudgetTracker;
+  iteration: number;
+}
+
+async function consultRoutedBlockers(
+  ctx: RoutedConsultContext,
+  blockedSlugs: Iterable<string>
+): Promise<string | undefined> {
+  const blocked = new Set(blockedSlugs);
+  if (blocked.size === 0) return ctx.architectSessionId;
+
+  let sessionId = ctx.architectSessionId;
+  for (const concern of await listConcerns(ctx.taskDir)) {
+    if (concern.kind !== "blocker" || concern.status !== "routed") continue;
+    if (!(concern.affects ?? []).some((slug) => blocked.has(slug))) continue;
+    const res = await runConcernConsult({
+      task: ctx.task,
+      concern,
+      taskDir: ctx.taskDir,
+      taskWt: ctx.taskWt,
+      repo: ctx.repo,
+      harness: ctx.harness,
+      pipeline: ctx.pipeline,
+      project: ctx.project,
+      prompts: ctx.prompts,
+      architectSessionId: sessionId,
+      turnsSemaphore: ctx.turnsSemaphore,
+      budgetTracker: ctx.budgetTracker,
+      iteration: ctx.iteration,
+    });
+    sessionId = res.sessionId ?? sessionId;
+  }
+  return sessionId;
+}
+
 /**
  * Runs a full architect iteration (§8.4).
  */
@@ -739,6 +804,28 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
       continue;
     }
 
+    // Act-phase routing (§18): each routed blocker concern blocking a pending
+    // item in this wave gets one architect consult before work starts.
+    const consultCtx: RoutedConsultContext = {
+      task,
+      taskDir,
+      taskWt,
+      repo,
+      harness,
+      pipeline,
+      project,
+      prompts,
+      architectSessionId,
+      turnsSemaphore,
+      budgetTracker,
+      iteration,
+    };
+    architectSessionId = await consultRoutedBlockers(
+      consultCtx,
+      waveState.blocked.map((it) => it.slug)
+    );
+    consultCtx.architectSessionId = architectSessionId;
+
     await appendJournal(taskDir, { type: "wave_started", wave: w, iteration });
 
     // Run wave items until wave can merge or complete
@@ -811,6 +898,11 @@ export async function runIteration(params: IterationParams): Promise<IterationRe
         items: itemStates,
         blockedBy: await collectRoutedBlockers(taskDir),
       });
+      architectSessionId = await consultRoutedBlockers(
+        consultCtx,
+        waveState.blocked.map((it) => it.slug)
+      );
+      consultCtx.architectSessionId = architectSessionId;
       await refreshStateYaml({ taskDir, task, parentBranch, taskWt, pipeline });
     }
 
diff --git a/plugins/software-factory/test/engine/routing-architect-consult.test.ts b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
new file mode 100644
index 0000000..3eb7799
--- /dev/null
+++ b/plugins/software-factory/test/engine/routing-architect-consult.test.ts
@@ -0,0 +1,435 @@
+import { describe, it, expect, beforeEach, afterEach } from "bun:test";
+import fs from "node:fs";
+import path from "node:path";
+import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
+import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
+import { runTask } from "../../src/core/engine.js";
+import { Repo } from "../../src/core/git/repo.js";
+import { loadPromptLibrary } from "../../src/core/prompts.js";
+import { readYaml } from "../../src/core/records/io.js";
+import type {
+  PipelineConfig,
+  ProjectConfig,
+  StoredConcernArtifact,
+} from "../../src/core/artifacts.js";
+
+/**
+ * Act-phase routing (docs/factory.v2.md §18; adr-routing-derived-state).
+ *
+ * Derive owns the blocking effect of a `routed` blocker concern. The act phase
+ * owns the architect turn: when a wave act observes an item blocked by such a
+ * concern, it consults the architect once per concern and writes
+ * `decisions/concern-<cid>.yaml`. Existence of that canonical artifact is the
+ * guard, so a restart after a mid-iteration failure neither consults nor
+ * rewrites. Architect hydration (plan and wave report inputs) carries routed
+ * concerns as a terse `{id, summary, ...}` digest.
+ *
+ * Test-first contract for the new consult step: it runs an orchestration step
+ * named `consult-concern-<cid>` (harness label `<task>/runs/consult-concern-<cid>#a1`)
+ * and its rendered prompt names the concern id and summary.
+ */
+
+const ORCH = ".factory";
+const BLOCKER_CID = "c-0123456789";
+const ARCHITECT_CID = "c-9876543210";
+const BLOCKER_SUMMARY = "Database schema migration is pending";
+const ARCHITECT_SUMMARY = "Cache TTL assumption is unverified";
+
+type ConcernOverrides = Partial<StoredConcernArtifact> & { id: string };
+
+function storedConcern(overrides: ConcernOverrides): StoredConcernArtifact {
+  return {
+    kind: "blocker",
+    summary: `Concern ${overrides.id}`,
+    detail: "detail",
+    severity: "medium",
+    status: "routed",
+    disposition: "architect",
+    source: { record: "seed-concern", agent: "test" },
+    createdAt: "2026-01-01T00:00:00.000Z",
+    updatedAt: "2026-01-01T00:00:00.000Z",
+    ...overrides,
+  };
+}
+
+function writeConcern(taskDir: string, concern: StoredConcernArtifact): void {
+  const dir = path.join(taskDir, "concerns");
+  fs.mkdirSync(dir, { recursive: true });
+  fs.writeFileSync(path.join(dir, `${concern.id}.yaml`), JSON.stringify(concern, null, 2), "utf8");
+}
+
+function makePipeline(): PipelineConfig {
+  return {
+    models: {
+      roles: {
+        workhorse: { model: "deepseek-chat" },
+        "alt-workhorse": { model: "deepseek-chat" },
+        architect: { model: "deepseek-reasoner" },
+        "alt-architect": { model: "deepseek-reasoner" },
+        "task-reviewer": { model: "deepseek-chat" },
+        "wave-close-up": { model: "deepseek-chat" },
+        "plan-close-up": { model: "deepseek-chat" },
+        simpler: { model: "deepseek-chat" },
+      },
+    },
+    agents: {
+      triage: { role: "workhorse" },
+      infra: { role: "workhorse" },
+      architect: { role: "architect" },
+      "plan-reviewer": { role: "alt-architect" },
+      pm: { role: "alt-workhorse" },
+      developer: { role: "workhorse" },
+      reviewer: { role: "task-reviewer" },
+      "wave-close-up": { role: "wave-close-up" },
+      "plan-close-up": { role: "plan-close-up" },
+    },
+    flows: {
+      simple: { steps: [{ id: "develop", agent: "developer", role: "workhorse" }] },
+      story: {
+        dev: {
+          fixLoopTo: "develop",
+          steps: [{ id: "develop", agent: "developer", role: "workhorse" }],
+        },
+      },
+      spike: {},
+    },
+    limits: {
+      maxParallelItems: 2,
+      maxParallelTurns: 4,
+      maxStepAttempts: 2,
+      maxFixRounds: 2,
+      maxPlanReviewRounds: 1,
+      maxIterations: 3,
+    },
+  };
+}
+
+function decisionFiles(taskDir: string): string[] {
+  const dir = path.join(taskDir, "decisions");
+  if (!fs.existsSync(dir)) return [];
+  return fs.readdirSync(dir).filter((name) => name.endsWith(".yaml")).sort();
+}
+
+function consultPrompts(harness: FakeHarness): string[] {
+  return harness.calls
+    .filter(
+      (call): call is Extract<typeof call, { type: "run" }> =>
+        call.type === "run" && call.run.label.includes("consult-concern-")
+    )
+    .map((call) => call.run.prompt);
+}
+
+describe("Routing: architect consult and hydration", () => {
+  let tmpRepo: TmpRepo;
+  let worktreeRoot: string;
+  let repoObj: Repo;
+  let pipeline: PipelineConfig;
+  let project: ProjectConfig;
+  let prompts: ReturnType<typeof loadPromptLibrary>;
+
+  beforeEach(() => {
+    tmpRepo = createTmpRepo();
+    worktreeRoot = path.join(tmpRepo.dir + "-wt");
+    fs.mkdirSync(worktreeRoot, { recursive: true });
+    repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
+    pipeline = makePipeline();
+    project = { orchestrationFolder: ORCH, worktreeRoot };
+    prompts = loadPromptLibrary({
+      builtinDir: path.resolve(import.meta.dir, "../../agents"),
+      overrideDirs: [],
+    });
+  });
+
+  afterEach(() => {
+    tmpRepo.cleanup();
+  });
+
+  /**
+   * Seeds a task whose wave 1 has one routable item and one routed-blocker
+   * seed, and whose wave 2 holds the declared dependent of that seed.
+   */
+  function seedTask(task: string): string {
+    const taskDir = path.join(tmpRepo.dir, ORCH, task);
+    fs.mkdirSync(taskDir, { recursive: true });
+    fs.writeFileSync(path.join(taskDir, "INTENT.md"), `Routing consult for ${task}\n`, "utf8");
+    writeConcern(
+      taskDir,
+      storedConcern({
+        id: BLOCKER_CID,
+        kind: "blocker",
+        summary: BLOCKER_SUMMARY,
+        affects: ["seed"],
+      })
+    );
+    writeConcern(
+      taskDir,
+      storedConcern({
+        id: ARCHITECT_CID,
+        kind: "risk",
+        summary: ARCHITECT_SUMMARY,
+        affects: [],
+      })
+    );
+    tmpRepo.commit(`seed routed concerns for ${task}`);
+    return taskDir;
+  }
+
+  function scriptIngestAndPlan(
+    harness: FakeHarness,
+    task: string,
+    captured: { planPrompt?: string }
+  ): void {
+    harness.scriptOutcome(`${task}/runs/triage#a1`, {
+      ok: true,
+      data: { kind: "story", rationale: "Routed concerns need an architect turn", citations: [] },
+    });
+    harness.scriptOutcome(`${task}/runs/infra#a1`, {
+      ok: true,
+      data: {
+        setup: [],
+        gates: [{ id: "test", command: "true" }],
+        testRunner: { command: "true", selectorArgs: [], junitArg: "" },
+      },
+    });
+    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, (run) => {
+      captured.planPrompt = run.prompt;
+      return {
+        ok: true,
+        data: {
+          iteration: 1,
+          milestones: [{ id: "m1", title: "M1" }],
+          itemOutlines: [
+            { slug: "keep", kind: "dev", title: "Keep", milestoneId: "m1" },
+            { slug: "seed", kind: "dev", title: "Seed", milestoneId: "m1" },
+            {
+              slug: "dependent",
+              kind: "dev",
+              title: "Dependent",
+              milestoneId: "m1",
+              deps: ["seed"],
+            },
+          ],
+        },
+      };
+    });
+    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
+      ok: true,
+      data: { status: "approved", summary: "Plan approved", suggestions: [] },
+    });
+    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
+      ok: true,
+      data: {
+        iteration: 1,
+        items: [
+          {
+            slug: "keep",
+            outlineRef: "keep",
+            kind: "dev",
+            title: "Keep",
+            assignment: "Keep the wave progressing",
+            milestone: "m1",
+            wave: 1,
+          },
+          {
+            slug: "seed",
+            outlineRef: "seed",
+            kind: "dev",
+            title: "Seed",
+            assignment: "Work named by the routed blocker",
+            milestone: "m1",
+            wave: 1,
+          },
+          {
+            slug: "dependent",
+            outlineRef: "dependent",
+            kind: "dev",
+            title: "Dependent",
+            assignment: "Declared dependent of the blocked seed",
+            milestone: "m1",
+            wave: 2,
+            deps: ["seed"],
+          },
+        ],
+      },
+    });
+  }
+
+  function scriptConcernConsult(
+    harness: FakeHarness,
+    task: string,
+    promptsSeen: string[]
+  ): void {
+    harness.scriptOutcome(`${task}/runs/consult-concern-${BLOCKER_CID}#a1`, (run) => {
+      promptsSeen.push(run.prompt);
+      return {
+        ok: true,
+        data: {
+          id: `decision-concern-${BLOCKER_CID}`,
+          context: "wave",
+          decision: "continue",
+          rationale: "Mitigate the migration before dependents run",
+          timestamp: "2026-01-01T00:00:00.000Z",
+        },
+      };
+    });
+  }
+
+  function scriptWaveCeremony(
+    harness: FakeHarness,
+    task: string,
+    captured: { waveReports: string[] },
+    opts: { failReportAt?: 1 | 2 } = {}
+  ): void {
+    let wave1ReportCalls = 0;
+    let wave2ReportCalls = 0;
+    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
+      ok: true,
+      data: { wave: 1, iteration: 1, status: "complete", mergedItems: ["keep"], summary: "Wave 1" },
+    });
+    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, (run) => {
+      wave1ReportCalls++;
+      if (opts.failReportAt === 1 && wave1ReportCalls === 1) {
+        return { ok: false, error: "architect wave report crashed" };
+      }
+      captured.waveReports.push(run.prompt);
+      return {
+        ok: true,
+        data: {
+          id: "dec-wave-1",
+          context: "wave",
+          decision: "continue",
+          timestamp: "2026-01-01T00:00:00.000Z",
+        },
+      };
+    });
+    harness.scriptOutcome(`${task}/runs/wave-close-up-1-2#a1`, {
+      ok: true,
+      data: { wave: 2, iteration: 1, status: "blocked", mergedItems: [], blockedItems: ["dependent"], summary: "Wave 2 blocked" },
+    });
+    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-2#a1`, (run) => {
+      wave2ReportCalls++;
+      if (opts.failReportAt === 2 && wave2ReportCalls === 1) {
+        return { ok: false, error: "architect wave report crashed" };
+      }
+      captured.waveReports.push(run.prompt);
+      return {
+        ok: true,
+        data: {
+          id: "dec-wave-2",
+          context: "wave",
+          decision: "continue",
+          timestamp: "2026-01-01T00:00:00.000Z",
+        },
+      };
+    });
+    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
+      ok: true,
+      data: { iteration: 1, status: "complete", summary: "Iteration verified" },
+    });
+    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
+      ok: true,
+      data: { iteration: 1, status: "complete", summary: "Delivery complete" },
+    });
+  }
+
+  it("writes one concern decision file and hydrates architect turns with routed concerns", async () => {
+    const task = "routing-consult";
+    seedTask(task);
+    const harness = new FakeHarness();
+    const captured: { planPrompt?: string; waveReports: string[] } = { waveReports: [] };
+    const consultPromptsSeen: string[] = [];
+
+    scriptIngestAndPlan(harness, task, captured);
+    scriptConcernConsult(harness, task, consultPromptsSeen);
+    scriptWaveCeremony(harness, task, captured);
+    harness.scriptOutcome(`${task}/items/keep/develop#a1`, {
+      ok: true,
+      data: { status: "ok", summary: "Kept the wave moving" },
+    });
+
+    const result = await runTask(
+      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
+      task
+    );
+
+    expect(result.status).toBe("done");
+
+    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
+    const deployedTaskDir = path.join(taskWtPath, ORCH, task);
+
+    // Exactly one canonical consult artifact, named by the routed concern.
+    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
+    const decision = await readYaml<Record<string, any>>(
+      path.join(deployedTaskDir, "decisions", `concern-${BLOCKER_CID}.yaml`)
+    );
+    expect(decision.decision).toBe("continue");
+
+    // One architect turn for the blocker concern, no turn for the risk concern.
+    expect(consultPromptsSeen).toHaveLength(1);
+    expect(consultPrompts(harness)).toHaveLength(1);
+    expect(consultPromptsSeen[0]).toContain(BLOCKER_CID);
+    expect(consultPromptsSeen[0]).toContain(BLOCKER_SUMMARY);
+
+    // Routed concerns reach the architect hydration for the plan and wave
+    // report turns without changing the open-only reviewer hydration.
+    expect(captured.planPrompt).toBeDefined();
+    expect(captured.planPrompt).toContain(BLOCKER_CID);
+    expect(captured.planPrompt).toContain(BLOCKER_SUMMARY);
+    expect(captured.planPrompt).toContain(ARCHITECT_CID);
+    expect(captured.planPrompt).toContain(ARCHITECT_SUMMARY);
+
+    expect(captured.waveReports).toHaveLength(2);
+    expect(captured.waveReports[0]).toContain(BLOCKER_CID);
+    expect(captured.waveReports[0]).toContain(BLOCKER_SUMMARY);
+  }, 30_000);
+
+  it("restart after a mid-iteration failure neither repeats the consult nor rewrites the decision", async () => {
+    const task = "routing-consult-restart";
+    seedTask(task);
+    const harness = new FakeHarness();
+    const captured: { planPrompt?: string; waveReports: string[] } = { waveReports: [] };
+    const consultPromptsSeen: string[] = [];
+
+    scriptIngestAndPlan(harness, task, captured);
+    scriptConcernConsult(harness, task, consultPromptsSeen);
+    scriptWaveCeremony(harness, task, captured, { failReportAt: 2 });
+    harness.scriptOutcome(`${task}/items/keep/develop#a1`, {
+      ok: true,
+      data: { status: "ok", summary: "Kept the wave moving" },
+    });
+
+    // Run 1 dies on wave 2's architect report, after the wave act consulted on
+    // the routed blocker and committed the decision artifact, but before the
+    // iteration finished.
+    const first = await runTask(
+      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
+      task
+    );
+    expect(first.status).toBe("failed");
+
+    const taskWtPath = path.join(worktreeRoot, `topic_${task}`);
+    const deployedTaskDir = path.join(taskWtPath, ORCH, task);
+    const decisionPath = path.join(deployedTaskDir, "decisions", `concern-${BLOCKER_CID}.yaml`);
+    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
+    expect(fs.existsSync(decisionPath)).toBe(true);
+    const beforeRestart = fs.readFileSync(decisionPath, "utf8");
+    expect(consultPrompts(harness)).toHaveLength(1);
+
+    // Run 2 restarts the same iteration; the existing decision artifact is the
+    // idempotency guard, so act phase must not consult or rewrite.
+    const second = await runTask(
+      { harness, repo: repoObj, project, pipelineFor: async () => pipeline, prompts },
+      task
+    );
+    expect(second.status).toBe("done");
+
+    expect(decisionFiles(deployedTaskDir)).toEqual([`concern-${BLOCKER_CID}.yaml`]);
+    expect(fs.readFileSync(decisionPath, "utf8")).toBe(beforeRestart);
+    expect(consultPrompts(harness)).toHaveLength(1);
+
+    // The restarted architect turn is hydrated with the routed concern.
+    expect(captured.waveReports.length).toBeGreaterThanOrEqual(1);
+    expect(captured.waveReports[captured.waveReports.length - 1]).toContain(BLOCKER_CID);
+    expect(captured.waveReports[captured.waveReports.length - 1]).toContain(BLOCKER_SUMMARY);
+  }, 30_000);
+});

## Review Feedback
Quality gates failed on merge path for routing-architect-consult-v2: test

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
- outlines (array of object, optional): Decomposed item outlines when decision is split, or new/replacement item outlines when decision is amend (PlanItemOutline shape: slug, kind, title, description?, milestoneId?, deps?, etc.)
- removeItemSlugs (array of string, optional): Slugs of pending items to remove / supersede when decision is amend
- outline (object, optional): Item outline to schedule when decision is fix-item
- debt (string, optional): Technical debt description when decision is accept-with-debt
- reason (string, optional): Reason for abandonment or abort
- question (string, optional): Specific question for human operator when decision is human-async or blocked
- planDelta (string, optional): Plan delta or amendment directives when decision is amend
- timestamp (string, optional): ISO timestamp (assigned by engine if omitted)
