/** @feature KAN-5a45c9e1 */
import { expect, test } from "@playwright/test";
import { readGridProjectState } from "../utils/crossProjectGridHelpers";
import {
    configureKanbanThroughUi,
    createKanbanThroughUi,
    createSourceThroughUi,
    openKanbanList,
    TASK_QUERY,
} from "../utils/kanbanTestHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

function recordValue(
    state: Awaited<ReturnType<typeof readGridProjectState>>,
    tableId: string,
    id: string,
    field: string,
) {
    const data = state.tables.find(table => table.id === tableId)?.data as Record<string, Record<string, unknown>>;
    return data[id]?.[field];
}

test(
    "standalone controls write source fields, synchronize, undo, redo, and reload",
    async ({ page, context }, info) => {
        test.setTimeout(180000);
        const fixture = await createSourceThroughUi(page, info);
        await openKanbanList(page, fixture.projectName);
        await createKanbanThroughUi(page, "Editable board", fixture.tableId);
        await configureKanbanThroughUi(page, {
            query: TASK_QUERY,
            group: "status",
            title: "title",
            details: ["detail"],
        });

        const alphaResult = page.locator("article.card").filter({ hasText: "Alpha" });
        const occurrence = await alphaResult.getAttribute("data-card-occurrence");
        if (!occurrence) throw new Error("Alpha card has no result-occurrence identity");
        // Keep addressing the card by its stable result occurrence while its
        // title switches from rendered text to an input with no textContent.
        const alpha = page.locator(`article.card[data-card-occurrence="${occurrence}"]`);
        await alpha.getByRole("button", { name: "Edit title" }).click();
        const editor = alpha.getByRole("textbox", { name: "Edit title" });
        await editor.fill("Alpha edited");
        await alpha.getByRole("button", { name: "Save" }).click();
        // A confirmed write re-executes the SELECT, so result occurrence keys
        // are intentionally replaced; reacquire the authoritative card.
        const alphaEdited = page.locator("article.card").filter({ hasText: "Alpha edited" });
        await expect(alphaEdited).toBeVisible();
        expect(recordValue(await readGridProjectState(page), fixture.tableId, fixture.recordIds[0], "title"))
            .toBe("Alpha edited");

        const peer = await context.newPage();
        await peer.goto(page.url());
        await expect(peer.locator("article.card").filter({ hasText: "Alpha edited" })).toBeVisible({ timeout: 30000 });

        const destination = page.locator('section.lane[data-lane-kind="string"]').filter({ hasText: "done" });
        const handleBox = await alphaEdited.getByRole("button", { name: "Move card" }).boundingBox();
        const laneBox = await destination.boundingBox();
        if (!handleBox || !laneBox) throw new Error("Kanban drag endpoints are not rendered");
        await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(laneBox.x + laneBox.width / 2, laneBox.y + laneBox.height - 8, { steps: 12 });
        await page.mouse.up();
        await expect(destination.locator("article.card").filter({ hasText: "Alpha edited" })).toBeVisible();
        expect(recordValue(await readGridProjectState(page), fixture.tableId, fixture.recordIds[0], "status")).toBe(
            "done",
        );

        await page.getByRole("button", { name: "Undo" }).click();
        await expect(
            page.locator("article.card").filter({ hasText: "Alpha edited" }).locator(
                "xpath=ancestor::section[contains(@class,'lane')]",
            ),
        ).toContainText("open");
        await page.getByRole("button", { name: "Redo" }).click();
        await expect(destination.locator("article.card").filter({ hasText: "Alpha edited" })).toBeVisible();

        await destination.locator("article.card").filter({ hasText: "Alpha edited" }).getByRole("button", {
            name: "Edit title",
        }).click();
        await page.keyboard.press("Escape");
        expect(recordValue(await readGridProjectState(page), fixture.tableId, fixture.recordIds[0], "title"))
            .toBe("Alpha edited");
        await page.reload();
        await expect(page.locator("article.card").filter({ hasText: "Alpha edited" })).toBeVisible({ timeout: 30000 });
    },
);
