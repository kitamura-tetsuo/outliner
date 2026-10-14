import { expect, test } from "@playwright/test";
import { createProject, login, stackFor } from "./helpers";
import type { OnPremProductionStack } from "./onpremProductionStack";

test.describe("production on-premises session ordering and failure states", () => {
    let stack: OnPremProductionStack;
    test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
        stack = stackFor(testInfo);
        await stack.start();
    });
    test.afterAll(async () => stack.stop());

    test("does not let a delayed real directory response reopen the editor after logout", async ({ page }) => {
        await login(page, stack);
        const title = `Race-${Date.now()}`;
        await createProject(page, title);
        await page.goto(stack.origin);

        let loggedOut = false;
        let socketOpenedAfterLogout = false;
        page.on("websocket", () => {
            if (loggedOut) socketOpenedAfterLogout = true;
        });
        let release!: () => void;
        const delayed = new Promise<void>(resolve => {
            release = resolve;
        });
        await page.route("**/api/projects/resolve?title=*", async route => {
            const realResponse = await route.fetch();
            await delayed;
            await route.fulfill({ response: realResponse });
        });
        const navigation = page.goto(`${stack.origin}/${encodeURIComponent(title)}`);
        await page.waitForRequest("**/api/projects/resolve?title=*");
        await page.getByTestId("login-status-indicator").click();
        await page.getByTestId("user-menu-signout").click();
        loggedOut = true;
        release();
        await navigation;

        await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible();
        await expect(page.locator(".outliner-item")).toHaveCount(0);
        expect(socketOpenedAfterLogout).toBe(false);
        await page.waitForTimeout(500);
        await expect(page.locator(".outliner-item")).toHaveCount(0);
    });

    test("does not let a delayed page-route response reopen the editor after logout", async ({ page }) => {
        await login(page, stack);
        const title = `PageRace-${Date.now()}`;
        await createProject(page, title);
        await page.getByLabel("New page name").fill("Delayed");
        await page.getByRole("button", { name: "Create new page" }).click();
        await expect(page).toHaveURL(new RegExp(`/${encodeURIComponent(title)}/Delayed$`));
        await page.goto(stack.origin);

        let loggedOut = false;
        let socketOpenedAfterLogout = false;
        page.on("websocket", () => {
            if (loggedOut) socketOpenedAfterLogout = true;
        });
        let release!: () => void;
        const delayed = new Promise<void>(resolve => release = resolve);
        await page.route("**/api/projects/resolve?title=*", async route => {
            const realResponse = await route.fetch();
            await delayed;
            await route.fulfill({ response: realResponse });
        });
        const navigation = page.goto(`${stack.origin}/${encodeURIComponent(title)}/Delayed`);
        await page.waitForRequest("**/api/projects/resolve?title=*");
        await page.getByTestId("login-status-indicator").click();
        await page.getByTestId("user-menu-signout").click();
        loggedOut = true;
        release();
        await navigation;

        await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible();
        await expect(page.locator(".outliner-item")).toHaveCount(0);
        expect(socketOpenedAfterLogout).toBe(false);
    });

    test("requires login after backend restart but retains the registered project", async ({ page }) => {
        await login(page, stack);
        const title = `Restart-${Date.now()}`;
        await createProject(page, title);
        await stack.restart();
        await page.reload();
        await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible();
        await login(page, stack);
        await expect(page.locator("select.project-select option", { hasText: title })).toHaveCount(1);
    });

    test("shows a failed rename while the real backend is unavailable without claiming success", async ({ page }) => {
        await login(page, stack);
        const title = `Unavailable-${Date.now()}`;
        await createProject(page, title);
        await page.goto(`${stack.origin}/${encodeURIComponent(title)}/-/settings`);
        await page.getByLabel("Project Title").fill(`${title}-lost`);
        await stack.shutdownBackend();
        await page.getByRole("button", { name: "Save Changes" }).click();
        await expect(page.getByText("An error occurred while saving.")).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`${encodeURIComponent(title)}/-/settings$`));
    });

    test("blocks direct schedule navigation without rendering mutation controls", async ({ page }) => {
        await stack.restart();
        await login(page, stack);
        const title = `Unsupported-${Date.now()}`;
        await createProject(page, title);
        await page.goto(`${stack.origin}/${encodeURIComponent(title)}/-/schedules`);

        await expect(page.getByRole("heading", { name: "Unavailable in this deployment" })).toBeVisible();
        await expect(page.getByRole("button", { name: /schedule|create/i })).toHaveCount(0);

        await page.goto(`${stack.origin}/${encodeURIComponent(title)}/-/schedules/not-a-rule`);
        await expect(page.getByRole("heading", { name: "Unavailable in this deployment" })).toBeVisible();
        await expect(page.getByRole("button", { name: /schedule|create|save|run/i })).toHaveCount(0);
    });
});
