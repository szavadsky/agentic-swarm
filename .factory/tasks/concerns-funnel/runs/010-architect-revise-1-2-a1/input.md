# Step: Architect Revise

## Goal
Revise the iteration execution plan (`plan-N.yaml`) in response to adversarial feedback from the plan reviewer.

## Rules
- Exploration budget: evaluate review feedback against the plan and the prepared context pack (`# Context Pack — concerns-funnel (Spec Item 18)

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
`). Read code ONLY to verify a specific reviewer objection (few targeted reads, never broad scans or chunked whole-file reading). Translate newly identified unknowns into spike outlines or uncertainties instead of exploring in-turn. Keep terse.
- Feedback resolution: evaluate each review suggestion. Address valid concerns by adjusting milestones, scenarios, directional interfaces, or adding spikes.
- Architectural authority: for suggestions you deliberately reject or defer, provide clear, defensible technical rationale.
- Maintain plan bounds: keep milestone counts and dependencies within configured limits.
- Output: yield the updated plan matching `plan.schema.json`.

## Current Plan
{
  "iteration": 1,
  "milestones": [
    {
      "directionalInterfaces": [
        "artifacts.ts: Concern, RemarkableDecision, StoredConcernArtifact, ReviewDisposition+dismiss, PlanAdr.blocking, PipelineConfig.humanInvolvement plus concerns raise/thresholds, reviewPolicy.default canonical",
        "config/schemas: developer-output, fact-finder-output, review new-concerns, plan, decisions, wave/plan-closeup with concernResolutions, pipeline; shared concern partial",
        "src/core/concerns.ts: concernFingerprint over identity fields, aggregateConcerns with merge, listOpenConcerns, applyConcernTriage exact-id, applyCloseupResolutions",
        "src/core/review-policy.ts: resolveReviewAllowed plus generateReviewSchema dismiss for triagers; immediate taskWt commit helper"
      ],
      "id": "m1-contracts-aggregate",
      "scenarios": [
        "Given a developer step emitting a blocker concern When the step commits Then concerns/c-<fp10>.yaml exists with status open and source.record pointing at the step record",
        "Given the same concern re-emitted on retry When aggregation runs Then exactly one file exists and prior dismissed or routed status is preserved",
        "Given a concern missing severity and detail When validation runs Then severity defaults to medium and detail defaults to summary and the file is created",
        "Given a concern with unknown kind When validation runs Then the step errors and no concerns file is written while existing files stay untouched",
        "Given fact-finder, review, plan, and consult outputs carrying concerns plus a remarkable decision When steps commit Then each aggregates to concerns/c-*.yaml or concerns/rm-*.yaml with open status and source pointer"
      ],
      "title": "Contracts and aggregation foundation"
    },
    {
      "directionalInterfaces": [
        "prompt-vars KNOWN_VARS plus descriptions: concernsYaml unified input, humanInvolvementCriteria mode fragment; fragments steps/review and steps/plan-review",
        "item-machine.ts review and iteration.ts plan-review promptVars plus writeArtifact triage persistence with exact-id match",
        "agents/reviewer.md, plan-reviewer.md, criteria/dispositions.md, criteria/human-involvement.md terse confirm/dismiss/condense plus blocking table",
        "config/pipeline.default.yaml commented autonomous/principal/detailed presets plus concerns raise/threshold examples"
      ],
      "id": "m2-triage-modes",
      "scenarios": [
        "Given open item concerns When review runs Then steps/review receives concernsYaml with id/kind/severity/summary/affects and terse triage instructions",
        "Given reviewer emits suggestion matching a concern id with disposition dismiss and reason When review commits Then that file has status dismissed plus dismissReason and no mailbox, debt, or blocked effect occurs",
        "Given reviewer emits a matching suggestion with fix, architect, human-*, or tech-debt disposition When review commits Then that file has status routed with the disposition persisted",
        "Given architect plan concerns and a remarkable rm-* file When plan-review runs Then plan-reviewer triages with the same vocabulary and non-dismissed files become routed",
        "Given pipeline.yaml humanInvolvement principal When reviewer and architect prompts render Then the mode criteria fragment is included and preflightPrompts passes"
      ],
      "title": "Reviewer triage and modes"
    },
    {
      "directionalInterfaces": [
        "scheduler.blockedByConcern(items, concernBlocked:Set) pure plus deriveWave/deriveItem integration cascading only over declared deps",
        "act-phase routing: consult decisions/ write on newly blocked, buildArchitectHydration concernsYaml digest, steer writeQuestion for human-*/blocking ADR",
        "derive openSteerQuestions split into blocking versus digest; classify never blocks on awareness; debt includes routed tech-debt"
      ],
      "id": "m3-routing",
      "scenarios": [
        "Given a routed blocker whose affects names a declared dependent When state derives Then the dependent derives blocked and the act phase writes exactly one architect consult decision",
        "Given a routed blocker whose affects names a non-dependency When state derives Then no item derives blocked from it",
        "Given a routed architect concern When the next architect turn builds hydration Then its input digest contains that concern id and summary",
        "Given routed human-async, human-stop, and human-awareness concerns When routing runs Then async and stop write mailbox entries with blocks while awareness writes blocks empty and the engine continues without halt",
        "Given plan ADRs blocking true and false under autonomous mode When plan commits Then the blocking ADR creates a mailbox question with blocks while the remarkable ADR appears only in the digest"
      ],
      "title": "Routing to blocked, architect, mailbox, debt"
    },
    {
      "directionalInterfaces": [
        "closeup schemas concernResolutions resolve/carry/propagate; iteration.ts concernsYaml hydration capped max(500,min(diffBytes,2000)) bytes; applyCloseupResolutions plus architect confirm",
        "engine.ts runChildTask propagateEpicConcerns condensed parent copies with source.epic per spike findings",
        "derive/task.ts toStateArtifact().concerns counts with missing/corrupt handling; cli/status.ts Concerns plus Blocking versus Digest rendering"
      ],
      "id": "m4-funnel-surface",
      "replanAfter": true,
      "scenarios": [
        "Given open concerns at wave end When wave-close-up runs Then its prompt receives concernsYaml within the byte budget and its concernResolutions are persisted pending architect confirm",
        "Given a simple item with open concerns and no reviewer When wave-close-up runs Then those concerns are triaged there with tech-debt auto-routed to debt and architect carried to hydration",
        "Given a child epic finishing with one dismissed and one open epic concern When runChildTask completes Then the parent gains exactly one condensed copy with source.epic hydrating the saga architect input",
        "Given concerns in mixed statuses plus a corrupt yaml file When state refreshes and factory status runs Then state.yaml shows open/dismissed/routed/resolved counts skipping the corrupt file and CLI shows Concerns plus separate Blocking and Digest sections"
      ],
      "title": "Funnel, close-ups, saga, surfacing"
    },
    {
      "directionalInterfaces": [
        "docs/ARCHITECTURE.md section 1 row 18 plus 6.2 concerns/ plus section 8 funnel/routing/modes, README.md, config commentary"
      ],
      "id": "m5-docs",
      "scenarios": [
        "Given implementation complete When docs are read Then ARCHITECTURE.md, README, and config commentary describe concerns lifecycle, funnel, ADRs, modes, and status counts with terse prompts",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "title": "Docs and suite consolidation"
    }
  ],
  "uncertainties": [
    {
      "description": "Funnel byte budget source, floor, and bytes-vs-chars unit needed before close-up hydration implementation.",
      "id": "u-text-budget",
      "spikeOutlines": [
        "test-assumptions spike-text-budget verifies max(500,min(diffBytes,2000)) bytes with item versus wave diff source"
      ]
    },
    {
      "description": "Epic propagation mechanism plus taskWt commit atomicity/restart behavior and pure-derive versus act-phase boundary needed before blocker derive and saga propagation.",
      "id": "u-saga-propagation",
      "spikeOutlines": [
        "fact-finder spike-saga-commit verifies parent-copy propagation, immediate taskWt commit, parallel dedup, and consult trigger placement"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "test-assumptions: measure item/wave diff bytes vs concern detail sizes in fixtures; confirm cap max(500,min(diffBytes,2000)) bytes, floor behavior on zero-diff, UTF-8 bytes unit. Finding record only, no prod code; gates funnel-closeups.",
      "kind": "test-assumptions",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "spike-text-budget",
      "title": "Spike: funnel byte budget"
    },
    {
      "deps": [],
      "description": "fact-finder: verify runChildTask commit point and parent hydration read, taskWt immediate-commit race under parallel items, restart recovery, and pure-derive vs act-phase consult boundary. Finding record only; gates routing-blocker-derive and saga-propagate.",
      "kind": "fact-finder",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "spike-saga-commit",
      "title": "Spike: saga propagation, commit, derive boundary"
    },
    {
      "deps": [],
      "description": "Types plus schemas for every producer: developer-output, fact-finder-output, review new-concerns, plan, decisions, wave/plan-closeup with concernResolutions, pipeline humanInvolvement plus concerns raise/thresholds. Canonical reviewPolicy.default plus resolveReviewAllowed and generateReviewSchema dismiss for triagers. Tests: typecheck, preflight, repair missing severity/detail to defaults vs reject unknown kind with no file write.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-contracts",
      "title": "Concern contracts and canonical review policy"
    },
    {
      "deps": [
        "concerns-contracts"
      ],
      "description": "src/core/concerns.ts with fingerprint-merge, aggregateConcerns, listOpenConcerns, applyConcernTriage exact-id, applyCloseupResolutions, atomic YAML plus immediate taskWt commit. Wire develop/qa/review/simple and architect/plan paths. Behavior tests: open plus source, retry dedup, reword merges preserving dismissed/routed, remarkable rm-* aggregate. Run TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-store",
      "title": "Concerns store with merge and commit"
    },
    {
      "deps": [
        "concerns-store"
      ],
      "description": "Item reviewer triage with unified concernsYaml var in steps/review, exact-id transitions open to dismissed/routed, QA explicitly non-triager, terse reviewer criteria. Behavior tests: dismiss with reason no routing, routed dispositions persist, unknown suggestion ids treated as normal findings.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "reviewer-triage",
      "title": "Workhorse reviewer triage"
    },
    {
      "deps": [
        "concerns-store"
      ],
      "description": "Architect path: aggregate plan/revise concerns plus remarkable, hydrate steps/plan-review with concernsYaml, same exact-id dismiss vocabulary in plan-reviewer.md. Behavior tests: architect concern dismissed vs routed, remarkable rm-* triaged, non-dismissed becomes routed not open.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "plan-reviewer-triage",
      "title": "Plan-reviewer triage"
    },
    {
      "deps": [
        "concerns-contracts"
      ],
      "description": "humanInvolvement plus concerns raise/thresholds schema, loader/merge, commented autonomous/principal/detailed presets with blocking table, agents/criteria/human-involvement.md terse fragment, KNOWN_VARS humanInvolvementCriteria wired into reviewer and architect prompts. Behavior tests: mode switch changes criteria and blocking-ADR behavior; preflight green. Precedes all routing.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "modes-prompts",
      "title": "Modes, thresholds, prompt wiring"
    },
    {
      "deps": [
        "reviewer-triage",
        "plan-reviewer-triage",
        "modes-prompts",
        "spike-saga-commit"
      ],
      "description": "Pure derive only: scheduler.blockedByConcern(items, concernBlocked) plus deriveWave/deriveItem integration cascading only over declared deps. No writes in derive. Behavior tests: dependent derives blocked, non-dep unaffected, transitive only via deps.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-blocker-derive",
      "title": "Blocker derive"
    },
    {
      "deps": [
        "routing-blocker-derive",
        "modes-prompts"
      ],
      "description": "Act phase only: consult decisions/ write once on newly blocked plus architect-disposition digest consumed by buildArchitectHydration for wave-report and next plan. Behavior tests: blocked triggers single consult file, architect digest appears in next architect input.",
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
      "description": "human-async with blocks [item], human-stop with blocks including task and blocked terminal plus wave halt, human-awareness with blocks [] never blocking, routed tech-debt into deriveTaskState debt. Behavior tests: mailbox files per disposition, awareness engine continues, debt includes [item] summary.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-human-debt",
      "title": "Human mailbox and debt routing"
    },
    {
      "deps": [
        "routing-human-debt",
        "modes-prompts"
      ],
      "description": "Full ADR md title/context/decision/consequences/blocking, blocking routed per mode table, remarkable digest-only never waiting. Behavior tests: blocking creates q-* with blocks, remarkable appears only in digest.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "adr-blocking-digest",
      "title": "Blocking vs remarkable ADRs"
    },
    {
      "deps": [
        "routing-architect-consult",
        "adr-blocking-digest",
        "spike-text-budget"
      ],
      "description": "Hydrate wave/plan-close-up and architect reports with concernsYaml capped per spike, concernResolutions writeArtifact with architect confirm resolve/carry/propagate, simple-item triage at wave-close-up with auto-route fallback. Behavior tests: close-up lists within budget, resolutions applied, simple concerns triaged.",
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
      "description": "runChildTask propagation per spike findings: condensed parent copies with source.epic hydrating saga architect next turn. Behavior tests: epic undismissed concern reaches parent concerns/ and saga input; dismissed stays local.",
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
      "description": "Sole owner of StateArtifact.concerns {open,dismissed,routed,resolved}, state.schema, toStateArtifact and refreshStateYaml, missing dir yields zeros, corrupt yaml skipped. CLI renders Concerns counts plus separate Blocking vs Digest sections. Behavior tests: counts, missing/corrupt handling, CLI sections.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "slug": "status-state-surface",
      "title": "State counts and status surfacing"
    },
    {
      "deps": [
        "funnel-closeups",
        "saga-propagate",
        "status-state-surface",
        "modes-prompts"
      ],
      "description": "Update ARCHITECTURE.md section 1 row 18 plus 6.2 plus 8, README, config commentary; debloat-check prompts; consolidate test/engine/concerns-funnel.test.ts plus steer/CLI coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test.",
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
      "assumption": "Concern identity excludes detail and severity per adr-fingerprint-merge; reworded detail merges instead of duplicating.",
      "why": "Prevents trivial-reword duplicates while preserving severity escalation and triage status."
    },
    {
      "assumption": "Epic to saga propagation defaults to condensed parent copies with source.epic, subject to spike-saga-commit confirmation before saga-propagate runs.",
      "why": "Parent hydration already reads parent concerns/; spike verifies commit point and cleanup survival."
    },
    {
      "assumption": "Per-mode blocking table in adr-humaninvolvement-config is authoritative for iteration 1; raise allowlist defaults to all agents.",
      "why": "Unblocks M3 routing without waiting for operator tuning; task pipeline.yaml can override."
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
      "description": "reviewAllowed resolved in two places with non-canonical allowedDispositions key, so per-agent dismiss could fail schema validation.",
      "id": "td-reviewpolicy-divergence",
      "resolution": "Fix in concerns-contracts: canonical reviewPolicy.default, legacy alias, single resolveReviewAllowed owner used by prompt and schema paths."
    },
    {
      "category": "impacting",
      "description": "ADR writer persists only title plus context and PlanAdr lacks blocking.",
      "id": "td-adr-md-truncated",
      "resolution": "Fix in adr-blocking-digest: full md with decision, consequences, blocking plus schema and digest routing."
    },
    {
      "category": "impacting",
      "description": "human-awareness and human-stop ignored and debt derivation ignores routed concerns; status lists digest as blocking.",
      "id": "td-human-debt-gaps",
      "resolution": "Fix in routing-human-debt and status-state-surface: stop blocked semantics, awareness digest with empty blocks, debt from routed tech-debt, Blocking versus Digest split."
    }
  ],
  "adrs": [
    {
      "context": "Item steps commit only childWt while concerns/ lives on taskWt; parallel items share taskDir and retries must not duplicate or lose triage.",
      "decision": "Write directly to taskWt/{task}/concerns/ in writeArtifact seams with writeYamlAtomic per file, then commit taskWt immediately after the item step when concerns/ or steer/ changed (factory(task): concerns message). Parallel-safe: distinct fingerprints are distinct files; same fingerprint merges without clobbering dismissed/routed status. Restart re-reads files idempotently.",
      "id": "adr-concern-store-taskwt",
      "title": "Direct taskWt writes with immediate taskWt commit"
    },
    {
      "context": "Triage reuses suggestions[]; review id is free-form, QA role unclear, M2 stay-open contradicted M3 routed.",
      "decision": "Exact-id match only: suggestion.id === c-<hash10> or rm-<hash10> triages that concern; all other ids are normal findings. Transitions: open -> dismissed (dismiss + reason) | routed (any other disposition persisted) -> resolved (close-up/architect or human answer). QA never triages; only reviewer, plan-reviewer, close-up chain.",
      "id": "adr-triage-suggestions-dismiss",
      "title": "Exact-id triage with open-routed-resolved transitions"
    },
    {
      "context": "derive/* must stay pure but blocker side effects (consult write) were planned inside derive/scheduler.",
      "decision": "Pure derive: deriveWaveState and scheduler.blockedByConcern(items, concernBlocked:Set) take precomputed routed-blocker sets and cascade only over declared deps. All writes (consult decisions/, mailbox, concern status) happen in act phase: triage writeArtifact and wave-act check for newly blocked.",
      "id": "adr-routing-derived-state",
      "title": "Pure derive plus act-phase routing writes"
    },
    {
      "context": "Digest must reuse mailbox without blocking or spamming fire-test status.",
      "decision": "Digest entries are steer/tousertoreview entries with disposition human-awareness and blocks:[]. derive splits openSteerQuestions into blocking (blocks.length>0) vs digest (empty blocks + awareness); classify never blocks on awareness; status renders separate Blocking vs Digest sections.",
      "id": "adr-digest-mailbox",
      "title": "Digest as filtered non-blocking mailbox view"
    },
    {
      "context": "Spec needs autonomous/principal/detailed presets plus raise allowlist and severity thresholds; pipeline root is closed.",
      "decision": "Top-level PipelineConfig.humanInvolvement (default autonomous) plus PipelineConfig.concerns {raiseAllowlist?: string[], minDigestSeverity?, minBlockingSeverity?}. Per-mode blocking table: autonomous blocks only on blocking ADR or high human-stop; principal adds human-async and high severity; detailed adds all human-*. Criteria fragment agents/criteria/human-involvement.md carries the table tersely.",
      "id": "adr-humaninvolvement-config",
      "title": "Modes plus raise and severity config with blocking table"
    },
    {
      "context": "Funnel rule needs a mechanical bound that never yields empty digests on zero-diff steps.",
      "decision": "Prompt condensing plus byte-cap max(500, min(diffBytes, 2000)) UTF-8 bytes applied only to hydrated promptVars. Diff source: item diff for review triage, wave aggregated diff for close-ups. Floor 500 guarantees non-empty digest. Stored artifact never truncated.",
      "id": "adr-funnel-text-budget",
      "title": "Hydration byte-cap with floor"
    },
    {
      "context": "PipelineConfig type says {default,[agent]} but flows read .allowedDispositions, which the schema treats as an agent name.",
      "decision": "Canonical key is reviewPolicy.default. Legacy reviewPolicy.allowedDispositions is a read-alias for default during one iteration. Single owner src/core/review-policy.ts resolveReviewAllowed(pipeline, agent) used by item-machine, step-runner, and iteration for both prompt criteria and generateReviewSchema.",
      "id": "adr-reviewpolicy-canonical",
      "title": "Canonical reviewPolicy.default with single resolver"
    },
    {
      "context": "Hashing detail/severity duplicates on rewording; excluding them loses updates.",
      "decision": "Stable id c-{sha1-10} over {kind, normalizedSummary, location, sortedAffects} excluding detail and severity. Normalization: trim, collapse whitespace, lowercase summary. Re-emit merges: detail keeps longer/latest, severity keeps max, updatedAt and source.lastSeen advance, never overwrites dismissed/routed/resolved except via triage or close-up resolution.",
      "id": "adr-fingerprint-merge",
      "title": "Fingerprint identity plus merge policy"
    },
    {
      "context": "Close-up schemas are closed and wave-close-up has no reviewer, yet spec needs close-up re-triage; simple items have no reviewer at all.",
      "decision": "Add concernResolutions?: [{id, action: resolve|carry|propagate, note?}] plus concerns[]/remarkable[] producer fields to wave/plan-closeup schemas. Wave-close-up proposes resolutions via applyCloseupResolutions; architect-wave-report confirms. Simple-item open concerns are triaged at wave-close-up with auto-route fallback (tech-debt to debt, architect to hydration, blocker/human carried).",
      "id": "adr-closeup-retriage",
      "title": "Close-up resolution contract and simple-item triage"
    },
    {
      "context": "Remarkable {chosen,alternatives,why} had two candidate stores and no scenario.",
      "decision": "Authoritative store is concerns/rm-{hash10}.yaml with RemarkableDecision plus status and source. Triaged with the same suggestions[] dismiss vocabulary via exact-id match. Routed remarkables go digest-only unless elevated to blocking ADR.",
      "id": "adr-remarkable-store",
      "title": "Remarkable decisions in concerns/rm- files"
    },
    {
      "context": "human-stop currently behaves fix-like running; derive blocks only on task refs, so halt path is undefined.",
      "decision": "human-stop writes mailbox with blocks=[affected items, task when task-level] and item-machine maps it to blocked terminal; derive marks task blocked when any open stop blocks the task, halting wave scheduling until answered or dismissed. This is a steering halt, not budget exit 10. Awareness with blocks:[] never enters blocked sets.",
      "id": "adr-human-stop",
      "title": "Human-stop blocked semantics"
    }
  ]
}

## Plan Review Feedback
{
  "status": "changes_requested",
  "summary": "Bounds pass (5/8 milestones, 15/50 items, unique slugs, acyclic) but triage/routing/funnel contracts ambiguous, scenarios unfalsifiable, spike ordering broken",
  "suggestions": [
    {
      "id": "triage-findings-conflation",
      "disposition": "fix",
      "summary": "suggestions[] reuse conflates concern routing with fix-loop/mailbox/approval triggers",
      "detail": "Exact-id partitions triage vs findings but hasAsync/hasIssues/mailbox/plan-approval process ALL suggestions (item-machine 711-760, iteration 481). Routing as fix would spuriously trigger fix-loop/plan-revise; routing as human-async double-writes mailbox (concern route + normal handling). Need partition contract: triage ids update concerns/ only, excluded from fix-loop/approval triggers, mailbox dedup; define fix-on-concern-id semantics.",
      "location": {
        "file": "plugins/software-factory/src/core/flows/item-machine.ts",
        "line": 748
      }
    },
    {
      "id": "tech-debt-disposition-invalid",
      "disposition": "fix",
      "summary": "Plan invents tech-debt disposition absent from ReviewDisposition enum",
      "detail": "M2 scenario lists fix/architect/human-*/tech-debt dispositions and M4 auto-routes tech-debt, but ReviewDisposition is fix|optional|architect|human-awareness|human-async|human-stop with no tech-debt. Breaks generateReviewSchema enum validation. Must define debt routing as (kind==tech-debt && routed) or optional-disposition, or add new disposition with policy/schema/handler updates.",
      "location": {
        "file": "plugins/software-factory/src/core/artifacts.ts",
        "line": 288
      }
    },
    {
      "id": "reviewpolicy-resolver-dismiss",
      "disposition": "fix",
      "summary": "ReviewPolicy precedence and dismiss injection for triagers undefined",
      "detail": "Plan promises canonical reviewPolicy.default + dismiss for triagers but omits precedence (per-agent > default > builtin), dismiss injection rule (auto-append for triagers vs explicit allow), and QA exclusion. Current item-machine fallback is legacy ?? agent ?? builtin (wrong order) and step-runner reads only legacy key; generateReviewSchema has no dismiss. Need resolveReviewAllowed(pipeline,agent,isTriager) contract used by prompt+schema paths.",
      "location": {
        "file": "plugins/software-factory/src/core/flows/item-machine.ts",
        "line": 631
      }
    },
    {
      "id": "triage-persistence-gating",
      "disposition": "fix",
      "summary": "QA non-triager unenforceable; dismiss reason has no field mapping",
      "detail": "step-runner gives QA review schema yet plan says QA never triages; item-machine writeArtifact triages any suggestions output without agent/stepId gate, so QA matching id would triage. ReviewSuggestion lacks reason field but scenarios require dismissReason persisted. Need isTriager gate (reviewer/plan-reviewer/close-up only) and reason mapping (detail required when dismiss+match -> dismissReason) with schema/code enforcement.",
      "location": {
        "file": "plugins/software-factory/src/core/flows/step-runner.ts",
        "line": 93
      }
    },
    {
      "id": "store-spike-ordering",
      "disposition": "fix",
      "summary": "Immediate taskWt commit not gated by race/restart spike",
      "detail": "ADR decides direct taskWt writes + immediate commit, but spike-saga-commit verifying race/restart/derive boundary gates only routing-blocker-derive/saga-propagate. concerns-store implementing the commit deps only concerns-contracts, so risky impl precedes findings. Parallel items (maxParallelItems 4) sharing taskWt risk index.lock/lost update. Add spike dep to concerns-store or narrow ADR to hypothesis; define serialization + restart idempotency.",
      "location": {
        "file": "plugins/software-factory/src/core/flows/item-machine.ts",
        "line": 707
      }
    },
    {
      "id": "human-stop-redefinition",
      "disposition": "fix",
      "summary": "human-stop redefined from exit-10 halt to blocked without contract update",
      "detail": "ADR/scenario redefines stop as blocked-terminal with engine continues without halt, but dispositions.md and ARCHITECTURE 8.7 define human-stop as tousertoreview + exit 10 halt; item-machine only human-async returns blocked. No docs/exit-code update specified. Scenario unfalsifiable (exit code vs wave scheduling?). Preserve exit-10 or version change with falsifiable blocked-vs-halt assertions.",
      "location": {
        "file": "plugins/software-factory/agents/criteria/dispositions.md",
        "line": 12
      }
    },
    {
      "id": "funnel-invariant-unproven",
      "disposition": "fix",
      "summary": "Funnel less-detail invariant has no condensing contract or size assertions",
      "detail": "Spec requires less detail per level and never more text than code summarized. Plan caps only close-up hydration at max(500,min(diffBytes,2000)) with floor 500 violating never-more on zero-diff steps (fact-finder/plan-review). No reviewer->architect->human condensing prompts or size assertions (parent<child, digest<input, UTF-8 bytes). Scenarios say within budget without concrete diff/budget. Need diff source per level + falsifiable size checks.",
      "location": {
        "file": "docs/factory.v2.md",
        "line": 97
      }
    },
    {
      "id": "closeup-pending-contract",
      "disposition": "fix",
      "summary": "Close-up pending-confirm and propagate/auto-route contract missing",
      "detail": "Scenario says resolutions persisted pending architect confirm with actions resolve|carry|propagate, but stored statuses are open|dismissed|routed|resolved with no pending; WaveCloseupArtifact lacks resolutions. Confirm seam (decisions output field? hydration var?), propagate target (parent/human?), and simple-item auto-route transitions (tech-debt->debt bypassing exact-id?) undefined. Need record shape, pending representation, confirm/propagate semantics.",
      "location": {
        "file": "plugins/software-factory/src/core/artifacts.ts",
        "line": 335
      }
    },
    {
      "id": "producer-matrix-incomplete",
      "disposition": "fix",
      "summary": "Every-producer coverage omits agents and remarkable mapping",
      "detail": "Spec says every agent output may carry concerns[]; plan lists developer/fact-finder/review/plan/decisions/closeups but omits triage/infra/pm/qa/poc/test-assumptions without rationale. Remarkable[] per schema not enumerated; reviewer dual-role ordering (aggregate new before triage? self-dismiss?) and consult aggregation seam (runItemConsult writeArtifact) unspecified. Need producer matrix + ordering.",
      "location": {
        "file": "plugins/software-factory/src/core/artifacts.ts",
        "line": 318
      }
    },
    {
      "id": "blocker-derive-contract",
      "disposition": "fix",
      "summary": "Blocker derive misnames components and merges pure/act in one scenario",
      "detail": "Interface says classify never blocks on awareness but classify handles operator answers, not blocking; should be derive/task status. Precompute owner for concernBlocked:Set and deriveItemState consumption without circular dep missing; cascade fixpoint vs blockedByFailure reuse unspecified. Scenario merges pure derive + act consult write, violating ADR, and omits restart exactly-once dedup. Split scenarios + name owner/dedup.",
      "location": {
        "file": "plugins/software-factory/src/core/derive/wave.ts",
        "line": 23
      }
    },
    {
      "id": "saga-hydration-assumption",
      "disposition": "fix",
      "summary": "Epic-to-parent propagation assumes hydration that does not read concerns",
      "detail": "Assumption claims parent hydration already reads parent concerns/, but buildArchitectHydration reads only plans/closeups/steering/decisions. Child concerns live under namespaced childTaskDir on child branch; merge does not copy to parent concerns/. Copy timing (before merge/cleanup?), source.epic shape, hydration var (debt/steering vs concernsYaml), and condensed-size assertion (< child) undefined. Correct assumption + define seam.",
      "location": {
        "file": "plugins/software-factory/src/core/flows/iteration.ts",
        "line": 111
      }
    },
    {
      "id": "resilience-contracts",
      "disposition": "optional",
      "summary": "Corrupt-skip and strict-fail diverge from throw/partial patterns without ADR",
      "detail": "Derive throws on corrupt triage/plan/steer/decisions but plan skips corrupt concerns; single unknown-kind concern fails entire step (retry->failure) vs partial aggregate + warn. Either divergence needs ADR justification plus restart/retry behavior (reword merge, idempotent re-aggregate, no clobber of existing files).",
      "location": {
        "file": "plugins/software-factory/src/core/derive/task.ts",
        "line": 62
      }
    },
    {
      "id": "prompt-vars-enumeration",
      "disposition": "optional",
      "summary": "KNOWN_VARS fragment list and terse check unfalsifiable",
      "detail": "Interfaces list concernsYaml/humanInvolvementCriteria but do not enumerate all fragments needing KNOWN_VARS + descriptions (review, plan-review, wave/plan-close-up, architect-plan/wave-report/closeup/consults). M5 terse prompts has no measurable check. Provide fragment matrix + debloat assertion (skill/check, line budget).",
      "location": {
        "file": "plugins/software-factory/src/core/prompt-vars.ts",
        "line": 44
      }
    },
    {
      "id": "merge-escalation-hidden",
      "disposition": "human-awareness",
      "summary": "Severity escalation on dismissed concerns stays hidden by merge policy",
      "detail": "Merge keeps max severity and longer/latest detail but never reopens dismissed/routed/resolved except via triage. Escalated risk on dismissed concern stays dismissed/hidden. Architect can decide now (reopen on escalation vs keep + digest surfacing), but operator should be aware of hidden-escalation tradeoff.",
      "location": {
        "file": "docs/factory.v2.md",
        "line": 91
      }
    }
  ]
}

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
