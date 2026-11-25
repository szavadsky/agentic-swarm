import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runValidate } from "../helpers/validate.js";

const PACKAGE_ROOT = path.join(import.meta.dir, "..", "..");
const SCRIPT = path.join(PACKAGE_ROOT, "src", "schema-check.ts");

interface Run {
  code: number;
  output: string;
}

function run(cwd: string, env: Record<string, string | undefined>): Run {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) merged[key] = value;
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  const result = spawnSync("bun", [SCRIPT], {
    cwd,
    encoding: "utf8",
    env: merged,
  });
  return {
    code: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

/**
 * A fake ops repo: `.factory` state beside a package checkout. Each case
 * writes one invalid schema-enforced file and expects the gate to fail
 * naming it; the valid fixture expects a green run.
 */
let root: string;

function write(rel: string, content: string): void {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function factory(rel: string): string {
  return path.join(root, ".factory", rel);
}

const VALID_TASK = `---
slug: demo.task
title: Demo task
kind: task
flow: implement-review
deps: []
scope:
  - "src/**"
---

done when: the demo works
`;

const TYPED_TASK = `---
slug: demo.task
title: Demo task
type: spike
deps: []
scope:
  - "src/**"
---

done when: the demo works
`;

const VALID_OUTCOME = "status: done\nsummary: landed\n";
const VALID_HOLD = "slugs: [demo.task]\ngoal: false\n";

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "schema-validation-"));
  write(".factory/repo.yaml", "baseBranch: main\n");
  write(".factory/run.yaml", "aliases: {}\n");
  write(".factory/artifacts/demo/tasks/demo.task.md", VALID_TASK);
  write(".factory/artifacts/demo/class.yaml", "class: task\nslug: demo.task\n");
  write(".factory/artifacts/demo/mailbox/holds/steer-1.yaml", VALID_HOLD);
  write(
    ".factory/artifacts/demo/records/00001-i1-demo.task-implement-r1/outcome.yaml",
    VALID_OUTCOME,
  );
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function freshCase(mutate?: () => void): void {
  fs.rmSync(path.join(root, ".factory"), { recursive: true, force: true });
  fs.rmSync(path.join(root, "bootstrap"), { recursive: true, force: true });
  write(".factory/repo.yaml", "baseBranch: main\n");
  write(".factory/run.yaml", "aliases: {}\n");
  write(".factory/artifacts/demo/tasks/demo.task.md", VALID_TASK);
  write(".factory/artifacts/demo/class.yaml", "class: task\nslug: demo.task\n");
  write(".factory/artifacts/demo/mailbox/holds/steer-1.yaml", VALID_HOLD);
  write(
    ".factory/artifacts/demo/records/00001-i1-demo.task-implement-r1/outcome.yaml",
    VALID_OUTCOME,
  );
  mutate?.();
}

function validRun(): Run {
  return run(PACKAGE_ROOT, {
    FACTORY_REPO_ROOT: root,
    // Unset: the tree root falls back to the artifact checkout, so the
    // single-root cases below also pin the direct-run default.
    FACTORY_TREE_ROOT: undefined,
    FACTORY_RUN_CONFIG: undefined,
  });
}

describe("schema validation", () => {
  schemaValidationPart1();
  schemaValidationPart2();
  schemaValidationPart3();
  schemaValidationInfra();
  schemaValidationPart4();
});

describe("schema validation: one check list", () => {
  it("reports a task exactly as factory validate does", async () => {
    freshCase(() => {
      write(
        ".factory/artifacts/demo/tasks/demo.task.md",
        VALID_TASK.replace("deps: []", "deps:\n  - demo.other"),
      );
      write(
        ".factory/artifacts/demo/tasks/demo.other.md",
        VALID_TASK.replace("demo.task", "demo.other").replace(
          "deps: []",
          "deps:\n  - demo.task",
        ),
      );
    });
    const gate = validRun();
    expect(gate.code).toBe(1);
    const gateFinding = gate.output
      .split("\n")
      .find((line) => line.includes("dependency cycle"));
    expect(gateFinding).toBeDefined();
    if (gateFinding === undefined) throw new Error("no cycle finding");

    const validated = await runValidate(
      path.join(root, ".factory/artifacts/demo/tasks/demo.task.md"),
    );
    expect(validated.code).toBe(1);
    expect(validated.err.split("\n")).toContain(gateFinding);
  });
});

/**
 * A branch that drops a run-config key and migrates its run config, beside
 * the base checkout that still carries the key. Tree-owned files (repo/run
 * config) validate from FACTORY_TREE_ROOT; artifact files
 * (tasks, class, outcomes) validate from FACTORY_REPO_ROOT.
 */
let tree: string;
let artifacts: string;

