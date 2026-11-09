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
  "iteration": 6,
  "milestones": [
    {
      "directionalInterfaces": [
        "step-runner validation (caller) -> runtime file schemas (callees: decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup): lowercase detail accepted, capital Detail rejected with step error before any store write; aggregateConcerns/mergeConcern carry lowercase detail with longest-wins",
        "contract and longest-wins suites (callers) -> file schemas plus StoredConcernArtifact (callees): schemas accept lowercase detail and reject capital Detail; stored reads assert lowercase detail; reference review schema matches the generated schema on suggestions + newConcerns casing; negative-casing fixtures keep capital Detail to prove rejection"
      ],
      "id": "m0-detail-normalize",
      "scenarios": [
        "Given the 6 runtime file schemas plus reference review schema When test/contracts/schema-detail-normalize.test.ts, test/contracts/concern-schemas.test.ts, and test/contracts/concern-artifact-types.test.ts run Then lowercase detail validates and capital Detail is rejected, including review suggestions casing",
        "Given a stored concern with 200-byte detail re-emitted with 20-byte detail When aggregateConcerns merges Then the stored 200-byte detail survives",
        "Given tsc --noEmit and the contract, longest-wins, and epic-saga suites When run with TMPDIR=/tmp Then all pass, proving no stale capital reads remain (typed reads fail typecheck, casing fails contracts)",
        "Given the full suite When gates run with TMPDIR=/tmp Then typecheck and bun test pass with no regressions"
      ],
      "title": "Detail casing normalization"
    },
    {
      "directionalInterfaces": [
        "architect agents (callers) -> architect-closeup plus architect-wave-report fragments (callees): final bullet carries the concernConfirms accept/reject instruction with the reject-noteless-dismiss rule (wave-report scoped to wave-close-up proposals) while preserving Raise-concerns and condense sentinels; neither fragment carries a concernResolutions instruction",
        "docs-concerns sentinels (callers) -> ARCHITECTURE §1 row 18 plus §8.11 deviations list (callees): row and body needles agree on six deviations including epic-mailbox-isolation; repo docs/adr stubs expose Decision paragraphs for the three records"
      ],
      "id": "m1-confirm-instructions",
      "scenarios": [
        "Given agents/steps/architect-closeup.md When read Then the final bullet instructs concernConfirms accept/reject with the reject-noteless-dismiss rule, keeps Raise-concerns and condense clauses, carries no concernResolutions instruction, and the fragment non-empty line count is unchanged",
        "Given agents/steps/architect-wave-report.md When read Then the final bullet instructs concernConfirms for wave-close-up proposals with the same note rule, keeps Raise-concerns and condense clauses, carries no concernResolutions instruction, and the fragment non-empty line count is unchanged",
        "Given the rendered architect-closeup and architect-wave-report prompts When checked via prompts.test.ts Then the confirms instruction and the dismiss-note-rule phrase are present in both, concernResolutions is absent from both, both fragment line counts are pinned to baseline, and the fragment matrix plus 15/80 debloat budgets pass",
        "Given docs/adr/adr-confirm-field-instructions.md, docs/adr/adr-epic-mailbox-isolation.md, and docs/adr/adr-remarkable-digest-triage.md When read Then each contains its Decision paragraph appended to the preserved title+context stub text",
        "Given ARCHITECTURE §1 row 18 and the §8.11 Accepted deviations list When read Then both record six deviations including epic-mailbox-isolation",
        "Given test/docs-concerns.test.ts and the full suite When run with TMPDIR=/tmp Then all sentinels pass including the updated row-18 and deviations needles and titles, and typecheck and bun test pass"
      ],
      "title": "Close-up confirm instructions and traceability updates"
    }
  ],
  "itemOutlines": [
    {
      "deps": [],
      "description": "FINAL-ITERATION RETRY of v3 per persisted decision 026 (closes QA-exhausted v3). Normalize concern Detail (capital-D) to detail (lowercase-d, all lowercase letters) in the 6 runtime file schemas under plugins/software-factory/config/schemas/ (decisions, developer-output, fact-finder-output, plan, plan-closeup shared by architect-closeup, wave-closeup) + reference-only review.schema.json BOTH occurrences: suggestions[].Detail (:33) AND newConcerns[].Detail (:65), since the generated review-schema.ts already emits lowercase-d for both and the reference file must match. TS fix at plugins/software-factory/src/core/concerns.ts:74: change the guard's capital-D property read to the lowercase-d property read (all-lowercase detail), restoring longest-wins. MUST-FIX positive stored reads to lowercase-d: plugins/software-factory/test/engine/epic-saga-propagate.test.ts:248/307/313/319 AND plugins/software-factory/test/contracts/schema-detail-normalize.test.ts:234/263 longest-wins assertions; sweep plugins/software-factory/test/engine/funnel-text-budget.test.ts + any others with :raw reads (grep missed verified matches, never rely on grep alone). MUST-PRESERVE all negative-casing fixtures capital-D: schema-detail-normalize absence assertions + capital-D rejection payloads, concern-schemas.test.ts capital-D rejection payloads, concern-artifact-types.test.ts capital-D ts-expect-error fixture. Rule: positive stored-read assertions flip to lowercase-d; every rejection/absence/expect-error fixture keeps capital-D. Longest-wins tests already exist -- fix their reads, do NOT add duplicates. Add a suggestions-casing assertion to the reference-review-schema contract test: review.schema.json suggestions[].properties.detail exists lowercase-d and suggestions[].properties Detail (capital-D) is absent. triage/infra/pm-edit untouched. Verify typecheck + TMPDIR=/tmp bun test full suite green; QA evaluates red-to-green via longest-wins/contract suites.",
      "kind": "story",
      "milestoneId": "m0-detail-normalize",
      "prodBudgetHint": 30,
      "slug": "schema-detail-normalize-v4",
      "title": "Lowercase detail in producer schemas + merge fix (final retry)"
    },
    {
      "deps": [
        "schema-detail-normalize-v4"
      ],
      "description": "Per adr-confirm-field-instructions, after m0 is merged (baseline is RED so m1 gates require m0): net-zero single-line in-place replacement of the existing final bullet in plugins/software-factory/agents/steps/architect-closeup.md (concernConfirms accept/reject instruction incl the dismiss note rule 'reject dismiss proposals lacking a pending note'; concernResolutions instruction gone) and in plugins/software-factory/agents/steps/architect-wave-report.md (concernConfirms instruction for wave-close-up proposals, incl the same dismiss note rule). Both rewritten bullets MUST keep the Raise-concerns-with-evidence clause and the condense clause -- only Resolutions->Confirms plus the dismiss note rule changes -- or the prompts.test matrix sentinels fail. Zero net added lines per fragment; plugins/software-factory/agents/steps/architect-resume.md and all other fragments untouched. Extend plugins/software-factory/test/prompts.test.ts asserting: confirms-present in both rendered prompts, concernResolutions-absent from BOTH fragments, the dismiss-note-rule phrase in BOTH renders, and both fragments' non-empty line counts pinned to baseline (automated net-zero enforcement); also verify git diff --numstat shows equal insertions/deletions for the two fragments. Complete (UPDATE, never rewrite: preserve existing title+context stub text, append the Decision paragraph from the matching plan ADR) docs/adr/adr-confirm-field-instructions.md, docs/adr/adr-epic-mailbox-isolation.md (sixth deviation), docs/adr/adr-remarkable-digest-triage.md (spec-consistent, NOT a deviation). Update plugins/software-factory/docs/ARCHITECTURE.md §1 row 18 to six deviations (epic-mailbox-isolation needles + adr-epic-mailbox-isolation id) AND append the matching bullet to the §8.11 Accepted deviations list, co-updating BOTH sentinels in plugins/software-factory/test/docs-concerns.test.ts with the same needles in the same diff AND updating the two sentinel test titles from five to six. Do NOT touch README/config/criteria files or any other ARCHITECTURE section. Verify: prompts.test matrix + 15/80 budgets green, docs-concerns green, typecheck + TMPDIR=/tmp full suite green.",
      "kind": "story",
      "milestoneId": "m1-confirm-instructions",
      "prodBudgetHint": 20,
      "slug": "closeup-confirm-instructions",
      "title": "Architect confirms instructions + traceability updates"
    }
  ],
  "assumptions": [
    {
      "assumption": "Baseline is RED on detail casing, contradicting the context-pack 467-pass/typecheck-clean claim: :raw reads verify capital-D Detail in runtime schemas (developer-output.schema.json:68), concerns.ts:74 reads existing?.Detail (capital-D; type error against lowercase StoredConcernArtifact.detail, longest-wins dead), epic-saga-propagate.test.ts:248/307/313/319 read capital-D, schema-detail-normalize.test.ts:234/263 read merged[0]!.Detail (capital-D), and reference-only review.schema.json carries capital-D in BOTH suggestions (:33) and newConcerns (:65) while the generated review-schema.ts already uses lowercase-d for both. Gates go green only after m0 lands. TMPDIR=/tmp still required for the 2 pre-existing head-guard failures.",
      "why": ":raw reads plus closeup-5 are authoritative over rendered/green claims; iteration 5 merged zero items so the red baseline persists. Plan targets red-to-green via m0, with m1 sequenced after m0."
    },
    {
      "assumption": "Behavior is frozen except Detail->detail normalization, two net-zero architect-fragment bullet replacements (+ prompt-render test in prompts.test.ts), completion of 3 existing docs/adr stubs, and the ARCHITECTURE §1 row 18 + §8.11 deviations bullet + both docs-concerns sentinel co-updates. No README/config/prompt-criteria edits; no other ARCHITECTURE sections touched.",
      "why": "Final iteration (6/6): bounding change to verified gaps avoids regressions and sentinel/debloat violations while keeping row+body+ADR traceability consistent."
    },
    {
      "assumption": "Q4/Q8/Q9 resolved accept-only with no code: byte-capped hydration views (triage.ts:151-165,254-286) plus epic-copy truncation are the condense contract (stored detail never rewritten); mode presets and severity thresholds stay conventionally coupled (engine-deriving presets would change config semantics); extra-agent output:review permissive fallback is out of closure scope (default triager/non-triager paths enforce dismiss via generated enum + isTriager gate, tested).",
      "why": "All are accepted-semantics or non-default-setup edges; architect decides, no operator action needed."
    },
    {
      "assumption": "Epic mailbox isolation accepted as the sixth deviation; epic-local digests invisible at root is operator-visible behavior.",
      "disposition": "human-awareness",
      "why": "Operators polling the root mailbox would otherwise miss epic-local human-* entries; architect decides, operator informed, mirroring the four prior awareness items."
    }
  ],
  "techDebt": [
    {
      "category": "impacting",
      "description": "Capital-D Detail in 6 runtime-bound file schemas rejects lowercase detail (reference-only review.schema.json carries capital-D in BOTH suggestions and newConcerns while the generated schema already emits lowercase-d for both); mergeConcern reads existing?.Detail (capital-D) so typecheck fails and longest-wins is dead; epic-saga (:248/:307/:313/:319) and schema-detail-normalize (:234/:263) tests read capital-D, while negative-casing fixtures must keep capital-D to prove rejection.",
      "id": "td-detail-casing",
      "resolution": "Fix in schema-detail-normalize-v4: normalize schemas (both review.schema.json occurrences) + concerns.ts:74 + all stale positive reads verified by :raw (rejection/absence/expect-error fixtures stay capital-D); contract, suggestions-casing, and longest-wins tests verify; full gates green."
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
      "context": "The engine settles close-up proposals only via architect concernConfirms (step-runner.ts:303-316, concerns.ts:282-306), but agents/steps/architect-closeup.md instructs concernResolutions (the proposal field, verified last line) and architect-wave-report.md instructs neither (verified). A proposal the architect never confirms keeps pendingResolution forever, and applyWaveCloseupFallback skips pending concerns (concerns.ts:347), so spec :94 resolve/carry silently stalls in production while engine tests pass. The dismiss path reads ONLY the close-up pending note (concerns.ts:293-300) and the store type drops confirm.note entirely (:283); a noteless accept leaves pending intact by design, and the ingest pre-flight fails the step on noteless dismiss-accepts (step-runner.ts:246-259).",
      "decision": "Dismiss note rule semantics: REJECT noteless dismiss proposals. Fix the fragments with net-zero single-line in-place replacement: rewrite the existing final bullet of architect-closeup.md to a terse concernConfirms accept/reject instruction with the dismiss note rule ('reject dismiss proposals lacking a pending note'), and the existing final bullet of architect-wave-report.md to a concernConfirms instruction scoped to wave-close-up proposals. Both rewritten bullets MUST preserve the Raise-concerns-with-evidence clause and the condense clause so the prompts.test matrix sentinels (/Raise concerns/ on all 19 fragments, /condens/i on triage fragments) keep passing; only Resolutions->Confirms plus the dismiss note rule changes. Zero net added lines; a prompt-render test in prompts.test.ts locks confirms-present in both renders, concernResolutions-absent in BOTH fragments, the dismiss-note-rule phrase in BOTH renders, and pins both fragments' non-empty line counts to baseline so gates enforce net-zero; git diff --numstat must show equal insertions/deletions for the two fragments. architect-resume.md untouched. No engine/schema changes. Complete the existing docs/adr/adr-confirm-field-instructions.md stub with this Decision paragraph.",
      "id": "adr-confirm-field-instructions",
      "title": "Architect fragments instruct concernConfirms"
    },
    {
      "context": "runChildTask accepts rootTaskDir but never reads it; only root runTask polls the root mailbox, while epic children write human-* to their own task dir mailbox ({childWt}/{orch}/{parent}/{epic}). Blocked child questions are forwarded as q-epic-* (epic-propagation.ts:97-129), but epic-local digests stay in the epic mailbox and parent answers are not copied back down. Wiring child-to-root mailbox routing now is a late-stage behavior change with config-semantics blast radius.",
      "decision": "Accept as the sixth documented deviation for closure: the root mailbox is the operator surface; epic-local digest entries are not visible at root; child-to-root routing/answer-sync is future work. Complete the existing docs/adr/adr-epic-mailbox-isolation.md stub with this Decision paragraph; plugins/software-factory/docs/ARCHITECTURE.md §1 row 18 AND the §8.11 Accepted deviations list each gain the sixth-deviation entry, with the row-18 and §8.11-deviations sentinels in plugins/software-factory/test/docs-concerns.test.ts co-updated with the same needles in the same diff (sentinel test titles updated from five to six alongside the needles). Operator notified via human-awareness.",
      "id": "adr-epic-mailbox-isolation",
      "title": "Epic mailbox isolation accepted as deviation"
    },
    {
      "context": "Worker remarkable[] becomes an open rm-* record hydrated to every consumer, but a mailbox digest is written only when a triager emits a suggestion matching the rm-* id with a human-* disposition (triage.ts:98,334-346); architect ADRs route automatically instead. Spec :98 says remarkable items are reported in a digest, never waiting.",
      "decision": "Accept triage-dependency as spec-consistent (NOT a deviation, so §1 row 18 and §8.11 are unchanged by this ADR): spec :96 requires remarkable decisions to get the same aggregation/triage as concerns, so reviewer-triage is the funnel gate, not a bypass. No auto-digest above threshold. Complete the existing docs/adr/adr-remarkable-digest-triage.md stub with this Decision paragraph. Untriaged remarkables (simple tasks) never digest, consistent with adr-funnel-triage-coverage.",
      "id": "adr-remarkable-digest-triage",
      "title": "Worker-remarkable digest requires triager confirmation"
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
