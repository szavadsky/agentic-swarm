import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createTmpRepo } from "./helpers/tmp-repo.js";
import { FakeHarness } from "../src/harness/fake/fake-harness.js";
import { Repo } from "../src/core/git/repo.js";
import { commitAll } from "../src/core/git/commit.js";
import { ensureTaskWorktree, ensureChildWorktree } from "../src/core/git/worktrees.js";
import { loadPromptLibrary } from "../src/core/prompts.js";
import { runAgentStep, resolveStepSchema } from "../src/core/flows/step-runner.js";
import { tickItemMachine } from "../src/core/flows/item-machine.js";
import { readYaml } from "../src/core/records/io.js";
import type { StepMetaArtifact, PipelineConfig, ProjectConfig, InfraArtifact } from "../src/core/artifacts.js";

describe("Smoke fixes acceptance tests (§6.4, §7, §8, §9)", () => {
  const pluginRoot = path.resolve(import.meta.dir, "..");
  const builtinDir = path.resolve(pluginRoot, "agents");

  it("a prompt rendered for a step contains the generated Output section with the schema's required fields", () => {
    const prompts = loadPromptLibrary({ builtinDir });

    // 1. Triage step prompt
    const triageSchema = resolveStepSchema(pluginRoot, "triage", "triage");
    const renderedTriage = prompts.renderStepPrompt(
      "steps/triage",
      {
        task: "sample-task",
        intent: "sample intent",
        triageCriteria: "sample criteria",
      },
      triageSchema
    );

    expect(renderedTriage).toContain("## Output");
    expect(renderedTriage).toContain("kind (string, required");
    expect(renderedTriage).toContain("rationale (string, required");
    expect(renderedTriage).toContain("citations (array of object, required");
    expect(renderedTriage).toContain("file (string, required)");
    expect(renderedTriage).toContain("size (string, optional");

    // 2. Architect plan prompt
    const planSchema = resolveStepSchema(pluginRoot, "architect", "architect-plan");
    const renderedPlan = prompts.renderStepPrompt(
      "steps/architect-plan",
      {
        task: "sample-task",
        iteration: "1",
        intent: "sample intent",
        context: "sample context",
        limits: "sample limits",
        infra: "sample infra",
        debt: "sample debt",
        steering: "sample steering",
        humanInvolvementCriteria: "sample criteria",
      },
      planSchema
    );

    expect(renderedPlan).toContain("## Output");
    expect(renderedPlan).toContain("iteration (integer, required");
    expect(renderedPlan).toContain("milestones (array of object, required");
    expect(renderedPlan).toContain("itemOutlines (array of object, required");

    // 3. Developer step prompt
    const devSchema = resolveStepSchema(pluginRoot, "developer", "develop");
    const renderedDev = prompts.renderStepPrompt(
      "steps/develop",
      {
        assignment: "sample assignment",
        target: "sample target",
        citations: "sample citations",
      },
      devSchema
    );

    expect(renderedDev).toContain("## Output");
    expect(renderedDev).toContain("status (string, required");
    expect(renderedDev).toContain("summary (string, required");
    expect(renderedDev).toContain("notes (string, optional");

    // 4. Reviewer step prompt
    const reviewSchema = resolveStepSchema(pluginRoot, "reviewer", "review", ["fix", "optional"]);
    const renderedReview = prompts.renderStepPrompt(
      "steps/review",
      {
        assignment: "sample assignment",
        checks: "sample checks",
        diff: "sample diff",
        dispositionsCriteria: "sample dispositions",
        concernsYaml: "",
      },
      reviewSchema
    );

    expect(renderedReview).toContain("## Output");
    expect(renderedReview).toContain("status (string, required");
    expect(renderedReview).toContain("suggestions (array of object, required");
  });

  it("repaired output meta has no error and sets repairedFrom", async () => {
    const tmpRepo = createTmpRepo();
    const wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-fix-meta-wt-"));
    try {
      const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: wtRoot });
      const task = "test-repair-meta";
      const orchFolder = ".factory/tasks";
      const intentPath = path.join(tmpRepo.dir, orchFolder, task, "INTENT.md");
      fs.mkdirSync(path.dirname(intentPath), { recursive: true });
      fs.writeFileSync(intentPath, "# Intent\n", "utf8");

      const taskWtRes = await ensureTaskWorktree(repo, task, {
        intentPath,
        orchestrationFolder: orchFolder,
      });

      const taskDir = path.join(taskWtRes.path, orchFolder, task);
      const runsDir = path.join(taskDir, "runs");
      await fs.promises.mkdir(runsDir, { recursive: true });

      const prompts = loadPromptLibrary({ builtinDir });
      const harness = new FakeHarness();

      // Outcome has error initially, but valid raw text that @simpler repairs
      harness.scriptOutcome(`${task}/runs/triage#a1`, () => {
        return {
          ok: false,
          error: "Agent output failed schema validation: /size: must be string",
          data: `
            kind: simple
            rationale: Zero-risk doc edit
            citations:
              - file: README.md
                lines: 1-5
                anchors: [title]
                summary: Doc citation
          `,
        };
      });

      // complete(@simpler) handler returns valid schema-conforming object
      harness.scriptComplete(() => ({
        kind: "simple",
        rationale: "Zero-risk doc edit",
        citations: [
          {
            file: "README.md",
            lines: "1-5",
            anchors: ["title"],
            summary: "Doc citation",
          },
        ],
      }));

      const pipeline: PipelineConfig = {
        models: {
          roles: {
            workhorse: { model: "fake-workhorse" },
            simpler: { model: "fake-simpler" },
          },
        },
        agents: {
          triage: { role: "workhorse" },
        },
        flows: {
          simple: { steps: [] },
          story: {},
          spike: {},
        },
        limits: {},
      };

      const project: ProjectConfig = {
        orchestrationFolder: orchFolder,
        worktreeRoot: wtRoot,
      };

      const stepRes = await runAgentStep({
        task,
        stepId: "triage",
        stepFragment: "steps/triage",
        agent: "triage",
        cwd: taskWtRes.path,
        taskDir,
        recordsDir: runsDir,
        repo,
        harness,
        pipeline,
        project,
        prompts,
        promptVars: {
          task,
          intent: "Fix doc typo",
          triageCriteria: "simple vs story",
        },
      });

      expect(stepRes.ok).toBe(true);
      expect(stepRes.status).toBe("ok");

      // Verify meta on disk has no error
      const recordEntries = fs.readdirSync(runsDir).filter((e) => e.includes("triage"));
      expect(recordEntries.length).toBe(1);
      const metaPath = path.join(runsDir, recordEntries[0]!, "meta.yaml");
      const meta = await readYaml<StepMetaArtifact>(metaPath);

      expect(meta.status).toBe("ok");
      expect(meta.error).toBeUndefined();
      expect(meta.repairedFrom).toBe("simpler_repair");
    } finally {
      tmpRepo.cleanup();
      fs.rmSync(wtRoot, { recursive: true, force: true });
    }
  });

  it("test-first with valid target passes target-red (real junit-emitting runner script)", async () => {
    const tmpRepo = createTmpRepo();
    const wtRoot = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-fix-target-red-wt-"));
    try {
      const repo = new Repo({ mainRoot: tmpRepo.dir, worktreeRoot: wtRoot });
      const task = "test-target-red-task";
      const orchFolder = ".factory/tasks";
      const itemSlug = "item-test-red";

      // 1. Write real executable JUnit-emitting runner script in wtRoot (outside main checkout)
      const runnerScript = path.join(wtRoot, "test-runner.sh");
      fs.writeFileSync(
        runnerScript,
        `#!/bin/sh
JUNIT_FILE=""
for arg in "$@"; do
  case "$arg" in
    --junit=*) JUNIT_FILE="\${arg#--junit=}" ;;
  esac
done

if [ -z "$JUNIT_FILE" ]; then
  exit 2
fi

# Real JUnit report emitting failure for test_failing_case
cat <<'EOF' > "$JUNIT_FILE"
<testsuite name="unit-tests" tests="1" failures="1" errors="0">
  <testcase classname="test_feature" name="test_failing_case">
    <failure message="AssertionError: expected true but got false">AssertionError</failure>
  </testcase>
</testsuite>
EOF

exit 1
`,
        { mode: 0o755 }
      );

      const intentPath = path.join(tmpRepo.dir, orchFolder, task, "INTENT.md");
      fs.mkdirSync(path.dirname(intentPath), { recursive: true });
      fs.writeFileSync(intentPath, "# Intent for target red\n", "utf8");

      const taskWtRes = await ensureTaskWorktree(repo, task, {
        intentPath,
        orchestrationFolder: orchFolder,
      });

      const taskDir = path.join(taskWtRes.path, orchFolder, task);
      const itemsDir = path.join(taskDir, "items", itemSlug);
      await fs.promises.mkdir(itemsDir, { recursive: true });

      // Create item assignment
      await fs.promises.writeFile(
        path.join(itemsDir, "assignment.yaml"),
        `slug: ${itemSlug}\nkind: dev\ntitle: Add feature\nassignment: Implement feature with tests\nmilestone: m1\nwave: 1\n`,
        "utf8"
      );

      // Create infra artifact pointing to real test runner script
      const infra: InfraArtifact = {
        setup: [],
        gates: [],
        testRunner: {
          command: runnerScript,
          selectorArgs: ["-k"],
          junitArg: "--junit={{path}}",
        },
      };
      await fs.promises.writeFile(path.join(taskDir, "infra.yaml"), JSON.stringify(infra), "utf8");
      await commitAll(repo, taskWtRes.path, "factory: task setup with infra");

      // Child worktree for item
      const parentBranch = `topic/${task}`;
      const childWtRes = await ensureChildWorktree(repo, taskWtRes, itemSlug);
      const childWt = childWtRes.path;

      // Pipeline config with target-red check on test-first step
      const pipeline: PipelineConfig = {
        models: {
          roles: {
            workhorse: { model: "fake-workhorse" },
            simpler: { model: "fake-simpler" },
          },
        },
        agents: {
          developer: { role: "workhorse" },
        },
        flows: {
          simple: { steps: [] },
          story: {
            dev: {
              steps: [
                {
                  id: "test-first",
                  agent: "developer",
                  role: "workhorse",
                  checks: ["target-red"],
                },
              ],
            },
          },
          spike: {},
        },
        limits: {},
      };

      const project: ProjectConfig = {
        orchestrationFolder: orchFolder,
        worktreeRoot: wtRoot,
        paths: {
          tests: ["tests/**"],
          prod: ["src/**"],
        },
      };

      const prompts = loadPromptLibrary({ builtinDir });
      const harness = new FakeHarness();

      // Script test-first step to yield valid target with expectRed matching runner script
      harness.scriptOutcome(`${task}/items/${itemSlug}/test-first#a1`, (run) => {
        // Create the test file
        const testFile = path.join(run.cwd, "tests", "test_feature.py");
        fs.mkdirSync(path.dirname(testFile), { recursive: true });
        fs.writeFileSync(testFile, "def test_failing_case(): assert False\n", "utf8");

        return {
          ok: true,
          data: {
            status: "ok",
            summary: "Created failing test",
            target: {
              selectors: ["test_failing_case"],
              expectRed: ["test_feature.test_failing_case"],
            },
            evidence: ["Ran test runner: test failed as expected"],
          },
        };
      });

      // Execute step via tickItemMachine
      const tickRes = await tickItemMachine({
        task,
        taskDir,
        taskWt: taskWtRes.path,
        childWt,
        parentBranch,
        itemSlug,
        repo,
        harness,
        pipeline,
        project,
        prompts,
      });

      expect(tickRes.stepRan).toBe("test-first");
      expect(tickRes.status).toBe("ready");

      // Verify target-red check was recorded and passed
      const itemRecordsDir = path.join(childWt, orchFolder, task, "items", itemSlug, "steps");
      const recordEntries = fs.readdirSync(itemRecordsDir).filter((e) => e.includes("test-first"));
      expect(recordEntries.length).toBe(1);

      const checksPath = path.join(itemRecordsDir, recordEntries[0]!, "checks.yaml");
      expect(fs.existsSync(checksPath)).toBe(true);
      const checksData = await readYaml<{ checks: Array<{ id: string; status: string; message: string }> }>(checksPath);

      const targetRedCheck = checksData.checks.find((c) => c.id === "target-red");
      expect(targetRedCheck).toBeDefined();
      expect(targetRedCheck?.status).toBe("pass");
    } finally {
      tmpRepo.cleanup();
      fs.rmSync(wtRoot, { recursive: true, force: true });
    }
  });
});
