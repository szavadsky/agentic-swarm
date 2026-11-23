/** Argument parsing: flags, positive integers and the parsed shape. */

import type { ParsedArgs, ValueFlag } from "./types.js";

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

const VALUE_FLAGS: readonly ValueFlag[] = [
  {
    name: "--repo",
    apply: (result, value) => {
      if (!value) throw new Error("--repo requires a path");
      result.repo = value;
    },
  },
  {
    name: "--goal",
    apply: (result, value) => {
      if (!value) throw new Error("--goal requires a name");
      result.goal = value;
    },
  },
  {
    name: "--iterations",
    apply: (result, value) => {
      result.iterations = parsePositiveInt("--iterations", value);
    },
  },
  {
    name: "--run-config",
    apply: (result, value) => {
      if (!value) throw new Error("--run-config requires a path");
      result.runConfig = value;
    },
  },
  {
    name: "--pin-gate-override",
    apply: (result, value) => {
      if (!value.trim())
        throw new Error("--pin-gate-override requires a reason");
      result.pinGateOverride = value.trim();
    },
  },
  {
    name: "--intent",
    apply: (result, value) => {
      if (!value) throw new Error("--intent requires a file");
      result.intent = value;
    },
  },
  {
    name: "--step",
    apply: (result, value) => {
      if (!value) throw new Error("--step requires a step id");
      result.step = value;
    },
  },
  {
    name: "--alias",
    apply: (result, value) => {
      if (!value) throw new Error("--alias requires an alias name");
      result.alias = value;
    },
  },
  {
    name: "--out",
    apply: (result, value) => {
      if (!value) throw new Error("--out requires a path");
      result.out = value;
    },
  },
];

/** Applies one value flag; returns the index of its consumed argument. */
function applyValueFlag(
  result: ParsedArgs,
  arg: string,
  args: string[],
  index: number,
): number {
  const flag = VALUE_FLAGS.find(
    ({ name }) => arg === name || arg.startsWith(`${name}=`),
  );
  if (!flag) return index;
  const parsed = flagValue(arg, flag.name, args, index);
  flag.apply(result, parsed.value);
  return parsed.next;
}

function applyBooleanFlag(result: ParsedArgs, arg: string): boolean {
  if (arg === "--help" || arg === "-h") {
    result.help = true;
    return true;
  }
  if (arg === "--version" || arg === "-v") {
    result.version = true;
    return true;
  }
  if (arg === "--json") {
    result.json = true;
    return true;
  }
  if (arg === "--dry-run") {
    result.dryRun = true;
    return true;
  }
  return false;
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
    if (applyBooleanFlag(result, arg)) continue;
    if (arg === "-" || !arg.startsWith("-")) {
      positional.push(arg);
    } else {
      i = applyValueFlag(result, arg, args, i);
    }
  }
  result.command = positional[0];
  result.file = positional[1];
  return result;
}
