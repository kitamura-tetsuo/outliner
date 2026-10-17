import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { createProject, login, stackFor } from "./helpers";
import type { OnPremProductionStack } from "./onpremProductionStack";
registerCoverageHooks();

test.describe("production on-premises workspace", () => {
    let stack: OnPremProductionStack;
    test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
        stack = stackFor(testInfo);
        await stack.start();
    });
    test.afterAll(async () => stack.stop());

    test("uses password sessions and canonical project registration, outline, reload, and rename", async ({ page, browser }) => {
        const cloudRequests: string[] = [];
        page.on("request", request => {
            if (/googleapis\.com|firebaseio\.com|google-analytics\.com/.test(request.url())) {
                cloudRequests.push(request.url());
            }
        });
        await login(page, stack, "wrong password");
        await expect(page.getByText("Incorrect password")).toBeVisible();

        await login(page, stack);
        await expect(page.locator("select.project-select option", { hasText: "No available projects" })).toHaveCount(1);
        const title = `Local-${Date.now()}`;
        await createProject(page, title);

        await page.getByLabel("New page name").fill("Inbox");
        await page.getByRole("button", { name: "Create new page" }).click();
        await expect(page).toHaveURL(new RegExp(`/${encodeURIComponent(title)}/Inbox$`));
        await page.getByTestId("add-item-button").click();
        const firstItem = page.getByTestId("outliner-base").locator(".outliner-item[data-item-id]").nth(1);
        await firstItem.click();
        await page.keyboard.type("Persistent outline");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Nested item");
        await page.keyboard.press("Enter");
        await expect(page.getByText("Persistent outline")).toBeVisible();
        await expect(page.getByText("Nested item")).toBeVisible();

        // A visible peer is the production-path persistence barrier: it proves
        // the real backend has received both edits before this client reloads.
        const peerContext = await browser.newContext();
        const peer = await peerContext.newPage();
        await login(peer, stack);
        await peer.goto(page.url());
        await expect(peer.getByText("Persistent outline")).toBeVisible();
        await expect(peer.getByText("Nested item")).toBeVisible();
        await peerContext.close();

        await page.reload();
        await expect(page.getByText("Persistent outline")).toBeVisible();
        await expect(page.getByText("Nested item")).toBeVisible();
        await expect(page.getByRole("button", { name: "Add Image" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Add new scheduled SQL" })).toHaveCount(0);

        await page.goto(`${stack.origin}/${encodeURIComponent(title)}/-/settings`);
        await page.getByLabel("Project Title").fill(`  ${title}-renamed  `);
        await page.getByRole("button", { name: "Save Changes" }).click();
        await expect(page).toHaveURL(new RegExp(`${encodeURIComponent(title)}-renamed/-/settings$`));
        await page.goto(stack.origin);
        await expect(page.locator("select.project-select option", { hasText: `${title}-renamed` })).toHaveCount(1);
        expect(cloudRequests).toEqual([]);
    });
});
