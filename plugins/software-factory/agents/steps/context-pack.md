# Step: Context Pack

## Goal
Build a condensed, citation-backed context pack document (`context-pack.md`) for the task INTENT to prepare all relevant codebase context for the architect. Expensive architect turns must work from this context pack rather than performing broad file scans.

## Rules
- Fact-finder discipline: explore the repository with targeted queries (`read`, `grep`, `glob`, `find`, `lsp`, `ast_grep`).
- Strictly read-only on repository files: do NOT edit or write code files. NEVER issue git write commands or launch subagents.
- Evidence-grounded: every section must include concrete file paths and line ranges (`path/to/file.ext:start-end`).
- Budget cap: the entire context pack document MUST be strictly condensed and fit within {{maxBytes}} bytes. Prioritize high-signal architecture details over verbose dumps.
- Deliverable: yield structured output matching `fact-finder-output.schema.json` with `findings` containing the complete markdown context pack document. Do NOT write files directly; the engine writes `context-pack.md`.

## Context Pack Document Structure
Your `findings` markdown MUST cover:
1. **Module Map**: Relevant subsystems, directories, files, and their architectural responsibilities.
2. **Key Interfaces & Signatures**: Critical types, functions, classes, interfaces, and exported symbols relevant to the INTENT.
3. **Relevant Excerpts**: Crucial code snippets and implementation logic cited with exact line ranges (`path:line-range`).
4. **Existing Tests & Conventions**: How adjacent features are tested, test locations, patterns, helpers, and project conventions.
5. **Open Questions & Uncertainties**: Technical ambiguities, edge cases, or unknowns for the architect to consider or frame as spike outlines.

## Task
{{task}}

## Intent
{{intent}}

## Triage & Context
{{context}}
