#!/usr/bin/env bash
# Package gates as the promotion gate sees them: copy the package working tree
# (including the uncommitted merge under test) to a bare temp dir with no
# bootstrap/ sibling and no worktree parent, then install + typecheck + test.
# Tests reaching outside the package fail here, not only at promote time.
# Usage: gates.sh [package-dir]
set -euo pipefail

pkg="${1:-$(dirname "$(readlink -f "$0")")/..}"
tmp="$(mktemp -d /tmp/factory-gates.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT
tar -C "$pkg" --exclude=node_modules --exclude=.git -cf - . | tar -x -C "$tmp"
[ -f "$tmp/package.json" ] || { echo "gates: no package.json in export" >&2; exit 1; }
(cd "$tmp" && bun install --frozen-lockfile --silent && bun run typecheck && bun test)
