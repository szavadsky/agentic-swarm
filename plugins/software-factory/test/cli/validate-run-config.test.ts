import { describe, expect, it } from "bun:test";
import { runValidate, withTmp, writeFile } from "../helpers/validate.js";

const MISSING_ARCHITECT =
  'aliases.architect: required by boundary step "architect" but missing';

describe("factory validate --run-config", () => {
  it(
    "validates a bootstrap run config named with the flag",
    withTmp(async (root) => {
      const file = writeFile(
        root,
        "bootstrap/run/self.yaml",
        "aliases:\n  implementer: { harness: fake, model: m }\n",
      );
      const result = await runValidate(undefined, ["--run-config", file]);
      expect(result.code).toBe(1);
      expect(result.err).toContain(MISSING_ARCHITECT);
      expect(result.err).toContain(file);
    }),
  );

  it(
    "uses the flag as the run layer for a repo file",
    withTmp(async (root) => {
      const runConfig = writeFile(
        root,
        "bootstrap/run/self.yaml",
        "aliases:\n  implementer: { harness: fake, model: m }\n",
      );
      const repoFile = writeFile(
        root,
        ".factory/repo.yaml",
        "baseBranch: main\n",
      );
      const result = await runValidate(repoFile, ["--run-config", runConfig]);
      expect(result.code).toBe(1);
      expect(result.err).toContain(MISSING_ARCHITECT);
      expect(result.err).toContain(runConfig);
    }),
  );
});
