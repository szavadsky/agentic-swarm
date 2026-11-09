# Step: Plan Close-Up

## Goal
Audit completed iteration work against original plan milestones, Gherkin scenarios, and task intent. Deliver an independent completeness assessment.

## Rules
- SKEPTICAL AUDIT: inspect real code, test suites, and gate results. NEVER rely on developer claims or wave summaries.
- Tracing requirements: trace each milestone and scenario in the plan to concrete implementing code and passing tests.
- Gap identification: flag any unimplemented scenarios, skipped edge cases, weakened tests, or unaddressed technical debt.
- Output: yield the audit matching `plan-closeup.schema.json`.
- Status semantics (your AUDIT verdict; the architect decides the iteration): `complete` (every milestone verified delivered), `next-iteration` (verified gaps remain for another iteration), `blocked` (you cannot assess without operator input; set `question`).
- Reviewer boundary: reviewers critique; reviewers NEVER write code fixes.

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


## Plan
{
  "iteration": 4,
  "milestones": [
    {
      "directionalInterfaces": [
        "step-runner (caller) validates producer outputs against the 6 runtime file schemas (callee contract: decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup): lowercase detail accepted, capital-D Detail rejected with step error before any store write; aggregateConcerns/mergeConcern read lowercase detail with longest-wins"
      ],
      "id": "m0-detail-normalize",
      "scenarios": [
        "Given the 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup incl architect-closeup, wave-closeup) plus reference review schema When test/contracts/concern-schemas.test.ts runs Then lowercase detail validates and capital-D Detail is rejected",
        "Given a stored concern with 200-byte detail re-emitted with 20-byte detail When aggregateConcerns merges Then the stored 200-byte detail survives",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass with no regressions"
      ],
      "title": "Detail casing normalization"
    },
    {
      "directionalInterfaces": [
        "item-machine/iteration (callers) -> formatDispositionsSection(criteria, allowed) (callee): allowed excludes dismiss => dismiss rows/rules filtered from prompt criteria text (QA prompt); allowed includes dismiss => rows kept (reviewer prompt); mirrors existing human-stop filtering",
        "review/plan-review step prompts (consumers) <- dispositions.md dismiss row (content contract): single terse row stating triager-only, reason required, kept on disk; prompt text only, independent of the review-schema enum which derives from resolveReviewAllowed"
      ],
      "id": "m1-dismiss-contract",
      "scenarios": [
        "Given dispositions.md When read Then a terse dismiss row (triager-only, reason required, kept on disk) exists",
        "Given a QA prompt (allowed excludes dismiss) and a reviewer prompt (allowed includes dismiss) When rendered Then the QA prompt excludes dismiss rows/rules while the reviewer prompt includes them",
        "Given prompts.test When run Then the fragment matrix and 15-per-fragment/80-total debloat budgets pass",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "title": "Dismiss vocabulary contract"
    },
    {
      "directionalInterfaces": [
        "docs-finish-v5 (caller) documents landed contracts (callees, read-only): store layout, fingerprint/dedup, triage contract, router table, close-up lifecycle, epic condensing, ADR blocking table, presets; deviation history in ARCHITECTURE docs only, never in agents/criteria prompt files; no behavior change",
        "test/docs-concerns.test.ts (caller) asserts doc sentinels (callee content): every needle names content added by docs-finish-v5 and fails on the base tree",
        "allowlist-agreement-test (caller) imports DEFAULT_RAISE_ALLOWLIST from src/core/concerns.ts (callee code) and asserts equality with the shipped concerns.raiseAllowlist in config/pipeline.default.yaml (callee data)"
      ],
      "id": "m2-docs-gates",
      "scenarios": [
        "Given ARCHITECTURE §1 row 18 When read Then it records item 18 implemented with the epic-config, close-up-dismiss, saga-semantics, immediate-halt, and triage-coverage deviations and no 'Deliberately not hand-built'",
        "Given ARCHITECTURE §8.11 When read Then it documents store layout, fingerprint/dedup, remarkable aggregation/triage with threshold-exemption, triage contract, routing table, byte caps as code constants, and the engine-owned concerns/ note",
        "Given ARCHITECTURE §8.11 When read Then it documents close-up propose-confirm incl dismiss, epic condensing, ADR blocking table, presets, c-only counts, and no-retention digest",
        "Given ARCHITECTURE §8.11 When read Then it records the immediate-halt deviation, the triage-coverage limitation (consult/wave-report/closeup via hydration+fallback, simple-task stays open), epic-config root-only, close-up-dismiss, and saga open-only semantics",
        "Given ARCHITECTURE §3/§5/§6.2/§8.7/§10/§11/§13 When read Then modules, config sample with root-only layering, concerns/ folder, dismiss row, outputs, status counts, and funnel suites are all updated",
        "Given README When read Then it has a Concerns & human involvement section with per-task principal/detailed examples and status counts/digest output; given pipeline.default.yaml When read Then reviewPolicy commentary documents dismiss auto-append and the concerns block documents the fragment->agent mapping",
        "Given test/docs-concerns.test.ts When run on base vs branch Then every test fails on base and passes on branch; given the allowlist agreement test When run Then code and shipped allowlists agree",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "title": "Docs closure and gates"
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Normalize concern Detail->lowercase detail in 6 runtime file schemas (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) + reference-only review.schema.json for consistency with generated review-schema.ts. One-line TS fix concerns.ts:72 (existing?.Detail -> existing?.detail) restoring longest-wins. Fix ALL capital-D .Detail reads in tests (epic-saga-propagate.test.ts incl :307/313/319 + any others; funnel-text-budget.test.ts). Ensure contract suite asserts lowercase validates + capital-D rejected (add cases if missing); add longest-wins behavior test (200-byte stored survives 20-byte re-emit). triage/infra/pm-edit untouched. Verify typecheck + TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m0-detail-normalize",
      "prodBudgetHint": 30,
      "slug": "schema-detail-normalize-v2",
      "title": "Lowercase detail in producer schemas + merge fix"
    },
    {
      "deps": [],
      "description": "Per adr-dismiss-criteria-row: add terse dismiss row + rule to agents/criteria/dispositions.md; extend formatDispositionsSection (prompts.ts:90-110) to filter dismiss rows/rules when allowed excludes dismiss, mirroring human-stop; add QA-excludes/reviewer-includes render test; keep prompts.test fragment matrix + 15/80 debloat budgets green. Verify typecheck + TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m1-dismiss-contract",
      "prodBudgetHint": 15,
      "slug": "prompts-dismiss-filter",
      "title": "Dismiss criteria row + prompt filtering"
    },
    {
      "deps": [],
      "description": "Test-only (no prod changes): in test/human-involvement-config.test.ts ONLY, replace the local DEFAULT_RAISE_ALLOWLIST duplicate (:46-55) with an import of DEFAULT_RAISE_ALLOWLIST from src/core/concerns.ts, so the existing assertion (:154-157) directly locks code-vs-shipped-yaml agreement. No new test file; no third copy. Verify typecheck + targeted suite.",
      "kind": "test-only",
      "milestoneId": "m2-docs-gates",
      "prodBudgetHint": 0,
      "slug": "allowlist-agreement-test",
      "title": "Raise-allowlist agreement contract test"
    },
    {
      "deps": [
        "prompts-dismiss-filter",
        "schema-detail-normalize-v2"
      ],
      "description": "Docs closure over landed behavior. Repo sources ONLY (no orchestration artifacts): all files under docs/adr/ (no count assumed; esp. adr-closeup-no-suggestions-triage, adr-epic-push-condensed, adr-autonomous-immediate-halt, adr-epic-config-root-only, adr-funnel-triage-coverage, adr-remarkable-counts-semantics, adr-dismiss-criteria-row), src/core/{concerns,triage,review-policy,prompts}.ts, flows/{step-runner,iteration,epic-propagation,adrs}.ts, cli/status.ts, config/pipeline.default.yaml:359-432. ARCHITECTURE: §1 row 18 implemented + 5 deviations (epic-config root-only, close-up-dismiss via resolutions, saga open-only semantics, immediate-halt, triage-coverage limitation); new §8.11 per m2 scenarios 2a-2c; §3 modules; §5 config sample + root-only fix; §6.2 concerns/ + engine-owned; §8.7 dismiss row; §10 outputs; §11 status; §13 suites; canonical ADR format vs historical notes. README Concerns & human involvement section + §5 range update. pipeline.default.yaml reviewPolicy dismiss auto-append + concerns fragment->agent mapping commentary. Do NOT touch agents/criteria/human-involvement.md (prompt criteria). New test/docs-concerns.test.ts with base-failing sentinels per Decision 022 (each needle names added content; verify fail on base, pass on branch). Final gates green with TMPDIR=/tmp.",
      "kind": "story",
      "milestoneId": "m2-docs-gates",
      "prodBudgetHint": 150,
      "slug": "docs-finish-v5",
      "title": "Docs and suite consolidation"
    }
  ],
  "assumptions": [
    {
      "assumption": "Baseline is RED: 6 runtime file schemas declare capital-D Detail with additionalProperties:false (verified by :raw read, e.g. developer-output.schema.json:68); concerns.ts:72 reads existing?.Detail (verified by :raw read) so typecheck fails and longest-wins is dead; epic-saga-propagate and funnel-text-budget tests read .Detail (verified by :raw read). The context-pack 445-pass claim is contradicted by file bytes; gates go green only after m0 lands. TMPDIR=/tmp still required for the 2 pre-existing head-guard failures.",
      "why": "Reviewer fix verified on exact bytes this turn; earlier lowercase readings were a rendering artifact. Plan targets red-to-green via m0 before docs."
    },
    {
      "assumption": "Behavior is frozen except Detail->detail normalization, prompts.ts dismiss-row filtering (mirroring human-stop) plus the dispositions.md row (prompt surface). Deviation history goes ONLY in ARCHITECTURE docs, never in agents/criteria prompt files. Legacy fingerprint migration (Q8) is retained as tested, harmless code; allowlist duplication (Q9) is locked by a contract test, not refactored.",
      "why": "Closure iteration: bounding change to the verified gaps avoids regressions and prompt debloat violations."
    },
    {
      "assumption": "Open questions Q2/Q3/Q4/Q5/Q6/Q7/Q10 are resolved document-only via the plan ADRs; operator notified on the four deviations via awareness-plan-2-autonomous-halt-deviation, awareness-plan-3-epic-config-awareness, awareness-plan-4-funnel-triage-coverage-awareness, and awareness-plan-4-remarkable-threshold-exemption-accepted.",
      "disposition": "human-awareness",
      "why": "All are accepted-semantics documentation, not implementation gaps; architect decides, operator informed."
    }
  ],
  "techDebt": [
    {
      "category": "impacting",
      "description": "Pre-existing head-guard failures when TMPDIR sits under .factory-runtime; every gate run needs the TMPDIR=/tmp workaround.",
      "id": "td-tmpdir-split",
      "resolution": "Run all gates with TMPDIR=/tmp; engine fix for the '/.factory' split is out of scope."
    },
    {
      "category": "adjacent",
      "description": "Unapplied spike-saga-commit reviewer optional nits (qualify epic-state precedence, prefix inline paths, scope removeWorktree claim, fold contextPack key). Consumers apply mentally.",
      "id": "td-spike-nits"
    },
    {
      "category": "impacting",
      "description": "Capital-D Detail in 6 runtime-bound file schemas rejects lowercase detail (review.schema.json reference-only, normalized for consistency); mergeConcern reads existing?.Detail so typecheck fails and longest-wins is dead; epic-saga and funnel tests read .Detail.",
      "id": "td-detail-casing",
      "resolution": "Fix in schema-detail-normalize-v2: normalize schemas + concerns.ts:72 + all test reads; contract and longest-wins tests verify; docs-finish-v5 depends on it."
    }
  ],
  "adrs": [
    {
      "context": "agents/criteria/dispositions.md documents fix/optional/architect/human-* but not dismiss, while triagers are allowed dismiss and review/plan-review step prompts explain it ad hoc. Adding the row to the shared criteria file would leak it into non-triager prompts (e.g. QA) unless filtered.",
      "decision": "Add one terse dismiss row + rule to dispositions.md (triager-only, reason required, kept on disk) AND extend formatDispositionsSection to filter dismiss rows/rules when the allowed set excludes dismiss, mirroring the existing human-stop filtering. QA-excludes/reviewer-includes render test locks it; prompts.test debloat budgets must pass.",
      "id": "adr-dismiss-criteria-row",
      "title": "Dismiss row in shared criteria with allowed-set filtering"
    },
    {
      "context": "Spec line 100 says autonomous consults the human only for the portion still blocked after everything unblocked is done; implementation halts immediately at plan time on a blocking ADR. Repo ADR adr-autonomous-immediate-halt.md and awareness item awareness-plan-2-autonomous-halt-deviation record this as accepted.",
      "decision": "Keep immediate halt as the accepted deviation for closure; drain-then-block scheduling stays future work. docs-finish-v5 marks it explicitly in ARCHITECTURE §1 row 18 and §8.11 only; agents/criteria/human-involvement.md is prompt criteria and MUST NOT carry deviation history.",
      "id": "adr-autonomous-immediate-halt",
      "title": "Autonomous immediate halt accepted (restated)"
    },
    {
      "context": "ARCHITECTURE §5 claims epics inherit the parent task layer, but runTaskChild loads only the child task dir pipeline.yaml, so root humanInvolvement/concerns/reviewPolicy overrides do not reach epics. Repo ADR adr-epic-config-root-only.md and awareness-plan-3-epic-config-awareness record this; implementing inheritance would change config semantics for all tasks.",
      "decision": "Document-only: per-task selectability holds per task directory; epic children do not inherit the parent task layer. Record in the §1 row 18 rewrite and corrected §5; no behavior change.",
      "id": "adr-epic-config-root-only",
      "title": "Epic config inheritance documented as deviation"
    },
    {
      "context": "Only plan-review routes architect output through plan-reviewer; architect concerns from consult/wave-report/closeup turns aggregate but stay open until an architect turn hydrates them or wave fallback runs. The simple flow has no review step and no waves, so its concerns are never triaged.",
      "decision": "Accept current coverage as the funnel semantic and document it as a known limitation in §1 row 18 and §8.11: plan/revise output is plan-reviewer-triaged; other architect output is covered by architect hydration + wave fallback; simple-task concerns stay open. No new reviewer step this iteration. Operator notified via awareness-plan-4-funnel-triage-coverage-awareness.",
      "id": "adr-funnel-triage-coverage",
      "title": "Non-plan/simple triage coverage documented as limitation"
    },
    {
      "context": "Routed rm-* remarkables always digest regardless of minDigestSeverity; ConcernCounts/state/status count c-* files only; digest mailbox entries persist with no archival rule.",
      "decision": "Document as accepted semantics in §8.11: remarkables are threshold-exempt digests (never blocking/halting, consistent with the low-noise digest directive), counts scope is c-* only, digest has no retention rule. Any gating/counting/retention change is future work. Operator notified via awareness-plan-4-remarkable-threshold-exemption-accepted.",
      "id": "adr-remarkable-counts-semantics",
      "title": "Remarkable digest exemption and counts scope accepted"
    },
    {
      "context": "isTriagerAgent returns true only for reviewer/plan-reviewer; close-up schemas carry no suggestions[] so close-up re-triage flows through concernResolutions + architect concernConfirms + wave fallback, with dismiss added to the resolution vocabulary. Repo ADR docs/adr/adr-closeup-no-suggestions-triage.md records this.",
      "decision": "Restate for plan traceability: close-ups are non-triagers; re-triage via resolutions + confirms + fallback. §1 row 18 and §8.11 cite docs/adr/adr-closeup-no-suggestions-triage.md; no behavior change.",
      "id": "adr-closeup-no-suggestions-triage",
      "title": "Close-ups removed from triager set; dismiss via resolutions (restated)"
    },
    {
      "context": "Propagated epic copies preserve child affects slugs while parent collectRoutedBlockers matches parent item slugs, so copies stay open by design and only forwarded q-epic questions block. Repo ADR docs/adr/adr-epic-push-condensed.md and epic-saga-propagate tests record this intent.",
      "decision": "Restate for plan traceability: saga architect resolves/steers propagated copies; epic-level blocking reaches the parent only via forwarded questions. §1 row 18 and §8.11 cite docs/adr/adr-epic-push-condensed.md; no behavior change.",
      "id": "adr-saga-funnel-semantics",
      "title": "Propagated copies open-only; questions block (restated)"
    }
  ]
}

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

## Output

Yield a structured JSON object matching this schema:
- iteration (integer, required, min: 1)
- status (string, required, enum: ["complete","next-iteration","blocked"])
- summary (string, required)
- question (string, optional)
- completedMilestones (array of string, optional)
- remainingMilestones (array of string, optional)
- techDebt (array of string, optional)
