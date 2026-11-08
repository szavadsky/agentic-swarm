import { describe, expect, it } from "bun:test";
import path from "node:path";
import ts from "typescript";

/**
 * Contract tests for the concern/remarkable types (docs/factory.v2.md §18).
 *
 * The story is type-only, so the observable behavior is the public type surface:
 * a fixture that consumes the declared types must compile, and values outside the
 * declared contract must be rejected. Each test compiles its fixture against the
 * real `src/core/artifacts.ts` and fails when the contract is missing or wrong.
 */

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  types: [],
  lib: ["lib.esnext.d.ts"],
};

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (!diagnostic.file) return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
  return `${path.basename(diagnostic.file.fileName)}:${position.line + 1}:${position.character + 1} ${message}`;
}

function typeErrors(source: string): string[] {
  const fixturePath = path.join(import.meta.dir, "__contract_fixture__.ts");
  const host = ts.createCompilerHost(COMPILER_OPTIONS);
  const defaultGetSourceFile = host.getSourceFile.bind(host);

  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
    path.normalize(fileName) === path.normalize(fixturePath)
      ? ts.createSourceFile(fileName, source, languageVersion, true)
      : defaultGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  host.fileExists = (fileName) =>
    path.normalize(fileName) === path.normalize(fixturePath) || ts.sys.fileExists(fileName);
  host.readFile = (fileName) =>
    path.normalize(fileName) === path.normalize(fixturePath) ? source : ts.sys.readFile(fileName);

  const program = ts.createProgram([fixturePath], COMPILER_OPTIONS, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter(
      (diagnostic) =>
        !diagnostic.file || path.normalize(diagnostic.file.fileName) === path.normalize(fixturePath)
    )
    .map(formatDiagnostic);
}

describe("Concern artifact types", () => {
  it("exposes structured concerns and remarkable decisions with strict vocabularies", () => {
    const errors = typeErrors(`
import type {
  Concern,
  ConcernKind,
  ConcernSeverity,
  ConcernStatus,
  RemarkableDecision,
} from "../../src/core/artifacts.js";

const kinds: ConcernKind[] = ["tech-debt", "assumption", "blocker", "risk", "question"];
const severities: ConcernSeverity[] = ["low", "medium", "high"];
const statuses: ConcernStatus[] = ["open", "dismissed", "routed", "resolved"];

const concern: Concern = {
  id: "c-0123456789",
  kind: "blocker",
  summary: "Dependent item has no implementation",
  detail: "Wave 2 depends on an API that does not exist",
  location: { file: "src/core/example.ts", line: 10 },
  severity: "high",
  affects: ["dep-item"],
};

const minimal: Concern = {
  kind: "question",
  summary: "Which involvement mode applies?",
  detail: "The task does not pin a mode",
  severity: "low",
};

const remarkable: RemarkableDecision = {
  chosen: "Atomic YAML writes",
  alternatives: ["One monolithic file", "A database"],
  why: "Keeps concerns/ diffable and conflict-free",
};

// @ts-expect-error unknown concern kinds are rejected
const badKind: ConcernKind = "bug";
// @ts-expect-error unknown severities are rejected
const badSeverity: ConcernSeverity = "critical";
// @ts-expect-error unknown statuses are rejected
const badStatus: ConcernStatus = "pending";
// @ts-expect-error remarkable decisions must list alternatives
const badDecision: RemarkableDecision = { chosen: "x", why: "y" };
// @ts-expect-error concerns require a summary
const badConcern: Concern = { kind: "risk", detail: "x", severity: "low" };

export const contract = {
  kinds,
  severities,
  statuses,
  concern,
  minimal,
  remarkable,
  badKind,
  badSeverity,
  badStatus,
  badDecision,
  badConcern,
};
`);
    expect(errors).toEqual([]);
  });

  it("stores concern lifecycle metadata including pending resolution and escalation", () => {
    const errors = typeErrors(`
import type { StoredConcernArtifact } from "../../src/core/artifacts.js";

const stored: StoredConcernArtifact = {
  id: "c-0123456789",
  kind: "tech-debt",
  summary: "Duplicated validation",
  detail: "Validation is duplicated between schemas and runtime",
  severity: "medium",
  affects: ["item-a"],
  status: "routed",
  disposition: "optional",
  dismissReason: "Duplicate of an existing concern",
  source: {
    record: "003-develop-a1",
    agent: "developer",
    step: "develop",
    item: "item-a",
    iteration: 2,
    escalated: true,
  },
  pendingResolution: {
    action: "carry",
    note: "Needs an architect decision",
    by: "wave-close-up",
    at: "2026-11-07T00:00:00.000Z",
  },
  createdAt: "2026-11-07T00:00:00.000Z",
  updatedAt: "2026-11-07T00:00:00.000Z",
};

const withoutPending: StoredConcernArtifact = {
  id: "c-9876543210",
  kind: "risk",
  summary: "Flaky merge",
  detail: "Wave merge can race with a concurrent item",
  severity: "high",
  status: "open",
  source: { record: "004-review-a1", agent: "reviewer", step: "review" },
  createdAt: "2026-11-07T00:00:00.000Z",
  updatedAt: "2026-11-07T00:00:00.000Z",
};

// @ts-expect-error stored concerns require a stable id
const missingId: StoredConcernArtifact = {
  kind: "risk",
  summary: "No id",
  detail: "Missing the stable fingerprint id",
  severity: "low",
  status: "open",
  source: { record: "004-review-a1", agent: "reviewer", step: "review" },
  createdAt: "2026-11-07T00:00:00.000Z",
  updatedAt: "2026-11-07T00:00:00.000Z",
};
const badPending: StoredConcernArtifact["pendingResolution"] = {
  // @ts-expect-error pending actions are resolve, carry, or propagate
  action: "dismiss",
  note: "Not a close-up action",
  by: "wave-close-up",
  at: "2026-11-07T00:00:00.000Z",
};

export const contract = { stored, withoutPending, missingId, badPending };
`);
    expect(errors).toEqual([]);
  });

  it("adds dismiss to review dispositions without a tech-debt value", () => {
    const errors = typeErrors(`
import type { ReviewDisposition, ReviewSuggestion } from "../../src/core/artifacts.js";

const dispositions: ReviewDisposition[] = [
  "fix",
  "optional",
  "architect",
  "human-awareness",
  "human-async",
  "human-stop",
  "dismiss",
];

const triage: ReviewSuggestion = {
  id: "c-0123456789",
  disposition: "dismiss",
  summary: "Not actionable after review",
  detail: "Logged with a reason and kept in concerns/",
};

// @ts-expect-error tech-debt is a concern kind, not a review disposition
const techDebt: ReviewDisposition = "tech-debt";

export const contract = { dispositions, triage, techDebt };
`);
    expect(errors).toEqual([]);
  });

  it("marks plan ADRs as blocking or remarkable", () => {
    const errors = typeErrors(`
import type { PlanAdr } from "../../src/core/artifacts.js";

const blocking: PlanAdr = {
  id: "adr-1",
  title: "Concern store location",
  context: "Item steps commit only the item worktree",
  decision: "Aggregate concerns directly to the task worktree",
  consequences: "Wave merge commits the aggregated files",
  blocking: true,
};

const remarkable: PlanAdr = {
  id: "adr-2",
  title: "Fingerprint fields",
  context: "Rewording detail must not duplicate concerns",
  decision: "Fingerprint kind, summary, location, and affects only",
};

const wrong: PlanAdr = {
  id: "adr-3",
  title: "Wrong flag",
  context: "c",
  decision: "d",
  // @ts-expect-error blocking must be a boolean
  blocking: "yes",
};

export const contract = { blocking, remarkable, wrong };
`);
    expect(errors).toEqual([]);
  });

  it("adds human involvement modes, concern thresholds, and canonical review policy to pipeline config", () => {
    const errors = typeErrors(`
import type { ConcernSeverity, PipelineConfig } from "../../src/core/artifacts.js";

const base: PipelineConfig = {
  models: { roles: {} },
  agents: {},
  flows: { simple: { steps: [] }, story: {}, spike: {} },
  limits: {},
};

const configured: PipelineConfig = {
  models: { roles: {} },
  agents: {},
  flows: { simple: { steps: [] }, story: {}, spike: {} },
  limits: {},
  humanInvolvement: "principal",
  concerns: {
    raiseAllowlist: ["developer", "reviewer", "architect"],
    minDigestSeverity: "medium",
    minBlockingSeverity: "high",
  },
  reviewPolicy: {
    default: ["fix", "optional", "architect", "human-awareness", "human-async"],
    allowedDispositions: ["fix", "optional"],
    reviewer: ["fix", "optional", "dismiss"],
  },
};

const modes: NonNullable<PipelineConfig["humanInvolvement"]>[] = [
  "autonomous",
  "principal",
  "detailed",
];
const canonical: string[] | undefined = configured.reviewPolicy?.default;
const legacy: string[] | undefined = configured.reviewPolicy?.allowedDispositions;
const digest: ConcernSeverity | undefined = configured.concerns?.minDigestSeverity;

// @ts-expect-error human involvement modes are autonomous, principal, or detailed
const badMode: NonNullable<PipelineConfig["humanInvolvement"]> = "manual";
// @ts-expect-error severity thresholds use concern severities
const badThreshold: NonNullable<PipelineConfig["concerns"]>["minBlockingSeverity"] = "critical";
// @ts-expect-error raise allowlists contain agent names
const badRaise: NonNullable<PipelineConfig["concerns"]>["raiseAllowlist"] = [42];

export const contract = {
  base,
  configured,
  modes,
  canonical,
  legacy,
  digest,
  badMode,
  badThreshold,
  badRaise,
};
`);
    expect(errors).toEqual([]);
  });
});
