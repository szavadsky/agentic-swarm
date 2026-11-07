import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runProcess } from "../proc.js";
import type { GateBaselineEntry, GatesBaselineArtifact, InfraGate, TestRunnerConfig } from "../artifacts.js";
import { readYaml, writeYamlAtomic } from "../records/io.js";
import { commitAll } from "../git/commit.js";
import { tailCap, type CheckContext } from "./types.js";
import { appendJournal } from "../journal.js";
import { git } from "../git/exec.js";
import type { StatusEntry } from "../git/status.js";
import { buildGateWithJunitCommand, parseJunit, type ParsedJunit } from "./junit.js";

/** Marker embedded in gate details when the gate command timed out. */
export const GATE_TIMED_OUT_MARKER = "gate timed out";

export interface WorktreeSnapshot {
  entries: StatusEntry[];
  map: Map<string, string>;
  raw: string;
}

export interface WorktreeMutation {
  mutatesWorktree: boolean;
  trackedChanged: string[];
  untrackedCreated: string[];
  message?: string;
}

/**
 * Snapshots current worktree status using `git status --porcelain -z --untracked-files=all`.
 */
export async function snapshotWorktree(wt: string): Promise<WorktreeSnapshot> {
  const res = await git(wt, ["status", "--porcelain", "-z", "--untracked-files=all"], {
    allowFail: true,
  });
  const raw = res.stdout ?? "";
  const entries: StatusEntry[] = [];
  if (raw.length > 0) {
    const tokens = raw.split("\0");
    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token === undefined || token === "") {
        i++;
        continue;
      }
      const code = token.slice(0, 2);
      const entryPath = token.slice(3);
      if (code[0] === "R" || code[0] === "C") {
        const from = tokens[i + 1] ?? "";
        entries.push({ code, path: entryPath, from });
        i += 2;
      } else {
        entries.push({ code, path: entryPath });
        i++;
      }
    }
  }
  const map = new Map<string, string>();
  for (const e of entries) {
    map.set(e.path, e.code);
  }
  return { entries, map, raw };
}

/**
 * Compares current worktree against snapshot. If changed, restores it exactly:
 * - Tracked files: reset and checkout from HEAD
 * - Untracked created by command: remove
 */
export async function checkAndRestoreWorktreeMutation(
  wt: string,
  snapshot: WorktreeSnapshot
): Promise<WorktreeMutation> {
  const currentSnapshot = await snapshotWorktree(wt);

  if (currentSnapshot.raw === snapshot.raw) {
    return {
      mutatesWorktree: false,
      trackedChanged: [],
      untrackedCreated: [],
    };
  }

  const untrackedCreated: string[] = [];
  const trackedChanged: string[] = [];

  for (const [pathKey, code] of currentSnapshot.map.entries()) {
    if (pathKey.endsWith("journal.ndjson") || pathKey === "journal.ndjson") {
      continue;
    }
    if (code === "??") {
      if (!snapshot.map.has(pathKey)) {
        untrackedCreated.push(pathKey);
      }
    } else {
      const prevCode = snapshot.map.get(pathKey);
      if (prevCode !== code) {
        trackedChanged.push(pathKey);
      }
    }
  }

  // Check if any tracked file in snapshot was removed
  for (const [prevPath, prevCode] of snapshot.map.entries()) {
    if (!currentSnapshot.map.has(prevPath)) {
      if (prevCode !== "??") {
        trackedChanged.push(prevPath);
      }
    }
  }

  const mutatesWorktree = untrackedCreated.length > 0 || trackedChanged.length > 0;

  if (!mutatesWorktree) {
    return {
      mutatesWorktree: false,
      trackedChanged: [],
      untrackedCreated: [],
    };
  }

  // Restore untracked created by the gate/check: remove
  for (const relPath of untrackedCreated) {
    const fullPath = path.join(wt, relPath);
    try {
      await fs.promises.rm(fullPath, { recursive: true, force: true });
      let dir = path.dirname(fullPath);
      while (dir !== wt && dir.startsWith(wt)) {
        try {
          await fs.promises.rmdir(dir);
          dir = path.dirname(dir);
        } catch {
          break;
        }
      }
    } catch {}
  }

  // Restore tracked: checkout
  for (const relPath of trackedChanged) {
    await git(wt, ["reset", "HEAD", "--", relPath], { allowFail: true });
    await git(wt, ["checkout", "HEAD", "--", relPath], { allowFail: true });
  }

  const parts: string[] = [];
  if (trackedChanged.length > 0) {
    parts.push(`modified tracked files (${trackedChanged.join(", ")})`);
  }
  if (untrackedCreated.length > 0) {
    parts.push(`created untracked files (${untrackedCreated.join(", ")})`);
  }

  const message = `Worktree mutation detected: command ${parts.join(" and ")}; worktree restored.`;

  return {
    mutatesWorktree: true,
    trackedChanged,
    untrackedCreated,
    message,
  };
}

