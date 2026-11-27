import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CTRFReport } from "ctrf";
import { convertJUnitToCTRFReport } from "junit-to-ctrf";
import { GateReportError } from "./findings.js";

/**
 * Converts one JUnit document into a validated CTRF report with `junit-to-ctrf`,
 * so every JUnit producer reaches the same CTRF model as a native CTRF report.
 */
export async function junitToCtrf(
  check: string,
  xml: string,
): Promise<CTRFReport> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-junit-"));
  const file = path.join(dir, "report.xml");
  try {
    fs.writeFileSync(file, xml, "utf8");
    const report = await convertJUnitToCTRFReport(file, { toolName: check });
    if (!report) throw new GateReportError("empty JUnit report");
    return report;
  } catch (error) {
    if (error instanceof GateReportError) throw error;
    throw new GateReportError(
      `JUnit report unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
