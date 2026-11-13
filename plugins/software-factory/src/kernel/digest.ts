import path from "node:path";
import { runAgentTurn } from "./agent.js";
import { resolveRole, type RoleTarget } from "./flow-context.js";
import { DEFAULT_ROLE_BY_STEP, costText, rolesByStep } from "./metrics.js";
import { pricedUsage, type PriceTable } from "./pricing.js";
import type { KernelRuntime, StepRecord } from "./types.js";

interface RoleRow {
  role: string;
  alias: string;
  turns: number;
  in: number;
  cacheRead: number;
  out: number;
  costUsd: number;
  costKnown: boolean;
  unpricedTurns: number;
}

function roleOf(rec: StepRecord, roleByStep: Record<string, string>): string {
  return roleByStep[rec.step] ?? rec.step;
}

/**
 * The script half of the digest: cost and turns by role, straight from the
 * records. No model is asked to add numbers it can only approximate.
 */
function renderDigestFacts(
  records: StepRecord[],
  iteration: number,
  roleByStep: Record<string, string>,
  prices: PriceTable
): string {
  const rows = new Map<string, RoleRow>();
  let turns = 0;
  for (const rec of records) {
    if (rec.actor !== "agent" || !rec.endedAt) continue;
    if (rec.iteration >= iteration) continue;
    turns += 1;
    const priced = pricedUsage(rec.usage, rec.model?.id, prices);
    const role = roleOf(rec, roleByStep);
    const alias = rec.alias ?? "-";
    const key = `${role}\u0000${alias}`;
    const row =
      rows.get(key) ??
      ({
        role,
        alias,
        turns: 0,
        in: 0,
        cacheRead: 0,
        out: 0,
        costUsd: 0,
        costKnown: false,
        unpricedTurns: 0,
      } as RoleRow);
    row.turns += 1;
    row.in += priced.usage.in;
    row.cacheRead += priced.usage.cacheRead;
    row.out += priced.usage.out;
    if (priced.costKnown) {
      row.costUsd += priced.usage.costUsd ?? 0;
      row.costKnown = true;
    } else {
      row.unpricedTurns += 1;
    }
    rows.set(key, row);
  }

  const totals = [...rows.values()].reduce(
    (sum, row) => ({
      turns: sum.turns + row.turns,
      in: sum.in + row.in,
      cacheRead: sum.cacheRead + row.cacheRead,
      out: sum.out + row.out,
      costUsd: sum.costUsd + row.costUsd,
      costKnown: sum.costKnown || row.costKnown,
      unpricedTurns: sum.unpricedTurns + row.unpricedTurns,
    }),
    { turns: 0, in: 0, cacheRead: 0, out: 0, costUsd: 0, costKnown: false, unpricedTurns: 0 }
  );

  const lines = [
    `# Digest — previous launch (before iteration ${iteration})`,
    "",
    `launch: previous-launch-before-${iteration}`,
    `records: ${records.filter((r) => (r.iteration ?? 0) < iteration).length}`,
    "",
    "## Cost and turns by role",
    "| role | alias | turns | input | cached | output | cost |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const row of [...rows.values()].sort(
    (a, b) => a.role.localeCompare(b.role) || a.alias.localeCompare(b.alias)
  )) {
    lines.push(
      `| ${row.role} | ${row.alias} | ${row.turns} | ${row.in} | ${row.cacheRead} | ${row.out} | ${costText(
        row.costKnown ? row.costUsd : undefined,
        row.unpricedTurns
      )} |`
    );
  }
  if (rows.size === 0) lines.push("| (none) | | | | | | |");
  lines.push(
    "",
    "## Totals",
    `- turns: ${turns}`,
    `- input: ${totals.in}; cached: ${totals.cacheRead}; output: ${totals.out}`,
    `- cost: ${
      rows.size === 0
        ? "not reported by the harness"
        : costText(totals.costKnown ? totals.costUsd : undefined, totals.unpricedTurns)
    }`,
    ""
  );

  const transcripts = [
    ...new Set(records.map((r) => r.transcript).filter((t): t is string => Boolean(t))),
  ];
  lines.push("## Transcripts");
  if (transcripts.length === 0) lines.push("- none recorded");
  else {
    for (const transcript of transcripts.slice(0, 20)) lines.push(`- ${transcript}`);
    if (transcripts.length > 20) lines.push(`- … ${transcripts.length - 20} more`);
  }
  lines.push("", "<!-- The scout appends loops, failures and interventions from these sources. -->");
  return lines.join("\n") + "\n";
}

/**
 * First boundary of a launch with a previous launch on disk: write the derived
 * cost/turn table, then let one cheap scout add loops, failures and
 * interventions from the records and transcripts by path. A failed scout
 * leaves the derived digest in place; the next architect still gets facts.
 */
export async function writeLaunchDigest(
  runtime: KernelRuntime,
  iteration: number,
  records: StepRecord[]
): Promise<string | null> {
  const previous = records.filter((r) => r.iteration < iteration);
  if (previous.length === 0) return null;

  // The scout is observability: without a digest alias the derived table below
  // is the whole digest, and the launch must not fail. Check by presence, not
  // by throwing — pre-flight deliberately does not require a digest alias.
  let scoutTarget: RoleTarget | undefined;
  try {
    scoutTarget = resolveRole(runtime, "digest");
  } catch {
    scoutTarget = undefined;
  }
  const rel = `iterations/${iteration}/digest.md`;
  const digestPath = path.join(runtime.store.goalDir, rel);
  await runtime.store.writeFile(
    rel,
    renderDigestFacts(
      records,
      iteration,
      {
        ...DEFAULT_ROLE_BY_STEP,
        ...rolesByStep(runtime.configs.process.flows),
      },
      runtime.configs.run.prices ?? {}
    )
  );

  if (scoutTarget) {
    try {
      await runAgentTurn(runtime, {
        target: scoutTarget,
        cwd: runtime.paths.goalCheckout,
        meta: { iteration, step: "digest", round: 1 },
        vars: {
          launch_id: `previous-launch-before-${iteration}`,
          goal_dir: runtime.store.goalDir,
          records_dir: runtime.store.recordsDir,
          transcripts_dir: runtime.paths.sessionsDir,
          digest_path: digestPath,
        },
        expectation: "any",
      });
    } catch {
      // The scout is an enhancement; the derived table already answers the facts.
    }
  }
  return rel;
}