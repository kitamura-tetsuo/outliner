process.env.NODE_ENV = "test";

import { expect } from "chai";
import jwt from "jsonwebtoken";
import { resetOAuthSigningSecretForTests } from "../../src/oauth/config.js";
import { signAccessToken, verifyAccessToken } from "../../src/oauth/tokens.js";

describe("oauth/tokens", () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };
        delete process.env.OAUTH_ACCESS_TOKEN_SECRET;
        delete process.env.OAUTH_ISSUER;
        resetOAuthSigningSecretForTests();
    });

    afterEach(() => {
        process.env = originalEnv;
        resetOAuthSigningSecretForTests();
    });

    it("signs an access token whose subject/scope/client_id round-trip through verifyAccessToken", () => {
        const { token, expiresIn } = signAccessToken({ uid: "uid-123", scope: "outliner.read", clientId: "chatgpt" });
        expect(expiresIn).to.equal(3600);

        const verified = verifyAccessToken(token);
        expect(verified.uid).to.equal("uid-123");
        expect(verified.scope).to.equal("outliner.read");
        expect(verified.clientId).to.equal("chatgpt");
    });

    it("never embeds Firebase credentials or a raw Firebase ID token in the access token", () => {
        const { token } = signAccessToken({ uid: "uid-123", scope: "outliner.read", clientId: "chatgpt" });
        const decoded = jwt.decode(token) as Record<string, unknown>;
        expect(decoded).to.not.have.property("firebase");
        expect(decoded).to.not.have.property("id_token");
        expect(decoded).to.not.have.property("private_key");
    });

    it("rejects an expired access token", async () => {
        const { token } = signAccessToken({
            uid: "uid-123",
            scope: "outliner.read",
            clientId: "chatgpt",
            ttlSeconds: 1,
        });
        await new Promise(resolve => setTimeout(resolve, 1100));
        expect(() => verifyAccessToken(token)).to.throw();
    });

    it("rejects a tampered access token", () => {
        const { token } = signAccessToken({ uid: "uid-123", scope: "outliner.read", clientId: "chatgpt" });
        const tampered = token.slice(0, -2) + (token.slice(-2) === "aa" ? "bb" : "aa");
        expect(() => verifyAccessToken(tampered)).to.throw();
    });

    it("rejects a token signed with a different secret", () => {
        const rogueToken = jwt.sign({ scope: "outliner.read", client_id: "chatgpt" }, "a-different-secret", {
            subject: "uid-123",
            issuer: "http://localhost:7093",
            audience: "http://localhost:7093",
            expiresIn: 3600,
        });
        expect(() => verifyAccessToken(rogueToken)).to.throw();
    });

    it("throws in production when OAUTH_ACCESS_TOKEN_SECRET is not configured", () => {
        process.env.NODE_ENV = "production";
        expect(() => signAccessToken({ uid: "uid-123", scope: "outliner.read", clientId: "chatgpt" })).to.throw(
            /SECURITY CRITICAL/,
        );
    });
});
