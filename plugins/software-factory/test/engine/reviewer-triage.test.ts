import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { FakeHarness } from "../../src/harness/fake/fake-harness.js";
import { runAgentStep } from "../../src/core/flows/step-runner.js";
import { runTask } from "../../src/core/engine.js";
import { Repo } from "../../src/core/git/repo.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { readYaml, writeYamlAtomic } from "../../src/core/records/io.js";
import { concernFingerprint } from "../../src/core/concerns.js";
import { resolveReviewAllowed } from "../../src/core/review-policy.js";
import {
  applyReviewTriage,
  concernMailboxId,
  isDebtConcern,
  partitionReviewSuggestions,
  renderConcernsYaml,
  type ReviewTriageOutcome,
} from "../../src/core/triage.js";
import type {
  PipelineConfig,
  ProjectConfig,
  ReviewSuggestion,
  StoredConcernArtifact,
} from "../../src/core/artifacts.js";

/**
 * Item reviewer triage (docs/factory.v2.md §18; ADRs
 * adr-triage-suggestions-dismiss, adr-concern-store-taskwt, adr-funnel-text-budget).
 *
 * The workhorse reviewer sees terse open concerns, triages them by exact id
 * (`c-*` / `rm-*`) with the review vocabulary plus `dismiss`, and those ids are
 * excluded from the normal fix-loop/approval/mailbox paths. The one exception is
 * `fix` on a concern, which reports a single `fixRequired`; human-async writes a
 * deduped `q-concern-<cid>` mailbox entry. QA is not a triager.
 */
