import { runProcess } from "../core/proc.js";
import {
  resolveAcpxCommand,
  resolveRawAgentBinary,
} from "../harness/acpx/command.js";
import { AcpxHarness } from "../harness/acpx/index.js";
import { OmpHarness } from "../harness/omp/index.js";
import { OMP_ID } from "../harness/omp/types.js";
import type { Harness } from "../harness/types.js";
import type { HarnessFactoryContext } from "../kernel/launch.js";
import type { ModelCatalog } from "../kernel/preflight.js";
import type { HarnessConfig } from "../kernel/types.js";

export function resolveHarnessBinaries(
  harnessConfigs: Record<string, HarnessConfig> = {},
): Record<string, string | undefined> {
  const binaries: Record<string, string | undefined> = {
    [OMP_ID]: harnessConfigs[OMP_ID]?.binary ?? Bun.which("omp") ?? undefined,
  };
  for (const [id, entry] of Object.entries(harnessConfigs)) {
    if (!entry.acpx) continue;
    // A positional agent is served by the acpx dispatcher (bunx when acpx is
    // absent, which pre-flight can check); a raw route spawns its own binary
    // (same resolution as AcpxHarness).
    binaries[id] = entry.acpx.raw
      ? resolveRawAgentBinary(entry.acpx.agent)
      : resolveAcpxCommand(entry.binary).binary;
  }
  return binaries;
}

/** Real adapters, all rooted in the launch's private session directory. */
export function createRealHarnesses(
  context: HarnessFactoryContext,
): Record<string, Harness> {
  const harnesses: Record<string, Harness> = {
    [OMP_ID]: new OmpHarness({
      sessionDir: context.sessionDir,
      subagentModel: context.scouts,
      retention: context.retention,
      binary: context.harnesses?.[OMP_ID]?.binary,
      lspConfig: context.lsp?.config,
      options: context.harnesses?.[OMP_ID]?.options,
      envAllowlist: context.envAllowlist,
    }),
  };
  for (const [id, entry] of Object.entries(context.harnesses ?? {})) {
    if (!entry.acpx) continue;
    harnesses[id] = new AcpxHarness({
      id,
      binary: entry.binary,
      sessionDir: context.sessionDir,
      acpx: entry.acpx,
      options: entry.options,
      envAllowlist: context.envAllowlist,
    });
  }
  return harnesses;
}

const MODEL_TIMEOUT_SEC = 60;

async function ompModels(
  binary: string,
  envAllowlist?: readonly string[],
): Promise<Set<string>> {
  const res = await runProcess({
    cmd: [binary, "models", "--json"],
    cwd: process.cwd(),
    envAllowlist,
    timeoutSec: MODEL_TIMEOUT_SEC,
    maxOutputBytes: 4 * 1024 * 1024,
  });
  if (res.code !== 0)
    throw new Error(
      `omp models --json failed (exit ${res.code}): ${res.stderr.slice(0, 500)}`,
    );
  const parsed = JSON.parse(res.stdout) as {
    models?: { provider?: string; id?: string; selector?: string }[];
  };
  const models = new Set<string>();
  for (const row of parsed.models ?? []) {
    if (row.selector) models.add(row.selector);
    if (row.provider && row.id) models.add(`${row.provider}/${row.id}`);
    if (row.id) models.add(row.id);
  }
  return models;
}

/** Real model lists, cached per process; used only by pre-flight. */
export function createRealModelCatalog(
  binaries: Record<string, string | undefined> = resolveHarnessBinaries(),
  envAllowlist?: readonly string[],
): ModelCatalog {
  const cache = new Map<string, Promise<Set<string>>>();
  const models = (harness: string): Promise<Set<string>> => {
    let pending = cache.get(harness);
    if (pending) return pending;
    const binary = binaries[harness];
    if (!binary)
      return Promise.reject(
        new Error(`harness "${harness}" binary is not available`),
      );
    pending = ompModels(binary, envAllowlist);
    cache.set(harness, pending);
    pending.catch(() => cache.delete(harness));
    return pending;
  };
  return async (harness, model) => {
    return (await models(harness)).has(model);
  };
}
