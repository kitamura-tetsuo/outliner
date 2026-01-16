import { HocuspocusProvider } from "@hocuspocus/provider";
import { Server } from "@hocuspocus/server";
import { jest } from "@jest/globals";
import { DecodedIdToken } from "firebase-admin/auth";
import * as Y from "yjs";

// Use jest.unstable_mockModule to mock ESM modules
jest.unstable_mockModule("../src/access-control", () => ({
    checkContainerAccess: jest.fn(),
}));
jest.unstable_mockModule("../src/websocket-auth", () => ({
    verifyIdTokenCached: jest.fn(),
    extractAuthToken: jest.fn(),
}));

// Import the modules *after* the mocks are defined
const { hocuspocus } = await import("../src/hocuspocus-server");
const accessControl = await import("../src/access-control");
const auth = await import("../src/websocket-auth");

const mockedAuth = auth as jest.Mocked<typeof auth>;
const mockedAccessControl = accessControl as jest.Mocked<typeof accessControl>;

// Create a valid mock DecodedIdToken
const mockDecodedIdToken: DecodedIdToken = {
    aud: "your-firebase-project-id",
    auth_time: 1620000000,
    exp: 1620003600,
    firebase: { identities: {}, sign_in_provider: "custom" },
    iat: 1620000000,
    iss: "https://securetoken.google.com/your-firebase-project-id",
    sub: "test-uid",
    uid: "test-uid",
};

describe("Hocuspocus Server", () => {
    let server: Server;
    let provider: HocuspocusProvider;

    jest.setTimeout(15000);

    beforeAll(async () => {
        await hocuspocus.listen(0);
        server = hocuspocus;
    });

    afterAll(async () => {
        await server.destroy();
    });

    afterEach(() => {
        provider?.destroy();
        jest.clearAllMocks();
    });

    const createClient = (token?: string) => {
        const port = (server.httpServer.address() as any).port;
        return new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}`,
            name: "projects/123",
            document: new Y.Doc(),
            token,
            maxAttempts: 1,
            connectTimeout: 2000,
        });
    };

    const expectDisconnect = (provider: HocuspocusProvider, expectedCode: number) => {
        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timed out waiting for disconnect code ${expectedCode}`));
            }, 10000);

            provider.on("disconnect", ({ code }: { code: number; }) => {
                clearTimeout(timeout);
                try {
                    expect(code).toBe(expectedCode);
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
    };

    it("should fail authentication with no token", async () => {
        provider = createClient();
        await expectDisconnect(provider, 4000);
    });

    it("should fail with invalid token", async () => {
        mockedAuth.verifyIdTokenCached.mockRejectedValue(new Error("Invalid token"));
        provider = createClient("bad-token");
        await expectDisconnect(provider, 4001);
    });

    it("should fail with no access", async () => {
        mockedAuth.verifyIdTokenCached.mockResolvedValue(mockDecodedIdToken);
        mockedAccessControl.checkContainerAccess.mockResolvedValue(false);
        provider = createClient("valid-token-no-access");
        await expectDisconnect(provider, 4001);
    });

    it("should load a document from the database", async () => {
        mockedAuth.verifyIdTokenCached.mockResolvedValue(mockDecodedIdToken);
        mockedAccessControl.checkContainerAccess.mockResolvedValue(true);

        const connection1 = await server.hocuspocus.openDirectConnection("projects/123");
        connection1.document!.getText("test").insert(0, "hello");

        const connection2 = await server.hocuspocus.openDirectConnection("projects/123");
        expect(connection2.document!.getText("test").toString()).toEqual("hello");
    });
});
