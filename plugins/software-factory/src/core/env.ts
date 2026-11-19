/**
 * The environment a spawned child inherits: a fixed base set plus the names the
 * run config allows. The factory's whole environment never passes through, so
 * provider keys, tokens and unrelated operator state stay out of gates and
 * harness turns.
 *
 * Values handed to `set` always reach the child, letting a caller supply a
 * needed value (git hardening, an acpx harness entry's `env`) without widening
 * what the child inherits.
 */

/** Exact names every child keeps: executable and toolchain resolution. */
const BASE_ENV_NAMES: readonly string[] = [
  // Executable resolution and the per-user config/cache roots harnesses read.
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  // Facts tools use to format and parse their output.
  "LANG",
  "TZ",
  "TERM",
  // Temp root; runProcess also derives TMP/TEMP from TMPDIR for the child.
  "TMPDIR",
  "TMP",
  "TEMP",
  // Git's read probes must not take index.lock; git children set this as well.
  "GIT_OPTIONAL_LOCKS",
  // bun/node caches a gate's install and a harness's runtime read.
  "BUN_INSTALL",
  "BUN_INSTALL_CACHE_DIR",
  "BUN_RUNTIME_TRANSPILER_CACHE_PATH",
  "NPM_CONFIG_CACHE",
  "npm_config_cache",
  // User config/data roots, set when they do not default under HOME.
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_STATE_HOME",
];

/** Localized message settings (LC_ALL, LC_CTYPE, ...) carry no secret. */
const BASE_ENV_PREFIXES: readonly string[] = ["LC_"];

export interface ChildEnvOptions {
  /** Extra names the run config allows (`envAllowlist`). */
  allow?: readonly string[];
  /** Values the caller sets explicitly; they always reach the child. */
  set?: Record<string, string>;
  /** Parent environment; callers default to `process.env`, tests pass a fixture. */
  source?: NodeJS.ProcessEnv;
}

/** Builds one child's environment: base names, then `allow`, then `set`. */
export function childEnv(
  options: ChildEnvOptions = {},
): Record<string, string> {
  const allowed = new Set([...BASE_ENV_NAMES, ...(options.allow ?? [])]);
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(options.source ?? process.env)) {
    if (value === undefined) continue;
    if (
      allowed.has(name) ||
      BASE_ENV_PREFIXES.some((prefix) => name.startsWith(prefix))
    ) {
      env[name] = value;
    }
  }
  return { ...env, ...options.set };
}
