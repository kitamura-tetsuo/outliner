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

test.describe("FTR-5605ca14: Calendar preset and SQL-name validation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["First", "Second", "Third"]);
    });

    test("creates Blank and Habits without inventing scheduled roles or records", async ({ page }) => {
        const blank = await createCalendarBlockForLabel(page, "First");
        await createPresetCalendar(blank, { preset: "blank", name: "Blank Calendar", sqlName: "blank_items" });
        const habits = await createCalendarBlockForLabel(page, "Second");
        await createPresetCalendar(habits, { preset: "habits", name: "Habit Calendar", sqlName: "daily_habits" });

        let state = await calendarProjectState(page);
        expect(state.gridCount).toBe(0);
        expect(state.tableRecords).toEqual([
            expect.objectContaining({ sqlName: "blank_items", recordCount: 0 }),
            expect.objectContaining({ sqlName: "daily_habits", recordCount: 0 }),
        ]);
        expect(state.calendars).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: "Blank Calendar", roleTitle: "title" }),
            expect.objectContaining({ name: "Habit Calendar", roleTitle: "name" }),
        ]));
        const habit = state.calendars.find(calendar => calendar.name === "Habit Calendar")!;
        expect(habit.roleStart).toBeUndefined();
        expect(habit.sourceTableId).toBeUndefined();
        expect(habit.insertTargetTableId).toBeUndefined();

        await page.reload();
        await expect(page.getByTestId("calendar-view")).toHaveCount(2, { timeout: 20000 });
        state = await calendarProjectState(page);
        expect(state.tableRecords.every(table => table.recordCount === 0)).toBe(true);
    });

    test("refuses invalid and duplicate SQL names without partial objects", async ({ page }) => {
        const first = await createCalendarBlockForLabel(page, "First");
        await createPresetCalendar(first, { preset: "tasks", name: "Tasks", sqlName: "occupied_tasks" });
        const second = (await createCalendarBlockForLabel(page, "Second")).getByTestId("calendar-block");
        await second.getByRole("button", { name: "New Table", exact: true }).click();
        const sqlName = second.getByTestId("yjs-table-sql-name-input");

        await sqlName.fill("order");
        await second.getByTestId("yjs-table-create").click();
        await expect(second.getByTestId("yjs-table-create-error")).toContainText("reserved");
        expect((await calendarProjectState(page)).calendars).toHaveLength(1);

        await sqlName.fill("occupied_tasks");
        await second.getByTestId("yjs-table-create").click();
        await expect(second.getByTestId("yjs-table-create-error")).toContainText("already used");
        const state = await calendarProjectState(page);
        expect(state.tableCount).toBe(1);
        expect(state.calendars).toHaveLength(1);
    });
});
