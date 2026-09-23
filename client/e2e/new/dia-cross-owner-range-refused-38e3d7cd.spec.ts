import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-5311a0cd
 *  Title   : Native Mermaid source editing
 *  Source  : docs/client-features/dia-native-mermaid-source-editing-5311a0cd.yaml
 */
import { expect, type Page, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

async function snapshot(page: Page, diagramId: string) {
    return page.evaluate((id) => {
        const store = (globalThis as any).generalStore;
        const texts: string[] = [];
        for (const item of store.currentPage.items) {
            if (item.componentType !== "diagram") texts.push(item.text.toString());
        }
        const source = (globalThis as any).diagramService.getDiagram(store.project, id)?.source;
        return { texts, source };
    }, diagramId);
}

async function select(page: Page, start: [string, number], end: [string, number]) {
    await page.evaluate(([s, e]) => {
        (globalThis as any).editorOverlayStore.setSelection({
            startItemId: s[0],
            startOffset: s[1],
            endItemId: e[0],
            endOffset: e[1],
            userId: "local",
            isReversed: false,
        });
    }, [start, end] as const);
}

test.describe("FTR-5311a0cd: character ranges crossing a Diagram source boundary", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["", "tail", "more"]);
        await expect(page.locator(".outliner-item")).toHaveCount(4, { timeout: 10000 });
    });

    test("Diagram-to-Text ranges are refused unchanged; Text-only ranges still edit", async ({ page }) => {
        await page.locator(".outliner-item").nth(1).locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);
        await page.keyboard.type("/");
        await page.locator('[data-testid="command-item-diagram"]').click();
        const block = page.locator('[data-testid="diagram-block"]');
        await expect(block).toBeVisible({ timeout: 15000 });
        const diagramItemId = await page.locator(".outliner-item", { has: block }).getAttribute("data-item-id");
        const diagramId = (await block.getAttribute("data-diagram-id"))!;
        await page.evaluate((id) => {
            (globalThis as any).diagramService.setDiagramSource((globalThis as any).generalStore.project, id, "abcd");
        }, diagramId);
        await expect(page.locator('[data-testid="diagram-source"]')).toHaveText("abcd", { timeout: 10000 });

        const tailId = await page.locator(".outliner-item", { hasText: "tail" }).getAttribute("data-item-id");
        const moreId = await page.locator(".outliner-item", { hasText: "more" }).getAttribute("data-item-id");
        const before = await snapshot(page, diagramId);
        expect(before).toEqual({ texts: ["tail", "more"], source: "abcd" });

        await select(page, [diagramItemId!, 2], [tailId!, 2]);
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(300);
        expect(await snapshot(page, diagramId)).toEqual(before);

        await select(page, [diagramItemId!, 2], [tailId!, 2]);
        await page.keyboard.type("X");
        await page.waitForTimeout(300);
        expect(await snapshot(page, diagramId)).toEqual(before);

        // A Text-only range across two items is still an ordinary multi-item delete.
        await page.locator(".outliner-item", { hasText: "tail" }).locator(".item-content").click({ force: true });
        await page.waitForTimeout(300);
        await select(page, [tailId!, 2], [moreId!, 2]);
        await page.keyboard.press("Backspace");
        await expect.poll(() => snapshot(page, diagramId)).toEqual({ texts: ["tare"], source: "abcd" });
    });
});
