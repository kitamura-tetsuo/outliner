import { expect, test } from "@playwright/test";
import { createProject, login, stackFor } from "./helpers";
import type { OnPremProductionStack } from "./onpremProductionStack";

test.describe("production on-premises Table and Grid rooms", () => {
    let stack: OnPremProductionStack;
    test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
        stack = stackFor(testInfo);
        await stack.start();
    });
    test.afterAll(async () => stack.stop());

    test("persists Table text/Boolean rows and renders the bound Grid in another browser", async ({ page, browser }) => {
        await login(page, stack);
        const title = `Data-${Date.now()}`;
        await createProject(page, title);
        await page.getByLabel("New page name").fill("Data");
        await page.getByRole("button", { name: "Create new page" }).click();
        await expect(page).toHaveURL(new RegExp(`/${encodeURIComponent(title)}/Data$`));
        await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
        const panel = page.getByTestId("yjs-table-create-panel").first();
        await panel.getByTestId("yjs-table-name-input").fill("Tasks");
        await panel.getByTestId("yjs-table-preset-select").selectOption("blank");
        await panel.getByTestId("yjs-table-create").click();
        const grid = page.getByTestId("yjs-table-grid").first();
        await page.getByTestId("yjs-table-add-row").first().click();
        const row = grid.locator("tbody tr").last();
        await row.locator("td[data-col='title'] button").click();
        await row.locator("td[data-col='title'] input").fill("Ship local mode");
        await page.keyboard.press("Enter");
        await row.locator("td[data-col='done'] input[type=checkbox]").check();

        const peer = await browser.newPage();
        await login(peer, stack);
        await peer.goto(page.url());
        const peerRow = peer.getByTestId("yjs-table-grid").first().locator("tbody tr", { hasText: "Ship local mode" });
        await expect(peerRow).toBeVisible();
        await expect(peerRow.locator("td[data-col='done'] input[type=checkbox]")).toBeChecked();
        await row.locator("td[data-col='done'] input[type=checkbox]").uncheck();
        await expect(peerRow.locator("td[data-col='done'] input[type=checkbox]")).not.toBeChecked();
        await peer.close();
    });
});
