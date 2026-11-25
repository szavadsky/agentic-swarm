import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { resolveTurn } from "../../src/kernel/flow-context.js";
import { resumeNote } from "../../src/kernel/flow-context-sessions.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";
import {
  cleanupFlowRepo,
  type FlowRepoOptions,
  makeRuntime,
  outcome,
  setupFlowRepo,
} from "./s2-helpers.js";
import { RESUME_ASK } from "./resume-helpers.js";

const implementerVars = {
  cleanliness_revision: "false",
  task_path: "/g/tasks/a.md",
  report_path: "",
  front_pack: "",
  worktree: "/wt/a",
  resume_note: "",
  setup_command: "none",
  gate_commands: "none",
  base_gates: "not recorded",
  findings: "",
};

const BASE_ALIASES = {
  architect: { harness: "a", model: "ma-arch" },
  pm: { harness: "a", model: "ma-pm" },
  reviewer: { harness: "b", model: "mb-review" },
  steward: { harness: "a", model: "ma-steward" },
};

type AliasSpec = NonNullable<FlowRepoOptions["aliases"]>[string];

async function tierRuntime(implementer: AliasSpec): Promise<{
  repo: TmpRepo;
  runtime: KernelRuntime;
  a: FakeHarness;
  b: FakeHarness;
}> {
  const { repo, goal } = setupFlowRepo({
    limits: { concurrency: { overall: 2 } },
    aliases: { ...BASE_ALIASES, implementer },
  });
  const a = new FakeHarness({ id: "a" });
  const b = new FakeHarness({ id: "b" });
  const runtime = await makeRuntime(repo, goal, { a, b });
  return { repo, runtime, a, b };
}

function quota() {
  return { stop: { kind: "infra", cause: "quota" } as const };
}

function spec(
  runtime: KernelRuntime,
  repo: TmpRepo,
  opts: { base?: string; vars?: Record<string, string> } = {},
) {
  return {
    target: resolveTurn(runtime, "implementer", "implementer"),
    cwd: repo.dir,
    meta: {
      iteration: 1,
      slug: "a",
      step: "implement",
      round: 1,
      ...(opts.base ? { base: opts.base } : {}),
    },
    vars: { ...implementerVars, ...opts.vars },
    expectation: "any" as const,
  };
}

function deliverOnB(b: FakeHarness): void {
  b.script((req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "done on b" }));
    return fakeTurnResult(req);
  });
}

