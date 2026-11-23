/** A task's material content: its done-when and the hash frozen-task comparisons read. */

import { createHash } from "node:crypto";
import type { TaskFile } from "./types.js";

/** The observable completion statement from the brief; part of the material hash. */
export function doneWhen(body: string): string {
  const line = body.split(/\r?\n/).find((l) => /^done when:/i.test(l.trim()));
  return line ? line.trim() : "";
}

/**
 * Material hash: frozen-task comparisons must ignore cosmetic edits but catch
 * a changed dependency set, scope, epic, type, flow, tier, revision, kind,
 * slug or done-when.
 */
export function materialHash(task: TaskFile): string {
  const canonical = JSON.stringify([
    task.slug,
    task.kind,
    task.flow,
    task.type ?? "",
    [...task.deps].sort(),
    [...task.scope],
    task.epic ?? "",
    task.tier ?? "",
    task.revision,
    task.base ?? "",
    doneWhen(task.body),
  ]);
  return createHash("sha1").update(canonical, "utf8").digest("hex");
}
