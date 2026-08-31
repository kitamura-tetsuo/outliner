process.env.NODE_ENV = "test";

import { expect } from "chai";
import crypto from "crypto";
import express from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import sinon from "sinon";
import request from "supertest";
import * as Y from "yjs";
import { createMcpRouter } from "../../src/mcp/mcp-api.js";
import { OutlinerReadService } from "../../src/mcp/outliner-read-service.js";
import { OutlinerRelationService } from "../../src/mcp/relation-service.js";
import { resetOAuthSigningSecretForTests } from "../../src/oauth/config.js";
import { createOAuthRouter, verifyAccessToken } from "../../src/oauth/oauth-api.js";
import { clearOAuthInMemoryStoresForTests } from "../../src/oauth/store.js";
import type { OAuthClient } from "../../src/oauth/types.js";
import { Project } from "../../src/schema/app-schema.js";

/**
 * Issue #5257: a ChatGPT/MCP connector that only ever holds an
 * `outliner.read` grant must be able to discover, through the OAuth/MCP
 * contract itself, that a mutation tool needs a broader grant, complete a
 * fresh authorization for `outliner.read outliner.write`, and then have
 * mutation actually succeed. This drives that whole path through the real
 * OAuth router and the real MCP router (not fakes of either), wired
 * together the same way `signAccessToken`/`verifyAccessToken` connect them
 * in production.
 */
const REDIRECT_URI = "https://chatgpt.example.com/aip/oauth/callback";
const CLIENT_ID = "chatgpt-test-client";

class InMemoryClientStore {
    private clients = new Map<string, OAuthClient>();
    constructor(seed: OAuthClient[] = []) {
        for (const client of seed) this.clients.set(client.clientId, client);
    }
    async getClient(clientId: string) {
        return this.clients.get(clientId);
    }
    async registerClient(input: { redirectUris: string[]; clientName?: string; }) {
        const client: OAuthClient = {
            clientId: crypto.randomBytes(8).toString("hex"),
            redirectUris: input.redirectUris,
            clientName: input.clientName,
            tokenEndpointAuthMethod: "none",
        };
        this.clients.set(client.clientId, client);
        return client;
    }
}

class InMemoryRefreshTokenStore {
    private records = new Map<string, { uid: string; clientId: string; scope: string; revoked: boolean; }>();
    async issue(input: { uid: string; clientId: string; scope: string; }) {
        const token = crypto.randomBytes(24).toString("base64url");
        this.records.set(token, { ...input, revoked: false });
        return token;
    }
    async consumeAndRevoke(token: string) {
        const record = this.records.get(token);
        if (!record || record.revoked) return undefined;
        record.revoked = true;
        return { ...record, tokenHash: token, createdAt: 0, expiresAt: Number.MAX_SAFE_INTEGER, id: token };
    }
}

function makePkcePair() {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
}

function mcpFixture() {
    const project = Project.createInstance("StepUp");
    const tableId = "table-1";
    const entry = new Y.Map<unknown>();
    entry.set("name", "Tasks");
    entry.set("sqlName", "tasks");
    project.ydoc.getMap("yjsTables").set(tableId, entry);

    const table = new Y.Doc();
    table.getText("schema").insert(0, "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, done BOOLEAN)");
    const first = new Y.Map<string | boolean | null>();
    first.set("id", "r1");
    first.set("title", "First");
    first.set("done", false);
    table.getMap("data").set("r1", first);

    const rooms = new Map<string, Y.Doc>([
        ["projects/project-1", project.ydoc],
        ["projects/project-1/tables/table-1", table],
    ]);
    const hocuspocus = {
        openDirectConnection: async (room: string) => ({ document: rooms.get(room), disconnect: async () => {} }),
    } as never;
    const canAccess = async () => true;
    const accessibleProjects = async () => [{ projectId: "project-1", title: "StepUp" }];
    const readService = new OutlinerReadService(hocuspocus, canAccess, accessibleProjects);
    const relationService = new OutlinerRelationService(hocuspocus, canAccess);
    return { readService, relationService, table };
}

