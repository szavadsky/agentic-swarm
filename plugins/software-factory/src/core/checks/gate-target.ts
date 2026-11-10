import type { DeveloperTarget, InfraArtifact, InfraGate } from "../artifacts.js";

/**
 * Gate-target resolution (§7, §9).
 *
 * A developer may record `{gate: <value>}` where <value> is a gate *id*
 * (the documented form) but agents also record the gate *command* they ran
 * (e.g. `uv run pytest tests -q` while the gate id is `test`). Executing the
 * recorded value as a shell command or failing with "Unknown gate target"
 * is unactionable: the gate exists, only the naming form is loose. Resolve
 * every accepted form to a configured gate, and keep the loud error (with
 * commands, not just ids) for genuinely unknown targets.
 */

/** Collapses whitespace so a recorded command matches a configured command. */
export function normalizeGateCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function commandTokens(command: string): string[] {
  return normalizeGateCommand(command).split(" ").filter(Boolean);
}

/**
 * Resolves a recorded gate target (id or command form) against infra gates:
 * 1. exact / case-insensitive gate id;
 * 2. exact command match (whitespace-normalized);
 * 3. recorded command extends (or is extended by) a gate command on a word
 *    boundary — e.g. `uv run pytest -q -x` vs gate `uv run pytest -q`;
 * 4. any invocation of the configured test runner maps to the base test gate
 *    (`test`/`tests`/`unit` preferred, then the gate whose command shares the
 *    most tokens with the target, integration gates only when the target
 *    names integration).
 *
 * Returns undefined for genuinely unknown targets (callers fail loudly).
 */
export interface GateTargetSource {
  gates?: InfraGate[];
  testRunner?: InfraArtifact["testRunner"];
}

export function resolveGateTarget(
  requested: string,
  infra?: GateTargetSource
): InfraGate | undefined {
  const gates = infra?.gates ?? [];
  const raw = (requested ?? "").trim();
  if (!raw) return undefined;

  const byId =
    gates.find((g) => g.id === raw) ??
    gates.find((g) => g.id.toLowerCase() === raw.toLowerCase());
  if (byId) return byId;

  const want = normalizeGateCommand(raw);
  const exact = gates.find((g) => normalizeGateCommand(g.command) === want);
  if (exact) return exact;

  const prefixed = gates.find((g) => {
    const c = normalizeGateCommand(g.command);
    return c.length > 0 && (want.startsWith(`${c} `) || c.startsWith(`${want} `));
  });
  if (prefixed) return prefixed;

  const runnerCmd = infra?.testRunner?.command ? normalizeGateCommand(infra.testRunner.command) : "";
  if (runnerCmd && (want === runnerCmd || want.startsWith(`${runnerCmd} `))) {
    const runners = gates.filter((g) => {
      const c = normalizeGateCommand(g.command);
      return c === runnerCmd || c.startsWith(`${runnerCmd} `);
    });
    if (runners.length > 0) {
      const wanted = new Set(commandTokens(want));
      const mentionsIntegration = /integration/i.test(raw);
      const scored = runners.map((g) => {
        const tokens = commandTokens(g.command);
        const overlap = tokens.filter((t) => wanted.has(t)).length;
        const idBase = ["test", "tests", "unit", "unit-tests", "test-runner"].includes(
          g.id.toLowerCase()
        );
        const idIntegration = /integration/i.test(g.id) || /integration/i.test(g.command);
        return { gate: g, overlap, idBase, idIntegration, tokens: tokens.length };
      });
      const eligible = scored;
      // Prefer: base-id gate, then integration match/mismatch, then token
      // overlap (higher), then the shorter command (base suite, not a subset).
      eligible.sort((a, b) => {
        if (a.idBase !== b.idBase) return a.idBase ? -1 : 1;
        if (mentionsIntegration && a.idIntegration !== b.idIntegration) {
          return a.idIntegration ? -1 : 1;
        }
        if (!mentionsIntegration && a.idIntegration !== b.idIntegration) {
          return a.idIntegration ? 1 : -1;
        }
        if (a.overlap !== b.overlap) return b.overlap - a.overlap;
        return a.tokens - b.tokens;
      });
      if (eligible[0]) return eligible[0].gate;
    }
  }

  return undefined;
}

/**
 * Human-readable gate catalogue for error/consult text: id plus command.
 * Keeps the `format|lint|test` list readable while naming what each id runs.
 */
export function formatKnownGateTargets(infra?: GateTargetSource): string {
  const gates = infra?.gates ?? [];
  if (gates.length === 0) return "(no gates configured)";
  const clip = (cmd: string) => (cmd.length > 120 ? `${cmd.slice(0, 117)}...` : cmd);
  return gates.map((g) => `${g.id} = \`${clip(normalizeGateCommand(g.command))}\``).join(", ");
}

/**
 * Rewrites a developer target's `{gate}` form to the resolved gate id.
 * Returns the input unchanged when the target is not a gate form or cannot be
 * resolved (callers keep the loud unknown-target error path).
 */
export function normalizeDeveloperTarget(
  target: DeveloperTarget | undefined,
  infra?: GateTargetSource
): DeveloperTarget | undefined {
  if (!target || !("gate" in target) || !target.gate) return target;
  const gate = resolveGateTarget(target.gate, infra);
  if (!gate) return target;
  return gate.id === target.gate ? target : { gate: gate.id };
}
