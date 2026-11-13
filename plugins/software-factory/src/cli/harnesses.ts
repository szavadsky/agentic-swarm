import { runProcess } from "../core/proc.js";
import { OpencodeHarness } from "../harness/opencode/index.js";
import { OpencodeApi } from "../harness/opencode/api.js";
import { OmpHarness } from "../harness/omp/index.js";
import type { Harness } from "../harness/types.js";
import type { HarnessFactoryContext } from "../kernel/launch.js";
import type { ModelCatalog } from "../kernel/preflight.js";

export function resolveHarnessBinaries(): Record<string, string | undefined> {
  return {
    opencode: process.env.OPENCODE_PATH ?? Bun.which("opencode") ?? undefined,
    omp: process.env.OMP_PATH ?? Bun.which("omp") ?? undefined,
  };
}

/** Real adapters, both rooted in the launch's private session directory. */
export function createRealHarnesses(context: HarnessFactoryContext): Record<string, Harness> {
  return {
    opencode: new OpencodeHarness({ sessionDir: context.sessionDir }),
    omp: new OmpHarness({ sessionDir: context.sessionDir, subagentModel: context.scouts }),
  };
}

const MODEL_TIMEOUT_SEC = 60;

async function opencodeModels(binary: string): Promise<Set<string>> {
  const rows = await new OpencodeApi(binary).models(process.cwd());
  return new Set(rows.map((row) => `${row.providerID}/${row.modelID}`));
}

async function ompModels(binary: string): Promise<Set<string>> {
  const res = await runProcess({
    cmd: [binary, "models", "--json"],
    cwd: process.cwd(),
    timeoutSec: MODEL_TIMEOUT_SEC,
    maxOutputBytes: 4 * 1024 * 1024,
  });
  if (res.code !== 0) throw new Error(`omp models --json failed (exit ${res.code}): ${res.stderr.slice(0, 500)}`);
  const parsed = JSON.parse(res.stdout) as { models?: { provider?: string; id?: string; selector?: string }[] };
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
  binaries: Record<string, string | undefined> = resolveHarnessBinaries()
): ModelCatalog {
  const cache = new Map<string, Promise<Set<string>>>();
  const models = (harness: string): Promise<Set<string>> => {
    let pending = cache.get(harness);
    if (pending) return pending;
    const binary = binaries[harness];
    if (!binary) return Promise.reject(new Error(`harness "${harness}" binary is not available`));
    pending =
      harness === "opencode"
        ? opencodeModels(binary)
        : harness === "omp"
          ? ompModels(binary)
          : Promise.resolve(new Set<string>());
    cache.set(harness, pending);
    pending.catch(() => cache.delete(harness));
    return pending;
  };
  return async (harness, model) => (await models(harness)).has(model);
}
