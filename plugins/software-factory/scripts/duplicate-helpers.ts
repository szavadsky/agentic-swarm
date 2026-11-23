/** Code lint: the same helper body copied into two source files. */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { walkFiles } from "./files.js";

/** Bodies shorter than this are small enough to restate without a utility seam. */
const MIN_BODY_CHARS = 100;

interface Helper {
  file: string;
  name: string;
  body: string;
}

function relative(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

function normalize(body: string): string {
  return body
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function addHelper(
  helpers: Helper[],
  root: string,
  file: string,
  source: ts.SourceFile,
  name: string,
  body: ts.ConciseBody,
): void {
  const text = normalize(body.getText(source));
  if (text.length >= MIN_BODY_CHARS) {
    helpers.push({ file: relative(root, file), name, body: text });
  }
}

function helpersIn(root: string, file: string): Helper[] {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const helpers: Helper[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      addHelper(helpers, root, file, source, node.name.text, node.body);
    } else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        const initializer = declaration.initializer;
        if (
          ts.isIdentifier(declaration.name) &&
          initializer &&
          (ts.isArrowFunction(initializer) ||
            ts.isFunctionExpression(initializer))
        ) {
          addHelper(
            helpers,
            root,
            file,
            source,
            declaration.name.text,
            initializer.body,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return helpers;
}

/**
 * Reports one body found in more than one file. A helper restated inside one
 * file is a local choice; the check is about a copy that should be shared.
 */
export function duplicateHelperProblems(root: string): string[] {
  const helpers = ["src", "scripts"].flatMap((dir) =>
    walkFiles(path.join(root, dir), (file) => file.endsWith(".ts")).flatMap(
      (file) => helpersIn(root, file),
    ),
  );
  const byBody = new Map<string, Helper[]>();
  for (const helper of helpers) {
    const group = byBody.get(helper.body) ?? [];
    group.push(helper);
    byBody.set(helper.body, group);
  }
  const problems: string[] = [];
  for (const group of byBody.values()) {
    const files = [...new Map(group.map((item) => [item.file, item])).values()];
    if (files.length < 2) continue;
    const [first, ...rest] = files;
    if (!first) continue;
    for (const other of rest) {
      problems.push(
        `code lint: duplicated helper "${first.name}" in ${first.file} and ${other.file} (same body)`,
      );
    }
  }
  return problems;
}
