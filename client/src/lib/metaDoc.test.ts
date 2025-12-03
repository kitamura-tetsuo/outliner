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
import { beforeEach, describe, expect, it, vi } from "vitest";
import { containersMap, getContainerTitleFromMetaDoc, metaDoc, setContainerTitleInMetaDoc } from "./metaDoc.svelte";

// Mock IndexedDBPersistence
vi.mock("y-indexeddb", () => {
    const IndexeddbPersistence = vi.fn().mockImplementation(() => ({
        once: vi.fn(),
        destroy: vi.fn(),
    }));
    return { IndexeddbPersistence };
});

describe("metaDoc", () => {
    beforeEach(() => {
        // Clear the containersMap before each test
        containersMap.clear();
        vi.clearAllMocks();
    });

    describe("setContainerTitleInMetaDoc", () => {
        it("should write container title to Y.Map correctly", () => {
            const containerId = "test-container-123";
            const title = "Test Container Title";

            setContainerTitleInMetaDoc(containerId, title);

            const storedData = containersMap.get(containerId);
            expect(storedData).toBeDefined();
            expect(storedData).toHaveProperty("title", title);
        });

        it("should overwrite existing title when called multiple times", () => {
            const containerId = "test-container-456";
            const initialTitle = "Initial Title";
            const updatedTitle = "Updated Title";

            setContainerTitleInMetaDoc(containerId, initialTitle);
            expect(containersMap.get(containerId)).toHaveProperty("title", initialTitle);

            setContainerTitleInMetaDoc(containerId, updatedTitle);
            expect(containersMap.get(containerId)).toHaveProperty("title", updatedTitle);
        });

        it("should handle empty string titles", () => {
            const containerId = "test-container-789";
            const title = "";

            setContainerTitleInMetaDoc(containerId, title);

            const storedData = containersMap.get(containerId);
            expect(storedData).toBeDefined();
            expect(storedData).toHaveProperty("title", "");
        });

        it("should handle special characters in titles", () => {
            const containerId = "test-container-special";
            const title = "Special Characters: !@#$%^&*()";

            setContainerTitleInMetaDoc(containerId, title);

            const storedData = containersMap.get(containerId);
            expect(storedData).toBeDefined();
            expect(storedData).toHaveProperty("title", title);
        });
    });

    describe("getContainerTitleFromMetaDoc", () => {
        it("should read container title from Y.Map correctly", () => {
            const containerId = "test-container-retrieve";
            const title = "Retrieve This Title";
            containersMap.set(containerId, { title });

            const retrievedTitle = getContainerTitleFromMetaDoc(containerId);

            expect(retrievedTitle).toBe(title);
        });

        it("should return empty string when container is not found", () => {
            const containerId = "non-existent-container";

            const retrievedTitle = getContainerTitleFromMetaDoc(containerId);

            expect(retrievedTitle).toBe("");
        });

        it("should return empty string when title property is missing", () => {
            const containerId = "container-missing-title";
            // Store data without title property
            containersMap.set(containerId, {});

            const retrievedTitle = getContainerTitleFromMetaDoc(containerId);

            expect(retrievedTitle).toBe("");
        });

        it("should return empty string when stored data is undefined", () => {
            const containerId = "container-undefined";
            containersMap.set(containerId, undefined);

            const retrievedTitle = getContainerTitleFromMetaDoc(containerId);

            expect(retrievedTitle).toBe("");
        });
    });

    describe("title persistence across Y.Doc reloads", () => {
        it("should persist title across multiple Y.Doc operations", () => {
            const containerId = "test-persistence-123";
            const title = "Persistent Title";

            // Set title
            setContainerTitleInMetaDoc(containerId, title);
            expect(getContainerTitleFromMetaDoc(containerId)).toBe(title);

            // Simulate multiple transactions
            metaDoc.transact(() => {
                setContainerTitleInMetaDoc(containerId, title + " Modified");
                setContainerTitleInMetaDoc(containerId, title);
            });

            // Verify persistence
            expect(getContainerTitleFromMetaDoc(containerId)).toBe(title);
        });

        it("should maintain data integrity with concurrent operations", () => {
            const containerId1 = "container-1";
            const containerId2 = "container-2";
            const title1 = "Title 1";
            const title2 = "Title 2";

            // Set both titles
            setContainerTitleInMetaDoc(containerId1, title1);
            setContainerTitleInMetaDoc(containerId2, title2);

            // Verify both are persisted correctly
            expect(getContainerTitleFromMetaDoc(containerId1)).toBe(title1);
            expect(getContainerTitleFromMetaDoc(containerId2)).toBe(title2);

            // Modify one and verify the other remains unchanged
            setContainerTitleInMetaDoc(containerId1, "Modified Title 1");
            expect(getContainerTitleFromMetaDoc(containerId1)).toBe("Modified Title 1");
            expect(getContainerTitleFromMetaDoc(containerId2)).toBe(title2);
        });
    });

    describe("integration scenarios", () => {
        it("should support full create-read-update cycle", () => {
            const containerId = "test-cycle-123";

            // Create - set initial title
            setContainerTitleInMetaDoc(containerId, "Initial");
            expect(getContainerTitleFromMetaDoc(containerId)).toBe("Initial");

            // Read - retrieve and verify
            let title = getContainerTitleFromMetaDoc(containerId);
            expect(title).toBe("Initial");

            // Update - modify the title
            setContainerTitleInMetaDoc(containerId, "Updated");
            expect(getContainerTitleFromMetaDoc(containerId)).toBe("Updated");

            // Read again - verify update persisted
            title = getContainerTitleFromMetaDoc(containerId);
            expect(title).toBe("Updated");
        });

        it("should handle multiple containers simultaneously", () => {
            const containers = [
                { id: "container-a", title: "Title A" },
                { id: "container-b", title: "Title B" },
                { id: "container-c", title: "Title C" },
            ];

            // Set all titles
            containers.forEach(({ id, title }) => {
                setContainerTitleInMetaDoc(id, title);
            });

            // Verify all are stored correctly
            containers.forEach(({ id, title }) => {
                const retrieved = getContainerTitleFromMetaDoc(id);
                expect(retrieved).toBe(title);
            });
        });

        it("should handle Unicode and multi-byte characters", () => {
            const containerId = "unicode-container";
            const unicodeTitle = "こんにちは世界 🌍 مرحبا بالعالم";

            setContainerTitleInMetaDoc(containerId, unicodeTitle);
            expect(getContainerTitleFromMetaDoc(containerId)).toBe(unicodeTitle);
        });
    });
});
