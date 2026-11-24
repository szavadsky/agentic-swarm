import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FakeHarness } from "../../src/harness/fake/index.js";
import { isInfraCheck, runGates } from "../../src/kernel/gates.js";
import type { KernelRuntime } from "../../src/kernel/types.js";
import { cleanupFlowRepo, makeRuntime, setupFlowRepo } from "./s2-helpers.js";

/** Shell single-quotes a path, so a temp dir with a quote cannot break a gate. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * A gate that logs its start and end in `shared/order.log`, leaves its worktree
 * marked active in `shared` and waits for a peer. Two runs that are not
 * serialized both reach the wait, so the overlap file appears deterministically;
 * a serialized pair never sees a peer.
 */
function overlapGate(shared: string): string {
  return [
    `shared=${shellQuote(shared)}`,
    `printf 'start %s\\n' "$(basename "$PWD")" >> "$shared/order.log"`,
    'marker="$shared/active.$(basename "$PWD")"',
    'touch "$marker"',
    "for _ in $(seq 1 40); do",
    '  others=$(find "$shared" -maxdepth 1 -name \'active.*\' ! -name "$(basename "$marker")" | wc -l)',
    '  if [ "$others" -ge 1 ]; then touch "$shared/overlap"; break; fi',
    "  sleep 0.05",
    "done",
    'rm -f "$marker"',
    `printf 'end %s\\n' "$(basename "$PWD")" >> "$shared/order.log"`,
  ].join("\n");
}

/** A gate that names its worktree and holds its place in the shared log. */
function timedGate(log: string): string {
  const file = shellQuote(log);
  const stamp = `"$(basename "$PWD")"`;
  return `printf 'start %s\\n' ${stamp} >> ${file}; sleep 0.4; printf 'end %s\\n' ${stamp} >> ${file}`;
}

/** A shared scratch dir outside both worktrees; removed by the caller. */
function sharedDir(kind: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `gate-${kind}-`));
}

function logKinds(log: string): string[] {
  return fs
    .readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => line.split(" ")[0] ?? "");
}

/** The worktree names in the log's `start` lines, in the order they started. */
function startedTrees(log: string): string[] {
  return fs
    .readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("start "))
    .map((line) => line.slice("start ".length));
}

describe("gate runs across worktrees", () => {
  gateRunsAcrossWorktreesPart1();
  gateRunsAcrossWorktreesPart2();
  gateRunsAcrossWorktreesPart3();
  gateRunsAcrossWorktreesPart4();
  gateRunsAcrossWorktreesPart5();
  gateRunsAcrossWorktreesPart6();
});

