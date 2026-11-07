/**
 * Generates an agent-specific review schema with suggestions[].disposition restricted
 * to the agent's allowed dispositions enum (§8.7).
 */
export function generateReviewSchema(
  allowedDispositions: string[]
): Record<string, unknown> {
  const dispositions =
    allowedDispositions.length > 0
      ? allowedDispositions
      : ["fix", "optional", "architect", "human-awareness", "human-async"];

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "ReviewArtifact",
    type: "object",
    required: ["status", "summary", "suggestions"],
    properties: {
      status: {
        type: "string",
        enum: ["approved", "changes_requested", "commented"],
      },
      summary: { type: "string" },
      suggestions: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "disposition", "summary"],
          properties: {
            id: { type: "string" },
            disposition: {
              type: "string",
              enum: dispositions,
            },
            summary: { type: "string" },
            detail: { type: "string" },
            location: {
              type: "object",
              required: ["file"],
              properties: {
                file: { type: "string" },
                line: { type: "integer" },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  };
}
