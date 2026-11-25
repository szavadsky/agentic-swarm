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

async function withTmpCallbackPart1(root: string) {
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

  return { digestRec };
}

async function withTmpCallbackPart2(
  root: string,
  scope: Awaited<ReturnType<typeof withTmpCallbackPart1>>,
) {
  const { digestRec } = scope;
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
    "status: done\nsummary: plan reviewed\nplanReview:\n  technical: []\n  planNotes: []\n",
  );
  const planreviewRes = await runValidate(planreviewFile);
  expect(planreviewRes.code).toBe(0);
  expect(planreviewRes.out).toContain(": valid");

  const planreviewBareRec = "records/00007-i1-planreview-r2";
  writeFile(root, `${planreviewBareRec}/started.yaml`, STARTED("planreview"));
  const planreviewBare = writeFile(
    root,
    `${planreviewBareRec}/outcome.yaml`,
    "status: done\nsummary: plan reviewed\n",
  );
  const planreviewBareRes = await runValidate(planreviewBare);
  expect(planreviewBareRes.code).toBe(1);
  expect(planreviewBareRes.err).toContain(
    "planReview is required on a completed plan review",
  );

  // plancheck
  const plancheckRec = "records/00005-i1-plancheck-r1";
  writeFile(root, `${plancheckRec}/started.yaml`, STARTED("plancheck"));

  return { ...scope, plancheckRec };
}

async function withTmpCallbackPart3(
  root: string,
  scope: Awaited<ReturnType<typeof withTmpCallbackPart2>>,
) {
  const { plancheckRec } = scope;
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

  return { ...scope, stallRes };
}

async function withTmpCallbackPart4(
  root: string,
  scope: Awaited<ReturnType<typeof withTmpCallbackPart3>>,
) {
  const { stallRes } = scope;
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
}

function registerFactoryValidatePart10(): void {
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
}

function registerFactoryValidatePart11(): void {
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
}

function registerFactoryValidatePart12(): void {
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
}

function registerFactoryValidatePart13(): void {
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
}

function registerFactoryValidatePart14(): void {
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
      const scope1 = await withTmpCallbackPart1(root);
      const scope2 = await withTmpCallbackPart2(root, scope1);
      const scope3 = await withTmpCallbackPart3(root, scope2);
      await withTmpCallbackPart4(root, scope3);
    }),
  );
}

function registerFactoryValidatePart15(): void {
  it(
    "refuses an architect flow's unknown reason, prompt and alias",
    withTmp(async (root) => {
      const file = writeFile(
        root,
        ".factory/process.yaml",
        "architecture:\n  flows:\n    - when: [cheker-done]\n      steps:\n        - id: architect\n        - id: pm\n",
      );
      const reason = await runValidate(file);
      expect(reason.code).toBe(1);
      expect(reason.err).toContain("architecture.flows.0.when.0");

      writeFile(
        root,
        ".factory/process.yaml",
        "architecture:\n  flows:\n    - when: [initial]\n      steps:\n        - id: assess\n          prompt: ghost\n          alias: reviewer-b\n        - id: architect\n        - id: pm\n",
      );
      const flow = await runValidate(file);
      expect(flow.code).toBe(1);
      expect(flow.err).toContain('Prompt fragment "ghost" not found');
      expect(flow.err).toContain(
        'aliases.reviewer-b: required by architecture flow step "assess" but missing',
      );

      writeFile(
        root,
        ".factory/process.yaml",
        "architecture:\n  flows:\n    - when: [initial]\n      steps:\n        - id: assess\n          prompt: architect\n          alias: architect\n          repairPrompt: ghost-repair\n          unfinishedPrompt: ghost-unfinished\n        - id: architect\n        - id: pm\n",
      );
      const repairs = await runValidate(file);
      expect(repairs.code).toBe(1);
      expect(repairs.err).toContain('Prompt fragment "ghost-repair" not found');
      expect(repairs.err).toContain(
        'Prompt fragment "ghost-unfinished" not found',
      );
    }),
  );
}

function registerFactoryValidatePart16(): void {
  it(
    "refuses a pm flow's unknown prompt and alias",
    withTmp(async (root) => {
      const file = writeFile(
        root,
        ".factory/process.yaml",
        "pm:\n  steps:\n    - id: derive\n    - id: postaudit\n      prompt: ghost\n      alias: reviewer-b\n",
      );
      const flow = await runValidate(file);
      expect(flow.code).toBe(1);
      expect(flow.err).toContain('Prompt fragment "ghost" not found');
      expect(flow.err).toContain(
        'aliases.reviewer-b: required by pm flow step "postaudit" but missing',
      );

      writeFile(
        root,
        ".factory/process.yaml",
        "pm:\n  steps:\n    - id: derive\n    - id: postaudit\n      prompt: pm\n      alias: pm\n      repairPrompt: ghost-repair\n      unfinishedPrompt: ghost-unfinished\n",
      );
      const repairs = await runValidate(file);
      expect(repairs.code).toBe(1);
      expect(repairs.err).toContain('Prompt fragment "ghost-repair" not found');
      expect(repairs.err).toContain(
        'Prompt fragment "ghost-unfinished" not found',
      );
    }),
  );
}

describe("factory validate", () => {
  registerFactoryValidatePart10();

  registerFactoryValidatePart11();

  registerFactoryValidatePart12();

  registerFactoryValidatePart13();

  registerFactoryValidatePart14();

  registerFactoryValidatePart15();

  registerFactoryValidatePart16();
});
