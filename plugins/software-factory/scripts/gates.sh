#!/usr/bin/env bash
# Package gates as the promotion gate sees them: copy the package working tree
# (including the uncommitted merge under test) to a bare temp dir with no
# bootstrap/ sibling and no worktree parent, then install and run one gate or
# all of them. Tests reaching outside the package fail here, not only at
# promote time.
# Usage: gates.sh [package-dir] [gate]
#   gate: typecheck | tests | format | lint | schema | schema-validation (default: all)
# The schema-validation gate also validates the repo's schema-enforced files
# (.factory config, task files, class.yaml, outcome records); the export
# carries only the package, so the repo root arrives in FACTORY_REPO_ROOT.
# A caller may point it at another checkout carrying the artifact tree (e.g.
# the ops checkout). Otherwise the invoking directory wins when it carries the
# artifact tree; a bare checkout (task worktree, merge scratch) falls back to
# the worktree on the repo's base branch, where the operator runs, and finally
# to the invoking directory.
set -euo pipefail

pkg="${1:-$(dirname "$(readlink -f "$0")")/..}"
gate="${2:-all}"
# The checkout carrying the artifact tree. The kernel spawns gates from a task
# worktree or merge scratch, where .factory/artifacts is gitignored, so the
# base-branch worktree is the schema gate's tree. Any failure falls back to
# the invoking directory (config-only coverage, as before).
artifact_checkout() {
  command -v git >/dev/null 2>&1 || return 1
  [ -f .factory/repo.yaml ] || return 1
  local base
  base="$(grep -m1 '^baseBranch:' .factory/repo.yaml | sed 's/^baseBranch:[[:space:]]*//' | tr -d "'\"[:space:]")" || return 1
  [ -n "$base" ] || return 1
  local cand
  cand="$(git worktree list --porcelain 2>/dev/null | awk -v want="branch refs/heads/$base" '
    /^worktree / { path = $2 }
    $0 == want { print path; exit }')" || return 1
  [ -n "$cand" ] || return 1
  [ -d "$cand/.factory/artifacts" ] || return 1
  printf '%s\n' "$cand"
}

if [ -z "${FACTORY_REPO_ROOT:-}" ]; then
  if [ -d .factory/artifacts ]; then
    FACTORY_REPO_ROOT="$(pwd)"
  else
    FACTORY_REPO_ROOT="$(artifact_checkout 2>/dev/null || pwd)"
  fi
fi
export FACTORY_REPO_ROOT

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
