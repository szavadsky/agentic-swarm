/** The prompt-variable descriptors, one entry per template variable. */

import { DECIDER_PAGE } from "./data-decider.js";
import { FRAGMENT_PROMPT_VARIABLES } from "./data-fragments.js";
import { INFRA_PROMPT_VARIABLES } from "./data-infra.js";
import { PLAN_CHECKER_PAGE } from "./data-plan-checker.js";
import { REPAIR_PROMPT_VARIABLES } from "./data-repair.js";
import { REVIEWER_PROMPT_PAGES } from "./data-reviewer.js";
import type { PromptVariablesPage } from "./types.js";

/** The acceptance variables both QA prompts read: the code QA and browser QA. */
const QA_VARIABLES: Record<string, string> = {
  task_path: "path to the task file whose done-when this turn accepts",
  worktree: "path to the task worktree holding the gated tree",
  base_hash:
    "commit hash before this task's first turn; the range spans every round",
  head_hash: "commit hash after the latest turn",
  round: "1-based call of this QA step's own change-request budget",
  max_rounds:
    "this QA step's total acceptance calls: its change-request bound plus the last call",
  last_call:
    "`true` when this QA turn is the step's last call: `qa.verdict changes` is refused",
  base_gates:
    "the base tree's recorded gate result: commit plus `green`, the pre-existing failing checks, or `not recorded`",
  checks_result:
    "latest checks record's failing-check text, or `pass` when green; `no checks run` without a checks record",
  checks_tree: "the checked tree's hash; `unknown` without a checks record",
  checks_log:
    "the checks record's directory; `unknown` without a checks record",
  gate_commands:
    "configured compile/lint/test commands as `- id: command` lines; `none` when empty",
  prior_findings:
    "the last acceptance's findings (QA or review), numbered; empty before the first acceptance",
  fix_dispositions:
    "the current fix round's summary plus one numbered reply per prior finding; round 1 carries the cleanliness revision turn's summary/replies and is otherwise empty; renderer default",
  outcome_path:
    "path where the outcome file must be written when the harness asks for a file",
  validate_cmd:
    "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
  outcome_schema:
    "outcome examples narrowed to the base fields and `qa`; supplied by the turn",
};

