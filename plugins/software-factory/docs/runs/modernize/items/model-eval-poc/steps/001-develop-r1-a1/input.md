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
  "slug": "model-eval-poc",
  "kind": "poc",
  "title": "CPU accuracy/latency evaluation over all candidates",
  "assignment": "GOAL: CPU accuracy and latency evaluation over all matrix candidates to recommend smallest compliant model or no-go (U1). No committed code; report only; temp venv and copy permitted, network inside spike only. CONTRACT: decide(justification,rule,context) to float P meaningful in 0-1; mapping justification equals primary equals (comment or text).strip, rule equals joined suppressed codes (current rule symbol where codes unavailable, recorded), context equals code_context None allowed; decision equals prob at or above threshold. Modes: veto final equals heuristic(text) AND prob at or above threshold (model only flips True to False; heuristic-False never reaches model); replace final equals prob at or above threshold, heuristic deleted. Smallest equals lexicographic params, weights bytes, CPU RSS, p50 latency. Corpus: threshold 30 plus 50 plus brush-off and meaningful tables plus N real repo suppressions, DEDUPED by normalized justification target at least 100 post-dedup, stratified heuristic-rejected easy vs heuristic-accepted model-decides; rubric specific technical justification vs placeholder, deferral, brush-off; per-source plus per-stratum breakdown. STEPS: Score ALL matrix candidates (GLiDE, decider-nano, bekko-17m, ettin-150m, MiniLM) at 0.5,0.6,0.7 in BOTH modes or record explicit exclusion: accuracy, meaningless-precision, meaningful-recall, CPU p50,p95 plus RSS. Compliance bars at least 90 percent acc, 95 percent meaningless-precision, 85 percent meaningful-recall apply to heuristic-accepted stratum (overall also reported). Recommend smallest compliant model plus prompt plus threshold plus mode, or no-go with evidence. CONSTRAINTS: poc kind confined to item poc folder and temp only, production paths untouched.",
  "outlineRef": "model-eval-poc",
  "milestone": "M3",
  "wave": 2,
  "deps": [
    "model-candidate-matrix"
  ],
  "scenarioRefs": [
    "M3-1"
  ],
  "citations": [
    "src/python_setup_lint/checkers/_semantic.py:125-189",
    "src/python_setup_lint/checkers/_base.py:142-158",
    "tests/checkers/test_semantic_check.py:159-257",
    "tests/checkers/test_semantic_check.py:263-424",
    "tests/checkers/test_semantic_threshold.py:19-25",
    "docs/semantic-justification.md:56-62"
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
