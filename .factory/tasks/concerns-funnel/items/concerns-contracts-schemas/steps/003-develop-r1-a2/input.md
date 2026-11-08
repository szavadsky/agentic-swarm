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
  "slug": "concerns-contracts-schemas",
  "kind": "dev",
  "title": "Concern producer schemas",
  "assignment": "Schemas only (split 2/3, decision 001; deps: types). Inline (no cross-file $ref) shared concern/remarkable definitions into developer-output, fact-finder-output, qa, poc, test-assumptions, review newConcerns, plan, decisions, wave/plan-closeup (+concernResolutions), architect wave-report/closeup outputs; leave triage/infra/pm-edit untouched. severity/detail optional at schema level (defaults applied at runtime by concerns-store); kind strict enum so unknown kind fails validation with no write. Dismiss detail-required enforced at runtime (store), not JSON. Verify: typecheck + prompts.test preflight + one FakeHarness behavior case in test/engine/concerns-funnel.test.ts (valid concerns pass, unknown kind errors no write). Prod budget <=200 lines JSON. Run TMPDIR=/tmp bun test + typecheck.",
  "outlineRef": "concerns-contracts-schemas",
  "milestone": "m1-contracts-aggregate",
  "wave": 3,
  "deps": [
    "concerns-contracts-types"
  ],
  "scenarioRefs": [
    "m1-contracts-aggregate:s4",
    "m1-contracts-aggregate:s5"
  ],
  "citations": [
    "docs/factory.v2.md:89-103",
    "plugins/software-factory/src/core/artifacts.ts:313-325",
    "plugins/software-factory/src/core/records/review-schema.ts:5-52"
  ]
}

## Target
{
  "selectors": [
    "test/contracts/concern-schemas.test.ts",
    "test/engine/concerns-funnel.test.ts"
  ],
  "expectRed": [
    "test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines the concern definition into every producer schema without external refs",
    "test/contracts/concern-schemas.test.ts::Concern producer schemas::inlines the remarkable decision definition with chosen, alternatives, and why",
    "test/contracts/concern-schemas.test.ts::Concern producer schemas::adds newConcerns to review and QA schemas outside the triage suggestions",
    "test/contracts/concern-schemas.test.ts::Concern producer schemas::adds concernResolutions with resolve, carry, and propagate to close-up schemas",
    "test/engine/concerns-funnel.test.ts::Concern funnel schemas::valid concerns pass validation and unknown kinds reject with no artifact write"
  ]
}

## Context & Citations
[
  "docs/factory.v2.md:89-103",
  "plugins/software-factory/src/core/artifacts.ts:313-325",
  "plugins/software-factory/src/core/records/review-schema.ts:5-52"
]

## Review Feedback
Failing check: target-green

Message: Tests failed: Concern funnel schemas.valid concerns pass validation and unknown kinds reject with no artifact write. Command: cd plugins/software-factory && bun test test/contracts/concern-schemas.test.ts test/engine/concerns-funnel.test.ts --reporter=junit --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794115404368-wtfodunykuq.xml

Detail:
{
  "command": "cd plugins/software-factory && bun test test/contracts/concern-schemas.test.ts test/engine/concerns-funnel.test.ts --reporter=junit --reporter-outfile=/home/slava/aiexp/agentic-swarm.factory-wt/.factory-runtime/tmp/junit-green-1794115404368-wtfodunykuq.xml",
  "junitCaseCount": 6,
  "junitCaseIds": [
    "Concern producer schemas.inlines the concern definition into every producer schema without external refs",
    "Concern producer schemas.inlines the remarkable decision definition with chosen, alternatives, and why",
    "Concern producer schemas.adds newConcerns to review and QA schemas outside the triage suggestions",
    "Concern producer schemas.adds concernResolutions with resolve, carry, and propagate to close-up schemas",
    "Concern producer schemas.leaves triage, infra, and plan-edit schemas untouched",
    "Concern funnel schemas.valid concerns pass validation and unknown kinds reject with no artifact write"
  ],
  "junitTruncated": false,
  "collected": true,
  "collectionErrors": []
}

Output tail:
bun test v1.4.3 (c6da4a4d3)


test/engine/concerns-funnel.test.ts:
126 |   const stdout = res.stdout.replace(/\r?\n$/, "");
127 |   const stderr = res.stderr;
128 |   const code = res.code ?? 0;
129 | 
130 |   if (code !== 0 && !opts?.allowFail) {
131 |     throw new GitError(args.join(" "), code, stderr, stdout);
                ^
GitError: git add -A failed with exit code 128:
fatal: not a git repository (or any of the parent directories): .git

 command: "add -A",
    code: 128,
  stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
  stdout: "",

      at git (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/exec.ts:131:11)
      at async <anonymous> (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/git/commit.ts:23:13)
      at async runExclusive (/home/slava/aiexp/agentic-swarm.factory-wt/topic_concerns-funnel--concerns-contracts-schemas/plugins/software-factory/src/core/mutex.ts:39:20)
(fail) Concern funnel schemas > valid concerns pass validation and unknown kinds reject with no artifact write [172.66ms]

 5 pass
 1 fail
 19 expect() calls
Ran 6 tests across 2 files. [896.00ms]

Budget: 225 prod lines changed vs storyMaxProdLines 300 (kind dev). Shrink the diff or escalate; do not re-verify green checks from scratch.

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
