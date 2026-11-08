/**
 * Spike: funnel byte budget (adr-funnel-text-budget).
 *
 * Research question: what does "every level passes up less detail and never
 * more text than the code it summarizes" mean in bytes, and where is it
 * enforced? This is a finding-only spike: no production code is added here.
 * The helpers below are the executable form of the contract that
 * `funnel-closeups` must implement.
 *
 * Findings encoded by this suite:
 * - The unit is UTF-8 bytes (`Buffer.byteLength`), never JS string length.
 * - Code steps get `min(diffBytes, 2000)`: item review summarizes the item
 *   diff; wave/plan close-ups summarize the aggregated wave diff.
 * - Zero-diff orchestration steps get `min(plan/context inputBytes, 500)`.
 * - There is no 500-byte floor: a 320-byte diff or input yields a 320-byte
 *   budget, never 500.
 * - Reviewer/architect/close-up condensing must emit strictly fewer bytes than
 *   it received.
 * - Caps apply to hydrated `promptVars` only. Stored concern artifacts keep
 *   their full detail, and prompt rendering preserves the variable verbatim.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { createTmpRepo, type TmpRepo } from "../helpers/tmp-repo.js";
import { git } from "../../src/core/git/exec.js";
import { loadPromptLibrary } from "../../src/core/prompts.js";
import { writeYamlAtomic, readYaml } from "../../src/core/records/io.js";

const CODE_DIFF_CAP_BYTES = 2000;
const ZERO_DIFF_INPUT_CAP_BYTES = 500;

interface HydrationBudget {
  source: "code-diff" | "zero-diff-orchestration";
  inputBytes: number;
  capBytes: number;
}

interface MeasuredDiff {
  text: string;
  bytes: number;
}

interface SpikeConcern {
  id: string;
  kind: "tech-debt" | "risk" | "question";
  severity: "low" | "medium" | "high";
  summary: string;
  detail: string;
  affects: string[];
}

function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/**
 * Per-level budget: a code step is capped by the code it summarizes; a
 * zero-diff orchestration step is capped by its plan/context input instead.
 */
function hydrationBudget(
  diffBytes: number,
  orchestrationInputBytes: number
): HydrationBudget {
  if (diffBytes > 0) {
    return {
      source: "code-diff",
      inputBytes: diffBytes,
      capBytes: Math.min(diffBytes, CODE_DIFF_CAP_BYTES),
    };
  }
  return {
    source: "zero-diff-orchestration",
    inputBytes: orchestrationInputBytes,
    capBytes: Math.min(orchestrationInputBytes, ZERO_DIFF_INPUT_CAP_BYTES),
  };
}

/**
 * Byte-safe truncation: cap in UTF-8 bytes and never split a multi-byte code
 * point (splitting would decode to U+FFFD).
 */
function truncateUtf8(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  let end = maxBytes;
  while (end > 0 && (buf[end]! & 0b1100_0000) === 0b1000_0000) {
    end--;
  }
  return buf.subarray(0, end).toString("utf8");
}

/** Asserts the hydrated prompt variable stays within its byte budget. */
function assertWithinBudget(
  hydrated: string,
  budget: HydrationBudget,
  label = "hydrated concernsYaml"
): void {
  const bytes = utf8Bytes(hydrated);
  if (bytes > budget.capBytes) {
    throw new Error(
      `${label} is ${bytes} bytes, over its ${budget.capBytes}-byte cap ` +
        `(source=${budget.source}, input=${budget.inputBytes})`
    );
  }
}

/** Asserts a funnel level forwarded strictly less text than it received. */
function assertStrictlyCondensed(input: string, output: string): void {
  const inputBytes = utf8Bytes(input);
  const outputBytes = utf8Bytes(output);
  if (outputBytes >= inputBytes) {
    throw new Error(
      `funnel level did not condense: output ${outputBytes} bytes >= input ${inputBytes} bytes`
    );
  }
}

/**
 * Hydration representation the close-ups receive: terse concern fields
 * (id/kind/severity/summary/affects), never the bulky detail. If the terse
 * form still exceeds the budget, it is byte-truncated — the engine cap is a
 * hard ceiling, not a formatting suggestion.
 */
function renderHydratedConcernsYaml(
  concerns: SpikeConcern[],
  capBytes: number
): string {
  const terse = concerns.map(({ id, kind, severity, summary, affects }) => ({
    id,
    kind,
    severity,
    summary,
    affects,
  }));
  return truncateUtf8(yaml.stringify(terse), capBytes);
}

/**
 * Test-local stand-in for one funnel level: keep the first half of the bytes.
 * The ADR only requires strict shrinkage; the ratio is an implementation choice.
 */
