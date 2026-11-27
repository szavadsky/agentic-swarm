/**
 * The macOS driver: process state comes from `ps`, and working directories
 * from `lsof`, since there is no `/proc`.
 */

import { pathApi, signalApi } from "./shared.js";
import type { Os, OsPrimitives, OsProcess } from "./types.js";

const PS = "/bin/ps";
const PS_ARGS = ["-axo", "pid=,ppid=,pgid="] as const;
const LSOF = "/usr/sbin/lsof";
const LSOF_ARGS = ["-a", "-d", "cwd", "-Fpn"] as const;

/** One `pid ppid pgid` line per process; other lines are ignored. */
function parsePs(text: string): OsProcess[] {
  const processes: OsProcess[] = [];
  for (const line of text.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 3) continue;
    const pid = Number(fields[0]);
    const ppid = Number(fields[1]);
    const pgid = Number(fields[2]);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) continue;
    if (!Number.isInteger(pgid) || pid <= 0 || pgid <= 0) continue;
    processes.push({ pid, ppid, pgid });
  }
  return processes;
}

/** `lsof -Fpn` records: `p<pid>` opens a process, `n<path>` names its cwd. */
function parseLsof(text: string): Map<number, string> {
  const cwds = new Map<number, string>();
  let pid: number | undefined;
  for (const line of text.split("\n")) {
    if (line.startsWith("p")) {
      const parsed = Number(line.slice(1));
      pid = Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
    } else if (line.startsWith("n") && pid !== undefined) {
      cwds.set(pid, line.slice(1));
    }
  }
  return cwds;
}

/** Working directories lsof could read; an unreadable set adds no cwds. */
function cwdTable(primitives: OsPrimitives): Map<number, string> {
  try {
    return parseLsof(primitives.exec(LSOF, LSOF_ARGS));
  } catch {
    return new Map();
  }
}

/** The process table, with cwds joined in when `lsof` reports them. */
function processTable(primitives: OsPrimitives): OsProcess[] {
  let ps: string;
  try {
    ps = primitives.exec(PS, PS_ARGS);
  } catch {
    return [];
  }
  const cwds = cwdTable(primitives);
  return parsePs(ps).map((process) => {
    const cwd = cwds.get(process.pid);
    return cwd === undefined ? process : { ...process, cwd };
  });
}

/** The macOS driver over injected primitives. */
export function darwinOs(primitives: OsPrimitives): Os {
  return {
    processes: () => processTable(primitives),
    ...signalApi(primitives),
    ...pathApi(),
    // macOS has shipped bash at this path since 10.0; the default zsh is not
    // a drop-in for gate commands written for bash.
    shell: (command) => ({ executable: "/bin/bash", args: ["-c", command] }),
  };
}
