import { describe, it } from "bun:test";
import { git } from "../../src/core/git/exec.js";
import { createTmpRepo } from "../helpers/tmp-repo.js";

describe("GIT_OPTIONAL_LOCKS=0", () => {
  it("allows concurrent status and reset --hard without lock error", async () => {
    const repo = createTmpRepo();

    const stop = Date.now() + 2000;

    const statusLoop = async () => {
      while (Date.now() < stop) {
        await git(repo.dir, ["status"]);
      }
    };

    const resetLoop = async () => {
      while (Date.now() < stop) {
        await git(repo.dir, ["reset", "--hard", "HEAD"]);
      }
    };

    // Run them concurrently
    await Promise.all([statusLoop(), resetLoop()]);
  });
});