function condenseForNextLevel(text: string): string {
  return truncateUtf8(text, Math.floor(utf8Bytes(text) / 2));
}

function makeConcernsWithDetailBytes(
  totalDetailBytes: number,
  summaryBytes = 240,
  count = 3
): SpikeConcern[] {
  const perConcern = Math.floor(totalDetailBytes / count);
  const remainder = totalDetailBytes - perConcern * count;
  const kinds: SpikeConcern["kind"][] = ["tech-debt", "risk", "question"];
  return Array.from({ length: count }, (_, index) => ({
    id: `c-${String(index + 1).padStart(10, "0")}`,
    kind: kinds[index % kinds.length]!,
    severity: "medium",
    summary: "s".repeat(summaryBytes),
    detail: "d".repeat(perConcern + (index === count - 1 ? remainder : 0)),
    affects: ["item-a"],
  }));
}

/** Builds a JSON string (as used for plan hydration) of exactly `targetBytes`. */
function makeJsonOfExactBytes(targetBytes: number): string {
  const probe = JSON.stringify({ plan: { summary: "" } }, null, 2);
  const overhead = utf8Bytes(probe);
  const text = JSON.stringify(
    { plan: { summary: "p".repeat(targetBytes - overhead) } },
    null,
    2
  );
  if (utf8Bytes(text) !== targetBytes) {
    throw new Error(
      `failed to build ${targetBytes}-byte JSON fixture (got ${utf8Bytes(text)})`
    );
  }
  return text;
}

