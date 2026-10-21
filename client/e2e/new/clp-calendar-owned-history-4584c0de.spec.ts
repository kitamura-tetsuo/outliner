/** @feature CLP-4584c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import { readClipboardBytes } from "../utils/clipboardTransferEvidence";
import { readGridProjectState } from "../utils/crossProjectGridHelpers";
import { mixedTransfer, transferHistory } from "../utils/mixedTransferHistory";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

for (const conflict of ["replacement", "redo-collision"] as const) {
    test(`mixed Paste refuses Calendar ${conflict} atomically`, async ({ page }, info) => {
        test.setTimeout(180000);
        const mixed = await mixedTransfer(page, info);
        const peer = await page.context().newPage();
        try {
            await peer.goto(page.url());
            await expect(peer.getByTestId("calendar-view")).toHaveCount(1, { timeout: 60000 });
            await page.evaluate(id => {
                const g = globalThis as any;
                g.__ownedCalendarEntry = g.generalStore.project.calendars.get(id);
            }, mixed.id);
            if (conflict === "replacement") {
                await peer.bringToFront();
                const show = peer.getByRole("button", { name: "Show sidebar" });
                if (await show.isVisible()) await show.click();
                await peer.locator('aside[aria-label="Main Sidebar"]').getByRole("link", { name: "Object Manager" })
                    .click();
                await peer.getByTestId(`object-delete-${mixed.id}`).click();
                await peer.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
                await expect.poll(async () => Object.keys((await transferHistory(peer)).calendars)).toEqual([]);
                await peer.goBack();
                await peer.getByTestId("toolbar-undo").click();
                await peer.evaluate(id => {
                    (globalThis as any).generalStore.project.calendars.get(id).set("name", "Peer Calendar");
                }, mixed.id);
                await expect.poll(() =>
                    page.evaluate(id => {
                        const g = globalThis as any;
                        const entry = g.generalStore.project.calendars.get(id);
                        return entry !== g.__ownedCalendarEntry && entry?.get("name") === "Peer Calendar";
                    }, mixed.id)
                ).toBe(true);
            } else {
                await page.bringToFront();
                await page.getByTestId("toolbar-undo").click();
                await expect.poll(async () => Object.keys((await transferHistory(peer)).calendars)).toEqual([]);
                await peer.evaluate(async id => {
                    const path = "/src/services/calendar/calendarService.ts";
                    const { createCalendar } = await import(/* @vite-ignore */ path);
                    createCalendar((globalThis as any).generalStore.project, {
                        calendarId: id,
                        name: "Peer collision",
                        query: "",
                    });
                }, mixed.id);
                await expect.poll(async () => (await transferHistory(page)).calendars[mixed.id]?.name).toBe(
                    "Peer collision",
                );
            }
            const state = await readGridProjectState(page);
            const history = await transferHistory(page);
            const clipboard = await readClipboardBytes(page);
            await page.getByTestId(conflict === "replacement" ? "toolbar-undo" : "toolbar-redo").click();
            expect(await readGridProjectState(page)).toEqual(state);
            expect(await transferHistory(page)).toEqual(history);
            expect(await readClipboardBytes(page)).toEqual(clipboard);
            await info.attach(`Calendar-${conflict}-evidence`, {
                body: JSON.stringify({ mixed, state, history }),
                contentType: "application/json",
            });
        } finally {
            await peer.close();
        }
    });
}
