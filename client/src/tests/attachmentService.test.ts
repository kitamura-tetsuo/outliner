import { beforeEach, describe, expect, it, vi } from "vitest";
import { userManager } from "../auth/UserManager";
import { deleteAttachment, listAttachments, uploadAttachment } from "../services/attachmentService";

describe("attachmentService", () => {
    beforeEach(() => {
        // Reset any mocks before each test
        vi.clearAllMocks();
    });

    it("throws without auth token", async () => {
        // Mock UserManager to return no current user (no auth token available)
        vi.spyOn(userManager.auth, "currentUser", "get").mockReturnValue(null);
        await expect(uploadAttachment("containerId", "id", new File([], "a.txt"))).rejects.toThrow();
    });

    it("listAttachments requires auth", async () => {
        // Mock UserManager to return no current user (no auth token available)
        vi.spyOn(userManager.auth, "currentUser", "get").mockReturnValue(null);
        await expect(listAttachments("containerId", "id")).rejects.toThrow();
    });

    it("deleteAttachment requires auth", async () => {
        // Mock UserManager to return no current user (no auth token available)
        vi.spyOn(userManager.auth, "currentUser", "get").mockReturnValue(null);
        await expect(deleteAttachment("containerId", "id", "file.txt")).rejects.toThrow();
    });
});
