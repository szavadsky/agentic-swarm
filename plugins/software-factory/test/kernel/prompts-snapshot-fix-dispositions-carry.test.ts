import { describe, expect, it } from "bun:test";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { packageRoot } from "../../src/kernel/config.js";
import { promptVars } from "../../src/kernel/flow-context.js";
import { frontClassTypesVar } from "../../src/kernel/front.js";
import {
  outcomeRepairSchemaVar,
  outcomeSchemaVar,
  qaOutcomeSchemaVar,
  taskFrontmatterVar,
  taskTypesVar,
  tierNamesVar,
} from "../../src/kernel/prompt-schema.js";
import { loadPromptLibrary } from "../../src/kernel/prompts.js";
import { formatFixDispositions } from "../../src/kernel/record.js";
import { rec, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
} from "./s2-helpers.js";

const OUTCOME_SCHEMA = outcomeSchemaVar();

const TASK_FRONTMATTER = taskFrontmatterVar();

const TASK_TYPES = taskTypesVar({
  development: {
    flow: "implement-review",
    kind: "development",
    schema: "outcome",
  },
  spike: { flow: "spike", kind: "spike", schema: "outcome" },
  trivial: { flow: "just-implement", kind: "development", schema: "outcome" },
});

const TIERS = tierNamesVar({ implementer: {}, escalation: {} });

