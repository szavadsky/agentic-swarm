#!/usr/bin/env bash
# Run one assignment file through the harness CLI on a free model (LOG D10).
# The executable is $FACTORY_DISPATCH_BIN; the model is $FACTORY_DISPATCH_MODEL or the [model] argument.
# usage: dispatch.sh <assignment> [model]        e.g. dispatch.sh S2
# Worktree and branch follow the assignment name: ../<name> on factory-v3-<name>, created from factory-v3 when missing.
# Event log (JSONL) goes outside git: $FACTORY_BOOTSTRAP_RUNS or ~/.local/share/factory/bootstrap-runs.
# Follow-up round in the same session (same context, same agent): SESSION=<id> MESSAGE="..." dispatch.sh <assignment>
# Logic lives in plugins/software-factory/src/cli/commands/bootstrap-dispatch.ts.
exec bun "$(dirname "$(readlink -f "$0")")/../plugins/software-factory/scripts/bootstrap-dispatch.ts" "$@"
