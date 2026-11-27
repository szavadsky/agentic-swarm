/** The Linux driver: the process table is the `/proc` filesystem. */

import { pathApi, signalApi } from "./shared.js";
import type { Os, OsPrimitives, OsProcess } from "./types.js";

/** The kernel marks a working directory that no longer exists this way. */
const DELETED_SUFFIX = " (deleted)";

/** `stat` is `pid (comm) state ppid pgrp ...`; comm may hold spaces and parens. */
function statFields(stat: string): { ppid: number; pgid: number } | undefined {
  const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  const ppid = Number(fields[1]);
  const pgid = Number(fields[2]);
  if (!Number.isInteger(ppid) || !Number.isInteger(pgid)) return undefined;
  return { ppid, pgid };
}

/** A process's working directory, without the kernel's deleted marker. */
function processCwd(primitives: OsPrimitives, pid: number): string | undefined {
  try {
    const link = primitives.readLink(`/proc/${pid}/cwd`);
    return link.endsWith(DELETED_SUFFIX)
      ? link.slice(0, -DELETED_SUFFIX.length)
      : link;
  } catch {
    return undefined;
  }
}

/** Every process the kernel exposes, with its cwd when that link is readable. */
function processTable(primitives: OsPrimitives): OsProcess[] {
  let entries: string[];
  try {
    entries = primitives.listDir("/proc");
  } catch {
    return [];
  }
  const processes: OsProcess[] = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    let stat: string;
    try {
      stat = primitives.readText(`/proc/${pid}/stat`);
    } catch {
      continue;
    }
    const fields = statFields(stat);
    if (fields === undefined) continue;
    const process: OsProcess = { pid, ppid: fields.ppid, pgid: fields.pgid };
    const cwd = processCwd(primitives, pid);
    if (cwd !== undefined) process.cwd = cwd;
    processes.push(process);
  }
  return processes;
}

/** The Linux driver over injected primitives. */
export function linuxOs(primitives: OsPrimitives): Os {
  return {
    processes: () => processTable(primitives),
    ...signalApi(primitives),
    ...pathApi(),
    shell: (command) => ({ executable: "bash", args: ["-c", command] }),
  };
}