function writeInto(base: string, rel: string, content: string): void {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function freshTwoRoots(options?: {
  treeMutate?: () => void;
  artifactsMutate?: () => void;
}): void {
  for (const base of [tree, artifacts]) {
    fs.rmSync(path.join(base, ".factory"), { recursive: true, force: true });
  }
  // The migrated tree: repo and run configs without the key.
  writeInto(tree, ".factory/repo.yaml", "baseBranch: main\n");
  writeInto(tree, ".factory/run.yaml", "aliases: {}\n");
  // The base checkout: unmigrated tree-owned files, valid artifact files.
  writeInto(artifacts, ".factory/repo.yaml", "baseBranch: 42\n");
  writeInto(artifacts, ".factory/run.yaml", "aliases: {}\ndroppedKey: 1\n");
  writeInto(
    artifacts,
    ".factory/artifacts/demo/tasks/demo.task.md",
    VALID_TASK,
  );
  writeInto(
    artifacts,
    ".factory/artifacts/demo/class.yaml",
    "class: task\nslug: demo.task\n",
  );
  writeInto(
    artifacts,
    ".factory/artifacts/demo/records/00001-i1-demo.task-implement-r1/outcome.yaml",
    VALID_OUTCOME,
  );
  options?.treeMutate?.();
  options?.artifactsMutate?.();
}

function twoRootRun(extra?: Record<string, string | undefined>): Run {
  return run(PACKAGE_ROOT, {
    FACTORY_REPO_ROOT: artifacts,
    FACTORY_TREE_ROOT: tree,
    FACTORY_RUN_CONFIG: undefined,
    ...extra,
  });
}

describe("tree under test", () => {
  beforeAll(() => {
    tree = fs.mkdtempSync(path.join(os.tmpdir(), "schema-tree-"));
    artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "schema-artifacts-"));
  });

  afterAll(() => {
    fs.rmSync(tree, { recursive: true, force: true });
    fs.rmSync(artifacts, { recursive: true, force: true });
  });
  registerTreeUnderTestPart1();
  registerTreeUnderTestPart2();
});

function schemaValidationPart1() {
  it("passes a fully valid repo tree", () => {
    freshCase();
    const result = validRun();
    expect(result.code).toBe(0);
    // Seven files: package process.yaml, repo/run config, task, class, hold
    // and outcome. noteChecked increments only after the schema accepts one.
    expect(result.output).toContain("7 schema-enforced file(s) valid");
  });

  it("passes a task file that names a configured type", () => {
    freshCase(() =>
      write(".factory/artifacts/demo/tasks/demo.task.md", TYPED_TASK),
    );
    const result = validRun();
    expect(result.code).toBe(0);
    expect(result.output).toContain("7 schema-enforced file(s) valid");
  });

  it("fails on an invalid repo config and names the file", () => {
    freshCase(() => write(".factory/repo.yaml", "baseBranch: 42\n"));
    const result = validRun();
    expect(result.code).toBe(1);
    expect(result.output).toContain(factory("repo.yaml"));
  });

  it("fails on an invalid run config and names the file", () => {
    freshCase(() => write(".factory/run.yaml", "aliases: 7\n"));
    const result = validRun();
    expect(result.code).toBe(1);
    expect(result.output).toContain(factory("run.yaml"));
  });

  it("does not read the tree's bootstrap run library", () => {
    freshCase(() => write("bootstrap/run/broken.yaml", "aliases: 7\n"));
    const result = validRun();
    expect(result.code).toBe(0);
    expect(result.output).not.toContain(
      path.join(root, "bootstrap", "run", "broken.yaml"),
    );
  });
}

