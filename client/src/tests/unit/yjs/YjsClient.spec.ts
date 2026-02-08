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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let provider: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let project: any;

    beforeEach(async () => {
        // Reset mocks
        vi.clearAllMocks();

        doc = new Y.Doc();

        // Dynamically import HocuspocusProvider to use the mocked version
        const { HocuspocusProvider } = await import("@hocuspocus/provider");
        provider = new HocuspocusProvider();

        // Create a simple mock for Project since we don't need its full logic for this test
        project = {
            title: "Test Project",
            items: { length: 0 },
        } as unknown as Project;

        client = new YjsClient({
            clientId,
            projectId,
            project,
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
        expect(info.provider.url).toBe("ws://mock-url");
        expect(info.provider.name).toBe("mock-provider");
        expect(info.provider.connected).toBe(true);
    });
});
