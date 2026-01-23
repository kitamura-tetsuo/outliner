import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import OutlinerItemAttachments from "./OutlinerItemAttachments.svelte";

// Mock logger
vi.mock("../lib/logger", () => ({
    getLogger: () => ({
        debug: vi.fn(),
        error: vi.fn(),
    }),
}));

describe("OutlinerItemAttachments", () => {
    it("renders attachments as links with correct attributes", () => {
        const item = {
            attachments: {
                toArray: () => ["https://example.com/image.png"],
                observe: () => {},
                unobserve: () => {},
            },
        };

        render(OutlinerItemAttachments, {
            modelId: "test-id",
            item: item as any,
        });

        // Check if link exists with accessible name
        const link = screen.getByRole("link", { name: /View attachment: image.png/i });
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
        const item = {
            attachments: {
                toArray: () => ["data:image/png;base64,abcdef"],
                observe: () => {},
                unobserve: () => {},
            },
        };

        render(OutlinerItemAttachments, {
            modelId: "test-id",
            item: item as any,
        });

        const link = screen.getByRole("link", { name: /^View attachment$/i });
        expect(link).toBeInTheDocument();
    });
});
