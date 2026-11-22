import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { FakeHarness, fakeTurnResult } from "../../src/harness/fake/index.js";
import { derive } from "../../src/kernel/derive.js";
import { parseOutcome } from "../../src/kernel/outcome.js";
import {
  normalizeSlug,
  outcomeSchema,
  outcomeSlugSchema,
} from "../../src/kernel/outcome-schemas.js";
import {
  PLAN_CHECK_STEP,
  type PlanCheckTurn,
  planSlugs,
  runPlanCheck,
  validatePlanCheck,
} from "../../src/kernel/plan-check.js";
import { runPlanCheckPm } from "../../src/kernel/pm.js";
import type { KernelRuntime, State } from "../../src/kernel/types.js";
import { task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
  whenTurn,
  writeTask,
} from "./s2-helpers.js";

const ALIASES = {
  architect: { harness: "fake", model: "fake-architect" },
  pm: { harness: "fake", model: "fake-pm" },
  implementer: { harness: "fake", model: "fake-impl" },
  reviewer: { harness: "fake", model: "fake-review" },
  steward: { harness: "fake", model: "fake-steward" },
  "plan-checker": { harness: "fake", model: "fake-check" },
  intent: { harness: "fake", model: "fake-intent" },
  "plan-reviewer": { harness: "fake", model: "fake-plan-review" },
  "pack-preparer": { harness: "fake", model: "fake-pack-prep" },
};

function registerSlugUnitTests(): void {
  it("normalises slugs and rejects ticks plus whitespace when empty after stripping", () => {
    expect(normalizeSlug("bare-slug")).toBe("bare-slug");
    expect(normalizeSlug("`ticked`")).toBe("ticked");
    expect(normalizeSlug("  `surrounded`  ")).toBe("surrounded");
    expect(normalizeSlug(" ` inside-and-outside ` ")).toBe(
      "inside-and-outside",
    );
    expect(normalizeSlug("```multi-tick```")).toBe("multi-tick");
    expect(normalizeSlug(" ` ` ")).toBe("");
    expect(normalizeSlug("   ")).toBe("");
    expect(normalizeSlug("")).toBe("");

    expect(outcomeSlugSchema.parse("bare")).toBe("bare");
    expect(outcomeSlugSchema.parse(" `ticked` ")).toBe("ticked");
    expect(() => outcomeSlugSchema.parse(" ` ` ")).toThrow();
    expect(() => outcomeSlugSchema.parse("   ")).toThrow();
    expect(() => outcomeSlugSchema.parse("")).toThrow();
  });
}

function registerOutcomeSchemaNormalisationTests(): void {
  it("normalises follow-ups, evidence, planCheckRoutes, and stallRoutes in outcomeSchema", () => {
    const rawYaml = `
status: done
summary: test outcome
concerns: []
stallRoutes:
  - slug: " \`parked-task\` "
    action: amend
    reason: retry
planCheck:
  verdict: progress
  evidence:
    - item: " \`item-slug\` "
      status: done
      evidence: verified
  followUps:
    - kind: missing-dep
      slug: " \`task-slug\` "
      dep: " \`dead-dep\` "
      reason: dead dep gone
planCheckRoutes:
  - slug: " \`task-slug\` "
    action: continue
    reason: proceed
`;
    const parsed = parseOutcome(rawYaml);
    const parsedViaSchema = outcomeSchema.parse(yaml.parse(rawYaml));
    expect(parsedViaSchema.stallRoutes?.[0]?.slug).toBe("parked-task");
    expect(parsed.stallRoutes?.[0]?.slug).toBe("parked-task");
    expect(parsed.planCheck?.evidence[0]?.item).toBe("item-slug");
    expect(parsed.planCheck?.followUps[0]?.slug).toBe("task-slug");
    expect(parsed.planCheck?.followUps[0]?.dep).toBe("dead-dep");
    expect(parsed.planCheckRoutes?.[0]?.slug).toBe("task-slug");
  });
}

function registerPlanSlugsTests(): void {
  it("extracts bare slugs in planSlugs and validates against bare or ticked follow-up slugs", () => {
    const plan = [
      "# Plan",
      "",
      "- `app` — App works.",
      "- `beta` — Beta works.",
      "- gamma — Gamma works.",
    ].join("\n");
    expect([...planSlugs(plan)].sort()).toEqual(["app", "beta", "gamma"]);

    const validCheck = outcome({
      planCheck: {
        verdict: "progress",
        evidence: [],
        followUps: [
          { kind: "amend", slug: " `app` ", reason: "retry" },
          { kind: "cancel", slug: "beta", reason: "cancel" },
        ],
      },
    });
    expect(validatePlanCheck([plan], validCheck)).toEqual([]);

    const invalidCheck = outcome({
      planCheck: {
        verdict: "progress",
        evidence: [],
        followUps: [{ kind: "amend", slug: " `unknown` ", reason: "retry" }],
      },
    });
    expect(validatePlanCheck([plan], invalidCheck)).toEqual([
      'follow-up slug "unknown" has no "- unknown —" bullet in the plan; merged and retired slugs are history',
    ]);
  });
}

