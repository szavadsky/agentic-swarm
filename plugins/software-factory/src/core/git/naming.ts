import path from "node:path";

export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const RESERVED_SLUGS = new Set(["simple"]);

/**
 * Validates a task or item slug:
 * - Must match ^[a-z0-9]+(-[a-z0-9]+)*$ (lowercase alphanumeric with single hyphens)
 * - Cannot contain consecutive hyphens ('--')
 * - Cannot be a reserved slug ('simple') unless explicitly allowed
 */
export function validateSlug(
  slug: string,
  options: { allowReserved?: boolean } = {}
): boolean {
  if (!slug || typeof slug !== "string") return false;
  if (slug.includes("--")) return false;
  if (!SLUG_REGEX.test(slug)) return false;
  if (!options.allowReserved && RESERVED_SLUGS.has(slug)) return false;
  return true;
}

export function assertValidSlug(
  slug: string,
  label = "Slug",
  options: { allowReserved?: boolean } = {}
): void {
  if (!options.allowReserved && RESERVED_SLUGS.has(slug)) {
    throw new Error(`${label} "${slug}" is a reserved slug`);
  }
  if (!validateSlug(slug, { allowReserved: true })) {
    throw new Error(
      `${label} "${slug}" is invalid: must match ^[a-z0-9]+(-[a-z0-9]+)*$ and not contain '--'`
    );
  }
}

export interface ParsedBranch {
  task: string;
  items: string[];
  depth: number; // 0 = root task, 1 = item/epic, 2 = item inside epic
}

/**
 * Parses branch name into task and child segments (§7).
 * Example:
 *   "topic/my-task" -> task: "my-task", items: [], depth: 0
 *   "topic/my-task--feat-a" -> task: "my-task", items: ["feat-a"], depth: 1
 *   "topic/my-task--epic-1--feat-b" -> task: "my-task", items: ["epic-1", "feat-b"], depth: 2
 */
export function parseBranch(branch: string): ParsedBranch | null {
  if (!branch.startsWith("topic/")) return null;
  const rest = branch.slice("topic/".length);
  const parts = rest.split("--");
  if (parts.length === 0 || !parts[0]) return null;

  const task = parts[0];
  const items = parts.slice(1);
  const depth = items.length;

  return {
    task,
    items,
    depth,
  };
}

/**
 * Returns branch depth:
 * 0 = root task (topic/{task})
 * 1 = item or epic (topic/{task}--{item})
 * 2 = item inside an epic (topic/{task}--{epic}--{item})
 */
export function branchDepth(branch: string): number {
  const parsed = parseBranch(branch);
  if (!parsed) {
    throw new Error(`Invalid branch for depth computation: "${branch}"`);
  }
  return parsed.depth;
}

/**
 * Generates the root topic branch name for a task: topic/{task}
 */
export function taskBranch(task: string): string {
  assertValidSlug(task, "Task slug");
  return `topic/${task}`;
}

/**
 * Generates a child branch: parentBranch--item (§7).
 * Enforces maximum epic depth of 2 (§8.6).
 * Accepts opts.allowReserved for scratch branches (e.g. topic/{task}--simple).
 */
export function childBranch(
  parentBranch: string,
  item: string,
  opts?: { allowReserved?: boolean }
): string {
  assertValidSlug(item, "Item slug", opts);
  const parsed = parseBranch(parentBranch);
  if (!parsed) {
    throw new Error(`Invalid parent branch: "${parentBranch}"`);
  }

  const nextDepth = parsed.depth + 1;
  if (nextDepth > 2) {
    throw new Error(
      `Cannot create child branch "${item}" from "${parentBranch}": max epic depth 2 exceeded`
    );
  }

  return `${parentBranch}--${item}`;
}

/**
 * Computes worktree folder path from root directory and branch (§7).
 * All slashes in branch name are replaced with underscores.
 * Example:
 *   worktreePath("../wt", "topic/my-task") -> "../wt/topic_my-task"
 */
export function worktreePath(root: string, branch: string): string {
  const folderName = branch.replace(/\//g, "_");
  return path.resolve(root, folderName);
}
