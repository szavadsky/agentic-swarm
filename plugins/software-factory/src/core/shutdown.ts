import fs from "node:fs";
import { readYaml, writeYamlAtomic } from "./records/io.js";
import { appendJournal } from "./journal.js";
import type { StepMetaArtifact } from "./artifacts.js";

export interface ActiveStepRecord {
  recordDir: string;
  metaPath: string;
  taskDir: string;
}

const activeChildGroups = new Set<number>();
const activeSteps = new Map<string, ActiveStepRecord>();
let signalHandlersInstalled = false;
let activeUninstall: (() => void) | undefined;

/**
 * Registers an active child process group PID.
 */
export function registerChildGroup(pid: number): void {
  if (pid > 0) {
    activeChildGroups.add(pid);
  }
}

/**
 * Unregisters a child process group PID upon exit.
 */
export function unregisterChildGroup(pid: number): void {
  activeChildGroups.delete(pid);
}

/**
 * Returns all currently registered child group PIDs.
 */
export function getActiveChildGroups(): number[] {
  return Array.from(activeChildGroups);
}

/**
 * Registers an active running step record.
 */
export function registerActiveStep(step: ActiveStepRecord): void {
  activeSteps.set(step.recordDir, step);
}

/**
 * Unregisters a finished step record.
 */
export function unregisterActiveStep(recordDir: string): void {
  activeSteps.delete(recordDir);
}

/**
 * Returns all currently active step records.
 */
export function getActiveSteps(): ActiveStepRecord[] {
  return Array.from(activeSteps.values());
}

/**
 * Terminates a single child process group by PID (SIGTERM then SIGKILL).
 * Ensures it NEVER kills the factory's own process group (requires pid > 0).
 */
export function terminateChildGroup(pid: number, signal: "SIGTERM" | "SIGKILL" = "SIGTERM"): void {
  if (pid <= 0) return;
  try {
    process.kill(-pid, signal);
  } catch (err: any) {
    if (err?.code !== "ESRCH") {
      try {
        process.kill(pid, signal);
      } catch {}
    }
  }
}

/**
 * Terminates all registered child process groups (SIGTERM followed by SIGKILL after grace period).
 */
export async function terminateAllChildGroups(graceMs = 500): Promise<void> {
  const pids = Array.from(activeChildGroups);
  if (pids.length === 0) return;

  // 1. Send SIGTERM to all child groups
  for (const pid of pids) {
    terminateChildGroup(pid, "SIGTERM");
  }

  // 2. Wait up to graceMs
  if (graceMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, graceMs));
  }

  // 3. For any still active, send SIGKILL
  for (const pid of pids) {
    terminateChildGroup(pid, "SIGKILL");
  }

  activeChildGroups.clear();
}

/**
 * Marks all currently registered active step records with status "interrupted" cleanly.
 */
export async function markActiveStepsInterrupted(signalName?: string): Promise<void> {
  const steps = Array.from(activeSteps.entries());
  for (const [recordDir, step] of steps) {
    try {
      if (fs.existsSync(step.metaPath)) {
        const meta = await readYaml<StepMetaArtifact>(step.metaPath);
        if (meta.status === "started") {
          meta.status = "interrupted";
          meta.endedAt = new Date().toISOString();
          await writeYamlAtomic(step.metaPath, meta);
          await appendJournal(step.taskDir, {
            type: "step_interrupted",
            signal: signalName,
            recordDir,
          });
        }
      }
    } catch {}
    activeSteps.delete(recordDir);
  }
}

/**
 * Installs SIGINT and SIGTERM handlers on the factory process to terminate child
 * groups and mark running steps interrupted cleanly.
 */
export function installShutdownHandlers(onShutdown?: () => Promise<void>): () => void {
  if (signalHandlersInstalled && activeUninstall) {
    return activeUninstall;
  }
  signalHandlersInstalled = true;

  const handleSignal = async (sig: "SIGINT" | "SIGTERM") => {
    try {
      if (onShutdown) {
        try {
          await onShutdown();
        } catch {}
      }
      await terminateAllChildGroups(500);
      await markActiveStepsInterrupted(sig);
    } finally {
      process.exit(sig === "SIGINT" ? 130 : 143);
    }
  };

  const sigintHandler = () => void handleSignal("SIGINT");
  const sigtermHandler = () => void handleSignal("SIGTERM");

  process.once("SIGINT", sigintHandler);
  process.once("SIGTERM", sigtermHandler);

  activeUninstall = () => {
    process.removeListener("SIGINT", sigintHandler);
    process.removeListener("SIGTERM", sigtermHandler);
    signalHandlersInstalled = false;
    activeUninstall = undefined;
  };

  return activeUninstall;
}
