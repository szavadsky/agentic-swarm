## Cleanliness revision

The previous checks identified cleanliness rule violations in your changes.
This is your one revision follow-up before review:

1. Clean up: remove scaffolds, temporary files, debug output, or unneeded large files.
2. Ignore: add the path to `.gitignore` when the file never belongs in the branch.
3. Override: list the path under `cleanliness.allowedFiles` in `.factory/repo.yaml` when the file belongs and must stay tracked.

The follow-up is never repeated; if the file stays, say why and the reviewer sees your reason.
