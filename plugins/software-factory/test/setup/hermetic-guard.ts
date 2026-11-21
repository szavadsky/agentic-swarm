import { afterEach } from "bun:test";
import {
  HermeticViolation,
  blameLines,
  drainViolations,
  hermeticGuardActive,
} from "./hermetic/violations.js";
import { installNetworkGuard } from "./hermetic/network.js";
import { redirectPriceCache } from "./hermetic/price-cache.js";
import { installSpawnGuard } from "./hermetic/spawn.js";

export {
  HermeticViolation,
  drainViolations,
  hermeticGuardActive,
} from "./hermetic/violations.js";
export { harnessName, isLoopbackHostname } from "./hermetic/hosts.js";

if (hermeticGuardActive) {
  installSpawnGuard();
  installNetworkGuard();
  redirectPriceCache();
  // A swallowed refusal still fails its test: the recording outlives the
  // caught throw, and this hook runs before the next test starts. (A refusal
  // at import time fails the importing file first; the recording then burns
  // on the next hook run, with the blame stack pointing at the real site.)
  afterEach(() => {
    const drained = drainViolations();
    if (drained.length === 0) return;
    const report = drained
      .map(
        (v) =>
          `blocked ${v.kind} "${v.detail}"\n${blameLines(v.stack).join("\n")}`,
      )
      .join("\n");
    throw new HermeticViolation(
      `hermetic guard: ${drained.length} refused call(s) outlived the test body (swallowed by the code under test):\n${report}`,
    );
  });
}
