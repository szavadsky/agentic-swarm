// biome-ignore-all lint/complexity: split-rest
import { describe, expect, it } from "bun:test";
import os from "node:os";
import { loadPrompts } from "../../src/kernel/prompts.js";
import type { ProcessConfig, RunConfig } from "../../src/kernel/types.js";
import { TEST_ARCHITECTURE, TEST_BOUNDARY } from "./helpers.js";

describe("presets", () => {
  it("uses the preset calibration when defined", () => {
    const process: ProcessConfig = {
      taskTypes: {},
      flows: {},
      boundary: TEST_BOUNDARY,
      architecture: TEST_ARCHITECTURE,
      reminders: 1,
      calibration: "DEFAULT",
      presets: {
        custom: { calibration: "CUSTOM" },
      },
    };
    const run: RunConfig = {
      aliases: {},
      limits: { iterations: 1, planCheckRounds: 2 },
      sessions: { dir: "", keepRuns: 5, retention: "short" },
      preset: "custom",
    } as RunConfig;

    const lib = loadPrompts(process, os.tmpdir(), { run });
    expect(lib.render("calibration", {})).toBe("CUSTOM");
  });

  it("uses the default calibration when preset is not defined", () => {
    const process: ProcessConfig = {
      taskTypes: {},
      flows: {},
      boundary: TEST_BOUNDARY,
      architecture: TEST_ARCHITECTURE,
      reminders: 1,
      calibration: "DEFAULT",
      presets: {
        custom: { calibration: "CUSTOM" },
      },
    };
    const run: RunConfig = {
      aliases: {},
      limits: { iterations: 1, planCheckRounds: 2 },
      sessions: { dir: "", keepRuns: 5, retention: "short" },
      preset: "other",
    } as RunConfig;

    const lib = loadPrompts(process, os.tmpdir(), { run });
    expect(lib.render("calibration", {})).toBe("DEFAULT");
  });

  it("uses the preset calibration for each shipped preset", () => {
    const process: ProcessConfig = {
      taskTypes: {},
      flows: {},
      boundary: TEST_BOUNDARY,
      architecture: TEST_ARCHITECTURE,
      reminders: 1,
      calibration: "DEFAULT",
      presets: {
        autonomous: { calibration: "AUTO" },
        principal: { calibration: "PRINCIPAL" },
        detailed: { calibration: "DETAILED" },
      },
    };

    for (const [preset, expected] of [
      ["autonomous", "AUTO"],
      ["principal", "PRINCIPAL"],
      ["detailed", "DETAILED"],
    ] as const) {
      const run: RunConfig = {
        aliases: {},
        limits: { iterations: 1, planCheckRounds: 2 },
        sessions: { dir: "", keepRuns: 5, retention: "short" },
        preset,
      } as RunConfig;
      const lib = loadPrompts(process, os.tmpdir(), { run });
      expect(lib.render("calibration", {})).toBe(expected);
    }
  });

  it("behaves correctly when presets are undefined or empty", () => {
    const processNoPresets: ProcessConfig = {
      taskTypes: {},
      flows: {},
      boundary: TEST_BOUNDARY,
      architecture: TEST_ARCHITECTURE,
      reminders: 1,
      calibration: "DEFAULT",
    };
    const processEmptyPresets: ProcessConfig = {
      ...processNoPresets,
      presets: {},
    };

    for (const process of [processNoPresets, processEmptyPresets]) {
      const run: RunConfig = {
        aliases: {},
        limits: { iterations: 1, planCheckRounds: 2 },
        sessions: { dir: "", keepRuns: 5, retention: "short" },
        preset: "any",
      } as RunConfig;
      const lib = loadPrompts(process, os.tmpdir(), { run });
      expect(lib.render("calibration", {})).toBe("DEFAULT");
    }
  });
});
