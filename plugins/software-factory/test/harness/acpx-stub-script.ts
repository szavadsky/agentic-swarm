import type { AcpxStubOptions } from "./acpx-stub.js";

/** A stub option's JSON value, with its default when the option is absent. */
function jsonOr(value: unknown, fallback: unknown): string {
  return JSON.stringify(value ?? fallback);
}

/** The stub script's JSON-encoded option values. */
interface StubJsonOptions {
  usageJs: string;
  sessionUsageJs: string;
  sessionCommandJs: string;
  compactUsageJs: string;
  bannerJs: string;
  promptDelayJs: string;
  costJs: string;
  compactJs: string;
  modelsJs: string;
  defaultModelJs: string;
  effortConfigIdJs: string;
  stopReasonJs: string;
  promptExitCodeJs: string;
  omitPromptResultJs: string;
  errorAfterResultJs: string;
  hangAfterResultJs: string;
  sessionInfoErrorJs: string;
  modelBehaviorsJs: string;
  envFileJs: string;
}

/** Encodes the stub options once for the generated script. */
export function stubJsonOptions(opts: AcpxStubOptions): StubJsonOptions {
  return {
    usageJs: jsonOr(opts.usage, null),
    sessionUsageJs: jsonOr(opts.sessionUsage, null),
    sessionCommandJs: jsonOr(opts.sessionCommand, "ok"),
    compactUsageJs: jsonOr(opts.compactUsage, null),
    bannerJs: jsonOr(opts.banner, null),
    promptDelayJs: jsonOr(opts.promptDelayMs, 0),
    costJs: jsonOr(opts.cost, null),
    compactJs: jsonOr(opts.compact, "ok"),
    modelsJs: jsonOr(opts.models, null),
    defaultModelJs: jsonOr(opts.defaultModel, null),
    effortConfigIdJs: jsonOr(opts.effortConfigId, "effort"),
    stopReasonJs: jsonOr(opts.stopReason, "end_turn"),
    promptExitCodeJs: jsonOr(opts.promptExitCode, 0),
    omitPromptResultJs: jsonOr(opts.omitPromptResult, false),
    errorAfterResultJs: jsonOr(opts.errorAfterResult, null),
    hangAfterResultJs: jsonOr(opts.hangAfterResult, false),
    sessionInfoErrorJs: jsonOr(opts.sessionInfoError, null),
    modelBehaviorsJs: jsonOr(opts.modelBehaviors, null),
    envFileJs: jsonOr(opts.envFile, null),
  };
}
