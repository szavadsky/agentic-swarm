/** The kernel schema files every writer emits, by artifact name. */
const FILES = [
  "class.schema.json",
  "hold.schema.json",
  "outcome.schema.json",
  "process.schema.json",
  "qa.schema.json",
  "repo.schema.json",
  "run.schema.json",
  "task.schema.json",
];

/**
 * The schema files the kernel writes, by artifact name. The CLI export, the
 * shipped-config check and the goal's launch provisioning share it, so a new
 * schema cannot land in one writer's output while another keeps the old set.
 */
export function kernelSchemaFiles(): string[] {
  return [...FILES];
}
