# Step: PM Amend

## Goal
Yield ONLY the NEW items for this plan amendment (`edits-{N}.{k}.yaml` delta). The engine merges your delta into active execution.

## Rules
- Delta ONLY: yield NEW items and nothing else. NEVER re-emit existing items — re-emitted slugs are dropped deterministically and an empty delta discards the amendment.
- Yield only: you have NO file tools. Everything you need is below (`{
  "iteration": 1,
  "milestones": [
    {
      "directionalInterfaces": [
        "artifacts.ts: Concern, RemarkableDecision, StoredConcernArtifact(+pendingResolution?, source.escalated?), ReviewDisposition+dismiss (no tech-debt), PlanAdr.blocking, PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeverity,minBlockingSeverity}, reviewPolicy.default canonical",
        "config/schemas: shared concern/remarkable partial in developer, fact-finder, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup, architect reports; triage/infra/pm-edit out of scope; dismiss detail-required; closeup concernResolutions",
        "src/core/concerns.ts: concernFingerprint(identity), aggregateConcerns(merge+escalated), listOpenConcerns, applyConcernTriage(exact-id,isTriager), applyCloseupResolutions, partitionSuggestions(triage vs findings)",
        "src/core/review-policy.ts: resolveReviewAllowed(pipeline,agent,isTriager) per-agent>default>builtin, legacy allowedDispositions alias, dismiss auto-append for triagers; generateReviewSchema uses it; taskWt runExclusive+atomic+immediate-commit helper"
      ],
      "id": "m1-contracts-aggregate",
      "scenarios": [
        "Given a developer step emitting a blocker concern When the step commits Then concerns/c-<fp10>.yaml exists with status open and source.record pointing at the step record",
        "Given the same concern re-emitted on retry When aggregation runs Then exactly one file exists, prior dismissed/routed preserved, updatedAt/lastSeen advance",
        "Given a concern missing severity and detail When validation runs Then severity defaults to medium, detail defaults to summary, and the file is created",
        "Given a concern with unknown kind When validation runs Then the step errors, no concerns file is written, existing files stay untouched",
        "Given developer, fact-finder, qa, poc, review-new, plan, consult, closeup, and architect-report outputs carrying concerns[]+remarkable[] When steps commit Then each aggregates to concerns/c-*.yaml or rm-*.yaml with open status and source pointer; triage/infra/pm-edit carry none",
        "Given reviewer output with new concerns[] plus suggestions triaging a pre-existing id When the step commits Then the new concern aggregates open and only the pre-existing id is triaged (no same-step self-dismiss)",
        "Given reviewPolicy.default [fix,optional] plus reviewer override [fix,optional,architect] When resolveReviewAllowed runs Then reviewer triager gets override+dismiss and QA non-triager gets default without dismiss",
        "Given a dismissed concern re-emitted with higher severity When merge runs Then status stays dismissed but source.escalated=true and the escalation appears in digest and architect hydration"
      ],
      "title": "Contracts and aggregation foundation"
    },
    {
      "directionalInterfaces": [
        "prompt-vars KNOWN_VARS+descriptions: concernsYaml in steps/review, steps/plan-review, steps/wave-close-up, steps/plan-close-up, architect-plan, architect-wave-report, architect-closeup, architect-consult-*; humanInvolvementCriteria in review, plan-review, architect-*",
        "item-machine review + iteration plan-review promptVars and writeArtifact with isTriager gate, partitionSuggestions excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox dedup q-concern-<cid>",
        "agents reviewer, plan-reviewer, criteria/dispositions, criteria/human-involvement terse confirm/dismiss/condense plus blocking table plus condensing rule output-bytes<input-bytes",
        "config/pipeline.default.yaml commented autonomous/principal/detailed presets with blocking table plus concerns raise/threshold examples"
      ],
      "id": "m2-triage-modes",
      "scenarios": [
        "Given open item concerns When review runs Then steps/review receives concernsYaml with id/kind/severity/summary/affects and terse triage instructions",
        "Given reviewer suggestion matching a concern id with disposition dismiss and detail When review commits Then that file has status dismissed plus dismissReason=detail and no mailbox, debt, blocked, or approval effect",
        "Given a matching dismiss suggestion without detail When review commits Then the step errors and no triage is persisted",
        "Given QA emitting a matching concern id When QA commits Then no triage is applied and the file stays open",
        "Given matching suggestions with fix, optional, architect, or human-* When review commits Then each file becomes routed with disposition persisted; triage ids are excluded from normal fix-loop/approval/mailbox except fix-on-concern sets fixRequired once; human-async on a concern writes a single q-concern-<cid>",
        "Given architect plan concerns plus an rm-* file When plan-review runs Then plan-reviewer triages with the same vocabulary and non-dismissed files become routed; debt predicate is kind==tech-debt&&routed or disposition==optional (no tech-debt disposition)",
        "Given pipeline.yaml humanInvolvement principal When reviewer and architect prompts render Then the mode criteria fragment is included and preflightPrompts passes"
      ],
      "title": "Reviewer triage and modes"
    },
    {
      "directionalInterfaces": [
        "derive/task.ts collectRoutedBlockers(taskDir)->Set plus deriveWave/deriveItem integration; scheduler.blockedByConcern(items,concernBlocked) pure reusing blockedByFailure fixpoint, unioned, cascade only over declared deps",
        "act-phase routing: triage writeArtifact plus wave-act newly-blocked check writing decisions/concern-<cid>.yaml exactly once (restart idempotent); buildArchitectHydration extended with concernsYaml digest",
        "steer writeQuestion for human-async/stop/blocking ADR; derive/task blocking-vs-digest split (blocks.length>0 vs awareness empty); debt predicate; human-stop exit-10 halt plus blocked"
      ],
      "id": "m3-routing",
      "scenarios": [
        "Given a routed blocker whose affects names a declared dependent When derive runs Then the dependent derives blocked with no writes; non-dependents are unaffected and transitive blocking follows declared deps only",
        "Given a newly blocked dependent When the act phase runs Then exactly one decisions/concern-<cid>.yaml is written and a restart writes no second file",
        "Given a routed architect concern When the next architect turn builds hydration Then its concernsYaml input contains that concern id and summary",
        "Given a routed human-async concern When routing runs Then mailbox q-concern-<cid> has blocks=[item], the item derives blocked, and the engine continues without exit 10",
        "Given a routed human-stop concern When routing runs Then the mailbox entry blocks task/item, item and task derive blocked, and the engine halts with exit code 10 until answered or dismissed",
        "Given a routed human-awareness concern When routing runs Then the mailbox entry has blocks=[] in the Digest section and the engine continues with no blocked set and no exit 10",
        "Given plan ADRs blocking true and false under autonomous mode When plan commits Then the blocking ADR creates a mailbox question with blocks while the remarkable ADR appears only in the digest; debt includes kind tech-debt routed or disposition optional routed as [item] summary"
      ],
      "title": "Routing to blocked, architect, mailbox, debt"
    },
    {
      "directionalInterfaces": [
        "closeup schemas concernResolutions resolve/carry/propagate plus concerns[]/remarkable[]; StoredConcern.pendingResolution{action,note,by,at}; applyCloseupResolutions proposes (status stays routed); architect concernConfirms accept/reject applies; propagate to parent concerns/ copy or human digest",
        "iteration.ts concernsYaml hydration capped UTF-8 bytes: code steps min(diffBytes,2000); zero-diff orchestration min(inputBytes,500); reviewer/architect condensing prompts require output<input; engine truncates hydrated var only",
        "engine.ts runChildTask propagateEpicConcerns after child completion before cleanup/merge, condensed copies with source.epic, parent hydration extended; size assert parent-detail<child-detail",
        "derive/task.ts toStateArtifact().concerns counts (missing dir zeros, corrupt skip+warn); cli/status.ts Concerns plus separate Blocking vs Digest sections"
      ],
      "id": "m4-funnel-surface",
      "replanAfter": true,
      "scenarios": [
        "Given wave diff 5000 bytes and open concerns 3000 bytes When wave-close-up hydrates Then concernsYaml is <=2000 bytes and < wave diff in UTF-8 bytes",
        "Given zero-diff plan-review with 4000-byte input When hydrating Then concernsYaml is <=500 bytes and < input bytes",
        "Given wave-close-up emitting concernResolutions resolve/carry/propagate When it commits Then files stay routed with pendingResolution set; architect accept applies resolved/routed/propagated and reject clears pending",
        "Given a simple item with open concerns and no reviewer When wave-close-up runs Then explicit resolutions triage them; fallback auto-routes kind tech-debt to optional (debt) and other kinds to architect (carry); human-* is never auto-routed",
        "Given a child epic finishing with one dismissed and one open concern with 800-byte detail When runChildTask completes before cleanup Then the parent gains exactly one condensed copy with source.epic, detail <800 bytes, hydrating saga architect concernsYaml",
        "Given mixed-status concerns plus a corrupt yaml file When state refreshes and factory status runs Then state.yaml counts skip the corrupt file with warn, missing dir yields zeros, and CLI shows Concerns plus Blocking vs Digest sections"
      ],
      "title": "Funnel, close-ups, saga, surfacing"
    },
    {
      "directionalInterfaces": [
        "docs/ARCHITECTURE.md §1 row 18 + §6.2 concerns/ + §8 funnel/routing/modes/partition/producer-matrix/resilience/exit-10, README.md, config commentary, agents/criteria/dispositions.md human-stop exit-10 preserved",
        "fragment matrix (8 fragments) + debloat check: each fragment ≤15 lines, total growth ≤60 lines, preflight plus line-count assertion in prompts.test"
      ],
      "id": "m5-docs",
      "scenarios": [
        "Given implementation complete When docs are read Then ARCHITECTURE, README, config commentary, and dispositions describe concerns lifecycle, funnel sizes, partition, producer matrix, exit-10, modes, and counts with terse prompts",
        "Given prompt fragments When prompts.test runs Then KNOWN_VARS plus descriptions cover all 8 fragments and added lines respect ≤15/≤60 budgets",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "title": "Docs and suite consolidation"
    }
  ],
  "uncertainties": [
    {
      "description": "Funnel byte budget per-level sources, zero-diff rule, and bytes-vs-chars unit needed before close-up hydration.",
      "id": "u-text-budget",
      "spikeOutlines": [
        "test-assumptions spike-text-budget verifies code min(diff,2000) and zero-diff min(input,500) UTF-8 bytes with output<input condensing"
      ]
    },
    {
      "description": "Epic propagation timing plus taskWt serialization/restart behavior and pure-derive versus act-phase boundary needed before store, blocker derive, and saga propagation.",
      "id": "u-saga-propagation",
      "spikeOutlines": [
        "fact-finder spike-saga-commit verifies parent-copy timing, runExclusive serialization, immediate commit idempotency, collectRoutedBlockers owner, and hydration seam"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "test-assumptions: measure item/wave diff bytes vs concern detail sizes; confirm per-level caps code min(diff,2000) and zero-diff min(input,500) UTF-8 bytes, condensing output<input, no 500-floor violation. Finding record only, no prod code; gates funnel-closeups.",
      "kind": "test-assumptions",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "spike-text-budget",
      "title": "Spike: funnel byte budget"
    },
    {
      "deps": [],
      "description": "fact-finder: verify runChildTask copy timing before cleanup/merge, parent buildArchitectHydration extension point, taskWt runExclusive serialization under 4 parallel items, immediate commit plus restart idempotency, pure-derive vs act-phase boundary with collectRoutedBlockers owner. Finding only; gates concerns-store, routing-blocker-derive, saga-propagate.",
      "kind": "fact-finder",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "spike-saga-commit",
      "title": "Spike: saga propagation, commit, derive boundary"
    },
    {
      "deps": [],
      "description": "Types plus schemas for producer matrix (developer, fact-finder, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup with concernResolutions, architect reports) via shared partial; triage/infra/pm-edit out of scope. Canonical reviewPolicy.default, legacy alias, resolveReviewAllowed(pipeline,agent,isTriager) precedence plus dismiss injection, generateReviewSchema, dismiss detail-required, pipeline humanInvolvement plus concerns thresholds. Tests: typecheck, preflight, repair defaults vs strict reject unknown kind.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-contracts",
      "title": "Concern contracts and canonical review policy"
    },
    {
      "deps": [
        "concerns-contracts-policy",
        "concerns-contracts-schemas",
        "concerns-contracts-types"
      ],
      "description": "Implement src/core/concerns.ts (fingerprint identity, merge+escalated, aggregate/list/triage/closeup/partition, atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll, restart idempotent). NEVER wrap commitAll in repo.writeLock.runExclusive (deadlock). Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative (no re-run). Behavior tests in test/engine/concerns-funnel.test.ts. Run TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-store",
      "title": "Concerns store with merge and commit"
    },
    {
      "deps": [
        "concerns-store"
      ],
      "description": "Item reviewer triage with concernsYaml in steps/review, isTriager gate, exact-id partition excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox dedup q-concern-<cid>, dismiss detail to dismissReason, condensing output<input, debt predicate without tech-debt disposition. Behavior tests: dismiss no routing, routed persist, QA gate no-op, missing detail errors, fix-once, no double mailbox.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "reviewer-triage",
      "title": "Workhorse reviewer triage"
    },
    {
      "deps": [
        "concerns-store"
      ],
      "description": "Architect path: aggregate plan/revise concerns plus remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary, non-dismissed become routed. Behavior tests: dismissed vs routed, rm-* triaged, debt predicate, no approval trigger from triage ids.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "plan-reviewer-triage",
      "title": "Plan-reviewer triage"
    },
    {
      "deps": [
        "concerns-contracts-policy",
        "concerns-contracts-schemas",
        "concerns-contracts-types"
      ],
      "description": "humanInvolvement + concerns thresholds schema/loader/merge, commented autonomous/principal/detailed presets with blocking table, agents/criteria/human-involvement.md terse fragment, KNOWN_VARS concernsYaml + humanInvolvementCriteria wired per fragment matrix. Behavior: mode switch changes criteria and blocking-ADR behavior; preflight green. Precedes all routing.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "modes-prompts",
      "title": "Modes, thresholds, prompt wiring"
    },
    {
      "deps": [
        "modes-prompts",
        "plan-reviewer-triage",
        "reviewer-triage"
      ],
      "description": "Pure derive only: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing fixpoint, union with failure-blocked, cascade only declared deps, no writes. Spike findings authoritative. Behavior: dependent blocked, non-dep unaffected, transitive via deps only.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-blocker-derive",
      "title": "Blocker derive"
    },
    {
      "deps": [
        "modes-prompts",
        "routing-blocker-derive"
      ],
      "description": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) plus buildArchitectHydration concernsYaml extension for wave-report/next-plan. Behavior tests: single consult file, restart no duplicate, architect input contains id+summary.",
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
      "description": "human-async blocks [item] and continues, human-stop blocks task/item plus exit-10 halt plus blocked derive, awareness blocks [] digest never blocking/exiting, debt predicate kind tech-debt routed or disposition optional routed. Behavior tests: mailbox files per disposition, exit 10 on stop, awareness continues, debt includes [item] summary.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-human-debt",
      "title": "Human mailbox and debt routing"
    },
    {
      "deps": [
        "modes-prompts",
        "routing-human-debt"
      ],
      "description": "Full ADR md title/context/decision/consequences/blocking, blocking routed per mode table with exit-10 when stop, remarkable digest-only never waiting, dispositions.md exit-10 preserved. Behavior tests: blocking mailbox+blocks, remarkable digest only.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "adr-blocking-digest",
      "title": "Blocking vs remarkable ADRs"
    },
    {
      "deps": [
        "adr-blocking-digest",
        "routing-architect-consult",
        "spike-text-budget"
      ],
      "description": "Hydrate wave/plan-close-up and architect reports with concernsYaml capped per spike (code min(diff,2000), zero-diff min(input,500) UTF-8 bytes, output<input), concernResolutions pending + architect concernConfirms accept/reject, propagate to parent/digest, simple-item explicit + auto-route fallback (tech-debt->optional, others->architect, human-* never auto). Apply spike nits: cross-check diffs via production git() wrapper, add many-concerns 2000B truncation case, clarify trim semantics. Behavior: byte budgets, pending/confirm, simple fallback.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "replanAfter": true,
      "slug": "funnel-closeups",
      "title": "Funnel close-ups and simple triage"
    },
    {
      "deps": [
        "routing-architect-consult"
      ],
      "description": "runChildTask propagateEpicConcerns: after child completion before cleanup/merge (engine.ts:246-274) for every child status, condensed parent copies source.epic with parent detail < child, extended parent concernsYaml hydration (append LAST, recompute before wave-report); forward child human questions to root mailbox. Spike findings authoritative. Behavior: one copy, dismissed stays local, saga input contains id.",
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
      "description": "Sole owner StateArtifact.concerns {open,dismissed,routed,resolved}, state.schema, toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI Concerns plus Blocking vs Digest. Behavior tests: counts, missing/corrupt, CLI sections.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "slug": "status-state-surface",
      "title": "State counts and status surfacing"
    },
    {
      "deps": [
        "funnel-closeups",
        "modes-prompts",
        "saga-propagate",
        "status-state-surface"
      ],
      "description": "Update ARCHITECTURE section 1 row 18 plus 6.2 plus 8, README, config commentary, dispositions.md; fragment matrix plus 15/60 debloat check; consolidate test/engine/concerns-funnel.test.ts plus steer/CLI coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m5-docs",
      "slug": "docs-finish",
      "title": "Docs and suite consolidation"
    },
    {
      "deps": [],
      "description": "Types only. In src/core/artifacts.ts add Concern/ConcernKind/ConcernSeverity/ConcernStatus, RemarkableDecision, StoredConcernArtifact (+pendingResolution?, source.escalated?), ReviewDisposition+dismiss (no tech-debt value), PlanAdr.blocking, PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeverity,minBlockingSeverity}, reviewPolicy.default canonical + legacy allowedDispositions alias in type. No JSON, no runtime, no repair (deferred to concerns-store). Verify: bun run typecheck. Prod budget <=80 lines.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-contracts-types",
      "title": "Concern artifact types"
    },
    {
      "deps": [
        "concerns-contracts-types"
      ],
      "description": "Schemas only. Inline (no cross-file $ref) shared concern/remarkable definitions into developer-output, fact-finder-output, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup (+concernResolutions), architect wave-report/closeup; triage/infra/pm-edit untouched. severity/detail optional (runtime defaults in store); kind strict enum so unknown kind fails validation with no write. Dismiss detail-required at runtime, not JSON schema. Verify: typecheck + prompts.test preflight + one FakeHarness case in test/engine/concerns-funnel.test.ts. Budget <=200 lines JSON.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-contracts-schemas",
      "title": "Concern producer schemas"
    },
    {
      "deps": [
        "concerns-contracts-types"
      ],
      "description": "Resolver only. New src/core/review-policy.ts resolveReviewAllowed(pipeline,agent,isTriager): per-agent > default > builtin [fix,optional,architect,human-awareness,human-async]; legacy allowedDispositions read-alias for default; append dismiss iff isTriager. Wire into item-machine review promptVars, step-runner schema path, iteration plan-review prompt+schema, generateReviewSchema. QA never dismiss. Verify: typecheck + FakeHarness (reviewer accepts dismiss, QA rejects). Budget <=100 lines.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-contracts-policy",
      "title": "Canonical review-policy resolver"
    },
    {
      "deps": [
        "concerns-contracts-policy",
        "concerns-contracts-schemas",
        "concerns-contracts-types"
      ],
      "description": "Implement src/core/concerns.ts (fingerprint identity, merge+escalated, aggregate/list/triage/closeup/partition, atomic YAML + KeyedMutex(taskDir) RMW-only + immediate taskWt commitAll, restart idempotent). NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** recovery + reconcileConcerns (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative. Behavior tests in test/engine/concerns-funnel.test.ts. Run TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-store-v2",
      "title": "Concerns store with merge and commit"
    },
    {
      "deps": [
        "concerns-contracts-policy",
        "concerns-contracts-schemas",
        "concerns-contracts-types"
      ],
      "description": "humanInvolvement + concerns thresholds schema/loader/merge, commented autonomous/principal/detailed presets with blocking table, agents/criteria/human-involvement.md terse fragment, KNOWN_VARS concernsYaml + humanInvolvementCriteria per fragment matrix. Behavior: mode switch changes criteria and blocking-ADR behavior; preflight green. Precedes all routing.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "modes-prompts-v2",
      "title": "Modes, thresholds, prompt wiring"
    },
    {
      "deps": [
        "concerns-store-v2"
      ],
      "description": "Item reviewer triage with concernsYaml in steps/review, isTriager gate, exact-id partition excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox dedup q-concern-<cid>, dismiss detail to dismissReason, condensing output<input, debt predicate (no tech-debt disposition). Behavior: dismiss no routing, routed persist, QA no-op, missing detail errors, fix-once, no double mailbox.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "reviewer-triage-v2",
      "title": "Workhorse reviewer triage"
    },
    {
      "deps": [
        "concerns-store-v2"
      ],
      "description": "Architect path: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary, non-dismissed become routed. Behavior: dismissed vs routed, rm-* triaged, debt predicate, no approval trigger from triage ids.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "plan-reviewer-triage-v2",
      "title": "Plan-reviewer triage"
    },
    {
      "deps": [
        "modes-prompts-v2",
        "plan-reviewer-triage-v2",
        "reviewer-triage-v2"
      ],
      "description": "Pure derive only: derive/task.ts collectRoutedBlockers + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing fixpoint, union with failure-blocked, cascade only declared deps, no writes. Spike findings authoritative. Behavior: dependent blocked, non-dep unaffected, transitive via deps only.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-blocker-derive-v2",
      "title": "Blocker derive"
    },
    {
      "deps": [
        "modes-prompts-v2",
        "reviewer-triage-v2"
      ],
      "description": "human-async blocks [item] and continues, human-stop blocks task/item + exit-10 halt + blocked derive, awareness blocks [] digest never blocking/exiting, debt predicate kind tech-debt routed or disposition optional routed. Behavior: mailbox files per disposition, exit 10 on stop, awareness continues, debt includes [item] summary.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-human-debt-v2",
      "title": "Human mailbox and debt routing"
    },
    {
      "deps": [
        "modes-prompts-v2",
        "routing-blocker-derive-v2"
      ],
      "description": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) + buildArchitectHydration concernsYaml extension for wave-report/next-plan. Behavior: single consult file, restart no duplicate, architect input contains id+summary.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-architect-consult-v2",
      "title": "Architect consult and hydration"
    },
    {
      "deps": [
        "modes-prompts-v2",
        "routing-human-debt-v2"
      ],
      "description": "Full ADR md title/context/decision/consequences/blocking, blocking routed per mode table with exit-10 when stop, remarkable digest-only never waiting, dispositions.md exit-10 preserved. Behavior: blocking mailbox+blocks, remarkable digest only.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "adr-blocking-digest-v2",
      "title": "Blocking vs remarkable ADRs"
    },
    {
      "deps": [
        "concerns-store-v2",
        "routing-human-debt-v2"
      ],
      "description": "Sole owner StateArtifact.concerns {open,dismissed,routed,resolved}, state.schema, toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI Concerns plus Blocking vs Digest. Behavior: counts, missing/corrupt, CLI sections.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "slug": "status-state-surface-v2",
      "title": "State counts and status surfacing"
    },
    {
      "deps": [
        "adr-blocking-digest-v2",
        "routing-architect-consult-v2",
        "spike-text-budget"
      ],
      "description": "Hydrate wave/plan-close-up and architect reports with concernsYaml capped per spike (code min(diff,2000), zero-diff min(input,500) UTF-8 bytes, output<input), concernResolutions pending + architect concernConfirms accept/reject, propagate to parent/digest, simple-item explicit + auto-route fallback (tech-debt->optional, others->architect, human-* never auto). Spike nits: production git() wrapper, many-concerns 2000B case, trim semantics. Behavior: byte budgets, pending/confirm, simple fallback.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "replanAfter": true,
      "slug": "funnel-closeups-v2",
      "title": "Funnel close-ups and simple triage"
    },
    {
      "deps": [
        "routing-architect-consult-v2"
      ],
      "description": "runChildTask propagateEpicConcerns after child completion before cleanup/merge (engine.ts:246-274) for every child status, condensed parent copies source.epic with parent detail < child, extended parent concernsYaml hydration (append LAST, recompute before wave-report); forward child human questions to root mailbox. Spike findings authoritative. Behavior: one copy, dismissed stays local, saga input contains id.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "replanAfter": true,
      "slug": "saga-propagate-v2",
      "title": "Epic to saga propagation"
    },
    {
      "deps": [
        "funnel-closeups-v2",
        "modes-prompts-v2",
        "saga-propagate-v2",
        "status-state-surface-v2"
      ],
      "description": "Update ARCHITECTURE section 1 row 18 + 6.2 + 8, README, config commentary, dispositions.md; fragment matrix + 15/60 debloat check; consolidate test/engine/concerns-funnel.test.ts + steer/CLI coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m5-docs",
      "slug": "docs-finish-v2",
      "title": "Docs and suite consolidation"
    }
  ],
  "assumptions": [
    {
      "assumption": "Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures do not mask regressions.",
      "why": "Baseline red only under .factory-runtime TMPDIR; suite green with TMPDIR=/tmp. Out of scope."
    },
    {
      "assumption": "Concern identity excludes detail and severity per adr-fingerprint-merge; reworded detail merges and severity escalations surface via escalated flag without reopening.",
      "why": "Prevents trivial-reword duplicates while keeping escalation visible to architect and digest."
    },
    {
      "assumption": "buildArchitectHydration does not read parent concerns/ today; saga-propagate extends it with concernsYaml, and runChildTask copies condensed epic concerns to parent concerns/ after child completion but before cleanup/merge per spike-saga-commit.",
      "why": "Corrects the prior hydration assumption; defines the copy timing and seam the spike must verify."
    },
    {
      "assumption": "Per-mode blocking table in adr-humaninvolvement-config is authoritative for iteration 1; raise allowlist defaults to all agents.",
      "why": "Unblocks routing without operator tuning; task pipeline.yaml can override."
    },
    {
      "assumption": "Dismissed concerns stay dismissed on severity escalation but appear as escalated notes in digest and architect hydration.",
      "disposition": "human-awareness",
      "why": "Surfaces the hidden-escalation tradeoff to the operator without auto-reopening triaged work."
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
      "description": "reviewAllowed resolved in two places with non-canonical allowedDispositions key and wrong fallback order, so per-agent dismiss could fail schema validation.",
      "id": "td-reviewpolicy-divergence",
      "resolution": "Fix in concerns-contracts: canonical reviewPolicy.default, legacy alias, single resolveReviewAllowed(pipeline,agent,isTriager) with precedence and dismiss injection used by prompt and schema paths."
    },
    {
      "category": "impacting",
      "description": "ADR writer persists only title plus context and PlanAdr lacks blocking; human-stop contract drifted from exit-10.",
      "id": "td-adr-md-truncated",
      "resolution": "Fix in adr-blocking-digest and routing-human-debt: full md with decision, consequences, blocking plus preserved exit-10 halt and dispositions.md update."
    },
    {
      "category": "impacting",
      "description": "human-awareness and human-stop ignored, debt derivation ignores routed concerns, status lists digest as blocking.",
      "id": "td-human-debt-gaps",
      "resolution": "Fix in routing-human-debt and status-state-surface: stop exit-10 plus blocked, awareness digest with empty blocks, debt from predicate, Blocking versus Digest split."
    }
  ],
  "adrs": [
    {
      "context": "Item steps commit only childWt while concerns/ lives on taskWt; up to 4 parallel items share taskDir; retries/restarts must not duplicate or lose triage.",
      "decision": "Write directly to taskWt/{task}/concerns/ with writeYamlAtomic plus runExclusive taskWt mutex, then immediately commit taskWt when concerns/ or steer/ changed. Distinct fingerprints are distinct files; same fingerprint merges without clobbering dismissed/routed/resolved. Restart re-reads files idempotently. Implementation gated by spike-saga-commit serialization findings.",
      "id": "adr-concern-store-taskwt",
      "title": "Direct taskWt writes with serialized immediate commit"
    },
    {
      "context": "suggestions[] reuse conflated concern triage with fix-loop, mailbox, and plan-approval triggers; review id is free-form; QA must not triage; dismiss needs a reason field.",
      "decision": "Exact-id match (suggestion.id === c-<hash10> or rm-<hash10>) via partitionSuggestions splits triage entries from normal findings. Triage ids update concerns/ only and are excluded from fix-loop/approval/normal-mailbox paths; fix on a concern id routes as fix and returns fixRequired once for the owning item; human-async on a concern writes a single q-concern-<cid> (normal path skipped). Dismiss requires non-empty detail persisted to dismissReason or the step errors. isTriager gate allows only reviewer, plan-reviewer, and close-up/architect chain. Reviewer ordering: aggregate new concerns[] first, then triage only pre-existing ids from concernsYaml (no same-step self-dismiss).",
      "id": "adr-triage-suggestions-dismiss",
      "title": "Partitioned exact-id triage with gate"
    },
    {
      "context": "derive/* must stay pure; debt routing invented an invalid tech-debt disposition; consult writes need exactly-once; mailbox needs dedup.",
      "decision": "Pure derive: derive/task.ts collectRoutedBlockers(taskDir) reads routed kind==blocker affects into a Set passed to deriveWave/deriveItem and scheduler.blockedByConcern(items, concernBlocked) which reuses the blockedByFailure fixpoint pattern, unions with failure-blocked, and cascades only over declared deps. Debt predicate: (kind==tech-debt && status routed/resolved) OR (disposition==optional && status routed); no tech-debt disposition exists. Act phase (triage writeArtifact plus wave-act newly-blocked check) writes decisions/concern-<cid>.yaml exactly once, idempotent on restart, and extends buildArchitectHydration with concernsYaml.",
      "id": "adr-routing-derived-state",
      "title": "Pure derive plus exactly-once act routing"
    },
    {
      "context": "Digest must reuse the mailbox without blocking, halting, or spamming status; classify handles operator answers, not blocking.",
      "decision": "Digest entries are steer/tousertoreview entries with disposition human-awareness and blocks:[]. derive/task splits openSteerQuestions into blocking (blocks.length>0) versus digest (awareness plus empty blocks); classify only routes answers/directives/stop; status renders separate Blocking versus Digest sections.",
      "id": "adr-digest-mailbox",
      "title": "Digest as filtered non-blocking mailbox view"
    },
    {
      "context": "Spec needs autonomous/principal/detailed presets plus raise allowlist and severity thresholds; pipeline root is closed.",
      "decision": "Top-level PipelineConfig.humanInvolvement (default autonomous) plus PipelineConfig.concerns {raiseAllowlist?, minDigestSeverity?, minBlockingSeverity?}. Blocking table: autonomous blocks only on blocking ADR or high human-stop; principal adds human-async and high severity; detailed adds all human-*. Thresholds gate blocking versus digest placement. Criteria fragment agents/criteria/human-involvement.md carries the table tersely.",
      "id": "adr-humaninvolvement-config",
      "title": "Modes plus raise and severity config"
    },
    {
      "context": "Funnel requires less detail per level and never more text than code summarized, with falsifiable checks and no empty digest on zero-diff steps.",
      "decision": "Per-level UTF-8 byte caps on hydrated promptVars only (stored artifacts never truncated): code steps cap min(diffBytes,2000) where diff is item diff for review triage and wave aggregated diff for close-ups; zero-diff orchestration steps cap min(inputBytes,500) where input is plan/context bytes. Reviewer/architect/close-up prompts require condensing with output bytes < input bytes. Engine truncates only the hydrated var.",
      "id": "adr-funnel-text-budget",
      "title": "Per-level hydration byte caps"
    },
    {
      "context": "PipelineConfig type says {default,[agent]} but flows read .allowedDispositions as if global; precedence and dismiss injection are undefined.",
      "decision": "Canonical key is reviewPolicy.default with legacy reviewPolicy.allowedDispositions as a one-iteration read-alias. Single owner src/core/review-policy.ts resolveReviewAllowed(pipeline, agent, isTriager): precedence per-agent array > default > builtin [fix,optional,architect,human-awareness,human-async]; when isTriager is true append dismiss if absent; QA and other non-triagers never receive dismiss. Used by both prompt criteria and generateReviewSchema.",
      "id": "adr-reviewpolicy-canonical",
      "title": "Canonical reviewPolicy with triager injection"
    },
    {
      "context": "Hashing detail/severity duplicates on rewording; excluding them hides severity escalation on dismissed concerns.",
      "decision": "Stable id c-{sha1-10} over {kind, normalizedSummary, location, sortedAffects} excluding detail and severity. Normalization trims, collapses whitespace, lowercases summary. Re-emit merges: detail keeps longer/latest, severity keeps max, updatedAt and source.lastSeen advance, never changes dismissed/routed/resolved except via triage or close-up resolution. If re-emit severity exceeds stored severity, set source.escalated=true and surface the escalation in digest and architect hydration without reopening; architect may reopen via close-up resolution.",
      "id": "adr-fingerprint-merge",
      "title": "Fingerprint identity, merge, escalation surfacing"
    },
    {
      "context": "Close-up schemas are closed, wave-close-up has no reviewer, stored statuses have no pending, and simple items have no reviewer.",
      "decision": "Add concernResolutions?: [{id, action: resolve|carry|propagate, note?}] plus concerns[]/remarkable[] producer fields to wave/plan-closeup schemas and StoredConcern.pendingResolution?: {action,note,by,at}. Wave-close-up proposes via applyCloseupResolutions (status stays routed, pending set); architect-wave-report confirms via concernConfirms?: [{id, confirm: accept|reject, note?}] applying resolved/routed/propagated or clearing pending. Propagate targets parent concerns/ copy for epics or human digest for task-level unless elevated to blocking ADR. Simple-item fallback at wave-close-up: kind tech-debt auto-routes to disposition optional (debt), all other kinds to architect (carry); human-* is never auto-routed.",
      "id": "adr-closeup-retriage",
      "title": "Close-up pending resolution and simple fallback"
    },
    {
      "context": "Remarkable {chosen,alternatives,why} needs one authoritative store and the same triage vocabulary.",
      "decision": "Authoritative store is concerns/rm-{hash10}.yaml with RemarkableDecision plus status and source. Triaged with suggestions[] dismiss vocabulary via exact-id match under the same partition and gate. Routed remarkables go digest-only unless elevated to a blocking ADR.",
      "id": "adr-remarkable-store",
      "title": "Remarkable decisions in rm- files"
    },
    {
      "context": "dispositions.md and ARCHITECTURE 8.7 define human-stop as tousertoreview plus exit-10 halt, but item-machine treats it fix-like running.",
      "decision": "Preserve exit-10 halt: human-stop writes a mailbox entry with blocks covering affected items plus task when task-level, item-machine maps it to blocked terminal, derive marks item and task blocked, and the engine halts with exit code 10 at the next mailbox check until answered or dismissed. Awareness with blocks:[] never enters blocked sets and never triggers exit 10. Update dispositions.md and ARCHITECTURE 8.7 to keep the contract explicit.",
      "id": "adr-human-stop",
      "title": "Human-stop preserves exit-10 halt"
    },
    {
      "context": "Derive throws on corrupt triage/plan/steer/decisions while concerns/ proposes skip; one bad concern could fail a whole step.",
      "decision": "Corrupt concerns/*.yaml files are skipped with a warn and excluded from counts because concerns/ is an append-only cache rebuildable from committed step records; missing concerns/ yields zero counts. A single unknown-kind concern fails its step with no partial aggregate and no clobber of existing files, forcing prompt/schema drift to surface via retry rather than silent loss.",
      "id": "adr-resilience",
      "title": "Corrupt-skip versus strict-fail resilience"
    },
    {
      "context": "Spec says every agent output may carry concerns[], but not every schema has a producer and reviewer has a dual aggregate-plus-triage role.",
      "decision": "Producer matrix via a shared concern/remarkable partial: developer, fact-finder, qa, poc, test-assumptions, reviewer/plan-reviewer new concerns[], architect plan/revise, consult decisions, wave/plan-closeup, architect wave-report/closeup. Triage, infra, and pm-edit mechanical outputs are explicitly out of scope (no LLM synthesis). Consults aggregate via runItemConsult/runNonItemConsult writeArtifact. Reviewer ordering: aggregate new concerns first, then triage only pre-existing ids.",
      "id": "adr-producer-matrix",
      "title": "Producer matrix and reviewer ordering"
    }
  ]
}`, `iteration: 1
amendments: 2
items:
  - spike-text-budget kind=test-assumptions wave=1 status=merged outlineRef=spike-text-budget
  - spike-saga-commit kind=fact-finder wave=1 status=ready outlineRef=spike-saga-commit
  - concerns-contracts kind=dev wave=1 status=superseded outlineRef=concerns-contracts
  - concerns-store kind=dev wave=2 status=pending outlineRef=concerns-store
  - modes-prompts kind=dev wave=2 status=pending outlineRef=modes-prompts
  - reviewer-triage kind=dev wave=3 status=pending outlineRef=reviewer-triage
  - plan-reviewer-triage kind=dev wave=3 status=pending outlineRef=plan-reviewer-triage
  - routing-blocker-derive kind=dev wave=4 status=pending outlineRef=routing-blocker-derive
  - routing-human-debt kind=dev wave=4 status=pending outlineRef=routing-human-debt
  - routing-architect-consult kind=dev wave=5 status=pending outlineRef=routing-architect-consult
  - adr-blocking-digest kind=dev wave=5 status=pending outlineRef=adr-blocking-digest
  - status-state-surface kind=dev wave=5 status=pending outlineRef=status-state-surface
  - funnel-closeups kind=dev wave=6 status=pending outlineRef=funnel-closeups
  - saga-propagate kind=dev wave=6 status=pending outlineRef=saga-propagate
  - docs-finish kind=dev wave=7 status=pending outlineRef=docs-finish
  - concerns-contracts-types kind=dev wave=2 status=merged outlineRef=concerns-contracts-types
  - concerns-contracts-schemas kind=dev wave=3 status=merged outlineRef=concerns-contracts-schemas
  - concerns-contracts-policy kind=dev wave=3 status=merged outlineRef=concerns-contracts-policy
waves: 1, 2, 3, 4, 5, 6, 7
merged: spike-text-budget, concerns-contracts-types, concerns-contracts-schemas, concerns-contracts-policy
blocked: (none)
failed: (none)
open steer questions:
  - awareness-plan-1-digest-mailbox-reuse ref=plan-1 disposition=human-awareness: ADR avoids new dir but relies on engine never treating empty-blocks awareness as blocker; factory status currently lists all openSteerQuestions as blocking questions. Confirm status/derive/classify filtering keeps digest low-noise per fire-test.
  - awareness-plan-1-merge-escalation-hidden ref=plan-1 disposition=human-awareness: Merge keeps max severity and longer/latest detail but never reopens dismissed/routed/resolved except via triage. Escalated risk on dismissed concern stays dismissed/hidden. Architect can decide now (reopen on escalation vs keep + digest surfacing), but operator should be aware of hidden-escalation tradeoff.`, `Amendment 2/3 (scheduling repair, no scope change): waves 4-5 ran empty because 9 pending items are orphaned in already-closed waves 2-5. Root cause verified in code: iteration wave loop (iteration.ts:700-720) skips closed waves, and deriveWaveState (wave.ts:29) carries forward only blocked items from past waves, never pending items whose deps merged late; amendment 1 updated deps without re-waving. Fix: version all 12 pending items to -v2 slugs (list in outlines), remove the 12 stale originals via removeItemSlugs, and have PM schedule the -v2 chain into fresh waves 6+ in strict topological order (store-v2+modes-v2 first and parallel; triages next; derive next; consults next; closeups/saga next; docs last). Dependents must sit in strictly later waves than their deps, never the same wave. Spike-saga-commit (ready, wave 1, zero prod diff) stays as-is: findings authoritative, do not re-run. Gates green (test fail->pass improved); operator should update gates-baseline.yaml to green.`, `Wave 5 completed. Merged items: `). NEVER reference files you cannot see.
