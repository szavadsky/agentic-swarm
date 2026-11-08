import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { createTmpRepo, type TmpRepo } from "./helpers/tmp-repo.js";
import { FakeHarness } from "../src/harness/fake/fake-harness.js";
import { Repo } from "../src/core/git/repo.js";
import { loadPromptLibrary } from "../src/core/prompts.js";
import { processSteeringMailbox, writeQuestion } from "../src/core/steer.js";
import type { PipelineConfig } from "../src/core/artifacts.js";

// PsPost5 item 7 (steer.ts side): per-message poll errors are journaled (never
// silently swallowed), skipped counts are reported, and ack-style answers
// reconcile open awareness questions to answered.

describe("steer: poll errors and awareness-ack reconcile (PsPost5 item 7)", () => {
  let tmpRepo: TmpRepo;
  const task = "steer-obs-test";

  beforeEach(() => {
    tmpRepo = createTmpRepo();
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  function setup() {
    const orchFolder = ".factory";
    const taskDir = path.join(tmpRepo.dir, orchFolder, task);
    fs.mkdirSync(path.join(taskDir, "steer", "fromuserpending"), { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "steer test\n", "utf8");
    tmpRepo.commit("steer scaffolding");
    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: path.join(tmpRepo.dir, ".worktrees") });
    const pipeline: PipelineConfig = {
      models: { roles: { simpler: { model: "m" } } },
      agents: {},
      flows: { simple: { steps: [] }, story: {}, spike: {} },
      limits: {},
    };
    const prompts = loadPromptLibrary({ builtinDir: path.resolve("agents"), overrideDirs: [] });
    return { taskDir, repo, pipeline, prompts };
  }

  it("a bare ack reconciles open awareness questions to answered", async () => {
    const s = setup();
    await writeQuestion(tmpRepo.dir, s.taskDir, {
      id: "awareness-1",
      ref: `${task}/item-a`,
      disposition: "human-awareness",
      question: "FYI: picked approach X",
      blocks: [],
    });
    fs.writeFileSync(path.join(s.taskDir, "steer", "fromuserpending", "ack.txt"), "ack\n", "utf8");

    const harness = new FakeHarness();
    harness.scriptComplete(() => ({ refs: [], kind: "answer", urgency: "next-architect-call", summary: "ack" }));

    const res = await processSteeringMailbox({
      taskWt: tmpRepo.dir, taskDir: s.taskDir, harness, pipeline: s.pipeline, prompts: s.prompts, repo: s.repo, task,
    });
    expect(res.processedCount).toBe(1);
    expect(res.skippedCount).toBe(0);

    const q = yaml.parse(fs.readFileSync(path.join(s.taskDir, "steer", "tousertoreview", "awareness-1.yaml"), "utf8"));
    expect(q.status).toBe("answered");
    const journal = fs.readFileSync(path.join(s.taskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("steer_processed");
  });

  it("classification failures are journaled and counted as skipped", async () => {
    const s = setup();
    fs.writeFileSync(path.join(s.taskDir, "steer", "fromuserpending", "msg.txt"), "do the thing\n", "utf8");

    const harness = new FakeHarness();
    harness.scriptComplete(() => {
      throw new Error("classifier exploded");
    });

    const res = await processSteeringMailbox({
      taskWt: tmpRepo.dir, taskDir: s.taskDir, harness, pipeline: s.pipeline, prompts: s.prompts, repo: s.repo, task,
    });
    expect(res.processedCount).toBe(0);
    expect(res.skippedCount).toBe(1);
    // Message stays pending for retry.
    expect(fs.existsSync(path.join(s.taskDir, "steer", "fromuserpending", "msg.txt"))).toBe(true);
    const journal = fs.readFileSync(path.join(s.taskDir, "journal.ndjson"), "utf8");
    expect(journal).toContain("steer_poll_error");
    expect(journal).toContain("classifier exploded");
  });
});
