import { describe, expect, it } from "bun:test";

const SINGLE_DEFINITION_WORDS = 8;

/** A repeated rule hides in a clause of two differently worded sentences. */
const CLAUSE_BOUNDARY = /[;:—–()]| - /;

function promptLines(text: string): string[] {
  const stripped = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\{\{[\s\S]*?\}\}/g, " ")
    .replace(/\{%[\s\S]*?%\}/g, " ");
  return stripped
    .split("\n")
    .map((line) =>
      line.replace(/^\s*(#{1,6}\s+|\d+[.)]\s+|[-*]\s+)/, "").trim(),
    )
    .filter(Boolean);
}

function longEnough(part: string): boolean {
  return part.split(/\s+/).length >= SINGLE_DEFINITION_WORDS;
}

function normalizePart(part: string): string {
  return part
    .replace(/[`*["\]]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.;:,—–-]+|[\s.;:,—–-]+$/g, "")
    .toLowerCase();
}

function promptSentences(text: string): string[] {
  const sentences: string[] = [];
  for (const line of promptLines(text)) {
    for (const part of line.split(/(?<=[.!?])\s+/)) {
      const sentence = normalizePart(part);
      if (sentence && longEnough(sentence)) sentences.push(sentence);
    }
  }
  return sentences;
}

function promptClauses(text: string): string[] {
  const clauses: string[] = [];
  for (const line of promptLines(text)) {
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      for (const part of sentence.split(CLAUSE_BOUNDARY)) {
        const clause = normalizePart(part);
        if (clause && longEnough(clause)) clauses.push(clause);
      }
    }
  }
  return clauses;
}

/** Sentences and the clauses inside them; a rule must define any of them once. */
function promptUnits(text: string): string[] {
  return [...new Set([...promptSentences(text), ...promptClauses(text)])];
}

function crossFragmentRepeats(
  fragments: Map<string, string>,
  allowed: Record<string, string[]> = {},
): { unit: string; holders: string[] }[] {
  const holders = new Map<string, string[]>();
  for (const [name, text] of fragments) {
    for (const unit of promptUnits(text)) {
      const list = holders.get(unit) ?? [];
      list.push(name);
      holders.set(unit, list);
    }
  }
  return [...holders]
    .filter(([, names]) => names.length > 1)
    .filter(
      ([unit, names]) =>
        !names.some((name) => (allowed[name] ?? []).includes(unit)),
    )
    .map(([unit, names]) => ({ unit, holders: names }));
}

function promptSingleDefinitionsPart2() {
  it("catches a shared clause inside two differently worded sentences", () => {
    const fragments = new Map([
      [
        "a",
        "Keep the diff small; the shared clause says exactly what the rule needs to say.",
      ],
      [
        "b",
        "Keep the test real; the shared clause says exactly what the rule needs to say.",
      ],
    ]);
    expect(crossFragmentRepeats(fragments)).toEqual([
      {
        unit: "the shared clause says exactly what the rule needs to say",
        holders: ["a", "b"],
      },
    ]);
  });

  it("excuses an allow-listed repeat", () => {
    const fragments = new Map([
      ["a", "A shared rule sentence with more than eight words lives here."],
      ["b", "A shared rule sentence with more than eight words lives here."],
    ]);
    expect(crossFragmentRepeats(fragments)).toEqual([
      {
        unit: "a shared rule sentence with more than eight words lives here",
        holders: ["a", "b"],
      },
    ]);
    expect(
      crossFragmentRepeats(fragments, {
        b: ["a shared rule sentence with more than eight words lives here"],
      }),
    ).toEqual([]);
  });
}

describe("prompt single definitions", () => {
  promptSingleDefinitionsPart2();
});
