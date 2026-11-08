import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { readYaml } from "../../src/core/records/io.js";
import type {
  PipelineConfig,
  ProjectConfig,
  StateArtifact,
  SteerItemArtifact,
} from "../../src/core/artifacts.js";

/**
 * Blocking vs remarkable ADRs (docs/factory.v2.md §18; ADRs
 * adr-humaninvolvement-config, adr-digest-mailbox, adr-human-stop,
 * td-adr-md-truncated).
 *
 * Contract under test:
 * - The ADR writer persists a complete markdown record: title plus Context,
 *   Decision, Consequences, and the blocking classification.
 * - `PlanAdr.blocking: true` follows the active mode's blocking table: it
 *   creates a blocking `steer/tousertoreview` question (`blocks` includes the
 *   task) and halts the run with exit 10. In autonomous mode the question uses
 *   `human-stop`; principal/detailed may wait as `human-async`.
 * - A remarkable ADR (`blocking: false`/absent) is reported in the digest with
 *   `human-awareness` and empty blocks; it never blocks or halts the run.
 * - dispositions.md keeps documenting the exit-10 human-stop contract.
 */

const ORCH = ".factory";

const BLOCKING_ADR = {
  id: "adr-blocking-choice",
  title: "Blocking choice",
  context: "The blocking context is significant",
  decision: "Take the blocking decision",
  consequences: "Blocking consequences follow",
  blocking: true,
} as const;

const REMARKABLE_ADR = {
  id: "adr-remarkable-choice",
  title: "Remarkable choice",
  context: "The remarkable context is informational",
  decision: "Take the remarkable decision",
  consequences: "Remarkable consequences follow",
  blocking: false,
} as const;

/** A remarkable ADR may omit `blocking` entirely; only true is blocking. */
const REMARKABLE_ADR_UNMARKED = {
  id: "adr-unmarked-choice",
  title: "Unmarked choice",
  context: "The unmarked context is informational",
  decision: "Take the unmarked decision",
  consequences: "Unmarked consequences follow",
} as const;

interface AdrRun {
  res: Awaited<ReturnType<typeof runTask>>;
  deployedTaskDir: string;
  deployedTaskWt: string;
}

