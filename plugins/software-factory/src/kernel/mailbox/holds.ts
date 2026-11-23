/** Holds: reading, sweeping, expiring and writing the outbox. */

import path from "node:path";
import yaml from "yaml";
import { makeCause } from "../cause.js";
import { scriptMeta } from "../record.js";
import type { ArtifactStore, StepRecord } from "../types.js";
import { collectSteerRoutes } from "./routes.js";
import { scanInbox } from "./steer.js";
import type { Hold, HoldFinding, ReadHoldsOptions, Steer } from "./types.js";
import {
  YAML_HOLD,
  archiveName,
  contentHash,
  holdFileSchema,
} from "./steer.js";

/** Where the PM's steer turn writes one `<steer-id>.yaml` per structured steer. */
export function holdsDir(store: ArtifactStore): string {
  return store.mailbox.holds;
}

/** Where unreadable hold files are parked so they stop deciding dispatch. */
export function quarantineDir(store: ArtifactStore): string {
  return store.mailbox.quarantine;
}

async function listHoldNames(store: ArtifactStore): Promise<string[]> {
  return store.mailbox.files("holds");
}

/**
 * Reads the PM's hold decisions without touching the mailbox. A malformed hold
 * and a hold naming a slug outside `knownSlugs` (when given) decide nothing:
 * each is returned as a finding while the valid holds beside it still apply.
 * Parking those files is `sweepHolds`'s job. Holds for steers the architect
 * already processed are the caller's to ignore.
 */
export async function readHolds(
  store: ArtifactStore,
  opts: ReadHoldsOptions = {},
): Promise<{ holds: Hold[]; findings: HoldFinding[] }> {
  const known =
    opts.knownSlugs === undefined ? undefined : new Set(opts.knownSlugs);
  const holds: Hold[] = [];
  const findings: HoldFinding[] = [];
  for (const name of await listHoldNames(store)) {
    if (name.startsWith(".") || !YAML_HOLD.test(name)) continue;
    const file = store.mailbox.rel("holds", name);
    const text = await store.mailbox.read("holds", name);
    if (text === null) continue;
    let parsed: Hold | undefined;
    try {
      const valid = holdFileSchema.safeParse(yaml.parse(text));
      if (valid.success) {
        parsed = {
          steer: path.basename(name, path.extname(name)),
          ...valid.data,
        };
      } else {
        findings.push({
          file,
          kind: "malformed",
          reason: "must be { slugs: string[], goal: boolean }",
        });
      }
    } catch (err) {
      findings.push({
        file,
        kind: "malformed",
        reason: `not valid YAML: ${(err as Error).message}`,
      });
    }
    if (!parsed) continue;
    const unknown =
      known === undefined
        ? []
        : parsed.slugs.filter((slug) => !known.has(slug));
    if (unknown.length > 0) {
      findings.push({
        file,
        kind: "unknown-slug",
        reason: `unknown slug(s): ${unknown.join(", ")}`,
      });
      continue;
    }
    holds.push(parsed);
  }
  return { holds, findings };
}

/**
 * Moves a hold that decides nothing out of the holds directory and records
 * why. Leaving it in place would re-report it on every read, so the record is
 * the report and the file is kept under `mailbox/quarantine/` for the operator.
 */
async function quarantineHold(
  store: ArtifactStore,
  finding: HoldFinding,
  iteration: number,
): Promise<void> {
  const name = path.basename(finding.file);
  const text = await store.mailbox.read("holds", name);
  if (text === null) return;
  const taken = await store.mailbox.read("quarantine", name);
  const target = taken === null ? name : archiveName(name, contentHash(text));
  const moved = await store.mailbox.move("holds", name, "quarantine", target);
  if (!moved) return;
  const rel = store.mailbox.rel("quarantine", target);
  await store.appendRecord(scriptMeta(iteration, "hold-quarantine"), {
    ok: false,
    cause: makeCause(
      "quarantine",
      `${finding.kind} hold "${name}" moved to ${rel}: ${finding.reason}`,
    ),
  });
}

/**
 * The launch's one hold quarantine, run under the run lock: parks every
 * malformed or unknown-slug hold with a record. A slug whose task file the
 * scan reports as an unconfigured type is not unknown: pre-flight refuses that
 * launch, and the hold stays for when the type is configured. A holds path
 * that is not a directory has nothing to park; dispatch reports it as infra.
 */
export async function sweepHolds(
  store: ArtifactStore,
  iteration: number,
  knownSlugs: ReadonlySet<string> | readonly string[],
): Promise<void> {
  const known = new Set(knownSlugs);
  for (const finding of await store.scanTaskFindings()) {
    if (finding.kind === "unconfigured-type") known.add(finding.slug);
  }
  let findings: HoldFinding[];
  try {
    ({ findings } = await readHolds(store, { knownSlugs: known }));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOTDIR") return;
    throw err;
  }
  for (const finding of findings) {
    await quarantineHold(store, finding, iteration);
  }
}

/**
 * Removes one steer's hold file. A boundary expires the hold of a steer the
 * architect left unanswered, so held work resumes instead of waiting for an
 * answer that may never come.
 */
export async function expireHold(
  store: ArtifactStore,
  steerId: string,
): Promise<void> {
  for (const name of await store.mailbox.files("holds")) {
    if (!YAML_HOLD.test(name)) continue;
    if (path.basename(name, path.extname(name)) !== steerId) continue;
    await store.mailbox.remove("holds", name);
  }
}

export async function writeOutbox(
  store: ArtifactStore,
  id: string,
  text: string,
): Promise<string> {
  const name = `steer-${id}.md`;
  await store.mailbox.write("outbox", name, `${text.trim()}\n`);
  return store.mailbox.rel("outbox", name);
}
