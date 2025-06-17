const { describe, it } = require("mocha");
const { expect } = require("chai");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

describe("Server logs redirected to file (LOG-0001)", function () {
  this.timeout(600000); // setup can take time

  it("writes server output only to log files", function () {
    const root = path.resolve(__dirname, "..", "..");
    const logFiles = [
      path.join(root, "server/logs/test-svelte-kit.log"),
      path.join(root, "server/logs/test-auth-service-tee.log"),
      path.join(root, "server/logs/tinylicious.log"),
      path.join(root, "server/logs/firebase-emulator.log"),
    ];
    // clean previous logs
    logFiles.forEach((f) => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });

    const result = spawnSync("bash", ["scripts/codex-setp.sh"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status).to.equal(0);
    expect(result.stdout).to.not.match(/Local server:/);
    expect(result.stdout).to.not.match(/SvelteKit v/);

    logFiles.forEach((f) => {
      expect(fs.existsSync(f)).to.be.true;
      const content = fs.readFileSync(f, "utf8");
      expect(content).to.not.equal("");
    });

    spawnSync("node", ["scripts/kill-tinylicious.js"], { cwd: root, encoding: "utf8" });
  });
});
