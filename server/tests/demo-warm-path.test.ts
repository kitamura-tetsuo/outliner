import { jest } from "@jest/globals";
import { expect } from "chai";
import express from "express";
import sinon from "sinon";
import request from "supertest";
import * as Y from "yjs";
import { createDemoRouter, resetDemoWarmState } from "../src/demo-api.js";
import { DEMO_PROJECT_TITLE, DEMO_TEMPLATE_VERSION, demoPages, populateDemoProject } from "../src/demo-content.js";
import { Project } from "../src/schema/app-schema.js";

// FTR-7d3e9a1c / issue #4636: a warm visit to /demo must not pay for opening
// the shared document, scanning the ordered tree and disconnecting again. The
// server answers such visits from a verdict that is invalidated as soon as the
// document changes.
describe("Demo warm-path validation", function() {
    jest.setTimeout(10000);

    function seededDoc(lastReset = Date.now()): Y.Doc {
        const ydoc = new Y.Doc();
        ydoc.getMap("orderedTree");
        const meta = ydoc.getMap("metadata");
        meta.set("title", DEMO_PROJECT_TITLE);
        meta.set("templateVersion", DEMO_TEMPLATE_VERSION);
        meta.set("lastReset", lastReset);
        populateDemoProject(Project.fromDoc(ydoc), "seed-server");
        return ydoc;
    }

    function appFor(ydoc: Y.Doc) {
        const openDirectConnection = sinon.stub().callsFake(async () => ({
            document: ydoc,
            transact: (cb: (doc: Y.Doc) => void) => cb(ydoc),
            disconnect: async function() {},
        }));
        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter({ openDirectConnection } as never, {} as never));
        // A reset also opens one room per demo table; only project-room opens
        // measure what a visit costs before the browser may connect.
        const projectOpens = () =>
            openDirectConnection.getCalls().filter(call => call.args[0] === "projects/demo").length;
        return { app, openDirectConnection, projectOpens };
    }

    beforeEach(function() {
        resetDemoWarmState();
    });

    afterEach(function() {
        resetDemoWarmState();
        sinon.restore();
    });

    it("answers a warm second visit without opening the document", async function() {
        const ydoc = seededDoc();
        const { app, projectOpens } = appFor(ydoc);

        const first = await request(app).post("/api/seed-demo").send({});
        expect(first.body.reset).to.equal(false);
        expect(first.body.warm).to.equal(undefined);
        expect(projectOpens()).to.equal(1);

        const second = await request(app).post("/api/seed-demo").send({});
        expect(second.body.reset).to.equal(false);
        expect(second.body.warm).to.equal(true);
        expect(projectOpens()).to.equal(1);
    });

    it("revalidates after the demo document changed", async function() {
        const ydoc = seededDoc();
        const { app, projectOpens } = appFor(ydoc);

        await request(app).post("/api/seed-demo").send({});
        expect(projectOpens()).to.equal(1);

        // A visitor edits the demo: the warm verdict is no longer authoritative.
        const project = Project.fromDoc(ydoc);
        const firstPage = project.items?.at(0);
        expect(firstPage).to.exist;
        firstPage!.text = demoPages[0].title + " (edited)";

        const second = await request(app).post("/api/seed-demo").send({});
        expect(second.body.warm).to.equal(undefined);
        expect(projectOpens()).to.equal(2);
        // The renamed template page must still trigger a repair reset.
        expect(second.body.reset).to.equal(true);
    });

    it("revalidates after the document was unloaded from memory", async function() {
        const ydoc = seededDoc();
        const { app, projectOpens } = appFor(ydoc);

        await request(app).post("/api/seed-demo").send({});
        expect(projectOpens()).to.equal(1);

        // Hocuspocus destroys the Y.Doc when the last connection goes away.
        ydoc.destroy();

        const reloaded = seededDoc();
        const second = appFor(reloaded);
        await request(second.app).post("/api/seed-demo").send({});
        expect(second.projectOpens()).to.equal(1);
    });

    it("does not keep the warm verdict past the 24h reset boundary", async function() {
        const lastReset = Date.now();
        const ydoc = seededDoc(lastReset);
        const { app, projectOpens } = appFor(ydoc);

        await request(app).post("/api/seed-demo").send({});
        expect(projectOpens()).to.equal(1);

        const clock = sinon.stub(Date, "now").returns(lastReset + 24 * 60 * 60 * 1000 + 1);
        try {
            const second = await request(app).post("/api/seed-demo").send({});
            expect(second.body.warm).to.equal(undefined);
            expect(projectOpens()).to.equal(2);
            expect(second.body.reset).to.equal(true);
        } finally {
            clock.restore();
        }
    });

    it("never serves a forced reset from the warm path", async function() {
        const ydoc = seededDoc();
        const { app, projectOpens } = appFor(ydoc);

        await request(app).post("/api/seed-demo").send({});
        expect(projectOpens()).to.equal(1);

        const forced = await request(app).post("/api/seed-demo").set("cf-connecting-ip", "10.1.0.7").send({
            force: true,
        });
        expect(forced.status).to.equal(200);
        expect(forced.body.reset).to.equal(true);
        expect(projectOpens()).to.equal(2);
    });

    it("joins an in-flight forced reset instead of answering from the warm verdict", async function() {
        const ydoc = seededDoc();
        // Move past the global force-reset cooldown left behind by earlier
        // force tests in this process.
        const pastCooldown = Date.now() + 10 * 60 * 1000;
        const clock = sinon.stub(Date, "now").returns(pastCooldown);
        let release: () => void = function() {};
        const gate = new Promise<void>(resolve => {
            release = resolve;
        });

        const openDirectConnection = sinon.stub().callsFake(async (room: string) => {
            if (room === "projects/demo") await gate;
            return {
                document: ydoc,
                transact: (cb: (doc: Y.Doc) => void) => cb(ydoc),
                disconnect: async function() {},
            };
        });
        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter({ openDirectConnection } as never, {} as never));

        // Warm the verdict first (this request is not gated for the very first
        // open because the gate only blocks until released below).
        release();
        await request(app).post("/api/seed-demo").send({});

        // Now block the next open and start a forced reset.
        const secondGate = new Promise<void>(resolve => {
            release = resolve;
        });
        openDirectConnection.callsFake(async (room: string) => {
            if (room === "projects/demo") await secondGate;
            return {
                document: ydoc,
                transact: (cb: (doc: Y.Doc) => void) => cb(ydoc),
                disconnect: async function() {},
            };
        });

        const forced = request(app).post("/api/seed-demo").set("cf-connecting-ip", "10.1.0.9").send({ force: true })
            .then(res => res);
        await new Promise(resolve => setTimeout(resolve, 50));
        // A warm visitor arriving mid-reset must not be told "nothing happened".
        const warmVisitor = request(app).post("/api/seed-demo").send({}).then(res => res);
        await new Promise(resolve => setTimeout(resolve, 50));
        release();

        const forcedRes = await forced;
        const warmRes = await warmVisitor;

        clock.restore();

        expect(forcedRes.status, JSON.stringify(forcedRes.body)).to.equal(200);
        expect(forcedRes.body.reset).to.equal(true);
        expect(warmRes.body.warm).to.equal(undefined);
        expect(warmRes.body.reset).to.equal(true);
    });

    it("tells a coalesced concurrent visitor that the document was reset", async function() {
        // A stale document forces a reset; a second visitor arrives while it runs.
        const ydoc = seededDoc(Date.now() - 25 * 60 * 60 * 1000);
        let release: () => void = function() {};
        const gate = new Promise<void>(resolve => {
            release = resolve;
        });

        const openDirectConnection = sinon.stub().callsFake(async (room: string) => {
            if (room.endsWith("/demo")) await gate;
            return {
                document: ydoc,
                transact: (cb: (doc: Y.Doc) => void) => cb(ydoc),
                disconnect: async function() {},
            };
        });
        const app = express();
        app.use(express.json());
        app.use("/api", createDemoRouter({ openDirectConnection } as never, {} as never));

        // .then() dispatches the request; supertest is lazy otherwise.
        const first = request(app).post("/api/seed-demo").send({}).then(res => res);
        await new Promise(resolve => setTimeout(resolve, 50));
        const second = request(app).post("/api/seed-demo").send({}).then(res => res);
        await new Promise(resolve => setTimeout(resolve, 50));
        release();

        const firstRes = await first;
        const secondRes = await second;

        expect(firstRes.body.reset).to.equal(true);
        expect(secondRes.body.coalesced).to.equal(true);
        expect(secondRes.body.reset).to.equal(true);
    });
});
