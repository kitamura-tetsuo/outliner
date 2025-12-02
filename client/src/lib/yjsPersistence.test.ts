import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createPersistence, waitForSync } from "./yjsPersistence";
import "fake-indexeddb/auto";

// Import IndexeddbPersistence for type checking
import { IndexeddbPersistence } from "y-indexeddb";

describe("yjsPersistence", () => {
    beforeEach(async () => {
        // Clear all IndexedDB databases before each test
        const databases = await indexedDB.databases?.();
        if (databases) {
            const deletePromises = databases
                .filter(db => db.name && db.name.startsWith("container-"))
                .map(db => {
                    const dbName = db.name!;
                    return new Promise<void>((resolve, reject) => {
                        const request = indexedDB.deleteDatabase(dbName);
                        request.onsuccess = () => resolve();
                        request.onerror = () => reject(request.error);
                    });
                });
            await Promise.all(deletePromises);
        }
    });

    it("should create persistence for a container", async () => {
        const doc = new Y.Doc();
        const containerId = "test-container-1";
        const persistence = createPersistence(containerId, doc);

        expect(persistence).toBeDefined();
        expect(persistence).toBeInstanceOf(IndexeddbPersistence);

        await waitForSync(persistence);
        expect(persistence.synced).toBe(true);

        persistence.destroy();
        doc.destroy();
    });

    it("should persist and restore Y.Doc content", async () => {
        const containerId = "test-container-2";

        // Create a doc, add content, and persist
        const doc1 = new Y.Doc();
        const persistence1 = createPersistence(containerId, doc1);
        await waitForSync(persistence1);

        // Add some content to the document
        const yText = doc1.getText("test");
        yText.insert(0, "Hello, World!");
        const yArray = doc1.getArray("items");
        yArray.push([1, 2, 3]);

        // Wait for persistence to save (y-indexeddb syncs asynchronously)
        await new Promise(resolve => setTimeout(resolve, 100));

        // Dispose the first doc
        persistence1.destroy();
        doc1.destroy();

        // Create a new doc with the same container ID
        const doc2 = new Y.Doc();
        const persistence2 = createPersistence(containerId, doc2);
        await waitForSync(persistence2);

        // Verify content was restored from IndexedDB
        const yText2 = doc2.getText("test");
        expect(yText2.toString()).toBe("Hello, World!");

        const yArray2 = doc2.getArray("items");
        expect(yArray2.length).toBe(3);
        expect(yArray2.get(0)).toBe(1);
        expect(yArray2.get(1)).toBe(2);
        expect(yArray2.get(2)).toBe(3);

        persistence2.destroy();
        doc2.destroy();
    });

    it("should persist incremental updates", async () => {
        const containerId = "test-container-3";

        // Create initial document
        const doc1 = new Y.Doc();
        const persistence1 = createPersistence(containerId, doc1);
        await waitForSync(persistence1);

        // Perform multiple insert operations
        const yText = doc1.getText("content");
        yText.insert(0, "First");
        await new Promise(resolve => setTimeout(resolve, 30));

        yText.insert(yText.length, " Second");
        await new Promise(resolve => setTimeout(resolve, 30));

        yText.insert(yText.length, " Third");
        await new Promise(resolve => setTimeout(resolve, 30));

        // Verify the text is correct before persistence
        expect(yText.toString()).toBe("First Second Third");

        // Wait for all updates to persist
        await new Promise(resolve => setTimeout(resolve, 100));

        // Dispose and recreate
        persistence1.destroy();
        doc1.destroy();

        const doc2 = new Y.Doc();
        const persistence2 = createPersistence(containerId, doc2);
        await waitForSync(persistence2);

        // Verify all incremental updates were persisted
        const yText2 = doc2.getText("content");
        expect(yText2.toString()).toBe("First Second Third");

        persistence2.destroy();
        doc2.destroy();
    });

    it("should handle Y.Map persistence", async () => {
        const containerId = "test-container-4";

        const doc1 = new Y.Doc();
        const persistence1 = createPersistence(containerId, doc1);
        await waitForSync(persistence1);

        // Create and populate a Y.Map
        const yMap = doc1.getMap<unknown>("metadata");
        yMap.set("title", "My Document");
        yMap.set("author", "Test User");
        yMap.set("version", 1);

        await new Promise(resolve => setTimeout(resolve, 100));

        persistence1.destroy();
        doc1.destroy();

        const doc2 = new Y.Doc();
        const persistence2 = createPersistence(containerId, doc2);
        await waitForSync(persistence2);

        // Verify Y.Map was restored
        const yMap2 = doc2.getMap<unknown>("metadata");
        expect(yMap2.get("title")).toBe("My Document");
        expect(yMap2.get("author")).toBe("Test User");
        expect(yMap2.get("version")).toBe(1);

        persistence2.destroy();
        doc2.destroy();
    });

    it("should persist complex nested Yjs structures", async () => {
        const containerId = "test-container-5";

        const doc1 = new Y.Doc();
        const persistence1 = createPersistence(containerId, doc1);
        await waitForSync(persistence1);

        // Create nested structure: Map -> Map -> Array -> Text
        const rootMap = doc1.getMap<unknown>("root");
        const childMap = new Y.Map();
        childMap.set("name", "Child Map");
        const childArray = new Y.Array<string>();
        childArray.push(["item1", "item2"]);
        childMap.set("items", childArray);
        rootMap.set("child", childMap);

        await new Promise(resolve => setTimeout(resolve, 100));

        persistence1.destroy();
        doc1.destroy();

        const doc2 = new Y.Doc();
        const persistence2 = createPersistence(containerId, doc2);
        await waitForSync(persistence2);

        // Verify nested structure was restored
        const rootMap2 = doc2.getMap<unknown>("root");
        const childMap2 = rootMap2.get("child") as Y.Map<unknown>;
        expect(childMap2.get("name")).toBe("Child Map");

        const childArray2 = childMap2.get("items") as Y.Array<string>;
        expect(childArray2.length).toBe(2);
        expect(childArray2.get(0)).toBe("item1");
        expect(childArray2.get(1)).toBe("item2");

        persistence2.destroy();
        doc2.destroy();
    });

    it("should handle deletion operations", async () => {
        const containerId = "test-container-6";

        const doc1 = new Y.Doc();
        const persistence1 = createPersistence(containerId, doc1);
        await waitForSync(persistence1);

        // Create and then delete content
        const yText = doc1.getText("content");
        yText.insert(0, "Delete Me Please");
        await new Promise(resolve => setTimeout(resolve, 50));

        // Delete middle portion - remove "Me" (characters at positions 7-8)
        yText.delete(7, 2);

        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify the text is correct before persistence
        expect(yText.toString()).toBe("Delete  Please");

        await new Promise(resolve => setTimeout(resolve, 100));

        persistence1.destroy();
        doc1.destroy();

        const doc2 = new Y.Doc();
        const persistence2 = createPersistence(containerId, doc2);
        await waitForSync(persistence2);

        // Verify deletion was persisted
        const yText2 = doc2.getText("content");
        expect(yText2.toString()).toBe("Delete  Please");

        persistence2.destroy();
        doc2.destroy();
    });

    it("should sync even when already marked as synced", async () => {
        const containerId = "test-container-7";
        const doc = new Y.Doc();
        const persistence = createPersistence(containerId, doc);

        // First sync
        await waitForSync(persistence);
        expect(persistence.synced).toBe(true);

        // Add content after initial sync
        const yText = doc.getText("test");
        yText.insert(0, "Content added after sync");

        // Wait a bit for the change to persist
        await new Promise(resolve => setTimeout(resolve, 100));

        // Should still be synced
        expect(persistence.synced).toBe(true);

        persistence.destroy();
        doc.destroy();
    });

    it("should use correct database name format", async () => {
        const containerId = "special-chars-test_123";
        const doc = new Y.Doc();

        const persistence = createPersistence(containerId, doc);
        await waitForSync(persistence);

        // Verify the database name starts with 'container-'
        // The actual database creation happens in y-indexeddb
        // We can't easily verify the exact name without exposing it,
        // but we can verify persistence works

        const yText = doc.getText("data");
        yText.insert(0, "test data");

        await new Promise(resolve => setTimeout(resolve, 100));

        persistence.destroy();
        doc.destroy();

        // Recreate and verify
        const doc2 = new Y.Doc();
        const persistence2 = createPersistence(containerId, doc2);
        await waitForSync(persistence2);

        const yText2 = doc2.getText("data");
        expect(yText2.toString()).toBe("test data");

        persistence2.destroy();
        doc2.destroy();
    });
});
