import { describe, expect, it } from "@jest/globals";
import crypto from "crypto";
import { hashApiKey } from "../src/api-keys-api.js";

describe("API Keys Logic", () => {
    it("should correctly hash an API key using SHA-256", () => {
        const rawKey = "test-api-key-123456";
        const expectedHash = crypto.createHash("sha256").update(rawKey).digest("hex");

        const actualHash = hashApiKey(rawKey);

        expect(actualHash).toBe(expectedHash);
        expect(actualHash).toHaveLength(64); // SHA-256 hex string is 64 chars
    });

    it("should produce different hashes for different keys", () => {
        const key1 = crypto.randomBytes(32).toString("hex");
        const key2 = crypto.randomBytes(32).toString("hex");

        const hash1 = hashApiKey(key1);
        const hash2 = hashApiKey(key2);

        expect(hash1).not.toBe(hash2);
    });
});
