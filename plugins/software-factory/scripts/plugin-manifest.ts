/**
 * The plugin manifest check: the shipped `.claude-plugin/plugin.json` matches
 * the Claude Code shape lint accepts, and every skill directory it names holds
 * a SKILL.md. The manifest only points at the skills; the operator flow lives
 * in their text, so a harness that reads SKILL.md alone still runs it.
 */

import fs from "node:fs";
import path from "node:path";
import Ajv, { type ErrorObject } from "ajv";
import schema from "../schemas/claude-plugin.json";
import { walkFiles } from "./files.js";

/** The manifest path relative to the plugin root; tests use it instead of restating the fixed name. */
export const MANIFEST = ".claude-plugin/plugin.json";

const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

interface ParsedManifest {
  value?: unknown;
  problem?: string;
}

interface SkillsManifest {
  skills?: string | string[];
}

/** One check finding, prefixed with the manifest it is about. */
function problem(text: string): string {
  return `plugin manifest: ${MANIFEST}: ${text}`;
}

function readManifest(root: string): ParsedManifest {
  const file = path.join(root, MANIFEST);
  if (!fs.existsSync(file)) return { problem: "missing" };
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    return { problem: `unreadable (${(error as Error).message})` };
  }
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return { problem: `not JSON (${(error as Error).message})` };
  }
}

function schemaProblem(error: ErrorObject): string {
  const at = error.instancePath === "" ? "/" : error.instancePath;
  return problem(`${at} ${error.message ?? "is invalid"}`);
}

/** The declared skill paths, string or array, as the schema allows. */
function declaredSkills(manifest: unknown): string[] {
  const { skills } = manifest as SkillsManifest;
  if (skills === undefined) return [];
  return typeof skills === "string" ? [skills] : skills;
}

function skillPathProblems(root: string, rel: string): string[] {
  const full = path.resolve(root, rel);
  const inside = path.relative(root, full);
  if (inside.startsWith("..") || path.isAbsolute(inside)) {
    return [problem(`skills path "${rel}" escapes the plugin root`)];
  }
  const stats = fs.statSync(full, { throwIfNoEntry: false });
  if (!stats?.isDirectory()) {
    return [problem(`skills path "${rel}" is not a directory`)];
  }
  const skills = walkFiles(full, (file) => path.basename(file) === "SKILL.md");
  return skills.length > 0
    ? []
    : [problem(`skills path "${rel}" holds no SKILL.md`)];
}

/** Every problem with the plugin manifest, or an empty list when it is sound. */
export function pluginManifestProblems(root: string): string[] {
  const parsed = readManifest(root);
  if (parsed.problem !== undefined) return [problem(parsed.problem)];
  if (!validate(parsed.value))
    return (validate.errors ?? []).map(schemaProblem);
  return declaredSkills(parsed.value).flatMap((rel) =>
    skillPathProblems(root, rel),
  );
}
