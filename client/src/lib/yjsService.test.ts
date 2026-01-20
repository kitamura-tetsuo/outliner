import { describe, expect, it, vi } from "vitest";
import { Project } from "../schema/yjs-schema";
import { createNewProject, getClientByProjectTitle, stableIdFromTitle } from "./yjsService.svelte";

// Define a type for the window object to avoid using 'any'
interface TestWindow extends Window {
    __YJS_CLIENT_REGISTRY__?: {
        map: {
            clear: () => void;
        };
    };
}

// Mock the YjsClient to prevent network connections during tests.
vi.mock("../yjs/YjsClient", () => ({
    YjsClient: class {
        doc: { guid: string; };
        project: Project;

        constructor(projectId: string, project: Project) {
            this.doc = { guid: projectId };
            this.project = project;
        }

        getProject(): Project {
            return this.project;
        }

        static async connect(projectId: string, project: Project) {
            // Return a mock client instance that satisfies the test's assertions.
            return Promise.resolve({
                doc: {
                    guid: projectId,
                },
                project,
                getProject: () => project,
            } as any);
        }
    },
}));

describe("yjsService", () => {
    describe("getClientByProjectTitle", () => {
        it("reloads project from metaDoc after registry is cleared", async () => {
            // 1. Create project "TestProject" and wait for sync.
            const originalClient = await createNewProject("TestProject");
            expect(originalClient).toBeDefined();

            // 2. Clear in-memory registry to simulate a refresh.
            // The registry is stored on the window object for persistence across module reloads.
            const testWindow = window as TestWindow;
            if (testWindow.__YJS_CLIENT_REGISTRY__) {
                testWindow.__YJS_CLIENT_REGISTRY__.map.clear();
            }

            // 3. Call getClientByProjectTitle("TestProject").
            const reloadedClient = await getClientByProjectTitle("TestProject");

            // 4. Assert client is returned and has correct ID.
            expect(reloadedClient).toBeDefined();
            expect((reloadedClient as any).doc.guid).toBe((originalClient as any).doc.guid);

            // Verify the stable ID matches what's expected
            const expectedId = stableIdFromTitle("TestProject");
            expect((reloadedClient as any).doc.guid.startsWith(expectedId)).toBe(true);
        });
    });
});
