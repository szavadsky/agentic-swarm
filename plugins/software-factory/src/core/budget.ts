import fs from "node:fs";
import path from "node:path";
import type { PipelineBudget, StepMetaArtifact, StepUsage } from "./artifacts.js";
import type { Usage } from "../harness/types.js";
import { readYaml } from "./records/io.js";
import { parseStepRecordDirName } from "./records/step-record.js";
import { childBranch } from "./git/naming.js";

export interface SpendTotals {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface BudgetCheckResult {
  exceeded: boolean;
  spent: number;
  limit?: number;
}

export interface SpendScanAttribution {
  item?: string;
  role?: string;
}

export interface SpendScanRecord {
  metaPath: string;
  usage: StepUsage;
  attribution: SpendScanAttribution;
}

export interface SpendScanResult {
  total: SpendTotals;
  byRole: Map<string, SpendTotals>;
  byItem: Map<string, SpendTotals>;
  records: SpendScanRecord[];
}

function emptyTotals(): SpendTotals {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

function addTotals(target: SpendTotals, usage: StepUsage | Usage): void {
  target.inputTokens += usage.inputTokens ?? 0;
  target.outputTokens += usage.outputTokens ?? 0;
  target.costUsd += usage.costUsd ?? 0;
}

function addToMap(map: Map<string, SpendTotals>, key: string, usage: StepUsage | Usage): void {
  const cur = map.get(key) ?? emptyTotals();
  addTotals(cur, usage);
  map.set(key, cur);
}

async function readUsageMeta(metaPath: string): Promise<StepMetaArtifact | undefined> {
  if (!fs.existsSync(metaPath)) return undefined;
  try {
    return await readYaml<StepMetaArtifact>(metaPath);
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      throw new Error(`Corrupt step record meta at ${metaPath}: ${err?.message ?? err}`);
    }
    return undefined;
  }
}

/**
 * Candidate worktree roots that may hold this task's records.
 * Item steps live on item branches (separate worktrees until merged); epic
 * child runs live on the epic branch. All are siblings of the task worktree.
 */
export function candidateSpendWorktrees(taskWt: string, parentBranch: string, itemSlugs: string[]): string[] {
  const wtRoot = path.dirname(taskWt);
  const out = [taskWt];
  for (const slug of itemSlugs) {
    try {
      const branch = childBranch(parentBranch, slug, { allowReserved: slug === "simple" });
      out.push(path.join(wtRoot, branch.replace(/\//g, "_")));
    } catch {
      // Invalid slug: taskDir scan below still covers it.
    }
  }
  return out;
}

/**
 * Computes spend from ALL step records: task runs, item steps in the task
 * worktree and live item worktrees (working + committed records), and epic
 * child-task records. Records are keyed by relative meta path within each
 * task dir so the same commit seen from two worktrees counts once, while a
 * newer unmerged working record wins over the older merged copy.
 */
export async function scanSpendFromDisk(opts: {
  taskDir: string;
  taskWt: string;
  parentBranch: string;
}): Promise<SpendScanResult> {
  const { taskDir, taskWt, parentBranch } = opts;
  const itemsDir = path.join(taskDir, "items");
  let itemSlugs: string[] = [];
  if (fs.existsSync(itemsDir)) {
    const entries = await fs.promises.readdir(itemsDir, { withFileTypes: true });
    itemSlugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }

  const relTaskDir = path.relative(taskWt, taskDir);
  // Newest-first: live item worktrees shadow the merged copies in the task
  // worktree. First occurrence of a relative meta path wins.
  const worktrees = candidateSpendWorktrees(taskWt, parentBranch, itemSlugs).reverse();
  const seen = new Set<string>();
  const records: SpendScanRecord[] = [];

  const consider = async (absMetaPath: string, anchorWt: string, attribution: SpendScanAttribution): Promise<void> => {
    const relKey = path.relative(anchorWt, absMetaPath);
    if (seen.has(relKey)) return;
    const meta = await readUsageMeta(absMetaPath);
    if (!meta?.usage) return;
    seen.add(relKey);
    records.push({ metaPath: absMetaPath, usage: meta.usage, attribution: { ...attribution, role: meta.role ?? attribution.role } });
  };

  for (const wt of worktrees) {
    if (!fs.existsSync(wt)) continue;
    const wtTaskDir = path.join(wt, relTaskDir);
    if (!fs.existsSync(wtTaskDir)) continue;
    // Task runs live only in the task worktree; item worktrees contain stale
    // copies from their base commit which must not double count.
    if (path.resolve(wt) === path.resolve(taskWt)) {
      const runsDir = path.join(wtTaskDir, "runs");
      if (fs.existsSync(runsDir)) {
        const entries = await fs.promises.readdir(runsDir, { withFileTypes: true });
        for (const ent of entries) {
          if (!ent.isDirectory() || !parseStepRecordDirName(ent.name)) continue;
          await consider(path.join(runsDir, ent.name, "meta.yaml"), wt, {});
        }
      }
    }
    // Item steps + epic child records under each item dir.
    const wtItemsDir = path.join(wtTaskDir, "items");
    if (!fs.existsSync(wtItemsDir)) continue;
    const wtItemEntries = await fs.promises.readdir(wtItemsDir, { withFileTypes: true });
    for (const idir of wtItemEntries) {
      if (!idir.isDirectory()) continue;
      const itemSlug = idir.name;
      await scanItemDirInto(path.join(wtItemsDir, itemSlug), wt, itemSlug, consider);
    }
    // Epic child tasks keep their own runs/items nested under the task dir
    // (e.g. `<taskDir>/<epic>/runs`, `<taskDir>/<epic>/items/...`).
    const wtEntries = await fs.promises.readdir(wtTaskDir, { withFileTypes: true });
    for (const ent of wtEntries) {
      if (!ent.isDirectory() || ent.name === "runs" || ent.name === "items") continue;
      const childDir = path.join(wtTaskDir, ent.name);
      const childRuns = path.join(childDir, "runs");
      if (fs.existsSync(childRuns)) {
        const entries = await fs.promises.readdir(childRuns, { withFileTypes: true });
        for (const r of entries) {
          if (!r.isDirectory() || !parseStepRecordDirName(r.name)) continue;
          await consider(path.join(childRuns, r.name, "meta.yaml"), wt, { item: ent.name });
        }
      }
      const childItems = path.join(childDir, "items");
      if (fs.existsSync(childItems)) {
        const childItemEntries = await fs.promises.readdir(childItems, { withFileTypes: true });
        for (const cidir of childItemEntries) {
          if (!cidir.isDirectory()) continue;
          await scanItemDirInto(path.join(childItems, cidir.name), wt, `${ent.name}/${cidir.name}`, consider);
        }
      }
    }
  }

  const total = emptyTotals();
  const byRole = new Map<string, SpendTotals>();
  const byItem = new Map<string, SpendTotals>();
  for (const rec of records) {
    addTotals(total, rec.usage);
    if (rec.attribution.role) addToMap(byRole, rec.attribution.role, rec.usage);
    addToMap(byItem, rec.attribution.item ?? "(orchestration)", rec.usage);
  }
  return { total, byRole, byItem, records };
}

async function scanItemDirInto(
  itemDir: string,
  anchorWt: string,
  itemSlug: string,
  consider: (absMetaPath: string, anchorWt: string, attribution: SpendScanAttribution) => Promise<void>
): Promise<void> {
  const stepsDir = path.join(itemDir, "steps");
  if (fs.existsSync(stepsDir)) {
    const stepDirs = await fs.promises.readdir(stepsDir, { withFileTypes: true });
    for (const sdir of stepDirs) {
      if (!sdir.isDirectory() || !parseStepRecordDirName(sdir.name)) continue;
      await consider(path.join(stepsDir, sdir.name, "meta.yaml"), anchorWt, { item: itemSlug });
    }
  }
  // Nested epic child records under this item dir (defensive; canonical
  // layout keeps them under `<taskDir>/<epic>/`).
  const entries = await fs.promises.readdir(itemDir, { withFileTypes: true }).catch(() => []);
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name === "steps") continue;
    const nestedSteps = path.join(itemDir, ent.name, "steps");
    if (fs.existsSync(nestedSteps)) {
      const stepDirs = await fs.promises.readdir(nestedSteps, { withFileTypes: true });
      for (const sdir of stepDirs) {
        if (!sdir.isDirectory() || !parseStepRecordDirName(sdir.name)) continue;
        await consider(path.join(nestedSteps, sdir.name, "meta.yaml"), anchorWt, { item: `${itemSlug}/${ent.name}` });
      }
    }
  }
}

/**
 * Tracks token and dollar budgets across task, iteration, and items (§12.5).
 * Enforces limits:
 * - perItemUsd exceeded: item -> consult
 * - perIterationUsd exceeded: iteration -> end
 * - perTaskUsd exceeded: task -> human-stop item + exit 10
 */
export class BudgetTracker {
  private taskSpend: SpendTotals = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  private iterationSpend = new Map<number, SpendTotals>();
  private itemSpend = new Map<string, SpendTotals>();
  private roleSpend = new Map<string, SpendTotals>();

  constructor(public readonly budget?: PipelineBudget) {}

  public recordUsage(opts: {
    item?: string;
    iteration?: number;
    role?: string;
    usage?: StepUsage | Usage;
  }): void {
    const { item, iteration, role, usage } = opts;
    if (!usage) return;

    const inTok = usage.inputTokens ?? 0;
    const outTok = usage.outputTokens ?? 0;
    const cost = usage.costUsd ?? 0;

    // Task total
    this.taskSpend.inputTokens += inTok;
    this.taskSpend.outputTokens += outTok;
    this.taskSpend.costUsd += cost;

    // Iteration total
    if (iteration !== undefined) {
      const cur = this.iterationSpend.get(iteration) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
      cur.inputTokens += inTok;
      cur.outputTokens += outTok;
      cur.costUsd += cost;
      this.iterationSpend.set(iteration, cur);
    }

    // Item total
    if (item) {
      const cur = this.itemSpend.get(item) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
      cur.inputTokens += inTok;
      cur.outputTokens += outTok;
      cur.costUsd += cost;
      this.itemSpend.set(item, cur);
    }

    // Role total
    if (role) {
      const cur = this.roleSpend.get(role) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
      cur.inputTokens += inTok;
      cur.outputTokens += outTok;
      cur.costUsd += cost;
      this.roleSpend.set(role, cur);
    }
  }

  public getTaskSpend(): SpendTotals {
    return { ...this.taskSpend };
  }

  public getIterationSpend(iteration: number): SpendTotals {
    return { ...(this.iterationSpend.get(iteration) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 }) };
  }

  public getItemSpend(item: string): SpendTotals {
    return { ...(this.itemSpend.get(item) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 }) };
  }

