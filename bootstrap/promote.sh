#!/usr/bin/env bash
# Promote one commit of the factory to the pinned build that launches execute from.
# Gate = typecheck + the no-model suite, run on a clean export of that commit, never on a working tree.
# The gate result is written to <pin>/gate.yaml; only an all-pass pin becomes `current`.
# usage: promote.sh [rev]      env: FACTORY_PIN_ROOT (default ~/.local/share/factory/pins), FACTORY_PINS_KEPT (default 5)
set -euo pipefail

repo="$(git -C "$(dirname "$(readlink -f "$0")")" rev-parse --show-toplevel)"
rev="$(git -C "$repo" rev-parse --short=12 "${1:-HEAD}")"
pins="${FACTORY_PIN_ROOT:-$HOME/.local/share/factory/pins}"
kept="${FACTORY_PINS_KEPT:-5}"
build="$pins/$rev"
# The writer belongs to the tree running promote, not to the rev: an older rev
# carries no script, and a failed install leaves no zod/yaml to import in the pin.
writer="$repo/plugins/software-factory/scripts/pin-gate.ts"
mkdir -p "$pins"

tmp="$(mktemp -d "$pins/.tmp.XXXXXX")" # same filesystem as the pins: the final rename is atomic
trap 'rm -rf "$tmp"' EXIT

# The no-model suite exercises fake-name run configs shipped inside the
# package; the gate names the rev tree for the one repo-level file a test
# reaches for (bootstrap/promote.sh). Shipped run configs stay out of the
# pin: tests load fake names, never the operator's.
unset FACTORY_TREE_ROOT
if git -C "$repo" cat-file -e "$rev:bootstrap/promote.sh" 2>/dev/null; then
  git -C "$repo" archive "$rev" bootstrap/promote.sh | tar -x -C "$tmp"
  export FACTORY_TREE_ROOT="$tmp"
fi

if [ -d "$build" ]; then
  # An existing pin already is this rev's clean export; re-gating it in place
  # turns a red record green on a flake retry and records a pin that predates
  # the gate.
  pkg="$build"
else
  git -C "$repo" archive "$rev" plugins/software-factory | tar -x -C "$tmp"
  pkg="$tmp/plugins/software-factory"
  rm -rf "$pkg/docs" # run baselines are large and not part of the executable
fi

if ! (cd "$pkg" && bun install --frozen-lockfile --silent); then
  echo "install failed in $pkg; the gate records what it can" >&2
fi

typecheck=pass
(cd "$pkg" && bun run typecheck) || typecheck=fail
tests=pass
(cd "$pkg" && bun test) || tests=fail
bun "$writer" write --dir "$pkg" --rev "$rev" --typecheck "$typecheck" --tests "$tests"
if [ "$pkg" != "$build" ]; then
  mv "$pkg" "$build"
fi

green=1
if [ "$typecheck" != pass ] || [ "$tests" != pass ]; then
  green=0
fi

current=""
if [ -e "$pins/current" ]; then
  current="$(readlink -f "$pins/current")"
fi
if [ "$green" = 1 ]; then
  ln -sfn "$build" "$pins/current"
  current="$build"
else
  echo "pin gate red: $build (typecheck: $typecheck, tests: $tests); not linked as current" >&2
  if [ "$current" = "$build" ]; then
    echo "current still points at this red pin; factory run refuses it until a green promote" >&2
  fi
fi

# Drop the oldest builds beyond the kept count; a red build counts like any
# other, the pin just gated is never pruned, and neither is the current one.
ls -1dt "$pins"/*/ | grep -v "/current/$" | tail -n "+$((kept + 1))" | while read -r old; do
  target="${old%/}"
  if [ "$target" = "$build" ]; then continue; fi
  if [ -n "$current" ] && [ "$target" = "$current" ]; then continue; fi
  rm -rf "$target"
done

if [ "$green" = 1 ]; then
  echo "$build"
  exit 0
fi
exit 1
