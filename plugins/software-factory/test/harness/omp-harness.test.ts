import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  extractAgentBody,
  extractJsonFromText,
  parseUnknownToolNames,
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

  it("parseUnknownToolNames parses singular and unknown-tool forms, strips periods, dedupes", () => {
    expect(parseUnknownToolNames("Error: Built-in tools unavailable in this session: checkpoint, rewind.\nRun `omp --help`.")).toEqual(["checkpoint", "rewind"]);
    expect(parseUnknownToolNames("Error: Built-in tool unavailable in this session: rewind.")).toEqual(["rewind"]);
    expect(parseUnknownToolNames("Error: Unknown tools in --tools: frobnicate, bogus.")).toEqual(["frobnicate", "bogus"]);
    expect(parseUnknownToolNames("Error: Unknown tool in --tools: frobnicate.")).toEqual(["frobnicate"]);
    expect(parseUnknownToolNames("Error: Built-in tools unavailable in this session: checkpoint.\nError: Unknown tools in --tools: frobnicate.")).toEqual(["checkpoint", "frobnicate"]);
    expect(parseUnknownToolNames("Error: Built-in tools unavailable in this session: rewind, rewind.")).toEqual(["rewind"]);
    expect(parseUnknownToolNames("some unrelated failure")).toEqual([]);
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

  it("timeout kills child process group completely including grandchildren without killing factory", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-pgid-test-"));
    const pidFile = path.join(tmpDir, "child.pid");
    const mockBinary = path.join(tmpDir, "mock-group-omp.sh");
    // Mock binary that spawns background child sleep processes in its process group
    fs.writeFileSync(
      mockBinary,
      `#!/bin/sh
echo "$$" > "${pidFile}"
sleep 30 &
sleep 30 &
wait
`,
      { mode: 0o755 }
    );

    try {
      const harness = new OmpHarness({
        ompBinary: mockBinary,
        runtimeDir: tmpDir,
        timeoutMs: 300_000,
      });

      const initialFactoryPid = process.pid;
      const outcome = await harness.run({
        agent: "developer",
        definition: "# Dev",
        prompt: "implement",
        role: "workhorse",
        models: ["test-model"],
        tools: ["read"],
        cwd: tmpDir,
        outputSchema: { type: "object" },
        label: "test/pgid-timeout",
        session: { keep: false },
        timeoutSec: 0.2, // 200ms timeout
      });

      // Factory process must be completely unharmed
      expect(process.pid).toBe(initialFactoryPid);
      expect(outcome.ok).toBe(false);

      // Read child shell PID and check if any processes from that group survive
      if (fs.existsSync(pidFile)) {
        const childPid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
        // Give kernel a moment to reap
        await new Promise((r) => setTimeout(r, 200));
        let groupAlive = true;
        try {
          process.kill(-childPid, 0);
        } catch {
          groupAlive = false;
        }
        expect(groupAlive).toBe(false);
      }
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it("shutdown handler terminates child groups and marks running steps interrupted", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-shutdown-test-"));
    const { spawn } = await import("bun");
    const {
      registerChildGroup,
      unregisterChildGroup,
      registerActiveStep,
      terminateAllChildGroups,
      markActiveStepsInterrupted,
    } = await import("../../src/core/shutdown.js");
    const { writeYamlAtomic, readYaml } = await import("../../src/core/records/io.js");

    try {
      // 1. Spawn a detached child in its own group
      const child = spawn(["sleep", "30"], { detached: true });
      expect(child.pid).toBeGreaterThan(0);
      registerChildGroup(child.pid);

      // 2. Create an active step record with status: started
      const stepDir = path.join(tmpDir, "001-test-step-a1");
      fs.mkdirSync(stepDir, { recursive: true });
      const metaPath = path.join(stepDir, "meta.yaml");
      await writeYamlAtomic(metaPath, {
        seq: 1,
        name: "test-step",
        attempt: 1,
        status: "started",
        startedAt: new Date().toISOString(),
      });
      registerActiveStep({
        recordDir: stepDir,
        metaPath,
        taskDir: tmpDir,
      });

      // 3. Trigger shutdown routine
      await terminateAllChildGroups(100);
      await markActiveStepsInterrupted("SIGTERM");

      // 4. Verify child was terminated
      let childAlive = true;
      try {
        process.kill(child.pid, 0);
      } catch {
        childAlive = false;
      }
      expect(childAlive).toBe(false);

      // 5. Verify step meta marked interrupted cleanly
      const updatedMeta = await readYaml<any>(metaPath);
      expect(updatedMeta.status).toBe("interrupted");
      expect(updatedMeta.endedAt).toBeDefined();

      // 6. Verify journal recorded the interruption
      const journalPath = path.join(tmpDir, "journal.ndjson");
      expect(fs.existsSync(journalPath)).toBe(true);
      const journalContent = fs.readFileSync(journalPath, "utf8");
      expect(journalContent).toContain('"type":"step_interrupted"');
      expect(journalContent).toContain('"signal":"SIGTERM"');
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

  it("two run() calls for the same agent+session reuse the same system-prompt path", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-sysprompt-reuse-"));
    const mockBinary = path.join(tmpDir, "mock-noop-omp.sh");
    fs.writeFileSync(
      mockBinary,
      '#!/bin/sh\necho \'{"type":"session","id":"sess-reuse-1"}\'\necho \'{"type":"turn_end","message":{"role":"assistant","content":[{"type":"text","text":"{\\"ok\\":true}"}],"stopReason":"stop"}}\'\n',
      { mode: 0o755 }
    );
    try {
      const harness = new OmpHarness({ ompBinary: mockBinary, runtimeDir: tmpDir });
      const baseRun = {
        agent: "developer",
        definition: "---\nname: developer\n---\n\n# Dev\n",
        role: "workhorse",
        models: ["m"],
        tools: [],
        cwd: tmpDir,
        outputSchema: {},
        label: "reuse-test",
        session: { resume: "sess-reuse-1", keep: true },
      };
      await harness.run({ ...baseRun, prompt: "first" });
      await harness.run({ ...baseRun, prompt: "second" });
      const sysDir = path.join(tmpDir, "system-prompts");
      const files = fs.readdirSync(sysDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toBe("developer-sess-reuse-1.md");
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });
});
