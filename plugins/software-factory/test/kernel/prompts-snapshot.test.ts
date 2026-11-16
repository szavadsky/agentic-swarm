import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { packageRoot } from "../../src/kernel/config.js";
import { promptVars } from "../../src/kernel/flow-context.js";
import { loadPromptLibrary } from "../../src/kernel/prompts.js";
import { formatReviewFindings } from "../../src/kernel/record.js";
import type { ProcessConfig } from "../../src/kernel/types.js";
import { rec, task } from "./helpers.js";
import {
  cleanupFlowRepo,
  makeRuntime,
  outcome,
  setupFlowRepo,
} from "./s2-helpers.js";

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
    validate_cmd: "bun /factory/bin/factory.ts validate",
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
  },
  reviewer: {
    task_path: "/goal/tasks/alpha.md",
    worktree: "/worktrees/demo-tasks/alpha",
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
  },
  digest: {
    launch_id: "previous-launch-before-3",
    goal_dir: "/goal",
    records_dir: "/goal/records",
    transcripts_dir: "/sessions/demo/launch-2",
    digest_path: "/goal/iterations/3/digest.md",
    outcome_path: "/goal/records/00044-i3-digest-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
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
  };
}

describe("role prompts", () => {
  for (const [role, vars] of Object.entries(ROLES)) {
    it(`renders ${role} from exactly its documented variables`, () => {
      const lib = library();
      const placeholders = new Set(
        lib.placeholders(processConfig().roles[role]!.prompt),
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

  it("tells the reviewer its summary carries the implementer's findings", () => {
    const rendered = library().render("reviewer", ROLES.reviewer!);
    expect(rendered).toContain("numbered list in your outcome `summary`");
    expect(rendered).toContain(
      "receives that summary as its findings, followed by your concerns and forward",
    );
  });

  it("no longer calls fix-round findings empty on the first turn", () => {
    const rendered = library().render("implementer", ROLES.implementer!);
    expect(rendered).not.toContain("empty on the first turn");
    expect(rendered).toContain("review summary, then concerns and forward");
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
          outcome: outcome({ summary: dispositions }),
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
      expect(vars.fix_dispositions).toBe(dispositions);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 60_000);

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
    expect(rendered).toContain("Verify each claim against the diff");
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
        .filter((l) => l.trim() !== "" && !/^(\s|-)/.test(l));
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
