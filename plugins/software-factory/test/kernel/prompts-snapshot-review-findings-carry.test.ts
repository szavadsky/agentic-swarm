import { describe, expect, it } from "bun:test";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { packageRoot } from "../../src/kernel/config.js";
import { promptVars } from "../../src/kernel/flow-context.js";
import {
  taskFrontmatterVar,
  tierNamesVar,
} from "../../src/kernel/prompt-schema.js";
import { outcomeExampleVar } from "../../src/kernel/outcome-example.js";
import { packPreparerOutcomeSchemaVar } from "../../src/kernel/pack-prep.js";
import { qaOutcomeSchema } from "../../src/kernel/qa.js";
import { loadPromptLibrary } from "../../src/kernel/prompts.js";
import { rec, task, TEST_CLASS_TYPES, TEST_TASK_TYPES_VAR } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
} from "./s2-helpers.js";

const OUTCOME_SCHEMA = outcomeExampleVar("implementer", "any");

const BASE_SCHEMA = outcomeExampleVar("front", "any");

const ARCHITECT_SCHEMA = outcomeExampleVar("architect", "architect");

const SUBARCHITECT_SCHEMA = outcomeExampleVar("subarchitect", "architect");

const PM_SCHEMA = outcomeExampleVar("pm", "any");

const QA_SCHEMA = outcomeExampleVar("qa", "qa", qaOutcomeSchema);

const REVIEWER_SCHEMA = outcomeExampleVar("reviewer", "review");

const CHECKER_SCHEMA = outcomeExampleVar("plan-checker", "any");

const PLAN_REVIEW_SCHEMA = outcomeExampleVar("review-architect", "any");

const PLAN_RETURN_SCHEMA = outcomeExampleVar("architect-review-return", "any");

const TASK_FRONTMATTER = taskFrontmatterVar();

const TIERS = tierNamesVar({ implementer: {}, escalation: {} });

