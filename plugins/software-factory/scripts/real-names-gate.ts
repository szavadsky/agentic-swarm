#!/usr/bin/env bun
/**
 * Real-names gate: fails when a harness, model or subscription name from
 * config/real-names.json appears under src/ or test/. The omp adapter is
 * the only place real names may remain; the name list itself is excluded.
 * The openrouter.ai API endpoint is not a name: `openrouter` is not listed.
 *
 * Usage: bun scripts/real-names-gate.ts [package-dir]
 */
import fs from "node:fs";
import path from "node:path";

const OMP_ADAPTER = path.join("src", "harness", "omp");

interface RealNames {
  harnesses: string[];
  models: string[];
  providers: string[];
  subscriptions: string[];
}

function loadNames(pkg: string): string[] {
  const raw = JSON.parse(
    fs.readFileSync(path.join(pkg, "config", "real-names.json"), "utf8"),
  ) as RealNames;
  const all = [
    ...raw.harnesses,
    ...raw.models,
    ...raw.providers,
    ...raw.subscriptions,
  ];
  return all.map((n) => n.toLowerCase()).filter(Boolean);
}

function isExcluded(rel: string): boolean {
  const normalized = rel.split(path.sep).join("/");
  if (normalized.startsWith(`${OMP_ADAPTER}/`)) return true;
  if (normalized.endsWith("config/real-names.json")) return true;
  return false;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && full.endsWith(".ts")) out.push(full);
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patternFor(names: string[]): RegExp {
  return new RegExp(
    names
      .map((n) => `(?<![A-Za-z0-9])${escapeRegex(n)}(?![A-Za-z0-9])`)
      .join("|"),
    "i",
  );
}

function scanFile(pkg: string, file: string, pattern: RegExp): number {
  if (isExcluded(path.relative(pkg, file))) return 0;
  let hits = 0;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (pattern.test(line)) {
      console.error(`${path.relative(pkg, file)}:${i + 1}: ${line.trim()}`);
      hits++;
    }
  }
  return hits;
}

function scan(pkg: string, pattern: RegExp): number {
  let hits = 0;
  for (const root of [path.join(pkg, "src"), path.join(pkg, "test")]) {
    if (!fs.existsSync(root)) continue;
    for (const file of walk(root)) hits += scanFile(pkg, file, pattern);
  }
  return hits;
}

function main(): number {
  const pkg = path.resolve(process.argv[2] ?? path.join(import.meta.dir, ".."));
  const names = loadNames(pkg);
  if (names.length === 0) {
    console.error("real-names-gate: empty name list");
    return 2;
  }
  const hits = scan(pkg, patternFor(names));
  if (hits > 0) {
    console.error(`real-names-gate: ${hits} real-name occurrence(s)`);
    return 1;
  }
  return 0;
}

if (import.meta.main) process.exit(main());
