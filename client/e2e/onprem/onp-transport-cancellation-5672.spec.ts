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

    test("settles a browser-cancelled session without disturbing another live client", async ({ browser }) => {
        const targetContext = await browser.newContext();
        const target = await targetContext.newPage();
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
        // Closing the owning context deterministically closes its pooled HTTP
        // connection as well as the page, rather than allowing Chromium to keep
        // the interrupted response's socket alive for reuse.
        const closingTarget = targetContext.close();
        const cancellation = await stack.waitForTransportEvent("http-client-abort", "/api/local-auth/session");
        release();
        await closingTarget;
        await navigation.catch(() => {});
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
        expect(failure!.stdout).toContain("ACTIVE_PATH_RESPONSE_STATUS=503");
        expect(failure!.stdout).toContain("ACTIVE_PATH_EXPECTED_SUCCESS_ASSERTION");
        expect(failure!.stdout).toContain("1 failed");
    });

    test("closing one websocket owner leaves a separately authenticated tunnel live", async ({ browser }) => {
        const unrelatedContext = await browser.newContext();
        const unrelated = await unrelatedContext.newPage();
        await login(unrelated, stack);

        const beforeUnrelated = stack.transportSnapshot().length;
        await createProject(unrelated, `Peer-socket-${Date.now()}`);
        await unrelated.getByLabel("New page name").fill("Live peer");
        await unrelated.getByRole("button", { name: "Create new page" }).click();
        await expect(unrelated).toHaveURL(/\/Live%20peer$/);
        const unrelatedTunnel = stack.transportSnapshot().slice(beforeUnrelated).filter(event =>
            event.kind === "ws-open"
        ).slice(-1)[0]!;
        expect(stack.isTunnelOpen(unrelatedTunnel.id)).toBe(true);

        for (const firstTerminal of ["ws-client-close", "ws-upstream-close"] as const) {
            const targetContext = await browser.newContext();
            const target = await targetContext.newPage();
            await login(target, stack);
            const beforeTarget = stack.transportSnapshot().length;
            await createProject(target, `Target-${firstTerminal}-${Date.now()}`);
            await target.getByLabel("New page name").fill("Live target");
            await target.getByRole("button", { name: "Create new page" }).click();
            await expect(target).toHaveURL(/\/Live%20target$/);
            const targetTunnel = stack.transportSnapshot().slice(beforeTarget).filter(event => event.kind === "ws-open")
                .slice(-1)[0]!;
            expect(stack.isTunnelOpen(targetTunnel.id)).toBe(true);
            stack.controlTunnelTerminalOrder(targetTunnel.id, firstTerminal);

            const clientClosed = stack.waitForTransportEvent("ws-client-close", targetTunnel.url, {
                id: targetTunnel.id,
                stage: `${firstTerminal} exact-target browser terminal observation`,
            });
            const cleanupPromise = stack.waitForTransportEvent("ws-cleanup-complete", targetTunnel.url, {
                id: targetTunnel.id,
                stage: `${firstTerminal} exact-target tunnel cleanup`,
            });
            await target.close();
            expect((await clientClosed).id).toBe(targetTunnel.id);
            expect((await cleanupPromise).id).toBe(targetTunnel.id);
            await targetContext.close();
            const terminals = stack.transportSnapshot().filter(event =>
                event.id === targetTunnel.id
                && (event.kind === "ws-client-close" || event.kind === "ws-upstream-close")
            );
            expect(terminals.map(event => event.kind)).toEqual([
                firstTerminal,
                firstTerminal === "ws-client-close" ? "ws-upstream-close" : "ws-client-close",
            ]);
            expect(stack.isTunnelOpen(targetTunnel.id)).toBe(false);
            expect(stack.isTunnelOpen(unrelatedTunnel.id)).toBe(true);
            expect(
                stack.transportSnapshot().some(event =>
                    event.id === unrelatedTunnel.id && event.kind.includes("close")
                ),
            ).toBe(false);
        }

        stack.clearTransportEvents();
        await unrelated.getByTestId("add-item-button").click();
        const item = unrelated.getByTestId("outliner-base").locator(".outliner-item[data-item-id]").nth(1);
        await item.click();
        await unrelated.keyboard.type("Same tunnel remains live");
        await unrelated.keyboard.press("Enter");
        await unrelated.keyboard.type("Transfer barrier");
        await unrelated.keyboard.press("Enter");
        await expect(unrelated.getByText("Same tunnel remains live")).toBeVisible();
        const roundTrip = await stack.waitForTransportEvent("ws-upstream-data", unrelatedTunnel.url);
        expect(roundTrip.id, "the same surviving tunnel must carry a real backend round trip").toBe(unrelatedTunnel.id);
        expect(stack.isTunnelOpen(unrelatedTunnel.id)).toBe(true);
        expect(stack.transportSnapshot().some(event => event.id === unrelatedTunnel.id && event.kind.includes("close")))
            .toBe(false);
        await unrelatedContext.close();
    });
});