function gateRunsAcrossWorktreesPart1() {
  it("runs two worktrees' gates concurrently when no gate declares a mutex", async () => {
    const shared = sharedDir("parallel");
    const { repo, goal } = setupFlowRepo({
      gates: [{ id: "probe", command: overlapGate(shared) }],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const first = repo.createWorktree("probe-a");
      const second = repo.createWorktree("probe-b");

      const [a, b] = await Promise.all([
        runGates(runtime, first),
        runGates(runtime, second),
      ]);

      expect(a.map((check) => check.ok)).toEqual([true]);
      expect(b.map((check) => check.ok)).toEqual([true]);
      expect(fs.existsSync(path.join(shared, "overlap"))).toBe(true);
    } finally {
      cleanupFlowRepo(repo);
      fs.rmSync(shared, { recursive: true, force: true });
    }
  }, 30_000);
}

function gateRunsAcrossWorktreesPart2() {
  it("serializes two worktrees' gates that name the same mutex", async () => {
    const shared = sharedDir("serial");
    const log = path.join(shared, "order.log");
    const { repo, goal } = setupFlowRepo({
      gates: [
        { id: "probe", command: overlapGate(shared), serial: ["shared-port"] },
      ],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const first = repo.createWorktree("probe-a");
      const second = repo.createWorktree("probe-b");

      const [a, b] = await Promise.all([
        runGates(runtime, first),
        runGates(runtime, second),
      ]);

      expect(a.map((check) => check.ok)).toEqual([true]);
      expect(b.map((check) => check.ok)).toEqual([true]);
      // Both worktrees hold the same repo-scoped mutex, so neither can see the
      // other's active marker, and one gate's end precedes the other's start.
      expect(fs.existsSync(path.join(shared, "overlap"))).toBe(false);
      expect(logKinds(log)).toEqual(["start", "end", "start", "end"]);
      expect(startedTrees(log).sort()).toEqual(
        [path.basename(first), path.basename(second)].sort(),
      );
    } finally {
      cleanupFlowRepo(repo);
      fs.rmSync(shared, { recursive: true, force: true });
    }
  }, 30_000);
}

function gateRunsAcrossWorktreesPart3() {
  it("gives each worktree its own declared env dirs", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [
        {
          id: "probe",
          command:
            'printf \'%s\\n%s\\n\' "$GATE_SCRATCH" "$PWD" > "$GATE_SCRATCH/where"',
          env: { GATE_SCRATCH: ".cache/gate-scratch" },
        },
      ],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const trees = [repo.createWorktree("probe-a")];
      trees.push(repo.createWorktree("probe-b"));

      const runs = await Promise.all(
        trees.map((tree) => runGates(runtime, tree)),
      );
      expect(runs.map((checks) => checks[0]?.ok)).toEqual([true, true]);

      for (const tree of trees) {
        const scratch = path.join(tree, ".cache/gate-scratch");
        expect(fs.existsSync(scratch)).toBe(true);
        const [reportedDir, reportedCwd = ""] = fs
          .readFileSync(path.join(scratch, "where"), "utf8")
          .trim()
          .split("\n");
        expect(reportedDir).toBe(scratch);
        expect(fs.realpathSync(reportedCwd)).toBe(fs.realpathSync(tree));
      }
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 30_000);
}

function gateRunsAcrossWorktreesPart4() {
  it("reports an uncreatable env dir as infra, not a rejected run", async () => {
    const { repo, goal } = setupFlowRepo({
      gates: [
        {
          id: "probe",
          command: "printf ran > gate-ran.txt",
          env: { GATE_SCRATCH: "blocked" },
        },
      ],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const tree = repo.createWorktree("probe-blocked");
      fs.writeFileSync(path.join(tree, "blocked"), "not a directory");

      const checks = await runGates(runtime, tree);

      expect(checks).toHaveLength(1);
      expect(checks[0]?.ok).toBe(false);
      expect(isInfraCheck(checks[0]!)).toBe(true);
      expect(checks[0]?.summary).toBe("exit 126");
      expect(checks[0]?.output).toContain("GATE_SCRATCH");
      expect(checks[0]?.output).toContain("blocked");
      // The failing directory must not run the gate's command.
      expect(fs.existsSync(path.join(tree, "gate-ran.txt"))).toBe(false);
    } finally {
      cleanupFlowRepo(repo);
    }
  }, 10_000);
}

function gateRunsAcrossWorktreesPart5() {
  it("holds mutexes in name order, so opposite declarations cannot deadlock", async () => {
    const shared = sharedDir("order");
    const log = path.join(shared, "order.log");
    const { repo, goal } = setupFlowRepo({
      gates: [
        { id: "probe", command: timedGate(log), serial: ["alpha", "beta"] },
      ],
    });
    try {
      const runtime = await makeRuntime(repo, goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const reversed: KernelRuntime = {
        ...runtime,
        configs: {
          ...runtime.configs,
          repo: {
            ...runtime.configs.repo,
            gates: runtime.configs.repo.gates.map((gate) => ({
              ...gate,
              serial: [...gate.serial].reverse(),
            })),
          },
        },
      };
      // Same worktree, two gates with opposite serial order: sorted order
      // inside one runGateCommand keeps them deadlock-free.
      const tree = repo.createWorktree("probe-a");

      const [a, b] = await Promise.all([
        runGates(runtime, tree),
        runGates(reversed, tree),
      ]);

      expect(a[0]?.ok).toBe(true);
      expect(b[0]?.ok).toBe(true);
      expect(logKinds(log)).toEqual(["start", "end", "start", "end"]);
    } finally {
      cleanupFlowRepo(repo);
      fs.rmSync(shared, { recursive: true, force: true });
    }
  }, 10_000);
}

function gateRunsAcrossWorktreesPart6() {
  it("runs same-named serial gates of different repositories concurrently", async () => {
    const shared = sharedDir("cross-repo");
    const first = setupFlowRepo({
      gates: [
        { id: "probe", command: overlapGate(shared), serial: ["shared-port"] },
      ],
    });
    const second = setupFlowRepo({
      gates: [
        { id: "probe", command: overlapGate(shared), serial: ["shared-port"] },
      ],
    });
    try {
      const firstRuntime = await makeRuntime(first.repo, first.goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const secondRuntime = await makeRuntime(second.repo, second.goal, {
        fake: new FakeHarness({ id: "fake" }),
      });
      const firstTree = first.repo.createWorktree("probe-a");
      const secondTree = second.repo.createWorktree("probe-b");

      const [a, b] = await Promise.all([
        runGates(firstRuntime, firstTree),
        runGates(secondRuntime, secondTree),
      ]);

      expect(a.map((check) => check.ok)).toEqual([true]);
      expect(b.map((check) => check.ok)).toEqual([true]);
      // Each repository keys its own mutex, so the two gates run together.
      expect(fs.existsSync(path.join(shared, "overlap"))).toBe(true);
    } finally {
      cleanupFlowRepo(first.repo);
      cleanupFlowRepo(second.repo);
      fs.rmSync(shared, { recursive: true, force: true });
    }
  }, 30_000);
}
