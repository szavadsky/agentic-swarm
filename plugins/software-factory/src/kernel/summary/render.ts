/** The summary head and metrics lines. */

import { wasteLines } from "../waste-summary.js";
import type { SummaryRender } from "./types.js";
import {
  architectLines,
  askRecoveryLine,
  budgetLines,
  costByRoleLines,
  decisionLines,
  frictionLines,
  incidentLines,
  launchTable,
  listLine,
  orNone,
  parkLines,
  parkedCauseLines,
  perMergedCost,
  qaCatchLines,
  sourceCostText,
  spendTable,
  steerLines,
  zeroEditLine,
  zeroEditParkLine,
} from "./tables.js";

/** The summary's distance through remarkable sections. */
export function summaryHeadLines(render: SummaryRender): string[] {
  const { facts, remarks, computed } = render;
  return [
    `# Iteration ${render.iteration} summary`,
    "",
    `status: ${render.status}`,
    ...decisionLines(render.decision),
    "",
    "## Distance",
    listLine(`pending (${facts.pending.length})`, facts.pending),
    listLine(`parks (${facts.parks.length})`, facts.parks),
    ...render.distanceDebt,
    "",
    ...architectLines(render.architect, computed.planReviewMarks),
    "",
    "## Assumptions",
    ...(remarks.assumed.length ? remarks.assumed : ["- none recorded"]),
    "",
    "## Outcome",
    listLine("merged", facts.merged),
    listLine("spikes finished", facts.finished),
    listLine("pending", facts.pending),
    listLine("cancelled", facts.cancelled),
    listLine("quarantined", computed.quarantined),
    "",
    "## Base gates",
    ...render.baseLines,
    "",
    "## Parked by root cause",
    ...parkedCauseLines(facts.parkedByKind),
    "",
    "## Debt opened",
    ...orNone(remarks.debtOpened),
    "",
    "## Debt closed",
    ...orNone(remarks.debtClosed),
    "",
    "## Owner attention",
    ...orNone([...remarks.ownerRemarkable, ...remarks.unanswered]),
    "",
    "## Remarkable",
    ...orNone(remarks.remarks.map((r) => `- ${r}`)),
    "",
  ];
}

/** The metrics block: spend, work and the park, steer and incident counts. */
function metricLines(render: SummaryRender): string[] {
  const computed = render.computed;
  const { usage, unpricedTurns, incidents, loopIncidents } = computed;
  const architectShare = `${(computed.architect.turnShare * 100).toFixed(1)}%`;
  return [
    "## Metrics",
    `- turns: ${render.agentTurns} agent, ${render.scriptTurns} script; architect share ${architectShare}`,
    `- tokens: input ${usage.in}, cached ${usage.cacheRead}, output ${usage.out}, reasoning ${usage.reasoningOut}`,
    `- harness-reported cost: ${sourceCostText(usage.harnessCostUsd, unpricedTurns)}`,
    `- list-price estimate: ${sourceCostText(usage.listCostUsd, unpricedTurns)}`,
    `- unpriced turns: ${unpricedTurns}`,
    ...costByRoleLines(render.named.roleNames),
    `- cost per merged task: harness-reported ${perMergedCost(computed.harnessCostPerMergedTask, unpricedTurns)}; list-price estimate ${perMergedCost(computed.listCostPerMergedTask, unpricedTurns)}`,
    `- work: ${computed.edits} files (+${computed.addedLines}/-${computed.removedLines}), ${computed.testRuns} test runs in ${computed.gateRuns} gate runs`,
    zeroEditLine(computed.zeroEdit),
    zeroEditParkLine(computed.zeroEditParks),
    askRecoveryLine(computed.askRecoveries),
    ...qaCatchLines(computed.qaCatches),
    `- gate wall: ${(computed.gateWallMs / 1000).toFixed(1)}s gates, ${(computed.commitWallMs / 1000).toFixed(1)}s commits`,
    `- operator acts: ${computed.operatorActs} (${computed.humanInterventions} steers)`,
    ...budgetLines(render.budgetStop, unpricedTurns),
    `- merged: ${render.facts.merged.length}; parked: ${[...render.facts.parkedByKind.values()].flat().length}; pending: ${render.facts.pending.length}`,
    "",
    "## Incidents",
    ...incidentLines(incidents, loopIncidents),
    "",
    "## Parks",
    ...parkLines(computed.parks),
    "",
    "## Steers",
    ...steerLines(render.steers),
    "",
    "## Friction",
    ...frictionLines(computed.friction),
    "",
  ];
}

/** The summary's metrics, incidents, waste and launch/spend tables. */
export function summaryMetricsLines(render: SummaryRender): string[] {
  return [
    ...metricLines(render),
    "## Waste",
    ...wasteLines(
      render.computed.waste,
      render.agentTurns,
      render.named.roleNames,
      render.named.aliasNames,
    ),
    "",
    "## Launches by role",
    ...launchTable("role", render.named.roleNames),
    "",
    "## Launches by alias",
    ...launchTable("alias", render.named.aliasNames),
    "",
    "## Spend by role",
    ...spendTable("role", render.named.roleNames),
    "",
    "## Spend by alias",
    ...spendTable("alias", render.named.aliasNames),
    "",
    "## Spend by model",
    ...spendTable("model", render.named.modelNames),
    "",
  ];
}
