/** The command table and the process exit codes each command returns. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfigs, resolveGoalPaths } from "../../kernel/config.js";
import { formatCause } from "../../kernel/cause.js";
import {
  loadCanaryProven,
  runCanary,
  type CanaryVerdict,
} from "../../kernel/canary.js";
import { runGoal } from "../../kernel/launch.js";
import type { LaunchResult } from "../../kernel/launch.js";
import { writePromptVariables } from "../../kernel/prompt-vars.js";
import { writeKernelSchemas } from "../../kernel/schemas.js";
import { benchmarkGoal, formatBenchmark } from "../benchmark.js";
import {
  initGoal,
  readSteerSource,
  statusGoal,
  steerGoal,
  validateFile,
} from "../commands.js";
import {
  createRealHarnesses,
  createRealModelCatalog,
  resolveHarnessBinaries,
} from "../harnesses.js";
import type { CliDeps, CommandHandler, ParsedArgs } from "./types.js";
import { parseCliArgs } from "./args.js";
import { ROOT_USAGE, usageFor } from "./usage.js";

function exitCode(result: LaunchResult): number {
  if (result.stop === "interrupted")
    return result.interruptedBy === "SIGTERM" ? 143 : 130;
  if (result.stop === "done") return 0;
  if (result.stop === "blocked") return 2;
  if (result.stop === "infra") return 1;
  return 3;
}

function printStatus(out: Awaited<ReturnType<typeof statusGoal>>): void {
  console.log(
    `goal ${out.goal}: ${out.state.goal} (iteration ${out.state.iteration})`,
  );
  for (const slug of Object.keys(out.state.tasks).sort()) {
    const task = out.state.tasks[slug]!;
    const commit = task.commit ? ` (commit ${task.commit.slice(0, 8)})` : "";
    const cause = task.cause ? ` — ${formatCause(task.cause)}` : "";
    console.log(`  ${slug}: ${task.status}${commit}${cause}`);
  }
  console.log(`last summary: ${out.lastSummary ?? "none"}`);
}

async function runCommand(parsed: ParsedArgs, deps: CliDeps): Promise<number> {
  if (!parsed.goal) throw new Error("run requires --goal <name>");
  const injected =
    deps.harnesses !== undefined || deps.harnessFactory !== undefined;
  // The binary and model checks are harness-aware; the run config names the
  // harness ids, so it is loaded here as well as in the launch.
  const needBinaries = deps.binaries === undefined && !injected;
  const needCatalog = deps.modelCatalog === undefined && !injected;
  const runSettings =
    needBinaries || needCatalog
      ? loadConfigs(path.resolve(parsed.repo), {
          runConfigPath: parsed.runConfig,
        }).run
      : undefined;
  const binaries =
    deps.binaries ??
    (needBinaries ? resolveHarnessBinaries(runSettings?.harnesses) : undefined);
  const result = await runGoal({
    repo: parsed.repo,
    goal: parsed.goal,
    iterations: parsed.iterations,
    runConfigPath: parsed.runConfig,
    pinGateOverride: parsed.pinGateOverride,
    harnesses: deps.harnesses,
    harnessFactory:
      deps.harnessFactory ?? (injected ? undefined : createRealHarnesses),
    modelCatalog:
      deps.modelCatalog ??
      (needCatalog
        ? createRealModelCatalog(binaries, runSettings?.envAllowlist)
        : undefined),
    binaries,
    signals: deps.signals,
    priceSource: deps.priceSource,
  });
  console.log(
    [
      `goal ${result.goal}: ${result.state.goal}, ${result.iterations} iteration(s), stop=${result.stop}`,
      result.cause ? `cause: ${result.cause}` : undefined,
      `summary: ${result.lastSummary ? `${result.lastSummary}` : "none"}`,
      result.recoveredRecords > 0
        ? `recovered: ${result.recoveredRecords} interrupted record(s)`
        : undefined,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return exitCode(result);
}

/** `init`: create the goal directory, repo config and intent file. */
async function initCommand(parsed: ParsedArgs): Promise<number> {
  if (!parsed.goal) throw new Error("init requires --goal <name>");
  const result = await initGoal({
    repo: parsed.repo,
    goal: parsed.goal,
    intent: parsed.intent,
  });
  console.log(`goal: ${result.goalDir}`);
  console.log(
    `repo config: ${result.repoConfig} (${result.repoConfigCreated ? "created" : "existing"})`,
  );
  console.log(
    `intent: ${result.intentPath} (${result.intentCreated ? "created" : "existing"})`,
  );
  return 0;
}

/** `status`: print the goal's status, as JSON when asked. */
async function statusCommand(
  parsed: ParsedArgs,
  deps: CliDeps,
): Promise<number> {
  if (!parsed.goal) throw new Error("status requires --goal <name>");
  const status = await statusGoal(parsed.repo, parsed.goal, {
    json: parsed.json,
    priceSource: deps.priceSource,
  });
  if (status.statusJson !== undefined) console.log(status.statusJson);
  else printStatus(status);
  return 0;
}

async function benchmarkCommand(parsed: ParsedArgs): Promise<number> {
  if (!parsed.goal) throw new Error("benchmark requires --goal <name>");
  console.log(formatBenchmark(await benchmarkGoal(parsed.repo, parsed.goal)));
  return 0;
}

/** The fake-harness canary turn: a minimal trivial/task/bigger turn on the target. */
function fakeCanaryTurn(deps: CliDeps, harnessId: string) {
  return async (opts: {
    harnessId: string;
    modelId: string;
    effort?: string;
    kind: "trivial" | "task" | "bigger";
    cwd: string;
  }): Promise<CanaryVerdict> => {
    const harness = deps.harnesses?.[harnessId];
    if (!harness) throw new Error(`harness "${harnessId}" is not registered`);
    const result = await harness.turn({
      model: { id: opts.modelId, effort: opts.effort },
      cwd: opts.cwd,
      prompt: `canary ${opts.kind}`,
      timeouts: { idleMs: 60_000, wallMs: 300_000 },
    });
    if (result.stop.kind !== "done")
      return { pass: false, reason: `turn stopped with ${result.stop.kind}` };
    return { pass: true };
  };
}