describe("Blocking vs remarkable ADRs (§18)", () => {
  let tmpRepo: TmpRepo;
  const createdWorktreeRoots: string[] = [];

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    createdWorktreeRoots.length = 0;
  });

  afterEach(() => {
    for (const root of createdWorktreeRoots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    tmpRepo.cleanup();
  });

  function taskDirFor(task: string): string {
    const dir = path.join(tmpRepo.dir, ORCH, task);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "INTENT.md"), `Intent for ${task}\n`, "utf8");
    tmpRepo.commit(`add ${task} intent`);
    return dir;
  }

  async function mailbox(taskDir: string): Promise<SteerItemArtifact[]> {
    const dir = path.join(taskDir, "steer", "tousertoreview");
    if (!fs.existsSync(dir)) return [];
    const names = fs.readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort();
    return Promise.all(names.map((n) => readYaml<SteerItemArtifact>(path.join(dir, n))));
  }

  function entriesFor(
    entries: SteerItemArtifact[],
    adr: { id: string; title: string }
  ): SteerItemArtifact[] {
    return entries.filter(
      (q) =>
        q.question.includes(adr.id) ||
        q.question.includes(adr.title) ||
        q.ref.includes(adr.id)
    );
  }

  /**
   * Runs a real task/repo fixture whose architect emits `adrs`, with every
   * downstream step scripted so a non-halting path (remarkable ADRs only)
   * finishes normally while a blocking path can halt earlier.
   */
  async function runAdrPlan(
    task: string,
    mode: NonNullable<PipelineConfig["humanInvolvement"]>,
    adrs: Array<Record<string, unknown>>
  ): Promise<AdrRun> {
    taskDirFor(task);
    const worktreeRoot = path.join(tmpRepo.dir + `-${task}-wt`);
    fs.mkdirSync(worktreeRoot, { recursive: true });
    createdWorktreeRoots.push(worktreeRoot);
    const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    const harness = new FakeHarness();

    const project: ProjectConfig = {
      orchestrationFolder: ORCH,
      adrFolder: "docs/adr",
      worktreeRoot,
    };
    const pipeline: PipelineConfig = {
      models: {
        roles: {
          workhorse: { model: "model-workhorse" },
          "alt-workhorse": { model: "model-alt-workhorse" },
          architect: { model: "model-architect" },
          "alt-architect": { model: "model-alt-architect" },
          simpler: { model: "model-simpler" },
        },
      },
      agents: {
        triage: { role: "workhorse" },
        infra: { role: "workhorse" },
        architect: { role: "architect" },
        "plan-reviewer": { role: "alt-architect" },
        pm: { role: "alt-workhorse" },
        developer: { role: "workhorse" },
        reviewer: { role: "alt-workhorse" },
        "wave-close-up": { role: "alt-workhorse" },
        "plan-close-up": { role: "alt-workhorse" },
      },
      flows: {
        simple: { steps: [] },
        story: {
          dev: {
            fixLoopTo: "develop",
            steps: [
              { id: "develop", agent: "developer", role: "workhorse" },
              { id: "review", agent: "reviewer", role: "alt-workhorse" },
            ],
          },
        },
        spike: {},
      },
      humanInvolvement: mode,
      reviewPolicy: {
        default: [
          "fix",
          "optional",
          "architect",
          "human-awareness",
          "human-async",
          "human-stop",
        ],
      },
      limits: {
        maxParallelItems: 2,
        maxParallelTurns: 4,
        maxStepAttempts: 3,
        maxFixRounds: 3,
      },
    };
    const prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });

    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "ADR routing flow", citations: [] },
    });
    harness.scriptOutcome(`${task}/runs/infra#a1`, {
      ok: true,
      data: {
        setup: [],
        gates: [{ id: "test", command: "true" }],
        testRunner: { command: "true" },
      },
    });
    harness.scriptOutcome(`${task}/runs/architect-plan-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        milestones: [{ id: "m1", title: "M1" }],
        itemOutlines: [
          { slug: "item-1", kind: "dev", title: "Item 1", milestoneId: "m1", deps: [] },
        ],
        adrs,
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-review-1-1#a1`, {
      ok: true,
      data: { status: "approved", summary: "Plan ok", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/pm-edits-1#a1`, {
      ok: true,
      data: {
        iteration: 1,
        items: [
          {
            slug: "item-1",
            outlineRef: "item-1",
            kind: "dev",
            title: "Item 1",
            assignment: "Implement item 1",
            milestone: "m1",
            wave: 1,
            deps: [],
          },
        ],
      },
    });
    harness.scriptOutcome(`${task}/items/item-1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "item-1.ts"), "export const item_1 = 1;\n");
      return { ok: true, data: { status: "ok", summary: "Developed item-1" } };
    });
    harness.scriptOutcome(`${task}/items/item-1/review#a1`, {
      ok: true,
      data: { status: "approved", summary: "Approved", suggestions: [] },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: {
        wave: 1,
        iteration: 1,
        status: "complete",
        mergedItems: ["item-1"],
        summary: "Wave report",
      },
    });
    harness.scriptOutcome(`${task}/runs/architect-wave-report-1-1#a1`, {
      ok: true,
      data: {
        id: "dec-wave-1",
        context: "wave",
        decision: "continue",
        timestamp: new Date().toISOString(),
      },
    });
    harness.scriptOutcome(`${task}/runs/plan-close-up-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Plan close-up complete" },
    });
    harness.scriptOutcome(`${task}/runs/architect-closeup-1#a1`, {
      ok: true,
      data: { iteration: 1, status: "complete", summary: "Iteration complete" },
    });

    const res = await runTask(
      { harness, repo, project, pipelineFor: async () => pipeline, prompts },
      task,
      { maxTicks: 30 }
    );

    return {
      res,
      deployedTaskDir: path.join(worktreeRoot, `topic_${task}`, ORCH, task),
      deployedTaskWt: path.join(worktreeRoot, `topic_${task}`),
    };
  }

  it("writes full ADR markdown with context, decision, consequences, and blocking status", async () => {
    const { deployedTaskWt } = await runAdrPlan("adr-markdown", "autonomous", [
      REMARKABLE_ADR_UNMARKED,
    ]);

    const remarkableMd = fs.readFileSync(
      path.join(deployedTaskWt, "docs", "adr", `${REMARKABLE_ADR_UNMARKED.id}.md`),
      "utf8"
    );
    expect(remarkableMd).toContain(`# ${REMARKABLE_ADR_UNMARKED.title}`);
    expect(remarkableMd).toMatch(/^##\s+Context\s*$/m);
    expect(remarkableMd).toContain(REMARKABLE_ADR_UNMARKED.context);
    expect(remarkableMd).toMatch(/^##\s+Decision\s*$/m);
    expect(remarkableMd).toContain(REMARKABLE_ADR_UNMARKED.decision);
    expect(remarkableMd).toMatch(/^##\s+Consequences\s*$/m);
    expect(remarkableMd).toContain(REMARKABLE_ADR_UNMARKED.consequences);
    expect(remarkableMd).toMatch(/^##\s+Blocking[\s\S]*?\b(false|no)\b/im);
  }, 30000);

  it("routes a blocking ADR to the mailbox with task blocks and halts with exit 10", async () => {
    const { res, deployedTaskDir, deployedTaskWt } = await runAdrPlan(
      "adr-blocking",
      "autonomous",
      [BLOCKING_ADR]
    );

    expect(res.status).toBe("blocked");
    expect(res.exitCode).toBe(10);

    const entries = await mailbox(deployedTaskDir);
    const blocking = entriesFor(entries, BLOCKING_ADR);
    expect(blocking).toHaveLength(1);
    expect(blocking[0]!.disposition).toBe("human-stop");
    expect(blocking[0]!.blocks ?? []).toContain("task");

    const state = await readYaml<StateArtifact>(
      path.join(deployedTaskDir, "state.yaml")
    );
    expect(state.status).toBe("blocked");

    const blockingMd = fs.readFileSync(
      path.join(deployedTaskWt, "docs", "adr", `${BLOCKING_ADR.id}.md`),
      "utf8"
    );
    expect(blockingMd).toContain(`# ${BLOCKING_ADR.title}`);
    expect(blockingMd).toContain(BLOCKING_ADR.decision);
    expect(blockingMd).toMatch(/^##\s+Blocking[\s\S]*?\b(true|yes)\b/im);

    // The exit-10 human-stop contract stays documented for reviewers.
    const dispositions = fs.readFileSync(
      path.resolve(import.meta.dir, "../../agents/criteria/dispositions.md"),
      "utf8"
    );
    expect(dispositions).toMatch(/human-stop[\s\S]*?exit code 10/i);
  }, 30000);

  it("reports a remarkable ADR in the digest and lets the run complete", async () => {
    const { res, deployedTaskDir } = await runAdrPlan("adr-remarkable", "autonomous", [
      REMARKABLE_ADR_UNMARKED,
    ]);

    expect(res.status).toBe("done");
    expect(res.exitCode).toBe(0);

    const entries = await mailbox(deployedTaskDir);
    const remarkable = entriesFor(entries, REMARKABLE_ADR_UNMARKED);
    expect(remarkable).toHaveLength(1);
    expect(remarkable[0]!.disposition).toBe("human-awareness");
    expect(remarkable[0]!.blocks ?? []).toEqual([]);
  }, 30000);

  it("respects the active mode table for blocking and remarkable ADRs", async () => {
    const expectations: Array<{
      mode: NonNullable<PipelineConfig["humanInvolvement"]>;
      blockingDispositions: string[];
    }> = [
      { mode: "autonomous", blockingDispositions: ["human-stop"] },
      { mode: "principal", blockingDispositions: ["human-async"] },
      { mode: "detailed", blockingDispositions: ["human-async", "human-stop"] },
    ];

    for (const { mode, blockingDispositions } of expectations) {
      const { res, deployedTaskDir } = await runAdrPlan(
        `adr-mode-${mode}`,
        mode,
        [BLOCKING_ADR, REMARKABLE_ADR]
      );

      // Both ADR classes are routed at plan time; the blocking decision parks
      // the task regardless of which human disposition the mode selects.
      expect(res.status).toBe("blocked");

      const entries = await mailbox(deployedTaskDir);
      const blocking = entriesFor(entries, BLOCKING_ADR);
      expect(blocking).toHaveLength(1);
      expect(blockingDispositions).toContain(blocking[0]!.disposition);
      expect(blocking[0]!.blocks ?? []).toContain("task");

      const remarkable = entriesFor(entries, REMARKABLE_ADR);
      expect(remarkable).toHaveLength(1);
      expect(remarkable[0]!.disposition).toBe("human-awareness");
      expect(remarkable[0]!.blocks ?? []).toEqual([]);
    }
  }, 60000);
});
