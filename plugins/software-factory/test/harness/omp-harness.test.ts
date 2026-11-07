import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  extractAgentBody,
  extractJsonFromText,
  OmpHarness,
} from "../../src/harness/omp/harness.js";

describe("OmpHarness helper functions", () => {
  it("extractAgentBody strips YAML frontmatter cleanly", () => {
    const withFrontmatter = `---
name: developer
tools: [bash, edit]
description: Developer agent
---

# Developer Instructions
Follow engineering philosophy.
`;
    expect(extractAgentBody(withFrontmatter)).toBe(
      "# Developer Instructions\nFollow engineering philosophy."
    );

    const withoutFrontmatter = "# Pure Agent\nNo frontmatter here.";
    expect(extractAgentBody(withoutFrontmatter)).toBe(withoutFrontmatter);
  });

  it("extractJsonFromText parses plain JSON, fenced JSON, and substring JSON", () => {
    // 1. Plain JSON
    expect(extractJsonFromText('{"status":"ok","count":42}')).toEqual({
      status: "ok",
      count: 42,
    });

    // 2. Fenced ```json ... ```
    const fenced = `
Here is the result:
\`\`\`json
{
  "status": "ok",
  "evidence": ["gate passed"]
}
\`\`\`
Done!
`;
    expect(extractJsonFromText(fenced)).toEqual({
      status: "ok",
      evidence: ["gate passed"],
    });

    // 3. Substring without fences
    const conversational = `
I have verified the results. The payload is:
{"status":"ok","items":["a","b"]}
Hope this helps.
`;
    expect(extractJsonFromText(conversational)).toEqual({
      status: "ok",
      items: ["a", "b"],
    });
  });

  it("extractJsonFromText throws when no JSON structure is found", () => {
    expect(() => extractJsonFromText("Not JSON at all")).toThrow();
  });
});

describe("OmpHarness Process & Timeout Mechanics", () => {
  it("complete timeout kills the process", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-timeout-test-"));
    const mockBinary = path.join(tmpDir, "mock-slow-omp.sh");
    // Mock binary that hangs in sleep (using exec so SIGTERM reaches sleep directly)
    fs.writeFileSync(mockBinary, "#!/bin/sh\nexec sleep 30\n", { mode: 0o755 });

    try {
      const harness = new OmpHarness({
        ompBinary: mockBinary,
        runtimeDir: tmpDir,
        timeoutMs: 50,
      });

      const start = Date.now();
      let thrownError: Error | undefined;
      try {
        await harness.complete({
          role: "simpler",
          models: ["test-model"],
          system: "sys",
          prompt: "prompt",
          schema: { type: "object" },
          timeoutMs: 50,
        });
      } catch (err: any) {
        thrownError = err;
      }
      const elapsed = Date.now() - start;

      expect(thrownError).toBeDefined();
      expect(thrownError?.message).toContain("timed out after 50ms");
      expect(thrownError?.message).toContain("process terminated");
      // Must have killed the process quickly, not waited 30s
      expect(elapsed).toBeLessThan(3000);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it("timeoutSec honored on agent run turn", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-run-timeout-"));
    const mockBinary = path.join(tmpDir, "mock-slow-omp.sh");
    fs.writeFileSync(mockBinary, "#!/bin/sh\nexec sleep 30\n", { mode: 0o755 });

    try {
      const harness = new OmpHarness({
        ompBinary: mockBinary,
        runtimeDir: tmpDir,
        timeoutMs: 300_000, // default 5m
      });

      const start = Date.now();
      const outcome = await harness.run({
        agent: "developer",
        definition: "# Dev",
        prompt: "implement",
        role: "workhorse",
        models: ["test-model"],
        tools: ["read"],
        cwd: tmpDir,
        outputSchema: { type: "object" },
        label: "test/timeout",
        session: { keep: false },
        timeoutSec: 0.05, // 50ms timeout overrides 300s default!
      });
      const elapsed = Date.now() - start;

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.transient).toBe(true);
        expect(outcome.error).toContain("timed out");
      }
      expect(elapsed).toBeLessThan(3000);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it("regenerates overlay each run from effective pipeline", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-overlay-regen-"));
    const mockBinary = path.join(tmpDir, "mock-noop-omp.sh");
    fs.writeFileSync(
      mockBinary,
      '#!/bin/sh\necho \'{"type":"session","id":"test-s"}\'\necho \'{"type":"turn_end","message":{"role":"assistant","content":[{"type":"text","text":"{\\"ok\\":true}"}],"stopReason":"stop"}}\'\n',
      { mode: 0o755 }
    );

    const pipeline1: any = {
      models: {
        roles: {
          workhorse: { model: "model-v1:max" },
        },
      },
    };

    const pipeline2: any = {
      models: {
        roles: {
          workhorse: { model: "model-v2:high" },
        },
      },
    };

    try {
      const harness = new OmpHarness({
        ompBinary: mockBinary,
        runtimeDir: tmpDir,
        pipeline: pipeline1,
      });

      await harness.complete({
        role: "workhorse",
        models: ["m"],
        system: "s",
        prompt: "p",
        schema: { type: "object" },
      });

      const overlayPath = path.join(tmpDir, "omp-overlay.yaml");
      expect(fs.existsSync(overlayPath)).toBe(true);
      const content1 = fs.readFileSync(overlayPath, "utf8");
      expect(content1).toContain("model-v1:max");

      // Update pipeline to effective task pipeline
      harness.setPipeline(pipeline2);

      await harness.complete({
        role: "workhorse",
        models: ["m"],
        system: "s",
        prompt: "p",
        schema: { type: "object" },
      });

      const content2 = fs.readFileSync(overlayPath, "utf8");
      expect(content2).toContain("model-v2:high");
      expect(content2).not.toContain("model-v1:max");
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });
});
