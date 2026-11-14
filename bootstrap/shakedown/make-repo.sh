#!/usr/bin/env bash
# Creates the shakedown target: an empty, green Bun/TypeScript repository for the toy goal (intent.md).
# It has dev dependencies on purpose: a fresh task worktree is not usable until the setup gate ran.
set -euo pipefail

dest="${1:?usage: make-repo.sh <dest-dir>}"
[ -e "$dest" ] && { echo "refusing to overwrite $dest" >&2; exit 1; }
mkdir -p "$dest/src" "$dest/test"
cd "$dest"
git init -q -b main

cat > package.json <<'EOF'
{
  "name": "kv",
  "private": true,
  "type": "module",
  "scripts": { "test": "bun test", "typecheck": "tsc --noEmit" },
  "devDependencies": { "@types/bun": "^1.2.0", "typescript": "^5.8.0" }
}
EOF

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["bun"]
  },
  "include": ["src", "test"]
}
EOF

printf 'node_modules/\n' > .gitignore
printf '# kv\n' > README.md
printf 'export const version = "0.0.0"\n' > src/version.ts
cat > test/version.test.ts <<'EOF'
import { expect, test } from "bun:test"
import { version } from "../src/version"

test("version is semver", () => {
  expect(version).toMatch(/^\d+\.\d+\.\d+$/)
})
EOF

bun install --silent
bun test >/dev/null 2>&1
bun run typecheck >/dev/null
git add -A
git -c user.name=shakedown -c user.email=shakedown@localhost commit -q -m "empty green project"
echo "$dest"
