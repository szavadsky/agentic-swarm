import fs from "node:fs";
import path from "node:path";

/**
 * A file of the tree under test, such as a repo-level script. The gate names
 * the tree in FACTORY_TREE_ROOT; a plain checkout resolves this package's own
 * repository. Undefined only for a package-only export with no tree named.
 */
export function treeFile(rel: string): string | undefined {
  const tree = process.env.FACTORY_TREE_ROOT;
  const candidates = [
    ...(tree ? [path.join(tree, rel)] : []),
    path.resolve(import.meta.dir, "../../../..", rel),
  ];
  return candidates.find((file) => fs.existsSync(file));
}
