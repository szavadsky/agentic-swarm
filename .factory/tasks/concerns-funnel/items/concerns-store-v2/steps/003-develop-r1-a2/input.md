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
  "slug": "concerns-store-v2",
  "kind": "dev",
  "title": "Concerns store with merge and commit",
  "assignment": "Implement src/core/concerns.ts: concernFingerprint over {kind,normalizedSummary,location,sortedAffects} excluding detail/severity, aggregateConcerns with merge (longer/latest detail, max severity, updatedAt/lastSeen advance) + source.escalated on severity rise without reopening, listOpenConcerns, applyConcernTriage exact-id + isTriager gate, applyCloseupResolutions, partitionSuggestions. Atomic YAML + KeyedMutex(taskDir) for RMW only + immediate taskWt commitAll; NEVER wrap commitAll in repo.writeLock.runExclusive. Explicit taskWt path, one file per fingerprint, concerns/** startup recovery + reconcileConcerns from committed records (derive read-only), ingest errors must not change step status. Wire all producer seams incl consult writeArtifact; reviewer aggregates new then triages pre-existing only. Spike-saga-commit findings authoritative, do not re-run. Tests in test/engine/concerns-funnel.test.ts. Verify: bun run typecheck + TMPDIR=/tmp bun test.",
  "outlineRef": "concerns-store-v2",
  "milestone": "m1-contracts-aggregate",
  "wave": 6,
  "deps": [
    "concerns-contracts-policy",
    "concerns-contracts-schemas",
    "concerns-contracts-types"
  ]
}

## Target
{
  "selectors": [
    "test/engine/concerns-funnel.test.ts"
  ],
  "expectRed": [
    "test/engine/concerns-funnel.test.ts::Concern store.fingerprints concern identity, ignoring detail, severity, and affect order",
    "test/engine/concerns-funnel.test.ts::Concern store.aggregates a developer concern to one open taskWt file with defaults, source, and immediate commit",
    "test/engine/concerns-funnel.test.ts::Concern store.merges re-emitted concerns into one file with longer detail, max severity, and advanced timestamps",
    "test/engine/concerns-funnel.test.ts::Concern store.keeps dismissed status and flags escalation when a higher severity is re-emitted",
    "test/engine/concerns-funnel.test.ts::Concern store.lists only open concerns in stable order",
    "test/engine/concerns-funnel.test.ts::Concern store.triages only exact-id suggestions and persists dismiss reasons",
    "test/engine/concerns-funnel.test.ts::Concern store.routes non-dismiss triage dispositions and gates non-triagers",
    "test/engine/concerns-funnel.test.ts::Concern store.rejects dismiss triage without detail and leaves the concern unchanged",
    "test/engine/concerns-funnel.test.ts::Concern store.partitions suggestions by exact concern id",
    "test/engine/concerns-funnel.test.ts::Concern store.records close-up pending resolutions without changing concern status",
    "test/engine/concerns-funnel.test.ts::Concern store.aggregates remarkable decisions into rm-* files and triages them by exact id",
    "test/engine/concerns-funnel.test.ts::Concern store.rejects unknown concern kinds without partial writes and leaves existing files untouched",
    "test/engine/concerns-funnel.test.ts::Concern store.writes distinct fingerprints concurrently without deadlock or lost commits",
    "test/engine/concerns-funnel.test.ts::Concern store.serializes concurrent merges of the same fingerprint into one merged file",
    "test/engine/concerns-funnel.test.ts::Concern store.wires reviewer output: aggregate new concerns before triaging pre-existing ids only",
    "test/engine/concerns-funnel.test.ts::Concern store.wires consult writeArtifact producers to the concern store",
    "test/engine/concerns-funnel.test.ts::Concern store.wires close-up producers: aggregates concerns and applies resolutions",
    "test/engine/concerns-funnel.test.ts::Concern store.aggregates concerns and remarkable decisions across producer schemas",
    "test/engine/concerns-funnel.test.ts::Concern store.reconciles missing concerns from committed step records idempotently",
    "test/engine/concerns-funnel.test.ts::Concern store.commits stray concerns files during startup recovery instead of stashing them",
    "test/engine/concerns-funnel.test.ts::Concern store.keeps step status ok and journals an ingest error when concern ingestion fails"
  ]
}

## Context & Citations
[]

## Review Feedback
Failing check: size

Message: Production changes (556 lines) exceeded limit (300 lines) for kind dev

Detail:
{
  "changedLines": {
    "added": 547,
    "deleted": 9,
    "total": 556,
    "files": [
      "plugins/software-factory/src/core/artifacts.ts",
      "plugins/software-factory/src/core/concerns.ts",
      "plugins/software-factory/src/core/engine.ts",
      "plugins/software-factory/src/core/flows/step-runner.ts",
      "plugins/software-factory/src/core/git/repair.ts"
    ]
  },
  "limit": 300
}

Budget: 556 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.

Fix-or-escalate: address the failing check above directly. If the failure is unsatisfiable or the budget cannot be met, yield status failed/blocked with evidence instead of burning another attempt.

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
