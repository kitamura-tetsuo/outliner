import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { Item } from "../schema/app-schema";
import OutlinerItemAttachments from "./OutlinerItemAttachments.svelte";

// Mock logger
vi.mock("../lib/logger", () => ({
    getLogger: () => ({
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    }),
}));

// Mock global __E2E__ flag so data URLs are allowed
beforeAll(() => {
    globalThis.window = { __E2E__: true } as Window & typeof globalThis & { __E2E__?: boolean; };
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

    it("renders non-image attachments as file chips", () => {
        const item = new Item({ id: "test-id" });
        item.addAttachment("https://example.com/document.pdf", "application/pdf", "document.pdf");

        const res = render(OutlinerItemAttachments, {
            modelId: "test-id",
            item: item,
        });

        const link = screen.getByRole("link", { name: "document.pdf" });
        expect(link).toBeInTheDocument();

        // Assert no img tag is rendered
        const img = link.querySelector("img");
        expect(img).not.toBeInTheDocument();

        // Assert file chip elements exist
        const fileNameSpan = link.querySelector(".file-name");
        expect(fileNameSpan).toBeInTheDocument();
        expect(fileNameSpan?.textContent).toBe("document.pdf");

        res.unmount();
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

    // An unreachable image (offline, blocked host, expired signed URL) must not
    // be reclassified as a generic file: the type is declared by the extension
    // or the mime type, so rendering stays independent of network availability.
    it("keeps rendering an <img> when an image URL fails to load", async () => {
        const item = new Item({ id: "test-id" });
        item.addAttachment("https://example.com/a.png");

        const { container } = render(OutlinerItemAttachments, {
            modelId: "test-id",
            item: item,
        });

        const img = container.querySelector("img");
        expect(img).toBeInTheDocument();

        await fireEvent.error(img!);
        await tick();

        expect(container.querySelectorAll("img").length).toBe(1);
        expect(container.querySelector(".attachment-file-chip")).not.toBeInTheDocument();
    });

    it("keeps rendering an <img> for a declared image mime type that fails to load", async () => {
        const item = new Item({ id: "test-id" });
        item.addAttachment("https://example.com/photo", "image/png", "photo");

        const { container } = render(OutlinerItemAttachments, {
            modelId: "test-id",
            item: item,
        });

        const img = container.querySelector("img");
        expect(img).toBeInTheDocument();

        await fireEvent.error(img!);
        await tick();

        expect(container.querySelectorAll("img").length).toBe(1);
    });

    // The optimistic guess for URLs without a mime type or a known extension is
    // still retracted when the browser reports it cannot decode the resource.
    it("falls back to a file chip when an untyped URL fails to load", async () => {
        const item = new Item({ id: "test-id" });
        item.addAttachment("https://example.com/download");

        const { container } = render(OutlinerItemAttachments, {
            modelId: "test-id",
            item: item,
        });

        const img = container.querySelector("img");
        expect(img).toBeInTheDocument();

        await fireEvent.error(img!);
        await tick();

        expect(container.querySelector("img")).not.toBeInTheDocument();
        expect(container.querySelector(".attachment-file-chip")).toBeInTheDocument();
    });

    it("reflects add and remove through the Yjs observer", async () => {
        const item = new Item({ id: "test-id" });

        const { container } = render(OutlinerItemAttachments, {
            modelId: "test-id",
            item: item,
        });

        expect(container.querySelectorAll("img").length).toBe(0);

        item.addAttachment("https://example.com/a.png");
        await tick();
        expect(container.querySelectorAll("img").length).toBe(1);

        item.addAttachment("https://example.com/b.png");
        await tick();
        expect(container.querySelectorAll("img").length).toBe(2);

        item.removeAttachment("https://example.com/a.png");
        await tick();
        expect(container.querySelectorAll("img").length).toBe(1);
        expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/b.png");

        item.removeAttachment("https://example.com/b.png");
        await tick();
        expect(container.querySelector(".attachments")).not.toBeInTheDocument();
    });

    // The mirror must follow the array actually stored on the item, even when
    // that array is created or replaced after the component mounted (a remote
    // client writing the "attachments" key does exactly this).
    it("rebinds when the attachments array is replaced on the item", async () => {
        const item = new Item({ id: "test-id" });

        const { container } = render(OutlinerItemAttachments, {
            modelId: "test-id",
            item: item,
        });

        const replacement = new Y.Array<string>();
        item.yMap.set("attachments", replacement as unknown as never);
        replacement.push(["https://example.com/replaced.png"]);

        await tick();
        expect(container.querySelectorAll("img").length).toBe(1);
        expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/replaced.png");

        replacement.delete(0, 1);
        await tick();
        expect(container.querySelectorAll("img").length).toBe(0);
    });
});
