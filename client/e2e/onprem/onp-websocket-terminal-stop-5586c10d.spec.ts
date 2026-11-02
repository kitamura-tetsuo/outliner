import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { createProject, login, stackFor } from "./helpers";
registerCoverageHooks();

test("a held real socket callback cannot act on a replacement stack", async ({ browser }, testInfo) => {
    const stack = stackFor(testInfo);
    const context = await browser.newContext();
    const target = await context.newPage();
    await stack.start();
    try {
        await login(target, stack);
        await createProject(target, `Held-before-stop-${Date.now()}`);
        await target.getByLabel("New page name").fill("Live target");
        await target.getByRole("button", { name: "Create new page" }).click();
        await expect(target).toHaveURL(/\/Live%20target$/);
        const tunnel = stack.transportSnapshot().filter(event => event.kind === "ws-open").slice(-1)[0]!;
        expect(stack.isTunnelOpen(tunnel.id)).toBe(true);
        stack.controlTunnelTerminalOrder(tunnel.id, "ws-upstream-close");
        const held = stack.holdTunnelTerminalCallback(tunnel.id, "ws-client-close");
        const first = stack.waitForTransportEvent("ws-upstream-close", tunnel.url, { id: tunnel.id });
        await target.close();
        await Promise.all([held.observed, first]);
        expect(stack.isTunnelOpen(tunnel.id)).toBe(true);
        await stack.stop();
        expect(stack.isTunnelOpen(tunnel.id)).toBe(false);
        const stoppedEvents = stack.transportSnapshot();

        const replacement = stackFor(testInfo);
        expect(replacement.origin).toBe(stack.origin);
        await replacement.start();
        const replacementContext = await browser.newContext();
        try {
            const page = await replacementContext.newPage();
            await login(page, replacement);
            await createProject(page, `Replacement-${Date.now()}`);
            expect(() => held.release()).toThrow(`Tunnel ${tunnel.id} ended before its terminal callback was released`);
            expect(stack.transportSnapshot()).toEqual(stoppedEvents);
            await expect(page.getByLabel("New page name")).toBeVisible();
        } finally {
            await replacementContext.close();
            await replacement.stop();
        }
    } finally {
        await context.close();
        await stack.stop();
    }
});
