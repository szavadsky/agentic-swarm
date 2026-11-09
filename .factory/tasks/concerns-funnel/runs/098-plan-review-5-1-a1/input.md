# Step: Plan Review

## Goal
Conduct adversarial review of the architect's proposed plan, critiquing milestone scoping, interface contracts, Gherkin scenarios, risk coverage, and dependency structure.

## Rules
- SKEPTICAL REVIEW: scrutinize the plan against project intent and real codebase constraints.
- Scrutiny checklist (numeric bounds come from the `{
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
}` section; do not invent numbers):
  - Plan bounds: milestone/item counts within limits, acyclic dependencies, unique slugs.
  - Size estimates (advisory only, never blocking): outlines may carry a `prodBudgetHint` (estimated prod lines); note missing hints and hints above the kind's sizing reference (`storyMaxProdLines`/`simpleMaxProdLines` in `{
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
}`) as advisory observations. A plan is never failed, looped, or consulted on sizing hints alone.
  - Scenario completeness: are scenarios falsifiable, concrete, and comprehensive?
  - Contract clarity: do directional interfaces establish clear caller/callee contracts?
  - Risk isolation: are technical unknowns and third-party dependencies isolated into spikes?
  - Debt & ADRs: is technical debt properly categorized? Are major decisions documented in ADRs?
- Reviewer boundary: reviewers critique; reviewers NEVER rewrite plans. Yield structured output matching `review.schema.json`, using only dispositions allowed by the section below.

## Dispositions Criteria
Allowed dispositions for this review: fix, optional, architect, human-awareness, human-async.
Use ONLY these dispositions; any other disposition value fails validation.
# Review Suggestion Dispositions

Criteria for assigning disposition to review findings:

| Disposition | When to Assign | Engine Action |
|---|---|---|
| `fix` | Concrete defect, failing gate, broken contract, missing test, or deviation from assignment. | Returns item to `fixLoopTo` step (bounded by `maxFixRounds`); developer must address. Non-item: triggers consult. |
| `optional` | Non-blocking polish, code style improvement, minor refactor opportunity, or deferred debt. | Passed to developer if another fix round occurs; otherwise recorded as tech debt for future iterations. |
| `architect` | Architectural contradiction, interface redesign, boundary breach, or uncertainty exceeding item scope. | Triggers immediate architect consult; architect's decision is binding and final. |
| `human-awareness` | High-impact technical tradeoff or notable choice operator should be aware of, but architect can decide now. | Architect decides immediately; creates informational record in `steer/tousertoreview/{id}.yaml`. |
| `human-async` | Missing business requirement, external credential needed, conflicting user intent requiring operator decision. | Creates blocking entry in `steer/tousertoreview/{id}.yaml`; item and dependents pause; unrelated items proceed. |

## Rules
- Defect requiring code change MUST be `fix`.
- Do NOT use `architect` for routine bugs; reserve for structural/design conflicts.
- Do NOT use `human-async` when repo context or architecture docs provide the answer.

## Plan
{
  "iteration": 5,
  "milestones": [
    {
      "directionalInterfaces": [
        "step-runner (caller) validates producer outputs against the 6 runtime file schemas (callee contract: decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup): lowercase detail accepted, capital-D Detail rejected with step error before any store write; aggregateConcerns/mergeConcern read lowercase detail with longest-wins",
        "contract/behavior tests (callers) read lowercase .detail on stored concerns (callee shape StoredConcernArtifact.detail); test/contracts/schema-detail-normalize.test.ts asserts capital-D absence and stays untouched"
      ],
      "id": "m0-detail-normalize",
      "scenarios": [
        "Given the 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup incl architect-closeup, wave-closeup) plus reference review schema When the contract suites run Then lowercase detail validates and capital-D Detail is rejected",
        "Given a stored concern with 200-byte detail re-emitted with 20-byte detail When aggregateConcerns merges Then the stored 200-byte detail survives",
        "Given every .Detail read in src and test When swept with :raw reads Then none remain outside the intentional absence-assertions in schema-detail-normalize.test.ts",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass with no regressions"
      ],
      "title": "Detail casing normalization"
    },
    {
      "directionalInterfaces": [
        "agents/steps/architect-closeup.md + architect-wave-report.md (producers) -> architect agents (consumers): terse concernConfirms accept/reject instruction text (note rule for dismiss); concernResolutions instruction removed from architect-closeup",
        "prompts.test.ts (caller) <- fragment line budgets (callee): <=15 added lines per fragment, <=80 total; test/docs-concerns.test.ts (guard) <- ARCHITECTURE/README/config bytes (unchanged); docs/adr/ <- 2 new one-paragraph deviation records"
      ],
      "id": "m1-confirm-instructions",
      "scenarios": [
        "Given agents/steps/architect-closeup.md When read Then it instructs concernConfirms accept/reject with the dismiss note rule and no concernResolutions instruction",
        "Given agents/steps/architect-wave-report.md When read Then it instructs concernConfirms for wave-close-up proposals",
        "Given the rendered architect-closeup and architect-wave-report prompts When checked Then the confirms instruction is present in both, and prompts.test fragment matrix plus 15/80 debloat budgets pass",
        "Given test/docs-concerns.test.ts When run Then all sentinels pass (no ARCHITECTURE regression); given the full suite with TMPDIR=/tmp When gates run Then typecheck and bun test pass"
      ],
      "title": "Close-up confirm instructions and deviation records"
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Normalize concern Detail->lowercase detail in the 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) + reference-only review.schema.json. One-line TS fix concerns.ts:74 (existing?.Detail -> existing?.detail) restoring longest-wins. Fix ALL stale capital-D .Detail reads in tests (known: epic-saga-propagate.test.ts:307/313/319; sweep funnel-text-budget.test.ts + any others). CAUTION: grep missed verified matches this turn, so verify the sweep with :raw reads, not grep alone; test/contracts/schema-detail-normalize.test.ts:86/106 assert .Detail absence intentionally -- DO NOT touch those. Ensure contract suite asserts lowercase-validates + capital-D rejected; longest-wins behavior test already exists or add it (200-byte stored survives 20-byte re-emit). triage/infra/pm-edit untouched. Verify typecheck + TMPDIR=/tmp bun test full suite green.",
      "kind": "story",
      "milestoneId": "m0-detail-normalize",
      "prodBudgetHint": 30,
      "slug": "schema-detail-normalize-v3",
      "title": "Lowercase detail in producer schemas + merge fix"
    },
    {
      "deps": [],
      "description": "Per adr-confirm-field-instructions: in agents/steps/architect-closeup.md replace the concernResolutions instruction with a terse concernConfirms accept/reject instruction incl the note rule for dismiss; in agents/steps/architect-wave-report.md add a terse concernConfirms instruction for wave-close-up proposals. <=3 added lines per fragment; architect-resume.md and all other fragments untouched. Add/extend a prompt-render test asserting the confirms instruction appears in both rendered prompts and the wrong concernResolutions instruction is gone from architect-closeup. Record the two accepted semantics as one-paragraph repo files docs/adr/adr-epic-mailbox-isolation.md and docs/adr/adr-remarkable-digest-triage.md matching existing style. Do NOT touch ARCHITECTURE/README/config/criteria files. Verify: prompts.test fragment matrix + 15/80 budgets green, test/docs-concerns.test.ts green (sentinel guard), typecheck + TMPDIR=/tmp full suite green.",
      "kind": "story",
      "milestoneId": "m1-confirm-instructions",
      "prodBudgetHint": 10,
      "slug": "closeup-confirm-instructions",
      "title": "Architect confirms instructions + deviation ADRs"
    }
  ],
  "assumptions": [
    {
      "assumption": "Baseline is RED on detail casing, contradicting the context-pack 467-pass/typecheck-clean claim: :raw reads verify capital-D Detail in runtime schemas (developer-output.schema.json:68, plan-closeup.schema.json:34), concerns.ts:74 reads existing?.Detail (type error against lowercase StoredConcernArtifact.detail, longest-wins dead), and epic-saga-propagate.test.ts:307/313/319 read .Detail. Gates go green only after m0 lands. TMPDIR=/tmp still required for the 2 pre-existing head-guard failures.",
      "why": "Three consecutive audits hit the same rendering trap (lowercase shown, capital-D on bytes). :raw reads plus closeup-4 are authoritative; plan targets red-to-green via m0."
    },
    {
      "assumption": "Behavior is frozen except Detail->detail normalization and the two architect-fragment instruction lines (+ tests + 2 repo ADR files). No ARCHITECTURE/README/config/prompt-criteria edits; test/docs-concerns.test.ts must stay green as the guard. Legacy fingerprint migration stays as tested code.",
      "why": "Closure iteration: bounding change to verified gaps avoids regressions and sentinel/debloat violations."
    },
    {
      "assumption": "Q4/Q8/Q9 resolved accept-only with no code: byte-capped hydration views (triage.ts:151-165,254-286) plus epic-copy truncation are the condense contract (stored detail never rewritten); mode presets and severity thresholds stay conventionally coupled (engine-deriving presets would change config semantics); extra-agent output:review permissive fallback is out of closure scope (default triager/non-triager paths enforce dismiss via generated enum + isTriager gate, tested).",
      "why": "All are accepted-semantics or non-default-setup edges; architect decides, no operator action needed."
    },
    {
      "assumption": "Epic mailbox isolation (Q3) accepted as the sixth deviation; epic-local digests invisible at root is operator-visible behavior.",
      "disposition": "human-awareness",
      "why": "Operators polling the root mailbox would otherwise miss epic-local human-* entries; architect decides, operator informed, mirroring the four prior awareness items."
    }
  ],
  "techDebt": [
    {
      "category": "impacting",
      "description": "Capital-D Detail in 6 runtime-bound file schemas rejects lowercase detail (review.schema.json reference-only, normalized for consistency); mergeConcern reads existing?.Detail so typecheck fails and longest-wins is dead; epic-saga and possibly funnel tests read .Detail.",
      "id": "td-detail-casing",
      "resolution": "Fix in schema-detail-normalize-v3: normalize schemas + concerns.ts:74 + all stale test reads verified by :raw; contract and longest-wins tests verify; full gates green."
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
      "decision": "Fix the fragments (cheap, in scope): architect-closeup.md instructs concernConfirms accept/reject with the note rule for dismiss; architect-wave-report.md instructs concernConfirms for wave-close-up proposals. Terse additions (<=3 lines each) within the prompts.test 15/80 debloat budgets; a prompt-render test locks the instruction in both rendered prompts. architect-resume.md untouched (session resume, not a confirm turn). No engine/schema changes.",
      "id": "adr-confirm-field-instructions",
      "title": "Architect fragments instruct concernConfirms"
    },
    {
      "context": "runChildTask accepts rootTaskDir but never reads it; only root runTask polls the root mailbox, while epic children write human-* to their own task dir mailbox ({childWt}/{orch}/{parent}/{epic}). Blocked child questions are forwarded as q-epic-* (epic-propagation.ts:97-129), but epic-local digests stay in the epic mailbox and parent answers are not copied back down. Wiring child-to-root mailbox routing now is a late-stage behavior change with config-semantics blast radius.",
      "decision": "Accept as the sixth documented deviation for closure: the root mailbox is the operator surface; epic-local digest entries are not visible at root; child-to-root routing/answer-sync is future work. Record in a repo docs/adr file; operator notified via human-awareness.",
      "id": "adr-epic-mailbox-isolation",
      "title": "Epic mailbox isolation accepted as deviation"
    },
    {
      "context": "Worker remarkable[] becomes an open rm-* record hydrated to every consumer, but a mailbox digest is written only when a triager emits a suggestion matching the rm-* id with a human-* disposition (triage.ts:98,334-346); architect ADRs route automatically instead. Spec :98 says remarkable items are reported in a digest, never waiting.",
      "decision": "Accept triage-dependency as spec-consistent: spec :96 requires remarkable decisions to get the same aggregation/triage as concerns, so reviewer-triage is the funnel gate, not a bypass. No auto-digest above threshold. Record in a repo docs/adr file. Untriaged remarkables (simple tasks) never digest, consistent with adr-funnel-triage-coverage.",
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

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["approved","changes_requested"])
- summary (string, required)
- suggestions (array of object, required)
  - id (string, required)
  - disposition (string, required, enum: ["fix","optional","architect","human-awareness","human-async"])
  - summary (string, required)
  - detail (string, optional)
  - location (object, optional)
    - file (string, required)
    - line (integer, optional)
