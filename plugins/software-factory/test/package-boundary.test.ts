import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const PACKAGE_ROOT = path.join(import.meta.dir, "..");
const TEST_ROOT = import.meta.dir;
/** The one sanctioned door: tests that reach `bootstrap/run` go through it. */
const SANCTIONED_DOOR = "test/helpers/run-configs.ts";

interface Resolution {
  file: string;
  line: number;
  target: string;
}

interface Context {
  root: string;
  file: string;
  consts: Map<string, ts.Expression>;
}

function testSources(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".ts")) found.push(full);
    }
  };
  walk(dir);
  return found.sort();
}

/** Top-level constants, so `const ROOT = path.resolve(...)` stays evaluable. */
function topLevelConstants(source: ts.SourceFile): Map<string, ts.Expression> {
  const map = new Map<string, ts.Expression>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) {
        map.set(decl.name.text, decl.initializer);
      }
    }
  }
  return map;
}

function unwrap(node: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return unwrap(node.expression);
  }
  return node;
}

/** `import.meta.dir` and `import.meta.url` by their property name. */
function metaName(node: ts.Expression): string | undefined {
  if (!ts.isPropertyAccessExpression(node)) return undefined;
  const meta = node.expression;
  if (
    !ts.isMetaProperty(meta) ||
    meta.keywordToken !== ts.SyntaxKind.ImportKeyword
  ) {
    return undefined;
  }
  if (meta.name.text !== "meta") return undefined;
  return node.name.text;
}

function evaluateName(
  id: ts.Identifier,
  ctx: Context,
  seen: Set<string>,
): Evaluated | undefined {
  if (id.text === "__dirname") {
    return { value: path.dirname(ctx.file), anchored: true };
  }
  if (id.text === "__filename") return { value: ctx.file, anchored: true };
  const init = ctx.consts.get(id.text);
  if (init === undefined || seen.has(id.text)) return undefined;
  seen.add(id.text);
  try {
    return evaluate(init, ctx, seen);
  } finally {
    seen.delete(id.text);
  }
}

function evaluateUrl(
  node: ts.NewExpression,
  ctx: Context,
  seen: Set<string>,
): Evaluated | undefined {
  if (!ts.isIdentifier(node.expression) || node.expression.text !== "URL") {
    return undefined;
  }
  const [relative, base] = node.arguments ?? [];
  if (relative === undefined || base === undefined) return undefined;
  const href = evaluate(relative, ctx, seen);
  const root = evaluate(base, ctx, seen);
  if (href === undefined || root === undefined) return undefined;
  if (!URL.canParse(href.value, root.value)) return undefined;
  return {
    value: new URL(href.value, root.value).href,
    anchored: root.anchored,
  };
}

interface Evaluated {
  value: string;
  anchored: boolean;
}

/** Constant-folds one path expression, keeping whether it derives from the file. */
function evaluate(
  node: ts.Expression,
  ctx: Context,
  seen: Set<string>,
): Evaluated | undefined {
  const expr = unwrap(node);
  if (ts.isStringLiteralLike(expr)) {
    return { value: expr.text, anchored: false };
  }
  if (ts.isIdentifier(expr)) return evaluateName(expr, ctx, seen);
  const meta = metaName(expr);
  if (meta === "dir") {
    return { value: path.dirname(ctx.file), anchored: true };
  }
  if (meta === "url") {
    return { value: pathToFileURL(ctx.file).href, anchored: true };
  }
  if (ts.isNewExpression(expr)) return evaluateUrl(expr, ctx, seen);
  if (ts.isCallExpression(expr)) return evaluateCall(expr, ctx, seen);
  return undefined;
}

function evaluateParts(
  args: ts.NodeArray<ts.Expression>,
  ctx: Context,
  seen: Set<string>,
): Evaluated[] | undefined {
  const parts: Evaluated[] = [];
  for (const arg of args) {
    const part = evaluate(arg, ctx, seen);
    if (part === undefined) return undefined;
    parts.push(part);
  }
  return parts;
}

function evaluatePath(
  method: string,
  parts: Evaluated[],
  cwd: string,
): Evaluated | undefined {
  const values = parts.map((part) => part.value);
  const anchored = parts.some((part) => part.anchored);
  if (method === "resolve") {
    // `resolve` reads a bare relative path against the process cwd, which is
    // the package root for a suite run.
    const fromCwd = values[0] !== undefined && !path.isAbsolute(values[0]);
    return {
      value: path.resolve(...(fromCwd ? [cwd, ...values] : values)),
      anchored: anchored || fromCwd,
    };
  }
  if (method === "join") return { value: path.join(...values), anchored };
  if (method === "dirname" && values.length === 1) {
    return { value: path.dirname(values[0]!), anchored };
  }
  return undefined;
}

