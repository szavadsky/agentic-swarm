import { describe, expect, it } from "bun:test";
import path from "node:path";
import {
  runValidate,
  taskFile,
  validRunConfig,
  withTmp,
  writeFile,
} from "../helpers/validate.js";

function registerFactoryValidatePart1(): void {
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
}

function registerFactoryValidatePart2(): void {
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
}

function registerFactoryValidatePart3(): void {
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
}

function registerFactoryValidatePart4(): void {
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
      writeFile(root, ".factory/run.yaml", validRunConfig());
      const file = writeFile(root, ".factory/repo.yaml", "baseBranch: main\n");
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
}

function registerFactoryValidatePart5(): void {
  it(
    "accepts a valid run file",
    withTmp(async (root) => {
      const file = writeFile(root, "run.yaml", validRunConfig());
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
    "accepts a run file through its base",
    withTmp(async (root) => {
      writeFile(root, "base.yaml", validRunConfig());
      const file = writeFile(
        root,
        "run.yaml",
        "extends: base.yaml\naliases:\n  architect: { model: overlay-model }\n",
      );
      const result = await runValidate(file);
      expect(result.code).toBe(0);
      expect(result.out).toContain(": valid");
    }),
  );
}

function registerFactoryValidatePart6(): void {
  it(
    "names the missing base of a run file",
    withTmp(async (root) => {
      const file = writeFile(root, "run.yaml", "extends: absent.yaml\n");
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain("base run config not found");
    }),
  );

  it(
    "accepts a valid process file",
    withTmp(async (root) => {
      writeFile(root, ".factory/run.yaml", validRunConfig());
      const file = writeFile(root, ".factory/process.yaml", "reminders: 2\n");
      const result = await runValidate(file);
      expect(result.code).toBe(0);
      expect(result.out).toContain(": valid");
    }),
  );

  it(
    "rejects an invalid process file",
    withTmp(async (root) => {
      const file = writeFile(root, "process.yaml", "reminders: -1\n");
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain("reminders");
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
}

function registerFactoryValidatePart7(): void {
  it(
    "rejects a missing file",
    withTmp(async (root) => {
      const result = await runValidate(path.join(root, "nope.yaml"));
      expect(result.code).toBe(1);
      expect(result.err).toContain("no such file");
    }),
  );

  it(
    "accepts a task file that names a configured type",
    withTmp(async (root) => {
      const typed = taskFile("alpha", []).replace(
        "kind: task\nflow: implement-review",
        "type: spike",
      );
      const file = writeFile(root, "tasks/alpha.md", typed);
      const result = await runValidate(file);
      expect(result.code).toBe(0);
      expect(result.out).toContain(": valid");
      expect(result.err).toBe("");
    }),
  );

  it(
    "rejects a task file that names a type the config lacks",
    withTmp(async (root) => {
      const typed = taskFile("alpha", []).replace(
        "kind: task\nflow: implement-review",
        "type: nope",
      );
      const file = writeFile(root, "tasks/alpha.md", typed);
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain(
        'task "alpha" has type "nope": type "nope" is not configured',
      );
    }),
  );
}

function registerFactoryValidatePart8(): void {
  it(
    "rejects kind banana with the kernel finding",
    withTmp(async (root) => {
      const bad = taskFile("alpha", []).replace("kind: task", "kind: banana");
      const file = writeFile(root, "tasks/alpha.md", bad);
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain(
        'task "alpha" has kind "banana": expected "development" or "spike" (legacy "task" reads as development)',
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
}

function registerFactoryValidatePart9(): void {
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
}

function registerFactoryValidateCrossLayerAliases(): void {
  it(
    "reports the missing alias class to the run config",
    withTmp(async (root) => {
      const file = writeFile(
        root,
        "run.yaml",
        "aliases:\n  implementer: { harness: fake, model: m }\n",
      );
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain(
        `aliases.architect: required by boundary step "architect" but missing`,
      );
      expect(result.err).toContain(
        `aliases.implementer-b: required by flow "implement-review" step "implement" alternates but missing`,
      );
      expect(result.err).toContain(file);
    }),
  );
}

function registerFactoryValidateCrossLayerReferences(): void {
  it(
    "reports an unknown flow and schema on a task type",
    withTmp(async (root) => {
      writeFile(root, ".factory/run.yaml", validRunConfig());
      const processFile = writeFile(
        root,
        ".factory/process.yaml",
        "taskTypes:\n  broken: { flow: ghost-flow, kind: development, schema: ghost-schema, useWhen: fixture work }\n",
      );
      const file = writeFile(root, ".factory/repo.yaml", "baseBranch: main\n");
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain(processFile);
      expect(result.err).toContain(
        `taskTypes.broken.flow: flow "ghost-flow" is not configured`,
      );
      expect(result.err).toContain(
        `taskTypes.broken.schema: schema "ghost-schema" is not a kernel outcome schema (outcome, qa)`,
      );
    }),
  );

  it(
    "reports a missing quota pool class",
    withTmp(async (root) => {
      const config = validRunConfig().replace(
        "implementer: { harness: fake, model: implementer-model }",
        "implementer: { harness: fake, model: implementer-model, subscription: ghost-pool }",
      );
      const file = writeFile(root, "run.yaml", config);
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain(
        `aliases.implementer.subscription: subscription "ghost-pool" names no limits.concurrency.perSubscription pool`,
      );
      expect(result.err).toContain(file);
    }),
  );
}

function registerFactoryValidateCrossLayerChains(): void {
  it(
    "reports a missing fallback alias class",
    withTmp(async (root) => {
      const config = validRunConfig().replace(
        "implementer: { harness: fake, model: implementer-model }",
        "implementer: { harness: fake, model: implementer-model, fallbacks: [{ alias: ghost-alias }] }",
      );
      const file = writeFile(root, "run.yaml", config);
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain('fallback alias "ghost-alias"');
      expect(result.err).toContain("aliases.implementer.fallbacks.0.alias");
    }),
  );

  it(
    "reports a missing escalation alias class",
    withTmp(async (root) => {
      const config = validRunConfig().replace(
        "implementer: { harness: fake, model: implementer-model }",
        "implementer: { harness: fake, model: implementer-model, escalateTo: ghost-escalation }",
      );
      const file = writeFile(root, "run.yaml", config);
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain(
        'escalateTo "ghost-escalation" names no run-config alias',
      );
    }),
  );
}

function registerFactoryValidateCrossLayerPass(): void {
  it(
    "passes a valid fake config with no harness probe",
    withTmp(async (root) => {
      const file = writeFile(root, "run.yaml", validRunConfig());
      const result = await runValidate(file);
      expect(result.code).toBe(0);
      expect(result.err).toBe("");
      expect(result.out).toContain(": valid");
    }),
  );
}

describe("factory validate", () => {
  registerFactoryValidatePart1();

  registerFactoryValidatePart2();

  registerFactoryValidatePart3();

  registerFactoryValidatePart4();

  registerFactoryValidatePart5();

  registerFactoryValidatePart6();

  registerFactoryValidatePart7();

  registerFactoryValidatePart8();

  registerFactoryValidatePart9();

  registerFactoryValidateCrossLayerAliases();

  registerFactoryValidateCrossLayerReferences();

  registerFactoryValidateCrossLayerChains();

  registerFactoryValidateCrossLayerPass();
});
