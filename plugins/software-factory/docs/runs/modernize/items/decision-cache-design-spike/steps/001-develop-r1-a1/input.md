# Step: PoC

## Goal
Implement a confined Proof of Concept (PoC) to validate feasibility, test experimental APIs, or compare technical approaches.

## Rules
- Strict folder isolation: ALL code, scripts, and temporary artifacts MUST be written inside the item's `poc/` folder (`{orchestrationFolder}/{task}/items/{item}/poc/`).
- Zero production changes: production codebase paths (`paths.prod` and `paths.tests`) MUST remain completely untouched.
- Feasibility report: document whether the evaluated approach is viable, what tradeoffs were discovered, and recommendations for permanent implementation.
- Yield status: report `status: ok` with evidence of execution in `evidence` (array of strings) matching `developer-output.schema.json`.
- Fix-round re-entry: when `Review Feedback` below is non-empty, address ONLY the listed concerns with targeted follow-up work; do NOT redo the PoC from scratch.

## Assignment
{
  "slug": "decision-cache-design-spike",
  "kind": "poc",
  "title": "Prototype tracked-cache schema and refresh",
  "assignment": "Prototype on tmp copies only; zero committed files. Validate the ADR-017 pinned contract (do not invent alternative): project-root = config.cwd with traversal guard; schema + array sort (rule, justification, model) + non-hex encoding (no bare hex>=20, detect-secrets clean, collision-safe); prune auto missing/stale; lint --refresh-decisions [--path ...]; CI-fail; DECISIONS_PATH test-only; files union POSIX; --path scoping; jobs==1 required; decisions-module placement (ADR-018); memory/time notes (2048 RLIMIT_AS, 3 pylint loads, ONNX vs torch). Consume test_pylint_cache_semantics.py writer-first verdict. Completeness gate: report {verdict: feasible|blocked}; feasible carries every field above + 4 tmp proofs (heuristic-rejected False without backend; accepted+hit==persisted; accepted+miss+absent==heuristic True; normal-lint zero writes by hash); blocked carries {blocker, evidence, I5 plan} and impls merge no-op attestations citing it. Feeds backend/cache impls.",
  "outlineRef": "decision-cache-design-spike",
  "milestone": "M4",
  "wave": 1,
  "scenarioRefs": [
    "M4: Veto backend without model",
    "M4: Cache read-only plus explicit refresh"
  ],
  "citations": [
    "src/python_setup_lint/checkers/_semantic.py:37-52",
    "src/python_setup_lint/checkers/_semantic.py:125-189",
    "docs/semantic-justification.md:5-14",
    "docs/semantic-justification.md:34-45",
    ".gitignore:243-244"
  ],
  "escalate": true
}

## Context


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
