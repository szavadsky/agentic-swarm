import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { packageRoot } from "../../src/kernel/config.js";
import {
  taskFrontmatterVar,
  tierNamesVar,
} from "../../src/kernel/prompt-schema.js";
import { outcomeExampleVar } from "../../src/kernel/outcome-example.js";
import { packPreparerOutcomeSchemaVar } from "../../src/kernel/pack-prep.js";
import { qaOutcomeSchema } from "../../src/kernel/qa.js";
import { loadPromptLibrary } from "../../src/kernel/prompts.js";
import { TEST_CLASS_TYPES, TEST_TASK_TYPES_VAR } from "./helpers.js";

const OUTCOME_SCHEMA = outcomeExampleVar("implementer", "any");

const BASE_SCHEMA = outcomeExampleVar("front", "any");

const ARCHITECT_SCHEMA = outcomeExampleVar("architect", "architect");

const SUBARCHITECT_SCHEMA = outcomeExampleVar("subarchitect", "architect");

const PM_SCHEMA = outcomeExampleVar("pm", "any");

const QA_SCHEMA = outcomeExampleVar("qa", "qa", qaOutcomeSchema);

const REVIEWER_SCHEMA = outcomeExampleVar("reviewer", "review");

const CHECKER_SCHEMA = outcomeExampleVar("plan-checker", "any");

const PLAN_REVIEW_SCHEMA = outcomeExampleVar("review-architect", "any");

const PLAN_RETURN_SCHEMA = outcomeExampleVar("architect-review-return", "any");

const TASK_FRONTMATTER = taskFrontmatterVar();

const TIERS = tierNamesVar({ implementer: {}, escalation: {} });

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
    outcome_schema: ARCHITECT_SCHEMA,
    task_types: TEST_TASK_TYPES_VAR,
    tiers: TIERS,
    depth: "2",
    subarchitect_block: "",
    saga_reminder: "",
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
    outcome_schema: SUBARCHITECT_SCHEMA,
    task_types: TEST_TASK_TYPES_VAR,
    tiers: TIERS,
  },
  front: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    tasks_dir: "/goal/tasks",
    class_path: "/goal/class.yaml",
    pack_path: "/goal/iterations/3/context-pack.md",
    code_map_path: "/goal/code-map.md",
    checkout: "/worktrees/demo",
    setup_command: "bun install",
    gate_commands: "- test: bun test",
    outcome_path: "/goal/records/00041-i3-front-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: BASE_SCHEMA,
    task_frontmatter: TASK_FRONTMATTER,
    task_types: TEST_TASK_TYPES_VAR,
    tiers: TIERS,
    class_types: TEST_CLASS_TYPES,
  },
  pm: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plans: "- goal: /goal/plan.md\n  - epic `auth`: /goal/epics/auth.md",
    tasks_dir: "/goal/tasks",
    existing_tasks: "- alpha | merged | abcdef1234 | deps: none | frozen",
    repair: '- task "beta" depends on missing task "ghost"',
    steers: "- s1 (mailbox/inbox/s1.md):\n  keep the API stable",
    concerns: "none",
    holds_dir: "/goal/mailbox/holds",
    stalls:
      "- alpha\n  cause: blocked: stuck\n  records: /goal/records/00007-i3-alpha-implement-r1\n  branch: factory-task/demo/alpha\n  turns: 1 spent\n  done-when: Done when: it works.",
    outcome_path: "/goal/records/00043-i3-pm-r1/outcome.yaml",
    plan_checks:
      "- alpha (replace): mechanical park\n  cause: infra: runner lost\n  records: /goal/records/00007-i3-alpha-implement-r1\n  branch: factory-task/demo/alpha\n  turns: 1 spent\n  done-when: Done when: it works.",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: PM_SCHEMA,
    task_frontmatter: TASK_FRONTMATTER,
    task_types: TEST_TASK_TYPES_VAR,
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
    outcome_schema: QA_SCHEMA,
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
    outcome_schema: REVIEWER_SCHEMA,
  },
  digest: {
    launch_id: "previous-launch-before-3",
    goal_dir: "/goal",
    records_dir: "/goal/records",
    transcripts_dir: "/sessions/demo/launch-2",
    digest_path: "/goal/iterations/3/digest.md",
    outcome_path: "/goal/records/00044-i3-digest-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: BASE_SCHEMA,
  },
  steward: {
    worktree: "/worktrees/demo-tasks/alpha",
    branch: "factory-task/demo/alpha",
    integration_head: "abc1234def5678",
    conflicts: "conflict.txt",
    gate_commands: "- test: bun test",
    gate_log_path: "none",
    base_gates: "base abc1234def: green",
    outcome_path: "/worktrees/demo-tasks/alpha/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: BASE_SCHEMA,
  },
  intent: {
    iteration: "3",
    intent_path: "/goal/intent.md",
    steer: "- s1 (mailbox/inbox/s1.md):\n  keep the API stable",
    outcome_path: "/goal/records/00009-i3-s1-intent-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: BASE_SCHEMA,
  },
  "plan-checker": {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plans: "- goal: /goal/plan.md\n  - epic `auth`: /goal/epics/auth.md",
    checkout: "/worktrees/demo",
    tasks_dir: "/goal/tasks",
    existing_tasks: "- alpha | merged | abcdef1234 | deps: none | frozen",
    open_concerns:
      "- c-1a2b3c4d5e [risk/architect]: the retry window drops head names — alpha implement r1",
    gate_record_path: "/goal/records/00007-i3-alpha-checks-r1/end.yaml",
    outcome_path: "/goal/records/00045-i3-plan-check-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: CHECKER_SCHEMA,
    task_types: TEST_TASK_TYPES_VAR,
  },
  "pack-preparer": {
    iteration: "3",
    context_data_path: "/goal/iterations/3/context-data.json",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    checkout: "/worktrees/demo",
    outcome_path: "/goal/records/00046-i3-packprep-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: packPreparerOutcomeSchemaVar(),
  },
  "review-architect": {
    iteration: "3",
    intent_path: "/goal/intent.md",
    plan_path: "/goal/plan.md",
    pack_path: "/goal/iterations/3/context-pack.md",
    worktree: "/worktrees/demo",
    outcome_path: "/goal/records/00046-i3-planreview-r1/outcome.yaml",
    validate_cmd: "bun /factory/bin/factory.ts validate",
    outcome_schema: PLAN_REVIEW_SCHEMA,
    task_types: TEST_TASK_TYPES_VAR,
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
    outcome_schema: PLAN_RETURN_SCHEMA,
  },
};

