import {
  WASTE_REASON_LABEL,
  WASTE_REASONS,
  type WasteAccounting,
  type WasteCounts,
} from "./waste.js";
import type { WasteGroupRow } from "./waste-summary-types.js";

function wasteTotal(counts: WasteCounts): number {
  return WASTE_REASONS.reduce((sum, reason) => sum + counts[reason], 0);
}

/** One group's reasons, zero reasons dropped; `none` when it wasted nothing. */
function wasteReasons(counts: WasteCounts): string {
  const parts = WASTE_REASONS.filter((reason) => counts[reason] > 0).map(
    (reason) => `${WASTE_REASON_LABEL[reason]} ${counts[reason]}`,
  );
  return parts.length > 0 ? parts.join("; ") : "none";
}

function wasteTable(label: string, rows: readonly WasteGroupRow[]): string[] {
  return [
    `| ${label} | wasted | rebutted reviews | by reason |`,
    "| --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.name} | ${wasteTotal(row.waste)} | ${row.rebuttedReviews} | ${wasteReasons(row.waste)} |`,
    ),
  ];
}

function quotaStopLines(waste: WasteAccounting): string[] {
  const lines = [
    `- quota stops (reported apart, not waste): ${waste.quotaStops.length}`,
  ];
  if (waste.quotaStops.length === 0) return lines;
  lines.push("- quota-stop records:");
  for (const stop of waste.quotaStops) {
    lines.push(
      `  - ${stop.record}: ${stop.role}/${stop.alias} (${stop.step} r${stop.round}) — ${stop.detail}`,
    );
  }
  return lines;
}

function wasteEntryLines(waste: WasteAccounting): string[] {
  const lines = ["- records:"];
  if (waste.entries.length === 0) lines.push("  - none");
  for (const entry of waste.entries) {
    const evidence =
      entry.evidence === entry.record ? "" : `; evidence ${entry.evidence}`;
    lines.push(
      `  - ${entry.record}: ${entry.role}/${entry.alias} (${entry.step} r${entry.round}) — ${WASTE_REASON_LABEL[entry.reason]} — ${entry.detail}${evidence}`,
    );
  }
  lines.push("- rebutted-review records (accepted tax, not waste):");
  if (waste.rebuttedReviews.length === 0) lines.push("  - none");
  for (const review of waste.rebuttedReviews) {
    lines.push(
      `  - ${review.record}: ${review.role}/${review.alias} (${review.step} r${review.round}) — changes: ${review.summary}`,
    );
  }
  return lines;
}

/** The summary's `## Waste` section: totals, reasons, every record, role/alias tables. */
export function wasteLines(
  waste: WasteAccounting,
  agentTurns: number,
  roleNames: readonly WasteGroupRow[],
  aliasNames: readonly WasteGroupRow[],
): string[] {
  return [
    `- wasted turns: ${waste.turns} of ${agentTurns} agent turns`,
    "- by reason:",
    ...WASTE_REASONS.map(
      (reason) => `  - ${WASTE_REASON_LABEL[reason]}: ${waste.counts[reason]}`,
    ),
    ...quotaStopLines(waste),
    `- rebutted reviews (accepted tax, not waste): ${waste.rebuttedReviews.length}`,
    ...wasteEntryLines(waste),
    "",
    ...wasteTable("role", roleNames),
    "",
    ...wasteTable("alias", aliasNames),
  ];
}

/** The `## Waste` section of a rendered summary, for the next consult's pack. */
export function summaryWaste(text: string): string | undefined {
  const lines = text.split("\n");
  const start = lines.indexOf("## Waste");
  if (start < 0) return undefined;
  const end = lines.findIndex(
    (line, index) => index > start && line.startsWith("## "),
  );
  const body = lines
    .slice(start + 1, end < 0 ? lines.length : end)
    .join("\n")
    .trim();
  return body === "" ? undefined : body;
}
