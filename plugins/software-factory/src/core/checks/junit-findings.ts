import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { convertJUnitToCTRFReport } from "junit-to-ctrf";
import { ctrfFindings } from "./ctrf.js";
import { GateReportError, type Finding } from "./findings.js";

/**
 * Converts one JUnit document with `junit-to-ctrf`, so every JUnit producer
 * reaches the same CTRF model as a native CTRF report. The converter reads a
 * file or glob, so the caller's already-read text takes one temp file.
 */
export async function junitFindings(
  check: string,
  xml: string,
): Promise<Finding[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-junit-"));
  const file = path.join(dir, "report.xml");
  try {
    fs.writeFileSync(file, xml, "utf8");
    const report = await convertJUnitToCTRFReport(file, { toolName: check });
    if (!report) throw new GateReportError("empty JUnit report");
    return ctrfFindings(check, report);
  } catch (error) {
    if (error instanceof GateReportError) throw error;
    throw new GateReportError(
      `JUnit report unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
