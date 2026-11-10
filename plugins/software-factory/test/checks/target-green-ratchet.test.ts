import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runCheck } from "../../src/core/checks/runner.js";
import type { CheckContext } from "../../src/core/checks/types.js";
import type { GatesBaselineArtifact, InfraArtifact } from "../../src/core/artifacts.js";

// (f) Target-green baseline ratchet. `{gate:test}` required a full-suite exit
// 0 while the repository baseline was red for an environment reason, so an
// approved docs-only item was unmergeable (omp-workspaces decision 012). The
// gates phase already ratchets against gates-baseline.yaml; target-green must
// do the same: fail only on NEW failures vs baseline.

const RUNNER = `#!/bin/sh
OUT=""
PREV=""
for a in "$@"; do
  if [ "$PREV" = "--junitxml" ]; then OUT="$a"; fi
  case "$a" in
    --junitxml=*) OUT="\${a#--junitxml=}" ;;
    --junitxml) PREV="--junitxml" ;;
    *) PREV="" ;;
  esac
done
if [ -f no-junit.flag ]; then
  echo "runner crashed before writing a report" >&2
  exit 1
fi
FAILS="tests.test_base"
if [ -f fails.txt ]; then
  FAILS="$(cat fails.txt | tr '\\n' ' ')"
fi
if [ -n "$OUT" ]; then
{
  echo '<testsuite name="suite" tests="2">'
  for t in $FAILS; do
    cls="\${t%.*}"
    name="\${t##*.}"
    echo "  <testcase classname=\\"\${cls}\\" name=\\"\${name}\\"><failure message=\\"boom\\"/></testcase>"
  done
  echo '  <testcase classname="tests" name="test_ok"/>'
  echo '</testsuite>'
} > "$OUT"
fi
if [ -n "$(echo $FAILS)" ]; then exit 1; fi
exit 0
`;

describe("target-green: baseline ratchet for gate targets", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tg-ratchet-"));
    fs.writeFileSync(path.join(dir, "runner.sh"), RUNNER, { mode: 0o755 });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function ctx(
    baseline: GatesBaselineArtifact | undefined,
    infra?: InfraArtifact
  ): CheckContext {
    return {
      repo: undefined as any,
      wt: dir,
      base: "main",
      project: { orchestrationFolder: ".factory" } as any,
      pipeline: {
        limits: {},
        models: { roles: {} },
        agents: {},
        flows: { simple: { steps: [] }, story: {}, spike: {} },
      } as any,
      infra: infra ?? {
        setup: [],
        gates: [{ id: "test", command: `sh "${path.join(dir, "runner.sh")}"` }],
        testRunner: {
          command: `sh "${path.join(dir, "runner.sh")}"`,
          junitArg: "--junitxml={path}",
        },
      },
      baseline,
      kind: "dev",
      task: "t",
      taskWt: dir,
      taskDir: dir,
      target: { gate: "test" },
      limits: {},
      outputBytes: 8192,
    };
  }

  const redBaseline: GatesBaselineArtifact = {
    gates: [{ id: "test", command: "runner", status: "fail", failingTests: ["tests.test_base"] }],
  };

  it("red baseline + no new failures passes (the approved docs-only item case)", async () => {
    const res = await runCheck("target-green", ctx(redBaseline));
    expect(res.ok).toBe(true);
    expect(res.summary).toContain("matches baseline");
    expect(res.summary).toContain("no new failing tests");
    expect(res.fingerprint).toBeTruthy();
  });

  it("red baseline + a NEW failing test fails", async () => {
    fs.writeFileSync(path.join(dir, "fails.txt"), "tests.test_base\ntests.test_new\n");
    const res = await runCheck("target-green", ctx(redBaseline));
    expect(res.ok).toBe(false);
    expect(res.summary).toContain("NEW failures vs baseline");
    expect(res.summary).toContain("tests.test_new");
    // Only the new id is reported, never the known baseline failure.
    expect(res.summary).not.toContain("tests.test_base");
    expect((res.details as { failingTests?: string[] }).failingTests).toEqual(["tests.test_new"]);
  });

  it("green baseline + failure is a regression and fails", async () => {
    fs.writeFileSync(path.join(dir, "fails.txt"), "tests.test_new\n");
    const greenBaseline: GatesBaselineArtifact = {
      gates: [{ id: "test", status: "pass" }],
    };
    const res = await runCheck("target-green", ctx(greenBaseline));
    expect(res.ok).toBe(false);
    expect(res.summary).toContain("tests.test_new");
  });

  it("no baseline artifact keeps the strict exit-0 requirement", async () => {
    // No fails.txt => the runner still reports the baseline failure and exits 1.
    const res = await runCheck("target-green", ctx(undefined));
    expect(res.ok).toBe(false);
    expect(res.summary).toContain("tests.test_base");
  });

  it("red baseline + missing JUnit report cannot be attributed and fails", async () => {
    fs.writeFileSync(path.join(dir, "no-junit.flag"), "1");
    const res = await runCheck("target-green", ctx(redBaseline));
    expect(res.ok).toBe(false);
    expect(res.summary).toContain("no JUnit XML");
    expect(res.summary).toContain("treating it as new");
  });

  it("red baseline, non-junit gate still red -> matches baseline", async () => {
    const nonJunitInfra: InfraArtifact = {
      setup: [],
      gates: [{ id: "test", command: `sh "${path.join(dir, "runner.sh")}"` }],
      testRunner: { command: `sh "${path.join(dir, "runner.sh")}"` },
    };
    // Non-junit path: runner exits 1 (the baseline failure is present).
    const res = await runCheck("target-green", ctx(redBaseline, nonJunitInfra));
    expect(res.ok).toBe(true);
    expect(res.summary).toContain("matches baseline");
  });

  it("red baseline, gate now green reports improvement", async () => {
    // No failing tests: empty fails set -> runner exits 0.
    const script = path.join(dir, "runner.sh");
    fs.writeFileSync(
      script,
      `#!/bin/sh\nOUT=""\nfor a in "$@"; do case "$a" in --junitxml=*) OUT="\${a#--junitxml=}";; esac; done\necho '<testsuite name="s"><testcase classname="tests" name="test_base"/></testsuite>' > "$OUT"\nexit 0\n`,
      { mode: 0o755 }
    );
    const res = await runCheck("target-green", ctx(redBaseline));
    expect(res.ok).toBe(true);
    expect(res.summary).toContain("passed (green)");
  });
});
