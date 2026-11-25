import { createHash } from "node:crypto";
import path from "node:path";
import { writeYamlAtomic } from "../../core/records/io.js";
import type { OmpOverlayOptions } from "./types.js";

export type { OmpOverlayOptions } from "./types.js";

/** Agents omp ships with; their bundled frontmatter would otherwise inherit the parent model. */
const BUNDLED_SUBAGENTS = [
  "task",
  "scout",
  "reviewer",
  "sonic",
  "security-reviewer",
];

function record(
  value: unknown,
  name: string,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(
    `Invalid "${name}" option: expected object, got ${typeof value}`,
  );
}

export function ompOverlay(opts: OmpOverlayOptions): Record<string, unknown> {
  const overlay: Record<string, unknown> = { ...opts.options };
  // sessions.retention is the run's cache policy, so it wins over a stale
  // providers block copied into the harness entry. The copy keeps that entry
  // unchanged: it outlives the overlay and is serialized again on the next turn.
  const providers = {
    ...(record(overlay.providers, "providers") ?? {}),
  };
  providers.cacheRetention = opts.retention;
  overlay.providers = providers;

  if (opts.subagentModel) {
    overlay.task = {
      ...record(overlay.task, "task"),
      agentModelOverrides: Object.fromEntries(
        BUNDLED_SUBAGENTS.map((name) => [name, opts.subagentModel]),
      ),
    };
    overlay.modelRoles = {
      ...record(overlay.modelRoles, "modelRoles"),
      task: opts.subagentModel,
    };
  }

  return overlay;
}

/** Writes the overlay under `dir`, keyed by content so concurrent turns never share one. */
export async function writeOmpOverlay(
  opts: OmpOverlayOptions,
  dir: string,
): Promise<string> {
  const content = ompOverlay(opts);
  const hash = createHash("sha1")
    .update(JSON.stringify(content))
    .digest("hex")
    .slice(0, 12);
  const target = path.join(dir, `overlay-${hash}.yaml`);
  await writeYamlAtomic(target, content);
  return target;
}
