import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateFile } from "../../src/cli/commands.js";
import { packageRoot } from "../../src/kernel/config.js";
import {
  architectIntentStatusFindings,
  intentStatusSlugFindings,
  parseIntentSlugs,
} from "../../src/kernel/intent-slugs.js";
import { createFolderStore } from "../../src/kernel/store.js";
import type { ArtifactStore, Outcome } from "../../src/kernel/types.js";
import { writeRecordOutcome } from "./outcome-fixtures.js";

const INTENT = [
  "# Factory",
  "",
  "- [[KernelCore]] The kernel is deterministic.",
  "- [[ctxOnly:ModelEconomics]] Costs vary.",
  "",
  "## Status [[ctxOnly:StatusSection]]",
  "",
  "- [[StatusAndDashboard]] The dashboard renders rows.",
  "- [[StatusAndDashboard]] A repeated annotation stays first.",
].join("\n");

function archOutcome(intentStatus: Outcome["intentStatus"]): Outcome {
  return {
    status: "done",
    summary: "planned",
    concerns: [],
    forward: [],
    decision: "continue",
    ...(intentStatus ? { intentStatus } : {}),
  };
}

describe("parseIntentSlugs", () => {
  it("parses slugs with ctxOnly flags and their section headings", () => {
    expect(parseIntentSlugs(INTENT)).toEqual([
      { slug: "KernelCore", ctxOnly: false, heading: "Factory" },
      { slug: "ModelEconomics", ctxOnly: true, heading: "Factory" },
      { slug: "StatusSection", ctxOnly: true, heading: "Status" },
      { slug: "StatusAndDashboard", ctxOnly: false, heading: "Status" },
    ]);
  });

  it("leaves the heading empty before the first heading and strips annotations from it", () => {
    const md = [
      "- [[Early]] no heading yet.",
      "# Titled [[ctxOnly:TitledNote]]",
      "- [[Late]] under the title.",
    ].join("\n");
    expect(parseIntentSlugs(md)).toEqual([
      { slug: "Early", ctxOnly: false, heading: "" },
      { slug: "TitledNote", ctxOnly: true, heading: "Titled" },
      { slug: "Late", ctxOnly: false, heading: "Titled" },
    ]);
  });

  it("ignores empty annotations", () => {
    expect(parseIntentSlugs("nothing [[ ]] here [[]].")).toEqual([]);
  });
});

describe("intent status slug validation", () => {
  it("accepts slugs the intent annotates", () => {
    expect(
      intentStatusSlugFindings(
        INTENT,
        archOutcome([
          { slug: "KernelCore", status: "works" },
          {
            slug: "ModelEconomics",
            status: "friction",
            note: "prices vary",
          },
        ]),
      ),
    ).toEqual([]);
  });

  it("rejects a slug the intent never annotates", () => {
    expect(
      intentStatusSlugFindings(
        INTENT,
        archOutcome([{ slug: "Nope", status: "works" }]),
      ),
    ).toEqual([
      'unknown intent slug "Nope": no [[Nope]] annotation in intent.md',
    ]);
  });

  it("rejects a slug named twice", () => {
    expect(
      intentStatusSlugFindings(
        INTENT,
        archOutcome([
          { slug: "KernelCore", status: "works" },
          { slug: "KernelCore", status: "friction" },
        ]),
      ),
    ).toEqual(['intent slug "KernelCore" is named twice; one entry per slug']);
  });

  it("rejects an entry with no slug", () => {
    expect(
      intentStatusSlugFindings(
        INTENT,
        archOutcome([{ section: "KernelCore", status: "works" }]),
      ),
    ).toEqual([
      'intent status entry for section "KernelCore" has no slug: name the [[Slug]] it reports on',
    ]);
  });

  it("accepts an outcome with no intent status", () => {
    expect(intentStatusSlugFindings(INTENT, archOutcome(undefined))).toEqual(
      [],
    );
  });
});

describe("architect intent status delivery", () => {
  async function storeWithIntent(intent: string | null = INTENT): Promise<{
    root: string;
    store: ReturnType<typeof createFolderStore>;
  }> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "factory-slugs-"));
    const store: ArtifactStore = createFolderStore(
      path.join(root, "goal"),
      undefined,
      {},
    );
    await store.ensureLayout();
    if (intent !== null) {
      await store.writeFile("intent.md", intent);
    }
    return { root, store };
  }

  it("rejects an unknown slug against the goal intent", async () => {
    const { root, store } = await storeWithIntent();
    try {
      await expect(
        architectIntentStatusFindings(
          store,
          archOutcome([{ slug: "Nope", status: "works" }]),
        ),
      ).resolves.toEqual([
        'unknown intent slug "Nope": no [[Nope]] annotation in intent.md',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts annotated slugs against the goal intent", async () => {
    const { root, store } = await storeWithIntent();
    try {
      await expect(
        architectIntentStatusFindings(
          store,
          archOutcome([{ slug: "StatusAndDashboard", status: "works" }]),
        ),
      ).resolves.toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("yields no findings when intent.md is missing", async () => {
    const { root, store } = await storeWithIntent(null);
    try {
      await expect(
        architectIntentStatusFindings(
          store,
          archOutcome([{ slug: "Nope", status: "works" }]),
        ),
      ).resolves.toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("factory validate intent status", () => {
  function block(intentStatus: string): string {
    return [
      "status: done",
      "summary: planned",
      "decision: continue",
      "concerns: []",
      "forward: []",
      "intentStatus:",
      ...intentStatus.split("\n").map((line) => `  ${line}`),
    ].join("\n");
  }

  async function validateAgainst(
    intent: string | null,
    entry: string,
  ): Promise<string[]> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "validate-slugs-"));
    try {
      const goalDir = path.join(root, "group", "artifacts", "demo");
      fs.mkdirSync(goalDir, { recursive: true });
      if (intent !== null) {
        fs.writeFileSync(path.join(goalDir, "intent.md"), intent);
      }
      const file = writeRecordOutcome(root, "group", "architect", block(entry));
      const result = await validateFile(file, {
        step: "architect",
        repo: packageRoot,
      });
      return result.findings;
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  it("rejects an unknown slug in an architect outcome", async () => {
    const findings = await validateAgainst(
      INTENT,
      "- slug: Nope\n  status: works",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain(
      'unknown intent slug "Nope": no [[Nope]] annotation in intent.md',
    );
  });

  it("accepts annotated slugs in an architect outcome", async () => {
    const findings = await validateAgainst(
      INTENT,
      "- slug: KernelCore\n  status: works",
    );
    expect(findings).toEqual([]);
  });

  it("yields no findings when intent.md is absent", async () => {
    const findings = await validateAgainst(
      null,
      "- slug: Nope\n  status: works",
    );
    expect(findings).toEqual([]);
  });
});
