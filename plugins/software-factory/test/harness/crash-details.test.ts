import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  exitDetails,
  exitWithDetails,
  lastNonBannerLine,
  scrubSecrets,
  stopDetails,
} from "../../src/harness/details.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import { classifyAcpxTurn } from "../../src/harness/acpx/classify.js";
import type { AcpxConfig } from "../../src/harness/acpx/config.js";
import { OmpHarness } from "../../src/harness/omp/harness.js";
import { zeroUsage } from "../../src/harness/usage.js";
import type { Stop } from "../../src/harness/types.js";

const SECRET = "sk-live-TOPSECRETTOKEN1234567890";
const TIMEOUTS = { idleMs: 0, wallMs: 5_000 };
const ACPX_BANNER =
  "[acpx] session claude-code-test (00000000-0000-0000-0000-000000000000) · /tmp · agent connected";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function stubBinary(dir: string, name: string, body: string): string {
  const binary = path.join(dir, name);
  fs.writeFileSync(
    binary,
    `#!/usr/bin/env bun\nimport fs from "node:fs";\n${body}\n`,
    {
      mode: 0o755,
    },
  );
  return binary;
}

function detailsOf(stop: Stop): string {
  const details = stop.kind === "infra" ? stop.details : undefined;
  expect(stop.kind).toBe("infra");
  expect(details).toBeDefined();
  return details ?? "";
}

async function ompTurn(binary: string, dir: string) {
  const harness = new OmpHarness({
    binary,
    sessionDir: path.join(dir, "sessions"),
    readyTimeoutMs: 2_000,
  });
  return harness.turn({
    model: { id: "opencode-go/beam-free" },
    cwd: dir,
    prompt: "x",
    timeouts: TIMEOUTS,
  });
}

async function opencodeTurn(binary: string, dir: string) {
  const acpx: AcpxConfig = {
    agent: "opencode acp",
    raw: true,
    effort: {
      configId: "effort",
    },
    usage: { cache: true },
  };
  const harness = new AcpxHarness({ id: "opencode", binary, acpx });
  return harness.turn({
    model: { id: "opencode/fake-model" },
    cwd: dir,
    prompt: "x",
    timeouts: TIMEOUTS,
  });
}

describe("stop details helper", () => {
  it("masks token-shaped secrets in several common spellings", () => {
    expect(scrubSecrets(`Authorization: Bearer ${SECRET}`)).not.toContain(
      SECRET,
    );
    expect(scrubSecrets(`api_key=${SECRET}`)).not.toContain(SECRET);
    expect(scrubSecrets(`token="${SECRET}"`)).not.toContain(SECRET);
    expect(
      scrubSecrets("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"),
    ).not.toContain("ghp_ABCDEF");
  });

  it("keeps the tail of a very long message and drops the head", () => {
    const details = stopDetails(`${"x".repeat(2_000)} the real error`);
    expect(details?.startsWith("…")).toBe(true);
    expect(details?.endsWith("the real error")).toBe(true);
    expect(details?.length).toBeLessThanOrEqual(501);
  });

  it("returns nothing for empty stderr and describes a bare exit", () => {
    expect(stopDetails("  \n ")).toBeUndefined();
    expect(exitDetails(7, null)).toBe("exit 7, signal none");
    expect(exitDetails(null, "SIGKILL")).toBe("exit none, signal SIGKILL");
    expect(exitDetails(null, null)).toBeUndefined();
  });

  it("keeps the exit facts with the last non-banner line inside the cap", () => {
    const stderr = `${ACPX_BANNER}\nfirst detail\n${ACPX_BANNER}\nlast detail ${SECRET}`;
    expect(lastNonBannerLine(stderr)).toBe(`last detail ${SECRET}`);
    expect(exitWithDetails(1, null, lastNonBannerLine(ACPX_BANNER))).toBe(
      "exit 1, signal none",
    );

    const details =
      exitWithDetails(1, null, `${"x".repeat(2_000)} last detail ${SECRET}`) ??
      "";
    expect(details.startsWith("exit 1, signal none: …")).toBe(true);
    expect(details.endsWith("last detail [redacted]")).toBe(true);
    expect(details).not.toContain(SECRET);
    expect(details.length).toBeLessThanOrEqual(501);
  });
});

describe("AcpxHarness crash classification", () => {
  it("keeps SIGTERM and SIGINT with no result as cancelled", () => {
    for (const signal of ["SIGTERM", "SIGINT"]) {
      expect(
        classifyAcpxTurn({
          summary: { text: "", usage: zeroUsage(), errors: [] },
          code: null,
          signal,
          timedOut: false,
        }),
      ).toEqual({ kind: "cancelled" });
    }
  });

  it("lets a parsed result outrank the exit facts", () => {
    expect(
      classifyAcpxTurn({
        summary: {
          text: "OUTCOME",
          usage: zeroUsage(),
          stopReason: "end_turn",
          errors: [],
        },
        code: 5,
        signal: null,
        timedOut: false,
        stderr: "teardown failed",
      }),
    ).toEqual({ kind: "done" });
  });

  it("keeps the last ACP error frame with the exit facts", () => {
    const stop = classifyAcpxTurn({
      summary: {
        text: "",
        usage: zeroUsage(),
        errors: [
          { code: -32603, message: "first frame" },
          {
            code: -32603,
            message: `agent stopped with token=${SECRET}`,
            data: { details: "last frame details" },
          },
        ],
      },
      code: 1,
      signal: null,
      timedOut: false,
      stderr: `${ACPX_BANNER}\nstderr that must not win`,
    });
    const details = detailsOf(stop);
    expect(details).toContain("exit 1");
    expect(details).toContain("last frame details");
    expect(details).not.toContain("first frame");
    expect(details).not.toContain("stderr that must not win");
    expect(details).not.toContain("agent connected");
    expect(details).not.toContain(SECRET);
  });
});

