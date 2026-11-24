/** `factory validate`: file, task and outcome validation and its repairs. */

import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { ZodType } from "zod";
import {
  ConfigError,
  configFilePaths,
  loadConfigs,
  loadRunConfig,
  processOverrideSchema,
  repoConfigSchema,
} from "../../kernel/config.js";
import { classSchema } from "../../kernel/flow-context.js";
import { infraSchema } from "../../kernel/infra.js";
import { holdFileSchema } from "../../kernel/mailbox.js";
import {
  expectationForStep,
  flowStepFor,
  parseOutcome,
  validateExpectation,
} from "../../kernel/outcome.js";
import {
  outcomeSchemaFor,
  outcomeSchemaNames,
} from "../../kernel/outcome-schemas.js";
import { PLAN_CHECK_STEP } from "../../kernel/plan-check.js";
import { architectureFlowPromptNames } from "../../kernel/prompt-dry-run.js";
import { loadPrompts } from "../../kernel/prompts.js";
import {
  PLAN_REVIEW_STEP,
  validatePlanReviewDelivery,
} from "../../kernel/plan-review.js";
import {
  escalationFindings,
  fallbackAliasFindings,
  requiredAliases,
} from "../../kernel/preflight.js";
import { qaOutcomeSchema } from "../../kernel/qa.js";
import { isAcceptanceStep, isLastReviewCall } from "../../kernel/review.js";
import { createFolderStore } from "../../kernel/store.js";
import {
  parseTaskFile,
  validateTaskFlows,
  validateTaskGraph,
} from "../../kernel/tasks.js";
import type { ProcessConfig } from "../../kernel/types.js";
import { outcomeSchema } from "../../kernel/types.js";
import type { ValidateFileOptions, ValidateResult } from "./types.js";
import {
  inferValidateKind,
  KNOWN_VALIDATE_KINDS,
  type ValidateKind,
} from "./validate-kind.js";
import { planCheckFindings } from "./validate-plan-check.js";

/**
 * A run config through its `extends` chain: its findings already name the
 * file that owns each key, base included.
 */
function runFindings(file: string): string[] {
  try {
    loadRunConfig(file);
    return [];
  } catch (err) {
    if (err instanceof ConfigError) {
      return err.findings.map(
        (finding) => `${finding.file}: ${finding.key}: ${finding.message}`,
      );
    }
    return [`${file}: ${(err as Error).message}`];
  }
}

