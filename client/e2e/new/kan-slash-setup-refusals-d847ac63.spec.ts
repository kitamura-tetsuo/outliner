import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { setProductionReadOnly } from "../utils/gridNumericReadOnlyFixture";
import "../utils/registerAfterEachSnapshot";
import { expect, test } from "../fixtures/grid-render-trace";
import { openKanbanSetup, readSlashState } from "../utils/kanbanSlashHelpers";
import { TestHelpers } from "../utils/testHelpers";

test("abandoning, switching modes and invalid names create no definitions", async ({ page }, info) => {
    test.setTimeout(120000);
    await TestHelpers.seedProjectAndNavigate(page, info, ["Keep this text", ""]);
    const target = (await readSlashState(page)).placements.find(item => item.text === "Keep this text")!;
    const panel = await openKanbanSetup(page, target.id);
    const pending = await readSlashState(page);
    expect(pending.placements.find(item => item.id === target.id)?.text).toBe("Keep this text");
    for (const name of ["Existing Kanban", "New Kanban over Existing Table", "New Table"]) {
        await panel.getByRole("button", { name, exact: true }).click();
        expect(await readSlashState(page)).toEqual(pending);
    }
    for (const name of ["bad-name", "outline_items"]) {
        await panel.getByTestId("yjs-table-sql-name-input").fill(name);
        await panel.getByTestId("yjs-table-create").click();
        await expect(panel.getByTestId("yjs-table-create-error")).toBeVisible();
        expect(await readSlashState(page)).toEqual(pending);
    }
    await page.reload();
    await expect(page.getByTestId("kanban-create-panel")).toBeVisible({ timeout: 30000 });
    expect((await readSlashState(page)).boards).toEqual([]);
    expect((await readSlashState(page)).tables).toEqual([]);
});

test(
    "a peer deleting the selected Table leaves setup unbound and creates no board",
    async ({ page, browser }, info) => {
        test.setTimeout(180000);
        await TestHelpers.seedProjectAndNavigate(page, info, ["", ""]);
        const targets = (await readSlashState(page)).placements.filter(item => item.text === "");
        const first = await openKanbanSetup(page, targets[0].id);
        await first.getByTestId("yjs-table-create").click();
        await expect(page.getByTestId("kanban-board")).toHaveCount(1);
        const created = await readSlashState(page);
        const pending = await openKanbanSetup(page, targets[1].id);
        await pending.getByRole("button", { name: "New Kanban over Existing Table" }).click();
        await pending.getByLabel("Existing Table", { exact: true }).selectOption(created.tables[0].id);
        const context = await browser.newContext({ storageState: TestHelpers.createTestStorageState() as any });
        try {
            const peer = await context.newPage();
            await peer.addInitScript(() => {
                localStorage.setItem("VITE_IS_TEST", "true");
                localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
                localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
                (globalThis as any).__E2E__ = true;
            });
            await peer.goto(page.url());
            await peer.waitForFunction(() => !!(globalThis as any).__USER_MANAGER__);
            await peer.evaluate(async () =>
                (globalThis as any).__USER_MANAGER__.loginWithEmailPassword("test@example.com", "password")
            );
            await peer.waitForFunction(() => !!(globalThis as any).__USER_MANAGER__?.getCurrentUser?.());
            await expect(peer.getByTestId("kanban-board")).toHaveCount(1, { timeout: 30000 });
            await expect(peer.getByTestId("kanban-create-panel")).toBeVisible();
            const show = peer.getByRole("button", { name: "Show sidebar" });
            if (await show.isVisible().catch(() => false)) await show.click();
            await peer.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" })
                .click();
            const row = peer.getByTestId(`object-row-${created.tables[0].id}`);
            await row.locator('[data-testid^="object-open-"]').click();
            await peer.getByRole("button", { name: "Delete table" }).click();
            const dialog = peer.getByRole("dialog", { name: /Delete table/ });
            await expect(dialog).toContainText("Kanbans reading this table (1)");
            await dialog.getByRole("button", { name: "Delete table and keep references", exact: true }).click();
            await expect(dialog).toHaveCount(0);
            await expect(pending.getByLabel("Existing Table", { exact: true }).getByRole("option", { name: /tasks/i }))
                .toHaveCount(0, { timeout: 30000 });
            const before = await readSlashState(page);
            await pending.getByRole("button", { name: "Create Kanban", exact: true }).click();
            await expect(pending.getByRole("alert")).toContainText("no longer available");
            expect(await readSlashState(page)).toEqual(before);
            expect(before.boards).toHaveLength(1);
        } finally {
            await context.close();
        }
    },
);

test("a production read-only transition refuses a pending preset without adding history", async ({ page }, info) => {
    test.setTimeout(120000);
    await TestHelpers.seedProjectAndNavigate(page, info, [""]);
    const target = (await readSlashState(page)).placements.find(item => item.text === "")!;
    const panel = await openKanbanSetup(page, target.id);
    await setProductionReadOnly(page, true);
    await expect(page.locator(".reset-banner")).toBeVisible();
    const before = await readSlashState(page);
    const history = () =>
        page.evaluate(() => {
            const router = (globalThis as any).globalUndoRouter;
            return [router.undoDepth, router.redoDepth];
        });
    const depths = await history();
    await panel.getByTestId("yjs-table-create").click();
    await expect(panel.getByTestId("yjs-table-create-error")).toContainText("read-only");
    expect(await readSlashState(page)).toEqual(before);
    expect(await history()).toEqual(depths);
    await setProductionReadOnly(page, false);
    await expect(page.locator(".reset-banner")).toBeHidden();
    await panel.getByTestId("yjs-table-create").click();
    await expect(page.getByTestId("kanban-board")).toBeVisible();
});
