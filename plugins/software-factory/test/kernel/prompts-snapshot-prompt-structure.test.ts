import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { packageRoot } from "../../src/kernel/config.js";
import { frontClassTypesVar } from "../../src/kernel/front.js";
import {
  taskFrontmatterVar,
  taskTypesVar,
  tierNamesVar,
} from "../../src/kernel/prompt-schema.js";
import { outcomeExampleVar } from "../../src/kernel/outcome-example.js";
import { packPreparerOutcomeSchemaVar } from "../../src/kernel/pack-prep.js";
import { qaOutcomeSchema } from "../../src/kernel/qa.js";
import { loadPromptLibrary } from "../../src/kernel/prompts.js";

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
    outcome_schema: ARCHITECT_SCHEMA,
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
    outcome_schema: SUBARCHITECT_SCHEMA,
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
    code_map_path: "/goal/code-map.md",
    checkout: "/worktrees/demo",
    setup_command: "bun install",
    gate_commands: "- test: bun test",
    outcome_path: "/goal/records/00041-i3-front-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: BASE_SCHEMA,
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
    task_types: TASK_TYPES,
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
    outcome_schema: PLAN_RETURN_SCHEMA,
  },
};

function library() {
  return loadPromptLibrary({ builtinDir: path.join(packageRoot, "prompts") });
}

describe("prompt structure", () => {
  it("gives every role one H1, ordered headings, and nothing after the turn block", () => {
    const promptsDir = path.join(packageRoot, "prompts");
    for (const [role, vars] of Object.entries(ROLES)) {
      const rendered = library().render(role, vars);
      const lines = rendered.split("\n");
      const h1 = lines.filter((l) => l.startsWith("# "));
      expect(h1.length, `${role} H1s: ${h1.join(" | ")}`).toBeLessThan(2);
      let prev = 0;
      let first = true;
      for (const line of lines) {
        const m = line.match(/^(#{1,6})\s/);
        if (!m) continue;
        const level = m[1]!.length;
        if (!first && level > prev + 1) {
          expect(
            `skipped heading in ${role}: H${prev} -> H${level}: ${line}`,
          ).toEqual("");
        }
        first = false;
        prev = level;
      }
      const headings = lines.filter((l) => /^#{1,6}\s/.test(l));
      const turnAt = headings.findIndex((h) => h.startsWith("## This turn"));
      expect(turnAt, `${role} has no ## This turn`).toBeGreaterThanOrEqual(0);
      expect(
        turnAt,
        `${role} has text after ## This turn: ${headings.slice(turnAt + 1).join(" | ")}`,
      ).toBe(headings.length - 1);
      const source = fs.readFileSync(
        path.join(promptsDir, `${role}.md`),
        "utf8",
      );
      const turnLine = source
        .split("\n")
        .findIndex((l) => l.startsWith("## This turn"));
      expect(
        turnLine,
        `${role} source has no ## This turn`,
      ).toBeGreaterThanOrEqual(0);
      const stray = source
        .split("\n")
        .slice(turnLine + 1)
        .filter((l) => l.trim() !== "" && !/^(\s|-|\{%|\{\{)/.test(l));
      expect(
        stray,
        `${role} has non-variable content after ## This turn: ${stray.join(" | ")}`,
      ).toEqual([]);
    }
  });
});
