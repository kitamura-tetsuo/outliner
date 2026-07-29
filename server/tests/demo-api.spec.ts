import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import * as Y from "yjs";
import { createDemoRouter } from "../src/demo-api.js";
import { DEMO_PROJECT_TITLE, DEMO_TEMPLATE_VERSION } from "../src/demo-content.js";
import { populateDemoProject } from "../src/demo-content.js";
import { Project } from "../src/schema/app-schema.js";

describe("Demo API", () => {
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

    it("should not consume force rate limit on failed reset", async () => {
        // First request fails
        mockHocuspocus.openDirectConnection.mockRejectedValueOnce(new Error("Demo seeding failed"));

        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus));

        const failResponse = await request(app)
            .post("/api/seed-demo")
            .set('X-Forwarded-For', '1.1.1.1')
            .send({ force: true });

        expect(failResponse.status).toBe(500);

        // Immediate retry should not be rate limited
        const successResponse = await request(app)
            .post("/api/seed-demo")
            .set('X-Forwarded-For', '1.1.1.1')
            .send({ force: true });

        expect(successResponse.status).toBe(200);
        expect(successResponse.body.reset).toBe(true);
    });

    it("should not consume force rate limit on deduplicated request", async () => {
        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus));

        // Start a normal reset (not force) that takes some time to resolve
        mockHocuspocus.openDirectConnection.mockReturnValueOnce(new Promise(resolve => setTimeout(() => resolve(mockDirectConnection), 100)));

        // Make the document empty so a normal reset is triggered
        mockDoc.transact(() => {
            const meta = mockDoc.getMap("metadata");
            meta.set("lastReset", 0); // Force a reset
        });

        const normalReqPromise = request(app).post("/api/seed-demo").set('X-Forwarded-For', '2.2.2.2').send({ force: false }).then(r => r);

        // While that is in flight, send a force request. It should be deduplicated.
        // We need to wait a tiny bit to ensure the first request has set the inFlightResets entry.
        await new Promise(resolve => setTimeout(resolve, 50));

        const forceReqPromise = request(app).post("/api/seed-demo").set('X-Forwarded-For', '2.2.2.2').send({ force: true }).then(r => r);

        // Now resolve the connection so both complete

        const normalRes = await normalReqPromise;
        const forceRes = await forceReqPromise;

        expect(normalRes.status).toBe(200);
        expect(forceRes.status).toBe(200);
                expect(forceRes.body.reset).toBe(false); // Because it deduplicated

        // Now an immediate genuine force reset should NOT be rate limited
        const genuineForceRes = await request(app)
            .post("/api/seed-demo")
            .set('X-Forwarded-For', '2.2.2.2')
            .send({ force: true });

        expect(genuineForceRes.status).toBe(200);
        expect(genuineForceRes.body.reset).toBe(true);
    });
});
