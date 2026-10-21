/** @feature CLP-4584c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import { readClipboardBytes } from "../utils/clipboardTransferEvidence";
import {
    clickItemAndWaitForCursor,
    createBlankGrid,
    openProjectPage,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { transferHistory } from "../utils/mixedTransferHistory";
import { createBlockFromItem } from "../utils/nodeKindHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test("second Calendar allocation failure rolls back the real mixed Paste without history", async ({ page }, info) => {
    test.setTimeout(180000);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const fixture = await seedCrossProjectFixture(page, info);
    await createBlankGrid(page, "Owned", "owned");
    for (let i = 0; i < 2; i++) {
        await createBlockFromItem(page, page.locator(".outliner-item[data-item-id]").nth(1), "Calendar");
        await page.getByTestId("calendar-name-input").fill(`Calendar ${i}`);
        await page.getByTestId("calendar-create").click();
        await expect(page.getByTestId("calendar-view")).toHaveCount(i + 1);
    }
    // Structurally valid clipboard settings reach createCalendar's real timezone validation.
    await page.evaluate(() => {
        const calendars = [...(globalThis as any).generalStore.project.calendars.values()] as any[];
        for (const calendar of calendars) calendar.set("query", "SELECT id AS id FROM owned");
    });
    await page.locator("textarea.global-textarea").focus();
    await page.evaluate(() => {
        const g = globalThis as any;
        const nodes = [...g.generalStore.currentPage.items];
        g.editorOverlayStore.clearSelections();
        g.editorOverlayStore.setSelection({
            startItemId: nodes[0].id,
            startOffset: 0,
            endItemId: nodes[nodes.length - 1].id,
            endOffset: 0,
            userId: "local",
        });
    });
    await page.keyboard.press("Control+c");
    // Copy prepares the structural payload asynchronously. Observe its actual
    // portable flavor before reading or editing the newly captured settings.
    await expect.poll(() =>
        page.evaluate(async () => {
            const path = "/src/services/clipboard/itemClipboard.ts";
            const { structuredClipboardFromHtml } = await import(/* @vite-ignore */ path);
            const item = (await navigator.clipboard.read()).find(item => item.types.includes("text/html"));
            if (!item) return false;
            const encoded = structuredClipboardFromHtml(await (await item.getType("text/html")).text());
            if (!encoded) return false;
            const payload = JSON.parse(encoded);
            return payload.sourceProjectId === (globalThis as any).generalStore.project.ydoc.guid
                && Object.keys(payload.calendars ?? {}).length === 2;
        })
    ).toBe(true);
    // Corrupt only the second captured definition at the supported portable
    // clipboard boundary; leave both live source Calendars valid and renderable.
    await page.evaluate(async () => {
        const path = "/src/services/clipboard/itemClipboard.ts";
        const { structuredClipboardFromHtml, structuredClipboardHtml } = await import(/* @vite-ignore */ path);
        const items = await navigator.clipboard.read();
        const item = items.find(item => item.types.includes("text/html"))!;
        const html = await (await item.getType("text/html")).text();
        const text = await (await item.getType("text/plain")).text();
        const payload = JSON.parse(structuredClipboardFromHtml(html)!);
        const ids = Object.keys(payload.calendars);
        if (ids.length !== 2) throw new Error("fixture must copy two Calendars");
        payload.calendars[ids[1]].timezone = "invalid/timezone";
        await navigator.clipboard.write([
            new ClipboardItem({
                "text/plain": new Blob([text], { type: "text/plain" }),
                "text/html": new Blob([structuredClipboardHtml(JSON.stringify(payload), text)], { type: "text/html" }),
            }),
        ]);
    });
    const clipboard = await readClipboardBytes(page);
    const source = await transferHistory(page);
    await openProjectPage(page, fixture, "destination");
    await createBlankGrid(page, "Keep", "keep_records");
    const before = await transferHistory(page);
    const state = await readGridProjectState(page);
    await page.evaluate(() => {
        const g = globalThis as any;
        g.__calendarAllocations = [];
        g.generalStore.project.calendars.observe((event: any) => {
            for (const [id, change] of event.changes.keys) g.__calendarAllocations.push({ id, action: change.action });
        });
        (globalThis as any).__pasteRefused = false;
        addEventListener("clipboard-read-error", () => {
            (globalThis as any).__pasteRefused = true;
        }, { once: true });
    });
    await clickItemAndWaitForCursor(page, page.locator(".outliner-item[data-item-id]").nth(1).locator(".item-content"));
    await page.keyboard.press("Control+v");
    await expect.poll(() => page.evaluate(() => (globalThis as any).__pasteRefused)).toBe(true);
    const allocations = await page.evaluate(() => (globalThis as any).__calendarAllocations);
    expect(allocations.map((entry: any) => entry.action)).toEqual(["add", "delete"]);
    expect(allocations[0].id).toBe(allocations[1].id);
    expect(await transferHistory(page)).toEqual(before);
    expect(await readGridProjectState(page)).toEqual(state);
    expect(await readClipboardBytes(page)).toEqual(clipboard);
    await info.attach("partial-Calendar-rollback", {
        body: JSON.stringify({ source, before, state, allocations }),
        contentType: "application/json",
    });
});
