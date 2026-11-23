import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { dispatch } from "../../src/cli/dispatch.js";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { loadCanaryProven } from "../../src/kernel/canary.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";

function canaryRepo(): {
  repo: ReturnType<typeof createTmpRepo>;
  worktreeRoot: string;
} {
  const repo = createTmpRepo();
  const base = path.basename(repo.dir);
  repo.writeFile(
    ".factory/repo.yaml",
    yaml.stringify({ baseBranch: "main", artifactRoot: ".factory/artifacts" }),
  );
  repo.writeFile(
    ".factory/run.yaml",
    [
      "aliases:",
      "  implementer: { harness: fake, model: fake-impl }",
      "  architect: { harness: fake, model: fake-architect }",
      "  pm: { harness: fake, model: fake-pm }",
      "  digest: { harness: fake, model: fake-digest }",
      "  researcher: { harness: fake, model: fake-research }",
      "  reviewer: { harness: fake, model: fake-review }",
      "  qa: { harness: fake, model: fake-qa }",
      "  steward: { harness: fake, model: fake-steward }",
      "  plan-checker: { harness: fake, model: fake-check }",
      "  intent: { harness: fake, model: fake-intent }",
      "  plan-reviewer: { harness: fake, model: fake-plan-review }",
      "  pack-preparer: { harness: fake, model: fake-pack-prep }",
      "limits: { iterations: 1, concurrency: { overall: 1 } }",
      `worktreeRoot: ../${base}-wt`,
      `sessions: { dir: ../${base}-sessions, keepRuns: 1 }`,
      "",
    ].join("\n"),
  );
  repo.commit("factory config");
  const goalDir = path.join(repo.dir, ".factory/artifacts", "canary");
  fs.mkdirSync(goalDir, { recursive: true });
  fs.writeFileSync(
    path.join(goalDir, "intent.md"),
    "# Goal\n\nTest goal.\n",
    "utf8",
  );
  return {
    repo,
    worktreeRoot: path.resolve(
      repo.dir,
      "..",
      `${base}-wt`,
      ".fake-worktree-id",
    ),
  };
}

function passingFake(id: string): FakeHarness {
  const harness = new FakeHarness({ id });
  harness.script(async (req) => fakeTurnResult(req), { fallback: true });
  return harness;
}

describe("factory canary", () => {
  registerCanaryPass();
  registerCanaryFail();
  registerCanaryAlias();
  registerCanaryHelp();
  registerCanaryRejection();
});

function registerCanaryPass(): void {
  it("records a pass where rotation reads it, and proves the combination", async () => {
    const { repo } = canaryRepo();
    try {
      const harness = passingFake("fake");
      const original = console.log;
      const lines: string[] = [];
      console.log = (msg: string) => lines.push(msg);
      try {
        const code = await dispatch(
          ["canary", "--repo", repo.dir, "--goal", "canary", "fake/fake-impl"],
          {
            harnesses: { fake: harness },
          },
        );
        expect(code).toBe(0);
        expect(lines.join("\n")).toContain("canary fake/fake-impl: pass");
        expect(harness.calls).toHaveLength(2);
      } finally {
        console.log = original;
      }
      const base = path.basename(repo.dir);
      const sessionsDir = path.resolve(repo.dir, "..", `${base}-sessions`);
      const proven = await loadCanaryProven({ sessionsDir });
      expect(proven).toContain("fake+fake-impl");
      expect(proven).not.toContain("fake+fake-architect");
    } finally {
      repo.cleanup();
    }
  }, 60_000);
}

function registerCanaryFail(): void {
  it("fails with non-zero exit and leaves the combination unproven", async () => {
    const { repo } = canaryRepo();
    try {
      const harness = new FakeHarness({ id: "fake" });
      harness.script(
        async (req) =>
          fakeTurnResult(req, {
            stop: {
              kind: "infra",
              cause: "quota",
              details: "quota",
            } as never,
          }),
        { fallback: true },
      );
      const originalErr = console.error;
      const errors: string[] = [];
      console.error = (msg: string) => errors.push(msg);
      try {
        const code = await dispatch(
          ["canary", "--repo", repo.dir, "--goal", "canary", "fake/fake-impl"],
          {
            harnesses: { fake: harness },
          },
        );
        expect(code).toBe(1);
        expect(errors.join("\n")).toContain("canary fake/fake-impl: fail");
      } finally {
        console.error = originalErr;
      }
      const base = path.basename(repo.dir);
      const sessionsDir = path.resolve(repo.dir, "..", `${base}-sessions`);
      const proven = await loadCanaryProven({ sessionsDir });
      expect(proven).not.toContain("fake+fake-impl");
    } finally {
      repo.cleanup();
    }
  }, 60_000);
}

function registerCanaryAlias(): void {
  it("supports --alias and --bigger for architect legs", async () => {
    const { repo } = canaryRepo();
    try {
      const harness = passingFake("fake");
      const original = console.log;
      const lines: string[] = [];
      console.log = (msg: string) => lines.push(msg);
      try {
        const code = await dispatch(
          [
            "canary",
            "--repo",
            repo.dir,
            "--goal",
            "canary",
            "--alias",
            "architect",
            "bigger",
          ],
          { harnesses: { fake: harness } },
        );
        expect(code).toBe(0);
        expect(lines.join("\n")).toContain("canary fake/fake-architect: pass");
        expect(
          harness.calls.map((c) => (c.prompt as string).split(" ")[1]),
        ).toEqual(["trivial", "task", "bigger"]);
      } finally {
        console.log = original;
      }
    } finally {
      repo.cleanup();
    }
  }, 60_000);
}

function registerCanaryHelp(): void {
  it("documents the canary command in help", async () => {
    const original = console.log;
    const lines: string[] = [];
    console.log = (msg: string) => lines.push(msg);
    try {
      const code = await dispatch(["canary", "--help"]);
      expect(code).toBe(0);
      expect(lines.join("\n")).toContain("factory canary <harness/model>");
    } finally {
      console.log = original;
    }
  });
}

function registerCanaryRejection(): void {
  it("exits non-zero when no combination is named", async () => {
    const { repo } = canaryRepo();
    try {
      const original = console.error;
      const errors: string[] = [];
      console.error = (msg: string) => errors.push(msg);
      try {
        const code = await dispatch(["canary", "--repo", repo.dir], {
          harnesses: { fake: passingFake("fake") },
        });
        expect(code).toBe(1);
        expect(errors.join("\n")).toContain(
          "canary requires a <harness/model> combination or --alias <name>",
        );
      } finally {
        console.error = original;
      }
    } finally {
      repo.cleanup();
    }
  }, 60_000);
}
