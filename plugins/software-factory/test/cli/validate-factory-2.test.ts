import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dispatch } from "../../src/cli/dispatch.js";

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

function factoryValidateQAOutcomesPart1() {
  it(
    "accepts an accept verdict and one finding per change request",
    withTmp(async (root) => {
      writeFile(
        root,
        "artifacts/demo/records/00001-i1-alpha-qa-r1/started.yaml",
        STARTED("qa", 1),
      );
      const accepted = writeFile(
        root,
        "artifacts/demo/records/00001-i1-alpha-qa-r1/outcome.yaml",
        "status: done\nsummary: accepted\nqa:\n  verdict: accept\n",
      );
      expect((await runValidate(accepted)).code).toBe(0);

      const changed = writeFile(
        root,
        "artifacts/demo/records/00001-i1-alpha-qa-r1/outcome.yaml",
        'status: done\nsummary: needs work\nqa:\n  verdict: changes\n  findings: ["task.txt:1 needs v2"]\n',
      );
      expect((await runValidate(changed)).code).toBe(0);
    }),
  );

  it(
    "refuses a change verdict with no finding",
    withTmp(async (root) => {
      writeFile(
        root,
        "artifacts/demo/records/00001-i1-alpha-qa-r1/started.yaml",
        STARTED("qa", 1),
      );
      const file = writeFile(
        root,
        "artifacts/demo/records/00001-i1-alpha-qa-r1/outcome.yaml",
        "status: done\nsummary: needs work\nqa:\n  verdict: changes\n",
      );
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain("needs at least one finding");
    }),
  );
}

function factoryValidateQAOutcomesPart2() {
  it(
    "refuses a change verdict on the last acceptance call",
    withTmp(async (root) => {
      writeFile(
        root,
        "artifacts/demo/records/00001-i1-alpha-qa-r1/started.yaml",
        STARTED("qa", 3),
      );
      const file = writeFile(
        root,
        "artifacts/demo/records/00001-i1-alpha-qa-r1/outcome.yaml",
        'status: done\nsummary: needs work\nqa:\n  verdict: changes\n  findings: ["task.txt:1 needs v2"]\n',
      );
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain("last acceptance call");
    }),
  );

  it(
    "refuses a QA outcome with no qa report",
    withTmp(async (root) => {
      writeFile(
        root,
        "artifacts/demo/records/00001-i1-alpha-qa-r1/started.yaml",
        STARTED("qa", 1),
      );
      const file = writeFile(
        root,
        "artifacts/demo/records/00001-i1-alpha-qa-r1/outcome.yaml",
        "status: done\nsummary: no verdict\n",
      );
      const result = await runValidate(file);
      expect(result.code).toBe(1);
      expect(result.err).toContain("qa verdict is required");
    }),
  );
}

function registerFactoryValidatePart15(): void {
  it(
    "bounds a plan-check follow-up by the plan's bullets",
    withTmp(async (root) => {
      writeFile(root, "plan.md", "# Plan\n\n- alpha — Alpha works.\n");
      const record = "records/00012-i1-plancheck-r1";
      writeFile(root, `${record}/started.yaml`, STARTED("plancheck"));
      const outside = writeFile(
        root,
        `${record}/outcome.yaml`,
        "status: done\nsummary: checked\nplanCheck:\n  verdict: progress\n  evidence: []\n  followUps:\n    - kind: amend\n      slug: alpha\n      reason: retry alpha\n    - kind: amend\n      slug: retired\n      reason: retry the old slug\n",
      );
      const rejected = await runValidate(outside);
      expect(rejected.code).toBe(1);
      expect(rejected.err).toContain(
        'follow-up slug "retired" has no "- retired —" bullet in the plan; merged and retired slugs are history',
      );
      expect(rejected.err).not.toContain('follow-up slug "alpha"');

      const inside = writeFile(
        root,
        `${record}/outcome.yaml`,
        "status: done\nsummary: checked\nplanCheck:\n  verdict: progress\n  evidence: []\n  followUps:\n    - kind: amend\n      slug: alpha\n      reason: retry alpha\n",
      );
      const accepted = await runValidate(inside);
      expect(accepted.code).toBe(0);
      expect(accepted.out).toContain(": valid");

      // A follow-up the epic plan names is inside the plan set.
      writeFile(
        root,
        "plan.md",
        "# Plan\n\n## Architect register\n\n- epic `auth` | architect `subarchitect` | plan `epics/auth.md` | scope `src/auth/**` | opened i1 | active\n",
      );
      writeFile(
        root,
        "epics/auth.md",
        "# Epic auth\n\n- auth.login — Add login.\n",
      );
      const epic = writeFile(
        root,
        `${record}/outcome.yaml`,
        "status: done\nsummary: checked\nplanCheck:\n  verdict: progress\n  evidence: []\n  followUps:\n    - kind: amend\n      slug: auth.login\n      reason: retry the turn\n",
      );
      const epicRes = await runValidate(epic);
      expect(epicRes.code).toBe(0);
      expect(epicRes.out).toContain(": valid");
    }),
  );
}

function registerFactoryValidatePart16(): void {
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
}

function registerFactoryValidatePart17(): void {
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
}

describe("factory validate", () => {
  registerFactoryValidatePart15();

  registerFactoryValidatePart16();

  registerFactoryValidatePart17();
});

describe("factory validate: QA outcomes", () => {
  factoryValidateQAOutcomesPart1();

  factoryValidateQAOutcomesPart2();
});