- Structure ONLY architect-provided outlines: every item's `outlineRef` MUST name an outline slug from `{
  "iteration": 1,
  "milestones": [
    {
      "directionalInterfaces": [
        "artifacts.ts: Concern, RemarkableDecision, StoredConcernArtifact(+pendingResolution?, source.escalated?), ReviewDisposition+dismiss (no tech-debt), PlanAdr.blocking, PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeverity,minBlockingSeverity}, reviewPolicy.default canonical",
        "config/schemas: shared concern/remarkable partial in developer, fact-finder, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup, architect reports; triage/infra/pm-edit out of scope; dismiss detail-required; closeup concernResolutions",
        "src/core/concerns.ts: concernFingerprint(identity), aggregateConcerns(merge+escalated), listOpenConcerns, applyConcernTriage(exact-id,isTriager), applyCloseupResolutions, partitionSuggestions(triage vs findings)",
        "src/core/review-policy.ts: resolveReviewAllowed(pipeline,agent,isTriager) per-agent>default>builtin, legacy allowedDispositions alias, dismiss auto-append for triagers; generateReviewSchema uses it; taskWt runExclusive+atomic+immediate-commit helper"
      ],
      "id": "m1-contracts-aggregate",
      "scenarios": [
        "Given a developer step emitting a blocker concern When the step commits Then concerns/c-<fp10>.yaml exists with status open and source.record pointing at the step record",
        "Given the same concern re-emitted on retry When aggregation runs Then exactly one file exists, prior dismissed/routed preserved, updatedAt/lastSeen advance",
        "Given a concern missing severity and detail When validation runs Then severity defaults to medium, detail defaults to summary, and the file is created",
        "Given a concern with unknown kind When validation runs Then the step errors, no concerns file is written, existing files stay untouched",
        "Given developer, fact-finder, qa, poc, review-new, plan, consult, closeup, and architect-report outputs carrying concerns[]+remarkable[] When steps commit Then each aggregates to concerns/c-*.yaml or rm-*.yaml with open status and source pointer; triage/infra/pm-edit carry none",
        "Given reviewer output with new concerns[] plus suggestions triaging a pre-existing id When the step commits Then the new concern aggregates open and only the pre-existing id is triaged (no same-step self-dismiss)",
        "Given reviewPolicy.default [fix,optional] plus reviewer override [fix,optional,architect] When resolveReviewAllowed runs Then reviewer triager gets override+dismiss and QA non-triager gets default without dismiss",
        "Given a dismissed concern re-emitted with higher severity When merge runs Then status stays dismissed but source.escalated=true and the escalation appears in digest and architect hydration"
      ],
      "title": "Contracts and aggregation foundation"
    },
    {
      "directionalInterfaces": [
        "prompt-vars KNOWN_VARS+descriptions: concernsYaml in steps/review, steps/plan-review, steps/wave-close-up, steps/plan-close-up, architect-plan, architect-wave-report, architect-closeup, architect-consult-*; humanInvolvementCriteria in review, plan-review, architect-*",
        "item-machine review + iteration plan-review promptVars and writeArtifact with isTriager gate, partitionSuggestions excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox dedup q-concern-<cid>",
        "agents reviewer, plan-reviewer, criteria/dispositions, criteria/human-involvement terse confirm/dismiss/condense plus blocking table plus condensing rule output-bytes<input-bytes",
        "config/pipeline.default.yaml commented autonomous/principal/detailed presets with blocking table plus concerns raise/threshold examples"
      ],
      "id": "m2-triage-modes",
      "scenarios": [
        "Given open item concerns When review runs Then steps/review receives concernsYaml with id/kind/severity/summary/affects and terse triage instructions",
        "Given reviewer suggestion matching a concern id with disposition dismiss and detail When review commits Then that file has status dismissed plus dismissReason=detail and no mailbox, debt, blocked, or approval effect",
        "Given a matching dismiss suggestion without detail When review commits Then the step errors and no triage is persisted",
        "Given QA emitting a matching concern id When QA commits Then no triage is applied and the file stays open",
        "Given matching suggestions with fix, optional, architect, or human-* When review commits Then each file becomes routed with disposition persisted; triage ids are excluded from normal fix-loop/approval/mailbox except fix-on-concern sets fixRequired once; human-async on a concern writes a single q-concern-<cid>",
        "Given architect plan concerns plus an rm-* file When plan-review runs Then plan-reviewer triages with the same vocabulary and non-dismissed files become routed; debt predicate is kind==tech-debt&&routed or disposition==optional (no tech-debt disposition)",
        "Given pipeline.yaml humanInvolvement principal When reviewer and architect prompts render Then the mode criteria fragment is included and preflightPrompts passes"
      ],
      "title": "Reviewer triage and modes"
    },
    {
      "directionalInterfaces": [
        "derive/task.ts collectRoutedBlockers(taskDir)->Set plus deriveWave/deriveItem integration; scheduler.blockedByConcern(items,concernBlocked) pure reusing blockedByFailure fixpoint, unioned, cascade only over declared deps",
        "act-phase routing: triage writeArtifact plus wave-act newly-blocked check writing decisions/concern-<cid>.yaml exactly once (restart idempotent); buildArchitectHydration extended with concernsYaml digest",
        "steer writeQuestion for human-async/stop/blocking ADR; derive/task blocking-vs-digest split (blocks.length>0 vs awareness empty); debt predicate; human-stop exit-10 halt plus blocked"
      ],
      "id": "m3-routing",
      "scenarios": [
        "Given a routed blocker whose affects names a declared dependent When derive runs Then the dependent derives blocked with no writes; non-dependents are unaffected and transitive blocking follows declared deps only",
        "Given a newly blocked dependent When the act phase runs Then exactly one decisions/concern-<cid>.yaml is written and a restart writes no second file",
        "Given a routed architect concern When the next architect turn builds hydration Then its concernsYaml input contains that concern id and summary",
        "Given a routed human-async concern When routing runs Then mailbox q-concern-<cid> has blocks=[item], the item derives blocked, and the engine continues without exit 10",
        "Given a routed human-stop concern When routing runs Then the mailbox entry blocks task/item, item and task derive blocked, and the engine halts with exit code 10 until answered or dismissed",
        "Given a routed human-awareness concern When routing runs Then the mailbox entry has blocks=[] in the Digest section and the engine continues with no blocked set and no exit 10",
        "Given plan ADRs blocking true and false under autonomous mode When plan commits Then the blocking ADR creates a mailbox question with blocks while the remarkable ADR appears only in the digest; debt includes kind tech-debt routed or disposition optional routed as [item] summary"
      ],
      "title": "Routing to blocked, architect, mailbox, debt"
    },
    {
      "directionalInterfaces": [
        "closeup schemas concernResolutions resolve/carry/propagate plus concerns[]/remarkable[]; StoredConcern.pendingResolution{action,note,by,at}; applyCloseupResolutions proposes (status stays routed); architect concernConfirms accept/reject applies; propagate to parent concerns/ copy or human digest",
        "iteration.ts concernsYaml hydration capped UTF-8 bytes: code steps min(diffBytes,2000); zero-diff orchestration min(inputBytes,500); reviewer/architect condensing prompts require output<input; engine truncates hydrated var only",
        "engine.ts runChildTask propagateEpicConcerns after child completion before cleanup/merge, condensed copies with source.epic, parent hydration extended; size assert parent-detail<child-detail",
        "derive/task.ts toStateArtifact().concerns counts (missing dir zeros, corrupt skip+warn); cli/status.ts Concerns plus separate Blocking vs Digest sections"
      ],
      "id": "m4-funnel-surface",
      "replanAfter": true,
      "scenarios": [
        "Given wave diff 5000 bytes and open concerns 3000 bytes When wave-close-up hydrates Then concernsYaml is <=2000 bytes and < wave diff in UTF-8 bytes",
        "Given zero-diff plan-review with 4000-byte input When hydrating Then concernsYaml is <=500 bytes and < input bytes",
        "Given wave-close-up emitting concernResolutions resolve/carry/propagate When it commits Then files stay routed with pendingResolution set; architect accept applies resolved/routed/propagated and reject clears pending",
        "Given a simple item with open concerns and no reviewer When wave-close-up runs Then explicit resolutions triage them; fallback auto-routes kind tech-debt to optional (debt) and other kinds to architect (carry); human-* is never auto-routed",
        "Given a child epic finishing with one dismissed and one open concern with 800-byte detail When runChildTask completes before cleanup Then the parent gains exactly one condensed copy with source.epic, detail <800 bytes, hydrating saga architect concernsYaml",
        "Given mixed-status concerns plus a corrupt yaml file When state refreshes and factory status runs Then state.yaml counts skip the corrupt file with warn, missing dir yields zeros, and CLI shows Concerns plus Blocking vs Digest sections"
      ],
      "title": "Funnel, close-ups, saga, surfacing"
    },
    {
      "directionalInterfaces": [
        "docs/ARCHITECTURE.md §1 row 18 + §6.2 concerns/ + §8 funnel/routing/modes/partition/producer-matrix/resilience/exit-10, README.md, config commentary, agents/criteria/dispositions.md human-stop exit-10 preserved",
        "fragment matrix (8 fragments) + debloat check: each fragment ≤15 lines, total growth ≤60 lines, preflight plus line-count assertion in prompts.test"
      ],
      "id": "m5-docs",
      "scenarios": [
        "Given implementation complete When docs are read Then ARCHITECTURE, README, config commentary, and dispositions describe concerns lifecycle, funnel sizes, partition, producer matrix, exit-10, modes, and counts with terse prompts",
        "Given prompt fragments When prompts.test runs Then KNOWN_VARS plus descriptions cover all 8 fragments and added lines respect ≤15/≤60 budgets",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "title": "Docs and suite consolidation"
    }
  ],
  "uncertainties": [
    {
      "description": "Funnel byte budget per-level sources, zero-diff rule, and bytes-vs-chars unit needed before close-up hydration.",
      "id": "u-text-budget",
      "spikeOutlines": [
        "test-assumptions spike-text-budget verifies code min(diff,2000) and zero-diff min(input,500) UTF-8 bytes with output<input condensing"
      ]
    },
    {
      "description": "Epic propagation timing plus taskWt serialization/restart behavior and pure-derive versus act-phase boundary needed before store, blocker derive, and saga propagation.",
      "id": "u-saga-propagation",
      "spikeOutlines": [
        "fact-finder spike-saga-commit verifies parent-copy timing, runExclusive serialization, immediate commit idempotency, collectRoutedBlockers owner, and hydration seam"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "test-assumptions: measure item/wave diff bytes vs concern detail sizes; confirm per-level caps code min(diff,2000) and zero-diff min(input,500) UTF-8 bytes, condensing output<input, no 500-floor violation. Finding record only, no prod code; gates funnel-closeups.",
      "kind": "test-assumptions",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "spike-text-budget",
      "title": "Spike: funnel byte budget"
    },
    {
      "deps": [],
      "description": "fact-finder: verify runChildTask copy timing before cleanup/merge, parent buildArchitectHydration extension point, taskWt runExclusive serialization under 4 parallel items, immediate commit plus restart idempotency, pure-derive vs act-phase boundary with collectRoutedBlockers owner. Finding only; gates concerns-store, routing-blocker-derive, saga-propagate.",
      "kind": "fact-finder",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "spike-saga-commit",
      "title": "Spike: saga propagation, commit, derive boundary"
    },
    {
      "deps": [],
      "description": "Types plus schemas for producer matrix (developer, fact-finder, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup with concernResolutions, architect reports) via shared partial; triage/infra/pm-edit out of scope. Canonical reviewPolicy.default, legacy alias, resolveReviewAllowed(pipeline,agent,isTriager) precedence plus dismiss injection, generateReviewSchema, dismiss detail-required, pipeline humanInvolvement plus concerns thresholds. Tests: typecheck, preflight, repair defaults vs strict reject unknown kind.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-contracts",
      "title": "Concern contracts and canonical review policy"
    },
    {
      "deps": [
        "concerns-contracts-policy",
        "concerns-contracts-schemas",
        "concerns-contracts-types"
      ],
      "description": "Implement src/core/concerns.ts (fingerprint identity, merge+escalated, aggregate/list/triage/closeup/partition, atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll, restart idempotent). NEVER wrap commitAll in repo.writeLock.runExclusive (deadlock). Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative (no re-run). Behavior tests in test/engine/concerns-funnel.test.ts. Run TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-store",
      "title": "Concerns store with merge and commit"
    },
    {
      "deps": [
        "concerns-store"
      ],
      "description": "Item reviewer triage with concernsYaml in steps/review, isTriager gate, exact-id partition excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox dedup q-concern-<cid>, dismiss detail to dismissReason, condensing output<input, debt predicate without tech-debt disposition. Behavior tests: dismiss no routing, routed persist, QA gate no-op, missing detail errors, fix-once, no double mailbox.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "reviewer-triage",
      "title": "Workhorse reviewer triage"
    },
    {
      "deps": [
        "concerns-store"
      ],
      "description": "Architect path: aggregate plan/revise concerns plus remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary, non-dismissed become routed. Behavior tests: dismissed vs routed, rm-* triaged, debt predicate, no approval trigger from triage ids.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "plan-reviewer-triage",
      "title": "Plan-reviewer triage"
    },
    {
      "deps": [
        "concerns-contracts-policy",
        "concerns-contracts-schemas",
        "concerns-contracts-types"
      ],
      "description": "humanInvolvement + concerns thresholds schema/loader/merge, commented autonomous/principal/detailed presets with blocking table, agents/criteria/human-involvement.md terse fragment, KNOWN_VARS concernsYaml + humanInvolvementCriteria wired per fragment matrix. Behavior: mode switch changes criteria and blocking-ADR behavior; preflight green. Precedes all routing.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "modes-prompts",
      "title": "Modes, thresholds, prompt wiring"
    },
    {
      "deps": [
        "modes-prompts",
        "plan-reviewer-triage",
        "reviewer-triage"
      ],
      "description": "Pure derive only: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing fixpoint, union with failure-blocked, cascade only declared deps, no writes. Spike findings authoritative. Behavior: dependent blocked, non-dep unaffected, transitive via deps only.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-blocker-derive",
      "title": "Blocker derive"
    },
    {
      "deps": [
        "modes-prompts",
        "routing-blocker-derive"
      ],
      "description": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) plus buildArchitectHydration concernsYaml extension for wave-report/next-plan. Behavior tests: single consult file, restart no duplicate, architect input contains id+summary.",
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
      "description": "human-async blocks [item] and continues, human-stop blocks task/item plus exit-10 halt plus blocked derive, awareness blocks [] digest never blocking/exiting, debt predicate kind tech-debt routed or disposition optional routed. Behavior tests: mailbox files per disposition, exit 10 on stop, awareness continues, debt includes [item] summary.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-human-debt",
      "title": "Human mailbox and debt routing"
    },
    {
      "deps": [
        "modes-prompts",
        "routing-human-debt"
      ],
      "description": "Full ADR md title/context/decision/consequences/blocking, blocking routed per mode table with exit-10 when stop, remarkable digest-only never waiting, dispositions.md exit-10 preserved. Behavior tests: blocking mailbox+blocks, remarkable digest only.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "adr-blocking-digest",
      "title": "Blocking vs remarkable ADRs"
    },
    {
      "deps": [
        "adr-blocking-digest",
        "routing-architect-consult",
        "spike-text-budget"
      ],
      "description": "Hydrate wave/plan-close-up and architect reports with concernsYaml capped per spike (code min(diff,2000), zero-diff min(input,500) UTF-8 bytes, output<input), concernResolutions pending + architect concernConfirms accept/reject, propagate to parent/digest, simple-item explicit + auto-route fallback (tech-debt->optional, others->architect, human-* never auto). Apply spike nits: cross-check diffs via production git() wrapper, add many-concerns 2000B truncation case, clarify trim semantics. Behavior: byte budgets, pending/confirm, simple fallback.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "replanAfter": true,
      "slug": "funnel-closeups",
      "title": "Funnel close-ups and simple triage"
    },
    {
      "deps": [
        "routing-architect-consult"
      ],
      "description": "runChildTask propagateEpicConcerns: after child completion before cleanup/merge (engine.ts:246-274) for every child status, condensed parent copies source.epic with parent detail < child, extended parent concernsYaml hydration (append LAST, recompute before wave-report); forward child human questions to root mailbox. Spike findings authoritative. Behavior: one copy, dismissed stays local, saga input contains id.",
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
      "description": "Sole owner StateArtifact.concerns {open,dismissed,routed,resolved}, state.schema, toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI Concerns plus Blocking vs Digest. Behavior tests: counts, missing/corrupt, CLI sections.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "slug": "status-state-surface",
      "title": "State counts and status surfacing"
    },
    {
      "deps": [
        "funnel-closeups",
        "modes-prompts",
        "saga-propagate",
        "status-state-surface"
      ],
      "description": "Update ARCHITECTURE section 1 row 18 plus 6.2 plus 8, README, config commentary, dispositions.md; fragment matrix plus 15/60 debloat check; consolidate test/engine/concerns-funnel.test.ts plus steer/CLI coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m5-docs",
      "slug": "docs-finish",
      "title": "Docs and suite consolidation"
    },
    {
      "deps": [],
      "description": "Types only. In src/core/artifacts.ts add Concern/ConcernKind/ConcernSeverity/ConcernStatus, RemarkableDecision, StoredConcernArtifact (+pendingResolution?, source.escalated?), ReviewDisposition+dismiss (no tech-debt value), PlanAdr.blocking, PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeverity,minBlockingSeverity}, reviewPolicy.default canonical + legacy allowedDispositions alias in type. No JSON, no runtime, no repair (deferred to concerns-store). Verify: bun run typecheck. Prod budget <=80 lines.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-contracts-types",
      "title": "Concern artifact types"
    },
    {
      "deps": [
        "concerns-contracts-types"
      ],
      "description": "Schemas only. Inline (no cross-file $ref) shared concern/remarkable definitions into developer-output, fact-finder-output, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup (+concernResolutions), architect wave-report/closeup; triage/infra/pm-edit untouched. severity/detail optional (runtime defaults in store); kind strict enum so unknown kind fails validation with no write. Dismiss detail-required at runtime, not JSON schema. Verify: typecheck + prompts.test preflight + one FakeHarness case in test/engine/concerns-funnel.test.ts. Budget <=200 lines JSON.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-contracts-schemas",
      "title": "Concern producer schemas"
    },
    {
      "deps": [
        "concerns-contracts-types"
      ],
      "description": "Resolver only. New src/core/review-policy.ts resolveReviewAllowed(pipeline,agent,isTriager): per-agent > default > builtin [fix,optional,architect,human-awareness,human-async]; legacy allowedDispositions read-alias for default; append dismiss iff isTriager. Wire into item-machine review promptVars, step-runner schema path, iteration plan-review prompt+schema, generateReviewSchema. QA never dismiss. Verify: typecheck + FakeHarness (reviewer accepts dismiss, QA rejects). Budget <=100 lines.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-contracts-policy",
      "title": "Canonical review-policy resolver"
    },
    {
      "deps": [
        "concerns-contracts-policy",
        "concerns-contracts-schemas",
        "concerns-contracts-types"
      ],
      "description": "Implement src/core/concerns.ts (fingerprint identity, merge+escalated, aggregate/list/triage/closeup/partition, atomic YAML + KeyedMutex(taskDir) RMW-only + immediate taskWt commitAll, restart idempotent). NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** recovery + reconcileConcerns (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative. Behavior tests in test/engine/concerns-funnel.test.ts. Run TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-store-v2",
      "title": "Concerns store with merge and commit"
    },
    {
      "deps": [
        "concerns-contracts-policy",
        "concerns-contracts-schemas",
        "concerns-contracts-types"
      ],
      "description": "humanInvolvement + concerns thresholds schema/loader/merge, commented autonomous/principal/detailed presets with blocking table, agents/criteria/human-involvement.md terse fragment, KNOWN_VARS concernsYaml + humanInvolvementCriteria per fragment matrix. Behavior: mode switch changes criteria and blocking-ADR behavior; preflight green. Precedes all routing.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "modes-prompts-v2",
      "title": "Modes, thresholds, prompt wiring"
    },
    {
      "deps": [
        "concerns-store-v2"
      ],
      "description": "Item reviewer triage with concernsYaml in steps/review, isTriager gate, exact-id partition excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox dedup q-concern-<cid>, dismiss detail to dismissReason, condensing output<input, debt predicate (no tech-debt disposition). Behavior: dismiss no routing, routed persist, QA no-op, missing detail errors, fix-once, no double mailbox.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "reviewer-triage-v2",
      "title": "Workhorse reviewer triage"
    },
    {
      "deps": [
        "concerns-store-v2"
      ],
      "description": "Architect path: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary, non-dismissed become routed. Behavior: dismissed vs routed, rm-* triaged, debt predicate, no approval trigger from triage ids.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "plan-reviewer-triage-v2",
      "title": "Plan-reviewer triage"
    },
    {
      "deps": [
        "modes-prompts-v2",
        "plan-reviewer-triage-v2",
        "reviewer-triage-v2"
      ],
      "description": "Pure derive only: derive/task.ts collectRoutedBlockers + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing fixpoint, union with failure-blocked, cascade only declared deps, no writes. Spike findings authoritative. Behavior: dependent blocked, non-dep unaffected, transitive via deps only.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-blocker-derive-v2",
      "title": "Blocker derive"
    },
    {
      "deps": [
        "modes-prompts-v2",
        "reviewer-triage-v2"
      ],
      "description": "human-async blocks [item] and continues, human-stop blocks task/item + exit-10 halt + blocked derive, awareness blocks [] digest never blocking/exiting, debt predicate kind tech-debt routed or disposition optional routed. Behavior: mailbox files per disposition, exit 10 on stop, awareness continues, debt includes [item] summary.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-human-debt-v2",
      "title": "Human mailbox and debt routing"
    },
    {
      "deps": [
        "modes-prompts-v2",
        "routing-blocker-derive-v2"
      ],
      "description": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) + buildArchitectHydration concernsYaml extension for wave-report/next-plan. Behavior: single consult file, restart no duplicate, architect input contains id+summary.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-architect-consult-v2",
      "title": "Architect consult and hydration"
    },
    {
      "deps": [
        "modes-prompts-v2",
        "routing-human-debt-v2"
      ],
      "description": "Full ADR md title/context/decision/consequences/blocking, blocking routed per mode table with exit-10 when stop, remarkable digest-only never waiting, dispositions.md exit-10 preserved. Behavior: blocking mailbox+blocks, remarkable digest only.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "adr-blocking-digest-v2",
      "title": "Blocking vs remarkable ADRs"
    },
    {
      "deps": [
        "concerns-store-v2",
        "routing-human-debt-v2"
      ],
      "description": "Sole owner StateArtifact.concerns {open,dismissed,routed,resolved}, state.schema, toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI Concerns plus Blocking vs Digest. Behavior: counts, missing/corrupt, CLI sections.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "slug": "status-state-surface-v2",
      "title": "State counts and status surfacing"
    },
    {
      "deps": [
        "adr-blocking-digest-v2",
        "routing-architect-consult-v2",
        "spike-text-budget"
      ],
      "description": "Hydrate wave/plan-close-up and architect reports with concernsYaml capped per spike (code min(diff,2000), zero-diff min(input,500) UTF-8 bytes, output<input), concernResolutions pending + architect concernConfirms accept/reject, propagate to parent/digest, simple-item explicit + auto-route fallback (tech-debt->optional, others->architect, human-* never auto). Spike nits: production git() wrapper, many-concerns 2000B case, trim semantics. Behavior: byte budgets, pending/confirm, simple fallback.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "replanAfter": true,
      "slug": "funnel-closeups-v2",
      "title": "Funnel close-ups and simple triage"
    },
    {
      "deps": [
        "routing-architect-consult-v2"
      ],
      "description": "runChildTask propagateEpicConcerns after child completion before cleanup/merge (engine.ts:246-274) for every child status, condensed parent copies source.epic with parent detail < child, extended parent concernsYaml hydration (append LAST, recompute before wave-report); forward child human questions to root mailbox. Spike findings authoritative. Behavior: one copy, dismissed stays local, saga input contains id.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "replanAfter": true,
      "slug": "saga-propagate-v2",
      "title": "Epic to saga propagation"
    },
    {
      "deps": [
        "funnel-closeups-v2",
        "modes-prompts-v2",
        "saga-propagate-v2",
        "status-state-surface-v2"
      ],
      "description": "Update ARCHITECTURE section 1 row 18 + 6.2 + 8, README, config commentary, dispositions.md; fragment matrix + 15/60 debloat check; consolidate test/engine/concerns-funnel.test.ts + steer/CLI coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m5-docs",
      "slug": "docs-finish-v2",
      "title": "Docs and suite consolidation"
    }
  ],
  "assumptions": [
    {
      "assumption": "Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures do not mask regressions.",
      "why": "Baseline red only under .factory-runtime TMPDIR; suite green with TMPDIR=/tmp. Out of scope."
    },
    {
      "assumption": "Concern identity excludes detail and severity per adr-fingerprint-merge; reworded detail merges and severity escalations surface via escalated flag without reopening.",
      "why": "Prevents trivial-reword duplicates while keeping escalation visible to architect and digest."
    },
    {
      "assumption": "buildArchitectHydration does not read parent concerns/ today; saga-propagate extends it with concernsYaml, and runChildTask copies condensed epic concerns to parent concerns/ after child completion but before cleanup/merge per spike-saga-commit.",
      "why": "Corrects the prior hydration assumption; defines the copy timing and seam the spike must verify."
    },
    {
      "assumption": "Per-mode blocking table in adr-humaninvolvement-config is authoritative for iteration 1; raise allowlist defaults to all agents.",
      "why": "Unblocks routing without operator tuning; task pipeline.yaml can override."
    },
    {
      "assumption": "Dismissed concerns stay dismissed on severity escalation but appear as escalated notes in digest and architect hydration.",
      "disposition": "human-awareness",
      "why": "Surfaces the hidden-escalation tradeoff to the operator without auto-reopening triaged work."
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
      "description": "reviewAllowed resolved in two places with non-canonical allowedDispositions key and wrong fallback order, so per-agent dismiss could fail schema validation.",
      "id": "td-reviewpolicy-divergence",
      "resolution": "Fix in concerns-contracts: canonical reviewPolicy.default, legacy alias, single resolveReviewAllowed(pipeline,agent,isTriager) with precedence and dismiss injection used by prompt and schema paths."
    },
    {
      "category": "impacting",
      "description": "ADR writer persists only title plus context and PlanAdr lacks blocking; human-stop contract drifted from exit-10.",
      "id": "td-adr-md-truncated",
      "resolution": "Fix in adr-blocking-digest and routing-human-debt: full md with decision, consequences, blocking plus preserved exit-10 halt and dispositions.md update."
    },
    {
      "category": "impacting",
      "description": "human-awareness and human-stop ignored, debt derivation ignores routed concerns, status lists digest as blocking.",
      "id": "td-human-debt-gaps",
      "resolution": "Fix in routing-human-debt and status-state-surface: stop exit-10 plus blocked, awareness digest with empty blocks, debt from predicate, Blocking versus Digest split."
    }
  ],
  "adrs": [
    {
      "context": "Item steps commit only childWt while concerns/ lives on taskWt; up to 4 parallel items share taskDir; retries/restarts must not duplicate or lose triage.",
      "decision": "Write directly to taskWt/{task}/concerns/ with writeYamlAtomic plus runExclusive taskWt mutex, then immediately commit taskWt when concerns/ or steer/ changed. Distinct fingerprints are distinct files; same fingerprint merges without clobbering dismissed/routed/resolved. Restart re-reads files idempotently. Implementation gated by spike-saga-commit serialization findings.",
      "id": "adr-concern-store-taskwt",
      "title": "Direct taskWt writes with serialized immediate commit"
    },
    {
      "context": "suggestions[] reuse conflated concern triage with fix-loop, mailbox, and plan-approval triggers; review id is free-form; QA must not triage; dismiss needs a reason field.",
      "decision": "Exact-id match (suggestion.id === c-<hash10> or rm-<hash10>) via partitionSuggestions splits triage entries from normal findings. Triage ids update concerns/ only and are excluded from fix-loop/approval/normal-mailbox paths; fix on a concern id routes as fix and returns fixRequired once for the owning item; human-async on a concern writes a single q-concern-<cid> (normal path skipped). Dismiss requires non-empty detail persisted to dismissReason or the step errors. isTriager gate allows only reviewer, plan-reviewer, and close-up/architect chain. Reviewer ordering: aggregate new concerns[] first, then triage only pre-existing ids from concernsYaml (no same-step self-dismiss).",
      "id": "adr-triage-suggestions-dismiss",
      "title": "Partitioned exact-id triage with gate"
    },
    {
      "context": "derive/* must stay pure; debt routing invented an invalid tech-debt disposition; consult writes need exactly-once; mailbox needs dedup.",
      "decision": "Pure derive: derive/task.ts collectRoutedBlockers(taskDir) reads routed kind==blocker affects into a Set passed to deriveWave/deriveItem and scheduler.blockedByConcern(items, concernBlocked) which reuses the blockedByFailure fixpoint pattern, unions with failure-blocked, and cascades only over declared deps. Debt predicate: (kind==tech-debt && status routed/resolved) OR (disposition==optional && status routed); no tech-debt disposition exists. Act phase (triage writeArtifact plus wave-act newly-blocked check) writes decisions/concern-<cid>.yaml exactly once, idempotent on restart, and extends buildArchitectHydration with concernsYaml.",
      "id": "adr-routing-derived-state",
      "title": "Pure derive plus exactly-once act routing"
    },
    {
      "context": "Digest must reuse the mailbox without blocking, halting, or spamming status; classify handles operator answers, not blocking.",
      "decision": "Digest entries are steer/tousertoreview entries with disposition human-awareness and blocks:[]. derive/task splits openSteerQuestions into blocking (blocks.length>0) versus digest (awareness plus empty blocks); classify only routes answers/directives/stop; status renders separate Blocking versus Digest sections.",
      "id": "adr-digest-mailbox",
      "title": "Digest as filtered non-blocking mailbox view"
    },
    {
      "context": "Spec needs autonomous/principal/detailed presets plus raise allowlist and severity thresholds; pipeline root is closed.",
      "decision": "Top-level PipelineConfig.humanInvolvement (default autonomous) plus PipelineConfig.concerns {raiseAllowlist?, minDigestSeverity?, minBlockingSeverity?}. Blocking table: autonomous blocks only on blocking ADR or high human-stop; principal adds human-async and high severity; detailed adds all human-*. Thresholds gate blocking versus digest placement. Criteria fragment agents/criteria/human-involvement.md carries the table tersely.",
      "id": "adr-humaninvolvement-config",
      "title": "Modes plus raise and severity config"
    },
    {
      "context": "Funnel requires less detail per level and never more text than code summarized, with falsifiable checks and no empty digest on zero-diff steps.",
      "decision": "Per-level UTF-8 byte caps on hydrated promptVars only (stored artifacts never truncated): code steps cap min(diffBytes,2000) where diff is item diff for review triage and wave aggregated diff for close-ups; zero-diff orchestration steps cap min(inputBytes,500) where input is plan/context bytes. Reviewer/architect/close-up prompts require condensing with output bytes < input bytes. Engine truncates only the hydrated var.",
      "id": "adr-funnel-text-budget",
      "title": "Per-level hydration byte caps"
    },
    {
      "context": "PipelineConfig type says {default,[agent]} but flows read .allowedDispositions as if global; precedence and dismiss injection are undefined.",
      "decision": "Canonical key is reviewPolicy.default with legacy reviewPolicy.allowedDispositions as a one-iteration read-alias. Single owner src/core/review-policy.ts resolveReviewAllowed(pipeline, agent, isTriager): precedence per-agent array > default > builtin [fix,optional,architect,human-awareness,human-async]; when isTriager is true append dismiss if absent; QA and other non-triagers never receive dismiss. Used by both prompt criteria and generateReviewSchema.",
      "id": "adr-reviewpolicy-canonical",
      "title": "Canonical reviewPolicy with triager injection"
    },
    {
      "context": "Hashing detail/severity duplicates on rewording; excluding them hides severity escalation on dismissed concerns.",
      "decision": "Stable id c-{sha1-10} over {kind, normalizedSummary, location, sortedAffects} excluding detail and severity. Normalization trims, collapses whitespace, lowercases summary. Re-emit merges: detail keeps longer/latest, severity keeps max, updatedAt and source.lastSeen advance, never changes dismissed/routed/resolved except via triage or close-up resolution. If re-emit severity exceeds stored severity, set source.escalated=true and surface the escalation in digest and architect hydration without reopening; architect may reopen via close-up resolution.",
      "id": "adr-fingerprint-merge",
      "title": "Fingerprint identity, merge, escalation surfacing"
    },
    {
      "context": "Close-up schemas are closed, wave-close-up has no reviewer, stored statuses have no pending, and simple items have no reviewer.",
      "decision": "Add concernResolutions?: [{id, action: resolve|carry|propagate, note?}] plus concerns[]/remarkable[] producer fields to wave/plan-closeup schemas and StoredConcern.pendingResolution?: {action,note,by,at}. Wave-close-up proposes via applyCloseupResolutions (status stays routed, pending set); architect-wave-report confirms via concernConfirms?: [{id, confirm: accept|reject, note?}] applying resolved/routed/propagated or clearing pending. Propagate targets parent concerns/ copy for epics or human digest for task-level unless elevated to blocking ADR. Simple-item fallback at wave-close-up: kind tech-debt auto-routes to disposition optional (debt), all other kinds to architect (carry); human-* is never auto-routed.",
      "id": "adr-closeup-retriage",
      "title": "Close-up pending resolution and simple fallback"
    },
    {
      "context": "Remarkable {chosen,alternatives,why} needs one authoritative store and the same triage vocabulary.",
      "decision": "Authoritative store is concerns/rm-{hash10}.yaml with RemarkableDecision plus status and source. Triaged with suggestions[] dismiss vocabulary via exact-id match under the same partition and gate. Routed remarkables go digest-only unless elevated to a blocking ADR.",
      "id": "adr-remarkable-store",
      "title": "Remarkable decisions in rm- files"
    },
    {
      "context": "dispositions.md and ARCHITECTURE 8.7 define human-stop as tousertoreview plus exit-10 halt, but item-machine treats it fix-like running.",
      "decision": "Preserve exit-10 halt: human-stop writes a mailbox entry with blocks covering affected items plus task when task-level, item-machine maps it to blocked terminal, derive marks item and task blocked, and the engine halts with exit code 10 at the next mailbox check until answered or dismissed. Awareness with blocks:[] never enters blocked sets and never triggers exit 10. Update dispositions.md and ARCHITECTURE 8.7 to keep the contract explicit.",
      "id": "adr-human-stop",
      "title": "Human-stop preserves exit-10 halt"
    },
    {
      "context": "Derive throws on corrupt triage/plan/steer/decisions while concerns/ proposes skip; one bad concern could fail a whole step.",
      "decision": "Corrupt concerns/*.yaml files are skipped with a warn and excluded from counts because concerns/ is an append-only cache rebuildable from committed step records; missing concerns/ yields zero counts. A single unknown-kind concern fails its step with no partial aggregate and no clobber of existing files, forcing prompt/schema drift to surface via retry rather than silent loss.",
      "id": "adr-resilience",
      "title": "Corrupt-skip versus strict-fail resilience"
    },
    {
      "context": "Spec says every agent output may carry concerns[], but not every schema has a producer and reviewer has a dual aggregate-plus-triage role.",
      "decision": "Producer matrix via a shared concern/remarkable partial: developer, fact-finder, qa, poc, test-assumptions, reviewer/plan-reviewer new concerns[], architect plan/revise, consult decisions, wave/plan-closeup, architect wave-report/closeup. Triage, infra, and pm-edit mechanical outputs are explicitly out of scope (no LLM synthesis). Consults aggregate via runItemConsult/runNonItemConsult writeArtifact. Reviewer ordering: aggregate new concerns first, then triage only pre-existing ids.",
      "id": "adr-producer-matrix",
      "title": "Producer matrix and reviewer ordering"
    }
  ]
}` (which already includes the amendment's new outlines). NEVER invent outlineRefs — an unknown `outlineRef` fails validation.
- Protect history: DO NOT alter, reschedule, or remove items in waves that have already executed or merged. Removal of pending items is handled by the engine via the architect's `removeItemSlugs`, not by your output.
- Dependency integrity: ensure all new dependencies reference either completed items from earlier waves or earlier items in the amended plan. Wave ordering stays strict (deps only on earlier waves).
- Output: yield the delta edits artifact matching `plan-edits.schema.json`.

## Current Plan
{
  "iteration": 1,
  "milestones": [
    {
      "directionalInterfaces": [
        "artifacts.ts: Concern, RemarkableDecision, StoredConcernArtifact(+pendingResolution?, source.escalated?), ReviewDisposition+dismiss (no tech-debt), PlanAdr.blocking, PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeverity,minBlockingSeverity}, reviewPolicy.default canonical",
        "config/schemas: shared concern/remarkable partial in developer, fact-finder, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup, architect reports; triage/infra/pm-edit out of scope; dismiss detail-required; closeup concernResolutions",
        "src/core/concerns.ts: concernFingerprint(identity), aggregateConcerns(merge+escalated), listOpenConcerns, applyConcernTriage(exact-id,isTriager), applyCloseupResolutions, partitionSuggestions(triage vs findings)",
        "src/core/review-policy.ts: resolveReviewAllowed(pipeline,agent,isTriager) per-agent>default>builtin, legacy allowedDispositions alias, dismiss auto-append for triagers; generateReviewSchema uses it; taskWt runExclusive+atomic+immediate-commit helper"
      ],
      "id": "m1-contracts-aggregate",
      "scenarios": [
        "Given a developer step emitting a blocker concern When the step commits Then concerns/c-<fp10>.yaml exists with status open and source.record pointing at the step record",
        "Given the same concern re-emitted on retry When aggregation runs Then exactly one file exists, prior dismissed/routed preserved, updatedAt/lastSeen advance",
        "Given a concern missing severity and detail When validation runs Then severity defaults to medium, detail defaults to summary, and the file is created",
        "Given a concern with unknown kind When validation runs Then the step errors, no concerns file is written, existing files stay untouched",
        "Given developer, fact-finder, qa, poc, review-new, plan, consult, closeup, and architect-report outputs carrying concerns[]+remarkable[] When steps commit Then each aggregates to concerns/c-*.yaml or rm-*.yaml with open status and source pointer; triage/infra/pm-edit carry none",
        "Given reviewer output with new concerns[] plus suggestions triaging a pre-existing id When the step commits Then the new concern aggregates open and only the pre-existing id is triaged (no same-step self-dismiss)",
        "Given reviewPolicy.default [fix,optional] plus reviewer override [fix,optional,architect] When resolveReviewAllowed runs Then reviewer triager gets override+dismiss and QA non-triager gets default without dismiss",
        "Given a dismissed concern re-emitted with higher severity When merge runs Then status stays dismissed but source.escalated=true and the escalation appears in digest and architect hydration"
      ],
      "title": "Contracts and aggregation foundation"
    },
    {
      "directionalInterfaces": [
        "prompt-vars KNOWN_VARS+descriptions: concernsYaml in steps/review, steps/plan-review, steps/wave-close-up, steps/plan-close-up, architect-plan, architect-wave-report, architect-closeup, architect-consult-*; humanInvolvementCriteria in review, plan-review, architect-*",
        "item-machine review + iteration plan-review promptVars and writeArtifact with isTriager gate, partitionSuggestions excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox dedup q-concern-<cid>",
        "agents reviewer, plan-reviewer, criteria/dispositions, criteria/human-involvement terse confirm/dismiss/condense plus blocking table plus condensing rule output-bytes<input-bytes",
        "config/pipeline.default.yaml commented autonomous/principal/detailed presets with blocking table plus concerns raise/threshold examples"
      ],
      "id": "m2-triage-modes",
      "scenarios": [
        "Given open item concerns When review runs Then steps/review receives concernsYaml with id/kind/severity/summary/affects and terse triage instructions",
        "Given reviewer suggestion matching a concern id with disposition dismiss and detail When review commits Then that file has status dismissed plus dismissReason=detail and no mailbox, debt, blocked, or approval effect",
        "Given a matching dismiss suggestion without detail When review commits Then the step errors and no triage is persisted",
        "Given QA emitting a matching concern id When QA commits Then no triage is applied and the file stays open",
        "Given matching suggestions with fix, optional, architect, or human-* When review commits Then each file becomes routed with disposition persisted; triage ids are excluded from normal fix-loop/approval/mailbox except fix-on-concern sets fixRequired once; human-async on a concern writes a single q-concern-<cid>",
        "Given architect plan concerns plus an rm-* file When plan-review runs Then plan-reviewer triages with the same vocabulary and non-dismissed files become routed; debt predicate is kind==tech-debt&&routed or disposition==optional (no tech-debt disposition)",
        "Given pipeline.yaml humanInvolvement principal When reviewer and architect prompts render Then the mode criteria fragment is included and preflightPrompts passes"
      ],
      "title": "Reviewer triage and modes"
    },
    {
      "directionalInterfaces": [
        "derive/task.ts collectRoutedBlockers(taskDir)->Set plus deriveWave/deriveItem integration; scheduler.blockedByConcern(items,concernBlocked) pure reusing blockedByFailure fixpoint, unioned, cascade only over declared deps",
        "act-phase routing: triage writeArtifact plus wave-act newly-blocked check writing decisions/concern-<cid>.yaml exactly once (restart idempotent); buildArchitectHydration extended with concernsYaml digest",
        "steer writeQuestion for human-async/stop/blocking ADR; derive/task blocking-vs-digest split (blocks.length>0 vs awareness empty); debt predicate; human-stop exit-10 halt plus blocked"
      ],
      "id": "m3-routing",
      "scenarios": [
        "Given a routed blocker whose affects names a declared dependent When derive runs Then the dependent derives blocked with no writes; non-dependents are unaffected and transitive blocking follows declared deps only",
        "Given a newly blocked dependent When the act phase runs Then exactly one decisions/concern-<cid>.yaml is written and a restart writes no second file",
        "Given a routed architect concern When the next architect turn builds hydration Then its concernsYaml input contains that concern id and summary",
        "Given a routed human-async concern When routing runs Then mailbox q-concern-<cid> has blocks=[item], the item derives blocked, and the engine continues without exit 10",
        "Given a routed human-stop concern When routing runs Then the mailbox entry blocks task/item, item and task derive blocked, and the engine halts with exit code 10 until answered or dismissed",
        "Given a routed human-awareness concern When routing runs Then the mailbox entry has blocks=[] in the Digest section and the engine continues with no blocked set and no exit 10",
        "Given plan ADRs blocking true and false under autonomous mode When plan commits Then the blocking ADR creates a mailbox question with blocks while the remarkable ADR appears only in the digest; debt includes kind tech-debt routed or disposition optional routed as [item] summary"
      ],
      "title": "Routing to blocked, architect, mailbox, debt"
    },
    {
      "directionalInterfaces": [
        "closeup schemas concernResolutions resolve/carry/propagate plus concerns[]/remarkable[]; StoredConcern.pendingResolution{action,note,by,at}; applyCloseupResolutions proposes (status stays routed); architect concernConfirms accept/reject applies; propagate to parent concerns/ copy or human digest",
        "iteration.ts concernsYaml hydration capped UTF-8 bytes: code steps min(diffBytes,2000); zero-diff orchestration min(inputBytes,500); reviewer/architect condensing prompts require output<input; engine truncates hydrated var only",
        "engine.ts runChildTask propagateEpicConcerns after child completion before cleanup/merge, condensed copies with source.epic, parent hydration extended; size assert parent-detail<child-detail",
        "derive/task.ts toStateArtifact().concerns counts (missing dir zeros, corrupt skip+warn); cli/status.ts Concerns plus separate Blocking vs Digest sections"
      ],
      "id": "m4-funnel-surface",
      "replanAfter": true,
      "scenarios": [
        "Given wave diff 5000 bytes and open concerns 3000 bytes When wave-close-up hydrates Then concernsYaml is <=2000 bytes and < wave diff in UTF-8 bytes",
        "Given zero-diff plan-review with 4000-byte input When hydrating Then concernsYaml is <=500 bytes and < input bytes",
        "Given wave-close-up emitting concernResolutions resolve/carry/propagate When it commits Then files stay routed with pendingResolution set; architect accept applies resolved/routed/propagated and reject clears pending",
        "Given a simple item with open concerns and no reviewer When wave-close-up runs Then explicit resolutions triage them; fallback auto-routes kind tech-debt to optional (debt) and other kinds to architect (carry); human-* is never auto-routed",
        "Given a child epic finishing with one dismissed and one open concern with 800-byte detail When runChildTask completes before cleanup Then the parent gains exactly one condensed copy with source.epic, detail <800 bytes, hydrating saga architect concernsYaml",
        "Given mixed-status concerns plus a corrupt yaml file When state refreshes and factory status runs Then state.yaml counts skip the corrupt file with warn, missing dir yields zeros, and CLI shows Concerns plus Blocking vs Digest sections"
      ],
      "title": "Funnel, close-ups, saga, surfacing"
    },
    {
      "directionalInterfaces": [
        "docs/ARCHITECTURE.md §1 row 18 + §6.2 concerns/ + §8 funnel/routing/modes/partition/producer-matrix/resilience/exit-10, README.md, config commentary, agents/criteria/dispositions.md human-stop exit-10 preserved",
        "fragment matrix (8 fragments) + debloat check: each fragment ≤15 lines, total growth ≤60 lines, preflight plus line-count assertion in prompts.test"
      ],
      "id": "m5-docs",
      "scenarios": [
        "Given implementation complete When docs are read Then ARCHITECTURE, README, config commentary, and dispositions describe concerns lifecycle, funnel sizes, partition, producer matrix, exit-10, modes, and counts with terse prompts",
        "Given prompt fragments When prompts.test runs Then KNOWN_VARS plus descriptions cover all 8 fragments and added lines respect ≤15/≤60 budgets",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "title": "Docs and suite consolidation"
    }
  ],
  "uncertainties": [
    {
      "description": "Funnel byte budget per-level sources, zero-diff rule, and bytes-vs-chars unit needed before close-up hydration.",
      "id": "u-text-budget",
      "spikeOutlines": [
        "test-assumptions spike-text-budget verifies code min(diff,2000) and zero-diff min(input,500) UTF-8 bytes with output<input condensing"
      ]
    },
    {
      "description": "Epic propagation timing plus taskWt serialization/restart behavior and pure-derive versus act-phase boundary needed before store, blocker derive, and saga propagation.",
      "id": "u-saga-propagation",
      "spikeOutlines": [
        "fact-finder spike-saga-commit verifies parent-copy timing, runExclusive serialization, immediate commit idempotency, collectRoutedBlockers owner, and hydration seam"
      ]
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "test-assumptions: measure item/wave diff bytes vs concern detail sizes; confirm per-level caps code min(diff,2000) and zero-diff min(input,500) UTF-8 bytes, condensing output<input, no 500-floor violation. Finding record only, no prod code; gates funnel-closeups.",
      "kind": "test-assumptions",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "spike-text-budget",
      "title": "Spike: funnel byte budget"
    },
    {
      "deps": [],
      "description": "fact-finder: verify runChildTask copy timing before cleanup/merge, parent buildArchitectHydration extension point, taskWt runExclusive serialization under 4 parallel items, immediate commit plus restart idempotency, pure-derive vs act-phase boundary with collectRoutedBlockers owner. Finding only; gates concerns-store, routing-blocker-derive, saga-propagate.",
      "kind": "fact-finder",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "spike-saga-commit",
      "title": "Spike: saga propagation, commit, derive boundary"
    },
    {
      "deps": [],
      "description": "Types plus schemas for producer matrix (developer, fact-finder, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup with concernResolutions, architect reports) via shared partial; triage/infra/pm-edit out of scope. Canonical reviewPolicy.default, legacy alias, resolveReviewAllowed(pipeline,agent,isTriager) precedence plus dismiss injection, generateReviewSchema, dismiss detail-required, pipeline humanInvolvement plus concerns thresholds. Tests: typecheck, preflight, repair defaults vs strict reject unknown kind.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-contracts",
      "title": "Concern contracts and canonical review policy"
    },
    {
      "deps": [
        "concerns-contracts-policy",
        "concerns-contracts-schemas",
        "concerns-contracts-types"
      ],
      "description": "Implement src/core/concerns.ts (fingerprint identity, merge+escalated, aggregate/list/triage/closeup/partition, atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll, restart idempotent). NEVER wrap commitAll in repo.writeLock.runExclusive (deadlock). Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative (no re-run). Behavior tests in test/engine/concerns-funnel.test.ts. Run TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-store",
      "title": "Concerns store with merge and commit"
    },
    {
      "deps": [
        "concerns-store"
      ],
      "description": "Item reviewer triage with concernsYaml in steps/review, isTriager gate, exact-id partition excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox dedup q-concern-<cid>, dismiss detail to dismissReason, condensing output<input, debt predicate without tech-debt disposition. Behavior tests: dismiss no routing, routed persist, QA gate no-op, missing detail errors, fix-once, no double mailbox.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "reviewer-triage",
      "title": "Workhorse reviewer triage"
    },
    {
      "deps": [
        "concerns-store"
      ],
      "description": "Architect path: aggregate plan/revise concerns plus remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary, non-dismissed become routed. Behavior tests: dismissed vs routed, rm-* triaged, debt predicate, no approval trigger from triage ids.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "plan-reviewer-triage",
      "title": "Plan-reviewer triage"
    },
    {
      "deps": [
        "concerns-contracts-policy",
        "concerns-contracts-schemas",
        "concerns-contracts-types"
      ],
      "description": "humanInvolvement + concerns thresholds schema/loader/merge, commented autonomous/principal/detailed presets with blocking table, agents/criteria/human-involvement.md terse fragment, KNOWN_VARS concernsYaml + humanInvolvementCriteria wired per fragment matrix. Behavior: mode switch changes criteria and blocking-ADR behavior; preflight green. Precedes all routing.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "modes-prompts",
      "title": "Modes, thresholds, prompt wiring"
    },
    {
      "deps": [
        "modes-prompts",
        "plan-reviewer-triage",
        "reviewer-triage"
      ],
      "description": "Pure derive only: derive/task.ts collectRoutedBlockers(taskDir)->Set + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing fixpoint, union with failure-blocked, cascade only declared deps, no writes. Spike findings authoritative. Behavior: dependent blocked, non-dep unaffected, transitive via deps only.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-blocker-derive",
      "title": "Blocker derive"
    },
    {
      "deps": [
        "modes-prompts",
        "routing-blocker-derive"
      ],
      "description": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) plus buildArchitectHydration concernsYaml extension for wave-report/next-plan. Behavior tests: single consult file, restart no duplicate, architect input contains id+summary.",
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
      "description": "human-async blocks [item] and continues, human-stop blocks task/item plus exit-10 halt plus blocked derive, awareness blocks [] digest never blocking/exiting, debt predicate kind tech-debt routed or disposition optional routed. Behavior tests: mailbox files per disposition, exit 10 on stop, awareness continues, debt includes [item] summary.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-human-debt",
      "title": "Human mailbox and debt routing"
    },
    {
      "deps": [
        "modes-prompts",
        "routing-human-debt"
      ],
      "description": "Full ADR md title/context/decision/consequences/blocking, blocking routed per mode table with exit-10 when stop, remarkable digest-only never waiting, dispositions.md exit-10 preserved. Behavior tests: blocking mailbox+blocks, remarkable digest only.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "adr-blocking-digest",
      "title": "Blocking vs remarkable ADRs"
    },
    {
      "deps": [
        "adr-blocking-digest",
        "routing-architect-consult",
        "spike-text-budget"
      ],
      "description": "Hydrate wave/plan-close-up and architect reports with concernsYaml capped per spike (code min(diff,2000), zero-diff min(input,500) UTF-8 bytes, output<input), concernResolutions pending + architect concernConfirms accept/reject, propagate to parent/digest, simple-item explicit + auto-route fallback (tech-debt->optional, others->architect, human-* never auto). Apply spike nits: cross-check diffs via production git() wrapper, add many-concerns 2000B truncation case, clarify trim semantics. Behavior: byte budgets, pending/confirm, simple fallback.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "replanAfter": true,
      "slug": "funnel-closeups",
      "title": "Funnel close-ups and simple triage"
    },
    {
      "deps": [
        "routing-architect-consult"
      ],
      "description": "runChildTask propagateEpicConcerns: after child completion before cleanup/merge (engine.ts:246-274) for every child status, condensed parent copies source.epic with parent detail < child, extended parent concernsYaml hydration (append LAST, recompute before wave-report); forward child human questions to root mailbox. Spike findings authoritative. Behavior: one copy, dismissed stays local, saga input contains id.",
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
      "description": "Sole owner StateArtifact.concerns {open,dismissed,routed,resolved}, state.schema, toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI Concerns plus Blocking vs Digest. Behavior tests: counts, missing/corrupt, CLI sections.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "slug": "status-state-surface",
      "title": "State counts and status surfacing"
    },
    {
      "deps": [
        "funnel-closeups",
        "modes-prompts",
        "saga-propagate",
        "status-state-surface"
      ],
      "description": "Update ARCHITECTURE section 1 row 18 plus 6.2 plus 8, README, config commentary, dispositions.md; fragment matrix plus 15/60 debloat check; consolidate test/engine/concerns-funnel.test.ts plus steer/CLI coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m5-docs",
      "slug": "docs-finish",
      "title": "Docs and suite consolidation"
    },
    {
      "deps": [],
      "description": "Types only. In src/core/artifacts.ts add Concern/ConcernKind/ConcernSeverity/ConcernStatus, RemarkableDecision, StoredConcernArtifact (+pendingResolution?, source.escalated?), ReviewDisposition+dismiss (no tech-debt value), PlanAdr.blocking, PipelineConfig.humanInvolvement+concerns{raiseAllowlist,minDigestSeverity,minBlockingSeverity}, reviewPolicy.default canonical + legacy allowedDispositions alias in type. No JSON, no runtime, no repair (deferred to concerns-store). Verify: bun run typecheck. Prod budget <=80 lines.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-contracts-types",
      "title": "Concern artifact types"
    },
    {
      "deps": [
        "concerns-contracts-types"
      ],
      "description": "Schemas only. Inline (no cross-file $ref) shared concern/remarkable definitions into developer-output, fact-finder-output, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup (+concernResolutions), architect wave-report/closeup; triage/infra/pm-edit untouched. severity/detail optional (runtime defaults in store); kind strict enum so unknown kind fails validation with no write. Dismiss detail-required at runtime, not JSON schema. Verify: typecheck + prompts.test preflight + one FakeHarness case in test/engine/concerns-funnel.test.ts. Budget <=200 lines JSON.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-contracts-schemas",
      "title": "Concern producer schemas"
    },
    {
      "deps": [
        "concerns-contracts-types"
      ],
      "description": "Resolver only. New src/core/review-policy.ts resolveReviewAllowed(pipeline,agent,isTriager): per-agent > default > builtin [fix,optional,architect,human-awareness,human-async]; legacy allowedDispositions read-alias for default; append dismiss iff isTriager. Wire into item-machine review promptVars, step-runner schema path, iteration plan-review prompt+schema, generateReviewSchema. QA never dismiss. Verify: typecheck + FakeHarness (reviewer accepts dismiss, QA rejects). Budget <=100 lines.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-contracts-policy",
      "title": "Canonical review-policy resolver"
    },
    {
      "deps": [
        "concerns-contracts-policy",
        "concerns-contracts-schemas",
        "concerns-contracts-types"
      ],
      "description": "Implement src/core/concerns.ts (fingerprint identity, merge+escalated, aggregate/list/triage/closeup/partition, atomic YAML + KeyedMutex(taskDir) RMW-only + immediate taskWt commitAll, restart idempotent). NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** recovery + reconcileConcerns (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative. Behavior tests in test/engine/concerns-funnel.test.ts. Run TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m1-contracts-aggregate",
      "slug": "concerns-store-v2",
      "title": "Concerns store with merge and commit"
    },
    {
      "deps": [
        "concerns-contracts-policy",
        "concerns-contracts-schemas",
        "concerns-contracts-types"
      ],
      "description": "humanInvolvement + concerns thresholds schema/loader/merge, commented autonomous/principal/detailed presets with blocking table, agents/criteria/human-involvement.md terse fragment, KNOWN_VARS concernsYaml + humanInvolvementCriteria per fragment matrix. Behavior: mode switch changes criteria and blocking-ADR behavior; preflight green. Precedes all routing.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "modes-prompts-v2",
      "title": "Modes, thresholds, prompt wiring"
    },
    {
      "deps": [
        "concerns-store-v2"
      ],
      "description": "Item reviewer triage with concernsYaml in steps/review, isTriager gate, exact-id partition excluding triage ids from fix-loop/approval/normal mailbox, fix-on-concern fixRequired once, mailbox dedup q-concern-<cid>, dismiss detail to dismissReason, condensing output<input, debt predicate (no tech-debt disposition). Behavior: dismiss no routing, routed persist, QA no-op, missing detail errors, fix-once, no double mailbox.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "reviewer-triage-v2",
      "title": "Workhorse reviewer triage"
    },
    {
      "deps": [
        "concerns-store-v2"
      ],
      "description": "Architect path: aggregate plan/revise concerns + remarkable rm-*, hydrate steps/plan-review with concernsYaml, same exact-id partition and dismiss vocabulary, non-dismissed become routed. Behavior: dismissed vs routed, rm-* triaged, debt predicate, no approval trigger from triage ids.",
      "kind": "story",
      "milestoneId": "m2-triage-modes",
      "slug": "plan-reviewer-triage-v2",
      "title": "Plan-reviewer triage"
    },
    {
      "deps": [
        "modes-prompts-v2",
        "plan-reviewer-triage-v2",
        "reviewer-triage-v2"
      ],
      "description": "Pure derive only: derive/task.ts collectRoutedBlockers + deriveWave/deriveItem integration (thread blockedBy into deriveItemState or post-process before every deriveWaveState call), scheduler.blockedByConcern reusing fixpoint, union with failure-blocked, cascade only declared deps, no writes. Spike findings authoritative. Behavior: dependent blocked, non-dep unaffected, transitive via deps only.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-blocker-derive-v2",
      "title": "Blocker derive"
    },
    {
      "deps": [
        "modes-prompts-v2",
        "reviewer-triage-v2"
      ],
      "description": "human-async blocks [item] and continues, human-stop blocks task/item + exit-10 halt + blocked derive, awareness blocks [] digest never blocking/exiting, debt predicate kind tech-debt routed or disposition optional routed. Behavior: mailbox files per disposition, exit 10 on stop, awareness continues, debt includes [item] summary.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-human-debt-v2",
      "title": "Human mailbox and debt routing"
    },
    {
      "deps": [
        "modes-prompts-v2",
        "routing-blocker-derive-v2"
      ],
      "description": "Act phase only: wave-act newly-blocked check writes decisions/concern-<cid>.yaml exactly once (restart idempotent) + buildArchitectHydration concernsYaml extension for wave-report/next-plan. Behavior: single consult file, restart no duplicate, architect input contains id+summary.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "routing-architect-consult-v2",
      "title": "Architect consult and hydration"
    },
    {
      "deps": [
        "modes-prompts-v2",
        "routing-human-debt-v2"
      ],
      "description": "Full ADR md title/context/decision/consequences/blocking, blocking routed per mode table with exit-10 when stop, remarkable digest-only never waiting, dispositions.md exit-10 preserved. Behavior: blocking mailbox+blocks, remarkable digest only.",
      "kind": "story",
      "milestoneId": "m3-routing",
      "slug": "adr-blocking-digest-v2",
      "title": "Blocking vs remarkable ADRs"
    },
    {
      "deps": [
        "concerns-store-v2",
        "routing-human-debt-v2"
      ],
      "description": "Sole owner StateArtifact.concerns {open,dismissed,routed,resolved}, state.schema, toStateArtifact/refreshStateYaml (missing zeros, corrupt skip+warn), CLI Concerns plus Blocking vs Digest. Behavior: counts, missing/corrupt, CLI sections.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "slug": "status-state-surface-v2",
      "title": "State counts and status surfacing"
    },
    {
      "deps": [
        "adr-blocking-digest-v2",
        "routing-architect-consult-v2",
        "spike-text-budget"
      ],
      "description": "Hydrate wave/plan-close-up and architect reports with concernsYaml capped per spike (code min(diff,2000), zero-diff min(input,500) UTF-8 bytes, output<input), concernResolutions pending + architect concernConfirms accept/reject, propagate to parent/digest, simple-item explicit + auto-route fallback (tech-debt->optional, others->architect, human-* never auto). Spike nits: production git() wrapper, many-concerns 2000B case, trim semantics. Behavior: byte budgets, pending/confirm, simple fallback.",
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "replanAfter": true,
      "slug": "funnel-closeups-v2",
      "title": "Funnel close-ups and simple triage"
    },
    {
      "deps": [
        "routing-architect-consult-v2"
      ],
      "description": "runChildTask propagateEpicConcerns after child completion before cleanup/merge (engine.ts:246-274) for every child status, condensed parent copies source.epic with parent detail < child, extended parent concernsYaml hydration (append LAST, recompute before wave-report); forward child human questions to root mailbox. Spike findings authoritative. Behavior: one copy, dismissed stays local, saga input contains id.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m4-funnel-surface",
      "replanAfter": true,
      "slug": "saga-propagate-v2",
      "title": "Epic to saga propagation"
    },
    {
      "deps": [
        "funnel-closeups-v2",
        "modes-prompts-v2",
        "saga-propagate-v2",
        "status-state-surface-v2"
      ],
      "description": "Update ARCHITECTURE section 1 row 18 + 6.2 + 8, README, config commentary, dispositions.md; fragment matrix + 15/60 debloat check; consolidate test/engine/concerns-funnel.test.ts + steer/CLI coverage. Final gates: bun run typecheck and TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m5-docs",
      "slug": "docs-finish-v2",
      "title": "Docs and suite consolidation"
    }
  ],
  "assumptions": [
    {
      "assumption": "Gates run with TMPDIR=/tmp so the 2 pre-existing head-guard failures do not mask regressions.",
      "why": "Baseline red only under .factory-runtime TMPDIR; suite green with TMPDIR=/tmp. Out of scope."
    },
    {
      "assumption": "Concern identity excludes detail and severity per adr-fingerprint-merge; reworded detail merges and severity escalations surface via escalated flag without reopening.",
      "why": "Prevents trivial-reword duplicates while keeping escalation visible to architect and digest."
    },
    {
      "assumption": "buildArchitectHydration does not read parent concerns/ today; saga-propagate extends it with concernsYaml, and runChildTask copies condensed epic concerns to parent concerns/ after child completion but before cleanup/merge per spike-saga-commit.",
      "why": "Corrects the prior hydration assumption; defines the copy timing and seam the spike must verify."
    },
    {
      "assumption": "Per-mode blocking table in adr-humaninvolvement-config is authoritative for iteration 1; raise allowlist defaults to all agents.",
      "why": "Unblocks routing without operator tuning; task pipeline.yaml can override."
    },
    {
      "assumption": "Dismissed concerns stay dismissed on severity escalation but appear as escalated notes in digest and architect hydration.",
      "disposition": "human-awareness",
      "why": "Surfaces the hidden-escalation tradeoff to the operator without auto-reopening triaged work."
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
      "description": "reviewAllowed resolved in two places with non-canonical allowedDispositions key and wrong fallback order, so per-agent dismiss could fail schema validation.",
      "id": "td-reviewpolicy-divergence",
      "resolution": "Fix in concerns-contracts: canonical reviewPolicy.default, legacy alias, single resolveReviewAllowed(pipeline,agent,isTriager) with precedence and dismiss injection used by prompt and schema paths."
    },
    {
      "category": "impacting",
      "description": "ADR writer persists only title plus context and PlanAdr lacks blocking; human-stop contract drifted from exit-10.",
      "id": "td-adr-md-truncated",
      "resolution": "Fix in adr-blocking-digest and routing-human-debt: full md with decision, consequences, blocking plus preserved exit-10 halt and dispositions.md update."
    },
    {
      "category": "impacting",
      "description": "human-awareness and human-stop ignored, debt derivation ignores routed concerns, status lists digest as blocking.",
      "id": "td-human-debt-gaps",
      "resolution": "Fix in routing-human-debt and status-state-surface: stop exit-10 plus blocked, awareness digest with empty blocks, debt from predicate, Blocking versus Digest split."
    }
  ],
  "adrs": [
    {
      "context": "Item steps commit only childWt while concerns/ lives on taskWt; up to 4 parallel items share taskDir; retries/restarts must not duplicate or lose triage.",
      "decision": "Write directly to taskWt/{task}/concerns/ with writeYamlAtomic plus runExclusive taskWt mutex, then immediately commit taskWt when concerns/ or steer/ changed. Distinct fingerprints are distinct files; same fingerprint merges without clobbering dismissed/routed/resolved. Restart re-reads files idempotently. Implementation gated by spike-saga-commit serialization findings.",
      "id": "adr-concern-store-taskwt",
      "title": "Direct taskWt writes with serialized immediate commit"
    },
    {
      "context": "suggestions[] reuse conflated concern triage with fix-loop, mailbox, and plan-approval triggers; review id is free-form; QA must not triage; dismiss needs a reason field.",
      "decision": "Exact-id match (suggestion.id === c-<hash10> or rm-<hash10>) via partitionSuggestions splits triage entries from normal findings. Triage ids update concerns/ only and are excluded from fix-loop/approval/normal-mailbox paths; fix on a concern id routes as fix and returns fixRequired once for the owning item; human-async on a concern writes a single q-concern-<cid> (normal path skipped). Dismiss requires non-empty detail persisted to dismissReason or the step errors. isTriager gate allows only reviewer, plan-reviewer, and close-up/architect chain. Reviewer ordering: aggregate new concerns[] first, then triage only pre-existing ids from concernsYaml (no same-step self-dismiss).",
      "id": "adr-triage-suggestions-dismiss",
      "title": "Partitioned exact-id triage with gate"
    },
    {
      "context": "derive/* must stay pure; debt routing invented an invalid tech-debt disposition; consult writes need exactly-once; mailbox needs dedup.",
      "decision": "Pure derive: derive/task.ts collectRoutedBlockers(taskDir) reads routed kind==blocker affects into a Set passed to deriveWave/deriveItem and scheduler.blockedByConcern(items, concernBlocked) which reuses the blockedByFailure fixpoint pattern, unions with failure-blocked, and cascades only over declared deps. Debt predicate: (kind==tech-debt && status routed/resolved) OR (disposition==optional && status routed); no tech-debt disposition exists. Act phase (triage writeArtifact plus wave-act newly-blocked check) writes decisions/concern-<cid>.yaml exactly once, idempotent on restart, and extends buildArchitectHydration with concernsYaml.",
      "id": "adr-routing-derived-state",
      "title": "Pure derive plus exactly-once act routing"
    },
    {
      "context": "Digest must reuse the mailbox without blocking, halting, or spamming status; classify handles operator answers, not blocking.",
      "decision": "Digest entries are steer/tousertoreview entries with disposition human-awareness and blocks:[]. derive/task splits openSteerQuestions into blocking (blocks.length>0) versus digest (awareness plus empty blocks); classify only routes answers/directives/stop; status renders separate Blocking versus Digest sections.",
      "id": "adr-digest-mailbox",
      "title": "Digest as filtered non-blocking mailbox view"
    },
    {
      "context": "Spec needs autonomous/principal/detailed presets plus raise allowlist and severity thresholds; pipeline root is closed.",
      "decision": "Top-level PipelineConfig.humanInvolvement (default autonomous) plus PipelineConfig.concerns {raiseAllowlist?, minDigestSeverity?, minBlockingSeverity?}. Blocking table: autonomous blocks only on blocking ADR or high human-stop; principal adds human-async and high severity; detailed adds all human-*. Thresholds gate blocking versus digest placement. Criteria fragment agents/criteria/human-involvement.md carries the table tersely.",
      "id": "adr-humaninvolvement-config",
      "title": "Modes plus raise and severity config"
    },
    {
      "context": "Funnel requires less detail per level and never more text than code summarized, with falsifiable checks and no empty digest on zero-diff steps.",
      "decision": "Per-level UTF-8 byte caps on hydrated promptVars only (stored artifacts never truncated): code steps cap min(diffBytes,2000) where diff is item diff for review triage and wave aggregated diff for close-ups; zero-diff orchestration steps cap min(inputBytes,500) where input is plan/context bytes. Reviewer/architect/close-up prompts require condensing with output bytes < input bytes. Engine truncates only the hydrated var.",
      "id": "adr-funnel-text-budget",
      "title": "Per-level hydration byte caps"
    },
    {
      "context": "PipelineConfig type says {default,[agent]} but flows read .allowedDispositions as if global; precedence and dismiss injection are undefined.",
      "decision": "Canonical key is reviewPolicy.default with legacy reviewPolicy.allowedDispositions as a one-iteration read-alias. Single owner src/core/review-policy.ts resolveReviewAllowed(pipeline, agent, isTriager): precedence per-agent array > default > builtin [fix,optional,architect,human-awareness,human-async]; when isTriager is true append dismiss if absent; QA and other non-triagers never receive dismiss. Used by both prompt criteria and generateReviewSchema.",
      "id": "adr-reviewpolicy-canonical",
      "title": "Canonical reviewPolicy with triager injection"
    },
    {
      "context": "Hashing detail/severity duplicates on rewording; excluding them hides severity escalation on dismissed concerns.",
      "decision": "Stable id c-{sha1-10} over {kind, normalizedSummary, location, sortedAffects} excluding detail and severity. Normalization trims, collapses whitespace, lowercases summary. Re-emit merges: detail keeps longer/latest, severity keeps max, updatedAt and source.lastSeen advance, never changes dismissed/routed/resolved except via triage or close-up resolution. If re-emit severity exceeds stored severity, set source.escalated=true and surface the escalation in digest and architect hydration without reopening; architect may reopen via close-up resolution.",
      "id": "adr-fingerprint-merge",
      "title": "Fingerprint identity, merge, escalation surfacing"
    },
    {
      "context": "Close-up schemas are closed, wave-close-up has no reviewer, stored statuses have no pending, and simple items have no reviewer.",
      "decision": "Add concernResolutions?: [{id, action: resolve|carry|propagate, note?}] plus concerns[]/remarkable[] producer fields to wave/plan-closeup schemas and StoredConcern.pendingResolution?: {action,note,by,at}. Wave-close-up proposes via applyCloseupResolutions (status stays routed, pending set); architect-wave-report confirms via concernConfirms?: [{id, confirm: accept|reject, note?}] applying resolved/routed/propagated or clearing pending. Propagate targets parent concerns/ copy for epics or human digest for task-level unless elevated to blocking ADR. Simple-item fallback at wave-close-up: kind tech-debt auto-routes to disposition optional (debt), all other kinds to architect (carry); human-* is never auto-routed.",
      "id": "adr-closeup-retriage",
      "title": "Close-up pending resolution and simple fallback"
    },
    {
      "context": "Remarkable {chosen,alternatives,why} needs one authoritative store and the same triage vocabulary.",
      "decision": "Authoritative store is concerns/rm-{hash10}.yaml with RemarkableDecision plus status and source. Triaged with suggestions[] dismiss vocabulary via exact-id match under the same partition and gate. Routed remarkables go digest-only unless elevated to a blocking ADR.",
      "id": "adr-remarkable-store",
      "title": "Remarkable decisions in rm- files"
    },
    {
      "context": "dispositions.md and ARCHITECTURE 8.7 define human-stop as tousertoreview plus exit-10 halt, but item-machine treats it fix-like running.",
      "decision": "Preserve exit-10 halt: human-stop writes a mailbox entry with blocks covering affected items plus task when task-level, item-machine maps it to blocked terminal, derive marks item and task blocked, and the engine halts with exit code 10 at the next mailbox check until answered or dismissed. Awareness with blocks:[] never enters blocked sets and never triggers exit 10. Update dispositions.md and ARCHITECTURE 8.7 to keep the contract explicit.",
      "id": "adr-human-stop",
      "title": "Human-stop preserves exit-10 halt"
    },
    {
      "context": "Derive throws on corrupt triage/plan/steer/decisions while concerns/ proposes skip; one bad concern could fail a whole step.",
      "decision": "Corrupt concerns/*.yaml files are skipped with a warn and excluded from counts because concerns/ is an append-only cache rebuildable from committed step records; missing concerns/ yields zero counts. A single unknown-kind concern fails its step with no partial aggregate and no clobber of existing files, forcing prompt/schema drift to surface via retry rather than silent loss.",
      "id": "adr-resilience",
      "title": "Corrupt-skip versus strict-fail resilience"
    },
    {
      "context": "Spec says every agent output may carry concerns[], but not every schema has a producer and reviewer has a dual aggregate-plus-triage role.",
      "decision": "Producer matrix via a shared concern/remarkable partial: developer, fact-finder, qa, poc, test-assumptions, reviewer/plan-reviewer new concerns[], architect plan/revise, consult decisions, wave/plan-closeup, architect wave-report/closeup. Triage, infra, and pm-edit mechanical outputs are explicitly out of scope (no LLM synthesis). Consults aggregate via runItemConsult/runNonItemConsult writeArtifact. Reviewer ordering: aggregate new concerns first, then triage only pre-existing ids.",
      "id": "adr-producer-matrix",
      "title": "Producer matrix and reviewer ordering"
    }
  ]
}

## Task Status
iteration: 1
amendments: 2
items:
  - spike-text-budget kind=test-assumptions wave=1 status=merged outlineRef=spike-text-budget
  - spike-saga-commit kind=fact-finder wave=1 status=ready outlineRef=spike-saga-commit
  - concerns-contracts kind=dev wave=1 status=superseded outlineRef=concerns-contracts
  - concerns-store kind=dev wave=2 status=pending outlineRef=concerns-store
  - modes-prompts kind=dev wave=2 status=pending outlineRef=modes-prompts
  - reviewer-triage kind=dev wave=3 status=pending outlineRef=reviewer-triage
  - plan-reviewer-triage kind=dev wave=3 status=pending outlineRef=plan-reviewer-triage
  - routing-blocker-derive kind=dev wave=4 status=pending outlineRef=routing-blocker-derive
  - routing-human-debt kind=dev wave=4 status=pending outlineRef=routing-human-debt
  - routing-architect-consult kind=dev wave=5 status=pending outlineRef=routing-architect-consult
  - adr-blocking-digest kind=dev wave=5 status=pending outlineRef=adr-blocking-digest
  - status-state-surface kind=dev wave=5 status=pending outlineRef=status-state-surface
  - funnel-closeups kind=dev wave=6 status=pending outlineRef=funnel-closeups
  - saga-propagate kind=dev wave=6 status=pending outlineRef=saga-propagate
  - docs-finish kind=dev wave=7 status=pending outlineRef=docs-finish
  - concerns-contracts-types kind=dev wave=2 status=merged outlineRef=concerns-contracts-types
  - concerns-contracts-schemas kind=dev wave=3 status=merged outlineRef=concerns-contracts-schemas
  - concerns-contracts-policy kind=dev wave=3 status=merged outlineRef=concerns-contracts-policy
waves: 1, 2, 3, 4, 5, 6, 7
merged: spike-text-budget, concerns-contracts-types, concerns-contracts-schemas, concerns-contracts-policy
blocked: (none)
failed: (none)
open steer questions:
  - awareness-plan-1-digest-mailbox-reuse ref=plan-1 disposition=human-awareness: ADR avoids new dir but relies on engine never treating empty-blocks awareness as blocker; factory status currently lists all openSteerQuestions as blocking questions. Confirm status/derive/classify filtering keeps digest low-noise per fire-test.
  - awareness-plan-1-merge-escalation-hidden ref=plan-1 disposition=human-awareness: Merge keeps max severity and longer/latest detail but never reopens dismissed/routed/resolved except via triage. Escalated risk on dismissed concern stays dismissed/hidden. Architect can decide now (reopen on escalation vs keep + digest surfacing), but operator should be aware of hidden-escalation tradeoff.

## Architect Amendment Directives
Amendment 2/3 (scheduling repair, no scope change): waves 4-5 ran empty because 9 pending items are orphaned in already-closed waves 2-5. Root cause verified in code: iteration wave loop (iteration.ts:700-720) skips closed waves, and deriveWaveState (wave.ts:29) carries forward only blocked items from past waves, never pending items whose deps merged late; amendment 1 updated deps without re-waving. Fix: version all 12 pending items to -v2 slugs (list in outlines), remove the 12 stale originals via removeItemSlugs, and have PM schedule the -v2 chain into fresh waves 6+ in strict topological order (store-v2+modes-v2 first and parallel; triages next; derive next; consults next; closeups/saga next; docs last). Dependents must sit in strictly later waves than their deps, never the same wave. Spike-saga-commit (ready, wave 1, zero prod diff) stays as-is: findings authoritative, do not re-run. Gates green (test fail->pass improved); operator should update gates-baseline.yaml to green.

## Completed Wave Reports
Wave 5 completed. Merged items:

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
