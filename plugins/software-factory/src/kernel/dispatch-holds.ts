/**
 * The holds a dispatch wave sees: which pending steers still gate a task or
 * the goal, the boundary cause a remaining hold names, and the parks no stall
 * turn has decided yet.
 */
import { makeCause } from "./cause.js";
import type { ActiveHolds } from "./dispatch-state.js";
import type { Hold } from "./mailbox.js";
import { STALL_ROUTES_STEP } from "./pm.js";
import type { Cause, State, StepRecord } from "./types.js";

/**
 * A hold applies only while its owner still decides something: a steer's hold
 * while the steer is pending (the architect answers it at the boundary and
 * moves it to processed), a concern's hold while the concern is still open.
 * This also keeps a hold file from surviving into later iterations.
 *
 * The value is the owner as the boundary cause names it, so a concern hold
 * reads as a concern and not as a steer id.
 */
export function activeHolds(
  holds: Hold[],
  pending: ReadonlySet<string>,
  openConcerns: ReadonlySet<string>,
): ActiveHolds {
  const slugs = new Map<string, string>();
  let goal: string | undefined;
  for (const hold of holds) {
    const steer = pending.has(hold.steer);
    if (!steer && !openConcerns.has(hold.steer)) continue;
    const owner = steer ? hold.steer : `concern ${hold.steer}`;
    if (steer && hold.goal && goal === undefined) goal = hold.steer;
    for (const slug of hold.slugs) {
      if (!slugs.has(slug)) slugs.set(slug, owner);
    }
  }
  return { slugs, goal };
}

/**
 * Names the steers whose slug holds still gate non-terminal work when dispatch
 * exhausts. A hold that voids every pending task ends the iteration early at
 * the boundary with this cause; a partial hold reports the same way.
 */
export function heldBoundaryCause(
  hold: ActiveHolds,
  state: State,
): Cause | undefined {
  const bySteer = new Map<string, string[]>();
  for (const [slug, steer] of hold.slugs) {
    const status = state.tasks[slug]?.status;
    if (
      status === undefined ||
      status === "merged" ||
      status === "finished" ||
      status === "parked" ||
      status === "cancelled"
    )
      continue;
    const list = bySteer.get(steer) ?? [];
    list.push(slug);
    bySteer.set(steer, list);
  }
  if (bySteer.size === 0) return undefined;
  return makeCause(
    "steer",
    [...bySteer.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([steer, slugs]) => `${steer} holds ${[...slugs].sort().join(", ")}`)
      .join("; "),
  );
}

/**
 * This iteration's parked slugs that no stall turn has answered yet: the
 * first stall-routes record written after a park owns its decision. A failed
 * ladder attempt counts too — the park then goes to the architect — so each
 * park costs at most one PM turn. A slug that parks again after an amended
 * rerun is a new park and gets its own decision; `limits.parkAmends` bounds
 * how many of those decisions may amend it.
 */
export function undecidedParked(
  records: readonly StepRecord[],
  state: State,
  iteration: number,
): string[] {
  const attempts = records
    .filter(
      (record) =>
        record.iteration === iteration &&
        record.step === STALL_ROUTES_STEP &&
        record.endedAt,
    )
    .map((record) => record.seq);
  const last = attempts.length > 0 ? Math.max(...attempts) : -1;
  return [
    ...new Set(
      records
        .filter(
          (record) =>
            record.iteration === iteration &&
            record.step === "park" &&
            record.endedAt &&
            record.slug !== undefined &&
            record.seq > last &&
            state.tasks[record.slug]?.status === "parked",
        )
        .map((record) => record.slug!),
    ),
  ].sort();
}
