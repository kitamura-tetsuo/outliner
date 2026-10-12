import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-91b8f20c
 *  Title   : Kanban placement lifecycle
 *  Source  : docs/client-features/kan-kanban-placement-lifecycle-91b8f20c.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { createBlankGrid } from "../utils/crossProjectGridHelpers";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { TestHelpers } from "../utils/testHelpers";

const objectRow = (page: Page, type: string) =>
    page.locator('[data-testid^="object-row-"]').filter({ has: page.locator(`.type-badge.${type}`) });

async function openObjects(page: Page) {
    const show = page.getByRole("button", { name: "Show sidebar" });
    if (await show.isVisible().catch(() => false)) await show.click();
    await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
    await expect(page).toHaveURL(/\/objects$/);
}

async function addExistingBoardToLayout(page: Page, layout: ReturnType<Page["locator"]>, boardId: string) {
    await layout.click({ button: "right" });
    await page.getByTestId("layout-add-kanban").click();
    const dialog = page.getByTestId("layout-kanban-dialog");
    await dialog.getByLabel("Existing board").check();
    await dialog.locator("select").nth(1).selectOption(boardId);
    await dialog.getByTestId("layout-kanban-confirm").click();
}

test(
    "FTR-91b8f20c: stale deletion keeps a peer replacement bound to another board",
    async ({ page, browser }, testInfo) => {
        test.setTimeout(180000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Dashboard"]);
        await createBlankGrid(page, "Tasks", "tasks");
        await openObjects(page);

        const table = objectRow(page, "table");
        await table.locator('[data-testid^="object-place-"]').click();
        await page.getByTestId("object-placement-confirm").click();
        const first = objectRow(page, "kanban");
        const firstId = (await first.getAttribute("data-testid"))!.replace("object-row-", "");
        await page.locator("aside [data-page-id]").first().click();
        await expect(page).not.toHaveURL(/\/objects$/);
        const pageUrl = page.url();
        const layoutRow = await createBlockFromItem(
            page,
            page.locator('.outliner-item[data-node-kind="text"]').filter({ hasText: "Dashboard" }),
            "Layout",
        );
        await addExistingBoardToLayout(page, layoutRow.getByTestId("layout-block"), firstId);

        await openObjects(page);
        await page.locator(`[data-testid="object-row-${firstId}"]`).locator('[data-testid^="object-delete-"]').click();
        const confirmation = page.getByRole("alertdialog");
        await expect(confirmation).toContainText("2 Page placement(s)");

        const peerContext = await browser.newContext({ storageState: TestHelpers.createTestStorageState() as any });
        const peer = await peerContext.newPage();
        await peer.addInitScript(() => {
            localStorage.setItem("VITE_IS_TEST", "true");
            localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
            localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
            (globalThis as any).__E2E__ = true;
        });
        await peer.goto(pageUrl);
        await peer.waitForFunction(() => !!(globalThis as any).__USER_MANAGER__, undefined, { timeout: 10000 });
        await peer.evaluate(async () => {
            const manager = (globalThis as any).__USER_MANAGER__;
            if (manager?.loginWithEmailPassword) {
                await manager.loginWithEmailPassword("test@example.com", "password");
            }
        });
        await peer.waitForFunction(
            () => !!(globalThis as any).__USER_MANAGER__?.getCurrentUser?.(),
            undefined,
            { timeout: 10000 },
        );
        const pageName = decodeURIComponent(new URL(pageUrl).pathname.split("/").at(-1)!);
        await TestHelpers.waitForPageData(peer, pageName, 30000);
        await expect(peer.locator(`[data-testid="kanban-board"][data-kanban-id="${firstId}"]`)).toHaveCount(2, {
            timeout: 30000,
        });
        const nested = peer.getByTestId("layout-block")
            .locator(`[data-testid="kanban-board"][data-kanban-id="${firstId}"]`);
        const stalePlacementId = await nested.locator("xpath=ancestor::*[@data-testid='layout-cell']")
            .getAttribute("data-item-id");

        await openObjects(peer);
        await objectRow(peer, "table").locator('[data-testid^="object-place-"]').click();
        await peer.getByTestId("object-placement-confirm").click();
        const boards = objectRow(peer, "kanban");
        await expect(boards).toHaveCount(2);
        const ids = await boards.evaluateAll(rows =>
            rows.map(row => row.getAttribute("data-testid")!.replace("object-row-", ""))
        );
        const secondId = ids.find(id => id !== firstId)!;
        await peer.locator("aside [data-page-id]").first().click();
        await peer.evaluate(({ placementId, kanbanId }) => {
            const visible = (globalThis as any).generalStore.activeViewModel.getVisibleItems();
            const placement = visible.find((entry: any) => entry.model.id === placementId)?.model.original;
            if (!placement) throw new Error("The placement is not visible to the supported Page model.");
            placement.kanbanId = kanbanId;
        }, { placementId: stalePlacementId, kanbanId: secondId });
        await expect(peer.locator(`[data-item-id="${stalePlacementId}"]`).getByTestId("kanban-board"))
            .toHaveAttribute("data-kanban-id", secondId);
        await expect(page.locator(`[data-testid="object-row-${secondId}"]`)).toBeVisible();

        await confirmation.getByRole("button", { name: "Delete" }).click();
        await expect(page.locator(`[data-testid="object-row-${firstId}"]`)).toHaveCount(0);
        await expect(page.locator(`[data-testid="object-row-${secondId}"]`)).toBeVisible();
        await peer.locator("aside [data-page-id]").first().click();
        await expect(peer.locator(`[data-item-id="${stalePlacementId}"]`).getByTestId("kanban-board"))
            .toHaveAttribute("data-kanban-id", secondId);
        await peer.reload();
        await TestHelpers.waitForPageData(peer, pageName, 30000);
        await expect(peer.locator(`[data-item-id="${stalePlacementId}"]`).getByTestId("kanban-board"))
            .toHaveAttribute("data-kanban-id", secondId);
        await peerContext.close();
    },
);
