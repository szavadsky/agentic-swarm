/** The record shapes `record.ts` writes. */

/** One gate that went red, then green on the same tree: its red-run failures. */
export interface GateFlake {
  gate: string;
  tests: string[];
}
