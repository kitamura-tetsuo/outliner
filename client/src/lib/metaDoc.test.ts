import { beforeEach, describe, expect, it } from "vitest";
import {
    containersMap,
    getContainerTitleFromMetaDoc,
    getLastOpenedAt,
    setContainerTitleInMetaDoc,
    updateLastOpenedAt,
} from "./metaDoc.svelte";

describe("metaDoc", () => {
    beforeEach(() => {
        // Clear the containers map before each test
        containersMap.clear();
    });

    describe("getContainerTitleFromMetaDoc", () => {
        it("returns empty string for non-existent container", () => {
            const title = getContainerTitleFromMetaDoc("non-existent-id");
            expect(title).toBe("");
        });

        it("returns title for existing container", () => {
            setContainerTitleInMetaDoc("container-1", "Test Container");
            const title = getContainerTitleFromMetaDoc("container-1");
            expect(title).toBe("Test Container");
        });

        it("returns empty string when title is empty", () => {
            setContainerTitleInMetaDoc("container-2", "");
            const title = getContainerTitleFromMetaDoc("container-2");
            expect(title).toBe("");
        });
    });

    describe("setContainerTitleInMetaDoc", () => {
        it("stores title for container", () => {
            setContainerTitleInMetaDoc("container-3", "My Container");
            const title = getContainerTitleFromMetaDoc("container-3");
            expect(title).toBe("My Container");
        });

        it("overwrites existing title", () => {
            setContainerTitleInMetaDoc("container-4", "First Title");
            setContainerTitleInMetaDoc("container-4", "Second Title");
            const title = getContainerTitleFromMetaDoc("container-4");
            expect(title).toBe("Second Title");
        });

        it("handles special characters in title", () => {
            setContainerTitleInMetaDoc("container-5", "Test [Bold] /Italic/");
            const title = getContainerTitleFromMetaDoc("container-5");
            expect(title).toBe("Test [Bold] /Italic/");
        });
    });

    describe("updateLastOpenedAt", () => {
        it("updates lastOpenedAt timestamp", () => {
            const containerId = "container-6";
            setContainerTitleInMetaDoc(containerId, "Test");
            const beforeUpdate = Date.now();
            updateLastOpenedAt(containerId);
            const afterUpdate = Date.now();

            const lastOpened = getLastOpenedAt(containerId);
            expect(lastOpened).toBeDefined();
            expect(lastOpened).toBeGreaterThanOrEqual(beforeUpdate);
            expect(lastOpened).toBeLessThanOrEqual(afterUpdate);
        });

        it("creates metadata if container doesn't exist", () => {
            updateLastOpenedAt("container-7");
            const lastOpened = getLastOpenedAt("container-7");
            expect(lastOpened).toBeDefined();
        });

        it("preserves title when updating lastOpenedAt", () => {
            const containerId = "container-8";
            setContainerTitleInMetaDoc(containerId, "Original Title");
            updateLastOpenedAt(containerId);

            const title = getContainerTitleFromMetaDoc(containerId);
            const lastOpened = getLastOpenedAt(containerId);

            expect(title).toBe("Original Title");
            expect(lastOpened).toBeDefined();
        });
    });

    describe("getLastOpenedAt", () => {
        it("returns undefined for non-existent container", () => {
            const lastOpened = getLastOpenedAt("non-existent-id");
            expect(lastOpened).toBeUndefined();
        });

        it("returns timestamp when set", () => {
            setContainerTitleInMetaDoc("container-9", "Test");
            const timestamp = Date.now();
            updateLastOpenedAt("container-9");
            const lastOpened = getLastOpenedAt("container-9");
            expect(lastOpened).toBeDefined();
            expect(lastOpened!).toBeGreaterThanOrEqual(timestamp);
        });
    });

    describe("Integration", () => {
        it("stores and retrieves multiple containers", () => {
            setContainerTitleInMetaDoc("container-a", "Container A");
            setContainerTitleInMetaDoc("container-b", "Container B");
            setContainerTitleInMetaDoc("container-c", "Container C");

            expect(getContainerTitleFromMetaDoc("container-a")).toBe("Container A");
            expect(getContainerTitleFromMetaDoc("container-b")).toBe("Container B");
            expect(getContainerTitleFromMetaDoc("container-c")).toBe("Container C");
        });

        it("handles multiple updates to same container", async () => {
            const containerId = "container-d";
            setContainerTitleInMetaDoc(containerId, "Version 1");
            updateLastOpenedAt(containerId);
            const firstTimestamp = getLastOpenedAt(containerId);

            // Wait a bit to ensure different timestamp
            await new Promise(resolve => setTimeout(resolve, 10));
            setContainerTitleInMetaDoc(containerId, "Version 2");
            updateLastOpenedAt(containerId);
            const secondTimestamp = getLastOpenedAt(containerId);

            expect(getContainerTitleFromMetaDoc(containerId)).toBe("Version 2");
            expect(secondTimestamp).toBeDefined();
            expect(firstTimestamp).toBeDefined();
            expect(secondTimestamp!).toBeGreaterThan(firstTimestamp!);
        });
    });
});
