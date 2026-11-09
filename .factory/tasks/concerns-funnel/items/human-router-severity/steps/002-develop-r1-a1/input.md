# Step: Develop

## Goal
Implement production code changes and supporting tests to satisfy the assignment, make declared targets pass green, and pass all project gates.

## Rules
- Target green: every test selector and case identified in `target` MUST pass cleanly.
- Quality gates: run project gates via `bash`; all gates MUST succeed with exit code 0.
- Sizing budget: keep changes minimal and within the engine-enforced prod-line budget (see agent philosophy). The engine rejects oversized diffs mechanically.
- Tool-call budget: aim to finish within ~60 tool calls. Batch reads, prefer `grep`/`ast_grep` over re-reading files, and stop exploring once you can implement — the engine journals a warning above the threshold.
- Evidence mandatory: yield `status: ok` with non-empty `evidence` (array of strings detailing personal verification) matching `developer-output.schema.json`.

## Assignment
{
  "slug": "human-router-severity",
  "kind": "dev",
  "title": "Human router and severity policy",
  "assignment": "Requires hydration-fingerprint-caps (consumes hydrateStepConcerns/listHydratedConcerns sets). Own triage routeHumanDisposition + ingest gates + derive threading per adr-human-router-single + adr-severity-policy-active + adr-hydrated-sets rm rules. Single routeHumanDisposition in triage for all triagers at ingest: human-async q-concern-<cid> blocks=[item]|[task]; human-stop blocks item+task + exit-10; human-awareness, routed rm-*, dismissed+escalated -> digest via writeQuestion human-awareness blocks=[] (q-concern-/q-escalated-), never blocking/halting; dedup by existence. item-machine raw path skips ALL concern-id human-* (no double-write). Severity: gate key source.agent (never fragment): developer covers develop/poc/test-assumptions/test-first/simple-implement/fix-round, fact-finder covers research, architect covers architect-*; shipped 8-agent allowlist already complete — no entries added, commentary documents fragment->agent mapping. Effective defaults medium/high (code fallback identical). Order: schema validation first, then ingest allowlist skip+journal with step ok. Digest iff severity>=minDigest; blocks iff severity>=minBlocking else downgrade to digest (stop loses exit-10); rm-* exempt. Own derive: collectRoutedBlockers(taskDir,minBlocking) blocks only kind=blocker+routed+severity>=minBlocking; deriveTaskState/withRoutedBlocking thread pipeline.concerns.minBlockingSeverity (fallback high); debt predicate unchanged. Explicit fixture severities keep suite green. Behavior tests: plan/close-up routing, routed architect visible in next architect hydration, dismiss keeps file with dismissReason and no effects, rm digest blocks=[] never halts, async no exit-10 vs blocking stop single q + exit-10, allowlist skip+journal+ok, downgrade + derive unblocked, no double-write, low blocker not blocked but hydrated/digested. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~280 prod lines.",
  "outlineRef": "human-router-severity",
  "milestone": "m3-routing-lifecycle",
  "wave": 2,
  "deps": [
    "hydration-fingerprint-caps"
  ],
  "scenarioRefs": [
    "m3-routing-lifecycle:1",
    "m3-routing-lifecycle:2",
    "m3-routing-lifecycle:3",
    "m3-routing-lifecycle:4",
    "m3-routing-lifecycle:5",
    "m3-routing-lifecycle:6",
    "m3-routing-lifecycle:7"
  ],
  "citations": [
    "plugins/software-factory/src/core/steer.ts:59-88",
    "plugins/software-factory/src/core/derive/task.ts:167-205",
    "plugins/software-factory/src/core/records/review-schema.ts:5-52",
    "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
  ],
  "escalate": true
}

## Target
{
  "selectors": [
    "test/engine/human-router-severity.test.ts"
  ],
  "expectRed": [
    "routes a plan-reviewer human-stop to one concern question that blocks the task",
    "routes a close-up human-async to the task when there is no item context",
    "turns routed remarkable decisions into digest-only entries regardless of disposition",
    "digests a dismissed escalated concern as q-escalated while keeping the dismissal",
    "suppresses human-awareness digests below minDigestSeverity and downgrades stops below minBlockingSeverity",
    "digests a low-severity routed blocker when minDigest is low but never derives it as blocking",
    "collectRoutedBlockers filters routed blockers by minBlockingSeverity, defaulting to high",
    "threads pipeline.concerns.minBlockingSeverity into task derivation with a high fallback",
    "skips concerns from non-allowlisted agents, journals the skip, and keeps the step ok",
    "halts with exit 10 for a high-severity human-stop concern, writing one q-concern entry",
    "downgrades a medium-severity human-stop concern to a digest and finishes unblocked"
  ]
}

## Context & Citations
[
  "plugins/software-factory/src/core/steer.ts:59-88",
  "plugins/software-factory/src/core/derive/task.ts:167-205",
  "plugins/software-factory/src/core/records/review-schema.ts:5-52",
  "plugins/software-factory/src/core/flows/item-machine.ts:628-647"
]

## Review Feedback

## Output

Yield a structured JSON object matching this schema:
- status (string, required, enum: ["ok","blocked","failed"]): Step execution status (ok, blocked, failed)
- summary (string, required): Concise summary of implementation actions and test results
- target (object, optional): Target test selectors, gate, or custom command for red/green verification
  - Option 1:
    - selectors (array of string, required)
    - expectRed (array of string, required, minItems: 1)
  - Option 2:
    - gate (string, required)
  - Option 3:
    - command (string, required)
    - customTarget (boolean, required)
- evidence (array of string, optional): List of executed checks and verification commands proving correctness
- concerns (array of string, optional): Observations, technical debt, or potential risks identified during implementation
- notes (string, optional): Optional developer notes, implementation observations, or comments
