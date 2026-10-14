import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5605ca14
 *  Title   : Table-backed Calendar creation
 *  Source  : docs/client-features/cal-table-backed-calendar-creation-5605ca14.yaml
 */
import { expect, test } from "@playwright/test";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FTR-5605ca14: Table-backed Calendar creation", () => {
    test("completes all four creation modes without source ownership or an extra Grid", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Independent", "Preset", "Existing table", "Shared"]);

        const blockFor = async (label: string) => {
            const row = page.locator(".outliner-item").filter({ hasText: label }).first();
            const itemId = await row.getAttribute("data-item-id");
            expect(itemId).toBeTruthy();
            await createBlockFromItem(page, page.locator(`[data-item-id="${itemId}"]`), "Calendar");
            return page.locator(`[data-item-id="${itemId}"]`).getByTestId("calendar-block");
        };

        const independent = await blockFor("Independent");
        await independent.getByTestId("calendar-name-input").fill("Independent Calendar");
        await independent.getByTestId("calendar-create").click();
        await expect(independent.getByTestId("calendar-view")).toBeVisible({ timeout: 15000 });

        const preset = await blockFor("Preset");
        await preset.getByRole("button", { name: "New Table" }).click();
        await preset.getByTestId("yjs-table-name-input").fill("Release Tasks");
        await preset.getByTestId("yjs-table-sql-name-input").fill("release_tasks");
        await preset.getByTestId("yjs-table-create").click();
        await expect(preset.getByTestId("calendar-view")).toBeVisible({ timeout: 15000 });

        const overTable = await blockFor("Existing table");
        await overTable.getByRole("button", { name: "New Calendar over Existing Table" }).click();
        await overTable.getByTestId("calendar-table-name-input").fill("Second View");
        await overTable.getByTestId("calendar-create-over-table").click();
        await expect(overTable.getByTestId("calendar-view")).toBeVisible({ timeout: 15000 });

        const shared = await blockFor("Shared");
        await shared.getByRole("button", { name: "Existing Calendar" }).click();
        await shared.getByTestId("calendar-existing-select").selectOption({ label: "Independent Calendar" });
        await shared.getByTestId("calendar-select-existing").click();
        await expect(shared.getByTestId("calendar-name")).toHaveText("Independent Calendar", { timeout: 15000 });

        const state = await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            const project = (window as any).generalStore.project;
            const calendars = [...project.calendars.values()].map((entry: any) => entry.toJSON());
            return {
                tables: project.ydoc.getMap("yjsTables").size,
                grids: project.ydoc.getMap("yjsGrids").size,
                calendars,
            };
        });
        expect(state.tables).toBe(1);
        expect(state.grids).toBe(0);
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
    });
});
