import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Harness executables no default test may spawn, by exact basename. */
const HARNESS_BINARIES = new Set([
  "omp",
  "acpx",
  "opencode",
  "claude",
  "agy",
  "codex",
  "pi",
]);

/** True for localhost, 127/8 and ::1 (brackets, case and trailing dot tolerated). */
export function isLoopbackHostname(hostname: string): boolean {
  let host = hostname.trim().toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (
    host === "localhost" ||
    host === "::1" ||
    host === "::" ||
    host === "0.0.0.0"
  ) {
    return true;
  }
  const parts = host.split(".");
  return (
    parts.length >= 2 &&
    parts[0] === "127" &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
  );
}

/** The harness binary a path or bare token names, by exact basename, if any. */
export function harnessName(token: string): string | undefined {
  const base = path.basename(token);
  return HARNESS_BINARIES.has(base) ? base : undefined;
}

/** Tmp roots stubs may live under; tmp-repo falls back to /tmp, so do we. */
const tmpRoots: string[] = [
  ...new Set(
    [os.tmpdir(), process.env.TMPDIR, process.env.TMP, process.env.TEMP, "/tmp"]
      .filter((d): d is string => !!d)
      .map((d) => {
        try {
          return fs.realpathSync(d);
        } catch {
          return path.resolve(d);
        }
      }),
  ),
];

/** True when a slash-carrying path resolves under a tmp root. */
export function isTmpPath(file: string, cwd: string): boolean {
  if (!file.includes("/")) return false;
  const resolved = path.resolve(cwd, file);
  return tmpRoots.some(
    (root) => resolved === root || resolved.startsWith(`${root}${path.sep}`),
  );
}
