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
  "flows:\n  custom:\n    steps:\n      - id: build\n        prompt: implementer\n        alias: implementer\n      - id: audit\n        prompt: reviewer\n        alias: reviewer\n        review: true\n        changeRequests: 2\n";

/** The fields inference reads from a record directory's started.yaml. */
const STARTED = (step: string, round = 1): string =>
  `seq: 42\niteration: 1\nstep: ${step}\nround: ${round}\nactor: agent\n`;

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
      const file = writeFile(root, "process.yaml", "reminders: 2\n");
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
    "refuses a changes verdict on a record's last review call",
    withTmp(async (root) => {
      writeFile(root, ".factory/process.yaml", CUSTOM_FLOW);
      const record = "records/00042-alpha-review-r3";
      writeFile(root, `${record}/started.yaml`, STARTED("audit", 3));
      const file = writeFile(
        root,
        `${record}/outcome.yaml`,
        "status: done\nsummary: reviewed\nverdict: changes\n",
      );
      const refused = await runValidate(file);
      expect(refused.code).toBe(1);
      expect(refused.err).toContain(
        'verdict "changes" is not available on the last review call',
      );

      writeFile(root, `${record}/started.yaml`, STARTED("audit", 2));
      const accepted = await runValidate(file);
      expect(accepted.code).toBe(0);
      expect(accepted.out).toContain(": valid");
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

  it(
    "validates an outcome under a record of each kernel turn step",
    withTmp(async (root) => {
      // architect with decision passes
      const archRec = "records/00001-i1-architect-r1";
      writeFile(root, `${archRec}/started.yaml`, STARTED("architect"));
      const archFile = writeFile(
        root,
        `${archRec}/outcome.yaml`,
        "status: done\nsummary: planned\ndecision: continue\n",
      );
      const archRes = await runValidate(archFile);
      expect(archRes.code).toBe(0);
      expect(archRes.out).toContain(": valid");

      // architect without decision fails loud
      writeFile(
        root,
        `${archRec}/outcome.yaml`,
        "status: done\nsummary: planned\n",
      );
      const archMissing = await runValidate(archFile);
      expect(archMissing.code).toBe(1);
      expect(archMissing.err).toContain(
        "decision is required: continue | done | blocked",
      );

      // pm (derive turn)
      const pmRec = "records/00002-i1-pm-r1";
      writeFile(root, `${pmRec}/started.yaml`, STARTED("pm"));
      const pmFile = writeFile(
        root,
        `${pmRec}/outcome.yaml`,
        "status: done\nsummary: derived\n",
      );
      const pmRes = await runValidate(pmFile);
      expect(pmRes.code).toBe(0);
      expect(pmRes.out).toContain(": valid");

      // digest
      const digestRec = "records/00003-i1-digest-r1";
      writeFile(root, `${digestRec}/started.yaml`, STARTED("digest"));
      const digestFile = writeFile(
        root,
        `${digestRec}/outcome.yaml`,
        "status: done\nsummary: digested\n",
      );
      const digestRes = await runValidate(digestFile);
      expect(digestRes.code).toBe(0);
      expect(digestRes.out).toContain(": valid");

      // planreview
      const planreviewRec = "records/00004-i1-planreview-r1";
      writeFile(root, `${planreviewRec}/started.yaml`, STARTED("planreview"));
      const planreviewFile = writeFile(
        root,
        `${planreviewRec}/outcome.yaml`,
        "status: done\nsummary: plan reviewed\n",
      );
      const planreviewRes = await runValidate(planreviewFile);
      expect(planreviewRes.code).toBe(0);
      expect(planreviewRes.out).toContain(": valid");

      // plancheck
      const plancheckRec = "records/00005-i1-plancheck-r1";
      writeFile(root, `${plancheckRec}/started.yaml`, STARTED("plancheck"));
      const plancheckFile = writeFile(
        root,
        `${plancheckRec}/outcome.yaml`,
        "status: done\nsummary: verified\nplanCheck:\n  verdict: progress\n  evidence: []\n  followUps: []\n",
      );
      const plancheckRes = await runValidate(plancheckFile);
      expect(plancheckRes.code).toBe(0);
      expect(plancheckRes.out).toContain(": valid");

      // steward
      const stewardRec = "records/00006-alpha-steward-r1";
      writeFile(root, `${stewardRec}/started.yaml`, STARTED("steward"));
      const stewardFile = writeFile(
        root,
        `${stewardRec}/outcome.yaml`,
        "status: done\nsummary: merged conflict\n",
      );
      const stewardRes = await runValidate(stewardFile);
      expect(stewardRes.code).toBe(0);
      expect(stewardRes.out).toContain(": valid");

      // front
      const frontRec = "records/00007-i1-front-r1";
      writeFile(root, `${frontRec}/started.yaml`, STARTED("front"));
      const frontFile = writeFile(
        root,
        `${frontRec}/outcome.yaml`,
        "status: done\nsummary: front completed\n",
      );
      const frontRes = await runValidate(frontFile);
      expect(frontRes.code).toBe(0);
      expect(frontRes.out).toContain(": valid");

      // stall PM turn
      const stallRec = "records/00008-i1-pm-r1";
      writeFile(root, `${stallRec}/started.yaml`, STARTED("pm"));
      const stallFile = writeFile(
        root,
        `${stallRec}/outcome.yaml`,
        "status: done\nsummary: routed stalls\nstallRoutes:\n  - slug: alpha\n    action: replace\n    reason: replace it\n",
      );
      const stallRes = await runValidate(stallFile);
      expect(stallRes.code).toBe(0);
      expect(stallRes.out).toContain(": valid");

      // steer PM turn
      const steerRec = "records/00009-i1-pm-r1";
      writeFile(root, `${steerRec}/started.yaml`, STARTED("pm"));
      const steerFile = writeFile(
        root,
        `${steerRec}/outcome.yaml`,
        "status: done\nsummary: routed steers\nsteerRoutes:\n  - steer: s1\n    route: architect\n",
      );
      const steerRes = await runValidate(steerFile);
      expect(steerRes.code).toBe(0);
      expect(steerRes.out).toContain(": valid");
    }),
  );

  it(
    "rejects retired steps from old records as unknown",
    withTmp(async (root) => {
      const record = "records/00010-alpha-merge-attempt-r1";
      writeFile(root, `${record}/started.yaml`, STARTED("merge-attempt"));
      const file = writeFile(
        root,
        `${record}/outcome.yaml`,
        "status: done\nsummary: attempted\n",
      );
      const res = await runValidate(file);
      expect(res.code).toBe(1);
      expect(res.err).toContain(
        'step "merge-attempt" is not configured in the repo\'s flows',
      );

      const debtRecord = "records/00011-i1-debt-r1";
      writeFile(root, `${debtRecord}/started.yaml`, STARTED("debt"));
      const debtFile = writeFile(
        root,
        `${debtRecord}/outcome.yaml`,
        "status: done\nsummary: debt logged\n",
      );
      const debtRes = await runValidate(debtFile);
      expect(debtRes.code).toBe(1);
      expect(debtRes.err).toContain(
        'step "debt" is not configured in the repo\'s flows',
      );
    }),
  );

  it(
    "fails loud on prototype-named steps",
    withTmp(async (root) => {
      const record = "records/00012-i1-constructor-r1";
      writeFile(root, `${record}/started.yaml`, STARTED("constructor"));
      const file = writeFile(
        root,
        `${record}/outcome.yaml`,
        "status: done\nsummary: constructor test\n",
      );
      const res = await runValidate(file);
      expect(res.code).toBe(1);
      expect(res.err).toContain(
        'step "constructor" is not configured in the repo\'s flows',
      );

      const standalone = writeFile(
        root,
        "scratch/outcome.yaml",
        "status: done\nsummary: toString test\n",
      );
      const explicit = await runValidate(standalone, ["--step", "toString"]);
      expect(explicit.code).toBe(1);
      expect(explicit.err).toContain(
        'step "toString" is not configured in the repo\'s flows',
      );
    }),
  );
});
