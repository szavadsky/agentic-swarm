import { expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  type FakeHarness,
  type FakeTurnHandler,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import type { derive } from "../../src/kernel/derive.js";
import { parseTaskFile, renderTaskFile } from "../../src/kernel/tasks.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import {
  type makeRuntime,
  outcome,
  type setupFlowRepo,
  whenTurn,
} from "./s2-helpers.js";

export function bumpRevision(
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
  slug: string,
): void {
  const file = path.join(runtime.store.tasksDir, `${slug}.md`);
  const current = parseTaskFile(fs.readFileSync(file, "utf8"), slug);
  fs.writeFileSync(
    file,
    renderTaskFile({
      ...current,
      revision: current.revision + 1,
      body: `${current.body}\nKeep the kept work and finish it.`,
    }),
    "utf8",
  );
}

export function scriptMovedHeadTurns(
  harness: FakeHarness,
  onAmendedPrompt: (prompt: string) => void,
): void {
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "clash.txt"), "beta\n", "utf8");
      ctx.writeOutcome(
        outcome({ status: "failed", summary: "beta left the clash open" }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta", step: "implement" }) },
  );
  harness.script(
    (req, ctx) => {
      onAmendedPrompt(req.prompt);
      // The head moved while beta was parked; the first turn merges it
      // and asks for the conflict to be settled in this turn.
      expect(req.prompt).toContain("Conflicted files: clash.txt");
      fs.writeFileSync(
        path.join(req.cwd!, "clash.txt"),
        "beta\nzeta\n",
        "utf8",
      );
      fs.writeFileSync(path.join(req.cwd!, "beta.txt"), "beta\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "beta resolved the clash" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "beta", step: "implement" }) },
  );
}

/** Scripts zeta's implement turn and both approvals. */
export function scriptZetaAndReviews(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      fs.writeFileSync(path.join(req.cwd!, "zeta.txt"), "zeta\n", "utf8");
      fs.writeFileSync(path.join(req.cwd!, "clash.txt"), "zeta\n", "utf8");
      ctx.writeOutcome(outcome({ summary: "zeta implemented" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ slug: "zeta", step: "implement" }) },
  );
  const approve: FakeTurnHandler = (req, ctx) => {
    ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
    return fakeTurnResult(req);
  };
  harness.script(approve, { when: whenTurn({ step: "review" }) });
  harness.script(approve, { when: whenTurn({ step: "review" }) });
}

/** Scripts the PM's amend of beta and records the head it ran against. */
export function scriptMovedHeadAmend(
  harness: FakeHarness,
  runtime: Awaited<ReturnType<typeof makeRuntime>>,
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  onHead: (head: string) => void,
): void {
  harness.script(
    (req, ctx) => {
      onHead(repo.git(["rev-parse", "factory/demo"]).stdout.trim());
      bumpRevision(runtime, "beta");
      ctx.writeOutcome(
        outcome({
          summary: "amend beta",
          stallRoutes: [
            {
              slug: "beta",
              action: "amend",
              reason: "the kept clash resolution is worth keeping",
            },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );
}

/** Asserts the amended turn merged the head and resolved the clash in-turn. */
export function expectMovedHeadAmend(
  records: Awaited<ReturnType<KernelRuntime["store"]["listRecords"]>>,
  state: ReturnType<typeof derive>,
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  headAtAmend: string,
  amendedPrompt: string,
): void {
  expect(state.tasks.zeta!.status).toBe("merged");
  expect(state.tasks.beta!.status).toBe("merged");
  // The amended turn merged the head before it ran and judged the range
  // from that head.
  const amended = records
    .filter(
      (r) =>
        r.slug === "beta" &&
        r.step === "implement" &&
        r.actor === "agent" &&
        r.revision === 1,
    )
    .at(-1)!;
  expect(amended.base).toBe(headAtAmend);
  expect(amendedPrompt).toContain("Conflicted files: clash.txt");
  // The conflict was resolved in the turn, never parked.
  expect(
    records.some(
      (r) =>
        r.slug === "beta" &&
        r.step === "park" &&
        r.cause?.kind === "base-conflict",
    ),
  ).toBe(false);
  expect(repo.git(["show", "factory/demo:clash.txt"]).stdout.trim()).toBe(
    "beta\nzeta",
  );
}
