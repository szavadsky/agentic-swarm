/** The CLI's argument parser and dispatcher; the implementation is split under `dispatch/`. */

export type { CliDeps } from "./dispatch/types.js";
export { parseCliArgs } from "./dispatch/args.js";
export { dispatch } from "./dispatch/commands.js";
