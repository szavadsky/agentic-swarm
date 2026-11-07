import { runInit } from "./init.js";
import { runPreflight } from "./preflight.js";
import { runStatus } from "./status.js";
import { runSteer } from "./steer.js";
import { runFactory } from "./run.js";

function printUsage(): void {
  console.log(`
software-factory v2 CLI

Commands:
  factory init [--repo <path>]
      Initialize .factory/project.yaml from template (committed).

  factory run <task|path/INTENT.md> [--repo <path>] [--max-iterations <N>]
      Run or resume a factory task through the derive-act-commit loop.

  factory status <task> [--repo <path>]
      Display compact task status, items, waves, and open operator questions.

  factory steer <task> "<text>" [--repo <path>]
      Send an operator directive or answer to the root task steer mailbox.

  factory preflight <task> [--repo <path>]
      Run preflight readiness checks for a task.

Options:
  --repo <path>            Path to repository root (defaults to current working directory)
  --max-iterations <N>     Maximum engine iterations / ticks
  --help, -h               Show this help message
  --version, -v            Show version
`);
}

export interface ParsedArgs {
  command?: string;
  taskOrIntent?: string;
  steerText?: string;
  repo: string;
  maxIterations?: number;
  help: boolean;
  version: boolean;
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
    } else if (arg === "--repo") {
      i++;
      const next = args[i];
      if (next) result.repo = next;
    } else if (arg.startsWith("--repo=")) {
      result.repo = arg.slice("--repo=".length);
    } else if (arg === "--max-iterations") {
      i++;
      const next = args[i];
      if (next) result.maxIterations = parseInt(next, 10);
    } else if (arg.startsWith("--max-iterations=")) {
      result.maxIterations = parseInt(arg.slice("--max-iterations=".length), 10);
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  const cmd = positional[0];
  if (cmd !== undefined) {
    result.command = cmd;
  }
  const taskArg = positional[1];
  if (taskArg !== undefined) {
    result.taskOrIntent = taskArg;
  }
  const textArg = positional[2];
  if (textArg !== undefined) {
    result.steerText = textArg;
  }

  return result;
}

/**
 * Main dispatch entrypoint for software-factory CLI.
 */
export async function dispatch(args: string[]): Promise<number> {
  const parsed = parseCliArgs(args);

  if (parsed.help || (!parsed.command && !parsed.version)) {
    printUsage();
    return 0;
  }

  if (parsed.version) {
    console.log("software-factory v2.0.0");
    return 0;
  }

  switch (parsed.command) {
    case "init":
      return await runInit({ repoRoot: parsed.repo });

    case "preflight": {
      const task = parsed.taskOrIntent;
      if (!task) {
        console.error("Error: Missing required argument <task>");
        printUsage();
        return 1;
      }
      const preflightRes = await runPreflight({
        repoRoot: parsed.repo,
        task,
      });
      return preflightRes.ok ? 0 : 1;
    }

    case "status": {
      const task = parsed.taskOrIntent;
      if (!task) {
        console.error("Error: Missing required argument <task>");
        printUsage();
        return 1;
      }
      return await runStatus({
        repoRoot: parsed.repo,
        task,
      });
    }

    case "steer": {
      const task = parsed.taskOrIntent;
      if (!task) {
        console.error("Error: Missing required argument <task>");
        printUsage();
        return 1;
      }
      const steerText = parsed.steerText;
      if (!steerText) {
        console.error('Error: Missing steering text. Usage: factory steer <task> "<text>"');
        return 1;
      }
      return await runSteer({
        repoRoot: parsed.repo,
        task,
        text: steerText,
      });
    }

    case "run": {
      const taskOrIntent = parsed.taskOrIntent;
      if (!taskOrIntent) {
        console.error("Error: Missing required argument <task|path/INTENT.md>");
        printUsage();
        return 1;
      }
      return await runFactory({
        repoRoot: parsed.repo,
        taskOrIntent,
        maxIterations: parsed.maxIterations,
      });
    }
    default:
      console.error(`Error: Unknown command "${parsed.command}"`);
      printUsage();
      return 1;
  }
}
