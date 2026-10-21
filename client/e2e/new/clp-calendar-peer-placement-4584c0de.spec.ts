/** @feature CLP-4584c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import { clickItemAndWaitForCursor, readGridProjectState } from "../utils/crossProjectGridHelpers";
import { mixedTransfer, transferHistory } from "../utils/mixedTransferHistory";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { afterNode, beforeNode, selectBetweenEndpoints } from "../utils/visualNodeSelectionHelpers";
registerCoverageHooks();

test("a peer Calendar-only shared placement refuses mixed Paste Undo until removed", async ({ page }, info) => {
    test.setTimeout(180000);
    const mixed = await mixedTransfer(page, info);
    const peer = await page.context().newPage();
    try {
        await peer.goto(page.url());
        await expect(peer.getByTestId("calendar-view")).toHaveCount(1, { timeout: 60000 });
        await peer.bringToFront();
        const placement = (await transferHistory(peer)).placements.find(p => p.objectId === mixed.id)!;
        await peer.locator("textarea.global-textarea").focus();
        await selectBetweenEndpoints(peer, beforeNode(placement.itemKey), afterNode(placement.itemKey));
        await peer.keyboard.press("Control+c");
        await clickItemAndWaitForCursor(
            peer,
            peer.locator(".outliner-item[data-item-id]").nth(1).locator(".item-content"),
        );
        await peer.keyboard.press("Control+v");
        await expect(peer.getByTestId("calendar-view")).toHaveCount(2);
        await expect(page.getByTestId("calendar-view")).toHaveCount(2);
        const before = await transferHistory(page);
        expect(Object.keys(before.calendars)).toEqual([mixed.id]);
        expect(before.placements.filter(p => p.objectId === mixed.id)).toHaveLength(2);
        const state = await readGridProjectState(page);
        await page.bringToFront();
        await page.getByTestId("toolbar-undo").click();
        expect(await transferHistory(page)).toEqual(before);
        expect(await readGridProjectState(page)).toEqual(state);
        await peer.bringToFront();
        await peer.getByTestId("toolbar-undo").click();
        await expect(page.getByTestId("calendar-view")).toHaveCount(1);
        await page.bringToFront();
        await page.getByTestId("toolbar-undo").click();
        await expect(page.getByTestId("calendar-view")).toHaveCount(0);
        await page.getByTestId("toolbar-redo").click();
        expect((await transferHistory(page)).calendars).toEqual(mixed.after.calendars);
        expect(await readGridProjectState(page)).toEqual(mixed.objects);
        await page.getByTestId("toolbar-undo").click();
        await expect(page.getByTestId("calendar-view")).toHaveCount(0);
        await info.attach("Calendar-shared-placement", {
            body: JSON.stringify({ mixed, before, state }),
            contentType: "application/json",
        });
    } finally {
        await peer.close();
    }
});
