import path from "node:path";
import yaml from "yaml";
import type {
  PlanArtifact,
  PlanEditsArtifact,
  AssignmentArtifact,
} from "../artifacts.js";

/**
 * Produces the atomic file set to write for a PM edits commit (§6.2, §6.3.5, §8.4, §8.6).
 *
 * Files produced:
 * 1. Edits artifact: `{taskDir}/plan/edits-{N}.yaml` or `{taskDir}/plan/edits-{N}.{k}.yaml`
 * 2. Item assignments: `{taskDir}/items/{item}/assignment.yaml` (inheriting escalate from outline)
 * 3. Epic intents: `{taskDir}/{epic}/INTENT.md` for epics scheduled in this edits artifact
 * 4. Supersede decisions: `{taskDir}/decisions/NNN-amend-remove-{slug}.yaml` for ctx.removeItemSlugs
 *    (amend path only; mirrors the item-consult split supersede mechanism so deriveItemState
 *    reports the removed items as superseded and the scheduler skips them)
 *
 * Returns file list with relative paths and string content for the engine to write and commit.
 */
export function applyEdits(
  edits: PlanEditsArtifact,
  ctx: {
    taskDir: string /* rel to wt */;
    plan: PlanArtifact;
    /** Pending-only slugs to supersede (validated by the caller; running/merged protected). */
    removeItemSlugs?: string[];
    /** Next decision sequence number; defaults to 1 (caller overrides when decisions exist). */
    nextDecisionSeq?: number;
  }
): {
  files: { path: string; content: string }[];
  items: string[];
  epics: string[];
} {
  const files: { path: string; content: string }[] = [];
  const scheduledItems: string[] = [];
  const scheduledEpics: string[] = [];

  const taskDir = ctx.taskDir ? ctx.taskDir.replace(/\\/g, "/") : ".";

  // 1. Edits artifact path
  const editsFileName =
    edits.amendmentIndex !== undefined && edits.amendmentIndex > 0
      ? `plan/edits-${edits.iteration}.${edits.amendmentIndex}.yaml`
      : `plan/edits-${edits.iteration}.yaml`;

  const editsPath = path.posix.join(taskDir, editsFileName);
  files.push({
    path: editsPath,
    content: yaml.stringify(edits),
  });

  const outlines = ctx.plan?.itemOutlines ?? [];
  const outlineMap = new Map(outlines.map((o) => [o.slug, o]));

  const epics = ctx.plan?.epics ?? [];
  const epicMap = new Map(epics.map((e) => [e.slug, e]));
  const writtenEpics = new Set<string>();

  // 2. Item assignments & matching epics
  for (const item of edits.items ?? []) {
    scheduledItems.push(item.slug);

    const matchingOutline = item.outlineRef
      ? outlineMap.get(item.outlineRef)
      : undefined;

    // Escalate flag comes from outlineRef (§8.4) if not explicitly set
    const escalate = item.escalate ?? matchingOutline?.escalate ?? false;

    const assignment: AssignmentArtifact = {
      slug: item.slug,
      kind: item.kind,
      title: item.title,
      assignment: item.assignment,
      ...(item.outlineRef ? { outlineRef: item.outlineRef } : {}),
      ...(item.milestone ? { milestone: item.milestone } : {}),
      ...(item.wave !== undefined ? { wave: item.wave } : {}),
      ...(item.deps && item.deps.length > 0 ? { deps: item.deps } : {}),
      ...(item.scenarioRefs && item.scenarioRefs.length > 0
        ? { scenarioRefs: item.scenarioRefs }
        : {}),
      ...(item.citations && item.citations.length > 0
        ? { citations: item.citations }
        : {}),
      ...(escalate ? { escalate: true } : {}),
    };

    const assignmentPath = path.posix.join(
      taskDir,
      "items",
      item.slug,
      "assignment.yaml"
    );

    files.push({
      path: assignmentPath,
      content: yaml.stringify(assignment),
    });

    // Check if this item is or references an epic (§8.6)
    let matchingEpic = epicMap.get(item.slug);
    if (!matchingEpic && item.outlineRef) {
      matchingEpic = epicMap.get(item.outlineRef);
    }

    if (matchingEpic && !writtenEpics.has(matchingEpic.slug)) {
      writtenEpics.add(matchingEpic.slug);
      scheduledEpics.push(matchingEpic.slug);

      const epicIntentPath = path.posix.join(
        taskDir,
        matchingEpic.slug,
        "INTENT.md"
      );

      files.push({
        path: epicIntentPath,
        content: matchingEpic.intent,
      });
    }
  }

  // 4. Supersede decisions for removed pending items (amend path only).
  // A `split` decision with no outlines supersedes the item exactly like an
  // item-consult split: deriveItemState maps it to status superseded while
  // afterRecord stays undefined (nothing ran yet), so the fresh-series logic
  // keeps it terminal and the scheduler skips it.
  const removals = ctx.removeItemSlugs ?? [];
  let decisionSeq = ctx.nextDecisionSeq ?? 1;
  for (const slug of removals) {
    const decisionFileName = `${String(decisionSeq).padStart(3, "0")}-amend-remove-${slug}.yaml`;
    decisionSeq++;
    files.push({
      path: path.posix.join(taskDir, "decisions", decisionFileName),
      content: yaml.stringify({
        id: `decision-amend-remove-${slug}`,
        context: "wave",
        item: slug,
        decision: "split",
        rationale: `Amendment removed pending item ${slug}`,
        timestamp: new Date().toISOString(),
      }),
    });
  }

  return {
    files,
    items: scheduledItems,
    epics: scheduledEpics,
  };
}
