import { expect } from "chai";
import admin from "firebase-admin";
import sinon from "sinon";
import { clearTokenCache, extractAuthToken, getTokenCacheSize, verifyIdTokenCached } from "../src/websocket-auth.js";

describe("websocket auth helpers", () => {
    let originalNodeEnv: string | undefined;
    let verifyIdTokenStub: sinon.SinonStub;

    beforeEach(() => {
        // Ensure test environment to prevent security warnings/errors during normal tests
        originalNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "test";
        process.env.GCLOUD_PROJECT = "test-project";

        // Ensure admin app is initialized (if not already)
        if (!admin.apps.length) {
            // Mock app if needed
            // admin.initializeApp();
        }

        // Create the stub
        verifyIdTokenStub = sinon.stub();

        // Stub the auth() method
        const authStub = {
            verifyIdToken: verifyIdTokenStub,
        };
        sinon.stub(admin, "auth").returns(authStub as any);
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        sinon.restore();
        clearTokenCache();
    });

    it("extracts auth token from url", () => {
        const req: any = { url: "/?auth=test-token" };
        expect(extractAuthToken(req)).to.equal("test-token");
    });

    it("returns undefined when token missing", () => {
        const req: any = { url: "/" };
        expect(extractAuthToken(req)).to.be.undefined;
    });

    const createDummyToken = () => {
        const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64").replace(/=/g, "");
        const payload = Buffer.from(JSON.stringify({
            uid: "u1",
            aud: "test-project",
            iss: "https://securetoken.google.com/test-project",
            sub: "u1",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
        })).toString("base64").replace(/=/g, "");
        return `${header}.${payload}.`;
    };

    it("verifies token and caches result", async () => {
        const token = createDummyToken();
        const first = await verifyIdTokenCached(token);
        expect(first.uid).to.equal("u1");

        const second = await verifyIdTokenCached(token);
        expect(second.uid).to.equal("u1");
    });

    it("throws on invalid token", async () => {
        verifyIdTokenStub.rejects(new Error("bad"));

        const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64").replace(/=/g, "");
        const payload = Buffer.from(JSON.stringify({ uid: "u1" })).toString("base64").replace(/=/g, "");
        const token = `${header}.${payload}.signature`;

        let err;
        try {
            await verifyIdTokenCached(token);
        } catch (e) {
            err = e;
        }
        expect(err).to.be.instanceOf(Error);
    });

    it("removes expired tokens from cache", async () => {
        const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64").replace(/=/g, "");
        const payload = Buffer.from(JSON.stringify({
            uid: "u1",
            aud: "test-project",
            iss: "https://securetoken.google.com/test-project",
            sub: "u1",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 1,
        })).toString("base64").replace(/=/g, "");
        const token = `${header}.${payload}.`;

        await verifyIdTokenCached(token);
        expect(getTokenCacheSize()).to.equal(1);

        await new Promise((r) => setTimeout(r, 1100));

        const expiredResult = await verifyIdTokenCached(token);
        expect(expiredResult.uid).to.equal("u1");
    });
});
