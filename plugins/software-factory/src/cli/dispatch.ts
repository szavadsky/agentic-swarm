import { runGoal } from "../kernel/launch.js";
import type { Harness } from "../harness/types.js";

export interface ParsedArgs {
  command?: string;
  repo: string;
  goal?: string;
  iterations?: number;
  runConfig?: string;
  help: boolean;
  version: boolean;
}

export interface CliDeps {
  /** Harness instances by run-config id; S1 adds the real registries. */
  harnesses?: Record<string, Harness>;
}

const ROOT_USAGE = `
software-factory

Commands:
  run                      Run bounded iterations of one goal

Run:
  run --repo <path> --goal <name> [--iterations N] [--run-config <path>]
                           Pre-flight, then one architect consult + task
                           dispatch per iteration until the goal is done,
                           blocked, or the iteration limit is reached.

Options:
  --repo <path>            Repository root (defaults to the current directory)
  --goal <name>            Goal directory name under the repo's artifact root
  --iterations <n>         Launch iteration limit (overrides run config)
  --run-config <path>      Run config path (defaults to .factory/run.yaml)
  --help, -h               Show this help message
  --version, -v            Show version
`;

const RUN_USAGE = `
factory run --repo <path> --goal <name> [--iterations N] [--run-config <path>]

Loads the three config layers, takes the goal lock, prepares the stable goal
checkout on the integration branch, then alternates one architect boundary
(plan + PM task files) with dispatch of ready tasks until the goal reports
done/blocked or the iteration limit is reached. State is derived from
<artifactRoot>/<goal>/{tasks,records}; there is no state file.

Exit status is 0 for done/in-progress and 1 for blocked or a launch error.

Options:
  --repo <path>            Repository root (defaults to the current directory)
  --goal <name>            Goal directory name under the repo's artifact root
  --iterations <n>         Launch iteration limit (overrides run config)
  --run-config <path>      Run config path (defaults to .factory/run.yaml)
  --help, -h               Show this help message
`;

function parseNonNegativeInt(flag: string, value: string | undefined): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${flag} requires a positive integer, got "${value ?? ""}"`);
  }
  return n;
}

export function parseCliArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = { repo: process.cwd(), help: false, version: false };
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.version = true;
    } else if (arg === "--repo" || arg.startsWith("--repo=")) {
      const value = arg.startsWith("--repo=") ? arg.slice("--repo=".length) : args[++i];
      if (value === undefined) throw new Error("--repo requires a path");
      result.repo = value;
    } else if (arg === "--goal" || arg.startsWith("--goal=")) {
      const value = arg.startsWith("--goal=") ? arg.slice("--goal=".length) : args[++i];
      if (value === undefined) throw new Error("--goal requires a name");
      result.goal = value;
    } else if (arg === "--iterations" || arg.startsWith("--iterations=")) {
      const value = arg.startsWith("--iterations=") ? arg.slice("--iterations=".length) : args[++i];
      result.iterations = parseNonNegativeInt("--iterations", value);
    } else if (arg === "--run-config" || arg.startsWith("--run-config=")) {
      const value = arg.startsWith("--run-config=") ? arg.slice("--run-config=".length) : args[++i];
      if (value === undefined) throw new Error("--run-config requires a path");
      result.runConfig = value;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }
  result.command = positional[0];
  return result;
}

/** Main dispatch entrypoint; `run` is wired to the kernel launch loop. */
export async function dispatch(args: string[], deps: CliDeps = {}): Promise<number> {
  let parsed: ParsedArgs;
  try {
    parsed = parseCliArgs(args);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    return 1;
  }

  if (parsed.help && (!parsed.command || parsed.command === "run")) {
    console.log(parsed.command === "run" ? RUN_USAGE : ROOT_USAGE);
    return 0;
  }
  if (parsed.version) {
    console.log("software-factory 0.1.0");
    return 0;
  }
  if (!parsed.command) {
    console.log(ROOT_USAGE);
    return 0;
  }
  if (parsed.command !== "run") {
    console.error(`Error: unknown command "${parsed.command}"`);
    console.log(ROOT_USAGE);
    return 1;
  }
  if (!parsed.goal) {
    console.error("Error: run requires --goal <name>");
    console.log(RUN_USAGE);
    return 1;
  }

  try {
    const result = await runGoal({
      repo: parsed.repo,
      goal: parsed.goal,
      iterations: parsed.iterations,
      runConfigPath: parsed.runConfig,
      harnesses: deps.harnesses,
    });
    console.log(
      `goal ${result.goal}: ${result.state.goal}, ${result.iterations} iteration(s), ${result.lastSummary ?? "no summary"}`
    );
    return result.state.goal === "blocked" ? 1 : 0;
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    return 1;
  }
}
