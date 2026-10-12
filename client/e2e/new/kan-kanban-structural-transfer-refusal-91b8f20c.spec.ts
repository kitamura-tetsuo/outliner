import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-91b8f20c
 *  Title   : Kanban placement lifecycle
 *  Source  : docs/client-features/kan-kanban-placement-lifecycle-91b8f20c.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { createBlankGrid } from "../utils/crossProjectGridHelpers";
import { TestHelpers } from "../utils/testHelpers";
import { selectVisualNode, waitForStableGeometry } from "../utils/visualNodeSelectionHelpers";

const objectRow = (page: Page, type: string) =>
    page.locator('[data-testid^="object-row-"]').filter({ has: page.locator(`.type-badge.${type}`) });

async function openObjects(page: Page) {
    const show = page.getByRole("button", { name: "Show sidebar" });
    if (await show.isVisible().catch(() => false)) await show.click();
    await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
    await expect(page).toHaveURL(/\/objects$/);
}

test.describe("FTR-91b8f20c: unsupported Kanban structural transfer", () => {
    test("Copy and Cut refuse before clipboard, tree, registry, or neighbours change", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Alpha neighbour", "Omega neighbour"]);
        await createBlankGrid(page, "Tasks", "tasks");
        await openObjects(page);

        const table = objectRow(page, "table");
        await table.locator('[data-testid^="object-place-"]').click();
        await page.getByTestId("object-placement-confirm").click();
        const board = objectRow(page, "kanban");
        const boardId = (await board.getAttribute("data-testid"))!.replace("object-row-", "");

        await page.locator("aside [data-page-id]").first().click();
        const placement = page.locator(`[data-testid="kanban-board"][data-kanban-id="${boardId}"]`);
        const placementId = await placement.evaluate(node =>
            node.closest(".outliner-item")?.getAttribute("data-item-id")
        );
        expect(placementId).toBeTruthy();
        await waitForStableGeometry(page);
        await page.evaluate(() => navigator.clipboard.writeText("sentinel clipboard"));

        for (const shortcut of ["Control+c", "Control+x"]) {
            await selectVisualNode(page, placementId!);
            await page.keyboard.press(shortcut);
            await page.waitForTimeout(500);
            await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("sentinel clipboard");
            await expect(page.locator(`[data-item-id="${placementId}"]`).getByTestId("kanban-board"))
                .toHaveAttribute("data-kanban-id", boardId);
            await expect(page.getByText("Alpha neighbour", { exact: true })).toBeVisible();
            await expect(page.getByText("Omega neighbour", { exact: true })).toBeVisible();
        }

        // The refused Copy must not leave an in-app Kanban payload for the
        // exposed Paste shortcut to materialize or flatten.
        await selectVisualNode(page, placementId!);
        await page.keyboard.press("Control+v");
        await page.waitForTimeout(500);
        await expect(page.locator(`[data-item-id="${placementId}"]`).getByTestId("kanban-board"))
            .toHaveAttribute("data-kanban-id", boardId);
        await expect(page.getByTestId("kanban-board")).toHaveCount(1);
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("sentinel clipboard");
        await expect(page.getByText("Alpha neighbour", { exact: true })).toBeVisible();
        await expect(page.getByText("Omega neighbour", { exact: true })).toBeVisible();

        const alphaId = await page.getByText("Alpha neighbour", { exact: true }).evaluate(node =>
            node.closest(".outliner-item")?.getAttribute("data-item-id")
        );
        const omegaId = await page.getByText("Omega neighbour", { exact: true }).evaluate(node =>
            node.closest(".outliner-item")?.getAttribute("data-item-id")
        );
        for (const shortcut of ["Control+c", "Control+x"]) {
            await page.evaluate(({ startId, endId }) => {
                (globalThis as any).editorOverlayStore.setSelection({
                    startItemId: startId,
                    startOffset: 3,
                    endItemId: endId,
                    endOffset: 5,
                    userId: "local",
                });
            }, { startId: alphaId, endId: omegaId });
            await page.keyboard.press(shortcut);
            await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("sentinel clipboard");
            await expect(page.locator(`[data-item-id="${placementId}"]`).getByTestId("kanban-board"))
                .toHaveAttribute("data-kanban-id", boardId);
            await expect(page.getByText("Alpha neighbour", { exact: true })).toBeVisible();
            await expect(page.getByText("Omega neighbour", { exact: true })).toBeVisible();
        }

        await openObjects(page);
        await expect(objectRow(page, "kanban")).toHaveCount(1);
        await expect(objectRow(page, "table")).toHaveCount(1);
    });

    test("Duplicate selected refuses a Kanban before opening an actionable operation", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Alpha neighbour", "Omega neighbour"]);
        await createBlankGrid(page, "Tasks", "tasks");
        await openObjects(page);

        const table = objectRow(page, "table");
        await table.locator('[data-testid^="object-place-"]').click();
        await page.getByTestId("object-placement-confirm").click();
        const board = objectRow(page, "kanban");
        const boardId = (await board.getAttribute("data-testid"))!.replace("object-row-", "");
        await board.locator('input[type="checkbox"]').check();

        await page.getByTestId("object-manager-duplicate-selected").click();
        const dialog = page.getByTestId("object-manager-duplicate-dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.getByTestId("object-manager-duplicate-apply")).toBeDisabled();

        await dialog.getByTestId("object-manager-duplicate-cancel").click();
        await expect(objectRow(page, "kanban")).toHaveCount(1);
        await expect(objectRow(page, "table")).toHaveCount(1);
        await expect(page.locator(`[data-testid="object-row-${boardId}"]`)).toBeVisible();

        await page.locator("aside [data-page-id]").first().click();
        await expect(page.locator(`[data-testid="kanban-board"][data-kanban-id="${boardId}"]`)).toHaveCount(1);
        await expect(page.getByText("Alpha neighbour", { exact: true })).toBeVisible();
        await expect(page.getByText("Omega neighbour", { exact: true })).toBeVisible();
    });
});