  public getRoleSpend(role: string): SpendTotals {
    return { ...(this.roleSpend.get(role) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 }) };
  }

  public getAllItemSpend(): Map<string, SpendTotals> {
    return new Map([...this.itemSpend.entries()].map(([k, v]) => [k, { ...v }]));
  }

  public getAllRoleSpend(): Map<string, SpendTotals> {
    return new Map([...this.roleSpend.entries()].map(([k, v]) => [k, { ...v }]));
  }

  public checkTaskBudget(): BudgetCheckResult {
    const limit = this.budget?.perTaskUsd;
    if (limit === undefined || limit <= 0) {
      return { exceeded: false, spent: this.taskSpend.costUsd, limit };
    }
    return {
      exceeded: this.taskSpend.costUsd > limit,
      spent: this.taskSpend.costUsd,
      limit,
    };
  }

  public checkIterationBudget(iteration: number): BudgetCheckResult {
    const limit = this.budget?.perIterationUsd;
    const spent = this.iterationSpend.get(iteration)?.costUsd ?? 0;
    if (limit === undefined || limit <= 0) {
      return { exceeded: false, spent, limit };
    }
    return {
      exceeded: spent > limit,
      spent,
      limit,
    };
  }

  public checkItemBudget(item: string): BudgetCheckResult {
    const limit = this.budget?.perItemUsd;
    const spent = this.itemSpend.get(item)?.costUsd ?? 0;
    if (limit === undefined || limit <= 0) {
      return { exceeded: false, spent, limit };
    }
    return {
      exceeded: spent > limit,
      spent,
      limit,
    };
  }

  /**
   * Reconciles budget totals by scanning step record meta.yaml files across
   * the task worktree and live item worktrees (plus epic child records).
   * Ensures restart safety across process runs.
   */
  public async reconcileFromDisk(taskDir: string, opts?: { taskWt?: string; parentBranch?: string }): Promise<void> {
    const taskWt = opts?.taskWt ?? path.dirname(path.dirname(taskDir));
    const parentBranch = opts?.parentBranch ?? `topic/${path.basename(taskDir)}`;
    const scan = await scanSpendFromDisk({ taskDir, taskWt, parentBranch });
    this.taskSpend = { ...scan.total };
    this.itemSpend = new Map([...scan.byItem.entries()].map(([k, v]) => [k, { ...v }]));
    this.roleSpend = new Map([...scan.byRole.entries()].map(([k, v]) => [k, { ...v }]));
  }
}
