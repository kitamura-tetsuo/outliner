require("ts-node/register");
const { expect } = require("chai");
const sinon = require("sinon");
const Y = require("yjs");
const { addRoomSizeListener, removeRoomSizeListener } = require("../src/update-listeners");

describe("update-listeners", () => {
    afterEach(() => sinon.restore());

    it("adds and removes listeners based on connection count", async () => {
        const doc = new Y.Doc();
        const onSpy = sinon.spy(doc, "on");
        const offSpy = sinon.spy(doc, "off");
        const persistence = { getYDoc: sinon.stub().resolves(doc) };
        const logger = { warn: () => undefined };

        await addRoomSizeListener(persistence, "room", 0, logger);
        await addRoomSizeListener(persistence, "room", 0, logger);
        expect(onSpy.callCount).to.equal(1);

        await removeRoomSizeListener(persistence, "room");
        expect(offSpy.called).to.be.false;

        await removeRoomSizeListener(persistence, "room");
        expect(offSpy.callCount).to.equal(1);
    });
});