function schemaValidationPart2() {
  it("fails on an invalid FACTORY_RUN_CONFIG and names it", () => {
    freshCase(() => write("ops/current.yaml", "aliases: 7\n"));
    const result = run(PACKAGE_ROOT, {
      FACTORY_REPO_ROOT: root,
      FACTORY_TREE_ROOT: undefined,
      FACTORY_RUN_CONFIG: path.join(root, "ops", "current.yaml"),
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain(path.join(root, "ops", "current.yaml"));
  });

  it("fails on a task file whose slug does not match its name", () => {
    freshCase(() =>
      write(
        ".factory/artifacts/demo/tasks/demo.task.md",
        VALID_TASK.replace("slug: demo.task", "slug: other.task"),
      ),
    );
    const result = validRun();
    expect(result.code).toBe(1);
    expect(result.output).toContain(path.join(root, ".factory", "artifacts"));
  });

  it("fails on a dependency cycle across task files", () => {
    freshCase(() => {
      write(
        ".factory/artifacts/demo/tasks/demo.task.md",
        VALID_TASK.replace("deps: []", "deps:\n  - demo.other"),
      );
      write(
        ".factory/artifacts/demo/tasks/demo.other.md",
        VALID_TASK.replace("demo.task", "demo.other").replace(
          "deps: []",
          "deps:\n  - demo.task",
        ),
      );
    });
    const result = validRun();
    expect(result.code).toBe(1);
    expect(result.output).toContain("dependency cycle");
  });
}

function schemaValidationPart3() {
  it("fails on an invalid class.yaml and names the file", () => {
    freshCase(() =>
      write(".factory/artifacts/demo/class.yaml", "class: huge\n"),
    );
    const result = validRun();
    expect(result.code).toBe(1);
    expect(result.output).toContain(factory("artifacts/demo/class.yaml"));
  });

  it("fails on an invalid outcome and names the file", () => {
    freshCase(() =>
      write(
        ".factory/artifacts/demo/records/00001-i1-demo.task-implement-r1/outcome.yaml",
        "status: shipped\n",
      ),
    );
    const result = validRun();
    expect(result.code).toBe(1);
    expect(result.output).toContain(
      factory(
        "artifacts/demo/records/00001-i1-demo.task-implement-r1/outcome.yaml",
      ),
    );
  });

  it("fails on an invalid hold file and names it", () => {
    freshCase(() =>
      write(
        ".factory/artifacts/demo/mailbox/holds/steer-1.yaml",
        "slugs: demo.task\ngoal: false\n",
      ),
    );
    const result = validRun();
    expect(result.code).toBe(1);
    expect(result.output).toContain(
      factory("artifacts/demo/mailbox/holds/steer-1.yaml"),
    );
  });
}

function schemaValidationInfra() {
  it("passes a valid infra.yaml the infra turn wrote", () => {
    freshCase(() =>
      write(
        ".factory/artifacts/demo/infra.yaml",
        'gates:\n  - { name: unit, command: "bun test", speed: fast, status: green }\n',
      ),
    );
    const result = validRun();
    expect(result.code).toBe(0);
    expect(result.output).toContain("8 schema-enforced file(s) valid");
  });

  it("fails on an invalid infra.yaml and names the file", () => {
    freshCase(() =>
      write(
        ".factory/artifacts/demo/infra.yaml",
        'gates:\n  - { name: unit, command: "bun test", speed: medium, status: green }\n',
      ),
    );
    const result = validRun();
    expect(result.code).toBe(1);
    expect(result.output).toContain(factory("artifacts/demo/infra.yaml"));
  });
}

function schemaValidationPart4() {
  it("fails on an invalid package-local process.yaml and names it", () => {
    const pkg = fs.mkdtempSync(path.join(os.tmpdir(), "schema-pkg-"));
    try {
      fs.mkdirSync(path.join(pkg, "config"), { recursive: true });
      fs.writeFileSync(path.join(pkg, "config", "process.yaml"), "flows: 3\n");
      const result = run(pkg, {
        FACTORY_REPO_ROOT: pkg,
        FACTORY_TREE_ROOT: undefined,
        FACTORY_RUN_CONFIG: undefined,
      });
      expect(result.code).toBe(1);
      expect(result.output).toContain(path.join(pkg, "config", "process.yaml"));
    } finally {
      fs.rmSync(pkg, { recursive: true, force: true });
    }
  });

  it("notes absent repo-level files without failing", () => {
    fs.rmSync(path.join(root, ".factory"), { recursive: true, force: true });
    const result = validRun();
    expect(result.code).toBe(0);
    expect(result.output).toContain("not present");
  });
}

function registerTreeUnderTestPart1(): void {
  it("ignores the artifact checkout's unmigrated tree-owned files", () => {
    freshTwoRoots();
    const result = twoRootRun();
    expect(result.code).toBe(0);
    expect(result.output).toContain(tree);
    expect(result.output).toContain(artifacts);
  });

  it("fails on a stale key in the tree's run config, naming the file", () => {
    const stale = path.join(tree, ".factory", "run.yaml");
    freshTwoRoots({
      treeMutate: () =>
        writeInto(tree, ".factory/run.yaml", "aliases: {}\ndroppedKey: 1\n"),
    });
    const result = twoRootRun();
    expect(result.code).toBe(1);
    expect(result.output).toContain(stale);
  });

  it("validates the repo config from the tree", () => {
    // The artifact checkout's invalid repo.yaml is ignored ...
    freshTwoRoots();
    expect(twoRootRun().code).toBe(0);
    // ... while the tree's invalid repo.yaml fails, naming the tree file.
    const repoFile = path.join(tree, ".factory", "repo.yaml");
    freshTwoRoots({
      treeMutate: () =>
        writeInto(tree, ".factory/repo.yaml", "baseBranch: 42\n"),
    });
    const result = twoRootRun();
    expect(result.code).toBe(1);
    expect(result.output).toContain(repoFile);
  });
}

function registerTreeUnderTestPart2(): void {
  it("still validates tasks and outcomes from the artifact checkout", () => {
    freshTwoRoots({
      artifactsMutate: () =>
        writeInto(
          artifacts,
          ".factory/artifacts/demo/records/00001-i1-demo.task-implement-r1/outcome.yaml",
          "status: shipped\n",
        ),
    });
    const result = twoRootRun();
    expect(result.code).toBe(1);
    expect(result.output).toContain(
      path.join(artifacts, ".factory", "artifacts"),
    );
  });

  it("resolves a relative FACTORY_RUN_CONFIG under the tree", () => {
    freshTwoRoots({
      treeMutate: () => writeInto(tree, "ops/current.yaml", "aliases: 7\n"),
    });
    const result = twoRootRun({ FACTORY_RUN_CONFIG: "ops/current.yaml" });
    expect(result.code).toBe(1);
    expect(result.output).toContain(path.join(tree, "ops", "current.yaml"));
  });
}
