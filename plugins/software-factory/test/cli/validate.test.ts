import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";

function taskFile(slug: string, deps: string[]): string {
  return `---\nslug: ${slug}\ntitle: ${slug}\nkind: task\nflow: implement-review\ndeps: [${deps.join(", ")}]\nscope:\n  - "src/**"\n---\n\nDone when: ${slug} works\n`;
}

/** A repo flow whose review step id is not one of the package defaults. */
const CUSTOM_FLOW =
  "flows:\n  custom:\n    reviewRounds: 1\n    steps:\n      - id: build\n        role: implementer\n      - id: audit\n        role: reviewer\n        review: true\n";

/** The fields inference reads from a record directory's started.yaml. */
const STARTED = (step: string): string =>
  `seq: 42\niteration: 1\nstep: ${step}\nround: 1\nactor: agent\n`;

function writeFile(root: string, rel: string, content: string): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  return abs;
}

async function runValidate(
  file: string,
  extraArgs: string[] = [],
): Promise<{
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
    const code = await dispatch(["validate", ...extraArgs, file]);
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

  it(
    "rejects kind banana with the kernel finding",
    withTmp(async (root) => {
      const bad = taskFile("alpha", []).replace("kind: task", "kind: banana");
      const file = writeFile(root, "tasks/alpha.md", bad);
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain(
        'task "alpha" has kind "banana": expected "task" or "spike"',
      );
    }),
  );

  it(
    "rejects an unknown flow with the kernel finding",
    withTmp(async (root) => {
      const bad = taskFile("alpha", []).replace(
        "flow: implement-review",
        "flow: no-such-flow",
      );
      const file = writeFile(root, "tasks/alpha.md", bad);
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain('flow "no-such-flow" is not configured');
    }),
  );

  it(
    "rejects a review outcome without a verdict for --step review",
    withTmp(async (root) => {
      const file = writeFile(
        root,
        "outcome.yaml",
        "status: done\nsummary: reviewed\n",
      );
      const result = await runValidate(file, ["--step", "review"]);
      expect(result.code).toBe(1);
      expect(result.err).toContain(
        "verdict is required on a completed review: approve | changes | reject",
      );
    }),
  );

  it(
    "accepts a valid review outcome for --step review",
    withTmp(async (root) => {
      const file = writeFile(
        root,
        "outcome.yaml",
        "status: done\nsummary: reviewed\nverdict: approve\n",
      );
      const result = await runValidate(file, ["--step", "review"]);
      expect(result.code).toBe(0);
      expect(result.out).toContain(": valid");
    }),
  );

  it(
    "validates a task against its repo's own process config",
    withTmp(async (root) => {
      writeFile(root, ".factory/process.yaml", CUSTOM_FLOW);
      const file = writeFile(
        root,
        "tasks/alpha.md",
        taskFile("alpha", []).replace("flow: implement-review", "flow: custom"),
      );
      const result = await runValidate(file);
      expect(result.code).toBe(0);
      expect(result.out).toContain(": valid");
    }),
  );

  it(
    "rejects a task flow its repo's config does not define",
    withTmp(async (root) => {
      writeFile(root, ".factory/process.yaml", CUSTOM_FLOW);
      const file = writeFile(
        root,
        "tasks/alpha.md",
        taskFile("alpha", []).replace("flow: implement-review", "flow: ghost"),
      );
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain('flow "ghost" is not configured');
    }),
  );

  it(
    "surfaces an invalid process config instead of wrong flow findings",
    withTmp(async (root) => {
      writeFile(root, ".factory/process.yaml", "flows: 7\n");
      const file = writeFile(root, "tasks/alpha.md", taskFile("alpha", []));
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain("configuration is invalid");
      expect(result.err).toContain("flows");
      expect(result.err).not.toContain("is not configured");
    }),
  );

  it(
    "infers a record outcome's review step from started.yaml",
    withTmp(async (root) => {
      writeFile(root, ".factory/process.yaml", CUSTOM_FLOW);
      const record = "records/00042-alpha-review-r1";
      writeFile(root, `${record}/started.yaml`, STARTED("audit"));
      const file = writeFile(
        root,
        `${record}/outcome.yaml`,
        "status: done\nsummary: reviewed\n",
      );
      const missing = await runValidate(file);
      expect(missing.code).toBe(1);
      expect(missing.err).toContain(
        "verdict is required on a completed review",
      );

      writeFile(
        root,
        `${record}/outcome.yaml`,
        "status: done\nsummary: reviewed\nverdict: approve\n",
      );
      const valid = await runValidate(file);
      expect(valid.code).toBe(0);
      expect(valid.out).toContain(": valid");
    }),
  );

  it(
    "fails loud on a step no flow configures",
    withTmp(async (root) => {
      writeFile(root, ".factory/process.yaml", CUSTOM_FLOW);
      const record = "records/00042-alpha-review-r1";
      writeFile(root, `${record}/started.yaml`, STARTED("reveiw"));
      const file = writeFile(
        root,
        `${record}/outcome.yaml`,
        "status: done\nsummary: reviewed\n",
      );
      const inferred = await runValidate(file);
      expect(inferred.code).toBe(1);
      expect(inferred.err).toContain(
        'step "reveiw" is not configured in the repo\'s flows',
      );

      const standalone = writeFile(
        root,
        "scratch/outcome.yaml",
        "status: done\nsummary: reviewed\n",
      );
      const explicit = await runValidate(standalone, ["--step", "reveiw"]);
      expect(explicit.code).toBe(1);
      expect(explicit.err).toContain(
        'step "reveiw" is not configured in the repo\'s flows',
      );
    }),
  );

  it(
    "checks a standalone outcome without a step for schema only, and says so",
    withTmp(async (root) => {
      const file = writeFile(
        root,
        "scratch/outcome.yaml",
        "status: done\nsummary: reviewed\n",
      );
      const result = await runValidate(file);
      expect(result.code).toBe(0);
      expect(result.out).toContain("step-independent checks only");
      expect(result.out).toContain(": valid");
    }),
  );
});
