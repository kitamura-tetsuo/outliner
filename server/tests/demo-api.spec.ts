import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";
import * as Y from "yjs";
import { createDemoRouter } from "../src/demo-api.js";
import { DEMO_PROJECT_TITLE, DEMO_TEMPLATE_VERSION } from "../src/demo-content.js";

describe("Demo API", () => {
    let mockHocuspocus: any;
    let mockDoc: Y.Doc;
    let mockDirectConnection: any;

    beforeEach(() => {
        mockDoc = new Y.Doc();
        const metadata = mockDoc.getMap("metadata");
        metadata.set("lastReset", Date.now());
        metadata.set("templateVersion", DEMO_TEMPLATE_VERSION);

        const orderedTree = mockDoc.getMap("orderedTree");
        orderedTree.set("root", { id: "root" });
        orderedTree.set("item1", { id: "item1" }); // Make it not empty

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
        mockDoc.getMap("orderedTree").clear();

        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus));

        const response = await request(app).post("/api/seed-demo");
        expect(response.status).toBe(200);
        expect(response.body.reset).toBe(true);
        expect(response.body.success).toBe(true);

        const metadata = mockDoc.getMap("metadata");
        expect(metadata.get("title")).toBe(DEMO_PROJECT_TITLE);
        expect(mockDirectConnection.disconnect).toHaveBeenCalled();
    });

    it("should not reset if already seeded and not expired", async () => {
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
