#!/usr/bin/env bash
# Shakedown launch (README phase C): the toy goal on a fresh repository, every role on free models,
# executed from the pinned build — never from a working tree.
# usage: run.sh [target-dir]      env: ITERATIONS (default 1), FACTORY_PIN_ROOT, RUN_CONFIG
set -euo pipefail

here="$(dirname "$(readlink -f "$0")")"
pin="${FACTORY_PIN_ROOT:-$HOME/.local/share/factory/pins}/current"
[ -d "$pin" ] || { echo "no pinned build: run bootstrap/promote.sh first" >&2; exit 1; }
run_config="${RUN_CONFIG:-$here/../run/shakedown.yaml}"
target="${1:-$HOME/.local/share/factory/shakedown/kv-$(date +%Y%m%dT%H%M%S)}"

factory() { bun run "$pin/bin/factory.ts" "$@"; }

"$here/make-repo.sh" "$target" >/dev/null
factory init --repo "$target" --goal kv --intent "$here/intent.md"
code=0
factory run --repo "$target" --goal kv --run-config "$run_config" --iterations "${ITERATIONS:-1}" || code=$?
factory status --repo "$target" --goal kv || true
echo "target=$target pin=$(readlink -f "$pin") run_exit=$code"
exit "$code"