function library() {
  return loadPromptLibrary({ builtinDir: path.join(packageRoot, "prompts") });
}

const SINGLE_DEFINITION_WORDS = 8;

/** A repeated rule hides in a clause of two differently worded sentences. */
const CLAUSE_BOUNDARY = /[;:—–()]| - /;

function promptLines(text: string): string[] {
  const stripped = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .replace(/\{%[\s\S]*?%\}/g, " ");
  return stripped
    .split("\n")
    .map((line) =>
      line.replace(/^\s*(#{1,6}\s+|\d+[.)]\s+|[-*]\s+)/, "").trim(),
    )
    .filter(Boolean);
}

function longEnough(part: string): boolean {
  return part.split(/\s+/).length >= SINGLE_DEFINITION_WORDS;
}

function normalizePart(part: string): string {
  return part
    .replace(/[`*["\]]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.;:,—–-]+|[\s.;:,—–-]+$/g, "")
    .toLowerCase();
}

function promptSentences(text: string): string[] {
  const sentences: string[] = [];
  for (const line of promptLines(text)) {
    for (const part of line.split(/(?<=[.!?])\s+/)) {
      const sentence = normalizePart(part);
      if (sentence && longEnough(sentence)) sentences.push(sentence);
    }
  }
  return sentences;
}

function promptClauses(text: string): string[] {
  const clauses: string[] = [];
  for (const line of promptLines(text)) {
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      for (const part of sentence.split(CLAUSE_BOUNDARY)) {
        const clause = normalizePart(part);
        if (clause && longEnough(clause)) clauses.push(clause);
      }
    }
  }
  return clauses;
}

/** Sentences and the clauses inside them; a rule must define any of them once. */
function promptUnits(text: string): string[] {
  return [...new Set([...promptSentences(text), ...promptClauses(text)])];
}

function internalRepeats(
  rendered: Map<string, string>,
  allowed: Record<string, string[]>,
): { unit: string; holders: string[] }[] {
  const repeats: { unit: string; holders: string[] }[] = [];
  for (const [role, text] of rendered) {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const unit of promptUnits(text)) {
      if (seen.has(unit)) dupes.add(unit);
      seen.add(unit);
    }
    for (const unit of dupes) {
      if (!(allowed[role] ?? []).includes(unit)) {
        repeats.push({ unit, holders: [role, role] });
      }
    }
  }
  return repeats;
}

function crossFragmentRepeats(
  fragments: Map<string, string>,
  allowed: Record<string, string[]> = {},
): { unit: string; holders: string[] }[] {
  const holders = new Map<string, string[]>();
  for (const [name, text] of fragments) {
    for (const unit of promptUnits(text)) {
      const list = holders.get(unit) ?? [];
      list.push(name);
      holders.set(unit, list);
    }
  }
  return [...holders]
    .filter(([, names]) => names.length > 1)
    .filter(
      ([unit, names]) =>
        !names.some((name) => (allowed[name] ?? []).includes(unit)),
    )
    .map(([unit, names]) => ({ unit, holders: names }));
}

function promptSingleDefinitionsPart1() {
  const ALLOWED_REPEATS: Record<string, string[]> = {
    qa: [
      "round 1 carries the cleanliness revision turn's summary/replies and is otherwise empty",
    ],
  };

  it("defines every 8-word sentence and clause once: no repeat inside one rendered prompt or across two fragments", () => {
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
      repeats.map(({ unit, holders }) => `${holders.join(" + ")}: ${unit}`),
      "duplicated prompt sentences or clauses (move each to the fragment that owns it, or allow-list it)",
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
      "a real rule sentence with more than eight words lives here plainly",
    ]);
  });
}

describe("prompt single definitions", () => {
  promptSingleDefinitionsPart1();
});
