import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createPersistence, waitForSync } from "../../../../src/lib/yjsPersistence";

// Import the class from the mock
import { IndexeddbPersistence } from "y-indexeddb";

// Mock IndexeddbPersistence from y-indexeddb
vi.mock("y-indexeddb", () => {
    const mockPersistence = {
        once: vi.fn(),
        synced: false,
        destroy: vi.fn(),
    };

    return {
        IndexeddbPersistence: vi.fn().mockImplementation((dbName: string, doc: Y.Doc) => {
            expect(dbName).toMatch(/^container-/);
            expect(doc).toBeInstanceOf(Y.Doc);
            return mockPersistence;
        }),
    };
});

describe("yjsPersistence", () => {
    let mockPersistence: any;
    let doc: Y.Doc;

    beforeEach(() => {
        vi.clearAllMocks();
        doc = new Y.Doc();
        mockPersistence = {
            once: vi.fn(),
            synced: false,
            destroy: vi.fn(),
        };
    });

    describe("createPersistence", () => {
        it("should create IndexedDB persistence with correct dbName format", () => {
            const containerId = "test-container-123";
            const persistence = createPersistence(containerId, doc);

            expect(persistence).toBeDefined();
        });

        it("should set up synced event listener", () => {
            const containerId = "test-container-456";
            const persistence = createPersistence(containerId, doc);

            expect(persistence.once).toHaveBeenCalledWith("synced", expect.any(Function));
        });

        it("should log when sync is complete", () => {
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            const containerId = "test-container-789";

            // Track the callback that was passed to once
            let syncCallback: Function | null = null;
            const mockPersistenceImpl = {
                once: vi.fn((event: string, callback: Function) => {
                    if (event === "synced") {
                        syncCallback = callback;
                    }
                }),
                synced: false,
                destroy: vi.fn(),
            };

            vi.mocked(IndexeddbPersistence).mockImplementationOnce(() => mockPersistenceImpl as any);

            createPersistence(containerId, doc);

            // Trigger the sync callback
            if (syncCallback) {
                syncCallback();
            }

            expect(consoleSpy).toHaveBeenCalledWith(
                "[yjsPersistence] Local cache loaded for container: test-container-789",
            );

            consoleSpy.mockRestore();
        });
    });

    describe("waitForSync", () => {
        it("should resolve immediately if already synced", async () => {
            const persistence = {
                synced: true,
                once: vi.fn(),
            };

            await expect(waitForSync(persistence as any)).resolves.toBeUndefined();
            expect(persistence.once).not.toHaveBeenCalled();
        });

        it("should wait for sync event if not synced", async () => {
            const persistence = {
                synced: false,
                once: vi.fn((event, callback) => {
                    // Simulate sync happening after a short delay
                    setTimeout(callback, 10);
                }),
            };

            await expect(waitForSync(persistence as any)).resolves.toBeUndefined();
            expect(persistence.once).toHaveBeenCalledWith("synced", expect.any(Function));
        });

        it("should handle multiple calls to waitForSync", async () => {
            const persistence = {
                synced: false,
                once: vi.fn((event, callback) => {
                    // Simulate sync happening after a short delay
                    setTimeout(callback, 10);
                }),
            };

            const waitPromise1 = waitForSync(persistence as any);
            const waitPromise2 = waitForSync(persistence as any);

            // Both should be pending
            expect(persistence.once).toHaveBeenCalledTimes(2);

            // Wait for both promises to resolve
            await Promise.all([waitPromise1, waitPromise2]);

            expect(await waitPromise1).toBeUndefined();
            expect(await waitPromise2).toBeUndefined();
        });
    });
});
