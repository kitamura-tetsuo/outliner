import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5311a0cd
 *  Title   : Native Mermaid source editing
 *  Source  : docs/client-features/dia-native-mermaid-source-editing-5311a0cd.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import {
    insertDiagram,
    insertTransclusion,
    localCursors,
    readSource,
    seedSource,
    sourceView,
} from "../utils/diagramTestHelpers";
import { TestHelpers } from "../utils/testHelpers";

// Page: Text A, occurrence D1, Text B, occurrence D2 of the same Diagram, Text C.
async function setup(page: Page, source: string) {
    const rows = page.locator(".outliner-item");
    const { diagramId, occurrenceId: d1 } = await insertDiagram(page, rows.nth(2));
    await seedSource(page, diagramId, source);
    const d2 = await insertTransclusion(page, rows.nth(4));
    const itemId = (text: string) => page.locator(".outliner-item", { hasText: text }).getAttribute("data-item-id");
    return { diagramId, d1, d2, b: (await itemId("B1234"))!, c: (await itemId("C1234"))! };
}

async function caretInText(page: Page, text: string, offset: number) {
    await page.locator(".outliner-item", { hasText: text }).locator(".item-content").click({ force: true });
    await page.keyboard.press("Home");
    for (let i = 0; i < offset; i++) await page.keyboard.press("ArrowRight");
}

const at = async (page: Page, key: string) => {
    await page.keyboard.press(key);
    return localCursors(page);
};
const undoDepth = (page: Page) => page.evaluate(() => (globalThis as any).globalUndoRouter?.undoDepth ?? -1);

test.describe("FTR-5311a0cd: navigation continues from the occurrence the cursor entered", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["A1234", "", "B1234", "", "C1234"]);
        await expect(page.locator(".outliner-item")).toHaveCount(6, { timeout: 10000 });
    });

    test("vertical entry keeps the column, and leaving D2 reaches C (not B or D1)", async ({ page }) => {
        const { diagramId, d1, d2, b, c } = await setup(page, "ab\ncd");
        await caretInText(page, "B1234", 1);
        const depth = await undoDepth(page);

        expect(await at(page, "ArrowDown")).toEqual([{ itemId: d2, offset: 1 }]);
        await expect(sourceView(page, d1)).toHaveText("ab\ncd"); // the reflection paints too
        expect(await at(page, "ArrowDown")).toEqual([{ itemId: d2, offset: 4 }]);
        expect(await at(page, "ArrowDown")).toEqual([{ itemId: c, offset: 1 }]);

        expect(await at(page, "ArrowUp")).toEqual([{ itemId: d2, offset: 4 }]);
        expect(await at(page, "ArrowUp")).toEqual([{ itemId: d2, offset: 1 }]);
        expect(await at(page, "ArrowUp")).toEqual([{ itemId: b, offset: 1 }]);

        // Switching presentation with no edits changes no persistent state or history.
        await expect(page.getByTestId("diagram-source")).toHaveCount(0);
        expect(await readSource(page, diagramId)).toBe("ab\ncd");
        expect(await undoDepth(page)).toBe(depth);
    });

    test("horizontal boundaries enter at the source start/end and exit to the adjacent row", async ({ page }) => {
        const { d2, b, c } = await setup(page, "ab\ncd");
        await caretInText(page, "B1234", 5);
        expect(await at(page, "ArrowRight")).toEqual([{ itemId: d2, offset: 0 }]);
        expect(await at(page, "ArrowLeft")).toEqual([{ itemId: b, offset: 5 }]);

        await caretInText(page, "C1234", 0);
        expect(await at(page, "ArrowLeft")).toEqual([{ itemId: d2, offset: 5 }]);
        expect(await at(page, "ArrowRight")).toEqual([{ itemId: c, offset: 0 }]);
    });

    test("an empty source is entered at offset zero and left below", async ({ page }) => {
        const { d2, c } = await setup(page, "");
        await caretInText(page, "B1234", 3);
        expect(await at(page, "ArrowDown")).toEqual([{ itemId: d2, offset: 0 }]);
        await expect(sourceView(page, d2)).toHaveText("");
        const next = await at(page, "ArrowDown");
        expect(next).toHaveLength(1);
        expect(next[0].itemId).toBe(c);
    });
});
