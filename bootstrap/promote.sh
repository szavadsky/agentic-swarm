#!/usr/bin/env bash
# Promote one commit of the factory to the pinned build that launches execute from.
# Gate = typecheck + the no-model suite, run on a clean export of that commit, never on a working tree.
# The gate result is written to <pin>/gate.yaml; only an all-pass pin becomes `current`.
# Logic lives in plugins/software-factory/src/cli/commands/promote.ts.
# usage: promote.sh [rev]      env: FACTORY_PIN_ROOT (default ~/.local/share/factory/pins), FACTORY_PINS_KEPT (default 5)
exec bun "$(dirname "$(readlink -f "$0")")/../plugins/software-factory/scripts/promote.ts" "$@"
