# kv — a small key-value command-line store

Build `kv`, a key-value store for one user on one machine.

- Commands: `kv set <key> <value>`, `kv get <key>`, `kv del <key>`, `kv list [prefix]`. Values print raw, one per line; `list` prints keys sorted.
- Exit codes: 0 success, 1 key not found, 2 usage error (message on stderr).
- Data lives in one JSON file: path from `KV_FILE`, default `~/.kv.json`. A crash in the middle of a write never leaves a corrupt or empty file.
- The store is a library first: an interface usable without the command line, with the CLI as a thin layer over it.
- Tests exercise real files in a temporary directory. `README.md` documents usage.

Done when every command behaves as specified, `bun test` and `bun run typecheck` are green, and the README matches the behavior.