/** Same report shape as the schema-validation gate: `file: key: message`. */
function zodFindings(
  text: string,
  file: string,
  schema: ZodType<unknown>,
): string[] {
  let raw: unknown;
  try {
    raw = yaml.parse(text);
  } catch (err) {
    return [`${file}: invalid YAML: ${(err as Error).message}`];
  }
  const result = schema.safeParse(raw ?? {});
  if (!result.success) {
    return result.error.issues.map(
      (issue) =>
        `${file}: ${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
  }
  return [];
}

/**
 * One hold file with the kernel's exported hold schema: same verdicts and
 * messages as `readHolds` (`must be ...` / `not valid YAML: ...`).
 */
function holdFindings(text: string, file: string): string[] {
  let raw: unknown;
  try {
    raw = yaml.parse(text);
  } catch (err) {
    return [`${file}: not valid YAML: ${(err as Error).message}`];
  }
  const result = holdFileSchema.safeParse(raw);
  return result.success
    ? []
    : [`${file}: must be { slugs: string[], goal: boolean }`];
}

/**
 * Nearest repo root above `fromDir`: a directory with `.factory` config or
 * `.git`. Null when the file lives outside any repo (a scratch dir).
 */
function findRepoRoot(fromDir: string): string | null {
  let dir = path.resolve(fromDir);
  while (true) {
    if (
      fs.existsSync(path.join(dir, ".factory", "repo.yaml")) ||
      fs.existsSync(path.join(dir, ".factory", "process.yaml")) ||
      fs.existsSync(path.join(dir, ".git"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Merged process config for validation: the repo owning the file wins and the
 * `--repo` fallback covers scratch files. `loadConfigs` merges the package
 * defaults, so the built-in flows and task types still apply; an invalid
 * config throws.
 */
function processForValidation(
  startDir: string,
  repoFallback?: string,
): ProcessConfig {
  const root =
    findRepoRoot(startDir) ??
    (repoFallback ? path.resolve(repoFallback) : process.cwd());
  return loadConfigs(root).process;
}

/**
 * The step and round a record directory's `started.yaml` gives its outcome.
 * Absent when the file is not in a record directory; a broken record is an
 * error, never a silently weaker check.
 */
function startedMeta(
  absPath: string,
): { step: string; round: number } | undefined {
  const started = path.join(path.dirname(absPath), "started.yaml");
  if (!fs.existsSync(started)) return undefined;
  let parsed: unknown;
  try {
    parsed = yaml.parse(fs.readFileSync(started, "utf8"));
  } catch (err) {
    throw new Error(`${started}: not valid YAML: ${(err as Error).message}`);
  }
  const meta = parsed as { step?: unknown; round?: unknown } | null;
  if (typeof meta?.step !== "string" || !meta.step) {
    throw new Error(`${started}: no step to infer the outcome's contract from`);
  }
  if (typeof meta.round !== "number" || !Number.isInteger(meta.round)) {
    throw new Error(
      `${started}: no round to infer the review's last call from`,
    );
  }
  return { step: meta.step, round: meta.round };
}

/**
 * One outcome's findings for the step it was given for: `--step` wins, the
 * record's `started.yaml` supplies it otherwise. Without either, only the
 * schema is enforced and the caller reports the narrower check.
 */
async function outcomeResult(
  abs: string,
  text: string,
  opts: ValidateFileOptions,
): Promise<ValidateResult> {
  try {
    const started = startedMeta(abs);
    const step = opts.step ?? started?.step;
    if (!step) {
      parseOutcome(text);
      return { findings: [], stepIndependent: true };
    }
    const process = processForValidation(path.dirname(abs), opts.repo);
    const flows = process.flows;
    const stepConfig = flowStepFor(step, flows);
    const outcome = parseOutcome(
      text,
      stepConfig?.qa ? qaOutcomeSchema : outcomeSchema,
    );
    const expectation = expectationForStep(step, flows);
    const lastCall =
      started?.step === step &&
      stepConfig !== undefined &&
      isAcceptanceStep(stepConfig) &&
      isLastReviewCall(stepConfig, started.round);
    // The outcome sits in a record directory under a `records` tree: read the
    // tree so a `debtClosed` id is checked against what ingest assigned. Any
    // other file has no records to resolve an id against, so only the step
    // contract runs.
    const recordsDir = path.dirname(path.dirname(abs));
    const recordId = path.basename(path.dirname(abs));
    const records =
      started &&
      outcome.debtClosed?.length &&
      path.basename(recordsDir) === "records"
        ? await createFolderStore(
            path.dirname(recordsDir),
            undefined,
            process.taskTypes ?? {},
          ).listRecords()
        : undefined;
    const findings = validateExpectation(outcome, expectation, {
      lastCall,
      ...(records ? { records, excludeRecordId: recordId } : {}),
    });
    if (step === PLAN_REVIEW_STEP) {
      findings.push(...validatePlanReviewDelivery(outcome));
    }
    if (step === PLAN_CHECK_STEP) {
      findings.push(...(await planCheckFindings(abs, outcome, process)));
    }
    return { findings: findings.map((finding) => `${abs}: ${finding}`) };
  } catch (err) {
    return { findings: [`${abs}: ${(err as Error).message}`] };
  }
}

/**
 * One task file plus its directory's graph, as the gate groups them: sibling
 * tasks load together so a missing dependency reads as a finding, not a crash.
 */
async function taskFindings(
  absPath: string,
  opts: ValidateFileOptions = {},
): Promise<string[]> {
  const dir = path.dirname(absPath);
  const names = (await fs.promises.readdir(dir))
    .filter((name) => name.endsWith(".md"))
    .sort();
  const tasks: Parameters<typeof validateTaskGraph>[0] = [];
  const findings: string[] = [];
  const processConfig = processForValidation(dir, opts.repo);
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      tasks.push(
        parseTaskFile(
          await fs.promises.readFile(file, "utf8"),
          path.basename(name, ".md"),
          processConfig.taskTypes,
        ),
      );
    } catch (err) {
      findings.push(`${file}: ${(err as Error).message}`);
    }
  }
  for (const finding of validateTaskGraph(tasks)) {
    findings.push(`${dir}: ${finding}`);
  }
  for (const finding of validateTaskFlows(tasks, processConfig.flows)) {
    findings.push(`${dir}: ${finding}`);
  }
  return findings;
}

