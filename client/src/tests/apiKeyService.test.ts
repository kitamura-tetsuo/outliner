import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { listApiKeys, createApiKey, revokeApiKey } from "../services/apiKeyService";

vi.mock("../auth/UserManager", () => ({
    userManager: {
        auth: {
            currentUser: {
                getIdToken: vi.fn().mockResolvedValue("test-token"),
            }
        }
    }
}));

describe("apiKeyService", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("should list API keys", async () => {
        const mockKeys = [{ id: "1", description: "Test", createdAt: 123 }];
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockKeys),
        } as any);

        const result = await listApiKeys();
        expect(result).toEqual(mockKeys);
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api-keys"), expect.anything());
    });

    it("should create API key", async () => {
        const mockResponse = { id: "1", apiKey: "secret", description: "Test", createdAt: 123 };
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockResponse),
        } as any);

        const result = await createApiKey("Test");
        expect(result).toEqual(mockResponse);
    });

    it("should revoke API key", async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ success: true }),
        } as any);

        await revokeApiKey("1");
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api-keys/1"), expect.objectContaining({ method: "DELETE" }));
    });
});
