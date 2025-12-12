import { vi, test, expect, describe } from "vitest";
import * as fs from "fs";
import * as vm from "vm";
import * as path from "path";

const mockFetch = vi.fn();
const mockGet = vi.fn();
const mockDelete = vi.fn();
const mockDoc = vi.fn(() => ({
    delete: mockDelete,
}));
const mockAdmin = {
    initializeApp: vi.fn(),
    firestore: vi.fn().mockReturnValue({
        collection: vi.fn(() => ({
            doc: mockDoc,
            where: vi.fn().mockReturnThis(),
            get: mockGet,
        })),
    }),
};

const mockFunctions = {
    pubsub: {
        schedule: vi.fn().mockReturnThis(),
        onRun: vi.fn((callback) => ({ run: callback })),
    },
};

describe("Auto-Purge Logic", () => {
    test("should permanently delete projects older than 30 days", async () => {
        const thirtyDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
        const mockProjectDoc = { id: "oldProject", data: () => ({ deletedAt: thirtyDaysAgo }) };
        mockGet.mockResolvedValue({
            empty: false,
            docs: [mockProjectDoc],
            forEach: (callback) => [mockProjectDoc].forEach(callback),
        });

        const context = {};

        const filePath = path.resolve(__dirname, "../../functions/scheduled/purgeDeletedProjects.js");
        const code = fs.readFileSync(filePath, "utf8");
        const script = new vm.Script(code);
        const scriptContext = {
            require: (module) => {
                if (module === "firebase-admin") {
                    return mockAdmin;
                }
                if (module === "firebase-functions") {
                    return mockFunctions;
                }
                if (module === "node-fetch") {
                    return mockFetch;
                }
                return require(module);
            },
            exports: {},
            console: {
                log: vi.fn(),
            },
            process: {
                env: {
                    YJS_URL: "http://test-yjs-server.com",
                    YJS_SECRET_KEY: "test-secret-key",
                },
            },
        };
        script.runInNewContext(scriptContext);
        await scriptContext.exports.purgeDeletedProjects.run(context);

        expect(mockFetch).toHaveBeenCalledWith("http://test-yjs-server.com/docs/projects/oldProject", {
            method: "DELETE",
            headers: {
                "x-secret-key": "test-secret-key",
            },
        });
        expect(mockDoc).toHaveBeenCalledWith("oldProject");
        expect(mockDelete).toHaveBeenCalled();
    });
});