function scriptTickedPlanChecker(harness: FakeHarness): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "beta needs a follow-up",
          planCheck: {
            verdict: "progress",
            evidence: [
              { item: " `beta` ", status: "done", evidence: "beta holds" },
            ],
            followUps: [
              {
                kind: "missing-dep",
                slug: " `beta` ",
                dep: " `ghost` ",
                reason: "drop ghost",
              },
            ],
          },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_CHECK_STEP }) },
  );
}

async function verifyBareOutcomeOnDisk(runtime: KernelRuntime): Promise<void> {
  const records = await runtime.store.listRecords();
  const record = records.find(
    (r) => r.step === PLAN_CHECK_STEP && r.actor === "agent",
  );
  expect(record).toBeDefined();
  const file = runtime.store.records.file(record!, "outcome.yaml");
  const onDisk = yaml.parse(fs.readFileSync(file, "utf8"));
  expect(onDisk.planCheck.evidence[0].item).toBe("beta");
  expect(onDisk.planCheck.followUps[0].slug).toBe("beta");
  expect(onDisk.planCheck.followUps[0].dep).toBe("ghost");
}

async function runTickedCheckTurn(
  runtime: KernelRuntime,
  state: State,
): Promise<PlanCheckTurn> {
  const checked = await runPlanCheck(runtime, {
    iteration: 1,
    round: 1,
    state,
  });
  expect(checked.verdict).toBe("progress");
  expect(checked.evidence[0]?.item).toBe("beta");
  expect(checked.followUps[0]?.slug).toBe("beta");
  expect(checked.followUps[0]?.dep).toBe("ghost");
  await verifyBareOutcomeOnDisk(runtime);
  return checked;
}

async function testTickedSlugRoundtrip(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
): Promise<void> {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "# Plan\n\n- `beta` — Beta.\n",
    "utf8",
  );
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );

  scriptTickedPlanChecker(harness);
  const checked = await runTickedCheckTurn(runtime, state);

  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "leave beta",
          planCheckRoutes: [
            { slug: "beta", action: "leave", reason: "ghost needs work" },
          ],
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: "pm" }) },
  );

  const followed = await runPlanCheckPm(runtime, {
    iteration: 1,
    state,
    followUps: checked.followUps,
    cwd: runtime.paths.goalCheckout,
  });
  expect(followed.left).toEqual(["beta"]);
}

function scriptUnknownSlugCheckAndRepair(
  harness: FakeHarness,
  onPrompt: (prompt: string) => void,
): void {
  harness.script(
    (req, ctx) => {
      ctx.writeOutcome(
        outcome({
          summary: "try unknown follow up",
          planCheck: {
            verdict: "progress",
            evidence: [],
            followUps: [
              {
                kind: "cancel",
                slug: " `unknown-task` ",
                reason: "nonexistent",
              },
            ],
          },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_CHECK_STEP }) },
  );
  harness.script(
    (req, ctx) => {
      onPrompt(req.prompt);
      ctx.writeOutcome(
        outcome({
          summary: "repaired with known slug",
          planCheck: {
            verdict: "progress",
            evidence: [],
            followUps: [
              { kind: "cancel", slug: "beta", reason: "cancel beta" },
            ],
          },
        }),
      );
      return fakeTurnResult(req);
    },
    { when: whenTurn({ step: PLAN_CHECK_STEP }) },
  );
}

async function testUnknownSlugRejection(
  repo: ReturnType<typeof setupFlowRepo>["repo"],
  goal: string,
): Promise<void> {
  const harness = new FakeHarness({ id: "fake" });
  const runtime = await makeRuntime(repo, goal, { fake: harness });
  await writeTask(runtime, task("beta", { scope: ["beta.txt"] }));
  fs.writeFileSync(
    path.join(runtime.store.goalDir, "plan.md"),
    "# Plan\n\n- beta — Beta.\n",
    "utf8",
  );
  const state = derive(
    await runtime.store.listTasks(),
    await runtime.store.listRecords(),
    runtime.configs.process.flows,
  );

  let repairPrompt = "";
  scriptUnknownSlugCheckAndRepair(harness, (p) => {
    repairPrompt = p;
  });

  const checked = await runPlanCheck(runtime, {
    iteration: 1,
    round: 1,
    state,
  });
  expect(checked.verdict).toBe("progress");
  expect(checked.followUps.map((item) => item.slug)).toEqual(["beta"]);
  expect(repairPrompt).toContain(
    'follow-up slug "unknown-task" has no "- unknown-task —" bullet in the plan',
  );
}

function registerPlanCheckFlowTests(): void {
  it("stores bare slugs in plan-check record and validates PM route on bare slug", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      await testTickedSlugRoundtrip(repo, goal);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("rejects an unknown follow-up slug on the plan-check turn after normalising", async () => {
    const { repo, goal } = setupFlowRepo({ aliases: ALIASES });
    try {
      await testUnknownSlugRejection(repo, goal);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("slug canonicalisation at schema boundary", () => {
  registerSlugUnitTests();
  registerOutcomeSchemaNormalisationTests();
  registerPlanSlugsTests();
  registerPlanCheckFlowTests();
});
