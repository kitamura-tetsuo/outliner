import { expect, test } from "@playwright/test";
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

        const orders = [undefined, "ws-client-close", "ws-upstream-close"] as const;
        for (const firstTerminal of orders) {
            const targetContext = await browser.newContext();
            const target = await targetContext.newPage();
            await login(target, stack);
            const beforeTarget = stack.transportSnapshot().length;
            await createProject(target, `Target-${firstTerminal ?? "uncontrolled"}-${Date.now()}`);
            await target.getByLabel("New page name").fill("Live target");
            await target.getByRole("button", { name: "Create new page" }).click();
            await expect(target).toHaveURL(/\/Live%20target$/);
            const targetTunnel = stack.transportSnapshot().slice(beforeTarget).filter(event => event.kind === "ws-open")
                .slice(-1)[0]!;
            expect(stack.isTunnelOpen(targetTunnel.id)).toBe(true);
            if (firstTerminal) stack.controlTunnelTerminalOrder(targetTunnel.id, firstTerminal);
            const secondTerminal = firstTerminal === "ws-client-close" ? "ws-upstream-close" : "ws-client-close";
            const callbackBarrier = firstTerminal
                ? stack.holdTunnelTerminalCallback(targetTunnel.id, secondTerminal)
                : undefined;
            const firstObserved = firstTerminal
                ? stack.waitForTransportEvent(firstTerminal, targetTunnel.url, { id: targetTunnel.id })
                : undefined;

            const clientClosed = stack.waitForTransportEvent("ws-client-close", targetTunnel.url, {
                id: targetTunnel.id,
                stage: `${firstTerminal ?? "uncontrolled"} exact-target browser terminal observation`,
            });
            const cleanupPromise = stack.waitForTransportEvent("ws-cleanup-complete", targetTunnel.url, {
                id: targetTunnel.id,
                stage: `${firstTerminal ?? "uncontrolled"} exact-target tunnel cleanup`,
            });
            await target.close();
            if (callbackBarrier) {
                // Both signals come from real sockets. Let the already-scheduled
                // cleanup turn run while only the second observation is held.
                await Promise.all([firstObserved, callbackBarrier.observed]);
                await new Promise<void>(resolve => setImmediate(resolve));
                expect(stack.isTunnelOpen(targetTunnel.id)).toBe(true);
                expect(
                    stack.transportSnapshot().some(event =>
                        event.id === targetTunnel.id && event.kind === "ws-cleanup-complete"
                    ),
                ).toBe(false);
                callbackBarrier.release();
            }
            expect((await clientClosed).id).toBe(targetTunnel.id);
            expect((await cleanupPromise).id).toBe(targetTunnel.id);
            await targetContext.close();
            if (firstTerminal) {
                const lifecycle = stack.transportSnapshot().filter(event =>
                    event.id === targetTunnel.id
                    && ["ws-client-close", "ws-upstream-close", "ws-cleanup-complete"].includes(event.kind)
                );
                expect(lifecycle.map(event => event.kind)).toEqual([
                    firstTerminal,
                    firstTerminal === "ws-client-close" ? "ws-upstream-close" : "ws-client-close",
                    "ws-cleanup-complete",
                ]);
            }
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
