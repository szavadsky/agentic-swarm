// biome-ignore-all lint/complexity: split-rest
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { dispatch, parseCliArgs } from "../../src/cli/dispatch.js";
import {
  acquireRunLock,
  getRunLockPath,
  isRunLockFree,
  resolveRuntimeDir,
} from "../../src/cli/lock.js";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { testPriceSource } from "../helpers/price-source.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

function conflictingBaseRepo(): TmpRepo {
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
      "  architect: { harness: fake, model: fake-architect }",
      "  pm: { harness: fake, model: fake-pm }",
      "  digest: { harness: fake, model: fake-digest }",
      "  implementer: { harness: fake, model: fake-impl }",
      "  implementer-b: { harness: fake, model: fake-impl-b }",
      "  researcher: { harness: fake, model: fake-research }",
      "  reviewer: { harness: fake, model: fake-review }",
      "  steward: { harness: fake, model: fake-steward }",
      "  plan-checker: { harness: fake, model: fake-check }",
      "  plan-reviewer: { harness: fake, model: fake-plan-review }",
      "  pack-preparer: { harness: fake, model: fake-pack-prep }",
      "limits: { iterations: 1, concurrency: { overall: 1 } }",
      `worktreeRoot: ../${base}-wt`,
      `sessions: { dir: ../${base}-sessions, keepRuns: 1 }`,
      "",
    ].join("\n"),
  );
  repo.commit("factory config");

  // The integration branch and base diverge on the same file.
  repo.git(["checkout", "-b", "factory/demo"]);
  repo.writeFile("shared.txt", "integration\n");
  repo.commit("factory: merge task");
  repo.git(["checkout", "main"]);
  repo.writeFile("shared.txt", "base\n");
  repo.commit("base edit");

  const goalDir = path.join(repo.dir, ".factory/artifacts", "demo");
  fs.mkdirSync(goalDir, { recursive: true });
  fs.writeFileSync(
    path.join(goalDir, "intent.md"),
    "# Goal\n\nTest goal.\n",
    "utf8",
  );
  return repo;
}

describe("CLI dispatch", () => {
  it("parses global flags and the positional command", () => {
    expect(
      parseCliArgs([
        "run",
        "--repo",
        "/tmp/x",
        "--iterations=2",
        "--goal",
        "g",
      ]),
    ).toEqual({
      command: "run",
      repo: "/tmp/x",
      goal: "g",
      iterations: 2,
      runConfig: undefined,
      help: false,
      version: false,
    });
    expect(parseCliArgs(["--help"]).help).toBe(true);
    expect(parseCliArgs(["-v"]).version).toBe(true);
    expect(parseCliArgs(["schemas", "--out=/tmp/editor"]).out).toBe(
      "/tmp/editor",
    );
  });

  it("documents the run command in help", async () => {
    const original = console.log;
    const lines: string[] = [];
    console.log = (msg: string) => lines.push(msg);
    try {
      expect(await dispatch(["run", "--help"])).toBe(0);
      expect(lines.join("\n")).toContain(
        "factory run --repo <path> --goal <name>",
      );
    } finally {
      console.log = original;
    }
  });

  it("prints help when called without a command", async () => {
    const original = console.log;
    const lines: string[] = [];
    console.log = (msg: string) => lines.push(msg);
    try {
      expect(await dispatch([])).toBe(0);
      expect(lines.join("\n")).toContain("software-factory");
    } finally {
      console.log = original;
    }
  });

  it("rejects unknown commands", async () => {
    const originalErr = console.error;
    const originalLog = console.log;
    const errors: string[] = [];
    console.error = (msg: string) => errors.push(msg);
    console.log = () => {};
    try {
      expect(await dispatch(["nope"])).toBe(1);
      expect(errors.join("\n")).toContain('unknown command "nope"');
    } finally {
      console.error = originalErr;
      console.log = originalLog;
    }
  });

  it("prints the launch cause when a base follow stops the run", async () => {
    const repo = conflictingBaseRepo();
    try {
      const originalLog = console.log;
      const originalWarn = console.warn;
      const lines: string[] = [];
      console.log = (...args: unknown[]) =>
        lines.push(args.map(String).join(" "));
      console.warn = () => {};
      let code: number;
      try {
        code = await dispatch(["run", "--repo", repo.dir, "--goal", "demo"], {
          harnesses: { fake: new FakeHarness({ id: "fake" }) },
          priceSource: testPriceSource(repo.dir),
        });
      } finally {
        console.log = originalLog;
        console.warn = originalWarn;
      }
      expect(code!).toBe(1);
      expect(lines.join("\n")).toContain("stop=infra");
      expect(lines.join("\n")).toContain('cause: base "main" conflicts');
      expect(lines.join("\n")).toContain("shared.txt");
    } finally {
      repo.cleanup();
    }
  }, 60_000);
});

describe("Run lock", () => {
  let repo: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "factory-lock-"));
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("resolves the runtime directory outside the checkout", () => {
    const runtimeDir = resolveRuntimeDir(repo, "../wt-test");
    expect(runtimeDir).toBe(
      path.resolve(repo, "../wt-test", ".factory-runtime"),
    );
  });

  it("defaults the worktree root to a sibling named for the repository", () => {
    const runtimeDir = resolveRuntimeDir(repo);
    expect(runtimeDir).toBe(
      path.join(
        path.dirname(repo),
        `wt-${path.basename(repo)}`,
        ".factory-runtime",
      ),
    );
    expect(runtimeDir.startsWith(repo + path.sep)).toBe(false);
  });

  it("relocates a worktree root inside the checkout beside it", () => {
    const runtimeDir = resolveRuntimeDir(repo, path.join(repo, "inside"));
    expect(runtimeDir).toBe(
      path.join(
        path.dirname(repo),
        `wt-${path.basename(repo)}`,
        ".factory-runtime",
      ),
    );
    expect(runtimeDir.startsWith(repo + path.sep)).toBe(false);
  });

  it("is exclusive while held and free after release", () => {
    const task = "t1";
    const lockPath = getRunLockPath(repo, task, {
      runtimeDir: path.join(repo, "rt"),
    });
    expect(
      isRunLockFree(repo, task, { runtimeDir: path.join(repo, "rt") }).free,
    ).toBe(true);

    const handle = acquireRunLock(repo, task, {
      runtimeDir: path.join(repo, "rt"),
    });
    expect(handle).not.toBeNull();
    expect(fs.existsSync(lockPath)).toBe(true);
    expect(
      isRunLockFree(repo, task, { runtimeDir: path.join(repo, "rt") }).free,
    ).toBe(false);
    expect(
      acquireRunLock(repo, task, { runtimeDir: path.join(repo, "rt") }),
    ).toBeNull();

    handle!.release();
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(
      isRunLockFree(repo, task, { runtimeDir: path.join(repo, "rt") }).free,
    ).toBe(true);
  });

  it("takes over a stale lock from a dead pid on this host", () => {
    const runtimeDir = path.join(repo, "rt");
    const lockPath = getRunLockPath(repo, "t2", { runtimeDir });
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: 999_999_999,
        host: os.hostname(),
        start: new Date(0).toISOString(),
      }),
    );

    const handle = acquireRunLock(repo, "t2", { runtimeDir });
    expect(handle).not.toBeNull();
    const data = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    expect(data.pid).toBe(process.pid);
    handle!.release();
  });
});
