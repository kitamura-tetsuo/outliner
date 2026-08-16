import { expect } from "chai";
import express from "express";
import request from "supertest";
import * as Y from "yjs";
import { createDemoRouter, isDemoWarm, resetDemoWarmState } from "../src/demo-api.js";
import { DEMO_PROJECTS } from "../src/demo-projects.js";

// The demo API's per-room state (warm verdict, fast path, force cooldowns) used
// to be module-level singletons. With one demo project per locale they became
// maps, and these are the regressions that conversion exists to prevent:
// nothing about `/demo` may leak into `/demo-ja` or vice versa.

function makeApp(hocuspocus: unknown) {
    const app = express();
    app.use(express.json());
    app.use("/api", createDemoRouter(hocuspocus as never, undefined as never));
    return app;
}

function stubHocuspocus() {
    const opened: string[] = [];
    return {
        opened,
        openDirectConnection: async (room: string) => {
            opened.push(room);
            return {
                document: new Y.Doc(),
                transact: (cb: (doc: Y.Doc) => void) => cb(new Y.Doc()),
                disconnect: async () => {},
            };
        },
    };
}

describe("Demo seeding project isolation", () => {
    beforeEach(() => {
        resetDemoWarmState();
    });

    it("defaults to the English demo when the request names no project", () => {
        // Clients deployed before the multilingual demo send `{ force }` only.
        const hocuspocus = stubHocuspocus();
        return request(makeApp(hocuspocus)).post("/api/seed-demo").send({}).expect(200).then(res => {
            expect(res.body.project).to.equal("demo");
            expect(hocuspocus.opened[0]).to.equal("projects/demo");
        });
    });

    it("rejects an unregistered project without opening any room", async () => {
        // This endpoint is unauthenticated: an unchecked project name would let
        // any caller open and rewrite an arbitrary Hocuspocus room.
        for (const project of ["demo-xx", "demonstration", "../secrets", "projects/demo", ""]) {
            const hocuspocus = stubHocuspocus();
            const res = await request(makeApp(hocuspocus)).post("/api/seed-demo").send({ project });
            expect(res.status, `project=${JSON.stringify(project)}`).to.equal(400);
            expect(hocuspocus.opened, `project=${JSON.stringify(project)} opened a room`).to.deep.equal([]);
        }
    });

    it("seeds the room named by the request, not a fixed one", async () => {
        for (const { slug } of DEMO_PROJECTS) {
            const hocuspocus = stubHocuspocus();
            const res = await request(makeApp(hocuspocus)).post("/api/seed-demo").send({ project: slug });
            expect(res.status, slug).to.equal(200);
            expect(res.body.project, slug).to.equal(slug);
            expect(hocuspocus.opened[0], slug).to.equal(`projects/${slug}`);
        }
    });

    it("keeps a warm verdict from leaking between demo projects", async () => {
        const hocuspocus = stubHocuspocus();
        const app = makeApp(hocuspocus);

        // Seeding an empty document resets it, which leaves that room warm.
        await request(app).post("/api/seed-demo").send({ project: "demo" }).expect(200);
        expect(isDemoWarm("projects/demo", Date.now()), "demo is warm after seeding").to.be.true;
        expect(isDemoWarm("projects/demo-ja", Date.now()), "demo-ja is unaffected").to.be.false;

        // Clearing the other locale must not disturb it...
        resetDemoWarmState("projects/demo-ja");
        expect(isDemoWarm("projects/demo", Date.now()), "demo stayed warm").to.be.true;

        // ...while clearing its own room does.
        resetDemoWarmState("projects/demo");
        expect(isDemoWarm("projects/demo", Date.now()), "demo went cold").to.be.false;
    });

    it("seeds each demo project's table rooms under its own project segment", async () => {
        for (const { slug } of DEMO_PROJECTS) {
            const hocuspocus = stubHocuspocus();
            await request(makeApp(hocuspocus)).post("/api/seed-demo").send({ project: slug }).expect(200);

            const tableRooms = hocuspocus.opened.filter(room => room.includes("/tables/"));
            expect(tableRooms.length, slug).to.be.greaterThan(0);
            for (const room of tableRooms) {
                // Table ids are shared across locales; the rooms must not be.
                expect(room, `${room} is not namespaced by its project`).to.match(
                    new RegExp(`^projects/${slug}/tables/[A-Za-z0-9_-]+$`),
                );
            }
        }
    });
});
