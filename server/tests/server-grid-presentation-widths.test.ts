import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import { getGridColumnWidth, setGridColumnWidth } from "../../shared/src/services/gridDefinition.js";
import { createDocumentStore } from "../src/persistence.js";
import {
    AclStore,
    restartFromStorage,
    startTestServer,
    stopTestServer,
    tempDir,
    type TestServer,
    withRoom,
} from "./server-create-table-fixture.js";
import {
    Peer,
    PROJECT,
    readGridAsClient,
    readStoredGridAsClient,
    seedGridProject,
} from "./server-grid-presentation-fixture.js";

const UID = "user-1";

// Issue #5455 AS-004: saved column widths travel through production
// persistence. Widths are written with the browser's normal shared writers on
// a live peer, acknowledged through the production SQLite store, and read
// back after a restart from exactly that storage — with no reuse of the old
// in-memory document — through fresh normal readers.
describe("Grid column widths survive a production persistence restart (#5455 AS-004)", function() {
    this.timeout(60000);
    const dirs: string[] = [];
    const servers: TestServer[] = [];
    let acl: AclStore;
    let server: TestServer;
    let dir: string;

    beforeEach(async () => {
        acl = new AclStore();
        acl.grant("projectUsers", PROJECT, UID);
        dir = tempDir();
        dirs.push(dir);
        server = await startTestServer(dir, acl);
        servers.push(server);
        await seedGridProject(server.hocuspocus);
    });

    afterEach(async () => {
        for (const s of servers.splice(0)) await stopTestServer(s);
        for (const d of dirs.splice(0)) await fs.remove(d);
    });

    it("restores boundary, dormant, special-name and independent widths from restarted storage", async () => {
        // A browser peer edits widths with the normal shared writers.
        const browser = await Peer.connect(server.hocuspocus);
        setGridColumnWidth(browser.grid("grid-tasks"), "title", 180);
        setGridColumnWidth(browser.grid("grid-tasks"), "done", 32);
        setGridColumnWidth(browser.grid("grid-tasks"), "due_date", 4096);
        // Dormant preference: "ghost" is not projected by the stored query.
        setGridColumnWidth(browser.grid("grid-tasks"), "ghost", 64);
        // Exact result-column names, including literal special-property names.
        setGridColumnWidth(browser.grid("grid-tasks"), "__proto__", 100);
        setGridColumnWidth(browser.grid("grid-tasks"), "a.b", 120);
        setGridColumnWidth(browser.grid("grid-tasks"), "constructor", 140);
        expect(getGridColumnWidth(browser.grid("grid-tasks"), "title")).to.equal(180);
        await browser.disconnect();

        // Acknowledge the live room through the production store, then close
        // the old server so the restart below loads storage only.
        await withRoom(server.hocuspocus, `projects/${PROJECT}`, async doc => {
            await createDocumentStore(server.persistence!)(`projects/${PROJECT}`, doc);
        });
        await stopTestServer(servers.pop());
        const restarted = await restartFromStorage(dir, acl);
        dirs.push(restarted.dir);
        servers.push(restarted.server);

        // A fresh normal reader of the restarted room sees every width.
        const reread = await withRoom(
            restarted.server.hocuspocus,
            `projects/${PROJECT}`,
            doc => readGridAsClient(Y.encodeStateAsUpdate(doc), "grid-tasks")!,
        );
        expect(reread.widths["title"]).to.equal(180);
        expect(reread.widths["done"]).to.equal(32);
        expect(reread.widths["due_date"]).to.equal(4096);
        expect(reread.widths["ghost"]).to.equal(64);
        expect(reread.widths["__proto__"]).to.equal(100);
        expect(reread.widths["a.b"]).to.equal(120);
        expect(reread.widths["constructor"]).to.equal(140);
        expect(reread.widths["id"]).to.equal(undefined);
        expect(Object.keys(reread.widths)).to.have.length(7);
        // Retaining dormant preferences never fabricated a query projection.
        expect(reread.query).to.equal("SELECT id, title, due_date, done FROM tasks");

        // The separate Grid over the same Table remains independent.
        const separate = await withRoom(
            restarted.server.hocuspocus,
            `projects/${PROJECT}`,
            doc => readGridAsClient(Y.encodeStateAsUpdate(doc), "grid-separate")!,
        );
        expect(Object.keys(separate.widths)).to.have.length(0);
        expect(separate.query).to.equal("SELECT id, title, due_date, done FROM tasks");

        // An independent storage-only client reads the same widths. `dir`
        // holds the acknowledged database with no server running on it (the
        // old server was stopped and the restarted one runs on a copy), so
        // this opens no SQLite file twice.
        const stored = await readStoredGridAsClient(dir, "grid-tasks");
        expect(stored!.widths["title"]).to.equal(180);
        expect(stored!.widths["done"]).to.equal(32);
        expect(stored!.widths["due_date"]).to.equal(4096);
        expect(stored!.widths["ghost"]).to.equal(64);
        expect(stored!.widths["__proto__"]).to.equal(100);
    });
});
