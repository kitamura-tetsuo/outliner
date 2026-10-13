/** @feature SQL-9e5578a1: catalog draft and history failures cross production boundaries. */
import "../utils/registerAfterEachSnapshot";
import { type BrowserContext } from "@playwright/test";
import { expect, test } from "../fixtures/grid-render-trace";
import { freshCatalogRoute } from "../utils/catalogBrowserRoutes";
import { CatalogBrowserServer, type CatalogSnapshot } from "../utils/catalogBrowserServer";
import { authorCatalogFixture, navigateCatalog } from "../utils/catalogBrowserUi";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";

registerCoverageHooks();

const ORIGINAL_SOURCE = "CREATE TYPE priority_level AS ENUM ('high','medium','low')";
const CANCELLED_SOURCE = "CREATE TYPE priority_level AS ENUM ('cancelled','high','medium','low')";
const REFERENCED_SOURCE = "CREATE TYPE priority_level AS ENUM ('high','medium','low','urgent')";
const FAILED_SOURCE = "CREATE TYPE priority_level AS ENUM ('high','medium','low','urgent','offline')";
const PEER_SOURCE = "CREATE TYPE priority_level AS ENUM ('low','medium','high','urgent','peer')";
const LOCAL_DRAFT = "CREATE TYPE priority_level AS ENUM ('high','medium','low','urgent','local')";