function evaluateFileUrl(
  call: ts.CallExpression,
  ctx: Context,
  seen: Set<string>,
): Evaluated | undefined {
  const [arg] = call.arguments;
  if (arg === undefined) return undefined;
  const href = evaluate(arg, ctx, seen);
  if (href === undefined || !href.value.startsWith("file:")) return undefined;
  return { value: fileURLToPath(href.value), anchored: href.anchored };
}

function evaluateCall(
  call: ts.CallExpression,
  ctx: Context,
  seen: Set<string>,
): Evaluated | undefined {
  const callee = unwrap(call.expression);
  if (!ts.isPropertyAccessExpression(callee)) {
    if (ts.isIdentifier(callee) && callee.text === "fileURLToPath") {
      return evaluateFileUrl(call, ctx, seen);
    }
    return undefined;
  }
  const method = callee.name.text;
  const owner = callee.expression;
  if (!ts.isIdentifier(owner)) return undefined;
  if (owner.text === "process" && method === "cwd") {
    return { value: ctx.root, anchored: true };
  }
  if (owner.text !== "path") return undefined;
  const parts = evaluateParts(call.arguments, ctx, seen);
  return parts === undefined
    ? undefined
    : evaluatePath(method, parts, ctx.root);
}

function escapes(ctx: Context, node: ts.Node): Resolution | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  const target = evaluate(node, ctx, new Set());
  if (target === undefined || !target.anchored) return undefined;
  if (!path.isAbsolute(target.value)) return undefined;
  const within = path.relative(ctx.root, target.value);
  if (within !== ".." && !within.startsWith(`..${path.sep}`)) return undefined;
  const { line } = node
    .getSourceFile()
    .getLineAndCharacterOfPosition(node.getStart());
  return {
    file: path.relative(ctx.root, ctx.file),
    line: line + 1,
    target: target.value,
  };
}

/**
 * Every test-source resolution that lands outside the package, by file and
 * line, except inside the sanctioned door.
 */
function findEscapes(root: string, testRoot: string): Resolution[] {
  const sanctioned = path.resolve(root, SANCTIONED_DOOR);
  const found: Resolution[] = [];
  for (const file of testSources(testRoot)) {
    if (path.resolve(file) === sanctioned) continue;
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const ctx: Context = {
      root,
      file,
      consts: topLevelConstants(source),
    };
    const visit = (node: ts.Node): void => {
      const hit = escapes(ctx, node);
      if (hit) found.push(hit);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

function fixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "package-boundary-"));
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

function scanFixture(files: Record<string, string>): Resolution[] {
  const root = fixture(files);
  try {
    return findEscapes(root, path.join(root, "test"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("package boundary", () => {
  it("keeps every test source resolving inside the package", () => {
    // The package-only export carries no repo config or run library sibling,
    // so a test that resolves one directly is red at promote, not here.
    // `test/helpers/run-configs.ts` is the sanctioned door.
    expect(findEscapes(PACKAGE_ROOT, TEST_ROOT)).toEqual([]);
  }, 30_000);

  it("flags a path expression that leaves the package root", () => {
    const found = scanFixture({
      "test/violating.test.ts":
        'const outside = path.resolve(import.meta.dir, "../../outside.txt");\n',
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: "test/violating.test.ts", line: 1 });
  });

  it("flags path segments that leave the package root when joined", () => {
    const found = scanFixture({
      "test/violating.test.ts":
        'const outside = path.join(import.meta.dir, "..", "..", "..");\n',
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: "test/violating.test.ts", line: 1 });
  });

  it("flags a relative resolve that leaves the package from the suite cwd", () => {
    const found = scanFixture({
      "test/violating.test.ts":
        'const outside = path.resolve("../../outside.txt");\n',
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: "test/violating.test.ts", line: 1 });
  });

  it("ignores absolute system paths that do not derive from the file", () => {
    expect(
      scanFixture({
        "test/system.test.ts": 'const bin = path.dirname("/bin/true");\n',
      }),
    ).toEqual([]);
  });

  it("permits in-package resolutions and the sanctioned door", () => {
    expect(
      scanFixture({
        "test/inside/data.test.ts":
          'const data = path.resolve(import.meta.dir, "../fixtures/data.txt");\n',
        "test/helpers/run-configs.ts":
          'const run = path.resolve(import.meta.dir, "../../../bootstrap/run");\n',
      }),
    ).toEqual([]);
  });
});
