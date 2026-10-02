import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

/** @feature SLR-0008
 *  Title   : Selected Edge Case
 *  Source  : docs/client-features/slr-selected-edge-case-e818d989.yaml
 */

const LONG_TEXT =
    "This is a very long text that contains many characters and should be long enough to test the selection range functionality with long texts. "
    + "We want to make sure that the selection range works correctly with long texts and that the text is properly selected and copied.";
const SECOND_TEXT = "Second item text";
const SELECTION_LENGTH = 50;

test.describe("SLR-356b853a: Long text selection range", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [LONG_TEXT, SECOND_TEXT]);
        await TestHelpers.waitForOutlinerItems(page, 3, 10000);
    });

    test("Can create selection range for item containing long text", async ({ page }) => {
        test.setTimeout(120000);
        expect(LONG_TEXT.length).toBeGreaterThan(200);
        const expectedSelectionText = LONG_TEXT.slice(0, SELECTION_LENGTH);

        // Resolve the long-text item ID from the seeded model, not from a DOM ordinal.
        const seededItems = await page.evaluate((): Array<{ id: string; text: string; }> => {
            const gs = (globalThis as any).generalStore ?? (globalThis as any).appStore;
            const items = gs?.currentPage?.items;
            if (!items) return [];
            const length = typeof items.length === "number" ? items.length : 0;
            const result: Array<{ id: string; text: string; }> = [];
            for (let i = 0; i < length; i++) {
                const item = typeof items.at === "function" ? items.at(i) : items[i];
                if (item?.id !== undefined) result.push({ id: String(item.id), text: String(item?.text ?? "") });
            }
            return result;
        });
        const longTextEntry = seededItems.find(entry => entry.text === LONG_TEXT);
        expect(longTextEntry, "expected the seeded long-text item in the page model").toBeDefined();
        const itemId = longTextEntry!.id;

        // The model text and the rendered text must both equal the fixture before selecting.
        await expect.poll(async () => {
            return await page.evaluate((id: string): string | null => {
                const gs = (globalThis as any).generalStore ?? (globalThis as any).appStore;
                const items = gs?.currentPage?.items;
                if (!items) return null;
                const length = typeof items.length === "number" ? items.length : 0;
                for (let i = 0; i < length; i++) {
                    const item = typeof items.at === "function" ? items.at(i) : items[i];
                    if (item && String(item.id) === id) return String(item?.text ?? "");
                }
                return null;
            }, itemId);
        }, { timeout: 10000 }).toBe(LONG_TEXT);
        const renderedText = page.locator(`.outliner-item[data-item-id="${itemId}"] .item-text`);
        await expect.poll(async () => await renderedText.textContent(), { timeout: 10000 }).toBe(LONG_TEXT);

        // Reach the selection through real browser interaction.
        await page.locator(`.outliner-item[data-item-id="${itemId}"] .item-content`).click();
        expect(await TestHelpers.waitForCursorVisible(page)).toBe(true);
        await TestHelpers.ensureCursorReady(page);

        // Production local ownership is the literal userId "local".
        const localUserId = "local";

        await page.keyboard.press("Home");

        // The active local cursor must be at the start of the long-text item with no local selection.
        await expect.poll(async () => {
            return await page.evaluate((user: string) => {
                const store = (globalThis as any).editorOverlayStore;
                if (!store) return null;
                const cursors = Object.values(store.cursors ?? {}) as Array<any>;
                const local = cursors.find((cursor: any) =>
                    (cursor?.userId ?? "local") === user && cursor?.isActive === true
                );
                if (!local) return null;
                const localSelections = (Object.values(store.selections ?? {}) as Array<any>)
                    .filter((selection: any) => (selection?.userId ?? "local") === user).length;
                return {
                    userId: local.userId ?? "local",
                    itemId: local.itemId,
                    offset: local.offset,
                    isActive: local.isActive,
                    localSelections,
                };
            }, localUserId);
        }, { timeout: 10000 }).toEqual({ userId: localUserId, itemId, offset: 0, isActive: true, localSelections: 0 });

        await page.keyboard.down("Shift");
        try {
            for (let i = 0; i < SELECTION_LENGTH; i++) {
                await page.keyboard.press("ArrowRight");
            }
        } finally {
            await page.keyboard.up("Shift");
        }

        // Observe the endpoints and the extracted text from the same selection state.
        await expect.poll(async () => {
            return await page.evaluate((user: string) => {
                const store = (globalThis as any).editorOverlayStore;
                if (!store) return null;
                const local = (Object.values(store.selections ?? {}) as Array<any>)
                    .filter((selection: any) => (selection?.userId ?? "local") === user);
                if (local.length !== 1) return { localCount: local.length };
                const selection = local[0];
                return {
                    localCount: 1,
                    start: selection.start,
                    end: selection.end,
                    isReversed: selection.isReversed,
                    text: store.getTextFromSelection(selection),
                };
            }, localUserId);
        }, { timeout: 15000 }).toEqual({
            localCount: 1,
            start: { kind: "text", itemId, offset: 0 },
            end: { kind: "text", itemId, offset: SELECTION_LENGTH },
            isReversed: false,
            text: expectedSelectionText,
        });

        // A visible rendered selection bound to the checked long-text item is required.
        // A logical selection may render as several fragments, so only require one visible fragment.
        await expect(page.locator(`.editor-overlay .selection[data-selection-item-id="${itemId}"]`).first())
            .toBeVisible();

        // Selecting must not mutate the source text, in the model or in the render.
        const modelTextAfter = await page.evaluate((id: string): string | null => {
            const gs = (globalThis as any).generalStore ?? (globalThis as any).appStore;
            const items = gs?.currentPage?.items;
            if (!items) return null;
            const length = typeof items.length === "number" ? items.length : 0;
            for (let i = 0; i < length; i++) {
                const item = typeof items.at === "function" ? items.at(i) : items[i];
                if (item && String(item.id) === id) return String(item?.text ?? "");
            }
            return null;
        }, itemId);
        expect(modelTextAfter).toBe(LONG_TEXT);
        await expect.poll(async () => await renderedText.textContent(), { timeout: 10000 }).toBe(LONG_TEXT);
    });
});
