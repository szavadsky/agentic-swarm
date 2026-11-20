import yaml from "yaml";
import { selfHeldSlugs } from "../mailbox.js";
import type { SteerRoute } from "../types.js";
import type { KernelRuntime, TaskFile } from "../types.js";

type ParsedHold =
  | { status: "missing" }
  | { status: "bad"; message: string }
  | { status: "ok"; slugs: unknown; goal: unknown };

async function parseHoldFile(
  runtime: KernelRuntime,
  steerId: string,
): Promise<ParsedHold> {
  const candidates = [`${steerId}.yaml`, `${steerId}.yml`];
  let text: string | null = null;
  for (const name of candidates) {
    text = await runtime.store.mailbox.read("holds", name);
    if (text !== null) break;
  }
  if (text === null) return { status: "missing" };
  let parsed: unknown;
  try {
    parsed = yaml.parse(text);
  } catch (err) {
    return { status: "bad", message: (err as Error).message };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { status: "bad", message: "hold is not a mapping" };
  }
  const { slugs, goal } = parsed as { slugs?: unknown; goal?: unknown };
  return { status: "ok", slugs, goal };
}

export async function stallHoldProblem(
  runtime: KernelRuntime,
  steerId: string,
): Promise<string | undefined> {
  const hold = await parseHoldFile(runtime, steerId);
  if (hold.status === "missing") {
    return `stall steer "${steerId}" has no hold file; a stall drains the goal with goal: true`;
  }
  if (hold.status === "bad") {
    return `stall steer "${steerId}" hold is not valid YAML: ${hold.message}`;
  }
  if (hold.goal !== true) {
    return `stall steer "${steerId}" hold has no goal: true; a stall drains the goal`;
  }
  return undefined;
}

export async function architectHoldProblem(
  runtime: KernelRuntime,
  steerId: string,
  label: "intent" | "architect" = "architect",
): Promise<string | undefined> {
  const hold = await parseHoldFile(runtime, steerId);
  if (hold.status === "missing") return undefined;
  if (hold.status === "bad") {
    return `${label} steer "${steerId}" hold is not valid YAML: ${hold.message}`;
  }
  if (
    !Array.isArray(hold.slugs) ||
    !hold.slugs.every((slug) => typeof slug === "string")
  ) {
    return `${label} steer "${steerId}" hold slugs must be a list of task slugs; a ${label} steer that voids nothing holds nothing with slugs: []`;
  }
  if (hold.goal !== false) {
    return `${label} steer "${steerId}" hold has no goal: false; goal: true stays reserved for stall`;
  }
  return undefined;
}

/**
 * A hold that names a task its own steer created. The steer stays pending
 * until its spike task ends, and the held task never starts: the two wait on
 * each other, so the hold must be refused instead of written.
 */
export async function selfHoldProblem(
  runtime: KernelRuntime,
  steerId: string,
  tasks: readonly TaskFile[],
): Promise<string | undefined> {
  const hold = await parseHoldFile(runtime, steerId);
  if (hold.status !== "ok" || !Array.isArray(hold.slugs)) return undefined;
  const slugs = hold.slugs.filter(
    (slug): slug is string => typeof slug === "string",
  );
  const own = selfHeldSlugs(steerId, slugs, tasks);
  if (own.length === 0) return undefined;
  return `steer "${steerId}" hold names task(s) it creates: ${own.join(", ")}; a steer never holds its own task — leave those slugs out of the hold`;
}

export async function ensureSteerHold(
  runtime: KernelRuntime,
  steerId: string,
  route: SteerRoute,
): Promise<void> {
  for (const name of [`${steerId}.yaml`, `${steerId}.yml`]) {
    if ((await runtime.store.mailbox.read("holds", name)) !== null) return;
  }
  const goal = route === "stall";
  await runtime.store.mailbox.write(
    "holds",
    `${steerId}.yaml`,
    `slugs: []\ngoal: ${goal}\n`,
  );
}
