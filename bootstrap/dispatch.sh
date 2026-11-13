#!/usr/bin/env bash
# Run one assignment file through the OpenCode CLI on a free model (LOG D10).
# usage: dispatch.sh <assignment> [model]        e.g. dispatch.sh S2
# Worktree and branch follow the assignment name: ../<name> on factory-v3-<name>, created from factory-v3 when missing.
# Event log (JSONL) goes outside git: $FACTORY_BOOTSTRAP_RUNS or ~/.local/share/factory/bootstrap-runs.
set -euo pipefail

name="${1:?usage: dispatch.sh <assignment> [model]}"
model="${2:-opencode/deepseek-v4.1-flash-free#max}"
root="$(git -C "$(dirname "$(readlink -f "$0")")" rev-parse --show-toplevel)"
lower="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')"
wt="$(dirname "$root")/$lower"
logs="${FACTORY_BOOTSTRAP_RUNS:-$HOME/.local/share/factory/bootstrap-runs}"
mkdir -p "$logs"

[ -d "$wt" ] || git -C "$root" worktree add -q -b "factory-v3-$lower" "$wt" factory-v3
(cd "$wt/plugins/software-factory" && bun install --frozen-lockfile --silent)

log="$logs/$name-$(date +%Y%m%dT%H%M%S).jsonl"
cd "$wt"
status=0
timeout "${FACTORY_DISPATCH_TIMEOUT:-3h}" opencode run --auto --archived --format json --title "bootstrap $name" -m "$model" \
  "Your assignment is the file bootstrap/assignments/$name.md in this git worktree ($wt). Read bootstrap/assignments/RULES.md and the assignment in full, then carry it out to completion." \
  >"$log" 2>"$log.stderr" || status=$?

echo "assignment=$name model=$model exit=$status log=$log"
echo "session=$(jq -r 'select(.type=="step_start") | .sessionID' "$log" | head -1)"
echo "steps=$(jq -c 'select(.type=="step_finish")' "$log" | wc -l) tool_calls=$(jq -c 'select(.type=="tool_use")' "$log" | wc -l)"
echo "errors:"; jq -c 'select(.type=="error") | .error' "$log" | tail -3
echo "final text:"; jq -r 'select(.type=="text") | .part.text' "$log" | tail -1 | head -c 1500
exit "$status"