/**
 * Cross-layer consistency for a repo/process/run file: aliases required by
 * process config exist in run config, task types name a configured flow and a
 * kernel outcome schema, and quota pools named on aliases exist in
 * `limits.concurrency.perSubscription`. Static only: no harness, model or pool
 * call. Findings name the owning file and key.
 */
interface CrossLayerBundle {
  process: ProcessConfig;
  runAliases: Record<string, { subscription?: string }>;
  perSubscription: Record<string, number>;
  escalation: { file: string; key: string; message: string }[];
  fallback: { file: string; key: string; message: string }[];
  runFile: string;
  processFile: string;
  root: string;
}

function crossLayerBundle(
  abs: string,
  kind: ValidateKind,
  opts: ValidateFileOptions,
): CrossLayerBundle | string[] {
  const dir = path.dirname(abs);
  const root =
    findRepoRoot(dir) ??
    (path.basename(dir) === ".factory"
      ? path.dirname(dir)
      : opts.repo
        ? path.resolve(opts.repo)
        : process.cwd());
  const files = configFilePaths(root);
  let bundle: ReturnType<typeof loadConfigs>;
  try {
    bundle = loadConfigs(root, {
      runConfigPath: kind === "run" ? abs : opts.runConfig,
    });
  } catch (err) {
    return [`${abs}: ${(err as Error).message}`];
  }
  const bundleFiles = bundle.files as ReturnType<typeof configFilePaths>;
  const runFile = bundleFiles.run ?? files.run;
  const processFile = fs.existsSync(bundleFiles.processOverride)
    ? bundleFiles.processOverride
    : bundleFiles.processDefault;
  return {
    process: bundle.process,
    runAliases: bundle.run.aliases,
    perSubscription: bundle.run.limits.concurrency.perSubscription,
    escalation: escalationFindings(bundle.run.aliases, runFile),
    fallback: fallbackAliasFindings(bundle.run.aliases, runFile),
    runFile,
    processFile,
    root,
  };
}

function crossLayerFindings(
  abs: string,
  kind: ValidateKind,
  opts: ValidateFileOptions = {},
): string[] {
  if (kind !== "repo" && kind !== "process" && kind !== "run") return [];
  const bundleOrError = crossLayerBundle(abs, kind, opts);
  if (Array.isArray(bundleOrError)) return bundleOrError;
  return [
    ...crossLayerAliasFindings(bundleOrError),
    ...crossLayerTaskTypeFindings(bundleOrError),
    ...crossLayerPoolFindings(bundleOrError),
    ...crossLayerChainFindings(bundleOrError),
    ...crossLayerArchitecturePromptFindings(bundleOrError),
  ];
}

