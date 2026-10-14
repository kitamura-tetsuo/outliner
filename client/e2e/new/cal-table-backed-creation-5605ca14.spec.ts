import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5605ca14
 *  Title   : Table-backed Calendar creation
 *  Source  : docs/client-features/cal-table-backed-calendar-creation-5605ca14.yaml
 */
import { expect, test } from "@playwright/test";
import {
    calendarProjectState,
    createCalendarBlockForLabel,
    createPresetCalendar,
} from "../utils/calendarTableCreationHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-5605ca14: Table-backed Calendar creation", () => {
    test("completes all four creation modes without source ownership or an extra Grid", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Independent", "Preset", "Existing table", "Shared"]);

        const independentRow = await createCalendarBlockForLabel(page, "Independent");
        const independent = independentRow.getByTestId("calendar-block");
        await independent.getByTestId("calendar-name-input").fill("Independent Calendar");
        await independent.getByTestId("calendar-create").click();
        await expect(independent.getByTestId("calendar-view")).toBeVisible({ timeout: 15000 });

        const presetRow = await createCalendarBlockForLabel(page, "Preset");
        await createPresetCalendar(presetRow, { preset: "tasks", name: "Release Tasks", sqlName: "release_tasks" });

        const overTableRow = await createCalendarBlockForLabel(page, "Existing table");
        const overTable = overTableRow.getByTestId("calendar-block");
        await overTable.getByRole("button", { name: "New Calendar over Existing Table" }).click();
        await overTable.getByTestId("calendar-table-name-input").fill("Second View");
        await overTable.getByTestId("calendar-create-over-table").click();
        await expect(overTable.getByTestId("calendar-view")).toBeVisible({ timeout: 15000 });

        const sharedRow = await createCalendarBlockForLabel(page, "Shared");
        const shared = sharedRow.getByTestId("calendar-block");
        await shared.getByRole("button", { name: "Existing Calendar" }).click();
        await shared.getByTestId("calendar-existing-select").selectOption({ label: "Independent Calendar" });
        await shared.getByTestId("calendar-select-existing").click();
        await expect(shared.getByTestId("calendar-name")).toHaveText("Independent Calendar", { timeout: 15000 });

        let state = await calendarProjectState(page);
        expect(state.tableCount).toBe(1);
        expect(state.gridCount).toBe(0);
        expect(state.calendars).toHaveLength(3);
        expect(state.calendars).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ sourceTableId: expect.anything() }),
            expect.objectContaining({ insertTargetTableId: expect.anything() }),
        ]));
        expect(state.calendars).toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: "Release Tasks",
                roleTitle: "title",
                roleDue: "due_date",
                query: expect.stringContaining("release_tasks"),
            }),
            expect.objectContaining({ name: "Second View", query: "SELECT * FROM release_tasks" }),
        ]));

        const idsBeforeReload = await Promise.all([independentRow, sharedRow].map(row =>
            row.evaluate(element => {
                const id = element.getAttribute("data-item-id")!;
                return (globalThis as any).generalStore.project.tree.getNodeValueFromKey(id).get("calendarId");
            })
        ));
        expect(idsBeforeReload[0]).toBe(idsBeforeReload[1]);
        await page.reload();
        await expect(page.getByTestId("calendar-view")).toHaveCount(4, { timeout: 20000 });
        const idsAfterReload = await Promise.all([independentRow, sharedRow].map(row =>
            row.evaluate(element => {
                const id = element.getAttribute("data-item-id")!;
                return (globalThis as any).generalStore.project.tree.getNodeValueFromKey(id).get("calendarId");
            })
        ));
        expect(idsAfterReload).toEqual(idsBeforeReload);
        state = await calendarProjectState(page);
        expect(state.calendars).toHaveLength(3);
        expect(state.tableRecords).toEqual([expect.objectContaining({ sqlName: "release_tasks", recordCount: 0 })]);
    });
});