/** One page per prompt template; the renderer emits them in this order. */
export const PROMPT_VARIABLES: readonly PromptVariablesPage[] = [
  {
    file: "architect.md",
    prompt: "architect",
    variables: {
      turn: "`first` on a new goal's first turn; `relaunch` on the first turn of a relaunch of the same goal; `boundary` otherwise",
      iteration: "1-based iteration number of this launch",
      intent_path: "path to the goal's `intent.md`",
      plan_path: "path to the goal's own markdown plan; the file to edit",
      checkout: "path to the stable goal checkout (integration worktree)",
      pack_path:
        "path to the iteration context pack (index: status, short hashes, per-task rounds, infra, code facts, paths)",
      digest_path:
        "path to the previous launch's digest; empty string on a first launch",
      steers:
        "formatted pending steers: id, first line, file path; `none` when empty",
      outcome_path:
        "path where the outcome file must be written when the harness asks for a file",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome examples from the kernel schema; renderer default",
      task_types:
        "configured task types with their flow, kind, output schema, nogit/promote flags and use-when; renderer default",
      tiers: "run-config alias names; renderer default",
      depth:
        "`2` renders the architect register; `1` (renderer default) leaves it out",
      subarchitect_block:
        "the rendered launch block naming each live subarchitect with its agent id and spawn name; empty when the harness cannot steer or no epic has a plan to review",
      saga_reminder:
        "the rendered consider-a-saga block, naming the goal's task count and the configured `sagaTaskCount`; empty at or below the threshold and when none is configured",
    },
  },
  {
    file: "architect-subarchitects.md",
    prompt: "architect-subarchitects",
    intro: "Architect's steered-subarchitect block; omp text conditional.",
    variables: {
      subarchitects:
        "one row per epic: the epic id, the agent id `subarchitect`, and the exact spawn name the script steers",
      subagents: "the architect harness's `Caps.subagents`; `none` by default",
    },
  },
  {
    file: "subarchitect-agent.md",
    prompt: "subarchitect-agent",
    intro: "Transient subarchitect definition; omp tool text is conditional.",
    note: "The file opens with the agent's YAML frontmatter, so `biome.json` excludes it from markdown formatting: the formatter would re-indent the definition.",
    variables: {
      subagents: "`Caps.subagents`; `steer` renders the omp tool text",
    },
  },
  {
    file: "subarchitect.md",
    prompt: "subarchitect",
    intro:
      "One epic's architect, below the top architect: the same bounds, turn order, plan format, granularity, debt and stop rules, plus its epic scope and the upward brief. It edits only its own epic plan and reports `done` for the epic, never for the goal.",
    variables: {
      turn: "`first` on this epic's first turn; `relaunch` on the first turn of a relaunch; `boundary` otherwise",
      pass: "`report` on the bottom-up pass before the top's turn; `direction` on the top-down consult after it",
      iteration: "1-based iteration number of this launch",
      epic: "the epic name from the parent's register, `[a-z0-9-]+`",
      intent_path: "path to the goal's `intent.md`",
      plan_path:
        "path to this epic's plan, `epics/<epic>.md`; the only plan the subarchitect edits",
      parent_plan_path:
        "path to the top architect's `plan.md`; read-only to the subarchitect",
      checkout: "path to the stable goal checkout (integration worktree)",
      pack_path: "path to this epic's context pack",
      digest_path:
        "path to the previous launch's digest; empty string when this launch has none",
      outcome_path:
        "path where the outcome file must be written when the harness asks for a file",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome examples from the kernel schema; renderer default",
      task_types:
        "configured task types with their flow, kind, output schema, nogit/promote flags and use-when; renderer default",
      tiers: "run-config alias names; renderer default",
    },
  },
  {
    file: "front.md",
    prompt: "front",
    variables: {
      iteration: "1-based iteration number of this launch",
      intent_path: "path to the goal's `intent.md`",
      plan_path: "path to the goal's own markdown plan; may not exist yet",
      tasks_dir: "directory where the one task file is written, `<slug>.md`",
      class_path:
        "path to `class.yaml`: `{ class: trivial|task|bigger, slug? }` beside the plan",
      pack_path:
        "path to the iteration context pack the front writes: the architect's input on `bigger`, the implementer's briefing on `trivial`/`task`",
      checkout: "path to the stable goal checkout the front reads",
      setup_command: "repository setup command; `none` when not needed",
      gate_commands:
        "configured gate commands as `- id: command` lines; `none` when empty",
      outcome_path:
        "path where the outcome file must be written when the harness asks for a file",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome examples from the kernel schema; renderer default",
      task_frontmatter:
        "frontmatter YAML skeleton from the kernel schema; renderer default",
      task_types:
        "configured task types with their flow, kind, output schema, nogit/promote flags and use-when; renderer default",
      tiers: "run-config alias names; renderer default",
      class_types:
        "the configured development types each front class may write, rendered by the front turn",
      code_map_path:
        "path of the code map a `when: [bigger]` scout step wrote; `none` when no scout ran",
    },
  },
  {
    file: "intent.md",
    prompt: "intent",
    variables: {
      iteration:
        "1-based iteration number of the consult that carries the steer",
      intent_path:
        "path to the goal's `intent.md`, the only file the turn may edit",
      steer:
        "the pending steer as `- <id> (<relPath>):` plus its full indented text",
      outcome_path:
        "path where the outcome file must be written when the harness asks for a file",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome examples from the kernel schema; renderer default",
    },
    note: "The turn's record carries the unified diff of the edit; the next architect pack renders it beside the pending steer.",
  },
  {
    file: "pm.md",
    prompt: "pm",
    variables: {
      iteration: "1-based iteration number of this launch",
      epic: "the epic this PM derives for; empty for the top PM",
      epic_scoped: "`true` for an epic's PM, `false` for the top",
      intent_path: "path to the goal's `intent.md`, for resolving wording only",
      plans:
        "the plan this PM owns, one `- goal: <path>` for the top PM or ``- epic `<epic>`: <path>`` for that epic's PM; derive every bullet from the plan that carries it; read-only to the PM",
      plan_diff:
        "diff of the plan keyed by task slug against the previous derived plan (`none` on the first iteration or when the previous plan is missing)",
      tasks_dir:
        "directory where task files are written, one `<slug>.md` per task",
      existing_tasks:
        "existing task files as `- slug | status | hash | deps: a,b` lines (`none` when empty); merged/finished lines end `frozen (read-only)`, cancelled `read-only (spent)`, steer tasks `steer <id>`, stall continuations `stall <n>`, plan-check follow-ups `plan-check <n>`",
      repair:
        "the script validator's findings from the previous ask; empty string on the first ask and on steer turns",
      steers:
        "pending steers as `- id (file):` plus indented full text; `none` on a derive, stall or plan-check turn",
      stalls:
        "this iteration's undecided parks as one entry per slug (cause, record paths, kept branch, spent turns, amends used of the limit, the cause's default action, done-when); `none` except on a stall turn",
      concerns: "open concerns no wave-end turn has marked yet, one per line",
      plan_checks:
        "checker follow-ups as one entry per slug (kind, reason, cause, record paths, kept branch, spent turns, amends used of the limit, the cause's default action, done-when); `none` except on a plan-check turn",
      holds_dir: "directory for one `<id>.yaml` hold per steer or concern",
      outcome_path:
        "path where the outcome file must be written when the harness asks for a file",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome examples from the kernel schema; renderer default",
      task_frontmatter:
        "frontmatter YAML skeleton from the kernel schema; renderer default",
      task_types:
        "configured task types with their flow, kind, output schema, nogit/promote flags and use-when; renderer default",
      tiers: "run-config alias names; renderer default",
    },
  },
  {
    file: "implementer.md",
    prompt: "implementer",
    variables: {
      task_path: "path to this task's file: frontmatter plus brief",
      cleanliness_revision:
        "`true` when this turn is a cleanliness revision turn; selects `cleanliness-revision`",
      front_pack:
        "path to the front's context pack for a front-classified trivial or task goal; empty string when no front classified this task",
      worktree: "path to the task worktree to edit",
      resume_note:
        "follow-up notice for a relaunched or trivial turn: the task branch and the resume fragment; empty string on a de-novo turn",
      report_path:
        "repo-relative path a spike commits its finding to (`.factory/spikes/<slug>.md`); empty on a development task and on a `nogit` task, whose product lives outside git; when set, it also opens the prompt with the commit-first sentence",
      env_notes:
        "the task file's environment notes as `- ` bullet lines (infra facts, known flakes, workarounds); empty string when the task has none",
      setup_command:
        "worktree bootstrap command (dependencies etc.); `none` when not needed",
      gate_commands:
        "configured compile/lint/test commands as `- id: command` lines; `none` when empty",
      base_gates:
        "the base tree's recorded gate result: commit plus `green`, or the pre-existing failing checks; `not recorded` when pre-flight has no trustworthy base run",
      findings:
        "previous acceptance round's summary and findings for this task (QA or review), plus any legacy forward lines (summary first); gate failures when the latest record is red checks; empty string before the first acceptance. Each numbered finding is answered by a change, a reply or both",
      outcome_path:
        "path where the outcome file must be written when the harness asks for a file",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome examples from the kernel schema; renderer default",
    },
  },
  {
    file: "cleanliness-revision.md",
    intro:
      "The cleanliness revision follow-up instruction (fix or justify), included by `implementer.md` on a cleanliness revision turn. It contains no turn variables.",
    variables: {},
  },
  {
    file: "qa.md",
    prompt: "qa",
    intro:
      "The QA step's acceptance prompt: the implementer's Work, Bounds and Code standard, then the acceptance focus, its own `qa` verdict, and the checks handoff. QA sends actionable findings back to the author or accepts the work; its own test and script edits are gated again before review.",
    variables: QA_VARIABLES,
  },
  {
    file: "browser-qa.md",
    prompt: "browser-qa",
    intro:
      "The browser-test acceptance prompt: the QA body plus one browser-surface turn before the code QA, with the same `qa` verdict and the same checks handoff.",
    variables: QA_VARIABLES,
  },
  DECIDER_PAGE,
  ...REVIEWER_PROMPT_PAGES,
  {
    file: "adjudicator.md",
    prompt: "adjudicator",
    intro:
      "The review-adjudication prompt: a step after a review re-judges that review's `changes` findings and may discard them. Its outcome is the review the implementer sees, so an omitted finding never travels.",
    variables: {
      task_path: "path to the task file the diff is judged against",
      base_hash: "commit hash before this task's first turn",
      head_hash: "commit hash after the latest turn",
      round: "1-based review round whose findings are adjudicated",
      findings:
        "the reviewed review's summary, concerns and forward lines; the only findings judged",
      base_gates: "the base tree's recorded gate result",
      worktree: "path to the task worktree holding the reviewed tree",
      checks_result:
        "latest checks text, or `pass` when green (renderer default)",
      checks_tree: "the checked tree's hash (renderer default)",
      checks_log: "the checks record's directory (renderer default)",
      outcome_path: "path for the outcome file the harness asks for",
      validate_cmd:
        "absolute validate command for this launch; renderer default",
      outcome_schema: "outcome examples; renderer default",
    },
  },
  {
    file: "review-architect.md",
    prompt: "review-architect",
    intro:
      "The plan-review prompt the architecture flow renders on each reviewer alias. It composes the architect's assignment and whole body from fragments, adds the review focus, and delivers `planReview` findings (`technical`, `planNotes`) with no verdict. It never edits the plan.",
    variables: {
      iteration: "1-based iteration number of this launch",
      intent_path: "path to the goal's `intent.md`",
      plan_path:
        "path to the goal plan under review; read-only to the reviewer",
      pack_path:
        "path to the iteration context pack the architect planned from",
      worktree: "goal checkout; the reviewer reads the repo from it",
      outcome_path:
        "path where the outcome file must be written when the harness asks for a file",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome examples narrowed to `status`, `summary`, `concerns`, `steerAnswers`, `debtClosed` and `planReview`; supplied by the turn",
      task_types:
        "configured task types with their flow, kind, output schema, nogit/promote flags and use-when, read by the included plan standard; renderer default",
      tiers:
        "run-config alias names, read by the included architect scope; renderer default",
    },
  },
  {
    file: "architect-review-return.md",
    prompt: "architect-review-return",
    intro:
      "The architect's one turn on the plan review's technical findings, before the PM derives tasks. It edits the plan, marks every finding in `planReviewMarks`, and takes no goal decision and no verdict.",
    variables: {
      iteration: "1-based iteration number of this launch",
      intent_path: "path to the goal's `intent.md`",
      plan_path: "path to the plan; edited in place",
      pack_path: "path to the iteration context pack",
      reviewers: "the reviewer aliases that delivered the findings",
      technical_findings: "numbered technical findings, `1..N`, or `none`",
      plan_notes:
        "numbered plan notes, after the technical findings, or `none`",
      finding_count:
        "total findings; every number `1..finding_count` must appear once in `planReviewMarks`",
      outcome_path:
        "path where the outcome file must be written when the harness asks for a file",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome examples narrowed to the base fields and `planReviewMarks`; supplied by the turn",
    },
  },
  {
    file: "digest.md",
    prompt: "digest",
    variables: {
      launch_id: "identifier of the previous launch being summarised",
      goal_dir: "path to the goal directory (records, mailbox, iterations)",
      records_dir:
        "path to the append-only step records, scoped to the named launch",
      transcripts_dir: "path to the session transcripts outside the repo",
      digest_path:
        "path where the digest must be written; the script has already written the cost-and-turn table there",
      outcome_path:
        "path where the outcome file must be written when the harness asks for a file",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome examples from the kernel schema; renderer default",
    },
    note: "The digest scout appends loops, failures and interventions; it does not restate the script table.",
  },
  {
    file: "steward.md",
    prompt: "steward",
    variables: {
      worktree: "path to the task worktree holding the conflicted merge",
      branch: "task branch the integration head merges into",
      integration_head: "integration head sha the branch must absorb",
      conflicts:
        "conflicted files, comma-separated; `none` when the merge needs no resolution",
      gate_log_path:
        "path to the gate log of the red this branch must repair (the goal head's run when the head is red, else the branch's red merged result); `none` when the merge needs no gate repair",
      gate_commands:
        "configured gate commands as `- id: command` lines; `none` when empty",
      base_gates:
        "the base tree's recorded gate result: commit plus `green`, the pre-existing failing checks, or `not recorded`",
      outcome_path:
        "path where the outcome file must be written when the harness asks for a file",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome examples from the kernel schema; renderer default",
    },
    note: "The flow's `resolve` step renders this same prompt with the same variables: the wave-end steward and the in-flow resolve turn own one conflict ask.",
  },
  PLAN_CHECKER_PAGE,
  {
    file: "pack-preparer.md",
    prompt: "pack-preparer",
    variables: {
      iteration: "1-based iteration number of this launch",
      context_data_path:
        "the script's full derived status for this iteration as JSON; the preparer reads it and returns the sections to brief",
      intent_path: "path to the goal's `intent.md`; a pointer, never pasted",
      plan_path: "path to the current plan; a pointer, never pasted",
      checkout: "path to the stable goal checkout (integration worktree)",
      outcome_path:
        "path where the outcome file must be written when the harness asks for a file",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome examples from the kernel schema plus this turn's `packBriefs`; the turn supplies it",
    },
  },
  {
    file: "scout.md",
    prompt: "scout",
    variables: {
      iteration: "1-based iteration number of this launch",
      intent_path: "path to the goal's `intent.md`; the map's subject",
      checkout:
        "path to the stable goal checkout (integration worktree) being mapped",
      code_map_path:
        "path of the code map to write, with one entry per directory; the one artifact the turn authors (the outcome file is the other)",
      outcome_path:
        "path where the outcome file must be written when the harness asks for a file",
      validate_cmd:
        "absolute `bun <build>/bin/factory.ts validate` for this launch; renderer default",
      outcome_schema:
        "outcome examples from the kernel schema; renderer default",
    },
  },
  INFRA_PROMPT_VARIABLES,
  ...REPAIR_PROMPT_VARIABLES,
  ...FRAGMENT_PROMPT_VARIABLES,
];
