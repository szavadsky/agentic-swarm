import type { AcpxCommand } from "./types.js";

/**
 * Binary resolution is config-only: a run-config override wins, then PATH, then
 * the on-demand `bunx acpx` route the probe used (acpx was never installed
 * globally).
 */
export function resolveAcpxCommand(binary?: string): AcpxCommand {
  if (binary) return { binary, prefix: [] };
  const onPath = Bun.which("acpx");
  if (onPath) return { binary: onPath, prefix: [] };
  return { binary: Bun.which("bunx") ?? "bunx", prefix: ["acpx"] };
}

/**
 * The raw `--agent` command is what acpx spawns, so the adapter resolves its
 * binary itself; a pre-flight-only lookup would let the two diverge. A slash
 * stays as is (an explicit path from config); a bare name resolves via PATH.
 */
export function resolveRawAgentCommand(agent: string): string {
  const parts = agent.split(/\s+/).filter(Boolean);
  const head = parts[0];
  if (!head) return agent;
  if (head.includes("/")) return [head, ...parts.slice(1)].join(" ");
  return [Bun.which(head) ?? head, ...parts.slice(1)].join(" ");
}

/** Binary pre-flight probes for a raw `--agent` command: its resolved head. */
export function resolveRawAgentBinary(agent: string): string {
  const head = agent.split(/\s+/).filter(Boolean)[0] ?? agent;
  if (head.includes("/")) return head;
  return Bun.which(head) ?? head;
}
