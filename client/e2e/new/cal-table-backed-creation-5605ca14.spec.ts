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
        for (const calendar of state.calendars) {
            expect(calendar.sourceTableId).toBeUndefined();
            expect(calendar.insertTargetTableId).toBeUndefined();
        }
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

        await independent.getByTestId("calendar-toggle-settings").click();
        await independent.getByTestId("calendar-query-input").fill(
            "SELECT id, text AS shared_title FROM outline_items",
        );
        await independent.getByTestId("calendar-query-input").blur();
        await independent.getByTestId("calendar-role-roleTitle").selectOption("shared_title");

        await shared.getByTestId("calendar-toggle-settings").click();
        await expect(shared.getByTestId("calendar-query-input")).toHaveValue(
            "SELECT id, text AS shared_title FROM outline_items",
            { timeout: 15000 },
        );
        await expect(shared.getByTestId("calendar-role-roleTitle")).toHaveValue("shared_title");

        const sharedPlacementId = await sharedRow.getAttribute("data-item-id");
        const peer = await page.context().newPage();
        await peer.goto(page.url());
        const peerShared = peer.locator(`[data-item-id="${sharedPlacementId}"]`).getByTestId("calendar-block");
        await expect(peerShared.getByTestId("calendar-view")).toBeVisible({ timeout: 30000 });
        await peerShared.getByTestId("calendar-toggle-settings").click();
        await expect(peerShared.getByTestId("calendar-query-input")).toHaveValue(
            "SELECT id, text AS shared_title FROM outline_items",
            { timeout: 30000 },
        );
        await expect(peerShared.getByTestId("calendar-role-roleTitle")).toHaveValue("shared_title");
        await peer.close();

        await overTable.getByTestId("calendar-toggle-settings").click();
        await overTable.getByTestId("calendar-query-input").fill(
            "SELECT id, title AS second_title FROM release_tasks",
        );
        await overTable.getByTestId("calendar-query-input").blur();
        await overTable.getByTestId("calendar-role-roleTitle").selectOption("second_title");
        state = await calendarProjectState(page);
        expect(state.calendars.find(calendar => calendar.name === "Release Tasks")).toMatchObject({
            query: expect.stringContaining("due_date"),
            roleTitle: "title",
        });
        expect(state.calendars.find(calendar => calendar.name === "Second View")).toMatchObject({
            query: "SELECT id, title AS second_title FROM release_tasks",
            roleTitle: "second_title",
        });
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
        for (const calendar of state.calendars) {
            expect(calendar.sourceTableId).toBeUndefined();
            expect(calendar.insertTargetTableId).toBeUndefined();
        }
        expect(state.calendars.find(calendar => calendar.id === idsAfterReload[0])).toMatchObject({
            query: "SELECT id, text AS shared_title FROM outline_items",
            roleTitle: "shared_title",
        });
        expect(state.calendars.find(calendar => calendar.name === "Release Tasks")?.roleTitle).toBe("title");
        expect(state.calendars.find(calendar => calendar.name === "Second View")?.roleTitle).toBe("second_title");
        expect(state.tableRecords).toEqual([expect.objectContaining({ sqlName: "release_tasks", recordCount: 0 })]);
    });
});
