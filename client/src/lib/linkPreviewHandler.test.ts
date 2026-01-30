import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupLinkPreviews, setupLinkPreviewHandlers } from "./linkPreviewHandler";

// Mock the store
vi.mock("../stores/store.svelte", () => ({
    store: {
        project: { title: "Test Project" },
        pages: {
            current: [
                { text: "Existing Page", items: [{ text: "Content Item 1" }, { text: "Content Item 2" }] },
                { text: "Empty Page", items: [] },
            ],
        },
    },
}));

// Mock logger
vi.mock("./logger", () => ({
    getLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
    }),
}));

describe("linkPreviewHandler", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        vi.useFakeTimers();
    });

    afterEach(() => {
        cleanupLinkPreviews();
        vi.useRealTimers();
    });

    it("shows preview for existing page with tooltip role", () => {
        // Create a link element
        const link = document.createElement("a");
        link.classList.add("internal-link");
        link.dataset.page = "Existing Page";
        document.body.appendChild(link);

        setupLinkPreviewHandlers();

        // Trigger mouse enter
        link.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

        // Fast forward timer (300ms delay in handler)
        vi.advanceTimersByTime(300);

        // Check if preview exists
        const preview = document.querySelector(".link-preview-popup");
        expect(preview).not.toBeNull();
        expect(preview?.textContent).toContain("Existing Page");
        expect(preview?.textContent).toContain("Content Item 1");
        expect(preview?.getAttribute("role")).toBe("tooltip");
    });

    it("shows English error message for non-existent page", () => {
        const link = document.createElement("a");
        link.classList.add("internal-link");
        link.dataset.page = "Non Existent Page";
        document.body.appendChild(link);

        setupLinkPreviewHandlers();

        link.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        vi.advanceTimersByTime(300);

        const preview = document.querySelector(".link-preview-popup");
        expect(preview).not.toBeNull();
        expect(preview?.textContent).toContain("Page not found");
        expect(preview?.getAttribute("role")).toBe("tooltip");
    });

    it("shows English error message for other project", () => {
        const link = document.createElement("a");
        link.classList.add("internal-link");
        link.dataset.page = "Some Page";
        link.dataset.project = "Other Project";
        document.body.appendChild(link);

        setupLinkPreviewHandlers();

        link.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        vi.advanceTimersByTime(300);

        const preview = document.querySelector(".link-preview-popup");
        expect(preview).not.toBeNull();
        expect(preview?.textContent).toContain("Cannot preview pages from other projects");
        expect(preview?.getAttribute("role")).toBe("tooltip");
    });

    it("shows English message for empty page", () => {
        const link = document.createElement("a");
        link.classList.add("internal-link");
        link.dataset.page = "Empty Page";
        document.body.appendChild(link);

        setupLinkPreviewHandlers();

        link.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        vi.advanceTimersByTime(300);

        const preview = document.querySelector(".link-preview-popup");
        expect(preview).not.toBeNull();
        expect(preview?.textContent).toContain("This page has no content");
        expect(preview?.getAttribute("role")).toBe("tooltip");
    });
});
