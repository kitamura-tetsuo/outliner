import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

describe("yjsPersistence", () => {
    let doc: Y.Doc;
    let createPersistence: any;
    let waitForSync: any;
    let IndexeddbPersistenceMock: any;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        doc = new Y.Doc();

        // 1. Create the mock class function
        const MockPersistenceClass = vi.fn().mockImplementation(function() {
            return {
                once: vi.fn(),
                synced: false,
                destroy: vi.fn(),
            };
        });

        // 2. Setup the mock module using doMock
        // This ensures that when the SUT imports "y-indexeddb", it gets this mock
        vi.doMock("y-indexeddb", () => {
            return {
                IndexeddbPersistence: MockPersistenceClass,
            };
        });

        // 3. Dynamically import the SUT (Subject Under Test)
        // This forces re-evaluation of module dependencies, using the mocks defined above
        const module = await import("../../../../src/lib/yjsPersistence");
        createPersistence = module.createPersistence;
        waitForSync = module.waitForSync;

        // Expose the mock class for test assertions
        IndexeddbPersistenceMock = MockPersistenceClass;
    });

    describe("createPersistence", () => {
        it("should create IndexedDB persistence with correct dbName format", () => {
            const containerId = "test-container-123";
            const persistence = createPersistence(containerId, doc);

            expect(persistence).toBeDefined();
            expect(IndexeddbPersistenceMock).toHaveBeenCalledWith("container-test-container-123", doc);
        });

        it("should set up synced event listener", () => {
            const containerId = "test-container-456";
            const persistence = createPersistence(containerId, doc);

            expect(persistence.once).toHaveBeenCalledWith("synced", expect.any(Function));
        });

        it("should log when sync is complete", () => {
            const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            const containerId = "test-container-789";

            let syncCallback: () => void = () => {
                throw new Error("sync callback not set");
            };

            // Setup the mock implementation for this specific test
            // Since `IndexeddbPersistenceMock` is a vi.fn(), we can mock its implementation
            vi.mocked(IndexeddbPersistenceMock).mockImplementationOnce(function() {
                return {
                    once: vi.fn((event: string, callback: () => void) => {
                        if (event === "synced") {
                            syncCallback = callback;
                        }
                    }),
                    synced: false,
                    destroy: vi.fn(),
                } as any;
            });

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
            // Setup mock to be synced
            vi.mocked(IndexeddbPersistenceMock).mockImplementationOnce(function() {
                return {
                    synced: true,
                    once: vi.fn(),
                    destroy: vi.fn(),
                } as any;
            });

            // We need to instantiate it manually or via createPersistence if we want to test waitForSync on a mock
            // But waitForSync takes an interface. Let's create a persistence instance using the mock class.
            const persistence = new IndexeddbPersistenceMock("test", doc);

            await expect(waitForSync(persistence)).resolves.toBeUndefined();
            expect(persistence.once).not.toHaveBeenCalled();
        });

        it("should wait for sync event if not synced", async () => {
            vi.mocked(IndexeddbPersistenceMock).mockImplementationOnce(function() {
                return {
                    synced: false,
                    once: vi.fn((event: string, callback: () => void) => {
                        setTimeout(callback, 10);
                    }),
                    destroy: vi.fn(),
                } as any;
            });

            const persistence = new IndexeddbPersistenceMock("test", doc);

            await expect(waitForSync(persistence)).resolves.toBeUndefined();
            expect(persistence.once).toHaveBeenCalledWith("synced", expect.any(Function));
        });

        it("should handle multiple calls to waitForSync", async () => {
            vi.mocked(IndexeddbPersistenceMock).mockImplementationOnce(function() {
                return {
                    synced: false,
                    once: vi.fn((event: string, callback: () => void) => {
                        setTimeout(callback, 10);
                    }),
                    destroy: vi.fn(),
                } as any;
            });

            const persistence = new IndexeddbPersistenceMock("test", doc);

            const waitPromise1 = waitForSync(persistence);
            const waitPromise2 = waitForSync(persistence);

            // Both should be pending and call once
            expect(persistence.once).toHaveBeenCalledTimes(2);

            // Wait for both promises to resolve
            await Promise.all([waitPromise1, waitPromise2]);

            expect(await waitPromise1).toBeUndefined();
            expect(await waitPromise2).toBeUndefined();
        });
    });
});
