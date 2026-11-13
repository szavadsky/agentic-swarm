import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "yaml";
import { fingerprintText, fingerprintObject, normalizeText } from "../src/core/fingerprint.js";
import {
  readText,
  readYaml,
  writeTextAtomic,
  writeYamlAtomic,
} from "../src/core/records/io.js";

describe("fingerprint", () => {
  it("normalizes text and fingerprints it consistently", () => {
    const textA = "  Hello   World \r\n Line 2  ";
    const textB = "hello world\nline 2";
    expect(normalizeText(textA)).toBe("hello world line 2");
    expect(fingerprintText(textA)).toBe(fingerprintText(textB));
    expect(fingerprintText("a")).not.toBe(fingerprintText("b"));
  });

  it("fingerprints objects stably across key order", () => {
    expect(fingerprintObject({ a: 1, b: [2, 3] })).toBe(
      fingerprintObject({ b: [2, 3], a: 1 })
    );
    expect(fingerprintObject({ a: 1 })).not.toBe(fingerprintObject({ a: 2 }));
  });
});

describe("record IO", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-records-test-"));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes text atomically and reads it back", async () => {
    const file = path.join(dir, "nested", "file.txt");
    await writeTextAtomic(file, "hello");
    expect(await readText(file)).toBe("hello");
    expect(fs.readFileSync(file, "utf8")).toBe("hello");
  });

  it("round-trips YAML", async () => {
    const file = path.join(dir, "data.yaml");
    const data = { status: "open", nested: { items: [1, 2] } };
    await writeYamlAtomic(file, data);
    expect(await readYaml(file)).toEqual(data);
    expect(yaml.parse(fs.readFileSync(file, "utf8"))).toEqual(data);
  });

  it("surfaces ENOENT for missing files", async () => {
    await expect(readText(path.join(dir, "missing.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readYaml(path.join(dir, "missing.yaml"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
