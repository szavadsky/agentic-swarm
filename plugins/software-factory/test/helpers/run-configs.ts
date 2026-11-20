import fs from "node:fs";
import path from "node:path";

/** The repo-root config library, as a package-only checkout would place it. */
const SIBLING = path.resolve(import.meta.dir, "../../../../bootstrap/run");

/**
 * The shipped run configs live at the repo root, outside this package. The
 * gate names the tree under test (`FACTORY_TREE_ROOT` carries its repo config
 * and `bootstrap/run`); a plain checkout resolves the sibling. Undefined means
 * a package-only checkout that carries no configs to exercise.
 */
export function findShippedRunConfigsDir(): string | undefined {
  const tree = process.env.FACTORY_TREE_ROOT;
  const candidates = [
    ...(tree ? [path.join(tree, "bootstrap", "run")] : []),
    SIBLING,
  ];
  return candidates.find((dir) => fs.existsSync(dir));
}

/**
 * The directory a suite that asserts on the shipped configs must exercise.
 * Throws instead of skipping: the shipped-config tests silently ran no config
 * inside the gate's package-only export, so every one of them could break
 * unseen.
 */
export function shippedRunConfigsDir(): string {
  const dir = findShippedRunConfigsDir();
  if (!dir) {
    const tree = process.env.FACTORY_TREE_ROOT;
    throw new Error(
      `shipped run configs not found: ${
        tree ? `FACTORY_TREE_ROOT=${tree} names no bootstrap/run, and ` : ""
      }${SIBLING} does not exist`,
    );
  }
  return dir;
}
