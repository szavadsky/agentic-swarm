#!/usr/bin/env bash
# Promote one commit of the factory to the pinned build that launches execute from.
# Gate = typecheck + the no-model suite, run on a clean export of that commit, never on a working tree.
# usage: promote.sh [rev]      env: FACTORY_PIN_ROOT (default ~/.local/share/factory/pins), FACTORY_PINS_KEPT (default 5)
set -euo pipefail

repo="$(git -C "$(dirname "$(readlink -f "$0")")" rev-parse --show-toplevel)"
rev="$(git -C "$repo" rev-parse --short=12 "${1:-HEAD}")"
pins="${FACTORY_PIN_ROOT:-$HOME/.local/share/factory/pins}"
kept="${FACTORY_PINS_KEPT:-5}"
build="$pins/$rev"
mkdir -p "$pins"

if [ ! -d "$build" ]; then
  tmp="$(mktemp -d "$pins/.tmp.XXXXXX")" # same filesystem as the pins: the final rename is atomic
  trap 'rm -rf "$tmp"' EXIT
  git -C "$repo" archive "$rev" plugins/software-factory | tar -x -C "$tmp"
  pkg="$tmp/plugins/software-factory"
  rm -rf "$pkg/docs" # run baselines are large and not part of the executable
  (cd "$pkg" && bun install --frozen-lockfile --silent && bun run typecheck && bun test)
  mv "$pkg" "$build"
fi

ln -sfn "$build" "$pins/current"
# Drop the oldest builds beyond the kept count; never the one just promoted.
ls -1dt "$pins"/*/ | grep -v "/current/$" | tail -n "+$((kept + 1))" | while read -r old; do
  [ "${old%/}" = "$build" ] || rm -rf "$old"
done
echo "$build"
