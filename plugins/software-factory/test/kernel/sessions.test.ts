import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import {
  createLaunchSessions,
  newLaunchId,
} from "../../src/kernel/sessions.js";

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "factory-sessions-"));
}

describe("launch session store", () => {
  it("keeps the last N launches per goal and writes a launch marker", async () => {
    const root = tmpRoot();
    try {
      const dirs: string[] = [];
      for (const hour of [1, 2, 3]) {
        const now = new Date(Date.UTC(2026, 0, 1, hour));
        const launch = await createLaunchSessions(root, "demo", 2, {
          repo: "/tmp/repo",
          now,
        });
        dirs.push(launch.dir);
        const marker = yaml.parse(
          fs.readFileSync(path.join(launch.dir, "launch.yaml"), "utf8"),
        );
        expect(marker).toMatchObject({
          launchId: launch.launchId,
          goal: "demo",
          repo: "/tmp/repo",
          pid: process.pid,
        });
      }
      const remaining = fs
        .readdirSync(path.join(root, "demo"))
        .filter((name) =>
          fs.statSync(path.join(root, "demo", name)).isDirectory(),
        )
        .sort();
      expect(remaining).toHaveLength(2);
      expect(remaining).not.toContain(path.basename(dirs[0]!));
      expect(remaining).toContain(path.basename(dirs[1]!));
      expect(remaining).toContain(path.basename(dirs[2]!));

      const other = await createLaunchSessions(root, "other", 2, {
        repo: "/tmp/repo",
        now: new Date(0),
      });
      const demoAfter = fs.readdirSync(path.join(root, "demo")).sort();
      expect(demoAfter).toEqual(remaining);
      expect(fs.existsSync(other.dir)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("creates unique sortable ids for launches in the same millisecond", () => {
    const now = new Date(Date.UTC(2026, 0, 1, 1, 2, 3, 4));
    const ids = new Set(Array.from({ length: 20 }, () => newLaunchId(now)));
    expect(ids.size).toBe(20);
    for (const id of ids)
      expect(id.startsWith("20260101T010203004Z-")).toBe(true);
  });

  it("survives a missing goal directory", async () => {
    const root = tmpRoot();
    try {
      const launch = await createLaunchSessions(
        path.join(root, "missing"),
        "demo",
        1,
        { repo: "/tmp/repo" },
      );
      expect(fs.existsSync(path.join(launch.dir, "launch.yaml"))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
