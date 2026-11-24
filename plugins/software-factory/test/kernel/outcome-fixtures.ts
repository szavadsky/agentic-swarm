import fs from "node:fs";
import path from "node:path";

/** Every fenced YAML block body, in order. */
export function fencedYamlBlocks(text: string): string[] {
  return [...text.matchAll(/```ya?ml\n([\s\S]*?)```/g)].map(
    (match) => match[1]!,
  );
}

/** The outcome examples of a render: fenced blocks that start with `status`. */
export function outcomeBlocks(text: string): string[] {
  return fencedYamlBlocks(text).filter((block) => /^status:/m.test(block));
}

/**
 * Writes one outcome into a fresh records tree: a sibling record and this
 * record's started.yaml, the layout a turn validates in.
 */
export function writeRecordOutcome(
  root: string,
  group: string,
  step: string,
  block: string,
): string {
  const records = path.join(root, group, "artifacts", "demo", "records");
  const sibling = path.join(records, "00001-i1-alpha-review-r1");
  fs.mkdirSync(sibling, { recursive: true });
  fs.writeFileSync(
    path.join(sibling, "started.yaml"),
    "seq: 1\niteration: 1\nstep: review\nround: 1\nactor: agent\n",
  );
  fs.writeFileSync(
    path.join(sibling, "outcome.yaml"),
    "status: done\nsummary: seed\nverdict: approve\nconcerns: [{kind: debt, calibration: architect, text: shim in the writer}]\n",
  );
  const record = path.join(records, `00002-i1-alpha-${step}-r1`);
  fs.mkdirSync(record, { recursive: true });
  fs.writeFileSync(
    path.join(record, "started.yaml"),
    `seq: 2\niteration: 1\nstep: ${step}\nround: 1\nactor: agent\n`,
  );
  const file = path.join(record, "outcome.yaml");
  fs.writeFileSync(file, block);
  return file;
}
