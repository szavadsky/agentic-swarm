// biome-ignore-all lint/complexity: split-rest
import path from "node:path";
import type { Harness } from "../harness/types.js";
import { loadConfigs } from "../kernel/config.js";
import {
  type HarnessFactory,
  type LaunchResult,
  runGoal,
} from "../kernel/launch.js";
import type { ModelCatalog } from "../kernel/preflight.js";
import type { PriceSource } from "../kernel/openrouter.js";
import { writeKernelSchemas } from "../kernel/schemas.js";
import type { DrainController } from "../kernel/signals.js";
import { benchmarkGoal, formatBenchmark } from "./benchmark.js";
import {
  initGoal,
  readSteerSource,
  statusGoal,
  steerGoal,
  validateFile,
} from "./commands.js";
import {
  createRealHarnesses,
  createRealModelCatalog,
  resolveHarnessBinaries,
} from "./harnesses.js";

export interface ParsedArgs {
  command?: string;
  repo: string;
  goal?: string;
  iterations?: number;
  runConfig?: string;
  intent?: string;
  file?: string;
  step?: string;
  /** Output directory for `factory schemas`. */
  out?: string;
  help: boolean;
  version: boolean;
}

export interface CliDeps {
  /** Ready harnesses (fake harness in tests); disables the real CLI checks. */
  harnesses?: Record<string, Harness>;
  harnessFactory?: HarnessFactory;
  modelCatalog?: ModelCatalog;
  binaries?: Record<string, string | undefined>;
  signals?: DrainController;
  /** Price cache and fetcher; undefined means the shared cache plus network. */
  priceSource?: PriceSource;
}

const ROOT_USAGE = `
software-factory

Commands:
  init                     Create the repo config, goal directory and intent
  run                      Run bounded iterations of one goal
  status                   Show derived state, parked causes and the last summary
  benchmark                Print the benchmark rows for one goal's artifacts
  steer                    Drop a steering file into the goal inbox
  validate                 Validate one schema-enforced file with the gate's validators
  schemas                  Write every kernel schema as JSON Schema

Options:
  --repo <path>            Repository root (defaults to the current directory)
  --goal <name>            Goal directory name under the repo's artifact root
  --out <dir>              Output directory for \`schemas\`
  --help, -h               Show this help message
  --version, -v            Show version
`;

const INIT_USAGE = `
factory init --repo <path> --goal <name> [--intent <file>]

Writes .factory/repo.yaml when it is missing, creates the goal directory and
copies --intent into <goal>/intent.md. Without --intent a short template is
written. An existing intent is never overwritten.
`;

const RUN_USAGE = `
factory run --repo <path> --goal <name> [--iterations N] [--run-config <path>]

Loads the three config layers, runs pre-flight (models, effort, fallbacks,
binaries, roots, base gates), takes the goal lock, recovers interrupted records
and stale worktrees, then alternates one architect boundary with task dispatch.
State is derived from <artifactRoot>/<goal>/{tasks,records}; there is no state
file. Exit: 0 done, 1 failure, 2 blocked, 3 iteration limit, 130/143 signal.
`;

const STATUS_USAGE = `
factory status --repo <path> --goal <name>

Prints the state derived from task files and records, every parked cause, and
the path of the last iteration summary.
`;

const BENCHMARK_USAGE = `
factory benchmark --repo <path> --goal <name>

Prints the rows and units of bootstrap/context/benchmark.md section 1 for the
goal's artifacts: launches, architect launches, tokens in/out, cost, architect
share, cost per merged, loop incidents, human interventions, wall and
merged/parked. Reads <artifactRoot>/<goal>/metrics.yaml and its records.
`;

const STEER_USAGE = `
factory steer --repo <path> --goal <name> <file | ->

Atomically drops the file (or stdin) into mailbox/inbox. The architect reads it
at the next iteration boundary and answers in mailbox/outbox. A leading
\`urgent: true\` frontmatter block ends the current iteration early instead.
`;

const VALIDATE_USAGE = `
factory validate [--step <id>] <file>

Validates one schema-enforced file with the same validators as the
schema-validation gate: tasks/*.md (with its directory's dependency graph and
flow existence against the merged process config), class.yaml, outcome.yaml,
mailbox/holds/*.yaml, repo.yaml, run.yaml and process.yaml. --step names the
flow step an outcome is given for and overrides the step in the sibling
started.yaml; a standalone outcome without either gets step-independent checks
only. Exit: 0 valid, 1 invalid or unknown kind.
`;

