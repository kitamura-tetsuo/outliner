process.env.NODE_ENV = "test";

import { expect } from "chai";
import crypto from "crypto";
import express from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import sinon from "sinon";
import request from "supertest";
import { resetOAuthSigningSecretForTests } from "../../src/oauth/config.js";
import { createOAuthRouter, verifyAccessToken } from "../../src/oauth/oauth-api.js";
import { clearOAuthInMemoryStoresForTests } from "../../src/oauth/store.js";
import type { OAuthClient } from "../../src/oauth/types.js";

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

function buildApp(verifyIdTokenCached: sinon.SinonStub) {
    const clientStore = new InMemoryClientStore([
        { clientId: CLIENT_ID, redirectUris: [REDIRECT_URI], clientName: "ChatGPT", tokenEndpointAuthMethod: "none" },
    ]);
    const refreshTokenStore = new InMemoryRefreshTokenStore();
    const app = express();
    app.use(express.json());
    app.use(createOAuthRouter({ verifyIdTokenCached, clientStore, refreshTokenStore }));
    return app;
}

describe("oauth: end-to-end authorization-code + PKCE flow", () => {
    let verifyIdTokenCached: sinon.SinonStub;
    let app: express.Express;

    beforeEach(() => {
        delete process.env.OAUTH_ACCESS_TOKEN_SECRET;
        resetOAuthSigningSecretForTests();
        clearOAuthInMemoryStoresForTests();

        verifyIdTokenCached = sinon.stub();
        verifyIdTokenCached.withArgs("good-google-token").resolves({
            uid: "uid-google-1",
            firebase: { sign_in_provider: "google.com" },
        } as unknown as DecodedIdToken);
        verifyIdTokenCached.withArgs("password-provider-token").resolves({
            uid: "uid-password-1",
            firebase: { sign_in_provider: "password" },
        } as unknown as DecodedIdToken);
        verifyIdTokenCached.withArgs("bad-token").rejects(new Error("auth/invalid-id-token"));

        app = buildApp(verifyIdTokenCached);
    });

    afterEach(() => {
        clearOAuthInMemoryStoresForTests();
    });

    it("exposes standards-compliant discovery metadata", async () => {
        const res = await request(app).get("/.well-known/oauth-authorization-server");
        expect(res.status).to.equal(200);
        expect(res.body.authorization_endpoint).to.match(/\/oauth\/authorize$/);
        expect(res.body.token_endpoint).to.match(/\/oauth\/token$/);
        expect(res.body.grant_types_supported).to.include.members(["authorization_code", "refresh_token"]);
        expect(res.body.code_challenge_methods_supported).to.deep.equal(["S256"]);
        expect(res.body.scopes_supported).to.include("outliner.read");

        const oidc = await request(app).get("/.well-known/openid-configuration");
        expect(oidc.status).to.equal(200);
        expect(oidc.body.issuer).to.equal(res.body.issuer);
    });

    it("dynamically registers a new OAuth client", async () => {
        const res = await request(app)
            .post("/oauth/register")
            .send({ redirect_uris: ["https://example.com/callback"], client_name: "Test Client" });
        expect(res.status).to.equal(201);
        expect(res.body.client_id).to.be.a("string");
        expect(res.body.token_endpoint_auth_method).to.equal("none");
    });

    // Redirect URI validation at registration time (HTTPS-only, or loopback
    // HTTP) is covered end-to-end against the real Firestore-backed client
    // store in oauth-clients.test.ts; this fake store focuses on protocol
    // behavior instead.

    it("rejects /oauth/authorize for an unknown client_id", async () => {
        const { challenge } = makePkcePair();
        const res = await request(app).get("/oauth/authorize").query({
            response_type: "code",
            client_id: "does-not-exist",
            redirect_uri: REDIRECT_URI,
            code_challenge: challenge,
            code_challenge_method: "S256",
        });
        expect(res.status).to.equal(400);
        expect(res.body.error).to.equal("invalid_client");
    });

    it("rejects /oauth/authorize when redirect_uri was not registered for the client", async () => {
        const { challenge } = makePkcePair();
        const res = await request(app).get("/oauth/authorize").query({
            response_type: "code",
            client_id: CLIENT_ID,
            redirect_uri: "https://attacker.example.com/callback",
            code_challenge: challenge,
            code_challenge_method: "S256",
        });
        expect(res.status).to.equal(400);
        expect(res.body.error).to.equal("invalid_redirect_uri");
    });

    it("serves an authorize page that only offers Google sign-in (no email/password option)", async () => {
        const { challenge } = makePkcePair();
        const res = await request(app).get("/oauth/authorize").query({
            response_type: "code",
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            code_challenge: challenge,
            code_challenge_method: "S256",
        });
        expect(res.status).to.equal(200);
        expect(res.text).to.include("Sign in with Google");
        expect(res.text).to.include("GoogleAuthProvider");
        expect(res.text.toLowerCase()).to.not.include("password");
        expect(res.text).to.not.include('type="password"');
    });

    it("sets a Content-Security-Policy that permits the Google sign-in script to actually run", async () => {
        // helmet() (applied globally when the router is mounted via
        // startServer) defaults to script-src 'self', which would silently
        // block both the inline sign-in script and its gstatic.com imports.
        // The route must override the header with one that allows them.
        const { challenge } = makePkcePair();
        const res = await request(app).get("/oauth/authorize").query({
            response_type: "code",
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            code_challenge: challenge,
            code_challenge_method: "S256",
        });
        expect(res.status).to.equal(200);
        const csp = res.headers["content-security-policy"];
        expect(csp, "expected the authorize response to set a Content-Security-Policy header").to.be.a("string");
        expect(csp).to.include("https://www.gstatic.com");
        expect(csp).to.match(/script-src[^;]*'nonce-[A-Za-z0-9+/=]+'/);

        const nonceMatch = csp.match(/'nonce-([A-Za-z0-9+/=]+)'/);
        expect(nonceMatch, "expected a nonce in the CSP header").to.not.be.null;
        expect(res.text).to.include(`nonce="${nonceMatch![1]}"`);
    });

    it("keeps the Google sign-in popup connected to the authorize page", async () => {
        const { challenge } = makePkcePair();
        const res = await request(app).get("/oauth/authorize").query({
            response_type: "code",
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            code_challenge: challenge,
            code_challenge_method: "S256",
        });

        expect(res.status).to.equal(200);
        expect(res.headers["cross-origin-opener-policy"]).to.equal("same-origin-allow-popups");
    });

    async function startAuthorization(state = "csrf-state-abc") {
        const { verifier, challenge } = makePkcePair();
        const authorizeRes = await request(app).get("/oauth/authorize").query({
            response_type: "code",
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            state,
            code_challenge: challenge,
            code_challenge_method: "S256",
        });
        expect(authorizeRes.status).to.equal(200);
        const match = authorizeRes.text.match(/requestId: "([^"]+)"/);
        expect(match, "expected the authorize page to embed a requestId").to.not.be.null;
        return { requestId: match![1], verifier, state };
    }

    it("runs the full Google/Firebase identity -> authorization code -> token exchange flow", async () => {
        const { requestId, verifier, state } = await startAuthorization();

        const callbackRes = await request(app)
            .post("/oauth/authorize/callback")
            .send({ requestId, idToken: "good-google-token" });
        expect(callbackRes.status).to.equal(200);
        const redirectTo = new URL(callbackRes.body.redirectTo);
        expect(redirectTo.origin + redirectTo.pathname).to.equal(REDIRECT_URI);
        expect(redirectTo.searchParams.get("state")).to.equal(state);
        const code = redirectTo.searchParams.get("code");
        expect(code).to.be.a("string");

        const tokenRes = await request(app).post("/oauth/token").send({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            code_verifier: verifier,
        });
        expect(tokenRes.status).to.equal(200);
        expect(tokenRes.body.token_type).to.equal("Bearer");
        expect(tokenRes.body.scope).to.equal("outliner.read");
        expect(tokenRes.body.refresh_token).to.be.a("string");

        const verified = verifyAccessToken(tokenRes.body.access_token);
        expect(verified.uid).to.equal("uid-google-1");
        expect(verified.clientId).to.equal(CLIENT_ID);
        expect(verified.scope).to.equal("outliner.read");
    });

    it("fails closed when Firebase ID token verification fails", async () => {
        const { requestId } = await startAuthorization();
        const res = await request(app).post("/oauth/authorize/callback").send({ requestId, idToken: "bad-token" });
        expect(res.status).to.equal(401);
        expect(res.body.error).to.equal("access_denied");
    });

    it("rejects an identity that signed in with email/password instead of Google", async () => {
        const { requestId } = await startAuthorization();
        const res = await request(app)
            .post("/oauth/authorize/callback")
            .send({ requestId, idToken: "password-provider-token" });
        expect(res.status).to.equal(403);
        expect(res.body.error).to.equal("access_denied");
    });

    it("rejects a reused (already redeemed) authorization request id", async () => {
        const { requestId } = await startAuthorization();
        const first = await request(app).post("/oauth/authorize/callback").send({
            requestId,
            idToken: "good-google-token",
        });
        expect(first.status).to.equal(200);

        const second = await request(app).post("/oauth/authorize/callback").send({
            requestId,
            idToken: "good-google-token",
        });
        expect(second.status).to.equal(400);
        expect(second.body.error).to.equal("invalid_request");
    });

    it("rejects an invalid/unknown authorization code at the token endpoint", async () => {
        const { verifier } = makePkcePair();
        const res = await request(app).post("/oauth/token").send({
            grant_type: "authorization_code",
            code: "not-a-real-code",
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            code_verifier: verifier,
        });
        expect(res.status).to.equal(400);
        expect(res.body.error).to.equal("invalid_grant");
    });

    it("rejects a reused authorization code", async () => {
        const { requestId, verifier } = await startAuthorization();
        const callbackRes = await request(app)
            .post("/oauth/authorize/callback")
            .send({ requestId, idToken: "good-google-token" });
        const code = new URL(callbackRes.body.redirectTo).searchParams.get("code")!;

        const exchangePayload = {
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            code_verifier: verifier,
        };
        const first = await request(app).post("/oauth/token").send(exchangePayload);
        expect(first.status).to.equal(200);

        const second = await request(app).post("/oauth/token").send(exchangePayload);
        expect(second.status).to.equal(400);
        expect(second.body.error).to.equal("invalid_grant");
    });

    it("rejects a redirect_uri/client_id mismatch at the token endpoint", async () => {
        const { requestId, verifier } = await startAuthorization();
        const callbackRes = await request(app)
            .post("/oauth/authorize/callback")
            .send({ requestId, idToken: "good-google-token" });
        const code = new URL(callbackRes.body.redirectTo).searchParams.get("code")!;

        const res = await request(app).post("/oauth/token").send({
            grant_type: "authorization_code",
            code,
            redirect_uri: "https://attacker.example.com/callback",
            client_id: CLIENT_ID,
            code_verifier: verifier,
        });
        expect(res.status).to.equal(400);
        expect(res.body.error).to.equal("invalid_grant");
    });

    it("rejects a mismatched PKCE code_verifier", async () => {
        const { requestId } = await startAuthorization();
        const callbackRes = await request(app)
            .post("/oauth/authorize/callback")
            .send({ requestId, idToken: "good-google-token" });
        const code = new URL(callbackRes.body.redirectTo).searchParams.get("code")!;

        const res = await request(app).post("/oauth/token").send({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            code_verifier: "wrong-verifier-wrong-verifier-wrong-verifier",
        });
        expect(res.status).to.equal(400);
        expect(res.body.error).to.equal("invalid_grant");
    });

    it("supports the refresh_token grant and rotates the refresh token", async () => {
        const { requestId, verifier } = await startAuthorization();
        const callbackRes = await request(app)
            .post("/oauth/authorize/callback")
            .send({ requestId, idToken: "good-google-token" });
        const code = new URL(callbackRes.body.redirectTo).searchParams.get("code")!;

        const tokenRes = await request(app).post("/oauth/token").send({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            code_verifier: verifier,
        });
        const originalRefreshToken = tokenRes.body.refresh_token as string;

        const refreshRes = await request(app).post("/oauth/token").send({
            grant_type: "refresh_token",
            refresh_token: originalRefreshToken,
            client_id: CLIENT_ID,
        });
        expect(refreshRes.status).to.equal(200);
        expect(refreshRes.body.access_token).to.be.a("string");
        expect(refreshRes.body.refresh_token).to.be.a("string");
        expect(refreshRes.body.refresh_token).to.not.equal(originalRefreshToken);

        const verified = verifyAccessToken(refreshRes.body.access_token);
        expect(verified.uid).to.equal("uid-google-1");

        // Rotation: the original refresh token must no longer work.
        const reuseRes = await request(app).post("/oauth/token").send({
            grant_type: "refresh_token",
            refresh_token: originalRefreshToken,
            client_id: CLIENT_ID,
        });
        expect(reuseRes.status).to.equal(400);
        expect(reuseRes.body.error).to.equal("invalid_grant");
    });

    it("rejects an invalid/unknown refresh token", async () => {
        const res = await request(app).post("/oauth/token").send({
            grant_type: "refresh_token",
            refresh_token: "never-issued",
            client_id: CLIENT_ID,
        });
        expect(res.status).to.equal(400);
        expect(res.body.error).to.equal("invalid_grant");
    });

    it("revokes a refresh token via /oauth/revoke so it can no longer be used", async () => {
        const { requestId, verifier } = await startAuthorization();
        const callbackRes = await request(app)
            .post("/oauth/authorize/callback")
            .send({ requestId, idToken: "good-google-token" });
        const code = new URL(callbackRes.body.redirectTo).searchParams.get("code")!;
        const tokenRes = await request(app).post("/oauth/token").send({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            code_verifier: verifier,
        });
        const refreshToken = tokenRes.body.refresh_token as string;

        const revokeRes = await request(app).post("/oauth/revoke").send({ token: refreshToken });
        expect(revokeRes.status).to.equal(200);

        const reuseRes = await request(app).post("/oauth/token").send({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: CLIENT_ID,
        });
        expect(reuseRes.status).to.equal(400);
        expect(reuseRes.body.error).to.equal("invalid_grant");
    });

    it("accepts an RFC 7009 application/x-www-form-urlencoded revocation request", async () => {
        const { requestId, verifier } = await startAuthorization();
        const callbackRes = await request(app)
            .post("/oauth/authorize/callback")
            .send({ requestId, idToken: "good-google-token" });
        const code = new URL(callbackRes.body.redirectTo).searchParams.get("code")!;
        const tokenRes = await request(app).post("/oauth/token").send({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            client_id: CLIENT_ID,
            code_verifier: verifier,
        });
        const refreshToken = tokenRes.body.refresh_token as string;

        const revokeRes = await request(app)
            .post("/oauth/revoke")
            .type("form")
            .send(`token=${encodeURIComponent(refreshToken)}`);
        expect(revokeRes.status).to.equal(200);

        const reuseRes = await request(app).post("/oauth/token").send({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: CLIENT_ID,
        });
        expect(reuseRes.status).to.equal(400);
        expect(reuseRes.body.error).to.equal("invalid_grant");
    });

    it("rejects an expired or otherwise invalid access token when verified as a resource server would", async () => {
        expect(() => verifyAccessToken("not-a-jwt-at-all")).to.throw();
    });
});
