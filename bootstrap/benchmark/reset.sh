#!/usr/bin/env bash
# Build the fixed benchmark target (bootstrap/context/benchmark.md §3-4) and
# print the factory run line. The goal is omp-workspaces verbatim: the target
# repo at 572a6e0 plus the archived INTENT, whose commit tree must be 1379b0f.
#
# usage: reset.sh <dest>
#
# <dest> is the benchmark root and the only path this script deletes:
#   <dest>/target   the target repo (no prior history; one intent commit)
#   <dest>/runtime  session store and worktrees, outside the target repo
# Runs are serial: one launch at a time reuses <dest>/runtime and the target's
# working tree.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $(basename "$0") <dest>" >&2
  exit 2
fi

kit="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
repo="$(realpath -- "$(git -C "$kit" rev-parse --show-toplevel)")"
dest="$(realpath -m -- "$1")"
intent="$repo/plugins/software-factory/docs/runs/omp-workspaces/INTENT.md"
factory="$repo/plugins/software-factory/bin/factory.ts"
run_config="$repo/bootstrap/run/benchmark.yaml"
target_rev="572a6e0"
target_tree="1379b0fd46fc07fcf2f26a80c67d7a47dc84cae4"

# rm -rf is only safe on a named directory: reject filesystem/one-level paths
# (/tmp, /home), any directory that contains this checkout or $HOME, and any
# directory inside this checkout (reset.sh bootstrap would delete tracked files).
if [ "$(printf '%s' "$dest" | tr -cd / | wc -c)" -lt 2 ]; then
  echo "refusing to delete $dest: use a directory such as /tmp/bench-omp" >&2
  exit 2
fi
for kept in "${HOME:-}" "$repo"; do
  [ -n "$kept" ] || continue
  case "$kept/" in
    "$dest"/*)
      echo "refusing to delete $dest: it contains $kept" >&2
      exit 2
      ;;
  esac
done
case "$dest/" in
  "$repo"/*)
    echo "refusing to delete $dest: it is inside this checkout ($repo)" >&2
    exit 2
    ;;
esac

# Serial runs: a live launch holds <dest>/runtime/worktrees/.factory-runtime/locks.
# Deleting its runtime under it would corrupt the run, so refuse while it is live.
locks="$dest/runtime/worktrees/.factory-runtime/locks"
for lock in "$locks"/*.lock; do
  [ -e "$lock" ] || continue
  pid="$(sed -n 's/.*"pid": *\([0-9][0-9]*\).*/\1/p' "$lock" | head -1)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "refusing to reset $dest: a benchmark launch is running (pid $pid, $lock)" >&2
    exit 2
  fi
done

if [ ! -f "$intent" ]; then
  echo "archived intent missing: $intent" >&2
  exit 2
fi
if ! git -C "$repo" cat-file -e "$target_rev^{commit}" 2>/dev/null; then
  echo "target revision missing from $repo: $target_rev" >&2
  exit 2
fi

rm -rf -- "$dest"
mkdir -p "$dest/target"
echo "build: $target_rev + archived INTENT -> $dest/target"
git -C "$repo" archive "$target_rev" | tar -x -C "$dest/target"
git -C "$dest/target" init -q -b topic/omp-workspaces
mkdir -p "$dest/target/.factory/tasks/omp-workspaces"
cp "$intent" "$dest/target/.factory/tasks/omp-workspaces/INTENT.md"
git -C "$dest/target" add -A
git -C "$dest/target" -c user.name="Software Factory" -c user.email="factory@local" \
  commit -q -m "factory: task intent"

tree="$(git -C "$dest/target" rev-parse 'HEAD^{tree}')"
if [ "$tree" != "$target_tree" ]; then
  echo "tree mismatch: built $tree, expected $target_tree" >&2
  exit 1
fi
echo "tree: $tree"

cp "$kit/target-repo.yaml" "$dest/target/.factory/repo.yaml"
bun "$factory" init --repo "$dest/target" --goal omp-workspaces --intent "$intent"

echo "gates: offline install, typecheck, test (TMPDIR=$dest/gates-tmp)"
mkdir -p "$dest/gates-tmp"
(
  cd "$dest/target/plugins/software-factory"
  export TMPDIR="$dest/gates-tmp"
  bun install --offline --frozen-lockfile
  bun run typecheck
  bun test
)

echo
echo "run line (one iteration per launch; runs are serial):"
printf 'bun %q run --repo %q --goal %q --run-config %q\n' \
  "$factory" "$dest/target" "omp-workspaces" "$run_config"
