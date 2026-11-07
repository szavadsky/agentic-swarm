import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";

/**
 * Atomically writes text to a file by writing to a temporary sibling file first
 * and renaming it over the destination.
 */
export async function writeTextAtomic(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });

  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  await fs.promises.writeFile(tempPath, content, "utf8");
  await fs.promises.rename(tempPath, filePath);
}

/**
 * Synchronous version of writeTextAtomic.
 */
export function writeTextAtomicSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

/**
 * Atomically writes an object as YAML.
 */
export async function writeYamlAtomic(filePath: string, data: unknown): Promise<void> {
  const content = yaml.stringify(data);
  await writeTextAtomic(filePath, content);
}

/**
 * Synchronous version of writeYamlAtomic.
 */
export function writeYamlAtomicSync(filePath: string, data: unknown): void {
  const content = yaml.stringify(data);
  writeTextAtomicSync(filePath, content);
}

/**
 * Reads and parses YAML file.
 */
export async function readYaml<T = unknown>(filePath: string): Promise<T> {
  const text = await fs.promises.readFile(filePath, "utf8");
  return yaml.parse(text) as T;
}

/**
 * Synchronous version of readYaml.
 */
export function readYamlSync<T = unknown>(filePath: string): T {
  const text = fs.readFileSync(filePath, "utf8");
  return yaml.parse(text) as T;
}

/**
 * Reads text file.
 */
export async function readText(filePath: string): Promise<string> {
  return fs.promises.readFile(filePath, "utf8");
}

/**
 * Synchronous version of readText.
 */
export function readTextSync(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}
