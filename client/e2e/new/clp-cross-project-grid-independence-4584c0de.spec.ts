/** @feature CLP-4584c0de */
import { expect, test } from "@playwright/test";
import {
    clickItemAndWaitForCursor,
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

const SOURCE_SCHEMA =
    "CREATE TABLE contacts (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  quantity INTEGER,\n  done BOOLEAN\n)";
const SOURCE_QUERY = "SELECT id, title, quantity, done FROM contacts";
const EDITED_SOURCE_SCHEMA =
    "CREATE TABLE contacts (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  quantity INTEGER,\n  done BOOLEAN,\n  notes TEXT\n)";
const EDITED_DESTINATION_QUERY = "SELECT id, title, done FROM contacts";

// #4816: after a cross-project Grid clone, the source and destination tables
// must be independent Y.Docs — an edit made to one side's schema/UI after
// paste must never be observed on the other side. A later, separate paste
// operation must also mint a brand new clone rather than reusing the first.
test.describe("cross-project Grid clone independence", () => {
    test.beforeEach(async ({ page }) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("post-paste schema/UI edits on either side do not leak to the other", async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedCrossProjectFixture(page, testInfo);

        await createBlankGrid(page, "Contacts", "contacts");
        await configureGrid(page, 0, SOURCE_SCHEMA, SOURCE_QUERY, "Contact title");
        await copyGridHosts(page);

        await openProjectPage(page, fixture, "destination");

        // Warm up the destination page with an unrelated Grid first — the very
        // first Database interaction right after an SPA navigation is
        // unreliable for the native Ctrl+V clipboard event in this
        // environment (see clp-cross-project-grid-structure-4584c0de.spec.ts).
        await createBlankGrid(page, "Warmup", "warmup_table");
        const warmupState = await readGridProjectState(page);
        expect(warmupState.tables).toHaveLength(1);
        const warmupTableId = warmupState.tables[0].id;

        await pasteAtAnchor(page, 2);
        const afterPaste = await readGridProjectState(page);
        expect(afterPaste.tables).toHaveLength(2);
        const clonedTableId = afterPaste.tables.find(t => t.id !== warmupTableId)!.id;

        // Edit the destination clone's schema and query after paste.
        const destinationView = page.getByTestId("yjs-table-view").filter({
            has: page.locator("th", { hasText: "Contact title" }),
        });
        await destinationView.getByTestId("yjs-table-toggle-ui").click();
        const destinationQueryInput = destinationView.getByTestId("yjs-table-query-input");
        await destinationQueryInput.fill(EDITED_DESTINATION_QUERY);
        await destinationQueryInput.press("Tab");
        await expect(destinationView.getByTestId("yjs-table-grid").locator("th", { hasText: "quantity" })).toHaveCount(
            0,
            { timeout: 15000 },
        );

        // Go back to the source and edit its schema too (adding a "notes"
        // column the copy-time snapshot never had).
        await openProjectPage(page, fixture, "source");
        const sourceViewBeforeEdit = page.getByTestId("yjs-table-view").first();
        const sourceSchemaInput = sourceViewBeforeEdit.getByTestId("yjs-table-schema-input");
        if (!await sourceSchemaInput.isVisible().catch(() => false)) {
            await sourceViewBeforeEdit.getByTestId("yjs-table-toggle-schema").click();
        }
        await sourceSchemaInput.fill(EDITED_SOURCE_SCHEMA);
        await sourceViewBeforeEdit.getByTestId("yjs-table-schema-apply").click();
        const sourceWarning = sourceViewBeforeEdit.getByTestId("yjs-table-schema-warning");
        if (await sourceWarning.isVisible().catch(() => false)) {
            await sourceViewBeforeEdit.getByTestId("yjs-table-schema-confirm").click();
        }
        await expect(sourceSchemaInput).toHaveValue(EDITED_SOURCE_SCHEMA, { timeout: 30000 });
        const sourceStateAfterEdit = await readGridProjectState(page);
        expect(sourceStateAfterEdit.tables).toHaveLength(1);
        // The source's own schema now includes "notes"; the clone's copy from
        // paste time must be unaffected.
        expect(sourceStateAfterEdit.tables[0].schema).toContain("notes");

        // Return to the destination: its schema must still be the pre-edit
        // clone (no "notes"), and its query edit must still be in place —
        // neither direction of change crossed the project boundary.
        await openProjectPage(page, fixture, "destination");
        const destinationStateAfter = await readGridProjectState(page);
        const destinationTable = destinationStateAfter.tables.find(t => t.id === clonedTableId)!;
        expect(destinationTable).toBeTruthy();
        expect(destinationTable.schema).not.toContain("notes");
        expect(destinationTable.ui.query).toBe(EDITED_DESTINATION_QUERY);
        const clonedViewAfter = page.getByTestId("yjs-table-view").filter({
            has: page.locator("th", { hasText: "Contact title" }),
        });
        await expect(clonedViewAfter.getByTestId("yjs-table-grid").locator("th", { hasText: "quantity" }))
            .toHaveCount(0);
    });

    test("a later, separate paste operation creates another independent clone", async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedCrossProjectFixture(page, testInfo);

        await createBlankGrid(page, "Contacts", "contacts");
        await configureGrid(page, 0, SOURCE_SCHEMA, SOURCE_QUERY, "Contact title");
        await copyGridHosts(page);

        await openProjectPage(page, fixture, "destination");

        // Warm up the destination page with an unrelated Grid first — the very
        // first Database interaction right after an SPA navigation is
        // unreliable for the native Ctrl+V clipboard event in this
        // environment (see clp-cross-project-grid-structure-4584c0de.spec.ts).
        await createBlankGrid(page, "Warmup", "warmup_table");
        const warmupState = await readGridProjectState(page);
        expect(warmupState.tables).toHaveLength(1);
        const warmupTableId = warmupState.tables[0].id;

        await pasteAtAnchor(page, 2);
        const afterFirstPaste = await readGridProjectState(page);
        expect(afterFirstPaste.tables).toHaveLength(2);
        const firstClone = afterFirstPaste.tables.find(t => t.id !== warmupTableId)!;
        const firstCloneId = firstClone.id;
        const firstCloneGuid = firstClone.guid;

        // Paste the same clipboard content again in a second, separate paste
        // operation. This must not reuse the first clone.
        await clickItemAndWaitForCursor(
            page,
            page.locator(".outliner-item[data-item-id]").first().locator(".item-content"),
        );
        await page.keyboard.press("Control+v");

        // With provenance tracking, the second paste finds the existing clone and skips recreating it silently.
        // It renders the Create/Existing UI instead. Wait for it:
        const createPanel = page.getByTestId("yjs-table-create-panel").last();
        await expect(createPanel).toBeVisible({ timeout: 60000 });

        // The Acceptance Criteria requires that choosing to "make another copy" creates an independent table.
        // That means we click "New Table" and create it.
        await createPanel.locator("button:has-text('New Table')").click();
        await createPanel.getByTestId("yjs-table-create").click();

        await expect(page.getByTestId("yjs-table-view")).toHaveCount(3, { timeout: 60000 });

        const afterSecondPaste = await readGridProjectState(page);
        expect(afterSecondPaste.tables).toHaveLength(3);
        const secondClone = afterSecondPaste.tables.find(t => t.id !== warmupTableId && t.id !== firstCloneId)!;
        expect(secondClone).toBeTruthy();
        expect(secondClone.guid).not.toBe(firstCloneGuid);
        expect(secondClone.dataSize).toBe(0);
        // The two paste-created hosts point at two distinct destination
        // tables, in addition to the warm-up table's own host.
        expect(new Set(afterSecondPaste.hostTableIds).size).toBe(3);
    });
});