/**
 * Determines whether an infra gate corresponds to the configured test runner.
 */
export function isTestRunnerGate(
  gate: InfraGate,
  runner?: TestRunnerConfig
): boolean {
  if (!runner || !runner.command) return false;
  const gateCmd = gate.command.trim();
  const runCmd = runner.command.trim();
  if (gateCmd === runCmd) return true;
  if (gateCmd.startsWith(runCmd + " ") || runCmd.startsWith(gateCmd + " ")) return true;
  const gateExec = path.basename(gateCmd.split(/\s+/)[0] ?? "");
  const runExec = path.basename(runCmd.split(/\s+/)[0] ?? "");
  if (
    gateExec &&
    runExec &&
    gateExec === runExec &&
    (gateExec.includes("test") ||
      gateExec.includes("pytest") ||
      gateExec.includes("jest") ||
      gateExec.includes("vitest"))
  ) {
    return true;
  }
  const gateId = gate.id.toLowerCase();
  if (
    gateId === "test" ||
    gateId === "tests" ||
    gateId === "test-runner" ||
    gateId === "unit-tests" ||
    gateId === "unit"
  ) {
    return true;
  }
  if (gateCmd.includes(runCmd) || runCmd.includes(gateCmd)) {
    return true;
  }
  return false;
}

/**
 * Re-derives baseline failing test ids for a test runner gate with junitArg
 * when the recorded baseline lacks them (e.g. recorded in the old format).
 * Executes the gate at the commit that recorded gates-baseline.yaml in a temporary
 * detached worktree, runs infra.setup first, parses JUnit output, persists the ids
 * into gates-baseline.yaml (committed via factory commit), and returns the ids.
 */
