import { describe, expect, it } from "bun:test";
import { recordedConcernId } from "../../src/core/concerns.js";
import { runValidate, withTmp, writeFile } from "../helpers/validate.js";

/** The fields inference reads from a record directory's started.yaml. */
const STARTED = (step: string, round = 1, revision?: number): string =>
  `seq: 42\niteration: 1\nstep: ${step}\nround: ${round}\nactor: agent\n${revision === undefined ? "" : `revision: ${revision}\n`}`;

/** An earlier ended launch of the same step, recorded as a change request. */
function priorChange(
  root: string,
  dir: string,
  step: string,
  seq: number,
  revision?: number,
): void {
  const record = `artifacts/demo/records/${dir}`;
  writeFile(
    root,
    `${record}/started.yaml`,
    `seq: ${seq}\niteration: 1\nstep: ${step}\nround: 1\nactor: agent\n${revision === undefined ? "" : `revision: ${revision}\n`}`,
  );
  writeFile(
    root,
    `${record}/end.yaml`,
    `endedAt: 2024-01-01T00:00:00.000Z\nlaunchKind: ${step === "qa" ? "qa-finding" : "change-request"}\n`,
  );
}

/** A park that ends an earlier revision. */
function priorPark(
  root: string,
  dir: string,
  seq: number,
  revision: number,
): void {
  const record = `artifacts/demo/records/${dir}`;
  writeFile(
    root,
    `${record}/started.yaml`,
    `seq: ${seq}\niteration: 1\nstep: park\nround: 1\nactor: script\nrevision: ${revision}\n`,
  );
  writeFile(
    root,
    `${record}/end.yaml`,
    "endedAt: 2024-01-01T00:00:00.000Z\nok: true\n",
  );
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
    "counts QA's own launches, not the shared round, for the last acceptance call",
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
      const first = await runValidate(file);
      expect(first.code).toBe(0);
      expect(first.out).toContain(": valid");

      priorChange(root, "00002-i1-alpha-qa-r1", "qa", 2);
      priorChange(root, "00003-i1-alpha-qa-r2", "qa", 3);
      writeFile(
        root,
        "artifacts/demo/records/00001-i1-alpha-qa-r1/started.yaml",
        STARTED("qa", 1),
      );
      const spent = await runValidate(file);
      expect(spent.code).toBe(1);
      expect(spent.err).toContain("last acceptance call");
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

function factoryValidateQAOutcomesPart3() {
  it(
    "ignores same-step launches after the record's sequence",
    withTmp(async (root) => {
      writeFile(
        root,
        "artifacts/demo/records/00001-i1-alpha-qa-r1/started.yaml",
        STARTED("qa", 1),
      );
      const file = writeFile(
        root,
        "artifacts/demo/records/00001-i1-alpha-qa-r1/outcome.yaml",
        'status: done\nsummary: needs work\nqa:\n  verdict: changes\n  findings: ["task.txt:1 needs v2"]\n',
      );
      priorChange(root, "00043-i1-alpha-qa-r2", "qa", 43);
      priorChange(root, "00044-i1-alpha-qa-r3", "qa", 44);
      const result = await runValidate(file);
      expect(result.code).toBe(0);
      expect(result.out).toContain(": valid");
    }),
  );

  it(
    "ignores launches from before the record's revision",
    withTmp(async (root) => {
      writeFile(
        root,
        "artifacts/demo/records/00001-i1-alpha-qa-r1/started.yaml",
        STARTED("qa", 1, 1),
      );
      const file = writeFile(
        root,
        "artifacts/demo/records/00001-i1-alpha-qa-r1/outcome.yaml",
        'status: done\nsummary: needs work\nqa:\n  verdict: changes\n  findings: ["task.txt:1 needs v2"]\n',
      );
      priorChange(root, "00002-i1-alpha-qa-r1", "qa", 2, 0);
      priorChange(root, "00003-i1-alpha-qa-r2", "qa", 3, 0);
      priorPark(root, "00004-i1-alpha-park-r1", 4, 0);
      const result = await runValidate(file);
      expect(result.code).toBe(0);
      expect(result.out).toContain(": valid");
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

function registerFactoryValidatePart18(): void {
  it(
    "resolves a plan-check concern id against the record tree",
    withTmp(async (root) => {
      const concernText = "the retry window drops head names";
      writeFile(
        root,
        "records/00010-i1-alpha-implement-r1/started.yaml",
        STARTED("implement"),
      );
      writeFile(
        root,
        "records/00010-i1-alpha-implement-r1/outcome.yaml",
        `status: done\nsummary: alpha shipped\nconcerns:\n  - kind: risk\n    calibration: architect\n    text: ${concernText}\n`,
      );
      writeFile(root, "plan.md", "# Plan\n\n- beta — Beta works.\n");
      const record = "records/00042-i1-plancheck-r1";
      writeFile(root, `${record}/started.yaml`, STARTED("plancheck"));
      const id = recordedConcernId({ kind: "risk", text: concernText });
      const accepted = writeFile(
        root,
        `${record}/outcome.yaml`,
        `status: done\nsummary: checked\nplanCheck:\n  verdict: progress\n  evidence: []\n  followUps:\n    - kind: amend\n      slug: beta\n      reason: retry beta\n  concerns:\n    - id: ${id}\n      action: resolve\n      reason: the retry window is on the head\n`,
      );
      const ok = await runValidate(accepted);
      expect(ok.code).toBe(0);
      expect(ok.out).toContain(": valid");

      const ghost = writeFile(
        root,
        `${record}/outcome.yaml`,
        "status: done\nsummary: checked\nplanCheck:\n  verdict: progress\n  evidence: []\n  followUps:\n    - kind: amend\n      slug: beta\n      reason: retry beta\n  concerns:\n    - id: c-ghost\n      action: resolve\n      reason: already answered\n",
      );
      const bad = await runValidate(ghost);
      expect(bad.code).toBe(1);
      expect(bad.err).toContain('concern id "c-ghost" is not an open concern');
    }),
  );
}

describe("factory validate", () => {
  registerFactoryValidatePart15();

  registerFactoryValidatePart16();

  registerFactoryValidatePart17();

  registerFactoryValidatePart18();
});

describe("factory validate: QA outcomes", () => {
  factoryValidateQAOutcomesPart1();

  factoryValidateQAOutcomesPart2();

  factoryValidateQAOutcomesPart3();
});
