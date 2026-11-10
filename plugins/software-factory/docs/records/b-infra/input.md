# Step: Infra

## Goal
Discover project infrastructure, worktree bootstrap commands, test runner configuration, and quality gates.

## Rules
- Read-only on repository files: Do NOT edit or write code files.
- Validate commands: Probe candidate commands with `bash`. If gates fail or are red on a clean checkout, record them as they are — the engine records baseline gate status and ratchets against regressions; do NOT hunt for workarounds or search outside the repository.
- Orchestration-folder lint noise: when a gate's failures come from `{orchestrationFolder}` files (`.factory/**` or configured orchestration folder, such as `input.md`, `INTENT.md`, or harness records), declare the gate command with the tool's exclude option if one exists (e.g. `--exclude .factory`). If no exclude option exists for the tool, declare the gate as-is and report it in `notes: string[]` as an operator action.
- Gate mutation rule: quality gates MUST NOT mutate the worktree. Always declare check-only flags (e.g. `ruff format --check` instead of `ruff format`).
- Sizing: Setup commands should be minimal (≤3, empty `[]` if standard checkout works).
- Containment: Work ONLY inside `cwd`. Never search outside the repository root.
- Yield structured output matching `infra.schema.json`.

## Output Fields Specification
- `setup`: Minimal shell commands to prepare a fresh worktree (e.g. `["npm install"]` or `[]`).
- `gates`: Array of `{ "id": "...", "command": "..." }` for project checks (typecheck, lint, tests). Record existing gates as defined in the repository, even if currently failing on clean checkout.
- `testRunner.command`: Base test command, e.g. `"pytest"` or `"bun test"`.
- `testRunner.selectorArgs`: Flags to specify targeted test names/selectors, e.g. `["-k"]` for pytest, `["-t"]` for jest, or `[]` if positional.
- `testRunner.junitArg`: Argument format for writing JUnit XML report, e.g. `"--junitxml={path}"` for pytest. The engine replaces `{path}` with the temporary JUnit report path.
- `notes`: Optional array of strings detailing operator actions or configuration suggestions (e.g. advising to exclude the orchestration folder from project linters/formatters).
## Task
concerns-funnel

