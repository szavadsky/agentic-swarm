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
  "hydrationBytes": 40000,
  "contextPackBytes": 40000,
  "timeoutNudgeSec": 300,
  "minFreeDiskMb": 2048
}` section; do not invent numbers):
  - Plan bounds: milestone/item counts within limits, acyclic dependencies, unique slugs.
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
  "iteration": 1,
  "milestones": [
    {
      "directionalInterfaces": [
        "artifacts.ts: Concern, ConcernKind, ConcernSeverity, ConcernStatus, RemarkableDecision, StoredConcernArtifact; ReviewDisposition += dismiss; PlanAdr.blocking?: boolean; StateArtifact.concernCounts?",
        "config/schemas/developer-output.schema.json, plan.schema.json, wave-closeup.schema.json, plan-closeup.schema.json, pipeline.schema.json: structured concerns[] + remarkableDecisions[] + blocking + humanInvolvement",
        "src/core/concerns.ts: concernFingerprint(c)->string; aggregateConcerns(taskDir, raw[], source)->StoredConcernArtifact[]; listOpenConcerns(taskDir)->StoredConcernArtifact[]",
        "src/core/records/review-schema.ts: generateReviewSchema(allowed) admits dismiss for triager roles"
      ],
      "id": "m1-contracts-aggregate",
      "scenarios": [
        "Given a developer step emitting concerns [{kind:blocker, summary, detail, severity, affects}] When the step commits Then taskDir/concerns/c-<fp10>.yaml exists with status open and source.record pointing at the step record",
        "Given the same concern re-emitted on retry or restart When aggregation runs Then no second file is created and existing triage status is preserved",
        "Given an invalid concern payload When validateAndRepair runs Then output is repaired or rejected per schema without breaking existing outputs"
      ],
      "title": "Contracts and aggregation foundation"
    },
    {
      "directionalInterfaces": [
        "prompt-vars KNOWN_VARS += concernsYaml; formatConcernsSection(concerns)->string terse capped list",
        "item-machine.ts review promptVars + writeArtifact triage persistence via applyConcernTriage(taskDir, suggestions)",
        "iteration.ts plan-review promptVars + writeArtifact triage persistence (same vocabulary)",
        "agents/reviewer.md, agents/plan-reviewer.md, agents/criteria/dispositions.md: terse confirm/dismiss/condense fragment"
      ],
      "id": "m2-triage",
      "scenarios": [
        "Given open concerns from develop/QA When review runs Then the prompt receives concernsYaml with id/kind/severity/summary/affects and terse triage instructions",
        "Given reviewer emits suggestion {id:<concernId>, disposition:dismiss} with reason When review commits Then concerns/<id>.yaml has status dismissed plus dismissReason and no routing occurs",
        "Given architect plan emits concerns and remarkable decisions When plan-review runs Then plan-reviewer triages them with the same vocabulary and non-dismissed items stay open"
      ],
      "title": "Reviewer triage with dismiss"
    },
    {
      "directionalInterfaces": [
        "src/core/concerns.ts: routeConcerns(taskDir, triaged)->{blockedItems, mailboxWrites, debtAdds}; markConcernRouted(taskDir, id, disposition)",
        "derive/task.ts debt += routed tech-debt concerns; derive/wave.ts + scheduler blockedByConcern() transitive fixpoint; consults.ts blocker trigger",
        "steer.ts writeQuestion reuse for human-async/human-stop/blocking ADR; awareness/digest writes with blocks:[]"
      ],
      "id": "m3-routing",
      "scenarios": [
        "Given a triaged blocker concern with affects:[dependent-item] When routing runs Then the dependent item derives blocked and an architect consult decision is written",
        "Given a triaged tech-debt concern When state derives Then deriveTaskState debt includes its summary and close-ups can list it",
        "Given triaged human-async/human-stop/human-awareness concerns When routing runs Then mailbox q-*.yaml files are written with blocks set for async/stop and empty blocks for awareness digest",
        "Given plan ADRs with blocking true and false When plan commits Then blocking ADR creates a mailbox question per mode while remarkable ADR appears only in the digest"
      ],
      "title": "Routing to blocked, architect, mailbox, debt"
    },
    {
      "directionalInterfaces": [
        "iteration.ts buildArchitectHydration() += openConcernsDigest (condensed, byte-capped); close-up promptVars += openConcernsYaml; close-up writeArtifact re-triage",
        "engine.ts runChildTask: propagateEpicConcerns(childTaskDir, parentTaskDir, epicSlug) condensed copies with source.epic",
        "derive/task.ts toStateArtifact().concerns counts; cli/status.ts Concerns + digest rendering"
      ],
      "id": "m4-funnel-surface",
      "replanAfter": true,
      "scenarios": [
        "Given open concerns at wave end When wave-close-up and architect-wave-report run Then the close-up lists condensed open concerns within the byte budget and the architect output resolves or carries each",
        "Given a child epic finishing with undismissed epic concerns When runChildTask completes Then the parent concerns/ gains condensed copies hydrating the saga architect next turn",
        "Given concerns in mixed statuses When state refreshes and factory status runs Then state.yaml and CLI show {open, dismissed, routed, resolved} counts plus remarkable digest"
      ],
      "title": "Funnel, close-ups, saga propagation, surfacing"
    },
    {
      "directionalInterfaces": [
        "config/schemas/pipeline.schema.json + PipelineConfig.humanInvolvement?: autonomous|principal|detailed; config/pipeline.default.yaml commented presets",
        "agents/criteria/human-involvement.md + prompts.ts loadCriteriaBundle wiring; KNOWN_VARS += humanInvolvementCriteria",
        "docs/ARCHITECTURE.md §1 row 18 + §6.2 + §8, README.md, config commentary"
      ],
      "id": "m5-modes-docs",
      "scenarios": [
        "Given pipeline.yaml humanInvolvement: principal When reviewer and architect prompts render Then the mode-specific criteria fragment is included and preflightPrompts passes",
        "Given the default config When an operator reads pipeline.default.yaml Then commented autonomous/principal/detailed presets explain mailbox vs digest behavior per mode",
        "Given implementation complete When docs are read Then ARCHITECTURE.md, README, and config commentary describe concerns/ lifecycle, funnel, ADRs, and modes with terse prompts"
      ],
      "title": "Human-involvement modes and docs"
    }
  ],
  "uncertainties": [
    {
      "description": "Exact byte-cap and condense point for funnel text budget (diff bytes vs fixed cap) and where truncation applies without losing stored detail.",
      "id": "u-text-budget",
      "spikeOutlines": [
        "test-assumptions: probe diff sizes vs concern detail sizes in existing fixtures; confirm min(diffBytes,2000) cap keeps prompts terse without empty digests"
      ]
    },
    {
      "description": "Whether epic concern propagation should copy files into parent concerns/ at child completion or only summarize in child-closeup.yaml for architect hydration.",
      "id": "u-saga-propagation",
      "spikeOutlines": [
        "fact-finder: verify runChildTask commit point and parent hydration read path; confirm parent-copy with source.epic survives worktree cleanup and derives correctly"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Define Concern/RemarkableDecision/StoredConcernArtifact, ReviewDisposition+dismiss, PlanAdr.blocking, PipelineConfig.humanInvolvement, StateArtifact concern counts in artifacts.ts; update developer-output/plan/wave-closeup/plan-closeup/pipeline schemas + generateReviewSchema dismiss support. Tests: typecheck + preflight + schema repair path via FakeHarness invalid-concern fixture.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-contracts",
      "title": "Concern contracts, schemas, dismiss vocabulary"
    },
    {
      "deps": [
        "concerns-contracts"
      ],
      "description": "Implement src/core/concerns.ts (fingerprint, aggregateConcerns, listOpenConcerns, applyConcernTriage, atomic YAML, idempotent dedup preserving dismissed/routed status + source record pointer). Wire aggregation into item-machine develop/qa/review and iteration architect/plan writeArtifact writing taskWt concerns/. Behavior tests in test/engine/concerns-funnel.test.ts: file created with open+source, retry dedup single file. Run: cd plugins/software-factory && TMPDIR=/tmp bun test test/engine/concerns-funnel.test.ts.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-store",
      "title": "Concerns store with fingerprint aggregation"
    },
    {
      "deps": [
        "concerns-store"
      ],
      "description": "Item reviewer triage: unify reviewAllowed resolver (prompt+schema), add concernsYaml KNOWN_VAR + terse formatConcernsSection, update reviewer.md + dispositions criteria (confirm/dismiss/condense), persist triage in review writeArtifact via applyConcernTriage. Behavior tests: dismiss with reason -> dismissed no routing; fix/architect/human/tech-debt dispositions persist. Keep prompts terse.",
      "kind": "story",
      "milestoneId": "m2-triage",
      "slug": "reviewer-triage",
      "title": "Workhorse reviewer concern triage"
    },
    {
      "deps": [
        "concerns-store"
      ],
      "description": "Architect-output path: aggregate architect plan/revise concerns+remarkable decisions, hydrate plan-review prompt with concernsYaml, same dismiss vocabulary in plan-reviewer.md, persist triage identically. Behavior tests: architect concern dismissed vs confirmed by plan-reviewer; remarkable decisions stored under concerns/remarkable-*.yaml or decisions note.",
      "kind": "story",
      "milestoneId": "m2-triage",
      "slug": "plan-reviewer-triage",
      "title": "Plan-reviewer triage for architect output"
    },
    {
      "deps": [
        "reviewer-triage",
        "plan-reviewer-triage"
      ],
      "description": "Blocker: map affects[] to item slugs, extend derive/wave + scheduler blockedByConcern with transitive fixpoint, trigger runItemConsult decision write on newly blocked. Architect: write open architect-disposition digest consumed by buildArchitectHydration for wave-report/next-plan. Behavior tests: blocker on dependent -> derived blocked + decisions/ file; architect concern appears in next architect turn input.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-blocker-architect",
      "title": "Blocker and architect routing"
    },
    {
      "deps": [
        "reviewer-triage"
      ],
      "description": "human-async/human-stop -> writeQuestion with blocks per disposition; human-awareness -> tousertoreview digest entry with blocks:[] never blocking; tech-debt kind or routed tech-debt disposition -> deriveTaskState debt set. Behavior tests: mailbox files per disposition, debt includes [item] summary, awareness never halts engine.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-human-debt",
      "title": "Human mailbox and tech-debt routing"
    },
    {
      "deps": [
        "routing-human-debt"
      ],
      "description": "End-to-end blocking vs remarkable ADRs: full ADR md (title/context/decision/consequences/blocking), blocking:true -> mailbox question gated by humanInvolvement mode, blocking:false/remarkable -> digest only never waiting. Behavior tests: blocking creates q-* with blocks, remarkable appears only in digest/status.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "adr-blocking-digest",
      "title": "Blocking vs remarkable ADR routing"
    },
    {
      "deps": [
        "routing-blocker-architect",
        "adr-blocking-digest"
      ],
      "description": "Hydrate wave-close-up/plan-close-up + architect-wave-report/architect-closeup with condensed openConcernsDigest (byte-cap min(diffBytes,2000)); close-up reviewers re-triage (resolve/carry/propagate); runChildTask propagates undismissed epic concerns as condensed parent copies with source.epic. Behavior tests: close-up lists + re-triage, epic concern reaches saga architect input.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "replanAfter": true,
      "slug": "funnel-closeups-saga",
      "title": "Funnel close-ups and epic-saga propagation"
    },
    {
      "deps": [
        "concerns-store"
      ],
      "description": "Add concerns {open,dismissed,routed,resolved} counts to toStateArtifact/refreshStateYaml/state.schema.json; render Concerns line + remarkable digest in cli/status.ts alongside questions/debt. Behavior tests: mixed-status fixtures -> state.yaml counts + CLI output contains counts.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "slug": "status-state-surface",
      "title": "State counts and factory status surfacing"
    },
    {
      "deps": [
        "reviewer-triage",
        "plan-reviewer-triage"
      ],
      "description": "Add humanInvolvement to pipeline.schema.json + loader/merge, commented autonomous/principal/detailed presets in pipeline.default.yaml, agents/criteria/human-involvement.md terse fragment + KNOWN_VARS + loadCriteriaBundle wiring into reviewer/architect prompts. Behavior tests: mode switch changes criteria inclusion + blocking-ADR/mailbox behavior; preflightPrompts green.",
      "kind": "story",
      "milestoneId": "m5-modes-docs",
      "slug": "modes-prompts",
      "title": "Human-involvement modes and prompt wiring"
    },
    {
      "deps": [
        "funnel-closeups-saga",
        "status-state-surface",
        "modes-prompts"
      ],
      "description": "Update docs/ARCHITECTURE.md §1 row 18 + §6.2 concerns/ + §8 funnel/routing/modes, README, config commentary; debloat-check prompts; consolidate test/engine/concerns-funnel.test.ts + steer/CLI coverage. Final gates: cd plugins/software-factory && bun run typecheck && TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m5-modes-docs",
      "slug": "docs-finish",
      "title": "Docs, config commentary, suite consolidation"
    }
  ],
  "assumptions": [
    {
      "assumption": "Gates run with TMPDIR=/tmp (or equivalent non-.factory-runtime tmp) so the 2 pre-existing head-guard failures do not mask regressions.",
      "why": "Infra baseline is red (269 pass/2 fail) only because TMPDIR under .factory-runtime breaks the '/.factory' worktree split; suite is green (271 pass) with TMPDIR=/tmp. No fix in this task scope."
    },
    {
      "assumption": "Concern fingerprint = sha1/sha256 over normalized {kind,summary,detail?,location?,affects?} (reuse fingerprintObject); id c-{hash10} stable across steps/attempts/restarts.",
      "why": "Matches steer.ts writeQuestion and fingerprint.ts precedent; gives dedup without central sequence."
    },
    {
      "assumption": "Per-agent reviewPolicy override divergence (item-machine prompt vs step-runner schema) will be unified into one resolver helper in M1/M2.",
      "why": "Dismiss must appear in both prompt criteria and JSON-schema enum or triage fails validation; current code resolves them in two places."
    },
    {
      "assumption": "Epic->saga propagation copies condensed concern records into parent concerns/ with source.epic set, in runChildTask after child-closeup.yaml.",
      "why": "Parent architect hydration already reads parent concerns/; copy avoids cross-taskDir reads and survives child worktree cleanup."
    }
  ],
  "techDebt": [
    {
      "category": "adjacent",
      "description": "Pre-existing head-guard gate failures (2 fail) when TMPDIR sits under .factory-runtime because step-runner splits taskDir on '/.factory'. Baseline red; green with TMPDIR=/tmp. Out of scope for concerns-funnel.",
      "id": "td-tmpdir-split"
    },
    {
      "category": "impacting",
      "description": "reviewAllowed resolved in two places: item-machine prompt uses global-or-per-agent fallback while step-runner schema uses only global allowedDispositions, so per-agent dismiss could fail validation.",
      "id": "td-reviewpolicy-divergence",
      "resolution": "Unify into single resolveReviewAllowed(pipeline, agent) helper used by both prompt wiring and generateReviewSchema in concerns-contracts/reviewer-triage."
    },
    {
      "category": "impacting",
      "description": "ADR markdown writer persists only title+context, dropping decision/consequences, and PlanAdr lacks blocking flag.",
      "id": "td-adr-md-truncated",
      "resolution": "Fix in adr-blocking-digest: write full ADR md with decision/consequences/blocking and add blocking to type+schema."
    },
    {
      "category": "impacting",
      "description": "human-awareness and human-stop dispositions currently ignored (only human-async writes mailbox), and debt derivation ignores routed concerns.",
      "id": "td-human-debt-gaps",
      "resolution": "Fix in routing-human-debt: route awareness to non-blocking digest, stop with halt semantics, and extend deriveTaskState debt with routed tech-debt concerns."
    }
  ],
  "adrs": [
    {
      "context": "Item steps commit only childWt (topic/{task}--{item}) while {task}/concerns/ lives on taskWt (topic/{task}). Precedent: writeQuestion and refreshStateYaml already write taskWt files during item steps, committed at wave merge/edits.",
      "decision": "Aggregate directly to taskWt/{task}/concerns/{id}.yaml inside step writeArtifact seams (item-machine + iteration). No per-item staging dir, no dual-worktree commit. Task-level commit at existing merge/edit points covers concerns.",
      "id": "adr-concern-store-taskwt",
      "title": "Aggregate concerns directly to taskWt concerns/",
      "consequences": "Simplest invariant; matches steer/state precedent. Wave-merge commits must include concerns/ (already commitAll taskWt). Restart/retry dedup must be idempotent since file may exist uncommitted."
    },
    {
      "context": "Reviewers must triage worker concerns with review vocabulary plus dismiss. Options: reuse suggestions[] with id=concernId, or add separate concernTriage[] branch.",
      "decision": "Reuse ReviewArtifact.suggestions[] with disposition enum extended by dismiss. Match suggestion.id to concern id for triage; other suggestions remain normal review findings. Single vocabulary, single schema path.",
      "id": "adr-triage-suggestions-dismiss",
      "title": "Triage via suggestions[] plus dismiss",
      "consequences": "Zero new top-level review branch; generateReviewSchema + dispositionsCriteria carry dismiss for triager roles only. Triage persistence matches on id prefix c-; unmatched ids ignored."
    },
    {
      "context": "Routing must affect scheduling (blocker), next architect input (architect), mailbox (human-*), and debt list (tech-debt) without forking source of truth.",
      "decision": "Concerns stay authoritative in concerns/{id}.yaml with status open|dismissed|routed|resolved + disposition. All effects derived or written once at triage time: blocked via derive/scheduler reading routed blockers, architect via hydration file, human-* via writeQuestion, debt via deriveTaskState reading routed tech-debt.",
      "id": "adr-routing-derived-state",
      "title": "File-authoritative concerns, derived routing effects",
      "consequences": "No duplicate state; restarts re-derive identically. Triage write must atomically update concern status + side-effect write (mailbox/consult) in same writeArtifact call."
    },
    {
      "context": "Remarkable decisions and human-awareness must surface without blocking. Options: new steer/digest/ dir vs reuse tousertoreview with non-blocking semantics.",
      "decision": "Reuse steer/tousertoreview/{id}.yaml with disposition human-awareness, blocks:[] (empty), status open. Digest = filtered view of non-blocking awareness items. No new top-level dir.",
      "id": "adr-digest-mailbox",
      "title": "Digest as non-blocking tousertoreview entries",
      "consequences": "factory status + existing mailbox loop render it with zero new watch paths. Engine must never treat empty-blocks awareness items as blockers."
    },
    {
      "context": "Spec requires autonomous|principal|detailed presets selectable per task. pipeline.schema.json has additionalProperties:false at root.",
      "decision": "Add top-level PipelineConfig.humanInvolvement enum with default autonomous, plus commented presets in config/pipeline.default.yaml and agents/criteria/human-involvement.md fragment wired through loadCriteriaBundle into reviewer/architect prompts.",
      "id": "adr-humaninvolvement-config",
      "title": "Top-level humanInvolvement mode + criteria fragment",
      "consequences": "Clean layering (default->project->task); per-task override trivial. Requires pipeline.schema.json + artifacts.ts + KNOWN_VARS + preflight updates together."
    },
    {
      "context": "Spec funnel rule: each level passes up less detail, never more text than code summarized. Needs enforcement without brittle failures.",
      "decision": "Prompt-guided condensing (terse fragments) plus mechanical cap in engine: condensed concern detail truncated to min(diffBytes, 2000 chars) when hydrating close-ups/reports; full detail stays in concerns/{id}.yaml.",
      "id": "adr-funnel-text-budget",
      "title": "Prompt condensing plus hydration byte-cap",
      "consequences": "Funnel bloat bounded without rejecting agent output. Cap applied only to hydrated promptVars (concernsYaml/openConcernsDigest), never to stored artifact."
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
  "hydrationBytes": 40000,
  "contextPackBytes": 40000,
  "timeoutNudgeSec": 300,
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
