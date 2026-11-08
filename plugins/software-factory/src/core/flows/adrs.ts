import fs from "node:fs";
import path from "node:path";
import type { PipelineConfig, PlanAdr } from "../artifacts.js";
import { writeTextAtomic } from "../records/io.js";
import { writeQuestion } from "../steer.js";

/**
 * Human disposition a blocking ADR raises under the active involvement mode
 * (§18 blocking table). Blocking ADRs always park the task; the mode only
 * selects whether the operator is stopped (`autonomous`) or consulted
 * asynchronously (`principal`/`detailed`). Remarkable ADRs never reach this
 * table: they are digest-only `human-awareness` entries.
 */
export function blockingAdrDisposition(
  mode: PipelineConfig["humanInvolvement"]
): "human-stop" | "human-async" {
  return mode === "principal" || mode === "detailed" ? "human-async" : "human-stop";
}

/** Renders the complete ADR markdown record (§8.4.2, td-adr-md-truncated). */
export function renderAdrMarkdown(adr: PlanAdr): string {
  const blocking = adr.blocking === true;
  return [
    `# ${adr.title}`,
    "## Context",
    adr.context,
    "## Decision",
    adr.decision,
    "## Consequences",
    adr.consequences?.trim() || "Not recorded.",
    "## Blocking",
    blocking
      ? "true — needs a human decision per the active human-involvement mode."
      : "false — remarkable; reported in the digest and never waits.",
    "",
  ].join("\n\n");
}

/**
 * Persists each ADR as full markdown and routes it through the human mailbox:
 * blocking ADRs raise a task-blocking question under the mode's disposition,
 * remarkable ADRs a digest-only `human-awareness` entry with no blocks.
 * Markdown is written only when `adrFolder` is configured; mailbox routing
 * always runs so the safety signal is never dropped (§18).
 */
export async function persistAdrs(opts: {
  taskWt: string;
  taskDir: string;
  adrFolder?: string;
  adrs: PlanAdr[];
  mode: PipelineConfig["humanInvolvement"];
}): Promise<void> {
  if (opts.adrs.length === 0) return;
  const adrDir = opts.adrFolder ? path.join(opts.taskWt, opts.adrFolder) : undefined;
  if (adrDir) await fs.promises.mkdir(adrDir, { recursive: true });
  for (const adr of opts.adrs) {
    if (adrDir) {
      const safeId = adr.id.replace(/[^a-z0-9_-]/gi, "-");
      await writeTextAtomic(path.join(adrDir, `${safeId}.md`), renderAdrMarkdown(adr));
    }
    const blocking = adr.blocking === true;
    await writeQuestion(opts.taskWt, opts.taskDir, {
      ref: adr.id,
      disposition: blocking ? blockingAdrDisposition(opts.mode) : "human-awareness",
      question: blocking
        ? `Blocking architectural decision ${adr.id} (${adr.title}) needs a human decision.`
        : `Remarkable architectural decision ${adr.id} (${adr.title}) recorded for awareness.`,
      draftDecision: adr.decision,
      ...(blocking ? { blocks: ["task"] } : {}),
    });
  }
}
