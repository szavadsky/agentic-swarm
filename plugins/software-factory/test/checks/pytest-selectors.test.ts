import { describe, it, expect } from "bun:test";
import {
  buildTargetCommand,
  isPositionalSelector,
  validateTestRunner,
} from "../../src/core/checks/junit.js";

// PsPost5 item 1: pytest selectors MUST be positional. `-k` is a keyword
// expression — `pytest -k '<node-id>'` silently selects nothing, which made
// target-red unsatisfiable for two full attempts in launch 5.

describe("pytest positional selectors (PsPost5 item 1)", () => {
  const pytestInfra = (selectorArgs?: string[]) => ({
    setup: [],
    gates: [],
    testRunner: { command: "pytest", selectorArgs, junitArg: "--junitxml={path}" },
  });

  it("isPositionalSelector recognizes node-ids, dotted ids, and file paths", () => {
    expect(isPositionalSelector("tests/test_math.py::test_add")).toBe(true);
    expect(isPositionalSelector("tests.test_math.TestAdd.test_x")).toBe(true);
    expect(isPositionalSelector("tests/test_math.py")).toBe(true);
    expect(isPositionalSelector("test_add")).toBe(false);
    expect(isPositionalSelector("special and not slow")).toBe(false);
    expect(isPositionalSelector("")).toBe(false);
  });

  it("buildTargetCommand ignores -k prefix for pytest node-ids (positional)", () => {
    const cmd = buildTargetCommand(
      pytestInfra(["-k"]),
      { selectors: ["tests/test_math.py::test_add"], expectRed: ["tests/test_math.py::test_add"] },
      "/tmp/j.xml"
    );
    expect(cmd).not.toContain("-k");
    expect(cmd).toContain("tests/test_math.py::test_add");
    expect(cmd).toContain("--junitxml=/tmp/j.xml");
  });

  it("buildTargetCommand ignores selectorArgs for unittest dotted ids", () => {
    const infra = {
      setup: [],
      gates: [],
      testRunner: { command: "python -m unittest", selectorArgs: ["-k"], junitArg: "" },
    };
    const cmd = buildTargetCommand(
      infra,
      { selectors: ["tests.test_math.TestAdd.test_x"], expectRed: ["tests.test_math.TestAdd.test_x"] },
      "/tmp/j.xml"
    );
    expect(cmd).not.toContain("-k");
    expect(cmd).toContain("tests.test_math.TestAdd.test_x");
  });

  it("buildTargetCommand still honors -t for bare jest keywords", () => {
    const infra = {
      setup: [],
      gates: [],
      testRunner: { command: "jest", selectorArgs: ["-t"], junitArg: "" },
    };
    const cmd = buildTargetCommand(
      infra,
      { selectors: ["special"], expectRed: ["special"] },
      "/tmp/j.xml"
    );
    expect(cmd).toContain("-t special");
  });

  it("buildTargetCommand is positional when selectorArgs is []", () => {
    const cmd = buildTargetCommand(
      pytestInfra([]),
      { selectors: ["tests/test_math.py::test_add"], expectRed: ["tests/test_math.py::test_add"] },
      "/tmp/j.xml"
    );
    expect(cmd).toBe("pytest tests/test_math.py::test_add --junitxml=/tmp/j.xml");
  });

  it("validateTestRunner rejects pytest/unittest with selectorArgs", () => {
    expect(
      validateTestRunner({ command: "pytest", selectorArgs: ["-k"], junitArg: "--junitxml={path}" })
    ).toHaveLength(1);
    expect(validateTestRunner({ command: "uv run pytest", selectorArgs: ["-k"] })).toHaveLength(1);
    expect(validateTestRunner({ command: "python -m unittest", selectorArgs: ["-k"] })).toHaveLength(1);
    expect(validateTestRunner({ command: "pytest", selectorArgs: [] })).toHaveLength(0);
    expect(validateTestRunner({ command: "bun test" })).toHaveLength(0);
    expect(validateTestRunner({ command: "jest", selectorArgs: ["-t"] })).toHaveLength(0);
    expect(validateTestRunner({ command: "" })).toHaveLength(1);
  });

  it("infra prompt and schema forbid -k for pytest", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const stepPrompt = fs.readFileSync(
      path.resolve(import.meta.dir, "../../agents/steps/infra.md"),
      "utf8"
    );
    expect(stepPrompt).toContain("pytest: ALWAYS `[]`");
    expect(stepPrompt).toContain("Selector dry-run (REQUIRED)");
    const agentDef = fs.readFileSync(
      path.resolve(import.meta.dir, "../../agents/infra.md"),
      "utf8"
    );
    expect(agentDef).not.toContain('For pytest: `["-k"]`');
    const schema = JSON.parse(
      fs.readFileSync(path.resolve("config/schemas/infra.schema.json"), "utf8")
    );
    expect(schema.properties.testRunner.properties.selectorArgs.description).toContain("ALWAYS []");
  });
});
