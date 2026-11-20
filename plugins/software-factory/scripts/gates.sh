#!/usr/bin/env bash
# Package gates: the logic lives in gates.ts; this file only execs it.
exec bun "$(dirname "$(readlink -f "$0")")/gates.ts" "$@"
