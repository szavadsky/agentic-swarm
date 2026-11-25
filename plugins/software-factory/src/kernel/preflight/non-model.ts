/**
 * The pre-flight checks that read no model: `preflight` refuses a launch on
 * them and `factory validate` reports them without building a harness.
 */

import {
  configFindings,
  harnessBinaries,
  rootFindings,
  unconfiguredTaskFindings,
  uniqueFindings,
} from "./config.js";
import { harnessRegistrationFindings, portabilityFindings } from "./checks.js";
import type { NonModelInput, NonModelResult } from "./types.js";

interface NonModelCheck {
  readonly id: string;
  run(input: NonModelInput, result: NonModelResult): Promise<void> | void;
}

/**
 * Everything a launch refuses on without reading a model. Model, effort and
 * scout probes, the base branch and the base gates stay with `preflight`; a
 * store, root or harness set the caller omits skips the checks needing it.
 */
const NON_MODEL_CHECKS: readonly NonModelCheck[] = [
  {
    id: "config",
    async run(input, result) {
      result.findings.push(
        ...(await configFindings(input.configs, input.files, input.store)),
      );
    },
  },
  {
    id: "harnesses",
    run(input, result) {
      if (!input.harnesses) return;
      result.findings.push(
        ...harnessRegistrationFindings(
          input.configs,
          input.files.run,
          input.harnesses,
        ),
        ...portabilityFindings(input.configs, input.files.run, input.harnesses),
      );
    },
  },
  {
    id: "binaries",
    run(input, result) {
      if (!input.binaries) return;
      const binaries = harnessBinaries(
        input.configs,
        input.files,
        input.binaries,
      );
      result.findings.push(...binaries.findings);
      for (const harness of binaries.unavailable) {
        result.unavailable.add(harness);
      }
    },
  },
  {
    id: "roots",
    async run(input, result) {
      if (!input.roots) return;
      result.findings.push(...(await rootFindings(input.roots, input.files)));
    },
  },
  {
    id: "tasks",
    async run(input, result) {
      if (!input.store) return;
      result.findings.push(...(await unconfiguredTaskFindings(input.store)));
    },
  },
];

/** Runs every non-model check in order, deduplicated like the launch report. */
export async function nonModelFindings(
  input: NonModelInput,
): Promise<NonModelResult> {
  const result: NonModelResult = { findings: [], unavailable: new Set() };
  for (const check of NON_MODEL_CHECKS) await check.run(input, result);
  return {
    findings: uniqueFindings(result.findings),
    unavailable: result.unavailable,
  };
}
