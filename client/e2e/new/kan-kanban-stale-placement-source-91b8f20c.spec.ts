import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-91b8f20c
 *  Title   : Kanban placement lifecycle
 *  Source  : docs/client-features/kan-kanban-placement-lifecycle-91b8f20c.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { createBlankGrid } from "../utils/crossProjectGridHelpers";
import { TestHelpers } from "../utils/testHelpers";

const objectRow = (page: Page, type: string) =>
    page.locator('[data-testid^="object-row-"]').filter({ has: page.locator(`.type-badge.${type}`) });

async function authenticatePeer(page: Page, url: string) {
    await page.addInitScript(() => {
        localStorage.setItem("VITE_IS_TEST", "true");
        localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
        localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
        (globalThis as any).__E2E__ = true;
    });
    await page.goto(url);
    await page.waitForFunction(() => !!(globalThis as any).__USER_MANAGER__, undefined, { timeout: 10000 });
    await page.evaluate(async () => {
        const manager = (globalThis as any).__USER_MANAGER__;
        if (manager?.loginWithEmailPassword) await manager.loginWithEmailPassword("test@example.com", "password");
    });
    await page.waitForFunction(
        () => !!(globalThis as any).__USER_MANAGER__?.getCurrentUser?.(),
        undefined,
        { timeout: 10000 },
    );
}

test(
    "FTR-91b8f20c: stale Table creation source refuses without an orphan board",
    async ({ page, browser }, testInfo) => {
        test.setTimeout(180000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Unaffected neighbour"]);
        await createBlankGrid(page, "Tasks", "tasks");
        const pageUrl = page.url();

        const show = page.getByRole("button", { name: "Show sidebar" });
        if (await show.isVisible().catch(() => false)) await show.click();
        await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
        await expect(page).toHaveURL(/\/objects$/);
        await objectRow(page, "table").locator('[data-testid^="object-place-"]').click();
        await expect(page.getByTestId("object-placement-confirm")).toBeVisible();

        const peerContext = await browser.newContext({ storageState: TestHelpers.createTestStorageState() as any });
        const peer = await peerContext.newPage();
        await authenticatePeer(peer, pageUrl);
        const pageName = decodeURIComponent(new URL(pageUrl).pathname.split("/").at(-1)!);
        await TestHelpers.waitForPageData(peer, pageName, 30000);
        const peerShow = peer.getByRole("button", { name: "Show sidebar" });
        if (await peerShow.isVisible().catch(() => false)) await peerShow.click();
        await peer.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" }).click();
        await expect(peer).toHaveURL(/\/objects$/);
        await expect(objectRow(peer, "table")).toHaveCount(1, { timeout: 30000 });
        await objectRow(peer, "table").locator('[data-testid^="object-open-"]').click();
        await peer.getByRole("button", { name: "Delete table" }).click();
        await peer.getByRole("button", { name: "Delete table and keep references" }).click();
        await expect(objectRow(page, "table")).toHaveCount(0, { timeout: 30000 });

        await page.getByTestId("object-placement-confirm").click();
        await expect(objectRow(page, "kanban")).toHaveCount(0);
        await page.getByRole("button", { name: "Cancel" }).click();
        await page.locator("aside [data-page-id]").first().click();
        await expect(page.getByTestId("kanban-board")).toHaveCount(0);
        await expect(page.getByText("Unaffected neighbour", { exact: true })).toBeVisible();
        await peerContext.close();
    },
);
