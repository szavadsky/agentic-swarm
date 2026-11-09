/**
 * Epic-to-saga concern push (adr-epic-push-condensed).
 *
 * `runChildTask` calls this after the child iteration finishes and before the
 * parent child-closeup write. Only open/routed child concerns and open child
 * remarkables propagate; copies are condensed and written to the parent
 * concern store without their own commit so the child-closeup commit covers
 * them. Child questions carrying `blocks` are forwarded to the parent mailbox.
 */
export interface PropagateEpicConcernsOptions {
  childTaskDir: string;
  parentTaskDir: string;
  parentWt: string;
  epic: string;
}

export async function propagateEpicConcerns(
  _opts: PropagateEpicConcernsOptions
): Promise<void> {
  // Interface stub: behavior is implemented by the green step.
}
