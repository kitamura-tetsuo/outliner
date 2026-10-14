import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5605ca14 */
import { expect, test } from "@playwright/test";
import {
    calendarProjectState,
    createCalendarBlockForLabel,
    createPresetCalendar,
} from "../utils/calendarTableCreationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-5605ca14: Calendar setup refuses stale authority", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Source", "Stale", "Rebound", "Denied"]);
        const source = await createCalendarBlockForLabel(page, "Source");
        await createPresetCalendar(source, { preset: "tasks", name: "Tasks", sqlName: "live_tasks" });
    });

    test("refuses a Table whose SQL identity changed after selection", async ({ page }) => {
        const row = await createCalendarBlockForLabel(page, "Stale");
        const block = row.getByTestId("calendar-block");
        await block.getByRole("button", { name: "New Calendar over Existing Table" }).click();
        await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            const tables = (window as any).generalStore.project.ydoc.getMap("yjsTables");
            tables.values().next().value.set("sqlName", "renamed_tasks");
        });
        await block.getByTestId("calendar-create-over-table").click();
        await expect(block.getByTestId("calendar-setup-error")).toContainText("changed after selection");
        expect((await calendarProjectState(page)).calendars).toHaveLength(1);
    });

    test("refuses a selected Table that disappeared before confirmation", async ({ page }) => {
        const row = await createCalendarBlockForLabel(page, "Stale");
        const block = row.getByTestId("calendar-block");
        await block.getByRole("button", { name: "New Calendar over Existing Table" }).click();
        await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            const tables = (window as any).generalStore.project.ydoc.getMap("yjsTables");
            const selectedId = tables.keys().next().value as string;
            tables.delete(selectedId);
        });
        await block.getByTestId("calendar-create-over-table").click();
        await expect(block.getByTestId("calendar-setup-error")).toContainText("no longer available");
        const state = await calendarProjectState(page);
        expect(state.tableCount).toBe(0);
        expect(state.calendars).toHaveLength(1);
    });

    test("does not overwrite a peer-rebound pending placement", async ({ page }) => {
        const row = await createCalendarBlockForLabel(page, "Rebound");
        const block = row.getByTestId("calendar-block");
        const existingId = (await calendarProjectState(page)).calendars[0].id;
        await row.evaluate((element, id) => {
            const itemId = element.getAttribute("data-item-id")!;
            (globalThis as any).generalStore.project.tree.getNodeValueFromKey(itemId).set("calendarId", id);
        }, existingId);
        await expect(block.getByTestId("calendar-view")).toBeVisible({ timeout: 15000 });
        expect((await calendarProjectState(page)).calendars).toHaveLength(1);
    });

    test("refuses confirmation after the mounted surface becomes read-only", async ({ page }) => {
        const row = await createCalendarBlockForLabel(page, "Denied");
        const block = row.getByTestId("calendar-block");
        await block.getByRole("button", { name: "New Table", exact: true }).click();
        await block.getByTestId("yjs-table-sql-name-input").fill("denied_table");
        const before = await calendarProjectState(page);
        await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            const meta = (window as any).generalStore.project.ydoc.getMap("metadata");
            meta.set("resetStartedAt", Date.now());
            meta.set("isResetting", true);
        });
        await expect(page.getByText("Demo content is being reset")).toBeVisible();
        await block.getByTestId("yjs-table-create").click();
        await expect(block.getByTestId("yjs-table-create-error")).toContainText("read-only");
        const after = await calendarProjectState(page);
        expect(after.tableCount).toBe(before.tableCount);
        expect(after.calendars).toEqual(before.calendars);
    });

    test("refuses confirmation after terminal room admission denial", async ({ page }) => {
        const row = await createCalendarBlockForLabel(page, "Denied");
        const block = row.getByTestId("calendar-block");
        await block.getByRole("button", { name: "New Table", exact: true }).click();
        await block.getByTestId("yjs-table-sql-name-input").fill("access_denied_table");
        const before = await calendarProjectState(page);
        const undoDepthBefore = await page.evaluate(() => (globalThis as any).globalUndoRouter?.undoDepth ?? 0);
        const retainedProjectId = await page.evaluate(() => {
            // This is the production store state emitted by a terminal room
            // denial: the connected client remains, while syncError becomes denied.
            const store = (globalThis as any).__YJS_STORE__;
            store.syncError = "denied";
            return store.currentProjectId;
        });
        expect(retainedProjectId).toBeTruthy();
        await block.getByTestId("yjs-table-create").click();
        await expect(block.getByTestId("yjs-table-create-error")).toContainText("access is unavailable");
        const after = await calendarProjectState(page);
        expect(after.tableCount).toBe(before.tableCount);
        expect(after.gridCount).toBe(before.gridCount);
        expect(after.calendars).toEqual(before.calendars);
        await expect(block.getByTestId("calendar-create-panel")).toBeVisible();
        const binding = await row.evaluate(element => {
            const itemId = element.getAttribute("data-item-id")!;
            return (globalThis as any).generalStore.project.tree.getNodeValueFromKey(itemId).get("calendarId");
        });
        expect(binding).toBeUndefined();
        expect(await page.evaluate(() => (globalThis as any).globalUndoRouter?.undoDepth ?? 0)).toBe(undoDepthBefore);
    });
});
