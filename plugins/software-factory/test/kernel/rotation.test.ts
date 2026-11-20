// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { resolveTurn } from "../../src/kernel/flow-context.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

function tiers(runtime: KernelRuntime, iteration?: number) {
  return resolveTurn(
    runtime,
    "implementer",
    "implementer",
    undefined,
    iteration,
  ).tiers.map((tier) => [tier.harness.id, tier.model.id, tier.effort]);
}

describe("alias rotation", () => {
  it("resolves iteration N to rotate[N % length] and defaults fallbacks to the rotated entry", async () => {
    const { repo, goal } = setupFlowRepo({
      aliases: {
        implementer: {
          harness: "a",
          model: "ma-base",
          effort: "low",
          rotate: [
            { harness: "a", model: "ma-zero" },
            { harness: "b", model: "mb-one", effort: "high" },
          ],
          fallbacks: [{ model: "m-fallback", effort: "low" }],
        },
      },
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        a: new FakeHarness({ id: "a" }),
        b: new FakeHarness({ id: "b" }),
      });

      expect(tiers(runtime, 1)).toEqual([
        ["b", "mb-one", "high"],
        ["b", "m-fallback", "low"],
      ]);
      expect(tiers(runtime, 2)).toEqual([
        ["a", "ma-zero", "low"],
        ["a", "m-fallback", "low"],
      ]);
      // The cycle wraps: 3 % 2 selects entry 1 again.
      expect(tiers(runtime, 3)).toEqual(tiers(runtime, 1));
      // Without an iteration the alias keeps its own primary.
      expect(tiers(runtime)).toEqual([
        ["a", "ma-base", "low"],
        ["a", "m-fallback", "low"],
      ]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("dispatches two iterations onto two harnesses recorded on one alias", async () => {
    const { repo, goal } = setupFlowRepo({
      limits: { concurrency: { overall: 1 } },
      aliases: {
        architect: { harness: "a", model: "ma-arch" },
        pm: { harness: "a", model: "ma-pm" },
        reviewer: { harness: "a", model: "ma-review" },
        steward: { harness: "a", model: "ma-steward" },
        "plan-checker": { harness: "a", model: "ma-check" },
        "plan-reviewer": { harness: "a", model: "ma-plan-review" },
        "pack-preparer": { harness: "a", model: "ma-pack-prep" },
        implementer: {
          harness: "a",
          model: "ma-base",
          rotate: [
            { harness: "a", model: "ma-zero" },
            { harness: "b", model: "mb-one" },
          ],
        },
      },
    });
    try {
      const a = new FakeHarness({ id: "a" });
      const b = new FakeHarness({ id: "b" });
      for (const harness of [a, b]) {
        harness.script(
          (req, ctx) => {
            const slug = fakeTurnIdentity(req).slug!;
            fs.writeFileSync(
              path.join(req.cwd!, `${slug}.txt`),
              `${slug}\n`,
              "utf8",
            );
            ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "implement" }), fallback: true },
        );
        harness.script(
          (req, ctx) => {
            ctx.writeOutcome(
              outcome({ summary: "approved", verdict: "approve" }),
            );
            return fakeTurnResult(req);
          },
          { when: whenTurn({ step: "review" }), fallback: true },
        );
      }
      const runtime = await makeRuntime(repo, goal, { a, b });

      await writeTask(runtime, task("alpha", { scope: ["alpha.txt"] }));
      expect((await runDispatch(runtime, { iteration: 1 })).reason).toBe(
        "boundary",
      );
      await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
      expect((await runDispatch(runtime, { iteration: 2 })).reason).toBe(
        "boundary",
      );

      const implementRecords = (await runtime.store.listRecords())
        .filter(
          (record) =>
            record.alias === "implementer" &&
            record.actor === "agent" &&
            record.step === "implement" &&
            record.endedAt,
        )
        .sort((left, right) => left.iteration - right.iteration);
      expect(
        implementRecords.map((record) => [
          record.iteration,
          record.attempts?.[0]?.harness,
          record.model?.id,
        ]),
      ).toEqual([
        [1, "b", "mb-one"],
        [2, "a", "ma-zero"],
      ]);
      expect(
        a.calls
          .filter((call) => fakeTurnIdentity(call).step === "implement")
          .map((call) => call.model.id),
      ).toEqual(["ma-zero"]);
      expect(
        b.calls
          .filter((call) => fakeTurnIdentity(call).step === "implement")
          .map((call) => call.model.id),
      ).toEqual(["mb-one"]);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
