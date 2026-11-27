import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateFile } from "../../src/cli/commands.js";
import { packageRoot } from "../../src/kernel/config.js";
import {
  architectIntentStatusFindings,
  intentProse,
  intentStatusSlugFindings,
  parseIntentSlugs,
  resolveGoalIntent,
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

describe("intentProse", () => {
  it("ignores annotation placement and whitespace, never wording", () => {
    expect(intentProse("# Goal\n\n- [[A]] One.\n")).toBe(
      intentProse("# Goal\n\n- One."),
    );
    expect(intentProse("## Title [[ctxOnly:T]]\n\n[[A]] Text.\n")).toBe(
      intentProse("## Title\n\nText."),
    );
    expect(intentProse("[[A]] One.")).not.toBe(intentProse("[[A]] Two."));
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

const POINTER_INTENT = [
  "# Goal: full — everything in INTENT.md built, tested and documented",
  "",
  "Review intent file (`INTENT.md` at the repo root, source of truth) and make sure everything specified in intent is built.",
  "",
  "Footnote: `GAPS.md` lists known gaps.",
].join("\n");

describe("pointer intent slugs", () => {
  async function pointerSetup(
    pointer: string,
    referenced?: { rel: string; body: string },
  ): Promise<{
    root: string;
    checkout: string;
    store: ReturnType<typeof createFolderStore>;
  }> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pointer-slugs-"));
    const checkout = path.join(root, "repo");
    fs.mkdirSync(checkout, { recursive: true });
    if (referenced) {
      const target = path.join(checkout, referenced.rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, referenced.body, "utf8");
    }
    const store = createFolderStore(path.join(root, "goal"), undefined, {});
    await store.ensureLayout();
    await store.writeFile("intent.md", pointer);
    return { root, checkout, store };
  }

  it("parses slugs from the referenced file when intent.md is a pointer", async () => {
    const { root, checkout, store } = await pointerSetup(POINTER_INTENT, {
      rel: "INTENT.md",
      body: INTENT,
    });
    try {
      const resolved = await resolveGoalIntent(store, { checkout });
      expect(resolved).toEqual({
        kind: "pointer",
        path: "INTENT.md",
        text: INTENT,
        slugs: parseIntentSlugs(INTENT),
      });
      await expect(
        architectIntentStatusFindings(
          store,
          archOutcome([
            { slug: "KernelCore", status: "works" },
            { slug: "ModelEconomics", status: "friction" },
          ]),
          { checkout },
        ),
      ).resolves.toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects an unknown slug against the referenced file", async () => {
    const { root, checkout, store } = await pointerSetup(POINTER_INTENT, {
      rel: "INTENT.md",
      body: INTENT,
    });
    try {
      await expect(
        architectIntentStatusFindings(
          store,
          archOutcome([{ slug: "Nope", status: "works" }]),
          { checkout },
        ),
      ).resolves.toEqual([
        'unknown intent slug "Nope": no [[Nope]] annotation in INTENT.md',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports a missing referenced file as a validation finding rather than an empty slug set", async () => {
    const { root, checkout, store } = await pointerSetup(
      "# Goal\n\nBuild as specified in `MISSING.md`.\n",
    );
    try {
      const resolved = await resolveGoalIntent(store, { checkout });
      expect(resolved.kind).toBe("missing-source");
      const findings = await architectIntentStatusFindings(
        store,
        archOutcome([{ slug: "KernelCore", status: "works" }]),
        { checkout },
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]).toContain("MISSING.md");
      expect(findings[0]).not.toContain("unknown intent slug");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a pointer reference that escapes the checkout", async () => {
    const { root, checkout, store } = await pointerSetup(
      "# Goal\n\nBuild as specified in `../outside.md`.\n",
    );
    try {
      fs.writeFileSync(path.join(root, "outside.md"), INTENT, "utf8");
      const findings = await architectIntentStatusFindings(
        store,
        archOutcome([{ slug: "KernelCore", status: "works" }]),
        { checkout },
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]).toContain("../outside.md");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps inline annotated goal intents on intent.md even when prose mentions a source", async () => {
    const inline = [
      "# Goal",
      "",
      "- [[InlineOnly]] Build as specified in `INTENT.md`.",
    ].join("\n");
    const { root, checkout, store } = await pointerSetup(inline, {
      rel: "INTENT.md",
      body: INTENT,
    });
    try {
      const resolved = await resolveGoalIntent(store, { checkout });
      expect(resolved.kind).toBe("inline");
      await expect(
        architectIntentStatusFindings(
          store,
          archOutcome([{ slug: "InlineOnly", status: "works" }]),
          { checkout },
        ),
      ).resolves.toEqual([]);
      await expect(
        architectIntentStatusFindings(
          store,
          archOutcome([{ slug: "KernelCore", status: "works" }]),
          { checkout },
        ),
      ).resolves.toEqual([
        'unknown intent slug "KernelCore": no [[KernelCore]] annotation in intent.md',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
