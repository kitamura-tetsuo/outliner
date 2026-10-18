import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5514c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import {
    pointGridAToTableB,
    seedOverlappingTableFixture,
    snapshotProject,
} from "../utils/gridMutationProvenanceHelpers";
import { TestHelpers } from "../utils/testHelpers";

for (const change of ["logout", "access revocation"] as const) {
    test(
        `cached standalone Grid data and pending deletion are gated after ${change}`,
        async ({ page, browser }, testInfo) => {
            test.setTimeout(180000);
            const fixture = await seedOverlappingTableFixture(page, testInfo);
            await pointGridAToTableB(page, fixture);
            const gridId = await fixture.gridA.getAttribute("data-grid-id");
            const pageUrl = page.url();
            const peerContext = await browser.newContext({ storageState: TestHelpers.createTestStorageState() as any });
            await peerContext.addInitScript(() => {
                localStorage.setItem("VITE_IS_TEST", "true");
                localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
                localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
                (globalThis as any).__E2E__ = true;
            });
            const peer = await peerContext.newPage();
            try {
                await peer.goto(pageUrl);
                await expect(peer.getByTestId("yjs-table-view")).toHaveCount(2);
                await expect.poll(async () =>
                    (await snapshotProject(peer)).tables.find(table => table.id === fixture.tableB.id)
                        ?.data[fixture.recordId]?.title
                ).toBe("Value from B");
                const before = (await snapshotProject(peer)).tables.map(table => ({ id: table.id, data: table.data }));
                const show = page.getByRole("button", { name: "Show sidebar" });
                if (await show.isVisible()) await show.click();
                await page.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" })
                    .click();
                await page.getByTestId(`object-row-${gridId}`).locator('[data-testid^="object-open-"]').click();
                const view = page.getByTestId("yjs-table-view");
                await expect(view.locator(`td[data-record-id="${fixture.recordId}"][data-col="title"] button`))
                    .toHaveText("Value from B");
                await view.getByTestId("yjs-table-toggle-ui").click();
                await view.getByLabel("Confirm before deleting rows").check();
                await view.getByRole("button", { name: `Delete row ${fixture.recordId}`, exact: true }).click();
                await expect(page.getByRole("alertdialog")).toBeVisible();
                if (change === "logout") {
                    // The native modal correctly blocks Logout behind it.
                    // Invoke the same production authentication service in this
                    // browser context; no auth flag or notification is fabricated.
                    await page.evaluate(() => (globalThis as any).__USER_MANAGER__.logout());
                    await expect.poll(() => page.evaluate(() => (globalThis as any).__USER_MANAGER__.getCurrentUser()))
                        .toBeNull();
                } else {
                    const projectId = (await snapshotProject(page)).guid;
                    const response = await page.request.patch(
                        `http://127.0.0.1:58080/v1/projects/outliner-d57b0/databases/(default)/documents/projectUsers/${projectId}?updateMask.fieldPaths=accessibleUserIds`,
                        {
                            headers: { Authorization: "Bearer owner" },
                            data: { fields: { accessibleUserIds: { arrayValue: { values: [] } } } },
                        },
                    );
                    expect(response.ok()).toBe(true);
                    // Refresh the existing authoritative directory consumer after
                    // the emulator administrator changes this fixture's real ACL.
                    await page.evaluate(() => (globalThis as any).__PROJECT_STORE__.refresh());
                }
                await expect(page.getByTestId("yjs-table-view")).toHaveCount(0);
                await expect(page.getByRole("alertdialog")).toHaveCount(0);
                await expect(page.getByText("Value from B", { exact: true })).toHaveCount(0);
                await expect(page.getByRole("heading", { name: /Login required|Access denied/ })).toBeVisible();
                expect((await snapshotProject(peer)).tables.map(table => ({ id: table.id, data: table.data }))).toEqual(
                    before,
                );
            } finally {
                await peerContext.close();
            }
        },
    );
}
