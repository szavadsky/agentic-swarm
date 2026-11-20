import { describe, expect, it } from "bun:test";
import { classifyErrorText } from "../../src/harness/acpx/classify.js";

describe("acpx classifyErrorText", () => {
  it("keeps a bare abort text a cancel while a socket abort stays network", () => {
    // The transport branch sits above the abort branch, so the abort branch
    // only fires for text without a transport token.
    expect(classifyErrorText("Request aborted")).toEqual({ kind: "cancelled" });
    expect(
      classifyErrorText("ECONNABORTED: The operation was aborted"),
    ).toEqual({
      kind: "infra",
      cause: "network",
      details: "ECONNABORTED: The operation was aborted",
    });
  });
});
