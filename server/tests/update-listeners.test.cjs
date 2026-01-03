const { expect } = require("chai");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const sinon = require("sinon");
require("ts-node/register");

const { createPersistence } = require("../src/persistence");
const { addRoomSizeListener, removeRoomSizeListener } = require("../src/update-listeners");

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

describe("update-listeners (room-size)", () => {
    let tmpDirs = [];

    afterEach(async () => {
        sinon.restore();
        for (const d of tmpDirs) {
            try {
                await fs.remove(d);
            } catch {}
        }
        tmpDirs = [];
    });

    it("triggers warnIfRoomTooLarge via observeDeep on orderedTree and detaches", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ydb-"));
        tmpDirs.push(dir);
        const realPersistence = createPersistence(dir);

        const logger = { warn: sinon.spy(), info: () => {}, error: () => {}, debug: () => {}, trace: () => {} };

        const room = "proj/room1";
        // Ensure orderedTree exists prior to attaching (so observeDeep path is used)
        const docRef = await realPersistence.getYDoc(room);
        const ymap = docRef.getMap("orderedTree");
        ymap.set("init", {});

        // Wrap persistence to always return the same Y.Doc instance
        const persistence = { getYDoc: async (_name) => docRef };

        await addRoomSizeListener(persistence, room, /*limitBytes*/ -1, logger);

        // Mutate orderedTree -> should trigger observeDeep handler
        const docAfterAttach = await persistence.getYDoc(room);
        const ymapAfter = docAfterAttach.getMap("orderedTree");
        let localUpdateCount = 0;
        docAfterAttach.on("update", () => {
            localUpdateCount++;
        });
        docAfterAttach.transact(() => {
            ymapAfter.set("k1", { a: 1 });
        });
        await delay(250);

        expect(localUpdateCount > 0, "local doc update should have fired").to.equal(true);
        expect(logger.warn.called, "logger.warn should be called at least once").to.equal(true);
        const payloads = logger.warn.getCalls().map(c => c.args[0] || {});
        expect(payloads.some(p => p && p.event === "room_size_exceeded" && p.room === room)).to.equal(true);

        const calledCount = logger.warn.callCount;
        await removeRoomSizeListener(persistence, room);

        // Further changes should not invoke warn after detach
        const docAfterDetach = await persistence.getYDoc(room);
        const ymapAfterDetach = docAfterDetach.getMap("orderedTree");
        docAfterDetach.transact(() => {
            ymapAfterDetach.set("k2", { b: 2 });
        });
        await delay(250);
        expect(logger.warn.callCount).to.equal(calledCount);
    });

    it("falls back to doc.on('update') when orderedTree is missing and detaches safely", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ydb-"));
        tmpDirs.push(dir);
        const realPersistence = createPersistence(dir);

        const logger = { warn: sinon.spy(), info: () => {}, error: () => {}, debug: () => {}, trace: () => {} };

        const room = "proj/room2";
        const doc = await realPersistence.getYDoc(room);
        // Intentionally make orderedTree unavailable for observeDeep to force fallback
        const originalGetMap = doc.getMap.bind(doc);
        doc.getMap = (name) => {
            if (name === "orderedTree") {
                // Return a stub without observeDeep so that fallback path is used
                return { unobserveDeep: () => {} };
            }
            return originalGetMap(name);
        };

        // Wrap persistence to always return the same Y.Doc instance
        const persistence = { getYDoc: async (_name) => doc };

        await addRoomSizeListener(persistence, room, /*limitBytes*/ -1, logger);

        // Any doc-level change should trigger the fallback doc.on('update') handler
        const doc2 = await persistence.getYDoc(room);
        const other = doc2.getMap("other");
        doc2.transact(() => {
            other.set("x", { c: 3 });
        });
        await delay(250);

        expect(logger.warn.called, "logger.warn should be called via fallback").to.equal(true);

        const calledCount = logger.warn.callCount;
        await removeRoomSizeListener(persistence, room);

        // After detach, further updates should not increase warn count
        doc2.transact(() => {
            other.set("y", { d: 4 });
        });
        await delay(250);
        expect(logger.warn.callCount).to.equal(calledCount);
    });
});
