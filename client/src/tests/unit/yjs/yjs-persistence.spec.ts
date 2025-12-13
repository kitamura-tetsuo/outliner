import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createPersistence, waitForSync } from "../../../../src/lib/yjsPersistence";

// Import the class from the mock
import { IndexeddbPersistence } from "y-indexeddb";

// Type for mock persistence object
interface MockPersistence {
    once: ReturnType<typeof vi.fn>;
    synced: boolean;
    destroy: ReturnType<typeof vi.fn>;
}

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
    let doc: Y.Doc;

    beforeEach(() => {
        vi.clearAllMocks();
        doc = new Y.Doc();
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
            let syncCallback: () => void = () => {
                throw new Error("sync callback not set");
            };
            const mockPersistenceImpl: MockPersistence = {
                once: vi.fn((event: string, callback: () => void) => {
                    if (event === "synced") {
                        syncCallback = callback;
                    }
                }),
                synced: false,
                destroy: vi.fn(),
            };

            vi.mocked(IndexeddbPersistence).mockImplementationOnce(
                () => mockPersistenceImpl as unknown as IndexeddbPersistence,
            );

            createPersistence(containerId, doc);

            // Trigger the sync callback
            syncCallback();

            expect(consoleSpy).toHaveBeenCalledWith(
                "[yjsPersistence] Local cache loaded for container: test-container-789",
            );

            consoleSpy.mockRestore();
        });
    });

    describe("waitForSync", () => {
        it("should resolve immediately if already synced", async () => {
            const persistence: MockPersistence = {
                synced: true,
                once: vi.fn(),
                destroy: vi.fn(),
            };

            await expect(waitForSync(persistence)).resolves.toBeUndefined();
            expect(persistence.once).not.toHaveBeenCalled();
        });

        it("should wait for sync event if not synced", async () => {
            const persistence: MockPersistence = {
                synced: false,
                once: vi.fn((event: string, callback: () => void) => {
                    // Simulate sync happening after a short delay
                    setTimeout(callback, 10);
                }),
                destroy: vi.fn(),
            };

            await expect(waitForSync(persistence)).resolves.toBeUndefined();
            expect(persistence.once).toHaveBeenCalledWith("synced", expect.any(Function));
        });

        it("should handle multiple calls to waitForSync", async () => {
            const persistence: MockPersistence = {
                synced: false,
                once: vi.fn((event: string, callback: () => void) => {
                    // Simulate sync happening after a short delay
                    setTimeout(callback, 10);
                }),
                destroy: vi.fn(),
            };

            const waitPromise1 = waitForSync(persistence);
            const waitPromise2 = waitForSync(persistence);

            // Both should be pending
            expect(persistence.once).toHaveBeenCalledTimes(2);

            // Wait for both promises to resolve
            await Promise.all([waitPromise1, waitPromise2]);

            expect(await waitPromise1).toBeUndefined();
            expect(await waitPromise2).toBeUndefined();
        });
    });
});
