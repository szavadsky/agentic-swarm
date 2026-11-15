import { describe, expect, it } from "bun:test";
import type { CheckResult } from "../../src/core/checks/types.js";
import { isInfraCheck } from "../../src/kernel/gates.js";

function check(patch: Partial<CheckResult> = {}): CheckResult {
  return {
    name: "gate",
    ok: false,
    summary: "exit 1",
    output: "boom",
    fingerprint: "x",
    ...patch,
  };
}

describe("isInfraCheck", () => {
  it("matches a marked check that could not start", () => {
    expect(
      isInfraCheck(check({ details: { kind: "infra", cause: "exit 127" } })),
    ).toBe(true);
  });

  it("matches a missing gate runner by its kernel-owned summary, details or not", () => {
    expect(isInfraCheck(check({ summary: "exit 127" }))).toBe(true);
    expect(isInfraCheck(check({ summary: "exit 126" }))).toBe(true);
    expect(
      isInfraCheck(
        check({ summary: "exit 127", details: { roots: ["/tmp/x"] } }),
      ),
    ).toBe(true);
  });

  it("leaves real reds and passes alone", () => {
    expect(isInfraCheck(check({ summary: "exit 1" }))).toBe(false);
    expect(isInfraCheck(check({ summary: "timed out after 900s" }))).toBe(
      false,
    );
    expect(isInfraCheck(check({ ok: true, summary: "pass" }))).toBe(false);
  });
});
