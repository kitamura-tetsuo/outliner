import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { createProject, login, stackFor } from "./helpers";
import { OnPremProductionStack } from "./onpremProductionStack";
registerCoverageHooks();

interface TransferResult {
    failed: boolean;
    status?: number;
    body?: string;
}

function readSession(page: import("@playwright/test").Page): Promise<TransferResult> {
    return page.evaluate(async () => {
        try {
            const response = await fetch("/api/local-auth/session");
            return { failed: false, status: response.status, body: await response.text() };
        } catch {
            return { failed: true };
        }
    });
}

test.describe("production on-premises HTTP lifecycle", () => {
    let stack: OnPremProductionStack;
    test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
        stack = stackFor(testInfo);
        await stack.start();
    });
    test.afterAll(async () => stack.stop());

    test("fails an interrupted body after headers and keeps the stack usable", async ({ page }) => {
        await login(page, stack);
        stack.clearTransportEvents();
        const release = stack.delayNextSessionBody();
        const browserHeaders = page.waitForResponse(response => response.url().endsWith("/api/local-auth/session"));
        const transfer = readSession(page);
        const gatewayHeaders = await stack.waitForTransportEvent("http-headers", "/api/local-auth/session");
        expect((await browserHeaders).status()).toBe(200);
        await stack.waitForDelayedSessionBody();

        await stack.restart();
        const result = await transfer;
        expect(result).toEqual({ failed: true });
        expect(
            stack.transportSnapshot().filter(event => event.id === gatewayHeaders.id && event.kind === "http-headers"),
        ).toHaveLength(1);
        expect(stack.transportSnapshot()).toContainEqual({
            id: gatewayHeaders.id,
            kind: "http-lifecycle-cancel",
            url: "/api/local-auth/session",
        });
        release();

        await page.goto(stack.origin);
        await login(page, stack);
        await expect(page.getByTestId("login-status-indicator")).toContainText("Local User");
    });

    test("a stopped stack cannot leak delayed work into its replacement", async ({ page }, testInfo) => {
        await login(page, stack);
        stack.clearTransportEvents();
        const releaseOldBody = stack.delayNextSessionBody();
        const oldTransfer = readSession(page);
        await stack.waitForTransportEvent("http-headers", "/api/local-auth/session");
        await stack.waitForDelayedSessionBody();

        const oldStack = stack;
        await oldStack.stop();
        const replacement = new OnPremProductionStack(testInfo.workerIndex);
        await replacement.start();
        stack = replacement;
        expect(replacement.originPort).toBe(oldStack.originPort);
        expect(replacement.backendPort).toBe(oldStack.backendPort);

        releaseOldBody();
        expect(await oldTransfer).toEqual({ failed: true });
        await page.goto(replacement.origin);
        await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible();
        await login(page, replacement);
        const title = `Replacement-${Date.now()}`;
        await createProject(page, title);
        await expect(page).toHaveURL(new RegExp(`/${encodeURIComponent(title)}$`));
    });
});
