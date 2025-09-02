const { expect } = require("chai");
const fs = require("fs-extra");
const path = require("path");
const Y = require("yjs");
const { LeveldbPersistence } = require("y-leveldb");
const { warnIfRoomTooLarge } = require("../dist/persistence.js");

describe("warnIfRoomTooLarge", () => {
    it("logs when room size exceeds limit", async () => {
        const dir = path.join(__dirname, "tmpdb");
        await fs.remove(dir);
        const persistence = new LeveldbPersistence(dir);
        const room = "test-room";
        const doc = new Y.Doc();
        doc.getText("t").insert(0, "a".repeat(1024 * 1024));
        const update = Y.encodeStateAsUpdate(doc);
        await persistence.storeUpdate(room, update);
        let warned = false;
        const logger = {
            warn: () => {
                warned = true;
            },
        };
        await warnIfRoomTooLarge(persistence, room, 500 * 1024, logger);
        await persistence.destroy();
        await fs.remove(dir);
        expect(warned).to.be.true;
    });
});
