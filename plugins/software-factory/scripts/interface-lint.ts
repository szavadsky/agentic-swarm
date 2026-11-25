/**
 * Interface lint: a type or interface declaration belongs in a type module, so
 * an implementation module never carries the public shape it implements. The
 * whole of `src` is held to the rule, with no scope and no allowlist.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { walkFiles } from "./files.js";

/** One exported type declaration: where it starts and what it declares. */
interface TypeDeclaration {
  line: number;
  keyword: "interface" | "type";
  name: string;
}

/** A module that carries types: `types.ts`, a `types/` directory or `*-types.ts`. */
function isTypeModule(rel: string): boolean {
  const segments = rel.split("/");
  const base = segments.at(-1) ?? rel;
  return (
    base === "types.ts" ||
    base.endsWith("-types.ts") ||
    segments.slice(0, -1).includes("types")
  );
}

function isExported(statement: ts.Statement): boolean {
  const modifiers = ts.canHaveModifiers(statement)
    ? ts.getModifiers(statement)
    : undefined;
  return (
    modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ) === true
  );
}

function typeDeclaration(
  source: ts.SourceFile,
  statement: ts.Statement,
): TypeDeclaration | undefined {
  if (!isExported(statement)) return undefined;
  let keyword: "interface" | "type";
  if (ts.isInterfaceDeclaration(statement)) keyword = "interface";
  else if (ts.isTypeAliasDeclaration(statement)) keyword = "type";
  else return undefined;
  const line =
    source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1;
  return { line, keyword, name: statement.name.text };
}

/** The type declarations one implementation module exports. */
function declaredTypes(file: string): TypeDeclaration[] {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    false,
  );
  return source.statements.flatMap((statement) => {
    const declaration = typeDeclaration(source, statement);
    return declaration === undefined ? [] : [declaration];
  });
}

/** Every exported type declared in an implementation module under `src`. */
export function interfaceLintProblems(root: string): string[] {
  const problems: string[] = [];
  const files = walkFiles(
    path.join(root, "src"),
    (file) => file.endsWith(".ts") && !file.endsWith(".d.ts"),
  );
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    if (isTypeModule(rel)) continue;
    for (const { line, keyword, name } of declaredTypes(file)) {
      problems.push(
        `interface lint: ${rel}:${line} exports ${keyword} "${name}"; a type module carries the declaration`,
      );
    }
  }
  return problems;
}
