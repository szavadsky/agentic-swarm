import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateFile } from "../src/cli/commands.js";
import { loadConfigs, packageRoot } from "../src/kernel/config.js";
import { outcomeExampleVar } from "../src/kernel/outcome-example.js";
import {
  expectationForStep,
  type OutcomeExpectation,
} from "../src/kernel/outcome.js";
import { dryRunPrompts } from "../src/kernel/prompt-dry-run.js";
import { qaOutcomeSchema } from "../src/kernel/qa.js";
import { outcomeSchema } from "../src/kernel/types.js";
import {
  outcomeBlocks,
  writeRecordOutcome,
} from "./kernel/outcome-fixtures.js";

function schemaFor(expectation: OutcomeExpectation) {
  return expectation === "qa" ? qaOutcomeSchema : outcomeSchema;
}

describe("prompts: outcome repair examples", () => {
  it("shows the owner's example in the repair and unfinished asks", async () => {
    const configs = loadConfigs(packageRoot);
    const renders = new Map(
      dryRunPrompts(configs, packageRoot).map((render) => [
        render.name,
        render.text,
      ]),
    );
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompts-repairs-"));
    try {
      const cases: [name: string, prompt: string, step: string][] = [
        ["architect-repair", "architect", "architect"],
        ["unfinished-turn", "implementer", "implement"],
      ];
      for (const [name, prompt, step] of cases) {
        const text = renders.get(name);
        expect(text, `dry-run has no render for ${name}`).toBeDefined();
        const expectation = expectationForStep(step, configs.process.flows);
        // The repair ask shows the same example as the first ask, not the
        // shared `any` example that drops the step's gated field.
        expect(text).toContain(
          outcomeExampleVar(prompt, expectation, schemaFor(expectation)),
        );
        const blocks = outcomeBlocks(text!);
        expect(blocks, `${name} examples`).toHaveLength(2);
        for (const [index, block] of blocks.entries()) {
          const file = writeRecordOutcome(
            root,
            `${name}-${index}`,
            step,
            block,
          );
          const result = await validateFile(file, {
            step,
            repo: packageRoot,
          });
          expect(result.findings, `${name} example ${index}`).toEqual([]);
        }
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
