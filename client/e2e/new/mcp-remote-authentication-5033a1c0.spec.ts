import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();

const MCP_URL = "http://localhost:7093/mcp";
const initialize = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "outliner-playwright", version: "1.0.0" },
    },
};

test.describe("read-only remote MCP authentication", () => {
    test("fails closed when the bearer credential is absent", async ({ request }) => {
        const response = await request.post(MCP_URL, { data: initialize });

        expect(response.status()).toBe(401);
        expect(await response.json()).toEqual({ error: "unauthenticated" });
    });

    test("does not expose protocol or project metadata for an invalid token", async ({ request }) => {
        const response = await request.post(MCP_URL, {
            headers: { Authorization: "Bearer malformed-or-expired-token" },
            data: initialize,
        });

        expect(response.status()).toBe(401);
        expect(await response.json()).toEqual({ error: "invalid_token" });
        expect(response.headers()["mcp-session-id"]).toBeUndefined();
    });

    test("rejects non-Bearer authorization schemes as unauthenticated", async ({ request }) => {
        const response = await request.post(MCP_URL, {
            headers: { Authorization: "Basic dXNlcjpwYXNzd29yZA==" },
            data: initialize,
        });

        expect(response.status()).toBe(401);
        expect(await response.json()).toEqual({ error: "unauthenticated" });
    });

    test("does not treat a Firebase ID token as an Outliner MCP access token", async ({ request }) => {
        const signIn = await request.post(
            "http://localhost:59099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key",
            { data: { email: "test@example.com", password: "password", returnSecureToken: true } },
        );
        expect(signIn.ok()).toBe(true);
        const { idToken } = await signIn.json();

        const response = await request.post(MCP_URL, {
            headers: { Authorization: `Bearer ${idToken}` },
            data: initialize,
        });
        expect(response.status()).toBe(401);
        expect(await response.json()).toEqual({ error: "invalid_token" });
    });
});
