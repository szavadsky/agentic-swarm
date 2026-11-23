import { describe, expect, it } from "bun:test";
import os from "node:os";
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
import { loadPromptLibrary, loadPrompts } from "../../src/kernel/prompts.js";
import type { ProcessConfig, RunConfig } from "../../src/kernel/types.js";
import { TEST_ARCHITECTURE, TEST_BOUNDARY } from "./helpers.js";

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
    cleanliness_revision: "false",
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

function processConfig(): ProcessConfig {
  return {
    taskTypes: {},
    flows: {},
    boundary: TEST_BOUNDARY,
    architecture: TEST_ARCHITECTURE,
    reminders: 1,
  };
}

describe("role prompts", () => {
  for (const [role, vars] of Object.entries(ROLES)) {
    it(`renders ${role} from exactly its documented variables`, () => {
      const lib = library();
      const placeholders = new Set(lib.placeholders(role, vars));
      expect([...placeholders].sort()).toEqual(Object.keys(vars).sort());

      const rendered = lib.render(role, vars);
      expect(rendered).toMatchSnapshot(role);
      expect(rendered).not.toContain("{{");

      for (const name of placeholders) {
        const missing = { ...vars };
        delete missing[name];
        expect(() => lib.render(role, missing)).toThrow(
          "Missing required prompt variables",
        );
      }
    });
  }

  it("defaults the checks handoff when a render has no checks record", () => {
    const lib = loadPrompts(processConfig(), os.tmpdir(), {
      run: {} as RunConfig,
    });
    const vars = { ...ROLES.reviewer! };
    for (const name of ["checks_result", "checks_tree", "checks_log"])
      delete vars[name];
    const rendered = lib.render("reviewer", vars);
    expect(rendered).toContain("- checks: `no checks run`");
    expect(rendered).toContain("- checks tree: `unknown`");
    expect(rendered).toContain("- checks log: `unknown`");
  });

  it("renders a review with no base record as `not recorded`, never as green", () => {
    const lib = loadPrompts(processConfig(), os.tmpdir(), {
      run: {} as RunConfig,
    });
    const vars = { ...ROLES.reviewer! };
    delete vars.base_gates;
    const rendered = lib.render("reviewer", vars);
    expect(rendered).toContain("- base gates: not recorded —");
    expect(rendered).toContain(
      "when it is `not recorded`, every such claim is a finding",
    );
    expect(rendered).not.toContain("base abc1234def");
  });

  it("keeps role text out of a separate system channel", () => {
    // The harness contract has `system`, but a harness has no system flag; role
    // identity must therefore live in the rendered prompt itself (KERNEL0 S3).
    const rendered = library().render("architect", ROLES.architect!);
    expect(rendered.startsWith("You are the architect")).toBe(true);
  });
});

describe("preset snapshots", () => {
  for (const preset of ["autonomous", "principal", "detailed"]) {
    for (const role of ["architect", "subarchitect", "pm"]) {
      it(`renders ${role} with ${preset} preset`, () => {
        const process: ProcessConfig = {
          taskTypes: {},
          flows: {},
          boundary: TEST_BOUNDARY,
          architecture: TEST_ARCHITECTURE,
          reminders: 1,
          presets: {
            autonomous: { calibration: "AUTO" },
            principal: { calibration: "PRINCIPAL" },
            detailed: { calibration: "DETAILED" },
          },
        };
        const run: RunConfig = {
          preset,
        } as RunConfig;
        const lib = loadPrompts(process, os.tmpdir(), { run });
        const rendered = lib.render(role, ROLES[role]!);
        expect(rendered).toMatchSnapshot(`${role}-${preset}`);
      });
    }
  }
});
