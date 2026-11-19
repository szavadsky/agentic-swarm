import fs from "node:fs";
import path from "node:path";

const LIMIT = 500;
const ROOT = process.argv[2] ?? process.cwd();
const ALLOWLIST = path.join(ROOT, "config/file-size-allowlist.json");

/** A file on the allowlist names the split task that removes it. */
const REMOVER = /^split-[a-z0-9-]+$/;

function lineCount(file: string): number {
  const text = fs.readFileSync(file, "utf8");
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function collect(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") collect(full, out);
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
}

const files: string[] = [];
for (const dir of ["src", "scripts", "test"]) {
  const full = path.join(ROOT, dir);
  if (fs.existsSync(full)) collect(full, files);
}

const oversized = files
  .map((file) => ({ file, lines: lineCount(file) }))
  .filter(({ lines }) => lines > LIMIT)
  .map(({ file }) => path.relative(ROOT, file).split(path.sep).join("/"))
  .sort();
const allowed: Record<string, string> = JSON.parse(
  fs.readFileSync(ALLOWLIST, "utf8"),
);
const problems: string[] = [];

for (const file of oversized) {
  if (!(file in allowed)) {
    problems.push(
      `${file}: ${lineCount(path.join(ROOT, file))} lines; add it to ${ALLOWLIST} with its remover slug`,
    );
  }
}
for (const [file, remover] of Object.entries(allowed)) {
  if (!oversized.includes(file)) {
    problems.push(
      `${file}: allowlisted but not over ${LIMIT} lines; remove the entry`,
    );
  }
  if (!REMOVER.test(remover)) {
    problems.push(`${file}: remover "${remover}" is not a split-* task`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(
  `file size: ${files.length} file(s) checked, ${oversized.length} allowlisted`,
);
