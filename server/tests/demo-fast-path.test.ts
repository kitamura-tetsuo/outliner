import { expect } from "chai";
import express from "express";
import * as sinon from "sinon";
import request from "supertest";
import * as Y from "yjs";
import { createDemoRouter } from "../src/demo-api.js";
import { DEMO_PROJECT_TITLE, DEMO_TEMPLATE_VERSION, populateDemoProject } from "../src/demo-content.js";
import { Project } from "../src/schema/app-schema.js";

describe("Demo Fast Path", () => {
    let mockHocuspocus: any;
    let mockDoc: Y.Doc;
    let mockDirectConnection: any;

    beforeEach(() => {
        mockDoc = new Y.Doc();
        const metadata = mockDoc.getMap("metadata");
        metadata.set("lastReset", Date.now());
        metadata.set("templateVersion", DEMO_TEMPLATE_VERSION);
        metadata.set("title", DEMO_PROJECT_TITLE);

        // Use populateDemoProject so the expected template pages are present, otherwise shouldReset is true
        const project = Project.fromDoc(mockDoc);
        populateDemoProject(project, "seed-server");

        mockDirectConnection = {
            document: mockDoc,
            transact: sinon.stub().callsFake((cb: any) => cb(mockDoc)),
            disconnect: sinon.stub().resolves(),
        };

        mockHocuspocus = {
            openDirectConnection: sinon.stub().resolves(mockDirectConnection),
        };
    });

    afterEach(() => {
        sinon.restore();
    });

    it("should use fast path on subsequent warm load", async () => {
        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter(mockHocuspocus, {} as any));

        // First request should open connection
        const res1 = await request(app).post("/api/seed-demo");
        expect(res1.status).to.equal(200);
        expect(res1.body.success).to.equal(true);
        expect(res1.body.reset).to.equal(false);
        expect(mockHocuspocus.openDirectConnection.callCount).to.equal(1);
        expect(res1.headers["server-timing"]).to.be.undefined;

        // Second request should use fast path
        const res2 = await request(app).post("/api/seed-demo");
        expect(res2.status).to.equal(200);
        expect(res2.body.success).to.equal(true);
        expect(res2.body.reset).to.equal(false);
        expect(mockHocuspocus.openDirectConnection.callCount).to.equal(1); // No new connection
        expect(res2.headers["server-timing"]).to.equal("fast-path");
    });

    it("should bypass fast path on force reset", async () => {
        const app = express();
        app.use(express.json());
        // Dummy config for IP
        const config = { TRUST_PROXY: false };
        app.use("/api", createDemoRouter(mockHocuspocus, config as any));

        // First request
        await request(app).post("/api/seed-demo");
        // Since it's warm from the first request, it would normally hit the fast path
        // but we are mocking callCount, so let's reset it
        mockHocuspocus.openDirectConnection.resetHistory();

        // First request to seed it
        await request(app).post("/api/seed-demo");

        // Since the before block populated the doc, shouldReset was false, so it wrote to fast path
        mockHocuspocus.openDirectConnection.resetHistory();

        // Force request
        const res2 = await request(app).post("/api/seed-demo").send({ force: true });
        expect(res2.status).to.equal(200);
        expect(res2.body.success).to.equal(true);
        expect(res2.body.reset).to.equal(true); // Since it was forced
        expect(mockHocuspocus.openDirectConnection.callCount).to.equal(1);
        expect(res2.headers["server-timing"]).to.be.undefined;
    });
});
