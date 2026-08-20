/** @feature CLP-4584c0de */
import { expect, test } from "@playwright/test";
import {
    configureGrid,
    copyGridHosts,
    createBlankGrid,
    openPasteSpecialAtAnchor,
    openProjectPage,
    pasteAtAnchor,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { SqlEditorHelper } from "../utils/sqlEditorHelpers";
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
        const destinationQueryEditor = new SqlEditorHelper(destinationView.getByTestId("yjs-table-query-input"));
        await destinationQueryEditor.fillAndCommit(page, EDITED_DESTINATION_QUERY);
        await expect(destinationView.getByTestId("yjs-table-grid").locator("th", { hasText: "quantity" })).toHaveCount(
            0,
            { timeout: 15000 },
        );

        // Go back to the source and edit its schema too (adding a "notes"
        // column the copy-time snapshot never had).
        await openProjectPage(page, fixture, "source");
        const sourceViewBeforeEdit = page.getByTestId("yjs-table-view").first();
        if (!await sourceViewBeforeEdit.getByTestId("yjs-table-schema-input").isVisible().catch(() => false)) {
            await sourceViewBeforeEdit.getByTestId("yjs-table-toggle-schema").click();
        }
        const sourceSchemaEditor = new SqlEditorHelper(sourceViewBeforeEdit.getByTestId("yjs-table-schema-input"));
        await sourceSchemaEditor.waitForReady();
        await sourceSchemaEditor.setValue(page, EDITED_SOURCE_SCHEMA);
        await sourceViewBeforeEdit.getByTestId("yjs-table-schema-apply").click();
        const sourceWarning = sourceViewBeforeEdit.getByTestId("yjs-table-schema-warning");
        if (await sourceWarning.isVisible().catch(() => false)) {
            await sourceViewBeforeEdit.getByTestId("yjs-table-schema-confirm").click();
        }
        await expect.poll(async () => await sourceSchemaEditor.value(), { timeout: 30000 }).toBe(EDITED_SOURCE_SCHEMA);
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

        // Paste the same clipboard again. A plain Ctrl+V now binds to the
        // clone whose provenance already matches (spec §9.3), so asking for a
        // second independent copy is what Paste Special is for.
        await openPasteSpecialAtAnchor(page);
        await page.getByTestId("paste-special-copy-with-data").click();

        await expect(page.getByTestId("yjs-table-view")).toHaveCount(3, { timeout: 60000 });

        const afterSecondPaste = await readGridProjectState(page);
        expect(afterSecondPaste.tables).toHaveLength(3);
        const secondClone = afterSecondPaste.tables.find(t => t.id !== warmupTableId && t.id !== firstCloneId)!;
        expect(secondClone).toBeTruthy();
        expect(secondClone.guid).not.toBe(firstCloneGuid);
        // The two paste-created hosts point at two distinct destination
        // tables, in addition to the warm-up table's own host.
        expect(new Set(afterSecondPaste.hostTableIds).size).toBe(3);
    });
});
