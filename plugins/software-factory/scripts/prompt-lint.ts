/** Prompt lint: dead fragments and paragraphs copied across templates. */

import fs from "node:fs";
import path from "node:path";
import {
  type PromptFragment,
  type PromptInventory,
  readPromptInventory,
} from "./prompt-inventory.js";
import { walkFiles } from "./files.js";

/** Shorter paragraphs are headings or list glue, not duplicated prose. */
const MIN_PARAGRAPH_WORDS = 5;
const PREVIEW_CHARS = 60;
/** Unigram-plus-bigram Dice similarity at which two paragraphs count as duplicated. */
const DUPLICATE_THRESHOLD = 0.8;
const PROMPT_KEY = /\b(?:prompt|repairPrompt)\s*:\s*["']?([A-Za-z0-9_./-]+)/g;

/** A template's prose paragraphs, without fenced code, Liquid tags or headings. */
function paragraphs(fragment: PromptFragment): string[] {
  const text = fragment.text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\{%[\s\S]*?%\}/g, "");
  const found: string[] = [];
  for (const chunk of text.split(/\n\s*\n+/)) {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"));
    const paragraph = lines.join(" ").replace(/\s+/g, " ").trim();
    if (paragraph.split(/\s+/).length >= MIN_PARAGRAPH_WORDS) {
      found.push(paragraph);
    }
  }
  return found;
}

function preview(paragraph: string): string {
  return paragraph.length > PREVIEW_CHARS
    ? `${paragraph.slice(0, PREVIEW_CHARS - 3)}...`
    : paragraph;
}

interface Paragraph {
  file: string;
  text: string;
  words: string[];
  counts: Map<string, number>;
  bigrams: string[];
  bigramCounts: Map<string, number>;
}

function wordCounts(words: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

function bigramsOf(words: readonly string[]): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i += 1) {
    bigrams.push(`${words[i]} ${words[i + 1]}`);
  }
  return bigrams;
}

function paragraphOf(fragment: PromptFragment, text: string): Paragraph {
  const words = text.toLowerCase().match(/[a-z0-9_-]+/g) ?? [];
  const bigrams = bigramsOf(words);
  return {
    file: fragment.file,
    text,
    words,
    counts: wordCounts(words),
    bigrams,
    bigramCounts: wordCounts(bigrams),
  };
}

/** Unigram-plus-bigram Dice; identical text scores 1. */
function dice(a: Map<string, number>, b: Map<string, number>): number {
  let total = 0;
  let overlap = 0;
  for (const [token, count] of a) {
    total += count;
    overlap += Math.min(count, b.get(token) ?? 0);
  }
  for (const count of b.values()) total += count;
  return total === 0 ? 1 : (2 * overlap) / total;
}

function similarity(a: Paragraph, b: Paragraph): number {
  if (a.bigrams.length === 0 || b.bigrams.length === 0)
    return dice(a.counts, b.counts);
  return (dice(a.counts, b.counts) + dice(a.bigramCounts, b.bigramCounts)) / 2;
}

/** A paragraph duplicated or reworded across two different template files. */
function duplicateProblems(inventory: PromptInventory): string[] {
  const entries: Paragraph[] = [];
  for (const fragment of inventory.fragments) {
    for (const text of [...new Set(paragraphs(fragment))]) {
      entries.push(paragraphOf(fragment, text));
    }
  }
  const problems: string[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];
      if (a === undefined || b === undefined || a.file === b.file) continue;
      const score = similarity(a, b);
      if (score < DUPLICATE_THRESHOLD) continue;
      const percent = Math.round(score * 100);
      problems.push(
        `prompt lint: duplicated paragraph across ${a.file} and ${b.file} (${percent}%): "${preview(a.text)}"`,
      );
    }
  }
  return problems;
}

function quotedReference(text: string, name: string): boolean {
  return (
    text.includes(`"${name}"`) ||
    text.includes(`'${name}'`) ||
    text.includes(`\`${name}\``)
  );
}

/** Prompt names a config file names as a step's prompt or repair ask. */
function configReferences(root: string, names: readonly string[]): string[] {
  const known = new Set(names);
  const found = new Set<string>();
  const files = walkFiles(path.join(root, "config"), (file) =>
    /\.(?:ya?ml|json)$/i.test(file),
  );
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(PROMPT_KEY)) {
      const name = match[1];
      if (name !== undefined && known.has(name)) found.add(name);
    }
  }
  return [...found];
}

/** Prompt names code or tests name as a rendered template. */
function sourceReferences(
  root: string,
  names: readonly string[],
  dirs: readonly string[],
): string[] {
  const found = new Set<string>();
  for (const dir of dirs) {
    const files = walkFiles(path.join(root, dir), (file) =>
      file.endsWith(".ts"),
    );
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      for (const name of names) {
        if (quotedReference(text, name)) found.add(name);
      }
    }
  }
  return [...found];
}

/**
 * A fragment is live when a config, source or test names a template it is
 * reachable from; includes carry conditional branches and computed author
 * partials, so a runtime-only include is live.
 */
function orphanProblems(root: string, inventory: PromptInventory): string[] {
  const names = inventory.fragments.map((fragment) => fragment.name);
  const byName = new Map<string, PromptFragment>();
  for (const fragment of inventory.fragments) {
    byName.set(fragment.name, fragment);
  }
  const live = new Set<string>([
    ...configReferences(root, names),
    ...sourceReferences(root, names, ["src", "test"]),
  ]);
  const queue = [...live];
  for (let i = 0; i < queue.length; i += 1) {
    const name = queue[i];
    if (name === undefined) continue;
    const fragment = byName.get(name);
    if (!fragment) continue;
    for (const include of fragment.includes) {
      if (!live.has(include)) {
        live.add(include);
        queue.push(include);
      }
    }
  }
  return inventory.fragments
    .filter((fragment) => !live.has(fragment.name))
    .map(
      (fragment) =>
        `prompt lint: orphan fragment "${fragment.name}" is not referenced by any prompt, config, src, or test`,
    );
}

/** Every prompt problem the lint gate reports, in one list. */
export function promptProblems(root: string): string[] {
  const promptsDir = path.join(root, "prompts");
  if (!fs.existsSync(promptsDir)) return [];
  let inventory: PromptInventory;
  try {
    inventory = readPromptInventory(promptsDir);
  } catch (error) {
    return [`prompt lint: ${(error as Error).message}`];
  }
  return [...duplicateProblems(inventory), ...orphanProblems(root, inventory)];
}