const ROLES: Record<string, Record<string, string>> = {
  architect: {
    turn: "boundary",
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    checkout: "/worktrees/demo",
    pack_path: "/goal/iterations/3/context-pack.md",
    digest_path: "/goal/iterations/3/digest.md",
    steers: "- s1 (mailbox/inbox/s1.md): keep the API stable",
    outcome_path: "/goal/records/00042-i3-architect-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: ARCHITECT_SCHEMA,
    task_types: TEST_TASK_TYPES_VAR,
    tiers: TIERS,
    depth: "2",
    subarchitect_block: "",
  },
  subarchitect: {
    turn: "boundary",
    iteration: "3",
    epic: "auth",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/epics/auth.md",
    parent_plan_path: "/goal/plan.md",
    checkout: "/worktrees/demo",
    pack_path: "/goal/iterations/3/epics/auth/context-pack.md",
    digest_path: "/goal/iterations/3/epics/auth/digest.md",
    outcome_path: "/goal/records/00048-i3-subarchitect-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: SUBARCHITECT_SCHEMA,
    task_types: TEST_TASK_TYPES_VAR,
    tiers: TIERS,
  },
  front: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    tasks_dir: "/goal/tasks",
    class_path: "/goal/class.yaml",
    pack_path: "/goal/iterations/3/context-pack.md",
    code_map_path: "/goal/code-map.md",
    checkout: "/worktrees/demo",
    setup_command: "bun install",
    gate_commands: "- test: bun test",
    outcome_path: "/goal/records/00041-i3-front-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: BASE_SCHEMA,
    task_frontmatter: TASK_FRONTMATTER,
    task_types: TEST_TASK_TYPES_VAR,
    tiers: TIERS,
    class_types: TEST_CLASS_TYPES,
  },
  pm: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plans: "- goal: /goal/plan.md\n  - epic `auth`: /goal/epics/auth.md",
    tasks_dir: "/goal/tasks",
    existing_tasks: "- alpha | merged | abcdef1234 | deps: none | frozen",
    repair: '- task "beta" depends on missing task "ghost"',
    steers: "- s1 (mailbox/inbox/s1.md):\n  keep the API stable",
    concerns: "none",
    holds_dir: "/goal/mailbox/holds",
    stalls:
      "- alpha\n  cause: blocked: stuck\n  records: /goal/records/00007-i3-alpha-implement-r1\n  branch: factory-task/demo/alpha\n  turns: 1 spent\n  done-when: Done when: it works.",
    outcome_path: "/goal/records/00043-i3-pm-r1/outcome.yaml",
    plan_checks:
      "- alpha (replace): mechanical park\n  cause: infra: runner lost\n  records: /goal/records/00007-i3-alpha-implement-r1\n  branch: factory-task/demo/alpha\n  turns: 1 spent\n  done-when: Done when: it works.",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: PM_SCHEMA,
    task_frontmatter: TASK_FRONTMATTER,
    task_types: TEST_TASK_TYPES_VAR,
    tiers: TIERS,
  },
  implementer: {
    cleanliness_revision: "false",
    task_path: "/goal/tasks/alpha.md",
    front_pack: "/goal/iterations/3/context-pack.md",
    worktree: "/worktrees/demo-tasks/alpha",
    resume_note: "",
    report_path: ".factory/spikes/alpha.md",
    env_notes: "",
    setup_command: "bun install",
    gate_commands: "- test: bun test\n- typecheck: bun run typecheck",
    base_gates: "base abc1234def: green",
    findings: "- src/x.ts:41 needs a null check",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
  qa: {
    task_path: "/goal/tasks/alpha.md",
    worktree: "/worktrees/demo-tasks/alpha",
    base_hash: "abc1234",
    head_hash: "def5678",
    round: "1",
    max_rounds: "3",
    last_call: "false",
    base_gates: "base abc1234def: green",
    checks_result: "pass",
    checks_tree: "3ba247e47772a8ba5874d089990419f572432df8",
    checks_log: "/goal/records/1/alpha/checks",
    gate_commands: "- test: bun test",
    prior_findings: "",
    fix_dispositions: "",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: QA_SCHEMA,
  },
  reviewer: {
    task_path: "/goal/tasks/alpha.md",
    worktree: "/worktrees/demo-tasks/alpha",
    author: "implementer",
    base_hash: "abc1234",
    head_hash: "def5678",
    round: "1",
    max_rounds: "3",
    last_call: "false",
    base_gates: "base abc1234def: green",
    checks_result: "pass",
    checks_tree: "3ba247e47772a8ba5874d089990419f572432df8",
    checks_log: "/goal/records/1/alpha/checks",
    prior_findings: "",
    upscope_ask: "",
    fix_dispositions: "",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: REVIEWER_SCHEMA,
  },
  digest: {
    launch_id: "previous-launch-before-3",
    goal_dir: "/goal",
    records_dir: "/goal/records",
    transcripts_dir: "/sessions/demo/launch-2",
    digest_path: "/goal/iterations/3/digest.md",
    outcome_path: "/goal/records/00044-i3-digest-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: BASE_SCHEMA,
  },
  steward: {
    worktree: "/worktrees/demo-tasks/alpha",
    branch: "factory-task/demo/alpha",
    integration_head: "abc1234def5678",
    conflicts: "conflict.txt",
    gate_commands: "- test: bun test",
    gate_log_path: "none",
    base_gates: "base abc1234def: green",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: BASE_SCHEMA,
  },
  intent: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    steer: "- s1 (mailbox/inbox/s1.md):\n  keep the API stable",
    outcome_path: "/goal/records/00009-i3-s1-intent-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: BASE_SCHEMA,
  },
  "plan-checker": {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plans: "- goal: /goal/plan.md\n  - epic `auth`: /goal/epics/auth.md",
    checkout: "/worktrees/demo",
    tasks_dir: "/goal/tasks",
    existing_tasks: "- alpha | merged | abcdef1234 | deps: none | frozen",
    open_concerns:
      "- c-1a2b3c4d5e [risk/architect]: the retry window drops head names — alpha implement r1",
    gate_record_path: "/goal/records/00007-i3-alpha-checks-r1/end.yaml",
    outcome_path: "/goal/records/00045-i3-plan-check-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: CHECKER_SCHEMA,
    task_types: TEST_TASK_TYPES_VAR,
  },
  "pack-preparer": {
    iteration: "3",
    context_data_path: "/goal/iterations/3/context-data.json",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    checkout: "/worktrees/demo",
    outcome_path: "/goal/records/00046-i3-packprep-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: packPreparerOutcomeSchemaVar(),
  },
  "review-architect": {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    pack_path: "/goal/iterations/3/context-pack.md",
    worktree: "/worktrees/demo",
    outcome_path: "/goal/records/00046-i3-planreview-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: PLAN_REVIEW_SCHEMA,
    task_types: TEST_TASK_TYPES_VAR,
    tiers: TIERS,
  },
  "architect-review-return": {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    pack_path: "/goal/iterations/3/context-pack.md",
    reviewers: "`plan-reviewer`",
    technical_findings:
      "1. plan.md:12 — the bullet assumes a module the repo lacks",
    plan_notes: "2. plan.md:40 — the done-when names no command",
    finding_count: "2",
    outcome_path: "/goal/records/00047-i3-planreturn-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: PLAN_RETURN_SCHEMA,
  },
};

