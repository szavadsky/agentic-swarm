/** Renders every prompt a loaded config can run, without launching a turn. */

import fs from "node:fs";
import path from "node:path";
import { outcomeExampleVar } from "./outcome-example.js";
import {
  expectationForStep,
  KERNEL_TURN_STEPS,
  type OutcomeExpectation,
} from "./outcome.js";
import { qaOutcomeSchema } from "./qa.js";
import { loadPrompts } from "./prompts.js";
import { sagaReminderVar } from "./saga-reminder.js";
import { outcomeSchema } from "./types.js";
import type { ConfigBundle } from "./types.js";

export interface PromptRender {
  /** Prompt template name the kernel renders. */
  name: string;
  text: string;
}

/** Adds a step's prompt, repair ask and unfinished-turn ask; script-only steps name none. */
function addPrompt(
  names: Set<string>,
  prompt: string | undefined,
  repairPrompt: string | undefined,
  unfinishedPrompt?: string,
): void {
  if (prompt !== undefined) names.add(prompt);
  if (repairPrompt !== undefined) names.add(repairPrompt);
  if (unfinishedPrompt !== undefined) names.add(unfinishedPrompt);
}

/**
 * Every prompt the config can render: flows, boundary turns, the architecture
 * flow, the hierarchy consult, the process repair default, and the two blocks
 * the steered hierarchy renders directly.
 */
export function promptNamesForConfig(configs: ConfigBundle): string[] {
  const { process } = configs;
  const names = new Set<string>();
  for (const flow of Object.values(process.flows)) {
    for (const step of flow.steps) {
      addPrompt(names, step.prompt, step.repairPrompt, step.unfinishedPrompt);
    }
  }
  for (const turn of Object.values(process.boundary)) {
    addPrompt(names, turn.prompt, turn.repairPrompt, turn.unfinishedPrompt);
  }
  addPrompt(
    names,
    process.architecture.planReview.prompt,
    process.architecture.planReview.repairPrompt,
    process.architecture.planReview.unfinishedPrompt,
  );
  addPrompt(
    names,
    process.architecture.planReturn?.prompt,
    process.architecture.planReturn?.repairPrompt,
    process.architecture.planReturn?.unfinishedPrompt,
  );
  addPrompt(
    names,
    process.hierarchy?.subarchitect.prompt,
    process.hierarchy?.subarchitect.repairPrompt,
    process.hierarchy?.subarchitect.unfinishedPrompt,
  );
  names.add(process.repairPrompt ?? "delivery-repair");
  // The flow renders the rescue ask directly, not through a step's config key.
  names.add("rescue-turn");
  names.add("architect-subarchitects");
  names.add("subarchitect-agent");
  return [...names].sort();
}

/** A step or turn's three prompt names: first ask, repair ask, unfinished ask. */
interface PromptOwner {
  prompt?: string;
  repairPrompt?: string;
  unfinishedPrompt?: string;
}

/** Whether this owner's first, repair or unfinished ask is the named render. */
function ownsPrompt(owner: PromptOwner, name: string): boolean {
  return [owner.prompt, owner.repairPrompt, owner.unfinishedPrompt].includes(
    name,
  );
}

/**
 * The role prompt and expectation a render's filled outcome must show. A step's
 * repair and unfinished asks show the same example as its first ask; the
 * shared process repair default has no step, so it keeps the `any` contract.
 */
interface PromptOutcome {
  /** The step's role prompt; repair and unfinished asks reuse its example. */
  prompt: string;
  expectation: OutcomeExpectation;
}

/** The owner's example prompt and expectation for a render name, if any. */
function promptOutcome(
  configs: ConfigBundle,
  name: string,
): PromptOutcome | undefined {
  const { process } = configs;
  for (const flow of Object.values(process.flows)) {
    for (const step of flow.steps) {
      if (!ownsPrompt(step, name)) continue;
      return {
        prompt: step.prompt ?? name,
        expectation: expectationForStep(step.id, process.flows),
      };
    }
  }
  for (const [id, turn] of Object.entries(process.boundary)) {
    if (ownsPrompt(turn, name) && Object.hasOwn(KERNEL_TURN_STEPS, id)) {
      return {
        prompt: turn.prompt,
        expectation: KERNEL_TURN_STEPS[id as keyof typeof KERNEL_TURN_STEPS],
      };
    }
  }
  const architecture = [
    ["planreview", process.architecture.planReview],
    ["planreturn", process.architecture.planReturn],
    ["subarchitect", process.hierarchy?.subarchitect],
  ] as const;
  for (const [step, owner] of architecture) {
    if (owner && ownsPrompt(owner, name)) {
      return { prompt: owner.prompt, expectation: KERNEL_TURN_STEPS[step] };
    }
  }
  return undefined;
}

function goalVars(goal: string): Record<string, string> {
  return {
    turn: "boundary",
    iteration: "1",
    intent_path: path.join(goal, "intent.md"),
    plan_path: path.join(goal, "plan.md"),
    checkout: path.join(goal, "checkout"),
    pack_path: path.join(goal, "pack.md"),
    digest_path: "",
    steers: "none",
    outcome_path: path.join(goal, "outcome.yaml"),
  };
}

/**
 * The `subagents` sample for the architect alias's harness: an acpx-bound
 * harness advertises no subagent surface, so it renders the generic launch
 * text; the native adapter carries its own named subagents, so the sample
 * renders the steering variant it can reach. A config without the alias is
 * the harness-agnostic default `none`. The samples cannot probe a binary, so
 * they never claim `spawn`.
 */
