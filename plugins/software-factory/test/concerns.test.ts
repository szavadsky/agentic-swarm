import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import { createTmpRepo, type TmpRepo } from "./helpers/tmp-repo.js";
import { Repo } from "../src/core/git/repo.js";
import {
  aggregateConcerns,
  applyConcernResolution,
  applyConcernTriage,
  concernFingerprint,
  countConcerns,
  listConcerns,
  listOpenConcerns,
  severityAtLeast,
} from "../src/core/concerns.js";
import type { ConcernInput } from "../src/core/concerns.js";

describe("concern store", () => {
  let tmp: TmpRepo;
  let taskDir: string;
  let repo: Repo;

  beforeEach(() => {
    tmp = createTmpRepo();
    taskDir = path.join(tmp.dir, ".factory", "tasks", "t1");
    fs.mkdirSync(taskDir, { recursive: true });
    tmp.writeFile(".factory/tasks/t1/INTENT.md", "# t1\n");
    tmp.commit("add task");
    repo = new Repo({ mainRoot: tmp.dir, worktreeRoot: path.join(tmp.dir, "..", "wt-t1") });
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("fingerprints concerns stably and ranks severities", () => {
    const a: ConcernInput = { kind: "risk", summary: "  Race   in lock ", location: { file: "a.ts" } };
    const b: ConcernInput = { kind: "risk", summary: "race in lock", location: { file: "a.ts" } };
    expect(concernFingerprint(a)).toBe(concernFingerprint(b));
    expect(severityAtLeast("high", "medium")).toBe(true);
    expect(severityAtLeast("low", "medium")).toBe(false);
  });

  it("aggregates, merges, lists, and counts stored concerns", async () => {
    const source = { record: "runs/001-x", agent: "developer" };
    const ctx = { taskDir, taskWt: tmp.dir, repo };
    const [first] = await aggregateConcerns(
      { ...ctx, source },
      [{ kind: "tech-debt", summary: "duplicated parser", detail: "short" }],
      [],
      { commit: false }
    );
    await aggregateConcerns(
      { ...ctx, source: { record: "runs/002-x", agent: "reviewer" } },
      [{ kind: "tech-debt", summary: "duplicated parser", detail: "a much longer detail" }],
      [],
      { commit: false }
    );

    const all = await listConcerns(taskDir);
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(first?.id);
    expect(all[0]?.detail).toBe("a much longer detail");
    expect(all[0]?.source.record).toBe("runs/002-x");

    expect(await countConcerns(taskDir)).toEqual({
      open: 1,
      dismissed: 0,
      routed: 0,
      resolved: 0,
    });
    expect((await listOpenConcerns(taskDir)).map((c) => c.id)).toEqual([first!.id]);
  });

  it("applies a decision-level resolution and commits it", async () => {
    const ctx = { taskDir, taskWt: tmp.dir, repo };
    const [concern] = await aggregateConcerns(
      { ...ctx, source: { record: "runs/001-x", agent: "developer" } },
      [{ kind: "blocker", summary: "cannot build", detail: "" }],
      [],
      { commit: false }
    );

    await applyConcernResolution({
      ...ctx,
      resolution: { id: concern!.id, action: "resolve" },
      by: "architect",
    });

    expect((await listConcerns(taskDir))[0]?.status).toBe("resolved");
    expect(await countConcerns(taskDir)).toEqual({
      open: 0,
      dismissed: 0,
      routed: 0,
      resolved: 1,
    });
  });

  it("routes triaged suggestions and ignores unknown ids", async () => {
    const ctx = { taskDir, taskWt: tmp.dir, repo };
    const [concern] = await aggregateConcerns(
      { ...ctx, source: { record: "runs/001-x", agent: "developer" } },
      [{ kind: "risk", summary: "flaky timing", detail: "" }],
      [],
      { commit: false }
    );

    const updated = await applyConcernTriage({
      ...ctx,
      suggestions: [
        { id: concern!.id, disposition: "architect", summary: "needs a decision" },
        { id: "c-not-there", disposition: "human-stop", summary: "unknown" },
      ],
      isTriager: true,
    });

    expect(updated).toHaveLength(1);
    expect(updated[0]?.status).toBe("routed");
    expect(updated[0]?.disposition).toBe("architect");
  });
});
