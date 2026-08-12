/** @feature CLP-4584c0de */
import { expect, test } from "@playwright/test";
import {
    addSourceRecord,
    configureGrid,
    copyGridHosts,
    createBlankGrid,
    openProjectPage,
    pasteAtAnchor,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

const SCHEMA = "CREATE TABLE orders (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n"
    + "  quantity INTEGER,\n  done BOOLEAN\n)";
const QUERY = "SELECT id, title, quantity, done FROM orders";

// The collaboration server; the Vite dev server (and its HMR socket) is on a
// different port and must stay reachable or the page cannot work at all.
const YJS_WS_PORT = new URL(process.env.VITE_YJS_WS_URL ?? "ws://127.0.0.1:7093").port;

// #4864: rows are resolved from the live source, so a source that cannot be
// reached at paste time degrades to a structure-only clone that says why —
// never to a silent empty Grid and never to a failed paste.
test.describe("cross-project Grid paste with an unreachable source", () => {
    test.beforeEach(async ({ page }) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test(
        "an unreachable source produces a structure-only clone with a reason",
        async ({ page }, testInfo) => {
            test.setTimeout(180000);
            // Cut every table room off from the server while leaving the
            // project rooms (and the dev server) reachable. Table subdocs then
            // live purely locally, which is enough to build and read a Grid,
            // but the paste can no longer reach the source table it was asked
            // to copy the rows from. The route is installed before the very
            // first navigation: Playwright injects WebSocket routing at
            // document start, so a later route does not reach a loaded page.
            await page.context().routeWebSocket(
                (url: URL) =>
                    url.port === YJS_WS_PORT
                    && url.pathname.includes("/tables/"),
                () => {
                    // Never connect upstream: table rooms stay silent.
                },
            );
            const fixture = await seedCrossProjectFixture(page, testInfo);

            await createBlankGrid(page, "Orders", "orders");
            await configureGrid(page, 0, SCHEMA, QUERY, "Order title");
            await addSourceRecord(page);
            const sourceTable = (await readGridProjectState(page)).tables[0];
            expect(sourceTable.dataSize).toBe(1);

            await copyGridHosts(page);
            await openProjectPage(page, fixture, "destination");

            await createBlankGrid(page, "Warmup", "warmup_table");
            const warmupTableId = (await readGridProjectState(page)).tables[0].id;

            await pasteAtAnchor(page, 2);

            // The paste says what happened instead of pretending the Grid was empty.
            await expect(page.getByTestId("grid-paste-status")).toContainText("without data", { timeout: 60000 });

            const destinationState = await readGridProjectState(page);
            const clone = destinationState.tables.find(table => table.id !== warmupTableId)!;
            expect(clone).toBeTruthy();
            // Structure still arrived in full; only the rows are missing.
            expect(clone.name).toBe(sourceTable.name);
            expect(clone.schema.replace(/\s+/g, " ")).toBe(sourceTable.schema.replace(/\s+/g, " "));
            expect(clone.dataSize).toBe(0);
            expect(destinationState.hostTableIds).toContain(clone.id);
        },
    );
});
