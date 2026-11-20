import { expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  type FakeHarness,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import type { derive } from "../../src/kernel/derive.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { outcome, type setupFlowRepo } from "./s2-helpers.js";

export interface SyncProbe {
  laterVisible: boolean;
  alphaVisible: boolean;
  carriedDiff: string[];
  reviewerSawHead: boolean;
}

/** Scripts the beta implement/review turns against the integration head. */
export function scriptSyncedHeadTurns(
  harness: FakeHarness,
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  integrationSha: string,
): SyncProbe {
  const probe: SyncProbe = {
    laterVisible: false,
    alphaVisible: false,
    carriedDiff: [],
    reviewerSawHead: false,
  };
  harness.script((req, ctx) => {
    probe.laterVisible = fs.existsSync(path.join(req.cwd!, "merged-since.txt"));
    probe.alphaVisible = fs.existsSync(path.join(req.cwd!, "alpha.txt"));
    probe.carriedDiff = repo
      .git(["diff", "--name-only", `${integrationSha}..HEAD`], {
        cwd: req.cwd!,
      })
      .stdout.split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
    ctx.writeOutcome(outcome({ summary: "beta on the synced head" }));
    return fakeTurnResult(req);
  });
  harness.script((req, ctx) => {
    probe.reviewerSawHead = req.prompt.includes(`${integrationSha}..`);
    ctx.writeOutcome(outcome({ summary: "beta approved", verdict: "approve" }));
    return fakeTurnResult(req);
  });
  return probe;
}

/** Asserts the continuation reviews from the synced head without rewriting alpha. */
export function expectSyncedContinuation(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  records: Awaited<ReturnType<KernelRuntime["store"]["listRecords"]>>,
  state: ReturnType<typeof derive>,
  probe: SyncProbe,
  integrationSha: string,
  alphaStart: string,
  alphaTip: string,
): void {
  const firstAgent = (slug: string) =>
    records
      .filter(
        (r) => r.slug === slug && r.step === "implement" && r.actor === "agent",
      )
      .sort((a, b) => a.seq - b.seq)[0];
  expect(state.tasks.beta!.status).toBe("merged");
  expect(probe.laterVisible).toBe(true);
  expect(probe.alphaVisible).toBe(true);
  expect(probe.carriedDiff).toEqual(["alpha.txt"]);
  expect(probe.reviewerSawHead).toBe(true);
  expect(firstAgent("beta")?.base).toBe(integrationSha);
  // A task without `base` still starts at the integration head of its dispatch.
  expect(firstAgent("alpha")?.base).toBe(alphaStart);
  // The parked branch is never rewritten, only the continuation branch moves.
  expect(repo.git(["rev-parse", "factory-task/demo/alpha"]).stdout.trim()).toBe(
    alphaTip,
  );
  expect(
    repo.git(["show", "factory/demo:merged-since.txt"]).stdout.trim(),
  ).toBe("later");
  expect(repo.git(["show", "factory/demo:beta.txt"]).stdout.trim()).toBe(
    "beta",
  );
}
