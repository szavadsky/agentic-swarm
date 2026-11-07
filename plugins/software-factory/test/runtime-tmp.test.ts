import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initFactoryRuntimeTmp, getFactoryTmpDir } from "../src/core/runtime-tmp.js";
import { runProcess } from "../src/core/proc.js";

describe("Factory Runtime Temporary Directory (§5)", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-tmp-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {}
  });

  it("initializes {worktreeRoot}/.factory-runtime/tmp/ and sets TMPDIR env vars", () => {
    const handle = initFactoryRuntimeTmp(tempRoot);
    try {
      const expectedTmp = path.join(tempRoot, ".factory-runtime", "tmp");
      expect(handle.tmpDir).toBe(expectedTmp);
      expect(fs.existsSync(expectedTmp)).toBe(true);
      expect(getFactoryTmpDir()).toBe(expectedTmp);
      expect(process.env.TMPDIR).toBe(expectedTmp);
      expect(process.env.TMP).toBe(expectedTmp);
      expect(process.env.TEMP).toBe(expectedTmp);
    } finally {
      handle.restore();
    }
  });

  it("purges entries older than runStartTime and preserves newer entries", () => {
    const expectedTmp = path.join(tempRoot, ".factory-runtime", "tmp");
    fs.mkdirSync(expectedTmp, { recursive: true });

    const oldFile = path.join(expectedTmp, "old-pytest.tmp");
    fs.writeFileSync(oldFile, "old content");
    // Set old mtime (10 seconds ago)
    const tenSecAgo = new Date(Date.now() - 10_000);
    fs.utimesSync(oldFile, tenSecAgo, tenSecAgo);

    const oldDir = path.join(expectedTmp, "old-dir");
    fs.mkdirSync(oldDir);
    fs.utimesSync(oldDir, tenSecAgo, tenSecAgo);

    const runStartTime = Date.now() - 1_000; // 1 second ago

    const newFile = path.join(expectedTmp, "new-file.tmp");
    fs.writeFileSync(newFile, "new content");

    const handle = initFactoryRuntimeTmp(tempRoot, runStartTime);
    try {
      expect(fs.existsSync(oldFile)).toBe(false);
      expect(fs.existsSync(oldDir)).toBe(false);
      expect(fs.existsSync(newFile)).toBe(true);
    } finally {
      handle.restore();
    }
  });

  it("runProcess inherits factory TMPDIR environment variables", async () => {
    const handle = initFactoryRuntimeTmp(tempRoot);
    try {
      const res = await runProcess({
        cmd: ["bash", "-c", "echo $TMPDIR"],
        cwd: tempRoot,
      });
      expect(res.code).toBe(0);
      expect(res.stdout.trim()).toBe(handle.tmpDir);
    } finally {
      handle.restore();
    }
  });
});
