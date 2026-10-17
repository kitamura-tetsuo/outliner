import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { createProject, login, stackFor } from "./helpers";
import type { OnPremProductionStack } from "./onpremProductionStack";
registerCoverageHooks();

test.describe("production on-premises local boundaries", () => {
    let stack: OnPremProductionStack;
    test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
        stack = stackFor(testInfo);
        await stack.start();
    });
    test.afterAll(async () => stack.stop());

    test("hides the editor while the real logout response is pending", async ({ page }) => {
        await login(page, stack);
        await createProject(page, `Logout-${Date.now()}`);
        let release!: () => void;
        const delayed = new Promise<void>(resolve => release = resolve);
        await page.route("**/api/local-auth/logout", async route => {
            const response = await route.fetch();
            await delayed;
            await route.fulfill({ response });
        });
        await page.getByTestId("login-status-indicator").click();
        void page.getByTestId("user-menu-signout").click();
        await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible();
        await expect(page.locator(".outliner-item")).toHaveCount(0);
        release();
    });

    test("shows directory loading until the real listing response completes", async ({ page }) => {
        await login(page, stack);
        const title = `Directory-${Date.now()}`;
        await createProject(page, title);
        await page.getByTestId("login-status-indicator").click();
        await page.getByTestId("user-menu-signout").click();
        let release!: () => void;
        const delayed = new Promise<void>(resolve => release = resolve);
        await page.route("**/api/projects", async route => {
            if (route.request().method() !== "GET") return route.continue();
            const response = await route.fetch();
            await delayed;
            await route.fulfill({ response });
        });
        await login(page, stack);
        await expect(page.getByRole("status")).toHaveText("Loading...");
        await expect(page.locator("select.project-select option")).toHaveText("Loading projects...");
        await expect(page.getByText("No available projects")).toHaveCount(0);
        release();
        await expect(page.locator("select.project-select option", { hasText: title })).toHaveCount(1);
    });

    test("discards a session body that completes after login and logout", async ({ page }) => {
        await login(page, stack);
        const release = stack.delayNextSessionBody();
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible();
        await page.getByLabel("Password").fill(stack.password);
        await page.getByRole("button", { name: "Login", exact: true }).click();
        await expect(page.getByTestId("login-status-indicator")).toContainText("Local User");
        await page.getByTestId("login-status-indicator").click();
        await page.getByTestId("user-menu-signout").click();
        release();
        await page.waitForTimeout(500);
        await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible();
    });

    test("settles an in-flight response before backend restart", async ({ page }) => {
        await login(page, stack);
        stack.clearTransportEvents();
        const release = stack.delayNextSessionBody();
        void page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
        const headers = await stack.waitForTransportEvent("http-headers", "/api/local-auth/session");
        await stack.waitForDelayedSessionBody();

        await stack.restart();
        const cancellation = await stack.waitForTransportEvent("http-lifecycle-cancel", "/api/local-auth/session");
        expect(cancellation.id).toBe(headers.id);
        expect(stack.transportSnapshot().some(event => event.id === headers.id && event.kind === "http-upstream-error"))
            .toBe(false);
        release();
        await page.goto(stack.origin);
        await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible();
        await login(page, stack);
        await expect(page.getByTestId("login-status-indicator")).toContainText("Local User");
    });

    test("returns 503 when a fresh request cannot reach the backend", async ({ request }) => {
        await stack.shutdownBackend();
        const response = await request.get(`${stack.origin}/api/deployment`);
        expect(response.status()).toBe(503);
        expect(await response.text()).toBe("Backend unavailable");
        await stack.restart();
    });

    for (const demo of ["demo", "demo-ja"]) {
        test(`blocks ${demo} without reseeding or opening a document`, async ({ page }) => {
            const forbidden: string[] = [];
            page.on("request", request => {
                if (request.url().includes("seed-demo") || /googleapis\.com|firebaseio\.com/.test(request.url())) {
                    forbidden.push(request.url());
                }
            });
            page.on("websocket", socket => forbidden.push(socket.url()));
            await page.goto(`${stack.origin}/${demo}`);
            await expect(page.getByRole("heading", { name: "Unavailable in this deployment" })).toBeVisible();
            await page.waitForTimeout(500);
            expect(forbidden).toEqual([]);
        });
    }
});
