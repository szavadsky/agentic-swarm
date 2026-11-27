/** Deterministic AST check rejecting agent-bound prompt prose inside `src/`. */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ALLOWLIST_REL = "config/prompt-prose-allowlist.json";

const AGENT_PROSE_CUE =
  /\b(you are (the|an|a) |you hold a |your assignment|your verdict|carry it out|restated pm|never edit the plan|never invent intent|this is the last call|this is a standalone task|this is a fresh retry|the pm ladder|the previous launch was interrupted|resolve the conflict in the worktree|do not rebase|do not switch branches|weigh whether it is one plan|consider a saga|a steer arrived while|rewrite the outcome|route this evidence|route each pending|route every parked|route every follow-up|make the gates green)\b/i;

const PROMPT_SINK_PROPS = new Set([
  "prompt",
  "repair",
  "resume_note",
  "saga_reminder",
  "upscope_ask",
]);

function collectTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts"))
      out.push(full);
  }
  return out.sort();
}

function loadAllowlist(root: string): Record<string, string> {
  const file = path.join(root, ALLOWLIST_REL);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    return [
      node.head.text,
      ...node.templateSpans.map((span) => span.literal.text),
    ].join(" <expr> ");
  }
  return null;
}

function isIgnoredCall(call: ts.CallExpression): boolean {
  const callee = call.expression.getText();
  return (
    callee.endsWith(".describe") ||
    callee.startsWith("console.") ||
    callee.endsWith("makeCause") ||
    callee.endsWith("addIssue") ||
    callee.endsWith("fail")
  );
}

function isIgnoredSink(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isThrowStatement(cur)) return true;
    if (ts.isNewExpression(cur) && cur.expression.getText().endsWith("Error")) {
      return true;
    }
    if (ts.isCallExpression(cur) && isIgnoredCall(cur)) return true;
    cur = cur.parent;
  }
  return false;
}

/**
 * A prompt-variable page's `variables` record documents each variable; its
 * meanings are reference prose, not text any turn renders.
 */
function isVariableDoc(node: ts.Node): boolean {
  if (!ts.isPropertyAssignment(node)) return false;
  const record = node.parent;
  if (!ts.isObjectLiteralExpression(record)) return false;
  const holder = record.parent;
  if (!ts.isPropertyAssignment(holder) || holder.name.getText() !== "variables")
    return false;
  const page = holder.parent;
  return (
    ts.isObjectLiteralExpression(page) &&
    page.properties.some(
      (prop) => ts.isPropertyAssignment(prop) && prop.name.getText() === "file",
    )
  );
}

function isPromptSinkAncestor(node: ts.Node): boolean {
  if (ts.isPropertyAssignment(node) && !isVariableDoc(node)) {
    const prop = node.name.getText();
    return (
      PROMPT_SINK_PROPS.has(prop) || (prop === "message" && isHarnessCall(node))
    );
  }
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression.getText();
  return callee === "steerSession" || callee.endsWith(".steer");
}

function isAgentPromptSink(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (isPromptSinkAncestor(cur)) return true;
    cur = cur.parent;
  }
  return false;
}

function isHarnessCall(prop: ts.PropertyAssignment): boolean {
  let cur: ts.Node | undefined = prop.parent;
  while (cur) {
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression.getText();
      return callee === "runHarness" || callee.endsWith(".steer");
    }
    if (ts.isBlock(cur) || ts.isFunctionLike(cur)) return false;
    cur = cur.parent;
  }
  return false;
}

function countSentences(text: string): number {
  return text
    .split(/[.!?](?:\s|$)/)
    .filter((part) => part.trim().split(/\s+/).length >= 3).length;
}

function looksLikeAgentProse(text: string, inPromptSink: boolean): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (AGENT_PROSE_CUE.test(trimmed)) return true;
  if (!inPromptSink) return false;
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  return countSentences(trimmed) >= 2 || words >= 12;
}

function proseViolations(
  file: string,
): Array<{ line: number; sample: string }> {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const hits: Array<{ line: number; sample: string }> = [];
  function visit(node: ts.Node): void {
    const text = literalText(node);
    if (
      text !== null &&
      !isIgnoredSink(node) &&
      looksLikeAgentProse(text, isAgentPromptSink(node))
    ) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      hits.push({ line, sample: text.trim().slice(0, 80) });
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return hits;
}

/**
 * Scans `src/` for agent-bound prompt prose literals and cross-checks them
 * against `config/prompt-prose-allowlist.json` (which must stay empty).
 */
export function promptProseProblems(root: string): string[] {
  const allowlist = loadAllowlist(root);
  const seenFiles = new Set<string>();
  const problems: string[] = [];
  for (const file of collectTsFiles(path.join(root, "src"))) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const hits = proseViolations(file);
    if (hits.length === 0) continue;
    seenFiles.add(rel);
    if (rel in allowlist) continue;
    for (const hit of hits) {
      problems.push(
        `prompt prose lint: ${rel}:${hit.line} embeds prompt prose in TypeScript (${JSON.stringify(hit.sample)})`,
      );
    }
  }
  for (const entry of Object.keys(allowlist).sort()) {
    if (!seenFiles.has(entry)) {
      problems.push(
        `prompt prose lint: stale allowlist entry "${entry}" in ${ALLOWLIST_REL}`,
      );
    }
  }
  return problems;
}
