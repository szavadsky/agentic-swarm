import yaml from "yaml";
import type { AgentOutcome } from "../../harness/types.js";
import { createAjv, formatAjvErrors } from "../config/ajv.js";

const ajv = createAjv();

export interface LeafValue {
  path: string;
  value: string | number | boolean;
}

/**
 * Recursively extracts all primitive leaf values from an object or array.
 */
export function extractLeafValues(obj: unknown, currentPath = ""): LeafValue[] {
  if (obj === null || obj === undefined) {
    return [];
  }

  if (typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean") {
    return [{ path: currentPath || "/", value: obj }];
  }

  if (Array.isArray(obj)) {
    const leaves: LeafValue[] = [];
    for (let i = 0; i < obj.length; i++) {
      leaves.push(...extractLeafValues(obj[i], `${currentPath}/${i}`));
    }
    return leaves;
  }

  if (typeof obj === "object") {
    const leaves: LeafValue[] = [];
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      leaves.push(...extractLeafValues(val, `${currentPath}/${key}`));
    }
    return leaves;
  }

  return [];
}

export interface LeafGuardCheckResult {
  ok: boolean;
  missingLeaf?: LeafValue;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * §6.4 Leaf-value presence guard:
 * A structural repair from @simpler is accepted ONLY IF every leaf value
 * (enums, verdicts, statuses especially) appears in the raw output text.
 * This prevents the repair model from inventing outcomes/verdicts not stated in raw output.
 * Enum-like single tokens (no whitespace) require a whole-word match so short
 * verdicts such as `fix`, `ok` or `approved` don't match inside unrelated
 * words ("fixture", "token", "unapproved").
 */
export function checkLeafValuePresence(
  repairedObj: unknown,
  rawOutputText: string
): LeafGuardCheckResult {
  const leaves = extractLeafValues(repairedObj);
  const normalizedRaw = rawOutputText.toLowerCase();

  for (const leaf of leaves) {
    const strVal = String(leaf.value).trim();
    if (!strVal) continue; // Skip empty strings

    const lowered = strVal.toLowerCase();
    if (!/\s/.test(strVal)) {
      const wholeWord = new RegExp(`(?<![\\w-])${escapeRegExp(lowered)}(?![\\w-])`);
      if (!wholeWord.test(normalizedRaw)) {
        return {
          ok: false,
          missingLeaf: leaf,
        };
      }
      continue;
    }

    if (!normalizedRaw.includes(lowered)) {
      return {
        ok: false,
        missingLeaf: leaf,
      };
    }
  }

  return { ok: true };
}

export interface RepairPipelineOptions {
  rawOutput: string | unknown;
  schema: Record<string, unknown>;
  askSession?: (
    retryPrompt: string,
    schema: Record<string, unknown>
  ) => Promise<AgentOutcome>;
  completeSimpler?: (
    repairPrompt: string,
    schema: Record<string, unknown>
  ) => Promise<unknown>;
  relaunch?: () => Promise<AgentOutcome>;
}

export type RepairPipelineResult =
  | {
      ok: true;
      data: unknown;
      method: "direct" | "ask" | "simpler_repair" | "relaunch";
    }
  | {
      ok: false;
      error: string;
      rawOutput?: unknown;
    };

/**
 * Output validation and repair pipeline (§6.4):
 * 1. Schema enforcement
 * 2. ask same session with validation errors
 * 3. complete(@simpler) structural repair + leaf-value presence guard
 * 4. relaunch once
 * 5. error
 */
export async function validateAndRepair(
  options: RepairPipelineOptions
): Promise<RepairPipelineResult> {
  const { rawOutput, schema, askSession, completeSimpler, relaunch } = options;

  // Step-runner hands us a freshly JSON.parse'd copy of the schema file on every
  // call; recompiling on the shared instance would throw once the $id is
  // registered ("schema with key or id ... already exists"). Reuse it instead.
  const schemaId =
    typeof schema.$id === "string" ? (schema.$id as string) : undefined;
  const validate = (schemaId && ajv.getSchema(schemaId)) || ajv.compile(schema);

  function tryParse(val: unknown): unknown {
    if (typeof val !== "string") return val;
    const trimmed = val.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      try {
        return yaml.parse(trimmed);
      } catch {
        return val;
      }
    }
  }

  function getRawString(val: unknown): string {
    if (typeof val === "string") return val;
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }

  const rawText = getRawString(rawOutput);

  // 1. Direct validation
  const parsedDirect = tryParse(rawOutput);
  if (validate(parsedDirect)) {
    return { ok: true, data: parsedDirect, method: "direct" };
  }

  let lastError = formatAjvErrors(validate.errors);

  // 2. Ask same session if alive
  if (askSession) {
    const askPrompt = `The previous output did not match the required schema:\n${lastError}\nPlease provide the corrected response matching the JSON schema.`;
    const askOutcome = await askSession(askPrompt, schema);
    if (askOutcome.ok) {
      const parsedAsk = tryParse(askOutcome.data);
      if (validate(parsedAsk)) {
        return { ok: true, data: parsedAsk, method: "ask" };
      }
      lastError = formatAjvErrors(validate.errors);
    } else {
      lastError = askOutcome.error;
    }
  }

  // 3. Structural repair via @simpler with leaf-value presence guard
  if (completeSimpler) {
    const repairPrompt = `Repair the following raw agent output to strictly conform to the expected JSON schema.\n\nErrors:\n${lastError}\n\nRaw Output:\n${rawText}`;
    try {
      const repairedRaw = await completeSimpler(repairPrompt, schema);
      const parsedRepaired = tryParse(repairedRaw);

      if (validate(parsedRepaired)) {
        // Enforce leaf-value presence guard
        const guardResult = checkLeafValuePresence(parsedRepaired, rawText);
        if (guardResult.ok) {
          return { ok: true, data: parsedRepaired, method: "simpler_repair" };
        } else {
          lastError = `Repair rejected by leaf-value guard: value "${guardResult.missingLeaf?.value}" at path "${guardResult.missingLeaf?.path}" was not present in raw output.`;
        }
      } else {
        lastError = formatAjvErrors(validate.errors);
      }
    } catch (err: any) {
      lastError = `complete(@simpler) failed: ${err.message ?? String(err)}`;
    }
  }

  // 4. Relaunch once
  if (relaunch) {
    try {
      const relaunchOutcome = await relaunch();
      if (relaunchOutcome.ok) {
        const parsedRelaunch = tryParse(relaunchOutcome.data);
        if (validate(parsedRelaunch)) {
          return { ok: true, data: parsedRelaunch, method: "relaunch" };
        }
        lastError = formatAjvErrors(validate.errors);
      } else {
        lastError = relaunchOutcome.error;
      }
    } catch (err: any) {
      lastError = `Relaunch failed: ${err.message ?? String(err)}`;
    }
  }

  // 5. Final error
  return {
    ok: false,
    error: `Output validation and repair failed: ${lastError}`,
    rawOutput,
  };
}
