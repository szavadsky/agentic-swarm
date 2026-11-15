#!/usr/bin/env bash
# Package gates as the promotion gate sees them: copy the package working tree
# (including the uncommitted merge under test) to a bare temp dir with no
# bootstrap/ sibling and no worktree parent, then install and run one gate or
# all of them. Tests reaching outside the package fail here, not only at
# promote time.
# Usage: gates.sh [package-dir] [gate]
#   gate: typecheck | tests | format | lint | schema | schema-validation (default: all)
# The schema-validation gate also validates the invoking repo's schema-enforced
# files (.factory config, task files, class.yaml, outcome records); the export
# carries only the package, so the repo root arrives in FACTORY_REPO_ROOT.
# A caller may point it at another checkout carrying the artifact tree (e.g.
# the ops checkout); the default is the invoking directory.
set -euo pipefail

pkg="${1:-$(dirname "$(readlink -f "$0")")/..}"
gate="${2:-all}"
export FACTORY_REPO_ROOT="${FACTORY_REPO_ROOT:-$(pwd)}"

unknown_gate() {
  echo "gates: unknown gate '$1' (expected typecheck, tests, format, lint, schema, schema-validation or all)" >&2
  exit 2
}

case "$gate" in
  all) gates=(typecheck tests format lint schema) ;;
  typecheck | tests | format | lint | schema | schema-validation) gates=("$gate") ;;
  *) unknown_gate "$gate" ;;
esac

run_gate() {
  case "$1" in
    typecheck) bun run typecheck ;;
    tests) bun test ;;
    format) bun run format ;;
    lint) bun run lint ;;
    schema | schema-validation) bun run schema-validation ;;
    *) unknown_gate "$1" ;;
  esac
}

tmp="$(mktemp -d /tmp/factory-gates.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT
tar -C "$pkg" --exclude=node_modules --exclude=.git -cf - . | tar -x -C "$tmp"
[ -f "$tmp/package.json" ] || { echo "gates: no package.json in export" >&2; exit 1; }

cd "$tmp"
bun install --frozen-lockfile --silent
for name in "${gates[@]}"; do
  run_gate "$name"
done
