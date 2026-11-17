import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { packageRoot } from "../../src/kernel/config.js";
import { promptVars } from "../../src/kernel/flow-context.js";
import { frontClassFlowsVar } from "../../src/kernel/front.js";
import {
  flowNamesVar,
  outcomeSchemaVar,
  taskFrontmatterVar,
  tierNamesVar,
} from "../../src/kernel/prompt-schema.js";
import { loadPromptLibrary } from "../../src/kernel/prompts.js";
import {
  formatFixDispositions,
  formatReviewFindings,
} from "../../src/kernel/record.js";
import type { ProcessConfig } from "../../src/kernel/types.js";
import { rec, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
} from "./s2-helpers.js";

const OUTCOME_SCHEMA = outcomeSchemaVar();
const TASK_FRONTMATTER = taskFrontmatterVar();
const FLOWS = flowNamesVar({
  "implement-review": {},
  "just-implement": {},
  spike: {},
});
const TIERS = tierNamesVar({ implementer: {}, escalation: {} });
const CLASS_FLOWS = frontClassFlowsVar();

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
    flows: FLOWS,
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
    flows: FLOWS,
    tiers: TIERS,
    class_flows: CLASS_FLOWS,
  },
  pm: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    tasks_dir: "/goal/tasks",
    existing_tasks: "- alpha | merged | abcdef1234 | deps: none | frozen",
    repair: '- task "beta" depends on missing task "ghost"',
    steers: "- s1 (mailbox/inbox/s1.md):\n  keep the API stable",
    holds_dir: "/goal/mailbox/holds",
    stalls:
      "- alpha\n  cause: blocked: stuck\n  records: /goal/records/00007-i3-alpha-implement-r1\n  branch: factory-task/demo/alpha\n  turns: 1 of 8 spent\n  done-when: Done when: it works.",
    outcome_path: "/goal/records/00043-i3-pm-r1/outcome.yaml",
    plan_checks:
      "- alpha (continuation): mechanical park\n  cause: infra: runner lost\n  records: /goal/records/00007-i3-alpha-implement-r1\n  branch: factory-task/demo/alpha\n  turns: 1 of 8 spent\n  done-when: Done when: it works.",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
    task_frontmatter: TASK_FRONTMATTER,
    flows: FLOWS,
    tiers: TIERS,
  },
  implementer: {
    task_path: "/goal/tasks/alpha.md",
    front_pack: "/goal/iterations/3/context-pack.md",
    worktree: "/worktrees/demo-tasks/alpha",
    resume_note: "",
    setup_command: "bun install",
    gate_commands: "- test: bun test\n- typecheck: bun run typecheck",
    baseline_checks: "- test: 2 failing",
    findings: "- src/x.ts:41 needs a null check",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
  reviewer: {
    task_path: "/goal/tasks/alpha.md",
    worktree: "/worktrees/demo-tasks/alpha",
    author: "implementer",
    base_hash: "abc1234",
    head_hash: "def5678",
    round: "1",
    max_rounds: "2",
    baseline_checks: "- test: 2 failing",
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
    baseline_checks: "none",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
  "plan-checker": {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    checkout: "/worktrees/demo",
    tasks_dir: "/goal/tasks",
    existing_tasks: "- alpha | merged | abcdef1234 | deps: none | frozen",
    outcome_path: "/goal/records/00045-i3-plan-check-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: OUTCOME_SCHEMA,
  },
};

function library() {
  return loadPromptLibrary({ builtinDir: path.join(packageRoot, "prompts") });
}

function processConfig(): ProcessConfig {
  return {
    flows: {},
    roles: Object.fromEntries(
      Object.keys(ROLES).map((role) => [role, { prompt: role }]),
    ),
    itemTurns: 8,
    reminders: 1,
  };
}

describe("role prompts", () => {
  for (const [role, vars] of Object.entries(ROLES)) {
    it(`renders ${role} from exactly its documented variables`, () => {
      const lib = library();
      const placeholders = new Set(
        lib.placeholders(processConfig().roles[role]!.prompt, vars),
      );
      expect([...placeholders].sort()).toEqual(Object.keys(vars).sort());

      const rendered = lib.render(processConfig().roles[role]!.prompt, vars);
      expect(rendered).toMatchSnapshot(role);
      expect(rendered).not.toContain("{{");

      for (const name of placeholders) {
        const missing = { ...vars };
        delete missing[name];
        expect(() =>
          lib.render(processConfig().roles[role]!.prompt, missing),
        ).toThrow("Missing required prompt variables");
      }
    });
  }

  it("keeps role text out of a separate system channel", () => {
    // The harness contract has `system`, but OpenCode has no system flag; role
    // identity must therefore live in the rendered prompt itself (KERNEL0 S3).
    const rendered = library().render(
      processConfig().roles.architect!.prompt,
      ROLES.architect!,
    );
    expect(rendered.startsWith("You are the architect")).toBe(true);
  });
});

describe("reviewer includes its author's body", () => {
  function body(role: keyof typeof ROLES): string {
    const rendered = library().render(role, ROLES[role]!);
    const at = rendered.indexOf("## This turn");
    expect(at, `${role} has no turn block`).toBeGreaterThan(0);
    return rendered.slice(0, at);
  }

  it("is an author-neutral intro, the implementer's body verbatim, then its duties", () => {
    const implementerBody = body("implementer");
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

  it("fails loudly, by name, when the author has no duties", () => {
    const lib = loadPromptLibrary({
      builtinDir: path.join(packageRoot, "prompts"),
      overrides: { "nobody-body": "Implementer body." },
    });
    expect(() =>
      lib.render("reviewer", { ...ROLES.reviewer!, author: "nobody" }),
    ).toThrow('Prompt fragment "review-nobody" not found');
  });

  it("selects the architect body and plan duties for author architect", () => {
    const lib = library();
    const architectPlaceholders = lib.placeholders("reviewer", {
      author: "architect",
    });
    const implementerPlaceholders = lib.placeholders("reviewer", {
      author: "implementer",
    });
    expect(architectPlaceholders).toEqual(
      expect.arrayContaining([
        "tiers",
        "flows",
        "iteration",
        "intent_path",
        "plan_path",
        "pack_path",
        "worktree",
      ]),
    );
    expect(architectPlaceholders).not.toContain("task_path");
    expect(architectPlaceholders).not.toContain("base_hash");
    expect(implementerPlaceholders).not.toContain("tiers");
    expect(implementerPlaceholders).not.toContain("flows");
    expect(implementerPlaceholders).not.toContain("intent_path");

    const rendered = lib.render("reviewer", {
      ...ROLES.architect!,
      ...ROLES.reviewer!,
      author: "architect",
    });
    expect(rendered.startsWith("You review one author's work.")).toBe(true);
    expect(rendered).toContain("You are the architect");
    expect(rendered).toContain("You review the architect's plan");
    expect(rendered).toContain("/goal/intent.md");
    expect(rendered).toContain("/goal/plan.md");
    expect(rendered).not.toContain("You implement one task");
    expect(rendered).not.toContain("You review the task diff");
    expect(rendered).not.toContain("### Decision");
    // Only the reviewer's own turn block: the architect's stayed out.
    expect(rendered.split("## This turn").length - 1).toBe(1);
    expect(
      rendered.split("- `verdict` is used on review steps").length - 1,
    ).toBe(1);
  });
});

describe("review findings carry", () => {
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

  it("keeps gate-failure findings when red checks are the latest record", async () => {
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
        rec(3, {
          slug: "alpha",
          step: "checks",
          round: 1,
          actor: "script",
          alias: undefined,
          model: undefined,
          ok: false,
          checks: [
            {
              name: "test",
              ok: false,
              summary: "exit 1",
              output: "(fail) alpha > one",
              fingerprint: "test:(fail) alpha > one",
            },
          ],
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
      expect(vars.findings).toContain("### test: exit 1");
      expect(vars.findings).not.toContain(summary);
      expect(vars.prior_findings).toContain(summary);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("tells the reviewer to write numbered findings in its summary", () => {
    const rendered = library().render("reviewer", ROLES.reviewer!);
    expect(rendered).toContain("numbered list in your outcome `summary`");
    expect(rendered).not.toContain("next implementer receives");
  });

  it("marks findings empty before the first review, not per fix round", () => {
    const rendered = library().render("implementer", ROLES.implementer!);
    expect(rendered).not.toContain("empty on the first turn");
    expect(rendered).toContain("empty before the first review");
  });
});

describe("prompt debloat", () => {
  function renderedPrompts(): Map<string, string> {
    const rendered = new Map<string, string>();
    for (const [role, vars] of Object.entries(ROLES))
      rendered.set(role, library().render(role, vars));
    rendered.set(
      "plan-reviewer",
      library().render("reviewer", {
        ...ROLES.architect!,
        ...ROLES.reviewer!,
        author: "architect",
      }),
    );
    return rendered;
  }

  // One entry per original sentence class: where an input came from, how it
  // was produced, or what the kernel/next role does with the output.
  const PROVENANCE_OR_DOWNSTREAM = [
    "implemented and merged after gates",
    "the front's briefing for this goal",
    "review summary, then concerns and forward",
    "You get the task file or plan",
    "next implementer receives",
    "Each tier gets two turns",
    "the ladder climbs",
    "fallbacks already absorbed",
    "A pending task in this list is not dispatched",
    "runs its flow to the end",
    "keeps running to exhaustion",
    "outbox response",
    "landed outcome is answered to the owner later",
    "The next boundary presents the steer verbatim",
    "the hold drains the goal",
    "the next boundary sees your reason",
    "the next reconcile never cancels them",
    "a fresh session at the same tier",
    "writes were rolled back",
    "Records follow the kernel step record",
    "the previous launch being summarised",
    "replaces the scripted pack",
    "it briefs the implementer",
    "after this turn the script runs",
    "records hold the history",
    "Parked tasks come from the pack with a cause",
    "the rest continues unless the steer blocks the goal",
    "There is no diff and no task file to judge",
    "next implementers receive only what its bullets say",
    "The plan stands or changes on the architect's decision",
    "The dispatch set ran out",
    "before the architect is consulted",
    "the kernel throws away whatever you write outside the outcome",
    "everything else stays on the record",
    "the fix round's per-finding disposition claims",
    "the escalation ask for a standalone task",
    "red before this diff",
    "status, hashes, paths, evidence; drill in by path",
    "stays on the record",
    "waits for the next architect turn",
    "a concern costs the next stage attention",
    "deserves the next stage's attention",
  ];

  it("drops input provenance and downstream steps from every rendered prompt", () => {
    const rendered = renderedPrompts();
    const found: string[] = [];
    for (const [role, prompt] of rendered) {
      for (const phrase of PROVENANCE_OR_DOWNSTREAM) {
        if (prompt.includes(phrase)) found.push(`${role}: ${phrase}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("keeps the bounds and deliverables a role acts on", () => {
    const rendered = renderedPrompts();
    const keeps: [string, string][] = [
      ["architect", "Nothing asks mid-flight"],
      ["architect", "plan the road to completion as far as uncertainty allows"],
      ["front", "no design decision, no ordering and no review"],
      ["front", "On `trivial` or `task`, carry the area and risks"],
      ["pm", "Write one hold file per steer"],
      ["pm", "Only an escalated ask may put a question"],
      ["implementer", "Do not commit, amend, push"],
      ["implementer", "failures here are pre-existing"],
      ["reviewer", "Write them as a numbered list in your outcome `summary`"],
      ["reviewer", "not findings against this diff"],
      ["digest", "at most 80 lines"],
      ["plan-checker", "MUST report honestly"],
      ["steward", "Never rebase"],
    ];
    for (const [role, phrase] of keeps) {
      expect(rendered.get(role), role).toContain(phrase);
    }
  });
});

describe("fix dispositions carry", () => {
  it("carries the current fix round's dispositions into fix_dispositions", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const taskFile = task("alpha", { scope: ["alpha-area"] });
      const flow = runtime.configs.process.flows["implement-review"]!;
      const dispositions =
        "F1 fixed in src/x.ts:41; F2 out of scope per done-when";
      const replies = [
        { finding: 1, reply: "null check added at src/x.ts:41" },
        { finding: 2, reply: "the assertion moves to test/y.ts:9" },
      ];
      const records = [
        rec(1, { slug: "alpha", step: "implement", round: 1 }),
        rec(2, {
          slug: "alpha",
          step: "review",
          round: 1,
          outcome: outcome({
            summary: "1. src/x.ts:41 needs a null check",
            verdict: "changes",
          }),
        }),
        rec(3, {
          slug: "alpha",
          step: "implement",
          round: 2,
          outcome: outcome({ summary: dispositions, replies }),
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
      expect(vars.fix_dispositions).toContain(dispositions);
      for (const reply of replies) {
        expect(vars.fix_dispositions).toContain(
          `finding ${reply.finding}: ${reply.reply}`,
        );
      }
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("renders each reply by its finding number after the fix summary", () => {
    const summary = "replied without a change";
    const text = formatFixDispositions(
      outcome({
        summary,
        replies: [
          { finding: 1, reply: "already guarded" },
          { finding: 2, reply: "already asserted" },
        ],
      }),
    );
    expect(text).toBe(
      "replied without a change\n- finding 1: already guarded\n- finding 2: already asserted",
    );
  });

  it("leaves fix_dispositions empty without a current-round fix", async () => {
    const { repo, goal } = setupFlowRepo();
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const taskFile = task("alpha", { scope: ["alpha-area"] });
      const flow = runtime.configs.process.flows["implement-review"]!;
      const first = [
        rec(1, {
          slug: "alpha",
          step: "implement",
          round: 1,
          outcome: outcome({ summary: "implemented" }),
        }),
      ];
      const round1 = promptVars(
        runtime,
        taskFile,
        "/worktrees/demo-tasks/alpha",
        first,
        1,
        flow,
      );
      expect(round1.fix_dispositions).toBe("");
      const stale = promptVars(
        runtime,
        taskFile,
        "/worktrees/demo-tasks/alpha",
        first,
        2,
        flow,
      );
      expect(stale.fix_dispositions).toBe("");
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

  it("renders the fix-dispositions line in the reviewer prompt", () => {
    const rendered = library().render("reviewer", {
      ...ROLES.reviewer!,
      fix_dispositions: "F1 fixed",
    });
    expect(rendered).toContain("F1 fixed");
    expect(rendered).toContain(
      "Re-judge each finding against the diff or its reply",
    );
    expect(rendered).toContain("a reply is judged on its argument");
  });

  it("tells the implementer a reply-only round is done", () => {
    const rendered = library().render("implementer", ROLES.implementer!);
    expect(rendered).toContain(
      "each is answered by a change, a reply in `replies`, or both",
    );
    expect(rendered).toContain("a reply-only round is `done`");
  });
});

describe("scope as predicted area", () => {
  it("defines scope as a predicted area, not a fence, in one shared include", () => {
    const implementer = library().render("implementer", ROLES.implementer!);
    const reviewer = library().render("reviewer", ROLES.reviewer!);
    for (const rendered of [implementer, reviewer]) {
      expect(rendered).toContain("predicted area, not a fence");
      expect(rendered).toContain("list files outside the area");
      expect(rendered).toContain("different seam or a missing dependency");
      expect(rendered).not.toContain("Touch only files");
    }
    expect(implementer).toContain(
      "Fix every finding from the previous review round that the done-when covers, wherever it lives",
    );
    expect(reviewer).toContain(
      "judge out-of-area changes by the done-when, not by location",
    );
    expect(reviewer).not.toContain("Scope creep");
  });

  it("carries an area, not file globs, in the authoring roles", () => {
    const architect = library().render("architect", ROLES.architect!);
    expect(architect).toContain("the predicted area this task works in");
    expect(architect).toContain("must declare disjoint areas");
    expect(architect).not.toContain("must not overlap in scope");
    const pm = library().render("pm", ROLES.pm!);
    expect(pm).toContain("the predicted area, from the task's stated area");
    expect(pm).not.toContain("globs the task may touch");
    const front = library().render("front", ROLES.front!);
    expect(front).toContain("`scope` (the predicted area)");
    expect(front).not.toContain("globs the task may touch");
  });
});

describe("architect horizon", () => {
  it("evaluates the project against the intent first and plans the road to completion", () => {
    const rendered = library().render("architect", ROLES.architect!);
    const firstStep = rendered.indexOf("### 1. Completeness check");
    const editPlan = rendered.indexOf("### 4. Edit the plan");
    expect(firstStep).toBeGreaterThanOrEqual(0);
    expect(editPlan).toBeGreaterThan(firstStep);
    const stepOne = rendered.slice(firstStep, editPlan);
    expect(stepOne).toContain("against the intent");
    expect(stepOne).toContain(
      "completeness, quality, correctness of what exists",
    );
    expect(stepOne).toContain("not only the last iteration");
    expect(stepOne).toContain(
      "Reuse this evaluation context for planning below",
    );
    expect(rendered).toContain(
      "road to completion as far as uncertainty allows",
    );
    expect(rendered).toContain("not one iteration's slice");
    expect(rendered).toContain("details after spike X / task Y lands");
    expect(rendered).not.toContain("plan the whole iteration");
  });
});

describe("prompt structure", () => {
  it("gives every role one H1, ordered headings, and nothing after the turn block", () => {
    const promptsDir = path.join(packageRoot, "prompts");
    for (const [role, vars] of Object.entries(ROLES)) {
      const rendered = library().render(role, vars);
      const lines = rendered.split("\n");
      const h1 = lines.filter((l) => l.startsWith("# "));
      expect(h1.length, `${role} H1s: ${h1.join(" | ")}`).toBeLessThan(2);
      let prev = 0;
      let first = true;
      for (const line of lines) {
        const m = line.match(/^(#{1,6})\s/);
        if (!m) continue;
        const level = m[1]!.length;
        if (!first && level > prev + 1) {
          expect(
            `skipped heading in ${role}: H${prev} -> H${level}: ${line}`,
          ).toEqual("");
        }
        first = false;
        prev = level;
      }
      const headings = lines.filter((l) => /^#{1,6}\s/.test(l));
      const turnAt = headings.findIndex((h) => h.startsWith("## This turn"));
      expect(turnAt, `${role} has no ## This turn`).toBeGreaterThanOrEqual(0);
      expect(
        turnAt,
        `${role} has text after ## This turn: ${headings.slice(turnAt + 1).join(" | ")}`,
      ).toBe(headings.length - 1);
      const source = fs.readFileSync(
        path.join(promptsDir, `${role}.md`),
        "utf8",
      );
      const turnLine = source
        .split("\n")
        .findIndex((l) => l.startsWith("## This turn"));
      expect(
        turnLine,
        `${role} source has no ## This turn`,
      ).toBeGreaterThanOrEqual(0);
      const stray = source
        .split("\n")
        .slice(turnLine + 1)
        .filter((l) => l.trim() !== "" && !/^(\s|-|\{%|\{\{)/.test(l));
      expect(
        stray,
        `${role} has non-variable content after ## This turn: ${stray.join(" | ")}`,
      ).toEqual([]);
    }
  });
});

const SINGLE_DEFINITION_WORDS = 8;

function promptSentences(text: string): string[] {
  const stripped = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .replace(/\{%[\s\S]*?%\}/g, " ");
  const sentences: string[] = [];
  for (const line of stripped.split("\n")) {
    const cleaned = line
      .replace(/^\s*(#{1,6}\s+|\d+[.)]\s+|[-*]\s+)/, "")
      .trim();
    if (!cleaned) continue;
    for (const part of cleaned.split(/(?<=[.!?])\s+/)) {
      const sentence = part.replace(/\s+/g, " ").trim().toLowerCase();
      if (sentence && sentence.split(/\s+/).length >= SINGLE_DEFINITION_WORDS) {
        sentences.push(sentence);
      }
    }
  }
  return sentences;
}

function internalRepeats(
  rendered: Map<string, string>,
  allowed: Record<string, string[]>,
): { sentence: string; holders: string[] }[] {
  const repeats: { sentence: string; holders: string[] }[] = [];
  for (const [role, text] of rendered) {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const sentence of promptSentences(text)) {
      if (seen.has(sentence)) dupes.add(sentence);
      seen.add(sentence);
    }
    for (const sentence of dupes) {
      if (!(allowed[role] ?? []).includes(sentence)) {
        repeats.push({ sentence, holders: [role, role] });
      }
    }
  }
  return repeats;
}

function crossFragmentRepeats(
  fragments: Map<string, string>,
  allowed: Record<string, string[]> = {},
): { sentence: string; holders: string[] }[] {
  const holders = new Map<string, string[]>();
  for (const [name, text] of fragments) {
    for (const sentence of new Set(promptSentences(text))) {
      const list = holders.get(sentence) ?? [];
      list.push(name);
      holders.set(sentence, list);
    }
  }
  return [...holders]
    .filter(([, names]) => names.length > 1)
    .filter(
      ([sentence, names]) =>
        !names.some((name) => (allowed[name] ?? []).includes(sentence)),
    )
    .map(([sentence, holders]) => ({ sentence, holders }));
}

describe("prompt single definitions", () => {
  // Sentences (normalized, 8+ words) allowed to repeat, keyed by fragment
  // name. A repeat is excused when any fragment or role holding it lists it
  // here. Empty: every rule lives in exactly one fragment.
  const ALLOWED_REPEATS: Record<string, string[]> = {};

  it("defines every 8-word sentence once: no repeat inside one rendered prompt or across two fragments", () => {
    const rendered = new Map<string, string>();
    for (const [role, vars] of Object.entries(ROLES)) {
      rendered.set(role, library().render(role, vars));
    }
    const promptsDir = path.join(packageRoot, "prompts");
    const fragments = new Map<string, string>();
    for (const file of fs.readdirSync(promptsDir).sort()) {
      if (!file.endsWith(".md") || file === "VARIABLES.md") continue;
      fragments.set(
        file.replace(/\.md$/, ""),
        fs.readFileSync(path.join(promptsDir, file), "utf8"),
      );
    }
    const repeats = [
      ...internalRepeats(rendered, ALLOWED_REPEATS),
      ...crossFragmentRepeats(fragments, ALLOWED_REPEATS),
    ];
    expect(
      repeats.map(
        ({ sentence, holders }) => `${holders.join(" + ")}: ${sentence}`,
      ),
      "duplicated prompt sentences (move each to the fragment that owns it, or allow-list it)",
    ).toEqual([]);
  });

  it("treats liquid tags and code blocks as non-sentences", () => {
    expect(
      promptSentences(
        [
          "{% include 'scope' %}",
          "```yaml",
          "a one two three four five six seven eight nine ten code sentence",
          "```",
          "Rule {{name}} text {{other}} here.",
          "A real rule sentence with more than eight words lives here plainly.",
        ].join("\n"),
      ),
    ).toEqual([
      "a real rule sentence with more than eight words lives here plainly.",
    ]);
  });

  it("excuses an allow-listed repeat", () => {
    const fragments = new Map([
      ["a", "A shared rule sentence with more than eight words lives here."],
      ["b", "A shared rule sentence with more than eight words lives here."],
    ]);
    expect(crossFragmentRepeats(fragments)).toEqual([
      {
        sentence:
          "a shared rule sentence with more than eight words lives here.",
        holders: ["a", "b"],
      },
    ]);
    expect(
      crossFragmentRepeats(fragments, {
        b: ["a shared rule sentence with more than eight words lives here."],
      }),
    ).toEqual([]);
  });
});
