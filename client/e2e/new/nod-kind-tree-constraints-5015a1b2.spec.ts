import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5015a1b2
 *  Title   : Immutable outline node kinds with text owned only by Text nodes
 *  Source  : docs/client-features/nod-immutable-outline-node-kinds-5015a1b2.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * Grid and Calendar are leaf kinds and Text is not (#5015). The rules are
 * enforced on the structural paths themselves, so an invalid parenting cannot
 * exist even when the renderer would not draw it.
 */

/** Parent id of every outline item, read from the Yjs tree. */
const parentOf = (page: Page, itemId: string) =>
    page.evaluate((id) => {
        const page_ = (globalThis as any).generalStore.currentPage;
        const walk = (parent: any): string | undefined => {
            for (const child of parent.items) {
                if (child.id === id) return parent.id;
                const found = walk(child);
                if (found) return found;
            }
            return undefined;
        };
        return walk(page_);
    }, itemId);

test.describe("FTR-5015a1b2: kind-specific tree constraints", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["block host", "note"]);
        await TestHelpers.waitForOutlinerItems(page, 2);
    });

    async function makeBlock(page: Page, componentType: string) {
        await page.evaluate((type) => {
            const items = (globalThis as any).generalStore.currentPage.items;
            items.at(0).componentType = type;
        }, componentType);
        await page.waitForTimeout(300);
    }

    for (const [kind, componentType] of [["Grid", "yjstable"], ["Calendar", "calendar"]]) {
        test(`indenting under a ${kind} leaf is rejected and leaves the tree unchanged`, async ({ page }) => {
            await makeBlock(page, componentType);

            const noteId = await page.evaluate(() =>
                (globalThis as any).generalStore.currentPage.items.at(1).id as string
            );
            const pageId = await page.evaluate(() => (globalThis as any).generalStore.currentPage.id as string);

            await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${noteId}"] .item-text`);
            await page.keyboard.press("Tab");
            await page.waitForTimeout(400);

            expect(await parentOf(page, noteId)).toBe(pageId);
        });
    }

    test("a Text node still accepts an indented child", async ({ page }) => {
        const [hostId, noteId] = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            return [items.at(0).id as string, items.at(1).id as string];
        });

        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${noteId}"] .item-text`);
        await page.keyboard.press("Tab");
        await page.waitForTimeout(400);

        expect(await parentOf(page, noteId)).toBe(hostId);
    });

    test("a Layout rejects an indented Text node but renders a block child", async ({ page }) => {
        await makeBlock(page, "layout");
        const pageId = await page.evaluate(() => (globalThis as any).generalStore.currentPage.id as string);
        const noteId = await page.evaluate(() => (globalThis as any).generalStore.currentPage.items.at(1).id as string);

        await TestHelpers.clickItemToEdit(page, `.outliner-item[data-item-id="${noteId}"] .item-text`);
        await page.keyboard.press("Tab");
        await page.waitForTimeout(400);
        expect(await parentOf(page, noteId), "ordinary text stays out of the Layout").toBe(pageId);

        // A Grid, on the other hand, belongs in it and is drawn by the Layout.
        await page.evaluate(() => {
            const layout = (globalThis as any).generalStore.currentPage.items.at(0);
            layout.items.addNode("e2e").componentType = "yjstable";
        });
        await expect(page.getByTestId("layout-cell")).toHaveCount(1, { timeout: 15000 });
    });
});
