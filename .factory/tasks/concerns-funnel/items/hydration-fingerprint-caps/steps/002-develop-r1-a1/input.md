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
  "slug": "hydration-fingerprint-caps",
  "kind": "dev",
  "title": "Unified hydration, caps, fingerprint",
  "assignment": "Own concerns.ts + triage.ts hydration + step-runner injection + iteration hydration bytes (no prompt fragments, no router, no epic, no ingest/apply). Implement ADR adr-hydration-single-cap + adr-hydrated-sets + adr-fingerprint-affects-union: triage.hydrateStepConcerns(taskDir,{stepRole,inputBytes?,diffBytes?,taskDiffBytes?,consumer}) where callers compute bytes and callee caps+renders. Step-role table: review|qa -> min(diffBytes,2000) with diffBytes=UTF-8 of promptVars.diff; wave-close-up|plan-close-up -> min(taskDiffBytes,2000) with taskDiffBytes=UTF-8 of git diff parentBranch...HEAD in taskWt via production git() with injectable gitFn; plan-review|architect-*|develop-family -> min(inputBytes,500) with inputBytes=sum of promptVars keys present in KNOWN_VARS[fragment] except concernsYaml,humanInvolvementCriteria,debt,steering. Skip rule: step-runner computes only when caller promptVars lack concernsYaml (iteration-supplied wins). '' when cap=0 or hydrated set empty; renderConcernsYaml '' when serialize([]) exceeds cap; standing headings remain, assertions count id lines. Delete hydrateConcernsYaml. buildArchitectHydration drops concerns section (UTF-8 capped); architect turns consume concernsYaml only. Implement triage.listHydratedConcerns(taskDir,consumer): review|develop|qa and plan-review -> open c-* + open rm-*; closeup -> open+routed c-* + open rm-*; architect -> open+routed c-* + open rm-* + dismissed+escalated notes; terse shape + pendingResolution whenever present + rm-* as {id,kind:remarkable,summary:chosen}; countConcerns stays c-* only. Fingerprint identity kind+normalized summary+location; affects merged as sorted-union INCLUDING terminal (status preserved, detail/severity/affects/escalated merge; triage only reopen); aggregate dual-lookup migration: compute new id, if missing scan for legacy same kind+norm summary+location and rename-merge with union affects, no GC. Behavior tests only: iter2+ plan-review <=500B and <input, wave-close-up <=2000B and <taskDiff, open+pending visibility, 0/1/3-byte caps -> '' with zero id lines, affects-union no fork + legacy rename stable id, rm-* hydration shape, dismissed+escalated in architect set. Verify: bun run typecheck + TMPDIR=/tmp bun test. Budget ~250 prod lines.",
  "outlineRef": "hydration-fingerprint-caps",
  "milestone": "m1-hydration-prompts",
  "wave": 1,
  "scenarioRefs": [
    "m1-hydration-prompts:1",
    "m1-hydration-prompts:2",
    "m1-hydration-prompts:3",
    "m1-hydration-prompts:4",
    "m1-hydration-prompts:6",
    "m1-hydration-prompts:7"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/fingerprint.ts:20-50",
    "plugins/software-factory/src/core/artifacts.ts:313-325"
  ]
}

## Target
{
  "selectors": [
    "test/engine/hydration-fingerprint-caps.test.ts"
  ],
  "expectRed": [
    "Hydration caps (adr-hydration-single-cap).caps review hydration at min(diffBytes, 2000) bytes",
    "Hydration caps (adr-hydration-single-cap).caps plan-review hydration at min(inputBytes, 500) bytes",
    "Hydration caps (adr-hydration-single-cap).caps wave-close-up hydration at min(taskDiffBytes, 2000) bytes",
    "Hydration caps (adr-hydration-single-cap).returns empty hydration for zero and tiny caps",
    "Hydration caps (adr-hydration-single-cap).injects review concernsYaml by diff bytes and lets caller-supplied values win",
    "Hydration caps (adr-hydration-single-cap).computes close-up task diff bytes through the injected git function",
    "Hydration caps (adr-hydration-single-cap).hydrates architect turns from concernsYaml without a duplicate concerns section",
    "Hydrated concern sets (adr-hydrated-sets).hydrates open concerns with pending resolutions for review",
    "Hydrated concern sets (adr-hydrated-sets).includes routed concerns for close-ups but not for review",
    "Hydrated concern sets (adr-hydrated-sets).hydrates open remarkables as terse remarkable records",
    "Hydrated concern sets (adr-hydrated-sets).includes dismissed escalated concerns only in the architect set",
    "Concern identity and affects union (adr-fingerprint-affects-union).fingerprints kind, normalized summary, and location without affects",
    "Concern identity and affects union (adr-fingerprint-affects-union).unions affects without forking and preserves terminal status",
    "Concern identity and affects union (adr-fingerprint-affects-union).renames a legacy affects-keyed file to the stable id"
  ]
}

## Context & Citations
[
  "docs/factory.v2.md:89-103",
  "plugins/software-factory/src/core/fingerprint.ts:20-50",
  "plugins/software-factory/src/core/artifacts.ts:313-325"
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
