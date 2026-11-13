import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  checkDiskSpace,
  assertDiskSpace,
  resetDiskSpaceProbe,
  LowDiskSpaceStopError,
  DEFAULT_MIN_FREE_DISK_MB,
} from "../src/core/disk-space.js";
import { readJournal } from "../src/core/journal.js";
import { readYaml } from "../src/core/records/io.js";

describe("disk-space guards", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "disk-space-test-"));
    resetDiskSpaceProbe();
  });

  afterEach(() => {
    resetDiskSpaceProbe();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("checks worktreeRoot, runtime tmp, repoRoot, and tmpdir", async () => {
    const result = await checkDiskSpace({
      repoRoot: root,
      worktreeRoot: path.join(root, "wt"),
      runtimeTmpDir: path.join(root, "tmp"),
      minFreeDiskMb: 10,
      probe: () => 100,
    });

    expect(result.ok).toBe(true);
    expect(result.minFreeDiskMb).toBe(10);
    const names = result.paths.map((p) => p.name);
    expect(names).toContain("worktreeRoot");
    expect(names).toContain(".factory-runtime/tmp");
    expect(names).toContain("repoRoot");
    expect(names).toContain("tmpdir");
  });

  it("reports every failing path below the threshold", async () => {
    const result = await checkDiskSpace({
      repoRoot: root,
      minFreeDiskMb: 50,
      probe: () => 10,
    });
    expect(result.ok).toBe(false);
    expect(result.failingPaths.length).toBe(result.paths.length);
    expect(result.paths[0]?.thresholdMb).toBe(50);
  });

  it("passes above the threshold and uses the default otherwise", async () => {
    await assertDiskSpace({
      repoRoot: root,
      probe: () => DEFAULT_MIN_FREE_DISK_MB,
    });
    const result = await checkDiskSpace({ repoRoot: root, probe: () => 10 });
    expect(result.minFreeDiskMb).toBe(DEFAULT_MIN_FREE_DISK_MB);
    expect(result.ok).toBe(false);
  });

  it("honours the configured minFreeDiskMb", async () => {
    const result = await checkDiskSpace({
      repoRoot: root,
      minFreeDiskMb: 7,
      probe: () => 10,
    });
    expect(result.minFreeDiskMb).toBe(7);
    await expect(
      assertDiskSpace({
        repoRoot: root,
        pipeline: { limits: { minFreeDiskMb: 50 } },
        probe: () => 10,
      })
    ).rejects.toBeInstanceOf(LowDiskSpaceStopError);
  });

  it("journals and raises a blocking question before throwing", async () => {
    const taskDir = path.join(root, ".factory", "tasks", "t1");
    fs.mkdirSync(taskDir, { recursive: true });

    let caught: LowDiskSpaceStopError | undefined;
    try {
      await assertDiskSpace({
        repoRoot: root,
        task: "t1",
        taskDir,
        pipeline: { limits: { minFreeDiskMb: 10 } },
        probe: () => 1,
      });
    } catch (err) {
      caught = err as LowDiskSpaceStopError;
    }

    expect(caught).toBeInstanceOf(LowDiskSpaceStopError);
    expect(caught?.details.failingPaths.length).toBeGreaterThan(0);

    const events = await readJournal(taskDir);
    expect(events.some((e) => e.type === "low_disk_space")).toBe(true);

    const question = await readYaml<{ disposition: string; status: string; blocks: string[] }>(
      path.join(taskDir, "steer", "tousertoreview", "low-disk-space.yaml")
    );
    expect(question).toMatchObject({
      disposition: "human-stop",
      status: "open",
      blocks: ["task"],
    });
  });
});
