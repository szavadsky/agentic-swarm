import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

const VALID_OUTCOME = "status: done\nsummary: landed\n";

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "schema-validation-"));
  write(".factory/repo.yaml", "baseBranch: main\n");
  write(".factory/run.yaml", "aliases: {}\n");
  write("bootstrap/run/self.yaml", "aliases: {}\n");
  write(".factory/artifacts/demo/tasks/demo.task.md", VALID_TASK);
  write(".factory/artifacts/demo/class.yaml", "class: task\nslug: demo.task\n");
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
  write("bootstrap/run/self.yaml", "aliases: {}\n");
  write(".factory/artifacts/demo/tasks/demo.task.md", VALID_TASK);
  write(".factory/artifacts/demo/class.yaml", "class: task\nslug: demo.task\n");
  write(
    ".factory/artifacts/demo/records/00001-i1-demo.task-implement-r1/outcome.yaml",
    VALID_OUTCOME,
  );
  mutate?.();
}

function validRun(): Run {
  return run(PACKAGE_ROOT, {
    FACTORY_REPO_ROOT: root,
    FACTORY_RUN_CONFIG: undefined,
  });
}

describe("schema validation", () => {
  it("passes a fully valid repo tree", () => {
    freshCase();
    const result = validRun();
    expect(result.code).toBe(0);
    // Seven files: package process.yaml, repo/run config, bootstrap run
    // layer, task, class and outcome. The count proves the class path ran;
    // noteChecked increments only after classSchema accepts the file.
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

  it("fails on an invalid run config in the bootstrap library", () => {
    freshCase(() => write("bootstrap/run/broken.yaml", "aliases: 7\n"));
    const result = validRun();
    expect(result.code).toBe(1);
    expect(result.output).toContain(
      path.join(root, "bootstrap", "run", "broken.yaml"),
    );
  });

  it("fails on an invalid FACTORY_RUN_CONFIG outside the run library", () => {
    freshCase(() => write("ops/current.yaml", "aliases: 7\n"));
    const result = run(PACKAGE_ROOT, {
      FACTORY_REPO_ROOT: root,
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

  it("fails on an invalid package-local process.yaml and names it", () => {
    const pkg = fs.mkdtempSync(path.join(os.tmpdir(), "schema-pkg-"));
    try {
      fs.mkdirSync(path.join(pkg, "config"), { recursive: true });
      fs.writeFileSync(path.join(pkg, "config", "process.yaml"), "flows: 3\n");
      const result = run(pkg, {
        FACTORY_REPO_ROOT: pkg,
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
    fs.rmSync(path.join(root, "bootstrap"), { recursive: true, force: true });
    const result = validRun();
    expect(result.code).toBe(0);
    expect(result.output).toContain("not present");
  });
});