describe("oauth+mcp: read-only grant -> mutation challenge -> step-up -> mutation succeeds", () => {
    let verifyIdTokenCached: sinon.SinonStub;
    let oauthApp: express.Express;

    beforeEach(() => {
        delete process.env.OAUTH_ACCESS_TOKEN_SECRET;
        resetOAuthSigningSecretForTests();
        clearOAuthInMemoryStoresForTests();

        verifyIdTokenCached = sinon.stub();
        verifyIdTokenCached.withArgs("good-google-token").resolves({
            uid: "uid-google-1",
            firebase: { sign_in_provider: "google.com" },
        } as unknown as DecodedIdToken);

        const clientStore = new InMemoryClientStore([
            {
                clientId: CLIENT_ID,
                redirectUris: [REDIRECT_URI],
                clientName: "ChatGPT",
                tokenEndpointAuthMethod: "none",
            },
        ]);
        oauthApp = express();
        oauthApp.use(express.json());
        oauthApp.use(
            createOAuthRouter({ verifyIdTokenCached, clientStore, refreshTokenStore: new InMemoryRefreshTokenStore() }),
        );
    });

    afterEach(() => {
        clearOAuthInMemoryStoresForTests();
    });

    async function authorize(scope: string) {
        const { verifier, challenge } = makePkcePair();
        const authorizeRes = await request(oauthApp).get("/oauth/authorize").query({
            response_type: "code",
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            scope,
            code_challenge: challenge,
            code_challenge_method: "S256",
        });
        expect(authorizeRes.status).to.equal(200);
        const requestId = authorizeRes.text.match(/requestId: "([^"]+)"/)![1];

        const callbackRes = await request(oauthApp)
            .post("/oauth/authorize/callback")
            .send({ requestId, idToken: "good-google-token" });
        expect(callbackRes.status).to.equal(200);
        const code = new URL(callbackRes.body.redirectTo).searchParams.get("code")!;

        const tokenRes = await request(oauthApp).post("/oauth/token").send({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            code_verifier: verifier,
        });
        expect(tokenRes.status).to.equal(200);
        return tokenRes.body as { access_token: string; refresh_token: string; scope: string; };
    }

    const rpc = (method: string, params?: Record<string, unknown>, id = 1) => ({
        jsonrpc: "2.0",
        id,
        method,
        ...(params ? { params } : {}),
    });
    const bodyOf = (response: request.Response) => {
        if (response.body?.jsonrpc) return response.body;
        const data = response.text.split("\n").find(line => line.startsWith("data: "));
        return JSON.parse(data?.slice(6) ?? "{}");
    };
    const attemptMutation = (mcpApp: express.Express, accessToken: string) =>
        request(mcpApp).post("/mcp")
            .set("Authorization", `Bearer ${accessToken}`)
            .set("Accept", "application/json, text/event-stream")
            .send(rpc("tools/call", {
                name: "write_relation",
                arguments: {
                    projectId: "project-1",
                    relation: "tasks",
                    write: { op: "UPDATE", rowId: "r1", column: "done", value: true },
                },
            }));

    it("drives the full step-up authorization path end to end", async () => {
        const { readService, relationService, table } = mcpFixture();
        const mcpApp = express();
        mcpApp.use(express.json());
        mcpApp.use(createMcpRouter(readService, verifyAccessToken, "http://localhost:7093", relationService));

        // 1) A read-only grant can call mutation tools, but only ever gets rejected.
        const readOnly = await authorize("outliner.read");
        expect(readOnly.scope).to.equal("outliner.read");

        const rejected = await attemptMutation(mcpApp, readOnly.access_token);
        expect(rejected.status).to.equal(200);
        const rejectedResult = bodyOf(rejected).result;
        expect(rejectedResult.isError).to.equal(true);
        const rejectedPayload = JSON.parse(rejectedResult.content[0].text);
        expect(rejectedPayload.code).to.equal("forbidden");
        // AC-002: the rejection carries an OAuth insufficient_scope challenge
        // through MCP authentication metadata, not only a generic error.
        const challengeHeader = rejectedResult._meta?.["mcp/www_authenticate"] as string;
        expect(challengeHeader).to.match(/^Bearer /);
        expect(challengeHeader).to.include('error="insufficient_scope"');
        expect(challengeHeader).to.include('scope="outliner.write"');
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).get("done")).to.equal(false);

        // 2) Refreshing the read-only grant (even trying to smuggle a wider
        // scope into the request body) never upgrades it to write access.
        const refreshed = await request(oauthApp).post("/oauth/token").send({
            grant_type: "refresh_token",
            refresh_token: readOnly.refresh_token,
            client_id: CLIENT_ID,
            scope: "outliner.read outliner.write",
        });
        expect(refreshed.status).to.equal(200);
        expect(refreshed.body.scope).to.equal("outliner.read");
        const stillRejected = await attemptMutation(mcpApp, refreshed.body.access_token);
        expect(bodyOf(stillRejected).result.isError).to.equal(true);
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).get("done")).to.equal(false);

        // 3) A fresh authorization explicitly requesting both scopes issues a
        // token that can actually mutate.
        const readWrite = await authorize("outliner.read outliner.write");
        expect(readWrite.scope).to.equal("outliner.read outliner.write");

        const applied = await attemptMutation(mcpApp, readWrite.access_token);
        const appliedResult = bodyOf(applied).result;
        expect(appliedResult.isError).to.not.equal(true);
        const appliedPayload = JSON.parse(appliedResult.content[0].text);
        expect(appliedPayload.applied).to.equal(true);
        expect((table.getMap("data").get("r1") as Y.Map<unknown>).get("done")).to.equal(true);
    });
});
