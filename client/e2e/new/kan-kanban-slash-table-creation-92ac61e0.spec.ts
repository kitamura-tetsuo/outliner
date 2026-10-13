import { expect, test } from "@playwright/test";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { TestHelpers } from "../utils/testHelpers";

test.describe("KAN-92ac61e0: slash-created Kanban sources", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Anchor", "Another anchor", "Third anchor"]);
    });

    test("creates a preset Table and Kanban without an unused Grid, including after reload", async ({ page }) => {
        const row = await createBlockFromItem(
            page,
            page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Anchor" }).first(),
            "Kanban",
        );
        const panel = row.getByTestId("kanban-create-panel");
        await expect(panel).toBeVisible();
        await panel.getByTestId("yjs-table-name-input").fill("Roadmap");
        await panel.getByTestId("yjs-table-sql-name-input").fill("roadmap");
        await panel.getByTestId("yjs-table-create").click();
        const board = row.getByTestId("kanban-board");
        await expect(board).toBeVisible({ timeout: 30000 });
        const kanbanId = await board.getAttribute("data-kanban-id");
        expect(kanbanId).toBeTruthy();
        const state = await page.evaluate(() => {
            const doc = (globalThis as any).__YJS_STORE__?.yjsClient?.getProject()?.ydoc;
            if (!doc) throw new Error("Missing project");
            const tableIds = [...doc.getMap("yjsTables").keys()];
            const entry = doc.getMap("yjsKanbans").get([...doc.getMap("yjsKanbans").keys()][0]);
            return {
                tables: tableIds.length,
                grids: doc.getMap("yjsGrids").size,
                boards: doc.getMap("yjsKanbans").size,
                sourceTableId: entry?.get("sourceTableId"),
                query: entry?.get("query"),
                group: entry?.get("groupField"),
                title: entry?.get("titleField"),
                tableId: tableIds[0],
            };
        });
        expect(state).toMatchObject({
            tables: 1, grids: 0, boards: 1, sourceTableId: state.tableId,
            query: expect.stringContaining("FROM roadmap"),
            group: "status", title: "title",
        });

        await page.reload();
        await expect(page.locator('[data-node-kind="kanban"]').getByTestId("kanban-board"))
            .toHaveAttribute("data-kanban-id", kanbanId!, { timeout: 30000 });
    });

    test("creates independent and reused Kanbans over an existing Table", async ({ page }) => {
        const first = await createBlockFromItem(
            page,
            page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Anchor" }).first(),
            "Kanban",
        );
        await first.getByTestId("yjs-table-create").click();
        const firstId = await first.getByTestId("kanban-board").getAttribute("data-kanban-id");
        expect(firstId).toBeTruthy();

        const second = await createBlockFromItem(
            page,
            page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Another anchor" }),
            "Kanban",
        );
        await second.getByRole("button", { name: "New Kanban over Existing Table" }).click();
        await second.getByTestId("kanban-create-from-table").click();
        await expect(second.getByTestId("kanban-board")).toBeVisible();
        const secondId = await second.getByTestId("kanban-board").getAttribute("data-kanban-id");
        expect(secondId).toBeTruthy();
        expect(secondId).not.toBe(firstId);

        const third = await createBlockFromItem(
            page,
            page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Third anchor" }),
            "Kanban",
        );
        await third.getByRole("button", { name: "Existing Kanban", exact: true }).click();
        await third.getByTestId("kanban-existing-board-select").selectOption(firstId!);
        await third.getByTestId("kanban-select-existing").click();
        await expect(third.getByTestId("kanban-board")).toHaveAttribute("data-kanban-id", firstId!);

        const counts = await page.evaluate(() => {
            const doc = (globalThis as any).__YJS_STORE__?.yjsClient?.getProject()?.ydoc;
            return [doc.getMap("yjsTables").size, doc.getMap("yjsGrids").size, doc.getMap("yjsKanbans").size];
        });
        expect(counts).toEqual([1, 0, 2]);
    });

    test("refuses an invalid SQL name without creating a Table or Kanban", async ({ page }) => {
        const row = await createBlockFromItem(
            page,
            page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Anchor" }).first(),
            "Kanban",
        );
        await row.getByTestId("yjs-table-sql-name-input").fill("9invalid");
        await row.getByTestId("yjs-table-create").click();
        await expect(row.getByTestId("yjs-table-create-error")).toBeVisible();
        const counts = await page.evaluate(() => {
            const doc = (globalThis as any).__YJS_STORE__?.yjsClient?.getProject()?.ydoc;
            return [doc.getMap("yjsTables").size, doc.getMap("yjsGrids").size, doc.getMap("yjsKanbans").size];
        });
        expect(counts).toEqual([0, 0, 0]);
    });
});