test("real catalog drafts survive cancellation, failure, peer replacement and refused Undo", async ({
    browser,
    page,
}, info) => {
    test.setTimeout(600_000);
    const server = await CatalogBrowserServer.start(info);
    const contexts: BrowserContext[] = [];
    try {
        // Real management UI setup also creates an ordinary dependent Table.
        const fixture = await authorCatalogFixture(page, server, info);
        const key = { projectId: fixture.projectId, tableId: fixture.tableId };
        const typesUrl = `${fixture.base}/-/types`;
        await navigateCatalog(page, typesUrl);
        await page.getByTestId("sql-catalog-item").click();
        const editor = SqlEditorHelper.byTestId(page, "sql-catalog-editor");

        // Cancel discards only the draft and leaves source/history intact.
        await page.getByTestId("sql-catalog-edit").click();
        await editor.waitForReady();
        await editor.setValue(page, CANCELLED_SOURCE);
        await expect(page.getByTestId("sql-catalog-draft-status")).toContainText("Unsaved draft");
        await page.getByTestId("sql-catalog-cancel").click();
        await expect(page.getByTestId("sql-catalog-draft-status")).toContainText("No unsaved draft");
        expect(await editor.value()).toBe(ORIGINAL_SOURCE);
        let persisted = await server.request<CatalogSnapshot>("snapshot", key);
        expect(persisted.project!.catalog.snapshot.objects[0].source).toBe(ORIGINAL_SOURCE);

        // Add a label through the catalog UI, then use it through the ordinary
        // Table UI. Returning to Types destroys the Table's local undo scope,
        // leaving this confirmed catalog edit as the latest history entry.
        await page.getByTestId("sql-catalog-edit").click();
        await editor.waitForReady();
        await editor.setValue(page, REFERENCED_SOURCE);
        await page.getByTestId("sql-catalog-save").click();
        await expect(page.getByTestId("sql-catalog-mutation-info")).toHaveText("Saved.");
        await navigateCatalog(page, `${fixture.base}/-/tables/${fixture.tableId}`);
        const referencedRecord = page.locator('td[data-col="state"] select').first();
        const referencedRecordId = await referencedRecord.locator("xpath=ancestor::tr").getAttribute("data-record-id");
        expect(referencedRecordId).toBeTruthy();
        await referencedRecord.selectOption("urgent");
        await expect.poll(() =>
            page.evaluate(
                ({ tableId, recordId }) =>
                    (globalThis as any).__catalogBrowserTest.snapshot(tableId).records[recordId!].state,
                { tableId: fixture.tableId, recordId: referencedRecordId },
            )
        ).toBe("urgent");
        await navigateCatalog(page, typesUrl);
        await page.getByTestId("sql-catalog-item").click();

        // Undoing the label addition is refused because a real Table record
        // uses it. The refusal neither consumes history nor enables Redo.
        persisted = await server.request<CatalogSnapshot>("snapshot", key);
        const revisionBeforeUndo = persisted.project!.catalog.snapshot.revision;
        await expect(page.getByTestId("sql-catalog-undo")).toBeEnabled();
        await page.getByTestId("sql-catalog-undo").click();
        await expect(page.getByTestId("sql-catalog-history-status")).toContainText("History refused");
        await expect(page.getByTestId("sql-catalog-undo")).toBeEnabled();
        await expect(page.getByTestId("sql-catalog-redo")).toBeDisabled();
        persisted = await server.request<CatalogSnapshot>("snapshot", key);
        expect(persisted.project!.catalog.snapshot.revision).toBe(revisionBeforeUndo);
        expect(persisted.project!.catalog.snapshot.objects[0].source).toBe(REFERENCED_SOURCE);

        // Interrupt exactly one real Apply response. This is a transport
        // failure, not a mocked successful compiler or service result.
        await page.getByTestId("sql-catalog-edit").click();
        await editor.waitForReady();
        await editor.setValue(page, FAILED_SOURCE);
        await page.route("**/api/sql-catalog/apply", route => route.abort("connectionfailed"), { times: 1 });
        await page.getByTestId("sql-catalog-save").click();
        await expect(page.getByTestId("sql-catalog-unconfirmed")).toContainText("Not confirmed");
        expect(await editor.value()).toBe(FAILED_SOURCE);
        await expect(page.getByTestId("sql-catalog-undo")).toBeEnabled();
        await expect(page.getByTestId("sql-catalog-redo")).toBeDisabled();
        expect((await server.request<CatalogSnapshot>("snapshot", key)).project!.catalog.snapshot.revision)
            .toBe(revisionBeforeUndo);
        await page.getByTestId("sql-catalog-cancel").click();

        // A separately authenticated browser replaces the declaration through
        // the mounted production UI while this browser holds an exact draft.
        await page.getByTestId("sql-catalog-edit").click();
        await editor.waitForReady();
        await editor.setValue(page, LOCAL_DRAFT);
        const peer = await freshCatalogRoute(browser, server.port, typesUrl);
        contexts.push(peer.context);
        await peer.page.getByTestId("sql-catalog-item").click();
        await peer.page.getByTestId("sql-catalog-edit").click();
        const peerEditor = SqlEditorHelper.byTestId(peer.page, "sql-catalog-editor");
        await peerEditor.waitForReady();
        await peerEditor.setValue(peer.page, PEER_SOURCE);
        await peer.page.getByTestId("sql-catalog-save").click();
        await expect(peer.page.getByTestId("sql-catalog-mutation-info")).toHaveText("Saved.");

        await expect(page.getByTestId("sql-catalog-conflict")).toContainText("Conflict");
        await expect(page.getByTestId("sql-catalog-conflict")).toContainText(revisionBeforeUndo.slice(0, 12));
        expect(await editor.value()).toBe(LOCAL_DRAFT);
        await page.getByTestId("sql-catalog-save").click();
        await expect(page.getByTestId("sql-catalog-mutation-error")).toContainText("stale");
        await expect(page.getByTestId("sql-catalog-conflict")).toContainText("Draft preserved");
        expect(await editor.value()).toBe(LOCAL_DRAFT);
        persisted = await server.request<CatalogSnapshot>("snapshot", key);
        expect(persisted.project!.catalog.snapshot.objects[0].source).toBe(PEER_SOURCE);
        await expect(page.getByTestId("sql-catalog-undo")).toBeEnabled();
        await expect(page.getByTestId("sql-catalog-redo")).toBeDisabled();
    } finally {
        for (const context of contexts) await context.close();
        await server.close();
    }
});
