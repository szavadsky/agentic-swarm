import type { PromptLibrary } from "./prompts.js";

/**
 * The architect's consider-a-saga reminder: rendered into the architect prompt
 * once the goal holds more tasks than the process config's `sagaTaskCount`.
 * Absent below it and when no threshold is configured.
 */
export function sagaReminderVar(
  prompts: PromptLibrary,
  taskCount: number,
  threshold: number | undefined,
): string {
  if (threshold === undefined || taskCount <= threshold) return "";
  return `${prompts
    .render("saga-reminder", {
      task_count: String(taskCount),
      threshold: String(threshold),
    })
    .trim()}\n\n`;
}
