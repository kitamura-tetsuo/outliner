import { describe, expect, it } from "vitest";
import { deleteAttachment, listAttachments, uploadAttachment } from "../services/attachmentService";

describe("attachmentService", () => {
    it("throws without auth token", async () => {
        await expect(uploadAttachment("containerId", "id", new File([], "a.txt"))).rejects.toThrow();
    });

    it("listAttachments requires auth", async () => {
        await expect(listAttachments("containerId", "id")).rejects.toThrow();
    });

    it("deleteAttachment requires auth", async () => {
        await expect(deleteAttachment("containerId", "id", "file.txt")).rejects.toThrow();
    });
});
