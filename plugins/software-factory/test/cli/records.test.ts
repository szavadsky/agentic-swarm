import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { z } from "zod";
import { dispatch } from "../../src/cli/dispatch.js";
import type { StepRecord } from "../../src/kernel/types.js";

/** A goal whose records cover every query filter and an unfinished turn. */
const FIXTURE_ROOT = path.resolve(import.meta.dir, "../fixtures/records");
const GOAL = "demo";

interface RunResult {
  code: number;
  out: string;
  err: string;
}

async function capture(run: () => Promise<number>): Promise<RunResult> {
  const logs: string[] = [];
  const errors: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };
  try {
    const code = await run();
    return { code, out: logs.join("\n"), err: errors.join("\n") };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

let repoRoot: string;

beforeAll(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "factory-records-cli-"));
  fs.mkdirSync(path.join(repoRoot, ".factory"), { recursive: true });
  // The fixture is a goal tree only; the repo points its artifact root at it.
  fs.writeFileSync(
    path.join(repoRoot, ".factory", "repo.yaml"),
    yaml.stringify({ artifactRoot: FIXTURE_ROOT }),
    "utf8",
  );
});

afterAll(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

function runRecords(args: string[] = [], goal = GOAL): Promise<RunResult> {
  return capture(() =>
    dispatch(["records", "--repo", repoRoot, "--goal", goal, ...args]),
  );
}

function parsedYaml(out: string): StepRecord[] {
  return yaml.parse(out) as StepRecord[];
}

function seqs(records: StepRecord[]): number[] {
  return records.map((record) => record.seq);
}

describe("factory records", () => {
  it("prints every record in append order as YAML, unfinished included", async () => {
    const result = await runRecords();
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
    const records = parsedYaml(result.out);
    expect(seqs(records)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const unfinished = records[5]!;
    expect(unfinished.step).toBe("qa");
    expect(unfinished.endedAt).toBeUndefined();
    expect(unfinished.ok).toBeUndefined();
    // Ingest replaces a written concern id with the record directory's id.
    expect(records[2]?.outcome?.concerns[0]?.id).toBe(
      "00003-i1-alpha-review-r1#1",
    );
  });

  it("reads legacy record history through the current shape", async () => {
    const result = await runRecords(["--json"]);
    expect(result.code).toBe(0);
    const records = JSON.parse(result.out) as StepRecord[];
    // Pre-uncap end.yaml carries the retired flag; records prints it as stored.
    expect(
      (records[0] as unknown as { packTruncated?: boolean }).packTruncated,
    ).toBe(true);
    // The store reads the retired stall action as its current spelling.
    expect(records[7]?.outcome?.stallRoutes).toEqual([
      {
        slug: "delta",
        action: "replace",
        reason: "continue with the amended task",
      },
    ]);
  });

  it("filters by step", async () => {
    const implement = await runRecords(["--step", "implement"]);
    expect(implement.code).toBe(0);
    expect(seqs(parsedYaml(implement.out))).toEqual([2, 5]);

    const missing = await runRecords(["--step", "no-such-step"]);
    expect(missing.code).toBe(0);
    expect(parsedYaml(missing.out)).toEqual([]);
  });

  it("filters by role through the flow prompt, the built-in map and the step id", async () => {
    const reviewer = await runRecords(["--role", "reviewer"]);
    expect(seqs(parsedYaml(reviewer.out))).toEqual([3]);

    // Two implement turns, one per alias: the alias is not the role.
    const implementer = await runRecords(["--role", "implementer"]);
    expect(seqs(parsedYaml(implementer.out))).toEqual([2, 5]);

    // The architect is no flow step, so the built-in role map names it.
    const architect = await runRecords(["--role", "architect"]);
    expect(seqs(parsedYaml(architect.out))).toEqual([1]);

    // A step with no role mapping answers to its own id.
    const checks = await runRecords(["--role", "checks"]);
    expect(seqs(parsedYaml(checks.out))).toEqual([7]);

    // Only the configured flow maps `resolve` to the steward prompt.
    const steward = await runRecords(["--role", "steward"]);
    expect(seqs(parsedYaml(steward.out))).toEqual([9]);
  });

  it("filters by cause kind, normalizing a legacy cause text", async () => {
    const merge = await runRecords(["--cause", "merge-failed"]);
    expect(merge.code).toBe(0);
    const merged = parsedYaml(merge.out);
    expect(seqs(merged)).toEqual([4]);
    expect(merged[0]?.cause).toEqual({
      kind: "merge-failed",
      detail: "conflict in shared.txt",
    });

    const infra = await runRecords(["--cause", "infra"]);
    expect(seqs(parsedYaml(infra.out))).toEqual([7]);

    const absent = await runRecords(["--cause", "gates"]);
    expect(parsedYaml(absent.out)).toEqual([]);
  });

  it("filters by iteration and combines with step", async () => {
    const first = await runRecords(["--iteration", "1"]);
    expect(seqs(parsedYaml(first.out))).toEqual([1, 2, 3, 4]);

    const secondImplement = await runRecords([
      "--iteration",
      "2",
      "--step",
      "implement",
    ]);
    expect(seqs(parsedYaml(secondImplement.out))).toEqual([5]);
  });

  it("prints the same selection as JSON with --json", async () => {
    const result = await runRecords(["--step", "qa", "--json"]);
    expect(result.code).toBe(0);
    const records = JSON.parse(result.out) as StepRecord[];
    expect(seqs(records)).toEqual([6]);
    expect(records[0]).toMatchObject({
      iteration: 2,
      slug: "beta",
      step: "qa",
      actor: "agent",
      alias: "qa",
    });
    expect(records[0]?.endedAt).toBeUndefined();
  });

  it("emits records the published record schema accepts", async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), "factory-records-schema-"),
    );
    try {
      const written = await capture(() => dispatch(["schemas", "--out", dir]));
      expect(written.code).toBe(0);
      const exported = JSON.parse(
        fs.readFileSync(path.join(dir, "record.schema.json"), "utf8"),
      ) as Parameters<typeof z.fromJSONSchema>[0];
      const validator = z.fromJSONSchema(exported);

      const printed = await runRecords(["--json"]);
      expect(printed.code).toBe(0);
      const records = JSON.parse(printed.out) as StepRecord[];
      const failures: string[] = [];
      for (const record of records) {
        const parsed = validator.safeParse(record);
        if (!parsed.success) {
          const issue = parsed.error.issues[0]!;
          failures.push(
            `${record.seq}: ${issue.path.join(".") || "(root)"}: ${issue.message}`,
          );
        }
      }
      expect(failures).toEqual([]);
      expect(records.length).toBe(9);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails loudly on a missing goal, an unknown cause kind and a bad iteration", async () => {
    const noGoal = await capture(() =>
      dispatch(["records", "--repo", repoRoot]),
    );
    expect(noGoal.code).toBe(1);
    expect(noGoal.err).toContain("records requires --goal <name>");

    const unknownGoal = await runRecords([], "missing");
    expect(unknownGoal.code).toBe(1);
    expect(unknownGoal.err).toContain(
      `goal "missing" has no directory at ${path.join(FIXTURE_ROOT, "missing")}`,
    );

    const unknownCause = await runRecords(["--cause", "not-a-kind"]);
    expect(unknownCause.code).toBe(1);
    expect(unknownCause.err).toContain(
      '--cause "not-a-kind" is not a cause kind',
    );

    const badIteration = await runRecords(["--iteration", "0"]);
    expect(badIteration.code).toBe(1);
    expect(badIteration.err).toContain(
      "--iteration requires a positive integer",
    );
  });

  it("documents the filters in help", async () => {
    const result = await capture(() => dispatch(["records", "--help"]));
    expect(result.code).toBe(0);
    expect(result.out).toContain(
      "factory records --repo <path> --goal <name> [--step <id>] [--role <role>]",
    );
    expect(result.out).toContain("[--cause <kind>] [--iteration <n>] [--json]");
  });
});
