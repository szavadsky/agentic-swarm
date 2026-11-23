/** Usage text, one page per command. */

export const ROOT_USAGE = `
software-factory

Commands:
  init                     Create the repo config, goal directory and intent
  run                      Run bounded iterations of one goal
  status                   Show derived state, parked causes and the last summary
  benchmark                Print the benchmark rows for one goal's artifacts
  steer                    Drop a steering file into the goal inbox
  validate                 Validate one schema-enforced file with the gate's validators
  schemas                  Write every kernel schema as JSON Schema
  variables                Render prompts/VARIABLES.md from the typed descriptor

Options:
  --repo <path>            Repository root (defaults to the current directory)
  --goal <name>            Goal directory name under the repo's artifact root
  --out <path>             Output directory for \`schemas\`, file for \`variables\`
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
factory status --repo <path> --goal <name> [--json]

Prints the state derived from task files and records, every parked cause, and
the path of the last iteration summary. --json prints status.json, the
kernel's machine-readable snapshot written after each agent launch and finish.
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
factory validate [--step <id>] [--run-config <file>] [<file>]

Validates one schema-enforced file with the same validators as the
schema-validation gate: tasks/*.md (with its directory's dependency graph and
flow existence against the merged process config), class.yaml, outcome.yaml,
mailbox/holds/*.yaml, repo.yaml, run.yaml and process.yaml. A repo, process
or run file also gets the cross-layer checks — required aliases present,
task-type flow/schema names known, quota pools defined — without launching
a harness. --run-config <file> names a run config explicitly, including a file
not named run.yaml, and is the validated file when no positional file is given.
--step names the
flow step an outcome is given for and overrides the step in the sibling
started.yaml; a standalone outcome without either gets step-independent checks
only. Exit: 0 valid, 1 invalid or unknown kind.
`;

const VARIABLES_USAGE = `
factory variables --out <file>

Renders the prompt-variable reference from the kernel's typed descriptor and
writes it to <file>: one line per variable, no padded columns. The prompt tests
compare the written file with the render and fail when they differ, so a
variable change is one descriptor line plus this render. Exit: 0 written.
`;

const SCHEMAS_USAGE = `
factory schemas --out <dir>

Writes every kernel file schema as JSON Schema, one <name>.schema.json per
artifact: task, outcome, hold, class, repo, run and process. Creates the
directory. Editors and the artifact LSP consume these files. Exit: 0 written,
1 error.
`;

export function usageFor(command: string | undefined): string {
  if (command === "init") return INIT_USAGE;
  if (command === "run") return RUN_USAGE;
  if (command === "status") return STATUS_USAGE;
  if (command === "benchmark") return BENCHMARK_USAGE;
  if (command === "steer") return STEER_USAGE;
  if (command === "validate") return VALIDATE_USAGE;
  if (command === "schemas") return SCHEMAS_USAGE;
  if (command === "variables") return VARIABLES_USAGE;
  return ROOT_USAGE;
}
