import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runProcess } from "../../src/core/proc.js";
import { terminateAllChildGroups } from "../../src/core/shutdown.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForFile(file: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(file)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${file}`);
    await sleep(20);
  }
}

describe("child process group shutdown", () => {
  it("terminateAllChildGroups kills a spawned child group, not only its leader", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shutdown-test-"));
    const grandchildPid = path.join(dir, "grandchild.pid");
    const grandchildSurvived = path.join(dir, "grandchild-survived");
    // The background subshell is a separate process in the leader's group; if
    // the group is not killed it outlives the leader and writes the marker.
    const script = [
      `(echo $BASHPID > "${grandchildPid}"; sleep 1; echo alive > "${grandchildSurvived}") &`,
      "wait",
    ].join("\n");

    const running = runProcess({ cmd: ["bash", "-c", script], cwd: dir });
    let pid: number | undefined;
    try {
      await waitForFile(grandchildPid);
      pid = Number(fs.readFileSync(grandchildPid, "utf8").trim());
      expect(pid).toBeGreaterThan(0);

      await terminateAllChildGroups(200);
      const result = await running;

      expect(result.signal).toBe("SIGTERM");
      await sleep(1_200);
      expect(fs.existsSync(grandchildSurvived)).toBe(false);
    } finally {
      if (pid) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // Already dead: the assertion above is the test.
        }
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