const CLASS_TYPES = frontClassTypesVar({
  development: {
    flow: "implement-review",
    kind: "development",
    schema: "outcome",
  },
  trivial: { flow: "just-implement", kind: "development", schema: "outcome" },
});

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
    outcome_schema: OUTCOME_SCHEMA,
    task_types: TASK_TYPES,
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
    outcome_schema: OUTCOME_SCHEMA,
    task_types: TASK_TYPES,
    tiers: TIERS,
  },
  front: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    tasks_dir: "/goal/tasks",
    class_path: "/goal/class.yaml",
    pack_path: "/goal/iterations/3/context-pack.md",
    checkout: "/worktrees/demo",
    setup_command: "bun install",
    gate_commands: "- test: bun test",
    outcome_path: "/goal/records/00041-i3-front-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
    task_frontmatter: TASK_FRONTMATTER,
    task_types: TASK_TYPES,
    tiers: TIERS,
    class_types: CLASS_TYPES,
  },
  pm: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plans: "- goal: /goal/plan.md\n  - epic `auth`: /goal/epics/auth.md",
    tasks_dir: "/goal/tasks",
    existing_tasks: "- alpha | merged | abcdef1234 | deps: none | frozen",
    repair: '- task "beta" depends on missing task "ghost"',
    steers: "- s1 (mailbox/inbox/s1.md):\n  keep the API stable",
    holds_dir: "/goal/mailbox/holds",
    stalls:
      "- alpha\n  cause: blocked: stuck\n  records: /goal/records/00007-i3-alpha-implement-r1\n  branch: factory-task/demo/alpha\n  turns: 1 spent\n  done-when: Done when: it works.",
    outcome_path: "/goal/records/00043-i3-pm-r1/outcome.yaml",
    plan_checks:
      "- alpha (replace): mechanical park\n  cause: infra: runner lost\n  records: /goal/records/00007-i3-alpha-implement-r1\n  branch: factory-task/demo/alpha\n  turns: 1 spent\n  done-when: Done when: it works.",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
    task_frontmatter: TASK_FRONTMATTER,
    task_types: TASK_TYPES,
    tiers: TIERS,
  },
  implementer: {
    task_path: "/goal/tasks/alpha.md",
    front_pack: "/goal/iterations/3/context-pack.md",
    worktree: "/worktrees/demo-tasks/alpha",
    resume_note: "",
    report_path: ".factory/spikes/alpha.md",
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
    outcome_schema: qaOutcomeSchemaVar(),
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
    outcome_schema: OUTCOME_SCHEMA,
  },
  digest: {
    launch_id: "previous-launch-before-3",
    goal_dir: "/goal",
    records_dir: "/goal/records",
    transcripts_dir: "/sessions/demo/launch-2",
    digest_path: "/goal/iterations/3/digest.md",
    outcome_path: "/goal/records/00044-i3-digest-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
  steward: {
    worktree: "/worktrees/demo-tasks/alpha",
    branch: "factory-task/demo/alpha",
    integration_head: "abc1234def5678",
    conflicts: "conflict.txt",
    gate_commands: "- test: bun test",
    base_gates: "base abc1234def: green",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
  intent: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    steer: "- s1 (mailbox/inbox/s1.md):\n  keep the API stable",
    outcome_path: "/goal/records/00009-i3-s1-intent-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
  "plan-checker": {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plans: "- goal: /goal/plan.md\n  - epic `auth`: /goal/epics/auth.md",
    checkout: "/worktrees/demo",
    tasks_dir: "/goal/tasks",
    existing_tasks: "- alpha | merged | abcdef1234 | deps: none | frozen",
    gate_record_path: "/goal/records/00007-i3-alpha-checks-r1/end.yaml",
    outcome_path: "/goal/records/00045-i3-plan-check-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
  "pack-preparer": {
    iteration: "3",
    context_data_path: "/goal/iterations/3/context-data.json",
    pack_path: "/goal/iterations/3/context-pack.md",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    checkout: "/worktrees/demo",
    outcome_path: "/goal/records/00046-i3-packprep-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
  "review-architect": {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    pack_path: "/goal/iterations/3/context-pack.md",
    worktree: "/worktrees/demo",
    outcome_path: "/goal/records/00046-i3-planreview-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: outcomeRepairSchemaVar("review-architect", "any"),
    task_types: TASK_TYPES,
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
    outcome_schema: outcomeRepairSchemaVar("architect-review-return", "any"),
  },
};

function library() {
  return loadPromptLibrary({ builtinDir: path.join(packageRoot, "prompts") });
}

function registerFixDispositionsCarryPart1(): void {
  it("carries the current fix round's dispositions into fix_dispositions", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const taskFile = task("alpha", { scope: ["alpha-area"] });
      const flow = runtime.configs.process.flows["implement-review"]!;
      const dispositions =
        "F1 fixed in src/x.ts:41; F2 out of scope per done-when";
      const replies = [
        { finding: 1, reply: "null check added at src/x.ts:41" },
        { finding: 2, reply: "the assertion moves to test/y.ts:9" },
      ];
      const records = [
        rec(1, { slug: "alpha", step: "implement", round: 1 }),
        rec(2, {
          slug: "alpha",
          step: "review",
          round: 1,
          outcome: outcome({
            summary: "1. src/x.ts:41 needs a null check",
            verdict: "changes",
          }),
        }),
        rec(3, {
          slug: "alpha",
          step: "implement",
          round: 2,
          outcome: outcome({ summary: dispositions, replies }),
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
      expect(vars.fix_dispositions).toContain(dispositions);
      for (const reply of replies) {
        expect(vars.fix_dispositions).toContain(
          `finding ${reply.finding}: ${reply.reply}`,
        );
      }
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerFixDispositionsCarryPart2(): void {
  it("renders each reply by its finding number after the fix summary", () => {
    const summary = "replied without a change";
    const text = formatFixDispositions(
      outcome({
        summary,
        replies: [
          { finding: 1, reply: "already guarded" },
          { finding: 2, reply: "already asserted" },
        ],
      }),
    );
    expect(text).toBe(
      "replied without a change\n- finding 1: already guarded\n- finding 2: already asserted",
    );
  });
}

function registerFixDispositionsCarryPart3(): void {
  it("leaves fix_dispositions empty without a current-round fix", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const taskFile = task("alpha", { scope: ["alpha-area"] });
      const flow = runtime.configs.process.flows["implement-review"]!;
      const first = [
        rec(1, {
          slug: "alpha",
          step: "implement",
          round: 1,
          outcome: outcome({ summary: "implemented" }),
        }),
      ];
      const round1 = promptVars(
        runtime,
        taskFile,
        "/worktrees/demo-tasks/alpha",
        first,
        1,
        flow,
      );
      expect(round1.fix_dispositions).toBe("");
      const stale = promptVars(
        runtime,
        taskFile,
        "/worktrees/demo-tasks/alpha",
        first,
        2,
        flow,
      );
      expect(stale.fix_dispositions).toBe("");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

function registerFixDispositionsCarryPart4(): void {
  it("renders the fix-dispositions line in the reviewer prompt", () => {
    const rendered = library().render("reviewer", {
      ...ROLES.reviewer!,
      fix_dispositions: "F1 fixed",
    });
    expect(rendered).toContain("F1 fixed");
    expect(rendered).toContain(
      "Re-judge each finding against the diff or its reply",
    );
    expect(rendered).toContain("a reply is judged on its argument");
  });

  it("tells the implementer a reply-only round is done", () => {
    const rendered = library().render("implementer", ROLES.implementer!);
    expect(rendered).toContain(
      "each is answered by a change, a reply in `replies`, or both",
    );
    expect(rendered).toContain("a reply-only round is `done`");
  });
}

describe("fix dispositions carry", () => {
  registerFixDispositionsCarryPart1();

  registerFixDispositionsCarryPart2();

  registerFixDispositionsCarryPart3();

  registerFixDispositionsCarryPart4();
});

describe("scope as predicted area", () => {
  it("defines scope as a predicted area, not a fence, in one shared include", () => {
    const implementer = library().render("implementer", ROLES.implementer!);
    const reviewer = library().render("reviewer", ROLES.reviewer!);
    for (const rendered of [implementer, reviewer]) {
      expect(rendered).toContain("predicted area, not a fence");
      expect(rendered).toContain("list files outside the area");
      expect(rendered).toContain("different seam or a missing dependency");
      expect(rendered).not.toContain("Touch only files");
    }
    expect(implementer).toContain(
      "Fix every review finding the done-when covers, wherever it lives",
    );
    expect(reviewer).toContain(
      "judge out-of-area changes by the done-when, not by location",
    );
    expect(reviewer).not.toContain("Scope creep");
  });

  it("formalizes area in the PM, not in the plan bullet", () => {
    const architect = library().render("architect", ROLES.architect!);
    expect(architect).not.toContain("the predicted area this task works in");
    expect(architect).not.toContain("must declare disjoint areas");
    expect(architect).not.toContain("must not overlap in scope");
    const pm = library().render("pm", ROLES.pm!);
    expect(pm).toContain(
      "Area — `scope`: the predicted area at module granularity",
    );
    expect(pm).toContain("Tasks that run together get disjoint areas");
    expect(pm).toContain("the predicted area you formalized");
    expect(pm).not.toContain("from the task's stated area");
    expect(pm).not.toContain("globs the task may touch");
    const front = library().render("front", ROLES.front!);
    expect(front).toContain("`scope` (the predicted area)");
    expect(front).not.toContain("globs the task may touch");
  });
});
