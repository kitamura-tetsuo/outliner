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

test.describe("FTR-5605ca14: Table setup remains separate from Calendar entry destination", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Calendar host", "Entry destination"]);
        await page.evaluate(() => {
            // Create a second real Page through the supported Project API so
            // the destination picker has two distinguishable parent choices.
            (globalThis as any).generalStore.project.addPage("Explicit destination", "tester");
        });
    });

    test("reconfigures query roles and New entry writes only to the chosen outline parent", async ({ page }) => {
        const row = await createCalendarBlockForLabel(page, "Calendar host");
        await createPresetCalendar(row, { preset: "tasks", name: "Table Calendar", sqlName: "calendar_tasks" });
        const block = row.getByTestId("calendar-block");
        const recordsBefore = (await calendarProjectState(page)).tableRecords;

        await block.getByTestId("calendar-toggle-settings").click();
        const query = block.getByTestId("calendar-query-input");
        await query.fill("SELECT id, title, due_date AS deadline FROM calendar_tasks");
        await query.blur();
        const titleRole = block.getByTestId("calendar-role-roleTitle");
        const dueRole = block.getByTestId("calendar-role-roleDue");
        await expect(titleRole).toBeVisible({ timeout: 15000 });
        await titleRole.selectOption("title");
        await dueRole.selectOption("deadline");

        expect(await block.getByText(/insert target/i).count()).toBe(0);
        const rowsBeforeEntry = await page.locator(".outliner-item").count();
        await block.getByTestId("calendar-new-entry").click();
        const dialog = block.getByTestId("calendar-create-dialog");
        await expect(dialog).toBeVisible();
        const submit = dialog.getByTestId("calendar-create-submit");
        await expect(submit).toBeDisabled();
        await dialog.getByTestId("calendar-create-title-input").fill("Outline-only entry");
        const destination = dialog.getByTestId("calendar-create-destination-select");
        await expect.poll(() => destination.locator("option").count(), { timeout: 15000 }).toBeGreaterThan(1);
        const destinationKey = await destination.locator("option", { hasText: "Explicit destination" })
            .getAttribute("value");
        expect(destinationKey).toBeTruthy();
        await destination.selectOption(destinationKey!);
        await submit.click();
        await expect(dialog).toHaveCount(0, { timeout: 10000 });
        await expect(page.locator(".outliner-item", { hasText: "Outline-only entry" })).toBeVisible({ timeout: 15000 });
        await expect(page.locator(".outliner-item")).toHaveCount(rowsBeforeEntry + 1);
        const createdParent = await page.evaluate(({ title }) => {
            // eslint-disable-next-line no-restricted-globals
            const project = (window as any).generalStore.project;
            for (const [key, value] of project.tree.computedMap.entries()) {
                if (String(value.get("text") ?? "") !== title) continue;
                return { key, parentKey: project.tree.getNodeParentFromKey(key) };
            }
            return { key: undefined, parentKey: undefined };
        }, { title: "Outline-only entry", parentKey: destinationKey! });
        expect(createdParent.key).toBeTruthy();
        expect(createdParent.parentKey).toBe(destinationKey);

        let state = await calendarProjectState(page);
        expect(state.tableRecords).toEqual(recordsBefore);
        expect(state.calendars[0]).toMatchObject({
            query: "SELECT id, title, due_date AS deadline FROM calendar_tasks",
            roleTitle: "title",
            roleDue: "deadline",
        });
        expect(state.calendars[0].sourceTableId).toBeUndefined();
        expect(state.calendars[0].insertTargetTableId).toBeUndefined();

        await page.reload();
        await expect(page.getByTestId("calendar-view")).toBeVisible({ timeout: 20000 });
        state = await calendarProjectState(page);
        expect(state.tableRecords).toEqual(recordsBefore);
        expect(state.calendars[0]).toMatchObject({ roleDue: "deadline" });
    });

    test("cancelling or omitting a parent creates no outline item or Table record", async ({ page }) => {
        const row = await createCalendarBlockForLabel(page, "Calendar host");
        await createPresetCalendar(row, { preset: "blank", name: "Blank Calendar", sqlName: "blank_calendar" });
        const block = row.getByTestId("calendar-block");
        const before = await calendarProjectState(page);
        const rowsBefore = await page.locator(".outliner-item").count();

        await block.getByTestId("calendar-new-entry").click();
        const dialog = block.getByTestId("calendar-create-dialog");
        await dialog.getByTestId("calendar-create-title-input").fill("No destination");
        await expect(dialog.getByTestId("calendar-create-submit")).toBeDisabled();
        await dialog.getByTestId("calendar-create-cancel").click();
        await expect(dialog).toHaveCount(0);
        await expect(page.locator(".outliner-item")).toHaveCount(rowsBefore);
        expect((await calendarProjectState(page)).tableRecords).toEqual(before.tableRecords);
    });
});
