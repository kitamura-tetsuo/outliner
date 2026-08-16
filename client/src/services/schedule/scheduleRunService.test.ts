import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { runScheduleRuleNow } from "./scheduleRunService";
import { userManager } from "../../auth/UserManager";
import * as yjsApiUrl from "../../lib/yjsApiUrl";

vi.mock("../../auth/UserManager", () => ({
    userManager: {
        getCurrentUser: vi.fn(),
        auth: { currentUser: null }
    }
}));

vi.mock("../../lib/yjsApiUrl", () => ({
    resolveApiBaseUrl: vi.fn()
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("runScheduleRuleNow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns error if not authenticated", async () => {
        (userManager.getCurrentUser as Mock).mockReturnValue(null);
        const res = await runScheduleRuleNow("proj1", "rule1");
        expect(res).toEqual({ ok: false, error: "Not authenticated" });
    });

    it("resolves URL and calls fetch correctly", async () => {
        (userManager.getCurrentUser as Mock).mockReturnValue({ id: "1" });
        Object.defineProperty(userManager.auth, "currentUser", {
            value: { getIdToken: vi.fn().mockResolvedValue("token123") },
            configurable: true
        });
        (yjsApiUrl.resolveApiBaseUrl as Mock).mockReturnValue("http://localhost:7093/");

        mockFetch.mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ ok: true })
        });

        const res = await runScheduleRuleNow("proj1", "rule1");
        expect(res).toEqual({ ok: true, error: undefined });
        expect(mockFetch).toHaveBeenCalledWith("http://localhost:7093/api/schedules/run-now", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer token123"
            },
            body: JSON.stringify({ projectId: "proj1", ruleId: "rule1" })
        });
    });

    it("returns error on network failure", async () => {
        (userManager.getCurrentUser as Mock).mockReturnValue({ id: "1" });
        Object.defineProperty(userManager.auth, "currentUser", {
            value: { getIdToken: vi.fn().mockResolvedValue("token123") },
            configurable: true
        });
        (yjsApiUrl.resolveApiBaseUrl as Mock).mockReturnValue("http://localhost:7093");

        mockFetch.mockRejectedValue(new Error("Network Error"));

        const res = await runScheduleRuleNow("proj1", "rule1");
        expect(res).toEqual({ ok: false, error: "Network Error" });
    });

    it("returns error from response json", async () => {
        (userManager.getCurrentUser as Mock).mockReturnValue({ id: "1" });
        Object.defineProperty(userManager.auth, "currentUser", {
            value: { getIdToken: vi.fn().mockResolvedValue("token123") },
            configurable: true
        });
        (yjsApiUrl.resolveApiBaseUrl as Mock).mockReturnValue("http://localhost:7093");

        mockFetch.mockResolvedValue({
            ok: false,
            statusText: "Not Found",
            json: vi.fn().mockResolvedValue({ error: "Rule not found" })
        });

        const res = await runScheduleRuleNow("proj1", "rule1");
        expect(res).toEqual({ ok: false, error: "Rule not found" });
    });
});
