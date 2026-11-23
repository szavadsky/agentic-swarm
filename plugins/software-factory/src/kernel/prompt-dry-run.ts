/** Renders every prompt a loaded config can run, without launching a turn. */

import fs from "node:fs";
import path from "node:path";
import { loadPrompts } from "./prompts.js";
import type { ConfigBundle } from "./types.js";

export interface PromptRender {
  /** Prompt template name the kernel renders. */
  name: string;
  text: string;
}

/** Adds a step's prompt and repair ask; script-only steps name neither. */
function addPrompt(
  names: Set<string>,
  prompt: string | undefined,
  repairPrompt: string | undefined,
): void {
  if (prompt !== undefined) names.add(prompt);
  if (repairPrompt !== undefined) names.add(repairPrompt);
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
      addPrompt(names, step.prompt, step.repairPrompt);
    }
  }
  for (const turn of Object.values(process.boundary)) {
    addPrompt(names, turn.prompt, turn.repairPrompt);
  }
  addPrompt(
    names,
    process.architecture.planReview.prompt,
    process.architecture.planReview.repairPrompt,
  );
  addPrompt(
    names,
    process.architecture.planReturn?.prompt,
    process.architecture.planReturn?.repairPrompt,
  );
  addPrompt(
    names,
    process.hierarchy?.subarchitect.prompt,
    process.hierarchy?.subarchitect.repairPrompt,
  );
  names.add(process.repairPrompt ?? "delivery-repair");
  names.add("architect-subarchitects");
  names.add("subarchitect-agent");
  return [...names].sort();
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
    class_types: "`development` for task",
    tasks_dir: path.join(goal, "tasks"),
    class_path: path.join(goal, "class.yaml"),
    plans: `- goal: ${path.join(goal, "plan.md")}`,
    existing_tasks: "none",
    gate_record_path: path.join(goal, "records", "dry-run-checks"),
    repair: "",
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
  };
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
  return promptNamesForConfig(configs).map((name) => {
    const promptVars: Record<string, string> = { ...vars };
    for (const placeholder of library.placeholders(name)) {
      if (!(placeholder in promptVars) && !(placeholder in library.defaults)) {
        promptVars[placeholder] = `dry-run ${placeholder}`;
      }
    }
    if (name === "architect-repair") {
      promptVars.role = "architect";
      promptVars.deliverable = "plan edit or stop decision";
    }
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
