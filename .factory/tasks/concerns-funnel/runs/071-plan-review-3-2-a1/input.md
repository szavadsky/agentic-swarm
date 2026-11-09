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
        "step-runner (caller) validates producer outputs against file schemas (callee contract): lowercase detail accepted, unknown props incl. capital-D Detail rejected with step error before any store write; aggregateConcerns/mergeConcern read lowercase detail with longest-wins",
        "prompts/step-runner/item-machine (callers) consume resolveReviewAllowed (callee) as the single allowed-set source: triagers = reviewer/plan-reviewer only get dismiss; close-up agents excluded; close-up re-triage honored solely via concernResolutions + architect concernConfirms + wave fallback",
        "ingestStepConcerns (caller) -> applyConcernConfirms (callee): accept on pending dismiss requires non-empty note else TriageValidationError (step errors, no transition); accept+dismiss -> dismissed + dismissReason; fallback never assigns dismiss and leaves kind=blocker open"
      ],
      "id": "m1-contracts-consistency",
      "scenarios": [
        "Given the 7 producer file schemas When test/contracts/concern-schemas.test.ts runs Then lowercase detail validates and capital-D Detail is rejected",
        "Given a stored concern with 200-byte detail re-emitted with 20-byte detail When aggregateConcerns merges Then the stored 200-byte detail survives",
        "Given wave-close-up/plan-close-up agents When resolveReviewAllowed runs Then the allowed set excludes dismiss",
        "Given a close-up dismiss proposal with note plus architect accept When ingest runs Then the concern becomes dismissed with dismissReason set; given accept on a noteless dismiss proposal Then the step errors and the concern keeps status and pending",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass with no regressions"
      ],
      "title": "Contracts consistency"
    },
    {
      "id": "m2-docs-gates",
      "scenarios": [
        "Given ARCHITECTURE §1 row 18 When read Then it records item 18 implemented with explicit deviations and no 'Deliberately not hand-built'",
        "Given ARCHITECTURE §8.11 When read Then it documents store layout, fingerprint/dedup, triage contract, routing table, close-up propose-confirm, epic condensing, ADR blocking table, presets, and the epic-config, close-up-dismiss, saga-semantics, and immediate-halt deviations",
        "Given dispositions.md and rendered prompts When checked Then a dismiss row (reason required, kept) exists, the QA prompt excludes it while the reviewer prompt includes it, and prompts.test debloat budgets pass",
        "Given README, pipeline.default.yaml, and human-involvement.md When read Then README shows per-task principal (low/medium) and detailed (low/low) examples plus status counts/digest output, commentary documents the fragment->agent mapping with medium/high defaults, and the immediate-halt deviation is noted",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "title": "Docs and gates"
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Normalize concern Detail->lowercase detail in 7 file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup, wave-closeup, review suggestions + newConcerns); note review.schema.json is reference-only (resolveStepSchema generates runtime review schemas, already lowercase), so runtime breakage applies to the other 6. One-line TS fix in concerns.ts:72 (existing?.Detail -> existing?.detail) restoring longest-wins merge. Tests: contract suites (lowercase passes, capital-D rejected) + longest-wins behavior test (200-byte stored detail survives 20-byte re-emit). triage/infra/pm-edit untouched. Verify typecheck + TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m1-contracts-consistency",
      "prodBudgetHint": 20,
      "slug": "schema-detail-normalize",
      "title": "Lowercase detail in producer schemas + merge fix"
    },
    {
      "deps": [],
      "description": "Per adr-closeup-no-suggestions-triage: drop wave-close-up/plan-close-up from isTriagerAgent (dismiss never advertised for them); add dismiss to CloseupConcernResolution/PendingConcernResolution unions and wave/plan-closeup schema enums; applyConcernConfirms accept+dismiss -> dismissed + dismissReason from note; ingestStepConcerns validates accept-on-dismiss with empty note by throwing TriageValidationError (step errors, no transition); fallback unchanged (never dismiss, blocker stays open). Tests: review-policy triager-set exclusion + closeup-lifecycle dismiss accept/error cases. Verify typecheck + targeted suites + full gates.",
      "kind": "story",
      "milestoneId": "m1-contracts-consistency",
      "prodBudgetHint": 60,
      "slug": "closeup-triager-cleanup",
      "title": "Close-up triager cleanup + dismiss resolutions"
    },
    {
      "deps": [
        "closeup-triager-cleanup",
        "schema-detail-normalize"
      ],
      "description": "Docs closure over final landed behavior. ARCHITECTURE: rewrite §1 row 18 (implemented + 4 deviations), add §8.11 funnel section, update §3/§5/§6.2/§8.7/§10/§13 per gap list, state canonical ADR format vs historical notes. README: Concerns & human involvement section (per-task principal low/medium + detailed low/low example, status counts/digest output). dispositions.md: dismiss row (reason required, kept). prompts.ts: filter dismiss rows when allowed set excludes it (mirror human-stop pattern) + QA-excludes/reviewer-includes render test + prompts.test debloat budgets. human-involvement.md + §8.11: immediate-halt note. pipeline commentary: fragment->agent mapping + medium/high defaults. Final gates green.",
      "kind": "story",
      "milestoneId": "m2-docs-gates",
      "prodBudgetHint": 110,
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
      "assumption": "Store/triage/routing/funnel/propagation behavior is frozen except the three scoped fixes: concerns.ts:72 lowercase read, close-up dismiss-via-resolutions, and prompts.ts dismiss-row filtering.",
      "why": "18 behavior/contract suites cover the implementation; bounding iteration 3 to the reviewed gaps avoids regressions."
    },
    {
      "assumption": "Autonomous immediate-halt deviation stands as accepted; operator already notified via awareness-plan-2-autonomous-halt-deviation.",
      "why": "Decided in iteration 2 planning; iteration 3 only documents it."
    },
    {
      "assumption": "Epic config root-only deviation accepted as document-only; operator notified via open awareness item awareness-plan-3-epic-config-awareness.",
      "disposition": "human-awareness",
      "why": "Operators setting mode once at root would otherwise be surprised; architect decides, operator informed."
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
      "description": "Capital-D Detail in 6 runtime-bound file schemas rejects lowercase detail under additionalProperties:false (review.schema.json is reference-only but normalized for consistency); mergeConcern reads existing?.Detail so longest-wins never applies.",
      "id": "td-detail-casing",
      "resolution": "Fix in schema-detail-normalize: normalize schemas to lowercase detail + one-line TS fix; contract and longest-wins tests verify."
    },
    {
      "category": "impacting",
      "description": "wave/plan-close-up listed as triagers though close-up schemas reject suggestions[], advertising an unreachable dismiss path; close-up re-triage has no dismiss vocabulary.",
      "id": "td-closeup-triager-dead",
      "resolution": "Fix in closeup-triager-cleanup: drop close-ups from isTriagerAgent and add dismiss to concernResolutions with accept/validation semantics."
    }
  ],
  "adrs": [
    {
      "context": "ARCHITECTURE §5 claims epics inherit the parent task layer, but runTaskChild loads only the child task dir pipeline.yaml, so humanInvolvement/concerns/reviewPolicy set at root do not apply inside epics. Implementing parent-layer inheritance would change config loading semantics for all tasks, beyond item-18 closure scope.",
      "decision": "Document the deviation: per-task selectability holds per task directory (each epic child has its own pipeline.yaml), but epic children do not inherit the parent task layer. Record in the §1 row 18 rewrite and §5; no behavior change. Operator notified via open awareness item awareness-plan-3-epic-config-awareness.",
      "id": "adr-epic-config-root-only",
      "title": "Epic config inheritance documented as deviation"
    },
    {
      "context": "isTriagerAgent returns true for wave/plan-close-up and ingest would triage their suggestions[], but both close-up schemas set additionalProperties:false without a suggestions field, so the path is unreachable; real re-triage flows through concernResolutions + architect concernConfirms + wave fallback. Removing close-ups from the triager set would leave close-up re-triage with no dismiss path (resolutions allow only resolve/carry/propagate).",
      "decision": "Drop wave-close-up/plan-close-up from isTriagerAgent (dismiss no longer advertised for them) AND add dismiss to the close-up path: CloseupConcernResolution/PendingConcernResolution actions gain dismiss; accept+dismiss transitions to dismissed with dismissReason from the proposal note; accept on a noteless dismiss proposal throws TriageValidationError (step errors, no transition), mirroring triage dismiss-requires-detail. Wave fallback never assigns dismiss and leaves kind=blocker open. Update review-policy and closeup-lifecycle tests; correct §10/§8.7 wording.",
      "id": "adr-closeup-no-suggestions-triage",
      "title": "Close-ups removed from triager set; dismiss via resolutions"
    },
    {
      "context": "Propagated epic copies preserve child affects slugs while parent collectRoutedBlockers matches parent item slugs, so copies can never derived-block the parent; copies stay open by design and only forwarded q-epic questions block (module header + epic-saga-propagate tests assert this intent).",
      "decision": "Document as the intended funnel semantic in §1 row 18 and §8.11: the saga architect resolves/steers propagated copies; epic-level blocking reaches the parent only via forwarded questions. No behavior change.",
      "id": "adr-saga-funnel-semantics",
      "title": "Propagated copies open-only; questions block"
    },
    {
      "context": "Spec line 100 says autonomous blocks only for the portion still blocked after everything unblocked is done, but iteration.ts halts immediately at plan time on a blocking ADR. Prior ADR docs/adr/adr-autonomous-immediate-halt.md records this as accepted with operator awareness item awareness-plan-2-autonomous-halt-deviation.",
      "decision": "Restate and keep the accepted deviation for closure: immediate halt stands; drain-then-block scheduling stays future work. docs-finish-v4 marks it explicitly in ARCHITECTURE §8.11 and agents/criteria/human-involvement.md.",
      "id": "adr-autonomous-immediate-halt",
      "title": "Autonomous immediate halt accepted (restated)"
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
