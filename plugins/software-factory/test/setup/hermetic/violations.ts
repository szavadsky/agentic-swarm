import fs from "node:fs";

export class HermeticViolation extends Error {
  override readonly name = "HermeticViolation";
}

/** False only under FACTORY_LIVE=1, which exempts live tests from the guard. */
export const hermeticGuardActive: boolean = process.env.FACTORY_LIVE !== "1";

const violationLog: string | undefined = hermeticGuardActive
  ? process.env.FACTORY_HERMETIC_LOG?.trim() || undefined
  : undefined;
let logWarned = false;

export interface RecordedViolation {
  kind: string;
  detail: string;
  stack: string;
}

const pendingViolations: RecordedViolation[] = [];

/**
 * Takes and clears the recorded refusals. The guard's own test calls this
 * after each intentional violation; any other pending recording fails the
 * running test in the global `afterEach` below.
 */
export function drainViolations(): RecordedViolation[] {
  return pendingViolations.splice(0, pendingViolations.length);
}

export function refuse(kind: string, detail: string, hint: string): never {
  const stack = new Error().stack ?? "";
  pendingViolations.push({ kind, detail, stack });
  if (violationLog) {
    try {
      fs.appendFileSync(
        violationLog,
        `${JSON.stringify({ kind, detail, stack })}\n`,
      );
    } catch (err) {
      if (!logWarned) {
        logWarned = true;
        console.error(
          `hermetic guard: cannot write FACTORY_HERMETIC_LOG=${violationLog}: ${(err as Error).message}`,
        );
      }
    }
  }
  throw new HermeticViolation(
    `hermetic guard: blocked ${kind} "${detail}" — ${hint}`,
  );
}

export function blameLines(stack: string): string[] {
  return stack
    .split("\n")
    .filter(
      (line) =>
        !line.includes("hermetic-guard.ts") && !line.includes("hermetic/"),
    )
    .slice(0, 6);
}

const NETWORK_HINT =
  "tests must not use the network (inject a fake, or mark the test FACTORY_LIVE=1)";

export { NETWORK_HINT };
