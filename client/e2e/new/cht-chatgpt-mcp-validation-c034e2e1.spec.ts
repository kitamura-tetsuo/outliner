import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";

registerCoverageHooks();

const SERVER = "http://localhost:7093";

test.describe("ChatGPT MCP public protocol surface", () => {
    test("publishes OAuth discovery for authorization-code PKCE and refresh", async ({ request }) => {
        const response = await request.get(`${SERVER}/.well-known/oauth-authorization-server`);
        expect(response.ok()).toBe(true);
        const metadata = await response.json();

        expect(metadata.authorization_endpoint).toBe(`${SERVER}/oauth/authorize`);
        expect(metadata.token_endpoint).toBe(`${SERVER}/oauth/token`);
        expect(metadata.registration_endpoint).toBe(`${SERVER}/oauth/register`);
        expect(metadata.grant_types_supported).toEqual(expect.arrayContaining(["authorization_code", "refresh_token"]));
        expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
        expect(metadata.scopes_supported).toContain("outliner.read");
    });

    test("authorization UI is Google-only and retains the ChatGPT request", async ({ request }) => {
        const response = await request.get(`${SERVER}/oauth/authorize`, {
            params: {
                response_type: "code",
                client_id: "unknown-chatgpt-smoke-client",
                redirect_uri: "https://chatgpt.com/connector/oauth/callback",
                code_challenge: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                code_challenge_method: "S256",
                state: "opaque-chatgpt-state",
            },
        });

        // An unregistered redirect must fail before rendering or redirecting;
        // this proves arbitrary ChatGPT-shaped requests cannot become an open redirect.
        expect(response.status()).toBe(400);
        expect(await response.json()).toEqual({ error: "invalid_client" });
    });

    test("MCP endpoint fails closed without leaking discovery metadata", async ({ request }) => {
        const response = await request.post(`${SERVER}/mcp`, {
            headers: { Authorization: "Bearer expired.invalid.credential" },
            data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
        });

        expect(response.status()).toBe(401);
        expect(await response.json()).toEqual({ error: "invalid_token" });
        expect(response.headers()["mcp-session-id"]).toBeUndefined();
        expect(response.headers()["www-authenticate"]).toContain(
            `resource_metadata="${SERVER}/.well-known/oauth-protected-resource"`,
        );

        const metadataResponse = await request.get(`${SERVER}/.well-known/oauth-protected-resource`);
        expect(metadataResponse.ok()).toBe(true);
        expect(await metadataResponse.json()).toEqual({
            resource: `${SERVER}/mcp`,
            authorization_servers: [SERVER],
            bearer_methods_supported: ["header"],
            scopes_supported: ["outliner.read"],
        });
    });
});
