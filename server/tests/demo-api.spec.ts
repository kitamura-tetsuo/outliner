import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import * as Y from "yjs";
import { createDemoRouter } from "../src/demo-api.js";
import { DEMO_PROJECT_TITLE, DEMO_TEMPLATE_VERSION } from "../src/demo-content.js";
import { populateDemoProject } from "../src/demo-content.js";
import { Project } from "../src/schema/app-schema.js";

describe("Demo API", () => {
    afterEach(async () => {
        // Reset fast path
        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus));
        await request(app).post("/api/seed-demo").send({ invalidateFastPath: true });
    });
    let mockHocuspocus: any;
    let mockDoc: Y.Doc;
    let mockDirectConnection: any;

    beforeEach(async () => {
        mockDoc = new Y.Doc();
        const metadata = mockDoc.getMap("metadata");
        metadata.set("lastReset", Date.now());
        metadata.set("templateVersion", DEMO_TEMPLATE_VERSION);

        // Populate tree using app-schema logic so it passes "missingTemplatePages" check
        const project = Project.fromDoc(mockDoc as any);
        populateDemoProject(project, "test-user");

        mockDirectConnection = {
            document: mockDoc,
            transact: jest.fn((cb: any) => cb(mockDoc)),
            disconnect: jest.fn(),
        };

        mockHocuspocus = {
            openDirectConnection: jest.fn().mockResolvedValue(mockDirectConnection),
        };
    });

    it("should handle fast path", async () => {
        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus));

        // First request to set fast path
        await request(app).post("/api/seed-demo");

        // Second request should hit fast path
        const res = await request(app).post("/api/seed-demo");
        expect(res.body.fastPath).toBe(true);
        expect(res.body.reset).toBe(false);
    });

    it("should reset empty document", async () => {
        const emptyDoc = new Y.Doc();
        emptyDoc.getMap("metadata").set("lastReset", Date.now());
        emptyDoc.getMap("metadata").set("templateVersion", DEMO_TEMPLATE_VERSION);

        mockDirectConnection.document = emptyDoc;
        mockDirectConnection.transact = jest.fn((cb: any) => cb(emptyDoc));

        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus));

        const response = await request(app).post("/api/seed-demo");
        expect(response.status).toBe(200);
        expect(response.body.reset).toBe(true);
        expect(response.body.success).toBe(true);

        const metadata = emptyDoc.getMap("metadata");
        expect(metadata.get("title")).toBe(DEMO_PROJECT_TITLE);
        expect(mockDirectConnection.disconnect).toHaveBeenCalled();
    });

    it("should not reset if already seeded and not expired", async () => {
        const { Project } = await import("../src/schema/app-schema.js");
        const { populateDemoProject } = await import("../src/demo-content.js");

        mockDoc.transact(() => {
            const project = Project.fromDoc(mockDoc);
            populateDemoProject(project);
        });

        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus));

        const response = await request(app).post("/api/seed-demo");
        expect(response.status).toBe(200);
        expect(response.body.reset).toBe(false);
        expect(response.body.success).toBe(true);
    });

    it("should reset if template version changed", async () => {
        mockDoc.getMap("metadata").set("templateVersion", 1); // Old version

        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus));

        const response = await request(app).post("/api/seed-demo");
        expect(response.status).toBe(200);
        expect(response.body.reset).toBe(true);
        expect(response.body.success).toBe(true);
    });
});
