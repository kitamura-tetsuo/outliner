import { expect } from "chai";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, it } from "mocha";
import os from "os";
import path from "path";
// @ts-ignore
import { rotateLogFile } from "../src/utils/log-manager.js";

describe("rotateLogFile utility (LOG-0002)", function() {
    let tmpDir: string;
    let logFile: string;

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