export async function rederiveBaselineFailingTests(
  gate: InfraGate,
  testRunner: TestRunnerConfig,
  baseEntry: GateBaselineEntry,
  ctx: CheckContext,
  timeoutSec: number
): Promise<{ failingTests: string[]; collectionErrors: string[] }> {
  const taskDir =
    ctx.taskDir ??
    (ctx.task && ctx.taskWt
      ? path.join(ctx.taskWt, ctx.project.orchestrationFolder ?? ".factory", ctx.task)
      : undefined);
  const taskWt = ctx.taskWt ?? ctx.wt;
  let baselinePath = taskDir ? path.join(taskDir, "gates-baseline.yaml") : undefined;
  if (!baselinePath || !fs.existsSync(baselinePath)) {
    const candidate1 = path.join(
      taskWt,
      ctx.project.orchestrationFolder ?? ".factory",
      ctx.task ?? "",
      "gates-baseline.yaml"
    );
    const candidate2 = path.join(taskWt, "gates-baseline.yaml");
    if (fs.existsSync(candidate1)) baselinePath = candidate1;
    else if (fs.existsSync(candidate2)) baselinePath = candidate2;
  }

  let baselineSha = "HEAD";
  if (baselinePath && fs.existsSync(baselinePath)) {
    const relBaselinePath = path.relative(taskWt, baselinePath);
    const logRes = await git(taskWt, ["log", "-1", "--format=%H", "--", relBaselinePath], {
      allowFail: true,
    });
    const sha = logRes.stdout.trim();
    if (sha && /^[0-9a-f]{40}$/i.test(sha)) {
      baselineSha = sha;
    } else if (ctx.repo?.mainRoot) {
      const logResMain = await git(
        ctx.repo.mainRoot,
        ["log", "-1", "--format=%H", "--", relBaselinePath],
        { allowFail: true }
      );
      const shaMain = logResMain.stdout.trim();
      if (shaMain && /^[0-9a-f]{40}$/i.test(shaMain)) {
        baselineSha = shaMain;
      }
    }
  }

  const repoRoot = ctx.repo?.mainRoot ?? taskWt;
  const tempWtDir = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-derive-wt-"));
  const tmpJunit = path.join(
    os.tmpdir(),
    `junit-rederive-${gate.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.xml`
  );

  let derivedFailingTests: string[] = [];
  let derivedCollectionErrors: string[] = [];

  try {
    if (ctx.repo?.writeLock) {
      await ctx.repo.writeLock.runExclusive(async () => {
        await git(repoRoot, ["worktree", "add", "--detach", tempWtDir, baselineSha]);
      });
    } else {
      await git(repoRoot, ["worktree", "add", "--detach", tempWtDir, baselineSha]);
    }

    // Run infra.setup commands first
    for (const cmd of ctx.infra?.setup ?? []) {
      await runProcess({ cmd, cwd: tempWtDir, timeoutSec });
    }

    // Run the test gate with junit output
    const cmd = buildGateWithJunitCommand(gate.command, testRunner.junitArg!, tmpJunit);
    await runProcess({
      cmd,
      cwd: tempWtDir,
      timeoutSec,
      maxOutputBytes: ctx.outputBytes,
    });

    if (fs.existsSync(tmpJunit)) {
      const xml = await fs.promises.readFile(tmpJunit, "utf8");
      if (xml.trim()) {
        const parsed = parseJunit(xml);
        derivedFailingTests = parsed.cases
          .filter((c) => c.status === "fail" || c.status === "error")
          .map((c) => c.id);
        derivedCollectionErrors = parsed.errors;
      }
    }
  } finally {
    // Always clean up detached worktree
    try {
      if (ctx.repo?.writeLock) {
        await ctx.repo.writeLock.runExclusive(async () => {
          await git(repoRoot, ["worktree", "remove", "--force", tempWtDir], { allowFail: true });
          await git(repoRoot, ["worktree", "prune"], { allowFail: true });
        });
      } else {
        await git(repoRoot, ["worktree", "remove", "--force", tempWtDir], { allowFail: true });
        await git(repoRoot, ["worktree", "prune"], { allowFail: true });
      }
    } catch {}
    if (fs.existsSync(tempWtDir)) {
      try {
        await fs.promises.rm(tempWtDir, { recursive: true, force: true });
      } catch {}
    }
    if (fs.existsSync(tmpJunit)) {
      try {
        await fs.promises.rm(tmpJunit, { force: true });
      } catch {}
    }
  }

  // Persist ids into baseEntry
  baseEntry.failingTests = derivedFailingTests;
  if (derivedCollectionErrors.length > 0) {
    baseEntry.collectionErrors = derivedCollectionErrors;
  }

  // Persist into gates-baseline.yaml file on disk and commit
  if (baselinePath && fs.existsSync(baselinePath)) {
    try {
      const fileBaseline = await readYaml<GatesBaselineArtifact>(baselinePath);
      if (fileBaseline?.gates) {
        const entry = fileBaseline.gates.find((g) => g.id === gate.id);
        if (entry) {
          entry.failingTests = derivedFailingTests;
          if (derivedCollectionErrors.length > 0) {
            entry.collectionErrors = derivedCollectionErrors;
          }
          await writeYamlAtomic(baselinePath, fileBaseline);

          const relPath = path.relative(taskWt, baselinePath);
          if (ctx.repo && typeof ctx.repo.identityEnv === "function" && ctx.repo.writeLock) {
            await commitAll(
              ctx.repo,
              taskWt,
              `factory: backfill gates-baseline failing tests for ${gate.id}`,
              { paths: [relPath] }
            );
          } else {
            await git(taskWt, ["add", "--", relPath], { allowFail: true });
            await git(
              taskWt,
              ["commit", "-m", `factory: backfill gates-baseline failing tests for ${gate.id}`],
              { allowFail: true }
            );
          }
        }
      }
    } catch {}
  }

  return { failingTests: derivedFailingTests, collectionErrors: derivedCollectionErrors };
}

/**
 * Runs infrastructure verification gates.
 * Invariants:
 * - Ratchet: Any gate that was "pass" (green) in baseline must stay green.
 * - Retries: Failed gates are retried up to limits.gateRetries. Gates that pass on retry are marked "flaky".
 * - Resilience: Non-baseline-green gates are reported in results but do not fail the check.
 * - Timeouts: every attempt is bounded by limits.gateTimeoutSec (default 900s); a
 *   timeout fails the attempt and is reported distinctly in details.
 */