function registerFallbackPromptAfterEdits(): void {
  it("sends the assess-first note to a fallback after edits", async () => {
    const t = await tierRuntime({
      harness: "a",
      model: "ma",
      fallbacks: [{ harness: "b", model: "mb" }],
    });
    try {
      t.a.script((req) => {
        fs.writeFileSync(path.join(req.cwd!, "edited.txt"), "edit\n", "utf8");
        return fakeTurnResult(req, quota());
      });
      deliverOnB(t.b);

      await runAgentTurn(t.runtime, spec(t.runtime, t.repo));

      const primaryPrompt = t.a.calls[0]!.prompt;
      expect(primaryPrompt).not.toContain(RESUME_ASK);
      expect(t.b.calls[0]!.prompt).toBe(
        `- resume: ${RESUME_ASK}\n\n${primaryPrompt}`,
      );
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });
}

function registerFallbackPromptWithoutWork(): void {
  it("keeps the plain ask when a fallback follows no work", async () => {
    const t = await tierRuntime({
      harness: "a",
      model: "ma",
      fallbacks: [{ harness: "b", model: "mb" }],
    });
    try {
      t.a.scriptResult(quota());
      deliverOnB(t.b);

      await runAgentTurn(t.runtime, spec(t.runtime, t.repo));

      expect(t.b.calls[0]!.prompt).toBe(t.a.calls[0]!.prompt);
      expect(t.b.calls[0]!.prompt).not.toContain(RESUME_ASK);
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });
}

function registerFallbackPromptPastBase(): void {
  it("sends the note when the branch already carries commits past the base", async () => {
    const t = await tierRuntime({
      harness: "a",
      model: "ma",
      fallbacks: [{ harness: "b", model: "mb" }],
    });
    try {
      const base = t.repo.git(["rev-parse", "HEAD"]).stdout.trim();
      t.repo.writeFile("carried.txt", "carried work\n");
      t.repo.commit("carried work");
      t.a.scriptResult(quota());
      deliverOnB(t.b);

      await runAgentTurn(t.runtime, spec(t.runtime, t.repo, { base }));

      expect(t.b.calls[0]!.prompt).toContain(RESUME_ASK);
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });
}

function registerFallbackPromptRelaunchAlreadyNoted(): void {
  it("does not add a second note when the ask already carries one", async () => {
    const t = await tierRuntime({
      harness: "a",
      model: "ma",
      fallbacks: [{ harness: "b", model: "mb" }],
    });
    try {
      const resume_note = resumeNote(t.runtime.prompts, "relaunch", {
        branch: "task/a",
      });
      t.a.script((req) => {
        fs.writeFileSync(path.join(req.cwd!, "edited.txt"), "edit\n", "utf8");
        return fakeTurnResult(req, quota());
      });
      deliverOnB(t.b);

      await runAgentTurn(
        t.runtime,
        spec(t.runtime, t.repo, { vars: { resume_note } }),
      );

      const primaryPrompt = t.a.calls[0]!.prompt;
      expect(primaryPrompt.split(RESUME_ASK)).toHaveLength(2);
      expect(t.b.calls[0]!.prompt).toBe(primaryPrompt);
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });
}

function registerFallbackPromptRepairAfterEdits(): void {
  it("sends the note when a repair falls over after earlier edits", async () => {
    const t = await tierRuntime({
      harness: "a",
      model: "ma",
      fallbacks: [{ harness: "b", model: "mb" }],
    });
    try {
      const base = t.repo.git(["rev-parse", "HEAD"]).stdout.trim();
      t.a.script((req) => {
        fs.writeFileSync(path.join(req.cwd!, "edited.txt"), "edit\n", "utf8");
        return fakeTurnResult(req);
      });
      t.a.scriptResult(quota());
      deliverOnB(t.b);

      await runAgentTurn(t.runtime, spec(t.runtime, t.repo, { base }));

      const repairPrompt = t.a.calls[1]!.prompt;
      expect(repairPrompt).toContain("did not deliver its outcome");
      expect(t.b.calls[0]!.prompt).toBe(
        `- resume: ${RESUME_ASK}\n\n${repairPrompt}`,
      );
      expect(t.b.calls[0]!.prompt.split(RESUME_ASK)).toHaveLength(2);
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });
}

function registerFallbackPromptOneNote(): void {
  it("adds one note when a second fallback leg follows the first", async () => {
    const t = await tierRuntime({
      harness: "a",
      model: "ma",
      fallbacks: [{ model: "ma2" }, { harness: "b", model: "mb" }],
    });
    try {
      t.a.script((req) => {
        fs.writeFileSync(path.join(req.cwd!, "edited.txt"), "edit\n", "utf8");
        return fakeTurnResult(req, quota());
      });
      t.a.scriptResult(quota());
      deliverOnB(t.b);

      await runAgentTurn(t.runtime, spec(t.runtime, t.repo));

      expect(t.b.calls[0]!.prompt.split(RESUME_ASK)).toHaveLength(2);
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });
}

describe("fallback tiers assess first", () => {
  registerFallbackPromptAfterEdits();

  registerFallbackPromptWithoutWork();

  registerFallbackPromptPastBase();

  registerFallbackPromptRelaunchAlreadyNoted();

  registerFallbackPromptRepairAfterEdits();

  registerFallbackPromptOneNote();
});
