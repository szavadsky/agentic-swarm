import fs from "node:fs";
import path from "node:path";
import {
  aggregateConcerns,
  listConcerns,
  type ConcernInput,
  type ConcernWriteContext,
} from "../concerns.js";
import type {
  RemarkableDecision,
  SteerItemArtifact,
  StoredConcernArtifact,
} from "../artifacts.js";
import { readYaml } from "../records/io.js";
import { writeQuestion } from "../steer.js";

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

const VERBATIM_BYTES = 120;
const CONDENSED_CAP_BYTES = 500;
const utf8Bytes = (text: string) => Buffer.byteLength(text, "utf8");

/** Cuts `text` to at most `maxBytes` without splitting a code point. */
function truncateUtf8(text: string, maxBytes: number): string {
  let out = "";
  let bytes = 0;
  for (const char of text) {
    const size = utf8Bytes(char);
    if (bytes + size > maxBytes) break;
    out += char;
    bytes += size;
  }
  return out;
}

/** Keeps small payloads verbatim; otherwise halves them under the 500-byte cap. */
function condenseText(text: string): string {
  const size = utf8Bytes(text);
  return size <= VERBATIM_BYTES
    ? text
    : truncateUtf8(text, Math.min(CONDENSED_CAP_BYTES, Math.floor(size / 2)));
}

type ChildRemarkable = RemarkableDecision & {
  id: string;
  status?: string;
  source?: { record?: string; agent?: string };
};

async function readOpenRemarkables(childTaskDir: string): Promise<ChildRemarkable[]> {
  const dir = path.join(childTaskDir, "concerns");
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch (err: any) {
    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return [];
    throw err;
  }
  const records = await Promise.all(
    names
      .filter((name) => name.startsWith("rm-") && name.endsWith(".yaml"))
      .sort()
      .map(async (name) => {
        try {
          return await readYaml<ChildRemarkable>(path.join(dir, name));
        } catch {
          return undefined;
        }
      })
  );
  return records.filter(
    (r): r is ChildRemarkable =>
      r?.status === "open" &&
      typeof r.id === "string" &&
      typeof r.chosen === "string" &&
      Array.isArray(r.alternatives) &&
      typeof r.why === "string"
  );
}

async function forwardBlockedQuestions(opts: PropagateEpicConcernsOptions): Promise<void> {
  const dir = path.join(opts.childTaskDir, "steer", "tousertoreview");
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch (err: any) {
    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return;
    throw err;
  }
  const parentTaskSlug = path.basename(opts.parentTaskDir);
  for (const name of names.filter((n) => n.endsWith(".yaml")).sort()) {
    let question: SteerItemArtifact & { blocks?: string[] };
    try {
      question = await readYaml(path.join(dir, name));
    } catch {
      continue;
    }
    if (question?.status !== "open" || !question.blocks?.length) continue;
    await writeQuestion(opts.parentWt, opts.parentTaskDir, {
      id: `q-epic-${opts.epic}-${question.id.replace(/^q-/, "")}`,
      ref: question.ref,
      disposition: question.disposition,
      question: question.question,
      blocks: [
        ...new Set(
          question.blocks.map((block) => (block === "task" ? parentTaskSlug : opts.epic))
        ),
      ],
      ...(question.draftDecision ? { draftDecision: question.draftDecision } : {}),
      ...(question.createdAt ? { createdAt: question.createdAt } : {}),
    });
  }
}

/** Groups records by their child record so each copy keeps its own source. */
function byRecord<T>(items: T[], recordOf: (item: T) => string | undefined): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const record = recordOf(item) ?? "unknown";
    groups.set(record, [...(groups.get(record) ?? []), item]);
  }
  return groups;
}

function concernCopy(concern: StoredConcernArtifact, epic: string): ConcernInput {
  return {
    kind: concern.kind,
    summary: `[epic] ${concern.summary}`,
    detail: condenseText(concern.detail ?? concern.summary),
    severity: concern.severity,
    ...(concern.location ? { location: concern.location } : {}),
    ...(concern.affects ? { affects: concern.affects } : {}),
  };
}

export async function propagateEpicConcerns(
  opts: PropagateEpicConcernsOptions
): Promise<void> {
  const { childTaskDir, parentTaskDir, parentWt, epic } = opts;
  const concerns = (await listConcerns(childTaskDir)).filter(
    (concern) => concern.status === "open" || concern.status === "routed"
  );
  const remarkables = await readOpenRemarkables(childTaskDir);
  const ctx: ConcernWriteContext = { taskDir: parentTaskDir, taskWt: parentWt };

  for (const [record, group] of byRecord(concerns, (c) => c.source?.record)) {
    const source = { epic, record: `epic:${epic}/${record}`, agent: group[0]?.source?.agent ?? "unknown" };
    await aggregateConcerns({ ...ctx, source }, group.map((c) => concernCopy(c, epic)), [], {
      commit: false,
    });
  }

  for (const [record, group] of byRecord(remarkables, (r) => r.source?.record)) {
    const source = { epic, record: `epic:${epic}/${record}`, agent: group[0]?.source?.agent ?? "unknown" };
    const copies: RemarkableDecision[] = group.map((r) => ({
      chosen: `[epic] ${r.chosen}`,
      alternatives: r.alternatives,
      why: condenseText(r.why),
    }));
    await aggregateConcerns({ ...ctx, source }, [], copies, { commit: false });
  }

  await forwardBlockedQuestions(opts);
}