export async function runGates(
  ctx: CheckContext,
  opts?: { record?: boolean }
): Promise<{ results: GateBaselineEntry[]; ok: boolean }> {
  if (!ctx.infra?.gates || ctx.infra.gates.length === 0) {
    return { results: [], ok: true };
  }

  const retries = ctx.limits.gateRetries ?? 0;
  const rawTimeout = ctx.limits.gateTimeoutSec as number | undefined;
  const timeoutSec = typeof rawTimeout === "number" && rawTimeout > 0 ? rawTimeout : 900;
  const results: GateBaselineEntry[] = [];
  let overallOk = true;

  for (const gate of ctx.infra.gates) {
    let attempt = 0;
    let passedOnce = false;
    let failedOnce = false;
    let timedOut = false;
    let mutatesWorktree = false;
    let finalStatus: "pass" | "fail" | "flaky" = "fail";
    let lastOutput = "";
    let mutationMessage = "";
    let lastParsedJunit: ParsedJunit | undefined;

    const testRunner = ctx.infra.testRunner;
    const isTestGate = isTestRunnerGate(gate, testRunner);
    const hasJunit = isTestGate && Boolean(testRunner?.junitArg && testRunner.junitArg.trim());

    const startTime = Date.now();

    while (attempt <= retries) {
      const snapshot = await snapshotWorktree(ctx.wt);

      let cmdToRun = gate.command;
      let tmpJunit: string | undefined;

      if (hasJunit) {
        tmpJunit = path.join(
          os.tmpdir(),
          `junit-gate-${gate.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.xml`
        );
        cmdToRun = buildGateWithJunitCommand(gate.command, testRunner!.junitArg!, tmpJunit);
      }

      let res = await runProcess({
        cmd: cmdToRun,
        cwd: ctx.wt,
        timeoutSec,
        maxOutputBytes: ctx.outputBytes,
      });
      if ((res.timedOut || res.code !== 0) && res.suspendDetected) {
        const taskDir =
          ctx.taskDir ??
          (ctx.task && ctx.taskWt
            ? path.join(ctx.taskWt, ctx.project.orchestrationFolder ?? ".factory", ctx.task)
            : undefined);
        if (taskDir && fs.existsSync(taskDir)) {
          try {
            await appendJournal(taskDir, {
              type: "system_suspend_detected",
              task: ctx.task,
              gate: gate.id,
              gapMs: Math.round(res.suspendGapMs ?? 0),
            });
          } catch {}
        }
        // Interrupted by suspend: re-run once without recording failure or consuming attempt
        res = await runProcess({
          cmd: cmdToRun,
          cwd: ctx.wt,
          timeoutSec,
          maxOutputBytes: ctx.outputBytes,
        });
      }

      // Check mutation guard after gate run
      const mutation = await checkAndRestoreWorktreeMutation(ctx.wt, snapshot);
      if (mutation.mutatesWorktree) {
        mutatesWorktree = true;
        mutationMessage = mutation.message ?? "Gate mutated the worktree";

        const taskDir =
          ctx.taskDir ??
          (ctx.task && ctx.taskWt
            ? path.join(ctx.taskWt, ctx.project.orchestrationFolder ?? ".factory", ctx.task)
            : undefined);
        if (taskDir && fs.existsSync(taskDir)) {
          try {
            await appendJournal(taskDir, {
              type: "worktree_mutation_detected",
              task: ctx.task,
              gate: gate.id,
              command: gate.command,
              tracked: mutation.trackedChanged,
              untracked: mutation.untrackedCreated,
              summary: mutationMessage,
            });
          } catch {}
        }
      }

      // Read and parse JUnit XML report if expected
      if (tmpJunit) {
        try {
          if (fs.existsSync(tmpJunit)) {
            const xml = await fs.promises.readFile(tmpJunit, "utf8");
            if (xml.trim()) {
              lastParsedJunit = parseJunit(xml);
            }
          }
        } finally {
          try {
            await fs.promises.unlink(tmpJunit);
          } catch {}
        }
        if (!lastParsedJunit && res.code !== 0 && !res.timedOut) {
          lastParsedJunit = {
            collected: false,
            errors: [`Test runner exited with code ${res.code} but generated no JUnit XML`],
            cases: [],
          };
        }
      }

      lastOutput = (res.stdout + (res.stderr ? "\n" + res.stderr : "")).trim();

      if (res.timedOut) {
        timedOut = true;
        failedOnce = true;
        attempt++;
        continue;
      }

      if (mutatesWorktree) {
        failedOnce = true;
        finalStatus = "fail";
        break;
      }

      if (res.code === 0) {
        passedOnce = true;
        finalStatus = failedOnce ? "flaky" : "pass";
        break;
      } else {
        failedOnce = true;
        attempt++;
      }
    }

    if (!passedOnce) {
      finalStatus = "fail";
    }

    const durationMs = Date.now() - startTime;
    let details = timedOut
      ? `${lastOutput}\n[${GATE_TIMED_OUT_MARKER} after ${timeoutSec}s]`.trim()
      : lastOutput;

    if (mutatesWorktree) {
      details = `${details}\n[${mutationMessage}]`.trim();
    }

    const gateEntry: GateBaselineEntry = {
      id: gate.id,
      command: gate.command,
      status: finalStatus,
      durationMs,
      details: tailCap(details, ctx.outputBytes),
      ...(mutatesWorktree ? { mutatesWorktree: true } : {}),
    };

    let failingCaseIds: string[] = [];
    let collectionErrors: string[] = [];

    if (hasJunit && lastParsedJunit) {
      failingCaseIds = lastParsedJunit.cases
        .filter((c) => c.status === "fail" || c.status === "error")
        .map((c) => c.id);
      collectionErrors = lastParsedJunit.errors;

      if (failingCaseIds.length > 0) {
        gateEntry.failingTests = failingCaseIds;
      }
      if (collectionErrors.length > 0) {
        gateEntry.collectionErrors = collectionErrors;
      }
    }

    // Ratchet evaluation:
    if (opts?.record) {
      // Baseline recording: failing gate or mutation marks overallOk false
      if (finalStatus === "fail" || mutatesWorktree) {
        overallOk = false;
      }
    } else if (ctx.baseline) {
      const baseEntry = ctx.baseline.gates.find((g) => g.id === gate.id);
      if (hasJunit && baseEntry) {
        // Handle old-format baseline lacking failing test ids (re-derive from baseline commit)
        if (baseEntry.status !== "pass" && baseEntry.failingTests === undefined) {
          await rederiveBaselineFailingTests(gate, testRunner!, baseEntry, ctx, timeoutSec);
        }

        // Per-test ratchet for test runner gates with junit:
        const baseFailingSet = new Set(baseEntry.failingTests ?? []);
        const baseCollectionErrors = new Set(baseEntry.collectionErrors ?? []);

        const newFailing = failingCaseIds.filter((id) => !baseFailingSet.has(id));
        const newCollectionErrors = collectionErrors.filter((e) => !baseCollectionErrors.has(e));

        // Newly passing baseline failures are reported as improvements
        const currentPassed = new Set(
          lastParsedJunit?.cases.filter((c) => c.status === "pass").map((c) => c.id) ?? []
        );
        const improvements = (baseEntry.failingTests ?? []).filter((id) =>
          currentPassed.has(id)
        );
        if (improvements.length > 0) {
          gateEntry.improvements = improvements;
        }

        const junitMissingOnFailure =
          finalStatus === "fail" &&
          (!lastParsedJunit || (!lastParsedJunit.collected && lastParsedJunit.cases.length === 0));

        const hasNewFailures =
          newFailing.length > 0 ||
          newCollectionErrors.length > 0 ||
          junitMissingOnFailure;

        if (hasNewFailures || mutatesWorktree || timedOut) {
          overallOk = false;
          gateEntry.status = "fail";
          if (newFailing.length > 0) {
            gateEntry.details = `${gateEntry.details ?? ""}\n[New failing tests: ${newFailing.join(", ")}]`.trim();
          }
          if (newCollectionErrors.length > 0) {
            gateEntry.details = `${gateEntry.details ?? ""}\n[New collection errors: ${newCollectionErrors.join("; ")}]`.trim();
          }
        } else {
          // Ratchet passed: no new failures beyond baseline!
          gateEntry.status = "pass";
          if (improvements.length > 0) {
            gateEntry.details = `${gateEntry.details ?? ""}\n[Improvements: ${improvements.join(", ")}]`.trim();
          }
        }
      } else {
        // Gate without junit: stays as today (documented)
        const wasGreen = baseEntry ? baseEntry.status === "pass" : false;
        if (finalStatus === "fail" || mutatesWorktree) {
          if (wasGreen || mutatesWorktree) {
            overallOk = false;
          }
          // Non-baseline-green gate: reported in results but does not fail overallOk unless mutatesWorktree
        }
      }
    } else {
      // No baseline: any failure fails
      if (finalStatus === "fail" || mutatesWorktree) {
        overallOk = false;
      }
    }

    results.push(gateEntry);
  }

  return { results, ok: overallOk };
}

/** True when a gate result entry recorded a command timeout. */
export function gateTimedOut(entry: GateBaselineEntry): boolean {
  return !!entry.details?.includes(GATE_TIMED_OUT_MARKER);
}
