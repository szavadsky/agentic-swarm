import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import type { SessionRef } from "../../src/harness/types.js";
import { runAgentTurn } from "../../src/kernel/agent.js";
import { derive } from "../../src/kernel/derive.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { resolveRole } from "../../src/kernel/flow-context.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  type FlowRepoOptions,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";
import type { TmpRepo } from "../helpers/tmp-repo.js";

const implementerVars = {
  task_path: "/g/tasks/a.md",
  front_pack: "",
  worktree: "/wt/a",
  resume_note: "",
  setup_command: "none",
  gate_commands: "none",
  baseline_checks: "none",
  findings: "",
};

function priorSession(harness: string, cwd: string, model: string): SessionRef {
  return {
    harness,
    id: "prior-session",
    cwd,
    model: { id: model },
    lastRequestStartedAt: new Date(0).toISOString(),
    retentionTier: "short",
    compacted: false,
  };
}

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

describe("alias fallback tiers", () => {
  it("falls back across harnesses with each tier's own effort and opaque config", async () => {
    const t = await tierRuntime({
      harness: "a",
      model: "ma",
      effort: "low",
      fallbacks: [{ harness: "b", model: "mb", effort: "high" }],
    });
    try {
      t.a.scriptResult(quota());
      t.b.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "done on b" }));
        return fakeTurnResult(req);
      });
      t.runtime.configs.run.harnesses = {
        b: { acpx: { agent: "b-agent", raw: true } },
      };

      const result = await runAgentTurn(t.runtime, {
        target: resolveRole(t.runtime, "implementer"),
        cwd: t.repo.dir,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      expect(t.a.calls).toHaveLength(1);
      expect(t.a.calls[0]!.model).toEqual({ id: "ma", effort: "low" });
      expect(t.a.calls[0]!.effort).toBe("low");
      expect(t.a.calls[0]!.opaque).toBeUndefined();
      // The kernel walks the tiers; the adapter sees one model, no chain.
      expect(t.a.calls[0]!.fallbacks).toBeUndefined();
      expect(t.b.calls).toHaveLength(1);
      expect(t.b.calls[0]!.model).toEqual({ id: "mb", effort: "high" });
      expect(t.b.calls[0]!.effort).toBe("high");
      expect(t.b.calls[0]!.opaque).toEqual({ agent: "b-agent", raw: true });
      expect(result.record.model).toEqual({ id: "mb", effort: "high" });
      expect(
        result.record.attempts?.map((attempt) => [
          attempt.harness,
          attempt.model.id,
          attempt.stop.kind,
        ]),
      ).toEqual([
        ["a", "ma", "infra"],
        ["b", "mb", "done"],
      ]);
      expect(result.outcome?.status).toBe("done");
      expect(t.runtime.workingTier.get("implementer")).toBe(1);
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });

  it("starts the next turn on the recorded working tier", async () => {
    const t = await tierRuntime({
      harness: "a",
      model: "ma",
      fallbacks: [{ harness: "b", model: "mb" }],
    });
    try {
      t.runtime.workingTier.set("implementer", 1);
      t.b.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "done on b" }));
        return fakeTurnResult(req);
      });

      const target = resolveRole(t.runtime, "implementer");
      expect(target.harness.id).toBe("b");
      expect(target.model).toEqual({ id: "mb" });
      expect(target.tierOffset).toBe(1);
      expect(target.tiers).toHaveLength(1);

      const result = await runAgentTurn(t.runtime, {
        target,
        cwd: t.repo.dir,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
      });

      expect(t.a.calls).toHaveLength(0);
      expect(t.b.calls).toHaveLength(1);
      expect(result.outcome?.status).toBe("done");
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });

  it("keeps the session on a same-harness fallback", async () => {
    const t = await tierRuntime({
      harness: "a",
      model: "ma",
      fallbacks: [{ model: "ma2" }],
    });
    try {
      t.a.scriptResult(quota());
      t.a.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "done on ma2" }));
        return fakeTurnResult(req);
      });

      const result = await runAgentTurn(t.runtime, {
        target: resolveRole(t.runtime, "implementer"),
        cwd: t.repo.dir,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
        session: priorSession("a", t.repo.dir, "ma"),
      });

      expect(t.a.calls).toHaveLength(2);
      expect(t.a.calls[0]!.model).toEqual({ id: "ma" });
      expect(t.a.calls[1]!.model).toEqual({ id: "ma2" });
      expect(t.a.calls[1]!.session?.id).toBe("prior-session");
      expect(result.record.model).toEqual({ id: "ma2" });
      expect(result.outcome?.status).toBe("done");
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });

  it("drops the session when the fallback leaves the harness", async () => {
    const t = await tierRuntime({
      harness: "a",
      model: "ma",
      fallbacks: [{ harness: "b", model: "mb" }],
    });
    try {
      t.a.scriptResult(quota());
      t.b.script((req, ctx) => {
        ctx.writeOutcome(outcome({ summary: "done on b" }));
        return fakeTurnResult(req);
      });

      await runAgentTurn(t.runtime, {
        target: resolveRole(t.runtime, "implementer"),
        cwd: t.repo.dir,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any",
        session: priorSession("a", t.repo.dir, "ma"),
      });

      expect(t.a.calls).toHaveLength(1);
      expect(t.a.calls[0]!.session?.id).toBe("prior-session");
      expect(t.b.calls).toHaveLength(1);
      expect(t.b.calls[0]!.session).toBeUndefined();
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });

  it("returns the last infra stop when every tier fails and retries the primary next", async () => {
    const t = await tierRuntime({
      harness: "a",
      model: "ma",
      fallbacks: [{ harness: "b", model: "mb" }],
    });
    try {
      t.a.scriptResult(quota());
      t.b.scriptResult(quota());
      t.a.scriptResult(quota());
      t.b.scriptResult(quota());

      const spec = {
        target: resolveRole(t.runtime, "implementer"),
        cwd: t.repo.dir,
        meta: { iteration: 1, slug: "a", step: "implement", round: 1 },
        vars: implementerVars,
        expectation: "any" as const,
      };
      const first = await runAgentTurn(t.runtime, spec);
      expect(first.record.stop).toEqual({ kind: "infra", cause: "quota" });
      expect(t.runtime.workingTier.get("implementer")).toBeUndefined();

      // Exhaustion sticks to nothing: the next turn restarts at the primary.
      const second = await runAgentTurn(t.runtime, {
        ...spec,
        target: resolveRole(t.runtime, "implementer"),
      });
      expect(second.record.stop).toEqual({ kind: "infra", cause: "quota" });
      expect(t.a.calls).toHaveLength(2);
      expect(t.b.calls).toHaveLength(2);
    } finally {
      cleanupFlowRepo(t.repo);
    }
  });

  it("stays on the working tier for the rest of the dispatch", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
      aliases: {
        ...BASE_ALIASES,
        implementer: {
          harness: "a",
          model: "ma",
          fallbacks: [{ harness: "b", model: "mb" }],
        },
      },
    });
    try {
      const a = new FakeHarness({ id: "a" });
      const b = new FakeHarness({ id: "b" });
      a.script((req) => fakeTurnResult(req, quota()), {
        when: whenTurn({ step: "implement" }),
      });
      for (let i = 0; i < 2; i += 1) {
        b.script(
          (req, ctx) => {
            fs.writeFileSync(
              path.join(req.cwd!, `${path.basename(req.cwd!)}.txt`),
              "done\n",
              "utf8",
            );
            ctx.writeOutcome(outcome({ summary: "implemented" }));
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "implement" }) },
        );
        b.script(
          (req, ctx) => {
            ctx.writeOutcome(
              outcome({ summary: "approved", verdict: "approve" }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "review" }) },
        );
      }
      const runtime = await makeRuntime(repo, goal, { a, b });
      await writeTask(runtime, task("alpha", { scope: ["alpha-area"] }));
      await writeTask(runtime, task("beta", { scope: ["beta-area"] }));

      const result = await runDispatch(runtime, { iteration: 1 });
      expect(result.reason).toBe("boundary");
      const state = derive(
        await runtime.store.listTasks(),
        await runtime.store.listRecords(),
        runtime.configs.process.flows,
      );
      expect(state.tasks.alpha!.status).toBe("merged");
      expect(state.tasks.beta!.status).toBe("merged");

      // Alpha's implement fell back to b; beta's started there.
      expect(a.calls).toHaveLength(1);
      expect(b.calls).toHaveLength(4);
      expect(resolveRole(runtime, "implementer").harness.id).toBe("b");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
