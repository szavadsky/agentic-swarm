#!/usr/bin/env bun
/**
 * Writes one pin's `gate.yaml`: the build's rev plus the typecheck and suite
 * verdicts promote just measured on the clean export. The record's shape is
 * the kernel's `pinGateSchema`, imported here as a type; the launch check reads
 * the file with that schema.
 *
 * Runtime imports are node builtins only: a promotion whose install failed
 * must still record its red gate, before zod or yaml exist in the pin.
 *
 * usage: bun scripts/pin-gate.ts write --dir <pin> --rev <rev> \
 *          --typecheck pass|fail --tests pass|fail
 */
import fs from "node:fs";
import path from "node:path";
import type { PinGate } from "../src/kernel/preflight/pin.js";

const USAGE =
  "usage: pin-gate.ts write --dir <pin> --rev <rev> --typecheck pass|fail --tests pass|fail";

function flag(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--"))
    throw new Error(`${name} requires a value`);
  return value;
}

function verdict(name: string, value: string): PinGate["typecheck"] {
  if (value === "pass" || value === "fail") return value;
  throw new Error(`${name} must be pass or fail, got "${value}"`);
}

function main(args: readonly string[]): void {
  const [command, ...rest] = args;
  if (command !== "write") throw new Error(USAGE);
  const dir = path.resolve(flag(rest, "--dir"));
  const gate: PinGate = {
    rev: flag(rest, "--rev"),
    typecheck: verdict("--typecheck", flag(rest, "--typecheck")),
    tests: verdict("--tests", flag(rest, "--tests")),
    at: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(dir, "gate.yaml"),
    `${JSON.stringify(gate, null, 2)}\n`,
    "utf8",
  );
}

try {
  main(process.argv.slice(2));
} catch (err) {
  console.error(`pin-gate: ${(err as Error).message}`);
  process.exit(2);
}
