import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";

function taskFile(slug: string, deps: string[]): string {
  return `---\nslug: ${slug}\ntitle: ${slug}\nkind: task\nflow: implement-review\ndeps: [${deps.join(", ")}]\nscope:\n  - "src/**"\n---\n\nDone when: ${slug} works\n`;
}

function writeFile(root: string, rel: string, content: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  return abs;
}

async function runValidate(file: string): Promise<{
  code: number;
  out: string;
  err: string;
}> {
  const logs: string[] = [];
  const errors: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };
  try {
    const code = await dispatch(["validate", file]);
    return { code, out: logs.join("\n"), err: errors.join("\n") };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

function withTmp(fn: (root: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-validate-"));
    try {
      await fn(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

describe("factory validate", () => {
  it(
    "accepts a valid task file",
    withTmp(async (root) => {
      const file = writeFile(root, "tasks/alpha.md", taskFile("alpha", []));
      const result = await runValidate(file);
      expect(result.code).toBe(0);
      expect(result.out).toContain(": valid");
      expect(result.err).toBe("");
    }),
  );

  it(
    "rejects a task file with a missing dependency",
    withTmp(async (root) => {
      const file = writeFile(
        root,
        "tasks/alpha.md",
        taskFile("alpha", ["ghost"]),
      );
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain('depends on missing task "ghost"');
      expect(result.out).toBe("");
    }),
  );

  it(
    "rejects a valid task file beside a broken sibling",
    withTmp(async (root) => {
      const valid = writeFile(root, "tasks/alpha.md", taskFile("alpha", []));
      writeFile(root, "tasks/beta.md", taskFile("beta", ["ghost"]));
      const result = await runValidate(valid);
      expect(result.code).toBe(1);
      expect(result.err).toContain('depends on missing task "ghost"');
    }),
  );

  it(
    "accepts a valid class file",
    withTmp(async (root) => {
      const file = writeFile(root, "class.yaml", "class: task\nslug: alpha\n");
      const result = await runValidate(file);
      expect(result.code).toBe(0);
      expect(result.out).toContain(": valid");
    }),
  );

  it(
    "rejects an invalid class file",
    withTmp(async (root) => {
      const file = writeFile(root, "class.yaml", "class: nope\n");
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain(file);
      expect(result.err).toContain("class");
    }),
  );

  it(
    "accepts a valid outcome file",
    withTmp(async (root) => {
      const file = writeFile(
        root,
        "outcome.yaml",
        "status: done\nsummary: landed\n",
      );
      const result = await runValidate(file);
      expect(result.code).toBe(0);
      expect(result.out).toContain(": valid");
    }),
  );

  it(
    "rejects an invalid outcome file",
    withTmp(async (root) => {
      const file = writeFile(
        root,
        "outcome.yaml",
        "status: nope\nsummary: x\n",
      );
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain(file);
      expect(result.err).toContain("status");
    }),
  );

  it(
    "accepts a valid hold file",
    withTmp(async (root) => {
      const file = writeFile(
        root,
        "holds/s1.yaml",
        "slugs: [alpha]\ngoal: false\n",
      );
      const result = await runValidate(file);
      expect(result.code).toBe(0);
      expect(result.out).toContain(": valid");
    }),
  );

  it(
    "rejects an invalid hold file with the kernel message",
    withTmp(async (root) => {
      const file = writeFile(
        root,
        "holds/s1.yaml",
        "slugs: alpha\ngoal: false\n",
      );
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain(
        "must be { slugs: string[], goal: boolean }",
      );
    }),
  );

  it(
    "accepts a valid repo file",
    withTmp(async (root) => {
      const file = writeFile(root, "repo.yaml", "baseBranch: main\n");
      const result = await runValidate(file);
      expect(result.code).toBe(0);
      expect(result.out).toContain(": valid");
    }),
  );

  it(
    "rejects an invalid repo file",
    withTmp(async (root) => {
      const file = writeFile(root, "repo.yaml", "baseBranch: 7\n");
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain("baseBranch");
    }),
  );

  it(
    "accepts a valid run file",
    withTmp(async (root) => {
      const file = writeFile(root, "run.yaml", "aliases: {}\n");
      const result = await runValidate(file);
      expect(result.code).toBe(0);
      expect(result.out).toContain(": valid");
    }),
  );

  it(
    "rejects an invalid run file",
    withTmp(async (root) => {
      const file = writeFile(root, "run.yaml", "aliases: 7\n");
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain("aliases");
    }),
  );

  it(
    "accepts a valid process file",
    withTmp(async (root) => {
      const file = writeFile(root, "process.yaml", "itemTurns: 8\n");
      const result = await runValidate(file);
      expect(result.code).toBe(0);
      expect(result.out).toContain(": valid");
    }),
  );

  it(
    "rejects an invalid process file",
    withTmp(async (root) => {
      const file = writeFile(root, "process.yaml", "itemTurns: 0\n");
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain("itemTurns");
    }),
  );

  it(
    "rejects an unknown extension",
    withTmp(async (root) => {
      const file = writeFile(root, "notes.txt", "hello\n");
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain("unknown file kind");
    }),
  );

  it(
    "rejects a missing file",
    withTmp(async (root) => {
      const result = await runValidate(path.join(root, "nope.yaml"));
      expect(result.code).toBe(1);
      expect(result.err).toContain("no such file");
    }),
  );
});
