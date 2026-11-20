// biome-ignore-all lint/complexity: backend config matrix
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  loadConfigs,
  repoConfigSchema,
  resolveGoalPaths,
} from "../../src/kernel/config.js";
import {
  createArtifactStore,
  isPrivateArtifact,
} from "../../src/kernel/store-backend.js";
import type { ArtifactBackend } from "../../src/kernel/types.js";
import { initGoal } from "../../src/cli/commands.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";
import {
  BACKENDS,
  bareFiles,
  gitIn,
  makeBackendGoal,
  removeGoal,
  tempGoalPaths,
  tracked,
} from "./backend-helpers.js";

describe("artifact backend config", () => {
  it("parses each backend by name and defaults to the plain folder", () => {
    expect(repoConfigSchema.parse({}).artifacts).toBeUndefined();
    for (const backend of BACKENDS) {
      expect(
        repoConfigSchema.parse({ artifacts: { backend } }).artifacts,
      ).toEqual({ backend });
    }
  });

  it("rejects a remote on a non-git backend and an unknown backend", () => {
    expect(() =>
      repoConfigSchema.parse({
        artifacts: { backend: "same-repo", remote: "../bare.git" },
      }),
    ).toThrow();
    expect(() =>
      repoConfigSchema.parse({ artifacts: { backend: "s3" } }),
    ).toThrow();
  });

  it("keeps same-repo inside the repository and git-repo outside it", () => {
    const repo = createTmpRepo();
    try {
      const write = (backend: ArtifactBackend, root: string) => {
        repo.writeFile(
          ".factory/repo.yaml",
          `baseBranch: main\nartifactRoot: .factory/artifacts\nartifacts: { backend: ${backend}, root: ${JSON.stringify(root)} }\n`,
        );
        return loadConfigs(repo.dir);
      };
      expect(() =>
        resolveGoalPaths(
          write("same-repo", path.join(repo.dir, "..", "outside")),
          repo.dir,
          "demo",
        ),
      ).toThrow(/inside the repository/);
      expect(() =>
        resolveGoalPaths(
          write("git-repo", ".factory/separate"),
          repo.dir,
          "demo",
        ),
      ).toThrow(/outside the repository/);

      const inside = resolveGoalPaths(
        write("same-repo", ".factory/artifacts"),
        repo.dir,
        "demo",
      );
      expect(inside.artifacts).toEqual({
        backend: "same-repo",
        root: path.join(repo.dir, ".factory/artifacts"),
      });
      expect(inside.goalDir).toBe(
        path.join(repo.dir, ".factory/artifacts/demo"),
      );

      const separate = resolveGoalPaths(
        write("git-repo", "../artifact-store"),
        repo.dir,
        "demo",
      );
      expect(separate.artifacts.backend).toBe("git-repo");
      expect(separate.artifacts.root).toBe(
        path.resolve(repo.dir, "..", "artifact-store"),
      );
      expect(separate.goalDir.startsWith(repo.dir)).toBe(false);
    } finally {
      repo.cleanup();
    }
  });

  it("keeps sessions, logs and raw agent I/O out of artifact history", () => {
    for (const rel of [
      "sessions/launch/raw.jsonl",
      "logs/kernel.log",
      "raw/prompt.txt",
      "iterations/1/transcript.jsonl",
      "tasks/.tmp/partial",
    ]) {
      expect(isPrivateArtifact(rel)).toBe(true);
    }
    for (const rel of [
      "tasks/alpha.md",
      "records/00001-i1-alpha-implement-r1/outcome.yaml",
      "iterations/1/summary.md",
    ]) {
      expect(isPrivateArtifact(rel)).toBe(false);
    }
  });

  it("commits a same-repo write and leaves a folder write uncommitted", async () => {
    const folder = await makeBackendGoal("folder");
    const sameRepo = await makeBackendGoal("same-repo");
    try {
      const folderStore = createArtifactStore(tempGoalPaths(folder.repo), {});
      const sameRepoStore = createArtifactStore(
        tempGoalPaths(sameRepo.repo),
        {},
      );
      await folderStore.writeFile("notes.txt", "folder\n");
      await sameRepoStore.writeFile("notes.txt", "same-repo\n");
      expect(folderStore.committed()).toEqual([]);
      expect(sameRepoStore.committed().length).toBeGreaterThan(0);
      expect(tracked(sameRepo.repo)).toContain(
        ".factory/artifacts/demo/notes.txt",
      );
      expect(tracked(folder.repo)).not.toContain(
        ".factory/artifacts/demo/notes.txt",
      );
    } finally {
      removeGoal(folder);
      removeGoal(sameRepo);
    }
  }, 60_000);

  it("places a folder backend outside the repository when its root says so", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "factory-outside-"));
    const repo = createTmpRepo();
    try {
      repo.writeFile(
        ".factory/repo.yaml",
        `baseBranch: main\nartifactRoot: .factory/artifacts\nartifacts: { backend: folder, root: ${JSON.stringify(outside)} }\n`,
      );
      repo.commit("factory config");
      const configs = loadConfigs(repo.dir);
      const paths = resolveGoalPaths(configs, repo.dir, "demo");
      expect(paths.artifacts).toEqual({ backend: "folder", root: outside });
      expect(paths.goalDir).toBe(path.join(outside, "demo"));
      const store = createArtifactStore(paths, configs.process.taskTypes);
      await store.ensureLayout();
      await store.writeFile("intent.md", "# Goal\n");
      expect(fs.existsSync(path.join(outside, "demo/intent.md"))).toBe(true);
      expect(tracked(repo, ".factory/artifacts")).toEqual([]);
      expect(repo.git(["status", "--porcelain"]).stdout).toBe("");
    } finally {
      repo.cleanup();
      fs.rmSync(outside, { recursive: true, force: true });
    }
  }, 60_000);

  it("puts a git-repo store outside the repo by default", () => {
    const repo = createTmpRepo();
    try {
      repo.writeFile(
        ".factory/repo.yaml",
        "baseBranch: main\nartifactRoot: .factory/artifacts\nartifacts: { backend: git-repo }\n",
      );
      const paths = resolveGoalPaths(loadConfigs(repo.dir), repo.dir, "demo");
      expect(paths.artifacts.root).toBe(
        path.join(paths.worktreeRoot, "artifacts"),
      );
      expect(paths.goalDir.startsWith(repo.dir)).toBe(false);
    } finally {
      repo.cleanup();
    }
  });

  it("does not sweep an operator's staged work into a same-repo artifact commit", async () => {
    const goal = await makeBackendGoal("same-repo");
    try {
      goal.repo.writeFile("operator.txt", "operator\n");
      goal.repo.git(["add", "operator.txt"]);
      goal.repo.writeFile("README.md", "# Test Repository\n\noperator edit\n");
      const store = createArtifactStore(tempGoalPaths(goal.repo), {});
      await store.writeFile("notes.txt", "store\n");
      const head = goal.repo.git(["ls-tree", "-r", "--name-only", "HEAD"]);
      expect(head.stdout).not.toContain("operator.txt");
      expect(
        goal.repo.git(["diff", "--cached", "--name-only"]).stdout,
      ).toContain("operator.txt");
      expect(goal.repo.git(["status", "--porcelain"]).stdout).toContain(
        " M README.md",
      );
    } finally {
      removeGoal(goal);
    }
  }, 60_000);

  it("creates a local-only git-repo store without a remote", async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "factory-local-repo-"));
    const storeRoot = path.join(temp, "store");
    const repo = createTmpRepo();
    try {
      repo.writeFile(
        ".factory/repo.yaml",
        `baseBranch: main\nartifactRoot: .factory/artifacts\nartifacts: { backend: git-repo, root: ${JSON.stringify(storeRoot)} }\n`,
      );
      repo.commit("factory config");
      const store = createArtifactStore(tempGoalPaths(repo), {});
      await store.ensureLayout();
      await store.writeFile("notes.txt", "local\n");
      expect(store.committed().length).toBeGreaterThan(0);
      expect(gitIn(storeRoot, ["remote"])).toBe("");
      expect(
        gitIn(storeRoot, ["ls-tree", "-r", "--name-only", "HEAD"]),
      ).toContain("demo/notes.txt");
    } finally {
      repo.cleanup();
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }, 60_000);

  it("initialises a goal inside a separate artifact repository", async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "factory-init-repo-"));
    const bare = path.join(temp, "artifacts.git");
    const storeRoot = path.join(temp, "store");
    execFileSync("git", ["init", "--bare", "-b", "main", bare], {
      stdio: "ignore",
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
    });
    const repo = createTmpRepo();
    try {
      repo.writeFile(
        ".factory/repo.yaml",
        `baseBranch: main\nartifactRoot: .factory/artifacts\nartifacts: { backend: git-repo, root: ${JSON.stringify(storeRoot)}, remote: ${JSON.stringify(bare)} }\n`,
      );
      repo.commit("factory config");
      const intent = path.join(temp, "intent.md");
      fs.writeFileSync(intent, "# Goal\n\nCreate alpha.\n", "utf8");
      const created = await initGoal({
        repo: repo.dir,
        goal: "demo",
        intent,
      });
      expect(created.intentCreated).toBe(true);
      expect(created.goalDir).toBe(path.join(storeRoot, "demo"));
      expect(
        fs.readFileSync(path.join(created.goalDir, "intent.md"), "utf8"),
      ).toBe("# Goal\n\nCreate alpha.\n");
      expect(bareFiles(bare)).toContain("demo/intent.md");
    } finally {
      repo.cleanup();
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }, 60_000);

  it("replaces the folder backend's ignore when the repo switches to same-repo", async () => {
    const goal = await makeBackendGoal("folder");
    try {
      expect(
        fs.readFileSync(
          path.join(goal.repo.dir, ".factory/artifacts/.gitignore"),
          "utf8",
        ),
      ).toContain("*");
      goal.repo.writeFile(
        ".factory/repo.yaml",
        "baseBranch: main\nartifactRoot: .factory/artifacts\nartifacts: { backend: same-repo }\n",
      );
      const store = createArtifactStore(tempGoalPaths(goal.repo), {});
      await store.ensureLayout();
      await store.writeFile("notes.txt", "same-repo\n");
      expect(
        fs.readFileSync(
          path.join(goal.repo.dir, ".factory/artifacts/.gitignore"),
          "utf8",
        ),
      ).toContain("sessions/");
      expect(tracked(goal.repo)).toContain(".factory/artifacts/demo/notes.txt");
    } finally {
      removeGoal(goal);
    }
  }, 60_000);

  it("fails a git-repo write loudly when the remote is gone", async () => {
    const goal = await makeBackendGoal("git-repo");
    try {
      fs.rmSync(goal.bare!, { recursive: true, force: true });
      const store = createArtifactStore(tempGoalPaths(goal.repo), {});
      await expect(store.writeFile("notes.txt", "unpushed\n")).rejects.toThrow(
        /push/i,
      );
    } finally {
      removeGoal(goal);
    }
  }, 60_000);
});
