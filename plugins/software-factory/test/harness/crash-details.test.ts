import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  exitDetails,
  scrubSecrets,
  stopDetails,
} from "../../src/harness/details.js";
import { AcpxHarness } from "../../src/harness/acpx/harness.js";
import type { AcpxConfig } from "../../src/harness/acpx/config.js";
import { OmpHarness } from "../../src/harness/omp/harness.js";
import type { Stop } from "../../src/harness/types.js";

const SECRET = "sk-live-TOPSECRETTOKEN1234567890";
const TIMEOUTS = { idleMs: 0, wallMs: 5_000 };

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function stubBinary(dir: string, name: string, body: string): string {
  const binary = path.join(dir, name);
  fs.writeFileSync(binary, `#!/usr/bin/env bun\n${body}\n`, { mode: 0o755 });
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
      levels: ["low", "medium", "high", "xhigh", "max"],
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
        `process.stderr.write("fatal: worker crashed with key ${SECRET}");\nprocess.exit(3);`,
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
        `process.stderr.write("fatal: worker crashed with key ${SECRET}");\nprocess.exit(3);`,
      );
      const result = await opencodeTurn(binary, dir);
      const details = detailsOf(result.stop);
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

  it("keeps the tail of very long stderr", async () => {
    const dir = tempDir("oc-long-");
    try {
      const binary = stubBinary(
        dir,
        "long-opencode.js",
        `process.stderr.write("x".repeat(2000) + " end of the real error: token=${SECRET}");\nprocess.exit(1);`,
      );
      const result = await opencodeTurn(binary, dir);
      const details = detailsOf(result.stop);
      expect(details.startsWith("…")).toBe(true);
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
