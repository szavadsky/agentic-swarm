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
  "iteration": 2,
  "milestones": [
    {
      "directionalInterfaces": [
        "src/core/concerns.ts: concernFingerprint(kind+summary+location) + affects-union merge + escalated flag; listHydratedConcerns",
        "src/core/triage.ts: hydrateStepConcerns step-role UTF-8 caps + renderConcernsYaml terse + pending visibility + zero-cap ''",
        "step-runner.ts injection + iteration.ts plan-review/architect hydration (UTF-8 bytes, concerns LAST, escalated notes)",
        "agents/steps/* fragments + KNOWN_VARS matrix + 15/60 debloat"
      ],
      "id": "m1-hydration-prompts",
      "scenarios": [
        "Given wave diff 5000 bytes and open concerns 3000 bytes When wave-close-up hydrates Then concernsYaml is <=2000 bytes and < wave diff in UTF-8 bytes",
        "Given zero-diff plan-review with 4000-byte input in iteration 2+ When hydrating Then concernsYaml is <=500 bytes and < input bytes",
        "Given a dismissed concern re-emitted with higher severity When merge and hydration run Then status stays dismissed, source.escalated=true, and the escalation appears in digest and architect hydration",
        "Given the same concern re-emitted with added affects When merge runs Then a single file holds union affects with no fork",
        "Given architect, close-up, consult, develop, qa, and review prompts render When preflight and render run Then concernsYaml and humanInvolvementCriteria sections with terse raise and condense instructions appear within budgets",
        "Given zero-byte diff and input When hydrating Then concernsYaml is '' with no concerns block"
      ],
      "title": "Hydration, caps, fingerprint, prompts"
    },
    {
      "directionalInterfaces": [
        "src/core/triage.ts routeHumanDisposition + severity gates (raiseAllowlist/minDigest/minBlocking) + q-concern-<cid> dedup; item-machine concern-id exclusion",
        "src/core/concerns.ts applyCloseupResolutions/applyConcernConfirms + resolveConcern; consult decision resolve seam; wave-close-up simple fallback"
      ],
      "id": "m2-routing-lifecycle",
      "scenarios": [
        "Given plan-reviewer triaging human-stop on a concern id When the step commits Then a single q-concern-<cid> blocks task/item, derive marks blocked, and the engine halts with exit 10",
        "Given a routed rm-* remarkable or human-awareness When routing runs Then the digest entry has blocks=[] and never blocks or halts",
        "Given raiseAllowlist excluding qa and minBlockingSeverity high When QA emits a concern and a low human-stop routes Then the QA file is skipped and the stop is downgraded to digest",
        "Given wave-close-up emitting concernResolutions When it commits Then pendingResolution is set with status unchanged; architect concernConfirms accept applies resolved/routed/propagated and reject clears pending preserving status",
        "Given a consult decision resolving a blocker When the decision commits Then the concern becomes resolved and the dependent unblocks on next derive",
        "Given a simple item with open concerns and no reviewer When wave-close-up runs Then explicit resolutions triage them; fallback auto-routes tech-debt to optional and others to architect, never human-*"
      ],
      "title": "Human routing, severity, lifecycle"
    },
    {
      "directionalInterfaces": [
        "artifacts.ts structured concerns/remarkable + review-schema.ts remarkable; producer schemas otherwise unchanged",
        "engine.ts runChildTask propagateEpicConcerns (condensed push, source.epic, parent hydration, child question forward)"
      ],
      "id": "m3-contracts-epic",
      "scenarios": [
        "Given structured concerns and remarkable in developer, fact-finder, qa, close-up, decision, and reviewer outputs When validation and typecheck run Then all pass with matching TS types and reviewer remarkable no longer fails additionalProperties",
        "Given a child epic finishing with one dismissed and one open concern with 800-byte detail When runChildTask completes Then the parent gains exactly one condensed copy with source.epic and detail <800 bytes while dismissed stays local",
        "Given a propagated epic concern When the saga architect hydrates Then concernsYaml contains the epic id and summary; a restart creates no duplicate; child human questions are forwarded to the root mailbox"
      ],
      "title": "Contracts and epic propagation"
    },
    {
      "directionalInterfaces": [
        "docs/ARCHITECTURE.md §1/§5/§6.2/§8.7/§8.11/§10/§11/§13 + README + pipeline.default.yaml commentary + human-involvement.md",
        "prompts.test fragment matrix + 15/60 debloat assertion; TMPDIR=/tmp gates"
      ],
      "id": "m4-docs-gates",
      "scenarios": [
        "Given implementation complete When docs are read Then ARCHITECTURE, README, config commentary, and dispositions describe concerns lifecycle, funnel sizes, partition, producer matrix, exit-10, modes, and counts with terse prompts",
        "Given prompt fragments When prompts.test runs Then KNOWN_VARS matrix and 15/60 budgets pass",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "title": "Docs and gates"
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes. hydrateStepConcerns step-role UTF-8 caps (review/qa min(diff,2000); close-ups min(task-diff,2000); plan-review/architect* min(input,500)); terse shape with pendingResolution whenever present; zero-cap ''. Drop plan-review full-record override; architect hydration UTF-8, concerns LAST, escalated notes. Fingerprint identity kind+summary+location; affects union merge. Carry Decision 020 fixes 1/2/4 + regression tests. Behavior tests only. Verify typecheck + TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m1-hydration-prompts",
      "prodBudgetHint": 240,
      "slug": "hydration-fingerprint-caps",
      "title": "Unified hydration, caps, fingerprint"
    },
    {
      "deps": [],
      "description": "Fix TS/schema drift only. artifacts.ts: DeveloperOutput concerns Concern[], ReviewArtifact newConcerns + remarkable, FactFinder/WaveCloseup/PlanCloseup/Decision concerns/remarkable fields. review-schema.ts + review.schema.json: add remarkable so reviewers report tradeoffs without additionalProperties failure. No runtime changes. Behavior tests: per-producer validation; triage/infra/pm-edit still reject concerns. Verify typecheck + preflight.",
      "kind": "story",
      "milestoneId": "m3-contracts-epic",
      "prodBudgetHint": 80,
      "slug": "contracts-drift-fix",
      "title": "Producer type and schema drift"
    },
    {
      "deps": [
        "hydration-fingerprint-caps"
      ],
      "description": "Add terse <=5-line ## Open Concerns + ## Human involvement + 1-line raise instruction to architect-plan/revise/resume/wave-report/closeup/consults, wave/plan-close-up, develop/qa/review per KNOWN_VARS matrix; condensing output<input in reviewer/architect/close-up. Respect 15/60 debloat; extend prompts.test sentinel render assertions. Behavior tests: sections present; mode switch changes criteria. Verify preflight + typecheck.",
      "kind": "story",
      "milestoneId": "m1-hydration-prompts",
      "prodBudgetHint": 120,
      "slug": "prompt-fragments",
      "title": "Fragment matrix and raise instructions"
    },
    {
      "deps": [
        "hydration-fingerprint-caps"
      ],
      "description": "Single routeHumanDisposition in triage.ts for all triagers: async blocks [item]/[task], stop blocks item+task + exit-10, awareness + routed rm-* digest-only blocks=[]; dedup q-concern-<cid>; item-machine excludes all concern-id human-* from raw path. Severity: raiseAllowlist ingest gate (skip+journal, default all); minDigest/minBlocking thresholds (default low/low) filter digest and downgrade sub-threshold blocking. Behavior tests: plan/close-up routing, rm digest, allowlist skip, downgrade, no double-write, exit-10 only blocking stop.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m2-routing-lifecycle",
      "prodBudgetHint": 270,
      "slug": "human-router-severity",
      "title": "Human router and severity policy"
    },
    {
      "deps": [
        "hydration-fingerprint-caps"
      ],
      "description": "runChildTask propagateEpicConcerns after completion before cleanup/merge for every child status: push open+routed (skip dismissed) as condensed parent copies (detail shorter, source.epic + child prefix, status open), restart-idempotent; extend parent hydration LAST recomputed before wave-report; forward child human blocking questions to root mailbox. Spike-saga-commit directives authoritative. Behavior tests: one condensed copy, dismissed local, saga input contains id, restart no dup, question forwarded.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m3-contracts-epic",
      "prodBudgetHint": 180,
      "slug": "epic-saga-propagate",
      "title": "Epic to saga propagation"
    },
    {
      "deps": [
        "epic-saga-propagate",
        "human-router-severity",
        "prompt-fragments"
      ],
      "description": "Close-up propose/confirm lifecycle + unblock + simple fallback. concernResolutions->pending (status unchanged); concernConfirms accept (resolve->resolved, carry->routed+architect, propagate->parent/digest) / reject (clear pending, preserve status, no disposition) per Decision 020 fix 3. Consult resolve decision->resolved unblocks dependents. Wave-close-up fallback: tech-debt->optional, others->architect, human-* never. Behavior tests: pending/confirm matrix, reject preserves open, consult unblock, simple fallback, resolved reachable.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m2-routing-lifecycle",
      "prodBudgetHint": 220,
      "slug": "closeup-lifecycle-resolve",
      "title": "Close-up lifecycle and unblock"
    },
    {
      "deps": [
        "closeup-lifecycle-resolve",
        "contracts-drift-fix",
        "epic-saga-propagate",
        "human-router-severity",
        "hydration-fingerprint-caps",
        "prompt-fragments"
      ],
      "description": "Update ARCHITECTURE §1 row 18 + §5 + §6.2 + §8.7 + new §8.11 + §10 + §11 + §13, README concerns/modes section, config commentary sync with landed severity/router semantics, human-involvement.md immediate-halt note; prompts.test 15/60 debloat assertion; consolidate concerns behavior coverage. Final gates: bun run typecheck + TMPDIR=/tmp bun test green.",
      "kind": "story",
      "milestoneId": "m4-docs-gates",
      "prodBudgetHint": 100,
      "slug": "docs-finish-v3",
      "title": "Docs and suite consolidation"
    }
  ],
  "assumptions": [
    {
      "assumption": "Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures do not mask regressions.",
      "why": "Baseline red only under .factory-runtime TMPDIR; suite green with TMPDIR=/tmp. Out of scope."
    },
    {
      "assumption": "Spike findings spike-text-budget (byte caps) and spike-saga-commit (serialization/derive/commit/propagation) remain authoritative; no re-run.",
      "why": "Both accepted in iteration 1 with binding downstream directives; iteration-2 items implement them."
    },
    {
      "assumption": "Dismissed/routed/resolved stay terminal-in-merge; escalated-severity-on-dismissed surfaces in digest + architect hydration; triage is the only reopen path.",
      "why": "Operator directive 1794112659180 decided keep + digest surfacing."
    },
    {
      "assumption": "funnel-closeups-v3 unmerged work is discarded; its Decision 020 persist guidance (4 fixes) is baked into hydration-fingerprint-caps (fixes 1/2/4) and closeup-lifecycle-resolve (fix 3).",
      "why": "Iteration 1 closed with v3 running/unmerged; reimplementing correctly avoids rebasing stale branch state."
    },
    {
      "assumption": "Severity defaults low/low (no filtering) preserving iteration-1 behavior; tasks opt into noise reduction via pipeline.yaml.",
      "why": "Unblocks landing the policy without changing merged routing behavior by default."
    }
  ],
  "techDebt": [
    {
      "category": "adjacent",
      "description": "Pre-existing head-guard failures when TMPDIR sits under .factory-runtime because step-runner splits on /.factory. Baseline red; green with TMPDIR=/tmp. Out of scope.",
      "id": "td-tmpdir-split"
    },
    {
      "category": "adjacent",
      "description": "Unapplied spike-saga-commit reviewer optional nits (qualify epic-state-from-child-closeup with isMerged precedence, prefix inline paths, scope removeWorktree claim, fold contextPack key). Consumers apply mentally.",
      "id": "td-spike-nits"
    }
  ],
  "adrs": [
    {
      "context": "Two hydration helpers diverge (hydrateConcernsYaml full-detail uncapped vs renderConcernsYaml terse capped); spike byte contract lives only in tests; plan-review overrides terse value with full records; buildArchitectHydration caps JS length not UTF-8; escalated dismissed invisible.",
      "decision": "Single owner: triage.ts hydrateStepConcerns + renderConcernsYaml. Step-role UTF-8 caps on promptVars only (stored artifacts keep full detail): review/qa min(diff,2000), wave/plan-close-up min(task-diff,2000), plan-review/architect* min(input,500) where input=sum registered input vars. Terse shape id/kind/severity/summary/affects? plus pendingResolution whenever present. Zero-cap returns ''. Plan-review drops full-record override. buildArchitectHydration UTF-8 capped, concerns LAST, escalated notes included.",
      "id": "adr-hydration-single-cap",
      "title": "Single hydration module with step-role byte caps"
    },
    {
      "context": "Fingerprint includes sorted affects, so re-emitting a concern with an added item/epic ref forks a second file instead of merging; dedup only holds for identical affects.",
      "decision": "Identity is kind+normalized summary+location only; affects merged as sorted-union on re-emit. Severity keeps max, detail keeps longer/latest, updatedAt/lastSeen advance, terminal statuses preserved, escalated flag on severity rise. Refines adr-fingerprint-merge.",
      "id": "adr-fingerprint-affects-union",
      "title": "Fingerprint identity without affects, union merge"
    },
    {
      "context": "Only review/plan-review consume concernsYaml; architect/close-up/consult/develop/qa fragments lack sections though KNOWN_VARS registers them; preflight silent on unused vars; no prompt tells producers to raise concerns/remarkable.",
      "decision": "Add terse <=5-line ## Open Concerns {{concernsYaml}} + ## Human involvement {{humanInvolvementCriteria}} + 1-line raise instruction to architect-plan/revise/resume/wave-report/closeup/consults, wave/plan-close-up, develop/qa/review per KNOWN_VARS matrix. Reviewer/architect/close-up carry condensing rule output-bytes<input-bytes. 15/60 debloat enforced in prompts.test.",
      "id": "adr-prompt-fragment-matrix",
      "title": "Full fragment matrix with raise instructions"
    },
    {
      "context": "raiseAllowlist/minDigestSeverity/minBlockingSeverity typed/validated/shipped but never read; no semantics for who may raise or what reaches digest vs blocking.",
      "decision": "raiseAllowlist enforced at step-runner ingest (agent absent -> skip file + journal, step stays ok; default all). Severity order low<medium<high; digest written only if severity>=minDigestSeverity; blocks set only if severity>=minBlockingSeverity else downgraded to digest (stop loses exit-10). Defaults low/low = no-op preserving iteration-1 behavior; tasks opt into filtering.",
      "id": "adr-severity-policy-active",
      "title": "Active severity and allowlist policy"
    },
    {
      "context": "applyReviewTriage writes only human-async; awareness/stop rely on item-machine raw suggestions, so plan/close-up/architect human dispositions never reach mailbox; rm-* has no digest; item-machine double-writes stop/awareness concern ids.",
      "decision": "Single routeHumanDisposition in triage.ts for all triagers at ingest: human-async q-concern-<cid> blocks=[item] or [task] when task-level; human-stop blocks item+task (task-level [task]) + exit-10; human-awareness and routed rm-* blocks=[] digest-only, never blocking/halting. Dedup by file existence. item-machine excludes ALL concern-id human-* from raw path.",
      "id": "adr-human-router-single",
      "title": "Single human-disposition router with digest"
    },
    {
      "context": "applyCloseupResolutions records pending only with no applier; resolved unreachable in prod; consult decisions never transition concerns so blocked-by-concern never unblocks; simple items have no reviewer.",
      "decision": "Close-up proposes via concernResolutions (status unchanged, pending set); architect wave-report/closeup confirms via concernConfirms: accept+resolve->resolved, accept+carry->routed+architect, accept+propagate->parent copy/digest; reject clears pending, preserves status, sets no disposition. Consult decision with resolution resolve->resolved, unblocking on next derive. Wave-close-up act fallback for untriaged open: tech-debt->optional, others->architect, human-* never auto.",
      "id": "adr-closeup-lifecycle-resolved",
      "title": "Close-up propose/confirm lifecycle with unblock"
    },
    {
      "context": "runChildTask writes only child-closeup status; child concerns/ isolated under child task dir; saga architect never sees epic concerns; spec requires epic->saga propagate with review/steer.",
      "decision": "Push on child close in runChildTask after completion before cleanup/merge for every child status: copy open+routed (skip dismissed) as condensed parent files (summary kept, detail strictly shorter, source.epic + child record prefix, status open), restart-idempotent by fingerprint. Parent buildArchitectHydration extended LAST, recomputed before wave-report. Forward child human blocking questions to root mailbox.",
      "id": "adr-epic-push-condensed",
      "title": "Epic push with condensed parent copies"
    },
    {
      "context": "Mode table says autonomous defers blocking until unblocked work drains, but implementation routes blocking ADRs at plan time and halts immediately; deferral needs drain scheduling.",
      "decision": "Keep immediate halt as accepted deviation for iteration 2 (simpler, preserves exit-10 contract, matches tested behavior). Document in ARCHITECTURE 8.11 and human-involvement.md; drain-then-block scheduling is future work.",
      "id": "adr-autonomous-immediate-halt",
      "title": "Autonomous immediate halt accepted"
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