function library() {
  return loadPromptLibrary({ builtinDir: path.join(packageRoot, "prompts") });
}

const PROVENANCE_OR_DOWNSTREAMFixture = [
  "implemented and merged after gates",
  "the front's briefing for this goal",
  "review summary, then concerns and forward",
  "You get the task file or plan",
  "next implementer receives",
  "Each tier gets two turns",
  "the ladder climbs",
  "fallbacks already absorbed",
  "A pending task in this list is not dispatched",
  "runs its flow to the end",
  "keeps running to exhaustion",
  "outbox response",
  "landed outcome is answered to the owner later",
  "The next boundary presents the steer verbatim",
  "the hold drains the goal",
  "the next boundary sees your reason",
  "the next reconcile never cancels them",
  "a fresh session at the same tier",
  "writes were rolled back",
  "Records follow the kernel step record",
  "the previous launch being summarised",
  "replaces the scripted pack",
  "it briefs the implementer",
  "after this turn the script runs",
  "records hold the history",
  "Parked tasks come from the pack with a cause",
  "the rest continues unless the steer blocks the goal",
  "There is no diff and no task file to judge",
  "next implementers receive only what its bullets say",
  "The plan stands or changes on the architect's decision",
  "The dispatch set ran out",
  "before the architect is consulted",
  "the kernel throws away whatever you write outside the outcome",
  "everything else stays on the record",
  "the fix round's per-finding disposition claims",
  "the escalation ask for a standalone task",
  "red before this diff",
  "status, hashes, paths, evidence; drill in by path",
  "stays on the record",
  "waits for the next architect turn",
  "a concern costs the next stage attention",
  "deserves the next stage's attention",
];

