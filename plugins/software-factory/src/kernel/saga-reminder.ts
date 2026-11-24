/**
 * The architect's consider-a-saga reminder: rendered into the architect prompt
 * once the goal holds more tasks than the process config's `sagaTaskCount`.
 * Absent below it and when no threshold is configured.
 */
export function sagaReminderVar(
  taskCount: number,
  threshold: number | undefined,
): string {
  if (threshold === undefined || taskCount <= threshold) return "";
  return (
    "## Consider a saga\n\n" +
    `This goal holds ${taskCount} tasks, past the configured ${threshold}. ` +
    "Weigh whether it is one plan or a saga: work that divides into layers " +
    "runs as one epic per layer, each with its own plan and subarchitect at " +
    "depth 2, the register in `plan.md` naming them. The split is your call; " +
    "a goal that does not divide stays one plan.\n\n"
  );
}
