const { expect } = require("chai");
const fs = require("fs-extra");
const path = require("path");
const { createArchive } = require("../scripts/rclone-backup.js");

describe("rclone backup createArchive", function() {
    const temp = path.join(__dirname, "tmp-create");
    const src = path.join(temp, "src");
    const backups = path.join(temp, "backups");

    beforeEach(async () => {
        await fs.remove(temp);
        await fs.mkdir(src, { recursive: true });
        await fs.mkdir(backups, { recursive: true });
        await fs.writeFile(path.join(src, "file.txt"), "hi");
        process.env.BACKUP_SOURCE = src;
        process.env.BACKUP_DIR = backups;
        process.env.RCLONE_REMOTE = "";
    });

    afterEach(async () => {
        await fs.remove(temp);
        delete process.env.BACKUP_SOURCE;
        delete process.env.BACKUP_DIR;
        delete process.env.RCLONE_REMOTE;
    });

    it("creates a gzip archive in backup directory", async function() {
        const archive = await createArchive();
        const exists = await fs.pathExists(archive);
        expect(exists).to.be.true;
    });
});
