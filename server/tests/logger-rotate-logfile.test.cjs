const { describe, it, beforeEach, afterEach } = require("mocha");
const { expect } = require("chai");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const { rotateLogFile } = require("../utils/logger");

describe("rotateLogFile utility (LOG-0002)", function() {
    let tmpDir;
    let logFile;

    beforeEach(async function() {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "log-"));
        logFile = path.join(tmpDir, "test.log");
        await fs.outputFile(logFile, "test");
    });

    afterEach(async function() {
        await fs.remove(tmpDir);
    });

    it("creates a .1 backup file", async function() {
        const result = await rotateLogFile(logFile, 2);
        expect(result).to.be.true;
        const backupExists = await fs.pathExists(logFile + ".1");
        expect(backupExists).to.be.true;
    });
});
