export { dispatch, parseCliArgs } from "./dispatch.js";
export type { CliDeps, ParsedArgs } from "./dispatch.js";
export { createRealHarnesses, createRealModelCatalog, resolveHarnessBinaries } from "./harnesses.js";
export { initGoal, statusGoal, steerGoal, readSteerSource } from "./commands.js";
export { benchmarkGoal, formatBenchmark } from "./benchmark.js";
export type { BenchmarkReport, BenchmarkRow } from "./benchmark.js";
