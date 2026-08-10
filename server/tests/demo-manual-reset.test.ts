import { jest } from "@jest/globals";
import { expect } from "chai";
import express from "express";
import request from "supertest";
import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { createDemoRouter } from "../src/demo-api.js";
import { shouldResetDemo } from "../src/demo-api.js";
import { DEMO_PROJECT_TITLE, DEMO_TEMPLATE_VERSION, demoPages, populateDemoProject } from "../src/demo-content.js";
import { Project } from "../src/schema/app-schema.js";

// FTR-784f295f: the demo reset button manually triggers the same reset that
// otherwise runs on the 24h schedule.
describe("Demo manual reset policy", function() {
    const now = Date.now();
    const fresh = {
        isEmpty: false,
        lastReset: now - 60 * 1000, // reset one minute ago
        templateVersion: DEMO_TEMPLATE_VERSION,
        now,
        force: false,
        missingTemplatePages: false,
    };

    it("does not reset a freshly seeded document without force", function() {
        expect(shouldResetDemo(fresh)).to.equal(false);
    });

    it("resets a freshly seeded document when force is requested", function() {
        expect(shouldResetDemo({ ...fresh, force: true })).to.equal(true);
    });

    it("still resets on the 24h schedule without force", function() {
        const lastReset = now - 24 * 60 * 60 * 1000 - 1;
        expect(shouldResetDemo({ ...fresh, lastReset })).to.equal(true);
    });

    it("still resets when the document is empty or has no reset metadata", function() {
        expect(shouldResetDemo({ ...fresh, isEmpty: true })).to.equal(true);
        expect(shouldResetDemo({ ...fresh, lastReset: undefined })).to.equal(true);
    });

    it("still resets when the template version changed", function() {
        expect(shouldResetDemo({ ...fresh, templateVersion: DEMO_TEMPLATE_VERSION - 1 })).to.equal(true);
    });
});

// The reset must rebuild the template with sequential writes in the live
// document. The previous applyUpdate-from-a-fresh-doc approach made the YTree
// "root" marker a concurrent write that could lose against tombstones from
// earlier resets, leaving a document that YTree refuses to load.
describe("Demo reseed keeps the shared document tree valid", function() {
    jest.setTimeout(10000);
    // Mirrors the transact body of POST /api/seed-demo
    function resetCycle(ydoc: Y.Doc): void {
        const orderedTree = ydoc.getMap("orderedTree");
        Array.from(orderedTree.keys()).forEach(key => orderedTree.delete(key));
        const meta = ydoc.getMap("metadata");
        meta.set("title", DEMO_PROJECT_TITLE);
        meta.set("templateVersion", DEMO_TEMPLATE_VERSION);
        populateDemoProject(Project.fromDoc(ydoc), "seed-server");
    }

    it("stays loadable by YTree across repeated reload-and-reset cycles", function() {
        // Simulate the server reloading the persisted doc (new client id each
        // time) and force-resetting it, several times in a row.
        let persisted = (function() {
            const doc = new Y.Doc();
            resetCycle(doc);
            return Y.encodeStateAsUpdate(doc);
        })();

        for (let cycle = 0; cycle < 5; cycle++) {
            const reloaded = new Y.Doc();
            Y.applyUpdate(reloaded, persisted);
            resetCycle(reloaded);
            persisted = Y.encodeStateAsUpdate(reloaded);
        }

        // A client syncing the final state must see a valid tree with one
        // top-level page per template entry.
        const synced = new Y.Doc();
        Y.applyUpdate(synced, persisted);
        const tree = new YTree(synced.getMap("orderedTree") as Y.Map<Y.Map<unknown>>);
        const rootChildren = tree.getNodeChildrenFromKey("root");
        expect(rootChildren.length).to.equal(demoPages.length);
    });
});

describe("Demo manual reset rate limit", function() {
    jest.setTimeout(10000);

    it("failed reset does not consume the cooldown", async function() {
        const app = express();
        app.use(express.json());

        const mockHocuspocus = {
            openDirectConnection: async function() {
                throw new Error("Simulated reset failure");
            },
        };
        app.use("/api", createDemoRouter(mockHocuspocus as any));

        const originalNow = Date.now;
        let currentTime = 1000000;
        Date.now = () => currentTime;

        const res1 = await request(app).post("/api/seed-demo").set("cf-connecting-ip", "10.0.0.1").send({
            force: true,
        });
        expect(res1.status).to.equal(500);

        const mockHocuspocusSuccess = {
            openDirectConnection: async () => ({
                document: new Y.Doc(),
                transact: (cb: any) => cb(new Y.Doc()),
                disconnect: async function() {},
            }),
        };
        const appSuccess = express();
        appSuccess.use(express.json());
        appSuccess.use("/api", createDemoRouter(mockHocuspocusSuccess as any));

        const res2 = await request(appSuccess).post("/api/seed-demo").set("cf-connecting-ip", "10.0.0.1").send({
            force: true,
        });
        expect(res2.status).to.equal(200);

        Date.now = originalNow;
    });

    it("de-duplicated request does not consume the cooldown", async function() {
        const app = express();
        app.use(express.json());

        let resolveReset: any;
        const resetPromise = new Promise(resolve => {
            resolveReset = resolve;
        });

        const mockHocuspocus = {
            openDirectConnection: async function() {
                await resetPromise;
                throw new Error("Simulated reset failure");
            },
        };
        app.use("/api", createDemoRouter(mockHocuspocus as any));

        const originalNow = Date.now;
        let currentTime = 2000000;
        Date.now = () => currentTime;

        const req1Promise = request(app).post("/api/seed-demo").set("cf-connecting-ip", "10.0.0.2").send({
            force: true,
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        const req2Promise = request(app).post("/api/seed-demo").set("cf-connecting-ip", "10.0.0.3").send({
            force: true,
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        resolveReset();

        const res1 = await req1Promise;
        expect(res1.status).to.equal(500);

        const res2 = await req2Promise;
        expect(res2.status).to.equal(500);

        const mockHocuspocusSuccess = {
            openDirectConnection: async () => ({
                document: new Y.Doc(),
                transact: (cb: any) => cb(new Y.Doc()),
                disconnect: async function() {},
            }),
        };
        const appSuccess = express();
        appSuccess.use(express.json());
        appSuccess.use("/api", createDemoRouter(mockHocuspocusSuccess as any));

        const res3 = await request(appSuccess).post("/api/seed-demo").set("cf-connecting-ip", "10.0.0.3").send({
            force: true,
        });
        expect(res3.status).to.equal(200);

        Date.now = originalNow;
    });

    it("enforces a global cooldown across different IPs", async function() {
        const app = express();
        app.use(express.json());

        const mockHocuspocus = {
            openDirectConnection: async () => ({
                document: new Y.Doc(),
                transact: (cb: any) => cb(new Y.Doc()),
                disconnect: async function() {},
            }),
        };
        app.use("/api", createDemoRouter(mockHocuspocus as any));

        const originalNow = Date.now;
        let currentTime = 3000000;
        Date.now = () => currentTime;

        const res1 = await request(app).post("/api/seed-demo").set("cf-connecting-ip", "10.0.0.4").send({
            force: true,
        });
        expect(res1.status).to.equal(200);

        const res2 = await request(app).post("/api/seed-demo").set("cf-connecting-ip", "10.0.0.5").send({
            force: true,
        });
        expect(res2.status).to.equal(429);

        Date.now = originalNow;
    });
});
