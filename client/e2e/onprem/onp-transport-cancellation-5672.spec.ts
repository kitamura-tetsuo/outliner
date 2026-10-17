import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { createProject, login, stackFor } from "./helpers";
import type { OnPremProductionStack } from "./onpremProductionStack";
registerCoverageHooks();

test.describe("production on-premises transport cancellation", () => {
    let stack: OnPremProductionStack;
    test.beforeAll(async ({ browserName: _browserName }, testInfo) => {
        stack = stackFor(testInfo);
        await stack.start();
    });
    test.afterAll(async () => stack.stop());

    test("settles a browser-cancelled session without disturbing another live client", async ({ browser, page }) => {
        const target = page;
        const unrelatedContext = await browser.newContext();
        const unrelated = await unrelatedContext.newPage();
        await login(target, stack);
        await login(unrelated, stack);
        const title = `Independent-${Date.now()}`;
        const beforeTunnel = stack.transportSnapshot().length;
        await createProject(unrelated, title);
        await unrelated.getByLabel("New page name").fill("Live peer");
        await unrelated.getByRole("button", { name: "Create new page" }).click();
        await expect(unrelated).toHaveURL(/\/Live%20peer$/);
        const unrelatedTunnel = stack.transportSnapshot().slice(beforeTunnel).filter(event => event.kind === "ws-open")
            .slice(-1)[0];
        expect(unrelatedTunnel, "the separately authenticated peer must establish its websocket").toBeDefined();
        expect(stack.isTunnelOpen(unrelatedTunnel!.id)).toBe(true);

        stack.clearTransportEvents();
        const release = stack.delayNextSessionBody();
        const navigation = target.reload({ waitUntil: "domcontentloaded" });
        const headers = await stack.waitForTransportEvent("http-headers", "/api/local-auth/session");
        await stack.waitForDelayedSessionBody();
        await target.close();
        await navigation.catch(() => {});
        release();
        const cancellation = await stack.waitForTransportEvent("http-client-abort", "/api/local-auth/session");
        expect(cancellation.id).toBe(headers.id);
        expect(stack.isTunnelOpen(unrelatedTunnel!.id)).toBe(true);

        await unrelated.getByTestId("add-item-button").click();
        const item = unrelated.getByTestId("outliner-base").locator(".outliner-item[data-item-id]").nth(1);
        await item.click();
        await unrelated.keyboard.type("Survived target cancellation");
        await expect(unrelated.getByText("Survived target cancellation")).toBeVisible();
        expect(stack.isTunnelOpen(unrelatedTunnel!.id)).toBe(true);

        await unrelated.goto(stack.origin);
        await expect(unrelated.locator("select.project-select option", { hasText: title })).toHaveCount(1);
        const subsequentTitle = `Still-live-${Date.now()}`;
        await createProject(unrelated, subsequentTitle);
        await expect(unrelated).toHaveURL(new RegExp(`/${encodeURIComponent(subsequentTitle)}$`));
        await unrelatedContext.close();
    });

    test("does not suppress an unexpected active-path failure", async () => {
        const playwright = path.resolve(import.meta.dirname, "../../node_modules/.bin/playwright");
        const cwd = path.resolve(import.meta.dirname, "../..");
        const failure = await promisify(execFile)(playwright, [
            "test",
            "--config",
            "playwright.onprem-negative.config.ts",
        ], { cwd }).then(
            () => undefined,
            error => error as Error & { code: number; stdout: string; },
        );
        expect(failure, "the isolated expected-success control must fail").toBeDefined();
        expect(failure!.code).toBe(1);
        expect(failure!.stdout).toContain("negative control preserves unexpected active-path failure");
        expect(failure!.stdout).toContain("1 failed");
    });

    test("closing one websocket owner leaves a separately authenticated tunnel live", async ({ browser }) => {
        const targetContext = await browser.newContext();
        const unrelatedContext = await browser.newContext();
        const target = await targetContext.newPage();
        const unrelated = await unrelatedContext.newPage();
        await login(target, stack);
        await login(unrelated, stack);

        const beforeTarget = stack.transportSnapshot().length;
        await createProject(target, `Target-socket-${Date.now()}`);
        await target.getByLabel("New page name").fill("Live target");
        await target.getByRole("button", { name: "Create new page" }).click();
        await expect(target).toHaveURL(/\/Live%20target$/);
        const targetTunnel = stack.transportSnapshot().slice(beforeTarget).filter(event => event.kind === "ws-open")
            .slice(-1)[0]!;
        const beforeUnrelated = stack.transportSnapshot().length;
        await createProject(unrelated, `Peer-socket-${Date.now()}`);
        await unrelated.getByLabel("New page name").fill("Live peer");
        await unrelated.getByRole("button", { name: "Create new page" }).click();
        await expect(unrelated).toHaveURL(/\/Live%20peer$/);
        const unrelatedTunnel = stack.transportSnapshot().slice(beforeUnrelated).filter(event =>
            event.kind === "ws-open"
        ).slice(-1)[0]!;
        expect(stack.isTunnelOpen(targetTunnel.id)).toBe(true);
        expect(stack.isTunnelOpen(unrelatedTunnel.id)).toBe(true);

        await targetContext.close();
        const closed = await stack.waitForTransportEvent("ws-client-close", targetTunnel.url);
        expect(closed.id).toBe(targetTunnel.id);
        expect(stack.isTunnelOpen(unrelatedTunnel.id)).toBe(true);
        expect(stack.transportSnapshot().some(event => event.id === unrelatedTunnel.id && event.kind.includes("close")))
            .toBe(false);

        await unrelated.getByTestId("add-item-button").click();
        const item = unrelated.getByTestId("outliner-base").locator(".outliner-item[data-item-id]").nth(1);
        await item.click();
        await unrelated.keyboard.type("Same tunnel remains live");
        await expect(unrelated.getByText("Same tunnel remains live")).toBeVisible();
        expect(stack.isTunnelOpen(unrelatedTunnel.id)).toBe(true);
        await unrelatedContext.close();
    });
});
