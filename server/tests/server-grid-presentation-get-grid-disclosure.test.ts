import type { Hocuspocus } from "@hocuspocus/server";
import { expect } from "chai";
import fs from "fs-extra";
import * as Y from "yjs";
import { setGridColumnWidth } from "../../shared/src/services/gridDefinition.js";
import { OutlinerReadService } from "../src/mcp/outliner-read-service.js";
import {
    AclStore,
    deferred,
    rejection,
    startTestServer,
    stopTestServer,
    tempDir,
    type TestServer,
    withRoom,
} from "./server-create-table-fixture.js";
import { Peer, PROJECT, readGridAsClient, seedGridProject } from "./server-grid-presentation-fixture.js";

const UID = "user-1";
const ROOM = `projects/${PROJECT}`;

type RoomHost = Pick<Hocuspocus, "openDirectConnection">;
type OpenConnection = Awaited<ReturnType<RoomHost["openDirectConnection"]>>;

// Issue #5456 REQ-005: an authenticated get_grid read rechecks resource-side
// membership after asynchronous room opening and after connection release,
// immediately before disclosing Grid metadata. A grant revoked (or an ACL
// backend failing) while either await is pending withholds saved widths,
// presentation and revision metadata as forbidden.
describe("get_grid withholds Grid metadata revoked mid-read (#5456 REQ-005)", function() {
    this.timeout(60000);
    let acl: AclStore;
    let server: TestServer;
    let dir: string;

    beforeEach(async () => {
        acl = new AclStore();
        acl.grant("projectUsers", PROJECT, UID);
        dir = tempDir();
        server = await startTestServer(dir, acl);
        expect(process.env.ALLOW_TEST_ACCESS).to.equal("false");
        await seedGridProject(server.hocuspocus);
        const browser = await Peer.connect(server.hocuspocus);
        setGridColumnWidth(browser.grid("grid-tasks"), "title", 180);
        await browser.disconnect();
        expect({ ...(await liveWidths()) }).to.deep.equal({ title: 180 });
        const sanity = await reads().getGrid(UID, PROJECT, "grid-tasks");
        expect((sanity.components as Record<string, Record<string, unknown>>).title?.widthPx).to.equal(180);
    });

    afterEach(async () => {
        await stopTestServer(server);
        await fs.remove(dir);
    });

    const liveWidths = () =>
        withRoom(server.hocuspocus, ROOM, doc => readGridAsClient(Y.encodeStateAsUpdate(doc), "grid-tasks")!.widths);
    const reads = (host?: RoomHost) =>
        new OutlinerReadService(host ?? server.hocuspocus, acl.checkAccess, async () => []);
    const expectWithheld = (error: { code?: string; debug?: Record<string, unknown>; }) => {
        expect(error.code).to.equal("forbidden");
        expect(JSON.stringify(error)).to.not.contain("widthPx");
        expect(JSON.stringify(error)).to.not.contain("presentationRevision");
    };

    /**
     * The production read service over the real Hocuspocus rooms, whose
     * direct connections pause in disconnect() until released: an observable
     * barrier on the actual connection release.
     */
    const heldReleaseHost = () => {
        const releasing = deferred();
        const release = deferred();
        const host: RoomHost = {
            openDirectConnection: (async (...args: Parameters<RoomHost["openDirectConnection"]>) => {
                const connection: OpenConnection = await server.hocuspocus.openDirectConnection(...args);
                const disconnect = connection.disconnect.bind(connection);
                connection.disconnect = (async () => {
                    releasing.resolve();
                    await release.promise;
                    return await disconnect();
                }) as OpenConnection["disconnect"];
                return connection;
            }) as RoomHost["openDirectConnection"],
        };
        return { host, releasing: releasing.promise, release: release.resolve };
    };

    /** The same rooms, but pausing before the direct connection opens. */
    const heldOpenHost = () => {
        const entering = deferred();
        const release = deferred();
        const host: RoomHost = {
            openDirectConnection: (async (...args: Parameters<RoomHost["openDirectConnection"]>) => {
                entering.resolve();
                await release.promise;
                return await server.hocuspocus.openDirectConnection(...args);
            }) as RoomHost["openDirectConnection"],
        };
        return { host, entering: entering.promise, release: release.resolve };
    };

    it("withholds get_grid when the grant is revoked during connection release", async () => {
        const { host, releasing, release } = heldReleaseHost();
        const pending = reads(host).getGrid(UID, PROJECT, "grid-tasks");
        await releasing;
        acl.revokeAll(PROJECT);
        release();
        expectWithheld(await rejection(pending));
    });

    it("withholds get_grid when the grant is revoked during room opening", async () => {
        const { host, entering, release } = heldOpenHost();
        const pending = reads(host).getGrid(UID, PROJECT, "grid-tasks");
        await entering;
        acl.revokeAll(PROJECT);
        release();
        expectWithheld(await rejection(pending));
    });

    it("withholds get_grid when the access backend errors during connection release", async () => {
        const { host, releasing, release } = heldReleaseHost();
        const pending = reads(host).getGrid(UID, PROJECT, "grid-tasks");
        await releasing;
        acl.failing = true;
        release();
        expectWithheld(await rejection(pending));
    });
});
