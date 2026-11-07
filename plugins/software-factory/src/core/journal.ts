import fs from "node:fs";
import path from "node:path";

export interface JournalEvent {
  ts: string;
  type: string;
  [key: string]: unknown;
}

/**
 * Appends an audit event to {taskDir}/journal.ndjson.
 * Append-only; state is never read from here for decisions (§6.2, §6.3.4).
 */
export async function appendJournal(
  taskDir: string,
  event: { type: string; ts?: string; [key: string]: unknown }
): Promise<void> {
  const fullEvent: JournalEvent = {
    ...event,
    ts: event.ts ?? new Date().toISOString(),
  };
  const line = JSON.stringify(fullEvent) + "\n";
  const journalPath = path.join(taskDir, "journal.ndjson");
  await fs.promises.mkdir(path.dirname(journalPath), { recursive: true });
  await fs.promises.appendFile(journalPath, line, "utf8");
}

/**
 * Reads all journal entries from {taskDir}/journal.ndjson.
 */
export async function readJournal(taskDir: string): Promise<JournalEvent[]> {
  const journalPath = path.join(taskDir, "journal.ndjson");
  if (!fs.existsSync(journalPath)) {
    return [];
  }
  const content = await fs.promises.readFile(journalPath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const events: JournalEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // Ignore malformed lines in audit log
    }
  }
  return events;
}
