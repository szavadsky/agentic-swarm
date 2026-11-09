# Step: PM Edits

## Goal
Deconstruct the approved architectural plan into scheduled, executable item specifications (`edits` artifact).

## Rules
- Yield only: you have NO file tools. Everything you need is below (`{
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
}`, `iteration: 3
amendments: 0
items:
  (none scheduled yet)
waves: (none)
merged: (none)
blocked: (none)
failed: (none)
open steer questions:
  - awareness-plan-2-autonomous-halt-deviation ref=plan-2 disposition=human-awareness: Spec autonomous defers blocking until unblocked work drains, but implementation routes blocking ADRs at plan time and halts immediately (iteration.ts:481-490). Plan ADR accepts immediate halt for iteration 2 with docs in ARCHITECTURE 8.11/human-involvement.md, drain scheduling future work. High-impact tradeoff operator should be aware of; architect can decide now. Ensure docs mark deviation explicitly.
  - awareness-plan-3-epic-config-awareness ref=plan-3 disposition=human-awareness: Plan ADR documents that humanInvolvement/concerns/reviewPolicy at root do not apply inside epics, deviating from ARCHITECTURE section 5 inheritance claim. Operators setting mode once at root will be surprised. Document-only decision is reasonable for closure scope but needs informational steer record like autonomous-halt awareness.`, kinds guides, `{
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
}`). NEVER reference files you cannot see.
- Structure ONLY architect-provided outlines: every item's `outlineRef` MUST name an outline slug from `{
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
}`. NEVER invent items or guess outlines — an unknown `outlineRef` fails validation.
- Item fields: for each planned item, specify `slug`, `kind`, `title`, `assignment`, `outlineRef`, `milestone`, `wave`, `deps`, `scenarioRefs`, and `citations`.
- Kinds selection: assign item kinds using the guides below (`dev`, `no-behavior`, `test-only`, `fact-finder`, `poc`, `test-assumptions`, `simple`, `epic` where allowed).
- Wave scheduling:
  - Items in wave W may ONLY depend on items scheduled in waves < W. Intra-wave dependencies are strictly invalid.
  - Concurrency: schedule at most `maxParallelItems` items per wave (see `{
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
}` for the value).
  - Total items: stay within `maxItemsPerPlan` (see `{
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
}`).
- Citation scoping: include only the specific subset of codebase citations required for each item's assignment. Never attach irrelevant task citations.
- Outline linkage: map each item to its plan outline via `outlineRef`. Inherit `escalate` flags from outlines.
- Output: yield structured output matching `plan-edits.schema.json`.

## Plan
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

## Task Status
iteration: 3
amendments: 0
items:
  (none scheduled yet)
waves: (none)
merged: (none)
blocked: (none)
failed: (none)
open steer questions:
  - awareness-plan-2-autonomous-halt-deviation ref=plan-2 disposition=human-awareness: Spec autonomous defers blocking until unblocked work drains, but implementation routes blocking ADRs at plan time and halts immediately (iteration.ts:481-490). Plan ADR accepts immediate halt for iteration 2 with docs in ARCHITECTURE 8.11/human-involvement.md, drain scheduling future work. High-impact tradeoff operator should be aware of; architect can decide now. Ensure docs mark deviation explicitly.
  - awareness-plan-3-epic-config-awareness ref=plan-3 disposition=human-awareness: Plan ADR documents that humanInvolvement/concerns/reviewPolicy at root do not apply inside epics, deviating from ARCHITECTURE section 5 inheritance claim. Operators setting mode once at root will be surprised. Document-only decision is reasonable for closure scope but needs informational steer record like autonomous-halt awareness.

## Story Kinds Guide
- **dev**: behavior change; tests first
- **no-behavior**: refactoring, file move, dependency update without prod behavior change
- **test-only**: test additions or improvements without prod code change
- **fact-finder**: investigate library, API, or unknown without writing production code
- **poc**: throwaway proof of concept confined to poc/ folder
- **test-assumptions**: exploratory tests demonstrating how lower level works that stay
- **epic**: large multi-milestone initiative decomposed into child iterations

## Story Kinds Criteria
# Story & Spike Kinds Guide for PM

Item classification matrix for planning and PM edits.
(Numeric bounds live in `limits` and the injected `{{limits}}` section; values below are the current defaults for orientation only.)

## Story Kinds
- `dev`:
  - When: New functionality, bug fixes, behavior changes.
  - Contract: Test-first mandatory (`test-first` step alters `paths.tests` only, declares `target` {selectors, expectRed}); `develop` step makes target green; QA verifies red-test and test-diff; peer code review.
  - Bounds: Prod lines within `storyMaxProdLines`.
- `no-behavior`:
  - When: Refactoring, performance optimization, dead code removal, file renames, internal restructuring.
  - Contract: Tests must stay materially identical; QA verifies `test-diff` contains no semantic assertion weakens/shifts; peer code review.
  - Bounds: Prod lines within `storyMaxProdLines`.
- `test-only`:
  - When: Adding test coverage, regression suites, test fixtures, integration tests.
  - Contract: Edits strictly confined to `paths.tests`; production code paths untouched; peer code review.
- `simple`:
  - When: Minor single-file tweak, trivial fix, or single constant update.
  - Contract: Single step `develop` + gates + advisory `size`. No review step. Gates green and under `simpleMaxProdLines` merges; over budget or red gates converts to a `no-behavior` item.
  - Bounds: Prod lines within `simpleMaxProdLines` (advisory sizing reference for conversion).

## Spike Kinds
- `fact-finder`:
  - When: Architecture unknowns, external API discovery, library capabilities, root cause investigations.
  - Contract: Read-only on repository; outputs `items/{item}/findings.md` and structured findings; review checks result validity.
- `poc`:
  - When: Feasibility experiments, prototyping throwaway implementation.
  - Contract: All edits strictly confined to the item's `poc/` folder (`{orchestrationFolder}/{task}/items/{item}/poc/`); production paths untouched; review checks result validity.
- `test-assumptions`:
  - When: Proving third-party library behavior, verifying runtime environment assumptions, confirming contract guarantees.
  - Contract: Permanent tests added to `paths.tests` asserting assumptions; review checks result validity.

## Context & Citations
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
- iteration (integer, required, min: 1)
- amendmentIndex (integer, optional, min: 0)
- items (array of object, required)
  - slug (string, required)
  - kind (string, required)
  - title (string, required)
  - assignment (string, required)
  - outlineRef (string, optional)
  - milestone (string, required)
  - wave (integer, required, min: 1)
  - deps (array of string, optional)
  - scenarioRefs (array of string, optional)
  - citations (array of string, optional)
  - escalate (boolean, optional)
