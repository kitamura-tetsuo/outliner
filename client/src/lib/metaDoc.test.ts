import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { containersMap, getContainerTitleFromMetaDoc, metaDoc, setContainerTitleInMetaDoc } from "./metaDoc.svelte";

// Mock IndexedDBPersistence
vi.mock("y-indexeddb", () => {
    const IndexeddbPersistence = vi.fn().mockImplementation(() => ({
        once: vi.fn(),
        destroy: vi.fn(),
    }));
    return { IndexeddbPersistence };
});

// Mock window for IndexedDB check
const originalWindow = global.window;
const originalConsoleLog = console.log;

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
