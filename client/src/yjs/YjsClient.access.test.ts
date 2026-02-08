import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createProjectConnection } from "../lib/yjs/connection";
import { Project } from "../schema/yjs-schema";
import { YjsClient } from "./YjsClient";

// Mock connection module
vi.mock("../lib/yjs/connection", () => ({
    createProjectConnection: vi.fn(),
}));

// Mock userManager
vi.mock("../auth/UserManager", () => ({
    userManager: {
        getCurrentUser: vi.fn(),
    },
}));

// Mock yjsService
vi.mock("../lib/yjs/service", () => ({
    yjsService: {
        bindProjectPresence: vi.fn(),
    },
}));

describe("YjsClient Access Control", () => {
    let mockProvider: any;

    beforeEach(() => {
        // Setup mock provider with event emitter capabilities
        const listeners: Record<string, Function[]> = {};
        mockProvider = {
            on: vi.fn((event, callback) => {
                if (!listeners[event]) listeners[event] = [];
                listeners[event].push(callback);
            }),
            emit: (event: string, ...args: any[]) => {
                if (listeners[event]) {
                    listeners[event].forEach(cb => cb(...args));
                }
            },
            configuration: {},
            disconnect: vi.fn(),
            destroy: vi.fn(),
        };

        (createProjectConnection as any).mockResolvedValue({
            doc: new Y.Doc(),
            provider: mockProvider,
            awareness: null,
            getPageConnection: vi.fn(),
            dispose: vi.fn(),
        });
    });

    it("should call onAccessDenied when provider closes with code 4003", async () => {
        const project = new Project();
        const client = await YjsClient.connect("test-project-id", project);

        const accessDeniedSpy = vi.fn();
        client.onAccessDenied = accessDeniedSpy;

        // Simulate 4003 close event
        mockProvider.emit("close", { code: 4003, reason: "Forbidden" });

        expect(accessDeniedSpy).toHaveBeenCalled();
    });

    it("should NOT call onAccessDenied when provider closes with other codes", async () => {
        const project = new Project();
        const client = await YjsClient.connect("test-project-id", project);

        const accessDeniedSpy = vi.fn();
        client.onAccessDenied = accessDeniedSpy;

        // Simulate 1000 (Normal Closure)
        mockProvider.emit("close", { code: 1000, reason: "Normal" });

        expect(accessDeniedSpy).not.toHaveBeenCalled();
    });
});
