/**
 * The host driver. This is the only module that reads `process.platform`;
 * every other module asks `hostOs()`.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { darwinOs } from "./darwin.js";
import { linuxOs } from "./linux.js";
import type { Os, OsPrimitives } from "./types.js";

export type { Os, OsPrimitives } from "./types.js";

/** Node's fs, `kill(2)` and process spawning as the drivers' primitives. */
const hostPrimitives: OsPrimitives = {
  signal: (pid, signal) => {
    process.kill(pid, signal);
  },
  readText: (path) => fs.readFileSync(path, "utf8"),
  readLink: (path) => fs.readlinkSync(path),
  listDir: (path) => fs.readdirSync(path),
  exec: (executable, args) => {
    const result = spawnSync(executable, [...args], {
      encoding: "utf8",
      timeout: 5_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    return result.stdout ?? "";
  },
};

/** The driver for `platform`; the supported systems are Linux and macOS. */
export function createOs(
  platform: NodeJS.Platform,
  primitives: OsPrimitives,
): Os {
  if (platform === "linux") return linuxOs(primitives);
  if (platform === "darwin") return darwinOs(primitives);
  throw new Error(
    `unsupported platform ${platform}: the factory runs on Linux, macOS and Windows through WSL`,
  );
}

let host: Os | undefined;

/** The host driver, built once. */
export function hostOs(): Os {
  host ??= createOs(process.platform, hostPrimitives);
  return host;
}
