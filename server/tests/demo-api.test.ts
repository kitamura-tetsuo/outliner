import { expect } from "chai";
import express from "express";
import { describe, it } from "mocha";
import request from "supertest";
import * as Y from "yjs";
import { createDemoRouter } from "../src/demo-api.js";
import { DEMO_PROJECT_TITLE, DEMO_TEMPLATE_VERSION, populateDemoProject } from "../src/demo-content.js";
import { Project } from "../src/schema/app-schema.js";
import { type Config } from "../src/config.js";
import { Hocuspocus } from "@hocuspocus/server";

describe("Demo API Server Path", () => {
    it("coalesces simultaneous warm visitors", async () => {
        const mockDoc = new Y.Doc();
        mockDoc.getMap("metadata").set("lastReset", Date.now());
        mockDoc.getMap("metadata").set("templateVersion", DEMO_TEMPLATE_VERSION);
        populateDemoProject(Project.fromDoc(mockDoc as unknown as Y.Doc), "test");

        let connectCalls = 0;
        const directConnection = {
            document: mockDoc,
            transact: (cb: any) => cb(mockDoc),
            disconnect: async () => {}
        };

        const mockHocuspocus = {
            openDirectConnection: async () => {
                connectCalls++;
                // simulate async delay
                await new Promise(r => setTimeout(r, 10));
                return directConnection;
            },
            documents: { get: () => null }
        };

        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus as unknown as Hocuspocus, {} as Config));

        // Fire simultaneous requests
        const [r1, r2] = await Promise.all([request(app).post("/api/seed-demo"), request(app).post("/api/seed-demo")]);
        expect(r1.status).to.equal(200);
        expect(r2.status).to.equal(200);
        expect(r1.body.reset).to.equal(false);
        expect(r2.body.reset).to.equal(false);

        // Only one connection should have been opened
        expect(connectCalls).to.equal(1);
    });

    it("uses active document fast path when in memory", async () => {
        const mockDoc = new Y.Doc();
        mockDoc.getMap("metadata").set("lastReset", Date.now());
        mockDoc.getMap("metadata").set("templateVersion", DEMO_TEMPLATE_VERSION);
        populateDemoProject(Project.fromDoc(mockDoc as unknown as Y.Doc), "test");

        let connectCalls = 0;
        const mockHocuspocus = {
            openDirectConnection: async () => {
                connectCalls++;
                return { document: mockDoc, transact: (cb: any) => cb(mockDoc), disconnect: async () => {} };
            },
            documents: { get: () => ({ document: mockDoc }) }
        };

        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus as unknown as Hocuspocus, {} as Config));

        const r1 = await request(app).post("/api/seed-demo");
        expect(r1.status).to.equal(200);
        expect(r1.body.reset).to.equal(false);

        // No connections opened because it was in memory and valid
        expect(connectCalls).to.equal(0);
        expect(r1.header["server-timing"]).to.include("metadata-read");
    });
});