/** Writes a file containing exactly `bytes` UTF-8 bytes (single ASCII line). */
function writeExactBytesFile(
  dir: string,
  relPath: string,
  bytes: number
): void {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${"x".repeat(bytes - 1)}\n`, "utf8");
}

/**
 * Creates a branch off `main` whose committed diff is exactly `targetBytes`
 * when measured the way the engine sees it (`git()` trims one trailing
 * newline). Content length is linear in patch size, so calibration converges
 * in one adjustment; the loop guards against incidental git header changes.
 */
function addBranchWithExactDiff(
  repo: TmpRepo,
  branch: string,
  file: string,
  targetBytes: number
): MeasuredDiff {
  repo.git(["checkout", "main"]);
  repo.git(["checkout", "-b", branch]);

  let contentBytes = Math.max(1, targetBytes - 128);
  let stagedDiff = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    writeExactBytesFile(repo.dir, file, contentBytes);
    repo.git(["add", "--", file]);
    stagedDiff = repo.git(["diff", "--cached"]).stdout;
    const measured = utf8Bytes(stagedDiff);
    if (measured === targetBytes) break;
    contentBytes += targetBytes - measured;
    if (contentBytes < 1) {
      throw new Error(`cannot calibrate ${branch} diff to ${targetBytes} bytes`);
    }
    if (attempt === 5) {
      throw new Error(
        `calibration for ${branch} did not converge: ${measured} != ${targetBytes}`
      );
    }
  }

  repo.commit(`add ${file}`);
  const committedDiff = repo.git(["diff", "main", "HEAD"]).stdout;
  const bytes = utf8Bytes(committedDiff);
  if (bytes !== targetBytes) {
    throw new Error(
      `committed diff for ${branch} is ${bytes} bytes, expected ${targetBytes}`
    );
  }
  return { text: committedDiff, bytes };
}

describe("Spike: funnel byte budget (adr-funnel-text-budget)", () => {
  describe("byte-unit assumptions", () => {
    it("counts UTF-8 bytes, not JS string characters", () => {
      const text = "漢字🙂".repeat(100);
      expect(text.length).toBe(400); // 🙂 counts as two UTF-16 code units
      expect([...text].length).toBe(300);
      expect(utf8Bytes(text)).toBe(1000);
      expect(utf8Bytes(text)).toBeGreaterThan(text.length);
    });

    it("truncates at a UTF-8 byte boundary without splitting code points", () => {
      const text = "漢字🙂".repeat(100);

      const exact = truncateUtf8(text, 500);
      expect(utf8Bytes(exact)).toBeLessThanOrEqual(500);
      expect(exact).not.toContain("\uFFFD");
      expect([...exact].length).toBe(150); // 500 bytes = 50 three-code-point groups
      expect(exact.length).toBe(200); // UTF-16 code units

      const midCodePoint = truncateUtf8(text, 499);
      expect(utf8Bytes(midCodePoint)).toBeLessThanOrEqual(499);
      expect(midCodePoint).not.toContain("\uFFFD");

      expect(truncateUtf8(text, 0)).toBe("");
      expect(truncateUtf8(text, 1)).toBe("");
      expect(truncateUtf8("abc", 2)).toBe("ab");
    });
  });

  describe("measured git diff budgets", () => {
    let repo: TmpRepo;
    let itemDiffs: MeasuredDiff[];
    let waveDiff: MeasuredDiff;

    beforeAll(() => {
      repo = createTmpRepo();
      // 2499 + 2500 + one inter-file patch newline = 5000 bytes aggregate.
      itemDiffs = [
        addBranchWithExactDiff(repo, "item-a", "a.txt", 2499),
        addBranchWithExactDiff(repo, "item-b", "b.txt", 2500),
      ];
      repo.git(["checkout", "main"]);
      repo.git(["checkout", "-b", "wave"]);
      repo.git(["merge", "--no-ff", "-m", "merge item-a", "item-a"]);
      repo.git(["merge", "--no-ff", "-m", "merge item-b", "item-b"]);
      const text = repo.git(["diff", "main", "HEAD"]).stdout;
      waveDiff = { text, bytes: utf8Bytes(text) };
    });

    afterAll(() => {
      repo.cleanup();
    });

    it("measures a 5000-byte wave diff as the aggregation of item diffs", async () => {
      expect(waveDiff.bytes).toBe(5000);
      // `git()` trims the final newline only, so the two item patches keep the
      // newline that separates them in the aggregate patch.
      expect(waveDiff.bytes).toBe(
        itemDiffs[0]!.bytes + itemDiffs[1]!.bytes + 1
      );
      expect(itemDiffs[0]!.text.length).toBeGreaterThan(0);
      expect(itemDiffs[1]!.text.length).toBeGreaterThan(0);

      // The engine reads diffs through the hardened git() wrapper; it must see
      // the same UTF-8 text the fixture measured.
      const engineView = await git(repo.dir, ["diff", "main", "HEAD"]);
      expect(engineView.code).toBe(0);
      expect(engineView.stdout).toBe(waveDiff.text);
      expect(utf8Bytes(engineView.stdout)).toBe(5000);
    });

    it("caps item review hydration at min(item diff, 2000) bytes", () => {
      const itemDiff = itemDiffs[0]!;
      const budget = hydrationBudget(itemDiff.bytes, 0);
      expect(budget.source).toBe("code-diff");
      expect(budget.inputBytes).toBe(itemDiff.bytes);
      expect(budget.capBytes).toBe(Math.min(itemDiff.bytes, 2000));

      const concerns = makeConcernsWithDetailBytes(3000);
      const raw = yaml.stringify(concerns);
      const hydrated = renderHydratedConcernsYaml(concerns, budget.capBytes);

      // Failure-detection control: the uncapped artifact is over budget.
      expect(utf8Bytes(raw)).toBeGreaterThan(budget.capBytes);
      expect(() => assertWithinBudget(raw, budget)).toThrow();

      assertWithinBudget(hydrated, budget);
      expect(utf8Bytes(hydrated)).toBeLessThan(itemDiff.bytes);
      expect(utf8Bytes(hydrated)).toBeLessThan(utf8Bytes(raw));
    });

    it("caps wave close-up hydration: 5000-byte diff + 3000-byte concerns => <= 2000 and < diff", () => {
      const budget = hydrationBudget(waveDiff.bytes, 4000);
      expect(budget.source).toBe("code-diff");
      expect(budget.capBytes).toBe(2000);

      const concerns = makeConcernsWithDetailBytes(3000);
      const detailBytes = concerns.reduce(
        (total, concern) => total + utf8Bytes(concern.detail),
        0
      );
      expect(detailBytes).toBe(3000);

      const raw = yaml.stringify(concerns);
      const hydrated = renderHydratedConcernsYaml(concerns, budget.capBytes);

      expect(utf8Bytes(raw)).toBeGreaterThan(2000);
      expect(() => assertWithinBudget(raw, budget)).toThrow();

      expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(2000);
      expect(utf8Bytes(hydrated)).toBeLessThan(waveDiff.bytes);
      assertWithinBudget(hydrated, budget);
    });

    it("does not apply a 500-byte floor to a small code diff", () => {
      const smallDiffBytes = 320;
      const budget = hydrationBudget(smallDiffBytes, 0);
      expect(budget.capBytes).toBe(320);
      expect(budget.capBytes).toBeLessThan(ZERO_DIFF_INPUT_CAP_BYTES);
      expect(budget.capBytes).toBeLessThanOrEqual(budget.inputBytes);

      const concerns = makeConcernsWithDetailBytes(3000);
      const hydrated = renderHydratedConcernsYaml(concerns, budget.capBytes);
      assertWithinBudget(hydrated, budget);
      expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(smallDiffBytes);
    });
  });

  describe("zero-diff orchestration budgets", () => {
    it("caps plan-review hydration: 4000-byte input => <= 500 and < input", () => {
      const planInput = makeJsonOfExactBytes(4000);
      expect(utf8Bytes(planInput)).toBe(4000);

      const budget = hydrationBudget(0, utf8Bytes(planInput));
      expect(budget.source).toBe("zero-diff-orchestration");
      expect(budget.inputBytes).toBe(4000);
      expect(budget.capBytes).toBe(500);

      const concerns = makeConcernsWithDetailBytes(3000);
      const raw = yaml.stringify(concerns);
      const hydrated = renderHydratedConcernsYaml(concerns, budget.capBytes);

      expect(utf8Bytes(raw)).toBeGreaterThan(budget.capBytes);
      expect(() => assertWithinBudget(raw, budget)).toThrow();

      expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(500);
      expect(utf8Bytes(hydrated)).toBeLessThan(4000);
      assertWithinBudget(hydrated, budget);
    });

    it("does not floor a small zero-diff input to 500 bytes", () => {
      const budget = hydrationBudget(0, 350);
      expect(budget.source).toBe("zero-diff-orchestration");
      expect(budget.inputBytes).toBe(350);
      expect(budget.capBytes).toBe(350);
      expect(budget.capBytes).toBeLessThan(ZERO_DIFF_INPUT_CAP_BYTES);

      const concerns = makeConcernsWithDetailBytes(900);
      const hydrated = renderHydratedConcernsYaml(concerns, budget.capBytes);
      assertWithinBudget(hydrated, budget);
      expect(utf8Bytes(hydrated)).toBeLessThanOrEqual(350);

      // An empty input can only produce an empty hydration; nothing may exceed it.
      const empty = hydrationBudget(0, 0);
      expect(empty.capBytes).toBe(0);
      expect(renderHydratedConcernsYaml(concerns, empty.capBytes)).toBe("");
    });
  });

  describe("funnel condensation", () => {
    it("reviewer/architect/close-up condensing always forwards fewer bytes", () => {
      const workerDetail = "w".repeat(3000);
      const reviewer = condenseForNextLevel(workerDetail);
      const architect = condenseForNextLevel(reviewer);
      const closeUp = condenseForNextLevel(architect);

      assertStrictlyCondensed(workerDetail, reviewer);
      assertStrictlyCondensed(reviewer, architect);
      assertStrictlyCondensed(architect, closeUp);

      expect(utf8Bytes(reviewer)).toBeLessThan(utf8Bytes(workerDetail));
      expect(utf8Bytes(architect)).toBeLessThan(utf8Bytes(reviewer));
      expect(utf8Bytes(closeUp)).toBeLessThan(utf8Bytes(architect));

      // Failure-detection control: a pass-through is rejected at every level.
      expect(() => assertStrictlyCondensed(workerDetail, workerDetail)).toThrow();
      expect(() => assertStrictlyCondensed(reviewer, reviewer)).toThrow();
    });

    it("condenses concern detail without touching stored artifacts", async () => {
      const concerns = makeConcernsWithDetailBytes(3000);
      const concernsDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "funnel-concerns-")
      );
      try {
        const artifactPath = path.join(concernsDir, `${concerns[0]!.id}.yaml`);
        await writeYamlAtomic(artifactPath, concerns[0]!);

        // Reviewer-level hydration drops the 1000-byte detail field.
        const hydrated = renderHydratedConcernsYaml([concerns[0]!], 2000);
        assertStrictlyCondensed(concerns[0]!.detail, hydrated);

        const stored = await readYaml<SpikeConcern>(artifactPath);
        expect(stored.detail).toBe(concerns[0]!.detail);
        expect(utf8Bytes(stored.detail)).toBe(1000);
      } finally {
        fs.rmSync(concernsDir, { recursive: true, force: true });
      }
    });
  });

  describe("hydration boundary", () => {
    it("renders prompt vars verbatim: caps must be applied before render", () => {
      const overridesDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "funnel-prompt-")
      );
      try {
        fs.mkdirSync(path.join(overridesDir, "steps"), { recursive: true });
        fs.writeFileSync(
          path.join(overridesDir, "steps", "funnel-probe.md"),
          "concerns:\n{{concernsYaml}}\n",
          "utf8"
        );
        const prompts = loadPromptLibrary({
          builtinDir: path.resolve(import.meta.dir, "../../agents"),
          overrideDirs: [overridesDir],
        });

        const payload = "p".repeat(2000);
        const rendered = prompts.render("steps/funnel-probe", {
          concernsYaml: payload,
        });

        expect(rendered).toContain(payload);
        expect(utf8Bytes(rendered)).toBeGreaterThanOrEqual(2000);
      } finally {
        fs.rmSync(overridesDir, { recursive: true, force: true });
      }
    });
  });
});
