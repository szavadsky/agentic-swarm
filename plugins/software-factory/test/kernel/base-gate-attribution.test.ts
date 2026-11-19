import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { formatBaseGates } from "../../src/kernel/baseline.js";
import { runDispatch } from "../../src/kernel/dispatch.js";
import { preflight } from "../../src/kernel/preflight.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  writeTask,
} from "./s2-helpers.js";

describe("base gate status", () => {
  it("distinguishes no record from a green base", () => {
    expect(formatBaseGates(undefined)).toBe("not recorded");
    expect(
      formatBaseGates({ commit: "abcdef1234567890", ok: true, checks: [] }),
    ).toBe("base abcdef1234: green");
  });

  it("names a red base by commit and the failures that predate the task", () => {
    expect(
      formatBaseGates({
        commit: "abcdef1234567890",
        ok: false,
        checks: [
          {
            name: "package",
            ok: false,
            summary: "exit 1",
            output: "missing fixed.txt",
            fingerprint: "package:exit 1",
          },
        ],
      }),
    ).toBe(
      "base abcdef1234 was red before any task (pre-existing):\n### package: exit 1\nmissing fixed.txt",
    );
  });
});

describe("base gate attribution", () => {
  it("hands the implementer and the reviewer the base tree's recorded red", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "package", command: "test -f fixed.txt" }],
    });
    try {
      const harness = new FakeHarness({ id: "fake" });
      const runtime = await makeRuntime(repo, goal, { fake: harness });

      // Pre-flight records the red base once; tasks start from this tree.
      const pre = await preflight({
        configs: runtime.configs,
        paths: runtime.paths,
        store: runtime.store,
        harnesses: runtime.harnesses,
      });
      expect(pre.base?.ok).toBe(false);
      const baseCommit = pre.base!.commit;

      const prompts: string[] = [];
      // The gate stays red: the implementer adds work, not the fix.
      harness.script((req, ctx) => {
        prompts.push(req.prompt ?? "");
        fs.writeFileSync(
          path.join(req.cwd!, "feature.txt"),
          "feature\n",
          "utf8",
        );
        ctx.writeOutcome(outcome({ summary: "added feature.txt" }));
        return fakeTurnResult(req);
      });
      harness.script((req, ctx) => {
        prompts.push(req.prompt ?? "");
        ctx.writeOutcome(outcome({ summary: "approved", verdict: "approve" }));
        return fakeTurnResult(req);
      });

      await writeTask(runtime, task("task", { scope: ["feature.txt"] }));
      await runDispatch(runtime, { iteration: 1 });

      expect(prompts).toHaveLength(2);
      const recorded = `base ${baseCommit.slice(0, 10)} was red before any task (pre-existing):`;
      for (const prompt of prompts) {
        expect(prompt).toContain(recorded);
        expect(prompt).toContain("### package: exit 1");
      }
      expect(prompts[1]).toContain(
        'a claimed "pre-existing" failure is a finding unless this record lists it',
      );
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
