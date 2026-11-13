import { describe, expect, it } from "bun:test";
import path from "node:path";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { packageRoot } from "../../src/kernel/config.js";
import type { ProcessConfig } from "../../src/kernel/types.js";

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
  },
  pm: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    tasks_dir: "/goal/tasks",
    existing_tasks: "- alpha | merged | abcdef1234 | deps: none | frozen",
    repair: "- task \"beta\" depends on missing task \"ghost\"",
    outcome_path: "/goal/records/00043-i3-pm-r1/outcome.yaml",
  },
  implementer: {
    task_path: "/goal/tasks/alpha.md",
    worktree: "/worktrees/demo-tasks/alpha",
    setup_command: "bun install",
    gate_commands: "- test: bun test\n- typecheck: bun run typecheck",
    baseline_checks: "- test: 2 failing",
    findings: "- src/x.ts:41 needs a null check",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
  },
  reviewer: {
    task_path: "/goal/tasks/alpha.md",
    worktree: "/worktrees/demo-tasks/alpha",
    base_hash: "abc1234",
    head_hash: "def5678",
    round: "1",
    max_rounds: "2",
    prior_findings: "",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
  },
  digest: {
    launch_id: "previous-launch-before-3",
    goal_dir: "/goal",
    records_dir: "/goal/records",
    transcripts_dir: "/sessions/demo/launch-2",
    digest_path: "/goal/iterations/3/digest.md",
    outcome_path: "/goal/records/00044-i3-digest-r1/outcome.yaml",
  },
};

function library() {
  return loadPromptLibrary({ builtinDir: path.join(packageRoot, "prompts") });
}

function processConfig(): ProcessConfig {
  return {
    flows: {},
    roles: Object.fromEntries(Object.keys(ROLES).map((role) => [role, { prompt: role }])),
    itemTurns: 8,
  };
}

describe("role prompts", () => {
  for (const [role, vars] of Object.entries(ROLES)) {
    it(`renders ${role} from exactly its documented variables`, () => {
      const lib = library();
      const placeholders = new Set(lib.placeholders(processConfig().roles[role]!.prompt));
      expect([...placeholders].sort()).toEqual(Object.keys(vars).sort());

      const rendered = lib.render(processConfig().roles[role]!.prompt, vars);
      expect(rendered).toMatchSnapshot(role);
      expect(rendered).not.toContain("{{");

      for (const name of placeholders) {
        const missing = { ...vars };
        delete missing[name];
        expect(() => lib.render(processConfig().roles[role]!.prompt, missing)).toThrow(
          "Missing required prompt variables"
        );
      }
    });
  }

  it("keeps role text out of a separate system channel", () => {
    // The harness contract has `system`, but OpenCode has no system flag; role
    // identity must therefore live in the rendered prompt itself (KERNEL0 S3).
    const rendered = library().render(processConfig().roles.architect!.prompt, ROLES.architect!);
    expect(rendered.startsWith("You are the architect")).toBe(true);
  });
});