## Intent
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
{
  "citations": [
    {
      "file": "docs/factory.v2.md",
      "lines": "89-103",
      "anchors": [
        "18. concerns + remarkable decisions funnel",
        "concerns[]",
        "human-involvement modes",
        "funnel: worker agents"
      ],
      "summary": "Acceptance definition: structured concerns[] with kind/severity/affects, engine aggregation with fingerprint ids/dedup/status/source record, reviewer triage plus dismiss, routing (blocker→dependent item + architect consult, architect→next turn, human-*→mailbox, debt→plan), close-up/status counts, configurable dispositions, remarkable decisions/ADRs, funnel and autonomous/principal/detailed presets."
    },
    {
      "file": "plugins/software-factory/docs/ARCHITECTURE.md",
      "lines": "39",
      "anchors": [
        "18 concerns + remarkable decisions funnel",
        "Deliberately not hand-built",
        "review dispositions (§8.7)"
      ],
      "summary": "The §1 row that must be updated: item 18 currently marked deliberately unimplemented, with only review dispositions (§8.7) and steering mailbox (§8.8) in place."
    },
    {
      "file": "plugins/software-factory/src/core/artifacts.ts",
      "lines": "313-325",
      "anchors": [
        "DeveloperOutputArtifact",
        "concerns?: string[]"
      ],
      "summary": "Current developer output carries only free-form string concerns; needs the structured concern object (kind, summary, detail, location, severity, affects) plus remarkable decisions/ADR fields."
    },
    {
      "file": "plugins/software-factory/src/core/records/review-schema.ts",
      "lines": "5-52",
      "anchors": [
        "generateReviewSchema",
        "allowedDispositions",
        "enum: dispositions"
      ],
      "summary": "Review JSON schema is generated from the agent's allowed disposition enum; triage-by-reviewer needs the vocabulary extended with `dismiss` and the allowed set filtered per reviewer/agent."
    },
    {
      "file": "plugins/software-factory/src/core/flows/item-machine.ts",
      "lines": "628-647",
      "anchors": [
        "reviewAllowed",
        "formatDispositionsSection",
        "dispositionsCriteria"
      ],
      "summary": "Per-item review prompt wiring and allowed-disposition resolution; the natural insertion point for the step reviewer's concern triage and its disposition vocabulary."
    },
    {
      "file": "plugins/software-factory/src/core/flows/iteration.ts",
      "lines": "439-485",
      "anchors": [
        "plan-reviewer",
        "ReviewArtifact",
        "fixSuggestions"
      ],
      "summary": "Plan review flow where architect output is reviewed by plan-reviewer; item 18 requires architect concerns/decisions to be triaged here rather than by the workhorse reviewer."
    },
    {
      "file": "plugins/software-factory/src/core/steer.ts",
      "lines": "59-88",
      "anchors": [
        "writeQuestion",
        "sha256",
        "q-${cleanRef}-${hash}"
      ],
      "summary": "Existing stable-id mailbox write pattern (fingerprint-derived id, ref/disposition, blocks, status) to reuse for concern routing to human-* and for the mailbox digest."
    },
    {
      "file": "plugins/software-factory/src/core/derive/task.ts",
      "lines": "167-205",
      "anchors": [
        "Tech debt collection",
        "accept-with-debt",
        "disposition === \"optional\""
      ],
      "summary": "Debt is currently derived from plan techDebt, accept-with-debt decisions and optional review suggestions; routed tech-debt concerns and concern counts must be added to this derived state."
    },
    {
      "file": "plugins/software-factory/src/cli/status.ts",
      "lines": "83-105",
      "anchors": [
        "openSteerQuestions",
        "Recorded Technical Debt"
      ],
      "summary": "factory status currently surfaces open operator questions and debt; it must additionally show open/routed/resolved concern counts and remarkable-item digests."
    },
    {
      "file": "plugins/software-factory/src/core/fingerprint.ts",
      "lines": "20-50",
      "anchors": [
        "fingerprintText",
        "fingerprintObject",
        "canonicalJsonStringify"
      ],
      "summary": "Existing normalization/fingerprint helpers usable for stable concern ids and dedup across steps/attempts/restarts."
    }
  ]
}

## Output

Yield a structured JSON object matching this schema:
- setup (array of string, required): Minimal setup shell commands (at most 1-3) executed to prepare a fresh worktree, e.g. ['poetry install'] or ['bun install']. Empty array [] if standard checkout requires no setup.
- gates (array of object, required): Repository quality gates (compile, typecheck, lint, fast tests) defined by the project. If any gate fails on clean checkout, record it as is — the engine records baseline status.
  - id (string, required): Gate identifier (e.g. 'typecheck', 'lint', 'test', 'build')
  - command (string, required): Shell command to run for this gate, e.g. 'ruff check .', 'pytest', 'tsc --noEmit'
- testRunner (object, required): Project test runner configuration for automated red/green checking and JUnit XML reporting
  - command (string, required): Base test runner shell command, e.g. 'pytest', 'cargo test', 'bun test', 'npm test'
  - selectorArgs (array of string, optional): Arguments/flags to pass test selectors to the runner. E.g. ['-k'] for pytest, ['-t'] for jest, or [] if selectors are positional arguments.
  - junitArg (string, optional): Flag/argument template to output JUnit XML report, with '{path}' or '{{path}}' placeholder for the file path. E.g. '--junitxml={path}' for pytest, '--reporter=junit --output={path}', or '' if unsupported.
- notes (array of string, optional): Optional notes or operator actions (e.g. advising to exclude the orchestration folder from project linters)
