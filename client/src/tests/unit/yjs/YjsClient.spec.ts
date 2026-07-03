import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { Project } from "../../../schema/yjs-schema";
import { YjsClient } from "../../../yjs/YjsClient";

// Mock HocuspocusProvider
vi.mock("@hocuspocus/provider", () => {
    return {
        HocuspocusProvider: class MockHocuspocusProvider {
            url = "ws://mock-url";
            name = "mock-provider";
            connected = true;
            isSynced = true;
            status = "connected";
            websocketProvider = { status: "connected" };
            destroy = vi.fn();
            on = vi.fn();
            constructor() {}
        },
    };
});

describe("YjsClient", () => {
    let client: YjsClient;
    const clientId = "test-client-id";
    const projectId = "test-project-id";
    let doc: Y.Doc;

    let provider: import("@hocuspocus/provider").HocuspocusProvider;

    let project: Project;

    beforeEach(async () => {
        // Reset mocks
        vi.clearAllMocks();

        doc = new Y.Doc();

        // Dynamically import HocuspocusProvider to use the mocked version
        const { HocuspocusProvider } = await import("@hocuspocus/provider");

        provider = new HocuspocusProvider(
            {
                name: "mock-provider",
                document: doc,
                url: "ws://mock",
            } as import("@hocuspocus/provider").HocuspocusProviderConfiguration,
        );

        // Create a simple mock for Project since we don't need its full logic for this test
        project = {
            dispose: () => {},
            metadata: {},
            rootFolder: {},
            ydoc: {},
            tree: {},
            findPage: () => {},
            addPage: () => {},
            title: "Test Project",
            items: { length: 0 },
        } as unknown as Project;

        client = new YjsClient({
            clientId,
            projectId,
            project: project,
            doc,
            provider,
            awareness: null,
        });
    });

    it("should implement getDebugInfo and return correct details", () => {
        // Verify the method exists
        // This will fail if the method is not defined
        expect(typeof client.getDebugInfo).toBe("function");

        // Call the method
        const info = client.getDebugInfo();

        // Verify return values
        expect(info).toBeDefined();
        expect(info.clientId).toBe(clientId);
        expect(info.containerId).toBe(projectId);
        // YjsClient.connectionState returns "Connected" or "Disconnected"
        // based on isContainerConnected which checks provider status
        expect(info.connectionState).toBe("Connected");
        expect(info.isSynced).toBe(true);
        expect(info.docGuid).toBe(doc.guid);

        // Verify provider info
        expect(info.provider).toBeDefined();
        expect(info.provider!.url).toBe("ws://mock-url");
        expect(info.provider!.name).toBe("mock-provider");
        expect(info.provider!.connected).toBe(true);
    });

    it("should return the project and tree correctly", () => {
        expect(client.getProject()).toBe(project);
        expect(client.getTree()).toBe(project.items);
    });

    it("should have wsProvider correctly set", () => {
        expect(client.wsProvider).toBe(provider);
    });

    it("should return correct connectionState properties", () => {
        expect(client.isContainerConnected).toBe(true);
        expect(client.connectionState).toBe("Connected");
        expect(client.getConnectionStateString()).toBe("Connected");

        // Mock a disconnected state
        const disconnectedProvider = {
            ...provider,
            isSynced: false,
            status: "disconnected",
            websocketProvider: { status: "disconnected" },
        } as any;
        const disconnectedClient = new YjsClient({
            clientId,
            projectId,
            project: project,
            doc,
            provider: disconnectedProvider,
            awareness: null,
        });

        expect(disconnectedClient.isContainerConnected).toBe(false);
        expect(disconnectedClient.connectionState).toBe("Disconnected");
        expect(disconnectedClient.getConnectionStateString()).toBe("Disconnected");
    });

    it("should return awareness if set", () => {
        const mockAwareness = {
            getStates: () => new Map(),
            getLocalState: () => ({}),
        } as any;

        const clientWithAwareness = new YjsClient({
            clientId,
            projectId,
            project: project,
            doc,
            provider,
            awareness: mockAwareness,
        });

        expect(clientWithAwareness.getAwareness()).toBe(mockAwareness);
        expect(client.getAwareness()).toBeNull();
    });

    it("should trigger onAccessDenied on 4003 error", () => {
        const onAccessDeniedMock = vi.fn();
        client.onAccessDenied = onAccessDeniedMock;

        // Find the on("close") handler registered in the constructor
        const closeHandler = vi.mocked(provider.on).mock.calls.find(call => call[0] === "close")?.[1];

        expect(closeHandler).toBeDefined();
        if (closeHandler) {
            closeHandler({ code: 4003, reason: "Access Denied" });
            expect(onAccessDeniedMock).toHaveBeenCalledTimes(1);

            // Should not trigger on other codes
            closeHandler({ code: 1000, reason: "Normal Closure" });
            expect(onAccessDeniedMock).toHaveBeenCalledTimes(1);
        }
    });

    it("should extract tree data correctly", () => {
        const mockItem1 = {
            id: "1",
            text: "Item 1",
            author: "user1",
            votes: ["user2"],
            created: 1000,
            lastChanged: 2000,
            items: { length: 0 },
        };
        const mockItem2 = {
            id: "2",
            text: "Item 2",
            author: "user3",
            votes: [],
            created: 3000,
            lastChanged: 4000,
            items: {
                length: 1,
                at: (i: number) => mockItem1,
            },
        };

        const mockItems = {
            length: 1,
            at: (i: number) => mockItem2,
        };

        const clientWithItems = new YjsClient({
            clientId,
            projectId,
            project: { ...project, items: mockItems } as any,
            doc,
            provider,
            awareness: null,
        });

        const data = clientWithItems.getAllData();
        expect(data.length).toBe(1);
        expect(data[0].id).toBe("2");
        expect(data[0].text).toBe("Item 2");
        expect(data[0].votes).toEqual([]);
        expect(data[0].items).toBeDefined();
        expect((data[0].items as any[])[0].id).toBe("1");
        expect((data[0].items as any[])[0].text).toBe("Item 1");
        expect((data[0].items as any[])[0].votes).toEqual(["user2"]);

        // getTreeAsJson
        expect(clientWithItems.getTreeAsJson("0.id")).toBe("2");
        expect(clientWithItems.getTreeAsJson("0.items.0.id")).toBe("1");
        expect(clientWithItems.getTreeAsJson("invalid.path")).toBeNull();
    });

    it("should safely dispose resources", () => {
        // Just executing to ensure no throws
        client.dispose();
        expect(provider.destroy).toHaveBeenCalled();
    });
});