/**
 * `canary`: run the canary turns for one harness/model combination and record
 * a pass where rotation reads it. The combination is named as
 * `<harness/model>` or through `--alias`; architect legs add `--bigger`.
 * The turns run in an isolated temp directory, never in a goal checkout, so
 * the canary never merges into the goal branch.
 */
/** The combination a `canary` command names: an alias or `<harness/model>`. */
function canaryCombination(parsed: ParsedArgs): {
  harnessId: string;
  modelId: string;
  effort?: string;
} {
  const aliasName =
    parsed.alias ??
    (parsed.file && parsed.file.includes("/") ? undefined : parsed.file);
  const configs = loadConfigs(path.resolve(parsed.repo), {
    runConfigPath: parsed.runConfig,
  });
  if (aliasName) {
    const alias = configs.run.aliases[aliasName];
    if (!alias)
      throw new Error(
        `alias "${aliasName}" not found in run config "${parsed.runConfig ?? ".factory/run.yaml"}"`,
      );
    return {
      harnessId: alias.harness,
      modelId: alias.model,
      effort: alias.effort,
    };
  }
  if (parsed.file && parsed.file.includes("/")) {
    const [harnessId, modelId] = parsed.file.split("/");
    if (!harnessId || !modelId)
      throw new Error("canary requires a <harness/model> combination");
    return { harnessId, modelId };
  }
  throw new Error(
    "canary requires a <harness/model> combination or --alias <name>",
  );
}

async function canaryCommand(
  parsed: ParsedArgs,
  deps: CliDeps,
): Promise<number> {
  const repoRoot = path.resolve(parsed.repo);
  const configs = loadConfigs(repoRoot, { runConfigPath: parsed.runConfig });
  const paths = resolveGoalPaths(configs, repoRoot, parsed.goal ?? "canary");
  const { harnessId, modelId, effort } = canaryCombination(parsed);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "factory-canary-"));
  try {
    const proven = await loadCanaryProven(paths);
    const verdict = await runCanary(
      {
        harnessId,
        modelId,
        effort,
        bigger: parsed.file?.includes("bigger") ?? false,
        cwd,
      },
      fakeCanaryTurn(deps, harnessId),
      proven,
      paths,
    );
    if (!verdict.pass) {
      console.error(`canary ${harnessId}/${modelId}: fail`);
      return 1;
    }
    console.log(`canary ${harnessId}/${modelId}: pass`);
    return 0;
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

async function steerCommand(parsed: ParsedArgs): Promise<number> {
  if (!parsed.goal) throw new Error("steer requires --goal <name>");
  if (!parsed.file)
    throw new Error("steer requires a file path or - for stdin");
  const path = await steerGoal(
    parsed.repo,
    parsed.goal,
    await readSteerSource(parsed.file),
  );
  console.log(`steer: ${path}`);
  return 0;
}

async function validateCommand(parsed: ParsedArgs): Promise<number> {
  if (!parsed.file) throw new Error("validate requires a file path");
  const result = await validateFile(parsed.file, {
    step: parsed.step,
    repo: parsed.repo,
  });
  for (const finding of result.findings) console.error(finding);
  if (result.findings.length > 0) return 1;
  if (result.stepIndependent)
    console.log(
      `${parsed.file}: no --step and no started.yaml: step-independent checks only`,
    );
  console.log(`${parsed.file}: valid`);
  return 0;
}

function variablesCommand(parsed: ParsedArgs): number {
  if (!parsed.out) throw new Error("variables requires --out <file>");
  const written = writePromptVariables(parsed.out);
  console.log(`variables: ${written}`);
  return 0;
}

function schemasCommand(parsed: ParsedArgs): number {
  if (!parsed.out) throw new Error("schemas requires --out <dir>");
  const written = writeKernelSchemas(parsed.out);
  for (const file of written) console.log(file);
  console.log(
    `schemas: ${written.length} kernel schema(s) written to ${path.resolve(parsed.out)}`,
  );
  return 0;
}

const COMMANDS: Record<string, CommandHandler> = {
  run: runCommand,
  init: initCommand,
  status: statusCommand,
  canary: canaryCommand,
  benchmark: benchmarkCommand,
  steer: steerCommand,
  validate: validateCommand,
  variables: variablesCommand,
  schemas: schemasCommand,
};

/** Main dispatch entrypoint; each command maps to one kernel or mailbox call. */
export async function dispatch(
  args: string[],
  deps: CliDeps = {},
): Promise<number> {
  let parsed: ParsedArgs;
  try {
    parsed = parseCliArgs(args);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    return 1;
  }

  if (parsed.help) {
    const known = [
      "init",
      "run",
      "canary",
      "status",
      "benchmark",
      "steer",
      "validate",
      "schemas",
      "variables",
    ];
    if (!parsed.command || known.includes(parsed.command)) {
      console.log(usageFor(parsed.command));
      return 0;
    }
  }
  if (parsed.version) {
    console.log("software-factory 0.1.0");
    return 0;
  }
  if (!parsed.command) {
    console.log(ROOT_USAGE);
    return 0;
  }

  try {
    const handler = COMMANDS[parsed.command];
    if (handler) return await handler(parsed, deps);
    console.error(`Error: unknown command "${parsed.command}"`);
    console.log(ROOT_USAGE);
    return 1;
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    return 1;
  }
}