function registerReviewFindingsCarryPart3(): void {
  it("keeps gate-failure findings when red checks are the latest record", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const taskFile = task("alpha", { scope: ["alpha-area"] });
      const flow = runtime.configs.process.flows["implement-review"]!;
      const summary = "1. src/x.ts:41 needs a null check";
      const records = [
        rec(1, { slug: "alpha", step: "implement", round: 1 }),
        rec(2, {
          slug: "alpha",
          step: "review",
          round: 1,
          outcome: outcome({ summary, verdict: "changes" }),
        }),
        rec(3, {
          slug: "alpha",
          step: "checks",
          round: 1,
          actor: "script",
          alias: undefined,
          model: undefined,
          ok: false,
          checks: [
            {
              name: "test",
              ok: false,
              summary: "exit 1",
              output: "(fail) alpha > one",
              fingerprint: "test:(fail) alpha > one",
            },
          ],
        }),
      ];
      const vars = promptVars(
        runtime,
        taskFile,
        "/worktrees/demo-tasks/alpha",
        records,
        2,
        flow,
      );
      expect(vars.findings).toContain("### test: exit 1");
      expect(vars.findings).not.toContain(summary);
      expect(vars.prior_findings).toContain(summary);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerReviewFindingsCarryPart4(): void {
  it("tells the reviewer to write numbered findings in its summary", () => {
    const rendered = library().render("reviewer", ROLES.reviewer!);
    expect(rendered).toContain("numbered list in your outcome `summary`");
    expect(rendered).not.toContain("next implementer receives");
  });

  it("switches the reviewer decision to ship-or-park on the last call", () => {
    const normal = library().render("reviewer", ROLES.reviewer!);
    expect(normal).toContain(
      "- `changes`: actionable findings for the next round.",
    );
    expect(normal).not.toContain("This is the last call");

    const last = library().render("reviewer", {
      ...ROLES.reviewer!,
      last_call: "true",
    });
    expect(last).toContain("This is the last call");
    expect(last).toContain(
      "`changes` is not an accepted outcome — outcome validation refuses it.",
    );
    expect(last).toContain(
      "- `reject`: park, keeping the branch; the work must not merge.",
    );
    expect(last).not.toContain(
      "- `changes`: actionable findings for the next round.",
    );
  });

  it("marks findings empty before the first acceptance, not per fix round", () => {
    const rendered = library().render("implementer", ROLES.implementer!);
    expect(rendered).not.toContain("empty on the first turn");
    expect(rendered).toContain("empty before the first acceptance");
  });
}

describe("review findings carry", () => {
  registerReviewFindingsCarryPart3();

  registerReviewFindingsCarryPart4();
});

describe("prompt debloat", () => {
  function renderedPrompts(): Map<string, string> {
    const rendered = new Map<string, string>();
    for (const [role, vars] of Object.entries(ROLES))
      rendered.set(role, library().render(role, vars));
    rendered.set(
      "plan-reviewer",
      library().render("review-architect", ROLES["review-architect"]!),
    );
    return rendered;
  }

  // One entry per original sentence class: where an input came from, how it
  // was produced, or what the kernel/next role does with the output.
  const PROVENANCE_OR_DOWNSTREAM = PROVENANCE_OR_DOWNSTREAMFixture;

  it("drops input provenance and downstream steps from every rendered prompt", () => {
    const rendered = renderedPrompts();
    const found: string[] = [];
    for (const [role, prompt] of rendered) {
      for (const phrase of PROVENANCE_OR_DOWNSTREAM) {
        if (prompt.includes(phrase)) found.push(`${role}: ${phrase}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("keeps the bounds and deliverables a role acts on", () => {
    const rendered = renderedPrompts();
    const keeps: [string, string][] = [
      ["architect", "Nothing asks mid-flight"],
      ["architect", "Plan the road to completion as far as uncertainty allows"],
      ["front", "no design decision and no review"],
      ["front", "On `trivial` or `task`, carry the area and risks"],
      ["pm", "Write one hold file per steer"],
      ["pm", "Only an escalated ask may put a question"],
      ["implementer", "Do not commit, amend, push"],
      ["implementer", "a failure it lists was red before any task"],
      ["reviewer", "Write them as a numbered list in your outcome `summary`"],
      ["reviewer", 'a claimed "pre-existing" failure is a finding'],
      ["digest", "at most 80 lines"],
      ["plan-checker", "MUST report honestly"],
      [
        "plan-checker",
        "Never report a `missing-dep` follow-up for a dependency satisfied this way",
      ],
      ["plan-checker", "name that parked slug under `cancel`"],
      ["steward", "Never rebase"],
    ];
    for (const [role, phrase] of keeps) {
      expect(rendered.get(role), role).toContain(phrase);
    }
  });
});
