process.env.NODE_ENV = "test";

import { expect } from "chai";
import { getOAuthIssuer } from "../../src/oauth/config.js";

describe("oauth/config: getOAuthIssuer", () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("falls back to http://localhost:<port> in development/test", () => {
        delete process.env.OAUTH_ISSUER;
        process.env.PORT = "7093";
        expect(getOAuthIssuer()).to.equal("http://localhost:7093");
    });

    it("uses the configured OAUTH_ISSUER (with trailing slashes trimmed) when set", () => {
        process.env.OAUTH_ISSUER = "https://outliner.example.com/";
        expect(getOAuthIssuer()).to.equal("https://outliner.example.com");
    });

    it("fails closed in production when OAUTH_ISSUER is not configured, instead of silently publishing localhost", () => {
        process.env.NODE_ENV = "production";
        delete process.env.OAUTH_ISSUER;
        expect(() => getOAuthIssuer()).to.throw(/SECURITY CRITICAL/);
    });

    it("uses the configured OAUTH_ISSUER in production when set", () => {
        process.env.NODE_ENV = "production";
        process.env.OAUTH_ISSUER = "https://outliner.example.com";
        expect(getOAuthIssuer()).to.equal("https://outliner.example.com");
    });
});
