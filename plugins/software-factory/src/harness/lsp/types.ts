/** The LSP protocol shapes the task-file frontmatter server speaks. */

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspDiagnostic {
  range: { start: LspPosition; end: LspPosition };
  severity: 1;
  source: string;
  message: string;
}
