import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLogger } from "../../lib/logger";
import { enqueueWrite, resetPgliteForTests } from "./pgliteService";

vi.mock("../../lib/logger", () => ({
    getLogger: vi.fn(() => ({
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    })),
}));

describe("pgliteService", () => {
    beforeEach(async () => {
        await resetPgliteForTests();
        vi.clearAllMocks();
    });

    it("does not log handled rejections and keeps queue alive", async () => {
        const logger = getLogger("pgliteService");

        // A failing write that the caller handles
        const failingWrite = enqueueWrite(async () => {
            throw new Error("expected failure");
        });

        await expect(failingWrite).rejects.toThrow("expected failure");

        // Should not log since caller handled it
        expect(logger.warn).not.toHaveBeenCalled();

        // Next write should still work
        const nextWrite = enqueueWrite(async () => "success");
        await expect(nextWrite).resolves.toBe("success");
    });
});
