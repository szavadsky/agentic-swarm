import { describe, expect, it } from "bun:test";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { packageRoot } from "../../src/kernel/config.js";
import { promptVars } from "../../src/kernel/flow-context.js";
import { frontClassTypesVar } from "../../src/kernel/front.js";
import {
  outcomeRepairSchemaVar,
  outcomeSchemaVar,
  qaOutcomeSchemaVar,
  taskFrontmatterVar,
  taskTypesVar,
  tierNamesVar,
} from "../../src/kernel/prompt-schema.js";
import { loadPromptLibrary } from "../../src/kernel/prompts.js";
import { formatReviewFindings } from "../../src/kernel/record.js";
import { rec, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
} from "./s2-helpers.js";

const OUTCOME_SCHEMA = outcomeSchemaVar();

const TASK_FRONTMATTER = taskFrontmatterVar();

const TASK_TYPES = taskTypesVar({
  development: {
    flow: "implement-review",
    kind: "development",
    schema: "outcome",
  },
  spike: { flow: "spike", kind: "spike", schema: "outcome" },
  trivial: { flow: "just-implement", kind: "development", schema: "outcome" },
});

const TIERS = tierNamesVar({ implementer: {}, escalation: {} });

const CLASS_TYPES = frontClassTypesVar({
  development: {
    flow: "implement-review",
    kind: "development",
    schema: "outcome",
  },
  trivial: { flow: "just-implement", kind: "development", schema: "outcome" },
});

