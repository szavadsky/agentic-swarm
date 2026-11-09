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
  "iteration": 3,
  "milestones": [
    {
      "directionalInterfaces": [
        "producers -> JSON file schemas (lowercase detail, additionalProperties:false): validation accepts lowercase detail, rejects capital-D; TS/review-schema/ingest already lowercase",
        "resolveReviewAllowed/isTriagerAgent -> wave/plan-close-up excluded from triager set (no dismiss advertised); close-up re-triage flows only through concernResolutions + architect concernConfirms + wave fallback"
      ],
      "id": "m1-contracts-consistency",
      "scenarios": [
        "Given concern outputs with lowercase detail across all producer schemas When validation runs Then all pass and detail persists; capital-D Detail is rejected",
        "Given wave-close-up/plan-close-up agents When allowed dispositions resolve Then dismiss is excluded; close-up re-triage works only via concernResolutions, architect concernConfirms, and wave fallback",
        "Given the full suite When gates run Then typecheck and bun test pass with no regressions"
      ],
      "title": "Contracts consistency"
    },
    {
      "directionalInterfaces": [
        "docs-finish-v4 delivers: ARCHITECTURE §1 row18 + §8.11 + §3/§5/§6.2/§8.7/§10/§13, README section, dispositions dismiss row, human-involvement.md deviation note, pipeline commentary mapping; TMPDIR=/tmp gates green"
      ],
      "id": "m2-docs-gates",
      "scenarios": [
        "Given ARCHITECTURE §1 row 18 When read Then it records item 18 implemented with explicit deviations and no 'Deliberately not hand-built'",
        "Given ARCHITECTURE, README, dispositions, and config commentary When read Then §8.11 documents store/triage/routing/funnel/ADR/modes, dispositions.md documents dismiss, README shows per-task mode selection, and commentary matches landed severity/router semantics",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "title": "Docs and gates"
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Normalize concern Detail->lowercase detail in the 7 file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup, wave-closeup, review suggestions + newConcerns) to match artifacts.ts, review-schema.ts, ingest, and the contract tests. No TS/runtime changes; triage/infra/pm-edit untouched. Verify: contract suites green + bun run typecheck + TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m1-contracts-consistency",
      "prodBudgetHint": 10,
      "slug": "schema-detail-normalize",
      "title": "Lowercase detail in producer schemas"
    },
    {
      "deps": [],
      "description": "Per adr-closeup-no-suggestions-triage: remove wave-close-up/plan-close-up from isTriagerAgent in review-policy.ts so dismiss is never advertised for them; update review-policy.test.ts triager-set assertions. Close-up re-triage remains concernResolutions + architect concernConfirms + wave fallback (no ingest change). Behavior/contract test: allowed dispositions for close-up agents exclude dismiss. Verify typecheck + targeted suite + full gates.",
      "kind": "story",
      "milestoneId": "m1-contracts-consistency",
      "prodBudgetHint": 30,
      "slug": "closeup-triager-cleanup",
      "title": "Drop close-ups from triager set"
    },
    {
      "deps": [
        "closeup-triager-cleanup",
        "schema-detail-normalize"
      ],
      "description": "Docs closure over final landed behavior. ARCHITECTURE: rewrite §1 row 18 to implemented with deviations (epic config root-only, close-up resolutions path, saga funnel semantics, autonomous immediate halt), add §8.11 funnel section, update §3/§5/§6.2/§8.7/§10/§13 per context-pack gap list, state canonical ADR format vs historical 3-line notes. README: Concerns & human involvement section with per-task pipeline.yaml example + status counts/digest output. dispositions.md: add dismiss row (reason required, kept). human-involvement.md + §8.11: immediate-halt deviation note. pipeline.default.yaml commentary: fragment->agent mapping + landed severity semantics. Final gates: typecheck + TMPDIR=/tmp bun test green.",
      "kind": "story",
      "milestoneId": "m2-docs-gates",
      "prodBudgetHint": 100,
      "slug": "docs-finish-v4",
      "title": "Docs and suite consolidation"
    }
  ],
  "assumptions": [
    {
      "assumption": "Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures do not mask regressions.",
      "why": "Baseline red only under .factory-runtime TMPDIR; suite green with TMPDIR=/tmp. Out of scope."
    },
    {
      "assumption": "Store/triage/routing/funnel/propagation APIs are frozen; iteration 3 touches only schemas, review-policy triager set, prompt criteria row, and docs.",
      "why": "Context pack verifies 18 behavior/contract suites cover the implementation; re-planning them risks regressions for no gain."
    },
    {
      "assumption": "Autonomous immediate-halt deviation stands as accepted; operator already notified via awareness-plan-2-autonomous-halt-deviation.",
      "why": "Decided in iteration 2 planning; iteration 3 only documents it in ARCHITECTURE and human-involvement.md."
    }
  ],
  "techDebt": [
    {
      "category": "adjacent",
      "description": "Pre-existing head-guard failures when TMPDIR sits under .factory-runtime. Baseline red; green with TMPDIR=/tmp. Out of scope.",
      "id": "td-tmpdir-split"
    },
    {
      "category": "adjacent",
      "description": "Unapplied spike-saga-commit reviewer optional nits (qualify epic-state precedence, prefix inline paths, scope removeWorktree claim, fold contextPack key). Consumers apply mentally.",
      "id": "td-spike-nits"
    },
    {
      "category": "impacting",
      "description": "Capital-D Detail in 7 file schemas rejects lowercase detail under additionalProperties:false, breaking runtime validation for file-schema producers.",
      "id": "td-detail-casing",
      "resolution": "Fix in schema-detail-normalize: normalize to lowercase detail; contract suites verify."
    },
    {
      "category": "impacting",
      "description": "wave/plan-close-up listed as triagers though close-up schemas reject suggestions[], advertising an unreachable dismiss path.",
      "id": "td-closeup-triager-dead",
      "resolution": "Fix in closeup-triager-cleanup: drop close-ups from isTriagerAgent; document resolutions/confirms/fallback as the close-up path."
    }
  ],
  "adrs": [
    {
      "context": "ARCHITECTURE §5 claims epics inherit the parent task layer, but runTaskChild loads only the child task dir pipeline.yaml, so humanInvolvement/concerns/reviewPolicy set at root do not apply inside epics. Implementing parent-layer inheritance would change config loading semantics for all tasks, beyond item-18 closure scope.",
      "decision": "Document the deviation: per-task selectability holds per task directory (each epic child has its own pipeline.yaml), but epic children do not inherit the parent task layer. Record in the §1 row 18 rewrite and §5; no behavior change.",
      "id": "adr-epic-config-root-only",
      "title": "Epic config inheritance documented as deviation"
    },
    {
      "context": "isTriagerAgent returns true for wave/plan-close-up and ingest would triage their suggestions[], but both close-up schemas set additionalProperties:false without a suggestions field, so the path is unreachable; real re-triage flows through concernResolutions + architect concernConfirms + wave fallback.",
      "decision": "Drop wave-close-up/plan-close-up from isTriagerAgent (resolveReviewAllowed no longer advertises dismiss for them); close-up re-triage stays exclusively concernResolutions/confirms/fallback. Update review-policy tests and correct §10/§8.7 wording. No ingest behavior change (close-ups never emitted suggestions).",
      "id": "adr-closeup-no-suggestions-triage",
      "title": "Close-ups removed from triager set"
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
