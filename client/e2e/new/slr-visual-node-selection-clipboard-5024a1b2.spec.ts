import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature SLR-5024a1b2
 *  Title   : Visual nodes render inside an outline selection range
 *  Source  : docs/client-features/slr-visual-nodes-in-selection-5024a1b2.yaml
 */
import { expect, test } from "@playwright/test";
import {
    dragBetweenTextOffsets,
    seedVisualNodesAfterFirstItem,
    waitForStableGeometry,
} from "../utils/visualNodeSelectionHelpers";
import { itemIdByText, seedSelectionPage } from "../utils/visualNodeSelectionSeed";

test.describe("SLR-5024a1b2: copying a selection that spans a visual node", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        // A bound Calendar renders its whole view, which is taller than the
        // default viewport, and a drag can only reach an endpoint on screen.
        await page.setViewportSize({ width: 1280, height: 1400 });
        await seedSelectionPage(page, testInfo);
    });

    test("carries the visual node in the structured payload but writes no caption as text", async ({ page }) => {
        const alphaId = await itemIdByText(page, "Alpha text");
        const omegaId = await itemIdByText(page, "Omega text");
        await seedVisualNodesAfterFirstItem(page, [{ type: "calendar" }]);

        // Bind the block to a real Calendar, so the copy has an entity whose
        // display name could be mistaken for a caption.
        await page.getByTestId("calendar-name-input").fill("Team calendar");
        await page.getByTestId("calendar-create").click();
        await expect(page.getByTestId("calendar-create-panel")).toHaveCount(0, { timeout: 15000 });
        await waitForStableGeometry(page);

        await dragBetweenTextOffsets(page, { itemId: alphaId, offset: 6 }, { itemId: omegaId, offset: 5 });
        await page.keyboard.press("Control+c");
        await page.waitForTimeout(500);

        const copied = await page.evaluate(() => {
            // The private payload is only readable from the copy the editor
            // mirrors onto the page for tests; the plain flavor comes with it.
            // eslint-disable-next-line no-restricted-globals
            const copiedByEditor = window as unknown as {
                lastCopiedStructuredItems?: string;
                lastCopiedText?: string;
            };
            const encoded = copiedByEditor.lastCopiedStructuredItems;
            return {
                items: encoded
                    ? (JSON.parse(encoded) as { items: Array<{ text: string; componentType?: string; }>; }).items
                    : [],
                plainText: copiedByEditor.lastCopiedText ?? "",
            };
        });

        // The structured flavor carries the block itself...
        expect(copied.items.map(item => item.componentType)).toEqual([undefined, "calendar", undefined]);
        // ...with no outline text of its own (#5015).
        expect(copied.items[1].text).toBe("");

        // The plain text is the selected text and nothing else: the Calendar
        // between the endpoints leaves no line, and its name is not borrowed as
        // a caption for it (#5024). Where exactly the drag stopped inside the
        // last item is the mouse's business, so only the lines are pinned.
        const lines = copied.plainText.split("\n");
        expect(lines).toHaveLength(2);
        expect(lines[0]).toBe("text");
        expect("Omega text".startsWith(lines[1])).toBe(true);
        expect(copied.plainText).not.toContain("Team calendar");
    });
});