const ROLES: Record<string, Record<string, string>> = {
  architect: {
    turn: "boundary",
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    checkout: "/worktrees/demo",
    pack_path: "/goal/iterations/3/context-pack.md",
    digest_path: "/goal/iterations/3/digest.md",
    steers: "- s1 (mailbox/inbox/s1.md): keep the API stable",
    outcome_path: "/goal/records/00042-i3-architect-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
    task_types: TASK_TYPES,
    tiers: TIERS,
    depth: "2",
    subarchitect_block: "",
  },
  subarchitect: {
    turn: "boundary",
    iteration: "3",
    epic: "auth",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/epics/auth.md",
    parent_plan_path: "/goal/plan.md",
    checkout: "/worktrees/demo",
    pack_path: "/goal/iterations/3/epics/auth/context-pack.md",
    digest_path: "/goal/iterations/3/epics/auth/digest.md",
    outcome_path: "/goal/records/00048-i3-subarchitect-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
    task_types: TASK_TYPES,
    tiers: TIERS,
  },
  front: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    tasks_dir: "/goal/tasks",
    class_path: "/goal/class.yaml",
    pack_path: "/goal/iterations/3/context-pack.md",
    checkout: "/worktrees/demo",
    setup_command: "bun install",
    gate_commands: "- test: bun test",
    outcome_path: "/goal/records/00041-i3-front-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
    task_frontmatter: TASK_FRONTMATTER,
    task_types: TASK_TYPES,
    tiers: TIERS,
    class_types: CLASS_TYPES,
  },
  pm: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plans: "- goal: /goal/plan.md\n  - epic `auth`: /goal/epics/auth.md",
    tasks_dir: "/goal/tasks",
    existing_tasks: "- alpha | merged | abcdef1234 | deps: none | frozen",
    repair: '- task "beta" depends on missing task "ghost"',
    steers: "- s1 (mailbox/inbox/s1.md):\n  keep the API stable",
    holds_dir: "/goal/mailbox/holds",
    stalls:
      "- alpha\n  cause: blocked: stuck\n  records: /goal/records/00007-i3-alpha-implement-r1\n  branch: factory-task/demo/alpha\n  turns: 1 spent\n  done-when: Done when: it works.",
    outcome_path: "/goal/records/00043-i3-pm-r1/outcome.yaml",
    plan_checks:
      "- alpha (replace): mechanical park\n  cause: infra: runner lost\n  records: /goal/records/00007-i3-alpha-implement-r1\n  branch: factory-task/demo/alpha\n  turns: 1 spent\n  done-when: Done when: it works.",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
    task_frontmatter: TASK_FRONTMATTER,
    task_types: TASK_TYPES,
    tiers: TIERS,
  },
  implementer: {
    cleanliness_revision: "false",
    task_path: "/goal/tasks/alpha.md",
    front_pack: "/goal/iterations/3/context-pack.md",
    worktree: "/worktrees/demo-tasks/alpha",
    resume_note: "",
    report_path: ".factory/spikes/alpha.md",
    env_notes: "",
    setup_command: "bun install",
    gate_commands: "- test: bun test\n- typecheck: bun run typecheck",
    base_gates: "base abc1234def: green",
    findings: "- src/x.ts:41 needs a null check",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
  qa: {
    task_path: "/goal/tasks/alpha.md",
    worktree: "/worktrees/demo-tasks/alpha",
    base_hash: "abc1234",
    head_hash: "def5678",
    round: "1",
    max_rounds: "3",
    last_call: "false",
    base_gates: "base abc1234def: green",
    checks_result: "pass",
    checks_tree: "3ba247e47772a8ba5874d089990419f572432df8",
    checks_log: "/goal/records/1/alpha/checks",
    gate_commands: "- test: bun test",
    prior_findings: "",
    fix_dispositions: "",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: qaOutcomeSchemaVar(),
  },
  reviewer: {
    task_path: "/goal/tasks/alpha.md",
    worktree: "/worktrees/demo-tasks/alpha",
    author: "implementer",
    base_hash: "abc1234",
    head_hash: "def5678",
    round: "1",
    max_rounds: "3",
    last_call: "false",
    base_gates: "base abc1234def: green",
    checks_result: "pass",
    checks_tree: "3ba247e47772a8ba5874d089990419f572432df8",
    checks_log: "/goal/records/1/alpha/checks",
    prior_findings: "",
    upscope_ask: "",
    fix_dispositions: "",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
  digest: {
    launch_id: "previous-launch-before-3",
    goal_dir: "/goal",
    records_dir: "/goal/records",
    transcripts_dir: "/sessions/demo/launch-2",
    digest_path: "/goal/iterations/3/digest.md",
    outcome_path: "/goal/records/00044-i3-digest-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
  steward: {
    worktree: "/worktrees/demo-tasks/alpha",
    branch: "factory-task/demo/alpha",
    integration_head: "abc1234def5678",
    conflicts: "conflict.txt",
    gate_commands: "- test: bun test",
    base_gates: "base abc1234def: green",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
  intent: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    steer: "- s1 (mailbox/inbox/s1.md):\n  keep the API stable",
    outcome_path: "/goal/records/00009-i3-s1-intent-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
  "plan-checker": {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plans: "- goal: /goal/plan.md\n  - epic `auth`: /goal/epics/auth.md",
    checkout: "/worktrees/demo",
    tasks_dir: "/goal/tasks",
    existing_tasks: "- alpha | merged | abcdef1234 | deps: none | frozen",
    gate_record_path: "/goal/records/00007-i3-alpha-checks-r1/end.yaml",
    outcome_path: "/goal/records/00045-i3-plan-check-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
  "pack-preparer": {
    iteration: "3",
    context_data_path: "/goal/iterations/3/context-data.json",
    pack_path: "/goal/iterations/3/context-pack.md",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    checkout: "/worktrees/demo",
    outcome_path: "/goal/records/00046-i3-packprep-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
  "review-architect": {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    pack_path: "/goal/iterations/3/context-pack.md",
    worktree: "/worktrees/demo",
    outcome_path: "/goal/records/00046-i3-planreview-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: outcomeRepairSchemaVar("review-architect", "any"),
    task_types: TASK_TYPES,
    tiers: TIERS,
  },
  "architect-review-return": {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    pack_path: "/goal/iterations/3/context-pack.md",
    reviewers: "`plan-reviewer`",
    technical_findings:
      "1. plan.md:12 — the bullet assumes a module the repo lacks",
    plan_notes: "2. plan.md:40 — the done-when names no command",
    finding_count: "2",
    outcome_path: "/goal/records/00047-i3-planreturn-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: outcomeRepairSchemaVar("architect-review-return", "any"),
  },
};

function library() {
  return loadPromptLibrary({ builtinDir: path.join(packageRoot, "prompts") });
}

function reviewerIncludesAuthorSBodyPart1() {
  it("is an author-neutral intro, the implementer's body verbatim, then its duties", () => {
    // The author body is the development variant: a reviewer has no report to
    // commit, so the spike opening is not part of it.
    const implementer = library().render("implementer", {
      ...ROLES.implementer!,
      report_path: "",
    });
    const at = implementer.indexOf("## This turn");
    expect(at, "implementer has no turn block").toBeGreaterThan(0);
    const implementerBody = implementer.slice(0, at);
    const reviewer = library().render("reviewer", ROLES.reviewer!);
    const intro = reviewer.slice(0, reviewer.indexOf("\n\n"));
    expect(intro.startsWith("You review one author's work.")).toBe(true);
    expect(intro).not.toContain("task diff");
    expect(reviewer.startsWith(`${intro}\n\n${implementerBody}`)).toBe(true);
    const duties = reviewer.slice(intro.length + 2 + implementerBody.length);
    expect(duties.startsWith("## Review\n")).toBe(true);
    expect(duties).toContain("You review the task diff");
    expect(duties).toContain(
      "5. Out-of-area changes, per the scope rule above.",
    );
    // The shared fragments arrive once, through the author's body.
    for (const heading of ["## Code standard", "## Calibration", "## Outcome"])
      expect(reviewer.split(heading).length - 1, heading).toBe(1);
    // Only the reviewer's own turn block: the author's stayed out.
    expect(reviewer.split("## This turn").length - 1).toBe(1);
    expect(
      reviewer.split("- `verdict` is used on review steps").length - 1,
    ).toBe(1);
  });

  it("fails loudly when the author has no body", () => {
    expect(() =>
      library().render("reviewer", { ...ROLES.reviewer!, author: "nobody" }),
    ).toThrow('Prompt fragment "nobody-body" not found');
  });
}

function reviewerIncludesAuthorSBodyPart2() {
  it("fails loudly, by name, when the author has no duties", () => {
    const lib = loadPromptLibrary({
      builtinDir: path.join(packageRoot, "prompts"),
      overrides: { "nobody-body": "Implementer body." },
    });
    expect(() =>
      lib.render("reviewer", { ...ROLES.reviewer!, author: "nobody" }),
    ).toThrow('Prompt fragment "review-nobody" not found');
  });
}

function reviewerIncludesArchitectBodyPart1() {
  it("includes the architect's body verbatim, then the review focus and findings schema", () => {
    const lib = library();
    const architect = lib.render("architect", ROLES.architect!);
    const rendered = lib.render("review-architect", ROLES["review-architect"]!);
    const bodyUpTo = (text: string, end: string): string => {
      const start = text.indexOf("## Turn order\n");
      expect(start, "no turn order").toBeGreaterThanOrEqual(0);
      const endAt = text.indexOf(end, start);
      expect(endAt, `no ${end}`).toBeGreaterThan(start);
      return text.slice(start, endAt);
    };
    // The body is the architect's static text; only its outcome skeleton is
    // the review turn's own narrowed schema.
    expect(bodyUpTo(rendered, "## Outcome\n")).toBe(
      bodyUpTo(architect, "## Outcome\n"),
    );
    for (const heading of [
      "## Turn order\n",
      "## What the plan carries\n",
      "## Granularity and dispatch\n",
      "## Debt, parked work and ADRs\n",
      "## Tiers\n",
      "## Calibration\n",
      "## Outcome\n",
    ]) {
      expect(rendered.split(heading).length - 1, heading).toBe(1);
    }
    // The review focus sits after the body it judges, never inside it.
    const duties = rendered.slice(rendered.indexOf("## Review\n"));
    expect(duties.startsWith("## Review\n")).toBe(true);
    expect(duties).toContain("You review the architect's plan");
    expect(duties).toContain("### Focus, in order");
    expect(duties).not.toContain("## Turn order");
    // The review's outcome asks for findings and never for a verdict.
    expect(rendered).toContain(
      "planReview: {technical: [{planLine, finding}], planNotes: [{planLine, finding}]}",
    );
    expect(rendered).not.toContain("verdict:");
    expect(rendered).not.toContain("- `verdict` is used on review steps");
    // Only the body is shared: the top architect's scope, marks and the
    // implementer's work instructions stay out.
    expect(rendered).not.toContain("## Your scope");
    expect(rendered).not.toContain("## Steers");
    expect(rendered).not.toContain("## Plan review marks");
    expect(rendered).not.toContain("You implement one task");
    expect(rendered.split("## This turn").length - 1).toBe(1);
  });
}

function registerReviewFindingsCarryPart1(): void {
  it("formats the review outcome whole: summary first, then concerns and forward", () => {
    const summary =
      "1. src/x.ts:41 needs a null check\n2. test/y.ts:9 asserts nothing";
    const text = formatReviewFindings(
      outcome({
        summary,
        concerns: [
          {
            kind: "debt",
            calibration: "architect",
            text: "retry helper duplicates backoff",
            evidence: "src/z.ts:3",
          },
        ],
        forward: ["split the helper next iteration"],
      }),
    );
    expect(text).toContain(summary);
    expect(text.split("\n")[0]).toBe("1. src/x.ts:41 needs a null check");
    const summaryAt = text.indexOf("1. src/x.ts:41");
    const concernAt = text.indexOf("retry helper duplicates backoff");
    const forwardAt = text.indexOf("split the helper next iteration");
    expect(summaryAt).toBeGreaterThanOrEqual(0);
    expect(concernAt).toBeGreaterThan(summaryAt);
    expect(forwardAt).toBeGreaterThan(concernAt);
  });
}

function registerReviewFindingsCarryPart2(): void {
  it("carries a summary-only changes review into findings and prior_findings", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const taskFile = task("alpha", { scope: ["alpha-area"] });
      const flow = runtime.configs.process.flows["implement-review"]!;
      const summary = "1. src/x.ts:41 needs a null check";
      const records = [
        rec(1, { slug: "alpha", step: "implement", round: 1 }),
        rec(2, {
          slug: "alpha",
          step: "review",
          round: 1,
          outcome: outcome({ summary, verdict: "changes" }),
        }),
      ];
      const vars = promptVars(
        runtime,
        taskFile,
        "/worktrees/demo-tasks/alpha",
        records,
        2,
        flow,
      );
      expect(vars.findings).toContain(summary);
      expect(vars.prior_findings).toContain(summary);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);
}

describe("spike prompt", () => {
  it("adds the report commit only to a spike's implementer turn", () => {
    const lib = library();
    const spike = {
      ...ROLES.implementer!,
      report_path: ".factory/spikes/alpha.md",
    };
    expect(lib.render("implementer", spike)).toStartWith(
      "Commit the report at `.factory/spikes/alpha.md` first, then refine it.\n\n",
    );
    expect(
      lib.render("implementer", { ...ROLES.implementer!, report_path: "" }),
    ).toStartWith("You implement one task in one worktree.");
  });
});

describe("reviewer includes its author's body", () => {
  reviewerIncludesAuthorSBodyPart1();

  reviewerIncludesAuthorSBodyPart2();

  reviewerIncludesArchitectBodyPart1();
});

describe("review findings carry", () => {
  registerReviewFindingsCarryPart1();

  registerReviewFindingsCarryPart2();
});
