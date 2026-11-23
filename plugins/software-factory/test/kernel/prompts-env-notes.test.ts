import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  FakeHarness,
  fakeTurnIdentity,
  fakeTurnResult,
} from "../../src/harness/fake/index.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

const SLUGS = ["alpha", "beta", "gamma"] as const;

/** Each implementer writes its task's file; every review approves. */
function scriptTurns(harness: FakeHarness): void {
  for (const slug of SLUGS)
    harness.script(
      (req, ctx) => {
        fs.writeFileSync(
          path.join(req.cwd!, `${slug}.txt`),
          `${slug}\n`,
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: `${slug} implemented` }));
        return fakeTurnResult(req);
      },
      { when: whenTurn({ slug, step: "implement" }) },
    );
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "review" }) },
  );
}

/** Two tasks with distinct notes and one with none, dispatched together. */
async function dispatchThreeTasks() {
  const { repo, goal } = setupFlowRepo();
  const harness = new FakeHarness({ id: "fake" });
  scriptTurns(harness);
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(
    runtime,
    task("alpha", {
      scope: ["alpha.txt"],
      envNotes: [
        "bun install needs the network",
        "alpha.test.ts flakes on its first run",
      ],
    }),
  );
  await writeTask(
    runtime,
    task("beta", {
      scope: ["beta.txt"],
      envNotes: ["beta gate needs a free port"],
    }),
  );
  await writeTask(runtime, task("gamma", { scope: ["gamma.txt"] }));
  await runDispatch(runtime, { iteration: 1 });
  return { repo, harness };
}

function promptsFor(harness: FakeHarness, step: string): string[] {
  return harness.calls
    .filter((call) => fakeTurnIdentity(call).step === step)
    .map((call) => call.prompt);
}

/** The prompt whose turn block names the task's file. */
function promptFor(prompts: string[], slug: string): string {
  const prompt = prompts.find((text) => text.includes(`tasks/${slug}.md`));
  if (prompt === undefined)
    throw new Error(`no implementer prompt for "${slug}"`);
  return prompt;
}

describe("task environment notes", () => {
  it("renders each task's own notes in its implementer prompt, never the reviewer's", async () => {
    const { repo, harness } = await dispatchThreeTasks();
    try {
      const implementer = promptsFor(harness, "implement");
      expect(implementer).toHaveLength(SLUGS.length);
      const alpha = promptFor(implementer, "alpha");
      expect(alpha).toContain("## Environment notes");
      expect(alpha).toContain("- bun install needs the network");
      expect(alpha).toContain("- alpha.test.ts flakes on its first run");
      expect(alpha).not.toContain("beta gate needs a free port");
      expect(alpha.indexOf("## Environment notes")).toBeLessThan(
        alpha.indexOf("## This turn"),
      );
      const beta = promptFor(implementer, "beta");
      expect(beta).toContain("- beta gate needs a free port");
      expect(beta).not.toContain("bun install needs the network");
      expect(promptFor(implementer, "gamma")).not.toContain(
        "## Environment notes",
      );

      const reviews = promptsFor(harness, "review");
      expect(reviews).toHaveLength(SLUGS.length);
      for (const review of reviews)
        expect(review).not.toContain("## Environment notes");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
