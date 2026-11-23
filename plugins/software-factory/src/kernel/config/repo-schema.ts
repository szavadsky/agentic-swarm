/** The repository config schema and the package root it sits beside. */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const packageRoot = fileURLToPath(new URL("../../..", import.meta.url));

const identitySchema = z
  .object({ name: z.string().min(1), email: z.string().min(1) })
  .strict();
/**
 * A gate path that must stay inside its worktree. Absolute, `~` and `..`
 * paths would let two concurrent gate runs share one directory (which is what
 * `env` exists to prevent) or write and read outside the tree.
 */
function worktreePath(label: string) {
  return z
    .string()
    .min(1)
    .refine(
      (value) =>
        !path.isAbsolute(value) &&
        !value.startsWith("~") &&
        !value.split(/[\\/]/).includes(".."),
      { message: `${label} must be worktree-relative (no absolute, ~ or ..)` },
    );
}
const gateEnvDirSchema = worktreePath("env dirs");
const gateJunitPathSchema = worktreePath("junit path");
const gateSchema = z
  .object({
    id: z.string().min(1),
    command: z.string().min(1),
    serial: z.array(z.string().min(1)).default([]),
    /** Per-gate wall in seconds; non-positive falls back to the 900 s default. */
    timeoutSec: z.number().optional(),
    env: z
      .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), gateEnvDirSchema)
      .optional(),
    format: z
      .object({
        junit: gateJunitPathSchema.optional(),
        pattern: z.enum(["pytest", "jest", "cargo"]).optional(),
      })
      .strict()
      .refine((val) => val.junit !== undefined || val.pattern !== undefined, {
        message: "format must contain junit or pattern",
      })
      .optional(),
  })
  .strict();

/** `.factory/repo.yaml` — the tracked layer: branches, paths, gates. */
export const repoConfigSchema = z
  .object({
    baseBranch: z.string().min(1).default("main"),
    artifactRoot: z.string().min(1).default(".factory/artifacts"),
    /** Artifact backend by name; absent keeps the plain gitignored folder. */
    artifacts: z
      .object({
        backend: z.enum(["folder", "same-repo", "git-repo"]).default("folder"),
        root: z.string().min(1).optional(),
        remote: z.string().min(1).optional(),
      })
      .strict()
      .refine(
        (value) => value.remote === undefined || value.backend === "git-repo",
        {
          message: "remote is only valid for the git-repo backend",
          path: ["remote"],
        },
      )
      .optional(),
    identity: identitySchema.optional(),
    setup: z.array(z.string().min(1)).default([]),
    gates: z.array(gateSchema).default([]),
    cleanliness: z
      .object({
        maxFileSizeBytes: z.number().int().positive().optional(),
        allowedExtensions: z.array(z.string().min(1)).optional(),
        allowedFiles: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
