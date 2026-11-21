/** Goal init, status and steer commands. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { git } from "../../core/git/exec.js";
import { writeTextAtomic } from "../../core/records/io.js";
import {
  configFilePaths,
  loadConfigs,
  repoConfigSchema,
  resolveGoalPaths,
} from "../../kernel/config.js";
import { summaryRelPath } from "../../kernel/context-pack.js";
import { derive } from "../../kernel/derive.js";
import {
  collectStatus,
  readStatus,
  renderStatus,
} from "../../kernel/status.js";
import { createArtifactStore } from "../../kernel/store-backend.js";
import type { ArtifactStore, ConfigBundle } from "../../kernel/types.js";
import type { PriceSource } from "../../kernel/openrouter.js";
import type {
  InitResult,
  StatusOptions,
  StatusResult,
  SteerSource,
} from "./types.js";

/** Creates the tracked config when missing, the goal layout and its intent. */
export async function initGoal(opts: {
  repo: string;
  goal: string;
  intent?: string;
}): Promise<InitResult> {
  const repoRoot = path.resolve(opts.repo);
  const repoProbe = await git(repoRoot, ["rev-parse", "--git-dir"], {
    allowFail: true,
  });
  if (repoProbe.code !== 0)
    throw new Error(`not a git repository: ${repoRoot}`);

  const files = configFilePaths(repoRoot);
  const created = !fs.existsSync(files.repo);
  if (created) {
    const head = await git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"], {
      allowFail: true,
    });
    const current = head.code === 0 ? head.stdout.trim() : "";
    const baseBranch = current && current !== "HEAD" ? current : "main";
    await writeTextAtomic(
      files.repo,
      yaml.stringify(repoConfigSchema.parse({ baseBranch })),
    );
  }

  const configs = loadConfigs(repoRoot);
  const paths = resolveGoalPaths(configs, repoRoot, opts.goal);
  const taskTypes = configs.process.taskTypes;
  const store = createArtifactStore(paths, taskTypes);
  await store.ensureLayout();

  const intentPath = path.join(paths.goalDir, "intent.md");
  let intentCreated = false;
  const existing = await store.readFile("intent.md");
  if (existing === null) {
    const text = opts.intent
      ? await fs.promises.readFile(path.resolve(opts.intent), "utf8")
      : `# Goal: ${opts.goal}\n\nDescribe the outcome this goal must reach, its acceptance criteria and any constraints.\n`;
    await store.writeFile("intent.md", text);
    intentCreated = true;
  } else if (opts.intent) {
    const incoming = await fs.promises.readFile(
      path.resolve(opts.intent),
      "utf8",
    );
    if (incoming !== existing) {
      throw new Error(
        `intent already exists at ${intentPath}; edit it instead of overwriting it`,
      );
    }
  }

  return {
    goalDir: paths.goalDir,
    repoConfig: files.repo,
    repoConfigCreated: created,
    intentPath,
    intentCreated,
  };
}

/** Derived state only: status reads tasks + records and never launches anything. */
export async function statusGoal(
  repo: string,
  goal: string,
  opts: StatusOptions = {},
): Promise<StatusResult> {
  const repoRoot = path.resolve(repo);
  const configs = loadConfigs(repoRoot);
  const paths = resolveGoalPaths(configs, repoRoot, goal);
  if (!fs.existsSync(paths.goalDir))
    throw new Error(`goal "${goal}" has no directory at ${paths.goalDir}`);
  const taskTypes = configs.process.taskTypes;
  const store = createArtifactStore(paths, taskTypes);
  const state = derive(
    await store.listTasks(),
    await store.listRecords(),
    configs.process.flows,
  );

  let lastSummary: string | undefined;
  const iterations = (await store.listDir("iterations"))
    .map((name) => Number(name))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => b - a);
  for (const n of iterations) {
    const rel = summaryRelPath(n);
    if (await store.readFile(rel)) {
      lastSummary = path.join(paths.goalDir, rel);
      break;
    }
  }
  const statusJson = opts.json
    ? await statusTextFor(store, configs, opts.priceSource)
    : undefined;
  return {
    goal,
    state,
    lastSummary,
    goalDir: paths.goalDir,
    ...(statusJson !== undefined ? { statusJson } : {}),
  };
}

/**
 * The kernel's stored snapshot, or the same document derived now when no
 * launch has written one: `--json` never answers a missing file with nothing.
 */
async function statusTextFor(
  store: ArtifactStore,
  configs: ConfigBundle,
  priceSource: PriceSource | undefined,
): Promise<string> {
  const stored = await readStatus(store);
  if (stored !== null) return stored;
  return renderStatus(
    await collectStatus({
      store,
      flows: configs.process.flows,
      priceIds: configs.run.priceIds,
      priceSource,
    }),
  );
}

export async function readSteerSource(file: string): Promise<SteerSource> {
  const text =
    file === "-"
      ? await Bun.stdin.text()
      : await fs.promises.readFile(path.resolve(file), "utf8");
  if (!text.trim()) throw new Error("steer text is empty");
  return { text, source: file === "-" ? "stdin" : path.resolve(file) };
}

/** Atomic maildir drop: write a hidden temp sibling, then rename into the inbox. */
export async function steerGoal(
  repo: string,
  goal: string,
  source: SteerSource,
): Promise<string> {
  const repoRoot = path.resolve(repo);
  const configs = loadConfigs(repoRoot);
  const paths = resolveGoalPaths(configs, repoRoot, goal);
  if (!fs.existsSync(paths.goalDir))
    throw new Error(`goal "${goal}" has no directory at ${paths.goalDir}`);
  const taskTypes = configs.process.taskTypes;
  const store = createArtifactStore(paths, taskTypes);
  await store.ensureLayout();

  const hash = crypto
    .createHash("sha256")
    .update(source.text)
    .digest("hex")
    .slice(0, 8);
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  const name = `${stamp}-${hash}.md`;
  await store.mailbox.publish(
    name,
    source.text.endsWith("\n") ? source.text : `${source.text}\n`,
  );
  return store.pathOf({ area: "mailbox", rel: `inbox/${name}` });
}
