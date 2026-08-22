process.env.NODE_ENV = "test";

import { expect } from "chai";
import sinon from "sinon";
import {
    clearOAuthInMemoryStoresForTests,
    consumeAuthorizationCode,
    consumePendingAuthorizationRequest,
    createFirestoreRefreshTokenStore,
    createPendingAuthorizationRequest,
    issueAuthorizationCode,
} from "../../src/oauth/store.js";

function createMockFirestore() {
    const docs = new Map<string, Record<string, unknown>>();
    let nextId = 1;
    const collection = {
        add: sinon.stub().callsFake(async (data: Record<string, unknown>) => {
            const id = `doc-${nextId++}`;
            docs.set(id, data);
            return { id };
        }),
        doc: sinon.stub().callsFake((id: string) => ({
            update: sinon.stub().callsFake(async (patch: Record<string, unknown>) => {
                docs.set(id, { ...(docs.get(id) ?? {}), ...patch });
            }),
        })),
        where: sinon.stub().callsFake((field: string, _op: string, value: unknown) => ({
            limit: sinon.stub().returns({
                get: sinon.stub().callsFake(async () => {
                    const match = [...docs.entries()].find(([, data]) => data[field] === value);
                    if (!match) return { empty: true, docs: [] };
                    const [id, data] = match;
                    return { empty: false, docs: [{ id, data: () => data }] };
                }),
            }),
        })),
    };
    return { firestore: { collection: sinon.stub().returns(collection) } as any, docs };
}

describe("oauth/store: pending authorization requests and codes", () => {
    afterEach(() => {
        clearOAuthInMemoryStoresForTests();
    });

    it("consumes a pending authorization request exactly once", () => {
        const pending = createPendingAuthorizationRequest({
            clientId: "chatgpt",
            redirectUri: "https://chatgpt.com/callback",
            scope: "outliner.read",
            codeChallenge: "challenge",
            codeChallengeMethod: "S256",
        });

        const first = consumePendingAuthorizationRequest(pending.id);
        expect(first?.clientId).to.equal("chatgpt");

        const second = consumePendingAuthorizationRequest(pending.id);
        expect(second).to.be.undefined;
    });

    it("returns undefined for an unknown pending request id", () => {
        expect(consumePendingAuthorizationRequest("does-not-exist")).to.be.undefined;
    });

    it("issues a single-use authorization code", () => {
        const code = issueAuthorizationCode({
            clientId: "chatgpt",
            redirectUri: "https://chatgpt.com/callback",
            uid: "uid-1",
            scope: "outliner.read",
            codeChallenge: "challenge",
            codeChallengeMethod: "S256",
        });

        const first = consumeAuthorizationCode(code);
        expect(first?.uid).to.equal("uid-1");

        const second = consumeAuthorizationCode(code);
        expect(second, "a reused authorization code must not be redeemable twice").to.be.undefined;
    });

    it("expires an authorization code after its configured TTL", async () => {
        const originalTtl = process.env.OAUTH_AUTH_CODE_TTL_SECONDS;
        process.env.OAUTH_AUTH_CODE_TTL_SECONDS = "1";
        try {
            const code = issueAuthorizationCode({
                clientId: "chatgpt",
                redirectUri: "https://chatgpt.com/callback",
                uid: "uid-1",
                scope: "outliner.read",
                codeChallenge: "challenge",
                codeChallengeMethod: "S256",
            });
            await new Promise(resolve => setTimeout(resolve, 1100));
            expect(consumeAuthorizationCode(code)).to.be.undefined;
        } finally {
            process.env.OAUTH_AUTH_CODE_TTL_SECONDS = originalTtl;
        }
    });
});

describe("oauth/store: Firestore-backed refresh tokens", () => {
    it("issues a refresh token and can consume it exactly once (then it is gone)", async () => {
        const { firestore } = createMockFirestore();
        const store = createFirestoreRefreshTokenStore(firestore);

        const token = await store.issue({ uid: "uid-1", clientId: "chatgpt", scope: "outliner.read" });
        expect(token).to.be.a("string").with.length.greaterThan(0);

        const record = await store.consume(token);
        expect(record?.uid).to.equal("uid-1");
        expect(record?.clientId).to.equal("chatgpt");
    });

    it("never persists the raw refresh token, only its hash", async () => {
        const { firestore, docs } = createMockFirestore();
        const store = createFirestoreRefreshTokenStore(firestore);

        const token = await store.issue({ uid: "uid-1", clientId: "chatgpt", scope: "outliner.read" });
        const stored = [...docs.values()][0];
        expect(JSON.stringify(stored)).to.not.include(token);
        expect(stored).to.have.property("tokenHash");
    });

    it("rejects a revoked refresh token", async () => {
        const { firestore } = createMockFirestore();
        const store = createFirestoreRefreshTokenStore(firestore);

        const token = await store.issue({ uid: "uid-1", clientId: "chatgpt", scope: "outliner.read" });
        const record = await store.consume(token);
        await store.revoke(record!.id);

        expect(await store.consume(token)).to.be.undefined;
    });

    it("rejects an unknown refresh token", async () => {
        const { firestore } = createMockFirestore();
        const store = createFirestoreRefreshTokenStore(firestore);
        expect(await store.consume("never-issued-token")).to.be.undefined;
    });

    it("rejects an expired refresh token", async () => {
        const originalTtl = process.env.OAUTH_REFRESH_TOKEN_TTL_SECONDS;
        process.env.OAUTH_REFRESH_TOKEN_TTL_SECONDS = "1";
        try {
            const { firestore } = createMockFirestore();
            const store = createFirestoreRefreshTokenStore(firestore);
            const token = await store.issue({ uid: "uid-1", clientId: "chatgpt", scope: "outliner.read" });
            await new Promise(resolve => setTimeout(resolve, 1100));
            expect(await store.consume(token)).to.be.undefined;
        } finally {
            process.env.OAUTH_REFRESH_TOKEN_TTL_SECONDS = originalTtl;
        }
    });
});
