const { expect } = require("chai");
const sinon = require("sinon");
require("ts-node/register");
const admin = require("firebase-admin");
const { extractAuthToken, verifyIdTokenCached, clearTokenCache } = require("../src/websocket-auth");

describe("websocket auth helpers", () => {
    afterEach(() => {
        sinon.restore();
        clearTokenCache();
    });

    it("extracts auth token from url", () => {
        const req = { url: "/?auth=test-token" };
        expect(extractAuthToken(req)).to.equal("test-token");
    });

    it("returns undefined when token missing", () => {
        const req = { url: "/" };
        expect(extractAuthToken(req)).to.be.undefined;
    });

    it("verifies token and caches result", async () => {
        const stub = sinon.stub(admin.auth(), "verifyIdToken").resolves({
            uid: "u1",
            exp: Math.floor(Date.now() / 1000) + 60,
        });
        const token = "valid";
        const first = await verifyIdTokenCached(token);
        expect(first.uid).to.equal("u1");
        expect(stub.calledOnce).to.be.true;
        const second = await verifyIdTokenCached(token);
        expect(second.uid).to.equal("u1");
        expect(stub.calledOnce).to.be.true;
    });

    it("throws on invalid token", async () => {
        sinon.stub(admin.auth(), "verifyIdToken").rejects(new Error("bad"));
        let err;
        try {
            await verifyIdTokenCached("bad");
        } catch (e) {
            err = e;
        }
        expect(err).to.be.instanceOf(Error);
    });
});