describe("OmpHarness crash details", () => {
  it("carries the errno when the binary is missing", async () => {
    const dir = tempDir("omp-missing-");
    try {
      const result = await ompTurn(path.join(dir, "missing-omp"), dir);
      const details = detailsOf(result.stop);
      expect(details).toContain("ENOENT");
      expect(details).toContain("missing-omp");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("carries masked stderr from a process that exits non-zero", async () => {
    const dir = tempDir("omp-stderr-");
    try {
      const binary = stubBinary(
        dir,
        "boom-omp.js",
        `fs.writeSync(2, "fatal: worker crashed with key ${SECRET}");\nprocess.exit(3);`,
      );
      const result = await ompTurn(binary, dir);
      const details = detailsOf(result.stop);
      expect(details).toContain("worker crashed");
      expect(details).not.toContain(SECRET);
      expect(details).toContain("[redacted]");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("describes the exit code and signal when stderr is empty", async () => {
    const dir = tempDir("omp-silent-");
    try {
      const binary = stubBinary(dir, "silent-omp.js", "process.exit(7);");
      const result = await ompTurn(binary, dir);
      expect(detailsOf(result.stop)).toBe("exit 7, signal none");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});

describe("AcpxHarness opencode raw route crash details", () => {
  it("carries the errno when the binary is missing", async () => {
    const dir = tempDir("oc-missing-");
    try {
      const result = await opencodeTurn(
        path.join(dir, "missing-opencode"),
        dir,
      );
      const details = detailsOf(result.stop);
      expect(details).toContain("ENOENT");
      expect(details).toContain("missing-opencode");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("carries masked stderr from a process that exits non-zero", async () => {
    const dir = tempDir("oc-stderr-");
    try {
      const binary = stubBinary(
        dir,
        "boom-opencode.js",
        `fs.writeSync(2, "fatal: worker crashed with key ${SECRET}");\nprocess.exit(3);`,
      );
      const result = await opencodeTurn(binary, dir);
      const details = detailsOf(result.stop);
      expect(details).toContain("exit 3");
      expect(details).toContain("worker crashed");
      expect(details).not.toContain(SECRET);
      expect(details).toContain("[redacted]");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("describes the exit code and signal when stderr is empty", async () => {
    const dir = tempDir("oc-silent-");
    try {
      const binary = stubBinary(dir, "silent-opencode.js", "process.exit(7);");
      const result = await opencodeTurn(binary, dir);
      expect(detailsOf(result.stop)).toBe("exit 7, signal none");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("records the exit code when the prompt writes only the banner", async () => {
    const dir = tempDir("oc-banner-");
    try {
      const binary = stubBinary(
        dir,
        "banner-opencode.js",
        `const args = process.argv.slice(2);\nif (args.includes("sessions") && args.includes("new")) process.exit(0);\nfs.writeSync(2, ${JSON.stringify(`${ACPX_BANNER}\n`)});\nprocess.exit(1);`,
      );
      const result = await opencodeTurn(binary, dir);
      const details = detailsOf(result.stop);
      expect(details).toBe("exit 1, signal none");
      expect(details).not.toContain("agent connected");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("keeps a setup ACP error with the exit facts", async () => {
    const dir = tempDir("oc-setup-error-");
    try {
      const frame = JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "setup agent crashed" },
      });
      const binary = stubBinary(
        dir,
        "setup-error-opencode.js",
        `fs.writeSync(2, ${JSON.stringify(`${ACPX_BANNER}\n`)});\nfs.writeSync(1, ${JSON.stringify(`${frame}\n`)});\nprocess.exit(1);`,
      );
      const result = await opencodeTurn(binary, dir);
      const details = detailsOf(result.stop);
      expect(details).toContain("exit 1");
      expect(details).toContain("setup agent crashed");
      expect(details).not.toContain("agent connected");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it("keeps the tail of very long stderr", async () => {
    const dir = tempDir("oc-long-");
    try {
      const binary = stubBinary(
        dir,
        "long-opencode.js",
        `fs.writeSync(2, "x".repeat(2000) + " end of the real error: token=${SECRET}");\nprocess.exit(1);`,
      );
      const result = await opencodeTurn(binary, dir);
      const details = detailsOf(result.stop);
      expect(details.startsWith("exit 1, signal none: …")).toBe(true);
      expect(details.endsWith("end of the real error: token=[redacted]")).toBe(
        true,
      );
      expect(details).not.toContain(SECRET);
      expect(details.length).toBeLessThanOrEqual(501);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});
