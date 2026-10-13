import { expect, test } from "@playwright/test";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CAL-7be3f0c9: Calendar Table-source creation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Anchor", "Another anchor", "Third anchor"]);
    });

    test("creates a Calendar and preset-initialized Table without creating a Grid", async ({ page }) => {
        const row = await createBlockFromItem(
            page,
            page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Anchor" }).first(),
            "Calendar",
        );
        await row.getByRole("button", { name: "New Table and Calendar" }).click();
        const panel = row.getByTestId("calendar-create-panel");
        await panel.getByTestId("yjs-table-name-input").fill("Appointments");
        await panel.getByTestId("yjs-table-sql-name-input").fill("appointments");
        await panel.getByTestId("yjs-table-create").click();
        await expect(row.getByTestId("calendar-view")).toBeVisible({ timeout: 30000 });

        const state = await page.evaluate(() => {
            const project = (globalThis as any).__YJS_STORE__?.yjsClient?.getProject();
            const doc = project?.ydoc;
            if (!doc) throw new Error("Missing project");
            const calendar = [...project.calendars.values()][0];
            return {
                tables: doc.getMap("yjsTables").size,
                grids: doc.getMap("yjsGrids").size,
                calendars: project.calendars.size,
                query: calendar.get("query"),
                roleDue: calendar.get("roleDue"),
            };
        });
        expect(state).toMatchObject({
            tables: 1,
            grids: 0,
            calendars: 1,
            query: expect.stringContaining("FROM appointments"),
            roleDue: "due_date",
        });
        await page.reload();
        await expect(page.locator('[data-node-kind="calendar"]').getByTestId("calendar-view"))
            .toBeVisible({ timeout: 30000 });
    });

    test("creates a Calendar query over an existing Table and reuses an existing Calendar", async ({ page }) => {
        const first = await createBlockFromItem(
            page,
            page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Anchor" }).first(),
            "Calendar",
        );
        await first.getByRole("button", { name: "New Table and Calendar" }).click();
        await first.getByTestId("yjs-table-create").click();
        await expect(first.getByTestId("calendar-view")).toBeVisible();

        const second = await createBlockFromItem(
            page,
            page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Another anchor" }),
            "Calendar",
        );
        await second.getByRole("button", { name: "New Calendar over Existing Table" }).click();
        await second.getByTestId("calendar-create-from-table").click();
        await expect(second.getByTestId("calendar-view")).toBeVisible();

        const third = await createBlockFromItem(
            page,
            page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Third anchor" }),
            "Calendar",
        );
        await third.getByRole("button", { name: "Existing Calendar" }).click();
        const ids = await third.getByTestId("calendar-existing-select").locator("option")
            .evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
        expect(ids).toHaveLength(2);
        await third.getByTestId("calendar-existing-select").selectOption(ids[0]);
        await third.getByTestId("calendar-select-existing").click();
        await expect(third.getByTestId("calendar-view")).toBeVisible();

        const state = await page.evaluate(() => {
            const project = (globalThis as any).__YJS_STORE__?.yjsClient?.getProject();
            const calendars = [...project.calendars.values()];
            return {
                tables: project.ydoc.getMap("yjsTables").size,
                grids: project.ydoc.getMap("yjsGrids").size,
                calendars: calendars.length,
                queries: calendars.map((entry: any) => entry.get("query")),
            };
        });
        expect(state.tables).toBe(1);
        expect(state.grids).toBe(0);
        expect(state.calendars).toBe(2);
        expect(state.queries).toContain("SELECT * FROM tasks");
    });
});
