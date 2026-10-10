/** @feature KAN-4c82a1d7 */
import { expect, test } from "@playwright/test";
import { createKanbanThroughUi, createSourceThroughUi, openKanbanList } from "../utils/kanbanTestHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test("unknown identity never substitutes or creates a board", async ({ page }, testInfo) => {
    const seeded = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Kanban route boundary"]);
    await page.goto(`/${encodeURIComponent(seeded.projectName)}/-/kanbans/unknown-board`);
    await expect(page.getByTestId("kanban-not-found")).toBeVisible();
    await expect(page.getByTestId("kanban-board")).toHaveCount(0);
    const count = await page.evaluate(() =>
        (globalThis as any).__YJS_STORE__?.yjsClient?.getProject()?.ydoc?.getMap("yjsKanbans").size
    );
    expect(count).toBe(0);
});

test("a principal without the resource-side grant cannot disclose a private board", async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await createSourceThroughUi(page, testInfo);
    await openKanbanList(page, fixture.projectName);
    const id = await createKanbanThroughUi(page, "Private board", fixture.tableId);
    await page.locator("button.logout-btn").click();
    await expect(page.locator(".email-login-form")).toBeVisible({ timeout: 10000 });
    const stranger = `kanban-stranger-${Date.now()}@example.com`;
    await page.locator("#email").fill(stranger);
    await page.locator("#password").fill("password");
    await page.locator("button.email-login-btn").click();
    await expect(page.locator("button.logout-btn")).toBeVisible({ timeout: 10000 });
    await page.goto(`/${encodeURIComponent(fixture.projectName)}/-/kanbans/${id}`);
    await expect(page.getByTestId("kanban-board")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (globalThis as any).__USER_MANAGER__?.auth?.currentUser?.email))
        .toBe(stranger);
    await expect(page.getByTestId("kanban-source-table-link")).toHaveCount(0);
});
