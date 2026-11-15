import { describe, expect, it } from "bun:test";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { packageRoot } from "../../src/kernel/config.js";
import { promptVars } from "../../src/kernel/flow-context.js";
import { loadPromptLibrary } from "../../src/kernel/prompts.js";
import { formatReviewFindings } from "../../src/kernel/record.js";
import type { ProcessConfig } from "../../src/kernel/types.js";
import { rec, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
} from "./s2-helpers.js";

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
  },
  pm: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    tasks_dir: "/goal/tasks",
    existing_tasks: "- alpha | merged | abcdef1234 | deps: none | frozen",
    repair: '- task "beta" depends on missing task "ghost"',
    steers: "- s1 (mailbox/inbox/s1.md):\n  keep the API stable",
    holds_dir: "/goal/mailbox/holds",
    outcome_path: "/goal/records/00043-i3-pm-r1/outcome.yaml",
  },
  implementer: {
    task_path: "/goal/tasks/alpha.md",
    front_pack: "/goal/iterations/3/context-pack.md",
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
    baseline_checks: "- test: 2 failing",
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
    roles: Object.fromEntries(
      Object.keys(ROLES).map((role) => [role, { prompt: role }]),
    ),
    itemTurns: 8,
  };
}

describe("role prompts", () => {
  for (const [role, vars] of Object.entries(ROLES)) {
    it(`renders ${role} from exactly its documented variables`, () => {
      const lib = library();
      const placeholders = new Set(
        lib.placeholders(processConfig().roles[role]!.prompt),
      );
      expect([...placeholders].sort()).toEqual(Object.keys(vars).sort());

      const rendered = lib.render(processConfig().roles[role]!.prompt, vars);
      expect(rendered).toMatchSnapshot(role);
      expect(rendered).not.toContain("{{");

      for (const name of placeholders) {
        const missing = { ...vars };
        delete missing[name];
        expect(() =>
          lib.render(processConfig().roles[role]!.prompt, missing),
        ).toThrow("Missing required prompt variables");
      }
    });
  }

  it("keeps role text out of a separate system channel", () => {
    // The harness contract has `system`, but OpenCode has no system flag; role
    // identity must therefore live in the rendered prompt itself (KERNEL0 S3).
    const rendered = library().render(
      processConfig().roles.architect!.prompt,
      ROLES.architect!,
    );
    expect(rendered.startsWith("You are the architect")).toBe(true);
  });
});

describe("review findings carry", () => {
  it("formats the review outcome whole: summary first, then concerns and forward", () => {
    const summary =
      "1. src/x.ts:41 needs a null check\n2. test/y.ts:9 asserts nothing";
    const text = formatReviewFindings(
      outcome({
        summary,
        concerns: [
          {
            kind: "debt",
            calibration: "architect",
            text: "retry helper duplicates backoff",
            evidence: "src/z.ts:3",
          },
        ],
        forward: ["split the helper next iteration"],
      }),
    );
    expect(text).toContain(summary);
    const summaryAt = text.indexOf("1. src/x.ts:41");
    const concernAt = text.indexOf("retry helper duplicates backoff");
    const forwardAt = text.indexOf("split the helper next iteration");
    expect(summaryAt).toBeGreaterThanOrEqual(0);
    expect(concernAt).toBeGreaterThan(summaryAt);
    expect(forwardAt).toBeGreaterThan(concernAt);
  });

  it("carries a summary-only changes review into findings and prior_findings", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const taskFile = task("alpha", { scope: ["src/x.ts"] });
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
      ];
      const vars = promptVars(
        runtime,
        taskFile,
        "/worktrees/demo-tasks/alpha",
        records,
        2,
        flow,
      );
      expect(vars.findings).toContain(summary);
      expect(vars.prior_findings).toContain(summary);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("keeps gate-failure findings when red checks are the latest record", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const taskFile = task("alpha", { scope: ["src/x.ts"] });
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

  it("tells the reviewer its summary carries the implementer's findings", () => {
    const rendered = library().render("reviewer", ROLES.reviewer!);
    expect(rendered).toContain("numbered list in your outcome `summary`");
    expect(rendered).toContain(
      "receives that summary as its findings, followed by your concerns and forward",
    );
  });

  it("no longer calls fix-round findings empty on the first turn", () => {
    const rendered = library().render("implementer", ROLES.implementer!);
    expect(rendered).not.toContain("empty on the first turn");
    expect(rendered).toContain("review summary, then concerns and forward");
  });
});
