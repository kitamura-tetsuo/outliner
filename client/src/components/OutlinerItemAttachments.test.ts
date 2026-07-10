import { render, screen } from "@testing-library/svelte";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Item } from "../schema/app-schema";
import OutlinerItemAttachments from "./OutlinerItemAttachments.svelte";

// Mock logger
vi.mock("../lib/logger", () => ({
    getLogger: () => ({
        debug: vi.fn(),
        error: vi.fn(),
    }),
}));

// Mock global __E2E__ flag so data URLs are allowed
beforeAll(() => {
    // @ts-ignore
    globalThis.window = { __E2E__: true };
});

describe("OutlinerItemAttachments", () => {
    it("renders attachments as links with correct attributes", () => {
        const item = new Item({ id: "test-id" });
        item.addAttachment("https://example.com/image.png");

        render(OutlinerItemAttachments, {
            modelId: "test-id",
            item: item,
        });

        // Check if link exists with accessible name
        const link = screen.getByRole("link", { name: /View attachment/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute("href", "https://example.com/image.png");
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");

        // Check image is inside the link
        // Since alt="" removes role="img", we use querySelector
        const img = link.querySelector("img");
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute("src", "https://example.com/image.png");
        expect(img).toHaveAttribute("alt", ""); // Should be empty
    });

    it("renders generic label for data URLs", () => {
        const item = new Item({ id: "test-id" });
        item.addAttachment("data:image/png;base64,abcdef");

        render(OutlinerItemAttachments, {
            modelId: "test-id",
            item: item,
        });

        const link = screen.getByRole("link", { name: /^View attachment$/i });
        expect(link).toBeInTheDocument();
    });
});
