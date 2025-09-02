const { expect } = require("chai");
const fs = require("fs-extra");
const path = require("path");
const { pruneOldBackups } = require("../scripts/rclone-backup.js");

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
        await fs.writeFile(path.join(backups, "new.tar.gz"), "new");
        process.env.BACKUP_DIR = backups;
    });

    afterEach(async () => {
        await fs.remove(temp);
        delete process.env.BACKUP_DIR;
        delete process.env.BACKUP_RETENTION_DAYS;
    });

    it("removes backups older than retention", async function() {
        await pruneOldBackups(7);
        const oldExists = await fs.pathExists(path.join(backups, "old.tar.gz"));
        const newExists = await fs.pathExists(path.join(backups, "new.tar.gz"));
        expect(oldExists).to.be.false;
        expect(newExists).to.be.true;
    });

    it("defaults to 7 days for invalid BACKUP_RETENTION_DAYS", async function() {
        process.env.BACKUP_RETENTION_DAYS = "not-a-number";
        await pruneOldBackups();
        const oldExists = await fs.pathExists(path.join(backups, "old.tar.gz"));
        const newExists = await fs.pathExists(path.join(backups, "new.tar.gz"));
        expect(oldExists).to.be.false;
        expect(newExists).to.be.true;
    });
});