function sampledSubagents(configs: ConfigBundle): string {
  const alias = configs.run.aliases[configs.process.boundary.architect.alias];
  if (!alias) return "none";
  return configs.run.harnesses?.[alias.harness]?.acpx ? "none" : "steer";
}

function taskVars(
  configs: ConfigBundle,
  goal: string,
  worktree: string,
): Record<string, string> {
  return {
    role: "implementer",
    deliverable: "outcome",
    findings: "1. sample finding from the previous acceptance round",
    done_allowed: "true",
    task_path: path.join(goal, "tasks", "dry-run.md"),
    front_pack: "",
    worktree,
    resume_note: "",
    setup_command: configs.repo.setup.join(" && ") || "none",
    gate_commands:
      configs.repo.gates
        .map((gate) => `- ${gate.id}: ${gate.command}`)
        .join("\n") || "none",
    report_path: "",
    last_call: "false",
    base_hash: "0000000",
    head_hash: "1111111",
    round: "1",
    max_rounds: "3",
    prior_findings: "",
    upscope_ask: "",
  };
}

function recordVars(
  configs: ConfigBundle,
  goal: string,
): Record<string, string> {
  return {
    finding_count: "1",
    technical_findings: "1. sample technical finding",
    plan_notes: "none",
    reviewers: configs.process.architecture.reviewers.join(", "),
    subarchitects:
      "- epic `dry-run` — agent `subarchitect`, name `subarchitect-1`",
    launch_id: "dry-run",
    goal_dir: goal,
    records_dir: path.join(goal, "records"),
    transcripts_dir: path.join(goal, "transcripts"),
    class_types: "`trivial` for trivial, `development` for task",
    tasks_dir: path.join(goal, "tasks"),
    class_path: path.join(goal, "class.yaml"),
    plans: `- goal: ${path.join(goal, "plan.md")}`,
    existing_tasks: "none",
    gate_record_path: path.join(goal, "records", "dry-run-checks"),
    repair: "",
    concerns: "none",
    holds_dir: path.join(goal, "mailbox", "holds"),
    stalls: "none",
    plan_checks: "none",
    branch: "factory-task/dry-run",
    integration_head: "1111111",
    conflicts: "none",
    epic: "dry-run-epic",
    parent_plan_path: path.join(goal, "plan.md"),
    steer: "none",
    context_data_path: path.join(goal, "status.json"),
  };
}

/**
 * The dry-run's task count: past the package default `sagaTaskCount`, so the
 * sample architect render exercises the reminder.
 */
const SAGA_SAMPLE_TASKS = 24;

function sampleVars(
  configs: ConfigBundle,
  repoRoot: string,
): Record<string, string> {
  const artifacts = path.resolve(repoRoot, configs.repo.artifactRoot);
  const goal = path.join(artifacts, "dry-run");
  const worktree = path.join(repoRoot, ".factory", "worktrees", "dry-run");
  return {
    ...goalVars(goal),
    ...taskVars(configs, goal, worktree),
    ...recordVars(configs, goal),
    depth: String(configs.process.hierarchy?.depth ?? 1),
    subagents: sampledSubagents(configs),
    saga_reminder: sagaReminderVar(
      SAGA_SAMPLE_TASKS,
      configs.process.sagaTaskCount,
    ),
  };
}

/**
 * The architect turn's launch block, when the sample is a depth-2 steering
 * harness. An empty block is the depth-1 sample and every harness that cannot
 * steer: the script runs their epic consults as separate turns.
 */
function subarchitectBlock(
  library: ReturnType<typeof loadPrompts>,
  vars: Record<string, string>,
): string {
  if (vars.depth !== "2" || vars.subagents !== "steer") return "";
  const block = library.render("architect-subarchitects", {
    subarchitects: vars.subarchitects ?? "",
    subagents: "steer",
  });
  return `${block}\n`;
}

/** Renders every configured prompt with representative turn values. */
export function dryRunPrompts(
  configs: ConfigBundle,
  repoRoot: string,
): PromptRender[] {
  const library = loadPrompts(configs.process, repoRoot, {
    aliases: configs.run.aliases,
    run: configs.run,
  });
  const vars = sampleVars(configs, repoRoot);
  const block = subarchitectBlock(library, vars);
  return promptNamesForConfig(configs).map((name) => {
    const promptVars: Record<string, string> = { ...vars };
    for (const placeholder of library.placeholders(name)) {
      if (!(placeholder in promptVars) && !(placeholder in library.defaults)) {
        promptVars[placeholder] = `dry-run ${placeholder}`;
      }
    }
    if (name === "architect") promptVars.subarchitect_block = block;
    if (name === "architect-repair") {
      promptVars.role = "architect";
      promptVars.deliverable = "plan edit or stop decision";
    }
    const outcome = promptOutcome(configs, name);
    const expectation = outcome?.expectation ?? "any";
    promptVars.outcome_schema = outcomeExampleVar(
      outcome?.prompt ?? name,
      expectation,
      expectation === "qa" ? qaOutcomeSchema : outcomeSchema,
    );
    return {
      name,
      text: library.render(name, promptVars),
    };
  });
}

/** Writes one `<name>.md` per render under `outDir`; returns the file paths. */
export function writePromptRenders(
  renders: readonly PromptRender[],
  outDir: string,
): string[] {
  const root = path.resolve(outDir);
  const written: string[] = [];
  for (const render of renders) {
    const file = path.resolve(root, `${render.name}.md`);
    if (!file.startsWith(`${root}${path.sep}`)) {
      throw new Error(`prompt "${render.name}" would write outside ${root}`);
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, render.text);
    written.push(file);
  }
  return written;
}
