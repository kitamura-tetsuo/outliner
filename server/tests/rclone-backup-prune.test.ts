import { expect } from "chai";
import fs from "fs-extra";
import path from "path";
// @ts-ignore
import { afterEach, beforeEach, describe, it } from "mocha";
import { fileURLToPath } from "url";
import { getConfig, pruneOldBackups } from "../scripts/rclone-backup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("rclone backup pruneOldBackups", function() {
    const temp = path.join(__dirname, "tmp-prune");
    const backups = path.join(temp, "backups");

    beforeEach(async () => {
        await fs.remove(temp);
        await fs.mkdir(backups, { recursive: true });
        const oldFile = path.join(backups, "old.tar.gz");
        await fs.writeFile(oldFile, "old");
        const past = Date.now() - 10 * 24 * 60 * 60 * 1000;
        await fs.utimes(oldFile, past / 1000, past / 1000);
        process.env.BACKUP_DIR = backups;
    });

    afterEach(async () => {
        await fs.remove(temp);
        delete process.env.BACKUP_DIR;
    });

    it("removes backups older than retention", async function() {
        await pruneOldBackups(7);
        const exists = await fs.pathExists(path.join(backups, "old.tar.gz"));
        expect(exists).to.be.false;
    });
});