describe("Reviewer triage (§8.7, §18)", () => {
  const ORCH = ".factory";
  const TASK = "reviewer-triage";

  let tmpRepo: TmpRepo;
  let repo: Repo;
  let taskWt: string;
  let taskDir: string;
  let worktreeRoot: string;
  let pipeline: PipelineConfig;
  let project: ProjectConfig;
  let prompts: ReturnType<typeof loadPromptLibrary>;

  beforeEach(() => {
    tmpRepo = createTmpRepo();
    worktreeRoot = path.join(tmpRepo.dir + "-wt");
    fs.mkdirSync(worktreeRoot, { recursive: true });
    repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot });
    taskWt = tmpRepo.dir;
    taskDir = path.join(taskWt, ORCH, TASK);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, "INTENT.md"), "# Reviewer triage\n", "utf8");
    tmpRepo.commit("add reviewer triage task");

    pipeline = {
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
        developer: { role: "workhorse" },
        qa: { role: "alt-workhorse" },
        reviewer: { role: "alt-workhorse" },
      },
      flows: { simple: { steps: [] }, story: {}, spike: {} },
      limits: {},
    };
    project = { orchestrationFolder: ORCH, worktreeRoot };
    prompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });
  });

  afterEach(() => {
    tmpRepo.cleanup();
  });

  function storedConcern(
    overrides: Partial<StoredConcernArtifact> & { id: string }
  ): StoredConcernArtifact {
    return {
      kind: "risk",
      summary: `Concern ${overrides.id}`,
      detail: "detail",
      severity: "medium",
      status: "open",
      source: { record: "001-develop-a1", agent: "developer" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  async function writeConcern(concern: StoredConcernArtifact): Promise<string> {
    const file = path.join(taskDir, "concerns", `${concern.id}.yaml`);
    await writeYamlAtomic(file, concern);
    return file;
  }

  function mailboxFiles(): string[] {
    const dir = path.join(taskDir, "steer", "tousertoreview");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((n) => n.endsWith(".yaml")).sort();
  }

  async function runReview(opts: {
    item?: string;
    agent?: string;
    stepId?: string;
    stepFragment?: string;
    data: unknown;
  }) {
    const agent = opts.agent ?? "reviewer";
    const stepId = opts.stepId ?? "review";
    const stepFragment = opts.stepFragment ?? `steps/${stepId}`;
    const harness = new FakeHarness();
    const label = opts.item
      ? `${TASK}/items/${opts.item}/${stepId}#a1`
      : `${TASK}/runs/${stepId}#a1`;
    harness.scriptOutcome(label, { ok: true, data: opts.data });
    harness.scriptOutcome(`${label}#relaunch`, { ok: true, data: opts.data });
    harness.scriptComplete(() => opts.data);
    const recordsDir = path.join(taskDir, opts.item ? `items/${opts.item}/steps` : "runs");
    fs.mkdirSync(recordsDir, { recursive: true });

    const result = await runAgentStep({
      task: TASK,
      item: opts.item,
      stepId,
      stepFragment,
      agent,
      cwd: taskWt,
      taskWt,
      taskDir,
      recordsDir,
      repo,
      harness,
      pipeline,
      project,
      prompts,
      promptVars: {
        assignment: "Review the item",
        checks: "",
        testDiff: "",
        diff: "",
        dispositionsCriteria: "",
      },
    });
    return { result, harness };
  }

  it("hydrates steps/review with terse concern fields and triage instructions", async () => {
    const detailSentinel = "DETAIL_SENTINEL_" + "x".repeat(400);
    await writeConcern(
      storedConcern({
        id: "c-aaaaaaaaaa",
        kind: "risk",
        severity: "high",
        summary: "Retry loop can spin forever",
        detail: detailSentinel,
        affects: ["item-a", "wave-2"],
      })
    );

    const { result, harness } = await runReview({
      item: "item-a",
      data: { status: "approved", summary: "Looks fine", suggestions: [] },
    });
    expect(result.ok).toBe(true);

    const prompt = (harness.calls[0] as any).run.prompt as string;
    expect(prompt).toContain("c-aaaaaaaaaa");
    expect(prompt).toContain("Retry loop can spin forever");
    expect(prompt).toContain("risk");
    expect(prompt).toContain("high");
    expect(prompt).toContain("item-a");
    expect(prompt).toContain("wave-2");
    expect(prompt).not.toContain("DETAIL_SENTINEL");
    expect(prompt).toMatch(/dismiss[^\n]*(detail|reason)/i);
    expect(prompt).toMatch(/condens|shorter|less detail/i);
  });

  it("partitions exact-id triage from findings and flags fix once", () => {
    const suggestions: ReviewSuggestion[] = [
      { id: "c-aaaaaaaaaa", disposition: "dismiss", summary: "Duplicate" },
      { id: "rm-bbbbbbbbbb", disposition: "architect", summary: "Remarkable" },
      { id: "c-cccccccccc", disposition: "fix", summary: "Fix one" },
      { id: "c-dddddddddd", disposition: "fix", summary: "Fix two" },
      { id: "s-1", disposition: "fix", summary: "Ordinary finding" },
    ];
    const ids = ["c-aaaaaaaaaa", "rm-bbbbbbbbbb", "c-cccccccccc", "c-dddddddddd"];

    const reviewer = partitionReviewSuggestions(suggestions, ids, true);
    expect(reviewer.triage.map((s) => s.id)).toEqual([
      "c-aaaaaaaaaa",
      "rm-bbbbbbbbbb",
      "c-cccccccccc",
      "c-dddddddddd",
    ]);
    expect(reviewer.findings.map((s) => s.id)).toEqual(["s-1"]);
    expect(reviewer.fixRequired).toBe(true);

    const dismissOnly = partitionReviewSuggestions(
      [{ id: "c-aaaaaaaaaa", disposition: "dismiss", summary: "Duplicate" }],
      ids,
      true
    );
    expect(dismissOnly.fixRequired).toBe(false);

    const qa = partitionReviewSuggestions(suggestions, ids, false);
    expect(qa.triage).toEqual([]);
    expect(qa.findings.map((s) => s.id)).toEqual(suggestions.map((s) => s.id));
    expect(qa.fixRequired).toBe(false);
  });

  it("renders condensing concern YAML without detail and within the byte cap", () => {
    const concerns = [
      storedConcern({
        id: "c-aaaaaaaaaa",
        kind: "tech-debt",
        severity: "high",
        summary: "Duplicated helpers",
        detail: "d".repeat(600),
        affects: ["wave-2"],
      }),
      storedConcern({
        id: "c-bbbbbbbbbb",
        kind: "blocker",
        severity: "low",
        summary: "Missing dependency",
        detail: "e".repeat(600),
      }),
    ];

    const rendered = renderConcernsYaml(concerns);
    const parsed = yaml.parse(rendered);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      id: "c-aaaaaaaaaa",
      kind: "tech-debt",
      severity: "high",
      summary: "Duplicated helpers",
      affects: ["wave-2"],
    });
    expect(parsed[0]).not.toHaveProperty("detail");
    expect(parsed[1]).toMatchObject({
      id: "c-bbbbbbbbbb",
      kind: "blocker",
      severity: "low",
      summary: "Missing dependency",
    });
    expect(Buffer.byteLength(rendered, "utf8")).toBeLessThan(
      Buffer.byteLength(JSON.stringify(concerns), "utf8")
    );

    const capped = renderConcernsYaml(concerns, 120);
    expect(Buffer.byteLength(capped, "utf8")).toBeLessThanOrEqual(120);
    expect(capped).not.toContain("\uFFFD");
  });

  it("dismisses a concern with its reason and routes nothing", async () => {
    const cid = "c-aaaaaaaaaa";
    await writeConcern(storedConcern({ id: cid }));

    const outcome = await applyReviewTriage({
      taskDir,
      taskWt,
      repo,
      item: "item-a",
      isTriager: true,
      concernIds: [cid],
      suggestions: [
        {
          id: cid,
          disposition: "dismiss",
          summary: "Duplicate",
          detail: "covered by ADR-1",
        },
      ],
    });

    expect(outcome.triage.map((s) => s.id)).toEqual([cid]);
    expect(outcome.dismissed.map((s) => s.id)).toEqual([cid]);
    expect(outcome.routed).toEqual([]);
    expect(outcome.fixRequired).toBe(false);
    expect(outcome.mailboxIds).toEqual([]);

    const stored = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", `${cid}.yaml`)
    );
    expect(stored.status).toBe("dismissed");
    expect(stored.dismissReason).toBe("covered by ADR-1");
    expect(isDebtConcern(stored)).toBe(false);
    expect(mailboxFiles()).toEqual([]);
  });

  it("persists routed dispositions and applies the debt predicate without a tech-debt disposition", async () => {
    const architectCid = "c-bbbbbbbbbb";
    const debtCid = "c-cccccccccc";
    await writeConcern(storedConcern({ id: architectCid, kind: "risk" }));
    await writeConcern(storedConcern({ id: debtCid, kind: "risk" }));

    const outcome = await applyReviewTriage({
      taskDir,
      taskWt,
      repo,
      isTriager: true,
      concernIds: [architectCid, debtCid],
      suggestions: [
        { id: architectCid, disposition: "architect", summary: "Needs a decision" },
        { id: debtCid, disposition: "optional", summary: "Polish later" },
      ],
    });

    expect(outcome.routed.map((s) => s.id).sort()).toEqual([architectCid, debtCid].sort());
    expect(outcome.dismissed).toEqual([]);
    expect(outcome.fixRequired).toBe(false);
    expect(outcome.mailboxIds).toEqual([]);

    const architect = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", `${architectCid}.yaml`)
    );
    expect(architect.status).toBe("routed");
    expect(architect.disposition).toBe("architect");
    expect(isDebtConcern(architect)).toBe(false);

    const debt = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", `${debtCid}.yaml`)
    );
    expect(debt.status).toBe("routed");
    expect(debt.disposition).toBe("optional");
    expect(isDebtConcern(debt)).toBe(true);

    expect(isDebtConcern({ kind: "tech-debt", status: "routed" })).toBe(true);
    expect(isDebtConcern({ kind: "tech-debt", status: "resolved" })).toBe(true);
    expect(isDebtConcern({ kind: "tech-debt", status: "open" })).toBe(false);
    expect(isDebtConcern({ kind: "risk", status: "routed", disposition: "optional" })).toBe(true);
    expect(isDebtConcern({ kind: "risk", status: "open", disposition: "optional" })).toBe(false);
    expect(
      isDebtConcern({ kind: "risk", status: "routed", disposition: "tech-debt" as never })
    ).toBe(false);
    expect(resolveReviewAllowed(pipeline, "reviewer", true)).not.toContain("tech-debt");
  });

  it("returns fixRequired once for fix-on-concern and keeps it in the fix loop", async () => {
    const cidOne = "c-dddddddddd";
    const cidTwo = "c-eeeeeeeeee";
    await writeConcern(storedConcern({ id: cidOne }));
    await writeConcern(storedConcern({ id: cidTwo }));

    const { result, harness } = await runReview({
      item: "item-a",
      data: {
        status: "changes_requested",
        summary: "Concerning retry paths",
        suggestions: [
          { id: cidOne, disposition: "fix", summary: "Fix retry one" },
          { id: cidTwo, disposition: "fix", summary: "Fix retry two" },
        ],
      },
    });
    expect(result.ok).toBe(true);

    const triage = (result as unknown as { triage?: ReviewTriageOutcome }).triage;
    expect(triage).toBeDefined();
    expect(triage!.fixRequired).toBe(true);
    expect(triage!.triage.map((s) => s.id).sort()).toEqual([cidOne, cidTwo].sort());
    expect(triage!.routed.map((s) => s.id).sort()).toEqual([cidOne, cidTwo].sort());

    for (const cid of [cidOne, cidTwo]) {
      const stored = await readYaml<StoredConcernArtifact>(
        path.join(taskDir, "concerns", `${cid}.yaml`)
      );
      expect(stored.status).toBe("routed");
      expect(stored.disposition).toBe("fix");
    }

    // Kept in the canonical review output so the normal fix loop runs once.
    const output = result.output as { suggestions?: ReviewSuggestion[] };
    expect(output.suggestions?.map((s) => s.id).sort()).toEqual([cidOne, cidTwo].sort());
    expect(harness.calls.filter((c) => c.type === "run")).toHaveLength(1);
  });

  it("writes one deduped q-concern mailbox entry for human-async triage", async () => {
    const cid = "c-ffffffffff";
    await writeConcern(storedConcern({ id: cid, kind: "question" }));

    const ctx = {
      taskDir,
      taskWt,
      repo,
      item: "item-a",
      isTriager: true,
      concernIds: [cid],
      suggestions: [
        {
          id: cid,
          disposition: "human-async",
          summary: "Which retry strategy?",
          detail: "Choose a retry strategy before continuing",
        },
      ],
    };

    const first = await applyReviewTriage(ctx);
    expect(first.mailboxIds).toEqual([concernMailboxId(cid)]);
    expect(mailboxFiles()).toEqual([`q-concern-${cid}.yaml`]);

    const question = await readYaml<Record<string, any>>(
      path.join(taskDir, "steer", "tousertoreview", `q-concern-${cid}.yaml`)
    );
    expect(question.id).toBe(`q-concern-${cid}`);
    expect(question.disposition).toBe("human-async");
    expect(question.ref).toBe("item-a");
    expect(question.status).toBe("open");

    const stored = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", `${cid}.yaml`)
    );
    expect(stored.status).toBe("routed");
    expect(stored.disposition).toBe("human-async");

    // A re-run of the same review must not duplicate the mailbox entry.
    await applyReviewTriage(ctx);
    expect(mailboxFiles()).toEqual([`q-concern-${cid}.yaml`]);
  });

  it("rejects dismiss triage without detail and leaves the concern unchanged", async () => {
    const cid = "c-9999999999";
    await writeConcern(storedConcern({ id: cid }));

    await expect(
      applyReviewTriage({
        taskDir,
        taskWt,
        repo,
        isTriager: true,
        concernIds: [cid],
        suggestions: [{ id: cid, disposition: "dismiss", summary: "No reason" }],
      })
    ).rejects.toThrow(/detail/i);

    const stored = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", `${cid}.yaml`)
    );
    expect(stored.status).toBe("open");
    expect(stored.dismissReason).toBeUndefined();
    expect(mailboxFiles()).toEqual([]);
  });

  it("fails the review step when a dismiss triage lacks detail", async () => {
    const cid = "c-8888888888";
    const concernPath = await writeConcern(storedConcern({ id: cid }));

    const { result } = await runReview({
      item: "item-a",
      data: {
        status: "changes_requested",
        summary: "Dismiss without a reason",
        suggestions: [{ id: cid, disposition: "dismiss", summary: "No reason" }],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("error");
    expect(result.meta.error ?? "").toMatch(/detail/i);
    const stored = await readYaml<StoredConcernArtifact>(concernPath);
    expect(stored.status).toBe("open");
    expect(stored.dismissReason).toBeUndefined();
    expect(mailboxFiles()).toEqual([]);
  });

  it("gates non-triagers: QA matching a concern id is a no-op", async () => {
    const cid = "c-7777777777";
    await writeConcern(storedConcern({ id: cid }));

    const { result } = await runReview({
      item: "item-a",
      agent: "qa",
      stepId: "qa",
      data: {
        status: "approved",
        summary: "QA pass",
        suggestions: [{ id: cid, disposition: "fix", summary: "Ordinary QA finding" }],
      },
    });
    expect(result.ok).toBe(true);

    const triage = (result as unknown as { triage?: ReviewTriageOutcome }).triage;
    expect(triage).toBeDefined();
    expect(triage!.triage).toEqual([]);
    expect(triage!.findings.map((s) => s.id)).toEqual([cid]);
    expect(triage!.fixRequired).toBe(false);
    expect(triage!.mailboxIds).toEqual([]);

    const stored = await readYaml<StoredConcernArtifact>(
      path.join(taskDir, "concerns", `${cid}.yaml`)
    );
    expect(stored.status).toBe("open");
    expect(stored.disposition).toBeUndefined();
    expect(mailboxFiles()).toEqual([]);
  });

  it("blocks the item with a single q-concern mailbox entry in the engine flow", async () => {
    const task = "triage-flow";
    const flowTaskDir = path.join(tmpRepo.dir, ORCH, task);
    fs.mkdirSync(flowTaskDir, { recursive: true });
    fs.writeFileSync(path.join(flowTaskDir, "INTENT.md"), "Reviewer triage flow\n", "utf8");
    tmpRepo.commit("add triage flow intent");

    const flowWtRoot = path.join(tmpRepo.dir + "-flow-wt");
    fs.mkdirSync(flowWtRoot, { recursive: true });
    const repoObj = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: flowWtRoot });
    const flowProject: ProjectConfig = { orchestrationFolder: ORCH, worktreeRoot: flowWtRoot };
    const flowPipeline: PipelineConfig = {
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
      limits: { maxParallelItems: 2, maxParallelTurns: 4, maxStepAttempts: 3, maxFixRounds: 3 },
    };
    const flowPrompts = loadPromptLibrary({
      builtinDir: path.resolve(import.meta.dir, "../../agents"),
      overrideDirs: [],
    });
    const harness = new FakeHarness();
    harness.scriptOutcome(`${task}/runs/triage#a1`, {
      ok: true,
      data: { kind: "story", rationale: "Triage flow", citations: [] },
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
        milestones: [{ id: "m1", title: "M1", scenarios: ["Scenario"] }],
        itemOutlines: [
          { slug: "item-1", kind: "dev", title: "Item 1", milestoneId: "m1", deps: [] },
        ],
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

    const concernSummary = "Retry loop can spin";
    const cid = concernFingerprint({ kind: "risk", summary: concernSummary });
    harness.scriptOutcome(`${task}/items/item-1/develop#a1`, (run) => {
      fs.writeFileSync(path.join(run.cwd, "feature.ts"), "export const x = 1;\n");
      return {
        ok: true,
        data: {
          status: "ok",
          summary: "Developed",
          concerns: [{ kind: "risk", summary: concernSummary, detail: "long detail" }],
        },
      };
    });
    harness.scriptOutcome(`${task}/items/item-1/review#a1`, {
      ok: true,
      data: {
        status: "changes_requested",
        summary: "Need a human decision",
        suggestions: [
          {
            id: cid,
            disposition: "human-async",
            summary: "Which retry strategy?",
            detail: "Choose a retry strategy",
          },
        ],
      },
    });
    harness.scriptOutcome(`${task}/runs/wave-close-up-1-1#a1`, {
      ok: true,
      data: { wave: 1, iteration: 1, status: "complete", summary: "Wave report" },
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

    const res = await runTask(
      {
        harness,
        repo: repoObj,
        project: flowProject,
        pipelineFor: async () => flowPipeline,
        prompts: flowPrompts,
      },
      task,
      { maxTicks: 25 }
    );

    expect(res.status).toBe("blocked");
    expect(res.exitCode).toBe(10);

    const flowWt = path.join(flowWtRoot, `topic_${task}`);
    const deployedTaskDir = path.join(flowWt, ORCH, task);
    const mailDir = path.join(deployedTaskDir, "steer", "tousertoreview");
    const mails = fs.readdirSync(mailDir).filter((n) => n.endsWith(".yaml")).sort();
    expect(mails).toEqual([`q-concern-${cid}.yaml`]);

    const question = await readYaml<Record<string, any>>(path.join(mailDir, mails[0]!));
    expect(question.id).toBe(`q-concern-${cid}`);
    expect(question.ref).toBe("item-1");

    const concern = await readYaml<StoredConcernArtifact>(
      path.join(deployedTaskDir, "concerns", `${cid}.yaml`)
    );
    expect(concern.status).toBe("routed");
    expect(concern.disposition).toBe("human-async");
  });
});