const SCHEMAS_USAGE = `
factory schemas --out <dir>

Writes every kernel file schema as JSON Schema, one <name>.schema.json per
artifact: task, outcome, hold, class, repo, run and process. Creates the
directory. Editors and the artifact LSP consume these files. Exit: 0 written,
1 error.
`;

function usageFor(command: string | undefined): string {
  if (command === "init") return INIT_USAGE;
  if (command === "run") return RUN_USAGE;
  if (command === "status") return STATUS_USAGE;
  if (command === "benchmark") return BENCHMARK_USAGE;
  if (command === "steer") return STEER_USAGE;
  if (command === "validate") return VALIDATE_USAGE;
  if (command === "schemas") return SCHEMAS_USAGE;
  return ROOT_USAGE;
}

function parsePositiveInt(flag: string, value: string | undefined): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(
      `${flag} requires a positive integer, got "${value ?? ""}"`,
    );
  }
  return n;
}

function flagValue(
  arg: string,
  flag: string,
  args: string[],
  index: number,
): { value: string; next: number } {
  if (arg.startsWith(`${flag}=`))
    return { value: arg.slice(flag.length + 1), next: index };
  return { value: args[index + 1] ?? "", next: index + 1 };
}

export function parseCliArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    repo: process.cwd(),
    help: false,
    version: false,
  };
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.version = true;
    } else if (arg === "--repo" || arg.startsWith("--repo=")) {
      const parsed = flagValue(arg, "--repo", args, i);
      result.repo = parsed.value;
      i = parsed.next;
      if (!result.repo) throw new Error("--repo requires a path");
    } else if (arg === "--goal" || arg.startsWith("--goal=")) {
      const parsed = flagValue(arg, "--goal", args, i);
      result.goal = parsed.value;
      i = parsed.next;
      if (!result.goal) throw new Error("--goal requires a name");
    } else if (arg === "--iterations" || arg.startsWith("--iterations=")) {
      const parsed = flagValue(arg, "--iterations", args, i);
      result.iterations = parsePositiveInt("--iterations", parsed.value);
      i = parsed.next;
    } else if (arg === "--run-config" || arg.startsWith("--run-config=")) {
      const parsed = flagValue(arg, "--run-config", args, i);
      result.runConfig = parsed.value;
      i = parsed.next;
      if (!result.runConfig) throw new Error("--run-config requires a path");
    } else if (arg === "--intent" || arg.startsWith("--intent=")) {
      const parsed = flagValue(arg, "--intent", args, i);
      result.intent = parsed.value;
      i = parsed.next;
      if (!result.intent) throw new Error("--intent requires a file");
    } else if (arg === "--step" || arg.startsWith("--step=")) {
      const parsed = flagValue(arg, "--step", args, i);
      result.step = parsed.value;
      i = parsed.next;
      if (!result.step) throw new Error("--step requires a step id");
    } else if (arg === "--out" || arg.startsWith("--out=")) {
      const parsed = flagValue(arg, "--out", args, i);
      result.out = parsed.value;
      i = parsed.next;
      if (!result.out) throw new Error("--out requires a directory");
    } else if (arg === "-" || !arg.startsWith("-")) {
      positional.push(arg);
    }
  }
  result.command = positional[0];
  result.file = positional[1];
  return result;
}

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
    const cause = task.cause ? ` — ${task.cause}` : "";
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
      "status",
      "benchmark",
      "steer",
      "validate",
      "schemas",
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
    if (parsed.command === "run") return await runCommand(parsed, deps);
    if (parsed.command === "init") {
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
    if (parsed.command === "status") {
      if (!parsed.goal) throw new Error("status requires --goal <name>");
      printStatus(await statusGoal(parsed.repo, parsed.goal));
      return 0;
    }
    if (parsed.command === "benchmark") {
      if (!parsed.goal) throw new Error("benchmark requires --goal <name>");
      console.log(
        formatBenchmark(await benchmarkGoal(parsed.repo, parsed.goal)),
      );
      return 0;
    }
    if (parsed.command === "steer") {
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
    if (parsed.command === "validate") {
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
    if (parsed.command === "schemas") {
      if (!parsed.out) throw new Error("schemas requires --out <dir>");
      const written = writeKernelSchemas(parsed.out);
      for (const file of written) console.log(file);
      console.log(
        `schemas: ${written.length} kernel schema(s) written to ${path.resolve(parsed.out)}`,
      );
      return 0;
    }
    console.error(`Error: unknown command "${parsed.command}"`);
    console.log(ROOT_USAGE);
    return 1;
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    return 1;
  }
}
