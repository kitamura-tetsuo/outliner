import { expect } from "chai";
import express from "express";
import request from "supertest";
import * as Y from "yjs";
import { createDemoRouter } from "../src/demo-api.js";
import { DEMO_PROJECT_TITLE, DEMO_TEMPLATE_REVISION, demoPages, populateDemoProject } from "../src/demo-content.js";
import { Project } from "../src/schema/app-schema.js";

describe("Demo rename template trigger", () => {
    it("reports missing template page when a template page is renamed", async () => {
        const app = express();
        app.use(express.json());

        const ydoc = new Y.Doc();
        ydoc.getMap("orderedTree");
        const meta = ydoc.getMap("metadata");
        meta.set("title", DEMO_PROJECT_TITLE);
        meta.set("templateRevision", DEMO_TEMPLATE_REVISION);
        meta.set("lastReset", Date.now()); // recent reset

        const project = Project.fromDoc(ydoc);
        populateDemoProject(project, "seed-server");

        const mockHocuspocus = {
            openDirectConnection: async () => ({
                document: ydoc,
                transact: (cb: any) => cb(ydoc),
                disconnect: async () => {},
            }),
        };
        app.use("/api", createDemoRouter(mockHocuspocus as any));

        // First call should not reset because it is fresh and not renamed
        const res1 = await request(app).post("/api/seed-demo").send({});
        expect(res1.body.reset).to.equal(false);

        // Rename the first template page
        const firstPageTitle = demoPages[0].title;
        const rootItems = project.items;
        expect(rootItems).to.exist;
        let found = false;
        if (rootItems) {
            for (let i = 0; i < rootItems.length; i++) {
                const item = rootItems.at(i);
                if (item && item.text === firstPageTitle) {
                    item.text = firstPageTitle + "/";
                    found = true;
                    break;
                }
            }
        }
        expect(found).to.equal(true);

        // Second call should reset because of the renamed page
        const res2 = await request(app).post("/api/seed-demo").send({});
        expect(res2.body.reset).to.equal(true);
    });
});
