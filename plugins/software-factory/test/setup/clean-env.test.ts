import { expect, it } from "bun:test";

it("test runs do not inherit the operator's FACTORY_RUN_CONFIG", () => {
  expect(process.env.FACTORY_RUN_CONFIG).toBeUndefined();
});
