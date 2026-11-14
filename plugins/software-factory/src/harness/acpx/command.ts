import type { AcpxCommand } from "./types.js";

/**
 * Binary resolution mirrors OPENCODE_PATH: an explicit path wins, then PATH,
 * then the on-demand `bunx acpx` route the probe used (acpx was never installed
 * globally).
 */
export function resolveAcpxCommand(binary?: string): AcpxCommand {
  if (binary) return { binary, prefix: [] };
  const configured = process.env.ACPX_PATH;
  if (configured) return { binary: configured, prefix: [] };
  const onPath = Bun.which("acpx");
  if (onPath) return { binary: onPath, prefix: [] };
  return { binary: Bun.which("bunx") ?? "bunx", prefix: ["acpx"] };
}

/**
 * agy is spawned by acpx from its raw `--agent` command, so the adapter has to
 * resolve it itself; pre-flight's AGY_PATH would otherwise never reach the
 * spawned process. Same precedence as OPENCODE_PATH and OMP_PATH.
 */
export function resolveAgyBinary(binary?: string): string {
  return binary ?? process.env.AGY_PATH ?? Bun.which("agy") ?? "agy";
}
