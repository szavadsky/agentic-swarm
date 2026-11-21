import { describe, expect, it } from "bun:test";
import path from "node:path";
import { packageRoot } from "../../src/kernel/config.js";
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
import { outcome } from "./s2-helpers.js";

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

function architectSubarchitectSharePart1() {
  function bounds(rendered: string): string {
    const start = rendered.indexOf("## Bounds\n");
    expect(start, "no bounds").toBeGreaterThanOrEqual(0);
    return rendered.slice(start, rendered.indexOf("\n## ", start + 1));
  }

  function body(rendered: string): string {
    const start = rendered.indexOf("## Turn order\n");
    expect(start, "no turn order").toBeGreaterThanOrEqual(0);
    const outcome = rendered.indexOf("## Outcome\n", start);
    expect(outcome, "no outcome").toBeGreaterThan(start);
    const end = rendered.indexOf("\n## ", outcome + 1);
    return rendered.slice(start, end === -1 ? undefined : end);
  }

  it("renders the bounds and the whole body identically in both", () => {
    const architect = library().render("architect", ROLES.architect!);
    const subarchitect = library().render("subarchitect", ROLES.subarchitect!);
    expect(bounds(subarchitect).trimEnd()).toBe(bounds(architect).trimEnd());
    expect(body(subarchitect).trimEnd()).toBe(body(architect).trimEnd());
    for (const rendered of [architect, subarchitect]) {
      for (const heading of [
        "## Bounds\n",
        "## Turn order\n",
        "## Outcome\n",
      ]) {
        expect(rendered.split(heading).length - 1, heading).toBe(1);
      }
    }
  });
}

function architectSubarchitectSharePart2() {
  it("adds only its own scope and reporting line", () => {
    const architect = library().render("architect", ROLES.architect!);
    const subarchitect = library().render("subarchitect", ROLES.subarchitect!);
    expect(architect.startsWith("You are the architect:")).toBe(true);
    expect(architect).toContain("### Architect register");
    expect(architect).toContain("## Steers");
    expect(architect).not.toContain("You are the subarchitect");
    expect(architect).not.toContain("## Upward brief");
    expect(
      subarchitect.startsWith("You are the subarchitect of epic `auth`"),
    ).toBe(true);
    expect(subarchitect).toContain("You report to the architect above you");
    expect(subarchitect).toContain("## Your epic");
    expect(subarchitect).toContain("## Upward brief");
    expect(subarchitect).toContain("the one brief the parent reads");
    expect(subarchitect).toContain("it is never the goal's done");
    expect(subarchitect).toContain("never sideways");
    expect(subarchitect).not.toContain("### Architect register");
    expect(subarchitect).not.toContain("## Steers\n");
  });

  it("names each turn's own plan and the parent plan below the top", () => {
    const architect = library().render("architect", ROLES.architect!);
    const subarchitect = library().render("subarchitect", ROLES.subarchitect!);
    expect(architect).toContain("- plan: `/goal/plan.md` (edit this file)");
    expect(architect).not.toContain("parent plan");
    const turn = subarchitect.slice(subarchitect.indexOf("## This turn"));
    expect(turn).toContain("- epic: `auth`");
    expect(turn).toContain(
      "- plan: `/goal/epics/auth.md` (your epic plan; edit this file)",
    );
    expect(turn).toContain("- parent plan: `/goal/plan.md` (read-only)");
  });

  it("keeps the architect register out of a depth-1 goal", () => {
    const depth1 = library().render("architect", {
      ...ROLES.architect!,
      depth: "1",
    });
    expect(depth1).not.toContain("Architect register");
    expect(depth1).not.toContain("epics/");
    expect(depth1).toContain("## Steers");
  });
}

describe("task size", () => {
  it("defines one task once and includes it in front, architect and plan review", () => {
    const definition =
      "one implementer session, one seam, one reviewable diff, one done-when";
    const split =
      "Split when a done-when needs two independent observables or crosses two interface seams";
    for (const role of [
      "front",
      "architect",
      "subarchitect",
      "review-architect",
    ] as const) {
      const rendered = library().render(role, ROLES[role]!);
      expect(rendered.split(definition).length - 1, role).toBe(1);
      expect(rendered.split(split).length - 1, role).toBe(1);
    }
  });
});

describe("architect bullet", () => {
  it("asks for what, why, done-when and an interface or approach only when he has one", () => {
    const architect = library().render("architect", ROLES.architect!);
    expect(architect).toContain("1. What and why — two lines.");
    expect(architect).toContain(
      "2. Done-when — observable behaviour or a command.",
    );
    expect(architect).toContain(
      "3. Interface or approach — only when you have one",
    );
    expect(architect).not.toContain(
      "Area — the predicted area this task works in",
    );
    expect(architect).not.toContain("Non-obvious edge cases that must hold.");
    expect(architect).not.toContain("Ordering and what must not be touched");
    expect(architect).toContain(
      "The PM derives the area, the edge cases and the dependency order",
    );
  });
});

describe("PM formalization", () => {
  it("owns area, edges and order from the short bullet", () => {
    const pm = library().render("pm", ROLES.pm!);
    expect(pm).toContain("Edges — the non-obvious cases the done-when implies");
    expect(pm).toContain(
      "Order — `deps`: the tasks the bullet names as interfaces or predecessors",
    );
    expect(pm).toContain("per the order above");
    expect(pm).toContain("the edges and the order you formalized");
  });
});

describe("architect horizon", () => {
  it("evaluates the project against the intent first and plans the road to completion", () => {
    const rendered = library().render("architect", ROLES.architect!);
    const firstStep = rendered.indexOf("### 1. Completeness check");
    const editPlan = rendered.indexOf("### 4. Edit the plan");
    expect(firstStep).toBeGreaterThanOrEqual(0);
    expect(editPlan).toBeGreaterThan(firstStep);
    const stepOne = rendered.slice(firstStep, editPlan);
    expect(stepOne).toContain("against the intent");
    expect(stepOne).toContain(
      "completeness, quality, correctness of what exists",
    );
    expect(stepOne).toContain("not only the last iteration");
    expect(stepOne).toContain(
      "Reuse this evaluation context for planning below",
    );
    expect(rendered).toContain(
      "road to completion as far as uncertainty allows",
    );
    expect(rendered).toContain("not one iteration's slice");
    expect(rendered).toContain("details after spike X / task Y lands");
    expect(rendered).not.toContain("plan the whole iteration");
  });
});

describe("architect and subarchitect share fragments", () => {
  architectSubarchitectSharePart1();

  architectSubarchitectSharePart2();
});

describe("outcome protocol in prompts", () => {
  it("renders the typed protocol fields from the schema and never asks for a forward line", () => {
    for (const role of ["architect", "pm"]) {
      const rendered = library().render(role, ROLES[role]!);
      expect(rendered, `${role} lost debtClosed`).toContain(
        "debtClosed: [{id, reason}]",
      );
      expect(rendered, `${role} lost steerAnswers`).toContain(
        "steerAnswers: [{steer, answer}]",
      );
      expect(rendered, `${role} still asks for a forward line`).not.toContain(
        "forward:",
      );
      // The skeleton renders the same schema the parser validates.
      expect(rendered).toContain(OUTCOME_SCHEMA);
    }
  });
});
