function printUsage(): void {
  console.log(`
software-factory

Commands:
  (none yet — the kernel entrypoint is added by the next slice)

Options:
  --repo <path>            Path to repository root (defaults to current working directory)
  --help, -h               Show this help message
  --version, -v            Show version
`);
}

export interface ParsedArgs {
  command?: string;
  repo: string;
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
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  const cmd = positional[0];
  if (cmd !== undefined) {
    result.command = cmd;
  }

  return result;
}

/** Main dispatch entrypoint; the run command is wired to the kernel by S0. */
export async function dispatch(args: string[]): Promise<number> {
  const parsed = parseCliArgs(args);

  if (parsed.help || (!parsed.command && !parsed.version)) {
    printUsage();
    return 0;
  }

  if (parsed.version) {
    console.log("software-factory 0.1.0");
    return 0;
  }

  console.error(`Error: unknown command "${parsed.command}"`);
  printUsage();
  return 1;
}
