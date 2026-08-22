process.env.NODE_ENV = "test";

import { expect } from "chai";
import sinon from "sinon";
import { createFirestoreClientStore, isValidRedirectUri } from "../../src/oauth/clients.js";

function createMockFirestore() {
    const docs = new Map<string, Record<string, unknown>>();
    const docRef = (id: string) => ({
        get: sinon.stub().callsFake(async () => ({
            exists: docs.has(id),
            data: () => docs.get(id),
        })),
        set: sinon.stub().callsFake(async (data: Record<string, unknown>) => {
            docs.set(id, data);
        }),
    });
    const collection = {
        doc: sinon.stub().callsFake((id: string) => docRef(id)),
    };
    return {
        firestore: { collection: sinon.stub().returns(collection) } as any,
        docs,
    };
}

describe("oauth/clients", () => {
    it("accepts https redirect URIs", () => {
        expect(isValidRedirectUri("https://chatgpt.com/aip/callback")).to.be.true;
    });

    it("accepts http redirect URIs pointed at loopback addresses only", () => {
        expect(isValidRedirectUri("http://localhost:33418/callback")).to.be.true;
        expect(isValidRedirectUri("http://127.0.0.1:33418/callback")).to.be.true;
        expect(isValidRedirectUri("http://example.com/callback")).to.be.false;
    });

    it("rejects malformed or non-http(s) redirect URIs", () => {
        expect(isValidRedirectUri("not-a-url")).to.be.false;
        expect(isValidRedirectUri("javascript:alert(1)")).to.be.false;
    });

    it("dynamically registers a client and can look it up again", async () => {
        const { firestore } = createMockFirestore();
        const store = createFirestoreClientStore(firestore);

        const client = await store.registerClient({
            redirectUris: ["https://chatgpt.com/aip/callback"],
            clientName: "ChatGPT",
        });

        expect(client.clientId).to.be.a("string").with.length.greaterThan(0);
        expect(client.tokenEndpointAuthMethod).to.equal("none");

        const found = await store.getClient(client.clientId);
        expect(found?.redirectUris).to.deep.equal(["https://chatgpt.com/aip/callback"]);
        expect(found?.clientName).to.equal("ChatGPT");
    });

    it("rejects registration when any redirect URI is not allowed", async () => {
        const { firestore } = createMockFirestore();
        const store = createFirestoreClientStore(firestore);

        let error: unknown;
        try {
            await store.registerClient({ redirectUris: ["http://not-localhost.example.com/callback"] });
        } catch (e) {
            error = e;
        }
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.equal("invalid_redirect_uri");
    });

    it("returns undefined for an unknown client_id", async () => {
        const { firestore } = createMockFirestore();
        const store = createFirestoreClientStore(firestore);

        const found = await store.getClient("does-not-exist");
        expect(found).to.be.undefined;
    });

    it("resolves statically pre-configured clients from OAUTH_STATIC_CLIENTS without touching Firestore", async () => {
        const originalEnv = process.env.OAUTH_STATIC_CLIENTS;
        process.env.OAUTH_STATIC_CLIENTS = JSON.stringify([
            {
                client_id: "static-client",
                redirect_uris: ["https://static.example.com/callback"],
                client_name: "Static",
            },
        ]);
        try {
            const { firestore } = createMockFirestore();
            const store = createFirestoreClientStore(firestore);
            const found = await store.getClient("static-client");
            expect(found?.redirectUris).to.deep.equal(["https://static.example.com/callback"]);
            expect((firestore.collection as sinon.SinonStub).called).to.be.false;
        } finally {
            process.env.OAUTH_STATIC_CLIENTS = originalEnv;
        }
    });
});