/** Every architect-flow prompt template the repo's prompt layers can resolve. */
function crossLayerArchitecturePromptFindings(
  bundle: CrossLayerBundle,
): string[] {
  const names = architectureFlowPromptNames(
    bundle.process.architecture.flows ?? [],
  );
  if (names.size === 0) return [];
  let library: ReturnType<typeof loadPrompts>;
  try {
    library = loadPrompts(bundle.process, bundle.root);
  } catch (err) {
    return [
      `${bundle.processFile}: architecture.flows: ${(err as Error).message}`,
    ];
  }
  const findings: string[] = [];
  for (const name of [...names].sort()) {
    try {
      library.placeholders(name);
    } catch (err) {
      findings.push(
        `${bundle.processFile}: architecture.flows: ${(err as Error).message}`,
      );
    }
  }
  return findings;
}

function crossLayerAliasFindings(bundle: CrossLayerBundle): string[] {
  const findings: string[] = [];
  for (const [alias, ref] of requiredAliases(bundle.process)) {
    if (!bundle.runAliases[alias]) {
      findings.push(
        `${bundle.runFile}: aliases.${alias}: required by ${ref} but missing`,
      );
    }
  }
  return findings;
}

function crossLayerTaskTypeFindings(bundle: CrossLayerBundle): string[] {
  const findings: string[] = [];
  for (const [name, definition] of Object.entries(bundle.process.taskTypes)) {
    if (!Object.hasOwn(bundle.process.flows, definition.flow)) {
      findings.push(
        `${bundle.processFile}: taskTypes.${name}.flow: flow "${definition.flow}" is not configured`,
      );
    }
    if (!outcomeSchemaFor(definition.schema)) {
      findings.push(
        `${bundle.processFile}: taskTypes.${name}.schema: schema "${definition.schema}" is not a kernel outcome schema (${outcomeSchemaNames()})`,
      );
    }
  }
  return findings;
}

function crossLayerPoolFindings(bundle: CrossLayerBundle): string[] {
  const findings: string[] = [];
  for (const [name, alias] of Object.entries(bundle.runAliases)) {
    if (
      alias.subscription !== undefined &&
      !Object.hasOwn(bundle.perSubscription, alias.subscription)
    ) {
      findings.push(
        `${bundle.runFile}: aliases.${name}.subscription: subscription "${alias.subscription}" names no limits.concurrency.perSubscription pool`,
      );
    }
  }
  return findings;
}

function crossLayerChainFindings(bundle: CrossLayerBundle): string[] {
  return [...bundle.escalation, ...bundle.fallback].map(
    (finding) => `${finding.file}: ${finding.key}: ${finding.message}`,
  );
}

/**
 * Validates one schema-enforced file with the same validators as the
 * schema-validation gate. Findings, empty when valid; unknown kinds and
 * missing files throw.
 */
export async function validateFile(
  file: string,
  opts: ValidateFileOptions = {},
): Promise<ValidateResult> {
  const abs = path.resolve(file);
  const runConfig = opts.runConfig ? path.resolve(opts.runConfig) : undefined;
  const stat = await fs.promises.stat(abs).catch(() => null);
  if (!stat) throw new Error(`no such file: ${file}`);
  if (!stat.isFile()) throw new Error(`not a file: ${file}`);
  const kind = runConfig === abs ? "run" : inferValidateKind(abs);
  if (!kind) {
    throw new Error(
      `unknown file kind: ${file} (expected ${KNOWN_VALIDATE_KINDS}; use --run-config for run files)`,
    );
  }
  const text = await fs.promises.readFile(abs, "utf8");
  let findings: string[] = [];
  switch (kind) {
    case "task":
      findings = await taskFindings(abs, opts);
      break;
    case "class":
      findings = zodFindings(text, abs, classSchema);
      break;
    case "outcome":
      return await outcomeResult(abs, text, opts);
    case "hold":
      findings = holdFindings(text, abs);
      break;
    case "repo":
      findings = zodFindings(text, abs, repoConfigSchema);
      break;
    case "run":
      findings = runFindings(abs);
      break;
    case "process":
      findings = zodFindings(text, abs, processOverrideSchema);
      break;
    case "infra":
      findings = zodFindings(text, abs, infraSchema);
      break;
  }
  findings.push(...crossLayerFindings(abs, kind, { ...opts, runConfig }));
  return { findings };
}
