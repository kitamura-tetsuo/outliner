import { HocuspocusProvider } from "@hocuspocus/provider";
import { expect } from "chai";
import fs from "fs-extra";
import os from "os";
import path from "path";
import sinon from "sinon";
import WebSocket from "ws";
import * as Y from "yjs";
import { loadConfig } from "../src/config.js";
import { demoPages } from "../src/demo-content.js";
import { Project } from "../src/schema/app-schema.js";
import { startServer } from "../src/server.js";

// @ts-ignore
global.WebSocket = WebSocket;

// Regression coverage for the @hocuspocus/server 3.x -> 4.x upgrade.
// 4.x changed DirectConnection.transact() to run its callback inside a single
// Yjs transaction. yjs-orderedtree relies on its observeDeep handler firing
// between successive tree mutations to refresh its internal computedMap, so
// batching addPage/addNode (createNode + setNodeOrderToEnd) into one transaction
// left freshly created nodes missing from that map and made every seed throw
// "Cannot read properties of undefined (reading 'parent')". The demo and seed
// routers now apply tree mutations directly on the live document, restoring the
// 3.x behaviour. This exercises the real openDirectConnection path end-to-end —
// the existing seed-api-validation test stubs openDirectConnection, so it never
// caught this.
describe("Seed via Hocuspocus direct connection (4.x regression)", () => {
    let httpServer: any;
    let provider: HocuspocusProvider | undefined;
    let port: number;
    let shutdown: () => Promise<void>;
    let dbDir: string;

    beforeEach(async () => {
        dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-direct-"));
        const config = loadConfig({ PORT: "0", LOG_LEVEL: "silent", DATABASE_PATH: dbDir });
        const res = await startServer(config, undefined, {
            checkContainerAccess: sinon.stub().resolves(true),
            verifyIdTokenCached: sinon.stub().resolves({ uid: "test-uid" } as any),
        });
        httpServer = res.server;
        shutdown = res.shutdown;

        await new Promise<void>(resolve => {
            if (httpServer.listening) resolve();
            else httpServer.on("listening", resolve);
        });
        port = (httpServer.address() as any).port;
        // Allow SQLite persistence to initialize.
        await new Promise(r => setTimeout(r, 300));
    });

    afterEach(async () => {
        provider?.destroy();
        provider = undefined;
        if (shutdown) await shutdown();
        sinon.restore();
        await fs.remove(dbDir);
    });

    it("seeds the demo project without YTree errors and a client syncs the populated tree", async () => {
        const res = await fetch(`http://127.0.0.1:${port}/api/seed-demo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ force: true }),
        });
        expect(res.status).to.equal(200);
        const body = await res.json() as { success: boolean; reset: boolean; };
        expect(body.success).to.equal(true);
        expect(body.reset).to.equal(true);

        // A client connecting to the public demo room must sync the populated
        // tree, with one top-level page per template entry in order.
        provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/projects/demo?token=1`,
            name: "projects/demo",
            document: new Y.Doc(),
            token: "1",
        });

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Timed out waiting for sync")), 8000);
            provider!.on("synced", () => {
                clearTimeout(timeout);
                resolve();
            });
        });

        const project = Project.fromDoc(provider.document);
        const items = project.items;
        const pageTitles: string[] = [];
        for (let i = 0; i < items.length; i++) {
            const page = items.at(i);
            if (page) pageTitles.push(page.text);
        }
        expect(pageTitles).to.deep.equal(demoPages.map(p => p.title));
    });

    // Repeated forced resets while a viewer keeps the demo document live in memory.
    // This used to fail on the second reset with
    // "Cannot read properties of undefined (reading 'entries')": a stale YTree
    // observeDeep handler from an earlier Project.fromDoc() fired during the
    // non-transactional root re-creation. The doc would then be stuck at size 1
    // (root only), so every following reset failed too.
    it("survives repeated forced resets with a viewer connected", async () => {
        const forceReset = async () => {
            const res = await fetch(`http://127.0.0.1:${port}/api/seed-demo`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ force: true }),
            });
            return { status: res.status, body: await res.json() as { success: boolean; reset: boolean; } };
        };

        // Seed once, then connect a viewer so the document stays loaded in memory.
        await forceReset();
        provider = new HocuspocusProvider({
            url: `ws://127.0.0.1:${port}/projects/demo?token=1`,
            name: "projects/demo",
            document: new Y.Doc(),
            token: "1",
        });
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Timed out waiting for sync")), 8000);
            provider!.on("synced", () => {
                clearTimeout(timeout);
                resolve();
            });
        });

        // Every forced reset must succeed, not just the first.
        for (let i = 0; i < 3; i++) {
            const { status, body } = await forceReset();
            expect(status, `reset ${i} status`).to.equal(200);
            expect(body.success, `reset ${i} success`).to.equal(true);
            expect(body.reset, `reset ${i} reset`).to.equal(true);
        }

        // The viewer must still see the full template after the resets.
        await new Promise(r => setTimeout(r, 1000));
        const items = Project.fromDoc(provider.document).items;
        expect(items.length).to.equal(demoPages.length);
    });
});
