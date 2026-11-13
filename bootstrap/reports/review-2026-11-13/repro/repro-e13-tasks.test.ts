import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { runGoal } from "../../src/kernel/launch.js";
import { createFolderStore } from "../../src/kernel/store.js";
import { cleanupFlowRepo, setupFlowRepo } from "./s2-helpers.js";

describe("repro E13: one unparseable task file wedges every launch", () => {
  it("listTasks throws and every runGoal launch rejects while the file exists", async () => {
    const { repo, goal, goalDir } = setupFlowRepo();
    try {
      fs.mkdirSync(path.join(goalDir, "tasks"), { recursive: true });
      fs.writeFileSync(
        path.join(goalDir, "tasks", "broken.md"),
        "half-written task body with no frontmatter\n",
        "utf8"
      );

      const store = createFolderStore(goalDir);
      const direct = await store.listTasks().catch((err: unknown) => err);
      expect(direct).toBeInstanceOf(Error);
      expect((direct as Error).name).toBe("TaskFileError");
      expect((direct as Error).message).toContain('task "broken" has no --- frontmatter ---');

      const attempts: unknown[] = [];
      for (let launch = 0; launch < 2; launch++) {
        attempts.push(
          await runGoal({
            repo: repo.dir,
            goal,
            iterations: 1,
            harnesses: { fake: new FakeHarness({ id: "fake" }) },
            baseGates: false,
          }).catch((err: unknown) => err)
        );
      }
      console.log("E13 direct:", (direct as Error).name, (direct as Error).message);
      console.log("E13 stack:", String((attempts[0] as Error).stack).split("\n").slice(1, 5).join(" \\n "));
      for (const err of attempts) {
        console.log("E13 launch:", (err as Error).name, (err as Error).message);
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).name).toBe("TaskFileError");
        expect((err as Error).message).toContain("no --- frontmatter ---");
      }
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
});
