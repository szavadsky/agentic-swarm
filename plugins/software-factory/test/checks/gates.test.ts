import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Repo } from "../../src/core/git/repo.js";
import { runGates } from "../../src/core/checks/gates.js";
import { runCheck } from "../../src/core/checks/runner.js";
import type { CheckContext } from "../../src/core/checks/types.js";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";

describe("Gates check & ratchet (§9, §12.3)", () => {
  let tmpRepo: TmpRepo;
  let wtRoot: string;
  let repo: Repo;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), "factory-wt-gates-"));
    repo = new Repo({
      mainRoot: tmpRepo.dir,
      worktreeRoot: wtRoot,
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
    if (fs.existsSync(wtRoot)) {
      fs.rmSync(wtRoot, { recursive: true, force: true });
    }
  });

  function makeContext(overrides?: Partial<CheckContext>): CheckContext {
    return {
      repo,
      wt: tmpRepo.dir,
      base: "HEAD",
      project: { orchestrationFolder: ".factory", worktreeRoot: wtRoot },
      pipeline: {
        models: { roles: {} },
        agents: {},
        flows: { simple: { steps: [] }, story: {}, spike: {} },
        limits: { gateRetries: 1 },
      },
      limits: { gateRetries: 1 },
      outputBytes: 4000,
      ...overrides,
    };
  }

  it("ratchet: baseline green must stay green", async () => {
    const ctx = makeContext({
      infra: {
        setup: [],
        gates: [
          { id: "lint", command: "true" },
          { id: "typecheck", command: "false" },
        ],
        testRunner: { command: "true" },
      },
      baseline: {
        gates: [
          { id: "lint", status: "pass" },
          { id: "typecheck", status: "pass" }, // typecheck was green in baseline!
        ],
      },
    });

    const res = await runGates(ctx);
    expect(res.ok).toBe(false); // typecheck broke ratchet
    const typecheckResult = res.results.find((r) => r.id === "typecheck");
    expect(typecheckResult?.status).toBe("fail");

    // Also verify via runCheck("gates")
    const checkRes = await runCheck("gates", ctx);
    expect(checkRes.ok).toBe(false);
    expect(checkRes.summary).toContain("typecheck");
  });

  it("ratchet: non-baseline-green gates are reported but do not fail", async () => {
    const ctx = makeContext({
      infra: {
        setup: [],
        gates: [
          { id: "lint", command: "true" },
          { id: "legacy-broken", command: "false" },
        ],
        testRunner: { command: "true" },
      },
      baseline: {
        gates: [
          { id: "lint", status: "pass" },
          { id: "legacy-broken", status: "fail" }, // Was already failing in baseline
        ],
      },
    });

    const res = await runGates(ctx);
    expect(res.ok).toBe(true); // Ratchet not broken because legacy-broken was not green
    const broken = res.results.find((r) => r.id === "legacy-broken");
    expect(broken?.status).toBe("fail");

    const checkRes = await runCheck("gates", ctx);
    expect(checkRes.ok).toBe(true);
  });

  it("flaky: retries failed gate and marks flaky if retry succeeds", async () => {
    // Write a tiny script that fails once then succeeds
    const counterFile = path.join(tmpRepo.dir, "counter.txt");
    const scriptPath = path.join(tmpRepo.dir, "flaky.sh");
    fs.writeFileSync(
      scriptPath,
      `#!/bin/sh
if [ ! -f "${counterFile}" ]; then
  echo 1 > "${counterFile}"
  exit 1
else
  exit 0
fi
`,
      { mode: 0o755 }
    );

    const ctx = makeContext({
      infra: {
        setup: [],
        gates: [{ id: "flaky-gate", command: `sh "${scriptPath}"` }],
        testRunner: { command: "true" },
      },
      baseline: {
        gates: [{ id: "flaky-gate", status: "pass" }],
      },
      limits: { gateRetries: 2 },
    });

    const res = await runGates(ctx);
    expect(res.ok).toBe(true);
    const gateEntry = res.results.find((r) => r.id === "flaky-gate");
    expect(gateEntry?.status).toBe("flaky");

    // runCheck reports flaky gates in check result
    fs.unlinkSync(counterFile); // Reset counter
    const checkRes = await runCheck("gates", ctx);
    expect(checkRes.ok).toBe(true);
    expect(checkRes.flaky).toContain("flaky-gate");
  });
});
