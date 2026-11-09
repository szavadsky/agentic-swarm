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
  "iteration": 2,
  "milestones": [
    {
      "directionalInterfaces": [
        "step-runner/iteration -> triage.hydrateStepConcerns(taskDir,{stepRole,bytes,consumer}): callers compute bytes (step-runner item diff; iteration taskDiff/input), callee caps+renders; skip rule (caller-supplied wins); '' on zero-cap/empty (hydrateConcernsYaml deleted)",
        "aggregateConcerns -> mergeConcern(new id; affects-union incl terminal; escalated on rise) + legacy dual-lookup rename; KeyedMutex RMW + taskWt commitAll unchanged; journal on skip",
        "buildArchitectHydration -> debt/steering WITHOUT concerns (UTF-8 capped); architect turns consume concernsYaml (architect set incl escalated notes) as single source",
        "prompts.render <- KNOWN_VARS (prompt-fragments extends producer fragments); terse 2-3-line sections; per-fragment +<=15, total +<=80, prompts.test asserts"
      ],
      "id": "m1-hydration-prompts",
      "scenarios": [
        "Given task-branch diff 5000 bytes and open concerns 3000 bytes When wave-close-up hydrates Then concernsYaml is <=2000 bytes and < task diff in UTF-8 bytes",
        "Given zero-diff plan-review with 4000-byte input in iteration 2+ When hydrating Then concernsYaml is <=500 bytes and < input bytes",
        "Given a dismissed concern re-emitted with higher severity When merge and hydration run Then status stays dismissed, source.escalated=true, a q-escalated-<cid> digest entry exists with blocks=[], and the escalation appears in architect concernsYaml",
        "Given the same concern re-emitted with added affects When merge runs Then a single file holds union affects with no fork; a legacy old-hash file is rename-merged and the triage id stays stable",
        "Given each matrix fragment rendering When preflight and render run Then required sentinels appear (## Open Concerns + Raise concerns on all 19; ## Human involvement on review/qa/plan-review/architect-*/close-ups) with per-fragment added lines <=15 and total <=80",
        "Given zero-byte diff and input When hydrating Then concernsYaml renders '' with standing heading/instructions but zero id lines",
        "Given an open rm-* remarkable When review and architect prompts hydrate Then concernsYaml includes it as {id, kind remarkable, summary chosen}"
      ],
      "title": "Hydration, caps, fingerprint, prompts"
    },
    {
      "directionalInterfaces": [
        "producers -> JSON schemas + artifacts.ts (concernConfirms, concernResolution, concerns/remarkable incl review remarkable, lowercase detail): schemas validate, TS mirrors, no runtime",
        "engine.runChildTask -> propagateEpicConcerns(childTaskDir => parent.taskDir/concerns on parentWt, commit:false writes, KeyedMutex(parentWt) atomic record) + forward blocking questions to parent root mailbox; condensed per-epic ids, restart-idempotent merge"
      ],
      "id": "m2-contracts-epic",
      "scenarios": [
        "Given structured concerns/remarkable from developer (incl poc/test-assumptions/test-first/simple-implement/fix-round), fact-finder (incl research), qa, reviewer/plan-reviewer newConcerns+remarkable, plan/revise, decisions incl concernResolution, close-ups incl concernResolutions, and architect reports incl concernConfirms When validation and typecheck run Then all pass with matching TS types, lowercase detail persists, reviewer remarkable no longer fails additionalProperties, and triage/infra/pm-edit still reject concerns",
        "Given a child epic finishing with one dismissed and one open concern with 800-byte detail When runChildTask completes Then the parent gains exactly one copy with id from [epic] summary, detail <=500 bytes and strictly shorter via char-safe half-cut, source.epic set, while dismissed stays local; a <=120-byte detail copies verbatim",
        "Given a propagated epic concern When the saga architect hydrates Then concernsYaml contains the epic id and summary; a restart creates no duplicate; the child blocking question is forwarded as q-epic-<epic>-<orig> with mapped blocks; open copies alone cause no parent exit-10"
      ],
      "title": "Contracts and epic propagation"
    },
    {
      "directionalInterfaces": [
        "ingestStepConcerns -> triage.applyReviewTriage -> routeHumanDisposition(all triagers): q-concern-/q-escalated- writes via writeQuestion (blocks vs digest), dedup by existence; item-machine raw path skips ALL concern-id human-*",
        "ingest allowlist gate keyed on source.agent (post-validation skip+journal, step ok) + severity gates (digest>=minDigest, blocks>=minBlocking else downgrade; rm exempt); defaults medium/high = shipped",
        "derive/task.collectRoutedBlockers(taskDir,minBlocking) severity-aware + call-site threading; close-up/architect/consult ingest -> pending -> confirms (accept resolve/carry/propagate | reject clear+preserve) + consult resolve->resolved with cross-emission guard; wave-close-up fallback over triage-less open"
      ],
      "id": "m3-routing-lifecycle",
      "scenarios": [
        "Given a routed high blocker whose affects names a declared dependent When derive and wave-act run Then the dependent derives blocked, exactly one decisions/concern-<cid>.yaml is written, and a restart writes no second file",
        "Given a routed architect concern When the next architect-plan turn hydrates Then its concernsYaml input contains that concern id and summary",
        "Given reviewer suggestion matching a concern id with disposition dismiss and detail When review commits Then that file has status dismissed plus dismissReason=detail, is kept, and causes no mailbox, debt, blocked, or approval effect",
        "Given an rm-* remarkable triaged architect or dismissed When routing runs Then it becomes routed with disposition persisted or dismissed with reason; routed rm-* gains a digest entry with blocks=[] that never blocks or halts",
        "Given a routed human-async concern When routing runs Then mailbox q-concern-<cid> blocks the item and the engine continues without exit 10; given plan-reviewer human-stop Then a single q-concern-<cid> blocks task/item and the engine halts with exit 10",
        "Given raiseAllowlist excluding qa When QA emits newConcerns Then no file is written, the skip is journaled, and the step stays ok; given minBlockingSeverity high and a low human-stop Then it is downgraded to digest with no blocks and no exit-10",
        "Given a low blocker routed When derive runs Then the dependent is NOT blocked (severity-aware collectRoutedBlockers); the concern still appears in hydration and digest per minDigest",
        "Given wave-close-up emitting concernResolutions for triaged ids When it commits Then pendingResolution is proposed with status unchanged; architect concernConfirms accept applies resolved/routed/propagated and reject clears pending preserving status with no disposition",
        "Given a concern consult decision carrying concernResolution {id, resolve} When it commits Then the bound concern becomes resolved and the dependent unblocks on next derive; an item-consult decision carrying concernResolution is ignored with a journal note",
        "Given a simple item with open concerns and no reviewer When wave-close-up runs Then explicit resolutions propose pending for those ids; fallback auto-routes only triage-less open tech-debt to optional (appearing in the derived debt list) and assumption/risk/question to architect; kind=blocker stays open and human-* dispositions are never assigned",
        "Given pipeline.yaml humanInvolvement detailed When reviewer and architect prompts render Then the detailed criteria fragment is included; pipeline.default.yaml ships commented autonomous/principal/detailed presets with the fragment->agent mapping"
      ],
      "title": "Human routing, severity, lifecycle"
    },
    {
      "directionalInterfaces": [
        "docs-finish-v3 delivers: ARCHITECTURE §1 row18 + §8.11 + §5/§6.2/§8.7/§10/§11/§13, README section, pipeline commentary, human-involvement.md deviation note; prompts.test matrix + 15/80 budgets; TMPDIR=/tmp gates green"
      ],
      "id": "m4-docs-gates",
      "scenarios": [
        "Given implementation complete When grep runs Then ARCHITECTURE contains '8.11 Concerns' and 'immediate halt', §1 row 18 no longer contains 'Deliberately not hand-built', README contains a concerns/modes section, and config commentary matches landed severity/router semantics",
        "Given prompt fragments When prompts.test runs Then the KNOWN_VARS matrix and 15-per-fragment/80-total budgets pass",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass"
      ],
      "title": "Docs and gates"
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes. hydrateStepConcerns + listHydratedConcerns per adr-hydration-single-cap (stepRole table, caller-computed bytes, skip rule, '' semantics, injectable gitFn) + adr-hydrated-sets. Delete hydrateConcernsYaml; buildArchitectHydration drops concerns, UTF-8 capped. Fingerprint kind+summary+location, affects-union incl terminal, legacy dual-lookup rename. Regression tests: iter2+ plan-review <=500B, open+pending visibility, 0/1/3-byte caps -> ''. Behavior tests only. Verify typecheck + TMPDIR=/tmp bun test.",
      "kind": "story",
      "milestoneId": "m1-hydration-prompts",
      "prodBudgetHint": 250,
      "slug": "hydration-fingerprint-caps",
      "title": "Unified hydration, caps, fingerprint"
    },
    {
      "deps": [],
      "description": "Schemas + TS only, no ingest/apply. artifacts.ts: DeveloperOutput concerns Concern[], ReviewArtifact newConcerns + remarkable, FactFinder/WaveCloseup/PlanCloseup/Decision concerns/remarkable, ConcernConfirms + ConcernResolution types. review-schema.ts + review.schema.json: remarkable. Wave-report output + plan-closeup schemas: concernConfirms. decisions.schema + DecisionArtifact: concernResolution. Normalize ALL concern Detail->lowercase detail across schemas (developer-output capital-D bug) + regression test that lowercase detail validates and persists. triage/infra/pm-edit untouched. Verify typecheck + preflight.",
      "kind": "story",
      "milestoneId": "m2-contracts-epic",
      "prodBudgetHint": 140,
      "slug": "contracts-drift-fix",
      "title": "Producer type and schema drift"
    },
    {
      "deps": [],
      "description": "Own prompt-vars.ts + fragments + matrix test. KNOWN_VARS: concernsYaml for develop/test-first/simple-implement/fix-round/poc/test-assumptions/research (+short forms); HI only where registered. Per-fragment delta per adr-prompt-fragment-matrix (producers OC+raise; triagers/architects/close-ups/qa +HI+condense). Per-fragment +<=15 lines, total +<=80; prompts.test per-fragment sentinels + budgets; update human-involvement-config.test.ts non-consumer assertion (develop leaves, triage/infra stay) + FRAGMENT_MATRIX. Behavior tests: sections render; mode switch changes criteria. Verify preflight + typecheck.",
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
      "description": "Single routeHumanDisposition in triage for all triagers (async/stop/awareness + routed rm-* + dismissed-escalated digest; q-concern-/q-escalated-; dedup by existence); item-machine raw path skips ALL concern-id human-*. Severity: agent-keyed allowlist skip+journal (step ok); minDigest/minBlocking gates + downgrade (stop loses exit-10); rm exempt; defaults medium/high; commentary documents fragment->agent mapping (no allowlist entries added). Own derive: severity-aware collectRoutedBlockers(taskDir,minBlocking) + call-site threading (fallback high). Explicit fixture severities keep suite green. Behavior tests: plan/close-up routing, rm digest, skip+journal+ok, downgrade + derive unblocked, no double-write, exit-10 only blocking stop.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m3-routing-lifecycle",
      "prodBudgetHint": 280,
      "slug": "human-router-severity",
      "title": "Human router and severity policy"
    },
    {
      "deps": [
        "hydration-fingerprint-caps"
      ],
      "description": "engine.runChildTask -> propagateEpicConcerns per adr-epic-push-condensed (c-* + rm-* condensed push, commit:false writes, KeyedMutex(parentWt) atomic record, restart-idempotent merge preserving parent triage; forward blocking questions with blocks mapping). Spike-saga-commit/Decision 002 authoritative. Behavior tests: one condensed copy (incl rm-*), dismissed local, tiny-detail verbatim, saga input contains id, restart no dup, forwarded q-epic-* with mapped blocks, no parent halt from copies.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m2-contracts-epic",
      "prodBudgetHint": 190,
      "slug": "epic-saga-propagate",
      "title": "Epic to saga propagation"
    },
    {
      "deps": [
        "contracts-drift-fix",
        "epic-saga-propagate",
        "human-router-severity"
      ],
      "description": "Ingest + apply (schemas owned by contracts-drift-fix). ingestStepConcerns reads concernConfirms + concernResolution; consults.ts passthrough; cross-emission guard (honor only concern consults + closeup/architect contexts, else ignore+journal); ordering (consult apply at decision commit, confirms at architect ingest). Resolutions->pending; confirms accept (resolve/carry/propagate via epic helper) / reject (clear, preserve, no disposition). Wave-close-up fallback over triage-less open per ADR (blocker stays open; tech-debt->optional in derived debt; others->architect; never human-*). Behavior tests: pending/confirm matrix, reject preserves open, consult unblock by id, guard ignores item-consult resolution, fallback + debt, resolved reachable.",
      "escalate": true,
      "kind": "story",
      "milestoneId": "m3-routing-lifecycle",
      "prodBudgetHint": 240,
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
      "description": "Deliverables: ARCHITECTURE §1 row 18 (drop 'Deliberately not hand-built') + new §8.11 + §5/§6.2/§8.7/§10/§11/§13, README concerns/modes, pipeline commentary sync, human-involvement.md + §8.11 immediate-halt deviation note; prompts.test matrix + 15/80 budgets; consolidated coverage. Grep-asserted: '8.11 Concerns', 'immediate halt', README 'concerns', row-18 replacement. Final gates: bun run typecheck + TMPDIR=/tmp bun test green.",
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
      "why": "Baseline red only under .factory-runtime TMPDIR; suite green with TMPDIR=/tmp. Hydration git uses explicit taskWt cwd, not worktree inference, so it is unaffected; tests still run TMPDIR=/tmp."
    },
    {
      "assumption": "Spike findings spike-text-budget (byte caps) and spike-saga-commit (serialization/derive/commit/propagation, Decision 002 directives) remain authoritative; no re-run.",
      "why": "Both accepted in iteration 1 with binding downstream directives; iteration-2 items implement them."
    },
    {
      "assumption": "Dismissed/routed/resolved stay terminal-in-merge (status preserved; content merges + escalated flag); escalated-severity-on-dismissed surfaces in digest + architect hydration; triage is the only reopen path.",
      "why": "Operator directive 1794112659180 decided keep + digest surfacing."
    },
    {
      "assumption": "funnel-closeups-v3 unmerged branch is discarded; its retry guidance substance (step-role cap classification, pending visibility for open+routed, reject-preserves-status, zero-cap '') is captured in adr-hydration-single-cap and adr-closeup-lifecycle-resolved, which items implement.",
      "why": "Iteration 1 closed with v3 running/unmerged; ADRs carry the normative substance so items need no branch reference."
    },
    {
      "assumption": "Effective severity defaults are shipped medium/high (code fallback identical); tasks opt out via pipeline.yaml null/deletion.",
      "why": "Aligns code with shipped pipeline.default.yaml; items keep suite green with explicit fixture severities."
    },
    {
      "assumption": "Autonomous immediate-halt deviation accepted now; operator notified via open awareness item awareness-plan-2-autonomous-halt-deviation.",
      "disposition": "human-awareness",
      "why": "High-impact tradeoff visible in plan; architect decides, operator informed, docs mark it explicitly."
    }
  ],
  "techDebt": [
    {
      "category": "adjacent",
      "description": "Pre-existing head-guard failures when TMPDIR sits under .factory-runtime: inferTaskWorktree matches a folder-boundary tail yet 2 failures persist via a different path. Baseline red; green with TMPDIR=/tmp. Out of scope. Hydration git uses explicit taskWt cwd (not worktree inference), so the new taskDiff path is unaffected.",
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
      "context": "Two hydration helpers diverge; plan-review overrides terse value; buildArchitectHydration caps JS length and double-embeds concerns; byte sources, git seam, '' semantics, and step-runner/iteration double-compute undefined.",
      "decision": "triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) — callers compute bytes, callee caps+renders. stepRole table: review|qa -> min(diffBytes,2000), diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000), taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500), inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins, no race). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. hydrateConcernsYaml deleted. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only.",
      "id": "adr-hydration-single-cap",
      "title": "Single hydration module with step-role byte caps"
    },
    {
      "context": "Predicates diverge (step-runner open-only, architect open+routed, hydrate open c-+rm-); terseConcern drops pendingResolution; dismissed+escalated and rm-* visibility undefined; RemarkableDecision has no severity.",
      "decision": "triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes. Terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}. countConcerns stays c-* only. rm-* exempt from severity gates, always digest-eligible when routed.",
      "id": "adr-hydrated-sets",
      "title": "Per-consumer hydration sets with rm rules"
    },
    {
      "context": "Fingerprint includes sorted affects so added refs fork files; stored files keyed by old hash; mergeConcern replaces affects; terminal content-merge vs terminal-in-merge ambiguous.",
      "decision": "Identity kind+normalized summary+location; affects merged as sorted-union INCLUDING on terminal statuses (status preserved, detail/severity/affects/escalated still merge; triage is the only reopen path). Migration: aggregate dual-lookup — compute new id; if file missing, scan store for legacy file with same kind+norm summary+location (any affects) and rename-merge into new id with union affects. No GC pass. Refines adr-fingerprint-merge.",
      "id": "adr-fingerprint-affects-union",
      "title": "Fingerprint identity without affects, union merge"
    },
    {
      "context": "Only review/plan-review consume hydration; KNOWN_VARS steps/develop lacks both vars; poc/test-assumptions/research produce concerns but are absent from matrix; test asserts develop lacks vars; budgets unclear.",
      "decision": "prompt-fragments owns prompt-vars.ts + fragments + test update. KNOWN_VARS gains concernsYaml on steps/develop,develop,steps/test-first,test-first,steps/simple-implement,simple-implement,steps/fix-round,fix-round,steps/poc,poc,steps/test-assumptions,test-assumptions,steps/research,research (+humanInvolvementCriteria only where already registered). Sections: producers (develop-family+poc/test-assumptions/research) get 3-line ## Open Concerns {{concernsYaml}} + 1-line raise (no HI: they raise, never triage); triagers/architects/close-ups/qa get HI section + condense rule appended. Delta: architect-plan/revise add OC+raise; review adds HI+condense; plan-review adds raise+condense; rest add per above. Budgets: added lines per fragment <=15, total <=80 (2-3-line section convention); prompts.test asserts per-fragment sentinels (## Open Concerns, ## Human involvement, Raise concerns) + budgets; human-involvement-config.test.ts non-consumer assertion updated (develop leaves, triage/infra stay).",
      "id": "adr-prompt-fragment-matrix",
      "title": "Full fragment matrix with raise instructions"
    },
    {
      "context": "Severity config never read; shipped medium/high + 8-agent allowlist; poc/test-assumptions run as agent developer (fragment-gated entries would be dead); gate order vs validation undefined.",
      "decision": "Gate key is source.agent (never fragment): developer covers develop/poc/test-assumptions/test-first/simple-implement/fix-round, fact-finder covers research, architect covers architect-*; shipped 8-agent allowlist is already the complete producer matrix — no entries added, commentary documents fragment->agent mapping. Effective defaults = shipped medium/high (code fallback identical). Order: schema validation first (triage/infra/pm-edit schema-reject), then ingest allowlist skip+journal with step ok. Digest iff severity>=minDigest; blocks iff severity>=minBlocking else downgrade to digest (stop loses exit-10). rm-* exempt.",
      "id": "adr-severity-policy-active",
      "title": "Active severity and allowlist policy"
    },
    {
      "context": "applyReviewTriage writes only human-async; awareness/stop rely on item-machine raw suggestions so plan/close-up/architect dispositions never reach mailbox; rm-* has no digest; item-machine double-writes; collectRoutedBlockers blocks severity-blind so downgrade is ineffective.",
      "decision": "Single routeHumanDisposition in triage for all triagers at ingest: human-async q-concern-<cid> blocks=[item]|[task]; human-stop blocks item+task + exit-10; human-awareness, routed rm-*, dismissed+escalated -> digest via writeQuestion human-awareness blocks=[] (q-concern-/q-escalated-), never blocking/halting. Dedup by existence. item-machine raw path skips ALL concern-id human-*. human-router-severity also owns derive: collectRoutedBlockers(taskDir,minBlocking) blocks only kind=blocker+routed+severity>=minBlocking; deriveTaskState/withRoutedBlocking thread pipeline.concerns.minBlockingSeverity (fallback high). Debt predicate unchanged.",
      "id": "adr-human-router-single",
      "title": "Single human-disposition router with severity-aware derive"
    },
    {
      "context": "applyCloseupResolutions records pending with no applier; resolved unreachable; consult decisions never transition concerns; concernConfirms/consult-resolution need schema+TS+ingest+apply owners; consults.ts drops unknown fields; fallback scope/terminology wrong (blocker auto-block, human-* vacuous).",
      "decision": "contracts-drift-fix owns schema+TS: concernConfirms?: [{id,confirm:accept|reject,note?}] in architect wave-report output + plan-closeup schema; decisions.schema + DecisionArtifact gain concernResolution?: {id, action: resolve|carry}; all concern Detail normalized to lowercase detail. closeup-lifecycle-resolve owns ingest (ingestStepConcerns reads both), consults.ts concernResolution passthrough, and apply: accept+resolve->resolved, accept+carry->routed+architect, accept+propagate->parent copy/digest via epic helper; reject clears pending, preserves status, no disposition. Consult act phase applies resolve->resolved at decision commit (unblocks next derive); honored only on concern consults + closeup/architect contexts, ignored+journaled elsewhere. Wave-close-up fallback over triage-less open (open, no pendingResolution, no disposition): tech-debt->optional (derived debt), assumption|risk|question->architect; kind=blocker stays open for explicit triage; fallback never assigns human-* dispositions.",
      "id": "adr-closeup-lifecycle-resolved",
      "title": "Close-up propose/confirm lifecycle with unblock"
    },
    {
      "context": "runChildTask writes only child-closeup + single commit; child concerns/ isolated; spike-saga-commit/Decision 002 mandate push+forward; rm-*, commit ownership, parallel-epic races, forward mapping, back-sync, and truncation edge cases unspecified.",
      "decision": "engine.runChildTask calls propagateEpicConcerns({childTaskDir,parentTaskDir,parentWt,epic}) after runIteration before child-closeup write, every status: push open+routed (skip dismissed); c-* copies get summary [epic] <child summary>, id=recomputed fingerprint, status open, source {epic, record epic:<epic>/<child-record>}; child rm-* propagate as parent rm-* with chosen prefixed [epic], id recomputed, why condensed. Condense UTF-8 char-safe: detail<=120B verbatim (tiny exemption); else cut to min(500B, half) on char boundary (strictly shorter guaranteed). Writes use aggregate opts {commit:false}; parent-side propagate+closeup+add+commit serialized under KeyedMutex(parentWt) (never repo.writeLock) so parallel epics cannot race; existing single commit covers copies+closeup. Forward childTaskDir/steer/tousertoreview entries with blocks.length>0 to parent.taskDir/steer/tousertoreview as q-epic-<epic>-<orig>, blocks mapped (child item slugs->epic; child-task-level->parent task slug; default [epic]). No back-sync: child run is complete; forwarded entries are parent-owned. Copies open/unrouted -> no parent halt; halt only via forwarded questions.",
      "id": "adr-epic-push-condensed",
      "title": "Epic push with condensed parent copies"
    },
    {
      "context": "Mode table says autonomous defers blocking until unblocked work drains, but implementation routes blocking ADRs at plan time and halts immediately; deferral needs drain scheduling.",
      "decision": "Keep immediate halt as accepted deviation for iteration 2 (simpler, preserves exit-10 contract, matches tested behavior). Operator awareness item awareness-plan-2-autonomous-halt-deviation already open (filed at plan review); docs-finish-v3 marks the deviation explicitly in ARCHITECTURE 8.11 and human-involvement.md; drain-then-block scheduling is future work.",
      "id": "adr-autonomous-immediate-halt",
      "title": "Autonomous immediate halt accepted"
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
