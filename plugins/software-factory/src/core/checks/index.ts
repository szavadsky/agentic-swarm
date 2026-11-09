export type { CheckContext, CheckResult } from "./types.js";
export { tailCap } from "./types.js";
export { runCheck } from "./runner.js";
export { runGates } from "./gates.js";
export { buildTargetCommand, buildGateWithJunitCommand, parseJunit, sanitizeDeveloperTarget } from "./junit.js";
export type { ParsedJunit, ParsedCase } from "./junit.js";
